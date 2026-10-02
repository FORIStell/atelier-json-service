// How often is the right reading among the top k valid candidates? node topk.mjs <evalDir> <cands.json>
import fs from 'node:fs';
import path from 'node:path';
import { latexToText } from '../web/src/engine/latex.js';
import { parse } from '../web/src/engine/parser.js';
import { fromRaw } from '../web/src/engine/cas.js';
import { text } from '../web/src/engine/print.js';
const [dir, cf] = process.argv.slice(2);
const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(cf, 'utf8'));
const canon = (t) => { try { return text(fromRaw(parse(latexToText(t)))).replace(/\s+/g, ''); } catch { return null; } };
const hits = [0, 0, 0, 0, 0, 0]; let n = 0;
for (const it of idx) {
  const g = canon(it.latex); if (!g || !C[it.name]) continue; n++;
  const seen = []; for (const [t] of C[it.name]) { const c = canon(t); if (c && !seen.includes(c)) seen.push(c); }
  const r = seen.indexOf(g);
  for (let k = 1; k <= 6; k++) if (r >= 0 && r < k) hits[k - 1]++;
}
console.log(path.basename(dir), 'n=' + n, hits.map((h, i) => `top${i + 1} ${(100 * h / n).toFixed(1)}%`).join('  '));
