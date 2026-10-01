"""Export evaluation images as raw grayscale for the JS pipeline test (eval_ocr.mjs)."""
import io, json, re, sys, random
import numpy as np, pyarrow.parquet as pq
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
items = []

def latex_to_text(l):
    t = l.split()
    s = ' '.join(t)
    rep = {'\\times': '×', '\\div': '÷', '\\pi': 'π', '\\theta': 'θ', '\\infty': 'oo', '\\leq': '≤', '\\geq': '≥', '\\lt': '<', '\\gt': '>',
           '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\log': 'log', '\\left': '', '\\right': '', '\\int': '∫'}
    for k, v in rep.items(): s = s.replace(k, v)
    # \frac { a } { b } -> (a)/(b), \sqrt { a } -> sqrt(a), ^ { a } -> ^(a)
    for _ in range(6):
        s = re.sub(r'\\frac \{ ([^{}]*) \} \{ ([^{}]*) \}', r'(\1)/(\2)', s)
        s = re.sub(r'\\sqrt \{ ([^{}]*) \}', r'sqrt(\1)', s)
        s = re.sub(r'\^ \{ ([^{}]*) \}', r'^(\1)', s)
        s = re.sub(r'_ \{ ([^{}]*) \}', r'_(\1)', s)
    s = re.sub(r'\^ (\S)', r'^(\1)', s)
    return s.replace(' ', '')

ok_tok = set(list('0123456789abcdefghiklmnoprstuvwxyz+-=()[]/<>!|') + ['\\times','\\div','\\pi','\\theta','\\infty','\\leq','\\geq','\\frac','\\sqrt','^','{','}','\\sin','\\cos','\\tan','\\log','\\left(','\\right)'])
t = pq.read_table('/home/user/data/crohme/2019-00000-of-00001.parquet').to_pylist()
random.seed(1); random.shuffle(t)
n = 0
for r in t:
    toks = r['label'].split()
    if not all(x in ok_tok for x in toks) or len(toks) > 20: continue
    im = Image.open(io.BytesIO(r['image']['bytes'])).convert('L')
    im = im.resize((im.width // 2, im.height // 2), Image.BILINEAR)
    a = np.asarray(im)
    if a.mean() < 128: a = 255 - a
    name = f'h{n}'
    a.astype(np.uint8).tofile(f'{OUT}/{name}.raw')
    items.append({'name': name, 'w': a.shape[1], 'h': a.shape[0], 'gt': latex_to_text(r['label']), 'latex': r['label'], 'kind': 'hand'})
    n += 1
    if n >= 150: break

# printed problems (like a worksheet photo)
printed = ['3x+5=20', '2x-7=11', '12÷4+6', '5×(3+2)', 'x+4=9', '7-3x=1', '45+38', '6×7-12', '4x=28', '9-2=7', '3(x+1)=12', '(2+3)×4']
fonts = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf', '/usr/share/fonts/truetype/freefont/FreeSans.ttf']
for i, p in enumerate(printed):
    f = ImageFont.truetype(fonts[i % len(fonts)], 48)
    im = Image.new('L', (700, 140), 235)
    d = ImageDraw.Draw(im)
    d.text((30, 35), p, fill=30, font=f)
    a = np.asarray(im.rotate(random.uniform(-3, 3), fillcolor=235, resample=Image.BILINEAR)).astype(np.float32)
    a = np.clip(a + np.random.normal(0, 6, a.shape) + np.linspace(-20, 20, a.shape[1])[None, :], 0, 255).astype(np.uint8)
    name = f'p{i}'
    a.tofile(f'{OUT}/{name}.raw')
    items.append({'name': name, 'w': a.shape[1], 'h': a.shape[0], 'gt': p.replace(' ', ''), 'kind': 'print'})
json.dump(items, open(f'{OUT}/index.json', 'w'), ensure_ascii=False, indent=0)
print(len(items))
