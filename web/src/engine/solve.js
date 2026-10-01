// Equation / inequality / system solving with human-style steps.
import { Q, MathError, isQ, toNum, bgcd, formatNumber, nvSign } from './rational.js';
import { num, sym, add, mul, pow, fn, neg, sub, div, sqrt, simplify, expand, polyCoeffs, has, freeVars, subst, evalNum, isNum, equal, key, coeffSplit, numerDenom, ZERO, ONE, PI, E, map, allRational } from './cas.js';
import { tex, text, isNegative, negate, relTex } from './print.js';
import { toQArray, rationalRoots, deg, synthDiv, toNode, numericRoots, toIntegerPoly, polyDivide } from './poly.js';
import { factorExpr, isqrt } from './factor.js';

const S = (x) => simplify(x);
const eqTex = (l, r, op = '=') => `${tex(l)} ${relTex(op)} ${tex(r)}`;
const termsOf = (x) => (x.t === 'add' ? x.a : isNum(x, 0) ? [] : [x]);
const wrap = (x) => (x.t === 'add' || isNegative(x) ? `\\left(${tex(x)}\\right)` : tex(x));

export function chooseVar(nodes, preferred) {
  const vs = new Set();
  nodes.forEach((n) => freeVars(n, vs));
  if (preferred) return preferred;
  for (const c of ['x', 'y', 'z', 't', 'n', 'a', 'b']) if (vs.has(c)) return c;
  return [...vs].sort()[0];
}

// ---------------------------------------------------------------------------
// Single equation
// ---------------------------------------------------------------------------
export function solveEquation(lhs, rhs, v, steps, depth = 0) {
  if (depth > 6) throw new MathError('This equation is too complicated for me');
  lhs = S(lhs); rhs = S(rhs);
  const f = S(sub(lhs, rhs));
  if (!has(f, v)) {
    const val = isNum(f, 0) || (f.t === 'num' && Math.abs(toNum(f.v)) < 1e-12);
    steps.push({ title: val ? 'Both sides are always equal' : 'The two sides can never be equal', math: eqTex(lhs, rhs) });
    return { all: val, solutions: [] };
  }
  // 1. variable in a denominator -> rational equation
  if (hasVarDenominator(lhs, v) || hasVarDenominator(rhs, v)) return solveRational(lhs, rhs, v, steps, depth);
  // 2. polynomial
  const pl = polyCoeffs(lhs, v), pr = polyCoeffs(rhs, v);
  if (pl && pr) {
    const d = Math.max(pl.length, pr.length) - 1;
    if (d === 1) return solveLinear(lhs, rhs, v, steps);
    return solvePolynomial(lhs, rhs, v, steps);
  }
  // 3. special forms
  const special = solveSpecial(lhs, rhs, v, steps, depth);
  if (special) return special;
  return solveNumeric(lhs, rhs, v, steps);
}

function hasVarDenominator(x, v) {
  let found = false;
  map(x, (n) => { if (n.t === 'pow' && has(n.b, v) && n.e.t === 'num' && nvSign(n.e.v) < 0) found = true; return n; });
  return found;
}

// LCD of numeric denominators appearing in the terms
function numericLCD(x) {
  let L = 1n;
  for (const t of termsOf(expand(x))) { const [c] = coeffSplit(t); if (isQ(c)) L = (L * c.d) / bgcd(L, c.d); }
  return L;
}

function clearFractionsAndExpand(lhs, rhs, v, steps) {
  const L = (numericLCD(lhs) * numericLCD(rhs)) / bgcd(numericLCD(lhs), numericLCD(rhs));
  if (L > 1n) {
    lhs = expand(mul(num(L), lhs)); rhs = expand(mul(num(L), rhs));
    steps.push({ title: `Multiply both sides by $${L}$ to clear the fractions`, math: eqTex(lhs, rhs) });
  }
  const el = expand(lhs), er = expand(rhs);
  if (!equal(el, lhs) || !equal(er, rhs)) {
    const hadParens = key(lhs).includes('+(') || key(rhs).includes('+(');
    steps.push({ title: hadParens ? 'Distribute (multiply out the parentheses) and combine like terms' : 'Combine like terms', math: eqTex(el, er) });
  }
  return [el, er];
}

export function solveLinear(lhs, rhs, v, steps, opts = {}) {
  const op = opts.op || '=';
  let flip = false;
  [lhs, rhs] = clearFractionsAndExpand(lhs, rhs, v, steps);
  let [a1, b1] = linParts(lhs, v), [a2, b2] = linParts(rhs, v);
  // move variable terms to the left
  if (!isNum(a2, 0)) {
    const term = S(mul(a2, sym(v)));
    lhs = S(sub(lhs, term)); rhs = S(sub(rhs, term));
    steps.push({ title: `${isNegative(term) ? 'Add' : 'Subtract'} $${tex(isNegative(term) ? negate(term) : term)}$ ${isNegative(term) ? 'to' : 'from'} both sides`, math: eqTex(lhs, rhs, cur(op, flip)) });
    [a1, b1] = linParts(lhs, v); [a2, b2] = linParts(rhs, v);
  }
  if (isNum(a1, 0)) {
    const ok = checkConst(S(sub(b1, b2)), cur(op, flip));
    steps.push({ title: ok ? 'This is always true, so every number is a solution' : 'This is never true, so there is no solution', math: eqTex(lhs, rhs, cur(op, flip)) });
    return { all: ok, solutions: [], ineq: op !== '=' ? { all: ok } : undefined };
  }
  if (!isNum(b1, 0)) {
    lhs = S(sub(lhs, b1)); rhs = S(sub(rhs, b1));
    steps.push({ title: `${isNegative(b1) ? 'Add' : 'Subtract'} $${tex(isNegative(b1) ? negate(b1) : b1)}$ ${isNegative(b1) ? 'to' : 'from'} both sides`, math: eqTex(lhs, rhs, cur(op, flip)) });
  }
  [a1] = linParts(lhs, v);
  if (!isNum(a1, 1)) {
    const negCoef = a1.t === 'num' ? nvSign(a1.v) < 0 : false;
    if (negCoef && op !== '=') flip = !flip;
    rhs = S(div(rhs, a1)); lhs = sym(v);
    const title = isNum(a1, -1) ? 'Multiply both sides by $-1$' : `Divide both sides by $${tex(a1)}$`;
    steps.push({ title: title + (negCoef && op !== '=' ? ' (dividing by a negative number flips the inequality sign)' : '') + (a1.t !== 'num' ? ` (assuming $${tex(a1)} \\ne 0$)` : ''), math: eqTex(lhs, rhs, cur(op, flip)) });
  }
  return { solutions: [S(rhs)], op: cur(op, flip) };
}
const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '=': '=', '!=': '!=' };
const cur = (op, flip) => (flip ? FLIP[op] : op);
function checkConst(x, op) {
  const v = evalNum(x);
  return { '=': Math.abs(v) < 1e-12, '<': v < 0, '>': v > 0, '<=': v <= 1e-12, '>=': v >= -1e-12, '!=': Math.abs(v) > 1e-12 }[op];
}
function linParts(x, v) {
  const co = polyCoeffs(x, v);
  if (!co || co.length > 2) throw new MathError('not linear');
  return [co[1] || ZERO, co[0] || ZERO];
}

// ---------------------------------------------------------------------------
// Polynomial equations
// ---------------------------------------------------------------------------
function solvePolynomial(lhs, rhs, v, steps) {
  [lhs, rhs] = clearFractionsAndExpand(lhs, rhs, v, steps);
  let f = expand(sub(lhs, rhs));
  const co = polyCoeffs(f, v);
  const n = co.length - 1;
  // special: (expr)^n = c  where pure power, e.g. x^2 = 49 or x^3 = 8
  const nonzero = co.map((c, i) => (isNum(c, 0) ? -1 : i)).filter((i) => i >= 0);
  if (nonzero.length === 2 && nonzero[0] === 0 && allRational(co)) {
    // a x^n + c = 0  ->  x^n = -c/a
    const a = co[n].v, c = co[0].v;
    const val = c.neg().div(a);
    if (!(isNum(rhs, 0) === false && equal(lhs, S(mul(co[n], pow(sym(v), num(n))))))) steps.push({ title: `Isolate $${v}^{${n}}$`, math: eqTex(pow(sym(v), num(n)), num(val)) });
    else if (!a.isOne()) steps.push({ title: `Divide both sides by $${tex(num(a))}$`, math: eqTex(pow(sym(v), num(n)), num(val)) });
    return takeRoot(v, n, val, steps);
  }
  if (!isNum(rhs, 0)) {
    steps.push({ title: 'Move everything to one side (set the equation equal to zero)', math: eqTex(f, ZERO) });
  }
  if (allRational(co)) {
    let p = toQArray(co);
    // divide by common factor
    const [ints, scale] = toIntegerPoly(p);
    if (!scale.isOne() && !scale.eq(Q.of(-1)) && ints.length) {
      const P = ints.map((c) => new Q(c));
      steps.push({ title: `Divide both sides by $${tex(num(scale))}$`, math: eqTex(toNode(P, v), ZERO) });
      p = P;
    } else if (scale.eq(Q.of(-1))) { p = ints.map((c) => new Q(c)); steps.push({ title: 'Multiply both sides by $-1$', math: eqTex(toNode(p, v), ZERO) }); }
    if (deg(p) === 2) return solveQuadratic(p, v, steps);
    return solveHigher(p, v, steps);
  }
  // symbolic coefficients quadratic
  if (n === 2) return solveQuadraticSymbolic(co, v, steps);
  return solveNumeric(lhs, rhs, v, steps);
}

function takeRoot(v, n, val, steps) {
  const X = sym(v);
  if (n % 2 === 0) {
    if (val.sign() < 0) {
      const r = S(pow(num(val.neg()), num(new Q(1n, BigInt(n)))));
      steps.push({ title: `An even power can't be negative, so there are no real solutions`, detail: n === 2 ? `\\text{Complex solutions: } ${v} = \\pm ${wrap(r)}\\,i` : '' });
      return { solutions: [], complex: n === 2 ? [S(mul(r, sym('i'))), S(mul(num(-1), r, sym('i')))] : [] };
    }
    const r = S(pow(num(val), num(new Q(1n, BigInt(n)))));
    steps.push({ title: `Take the ${n === 2 ? 'square' : n + 'th'} root of both sides (remember $\\pm$)`, math: `${v} = \\pm ${n === 2 ? `\\sqrt{${tex(num(val))}}` : `\\sqrt[${n}]{${tex(num(val))}}`}${tex(r) !== (n === 2 ? `\\sqrt{${tex(num(val))}}` : '') ? ` = \\pm ${tex(r)}` : ''}` });
    if (val.isZero()) return { solutions: [ZERO] };
    return { solutions: [S(neg(r)), r] };
  }
  const r = S(pow(num(val), num(new Q(1n, BigInt(n)))));
  steps.push({ title: `Take the ${n === 3 ? 'cube' : n + 'th'} root of both sides`, math: `${v} = \\sqrt[${n}]{${tex(num(val))}} = ${tex(r)}` });
  return { solutions: [r] };
}

export function quadRootNodes(a, b, c) {
  // a,b,c: Q. returns { D, roots: [node,node] (or complex) , real:boolean }
  const D = b.mul(b).sub(Q.of(4).mul(a).mul(c));
  const twoA = Q.of(2).mul(a);
  if (D.sign() >= 0 && a.isInt() && b.isInt() && c.isInt()) {
    const sD = S(sqrt(num(D)));
    const [k, rad] = coeffSplit(sD);
    if (rad && isQ(k) && k.isInt()) {
      let g = bgcd(bgcd(b.n, k.n), twoA.n);
      if (twoA.sign() < 0) g = -g;
      const B = b.neg().div(Q.of(g)), K = k.div(Q.of(g)), A2 = twoA.div(Q.of(g));
      const mk = (sg) => S(div(add(num(B), mul(num(sg < 0 ? K.neg() : K), rad)), num(A2)));
      return { D, real: true, roots: [mk(-1), mk(1)].sort((p, q) => evalNum(p) - evalNum(q)) };
    }
  }
  if (D.sign() >= 0) {
    const sD = S(sqrt(num(D)));
    const r1 = S(div(add(num(b.neg()), neg(sD)), num(twoA)));
    const r2 = S(div(add(num(b.neg()), sD), num(twoA)));
    return { D, real: true, roots: D.isZero() ? [r1] : [r1, r2].sort((p, q) => evalNum(p) - evalNum(q)) };
  }
  const sD = S(sqrt(num(D.neg())));
  const re = S(num(b.neg().div(twoA))), im = S(div(sD, num(twoA.abs())));
  return { D, real: false, roots: [], complex: [S(add(re, mul(im, sym('i')))), S(sub(re, mul(im, sym('i'))))] };
}

function solveQuadratic(p, v, steps) {
  const [c, b, a] = p;
  const X = sym(v);
  // c == 0 -> factor out x
  if (c.isZero()) {
    const inner = toNode([b, a], v);
    steps.push({ title: `Factor out $${v}$`, math: `${v}\\left(${tex(inner)}\\right) = 0` });
    steps.push({ title: 'Zero product property: set each factor equal to zero', math: `${v} = 0 \\quad\\text{or}\\quad ${tex(inner)} = 0` });
    const r = S(num(b.neg().div(a)));
    if (!a.isOne() || !b.isZero()) steps.push({ title: `Solve $${tex(inner)} = 0$`, math: `${v} = ${tex(r)}` });
    return { solutions: sortNodes([ZERO, r]) };
  }
  if (b.isZero()) {
    const val = c.neg().div(a);
    steps.push({ title: `Isolate $${v}^2$`, math: `${v}^{2} = ${tex(num(val))}` });
    return takeRoot(v, 2, val, steps);
  }
  const D = b.mul(b).sub(Q.of(4).mul(a).mul(c));
  const ints = toIntegerPoly(p)[0];
  const intD = ints[1] * ints[1] - 4n * ints[2] * ints[0];
  if (D.sign() >= 0 && isqrt(intD) !== null) {
    // factorable
    const fsteps = [];
    const { result } = factorExpr(toNode(p, v), fsteps);
    fsteps.slice(1).forEach((s) => steps.push({ ...s, math: s.math ? s.math + ' = 0' : undefined }));
    const factors = result.t === 'mul' ? result.a.filter((f) => has(f, v)) : [result];
    const base = factors.map((f) => (f.t === 'pow' ? f.b : f));
    if (base.length > 1) steps.push({ title: 'Zero product property: set each factor equal to zero', math: base.map((f) => `${tex(f)} = 0`).join(' \\quad\\text{or}\\quad ') });
    else steps.push({ title: 'Set the repeated factor equal to zero', math: `${tex(base[0])} = 0` });
    const sols = [];
    for (const f of base) {
      const [k, m] = linParts(f, v);
      const r = S(div(neg(m), k));
      sols.push(r);
    }
    steps.push({ title: 'Solve each one', math: sols.map((r) => `${v} = ${tex(r)}`).join(' \\quad\\text{or}\\quad ') });
    return { solutions: sortNodes(dedupe(sols)) };
  }
  // quadratic formula
  steps.push({ title: 'Use the quadratic formula', math: `${v} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}`, detail: `a = ${tex(num(a))},\\quad b = ${tex(num(b))},\\quad c = ${tex(num(c))}` });
  const pa = (q) => (q.sign() < 0 || !q.isInt() ? `\\left(${tex(num(q))}\\right)` : tex(num(q)));
  steps.push({ title: 'Substitute the values', math: `${v} = \\frac{-${pa(b)} \\pm \\sqrt{${pa(b)}^2 - 4 \\cdot ${pa(a)} \\cdot ${pa(c)}}}{2 \\cdot ${pa(a)}}` });
  const twoA = Q.of(2).mul(a);
  steps.push({ title: 'Simplify the discriminant', math: `${v} = \\frac{${tex(num(b.neg()))} \\pm \\sqrt{${tex(num(D))}}}{${tex(num(twoA))}}`, detail: `b^2 - 4ac = ${tex(num(b.mul(b)))} - ${pa(Q.of(4).mul(a).mul(c))} = ${tex(num(D))}` });
  const res = quadRootNodes(a, b, c);
  if (!res.real) {
    const sD = S(sqrt(num(D.neg())));
    steps.push({ title: 'The discriminant is negative, so there are no real solutions. Using $\\sqrt{-1} = i$:', math: `${v} = \\frac{${tex(num(b.neg()))} \\pm ${tex(sD)}\\,i}{${tex(num(twoA))}}`, detail: res.complex.map((z) => `${v} = ${tex(z)}`).join(',\\quad ') });
    return { solutions: [], complex: res.complex };
  }
  const sD = S(sqrt(num(D)));
  if (tex(sD) !== `\\sqrt{${tex(num(D))}}`) steps.push({ title: 'Simplify the square root', math: `\\sqrt{${tex(num(D))}} = ${tex(sD)}` });
  steps.push({ title: 'Write the two solutions', math: res.roots.map((r) => `${v} = ${tex(r)} \\approx ${formatNumber(evalNum(r), 6)}`).join(' \\quad\\text{or}\\quad ') });
  return { solutions: res.roots };
}

function solveQuadraticSymbolic(co, v, steps) {
  const [c, b, a] = co;
  steps.push({ title: 'Use the quadratic formula', math: `${v} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}`, detail: `a = ${tex(a)},\\quad b = ${tex(b)},\\quad c = ${tex(c)}` });
  const D = expand(sub(mul(b, b), mul(num(4), a, c)));
  const r1 = S(div(sub(neg(b), sqrt(D)), mul(num(2), a))), r2 = S(div(add(neg(b), sqrt(D)), mul(num(2), a)));
  steps.push({ title: 'Simplify', math: `${v} = \\frac{${tex(S(neg(b)))} \\pm \\sqrt{${tex(D)}}}{${tex(S(mul(num(2), a)))}}` });
  return { solutions: [r1, r2] };
}

function solveHigher(p, v, steps) {
  const n = deg(p);
  // biquadratic
  if (n === 4 && p[1].isZero() && p[3].isZero()) {
    steps.push({ title: `Substitute $u = ${v}^2$ to get a quadratic`, math: eqTex(toNode([p[0], p[2], p[4]], 'u'), ZERO) });
    const sub = solveQuadratic([p[0], p[2], p[4]], 'u', steps);
    const sols = [];
    for (const u of sub.solutions) {
      const uv = evalNum(u);
      if (uv < -1e-12) { steps.push({ title: `$${v}^2 = ${tex(u)}$ has no real solutions` }); continue; }
      const r = S(sqrt(u));
      steps.push({ title: `Solve $${v}^2 = ${tex(u)}$`, math: `${v} = \\pm ${tex(r)}` });
      if (isNum(r, 0)) sols.push(ZERO); else sols.push(S(neg(r)), r);
    }
    return { solutions: sortNodes(dedupe(sols)) };
  }
  // factor out x^k
  let k = 0; while (p[k].isZero()) k++;
  const sols = [];
  if (k > 0) {
    const rest = p.slice(k);
    steps.push({ title: `Factor out $${v}${k > 1 ? `^{${k}}` : ''}$`, math: `${k > 1 ? `${v}^{${k}}` : v}\\left(${tex(toNode(rest, v))}\\right) = 0` });
    steps.push({ title: `So $${v} = 0$ or $${tex(toNode(rest, v))} = 0$` });
    sols.push(ZERO);
    p = rest;
    if (deg(p) === 2) { const r = solveQuadratic(p, v, steps); return { ...r, solutions: sortNodes(dedupe([...sols, ...r.solutions])) }; }
    if (deg(p) === 1) { sols.push(S(num(p[0].neg().div(p[1])))); steps.push({ title: 'Solve the linear factor', math: `${v} = ${tex(sols[1])}` }); return { solutions: sortNodes(sols) }; }
  }
  const { roots } = rationalRoots(p);
  if (roots.length) {
    steps.push({ title: 'Rational Root Theorem: test $\\pm\\frac{p}{q}$ where $p$ divides the constant and $q$ divides the leading coefficient', detail: roots.map((r) => `f(${tex(num(r))}) = 0`).join(',\\quad ') });
    let cur = p;
    for (const r of roots) {
      if (deg(cur) <= 2) break;
      const { quot } = synthDiv(cur, r);
      steps.push({ title: `Divide by $(${tex(S(sub(sym(v), num(r))))})$ using synthetic division`, math: `\\left(${tex(S(sub(sym(v), num(r))))}\\right)\\left(${tex(toNode(quot, v))}\\right) = 0` });
      sols.push(num(r)); cur = quot;
    }
    if (deg(cur) === 2) { const r = solveQuadratic(cur, v, steps); return { solutions: sortNodes(dedupe([...sols, ...r.solutions])), complex: r.complex }; }
    if (deg(cur) === 1) { sols.push(S(num(cur[0].neg().div(cur[1])))); return { solutions: sortNodes(dedupe(sols)) }; }
    return { solutions: sortNodes(dedupe([...sols, ...numericReal(cur)])) };
  }
  const real = numericReal(p);
  steps.push({ title: 'This polynomial has no rational roots, so we find the roots numerically (Newton’s method)', detail: real.length ? real.map((r) => `${v} \\approx ${tex(r)}`).join(',\\quad ') : '\\text{No real roots}' });
  return { solutions: sortNodes([...sols, ...real]), approximate: true };
}
function numericReal(p) {
  return numericRoots(p).filter(([, im]) => Math.abs(im) < 1e-8).map(([re]) => num(Number(re.toPrecision(12))));
}
function dedupe(nodes) { const seen = new Set(); return nodes.filter((n) => { const k = key(S(n)); if (seen.has(k)) return false; seen.add(k); return true; }); }
function sortNodes(nodes) { return nodes.slice().sort((a, b) => { try { return evalNum(a) - evalNum(b); } catch { return 0; } }); }

// ---------------------------------------------------------------------------
// Rational equations
// ---------------------------------------------------------------------------
function denominatorsWithVar(x, v, out = []) {
  map(x, (n) => {
    if (n.t === 'pow' && has(n.b, v) && n.e.t === 'num' && nvSign(n.e.v) < 0) {
      const e = isQ(n.e.v) ? n.e.v.neg() : -n.e.v;
      const d = S(pow(n.b, num(e)));
      if (!out.some((o) => equal(o, d))) out.push(d);
    }
    return n;
  });
  return out;
}
function solveRational(lhs, rhs, v, steps, depth) {
  const dens = denominatorsWithVar(lhs, v); denominatorsWithVar(rhs, v, dens);
  // factor denominators to find a smaller LCD
  const factorSet = [];
  for (const d of dens) {
    let fd; try { fd = factorExpr(d, []).result; } catch { fd = d; }
    const fs = fd.t === 'mul' ? fd.a : [fd];
    for (const f of fs) {
      const [b, e] = f.t === 'pow' && isNum(f.e) ? [f.b, toNum(f.e.v)] : [f, 1];
      if (!has(b, v)) continue;
      const ex = factorSet.find((g) => equal(g.b, b));
      if (ex) ex.e = Math.max(ex.e, e); else factorSet.push({ b, e });
    }
  }
  const lcdOf = (x) => { let L = 1n; for (const t of termsOf(S(x))) { const [, d] = numerDenom(t); const [c] = coeffSplit(d); if (isQ(c) && c.isInt()) L = (L * c.n) / bgcd(L, c.n); } return L; };
  const nL = lcdOf(lhs), nR = lcdOf(rhs), numL = (nL * nR) / bgcd(nL, nR);
  const LCD = S(mul(num(numL), ...factorSet.map(({ b, e }) => (e === 1 ? b : pow(b, num(e))))));
  const excluded = [];
  steps.push({ title: `Note the restriction: denominators can't be zero`, math: factorSet.map(({ b }) => `${tex(b)} \\ne 0`).join(',\\quad ') });
  for (const { b } of factorSet) { try { const r = solveEquation(b, ZERO, v, [], depth + 1); excluded.push(...r.solutions); } catch { /* ignore */ } }
  const nl = mulClear(lhs, LCD, v), nr = mulClear(rhs, LCD, v);
  steps.push({ title: `Multiply both sides by the LCD $${tex(LCD)}$`, math: eqTex(nl, nr) });
  if (hasVarDenominator(nl, v) || hasVarDenominator(nr, v)) throw new MathError('Could not clear the denominators');
  const res = solveEquation(nl, nr, v, steps, depth + 1);
  return checkSolutions(res, lhs, rhs, v, steps, excluded);
}
// multiply an expression by the LCD term by term, cancelling denominators exactly
function mulClear(x, LCD, v) {
  const out = [];
  for (const t of termsOf(S(x))) {
    const [N, Dn] = numerDenom(t);
    if (!has(Dn, v)) { out.push(expand(mul(t, LCD))); continue; }
    const cl = polyCoeffs(LCD, v), cd = polyCoeffs(Dn, v);
    const pl = cl && toQArray(cl), pd = cd && toQArray(cd);
    if (pl && pd) {
      const [q, r] = polyDivide(pl, pd);
      if (r.every((c) => c.isZero())) { out.push(expand(mul(N, toNode(q, v)))); continue; }
    }
    out.push(expand(S(mul(t, LCD))));
  }
  return S(add(out.length ? out : [ZERO]));
}
function checkSolutions(res, lhs, rhs, v, steps, excluded = []) {
  if (!res.solutions || !res.solutions.length) return res;
  const good = [], bad = [];
  for (const s of res.solutions) {
    let ok = true;
    try {
      const sv = evalNum(s);
      if (excluded.some((e) => Math.abs(evalNum(e) - sv) < 1e-9)) ok = false;
      else {
        const l = evalNum(lhs, { [v]: sv }), r = evalNum(rhs, { [v]: sv });
        ok = Number.isFinite(l) && Number.isFinite(r) && Math.abs(l - r) < 1e-7 * Math.max(1, Math.abs(l), Math.abs(r));
      }
    } catch { ok = !has(s, v); }
    (ok ? good : bad).push(s);
  }
  steps.push({ title: bad.length ? 'Check the answers in the original equation (reject extraneous solutions)' : 'Check the answers in the original equation', detail: [...good.map((s) => `${v} = ${tex(s)} \\;\\checkmark`), ...bad.map((s) => `${v} = ${tex(s)} \\;\\text{✗ (doesn't work)}`)].join(',\\quad ') });
  return { ...res, solutions: good };
}

// ---------------------------------------------------------------------------
// Radicals, absolute values, exponentials, logarithms, trig
// ---------------------------------------------------------------------------
function isolate(lhs, rhs, v, pred) {
  // keep terms satisfying pred on the left, move the rest to the right
  const all = [...termsOf(S(lhs)), ...termsOf(S(rhs)).map((t) => S(neg(t)))];
  const keep = all.filter(pred), move = all.filter((t) => !pred(t));
  return [S(add(keep)), expand(neg(add(move.length ? move : [ZERO])))];
}
const findAll = (x, test) => { const out = []; map(x, (n) => { if (test(n)) out.push(n); return n; }); return out; };

function solveSpecial(lhs, rhs, v, steps, depth) {
  const f = S(sub(lhs, rhs));
  // substitution: polynomial in a single "kernel" (e^x, sin x, ln x, sqrt x ...)
  const kernels = findAll(f, (n) => has(n, v) && ((n.t === 'fn' && n.n !== 'abs') || (n.t === 'pow' && !has(n.e, v) === false) || (n.t === 'pow' && n.e.t === 'num' && isQ(n.e.v) && !n.e.v.isInt())));
  const uniq = dedupe(kernels.map(baseKernel)).filter((k) => !(k.t === 'sym'));
  // ---- absolute value ----
  const abs = findAll(f, (n) => n.t === 'fn' && n.n === 'abs' && has(n, v));
  if (abs.length === 1) {
    const A = abs[0];
    const [L, R] = isolate(lhs, rhs, v, (t) => has(t, v) && containsNode(t, A));
    let l = L, r = R;
    const [c, rest] = coeffSplit(l);
    if (rest && equal(rest, A) && !(isQ(c) && c.isOne())) { r = S(div(r, num(c))); l = A; }
    if (equal(l, A)) {
      if (!(equal(l, S(lhs)) && equal(r, S(rhs)))) steps.push({ title: 'Isolate the absolute value', math: eqTex(l, r) });
      if (!has(r, v) && evalNum(r) < 0) { steps.push({ title: 'An absolute value can never be negative, so there is no solution' }); return { solutions: [] }; }
      const inner = A.a[0];
      steps.push({ title: 'Split into two cases', math: `${tex(inner)} = ${tex(r)} \\quad\\text{or}\\quad ${tex(inner)} = ${tex(S(neg(r)))}` });
      steps.push({ title: 'Case 1', math: eqTex(inner, r) });
      const r1 = solveEquation(inner, r, v, steps, depth + 1);
      steps.push({ title: 'Case 2', math: eqTex(inner, S(neg(r))) });
      const r2 = solveEquation(inner, S(neg(r)), v, steps, depth + 1);
      return checkSolutions({ solutions: sortNodes(dedupe([...r1.solutions, ...r2.solutions])) }, lhs, rhs, v, steps);
    }
  }
  // ---- radicals ----
  const rads = findAll(f, (n) => n.t === 'pow' && has(n.b, v) && n.e.t === 'num' && isQ(n.e.v) && !n.e.v.isInt());
  if (rads.length) {
    const Rd = rads[0];
    const [L, R] = isolate(lhs, rhs, v, (t) => containsNode(t, Rd));
    let l = L, r = R;
    const [c, rest] = coeffSplit(l);
    if (rest && !(isQ(c) && c.isOne()) && l.t !== 'add') { l = rest; r = S(div(r, num(c))); }
    if (l.t !== 'add') {
      if (!(equal(l, S(lhs)) && equal(r, S(rhs)))) steps.push({ title: 'Isolate the radical', math: eqTex(l, r) });
      const k = Rd.e.v.d; // root index
      const nl = S(pow(l, num(Number(k)))), nr = expand(pow(r, num(Number(k))));
      steps.push({ title: k === 2n ? 'Square both sides' : `Raise both sides to the power ${k}`, math: eqTex(nl, nr) });
      const res = solveEquation(nl, nr, v, steps, depth + 1);
      return checkSolutions(res, lhs, rhs, v, steps);
    }
  }
  // ---- exponentials a^(g(x)) ----
  const exps = findAll(f, (n) => n.t === 'pow' && !has(n.b, v) && has(n.e, v));
  if (exps.length) {
    // same-kernel substitution like e^(2x) - 3e^x + 2 = 0
    const sub1 = trySubstitution(lhs, rhs, v, steps, depth, exps);
    if (sub1) return sub1;
    const [L, R] = isolate(lhs, rhs, v, (t) => has(t, v));
    let l = L, r = R;
    const [c, rest] = coeffSplit(l);
    if (rest && rest.t === 'pow' && !has(rest.b, v) && !(isQ(c) && c.isOne())) { l = rest; r = S(div(r, num(c))); steps.push({ title: `Divide both sides by $${tex(num(c))}$`, math: eqTex(l, r) }); }
    if (l.t === 'pow' && !has(l.b, v) && !has(r, v)) {
      if (!(equal(l, S(lhs)) && equal(r, S(rhs)))) steps.push({ title: 'Isolate the exponential', math: eqTex(l, r) });
      const rv = evalNum(r);
      if (rv <= 0) { steps.push({ title: 'A positive base raised to any power is always positive, so there is no solution' }); return { solutions: [] }; }
      // same base?
      const lg = S(fn('log', r, l.b));
      if (lg.t === 'num' && isQ(lg.v)) {
        steps.push({ title: `Write $${tex(r)}$ as a power of $${tex(l.b)}$`, math: eqTex(l, pow(l.b, lg)) });
        steps.push({ title: 'The bases are equal, so the exponents are equal', math: eqTex(l.e, lg) });
        return solveEquation(l.e, lg, v, steps, depth + 1);
      }
      const isE = l.b.t === 'sym' && l.b.n === 'e';
      const rhsLog = isE ? S(fn('ln', r)) : S(div(fn('ln', r), fn('ln', l.b)));
      steps.push({ title: isE ? 'Take the natural log of both sides' : 'Take the logarithm of both sides', math: isE ? eqTex(l.e, rhsLog) : `${wrap(l.e)} \\ln\\left(${tex(l.b)}\\right) = \\ln\\left(${tex(r)}\\right)` });
      if (!isE) steps.push({ title: `Divide by $\\ln(${tex(l.b)})$`, math: eqTex(l.e, rhsLog) });
      const res = solveEquation(l.e, rhsLog, v, steps, depth + 1);
      return { ...res, approxNote: true };
    }
    // a^g = b^h  -> take ln
    if (L.t === 'pow' && R.t === 'pow' && !has(L.b, v) && !has(R.b, v)) {
      const nl = expand(mul(L.e, fn('ln', L.b))), nr = expand(mul(R.e, fn('ln', R.b)));
      steps.push({ title: 'Take the natural log of both sides: $\\ln(a^b) = b\\ln(a)$', math: `${wrap(L.e)}\\ln\\left(${tex(L.b)}\\right) = ${wrap(R.e)}\\ln\\left(${tex(R.b)}\\right)` });
      return solveEquation(nl, nr, v, steps, depth + 1);
    }
  }
  // ---- logarithms ----
  const logs = findAll(f, (n) => n.t === 'fn' && (n.n === 'ln' || n.n === 'log') && has(n.a[0], v));
  if (logs.length) {
    const [L0, R0] = isolate(lhs, rhs, v, (t) => has(t, v));
    let L = combineLogs(L0), R = R0;
    if (!equal(L, L0)) steps.push({ title: 'Combine the logarithms: $\\log a + \\log b = \\log(ab)$, $\\log a - \\log b = \\log\\frac{a}{b}$', math: eqTex(L, R) });
    else if (!(equal(L, S(lhs)) && equal(R, S(rhs)))) steps.push({ title: 'Isolate the logarithm', math: eqTex(L, R) });
    const [c, rest] = coeffSplit(L);
    if (rest && !(isQ(c) && c.isOne()) && rest.t === 'fn') { L = rest; R = S(div(R, num(c))); steps.push({ title: `Divide both sides by $${tex(num(c))}$`, math: eqTex(L, R) }); }
    if (L.t === 'fn' && (L.n === 'ln' || L.n === 'log') && !has(R, v)) {
      const base = L.n === 'ln' ? E : L.a[1];
      const nr = S(pow(base, R));
      steps.push({ title: 'Rewrite in exponential form: $\\log_b(y) = c \\iff y = b^c$', math: eqTex(L.a[0], nr) });
      const res = solveEquation(L.a[0], nr, v, steps, depth + 1);
      return checkSolutions(res, lhs, rhs, v, steps);
    }
    // log(a) = log(b) same base
    const RR = combineLogs(R);
    if (L.t === 'fn' && RR.t === 'fn' && L.n === RR.n && (L.n === 'ln' || equal(L.a[1], RR.a[1]))) {
      steps.push({ title: 'The logs have the same base, so their arguments are equal', math: eqTex(L.a[0], RR.a[0]) });
      const res = solveEquation(L.a[0], RR.a[0], v, steps, depth + 1);
      return checkSolutions(res, lhs, rhs, v, steps);
    }
  }
  // ---- substitution for trig/other kernels ----
  const subst1 = trySubstitution(lhs, rhs, v, steps, depth, uniq);
  if (subst1) return subst1;
  // ---- single trig function ----
  const trigs = findAll(f, (n) => n.t === 'fn' && ['sin', 'cos', 'tan'].includes(n.n) && has(n, v));
  if (trigs.length) {
    const T = trigs[0];
    if (trigs.every((t) => equal(t, T))) {
      const [L, R] = isolate(lhs, rhs, v, (t) => containsNode(t, T));
      let l = L, r = R;
      const [c, rest] = coeffSplit(l);
      if (rest && equal(rest, T)) { l = T; r = S(div(r, num(c))); }
      if (equal(l, T) && !has(r, v)) {
        if (!(equal(l, S(lhs)) && equal(r, S(rhs)))) steps.push({ title: `Isolate $\\${T.n}$`, math: eqTex(l, r) });
        return solveTrig(T, r, v, steps, depth);
      }
    }
  }
  return null;
}
function baseKernel(n) { return n; }
function containsNode(x, target) { let found = false; const k = key(target); map(x, (n) => { if (key(n) === k) found = true; return n; }); return found; }

function trySubstitution(lhs, rhs, v, steps, depth, cands) {
  const f = expand(sub(lhs, rhs));
  for (const k0 of cands) {
    // the kernel for exponentials: base^(v) with linear exponent; use smallest
    let k = k0;
    if (k.t === 'pow' && !has(k.b, v) && has(k.e, v)) {
      const co = polyCoeffs(k.e, v); if (!co || co.length !== 2 || !isNum(co[0], 0)) continue;
      k = pow(k.b, sym(v));
    }
    const U = sym('u');
    // replace occurrences: base^(m x) -> u^m ; trig(x)^n -> u^n
    const replaced = expand(map(f, (n) => {
      if (equal(n, k)) return U;
      if (k.t === 'pow' && n.t === 'pow' && equal(n.b, k.b) && has(n.e, v)) {
        const m = S(div(n.e, sym(v)));
        if (m.t === 'num') return pow(U, m);
      }
      return n;
    }));
    if (has(replaced, v)) continue;
    const co = polyCoeffs(replaced, 'u');
    if (!co || co.length < 3) continue;
    steps.push({ title: `Substitute $u = ${tex(k)}$`, math: eqTex(replaced, ZERO) });
    const r = solveEquation(replaced, ZERO, 'u', steps, depth + 1);
    const sols = [], general = [];
    for (const uval of r.solutions) {
      steps.push({ title: `Solve $${tex(k)} = ${tex(uval)}$`, math: eqTex(k, uval) });
      try {
        const rr = solveEquation(k, uval, v, steps, depth + 1);
        sols.push(...rr.solutions);
        if (rr.general) general.push(...rr.general);
      } catch (e) { steps.push({ title: 'No solution from this case' }); }
    }
    const out = { solutions: sortNodes(dedupe(sols)) };
    if (general.length) {
      // drop families that are the same angle (mod 2π), e.g. -π/2 and 3π/2
      const seen = [];
      out.general = dedupe(general).filter((g) => {
        let v; try { v = evalNum(g, { k: 0 }); } catch { return true; }
        const r = ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (seen.some((q) => Math.abs(q - r) < 1e-9 || Math.abs(Math.abs(q - r) - 2 * Math.PI) < 1e-9)) return false;
        seen.push(r); return true;
      });
    }
    return out;
  }
  return null;
}

function combineLogs(x) {
  x = S(x);
  if (x.t !== 'add') return x;
  const groups = new Map(); const others = [];
  for (const t of x.a) {
    const [c, rest] = coeffSplit(t);
    if (rest && rest.t === 'fn' && (rest.n === 'ln' || rest.n === 'log') && isQ(c) && c.isInt()) {
      const k = rest.n === 'ln' ? 'ln' : 'log' + key(rest.a[1]);
      if (!groups.has(k)) groups.set(k, { node: rest, parts: [] });
      groups.get(k).parts.push(pow(rest.a[0], num(c)));
    } else others.push(t);
  }
  const out = [...others];
  for (const { node, parts } of groups.values()) out.push(fn(node.n, S(mul(parts)), ...node.a.slice(1)));
  return S(add(out));
}

function solveTrig(T, r, v, steps, depth) {
  const name = T.n, inner = T.a[0];
  const rv = evalNum(r);
  if ((name === 'sin' || name === 'cos') && Math.abs(rv) > 1) { steps.push({ title: `$\\${name}$ is always between $-1$ and $1$, so there is no solution` }); return { solutions: [] }; }
  const principal = S(fn('a' + name, r));
  const k = sym('k');
  let gen;
  if (name === 'sin') gen = [S(add(principal, mul(num(2), PI, k))), S(add(sub(PI, principal), mul(num(2), PI, k)))];
  else if (name === 'cos') gen = [S(add(principal, mul(num(2), PI, k))), S(add(neg(principal), mul(num(2), PI, k)))];
  else gen = [S(add(principal, mul(PI, k)))];
  gen = dedupe(gen);
  steps.push({ title: `Use the inverse ${name}: $\\arc${name}\\left(${tex(r)}\\right) = ${tex(principal)}$`, math: gen.map((g) => `${tex(inner)} = ${tex(g)}`).join(' \\quad\\text{or}\\quad ') , detail: `\\text{where } k \\text{ is any integer}` });
  const general = [];
  for (const g of gen) {
    if (equal(inner, sym(v))) { general.push(g); continue; }
    const st = [];
    const res = solveEquation(inner, g, v, st, depth + 1);
    general.push(...res.solutions);
  }
  if (!equal(inner, sym(v))) steps.push({ title: `Solve for $${v}$`, math: general.map((g) => `${v} = ${tex(g)}`).join(' \\quad\\text{or}\\quad ') });
  // particular solutions in [0, 2pi)
  const parts = [];
  for (const g of general) for (let kk = -4; kk <= 8; kk++) {
    const val = evalNum(g, { k: kk });
    if (val >= -1e-12 && val < 2 * Math.PI - 1e-9) { const node = S(subst(g, 'k', num(kk))); if (!parts.some((p) => Math.abs(evalNum(p) - val) < 1e-9)) parts.push(node); }
  }
  parts.sort((a, b) => evalNum(a) - evalNum(b));
  if (parts.length) steps.push({ title: `Solutions in one full turn $[0, 2\\pi)$`, math: parts.map((p) => `${v} = ${tex(p)}`).join(',\\quad ') });
  return { solutions: parts, general };
}

// ---------------------------------------------------------------------------
// Numeric fallback
// ---------------------------------------------------------------------------
export function solveNumeric(lhs, rhs, v, steps) {
  const f = S(sub(lhs, rhs));
  const F = (x) => { try { return evalNum(f, { [v]: x }); } catch { return NaN; } };
  const roots = [];
  const scan = (a, b, n) => {
    let px = a, py = F(a);
    for (let i = 1; i <= n; i++) {
      const x = a + ((b - a) * i) / n, y = F(x);
      if (Number.isFinite(py) && Number.isFinite(y)) {
        if (py === 0) roots.push(px);
        else if (py * y < 0) {
          let lo = px, hi = x, flo = py;
          for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2, fm = F(m); if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; } }
          const r = (lo + hi) / 2;
          if (Math.abs(F(r)) < 1e-6 * Math.max(1, Math.abs(F(px)), Math.abs(F(x)))) roots.push(r);
        }
      }
      px = x; py = y;
    }
  };
  scan(-20, 20, 4000); scan(-1000, -20, 2000); scan(20, 1000, 2000);
  const uniq = [];
  for (const r of roots.sort((a, b) => a - b)) if (!uniq.some((u) => Math.abs(u - r) < 1e-7)) uniq.push(r);
  steps.push({ title: 'This equation can’t be solved with algebra alone, so we find the solutions numerically', detail: `\\text{Graph } f(${v}) = ${tex(f)} \\text{ and find where it crosses zero (bisection method)}` });
  if (uniq.length > 12) {
    steps.push({ title: 'There are many (possibly infinitely many) solutions. Showing a few:' });
  }
  const sols = uniq.slice(0, 12).map((r) => num(Number(r.toPrecision(10))));
  if (sols.length) steps.push({ title: 'Approximate solutions', math: sols.map((s) => `${v} \\approx ${tex(s)}`).join(',\\quad ') });
  else steps.push({ title: 'No real solutions were found' });
  return { solutions: sols, approximate: true };
}

// ---------------------------------------------------------------------------
// Inequalities
// ---------------------------------------------------------------------------
export function solveInequality(lhs, op, rhs, v, steps) {
  lhs = S(lhs); rhs = S(rhs);
  // absolute value |g| < c
  const f = S(sub(lhs, rhs));
  const absN = findAll(f, (n) => n.t === 'fn' && n.n === 'abs' && has(n, v));
  if (absN.length === 1 && !has(rhs, v) && lhs.t === 'fn' && lhs.n === 'abs') {
    const g = lhs.a[0], c = rhs;
    if (op === '<' || op === '<=') {
      steps.push({ title: `$|A| ${relTex(op)} c$ means $-c ${relTex(op)} A ${relTex(op)} c$`, math: `${tex(S(neg(c)))} ${relTex(op)} ${tex(g)} ${relTex(op)} ${tex(c)}` });
      return solveCompound([S(neg(c)), g, c], [op, op], v, steps);
    }
    steps.push({ title: `$|A| ${relTex(op)} c$ means $A ${relTex(FLIP[op])} -c$ or $A ${relTex(op)} c$`, math: `${tex(g)} ${relTex(FLIP[op])} ${tex(S(neg(c)))} \\quad\\text{or}\\quad ${tex(g)} ${relTex(op)} ${tex(c)}` });
    const s1 = [], s2 = [];
    const a = solveInequality(g, FLIP[op], S(neg(c)), v, s1), b = solveInequality(g, op, c, v, s2);
    s1.forEach((s) => steps.push({ ...s, title: 'Part 1: ' + s.title })); s2.forEach((s) => steps.push({ ...s, title: 'Part 2: ' + s.title }));
    return { intervals: unionIntervals([...a.intervals, ...b.intervals]) };
  }
  const pl = polyCoeffs(lhs, v), pr = polyCoeffs(rhs, v);
  if (pl && pr && Math.max(pl.length, pr.length) === 2) {
    const res = solveLinear(lhs, rhs, v, steps, { op });
    if (res.ineq) return { intervals: res.ineq.all ? [[-Infinity, Infinity, false, false]] : [] };
    return { intervals: [intervalFrom(res.op, res.solutions[0])] };
  }
  // polynomial / rational: sign chart
  const [N, D] = numerDenom(f);
  steps.push({ title: 'Move everything to one side', math: `${tex(f)} ${relTex(op)} 0` });
  const crit = [];
  const zerosOf = (x) => { if (!has(x, v)) return []; const st = []; try { return solveEquation(x, ZERO, v, st).solutions; } catch { return []; } };
  const nz = zerosOf(N), dz = zerosOf(D);
  nz.forEach((z) => crit.push({ x: evalNum(z), node: z, den: false }));
  dz.forEach((z) => crit.push({ x: evalNum(z), node: z, den: true }));
  crit.sort((a, b) => a.x - b.x);
  const uniqC = []; for (const c of crit) { const u = uniqC.find((d) => Math.abs(d.x - c.x) < 1e-9); if (u) u.den = u.den || c.den; else uniqC.push(c); }
  steps.push({ title: 'Find the critical points (where the expression is zero or undefined)', math: uniqC.length ? uniqC.map((c) => `${v} = ${tex(c.node)}${c.den ? '\\ (\\text{undefined})' : ''}`).join(',\\quad ') : '\\text{none}' });
  const F = (x) => evalNum(f, { [v]: x });
  const pts = [-Infinity, ...uniqC.map((c) => c.x), Infinity];
  const rows = []; const intervals = [];
  const strict = op === '<' || op === '>';
  const want = (y) => (op === '<' || op === '<=' ? y < 0 : y > 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const t = a === -Infinity ? (b === Infinity ? 0 : b - 1) : b === Infinity ? a + 1 : (a + b) / 2;
    const y = F(t);
    rows.push(`\\left(${fmtEnd(a, uniqC[i - 1])}, ${fmtEnd(b, uniqC[i])}\\right) & ${formatNumber(t, 4)} & ${y > 0 ? '+' : '-'} & ${want(y) ? '\\checkmark' : '\\times'}`);
    if (want(y)) intervals.push([a, b, false, false, uniqC[i - 1]?.node, uniqC[i]?.node]);
  }
  steps.push({ title: 'Test a point in each interval (sign chart)', detail: `\\begin{array}{c|c|c|c} \\text{interval} & \\text{test } ${v} & \\text{sign} & ${relTex(op)} 0? \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}` });
  if (!strict) {
    // include zeros of numerator that are not denominator zeros
    for (const c of uniqC) if (!c.den) {
      const iv = intervals.find((I) => Math.abs(I[1] - c.x) < 1e-9 || Math.abs(I[0] - c.x) < 1e-9);
      if (iv) { if (Math.abs(iv[1] - c.x) < 1e-9) iv[3] = true; if (Math.abs(iv[0] - c.x) < 1e-9) iv[2] = true; }
      else intervals.push([c.x, c.x, true, true, c.node, c.node]);
    }
  }
  return { intervals: unionIntervals(intervals) };
}
const fmtEnd = (x, c) => (x === -Infinity ? '-\\infty' : x === Infinity ? '\\infty' : tex(c.node));
function intervalFrom(op, val) {
  const x = evalNum(val);
  switch (op) {
    case '<': return [-Infinity, x, false, false, null, val];
    case '<=': return [-Infinity, x, false, true, null, val];
    case '>': return [x, Infinity, false, false, val, null];
    case '>=': return [x, Infinity, true, false, val, null];
  }
  return [x, x, true, true, val, val];
}
function unionIntervals(iv) {
  iv = iv.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const I of iv) {
    const last = out[out.length - 1];
    if (last && (I[0] < last[1] || (Math.abs(I[0] - last[1]) < 1e-12 && (I[2] || last[3])))) {
      if (I[1] > last[1] || (Math.abs(I[1] - last[1]) < 1e-12 && I[3])) { last[1] = I[1]; last[3] = I[3]; last[5] = I[5]; }
    } else out.push(I.slice());
  }
  return out;
}
export function intervalsTex(iv, v) {
  if (!iv.length) return '\\text{no solution}';
  if (iv.length === 1 && iv[0][0] === -Infinity && iv[0][1] === Infinity) return '\\text{all real numbers}';
  const node = (x, n) => (n ? tex(n) : x === Infinity ? '\\infty' : x === -Infinity ? '-\\infty' : formatNumber(x));
  const ineq = iv.map(([a, b, ca, cb, na, nb]) => {
    if (a === b) return `${v} = ${node(a, na)}`;
    if (a === -Infinity) return `${v} ${cb ? '\\le' : '<'} ${node(b, nb)}`;
    if (b === Infinity) return `${v} ${ca ? '\\ge' : '>'} ${node(a, na)}`;
    return `${node(a, na)} ${ca ? '\\le' : '<'} ${v} ${cb ? '\\le' : '<'} ${node(b, nb)}`;
  }).join(' \\;\\text{or}\\; ');
  const interval = iv.map(([a, b, ca, cb, na, nb]) => (a === b ? `\\{${node(a, na)}\\}` : `${ca ? '[' : '('}${node(a, na)}, ${node(b, nb)}${cb ? ']' : ')'}`)).join(' \\cup ');
  return `${ineq} \\qquad \\left(${interval}\\right)`;
}
export function intervalsText(iv, v) {
  if (!iv.length) return 'No solution';
  if (iv.length === 1 && iv[0][0] === -Infinity && iv[0][1] === Infinity) return 'All real numbers';
  const node = (x, n) => (n ? text(n) : x === Infinity ? '∞' : x === -Infinity ? '-∞' : formatNumber(x));
  return iv.map(([a, b, ca, cb, na, nb]) => {
    if (a === b) return `${v} = ${node(a, na)}`;
    if (a === -Infinity) return `${v} ${cb ? '≤' : '<'} ${node(b, nb)}`;
    if (b === Infinity) return `${v} ${ca ? '≥' : '>'} ${node(a, na)}`;
    return `${node(a, na)} ${ca ? '≤' : '<'} ${v} ${cb ? '≤' : '<'} ${node(b, nb)}`;
  }).join(' or ');
}
export function solveCompound(parts, ops, v, steps) {
  // a < g(x) < b, g linear
  let [a, g, b] = parts.map(S);
  const co = polyCoeffs(g, v);
  if (!co || co.length !== 2) throw new MathError('Only linear compound inequalities are supported');
  let [c0, c1] = co;
  const show = (o1, o2) => `${tex(a)} ${relTex(o1)} ${tex(g)} ${relTex(o2)} ${tex(b)}`;
  let [o1, o2] = ops;
  if (!isNum(c0, 0)) {
    a = S(sub(a, c0)); b = S(sub(b, c0)); g = S(sub(g, c0));
    steps.push({ title: `${isNegative(c0) ? 'Add' : 'Subtract'} $${tex(isNegative(c0) ? negate(c0) : c0)}$ ${isNegative(c0) ? 'to' : 'from'} all three parts`, math: show(o1, o2) });
  }
  if (!isNum(c1, 1)) {
    a = S(div(a, c1)); b = S(div(b, c1)); g = sym(v);
    const negc = evalNum(c1) < 0;
    if (negc) { [a, b] = [b, a]; [o1, o2] = [o2, o1]; }
    steps.push({ title: `Divide all three parts by $${tex(c1)}$${negc ? ' (flip the signs because it is negative)' : ''}`, math: show(o1, o2) });
  }
  const A = evalNum(a), B = evalNum(b);
  if (A > B) return { intervals: [] };
  return { intervals: [[A, B, o1 === '<=' || o1 === '>=', o2 === '<=' || o2 === '>=', a, b]] };
}

// ---------------------------------------------------------------------------
// Systems of equations
// ---------------------------------------------------------------------------
export function solveSystem(eqs, steps) {
  const vars = [...eqs.reduce((s, [l, r]) => { freeVars(l, s); freeVars(r, s); return s; }, new Set())].sort();
  const linear = eqs.every(([l, r]) => vars.every((x) => { const c = polyCoeffs(S(sub(l, r)), x); return c && c.length <= 2 && (!c[1] || vars.every((y) => !has(c[1], y))); }));
  if (linear && vars.length === eqs.length && vars.length === 2) return solve2x2(eqs, vars, steps);
  if (linear) return gaussian(eqs, vars, steps);
  return solveBySubstitution(eqs, vars, steps);
}
function linRow(l, r, vars) {
  const f = expand(sub(l, r));
  const row = vars.map((x) => { const c = polyCoeffs(f, x); return c[1] ? S(c[1]) : ZERO; });
  let constant = f; vars.forEach((x) => { constant = subst(constant, x, ZERO); });
  return [row, S(neg(constant))];
}
function rowTex(row, rhs, vars) {
  const lhs = S(add(row.map((c, i) => mul(c, sym(vars[i])))));
  return eqTex(lhs, rhs);
}
function solve2x2(eqs, vars, steps) {
  const [x, y] = vars;
  let [[r1, c1], [r2, c2]] = eqs.map(([l, r]) => linRow(l, r, vars));
  steps.push({ title: 'Write both equations in standard form', math: `\\begin{cases} ${rowTex(r1, c1, vars)} \\\\ ${rowTex(r2, c2, vars)} \\end{cases}` });
  const numeric = [...r1, ...r2, c1, c2].every((n) => n.t === 'num' && isQ(n.v));
  if (!numeric) return gaussian(eqs, vars, steps);
  const [a1, b1] = r1.map((n) => n.v), [a2, b2] = r2.map((n) => n.v);
  const det = a1.mul(b2).sub(a2.mul(b1));
  // elimination: eliminate y (or x if easier)
  const elimY = !(b1.isZero() || b2.isZero()) || a1.isZero() || a2.isZero();
  const [k1, k2] = elimY ? [b2, b1] : [a2, a1];
  const m1 = k1.abs(), m2 = k2.abs();
  const sameSign = elimY ? b1.sign() === b2.sign() : a1.sign() === a2.sign();
  const L = (q) => tex(num(q));
  const e1 = { r: [a1.mul(m1), b1.mul(m1)], c: c1.v.mul(m1) }, e2 = { r: [a2.mul(m2), b2.mul(m2)], c: c2.v.mul(m2) };
  if (!m1.isOne() || !m2.isOne()) steps.push({ title: `Elimination: make the $${elimY ? y : x}$ coefficients match (multiply equation 1 by $${L(m1)}$ and equation 2 by $${L(m2)}$)`, math: `\\begin{cases} ${rowTex(e1.r.map(num), num(e1.c), vars)} \\\\ ${rowTex(e2.r.map(num), num(e2.c), vars)} \\end{cases}` });
  if (det.isZero()) {
    const consistent = a1.mul(c2.v).sub(a2.mul(c1.v)).isZero() && b1.mul(c2.v).sub(b2.mul(c1.v)).isZero();
    steps.push({ title: consistent ? 'The equations describe the same line: infinitely many solutions' : 'The lines are parallel: no solution' });
    return { system: true, none: !consistent, infinite: consistent };
  }
  const op = sameSign ? 'Subtract' : 'Add';
  const comb = sameSign ? [e1.r[0].sub(e2.r[0]), e1.r[1].sub(e2.r[1]), e1.c.sub(e2.c)] : [e1.r[0].add(e2.r[0]), e1.r[1].add(e2.r[1]), e1.c.add(e2.c)];
  steps.push({ title: `${op} the equations to eliminate $${elimY ? y : x}$`, math: rowTex([num(comb[0]), num(comb[1])], num(comb[2]), vars) });
  const solvedVar = elimY ? x : y;
  const coef = elimY ? comb[0] : comb[1];
  const val = comb[2].div(coef);
  steps.push({ title: `Divide by $${L(coef)}$`, math: `${solvedVar} = ${L(val)}` });
  // back-substitute into eq 1 (or 2 if coefficient zero)
  const useRow = (elimY ? !b1.isZero() : !a1.isZero()) ? [a1, b1, c1.v] : [a2, b2, c2.v];
  const otherVar = elimY ? y : x;
  const [ua, ub, uc] = useRow;
  const substituted = elimY ? S(add(mul(num(ua), num(val)), mul(num(ub), sym(y)))) : S(add(mul(num(ua), sym(x)), mul(num(ub), num(val))));
  steps.push({ title: `Substitute $${solvedVar} = ${L(val)}$ back into an original equation`, math: `${elimY ? `${L(ua)}\\left(${L(val)}\\right) + ${L(ub)}${y}` : `${L(ua)}${x} + ${L(ub)}\\left(${L(val)}\\right)`} = ${L(uc)}` });
  const ov = elimY ? uc.sub(ua.mul(val)).div(ub) : uc.sub(ub.mul(val)).div(ua);
  steps.push({ title: `Solve for $${otherVar}$`, math: `${otherVar} = ${L(ov)}` });
  const sol = elimY ? { [x]: num(val), [y]: num(ov) } : { [x]: num(ov), [y]: num(val) };
  steps.push({ title: 'Check in both equations', detail: eqs.map(([l, r]) => { const env = Object.fromEntries(Object.entries(sol).map(([k, n]) => [k, evalNum(n)])); return `${formatNumber(evalNum(l, env))} = ${formatNumber(evalNum(r, env))} \\checkmark`; }).join(',\\quad ') });
  return { system: true, values: sol, vars };
}
function gaussian(eqs, vars, steps) {
  const rows = eqs.map(([l, r]) => linRow(l, r, vars));
  const n = vars.length, m = rows.length;
  let A = rows.map(([row, c]) => [...row, c].map((x) => S(x)));
  const allQ = A.every((r) => r.every((x) => x.t === 'num' && isQ(x.v)));
  if (!allQ) throw new MathError('Systems with symbolic coefficients are not supported yet');
  let M = A.map((r) => r.map((x) => x.v));
  const mtex = () => `\\left[\\begin{array}{${'r'.repeat(n)}|r} ${M.map((r) => r.map((x) => tex(num(x))).join(' & ')).join(' \\\\ ')} \\end{array}\\right]`;
  steps.push({ title: `Write the augmented matrix (columns: $${vars.join(', ')}$)`, math: mtex() });
  let row = 0; const pivots = [];
  for (let col = 0; col < n && row < m; col++) {
    let p = row; while (p < m && M[p][col].isZero()) p++;
    if (p === m) continue;
    if (p !== row) { [M[p], M[row]] = [M[row], M[p]]; steps.push({ title: `Swap row ${p + 1} and row ${row + 1}`, math: mtex() }); }
    const pv = M[row][col];
    if (!pv.isOne()) { M[row] = M[row].map((x) => x.div(pv)); steps.push({ title: `Divide row ${row + 1} by $${tex(num(pv))}$`, math: mtex() }); }
    const ops = [];
    for (let r = 0; r < m; r++) {
      if (r === row || M[r][col].isZero()) continue;
      const f = M[r][col];
      M[r] = M[r].map((x, j) => x.sub(f.mul(M[row][j])));
      ops.push(`R_${r + 1} \\to R_${r + 1} ${f.sign() < 0 ? '+' : '-'} ${f.abs().isOne() ? '' : tex(num(f.abs()))}R_${row + 1}`);
    }
    if (ops.length) steps.push({ title: `Eliminate the $${vars[col]}$ entries in the other rows`, detail: ops.join(',\\quad '), math: mtex() });
    pivots.push(col); row++;
  }
  for (let r = row; r < m; r++) if (!M[r][n].isZero()) { steps.push({ title: 'A row says $0 = $ a nonzero number, so the system has no solution' }); return { system: true, none: true }; }
  if (pivots.length < n) { steps.push({ title: 'There are free variables, so there are infinitely many solutions' }); return { system: true, infinite: true }; }
  const values = {}; pivots.forEach((c, r) => { values[vars[c]] = num(M[r][n]); });
  steps.push({ title: 'Read off the solution', math: vars.map((x) => `${x} = ${tex(values[x])}`).join(',\\quad ') });
  return { system: true, values, vars };
}
function solveBySubstitution(eqs, vars, steps) {
  if (eqs.length !== 2 || vars.length !== 2) throw new MathError('I can solve non-linear systems with 2 equations and 2 unknowns');
  // find an equation linear in some variable
  for (let i = 0; i < 2; i++) for (const x of vars) {
    const [l, r] = eqs[i];
    const co = polyCoeffs(S(sub(l, r)), x);
    if (co && co.length === 2 && !has(co[1], vars.find((y) => y !== x)) && co[1].t === 'num') {
      const st = [];
      const expr = S(div(neg(co[0]), co[1]));
      steps.push({ title: `Solve equation ${i + 1} for $${x}$`, math: `${x} = ${tex(expr)}` });
      const [l2, r2] = eqs[1 - i];
      const nl = S(subst(l2, x, expr)), nr = S(subst(r2, x, expr));
      steps.push({ title: `Substitute into equation ${2 - i}`, math: eqTex(nl, nr) });
      const y = vars.find((q) => q !== x);
      const res = solveEquation(nl, nr, y, steps);
      const sols = res.solutions.map((yv) => ({ [y]: yv, [x]: S(subst(expr, y, yv)) }));
      steps.push({ title: `Find $${x}$ for each value of $${y}$`, math: sols.map((s) => `(${vars.map((q) => tex(s[q])).join(', ')})`).join(',\\quad ') });
      return { system: true, multi: sols, vars };
    }
  }
  // both nonlinear: try eliminating a squared term by subtraction (circles etc.) -> numeric fallback
  throw new MathError('This system is too hard for me to solve step by step');
}
