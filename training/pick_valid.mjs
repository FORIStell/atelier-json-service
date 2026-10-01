// From scored candidates, keep the best one the math engine can read: node pick_valid.mjs <cands.json> <out.json>
import fs from 'node:fs';
import { latexToText } from '../web/src/engine/latex.js';
import { parse } from '../web/src/engine/parser.js';
const [inp, out] = process.argv.slice(2);
const c = JSON.parse(fs.readFileSync(inp, 'utf8'));
const res = {}; let changed = 0;
for (const [k, list] of Object.entries(c)) {
  const ok = list.find(([t]) => { try { const s = latexToText(t); if (!s.trim()) return false; parse(s); return !/\(\s*\)/.test(s); } catch { return false; } });
  res[k] = ok ? ok[0] : (list[0] ? list[0][0] : '');
  if (ok && list[0] && ok[0] !== list[0][0]) changed++;
}
fs.writeFileSync(out, JSON.stringify(res));
console.log('changed by validity check:', changed);
