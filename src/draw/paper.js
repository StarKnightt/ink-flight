// Aged rag paper, generated. Tones are sampled by eye from the reference scans:
// warm buff body, cooler grey-cream for some pages, paler for the sky backdrop.

import { makeRng, noise2 } from './rng.js';

export const TONES = {
  warm: [234, 217, 182],
  buff: [226, 207, 168],
  cool: [221, 208, 180],
  pale: [241, 229, 200],
  sky: [244, 233, 207],
  vellum: [240, 234, 216],
};

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w); c.height = Math.round(h);
  return c;
}

export const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// A tileable square of paper: cloudy mottling, grain, fibres and flecks.
export function paperTile(size, seed, tone = TONES.warm, strength = 1) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const rnd = makeRng(seed);
  const off = rnd() * 100;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // cloudy "formation" at a few scales, all periodic so the tile repeats
      let n = noise2(u * 3 + off, v * 3 + off, 3) * 0.5
        + noise2(u * 7 + off, v * 7, 7) * 0.3
        + noise2(u * 19, v * 19 + off, 19) * 0.2;
      const fine = noise2(u * 90, v * 90, 90) * 0.5 + (rnd() - 0.5);
      const k = n * 0.05 * strength + fine * 0.022 * strength;
      const i = (y * size + x) * 4;
      // darker patches drift toward brown: blue falls fastest
      d[i] = tone[0] * (1 + k * 0.85);
      d[i + 1] = tone[1] * (1 + k);
      d[i + 2] = tone[2] * (1 + k * 1.35);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // fibres, lighter and darker, wrapped across the seams
  const wrap = (draw) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      ctx.save(); ctx.translate(ox, oy); draw(); ctx.restore();
    }
  };
  const fibres = Math.round(size * 1.1 * strength);
  for (let k = 0; k < fibres; k++) {
    const x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI, len = rnd.range(4, 16) * (size / 512);
    const light = rnd.chance(0.55);
    ctx.strokeStyle = light ? `rgba(255,250,232,${rnd.range(0.05, 0.16)})` : `rgba(110,82,44,${rnd.range(0.03, 0.09)})`;
    ctx.lineWidth = rnd.range(0.4, 0.9);
    const bx = Math.cos(a) * len, by = Math.sin(a) * len, k2 = rnd.range(-0.3, 0.3);
    wrap(() => {
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + bx * 0.5 - by * k2, y + by * 0.5 + bx * k2, x + bx, y + by);
      ctx.stroke();
    });
  }
  const flecks = Math.round(size * 0.09 * strength);
  for (let k = 0; k < flecks; k++) {
    const x = rnd() * size, y = rnd() * size, r = rnd.range(0.4, 1.2);
    ctx.fillStyle = `rgba(92,64,34,${rnd.range(0.12, 0.4)})`;
    wrap(() => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); });
  }
  return c;
}

// Alpha-only speckle used to knock holes in graphite so pencil has tooth.
export function toothTile(size, seed) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rnd = makeRng(seed);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = noise2(x / 2.2, y / 2.2, Math.round(size / 2.2)) * 0.5 + (rnd() - 0.5) * 0.9;
    const a = Math.max(0, n + 0.12);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
    img.data[i + 3] = Math.min(255, a * 300);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let cache = null;
// Shared tiles, built once.
export function papers() {
  if (cache) return cache;
  cache = {
    warm: paperTile(512, 11, TONES.warm),
    buff: paperTile(512, 12, TONES.buff),
    cool: paperTile(512, 13, TONES.cool),
    pale: paperTile(512, 14, TONES.pale),
    sky: paperTile(512, 15, TONES.sky, 0.8),
    vellum: paperTile(512, 16, TONES.vellum, 0.7),
    tooth: toothTile(256, 17),
  };
  return cache;
}

// Stains, foxing and tide marks for big rectangular sheets (ground, sky).
export function ageSheet(ctx, w, h, rnd, o = {}) {
  const amount = o.amount ?? 1;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  // broad uneven browning
  const blotches = Math.round((o.blotches ?? 14) * amount);
  for (let i = 0; i < blotches; i++) {
    const x = rnd() * w, y = rnd() * h, r = rnd.range(0.08, 0.3) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    const a = rnd.range(0.03, 0.09) * amount;
    g.addColorStop(0, `rgba(176,140,86,${a})`);
    g.addColorStop(1, 'rgba(176,140,86,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // tide-marked water stains: a soft patch with a darker rim
  const stains = Math.round((o.stains ?? 5) * amount);
  for (let i = 0; i < stains; i++) {
    const x = rnd() * w, y = rnd() * h, r = rnd.range(0.02, 0.07) * Math.max(w, h);
    ctx.beginPath();
    const n = 48, ph = rnd() * 9;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * (0.8 + 0.16 * Math.sin(a * 2 + ph) + 0.1 * Math.sin(a * 5 + ph * 2.3) + 0.06 * Math.sin(a * 9 + ph * 4.1));
      const px = x + Math.cos(a) * rr * 1.3, py = y + Math.sin(a) * rr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(190,156,104,${rnd.range(0.025, 0.06)})`;
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.filter = `blur(${Math.max(1, r * 0.03)}px)`;
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.strokeStyle = `rgba(150,112,62,${rnd.range(0.08, 0.16)})`;
    ctx.stroke();
    ctx.restore();
  }
  // foxing
  const fox = Math.round((o.fox ?? 120) * amount);
  for (let i = 0; i < fox; i++) {
    const x = rnd() * w, y = rnd() * h, r = rnd.range(0.6, 3.2) * (o.foxScale ?? 1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    const a = rnd.range(0.1, 0.34);
    g.addColorStop(0, `rgba(150,98,48,${a})`);
    g.addColorStop(1, 'rgba(150,98,48,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  ctx.restore();
}

// Brown the paper inward from wherever the sheet ends (its cut silhouette).
// Call after every silhouette is filled and before any ink goes down.
export function ageEdges(c, o = {}) {
  const ctx = c.getContext('2d');
  const blur = o.blur ?? 4, a = o.a ?? 0.3;
  const m = canvas(c.width, c.height);
  const mc = m.getContext('2d');
  mc.fillStyle = o.color ?? 'rgb(150,112,64)';
  mc.fillRect(0, 0, m.width, m.height);
  mc.globalCompositeOperation = 'destination-out';
  mc.drawImage(c, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = a;
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(m, 0, 0);
  // a tighter, darker line right at the cut
  ctx.globalAlpha = a * 0.7;
  ctx.filter = `blur(${Math.max(1, blur * 0.22)}px)`;
  ctx.drawImage(m, 0, 0);
  ctx.restore();
}
