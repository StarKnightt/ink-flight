// The loader is the first page of the sketchbook. A loose sheet lies on the
// old paper and a pen draws a paper dart on it, one stroke after another, as
// far as the real loading has got. When the world is ready the sheet folds
// along those lines into the dart, lifts, and flies to where the plane sits
// in the first frame while the page fades away around it.

import { papers } from './draw/paper.js';
import { makeRng, noise1, clamp, lerp, smooth01 } from './draw/rng.js';
import { wavedash } from './wavedash.js';

const INK = [74, 47, 23];
const ink = (a = 1) => `rgba(${INK[0]},${INK[1]},${INK[2]},${a})`;
const FOLD = { f1: 0.28, f2: 0.28, f3: 0.24, fly: 0.75 };
export const FOLD_TIME = FOLD.f1 + FOLD.f2 + FOLD.f3 + FOLD.fly;       // 1.55 s

// a frame even when the tab is not being painted (rAF never fires there)
const nextFrame = () => new Promise((res) => {
  let done = false;
  const f = () => { if (!done) { done = true; res(performance.now()); } };
  requestAnimationFrame(f); setTimeout(f, 70);
});
const ease = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

// the dart as the pen draws it, in units of the sheet's width and height
const N = [0, -0.45], TL = [-0.31, 0.44], TR = [0.31, 0.44], C = [0, 0.33], IL = [-0.1, 0.4], IR = [0.1, 0.4];
const mix2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const STROKES = [
  { a: N, b: TL, w: 2.3 }, { a: TL, b: C, w: 2.0 }, { a: C, b: TR, w: 2.0 }, { a: TR, b: N, w: 2.5 },
  { a: N, b: C, w: 1.7 }, { a: N, b: IL, w: 1.2 }, { a: N, b: IR, w: 1.3 },
  // a little shade on the far wing, the way the plane in the references is lit
  ...[0.42, 0.52, 0.62, 0.72, 0.82, 0.9].map((t) => ({ a: mix2(N, IR, t), b: mix2(mix2(N, IR, t), mix2(N, TR, t), 0.82), w: 0.95, hatch: true })),
];

export class Loader {
  constructor() {
    const c = document.createElement('canvas');
    c.id = 'loader';
    document.body.appendChild(c);
    this.c = c; this.ctx = c.getContext('2d');
    this.p = 0; this.shown = 0; this.alive = true; this.foldT = -1; this.target = null;
    this.paper = papers();
    const rnd = makeRng(2024);
    // every stroke gets its own slight wander, fixed for the session
    this.strokes = STROKES.map((s) => ({ ...s, ph: rnd() * 100, len: Math.hypot(s.b[0] - s.a[0], (s.b[1] - s.a[1]) * 1.4) }));
    this.total = this.strokes.reduce((t, s) => t + s.len, 0);
    this.fontOk = false;
    document.fonts?.load('48px Kristi').then(() => { this.fontOk = true; }).catch(() => {});
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.resize();
    this.last = performance.now();
    this.run();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.c.width = Math.round(this.vw * dpr); this.c.height = Math.round(this.vh * dpr);
    // the page: the same paper as the ground in the game, a little stained
    const bg = document.createElement('canvas');
    bg.width = this.c.width; bg.height = this.c.height;
    const g = bg.getContext('2d');
    g.fillStyle = g.createPattern(this.paper.warm, 'repeat');
    g.fillRect(0, 0, bg.width, bg.height);
    g.globalCompositeOperation = 'multiply';
    const rnd = makeRng(77);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * bg.width, y = rnd() * bg.height, r = rnd.range(0.2, 0.55) * Math.max(bg.width, bg.height);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(176,140,86,${rnd.range(0.04, 0.1)})`); gr.addColorStop(1, 'rgba(176,140,86,0)');
      g.fillStyle = gr; g.fillRect(0, 0, bg.width, bg.height);
    }
    for (let i = 0; i < 60; i++) {
      const x = rnd() * bg.width, y = rnd() * bg.height, r = rnd.range(1, 4) * dpr;
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 2);
      gr.addColorStop(0, `rgba(150,98,48,${rnd.range(0.1, 0.3)})`); gr.addColorStop(1, 'rgba(150,98,48,0)');
      g.fillStyle = gr; g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    }
    this.bg = bg;
    this.sheetFill = this.ctx.createPattern(this.paper.pale, 'repeat');
    // layout, in CSS pixels
    this.H = Math.min(this.vh * 0.5, this.vw * 0.8);
    this.W = this.H / 1.4;
    this.cx = this.vw / 2; this.cy = this.vh * 0.4;
  }

  // real progress, 0..1
  set(p) { this.p = clamp(p, this.p, 1); wavedash.progress(this.p); }

  async run() {
    while (this.alive) {
      const now = await nextFrame();
      const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
      // the pen follows the loading; it cannot get ahead of it
      this.shown += (this.p - this.shown) * Math.min(1, dt * 9) + Math.sign(this.p - this.shown) * Math.min(Math.abs(this.p - this.shown), dt * 0.25);
      this.shown = Math.min(this.shown, this.p);
      if (this.foldT >= 0) this.foldT += dt;
      this.draw(this.shown, this.foldT, this.target);
      if (this.foldT >= FOLD_TIME) break;
    }
    this.remove();
  }

  // play the fold and the flight to `target` ({x, y, w, h} of the plane on screen)
  finish(target, instant = false) {
    this.target = target;
    if (instant) { this.alive = false; this.remove(); return Promise.resolve(); }
    return new Promise((res) => {
      const wait = async () => {
        this.p = 1;
        while (this.alive && this.shown < 0.992) await nextFrame();
        this.foldT = 0;
        while (this.alive && this.foldT < FOLD_TIME) await nextFrame();
        res();
      };
      wait();
    });
  }

  remove() {
    this.alive = false;
    removeEventListener('resize', this.onResize);
    this.c.remove();
  }

  // ---- drawing -------------------------------------------------------------

  pt(p) { return [p[0] * this.W, p[1] * this.H]; }

  // one pen stroke, revealed up to fraction f of its length
  strokeTo(s, f, alpha = 1) {
    const g = this.ctx, a = this.pt(s.a), b = this.pt(s.b), n = 22;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    g.strokeStyle = ink(alpha * (s.hatch ? 0.8 : 0.95)); g.lineCap = 'round';
    let px = a[0], py = a[1];
    const last = Math.ceil(f * n);
    for (let i = 1; i <= last; i++) {
      const t = Math.min(i / n, f);
      const wob = (noise1(t * 3.1 + s.ph) + noise1(t * 11 + s.ph * 2) * 0.35) * Math.min(1, t * 6, (1 - t) * 6) * 1.6;
      const x = a[0] + dx * t + nx * wob, y = a[1] + dy * t + ny * wob;
      // loaded where the nib lands, thinning as it runs out
      const env = Math.min(1, 0.45 + t * 5) * (1 - 0.55 * Math.pow(t, 2.2));
      g.lineWidth = Math.max(0.6, s.w * env * (0.85 + 0.25 * noise1(t * 9 + s.ph)));
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      px = x; py = y;
    }
    return [px, py];
  }

  poly(pts, fill, stroke, lw = 1) {
    const g = this.ctx;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  }

  draw(p, foldT, target) {
    const g = this.ctx, { W, H, vw, vh } = this;
    const f = FOLD;
    const folding = foldT >= 0;
    const t1 = folding ? clamp(foldT / f.f1, 0, 1) : 0;
    const t2 = folding ? clamp((foldT - f.f1) / f.f2, 0, 1) : 0;
    const t3 = folding ? clamp((foldT - f.f1 - f.f2) / f.f3, 0, 1) : 0;
    const u = folding ? clamp((foldT - f.f1 - f.f2 - f.f3) / f.fly, 0, 1) : 0;
    const fly = ease(u);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    // the page fades as the dart leaves it, and the world shows through
    const pageA = 1 - smooth01((u - 0.12) / 0.7);
    g.globalAlpha = pageA;
    g.drawImage(this.bg, 0, 0);
    g.globalAlpha = 1;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // ---- title and the progress line, in ink ----
    const textA = folding ? 1 - smooth01(foldT / 0.35) : 1;
    if (textA > 0.01) {
      const ty = this.cy + H / 2 + Math.max(58, vh * 0.085), size = clamp(vh * 0.082, 40, 84);
      g.globalAlpha = textA;
      if (this.fontOk) {
        g.font = `${size}px Kristi, cursive`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillStyle = ink(0.92);
        g.fillText('ink-flight', this.cx, ty);
      }
      const lw = Math.min(220, vw * 0.4), lx = this.cx - lw / 2, ly = ty + size * 0.42;
      // a faint ruled guide, then the ink line growing along it
      g.strokeStyle = ink(0.22); g.lineWidth = 1; g.setLineDash([2, 5]);
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + lw, ly); g.stroke(); g.setLineDash([]);
      g.strokeStyle = ink(0.9); g.lineCap = 'round';
      let px = lx, py = ly;
      const n = 40, last = Math.ceil(p * n);
      for (let i = 1; i <= last; i++) {
        const t = Math.min(i / n, p), x = lx + lw * t, y = ly + noise1(t * 7 + 3) * 1.6;
        g.lineWidth = 2.1 * (0.8 + 0.3 * noise1(t * 13));
        g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); px = x; py = y;
      }
      g.globalAlpha = 1;
    }

    // ---- the sheet ----
    const tg = target ?? { x: this.cx, y: this.cy, w: W * 0.62, h: H * 0.89 };
    const cx = lerp(this.cx, tg.x, fly), cy = lerp(this.cy, tg.y, fly) - Math.sin(fly * Math.PI) * vh * 0.05;
    const sx = lerp(1, tg.w / (W * 0.62), fly), sy = lerp(1, tg.h / (H * 0.89), fly);
    g.save();
    g.translate(cx, cy);
    g.rotate(lerp(-0.045, 0, fly) + Math.sin(fly * Math.PI) * 0.1);
    g.scale(sx, sy);

    const shadow = (on) => { g.shadowColor = on ? `rgba(70,46,20,${0.3 * pageA})` : 'transparent'; g.shadowBlur = on ? 22 : 0; g.shadowOffsetY = on ? 9 : 0; };
    const paper = this.sheetFill, back = 'rgba(222,206,172,1)';
    const hw = W / 2, hh = H / 2;
    const y1 = -hh + hw, y2 = Math.min(hh, -hh + 1.207 * W);
    const top = [0, -hh];
    const edge = ink(0.28);

    if (!folding || t1 < 1) {
      // flat sheet, or the two top corners coming over
      const th = ease(t1) * Math.PI;
      shadow(true);
      this.poly(t1 > 0 ? [top, [hw, y1], [hw, hh], [-hw, hh], [-hw, y1]] : [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], paper, null);
      shadow(false);
      this.poly(t1 > 0 ? [top, [hw, y1], [hw, hh], [-hw, hh], [-hw, y1]] : [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], null, edge, 1);
      // what the pen has drawn so far
      const inkA = 1 - 0.7 * ease(t1);
      let left = p * this.total, nib = null;
      for (const s of this.strokes) {
        if (left <= 0) break;
        const fr = Math.min(1, left / s.len);
        nib = this.strokeTo(s, fr, inkA);
        left -= s.len;
      }
      if (nib && !folding && p < 0.995) this.nib(nib);
      if (t1 > 0) {
        for (const s of [-1, 1]) {
          const a = top, b = [s * hw, y1], A = [s * hw, -hh], foot = [s * hw / 2, -hh + hw / 2];
          const c = Math.cos(th), corner = [foot[0] + (A[0] - foot[0]) * c, foot[1] + (A[1] - foot[1]) * c];
          shadow(th > 1.2);
          this.poly([a, b, corner], th < Math.PI / 2 ? paper : back, edge, 1);
          shadow(false);
        }
      }
    } else if (t2 < 1 || t3 <= 0) {
      // second fold: the slanted edges come in to the centre line
      const th = ease(t2) * Math.PI;
      shadow(true);
      this.poly([top, [hw, y2], [hw, hh], [-hw, hh], [-hw, y2]], paper, null);
      shadow(false);
      this.poly([top, [hw, y2], [hw, hh], [-hw, hh], [-hw, y2]], null, edge, 1);
      // the first flaps already lie flat, showing the back of the paper; only
      // the part inside the new fold line stays in view
      g.save();
      g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(hw, y2); g.lineTo(-hw, y2); g.closePath(); g.clip();
      for (const s of [-1, 1]) this.poly([top, [s * hw, y1], [0, y1]], back, edge, 1);
      g.restore();
      for (const s of [-1, 1]) {
        const a = top, b = [s * hw, y2], S = [s * hw, y1];
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, k = ((S[0] - a[0]) * dx + (S[1] - a[1]) * dy) / l2;
        const foot = [a[0] + dx * k, a[1] + dy * k], c = Math.cos(th);
        const corner = [foot[0] + (S[0] - foot[0]) * c, foot[1] + (S[1] - foot[1]) * c];
        shadow(th > 1.2);
        this.poly([a, b, corner], th < Math.PI / 2 ? paper : back, edge, 1);
        shadow(false);
      }
    } else {
      // third fold and flight: the sheet narrows into the dart the pen drew
      const m = ease(t3);
      const P2 = [top, [hw, y2], [hw, hh], [0, hh], [-hw, hh], [-hw, y2]];
      const P3 = [this.pt(N), [0.31 * W, 0.40 * H], this.pt(TR), this.pt(C), this.pt(TL), [-0.31 * W, 0.40 * H]];
      const P = P2.map((q, i) => [lerp(q[0], P3[i][0], m), lerp(q[1], P3[i][1], m)]);
      const white = (v, a = 1) => `rgba(${Math.round(lerp(238, 252, fly) * v)},${Math.round(lerp(226, 248, fly) * v)},${Math.round(lerp(196, 238, fly) * v)},${a})`;
      shadow(pageA > 0.05);
      this.poly(P, white(1), null);
      shadow(false);
      const nose = P[0], tail = P[3];
      // lit wing, shaded wing, and the doubled layer either side of the crease
      this.poly([nose, P[1], P[2], tail], white(0.93), null);
      const il = [lerp(-hw * 0.3, IL[0] * W, m), lerp(hh, IL[1] * H, m)], ir = [-il[0], il[1]];
      this.poly([nose, il, tail], white(0.86), null);
      this.poly([nose, tail, ir], white(0.8), null);
      g.globalAlpha = 0.5 + 0.3 * m;
      this.poly(P, null, 'rgba(84,78,72,0.9)', 1 / Math.max(sx, 0.2));
      g.strokeStyle = 'rgba(84,78,72,0.9)'; g.lineWidth = 1 / Math.max(sx, 0.2);
      for (const q of [tail, il, ir]) { g.beginPath(); g.moveTo(nose[0], nose[1]); g.lineTo(q[0], q[1]); g.stroke(); }
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // the pen itself: a nib and its holder, leaning the way a right hand holds it
  nib(p) {
    const g = this.ctx;
    g.save();
    g.translate(p[0], p[1]); g.rotate(-0.95);
    g.fillStyle = ink(0.95);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(13, -3.2); g.lineTo(13, 3.2); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(96,70,44,0.9)'; g.lineWidth = 4.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(14, 0); g.lineTo(74, 0); g.stroke();
    g.strokeStyle = 'rgba(255,244,220,0.35)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(16, -1.2); g.lineTo(72, -1.2); g.stroke();
    g.restore();
  }
}
