#!/usr/bin/env python3
"""Generate RoboRacer favicons and the Open Graph social image.

Sources are the real brand assets already used by the site:
  assets/img/ambimat-logo.png        Ambimat Electronics wordmark
  assets/img/roboracer-core-kit.jpg  product photograph

Nothing here invents a logo: the favicon is the Ambimat wordmark
letterboxed onto a square white tile, and the OG card only sets
copy that already exists on the page it represents.

Run:  python3 tools/gen-images.py
Deps: Pillow (see tools/requirements-audit.txt)
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"

BRAND_RED = (227, 28, 43)
INK = (26, 29, 30)
GREY = (97, 106, 108)
LINE = (229, 229, 229)

# macOS/Linux system fonts, in preference order. The OG card is a raster
# output, so an exact Montserrat match is not required — only a clean
# geometric sans.
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Futura.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if pathlib.Path(path).exists():
            try:
                return ImageFont.truetype(path, size, index=index)
            except OSError:
                continue
    return ImageFont.load_default()


def build_favicons() -> None:
    """Square white tiles carrying the Ambimat wordmark, plus a red keyline."""
    logo = Image.open(IMG / "ambimat-logo.png").convert("RGBA")

    for size in (32, 64, 192, 512, 180):
        tile = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        draw = ImageDraw.Draw(tile)

        # Brand keyline along the bottom edge — reads as a mark at 32px.
        bar = max(2, round(size * 0.09))
        draw.rectangle([0, size - bar, size, size], fill=BRAND_RED)

        inner_w = round(size * 0.82)
        scaled_h = max(1, round(logo.height * (inner_w / logo.width)))
        scaled = logo.resize((inner_w, scaled_h), Image.LANCZOS)
        tile.alpha_composite(
            scaled,
            ((size - inner_w) // 2, (size - bar - scaled_h) // 2),
        )

        name = "apple-touch-icon.png" if size == 180 else f"favicon-{size}.png"
        tile.save(IMG / name, "PNG", optimize=True)
        print(f"  wrote assets/img/{name} ({size}x{size})")


def build_og() -> None:
    """1200x630 social card. Copy is taken verbatim from the home page."""
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(card)

    # Grid background — the same 60px motif the site hero uses.
    for x in range(0, W, 60):
        draw.line([(x, 0), (x, H)], fill=LINE, width=1)
    for y in range(0, H, 60):
        draw.line([(0, y), (W, y)], fill=LINE, width=1)

    # Product photo, right third, cover-cropped.
    photo = Image.open(IMG / "roboracer-core-kit.jpg").convert("RGB")
    panel_w = 430
    scale = max(panel_w / photo.width, H / photo.height)
    photo = photo.resize(
        (round(photo.width * scale), round(photo.height * scale)), Image.LANCZOS
    )
    left = (photo.width - panel_w) // 2
    top = (photo.height - H) // 2
    card.paste(photo.crop((left, top, left + panel_w, top + H)), (W - panel_w, 0))

    # Ambimat wordmark, top left.
    logo = Image.open(IMG / "ambimat-logo.png").convert("RGBA")
    logo_w = 200
    logo = logo.resize(
        (logo_w, round(logo.height * (logo_w / logo.width))), Image.LANCZOS
    )
    card.paste(logo, (72, 64), logo)

    draw.text((72, 190), "ROBORACER PLATFORM", font=load_font(22), fill=BRAND_RED)
    draw.rectangle([72, 232, 132, 236], fill=BRAND_RED)

    draw.text((72, 268), "RoboRacer", font=load_font(72), fill=INK)
    draw.text((72, 352), "Core Kit", font=load_font(72), fill=INK)

    for i, line in enumerate(
        [
            "Fully assembled, pre-tested autonomy system",
            "for 1:10-scale robotic vehicles.",
        ]
    ):
        draw.text((72, 462 + i * 38), line, font=load_font(26), fill=GREY)

    card.save(IMG / "roboracer-og.png", "PNG", optimize=True)
    print("  wrote assets/img/roboracer-og.png (1200x630)")


def build_responsive() -> None:
    """Width variants so each <img> can ship a srcset matched to its box.

    Widths are chosen from the rendered CSS box at each breakpoint, not from
    the source dimensions: the hero visual caps at 460px, the board figure at
    1100px. The 2x entries cover high-DPR displays.
    """
    targets = [
        # (source, [widths], quality)
        # 460 matches the hero's desktop box exactly; without it the browser
        # rounds up to the next candidate and Lighthouse flags the overdraw.
        # The 600 source doubles as the high-DPR step (no larger original).
        ("roboracer-core-kit.jpg", [400, 460, 600], 82),
        ("roboracer-power-board-diagram.png", [800, 1100, 1600], 82),
    ]

    for filename, widths, quality in targets:
        source = Image.open(IMG / filename)
        stem = pathlib.Path(filename).stem
        for width in widths:
            if width > source.width:
                continue
            height = round(source.height * (width / source.width))
            resized = source.resize((width, height), Image.LANCZOS)
            out = IMG / f"{stem}-{width}.webp"
            resized.save(out, "WEBP", quality=quality, method=6)
            print(f"  wrote assets/img/{out.name} ({width}x{height})")


if __name__ == "__main__":
    if not IMG.exists():
        sys.exit(f"missing {IMG}")
    print("Generating favicons…")
    build_favicons()
    print("Generating Open Graph card…")
    build_og()
    print("Generating responsive image variants…")
    build_responsive()
    print("Done.")
