import { solveProblem } from './src/engine/index.js';
import { parse } from './src/engine/parser.js';
import { rawTex, text as plainText } from './src/engine/print.js';
import { fromRaw, evalNum } from './src/engine/cas.js';
import { latexToText } from './src/engine/latex.js';
import { SymbolModel } from './src/ocr/model.js';
import { grayFromImage, binarize } from './src/ocr/preprocess.js';
import { recognizeMask } from './src/ocr/recognize.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function texHTML(tex, display = false) {
  if (!window.katex) return escapeHtml(tex);
  try { return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false }); } catch { return escapeHtml(tex); }
}
const richHTML = (s) => String(s).split('$').map((p, i) => (i % 2 ? texHTML(p) : escapeHtml(p))).join('');
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
function busy(on, text = 'Reading…') { $('busy').hidden = !on; $('busyText').textContent = text; }
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

// ================================================================ settings
let degrees = store.get('degrees', false);
function syncAngle() { $('angleLabel').textContent = degrees ? 'Degrees' : 'Radians'; document.querySelectorAll('[data-angle]').forEach((b) => { b.textContent = degrees ? 'deg' : 'rad'; }); }

// ================================================================ sheets
const SHEETS = ['calc', 'result', 'write', 'history'];
function openSheet(id) {
  SHEETS.forEach((s) => { $(s).hidden = s !== id; });
  if (id) stopCamera(); else startCamera();
  if (id === 'calc') setTimeout(() => mf && mf.focus(), 50);
  if (id === 'write') requestAnimationFrame(sizePad);
  if (id === 'history') renderHistory();
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
  const sheet = b.closest('.sheet').id;
  openSheet(sheet === 'result' && cameFrom === 'calc' ? 'calc' : null);
}));

// ================================================================ menu & help
$('menuBtn').addEventListener('click', () => { $('menu').hidden = false; });
document.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => {
  const m = b.dataset.menu;
  if (m === 'angle') { degrees = !degrees; store.set('degrees', degrees); syncAngle(); toast(`Angles in ${degrees ? 'degrees' : 'radians'}`); return; }
  if (m === 'accurate') { const v = !store.get('accurate', null); store.set('accurate', v); syncAccurate(); toast(v ? 'Accurate reader on (downloads once when you next read a photo)' : 'Using the fast reader'); return; }
  $('menu').hidden = true;
  if (m === 'help') $('help').hidden = false;
  else if (m !== 'close') openSheet(m);
}));
$('helpBtn').addEventListener('click', () => { $('help').hidden = false; });
document.querySelector('[data-close-modal]').addEventListener('click', () => { $('help').hidden = true; });

// ================================================================ camera
const video = $('video');
let stream = null, torchOn = false, still = null;
async function startCamera() {
  if (still || stream || !navigator.mediaDevices?.getUserMedia) { if (!navigator.mediaDevices?.getUserMedia) camMessage('No camera here. Pick a photo below or use the calculator.'); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    video.srcObject = stream;
    await video.play().catch(() => {});
    camMessage('');
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('torchBtn').hidden = !caps.torch;
  } catch (e) {
    stream = null;
    camMessage(e && e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in settings, pick a photo below, or use the calculator.' : 'Camera not available. Pick a photo below or use the calculator.');
  }
}
function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null; video.srcObject = null; torchOn = false; $('torchBtn').classList.remove('on');
}
function camMessage(m) { $('camMsg').textContent = m; $('camMsg').hidden = !m; }
$('torchBtn').addEventListener('click', async () => {
  const track = stream && stream.getVideoTracks()[0];
  if (!track) return;
  torchOn = !torchOn;
  try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); $('torchBtn').classList.toggle('on', torchOn); } catch { torchOn = false; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); else if (SHEETS.every((s) => $(s).hidden)) startCamera(); });

// gallery picture -> show it in the viewfinder
$('fileInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const img = $('still');
  img.onload = () => {
    still = img; stopCamera();
    img.hidden = false; video.hidden = true; camMessage('');
    $('closeStillBtn').hidden = false; $('menuBtn').hidden = true;
    $('homeHint').textContent = 'Move the frame over one problem, then tap the button';
  };
  img.src = URL.createObjectURL(f);
});
$('closeStillBtn').addEventListener('click', () => {
  still = null; $('still').hidden = true; video.hidden = false;
  $('closeStillBtn').hidden = true; $('menuBtn').hidden = false;
  $('homeHint').textContent = 'Take a picture of a math problem';
  startCamera();
});

// resizable frame
const frame = $('frame');
let drag = null;
frame.addEventListener('pointerdown', (e) => {
  const c = e.target.dataset.c;
  const home = $('home').getBoundingClientRect(), r = frame.getBoundingClientRect();
  drag = { c: c || 'move', x: e.clientX, y: e.clientY, r: { l: r.left - home.left, t: r.top - home.top, w: r.width, h: r.height }, W: home.width, H: home.height };
  frame.setPointerCapture(e.pointerId);
});
frame.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  let { l, t, w, h } = drag.r;
  if (drag.c === 'move') { l += dx; t += dy; }
  if (drag.c.includes('l')) { l += dx; w -= dx; }
  if (drag.c.includes('r')) w += dx;
  if (drag.c.includes('t')) { t += dy; h -= dy; }
  if (drag.c.includes('b')) h += dy;
  w = Math.max(90, w); h = Math.max(50, h);
  l = Math.min(Math.max(4, l), drag.W - w - 4); t = Math.min(Math.max(60, t), drag.H - h - 220);
  Object.assign(frame.style, { left: (100 * l / drag.W) + '%', top: (100 * t / drag.H) + '%', width: (100 * w / drag.W) + '%', height: (100 * h / drag.H) + '%' });
});
frame.addEventListener('pointerup', () => { drag = null; store.set('frame', frame.getAttribute('style')); });
{ const f = store.get('frame', null); if (f) frame.setAttribute('style', f); }

// map the on-screen frame to pixels in the video / image
function frameCrop(srcW, srcH, contain) {
  const home = $('home').getBoundingClientRect(), r = frame.getBoundingClientRect();
  const s = contain ? Math.min(home.width / srcW, home.height / srcH) : Math.max(home.width / srcW, home.height / srcH);
  const ox = (home.width - srcW * s) / 2, oy = (home.height - srcH * s) / 2;
  let x = (r.left - home.left - ox) / s, y = (r.top - home.top - oy) / s, w = r.width / s, h = r.height / s;
  x = Math.max(0, x); y = Math.max(0, y); w = Math.min(srcW - x, w); h = Math.min(srcH - y, h);
  return { x, y, w, h };
}
$('shutter').addEventListener('click', async () => {
  let src, crop;
  if (still) { src = still; crop = frameCrop(still.naturalWidth, still.naturalHeight, true); }
  else if (stream && video.videoWidth) {
    const cv = document.createElement('canvas');
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext('2d').drawImage(video, 0, 0);
    src = cv; crop = frameCrop(cv.width, cv.height, false);
  } else { $('fileInput').click(); return; }
  if (crop.w < 10 || crop.h < 10) { toast('Move the frame over the problem'); return; }
  busy(true, 'Reading the problem…');
  try {
    await nextFrame();
    const model = await getModel();
    const { g, w, h } = grayFromImage(src, crop, 1400);
    const out = recognizeMask(binarize(g, w, h), w, h, model);
    const lines = await readAccurately(g, w, h, out);
    busy(false);
    useRecognized(lines, 'photo');
  } catch (e) { console.error(e); busy(false); toast('Could not read that: ' + e.message); }
});

// ================================================================ OCR helpers
let modelPromise = null;
function getModel() {
  if (!modelPromise) modelPromise = SymbolModel.load(new URL('model/', location.href)).catch((e) => { modelPromise = null; throw e; });
  return modelPromise;
}
// ---- accurate reader (Pix2Text-MFR, ~43 MB one-time download), combined with the tiny model
let readerPromise = null;
function askAccurate() {
  return new Promise((resolve) => {
    const m = $('help'), card = m.querySelector('.modal-card'), old = card.innerHTML;
    card.innerHTML = `<h2>Use the accurate reader?</h2>
      <p>It reads handwriting about twice as well, but needs a one-time download of about 43&nbsp;MB (best on Wi-Fi). After that it works offline.</p>
      <button class="btn primary" data-y>Download (43 MB)</button><p></p><button class="btn" data-n>Use the fast reader</button>`;
    const done = (v) => { m.hidden = true; card.innerHTML = old; rebindHelp(); resolve(v); };
    card.querySelector('[data-y]').addEventListener('click', () => done(true));
    card.querySelector('[data-n]').addEventListener('click', () => done(false));
    m.hidden = false;
  });
}
async function getReader() {
  let pref = store.get('accurate', null);
  if (pref === null) { busy(false); pref = await askAccurate(); store.set('accurate', pref); syncAccurate(); }
  if (!pref) return null;
  if (!readerPromise) {
    const { FormulaReader } = await import('./src/ocr/mfr.js');
    readerPromise = FormulaReader.load(new URL('model/mfr/', location.href), (p, partial) => busy(true, `Downloading the accurate reader… ${Math.round(100 * p)}%`))
      .catch((e) => { readerPromise = null; throw e; });
  }
  busy(true, 'Loading the accurate reader…');
  return readerPromise;
}
// crop each line from the grey image and let the accurate reader pick the best reading
// returns the lines read; lines.alts[i] lists other likely readings of line i ("Did you mean…?")
async function readAccurately(g, w, h, out) {
  if (!out.lines.length) return out.lines;
  let reader;
  try { reader = await getReader(); } catch (e) { console.warn(e); toast('Accurate reader unavailable, using the fast one'); return out.lines; }
  if (!reader) return out.lines;
  let mean = 0; for (let i = 0; i < g.length; i += 7) mean += g[i]; mean /= g.length / 7;
  // lines that sit close together (e.g. the top and bottom of a fraction) are read as one block
  const blocks = [];
  out.boxes.forEach((b, k) => {
    const last = blocks[blocks.length - 1];
    const gap = last ? b.y0 - last.box.y1 : Infinity;
    if (last && gap < 0.6 * Math.min(b.y1 - b.y0, last.box.y1 - last.box.y0)) {
      last.box = { x0: Math.min(last.box.x0, b.x0), y0: last.box.y0, x1: Math.max(last.box.x1, b.x1), y1: Math.max(last.box.y1, b.y1) };
      last.ks.push(k);
    } else blocks.push({ box: { ...b }, ks: [k] });
  });
  const lines = [];
  lines.alts = [];
  for (let n = 0; n < blocks.length; n++) {
    busy(true, blocks.length > 1 ? `Reading line ${n + 1} of ${blocks.length}…` : 'Reading the problem…');
    await nextFrame();
    const k = blocks[n].ks.length === 1 ? blocks[n].ks[0] : -1;
    const b = blocks[n].box, cw = b.x1 - b.x0, ch = b.y1 - b.y0;
    const crop = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const v = g[(y + b.y0) * w + x + b.x0]; crop[y * cw + x] = mean < 0.45 ? 1 - v : v; }
    const tinyText = k >= 0 ? out.lines[k] : null;
    let tinyTex = null;
    try { if (tinyText) tinyTex = rawTex(parse(tinyText)).replace(/\\left|\\right/g, ''); } catch { /* tiny reading not valid */ }
    try {
      const cands = await reader.read(crop, cw, ch, tinyTex);
      const valid = distinctReadings(cands.map((c) => c.latex));
      const fallback = tinyText ?? blocks[n].ks.map((i) => out.lines[i]).join(', ');
      lines.push(valid.length ? valid[0] : fallback);
      lines.alts.push(valid.slice(1, 4));
    } catch (e) { console.warn(e); lines.push(tinyText ?? out.lines[blocks[n].ks[0]]); lines.alts.push([]); }
  }
  return lines;
}
// readings the engine understands, best first, without repeats that mean the same thing
function distinctReadings(latexList) {
  const seen = new Set(), res = [];
  for (const l of latexList) {
    let t;
    try { t = latexToText(l); if (!t.trim() || /\(\s*\)/.test(t)) continue; const key = plainText(fromRaw(parse(t))).replace(/\s+/g, ''); if (seen.has(key)) continue; seen.add(key); } catch { continue; }
    res.push(t);
  }
  return res;
}
function syncAccurate() { const el = $('accurateLabel'); if (el) el.textContent = store.get('accurate', null) ? 'On' : 'Off'; }

function useRecognized(lines, source) {
  if (!lines.length) { toast('I could not find any math. Try again closer, with more light.'); return; }
  const alts = lines.alts || [];
  if (lines.length > 1 && lines.every((l) => l.includes('='))) { solveText(lines.join(', '), { source }); return; }
  if (lines.length === 1) { solveText(lines[0], { source, alts: alts[0] }); return; }
  // several lines: ask which one
  const m = $('help');
  const card = m.querySelector('.modal-card');
  const old = card.innerHTML;
  card.innerHTML = '<h2>Which problem?</h2><div class="recog-lines"></div><p></p><button class="btn" data-x>Cancel</button>';
  lines.forEach((l, i) => {
    const b = document.createElement('button');
    try { b.innerHTML = texHTML(rawTex(parse(l))); } catch { b.textContent = l; }
    b.addEventListener('click', () => { m.hidden = true; card.innerHTML = old; rebindHelp(); solveText(l, { source, alts: alts[i] }); });
    card.querySelector('.recog-lines').appendChild(b);
  });
  card.querySelector('[data-x]').addEventListener('click', () => { m.hidden = true; card.innerHTML = old; rebindHelp(); });
  m.hidden = false;
}
function rebindHelp() { document.querySelector('[data-close-modal]').addEventListener('click', () => { $('help').hidden = true; }); }

// ================================================================ solving + results
let current = null, cameFrom = null;
function solveText(text, { source = 'calc', latex = null, alts = [] } = {}) {
  let r;
  try { r = solveProblem(text, { degrees }); }
  catch (e) {
    if (source === 'calc') { showCalcError(e.message); return; }
    // reading went wrong: open the calculator with what was read so it can be fixed
    openCalcWith(text);
    showCalcError(`I read “${text}” but couldn't solve it: ${e.message} Fix it and press ⏎.`);
    return;
  }
  current = { text, latex: latex ?? safeTex(text), source, alts };
  cameFrom = source === 'calc' ? 'calc' : null;
  renderResult(r, source);
  addHistory(text, current.latex, r.answerText);
  openSheet('result');
}
const safeTex = (t) => { try { return rawTex(parse(t)); } catch { return t; } };
function renderResult(r, source) {
  $('resultKind').textContent = r.title;
  $('resultProblem').innerHTML = texHTML(source === 'calc' && current && current.latex ? current.latex : r.inputTex, true);
  $('photoNote').hidden = source !== 'photo' && source !== 'write';
  $('photoNote').textContent = 'Read from your ' + (source === 'write' ? 'writing' : 'photo') + '. Something wrong? Tap Edit.';
  renderAlts(source);
  $('resultAnswer').innerHTML = texHTML(r.answerTex, true);
  $('copyBtn').onclick = async () => { try { await navigator.clipboard.writeText(r.answerText); toast('Copied'); } catch { /* ignore */ } };
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
  $('graphCard').hidden = !r.graph;
  $('result').querySelector('.result-body').scrollTop = 0;
  if (r.graph) setTimeout(() => drawGraph(r.graph), 60);
}
// other likely readings of a photo / handwriting: one tap solves that one instead
function renderAlts(source) {
  const box = $('altReads'), list = $('altList');
  const alts = (current && current.alts || []).filter((t) => t !== current.text);
  box.hidden = !alts.length || source === 'calc';
  list.innerHTML = '';
  for (const t of alts) {
    let ok = true;
    try { solveProblem(t, { degrees }); } catch { ok = false; }
    if (!ok) continue;
    const b = document.createElement('button');
    b.className = 'alt-btn';
    b.innerHTML = texHTML(safeTex(t));
    b.addEventListener('click', () => {
      const others = [current.text, ...alts.filter((x) => x !== t)];
      solveText(t, { source, alts: others });
    });
    list.appendChild(b);
  }
  if (!list.children.length) box.hidden = true;
}
$('editBtn').addEventListener('click', () => { if (current) openCalcWith(current.text, current.latex); });

// ================================================================ calculator (MathLive + custom keyboard)
let mf = null;
function initMathField() {
  if (!window.MathfieldElement) { setTimeout(initMathField, 60); return; }
  window.MathfieldElement.fontsDirectory = new URL('vendor/katex/fonts/', location.href).href;
  window.MathfieldElement.soundsDirectory = null;
  mf = $('mf');
  mf.mathVirtualKeyboardPolicy = 'manual';
  mf.smartFence = true;
  mf.smartSuperscript = true;
  mf.defaultMode = 'math';
  mf.inlineShortcuts = { ...mf.inlineShortcuts, oo: '\\infty', sqrt: '\\sqrt{#?}', pi: '\\pi', theta: '\\theta' };
  if (window.mathVirtualKeyboard) { window.mathVirtualKeyboard.show = () => {}; }
  mf.addEventListener('input', () => { hideCalcError(); livePreview(); });
  mf.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); solveFromCalc(); } }, { capture: true });
  // keep the phone keyboard closed: our keyboard is always on screen
  const kill = () => { const ta = mf.shadowRoot && mf.shadowRoot.querySelector('textarea, [part=keyboard-sink]'); if (ta && matchMedia('(pointer: coarse)').matches) ta.setAttribute('inputmode', 'none'); };
  kill(); setTimeout(kill, 300);
  mf.addEventListener('focusin', kill);
}
function mfText() { return latexToText(mf.getValue('latex')); }
function solveFromCalc() {
  const latex = mf.getValue('latex').trim();
  if (!latex) { showCalcError('Type a math problem first.'); return; }
  let text;
  try { text = latexToText(latex); } catch (e) { showCalcError(e.message); return; }
  solveText(text, { source: 'calc', latex });
}
function openCalcWith(text, latex) {
  openSheet('calc');
  const set = () => { if (!mf) return setTimeout(set, 60); mf.setValue(latex || safeTex(text)); livePreview(); };
  set();
}
function showCalcError(m) { $('calcError').textContent = m; $('calcError').hidden = false; }
function hideCalcError() { $('calcError').hidden = true; }
let previewTimer = null;
function livePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const el = $('livePreview');
    let text;
    try { text = mfText(); } catch { el.innerHTML = ''; return; }
    if (!text) { el.innerHTML = ''; return; }
    try {
      const r = solveProblem(text, { degrees });
      el.innerHTML = r.kind === 'arithmetic' || r.kind === 'complex' ? texHTML('= ' + r.answerTex) : `<span class="go">${escapeHtml(r.title)} →</span> press ⏎`;
    } catch { el.innerHTML = ''; }
  }, 220);
}

// ---- keyboard layouts. ins: LaTeX inserted ('#0' = selection/placeholder, '#?' = placeholder)
const B = '\\square';
const K = (label, ins, opts = {}) => ({ label, ins: ins ?? label, ...opts });
const PADS = {
  basic: { cols: 6, keys: [
    K(`(${B})`, '\\left(#0\\right)', { tex: true, alts: [K(`[${B}]`, '\\left[#0\\right]', { tex: true }), K(`|${B}|`, '\\left|#0\\right|', { tex: true }), K(`\\{${B}\\}`, '\\left\\{#0\\right\\}', { tex: true })] }),
    K('>', '>', { alts: [K('<'), K('≥', '\\ge'), K('≤', '\\le'), K('≠', '\\ne')] }),
    K('7', '7', { num: true }), K('8', '8', { num: true }), K('9', '9', { num: true }), K('÷', '\\div'),
    K(`\\frac{${B}}{${B}}`, '\\frac{#0}{#?}', { tex: true }),
    K(`\\sqrt{${B}}`, '\\sqrt{#0}', { tex: true, alts: [K(`\\sqrt[3]{${B}}`, '\\sqrt[3]{#0}', { tex: true }), K(`\\sqrt[${B}]{${B}}`, '\\sqrt[#?]{#0}', { tex: true })] }),
    K('4', '4', { num: true }), K('5', '5', { num: true }), K('6', '6', { num: true }), K('×', '\\times'),
    K(`${B}^{2}`, '#@^{2}', { tex: true, alts: [K(`${B}^{${B}}`, '#@^{#?}', { tex: true }), K(`${B}^{-1}`, '#@^{-1}', { tex: true }), K(`e^{${B}}`, 'e^{#?}', { tex: true }), K(`10^{${B}}`, '10^{#?}', { tex: true })] }),
    K('x', 'x', { tex: true, alts: [K('y', 'y', { tex: true }), K('z', 'z', { tex: true }), K('a', 'a', { tex: true }), K('b', 'b', { tex: true }), K('n', 'n', { tex: true }), K('t', 't', { tex: true })] }),
    K('1', '1', { num: true }), K('2', '2', { num: true }), K('3', '3', { num: true }), K('−', '-'),
    K('\\pi', '\\pi', { tex: true, alts: [K('e', 'e', { tex: true }), K('\\theta', '\\theta', { tex: true }), K('\\infty', '\\infty', { tex: true }), K('i', 'i', { tex: true })] }),
    K('%', '\\%', { alts: [K('!', '!'), K('°', '\\degree')] }),
    K('0', '0', { num: true }), K('.', '.', { num: true, alts: [K(',', ',')] }), K('=', '='), K('+', '+'),
  ] },
  func: { cols: 6, keys: [
    K(`|${B}|`, '\\left|#0\\right|', { tex: true }), K(`\\log_{10}`, '\\log\\left(#0\\right)', { tex: true }), K('\\log_{2}', '\\log_{2}\\left(#0\\right)', { tex: true }),
    K(`\\log_{${B}}`, '\\log_{#?}\\left(#0\\right)', { tex: true }), K('\\ln', '\\ln\\left(#0\\right)', { tex: true }), K(`e^{${B}}`, 'e^{#0}', { tex: true }),
    K('e', 'e', { tex: true }), K('i', 'i', { tex: true }), K(`${B}!`, '#@!', { tex: true }),
    K(`{}_{${B}}C_{${B}}`, '\\binom{#?}{#?}', { tex: true }), K(`{}_{${B}}P_{${B}}`, '\\operatorname{nPr}\\left(#?,#?\\right)', { tex: true }), K(`\\sqrt[${B}]{${B}}`, '\\sqrt[#?]{#0}', { tex: true }),
    K(`${B}^{${B}}`, '#@^{#?}', { tex: true }), K(`10^{${B}}`, '10^{#?}', { tex: true }), K('\\gcd', '\\gcd\\left(#?,#?\\right)', { tex: true, small: true }),
    K('\\operatorname{lcm}', '\\operatorname{lcm}\\left(#?,#?\\right)', { tex: true, small: true }), K(`${B},${B}`, ',', { tex: true }), K(`${B}_{${B}}`, '#@_{#?}', { tex: true }),
    K(`\\begin{bmatrix}${B}&${B}\\\\${B}&${B}\\end{bmatrix}`, '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', { tex: true, tiny: true }),
    K(`\\begin{bmatrix}${B}&${B}&${B}\\\\${B}&${B}&${B}\\\\${B}&${B}&${B}\\end{bmatrix}`, '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}', { tex: true, tiny: true }),
    K(`\\begin{vmatrix}${B}&${B}\\\\${B}&${B}\\end{vmatrix}`, '\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', { tex: true, tiny: true }),
    K(`(${B})`, '\\left(#0\\right)', { tex: true }), K('y', 'y', { tex: true }), K('x', 'x', { tex: true }),
  ] },
  trig: { cols: 6, keys: [
    K('rad', 'ANGLE', { angle: true, small: true }), K('sin', '\\sin\\left(#0\\right)', { small: true }), K('cos', '\\cos\\left(#0\\right)', { small: true }), K('tan', '\\tan\\left(#0\\right)', { small: true }), K('cot', '\\cot\\left(#0\\right)', { small: true }), K('sec', '\\sec\\left(#0\\right)', { small: true }),
    K(`${B}^{\\circ}`, '\\degree', { tex: true }), K('arcsin', '\\arcsin\\left(#0\\right)', { tiny: true }), K('arccos', '\\arccos\\left(#0\\right)', { tiny: true }), K('arctan', '\\arctan\\left(#0\\right)', { tiny: true }), K('arccot', '\\operatorname{arccot}\\left(#0\\right)', { tiny: true }), K('csc', '\\csc\\left(#0\\right)', { small: true }),
    K('\\pi', '\\pi', { tex: true }), K('sinh', '\\sinh\\left(#0\\right)', { small: true }), K('cosh', '\\cosh\\left(#0\\right)', { small: true }), K('tanh', '\\tanh\\left(#0\\right)', { small: true }), K('coth', '\\coth\\left(#0\\right)', { small: true }), K('\\theta', '\\theta', { tex: true }),
    K(`(${B})`, '\\left(#0\\right)', { tex: true }), K(`${B}^{2}`, '#@^{2}', { tex: true }), K(`\\sqrt{${B}}`, '\\sqrt{#0}', { tex: true }), K('x', 'x', { tex: true }), K('=', '='), K(`\\frac{${B}}{${B}}`, '\\frac{#0}{#?}', { tex: true }),
  ] },
  calc: { cols: 5, keys: [
    K(`\\lim\\limits_{${B}\\to${B}}`, '\\lim_{#?\\to#?}#0', { tex: true, small: true }), K(`\\frac{d}{dx}${B}`, '\\frac{d}{dx}#0', { tex: true, small: true }),
    K(`\\int ${B}\\,dx`, '\\int #0\\,dx', { tex: true, small: true }), K(`\\int_{${B}}^{${B}} ${B}\\,dx`, '\\int_{#?}^{#?}#0\\,dx', { tex: true, small: true }),
    K(`\\sum\\limits_{${B}=${B}}^{${B}}${B}`, '\\sum_{n=#?}^{#?}#0', { tex: true, tiny: true }),
    K(`\\lim\\limits_{${B}\\to${B}^{+}}`, '\\lim_{#?\\to#?^{+}}#0', { tex: true, small: true }), K(`\\frac{d}{d${B}}${B}`, '\\frac{d}{d#?}#0', { tex: true, small: true }),
    K(`\\int ${B}\\,d${B}`, '\\int #0\\,d#?', { tex: true, small: true }), K('dx', '\\,dx', { tex: true }), K('\\infty', '\\infty', { tex: true }),
    K(`\\lim\\limits_{${B}\\to${B}^{-}}`, '\\lim_{#?\\to#?^{-}}#0', { tex: true, small: true }), K(`\\frac{d^2}{dx^2}${B}`, '\\frac{d^2}{dx^2}#0', { tex: true, small: true }),
    K(`\\prod\\limits_{${B}=${B}}^{${B}}${B}`, '\\prod_{n=#?}^{#?}#0', { tex: true, tiny: true }), K('x', 'x', { tex: true }), K('n', 'n', { tex: true }),
    K(`(${B})`, '\\left(#0\\right)', { tex: true }), K(`${B}^{${B}}`, '#@^{#?}', { tex: true }), K(`\\frac{${B}}{${B}}`, '\\frac{#0}{#?}', { tex: true }), K('e', 'e', { tex: true }), K('\\pi', '\\pi', { tex: true }),
  ] },
  abc: { cols: 7, keys: [...'abcdefghijklmnopqrstuvwxyz'].map((c) => K(c, c, { tex: true })).concat([K('(', '('), K(')', ')'), K(',', ','), K('=', '=')]) },
};
let currentPad = 'basic';
function renderPad(name) {
  currentPad = name;
  const pad = PADS[name];
  const grid = $('kbdGrid');
  grid.style.gridTemplateColumns = `repeat(${pad.cols}, 1fr)`;
  grid.innerHTML = '';
  for (const k of pad.keys) {
    const b = document.createElement('button');
    b.type = 'button';
    if (k.tex) b.innerHTML = texHTML(k.label); else b.textContent = k.label;
    if (k.angle) { b.dataset.angle = '1'; b.textContent = degrees ? 'deg' : 'rad'; }
    b.className = [k.num && 'num', k.small && 'small', k.tiny && 'tiny', k.alts && 'more'].filter(Boolean).join(' ');
    bindKey(b, k);
    grid.appendChild(b);
  }
  const rows = Math.ceil(pad.keys.length / pad.cols);
  for (let i = pad.keys.length; i < rows * pad.cols; i++) { const e = document.createElement('button'); e.className = 'blank'; grid.appendChild(e); }
  document.querySelectorAll('.kbd-pills button').forEach((b) => b.classList.toggle('on', b.dataset.pad === name));
  document.querySelector('.t-abc').classList.toggle('on', name === 'abc');
}
document.querySelectorAll('.kbd-pills button').forEach((b) => b.addEventListener('click', () => renderPad(b.dataset.pad)));
function press(k) {
  if (!mf) return;
  hideCalcError();
  if (k.ins === 'ANGLE') { degrees = !degrees; store.set('degrees', degrees); syncAngle(); livePreview(); return; }
  mf.focus();
  mf.insert(k.ins, { selectionMode: 'placeholder', format: 'latex', focus: true, scrollIntoView: true });
  livePreview();
}
// tap = main key, hold = choose an alternative from the popup
function bindKey(btn, k) {
  let timer = null, popup = false, chosen = null;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    btn.classList.add('press');
    chosen = null; popup = false;
    if (k.alts) timer = setTimeout(() => { popup = true; showPopup(btn, k); }, 380);
  });
  btn.addEventListener('pointermove', (e) => {
    if (!popup) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    document.querySelectorAll('#popup button').forEach((p) => p.classList.toggle('sel', p === el || p.contains(el)));
    const sel = document.querySelector('#popup button.sel');
    chosen = sel ? k.alts[Number(sel.dataset.i)] : null;
  });
  const end = (e, cancel) => {
    clearTimeout(timer);
    btn.classList.remove('press');
    if (popup) { if (chosen && !cancel) press(chosen); else if (!cancel) return; hidePopup(); return; }
    if (!cancel) press(k);
  };
  btn.addEventListener('pointerup', (e) => end(e, false));
  btn.addEventListener('pointercancel', (e) => end(e, true));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
function showPopup(btn, k) {
  const p = $('popup');
  p.innerHTML = '';
  k.alts.forEach((a, i) => {
    const b = document.createElement('button');
    b.dataset.i = i;
    if (a.tex) b.innerHTML = texHTML(a.label); else b.textContent = a.label;
    b.addEventListener('click', () => { press(a); hidePopup(); });
    p.appendChild(b);
  });
  p.hidden = false;
  const sheet = $('calc').getBoundingClientRect(), r = btn.getBoundingClientRect();
  const w = p.offsetWidth;
  p.style.left = Math.max(6, Math.min(sheet.width - w - 6, r.left - sheet.left + r.width / 2 - w / 2)) + 'px';
  p.style.top = (r.top - sheet.top - p.offsetHeight - 6) + 'px';
}
function hidePopup() { $('popup').hidden = true; }
document.addEventListener('pointerdown', (e) => { if (!$('popup').hidden && !$('popup').contains(e.target)) setTimeout(hidePopup, 0); });

document.querySelectorAll('.kbd-tools button').forEach((b) => {
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    if (!mf) return;
    const a = b.dataset.act;
    if (a === 'abc') return renderPad(currentPad === 'abc' ? 'basic' : 'abc');
    if (a === 'history') return openSheet('history');
    if (a === 'solve') return solveFromCalc();
    mf.focus();
    if (a === 'left') mf.executeCommand('moveToPreviousChar');
    if (a === 'right') mf.executeCommand('moveToNextChar');
    if (a === 'back') { mf.executeCommand('deleteBackward'); livePreview(); }
  });
});
// hold ⌫ to clear everything
{
  const bk = document.querySelector('[data-act=back]');
  let t = null;
  bk.addEventListener('pointerdown', () => { t = setTimeout(() => { if (mf) { mf.setValue(''); livePreview(); } }, 700); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => bk.addEventListener(ev, () => clearTimeout(t)));
}
$('openCalc').addEventListener('click', () => openSheet('calc'));

// ================================================================ writing pad
const pad = $('pad');
let strokes = [], cur = null;
$('openWrite').addEventListener('click', () => openSheet('write'));
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
const padPoint = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); cur = [padPoint(e)]; strokes.push(cur); redrawPad(); });
pad.addEventListener('pointermove', (e) => { if (!cur) return; cur.push(padPoint(e)); redrawPad(); });
pad.addEventListener('pointerup', () => { cur = null; });
pad.addEventListener('pointercancel', () => { cur = null; });
$('padUndo').addEventListener('click', () => { strokes.pop(); redrawPad(); });
$('padClear').addEventListener('click', () => { strokes = []; redrawPad(); });
$('padRead').addEventListener('click', async () => {
  if (!strokes.length) { toast('Write something first'); return; }
  busy(true, 'Reading your writing…');
  try {
    await nextFrame();
    const model = await getModel();
    const { g, w, h } = grayFromImage(pad, null, 1000);
    const out = recognizeMask(binarize(g, w, h, { clean: true }), w, h, model);
    window.__lastOCR = out;
    const lines = await readAccurately(g, w, h, out);
    busy(false);
    useRecognized(lines, 'write');
  } catch (e) { console.error(e); busy(false); toast('Could not read that: ' + e.message); }
});
window.addEventListener('resize', () => { if (!$('write').hidden) sizePad(); });

// ================================================================ history
function addHistory(q, latex, a) {
  const h = store.get('history', []).filter((x) => x.q !== q);
  h.unshift({ q, latex, a, t: Date.now() });
  store.set('history', h.slice(0, 100));
}
function renderHistory() {
  const ul = $('historyList');
  const h = store.get('history', []);
  ul.innerHTML = h.length ? '' : '<li class="h-a">Problems you solve will show up here.</li>';
  for (const item of h) {
    const li = document.createElement('li');
    li.innerHTML = `<div class="h-q">${texHTML(item.latex || item.q)}</div><div class="h-a">${escapeHtml(item.a || '')}</div>`;
    li.addEventListener('click', () => solveText(item.q, { source: 'history', latex: item.latex }));
    ul.appendChild(li);
  }
}
$('clearHistory').addEventListener('click', () => { store.set('history', []); renderHistory(); });

// ================================================================ graph
function drawGraph(g) {
  const cv = $('graph');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  let f, df;
  try { f = fromRaw(parse(g.expr)); df = g.deriv ? fromRaw(parse(g.deriv)) : null; } catch { return; }
  const F = (node, x) => { try { return evalNum(node, { [g.v]: x }); } catch { return NaN; } };
  let xmin = -10, xmax = 10;
  const pts = [...(g.roots || []), ...(g.shade || [])].filter(Number.isFinite);
  if (pts.length) { const lo = Math.min(...pts), hi = Math.max(...pts); const p = Math.max(2, (hi - lo) * 0.6); xmin = lo - p; xmax = hi + p; }
  const ys = [];
  for (let i = 0; i <= 400; i++) { const y = F(f, xmin + ((xmax - xmin) * i) / 400); if (Number.isFinite(y)) ys.push(y); }
  ys.sort((a, b) => a - b);
  let ymin = ys.length ? ys[Math.floor(ys.length * 0.05)] : -10, ymax = ys.length ? ys[Math.floor(ys.length * 0.95)] : 10;
  ymin = Math.min(0, ymin); ymax = Math.max(0, ymax);
  if (ymax - ymin < 1e-9) { ymin -= 1; ymax += 1; }
  const py = (ymax - ymin) * 0.15; ymin -= py; ymax += py;
  const X = (x) => ((x - xmin) / (xmax - xmin)) * W, Y = (y) => H - ((y - ymin) / (ymax - ymin)) * H;
  const css = getComputedStyle(document.documentElement);
  const c = (n) => css.getPropertyValue(n).trim();
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = c('--line'); ctx.lineWidth = 1; ctx.fillStyle = c('--muted'); ctx.font = '11px system-ui';
  const step = niceStep((xmax - xmin) / 8), stepY = niceStep((ymax - ymin) / 6);
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke(); if (Math.abs(x) > 1e-9) ctx.fillText(+x.toFixed(6), X(x) + 2, Math.min(H - 3, Math.max(11, Y(0) + 12))); }
  for (let y = Math.ceil(ymin / stepY) * stepY; y <= ymax; y += stepY) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke(); if (Math.abs(y) > 1e-9) ctx.fillText(+y.toFixed(6), Math.min(W - 30, Math.max(2, X(0) + 3)), Y(y) - 2); }
  ctx.strokeStyle = c('--muted'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke();
  if (g.shade) {
    ctx.fillStyle = c('--accent') + '33';
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
  curve(f, c('--accent'));
  if (df) curve(df, c('--muted'), [6, 5]);
  for (const r of g.roots || []) { ctx.fillStyle = c('--text'); ctx.beginPath(); ctx.arc(X(r), Y(0), 4.5, 0, 7); ctx.fill(); }
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

// ================================================================ start
syncAngle();
syncAccurate();
renderPad('basic');
initMathField();
startCamera();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
