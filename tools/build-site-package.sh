#!/usr/bin/env bash
# Build dist/roboracer-site/ — the exact tree that should land in the
# Hostinger web root — plus dist/roboracer-site.zip for manual upload.
#
#   bash tools/build-site-package.sh
#
# The build is a filtered copy: this is a no-framework static site, so
# "building" means selecting precisely which files are public. Everything
# not on the allowlist below stays out of the web root.
#
# dist/ is gitignored.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
OUT="${REPO}/dist/roboracer-site"
ZIP="${REPO}/dist/roboracer-site.zip"

echo "Building RoboRacer site package -> ${OUT}"

rm -rf "${OUT}" "${ZIP}"
mkdir -p "${OUT}"

# Deny-list copy. Anchored excludes (leading slash) so a directory name
# only matches at the repository root.
rsync -a \
  --exclude='/.git/' \
  --exclude='/.github/' \
  --exclude='/.githooks/' \
  --exclude='/.claude/' \
  --exclude='/.lighthouseci/' \
  --exclude='/.gitignore' \
  --exclude='/.gitattributes' \
  --exclude='/docs/' \
  --exclude='/tools/' \
  --exclude='/tests/' \
  --exclude='/dist/' \
  --exclude='/node_modules/' \
  --exclude='/package.json' \
  --exclude='/package-lock.json' \
  --exclude='/.lighthouserc.json' \
  --exclude='/.lighthouserc.mobile.json' \
  --exclude='/.htmlvalidate.json' \
  --exclude='/.stylelintrc.json' \
  --exclude='/eslint.config.mjs' \
  --exclude='/.prettierrc.json' \
  --exclude='/.prettierignore' \
  --exclude='/README.md' \
  --exclude='*.md' \
  --exclude='.DS_Store' \
  --exclude='*.map' \
  --exclude='*.py' \
  --exclude='*.sh' \
  --exclude='*.pyc' \
  --exclude='__pycache__/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.swp' \
  --exclude='*.bak' \
  "${REPO}/" "${OUT}/"

# rsync's --exclude='.*' style patterns skip dotfiles we DO need, so the
# web-server config is copied back explicitly and verified below.
cp "${REPO}/.htaccess" "${OUT}/.htaccess"

# ---------------------------------------------------------------------
# Minify CSS into the artifact. The source stays readable and commented;
# only the shipped bytes are compressed. lightningcss also downlevels the
# modern media-query range syntax (`width <= 1080px`) that stylelint
# normalises to, restoring support for pre-2022 Safari and Firefox.
#
# This is a hard requirement, not best-effort: a silently unminified
# stylesheet would fail the Lighthouse `unminified-css` gate later and
# waste a CI run.
# ---------------------------------------------------------------------
if [[ ! -x "${REPO}/node_modules/.bin/lightningcss" ]]; then
    echo "ERROR: node_modules/.bin/lightningcss not found — run 'npm ci' first." >&2
    exit 1
fi

echo
echo "Minifying CSS:"
for css in "${OUT}"/assets/css/*.css; do
    before=$(wc -c < "${css}" | tr -d ' ')
    "${REPO}/node_modules/.bin/lightningcss" \
        --minify \
        --targets '>= 0.25%' \
        "${css}" -o "${css}.min"
    mv "${css}.min" "${css}"
    after=$(wc -c < "${css}" | tr -d ' ')
    printf "  %-14s %6s B -> %6s B\n" "$(basename "${css}")" "${before}" "${after}"
done

echo
echo "Package contents:"
printf "  HTML pages:   %s\n" "$(find "${OUT}" -name '*.html' | wc -l | tr -d ' ')"
printf "  CSS files:    %s\n" "$(find "${OUT}/assets/css" -type f 2>/dev/null | wc -l | tr -d ' ')"
printf "  JS files:     %s\n" "$(find "${OUT}/assets/js" -type f 2>/dev/null | wc -l | tr -d ' ')"
printf "  Images:       %s\n" "$(find "${OUT}/assets/img" -type f 2>/dev/null | wc -l | tr -d ' ')"
printf "  Fonts:        %s\n" "$(find "${OUT}/assets/fonts" -type f 2>/dev/null | wc -l | tr -d ' ')"
printf "  Downloads:    %s\n" "$(find "${OUT}/files" -type f 2>/dev/null | wc -l | tr -d ' ')"
printf "  Total size:   %s\n" "$(du -sh "${OUT}" | cut -f1)"

echo
echo "Required-file check:"
required=(index.html 404.html contact.html resource.html \
          autonomous-racing-robotics-kit.html specifications.html \
          getting-started.html use-cases.html \
          robots.txt sitemap.xml site.webmanifest .htaccess)
for f in "${required[@]}"; do
    if [[ -f "${OUT}/${f}" ]]; then
        printf "  OK      %s\n" "${f}"
    else
        printf "  MISSING %s\n" "${f}"
        exit 1
    fi
done

echo
echo "Forbidden-file check:"
# Anything matching these must never reach the public web root.
forbidden=$(find "${OUT}" \( \
    -name '*.py' -o -name '*.sh' -o -name '*.md' -o -name '*.map' \
    -o -name '.env*' -o -name '*.pem' -o -name '*.key' -o -name 'package*.json' \
    -o -name '.DS_Store' -o -name '*.yml' -o -name '*.yaml' \
    -o -name 'node_modules' -o -name '.git' \) -print)
if [[ -n "${forbidden}" ]]; then
    echo "  FAIL — these must not ship:"
    echo "${forbidden}" | sed 's/^/    /'
    exit 1
fi
echo "  OK      no source, secret, tooling or CI files in the artifact"

# Checksum manifest — post-deployment verification compares live asset
# hashes against this file.
( cd "${OUT}" && find . -type f ! -name 'SHA256SUMS' -print0 \
    | sort -z | xargs -0 shasum -a 256 > SHA256SUMS )
printf "\n  Checksums:    %s files -> SHA256SUMS\n" "$(wc -l < "${OUT}/SHA256SUMS" | tr -d ' ')"

echo
echo "Creating ${ZIP}"
( cd "${OUT}" && zip -rq "${ZIP}" . -x ".DS_Store" "*.DS_Store" )
printf "  Zip size:     %s\n" "$(du -sh "${ZIP}" | cut -f1)"

echo
echo "Done. Artifact root: ${OUT}"
