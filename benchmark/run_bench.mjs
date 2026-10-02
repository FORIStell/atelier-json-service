// Score MathBot on the exam benchmark: node run_bench.mjs [--fails] [--cat=Limits]
// Answers are compared numerically with the SymPy answers in exam_expected.json (see exam_problems.py).
import fs from 'node:fs';
import { solveProblem } from '../web/src/engine/index.js';
import { parse } from '../web/src/engine/parser.js';
import { fromRaw, evalNum } from '../web/src/engine/cas.js';

const { points: PTS, ipoints: IPTS, problems } = JSON.parse(fs.readFileSync(new URL('exam_expected.json', import.meta.url), 'utf8'));
const showFails = process.argv.includes('--fails');
const onlyCat = (process.argv.find((a) => a.startsWith('--cat=')) || '').slice(6);

const ev = (t, env = {}) => evalNum(fromRaw(parse(t)), env);
const close = (a, b, tol = 1e-6) => a !== null && b !== null && Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const exactPart = (t) => t.split('≈')[0].trim() || t; // "2*sqrt(3) ≈ 3.46" -> "2*sqrt(3)"
const rhs = (t) => { const i = t.lastIndexOf('='); return (i >= 0 ? t.slice(i + 1) : t).trim(); };
const parts = (t) => t.split(/,\s*(?=[a-zλ][\w^\-]*(?:\([a-z]\))?\s*=)|;\s*/).map((s) => s.trim()).filter(Boolean);
const val = (t, env) => { try { return ev(exactPart(t), env); } catch { const a = t.split('≈')[1]; return a ? Number(a.trim()) : NaN; } };
const sameSet = (A, B, tol = 1e-6) => A.length === B.length && A.every((a, i) => close(a, B[i], tol));

function check(p, r) {
  const t = r.answerText.replace(/\s*\+\s*C$/, '');
  switch (p.kind) {
    case 'num': return close(val(rhs(t)), p.expected[0]) || (p.cat === 'Statistics' && [...t.matchAll(/-?\d+(?:\.\d+)?/g)].some((m) => close(Number(m[0]), p.expected[0])));
    case 'set': {
      if (/^no (real )?solution/i.test(t)) return p.expected.length === 0;
      let ps = parts(t).filter((s) => s.includes('='));
      if (p.cat === 'Systems') ps = ps.sort();
      const vals = ps.map((s) => val(rhs(s)));
      return sameSet(p.cat === 'Systems' ? vals : vals.sort((a, b) => a - b), p.expected, 1e-6);
    }
    case 'trig': {
      const tt = t.replace(/\(k any integer\)/, '');
      const out = [];
      for (const s of parts(tt)) for (let kk = -4; kk <= 4; kk++) {
        let v = val(rhs(s), { k: kk });
        if (!Number.isFinite(v)) continue;
        if (v >= -1e-9 && v < 2 * Math.PI - 1e-9 && !out.some((o) => Math.abs(o - v) < 1e-7)) out.push(Math.max(0, v));
      }
      return sameSet(out.sort((a, b) => a - b), p.expected, 1e-6);
    }
    case 'expr': {
      const e = rhs(exactPart(t));
      const pts = p.npts || PTS, v = p.var || 'x';
      return pts.every((x, i) => p.expected[i] === null || close(val(e, { [v]: x }), p.expected[i]));
    }
    case 'anti': {
      const F = exactPart(t), h = 1e-5;
      return PTS.every((x, i) => p.expected[i] === null || close((val(F, { x: x + h }) - val(F, { x: x - h })) / (2 * h), p.expected[i], 1e-4));
    }
    case 'ineq': {
      if (/^all real/i.test(t)) return p.expected.every(Boolean);
      if (/^no solution/i.test(t)) return p.expected.every((b) => !b);
      const segs = t.split(/\s+or\s+/);
      const holds = (x) => segs.some((seg) => {
        const toks = seg.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=').split(/(<=|>=|!=|<|>|=)/).map((s) => s.trim());
        for (let i = 1; i < toks.length; i += 2) {
          const a = val(toks[i - 1], { x }), b = val(toks[i + 1], { x }), op = toks[i];
          const ok = { '<': a < b - 1e-12, '>': a > b + 1e-12, '<=': a <= b + 1e-12, '>=': a >= b - 1e-12, '=': Math.abs(a - b) < 1e-9, '!=': Math.abs(a - b) > 1e-9 }[op];
          if (!ok) return false;
        }
        return true;
      });
      return IPTS.every((x, i) => holds(x) === p.expected[i]);
    }
    case 'complex': {
      let tt = t;
      const m = t.match(/complex:\s*(.+)\)$/);
      if (m) tt = m[1];
      const zs = (tt.includes('=') ? parts(tt).map(rhs) : [tt]).map((s) => { const re = val(s, { i: 0 }); return [re, val(s, { i: 1 }) - re]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return zs.length === p.expected.length && zs.every((z, i) => close(z[0], p.expected[i][0]) && close(z[1], p.expected[i][1]));
    }
    case 'matrix': {
      const ents = t.replace(/[[\]]/g, '').split(',').map((s) => val(s.trim()));
      return sameSet(ents, p.expected);
    }
    case 'asym': {
      const ps = parts(t);
      const vert = ps.filter((s) => /^x\s*=/.test(s)).map((s) => val(rhs(s))).sort((a, b) => a - b);
      const other = ps.filter((s) => /^y\s*=/.test(s));
      if (!sameSet(vert, [...p.expected.vert].sort((a, b) => a - b))) return false;
      return other.length === 1 && PTS.every((x, i) => close(val(rhs(other[0]), { x }), p.expected.other[i]));
    }
    case 'extrema': {
      const got = [...t.matchAll(/local (maximum|minimum) at \(([^;]+?), ([^;]+)\)/g)].map((m) => [val(m[2]), val(m[3]), m[1] === 'maximum' ? 'max' : 'min']).sort((a, b) => a[0] - b[0]);
      return got.length === p.expected.length && got.every((g, i) => close(g[0], p.expected[i][0]) && close(g[1], p.expected[i][1]) && g[2] === p.expected[i][2]);
    }
    case 'ode': {
      const m = t.match(/^y\s*=\s*(.+)$/);
      if (!m) return false;
      const h = 1e-5;
      return [0.4, 1.1].every((C) => PTS.every((x) => {
        const Y = (xx) => val(m[1], { x: xx, C });
        const dy = (Y(x + h) - Y(x - h)) / (2 * h);
        return close(dy, val(p.expected.rhs, { x, y: Y(x) }), 1e-4);
      }));
    }
  }
  return false;
}

const byCat = new Map();
const fails = [];
let pass = 0, total = 0;
const t0 = Date.now();
for (const p of problems) {
  if (onlyCat && p.cat !== onlyCat) continue;
  total++;
  let ok = false, ans = '';
  try { const r = solveProblem(p.q, {}); ans = r.answerText; ok = check(p, r); } catch (e) { ans = 'ERROR: ' + e.message; }
  const c = byCat.get(p.cat) || [0, 0]; c[1]++; if (ok) { c[0]++; pass++; } else fails.push([p.cat, p.q, ans]);
  byCat.set(p.cat, c);
}
console.log('Category'.padEnd(24), 'Score');
for (const [cat, [a, b]] of byCat) console.log(cat.padEnd(24), `${a}/${b}`.padStart(7), `${Math.round(100 * a / b)}%`.padStart(6));
console.log('-'.repeat(40));
console.log('TOTAL'.padEnd(24), `${pass}/${total}`.padStart(7), `${(100 * pass / total).toFixed(1)}%`.padStart(6), ` (${Date.now() - t0} ms)`);
if (showFails) for (const [c, q, a] of fails) console.log(`✗ [${c}] ${q}\n    got: ${a.slice(0, 160)}`);
