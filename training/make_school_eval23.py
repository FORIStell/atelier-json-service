"""School-level real handwriting (scanned paper) from CROHME 2023 - never used for training."""
import io, json, random, re, sys
import numpy as np, pyarrow.parquet as pq
from PIL import Image
OUT = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 200
ok_cmd = {'\\frac', '\\sqrt', '\\pi', '\\times', '\\div', '\\leq', '\\geq', '\\left', '\\right', '\\cdot', '\\le', '\\ge'}
rows = pq.read_table('/home/user/data/crohme/c2023.parquet').to_pylist()
START = int(sys.argv[3]) if len(sys.argv) > 3 else 0  # 3000: rows the fine-tuned reader never trains on (finetune_data.py uses rows < 2900)
rows = rows[START:]
random.seed(5); random.shuffle(rows)
items = []
for r in rows:
    lt = r['latex_formula'].strip()
    lt = re.sub(r'^\\\[|\\\]$', '', lt).strip()
    toks = re.findall(r'\\[a-zA-Z]+|\S', lt)
    if not (3 <= len(toks) <= 18): continue
    if any(t.startswith('\\') and t not in ok_cmd for t in toks): continue
    if any(t in '_' or t.isupper() for t in toks if len(t) == 1): continue
    im = Image.open(io.BytesIO(r['image']['bytes'])).convert('L')
    s = 900 / max(im.size)
    if s < 1: im = im.resize((int(im.width * s), int(im.height * s)), Image.BILINEAR)
    a = np.asarray(im)
    name = f'r{len(items)}'
    a.astype(np.uint8).tofile(f'{OUT}/{name}.raw')
    items.append({'name': name, 'w': a.shape[1], 'h': a.shape[0], 'latex': lt, 'kind': 'paper'})
    if len(items) >= N: break
json.dump(items, open(f'{OUT}/index.json', 'w'))
print(len(items), [i['latex'] for i in items[:10]])
