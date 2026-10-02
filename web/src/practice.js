// Practice: make problems by topic (or a similar one to a solved problem) and check the student's answer.
import { solveProblem } from './engine/index.js';
import { parse } from './engine/parser.js';
import { fromRaw, evalNum } from './engine/cas.js';

const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const nz = (rng, a, b) => { let v; do v = int(rng, a, b); while (v === 0); return v; };
const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];
// "3x + -5" -> "3x - 5", "1x" -> "x"
const tidy = (s) => s.replace(/\+ -/g, '- ').replace(/- -/g, '+ ').replace(/(^|[^\d.])1(?=[a-z(])/g, '$1').replace(/\s+/g, ' ').trim();
const term = (c, v) => (c === 0 ? '' : ` + ${c}${v}`);

export const TOPICS = [
  { id: 'linear', en: 'Linear equations', lt: 'Tiesinės lygtys', make: (r) => { const x = nz(r, -9, 12), a = nz(r, 2, 9), b = nz(r, -15, 15), c = a * x + b; return tidy(`${a}x + ${b} = ${c}`); } },
  { id: 'quadratic', en: 'Quadratic equations', lt: 'Kvadratinės lygtys', make: (r) => { const p = nz(r, -8, 8); let q; do q = nz(r, -8, 8); while (q === p); const a = pick(r, [1, 1, 1, 2]); return tidy(`${a}x^2${term(-a * (p + q), 'x')}${term(a * p * q, '')} = 0`); } },
  { id: 'system', en: 'Systems of equations', lt: 'Lygčių sistemos', make: (r) => { const x = nz(r, -6, 7), y = nz(r, -6, 7), a = nz(r, 1, 4), b = nz(r, -4, 4), c = nz(r, 1, 4), d = -nz(r, 1, 3); if (a * d === b * c) return tidy(`${a}x + ${b}y = ${a * x + b * y}, x + y = ${x + y}`); return tidy(`${a}x + ${b}y = ${a * x + b * y}, ${c}x + ${d}y = ${c * x + d * y}`); } },
  { id: 'roots', en: 'Roots and powers', lt: 'Šaknys ir laipsniai', make: (r) => { const m = pick(r, [2, 3, 5, 6, 7]), a = int(r, 2, 5), b = int(r, 1, 4); return pick(r, [`sqrt(${a * a * m}) + sqrt(${b * b * m})`, `sqrt(${a * a * m}) - sqrt(${b * b * m})`, `sqrt(${a * a * m}) * sqrt(${m})`, `2^${int(r, 3, 6)} * 2^${int(r, -2, 3)} / 2^${int(r, 1, 4)}`]); } },
  { id: 'log', en: 'Logarithms and exponents', lt: 'Logaritmai ir rodiklinės lygtys', make: (r) => { const b = pick(r, [2, 3, 5]), c = int(r, 1, b === 2 ? 5 : 3), a = nz(r, -6, 6); return pick(r, [tidy(`log_${b}(x + ${a}) = ${c}`), tidy(`${b}^(x + ${a}) = ${b ** c}`), `log_${b}(${b ** c}) + log_${b}(${b})`]); } },
  { id: 'derivative', en: 'Derivatives', lt: 'Išvestinės', make: (r) => { const a = nz(r, -4, 5), b = int(r, -6, 6), c = int(r, -9, 9), d = int(r, -9, 9); return pick(r, [tidy(`d/dx (${a}x^3${term(b, 'x^2')}${term(c, 'x')}${term(d, '')})`), tidy(`d/dx (${nz(r, 1, 4)}x^2 * sin(x))`), tidy(`d/dx (${nz(r, 1, 5)}e^(${nz(r, 2, 4)}x))`)]); } },
  { id: 'integral', en: 'Integrals', lt: 'Integralai', make: (r) => { const a = 3 * nz(r, 1, 3), b = 2 * int(r, -3, 3), k = int(r, 1, 3); return pick(r, [tidy(`∫_0^${k} (${a}x^2${term(b, 'x')}) dx`), tidy(`∫ (${4 * nz(r, 1, 3)}x^3${term(2 * int(r, -4, 4), 'x')}${term(int(r, -6, 6), '')}) dx`)]); } },
  { id: 'limit', en: 'Limits', lt: 'Ribos', make: (r) => { const p = nz(r, -5, 6), q = nz(r, -5, 6); return tidy(`lim x->${p} (x^2${term(-(p + q), 'x')}${term(p * q, '')})/(x${term(-p, '')})`); } },
  { id: 'percent', en: 'Percentages', lt: 'Procentai', make: (r) => { const p = pick(r, [5, 10, 15, 20, 25, 30, 40]), n = 20 * int(r, 2, 30); return pick(r, [`Kiek eurų yra ${p} % nuo ${n} eurų?`, `Prekė kainavo ${n} €. Jos kaina sumažinta ${p} %. Kokia nauja kaina?`, `Prekė kainavo ${n} €. Ji pabrango ${p} %. Kokia nauja kaina?`]); } },
  { id: 'sequence', en: 'Progressions', lt: 'Progresijos', make: (r) => { const a1 = int(r, -5, 12), d = nz(r, -4, 6), n = int(r, 6, 20); return pick(r, [`Aritmetinės progresijos pirmasis narys ${a1}, skirtumas ${d}. Raskite ${n}-ąjį narį.`, `Geometrinės progresijos pirmasis narys ${nz(r, 1, 5)}, vardiklis ${pick(r, [2, 3, -2])}. Raskite ${int(r, 4, 7)}-ąjį narį.`]); } },
  { id: 'probability', en: 'Probability', lt: 'Tikimybės', make: (r) => { const w = int(r, 2, 9), k = int(r, 2, 9); return pick(r, [`Dėžėje yra ${w} baltų ir ${k} juodų rutuliukų. Atsitiktinai ištraukiamas vienas rutuliukas. Kokia tikimybė, kad jis baltas?`, `Metami du lošimo kauliukai. Kokia tikimybė, kad akių suma bus ${int(r, 4, 10)}?`]); } },
];

// numbers in an answer such as "x = 2, x = 3", "P = 1/6", "8*sqrt(2)"; null when the answer is an expression in x
function values(text) {
  const out = [];
  for (const part of String(text).replace(/\(k any integer\)/, '').replace(/\s*≈.*$/, '').split(/,\s+|;\s*|\s+(?:or|arba|and|ir)\s+/)) {
    const rhs = part.includes('=') ? part.slice(part.lastIndexOf('=') + 1) : part;
    const s = rhs.replace(/[€%°]|\b(eur\w*|cm|m|km|h|val\w*|kg|l)\b/gi, '').trim();
    if (!s) continue;
    if (/(^|[^a-z])[a-z](?![a-z(])/i.test(s.replace(/sqrt|pi|π|e\b/g, ''))) return null;
    try { const v = evalNum(fromRaw(parse(s.replace(/π/g, 'pi')))); if (!Number.isFinite(v)) return null; out.push(v); } catch { return null; }
  }
  return out;
}
const PTS = [0.7, 1.3, 2.1];
function fnOf(text) {
  const s = String(text).replace(/\+\s*C\s*$/, '').replace(/^\s*[a-z]'?(\(x\))?\s*=/i, '').trim();
  const f = fromRaw(parse(s));
  return (x) => evalNum(f, { x });
}
const close = (a, b) => Math.abs(a - b) <= 2e-3 * Math.max(1, Math.abs(b)) || Math.abs(a - b) <= 0.006; // money may be rounded to cents

// is the student's answer right? returns { ok, expected }
export function check(user, problem) {
  const want = problem.result.answerText;
  const u = String(user || '').trim().replace(/(\d),(\d)/g, '$1.$2').replace(/−/g, '-');
  if (!u) return { ok: false, expected: want };
  const w = values(want);
  if (w) {
    const g = values(u);
    if (!g || !g.length) return { ok: false, expected: want };
    // a probability may be written as a percent
    if (problem.result.title === 'Probability' && /%/.test(user) && g.length === 1) g[0] /= 100;
    const left = [...g];
    const ok = w.length === g.length && w.every((v) => { const i = left.findIndex((x) => close(x, v)); if (i < 0) return false; left.splice(i, 1); return true; });
    return { ok, expected: want };
  }
  // an expression: compare at a few points (an antiderivative may differ by a constant)
  try {
    const f = fnOf(want), g = fnOf(u.replace(/\bln\b/g, 'ln'));
    const d = PTS.map((x) => g(x) - f(x));
    const anti = /\+\s*C\s*$/.test(want);
    const ok = d.every((v, i) => Number.isFinite(v) && (anti ? close(v, d[0]) : close(g(PTS[i]), f(PTS[i]))));
    return { ok, expected: want };
  } catch { return { ok: false, expected: want }; }
}

const BAD = /infinite|many|no real|no solution|complex|nėra|begal/i;
const nice = (r) => { if (BAD.test(r.answerText) || !/\d/.test(r.answerText)) return false; const v = values(r.answerText); return v === null ? !/\d\.\d{3}/.test(r.answerText) : v.every((x) => Math.abs(x * 6 - Math.round(x * 6)) < 1e-9 || Math.abs(x * 100 - Math.round(x * 100)) < 1e-6) && v.every((x) => Math.abs(x) < 1e6); };

export function rng(seed = Math.floor(Math.random() * 2 ** 31)) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a new problem of a topic, already solved (so the solution can be shown)
export function generate(topicId, r = rng()) {
  const t = TOPICS.find((x) => x.id === topicId) || TOPICS[0];
  for (let i = 0; i < 40; i++) {
    const text = t.make(r);
    try { const result = solveProblem(text); if (result.steps.length && nice(result)) return { topic: t.id, text, result }; } catch { /* try another */ }
  }
  throw new Error('Could not make a problem');
}

// the same problem with other numbers: same kind of answer, still nice
export function similar(text, r = rng()) {
  let orig;
  try { orig = solveProblem(text); } catch { return null; }
  const nums = [...text.matchAll(/\d+/g)];
  if (!nums.length) return null;
  for (let i = 0; i < 60; i++) {
    let out = '', last = 0;
    for (const m of nums) {
      const n = Number(m[0]), before = text.slice(Math.max(0, m.index - 4), m.index);
      // keep exponents, log bases, ordinals of terms and tiny counts the same kind of size
      const keep = n === 0 || (/(\^|log_|_)\s*\(?$/.test(before) && n <= 3) || (/^\s*-?\s*(ąj|oj|th|st|nd|rd)/.test(text.slice(m.index + m[0].length)) && r() < 0.5);
      let v = n;
      if (!keep) { const s = Math.max(1, Math.round(n * 0.4)); do v = Math.max(n >= 1 ? 1 : 0, n + int(r, -s - 1, s + 1)); while (v === n && n > 1); }
      out += text.slice(last, m.index) + v; last = m.index + m[0].length;
    }
    out += text.slice(last);
    if (out === text) continue;
    try {
      const result = solveProblem(out);
      const count = (x) => (values(x.answerText) || []).length, whole = (x) => (values(x.answerText) || [0.5]).every(Number.isInteger);
      if (result.kind === orig.kind && result.title === orig.title && count(result) === count(orig) && (!whole(orig) || whole(result)) && nice(result) && result.steps.length) return { topic: null, text: out.replace(/(^|[^\d.^_])1(?=[a-z(])(?!og|im)/g, '$1'), result };
    } catch { /* try other numbers */ }
  }
  return null;
}
