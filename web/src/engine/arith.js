// Step-by-step arithmetic following the order of operations (PEMDAS / BODMAS).
import { Q, MathError, isQ, toNum, nvPowExact, primeFactors, bgcd, formatNumber } from './rational.js';
import { rawTex, numTex, tex } from './print.js';
import { fromRaw, simplify, expand, primePowerMap, extractPower } from './cas.js';

// 'cas' leaves hold exact irrational values (like 2√3) when roots are worked out exactly
const isLit = (r) => r.t === 'num' || r.t === 'cas';
const lit = (v, decimal) => ({ t: 'num', v, src: fmtSrc(v, decimal) });
function fmtSrc(v, decimal) {
  if (!isQ(v)) return formatNumber(v);
  if (v.isInt()) return v.n.toString();
  if (decimal) { const d = v.toExactDecimal(); if (d) return d; }
  return undefined; // printer will use \frac
}
const show = (v, decimal) => (fmtSrc(v, decimal) ?? numTex(v));

// Collect all reducible nodes with their paren depth and in-order position
function candidates(r, depth = 0, out = [], path = []) {
  const push = (prio) => out.push({ node: r, depth, prio, idx: out.length, path });
  switch (r.t) {
    case 'paren':
      candidates(r.a, depth + 1, out, [...path, 'a']);
      break;
    case 'neg': candidates(r.a, depth, out, [...path, 'a']); break;
    case 'bin':
      candidates(r.l, depth, out, [...path, 'l']);
      if (isLit(r.l) && isLit(r.r)) push(r.op === '^' ? 3 : r.op === '*' || r.op === '/' ? 2 : 1);
      candidates(r.r, depth, out, [...path, 'r']);
      break;
    case 'fn':
      r.a.forEach((c, i) => candidates(c, depth + 1, out, [...path, 'a', i]));
      if (r.a.every(isLit) && (!r.base || isLit(r.base))) push(4);
      break;
    case 'fact': case 'pct': case 'deg':
      candidates(r.a, depth, out, [...path, 'a']);
      if (isLit(r.a)) push(4);
      break;
  }
  return out;
}

function replaceAt(r, path, val) {
  if (!path.length) return val;
  const [k, ...rest] = path;
  if (k === 'a' && Array.isArray(r.a)) {
    const [i, ...rest2] = rest;
    const a = r.a.slice(); a[i] = replaceAt(r.a[i], rest2, val); return { ...r, a };
  }
  return { ...r, [k]: replaceAt(r[k], rest, val) };
}

// Silent clean-ups: -(5) -> -5, (5) -> 5, integer a/b that isn't whole -> fraction literal
function tidy(r, decimal) {
  const f = (x) => tidy(x, decimal);
  switch (r.t) {
    case 'paren': { const a = f(r.a); return isLit(a) ? a : { ...r, a }; }
    case 'neg': { const a = f(r.a); return isLit(a) ? lit(isQ(a.v) ? a.v.neg() : -a.v, decimal) : { ...r, a }; }
    case 'bin': {
      const l = f(r.l), rr = f(r.r);
      if (r.op === '/' && !r.obelus && isLit(l) && isLit(rr) && isQ(l.v) && isQ(rr.v) && l.v.isInt() && rr.v.isInt() && !rr.v.isZero() && !decimal) {
        const q = l.v.div(rr.v);
        if (!q.isInt() && l.v.n >= 0n && rr.v.n > 0n && bgcd(l.v.n, rr.v.n) === 1n) return { t: 'num', v: q, frac: true };
      }
      return { ...r, l, r: rr };
    }
    case 'fn': return { ...r, a: r.a.map(f) };
    case 'fact': case 'pct': case 'deg': return { ...r, a: f(r.a) };
  }
  return r;
}

const trig = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x) };

function apply(node, decimal, opts) {
  // returns { v, title, detail }
  const A = (x) => x.v;
  const S = (x) => show(x.v, decimal);
  if (node.t === 'bin') {
    const a = A(node.l), b = A(node.r);
    const bothQ = isQ(a) && isQ(b);
    switch (node.op) {
      case '+': case '-': {
        const v = bothQ ? (node.op === '+' ? a.add(b) : a.sub(b)) : node.op === '+' ? toNum(a) + toNum(b) : toNum(a) - toNum(b);
        const word = node.op === '+' ? 'Add' : 'Subtract';
        const sym = node.op;
        if (bothQ && (!a.isInt() || !b.isInt()) && !decimal) {
          // fraction addition with common denominator
          const L = (a.d * b.d) / bgcd(a.d, b.d);
          const an = a.n * (L / a.d), bn = b.n * (L / b.d);
          let detail = `${numTex(a)} ${sym} ${b.sign() < 0 && sym === '+' ? `\\left(${numTex(b)}\\right)` : numTex(b)}`;
          if (a.d !== b.d) detail += ` = \\frac{${an}}{${L}} ${sym} \\frac{${bn}}{${L}}`;
          detail += ` = \\frac{${an} ${sym} ${bn < 0n && true ? `(${bn})` : bn}}{${L}}`;
          const raw = new Q(node.op === '+' ? an + bn : an - bn, L);
          detail += ` = ${numTex(raw)}`;
          if (!(raw.n === (node.op === '+' ? an + bn : an - bn) && raw.d === L) && !raw.isInt()) detail += ' \\text{ (simplified)}';
          return { v, title: `${word} the fractions using a common denominator${a.d !== b.d ? ` (${L})` : ''}`, detail };
        }
        return { v, title: word, detail: `${S(node.l)} ${sym} ${wrapNeg(node.r, decimal)} = ${show(v, decimal)}` };
      }
      case '*': {
        const v = bothQ ? a.mul(b) : toNum(a) * toNum(b);
        let extra = '';
        if (bothQ && (!a.isInt() || !b.isInt()) && !decimal) extra = ` = \\frac{${a.n} \\times ${wrapBig(b.n)}}{${a.d} \\times ${b.d}}`;
        const lm = bothQ && a.isInt() && b.isInt() ? longMultiply(a.n, b.n) : null;
        return { v, title: lm ? 'Multiply (long multiplication)' : 'Multiply', detail: lm || `${S(node.l)} \\times ${wrapNeg(node.r, decimal)}${extra} = ${show(v, decimal)}` };
      }
      case '/': {
        if (isQ(b) ? b.isZero() : b === 0) throw new MathError('Division by zero is undefined');
        const v = bothQ ? a.div(b) : toNum(a) / toNum(b);
        let extra = '';
        if (bothQ && !b.isInt() && !decimal) extra = ` = ${numTex(a)} \\times ${numTex(b.inv())}`;
        const ld = bothQ && a.isInt() && b.isInt() ? longDivide(a.n, b.n) : null;
        return { v, title: bothQ && !b.isInt() && !decimal ? 'Divide (multiply by the reciprocal)' : ld ? 'Divide (long division)' : 'Divide', detail: ld || `${S(node.l)} \\div ${wrapNeg(node.r, decimal)}${extra} = ${show(v, decimal)}` };
      }
      case '^': {
        let v = nvPowExact(a, b);
        let approx = false;
        if (v === null) { v = Math.pow(toNum(a), toNum(b)); approx = true; }
        let expl = '';
        if (bothQ && b.isInt() && b.n > 1n && b.n <= 6n) expl = ' = ' + Array(Number(b.n)).fill(wrapNeg(node.l, decimal)).join(' \\times ');
        const bs = (isQ(a) && (a.sign() < 0 || !a.isInt())) ? `\\left(${S(node.l)}\\right)` : S(node.l);
        return { v, title: 'Evaluate the exponent', detail: `${bs}^{${S(node.r)}}${expl} ${approx ? '\\approx' : '='} ${show(v, decimal)}` };
      }
    }
  }
  if (node.t === 'fn') {
    const x = node.a[0].v;
    const n = node.n;
    if (n === 'sqrt' || n === 'cbrt' || n === 'root') {
      const k = n === 'sqrt' ? 2 : n === 'cbrt' ? 3 : Number(toNum(node.a[0].v));
      const rad = n === 'root' ? node.a[1].v : x;
      if (isQ(rad) && rad.sign() < 0 && k % 2 === 0) throw new MathError('The square root of a negative number is not a real number');
      let v = isQ(rad) ? nvPowExact(rad, new Q(1n, BigInt(k))) : null;
      const sym = k === 2 ? `\\sqrt{${show(rad, decimal)}}` : `\\sqrt[${k}]{${show(rad, decimal)}}`;
      if (v !== null) {
        const why = isQ(v) && v.isInt() ? ` \\quad\\text{because } ${v.sign() < 0 ? `(${v})` : v}^{${k}} = ${show(rad, decimal)}` : '';
        return { v, title: k === 2 ? 'Take the square root' : `Take the ${k === 3 ? 'cube' : k + 'th'} root`, detail: `${sym} = ${show(v, decimal)}${why}` };
      }
      v = (rad < 0 || (isQ(rad) && rad.sign() < 0) ? -1 : 1) * Math.pow(Math.abs(toNum(rad)), 1 / k);
      return { v, title: k === 2 ? 'Take the square root' : 'Take the root', detail: `${sym} \\approx ${formatNumber(v)}` };
    }
    if (n === 'abs') { const v = isQ(x) ? x.abs() : Math.abs(x); return { v, title: 'Absolute value (distance from zero)', detail: `\\left|${show(x, decimal)}\\right| = ${show(v, decimal)}` }; }
    if (n === 'ln' || n === 'log' || n === 'exp') {
      let v, t;
      const base = n === 'ln' ? Math.E : n === 'exp' ? null : node.base ? toNum(node.base.v) : (node.a[1] ? toNum(node.a[1].v) : 10);
      if (n === 'exp') { v = Math.exp(toNum(x)); return { v, title: 'Evaluate the exponential', detail: `e^{${show(x, decimal)}} \\approx ${formatNumber(v)}` }; }
      if (toNum(x) <= 0) throw new MathError('Logarithms are only defined for positive numbers');
      v = Math.log(toNum(x)) / Math.log(base);
      const rv = Math.round(v);
      const exact = Math.abs(v - rv) < 1e-12 && Number.isFinite(base) && Math.abs(Math.pow(base, rv) - toNum(x)) < 1e-9 * Math.max(1, toNum(x));
      t = n === 'ln' ? `\\ln\\left(${show(x, decimal)}\\right)` : `\\log_{${formatNumber(base)}}\\left(${show(x, decimal)}\\right)`;
      if (exact) return { v: Q.of(rv), title: 'Evaluate the logarithm', detail: `${t} = ${rv} \\quad\\text{because } ${n === 'ln' ? 'e' : formatNumber(base)}^{${rv}} = ${show(x, decimal)}` };
      return { v, title: 'Evaluate the logarithm', detail: `${t} \\approx ${formatNumber(v)}` };
    }
    if (trig[n]) {
      const deg = opts.degrees && !n.startsWith('a');
      const arg = toNum(x) * (deg ? Math.PI / 180 : 1);
      let v = trig[n](arg);
      if (opts.degrees && n.startsWith('a')) v = (v * 180) / Math.PI;
      if (Math.abs(v - Math.round(v)) < 1e-12) v = Math.round(v);
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 1e-12) v = new Q(BigInt(Math.round(v * 2)), 2n);
      if (!Number.isFinite(toNum(v)) || Math.abs(toNum(v)) > 1e15) throw new MathError(`${n} is undefined at this angle`);
      const vv = typeof v === 'number' && Number.isInteger(v) ? Q.of(v) : v;
      return { v: vv, title: `Evaluate ${n}${deg ? ' (degrees)' : ''}`, detail: `\\${n.length <= 4 && !n.startsWith('a') ? n : 'operatorname{' + n + '}'}\\left(${show(x, decimal)}${deg ? '^{\\circ}' : ''}\\right) ${isQ(vv) ? '=' : '\\approx'} ${show(vv, decimal)}` };
    }
    if (n === 'ncr' || n === 'npr') {
      const [N, K] = node.a.map((c) => c.v);
      if (!isQ(N) || !isQ(K) || !N.isInt() || !K.isInt() || K.cmp(N) > 0 || K.sign() < 0) throw new MathError('nCr / nPr need whole numbers with r ≤ n');
      let p = 1n; const fs = [];
      for (let j = 0n; j < K.n; j++) { p *= N.n - j; if (fs.length < 6) fs.push((N.n - j).toString()); }
      let f = 1n; for (let j = 2n; j <= K.n; j++) f *= j;
      const v = n === 'ncr' ? p / f : p;
      const formula = n === 'ncr' ? `\\binom{${N.n}}{${K.n}} = \\frac{${N.n}!}{${K.n}!\\,(${N.n} - ${K.n})!}` : `P(${N.n}, ${K.n}) = \\frac{${N.n}!}{(${N.n} - ${K.n})!}`;
      const calc = n === 'ncr' ? `\\frac{${fs.join(' \\times ') || 1}${K.n > 6n ? '\\cdots' : ''}}{${K.n}!} = \\frac{${p}}{${f}}` : `${fs.join(' \\times ') || 1}${K.n > 6n ? '\\cdots' : ''}`;
      return { v: new Q(v), title: n === 'ncr' ? 'Combinations (order does not matter)' : 'Permutations (order matters)', detail: `${formula} = ${calc} = ${v}` };
    }
    if (n === 'gcd' || n === 'lcm') {
      const ints = node.a.map((c) => c.v);
      if (!ints.every((q) => isQ(q) && q.isInt())) throw new MathError(`${n.toUpperCase()} needs whole numbers`);
      let g = ints[0].n; for (const q of ints.slice(1)) g = n === 'gcd' ? bgcd(g, q.n) : (g * q.n) / bgcd(g, q.n);
      if (g < 0n) g = -g;
      const fact = ints.map((q) => `${q.n} = ${primeFactors(q.n < 0n ? -q.n : q.n).join(' \\times ') || q.n}`).join(',\\quad ');
      return { v: new Q(g), title: n === 'gcd' ? 'Greatest common divisor (use prime factors)' : 'Least common multiple (use prime factors)', detail: `${fact} \\;\\Rightarrow\\;\\operatorname{${n}} = ${g}` };
    }
    const simple = { floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign };
    if (simple[n]) { const v = Q.of(simple[n](toNum(x))); return { v, title: `Apply ${n}`, detail: `\\operatorname{${n}}(${show(x, decimal)}) = ${v}` }; }
    if (n === 'max' || n === 'min') { const v = node.a.map((c) => c.v).reduce((m, c) => ((n === 'max' ? toNum(c) > toNum(m) : toNum(c) < toNum(m)) ? c : m)); return { v, title: `Find the ${n === 'max' ? 'largest' : 'smallest'} value`, detail: `\\${n}(${node.a.map((c) => show(c.v, decimal)).join(', ')}) = ${show(v, decimal)}` }; }
    throw new MathError(`Unknown function ${n}`);
  }
  if (node.t === 'fact') {
    const x = node.a.v;
    if (!isQ(x) || !x.isInt() || x.sign() < 0) throw new MathError('Factorial needs a whole number ≥ 0');
    if (x.n > 300n) throw new MathError('That factorial is too large');
    let v = 1n; const parts = [];
    for (let i = x.n; i >= 1n; i--) { v *= i; if (parts.length < 8) parts.push(i.toString()); }
    const expl = x.n <= 1n ? '1' : parts.join(' \\times ') + (x.n > 8n ? ' \\times \\dots \\times 1' : '');
    return { v: new Q(v), title: 'Factorial: multiply all whole numbers down to 1', detail: `${x.n}! = ${expl} = ${v}` };
  }
  if (node.t === 'pct') {
    const x = node.a.v;
    const v = isQ(x) ? x.div(Q.of(100)) : toNum(x) / 100;
    return { v, title: 'Convert the percent to a number (divide by 100)', detail: `${show(x, decimal)}\\% = \\frac{${show(x, decimal)}}{100} = ${show(v, true)}` };
  }
  if (node.t === 'deg') {
    const x = node.a.v;
    return { v: x, title: 'Angle in degrees', detail: `${show(x, decimal)}^{\\circ}` };
  }
  throw new MathError('Cannot evaluate');
}
// ---- exact steps for roots: keep √2, ∛4 ... instead of decimals ----
const ALGEBRAIC = new Set(['sqrt', 'cbrt', 'root', 'abs']);
class NotExact extends Error {}
// value as primes -> exponent (2∛4 -> {2: 5/3}); null if it is not a product of numbers and their roots
function ppMap(x) {
  if (x.t === 'num' && isQ(x.v) && x.v.sign() > 0) return primePowerMap(x.v);
  if (x.t === 'pow' && x.b.t === 'num' && isQ(x.b.v) && x.b.v.sign() > 0 && x.e.t === 'num' && isQ(x.e.v)) {
    const m = new Map(); for (const [p, e] of primePowerMap(x.b.v)) m.set(p, e.mul(x.e.v)); return m;
  }
  if (x.t === 'mul') {
    const m = new Map();
    for (const f of x.a) { const fm = ppMap(f); if (!fm) return null; for (const [p, e] of fm) m.set(p, (m.get(p) || Q.of(0)).add(e)); }
    for (const [p, e] of m) if (e.isZero()) m.delete(p);
    return m;
  }
  return null;
}
function ppTex(m) {
  if (!m || !m.size || m.size > 4) return null;
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([p, e]) => (e.eq(Q.of(1)) ? `${p}` : `${p}^{${numTex(e)}}`)).join(' \\cdot ');
}
const leafX = (r) => (r.t === 'cas' ? r.x : fromRaw(r));
const rootIndex = (x) => (x.t === 'pow' && x.e.t === 'num' && isQ(x.e.v) && x.e.v.n === 1n && x.e.v.d > 1n ? x.e.v.d : null);
function exactApply(node) {
  let x = simplify(fromRaw(node));
  let foil = false;
  if (node.t === 'bin' && (node.op === '*' || node.op === '^') && ((x.t === 'mul' && x.a.some((f) => f.t === 'add' || (f.t === 'pow' && f.b.t === 'add'))) || (x.t === 'pow' && x.b.t === 'add'))) {
    const y = simplify(expand(x)); // (2+√3)(2-√3) -> 1
    if (tex(y).length < tex(x).length) { x = y; foil = true; }
  }
  (function check(y) {
    if (y.t === 'fn' && !ALGEBRAIC.has(y.n)) throw new NotExact();
    if (y.t === 'sym') throw new NotExact();
    for (const k of ['a', 'b', 'e']) if (y[k]) (Array.isArray(y[k]) ? y[k] : [y[k]]).forEach(check);
  })(x);
  const leaf = x.t === 'num' ? { t: 'num', v: x.v, src: fmtSrc(x.v, false) } : { t: 'cas', x };
  const res = tex(x);
  const ppX = ppTex(ppMap(x));
  if (node.t === 'fn') {
    const k = node.n === 'sqrt' ? 2n : node.n === 'cbrt' ? 3n : BigInt(toNum(node.a[0].v));
    const radR = node.n === 'root' ? node.a[1] : node.a[0];
    const sym = (inner) => (k === 2n ? `\\sqrt{${inner}}` : `\\sqrt[${k}]{${inner}}`);
    const lhs = sym(rawTex(radR));
    if (radR.t === 'num' && isQ(radR.v) && radR.v.isInt() && radR.v.sign() > 0) {
      const [o, rest] = extractPower(radR.v.n, k);
      if (o === 1n) return { leaf, silent: true }; // √6 stays √6
      const why = `${sym(`${o}^{${k}} \\cdot ${rest}`)} = ${res}`;
      return { leaf, title: 'Simplify the root: take out the perfect power', detail: `${lhs} = ${rest === 1n ? res : why}` };
    }
    if (radR.t === 'num') return { leaf, silent: rawTex({ t: 'cas', x }) === lhs, title: 'Simplify the root', detail: `${lhs} = ${res}` };
    const inner = ppMap(leafX(radR));
    const parts = leafX(radR).t === 'mul' ? leafX(radR).a.map((f) => ppTex(ppMap(f))) : null;
    let detail = lhs;
    if (inner && ppTex(inner)) {
      if (parts && parts.every(Boolean) && parts.join(' \\cdot ') !== ppTex(inner)) detail += ` = \\left(${parts.join(' \\cdot ')}\\right)^{\\frac{1}{${k}}}`;
      detail += ` = \\left(${ppTex(inner)}\\right)^{\\frac{1}{${k}}}`;
      if (ppX && ppX !== res) detail += ` = ${ppX}`;
    }
    detail += ` = ${res}`;
    return { leaf, title: inner ? 'Take the root: write as powers and multiply the exponents' : 'Take the root', detail };
  }
  if (node.t === 'bin') {
    const A = leafX(node.l), B = leafX(node.r);
    const sumLeaf = (r) => r.t === 'cas' && r.x.t === 'add';
    const lt = sumLeaf(node.l) && node.op !== '+' ? `\\left(${rawTex(node.l)}\\right)` : rawTex(node.l);
    const rt = sumLeaf(node.r) && node.op !== '+' && node.op !== '^' ? `\\left(${rawTex(node.r)}\\right)` : rawTex(node.r);
    const opTex = { '+': '+', '-': '-', '*': '\\cdot', '/': '\\div', '^': '^' }[node.op];
    const lhs = node.op === '^' ? `\\left(${rawTex(node.l)}\\right)^{${rt}}` : node.op === '/' ? `\\frac{${lt}}{${rt}}` : `${lt} ${opTex} ${rt}`;
    if (foil) return { leaf, title: node.op === '^' ? 'Multiply out the brackets' : 'Multiply out the brackets (every term times every term)', detail: `${lhs} = ${res}` };
    if (tex(simplify(fromRaw(node))) === lhs.replace(' \\cdot ', '')) return { leaf, silent: true };
    if (node.op === '*' || node.op === '/') {
      const ka = rootIndex(A), kb = rootIndex(B);
      if (node.op === '*' && ka && ka === kb && A.b.t === 'num' && B.b.t === 'num') {
        const k = ka, prod = A.b.v.mul(B.b.v);
        const sym = (v) => (k === 2n ? `\\sqrt{${v}}` : `\\sqrt[${k}]{${v}}`);
        return { leaf, title: 'Multiply the roots (same index: multiply the numbers inside)', detail: `${lhs} = ${sym(`${numTex(A.b.v)} \\cdot ${numTex(B.b.v)}`)} = ${sym(numTex(prod))}${tex(x) !== sym(numTex(prod)) ? ` = ${res}` : ''}` };
      }
      if (node.op === '/' && B.t === 'pow' && rootIndex(B) === 2n && A.t === 'num') {
        return { leaf, title: 'Rationalize the denominator (multiply top and bottom by the root)', detail: `${lhs} = \\frac{${lt} \\cdot ${rt}}{${rt} \\cdot ${rt}} = ${res}` };
      }
      const pa = ppTex(ppMap(A)), pb = ppTex(ppMap(B));
      if (pa && pb && ppX) {
        const mid = node.op === '*' ? `${pa} \\cdot ${pb}` : `\\frac{${pa}}{${pb}}`;
        return { leaf, title: node.op === '*' ? 'Multiply: same base, so add the exponents' : 'Divide: same base, so subtract the exponents', detail: `${lhs} = ${mid} = ${ppX}${ppX !== res ? ` = ${res}` : ''}` };
      }
      return { leaf, title: node.op === '*' ? 'Multiply' : 'Divide', detail: `${lhs} = ${res}` };
    }
    if (node.op === '^') return { leaf, title: 'Evaluate the exponent', detail: `${lhs}${ppX && ppX !== res ? ` = ${ppX}` : ''} = ${res}` };
    if (x.t === 'add' && x.a.length === 2) return { leaf, silent: true }; // nothing to combine, e.g. 1 + √2
    return { leaf, title: node.op === '+' ? 'Add like roots' : 'Subtract like roots', detail: `${lhs} = ${res}` };
  }
  return { leaf, title: 'Simplify', detail: `${rawTex(node)} = ${res}` };
}

// column multiplication with partial products, for whole numbers with 2+ digits
function longMultiply(a, b) {
  const neg = (a < 0n) !== (b < 0n);
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  if (a < 10n || b < 10n || a > 10n ** 7n || b > 10n ** 7n) return null;
  if (b > a) [a, b] = [b, a];
  const digits = b.toString().split('').reverse();
  const parts = digits.map((d, k) => a * BigInt(d) * 10n ** BigInt(k));
  const total = a * b;
  const rows = [`${a}`, `\\times\\ ${b}`, '\\hline', ...digits.map((d, k) => `${parts[k]} & \\scriptsize{(${a} \\times ${d}${k ? `\\times ${10n ** BigInt(k)}` : ''})}`)];
  if (digits.length > 1) rows.push('\\hline', `${total}`);
  return `\\begin{array}{rl} ${rows.map((r) => (r === '\\hline' ? r : r.includes('&') ? r : r + ' &')).join(' \\\\ ').replace(/\\\\ \\hline \\\\/g, '\\\\ \\hline')} \\end{array}${neg ? `\\quad\\text{negative sign: } -${total}` : ''}`;
}
// long division with remainder for whole numbers
function longDivide(a, b) {
  if (a < 0n || b <= 1n || (a < 100n && a % b === 0n)) return null;
  const q = a / b, r = a % b;
  const ds = a.toString();
  const lines = [];
  let cur = 0n;
  for (let i = 0; i < ds.length; i++) {
    cur = cur * 10n + BigInt(ds[i]);
    if (cur < b && lines.length === 0) continue;
    const d = cur / b;
    lines.push(`\\text{${b} into ${cur}: } ${d} \\times ${b} = ${d * b},\\ \\text{remainder } ${cur - d * b}`);
    cur -= d * b;
    if (lines.length > 12) break;
  }
  const res = r === 0n ? `${q}` : `${q}\\ \\text{R}\\ ${r} = ${q}\\tfrac{${r}}{${b}}`;
  return `\\begin{array}{l} ${lines.join(' \\\\ ')} \\\\ \\hline ${a} \\div ${b} = ${res} \\end{array}`;
}
const wrapNeg = (n, decimal) => (isQ(n.v) ? n.v.sign() < 0 : n.v < 0) ? `\\left(${show(n.v, decimal)}\\right)` : show(n.v, decimal);
const wrapBig = (b) => (b < 0n ? `(${b})` : b.toString());

function hasDecimal(r) {
  if (r.t === 'num') return !!(r.src && r.src.includes('.'));
  return ['l', 'r', 'a', 'base'].some((k) => r[k] && (Array.isArray(r[k]) ? r[k].some(hasDecimal) : hasDecimal(r[k])));
}

export function arithmeticSteps(raw, opts = {}) {
  if (opts.exact) {
    try { return arithmeticStepsInner(raw, opts); } catch (e) { if (e instanceof NotExact) return null; throw e; }
  }
  return arithmeticStepsInner(raw, opts);
}
function arithmeticStepsInner(raw, opts) {
  const decimal = hasDecimal(raw);
  const steps = [];
  let cur = tidy(raw, decimal);
  steps.push({ title: 'Start with the problem', math: rawTex(cur) });
  let guard = 0;
  const exact = !!opts.exact && !decimal;
  while (cur.t !== 'num' && cur.t !== 'cas' && guard++ < 120) {
    // fold degree markers inside trig silently
    const cands = candidates(cur);
    if (!cands.length) throw new MathError('I could not simplify this expression');
    cands.sort((a, b) => b.depth - a.depth || b.prio - a.prio || a.idx - b.idx);
    // with degrees symbol inside a trig function treat as degrees
    const c = cands[0];
    let res, newNode;
    const kids = c.node.t === 'bin' ? [c.node.l, c.node.r] : Array.isArray(c.node.a) ? c.node.a : [c.node.a];
    if (exact && kids.some((k) => k.t === 'cas')) res = exactApply(c.node);
    else if (c.node.t === 'fn' && trig[c.node.n] && c.node.a[0].deg) res = apply(c.node, decimal, { ...opts, degrees: true });
    else res = apply(c.node, decimal, opts);
    if (exact && !res.leaf && !isQ(res.v)) res = exactApply(c.node); // irrational: work it out exactly instead
    if (res.leaf) {
      cur = tidy(replaceAt(cur, c.path, res.leaf), decimal);
      if (!res.silent) steps.push({ title: res.title, detail: res.detail, math: rawTex(cur) });
      continue;
    }
    newNode = lit(res.v, decimal);
    if (c.node.t === 'deg') newNode = { ...newNode, deg: true };
    cur = tidy(replaceAt(cur, c.path, newNode), decimal);
    if (c.node.t === 'deg') continue;
    steps.push({ title: res.title, detail: res.detail, math: rawTex(cur) });
  }
  if (cur.t === 'cas') return { steps, value: null, exact: cur.x };
  const v = cur.v;
  const answer = show(v, decimal);
  let approx = null;
  if (isQ(v) && !v.isInt() && !decimal) approx = v.toExactDecimal() ?? formatNumber(v.toNumber());
  if (isQ(v) && !v.isInt() && v.abs().cmp(Q.of(1)) > 0 && !decimal) {
    const whole = v.n / v.d, rem = (v.n < 0n ? -v.n : v.n) % v.d;
    steps.push({ title: 'As a mixed number', math: `${numTex(v)} = ${whole}\\tfrac{${rem}}{${v.d}}` });
  }
  return { steps, value: v, answerTex: answer + (approx ? ` \\approx ${approx}` : ''), answerText: isQ(v) ? (decimal ? fmtSrc(v, true) ?? v.toString() : v.toString()) + (approx ? ` ≈ ${approx}` : '') : formatNumber(v) };
}
