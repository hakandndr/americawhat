# americawhat — Open Graph images

Authoritative since 2026-10-15 (commit 7861020). Replaces the "OG görselleri"
notes in older documents.

## Decision

1. The **125 approved images** (`public/og/`: 124 stories + `default.png`) are
   frozen, committed release inputs listed with SHA-256 in
   `scripts/release/approved-og.json`. They are never regenerated for a release.
   Production adopts them at cutover.
2. Stories published **after** the approval get an image from the **pinned
   renderer** at build time: `python scripts/gen-og.py --missing` writes
   `.og-generated/<id>.png` (git-ignored) plus a manifest of input digests;
   `npm run build:rc` copies them into `dist/og/` and refuses missing, stale,
   tampered or unpinned output.
3. The deploy workflow runs `gen-og.py --verify-approved` first: the renderer
   must reproduce every approved image pixel-for-pixel, so new images look
   exactly like the approved ones.

No runtime image service, no external service, no new Cloudflare product: the
images are static assets of the Web Worker (static asset requests are free on
Workers Paid). Same item URL → same image URL `/og/<id>.png` as on Hostinger,
so existing social shares keep resolving.

## Why production differed (root cause, verified)

`deploy.yml` on `main` runs `pip install pillow` (unpinned) on Ubuntu and
regenerates every image on each deploy. The approved archive was produced with
Pillow 11.3.0 on Windows. Findings (2026-10-15, renders compared in memory):

| Renderer | vs approved archive |
|---|---|
| Pillow 11.3.0, Windows wheel (FreeType 2.13.3, no libraqm) | 125/125 byte-identical |
| Pillow 11.3.0, Linux wheel, default layout (libraqm present) | 0/125 pixel-identical: titles kerned differently |
| Pillow 11.3.0, Linux wheel, `layout_engine=BASIC` | 125/125 pixel-identical (bytes differ: bundled zlib vs zlib-ng) |
| Pillow 12.3.0 (current unpinned), Linux | 0/125 pixel-identical (FreeType 2.14 + libraqm) |
| Hostinger backup `public_html/og/` (read-only) | 0/125 pixel-identical; file dates span 11 deploy days |

So production is a patchwork of renders from whatever Pillow was current on
each deploy day (the FTP action uploads only changed files). Nothing about the
approved set needs to change; the renderer now forces the BASIC layout engine,
pins Pillow/FreeType by version and hash (`scripts/og/requirements.txt`,
binary wheels only) and checks both font hashes.

## Commands

```bash
python -m pip install --only-binary=:all: --require-hashes -r scripts/og/requirements.txt
```

```bash
npm run og:verify
```

```bash
npm run build:og
```

`build:og` is `gen-og.py --missing`; it never writes to `public/og/`.
`gen-og.py --all --out <dir>` previews every image elsewhere
(`--allow-unpinned` only for previews). With an unpinned Pillow the script
exits 2.

## Fallback

If one story fails to render, its image is a copy of the approved
`default.png`, marked `fallback` in the manifest, and the build continues with
a warning; the next build retries. If the pinned renderer cannot be installed
(PyPI outage), the build job fails before anything is uploaded and the live
version keeps serving.

## Edited stories

An approved image keeps the text it was approved with. If Boss edits the
title, category or source of such a story, `build:rc` prints
`OG warning: Approved OG image shows older text for: <id>`. Default: accept
(social platforms cache previews anyway). To refresh one, remove its entry
and file from the approved archive in a reviewed commit; the next build
renders it with the pinned renderer.

## Known design limitation (owner decision, not blocking)

When the source name is long, "Source: …" runs under the `americawhat.com`
label. It affects 2 of the 124 approved images and would affect new stories
the same way. Recommended default: leave the approved images as they are and,
if wanted, add source truncation as a layout change for new stories only
(it must not be applied to the approved set).
