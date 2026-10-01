// Offline support: cache the app shell, the engine, the model and KaTeX.
const VERSION = 'mathbot-v3';
const CORE = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'vendor/katex/katex.min.js', 'vendor/katex/katex.min.css', 'vendor/mathlive/mathlive.min.js',
  'src/engine/index.js', 'src/engine/parser.js', 'src/engine/rational.js', 'src/engine/cas.js', 'src/engine/print.js',
  'src/engine/arith.js', 'src/engine/factor.js', 'src/engine/poly.js', 'src/engine/solve.js', 'src/engine/calculus.js', 'src/engine/matrix.js', 'src/engine/geometry.js', 'src/engine/latex.js',
  'src/ocr/model.js', 'src/ocr/preprocess.js', 'src/ocr/recognize.js',
  'model/symbols.json', 'model/symbols.bin',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first (so updates show up), fall back to the cache when offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
