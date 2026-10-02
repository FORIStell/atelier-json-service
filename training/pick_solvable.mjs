// Like pick_valid.mjs, but keeps the best candidate the solver can actually solve: node pick_solvable.mjs <cands.json> <out.json>
import fs from 'node:fs';
import { latexToText } from '../web/src/engine/latex.js';
import { parse } from '../web/src/engine/parser.js';
import { solveProblem } from '../web/src/engine/index.js';
const [inp, out] = process.argv.slice(2);
const c = JSON.parse(fs.readFileSync(inp, 'utf8'));
const valid = (t) => { try { const s = latexToText(t); if (!s.trim() || /\(\s*\)/.test(s)) return null; parse(s); return s; } catch { return null; } };
const solvable = (s) => { try { solveProblem(s, {}); return true; } catch { return false; } };
const res = {}; let changed = 0;
for (const [k, list] of Object.entries(c)) {
  const ok = list.filter(([t]) => valid(t));
  const best = ok.find(([t]) => solvable(valid(t))) || ok[0];
  res[k] = best ? best[0] : (list[0] ? list[0][0] : '');
  if (best && ok[0] && best[0] !== ok[0][0]) changed++;
}
fs.writeFileSync(out, JSON.stringify(res));
console.log('changed by solvability check:', changed);
