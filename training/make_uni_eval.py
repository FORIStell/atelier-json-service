"""11th-12th grade / university handwritten test set from CROHME 2019 (never used for training):
formulas with integrals, sums, limits, trig, logs, roots, Greek letters. python make_uni_eval.py <out_dir> [n=200]"""
import io, json, random, sys
import numpy as np, pyarrow.parquet as pq
from PIL import Image
OUT = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 200
ADV = {'\\int', '\\sum', '\\lim', '\\sin', '\\cos', '\\tan', '\\log', '\\pi', '\\theta', '\\alpha', '\\beta', '\\infty', '\\sqrt', '\\frac', '\\pm', '\\lambda', '\\mu', '\\sigma'}
BAD = {'\\exists', '\\forall', '\\in', '\\rightarrow', '\\ldots', '\\cdots', '\\prime', '\\mbox', '\\limits', '\\gamma', '\\phi', '\\Delta'}
rows = pq.read_table('/home/user/data/crohme/2019-00000-of-00001.parquet').to_pylist()
random.seed(7); random.shuffle(rows)
items = []
for r in rows:
    toks = r['label'].split()
    if not (4 <= len(toks) <= 30) or not any(t in ADV for t in toks) or any(t in BAD for t in toks): continue
    if sum(t in ('\\int', '\\sum', '\\lim', '\\sin', '\\cos', '\\tan', '\\log', '\\theta', '\\alpha', '\\beta', '\\infty', '\\lambda', '\\mu', '\\sigma', '\\pi') for t in toks) == 0 and len(toks) < 8: continue
    im = Image.open(io.BytesIO(r['image']['bytes'])).convert('L')
    im = im.resize((im.width // 2, im.height // 2), Image.BILINEAR)
    a = np.asarray(im)
    if a.mean() < 128: a = 255 - a
    name = f'u{len(items)}'
    a.astype(np.uint8).tofile(f'{OUT}/{name}.raw')
    items.append({'name': name, 'w': a.shape[1], 'h': a.shape[0], 'latex': r['label'], 'kind': 'uni'})
    if len(items) >= N: break
json.dump(items, open(f'{OUT}/index.json', 'w'))
print(len(items), [i['latex'] for i in items[:8]])
