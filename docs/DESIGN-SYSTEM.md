# RoboRacer design system

Everything lives in **`assets/css/main.css`**, in one file, in this order:
tokens → base → header → hero → buttons → sections → grids/cards → price cards →
resource rows → contact cards → page header → footer → responsive → focus/motion → print.

There is no CSS build step. Add a token before you add a hex code.

---

## 1. Tokens

All tokens are CSS custom properties on `:root`.

### Colour

| Token           | Value                 | Use                                                 |
| --------------- | --------------------- | --------------------------------------------------- |
| `--rr-red`      | `#e31c2b`             | Primary action colour — buttons, rules, active nav  |
| `--rr-red-dark` | `#b81422`             | Hover state; **all red text** (6.64:1 on white)     |
| `--rr-red-soft` | `#e63946`             | Legacy lighter red, retained for tints              |
| `--rr-red-tint` | `rgba(227,28,43,.08)` | Icon chip backgrounds                               |
| `--rr-dark`     | `#2c3e50`             | Headings on dark surfaces, footer, dark sections    |
| `--rr-grey`     | `#6c7a89`             | **Non-text only** — see the contrast note below     |
| `--rr-soft`     | `#f4f5f6`             | Alternating section background, chips, inline boxes |

Semantic aliases components actually reference: `--bg`, `--bg-alt`, `--grid-line`,
`--card`, `--ink`, `--ink-2`, `--muted`, `--muted-strong`, `--line`, `--accent`,
`--accent-dark`.

> **Contrast note.** `--rr-grey` (`#6c7a89`) is the inherited RoboRacer brand grey but
> measures **4.39:1 on white** — below the WCAG AA 4.5:1 floor for body text. It is
> therefore reserved for non-text use. The text step is **`--muted: #5f6b77`**
> (5.45:1 on white, 4.99:1 on `--rr-soft`), same hue family. `--muted-strong: #55626e`
> (6.25:1) carries longer body copy. This was a real Lighthouse failure, not a
> precaution — see [CI-AND-QUALITY-GATES.md](CI-AND-QUALITY-GATES.md).

Red-on-white is 4.70:1, which passes for the bold `--rr-red` accents in the brand
lockup and nav, but red **body text** must use `--rr-red-dark`.

### Type

Montserrat (headings and all UI chrome) · Source Sans 3 (body). Both are self-hosted
variable-font subsets in `assets/fonts/`, declared in `assets/css/fonts.css`, and
preloaded in every page `<head>`. There is no Google Fonts request — that was removed
during the refresh, along with the Font Awesome CDN (icons are now inline SVG).

| Token          | Value    | Applies to                          |
| -------------- | -------- | ----------------------------------- |
| `--fs-hero`    | `46px`   | `.hero-title` (h1 on the home page) |
| `--fs-h1`      | `38px`   | `.page-title` on interior pages     |
| `--fs-h2`      | `32px`   | `.section-title`                    |
| `--fs-h3`      | `20px`   | `.section-subtitle`                 |
| `--fs-body`    | `16.5px` | body copy                           |
| `--fs-small`   | `14px`   | footer, captions                    |
| `--fs-eyebrow` | `11.5px` | `.eyebrow`, `.hero-tag`             |

Body line-height is `1.65`; prose columns are capped in `ch` (`60ch` hero, `76ch`
section copy) so line length stays readable independent of viewport.

### Layout, radius, elevation

`--pad-section: 96px 80px` · `--maxw-section: 1280px` · `--maxw-hero: 1320px` ·
`--maxw-prose: 820px` · `--radius-card: 6px` · `--radius-btn: 4px` ·
`--shadow-sm/md/lg` (all tinted with the `#2c3e50` brand dark rather than pure black).

---

## 2. Components

| Class                                                                  | What it is                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `.site-header` / `.navbar`                                             | Sticky header, red gradient hairline, brand lockup               |
| `.nav-links` / `.nav-cta`                                              | Primary nav; `.nav-cta` items appear only inside the mobile menu |
| `.nav-actions` / `.nav-btn`                                            | Desktop CTA buttons; hidden ≤1240px                              |
| `.hamburger`                                                           | Mobile toggle; animates to an X via `aria-expanded`              |
| `.hero` / `.hero-container`                                            | Grid-paper background with a red radial wash; two-column         |
| `.eyebrow` / `.hero-tag`                                               | Uppercase red kicker above a heading                             |
| `.btn` + `-primary/-dark/-outline/-ghost/-small`                       | Button scale                                                     |
| `.section` + `.alt` / `.dark`                                          | Section rhythm and alternating surfaces                          |
| `.section-head` / `-title` / `-line` / `-desc` / `-subtitle` / `-note` | Section header stack                                             |
| `.grid-2` / `-3` / `-4`                                                | Flex-wrap grids that centre an orphan last row                   |
| `.card`                                                                | Bordered card; red rule wipes in on hover                        |
| `.card-icon`                                                           | 44px tinted chip holding a 22px inline SVG                       |
| `.part-card`                                                           | Compact label tile with a red spine (bill of materials)          |
| `.price-card` / `.price-lines`                                         | Pricing comparison: one card per region, one row per line item   |
| `.figure`                                                              | Bordered image + caption                                         |
| `.resource-row`                                                        | Title/description on the left, download button on the right      |
| `.contact-card` / `.contact-box`                                       | Contact tiles with a red top edge                                |
| `.chip-row` / `.chip`                                                  | Pill lists (industries, OEM brands)                              |
| `.page-header`                                                         | Interior-page title band                                         |
| `.site-footer`                                                         | 4-column dark footer                                             |
| `.skip-link` / `.visually-hidden`                                      | Accessibility utilities                                          |

---

### Pricing

`.price-card` replaced the old dark `.price-panel`, which could only carry one
figure per currency. Pricing now has three independent components — kit price,
Software Setup / Technical Support, and shipping — and GST applies to the INR
figures only, so each is a separate `.price-lines` row of label + figure rather
than a single headline number. `.is-primary` promotes the lead figure,
`.is-indicative` demotes an approximate one, and `.price-line-tax` carries the
qualifier ("+ GST", "before shipping") that must never be dropped.

Below 520px each row stacks label over figure, so a long label never squeezes a
price onto two lines.

The INR 628,000 row label runs to two lines in the card at most widths; that is
expected and is why the row is `flex-wrap` rather than a fixed two-column grid.

Copy inside these components is contract-tested in
`tests/pricing-content.test.js` — figures, the service name and relationship,
the India scope of the INR shipping rate, the FOB/destination-charge wording,
the inclusion/exclusion claims and the JSON-LD offers all have regression
guards, several of them structural (they read the price row or the Offer node,
not nearby prose).

---

## 3. Breakpoints

| Width      | What changes                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `≤ 1400px` | `.brand-tag` ("Autonomous racing platform") hides, freeing ~170px for the link row                                       |
| `≤ 1240px` | **Nav collapses to the hamburger**; both CTAs move into the menu; hero stacks; `.grid-4` → 2-up; footer → 2 columns      |
| `≤ 880px`  | Section padding tightens to 24px; type steps down; all grids → 1 column; `.resource-row` stacks with a full-width button |
| `≤ 520px`  | Brand wordmark hidden (logo only); further type step-down; footer → 1 column; buttons go full width                      |

The nav collapses at **1240**, not the more usual 880. The bar carries a brand lockup,
six links and two CTAs; measured in Chrome across 1181 → 1920px, the link labels start
wrapping onto a second line below ~1200px, and 1240 is the first width with comfortable
slack (~40px either side of the link row). `.nav-links a` also carries `white-space:
nowrap` so a two-word label can never break and double the header height. Rather than
drop the CTAs, they move into the menu so every destination stays reachable at every
width.

Verified with `node tools/check-responsive.mjs` at 320 / 375 / 768 / 1024 / 1440 on all
eight pages: no horizontal overflow, no console errors, no failed same-origin requests,
no interactive target under 24×24 CSS px.

> **Inline links and target size.** Body copy at 16.5px/1.75 gives an inline link a 21px
> box, under the WCAG 2.2 AA 2.5.8 24px floor. `.prose`, `.callout`, `.faq-item`,
> `.steps`, `.section-desc` and in-card links therefore carry `padding-block: 3px` —
> padding rather than `display: inline-block`, which would stop a link breaking across
> lines mid-sentence. Same technique as the footer and `.contact-box` links.

---

## 4. Accessibility rules baked into the system

- **Landmarks.** Every page has `header` / `main#main` / `footer`, and a `.skip-link`
  as the first focusable element. `audit-site.py` fails the build if one is missing.
- **One `<h1>` per page**, no skipped heading levels — enforced by the audit.
- **Focus.** A single global `:focus-visible` ring (2px `--rr-red`, 2px offset), flipped
  to white on the dark footer and dark sections.
- **Target size.** WCAG 2.2 AA §2.5.8 — footer and contact-box links are `inline-block`
  with vertical padding so nothing falls under 24px.
- **Reduced motion.** `prefers-reduced-motion: reduce` collapses every transition and
  animation and disables smooth scrolling.
- **Menu semantics.** The hamburger is a real `<button>` with `aria-expanded` and
  `aria-controls`. Escape closes the menu and returns focus to the toggle. No focus trap
  is installed — the menu is an inline disclosure in DOM order, so Tab flows naturally
  through it and out.
- **`aria-current="page"`** is set on exactly one nav link, and never on same-page
  anchor links (`/#parts`), which navigate to a section rather than to the page.
- **Icons** are inline SVG marked `aria-hidden="true"`, always paired with a visible
  text label.
- **Images** all carry meaningful `alt` text plus intrinsic `width`/`height` (CLS is 0
  on every page). Download links append a `visually-hidden` suffix so their accessible
  name says what is being downloaded.

## 5. Relationship to AmbiSecure

The structural discipline — token layer, section rhythm, card and button primitives,
grid behaviour, focus/reduced-motion handling, self-hosted fonts — is adapted from the
AmbiSecure site. **No AmbiSecure colour, logo, imagery, copy, schema or analytics ID was
copied.** `audit-site.py` and the test suite both fail on any reference to
`ambisecure.ambimat.com`, an AmbiSecure asset path, or the AmbiSecure-only
`--secure-cyan` token. Full breakdown in [AMBISECURE-MAPPING.md](AMBISECURE-MAPPING.md).
