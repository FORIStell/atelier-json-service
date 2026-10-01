"""Cut single handwritten symbols out of CROHME expression images.

Only "flat" expressions (no fractions, powers, roots...) are used, so the symbols can
be matched to the LaTeX tokens from left to right. Components that sit on top of each
other (=, ÷, i, ≤, !) are merged first.
"""
import io
import sys
from multiprocessing import Pool

import numpy as np
import pyarrow.parquet as pq
from PIL import Image
from scipy import ndimage

from common import CLASS_INDEX, normalize

TOKEN_MAP = {
    "\\times": "×", "\\div": "÷", "\\pi": "π", "\\theta": "θ", "\\infty": "∞", "\\leq": "≤", "\\geq": "≥",
    "\\lt": "<", "\\gt": ">", "<": "<", ">": ">", "\\{": None, "\\}": None, "\\int": "∫", "|": "|", "\\mid": "|",
}
DROP = {"^", "_", "{", "}", "\\limits"}
WORDS = {"\\sin": "sin", "\\cos": "cos", "\\tan": "tan", "\\log": "log", "\\lim": "lim"}
SKIP = {"\\frac", "\\sqrt", "\\sum", "\\rightarrow",
        "\\cdot", "\\ldots", "\\dots", "\\prime", ".", ",", "\\pm", "\\exists", "\\forall", "\\in", "\\neq", "\\prod"}


def map_token(t):
    if t in TOKEN_MAP:
        return TOKEN_MAP[t]
    if t in CLASS_INDEX:
        return t
    return None


def components(img):
    g = np.asarray(img.convert("L").resize((img.width // 4, img.height // 4), Image.BILINEAR), np.float32) / 255.0
    ink = g if g.mean() < 0.5 else 1 - g  # white strokes on black in this dataset
    lab, n = ndimage.label(ink > 0.35, structure=np.ones((3, 3)))
    boxes = ndimage.find_objects(lab)
    comps = []
    for i, sl in enumerate(boxes):
        if sl is None:
            continue
        area = (lab[sl] == i + 1).sum()
        if area < 6:
            continue
        comps.append({"ids": [i + 1], "y0": sl[0].start, "y1": sl[0].stop, "x0": sl[1].start, "x1": sl[1].stop})
    # merge components that overlap strongly in x (stacked parts of one symbol)
    comps.sort(key=lambda c: c["x0"])
    merged = []
    for c in comps:
        for m in merged:
            ov = min(m["x1"], c["x1"]) - max(m["x0"], c["x0"])
            vov = min(m["y1"], c["y1"]) - max(m["y0"], c["y0"])
            if ov > 0.6 * min(m["x1"] - m["x0"], c["x1"] - c["x0"]) and vov < 0.3 * min(m["y1"] - m["y0"], c["y1"] - c["y0"]):
                m["ids"] += c["ids"]
                m["x0"], m["x1"] = min(m["x0"], c["x0"]), max(m["x1"], c["x1"])
                m["y0"], m["y1"] = min(m["y0"], c["y0"]), max(m["y1"], c["y1"])
                break
        else:
            merged.append(dict(c))
    merged.sort(key=lambda c: (c["x0"] + c["x1"]) / 2)
    return ink, lab, merged


def process(args):
    img_bytes, label = args
    toks = []
    for t in label.split():
        if t in DROP:
            continue
        toks.extend(list(WORDS[t]) if t in WORDS else [t])
    if not toks or any(t in SKIP for t in toks):
        return []
    mapped = [map_token(t) for t in toks]
    if any(m is None for m in mapped):
        return []
    try:
        img = Image.open(io.BytesIO(img_bytes))
        ink, lab, comps = components(img)
    except Exception:
        return []
    if len(comps) != len(mapped):
        return []
    out = []
    for c, ch in zip(comps, mapped):
        mask = np.isin(lab[c["y0"]: c["y1"], c["x0"]: c["x1"]], c["ids"])
        crop = ink[c["y0"]: c["y1"], c["x0"]: c["x1"]] * mask
        a = normalize(crop)
        if a is not None:
            out.append(((a * 255).astype(np.uint8), CLASS_INDEX[ch]))
    return out


def main(files, out):
    xs, ys = [], []
    for f in files:
        t = pq.read_table(f)
        rows = [(r["image"]["bytes"], r["label"]) for r in t.to_pylist()]
        with Pool(4) as p:
            for res in p.imap_unordered(process, rows, chunksize=16):
                for a, y in res:
                    xs.append(a)
                    ys.append(y)
        print(f, "symbols so far:", len(xs), flush=True)
    np.savez_compressed(out, x=np.stack(xs), y=np.array(ys, np.int16))


if __name__ == "__main__":
    main(sys.argv[2:], sys.argv[1])
