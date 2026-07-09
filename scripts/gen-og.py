#!/usr/bin/env python3
"""
americawhat — build-time Open Graph image generator.

Reads src/data/published.json and renders a 1200x630 PNG per item into
public/og/<id>.png, plus public/og/default.png for the home page and
non-item pages. Runs BEFORE `astro build` (see .github/workflows/deploy.yml),
so Astro copies public/og/ into dist/og/ and it deploys with the site.

Design: dark theme, left red accent, "AMERICA, WHAT?" top-left, category
chip (own colour) top-right, big auto-sizing title, prominent Source, and
americawhat.com bottom-right. No date. Fonts are bundled under scripts/og-fonts
(SIL OFL) so the build never depends on the network.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "scripts", "og-fonts")
TITLE_FONT = os.path.join(FONT_DIR, "BigShoulders-Bold.ttf")
MONO_FONT = os.path.join(FONT_DIR, "IBMPlexMono-Bold.ttf")
PUB_JSON = os.path.join(ROOT, "src", "data", "published.json")
OUT_DIR = os.path.join(ROOT, "public", "og")

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


def render_item(item, out_path):
    img = Image.new("RGB", (W, H), NIGHT)
    d = ImageDraw.Draw(img)
    _glow(d, 150, (64, 86, 124))
    d.rectangle([0, 0, 10, H], fill=RED)

    brand = ImageFont.truetype(TITLE_FONT, 42)
    label = ImageFont.truetype(MONO_FONT, 26)
    src_f = ImageFont.truetype(MONO_FONT, 30)
    site_f = ImageFont.truetype(MONO_FONT, 26)

    # header row
    d.text((PAD, 52), "AMERICA, WHAT?", font=brand, fill=INK)
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
        f = ImageFont.truetype(TITLE_FONT, size)
        lines = _wrap(d, title, f, W - 2 * PAD)
        lh = int(size * 1.06)
        if lh * len(lines) <= MAX_TITLE_H:
            chosen = (f, lines, size, lh)
            break
    if chosen is None:  # even at min size it's tall — clamp to min, let it use full budget
        f = ImageFont.truetype(TITLE_FONT, 60)
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
    src = item.get("source_name") or item.get("sourceName") or ""
    d.text((PAD, H - 78), f"Source: {src}", font=src_f, fill=STAR)
    site = "americawhat.com"
    d.text((W - PAD - d.textlength(site, font=site_f), H - 74), site, font=site_f, fill=DIM)

    img.save(out_path)


def render_default(out_path):
    img = Image.new("RGB", (W, H), NIGHT)
    d = ImageDraw.Draw(img)
    _glow(d, 200, (70, 92, 140))
    d.rectangle([0, 0, 10, H], fill=RED)
    big = ImageFont.truetype(TITLE_FONT, 150)
    sub = ImageFont.truetype(MONO_FONT, 32)
    site_f = ImageFont.truetype(MONO_FONT, 26)
    d.text((PAD, 190), "AMERICA,", font=big, fill=INK)
    d.text((PAD, 330), "WHAT?", font=big, fill=RED)
    d.text((PAD, 512), "The strange, the everyday, the unbelievably American.", font=sub, fill=DIM)
    site = "americawhat.com"
    d.text((W - PAD - d.textlength(site, font=site_f), H - 58), site, font=site_f, fill=STAR)
    img.save(out_path)


def main():
    with open(PUB_JSON, encoding="utf-8") as fh:
        data = json.load(fh)
    items = data.get("items", []) if isinstance(data, dict) else data
    os.makedirs(OUT_DIR, exist_ok=True)
    render_default(os.path.join(OUT_DIR, "default.png"))
    n = 0
    for it in items:
        iid = it.get("id")
        if not iid:
            continue
        render_item(it, os.path.join(OUT_DIR, f"{iid}.png"))
        n += 1
    print(f"OG images: generated {n} item images + default.png in public/og/")


if __name__ == "__main__":
    main()
