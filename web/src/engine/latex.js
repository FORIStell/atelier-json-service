// LaTeX (from the math keyboard editor) -> the plain text the engine understands.
// e.g. \frac{1}{2}+\sqrt[3]{8}  ->  ((1)/(2))+root(3, 8)
//      \int_{0}^{1}x^2\,dx      ->  integrate from 0 to 1 of x^(2) dx
import { MathError } from './rational.js';

const SYMBOLS = {
  pi: 'pi', infty: 'oo', theta: 'theta', alpha: 'alpha', beta: 'beta', gamma: 'gamma', lambda: 'lambda', mu: 'mu', sigma: 'sigma',
  phi: 'phi', varphi: 'phi', omega: 'omega', delta: 'delta', Delta: 'Delta', exponentialE: 'e', imaginaryI: 'i',
  cdot: '*', times: '×', div: '÷', ast: '*', pm: '+', le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', lt: '<', gt: '>',
  degree: '°', circ: '°', to: '->', rightarrow: '->', percent: '%', lbrace: '(', rbrace: ')', lbrack: '[', rbrack: ']', vert: '|', lvert: '|', rvert: '|', mid: '|',
  cdots: '', ldots: '', dots: '', colon: ':',
};
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc', 'sinh', 'cosh', 'tanh', 'coth',
  'ln', 'log', 'exp', 'lg', 'gcd', 'lcm', 'max', 'min', 'det', 'sign', 'sgn', 'abs', 'floor', 'ceil', 'round', 'mod']);
const SPACES = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'enspace', 'thinspace', 'medspace', 'thickspace', 'space']);

function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const m = s.slice(i + 1).match(/^([a-zA-Z]+|.)/);
      if (!m) break;
      out.push({ cmd: m[1] });
      i += 1 + m[1].length;
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    out.push({ ch: c });
    i++;
  }
  return out;
}

class Conv {
  constructor(toks) { this.t = toks; this.i = 0; }
  peek() { return this.t[this.i]; }
  next() { return this.t[this.i++]; }
  isCh(c) { const t = this.peek(); return t && t.ch === c; }
  isCmd(c) { const t = this.peek(); return t && t.cmd === c; }
  // one argument: {group} or a single token
  arg() {
    const t = this.peek();
    if (!t) throw new MathError('Something is missing after a symbol');
    if (t.ch === '{') { this.next(); const s = this.until('}'); this.next(); return s; }
    return this.atom();
  }
  optArg() {
    if (!this.isCh('[')) return null;
    this.next();
    const s = this.until(']');
    this.next();
    return s;
  }
  until(close) {
    let s = '';
    while (this.peek() && !(this.peek().ch === close)) s = join(s, this.item());
    return s;
  }
  rest(stop = () => false) {
    let s = '';
    while (this.peek() && !stop(this.peek())) s = join(s, this.item());
    return s;
  }
  atom() {
    const t = this.next();
    if (t.ch) return t.ch === '{' ? (() => { const s = this.until('}'); this.next(); return s; })() : t.ch;
    return this.command(t.cmd);
  }
  item() {
    const t = this.peek();
    if (t.ch === '^') { this.next(); const a = this.arg(); return a === '°' ? '°' : `^(${a})`; }
    if (t.ch === '_') { this.next(); return `_(${this.arg()})`; }
    if (t.ch === '\'') { this.next(); return '\''; }
    return this.atom();
  }
  command(c) {
    if (c === 'placeholder') { if (this.isCh('[')) this.optArg(); this.arg(); throw new MathError('Fill in the empty boxes first'); }
    if (SPACES.has(c)) return ' ';
    if (c === 'left' || c === 'right' || c === 'big' || c === 'Big' || c === 'bigl' || c === 'bigr') {
      const t = this.next();
      if (!t) return '';
      if (t.ch === '.') return '';
      if (t.cmd) return SYMBOLS[t.cmd] ?? '';
      return t.ch === '{' ? '(' : t.ch === '}' ? ')' : t.ch;
    }
    if (c === 'frac' || c === 'dfrac' || c === 'tfrac') {
      const a = this.arg(), b = this.arg();
      // d/dx  or  d^2/dx^2
      const dm = clean(a).match(/^d(\^\((\d)\))?$/), vm = clean(b).match(/^d([a-z])(\^\((\d)\))?$/);
      if (dm && vm) return `d${dm[2] ? '^' + dm[2] : ''}/d${vm[1]}${dm[2] ? '^' + dm[2] : ''} `;
      return `((${a})/(${b}))`;
    }
    if (c === 'sqrt') {
      const n = this.optArg();
      const a = this.arg();
      return n ? `root(${n}, ${a})` : `sqrt(${a})`;
    }
    if (c === 'binom') { const n = this.arg(), k = this.arg(); return `ncr(${n}, ${k})`; }
    if (c === 'operatorname' || c === 'mathrm' || c === 'text' || c === 'textrm' || c === 'mathit' || c === 'mathbf' || c === 'differentialD' || c === 'mathop') {
      if (c === 'differentialD') return 'd';
      const a = this.arg();
      return a.replace(/\s+/g, '');
    }
    if (c === 'lim') {
      let sub = '';
      if (this.isCh('_')) { this.next(); sub = this.arg(); }
      const m = clean(sub).match(/^([a-z])->(.+)$/);
      if (!m) throw new MathError('Write the limit as lim x→a');
      let a = m[2].replace(/\^\(([+-])\)$/, '$1');
      return `lim ${m[1]}->${a} `;
    }
    if (c === 'int') {
      let lo = null, hi = null;
      for (let k = 0; k < 2; k++) {
        if (this.isCh('_')) { this.next(); lo = this.arg(); }
        else if (this.isCh('^')) { this.next(); hi = this.arg(); }
      }
      let body = this.rest();
      // the differential at the end: dx, \,dx, \mathrm{d}x
      let v = null;
      const m = body.match(/^(.*?)\s*d\s*([a-z])\s*$/);
      if (m) { body = m[1]; v = m[2]; }
      if (lo !== null || hi !== null) {
        if (lo === null || hi === null) throw new MathError('A definite integral needs both limits');
        return `integrate from ${lo} to ${hi} of ${body}${v ? ' d' + v : ''}`;
      }
      return `∫ ${body}${v ? ' d' + v : ''}`;
    }
    if (c === 'sum' || c === 'prod') {
      let lo = null, hi = null;
      for (let k = 0; k < 2; k++) {
        if (this.isCh('_')) { this.next(); lo = this.arg(); }
        else if (this.isCh('^')) { this.next(); hi = this.arg(); }
      }
      const m = lo && clean(lo).match(/^([a-z])=(.+)$/);
      if (!m || hi === null) throw new MathError('Write the sum like Σ from n=1 to 10');
      return `${c === 'sum' ? 'Σ' : 'Π'}[${m[1]}=${m[2]}..${hi}] ${this.rest()}`;
    }
    if (c === 'begin') {
      const env = clean(this.arg());
      const rows = [[]];
      let cell = '';
      while (this.peek() && !this.isCmd('end')) {
        const t = this.peek();
        if (t.ch === '&') { this.next(); rows[rows.length - 1].push(cell); cell = ''; continue; }
        if (t.cmd === '\\') { this.next(); rows[rows.length - 1].push(cell); cell = ''; rows.push([]); continue; }
        cell = join(cell, this.item());
      }
      rows[rows.length - 1].push(cell);
      if (this.isCmd('end')) { this.next(); this.arg(); }
      const R = rows.filter((r) => r.some((x) => x.trim()));
      const mat = '[' + R.map((r) => '[' + r.map((x) => x.trim()).join(',') + ']').join(',') + ']';
      if (env === 'vmatrix') return `det ${mat}`;
      if (env === 'cases' || env === 'aligned' || env === 'array') return R.map((r) => r.join('')).join(', ');
      return mat;
    }
    if (c === '\\') return ', ';
    if (FUNCS.has(c)) return ` ${c === 'sgn' ? 'sign' : c === 'lg' ? 'log' : c} `;
    if (c in SYMBOLS) return SYMBOLS[c];
    if (c === '{' || c === '}') return c === '{' ? '(' : ')';
    if (c === '%') return '%';
    if (c === '#') return '';
    // unknown command: keep its name (e.g. \sech -> sech)
    return ` ${c} `;
  }
}
const clean = (s) => s.replace(/\s+/g, '');
function join(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = a[a.length - 1], y = b[0];
  // keep digits together (12 not 1 2), separate letters so "sin" + "x" doesn't become "sinx"
  if (/[0-9.]/.test(x) && /[0-9.]/.test(y)) return a + b;
  if (/[a-zA-Z0-9)]/.test(x) && /[a-zA-Z(]/.test(y)) return a + ' ' + b;
  return a + b;
}

export function latexToText(latex) {
  const c = new Conv(tokenize(String(latex)));
  const out = c.rest();
  return out.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}
