// Factoring with explanations.
import { Q, isQ, bgcd, MathError } from './rational.js';
import { num, sym, add, mul, pow, simplify, expand, polyCoeffs, freeVars, isNum, coeffSplit, key, ONE, subst, has } from './cas.js';
import { tex } from './print.js';
import { toQArray, rationalRoots, toIntegerPoly, deg, synthDiv, toNode, numericRoots } from './poly.js';

const lin = (a, b, v) => simplify(add(mul(num(a), sym(v)), num(b))); // a v + b

// Greatest common factor of the terms of an expanded polynomial (any number of variables)
export function gcfOfTerms(terms) {
  let g = null; const minExp = new Map(); let first = true;
  for (const t of terms) {
    const [c, rest] = coeffSplit(t);
    if (!isQ(c)) return null;
    const cn = c.abs();
    g = g === null ? cn : new Q(bgcd(g.n * cn.d, cn.n * g.d), g.d * cn.d);
    const exps = new Map();
    const fs = rest ? (rest.t === 'mul' ? rest.a : [rest]) : [];
    for (const f of fs) {
      if (f.t === 'sym') exps.set(f.n, (exps.get(f.n) || 0) + 1);
      else if (f.t === 'pow' && f.b.t === 'sym' && f.e.t === 'num' && isQ(f.e.v) && f.e.v.isInt() && f.e.v.sign() > 0) exps.set(f.b.n, (exps.get(f.b.n) || 0) + Number(f.e.v.n));
    }
    if (first) { for (const [k, e] of exps) minExp.set(k, e); first = false; }
    else { for (const k of [...minExp.keys()]) minExp.set(k, Math.min(minExp.get(k), exps.get(k) || 0)); }
  }
  // integer gcd only when all coefficients are integers
  const allInt = terms.every((t) => { const [c] = coeffSplit(t); return isQ(c) && c.isInt(); });
  let gq = allInt && g ? g : Q.of(1);
  const leadNeg = (() => { const [c] = coeffSplit(terms[0]); return isQ(c) && c.sign() < 0; })();
  if (leadNeg && terms.every((t) => { const [c] = coeffSplit(t); return isQ(c) && c.sign() < 0; })) gq = gq.neg();
  const factors = [num(gq)];
  for (const [k, e] of minExp) if (e > 0) factors.push(e === 1 ? sym(k) : pow(sym(k), num(e)));
  const gcf = simplify(mul(factors));
  return gcf;
}

export function factorExpr(expr, steps = []) {
  const e = expand(expr);
  const vars = [...freeVars(e)];
  if (!vars.length) throw new MathError('There is nothing to factor (no variables)');
  const terms = e.t === 'add' ? e.a : [e];
  steps.push({ title: 'Write the expression in expanded form', math: tex(e) });
  const factors = [];
  let rest = e;
  const gcf = gcfOfTerms(terms);
  if (gcf && !isNum(gcf, 1) && terms.length > 1) {
    rest = expand(mul(e, pow(gcf, num(-1))));
    factors.push(gcf);
    steps.push({ title: `Factor out the greatest common factor $${tex(gcf)}$`, math: `${tex(gcf)}\\left(${tex(rest)}\\right)` });
  }
  const restFactors = factorPrimitive(rest, vars, steps, factors);
  const result = simplify(mul([...factors, ...restFactors]));
  return { result, steps };
}

// factor a polynomial with no common factor; returns list of factor nodes
function factorPrimitive(e, vars, steps, outer) {
  const prefix = () => outer.map((f) => (f.t === 'add' ? `\\left(${tex(f)}\\right)` : tex(f))).join('');
  if (vars.length === 1) {
    const v = vars[0];
    const co = polyCoeffs(e, v);
    const p = co && toQArray(co);
    if (!p || deg(p) < 2) return [e];
    return factorUni(p, v, steps, prefix);
  }
  // two variables, homogeneous: factor via substitution
  if (vars.length === 2) {
    const [x, y] = vars.sort();
    const co = polyCoeffs(e, x);
    if (co) {
      // check homogeneity: coefficient of x^i must be c*y^(n-i)
      const n = co.length - 1; const p = [];
      let ok = true;
      for (let i = 0; i <= n; i++) {
        const c = simplify(mul(co[i], pow(sym(y), num(-(n - i)))));
        if (c.t === 'num' && isQ(c.v)) p.push(c.v); else { ok = false; break; }
      }
      if (ok && n >= 2) {
        const { roots, rest } = rationalRoots(p);
        if (roots.length) {
          const fs = [];
          const [, scale] = toIntegerPoly(p);
          let lead = p[n];
          for (const r of roots) { fs.push(simplify(add(mul(num(r.d), sym(x)), mul(num(-r.n), sym(y))))); lead = lead.div(Q.of(r.d)); }
          const restNode = homogenize(rest, x, y);
          const all = [...(lead.isOne() ? [] : [num(lead)]), ...fs, ...(deg(rest) >= 1 ? [restNode] : [])];
          const res = simplify(mul(all));
          steps.push({ title: 'Factor (treat it like a quadratic in one variable)', math: prefix() + tex(res) });
          return [res];
        }
      }
    }
    // difference of squares a^2 - b^2
    const ex = expand(e);
    if (ex.t === 'add' && ex.a.length === 2) {
      const [s1, s2] = ex.a;
      const r1 = squareRootOf(s1), r2 = squareRootOf(mul(num(-1), s2));
      if (r1 && r2) {
        const res = mul(add(r1, r2), add(r1, mul(num(-1), r2)));
        steps.push({ title: 'Difference of squares: $a^2 - b^2 = (a+b)(a-b)$', math: prefix() + tex(simplify(res)) });
        return [simplify(add(r1, r2)), simplify(add(r1, mul(num(-1), r2)))];
      }
    }
  }
  return [e];
}
function homogenize(p, x, y) {
  const n = p.length - 1; const terms = [];
  for (let i = 0; i <= n; i++) if (!p[i].isZero()) terms.push(mul(num(p[i]), pow(sym(x), num(i)), pow(sym(y), num(n - i))));
  return simplify(add(terms));
}
function squareRootOf(t) {
  const s = simplify(t);
  const [c, rest] = coeffSplit(s);
  if (!isQ(c) || c.sign() <= 0) return null;
  const rc = simplify(pow(num(c), num(new Q(1n, 2n))));
  if (rc.t !== 'num') return null;
  if (!rest) return rc;
  const fs = rest.t === 'mul' ? rest.a : [rest];
  const out = [rc];
  for (const f of fs) {
    if (f.t === 'pow' && f.e.t === 'num' && isQ(f.e.v) && f.e.v.isInt() && f.e.v.n % 2n === 0n) out.push(pow(f.b, num(f.e.v.div(Q.of(2)))));
    else return null;
  }
  return simplify(mul(out));
}

function factorUni(p, v, steps, prefix) {
  const n = deg(p);
  const X = sym(v);
  const [ints, scale] = toIntegerPoly(p);
  const pre = scale.isOne() ? '' : (scale.eq(Q.of(-1)) ? '-' : tex(num(scale)));
  const scaleF = scale.isOne() ? [] : [num(scale)];
  if (!scale.isOne()) steps.push({ title: `Factor out $${tex(num(scale))}$ so the coefficients are whole numbers`, math: `${prefix()}${pre}\\left(${tex(toNode(ints.map((c) => new Q(c)), v))}\\right)` });
  const P = ints.map((c) => new Q(c));
  if (n === 2) {
    const [c, b, a] = ints;
    // special patterns
    if (b === 0n && c < 0n) {
      const ra = isqrt(a), rc = isqrt(-c);
      if (ra !== null && rc !== null) {
        const f1 = lin(ra, rc, v), f2 = lin(ra, -rc, v);
        steps.push({ title: 'Difference of squares: $a^2 - b^2 = (a - b)(a + b)$', detail: `${tex(toNode(P, v))} = ${ra === 1n ? v : `\\left(${tex(lin(ra, 0, v))}\\right)`}^2 - ${rc}^2`, math: prefix() + pre + `\\left(${tex(f2)}\\right)\\left(${tex(f1)}\\right)` });
        return [...scaleF, f2, f1];
      }
    }
    const D = b * b - 4n * a * c;
    const sD = D >= 0n ? isqrt(D) : null;
    if (sD === null) {
      steps.push({ title: 'This quadratic cannot be factored over the rational numbers', detail: `\\text{discriminant } b^2-4ac = ${D} \\text{ is not a perfect square}`, math: prefix() + tex(simplify(mul(scaleF, toNode(P, v)))) });
      return [...scaleF, toNode(P, v)];
    }
    if (D === 0n && isqrt(a) !== null && isqrt(c) !== null) {
      const ra = isqrt(a), rc = isqrt(c) * (b < 0n ? -1n : 1n);
      const f = lin(ra, rc, v);
      steps.push({ title: 'Perfect square trinomial: $a^2 \\pm 2ab + b^2 = (a \\pm b)^2$', math: prefix() + pre + `\\left(${tex(f)}\\right)^2` });
      return [...scaleF, pow(f, num(2))];
    }
    // find m, n with m*n = a*c, m+n = b
    const ac = a * c;
    const m = (-b + sD) / 2n * -1n, nn = (-b - sD) / 2n * -1n; // roots of t^2 - b t + ac
    // m + nn = b, m*nn = ac
    if (a === 1n) {
      steps.push({ title: `Find two numbers that multiply to $${c}$ and add to $${b}$`, detail: `${paren(m)} \\times ${paren(nn)} = ${c}, \\quad ${paren(m)} + ${paren(nn)} = ${b}`, math: prefix() + pre + `\\left(${tex(lin(1n, m, v))}\\right)\\left(${tex(lin(1n, nn, v))}\\right)` });
      return [...scaleF, lin(1n, m, v), lin(1n, nn, v)];
    }
    // AC method with grouping
    const g1 = bgcd(a, m), g2 = bgcd(nn, c);
    const f1 = lin(a / g1, m / g1, v);
    steps.push({ title: `AC method: $a \\cdot c = ${ac}$. Find two numbers that multiply to $${ac}$ and add to $${b}$: $${m}$ and $${nn}$`, math: `${tex(simplify(mul(num(a), pow(X, num(2)))))} ${sgn(m)} ${tex(simplify(mul(num(m < 0n ? -m : m), X)))} ${sgn(nn)} ${tex(simplify(mul(num(nn < 0n ? -nn : nn), X)))} ${sgn(c)} ${c < 0n ? -c : c}` });
    const gA = simplify(mul(num(g1), X)), gB = num(g2 * (nn < 0n !== (m / g1 < 0n) && false ? -1n : 1n));
    const rest = f1;
    // second group: nn x + c = g2' * (a/g1 x + m/g1)
    const k = new Q(nn).div(new Q(a / g1));
    steps.push({ title: 'Factor by grouping', math: `${tex(gA)}\\left(${tex(rest)}\\right) ${k.sign() < 0 ? '-' : '+'} ${tex(num(k.abs()))}\\left(${tex(rest)}\\right)` });
    const f2 = simplify(add(gA, num(k)));
    steps.push({ title: 'Factor out the common binomial', math: prefix() + pre + `\\left(${tex(f2)}\\right)\\left(${tex(rest)}\\right)` });
    return [...scaleF, f2, rest];
  }
  if (n === 3) {
    const [d0, d1, d2, d3] = ints;
    // sum / difference of cubes
    if (d1 === 0n && d2 === 0n) {
      const ra = icbrt(d3), rb = icbrt(d0);
      if (ra !== null && rb !== null) {
        const f1 = lin(ra, rb, v);
        const f2 = simplify(add(mul(num(ra * ra), pow(X, num(2))), mul(num(-ra * rb), X), num(rb * rb)));
        steps.push({ title: rb > 0n ? 'Sum of cubes: $a^3 + b^3 = (a + b)(a^2 - ab + b^2)$' : 'Difference of cubes: $a^3 - b^3 = (a - b)(a^2 + ab + b^2)$', math: prefix() + pre + `\\left(${tex(f1)}\\right)\\left(${tex(f2)}\\right)` });
        return [...scaleF, f1, ...factorUni(toQArray(polyCoeffs(f2, v)), v, [], () => '').filter((f) => !isNum(f, 1))];
      }
    }
    // grouping: a x^3 + b x^2 + c x + d with a/b == c/d
    if (d2 !== 0n && d0 !== 0n && d3 * d0 === d2 * d1) {
      const g = bgcd(d3, d2) * (d3 < 0n ? -1n : 1n);
      const inner = lin(d3 / g, d2 / g, v);
      const k = new Q(d1).div(new Q(d3 / g));
      const sq = simplify(add(mul(num(g), pow(X, num(2))), num(k)));
      steps.push({ title: 'Factor by grouping', detail: `\\left(${tex(toNode([Q.of(0), Q.of(0), new Q(d2), new Q(d3)], v))}\\right) + \\left(${tex(toNode([new Q(d0), new Q(d1)], v))}\\right)`, math: `${tex(simplify(mul(num(g), pow(X, num(2)))))}\\left(${tex(inner)}\\right) ${k.sign() < 0 ? '-' : '+'} ${tex(num(k.abs()))}\\left(${tex(inner)}\\right) = ${prefix()}${pre}\\left(${tex(sq)}\\right)\\left(${tex(inner)}\\right)` });
      const more = factorUni(toQArray(polyCoeffs(sq, v)), v, steps, () => prefix() + pre + `\\left(${tex(inner)}\\right)`);
      return [...scaleF, inner, ...more];
    }
  }
  // biquadratic a x^4 + b x^2 + c
  if (n === 4 && ints[1] === 0n && ints[3] === 0n) {
    const q = [P[0], P[2], P[4]];
    const sub = [];
    const fs = factorUni(q, 'u', sub, () => '');
    if (fs.length > 1) {
      steps.push({ title: `Substitute $u = ${v}^2$`, math: `${tex(toNode(q, 'u'))}` });
      sub.forEach((s) => steps.push(s));
      const back = fs.map((f) => simplify(subst(f, 'u', pow(X, num(2)))));
      steps.push({ title: `Replace $u$ with $${v}^2$`, math: prefix() + pre + back.map((f) => (f.t === 'add' ? `\\left(${tex(f)}\\right)` : tex(f))).join('') });
      const final = [];
      for (const f of back) {
        const fq = toQArray(polyCoeffs(f, v));
        if (fq && deg(fq) === 2) final.push(...factorUni(fq, v, steps, () => prefix() + pre)); else final.push(f);
      }
      return [...scaleF, ...final.filter((f) => !isNum(f, 1))];
    }
  }
  // rational root theorem
  const { roots, rest } = rationalRoots(P);
  if (!roots.length) {
    steps.push({ title: 'No rational roots: this polynomial cannot be factored further over the rationals', math: prefix() + pre + tex(toNode(P, v)) });
    return [...scaleF, toNode(P, v)];
  }
  steps.push({ title: 'Rational Root Theorem: possible roots are $\\pm\\frac{\\text{factors of constant}}{\\text{factors of leading coefficient}}$', detail: `\\text{Roots found: } ${roots.map((r) => `${v} = ${tex(num(r))}`).join(',\\ ')}` });
  let cur = P; const linear = [];
  for (const r of roots) {
    if (deg(cur) <= 1) { linear.push(r); cur = [cur[1] ?? Q.of(1)]; break; }
    const { quot, rem, row } = synthDiv(cur, r);
    steps.push({ title: `Synthetic division by $(${tex(lin(1n, 0n, v))} ${r.sign() < 0 ? '+' : '-'} ${tex(num(r.abs()))})$`, detail: synthTable(cur, r, row, quot, rem), math: `${tex(toNode(cur, v))} = \\left(${tex(simplify(add(X, num(r.neg()))))}\\right)\\left(${tex(toNode(quot, v))}\\right)` });
    linear.push(r); cur = quot;
  }
  let lead = cur;
  const lf = linear.map((r) => lin(r.d, -r.n, v));
  let scaleLead = Q.of(1);
  for (const r of linear) scaleLead = scaleLead.mul(Q.of(r.d));
  cur = cur.map((c) => c.div(scaleLead));
  const tail = deg(cur) >= 2 ? factorUni(cur, v, [], () => '') : deg(cur) === 1 ? [toNode(cur, v)] : [num(cur[0])];
  const res = simplify(mul([...scaleF, ...lf, ...tail]));
  steps.push({ title: 'Write the polynomial as a product of factors', math: prefix() + tex(res) });
  return [res];
}
function synthTable(p, r, row, quot, rem) {
  const top = [...p].reverse().map((c) => tex(num(c)));
  const mid = row.slice(1).map((c) => tex(num(c)));
  const bot = [...quot].reverse().map((c) => tex(num(c))).concat([tex(num(rem))]);
  return `\\begin{array}{r|${'r'.repeat(top.length)}} ${tex(num(r))} & ${top.join(' & ')} \\\\ & & ${mid.join(' & ')} \\\\ \\hline & ${bot.join(' & ')} \\end{array}`;
}
const isqrt = (n) => { if (n < 0n) return null; let x = BigInt(Math.round(Math.sqrt(Number(n)))); for (const d of [-1n, 0n, 1n]) if ((x + d) >= 0n && (x + d) ** 2n === n) return x + d; return null; };
const icbrt = (n) => { const s = n < 0n ? -1n : 1n; const a = n * s; let x = BigInt(Math.round(Math.cbrt(Number(a)))); for (const d of [-1n, 0n, 1n]) if ((x + d) ** 3n === a) return s * (x + d); return null; };
const paren = (b) => (b < 0n ? `(${b})` : `${b}`);
const sgn = (b) => (b < 0n ? '-' : '+');
export { isqrt };
