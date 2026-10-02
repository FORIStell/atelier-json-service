// Write the tiny model's readings as LaTeX (for scoring with the formula reader): node dump_tiny.mjs <evalDir> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { SymbolModel } from '../web/src/ocr/model.js';
import { binarize } from '../web/src/ocr/preprocess.js';
import { recognizeMask } from '../web/src/ocr/recognize.js';
import { parse } from '../web/src/engine/parser.js';
import { rawTex } from '../web/src/engine/print.js';
const [dir, out] = process.argv.slice(2);
const md = process.env.MODEL_DIR || new URL('../web/model/', import.meta.url).pathname;
const meta = JSON.parse(fs.readFileSync(path.join(md, 'symbols.json'), 'utf8'));
const buf = fs.readFileSync(path.join(md, 'symbols.bin'));
const f16 = (h) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? NaN : s * 2 ** (e - 15) * (1 + f / 1024); };
const model = new SymbolModel(meta, Float32Array.from(new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2), f16));
const res = {};
for (const it of JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))) {
  const g = Float32Array.from(fs.readFileSync(path.join(dir, it.name + '.raw')), (v) => v / 255);
  const t = recognizeMask(binarize(g, it.w, it.h), it.w, it.h, model).lines.join(', ');
  try { res[it.name] = rawTex(parse(t)).replace(/\\left|\\right/g, ''); } catch { res[it.name] = null; }
}
fs.writeFileSync(out, JSON.stringify(res));
