// 11th–12th grade and university topics: derivative at a point, tangent lines, extrema, asymptotes, domain,
// inverse functions, partial fractions, eigenvalues, sequences and series, first-order differential equations,
// and ∫ e^(ax) sin(bx) dx. Each handler returns a result, or null when the text is not that kind of problem.
import { Q, MathError, isQ, formatNumber } from './rational.js';
import { parse } from './parser.js';
import { fromRaw, simplify, expand, has, freeVars, evalNum, subst, sub, add, mul, div, pow, num, sym, fn, polyCoeffs, numerDenom, ZERO, ONE, E } from './cas.js';
import { tex, text } from './print.js';
import { derivative, integrate } from './calculus.js';
import { solveEquation, solveInequality, intervalsTex, intervalsText, chooseVar } from './solve.js';
import { toQArray, rationalRoots, polyDivide, toNode } from './poly.js';
import { parseMatrix } from './matrix.js';

const S = (x) => simplify(x);
const P = (s) => fromRaw(parse(s));
const ltex = (s) => s.replace(/λ/g, '\\lambda ');

// "f(x) = x^2 + 1", "y = x^2 + 1" or just "x^2 + 1"
function fnOf(src) {
  let m = src.trim().match(/^([a-z])\s*\(\s*([a-z])\s*\)\s*=\s*(.+)$/i);
  if (m) return { f: S(P(m[3])), v: m[2], name: `${m[1]}(${m[2]})`, fname: m[1] };
  m = src.trim().match(/^y\s*=\s*(.+)$/i);
  const f = S(P(m ? m[1] : src));
  const v = chooseVar([f]) || 'x';
  return { f, v, name: m ? 'y' : `f(${v})`, fname: m ? 'y' : 'f' };
}
const realSolutions = (f, v, steps) => {
  const r = solveEquation(f, ZERO, v, steps);
  return r.general ? { general: r.general } : { list: r.solutions.filter((s) => { try { return Number.isFinite(evalNum(s)); } catch { return false; } }) };
};
const approx = (x) => { try { return x.t === 'num' && isQ(x.v) && x.v.isInt() ? '' : ` \\approx ${formatNumber(evalNum(x), 6)}`; } catch { return ''; } };

export function advancedProblem(s, opts, res) {
  let m;
  const t = s.trim();
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(?:derivative|slope)\s+(?:of\s+)?(.+?)\s+(?:at|when|where)\s+([a-z])\s*=\s*(.+)$/i))) return derivativeAt(m[1], m[2], m[3], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(?:equation\s+of\s+)?(?:the\s+)?tangent(?:\s+line)?\s+(?:to|of|for)\s+(?:the\s+(?:curve|graph)\s+)?(.+?)\s+(?:at|when|where)\s+([a-z])\s*=\s*(.+)$/i))) return tangentLine(m[1], m[2], m[3], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(?:local\s+)?(?:extrema|extreme values|extremum|critical points|stationary points|turning points|max(?:ima|imum)?\s+and\s+min(?:ima|imum)?|minimum and maximum|min and max)\s+(?:of\s+)?(.+)$/i)) ||
      (m = t.match(/^(.+?)\s*,?\s+(?:extrema|critical points|turning points|max and min|stationary points)$/i))) return extrema(m[1], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(?:vertical\s+|horizontal\s+|oblique\s+|slant\s+)?asymptotes?\s+(?:of\s+)?(.+)$/i))) return asymptotes(m[1], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?domain\s+(?:of\s+)?(.+)$/i))) return domain(m[1], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?inverse\s+(?:function\s+)?(?:of\s+)?(.+)$/i)) && !/\[/.test(m[1])) return inverseFunction(m[1], res);
  if ((m = t.match(/^(?:partial\s+fractions?(?:\s+decomposition)?|decompose)\s+(?:of\s+)?(.+)$/i))) return partialFractions(m[1], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(eigenvalues?(?:\s+and\s+eigenvectors?)?|eigenvectors?)\s+(?:of\s+)?(\[.+\])$/i))) return eigen(m[2], res);
  if ((m = t.match(/^(?:solve\s+)?(y'|y′|dy\/dx)\s*=\s*(.+)$/i))) return ode(m[2], res);
  if ((m = t.match(/^(?:modulus|abs|absolute value)?\s*(?:of\s+)?\|(.+)\|$/i)) && /i/.test(m[1])) return modulus(m[1], res);
  const seq = sequenceProblem(t, res);
  if (seq) return seq;
  return null;
}

// |3 + 4i| = 5
function modulus(src, res) {
  const z = S(expand(P(src)));
  if ([...freeVars(z)].some((x) => x !== 'i')) return null;
  const re = S(subst(z, 'i', ZERO)), im = S(sub(S(subst(z, 'i', ONE)), re));
  const r = S(pow(add(pow(re, num(2)), pow(im, num(2))), num(new Q(1n, 2n))));
  const steps = [{ title: 'Write it as $a + bi$', math: `${tex(z)}: \quad a = ${tex(re)},\ b = ${tex(im)}` },
    { title: 'Modulus $|a + bi| = \sqrt{a^2 + b^2}$', math: `\sqrt{${paren(re)}^2 + ${paren(im)}^2} = ${tex(r)}` }];
  return res('complex', 'Modulus', `\left|${tex(z)}\right|`, steps, tex(r), text(r));
}

// ---------------- derivative at a point, tangent line ----------------
function derivativeAt(src, v, aSrc, res) {
  const { f, name, fname } = fnOf(src);
  const A = S(P(aSrc));
  const steps = [{ title: 'Start with the function', math: `${name} = ${tex(f)}` }];
  const st = [];
  const d = derivative(f, v, st);
  st.forEach((x) => steps.push(x));
  steps.push({ title: 'The derivative', math: `${fname}'(${v}) = ${tex(d)}` });
  const val = S(subst(d, v, A));
  steps.push({ title: `Put in $${v} = ${tex(A)}$`, math: `${fname}'(${tex(A)}) = ${tex(val)}${approx(val)}` });
  return res('derivative', 'Derivative at a point', `${fname}'(${tex(A)})\\ \\text{for}\\ ${name} = ${tex(f)}`, steps, `${fname}'(${tex(A)}) = ${tex(val)}`, `${fname}'(${text(A)}) = ${text(val)}`,
    { graph: { expr: text(f), v, deriv: text(d) } });
}
function tangentLine(src, v, aSrc, res) {
  const { f, name, fname } = fnOf(src);
  const A = S(P(aSrc));
  const steps = [{ title: 'Start with the function', math: `${name} = ${tex(f)}` }];
  const fa = S(subst(f, v, A));
  steps.push({ title: 'Point on the curve: put in the x-value', math: `${fname}(${tex(A)}) = ${tex(fa)}` });
  const d = derivative(f, v, []);
  const m = S(subst(d, v, A));
  steps.push({ title: 'Slope = derivative at that point', math: `${fname}'(${v}) = ${tex(d)} \\;\\Rightarrow\\; ${fname}'(${tex(A)}) = ${tex(m)}` });
  steps.push({ title: 'Point-slope form $y - y_1 = m(x - x_1)$', math: `y - ${paren(fa)} = ${paren(m)}\\left(${v} - ${paren(A)}\\right)` });
  const line = S(expand(add(mul(m, sub(sym(v), A)), fa)));
  steps.push({ title: 'Simplify', math: `y = ${tex(line)}` });
  return res('tangent', 'Tangent line', `\\text{tangent to } ${name} = ${tex(f)} \\text{ at } ${v} = ${tex(A)}`, steps, `y = ${tex(line)}`, `y = ${text(line)}`, { graph: { expr: text(f), v, deriv: text(line) } });
}
const paren = (x) => (/^-|[+-]/.test(tex(x).slice(1)) || tex(x).startsWith('-') ? `\\left(${tex(x)}\\right)` : tex(x));

// ---------------- extrema ----------------
function extrema(src, res) {
  const { f, v, name, fname } = fnOf(src);
  const steps = [{ title: 'Start with the function', math: `${name} = ${tex(f)}` }];
  const d = derivative(f, v, []);
  steps.push({ title: 'Find the derivative', math: `${fname}'(${v}) = ${tex(d)}` });
  const st = [];
  const sol = realSolutions(d, v, st);
  if (sol.general) throw new MathError('This function has infinitely many critical points (it repeats). Try a limited interval.');
  steps.push({ title: `Critical points: solve $${fname}'(${v}) = 0$`, math: sol.list.length ? sol.list.map((c) => `${v} = ${tex(c)}`).join(',\\quad ') : '\\text{no solutions}' });
  if (!sol.list.length) return res('extrema', 'Extrema', `${name} = ${tex(f)}`, steps, '\\text{no local maximum or minimum}', 'No local maximum or minimum', { graph: { expr: text(f), v, deriv: text(d) } });
  const d2 = derivative(d, v, []);
  steps.push({ title: 'Second derivative test', math: `${fname}''(${v}) = ${tex(d2)}` });
  const out = [], outT = [];
  for (const c of sol.list.sort((p, q) => evalNum(p) - evalNum(q))) {
    const k = S(subst(d2, v, c)), y = S(subst(f, v, c));
    let kv; try { kv = evalNum(k); } catch { kv = NaN; }
    let kind;
    if (kv < -1e-12) kind = 'local maximum';
    else if (kv > 1e-12) kind = 'local minimum';
    else { // first derivative test
      const h = 1e-4 * Math.max(1, Math.abs(evalNum(c)));
      const l = evalNum(d, { [v]: evalNum(c) - h }), r = evalNum(d, { [v]: evalNum(c) + h });
      kind = l > 0 && r < 0 ? 'local maximum' : l < 0 && r > 0 ? 'local minimum' : 'neither (the slope does not change sign)';
    }
    steps.push({ title: `At $${v} = ${tex(c)}$: ${kind}`, math: `${fname}''(${tex(c)}) = ${tex(k)}${kv < -1e-12 ? ' < 0' : kv > 1e-12 ? ' > 0' : ''},\\qquad ${fname}(${tex(c)}) = ${tex(y)}${approx(y)}` });
    if (!kind.startsWith('neither')) { out.push(`\\text{${kind}: } (${tex(c)},\\ ${tex(y)})`); outT.push(`${kind} at (${text(c)}, ${text(y)})`); }
  }
  return res('extrema', 'Extrema', `${name} = ${tex(f)}`, steps, out.length ? out.join(',\\quad ') : '\\text{no local maximum or minimum}', outT.join('; ') || 'No local maximum or minimum', { graph: { expr: text(f), v, deriv: text(d) } });
}

// ---------------- asymptotes ----------------
function polyQ(x, v) { const c = polyCoeffs(x, v); return c ? toQArray(c) : null; }
function asymptotes(src, res) {
  const { f, v, name } = fnOf(src);
  const [N, D] = numerDenom(f);
  const pn = polyQ(N, v), pd = polyQ(D, v);
  if (!pn || !pd) throw new MathError('I can find asymptotes of fractions of polynomials, like (x^2+1)/(x-1)');
  const steps = [{ title: 'Start with the function', math: `${name} = ${tex(f)}` }];
  const out = [], outT = [];
  const { roots } = rationalRoots(pd);
  const uniq = [...new Map(roots.map((r) => [r.toString(), r])).values()];
  const evalP = (p, x) => p.reduceRight((acc, c) => acc.mul(x).add(c), Q.of(0));
  const vert = [], holes = [];
  for (const r of uniq) (evalP(pn, r).isZero() ? holes : vert).push(r);
  steps.push({ title: 'Vertical asymptotes: where the bottom is 0 (and the top is not)', math: vert.length ? vert.map((r) => `${v} = ${tex(num(r))}`).join(',\\quad ') : '\\text{none}', detail: holes.length ? `\\text{hole (top is also 0) at } ${holes.map((r) => `${v} = ${tex(num(r))}`).join(', ')}` : undefined });
  vert.forEach((r) => { out.push(`${v} = ${tex(num(r))}`); outT.push(`${v} = ${r}`); });
  const dn = pn.length - 1, dd = pd.length - 1;
  if (dn < dd) { steps.push({ title: 'Horizontal asymptote: the bottom has the higher degree', math: 'y = 0' }); out.push('y = 0'); outT.push('y = 0'); }
  else if (dn === dd) {
    const k = pn[dn].div(pd[dd]);
    steps.push({ title: 'Horizontal asymptote: same degree, so divide the leading coefficients', math: `y = \\frac{${tex(num(pn[dn]))}}{${tex(num(pd[dd]))}} = ${tex(num(k))}` });
    out.push(`y = ${tex(num(k))}`); outT.push(`y = ${k}`);
  } else if (dn === dd + 1) {
    const [q] = polyDivide(pn, pd);
    const line = S(toNode(q, v));
    steps.push({ title: 'Oblique (slant) asymptote: divide the polynomials, keep the quotient', math: `y = ${tex(line)}` });
    out.push(`y = ${tex(line)}`); outT.push(`y = ${text(line)}`);
  } else steps.push({ title: 'No horizontal or slant asymptote (the top grows much faster)' });
  return res('asymptotes', 'Asymptotes', `${name} = ${tex(f)}`, steps, out.join(',\\quad ') || '\\text{none}', outT.join(', ') || 'None', { graph: { expr: text(f), v } });
}

// ---------------- domain ----------------
function intersect(A, B) {
  const out = [];
  for (const a of A) for (const b of B) {
    const lo = a[0] > b[0] ? a : b[0] > a[0] ? b : null, hi = a[1] < b[1] ? a : b[1] < a[1] ? b : null;
    const l = lo ? [lo[0], lo[2], lo[4]] : [a[0], a[2] && b[2], a[4] || b[4]];
    const h = hi ? [hi[1], hi[3], hi[5]] : [a[1], a[3] && b[3], a[5] || b[5]];
    if (l[0] < h[0] || (l[0] === h[0] && l[1] && h[1])) out.push([l[0], h[0], l[1], h[1], l[2], h[2]]);
  }
  return out;
}
function removePoint(iv, p, pn) {
  const out = [];
  for (const I of iv) {
    if (p > I[0] && p < I[1]) { out.push([I[0], p, I[2], false, I[4], pn], [p, I[1], false, I[3], pn, I[5]]); }
    else if (p === I[0] && I[2]) out.push([I[0], I[1], false, I[3], I[4], I[5]]);
    else if (p === I[1] && I[3]) out.push([I[0], I[1], I[2], false, I[4], I[5]]);
    else out.push(I);
  }
  return out.filter((I) => I[0] < I[1] || (I[2] && I[3]));
}
function domain(src, res) {
  const { f, v, name } = fnOf(src);
  const steps = [{ title: 'Start with the function', math: `${name} = ${tex(f)}` }];
  const conds = [];
  (function walk(x) {
    if (x.t === 'pow' && x.e.t === 'num' && isQ(x.e.v)) {
      if (x.e.v.d % 2n === 0n && has(x.b, v)) conds.push({ g: x.b, op: '>=', why: 'an even root needs a value that is not negative' });
      if (x.e.v.sign() < 0 && has(x.b, v)) conds.push({ g: x.b, op: '!=', why: 'you can’t divide by zero' });
      if (x.e.v.sign() < 0 && x.e.v.d % 2n === 0n && has(x.b, v)) conds.pop(), conds.pop(), conds.push({ g: x.b, op: '>', why: 'an even root in the bottom must be positive' });
    }
    if (x.t === 'fn' && (x.n === 'ln' || x.n === 'log') && has(x.a[0], v)) conds.push({ g: x.a[0], op: '>', why: 'a logarithm needs a positive input' });
    if (x.t === 'fn' && x.n === 'tan' && has(x.a[0], v)) conds.push({ g: fn('cos', x.a[0]), op: '!=', why: 'tan is undefined where cos = 0' });
    for (const k of ['a', 'b', 'e']) if (x[k]) (Array.isArray(x[k]) ? x[k] : [x[k]]).forEach(walk);
  })(f);
  let iv = [[-Infinity, Infinity, false, false, null, null]];
  const seen = new Set();
  for (const c of conds) {
    const k = text(c.g) + c.op;
    if (seen.has(k)) continue;
    seen.add(k);
    if (c.op === '!=') {
      const sol = realSolutions(c.g, v, []);
      if (sol.general) throw new MathError('This domain excludes infinitely many points (it repeats); I can’t list them all');
      steps.push({ title: `${c.why[0].toUpperCase() + c.why.slice(1)}: $${tex(c.g)} \\ne 0$`, math: sol.list.length ? sol.list.map((r) => `${v} \\ne ${tex(r)}`).join(',\\quad ') : '\\text{never zero}' });
      for (const r of sol.list) iv = removePoint(iv, evalNum(r), r);
    } else {
      const out = solveInequality(c.g, c.op, ZERO, v, []);
      steps.push({ title: `${c.why[0].toUpperCase() + c.why.slice(1)}: $${tex(c.g)} ${c.op === '>=' ? '\\ge' : '>'} 0$`, math: intervalsTex(out.intervals, v) });
      iv = intersect(iv, out.intervals);
    }
  }
  if (!conds.length) steps.push({ title: 'No roots of negative numbers, no division by zero, no logarithms: every real number works' });
  const ans = intervalsTex(iv, v);
  steps.push({ title: 'Domain', math: ans });
  return res('domain', 'Domain', `${name} = ${tex(f)}`, steps, ans, intervalsText(iv, v), { graph: { expr: text(f), v } });
}

// ---------------- inverse function ----------------
function inverseFunction(src, res) {
  const { f, v, name, fname } = fnOf(src);
  const w = v === 'y' ? 'u' : 'y';
  const steps = [{ title: 'Start with the function', math: `${name} = ${tex(f)}` }];
  steps.push({ title: `Write $${w} = ${fname}(${v})$, then swap $${v}$ and $${w}$`, math: `${v} = ${tex(S(subst(f, v, sym(w))))}` });
  let st = [], r = null;
  try { r = solveEquation(S(subst(f, v, sym(w))), sym(v), w, st); } catch { r = null; }
  if (!r || !r.solutions || !r.solutions.length) { st = []; const one = isolate(S(subst(f, v, sym(w))), sym(v), w, st); r = one ? { solutions: [one] } : null; }
  st.slice(0, 8).forEach((x) => steps.push(x));
  if (!r || !r.solutions || !r.solutions.length) throw new MathError('I could not solve for the inverse of this function');
  const sols = r.solutions.map(tidySign);
  const inv = fname === 'y' ? 'f' : fname;
  if (sols.length > 1) steps.push({ title: 'More than one answer: the function is not one-to-one, so restrict its domain to choose one branch' });
  const ans = sols.map((x) => `${inv}^{-1}(${v}) = ${tex(x)}`).join(',\\quad ');
  return res('inverse', 'Inverse function', `${name} = ${tex(f)}`, steps, ans, sols.map((x) => `${inv}^-1(${v}) = ${text(x)}`).join(', '));
}

// (-3x - 1)/(-x + 2) -> (3x + 1)/(x - 2)
function tidySign(x) {
  const [N, D] = numerDenom(x);
  if (D.t === 'num') return x;
  const v = [...freeVars(D)][0];
  const c = v && polyCoeffs(D, v);
  const lc = c && c[c.length - 1];
  if (lc && lc.t === 'num' && isQ(lc.v) && lc.v.sign() < 0) {
    const n2 = S(expand(mul(num(-1), N))), d2 = S(expand(mul(num(-1), D)));
    return { t: 'mul', a: [n2, { t: 'pow', b: d2, e: num(-1) }] };
  }
  return x;
}
// undo the operations around the one place w appears: e^w + 1 = x -> w = ln(x - 1)
function isolate(lhs, rhs, w, steps, depth = 0) {
  if (depth > 12) return null;
  if (lhs.t === 'sym' && lhs.n === w) return S(rhs);
  const say = (title, l, r) => steps.push({ title, math: `${tex(S(l))} = ${tex(S(r))}` });
  if (lhs.t === 'add') {
    const withW = lhs.a.filter((t) => has(t, w));
    if (withW.length !== 1) return null;
    const rest = S(add(lhs.a.filter((t) => !has(t, w))));
    const r2 = S(sub(rhs, rest));
    say(`Subtract $${tex(rest)}$ from both sides`, withW[0], r2);
    return isolate(withW[0], r2, w, steps, depth + 1);
  }
  if (lhs.t === 'mul') {
    const withW = lhs.a.filter((t) => has(t, w));
    if (withW.length !== 1) return null;
    const rest = S(mul(lhs.a.filter((t) => !has(t, w))));
    const r2 = S(div(rhs, rest));
    say(`Divide both sides by $${tex(rest)}$`, withW[0], r2);
    return isolate(withW[0], r2, w, steps, depth + 1);
  }
  if (lhs.t === 'pow' && !has(lhs.e, w)) {
    const r2 = S(pow(rhs, S(pow(lhs.e, num(-1)))));
    say(lhs.e.t === 'num' && isQ(lhs.e.v) && lhs.e.v.eq(new Q(1n, 2n)) ? 'Square both sides' : lhs.e.t === 'num' && isQ(lhs.e.v) && lhs.e.v.eq(Q.of(-1)) ? 'Take the reciprocal of both sides' : `Raise both sides to the power $${tex(S(pow(lhs.e, num(-1))))}$`, lhs.b, r2);
    return isolate(lhs.b, r2, w, steps, depth + 1);
  }
  if (lhs.t === 'pow' && !has(lhs.b, w)) {
    const r2 = lhs.b.t === 'sym' && lhs.b.n === 'e' ? S(fn('ln', rhs)) : S(div(fn('ln', rhs), fn('ln', lhs.b)));
    say(lhs.b.t === 'sym' && lhs.b.n === 'e' ? 'Take $\\ln$ of both sides' : `Take the logarithm base $${tex(lhs.b)}$ of both sides`, lhs.e, r2);
    return isolate(lhs.e, r2, w, steps, depth + 1);
  }
  if (lhs.t === 'fn' && lhs.a.length >= 1 && has(lhs.a[0], w)) {
    const INV = { ln: (y) => pow(E, y), sin: (y) => fn('asin', y), cos: (y) => fn('acos', y), tan: (y) => fn('atan', y), asin: (y) => fn('sin', y), acos: (y) => fn('cos', y), atan: (y) => fn('tan', y) };
    if (lhs.n === 'log') { const b = lhs.a[1] || num(10); const r2 = S(pow(b, rhs)); say(`Undo the logarithm: raise ${tex(b)} to both sides`, lhs.a[0], r2); return isolate(lhs.a[0], r2, w, steps, depth + 1); }
    if (!INV[lhs.n]) return null;
    const r2 = S(INV[lhs.n](rhs));
    say(`Undo $${lhs.n}$ on both sides`, lhs.a[0], r2);
    return isolate(lhs.a[0], r2, w, steps, depth + 1);
  }
  return null;
}

// ---------------- partial fractions ----------------
function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function partialFractions(src, res) {
  const { f, v } = fnOf(src);
  const [N, D] = numerDenom(f);
  let pn = polyQ(N, v); const pd = polyQ(D, v);
  if (!pn || !pd || pd.length < 2) throw new MathError('Partial fractions need a fraction of polynomials, like (3x+5)/(x^2+x-2)');
  const steps = [{ title: 'Start with the fraction', math: tex(f) }];
  const parts = [];
  let polyPart = null;
  if (pn.length >= pd.length) {
    const [q, r] = polyDivide(pn, pd);
    polyPart = S(toNode(q, v)); pn = r;
    steps.push({ title: 'The top has degree ≥ the bottom: divide first', math: `${tex(f)} = ${tex(polyPart)} + \\frac{${tex(S(toNode(r, v)))}}{${tex(D)}}` });
  }
  const { roots, rest } = rationalRoots(pd);
  const mult = new Map();
  for (const r of roots) mult.set(r.toString(), [r, (mult.get(r.toString())?.[1] || 0) + 1]);
  const lin = (r) => S(sub(sym(v), num(r)));
  const factored = [...mult.values()].map(([r, k]) => (k > 1 ? `\\left(${tex(lin(r))}\\right)^{${k}}` : `\\left(${tex(lin(r))}\\right)`)).join('') + (rest.length > 1 ? `\\left(${tex(S(toNode(rest, v)))}\\right)` : '');
  const lead = rest.length === 1 ? rest[0] : Q.of(1);
  steps.push({ title: 'Factor the bottom', math: `${tex(D)} = ${lead.isOne() ? '' : tex(num(lead))}${factored}` });
  const R = S(div(toNode(pn, v), D));
  const shape = [];
  for (const [r, k] of mult.values()) for (let j = 1; j <= k; j++) shape.push(`\\frac{${String.fromCharCode(64 + shape.length + 1)}}{${j > 1 ? `\\left(${tex(lin(r))}\\right)^{${j}}` : tex(lin(r))}}`);
  if (rest.length > 1) shape.push(`\\frac{${String.fromCharCode(64 + shape.length + 1)}${v} + ${String.fromCharCode(64 + shape.length + 2)}}{${tex(S(toNode(rest, v)))}}`);
  steps.push({ title: 'One fraction for each factor', math: shape.join(' + ') });
  let sum = ZERO;
  const pmul = (A, B) => { const o = new Array(A.length + B.length - 1).fill(Q.of(0)); A.forEach((a, i) => B.forEach((b, j) => { o[i + j] = o[i + j].add(a.mul(b)); })); return o; };
  const psub = (A, B) => { const o = []; for (let i = 0; i < Math.max(A.length, B.length); i++) o.push((A[i] || Q.of(0)).sub(B[i] || Q.of(0))); return o; };
  let leftNum = pn; // numerator still to explain, over the full bottom pd
  for (const [r, k] of mult.values()) {
    // g = R·(x - r)^k; coefficient of 1/(x-r)^(k-j) is g^(j)(r)/j!
    let red = pd;
    for (let j = 0; j < k; j++) red = polyDivide(red, [r.neg(), Q.of(1)])[0];
    let g = S(div(toNode(pn, v), toNode(red, v)));
    for (let j = 0; j < k; j++) {
      const c = S(div(subst(g, v, num(r)), num(factorial(j))));
      const term = S(div(c, pow(lin(r), num(k - j))));
      if (c.t === 'num' && isQ(c.v)) { let red2 = pd; for (let q = 0; q < k - j; q++) red2 = polyDivide(red2, [r.neg(), Q.of(1)])[0]; leftNum = psub(leftNum, pmul(red2, [c.v])); }
      parts.push({ term, how: j === 0 ? `\\text{cover-up: put } ${v} = ${tex(num(r))}` : `\\text{derivative ${j} of the rest at } ${v} = ${tex(num(r))}` });
      sum = add(sum, term);
      if (j < k - 1) g = derivative(g, v, []);
    }
  }
  if (rest.length > 1) {
    // what is left is (Bx + C)/rest: divide the leftover numerator by the linear factors
    let linPoly = [Q.of(1)];
    for (const [r, k] of mult.values()) for (let j = 0; j < k; j++) linPoly = pmul(linPoly, [r.neg(), Q.of(1)]);
    const [M] = polyDivide(leftNum, linPoly);
    let Ld = 1n; for (const c of M) Ld = (Ld * c.d) / (function g(a, b) { return b ? g(b, a % b) : a; })(Ld, c.d);
    const Mi = M.map((c) => c.mul(Q.of(Ld)));
    const remain = Ld === 1n ? S(div(toNode(M, v), toNode(rest, v))) : { t: 'mul', a: [S(toNode(Mi, v)), { t: 'pow', b: { t: 'mul', a: [num(new Q(Ld)), S(toNode(rest, v))] }, e: num(-1) }] };
    parts.push({ term: remain, how: '\\text{the rest, over the quadratic factor}' }); sum = add(sum, remain);
  }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].term.t === 'num' && parts[i].term.v.isZero()) parts.splice(i, 1);
  parts.forEach((p) => steps.push({ title: 'Find the coefficient', math: `${tex(p.term)} \\qquad (${p.how})` }));
  const terms = [...(polyPart && !(polyPart.t === 'num' && polyPart.v.isZero()) ? [polyPart] : []), ...parts.map((p) => p.term)];
  const ansT = terms.map((x, i) => { const s = tex(x); return i && !s.startsWith('-') ? `+ ${s}` : s; }).join(' ');
  // check
  try { const ok = [0.31, 1.7, -2.3].every((x) => Math.abs(evalNum(add(terms), { [v]: x }) - evalNum(f, { [v]: x })) < 1e-7 * Math.max(1, Math.abs(evalNum(f, { [v]: x })))); if (ok) steps.push({ title: 'Check: adding the fractions back gives the original ✓' }); } catch { /* */ }
  return res('partial', 'Partial fractions', tex(f), steps, ansT, terms.map(text).join(' + ').replace(/\+ -/g, '- '));
}

// ---------------- eigenvalues ----------------
function eigen(src, res) {
  const A = parseMatrix(src);
  const n = A.length;
  if (!A.every((r) => r.length === n) || n < 2 || n > 3) throw new MathError('Eigenvalues: give a square 2×2 or 3×3 matrix, like [[2,1],[1,2]]');
  const L = sym('λ');
  const q = (x) => num(x);
  const steps = [];
  const mt = (M) => `\\begin{bmatrix} ${M.map((r) => r.map((x) => tex(num(x))).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
  steps.push({ title: 'Eigenvalues solve $\\det(A - \\lambda I) = 0$', math: `A = ${mt(A)}` });
  let poly;
  if (n === 2) {
    const [[a, b], [c, d]] = A;
    poly = S(expand(sub(mul(sub(q(a), L), sub(q(d), L)), q(b.mul(c)))));
    steps.push({ title: 'For 2×2: $(a-\\lambda)(d-\\lambda) - bc = 0$', math: ltex(`(${tex(num(a))} - λ)(${tex(num(d))} - λ) - ${paren(num(b.mul(c)))} = ${tex(poly)} = 0`) });
  } else {
    const M = A.map((r, i) => r.map((x, j) => (i === j ? sub(q(x), L) : q(x))));
    const d2 = (p, qq, r, s) => sub(mul(p, s), mul(qq, r));
    poly = S(expand(add(mul(M[0][0], d2(M[1][1], M[1][2], M[2][1], M[2][2])), mul(num(-1), M[0][1], d2(M[1][0], M[1][2], M[2][0], M[2][2])), mul(M[0][2], d2(M[1][0], M[1][1], M[2][0], M[2][1])))));
    steps.push({ title: 'Expand $\\det(A - \\lambda I)$ along the first row', math: ltex(`${tex(poly)} = 0`) });
  }
  const st = [];
  const r = solveEquation(poly, ZERO, 'λ', st);
  st.slice(1, 7).forEach((x) => steps.push({ ...x, math: x.math && ltex(x.math), detail: x.detail && ltex(x.detail) }));
  const vals = r.solutions || [];
  const cvals = r.complex || [];
  if (!vals.length && !cvals.length) throw new MathError('I could not find the eigenvalues of this matrix');
  // eigenvectors for rational eigenvalues of a 2×2 matrix
  if (n === 2) for (const lv of vals) {
    if (!(lv.t === 'num' && isQ(lv.v))) continue;
    const [[a, b], [c, d]] = A, l = lv.v;
    let vec = !b.isZero() ? [b, l.sub(a)] : !c.isZero() ? [l.sub(d), c] : (a.sub(l).isZero() ? [Q.of(1), Q.of(0)] : [Q.of(0), Q.of(1)]);
    steps.push({ title: `Eigenvector for $\\lambda = ${tex(lv)}$: solve $(A - ${tex(lv)}I)\\vec v = 0$`, math: `\\vec v = \\begin{bmatrix} ${tex(num(vec[0]))} \\\\ ${tex(num(vec[1]))} \\end{bmatrix}` });
  }
  const all = [...vals, ...cvals];
  return res('eigen', 'Eigenvalues', mt(A), steps, all.map((x) => `\\lambda = ${tex(x)}`).join(',\\quad '), all.map((x) => `λ = ${text(x)}`).join(', '));
}

// ---------------- differential equations y' = f(x, y) ----------------
function ode(rhsSrc, res) {
  const R = S(P(rhsSrc));
  const vars = [...freeVars(R)].filter((x) => x !== 'y');
  const x = vars[0] || 'x';
  if (vars.length > 1) throw new MathError('Use one variable besides y, like y\' = x y');
  const Y = sym('y'), C = sym('C');
  const head = `\\frac{dy}{d${x}} = ${tex(R)}`;
  const steps = [{ title: 'Start with the differential equation', math: head }];
  // 1) no y: integrate directly
  if (!has(R, 'y')) {
    const F = integrate(R, x, []);
    if (!F) throw new MathError('I could not integrate the right side');
    steps.push({ title: `Integrate both sides with respect to $${x}$`, math: `y = \\int ${tex(R)}\\,d${x} = ${tex(S(F))} + C` });
    return res('ode', 'Differential equation', head, steps, `y = ${tex(S(F))} + C`, `y = ${text(S(F))} + C`);
  }
  // 2) linear: y' = a(x) y + b(x)
  const co = polyCoeffs(R, 'y');
  if (co && co.length === 2) {
    const b = S(co[0]), a = S(co[1]);
    if (b.t === 'num' && b.v.isZero()) {
      const Aint = integrate(a, x, []);
      if (Aint) {
        steps.push({ title: 'Separate the variables', math: `\\frac{dy}{y} = ${tex(a)}\\,d${x}` });
        steps.push({ title: 'Integrate both sides', math: `\\ln|y| = ${tex(S(Aint))} + C_1` });
        const sol = S(mul(C, pow(E, S(Aint))));
        steps.push({ title: 'Solve for $y$ (write $C = \\pm e^{C_1}$)', math: `y = ${tex(sol)}` });
        return res('ode', 'Differential equation', head, steps, `y = ${tex(sol)}`, `y = ${text(sol)}`);
      }
    }
    const Aint = integrate(S(mul(num(-1), a)), x, []);
    if (Aint) {
      const mu = S(pow(E, S(Aint)));
      steps.push({ title: 'Linear equation: write it as $y\' + p(x)\\,y = q(x)$', math: `y' ${tex(a).startsWith('-') ? '+ ' + tex(a).slice(1) : '- ' + tex(a)}\\,y = ${tex(b)}` });
      steps.push({ title: 'Integrating factor $\\mu = e^{\\int p\\,dx}$', math: `\\mu = ${tex(mu)}` });
      const I = integrate(S(expand(mul(mu, b))), x, []);
      if (I) {
        steps.push({ title: 'Then $(\\mu y)\' = \\mu q$, so integrate', math: `${tex(mu)}\\,y = \\int ${tex(S(expand(mul(mu, b))))}\\,d${x} = ${tex(S(I))} + C` });
        const sol = S(expand(div(add(S(I), C), mu)));
        steps.push({ title: 'Divide by $\\mu$', math: `y = ${tex(sol)}` });
        return res('ode', 'Differential equation', head, steps, `y = ${tex(sol)}`, `y = ${text(sol)}`);
      }
    }
  }
  // 3) separable: y' = g(x) h(y)
  const fs = R.t === 'mul' ? R.a : [R];
  const gx = fs.filter((f) => !has(f, 'y')), hy = fs.filter((f) => has(f, 'y'));
  if (hy.every((f) => !has(f, x))) {
    const g = gx.length ? S(mul(gx)) : ONE, h = S(mul(hy));
    const Hi = integrate(S(pow(h, num(-1))), 'y', []), Gi = integrate(g, x, []);
    if (Hi && Gi) {
      steps.push({ title: 'Separate the variables', math: `\\frac{dy}{${tex(h)}} = ${tex(g)}\\,d${x}` });
      steps.push({ title: 'Integrate both sides', math: `${tex(S(Hi))} = ${tex(S(Gi))} + C` });
      const st = [];
      let explicit = null;
      try { const r = solveEquation(S(Hi), S(add(Gi, C)), 'y', st); if (r.solutions && r.solutions.length) explicit = r.solutions; } catch { /* keep implicit */ }
      if (explicit) {
        steps.push({ title: 'Solve for $y$', math: explicit.map((s) => `y = ${tex(s)}`).join(',\\quad ') });
        return res('ode', 'Differential equation', head, steps, explicit.map((s) => `y = ${tex(s)}`).join(',\\quad '), explicit.map((s) => `y = ${text(s)}`).join(', '));
      }
      return res('ode', 'Differential equation', head, steps, `${tex(S(Hi))} = ${tex(S(Gi))} + C`, `${text(S(Hi))} = ${text(S(Gi))} + C`);
    }
  }
  throw new MathError('I can solve first-order equations that are separable or linear, like y\' = x y or y\' + y = x');
}

// ---------------- sequences and series ----------------
function sequenceProblem(t, res) {
  let m;
  const isSeqWord = /\b(sequence|series|progression|nth term|next term|general term)\b/i.test(t);
  let body = t.replace(/^(?:find\s+)?(?:the\s+)?(?:nth|general|next)\s+term\s+(?:of\s+)?/i, '').replace(/^(?:arithmetic|geometric)?\s*(?:sequence|series|progression)\s*:?\s*/i, '').replace(/\s*(?:nth|general|next) term$/i, '').trim();
  const kindHint = /arithmetic/i.test(t) ? 'a' : /geometric/i.test(t) ? 'g' : null;
  const numRe = String.raw`-?\d+(?:\.\d+)?(?:\/\d+)?`;
  // series: 2 + 4 + 8 + ... + 256
  if ((m = body.match(new RegExp(`^(${numRe}(?:\\s*\\+\\s*${numRe}){1,})\\s*\\+\\s*(?:\\.\\.\\.|…|⋯)\\s*(?:\\+\\s*(${numRe}))?$`)))) {
    const terms = m[1].split('+').map((x) => S(P(x)).v);
    return seriesSum(terms, m[2] ? S(P(m[2])).v : null, res, kindHint);
  }
  // sequence: 3, 7, 11, ...
  if ((m = body.match(new RegExp(`^(${numRe}(?:\\s*[,;]\\s*${numRe}){2,})\\s*(?:[,;]\\s*(?:\\.\\.\\.|…|⋯))?$`))) && (isSeqWord || /\.\.\.|…|⋯/.test(body))) {
    const terms = m[1].split(/[,;]/).map((x) => S(P(x)).v);
    return sequenceTerms(terms, res, kindHint);
  }
  return null;
}
function classify(terms, hint) {
  const d = terms[1].sub(terms[0]);
  const arith = terms.every((x, i) => !i || x.sub(terms[i - 1]).eq(d));
  const geom = !terms.some((x) => x.isZero()) && terms.every((x, i) => !i || x.div(terms[i - 1]).eq(terms[1].div(terms[0])));
  if (hint === 'a' && !arith) throw new MathError('The differences are not all the same, so this is not an arithmetic sequence');
  if (hint === 'g' && !geom) throw new MathError('The ratios are not all the same, so this is not a geometric sequence');
  if (arith && hint !== 'g') return { kind: 'a', d };
  if (geom) return { kind: 'g', r: terms[1].div(terms[0]) };
  return null;
}
const qt = (x) => tex(num(x));
function sequenceTerms(terms, res, hint) {
  const c = classify(terms, hint);
  const head = terms.map(qt).join(',\\ ') + ',\\ \\dots';
  const steps = [{ title: 'Start with the sequence', math: head }];
  const a1 = terms[0];
  if (!c) {
    // quadratic sequence: constant second differences
    const d1 = terms.slice(1).map((x, i) => x.sub(terms[i]));
    const d2 = d1.slice(1).map((x, i) => x.sub(d1[i]));
    if (d2.length && d2.every((x) => x.eq(d2[0]))) {
      const A = d2[0].div(Q.of(2)), B = d1[0].sub(A.mul(Q.of(3))), Cc = a1.sub(A).sub(B);
      steps.push({ title: 'First differences', math: d1.map(qt).join(',\\ ') });
      steps.push({ title: 'Second differences are all the same, so $a_n = An^2 + Bn + C$ with $2A$ = that difference', math: d2.map(qt).join(',\\ ') });
      const an = S(add(mul(num(A), pow(sym('n'), num(2))), mul(num(B), sym('n')), num(Cc)));
      steps.push({ title: 'Match the first terms to find $B$ and $C$', math: `a_n = ${tex(an)}` });
      return res('sequence', 'Quadratic sequence', head, steps, `a_n = ${tex(an)}`, `a_n = ${text(an)}`);
    }
    throw new MathError('This is not an arithmetic, geometric or quadratic sequence');
  }
  if (c.kind === 'a') {
    steps.push({ title: 'The difference between terms is always the same: arithmetic sequence', math: `d = ${qt(terms[1])} - ${paren(num(terms[0]))} = ${qt(c.d)}` });
    const an = S(expand(add(num(a1), mul(num(c.d), sub(sym('n'), ONE)))));
    steps.push({ title: 'Formula $a_n = a_1 + (n-1)d$', math: `a_n = ${qt(a1)} + (n - 1) \\cdot ${paren(num(c.d))} = ${tex(an)}` });
    const next = terms[terms.length - 1].add(c.d);
    const sn = S(expand(mul(div(sym('n'), num(2)), add(num(a1.mul(Q.of(2))), mul(num(c.d), sub(sym('n'), ONE))))));
    steps.push({ title: 'Next term and sum of the first $n$ terms $S_n = \\frac{n}{2}(2a_1 + (n-1)d)$', math: `a_{${terms.length + 1}} = ${qt(next)},\\qquad S_n = ${tex(sn)}` });
    return res('sequence', 'Arithmetic sequence', head, steps, `a_n = ${tex(an)}`, `a_n = ${text(an)}`);
  }
  steps.push({ title: 'Each term is the previous one times the same number: geometric sequence', math: `r = \\frac{${qt(terms[1])}}{${qt(terms[0])}} = ${qt(c.r)}` });
  const an = S(mul(num(a1), pow(num(c.r), sub(sym('n'), ONE))));
  steps.push({ title: 'Formula $a_n = a_1 \\cdot r^{\\,n-1}$', math: `a_n = ${tex(an)}` });
  const next = terms[terms.length - 1].mul(c.r);
  let extra = `a_{${terms.length + 1}} = ${qt(next)}`;
  if (c.r.abs().cmp(Q.of(1)) < 0) extra += `,\\qquad S_\\infty = \\frac{a_1}{1 - r} = ${qt(a1.div(Q.of(1).sub(c.r)))}`;
  steps.push({ title: c.r.abs().cmp(Q.of(1)) < 0 ? 'Next term; $|r| < 1$ so the infinite sum converges' : 'Next term', math: extra });
  return res('sequence', 'Geometric sequence', head, steps, `a_n = ${tex(an)}`, `a_n = ${text(an)}`);
}
function seriesSum(terms, last, res, hint) {
  const c = classify(terms.length >= 2 ? terms : [terms[0], terms[0]], hint);
  if (!c) throw new MathError('This is not an arithmetic or geometric series');
  const head = terms.map(qt).join(' + ') + ' + \\dots' + (last ? ` + ${qt(last)}` : '');
  const steps = [{ title: 'Start with the series', math: head }];
  const a1 = terms[0];
  if (!last) {
    if (c.kind === 'g' && c.r.abs().cmp(Q.of(1)) < 0) {
      steps.push({ title: 'Geometric with $|r| < 1$, so the infinite sum converges', math: `r = ${qt(c.r)}` });
      const s = a1.div(Q.of(1).sub(c.r));
      steps.push({ title: '$S_\\infty = \\frac{a_1}{1 - r}$', math: `\\frac{${qt(a1)}}{1 - ${paren(num(c.r))}} = ${qt(s)}` });
      return res('series', 'Infinite geometric series', head, steps, qt(s), s.toString());
    }
    throw new MathError('This infinite series does not add up to a finite number (it diverges)');
  }
  if (c.kind === 'a') {
    const n = last.sub(a1).div(c.d).add(Q.of(1));
    if (!n.isInt() || n.sign() <= 0) throw new MathError('The last term is not part of this arithmetic sequence');
    const s = n.mul(a1.add(last)).div(Q.of(2));
    steps.push({ title: 'Arithmetic: the same difference each time', math: `d = ${qt(c.d)}` });
    steps.push({ title: 'Number of terms $n = \\frac{a_n - a_1}{d} + 1$', math: `n = \\frac{${qt(last)} - ${paren(num(a1))}}{${qt(c.d)}} + 1 = ${qt(n)}` });
    steps.push({ title: 'Sum $S_n = \\frac{n}{2}(a_1 + a_n)$', math: `S = \\frac{${qt(n)}}{2}(${qt(a1)} + ${qt(last)}) = ${qt(s)}` });
    return res('series', 'Arithmetic series', head, steps, qt(s), s.toString());
  }
  let n = 1, x = a1;
  while (!x.eq(last) && n < 200) { x = x.mul(c.r); n++; }
  if (!x.eq(last)) throw new MathError('The last term is not part of this geometric sequence');
  const s = a1.mul(c.r.powInt(BigInt(n)).sub(Q.of(1))).div(c.r.sub(Q.of(1)));
  steps.push({ title: 'Geometric: each term is multiplied by the same ratio', math: `r = ${qt(c.r)}` });
  steps.push({ title: 'Number of terms: $a_1 r^{n-1} = a_n$', math: `${qt(a1)} \\cdot ${paren(num(c.r))}^{n-1} = ${qt(last)} \\;\\Rightarrow\\; n = ${n}` });
  steps.push({ title: 'Sum $S_n = a_1 \\frac{r^n - 1}{r - 1}$', math: `S = ${qt(a1)} \\cdot \\frac{${paren(num(c.r))}^{${n}} - 1}{${qt(c.r)} - 1} = ${qt(s)}` });
  return res('series', 'Geometric series', head, steps, qt(s), s.toString());
}

// ---------------- ∫ e^(ax) sin(bx) dx, ∫ e^(ax) cos(bx) dx (integration by parts twice) ----------------
export function expTrigIntegral(f, v, steps) {
  const fs = f.t === 'mul' ? f.a : [f];
  let c = Q.of(1), a = null, trig = null, b = null;
  for (const x of fs) {
    if (x.t === 'num' && isQ(x.v)) { c = c.mul(x.v); continue; }
    if (x.t === 'pow' && x.b.t === 'sym' && x.b.n === 'e') { const co = polyCoeffs(x.e, v); if (!co || co.length !== 2 || !(co[0].t === 'num' && co[0].v.isZero()) || co[1].t !== 'num') return null; a = co[1].v; continue; }
    if (x.t === 'fn' && (x.n === 'sin' || x.n === 'cos')) { const co = polyCoeffs(x.a[0], v); if (!co || co.length !== 2 || !(co[0].t === 'num' && co[0].v.isZero()) || co[1].t !== 'num') return null; b = co[1].v; trig = x.n; continue; }
    return null;
  }
  if (!a || !trig) return null;
  const X = sym(v), ea = S(pow(E, mul(num(a), X))), sn = S(fn('sin', mul(num(b), X))), cs = S(fn('cos', mul(num(b), X)));
  const den = a.mul(a).add(b.mul(b));
  const inner = trig === 'sin' ? sub(mul(num(a), sn), mul(num(b), cs)) : add(mul(num(a), cs), mul(num(b), sn));
  const F = S(mul(num(c.div(den)), ea, S(inner)));
  steps.push({ title: 'Integrate by parts twice: the same integral $I$ comes back', math: `I = \\int ${tex(f)}\\,d${v}` });
  steps.push({ title: 'Solve the equation for $I$', math: `I\\left(1 + \\frac{${tex(num(b.mul(b)))}}{${tex(num(a.mul(a)))}}\\right) = \\dots \\;\\Rightarrow\\; I = ${tex(F)}` });
  return F;
}
