#!/usr/bin/env python3
"""
americawhat — deterministic Open Graph image generator.

The 125 PNGs in public/og/ are the APPROVED archive (scripts/release/approved-og.json).
They are committed, frozen release inputs: this script never writes into
public/og/ and never regenerates them for a release.

Modes (all read src/data/published.json):

  python scripts/gen-og.py --missing
      Default. Renders an image ONLY for published items that have no approved
      PNG into .og-generated/<id>.png (git-ignored) and records each one in
      .og-generated/manifest.json with the digest of its render inputs. An
      up-to-date image is kept; one whose title/category/source changed is
      re-rendered; entries for items that are no longer published or are now
      approved are dropped. scripts/release/build-rc.mjs copies these files into
      dist/og/ after the Astro build. If one item fails to render, a copy of the
      approved default.png is used for it and the entry is marked "fallback"
      (the build continues; the next run retries).

  python scripts/gen-og.py --verify-approved
      Renders every approved image into a temporary directory and compares
      PIXELS with public/og/. Proves that this pinned renderer is the one that
      produced the approved archive (bytes may differ across platforms: the
      Windows and Linux Pillow wheels bundle different zlib builds). Exit 1 on
      any pixel difference.

  python scripts/gen-og.py --all --out <dir> [--allow-unpinned]
      Preview: renders everything into <dir> (never public/og/).

Determinism: Pillow and FreeType versions and the two bundled fonts are pinned
(scripts/og/requirements.txt, FONT_SHA256 below) and text layout is forced to
Pillow's BASIC engine. Linux wheels ship libraqm and Windows wheels do not;
without forcing BASIC the same Pillow version kerns titles differently per
platform, which is one reason production (unpinned `pip install pillow` on
Linux) never matched the approved archive.

Design: dark theme, left red accent, "americawhat?" wordmark top-left, category
chip (own colour) top-right, big auto-sizing title, prominent Source, and
americawhat.com bottom-right. No date. Fonts are bundled under scripts/og-fonts
(SIL OFL) so the build never depends on the network.
"""
import argparse, hashlib, json, os, shutil, sys, tempfile
from PIL import Image, ImageChops, ImageDraw, ImageFont, features
import PIL

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "scripts", "og-fonts")
TITLE_FONT = os.path.join(FONT_DIR, "BigShoulders-Bold.ttf")
MONO_FONT = os.path.join(FONT_DIR, "IBMPlexMono-Bold.ttf")
PUB_JSON = os.path.join(ROOT, "src", "data", "published.json")
APPROVED_DIR = os.path.join(ROOT, "public", "og")
APPROVED_JSON = os.path.join(ROOT, "scripts", "release", "approved-og.json")
GENERATED_DIR = os.path.join(ROOT, ".og-generated")

# The renderer that reproduced the approved archive (2026-10-15).
PINNED_PILLOW = "11.3.0"
PINNED_FREETYPE = "2.13.3"
FONT_SHA256 = {
    "BigShoulders-Bold.ttf": "b43bcd198b9fdf717dd42aa61a34dba32e01aceaeae659d689afd0ca52c37ea2",
    "IBMPlexMono-Bold.ttf": "dbd2a2fb024579438d6400a84e57579bfd2dbe67c306c8fd9fde92a61e4f2eea",
}

W, H = 1200, 630
NIGHT = (11, 17, 32)
INK = (238, 242, 255)
DIM = (142, 160, 201)
STAR = (244, 241, 230)
LINE = (30, 41, 64)
RED = (255, 84, 104)

# Keep in sync with src/data/categories.js
CATS = {
    "bureaucracy":     ("Bureaucracy",     (242, 166, 35)),
    "florida-man":     ("Florida Man",     (255, 84, 104)),
    "hoa-housing":     ("HOA & Housing",   (45, 212, 191)),
    "fine-print":      ("Fine Print",      (212, 163, 115)),
    "only-in-america": ("Only in America", (74, 158, 255)),
    "food-crime":      ("Food Crime",      (251, 146, 60)),
    "crime-weird":     ("Crime & Weird",   (156, 140, 255)),
}

PAD = 70
TITLE_TOP = 150          # title block starts below the header row
TITLE_BOTTOM = H - 118   # title must not run into the Source line
MAX_TITLE_H = TITLE_BOTTOM - TITLE_TOP


def font(path, size):
    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.BASIC)


def _glow(d, height, cap):
    for y in range(height):
        a = int(46 * (1 - y / height))
        d.line([(0, y), (W, y)], fill=(min(11 + a, cap[0]), min(17 + a, cap[1]), min(32 + a, cap[2])))


def _wrap(d, text, font, maxw):
    lines, cur = [], ""
    for word in text.split():
        t = (cur + " " + word).strip()
        if d.textlength(t, font=font) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def source_of(item):
    return item.get("source_name") or item.get("sourceName") or ""


def input_digest(item):
    """SHA-256 of exactly the fields drawn on an item image (same rule in scripts/release/og.mjs)."""
    fields = [str(item.get("id", "")), str(item.get("title", "")), str(item.get("category", "")), str(source_of(item))]
    return hashlib.sha256("\x1f".join(fields).encode("utf-8")).hexdigest()


def render_item(item, out_path):
    img = Image.new("RGB", (W, H), NIGHT)
    d = ImageDraw.Draw(img)
    _glow(d, 150, (64, 86, 124))
    d.rectangle([0, 0, 10, H], fill=RED)

    brand = font(TITLE_FONT, 42)
    label = font(MONO_FONT, 26)
    src_f = font(MONO_FONT, 30)
    site_f = font(MONO_FONT, 26)

    # header row — brand wordmark: white "america", red "what", white "?"
    bx, by = PAD, 52
    d.text((bx, by), "america", font=brand, fill=INK)
    bx += d.textlength("america", font=brand)
    d.text((bx, by), "what", font=brand, fill=RED)
    bx += d.textlength("what", font=brand)
    d.text((bx, by), "?", font=brand, fill=INK)
    cat = item.get("category", "")
    clabel, ccol = CATS.get(cat, (str(cat).upper(), DIM))
    ct = clabel.upper()
    cw = d.textlength(ct, font=label)
    cx = W - PAD - cw
    d.rounded_rectangle([cx - 18, 50, W - PAD + 10, 96], radius=9,
                        fill=(ccol[0] // 6, ccol[1] // 6, ccol[2] // 6), outline=ccol, width=2)
    d.text((cx, 60), ct, font=label, fill=ccol)

    # auto-sizing title: largest size (96..60) whose wrapped block fits the budget
    title = item.get("title", "")
    chosen = None
    for size in range(96, 58, -6):
        f = font(TITLE_FONT, size)
        lines = _wrap(d, title, f, W - 2 * PAD)
        lh = int(size * 1.06)
        if lh * len(lines) <= MAX_TITLE_H:
            chosen = (f, lines, size, lh)
            break
    if chosen is None:  # even at min size it's tall — clamp to min, let it use full budget
        f = font(TITLE_FONT, 60)
        lines = _wrap(d, title, f, W - 2 * PAD)
        lh = int(60 * 1.06)
        chosen = (f, lines, 60, lh)
    f, lines, size, lh = chosen
    total = lh * len(lines)
    y = TITLE_TOP + (MAX_TITLE_H - total) // 2
    for ln in lines:
        d.text((PAD, y), ln, font=f, fill=INK)
        y += lh

    # footer
    d.line([(PAD, H - 104), (W - PAD, H - 104)], fill=LINE, width=1)
    d.text((PAD, H - 78), f"Source: {source_of(item)}", font=src_f, fill=STAR)
    site = "americawhat.com"
    d.text((W - PAD - d.textlength(site, font=site_f), H - 74), site, font=site_f, fill=DIM)

    img.save(out_path)


def render_default(out_path):
    img = Image.new("RGB", (W, H), NIGHT)
    d = ImageDraw.Draw(img)
    _glow(d, 200, (70, 92, 140))
    d.rectangle([0, 0, 10, H], fill=RED)
    big = font(TITLE_FONT, 150)
    sub = font(MONO_FONT, 32)
    site_f = font(MONO_FONT, 26)
    d.text((PAD, 190), "AMERICA,", font=big, fill=INK)
    d.text((PAD, 330), "WHAT?", font=big, fill=RED)
    d.text((PAD, 512), "The strange, the everyday, the unbelievably American.", font=sub, fill=DIM)
    site = "americawhat.com"
    d.text((W - PAD - d.textlength(site, font=site_f), H - 58), site, font=site_f, fill=STAR)
    img.save(out_path)


def sha256_file(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def renderer():
    return {
        "pillow": PIL.__version__,
        "freetype": features.version("freetype2"),
        "layout": "basic",
        "fonts": {name: sha256_file(os.path.join(FONT_DIR, name)) for name in sorted(FONT_SHA256)},
    }


def renderer_problems():
    r = renderer()
    problems = []
    if r["pillow"] != PINNED_PILLOW:
        problems.append(f"Pillow {r['pillow']} (pinned {PINNED_PILLOW}; pip install --require-hashes -r scripts/og/requirements.txt)")
    if r["freetype"] != PINNED_FREETYPE:
        problems.append(f"FreeType {r['freetype']} (pinned {PINNED_FREETYPE})")
    for name, digest in FONT_SHA256.items():
        if r["fonts"].get(name) != digest:
            problems.append(f"font {name} differs from the pinned file")
    return problems


def load_items():
    with open(PUB_JSON, encoding="utf-8") as fh:
        data = json.load(fh)
    items = data.get("items", []) if isinstance(data, dict) else data
    return [it for it in items if it.get("id")]


def load_approved():
    with open(APPROVED_JSON, encoding="utf-8") as fh:
        return {f["name"]: f for f in json.load(fh)["files"]}


def write_json(path, value):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(value, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)


def generate_missing(out_dir=GENERATED_DIR):
    approved = load_approved()
    items = load_items()
    os.makedirs(out_dir, exist_ok=True)
    manifest_path = os.path.join(out_dir, "manifest.json")
    previous = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as fh:
            previous = json.load(fh).get("items", {})
    current, rendered, kept, fallbacks = {}, 0, 0, 0
    wanted = set()
    for item in items:
        iid = item["id"]
        name = f"{iid}.png"
        if name in approved:
            continue
        wanted.add(name)
        out = os.path.join(out_dir, name)
        digest = input_digest(item)
        old = previous.get(iid)
        if old and old.get("inputSha256") == digest and old.get("status") == "rendered" \
                and os.path.exists(out) and sha256_file(out) == old.get("sha256"):
            current[iid] = old
            kept += 1
            continue
        status = "rendered"
        try:
            render_item(item, out)
        except Exception as error:  # one bad item must not take the site's other previews down
            shutil.copyfile(os.path.join(APPROVED_DIR, "default.png"), out)
            status = "fallback"
            fallbacks += 1
            print(f"::warning::OG render failed for {iid} ({type(error).__name__}); using default.png")
        rendered += status == "rendered"
        current[iid] = {"file": name, "inputSha256": digest, "sha256": sha256_file(out),
                        "bytes": os.path.getsize(out), "status": status}
    for name in os.listdir(out_dir):
        if name.endswith(".png") and name not in wanted:
            os.remove(os.path.join(out_dir, name))
    write_json(manifest_path, {"renderer": renderer(), "items": dict(sorted(current.items()))})
    print(json.dumps({"approved": len(approved), "generated": len(current), "rendered": rendered,
                      "kept": kept, "fallback": fallbacks}))
    return 0


def same_pixels(a, b):
    with Image.open(a) as ia, Image.open(b) as ib:
        ia, ib = ia.convert("RGB"), ib.convert("RGB")
        return ia.size == ib.size and ImageChops.difference(ia, ib).getbbox() is None


def verify_approved():
    approved = load_approved()
    items = {f"{it['id']}.png": it for it in load_items()}
    result = {"approved": len(approved), "pixel_identical": 0, "byte_identical": 0,
              "pixel_different": [], "input_changed": [], "unpublished": []}
    with tempfile.TemporaryDirectory() as tmp:
        for name, entry in sorted(approved.items()):
            out = os.path.join(tmp, name)
            if name == "default.png":
                render_default(out)
            elif name in items:
                if entry.get("inputSha256") and entry["inputSha256"] != input_digest(items[name]):
                    result["input_changed"].append(name)
                    continue
                render_item(items[name], out)
            else:
                result["unpublished"].append(name)
                continue
            ref = os.path.join(APPROVED_DIR, name)
            if sha256_file(ref) != entry["sha256"]:
                result["pixel_different"].append(name + " (approved file altered)")
                continue
            if sha256_file(out) == entry["sha256"]:
                result["byte_identical"] += 1
            if same_pixels(out, ref):
                result["pixel_identical"] += 1
            else:
                result["pixel_different"].append(name)
    print(json.dumps(result))
    return 1 if result["pixel_different"] else 0


def render_all(out_dir):
    if os.path.abspath(out_dir) == os.path.abspath(APPROVED_DIR):
        sys.exit("Refusing to write into public/og/: the approved archive is frozen.")
    os.makedirs(out_dir, exist_ok=True)
    render_default(os.path.join(out_dir, "default.png"))
    items = load_items()
    for it in items:
        render_item(it, os.path.join(out_dir, f"{it['id']}.png"))
    print(f"OG preview: {len(items)} item images + default.png in {out_dir}")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--missing", action="store_true", help="render images for unapproved items (default)")
    mode.add_argument("--verify-approved", action="store_true", help="prove the renderer reproduces the approved archive")
    mode.add_argument("--all", action="store_true", help="preview every image into --out")
    p.add_argument("--out", help="output directory for --all")
    p.add_argument("--allow-unpinned", action="store_true", help="--all only: accept another Pillow/FreeType")
    args = p.parse_args(argv)

    problems = renderer_problems()
    if problems and not (args.all and args.allow_unpinned):
        for problem in problems:
            print(f"Unpinned OG renderer: {problem}", file=sys.stderr)
        return 2
    if args.all:
        if not args.out:
            p.error("--all needs --out <dir>")
        return render_all(args.out)
    if args.verify_approved:
        return verify_approved()
    return generate_missing()


if __name__ == "__main__":
    sys.exit(main())
