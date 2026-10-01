// Tokenizer + Pratt parser producing a "raw" tree that preserves how the user wrote things
// (subtraction, division, parentheses), which the arithmetic stepper relies on.
import { Q, MathError } from './rational.js';

export const FUNCS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'acot', 'asec', 'acsc',
  'sinh', 'cosh', 'tanh', 'ln', 'log', 'sqrt', 'cbrt', 'abs', 'exp', 'floor', 'ceil', 'round',
  'gcd', 'lcm', 'max', 'min', 'root', 'nroot', 'sign', 'ncr', 'npr', 'coth', 'sech', 'csch',
]);
const FUNC_ALIASES = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', arccot: 'acot', sen: 'sin', tg: 'tan', lg: 'log', arcsec: 'asec', arccsc: 'acsc', cosec: 'csc' };
const GREEK = { 'π': 'pi', 'θ': 'theta', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'λ': 'lambda', 'μ': 'mu', 'σ': 'sigma', 'φ': 'phi', 'ω': 'omega', 'Δ': 'Delta', 'δ': 'delta' };
const NAMED = new Set(['pi', 'theta', 'alpha', 'beta', 'gamma', 'lambda', 'mu', 'sigma', 'phi', 'omega', 'infinity', 'inf', 'oo', 'delta', 'Delta']);
const SUPERS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', 'ⁿ': 'n', 'ˣ': 'x' };

export function normalizeInput(s) {
  s = String(s).replace(/\bnCr\b/g, 'ncr').replace(/\bnPr\b/g, 'npr');
  s = s.replace(/[−–—]/g, '-').replace(/[×✕✖⋅·∙]/g, '*').replace(/(\d)\s*[∶:]\s*(?=\d)/g, '$1÷').replace(/≤|=</g, '<=').replace(/≥|=>/g, '>=')
    .replace(/≠|!=|=\/=/g, '!=').replace(/\*\*/g, '^').replace(/∞/g, 'oo').replace(/√/g, ' sqrt').replace(/∛/g, ' cbrt')
    .replace(/[“”]/g, '"').replace(/ /g, ' ').replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/')
    .replace(/\\left|\\right/g, '').replace(/\\pi/g, 'pi').replace(/\\sqrt/g, 'sqrt').replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
    .replace(/\\(sin|cos|tan|ln|log|sec|csc|cot|theta|alpha|beta|infty)/g, (m, a) => (a === 'infty' ? 'oo' : a))
    .replace(/\\le\b/g, '<=').replace(/\\ge\b/g, '>=').replace(/\\neq/g, '!=');
  // group simple typed fractions next to × or ÷:  2/3 ÷ 4/5  ->  (2/3) ÷ (4/5)
  if (/[÷*]/.test(s)) s = s.replace(/(^|[^\w.)^\]])(\d+)\s*\/\s*(\d+)(?![\w.(^\[])/g, '$1($2/$3)');
  // superscript characters -> ^(..)
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿˣ]+/g, (m) => '^(' + [...m].map((c) => SUPERS[c]).join('') + ')');
  return s;
}

function tokenize(src) {
  const s = normalizeInput(src);
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+(?![a-z]))?/i);
      if (!m) throw new MathError(`Unexpected "${c}"`);
      // avoid treating "2e" (2 times e) as exponent notation without digits — regex handles it
      toks.push({ k: 'num', v: m[0] }); i += m[0].length; continue;
    }
    if (GREEK[c]) { toks.push({ k: 'id', v: GREEK[c] }); i++; continue; }
    if (/[a-zA-Z]/.test(c)) {
      const m = s.slice(i).match(/^[a-zA-Z]+/)[0];
      i += m.length;
      splitIdent(m).forEach((t) => toks.push(t));
      continue;
    }
    const two = s.slice(i, i + 2);
    if (['<=', '>=', '!='].includes(two)) { toks.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/÷^()[]{},=<>!%|_;°\''.includes(c)) { toks.push({ k: 'op', v: c === '{' ? '(' : c === '}' ? ')' : c }); i++; continue; }
    throw new MathError(`I don't understand the symbol "${c}"`);
  }
  return toks;
}

// Split a run of letters into function names, named constants and single-letter variables.
function splitIdent(word) {
  const out = [];
  const names = [...FUNCS, ...Object.keys(FUNC_ALIASES), ...NAMED].sort((a, b) => b.length - a.length);
  let w = word;
  outer: while (w.length) {
    for (const nm of names) {
      if (w.startsWith(nm) && (nm.length > 1)) {
        const f = FUNC_ALIASES[nm] || nm;
        out.push(FUNCS.has(f) ? { k: 'fn', v: f } : { k: 'id', v: f === 'inf' || f === 'infinity' ? 'oo' : f });
        w = w.slice(nm.length);
        continue outer;
      }
    }
    out.push({ k: 'id', v: w[0] });
    w = w.slice(1);
  }
  return out;
}

// ---- raw node helpers ----
export const R = {
  num: (src) => ({ t: 'num', v: Q.fromDecimalString(src), src }),
  sym: (n) => ({ t: 'sym', n }),
  bin: (op, l, r, implicit = false) => ({ t: 'bin', op, l, r, implicit }),
  neg: (a) => ({ t: 'neg', a }),
  paren: (a, br = '(') => ({ t: 'paren', a, br }),
  fn: (n, a, base) => ({ t: 'fn', n, a, base }),
};

class Parser {
  constructor(toks) { this.toks = toks; this.i = 0; this.absDepth = 0; }
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  isOp(v, o = 0) { const t = this.peek(o); return t && t.k === 'op' && t.v === v; }
  expect(v) {
    const t = this.next();
    if (!t || t.v !== v) throw new MathError(`Expected "${v}"`);
  }
  startsOperand(t) {
    if (!t) return false;
    if (t.k === 'num' || t.k === 'id' || t.k === 'fn') return true;
    return t.k === 'op' && (t.v === '(' || t.v === '[' || (t.v === '|' && this.absDepth === 0));
  }
  parseTop() {
    const items = [this.parseRelation()];
    while (this.isOp(',') || this.isOp(';')) { this.next(); if (this.peek()) items.push(this.parseRelation()); }
    if (this.peek()) throw new MathError(`Unexpected "${this.peek().v}"`);
    return items.length === 1 ? items[0] : { t: 'list', a: items };
  }
  parseRelation() {
    const first = this.parseExpr(0);
    const ops = [], a = [first];
    while (this.peek() && this.peek().k === 'op' && ['=', '<', '>', '<=', '>=', '!='].includes(this.peek().v)) {
      ops.push(this.next().v);
      a.push(this.parseExpr(0));
    }
    return ops.length ? { t: 'rel', ops, a } : first;
  }
  lbp(t) {
    if (!t) return 0;
    if (t.k === 'op') {
      switch (t.v) {
        case '+': case '-': return 10;
        case '*': case '/': case '÷': return 20;
        case '^': return 30;
        case '!': case '%': case '°': case '\'': return 40;
        case '|': return this.absDepth > 0 ? 0 : 20;
        case '(': case '[': return 20; // implicit multiplication
        default: return 0;
      }
    }
    return 20; // implicit multiplication before number / identifier / function
  }
  parseExpr(rbp) {
    let left = this.nud(this.next());
    while (true) {
      const t = this.peek();
      if (!t) break;
      const bp = this.lbp(t);
      if (bp <= rbp) break;
      left = this.led(t, left);
    }
    return left;
  }
  nud(t) {
    if (!t) throw new MathError('The expression ended too early');
    if (t.k === 'num') return R.num(t.v);
    if (t.k === 'id') return R.sym(t.v);
    if (t.k === 'fn') return this.parseFunction(t.v);
    if (t.k === 'op') {
      if (t.v === '-') return R.neg(this.parseExpr(25));
      if (t.v === '+') return this.parseExpr(25);
      if (t.v === '(' || t.v === '[') {
        const close = t.v === '(' ? ')' : ']';
        const inner = this.parseRelationOrList(close);
        this.expectClose(close);
        return inner.t === 'list' ? inner : R.paren(inner, t.v);
      }
      if (t.v === '|') {
        this.absDepth++;
        const inner = this.parseExpr(0);
        this.absDepth--;
        this.expect('|');
        return R.fn('abs', [inner]);
      }
    }
    throw new MathError(`Unexpected "${t.v}"`);
  }
  parseRelationOrList(close) {
    const saved = this.absDepth; this.absDepth = 0;
    const items = [this.parseExpr(0)];
    while (this.isOp(',')) { this.next(); items.push(this.parseExpr(0)); }
    this.absDepth = saved;
    return items.length > 1 ? { t: 'list', a: items } : items[0];
  }
  expectClose(close) {
    const t = this.next();
    if (!t || !(t.v === ')' || t.v === ']')) throw new MathError(`Missing "${close}"`);
  }
  parseFunction(name) {
    let base = null, power = null;
    if (this.isOp('_')) { // log_2(x)
      this.next();
      const bt = this.next();
      if (bt.k === 'num') base = R.num(bt.v);
      else if (bt.k === 'id') base = R.sym(bt.v);
      else if (bt.v === '(') { base = this.parseExpr(0); this.expectClose(')'); }
      else throw new MathError('Bad log base');
    } else if (name === 'log' && this.peek() && this.peek().k === 'num' && this.isOp('(', 1)) {
      base = R.num(this.next().v); // log2(8)
    }
    if (this.isOp('^') && this.peek(1) && (this.peek(1).k === 'num' || this.isOp('-', 1) || (this.isOp('(', 1) && this.peek(2) && this.peek(2).k === 'num' && this.isOp(')', 3)))) { // sin^2(x), sin^(2)(x)
      this.next();
      power = this.parseExpr(35);
    }
    let args;
    if (this.isOp('(') || this.isOp('[')) {
      this.next();
      const inner = this.parseRelationOrList(')');
      this.expectClose(')');
      args = inner.t === 'list' ? inner.a : [inner];
    } else {
      // no parentheses: take one term, e.g. sin 2x, sqrt 9, ln x^2
      let arg = this.parseExpr(29);
      while (arg.t === 'num' && this.peek() && (this.peek().k === 'id') ) arg = R.bin('*', arg, this.parseExpr(29), true);
      args = [arg];
    }
    if (name === 'log' && args.length === 2) { base = args[1]; args = [args[0]]; }
    if ((name === 'root' || name === 'nroot') && args.length === 2) { return withPow(R.fn('root', args), power); }
    let node = R.fn(name, args, base);
    return withPow(node, power);
  }
  led(t, left) {
    if (t.k === 'op') {
      switch (t.v) {
        case '+': case '-': this.next(); return R.bin(t.v, left, this.parseExpr(10));
        case '*': case '/': this.next(); return R.bin(t.v, left, this.parseExpr(20));
        case '÷': this.next(); return { ...R.bin('/', left, this.parseExpr(20)), obelus: true };
        case '^': this.next(); return R.bin('^', left, this.parseExpr(29)); // right assoc
        case '!': this.next(); return { t: 'fact', a: left };
        case '%': this.next(); return { t: 'pct', a: left };
        case '°': this.next(); return { t: 'deg', a: left };
        case '\'': this.next(); return { t: 'prime', a: left };
      }
    }
    // implicit multiplication
    return R.bin('*', left, this.parseExpr(20), true);
  }
}
function withPow(node, power) { return power ? R.bin('^', node, power) : node; }

export function parse(src) {
  const toks = tokenize(src);
  if (!toks.length) throw new MathError('Please type a math problem');
  return new Parser(toks).parseTop();
}
