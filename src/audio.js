// All sound is made here from noise and a few oscillators. No audio files.
// Wind follows airspeed, paper flutters and rustles, banking scratches like a
// pencil, and a sparse tune drifts underneath, quiet enough to forget.

import { clamp, noise1 } from './draw/rng.js';

const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.t = 0; }

  start() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const out = (this.out = ctx.createGain());
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, ctx.currentTime + 2.5);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.3;
    out.connect(comp).connect(ctx.destination);

    // one long buffer of noise feeds every airy sound
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;       // pinkish
    }
    this.noise = buf;
    const src = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random() * 2; s.start(0, Math.random() * 2.5); return s; };
    const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1);
    this.pan.connect(out);

    // wind: a low body and a high hiss
    this.windLP = filt('lowpass', 400, 0.4); this.windG = gain(0);
    src().connect(this.windLP).connect(this.windG).connect(this.pan);
    this.hissBP = filt('bandpass', 1500, 0.5); this.hissG = gain(0);
    src().connect(this.hissBP).connect(this.hissG).connect(this.pan);

    // paper: thin and bright, trembling
    this.paperG = gain(0);
    src().connect(filt('highpass', 2600, 0.7)).connect(filt('bandpass', 5200, 1.1)).connect(this.paperG).connect(this.pan);
    const trem = ctx.createOscillator(); trem.type = 'sawtooth'; trem.frequency.value = 21;
    const tremG = gain(0); this.tremG = tremG;
    trem.connect(tremG).connect(this.paperG.gain); trem.start();

    // pencil: two narrow bands, scratched by a fast uneven tremor
    this.scratchG = gain(0);
    const sA = filt('bandpass', 2500, 3.2), sB = filt('bandpass', 4300, 4.5), sS = src();
    sS.connect(sA).connect(this.scratchG); sS.connect(sB).connect(this.scratchG);
    this.scratchG.connect(this.pan);
    const jit = ctx.createOscillator(); jit.type = 'triangle'; jit.frequency.value = 47;
    this.jitG = gain(0); jit.connect(this.jitG).connect(this.scratchG.gain); jit.start();
    this.scratchA = sA; this.scratchB = sB;

    // a room for the music: generated impulse, a few seconds of fading noise
    const il = ctx.sampleRate * 3.4, ir = ctx.createBuffer(2, il, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < il; i++) { const e = Math.pow(1 - i / il, 2.6); lp += ((Math.random() * 2 - 1) - lp) * 0.32; x[i] = lp * e; }
    }
    this.rev = ctx.createConvolver(); this.rev.buffer = ir;
    this.music = gain(0.5);
    this.revG = gain(0.85);
    this.rev.connect(this.revG).connect(this.music);
    this.music.connect(out);
    this.pad = []; this.chord = -1; this.nextChord = 0; this.nextNote = ctx.currentTime + 3;
  }

  // pause: everything drops to a murmur and comes back on resume
  hush(on) {
    this.hushed = on;
    if (this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : on ? 0.12 : 0.9, this.ctx.currentTime, 0.25);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : this.hushed ? 0.12 : 0.9, this.ctx.currentTime, 0.15);
  }

  burst(type, f0, f1, q, peak, dur, grains = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    if (grains) {
      // crinkle: a handful of tiny uneven peaks
      let tt = t;
      for (let i = 0; i < grains; i++) {
        tt += 0.006 + Math.random() * (dur / grains);
        g.gain.linearRampToValueAtTime(peak * (0.25 + Math.random() * 0.75), tt);
        g.gain.linearRampToValueAtTime(peak * 0.04, tt + 0.008 + Math.random() * 0.02);
      }
      g.gain.linearRampToValueAtTime(0.0001, tt + 0.06);
    } else {
      g.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    s.connect(f).connect(g).connect(this.pan);
    s.start(t, Math.random() * 2, dur + 0.3);
  }

  rustle(k = 1) { this.burst('bandpass', 3600 + Math.random() * 2400, 5200, 0.9, 0.2 * k, 0.22 + Math.random() * 0.12, 5 + Math.floor(Math.random() * 5)); }
  whoosh() { this.burst('bandpass', 320, 1500, 0.8, 0.34, 1.35); this.rustle(0.7); }
  scuff() { this.burst('lowpass', 900, 300, 0.6, 0.28, 0.25); this.rustle(1.1); }

  // a soft struck note: sine with a little second harmonic, long tail in the room
  note(n, vel = 1, when = 0) {
    const ctx = this.ctx, t = ctx.currentTime + when, f = hz(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    for (const [mult, amp, type] of [[1, 1, 'sine'], [2, 0.22, 'sine'], [3.01, 0.06, 'triangle']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mult;
      const og = ctx.createGain(); og.gain.value = amp;
      o.connect(og).connect(g); o.start(t); o.stop(t + 3.4);
    }
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = Math.random() * 1.2 - 0.6;
    g.connect(p); p.connect(this.rev);
    const dry = ctx.createGain(); dry.gain.value = 0.35; p.connect(dry).connect(this.music);
  }

  // slow pad: each chord fades in over the one before
  setChord(i) {
    const ctx = this.ctx, t = ctx.currentTime;
    const CH = [[50, 57, 66], [47, 54, 62], [43, 50, 59, 64], [45, 52, 61]];   // D, Bm, G(add6), A
    for (const v of this.pad) { v.g.gain.setTargetAtTime(0, t, 3.5); v.stop(t + 16); }
    this.pad = [];
    for (const n of CH[i]) for (const det of [-5, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(n); o.detune.value = det;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.011, t + 6);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620;
      o.connect(lp).connect(g); g.connect(this.rev);
      const d2 = ctx.createGain(); d2.gain.value = 0.4; g.connect(d2).connect(this.music);
      o.start(t);
      this.pad.push({ g, stop: (w) => o.stop(w) });
    }
    this.chord = i;
    this.tones = CH[i];
  }

  update(dt, f, env = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.t += dt;
    const v = f.speed, sp = clamp(v / 40, 0, 1.4);
    const wob = 0.8 + 0.2 * noise1(this.t * 0.7) + 0.12 * noise1(this.t * 2.3);
    const cloud = env.inCloud ?? 0;
    const set = (p, val, tc = 0.08) => p.setTargetAtTime(val, now, tc);
    set(this.windG.gain, (0.05 + 0.32 * Math.pow(sp, 1.5)) * wob * (1 - cloud * 0.45));
    set(this.windLP.frequency, (230 + v * 30) * (1 - cloud * 0.5), 0.15);
    set(this.hissG.gain, (0.012 + 0.11 * sp * sp + f.gust * 0.05) * wob);
    set(this.hissBP.frequency, 900 + v * 55, 0.15);
    if (this.pan.pan) set(this.pan.pan, clamp(-f.roll * 0.45, -0.6, 0.6), 0.2);
    // paper trembles in a stall, in a gust, and whenever the stick moves
    const paper = 0.012 + f.stall * 0.06 + f.gust * 0.04 + Math.min(0.05, Math.abs(f.rollRate) * 0.03) + cloud * 0.03;
    set(this.paperG.gain, paper * (0.6 + 0.4 * noise1(this.t * 9)), 0.03);
    set(this.tremG.gain, paper * 0.7, 0.05);
    // pencil scratch rides the rate of bank, with a little while held over
    const sc = clamp(Math.abs(f.rollRate) * 0.11 + Math.max(0, Math.abs(f.roll) - 0.5) * 0.035, 0, 0.14) * clamp(v / 16, 0.4, 1.3);
    set(this.scratchG.gain, sc * (0.55 + 0.45 * noise1(this.t * 31)), 0.02);
    set(this.jitG.gain, sc * 0.6, 0.03);
    set(this.scratchA.frequency, 2300 + v * 22 + noise1(this.t * 5) * 300, 0.05);
    set(this.scratchB.frequency, 4000 + v * 30 + noise1(this.t * 4 + 9) * 500, 0.05);

    for (const e of f.events) {
      if (e === 'gust') this.whoosh();
      else if (e === 'skim') this.scuff();
    }
    if (env.rustle) this.rustle(env.rustle);

    // the tune: one chord for a long breath, a note now and then
    if (now >= this.nextChord) { this.setChord((this.chord + 1 + (Math.random() < 0.25 ? 1 : 0)) % 4); this.nextChord = now + 15 + Math.random() * 6; }
    if (now >= this.nextNote) {
      const scale = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
      const pool = Math.random() < 0.6 ? this.tones.map((n) => n + 12 + (Math.random() < 0.4 ? 12 : 0)) : scale;
      const n = pool[Math.floor(Math.random() * pool.length)];
      this.note(n, 0.6 + Math.random() * 0.4);
      const r = Math.random();
      if (r < 0.4) this.note(scale[Math.floor(Math.random() * scale.length)], 0.5, 0.35 + Math.random() * 0.5);
      if (r < 0.12) this.note(n + 7, 0.4, 1.1 + Math.random() * 0.4);
      // higher and a touch busier when you are high and fast, but never crowded
      this.nextNote = now + 2.2 + Math.random() * 4.2 - clamp(f.pos.y / 300, 0, 1) * 0.8;
    }
  }
}
