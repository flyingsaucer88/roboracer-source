# Deployment — Hostinger

> **Nothing has been deployed.** This document prepares the path; the first production
> deploy is a deliberate manual action described in §5.

Target: <https://roboracer.ambimat.com/> · Host: Hostinger (LiteSpeed) · Transport: FTPS

---

## 1. Strategy, and its limits

RoboRacer had **no deployment configuration of any kind** before this work — no CI, no
scripts, no documented process. The transport chosen is **FTPS via
`SamKirkland/FTP-Deploy-Action@v4.3.5`**, mirroring the arrangement already proven on the
same Hostinger account by the sibling AmbiSecure property.

**This is a staged synchronisation, not an atomic release.** FTPS gives no way to upload
to a staging directory and flip a symlink, so during an upload the web root is briefly
mixed — some files new, some old. Consequences and mitigations:

| Limitation                                           | Mitigation                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| No atomic switch; brief mixed state during upload    | Uploads are diff-only after the first run (server-side state file), so the window is seconds |
| No automatic previous release to roll back to        | Keep the previous run's `production-artifact` (30-day retention) and re-upload it — see §7   |
| A failed upload can leave the root partially updated | The workflow says so explicitly on failure and points here                                   |
| HTML and CSS could momentarily disagree              | CSS is query-versioned (`main.css?v=1`); bump it when a change would break older HTML        |

**If the Hostinger plan supports SSH** (Business tier and above), migrating to
`rsync` + timestamped release directories + an atomic symlink switch would remove all of
the above. That is the recommended follow-up; it was not assumed because the plan tier has
not been confirmed. See §9.

## 2. What ships

`tools/build-site-package.sh` produces `dist/roboracer-site/` — the exact tree for the web
root — plus a `.zip` for manual upload.

It is an **allowlist by exclusion with a verification gate**: after copying it asserts
every required file is present, then greps the result for anything forbidden
(`*.py`, `*.sh`, `*.md`, `*.map`, `.env*`, `*.pem`, `*.key`, `package*.json`, `*.yml`,
`node_modules`, `.git`, `.DS_Store`) and **fails the build** if any is found. It then
writes `SHA256SUMS` over every shipped file.

Artifact: 4 HTML pages, 2 CSS, 1 JS, 12 images, 2 fonts, 2 downloads, plus `robots.txt`,
`sitemap.xml`, `site.webmanifest` and `.htaccess`. ~4.9 MB, of which ~4.0 MB is the two
downloadable board files.

The build also **minifies the CSS into the artifact** with `lightningcss` (24.7 KB → 16.6 KB
for `main.css`), which additionally downlevels the modern media-query range syntax
(`width <= 1080px`) that stylelint normalises to, restoring pre-2022 Safari and Firefox
support. The source stylesheet stays readable and commented; only the shipped bytes are
compressed. The step is mandatory — the build fails if `node_modules` is missing, rather
than silently shipping an unminified stylesheet that would fail the Lighthouse gate later.

`.htaccess` is **copied back explicitly** after the rsync and is on the required-file list,
so it can never be silently dropped.

## 3. Secrets and variables

Create these on the **`production` GitHub Environment** (Settings → Environments →
production), _not_ at repository level — environment scoping is what keeps them
unreachable from pull-request workflows.

| Name                     | Kind     | Purpose               | Format / example                                     | Where to get it                                                   | Needed for |
| ------------------------ | -------- | --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| `HOSTINGER_FTP_SERVER`   | Secret   | FTPS hostname         | `ftp.roboracer.ambimat.com` or the `*.hstgr.io` host | hPanel → Files → **FTP Accounts** → _FTP server_                  | Deploy     |
| `HOSTINGER_FTP_USERNAME` | Secret   | FTPS account username | `u123456789.github-deploy`                           | hPanel → FTP Accounts (create a dedicated one — see below)        | Deploy     |
| `HOSTINGER_FTP_PASSWORD` | Secret   | FTPS account password | 20+ random chars                                     | Set when creating the FTP account; store in your password manager | Deploy     |
| `HOSTINGER_REMOTE_DIR`   | Variable | Remote web root       | `./` or `./public_html/`                             | **Verify before the first deploy** — see the warning below        | Deploy     |

Nothing is needed for CI: `ci.yml` reads no secrets.

> **Do not assume the document root.** If the FTP account was created scoped to the site's
> directory, it lands _inside_ the web root and `HOSTINGER_REMOTE_DIR` should be `./`. If it
> was created at the account root, it lands one level above and the value must be
> `./public_html/` (or the subdomain's directory, often
> `./domains/roboracer.ambimat.com/public_html/`). Confirm by connecting once with an FTPS
> client and looking at where you land. The workflow defaults to `./` only because that is
> the scoped-account convention — **verify it, do not trust it.**

**Least privilege.** Create a dedicated FTP account for deployment, scoped to the RoboRacer
directory only. Do not reuse the main hosting account, and do not reuse the AmbiSecure
deployment account.

Secrets are referenced only inside the `deploy` job, only as `${{ secrets.* }}`, and are
never echoed — the presence check tests emptiness without printing values.

## 4. The deploy workflow

`.github/workflows/deploy-hostinger.yml`, `workflow_dispatch` **only**. There is no push
trigger. Eight rails, in order:

1. **Manual trigger only** — no automatic deployment of any kind
2. **Typed confirmation** — the `confirm` input must be exactly `DEPLOY`
3. **Branch guard** — refuses to run from any ref other than `main`
4. **Full CI gate** — `npm run validate` (format, lint, audit, build, artifact audit, tests)
5. **Lighthouse gates** — desktop and mobile, both must pass
6. **Artifact verification** — contents listed, `SHA256SUMS` verified, before upload
7. **`production` environment** — reviewer approval, and the only place the secrets exist
8. **Concurrency** `deploy-production`, `cancel-in-progress: false` — two deploys can never
   interleave, and an in-flight upload is never killed mid-write

The `deploy` job **downloads the artifact built and gated in the `build` job** rather than
rebuilding — the bytes that passed the gates are the bytes that ship — and re-verifies the
checksums after the artifact round-trip.

Configure **required reviewers** on the `production` environment. Without that, rail 7 is
inert.

## 5. First deployment checklist

- [ ] Confirm the DNS for `roboracer.ambimat.com` points at the Hostinger site, and that
      SSL is issued and active in hPanel
- [ ] Create the dedicated, scoped FTP account
- [ ] **Connect once manually with an FTPS client and record where you land** → set
      `HOSTINGER_REMOTE_DIR` accordingly
- [ ] Add the three secrets and one variable to the `production` environment
- [ ] Add required reviewers to the `production` environment
- [ ] Apply the branch protection in
      [CI-AND-QUALITY-GATES.md §4](CI-AND-QUALITY-GATES.md#4-required-branch-protection)
- [ ] Back up the current live web root (hPanel → Files → Backups, or download via FTP) —
      this is the rollback target for the very first deploy
- [ ] Open a PR with these changes and confirm CI + both Lighthouse jobs pass
- [ ] Merge to `main`
- [ ] Run **Actions → Deploy to Hostinger → Run workflow**, type `DEPLOY`, approve
- [ ] Run the post-deployment verification (§6)
- [ ] Do the manual checks (§6) — do **not** declare success before them
- [ ] Submit `https://roboracer.ambimat.com/sitemap.xml` in Google Search Console

## 6. Post-deployment verification

```bash
bash tools/verify-production.sh https://roboracer.ambimat.com
```

Read-only. It checks: core routes return 200; unknown paths return a real 404 with the
custom page; `/index.html` → `/` and the `/contact`, `/resource`, `/resources` aliases
redirect; `http://` → `https://`; canonicals match the production origin; `robots.txt`
advertises the sitemap and every sitemap URL is reachable; TLS handshakes; www behaviour;
asset hashes match `dist/roboracer-site/SHA256SUMS`; and no localhost or AmbiSecure
references appear in the live HTML.

**Then, manually — the script is not sufficient:**

- [ ] Load the site in a real browser at 375px and 1440px
- [ ] Open the mobile menu; check Escape closes it and focus returns to the toggle
- [ ] Tab through the page — the skip link appears first, focus rings are visible
- [ ] Browser console is free of errors and failed network requests
- [ ] Both **Order Now** routes work (India → Gmail compose; Rest of World → orders.ambimat.com)
- [ ] Both downloads work (`roboracer-board.zip`, `roboracer-board.pdf`)
- [ ] **Access Directory** and **Access Community** open correctly
- [ ] GA4 records the pageview (Realtime report)
- [ ] Re-run Lighthouse against production as a non-deploying check:
      `npx lighthouse https://roboracer.ambimat.com/ --preset=desktop --view`

## 7. Rollback

**Triggers** — roll back immediately if, after a deploy:

- the home page or any core route does not return 200
- `verify-production.sh` reports a failure that is not a stale-DNS artefact
- the browser console shows errors that were not present before
- an Order Now route or a download is broken
- Lighthouse against production drops below the CI gates
- GA4 stops recording pageviews

**Procedure** (FTPS has no automatic previous release, so this is deliberate):

1. Go to the **last known-good** run of _Deploy to Hostinger_ in the Actions tab.
2. Download its `production-artifact` (30-day retention).
3. Verify it: `cd <extracted> && shasum -a 256 -c SHA256SUMS`
4. Upload it over the web root with any FTPS client, or re-run the deploy workflow from
   the known-good commit (`git checkout <sha>` → branch → dispatch).
5. Re-run `bash tools/verify-production.sh` and confirm green.
6. If the artifact has expired, rebuild from the known-good commit:
   `git checkout <sha> && npm ci && npm run build`.

For the **first** deploy the rollback target is the hPanel backup taken in §5, since there
is no prior artifact.

## 8. DNS and TLS assumptions

Assumed, and to be confirmed in hPanel before the first deploy — none of it was verified
during this work, because doing so would mean touching production:

- `roboracer.ambimat.com` is a subdomain served by Hostinger, resolving to the Hostinger IP
- SSL is issued for that subdomain and auto-renews; `.htaccess` force-redirects to HTTPS
- HSTS is set by `.htaccess` (`max-age=31536000; includeSubDomains`) — **note this is
  inherited by every `*.ambimat.com` subdomain**; confirm that is intended before deploying,
  and drop `includeSubDomains` if not
- `www.roboracer.ambimat.com` is either not configured or redirects to the apex.
  `verify-production.sh` flags a 200 there as a duplicate-content risk

## 9. Recommended follow-up: atomic releases over SSH

If the plan includes SSH, replace the FTPS step with:

1. `rsync` the artifact to `~/releases/<git-sha>/`
2. verify remotely: `shasum -a 256 -c SHA256SUMS`
3. `ln -sfn ~/releases/<sha> ~/current` and point the web root at `current`
4. keep the last 3 releases; rollback becomes re-pointing the symlink (instant, atomic)

This removes the mixed-state window and makes rollback a one-command operation. It needs
confirmation of the plan tier and of whether the document root can be a symlink on
Hostinger's LiteSpeed setup.
