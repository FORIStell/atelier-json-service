// Univariate polynomials with rational coefficients: arrays of Q, lowest degree first.
import { Q, isQ, bgcd, primeFactors } from './rational.js';
import { num, sym, pow, mul, add, simplify, ONE, ZERO } from './cas.js';

export const deg = (p) => p.length - 1;
export function trim(p) { p = p.slice(); while (p.length > 1 && p[p.length - 1].isZero()) p.pop(); return p; }
export function evalQ(p, x) { let r = Q.of(0); for (let i = p.length - 1; i >= 0; i--) r = r.mul(x).add(p[i]); return r; }
export function evalF(p, x) { let r = 0; for (let i = p.length - 1; i >= 0; i--) r = r * x + p[i].toNumber(); return r; }
export function toQArray(nodes) { return nodes.every((c) => c.t === 'num' && isQ(c.v)) ? nodes.map((c) => c.v) : null; }
export function toNode(p, v = 'x') {
  const terms = [];
  for (let i = p.length - 1; i >= 0; i--) {
    if (p[i].isZero()) continue;
    terms.push(mul(num(p[i]), i === 0 ? ONE : i === 1 ? sym(v) : pow(sym(v), num(i))));
  }
  return terms.length ? simplify(add(terms)) : ZERO;
}
// synthetic division by (x - r)
export function synthDiv(p, r) {
  const n = deg(p);
  const out = new Array(n);
  let acc = p[n];
  const row = [Q.of(0)];
  out[n - 1] = acc;
  for (let i = n - 1; i >= 1; i--) { const m = acc.mul(r); row.push(m); acc = p[i].add(m); out[i - 1] = acc; }
  const m = acc.mul(r); row.push(m);
  const rem = p[0].add(m);
  return { quot: out, rem, row };
}
export function divisors(n) {
  n = n < 0n ? -n : n;
  if (n === 0n) return [];
  const fs = primeFactors(n);
  if (fs.some((f) => f > 10n ** 9n)) return [1n, n];
  let ds = [1n];
  const cnt = new Map(); fs.forEach((p) => cnt.set(p, (cnt.get(p) || 0) + 1));
  for (const [p, c] of cnt) { const next = []; for (const d of ds) { let m = 1n; for (let i = 0; i <= c; i++) { next.push(d * m); m *= p; } } ds = next; if (ds.length > 4000) break; }
  return ds.sort((a, b) => (a < b ? -1 : 1));
}
// Make integer coefficients (primitive), returns [intCoeffs as BigInt[], scale Q] with p = scale * ints
export function toIntegerPoly(p) {
  let L = 1n; for (const c of p) L = (L * c.d) / bgcd(L, c.d);
  const ints = p.map((c) => (c.n * L) / c.d);
  let g = 0n; for (const c of ints) g = bgcd(g, c);
  if (g === 0n) g = 1n;
  if (ints[ints.length - 1] < 0n) g = -g;
  return [ints.map((c) => c / g), new Q(g, L)];
}
export function rationalRootCandidates(p) {
  const [ints] = toIntegerPoly(p);
  let k = 0; while (k < ints.length && ints[k] === 0n) k++;
  const a0 = ints[k], an = ints[ints.length - 1];
  const ps = divisors(a0), qs = divisors(an);
  const set = new Map();
  for (const pp of ps) for (const qq of qs) for (const s of [1n, -1n]) { const r = new Q(s * pp, qq); set.set(r.toString(), r); }
  return [...set.values()].sort((a, b) => Math.abs(a.toNumber()) - Math.abs(b.toNumber()) || b.sign() - a.sign()).slice(0, 400);
}
// find all rational roots with multiplicity; returns {roots: Q[], rest: Q[] (remaining factor)}
export function rationalRoots(p) {
  let rest = trim(p);
  const roots = [];
  while (deg(rest) >= 1 && rest[0].isZero()) { roots.push(Q.of(0)); rest = rest.slice(1); }
  let changed = true;
  while (changed && deg(rest) >= 1) {
    changed = false;
    for (const r of rationalRootCandidates(rest)) {
      if (evalQ(rest, r).isZero()) { roots.push(r); rest = synthDiv(rest, r).quot; changed = true; break; }
    }
  }
  return { roots, rest };
}
// All complex roots numerically (Durand–Kerner); p as Q[] or number[]
export function numericRoots(p) {
  let c = p.map((x) => (typeof x === 'number' ? x : x.toNumber()));
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-300) c.pop();
  const n = c.length - 1;
  if (n < 1) return [];
  const an = c[n];
  c = c.map((x) => x / an);
  let roots = [];
  for (let i = 0; i < n; i++) { const ang = (2 * Math.PI * i) / n + 0.4; roots.push([0.9 * Math.cos(ang) * (1 + Math.abs(c[0]) ** (1 / n)), 0.9 * Math.sin(ang) * (1 + Math.abs(c[0]) ** (1 / n))]); }
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const peval = (z) => { let r = [1, 0]; for (let i = n - 1; i >= 0; i--) { r = cmul(r, z); r[0] += c[i]; } return r; };
  for (let it = 0; it < 500; it++) {
    let delta = 0;
    roots = roots.map((z, i) => {
      let den = [1, 0];
      roots.forEach((w, j) => { if (i !== j) den = cmul(den, [z[0] - w[0], z[1] - w[1]]); });
      const step = cdiv(peval(z), den);
      delta = Math.max(delta, Math.hypot(step[0], step[1]));
      return [z[0] - step[0], z[1] - step[1]];
    });
    if (delta < 1e-14) break;
  }
  // polish real-ish roots with Newton
  return roots.map(([re, im]) => {
    if (Math.abs(im) < 1e-7 * Math.max(1, Math.abs(re))) {
      let x = re;
      for (let k = 0; k < 30; k++) {
        let f = 0, d = 0; for (let i = n; i >= 0; i--) { d = d * x + f; f = f * x + c[i]; }
        if (d === 0) break; const nx = x - f / d; if (Math.abs(nx - x) < 1e-15) break; x = nx;
      }
      return [x, 0];
    }
    return [re, im];
  });
}
export function polyGcdInt(ints) { let g = 0n; for (const c of ints) g = bgcd(g, c); return g; }

export function polyDivide(a, b) {
  a = a.slice(); const q = new Array(Math.max(1, a.length - b.length + 1)).fill(Q.of(0));
  for (let i = a.length - b.length; i >= 0; i--) {
    const c = a[i + b.length - 1].div(b[b.length - 1]); q[i] = c;
    for (let j = 0; j < b.length; j++) a[i + j] = a[i + j].sub(c.mul(b[j]));
  }
  const r = a.slice(0, b.length - 1); if (!r.length) r.push(Q.of(0));
  return [q, r];
}
