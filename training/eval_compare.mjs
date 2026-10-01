// Compare readers on an eval folder: our tiny model vs. formula-reader predictions (LaTeX json files).
// node eval_compare.mjs <evalDir> [pred.json ...]
// "exact" = same expression after normalising, "same math" = same value at random points
// (what matters for solving).
import fs from 'node:fs';
import path from 'node:path';
import { SymbolModel } from '../web/src/ocr/model.js';
import { binarize } from '../web/src/ocr/preprocess.js';
import { recognizeMask } from '../web/src/ocr/recognize.js';
import { latexToText } from '../web/src/engine/latex.js';
import { parse } from '../web/src/engine/parser.js';
import { fromRaw, evalNum, freeVars } from '../web/src/engine/cas.js';
import { text } from '../web/src/engine/print.js';

const [dir, ...predFiles] = process.argv.slice(2);
const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const modelDir = new URL('../web/model/', import.meta.url).pathname;
const meta = JSON.parse(fs.readFileSync(path.join(modelDir, 'symbols.json'), 'utf8'));
const buf = fs.readFileSync(path.join(modelDir, 'symbols.bin'));
const f16 = (h) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? NaN : s * 2 ** (e - 15) * (1 + f / 1024); };
const model = new SymbolModel(meta, Float32Array.from(new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2), f16));

const toNode = (t) => { try { return fromRaw(parse(t)); } catch { return null; } };
const canon = (t) => { const n = toNode(t); return n ? text(n).replace(/\s+/g, '') : String(t).replace(/\s+/g, ''); };
function sameMath(a, b) {
  const A = toNode(a), B = toNode(b);
  if (!A || !B) return false;
  const sides = (n) => (n.t === 'rel' ? n.a : [n]);
  const sa = sides(A), sb = sides(B);
  if (sa.length !== sb.length || (A.t === 'rel') !== (B.t === 'rel') || (A.t === 'rel' && A.ops.join() !== B.ops.join())) return false;
  const vars = new Set(); freeVars(A, vars); freeVars(B, vars);
  for (let trial = 0; trial < 3; trial++) {
    const env = {}; for (const v of vars) env[v] = 0.37 + 1.13 * trial + Math.random() * 0.5;
    for (let i = 0; i < sa.length; i++) {
      let x, y; try { x = evalNum(sa[i], env); y = evalNum(sb[i], env); } catch { return false; }
      if (!(Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x)))) return false;
    }
  }
  return true;
}

const preds = predFiles.map((f) => [path.basename(f), JSON.parse(fs.readFileSync(f, 'utf8'))]);
const score = { tiny: { e: 0, m: 0, n: 0 } };
for (const [name] of preds) score[name] = { e: 0, m: 0, n: 0 };
const rows = [];
for (const it of idx) {
  let gt; try { gt = latexToText(it.latex); } catch { continue; }
  const raw = fs.readFileSync(path.join(dir, it.name + '.raw'));
  const g = Float32Array.from(raw, (v) => v / 255);
  const tiny = recognizeMask(binarize(g, it.w, it.h), it.w, it.h, model).lines.join(', ');
  const outs = [['tiny', tiny]];
  for (const [name, p] of preds) if (p[it.name] !== undefined) { let t; try { t = latexToText(p[it.name]); } catch { t = '?'; } outs.push([name, t]); }
  for (const [name, t] of outs) {
    const s = score[name]; s.n++;
    if (canon(t) === canon(gt)) s.e++;
    if (canon(t) === canon(gt) || sameMath(t, gt)) s.m++;
  }
  rows.push([it.name, gt, ...outs.map((o) => o[1])]);
}
if (process.env.V) rows.forEach((r) => console.log(r.join('  |  ')));
for (const [name, s] of Object.entries(score)) if (s.n) console.log(`${name.padEnd(16)} exact ${(100 * s.e / s.n).toFixed(1)}%   same math ${(100 * s.m / s.n).toFixed(1)}%   (n=${s.n})`);
