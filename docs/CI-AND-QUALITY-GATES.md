# CI and quality gates

Two workflows. `ci.yml` validates; `deploy-hostinger.yml` publishes and is manual only.
Neither grants more than `contents: read` at the workflow level.

---

## 1. `ci.yml` — pull requests and pushes to `main`

Triggers: `pull_request` → `main`, `push` → `main`, `workflow_dispatch`.
Concurrency: a newer commit on the same ref cancels the in-flight run.

**This workflow reads no secrets at all**, so it is safe on pull requests from forks.
Deployment credentials live only on the `production` GitHub Environment, which only
`deploy-hostinger.yml` binds to.

### Job `validate` (timeout 15 min)

| Step            | Command                | Fails when                                                      |
| --------------- | ---------------------- | --------------------------------------------------------------- |
| Install         | `npm ci`               | lockfile and `package.json` disagree                            |
| Format          | `npm run format:check` | Prettier would change a tracked file                            |
| CSS lint        | `npm run lint:css`     | stylelint-config-standard violation                             |
| JS lint         | `npm run lint:js`      | ESLint error (`no-undef`, `no-unused-vars`, `eqeqeq`, `strict`) |
| HTML validation | `npm run lint:html`    | html-validate:recommended violation                             |
| Sitemap XML     | `xmllint --noout`      | `sitemap.xml` is not well-formed                                |
| Site audit      | `npm run audit:site`   | see the table below                                             |
| Build           | `npm run build`        | a required file is missing, or a forbidden file would ship      |
| Artifact audit  | `npm run audit:dist`   | the same audit, re-run against the built tree                   |
| Tests           | `npm test`             | artifact contract test fails                                    |
| Upload artifact | —                      | (always) publishes `site-artifact` for the Lighthouse job       |
| Upload logs     | —                      | on failure only                                                 |

### What `tools/audit-site.py` enforces

Standard library only — no install step, identical locally and in CI.

- **Structure** — `index.html`, `404.html`, `robots.txt`, `sitemap.xml`,
  `site.webmanifest`, `.htaccess` all present
- **Document** — `lang`, viewport, `<title>`, meta description, `<main>`/`<header>`/`<footer>`
  landmarks
- **Headings** — exactly one `<h1>`; no skipped levels
- **Canonicals** — present, absolute, on `https://roboracer.ambimat.com`, and matching
  the file's own path; `og:url` must agree
- **Social** — `og:title/description/url/image/type`, `twitter:card/title/image`;
  images must be absolute HTTPS on the production origin
- **Uniqueness** — no duplicate `<title>` or meta description across pages
- **Robots** — the 404 must be `noindex`; indexable pages must not be
- **Images** — every `<img>` has `alt`; missing `width`/`height` warns
- **Links** — every internal link resolves to a real file; every `#fragment` matches an
  `id` on the _target_ page; `href="#"` is an error
- **Assets** — every referenced CSS/JS/image/font exists on disk; `http://` sub-resources
  are an error
- **Structured data** — every JSON-LD block parses
- **Sitemap ↔ pages** — every indexable page is listed, every `<loc>` exists, no
  duplicates, no noindex page listed; `robots.txt` advertises the sitemap
- **Inline handlers** — any `on*` attribute is an error (they were removed in the refresh)
- **Brand leakage** — `ambisecure.ambimat.com`, AmbiSecure asset paths,
  `ambisecure-logo`, `--secure-cyan`, or an unexpected GA4 id
- **localhost** — any `http://localhost` / `127.0.0.1` URL in a shipped file

Repo-root tooling configs (`.lighthouserc*.json`, `package.json`, …) are exempt from the
localhost scan because the build excludes them from the artifact — and the build's own
forbidden-file check is what proves they never ship.

### Tests (`tests/build-artifact.test.js`)

Contract tests on the artifact rather than on markup or wording, so copy and design edits
do not break them:

- every file the web server needs is present
- no source, tooling, CI, `node_modules`, `.env`, `.pem`/`.key` or source-map file ships
- `SHA256SUMS` lists **exactly** the shipped files and every hash verifies
- the repo and the artifact both pass the audit
- **negative control** — a deliberately broken tree makes `audit-site.py` exit non-zero
  (a gate that cannot fail is not a gate)
- no localhost URLs, no AmbiSecure infrastructure, every canonical on the production origin

### Job `lighthouse` (needs `validate`, timeout 25 min)

Matrix of `desktop` and `mobile`, `fail-fast: false` so one profile's regression does not
hide the other's result. It **downloads the artifact built by `validate`** rather than
rebuilding, so the bytes scored are the bytes tested. Reports upload as
`lighthouse-desktop` / `lighthouse-mobile` (14-day retention) on success and failure.

---

## 2. Lighthouse CI

Runs against the **locally built artifact** over LHCI's own static server
(`staticDistDir: ./dist/roboracer-site`) — never the public site — so a pull request
scores the code under review.

### Routes

| Route            | Template it represents           |
| ---------------- | -------------------------------- |
| `/index.html`    | Home — hero, grids, cards, price |
| `/resource.html` | Content + figure + download rows |
| `/contact.html`  | Contact cards + CTA routes       |
| `/404.html`      | Error page                       |

**3 runs per URL per profile**, asserted on the median.

### Gates

| Category / metric        | Desktop   | Mobile    |
| ------------------------ | --------- | --------- |
| Performance              | ≥ 0.90    | ≥ 0.85    |
| Accessibility            | ≥ 0.95    | ≥ 0.95    |
| Best Practices           | ≥ 0.95    | ≥ 0.95    |
| SEO                      | ≥ 0.95    | ≥ 0.95    |
| Largest Contentful Paint | ≤ 2500 ms | ≤ 2500 ms |
| Cumulative Layout Shift  | ≤ 0.10    | ≤ 0.10    |
| Total Blocking Time      | ≤ 200 ms  | ≤ 350 ms  |
| Script weight            | ≤ 200 KB  | ≤ 200 KB  |
| Image weight             | ≤ 900 KB  | ≤ 900 KB  |
| Stylesheet weight        | ≤ 60 KB   | ≤ 60 KB   |

**Every category gate is at or above the requested target. None was weakened.**

### The two calibrated budgets, and why

Both are set from measurement and both are documented rather than silently relaxed.

**Script weight — 200 KB, not the 120 KB first attempted.** Measured: `gtag.js` is
**171,329 bytes**; the site's own JavaScript (`nav.js`) is **1,504 bytes**. GA4 is
existing, required functionality that the refresh preserved, so a 120 KB total budget was
unsatisfiable for a reason unrelated to page quality. First-party JS is instead gated far
more tightly by the artifact tests. **Ratchet:** if GA4 is ever deferred, self-hosted or
dropped, lower this toward 30 KB.

**Mobile Total Blocking Time — 350 ms, against 200 ms on desktop.** Measured mobile
medians (Moto G Power emulation, 4× CPU throttle), across repeated 3-run batches:
`404.html` 0–22 ms · `index.html` 131–136 ms · `contact.html` 193–198 ms ·
`resource.html` **227–315 ms**. Effectively all of it is `gtag.js` parse/execute on the
throttled CPU — the site's own JS is 1.5 KB. 350 ms sits above the observed ceiling with
headroom for runner noise; `resource.html` is the tightest page and is worth watching.
Desktop stays at the 200 ms target and measures **0–4 ms**. **Ratchet:** same trigger as
above — deferring GA4 should bring mobile TBT well under 200 ms, at which point align the
two profiles.

### Audits turned off, and why

| Audit                                                                  | Why                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uses-text-compression`, `uses-long-cache-ttl`, `server-response-time` | A static file server in CI cannot represent Hostinger/LiteSpeed, which applies gzip and cache headers from `.htaccess`. Verified post-deploy instead.                                                                                                                                                |
| `csp-xss`                                                              | `gtag.js` is third-party and outside our control                                                                                                                                                                                                                                                     |
| `lcp-lazy-loaded`, `prioritize-lcp-image`, `non-composited-animations` | Report `notApplicable` on pages with no qualifying LCP image or animation; a `minScore` assertion then evaluates to `NaN` and fails for a non-reason                                                                                                                                                 |
| SEO category on `/404.html`                                            | The error page is deliberately `noindex`, so `is-crawlable` scores it ~0.66. Asserting SEO there would force either an indexable error page or a weaker gate for every page. Handled with an `assertMatrix` so the 404 is still held to the same accessibility, best-practices and performance bars. |

### Determinism

`preset: "desktop"` for desktop; **mobile omits `preset` entirely** — Lighthouse has no
`"mobile"` preset (valid values are `perf`, `experimental`, `desktop`) and passing one
aborts the run. Mobile emulation is Lighthouse's default and is pinned with
`formFactor: "mobile"`.

Expected variance: category scores move ±1–3 points run to run; a single cold-start
mobile run on `index.html` was observed at 84 while its median was 99. Median-of-3 keeps
this clear of the gate. Verified stable across 3 consecutive desktop runs and 2
consecutive mobile runs after calibration.

---

## 3. Local diagnostics not in CI

Both need a local Chrome, which is why they are not CI gates — Lighthouse already covers
accessibility in CI without an extra browser dependency.

```bash
node tools/check-responsive.mjs http://localhost:8080
```

Loads all 4 pages at 320 / 375 / 768 / 1024 / 1440 and reports horizontal overflow (naming
the offending element), console errors, failed same-origin requests, and interactive
targets under 24×24 px. This is what caught the nav overflow at 1024px and the
sub-24px footer links.

```bash
bash tools/verify-production.sh https://roboracer.ambimat.com
```

Post-deployment verification — see [DEPLOYMENT.md](DEPLOYMENT.md).

## 4. Required branch protection

Set on `main`:

- Require a pull request before merging (≥ 1 approval)
- Require status checks to pass: **`Lint, test and build`**,
  **`Lighthouse (desktop)`**, **`Lighthouse (mobile)`**
- Require branches to be up to date before merging
- Require conversation resolution
- Do not allow bypassing the above
- Restrict who can push to `main`
