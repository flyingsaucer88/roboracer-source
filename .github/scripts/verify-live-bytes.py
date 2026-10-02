#!/usr/bin/env python3
"""Fail unless production serves, byte for byte, the tree this deploy built.

    verify-live-bytes.py <built-dir> <origin>

FTP-Deploy-Action decides what to upload from its own state file on the server,
not from what the server holds, so it can skip a file and still report success.
AmbiPower shipped green while production served old bytes (2026-10-02). This
fetches every shipped file over HTTPS and compares its SHA-256 with the built
copy, so a deploy that did not land cannot end green.

Copied verbatim into roboracer-source, ambiautomations-site, esim-website and
v2x-site under .github/scripts/ — never inside a deployable tree.
"""
import hashlib
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# Build metadata the web server denies or that is never published.
SKIP = {'SHA256SUMS', 'build-manifest.json'}


def targets(root):
    for dp, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.startswith('.') or f in SKIP:
                continue
            rel = os.path.relpath(os.path.join(dp, f), root).replace(os.sep, '/')
            yield rel


def url_for(origin, rel):
    rel = urllib.parse.quote(rel)
    if rel == 'index.html':
        return origin + '/'
    if rel.endswith('/index.html'):
        return f'{origin}/{rel[:-len("index.html")]}'
    return f'{origin}/{rel}'


def check(origin, root, rel):
    with open(os.path.join(root, rel), 'rb') as f:
        want = hashlib.sha256(f.read()).hexdigest()
    req = urllib.request.Request(url_for(origin, rel), headers={
        'User-Agent': 'ambimat-deploy-verify', 'Accept-Encoding': 'identity'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        # Bytes, not status: 404.html is served with a 404, and a missing or
        # denied file still fails because its error body is not the built file.
        body = e.read()
    except Exception as e:  # noqa: BLE001 — any fetch failure is a failed verification
        return rel, f'fetch failed: {e}'
    got = hashlib.sha256(body).hexdigest()
    return rel, None if got == want else f'served {got[:12]}, built {want[:12]}'


def main():
    root, origin = sys.argv[1], sys.argv[2].rstrip('/')
    pending = sorted(targets(root))
    total = len(pending)
    if not total:
        sys.exit(f'::error::{root} is empty — nothing to verify')
    # Hostinger's filesystem can lag the FTPS session by a few seconds.
    for attempt in range(4):
        with ThreadPoolExecutor(8) as ex:
            bad = [(rel, err) for rel, err in ex.map(lambda r: check(origin, root, r), pending) if err]
        pending = [rel for rel, _ in bad]
        if not bad:
            print(f'live bytes match the build: {total}/{total} files')
            return
        if attempt < 3:
            print(f'{len(bad)} file(s) differ; rechecking in 20s')
            time.sleep(20)
    for rel, err in bad:
        print(f'::error::{url_for(origin, rel)} — {err}')
    sys.exit(f'::error::{len(bad)}/{total} shipped files are not what production serves')


if __name__ == '__main__':
    main()
