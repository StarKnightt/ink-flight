// The paper plane and how it flies.
//
// From the research: an energy model tuned by hand beats rigid-body physics
// for a glider. Pitch trades height for speed, drag grows with speed squared,
// lift fades when slow. A stall is a rule, not a simulation: under stall speed
// the nose sinks by itself until the air comes back. Keys are on/off, so every
// input is eased into something that feels like a stick.

import * as THREE from 'three/webgpu';
import { clamp, noise1 } from './draw/rng.js';
import { planeMaterial } from './materials.js';
import { WORLD, TOWN, LIGHT, MILL } from './layout.js';

export const TUNE = {
  cruise: 17.6,        // where a hands-off glide settles
  stall: 9.5,
  gravity: 13,
  drag: 0.0021,
  trim: -0.05,         // nose a hair down: the natural glide
  maxRoll: 0.95,
  pitchRate: 0.72,
  gustPush: 15,
  gustTime: 1.3,
  gustEvery: 2.4,
  mouseSens: 0.0026,   // stick travel per pixel of mouse: about 380 px for full deflection
  mouseSmooth: 13,     // how quickly the stick follows the hand (1/s); lower is silkier
  mouseReturn: 0.6,    // how quickly a resting stick drifts back to centre (1/s)
};

// columns of rising air: over the warm roofs, the sunny fields, the sea cliff
export const THERMALS = [
  { x: TOWN.x, z: TOWN.z, r: 95, lift: 4.6 },
  { x: -140, z: 240, r: 85, lift: 4.0 },
  { x: LIGHT.x - 40, z: LIGHT.z + 50, r: 110, lift: 5.2 },
  { x: MILL.x, z: MILL.z + 30, r: 70, lift: 3.6 },
  { x: 250, z: -70, r: 80, lift: 4.0 },
  { x: -340, z: -280, r: 120, lift: 3.0 },
];

export function buildPlane() {
  // a classic dart, nose toward -z
  const Nn = [0, 0, -2.2], T = [0, -0.02, 0.86], K = [0, -0.46, 0.8];
  const WL = [-0.84, 0.2, 1.42], WR = [0.84, 0.2, 1.42], IL = [-0.27, 0.05, 1.04], IR = [0.27, 0.05, 1.04];
  const CL = [-0.06, 0.0, 0.9], CR = [0.06, 0.0, 0.9];
  // each face carries its own tones so the folds read: darker into the
  // centre crease, a second layer of paper where the wing is doubled
  const tris = [
    [Nn, WL, IL, [0.97, 1.0, 0.9]], [Nn, IL, T, [0.86, 0.9, 0.74]],
    [Nn, IR, WR, [0.97, 0.9, 1.0]], [Nn, T, IR, [0.86, 0.74, 0.9]],
    [Nn, T, K, [0.82, 0.7, 0.78]],
    [Nn, CL, T, [0.7, 0.56, 0.5]], [Nn, T, CR, [0.7, 0.5, 0.56]],     // the shadow down the centre fold
  ];
  const p = [], tone = [];
  for (const [a, b, c, t] of tris) { p.push(...a, ...b, ...c); tone.push(...t); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, planeMaterial());

  // creases and edges as a pencil line
  const E = [[Nn, WL], [WL, IL], [IL, T], [T, IR], [IR, WR], [WR, Nn], [Nn, IL], [Nn, IR], [Nn, T], [Nn, K], [K, T]];
  const lp = [];
  for (const [a, b] of E) lp.push(...a, ...b);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicNodeMaterial({ color: 0x55504a, transparent: true, opacity: 0.6 }));
  const group = new THREE.Group();
  group.add(mesh, lines);
  group.scale.setScalar(1.2);
  group.rotation.order = 'YXZ';
  return group;
}

export class Flight {
  constructor(spawn) {
    this.spawn = spawn;
    this.pos = new THREE.Vector3();
    this.fwd = new THREE.Vector3();
    this.events = [];
    this.reset();
  }

  reset() {
    const s = this.spawn;
    this.pos.set(...s.pos);
    this.yaw = s.yaw; this.pitch = s.pitch; this.roll = 0;
    this.speed = TUNE.cruise + 1.5;
    this.inP = 0; this.inR = 0;
    this.gustT = 0; this.gustCd = 0; this.gust = 0;
    this.stall = 0; this.lift = 0; this.vy = 0; this.rollRate = 0;
    this.air = 0;                 // seconds since last touching down
    this.t = 0; this.skimCd = 0; this.edge = 0;
    this._dir();
  }

  _dir() {
    const cp = Math.cos(this.pitch);
    this.fwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // input: pitch -1..1 (+ pulls the nose up), roll -1..1 (+ banks right), gust, level
  step(dt, input) {
    const T = TUNE;
    this.t += dt; this.air += dt;
    this.inP += (input.pitch - this.inP) * (1 - Math.exp(-dt * 6));
    this.inR += (input.roll - this.inR) * (1 - Math.exp(-dt * 5));
    const v = this.speed;
    const auth = clamp(v / 20, 0.3, 1.15);          // slow air, soft controls

    // bank
    const targetRoll = input.level ? 0 : -this.inR * T.maxRoll;
    const r0 = this.roll;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * (input.level ? 4.2 : 2.6) * auth));
    this.rollRate = (this.roll - r0) / dt;

    // pitch: stick, then the plane's own wish to return to its glide
    this.pitch += this.inP * T.pitchRate * auth * dt;
    const relax = (Math.abs(this.inP) < 0.1 ? 0.55 : 0.08) + (input.level ? 2.4 : 0);
    this.pitch += (T.trim - this.pitch) * (1 - Math.exp(-dt * relax));

    // the gentle stall
    const st = clamp((T.stall + 3 - v) / 6, 0, 1);
    this.pitch -= st * st * 1.5 * dt;
    this.stall = st;
    this.pitch = clamp(this.pitch, -0.78, 0.72);

    // a banked wing turns the plane; slower means tighter
    this.yaw += ((9.5 * Math.tan(clamp(this.roll, -1.1, 1.1))) / Math.max(v, 9)) * 0.9 * dt;

    // energy
    let acc = -T.gravity * Math.sin(this.pitch) - T.drag * v * v - Math.max(0, v - 34) ** 2 * 0.02 - Math.abs(Math.sin(this.roll)) * 0.9;
    let lift = 0;

    // gusts arrive in pulses while Shift is held: wind, not an engine
    this.gustCd -= dt;
    if (input.gust && this.gustCd <= 0) { this.gustT = T.gustTime; this.gustCd = T.gustEvery; this.events.push('gust'); }
    this.gust = 0;
    if (this.gustT > 0) {
      const g = Math.sin(Math.PI * (1 - this.gustT / T.gustTime));
      this.gust = g; acc += T.gustPush * g; lift += 3.2 * g;
      this.gustT -= dt;
    }

    // rising air
    let th = 0;
    for (const t of THERMALS) {
      const d = Math.hypot(this.pos.x - t.x, this.pos.z - t.z);
      if (d < t.r) th += t.lift * (0.5 + 0.5 * Math.cos((d / t.r) * Math.PI)) * clamp(1 - this.pos.y / 260, 0, 1);
    }
    lift += th; this.thermal = th;

    // the cushion near the ground: you skim, you do not crash
    const h = this.pos.y - WORLD.floor;
    if (h < 14) { lift += (14 - h) * 0.3; this.pitch += clamp((14 - h) / 14, 0, 1) * Math.max(0, -this.pitch) * 2.2 * dt; }
    // a soft ceiling
    if (this.pos.y > WORLD.ceil) { lift -= (this.pos.y - WORLD.ceil) * 0.25; this.pitch -= 0.25 * dt; }

    // the edge of the page: the wind turns you home
    const rad = Math.hypot(this.pos.x, this.pos.z);
    this.edge = clamp((rad - WORLD.soft) / 150, 0, 1);
    if (this.edge > 0) {
      const home = Math.atan2(this.pos.x, this.pos.z);       // yaw that points at the centre
      let d = home - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += clamp(d, -1, 1) * this.edge * 1.1 * dt;
      this.roll += clamp(d, -1, 1) * this.edge * 0.9 * dt;
    }

    this.speed = clamp(v + acc * dt, 4, 62);
    this._dir();
    const sink = 0.9 + st * 5.5 + (1 - Math.cos(this.roll)) * 2.2;
    this.vy = this.fwd.y * this.speed - sink + lift;
    this.lift = lift;
    this.pos.x += this.fwd.x * this.speed * dt;
    this.pos.z += this.fwd.z * this.speed * dt;
    this.pos.y += this.vy * dt;

    // touching down is only a rustle and a bounce
    this.skimCd -= dt;
    if (this.pos.y < WORLD.floor) {
      this.pos.y = WORLD.floor;
      this.pitch = Math.max(this.pitch, 0.1);
      this.speed *= 1 - 0.5 * dt;
      this.air = 0;
      if (this.skimCd <= 0) { this.events.push('skim'); this.skimCd = 0.5; }
      if (this.speed < 9 && this.gustCd <= 0.2) { this.gustT = T.gustTime; this.gustCd = T.gustEvery; this.pitch = 0.28; this.events.push('gust'); }
    }
  }

  // write the pose onto the mesh, with the small flutters that keep paper alive
  pose(obj) {
    obj.position.copy(this.pos);
    const flutter = Math.sin(this.t * 6.3) * 0.09 * this.stall + noise1(this.t * 0.8) * 0.025 + noise1(this.t * 3.1) * 0.012 * (1 + this.gust * 3);
    obj.rotation.set(this.pitch + noise1(this.t * 0.6 + 40) * 0.015 - this.stall * 0.06 * Math.sin(this.t * 4.1), this.yaw, this.roll + flutter);
  }
}

// Chase camera: lags behind, leans a little with the bank, eases back the
// longer the glide and the faster the air.
export class Chase {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.roll = 0; this.fov = camera.fov; this.dist = 10;
    this.tmp = new THREE.Vector3(); this.up = new THREE.Vector3();
  }
  target(f, out, look) {
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
    const ease = Math.min(1, f.air / 25);
    const dist = 8.4 + f.speed * 0.12 + ease * 2.4;
    const up = 4.9 + ease * 0.7 - f.pitch * 3.4;
    out.set(f.pos.x - fx * dist, Math.max(1.4, f.pos.y + up), f.pos.z - fz * dist);
    look.set(f.pos.x + fx * 16, f.pos.y + 2.2 + f.fwd.y * 9, f.pos.z + fz * 16);
  }
  snap(f) {
    this.target(f, this.pos, this.look);
    this.roll = f.roll * 0.36; this.fov = 58;
    this.apply();
  }
  update(f, dt) {
    const t = this.tmp, l = this.up;
    this.target(f, t, l);
    this.pos.lerp(t, 1 - Math.exp(-dt * 4.2));
    this.look.lerp(l, 1 - Math.exp(-dt * 6));
    this.roll += (f.roll * 0.36 - this.roll) * (1 - Math.exp(-dt * 3));
    const fov = 58 + clamp((f.speed - 18) * 0.42, -2, 11) + f.gust * 2.5;
    this.fov += (fov - this.fov) * (1 - Math.exp(-dt * 2.2));
    this.apply();
  }
  apply() {
    const c = this.cam;
    c.position.copy(this.pos);
    // lean the horizon with the bank
    this.up.set(0, 1, 0);
    this.tmp.copy(this.look).sub(this.pos).normalize();
    this.up.applyAxisAngle(this.tmp, -this.roll);
    c.up.copy(this.up);
    c.lookAt(this.look);
    if (Math.abs(c.fov - this.fov) > 0.01) { c.fov = this.fov; c.updateProjectionMatrix(); }
  }
}
