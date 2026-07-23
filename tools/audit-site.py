#!/usr/bin/env python3
"""RoboRacer static-site audit.

Validates the repository (or a built artifact) for the things that break a
static marketing site in production: dead internal links, missing assets,
duplicate or absent SEO metadata, wrong canonical host, broken structured
data, brand leakage from the AmbiSecure reference site, and localhost URLs.

Standard library only — no install step, so it runs identically on a laptop
and on a GitHub Actions runner.

Usage:
    python3 tools/audit-site.py                 # audit the repo
    python3 tools/audit-site.py --root dist/…   # audit a built artifact
    python3 tools/audit-site.py --json          # machine-readable output

Exit codes:
    0  no errors (warnings may still be printed)
    1  one or more errors
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlparse

CANONICAL_HOST = "roboracer.ambimat.com"
CANONICAL_ORIGIN = f"https://{CANONICAL_HOST}"

# Files that must exist in any deployable tree.
REQUIRED_ROOT_FILES = [
    "index.html",
    "404.html",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
    ".htaccess",
]

# Pages excluded from "must be indexable / must be in sitemap" rules.
NOINDEX_PAGES = {"404.html"}

# Brand-leakage patterns. The literal word "AmbiSecure" is legitimate on this
# site — contact.html lists it among Ambimat's OEM solution brands — so only
# AmbiSecure *infrastructure* (its domain and its asset paths) is banned.
BRAND_LEAK_PATTERNS = [
    (re.compile(r"ambisecure\.ambimat\.com", re.I), "AmbiSecure production domain"),
    (re.compile(r"/assets/img/ambisecure[\w-]*", re.I), "AmbiSecure image asset path"),
    (re.compile(r"ambisecure-logo", re.I), "AmbiSecure logo asset"),
    (re.compile(r"--secure-cyan", re.I), "AmbiSecure-only design token"),
    (re.compile(r"G-[A-Z0-9]{10}", 0), None),  # handled separately (analytics id)
]

ALLOWED_ANALYTICS_IDS = {"G-03T01GG8K1", "G-KCRP2C9ZCL"}

LOCALHOST_PATTERN = re.compile(
    r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?", re.I
)

# Attributes that reference a file the browser must be able to fetch.
ASSET_ATTRS = {
    "img": ["src"],
    "source": ["srcset"],
    "script": ["src"],
    "link": ["href"],
    "video": ["src", "poster"],
    "audio": ["src"],
    "iframe": ["src"],
}

VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class PageParser(HTMLParser):
    """Collects everything the audit needs in a single pass."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.in_title = False
        self.title: str | None = None

        self.lang: str | None = None
        self.metas: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []   # <link> elements
        self.anchors: list[dict[str, str]] = []  # <a> elements
        self.images: list[dict[str, str]] = []
        self.headings: list[tuple[int, str]] = []
        self.ids: set[str] = set()
        self.assets: list[tuple[str, str]] = []  # (tag, url)
        self.jsonld: list[str] = []
        self.in_jsonld = False
        self.inline_handlers: list[str] = []
        self.landmarks: set[str] = set()

        self._heading_level: int | None = None
        self._heading_text: list[str] = []
        self._jsonld_buf: list[str] = []

    # -- helpers ---------------------------------------------------------
    @staticmethod
    def _attrs(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
        return {k.lower(): (v if v is not None else "") for k, v in attrs}

    def _record_assets(self, tag: str, a: dict[str, str]) -> None:
        for attr in ASSET_ATTRS.get(tag, []):
            value = a.get(attr, "")
            if not value:
                continue
            if attr == "srcset":
                for candidate in value.split(","):
                    url = candidate.strip().split(" ")[0]
                    if url:
                        self.assets.append((tag, url))
            else:
                self.assets.append((tag, value))

    # -- HTMLParser hooks ------------------------------------------------
    def handle_starttag(self, tag, attrs):
        a = self._attrs(attrs)

        if a.get("id"):
            self.ids.add(a["id"])
        for key in a:
            if key.startswith("on"):
                self.inline_handlers.append(f"<{tag} {key}>")

        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "title":
            self.in_title = True
        elif tag == "meta":
            self.metas.append(a)
        elif tag == "link":
            self.links.append(a)
        elif tag == "a":
            self.anchors.append(a)
        elif tag == "img":
            self.images.append(a)
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._heading_level = int(tag[1])
            self._heading_text = []
        elif tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self.in_jsonld = True
            self._jsonld_buf = []
        elif tag in {"main", "header", "footer", "nav"}:
            self.landmarks.add(tag)

        self._record_assets(tag, a)

        if tag in VOID_ELEMENTS:
            self._heading_level = self._heading_level  # no-op; keeps flow explicit

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
            self.title = "".join(self.title_parts).strip()
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"} and self._heading_level:
            text = " ".join("".join(self._heading_text).split())
            self.headings.append((self._heading_level, text))
            self._heading_level = None
        elif tag == "script" and self.in_jsonld:
            self.in_jsonld = False
            self.jsonld.append("".join(self._jsonld_buf))

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)
        if self._heading_level:
            self._heading_text.append(data)
        if self.in_jsonld:
            self._jsonld_buf.append(data)


class Audit:
    def __init__(self, root: pathlib.Path) -> None:
        self.root = root
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.pages: dict[str, PageParser] = {}

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}: {message}")

    # -- discovery -------------------------------------------------------
    def html_files(self) -> list[pathlib.Path]:
        skip = {"node_modules", ".git", ".github", "tools", "docs", "dist", ".lighthouseci"}
        found = []
        for path in sorted(self.root.rglob("*.html")):
            if any(part in skip for part in path.relative_to(self.root).parts):
                continue
            found.append(path)
        return found

    def rel(self, path: pathlib.Path) -> str:
        return str(path.relative_to(self.root))

    # -- checks ----------------------------------------------------------
    def check_required_files(self) -> None:
        for name in REQUIRED_ROOT_FILES:
            if not (self.root / name).is_file():
                self.error("structure", f"required file missing: {name}")

    def parse_pages(self) -> None:
        for path in self.html_files():
            parser = PageParser()
            try:
                parser.feed(path.read_text(encoding="utf-8"))
                parser.close()
            except Exception as exc:  # noqa: BLE001 — surface any parse failure
                self.error(self.rel(path), f"HTML failed to parse: {exc}")
                continue
            self.pages[self.rel(path)] = parser

    def meta_content(self, parser: PageParser, **match: str) -> str | None:
        for meta in parser.metas:
            if all(meta.get(k, "").lower() == v.lower() for k, v in match.items()):
                return meta.get("content", "")
        return None

    def check_document(self, name: str, parser: PageParser) -> None:
        indexable = name not in NOINDEX_PAGES

        if not parser.lang:
            self.error(name, "<html> is missing a lang attribute")

        if self.meta_content(parser, name="viewport") is None:
            self.error(name, "missing viewport meta")

        if not parser.title:
            self.error(name, "missing <title>")
        elif len(parser.title) > 70:
            self.warn(name, f"title is {len(parser.title)} chars (>70 may be truncated)")

        description = self.meta_content(parser, name="description")
        if description is None or not description.strip():
            self.error(name, "missing meta description")
        elif not 50 <= len(description) <= 200:
            self.warn(name, f"meta description is {len(description)} chars (aim for 50-160)")

        # Headings
        h1s = [text for level, text in parser.headings if level == 1]
        if len(h1s) == 0:
            self.error(name, "no <h1>")
        elif len(h1s) > 1:
            self.error(name, f"{len(h1s)} <h1> elements (expected exactly 1)")

        previous = 0
        for level, text in parser.headings:
            if previous and level > previous + 1:
                self.error(
                    name,
                    f"heading level jumps h{previous} -> h{level} at “{text[:48]}”",
                )
            previous = level

        # Landmarks
        for landmark in ("main", "header", "footer"):
            if landmark not in parser.landmarks:
                self.error(name, f"missing <{landmark}> landmark")

        # Canonical
        canonicals = [l.get("href", "") for l in parser.links if l.get("rel", "").lower() == "canonical"]
        if indexable:
            if not canonicals:
                self.error(name, "missing rel=canonical")
            elif len(canonicals) > 1:
                self.error(name, f"{len(canonicals)} canonical links (expected 1)")
            else:
                canonical = canonicals[0]
                if not canonical.startswith(CANONICAL_ORIGIN):
                    self.error(name, f"canonical is not on {CANONICAL_ORIGIN}: {canonical}")
                expected = "/" if name == "index.html" else f"/{name}"
                if canonical != CANONICAL_ORIGIN + expected:
                    self.error(
                        name,
                        f"canonical should be {CANONICAL_ORIGIN}{expected}, found {canonical}",
                    )
        elif canonicals:
            self.warn(name, "noindex page declares a canonical")

        # Robots directive on the 404
        robots = self.meta_content(parser, name="robots") or ""
        if not indexable and "noindex" not in robots.lower():
            self.error(name, "error page must declare meta robots noindex")
        if indexable and "noindex" in robots.lower():
            self.error(name, "indexable page declares noindex")

        # Social metadata
        if indexable:
            for prop in ("og:title", "og:description", "og:url", "og:image", "og:type"):
                if self.meta_content(parser, property=prop) is None:
                    self.error(name, f"missing {prop}")
            for meta_name in ("twitter:card", "twitter:title", "twitter:image"):
                if self.meta_content(parser, name=meta_name) is None:
                    self.error(name, f"missing {meta_name}")

            og_url = self.meta_content(parser, property="og:url") or ""
            if canonicals and og_url and og_url != canonicals[0]:
                self.error(name, f"og:url ({og_url}) does not match canonical ({canonicals[0]})")

            for prop in ("og:image", "twitter:image"):
                value = self.meta_content(parser, property=prop) or self.meta_content(parser, name=prop) or ""
                if value and not value.startswith("https://"):
                    self.error(name, f"{prop} must be an absolute https URL, found: {value}")
                if value and not value.startswith(CANONICAL_ORIGIN):
                    self.error(name, f"{prop} is not hosted on {CANONICAL_ORIGIN}: {value}")

            if self.meta_content(parser, property="og:image:alt") is None:
                self.warn(name, "og:image has no og:image:alt")

        # Images
        for img in parser.images:
            src = img.get("src", "(no src)")
            if "alt" not in img:
                self.error(name, f"<img src=\"{src}\"> has no alt attribute")
            elif img["alt"].strip() == "" and img.get("role", "") != "presentation":
                self.warn(name, f"<img src=\"{src}\"> has empty alt (decorative?)")
            if not img.get("width") or not img.get("height"):
                self.warn(name, f"<img src=\"{src}\"> has no intrinsic width/height (layout shift risk)")

        # Link text
        for anchor in parser.anchors:
            href = anchor.get("href", "")
            if href in {"#", ""} and "aria-disabled" not in anchor:
                self.error(name, "anchor with placeholder href=\"#\" (dead link)")

        # Inline event handlers — these were removed during the refresh and
        # must not creep back in (CSP-hostile, untestable).
        for handler in parser.inline_handlers:
            self.error(name, f"inline event handler {handler} — move it into assets/js/")

        # Structured data
        for index, block in enumerate(parser.jsonld):
            try:
                json.loads(block)
            except json.JSONDecodeError as exc:
                self.error(name, f"JSON-LD block {index + 1} is not valid JSON: {exc}")

    def check_assets_and_links(self, name: str, parser: PageParser) -> None:
        page_path = self.root / name

        def resolve(url: str) -> pathlib.Path | None:
            """Map a site URL to a file on disk, or None if it is external."""
            parsed = urlparse(url)
            if parsed.scheme or parsed.netloc:
                return None
            path = unquote(parsed.path)
            if not path:
                return None
            if path.startswith("/"):
                target = self.root / path.lstrip("/")
            else:
                target = page_path.parent / path
            # "/" and "/some/dir/" both mean that directory's index.html —
            # resolve them so fragment checks land on a real document.
            if str(target).endswith("/") or target.is_dir():
                target = target / "index.html"
            return target

        # Assets referenced by the page must exist.
        for tag, url in parser.assets:
            parsed = urlparse(url)
            if parsed.scheme in {"data", "mailto", "tel"}:
                continue
            if parsed.scheme or parsed.netloc:
                if parsed.scheme == "http":
                    self.error(name, f"<{tag}> loads an insecure http:// URL: {url}")
                continue
            target = resolve(url.split("?")[0].split("#")[0])
            if target is None:
                continue
            if not target.exists():
                self.error(name, f"<{tag}> references a missing file: {url}")

        # Internal links must resolve, and their fragments must exist.
        for anchor in parser.anchors:
            href = anchor.get("href", "")
            if not href or href.startswith(("mailto:", "tel:", "javascript:")):
                continue
            parsed = urlparse(href)
            if parsed.scheme or parsed.netloc:
                if parsed.netloc == CANONICAL_HOST:
                    self.warn(name, f"internal link uses an absolute URL: {href}")
                if parsed.scheme == "http":
                    self.error(name, f"link uses insecure http://: {href}")
                continue

            if parsed.path:
                target = resolve(parsed.path)
                if target is not None and not target.exists():
                    self.error(name, f"link target does not exist: {href}")
                    continue
                target_page = self.rel(target) if target and target.exists() else None
            else:
                target_page = name

            if parsed.fragment:
                if target_page and target_page.endswith(".html"):
                    target_parser = self.pages.get(target_page)
                    if target_parser and parsed.fragment not in target_parser.ids:
                        self.error(
                            name,
                            f"link fragment #{parsed.fragment} has no matching id in {target_page}",
                        )

    def check_uniqueness(self) -> None:
        titles: dict[str, list[str]] = {}
        descriptions: dict[str, list[str]] = {}
        for name, parser in self.pages.items():
            if parser.title:
                titles.setdefault(parser.title, []).append(name)
            description = self.meta_content(parser, name="description")
            if description:
                descriptions.setdefault(description, []).append(name)

        for title, names in titles.items():
            if len(names) > 1:
                self.error("seo", f"duplicate <title> “{title}” on: {', '.join(names)}")
        for description, names in descriptions.items():
            if len(names) > 1:
                self.error("seo", f"duplicate meta description on: {', '.join(names)}")

    def check_text_files(self) -> None:
        """Brand-leak and localhost scan across every shipped text file."""
        skip_dirs = {"node_modules", ".git", "dist", ".lighthouseci", "docs"}
        extensions = {".html", ".css", ".js", ".json", ".xml", ".txt", ".webmanifest"}
        # Repo-root tooling config. These are excluded from the deployable
        # artifact by tools/build-site-package.sh, so a localhost URL in a
        # Lighthouse config is correct rather than a production leak. The
        # build's forbidden-file check is what proves they never ship.
        skip_files = {
            ".lighthouserc.json",
            ".lighthouserc.mobile.json",
            ".htmlvalidate.json",
            ".stylelintrc.json",
            ".prettierrc.json",
            "package.json",
            "package-lock.json",
            "eslint.config.mjs",
        }

        for path in sorted(self.root.rglob("*")):
            if not path.is_file() or path.suffix not in extensions:
                continue
            relative = path.relative_to(self.root)
            if any(part in skip_dirs for part in relative.parts):
                continue
            # Never-shipped directories are skipped: tools/ holds this
            # script's own pattern table and tests/ asserts on the same
            # strings, so scanning them would self-trip.
            if relative.parts and relative.parts[0] in {"tools", "tests"}:
                continue
            if len(relative.parts) == 1 and relative.name in skip_files:
                continue

            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue

            for pattern, label in BRAND_LEAK_PATTERNS:
                if label is None:
                    continue
                match = pattern.search(text)
                if match:
                    self.error(str(relative), f"AmbiSecure leakage — {label}: “{match.group(0)}”")

            for match in re.finditer(r"G-[A-Z0-9]{10}", text):
                if match.group(0) not in ALLOWED_ANALYTICS_IDS:
                    self.error(
                        str(relative),
                        f"unexpected analytics measurement id {match.group(0)}",
                    )

            match = LOCALHOST_PATTERN.search(text)
            if match:
                self.error(str(relative), f"localhost URL in shipped file: “{match.group(0)}”")

    def check_sitemap_and_robots(self) -> None:
        sitemap_path = self.root / "sitemap.xml"
        robots_path = self.root / "robots.txt"
        if not sitemap_path.is_file() or not robots_path.is_file():
            return  # already reported by check_required_files

        sitemap = sitemap_path.read_text(encoding="utf-8")
        locs = re.findall(r"<loc>\s*(.*?)\s*</loc>", sitemap)
        if not locs:
            self.error("sitemap.xml", "contains no <loc> entries")

        seen: set[str] = set()
        for loc in locs:
            if loc in seen:
                self.error("sitemap.xml", f"duplicate <loc>: {loc}")
            seen.add(loc)
            if not loc.startswith(CANONICAL_ORIGIN):
                self.error("sitemap.xml", f"<loc> not on {CANONICAL_ORIGIN}: {loc}")
                continue
            path = loc[len(CANONICAL_ORIGIN):] or "/"
            target = self.root / ("index.html" if path == "/" else path.lstrip("/"))
            if not target.is_file():
                self.error("sitemap.xml", f"<loc> points at a file that does not exist: {loc}")

        # Every indexable page must be listed.
        for name, parser in self.pages.items():
            if name in NOINDEX_PAGES:
                expected = CANONICAL_ORIGIN + "/" + name
                if expected in seen:
                    self.error("sitemap.xml", f"noindex page listed in sitemap: {expected}")
                continue
            expected = CANONICAL_ORIGIN + ("/" if name == "index.html" else "/" + name)
            if expected not in seen:
                self.error("sitemap.xml", f"indexable page missing from sitemap: {expected}")

        robots = robots_path.read_text(encoding="utf-8")
        if f"Sitemap: {CANONICAL_ORIGIN}/sitemap.xml" not in robots:
            self.error("robots.txt", f"missing “Sitemap: {CANONICAL_ORIGIN}/sitemap.xml”")
        if re.search(r"^\s*Disallow:\s*/\s*$", robots, re.M):
            self.error("robots.txt", "Disallow: / would deindex the whole site")

    # -- driver ----------------------------------------------------------
    def run(self) -> None:
        self.check_required_files()
        self.parse_pages()
        if not self.pages:
            self.error("structure", "no HTML pages found")
        for name, parser in self.pages.items():
            self.check_document(name, parser)
            self.check_assets_and_links(name, parser)
        self.check_uniqueness()
        self.check_text_files()
        self.check_sitemap_and_robots()


def main() -> int:
    argparser = argparse.ArgumentParser(description=__doc__)
    argparser.add_argument(
        "--root",
        default=str(pathlib.Path(__file__).resolve().parent.parent),
        help="directory to audit (defaults to the repository root)",
    )
    argparser.add_argument("--json", action="store_true", help="emit JSON")
    argparser.add_argument(
        "--strict", action="store_true", help="treat warnings as errors"
    )
    args = argparser.parse_args()

    root = pathlib.Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 2

    audit = Audit(root)
    audit.run()

    if args.strict:
        audit.errors.extend(audit.warnings)
        audit.warnings = []

    if args.json:
        print(json.dumps({
            "root": str(root),
            "pages": sorted(audit.pages),
            "errors": audit.errors,
            "warnings": audit.warnings,
        }, indent=2))
    else:
        print(f"RoboRacer site audit — {root}")
        print(f"  pages checked: {len(audit.pages)} ({', '.join(sorted(audit.pages))})")
        if audit.warnings:
            print(f"\n  {len(audit.warnings)} warning(s):")
            for warning in audit.warnings:
                print(f"    ! {warning}")
        if audit.errors:
            print(f"\n  {len(audit.errors)} error(s):")
            for error in audit.errors:
                print(f"    ✗ {error}")
        else:
            print("\n  ✓ no errors")

    return 1 if audit.errors else 0


if __name__ == "__main__":
    sys.exit(main())
