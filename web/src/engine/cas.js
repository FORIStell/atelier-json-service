// Canonical expression trees + simplifier ("mini computer algebra system").
// Nodes: num{v}, sym{n}, add{a[]}, mul{a[]}, pow{b,e}, fn{n,a[]}
import { Q, MathError, isQ, toNum, nvAdd, nvMul, nvPowExact, nvIsZero, nvSign, intRoot, primeFactors, bgcd } from './rational.js';

export const num = (v) => ({ t: 'num', v: typeof v === 'number' && Number.isInteger(v) ? Q.of(v) : v instanceof Q || typeof v === 'number' ? v : Q.of(v) });
export const sym = (n) => ({ t: 'sym', n });
export const add = (...a) => ({ t: 'add', a: a.flat() });
export const mul = (...a) => ({ t: 'mul', a: a.flat() });
export const pow = (b, e) => ({ t: 'pow', b, e: typeof e === 'number' ? num(e) : e });
export const fn = (n, ...a) => ({ t: 'fn', n, a: a.flat() });
export const neg = (x) => mul(num(-1), x);
export const sub = (a, b) => add(a, neg(b));
export const div = (a, b) => mul(a, pow(b, num(-1)));
export const sqrt = (x) => pow(x, num(new Q(1n, 2n)));
export const ZERO = num(0), ONE = num(1);
export const PI = sym('pi'), E = sym('e'), INF = sym('oo');
export const CONSTS = new Set(['pi', 'e', 'oo', 'i']);

export const isNum = (x, v) => x.t === 'num' && (v === undefined || (isQ(x.v) ? x.v.eq(Q.of(v)) : x.v === v));
export const isInt = (x) => x.t === 'num' && isQ(x.v) && x.v.isInt();
export const isNegNum = (x) => x.t === 'num' && nvSign(x.v) < 0;

// ---------- convert parser output to canonical ----------
export function fromRaw(r, opts = {}) {
  const f = (x) => fromRaw(x, opts);
  switch (r.t) {
    case 'num': return num(r.v);
    case 'cas': return r.x;
    case 'sym':
      if (r.n === 'oo') return INF;
      return sym(r.n);
    case 'paren': return f(r.a);
    case 'neg': return neg(f(r.a));
    case 'bin': {
      const l = f(r.l), rr = f(r.r);
      switch (r.op) {
        case '+': return add(l, rr);
        case '-': return sub(l, rr);
        case '*': return mul(l, rr);
        case '/': return div(l, rr);
        case '^': return pow(l, rr);
      }
      break;
    }
    case 'fn': {
      const a = r.a.map(f);
      if (r.n === 'sqrt') return sqrt(a[0]);
      if (r.n === 'cbrt') return pow(a[0], num(new Q(1n, 3n)));
      if (r.n === 'root') return pow(a[1], pow(a[0], num(-1)));
      if (r.n === 'exp') return pow(E, a[0]);
      if (r.n === 'log' && r.base) return fn('log', a[0], f(r.base));
      if (r.n === 'log') return fn('log', a[0], num(10));
      if (['sin', 'cos', 'tan', 'sec', 'csc', 'cot'].includes(r.n) && opts.degrees) return fn(r.n, mul(a[0], div(PI, num(180))));
      return fn(r.n, ...a);
    }
    case 'fact': return fn('fact', f(r.a));
    case 'pct': return div(f(r.a), num(100));
    case 'deg': return mul(f(r.a), div(PI, num(180)));
    case 'rel': return { t: 'rel', ops: r.ops, a: r.a.map(f) };
    case 'list': return { t: 'list', a: r.a.map(f) };
    case 'prime': return { t: 'prime', a: f(r.a) };
  }
  throw new MathError('Cannot understand expression');
}

// ---------- structural helpers ----------
export function key(x) {
  switch (x.t) {
    case 'num': return isQ(x.v) ? 'n' + x.v.toString() : 'f' + x.v;
    case 'sym': return 's' + x.n;
    case 'add': return '+(' + x.a.map(key).join(',') + ')';
    case 'mul': return '*(' + x.a.map(key).join(',') + ')';
    case 'pow': return '^(' + key(x.b) + ',' + key(x.e) + ')';
    case 'fn': return x.n + '(' + x.a.map(key).join(',') + ')';
    default: return x.t + '(' + (x.a || []).map(key).join(',') + ')';
  }
}
export const equal = (a, b) => key(a) === key(b);
export function has(x, v) {
  if (x.t === 'sym') return v === undefined ? !CONSTS.has(x.n) : x.n === v;
  if (x.t === 'num') return false;
  if (x.t === 'pow') return has(x.b, v) || has(x.e, v);
  return (x.a || []).some((c) => has(c, v));
}
export function freeVars(x, out = new Set()) {
  if (x.t === 'sym') { if (!CONSTS.has(x.n)) out.add(x.n); }
  else if (x.t === 'pow') { freeVars(x.b, out); freeVars(x.e, out); }
  else if (x.a) x.a.forEach((c) => freeVars(c, out));
  return out;
}
export function subst(x, v, val) {
  if (x.t === 'sym') return x.n === v ? val : x;
  if (x.t === 'num') return x;
  if (x.t === 'pow') return pow(subst(x.b, v, val), subst(x.e, v, val));
  return { ...x, a: x.a.map((c) => subst(c, v, val)) };
}
export function map(x, f) {
  if (x.t === 'pow') return f(pow(map(x.b, f), map(x.e, f)));
  if (x.a) return f({ ...x, a: x.a.map((c) => map(c, f)) });
  return f(x);
}

// ---------- numeric evaluation ----------
const FACT = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
export function evalNum(x, env = {}) {
  switch (x.t) {
    case 'num': return toNum(x.v);
    case 'sym':
      if (x.n in env) return env[x.n];
      if (x.n === 'pi') return Math.PI;
      if (x.n === 'e') return Math.E;
      if (x.n === 'oo') return Infinity;
      throw new MathError(`Unknown value of ${x.n}`);
    case 'add': return x.a.reduce((s, c) => s + evalNum(c, env), 0);
    case 'mul': return x.a.reduce((s, c) => s * evalNum(c, env), 1);
    case 'pow': {
      const b = evalNum(x.b, env), e = evalNum(x.e, env);
      if (b < 0 && !Number.isInteger(e)) {
        // odd roots of negatives, e.g. (-8)^(1/3)
        if (x.e.t === 'num' && isQ(x.e.v) && x.e.v.d % 2n === 1n) return -Math.pow(-b, e) * (x.e.v.n % 2n === 0n ? -1 : 1);
        return NaN;
      }
      return Math.pow(b, e);
    }
    case 'fn': {
      const a = x.a.map((c) => evalNum(c, env));
      const m = {
        sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: (t) => 1 / Math.cos(t), csc: (t) => 1 / Math.sin(t), cot: (t) => 1 / Math.tan(t),
        asin: Math.asin, acos: Math.acos, atan: Math.atan, acot: (t) => Math.atan(1 / t), asec: (t) => Math.acos(1 / t), acsc: (t) => Math.asin(1 / t),
        sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, ln: Math.log, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
        fact: (n) => (Number.isInteger(n) && n >= 0 ? FACT(n) : gammaFn(n + 1)),
      };
      if (x.n === 'log') return Math.log(a[0]) / Math.log(a[1] ?? 10);
      if (x.n === 'ncr' || x.n === 'npr') { let r = 1; for (let k = 0; k < a[1]; k++) r *= (a[0] - k) / (x.n === 'ncr' ? k + 1 : 1); return Math.round(r); }
      if (x.n === 'coth') return 1 / Math.tanh(a[0]);
      if (x.n === 'sech') return 1 / Math.cosh(a[0]);
      if (x.n === 'csch') return 1 / Math.sinh(a[0]);
      if (x.n === 'max') return Math.max(...a);
      if (x.n === 'min') return Math.min(...a);
      if (m[x.n]) return m[x.n](a[0]);
      throw new MathError(`Unknown function ${x.n}`);
    }
  }
  throw new MathError('Cannot evaluate');
}
function gammaFn(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ---------- simplification ----------
// split term into [numeric coefficient, rest-node or null]
export function coeffSplit(x) {
  if (x.t === 'num') return [x.v, null];
  if (x.t === 'mul') {
    let c = Q.of(1); const rest = [];
    for (const f of x.a) { if (f.t === 'num') c = nvMul(c, f.v); else rest.push(f); }
    return [c, rest.length === 0 ? null : rest.length === 1 ? rest[0] : { t: 'mul', a: rest }];
  }
  return [Q.of(1), x];
}
function baseExp(x) {
  if (x.t === 'pow') return [x.b, x.e];
  return [x, ONE];
}

const ORDER = { num: 0, sym: 1, pow: 2, fn: 3, mul: 4, add: 5 };
function degreeOf(x) {
  // rough total polynomial degree for ordering
  if (x.t === 'sym') return CONSTS.has(x.n) ? 0 : 1;
  if (x.t === 'pow') return x.e.t === 'num' ? toNum(x.e.v) * degreeOf(x.b) : 50;
  if (x.t === 'mul') return x.a.reduce((s, c) => s + degreeOf(c), 0);
  if (x.t === 'fn') return 0.5;
  return 0;
}
function termCompare(a, b) {
  // higher degree first, constants last
  const [, ra] = coeffSplit(a), [, rb] = coeffSplit(b);
  const da = ra ? degreeOf(ra) : -1, db = rb ? degreeOf(rb) : -1;
  if (da !== db) return db - da;
  const ka = ra ? key(ra) : '', kb = rb ? key(rb) : '';
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
function factorRank(f) {
  if (f.t === 'num') return 0;
  const [b, e] = baseExp(f);
  if (f.t === 'pow' && has(f.e) && !has(f.b)) return 4;
  if (b.t === 'sym' && CONSTS.has(b.n) && !has(e)) return 1;
  if (b.t === 'sym') return 2;
  if (f.t === 'pow' && has(f.e) && !has(f.b)) return 4;
  if (b.t === 'fn') return 5;
  if (b.t === 'add') return 6;
  return 7;
}
function factorCompare(a, b) {
  const ra = factorRank(a), rb = factorRank(b);
  if (ra !== rb) return ra - rb;
  const ka = key(baseExp(a)[0]), kb = key(baseExp(b)[0]);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function simplify(x, opts = {}) {
  let prev = null, cur = x, n = 0;
  while (n++ < 6) {
    cur = simp(cur, opts);
    const k = key(cur);
    if (k === prev) break;
    prev = k;
  }
  return cur;
}

function simp(x, opts) {
  switch (x.t) {
    case 'num': return isQ(x.v) ? x : Number.isFinite(x.v) && Number.isInteger(x.v) && Math.abs(x.v) < 1e15 ? num(Q.of(x.v)) : x;
    case 'sym': return x;
    case 'add': return simpAdd(x.a.map((c) => simp(c, opts)));
    case 'mul': return simpMul(x.a.map((c) => simp(c, opts)), opts);
    case 'pow': return simpPow(simp(x.b, opts), simp(x.e, opts), opts);
    case 'fn': return simpFn(x.n, x.a.map((c) => simp(c, opts)), opts);
    case 'rel': return { ...x, a: x.a.map((c) => simp(c, opts)) };
    case 'list': return { ...x, a: x.a.map((c) => simp(c, opts)) };
  }
  return x;
}

function simpAdd(terms) {
  const flat = [];
  for (const t of terms) { if (t.t === 'add') flat.push(...t.a); else flat.push(t); }
  let c = Q.of(0);
  const groups = new Map();
  for (const t of flat) {
    if (t.t === 'num') { c = nvAdd(c, t.v); continue; }
    const [k, rest] = coeffSplit(t);
    const kk = key(rest);
    if (groups.has(kk)) groups.get(kk)[0] = nvAdd(groups.get(kk)[0], k);
    else groups.set(kk, [k, rest]);
  }
  // c*sin(u)^2 + c*cos(u)^2 = c
  for (const [kk, g] of groups) {
    const r = g[1];
    if (r && r.t === 'pow' && r.b.t === 'fn' && r.b.n === 'sin' && isNum(r.e, 2)) {
      const ck = key({ t: 'pow', b: { t: 'fn', n: 'cos', a: r.b.a }, e: r.e });
      const other = groups.get(ck);
      if (other && isQ(other[0]) && isQ(g[0])) {
        const m = g[0].cmp(other[0]) <= 0 ? g[0] : other[0];
        c = nvAdd(c, m); g[0] = g[0].sub(m); other[0] = other[0].sub(m);
      }
    }
    void kk;
  }
  // log(5) + log(2) = log(10) = 1: combine logs with the same base when the result comes out exact
  const logs = new Map();
  for (const [kk, g] of groups) {
    const r = g[1];
    if (!r || r.t !== 'fn' || (r.n !== 'log' && r.n !== 'ln') || !isQ(g[0]) || !g[0].isInt() || r.a[0].t !== 'num' || !isQ(r.a[0].v) || r.a[0].v.sign() <= 0) continue;
    const base = r.n === 'ln' ? 'e' : r.a[1] && r.a[1].t === 'num' && isQ(r.a[1].v) ? r.a[1].v.toString() : null;
    if (!base) continue;
    if (!logs.has(base)) logs.set(base, []);
    logs.get(base).push(kk);
  }
  for (const [base, ks] of logs) {
    if (ks.length < 2) continue;
    let prod = Q.of(1);
    for (const kk of ks) { const [k, r] = groups.get(kk); prod = prod.mul(r.a[0].v.powInt(k.n)); }
    const v = base === 'e' ? (prod.isOne() ? Q.of(0) : null) : exactLog(prod, groups.get(ks[0])[1].a[1].v);
    if (v === null) continue;
    c = nvAdd(c, v);
    for (const kk of ks) groups.delete(kk);
  }
  const out = [];
  for (const [k, rest] of groups.values()) {
    if (nvIsZero(k)) continue;
    out.push(isQ(k) && k.isOne() ? rest : simpMul([num(k), rest]));
  }
  if (!nvIsZero(c)) out.push(num(c));
  if (out.length === 0) return num(isQ(c) ? Q.of(0) : 0);
  if (out.length === 1) return out[0];
  out.sort(termCompare);
  if (!out.some((t) => has(t))) { const nums = out.filter((t) => t.t === 'num'); return { t: 'add', a: [...nums, ...out.filter((t) => t.t !== 'num')] }; }
  return { t: 'add', a: out };
}

function simpMul(factors, opts = {}) {
  const flat = [];
  for (const f of factors) { if (f.t === 'mul') flat.push(...f.a); else flat.push(f); }
  let c = Q.of(1);
  const groups = new Map();
  for (const f of flat) {
    if (f.t === 'num') { c = nvMul(c, f.v); continue; }
    const [b, e] = baseExp(f);
    // numeric bases with symbolic/fractional exponent stay as factors grouped by base
    const kb = key(b);
    if (groups.has(kb)) groups.get(kb)[1].push(e);
    else groups.set(kb, [b, [e]]);
  }
  if (nvIsZero(c)) return num(isQ(c) ? Q.of(0) : 0);
  const out = [];
  for (const [b, es] of groups.values()) {
    const e = es.length === 1 ? es[0] : simpAdd(es);
    const p = simpPow(b, e, opts);
    if (p.t === 'num') c = nvMul(c, p.v);
    else if (p.t === 'mul') { for (const q of p.a) { if (q.t === 'num') c = nvMul(c, q.v); else out.push(q); } }
    else out.push(p);
  }
  // sin(u)/cos(u) -> tan(u), cos(u)/sin(u) -> cot(u)
  for (let i = 0; i < out.length; i++) {
    const [bi, ei] = baseExp(out[i]);
    if (bi.t !== 'fn' || (bi.n !== 'sin' && bi.n !== 'cos') || ei.t !== 'num') continue;
    for (let j = 0; j < out.length; j++) {
      const [bj, ej] = baseExp(out[j]);
      if (i === j || bj.t !== 'fn' || ej.t !== 'num' || bj.n === bi.n || !['sin', 'cos'].includes(bj.n) || !equal(bi.a[0], bj.a[0])) continue;
      if (isQ(ei.v) && isQ(ej.v) && ei.v.add(ej.v).isZero() && ei.v.sign() > 0) {
        const t = { t: 'fn', n: bi.n === 'sin' ? 'tan' : 'cot', a: bi.a };
        out[i] = simpPow(t, ei); out.splice(j, 1);
        break;
      }
    }
  }
  // merge numeric-base radicals through prime powers: sqrt(2)*sqrt(6) -> 2 sqrt(3), 2^(1/6)*4^(1/18) -> 2^(5/18) -> root(18, 32)
  const primes = new Map(), keep = [];
  for (const f of out) {
    if (f.t === 'pow' && f.b.t === 'num' && isQ(f.b.v) && f.e.t === 'num' && isQ(f.e.v) && !f.e.v.isInt() && f.b.v.sign() > 0) {
      for (const [p, k] of primePowerMap(f.b.v)) {
        const e = k.mul(f.e.v), old = primes.get(p);
        primes.set(p, old ? old.add(e) : e);
      }
    } else keep.push(f);
  }
  if (primes.size) {
    // whole parts of the exponents go to the coefficient; the rest share one root index
    let L = 1n, inner = 1n;
    for (const e of primes.values()) L = (L * e.d) / bgcd(L, e.d);
    for (const [p, e] of primes) {
      const fl = e.n / e.d - (e.n < 0n && e.n % e.d !== 0n ? 1n : 0n);
      c = nvMul(c, new Q(p).powInt(fl));
      inner *= p ** ((e.n - fl * e.d) * (L / e.d));
    }
    if (inner !== 1n) {
      const p = simpRadical(new Q(inner), new Q(1n, L));
      if (p.t === 'num') c = nvMul(c, p.v);
      else if (p.t === 'mul') { for (const q of p.a) { if (q.t === 'num') c = nvMul(c, q.v); else keep.push(q); } }
      else keep.push(p);
    }
  }
  if (nvIsZero(c)) return num(0);
  keep.sort(factorCompare);
  if (!(isQ(c) && c.isOne())) keep.unshift(num(c));
  if (keep.length === 0) return num(c);
  if (keep.length === 1) return keep[0];
  return { t: 'mul', a: keep };
}

// Simplify n^(p/q) for rational n: pull out perfect powers. Returns node.
function simpRadical(base, e) {
  // base, e are Q ; base > 0, e non-integer
  const q = e.d, p = e.n;
  const whole = p / q - (p < 0n && p % q !== 0n ? 1n : 0n); // floor
  const frac = new Q(p - whole * q, q); // in (0,1)
  const pre = base.powInt(whole);
  // frac = r/q ; base^(r/q) = (base^r)^(1/q)
  const r = frac.n;
  const inner = base.powInt(r);
  const [on, in_] = extractPower(inner.n, q);
  const [od, id] = extractPower(inner.d, q);
  // base^(r/q) = on/od * (in_/id)^(1/q); rationalize: (in/id)^(1/q) = (in*id^(q-1))^(1/q)/id
  let coef = pre.mul(new Q(on, od));
  let radN = in_ * id ** (q - 1n);
  coef = coef.div(new Q(id));
  const [o2, r2] = extractPower(radN, q);
  coef = coef.mul(new Q(o2)); radN = r2;
  if (radN === 1n) return num(coef);
  const radNode = { t: 'pow', b: num(new Q(radN)), e: num(new Q(1n, q)) };
  if (coef.isOne()) return radNode;
  return { t: 'mul', a: [num(coef), radNode] };
}
// n (positive rational) as primes -> exponent; a factor that can't be split stays whole
export function primePowerMap(n) {
  const m = new Map();
  const addAll = (x, sgn) => {
    if (x <= 1n) return;
    const fs = primeFactors(x);
    if (!fs.length || fs[fs.length - 1] > 10n ** 12n) { m.set(x, (m.get(x) || Q.of(0)).add(Q.of(sgn))); return; }
    for (const p of fs) m.set(p, (m.get(p) || Q.of(0)).add(Q.of(sgn)));
  };
  addAll(n.n, 1); addAll(n.d, -1);
  return m;
}
export function extractPower(n, k) {
  // n = out^k * rest
  if (n <= 1n) return [1n, n];
  let out = 1n, rest = 1n;
  const fs = primeFactors(n);
  if (fs.length && fs[fs.length - 1] > 10n ** 12n) return [1n, n];
  const cnt = new Map();
  fs.forEach((p) => cnt.set(p, (cnt.get(p) || 0n) + 1n));
  for (const [p, c] of cnt) { out *= p ** (c / k); rest *= p ** (c % k); }
  return [out, rest];
}

function simpPow(b, e, opts = {}) {
  if (isNum(e, 0)) return ONE;
  if (isNum(e, 1)) return b;
  if (isNum(b, 1)) return ONE;
  if (isNum(b, 0) && e.t === 'num' && nvSign(e.v) > 0) return ZERO;
  if (b.t === 'num' && e.t === 'num') {
    if (isQ(b.v) && isQ(e.v)) {
      if (e.v.isInt()) {
        if (e.v.abs().cmp(Q.of(5000)) > 0) return num(Math.pow(b.v.toNumber(), e.v.toNumber()));
        return num(nvPowExact(b.v, e.v));
      }
      if (b.v.sign() > 0) return simpRadical(b.v, e.v);
      if (e.v.d % 2n === 1n) { // odd root of negative
        const r = simpRadical(b.v.neg(), e.v);
        return e.v.n % 2n === 0n ? r : simpMul([num(-1), r]);
      }
      return { t: 'pow', b, e };
    }
    return num(Math.pow(toNum(b.v), toNum(e.v)));
  }
  if (b.t === 'pow' && e.t === 'num' && isQ(e.v)) {
    // (x^a)^b -> x^(ab) when safe (b integer, or a odd/integer and base non-negative is unknown -> be careful)
    if (e.v.isInt() || (b.e.t === 'num' && isQ(b.e.v) && !(b.e.v.isInt() && b.e.v.n % 2n === 0n))) {
      return simpPow(b.b, simpMul([b.e, e]), opts);
    }
    // (x^2)^(1/2) = |x|
    if (b.e.t === 'num' && isQ(b.e.v) && b.e.v.isInt() && b.e.v.n % 2n === 0n) {
      const ne = simpMul([b.e, e]);
      const r = simpPow(b.b, ne, opts);
      if (opts.assumePositive) return r;
      if (ne.t === 'num' && isQ(ne.v) && ne.v.isInt() && ne.v.n % 2n === 1n) return simpPow(simpFn('abs', [b.b]), ne);
      return r;
    }
  }
  if (b.t === 'mul' && e.t === 'num' && isQ(e.v) && e.v.isInt()) {
    return simpMul(b.a.map((f) => simpPow(f, e, opts)), opts);
  }
  if (b.t === 'mul' && e.t === 'num' && isQ(e.v)) {
    // pull numeric coefficient out of root: sqrt(4x) -> 2 sqrt(x) when coefficient positive
    const [c, rest] = coeffSplit(b);
    if (isQ(c) && c.sign() > 0 && !c.isOne() && rest) return simpMul([simpPow(num(c), e), simpPow(rest, e)], opts);
  }
  if (b.t === 'sym' && b.n === 'e' && e.t === 'fn' && e.n === 'ln') return e.a[0];
  if (b.t === 'sym' && b.n === 'e' && !has(e) && has(e, 'i')) { // Euler: e^(i t) = cos t + i sin t
    const t = simplify(subst(e, 'i', ONE));
    if (equal(simplify({ t: 'mul', a: [t, sym('i')] }), e) && !has(t, 'i')) {
      return simpAdd([simpFn('cos', [t], opts), simpMul([sym('i'), simpFn('sin', [t], opts)], opts)]);
    }
  }
  if (b.t === 'sym' && b.n === 'i' && isInt(e)) { // i^2 = -1
    const k = Number(((e.v.n % 4n) + 4n) % 4n);
    return [ONE, b, num(-1), { t: 'mul', a: [num(-1), b] }][k];
  }
  if (b.t === 'fn' && b.n === 'abs' && e.t === 'num' && isQ(e.v) && e.v.isInt() && e.v.n % 2n === 0n) return simpPow(b.a[0], e);
  return { t: 'pow', b, e };
}

const SPECIAL = (() => {
  // exact trig values at multiples of pi/6 and pi/4: key = angle/pi as Q string
  const h = sqrt(num(3)), r2 = sqrt(num(2)), half = num(new Q(1n, 2n));
  const s3h = mul(half, h), s2h = mul(half, r2);
  const table = {
    sin: { '0': num(0), '1/6': half, '1/4': s2h, '1/3': s3h, '1/2': num(1), '2/3': s3h, '3/4': s2h, '5/6': half, '1': num(0) },
    cos: { '0': num(1), '1/6': s3h, '1/4': s2h, '1/3': half, '1/2': num(0), '2/3': neg(half), '3/4': neg(s2h), '5/6': neg(s3h), '1': num(-1) },
    tan: { '0': num(0), '1/6': div(h, num(3)), '1/4': num(1), '1/3': h, '2/3': neg(h), '3/4': num(-1), '5/6': neg(div(h, num(3))), '1': num(0) },
  };
  return table;
})();
function piMultiple(x) {
  // return Q k if x == k*pi
  if (isNum(x, 0)) return Q.of(0);
  if (x.t === 'sym' && x.n === 'pi') return Q.of(1);
  if (x.t === 'mul' && x.a.length === 2 && x.a[0].t === 'num' && isQ(x.a[0].v) && x.a[1].t === 'sym' && x.a[1].n === 'pi') return x.a[0].v;
  return null;
}
function trigExact(name, k) {
  // reduce k mod 2
  let r = k.sub(Q.of(2).mul(new Q(floorQ(k.div(Q.of(2))))));
  let sgn = 1;
  if (name === 'tan') { r = r.sub(new Q(floorQ(r))); if (r.eq(new Q(1n, 2n))) return null; }
  else if (r.cmp(Q.of(1)) > 0) { r = r.sub(Q.of(1)); sgn = -1; }
  const v = SPECIAL[name][r.toString()];
  if (!v) return null;
  return simplify(sgn === 1 ? v : neg(v));
}
const floorQ = (q) => { let f = q.n / q.d; if (q.n < 0n && f * q.d !== q.n) f -= 1n; return f; };

function simpFn(n, a, opts = {}) {
  const x = a[0];
  const allNum = a.every((c) => c.t === 'num');
  switch (n) {
    case 'abs':
      if (x.t === 'num') return num(isQ(x.v) ? x.v.abs() : Math.abs(x.v));
      if (x.t === 'mul' && x.a[0].t === 'num' && nvSign(x.a[0].v) < 0) return simpFn('abs', [simpMul([num(-1), x])]);
      if (x.t === 'pow' && x.b.t === 'sym' && isInt(x.e) && x.e.v.n % 2n === 0n) return x;
      if (!has(x)) { const v = evalNum(x); if (v >= 0) return x; return simpMul([num(-1), x]); }
      break;
    case 'ln':
      if (isNum(x, 1)) return ZERO;
      if (x.t === 'sym' && x.n === 'e') return ONE;
      if (x.t === 'pow' && x.b.t === 'sym' && x.b.n === 'e') return x.e;
      if (opts.expandLog && x.t === 'pow' && !has(x.e)) return simpMul([x.e, simpFn('ln', [x.b])]);
      break;
    case 'log': {
      const b = a[1];
      if (isNum(x, 1)) return ZERO;
      if (equal(x, b)) return ONE;
      if (b && b.t === 'sym' && b.n === 'e') return simpFn('ln', [x]);
      if (x.t === 'pow' && equal(x.b, b)) return x.e;
      if (x.t === 'num' && b.t === 'num' && isQ(x.v) && isQ(b.v)) {
        // exact integer logs: log_2(8)=3, log_10(0.001)=-3
        const r = exactLog(x.v, b.v);
        if (r) return num(r);
      }
      break;
    }
    case 'sin': case 'cos': case 'tan': {
      const k = piMultiple(x);
      if (k) { const v = trigExact(n, k); if (v) return v; }
      if (x.t === 'mul' && x.a[0].t === 'num' && nvSign(x.a[0].v) < 0) {
        const inner = simpMul([num(-1), x]);
        return n === 'cos' ? simpFn('cos', [inner]) : simpMul([num(-1), simpFn(n, [inner])]);
      }
      if (x.t === 'fn' && x.n === 'a' + n) return x.a[0];
      break;
    }
    case 'asin': case 'acos': case 'atan': {
      const v = inverseTrigExact(n, x);
      if (v) return v;
      break;
    }
    case 'fact':
      if (isInt(x) && x.v.sign() >= 0 && x.v.n <= 500n) { let r = 1n; for (let i = 2n; i <= x.v.n; i++) r *= i; return num(new Q(r)); }
      break;
    case 'ncr': case 'npr':
      if (a.length === 2 && a.every(isInt) && a[0].v.sign() >= 0 && a[1].v.sign() >= 0 && a[1].v.cmp(a[0].v) <= 0) {
        let r = 1n; const N = a[0].v.n, K = a[1].v.n;
        for (let j = 0n; j < K; j++) r *= N - j;
        let f = 1n; for (let j = 2n; j <= K; j++) f *= j;
        return num(new Q(n === 'ncr' ? r / f : r));
      }
      break;
    case 'gcd': case 'lcm':
      if (allNum && a.every(isInt)) {
        let g = a[0].v.n;
        for (const c of a.slice(1)) g = n === 'gcd' ? bgcd(g, c.v.n) : (g * c.v.n) / bgcd(g, c.v.n);
        return num(new Q(g < 0n ? -g : g));
      }
      break;
    case 'floor': case 'ceil': case 'round': case 'sign': case 'max': case 'min':
      if (allNum) { const v = evalNum({ t: 'fn', n, a }); return num(Number.isInteger(v) ? Q.of(v) : v); }
      break;
  }
  if (allNum && a.some((c) => !isQ(c.v))) return num(evalNum({ t: 'fn', n, a }));
  return { t: 'fn', n, a };
}
function exactLog(x, b) {
  if (x.sign() <= 0 || b.sign() <= 0 || b.isOne()) return null;
  for (let k = -60; k <= 60; k++) if (b.powInt(BigInt(k)).eq(x)) return Q.of(k);
  // fractional: x = b^(p/q) for small q
  for (let q = 2; q <= 6; q++) for (let p = -60; p <= 60; p++) {
    const v = nvPowExact(b, new Q(BigInt(p), BigInt(q)));
    if (v && isQ(v) && v.eq(x)) return new Q(BigInt(p), BigInt(q));
  }
  return null;
}
function inverseTrigExact(n, x) {
  const cand = [0, new Q(1n, 6n), new Q(1n, 4n), new Q(1n, 3n), new Q(1n, 2n), new Q(2n, 3n), new Q(3n, 4n), new Q(5n, 6n), Q.of(1), new Q(-1n, 6n), new Q(-1n, 4n), new Q(-1n, 3n), new Q(-1n, 2n)];
  if (has(x)) return null;
  let xv; try { xv = evalNum(x); } catch { return null; }
  const fwd = n.slice(1);
  for (const k of cand) {
    const kq = Q.of(k);
    // principal ranges
    const kv = kq.toNumber();
    if (n === 'asin' && (kv < -0.5 || kv > 0.5)) continue;
    if (n === 'acos' && (kv < 0 || kv > 1)) continue;
    if (n === 'atan' && (kv <= -0.5 || kv >= 0.5)) continue;
    const ang = kq.isZero() ? ZERO : simpMul([num(kq), PI]);
    const fv = Math[fwd](kv * Math.PI);
    if (Math.abs(fv - xv) < 1e-12) return ang;
  }
  return null;
}

// ---------- expansion ----------
export function expand(x) {
  x = simplify(x);
  const e = expandRec(x);
  return simplify(e);
}
function expandRec(x) {
  switch (x.t) {
    case 'add': return simpAdd(x.a.map(expandRec));
    case 'mul': {
      const fs = x.a.map(expandRec);
      let acc = [ONE];
      for (const f of fs) {
        const terms = f.t === 'add' ? f.a : [f];
        const next = [];
        for (const a of acc) for (const t of terms) next.push(simpMul([a, t]));
        acc = next;
        if (acc.length > 4000) throw new MathError('Expression too large to expand');
      }
      return simpAdd(acc);
    }
    case 'pow': {
      const b = expandRec(x.b);
      if (b.t === 'add' && isInt(x.e) && x.e.v.sign() > 0 && x.e.v.n <= 30n) {
        let r = ONE;
        for (let i = 0n; i < x.e.v.n; i++) r = expandRec({ t: 'mul', a: [r, b] });
        return r;
      }
      if (b.t === 'add' && isInt(x.e) && x.e.v.sign() < 0) return simpPow(expandRec(pow(b, num(x.e.v.neg()))), num(-1));
      return simpPow(b, expandRec(x.e));
    }
    case 'fn': return simpFn(x.n, x.a.map(expandRec));
    default: return x;
  }
}

// ---------- polynomial helpers ----------
// Coefficient list [c0, c1, ..., cn] (nodes) of x in v, or null if not a polynomial in v.
export function polyCoeffs(x, v) {
  const e = expand(x);
  const terms = e.t === 'add' ? e.a : [e];
  const co = [];
  for (const t of terms) {
    const fs = t.t === 'mul' ? t.a : [t];
    let deg = 0; const rest = [];
    for (const f of fs) {
      if (f.t === 'sym' && f.n === v) deg += 1;
      else if (f.t === 'pow' && f.b.t === 'sym' && f.b.n === v && isInt(f.e) && f.e.v.sign() > 0) deg += Number(f.e.v.n);
      else if (has(f, v)) return null;
      else rest.push(f);
    }
    if (deg > 200) return null;
    const c = rest.length ? simpMul(rest) : ONE;
    co[deg] = co[deg] ? simpAdd([co[deg], c]) : c;
  }
  for (let i = 0; i < co.length; i++) if (!co[i]) co[i] = ZERO;
  while (co.length > 1 && isNum(co[co.length - 1], 0)) co.pop();
  if (!co.length) co.push(ZERO);
  return co;
}
export function polyFromCoeffs(co, v) {
  const terms = [];
  for (let i = co.length - 1; i >= 0; i--) {
    if (isNum(co[i], 0)) continue;
    terms.push(simpMul([co[i], i === 0 ? ONE : i === 1 ? sym(v) : pow(sym(v), num(i))]));
  }
  return terms.length ? simplify(add(terms)) : ZERO;
}
export const allRational = (co) => co.every((c) => c.t === 'num' && isQ(c.v));

// Split expression into numerator / denominator (nodes)
export function numerDenom(x) {
  x = simplify(x);
  if (x.t === 'add') {
    // combine over common denominator
    const parts = x.a.map(numerDenom);
    let den = ONE;
    const dens = [];
    for (const [, d] of parts) if (!isNum(d, 1) && !dens.some((k) => equal(k, d))) dens.push(d);
    den = dens.length ? simplify(mul(dens)) : ONE;
    const nums = parts.map(([n, d]) => (isNum(d, 1) ? mul(n, ...dens) : mul(n, ...dens.filter((k) => !equal(k, d)))));
    return [simplify(add(nums)), den];
  }
  const fs = x.t === 'mul' ? x.a : [x];
  const n = [], d = [];
  for (const f of fs) {
    if (f.t === 'pow' && f.e.t === 'num' && nvSign(f.e.v) < 0) d.push(simpPow(f.b, num(isQ(f.e.v) ? f.e.v.neg() : -f.e.v)));
    else if (f.t === 'num' && isQ(f.v) && !f.v.isInt()) { n.push(num(new Q(f.v.n))); d.push(num(new Q(f.v.d))); }
    else n.push(f);
  }
  return [n.length ? simpMul(n) : ONE, d.length ? simpMul(d) : ONE];
}
