"""Build a 'homework style' handwritten test set from held-out handwriting.

Digits come from the MNIST *test* split; other symbols from CROHME 2019 (excluded from
training). Symbols are placed like a student would write them, including exponents and
fractions. Output goes to <dir> in the format read by eval_ocr.mjs.
"""
import io
import json
import random
import sys

import numpy as np
import pandas as pd
from PIL import Image

from common import CLASSES, normalize

OUT = sys.argv[1]
DATA = "/home/user/data"
random.seed(7)
np.random.seed(7)

pool = {}
mn = pd.read_parquet(f"{DATA}/mnist_test.parquet")
for row in mn.itertuples():
    a = np.asarray(Image.open(io.BytesIO(row.image["bytes"])), np.float32) / 255.0
    pool.setdefault(str(row.label), []).append(normalize(a))
cr = np.load(f"{DATA}/crohme_sym_2019.npz")
for a, y in zip(cr["x"], cr["y"]):
    ch = CLASSES[int(y)]
    if not ch.isdigit():
        pool.setdefault(ch, []).append(a.astype(np.float32) / 255.0)

PROBLEMS = [
    "3x+5=20", "2x-7=11", "x+4=9", "5x=35", "4x-3=2x+9", "x/2=6", "7-3x=1", "6+2x=14", "9x-4=23", "x-8=-3",
    "x^2-9=0", "x^2+5x+6=0", "x^2=49", "2x^2-8=0", "x^2-4x+4=0", "y=2x+3", "y=x^2-1", "3(x+2)=15", "2(x-1)=8", "5(2x-3)=25",
    "12+7", "45-18", "6×7", "56÷8", "3+4×2", "(2+3)×4", "8-2+5", "9×9-1", "100÷4", "15+27-6",
    "2^3+1", "3^2+4^2", "x^3-8=0", "1/2+1/3", "3/4-1/8", "2/5×5", "a+b=7", "2a-3=9", "4y+1=13", "y-6=2y",
    "x<5", "2x+1>7", "3x-2≤10", "x≥4", "√16+3", "√x=4", "2√9", "π×4", "x+y=10", "x-y=2",
]


def glyph(ch):
    if ch not in pool:
        raise KeyError(ch)
    return random.choice(pool[ch])


def place(canvas, img, x, y, h):
    """paste a 32x32 symbol image scaled to height h at (x, y top)."""
    ys, xs = np.nonzero(img > 0.15)
    crop = img[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    ch, cw = crop.shape
    s = h / max(ch, 1)
    if cw * s > 1.6 * h:  # wide flat things like '-'
        s = 1.2 * h / cw
    nh, nw = max(2, int(ch * s)), max(2, int(cw * s))
    im = np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize((nw, nh), Image.BILINEAR), np.float32) / 255
    yy = y + (h - nh) // 2 if ch < 0.6 * crop.shape[1] or nh < 0.5 * h else y
    canvas[yy: yy + nh, x: x + nw] = np.maximum(canvas[yy: yy + nh, x: x + nw], im)
    return nw


def render(expr):
    H = 70
    canvas = np.zeros((300, 60 + 90 * len(expr)), np.float32)
    x, base_y = 30, 110
    i = 0
    while i < len(expr):
        c = expr[i]
        if c == "^":
            e = expr[i + 1]
            w = place(canvas, glyph(e), x + 2, base_y - int(0.45 * H), int(0.55 * H))
            x += w + 12
            i += 2
            continue
        if c == "/" and i > 0 and expr[i - 1].isdigit() and i + 1 < len(expr) and expr[i + 1].isdigit():
            # stacked fraction: re-draw previous digit as numerator
            pass
        if c == "√":
            # radical sign then the radicand under it
            j = i + 1
            arg = ""
            while j < len(expr) and (expr[j].isalnum()):
                arg += expr[j]
                j += 1
            sx = x
            x += int(0.5 * H)
            for a in arg:
                x += place(canvas, glyph(a), x, base_y, H) + 10
            g = glyph("√")
            ys, xs = np.nonzero(g > 0.15)
            crop = g[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
            im = np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize((x - sx + 6, int(H * 1.35)), Image.BILINEAR), np.float32) / 255
            y0 = base_y - int(0.3 * H)
            canvas[y0: y0 + im.shape[0], sx: sx + im.shape[1]] = np.maximum(canvas[y0: y0 + im.shape[0], sx: sx + im.shape[1]], im)
            x += 14
            i = j
            continue
        if c == " ":
            x += 20
            i += 1
            continue
        h = H
        if c in "+-=×÷<>≤≥":
            h = int(0.55 * H)
            w = place(canvas, glyph(c), x, base_y + int(0.22 * H), h)
        elif c in "acemnorsuvwxz":
            w = place(canvas, glyph(c), x, base_y + int(0.3 * H), int(0.7 * H))
        elif c in "gpqy":
            w = place(canvas, glyph(c), x, base_y + int(0.3 * H), int(0.95 * H))
        else:
            w = place(canvas, glyph(c), x, base_y, h)
        x += w + random.randint(8, 22)
        i += 1
    canvas = canvas[:, : x + 30]
    # thicken a little, add paper texture
    img = 1 - np.clip(canvas, 0, 1) * 0.85
    img = img * (0.9 + 0.1 * np.random.rand(*img.shape))
    return (np.clip(img, 0, 1) * 255).astype(np.uint8)


items = []
for k, p in enumerate(PROBLEMS):
    try:
        a = render(p)
    except KeyError as e:
        print("skip", p, e)
        continue
    name = f"w{k}"
    a.tofile(f"{OUT}/{name}.raw")
    gt = p.replace("√16", "sqrt(16)").replace("√x", "sqrt(x)").replace("√9", "sqrt(9)")
    gt = __import__("re").sub(r"\^(\w)", r"^(\1)", gt)
    items.append({"name": name, "w": a.shape[1], "h": a.shape[0], "gt": gt, "kind": "homework"})
    if k < 6:
        Image.fromarray(a).save(f"/tmp/hw{k}.png")
json.dump(items, open(f"{OUT}/index.json", "w"), ensure_ascii=False)
print(len(items))
