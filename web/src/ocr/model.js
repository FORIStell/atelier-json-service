// Tiny CNN symbol classifier, run in plain JavaScript (no ML library needed).
// Weights are float16 with batch-norm already folded into the convolutions.

function f16ToF32(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i];
    const s = h & 0x8000 ? -1 : 1;
    const e = (h >> 10) & 0x1f;
    const f = h & 0x3ff;
    if (e === 0) out[i] = s * Math.pow(2, -14) * (f / 1024);
    else if (e === 31) out[i] = f ? NaN : s * Infinity;
    else out[i] = s * Math.pow(2, e - 15) * (1 + f / 1024);
  }
  return out;
}

export class SymbolModel {
  static async load(baseUrl) {
    const [meta, bin] = await Promise.all([
      fetch(new URL('symbols.json', baseUrl)).then((r) => { if (!r.ok) throw new Error('model json missing'); return r.json(); }),
      fetch(new URL('symbols.bin', baseUrl)).then((r) => { if (!r.ok) throw new Error('model weights missing'); return r.arrayBuffer(); }),
    ]);
    return new SymbolModel(meta, f16ToF32(new Uint16Array(bin)));
  }
  constructor(meta, weights) {
    this.meta = meta;
    this.classes = meta.classes;
    this.size = meta.size;
    this.box = meta.box;
    this.layers = meta.layers.map((l) => {
      if (l.type === 'conv') return { ...l, W: weights.subarray(l.w, l.w + l.out * l.in * 9), B: weights.subarray(l.b, l.b + l.out) };
      if (l.type === 'dense') return { ...l, W: weights.subarray(l.w, l.w + l.out * l.in), B: weights.subarray(l.b, l.b + l.out) };
      return l;
    });
  }
  // input: Float32Array(size*size) with ink = 1. Returns probabilities (Float32Array)
  predict(input) {
    let x = input, c = 1, h = this.size, w = this.size;
    for (const L of this.layers) {
      if (L.type === 'conv') { x = conv3x3(x, c, h, w, L.W, L.B, L.out); c = L.out; }
      else if (L.type === 'maxpool') { x = maxpool(x, c, h, w); h >>= 1; w >>= 1; }
      else if (L.type === 'dense') {
        const out = new Float32Array(L.out);
        for (let o = 0; o < L.out; o++) {
          let s = L.B[o];
          const row = o * L.in;
          for (let i = 0; i < L.in; i++) s += L.W[row + i] * x[i];
          out[o] = L.relu && s < 0 ? 0 : s;
        }
        x = out;
      }
    }
    // softmax
    let m = -Infinity;
    for (const v of x) m = Math.max(m, v);
    let sum = 0;
    const p = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) { p[i] = Math.exp(x[i] - m); sum += p[i]; }
    for (let i = 0; i < p.length; i++) p[i] /= sum;
    return p;
  }
}

function conv3x3(x, cin, h, w, W, B, cout) {
  const out = new Float32Array(cout * h * w);
  const hw = h * w;
  for (let o = 0; o < cout; o++) {
    const ob = o * hw;
    out.fill(B[o], ob, ob + hw);
    for (let i = 0; i < cin; i++) {
      const wb = (o * cin + i) * 9;
      const ib = i * hw;
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const k = W[wb + ky * 3 + kx];
          if (k === 0) continue;
          const dy = ky - 1, dx = kx - 1;
          const y0 = Math.max(0, -dy), y1 = Math.min(h, h - dy);
          const x0 = Math.max(0, -dx), x1 = Math.min(w, w - dx);
          for (let y = y0; y < y1; y++) {
            const orow = ob + y * w, irow = ib + (y + dy) * w + dx;
            for (let xx = x0; xx < x1; xx++) out[orow + xx] += k * x[irow + xx];
          }
        }
      }
    }
    for (let j = ob; j < ob + hw; j++) if (out[j] < 0) out[j] = 0;
  }
  return out;
}

function maxpool(x, c, h, w) {
  const oh = h >> 1, ow = w >> 1;
  const out = new Float32Array(c * oh * ow);
  for (let ch = 0; ch < c; ch++) {
    for (let y = 0; y < oh; y++) {
      for (let xx = 0; xx < ow; xx++) {
        const i = ch * h * w + 2 * y * w + 2 * xx;
        out[ch * oh * ow + y * ow + xx] = Math.max(x[i], x[i + 1], x[i + w], x[i + w + 1]);
      }
    }
  }
  return out;
}
