// Turn a photo / drawing into a math expression string.
// Pipeline: binarize -> connected components -> merge stacked parts (=, i, ÷, ≤ ...)
// -> classify each symbol with the CNN -> find fractions, square roots, exponents -> text.
import { binarize, components, symbolImage } from './preprocess.js';

const DIGITS = new Set('0123456789');
const LETTERS = new Set('abcdefghiklmnoprstuvwxyz');
const WORDS = ['sqrt', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'lim', 'ln'];
// letters that are often confused with digits / operators
const TO_DIGIT = { o: '0', l: '1', i: '1', '|': '1', z: '2', s: '5', b: '6', g: '9', q: '9', t: '+' };

const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const bbox = (parts) => {
  const x0 = Math.min(...parts.map((p) => p.x0)), y0 = Math.min(...parts.map((p) => p.y0));
  const x1 = Math.max(...parts.map((p) => p.x1)), y1 = Math.max(...parts.map((p) => p.y1));
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
const mkItem = (parts, extra = {}) => ({ parts, ...bbox(parts), ...extra });
const xOverlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
const yOverlap = (a, b) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);

export function recognizeMask(mask, w, h, model) {
  let comps = components(mask, w, h).filter((c) => !(c.w > 0.95 * w && c.h > 0.95 * h));
  if (!comps.length) return { lines: [], items: [] };
  const big = comps.filter((c) => c.area >= 12);
  let medH = median((big.length ? big : comps).map((c) => c.h));
  comps = comps.filter((c) => Math.max(c.w, c.h) >= Math.max(2, 0.12 * medH));
  // page edges, table lines, shadows: long things touching the border or very long thin lines
  const touches = (c) => c.x0 <= 1 || c.y0 <= 1 || c.x1 >= w - 1 || c.y1 >= h - 1;
  comps = comps.filter((c) => !(touches(c) && Math.max(c.w, c.h) > 2.2 * medH) && !(Math.max(c.w, c.h) > 7 * medH && Math.min(c.w, c.h) < 0.3 * Math.max(c.w, c.h)) && !(c.area > 0.6 * c.w * c.h && c.w > 3 * medH && c.h > 3 * medH));
  if (!comps.length) return { lines: [], items: [] };
  medH = median(comps.filter((c) => !isFlat(c, medH) && !isDot(c, medH)).map((c) => c.h)) || medH;
  const ctx = { model, w, medH };

  let items = mergeStacked(comps.map((c) => mkItem([c])), ctx);
  items.forEach((it) => classify(it, ctx));
  items = items.flatMap((it) => splitTouching(it, ctx, 0));
  items = findStructures(items, ctx);
  const lines = splitLines(items, medH);
  const texts = [], boxes = [];
  for (const ln of lines) {
    const t = postProcess(lineTokens(ln, ctx));
    if (!t.trim()) continue;
    texts.push(t);
    const b = bbox(ln.flatMap((it) => it.parts));
    const pad = Math.round(0.35 * medH);
    boxes.push({ x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad), x1: Math.min(w, b.x1 + pad), y1: Math.min(h, b.y1 + pad) });
  }
  return { lines: texts, boxes, items: flatItems(items) };
}


const isFlat = (c, medH) => c.h < 0.4 * c.w && c.h < 0.45 * medH;
const isBarLike = (c, medH) => c.h < 0.7 * c.w && c.h < 0.45 * medH;
const isDot = (c, medH) => Math.max(c.w, c.h) < 0.3 * medH && c.w < 1.7 * c.h && c.h < 2.5 * c.w;

function classify(it, ctx) {
  if (it.label) return;
  const { medH } = ctx;
  if (isDot(it, medH) && it.parts.length === 1) { it.label = '.'; it.probs = null; return; }
  if ((isFlat(it, medH) || (it.w > 1.6 * it.h && it.h < 0.3 * medH)) && it.parts.length === 1) { it.label = '-'; it.probs = null; return; }
  const p = ctx.model.predict(symbolImage(it.parts, ctx.w));
  const order = [...p.keys()].sort((a, b) => p[b] - p[a]);
  it.probs = p;
  it.top = order.slice(0, 4).map((k) => [ctx.model.classes[k], p[k]]);
  it.label = it.top[0][0];
}
const prob = (it, ch, ctx) => { if (!it.probs) return it.label === ch ? 1 : 0; const k = ctx.model.classes.indexOf(ch); return k < 0 ? 0 : it.probs[k]; };

// Two symbols written so close that they touch: try cutting at the thinnest column
function splitTouching(it, ctx, depth) {
  if (depth > 2 || it.parts.length !== 1 || !it.top || it.w < 1.15 * it.h || it.h < 0.5 * ctx.medH) return [it];
  const conf = it.top[0][1];
  if (conf > 0.9) return [it];
  const c = it.parts[0], w = ctx.w;
  const cols = new Array(c.w).fill(0);
  for (const i of c.px) cols[(i % w) - c.x0]++;
  let best = null;
  for (let x = Math.floor(c.w * 0.25); x <= Math.ceil(c.w * 0.75); x++) {
    const v = cols[x] + 0.5 * ((cols[x - 1] || 0) + (cols[x + 1] || 0));
    if (!best || v < best.v) best = { x, v };
  }
  if (!best) return [it];
  const cut = c.x0 + best.x;
  const mk = (px) => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const i of px) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, y0, x1: x1 + 1, y1: y1 + 1, w: x1 + 1 - x0, h: y1 + 1 - y0, area: px.length, px };
  };
  const L = c.px.filter((i) => i % w < cut), R = c.px.filter((i) => i % w >= cut);
  if (L.length < 0.15 * c.area || R.length < 0.15 * c.area) return [it];
  const a = mkItem([mk(L)]), b = mkItem([mk(R)]);
  if (a.h < 0.3 * it.h || b.h < 0.3 * it.h) return [it];
  classify(a, ctx); classify(b, ctx);
  const pa = a.top ? a.top[0][1] : 0.6, pb = b.top ? b.top[0][1] : 0.6;
  if (Math.min(pa, pb) > conf + 0.15 && Math.min(pa, pb) > 0.6) return [...splitTouching(a, ctx, depth + 1), ...splitTouching(b, ctx, depth + 1)];
  return [it];
}

// Merge parts of symbols that are written as several strokes stacked vertically.
function mergeStacked(items, ctx) {
  const { medH } = ctx;
  items.sort((a, b) => a.cx - b.cx);
  const used = new Set();
  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    let cur = items[i];
    for (let j = 0; j < items.length; j++) {
      if (j === i || used.has(j)) continue;
      const o = items[j];
      const xo = xOverlap(cur, o);
      {
        const bar = isBarLike(cur, medH) ? cur : isBarLike(o, medH) ? o : null, body = bar === cur ? o : cur;
        if (bar && body !== bar && !isBarLike(body, medH) && !isDot(body, medH) && xo > 0.3 * bar.w && bar.w < 1.2 * body.w) {
          const g = Math.max(bar.y0, body.y0) - Math.min(bar.y1, body.y1);
          if (g < 0.06 * medH && bar.cy < body.y0 + 0.35 * body.h) {
            used.add(j); cur = mkItem([...cur.parts, ...o.parts]); continue;
          }
        }
      }
      if (xo < 0.45 * Math.min(cur.w, o.w)) continue;
      if (yOverlap(cur, o) > 0.25 * Math.min(cur.h, o.h)) continue;
      const gap = Math.max(cur.y0, o.y0) - Math.min(cur.y1, o.y1);
      if (gap > 0.75 * medH) continue;
      const flatA = isBarLike(cur, medH), flatB = isBarLike(o, medH);
      const dotA = isDot(cur, medH), dotB = isDot(o, medH);
      let merge = null;
      if (flatA && flatB && Math.min(cur.w, o.w) > 0.5 * Math.max(cur.w, o.w) && gap < 0.6 * medH && cur.parts.length === 1) merge = '=';
      else if ((dotA && !flatB) || (dotB && !flatA)) {
        const dot = dotA ? cur : o, body = dotA ? o : cur;
        if (body.h > 1.5 * dot.h && body.w < 0.7 * medH) merge = dot.cy < body.cy ? 'i' : '!';
      } else if ((flatA && (dotB || cur.parts.length > 1 && dotB)) || (flatB && dotA) || (cur.label === '÷?' && (dotA || dotB))) merge = '÷?';
      else if ((flatA !== flatB) && !dotA && !dotB) {
        const bar = flatA ? cur : o, top = flatA ? o : cur;
        // ≤ ≥ : a short bar right under an angle of similar width
        if (bar.cy > top.cy && gap < 0.35 * medH && bar.w < 1.4 * top.w && top.w > 0.55 * bar.w) {
          const cand = mkItem([...cur.parts, ...o.parts]);
          const it = { ...cand };
          classify(it, ctx);
          if ((it.label === '≤' || it.label === '≥') && it.top[0][1] > 0.35) merge = it.label;
        }
      }
      if (merge) {
        used.add(j);
        const parts = [...cur.parts, ...o.parts];
        cur = mkItem(parts, merge === '÷?' ? { label: '÷?' } : merge === 'i' ? {} : { label: merge === '!' ? '!' : merge, probs: null });
        if (merge === 'i') { cur.forceLetter = true; }
      }
    }
    if (cur.label === '÷?') cur.label = cur.parts.length >= 3 ? '÷' : undefined;
    if (cur.label === undefined) delete cur.label;
    out.push(cur);
  }
  // an "i"-like merge can also be j or ! -> let the model decide between those
  for (const it of out) if (it.forceLetter) { classify(it, ctx); if (!['i', '!'].includes(it.label)) it.label = prob(it, 'i', ctx) > prob(it, '!', ctx) ? 'i' : it.label; }
  return out;
}

// Fractions and square roots become blocks with nested content
function findStructures(items, ctx) {
  const { medH } = ctx;
  // square roots
  for (const r of items.filter((it) => it.label === '√' || (it.top && it.top.some(([c, p]) => c === '√' && p > 0.25)))) {
    if (!items.includes(r)) continue;
    const inside = items.filter((o) => o !== r && o.cx > r.x0 + 0.25 * r.w && o.cx < r.x1 + 0.1 * r.w && o.cy > r.y0 && o.cy < r.y1 + 0.1 * r.h);
    if (!inside.length) { r.label = '√'; continue; }
    items = items.filter((o) => !inside.includes(o) && o !== r);
    items.push(mkItem([r, ...inside].flatMap((o) => o.parts), { kind: 'sqrt', inner: findStructures(inside, ctx) }));
  }
  // fraction bars, widest first
  const bars = items.filter((it) => it.label === '-' && it.w > 0.45 * medH).sort((a, b) => b.w - a.w);
  for (const bar of bars) {
    if (!items.includes(bar)) continue;
    const inSpan = (o) => o.cx > bar.x0 - 0.1 * bar.w && o.cx < bar.x1 + 0.1 * bar.w;
    const above = items.filter((o) => o !== bar && inSpan(o) && o.y1 <= bar.cy + 1 && bar.y0 - o.y1 < 1.3 * medH);
    const below = items.filter((o) => o !== bar && inSpan(o) && o.y0 >= bar.cy - 1 && o.y0 - bar.y1 < 1.3 * medH);
    if (!above.length || !below.length) continue;
    // the bar should be at least about as wide as what it divides
    const aw = bbox(above.flatMap((o) => o.parts)).w, bw = bbox(below.flatMap((o) => o.parts)).w;
    if (bar.w < 0.6 * Math.max(aw, bw)) continue;
    items = items.filter((o) => o !== bar && !above.includes(o) && !below.includes(o));
    const all = [bar, ...above, ...below].flatMap((o) => o.parts);
    items.push(mkItem(all, { kind: 'frac', num: findStructures(above, ctx), den: findStructures(below, ctx), barY: bar.cy }));
  }
  return items;
}

// Lines = groups separated by empty horizontal bands (projection profile)
function splitLines(items, medH) {
  const sorted = items.slice().sort((a, b) => a.y0 - b.y0);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && it.y0 < last.y1 + 0.5 * medH) { last.items.push(it); last.y1 = Math.max(last.y1, it.y1); }
    else lines.push({ items: [it], y0: it.y0, y1: it.y1 });
  }
  return lines.map((l) => l.items);
}

const isBaseItem = (it) => it.kind || /^[0-9a-zπθ)\]∞!×]$/.test(it.label || '');
function lineTokens(items, ctx) {
  items = items.slice().sort((a, b) => a.x0 - b.x0 || a.cx - b.cx);
  const medH = median(items.filter((it) => !it.kind && !isDot(it, ctx.medH) && !isFlat(it, ctx.medH)).map((it) => it.h)) || ctx.medH;
  const toks = [];
  let base = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    // superscript: raised and smaller than the symbol before it
    const OPS = '=+-×÷<>≤≥.·';
    const bodyH = base && 'gpqy'.includes(base.label) ? 0.62 * base.h : base ? base.h : 0;
    const raisedLimit = base && base.kind ? 0.35 : 0.5;
    if (base && isBaseItem(base) && !OPS.includes(it.label) && !isBarLike(it, medH) && it.y1 <= base.y0 + raisedLimit * bodyH + 0.1 * it.h && it.cy < base.y0 + 0.3 * bodyH && it.h < 1.3 * bodyH) {
      const group = [it];
      const raised = (o) => o && o.cy < base.y0 + 0.3 * bodyH && o.y1 <= base.y0 + (raisedLimit + 0.15) * bodyH;
      // operators continue an exponent only when clearly high up and followed by more raised symbols (x^(n-1))
      const opRaised = (o) => o.cy < Math.min(base.y0 + 0.1 * bodyH, it.y1) && o.cy > it.y0 - 0.2 * it.h;
      while (i + 1 < items.length && raised(items[i + 1]) && (!OPS.includes(items[i + 1].label) || (opRaised(items[i + 1]) && raised(items[i + 2])))) group.push(items[++i]);
      const inner = lineTokens(group, { ...ctx, medH: Math.max(4, median(group.map((g) => g.h))) });
      if (base.label === '∫') toks.push({ t: '^', sup: inner });
      else toks.push({ t: '^', sup: inner });
      continue;
    }
    // subscript under an integral sign / log base
    if (base && (base.label === '∫' || base.label === 'g') && it.y0 >= base.y0 + 0.5 * base.h && it.h < 0.8 * base.h && !isFlat(it, medH)) {
      const group = [it];
      while (i + 1 < items.length && items[i + 1].y0 >= base.y0 + 0.5 * base.h && items[i + 1].x0 < it.x1 + 0.6 * medH && items[i + 1].h < 0.8 * base.h) group.push(items[++i]);
      toks.push({ t: '_', sub: lineTokens(group, ctx) });
      continue;
    }
    if (it.kind === 'frac') toks.push({ t: 'frac', num: lineTokens(it.num, ctx), den: lineTokens(it.den, ctx) });
    else if (it.kind === 'sqrt') toks.push({ t: 'sqrt', inner: lineTokens(it.inner, ctx) });
    else if (it.label === '.') {
      const mid = it.cy < (base ? base.y0 + 0.7 * base.h : Infinity);
      toks.push({ t: !mid ? '.' : it.w >= 1.2 * it.h ? '-' : '·', it });
    }
    else toks.push({ t: it.label, it });
    if (!(it.label === '.' || it.label === '-')) base = it;
  }
  return toks;
}

// Fix common mix-ups using the neighbours, then produce text
function postProcess(toks) {
  const s = render(toks);
  return s.replace(/\s+/g, ' ').trim();
}
function render(toks) {
  // letter / digit context fixes on the flat token list
  const t = toks.map((x) => ({ ...x }));
  const isDig = (x) => x && DIGITS.has(x.t);
  // a "(" or ")" without a partner, written next to digits, is usually a 1
  {
    let depth = 0; const opens = [];
    const unmatched = new Set();
    t.forEach((x, i) => { if (x.t === '(') opens.push(i); else if (x.t === ')') { if (opens.length) opens.pop(); else unmatched.add(i); } });
    opens.forEach((i) => unmatched.add(i));
    for (const i of unmatched) { if ((isDig(t[i - 1]) || isDig(t[i + 1])) && t[i].it) t[i].t = '1'; }
    void depth;
  }
  // function names: look for sin, cos, tan, log, ln, lim, sqrt using top-3 guesses
  for (let i = 0; i < t.length; i++) {
    for (const w of WORDS) {
      if (i + w.length > t.length) continue;
      let ok = true;
      for (let k = 0; k < w.length; k++) {
        const x = t[i + k];
        if (!x.it || !(x.t === w[k] || (x.it.top && x.it.top.slice(0, 3).some(([c, p]) => c === w[k] && p > 0.08)))) { ok = false; break; }
      }
      if (ok) { for (let k = 0; k < w.length; k++) { t[i + k].t = w[k]; t[i + k].inW = true; } t[i].wordStart = w; i += w.length - 1; break; }
    }
  }
  // fuzzy: 2 of 3 letters right and followed by an argument, e.g. "co5(x)" -> cos(x)
  const LOOK = { s: '5o∫', o: '0ac', n: 'mhr', i: '1l|', c: '(e', t: '+f', a: 'o', g: '9y', l: '1|i', e: 'c' };
  for (let i = 0; i + 3 <= t.length; i++) {
    if (t[i].wordStart || t[i + 1].wordStart || t[i + 2].wordStart || !t[i].it) continue;
    const nxt = t[i + 3];
    if (!nxt || !(nxt.t === '(' || nxt.t === 'θ' || nxt.t === 'π' || LETTERS.has(nxt.t) || nxt.t === '^')) continue;
    for (const w of ['sin', 'cos', 'tan', 'log', 'sec', 'cot']) {
      let match = 0, near = 0;
      for (let k = 0; k < 3; k++) { const x = t[i + k]; if (x.t === w[k]) match++; else if ((LOOK[w[k]] || '').includes(x.t) || (x.it && x.it.top && x.it.top.some(([c]) => c === w[k]))) near++; }
      if (match === 2 && near === 1) { for (let k = 0; k < 3; k++) { t[i + k].t = w[k]; t[i + k].inW = true; } t[i].wordStart = w; break; }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      if (!x.it || !x.it.top || x.inW) continue;
      const prev = t[i - 1], next = t[i + 1];
      if (TO_DIGIT[x.t] && (isDig(prev) || isDig(next)) && !inWord(t, i)) {
        const d = TO_DIGIT[x.t];
        const alt = x.it.top.find(([c]) => c === d);
        if (alt && alt[1] > 0.04) x.t = d;
        else if (x.t === 'o' || x.t === 'l' || x.t === 'z') x.t = d;
      }
      if (x.t === 't' && !inWord(t, i) && x.it.top.some(([c, p]) => c === '+' && p > 0.1)) x.t = '+';
    }
  }
  const bars = t.filter((x) => x.t === '|').length;
  for (let i = 0; i < t.length; i++) {
    const x = t[i];
    if ((x.t === '|' && bars < 2) || (x.t === 'l' && !inWord(t, i))) x.t = '1';
    if (x.t === '/' && (t.length === 1 || i === 0 || /^[-+=×÷<>≤≥(]$/.test(t[i - 1].t))) x.t = '1';
  }
  // × or x ?
  const letters = t.filter((x) => LETTERS.has(x.t) && x.t !== 'x').length;
  const between = (i) => { const prev = t[i - 1], next = t[i + 1]; return prev && next && (isDig(prev) || prev.t === ')' || prev.t === 'frac') && (isDig(next) || next.t === '(' || next.t === 'frac'); };
  const xs = t.map((x, i) => (x.t === 'x' || x.t === '×' ? i : -1)).filter((i) => i >= 0);
  const allBetween = xs.length > 0 && xs.every(between);
  for (const i of xs) {
    const strongTimes = t[i].it && t[i].it.top && t[i].it.top.some(([c, p]) => c === '×' && p > 0.5);
    t[i].t = between(i) && (allBetween && letters === 0 || strongTimes) ? '×' : 'x';
  }
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const x = t[i];
    if (x.wordStart && out && /[\w)]$/.test(out)) out += ' ';
    switch (x.t) {
      case '^': out += '^(' + render(x.sup) + ')'; break;
      case '_': out += '_(' + render(x.sub) + ')'; break;
      case 'frac': out += '(' + render(x.num) + ')/(' + render(x.den) + ')'; break;
      case 'sqrt': out += 'sqrt(' + render(x.inner) + ')'; break;
      case '∞': out += 'oo'; break;
      case '·': out += '*'; break;
      case '∫': out += '∫ '; break;
      case '√': out += 'sqrt'; break;
      case '=': case '<': case '>': case '≤': case '≥': out += ' ' + x.t + ' '; break;
      case '+': case '-': out += ' ' + x.t + ' '; break;
      default: out += x.t;
    }
    if (x.wordStart === undefined && WORDS.includes(funcEnding(t, i))) out += ' ';
  }
  // integral: make "dx" explicit
  out = out.replace(/∫\s*_\(([^)]*)\)\^\(([^)]*)\)/, '∫_($1)^($2) ');
  return out;
}
function inWord(t, i) {
  for (const w of WORDS) for (let s = Math.max(0, i - w.length + 1); s <= i; s++) {
    if (s + w.length > t.length) continue;
    let ok = true;
    for (let k = 0; k < w.length; k++) { const x = t[s + k]; if (!x || !(x.t === w[k] || (x.it && x.it.top && x.it.top.slice(0, 3).some(([c, p]) => c === w[k] && p > 0.08)))) { ok = false; break; } }
    if (ok) return true;
  }
  return false;
}
function funcEnding(t, i) {
  for (const w of WORDS) { if (i - w.length + 1 < 0) continue; if (t.slice(i - w.length + 1, i + 1).map((x) => x.t).join('') === w) return w; }
  return '';
}
function flatItems(items) {
  return items.map((it) => ({ x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, label: it.kind || it.label }));
}

export function recognizeImageData(g, w, h, model, opts = {}) {
  const mask = binarize(g, w, h, opts);
  return recognizeMask(mask, w, h, model);
}
