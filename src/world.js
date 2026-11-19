// The set. Every drawing becomes a flat sheet standing in space; nothing here
// is modelled. Sheets mostly face south toward the audience, in layers, with
// enough variety of angle that the valley holds together from any heading.

import * as THREE from 'three/webgpu';
import { makeRng, clamp } from './draw/rng.js';
import { drawRidge, drawHill, drawCliff, drawTree, drawTreeLine } from './draw/scenery.js';
import { drawHouse, drawTownRow, drawChurch, drawBridge, drawMill, drawSails, drawLighthouse, drawBoat } from './draw/buildings.js';
import { drawGround, drawFarGround, drawGroundDetail } from './draw/ground.js';
import { drawNote, drawSun, drawSky, drawGrain } from './draw/marks.js';
import { canvas, papers } from './draw/paper.js';
import { Pen } from './draw/ink.js';
import { sheetTexture, sheetMaterial, shadowMaterial, groundMaterial, skyMaterial, markMaterial, setGrain } from './materials.js';
import { WORLD, SUN, TOWN, BRIDGE, MILL, LIGHT, FALLS, FOREST, HILLS, ROADS, FIELDS, isWater, isSea, riverAt, polyAt } from './layout.js';

// shadows fall away from the sun; shortened, since a true 15 degree sun would
// lay every tree across half the valley
const SH = (() => { const l = Math.hypot(SUN[0], SUN[2]); return [-SUN[0] / l * 1.5, -SUN[2] / l * 1.5]; })();

class Batch {
  constructor() { this.p = []; this.n = []; this.u = []; this.i = []; this.count = 0; }
  // a: facing, radians from south (0 faces +z). Canvas x runs to the viewer's right.
  quad(x, y, z, w, h, a = 0, o = {}) {
    const nx = Math.sin(a), nz = Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
    const hw = w / 2, b = this.p.length / 3;
    const lean = o.lean ?? 0;                     // top tips back a little
    this.p.push(x - rx * hw, y, z - rz * hw, x + rx * hw, y, z + rz * hw,
      x + rx * hw - nx * lean, y + h, z + rz * hw - nz * lean, x - rx * hw - nx * lean, y + h, z - rz * hw - nz * lean);
    for (let k = 0; k < 4; k++) this.n.push(nx, 0, nz);
    const u0 = o.flip ? 1 : 0, u1 = o.flip ? 0 : 1;
    this.u.push(u0, 0, u1, 0, u1, 1, u0, 1);
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.count++;
    return this;
  }
  // the same footprint laid on the ground and sheared away from the sun
  shadow(x, z, w, h, a = 0, o = {}) {
    const rx = Math.cos(a), rz = -Math.sin(a), hw = w / 2, b = this.p.length / 3, y = 0.3;
    const sx = SH[0] * h, sz = SH[1] * h;
    this.p.push(x - rx * hw, y, z - rz * hw, x + rx * hw, y, z + rz * hw, x + rx * hw + sx, y, z + rz * hw + sz, x - rx * hw + sx, y, z - rz * hw + sz);
    for (let k = 0; k < 4; k++) this.n.push(0, 1, 0);
    const u0 = o.flip ? 1 : 0, u1 = o.flip ? 0 : 1;
    this.u.push(u0, 0, u1, 0, u1, 1, u0, 1);
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.count++;
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

export async function buildWorld(scene, renderer, step) {
  const rnd = makeRng(4242);
  const maxAniso = renderer.getMaxAnisotropy?.() ?? 8;
  const world = { sheets: [], spin: [], stats: { sheets: 0, textures: 0 } };
  const P = papers();

  const grain = sheetTexture(drawGrain().canvas, { repeat: true, aniso: 4 });
  setGrain(grain);

  // add one drawing as standing sheets, with their ground shadows
  const stand = (drawing, places, o = {}) => {
    const tex = sheetTexture(drawing.canvas, { aniso: Math.min(maxAniso, o.aniso ?? 8) });
    const b = new Batch(), s = new Batch();
    for (const pl of places) {
      b.quad(pl.x, pl.y ?? 0, pl.z, pl.w, pl.h, pl.a ?? 0, pl);
      if (o.shadow !== false && (pl.y ?? 0) < 1.5 && pl.shadow !== false) s.shadow(pl.x, pl.z, pl.w, pl.h * (o.shadowLen ?? 1), pl.a ?? 0, pl);
      world.sheets.push({ x: pl.x, y: pl.y ?? 0, z: pl.z, w: pl.w, h: pl.h, a: pl.a ?? 0 });
    }
    const mesh = new THREE.Mesh(b.geometry(), sheetMaterial(tex, o));
    mesh.frustumCulled = places.length === 1;
    mesh.renderOrder = 0;
    scene.add(mesh);
    if (s.count) {
      const sm = new THREE.Mesh(s.geometry(), shadowMaterial(tex, { strength: o.shadowStrength ? o.shadowStrength * 1.15 : undefined }));
      sm.frustumCulled = false; sm.renderOrder = -1;
      scene.add(sm);
    }
    world.stats.sheets += places.length; world.stats.textures++;
    return mesh;
  };

  // ---- backdrop -----------------------------------------------------------
  await step('sky');
  const skyGroup = new THREE.Group();
  const sunAz0 = Math.atan2(SUN[2], -SUN[0]) / (Math.PI * 2);
  const skyTex = sheetTexture(drawSky((sunAz0 + 1) % 1, 0.5 + Math.asin(SUN[1]) / Math.PI).canvas, { aniso: 8 });
  skyTex.wrapS = THREE.RepeatWrapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5200, 48, 24), skyMaterial(skyTex));
  sky.frustumCulled = false; sky.renderOrder = -10;
  skyGroup.add(sky);
  // marks on the backdrop: the sun, and notes in the margins
  const onSky = (cnv, az, el, w, h, opacity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), markMaterial(sheetTexture(cnv, { aniso: 4 }), { opacity, depthTest: false }));
    const r = 4600, ce = Math.cos(el);
    m.position.set(Math.sin(az) * ce * r, Math.sin(el) * r, -Math.cos(az) * ce * r);
    m.lookAt(0, 0, 0);
    m.renderOrder = -9; m.frustumCulled = false;
    skyGroup.add(m);
  };
  const sunAz = Math.atan2(SUN[0], -SUN[2]), sunEl = Math.asin(SUN[1]);
  onSky(drawSun().canvas, sunAz, sunEl, 1000, 1000, 0.5);
  const notes = [[1, 'text', 0.5, 0.42], [2, 'circle', -0.25, 0.5], [3, 'wing', 1.35, 0.36], [4, 'wheels', 2.5, 0.4], [5, 'text', -2.2, 0.46], [6, 'text', 3.4, 0.6], [7, 'text', -0.9, 0.74], [8, 'circle', 2.0, 0.8], [9, 'text', 0.05, 0.86]];
  for (const [seed, kind, az, el] of notes) onSky(drawNote(seed, kind).canvas, az, el, 2100, 1400, 0.3);
  scene.add(skyGroup);
  world.sky = skyGroup;

  // ---- ground -------------------------------------------------------------
  await step('ground');
  const detail = sheetTexture(drawGroundDetail(), { repeat: true, aniso: maxAniso });
  const farTex = sheetTexture(drawFarGround(7200), { aniso: maxAniso });
  const far = new THREE.Mesh(new THREE.PlaneGeometry(7200, 7200), groundMaterial(farTex, detail));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.4; far.renderOrder = -6;
  scene.add(far);
  await step('map');
  const gc = drawGround();
  {
    // feather the edge of the map into the paper beyond it
    const g = gc.getContext('2d'), n = gc.width, m = 150;
    g.globalCompositeOperation = 'destination-out';
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, m, 0, 0, 0, m, n], [n, 0, n - m, 0, n - m, 0, m, n], [0, 0, 0, m, 0, 0, n, m], [0, n, 0, n - m, 0, n - m, n, m]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
    }
  }
  const groundTex = sheetTexture(gc, { aniso: maxAniso });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2), groundMaterial(groundTex, detail, { transparent: true, crisp: 4096 }));
  ground.rotation.x = -Math.PI / 2; ground.renderOrder = -5;
  scene.add(ground);

  // ---- mountains: three ranks round the north, west and south -------------
  await step('mountains');
  const ridge = (seed, o, places) => stand(drawRidge({ seed, w: 2048, h: 640, ...o }), places, { fade: 0.42, shadow: false });
  const N = 0, E = Math.PI / 2, S = Math.PI, W = -Math.PI / 2;     // which way a sheet faces
  // north wall (faces south, toward the valley)
  ridge(101, { fade: 0.05, peaks: 5 }, [{ x: -420, z: -900, w: 1250, h: 330, a: 0.12 }]);
  ridge(102, { fade: 0.12, peaks: 4 }, [{ x: 420, z: -960, w: 1100, h: 270, a: -0.14 }]);
  await step('mountains');
  ridge(103, { fade: 0.5, peaks: 6 }, [{ x: 60, z: -1130, w: 1900, h: 400, a: 0 }, { x: -1160, z: 760, w: 1500, h: 330, a: E + 0.2, flip: true }]);
  ridge(104, { fade: 0.9, peaks: 5, jag: 0.7 }, [{ x: -200, z: -1420, w: 2600, h: 470, a: 0.05 }, { x: 1500, z: -1500, w: 1600, h: 300, a: -0.5 }, { x: -1500, z: -300, w: 2400, h: 430, a: E }]);
  await step('mountains');
  // west wall (faces east): the sun sits just above it
  ridge(105, { fade: 0.08, peaks: 5 }, [{ x: -900, z: -180, w: 1200, h: 300, a: E - 0.1 }]);
  ridge(106, { fade: 0.15, peaks: 4 }, [{ x: -930, z: 520, w: 1000, h: 250, a: E + 0.25 }]);
  ridge(107, { fade: 0.5, peaks: 6 }, [{ x: -1120, z: -560, w: 1700, h: 380, a: E - 0.35 }]);
  await step('mountains');
  // south wall (faces north), lower, behind the start
  ridge(108, { fade: 0.2, peaks: 5, height: 0.8 }, [{ x: -260, z: 930, w: 1300, h: 240, a: S - 0.1 }]);
  ridge(109, { fade: 0.55, peaks: 5 }, [{ x: 200, z: 1130, w: 1900, h: 330, a: S + 0.05 }]);
  // far islands out to sea
  ridge(110, { fade: 0.95, peaks: 3, jag: 0.5, height: 0.7 }, [{ x: 2100, z: -300, w: 1300, h: 150, a: W }, { x: 1900, z: 900, w: 900, h: 110, a: W - 0.3 }]);

  // the falls at the head of the valley
  await step('cliffs');
  stand(drawCliff({ seed: 302, shape: 'falls', w: 1536, h: 640 }), [{ x: FALLS.x, z: FALLS.z, w: 470, h: 196, a: 0 }], { fade: 0.45, shadow: false });
  // coast: a headland for the lighthouse and bluffs either side
  const la = -0.72;                                 // the headland faces south-west, into the valley
  const head = drawCliff({ seed: 301, shape: 'headland', w: 1536, h: 600 });
  stand(head, [{ x: LIGHT.x - 30, z: LIGHT.z + 16, w: 300, h: 78, a: la }], { fade: 0.45, shadow: false });
  stand(drawCliff({ seed: 303, shape: 'bluff', w: 1536, h: 560 }), [
    { x: 560, z: -520, w: 300, h: 88, a: -0.9 }, { x: 590, z: -140, w: 220, h: 50, a: -0.5, flip: true }, { x: 520, z: -700, w: 340, h: 110, a: -0.6 },
    { x: 560, z: 560, w: 260, h: 56, a: -1.0 }, { x: 600, z: 730, w: 320, h: 80, a: -1.2, flip: true },
  ], { fade: 0.45, shadow: false });
  const lhY = 78 * 0.66;
  stand(drawLighthouse({ seed: 61 }), [{ x: LIGHT.x - 44, z: LIGHT.z + 6, y: lhY - 3, w: 33, h: 66, a: la }], { fade: 0.5 });

  // ---- hills ---------------------------------------------------------------
  await step('hills');
  const hills = [];
  for (const [x, z, w, h, a, seed] of HILLS) {
    const d = drawHill({ seed, w: 1536, h: 400, trees: seed === 201 ? 3 : undefined });
    stand(d, [{ x, z, w, h, a }], { fade: 0.45, shadow: false });
    hills.push({ x, z, w, h, a, d });
    await step('hills');
  }
  // height of a hill sheet's crest at a point along it
  const crest = (hl, t) => { const px = clamp(Math.round((t * 0.5 + 0.5) * hl.d.w), 0, hl.d.w); return ((hl.d.h - hl.d.profile[px]) / hl.d.h) * hl.h; };

  // ---- trees ---------------------------------------------------------------
  await step('trees');
  const face = (spread = 0.7) => rnd.bell() * spread;       // mostly south, with variety
  const treeKinds = [['oak', 1], ['oak', 2], ['oak', 3], ['pine', 4], ['pine', 5], ['poplar', 6], ['poplar', 7], ['cypress', 8], ['cypress', 9], ['bush', 10]];
  const treePlaces = treeKinds.map(() => []);
  const dry = (x, z) => !isWater(x, z) && riverAt(x, z).d > riverAt(x, z).w * 0.5 + 5 && Math.hypot(x, z) < 740;
  const plant = (x, z, kinds, scale = 1) => {
    if (!dry(x, z)) return;
    if (Math.abs(z - BRIDGE.z) < 14 && Math.abs(x - BRIDGE.x) < 70) return;
    const k = rnd.pick(kinds), kind = treeKinds[k][0];
    const h = (kind === 'bush' ? 7 : kind === 'cypress' ? rnd.range(15, 22) : rnd.range(13, 20)) * scale;
    treePlaces[k].push({ x, z, w: h * (300 / 380), h, a: rnd.range(-1.5, 1.5), flip: rnd.chance(0.5) });
  };
  // along the roads
  for (const road of ROADS) for (let t = 0.03; t < 1; t += rnd.range(0.025, 0.07)) {
    const p = polyAt(road, t), side = rnd.sign() * rnd.range(7, 16);
    plant(p[0] + side, p[1] + rnd.bell() * 6, [5, 6, 7, 8, 7, 8, 0], 1);
  }
  // field corners and hedges
  for (const [cx, cz, fw, fd, rot] of FIELDS) for (let k = 0; k < 9; k++) {
    const u = rnd.sign() * fw * 0.5 * rnd.range(0.8, 1.05), v = rnd.range(-0.5, 0.5) * fd;
    plant(cx + u * Math.cos(rot) - v * Math.sin(rot), cz + u * Math.sin(rot) + v * Math.cos(rot), [0, 1, 2, 3, 4, 9, 9]);
  }
  // riverbanks
  for (let t = 0.1; t < 0.96; t += rnd.range(0.012, 0.03)) {
    const p = polyAt([[-60, -660], [-98, -520], [-24, -390], [-88, -260], [2, -140], [22, -45], [22, 30], [44, 110], [112, 190], [232, 250], [380, 292], [520, 356]], t);
    plant(p[0] + rnd.sign() * rnd.range(22, 44), p[1] + rnd.bell() * 10, [0, 1, 2, 5, 6, 9, 9]);
  }
  // scattered
  for (let k = 0; k < 150; k++) plant(rnd.range(-640, 480), rnd.range(-560, 640), [0, 1, 2, 3, 4, 5, 9]);
  // around the town
  for (let k = 0; k < 26; k++) { const a = rnd() * 6.283, r = rnd.range(60, 170); plant(TOWN.x + Math.cos(a) * r, TOWN.z + Math.sin(a) * r * 0.8, [7, 8, 7, 8, 5, 3, 4], 1.05); }
  for (let k = 0; k < treeKinds.length; k++) {
    if (!treePlaces[k].length) continue;
    stand(drawTree({ seed: 400 + treeKinds[k][1], kind: treeKinds[k][0] }), treePlaces[k], { fade: 0.5, sway: 0.16, shadowStrength: 0.2 });
    if (k % 3 === 0) await step('trees');
  }
  // hedgerows and copses as whole flats
  const lines = [[], [], []];
  for (let k = 0; k < 34; k++) {
    const x = rnd.range(-620, 470), z = rnd.range(-520, 640);
    if (!dry(x, z) || Math.hypot(x - TOWN.x, z - TOWN.z) < 150 || Math.hypot(x - FOREST.x, z - FOREST.z) < 200) continue;
    lines[k % 3].push({ x, z, w: 62, h: 24, a: rnd.chance(0.4) ? rnd.sign() * rnd.range(1.1, 1.6) : face(0.6), flip: rnd.chance(0.5) });
  }
  for (let k = 0; k < 3; k++) { stand(drawTreeLine({ seed: 520 + k, w: 1024, h: 400 }), lines[k], { fade: 0.5, sway: 0.12, shadowStrength: 0.2 }); }

  // the pencil forest: flats in staggered rows, so it has real depth to fly into
  await step('forest');
  const forest = [[], [], [], []];
  for (let k = 0; k < 64; k++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd());
    const x = FOREST.x + Math.cos(a) * r * FOREST.rx, z = FOREST.z + Math.sin(a) * r * FOREST.rz;
    if (!dry(x, z)) continue;
    const s = rnd.range(0.85, 1.25);
    forest[k % 4].push({ x, z, w: 74 * s, h: 29 * s, a: rnd.chance(0.38) ? rnd.sign() * rnd.range(1.0, 1.6) : face(0.55), flip: rnd.chance(0.5) });
  }
  for (let k = 0; k < 4; k++) { stand(drawTreeLine({ seed: 540 + k, pencil: true, w: 1024, h: 400, count: 11 }), forest[k], { fade: 0.5, sway: 0.14, shadowStrength: 0.22 }); await step('forest'); }

  // ---- town ----------------------------------------------------------------
  await step('town');
  const T = TOWN;
  const rowPlaces = [
    [{ x: T.x - 78, z: T.z - 54, w: 72, h: 31, a: 0.05 }, { x: T.x + 96, z: T.z + 46, w: 72, h: 31, a: -0.1 }, { x: T.x - 120, z: T.z + 78, w: 66, h: 28.5, a: 0.3 }, { x: T.x - 58, z: T.z + 62, w: 60, h: 26, a: 1.45 }, { x: T.x + 150, z: T.z + 70, w: 60, h: 26, a: -1.5 }],
    [{ x: T.x + 88, z: T.z - 60, w: 72, h: 31, a: -0.08 }, { x: T.x - 84, z: T.z + 28, w: 70, h: 30, a: 0.1 }, { x: T.x + 130, z: T.z - 4, w: 60, h: 26, a: -0.9 }, { x: T.x + 66, z: T.z + 60, w: 56, h: 24, a: -1.5 }, { x: T.x - 160, z: T.z - 70, w: 60, h: 26, a: 1.4 }],
    [{ x: T.x - 100, z: T.z - 100, w: 76, h: 33, a: 0.2 }, { x: T.x + 70, z: T.z + 100, w: 72, h: 31, a: -0.2 }, { x: T.x - 146, z: T.z - 10, w: 62, h: 27, a: 1.0 }],
    [{ x: T.x + 110, z: T.z - 112, w: 76, h: 33, a: -0.25 }, { x: T.x - 60, z: T.z + 112, w: 70, h: 30, a: 0.15 }, { x: T.x + 60, z: T.z - 20, w: 50, h: 21.6, a: 0.0 }],
  ];
  for (let k = 0; k < 4; k++) { stand(drawTownRow({ seed: 31 + k, w: 1200, h: 520 }), rowPlaces[k], { fade: 0.5, shadowStrength: 0.2 }); await step('town'); }
  const houseKinds = ['cottage', 'town', 'long', 'tall', 'cottage', 'town'];
  const housePlaces = houseKinds.map(() => []);
  for (let k = 0; k < 44; k++) {
    const a = rnd() * 6.283, r = rnd.range(26, 150);
    const x = T.x + Math.cos(a) * r * 1.1, z = T.z + Math.sin(a) * r * 0.9;
    if (!dry(x, z) || riverAt(x, z).d < 34 || (Math.abs(z - BRIDGE.z) < 16 && Math.abs(x - BRIDGE.x) < 80)) continue;
    const i = k % houseKinds.length, s = rnd.range(0.9, 1.15);
    housePlaces[i].push({ x, z, s, a: rnd.pick([0, 0, 0.15, -0.2, 0.9, -0.9, 0.4, -0.5, 1.4, -1.4, 1.55, -1.2]), flip: rnd.chance(0.35) });
  }
  for (let i = 0; i < houseKinds.length; i++) {
    const d = drawHouse({ seed: 11 + i * 3, kind: houseKinds[i] });
    const u = 1 / 16.5;                              // world units per pixel of house drawing
    stand(d, housePlaces[i].map((p) => ({ ...p, w: d.w * u * p.s, h: d.h * u * p.s })), { fade: 0.5, shadowStrength: 0.2 });
  }
  const tower = drawHouse({ seed: 14, kind: 'tower' });
  stand(tower, [{ x: T.x + 104, z: T.z - 30, w: tower.w / 12, h: tower.h / 12, a: -0.1 }, { x: T.x - 118, z: T.z + 44, w: tower.w / 14, h: tower.h / 14, a: 0.2, flip: true }], { fade: 0.5, shadowStrength: 0.2 });
  const church = drawChurch({ seed: 21 });
  stand(church, [{ x: T.x - 44, z: T.z - 58, w: 42, h: 51, a: 0.06 }], { fade: 0.5, shadowStrength: 0.2 });

  // the bridge: two faces a little apart, so it has thickness from above
  await step('bridge');
  const br = drawBridge({ seed: 41, w: 1400, h: 380 });
  stand(br, [{ x: BRIDGE.x, z: BRIDGE.z + BRIDGE.depth / 2, w: BRIDGE.len, h: BRIDGE.height, a: 0 }, { x: BRIDGE.x, z: BRIDGE.z - BRIDGE.depth / 2, w: BRIDGE.len, h: BRIDGE.height, a: Math.PI }], { fade: 0.5, shadowStrength: 0.2 });
  {
    // the roadway: a strip of paper following the hump of the parapet
    const n = 28, g = new THREE.BufferGeometry(), p = [], u = [], idx = [], nr = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = 30 + t * (br.w - 60), y = ((br.h - br.deckY(px) + 4) / br.h) * BRIDGE.height;
      const x = BRIDGE.x - BRIDGE.len / 2 + (px / br.w) * BRIDGE.len;
      p.push(x, y, BRIDGE.z - BRIDGE.depth / 2, x, y, BRIDGE.z + BRIDGE.depth / 2);
      u.push(t * 6, 0, t * 6, 0.5); nr.push(0, 1, 0, 0, 1, 0);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3)); g.setIndex(idx);
    const dc = canvas(256, 256), dx = dc.getContext('2d');
    dx.fillStyle = dx.createPattern(P.pale, 'repeat'); dx.fillRect(0, 0, 256, 256);
    dx.globalCompositeOperation = 'multiply';
    const dp = new Pen(dx, makeRng(77), { k: 1 });
    for (let k = 0; k < 40; k++) { const yy = rnd() * 256; dp.line(rnd() * 200, yy, rnd() * 200 + 50, yy + rnd.bell() * 4, { w: 1, a: 0.7 }); }
    const dt = sheetTexture(dc, { repeat: true });
    scene.add(new THREE.Mesh(g, sheetMaterial(dt, { fade: 0.5 })));
  }

  // ---- windmill --------------------------------------------------------------
  await step('mill');
  const millHill = hills[0];
  const mill = drawMill({ seed: 51 });
  const mu = 1 / 17, mw = mill.w * mu, mh = mill.h * mu;
  const my = crest(millHill, (MILL.x - millHill.x) / (millHill.w / 2)) - 3.5;
  stand(mill, [{ x: MILL.x, z: MILL.z, y: my, w: mw, h: mh, a: 0 }], { fade: 0.5 });
  {
    const sails = drawSails({ seed: 52 });
    const tex = sheetTexture(sails.canvas, { aniso: maxAniso });
    const size = sails.w * mu;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), sheetMaterial(tex, { fade: 0.5 }));
    m.position.set(MILL.x - mw / 2 + mill.hub[0] * mu, my + mh - mill.hub[1] * mu, MILL.z + 1.4);
    scene.add(m);
    world.spin.push({ mesh: m, speed: -0.42 });
    world.sails = m;
  }

  // ---- boats -----------------------------------------------------------------
  const boatPlaces = [[]];
  for (const [x, z, s, a] of [[640, 80, 1, -0.6], [720, -90, 1.2, -1.0], [620, 300, 0.9, -0.3], [760, 480, 1.3, -0.9], [700, 640, 1, -1.2], [600, -640, 1.1, -0.8]]) {
    if (isSea(x - 10, z)) boatPlaces[0].push({ x, z, w: 15 * s, h: 14 * s, a, shadow: false });
  }
  stand(drawBoat({ seed: 71 }), boatPlaces[0], { fade: 0.5, sway: 0.25, swaySpeed: 0.7 });

  await step('done');
  return world;
}
