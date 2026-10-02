import { solveProblem } from './src/engine/index.js';
import { parse } from './src/engine/parser.js';
import { rawTex, text as plainText } from './src/engine/print.js';
import { fromRaw, evalNum } from './src/engine/cas.js';
import { latexToText } from './src/engine/latex.js';
import { SymbolModel } from './src/ocr/model.js';
import { grayFromImage, binarize } from './src/ocr/preprocess.js';
import { recognizeMask } from './src/ocr/recognize.js';
import { cleanOcrText, textScore } from './src/ocr/text.js';
import { lang, setLang, trStep, trKind, trAnswer, trError, applyUI, ui } from './src/i18n.js';

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
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = ui(msg); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
function busy(on, text = 'Reading…') { $('busy').hidden = !on; $('busyText').textContent = ui(text); }
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

// ================================================================ settings
let degrees = store.get('degrees', false);
function syncAngle() { $('angleLabel').textContent = ui(degrees ? 'Degrees' : 'Radians'); document.querySelectorAll('[data-angle]').forEach((b) => { b.textContent = degrees ? 'deg' : 'rad'; }); }

// ================================================================ sheets
const SHEETS = ['calc', 'result', 'write', 'history', 'words'];
// PC: the picture / screen area is on the left and the calculator or solution stays open on the right
const deskQuery = matchMedia('(min-width: 900px) and (pointer: fine)');
let isDesk = deskQuery.matches;
document.body.classList.toggle('desk', isDesk);
function openSheet(id) {
  if (!id && isDesk) id = 'calc';
  SHEETS.forEach((s) => { $(s).hidden = s !== id; });
  if (!isDesk) { if (id) stopCamera(); else startCamera(); }
  if (id === 'calc') setTimeout(() => mf && mf.focus(), 50);
  if (id === 'write') requestAnimationFrame(sizePad);
  if (id === 'words') setTimeout(() => $('wordsText').focus(), 60);
  if (id === 'history') renderHistory();
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
  const sheet = b.closest('.sheet').id;
  openSheet(sheet === 'result' && (cameFrom === 'calc' || cameFrom === 'words') ? cameFrom : null);
}));

// ================================================================ menu & help
$('menuBtn').addEventListener('click', () => { $('menu').hidden = false; });
document.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => {
  const m = b.dataset.menu;
  if (m === 'angle') { degrees = !degrees; store.set('degrees', degrees); syncAngle(); toast(`Angles in ${degrees ? 'degrees' : 'radians'}`); return; }
  if (m === 'lang') { setLang(lang === 'lt' ? 'en' : 'lt'); syncLang(); if (current && current.r && !$('result').hidden) renderResult(current.r, current.source); return; }
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
let webcamWanted = !isDesk; // on a PC the webcam starts only when asked for
async function startCamera() {
  if (!webcamWanted) { syncHome(); return; }
  if (still || stream || !navigator.mediaDevices?.getUserMedia) { if (!navigator.mediaDevices?.getUserMedia) camMessage('No camera here. Pick a photo below or use the calculator.'); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    video.srcObject = stream;
    await video.play().catch(() => {});
    camMessage('');
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('torchBtn').hidden = !caps.torch;
    syncHome();
  } catch (e) {
    stream = null;
    syncHome();
    camMessage(e && e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in settings, pick a photo below, or use the calculator.' : 'Camera not available. Pick a photo below or use the calculator.');
  }
}
function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null; video.srcObject = null; torchOn = false; $('torchBtn').classList.remove('on');
  syncHome();
}
// what the left/home area shows: PC start panel, live camera with the frame, or a picture to circle on
function syncHome() {
  const idle = isDesk && !still && !stream;
  $('deskStart').hidden = !idle;
  frame.hidden = idle || !!still;
  document.querySelector('.home-bottom').hidden = idle;
  $('shareBtn2').hidden = !(isDesk && navigator.mediaDevices?.getDisplayMedia);
  $('closeStillBtn').hidden = !(still || (isDesk && stream));
  $('menuBtn').hidden = !$('closeStillBtn').hidden;
  if (idle) camMessage('');
}
function camMessage(m) { $('camMsg').textContent = ui(m); $('camMsg').hidden = !m; }
$('torchBtn').addEventListener('click', async () => {
  const track = stream && stream.getVideoTracks()[0];
  if (!track) return;
  torchOn = !torchOn;
  try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); $('torchBtn').classList.toggle('on', torchOn); } catch { torchOn = false; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); else if (isDesk || SHEETS.every((s) => $(s).hidden)) startCamera(); });
deskQuery.addEventListener('change', (e) => {
  isDesk = e.matches;
  document.body.classList.toggle('desk', isDesk);
  if (isDesk && SHEETS.every((s) => $(s).hidden)) openSheet('calc');
  syncHome();
  if (still) sizeLasso();
});

// a picture (gallery, pasted screenshot, shared screen) -> show it and let the user circle the problem
function showStill(url) {
  const img = $('still');
  img.onload = () => {
    still = img; stopCamera();
    img.hidden = false; video.hidden = true; camMessage('');
    $('homeHint').textContent = ui('Circle the problem you want solved');
    if (!isDesk) SHEETS.forEach((s) => { $(s).hidden = true; });
    syncHome();
    sizeLasso(); lasso.hidden = false;
  };
  img.onerror = () => toast('That picture could not be opened');
  img.src = url;
}
for (const id of ['fileInput', 'fileInput2']) $(id).addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) showStill(URL.createObjectURL(f));
});
$('closeStillBtn').addEventListener('click', () => {
  still = null; $('still').hidden = true; video.hidden = false; lasso.hidden = true;
  syncMode();
  if (isDesk) { webcamWanted = false; stopCamera(); }
  syncHome();
  startCamera();
});

// paste a screenshot (Ctrl+V / ⌘V), or the Paste button
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) {
    // text pasted while no text field has focus (home screen): a word problem
    const t = e.clipboardData?.getData('text/plain') || '';
    const target = e.target, typing = target && (target.closest?.('math-field, textarea, input') || target.tagName === 'MATH-FIELD');
    if (!typing && t.trim().split(/\s+/).length >= 4) { e.preventDefault(); openSheet('words'); $('wordsText').value = t.trim(); }
    return;
  }
  e.preventDefault();
  if (!$('words').hidden) { const img = new Image(); img.src = URL.createObjectURL(item.getAsFile()); img.decode().then(() => ocrText(img)).then((t) => { $('wordsText').value = t; $('wordsError').hidden = true; }).catch((err) => toast('Could not read that: ' + err.message)); return; }
  showStill(URL.createObjectURL(item.getAsFile()));
});
$('pasteBtn').addEventListener('click', async () => {
  try {
    for (const it of await navigator.clipboard.read()) {
      const type = it.types.find((t) => t.startsWith('image/'));
      if (type) { showStill(URL.createObjectURL(await it.getType(type))); return; }
    }
    toast('No picture on the clipboard. Take a screenshot first, then paste.');
  } catch { toast('Press Ctrl+V (or ⌘V) to paste the screenshot'); }
});
// drop an image file anywhere
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('dropHint').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropHint').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; $('dropHint').hidden = true;
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) showStill(URL.createObjectURL(f));
});
// share the screen: take one picture of the chosen screen / window / tab
async function shareScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) { toast('This browser can’t share the screen. Paste a screenshot instead.'); return; }
  let s;
  try { s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } catch { return; }
  try {
    const v = document.createElement('video');
    v.srcObject = s; v.muted = true; v.playsInline = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 400));
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    cv.toBlob((b) => b && showStill(URL.createObjectURL(b)), 'image/png');
  } finally { s.getTracks().forEach((t) => t.stop()); }
}
$('shareBtn').addEventListener('click', shareScreen);
$('shareBtn2').addEventListener('click', shareScreen);
$('webcamBtn').addEventListener('click', () => { webcamWanted = true; startCamera(); });

// ---- what the camera reads: math, or a printed word problem (text)
let readMode = store.get('readMode', 'math');
function syncMode() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === readMode));
  if (!still) $('homeHint').textContent = ui(readMode === 'text' ? 'Take a picture of a word problem' : 'Take a picture of a math problem');
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { readMode = b.dataset.mode; store.set('readMode', readMode); syncMode(); }));

// ---- circle the problem: draw a loop around it, then it is read and solved
const lasso = $('lasso');
let lpath = null;
function sizeLasso() {
  const r = $('home').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  lasso.width = Math.round(r.width * dpr); lasso.height = Math.round(r.height * dpr);
  lasso.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { if (still) sizeLasso(); });
function lassoPoint(e) { const r = lasso.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function drawLasso(closed) {
  const ctx = lasso.getContext('2d');
  ctx.clearRect(0, 0, lasso.width, lasso.height);
  if (!lpath || lpath.length < 2) return;
  ctx.beginPath(); ctx.moveTo(...lpath[0]);
  for (const p of lpath) ctx.lineTo(...p);
  if (closed) { ctx.closePath(); ctx.fillStyle = 'rgba(224, 51, 74, .14)'; ctx.fill(); }
  ctx.lineWidth = 3; ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e0334a';
  ctx.stroke();
}
lasso.addEventListener('pointerdown', (e) => { lpath = [lassoPoint(e)]; lasso.setPointerCapture(e.pointerId); drawLasso(false); });
lasso.addEventListener('pointermove', (e) => { if (!lpath) return; lpath.push(lassoPoint(e)); drawLasso(false); });
lasso.addEventListener('pointerup', () => {
  if (!lpath) return;
  const path = lpath;
  const xs = path.map((p) => p[0]), ys = path.map((p) => p[1]);
  if (Math.max(...xs) - Math.min(...xs) < 14 || Math.max(...ys) - Math.min(...ys) < 10) { lpath = null; drawLasso(false); toast('Draw a circle around the problem'); return; }
  drawLasso(true);
  readCircled(path).finally(() => setTimeout(() => { lpath = null; drawLasso(false); }, 600));
});
lasso.addEventListener('pointercancel', () => { lpath = null; drawLasso(false); });
// cut out what is inside the loop (outside -> background colour) and read it
async function readCircled(path) {
  const img = still, iw = img.naturalWidth, ih = img.naturalHeight;
  const r = $('home').getBoundingClientRect();
  const sc = Math.min(r.width / iw, r.height / ih), ox = (r.width - iw * sc) / 2, oy = (r.height - ih * sc) / 2;
  const pts = path.map(([x, y]) => [(x - ox) / sc, (y - oy) / sc]);
  let x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])))), y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
  const x1 = Math.min(iw, Math.ceil(Math.max(...pts.map((p) => p[0])))), y1 = Math.min(ih, Math.ceil(Math.max(...pts.map((p) => p[1]))));
  const w = x1 - x0, h = y1 - y0;
  if (w < 6 || h < 6) { toast('Circle the problem on the picture'); return; }
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
  // background colour = average colour along the loop
  const d = ctx.getImageData(0, 0, w, h).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (const [px, py] of pts) {
    const xi = Math.round(px - x0), yi = Math.round(py - y0);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
    const k = 4 * (yi * w + xi); R += d[k]; G += d[k + 1]; B += d[k + 2]; n++;
  }
  const bg = n ? `rgb(${R / n | 0}, ${G / n | 0}, ${B / n | 0})` : '#fff';
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d');
  o.fillStyle = bg; o.fillRect(0, 0, w, h);
  o.save(); o.beginPath(); o.moveTo(pts[0][0] - x0, pts[0][1] - y0);
  for (const [px, py] of pts) o.lineTo(px - x0, py - y0);
  o.closePath(); o.clip(); o.drawImage(cv, 0, 0); o.restore();
  if (readMode === 'text') await readWords(out); else await readImage(out, null, 'photo');
}

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
  if (still) { src = still; crop = { x: 0, y: 0, w: still.naturalWidth, h: still.naturalHeight }; } // the whole picture (or circle a part)
  else if (stream && video.videoWidth) {
    const cv = document.createElement('canvas');
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext('2d').drawImage(video, 0, 0);
    src = cv; crop = frameCrop(cv.width, cv.height, false);
  } else { $('fileInput').click(); return; }
  if (crop.w < 10 || crop.h < 10) { toast('Move the frame over the problem'); return; }
  if (readMode === 'text') await readWords(src, crop); else await readImage(src, crop, 'photo');
});
async function readImage(src, crop, source) {
  busy(true, 'Reading the problem…');
  try {
    await nextFrame();
    const model = await getModel();
    const { g, w, h } = grayFromImage(src, crop, 1400);
    const out = recognizeMask(binarize(g, w, h), w, h, model);
    const lines = await readAccurately(g, w, h, out);
    busy(false);
    useRecognized(lines, source);
  } catch (e) { console.error(e); busy(false); toast('Could not read that: ' + e.message); }
}

// ---- word problems from a picture: printed-text reader (Tesseract, Lithuanian + English, ~10 MB once, then offline)
let textReader = null;
function getTextReader() {
  if (!textReader) textReader = (async () => {
    const { default: T } = await import('./vendor/tesseract/tesseract.esm.min.js');
    const base = new URL('vendor/tesseract/', location.href).href;
    return T.createWorker(['lit', 'eng'], 1, {
      workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', workerBlobURL: false,
      logger: (m) => { if (m.status === 'recognizing text') busy(true, `${ui('Reading the text…')} ${Math.round(100 * m.progress)}%`); else if (/load|initializ/.test(m.status)) busy(true, 'Loading the text reader…'); },
    });
  })().catch((e) => { textReader = null; throw e; });
  return textReader;
}
// small or low-contrast pictures read much better a bit larger; a photo also gets an adaptive black/white
// version (uneven light, shadows) cropped to the text
function textCanvas(src, crop) {
  const sw = src.naturalWidth || src.videoWidth || src.width, sh = src.naturalHeight || src.videoHeight || src.height;
  const c = crop || { x: 0, y: 0, w: sw, h: sh };
  const k = Math.min(3, Math.max(1, 1400 / c.w));
  const cv = document.createElement('canvas');
  cv.width = Math.round(c.w * k); cv.height = Math.round(c.h * k);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  return cv;
}
function textBW(cv) {
  const { g, w, h } = grayFromImage(cv, null, 2400);
  const m = binarize(g, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return cv;
  const pad = 24, ow = x1 - x0 + 1 + 2 * pad, oh = y1 - y0 + 1 + 2 * pad;
  const out = document.createElement('canvas');
  out.width = ow; out.height = oh;
  const o = out.getContext('2d'), img = o.createImageData(ow, oh);
  img.data.fill(255);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (m[y * w + x]) { const q = 4 * ((y - y0 + pad) * ow + (x - x0 + pad)); img.data[q] = img.data[q + 1] = img.data[q + 2] = 0; }
  o.putImageData(img, 0, 0);
  return out;
}
async function ocrText(src, crop) {
  busy(true, 'Loading the text reader…');
  try {
    await nextFrame();
    const w = await getTextReader();
    const cv = textCanvas(src, crop);
    const a = cleanOcrText((await w.recognize(textBW(cv))).data.text);
    if (textScore(a) >= 6) return a;
    const b = cleanOcrText((await w.recognize(cv)).data.text);
    return textScore(b) > textScore(a) ? b : a;
  } finally { busy(false); }
}
// read a word problem from a picture, then solve it (the text stays editable in the word-problem sheet)
async function readWords(src, crop) {
  let text;
  try { text = await ocrText(src, crop); } catch (e) { console.error(e); toast('Could not read that: ' + e.message); return; }
  if (!text || text.split(/\s+/).length < 3) { toast('I could not find any text. Try again closer, with more light.'); return; }
  $('wordsText').value = text;
  solveWords(text);
}
$('wordsFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const img = new Image();
  img.src = URL.createObjectURL(f);
  try { await img.decode(); } catch { toast('That picture could not be opened'); return; }
  let text;
  try { text = await ocrText(img); } catch (err) { console.error(err); toast('Could not read that: ' + err.message); return; }
  $('wordsText').value = text; $('wordsError').hidden = true; $('wordsText').focus();
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
    readerPromise = FormulaReader.load(new URL('model/mfr/', location.href), (p, partial) => busy(true, `${lang === 'lt' ? 'Atsisiunčiamas tikslus skaitytuvas…' : 'Downloading the accurate reader…'} ${Math.round(100 * p)}%`))
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
// "2) 3x - 7 = 5", "a. x + 1": drop a numbering label that was circled / photographed with the problem
const LABEL = /^\s*[([]?(?:\d{1,2}|[a-hA-H])\s*[)\].:]\s*/;
function dropLabel(t) {
  if (!LABEL.test(t)) return t;
  try { parse(t); return t; } catch { /* doesn't make sense with the label */ }
  const u = t.replace(LABEL, '');
  try { parse(u); return u; } catch { return t; }
}
function distinctReadings(latexList) {
  const seen = new Set(), res = [];
  for (const l of latexList) {
    let t;
    try { t = dropLabel(latexToText(l)); if (!t.trim() || /\(\s*\)/.test(t)) continue; const key = plainText(fromRaw(parse(t))).replace(/\s+/g, ''); if (seen.has(key)) continue; seen.add(key); } catch { continue; }
    res.push(t);
  }
  return res;
}
function syncAccurate() { const el = $('accurateLabel'); if (el) el.textContent = ui(store.get('accurate', null) ? 'On' : 'Off'); }
function syncLang() { applyUI(); syncMode(); $('langLabel').textContent = lang === 'lt' ? 'Lietuvių' : 'English'; syncAngle(); syncAccurate(); }

function useRecognized(lines, source) {
  if (!lines.length) { toast('I could not find any math. Try again closer, with more light.'); return; }
  const alts = lines.alts || [];
  lines = lines.map(dropLabel);
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
    showCalcError(lang === 'lt' ? `Perskaičiau „${text}“, bet nepavyko išspręsti: ${trError(e.message)} Pataisykite ir paspauskite ⏎.` : `I read “${text}” but couldn't solve it: ${e.message} Fix it and press ⏎.`);
    return;
  }
  current = { text, latex: latex ?? safeTex(text), source, alts, r };
  cameFrom = source === 'calc' ? 'calc' : null;
  renderResult(r, source);
  addHistory(text, current.latex, r.answerText);
  openSheet('result');
}
const safeTex = (t) => { try { return rawTex(parse(t)); } catch { return t; } };
function renderResult(r, source) {
  $('resultKind').textContent = trKind(r.title);
  if (r.kind === 'word' || source === 'words') { $('resultProblem').textContent = current ? current.text : ''; $('resultProblem').classList.add('as-text'); }
  else { $('resultProblem').classList.remove('as-text'); $('resultProblem').innerHTML = texHTML(source === 'calc' && current && current.latex ? current.latex : r.inputTex, true); }
  $('photoNote').hidden = source !== 'photo' && source !== 'write';
  $('photoNote').textContent = lang === 'lt' ? `Perskaityta iš ${source === 'write' ? 'rašto' : 'nuotraukos'}. Kažkas negerai? Spauskite „Taisyti“.` : 'Read from your ' + (source === 'write' ? 'writing' : 'photo') + '. Something wrong? Tap Edit.';
  renderAlts(source);
  $('resultAnswer').innerHTML = texHTML(trAnswer(r.answerTex), true);
  $('copyBtn').onclick = async () => { try { await navigator.clipboard.writeText(r.answerText); toast('Copied'); } catch { /* ignore */ } };
  const ol = $('steps');
  ol.innerHTML = '';
  for (const s of r.steps) {
    const li = document.createElement('li');
    let h = `<div class="step-title">${richHTML(trStep(s.title))}</div>`;
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
$('editBtn').addEventListener('click', () => {
  if (!current) return;
  if (current.source === 'words') { openSheet('words'); $('wordsText').value = current.text; return; }
  openCalcWith(current.text, current.latex);
});

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
  // a sentence typed with the abc keys is a word problem: solve the plain text
  const words = latex.match(/\\text\{([^{}]*)\}/g);
  if (words && words.join(' ').split(/\s+/).length >= 4) { solveWords(latex.replace(/\\text\{([^{}]*)\}/g, '$1').replace(/\\[a-z]+/g, ' ').replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim()); return; }
  let text;
  try { text = latexToText(latex); } catch (e) { showCalcError(e.message); return; }
  solveText(text, { source: 'calc', latex });
}
// ---- word problems: a plain text box
function solveWords(text) {
  text = String(text || '').trim();
  if (!text) { $('wordsError').textContent = ui('Type a problem first.'); $('wordsError').hidden = false; return; }
  let r;
  try { r = solveProblem(text, { degrees }); } catch (e) {
    openSheet('words'); $('wordsText').value = text;
    $('wordsError').textContent = trError(e.message); $('wordsError').hidden = false; return;
  }
  $('wordsError').hidden = true;
  current = { text, latex: null, source: 'words', alts: [], r };
  cameFrom = 'words';
  renderResult(r, 'words');
  addHistory(text, null, r.answerText);
  openSheet('result');
}
$('wordsSolve').addEventListener('click', () => solveWords($('wordsText').value));
$('wordsClear').addEventListener('click', () => { $('wordsText').value = ''; $('wordsError').hidden = true; $('wordsText').focus(); });
$('wordsText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); solveWords($('wordsText').value); } });
$('openWords').addEventListener('click', () => openSheet('words'));
function openCalcWith(text, latex) {
  openSheet('calc');
  const set = () => { if (!mf) return setTimeout(set, 60); mf.setValue(latex || safeTex(text)); livePreview(); };
  set();
}
function showCalcError(m) { $('calcError').textContent = trError(ui(m)); $('calcError').hidden = false; }
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
syncLang();
renderPad('basic');
initMathField();
startCamera();
if (isDesk) openSheet('calc');
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
