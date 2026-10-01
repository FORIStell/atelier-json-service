// Pretty printers: canonical nodes -> LaTeX / plain text; raw parser trees -> LaTeX.
import { Q, isQ, formatNumber, nvSign } from './rational.js';

const SYM_TEX = { pi: '\\pi', theta: '\\theta', alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', lambda: '\\lambda', mu: '\\mu', sigma: '\\sigma', phi: '\\phi', omega: '\\omega', oo: '\\infty', delta: '\\delta', Delta: '\\Delta' };
const FN_TEX = { sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot', asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', ln: '\\ln', exp: '\\exp', acot: '\\operatorname{arccot}', asec: '\\operatorname{arcsec}', acsc: '\\operatorname{arccsc}' };

function numTex(v) {
  if (isQ(v)) {
    if (v.isInt()) return v.n.toString();
    const s = v.sign() < 0 ? '-' : '';
    return `${s}\\frac{${(v.n < 0n ? -v.n : v.n)}}{${v.d}}`;
  }
  const s = formatNumber(v);
  return s.includes('e') ? s.replace(/e([+-]?\d+)/, (m, e) => `\\times 10^{${Number(e)}}`) : s;
}
function numText(v) { return isQ(v) ? v.toString() : formatNumber(v); }

// Is the node "negative-looking" (prints with a leading minus)?
export function isNegative(x) {
  if (x.t === 'num') return nvSign(x.v) < 0;
  if (x.t === 'mul') return x.a[0].t === 'num' && nvSign(x.a[0].v) < 0;
  return false;
}
export function negate(x) {
  if (x.t === 'num') return { t: 'num', v: isQ(x.v) ? x.v.neg() : -x.v };
  if (x.t === 'mul' && x.a[0].t === 'num') {
    const c = isQ(x.a[0].v) ? x.a[0].v.neg() : -x.a[0].v;
    const rest = x.a.slice(1);
    if (isQ(c) && c.isOne()) return rest.length === 1 ? rest[0] : { t: 'mul', a: rest };
    return { t: 'mul', a: [{ t: 'num', v: c }, ...rest] };
  }
  return { t: 'mul', a: [{ t: 'num', v: Q.of(-1) }, x] };
}

const PREC = { add: 1, mul: 2, neg: 2, pow: 4, fn: 5, num: 6, sym: 6 };

export function tex(x) {
  switch (x.t) {
    case 'num': return numTex(x.v);
    case 'sym': return SYM_TEX[x.n] || (x.n.length > 1 ? `\\mathrm{${x.n}}` : x.n);
    case 'add': {
      let s = tex(x.a[0]);
      for (const t of x.a.slice(1)) s += isNegative(t) ? ' - ' + texFactorCtx(negate(t), 1) : ' + ' + texFactorCtx(t, 1);
      return s;
    }
    case 'mul': return mulTex(x);
    case 'pow': return powTex(x);
    case 'fn': return fnTex(x);
    case 'rel': return relJoin(x);
    case 'list': return x.a.map(tex).join(',\\quad ');
    case 'prime': return `\\left(${tex(x.a)}\\right)'`;
  }
  return '?';
}
function relJoin(x) {
  let s = tex(x.a[0]);
  x.ops.forEach((o, i) => { s += ` ${relTex(o)} ` + tex(x.a[i + 1]); });
  return s;
}
export function relTex(o) { return { '=': '=', '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge', '!=': '\\ne' }[o] || o; }
function texFactorCtx(x, ctx) { return x.t === 'add' && ctx >= 1 ? `\\left(${tex(x)}\\right)` : tex(x); }

function splitFrac(x) {
  const fs = x.t === 'mul' ? x.a : [x];
  const n = [], d = [];
  let c = Q.of(1), fc = null;
  for (const f of fs) {
    if (f.t === 'num') { if (isQ(f.v)) c = c.mul(f.v); else fc = (fc ?? 1) * f.v; continue; }
    if (f.t === 'pow' && f.e.t === 'num' && nvSign(f.e.v) < 0) {
      const e = isQ(f.e.v) ? f.e.v.neg() : -f.e.v;
      d.push(isQ(e) && e.isOne() ? f.b : { t: 'pow', b: f.b, e: { t: 'num', v: e } });
    } else n.push(f);
  }
  return { c, fc, n, d };
}
function prodTex(fs, coef) {
  // coef: string for numeric coefficient or ''
  let s = coef;
  let prevNum = coef !== '' && coef !== '-';
  fs.forEach((f, i) => {
    let t = f.t === 'add' ? `\\left(${tex(f)}\\right)` : f.t === 'num' && nvSign(f.v) < 0 ? `\\left(${tex(f)}\\right)` : tex(f);
    const startsDigit = /^[\d.]/.test(t) || (f.t === 'pow' && f.b.t === 'num' && !(f.e.t === 'num' && isQ(f.e.v) && !f.e.v.isInt()));
    if ((prevNum && startsDigit) || (i > 0 && f.t === 'num')) s += ' \\cdot ';
    else if (/\\[a-zA-Z]+$/.test(s) && /^[a-zA-Z]/.test(t)) s += ' ';
    s += t;
    prevNum = true;
  });
  return s;
}
function mulTex(x) {
  const { c, fc, n, d } = splitFrac(x);
  let sign = '';
  let cn = c.n, cd = c.d;
  if (cn < 0n) { sign = '-'; cn = -cn; }
  let coef = '';
  if (fc !== null) { const v = fc * Number(cn) / Number(cd); coef = numTex(Math.abs(v)); if (v < 0) sign = sign ? '' : '-'; cn = 1n; cd = 1n; }
  if (d.length === 0 && cd === 1n) {
    if (cn !== 1n) coef = cn.toString() + coef;
    if (!n.length) return sign + (coef || '1');
    return sign + prodTex(n, coef);
  }
  // fraction form
  const numStr = n.length === 1 && cn === 1n && !coef ? tex(n[0]) : n.length ? prodTex(n, cn !== 1n ? cn.toString() + coef : coef) : (cn.toString() + (coef ? ' \\cdot ' + coef : ''));
  const denParts = [...(cd !== 1n ? [{ t: 'num', v: new Q(cd) }] : []), ...d];
  const denStr = denParts.length === 1 ? tex(denParts[0]) : prodTex(denParts, '');
  return `${sign}\\frac{${numStr}}{${denStr}}`;
}
function powTex(x) {
  const { b, e } = x;
  if (e.t === 'num' && isQ(e.v)) {
    if (e.v.sign() < 0) return mulTex({ t: 'mul', a: [x] });
    if (e.v.eq(new Q(1n, 2n))) return `\\sqrt{${tex(b)}}`;
    if (e.v.n === 1n && e.v.d <= 9n) return `\\sqrt[${e.v.d}]{${tex(b)}}`;
  }
  if (b.t === 'fn' && !['abs', 'fact'].includes(b.n) && FN_TEX[b.n] && e.t === 'num' && isQ(e.v) && e.v.isInt() && e.v.sign() > 0) {
    return `${FN_TEX[b.n]}^{${tex(e)}}\\left(${tex(b.a[0])}\\right)`;
  }
  const needParen = ['add', 'mul', 'pow', 'fn'].includes(b.t) && !(b.t === 'fn' && b.n === 'abs') || (b.t === 'num' && (nvSign(b.v) < 0 || (isQ(b.v) && !b.v.isInt())));
  const bs = needParen ? `\\left(${tex(b)}\\right)` : tex(b);
  return `${bs}^{${tex(e)}}`;
}
function fnTex(x) {
  const a = x.a.map(tex);
  switch (x.n) {
    case 'abs': return `\\left|${a[0]}\\right|`;
    case 'fact': return (['num', 'sym'].includes(x.a[0].t) && !isNegative(x.a[0]) ? a[0] : `\\left(${a[0]}\\right)`) + '!';
    case 'log': {
      const b = x.a[1];
      const base = !b || (b.t === 'num' && isQ(b.v) && b.v.eq(Q.of(10))) ? '' : `_{${tex(b)}}`;
      return `\\log${base}\\left(${a[0]}\\right)`;
    }
    case 'floor': return `\\left\\lfloor ${a[0]}\\right\\rfloor`;
    case 'ceil': return `\\left\\lceil ${a[0]}\\right\\rceil`;
    default: return `${FN_TEX[x.n] || `\\operatorname{${x.n}}`}\\left(${a.join(', ')}\\right)`;
  }
}

// ---------- plain text ----------
export function text(x) {
  switch (x.t) {
    case 'num': return numText(x.v);
    case 'sym': return x.n === 'oo' ? '∞' : x.n === 'pi' ? 'π' : x.n;
    case 'add': {
      let s = text(x.a[0]);
      for (const t of x.a.slice(1)) s += isNegative(t) ? ' - ' + textF(negate(t)) : ' + ' + textF(t);
      return s;
    }
    case 'mul': {
      const { c, fc, n, d } = splitFrac(x);
      let sign = '', coef = c;
      if (fc !== null) coef = null;
      let numPart;
      const fsText = (fs) => fs.map((f) => (f.t === 'add' || (f.t === 'num' && nvSign(f.v) < 0) ? `(${text(f)})` : f.t === 'pow' ? text(f) : textP(f))).join('*');
      if (coef !== null) {
        if (coef.sign() < 0) { sign = '-'; coef = coef.neg(); }
        const cn = new Q(coef.n), cd = coef.d;
        const parts = [];
        if (!cn.isOne() || !n.length) parts.push(cn.toString());
        if (n.length) parts.push(fsText(n));
        numPart = parts.join('*');
        const den = [...(cd !== 1n ? [cd.toString()] : []), ...d.map((f) => (f.t === 'add' || f.t === 'mul' ? `(${text(f)})` : f.t === 'pow' && d.length === 1 && cd === 1n ? text(f) : textP(f)))];
        if (!den.length) return sign + numPart;
        const denS = den.length > 1 ? `(${den.join('*')})` : den[0];
        return `${sign}${n.length > 1 && den.length ? `(${numPart})` : numPart}/${denS}`;
      }
      numPart = [numText(fc * c.toNumber()), ...(n.length ? [fsText(n)] : [])].join('*');
      if (!d.length) return numPart;
      return `${numPart}/${d.length > 1 ? `(${d.map(text).join('*')})` : textP(d[0])}`;
    }
    case 'pow': {
      const { b, e } = x;
      if (e.t === 'num' && isQ(e.v)) {
        if (e.v.sign() < 0) return text({ t: 'mul', a: [x] });
        if (e.v.eq(new Q(1n, 2n))) return `sqrt(${text(b)})`;
      }
      const bs = ['add', 'mul', 'pow'].includes(b.t) || (b.t === 'num' && (nvSign(b.v) < 0 || (isQ(b.v) && !b.v.isInt()))) ? `(${text(b)})` : text(b);
      const es = ['num', 'sym'].includes(e.t) && !isNegative(e) && !(e.t === 'num' && isQ(e.v) && !e.v.isInt()) ? text(e) : `(${text(e)})`;
      return `${bs}^${es}`;
    }
    case 'fn': {
      if (x.n === 'abs') return `|${text(x.a[0])}|`;
      if (x.n === 'fact') return `${textP(x.a[0])}!`;
      if (x.n === 'log') {
        const b = x.a[1];
        if (!b || (b.t === 'num' && isQ(b.v) && b.v.eq(Q.of(10)))) return `log(${text(x.a[0])})`;
        return `log_${textP(b)}(${text(x.a[0])})`;
      }
      return `${x.n}(${x.a.map(text).join(', ')})`;
    }
    case 'rel': { let s = text(x.a[0]); x.ops.forEach((o, i) => { s += ` ${o} ` + text(x.a[i + 1]); }); return s; }
    case 'list': return x.a.map(text).join(', ');
  }
  return '?';
}
const textF = (x) => (x.t === 'add' ? `(${text(x)})` : text(x));
const textP = (x) => (['num', 'sym', 'fn'].includes(x.t) && !isNegative(x) && !(x.t === 'num' && isQ(x.v) && !x.v.isInt()) ? text(x) : `(${text(x)})`);

// ---------- raw (as-typed) trees ----------
export function rawTex(r) {
  switch (r.t) {
    case 'num': return r.src && !isQ(r.v) ? r.src : r.src ?? numTex(r.v);
    case 'sym': return SYM_TEX[r.n] || r.n;
    case 'paren': return r.br === '[' ? `\\left[${rawTex(r.a)}\\right]` : `\\left(${rawTex(r.a)}\\right)`;
    case 'neg': return '-' + (r.a.t === 'bin' && (r.a.op === '+' || r.a.op === '-') ? `\\left(${rawTex(r.a)}\\right)` : rawTex(r.a));
    case 'bin': {
      const l = rawTex(r.l), rr = rawTex(r.r);
      switch (r.op) {
        case '+': return `${l} + ${rawNeg(r.r) ? `\\left(${rr}\\right)` : rr}`;
        case '-': return `${l} - ${rawNeg(r.r) ? `\\left(${rr}\\right)` : rr}`;
        case '*': {
          const rNeedsParen = r.r.t === 'neg' || (r.r.t === 'num' && r.r.v.sign && r.r.v.sign() < 0);
          const rs = rNeedsParen ? `\\left(${rr}\\right)` : rr;
          if (r.implicit && !/^[\d.]/.test(rs) && !(r.l.t === 'num' && (r.r.t === 'num' || (r.r.t === 'bin' && r.r.l.t === 'num')))) return `${l}${rs}`;
          return `${l} \\times ${rs}`;
        }
        case '/':
          if (r.obelus) return `${l} \\div ${rawNeg(r.r) ? `\\left(${rr}\\right)` : rr}`;
          return `\\frac{${stripParen(r.l)}}{${stripParen(r.r)}}`;
        case '^': {
          const bs = ['bin', 'neg'].includes(r.l.t) || rawNeg(r.l) || (r.l.t === 'num' && !r.l.v.isInt?.() && r.l.src === undefined) ? `\\left(${l}\\right)` : l;
          return `${bs}^{${stripParen(r.r)}}`;
        }
      }
      break;
    }
    case 'fn': {
      const a = r.a.map(rawTex);
      if (r.n === 'sqrt') return `\\sqrt{${stripParen(r.a[0])}}`;
      if (r.n === 'cbrt') return `\\sqrt[3]{${stripParen(r.a[0])}}`;
      if (r.n === 'root') return `\\sqrt[${a[0]}]{${a[1]}}`;
      if (r.n === 'abs') return `\\left|${a[0]}\\right|`;
      if (r.n === 'log' && r.base) return `\\log_{${rawTex(r.base)}}\\left(${a[0]}\\right)`;
      return `${FN_TEX[r.n] || (r.n === 'log' ? '\\log' : `\\operatorname{${r.n}}`)}\\left(${a.join(', ')}\\right)`;
    }
    case 'fact': return `${rawTex(r.a)}!`;
    case 'pct': return `${rawTex(r.a)}\\%`;
    case 'deg': return `${rawTex(r.a)}^{\\circ}`;
    case 'rel': { let s = rawTex(r.a[0]); r.ops.forEach((o, i) => { s += ` ${relTex(o)} ` + rawTex(r.a[i + 1]); }); return s; }
    case 'list': return r.a.map(rawTex).join(',\\ ');
  }
  return '?';
}
const rawNeg = (r) => r.t === 'neg' || (r.t === 'num' && (r.v.sign ? r.v.sign() < 0 : r.v < 0));
const stripParen = (r) => rawTex(r.t === 'paren' ? r.a : r);
export { numTex };
