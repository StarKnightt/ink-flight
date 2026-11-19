// Land drawn the way the Arno sheet draws it: stacked lobes with an outline on
// the crest, slanted hatching on the flank away from the light, bare paper on
// the lit side, and a wash that never quite follows the pen.

import { fbm1, clamp, lerp, smooth01 } from './rng.js';
import { canvas, papers } from './paper.js';
import { Pen, WASH, GREENINK, wash, blobPath, pencilLayer, applyTooth, layPencil } from './ink.js';
import { makeSheet } from './sheet.js';

// ---- profiles ------------------------------------------------------------

function makeProfile(rnd, w, h, o = {}) {
  const peaks = o.peaks ?? 4, jag = o.jag ?? 1, height = o.height ?? 0.8, base = o.base ?? 0.1;
  const P = [];
  for (let i = 0; i < peaks; i++) {
    P.push({
      x: w * (0.14 + 0.72 * ((i + 0.5 + rnd.bell() * 0.35) / peaks)),
      a: rnd.range(0.55, 1),
      s: w * rnd.range(0.07, 0.16) * (o.spread ?? 1),
    });
  }
  const o1 = rnd() * 100, o2 = rnd() * 100, o3 = rnd() * 100, f = o.freq ?? 1;
  const y = new Float32Array(w + 1);
  for (let x = 0; x <= w; x++) {
    const xw = x + 60 * fbm1(x * 0.0021 + o3, 2);       // skew so nothing is symmetric
    let m = 0, sum = 0;
    for (const p of P) { const g = p.a * Math.exp(-(((xw - p.x) / p.s) ** 2)); m = Math.max(m, g); sum += g; }
    const mass = m * 0.7 + Math.min(1, sum) * 0.3;
    // ridged noise puts sharp crests and saddles where the mass allows them
    const r1 = 1 - Math.abs(fbm1(xw * 0.0042 * f + o1, 3));
    const r2 = 1 - Math.abs(fbm1(xw * 0.015 * f + o2, 3));
    let v = mass * (0.4 + 0.6 * lerp(1, r1 * r1, Math.min(1, jag * 0.85)));
    v += jag * mass * (0.16 * (r2 - 0.62) + 0.035 * fbm1(x * 0.06 + o3, 2));
    const win = smooth01(x / (w * 0.1)) * smooth01((w - x) / (w * 0.1));
    const v2 = (base + Math.max(0, v) * (1 - base)) * win;
    y[x] = h - clamp(v2, 0, 0.985) * height * h;
  }
  return y;
}

// profile through control points [[u, v]...] with u,v in 0..1
function controlProfile(rnd, w, h, pts, o = {}) {
  const jag = o.jag ?? 1, o1 = rnd() * 100;
  const y = new Float32Array(w + 1);
  let k = 0;
  for (let x = 0; x <= w; x++) {
    const u = x / w;
    while (k < pts.length - 2 && pts[k + 1][0] < u) k++;
    const a = pts[k], b = pts[k + 1];
    const t = smooth01((u - a[0]) / (b[0] - a[0] || 1));
    let v = lerp(a[1], b[1], t);
    v += jag * (0.025 * fbm1(x * 0.02 + o1, 3) + 0.012 * fbm1(x * 0.11 + o1, 2)) * Math.min(1, v * 5);
    y[x] = h - clamp(v, 0, 0.99) * h;
  }
  return y;
}

const under = (y, w, h, step = 3) => (ctx) => {
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += step) ctx.lineTo(x, y[x]);
  ctx.lineTo(w, y[w]); ctx.lineTo(w, h); ctx.closePath();
};

const along = (y, x0, x1, step = 12, dy = 0) => {
  const pts = [];
  for (let x = x0; x < x1; x += step) pts.push([x, y[Math.round(x)] + dy]);
  pts.push([x1, y[Math.round(x1)] + dy]);
  return pts;
};

// Each crest and the slope that falls away to its right (the shadow side).
function flanks(y, w, minSpan = 40) {
  const R = 7, sm = new Float32Array(w + 1);
  for (let x = 0; x <= w; x++) {
    let s = 0, n = 0;
    for (let k = -R; k <= R; k++) { const i = x + k; if (i >= 0 && i <= w) { s += y[i]; n++; } }
    sm[x] = s / n;
  }
  const out = [];
  for (let x = R + 2; x < w - R - 2; x++) {
    if (sm[x] <= sm[x - 1] && sm[x] < sm[x + 1] && sm[x] < sm[Math.max(0, x - 14)] - 0.6) {
      let j = x;
      while (j < w - 1 && sm[j + 1] >= sm[j] - 0.04) j++;
      if (j - x > minSpan) out.push({ xp: x, xv: j, drop: sm[j] - sm[x] });
      x = Math.max(x, j - 1);
    }
  }
  return out;
}

function hatchFlank(pen, rnd, y, f, o = {}) {
  const span = f.xv - f.xp;
  const L0 = o.len ?? clamp(f.drop * 0.85 + 28, 26, 170);
  const base = o.angle ?? 1.12, off = o.offset ?? 0;
  for (let x = f.xp + rnd.range(0, 4); x < f.xv; x += (o.gap ?? 5) * rnd.range(0.55, 1.5)) {
    if (rnd.chance(o.skip ?? 0.12)) continue;
    const t = (x - f.xp) / span;
    const len = L0 * (1 - t * 0.72) * rnd.range(0.4, 1.1);
    const ang = base + rnd.bell() * 0.07;
    const cx = Math.cos(ang), cy = Math.sin(ang), bow = len * 0.06 * rnd.bell();
    const k = off * (1 - t * 0.6) * rnd.range(0.8, 1.2);
    const sx = x + cx * k, sy = y[Math.round(x)] + rnd.range(1, 6) + cy * k;
    pen.stroke([[sx, sy], [sx + cx * len * 0.5 - cy * bow, sy + cy * len * 0.5 + cx * bow], [sx + cx * len, sy + cy * len]],
      { w: o.w ?? 0.9, wob: 0.6, t0: 0.05, t1: 0.55, a: o.a });
  }
}

// Shadow built up in tiers down the slope: densest under the crest.
function shadeFlank(pen, rnd, y, f, o = {}) {
  const L0 = o.len ?? clamp(f.drop * 0.8 + 34, 34, 180);
  const tiers = o.tiers ?? 3;
  for (let t = 0; t < tiers; t++) {
    hatchFlank(pen, rnd, y, f, {
      gap: (o.gap ?? 4) * (1 + t * 0.55), w: (o.w ?? 1.3) * (1 - t * 0.12),
      skip: (o.skip ?? 0.08) + t * 0.16, len: L0 * (1 - t * 0.2), offset: t * L0 * 0.62, a: o.a,
    });
  }
  return L0;
}

// Hand-brushed boundary: irregular like a loaded brush dragged over paper,
// with soft corners. Never a pill and never a ruled polygon.
export function ragged(pts, rnd, amp = 6, levels = 3) {
  let P = pts;
  for (let l = 0; l < levels; l++) {
    const Q = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const k = rnd.bell() * amp * Math.min(1.6, d / 34) / (l * 0.8 + 1);
      Q.push(a, [(a[0] + b[0]) / 2 - ((b[1] - a[1]) / d) * k, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / d) * k]);
    }
    P = Q;
  }
  return (ctx) => {
    const n = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s0 = mid(P[n - 1], P[0]);
    ctx.moveTo(s0[0], s0[1]);
    for (let i = 0; i < n; i++) { const m = mid(P[i], P[(i + 1) % n]); ctx.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]); }
    ctx.closePath();
  };
}

function flankWash(rnd, y, f, depth, ang = 1.12) {
  const top = [], bot = [], n = 6;
  const ix = (x) => clamp(Math.round(x), 0, y.length - 1);
  const cx = Math.cos(ang), cy = Math.sin(ang);
  const sx = rnd.range(2, 9), sy = rnd.range(1, 7);     // the wash misses the line
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = lerp(f.xp - 4, f.xv + 6, t);
    top.push([x + sx, y[ix(x)] + sy]);
    const len = depth * (1 - t * 0.7) * rnd.range(0.7, 1.15);
    bot.push([x + sx + cx * len, y[ix(x)] + sy + cy * len]);
  }
  return ragged(top.concat(bot.reverse()), rnd, 14);
}

// ---- trees ---------------------------------------------------------------

export function planTree(rnd, x, yBase, H, kind = 'oak') {
  const lobes = [];
  let trunkTop;
  if (kind === 'poplar') {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      lobes.push({ cx: x + rnd.bell() * H * 0.025, cy: yBase - H * (0.28 + 0.62 * t), rx: H * (0.125 - 0.06 * t) * rnd.range(0.9, 1.1), ry: H * 0.115 });
    }
    trunkTop = yBase - H * 0.3;
  } else if (kind === 'pine') {
    const cy = yBase - H * 0.8, n = rnd.int(4, 6);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      lobes.push({ cx: x + t * H * 0.62, cy: cy + Math.abs(t) * H * 0.1 + rnd.bell() * H * 0.02, rx: H * rnd.range(0.14, 0.19), ry: H * rnd.range(0.085, 0.115) });
    }
    trunkTop = cy + H * 0.04;
  } else if (kind === 'bush') {
    const n = rnd.int(3, 4);
    for (let i = 0; i < n; i++) lobes.push({ cx: x + (i / (n - 1) - 0.5) * H * 0.9, cy: yBase - H * rnd.range(0.4, 0.62), rx: H * rnd.range(0.3, 0.42), ry: H * rnd.range(0.28, 0.4) });
    trunkTop = yBase - H * 0.2;
  } else if (kind === 'cypress') {
    trunkTop = yBase - H * 0.08;
  } else {
    const cx = x + rnd.bell() * H * 0.04, cy = yBase - H * 0.62, n = rnd.int(6, 9);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 0.62;
      lobes.push({ cx: cx + Math.cos(a) * d * H * 0.34, cy: cy + Math.sin(a) * d * H * 0.29, rx: H * rnd.range(0.15, 0.22), ry: H * rnd.range(0.13, 0.19) });
    }
    trunkTop = cy + H * 0.12;
  }
  lobes.sort((a, b) => a.cy - b.cy);
  const t = { x, yBase, H, kind, lobes, trunkTop, lean: rnd.bell() * H * 0.04 };
  if (kind === 'cypress') {
    // flame outline, as on the ruins sheet
    const half = H * rnd.range(0.085, 0.12), pts = [], n = 9;
    for (let i = 0; i <= n; i++) {
      const u = i / n, wd = half * Math.sin(Math.pow(u, 0.7) * Math.PI) * (1 - u * 0.25) + 1.5;
      pts.push([x - wd * rnd.range(0.85, 1.15) + t.lean * u, yBase - H * 0.06 - u * H * 0.94]);
    }
    for (let i = n - 1; i >= 0; i--) {
      const u = i / n, wd = half * Math.sin(Math.pow(u, 0.7) * Math.PI) * (1 - u * 0.25) + 1.5;
      pts.push([x + wd * rnd.range(0.85, 1.15) + t.lean * u, yBase - H * 0.06 - u * H * 0.94]);
    }
    t.flame = pts; t.half = half;
  }
  return t;
}

export function treePaper(S, t, m = 2.5) {
  S.paper((ctx) => {
    for (const l of t.lobes) { ctx.moveTo(l.cx + l.rx + m, l.cy); ctx.ellipse(l.cx, l.cy, l.rx + m, l.ry + m, 0, 0, 7); }
    if (t.flame) {
      const f = t.flame, n = f.length / 2;
      ctx.moveTo(f[0][0] - m, f[0][1] + m);
      f.forEach((p, i) => ctx.lineTo(p[0] + (i < n ? -m : m), p[1] - (i === n - 1 || i === n ? m : 0)));
      ctx.closePath();
    }
    const tw = t.H * 0.036 + m;
    ctx.moveTo(t.x - tw * 1.7, t.yBase); ctx.lineTo(t.x - tw + t.lean, t.trunkTop); ctx.lineTo(t.x + tw + t.lean, t.trunkTop); ctx.lineTo(t.x + tw * 1.8, t.yBase); ctx.closePath();
  });
}

export function paintTree(pen, ctx, rnd, t, o = {}) {
  const { x, yBase, H } = t;
  const s = clamp(H / 170, 0.55, 1.5) * (o.k ?? 1);
  const tw = H * 0.032;
  const tint = o.tint ?? (t.kind === 'pine' ? WASH.pine : t.kind === 'poplar' ? WASH.sage : rnd.pick([WASH.olive, WASH.olive, WASH.olive, WASH.meadow, WASH.sage]));
  const deep = t.kind === 'pine' ? [34, 62, 50] : t.kind === 'poplar' ? WASH.olive : [104, 104, 48];

  if (t.kind === 'cypress') {
    const f = t.flame;
    wash(ctx, rnd, blobPath(f.map((p) => [p[0] + 2, p[1] + 1]), rnd, 2), WASH.pine, { a: 0.46, edgeW: 4 });
    // darker second wash on the shadow half
    const n = f.length / 2;
    const right = f.slice(n).concat(f.slice(0, n).reverse().map((p) => [x + t.lean * 0.5 + (p[0] - x) * 0.1, p[1]]));
    wash(ctx, rnd, blobPath(right, rnd, 2), [30, 58, 46], { a: 0.34, edgeW: 3 });
    // zigzag pen over the wash
    for (let col = 0; col < 3; col++) {
      const pts = [];
      const off = (col - 1) * t.half * 0.55;
      for (let u = 0.04; u < 0.93; u += 0.035 * rnd.range(0.8, 1.3)) {
        const wd = t.half * 0.34 * Math.sin(Math.pow(u, 0.7) * Math.PI);
        const side = pts.length % 2 ? 1 : -1;
        pts.push([x + off * (1 - u * 0.6) + side * wd + t.lean * u, yBase - H * 0.06 - u * H * 0.94 + side * 3]);
      }
      pen.stroke(pts, { w: 0.9 * s * (col === 2 ? 1.3 : 0.9), wob: 0.4, smooth: false, t0: 0.05, t1: 0.1, a: col === 0 ? 0.6 : 1 });
    }
    // broken outline, heavier on the right
    pen.broken(f.slice(0, n), { w: 0.8 * s, run: [20, 60], skip: 0.3 });
    pen.broken(f.slice(n), { w: 1.3 * s, run: [20, 70], skip: 0.1 });
    pen.line(x - tw, yBase, x - tw * 0.6, yBase - H * 0.07, { w: s });
    pen.line(x + tw, yBase, x + tw * 0.6, yBase - H * 0.07, { w: s * 1.3 });
    return;
  }

  // trunk: two quick lines, the right one heavier
  pen.stroke([[x - tw * 1.7, yBase], [x - tw, yBase - H * 0.12], [x - tw * 0.7 + t.lean, t.trunkTop]], { w: 1.0 * s });
  pen.stroke([[x + tw * 1.9, yBase], [x + tw, yBase - H * 0.1], [x + tw * 0.8 + t.lean, t.trunkTop]], { w: 1.5 * s });
  const th = yBase - t.trunkTop;
  for (let i = 0; i < 5; i++) {
    const yy = yBase - th * rnd.range(0.08, 0.9);
    pen.line(x + tw * 0.1, yy, x + tw * 0.9, yy + tw * 0.6, { w: 0.7 * s, wob: 0.3 });
  }
  // branches reaching into the crown
  if (t.kind !== 'bush') {
    const picks = t.lobes.filter(() => rnd.chance(0.45)).slice(0, 4);
    for (const l of picks) {
      pen.stroke([[x + t.lean, t.trunkTop + th * 0.15], [(x + l.cx) / 2 + rnd.bell() * 4, (t.trunkTop + l.cy) / 2 + l.ry * 0.3], [l.cx, l.cy + l.ry * 0.25]], { w: 0.9 * s, wob: 0.5 });
    }
  }
  // one brushed wash over the shadow side of the whole crown
  if (t.lobes.length) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const l of t.lobes) { x0 = Math.min(x0, l.cx - l.rx); x1 = Math.max(x1, l.cx + l.rx); y0 = Math.min(y0, l.cy - l.ry); y1 = Math.max(y1, l.cy + l.ry); }
    const cw = x1 - x0, ch = y1 - y0;
    const q = [[x0 + cw * 0.34, y0 + ch * 0.2], [x1 - cw * 0.06, y0 + ch * 0.24], [x1 + 2, y1 - ch * 0.2], [x0 + cw * 0.5, y1 + 2], [x0 + cw * 0.2, y1 - ch * 0.3]];
    ctx.save(); ctx.beginPath();
    for (const l of t.lobes) { ctx.moveTo(l.cx + l.rx, l.cy); ctx.ellipse(l.cx, l.cy, l.rx, l.ry, 0, 0, 7); }
    ctx.clip();
    // local colour over the whole crown, left a little short of the lit edge
    wash(ctx, rnd, ragged([[x0 + cw * 0.1, y0 + ch * 0.14], [x1, y0 + ch * 0.06], [x1 + 4, y1 + 4], [x0 + cw * 0.04, y1 + 4]], rnd, cw * 0.07), tint, { a: 0.3, edge: 0.45, edgeW: 3, box: [x0, y0, x1, y1], blots: 2 });
    // and a second, deeper touch on the side away from the sun
    wash(ctx, rnd, ragged(q, rnd, cw * 0.09), deep, { a: 0.26, edgeW: 3, box: [x0, y0, x1, y1], blots: 2 });
    ctx.restore();
  }
  // foliage, back lobes first
  const n = t.lobes.length;
  t.lobes.forEach((l, i) => {
    pen.lobe(l.cx, l.cy, l.rx, l.ry, { w: 1.05 * s, bump: 6.5 * s, hgap: 3.4 * s, shade: 0.55 + 0.45 * (i / n), loops: rnd.int(1, 3) });
  });
  // a little ground and cast shade to the right
  for (let i = 0; i < 4; i++) {
    const yy = yBase - rnd.range(0, 3);
    pen.line(x + tw * 2 + i * 3, yy, x + tw * 2 + H * rnd.range(0.12, 0.3), yy + rnd.range(0, 2), { w: 0.8 * s, wob: 0.3 });
  }
}

// ---- pencil trees --------------------------------------------------------

function planFir(rnd, x, yBase, H) {
  const half = H * rnd.range(0.2, 0.28);
  const tiers = rnd.int(7, 10);
  return { x, yBase, H, half, tiers, kind: 'fir', lean: rnd.bell() * H * 0.03 };
}
function firPaper(S, t, m = 3) {
  S.paper((ctx) => {
    ctx.moveTo(t.x + t.lean, t.yBase - t.H - m);
    ctx.lineTo(t.x + t.half + m, t.yBase - t.H * 0.12);
    ctx.lineTo(t.x + t.H * 0.02 + m, t.yBase - t.H * 0.1);
    ctx.lineTo(t.x + t.H * 0.02 + m, t.yBase);
    ctx.lineTo(t.x - t.H * 0.02 - m, t.yBase);
    ctx.lineTo(t.x - t.H * 0.02 - m, t.yBase - t.H * 0.1);
    ctx.lineTo(t.x - t.half - m, t.yBase - t.H * 0.12);
    ctx.closePath();
  });
}
function paintFir(pen, rnd, t, dark = 1) {
  const { x, yBase, H, half, tiers } = t;
  const s = clamp(H / 200, 0.6, 1.4);
  pen.stroke([[x, yBase], [x + t.lean * 0.5, yBase - H * 0.5], [x + t.lean, yBase - H * 1.01]], { w: 1.2 * s, press: 0.6 * dark });
  for (let i = 0; i < tiers; i++) {
    const u = (i + 0.5) / tiers;                       // 0 top .. 1 bottom
    const cy = yBase - H * (1 - u * 0.9), cx = x + t.lean * (1 - u);
    const wd = half * Math.pow(u, 0.85) * rnd.range(0.8, 1.12) + 2;
    const band = (H * 0.9 / tiers) * rnd.range(1.25, 1.7);
    // boughs as quick back-and-forth scribble, drooping outward; right side darker
    pen.scribble(cx - wd, cy - band * 0.5, wd, band, { gap: 3.6 * s, w: 1.05 * s, press: rnd.range(0.4, 0.62) * dark, angle: 2.2 + rnd.bell() * 0.12 });
    pen.scribble(cx, cy - band * 0.5, wd, band, { gap: 2.9 * s, w: 1.25 * s, press: rnd.range(0.74, 1) * dark, angle: 0.95 + rnd.bell() * 0.12 });
    if (rnd.chance(0.6)) pen.scribble(cx + wd * 0.15, cy - band * 0.2, wd * 0.7, band * 0.8, { gap: 3.4 * s, w: 1.2 * s, press: dark, angle: 0.7 });
    // tips flick past the mass
    for (const side of [-1, 1]) {
      const tx = cx + side * wd, ty = cy + band * 0.35;
      pen.stroke([[tx - side * wd * 0.3, ty - band * 0.3], [tx + side * rnd.range(1, 5), ty + rnd.range(0, 4)]], { w: s, wob: 0.3, press: (side > 0 ? 0.9 : 0.55) * dark, t0: 0, t1: 0.6 });
    }
  }
}

function planRound(rnd, x, yBase, H) {
  const t = planTree(rnd, x, yBase, H, 'oak');
  t.kind = 'round';
  return t;
}
function paintRound(pen, rnd, t, dark = 1) {
  const { x, yBase, H } = t, s = clamp(H / 190, 0.6, 1.4), tw = H * 0.03;
  pen.stroke([[x - tw, yBase], [x - tw * 0.6 + t.lean, t.trunkTop]], { w: 1.2 * s, press: 0.7 * dark });
  pen.stroke([[x + tw, yBase], [x + tw * 0.7 + t.lean, t.trunkTop]], { w: 1.5 * s, press: 0.95 * dark });
  for (const l of t.lobes) {
    pen.lobe(l.cx, l.cy, l.rx, l.ry, { w: 1.1 * s, bump: 7 * s, shade: 0, loops: 1 });
    const clip = (c) => c.ellipse(l.cx, l.cy, l.rx, l.ry, 0, 0, 7);
    pen.scribble(l.cx - l.rx * 0.5, l.cy - l.ry * 0.1, l.rx * 1.5, l.ry * 1.2, { gap: 3.2 * s, w: 1.05 * s, press: rnd.range(0.6, 0.95) * dark, clip });
  }
}

// ---- sheets --------------------------------------------------------------

// A mountain range as one standing sheet. fade 0 = near and heavy, 1 = far and faint.
export function drawRidge(o = {}) {
  const w = o.w ?? 2048, h = o.h ?? 640;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? ((o.fade ?? 0) > 0.4 ? 'sky' : 'pale'));
  const { ctx, rnd } = S;
  const fade = o.fade ?? 0, jag = o.jag ?? 1, height = o.height ?? 0.92;
  const back = makeProfile(rnd, w, h, { peaks: o.peaks ?? 5, jag, height, base: o.base ?? 0.14, spread: o.spread });
  const layers = [back];
  const inner = fade > 0.75 ? 0 : fade > 0.45 ? 1 : 2;
  for (let i = 0; i < inner; i++) {
    const p = makeProfile(rnd, w, h, { peaks: (o.peaks ?? 5) + 1 + i, jag: jag * 0.8, height: height * (0.64 - 0.22 * i), base: 0.22, spread: 0.9 });
    for (let x = 0; x <= w; x++) p[x] = Math.max(p[x], back[x] + 12 + 14 * i);
    layers.push(p);
  }
  S.paper(under(back, w, h));
  const pen = S.ink({ fade, k: o.k ?? 1 });
  const washCol = o.wash ?? (fade > 0.5 ? WASH.haze : WASH.shade);

  if (inner === 0) {
    // farthest ranges: one flat pale wash, ragged underneath, paper left bare below
    const top = along(back, w * 0.02, w * 0.98, 40, 2), bot = [];
    for (let i = top.length - 1; i >= 0; i -= 2) bot.push([top[i][0] + rnd.bell() * 20, Math.min(h - 4, top[i][1] + h * rnd.range(0.16, 0.5))]);
    wash(ctx, rnd, ragged(top.concat(bot), rnd, 5, 2), washCol, { a: 0.3 * (1 - fade * 0.2), edgeW: 5, box: [0, 0, w, h], blots: 10 });
  }

  layers.forEach((y, li) => {
    const near = layers.length > 1 ? li / (layers.length - 1) : 0;
    if (li > 0) S.repaper(under(y, w, h), 0.88);
    const fl = flanks(y, w, 34);
    for (const f of fl) {
      const L0 = clamp(f.drop * 0.8 + 34, 34, 180);
      if (inner > 0) {
        wash(ctx, rnd, flankWash(rnd, y, f, L0 * 1.5), washCol, {
          a: (0.15 + 0.1 * near) * (1 - fade * 0.4), edgeW: 4,
          box: [f.xp, y[f.xp], f.xv + L0, y[f.xv] + L0], blots: 3,
        });
      }
      shadeFlank(pen, rnd, y, f, { gap: 4 + fade * 5, w: 1.25 + 0.4 * near, skip: 0.08 + fade * 0.4, tiers: fade > 0.6 ? 1 : 3 });
      // a sparser pass crossing the first where the shadow is deepest
      if (fade < 0.4 && f.drop > 40) hatchFlank(pen, rnd, y, { ...f, xv: f.xp + (f.xv - f.xp) * 0.6 }, { gap: 8, w: 1, skip: 0.25, angle: 1.5, len: f.drop * 0.6 });
      // rock breaking the crest on jagged ranges
      if (jag > 0.8 && fade < 0.6) {
        for (let k = 0; k < 7; k++) {
          const x = f.xp + rnd.range(-26, 30);
          if (x < 2 || x > w - 2) continue;
          pen.line(x, y[Math.round(x)], x + rnd.range(-3, 5), y[Math.round(x)] + rnd.range(8, 30), { w: 1.1, wob: 0.4 });
        }
      }
    }
    if (fade < 0.6) {
      // the lit side: a few strokes that follow the slope, and scrub
      for (let k = 0; k < 30 * (1 - fade); k++) {
        const x = rnd.range(0.06, 0.9) * w, len = rnd.range(30, 120), d = rnd.range(12, 120);
        pen.broken(along(y, x, Math.min(w, x + len), 12, d), { w: 0.85, run: [18, 60], gap: [2, 14], skip: 0.25, a: 0.75 });
      }
      for (let k = 0; k < 16 * (1 - fade); k++) {
        const x = rnd.range(0.08, 0.92) * w, yy = y[Math.round(x)] + rnd.range(18, 130);
        if (yy > h - 14) continue;
        pen.lobe(x, yy, rnd.range(7, 17), rnd.range(4, 9), { w: 1, bump: 5, loops: rnd.int(0, 1), shade: 0.9, hgap: 3 });
      }
    }
    // crest: overlapping strokes, heavier where it turns into shadow
    pen.broken(along(y, w * 0.02, w * 0.98, 10), { w: (1.7 + 1.0 * near) * (o.line ?? 1), run: [36, 130], gap: [-12, 10], skip: fade * 0.2, lift: 1.4 });
    for (const f of fl) {
      pen.broken(along(y, f.xp - 6, f.xp + (f.xv - f.xp) * 0.65, 9), { w: (2.2 + 1.2 * near) * (o.line ?? 1), run: [26, 80], skip: 0.12, lift: 1.6 });
    }
  });

  // local colour low on the slopes: sage and olive in patches, a little wheat,
  // thinning with distance until the far ranks are haze alone
  if (inner > 0) {
    const low = layers[layers.length - 1];
    for (let k = 0; k < 13; k++) {
      const x = rnd.range(0.04, 0.84) * w, ww = rnd.range(0.08, 0.2) * w;
      const top = low[Math.round(clamp(x + ww / 2, 0, w))] + rnd.range(16, 120), hh = rnd.range(50, 150);
      if (top + hh > h - 4) continue;
      const q = [[x, top + rnd.range(0, 20)], [x + ww * 0.5, top], [x + ww, top + rnd.range(0, 26)], [x + ww * 1.04, top + hh], [x + ww * 0.5, top + hh * 1.1], [x - 10, top + hh * 0.9]];
      wash(ctx, rnd, ragged(q, rnd, 16), rnd.pick([WASH.sage, WASH.sage, WASH.olive, WASH.meadow, WASH.ochre]), { a: rnd.range(0.18, 0.3) * (1 - fade * 0.6), edge: 0.4, edgeW: 4, blots: 2, box: [x, top, x + ww, top + hh] });
    }
  }

  // foothills: tick-and-dot trees in clumps, long strokes of plain
  if (fade < 0.8) {
    const front = layers[layers.length - 1];
    const clumps = Math.round(12 * (1 - fade));
    for (let c = 0; c < clumps; c++) {
      const cx = rnd.range(0.08, 0.92) * w, n = rnd.int(5, 14);
      for (let i = 0; i < n; i++) {
        const x = cx + rnd.bell() * 70, yy = Math.min(h - 6, front[Math.round(clamp(x, 0, w))] + rnd.range(24, 170));
        const th = rnd.range(11, 24) * (1 - fade * 0.4);
        pen.line(x, yy, x + rnd.bell(), yy - th * 0.6, { w: 1.1, wob: 0.2 });
        pen.lobe(x, yy - th * 0.72, th * 0.42, th * 0.36, { w: 0.95, bump: 4.5, loops: 0, shade: 1, hgap: 2.6 });
      }
    }
    for (let k = 0; k < 30 * (1 - fade); k++) {
      const x = rnd.range(0.02, 0.8) * w, yy = h - rnd.range(6, 100), len = rnd.range(60, 340);
      pen.line(x, yy, x + len, yy + rnd.bell() * 3, { w: 0.85, wob: 0.7, a: 0.8 });
    }
  }
  return { canvas: S.finish(), profile: back, w, h };
}

// A rounded hill with fields and a few trees on the crest.
export function drawHill(o = {}) {
  const w = o.w ?? 1536, h = o.h ?? 420;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  const y = makeProfile(rnd, w, h, { peaks: o.peaks ?? 3, jag: o.jag ?? 0.22, height: o.height ?? 0.62, base: 0.34, spread: 1.5, freq: 0.6 });
  const trees = [];
  const nt = o.trees ?? rnd.int(4, 8);
  for (let i = 0; i < nt; i++) {
    const x = rnd.range(0.14, 0.86) * w;
    const H = rnd.range(0.2, 0.36) * h;
    trees.push(planTree(rnd, x, y[Math.round(x)] + 6, H, rnd.pick(o.kinds ?? ['oak', 'oak', 'pine', 'poplar', 'cypress', 'cypress'])));
  }
  trees.sort((a, b) => a.yBase - b.yBase);
  S.paper(under(y, w, h));
  trees.forEach((t) => treePaper(S, t));
  const pen = S.ink({ k: o.k ?? 1, fade: o.fade ?? 0 });
  const iy = (x) => y[clamp(Math.round(x), 0, w)];

  // meadow first: two or three broad, pale patches, with paper left between
  for (let i = 0; i < 3; i++) {
    const x = rnd.range(0.06, 0.6) * w, ww = rnd.range(0.22, 0.4) * w, d0 = rnd.range(4, 40), hh = rnd.range(90, 190);
    const q = [[x, iy(x) + d0], [x + ww * 0.5, iy(x + ww * 0.5) + d0 - 4], [x + ww, iy(x + ww) + d0], [x + ww * 1.05, Math.min(h - 4, iy(x + ww) + d0 + hh)], [x + ww * 0.5, Math.min(h - 4, iy(x + ww * 0.5) + d0 + hh * 1.1)], [x - 14, Math.min(h - 4, iy(x) + d0 + hh * 0.9)]];
    wash(ctx, rnd, ragged(q, rnd, 18), rnd.pick([WASH.meadow, WASH.sage, WASH.meadow]), { a: rnd.range(0.2, 0.3), edge: 0.4, edgeW: 4, blots: 3, box: [x, iy(x), x + ww, h] });
  }
  // field parcels: faded patches that sit on the slope, each ruled its own way
  for (let i = 0; i < 12; i++) {
    const x = rnd.range(0.08, 0.8) * w, ww = rnd.range(0.07, 0.18) * w, d0 = rnd.range(10, 130), hh = rnd.range(30, 84);
    if (iy(x) + d0 + hh > h - 4 || iy(x + ww) + d0 + hh > h - 4) continue;
    const sk = rnd.range(-14, 26);
    const quad = [[x, iy(x) + d0], [x + ww * 0.5, iy(x + ww * 0.5) + d0], [x + ww, iy(x + ww) + d0], [x + ww + sk, iy(x + ww) + d0 + hh], [x + ww * 0.5 + sk, iy(x + ww * 0.5) + d0 + hh], [x + sk, iy(x) + d0 + hh]];
    if (rnd.chance(0.6)) wash(ctx, rnd, ragged(quad.map((p) => [p[0] + rnd.range(-8, 8), p[1] + rnd.range(-5, 7)]), rnd, 14), rnd.pick([WASH.ochre, WASH.sage, WASH.olive, WASH.ochre, WASH.meadow]), { a: rnd.range(0.2, 0.32), edge: 0.35, edgeW: 3, blots: 2, box: [x, iy(x) + d0, x + ww, iy(x) + d0 + hh] });
    const path = (c) => { c.moveTo(quad[0][0], quad[0][1]); quad.slice(1).forEach((p) => c.lineTo(p[0], p[1])); c.closePath(); };
    pen.hatch([x - 20, iy(x) + d0 - 30, x + ww + 30, iy(x) + d0 + hh + 30], { angle: rnd.pick([0.04, 0.2, -0.2, 1.25, 1.0]), gap: rnd.range(4.5, 8), run: [26, 110], rest: [4, 18], w: 0.85, clip: path, a: 0.85 });
    if (rnd.chance(0.5)) pen.broken([quad[5], quad[4], quad[3]], { w: 1.2, run: [20, 70], skip: 0.1 });
  }
  // scrub and stones scattered over the slope
  for (let i = 0; i < 34; i++) {
    const x = rnd.range(0.06, 0.94) * w, yy = iy(x) + rnd.range(16, 200);
    if (yy > h - 10) continue;
    if (rnd.chance(0.7)) pen.lobe(x, yy, rnd.range(7, 16), rnd.range(4, 9), { w: 0.95, bump: 5, loops: 0, shade: 0.9, hgap: 3 });
    else for (let k = 0; k < 4; k++) pen.stroke([[x + k * 4, yy], [x + k * 4 + rnd.range(-2, 3), yy - rnd.range(4, 10)]], { w: 0.8, wob: 0.2, t0: 0, t1: 0.7 });
  }
  // long strokes of level ground at the foot
  for (let k = 0; k < 26; k++) {
    const x = rnd.range(0.03, 0.75) * w, yy = h - rnd.range(5, 70), len = rnd.range(50, 300);
    if (yy < iy(x) + 12 || yy < iy(x + len) + 12) continue;
    pen.line(x, yy, x + len, yy + rnd.bell() * 3, { w: 0.8, wob: 0.7, a: 0.8 });
  }
  const fl = flanks(y, w, 50);
  for (const f of fl) {
    wash(ctx, rnd, flankWash(rnd, y, f, 80), WASH.shade, { a: 0.18, edgeW: 4 });
    shadeFlank(pen, rnd, y, f, { gap: 5, w: 1.1, skip: 0.2, len: 50, tiers: 2 });
  }
  // rows that follow the form of the hill
  for (const d of [14, 30, 50, 76, 108, 146, 190]) {
    if (rnd.chance(0.2)) continue;
    const x0 = rnd.range(0.05, 0.3) * w, x1 = rnd.range(0.6, 0.96) * w;
    const pts = along(y, x0, x1, 16, 0).map((p, i, arr) => [p[0], p[1] + d * (1 + 0.25 * Math.sin((i / arr.length) * 3 + d))]);
    pen.broken(pts.filter((p) => p[1] < h - 4), { w: 1, run: [30, 120], gap: [4, 30], skip: 0.2, a: 0.85 });
    for (let k = 0; k < 4; k++) {
      const p = rnd.pick(pts);
      if (p && p[1] < h - 12 && rnd.chance(0.6)) pen.lobe(p[0], p[1] - 6, rnd.range(9, 18), rnd.range(5, 9), { w: 1, bump: 5, loops: 0, shade: 0.9, hgap: 3 });
    }
  }
  pen.broken(along(y, w * 0.03, w * 0.97, 10), { w: 2.3, run: [40, 140], lift: 1.4 });
  for (let x = w * 0.08; x < w * 0.92; x += rnd.range(4, 20)) {
    const yy = y[Math.round(x)];
    pen.stroke([[x, yy + 1], [x + rnd.range(-2, 3), yy - rnd.range(4, 11)]], { w: 0.9, wob: 0.2, t0: 0, t1: 0.7 });
  }
  trees.forEach((t) => paintTree(pen, ctx, rnd, t, { k: 1 }));
  return { canvas: S.finish(), profile: y, w, h };
}

// A single ink tree on its own sheet.
export function drawTree(o = {}) {
  const w = o.w ?? 300, h = o.h ?? 380;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  const kind = o.kind ?? 'oak';
  const H = h * (kind === 'bush' ? 0.5 : 0.92);
  const t = planTree(rnd, w / 2, h - 3, H, kind);
  treePaper(S, t, 3);
  const pen = S.ink({ k: o.k ?? 1, edge: { blur: 2.5, a: 0.24 } });
  paintTree(pen, ctx, rnd, t, o);
  return { canvas: S.finish(), w, h };
}

// A row of trees as one flat. pencil=true gives the graphite forest.
export function drawTreeLine(o = {}) {
  const w = o.w ?? 1024, h = o.h ?? 400;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  const n = o.count ?? rnd.int(8, 12);
  const plans = [];
  for (let i = 0; i < n; i++) {
    const row = i < n * 0.45 ? 0 : 1;                 // back row first
    const x = w * (0.07 + 0.86 * rnd()), H = h * rnd.range(0.5, 0.95) * (row ? 0.86 : 1);
    const yBase = h - 4 - (row ? 0 : rnd.range(6, 20));
    if (o.pencil) plans.push({ row, ...(rnd.chance(0.68) ? planFir(rnd, x, yBase, H) : planRound(rnd, x, yBase, H * 0.8)) });
    else plans.push({ row, ...planTree(rnd, x, yBase, H * (rnd.chance(0.2) ? 0.5 : 1), rnd.pick(o.kinds ?? ['oak', 'oak', 'poplar', 'pine', 'cypress', 'bush'])) });
  }
  plans.sort((a, b) => a.row - b.row || a.yBase - b.yBase);
  // a low bank of undergrowth ties the row together
  const bank = (ctx2) => {
    ctx2.moveTo(w * 0.03, h);
    for (let x = w * 0.03; x <= w * 0.97; x += 16) ctx2.lineTo(x, h - 16 - 12 * Math.abs(Math.sin(x * 0.021 + n)) * smooth01((x / w) * 8) * smooth01((1 - x / w) * 8));
    ctx2.lineTo(w * 0.97, h); ctx2.closePath();
  };
  S.paper(bank);
  plans.forEach((t) => (t.kind === 'fir' ? firPaper(S, t) : treePaper(S, t, 3)));

  if (o.pencil) {
    S.ink({ edge: { blur: 3, a: 0.22 } });
    // colour first: deep green under the firs, warmer olive under the round trees
    for (const t of plans) {
      if (t.kind === 'fir') wash(ctx, rnd, ragged([[t.x + t.lean, t.yBase - t.H], [t.x + t.half * 0.92, t.yBase - t.H * 0.11], [t.x - t.half * 0.92, t.yBase - t.H * 0.11]], rnd, 7, 2), WASH.pine, { a: t.row ? 0.46 : 0.34, edge: 0.4, edgeW: 3 });
      else {
        ctx.save(); ctx.beginPath();
        for (const l of t.lobes) { ctx.moveTo(l.cx + l.rx, l.cy); ctx.ellipse(l.cx, l.cy, l.rx, l.ry, 0, 0, 7); }
        ctx.clip();
        wash(ctx, rnd, (c2) => c2.rect(0, 0, w, h), WASH.olive, { a: 0.34, edge: 0 });
        ctx.restore();
      }
    }
    wash(ctx, rnd, bank, WASH.sage, { a: 0.34, edge: 0.3, edgeW: 3 });
    const L = pencilLayer(w, h);
    // the forest is drawn in green ink, handled as loosely as pencil
    const pen = new Pen(L.ctx, rnd, { pal: GREENINK, pencil: true });
    for (const t of plans) {
      // nearer trees cover the ones behind
      L.ctx.save(); L.ctx.globalCompositeOperation = 'destination-out'; L.ctx.globalAlpha = 0.7;
      L.ctx.beginPath();
      if (t.kind === 'fir') { L.ctx.moveTo(t.x, t.yBase - t.H); L.ctx.lineTo(t.x + t.half, t.yBase - t.H * 0.1); L.ctx.lineTo(t.x - t.half, t.yBase - t.H * 0.1); }
      else for (const l of t.lobes) { L.ctx.moveTo(l.cx + l.rx, l.cy); L.ctx.ellipse(l.cx, l.cy, l.rx, l.ry, 0, 0, 7); }
      L.ctx.fill(); L.ctx.restore();
      const dark = t.row ? 1 : 0.7;
      t.kind === 'fir' ? paintFir(pen, rnd, t, dark) : paintRound(pen, rnd, t, dark);
    }
    // undergrowth: dense scribble along the foot
    for (let x = w * 0.04; x < w * 0.94; x += rnd.range(20, 46)) pen.scribble(x, h - rnd.range(18, 30), rnd.range(26, 60), rnd.range(12, 24), { gap: 3, w: 1.2, press: rnd.range(0.6, 1), angle: -1.2 });
    applyTooth(L, 0.5);
    layPencil(ctx, L, { smudge: 0.45, blur: 4 });
  } else {
    const pen = S.ink({ k: o.k ?? 1, edge: { blur: 3, a: 0.24 } });
    for (const t of plans) {
      if (t.lobes.length) S.repaper((c) => { for (const l of t.lobes) { c.moveTo(l.cx + l.rx, l.cy); c.ellipse(l.cx, l.cy, l.rx * 0.96, l.ry * 0.96, 0, 0, 7); } }, 0.8);
      paintTree(pen, ctx, rnd, t, { k: t.row ? 1 : 0.8 });
    }
    for (let x = w * 0.04; x < w * 0.94; x += rnd.range(14, 40)) pen.lobe(x, h - rnd.range(8, 16), rnd.range(10, 22), rnd.range(6, 11), { w: 0.9, bump: 5, loops: 0, shade: 0.8 });
  }
  return { canvas: S.finish(), w, h };
}

// Cliffs: dense vertical strokes that drip, broken strata, grass on top.
const CLIFFS = {
  headland: [[0, 0], [0.07, 0.24], [0.22, 0.6], [0.45, 0.7], [0.66, 0.68], [0.72, 0.34], [0.78, 0.12], [0.9, 0.07], [1, 0]],
  bluff: [[0, 0], [0.06, 0.4], [0.14, 0.74], [0.4, 0.82], [0.62, 0.7], [0.8, 0.74], [0.9, 0.36], [1, 0]],
  falls: [[0, 0], [0.08, 0.5], [0.24, 0.84], [0.455, 0.92], [0.475, 0.7], [0.525, 0.7], [0.545, 0.9], [0.74, 0.8], [0.9, 0.46], [1, 0]],
};
export function drawCliff(o = {}) {
  const w = o.w ?? 1536, h = o.h ?? 640;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  let pts = CLIFFS[o.shape ?? 'bluff'];
  if (o.flip) pts = pts.map((p) => [1 - p[0], p[1]]).reverse();
  const y = controlProfile(rnd, w, h, pts, { jag: 1.2 });
  S.paper(under(y, w, h));
  const pen = S.ink({ k: o.k ?? 1, fade: o.fade ?? 0 });

  // wash in vertical bands, slate over sepia
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(0.06, 0.86) * w, ww = rnd.range(50, 190), top = y[Math.round(x + ww / 2)] + rnd.range(4, 30);
    if (top > h - 60) continue;
    const bot = Math.min(h - 6, top + rnd.range(0.3, 0.8) * (h - top));
    const p = [[x, top], [x + ww, y[Math.round(Math.min(w, x + ww))] + rnd.range(4, 30)], [x + ww * rnd.range(0.8, 1.1), bot], [x + ww * rnd.range(-0.1, 0.2), bot + rnd.range(-30, 20)]];
    wash(ctx, rnd, ragged(p, rnd, 22), rnd.pick([WASH.slate, WASH.sepia, WASH.slate]), { a: rnd.range(0.1, 0.19), edgeW: 4, box: [x, top, x + ww, bot], blots: 3 });
  }
  // turf along the top
  {
    const tp = along(y, w * 0.04, w * 0.96, 24, 2);
    const lowEdge = tp.slice().reverse().map((q) => [q[0] + rnd.bell() * 6, q[1] + rnd.range(12, 30)]);
    wash(ctx, rnd, ragged(tp.concat(lowEdge), rnd, 5, 2), WASH.sage, { a: 0.32, edge: 0.4, edgeW: 3 });
  }
  // strata, slightly tilted
  for (let k = 0; k < 9; k++) {
    const d = rnd.range(26, h * 0.7), x0 = rnd.range(0.05, 0.5) * w, x1 = x0 + rnd.range(0.15, 0.5) * w, tilt = rnd.range(-0.05, 0.03);
    const p = [];
    for (let x = x0; x < Math.min(x1, w * 0.97); x += 18) { const yy = y[Math.round(x)] + d + (x - x0) * tilt; if (yy < h - 8) p.push([x, yy]); }
    if (p.length > 2) pen.broken(p, { w: 1.1, run: [24, 90], gap: [4, 40], skip: 0.2 });
  }
  // vertical strokes hanging from the edge, in tiers
  for (let tier = 0; tier < 4; tier++) {
    for (let x = w * 0.03; x < w * 0.97; x += rnd.range(2.2, 5) * (1 + tier * 0.5)) {
      const xi = Math.round(x), top = y[xi];
      if (top > h - 24) continue;
      const slope = Math.abs(y[Math.min(w, xi + 6)] - y[Math.max(0, xi - 6)]) / 12;
      if (rnd() > 0.35 + slope * 0.6 - tier * 0.07) continue;
      const sy = top + 3 + tier * rnd.range(40, 90), len = rnd.range(18, 90) * (1 + slope * 0.6);
      if (sy + len > h - 4) continue;
      pen.stroke([[x, sy], [x + rnd.bell() * 2, sy + len * 0.5], [x + rnd.bell() * 3, sy + len]], { w: rnd.range(1, 1.9) * (1 - tier * 0.12), wob: 0.5, t0: 0.03, t1: 0.6 });
    }
  }
  // shadow hatching where the face turns away
  for (const f of flanks(y, w, 40)) shadeFlank(pen, rnd, y, f, { gap: 4.5, w: 1.3, len: clamp(f.drop * 0.7, 30, 150) });
  pen.broken(along(y, w * 0.02, w * 0.98, 9), { w: 2.5, run: [34, 110], lift: 1.5 });
  // grass on the top edge
  for (let x = w * 0.05; x < w * 0.95; x += rnd.range(4, 14)) {
    const xi = Math.round(x), slope = Math.abs(y[Math.min(w, xi + 6)] - y[Math.max(0, xi - 6)]) / 12;
    if (slope > 0.6) continue;
    pen.stroke([[x, y[xi] + 1], [x + rnd.range(-3, 3), y[xi] - rnd.range(3, 10)]], { w: 0.7, wob: 0.2, t0: 0, t1: 0.7 });
  }
  // tumbled rocks at the foot
  for (let k = 0; k < 12; k++) {
    const x = rnd.range(0.04, 0.96) * w, rr = rnd.range(8, 26), yy = h - rr * 0.5 - rnd.range(0, 8);
    if (y[Math.round(x)] > yy - rr) continue;
    pen.arc(x, yy, rr, rr * 0.7, 3.2, 6.2, { w: 1.1 });
    pen.hatch([x - rr * 0.2, yy - rr * 0.6, x + rr, yy + rr * 0.3], { gap: 3.4, run: [6, 16], w: 0.7, clip: (c) => c.ellipse(x, yy, rr, rr * 0.7, 0, 0, 7) });
  }

  if ((o.shape ?? '') === 'falls') {
    // the fall itself is bare paper with a few long drips
    const cx = w * 0.5, top = y[Math.round(cx)] - 2, half = w * 0.021;
    S.repaper((c) => { c.moveTo(cx - half, top); c.lineTo(cx + half, top); c.lineTo(cx + half * 2.4, h); c.lineTo(cx - half * 2.4, h); c.closePath(); }, 0.97);
    wash(ctx, rnd, ragged([[cx - half, top], [cx + half, top], [cx + half * 2.6, h], [cx - half * 2.6, h]], rnd, 8, 2), WASH.water, { a: 0.3, edgeW: 3, edge: 0.4 });
    for (let k = 0; k < 26; k++) {
      const u = rnd.range(-1, 1), sy = top + rnd.range(0, (h - top) * 0.7), len = rnd.range(40, 180);
      const spread = (yy) => 1 + ((yy - top) / (h - top)) * 1.4;
      pen.stroke([[cx + u * half * spread(sy), sy], [cx + u * half * spread(sy + len), Math.min(h - 4, sy + len)]], { w: rnd.range(0.6, 1), wob: 0.3, a: 0.7, t0: 0.2, t1: 0.6 });
    }
    for (let k = 0; k < 9; k++) pen.arc(cx + rnd.bell() * half * 3, h - rnd.range(6, 26), rnd.range(8, 18), rnd.range(5, 10), 3.3, 6.1, { w: 0.9 });
    // dark framing strokes either side of the water
    for (const side of [-1, 1]) for (let k = 0; k < 16; k++) {
      const sy = top + rnd.range(0, (h - top) * 0.8), x = cx + side * (half * (1.2 + ((sy - top) / (h - top)) * 1.6) + rnd.range(0, 16));
      pen.stroke([[x, sy], [x + side * rnd.range(0, 4), sy + rnd.range(20, 70)]], { w: rnd.range(0.9, 1.5), wob: 0.4 });
    }
  }
  return { canvas: S.finish(), profile: y, w, h };
}

// A cloud as a watercolourist leaves it: soft white body colour, a thin ink
// line where its top meets the sky, and a light blue-grey wash underneath.
export function drawCloud(o = {}) {
  const w = o.w ?? 640, h = o.h ?? 320;
  const S = makeSheet(w, h, o.seed ?? 1, 'pale');
  const { rnd } = S;
  const n = rnd.int(5, 9), base = h * 0.7;
  const lobes = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = h * rnd.range(0.15, 0.27) * (0.55 + 0.75 * Math.sin(t * Math.PI));
    lobes.push({ cx: w * (0.14 + 0.72 * t) + rnd.bell() * w * 0.03, cy: base - r * rnd.range(0.55, 0.95), rx: r * rnd.range(1.05, 1.4), ry: r });
  }
  const x0 = lobes[0].cx - lobes[0].rx * 0.7, x1 = lobes[n - 1].cx + lobes[n - 1].rx * 0.7;
  const top = Math.min(...lobes.map((l) => l.cy - l.ry));
  const shape = (c2) => {
    for (const l of lobes) { c2.moveTo(l.cx + l.rx, l.cy); c2.ellipse(l.cx, l.cy, l.rx, l.ry, 0, 0, 7); }
    c2.roundRect(x0, base - h * 0.12, x1 - x0, h * 0.17, h * 0.08);
  };
  // soft silhouette: fill hard, then let the edge bleed a little
  const hard = canvas(w, h), hc = hard.getContext('2d');
  hc.fillStyle = '#000'; hc.beginPath(); shape(hc); hc.fill();
  const mask = canvas(w, h), mc = mask.getContext('2d');
  mc.filter = 'blur(3.4px)'; mc.drawImage(hard, 0, 0); mc.filter = 'none';

  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${WASH.white.join(',')})`;
  ctx.fillRect(0, 0, w, h);
  // body colour is never perfectly even
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 6; i++) {
    const x = rnd() * w, y = rnd() * h, r = rnd.range(0.2, 0.5) * w;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(236,226,204,${rnd.range(0.12, 0.3)})`); g.addColorStop(1, 'rgba(236,226,204,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  // the shadow underneath: laid wet so its top edge is soft, then a second,
  // smaller pass with a harder edge low in the belly
  const lift = base - (base - top) * 0.3;
  const wav = (x, k) => Math.sin(x * 0.021 + n) * 7 * k + Math.sin(x * 0.047 + n * 2) * 4 * k;
  const under = (yy, k) => (c2) => {
    c2.moveTo(x0 - 20, yy + wav(x0 - 20, k));
    for (let x = x0 - 20; x <= x1 + 20; x += 12) {
      // the shadow climbs a little into each lobe
      const l = lobes.reduce((m, q) => Math.max(m, 1 - Math.abs(x - q.cx) / q.rx), 0);
      c2.lineTo(x, yy + wav(x, k) + Math.max(0, l) * (base - yy) * 0.1);
    }
    c2.lineTo(x1 + 20, h); c2.lineTo(x0 - 20, h); c2.closePath();
  };
  const cool = [150, 168, 200];
  // one flat wash under the belly with a wet upper edge, then a smaller second
  // touch lower down. Flat tones with edges: this is paint, not shading.
  wash(ctx, rnd, under(lift, 1), cool, { a: 0.17, edge: 0.5, edgeW: 4, box: [0, lift, w, h], blots: 2 });
  wash(ctx, rnd, under(base - (base - lift) * 0.36, 0.5), cool, { a: 0.14, edge: 0.4, edgeW: 3 });
  // thin ink along the top, only where a lobe is the true edge, and broken
  const pen = new Pen(ctx, rnd, { k: 1, fade: 0.1 });
  for (const l of lobes) {
    let run = [];
    const flush = () => { if (run.length > 3) pen.stroke(run, { w: 2.2, wob: 1.0, t0: 0.2, t1: 0.4, per: 3 }); run = []; };
    for (let a = Math.PI * 0.94; a <= Math.PI * 2.06; a += 0.09) {
      const x = l.cx + Math.cos(a) * l.rx, y = l.cy + Math.sin(a) * l.ry;
      const hidden = lobes.some((q) => q !== l && ((x - q.cx) / (q.rx * 0.97)) ** 2 + ((y - q.cy) / (q.ry * 0.97)) ** 2 < 1);
      if (hidden || rnd.chance(0.07)) flush(); else run.push([x, y + 1.5]);
    }
    flush();
  }
  // one or two short curls inside, where a lobe overlaps its neighbour
  for (let i = 0; i < 2; i++) {
    const l = rnd.pick(lobes), a0 = rnd.range(3.6, 4.6);
    pen.arc(l.cx, l.cy, l.rx * 0.82, l.ry * 0.8, a0, a0 + rnd.range(0.5, 0.9), { w: 1, wob: 0.6, a: 0.55 });
  }
  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 0.9;
  ctx.drawImage(mask, 0, 0);
  return { canvas: c, w, h };
}
