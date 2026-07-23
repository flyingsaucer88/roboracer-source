# AmbiSecure → RoboRacer mapping

The AmbiSecure repository (`ambisecure-site`) was used as a **read-only design and
engineering reference**. It was not modified. RoboRacer keeps its own brand, content,
information architecture, domain, analytics and assets.

## What was adapted

| AmbiSecure pattern                                  | RoboRacer equivalent                            | Decision                                                                 | Target file(s)                           | Stays RoboRacer-specific                                                    |
| --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| `:root` design-token layer                          | `--rr-*` tokens + semantic aliases              | **Adapt structure, replace every value**                                 | `assets/css/main.css`                    | RoboRacer red `#e31c2b`, dark `#2c3e50`, grey `#6c7a89`                     |
| Montserrat + Source Sans 3, self-hosted             | Same two families, self-hosted woff2 subsets    | **Reuse** — Google Fonts subsets, not AmbiSecure brand assets            | `assets/css/fonts.css`, `assets/fonts/`  | RoboRacer type scale and hierarchy                                          |
| Sticky navbar + red gradient hairline               | `.site-header` / `.navbar`                      | **Adapt**                                                                | `assets/css/main.css`, all 4 pages       | Ambimat logo, RoboRacer wordmark, RoboRacer's own 5 links + 2 CTAs          |
| Hamburger + `.nav-links.open` disclosure            | Same, hardened                                  | **Adapt and improve** (Escape, outside-click, focus return, resize)      | `assets/js/nav.js`                       | Collapse at 1080px, driven by RoboRacer's measured nav width                |
| Ecosystem bar                                       | —                                               | **Rejected** — a multi-property nav bar RoboRacer has no need for        | —                                        | —                                                                           |
| Grid-paper hero + radial brand wash                 | `.hero`                                         | **Adapt** — RoboRacer already had a 60px grid hero                       | `assets/css/main.css`                    | RoboRacer product photograph, copy, CTAs                                    |
| `.eyebrow` / `.section-head` / `.section-line`      | Same stack                                      | **Adapt**                                                                | `assets/css/main.css`                    | RoboRacer section titles, verbatim from the pre-refresh pages               |
| `.btn` scale (primary/dark/outline/ghost/small)     | Same scale                                      | **Adapt**                                                                | `assets/css/main.css`                    | RoboRacer red                                                               |
| `.card` with hover rule-wipe                        | `.card`, plus new `.part-card`, `.resource-row` | **Adapt + extend**                                                       | `assets/css/main.css`                    | Bill-of-materials tiles and download rows are RoboRacer-only                |
| Flex `.grid-2/3/4` with centred orphans             | Identical behaviour                             | **Reuse the technique**                                                  | `assets/css/main.css`                    | —                                                                           |
| 4/5-column dark footer                              | 4-column footer                                 | **Adapt**                                                                | all 4 pages                              | Ambimat address/phones/emails already in the repo; RoboRacer link columns   |
| Global `:focus-visible` + reduced-motion            | Identical approach                              | **Reuse**                                                                | `assets/css/main.css`                    | Ring colour is RoboRacer red                                                |
| `.skip-link` / `.visually-hidden`                   | Same                                            | **Reuse**                                                                | `assets/css/main.css`                    | —                                                                           |
| Head block (canonical, OG, Twitter, icons, JSON-LD) | Same shape                                      | **Adapt shape, author fresh content**                                    | all 4 pages                              | `roboracer.ambimat.com` canonicals, RoboRacer OG card, Ambimat Organization |
| `.htaccess` (HTTPS, headers, caching)               | Same techniques                                 | **Adapt**                                                                | `.htaccess`                              | RoboRacer redirects; no AmbiSecure spam/legacy rules                        |
| `build-hostinger-package.sh`                        | `tools/build-site-package.sh`                   | **Adapt + extend** (forbidden-file gate, `SHA256SUMS`)                   | `tools/`                                 | RoboRacer allowlist                                                         |
| Python audit suite (8 scripts)                      | One `tools/audit-site.py`                       | **Consolidate** — 4 pages do not need 8 scripts                          | `tools/audit-site.py`                    | RoboRacer canonical host, brand-leak rules                                  |
| `.lighthouserc.json`, single desktop run            | Desktop **and** mobile, 3 runs, `assertMatrix`  | **Adapt + strengthen**                                                   | `.lighthouserc*.json`                    | RoboRacer routes and budgets                                                |
| FTPS deploy via `FTP-Deploy-Action`                 | Same transport, more rails                      | **Adapt + harden** (typed confirm, branch guard, environment, checksums) | `.github/workflows/deploy-hostinger.yml` | RoboRacer secrets and web root                                              |

## What was deliberately **not** taken

- AmbiSecure logos, crests, product imagery and illustrations
- The `--secure-cyan` accent family (an AmbiSecure-only technical-surface token)
- AmbiSecure copy, product facts, certifications, partners and case studies
- AmbiSecure schema entities, canonical URLs and `sameAs` links
- The AmbiSecure GA4 measurement ID (RoboRacer keeps its own, `G-KCRP2C9ZCL`)
- The ecosystem bar, blog/tag/category system, search, cookie consent, video platform,
  utility-tool shell — none of which RoboRacer has content for

## Enforcement

Brand separation is not left to review discipline. Both of these fail the build:

- `tools/audit-site.py` — errors on `ambisecure.ambimat.com`, any
  `/assets/img/ambisecure*` path, `ambisecure-logo`, `--secure-cyan`, or an unexpected
  GA4 measurement ID, in every shipped text file
- `tests/build-artifact.test.js` — asserts the same over the built artifact

The literal word "AmbiSecure" is **allowed**: `contact.html` lists it among Ambimat's OEM
solution brands, which is pre-existing RoboRacer content. Only AmbiSecure _infrastructure_
is banned.
