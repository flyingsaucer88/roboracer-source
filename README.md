# RoboRacer — site source

Static site for the **RoboRacer** autonomous racing platform by Ambimat Electronics.
Production: <https://roboracer.ambimat.com/> · Hosting: Hostinger (LiteSpeed).

Plain HTML, vanilla CSS and one small vanilla JS file. There is **no framework and no
compile step** — the "build" is a filtered copy that selects exactly which files reach
the public web root.

---

## Quick start

```bash
npm ci                 # install dev tooling (linters, Lighthouse) from the lockfile
npm run serve:src      # preview the source tree at http://localhost:8080
```

Python 3 is required (the audit tooling and the preview server use the standard library only).

## Commands

| Command                | What it does                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- |
| `npm run build`        | Produce `dist/roboracer-site/` + `.zip` — the exact tree that ships          |
| `npm run serve`        | Serve the **built** artifact on :8080                                        |
| `npm run serve:src`    | Serve the **source** tree on :8080                                           |
| `npm run format`       | Apply Prettier                                                               |
| `npm run format:check` | Verify formatting (CI gate)                                                  |
| `npm run lint`         | Stylelint + ESLint + html-validate                                           |
| `npm run audit:site`   | Links, assets, SEO, canonicals, structured data, brand leakage — source tree |
| `npm run audit:dist`   | The same audit against the built artifact                                    |
| `npm test`             | Artifact contract tests (`node --test`)                                      |
| `npm run validate`     | Everything above, in the order CI runs it                                    |
| `npm run lh:desktop`   | Lighthouse CI, desktop profile, against the built artifact                   |
| `npm run lh:mobile`    | Lighthouse CI, mobile profile                                                |
| `npm run lh`           | Both Lighthouse profiles                                                     |

Two extra diagnostics are not wired into CI because they need a local Chrome:

```bash
npm run build && npm run serve &          # artifact on :8080
node tools/check-responsive.mjs http://localhost:8080
#   overflow, console errors, failed requests and sub-24px targets
#   at 320 / 375 / 768 / 1024 / 1440

bash tools/verify-production.sh           # post-deployment checks against the live site
```

## Repository layout

```
/
├── index.html                  home — Core Kit overview, parts, services, price
├── autonomous-racing-robotics-kit.html
│                               cornerstone — what the kit is, who for, BOM, specs,
│                               assembled-vs-from-parts comparison, FAQ
├── specifications.html         full hardware + software reference tables
├── getting-started.html        crate → first autonomous lap, safety, troubleshooting
├── use-cases.html              universities, competition teams, research, industry
├── contact.html                order routes + contact details + company story + FAQ
├── resource.html               open-source power board files, manual and how to use them
├── 404.html                    custom error page (noindex)
├── robots.txt · sitemap.xml · site.webmanifest
├── .htaccess                   HTTPS, redirects, security headers, caching (LiteSpeed)
├── assets/
│   ├── css/main.css            the design system — tokens + every component
│   ├── css/fonts.css           self-hosted Montserrat + Source Sans 3
│   ├── js/nav.js               mobile menu + active-link marking (the only JS)
│   ├── img/                    logo, product photo, board diagram, favicons, OG card
│   └── fonts/                  woff2 variable-font subsets
├── files/                      downloadable board ZIP + user manual PDF
├── tools/                      build, audit and verification scripts (never shipped)
├── tests/                      artifact contract tests (never shipped)
├── docs/                       design system, CI, deployment, AmbiSecure mapping
└── .github/workflows/          ci.yml (PRs) · deploy-hostinger.yml (manual)
```

## Documentation

| Document                                                     | Covers                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md)               | Tokens, type scale, components, breakpoints, accessibility rules |
| [docs/CI-AND-QUALITY-GATES.md](docs/CI-AND-QUALITY-GATES.md) | Workflows, every gate, Lighthouse routes/budgets, the ratchet    |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                     | Hostinger secrets, first-deploy checklist, rollback, DNS/TLS     |
| [docs/AMBISECURE-MAPPING.md](docs/AMBISECURE-MAPPING.md)     | What was adapted from the AmbiSecure reference, and what was not |

## Adding a page

Every page is self-contained — copy the closest existing one and edit. Keep:

- the `<head>` block: title, meta description, `rel=canonical`, OG/Twitter tags, icons
- `<a class="skip-link">` as the first element in `<body>`
- `<header class="site-header">` with the full `.navbar` (including both `.nav-cta` links)
- `<main id="main">` wrapping the content
- `<footer class="site-footer">`
- `<script src="/assets/js/nav.js" defer>` at the end of `<body>`

Then:

1. add the URL to `sitemap.xml`
2. add it to the Lighthouse route list in `.lighthouserc.json` **and** `.lighthouserc.mobile.json`
   if it is a materially different template
3. run `npm run validate` — the audit will reject a missing canonical, a duplicate title,
   a dead link or an absent sitemap entry

## Conventions worth knowing

- **URLs keep their `.html` extensions.** `/contact.html` and `/resource.html` were the
  pre-refresh URLs and are preserved. `.htaccess` 301s `/contact`, `/resource` and
  `/resources` to them, and `/index.html` to `/`.
- **No inline event handlers.** `audit-site.py` fails the build on any `on*` attribute.
- **No hotlinked images.** All assets are local; the audit rejects `http://` sub-resources.
- **Design tokens over literals.** Add a `--rr-*` custom property rather than a hex code.
- Regenerate derived images with `python3 tools/gen-images.py` (favicons, OG card,
  responsive `srcset` variants).
