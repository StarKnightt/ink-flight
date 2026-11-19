// Small marks: birds, wind, the notes in the margins, the sun, the key hints.

import { makeRng, lerp } from './rng.js';
import { canvas, papers, ageSheet } from './paper.js';
import { Pen, GRAPHITE, WASH, wash, pencilLayer, applyTooth, layPencil } from './ink.js';

// Four wing positions of a bird, each two quick ink strokes and a dot.
export function drawBirds() {
  const fw = 128, c = canvas(fw * 4, fw), ctx = c.getContext('2d');
  const rnd = makeRng(801);
  const pen = new Pen(ctx, rnd, { k: 1 });
  [1, 0.45, -0.1, -0.7].forEach((f, i) => {
    const cx = i * fw + fw / 2, cy = fw / 2 + 8;
    pen.dip();
    for (const s of [-1, 1]) {
      pen.stroke([[cx, cy], [cx + s * 20, cy - 10 * f - 9], [cx + s * 42, cy - 30 * f - 2], [cx + s * 54, cy - 30 * f + 7]], { w: 3.6, wob: 0.5, t0: 0.05, t1: 0.6 });
    }
    pen.stroke([[cx - 5, cy - 1], [cx + 9, cy + 3]], { w: 5, t0: 0.2, t1: 0.5 });
  });
  return { canvas: c, frames: 4 };
}

// Pencil wind: four strokes stacked in one strip.
export function drawWind() {
  const w = 512, rh = 64, c = canvas(w, rh * 4);
  const rnd = makeRng(802);
  const L = pencilLayer(w, rh * 4);
  const pen = new Pen(L.ctx, rnd, { pal: GRAPHITE, pencil: true });
  const row = (i) => i * rh + rh / 2;
  // 0: one long easy arc
  pen.stroke([[14, row(0) + 8], [150, row(0) - 6], [330, row(0) - 4], [498, row(0) + 9]], { w: 5.5, wob: 1, press: 0.85, t0: 0.3, t1: 0.45 });
  // 1: two lines travelling together
  pen.stroke([[10, row(1) - 7], [200, row(1) - 14], [500, row(1) - 4]], { w: 4.6, wob: 1, press: 0.75, t0: 0.3, t1: 0.5 });
  pen.stroke([[80, row(1) + 10], [260, row(1) + 4], [440, row(1) + 12]], { w: 3.8, wob: 1, press: 0.6, t0: 0.3, t1: 0.5 });
  // 2: an arc that curls up at the end, the old sign for a breeze
  {
    const pts = [[12, row(2) + 12], [180, row(2) + 4], [340, row(2) + 8]];
    const cx = 428, cy = row(2) - 2;
    for (let k = 0; k <= 16; k++) { const a = 1.2 - k * 0.42, r = 22 - k * 1.05; pts.push([cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r]); }
    pen.stroke(pts, { w: 5, wob: 0.5, press: 0.9, t0: 0.3, t1: 0.25, per: 4 });
  }
  // 3: broken dashes
  for (let x = 16; x < 470; x += rnd.range(60, 110)) pen.stroke([[x, row(3) + rnd.bell() * 5], [x + rnd.range(30, 70), row(3) + rnd.bell() * 5]], { w: 4.8, wob: 0.8, press: rnd.range(0.55, 0.9), t0: 0.25, t1: 0.5 });
  applyTooth(L, 0.45);
  const ctx = c.getContext('2d');
  ctx.drawImage(L.c, 0, 0);
  return { canvas: c, rows: 4 };
}

// Margin notes and study sketches for the sky backdrop. Nothing here is a
// word: the writing is asemic, the diagrams are plain geometry.
export function drawNote(seed, kind = 'text') {
  const w = 768, h = 512, c = canvas(w, h), ctx = c.getContext('2d');
  const rnd = makeRng(seed);
  const pen = new Pen(ctx, rnd, { k: 1, fade: 0.25 });
  if (kind === 'text') {
    pen.script(30, 40, w - 60, rnd.int(5, 9), { size: 9, lh: 30, w: 1.5, a: 0.9 });
    if (rnd.chance(0.6)) pen.script(30, 340, w * 0.5, 3, { size: 8, lh: 28, w: 1.4, a: 0.9 });
  } else if (kind === 'circle') {
    const cx = w * 0.42, cy = h * 0.5, R = 190;
    pen.arc(cx, cy, R, R, 0, 6.5, { w: 1.6 });
    pen.arc(cx, cy, R * 0.5, R * 0.5, 0, 6.5, { w: 1.1 });
    const n = rnd.pick([5, 6, 8]);
    const v = [...Array(n)].map((_, i) => [cx + Math.cos((i / n) * 6.283 - 1.57) * R, cy + Math.sin((i / n) * 6.283 - 1.57) * R]);
    pen.poly(v, { w: 1.2, over: 6 });
    for (let i = 0; i < n; i++) pen.line(cx, cy, v[i][0], v[i][1], { w: 0.9 });
    for (let i = 0; i < n; i += 2) pen.line(v[i][0], v[i][1], v[(i + 2) % n][0], v[(i + 2) % n][1], { w: 0.8, over: 8 });
    pen.script(w * 0.72, 90, w * 0.24, 6, { size: 7, lh: 24, w: 1.3 });
  } else if (kind === 'wing') {
    // a study of a wing: a spar with ribs fanning from it
    const spar = [[60, 330], [240, 190], [470, 140], [700, 170]];
    pen.stroke(spar, { w: 2 });
    pen.stroke(spar.map((p) => [p[0], p[1] + 9]), { w: 1.2 });
    for (let i = 0; i < 12; i++) {
      const t = i / 11, x = lerp(110, 690, t), y = 300 - Math.sin(t * 2.6) * 150 + t * 20;
      const len = 150 - Math.abs(t - 0.45) * 130;
      pen.stroke([[x, y], [x - 20, y + len * 0.5], [x - 66, y + len]], { w: 1.2, wob: 0.6 });
    }
    pen.stroke([[60, 345], [200, 430], [420, 400], [640, 300], [700, 180]], { w: 1.1, wob: 0.8 });
    pen.script(40, 40, 250, 3, { size: 8, lh: 26, w: 1.3 });
  } else {
    // a spiral and a pair of toothed wheels
    const pts = [];
    for (let k = 0; k < 90; k++) { const a = k * 0.24, r = 8 + k * 2; pts.push([220 + Math.cos(a) * r, 260 + Math.sin(a) * r * 0.9]); }
    pen.stroke(pts, { w: 1.4, per: 3, t0: 0.02, t1: 0.1 });
    for (const [gx, gy, gr, teeth] of [[560, 210, 96, 22], [668, 352, 54, 13]]) {
      pen.arc(gx, gy, gr, gr, 0, 6.5, { w: 1.4 }); pen.arc(gx, gy, gr * 0.2, gr * 0.2, 0, 6.5, { w: 1.1 });
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * 6.283; pen.line(gx + Math.cos(a) * gr, gy + Math.sin(a) * gr, gx + Math.cos(a) * (gr + 13), gy + Math.sin(a) * (gr + 13), { w: 1.3, wob: 0.2 }); }
      for (let i = 0; i < 4; i++) { const a = (i / 4) * 3.1416; pen.line(gx - Math.cos(a) * gr, gy - Math.sin(a) * gr, gx + Math.cos(a) * gr, gy + Math.sin(a) * gr, { w: 0.9 }); }
    }
    pen.script(430, 440, 300, 2, { size: 8, lh: 26, w: 1.3 });
  }
  return { canvas: c, w, h };
}

// The sun as a draughtsman marks it: a ring and a scatter of short rays.
export function drawSun() {
  const n = 512, c = canvas(n, n), ctx = c.getContext('2d');
  const rnd = makeRng(803), pen = new Pen(ctx, rnd, { k: 1, fade: 0.35 });
  const cx = n / 2, cy = n / 2;
  pen.arc(cx, cy, 58, 58, 0.3, 6.7, { w: 2.2 });
  pen.arc(cx, cy, 52, 52, 2.2, 5.6, { w: 1.2 });
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * 6.283 + rnd.bell() * 0.03, r0 = 74 + rnd.range(0, 10), len = i % 2 ? rnd.range(22, 46) : rnd.range(60, 150);
    pen.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len), { w: i % 2 ? 1.3 : 1.7, wob: 0.5, t0: 0.05, t1: 0.7 });
  }
  return { canvas: c };
}

// The backdrop, wrapped around the whole world. High up it carries a graded
// blue wash laid in overlapping bands, each stopping at its own wet edge; near
// the horizon the paper is left bare and warm. The sun is a loose gold wash.
// Everything that shapes an edge here is periodic in x, so the sheet joins up.
export function drawSky(sunU = 0.9055, sunV = 0.5837) {
  const w = 4096, h = 2048, c = canvas(w, h), ctx = c.getContext('2d');
  const rnd = makeRng(804);
  ctx.fillStyle = ctx.createPattern(papers().sky, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ageSheet(ctx, w, h, rnd, { blotches: 30, stains: 5, fox: 320, foxScale: 1.7, amount: 1 });
  const hz = h / 2, TAU = Math.PI * 2;
  // a wandering line across the sheet that meets itself at the seam
  const wander = (amp, seed) => {
    const k = [1, 2, 3, 5, 8, 13], ph = k.map((_, i) => seed * 1.7 + i * 2.1), am = [1, 0.7, 0.55, 0.4, 0.26, 0.16];
    return (x) => k.reduce((t, kk, i) => t + Math.sin((x / w) * TAU * kk + ph[i]) * am[i], 0) * amp;
  };
  const band = (y0, y1, wa, wb) => (cx) => {
    cx.moveTo(-60, y0 + wa(-60));
    for (let x = -60; x <= w + 60; x += 26) cx.lineTo(x, y0 + wa(x));
    for (let x = w + 60; x >= -60; x -= 26) cx.lineTo(x, y1 + wb(x));
    cx.closePath();
  };
  // graded wash from the zenith down, laid wet so the layers melt together:
  // more of them overlap the higher you look
  const stops = [0.2, 0.36, 0.5, 0.62, 0.72, 0.8, 0.86, 0.91, 0.95];
  // (a glaze, not a multiply: over yellow paper a multiplied blue only goes grey)
  const BLUE = [150, 188, 216], DEEP = [128, 172, 210];
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'blur(38px)';
  stops.forEach((b, i) => {
    const col = i < 4 ? DEEP : BLUE;
    ctx.fillStyle = `rgba(${col.join(',')},0.17)`;
    ctx.beginPath(); band(-120, hz * b, () => 0, wander(30 + i * 4, i + 1))(ctx); ctx.fill();
  });
  ctx.restore();
  // then a few places where the brush was lifted and the edge dried hard
  [[0.36, 3], [0.6, 5], [0.84, 8]].forEach(([b, seed]) => {
    wash(ctx, rnd, band(-120, hz * b, () => 0, wander(34, seed + 30)), [150, 176, 206], { a: 0.02, edge: 1, edgeW: 5 });
  });
  // looser strokes of a drier brush, so the wash is never even
  for (let i = 0; i < 22; i++) {
    const y = rnd.range(0.04, 0.8) * hz, th = rnd.range(26, 90), x0 = rnd() * w, len = rnd.range(0.14, 0.45) * w;
    const up = wander(8, 20 + i), dn = wander(10, 60 + i);
    const path = (cx) => {
      cx.moveTo(x0, y + up(x0));
      for (let x = x0; x <= x0 + len; x += 24) cx.lineTo(x, y + up(x) - th * 0.5 * Math.sin(((x - x0) / len) * Math.PI));
      for (let x = x0 + len; x >= x0; x -= 24) cx.lineTo(x, y + dn(x) + th * 0.5 * Math.sin(((x - x0) / len) * Math.PI));
      cx.closePath();
    };
    for (const ox of [0, -w]) {
      ctx.save(); ctx.translate(ox, 0); ctx.globalCompositeOperation = 'source-over'; ctx.filter = `blur(${rnd.chance(0.3) ? 3 : 14}px)`;
      ctx.fillStyle = `rgba(${BLUE.join(',')},${rnd.range(0.05, 0.12)})`;
      ctx.beginPath(); path(ctx); ctx.fill(); ctx.restore();
    }
  }
  // the sun: a soft gold glow laid wet, and one ring where it dried
  const sx = sunU * w, sy = (1 - sunV) * h;
  for (const ox of [0, -w, w]) {
    ctx.save(); ctx.translate(ox, 0); ctx.globalCompositeOperation = 'multiply';
    for (const [r, a2, bl] of [[300, 0.1, 70], [170, 0.16, 44], [92, 0.22, 20]]) {
      ctx.filter = `blur(${bl}px)`; ctx.fillStyle = `rgba(${WASH.gold.join(',')},${a2})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.92, 0, 0, TAU); ctx.fill();
    }
    // warmth lying low along the horizon either side of it
    ctx.filter = 'blur(50px)'; ctx.fillStyle = `rgba(${WASH.gold.join(',')},0.1)`;
    ctx.beginPath(); ctx.ellipse(sx, hz - 20, 1100, 120, 0, 0, TAU); ctx.fill();
    ctx.filter = 'none';
    const lobes = wander(8, 47);
    wash(ctx, rnd, (cx) => { for (let k = 0; k <= 60; k++) { const an = (k / 60) * TAU, rr = 74 + lobes(k * 68); k ? cx.lineTo(sx + Math.cos(an) * rr, sy + Math.sin(an) * rr * 0.94) : cx.moveTo(sx + Math.cos(an) * rr, sy + Math.sin(an) * rr * 0.94); } cx.closePath(); }, WASH.gold, { a: 0.16, edge: 0.7, edgeW: 4 });
    ctx.restore();
  }
  // the sheet browns toward its lower edge, well below the horizon
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createLinearGradient(0, h, 0, h - 220);
  g.addColorStop(0, 'rgba(176,138,84,0.3)'); g.addColorStop(1, 'rgba(176,138,84,0)');
  ctx.fillStyle = g; ctx.fillRect(0, h - 220, w, 220);
  return { canvas: c };
}

// Tile of pure paper grain, mid-grey, multiplied over large flat sheets so
// they stay sharp however close the camera comes.
export function drawGrain() {
  const n = 512, c = canvas(n, n), ctx = c.getContext('2d');
  ctx.drawImage(papers().warm, 0, 0);
  const img = ctx.getImageData(0, 0, n, n), d = img.data;
  let mean = 0;
  for (let i = 0; i < d.length; i += 4) mean += d[i] + d[i + 1] + d[i + 2];
  mean /= (d.length / 4) * 3;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, 128 + ((d[i] + d[i + 1] + d[i + 2]) / 3 - mean) * 5));
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c };
}

// Key hints in pencil: little keycaps, shown for a few seconds then gone.
export function drawKeys() {
  const w = 420, h = 132, c = canvas(w, h);
  const rnd = makeRng(805);
  const L = pencilLayer(w, h);
  const pen = new Pen(L.ctx, rnd, { pal: GRAPHITE, pencil: true });
  const cap = (x, y, ww = 34) => pen.poly([[x, y], [x + ww, y], [x + ww, y + 34], [x, y + 34]], { w: 1.5, over: 2, press: 0.8 });
  const glyph = (pts, x, y) => pen.stroke(pts.map((p) => [x + p[0], y + p[1]]), { w: 1.7, smooth: false, wob: 0.3, press: 1, t0: 0.05, t1: 0.15 });
  const curve = (pts, x, y) => pen.stroke(pts.map((p) => [x + p[0], y + p[1]]), { w: 1.7, wob: 0.3, press: 1, t0: 0.05, t1: 0.15 });
  // W
  cap(50, 8); glyph([[9, 10], [13, 25], [17, 15], [21, 25], [25, 10]], 50, 8);
  // A S D
  cap(10, 48); glyph([[10, 26], [17, 9], [24, 26]], 10, 48); glyph([[13, 19], [21, 19]], 10, 48);
  cap(50, 48); curve([[23, 11], [15, 9], [11, 14], [17, 18], [23, 22], [18, 27], [10, 24]], 50, 48);
  cap(90, 48); glyph([[12, 9], [12, 26]], 90, 48); curve([[12, 9], [22, 11], [24, 18], [21, 25], [12, 26]], 90, 48);
  // what they do: nose down/up, bank
  curve([[0, 20], [6, 6], [14, 0]], 96, 6); glyph([[8, 0], [14, 0], [13, 6]], 96, 6);
  curve([[0, 0], [10, 6], [24, 2]], 134, 62); glyph([[18, -2], [24, 2], [19, 7]], 134, 62);
  // shift: catch a gust
  cap(196, 48, 70); glyph([[35, 9], [24, 20], [30, 20], [30, 27], [40, 27], [40, 20], [46, 20], [35, 9]], 196, 48);
  curve([[0, 8], [22, 2], [44, 6], [56, 0]], 204, 22); curve([[8, 16], [30, 11], [50, 14]], 204, 22);
  // space: level out
  cap(290, 48, 112); glyph([[30, 20], [30, 25], [82, 25], [82, 20]], 290, 48);
  glyph([[14, 12], [98, 12]], 290, 14);
  applyTooth(L, 0.4);
  c.getContext('2d').drawImage(L.c, 0, 0);
  return { canvas: c, w, h };
}

void layPencil;

export const gallery = () => {
  const bg = (src, w, h) => { const c = canvas(w, h), x = c.getContext('2d'); x.drawImage(src, 0, 0, w, h); return c; };
  return [
    ['birds', drawBirds().canvas], ['wind', drawWind().canvas], ['keys', drawKeys().canvas],
    ['note text', drawNote(1, 'text').canvas], ['note circle', drawNote(2, 'circle').canvas],
    ['note wing', drawNote(3, 'wing').canvas], ['note wheels', drawNote(4, 'wheels').canvas],
    ['sun', drawSun().canvas], ['sky', bg(drawSky().canvas, 1700, 850)],
  ];
};
