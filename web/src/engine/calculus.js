// Derivatives, integrals and limits with explanations.
import { Q, MathError, isQ, toNum, formatNumber, nvSign } from './rational.js';
import { num, sym, add, mul, pow, fn, neg, sub, div, sqrt, simplify, expand, polyCoeffs, has, subst, evalNum, isNum, equal, key, coeffSplit, numerDenom, ZERO, ONE, PI, E, map, allRational } from './cas.js';
import { tex } from './print.js';
import { toQArray, rationalRoots, deg, synthDiv, toNode, numericRoots, polyDivide } from './poly.js';
import { factorExpr } from './factor.js';

const S = (x) => simplify(x);
const ddx = (v) => `\\frac{d}{d${v}}`;
const br = (x) => `\\left[${tex(x)}\\right]`;
const isConstIn = (x, v) => !has(x, v);
const isLinearIn = (x, v) => { const c = polyCoeffs(x, v); return c && c.length === 2 && !has(c[1], v) ? c : null; };

// ===========================================================================
// Derivatives
// ===========================================================================
export function derivative(f, v, steps, opts = {}) {
  const d = D(S(f), v, steps, 0);
  return nicer(S(d), v);
}
// choose a tidy final form: expand the numerator of fractions, keep denominators factored
export function nicer(r, v) {
  const cands = [r];
  try {
    const [N, Dn] = numerDenom(r);
    if (has(Dn, v)) cands.push(S(div(expand(N), Dn)));
    else cands.push(expand(r));
  } catch { /* ignore */ }
  return cands.reduce((a, b) => (tex(b).length < tex(a).length ? b : a));
}
function rule(steps, depth, title, lhs, rhs, v) {
  if (depth > 6) return;
  steps.push({ title, math: `${ddx(v)}${br(lhs)} = ${tex(rhs)}` });
}
function D(f, v, steps, depth) {
  if (isConstIn(f, v)) return ZERO;
  if (f.t === 'sym') return ONE;
  if (f.t === 'add') {
    const parts = f.a.map((t) => D(t, v, [], depth + 1));
    const res = S(add(parts));
    steps.push({ title: 'Sum rule: differentiate each term separately', math: `${ddx(v)}${br(f)} = ${f.a.map((t) => `${ddx(v)}${br(t)}`).join(' + ')}` });
    f.a.forEach((t) => { if (has(t, v)) D(t, v, steps, depth + 1); });
    return res;
  }
  if (f.t === 'mul') {
    const [c, rest] = coeffSplit(f);
    if (!(isQ(c) && c.isOne()) && rest) {
      const inner = D(rest, v, [], depth + 1);
      const res = S(mul(num(c), inner));
      steps.push({ title: 'Constant multiple rule: $\\frac{d}{dx}[c\\,f] = c\\,f\'$', math: `${ddx(v)}${br(f)} = ${tex(num(c))} \\cdot ${ddx(v)}${br(rest)}` });
      D(rest, v, steps, depth + 1);
      return res;
    }
    const constF = f.a.filter((x) => !has(x, v)), varF = f.a.filter((x) => has(x, v));
    if (constF.length) {
      const C = S(mul(constF)), rest2 = S(mul(varF));
      const res = S(mul(C, D(rest2, v, [], depth + 1)));
      steps.push({ title: 'Constant multiple rule: pull the constant out', math: `${ddx(v)}${br(f)} = ${tex(C)} \\cdot ${ddx(v)}${br(rest2)}` });
      D(rest2, v, steps, depth + 1);
      return res;
    }
    // quotient?
    const [N, Dn] = numerDenom(f);
    if (has(Dn, v) && !isNum(Dn, 1)) {
      const dN = D(N, v, [], depth + 1), dD = D(Dn, v, [], depth + 1);
      const res = S(div(sub(mul(dN, Dn), mul(N, dD)), pow(Dn, num(2))));
      steps.push({ title: 'Quotient rule: $\\left(\\frac{f}{g}\\right)\' = \\frac{f\'g - fg\'}{g^2}$', detail: `f = ${tex(N)},\\quad g = ${tex(Dn)}`, math: `${ddx(v)}${br(f)} = \\frac{\\left(${tex(dN)}\\right)\\left(${tex(Dn)}\\right) - \\left(${tex(N)}\\right)\\left(${tex(dD)}\\right)}{\\left(${tex(Dn)}\\right)^{2}}` });
      if (has(N, v)) D(N, v, steps, depth + 1);
      D(Dn, v, steps, depth + 1);
      return res;
    }
    const F = f.a[0], G = S(mul(f.a.slice(1)));
    const dF = D(F, v, [], depth + 1), dG = D(G, v, [], depth + 1);
    const res = S(add(mul(dF, G), mul(F, dG)));
    steps.push({ title: 'Product rule: $(fg)\' = f\'g + fg\'$', detail: `f = ${tex(F)},\\quad g = ${tex(G)}`, math: `${ddx(v)}${br(f)} = ${wrapP(dF)}${wrapP(G)} + ${wrapP(F)}${wrapP(dG)}` });
    D(F, v, steps, depth + 1); D(G, v, steps, depth + 1);
    return res;
  }
  if (f.t === 'pow') {
    const { b, e } = f;
    if (has(b, v) && !has(e, v)) {
      const outer = S(mul(e, pow(b, S(sub(e, ONE)))));
      if (b.t === 'sym') {
        rule(steps, depth, `Power rule: $\\frac{d}{dx}[x^n] = n\\,x^{n-1}$`, f, outer, v);
        return outer;
      }
      const du = D(b, v, [], depth + 1);
      const res = S(mul(outer, du));
      steps.push({ title: 'Chain rule with the power rule: $\\frac{d}{dx}[u^n] = n\\,u^{n-1} \\cdot u\'$', detail: `u = ${tex(b)}`, math: `${ddx(v)}${br(f)} = ${tex(outer)} \\cdot ${ddx(v)}${br(b)}` });
      D(b, v, steps, depth + 1);
      return res;
    }
    if (!has(b, v) && has(e, v)) {
      const isE = b.t === 'sym' && b.n === 'e';
      const outer = isE ? f : S(mul(f, fn('ln', b)));
      if (e.t === 'sym') { rule(steps, depth, isE ? 'Exponential rule: $\\frac{d}{dx}[e^x] = e^x$' : 'Exponential rule: $\\frac{d}{dx}[a^x] = a^x \\ln a$', f, outer, v); return outer; }
      const du = D(e, v, [], depth + 1);
      const res = S(mul(outer, du));
      steps.push({ title: isE ? 'Chain rule: $\\frac{d}{dx}[e^u] = e^u \\cdot u\'$' : 'Chain rule: $\\frac{d}{dx}[a^u] = a^u \\ln(a) \\cdot u\'$', detail: `u = ${tex(e)}`, math: `${ddx(v)}${br(f)} = ${tex(outer)} \\cdot ${ddx(v)}${br(e)}` });
      D(e, v, steps, depth + 1);
      return res;
    }
    // u^w: logarithmic differentiation
    const res = S(mul(f, add(mul(D(e, v, [], depth + 1), fn('ln', b)), mul(e, D(b, v, [], depth + 1), pow(b, num(-1))))));
    steps.push({ title: 'Logarithmic differentiation: $y = u^w \\Rightarrow \\ln y = w \\ln u$', math: `${ddx(v)}${br(f)} = ${tex(f)}\\left(${tex(e)}' \\ln\\left(${tex(b)}\\right) + \\frac{${tex(e)} \\cdot ${tex(b)}'}{${tex(b)}}\\right)` });
    return res;
  }
  if (f.t === 'fn') {
    const u = f.a[0];
    const table = {
      sin: () => fn('cos', u), cos: () => neg(fn('sin', u)), tan: () => pow(fn('sec', u), num(2)),
      sec: () => mul(fn('sec', u), fn('tan', u)), csc: () => neg(mul(fn('csc', u), fn('cot', u))), cot: () => neg(pow(fn('csc', u), num(2))),
      ln: () => pow(u, num(-1)), log: () => pow(mul(u, fn('ln', f.a[1])), num(-1)),
      asin: () => pow(sub(ONE, pow(u, num(2))), num(new Q(-1n, 2n))), acos: () => neg(pow(sub(ONE, pow(u, num(2))), num(new Q(-1n, 2n)))),
      atan: () => pow(add(ONE, pow(u, num(2))), num(-1)), acot: () => neg(pow(add(ONE, pow(u, num(2))), num(-1))),
      sinh: () => fn('cosh', u), cosh: () => fn('sinh', u), tanh: () => pow(fn('cosh', u), num(-2)),
      abs: () => div(u, fn('abs', u)),
    };
    const names = { sin: '\\cos x', cos: '-\\sin x', tan: '\\sec^2 x', sec: '\\sec x \\tan x', csc: '-\\csc x \\cot x', cot: '-\\csc^2 x', ln: '\\frac{1}{x}', log: '\\frac{1}{x \\ln b}', asin: '\\frac{1}{\\sqrt{1-x^2}}', acos: '-\\frac{1}{\\sqrt{1-x^2}}', atan: '\\frac{1}{1+x^2}', sinh: '\\cosh x', cosh: '\\sinh x', tanh: '\\operatorname{sech}^2 x', abs: '\\frac{x}{|x|}', acot: '-\\frac{1}{1+x^2}' };
    if (!table[f.n]) throw new MathError(`I don't know the derivative of ${f.n}`);
    const outer = S(table[f.n]());
    const fname = f.n === 'log' ? '\\log_b x' : f.n === 'abs' ? '|x|' : `\\${['asin', 'acos', 'atan'].includes(f.n) ? 'arc' + f.n.slice(1) : f.n} x`;
    if (u.t === 'sym' && u.n === v) { rule(steps, depth, `Derivative of $${fname}$ is $${names[f.n]}$`, f, outer, v); return outer; }
    const du = D(u, v, [], depth + 1);
    const res = S(mul(outer, du));
    steps.push({ title: `Chain rule: derivative of the outside ($${fname} \\to ${names[f.n]}$) times derivative of the inside`, detail: `u = ${tex(u)}`, math: `${ddx(v)}${br(f)} = ${tex(outer)} \\cdot ${ddx(v)}${br(u)}` });
    D(u, v, steps, depth + 1);
    return res;
  }
  throw new MathError('Cannot differentiate this expression');
}
const wrapP = (x) => `\\left(${tex(x)}\\right)`;

// ===========================================================================
// Integrals
// ===========================================================================
export function integrate(f, v, steps, depth = 0) {
  if (depth > 8) return null;
  f = S(f);
  const X = sym(v);
  const I = (x) => `\\int ${tex(x)}\\,d${v}`;
  if (!has(f, v)) { steps.push({ title: 'Integral of a constant: $\\int c\\,dx = cx$', math: `${I(f)} = ${tex(S(mul(f, X)))}` }); return S(mul(f, X)); }
  // linearity
  if (f.t === 'add') {
    steps.push({ title: 'Sum rule: integrate each term separately', math: `${I(f)} = ${f.a.map((t) => `\\int ${tex(t)}\\,d${v}`).join(' + ').replace(/\+ \\int -/g, '- \\int ')}` });
    const parts = [];
    for (const t of f.a) { const r = integrate(t, v, steps, depth + 1); if (!r) return null; parts.push(r); }
    return S(add(parts));
  }
  if (f.t === 'mul') {
    const constF = f.a.filter((x) => !has(x, v)), varF = f.a.filter((x) => has(x, v));
    if (constF.length) {
      const C = S(mul(constF)), g = S(mul(varF));
      steps.push({ title: 'Constant multiple rule: move the constant outside the integral', math: `${I(f)} = ${tex(C)} ${I(g)}` });
      const r = integrate(g, v, steps, depth + 1);
      return r ? S(mul(C, r)) : null;
    }
  }
  // table with linear inner argument
  const t = tableIntegral(f, v);
  if (t) { steps.push({ title: t.title, math: `${I(f)} = ${tex(t.res)}` }); return t.res; }
  // expand products / powers of polynomials (but try substitution first when expanding would be big)
  const ex = expand(f);
  if (!equal(ex, f) && ex.t === 'add' && ex.a.length > 5) { const us0 = uSubstitution(f, v, steps, depth); if (us0) return us0; }
  if (!equal(ex, f) && ex.t === 'add') {
    steps.push({ title: 'Expand the expression first', math: `${I(f)} = ${I(ex)}` });
    return integrate(ex, v, steps, depth + 1);
  }
  // trig power identities
  const trigId = trigIdentity(f, v);
  if (trigId) { steps.push({ title: trigId.title, math: `${I(f)} = ${I(trigId.g)}` }); return integrate(trigId.g, v, steps, depth + 1); }
  // rational functions: partial fractions
  const pf = partialFractions(f, v, steps);
  if (pf) { return integrate(pf, v, steps, depth + 1); }
  // u-substitution
  const us = uSubstitution(f, v, steps, depth);
  if (us) return us;
  // integration by parts
  const bp = byParts(f, v, steps, depth);
  if (bp) return bp;
  return null;
}

function tableIntegral(f, v) {
  const X = sym(v);
  const lin = (u) => isLinearIn(u, v); // [b, a]
  // x^n or (ax+b)^n
  if (f.t === 'sym' && f.n === v) return { title: 'Power rule: $\\int x^n\\,dx = \\frac{x^{n+1}}{n+1}$', res: S(div(pow(X, num(2)), num(2))) };
  if (f.t === 'pow' && !has(f.e, v)) {
    const L = lin(f.b);
    if (L) {
      const a = L[1];
      if (isNum(f.e, -1)) return { title: equal(f.b, X) ? '$\\int \\frac{1}{x}\\,dx = \\ln|x|$' : '$\\int \\frac{1}{ax+b}\\,dx = \\frac{1}{a}\\ln|ax+b|$', res: S(div(fn('ln', fn('abs', f.b)), a)) };
      const n1 = S(add(f.e, ONE));
      return { title: equal(f.b, X) ? 'Power rule: $\\int x^n\\,dx = \\frac{x^{n+1}}{n+1}$' : 'Reverse chain rule: $\\int (ax+b)^n\\,dx = \\frac{(ax+b)^{n+1}}{a(n+1)}$', res: S(div(pow(f.b, n1), mul(a, n1))) };
    }
    // 1/(x^2 + c) , 1/sqrt(1-x^2)
    const co = polyCoeffs(f.b, v);
    if (co && co.length === 3 && isNum(co[1], 0) && allRational(co)) {
      const c = co[0].v, a2 = co[2].v;
      if (isNum(f.e, -1) && c.sign() > 0 && a2.sign() > 0) {
        // 1/(a2 x^2 + c) = 1/sqrt(a2 c) atan(x sqrt(a2/c))
        const k = S(sqrt(num(a2.div(c))));
        return { title: '$\\int \\frac{1}{x^2 + a^2}\\,dx = \\frac{1}{a}\\arctan\\frac{x}{a}$', res: S(mul(pow(sqrt(num(a2.mul(c))), num(-1)), fn('atan', mul(k, X)))) };
      }
      if (f.e.t === 'num' && isQ(f.e.v) && f.e.v.eq(new Q(-1n, 2n)) && c.sign() > 0 && a2.sign() < 0) {
        const k = S(sqrt(num(a2.neg().div(c))));
        return { title: '$\\int \\frac{1}{\\sqrt{a^2 - x^2}}\\,dx = \\arcsin\\frac{x}{a}$', res: S(mul(pow(sqrt(num(a2.neg())), num(-1)), fn('asin', mul(k, X)))) };
      }
    }
  }
  // a^(linear)
  if (f.t === 'pow' && !has(f.b, v) && lin(f.e)) {
    const a = lin(f.e)[1];
    const isE = f.b.t === 'sym' && f.b.n === 'e';
    return { title: isE ? '$\\int e^{ax+b}\\,dx = \\frac{1}{a}e^{ax+b}$' : '$\\int c^{x}\\,dx = \\frac{c^{x}}{\\ln c}$', res: S(div(f, isE ? a : mul(a, fn('ln', f.b)))) };
  }
  // trig of linear
  if (f.t === 'fn' && lin(f.a[0])) {
    const u = f.a[0], a = lin(u)[1];
    const T = {
      sin: ['$\\int \\sin u\\,du = -\\cos u$', () => neg(fn('cos', u))],
      cos: ['$\\int \\cos u\\,du = \\sin u$', () => fn('sin', u)],
      tan: ['$\\int \\tan u\\,du = -\\ln|\\cos u|$', () => neg(fn('ln', fn('abs', fn('cos', u))))],
      cot: ['$\\int \\cot u\\,du = \\ln|\\sin u|$', () => fn('ln', fn('abs', fn('sin', u)))],
      sec: ['$\\int \\sec u\\,du = \\ln|\\sec u + \\tan u|$', () => fn('ln', fn('abs', add(fn('sec', u), fn('tan', u))))],
      csc: ['$\\int \\csc u\\,du = -\\ln|\\csc u + \\cot u|$', () => neg(fn('ln', fn('abs', add(fn('csc', u), fn('cot', u)))))],
      ln: ['$\\int \\ln u\\,du = u\\ln u - u$ (integration by parts)', () => sub(mul(u, fn('ln', u)), u)],
      sinh: ['$\\int \\sinh u\\,du = \\cosh u$', () => fn('cosh', u)],
      cosh: ['$\\int \\cosh u\\,du = \\sinh u$', () => fn('sinh', u)],
      atan: ['$\\int \\arctan u\\,du = u\\arctan u - \\frac{1}{2}\\ln(1+u^2)$', () => sub(mul(u, fn('atan', u)), mul(num(new Q(1n, 2n)), fn('ln', add(ONE, pow(u, num(2))))))],
      asin: ['$\\int \\arcsin u\\,du = u\\arcsin u + \\sqrt{1-u^2}$', () => add(mul(u, fn('asin', u)), sqrt(sub(ONE, pow(u, num(2)))))],
    };
    if (T[f.n]) return { title: T[f.n][0] + (isNum(a, 1) ? '' : ` (divide by the inner coefficient $${tex(a)}$)`), res: S(div(T[f.n][1](), a)) };
  }
  // sec^2, csc^2, sec*tan, 1/cos^2
  if (f.t === 'pow' && f.b.t === 'fn' && lin(f.b.a[0]) && isNum(f.e, 2)) {
    const u = f.b.a[0], a = lin(u)[1];
    if (f.b.n === 'sec') return { title: '$\\int \\sec^2 u\\,du = \\tan u$', res: S(div(fn('tan', u), a)) };
    if (f.b.n === 'csc') return { title: '$\\int \\csc^2 u\\,du = -\\cot u$', res: S(div(neg(fn('cot', u)), a)) };
  }
  if (f.t === 'pow' && f.b.t === 'fn' && lin(f.b.a[0]) && isNum(f.e, -2)) {
    const u = f.b.a[0], a = lin(u)[1];
    if (f.b.n === 'cos') return { title: '$\\int \\frac{1}{\\cos^2 u}\\,du = \\tan u$', res: S(div(fn('tan', u), a)) };
    if (f.b.n === 'sin') return { title: '$\\int \\frac{1}{\\sin^2 u}\\,du = -\\cot u$', res: S(div(neg(fn('cot', u)), a)) };
  }
  if (f.t === 'mul' && f.a.length === 2 && f.a.every((g) => g.t === 'fn' && lin(g.a[0])) && equal(f.a[0].a[0], f.a[1].a[0])) {
    const names = f.a.map((g) => g.n).sort().join(',');
    const u = f.a[0].a[0], a = lin(u)[1];
    if (names === 'sec,tan') return { title: '$\\int \\sec u \\tan u\\,du = \\sec u$', res: S(div(fn('sec', u), a)) };
    if (names === 'cot,csc') return { title: '$\\int \\csc u \\cot u\\,du = -\\csc u$', res: S(div(neg(fn('csc', u)), a)) };
  }
  return null;
}

function trigIdentity(f, v) {
  if (f.t === 'pow' && f.b.t === 'fn' && isNum(f.e, 2) && isLinearIn(f.b.a[0], v)) {
    const u = f.b.a[0];
    if (f.b.n === 'sin') return { title: 'Use the identity $\\sin^2 u = \\frac{1 - \\cos 2u}{2}$', g: S(mul(num(new Q(1n, 2n)), sub(ONE, fn('cos', mul(num(2), u))))) };
    if (f.b.n === 'cos') return { title: 'Use the identity $\\cos^2 u = \\frac{1 + \\cos 2u}{2}$', g: S(mul(num(new Q(1n, 2n)), add(ONE, fn('cos', mul(num(2), u))))) };
    if (f.b.n === 'tan') return { title: 'Use the identity $\\tan^2 u = \\sec^2 u - 1$', g: S(sub(pow(fn('sec', u), num(2)), ONE)) };
  }
  if (f.t === 'mul' && f.a.length === 2 && f.a.every((g) => g.t === 'fn') && f.a.map((g) => g.n).sort().join() === 'cos,sin' && equal(f.a[0].a[0], f.a[1].a[0]) && isLinearIn(f.a[0].a[0], v)) {
    const u = f.a[0].a[0];
    return { title: 'Use the identity $\\sin u \\cos u = \\frac{1}{2}\\sin 2u$', g: S(mul(num(new Q(1n, 2n)), fn('sin', mul(num(2), u)))) };
  }
  return null;
}

function partialFractions(f, v, steps) {
  const [N, Dn] = numerDenom(f);
  if (!has(Dn, v)) return null;
  const cn = polyCoeffs(N, v), cd = polyCoeffs(Dn, v);
  if (!cn || !cd || !allRational(cn) || !allRational(cd)) return null;
  let pn = toQArray(cn), pd = toQArray(cd);
  if (deg(pd) < 1) return null;
  const X = sym(v);
  // polynomial long division
  if (deg(pn) >= deg(pd)) {
    const [q, r] = polyDivide(pn, pd);
    const g = S(add(toNode(q, v), div(toNode(r, v), toNode(pd, v))));
    steps.push({ title: 'Polynomial long division (the top has degree ≥ the bottom)', math: `\\frac{${tex(toNode(pn, v))}}{${tex(toNode(pd, v))}} = ${tex(toNode(q, v))} + \\frac{${tex(toNode(r, v))}}{${tex(toNode(pd, v))}}` });
    if (r.every((c) => c.isZero())) return toNode(q, v);
    return g;
  }
  if (deg(pd) < 2) return null;
  const { roots, rest } = rationalRoots(pd);
  if (deg(rest) > 0 && deg(rest) !== 2) return null;
  // group roots with multiplicity
  const mult = new Map(); roots.forEach((r) => mult.set(r.toString(), { r, m: (mult.get(r.toString())?.m || 0) + 1 }));
  const lead = rest[rest.length - 1];
  const factors = [...mult.values()];
  if (deg(rest) === 0 && factors.every((x) => x.m === 1)) {
    // A_i = N(r_i) / D'(r_i)
    const dp = pd.slice(1).map((c, i) => c.mul(Q.of(i + 1)));
    const evalQ = (p, x) => { let s = Q.of(0); for (let i = p.length - 1; i >= 0; i--) s = s.mul(x).add(p[i]); return s; };
    const terms = factors.map(({ r }) => S(div(num(evalQ(pn, r).div(evalQ(dp, r))), sub(X, num(r)))));
    const g = S(add(terms));
    steps.push({ title: 'Partial fractions: factor the denominator and split the fraction', detail: `${tex(toNode(pd, v))} = ${tex(S(mul(num(lead), ...factors.map(({ r }) => sub(X, num(r))))))}`, math: `\\frac{${tex(toNode(pn, v))}}{${tex(toNode(pd, v))}} = ${terms.map(tex).join(' + ').replace(/\+ -/g, '- ')}` });
    return g;
  }
  return null;
}
function uSubstitution(f, v, steps, depth) {
  const cands = [];
  map(f, (n) => {
    if (n.t === 'fn' && has(n.a[0], v) && !isLinearIn(n.a[0], v)) cands.push(n.a[0]);
    if (n.t === 'pow' && has(n.b, v) && !has(n.e, v) && !isLinearIn(n.b, v)) cands.push(n.b);
    if (n.t === 'pow' && !has(n.b, v) && has(n.e, v) && !isLinearIn(n.e, v)) cands.push(n.e);
    if (n.t === 'fn' && (n.n === 'ln' || n.n === 'sin' || n.n === 'cos' || n.n === 'tan' || n.n === 'atan' || n.n === 'asin')) cands.push(n);
    if (n.t === 'pow' && !has(n.b, v) && has(n.e, v)) cands.push(n);
    return n;
  });
  const U = sym('u');
  const seen = new Set();
  for (const u of cands) {
    const k = key(u); if (seen.has(k)) continue; seen.add(k);
    let du;
    try { du = derivative(u, v, []); } catch { continue; }
    if (isNum(du, 0)) continue;
    const ratio = S(div(f, du));
    const rep = S(replaceNode(ratio, u, U));
    if (has(rep, v)) {
      // try expressing remaining x via u when u is linear in x^n etc. skip
      continue;
    }
    const st = [];
    const r = integrate(rep, 'u', st, depth + 1);
    if (!r) continue;
    steps.push({ title: `Substitution: let $u = ${tex(u)}$, so $du = ${tex(du)}\\,d${v}$`, math: `\\int ${tex(f)}\\,d${v} = \\int ${tex(rep)}\\,du` });
    st.forEach((s) => steps.push(s));
    const back = S(subst(r, 'u', u));
    steps.push({ title: `Substitute back $u = ${tex(u)}$`, math: tex(back) });
    return back;
  }
  return null;
}
function replaceNode(x, target, rep) {
  const k = key(target);
  const go = (n) => {
    if (key(n) === k) return rep;
    // powers of the target's base: e^(2x) when target is e^x
    if (target.t === 'pow' && n.t === 'pow' && equal(n.b, target.b)) {
      const m = S(div(n.e, target.e)); if (m.t === 'num') return pow(rep, m);
    }
    if (n.t === 'pow') return pow(go(n.b), go(n.e));
    if (n.a) return { ...n, a: n.a.map(go) };
    return n;
  };
  return go(x);
}

function byParts(f, v, steps, depth) {
  if (depth > 5) return null;
  const fs = f.t === 'mul' ? f.a : [f];
  // LIATE choice of u
  const rank = (g) => {
    if (g.t === 'fn' && (g.n === 'ln' || g.n === 'log')) return 0;
    if (g.t === 'fn' && g.n.startsWith('a') && g.n !== 'abs') return 1;
    if (polyCoeffs(g, v)) return 2;
    if (g.t === 'fn' && ['sin', 'cos'].includes(g.n)) return 3;
    if (g.t === 'pow' && !has(g.b, v)) return 4;
    return 9;
  };
  if (fs.length < 2 && !(f.t === 'fn' && rank(f) <= 1)) return null;
  const sorted = fs.slice().sort((a, b) => rank(a) - rank(b));
  const u = sorted[0], dv = S(mul(sorted.slice(1)));
  if (rank(u) === 9) return null;
  const du = derivative(u, v, []);
  const vst = [];
  const V = integrate(dv, v, vst, depth + 1);
  if (!V) return null;
  const rest = S(mul(V, du));
  steps.push({ title: 'Integration by parts: $\\int u\\,dv = uv - \\int v\\,du$', detail: `u = ${tex(u)},\\quad dv = ${tex(dv)}\\,d${v},\\quad du = ${tex(du)}\\,d${v},\\quad v = ${tex(V)}`, math: `\\int ${tex(f)}\\,d${v} = ${tex(S(mul(u, V)))} - \\int ${tex(rest)}\\,d${v}` });
  // cyclic case e^x sin x : detect if rest leads back to f
  const st = [];
  const r2 = integrate(rest, v, st, depth + 1);
  if (!r2) {
    // try solving cyclic integral: rest = k * (something by parts that returns -c f)
    return null;
  }
  st.forEach((s) => steps.push(s));
  return S(sub(mul(u, V), r2));
}

export function definiteIntegral(f, v, a, b, steps) {
  const F = integrate(f, v, steps);
  const fa = a, fb = b;
  if (!F) {
    const val = simpson(f, v, evalNum(a), evalNum(b));
    steps.push({ title: 'No simple antiderivative was found, so the integral is computed numerically (Simpson’s rule)', math: `\\int_{${tex(a)}}^{${tex(b)}} ${tex(f)}\\,d${v} \\approx ${formatNumber(val)}` });
    return { value: num(val), approx: true };
  }
  steps.push({ title: 'Antiderivative', math: `F(${v}) = ${tex(F)}` });
  const Fb = S(subst(F, v, fb)), Fa = S(subst(F, v, fa));
  steps.push({ title: 'Fundamental Theorem of Calculus: evaluate $F(b) - F(a)$', math: `F(${tex(fb)}) - F(${tex(fa)}) = \\left(${tex(Fb)}\\right) - \\left(${tex(Fa)}\\right)` });
  let val = S(sub(Fb, Fa));
  const numeric = evalNum(val);
  if (!Number.isFinite(numeric)) {
    const nv = simpson(f, v, evalNum(a), evalNum(b));
    steps.push({ title: 'The antiderivative is not defined on the whole interval; numeric estimate', math: `\\approx ${formatNumber(nv)}` });
    return { value: num(nv), approx: true };
  }
  steps.push({ title: 'Simplify', math: `${tex(val)}${val.t === 'num' && isQ(val.v) && val.v.isInt() ? '' : ` \\approx ${formatNumber(numeric)}`}` });
  return { value: val, approx: false, numeric };
}
function simpson(f, v, a, b, n = 2000) {
  const h = (b - a) / n; let s = 0;
  const F = (x) => { const y = evalNum(f, { [v]: x }); return Number.isFinite(y) ? y : 0; };
  for (let i = 0; i <= n; i++) s += F(a + i * h) * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  return (s * h) / 3;
}

// ===========================================================================
// Limits
// ===========================================================================
export function limit(f, v, a, steps, dir = 0) {
  f = S(f);
  const L = `\\lim_{${v} \\to ${tex(a)}${dir > 0 ? '^+' : dir < 0 ? '^-' : ''}}`;
  const atInf = a.t === 'sym' && a.n === 'oo' || (a.t === 'mul' && a.a.some((x) => x.t === 'sym' && x.n === 'oo'));
  if (atInf) return limitInf(f, v, a, steps, L);
  const av = evalNum(a);
  const sub1 = safe(() => evalNum(f, { [v]: av }));
  if (Number.isFinite(sub1)) {
    const exact = S(subst(f, v, a));
    steps.push({ title: 'Direct substitution works (the function is continuous here)', math: `${L} ${tex(f)} = ${tex(exact)}` });
    return { value: exact };
  }
  let [N, Dn] = numerDenom(f);
  const nA = safe(() => evalNum(N, { [v]: av })), dA = safe(() => evalNum(Dn, { [v]: av }));
  if (Math.abs(nA) < 1e-12 && Math.abs(dA) < 1e-12) {
    steps.push({ title: 'Direct substitution gives $\\frac{0}{0}$ (indeterminate form)', math: `\\frac{${tex(S(subst(N, v, a)))}}{${tex(S(subst(Dn, v, a)))}}` });
    // polynomial factor & cancel
    const cn = polyCoeffs(N, v), cd = polyCoeffs(Dn, v);
    if (cn && cd && allRational(cn) && allRational(cd) && a.t === 'num' && isQ(a.v)) {
      let pn = toQArray(cn), pd = toQArray(cd);
      let k = 0;
      while (deg(pn) >= 1 && deg(pd) >= 1 && evalP(pn, a.v).isZero() && evalP(pd, a.v).isZero()) { pn = synthDiv(pn, a.v).quot; pd = synthDiv(pd, a.v).quot; k++; }
      const fac = S(sub(sym(v), a));
      steps.push({ title: `Factor and cancel the common factor $(${tex(fac)})$`, math: `${L} \\frac{${k > 1 ? `\\left(${tex(fac)}\\right)^{${k}}` : `\\left(${tex(fac)}\\right)`}\\left(${tex(toNode(pn, v))}\\right)}{${k > 1 ? `\\left(${tex(fac)}\\right)^{${k}}` : `\\left(${tex(fac)}\\right)`}\\left(${tex(toNode(pd, v))}\\right)} = ${L} \\frac{${tex(toNode(pn, v))}}{${tex(toNode(pd, v))}}` });
      return limit(S(div(toNode(pn, v), toNode(pd, v))), v, a, steps, dir);
    }
    // L'Hopital
    for (let i = 0; i < 4; i++) {
      const dn = derivative(N, v, []), dd = derivative(Dn, v, []);
      steps.push({ title: 'L’Hôpital’s rule: differentiate the top and bottom', math: `${L} \\frac{${tex(N)}}{${tex(Dn)}} = ${L} \\frac{${tex(dn)}}{${tex(dd)}}` });
      const g = S(div(dn, dd));
      const val = safe(() => evalNum(g, { [v]: av }));
      if (Number.isFinite(val)) { const exact = S(subst(g, v, a)); steps.push({ title: 'Now substitute', math: `= ${tex(exact)}` }); return { value: exact }; }
      const n2 = safe(() => evalNum(dn, { [v]: av })), d2 = safe(() => evalNum(dd, { [v]: av }));
      if (!(Math.abs(n2) < 1e-12 && Math.abs(d2) < 1e-12)) break;
      N = dn; Dn = dd;
    }
  }
  // one-sided behaviour numerically
  const left = safe(() => evalNum(f, { [v]: av - 1e-7 })), right = safe(() => evalNum(f, { [v]: av + 1e-7 }));
  const big = (x) => Math.abs(x) > 1e5;
  if (dir > 0 || dir < 0) {
    const s = dir > 0 ? right : left;
    if (big(s)) { const r = s > 0 ? sym('oo') : neg(sym('oo')); steps.push({ title: 'The function grows without bound', math: `${L} ${tex(f)} = ${tex(S(r))}` }); return { value: S(r) }; }
  }
  if (big(left) || big(right)) {
    steps.push({ title: 'Check each side (the denominator approaches 0)', detail: `${v} \\to ${tex(a)}^-: \\ ${left > 0 ? '+\\infty' : '-\\infty'},\\qquad ${v} \\to ${tex(a)}^+: \\ ${right > 0 ? '+\\infty' : '-\\infty'}` });
    if (Math.sign(left) === Math.sign(right)) { const r = S(left > 0 ? sym('oo') : neg(sym('oo'))); return { value: r }; }
    steps.push({ title: 'The one-sided limits are different, so the limit does not exist' });
    return { dne: true };
  }
  const est = (left + right) / 2;
  if (Math.abs(left - right) < 1e-4 * Math.max(1, Math.abs(est))) {
    steps.push({ title: 'Estimate numerically by approaching from both sides', math: `${L} ${tex(f)} \\approx ${formatNumber(est, 6)}` });
    return { value: num(Number(est.toPrecision(6))), approx: true };
  }
  steps.push({ title: 'The left and right limits are different, so the limit does not exist', detail: `\\text{left} \\approx ${formatNumber(left, 5)},\\ \\text{right} \\approx ${formatNumber(right, 5)}` });
  return { dne: true };
}
function evalP(p, x) { let r = Q.of(0); for (let i = p.length - 1; i >= 0; i--) r = r.mul(x).add(p[i]); return r; }
const safe = (f) => { try { return f(); } catch { return NaN; } };
function limitInf(f, v, a, steps, L) {
  const sign = evalNum(a) > 0 ? 1 : -1;
  const [N, Dn] = numerDenom(f);
  const cn = polyCoeffs(N, v), cd = polyCoeffs(Dn, v);
  if (cn && cd && has(Dn, v)) {
    const n = cn.length - 1, d = cd.length - 1;
    const k = Math.max(n, d);
    steps.push({ title: `Divide the top and bottom by the highest power $${v}^{${d}}$ in the denominator`, detail: `\\text{Terms like } \\frac{c}{${v}^k} \\to 0 \\text{ as } ${v} \\to ${tex(a)}` });
    if (n < d) { steps.push({ title: 'The degree of the top is smaller than the bottom, so the limit is 0', math: `${L} ${tex(f)} = 0` }); return { value: ZERO }; }
    if (n === d) { const r = S(div(cn[n], cd[d])); steps.push({ title: 'Same degree: the limit is the ratio of the leading coefficients', math: `${L} ${tex(f)} = \\frac{${tex(cn[n])}}{${tex(cd[d])}} = ${tex(r)}` }); return { value: r }; }
    const lead = evalNum(S(div(cn[n], cd[d]))) * Math.pow(sign, n - d);
    const r = S(lead > 0 ? sym('oo') : neg(sym('oo')));
    steps.push({ title: 'The top has a higher degree, so the expression grows without bound', math: `${L} ${tex(f)} = ${tex(r)}` });
    return { value: r };
  }
  if (cn) {
    const n = cn.length - 1;
    const lead = evalNum(cn[n]) * Math.pow(sign, n);
    if (n === 0) { steps.push({ title: 'Constant', math: tex(cn[0]) }); return { value: cn[0] }; }
    const r = S(lead > 0 ? sym('oo') : neg(sym('oo')));
    steps.push({ title: 'A polynomial behaves like its leading term', math: `${L} ${tex(f)} = ${L} ${tex(S(mul(cn[n], pow(sym(v), num(n)))))} = ${tex(r)}` });
    return { value: r };
  }
  // numeric
  const xs = [1e3, 1e4, 1e5, 1e6].map((x) => x * sign);
  const ys = xs.map((x) => safe(() => evalNum(f, { [v]: x })));
  steps.push({ title: 'Evaluate for larger and larger values', detail: `\\begin{array}{c|c} ${v} & f(${v}) \\\\ \\hline ${xs.map((x, i) => `${formatNumber(x)} & ${formatNumber(ys[i], 8)}`).join(' \\\\ ')} \\end{array}` });
  const last = ys[3];
  if (Math.abs(last) > 1e8) { const r = S(last > 0 ? sym('oo') : neg(sym('oo'))); return { value: r }; }
  if (Math.abs(ys[3] - ys[2]) < 1e-4 * Math.max(1, Math.abs(last))) {
    const known = [[Math.E, E], [Math.PI, PI], [0, ZERO], [1, ONE]];
    for (const [val, node] of known) if (Math.abs(last - val) < 1e-4) { steps.push({ title: `The values approach $${tex(node)}$`, math: `${L} ${tex(f)} = ${tex(node)}` }); return { value: node }; }
    return { value: num(Number(last.toPrecision(6))), approx: true };
  }
  steps.push({ title: 'The values do not settle down, so the limit does not exist' });
  return { dne: true };
}
