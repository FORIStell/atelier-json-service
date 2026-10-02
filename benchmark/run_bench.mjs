// Score MathBot on the exam benchmark: node run_bench.mjs [--fails] [--cat=Limits]
// Answers are compared numerically with the SymPy answers in exam_expected.json (see exam_problems.py).
import fs from 'node:fs';
import { solveProblem } from '../web/src/engine/index.js';

const { points: PTS, ipoints: IPTS, problems } = JSON.parse(fs.readFileSync(new URL('exam_expected.json', import.meta.url), 'utf8'));
const showFails = process.argv.includes('--fails');
const onlyCat = (process.argv.find((a) => a.startsWith('--cat=')) || '').slice(6);

import { check } from './bench_check.mjs';

const byCat = new Map();
const fails = [];
let pass = 0, total = 0;
const t0 = Date.now();
for (const p of problems) {
  if (onlyCat && p.cat !== onlyCat) continue;
  total++;
  let ok = false, ans = '';
  try { const r = solveProblem(p.q, {}); ans = r.answerText; ok = check(p, r, PTS, IPTS); } catch (e) { ans = 'ERROR: ' + e.message; }
  const c = byCat.get(p.cat) || [0, 0]; c[1]++; if (ok) { c[0]++; pass++; } else fails.push([p.cat, p.q, ans]);
  byCat.set(p.cat, c);
}
console.log('Category'.padEnd(24), 'Score');
for (const [cat, [a, b]] of byCat) console.log(cat.padEnd(24), `${a}/${b}`.padStart(7), `${Math.round(100 * a / b)}%`.padStart(6));
console.log('-'.repeat(40));
console.log('TOTAL'.padEnd(24), `${pass}/${total}`.padStart(7), `${(100 * pass / total).toFixed(1)}%`.padStart(6), ` (${Date.now() - t0} ms)`);
if (showFails) for (const [c, q, a] of fails) console.log(`✗ [${c}] ${q}\n    got: ${a.slice(0, 160)}`);
