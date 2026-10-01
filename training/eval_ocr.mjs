// Run the browser OCR pipeline in Node on exported raw images: node eval_ocr.mjs <evalDir> [modelDir]
import fs from 'node:fs';
import path from 'node:path';
import { SymbolModel } from '../web/src/ocr/model.js';
import { binarize } from '../web/src/ocr/preprocess.js';
import { recognizeMask } from '../web/src/ocr/recognize.js';

const dir = process.argv[2];
const modelDir = process.argv[3] || new URL('../web/model/', import.meta.url).pathname;
const meta = JSON.parse(fs.readFileSync(path.join(modelDir, 'symbols.json'), 'utf8'));
const buf = fs.readFileSync(path.join(modelDir, 'symbols.bin'));
const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2);
// reuse the loader's float16 decoding
const f16 = (h) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? NaN : s * 2 ** (e - 15) * (1 + f / 1024); };
const w = Float32Array.from(u16, f16);
const M = new SymbolModel(meta, w);
const norm = (s) => s.replace(/\s+/g, '').replace(/\*/g, '×').replace(/\(([^()]{1})\)/g, '$1').replace(/^\((.*)\)$/, '$1');
const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const stats = {};
const verbose = process.env.V;
for (const it of idx) {
  const raw = fs.readFileSync(path.join(dir, it.name + '.raw'));
  const g = Float32Array.from(raw, (v) => v / 255);
  const mask = binarize(g, it.w, it.h);
  const out = recognizeMask(mask, it.w, it.h, M);
  const got = out.lines.join(' | ');
  if (process.env.DUMP) fs.writeFileSync(path.join(dir, it.name + '.items.json'), JSON.stringify(out.items));
  const ok = norm(got) === norm(it.gt);
  stats[it.kind] = stats[it.kind] || { n: 0, ok: 0, cer: 0 };
  stats[it.kind].n++; if (ok) stats[it.kind].ok++;
  stats[it.kind].cer += lev(norm(got), norm(it.gt)) / Math.max(1, norm(it.gt).length);
  if (verbose && (!ok || verbose === 'all')) console.log(ok ? 'OK ' : 'XX ', it.name.padEnd(5), 'gt:', it.gt.padEnd(28), 'got:', got);
}
for (const [k, s] of Object.entries(stats)) console.log(k, `exact ${s.ok}/${s.n} = ${(100 * s.ok / s.n).toFixed(1)}%`, `char error ${(100 * s.cer / s.n).toFixed(1)}%`);
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
