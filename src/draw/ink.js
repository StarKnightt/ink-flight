// The hand. A Pen draws tapered, slightly wandering strokes whose darkness
// follows how much ink is left on the nib, so marks arrive in runs that start
// dark and fade until the next dip, the way the reference drawings do.

import { noise1, clamp, lerp } from './rng.js';
import { canvas, rgba, papers } from './paper.js';

export const INK = { dark: [52, 31, 14], mid: [98, 62, 30], light: [152, 114, 70] };
export const GRAPHITE = { dark: [58, 56, 54], mid: [92, 89, 85], light: [140, 136, 128] };

export const GREENINK = { dark: [34, 57, 46], mid: [60, 90, 70], light: [108, 132, 106] };

// The paintbox. Washes are multiplied over yellow paper, which eats blue, so
// the sky pigments are stronger on their own than they look once laid down.
// See docs/art-direction.md for what each one is for.
export const WASH = {
  sepia: [150, 112, 70],
  umber: [116, 84, 50],
  sky: [96, 150, 236],        // high sky; settles to a soft grey-blue on the paper
  skyDeep: [78, 128, 222],
  gold: [255, 196, 70],       // the sun
  haze: [128, 158, 196],      // far mountains
  shade: [118, 134, 176],     // the side away from the sun
  water: [84, 156, 170],      // river and sea
  deep: [50, 118, 140],       // where it pools at the shore
  sage: [140, 160, 104],
  olive: [130, 132, 62],
  meadow: [170, 186, 112],
  pine: [48, 88, 68],
  ochre: [222, 178, 80],      // wheat
  roof: [190, 94, 54],        // terracotta
  rose: [176, 104, 96],
  shutter: [96, 142, 180],    // faded blue paint
  cream: [252, 243, 220],     // body colour for walls, lighter than the paper
  white: [253, 250, 242],     // body colour for clouds and water highlights
};
// older names used through the drawings
WASH.green = WASH.sage; WASH.slate = WASH.shade; WASH.grey = WASH.shade;

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Catmull-Rom through the points, so a handful of control points become a curve.
export function smoothPts(pts, per = 6) {
  if (pts.length < 3) return pts;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export class Pen {
  constructor(ctx, rnd, o = {}) {
    this.ctx = ctx;
    this.r = rnd;
    this.pal = o.pal || INK;
    this.k = (o.k ?? 1) * (o.bold ?? Pen.bold);   // weight multiplier for the whole drawing
    this.fade = o.fade ?? 0;   // 0 near .. 1 far: thinner and paler
    this.wobK = o.wob ?? 1;
    this.pencil = !!o.pencil;
    this.load = 1;
  }

  dip() { this.load = this.r.range(0.85, 1); }

  // pts: [[x,y],...]. Options: w width, wob wander, a alpha, t0/t1 taper
  // lengths as a fraction of the stroke, smooth=false to keep corners.
  stroke(pts, o = {}) {
    const ctx = this.ctx, r = this.r;
    if (pts.length < 2) return;
    const P = o.smooth === false || pts.length < 3 ? pts : smoothPts(pts, o.per ?? 6);
    const w = (o.w ?? 1.3) * this.k * (1 - 0.5 * this.fade);
    const wob = (o.wob ?? 1) * this.wobK * (0.45 + w * 0.35);

    // arc length
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const len = L[L.length - 1];
    if (len < 0.5) return;
    const step = clamp(w * 1.1, 1.4, 3.5);
    const n = Math.max(2, Math.ceil(len / step));
    const ph = r() * 1000, ph2 = r() * 1000;
    const t0 = o.t0 ?? 0.1, t1 = o.t1 ?? 0.38;

    const xs = new Float32Array(n + 1), ys = new Float32Array(n + 1), ws = new Float32Array(n + 1);
    let seg = 0;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * len;
      while (seg < P.length - 2 && L[seg + 1] < s) seg++;
      const a = P[seg], b = P[seg + 1];
      const sl = L[seg + 1] - L[seg] || 1;
      const f = (s - L[seg]) / sl;
      let x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f);
      const nx = -(b[1] - a[1]) / sl, ny = (b[0] - a[0]) / sl;
      const t = i / n;
      // wander fades in from the ends so strokes still land where aimed
      const pin = Math.min(1, t * 6, (1 - t) * 6);
      const off = (noise1(s * 0.03 + ph) + noise1(s * 0.13 + ph2) * 0.35) * wob * pin;
      x += nx * off; y += ny * off;
      xs[i] = x; ys[i] = y;
      let env = 1;
      if (t0 > 0 && t < t0) env = Math.min(env, 0.3 + 0.7 * Math.sin((t / t0) * 1.5708));
      if (t1 > 0 && t > 1 - t1) env = Math.min(env, Math.pow(Math.sin(((1 - t) / t1) * 1.5708), 0.8));
      ws[i] = Math.max(0.28, w * env * (0.85 + 0.28 * noise1(s * 0.09 + ph)));
    }

    // colour from ink load
    let col, alpha;
    if (this.pencil) {
      const p = o.press ?? r.range(0.55, 1);
      col = mix3(this.pal.light, this.pal.dark, p);
      alpha = (o.a ?? 1) * lerp(0.4, 0.82, p) * (1 - 0.45 * this.fade);
    } else {
      const ld = this.load;
      col = ld > 0.5 ? mix3(this.pal.mid, this.pal.dark, (ld - 0.5) * 2) : mix3(this.pal.light, this.pal.mid, ld * 2);
      col = mix3(col, this.pal.light, this.fade * 0.75);
      alpha = (o.a ?? 1) * lerp(0.5, 0.94, ld) * (1 - 0.5 * this.fade);
      this.load -= (len / (o.loadLen ?? 1100)) * r.range(0.5, 1.5) * (0.6 + w * 0.3);
      if (this.load < 0.16) this.dip();
    }

    // one filled ribbon per stroke: variable width with no beading at joints
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1);
      let dx = xs[i1] - xs[i0], dy = ys[i1] - ys[i0];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const h = ws[i] * 0.5;
      const px = xs[i] - dy * h, py = ys[i] + dx * h;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    for (let i = n; i >= 0; i--) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1);
      let dx = xs[i1] - xs[i0], dy = ys[i1] - ys[i0];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const h = ws[i] * 0.5;
      ctx.lineTo(xs[i] + dy * h, ys[i] - dx * h);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(o.col ?? col, alpha);
    ctx.fill();

    // a loaded nib sometimes leaves a blot where it touches down
    if (!this.pencil && this.load > 0.8 && w > 1 && r.chance(0.07)) {
      ctx.beginPath(); ctx.arc(xs[0], ys[0], w * r.range(0.6, 1.1), 0, 7); ctx.fill();
    }
  }

  // straight-ish line, optionally overshooting its ends like a quick ruling
  line(x1, y1, x2, y2, o = {}) {
    const over = o.over ?? 0;
    const d = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / d, uy = (y2 - y1) / d;
    const a = this.r.range(0.5, 1) * over, b = this.r.range(0.5, 1) * over;
    const bow = (o.bow ?? 0.012) * d * this.r.bell();
    this.stroke([
      [x1 - ux * a, y1 - uy * a],
      [(x1 + x2) / 2 - uy * bow, (y1 + y2) / 2 + ux * bow],
      [x2 + ux * b, y2 + uy * b],
    ], o);
  }

  // every edge drawn as its own stroke so corners cross, as in pen drawings
  poly(pts, o = {}) {
    const n = pts.length;
    for (let i = 0; i < (o.open ? n - 1 : n); i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      this.line(a[0], a[1], b[0], b[1], { over: 2.5, ...o });
    }
  }

  arc(cx, cy, rx, ry, a0, a1, o = {}) {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) / 9));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    this.stroke(pts, o);
  }

  // A long path drawn the way a pen really draws one: as overlapping shorter
  // strokes with small gaps and restarts, never one unbroken contour.
  broken(pts, o = {}) {
    const P = smoothPts(pts, 5);
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = L[L.length - 1];
    const run = o.run ?? [40, 130], gap = o.gap ?? [-10, 8];
    let s = 0, i = 0;
    while (s < total) {
      const e = Math.min(total, s + this.r.range(run[0], run[1]));
      const seg = [];
      while (i < P.length - 1 && L[i] < s) i++;
      let j = Math.max(0, i - 1);
      seg.push(P[j]);
      while (j < P.length - 1 && L[j] < e) { j++; seg.push(P[j]); }
      if (seg.length >= 2 && !(o.skip && this.r.chance(o.skip))) {
        const lift = (o.lift ?? 0.8) * this.r.bell();
        this.stroke(seg.map((p) => [p[0], p[1] + lift]), { ...o, smooth: false, w: (o.w ?? 1.3) * this.r.range(0.7, 1.25) });
      }
      s = e + this.r.range(gap[0], gap[1]);
      if (s <= e - (run[0] * 0.8)) s = e;
    }
  }

  // Parallel shading strokes in broken runs. `clip(ctx)` traces the region.
  // The default angle leans upper-left to lower-right like the references.
  hatch(box, o = {}) {
    const ctx = this.ctx, r = this.r;
    const [x0, y0, x1, y1] = box;
    const ang = o.angle ?? 0.96;
    const gap = o.gap ?? 5;
    const run = o.run ?? [18, 60];
    const rest = o.rest ?? [3, 14];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const R = Math.hypot(x1 - x0, y1 - y0) / 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    ctx.save();
    if (o.clip) { ctx.beginPath(); o.clip(ctx); ctx.clip(); }
    for (let d = -R; d < R; d += gap * r.range(0.6, 1.4)) {
      let s = -R + r() * run[1];
      while (s < R) {
        const len = r.range(run[0], run[1]);
        const ax = cx - dy * d + dx * s, ay = cy + dx * d + dy * s;
        const bx = ax + dx * len, by = ay + dy * len;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        if (mx > x0 - len && mx < x1 + len && my > y0 - len && my < y1 + len) {
          const dens = o.dens ? o.dens(mx, my) : 1;
          if (r() < dens) {
            const bow = (o.bow ?? 0.05) * len * r.bell();
            this.stroke([[ax, ay], [mx - dy * bow, my + dx * bow], [bx, by]], { w: o.w ?? 0.9, wob: o.wob ?? 0.7, a: o.a, t0: 0.08, t1: 0.5 });
          }
        }
        s += len + r.range(rest[0], rest[1]);
      }
    }
    ctx.restore();
  }

  // quick back-and-forth shading, the pencil's way of filling a tone
  scribble(x, y, w, h, o = {}) {
    const r = this.r;
    const ang = o.angle ?? -0.9;
    const gap = o.gap ?? 4;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const n = Math.max(2, Math.round(w / gap));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const bx = x + (i / n) * w + r.bell() * gap * 0.4;
      const top = i % 2 === 0;
      const hh = h * r.range(0.75, 1);
      pts.push([bx + (top ? dx : -dx) * hh * 0.5, y + h / 2 + (top ? dy : -dy) * hh * 0.5]);
    }
    this.ctx.save();
    if (o.clip) { this.ctx.beginPath(); o.clip(this.ctx); this.ctx.clip(); }
    this.stroke(pts, { w: o.w ?? 1, wob: 0.6, a: o.a, smooth: false, t0: 0.05, t1: 0.1, loadLen: 4000, press: o.press });
    this.ctx.restore();
  }

  dot(x, y, rad, a = 0.8) {
    const ctx = this.ctx;
    const col = this.pencil ? this.pal.mid : mix3(this.pal.mid, this.pal.dark, this.load);
    ctx.fillStyle = rgba(mix3(col, this.pal.light, this.fade * 0.7), a * (1 - 0.5 * this.fade));
    ctx.beginPath();
    ctx.ellipse(x, y, rad * this.r.range(0.8, 1.2), rad * this.r.range(0.7, 1.1), this.r() * 3, 0, 7);
    ctx.fill();
  }

  // Leonardo-style foliage lobe: comma strokes scalloping the lit edge,
  // slanted hatching in the shadow, a loop or two of scribble inside.
  lobe(cx, cy, rx, ry, o = {}) {
    const r = this.r, w = o.w ?? 1.1;
    const n = Math.max(4, Math.round((rx + ry) / (o.bump ?? 7)));
    const a0 = Math.PI * 0.95, a1 = Math.PI * 2.25;
    for (let i = 0; i < n; i++) {
      if (r.chance(o.skip ?? 0.12)) continue;
      const ta = lerp(a0, a1, i / n) + r.bell() * 0.08, tb = lerp(a0, a1, (i + 1) / n) + r.bell() * 0.1;
      const ax = cx + Math.cos(ta) * rx, ay = cy + Math.sin(ta) * ry;
      const bx = cx + Math.cos(tb) * rx, by = cy + Math.sin(tb) * ry;
      // a small round "c" bulging outward from the lobe
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      let nx = mx - cx, ny = my - cy;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const hx = (ax - mx), hy = (ay - my), rad = Math.hypot(hx, hy) * r.range(0.75, 1.15);
      const pts = [], a0s = r.range(-0.25, 0.1), a1s = Math.PI + r.range(-0.1, 0.35);
      for (let k = 0; k <= 6; k++) {
        const ph = lerp(a0s, a1s, k / 6);
        pts.push([mx + Math.cos(ph) * hx + Math.sin(ph) * nx * rad, my + Math.cos(ph) * hy + Math.sin(ph) * ny * rad]);
      }
      this.stroke(pts, { w: w * r.range(0.7, 1.2), wob: 0.35, t0: 0.12, t1: 0.3, per: 3 });
    }
    // shadow hatching, lower right
    if (o.shade !== 0) {
      this.hatch([cx - rx * 0.4, cy - ry * 0.35, cx + rx, cy + ry], {
        gap: o.hgap ?? 3.6, run: [rx * 0.35, rx * 0.9], w: w * 0.7, a: o.shade ?? 1,
        clip: (c) => c.ellipse(cx, cy, rx, ry, 0, 0, 7),
        dens: (x, y) => clamp(((x - cx) / rx + (y - cy) / ry) * 0.9 + 0.35, 0, 1),
      });
    }
    // a couple of loops
    const loops = o.loops ?? 2;
    for (let i = 0; i < loops; i++) {
      const lx = cx + r.bell() * rx * 0.55, ly = cy + r.bell() * ry * 0.5, lr = r.range(0.14, 0.3) * Math.min(rx, ry);
      this.arc(lx, ly, lr * 1.3, lr, r() * 6, r() * 6 + r.range(3.5, 5.5), { w: w * 0.65, wob: 0.4 });
    }
  }

  // Asemic handwriting: lines of looping marks that read as old notes from a
  // distance and as nothing at all up close. Slants and runs right-to-left.
  script(x, y, width, lines, o = {}) {
    const r = this.r, lh = o.lh ?? 15, sz = o.size ?? 5;
    for (let l = 0; l < lines; l++) {
      const by = y + l * lh + r.bell() * 1.2;
      let cx = x + width - r.range(0, width * 0.08);
      const end = x + (l === lines - 1 ? r.range(0.2, 0.7) * width : r.range(0, 0.08) * width);
      while (cx > end) {
        const wl = r.range(2.5, 9) * sz;
        const pts = [];
        let px = cx;
        const stepx = sz * 0.55;
        while (px > cx - wl) {
          const k = r();
          const up = k < 0.16 ? -sz * r.range(1.5, 2.4) : k > 0.9 ? sz * r.range(1, 1.8) : -sz * r.range(0.15, 0.9);
          pts.push([px + up * 0.25, by + up]);
          pts.push([px - stepx * 0.5 + r.bell(), by + r.bell() * sz * 0.12]);
          px -= stepx * r.range(0.8, 1.5);
        }
        if (pts.length > 2) this.stroke(pts, { w: o.w ?? 0.7, wob: 0.25, a: o.a ?? 0.8, t0: 0.05, t1: 0.15, per: 4, loadLen: 500 });
        cx -= wl + sz * r.range(0.9, 2);
      }
    }
  }
}

// Standing sheets are mostly seen from far off, so they are drawn bolder
// than a drawing meant to be read at arm's length.
Pen.bold = 1;

// ---- watercolour ---------------------------------------------------------

// A closed, hand-wobbled outline through the given points.
export function blobPath(pts, rnd, jit = 0) {
  const P = pts.map((p) => [p[0] + (jit ? rnd.bell() * jit : 0), p[1] + (jit ? rnd.bell() * jit : 0)]);
  return (ctx) => {
    const n = P.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = mid(P[n - 1], P[0]);
    ctx.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(P[i], P[(i + 1) % n]);
      ctx.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]);
    }
    ctx.closePath();
  };
}

export function polyPath(pts) {
  return (ctx) => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
}

// A flat wash that pools darker at its wet edge and granulates a little.
// Pass a path that does NOT follow the pen line exactly; washes miss.
export function wash(ctx, rnd, path, col, o = {}) {
  const a = o.a ?? 0.28;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.beginPath(); path(ctx);
  ctx.fillStyle = rgba(col, a);
  ctx.fill();
  ctx.clip();
  const box = o.box;
  if (box) {
    const [x0, y0, x1, y1] = box;
    const span = Math.max(x1 - x0, y1 - y0);
    const n = o.blots ?? 5;
    for (let i = 0; i < n; i++) {
      const x = rnd.range(x0, x1), y = rnd.range(y0, y1), r = rnd.range(0.12, 0.4) * span;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(col, a * rnd.range(0.25, 0.6)));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const edge = o.edge ?? 0.7;
  if (edge > 0) {
    const ew = o.edgeW ?? 5;
    ctx.filter = `blur(${ew * 0.3}px)`;
    ctx.lineWidth = ew;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba([col[0] * 0.78, col[1] * 0.78, col[2] * 0.8], Math.min(1, a * edge * 1.5));
    ctx.beginPath(); path(ctx); ctx.stroke();
    ctx.filter = 'none';
  }
  ctx.restore();
}

// Body colour: opaque paint that sits on top of the paper and lightens it,
// the one thing a wash cannot do. Used for cream walls, clouds, highlights.
export function gouache(ctx, path, col, a = 0.6) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.beginPath(); path(ctx);
  ctx.fillStyle = rgba(col, a);
  ctx.fill();
  ctx.restore();
}

// ---- sheets --------------------------------------------------------------

// Fill a region with paper. Used for the cut silhouette of a standing sheet.
export function paperFill(ctx, path, tile, o = {}) {
  ctx.save();
  ctx.beginPath(); path(ctx);
  const pat = ctx.createPattern(tile, 'repeat');
  if (o.offset) pat.setTransform(new DOMMatrix().translate(o.offset[0], o.offset[1]));
  ctx.fillStyle = pat;
  ctx.fill();
  ctx.restore();
}

// A transparent layer for pencil work, composited after tooth is knocked out.
export function pencilLayer(w, h) {
  const c = canvas(w, h);
  return { c, ctx: c.getContext('2d') };
}

export function applyTooth(layer, amount = 0.55) {
  const ctx = layer.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = amount;
  ctx.fillStyle = ctx.createPattern(papers().tooth, 'repeat');
  ctx.fillRect(0, 0, layer.c.width, layer.c.height);
  ctx.restore();
}

// Lay a pencil layer onto paper. A blurred copy underneath reads as graphite
// that has been rubbed with a finger.
export function layPencil(ctx, layer, o = {}) {
  ctx.save();
  ctx.globalCompositeOperation = o.atop ? 'source-atop' : 'multiply';
  if (o.smudge) {
    ctx.globalAlpha = o.smudge;
    ctx.filter = `blur(${o.blur ?? 5}px)`;
    ctx.drawImage(layer.c, 0, 0);
    ctx.filter = 'none';
  }
  ctx.globalAlpha = o.a ?? 1;
  ctx.drawImage(layer.c, 0, 0);
  ctx.restore();
}
