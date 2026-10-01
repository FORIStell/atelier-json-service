"""Train the tiny symbol classifier and export it for the web app.

usage: python train.py [epochs]
Writes web/model/symbols.json + web/model/symbols.bin (float16 weights, batch-norm folded in).
"""
import json
import math
import os
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from common import BOX, CLASSES, CLASS_INDEX, SIZE

DATA = os.environ.get("MATH_DATA", "/home/user/data")
OUT = os.environ.get("MODEL_OUT", os.path.join(os.path.dirname(__file__), "..", "web", "model"))
DATASET = os.environ.get("DATASET", "symbols.npz")
WIDE = os.environ.get("WIDE", "0") == "1"
torch.set_num_threads(os.cpu_count() or 4)
torch.manual_seed(0)
np.random.seed(0)

MIRROR = [("(", ")"), ("[", "]"), ("<", ">"), ("≤", "≥")]


class Net(nn.Module):
    def __init__(self, n, wide=WIDE):
        super().__init__()

        def block(i, o):
            return nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))

        self.features = nn.Sequential(
            block(1, 32), block(32, 32), nn.MaxPool2d(2),
            block(32, 64), block(64, 64), nn.MaxPool2d(2),
            *([block(64, 128), block(128, 128)] if wide else [block(64, 128)]), nn.MaxPool2d(2),
        )
        hidden = 192 if wide else 128
        self.fc1 = nn.Linear(128 * 4 * 4, hidden)
        self.fc2 = nn.Linear(hidden, n)
        self.drop = nn.Dropout(0.3)

    def forward(self, x):
        x = self.features(x).flatten(1)
        x = self.drop(F.relu(self.fc1(x)))
        return self.fc2(x)


def augment(x):
    """x: (B,1,32,32) float in [0,1]."""
    b = x.shape[0]
    ang = (torch.rand(b) - 0.5) * 2 * math.radians(12)
    sc = 0.82 + torch.rand(b) * 0.3
    sh = (torch.rand(b) - 0.5) * 0.4
    sx = sc * (0.85 + torch.rand(b) * 0.3)  # aspect jitter
    tx, ty = (torch.rand(b) - 0.5) * 0.15, (torch.rand(b) - 0.5) * 0.15
    cos, sin = torch.cos(ang), torch.sin(ang)
    theta = torch.zeros(b, 2, 3)
    theta[:, 0, 0] = cos / sx
    theta[:, 0, 1] = (-sin + sh) / sx
    theta[:, 1, 0] = sin / sc
    theta[:, 1, 1] = cos / sc
    theta[:, 0, 2], theta[:, 1, 2] = tx, ty
    grid = F.affine_grid(theta, x.shape, align_corners=False)
    x = F.grid_sample(x, grid, align_corners=False, padding_mode="zeros")
    # stroke thickness
    r = torch.rand(b)
    thick = F.max_pool2d(x, 3, 1, 1)
    thin = -F.max_pool2d(-x, 3, 1, 1)
    x = torch.where((r < 0.3).view(b, 1, 1, 1), thick, x)
    x = torch.where(((r > 0.3) & (r < 0.42)).view(b, 1, 1, 1), torch.maximum(thin, x * 0.6), x)
    # contrast / blur / noise (photos)
    k = torch.tensor([[1, 2, 1], [2, 4, 2], [1, 2, 1]], dtype=torch.float32).view(1, 1, 3, 3) / 16
    blur = F.conv2d(x, k, padding=1)
    x = torch.where((torch.rand(b) < 0.3).view(b, 1, 1, 1), blur, x)
    x = x * (0.7 + 0.3 * torch.rand(b, 1, 1, 1))
    x = x + torch.randn_like(x) * 0.04 * torch.rand(b, 1, 1, 1)
    return x.clamp(0, 1)


def load():
    d = np.load(f"{DATA}/{DATASET}")
    x, y = d["x"], d["y"].astype(np.int64)
    src = d["src"] if "src" in d else np.zeros(len(y), np.int8)
    extra_x, extra_y, extra_s = [], [], []
    for a, b in MIRROR:
        ia, ib = CLASS_INDEX[a], CLASS_INDEX[b]
        for i_from, i_to in ((ia, ib), (ib, ia)):
            m = y == i_from
            extra_x.append(x[m][:, :, ::-1]); extra_y.append(np.full(m.sum(), i_to)); extra_s.append(src[m])
    x = np.concatenate([x] + extra_x)
    y = np.concatenate([y] + extra_y)
    src = np.concatenate([src] + extra_s)
    perm = np.random.permutation(len(y))
    x, y, src = x[perm], y[perm], src[perm]
    nval = len(y) // 20
    return (x[nval:], y[nval:], src[nval:]), (x[:nval], y[:nval])


def evaluate(model, x, y):
    model.eval()
    correct = 0
    conf = np.zeros((len(CLASSES), len(CLASSES)), np.int64)
    with torch.no_grad():
        for i in range(0, len(y), 1024):
            xb = torch.from_numpy(x[i:i + 1024]).float().unsqueeze(1) / 255
            p = model(xb).argmax(1).numpy()
            correct += (p == y[i:i + 1024]).sum()
            for t, q in zip(y[i:i + 1024], p):
                conf[t, q] += 1
    return correct / len(y), conf


def export(model):
    os.makedirs(OUT, exist_ok=True)
    model.eval()
    layers, blobs = [], []
    offset = 0

    def push(arr):
        nonlocal offset
        a = np.ascontiguousarray(arr, np.float16)
        blobs.append(a.tobytes())
        o = offset
        offset += a.size
        return o

    for m in model.features:
        if isinstance(m, nn.Sequential):
            conv, bn = m[0], m[1]
            w = conv.weight.detach().numpy()
            s = (bn.weight / torch.sqrt(bn.running_var + bn.eps)).detach().numpy()
            bias = (bn.bias - bn.running_mean * bn.weight / torch.sqrt(bn.running_var + bn.eps)).detach().numpy()
            w = w * s[:, None, None, None]
            layers.append({"type": "conv", "in": w.shape[1], "out": w.shape[0], "k": 3, "w": push(w), "b": push(bias), "relu": True})
        elif isinstance(m, nn.MaxPool2d):
            layers.append({"type": "maxpool"})
    for fc, relu in [(model.fc1, True), (model.fc2, False)]:
        w = fc.weight.detach().numpy()
        layers.append({"type": "dense", "in": w.shape[1], "out": w.shape[0], "w": push(w), "b": push(fc.bias.detach().numpy()), "relu": relu})
    with open(os.path.join(OUT, "symbols.bin"), "wb") as f:
        for b in blobs:
            f.write(b)
    meta = {"classes": CLASSES, "size": SIZE, "box": BOX, "dtype": "float16", "layers": layers}
    with open(os.path.join(OUT, "symbols.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False)
    print("exported", offset, "weights")


def main():
    epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 14
    (xt, yt, st), (xv, yv) = load()
    print("train", len(yt), "val", len(yv), flush=True)
    counts = np.bincount(yt, minlength=len(CLASSES))
    w = 1 / np.sqrt(counts[yt]) * np.where(st == 3, 2.0, 1.0)  # real math handwriting (CROHME) counts double
    w = w / w.sum()
    model = Net(len(CLASSES))
    print("params", sum(p.numel() for p in model.parameters()))
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    bs = 256
    steps = len(yt) // bs
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=epochs * steps)
    xt_t = torch.from_numpy(xt)
    yt_t = torch.from_numpy(yt)
    best = 0
    for ep in range(epochs):
        model.train()
        t0 = time.time()
        idx = torch.from_numpy(np.random.choice(len(yt), steps * bs, p=w))
        tot = 0
        for s in range(steps):
            bi = idx[s * bs:(s + 1) * bs]
            xb = augment(xt_t[bi].float().unsqueeze(1) / 255)
            loss = F.cross_entropy(model(xb), yt_t[bi], label_smoothing=0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            tot += loss.item()
        acc, conf = evaluate(model, xv, yv)
        print(f"epoch {ep + 1}/{epochs} loss {tot / steps:.4f} val_acc {acc:.4f} time {time.time() - t0:.0f}s", flush=True)
        if acc >= best:
            best = acc
            torch.save(model.state_dict(), os.path.join(DATA, "symbols_best.pt"))
            export(model)
    model.load_state_dict(torch.load(os.path.join(DATA, "symbols_best.pt")))
    acc, conf = evaluate(model, xv, yv)
    print("best val acc", acc)
    # most confused pairs
    np.fill_diagonal(conf, 0)
    pairs = sorted(((conf[i, j], CLASSES[i], CLASSES[j]) for i in range(len(CLASSES)) for j in range(len(CLASSES)) if conf[i, j]), reverse=True)[:25]
    print("top confusions (true -> predicted):", pairs)
    export(model)


if __name__ == "__main__":
    main()
