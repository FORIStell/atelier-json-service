// Accurate formula reader: Pix2Text-MFR 1.5 (TrOCR, MIT license) run with onnxruntime-web,
// combined with the tiny symbol model:
//   1. beam search over school-math symbols (rare symbols like π, α, cos are penalised)
//   2. the tiny model's reading is scored by the same model
//   3. the best candidate that our math engine can read wins
// Measured on real handwritten school-level problems never used for training:
//   CROHME 2019 (200):  combined ~70% exactly right (tiny alone 37%, formula model alone ~50%)
//   CROHME 2023 scans of lined paper (200): combined ~52% (tiny 17%, formula model ~34%)

const COMMANDS = new Set(['frac', 'sqrt', 'pi', 'theta', 'infty', 'leq', 'geq', 'neq', 'le', 'ge', 'times', 'div', 'cdot', 'pm', 'sin', 'cos',
  'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'to', 'int', 'sum', 'prod', 'alpha', 'beta', 'left', 'right', 'prime',
  'circ', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'exp', 'lt', 'gt', '{', '}', ',', ';', '!', '|', '%']);
const PLAIN = new Set("0123456789abcdefghijklmnopqrstuvwxyz+-=()[]{}^_<>|!,./'%");
const RARE = new Set(['pi', 'alpha', 'beta', 'theta', 'cos', 'sin', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'prod', 'sum', 'int', 'circ', 'prime',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'exp', '_', 'Ġ_', 'pm', '%', 'Ġ%', '!', 'Ġ!', "'", "Ġ'", '°']);
const PEN = 5, TINY_BONUS = 0.3, BEAM = 5, MAX_LEN = 90, LEN_NORM = 0.6;
const BOS = 1, EOS = 2;

// ---------------------------------------------------------------- GPT-2 style byte-level BPE tokenizer
function bytesToUnicode() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
  const m = {};
  bs.forEach((b, i) => { m[b] = String.fromCharCode(cs[i]); });
  return m;
}
export class Tokenizer {
  constructor(json) {
    this.vocab = json.model.vocab;
    this.idToTok = [];
    for (const [t, i] of Object.entries(this.vocab)) this.idToTok[i] = t;
    this.ranks = new Map(json.model.merges.map((m, i) => [Array.isArray(m) ? m.join(' ') : m, i]));
    this.b2u = bytesToUnicode();
    this.u2b = Object.fromEntries(Object.entries(this.b2u).map(([b, u]) => [u, Number(b)]));
    this.re = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
    this.cache = new Map();
  }
  bpe(word) {
    if (this.cache.has(word)) return this.cache.get(word);
    let parts = [...word];
    while (parts.length > 1) {
      let best = -1, bestRank = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const r = this.ranks.get(parts[i] + ' ' + parts[i + 1]);
        if (r !== undefined && r < bestRank) { bestRank = r; best = i; }
      }
      if (best < 0) break;
      parts = [...parts.slice(0, best), parts[best] + parts[best + 1], ...parts.slice(best + 2)];
    }
    this.cache.set(word, parts);
    return parts;
  }
  encode(text) {
    const ids = [];
    const enc = new TextEncoder();
    for (const piece of text.match(this.re) || []) {
      const mapped = [...enc.encode(piece)].map((b) => this.b2u[b]).join('');
      for (const p of this.bpe(mapped)) ids.push(this.vocab[p] ?? 3);
    }
    return ids;
  }
  decode(ids) {
    const s = ids.filter((i) => i > 4).map((i) => this.idToTok[i]).join('');
    const bytes = new Uint8Array([...s].map((c) => this.u2b[c] ?? 63));
    return new TextDecoder().decode(bytes).trim();
  }
}

// ---------------------------------------------------------------- model
export class FormulaReader {
  static async load(base, onProgress) {
    const ort = await import(new URL('../../vendor/ort/ort.wasm.min.mjs', import.meta.url).href);
    ort.env.wasm.wasmPaths = new URL('../../vendor/ort/', import.meta.url).href;
    ort.env.wasm.numThreads = (self.crossOriginIsolated && navigator.hardwareConcurrency) ? Math.min(4, navigator.hardwareConcurrency) : 1;
    const get = async (name, weight) => {
      const r = await fetch(new URL(name, base));
      if (!r.ok) throw new Error('Could not download ' + name);
      const total = Number(r.headers.get('content-length')) || 0;
      if (!r.body || !total || !onProgress) { const b = await r.arrayBuffer(); onProgress && onProgress(weight); return b; }
      const reader = r.body.getReader(); const chunks = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(weight * got / total, true); }
      const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
      return out.buffer;
    };
    const [tokJson, encBuf, decBuf] = await Promise.all([
      fetch(new URL('tokenizer.json', base)).then((r) => r.json()),
      get('encoder_model.onnx', 0.73), get('decoder_model.onnx', 0.27),
    ]);
    const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    const [enc, dec] = await Promise.all([ort.InferenceSession.create(encBuf, opts), ort.InferenceSession.create(decBuf, opts)]);
    return new FormulaReader(ort, enc, dec, new Tokenizer(tokJson));
  }
  constructor(ort, enc, dec, tok) {
    this.ort = ort; this.enc = enc; this.dec = dec; this.tok = tok;
    const V = tok.idToTok.length;
    this.V = V;
    this.maskPlain = new Float32Array(V).fill(-1e9);
    this.maskCmd = new Float32Array(V).fill(-1e9);
    this.pen = new Float32Array(V);
    this.bs = new Set();
    tok.idToTok.forEach((t, i) => {
      if (t === undefined) return;
      const core = t.startsWith('Ġ') ? t.slice(1) : t;
      if (core === '\\') { this.bs.add(i); this.maskPlain[i] = 0; }
      else if (core && [...core].every((c) => PLAIN.has(c))) this.maskPlain[i] = 0;
      if (COMMANDS.has(t)) this.maskCmd[i] = 0;
      if (RARE.has(t)) this.pen[i] = -PEN;
      if (t === '.' || t === 'Ġ.') this.pen[i] = -0.5 * PEN;
    });
    this.maskPlain[EOS] = 0;
  }
  // gray: Float32Array 0..1 (1 = white paper) of a cropped formula image, w x h
  pixels(gray, w, h) {
    // very wide (or tall) formulas are padded to at most 4:1, then everything is stretched to 384x384
    let W = w, H = h;
    if (w / h > 4) H = Math.ceil(w / 4); else if (h / w > 4) W = Math.ceil(h / 4);
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const sctx = src.getContext('2d');
    sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, W, H);
    const img = sctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = Math.round(gray[i] * 255); img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = v; img.data[4 * i + 3] = 255; }
    sctx.putImageData(img, Math.floor((W - w) / 2), Math.floor((H - h) / 2));
    const dst = document.createElement('canvas'); dst.width = 384; dst.height = 384;
    const dctx = dst.getContext('2d', { willReadFrequently: true });
    dctx.imageSmoothingEnabled = true; dctx.imageSmoothingQuality = 'high';
    dctx.drawImage(src, 0, 0, 384, 384);
    const d = dctx.getImageData(0, 0, 384, 384).data;
    const out = new Float32Array(3 * 384 * 384);
    for (let i = 0; i < 384 * 384; i++) {
      const v = (d[4 * i] / 255 - 0.5) / 0.5;
      out[i] = v; out[384 * 384 + i] = v; out[2 * 384 * 384 + i] = v;
    }
    return new this.ort.Tensor('float32', out, [1, 3, 384, 384]);
  }
  async encode(gray, w, h) {
    const r = await this.enc.run({ pixel_values: this.pixels(gray, w, h) });
    return r[Object.keys(r)[0]];
  }
  async decodeStep(seqs, hs) {
    const L = seqs[0].length, B = seqs.length;
    const ids = new BigInt64Array(B * L);
    seqs.forEach((s, b) => s.forEach((t, j) => { ids[b * L + j] = BigInt(t); }));
    const [, S, D] = hs.dims;
    const rep = new Float32Array(B * S * D);
    for (let b = 0; b < B; b++) rep.set(hs.data, b * S * D);
    const out = await this.dec.run({ input_ids: new this.ort.Tensor('int64', ids, [B, L]), encoder_hidden_states: new this.ort.Tensor('float32', rep, [B, S, D]) });
    return out.logits; // [B, L, V]
  }
  logSoftmaxRow(data, off) {
    let m = -Infinity;
    for (let i = 0; i < this.V; i++) if (data[off + i] > m) m = data[off + i];
    let s = 0;
    for (let i = 0; i < this.V; i++) s += Math.exp(data[off + i] - m);
    const lse = m + Math.log(s);
    const out = new Float32Array(this.V);
    for (let i = 0; i < this.V; i++) out[i] = data[off + i] - lse;
    return out;
  }
  async beamSearch(hs) {
    let beams = [{ seq: [BOS], score: 0 }];
    const done = [];
    for (let step = 0; step < MAX_LEN && beams.length; step++) {
      const logits = await this.decodeStep(beams.map((b) => b.seq), hs);
      const [, L, V] = logits.dims;
      const cand = [];
      beams.forEach((b, bi) => {
        const lp = this.logSoftmaxRow(logits.data, (bi * L + L - 1) * V);
        const mask = this.bs.has(b.seq[b.seq.length - 1]) ? this.maskCmd : this.maskPlain;
        // top-k for this beam
        const top = [];
        for (let t = 0; t < V; t++) {
          const v = lp[t] + mask[t] + this.pen[t];
          if (v < -1e8) continue;
          if (top.length < BEAM) { top.push([t, v]); top.sort((a, c) => c[1] - a[1]); }
          else if (v > top[BEAM - 1][1]) { top[BEAM - 1] = [t, v]; top.sort((a, c) => c[1] - a[1]); }
        }
        for (const [t, v] of top) cand.push({ seq: [...b.seq, t], score: b.score + v });
      });
      cand.sort((a, b) => b.score - a.score);
      beams = [];
      for (const c of cand) {
        if (c.seq[c.seq.length - 1] === EOS) done.push({ seq: c.seq, score: c.score / Math.pow(c.seq.length - 1, LEN_NORM) });
        else beams.push(c);
        if (beams.length === BEAM) break;
      }
      if (done.length >= BEAM && beams.length && Math.max(...done.map((d) => d.score)) > beams[0].score / Math.pow(beams[0].seq.length, LEN_NORM)) break;
    }
    return done.sort((a, b) => b.score - a.score).map((d) => ({ latex: this.tok.decode(d.seq.slice(1, -1)), score: d.score, src: 'mfr' }));
  }
  async scoreLatex(hs, tex) {
    const spaced = tex.replace(/\\le\b/g, '\\leq').replace(/\\ge\b/g, '\\geq').match(/\\[a-zA-Z]+|\\.|\S/g);
    if (!spaced) return -Infinity;
    const ids = [BOS, ...this.tok.encode(spaced.join(' ')), EOS];
    const logits = await this.decodeStep([ids.slice(0, -1)], hs);
    const [, L, V] = logits.dims;
    let s = 0;
    for (let i = 0; i < L; i++) { const lp = this.logSoftmaxRow(logits.data, i * V); s += lp[ids[i + 1]] + this.pen[ids[i + 1]]; }
    return s / Math.pow(ids.length - 1, LEN_NORM);
  }
  // returns candidates (best first): [{latex, score, src}]
  async read(gray, w, h, tinyLatex) {
    const hs = await this.encode(gray, w, h);
    const cands = await this.beamSearch(hs);
    if (tinyLatex) cands.push({ latex: tinyLatex, score: (await this.scoreLatex(hs, tinyLatex)) + TINY_BONUS, src: 'tiny' });
    return cands.sort((a, b) => b.score - a.score);
  }
}
