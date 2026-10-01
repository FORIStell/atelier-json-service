"""Build the symbol training set from several sources.

Sources (downloaded separately, see training/README.md):
  * MNIST + EMNIST (handwritten digits and letters)
  * HASYv2 (handwritten math symbols)
  * CROHME (symbols cut out of handwritten expressions, see extract_crohme.py)
  * printed symbols rendered from system fonts (for photos of books / worksheets)

Output: data/symbols.npz with uint8 images (N, 32, 32) and int16 labels.
"""
import gzip
import io
import os
import random
import sys

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

from common import CLASSES, CLASS_INDEX, normalize

DATA = os.environ.get("MATH_DATA", "/home/user/data")
rng = np.random.default_rng(0)
random.seed(0)


def add(store, img, label):
    if img is None:
        return
    store.setdefault(label, []).append((np.clip(img, 0, 1) * 255).astype(np.uint8))


def from_mnist(store, cap=4000):
    df = pd.read_parquet(f"{DATA}/mnist_train.parquet")
    counts = {}
    for row in df.itertuples():
        y = int(row.label)
        if counts.get(y, 0) >= cap:
            continue
        a = np.asarray(Image.open(io.BytesIO(row.image["bytes"])), np.float32) / 255.0
        add(store, normalize(a), CLASS_INDEX[str(y)])
        counts[y] = counts.get(y, 0) + 1


def read_idx(path):
    with gzip.open(path) as f:
        data = f.read()
    magic = int.from_bytes(data[2:4], "big")
    dims = data[3]
    shape = [int.from_bytes(data[4 + 4 * i: 8 + 4 * i], "big") for i in range(dims)]
    return np.frombuffer(data, np.uint8, offset=4 + 4 * dims).reshape(shape)


def from_emnist(store, cap_letter=3500, cap_digit=1500):
    imgs = read_idx(f"{DATA}/emnist/emnist-byclass-train-images-idx3-ubyte.gz")
    labels = read_idx(f"{DATA}/emnist/emnist-byclass-train-labels-idx1-ubyte.gz")
    mapping = {}
    for line in open(f"{DATA}/emnist/emnist-byclass-mapping.txt"):
        k, code = line.split()
        mapping[int(k)] = chr(int(code))
    same_shape_upper = set("COSUVWXZ")  # uppercase looks like lowercase
    counts = {}
    order = rng.permutation(len(labels))
    for i in order:
        ch = mapping[int(labels[i])]
        if ch in same_shape_upper:
            ch = ch.lower()
        if ch not in CLASS_INDEX:
            continue
        cap = cap_digit if ch.isdigit() else cap_letter
        if counts.get(ch, 0) >= cap:
            continue
        a = imgs[i].T.astype(np.float32) / 255.0  # EMNIST images are transposed
        add(store, normalize(a), CLASS_INDEX[ch])
        counts[ch] = counts.get(ch, 0) + 1


HASY_MAP = {"\\times": "×", "\\div": "÷", "\\leq": "≤", "\\geq": "≥", "\\%": "%", "\\sqrt{}": "√", "\\int": "∫",
            "\\pi": "π", "\\theta": "θ", "\\infty": "∞", "\\mid": "|", "[": "[", "]": "]", "/": "/", "<": "<", ">": ">",
            "+": "+", "-": "-", "|": "|"}


def from_hasy(store, cap=3000):
    df = pd.read_csv(f"{DATA}/hasy-data-labels.csv")
    counts = {}
    for row in df.itertuples():
        ch = HASY_MAP.get(row.latex, row.latex if row.latex in CLASS_INDEX else None)
        if ch is None or counts.get(ch, 0) >= cap:
            continue
        a = 1 - np.asarray(Image.open(f"{DATA}/{row.path}").convert("L"), np.float32) / 255.0
        add(store, normalize(a), CLASS_INDEX[ch])
        counts[ch] = counts.get(ch, 0) + 1


def from_crohme(store):
    d = np.load(f"{DATA}/crohme_sym.npz")
    for a, y in zip(d["x"], d["y"]):
        store.setdefault(int(y), []).append(a)


FONT_DIRS = ["/usr/share/fonts"]
FONT_GLYPH = {"×": "×", "÷": "÷", "√": "√", "∫": "∫", "π": "π", "θ": "θ", "∞": "∞", "≤": "≤", "≥": "≥"}


def list_fonts():
    out = []
    for d in FONT_DIRS:
        for root, _, files in os.walk(d):
            for f in files:
                if f.lower().endswith((".ttf", ".otf")) and not any(b in f for b in ("Emoji", "Unifont", "IPA", "wqy", "Loma", "OpenSymbol")):
                    out.append(os.path.join(root, f))
    return sorted(out)


def render(ch, font_path, size=64):
    try:
        font = ImageFont.truetype(font_path, size)
    except Exception:
        return None
    # skip fonts that do not contain the glyph (they render the "missing glyph" box)
    m = font.getmask(ch)
    if m.size[0] == 0 or m.size[1] == 0:
        return None
    missing = font.getmask("\uffff")
    if m.size == missing.size and bytes(m) == bytes(missing):
        return None
    im = Image.new("L", (size * 2, size * 2), 0)
    ImageDraw.Draw(im).text((size // 2, size // 4), ch, fill=255, font=font)
    angle = random.uniform(-8, 8)
    im = im.rotate(angle, resample=Image.BILINEAR)
    a = np.asarray(im, np.float32) / 255.0
    return normalize(a)


def from_fonts(store, per_font=6):
    fonts = list_fonts()
    print("fonts:", len(fonts))
    for ch in CLASSES:
        glyph = FONT_GLYPH.get(ch, ch)
        for fp in fonts:
            for _ in range(per_font):
                add(store, render(glyph, fp), CLASS_INDEX[ch])


def main(out):
    store = {}
    for name, fn in [("mnist", from_mnist), ("emnist", from_emnist), ("hasy", from_hasy), ("crohme", from_crohme), ("fonts", from_fonts)]:
        before = sum(len(v) for v in store.values())
        fn(store)
        print(name, "added", sum(len(v) for v in store.values()) - before, flush=True)
    xs, ys = [], []
    for y, imgs in sorted(store.items()):
        print(f"{CLASSES[y]!r}: {len(imgs)}", end="  ")
        xs.extend(imgs)
        ys.extend([y] * len(imgs))
    print()
    x = np.stack(xs)
    y = np.array(ys, np.int16)
    perm = rng.permutation(len(y))
    np.savez_compressed(out, x=x[perm], y=y[perm])
    print("total", len(y))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else f"{DATA}/symbols.npz")
