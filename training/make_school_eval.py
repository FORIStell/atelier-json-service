"""School-level handwritten test set from CROHME 2019 (never used for training our model)."""
import io, json, random, sys
import numpy as np, pyarrow.parquet as pq
from PIL import Image
OUT = sys.argv[1]
SKIP = int(sys.argv[2]) if len(sys.argv) > 2 else 0
skipped = 0
ok = set(list('0123456789xyabnct+-=()<>') + ['\\times', '\\div', '\\frac', '^', '{', '}', '\\sqrt', '\\pi', '\\leq', '\\geq', '\\left(', '\\right)'])
import os
rows = pq.read_table(os.environ.get('SRC', '/home/user/data/crohme/2019-00000-of-00001.parquet')).to_pylist()
random.seed(3); random.shuffle(rows)
items = []
for r in rows:
    toks = r['label'].split()
    if not (3 <= len(toks) <= 16) or not all(t in ok for t in toks):
        continue
    if skipped < SKIP:
        skipped += 1
        continue
    im = Image.open(io.BytesIO(r['image']['bytes'])).convert('L')
    im = im.resize((im.width // 2, im.height // 2), Image.BILINEAR)
    a = np.asarray(im)
    if a.mean() < 128: a = 255 - a
    name = f's{len(items)}'
    a.astype(np.uint8).tofile(f'{OUT}/{name}.raw')
    items.append({'name': name, 'w': a.shape[1], 'h': a.shape[0], 'latex': r['label'], 'kind': 'school'})
    if len(items) >= 200: break
json.dump(items, open(f'{OUT}/index.json', 'w'))
print(len(items))
