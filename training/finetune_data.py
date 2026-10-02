"""Precompute training inputs for fine-tuning the accurate reader (Pix2Text-MFR).

The first SPLIT encoder layers stay frozen, so their output is computed once per (augmented) image and stored;
finetune_mfr.py then trains only the last encoder layers and the decoder, which is ~6x faster on a CPU.

python finetune_data.py <hf_model_dir> <out_dir> [copies=2] [split=8]

Data (never the test sets): CROHME train + 2014 + 2016 (tablet handwriting) and CROHME 2023 rows < 2900
(scanned paper; the paper2 test set uses rows >= 3000). CROHME 2019 is not used at all.
Augmentation makes the clean renders look like phone photos: paper colour, ruled lines, uneven light,
grey ink, thicker/thinner strokes, slight rotation, blur and JPEG noise, and random crop margins
(the app crops each line with a margin)."""
import io, json, os, random, re, sys, time
import numpy as np, pyarrow.parquet as pq, torch
from PIL import Image, ImageFilter
from scipy import ndimage
from tokenizers import Tokenizer
from transformers import VisionEncoderDecoderModel

src, out = sys.argv[1], sys.argv[2]
COPIES = int(sys.argv[3]) if len(sys.argv) > 3 else 2
SPLIT = int(sys.argv[4]) if len(sys.argv) > 4 else 8
C = '/home/user/data/crohme'
os.makedirs(out, exist_ok=True)
torch.set_num_threads(os.cpu_count())
tok = Tokenizer.from_file(f'{src}/tokenizer.json')


def spaced(tex):
    tex = re.sub(r'^\\\[|\\\]$', '', tex.strip()).strip()
    toks = re.findall(r'\\[a-zA-Z]+|\\.|\S', tex)
    return ' '.join('\\leq' if t == '\\le' else '\\geq' if t == '\\ge' else t for t in toks)


def load_rows():
    rows = []
    for f in ['train-00000-of-00002', 'train-00001-of-00002', '2014-00000-of-00001', '2016-00000-of-00001']:
        for r in pq.read_table(f'{C}/{f}.parquet').to_pylist():
            rows.append((r['image']['bytes'], r['label'], 'tablet'))
    for r in pq.read_table(f'{C}/c2023.parquet').to_pylist()[:2900]:
        rows.append((r['image']['bytes'], r['latex_formula'], 'paper'))
    return rows


def to_gray(b, kind):
    im = Image.open(io.BytesIO(b)).convert('L')
    if kind == 'tablet':
        im = im.resize((im.width // 2, im.height // 2), Image.BILINEAR)
    else:
        s = 900 / max(im.size)
        if s < 1: im = im.resize((int(im.width * s), int(im.height * s)), Image.BILINEAR)
    a = np.asarray(im).astype(np.float32)
    if a.mean() < 128: a = 255 - a
    return a


def crop(a, rng):
    med = np.median(a)
    ys, xs = np.nonzero(a < a.min() + 0.5 * (med - a.min()))  # faint pencil counts as ink too
    if not len(xs) or rng.random() < 0.15: return a
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    h = y1 - y0
    m = lambda: int(h * rng.uniform(0.08, 0.6))
    return a[max(0, y0 - m()):min(a.shape[0], y1 + m()), max(0, x0 - m()):min(a.shape[1], x1 + m())]


def augment(a, rng, strength):
    """a: float32 HxW, 0 = ink, 255 = paper."""
    ink = 1 - a / 255.0  # 1 = ink
    if rng.random() < 0.5 * strength:  # stroke width
        k = rng.choice([1, 1, 2])
        ink = ndimage.grey_dilation(ink, size=(k + 1, k + 1)) if rng.random() < 0.6 else ndimage.grey_erosion(ink, size=(2, 2)) * 0.5 + ink * 0.5
    if rng.random() < 0.7 * strength:  # small rotation / shear / scale
        ang = rng.uniform(-4, 4) * strength
        im = Image.fromarray((ink * 255).astype(np.uint8))
        sh = rng.uniform(-0.12, 0.12) * strength
        w, h = im.size
        im = im.transform((w, h), Image.AFFINE, (1, sh, -sh * h / 2, 0, 1, 0), Image.BILINEAR)
        im = im.rotate(ang, Image.BILINEAR, expand=True, fillcolor=0)
        ink = np.asarray(im).astype(np.float32) / 255.0
    h, w = ink.shape
    paper = np.full((h, w), rng.uniform(200, 255) if rng.random() < 0.7 * strength else 255.0, np.float32)
    if rng.random() < 0.35 * strength:  # ruled lines
        gap = rng.uniform(0.25, 0.6) * h if h > 60 else h
        off = rng.uniform(0, gap)
        for y in np.arange(off, h, gap):
            yi = int(y)
            paper[yi:yi + max(1, int(h / 150))] -= rng.uniform(25, 70)
    if rng.random() < 0.6 * strength:  # uneven light
        gx, gy = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-1, 1, h))
        paper += (gx * rng.uniform(-30, 30) + gy * rng.uniform(-30, 30)) * strength
    if rng.random() < 0.5 * strength:
        paper += np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(2, 9), (h, w))
    ink_level = rng.uniform(0, 110) if rng.random() < 0.6 * strength else 0
    g = paper * (1 - ink) + ink_level * ink
    g = np.clip(g, 0, 255).astype(np.uint8)
    im = Image.fromarray(g)
    if rng.random() < 0.4 * strength: im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.2)))
    if rng.random() < 0.3 * strength:  # low resolution
        s = rng.uniform(0.45, 0.8)
        im = im.resize((max(8, int(w * s)), max(8, int(h * s))), Image.BILINEAR).resize((w, h), Image.BILINEAR)
    if rng.random() < 0.4 * strength:
        bio = io.BytesIO(); im.save(bio, 'JPEG', quality=int(rng.uniform(30, 90))); im = Image.open(bio).convert('L')
    return np.asarray(im)


def prep(gray, aspect=4):
    im = Image.fromarray(gray).convert('RGB')
    w, h = im.size
    if w / h > aspect:
        nh = int(w / aspect); c = Image.new('RGB', (w, nh), (255, 255, 255)); c.paste(im, (0, (nh - h) // 2)); im = c
    elif h / w > aspect:
        nw = int(h / aspect); c = Image.new('RGB', (nw, h), (255, 255, 255)); c.paste(im, ((nw - w) // 2, 0)); im = c
    a = np.asarray(im.resize((384, 384), Image.BICUBIC), np.float32) / 255.0
    return ((a - 0.5) / 0.5).transpose(2, 0, 1)


def main():
    rows = load_rows()
    items = []
    for b, label, kind in rows:
        s = spaced(label)
        ids = tok.encode(s).ids
        if not ids or len(ids) > 120: continue
        items.append((b, kind, [1] + ids + [2]))
    N = len(items) * COPIES
    print(len(items), 'formulas x', COPIES, 'copies =', N, flush=True)
    feats = np.lib.format.open_memmap(f'{out}/feats.npy', mode='r+' if os.path.exists(f'{out}/feats.npy') else 'w+', dtype=np.float16, shape=(N, 578, 384))
    done_path = f'{out}/done.txt'
    start = int(open(done_path).read()) if os.path.exists(done_path) else 0
    json.dump([it[2] for _ in range(COPIES) for it in items], open(f'{out}/labels.json', 'w'))
    json.dump([it[1] for _ in range(COPIES) for it in items], open(f'{out}/kinds.json', 'w'))
    m = VisionEncoderDecoderModel.from_pretrained(src).eval()
    enc = m.encoder
    B, t0 = 16, time.time()
    for s0 in range(start, N, B):
        batch = []
        for j in range(s0, min(N, s0 + B)):
            copy, k = divmod(j, len(items))
            rng = random.Random(j * 7919 + 13)
            b, kind, _ = items[k]
            a = crop(to_gray(b, kind), rng)
            strength = 0.4 if copy == 0 else 1.0
            batch.append(prep(augment(a, rng, strength)))
        with torch.no_grad():
            h = enc.embeddings(torch.from_numpy(np.stack(batch)))
            for layer in enc.encoder.layer[:SPLIT]:
                h = layer(h); h = h[0] if isinstance(h, tuple) else h
        feats[s0:s0 + len(batch)] = h.numpy().astype(np.float16)
        if (s0 // B) % 50 == 0:
            feats.flush(); open(done_path, 'w').write(str(s0 + len(batch)))
            el = time.time() - t0
            print(f'{s0 + len(batch)}/{N}  {el / 60:.1f} min', flush=True)
    feats.flush(); open(done_path, 'w').write(str(N))
    print('done', flush=True)


if __name__ == '__main__':
    main()
