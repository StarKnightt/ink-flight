// Keyboard and mouse together.
//
// The mouse is a soft stick: moving it leans the stick, and the stick eases
// back to centre when the mouse rests, so the plane levels itself the way a
// paper plane does. Pointer lock can be refused or lost at any time (Esc,
// alt-tab, a browser that says no); when that happens the game pauses or
// carries on with the keyboard, and never jumps when it comes back.

import { clamp } from './draw/rng.js';
import { TUNE } from './flight.js';

const CONTROL = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'];

export class Controls {
  constructor(canvas, o = {}) {
    this.canvas = canvas;
    this.invert = o.invert ? -1 : 1;
    this.on = o.on ?? (() => {});            // 'start' | 'pause' | 'resume' | 'key' | 'reset' | 'mute'
    this.keys = new Set();
    this.input = { pitch: 0, roll: 0, gust: false, level: false };
    this.stick = { x: 0, y: 0, tx: 0, ty: 0 };
    this.started = false;
    this.paused = false;
    this.locked = false;       // pointer lock held right now
    this.mouse = false;        // flying with the mouse (lock wanted)
    this.refused = false;      // the browser would not give us the pointer
    this.skip = 0;             // movement events to ignore after a lock change
    this.touched = 0;

    addEventListener('keydown', (e) => this.keydown(e));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); if (this.started && !this.paused) this.pause('blur'); });
    addEventListener('focus', () => { if (this.paused && this.why === 'blur' && !this.mouse) this.resume(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.keys.clear(); if (this.started && !this.paused) this.pause('blur'); }
      else if (this.paused && this.why === 'blur' && !this.mouse) this.resume();
    });
    document.addEventListener('pointerlockchange', () => this.lockChange());
    document.addEventListener('pointerlockerror', () => this.lockError());
    document.addEventListener('mousemove', (e) => this.move(e));
    canvas.addEventListener('click', () => this.engage());
  }

  // a click: start if needed, and ask for the pointer
  engage() {
    if (!this.started) { this.started = true; this.on('start'); }
    this.mouse = true;
    if (this.locked) return;
    try {
      // raw movement where the browser offers it: no OS acceleration, less jitter
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = this.canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => this.lockError()); } catch { this.lockError(); } });
    } catch { this.lockError(); }
  }

  lockChange() {
    const now = document.pointerLockElement === this.canvas;
    if (now === this.locked) return;
    this.locked = now;
    this.skip = 2;                                   // the first deltas after a lock can be huge
    this.stick.tx = this.stick.ty = 0;
    if (now) { this.refused = false; if (this.paused) this.resume(); }
    else if (this.mouse && this.started && !this.paused) this.pause('unlock');
  }

  // no pointer lock here: carry on with the keyboard rather than stalling
  lockError() {
    this.refused = true; this.mouse = false; this.locked = false;
    if (this.paused && this.why !== 'blur') this.resume();
  }

  pause(why) {
    if (this.paused) return;
    this.paused = true; this.why = why;
    this.keys.clear();
    this.on('pause', why);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false; this.why = null;
    this.stick.tx = this.stick.ty = 0; this.skip = 2;
    this.on('resume');
  }

  keydown(e) {
    if (e.repeat) return;
    const control = CONTROL.includes(e.code);
    if (control || e.code === 'Enter') {
      e.preventDefault();
      // a flying key starts or resumes the game on the keyboard alone
      if (!this.started) { this.started = true; this.on('start'); }
      else if (this.paused) { this.mouse = this.locked; this.resume(); }
    }
    if (control) { if (!this.keys.has(e.code)) this.touched++; this.keys.add(e.code); }
    // Esc drops pointer lock by itself; on the keyboard alone it pauses too
    if (e.code === 'Escape' && this.started && !this.locked) { this.paused ? this.resume() : this.pause('esc'); }
    if (e.code === 'KeyM') this.on('mute');
    if (e.code === 'KeyR') this.on('reset');
    this.on('key', e.code);
  }

  move(e) {
    if (!this.locked || this.paused) return;
    if (this.skip > 0) { this.skip--; return; }
    const s = TUNE.mouseSens;
    const dx = clamp(e.movementX || 0, -140, 140), dy = clamp(e.movementY || 0, -140, 140);
    this.stick.tx = clamp(this.stick.tx + dx * s, -1, 1);
    // mouse forward lifts the nose; ?invert=1 flips it, the same flag the keys use
    this.stick.ty = clamp(this.stick.ty - dy * s * this.invert, -1, 1);
  }

  // call once per frame; returns the combined stick
  update(dt) {
    const k = (c) => (this.keys.has(c) ? 1 : 0), st = this.stick;
    const level = !!k('Space');
    // the stick drifts home when the hand is still, faster while levelling out
    const home = Math.exp(-dt * (level ? 9 : TUNE.mouseReturn));
    st.tx *= home; st.ty *= home;
    const f = 1 - Math.exp(-dt * TUNE.mouseSmooth);
    st.x += (st.tx - st.x) * f; st.y += (st.ty - st.y) * f;
    const keyPitch = ((k('KeyS') || k('ArrowDown')) - (k('KeyW') || k('ArrowUp'))) * this.invert;
    const keyRoll = (k('KeyD') || k('ArrowRight')) - (k('KeyA') || k('ArrowLeft'));
    const i = this.input;
    i.pitch = clamp(keyPitch + (this.locked ? st.y : 0), -1, 1);
    i.roll = clamp(keyRoll + (this.locked ? st.x : 0), -1, 1);
    i.gust = !!(k('ShiftLeft') || k('ShiftRight'));
    i.level = level;
    return i;
  }
}
