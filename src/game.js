// Boot, loop, cameras, and the hooks the browser check uses.
//
// URL flags:
//   ?hud=0        no start screen, hints or key legend: clean for recording
//   ?cam=NAME     fixed camera bookmark (see CAMERAS in layout.js); "hero" is the spawn view
//   ?freeze=1     draw one still frame and stop (no animation loop)
//   ?t=SECONDS    world time for a frozen frame
//   ?light=0      drawings only, with the light-through-paper pass switched off
//   ?invert=1     flips pitch on both the keys and the mouse
//   ?debug=1      log the GPU adapter and frame stats
//   ?webgl=1      use the WebGL 2 backend instead of WebGPU
//   ?gallery=SET  flat review of the drawings (land, trees, town, ground, marks)

import * as THREE from 'three/webgpu';
import { buildWorld } from './world.js';
import { buildPlane, Flight, Chase } from './flight.js';
import { Air } from './air.js';
import { Sound } from './audio.js';
import { Controls } from './input.js';
import { drawKeys } from './draw/marks.js';
import { papers } from './draw/paper.js';
import { U, sheetTexture, markMaterial } from './materials.js';
import { CAMERAS, SPAWN, SUN, WORLD } from './layout.js';
import { installWorldTaste } from './world-taste-hook.js';

// how many times the world build reports in; the loader's pen follows this
const STEPS = 45;

async function describeGpu(renderer) {
  const b = renderer.backend;
  if (b.isWebGPUBackend) {
    const info = b.device?.adapterInfo ?? (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }))?.info ?? {};
    return { api: 'WebGPU', renderer: [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ') || 'unknown' };
  }
  const gl = b.gl, ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { api: 'WebGL2', renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' };
}
const SOFTWARE = /swiftshader|llvmpipe|software|basic render|warp/i;

// let the page paint, even in a tab that is not being shown
const breathe = () => new Promise((res) => {
  let done = false;
  const f = () => { if (!done) { done = true; res(); } };
  requestAnimationFrame(f); setTimeout(f, 40);
});

export async function boot(q, loader, onReady) {
  const debug = q.has('debug') || import.meta.env.DEV;
  const freeze = q.get('freeze') === '1';
  const camName = q.get('cam');
  const showHud = q.get('hud') !== '0' && !camName;

  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance', forceWebGL: q.get('webgl') === '1' });
  await renderer.init();
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  loader?.set(0.05);

  const gpu = await describeGpu(renderer);
  gpu.software = SOFTWARE.test(gpu.renderer);
  if (debug) console.log('[gpu]', gpu.api, '|', gpu.renderer);
  if (gpu.software && !q.has('allow-software')) console.warn('[gpu] software rasteriser in use: this will be slow and is not a valid capture');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 9000);
  const flight = new Flight(SPAWN);
  const chase = new Chase(camera);
  chase.snap(flight);

  // ---- cameras ---------------------------------------------------------------
  let fixed = camName && camName !== 'hero' ? CAMERAS[camName] : null;
  let hold = false;            // plane parked at the spawn (still shots)
  let timeScale = 1;
  const setFixed = (c) => { camera.up.set(0, 1, 0); camera.position.set(...c.pos); camera.lookAt(...c.at); camera.fov = c.fov ?? 58; camera.updateProjectionMatrix(); };

  // world-taste: the same shots every run, for its browser check
  let worldReady;
  const ready = new Promise((r) => { worldReady = r; });
  const shots = {
    hero: { position: chase.pos.toArray(), target: chase.look.toArray() },
    wide: { position: [330, 150, 620], target: [-40, 30, -120] },
    ground: { position: [...CAMERAS.low.pos], target: [...CAMERAS.low.at] },
    away: { position: [-260, 70, -160], target: [340, 20, 200] },
    town: { position: [...CAMERAS.town.pos], target: [...CAMERAS.town.at] },
    motion: { position: chase.pos.toArray(), target: chase.look.toArray() },
  };
  let controls = null, plane = null;
  installWorldTaste({
    camera, ready, cameras: shots,
    setTimeScale: (s) => { timeScale = s; },
    beforeShot: (name) => {
      if (name === 'hero' || name === 'motion') {
        fixed = null; hold = name === 'hero';
        flight.reset(); chase.snap(flight);
        if (controls) { controls.started = true; controls.paused = false; }
      } else { fixed = { pos: shots[name].position, at: shots[name].target }; hold = true; }
    },
  });

  // ---- build the set; the loader's pen draws as far as this has got ----------
  papers();
  let done = 0, lastBreath = performance.now();
  const step = async (label) => {
    done++;
    loader?.set(0.06 + 0.92 * Math.min(1, done / STEPS));
    if (performance.now() - lastBreath > 22) { await breathe(); lastBreath = performance.now(); }
    return label;
  };
  const t0 = performance.now();
  const world = await buildWorld(scene, renderer, step);
  const air = new Air(scene);
  plane = buildPlane();
  scene.add(plane);
  // its shadow on the map: a soft smudge that slides away from the sun
  const shadow = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.filter = 'blur(7px)'; g.fillStyle = 'rgba(58,62,84,0.9)';
    g.beginPath(); g.moveTo(64, 14); g.lineTo(104, 104); g.lineTo(64, 86); g.lineTo(24, 104); g.closePath(); g.fill();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), markMaterial(sheetTexture(c, { aniso: 4 }), { opacity: 0.5 }));
    m.rotation.order = 'YXZ'; m.rotation.x = -Math.PI / 2; m.renderOrder = -1;
    scene.add(m);
    return m;
  })();
  const buildMs = performance.now() - t0;
  if (debug) console.log(`[world] ${world.stats.sheets} sheets, ${world.stats.textures} drawings, ${done} steps, built in ${buildMs.toFixed(0)} ms`);

  if (q.get('light') === '0') U.light.value = 0;

  const sound = new Sound();

  // ---- start screen, hints, key legend ---------------------------------------
  const startEl = document.getElementById('start'), hintEl = document.getElementById('hint'), hud = document.getElementById('hud');
  const showStart = showHud && !freeze;
  let hudGone = !showHud;
  const showKeys = () => {
    if (!showHud || hud.firstChild) return;
    const kc = drawKeys().canvas; kc.style.width = `${kc.width * 0.62}px`;
    hud.appendChild(kc); setTimeout(() => hud.classList.add('on'), 900);
  };

  // ---- input: mouse (pointer lock) and keyboard together ----------------------
  const timer = new THREE.Timer();
  controls = new Controls(canvas, {
    invert: q.get('invert') === '1',
    on: (what, arg) => {
      if (what === 'start') { sound.start(); startEl.classList.remove('on'); setTimeout(() => { startEl.hidden = true; }, 700); showKeys(); timer.reset(); }
      else if (what === 'pause') { sound.hush(true); if (showHud) { hintEl.hidden = false; requestAnimationFrame(() => hintEl.classList.add('on')); } }
      else if (what === 'resume') { sound.hush(false); hintEl.classList.remove('on'); timer.reset(); }
      else if (what === 'mute') sound.setMuted(!sound.muted);
      else if (what === 'reset') { flight.reset(); chase.snap(flight); }
      else if (what === 'key') { if (controls.started) sound.start(); void arg; }
    },
  });
  document.getElementById('start-btn').addEventListener('click', () => controls.engage());
  hintEl.addEventListener('click', () => controls.engage());
  if (!showStart) controls.started = true;      // recording and check modes begin flying at once

  flight.pose(plane);
  chase.snap(flight);
  if (fixed) setFixed(fixed);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', () => { resize(); if (freeze) frame(0); });

  // ---- loop --------------------------------------------------------------------
  let worldT = parseFloat(q.get('t') || '0'), idleT = 0, frames = 0, acc = 0, fps = 0, lastRustle = 0;
  const frame = (rawDt) => {
    // paused: the picture holds and nothing advances, so nothing can jump on return
    const dt = (controls.paused ? 0 : rawDt) * timeScale;
    worldT += dt; idleT += rawDt;
    const input = controls.update(rawDt);
    const live = controls.started && !controls.paused && !hold && !(fixed && freeze);
    if (live) {
      // fixed small steps keep the feel identical at any frame rate
      let left = Math.min(dt, 0.1);
      while (left > 1e-5) { const h = Math.min(left, 1 / 120); flight.step(h, input); left -= h; }
    }
    flight.pose(plane);
    if (!controls.started) {
      // waiting on the start screen: the plane hangs on the air
      plane.position.y += Math.sin(idleT * 1.2) * 0.35;
      plane.rotation.z += Math.sin(idleT * 0.8) * 0.05;
      plane.rotation.x += Math.sin(idleT * 0.6 + 1) * 0.02;
    }
    {
      const h = flight.pos.y, k = 1.5 / Math.hypot(SUN[0], SUN[2]);
      shadow.position.set(flight.pos.x - SUN[0] * k * h, 0.35, flight.pos.z - SUN[2] * k * h);
      shadow.rotation.y = flight.yaw;
      shadow.scale.setScalar(1 + h * 0.012);
      shadow.visible = h < 170 && Math.abs(shadow.position.x) < WORLD.half && Math.abs(shadow.position.z) < WORLD.half;
    }
    if (!fixed) chase.update(flight, Math.max(live ? dt : 0, 1e-4)); else setFixed(fixed);
    for (const s of world.spin) s.mesh.rotation.z = worldT * s.speed;
    world.sky.position.set(camera.position.x, 0, camera.position.z);
    air.update(dt, flight, camera);
    // a rustle as the plane enters cloud
    let rustle = 0;
    if (air.inCloud > 0.3 && worldT - lastRustle > 0.5) { rustle = 0.7; lastRustle = worldT; }
    if (dt > 0) sound.update(dt, flight, { inCloud: air.inCloud, rustle });
    flight.events.length = 0;
    if (!hudGone && controls.started && (controls.touched >= 4 || worldT > 40)) { hudGone = true; setTimeout(() => hud.classList.remove('on'), 2500); }
    renderer.render(scene, camera);
    frames++; acc += rawDt;
    if (acc > 1) { fps = frames / acc; frames = 0; acc = 0; if (q.has('debug')) console.log(`[fps] ${fps.toFixed(0)}  calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}`); }
  };
  const tick = (ms) => { timer.update(ms); frame(Math.min(timer.getDelta(), 0.1)); };

  // where the plane sits on screen, so the loader's dart can land on it
  const planeScreen = () => {
    const v = new THREE.Vector3();
    plane.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const P = (x, y, z) => { v.set(x, y, z).applyMatrix4(plane.matrixWorld).project(camera); return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight]; };
    const nose = P(0, 0, -2.2), tl = P(-0.84, 0.2, 1.42), tr = P(0.84, 0.2, 1.42);
    const mx = (tl[0] + tr[0]) / 2, my = (tl[1] + tr[1]) / 2;
    return { x: (nose[0] + mx) / 2, y: (nose[1] + my) / 2, w: Math.abs(tr[0] - tl[0]), h: Math.abs(my - nose[1]) };
  };

  // the first frames, drawn under the loader before it lets go
  frame(0.016); frame(0.016);
  if (!freeze) {
    renderer.setAnimationLoop(tick);
    // nothing renders while the tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { renderer.setAnimationLoop(null); sound.ctx?.suspend(); }
      else { timer.reset(); renderer.setAnimationLoop(tick); if (sound.ctx && !sound.muted) sound.ctx.resume(); }
    });
  }
  loader?.set(1);
  // the loader's own dart stands in for the plane until it lands on it
  const landing = fixed ? null : planeScreen();
  if (loader && !freeze && !fixed) plane.visible = false;
  await loader?.finish(landing, freeze || !!fixed);
  plane.visible = true;
  if (showStart) { startEl.hidden = false; await breathe(); startEl.classList.add('on'); }
  worldReady(); onReady?.();

  // ---- hooks for the browser check -----------------------------------------------
  // test hooks: dev server or ?debug only, never in a plain production page
  if (!debug) return;
  window.__ink = {
    gpu, world, flight, air, camera, renderer, scene, U, buildMs, sound, tick, controls, planeScreen, steps: done,
    fps: () => fps,
    info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }),
    cam(name) { if (name === 'hero') { flight.reset(); flight.pose(plane); chase.snap(flight); } else setFixed(CAMERAS[name]); },
    // social preview: one composed frame with the title lettered in pen
    async og(name = 'og-image', w = 1280, h = 640) {
      const { Pen } = await import('./draw/ink.js');
      const { makeRng } = await import('./draw/rng.js');
      const pr = renderer.getPixelRatio();
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      flight.reset();
      flight.pos.set(96, 66, 372); flight.yaw = 0.2; flight.pitch = 0.02; flight.roll = 0.3; flight._dir();
      flight.pose(plane);
      camera.up.set(0, 1, 0); camera.fov = 46; camera.aspect = w / h;
      camera.position.set(103.5, 69.2, 381); camera.lookAt(60, 52, 160); camera.updateProjectionMatrix();
      world.sky.position.set(camera.position.x, 0, camera.position.z);
      air.update(0.016, flight, camera); flight.events.length = 0;
      shadow.visible = false;
      renderer.render(scene, camera);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(canvas, 0, 0);
      // letters built from pen strokes on a 5 x 7 grid
      const G = {
        I: [[[2, 0], [2, 7]], [[1, 0], [3, 0]], [[1, 7], [3, 7]]],
        N: [[[0, 7], [0, 0]], [[0, 0], [4, 7]], [[4, 7], [4, 0]]],
        K: [[[0, 0], [0, 7]], [[4, 0], [0, 4.2]], [[1.3, 3.1], [4.2, 7]]],
        F: [[[0, 7], [0, 0]], [[0, 0], [4, 0]], [[0, 3.3], [3, 3.3]]],
        L: [[[0, 0], [0, 7]], [[0, 7], [4, 7]]],
        G: [[[4, 1.3], [2.7, 0.1], [1.1, 0.4], [0.1, 2.4], [0.1, 4.8], [1.2, 6.7], [2.8, 6.9], [4, 5.9], [4, 4]], [[2.4, 4], [4.3, 4]]],
        H: [[[0, 0], [0, 7]], [[4, 0], [4, 7]], [[0, 3.5], [4, 3.5]]],
        T: [[[0, 0], [4.4, 0]], [[2.2, 0], [2.2, 7]]],
      };
      g.globalCompositeOperation = 'multiply';
      const pen = new Pen(g, makeRng(31), { k: 1 });
      const u = 9.5; let x = 64; const y = 60;
      for (const ch of 'INK FLIGHT') {
        if (ch === ' ') { x += u * 3.4; continue; }
        pen.dip();
        for (const st of G[ch]) pen.stroke(st.map((p) => [x + p[0] * u, y + p[1] * u]), { w: 5.2, wob: 0.9, t0: 0.08, t1: 0.25, smooth: st.length > 2 });
        x += u * (ch === 'I' ? 4.6 : 6.3);
      }
      pen.script(64, y + u * 7 + 26, 330, 2, { size: 6.5, lh: 20, w: 1.5, a: 0.75 });
      // GitHub's social preview wants a file under 1 MB, so this one is a JPEG
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      const res = await fetch(`/__shot?name=${encodeURIComponent(name)}&ext=jpg`, { method: 'POST', body: blob });
      renderer.setPixelRatio(pr); resize(); shadow.visible = true;
      return { name, bytes: blob.size, saved: res.ok };
    },
    // step the game by hand with some keys held: the check does not depend on rAF
    advance(seconds, held = [], dt = 1 / 60, mouse = null) {
      controls.started = true; controls.paused = false; hold = false;
      held.forEach((c) => controls.keys.add(c));
      // mouse: [dx, dy] pixels per second, fed as if the pointer were locked
      const was = controls.locked;
      if (mouse) { controls.locked = true; controls.skip = 0; }
      for (let t = 0; t < seconds; t += dt) {
        if (mouse) controls.move({ movementX: mouse[0] * dt, movementY: mouse[1] * dt });
        frame(dt);
      }
      held.forEach((c) => controls.keys.delete(c));
      controls.locked = was;
      return { pos: flight.pos.toArray().map((v) => +v.toFixed(1)), speed: +flight.speed.toFixed(1), pitch: +flight.pitch.toFixed(2), roll: +flight.roll.toFixed(2), yaw: +flight.yaw.toFixed(2), stall: +flight.stall.toFixed(2), stick: [+controls.stick.x.toFixed(2), +controls.stick.y.toFixed(2)] };
    },
    // time whole frames including the GPU finishing its work, at a set size
    async bench(n = 120, w = 1920, h = 1080) {
      const pr = renderer.getPixelRatio();
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      controls.started = true; controls.paused = false; hold = false;
      const dev = renderer.backend.device;
      const times = [];
      for (let i = 0; i < n + 10; i++) {
        const t0b = performance.now();
        frame(1 / 60);
        if (dev) await dev.queue.onSubmittedWorkDone();
        if (i >= 10) times.push(performance.now() - t0b);
      }
      renderer.setPixelRatio(pr); resize();
      times.sort((a, b) => a - b);
      const avg = times.reduce((s, v) => s + v, 0) / times.length;
      return { size: `${w}x${h}`, frames: n, avgMs: +avg.toFixed(2), p95Ms: +times[Math.floor(n * 0.95)].toFixed(2), worstMs: +times[n - 1].toFixed(2), fpsAvg: Math.round(1000 / avg), gpu: gpu.renderer, ...this.info() };
    },
    // render one still at an exact size and save it through the dev server
    async shot(name, w = 1600, h = 900, cam = null, t = null, jpg = false) {
      if (gpu.software && !q.has('allow-software')) throw new Error(`refusing to capture on a CPU rasteriser: ${gpu.renderer}`);
      const pr = renderer.getPixelRatio();
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (t !== null) worldT = t;
      if (cam) this.cam(cam);
      for (const s of world.spin) s.mesh.rotation.z = worldT * s.speed;
      world.sky.position.set(camera.position.x, 0, camera.position.z);
      air.update(0.016, flight, camera); flight.events.length = 0;
      renderer.render(scene, camera);
      const blob = await new Promise((r) => canvas.toBlob(r, jpg ? 'image/jpeg' : 'image/png', 0.9));
      const res = await fetch(`/__shot?name=${encodeURIComponent(name)}&ext=${jpg ? 'jpg' : 'png'}`, { method: 'POST', body: blob });
      renderer.setPixelRatio(pr); resize();
      return { name, bytes: blob.size, saved: res.ok, gpu: gpu.renderer };
    },
  };
}
