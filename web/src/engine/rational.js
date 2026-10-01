// Exact rational numbers backed by BigInt, with a float fallback.
// A "number value" (NV) in the engine is either a Q (exact) or a JS number (approximate).

const babs = (a) => (a < 0n ? -a : a);
export function bgcd(a, b) {
  a = babs(a); b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export class Q {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) throw new MathError('Division by zero');
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  static of(x) {
    if (x instanceof Q) return x;
    if (typeof x === 'bigint') return new Q(x);
    if (Number.isInteger(x)) return new Q(BigInt(x));
    return Q.fromDecimalString(String(x));
  }
  static fromDecimalString(s) {
    s = s.trim();
    let m = s.match(/^(-?)(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i);
    if (!m) throw new MathError('Bad number ' + s);
    const [, sign, ip, fp, ex] = m;
    let n = BigInt((ip || '0') + (fp || ''));
    let d = 10n ** BigInt((fp || '').length);
    if (ex) { const e = BigInt(ex); if (e >= 0n) n *= 10n ** e; else d *= 10n ** -e; }
    return new Q(sign ? -n : n, d);
  }
  isInt() { return this.d === 1n; }
  isZero() { return this.n === 0n; }
  isOne() { return this.n === 1n && this.d === 1n; }
  sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
  neg() { return new Q(-this.n, this.d); }
  abs() { return new Q(babs(this.n), this.d); }
  inv() { return new Q(this.d, this.n); }
  add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
  div(o) { o = Q.of(o); return new Q(this.n * o.d, this.d * o.n); }
  powInt(k) {
    k = BigInt(k);
    if (k === 0n) return new Q(1n);
    if (k < 0n) return this.inv().powInt(-k);
    if (k > 4000n) throw new MathError('Exponent too large');
    return new Q(this.n ** k, this.d ** k);
  }
  cmp(o) { o = Q.of(o); const x = this.n * o.d - o.n * this.d; return x > 0n ? 1 : x < 0n ? -1 : 0; }
  eq(o) { return this.cmp(o) === 0; }
  toNumber() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`; }
  // Terminating decimal string if denominator only has factors 2 and 5, else null
  toExactDecimal() {
    let d = this.d, k2 = 0, k5 = 0;
    while (d % 2n === 0n) { d /= 2n; k2++; }
    while (d % 5n === 0n) { d /= 5n; k5++; }
    if (d !== 1n) return null;
    const k = Math.max(k2, k5);
    if (k > 12) return null;
    const scaled = this.n * 10n ** BigInt(k) / this.d;
    const neg = scaled < 0n; let s = babs(scaled).toString().padStart(k + 1, '0');
    if (k) s = s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
    return (neg ? '-' : '') + s;
  }
}

export class MathError extends Error {}

// ---- helpers working on NV (Q | number) ----
export const isQ = (v) => v instanceof Q;
export const toNum = (v) => (isQ(v) ? v.toNumber() : v);
export function nvAdd(a, b) { return isQ(a) && isQ(b) ? a.add(b) : toNum(a) + toNum(b); }
export function nvSub(a, b) { return isQ(a) && isQ(b) ? a.sub(b) : toNum(a) - toNum(b); }
export function nvMul(a, b) { return isQ(a) && isQ(b) ? a.mul(b) : toNum(a) * toNum(b); }
export function nvDiv(a, b) {
  if (isQ(b) ? b.isZero() : b === 0) throw new MathError('Division by zero is undefined');
  return isQ(a) && isQ(b) ? a.div(b) : toNum(a) / toNum(b);
}
export function nvNeg(a) { return isQ(a) ? a.neg() : -a; }
export function nvIsZero(a) { return isQ(a) ? a.isZero() : Math.abs(a) < 1e-15; }
export function nvSign(a) { return isQ(a) ? a.sign() : Math.sign(a); }
// Exact power when possible: returns NV or null if result would be irrational (caller keeps it symbolic)
export function nvPowExact(a, b) {
  if (isQ(a) && isQ(b)) {
    if (b.isInt()) {
      if (a.isZero() && b.sign() < 0) throw new MathError('Division by zero is undefined');
      return a.powInt(b.n);
    }
    // rational exponent p/q: try exact root
    const q = b.d, p = b.n;
    if (a.sign() < 0 && q % 2n === 0n) return null;
    const rn = intRoot(babs(a.n), q), rd = intRoot(a.d, q);
    if (rn === null || rd === null) return null;
    let root = new Q(a.sign() < 0 ? -rn : rn, rd);
    return root.powInt(p);
  }
  return Math.pow(toNum(a), toNum(b));
}
export function intRoot(n, k) {
  // exact integer k-th root of non-negative BigInt n, or null
  k = BigInt(k);
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = BigInt(Math.round(Math.pow(Number(n), 1 / Number(k))));
  for (let dx = -2n; dx <= 2n; dx++) { const y = x + dx; if (y >= 0n && y ** k === n) return y; }
  return null;
}
export function formatNumber(x, digits = 10) {
  if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? '-∞' : 'undefined';
  if (Math.abs(x) < 1e-12) return '0';
  let s = Number(x.toPrecision(digits)).toString();
  if (s.includes('e')) {
    const [m, e] = Number(x.toPrecision(6)).toExponential().split('e');
    return `${m}e${e}`;
  }
  return s;
}
export function primeFactors(n) {
  n = BigInt(n); const out = [];
  if (n < 2n) return out;
  for (const p of [2n, 3n]) while (n % p === 0n) { out.push(p); n /= p; }
  for (let p = 5n; p * p <= n; p += 6n) {
    for (const q of [p, p + 2n]) while (n % q === 0n) { out.push(q); n /= q; }
    if (p > 10000000n) break;
  }
  if (n > 1n) out.push(n);
  return out;
}
