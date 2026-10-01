// Image -> clean black/white ink mask -> connected components -> 32x32 symbol images.

export const SIZE = 32;
export const BOX = 26;

// Draw an image (or part of it) onto a canvas, limiting the size, and return grayscale 0..1
export function grayFromImage(img, crop = null, maxDim = 1400) {
  const sx = crop ? crop.x : 0, sy = crop ? crop.y : 0;
  const sw = crop ? crop.w : img.naturalWidth || img.width, sh = crop ? crop.h : img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = (0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2]) / 255;
  return { g, w, h, scale };
}

// Sauvola adaptive threshold. Returns Uint8Array mask (1 = ink).
export function binarize(g, w, h, opts = {}) {
  let mean = 0;
  for (let i = 0; i < g.length; i++) mean += g[i];
  mean /= g.length;
  if (mean < 0.45) { g = g.map((v) => 1 - v); } // light writing on a dark board
  if (opts.clean) { // drawn on our own canvas: plain threshold
    const m = new Uint8Array(w * h);
    for (let i = 0; i < g.length; i++) m[i] = g[i] < 0.6 ? 1 : 0;
    return m;
  }
  const W1 = w + 1;
  const I = new Float64Array(W1 * (h + 1)), I2 = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rs2 = 0;
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x]; rs += v; rs2 += v * v;
      I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + rs;
      I2[(y + 1) * W1 + x + 1] = I2[y * W1 + x + 1] + rs2;
    }
  }
  const r = Math.max(7, Math.round(Math.max(w, h) / 30));
  const k = opts.k ?? 0.2, R = 0.5;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const n = (y1 - y0) * (x1 - x0);
      const s = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
      const s2 = I2[y1 * W1 + x1] - I2[y0 * W1 + x1] - I2[y1 * W1 + x0] + I2[y0 * W1 + x0];
      const mu = s / n;
      const sd = Math.sqrt(Math.max(0, s2 / n - mu * mu));
      const T = mu * (1 + k * (sd / R - 1));
      const v = g[y * w + x];
      m[y * w + x] = v < T && mu - v > 0.05 ? 1 : 0;
    }
  }
  return m;
}

// 8-connected components with union-find
export function components(mask, w, h) {
  const lab = new Int32Array(w * h);
  const parent = [0];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  let next = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const nb = [];
      if (x > 0 && lab[i - 1]) nb.push(lab[i - 1]);
      if (y > 0) {
        if (lab[i - w]) nb.push(lab[i - w]);
        if (x > 0 && lab[i - w - 1]) nb.push(lab[i - w - 1]);
        if (x < w - 1 && lab[i - w + 1]) nb.push(lab[i - w + 1]);
      }
      if (!nb.length) { parent.push(next); lab[i] = next++; continue; }
      let r = find(nb[0]);
      for (const n of nb) { const q = find(n); if (q !== r) { if (q < r) { parent[r] = q; r = q; } else parent[q] = r; } }
      lab[i] = r;
    }
  }
  const comps = new Map();
  for (let i = 0; i < w * h; i++) {
    if (!lab[i]) continue;
    const r = find(lab[i]);
    const x = i % w, y = (i / w) | 0;
    let c = comps.get(r);
    if (!c) { c = { x0: x, y0: y, x1: x, y1: y, area: 0, px: [] }; comps.set(r, c); }
    if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
    c.area++; c.px.push(i);
  }
  return [...comps.values()].map((c) => ({ ...c, x1: c.x1 + 1, y1: c.y1 + 1, w: c.x1 + 1 - c.x0, h: c.y1 + 1 - c.y0 }));
}

// Render one (possibly merged) symbol into a SIZE x SIZE float image like training/common.py
export function symbolImage(parts, w) {
  const x0 = Math.min(...parts.map((p) => p.x0)), y0 = Math.min(...parts.map((p) => p.y0));
  const x1 = Math.max(...parts.map((p) => p.x1)), y1 = Math.max(...parts.map((p) => p.y1));
  const cw = x1 - x0, ch = y1 - y0;
  const crop = new Float32Array(cw * ch);
  for (const p of parts) for (const i of p.px) { const x = i % w, y = (i / w) | 0; crop[(y - y0) * cw + (x - x0)] = 1; }
  const s = BOX / Math.max(cw, ch);
  const nw = Math.max(1, Math.round(cw * s)), nh = Math.max(1, Math.round(ch * s));
  const small = s < 1 ? resizeArea(crop, cw, ch, nw, nh) : resizeBilinear(crop, cw, ch, nw, nh);
  const out = new Float32Array(SIZE * SIZE);
  const oy = (SIZE - nh) >> 1, ox = (SIZE - nw) >> 1;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) out[(y + oy) * SIZE + x + ox] = small[y * nw + x];
  return out;
}
function resizeArea(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  const fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy0 = y * fy, sy1 = (y + 1) * fy;
    for (let x = 0; x < dw; x++) {
      const sx0 = x * fx, sx1 = (x + 1) * fx;
      let acc = 0, wsum = 0;
      for (let yy = Math.floor(sy0); yy < Math.min(sh, Math.ceil(sy1)); yy++) {
        const wy = Math.min(sy1, yy + 1) - Math.max(sy0, yy);
        for (let xx = Math.floor(sx0); xx < Math.min(sw, Math.ceil(sx1)); xx++) {
          const wx = Math.min(sx1, xx + 1) - Math.max(sx0, xx);
          acc += src[yy * sw + xx] * wx * wy; wsum += wx * wy;
        }
      }
      out[y * dw + x] = wsum ? acc / wsum : 0;
    }
  }
  return out;
}
function resizeBilinear(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sh / dh - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * sw / dw - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      out[y * dw + x] = (src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx) * (1 - ty) + (src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx) * ty;
    }
  }
  return out;
}
