// The ground is one big sheet lying flat: an explorer's map of the valley,
// drawn like the old chart in the references. Water is a blue-grey wash that
// pools along the shore, fields are ruled in ink, the forest is pencil.

import { makeRng, clamp, lerp } from './rng.js';
import { canvas, papers, ageSheet } from './paper.js';
import { Pen, WASH, GREENINK, wash, smoothPts, pencilLayer, applyTooth, layPencil } from './ink.js';
import { ragged } from './scenery.js';
import { WORLD, RIVER, RIVER_WIDTH, COAST, TOWN, BRIDGE, MILL, LIGHT, FALLS, FOREST, FIELDS, ROADS, HILLS, isWater, isSea } from '../layout.js';

export const GROUND_PX = 4096;
const N = GROUND_PX, K = N / (WORLD.half * 2);
const px = (x) => (x + WORLD.half) * K;
const P2 = (p) => [px(p[0]), px(p[1])];
const path = (pts, close = true) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (close) c.closePath(); };

function riverBanks() {
  const mid = smoothPts(RIVER.map(P2), 8);
  const n = mid.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = mid[Math.max(0, i - 1)], b = mid[Math.min(n - 1, i + 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d;
    const f = (i / (n - 1)) * (RIVER_WIDTH.length - 1), k = Math.min(RIVER_WIDTH.length - 2, Math.floor(f));
    const w = lerp(RIVER_WIDTH[k], RIVER_WIDTH[k + 1], f - k) * K * 0.5 * (1 + 0.16 * Math.sin(i * 0.7));
    L.push([mid[i][0] + nx * w, mid[i][1] + ny * w]);
    R.push([mid[i][0] - nx * w, mid[i][1] - ny * w]);
  }
  return { mid, L, R };
}

export function drawGround() {
  const c = canvas(N, N), ctx = c.getContext('2d');
  const rnd = makeRng(9001);
  ctx.fillStyle = ctx.createPattern(papers().warm, 'repeat');
  ctx.fillRect(0, 0, N, N);
  ageSheet(ctx, N, N, rnd, { blotches: 26, stains: 9, fox: 500, foxScale: 1.6 });

  const pen = new Pen(ctx, rnd, { k: 1.5 });
  const fine = new Pen(ctx, rnd, { k: 1.1 });
  ctx.globalCompositeOperation = 'multiply';

  // ---- water ------------------------------------------------------------
  const coast = smoothPts(COAST.map(P2), 10);
  const seaPts = coast.concat([[N + 40, N + 40], [N + 40, -40]]);
  const sea = path(seaPts);
  const { mid, L, R } = riverBanks();
  const river = path(L.concat(R.slice().reverse()));

  // sea: a flat wash, then the darker pooling against the shore
  // one mask for all water, so the river mouth does not wash twice
  {
    const m = canvas(N, N), mc = m.getContext('2d');
    mc.fillStyle = `rgb(${WASH.water.join(',')})`;
    mc.beginPath(); sea(mc); mc.fill();
    mc.beginPath(); river(mc); mc.fill();
    ctx.save(); ctx.globalAlpha = 0.36; ctx.drawImage(m, 0, 0); ctx.restore();
    m.width = m.height = 1;
  }
  wash(ctx, rnd, sea, WASH.water, { a: 0.06, edge: 0, box: [px(480), 0, N, N], blots: 22 });
  ctx.save(); ctx.beginPath(); sea(ctx); river(ctx); ctx.clip();
  ctx.lineJoin = 'round';
  for (const [wd, bl, a] of [[150, 46, 0.1], [60, 16, 0.16], [16, 4, 0.26]]) {
    ctx.filter = `blur(${bl}px)`; ctx.lineWidth = wd; ctx.strokeStyle = `rgba(50,118,140,${a * 1.2})`;
    ctx.beginPath(); path(coast, false)(ctx); ctx.stroke();
  }
  for (const [wd, bl, a] of [[26, 7, 0.2], [8, 2, 0.3]]) {
    ctx.filter = `blur(${bl}px)`; ctx.lineWidth = wd; ctx.strokeStyle = `rgba(50,118,140,${a * 1.2})`;
    for (const bank of [L, R]) { ctx.beginPath(); path(bank, false)(ctx); ctx.stroke(); }
  }
  ctx.filter = 'none';
  // shore lining: thin lines that echo the coast out into the water
  for (const off of [14, 30, 52, 82]) {
    const line = coast.map((p, i) => {
      const a = coast[Math.max(0, i - 1)], b = coast[Math.min(coast.length - 1, i + 1)];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [p[0] + ((b[1] - a[1]) / d) * off * -1, p[1] + ((b[0] - a[0]) / d) * off];
    });
    fine.broken(line.filter((_, i) => i % 3 === 0), { w: 1.1 - off * 0.006, run: [40, 190], gap: [10, 90 + off], skip: 0.1 + off * 0.004, a: 0.75 });
  }
  // open water: scattered ripple marks
  for (let i = 0; i < 1500; i++) {
    const x = rnd.range(480, 800), z = rnd.range(-800, 800);
    if (!isSea(x - 14, z)) continue;
    const X = px(x), Y = px(z), w = rnd.range(16, 60);
    fine.stroke([[X, Y], [X + w * 0.3, Y - 3], [X + w * 0.6, Y + 2], [X + w, Y - 1]], { w: rnd.range(1, 1.8), wob: 0.5, a: rnd.range(0.4, 0.8) });
  }
  // the river's current
  for (let pass = 0; pass < 4; pass++) for (let i = 2; i < mid.length - 6; i += rnd.int(2, 6)) {
    const k = rnd.bell() * 0.7;
    const seg = mid.slice(i, i + rnd.int(4, 10)).map((p, j) => [lerp(p[0], (k > 0 ? L : R)[i + j][0], Math.abs(k)) + rnd.bell() * 3, lerp(p[1], (k > 0 ? L : R)[i + j][1], Math.abs(k)) + rnd.bell() * 3]);
    fine.stroke(seg, { w: rnd.range(1, 1.7), wob: 0.6, a: rnd.range(0.4, 0.75) });
  }
  ctx.restore();

  // highlights: a few strokes of white body colour where the light catches
  ctx.save(); ctx.beginPath(); sea(ctx); river(ctx); ctx.clip();
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const x = rnd.range(480, 800), z = rnd.range(-800, 800);
    if (!isSea(x - 18, z)) continue;
    const X = px(x), Y = px(z), wl = rnd.range(14, 50);
    ctx.strokeStyle = `rgba(253,250,242,${rnd.range(0.45, 0.85)})`; ctx.lineWidth = rnd.range(1.6, 3.4);
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.quadraticCurveTo(X + wl * 0.5, Y - rnd.range(1, 4), X + wl, Y + rnd.range(-1, 2)); ctx.stroke();
  }
  for (let i = 4; i < mid.length - 5; i += rnd.int(2, 4)) {
    if (rnd.chance(0.4)) continue;
    const a = mid[i], b = mid[i + 2], o2 = rnd.bell() * 9;
    ctx.strokeStyle = `rgba(253,250,242,${rnd.range(0.5, 0.85)})`; ctx.lineWidth = rnd.range(1.6, 3.2);
    ctx.beginPath(); ctx.moveTo(a[0] + o2, a[1] + o2 * 0.4); ctx.lineTo(b[0] + o2, b[1] + o2 * 0.4); ctx.stroke();
  }
  ctx.restore();

  // banks and coast in pen
  pen.broken(coast.filter((_, i) => i % 2 === 0), { w: 1.8, run: [50, 180], gap: [-10, 12], lift: 1.5 });
  for (const bank of [L, R]) pen.broken(bank.filter((_, i) => i % 2 === 0), { w: 1.5, run: [40, 150], gap: [-8, 14], lift: 1.2 });
  // sand: stipple just inland of the shore
  for (let i = 0; i < 2600; i++) {
    const p = rnd.pick(coast), d = rnd.range(3, 44) * (rnd() ** 1.5 + 0.15);
    fine.dot(p[0] - d + rnd.bell() * 8, p[1] + rnd.bell() * 16, rnd.range(0.7, 1.5), 0.55);
  }

  // a strip of wheat-coloured sand behind the shore
  wash(ctx, rnd, path(coast.concat(coast.slice().reverse().map((q) => [q[0] - rnd.range(24, 60), q[1]]))), WASH.ochre, { a: 0.2, edge: 0.3, edgeW: 5 });

  // ---- meadow: pale sage in loose patches, with plenty of paper left bare --
  {
    const Lm = canvas(N, N), lm = Lm.getContext('2d'), mr = makeRng(9101);
    for (let i = 0; i < 46; i++) {
      const x = mr.range(-770, 640), z = mr.range(-770, 770), r = mr.range(40, 130);
      const pts = [], n = 9;
      for (let k = 0; k < n; k++) { const an = (k / n) * 6.283; pts.push([px(x + Math.cos(an) * r * mr.range(0.7, 1.3) * 1.35), px(z + Math.sin(an) * r * mr.range(0.6, 1.1))]); }
      wash(lm, mr, ragged(pts, mr, 40), mr.pick([WASH.meadow, WASH.meadow, WASH.sage, WASH.sage]), { a: mr.range(0.17, 0.29), edge: 0.6, edgeW: 7 });
    }
    // keep it off the water
    lm.globalCompositeOperation = 'destination-out'; lm.fillStyle = '#000';
    lm.beginPath(); sea(lm); lm.fill(); lm.beginPath(); river(lm); lm.fill();
    lm.lineWidth = 10; lm.lineJoin = 'round'; lm.beginPath(); river(lm); lm.stroke();
    ctx.drawImage(Lm, 0, 0);
    Lm.width = Lm.height = 1;
  }

  // ---- fields -----------------------------------------------------------
  for (const [cx, cz, fw, fd, rot] of FIELDS) {
    const strips = rnd.int(3, 6), cr = Math.cos(rot), sr = Math.sin(rot);
    const W2 = (u, v) => [px(cx + u * cr - v * sr), px(cz + u * sr + v * cr)];
    let v0 = -fd / 2;
    for (let s = 0; s < strips; s++) {
      const v1 = s === strips - 1 ? fd / 2 : v0 + (fd / strips) * rnd.range(0.7, 1.3);
      const cu = rnd.range(-0.1, 0.1) * fw;
      const mx = cx + cu * cr - ((v0 + v1) / 2) * sr, mz = cz + cu * sr + ((v0 + v1) / 2) * cr;
      if (!isWater(mx, mz)) {
        const u0 = -fw / 2 + rnd.range(0, 0.12) * fw, u1 = fw / 2 - rnd.range(0, 0.12) * fw;
        const q = [W2(u0, v0 + 1.5), W2(u1, v0 + 1.5), W2(u1, v1 - 1.5), W2(u0, v1 - 1.5)];
        const col = rnd.pick([WASH.ochre, WASH.sage, WASH.olive, WASH.ochre, WASH.meadow, null]);
        if (col) wash(ctx, rnd, ragged(q.map((p) => [p[0] + rnd.range(-6, 6), p[1] + rnd.range(-6, 6)]), rnd, 12), col, { a: rnd.range(0.18, 0.3), edgeW: 6 });
        const b = [Math.min(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[0])), Math.max(...q.map((p) => p[1]))];
        const style = rnd();
        if (style < 0.8) pen.hatch(b, { angle: rot + (rnd.chance(0.75) ? 0 : Math.PI / 2) + rnd.bell() * 0.03, gap: rnd.range(8, 15), run: [60, 260], rest: [6, 40], w: 1.1, wob: 1, clip: path(q), a: 0.8 });
        else for (let k = 0; k < 60; k++) { const p = W2(rnd.range(u0, u1), rnd.range(v0, v1)); fine.arc(p[0], p[1], 4, 3, 3, 6.6, { w: 1 }); }
        // hedge along the strip
        const e = [W2(u0, v1), W2(u1, v1)];
        pen.broken([e[0], [(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2], e[1]], { w: 1.5, run: [30, 110], gap: [4, 30], skip: 0.12 });
        for (let k = 0; k < 6; k++) { const t = rnd(); pen.lobe(lerp(e[0][0], e[1][0], t), lerp(e[0][1], e[1][1], t), rnd.range(7, 13), rnd.range(5, 9), { w: 1.1, bump: 6, loops: 0, shade: 0.9, hgap: 3 }); }
      }
      v0 = v1;
    }
  }

  // ---- roads ------------------------------------------------------------
  for (const road of ROADS) {
    const pts = smoothPts(road.map(P2), 8);
    const off = (d) => pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [p[0] - ((b[1] - a[1]) / l) * d, p[1] + ((b[0] - a[0]) / l) * d];
    }).filter((_, i) => i % 3 === 0);
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(238,224,192,0.7)'; ctx.lineWidth = 11; ctx.lineJoin = 'round';
    ctx.beginPath(); path(pts, false)(ctx); ctx.stroke(); ctx.restore();
    pen.broken(off(6), { w: 1.3, run: [40, 160], gap: [-6, 18], skip: 0.06 });
    pen.broken(off(-6), { w: 1.3, run: [20, 70], gap: [8, 30], skip: 0.15 });
  }

  // ---- hills: hachures where the land rises -----------------------------
  for (const [hx, hz, hw, hh, face] of HILLS) {
    // the mass of the hill lies behind its sheet
    const ca = Math.cos(face), sa = Math.sin(face);
    const cx = px(hx - sa * hw * 0.12), cy = px(hz - ca * hw * 0.12), rx = hw * 0.48 * K, ry = hw * 0.2 * K;
    for (let ring = 0; ring < 3; ring++) {
      const n = Math.round((rx + ry) * (0.3 - ring * 0.06));
      for (let i = 0; i < n; i++) {
        const a0 = rnd() * 6.283, k = 1 - ring * 0.26 + rnd.bell() * 0.05;
        const lx = Math.cos(a0) * rx * k, ly = Math.sin(a0) * ry * k;
        const ex = cx + lx * ca + ly * sa, ey = cy - lx * sa + ly * ca;
        const a = Math.atan2(ey - cy, ex - cx);
        if (isWater(ex / K - WORLD.half, ey / K - WORLD.half)) continue;
        const len = rnd.range(12, 30) * (1 + hh / 120), shade = Math.cos(a - 0.6) > 0 ? 1.25 : 0.75;
        pen.stroke([[ex, ey], [ex + Math.cos(a) * len, ey + Math.sin(a) * len * 0.8]], { w: 1.15 * shade, wob: 0.4, t0: 0.02, t1: 0.7, a: rnd.chance(0.2) ? 0.5 : 0.85 });
      }
    }
  }
  // the mountains close the map on three sides: heavier hachures toward the edge
  for (let i = 0; i < 5200; i++) {
    const a = rnd() * 6.283, r = rnd.range(700, 800);
    const x = Math.cos(a) * r * 1.12, z = Math.sin(a) * r * 1.12;
    if (Math.abs(x) > 795 || Math.abs(z) > 795 || isWater(x, z) || x > 380) continue;
    const X = px(x), Y = px(z), len = rnd.range(14, 44);
    pen.stroke([[X, Y], [X + Math.cos(a) * len, Y + Math.sin(a) * len]], { w: rnd.range(0.9, 1.6), wob: 0.4, t0: 0.02, t1: 0.7 });
  }

  // ---- town plan --------------------------------------------------------
  {
    const tx = px(TOWN.x), tz = px(TOWN.z);
    for (let i = 0; i < 150; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 150;
      const x = TOWN.x + Math.cos(a) * r * 1.1, z = TOWN.z + Math.sin(a) * r * 0.8;
      if (isWater(x, z) || (Math.abs(z - BRIDGE.z) < 9 && Math.abs(x - TOWN.x) < 70)) continue;
      const w = rnd.range(6, 13) * K, d = rnd.range(5, 9) * K, rot = rnd.pick([0, 0, 0.2, -0.3, 1.5]);
      const X = px(x), Y = px(z), cr = Math.cos(rot), sr = Math.sin(rot);
      const q = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [X + u * cr - v * sr, Y + u * sr + v * cr]);
      if (rnd.chance(0.5)) wash(ctx, rnd, path(q), WASH.roof, { a: 0.2, edge: 0.4, edgeW: 3 });
      fine.poly(q, { w: 1.2, over: 2 });
      fine.hatch([X - w, Y - w, X + w, Y + w], { gap: 3.4, run: [8, 24], w: 0.9, clip: path(q), dens: () => 0.7 });
    }
    // the square by the bridge
    for (let i = 0; i < 260; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 26 * K; fine.dot(tx - 46 * K + Math.cos(a) * r, tz + 20 * K + Math.sin(a) * r * 0.8, rnd.range(0.8, 1.6), 0.5); }
    // bridge in plan
    const bx0 = px(BRIDGE.x - BRIDGE.len / 2), bx1 = px(BRIDGE.x + BRIDGE.len / 2), bz = px(BRIDGE.z - BRIDGE.depth / 2);
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(236,222,190,0.92)'; ctx.fillRect(bx0, bz - 2, bx1 - bx0, BRIDGE.depth * K + 4); ctx.restore();
    pen.line(bx0, bz - 2, bx1, bz - 2, { w: 1.6 }); pen.line(bx0, bz + BRIDGE.depth * K + 2, bx1, bz + BRIDGE.depth * K + 2, { w: 1.8 });
  }

  // ---- forest floor: green wash, then green ink --------------------------
  {
    for (let i = 0; i < 30; i++) {
      const an = rnd() * 6.283, r = Math.sqrt(rnd()) * 0.95, rr = rnd.range(26, 70);
      const x = FOREST.x + Math.cos(an) * r * FOREST.rx, z = FOREST.z + Math.sin(an) * r * FOREST.rz;
      if (isWater(x, z)) continue;
      const pts = [];
      for (let k = 0; k < 8; k++) { const b2 = (k / 8) * 6.283; pts.push([px(x + Math.cos(b2) * rr * rnd.range(0.7, 1.3)), px(z + Math.sin(b2) * rr * rnd.range(0.6, 1.1))]); }
      wash(ctx, rnd, ragged(pts, rnd, 24), rnd.pick([WASH.pine, WASH.sage, WASH.sage]), { a: rnd.range(0.16, 0.26), edge: 0.5, edgeW: 6 });
    }
    const fx0 = px(FOREST.x - FOREST.rx * 1.2), fz0 = px(FOREST.z - FOREST.rz * 1.2), fw = FOREST.rx * 2.4 * K, fh = FOREST.rz * 2.4 * K;
    const Lr = pencilLayer(Math.ceil(fw), Math.ceil(fh));
    const pc = new Pen(Lr.ctx, rnd, { pal: GREENINK, pencil: true, k: 1.3 });
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * 6.283, r = Math.pow(rnd(), 0.6);
      const u = Math.cos(a) * r, v = Math.sin(a) * r;
      const x = FOREST.x + u * FOREST.rx * 1.1, z = FOREST.z + v * FOREST.rz * 1.1;
      if (isWater(x, z)) continue;
      const X = px(x) - fx0, Y = px(z) - fz0, s = rnd.range(7, 15);
      pc.lobe(X, Y, s, s * 0.8, { w: 1.1, bump: 5, shade: 0, loops: 0, skip: 0.25 });
      pc.scribble(X - s * 0.2, Y - s * 0.1, s * 1.2, s * 0.9, { gap: 3, w: 1.1, press: rnd.range(0.45, 0.95) });
    }
    applyTooth(Lr, 0.5);
    ctx.save(); ctx.translate(fx0, fz0); layPencil(ctx, Lr, { smudge: 0.5, blur: 9 }); ctx.restore();
    ctx.globalCompositeOperation = 'multiply';
  }

  // ---- map furniture ----------------------------------------------------
  // compass rose out in the bay, with rhumb lines that stay in the water
  {
    const cx = px(700), cy = px(610), R0 = 150;
    ctx.save(); ctx.beginPath(); sea(ctx); ctx.clip();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 6.283;
      fine.line(cx + Math.cos(a) * R0 * 0.5, cy + Math.sin(a) * R0 * 0.5, cx + Math.cos(a) * 2400, cy + Math.sin(a) * 2400, { w: 0.9, wob: 0.2, a: 0.42, t0: 0, t1: 0.2, loadLen: 90000 });
    }
    ctx.restore();
    pen.arc(cx, cy, R0, R0, 0, 6.5, { w: 1.5 }); pen.arc(cx, cy, R0 * 0.86, R0 * 0.86, 0, 6.5, { w: 0.9 }); pen.arc(cx, cy, R0 * 0.3, R0 * 0.3, 0, 6.5, { w: 1.1 });
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 6.283 - Math.PI / 2, long = k % 4 === 0 ? 1 : k % 2 === 0 ? 0.74 : 0.5;
      const tip = [cx + Math.cos(a) * R0 * long, cy + Math.sin(a) * R0 * long];
      const l = [cx + Math.cos(a - 0.2) * R0 * 0.2, cy + Math.sin(a - 0.2) * R0 * 0.2], r = [cx + Math.cos(a + 0.2) * R0 * 0.2, cy + Math.sin(a + 0.2) * R0 * 0.2];
      pen.poly([l, tip, r], { w: 1.2, open: true, over: 1 });
      pen.hatch([cx - R0, cy - R0, cx + R0, cy + R0], { gap: 3.2, run: [10, 40], w: 0.9, clip: path([[cx, cy], tip, r]) });
      if (k % 4 === 0) wash(ctx, rnd, path([[cx, cy], tip, l]), k === 0 ? WASH.roof : WASH.ochre, { a: 0.3, edge: 0.3, edgeW: 3 });
    }
    for (let k = 0; k < 64; k++) { const a = (k / 64) * 6.283; fine.line(cx + Math.cos(a) * R0 * 0.86, cy + Math.sin(a) * R0 * 0.86, cx + Math.cos(a) * R0, cy + Math.sin(a) * R0, { w: 0.8, wob: 0.1 }); }
  }
  // neatline with ticks
  for (const m of [70, 92]) pen.poly([[m, m], [N - m, m], [N - m, N - m], [m, N - m]], { w: m === 70 ? 2.2 : 1, over: 8 });
  for (let t = 92; t < N - 92; t += 64) for (const [x0, y0, x1, y1] of [[t, 70, t, 92], [t, N - 92, t, N - 70], [70, t, 92, t], [N - 92, t, N - 70, t]]) fine.line(x0, y0, x1, y1, { w: 0.9, wob: 0.1 });
  // a scale bar, unlabelled
  {
    const sx = px(-720), sy = px(700);
    for (let i = 0; i < 6; i++) {
      const q = [[sx + i * 60, sy], [sx + (i + 1) * 60, sy], [sx + (i + 1) * 60, sy + 16], [sx + i * 60, sy + 16]];
      fine.poly(q, { w: 1.1, over: 1 });
      if (i % 2 === 0) fine.hatch([q[0][0], sy, q[1][0], sy + 16], { gap: 2.6, run: [8, 22], w: 0.9, clip: path(q) });
    }
  }
  // asemic place names, the way the old chart labels its villages
  const label = new Pen(ctx, rnd, { k: 1.2 });
  for (const [x, z, w, lines, size] of [
    [TOWN.x + 90, TOWN.z + 70, 260, 1, 13], [MILL.x - 30, MILL.z + 48, 170, 1, 10], [LIGHT.x - 150, LIGHT.z + 60, 190, 1, 10],
    [FOREST.x - 60, FOREST.z + 160, 230, 1, 11], [FALLS.x + 60, FALLS.z + 100, 170, 1, 9], [660, -40, 300, 2, 15],
    [-690, 560, 330, 7, 9], [-700, -720, 300, 5, 8], [300, 690, 260, 3, 8],
  ]) label.script(px(x), px(z), w, lines, { size, lh: size * 2.6, w: 1.2 + size * 0.03, a: lines > 2 ? 0.55 : 0.85 });
  // little red-brown dots for the settlements
  for (const [x, z] of [[TOWN.x - 60, TOWN.z + 30], [MILL.x, MILL.z + 12], [LIGHT.x - 20, LIGHT.z + 20]]) {
    ctx.fillStyle = 'rgba(160,74,84,0.55)'; ctx.beginPath(); ctx.arc(px(x), px(z), 9, 0, 7); ctx.fill();
    fine.arc(px(x), px(z), 13, 13, 0, 6.5, { w: 1 });
  }

  // ---- the sheet itself: folds, late foxing ------------------------------
  ctx.globalCompositeOperation = 'source-over';
  for (const [x0, y0, x1, y1] of [[N * 0.493, 0, N * 0.507, N], [0, N * 0.512, N, N * 0.5]]) {
    ctx.strokeStyle = 'rgba(120,88,48,0.2)'; ctx.lineWidth = 3; ctx.filter = 'blur(2px)';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,248,228,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0 + 4, y0 + 4); ctx.lineTo(x1 + 4, y1 + 4); ctx.stroke();
    ctx.filter = 'none';
  }
  ageSheet(ctx, N, N, rnd, { blotches: 6, stains: 3, fox: 160, foxScale: 1.3 });
  return c;
}

// What lies beyond the map: plain paper, with the sea carried on to the horizon.
export function drawFarGround(span = 7200) {
  const n = 1024, c = canvas(n, n), ctx = c.getContext('2d');
  const rnd = makeRng(9002), k = n / span, q = (v) => (v + span / 2) * k;
  ctx.fillStyle = ctx.createPattern(papers().warm, 'repeat');
  ctx.fillRect(0, 0, n, n);
  const pts = [[430, -span / 2], ...COAST, [640, span / 2], [span / 2, span / 2], [span / 2, -span / 2]].map((p) => [q(p[0]), q(p[1])]);
  wash(ctx, rnd, path(pts), WASH.water, { a: 0.4, edge: 0, box: [q(400), 0, n, n], blots: 6 });
  for (let i = 0; i < 40; i++) {
    const x = rnd.range(-3400, 300), z = rnd.range(-3400, 3400), r = rnd.range(160, 520);
    if (Math.abs(x) < 780 && Math.abs(z) < 780) continue;
    const pp = [];
    for (let k = 0; k < 8; k++) { const an = (k / 8) * 6.283; pp.push([q(x + Math.cos(an) * r * rnd.range(0.7, 1.3)), q(z + Math.sin(an) * r * rnd.range(0.6, 1.2))]); }
    wash(ctx, rnd, ragged(pp, rnd, 8), rnd.pick([WASH.meadow, WASH.sage]), { a: rnd.range(0.1, 0.18), edge: 0.4, edgeW: 3 });
  }
  ageSheet(ctx, n, n, rnd, { blotches: 10, stains: 0, fox: 0 });
  return c;
}

// Fine marks that repeat across the ground so it stays crisp when you fly low.
export function drawGroundDetail() {
  const n = 512, c = canvas(n, n), ctx = c.getContext('2d');
  const rnd = makeRng(9003);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, n, n);
  const g = papers().warm;
  ctx.globalCompositeOperation = 'luminosity'; ctx.globalAlpha = 0.9; ctx.drawImage(g, 0, 0); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'multiply';
  const pen = new Pen(ctx, rnd, { k: 1 });
  const wrap = (fn) => { for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore(); } };
  for (let i = 0; i < 90; i++) {
    const x = rnd() * n, y = rnd() * n, len = rnd.range(5, 14), seed = rnd.fork();
    wrap(() => { const p = new Pen(ctx, makeRng(Math.floor(seed() * 1e9)), { k: 1 }); p.stroke([[x, y], [x + rnd.range(-2, 3), y - len]], { w: 1.1, wob: 0.2, a: 0.5, t0: 0, t1: 0.7 }); });
  }
  void pen;
  return c;
}

export const gallery = () => {
  const g = drawGround();
  const small = canvas(1700, 1700);
  small.getContext('2d').drawImage(g, 0, 0, 1700, 1700);
  const crop = canvas(1700, 1100);
  crop.getContext('2d').drawImage(g, 1500, 1500, 1700, 1100, 0, 0, 1700, 1100);
  return [['ground', small], ['ground detail 1:1', crop]];
};
