// Seeded randomness. Everything drawn in this game comes from a seed, so a
// sheet looks the same on every load and screenshots are comparable run to run.

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.chance = (p) => f() < p;
  // rough bell curve around 0, about -1..1
  f.bell = () => (f() + f() + f() - 1.5) / 1.5;
  f.fork = () => makeRng(Math.floor(f() * 4294967296));
  return f;
}

function hash1(i) {
  let x = (i | 0) * 374761393;
  x = (x ^ (x >>> 13)) * 1274126177;
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967296) * 2 - 1;
}

// smooth 1D value noise, -1..1
export function noise1(x) {
  const i = Math.floor(x);
  const t = x - i;
  const s = t * t * (3 - 2 * t);
  return hash1(i) * (1 - s) + hash1(i + 1) * s;
}

export function fbm1(x, oct = 4, gain = 0.5) {
  let v = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    v += noise1(x * f + o * 17.31) * amp;
    norm += amp; amp *= gain; f *= 2.03;
  }
  return v / norm;
}

function hash2(ix, iy) {
  let x = (ix | 0) * 374761393 + (iy | 0) * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967296) * 2 - 1;
}

// 2D value noise, -1..1. `period` makes it tile.
export function noise2(x, y, period = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const tx = x - ix, ty = y - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const w = (v) => (period ? ((v % period) + period) % period : v);
  const a = hash2(w(ix), w(iy)), b = hash2(w(ix + 1), w(iy));
  const c = hash2(w(ix), w(iy + 1)), d = hash2(w(ix + 1), w(iy + 1));
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
