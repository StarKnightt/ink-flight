// Pen-drawn buildings: quick ruled lines that overshoot their corners, tick
// hatching on the wall turned from the light, a little faded wash on the roofs.

import { clamp, lerp } from './rng.js';
import { WASH, wash, gouache } from './ink.js';
import { makeSheet } from './sheet.js';
import { ragged, planTree, treePaper, paintTree } from './scenery.js';

const P = (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
const L2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const bbox = (pts) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return [x0, y0, x1, y1];
};
// push a polygon outward a little so paper shows around the drawing
const grow = (pts, m) => {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map((p) => { const d = Math.hypot(p[0] - cx, p[1] - cy) || 1; return [p[0] + ((p[0] - cx) / d) * m, p[1] + ((p[1] - cy) / d) * m]; });
};

// ---- houses --------------------------------------------------------------

function planHouse(rnd, x, yBase, o = {}) {
  const W = o.W ?? 170, Hw = o.Hw ?? 120, D = o.D ?? 110, R = o.R ?? 60, type = o.type ?? 'eave';
  const dx = D * 0.55, dy = -D * 0.26;
  const A = [x, yBase], B = [x + W, yBase], C = [x + W, yBase - Hw], Dp = [x, yBase - Hw];
  const B2 = [B[0] + dx, B[1] + dy], C2 = [C[0] + dx, C[1] + dy];
  const h = { type, W, Hw, D, R, dx, dy, A, B, C, Dp, B2, C2, side: [B, B2, C2, C] };
  const ov = 7;
  if (type === 'eave') {
    const RL = [x + dx / 2, yBase - Hw + dy / 2 - R], RR = [x + W + dx / 2, RL[1]];
    h.front = [A, B, C, Dp];
    h.gable = [C, C2, RR];
    h.roof = [[Dp[0] - ov, Dp[1] + 3], [C[0] + ov * 0.4, C[1] + 3], RR, [RL[0] - ov * 0.5, RL[1]]];
    h.top = RR;
  } else if (type === 'gable') {
    const AP = [x + W / 2, yBase - Hw - R], AP2 = [AP[0] + dx, AP[1] + dy];
    h.front = [A, B, C, AP, Dp];
    h.roof = [[C[0] + 4, C[1] + 3], [C2[0] + 4, C2[1] + 3], AP2, AP];
    h.top = AP;
  } else {
    // tower: square plan with a pyramid roof or battlements
    const D2 = [Dp[0] + dx, Dp[1] + dy];
    const AP = [x + (W + dx) / 2, yBase - Hw + dy / 2 - R];
    h.front = [A, B, C, Dp];
    h.D2 = D2; h.AP = AP;
    if (o.battlements) { h.roof = null; h.topFace = [Dp, C, C2, D2]; }
    else { h.roofFront = [[Dp[0] - 5, Dp[1]], [C[0] + 4, C[1]], AP]; h.roofSide = [[C[0] + 4, C[1]], [C2[0] + 4, C2[1]], AP]; }
    h.top = AP;
  }
  h.battlements = !!o.battlements;
  h.o = o;
  return h;
}

function housePaper(S, h, m = 4) {
  const parts = [h.front, h.side, h.gable, h.roof, h.roofFront, h.roofSide, h.topFace].filter(Boolean);
  // one hull around all faces keeps the cut simple and the paper generous
  for (const f of parts) S.paper(P(grow(f, m)));
  if (h.battlements) S.paper(P([[h.Dp[0] - m, h.Dp[1] - 16], [h.C[0] + m, h.C[1] - 16], [h.C2[0] + m, h.C2[1] - 16], [h.C2[0] + m, h.C2[1]], [h.Dp[0] - m, h.Dp[1]]]));
}

function windowAt(pen, x, y, w, hh, o = {}) {
  const r = pen.r;
  if (o.shutter) {
    // faded blue shutters folded back either side
    const sw = w * 0.64;
    for (const sx of [x - sw - 1.5, x + w + 1.5]) {
      const q = [[sx, y], [sx + sw, y], [sx + sw, y + hh], [sx, y + hh]];
      wash(pen.ctx, r, P(q), WASH.shutter, { a: 0.66, edge: 0.4, edgeW: 2 });
      pen.poly(q, { w: 0.8, over: 1 });
      pen.line(sx + 1, y + hh * 0.5, sx + sw - 1, y + hh * 0.5, { w: 0.55, a: 0.6 });
    }
  }
  pen.poly([[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]], { w: 1, over: 1.5 });
  pen.hatch([x, y, x + w, y + hh], { gap: 2.4, run: [hh * 0.6, hh * 1.4], rest: [1, 3], w: 0.95, clip: P([[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]]) });
  if (o.sill !== false) pen.line(x - 3, y + hh + 2, x + w + 3, y + hh + 2, { w: 1.1 });
  if (o.arch) pen.arc(x + w / 2, y, w / 2, w / 2, Math.PI, Math.PI * 2, { w: 1 });
  if (r.chance(0.3)) pen.line(x + w / 2, y, x + w / 2, y + hh, { w: 0.6, a: 0.5 });
}

function paintHouse(S, pen, h, o = {}) {
  const { ctx, rnd } = S;
  const { A, B, C, Dp, B2, C2, W, Hw } = h;
  const k = o.k ?? 1;
  // nearer house hides what is behind it
  for (const f of [h.front, h.side, h.gable, h.roof, h.roofFront, h.roofSide].filter(Boolean)) S.repaper(P(f), 1);

  // colour: warm cream body colour on most fronts, a cool wash on the wall
  // turned from the sun, terracotta on the roof
  if (rnd.chance(0.8)) gouache(ctx, P(h.front), WASH.cream, 0.4);
  else wash(ctx, rnd, ragged(h.front.map((p) => [p[0] + 4, p[1] + 5]), rnd, 8, 2), WASH.ochre, { a: 0.2, edgeW: 3 });
  wash(ctx, rnd, ragged(h.side.map((p) => [p[0] + 3, p[1] + 2]), rnd, 6, 2), WASH.shade, { a: 0.32, edgeW: 3 });
  const roofCol = o.roof ?? rnd.pick([WASH.roof, WASH.roof, WASH.roof, WASH.rose]);
  for (const f of [h.roof, h.roofFront, h.roofSide].filter(Boolean)) wash(ctx, rnd, ragged(f.map((p) => [p[0] + rnd.range(-3, 4), p[1] + rnd.range(-2, 4)]), rnd, 6, 2), roofCol, { a: f === h.roofSide ? 0.52 : 0.4, edgeW: 3 });
  const shut = h.type !== 'tower' && !o.arched && rnd.chance(0.42), blueDoor = rnd.chance(0.3);

  // walls
  pen.poly(h.front, { w: 1.6 * k });
  pen.line(B[0], B[1], B2[0], B2[1], { w: 1.4 * k, over: 3 });
  pen.line(B2[0], B2[1], C2[0], C2[1], { w: 1.7 * k, over: 3 });
  pen.hatch(bbox(h.side), { gap: 3.6, run: [16, 50], w: 0.95 * k, clip: P(h.side) });

  if (h.type === 'eave') {
    const [e0, e1, RR, RL] = h.roof;
    pen.poly(h.roof, { w: 1.6 * k });
    pen.line(C[0], C[1], C2[0], C2[1], { w: 1.2 * k });
    pen.line(C2[0], C2[1], RR[0], RR[1], { w: 1.6 * k, over: 2 });
    pen.hatch(bbox(h.gable), { gap: 4.4, run: [10, 30], w: 0.8 * k, clip: P(h.gable) });
    // tile courses with short ticks
    for (let t = 0.14; t < 0.95; t += rnd.range(0.1, 0.15)) {
      const a = L2(e0, RL, t), b = L2(e1, RR, t);
      pen.broken([a, L2(a, b, 0.5), b], { w: 0.8 * k, run: [20, 70], gap: [2, 12], skip: 0.12 });
      for (let u = rnd.range(0.02, 0.08); u < 1; u += rnd.range(0.05, 0.09)) {
        const p = L2(a, b, u);
        pen.line(p[0], p[1], p[0] + (RL[0] - e0[0]) * 0.07, p[1] + (RL[1] - e0[1]) * 0.07, { w: 0.7 * k, wob: 0.2 });
      }
    }
  } else if (h.type === 'gable') {
    const [r0, r1, AP2, AP] = h.roof;
    pen.poly(h.roof, { w: 1.6 * k });
    pen.line(Dp[0] - 5, Dp[1] + 3, AP[0], AP[1], { w: 1.8 * k, over: 3 });
    for (let t = 0.12; t < 0.95; t += rnd.range(0.1, 0.16)) {
      const a = L2(r0, AP, t), b = L2(r1, AP2, t);
      pen.line(a[0], a[1], b[0], b[1], { w: 0.8 * k });
    }
    for (let u = 0.15; u < 1; u += rnd.range(0.14, 0.22)) {
      const a = L2(r0, r1, u), b = L2(AP, AP2, u);
      pen.broken([a, L2(a, b, 0.5), b], { w: 0.7 * k, run: [10, 30], gap: [3, 10], skip: 0.2 });
    }
    // opening under the peak
    if (rnd.chance(0.7)) windowAt(pen, AP[0] - 6, AP[1] + h.R * 0.5, 12, 14, { arch: rnd.chance(0.5) });
  } else if (h.battlements) {
    const n = Math.max(3, Math.round(W / 22));
    for (let i = 0; i < n; i++) if (i % 2 === 0) {
      const x0 = Dp[0] + (i / n) * W, x1 = Dp[0] + ((i + 1) / n) * W;
      pen.poly([[x0, Dp[1]], [x0, Dp[1] - 14], [x1, Dp[1] - 14], [x1, Dp[1]]], { w: 1.3 * k, open: true });
    }
    for (let i = 0; i < 3; i++) if (i % 2 === 0) {
      const a = L2(C, C2, i / 3), b = L2(C, C2, (i + 1) / 3);
      pen.poly([a, [a[0], a[1] - 14], [b[0], b[1] - 14], b], { w: 1.3 * k, open: true });
    }
    pen.line(C[0], C[1], C2[0], C2[1], { w: 1.4 * k });
  } else {
    pen.poly(h.roofFront, { w: 1.6 * k });
    pen.line(h.C2[0] + 4, h.C2[1], h.AP[0], h.AP[1], { w: 1.8 * k, over: 2 });
    pen.line(C[0], C[1], C2[0], C2[1], { w: 1.2 * k });
    pen.hatch(bbox(h.roofSide), { gap: 3.4, run: [10, 36], w: 0.9 * k, clip: P(h.roofSide) });
    for (let t = 0.2; t < 0.9; t += 0.18) { const a = L2(h.roofFront[0], h.AP, t), b = L2(h.roofFront[1], h.AP, t); pen.line(a[0], a[1], b[0], b[1], { w: 0.75 * k }); }
  }

  // openings on the front
  if (h.type === 'tower') {
    const n = Math.max(1, Math.round(W / 46));
    for (let i = 0; i < n; i++) windowAt(pen, A[0] + ((i + 0.5) / n) * W - 8, Dp[1] + 22, 16, 30, { arch: true });
    for (let yy = Dp[1] + 90; yy < A[1] - 60; yy += rnd.range(60, 110)) windowAt(pen, A[0] + W * rnd.range(0.3, 0.6), yy, 9, 16, {});
    pen.line(Dp[0], Dp[1] + 66, C[0], C[1] + 66, { w: 1 * k });
    pen.line(C[0], C[1] + 66, C2[0], C2[1] + 66, { w: 1 * k });
  } else {
    const rows = Math.max(1, Math.floor(Hw / 62)), cols = Math.max(1, Math.floor(W / 52));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd.chance(0.15)) continue;
      const ww = rnd.range(11, 15), hh = rnd.range(16, 22);
      const wx = A[0] + ((c + 0.5) / cols) * W - ww / 2 + rnd.bell() * 3;
      const wy = Dp[1] + 16 + r * ((Hw - 30) / rows) + rnd.bell() * 2;
      if (r === rows - 1 && c === (o.doorCol ?? Math.floor(cols / 2))) continue;
      windowAt(pen, wx, wy, ww, hh, { arch: o.arched, shutter: shut });
    }
    // door
    const dc = o.doorCol ?? Math.floor(cols / 2), dw = o.bigDoor ? 30 : 18, dh = o.bigDoor ? 52 : 34;
    const dxp = A[0] + ((dc + 0.5) / cols) * W - dw / 2;
    const doorShape = (c) => { c.rect(dxp, A[1] - dh, dw, dh); c.ellipse(dxp + dw / 2, A[1] - dh, dw / 2, dw / 2, 0, 0, 7); };
    if (blueDoor) wash(ctx, rnd, doorShape, WASH.shutter, { a: 0.7, edge: 0.3, edgeW: 2 });
    pen.poly([[dxp, A[1]], [dxp, A[1] - dh], [dxp + dw, A[1] - dh], [dxp + dw, A[1]]], { w: 1.3 * k, open: true });
    pen.arc(dxp + dw / 2, A[1] - dh, dw / 2, dw / 2, Math.PI, Math.PI * 2, { w: 1.3 * k });
    pen.hatch([dxp, A[1] - dh - dw / 2, dxp + dw, A[1]], { gap: blueDoor ? 5 : 2.6, run: [14, 40], w: 1, clip: (c) => { c.rect(dxp, A[1] - dh, dw, dh); c.ellipse(dxp + dw / 2, A[1] - dh, dw / 2, dw / 2, 0, 0, 7); } });
    if (o.rose) { pen.arc(h.top[0], h.top[1] + h.R * 0.7, 13, 13, 0, 6.5, { w: 1.2 }); pen.arc(h.top[0], h.top[1] + h.R * 0.7, 6, 6, 0, 6.5, { w: 0.8 }); }
  }
  // a window on the side wall, in perspective
  if (h.type !== 'tower' || true) {
    const a = L2(L2(B, B2, 0.35), L2(C, C2, 0.35), 0.4), b = L2(L2(B, B2, 0.6), L2(C, C2, 0.6), 0.4);
    const hh = 18;
    pen.poly([a, b, [b[0], b[1] - hh], [a[0], a[1] - hh]], { w: 0.9, over: 1 });
    pen.hatch([a[0], b[1] - hh, b[0], a[1]], { gap: 2.2, run: [8, 22], w: 0.9, clip: P([a, b, [b[0], b[1] - hh], [a[0], a[1] - hh]]) });
  }
  // chimney
  if (h.type === 'eave' && rnd.chance(0.75)) {
    const [e0, e1, RR, RL] = h.roof;
    const c = L2(L2(e0, e1, rnd.range(0.2, 0.8)), L2(RL, RR, 0.5), 0.75);
    pen.poly([[c[0], c[1]], [c[0], c[1] - 24], [c[0] + 12, c[1] - 24], [c[0] + 12, c[1] + 3]], { w: 1.2, open: true });
    pen.line(c[0] + 12, c[1] - 24, c[0] + 17, c[1] - 27, { w: 1 });
    pen.line(c[0] + 17, c[1] - 27, c[0] + 17, c[1] + 1, { w: 1.2 });
  }
  // ground under the walls, and cast shade on the right
  pen.line(A[0] - 10, A[1] + 1, B[0] + 4, B[1] + 1, { w: 1.2, wob: 0.8 });
  for (let i = 0; i < 6; i++) { const t = rnd(); const p = L2(B, B2, t); pen.line(p[0] + 2, p[1] + 1, p[0] + rnd.range(18, 46), p[1] + rnd.range(0, 4), { w: 0.8, wob: 0.4 }); }
}

const HOUSE_KINDS = {
  cottage: (r) => ({ type: 'eave', W: r.range(150, 190), Hw: r.range(74, 96), D: r.range(90, 120), R: r.range(48, 64) }),
  town: (r) => ({ type: 'gable', W: r.range(110, 140), Hw: r.range(140, 190), D: r.range(110, 150), R: r.range(52, 70) }),
  long: (r) => ({ type: 'eave', W: r.range(220, 280), Hw: r.range(96, 124), D: r.range(100, 130), R: r.range(54, 70) }),
  tall: (r) => ({ type: 'eave', W: r.range(110, 140), Hw: r.range(170, 220), D: r.range(90, 120), R: r.range(40, 56) }),
  tower: (r) => ({ type: 'tower', W: r.range(74, 92), Hw: r.range(330, 420), D: r.range(70, 90), R: r.range(60, 90), battlements: r.chance(0.4) }),
};

// One building on its own sheet.
export function drawHouse(o = {}) {
  const S = makeSheet(10, 10, o.seed ?? 1);
  const spec = { ...HOUSE_KINDS[o.kind ?? 'cottage'](S.rnd), ...o };
  const padL = 22, w = Math.ceil(spec.W + spec.D * 0.55 + padL + 44), h = Math.ceil(spec.Hw + spec.R + spec.D * 0.26 + 40);
  const S2 = makeSheet(w, h, (o.seed ?? 1) + 7, o.tone ?? 'pale');
  const hs = planHouse(S2.rnd, padL, h - 6, spec);
  housePaper(S2, hs);
  S2.paper((c) => c.rect(4, h - 12, w - 8, 12));
  const pen = S2.ink({ edge: { blur: 2.5, a: 0.24 } });
  paintHouse(S2, pen, hs, spec);
  return { canvas: S2.finish(), w, h };
}

// A run of house fronts as one flat, like a street painted on a stage piece.
export function drawTownRow(o = {}) {
  const w = o.w ?? 1200, h = o.h ?? 520;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { rnd } = S;
  const kinds = o.kinds ?? ['cottage', 'town', 'tall', 'town', 'long', 'cottage', 'tower'];
  const plans = [];
  let x = 26;
  while (x < w - 220) {
    const kind = rnd.pick(kinds);
    const spec = HOUSE_KINDS[kind](rnd);
    if (kind === 'tower') spec.Hw = Math.min(spec.Hw, h - 150);
    if (x + spec.W + spec.D * 0.55 > w - 20) break;
    plans.push({ h: planHouse(rnd, x, h - 6 - rnd.range(0, 8), spec), spec });
    x += spec.W + rnd.range(-6, 26);
  }
  // a tree or two between the houses
  const trees = [];
  for (let i = 0; i < 2; i++) { const tx = rnd.range(0.1, 0.9) * w; trees.push(planTree(rnd, tx, h - 8, rnd.range(150, 260), rnd.pick(['cypress', 'cypress', 'poplar']))); }
  trees.forEach((t) => treePaper(S, t, 3));
  plans.forEach((p) => housePaper(S, p.h));
  S.paper((c) => c.rect(8, h - 12, w - 16, 12));
  const pen = S.ink({ edge: { blur: 3, a: 0.24 } });
  trees.forEach((t) => paintTree(pen, S.ctx, rnd, t));
  plans.forEach((p) => paintHouse(S, pen, p.h, p.spec));
  return { canvas: S.finish(), w, h };
}

// Church: a gabled nave with a bell tower behind its shoulder.
export function drawChurch(o = {}) {
  const w = 560, h = 680;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { rnd } = S;
  const tower = planHouse(rnd, 40, h - 8, { type: 'tower', W: 100, Hw: 470, D: 90, R: 110 });
  const nave = planHouse(rnd, 150, h - 6, { type: 'gable', W: 200, Hw: 210, D: 230, R: 100, bigDoor: true, rose: true, doorCol: 1, arched: true });
  housePaper(S, tower); housePaper(S, nave);
  S.paper((c) => c.rect(8, h - 12, w - 16, 12));
  const pen = S.ink({ edge: { blur: 3, a: 0.24 } });
  paintHouse(S, pen, tower, { type: 'tower', roof: WASH.umber });
  paintHouse(S, pen, nave, { bigDoor: true, rose: true, doorCol: 1, arched: true, roof: WASH.roof });
  // finial
  pen.line(tower.AP[0], tower.AP[1], tower.AP[0], tower.AP[1] - 26, { w: 1.4 });
  pen.arc(tower.AP[0], tower.AP[1] - 30, 4, 4, 0, 6.4, { w: 1.2 });
  return { canvas: S.finish(), w, h };
}

// ---- bridge --------------------------------------------------------------

// Stone bridge in elevation. The arches are cut clean through the sheet.
export function drawBridge(o = {}) {
  const w = o.w ?? 1400, h = o.h ?? 380;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  const x0 = 30, x1 = w - 30, Lb = x1 - x0;
  const deck = (x) => {
    const u = clamp((x - x0) / Lb, 0, 1);
    return h * 0.42 - 64 * Math.pow(Math.sin(u * Math.PI), 0.85) + 40 * Math.pow(Math.abs(u - 0.5) * 2, 6);
  };
  const par = 22;
  const spring = h - 70;
  const arches = [
    { cx: x0 + Lb * 0.235, r: Lb * 0.105 },
    { cx: x0 + Lb * 0.5, r: Lb * 0.135 },
    { cx: x0 + Lb * 0.765, r: Lb * 0.105 },
  ];
  for (const a of arches) a.ry = spring - (deck(a.cx) + 34);
  S.paper((c) => {
    c.moveTo(x0, h);
    for (let x = x0; x <= x1; x += 6) c.lineTo(x, deck(x) - par);
    c.lineTo(x1, h); c.closePath();
  });
  // openings: shifted a little so the far side of each barrel shows as paper
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const a of arches) {
    ctx.beginPath();
    ctx.moveTo(a.cx - a.r + 16, h); ctx.lineTo(a.cx - a.r + 16, spring);
    ctx.ellipse(a.cx + 8, spring, a.r - 8, a.ry - 6, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(a.cx + a.r, h); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const pen = S.ink({ edge: { blur: 3, a: 0.26 } });
  const body = (c) => { c.moveTo(x0, h); for (let x = x0; x <= x1; x += 6) c.lineTo(x, deck(x)); c.lineTo(x1, h); c.closePath(); };
  gouache(ctx, body, WASH.cream, 0.34);

  // stains running down from the parapet, and shade low on the piers
  for (let i = 0; i < 12; i++) {
    const x = rnd.range(x0 + 30, x1 - 60), ww = rnd.range(20, 70), top = deck(x) + rnd.range(-4, 10), bot = top + rnd.range(40, 150);
    wash(ctx, rnd, ragged([[x, top], [x + ww, top + 2], [x + ww * rnd.range(0.6, 1), bot], [x + ww * rnd.range(0, 0.3), bot - 10]], rnd, 9), rnd.pick([WASH.sepia, WASH.shade, WASH.sage, WASH.shade]), { a: rnd.range(0.12, 0.24), edgeW: 3 });
  }
  // courses of stone
  ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
  for (let yy = h * 0.2; yy < h; yy += rnd.range(15, 22)) {
    for (let x = x0 + rnd.range(0, 60); x < x1; ) {
      const len = rnd.range(30, 120);
      if (rnd.chance(0.55)) pen.line(x, yy + rnd.bell() * 1.5, x + len, yy + rnd.bell() * 1.5, { w: 0.8, wob: 0.5, a: 0.8 });
      if (rnd.chance(0.4)) pen.line(x + len * 0.5, yy, x + len * 0.5 + rnd.bell(), yy + rnd.range(10, 18), { w: 0.7, wob: 0.2, a: 0.8 });
      x += len + rnd.range(6, 50);
    }
  }
  ctx.restore();
  for (const a of arches) {
    // soffit: the dark inside of the barrel on the left
    const cres = (c) => {
      c.moveTo(a.cx - a.r, h); c.lineTo(a.cx - a.r, spring);
      c.ellipse(a.cx, spring, a.r, a.ry, 0, Math.PI, Math.PI * 2);
      c.lineTo(a.cx + a.r, h); c.closePath();
    };
    wash(ctx, rnd, cres, [86, 96, 132], { a: 0.46, edge: 0 });
    pen.hatch([a.cx - a.r, spring - a.ry, a.cx + a.r, h], { gap: 3, run: [14, 50], w: 1.1, clip: cres });
    // ring of voussoirs
    pen.arc(a.cx, spring, a.r, a.ry, Math.PI, Math.PI * 2, { w: 2 });
    pen.arc(a.cx, spring, a.r + 15, a.ry + 15, Math.PI * 1.02, Math.PI * 1.98, { w: 1.2 });
    for (let t = 0.03; t < 0.98; t += rnd.range(0.045, 0.07)) {
      const ang = Math.PI * (1 + t);
      pen.line(a.cx + Math.cos(ang) * a.r, spring + Math.sin(ang) * a.ry, a.cx + Math.cos(ang) * (a.r + 15), spring + Math.sin(ang) * (a.ry + 15), { w: 0.9, wob: 0.2 });
    }
    pen.line(a.cx - a.r, spring, a.cx - a.r, h, { w: 1.8 });
    pen.line(a.cx + a.r, spring, a.cx + a.r, h, { w: 1.4 });
    pen.line(a.cx - a.r + 16, spring, a.cx - a.r + 16, h, { w: 1 });
  }
  // piers with cutwaters, shaded on the right
  for (let i = 0; i < arches.length - 1; i++) {
    const xl = arches[i].cx + arches[i].r, xr = arches[i + 1].cx - arches[i + 1].r, xm = (xl + xr) / 2;
    pen.poly([[xm - 14, h], [xm, spring - 36], [xm + 14, h]], { w: 1.4, open: true });
    pen.hatch([xm, spring - 36, xr, h], { gap: 3.6, run: [16, 44], w: 0.95, clip: P([[xm, spring - 36], [xr, spring - 10], [xr, h], [xm + 14, h]]) });
  }
  // parapet: two lines and a coping of ticks
  const top = [], low = [];
  for (let x = x0 + 6; x <= x1 - 6; x += 24) { top.push([x, deck(x) - par + 2]); low.push([x, deck(x)]); }
  pen.broken(top, { w: 2.2, run: [60, 200], lift: 1.2 });
  pen.broken(low, { w: 1.3, run: [50, 160], lift: 1 });
  for (let x = x0 + 16; x < x1 - 10; x += rnd.range(14, 24)) pen.line(x, deck(x) - par + 3, x + rnd.bell(), deck(x) - 1, { w: 0.8, wob: 0.2 });
  // ends meet the bank
  pen.line(x0, h - 2, x0 + 4, deck(x0) - par, { w: 1.8 });
  pen.line(x1, h - 2, x1 - 2, deck(x1) - par, { w: 2 });
  return { canvas: S.finish(), w, h, deckY: deck, arches, spring };
}

// ---- windmill ------------------------------------------------------------

export function drawMill(o = {}) {
  const w = 480, h = 700;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  const cx = w * 0.5, top = h * 0.3, bw = 108, tw = 66;
  const body = [[cx - bw, h - 6], [cx - tw, top], [cx + tw, top], [cx + bw, h - 6]];
  const capP = (c) => {
    c.moveTo(cx - tw - 10, top + 4);
    c.bezierCurveTo(cx - tw - 6, top - 70, cx + tw - 10, top - 86, cx + tw + 16, top - 18);
    c.lineTo(cx + tw + 54, top - 6); c.lineTo(cx + tw + 12, top + 6); c.closePath();
  };
  const stage = [[cx - bw * 0.86 - 26, h * 0.56], [cx + bw * 0.86 + 26, h * 0.56], [cx + bw * 0.86 + 26, h * 0.56 + 12], [cx - bw * 0.86 - 26, h * 0.56 + 12]];
  S.paper(P(grow(body, 4))); S.paper(capP); S.paper(P(grow(stage, 4)));
  S.paper((c) => c.rect(cx - bw - 40, h - 14, bw * 2 + 80, 14));
  const pen = S.ink({ edge: { blur: 3, a: 0.26 } });

  // shade on the right third; the tower is round so the hatching curves with it
  gouache(ctx, P(body), WASH.cream, 0.4);
  const right = [[cx + tw * 0.25, top], [cx + tw, top], [cx + bw, h - 6], [cx + bw * 0.3, h - 6]];
  wash(ctx, rnd, ragged(right.map((p) => [p[0] + 4, p[1]]), rnd, 12), WASH.shade, { a: 0.32, edgeW: 4 });
  wash(ctx, rnd, capP, WASH.roof, { a: 0.46, edgeW: 3 });
  pen.hatch(bbox(body), { gap: 4, run: [18, 60], w: 1.1, clip: P(body), dens: (x) => clamp((x - cx) / bw * 1.5 + 0.1, 0, 1) });
  // stone: short courses that sag like hoops round a barrel
  for (let yy = top + 16; yy < h - 14; yy += rnd.range(15, 24)) {
    const t = (yy - top) / (h - top), half = lerp(tw, bw, t);
    for (let k = 0; k < 5; k++) {
      const a = rnd.range(-0.95, 0.8), b = a + rnd.range(0.1, 0.4);
      const sag = (u) => yy + (1 - u * u) * 7;
      pen.stroke([[cx + a * half, sag(a)], [cx + ((a + b) / 2) * half, sag((a + b) / 2)], [cx + b * half, sag(b)]], { w: 0.8, wob: 0.3, a: 0.8 });
    }
  }
  pen.line(body[0][0], body[0][1], body[1][0], body[1][1], { w: 1.8, over: 3 });
  pen.line(body[3][0], body[3][1], body[2][0], body[2][1], { w: 2.3, over: 3 });
  pen.stroke([[cx - tw, top], [cx, top + 7], [cx + tw, top]], { w: 1.4 });
  // cap
  ctx.save(); ctx.beginPath(); capP(ctx); ctx.restore();
  pen.stroke([[cx - tw - 10, top + 4], [cx - tw + 6, top - 52], [cx + 6, top - 78], [cx + tw - 4, top - 54], [cx + tw + 16, top - 18]], { w: 2 });
  pen.poly([[cx + tw + 16, top - 18], [cx + tw + 54, top - 6], [cx + tw + 12, top + 6]], { w: 1.4, open: true });
  for (let k = 0; k < 7; k++) { const u = k / 7; pen.stroke([[cx - tw + u * tw * 2, top + 2], [cx - tw * 0.6 + u * tw * 1.5, top - 40 - Math.sin(u * 3.1) * 30]], { w: 0.8, wob: 0.3 }); }
  pen.line(cx - tw - 12, top + 5, cx + tw + 14, top + 5, { w: 1.8 });
  // gallery with struts
  pen.poly(stage, { w: 1.4 });
  for (let x = stage[0][0] + 6; x < stage[1][0]; x += 15) pen.line(x, stage[0][1], x, stage[0][1] - 20, { w: 0.9, wob: 0.2 });
  pen.line(stage[0][0], stage[0][1] - 20, stage[1][0], stage[1][1] - 20, { w: 1.2 });
  for (const s of [-1, 1]) pen.line(cx + s * (bw * 0.86 + 20), stage[2][1], cx + s * bw * 0.82, stage[2][1] + 50, { w: 1.1 });
  // door and windows
  const dw = 34, dh = 60;
  pen.poly([[cx - dw / 2 - 10, h - 6], [cx - dw / 2 - 10, h - 6 - dh], [cx + dw / 2 - 10, h - 6 - dh], [cx + dw / 2 - 10, h - 6]], { w: 1.4, open: true });
  pen.arc(cx - 10, h - 6 - dh, dw / 2, dw / 2, Math.PI, Math.PI * 2, { w: 1.4 });
  pen.hatch([cx - dw, h - dh - 30, cx + dw, h], { gap: 2.6, run: [14, 44], w: 1.05, clip: (c) => { c.rect(cx - dw / 2 - 10, h - 6 - dh, dw, dh); c.ellipse(cx - 10, h - 6 - dh, dw / 2, dw / 2, 0, 0, 7); } });
  windowAt(pen, cx - 34, top + 60, 14, 22, { arch: true });
  windowAt(pen, cx + 6, h * 0.66, 14, 22, { arch: true });
  windowAt(pen, cx - 44, h * 0.78, 13, 20, {});
  pen.line(cx - bw - 34, h - 5, cx + bw + 36, h - 5, { w: 1.3, wob: 0.8 });
  for (let i = 0; i < 9; i++) pen.line(cx + bw + rnd.range(-4, 6), h - 6 - rnd.range(0, 4), cx + bw + rnd.range(30, 110), h - 5 - rnd.range(0, 4), { w: 0.8, wob: 0.4 });
  return { canvas: S.finish(), w, h, hub: [cx + 4, top - 22] };
}

// The sails, on their own sheet so they can turn.
export function drawSails(o = {}) {
  const w = 760, h = 760;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  const cx = w / 2, cy = h / 2, Ls = 356, r0 = 56, sw = 66;
  const arms = [0, 1, 2, 3].map((k) => 0.32 + k * Math.PI / 2);
  const rot = (a, x, y) => [cx + Math.cos(a) * x - Math.sin(a) * y, cy + Math.sin(a) * x + Math.cos(a) * y];
  for (const a of arms) {
    S.paper(P([rot(a, 0, -7), rot(a, Ls + 6, -7), rot(a, Ls + 6, 7), rot(a, 0, 7)]));
    S.paper(P([rot(a, r0 - 4, 2), rot(a, Ls + 4, 2), rot(a, Ls + 4, sw + 4), rot(a, r0 - 4, sw + 4)]));
  }
  S.paper((c) => c.ellipse(cx, cy, 24, 24, 0, 0, 7));
  const pen = S.ink({ edge: { blur: 2.5, a: 0.24 } });
  for (const a of arms) {
    const q = [rot(a, r0, 6), rot(a, Ls, 6), rot(a, Ls, sw), rot(a, r0, sw)];
    // sailcloth on some of the frame
    const u0 = rnd.range(0, 0.25), u1 = rnd.range(0.7, 1);
    wash(ctx, rnd, ragged([L2(q[0], q[1], u0), L2(q[0], q[1], u1), L2(q[3], q[2], u1), L2(q[3], q[2], u0)], rnd, 7), WASH.ochre, { a: 0.22, edgeW: 3 });
    // stock
    pen.line(...rot(a, -30, -4), ...rot(a, Ls, -4), { w: 1.8, over: 3 });
    pen.line(...rot(a, -30, 4), ...rot(a, Ls, 4), { w: 2.2, over: 3 });
    // frame and lattice
    pen.poly(q, { w: 1.5 });
    for (const f of [0.34, 0.67]) pen.line(...rot(a, r0, lerp(6, sw, f)), ...rot(a, Ls, lerp(6, sw, f)), { w: 0.9 });
    for (let x = r0 + 20; x < Ls - 6; x += rnd.range(22, 28)) pen.line(...rot(a, x, 5), ...rot(a, x + rnd.bell() * 2, sw + 1), { w: 0.95, wob: 0.3 });
    pen.hatch(bbox(q), { gap: 5, run: [10, 30], w: 0.75, clip: P(q), dens: () => 0.35 });
  }
  pen.arc(cx, cy, 20, 20, 0, 6.6, { w: 2 });
  pen.arc(cx, cy, 7, 7, 0, 6.6, { w: 1.4 });
  pen.hatch([cx - 20, cy - 20, cx + 20, cy + 20], { gap: 3, run: [8, 22], w: 0.9, clip: (c) => c.ellipse(cx, cy, 20, 20, 0, 0, 7), dens: (x) => (x > cx ? 0.9 : 0.2) });
  return { canvas: S.finish(), w, h };
}

// ---- lighthouse ----------------------------------------------------------

export function drawLighthouse(o = {}) {
  const w = 520, h = 1040;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  const cx = w * 0.6, base = h - 8, top = h * 0.215, bw = 84, tw = 50;
  const half = (yy) => lerp(tw, bw, clamp((yy - top) / (base - top), 0, 1));
  const body = [[cx - bw, base], [cx - tw, top], [cx + tw, top], [cx + bw, base]];
  const gal = [[cx - tw - 26, top - 10], [cx + tw + 26, top - 10], [cx + tw + 20, top + 6], [cx - tw - 20, top + 6]];
  const lan = [[cx - 34, top - 10], [cx - 34, top - 92], [cx + 34, top - 92], [cx + 34, top - 10]];
  const dome = (c) => { c.moveTo(cx - 42, top - 90); c.quadraticCurveTo(cx - 34, top - 150, cx, top - 158); c.quadraticCurveTo(cx + 34, top - 150, cx + 42, top - 90); c.closePath(); };
  const cot = planHouse(rnd, 26, base, { type: 'eave', W: 150, Hw: 84, D: 100, R: 50 });
  S.paper(P(grow(body, 4))); S.paper(P(grow(gal, 4))); S.paper(P(grow(lan, 4))); S.paper(dome);
  S.paper((c) => c.rect(cx - 5, top - 196, 10, 44));
  housePaper(S, cot);
  S.paper((c) => c.rect(6, base - 8, w - 12, 16));
  const pen = S.ink({ edge: { blur: 3, a: 0.26 } });
  paintHouse(S, pen, cot, { roof: WASH.roof });
  S.repaper(P(body), 1);
  gouache(ctx, P(body), WASH.white, 0.5);

  // faded bands
  const bands = [0.12, 0.42, 0.72];
  for (const b of bands) {
    const y0 = lerp(top, base, b), y1 = lerp(top, base, b + 0.15);
    const q = [[cx - half(y0), y0], [cx + half(y0), y0], [cx + half(y1), y1], [cx - half(y1), y1]];
    wash(ctx, rnd, ragged(q.map((p) => [p[0] + rnd.range(-3, 3), p[1] + rnd.range(-2, 4)]), rnd, 5, 2), WASH.roof, { a: 0.5, edgeW: 3 });
    for (const yy of [y0, y1]) pen.stroke([[cx - half(yy), yy], [cx, yy + 9], [cx + half(yy), yy]], { w: 1.2 });
    // hoops of hatching that follow the round of the tower
    for (let yy = y0 + 5; yy < y1 - 2; yy += rnd.range(4, 6.5)) {
      const hw = half(yy), a = rnd.range(-0.2, 0.3), b2 = rnd.range(0.8, 0.98);
      pen.stroke([[cx + a * hw, yy + (1 - a * a) * 9], [cx + ((a + b2) / 2) * hw, yy + 6], [cx + b2 * hw, yy + (1 - b2 * b2) * 9]], { w: 0.9, wob: 0.3 });
    }
  }
  // shade down the right side
  wash(ctx, rnd, ragged([[cx + tw * 0.4, top], [cx + tw, top], [cx + bw, base], [cx + bw * 0.45, base]], rnd, 10), WASH.shade, { a: 0.3, edgeW: 4 });
  pen.hatch(bbox(body), { gap: 4.4, run: [20, 70], w: 1, clip: P(body), dens: (x, y) => clamp((x - cx) / half(y) * 1.7 - 0.25, 0, 1) });
  pen.line(body[0][0], body[0][1], body[1][0], body[1][1], { w: 1.8, over: 2 });
  pen.line(body[3][0], body[3][1], body[2][0], body[2][1], { w: 2.4, over: 2 });
  // windows climbing the stair, and the door
  for (const [u, sx] of [[0.2, -0.2], [0.36, 0.25], [0.55, -0.25], [0.7, 0.2]]) windowAt(pen, cx + sx * half(lerp(top, base, u)) - 7, lerp(top, base, u), 13, 22, { arch: true });
  pen.poly([[cx - 16, base], [cx - 16, base - 50], [cx + 16, base - 50], [cx + 16, base]], { w: 1.4, open: true });
  pen.arc(cx, base - 50, 16, 16, Math.PI, Math.PI * 2, { w: 1.4 });
  pen.hatch([cx - 16, base - 66, cx + 16, base], { gap: 2.6, run: [12, 40], w: 1, clip: (c) => { c.rect(cx - 16, base - 50, 32, 50); c.ellipse(cx, base - 50, 16, 16, 0, 0, 7); } });
  // gallery, rail, lantern
  pen.poly(gal, { w: 1.6 });
  for (let x = gal[0][0] + 4; x <= gal[1][0]; x += 9) pen.line(x, top - 10, x, top - 32, { w: 0.8, wob: 0.2 });
  pen.line(gal[0][0] - 2, top - 32, gal[1][0] + 2, top - 32, { w: 1.2 });
  for (const s of [-1, 1]) pen.line(cx + s * (tw + 22), top + 6, cx + s * (tw + 2), top + 40, { w: 1.1 });
  pen.poly(lan, { w: 1.5 });
  for (const f of [0.33, 0.67]) pen.line(lerp(lan[0][0], lan[3][0], f), top - 10, lerp(lan[0][0], lan[3][0], f), top - 92, { w: 1 });
  pen.line(cx - 34, top - 52, cx + 34, top - 52, { w: 0.9 });
  for (let k = 0; k < 3; k++) { const x = cx - 34 + k * 22.6; pen.line(x, top - 12, x + 22, top - 50, { w: 0.6, a: 0.7 }); pen.line(x + 22, top - 54, x, top - 90, { w: 0.6, a: 0.7 }); }
  // dome and vane
  wash(ctx, rnd, dome, WASH.umber, { a: 0.3, edgeW: 3 });
  pen.stroke([[cx - 42, top - 90], [cx - 30, top - 140], [cx, top - 158], [cx + 30, top - 140], [cx + 42, top - 90]], { w: 2 });
  pen.line(cx - 44, top - 91, cx + 44, top - 91, { w: 1.6 });
  pen.hatch([cx, top - 158, cx + 42, top - 90], { gap: 3.4, run: [10, 30], w: 0.9, clip: dome, dens: (x) => clamp((x - cx) / 30, 0, 1) });
  pen.line(cx, top - 158, cx, top - 192, { w: 1.4 });
  pen.arc(cx, top - 166, 5, 5, 0, 6.5, { w: 1.2 });
  pen.poly([[cx, top - 190], [cx + 20, top - 185], [cx, top - 180]], { w: 1, open: true });
  // ground
  pen.line(8, base + 1, w - 10, base + 1, { w: 1.3, wob: 0.9 });
  for (let i = 0; i < 12; i++) pen.line(cx + bw + rnd.range(-6, 8), base - rnd.range(0, 5), cx + bw + rnd.range(30, 110), base - rnd.range(0, 4), { w: 0.8, wob: 0.4 });
  return { canvas: S.finish(), w, h };
}

// ---- boat ----------------------------------------------------------------

export function drawBoat(o = {}) {
  const w = 300, h = 280;
  const S = makeSheet(w, h, o.seed ?? 1, o.tone ?? 'pale');
  const { ctx, rnd } = S;
  const wl = h - 30;
  const hull = [[36, wl - 26], [70, wl - 2], [214, wl - 2], [262, wl - 44], [236, wl - 40], [222, wl - 26], [80, wl - 24], [58, wl - 34]];
  const mast = [150, wl - 24, 150, 26];
  const sail = [[96, 60], [202, 52], [214, 150], [90, 156]];
  const jib = [[226, 76], [270, 150], [226, 150]];
  S.paper(P(grow(hull, 5))); S.paper(P(grow(sail, 4))); S.paper(P(grow(jib, 4)));
  S.paper((c) => { c.rect(145, 20, 10, wl - 40); c.rect(20, wl - 6, w - 40, 22); c.rect(150, 20, 34, 16); });
  const pen = S.ink({ edge: { blur: 2.5, a: 0.24 } });
  wash(ctx, rnd, ragged(hull.map((p) => [p[0] + 2, p[1] + 3]), rnd, 4, 2), WASH.roof, { a: 0.42, edgeW: 3 });
  wash(ctx, rnd, ragged(sail.map((p) => [p[0] + 3, p[1] + 2]), rnd, 6, 2), WASH.ochre, { a: 0.16, edgeW: 3 });
  pen.stroke([hull[0], hull[1], hull[2], hull[3]], { w: 2, smooth: false });
  pen.stroke([hull[3], hull[4], hull[5], hull[6], hull[7], hull[0]], { w: 1.4, smooth: false });
  pen.hatch(bbox(hull), { gap: 3.4, run: [14, 50], w: 0.9, clip: P(hull), angle: 0.12 });
  pen.line(mast[0], mast[1], mast[2], mast[3], { w: 1.8 });
  pen.stroke([sail[0], [150, 50], sail[1]], { w: 1.5 });
  pen.stroke([sail[1], [222, 104], sail[2]], { w: 1.6 });
  pen.stroke([sail[2], [152, 166], sail[3]], { w: 1.4 });
  pen.stroke([sail[3], [86, 108], sail[0]], { w: 1.2 });
  pen.hatch(bbox(sail), { gap: 5, run: [16, 44], w: 0.8, clip: P(sail), dens: (x) => clamp((x - 140) / 70, 0, 1) });
  pen.poly(jib, { w: 1.2 });
  pen.line(150, 26, 262, wl - 44, { w: 0.7 });
  pen.line(150, 26, 40, wl - 28, { w: 0.7 });
  pen.stroke([[150, 24], [168, 20], [182, 28]], { w: 1.1 });
  // water marks under the hull
  for (let i = 0; i < 9; i++) { const x = rnd.range(24, w - 80), yy = wl + rnd.range(2, 12); pen.stroke([[x, yy], [x + 14, yy - 2], [x + 30, yy + 1], [x + rnd.range(40, 60), yy - 1]], { w: 0.8, wob: 0.4 }); }
  return { canvas: S.finish(), w, h };
}

export const gallery = () => [
  ['cottage', drawHouse({ seed: 11, kind: 'cottage' }).canvas],
  ['town', drawHouse({ seed: 12, kind: 'town' }).canvas],
  ['long', drawHouse({ seed: 13, kind: 'long' }).canvas],
  ['tower', drawHouse({ seed: 14, kind: 'tower' }).canvas],
  ['church', drawChurch({ seed: 21 }).canvas],
  ['row', drawTownRow({ seed: 31 }).canvas],
  ['bridge', drawBridge({ seed: 41 }).canvas],
  ['mill', drawMill({ seed: 51 }).canvas],
  ['sails', drawSails({ seed: 52 }).canvas],
  ['lighthouse', drawLighthouse({ seed: 61 }).canvas],
  ['boat', drawBoat({ seed: 71 }).canvas],
];
