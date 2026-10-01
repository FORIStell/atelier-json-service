"""Shared settings for building the symbol dataset and training the model.

The preprocessing here must match web/src/ocr/preprocess.js: every symbol is cropped
to its ink bounding box, scaled (keeping its aspect ratio) so the longest side is BOX
pixels, and centred in a SIZE x SIZE canvas. Ink = 1.0, paper = 0.0.
"""
import numpy as np
from PIL import Image

SIZE = 32
BOX = 26

CLASSES = (
    list("0123456789")
    + ["+", "-", "×", "÷", "=", "(", ")", "[", "]", "/", "<", ">", "≤", "≥", "!", "%", "|", "√", "∫", "π", "θ", "∞"]
    + list("abcdefghiklmnoprstuvwxyz")
)
CLASS_INDEX = {c: i for i, c in enumerate(CLASSES)}


def normalize(ink: np.ndarray, box: int = BOX, size: int = SIZE) -> np.ndarray | None:
    """ink: 2-D float array in [0,1] (1 = ink). Returns size x size float32 or None if empty."""
    ys, xs = np.nonzero(ink > 0.15)
    if len(xs) == 0:
        return None
    crop = ink[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    h, w = crop.shape
    s = box / max(h, w)
    nh, nw = max(1, round(h * s)), max(1, round(w * s))
    im = Image.fromarray((np.clip(crop, 0, 1) * 255).astype(np.uint8))
    im = im.resize((nw, nh), Image.BILINEAR if s > 1 else Image.BOX)
    out = np.zeros((size, size), np.float32)
    y0, x0 = (size - nh) // 2, (size - nw) // 2
    out[y0: y0 + nh, x0: x0 + nw] = np.asarray(im, np.float32) / 255.0
    return out
