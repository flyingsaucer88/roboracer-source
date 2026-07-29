#!/usr/bin/env bash
# Post-deployment verification for https://roboracer.ambimat.com/
#
#   bash tools/verify-production.sh [base-url]
#
# Read-only: performs GET/HEAD requests against the live site and compares
# what it finds with the artifact in dist/roboracer-site (if present).
# Nothing is uploaded, changed or deleted.
#
# Exit 0 = every check passed. Exit 1 = at least one check failed.
#
# NOTE: this proves the deployment is serving correctly. It is NOT a
# substitute for a human loading the site. Do not claim production success
# on the basis of this script alone.

set -uo pipefail

BASE="${1:-https://roboracer.ambimat.com}"
BASE="${BASE%/}"
DIST="$(cd "$(dirname "$0")/.." && pwd)/dist/roboracer-site"

pass=0
fail=0

ok()   { printf "  \033[32mPASS\033[0m  %s\n" "$1"; pass=$((pass + 1)); }
bad()  { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; fail=$((fail + 1)); }
head1() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# On a connection/resolve failure curl still writes "%{http_code}" as "000"
# and exits non-zero. Capturing into a var and defaulting the empty case gives
# a clean "000" — a `|| echo "000"` would instead APPEND to curl's own "000"
# and produce "000000", which no case branch matches.
status() { local c; c="$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time 20 "$1" 2>/dev/null)"; echo "${c:-000}"; }
status_noredirect() { local c; c="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$1" 2>/dev/null)"; echo "${c:-000}"; }
location() { curl -sS -o /dev/null -w '%{redirect_url}' --max-time 20 "$1" 2>/dev/null; }
body() { curl -sS -L --max-time 20 "$1" 2>/dev/null; }

# ---------------------------------------------------------------------
head1 "1. Core routes return 200"
for path in "/" "/autonomous-racing-robotics-kit.html" "/specifications.html" \
            "/getting-started.html" "/use-cases.html" \
            "/contact.html" "/resource.html" "/robots.txt" "/sitemap.xml" \
            "/site.webmanifest" "/assets/css/main.css" "/assets/js/nav.js" \
            "/assets/img/roboracer-og.png" "/assets/fonts/montserrat.woff2" \
            "/files/roboracer-board.pdf" "/files/roboracer-board.zip"; do
    code="$(status "${BASE}${path}")"
    if [ "$code" = "200" ]; then ok "200  ${path}"; else bad "${code}  ${path} (expected 200)"; fi
done

# ---------------------------------------------------------------------
head1 "2. 404 handling"
code="$(status "${BASE}/this-page-does-not-exist-$$")"
if [ "$code" = "404" ]; then
    ok "404 returned for an unknown path"
else
    bad "unknown path returned ${code} (expected 404 — a soft-404 harms indexing)"
fi
if body "${BASE}/this-page-does-not-exist-$$" | grep -qi "could not be found"; then
    ok "custom 404 page is being served"
else
    bad "custom 404 body not detected (ErrorDocument may not be wired up)"
fi

# ---------------------------------------------------------------------
head1 "3. Redirects and canonicalisation"
loc="$(location "${BASE}/index.html")"
case "$loc" in
    "${BASE}/"|"${BASE}") ok "/index.html -> / (301)" ;;
    "")                   bad "/index.html did not redirect (expected 301 to /)" ;;
    *)                     bad "/index.html redirected to ${loc} (expected ${BASE}/)" ;;
esac

for alias in "/contact" "/resource" "/resources" "/core-kit" "/specs" "/getting-started" "/use-cases"; do
    loc="$(location "${BASE}${alias}")"
    if [ -n "$loc" ]; then ok "${alias} -> ${loc}"; else bad "${alias} did not redirect"; fi
done

http_base="http://${BASE#https://}"
loc="$(location "${http_base}/")"
case "$loc" in
    https://*) ok "http:// redirects to ${loc}" ;;
    *)         bad "http:// did not redirect to https (got '${loc:-none}')" ;;
esac

# ---------------------------------------------------------------------
head1 "4. Canonical URLs, robots and sitemap"
for path in "/" "/autonomous-racing-robotics-kit.html" "/specifications.html" \
            "/getting-started.html" "/use-cases.html" "/contact.html" "/resource.html"; do
    expected="${BASE}${path}"
    [ "$path" = "/" ] && expected="${BASE}/"
    found="$(body "${BASE}${path}" | grep -o '<link rel="canonical" href="[^"]*"' | head -1 | sed 's/.*href="//;s/"//')"
    if [ "$found" = "$expected" ]; then
        ok "canonical on ${path} is ${found}"
    else
        bad "canonical on ${path} is '${found:-missing}' (expected ${expected})"
    fi
done

if body "${BASE}/robots.txt" | grep -q "Sitemap: ${BASE}/sitemap.xml"; then
    ok "robots.txt advertises the sitemap"
else
    bad "robots.txt is missing the Sitemap line"
fi

sitemap="$(body "${BASE}/sitemap.xml")"
if printf '%s' "$sitemap" | grep -q "<urlset"; then
    ok "sitemap.xml is a urlset ($(printf '%s' "$sitemap" | grep -c '<loc>') URLs)"
else
    bad "sitemap.xml does not look like a sitemap"
fi
printf '%s' "$sitemap" | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g' | while read -r url; do
    code="$(status "$url")"
    [ "$code" = "200" ] && printf "  \033[32mPASS\033[0m  sitemap URL 200  %s\n" "$url" \
                        || printf "  \033[31mFAIL\033[0m  sitemap URL %s  %s\n" "$code" "$url"
done

# ---------------------------------------------------------------------
head1 "5. TLS and www behaviour"
if curl -sS -o /dev/null --max-time 20 "${BASE}/" 2>/dev/null; then
    ok "TLS handshake succeeded (certificate validates)"
else
    bad "TLS handshake failed — check the certificate"
fi
www="https://www.${BASE#https://}"
code="$(status_noredirect "${www}/")"
case "$code" in
    301|302|308) ok "www host redirects (${code})" ;;
    200)         bad "www host serves 200 directly — duplicate-content risk, add a redirect" ;;
    000)         ok "www host does not resolve (no duplicate-content risk)" ;;
    *)           bad "www host returned ${code}" ;;
esac

# ---------------------------------------------------------------------
head1 "6. Content integrity vs the CI artifact"
if [ -f "${DIST}/SHA256SUMS" ]; then
    checked=0
    while read -r expected_hash rel; do
        rel="${rel#./}"
        case "$rel" in
            *.html|SHA256SUMS|.htaccess) continue ;;   # HTML/config may be rewritten by the host
        esac
        [ "$checked" -ge 8 ] && break
        actual="$(curl -sS -L --max-time 20 "${BASE}/${rel}" 2>/dev/null | shasum -a 256 | awk '{print $1}')"
        if [ "$actual" = "$expected_hash" ]; then ok "hash matches  ${rel}"; else bad "hash MISMATCH ${rel}"; fi
        checked=$((checked + 1))
    done < "${DIST}/SHA256SUMS"
else
    printf "  \033[33mSKIP\033[0m  no dist/roboracer-site/SHA256SUMS — run 'npm run build' to enable hash comparison\n"
fi

# ---------------------------------------------------------------------
head1 "7. No development artefacts in production HTML"
for path in "/" "/autonomous-racing-robotics-kit.html" "/specifications.html" \
            "/getting-started.html" "/use-cases.html" "/contact.html" "/resource.html"; do
    page="$(body "${BASE}${path}")"
    if printf '%s' "$page" | grep -qiE 'https?://(localhost|127\.0\.0\.1)'; then
        bad "${path} contains a localhost URL"
    else
        ok "${path} has no localhost URLs"
    fi
    if printf '%s' "$page" | grep -qi 'ambisecure\.ambimat\.com'; then
        bad "${path} references the AmbiSecure domain"
    else
        ok "${path} has no AmbiSecure domain references"
    fi
done

# ---------------------------------------------------------------------
head1 "Summary"
printf "  %d passed, %d failed\n\n" "$pass" "$fail"
if [ "$fail" -gt 0 ]; then
    echo "Deployment is NOT verified. See docs/DEPLOYMENT.md for the rollback procedure."
    exit 1
fi
cat <<'EOF'
Automated checks passed. Still required before declaring success:
  - load the site in a real browser at 375px and 1440px
  - confirm the browser console is free of errors and failed requests
  - click through both Order Now routes and both download buttons
  - re-run Lighthouse against production (see docs/CI-AND-QUALITY-GATES.md)
EOF
