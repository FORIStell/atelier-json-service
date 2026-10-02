"""Run the Pix2Text-MFR formula reader (ONNX) on an eval folder made by make_eval.py.

usage: python mfr_eval.py <evalDir> <modelDir> [out.json]
Writes {name: latex} predictions, read by eval_compare.mjs.
"""
import json
import sys
import time

import numpy as np
import onnxruntime as ort
from PIL import Image
from tokenizers import Tokenizer

args = [a for a in sys.argv[1:] if not a.startswith("--")]
ev, md = args[0], args[1]
out = args[2] if len(args) > 2 else f"{ev}/mfr_pred.json"
enc = ort.InferenceSession(f"{md}/encoder_model.onnx", providers=["CPUExecutionProvider"])
dec = ort.InferenceSession(f"{md}/decoder_model.onnx", providers=["CPUExecutionProvider"])
tok = Tokenizer.from_file(f"{md}/tokenizer.json")


def prep(gray):
    """gray: uint8 HxW, dark ink on light paper -> 1x3x384x384 normalized to [-1, 1]."""
    im = Image.fromarray(gray).convert("RGB")
    if ASPECT:
        w, h = im.size
        if w / h > ASPECT:  # pad top and bottom so the image is at most ASPECT:1
            nh = int(w / ASPECT)
            canvas = Image.new("RGB", (w, nh), (255, 255, 255))
            canvas.paste(im, (0, (nh - h) // 2))
            im = canvas
        elif h / w > ASPECT:
            nw = int(h / ASPECT)
            canvas = Image.new("RGB", (nw, h), (255, 255, 255))
            canvas.paste(im, ((nw - w) // 2, 0))
            im = canvas
    elif PAD:
        w, h = im.size
        side = max(w, h)
        canvas = Image.new("RGB", (side, side), (255, 255, 255))
        canvas.paste(im, ((side - w) // 2, (side - h) // 2))
        im = canvas
    im = im.resize((384, 384), Image.BICUBIC)  # the processor stretches to 384x384 like during training
    a = np.asarray(im, np.float32) / 255.0
    a = (a - 0.5) / 0.5
    return a.transpose(2, 0, 1)[None]


def thin(gray, k):
    from scipy import ndimage
    ink = gray < 128
    if k > 0:
        ink = ndimage.binary_erosion(ink, iterations=k) | (ndimage.binary_erosion(ink, iterations=k - 1) if k > 1 else ink & False)
    out = np.where(ink, 0, 255).astype(np.uint8)
    return np.asarray(Image.fromarray(out).filter(__import__("PIL.ImageFilter", fromlist=["x"]).GaussianBlur(0.8)))


def crop_ink(gray, pad=12):
    ys, xs = np.nonzero(gray < 128)
    if not len(xs):
        return gray
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(gray.shape[0], ys.max() + pad), max(0, xs.min() - pad), min(gray.shape[1], xs.max() + pad)
    return gray[y0:y1, x0:x1]


# --- keep the reader to school/university math symbols (the model knows ~1900 LaTeX tokens) ---
COMMANDS = {"frac", "sqrt", "pi", "theta", "infty", "leq", "geq", "neq", "le", "ge", "times", "div", "cdot", "pm", "sin", "cos",
            "tan", "cot", "sec", "csc", "log", "ln", "lim", "to", "int", "sum", "prod", "alpha", "beta", "left", "right", "prime",
            "circ", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "exp", "lt", "gt", "{", "}", ",", ";", "!", "|", "%"}
PLAIN = set("0123456789abcdefghijklmnopqrstuvwxyz+-=()[]{}^_<>|!,./'%")
vocab = tok.get_vocab()
plain_ids, cmd_ids, bs_ids = [], [], []
for t, i in vocab.items():
    core = t[1:] if t.startswith("Ġ") else t
    if core == "\\":
        bs_ids.append(i)
    elif core and all(c in PLAIN for c in core):
        plain_ids.append(i)
    if t in COMMANDS:
        cmd_ids.append(i)
V = len(vocab)
mask_plain = np.full(V, -1e9, np.float32); mask_plain[plain_ids + bs_ids + [2]] = 0
mask_cmd = np.full(V, -1e9, np.float32); mask_cmd[cmd_ids] = 0
CONSTRAIN = "--constrain" in sys.argv
PAD = "--nopad" not in sys.argv
ASPECT = float(next((a.split("=")[1] for a in sys.argv if a.startswith("--aspect=")), "0"))
THIN = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--thin=")), "0"))
SCALE = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--scale=")), "0"))
LIMIT = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--limit=")), "100000"))


def read(gray, max_len=120):
    g = crop_ink(gray)
    if SCALE:
        h = g.shape[0]
        f = SCALE / h
        g = np.asarray(Image.fromarray(g).resize((max(1, int(g.shape[1] * f)), SCALE), Image.LANCZOS))
    if THIN:
        g = thin(g, THIN)
    hs = enc.run(None, {"pixel_values": prep(g)})[0]
    ids = [1]
    for _ in range(max_len):
        logits = dec.run(None, {"input_ids": np.array([ids], np.int64), "encoder_hidden_states": hs})[0]
        lg = logits[0, -1]
        if CONSTRAIN:
            lg = lg + (mask_cmd if ids[-1] in bs_ids else mask_plain)
        nxt = int(lg.argmax())
        if nxt == 2:
            break
        ids.append(nxt)
    return tok.decode(ids[1:], skip_special_tokens=True)


items = json.load(open(f"{ev}/index.json"))
preds = {}
t0 = time.time()
for it in items[:LIMIT]:
    g = np.fromfile(f"{ev}/{it['name']}.raw", np.uint8).reshape(it["h"], it["w"])
    preds[it["name"]] = read(g)
json.dump(preds, open(out, "w"), ensure_ascii=False, indent=0)
print(f"{len(items)} images in {time.time() - t0:.1f}s")
