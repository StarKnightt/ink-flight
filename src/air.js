// Everything that lives in the air: clouds that smudge when the plane goes
// through them, wind drawn as pencil strokes, and a few birds in quick ink.

import * as THREE from 'three/webgpu';
import { makeRng, clamp, noise1 } from './draw/rng.js';
import { canvas } from './draw/paper.js';
import { drawCloud } from './draw/scenery.js';
import { drawWind, drawBirds } from './draw/marks.js';
import { sheetTexture, cloudMaterial, markMaterial } from './materials.js';
import { THERMALS } from './flight.js';
import { LIGHT, WORLD } from './layout.js';

// A pool of camera-facing quads rebuilt on the CPU each frame: one draw call.
class Quads {
  constructor(max, tex, opts) {
    this.max = max;
    this.pos = new Float32Array(max * 12); this.uv = new Float32Array(max * 8); this.al = new Float32Array(max * 4);
    const idx = [];
    for (let i = 0; i < max; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.geo = g; this.n = 0;
    this.mesh = new THREE.Mesh(g, markMaterial(tex, { vertexAlpha: true, ...opts }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
  }
  begin() { this.n = 0; }
  // centre c, half-length axis a, half-width axis b, uv rect, alpha
  put(cx, cy, cz, ax, ay, az, bx, by, bz, u0, v0, u1, v1, alpha) {
    if (this.n >= this.max) return;
    const i = this.n++, p = this.pos, o = i * 12, q = i * 8;
    p[o] = cx - ax - bx; p[o + 1] = cy - ay - by; p[o + 2] = cz - az - bz;
    p[o + 3] = cx + ax - bx; p[o + 4] = cy + ay - by; p[o + 5] = cz + az - bz;
    p[o + 6] = cx + ax + bx; p[o + 7] = cy + ay + by; p[o + 8] = cz + az + bz;
    p[o + 9] = cx - ax + bx; p[o + 10] = cy - ay + by; p[o + 11] = cz - az + bz;
    const u = this.uv;
    u[q] = u0; u[q + 1] = v0; u[q + 2] = u1; u[q + 3] = v0; u[q + 4] = u1; u[q + 5] = v1; u[q + 6] = u0; u[q + 7] = v1;
    this.al.fill(alpha, i * 4, i * 4 + 4);
  }
  end() {
    this.geo.setDrawRange(0, this.n * 6);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.uv.needsUpdate = true; this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

const CLOUDS = [
  // x, y, z, width, facing
  [210, 150, 90, 160, 0.1], [-190, 176, 20, 230, -0.2], [250, 158, -160, 170, 0.3], [-380, 205, -300, 280, 0.15],
  [440, 190, 220, 210, -0.4], [40, 236, -520, 300, 0.0], [-470, 168, 300, 190, 0.45], [560, 160, -220, 170, -0.6],
  [-170, 112, 190, 110, 0.2],
];

export class Air {
  constructor(scene, seed = 77) {
    this.rnd = makeRng(seed);
    this.scene = scene;
    this.layers = [];
    this.smudges = 0;

    // ---- clouds: two sheets each, crossed. Only the one facing you shows, and
    // they trade places as you fly round, so a cloud is one clean drawing from
    // anywhere and never a stack of overlapping ones ----
    let s = 600;
    for (const [x, y, z, w, a] of CLOUDS) {
      for (let k = 0; k < 2; k++) {
        const d = drawCloud({ seed: s++, w: 640, h: 320 });
        const tex = sheetTexture(d.canvas, { aniso: 4 });
        const sc = [1, 0.92][k], lw = w * sc, lh = lw * 0.5;
        const la = a + [0, Math.PI / 2][k];
        const nx = Math.sin(la), nz = Math.cos(la), rx = Math.cos(la), rz = -Math.sin(la);
        const off = 0, side = 0;
        // every layer stands on the same base line, so the shadows under them agree
        const cx = x + nx * off + rx * side, cz = z + nz * off + rz * side, cy = y - w * 0.25 + lh * 0.5;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), cloudMaterial(tex));
        m.position.set(cx, cy, cz); m.rotation.y = la; m.renderOrder = 3;
        scene.add(m);
        this.layers.push({ c: d.canvas, ctx: d.canvas.getContext('2d'), tex, mesh: m, cx, cy, cz, nx, nz, rx, rz, w: lw, h: lh, base: cx, bz: cz, drift: this.rnd.range(0.6, 1.4), dirty: false });
      }
    }
    // scratch for smudging: a soft round sample of the drawing
    this.sr = 40;
    this.scratch = canvas(this.sr * 2, this.sr * 2);
    this.sctx = this.scratch.getContext('2d');
    const g = this.sctx.createRadialGradient(this.sr, this.sr, 0, this.sr, this.sr, this.sr);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    this.sgrad = g;

    // ---- wind ----
    const wind = drawWind();
    this.wind = new Quads(170, sheetTexture(wind.canvas, { aniso: 4 }), {});
    scene.add(this.wind.mesh);
    this.strokes = [];
    this.windDir = new THREE.Vector3(0.93, 0, 0.36);
    this.spawnT = 0; this.tipT = 0; this.thermT = 0;

    // ---- birds ----
    const birds = drawBirds();
    this.birds = new Quads(20, sheetTexture(birds.canvas, { aniso: 4 }), {});
    scene.add(this.birds.mesh);
    this.flocks = [
      { cx: LIGHT.x - 70, cz: LIGHT.z + 90, rx: 150, rz: 110, y: 96, sp: 0.085, n: 6, ph: 0 },
      { cx: 40, cz: 150, rx: 210, rz: 150, y: 70, sp: -0.06, n: 5, ph: 2.1 },
      { cx: -300, cz: -230, rx: 170, rz: 120, y: 84, sp: 0.07, n: 4, ph: 4.0 },
    ];
    this.t = 0;
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3();
  }

  // Drag graphite along the plane's path, like a fingertip through pencil.
  smear(L, u, v, du, dv, k) {
    const W = L.c.width, H = L.c.height, r = this.sr;
    const x = u * W, y = (1 - v) * H;
    // only when the touch has moved on: rubbing one spot over and over would
    // polish the drawing away instead of smearing it
    const fresh = this.t - (L.lastT ?? -9) > 0.6;
    const moved = fresh ? 99 : Math.hypot(x - L.lastX, y - L.lastY);
    if (moved < 5) return;
    L.lastX = x; L.lastY = y; L.lastT = this.t;
    const c = L.ctx;
    const ang = Math.atan2(dv, du);
    c.save();
    // 1. pull what is drawn here a little way along the path
    const s = this.sctx;
    s.globalCompositeOperation = 'copy';
    s.drawImage(L.c, x - r, y - r, r * 2, r * 2, 0, 0, r * 2, r * 2);
    s.globalCompositeOperation = 'destination-in';
    s.fillStyle = this.sgrad; s.fillRect(0, 0, r * 2, r * 2);
    c.globalCompositeOperation = 'source-over';
    for (let i = 1; i <= 3; i++) {
      c.globalAlpha = 0.16 * k * (1 - i * 0.2);
      c.drawImage(this.scratch, x - r + du * i * 7, y - r + dv * i * 7);
    }
    // 2. leave graphite behind: a soft grey streak, only where there is paper
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = 1;
    c.translate(x, y); c.rotate(ang);
    const len = fresh ? r * 0.55 : Math.min(r * 1.4, moved * 1.6 + r * 0.4), wd = r * (fresh ? 0.5 : 0.3);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(112,128,162,${0.36 * k})`); g.addColorStop(0.6, `rgba(112,128,162,${0.17 * k})`); g.addColorStop(1, 'rgba(112,128,162,0)');
    c.scale(len, wd);
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fill();
    c.restore();
    L.dirty = true;
  }

  stroke(o) { if (this.strokes.length < 160) this.strokes.push(o); }

  update(dt, f, camera) {
    this.t += dt;
    const rnd = this.rnd, t = this.t;
    let inCloud = 0;

    // ---- clouds drift a little, and smudge where the plane passes ----
    for (const L of this.layers) {
      const sway = Math.sin(t * 0.05 * L.drift + L.base * 0.01) * 14;
      L.cx = L.base + L.rx * sway; L.cz = L.bz + L.rz * sway;
      L.mesh.position.x = L.cx; L.mesh.position.z = L.cz;
      const dx = f.pos.x - L.cx, dy = f.pos.y - L.cy, dz = f.pos.z - L.cz;
      const d = dx * L.nx + dz * L.nz;
      if (Math.abs(d) > 7) continue;
      const u = (dx * L.rx + dz * L.rz) / L.w + 0.5, v = dy / L.h + 0.5;
      if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98) continue;
      // direction of travel within the sheet, in canvas space (y down)
      let du = f.fwd.x * L.rx + f.fwd.z * L.rz, dv = -f.fwd.y;
      const l = Math.hypot(du, dv);
      if (l < 0.15) { du = rnd.bell(); dv = rnd.bell(); } else { du /= l; dv /= l; }
      const k = 1 - Math.abs(d) / 7;
      this.smear(L, u, v, du, dv, k);
      inCloud = Math.max(inCloud, k);
      this.smudges++;
    }
    let uploads = 0;
    for (const L of this.layers) if (L.dirty && uploads < 3) { L.tex.needsUpdate = true; L.dirty = false; uploads++; }
    this.inCloud = inCloud;

    // ---- wind strokes ----
    const cam = camera.position;
    camera.getWorldDirection(this.tmp);
    const vx = this.tmp.x, vy = this.tmp.y, vz = this.tmp.z;
    // the valley's own breeze, drawn ahead of the camera
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = rnd.range(0.12, 0.3) / (1 + f.edge * 4);
      const dist = rnd.range(26, 150), side = rnd.bell() * dist * 0.75, up = rnd.bell() * dist * 0.3 + 4;
      const sx = -vz, sz = vx;
      const x = cam.x + vx * dist + sx * side, y = Math.max(3, cam.y + vy * dist + up), z = cam.z + vz * dist + sz * side;
      let dx = this.windDir.x, dz = this.windDir.z;
      if (f.edge > 0.05) { const r = Math.hypot(f.pos.x, f.pos.z) || 1; dx = -f.pos.x / r; dz = -f.pos.z / r; }
      this.stroke({ x, y, z, dx: dx + rnd.bell() * 0.12, dy: rnd.bell() * 0.05, dz: dz + rnd.bell() * 0.12, sp: rnd.range(9, 16) * (1 + f.edge * 2), len: rnd.range(10, 26) * (dist / 90 + 0.55), row: rnd.pick([0, 0, 1, 2, 3]), life: 0, max: rnd.range(2.6, 4.6), a: rnd.range(0.4, 0.7) + f.edge * 0.2 });
    }
    // rising air shows as curls climbing a slow spiral
    this.thermT -= dt;
    if (this.thermT <= 0) {
      this.thermT = 0.16;
      for (const th of THERMALS) {
        if (Math.hypot(cam.x - th.x, cam.z - th.z) > 420 || rnd() > 0.5) continue;
        const a = rnd() * 6.283, r = th.r * rnd.range(0.15, 0.6), y = rnd.range(6, 150);
        this.stroke({ x: th.x + Math.cos(a) * r, y, z: th.z + Math.sin(a) * r, dx: -Math.sin(a) * 0.8, dy: 0.6, dz: Math.cos(a) * 0.8, sp: rnd.range(4, 7), len: rnd.range(9, 16), row: 2, life: 0, max: rnd.range(2.5, 4), a: rnd.range(0.3, 0.5), curl: { cx: th.x, cz: th.z } });
      }
    }
    // a gust: a sheaf of strokes rushing past the plane
    for (const e of f.events) {
      if (e === 'gust') for (let i = 0; i < 16; i++) {
        const back = rnd.range(8, 46), r = rnd.range(2.5, 13), a = rnd() * 6.283;
        const sx = -f.fwd.z, sz = f.fwd.x;
        this.stroke({ x: f.pos.x - f.fwd.x * back + sx * Math.cos(a) * r, y: f.pos.y - f.fwd.y * back + Math.sin(a) * r * 0.7, z: f.pos.z - f.fwd.z * back + sz * Math.cos(a) * r, dx: f.fwd.x, dy: f.fwd.y, dz: f.fwd.z, sp: f.speed + rnd.range(16, 34), len: rnd.range(14, 30), row: rnd.pick([0, 0, 1, 3]), life: 0, max: rnd.range(1, 1.7), a: rnd.range(0.5, 0.8) });
      }
      if (e === 'skim') for (let i = 0; i < 6; i++) {
        this.stroke({ x: f.pos.x + rnd.bell() * 3, y: 0.6 + rnd() * 1.5, z: f.pos.z + rnd.bell() * 3, dx: -f.fwd.x + rnd.bell() * 0.5, dy: 0.25, dz: -f.fwd.z + rnd.bell() * 0.5, sp: rnd.range(2, 6), len: rnd.range(3, 6), row: 3, life: 0, max: rnd.range(0.5, 0.9), a: 0.6 });
      }
    }
    // hard banks and gusts leave pencil lines off the wingtips
    this.tipT -= dt;
    const tipAmt = clamp(Math.abs(f.roll) * 1.5 - 0.42, 0, 1) + f.gust * 0.7 + clamp((f.speed - 23) / 22, 0, 0.45);
    if (tipAmt > 0.05 && this.tipT <= 0) {
      this.tipT = 0.045;
      const cr = Math.cos(f.roll), sr = Math.sin(f.roll);
      const rxx = Math.cos(f.yaw), rzz = -Math.sin(f.yaw);
      for (const side of [-1, 1]) {
        const ox = rxx * side * 1.5 * cr, oz = rzz * side * 1.5 * cr, oy = side * 1.5 * -sr + 0.15;
        this.stroke({ x: f.pos.x + ox - f.fwd.x * -1.5, y: f.pos.y + oy, z: f.pos.z + oz - f.fwd.z * -1.5, dx: f.fwd.x, dy: f.fwd.y, dz: f.fwd.z, sp: 0, len: f.speed * 0.05 + 0.5, row: 3, life: 0, max: 0.75, a: 0.7 * Math.min(1, tipAmt), tip: true, wd: 0.22 });
      }
    }

    this.wind.begin();
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      s.life += dt;
      if (s.life > s.max) { this.strokes[i] = this.strokes[this.strokes.length - 1]; this.strokes.pop(); continue; }
      if (s.curl) { const ax = s.x - s.curl.cx, az = s.z - s.curl.cz, r = Math.hypot(ax, az) || 1; s.dx = (-az / r) * 0.8; s.dz = (ax / r) * 0.8; }
      s.x += s.dx * s.sp * dt; s.y += s.dy * s.sp * dt; s.z += s.dz * s.sp * dt;
      const k = s.life / s.max;
      const al = s.a * (s.tip ? 1 - k : Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * Math.min(1, (1 - k) * 2.5));
      // long axis along travel, short axis across the line of sight
      const dl = Math.hypot(s.dx, s.dy, s.dz) || 1;
      const ax = (s.dx / dl) * s.len * 0.5, ay = (s.dy / dl) * s.len * 0.5, az = (s.dz / dl) * s.len * 0.5;
      const tx = cam.x - s.x, ty = cam.y - s.y, tz = cam.z - s.z;
      // a stroke passing right by the eye would fill the frame: let it thin out
      const nearK = clamp((Math.hypot(tx, ty, tz) - 7) / 16, 0, 1);
      let bx = ay * tz - az * ty, by = az * tx - ax * tz, bz = ax * ty - ay * tx;
      const bl = Math.hypot(bx, by, bz) || 1, hw = s.wd ?? s.len * 0.0625;
      bx = (bx / bl) * hw; by = (by / bl) * hw; bz = (bz / bl) * hw;
      const v1 = 1 - s.row / 4, v0 = v1 - 0.25;
      this.wind.put(s.x, s.y, s.z, ax, ay, az, bx, by, bz, 0, v0, 1, v1, al * nearK);
    }
    this.wind.end();

    // ---- birds ----
    this.birds.begin();
    for (const F of this.flocks) {
      const a0 = t * F.sp + F.ph;
      for (let i = 0; i < F.n; i++) {
        const lag = i * 0.055 * Math.sign(F.sp), wing = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 6;
        const a = a0 - lag;
        const x = F.cx + Math.cos(a) * (F.rx + wing), z = F.cz + Math.sin(a) * (F.rz + wing * 0.8);
        const y = F.y + Math.sin(t * 0.4 + i) * 4 + noise1(t * 0.3 + i * 9) * 5;
        // flap in bursts, then hold the wings out and glide
        const beat = t * 3.6 + i * 1.7, glide = noise1(t * 0.21 + i * 4.4) > 0.25;
        let fr = glide ? 1 : Math.floor(beat % 6);
        if (fr > 3) fr = 6 - fr;
        const tx = cam.x - x, tz = cam.z - z, tl = Math.hypot(tx, tz) || 1;
        const sx = -tz / tl, sz = tx / tl, size = 3.6;
        // face the wings along the direction of flight as seen from here
        const hx = -Math.sin(a) * Math.sign(F.sp), hz = Math.cos(a) * Math.sign(F.sp);
        const flip = hx * sx + hz * sz < 0 ? -1 : 1;
        const d = Math.hypot(tx, cam.y - y, tz);
        const al = clamp(1.25 - d / 900, 0.25, 0.95);
        const u0 = fr / 4, u1 = u0 + 0.25;
        this.birds.put(x, y, z, sx * size * flip, 0, sz * size * flip, 0, size, 0, u0, 0, u1, 1, al);
      }
    }
    this.birds.end();
  }
}

export { WORLD };
