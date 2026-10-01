import { solveProblem } from './src/engine/index.js';
import { parse } from './src/engine/parser.js';
import { rawTex } from './src/engine/print.js';
import { fromRaw, evalNum } from './src/engine/cas.js';
import { SymbolModel } from './src/ocr/model.js';
import { grayFromImage, binarize } from './src/ocr/preprocess.js';
import { recognizeMask } from './src/ocr/recognize.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------------------------------------------------------------- KaTeX helpers
function katexReady() { return typeof window.katex !== 'undefined'; }
function texHTML(tex, display = false) {
  if (!katexReady()) return escapeHtml(tex);
  try { return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false }); }
  catch { return escapeHtml(tex); }
}
// text with $inline math$
function richHTML(s) {
  return String(s).split('$').map((part, i) => (i % 2 ? texHTML(part) : escapeHtml(part))).join('');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------- tabs
const tabs = document.querySelectorAll('.tabs button');
function showTab(name) {
  tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
  if (name === 'history') renderHistory();
  if (name === 'write') sizePad();
  store.set('tab', name);
}
tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------------------------------------------------------------- settings
let degrees = store.get('degrees', false);
const angleBtn = $('angleBtn');
function syncAngle() { angleBtn.textContent = degrees ? 'DEG' : 'RAD'; }
angleBtn.addEventListener('click', () => { degrees = !degrees; store.set('degrees', degrees); syncAngle(); });
syncAngle();

// ---------------------------------------------------------------- calculator input + keypad
const expr = $('expr');
const PADS = {
  basic: [
    ['7'], ['8'], ['9'], ['÷', '/', 'op'], ['(', '(', 'op'], [')', ')', 'op'],
    ['4'], ['5'], ['6'], ['×', '*', 'op'], ['x²', '^2', 'op'], ['xʸ', '^', 'op'],
    ['1'], ['2'], ['3'], ['−', '-', 'op'], ['√', 'sqrt(', 'op'], ['%', '%', 'op'],
    ['0'], ['.'], ['x', 'x', 'op'], ['+', '+', 'op'], ['=', '=', 'op'], ['⌫', 'BACK', 'op'],
  ],
  alg: [
    ['x', 'x', 'op'], ['y', 'y', 'op'], ['z', 'z', 'op'], ['a', 'a'], ['b', 'b'], ['n', 'n'],
    ['<', '<', 'op'], ['>', '>', 'op'], ['≤', '<=', 'op'], ['≥', '>=', 'op'], ['|x|', 'abs(', 'op'], [',', ', ', 'op'],
    ['π', 'pi', 'op'], ['e', 'e', 'op'], ['ⁿ√', 'root(', 'op'], ['!', '!', 'op'], ['°', '°', 'op'], ['⌫', 'BACK', 'op'],
    ['factor', 'factor '], ['expand', 'expand '], ['simplify', 'simplify '], ['solve', 'solve '], ['←', 'LEFT', 'op'], ['→', 'RIGHT', 'op'],
  ],
  fn: [
    ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['sin⁻¹', 'asin('], ['cos⁻¹', 'acos('], ['tan⁻¹', 'atan('],
    ['ln', 'ln('], ['log', 'log('], ['log₂', 'log_2('], ['eˣ', 'e^('], ['10ˣ', '10^('], ['⌫', 'BACK', 'op'],
    ['gcd', 'gcd('], ['lcm', 'lcm('], ['mean', 'mean of '], ['median', 'median of '], ['std', 'std of '], ['C', 'CLEAR', 'op'],
    ['(', '(', 'op'], [')', ')', 'op'], ['^', '^', 'op'], ['π', 'pi', 'op'], ['←', 'LEFT', 'op'], ['→', 'RIGHT', 'op'],
  ],
  calc: [
    ['d/dx', 'd/dx ', 'wide'], ['∫ dx', '∫ ', 'wide'], ['∫ₐᵇ', 'integrate from 0 to 1 of ', 'wide'],
    ['lim', 'lim x->0 ', 'wide'], ['x→∞', 'lim x->oo ', 'wide'], ['dx', ' dx', 'wide'],
    ['x', 'x', 'op'], ['^', '^', 'op'], ['(', '(', 'op'], [')', ')', 'op'], ['e', 'e', 'op'], ['⌫', 'BACK', 'op'],
    ['sin', 'sin('], ['cos', 'cos('], ['ln', 'ln('], ['√', 'sqrt('], ['←', 'LEFT', 'op'], ['→', 'RIGHT', 'op'],
  ],
};
const keypad = $('keypad');
function renderPad(name) {
  keypad.innerHTML = '';
  for (const [label, ins = label, cls = ''] of PADS[name]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (cls) b.className = cls.split(' ').join(' ');
    if (/^\d$|^\.$/.test(label)) b.className = '';
    b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus/caret in the input
    b.addEventListener('click', () => press(ins));
    keypad.appendChild(b);
  }
  document.querySelectorAll('.keypad-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.pad === name));
}
document.querySelectorAll('.keypad-tabs button').forEach((b) => b.addEventListener('click', () => renderPad(b.dataset.pad)));
function press(ins) {
  const s = expr.selectionStart ?? expr.value.length, e = expr.selectionEnd ?? s;
  const v = expr.value;
  if (ins === 'BACK') { if (s === e && s > 0) { expr.value = v.slice(0, s - 1) + v.slice(e); setCaret(s - 1); } else { expr.value = v.slice(0, s) + v.slice(e); setCaret(s); } }
  else if (ins === 'CLEAR') { expr.value = ''; setCaret(0); }
  else if (ins === 'LEFT') setCaret(Math.max(0, s - 1));
  else if (ins === 'RIGHT') setCaret(Math.min(v.length, e + 1));
  else { expr.value = v.slice(0, s) + ins + v.slice(e); setCaret(s + ins.length); }
  updatePreview();
}
function setCaret(p) { expr.setSelectionRange(p, p); }
renderPad('basic');

// on touch devices use our keypad instead of the phone keyboard (toggle with ⌨️)
const touch = matchMedia('(pointer: coarse)').matches;
let systemKbd = !touch;
function syncKbd() { expr.setAttribute('inputmode', systemKbd ? 'text' : 'none'); $('kbdToggle').style.opacity = systemKbd ? 1 : 0.6; }
$('kbdToggle').addEventListener('click', () => { systemKbd = !systemKbd; syncKbd(); expr.blur(); setTimeout(() => expr.focus(), 50); });
syncKbd();

function updatePreview() {
  const v = expr.value.trim();
  const pv = $('preview');
  if (!v) { pv.innerHTML = '<span class="muted">Your problem will appear here</span>'; return; }
  try { pv.innerHTML = texHTML(rawTex(parse(v)), true); }
  catch { pv.innerHTML = `<span>${escapeHtml(v)}</span>`; }
}
expr.addEventListener('input', updatePreview);
expr.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); solve(); } });
$('solveBtn').addEventListener('click', () => solve());

const EXAMPLES = ['2+3*4^2', '1/2 + 3/4', '3(x+2) - 4 = 2x + 7', 'x^2 - 5x + 6 = 0', '2x^2 + 3x - 4 = 0', 'x^3 - 6x^2 + 11x - 6 = 0',
  '2x + 3y = 12, x - y = -1', 'sqrt(x+3) = x - 3', '|2x - 1| = 5', '2^(x+1) = 16', 'log(x) + log(x-3) = 1', '2sin(x) - 1 = 0',
  'x^2 - 4 > 0', 'factor 6x^2 + 11x - 10', 'expand (x+2)^3', 'simplify (x^2-9)/(x+3)', 'd/dx x^3 sin(x)', '∫ x e^x dx',
  'integrate from 0 to 2 of x^2', 'lim x->2 (x^2-4)/(x-2)', 'y = x^2 - 4x + 3', '15% of 80', 'prime factorization of 360', 'mean of 2, 4, 4, 5, 7'];
for (const ex of EXAMPLES) {
  const b = document.createElement('button');
  b.textContent = ex;
  b.addEventListener('click', () => { expr.value = ex; updatePreview(); solve(); });
  $('examples').appendChild(b);
}

// ---------------------------------------------------------------- solving + results
let lastAnswer = '';
function showError(msg) { const el = $('error'); el.textContent = msg; el.hidden = !msg; }
function solve(text) {
  if (text !== undefined) { expr.value = text; updatePreview(); }
  const q = expr.value.trim();
  if (!q) { showError('Type or scan a math problem first.'); return; }
  showError('');
  let r;
  try { r = solveProblem(q, { degrees }); }
  catch (e) { $('result').hidden = true; showError(e.message || 'Sorry, I could not solve that.'); return; }
  renderResult(r);
  addHistory(q, r.answerText);
}
function renderResult(r) {
  $('result').hidden = false;
  $('resultKind').textContent = r.title;
  $('resultProblem').innerHTML = texHTML(r.inputTex, true);
  $('resultAnswer').innerHTML = texHTML(r.answerTex, true);
  lastAnswer = r.answerText;
  const ol = $('steps');
  ol.innerHTML = '';
  for (const s of r.steps) {
    const li = document.createElement('li');
    let h = `<div class="step-title">${richHTML(s.title)}</div>`;
    if (s.detail) h += `<div class="step-detail">${texHTML(s.detail, true)}</div>`;
    if (s.math) h += `<div class="step-math">${texHTML(s.math, true)}</div>`;
    li.innerHTML = h;
    ol.appendChild(li);
  }
  if (r.graph) { $('graphCard').hidden = false; requestAnimationFrame(() => drawGraph(r.graph)); }
  else $('graphCard').hidden = true;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(lastAnswer); $('copyBtn').textContent = 'Copied ✓'; setTimeout(() => { $('copyBtn').textContent = 'Copy answer'; }, 1500); } catch { /* ignore */ }
});
$('editBtn').addEventListener('click', () => { showTab('type'); expr.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

// ---------------------------------------------------------------- graph
function drawGraph(g) {
  const cv = $('graph');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  let f, df;
  try { f = fromRaw(parse(g.expr)); df = g.deriv ? fromRaw(parse(g.deriv)) : null; } catch { return; }
  const F = (node, x) => { try { return evalNum(node, { [g.v]: x }); } catch { return NaN; } };
  // choose a window around interesting points
  let xmin = -10, xmax = 10;
  const pts = [...(g.roots || []), ...(g.shade || [])].filter(Number.isFinite);
  if (pts.length) { const lo = Math.min(...pts), hi = Math.max(...pts); const pad = Math.max(2, (hi - lo) * 0.6); xmin = lo - pad; xmax = hi + pad; }
  const N = 400; const ys = [];
  for (let i = 0; i <= N; i++) { const y = F(f, xmin + ((xmax - xmin) * i) / N); if (Number.isFinite(y)) ys.push(y); }
  ys.sort((a, b) => a - b);
  let ymin = ys.length ? ys[Math.floor(ys.length * 0.05)] : -10, ymax = ys.length ? ys[Math.floor(ys.length * 0.95)] : 10;
  if (ymin > 0) ymin = Math.min(0, ymin); if (ymax < 0) ymax = Math.max(0, ymax);
  if (ymax - ymin < 1e-9) { ymin -= 1; ymax += 1; }
  const padY = (ymax - ymin) * 0.15; ymin -= padY; ymax += padY;
  const X = (x) => ((x - xmin) / (xmax - xmin)) * W, Y = (y) => H - ((y - ymin) / (ymax - ymin)) * H;
  const css = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, W, H);
  // grid
  ctx.strokeStyle = css.getPropertyValue('--line'); ctx.lineWidth = 1;
  const step = niceStep((xmax - xmin) / 8), stepY = niceStep((ymax - ymin) / 6);
  ctx.fillStyle = css.getPropertyValue('--muted'); ctx.font = '11px system-ui';
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke(); if (Math.abs(x) > 1e-9) ctx.fillText(+x.toFixed(6), X(x) + 2, Math.min(H - 3, Math.max(11, Y(0) + 12))); }
  for (let y = Math.ceil(ymin / stepY) * stepY; y <= ymax; y += stepY) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke(); if (Math.abs(y) > 1e-9) ctx.fillText(+y.toFixed(6), Math.min(W - 30, Math.max(2, X(0) + 3)), Y(y) - 2); }
  ctx.strokeStyle = css.getPropertyValue('--muted'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke();
  // shaded area for definite integrals
  if (g.shade) {
    ctx.fillStyle = css.getPropertyValue('--accent') + '33';
    ctx.beginPath(); ctx.moveTo(X(g.shade[0]), Y(0));
    for (let i = 0; i <= 200; i++) { const x = g.shade[0] + ((g.shade[1] - g.shade[0]) * i) / 200; const y = F(f, x); ctx.lineTo(X(x), Y(Number.isFinite(y) ? y : 0)); }
    ctx.lineTo(X(g.shade[1]), Y(0)); ctx.closePath(); ctx.fill();
  }
  const curve = (node, color, dash) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash(dash || []);
    ctx.beginPath(); let pen = false;
    for (let i = 0; i <= 800; i++) {
      const x = xmin + ((xmax - xmin) * i) / 800, y = F(node, x);
      if (!Number.isFinite(y) || Math.abs(Y(y)) > 4 * H) { pen = false; continue; }
      if (pen) ctx.lineTo(X(x), Y(y)); else { ctx.moveTo(X(x), Y(y)); pen = true; }
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  curve(f, css.getPropertyValue('--accent'));
  if (df) curve(df, css.getPropertyValue('--accent-2'), [6, 5]);
  for (const r of g.roots || []) { ctx.fillStyle = css.getPropertyValue('--good'); ctx.beginPath(); ctx.arc(X(r), Y(0), 5, 0, 7); ctx.fill(); }
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

// ---------------------------------------------------------------- history
function addHistory(q, a) {
  const h = store.get('history', []).filter((x) => x.q !== q);
  h.unshift({ q, a, t: Date.now() });
  store.set('history', h.slice(0, 100));
}
function renderHistory() {
  const ul = $('historyList');
  const h = store.get('history', []);
  ul.innerHTML = h.length ? '' : '<li class="muted">Problems you solve will show up here.</li>';
  for (const item of h) {
    const li = document.createElement('li');
    li.innerHTML = `<div class="h-q">${escapeHtml(item.q)}</div><div class="h-a">${escapeHtml(item.a || '')}</div>`;
    li.addEventListener('click', () => { showTab('type'); solve(item.q); });
    ul.appendChild(li);
  }
}
$('clearHistory').addEventListener('click', () => { store.set('history', []); renderHistory(); });

// ---------------------------------------------------------------- OCR model
let modelPromise = null;
function getModel() {
  if (!modelPromise) modelPromise = SymbolModel.load(new URL('model/', location.href)).catch((e) => { modelPromise = null; throw e; });
  return modelPromise;
}
function busy(on, text = 'Thinking…') { $('busy').hidden = !on; $('busyText').textContent = text; }
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

async function useRecognized(lines) {
  if (!lines.length) { showError('I could not find any writing. Try a closer, brighter photo with dark ink.'); return; }
  showTab('type');
  // several lines: if they are all equations treat them as a system, else let the user pick
  if (lines.length > 1 && lines.every((l) => l.includes('='))) { solve(lines.join(', ')); return; }
  if (lines.length > 1) {
    $('result').hidden = true;
    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = '<h2>I found several lines — which one?</h2><div class="recog-lines"></div>';
    for (const l of lines) {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = l;
      b.addEventListener('click', () => { box.remove(); solve(l); });
      box.querySelector('.recog-lines').appendChild(b);
    }
    document.querySelector('#tab-type').prepend(box);
    return;
  }
  solve(lines[0]);
}

// ---------------------------------------------------------------- photo
const photoCanvas = $('photoCanvas');
let photo = null, crop = null;
async function loadPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    photo = img; crop = null;
    $('photoWrap').hidden = false; $('photoHint').hidden = false; $('photoActions').hidden = false;
    drawPhoto();
  };
  img.src = url;
}
function drawPhoto(boxes) {
  if (!photo) return;
  const maxW = 1200;
  const s = Math.min(1, maxW / photo.naturalWidth);
  photoCanvas.width = Math.round(photo.naturalWidth * s);
  photoCanvas.height = Math.round(photo.naturalHeight * s);
  const ctx = photoCanvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, photoCanvas.width, photoCanvas.height);
  if (crop) {
    ctx.fillStyle = '#0008';
    const c = { x: crop.x * s, y: crop.y * s, w: crop.w * s, h: crop.h * s };
    ctx.fillRect(0, 0, photoCanvas.width, c.y);
    ctx.fillRect(0, c.y + c.h, photoCanvas.width, photoCanvas.height - c.y - c.h);
    ctx.fillRect(0, c.y, c.x, c.h);
    ctx.fillRect(c.x + c.w, c.y, photoCanvas.width - c.x - c.w, c.h);
    ctx.strokeStyle = '#8b85ff'; ctx.lineWidth = 3; ctx.strokeRect(c.x, c.y, c.w, c.h);
  }
  if (boxes) {
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.font = 'bold 16px system-ui'; ctx.fillStyle = '#22c55e';
    for (const b of boxes.items) {
      const k = s / boxes.scale;
      const ox = (crop ? crop.x : 0) * s, oy = (crop ? crop.y : 0) * s;
      ctx.strokeRect(ox + b.x0 * k, oy + b.y0 * k, (b.x1 - b.x0) * k, (b.y1 - b.y0) * k);
      if (b.label && b.label.length <= 2) ctx.fillText(b.label, ox + b.x0 * k, oy + b.y0 * k - 3);
    }
  }
}
$('cameraInput').addEventListener('change', (e) => loadPhoto(e.target.files[0]));
$('fileInput').addEventListener('change', (e) => loadPhoto(e.target.files[0]));
$('resetCropBtn').addEventListener('click', () => { crop = null; drawPhoto(); });
let dragStart = null;
function photoPoint(e) {
  const r = photoCanvas.getBoundingClientRect();
  const k = photo.naturalWidth / r.width;
  return { x: Math.max(0, Math.min(photo.naturalWidth, (e.clientX - r.left) * k)), y: Math.max(0, Math.min(photo.naturalHeight, (e.clientY - r.top) * k)) };
}
photoCanvas.addEventListener('pointerdown', (e) => { if (!photo) return; photoCanvas.setPointerCapture(e.pointerId); dragStart = photoPoint(e); });
photoCanvas.addEventListener('pointermove', (e) => {
  if (!dragStart) return;
  const p = photoPoint(e);
  crop = { x: Math.min(p.x, dragStart.x), y: Math.min(p.y, dragStart.y), w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y) };
  drawPhoto();
});
photoCanvas.addEventListener('pointerup', () => { dragStart = null; if (crop && (crop.w < 10 || crop.h < 10)) { crop = null; drawPhoto(); } });
$('readPhotoBtn').addEventListener('click', async () => {
  if (!photo) return;
  showError('');
  busy(true, 'Reading your photo…');
  try {
    await nextFrame();
    const model = await getModel();
    const { g, w, h, scale } = grayFromImage(photo, crop, 1400);
    const mask = binarize(g, w, h);
    const out = recognizeMask(mask, w, h, model);
    drawPhoto({ items: out.items, scale });
    busy(false);
    await useRecognized(out.lines);
  } catch (e) {
    console.error(e);
    busy(false);
    showError('Could not read the photo: ' + e.message);
  }
});

// ---------------------------------------------------------------- drawing pad
const pad = $('pad');
let strokes = [], current = null;
function sizePad() {
  const r = pad.getBoundingClientRect();
  if (!r.width) return;
  const dpr = window.devicePixelRatio || 1;
  pad.width = Math.round(r.width * dpr); pad.height = Math.round(r.height * dpr);
  redrawPad();
}
function redrawPad() {
  const ctx = pad.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pad.width, pad.height);
  ctx.strokeStyle = '#111'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, pad.width / 140);
  for (const s of strokes) {
    ctx.beginPath();
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x * pad.width, y * pad.height) : ctx.moveTo(x * pad.width, y * pad.height)));
    if (s.length === 1) ctx.lineTo(s[0][0] * pad.width + 0.1, s[0][1] * pad.height);
    ctx.stroke();
  }
}
function padPoint(e) { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); current = [padPoint(e)]; strokes.push(current); redrawPad(); });
pad.addEventListener('pointermove', (e) => { if (!current) return; current.push(padPoint(e)); redrawPad(); });
pad.addEventListener('pointerup', () => { current = null; });
pad.addEventListener('pointercancel', () => { current = null; });
$('padUndo').addEventListener('click', () => { strokes.pop(); redrawPad(); });
$('padClear').addEventListener('click', () => { strokes = []; redrawPad(); });
$('padRead').addEventListener('click', async () => {
  if (!strokes.length) { showError('Write something first.'); return; }
  showError('');
  busy(true, 'Reading your writing…');
  try {
    await nextFrame();
    const model = await getModel();
    const { g, w, h } = grayFromImage(pad, null, 1000);
    const mask = binarize(g, w, h, { clean: true });
    const out = recognizeMask(mask, w, h, model);
    busy(false);
    await useRecognized(out.lines);
  } catch (e) {
    console.error(e);
    busy(false);
    showError('Could not read the drawing: ' + e.message);
  }
});
window.addEventListener('resize', () => { if (!$('tab-write').hidden) sizePad(); });

// ---------------------------------------------------------------- start
showTab(store.get('tab', 'type'));
const waitKatex = setInterval(() => { if (katexReady()) { clearInterval(waitKatex); updatePreview(); } }, 100);
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
