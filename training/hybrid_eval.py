"""Hybrid reader: formula model (constrained beam search) + tiny model's reading, picked by the formula model's score.
usage: python hybrid_eval.py <evalDir> <mfrDir> <tiny_tex.json> <out.json> [--beam=5] [--limit=N]"""
import json, re, sys, time
import numpy as np
sys.argv_backup = list(sys.argv)
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d: next((a.split('=')[1] for a in sys.argv if a.startswith(f'--{k}=')), d)
ev, md, tiny_path, out = args
BEAM, LIMIT = int(opt('beam', '5')), int(opt('limit', '100000'))
TINY_BONUS = float(opt('bonus', '0'))
TTA = float(opt('tta', '0'))
sys.argv = [sys.argv[0], ev, md, '/tmp/_unused.json', '--limit=0'] + [a for a in sys.argv if a.startswith(('--aspect', '--nopad', '--scale'))]
import mfr_eval as M  # reuse model, preprocessing and vocabulary masks
sys.argv = sys.argv_backup

PEN = float(opt('pen', '1.5'))
RARE = {'pi', 'alpha', 'beta', 'theta', 'cos', 'sin', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'prod', 'sum', 'int', 'circ', 'prime',
        'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'exp', '_', 'Ġ_', 'pm', '%', 'Ġ%', '!', 'Ġ!', "'", "Ġ'", '°'}
P = np.zeros(len(M.vocab), np.float32)
for t, i in M.vocab.items():
    if t in RARE: P[i] = -PEN
    if t in ('.', 'Ġ.'): P[i] = -0.5 * PEN

def log_softmax(x):
    m = x.max(-1, keepdims=True); return x - m - np.log(np.exp(x - m).sum(-1, keepdims=True))

def beam_search(hs, k=BEAM, max_len=90):
    beams = [([1], 0.0)]; done = []
    for _ in range(max_len):
        ids = np.array([b[0] for b in beams], np.int64)
        lg = M.dec.run(None, {'input_ids': ids, 'encoder_hidden_states': np.repeat(hs, len(beams), 0)})[0][:, -1]
        lp = log_softmax(lg)
        cand = []
        for bi, (seq, sc) in enumerate(beams):
            row = lp[bi] + P + (M.mask_cmd if seq[-1] in M.bs_ids else M.mask_plain)
            for t in np.argpartition(-row, k)[:k]:
                cand.append((seq + [int(t)], sc + float(row[t])))
        cand.sort(key=lambda c: -c[1])
        beams = []
        for seq, sc in cand:
            if seq[-1] == 2: done.append((seq, sc / (len(seq) - 1) ** 0.6))
            else: beams.append((seq, sc))
            if len(beams) == k: break
        if not beams or (len(done) >= k and max(d[1] for d in done) > beams[0][1] / len(beams[0][0]) ** 0.6): break
    return sorted(done, key=lambda d: -d[1])

def crohme_style(tex):
    tex = tex.replace('\\le ', '\\leq ').replace('\\ge ', '\\geq ')
    toks = re.findall(r'\\[a-zA-Z]+|\\.|\S', tex)
    toks = ['\\leq' if t == '\\le' else '\\geq' if t == '\\ge' else t for t in toks]
    return ' '.join(toks)

def score_seq(hs, tex):
    ids = [1] + M.tok.encode(crohme_style(tex)).ids + [2]
    lg = M.dec.run(None, {'input_ids': np.array([ids[:-1]], np.int64), 'encoder_hidden_states': hs})[0][0]
    lp = log_softmax(lg)
    s = sum(float(lp[i, ids[i + 1]] + P[ids[i + 1]]) for i in range(len(ids) - 1))
    return s / (len(ids) - 1) ** 0.6

tiny = json.load(open(tiny_path))
items = json.load(open(f'{ev}/index.json'))[:LIMIT]
res, stats = {}, {'tiny': 0, 'mfr': 0, 'mfr2': 0}
t0 = time.time()
for it in items:
    g = np.fromfile(f"{ev}/{it['name']}.raw", np.uint8).reshape(it['h'], it['w'])
    hs = M.enc.run(None, {'pixel_values': M.prep(M.crop_ink(g))})[0]
    beams = beam_search(hs)
    cands = [[M.tok.decode(b[0][1:], skip_special_tokens=True), b[1], 'mfr'] for b in beams]
    tt = tiny.get(it['name'])
    if tt:
        cands.append([tt, score_seq(hs, tt) + TINY_BONUS, 'tiny'])
    if TTA:
        # second view of the image (different padding); merge its guesses and average scores over both views
        a0 = M.ASPECT; M.ASPECT = TTA
        hs2 = M.enc.run(None, {'pixel_values': M.prep(M.crop_ink(g))})[0]
        M.ASPECT = a0
        seen = {c[0] for c in cands}
        for b in beam_search(hs2):
            t = M.tok.decode(b[0][1:], skip_special_tokens=True)
            if t not in seen: cands.append([t, score_seq(hs, t), 'mfr2']); seen.add(t)
        for c in cands:
            c[1] = 0.5 * (c[1] + score_seq(hs2, c[0]) + (TINY_BONUS if c[2] == 'tiny' else 0))
    cands.sort(key=lambda c: -c[1])
    if cands: stats[cands[0][2]] += 1
    res[it['name']] = cands
json.dump(res, open(out, 'w'), ensure_ascii=False)
print(f"{len(items)} in {time.time() - t0:.0f}s, picked {stats}")
