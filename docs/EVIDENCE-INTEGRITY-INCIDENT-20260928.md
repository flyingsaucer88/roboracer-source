# Evidence-integrity incident — 2026-09-28

## What happened

The identity correction shipped as `e2d8172`
(_fix(identity): restore the approved US number and retire the old address_,
2026-09-28 16:44:49 +0530) was applied with a repo-wide text substitution.
The substitution was scoped to file _type_, not to file _role_, so it also
rewrote ten **historical evidence captures** under
`reports/orders_backgroundless_image_20260915T000000Z/evidence/`.

Those captures are point-in-time records of what `roboracer.ambimat.com` and
`orders.ambimat.com` actually served on 2026-09-15. Rewriting them is not a
correction — it retroactively falsifies the record. The captures are supposed
to show the old address, because the old address is what was live.

The mutation also demonstrably corrupted the text rather than cleanly
replacing it. In `contact.live.html` the body copy became:

```
1005 Shivalik Shilp 2, Opp ITC Narmada, Shivalik Shilp II, Ahmedabad
```

— a double-substitution artifact that exists in neither the historical nor the
approved address. **Reversing the substitution was therefore never a safe
recovery path.** Only the original bytes were authoritative.

## Timeline

| Time (IST)                   | Event                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------- |
| 2026-09-15                   | Evidence captures taken (the record being protected)                             |
| 2026-09-28 16:33:15          | APFS local Time Machine snapshot `com.apple.TimeMachine.2026-09-28-163315.local` |
| 2026-09-28 16:36:39          | Site source `*.html` correctly updated (intended change)                         |
| **2026-09-28 16:39:05**      | **Ten historical captures accidentally mutated**                                 |
| 2026-09-28 16:40:02–16:40:22 | `dist/` site copies updated (intended change)                                    |
| 2026-09-28 16:44:49          | Commit `e2d8172`                                                                 |
| 2026-09-29                   | Recovery from snapshot (this document)                                           |

The snapshot predates the mutation by 5m50s, so it holds the pre-mutation
bytes. It was the only recovery authority used.

## Recovery method

Snapshot mounted read-only:

```sh
mkdir -p /tmp/snap1633 && sudo mount_apfs -o ro -s com.apple.TimeMachine.2026-09-28-163315.local \
  /System/Volumes/Data /tmp/snap1633
```

For each affected file: record damaged SHA-256, record snapshot SHA-256, copy
snapshot bytes over the live file, re-hash, assert `restored == snapshot`.
No text was reconstructed and no substitution was reversed.

## Affected files and hashes

Five primary captures, plus five byte-identical nested copies under the
repeated `dist/.../roboracer-site/` tree (ten files, five distinct contents).
`index.live.html` and `roboracer.ambimat.com.live.html` are the same page
captured under two names, hence the shared hash.

| File (relative)                                                                                                                                       | Damaged SHA-256     | Snapshot / restored SHA-256 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------- |
| `reports/orders_backgroundless_image_20260915T000000Z/evidence/autonomous-racing-robotics-kit.live.html`                                              | `96137c1321b7b706…` | `90cdb08c17d58c3c…`         |
| `reports/orders_backgroundless_image_20260915T000000Z/evidence/contact.live.html`                                                                     | `0666454e3edb9987…` | `96fb8271ede0d26f…`         |
| `reports/orders_backgroundless_image_20260915T000000Z/evidence/index.live.html`                                                                       | `b2fcef25691d1d51…` | `b2462be632d6c935…`         |
| `reports/orders_backgroundless_image_20260915T000000Z/evidence/roboracer.ambimat.com.live.html`                                                       | `b2fcef25691d1d51…` | `b2462be632d6c935…`         |
| `reports/orders_backgroundless_image_20260915T000000Z/evidence/specifications.live.html`                                                              | `ea3471cc7d390638…` | `07c3c14dcc8f5a32…`         |
| `dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/autonomous-racing-robotics-kit.live.html` | `96137c1321b7b706…` | `90cdb08c17d58c3c…`         |
| `dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/contact.live.html`                        | `0666454e3edb9987…` | `96fb8271ede0d26f…`         |
| `dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/index.live.html`                          | `b2fcef25691d1d51…` | `b2462be632d6c935…`         |
| `dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/roboracer.ambimat.com.live.html`          | `b2fcef25691d1d51…` | `b2462be632d6c935…`         |
| `dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/specifications.live.html`                 | `ea3471cc7d390638…` | `07c3c14dcc8f5a32…`         |

Full 64-character hashes, per file, damaged / snapshot / restored:

```
reports/orders_backgroundless_image_20260915T000000Z/evidence/autonomous-racing-robotics-kit.live.html
  damaged   96137c1321b7b70655cab2e977dbf094940fdddc8bb3638fdf804790756cf32f
  snapshot  90cdb08c17d58c3c26c91fa9fbdfa3bb7de1c95e6d0fd50a20944869eff0a587
  restored  90cdb08c17d58c3c26c91fa9fbdfa3bb7de1c95e6d0fd50a20944869eff0a587
  verdict   PASS
reports/orders_backgroundless_image_20260915T000000Z/evidence/contact.live.html
  damaged   0666454e3edb9987953e5a49ebb4d35304b72a90031036fb9c3df0bdbd57b4f4
  snapshot  96fb8271ede0d26f8616cdc8200a857b9a4bac3bab13638f849ffedf1e8e9ae3
  restored  96fb8271ede0d26f8616cdc8200a857b9a4bac3bab13638f849ffedf1e8e9ae3
  verdict   PASS
reports/orders_backgroundless_image_20260915T000000Z/evidence/index.live.html
  damaged   b2fcef25691d1d51d79da47e8fa659e92209a991b1c70a85ccc1e5bb6c934ef5
  snapshot  b2462be632d6c935eba2113b082449c563a2d6c5c471fe9c6d976c13f7e8eaec
  restored  b2462be632d6c935eba2113b082449c563a2d6c5c471fe9c6d976c13f7e8eaec
  verdict   PASS
reports/orders_backgroundless_image_20260915T000000Z/evidence/roboracer.ambimat.com.live.html
  damaged   b2fcef25691d1d51d79da47e8fa659e92209a991b1c70a85ccc1e5bb6c934ef5
  snapshot  b2462be632d6c935eba2113b082449c563a2d6c5c471fe9c6d976c13f7e8eaec
  restored  b2462be632d6c935eba2113b082449c563a2d6c5c471fe9c6d976c13f7e8eaec
  verdict   PASS
reports/orders_backgroundless_image_20260915T000000Z/evidence/specifications.live.html
  damaged   ea3471cc7d3906380cdf3968b51d3fb9a523f92e307658df42a782bfd05cd83c
  snapshot  07c3c14dcc8f5a32ff1b5072335761f247e7c16a7a458c0fe36f7abe23f45a22
  restored  07c3c14dcc8f5a32ff1b5072335761f247e7c16a7a458c0fe36f7abe23f45a22
  verdict   PASS
dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/autonomous-racing-robotics-kit.live.html
  damaged   96137c1321b7b70655cab2e977dbf094940fdddc8bb3638fdf804790756cf32f
  snapshot  90cdb08c17d58c3c26c91fa9fbdfa3bb7de1c95e6d0fd50a20944869eff0a587
  restored  90cdb08c17d58c3c26c91fa9fbdfa3bb7de1c95e6d0fd50a20944869eff0a587
  verdict   PASS
dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/contact.live.html
  damaged   0666454e3edb9987953e5a49ebb4d35304b72a90031036fb9c3df0bdbd57b4f4
  snapshot  96fb8271ede0d26f8616cdc8200a857b9a4bac3bab13638f849ffedf1e8e9ae3
  restored  96fb8271ede0d26f8616cdc8200a857b9a4bac3bab13638f849ffedf1e8e9ae3
  verdict   PASS
dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/index.live.html
  damaged   b2fcef25691d1d51d79da47e8fa659e92209a991b1c70a85ccc1e5bb6c934ef5
  snapshot  b2462be632d6c935eba2113b082449c563a2d6c5c471fe9c6d976c13f7e8eaec
  restored  b2462be632d6c935eba2113b082449c563a2d6c5c471fe9c6d976c13f7e8eaec
  verdict   PASS
dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/roboracer.ambimat.com.live.html
  damaged   b2fcef25691d1d51d79da47e8fa659e92209a991b1c70a85ccc1e5bb6c934ef5
  snapshot  b2462be632d6c935eba2113b082449c563a2d6c5c471fe9c6d976c13f7e8eaec
  restored  b2462be632d6c935eba2113b082449c563a2d6c5c471fe9c6d976c13f7e8eaec
  verdict   PASS
dist/dist/dist/dist/dist/dist/roboracer-site/reports/orders_backgroundless_image_20260915T000000Z/evidence/specifications.live.html
  damaged   ea3471cc7d3906380cdf3968b51d3fb9a523f92e307658df42a782bfd05cd83c
  snapshot  07c3c14dcc8f5a32ff1b5072335761f247e7c16a7a458c0fe36f7abe23f45a22
  restored  07c3c14dcc8f5a32ff1b5072335761f247e7c16a7a458c0fe36f7abe23f45a22
  verdict   PASS
```

## Result

```
ROBORACER_FILES_AFFECTED          = 10
ROBORACER_FILES_EXACTLY_RECOVERED = 10
ROBORACER_HISTORICAL_EVIDENCE     = RESTORED_EXACT
```

A full sweep of both report trees (229 files) against the snapshot afterwards
returned zero differences and zero files missing from the snapshot, confirming
the affected set was exactly these ten.

The snapshot was unmounted after verification.

## Standing rule this establishes

A repo-wide substitution must exclude `reports/**/evidence/**`. Evidence
captures are immutable by definition: they record what was served, not what
should have been served. A correction pass that can reach them is a correction
pass that can rewrite its own audit trail.

Practically: scope substitutions with an explicit path allowlist (the site
source and `dist/`), never with a bare `find . -name '*.html'`.
