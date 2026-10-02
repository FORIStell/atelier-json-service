// 11th–12th grade and university topics: derivative at a point, tangent lines, extrema, asymptotes, domain,
// inverse functions, partial fractions, eigenvalues, sequences and series, first-order differential equations,
// and ∫ e^(ax) sin(bx) dx. Each handler returns a result, or null when the text is not that kind of problem.
import { Q, MathError, isQ, formatNumber } from './rational.js';
import { parse } from './parser.js';
import { fromRaw, simplify, expand, has, freeVars, evalNum, subst, sub, add, mul, div, pow, num, sym, fn, polyCoeffs, numerDenom, coeffSplit, ZERO, ONE, E } from './cas.js';
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
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?tangent(?:\s+line)?\s+(?:to|of)\s+(.+?)\s+where it equals\s+(.+)$/i))) {
    const { f, v } = fnOf(m[1]);
    const xs = realSolutions(S(sub(f, P(m[2]))), v, []).list || [];
    if (xs.length === 1) return tangentLine(m[1], v, text(xs[0]), res);
  }
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(?:equation\s+of\s+)?(?:the\s+)?tangent(?:\s+line)?\s+(?:to|of|for)\s+(?:the\s+(?:curve|graph)\s+)?(.+?)\s+(?:at|when|where)\s+([a-z])\s*=\s*(.+)$/i))) return tangentLine(m[1], m[2], m[3], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(?:local\s+)?(?:extrema|extreme values|extremum|critical points|stationary points|turning points|max(?:ima|imum)?\s+and\s+min(?:ima|imum)?|minimum and maximum|min and max)\s+(?:of\s+)?(.+)$/i)) ||
      (m = t.match(/^(.+?)\s*,?\s+(?:extrema|critical points|turning points|max and min|stationary points)$/i))) return extrema(m[1], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(?:vertical\s+|horizontal\s+|oblique\s+|slant\s+)?asymptotes?\s+(?:of\s+)?(.+)$/i))) return asymptotes(m[1], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?domain\s+(?:of\s+)?(.+)$/i))) return domain(m[1], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?inverse\s+(?:function\s+)?(?:of\s+)?(.+)$/i)) && !/\[/.test(m[1])) return inverseFunction(m[1], res);
  if ((m = t.match(/^(?:partial\s+fractions?(?:\s+decomposition)?|decompose)\s+(?:of\s+)?(.+)$/i))) return partialFractions(m[1], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(eigenvalues?(?:\s+and\s+eigenvectors?)?|eigenvectors?)\s+(?:of\s+)?(\[.+\])$/i))) return eigen(m[2], res);
  if ((m = t.match(/^(?:solve\s+)?(y'|y′|dy\/dx)\s*=\s*(.+)$/i))) return ode(m[2], res);
  if ((m = t.match(/^(?:solve\s+)?(.*y'.*?)\s*=\s*(.+)$/i)) && !/^y'\s*$/.test(m[1])) return odeRearranged(m[1], m[2], res);
  if ((m = t.match(/^\{([^}]*)\}\s*(∩|∪|\\|∖|-)\s*\{([^}]*)\}$/))) return setOp(m[1], m[2], m[3], res);
  if ((m = t.match(/^(?:rationali[sz]e|rationali[sz]e the denominator of)\s+(.+)$/i))) return rationalize(m[1], res);
  if ((m = t.match(/^(?:antiderivative|primitive)\s+of\s+(.+?)\s+(?:through|passing through|with|via)\s*\(\s*(.+?)\s*[,;]\s*(.+?)\s*\)$/i))) return antiderivativeThrough(m[1], m[2], m[3], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?(maximum|minimum|max|min|largest|smallest|greatest|least)(?:\s+value)?\s+of\s+(.+?)(?:\s+(?:on|in|for)\s+([([])\s*(.+?)\s*[,;]\s*(.+?)\s*([)\]]))?$/i))) return maxMinOn(m[1], m[2], m[3], m[4], m[5], m[6], res);
  if ((m = t.match(/^(?:find\s+)?(?:the\s+)?range\s+of\s+(.+)$/i))) return rangeOf(m[1], res);
  if ((m = t.match(/^(?:evaluate|find|calculate|compute)?\s*(.+?)\s+(?:given|if|where)\s+(.+=.+)$/i)) && !/=/.test(m[1])) return givenProblem(m[1], m[2].split(/\s*;\s*|\s+and\s+/), res);
  if ((m = t.match(/^(?:solve\s+)?slope of (.+?)\s*=\s*(.+)$/i))) return slopeIs(m[1], m[2], res);
  if ((m = t.match(/^volume of revolution of (.+?) up to ([a-z])\s*=\s*(.+)$/i))) return revolution(m[1], m[3], res);
  if ((m = t.match(/^(.+=.+?)\s+(?:on|in|for)\s+([([])\s*(.+?)\s*[,;]\s*(.+?)\s*([)\]])$/i)) || (m = t.match(/^(.+=.+?)\s*,\s*()(-?[\d.π/°]+)\s*(<|<=|≤)\s*[a-z]\s*(?:<|<=|≤)\s*(-?[\d.π/°]+)()$/i))) {
    if (m[2] === '' ) { const lo = m[3], hi = m[5]; return solveOnInterval(m[1], m[4] === '<' ? '(' : '[', lo, hi, ')', opts, res); }
    return solveOnInterval(m[1], m[2], m[3], m[4], m[5], opts, res);
  }
  if ((m = t.match(/^(?:modulus|abs|absolute value)?\s*(?:of\s+)?\|(.+)\|$/i)) && /i/.test(m[1])) return modulus(m[1], res);
  const seq = sequenceProblem(t, res);
  if (seq) return seq;
  return null;
}

// {2; 4; 6; 8} \ {2; 4; 5; 6; 7} = {8}
function setOp(a, op, b, res) {
  const items = (x) => x.split(/[;,]/).map((y) => y.trim()).filter(Boolean);
  const A = items(a), B = items(b);
  const kA = (y) => text(S(P(y)));
  const inB = new Set(B.map(kA)), inA = new Set(A.map(kA));
  let out, title, sym0;
  if (op === '∩') { out = A.filter((y) => inB.has(kA(y))); title = 'Intersection: elements in both sets'; sym0 = '\\cap'; }
  else if (op === '∪') { out = [...A, ...B.filter((y) => !inA.has(kA(y)))]; title = 'Union: elements in either set'; sym0 = '\\cup'; }
  else { out = A.filter((y) => !inB.has(kA(y))); title = 'Difference: elements of the first set that are not in the second'; sym0 = '\\setminus'; }
  const st = (xs) => `\\{${xs.map((y) => tex(S(P(y)))).join(';\\ ')}\\}`;
  const head = `${st(A)} ${sym0} ${st(B)}`;
  return res('sets', 'Sets', head, [{ title, math: `${head} = ${out.length ? st(out) : '\\varnothing'}` }], out.length ? st(out) : '\\varnothing', out.length ? `{${out.join('; ')}}` : '∅');
}
// 2/(4 - √a) = 2(4 + √a)/(16 - a)
function rationalize(src, res) {
  const f = S(P(src));
  const [N, D] = numerDenom(f);
  const terms = D.t === 'add' ? D.a : [D];
  const isRoot = (q) => { const [, r] = coeffSplit(q); return r && r.t === 'pow' && r.e.t === 'num' && isQ(r.e.v) && r.e.v.d === 2n; };
  const steps = [{ title: 'Start with the fraction', math: tex(f) }];
  let out;
  if (terms.length === 2 && terms.some(isRoot)) {
    const conj = S(add(terms.map((q) => (isRoot(q) ? mul(num(-1), q) : q))));
    const top = S(expand(mul(N, conj))), bot = S(expand(mul(D, conj)));
    steps.push({ title: 'Multiply top and bottom by the conjugate (a + b)(a - b) = a² - b²', math: `\\frac{${tex(N)} \\cdot \\left(${tex(conj)}\\right)}{\\left(${tex(D)}\\right)\\left(${tex(conj)}\\right)} = \\frac{${tex(top)}}{${tex(bot)}}` });
    out = { t: 'mul', a: [top, { t: 'pow', b: bot, e: num(-1) }] };
  } else if (terms.length === 1 && isRoot(D)) {
    const [, r] = coeffSplit(D);
    const top = S(mul(N, r)), bot = S(mul(D, r));
    steps.push({ title: 'Multiply top and bottom by the root', math: `\\frac{${tex(N)} \\cdot ${tex(r)}}{${tex(D)} \\cdot ${tex(r)}} = \\frac{${tex(top)}}{${tex(bot)}}` });
    out = { t: 'mul', a: [top, { t: 'pow', b: bot, e: num(-1) }] };
  } else throw new MathError('There is no root in the denominator to remove');
  return res('rationalize', 'Rationalize the denominator', tex(f), steps, tex(out), text(out));
}
// F with F' = f and F(x0) = y0
function antiderivativeThrough(fsrc, x0s, y0s, res) {
  const { f, v } = fnOf(fsrc);
  const steps = [{ title: 'Find all antiderivatives', math: `F(${v}) = \\int ${tex(f)}\\,d${v}` }];
  const st = [];
  const F = integrate(f, v, st);
  if (!F) throw new MathError('I could not integrate this function');
  st.forEach((q) => steps.push(q));
  const X0 = S(P(x0s)), Y0 = S(P(y0s));
  const C = S(sub(Y0, subst(S(F), v, X0)));
  steps.push({ title: `Use the point $(${tex(X0)};\\ ${tex(Y0)})$ to find $C$`, math: `${tex(S(subst(S(F), v, X0)))} + C = ${tex(Y0)} \\;\\Rightarrow\\; C = ${tex(C)}` });
  const ans = S(add(S(F), C));
  return res('integral', 'Antiderivative through a point', `F'(${v}) = ${tex(f)},\\ F(${tex(X0)}) = ${tex(Y0)}`, steps, `F(${v}) = ${tex(ans)}`, `F(${v}) = ${text(ans)}`);
}
const bound = (b) => { const deg = /°/.test(b); const v = evalNum(S(P(b.replace(/°/g, '')))); return { v: deg ? (v * Math.PI) / 180 : v, deg }; };
// critical points of f inside (lo, hi): real solutions of f' = 0, including families like π/4 + πk
function criticalIn(d, v, lo, hi) {
  const r = solveEquation(d, ZERO, v, []);
  const out = [];
  const push = (node) => { let xv; try { xv = evalNum(node); } catch { return; } if (xv > lo + 1e-12 && xv < hi - 1e-12 && !out.some((o) => Math.abs(evalNum(o) - xv) < 1e-9)) out.push(node); };
  if (r.general) for (const g of r.general) for (let kk = -40; kk <= 40; kk++) push(S(subst(g, 'k', num(kk))));
  else (r.solutions || []).forEach(push);
  return out;
}
function maxMinOn(kind, fsrc, lb, los, his, rb, res) {
  const { f, v, name } = fnOf(fsrc);
  const wantMax = /max|largest|greatest/i.test(kind);
  const lo = los ? bound(los).v : -Infinity, hi = his ? bound(his).v : Infinity;
  const steps = [{ title: 'Start with the function', math: `${name} = ${tex(f)}${los ? `,\\quad ${v} \\in ${lb}${tex(S(P(los.replace(/°/g, ''))))};\\ ${tex(S(P(his.replace(/°/g, ''))))}${rb}` : ''}` }];
  const d = derivative(f, v, []);
  steps.push({ title: 'Find the derivative', math: `${tex(d)}` });
  const crit = criticalIn(d, v, lo, hi);
  steps.push({ title: 'Critical points inside the interval: solve $f\'(x) = 0$', math: crit.length ? crit.map((c) => `${v} = ${tex(c)}`).join(',\\quad ') : '\\text{none}' });
  const cands = crit.map((c) => ({ x: c, y: S(subst(f, v, c)), why: 'critical point' }));
  if (lb === '[' && Number.isFinite(lo)) cands.push({ x: S(P(los)), y: S(subst(f, v, S(P(los)))), why: 'end of the interval' });
  if (rb === ']' && Number.isFinite(hi)) cands.push({ x: S(P(his)), y: S(subst(f, v, S(P(his)))), why: 'end of the interval' });
  if (!cands.length) throw new MathError(`There is no ${wantMax ? 'largest' : 'smallest'} value here`);
  cands.forEach((c) => steps.push({ title: `Value at $${v} = ${tex(c.x)}$ (${c.why})`, math: `${tex(c.y)}${approx(c.y)}` }));
  const best = cands.reduce((a, b) => ((wantMax ? evalNum(b.y) > evalNum(a.y) : evalNum(b.y) < evalNum(a.y)) ? b : a));
  // an open interval: make sure the value is not beaten near the ends
  const word = wantMax ? 'maximum' : 'minimum';
  steps.push({ title: `The ${wantMax ? 'largest' : 'smallest'} value`, math: `${tex(best.y)} \\text{ at } ${v} = ${tex(best.x)}` });
  return res('extrema', wantMax ? 'Largest value' : 'Smallest value', `${name} = ${tex(f)}`, steps, `\\text{${word}: } ${tex(best.y)} \\text{ at } ${v} = ${tex(best.x)}`, `${word} at (${text(best.x)}, ${text(best.y)})`, { graph: { expr: text(f), v } });
}
// range of a function: smallest and largest values (periodic functions over one turn, others over all x)
function rangeOf(src, res) {
  const { f, v, name } = fnOf(src);
  const d = derivative(f, v, []);
  const periodic = !findPlainVar(f, v);
  const crit = periodic ? criticalIn(d, v, -1e-9, 2 * Math.PI) : criticalIn(d, v, -Infinity, Infinity);
  const vals = crit.map((c) => S(subst(f, v, c)));
  const steps = [{ title: 'Start with the function', math: `${name} = ${tex(f)}` }, { title: 'Critical points (where the derivative is 0)', math: crit.map((c) => `${v} = ${tex(c)}`).join(',\\quad ') || '\\text{none}' }];
  let lo = vals.length ? vals.reduce((a, b) => (evalNum(b) < evalNum(a) ? b : a)) : null, hi = vals.length ? vals.reduce((a, b) => (evalNum(b) > evalNum(a) ? b : a)) : null;
  let loInf = false, hiInf = false;
  if (!periodic) {
    for (const X of [1e6, -1e6]) { let y; try { y = evalNum(f, { [v]: X }); } catch { continue; } if (y > 1e5) hiInf = true; if (y < -1e5) loInf = true; }
  }
  if (!lo && !loInf) loInf = true;
  if (!hi && !hiInf) hiInf = true;
  const L = loInf ? '(-\\infty' : `[${tex(lo)}`, H = hiInf ? '+\\infty)' : `${tex(hi)}]`;
  steps.push({ title: periodic ? 'Values at the critical points in one period give the smallest and largest value' : 'Compare the values at the critical points and far away', math: `E(f) = ${L};\\ ${H}` });
  return res('range', 'Range', `${name} = ${tex(f)}`, steps, `${L};\\ ${H}`, `[${loInf ? '-∞' : text(lo)}, ${hiInf ? '∞' : text(hi)}]`);
}
function findPlainVar(f, v) {
  let plain = false;
  (function walk(x, inTrig) {
    if (x.t === 'fn' && ['sin', 'cos', 'tan', 'cot'].includes(x.n)) return;
    if (x.t === 'sym' && x.n === v) plain = true;
    for (const k of ['a', 'b', 'e']) if (x[k]) (Array.isArray(x[k]) ? x[k] : [x[k]]).forEach((c) => walk(c, inTrig));
  })(f, false);
  return plain;
}
// T given G1; G2: substitute what the givens say, then simplify
function givenProblem(tsrc, gsrcs, res) {
  let T = S(P(tsrc));
  const steps = [{ title: 'What we need', math: tex(T) }];
  const env = {};
  for (const g of gsrcs) {
    const [ls, rs] = g.split('=');
    if (rs === undefined) continue;
    const L = S(P(ls)), R = S(P(rs));
    steps.push({ title: 'Given', math: `${tex(L)} = ${tex(R)}` });
    if (L.t === 'sym' && !has(R, L.n)) { T = S(subst(T, L.n, R)); steps.push({ title: `Put $${L.n} = ${tex(R)}$ into it`, math: tex(T) }); continue; }
    const vars = [...freeVars(S(sub(L, R)))].filter((q) => q !== 'k');
    if (vars.length === 1) {
      const u = vars[0];
      const r = solveEquation(L, R, u, []);
      const sols = r.solutions && r.solutions.length ? r.solutions : (r.general || []).map((q) => S(subst(q, 'k', ZERO)));
      if (!sols.length) throw new MathError('The given equation has no solution');
      env[u] = sols;
      steps.push({ title: `Solve for $${u}$`, math: `${u} = ${tex(sols[0])}` });
    }
  }
  // substitute the solved unknowns; all choices must give the same value
  const keys = Object.keys(env);
  let outs = [T];
  for (const k of keys) outs = outs.flatMap((o) => env[k].map((sv) => S(subst(o, k, sv))));
  let ans = outs[0];
  try {
    const vals = outs.map((o) => evalNum(o));
    if (vals.every((q) => Math.abs(q - vals[0]) < 1e-9 * Math.max(1, Math.abs(vals[0])))) {
      const simple = outs.find((o) => o.t === 'num') || outs.reduce((a, b) => (tex(b).length < tex(a).length ? b : a));
      ans = simple;
      if (ans.t !== 'num') { const r = Math.round(vals[0] * 1e9) / 1e9; if (Math.abs(r - vals[0]) < 1e-9 && tex(ans).length > 12) ans = num(Q.fromDecimalString(String(r))); }
    }
  } catch { /* symbolic answer */ }
  steps.push({ title: 'Substitute and simplify', math: tex(ans) });
  return res('given', 'Calculate', tex(T), steps, tex(ans), text(ans));
}
// x where the slope of f equals a value: f'(x) = c
function slopeIs(fsrc, csrc, res) {
  const { f, v } = fnOf(fsrc);
  const d = derivative(f, v, []);
  const c = S(P(csrc));
  const steps = [{ title: 'The slope of the tangent is the derivative', math: `f'(${v}) = ${tex(d)}` }, { title: 'Set it equal to the slope', math: `${tex(d)} = ${tex(c)}` }];
  const st = [];
  const r = solveEquation(d, c, v, st);
  st.slice(1).forEach((q) => steps.push(q));
  const sols = r.solutions || [];
  return res('equation', `Solve for ${v}`, `f'(${v}) = ${tex(c)}`, steps, sols.map((q) => `${v} = ${tex(q)}`).join(',\\quad ') || '\\text{no solution}', sols.map((q) => `${v} = ${text(q)}`).join(', ') || 'No solution');
}
// solid of revolution about the x-axis from where the curve meets the axis up to x = b
function revolution(ysrc, bsrc, res) {
  const f = S(P(ysrc)), v = chooseVar([f]) || 'x';
  const zeros = realSolutions(f, v, []).list || [];
  const b = S(P(bsrc));
  const a0 = zeros.filter((z) => evalNum(z) < evalNum(b)).sort((p, q) => evalNum(q) - evalNum(p))[0];
  if (!a0) throw new MathError('I could not find where the curve meets the x-axis');
  const steps = [{ title: 'Volume of revolution $V = \\pi \\int_a^b y^2\\,dx$; the curve meets the x-axis at', math: `${v} = ${tex(a0)}` }];
  const F = integrate(S(expand(pow(f, num(2)))), v, []);
  const V = S(mul(PI_, sub(subst(F, v, b), subst(F, v, a0))));
  steps.push({ title: 'Integrate', math: `V = \\pi \\int_{${tex(a0)}}^{${tex(b)}} \\left(${tex(f)}\\right)^2 d${v} = ${tex(V)}` });
  return res('integral', 'Volume of revolution', `V`, steps, tex(V), text(V));
}
const PI_ = sym('pi');

// tg x - 1 = 0, x ∈ (90°; 270°)
function solveOnInterval(eqSrc, lb, los, his, rb, opts, res) {
  const [Ls, Rs] = eqSrc.split('=');
  const deg = /°/.test(los + his);
  const L = S(P(Ls)), Rn = S(P(Rs));
  const v = chooseVar([L, Rn]) || 'x';
  const steps = [];
  const r = solveEquation(L, Rn, v, steps);
  const lo = bound(los).v, hi = bound(his).v;
  const inside = (xv) => (lb === '[' ? xv >= lo - 1e-12 : xv > lo + 1e-12) && (rb === ']' ? xv <= hi + 1e-12 : xv < hi - 1e-12);
  const out = [];
  const push = (node) => { let xv; try { xv = evalNum(node); } catch { return; } if (inside(xv) && !out.some((o) => Math.abs(o.v - xv) < 1e-9)) out.push({ node, v: xv }); };
  if (r.general) for (const g of r.general) for (let kk = -60; kk <= 60; kk++) push(S(subst(g, 'k', num(kk))));
  (r.solutions || []).forEach(push);
  out.sort((a, b) => a.v - b.v);
  const show = (o) => (deg ? `${formatNumber(Math.round((o.v * 180) / Math.PI * 1e9) / 1e9)}°` : tex(o.node));
  steps.push({ title: `Keep only the solutions in ${lb}${los}; ${his}${rb}`, math: out.length ? out.map((o) => `${v} = ${show(o)}`).join(',\\quad ') : '\\text{none}' });
  const ansT = out.map((o) => `${v} = ${deg ? formatNumber(Math.round((o.v * 180) / Math.PI * 1e9) / 1e9) : text(o.node)}`).join(', ') || 'No solution';
  return res('equation', `Solve for ${v}`, `${tex(L)} = ${tex(Rn)},\\ ${v} \\in ${lb}${los}; ${his}${rb}`, steps, out.length ? out.map((o) => `${v} = ${show(o)}`).join(',\\quad ') : '\\text{no solution}', ansT);
}
// y' + 2y = 4  ->  y' = 4 - 2y
function odeRearranged(l, r, res) {
  const D = sym('D');
  const L = S(P(l.replace(/y'|y′/g, 'D'))), R0 = S(P(r.replace(/y'|y′/g, 'D')));
  const co = polyCoeffs(S(sub(L, R0)), 'D');
  if (!co || co.length !== 2) return null;
  const rhs = S(div(mul(num(-1), co[0]), co[1]));
  void D;
  return ode(text(rhs), res);
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

// ---------------- ∫ sin^m(bx) cos^n(bx) dx with an odd power: substitute u = sin or u = cos ----------------
export function trigPowerIntegral(f, v, steps) {
  const fs = f.t === 'mul' ? f.a : [f];
  let c = Q.of(1), m = 0, n = 0, b = null;
  for (const x of fs) {
    if (x.t === 'num' && isQ(x.v)) { c = c.mul(x.v); continue; }
    const [base, e] = x.t === 'pow' && x.e.t === 'num' && isQ(x.e.v) && x.e.v.isInt() && x.e.v.sign() > 0 ? [x.b, Number(x.e.v.n)] : [x, 1];
    if (base.t !== 'fn' || (base.n !== 'sin' && base.n !== 'cos')) return null;
    const co = polyCoeffs(base.a[0], v);
    if (!co || co.length !== 2 || !(co[0].t === 'num' && co[0].v.isZero()) || co[1].t !== 'num') return null;
    if (b && !b.eq(co[1].v)) return null;
    b = co[1].v;
    if (base.n === 'sin') m += e; else n += e;
  }
  if (!b || (m % 2 === 0 && n % 2 === 0)) return null;
  const U = sym('u'), X = sym(v), arg = S(mul(num(b), X));
  const useSin = n % 2 === 1; // odd power of cos: u = sin, du = b cos dx
  const k = useSin ? (n - 1) / 2 : (m - 1) / 2;
  const poly = useSin ? mul(pow(U, num(m)), pow(sub(ONE, pow(U, num(2))), num(k))) : mul(num(-1), pow(U, num(n)), pow(sub(ONE, pow(U, num(2))), num(k)));
  const P2 = S(expand(poly));
  const Fu = integrate(P2, 'u', []);
  if (!Fu) return null;
  const back = S(mul(num(c.div(b)), subst(S(Fu), 'u', fn(useSin ? 'sin' : 'cos', arg))));
  steps.push({ title: `Odd power of ${useSin ? 'cos' : 'sin'}: keep one factor and write the rest with $\\sin^2 + \\cos^2 = 1$`, math: `u = \\${useSin ? 'sin' : 'cos'}\\left(${tex(arg)}\\right),\\quad du = ${useSin ? '' : '-'}${tex(num(b))}\\${useSin ? 'cos' : 'sin'}\\left(${tex(arg)}\\right)dx` });
  steps.push({ title: 'The integral becomes a polynomial in $u$', math: `\\int ${tex(P2)}\\,du = ${tex(S(Fu))}` });
  steps.push({ title: 'Put $u$ back', math: tex(back) });
  return back;
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
