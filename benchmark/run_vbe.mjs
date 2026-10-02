// Score MathBot on Lithuanian VBE exam tasks: node run_vbe.mjs [--fails]
// Two scores per task: the typed math core, and the task as worded in Lithuanian.
import fs from 'node:fs';
import { solveProblem } from '../web/src/engine/index.js';
import { check } from './bench_check.mjs';

const { points: PTS, ipoints: IPTS, tasks } = JSON.parse(fs.readFileSync(new URL('vbe_expected.json', import.meta.url), 'utf8'));
const showFails = process.argv.includes('--fails');
const run = (q, p) => { try { const r = solveProblem(q, p.id.includes('11.4') ? { degrees: true } : {}); return [check({ ...p, cat: p.topic }, r, PTS, IPTS), r.answerText]; } catch (e) { return [false, 'ERROR: ' + e.message]; } };
const rows = [], fails = [];
const tally = { math: [0, 0], lt: [0, 0], skip: {} };
for (const p of tasks) {
  if (p.why) { tally.skip[p.why] = (tally.skip[p.why] || 0) + 1; continue; }
  const [okM, aM] = run(p.math, p), [okL, aL] = run(p.lt, p);
  tally.math[1]++; tally.lt[1]++; if (okM) tally.math[0]++; if (okL) tally.lt[0]++;
  rows.push([p.id, p.topic, okM, okL]);
  if (!okM) fails.push(`✗ math ${p.id}: ${p.math}\n      got: ${aM.slice(0, 140)}`);
  if (!okL) fails.push(`✗ lt   ${p.id}: ${p.lt.slice(0, 90)}\n      got: ${aL.slice(0, 140)}`);
}
const byTopic = new Map();
for (const [, topic, okM, okL] of rows) { const c = byTopic.get(topic) || [0, 0, 0]; c[0]++; c[1] += okM; c[2] += okL; byTopic.set(topic, c); }
console.log('Topic'.padEnd(20), 'Math typed'.padStart(11), 'Lithuanian'.padStart(11));
for (const [tp, [nn, m, l]] of byTopic) console.log(tp.padEnd(20), `${m}/${nn}`.padStart(11), `${l}/${nn}`.padStart(11));
console.log('-'.repeat(44));
const pc = ([a, b]) => `${a}/${b} (${Math.round(100 * a / b)}%)`;
console.log('TOTAL'.padEnd(20), pc(tally.math).padStart(11), pc(tally.lt).padStart(11));
console.log('Not auto-checked:', Object.entries(tally.skip).map(([k, v]) => `${v} need ${k === 'figure' ? 'the picture' : k === 'proof' ? 'a proof' : 'several reasoning steps'}`).join(', '), `(of ${tasks.length} tasks)`);
if (showFails) fails.forEach((f) => console.log(f));
