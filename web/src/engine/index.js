// Entry point: figure out what kind of problem the input is and solve it with steps.
import { Q, MathError, isQ, toNum, formatNumber, primeFactors } from './rational.js';
import { parse, normalizeInput } from './parser.js';
import { fromRaw, simplify, expand, has, freeVars, evalNum, isNum, equal, sub, div, mul, add, pow, num, sym, polyCoeffs, numerDenom, subst, allRational, key, ZERO } from './cas.js';
import { tex, text, rawTex, relTex } from './print.js';
import { arithmeticSteps } from './arith.js';
import { factorExpr } from './factor.js';
import { solveEquation, solveInequality, solveSystem, solveCompound, intervalsTex, intervalsText, chooseVar } from './solve.js';
import { derivative, integrate, definiteIntegral, limit } from './calculus.js';
import { toQArray, deg, toNode, rationalRoots, synthDiv } from './poly.js';

const S = (x) => simplify(x);

export function solveProblem(input, opts = {}) {
  const original = String(input).trim();
  if (!original) throw new MathError('Please enter a math problem');
  let s = normalizeInput(original).replace(/\s+/g, ' ').trim();
  const lower = s.toLowerCase();
  const res = (kind, title, inputTex, steps, answerTex, answerText, extra = {}) => ({ kind, title, inputTex, steps, answerTex, answerText, ...extra });
  try {
    return dispatch(s, lower, opts, res);
  } catch (e) {
    if (e instanceof MathError) throw e;
    console.error(e);
    throw new MathError('Sorry, I could not solve that. Check the problem for typos.');
  }
}

function P(src, opts) { return fromRaw(parse(src), { degrees: opts.degrees }); }

function dispatch(s, lower, opts, res) {
  let m;
  // ---------------- statistics ----------------
  if ((m = lower.match(/^(mean|average|median|mode|range|standard deviation|std|variance|sum|stats|statistics)\s*(of)?\s*[:(]?\s*([-\d.,\s]+)\)?$/))) return statistics(m[1], m[3], res);
  // ---------------- prime factorization ----------------
  if ((m = lower.match(/^(prime factori[sz]ation|prime factors|factori[sz]e|factor)\s*(of)?\s*(\d+)$/))) return primeFactorization(BigInt(m[3]), res);
  if ((m = lower.match(/^(gcd|gcf|hcf|lcm|greatest common (?:factor|divisor)|least common multiple)\s*(of)?\s*\(?([\d,\s]+(?:and\s+\d+)?)\)?$/))) {
    const nums = m[3].split(/,|and/).map((x) => x.trim()).filter(Boolean);
    const fname = /lcm|least/.test(m[1]) ? 'lcm' : 'gcd';
    return arithmetic(`${fname}(${nums.join(',')})`, opts, res);
  }
  // ---------------- percentages ----------------
  if ((m = s.match(/^([\d.]+)\s*%\s*of\s*(.+)$/i))) return arithmetic(`(${m[1]}/100)*(${m[2]})`, opts, res, `${m[1]}\\% \\text{ of } ${m[2]}`);
  if ((m = s.match(/^what (?:percent|%) of ([\d.]+) is ([\d.]+)\??$/i)) || (m = s.match(/^([\d.]+) is what (?:percent|%) of ([\d.]+)\??$/i))) {
    const [a, b] = lower.startsWith('what') ? [m[1], m[2]] : [m[2], m[1]];
    return arithmetic(`(${b}/${a})*100`, opts, res);
  }
  // ---------------- derivative ----------------
  if ((m = s.match(/^(?:find\s+)?(?:the\s+)?(second |third |2nd |3rd )?(?:derivative|differentiate|diff)\s*(?:of\s+)?(.+?)(?:\s+(?:with respect to|wrt)\s+([a-z]))?$/i)) ||
      (m = s.match(/^d(\^?[23])?\/d([a-z])(?:\^?[23])?\s*(.+)$/i))) {
    let order = 1, expr, v;
    if (/^d/i.test(s) && m.length === 4 && s.match(/^d(\^?[23])?\/d/)) { order = m[1] ? Number(m[1].replace('^', '')) : 1; v = m[2]; expr = m[3]; }
    else { order = m[1] ? (/(second|2nd)/i.test(m[1]) ? 2 : 3) : 1; expr = m[2]; v = m[3]; }
    return derivativeProblem(expr, v, order, opts, res);
  }
  // ---------------- integral ----------------
  if ((m = s.match(/^(?:∫|integrate|integral|int)\s*(?:of\s+)?(?:_\s*\(?([^\s^]+?)\)?\s*\^\s*\(?([^\s]+?)\)?\s+)?(.+?)$/i))) {
    let a = m[1], b = m[2], body = m[3];
    let mm;
    if (!a && (mm = body.match(/^from\s+(.+?)\s+to\s+(.+?)\s+(?:of\s+)?(.+)$/i))) { a = mm[1]; b = mm[2]; body = mm[3]; }
    if (!a && (mm = body.match(/^(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i))) { body = mm[1]; a = mm[2]; b = mm[3]; }
    if (!a && (mm = body.match(/^\((.+),\s*([^,]+),\s*([^,]+)\)$/))) { body = mm[1]; a = mm[2]; b = mm[3]; }
    let v = null;
    if ((mm = body.match(/^(.*?)\s*d([a-z])\s*$/i)) && mm[1].trim()) { body = mm[1]; v = mm[2]; }
    return integralProblem(body, v, a, b, opts, res);
  }
  // ---------------- limit ----------------
  if ((m = s.match(/^lim(?:it)?\s*(?:_\s*)?\(?\s*([a-z])\s*(?:->|→|to)\s*([^\s)]+)\s*\)?\s*(?:of\s+)?(.+)$/i)) ||
      (m = s.match(/^lim(?:it)?\s*(?:of\s+)?(.+?)\s*(?:,|as)\s*([a-z])\s*(?:->|→|approaches|goes to|to)\s*(.+)$/i))) {
    let v, a, body;
    if (/^lim(?:it)?\s*(?:_\s*)?\(?\s*[a-z]\s*(?:->|→|to)/i.test(s)) { v = m[1]; a = m[2]; body = m[3]; }
    else { body = m[1]; v = m[2]; a = m[3]; }
    return limitProblem(body, v, a, opts, res);
  }
  // ---------------- factor / expand / simplify / solve commands ----------------
  if ((m = s.match(/^factori?[sz]?e?\s+(.+)$/i))) return factorProblem(m[1], opts, res);
  if ((m = s.match(/^expand\s+(.+)$/i))) return expandProblem(m[1], opts, res);
  if ((m = s.match(/^simplify\s+(.+)$/i))) return simplifyProblem(m[1], opts, res);
  let forVar = null;
  if ((m = s.match(/^solve\s+(?:for\s+([a-z])\s*[:,]?\s+)?(.+?)(?:\s+for\s+([a-z]))?$/i))) { s = m[2]; forVar = m[1] || m[3]; }
  if ((m = s.match(/^(.+?)\s+(?:at|when|for|where)\s+([a-z])\s*=\s*(.+)$/i)) && !/[=<>]/.test(m[1])) return evaluateAt(m[1], m[2], m[3], opts, res);
  if ((m = s.match(/^(?:evaluate|calculate|compute|what is|whats|what's)\s+(.+?)\??$/i))) s = m[1];
  s = s.replace(/\band\b/gi, ',');

  const raw = parse(s);
  if (raw.t === 'list') {
    const items = raw.a.map((r) => fromRaw(r, { degrees: opts.degrees }));
    if (items.every((it) => it.t === 'rel' && it.ops.length === 1 && it.ops[0] === '=')) return systemProblem(items, raw, res);
    throw new MathError('Separate several equations with commas to solve them as a system');
  }
  const node = fromRaw(raw, { degrees: opts.degrees });
  if (node.t === 'rel') {
    if (node.ops.length === 2) return compoundProblem(node, raw, forVar, res);
    const [l, r] = node.a;
    const op = node.ops[0];
    if (op === '=') {
      // y = f(x) style function?
      if (!forVar && l.t === 'sym' && l.n === 'y' && !has(r, 'y') && has(r, 'x')) return functionAnalysis(r, raw, res);
      if (!forVar && l.t === 'prime') return derivativeProblem(text(l.a), null, 1, opts, res);
      return equationProblem(l, r, raw, forVar, res);
    }
    return inequalityProblem(l, op, r, raw, forVar, res);
  }
  if (node.t === 'prime') return derivativeProblem(text(node.a), null, 1, opts, res);
  if (!has(node)) return arithmetic(s, opts, res, null, raw);
  return simplifyProblem(s, opts, res, raw);
}

// ===================== problem types =====================
function arithmetic(src, opts, res, inputTex, raw) {
  raw = raw || parse(src);
  const hasConst = (() => { try { return has(fromRaw(raw), undefined) === false && /pi|\be\b|π/.test(src); } catch { return false; } })();
  if (hasConst) {
    const node = fromRaw(raw, { degrees: opts.degrees });
    const exact = S(node);
    const v = evalNum(exact);
    const steps = [{ title: 'Start with the problem', math: rawTex(raw) }, { title: 'Simplify exactly', math: tex(exact) }, { title: 'Decimal value', math: `\\approx ${formatNumber(v)}` }];
    return res('arithmetic', 'Evaluate', inputTex || rawTex(raw), steps, `${tex(exact)}${exact.t === 'num' ? '' : ` \\approx ${formatNumber(v)}`}`, `${text(exact)} ≈ ${formatNumber(v)}`);
  }
  const r = arithmeticSteps(raw, opts);
  return res('arithmetic', 'Calculate', inputTex || rawTex(raw), r.steps, r.answerTex, r.answerText);
}

function simplifyProblem(src, opts, res, raw) {
  raw = raw || parse(src);
  const node = fromRaw(raw, { degrees: opts.degrees });
  const steps = [{ title: 'Start with the expression', math: rawTex(raw) }];
  let cur = S(node);
  // rational expression: factor & cancel
  const [N, D] = numerDenom(cur);
  const vars = [...freeVars(cur)];
  if (has(D) && vars.length >= 1) {
    let fN, fD;
    try { fN = factorExpr(N, []).result; fD = factorExpr(D, []).result; } catch { fN = N; fD = D; }
    steps.push({ title: 'Factor the numerator and the denominator', math: `\\frac{${tex(fN)}}{${tex(fD)}}` });
    const reduced = cancelFactors(fN, fD);
    if (reduced) {
      steps.push({ title: 'Cancel the common factors', math: tex(reduced.result), detail: reduced.cancelled.length ? `\\text{cancelled: } ${reduced.cancelled.map(tex).join(',\\ ')}` : undefined });
      cur = reduced.result;
      if (reduced.cancelled.length) steps.push({ title: 'Restriction', detail: reduced.cancelled.map((c) => `${tex(c)} \\ne 0`).join(',\\ ') });
    }
    return res('simplify', 'Simplify', rawTex(raw), steps, tex(cur), text(cur));
  }
  const ex = expand(node);
  if (!equal(ex, S(node))) {
    if (key(S(node)) !== key(node)) steps.push({ title: 'Combine like terms', math: tex(S(node)) });
    steps.push({ title: 'Expand (distribute) and combine like terms', math: tex(ex) });
    cur = ex;
  } else if (tex(cur) !== rawTex(raw)) steps.push({ title: 'Simplify (combine like terms and powers)', math: tex(cur) });
  else steps.push({ title: 'This expression is already as simple as it gets' });
  const extra = {};
  // also show a factored form for polynomials
  if (vars.length >= 1) {
    try {
      const f = factorExpr(cur, []).result;
      if (!equal(f, cur) && tex(f) !== tex(cur)) { steps.push({ title: 'Factored form', math: tex(f) }); extra.alt = tex(f); }
    } catch { /* ignore */ }
  }
  if (vars.length === 1) extra.graph = { expr: text(cur), v: vars[0] };
  return res('simplify', 'Simplify', rawTex(raw), steps, tex(cur), text(cur), extra);
}
function cancelFactors(n, d) {
  const fl = (x) => (x.t === 'mul' ? x.a : [x]);
  const nf = fl(n).slice(), df = fl(d).slice();
  const cancelled = [];
  for (let i = 0; i < nf.length; i++) {
    const [nb, ne] = nf[i].t === 'pow' && isNum(nf[i].e) ? [nf[i].b, nf[i].e.v] : [nf[i], Q.of(1)];
    if (!has(nb)) continue;
    for (let j = 0; j < df.length; j++) {
      const [db, de] = df[j].t === 'pow' && isNum(df[j].e) ? [df[j].b, df[j].e.v] : [df[j], Q.of(1)];
      let sign = 1;
      let match = equal(nb, db);
      if (!match && equal(S(mul(num(-1), nb)), db)) { match = true; sign = -1; }
      if (match && isQ(ne) && isQ(de)) {
        const k = ne.cmp(de) < 0 ? ne : de;
        cancelled.push(db);
        nf[i] = S(pow(nb, num(ne.sub(k)))); df[j] = S(pow(db, num(de.sub(k))));
        if (sign < 0 && k.n % 2n === 1n) nf.push(num(-1));
        break;
      }
    }
  }
  if (!cancelled.length) {
    const r = S(div(n, d));
    return { result: r, cancelled };
  }
  return { result: S(div(mul(nf), mul(df))), cancelled };
}

function factorProblem(src, opts, res) {
  const raw = parse(src);
  const node = fromRaw(raw);
  const { result, steps } = factorExpr(node);
  return res('factor', 'Factor', rawTex(raw), steps, tex(result), text(result));
}
function expandProblem(src, opts, res) {
  const raw = parse(src);
  const node = fromRaw(raw);
  const steps = [{ title: 'Start with the expression', math: rawTex(raw) }];
  // show binomial squares / FOIL explanation
  const sn = S(node);
  if (sn.t === 'pow' && sn.b.t === 'add' && sn.b.a.length === 2 && isNum(sn.e, 2)) {
    const [a, b] = sn.b.a;
    steps.push({ title: 'Use $(a + b)^2 = a^2 + 2ab + b^2$', math: `\\left(${tex(a)}\\right)^2 + 2\\left(${tex(a)}\\right)\\left(${tex(b)}\\right) + \\left(${tex(b)}\\right)^2` });
  } else if (sn.t === 'mul' && sn.a.filter((f) => f.t === 'add').length === 2 && sn.a.length === 2) {
    const [[a, b], [c, d]] = sn.a.map((f) => f.a.length === 2 ? f.a : [f, ZERO]);
    steps.push({ title: 'FOIL: First, Outer, Inner, Last', math: [mul(a, c), mul(a, d), mul(b, c), mul(b, d)].map((t) => tex(S(t))).join(' + ').replace(/\+ -/g, '- ') });
  } else steps.push({ title: 'Distribute (multiply every term by every term)' });
  const ex = expand(node);
  steps.push({ title: 'Combine like terms', math: tex(ex) });
  return res('expand', 'Expand', rawTex(raw), steps, tex(ex), text(ex));
}

function genTex(g) {
  // put the "+ 2πk" part last
  if (g.t !== 'add') return tex(g);
  const withK = g.a.filter((t) => has(t, 'k')), rest = g.a.filter((t) => !has(t, 'k'));
  if (!rest.length) return tex(g);
  const kt = tex(S(add(withK)));
  return `${tex(S(add(rest)))} ${kt.startsWith('-') ? '- ' + kt.slice(1) : '+ ' + kt}`;
}
function solutionTex(v, r) {
  if (r.all) return '\\text{all real numbers}';
  if (r.general) return r.general.map((g) => `${v} = ${genTex(g)}`).join(',\\quad ') + ',\\ k \\in \\mathbb{Z}';
  if (!r.solutions.length) return r.complex && r.complex.length ? `\\text{no real solutions}\\quad(${r.complex.map((z) => `${v} = ${tex(z)}`).join(',\\ ')})` : '\\text{no solution}';
  return r.solutions.map((s) => {
    let t = `${v} = ${tex(s)}`;
    try { const n = evalNum(s); if (!(s.t === 'num' && isQ(s.v) && s.v.isInt()) && Number.isFinite(n) && !has(s)) t += ` \\approx ${formatNumber(n, 6)}`; } catch { /* symbolic */ }
    return t;
  }).join(',\\quad ');
}
function solutionText(v, r) {
  if (r.all) return 'All real numbers';
  if (r.general) return r.general.map((g) => `${v} = ${text(g)}`).join(', ') + ' (k any integer)';
  if (!r.solutions.length) return r.complex && r.complex.length ? 'No real solutions' : 'No solution';
  return r.solutions.map((s) => `${v} = ${text(s)}`).join(', ');
}

function equationProblem(l, r, raw, forVar, res) {
  const v = chooseVar([l, r], forVar);
  if (!v) {
    const ok = Math.abs(evalNum(S(sub(l, r)))) < 1e-10;
    return res('check', 'Check', rawTex(raw), [{ title: 'Evaluate both sides', math: `${tex(S(l))} ${ok ? '=' : '\\ne'} ${tex(S(r))}` }], ok ? '\\text{True}' : '\\text{False}', ok ? 'True' : 'False');
  }
  const steps = [{ title: 'Start with the equation', math: rawTex(raw) }];
  const result = solveEquation(l, r, v, steps);
  const answerTex = solutionTex(v, result);
  steps.push({ title: 'Answer', math: answerTex });
  const extra = {};
  if (freeVars(S(sub(l, r))).size === 1) extra.graph = { expr: text(S(sub(l, r))), v, roots: (result.solutions || []).map((s) => { try { return evalNum(s); } catch { return null; } }).filter((x) => x !== null) };
  return res('equation', `Solve for ${v}`, rawTex(raw), steps, answerTex, solutionText(v, result), extra);
}

function inequalityProblem(l, op, r, raw, forVar, res) {
  const v = chooseVar([l, r], forVar);
  if (!v) { const d = evalNum(S(sub(l, r))); const ok = { '<': d < 0, '>': d > 0, '<=': d <= 0, '>=': d >= 0, '!=': d !== 0 }[op]; return res('check', 'Check', rawTex(raw), [], ok ? '\\text{True}' : '\\text{False}', ok ? 'True' : 'False'); }
  const steps = [{ title: 'Start with the inequality', math: rawTex(raw) }];
  const out = solveInequality(l, op, r, v, steps);
  const ans = intervalsTex(out.intervals, v);
  steps.push({ title: 'Answer', math: ans });
  return res('inequality', `Solve for ${v}`, rawTex(raw), steps, ans, intervalsText(out.intervals, v));
}
function compoundProblem(node, raw, forVar, res) {
  const v = chooseVar(node.a, forVar);
  const steps = [{ title: 'Start with the compound inequality', math: rawTex(raw) }];
  const out = solveCompound(node.a, node.ops, v, steps);
  const ans = intervalsTex(out.intervals, v);
  steps.push({ title: 'Answer', math: ans });
  return res('inequality', `Solve for ${v}`, rawTex(raw), steps, ans, intervalsText(out.intervals, v));
}
function systemProblem(items, raw, res) {
  const eqs = items.map((it) => it.a);
  const steps = [{ title: 'Start with the system', math: `\\begin{cases} ${items.map(tex).join(' \\\\ ')} \\end{cases}` }];
  const out = solveSystem(eqs, steps);
  let ans, ansText;
  if (out.none) { ans = '\\text{no solution}'; ansText = 'No solution'; }
  else if (out.infinite) { ans = '\\text{infinitely many solutions}'; ansText = 'Infinitely many solutions'; }
  else if (out.multi) { ans = out.multi.map((s) => `(${out.vars.map((q) => `${q} = ${tex(s[q])}`).join(',\\ ')})`).join(',\\quad ') || '\\text{no solution}'; ansText = out.multi.map((s) => '(' + out.vars.map((q) => `${q} = ${text(s[q])}`).join(', ') + ')').join(', '); }
  else { ans = out.vars.map((q) => `${q} = ${tex(out.values[q])}`).join(',\\quad '); ansText = out.vars.map((q) => `${q} = ${text(out.values[q])}`).join(', '); }
  steps.push({ title: 'Answer', math: ans });
  return res('system', 'Solve the system', `\\begin{cases} ${items.map(tex).join(' \\\\ ')} \\end{cases}`, steps, ans, ansText);
}

function functionAnalysis(f, raw, res) {
  const steps = [{ title: 'Start with the function', math: rawTex(raw) }];
  const co = polyCoeffs(f, 'x');
  const fs = S(f);
  if (co && co.length === 2) {
    const [b, m] = co.map(S);
    steps.push({ title: 'This is a line in slope-intercept form $y = mx + b$', math: `y = ${tex(fs)}` });
    steps.push({ title: 'Slope', math: `m = ${tex(m)}` });
    steps.push({ title: 'y-intercept (set $x = 0$)', math: `b = ${tex(b)} \\quad (0,\\ ${tex(b)})` });
    const xi = S(div(mul(num(-1), b), m));
    steps.push({ title: 'x-intercept (set $y = 0$)', math: `0 = ${tex(fs)} \\Rightarrow x = ${tex(xi)} \\quad (${tex(xi)},\\ 0)` });
    return res('function', 'Analyze the line', rawTex(raw), steps, `m = ${tex(m)},\\ b = ${tex(b)}`, `slope ${text(m)}, y-intercept ${text(b)}`, { graph: { expr: text(fs), v: 'x' } });
  }
  if (co && co.length === 3 && allRational(co)) {
    const [c, b, a] = co.map((n) => n.v);
    steps.push({ title: 'This is a parabola $y = ax^2 + bx + c$', detail: `a = ${tex(num(a))},\\ b = ${tex(num(b))},\\ c = ${tex(num(c))}` });
    const h = b.neg().div(a.mul(Q.of(2)));
    const k = a.mul(h).mul(h).add(b.mul(h)).add(c);
    steps.push({ title: 'Vertex: $x = -\\frac{b}{2a}$, then plug in to find $y$', math: `x = -\\frac{${tex(num(b))}}{2 \\cdot ${tex(num(a))}} = ${tex(num(h))},\\quad y = ${tex(num(k))}` });
    steps.push({ title: `It opens ${a.sign() > 0 ? 'upward (minimum point)' : 'downward (maximum point)'}; axis of symmetry`, math: `x = ${tex(num(h))}` });
    steps.push({ title: 'Vertex form', math: `y = ${tex(S(add(mul(num(a), pow(sub(sym('x'), num(h)), num(2))), num(k))))}` });
    const st = [];
    const roots = solveEquation(f, ZERO, 'x', st);
    steps.push({ title: 'x-intercepts (solve $y = 0$)', math: roots.solutions.length ? roots.solutions.map((r) => `x = ${tex(r)}`).join(',\\quad ') : '\\text{none (the parabola does not cross the x-axis)}' });
    steps.push({ title: 'y-intercept', math: `(0,\\ ${tex(num(c))})` });
    return res('function', 'Analyze the parabola', rawTex(raw), steps, `\\text{vertex } \\left(${tex(num(h))},\\ ${tex(num(k))}\\right)`, `vertex (${h}, ${k})`, { graph: { expr: text(fs), v: 'x' } });
  }
  const st = [];
  let roots = { solutions: [] };
  try { roots = solveEquation(f, ZERO, 'x', st); } catch { /* ignore */ }
  steps.push({ title: 'x-intercepts (solve $y = 0$)', math: roots.solutions.length ? roots.solutions.map((r) => `x = ${tex(r)}`).join(',\\quad ') : '\\text{none found}' });
  try { const y0 = S(subst(f, 'x', ZERO)); steps.push({ title: 'y-intercept (set $x = 0$)', math: `y = ${tex(y0)}` }); } catch { /* undefined */ }
  try { const d = derivative(f, 'x', []); steps.push({ title: 'Derivative (slope at any point)', math: `y' = ${tex(d)}` }); } catch { /* ignore */ }
  return res('function', 'Analyze the function', rawTex(raw), steps, `y = ${tex(fs)}`, `y = ${text(fs)}`, { graph: { expr: text(fs), v: 'x' } });
}

function derivativeProblem(src, v, order, opts, res) {
  const raw = parse(src);
  const node = fromRaw(raw);
  v = v || chooseVar([node]) || 'x';
  const steps = [];
  let cur = S(node);
  const d = `\\frac{d${order > 1 ? `^{${order}}` : ''}}{d${v}${order > 1 ? `^{${order}}` : ''}}`;
  for (let k = 1; k <= order; k++) {
    if (order > 1) steps.push({ title: `Derivative number ${k}` });
    const st = [];
    const r = derivative(cur, v, st);
    // order steps: outer rule first then inner details (already in that order)
    st.forEach((s) => steps.push(s));
    steps.push({ title: 'Simplify', math: `${k === 1 ? `\\frac{d}{d${v}}` : `\\frac{d}{d${v}}`}\\left[${tex(cur)}\\right] = ${tex(r)}` });
    cur = r;
  }
  const ans = `${d}\\left[${rawTex(raw)}\\right] = ${tex(cur)}`;
  return res('derivative', order > 1 ? `Derivative (order ${order})` : 'Derivative', `${d}\\left[${rawTex(raw)}\\right]`, steps, tex(cur), text(cur), { graph: freeVars(cur).size <= 1 ? { expr: text(S(node)), v, deriv: text(cur) } : undefined, full: ans });
}
function integralProblem(src, v, a, b, opts, res) {
  const raw = parse(src);
  const node = fromRaw(raw);
  v = v || chooseVar([node]) || 'x';
  const steps = [];
  if (a !== undefined && a !== null) {
    const A = S(P(a, opts)), B = S(P(b, opts));
    const head = `\\int_{${tex(A)}}^{${tex(B)}} ${rawTex(raw)}\\,d${v}`;
    steps.push({ title: 'Start with the definite integral', math: head });
    const out = definiteIntegral(node, v, A, B, steps);
    const val = out.value;
    let vt = tex(val);
    try { const n = evalNum(val); if (!(val.t === 'num')) vt += ` \\approx ${formatNumber(n)}`; } catch { /* */ }
    return res('integral', 'Definite integral', head, steps, (out.approx ? '\\approx ' : '') + vt, text(val), { graph: { expr: text(S(node)), v, shade: [evalNum(A), evalNum(B)] } });
  }
  const head = `\\int ${rawTex(raw)}\\,d${v}`;
  steps.push({ title: 'Start with the integral', math: head });
  const F = integrate(node, v, steps);
  if (!F) throw new MathError('I could not find this antiderivative step by step. Try a definite integral (with limits) for a numeric answer.');
  let ans = S(F);
  try { const ex = expand(ans); if (text(ex).length < text(ans).length) ans = ex; } catch { /* keep */ }
  steps.push({ title: 'Add the constant of integration $C$', math: `${tex(ans)} + C` });
  // verify by differentiating
  try {
    const back = derivative(ans, v, []);
    const ok = [0.37, 1.3, 2.1].every((x) => { const p = evalNum(back, { [v]: x }), q = evalNum(node, { [v]: x }); return !Number.isFinite(p) || !Number.isFinite(q) || Math.abs(p - q) < 1e-6 * Math.max(1, Math.abs(q)); });
    if (ok) steps.push({ title: 'Check: differentiating the answer gives back the original function ✓' });
  } catch { /* skip */ }
  return res('integral', 'Integral', head, steps, `${tex(ans)} + C`, `${text(ans)} + C`);
}
function limitProblem(body, v, a, opts, res) {
  const raw = parse(body);
  const node = fromRaw(raw);
  let dir = 0;
  a = a.trim();
  if (/[+-]$/.test(a) && !/^[+-]?oo$|inf/i.test(a)) { dir = a.endsWith('+') ? 1 : -1; a = a.slice(0, -1); }
  const A = S(P(a, opts));
  const head = `\\lim_{${v} \\to ${tex(A)}${dir > 0 ? '^+' : dir < 0 ? '^-' : ''}} ${rawTex(raw)}`;
  const steps = [{ title: 'Start with the limit', math: head }];
  const out = limit(node, v, A, steps, dir);
  const ans = out.dne ? '\\text{does not exist}' : (out.approx ? '\\approx ' : '') + tex(out.value);
  return res('limit', 'Limit', head, steps, ans, out.dne ? 'Does not exist' : text(out.value));
}
function evaluateAt(exprSrc, v, valSrc, opts, res) {
  const raw = parse(exprSrc);
  const node = fromRaw(raw, { degrees: opts.degrees });
  const val = P(valSrc, opts);
  const steps = [{ title: 'Start with the expression', math: rawTex(raw) }];
  const subRaw = substituteRaw(raw, v, parse(valSrc));
  steps.push({ title: `Substitute $${v} = ${tex(S(val))}$`, math: rawTex(subRaw) });
  if (freeVars(subst(node, v, val)).size === 0) {
    try {
      const r = arithmeticSteps(subRaw, opts);
      r.steps.slice(1).forEach((s) => steps.push(s));
      return res('evaluate', 'Evaluate', `${rawTex(raw)}\\ \\text{at}\\ ${v} = ${tex(S(val))}`, steps, r.answerTex, r.answerText);
    } catch { /* fall back */ }
  }
  const out = S(subst(node, v, val));
  steps.push({ title: 'Simplify', math: tex(out) });
  return res('evaluate', 'Evaluate', rawTex(raw), steps, tex(out), text(out));
}
function substituteRaw(r, v, val) {
  if (r.t === 'sym' && r.n === v) return { t: 'paren', a: val, br: '(' };
  const out = { ...r };
  for (const k of ['l', 'r', 'a', 'base']) {
    if (!r[k]) continue;
    out[k] = Array.isArray(r[k]) ? r[k].map((c) => substituteRaw(c, v, val)) : substituteRaw(r[k], v, val);
  }
  return out;
}

function primeFactorization(n, res) {
  if (n < 2n) throw new MathError('Prime factorization needs a whole number ≥ 2');
  const steps = [];
  let cur = n; const fs = primeFactors(n);
  for (const p of fs) { steps.push({ title: `Divide by the prime $${p}$`, math: `${cur} \\div ${p} = ${cur / p}` }); cur /= p; }
  const cnt = new Map(); fs.forEach((p) => cnt.set(p, (cnt.get(p) || 0) + 1));
  const ans = [...cnt].map(([p, c]) => (c > 1 ? `${p}^{${c}}` : `${p}`)).join(' \\times ');
  steps.push({ title: fs.length === 1 ? `${n} is a prime number` : 'Write the primes together (with exponents)', math: `${n} = ${ans}` });
  return res('prime', 'Prime factorization', `${n}`, steps, ans, [...cnt].map(([p, c]) => (c > 1 ? `${p}^${c}` : `${p}`)).join(' × '));
}
function statistics(kind, list, res) {
  const xs = list.split(/[,\s]+/).filter(Boolean).map(Number);
  if (!xs.length || xs.some((x) => Number.isNaN(x))) throw new MathError('Please give a list of numbers');
  const steps = [{ title: 'Data', math: xs.join(',\\ ') }];
  const n = xs.length, sum = xs.reduce((a, b) => a + b, 0), mean = sum / n;
  const sorted = xs.slice().sort((a, b) => a - b);
  const F = (x) => formatNumber(x, 8);
  const meanStep = () => steps.push({ title: 'Mean = sum ÷ count', math: `\\frac{${xs.join(' + ').replace(/\+ -/g, '- ')}}{${n}} = \\frac{${F(sum)}}{${n}} = ${F(mean)}` });
  kind = kind.toLowerCase();
  if (kind === 'sum') { steps.push({ title: 'Add them up', math: `${F(sum)}` }); return res('stats', 'Sum', xs.join(', '), steps, F(sum), F(sum)); }
  if (kind === 'mean' || kind === 'average') { meanStep(); return res('stats', 'Mean', xs.join(', '), steps, F(mean), F(mean)); }
  if (kind === 'median') {
    steps.push({ title: 'Sort the numbers', math: sorted.join(',\\ ') });
    const med = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    steps.push({ title: n % 2 ? 'Take the middle number' : 'Average the two middle numbers', math: n % 2 ? F(med) : `\\frac{${sorted[n / 2 - 1]} + ${sorted[n / 2]}}{2} = ${F(med)}` });
    return res('stats', 'Median', xs.join(', '), steps, F(med), F(med));
  }
  if (kind === 'mode') {
    const c = new Map(); xs.forEach((x) => c.set(x, (c.get(x) || 0) + 1));
    const max = Math.max(...c.values());
    const modes = [...c].filter(([, k]) => k === max).map(([x]) => x);
    steps.push({ title: 'Count how often each number appears', math: [...c].map(([x, k]) => `${x}: ${k}`).join(',\\ ') });
    const ans = max === 1 ? '\\text{no mode}' : modes.join(',\\ ');
    return res('stats', 'Mode', xs.join(', '), steps, ans, max === 1 ? 'No mode' : modes.join(', '));
  }
  if (kind === 'range') { steps.push({ title: 'Largest minus smallest', math: `${sorted[n - 1]} - ${sorted[0]} = ${F(sorted[n - 1] - sorted[0])}` }); return res('stats', 'Range', xs.join(', '), steps, F(sorted[n - 1] - sorted[0]), F(sorted[n - 1] - sorted[0])); }
  meanStep();
  const sq = xs.map((x) => (x - mean) ** 2), ss = sq.reduce((a, b) => a + b, 0);
  steps.push({ title: 'Square each distance from the mean', math: xs.map((x, i) => `(${x} - ${F(mean)})^2 = ${F(sq[i])}`).join(',\\ ') });
  const popVar = ss / n, sampVar = n > 1 ? ss / (n - 1) : NaN;
  steps.push({ title: 'Variance = average of the squares (population: ÷ n, sample: ÷ (n−1))', math: `\\sigma^2 = \\frac{${F(ss)}}{${n}} = ${F(popVar)},\\quad s^2 = \\frac{${F(ss)}}{${n - 1}} = ${F(sampVar)}` });
  if (kind === 'variance') return res('stats', 'Variance', xs.join(', '), steps, `\\sigma^2 = ${F(popVar)},\\ s^2 = ${F(sampVar)}`, `population ${F(popVar)}, sample ${F(sampVar)}`);
  steps.push({ title: 'Standard deviation = square root of the variance', math: `\\sigma = ${F(Math.sqrt(popVar))},\\quad s = ${F(Math.sqrt(sampVar))}` });
  return res('stats', 'Statistics', xs.join(', '), steps, `\\bar{x} = ${F(mean)},\\ \\sigma = ${F(Math.sqrt(popVar))},\\ s = ${F(Math.sqrt(sampVar))}`, `mean ${F(mean)}, σ ${F(Math.sqrt(popVar))}, s ${F(Math.sqrt(sampVar))}`);
}

export { MathError };
