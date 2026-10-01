// Step-by-step arithmetic following the order of operations (PEMDAS / BODMAS).
import { Q, MathError, isQ, toNum, nvPowExact, primeFactors, bgcd, formatNumber } from './rational.js';
import { rawTex, numTex } from './print.js';

const isLit = (r) => r.t === 'num';
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
    case 'paren': { const a = f(r.a); return isLit(a) && (!isQ(a.v) || a.v.sign() >= 0 || true) && a.t === 'num' ? a : { ...r, a }; }
    case 'neg': { const a = f(r.a); return isLit(a) ? lit(isQ(a.v) ? a.v.neg() : -a.v, decimal) : { ...r, a }; }
    case 'bin': {
      const l = f(r.l), rr = f(r.r);
      if (r.op === '/' && isLit(l) && isLit(rr) && isQ(l.v) && isQ(rr.v) && l.v.isInt() && rr.v.isInt() && !rr.v.isZero() && !decimal) {
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
        return { v, title: 'Multiply', detail: `${S(node.l)} \\times ${wrapNeg(node.r, decimal)}${extra} = ${show(v, decimal)}` };
      }
      case '/': {
        if (isQ(b) ? b.isZero() : b === 0) throw new MathError('Division by zero is undefined');
        const v = bothQ ? a.div(b) : toNum(a) / toNum(b);
        let extra = '';
        if (bothQ && !b.isInt() && !decimal) extra = ` = ${numTex(a)} \\times ${numTex(b.inv())}`;
        return { v, title: bothQ && !b.isInt() && !decimal ? 'Divide (multiply by the reciprocal)' : 'Divide', detail: `${S(node.l)} \\div ${wrapNeg(node.r, decimal)}${extra} = ${show(v, decimal)}` };
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
const wrapNeg = (n, decimal) => (isQ(n.v) ? n.v.sign() < 0 : n.v < 0) ? `\\left(${show(n.v, decimal)}\\right)` : show(n.v, decimal);
const wrapBig = (b) => (b < 0n ? `(${b})` : b.toString());

function hasDecimal(r) {
  if (r.t === 'num') return !!(r.src && r.src.includes('.'));
  return ['l', 'r', 'a', 'base'].some((k) => r[k] && (Array.isArray(r[k]) ? r[k].some(hasDecimal) : hasDecimal(r[k])));
}

export function arithmeticSteps(raw, opts = {}) {
  const decimal = hasDecimal(raw);
  const steps = [];
  let cur = tidy(raw, decimal);
  steps.push({ title: 'Start with the problem', math: rawTex(cur) });
  let guard = 0;
  while (cur.t !== 'num' && guard++ < 120) {
    // fold degree markers inside trig silently
    const cands = candidates(cur);
    if (!cands.length) throw new MathError('I could not simplify this expression');
    cands.sort((a, b) => b.depth - a.depth || b.prio - a.prio || a.idx - b.idx);
    // with degrees symbol inside a trig function treat as degrees
    const c = cands[0];
    let res;
    if (c.node.t === 'fn' && trig[c.node.n] && c.node.a[0].deg) res = apply(c.node, decimal, { ...opts, degrees: true });
    else res = apply(c.node, decimal, opts);
    let newNode = lit(res.v, decimal);
    if (c.node.t === 'deg') newNode = { ...newNode, deg: true };
    cur = tidy(replaceAt(cur, c.path, newNode), decimal);
    if (c.node.t === 'deg') continue;
    steps.push({ title: res.title, detail: res.detail, math: rawTex(cur) });
  }
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
