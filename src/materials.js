// Materials. Nothing here is lit in the usual sense: colour comes from the
// drawing. The only "lighting" is whether the late sun falls on the face of a
// sheet you are looking at, or reaches you through the paper from behind.

import * as THREE from 'three/webgpu';
import {
  texture, uv, uniform, vec2, vec3, float, mix, smoothstep, positionWorld, positionLocal, normalWorld, normalLocal,
  cameraPosition, time, attribute, dot, normalize, length, saturate, pow, sin, sign, max, min, fwidth,
} from 'three/tsl';
import { SUN } from './layout.js';

export const U = {
  sun: uniform(new THREE.Vector3(...SUN)),
  sky: uniform(new THREE.Color(0xe5dbc3)),      // the horizon cream the ground fades toward
  haze: uniform(new THREE.Color(0xb4c3ce)),     // the cool blue-grey that distance lays over a sheet
  fadeNear: uniform(420),
  fadeFar: uniform(1900),
  light: uniform(1),                            // 0 = drawings only, no light (diagnostic view)
};

let grainTex = null;
export function setGrain(tex) { grainTex = tex; }

// Canvas textures are uploaded premultiplied and decoded here, so the cut
// edge of a sheet never picks up a dark fringe from transparent texels.
export function sheetTexture(cnv, o = {}) {
  const t = new THREE.CanvasTexture(cnv);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = true;
  t.anisotropy = o.aniso ?? 8;
  t.generateMipmaps = o.mips ?? true;
  t.minFilter = t.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

const decode = (t) => {
  const a = t.a;
  const srgb = t.rgb.div(max(a, 0.004));
  return { rgb: pow(max(srgb, 0.0), vec3(2.2)), a };
};

// When a drawing is seen larger than it was drawn, bilinear filtering turns
// pen strokes into soft smears. This puts the edge back: where the texture is
// magnified, anything dark enough to be a stroke snaps to ink and the rest
// keeps its wash tone. It is the trick used for crisp text, applied to a pen.
function crisp(rgb, uvNode, size) {
  const fw = fwidth(uvNode.mul(size));
  const mag = saturate(float(1).sub(max(fw.x, fw.y).mul(1.5)));
  const lum = dot(rgb, vec3(0.3, 0.5, 0.2));
  const d = saturate(float(1).sub(lum.div(0.66)));
  // thresholds sit above the darkest wash, so only pen and pencil snap
  const ink = smoothstep(0.6, 0.74, d);
  const hue = rgb.div(max(lum, 0.03));
  const washRgb = hue.mul(float(0.66).mul(float(1).sub(min(d, 0.55))));
  const sharp = mix(washRgb, hue.mul(0.085), ink);
  return mix(rgb, sharp, mag);
}

// Bistre should sit dark on the page. This deepens marks in proportion to
// how dark they already are and leaves bare paper untouched.
function weigh(rgb, amt = 0.5) {
  const lum = dot(rgb, vec3(0.3, 0.5, 0.2));
  const d = saturate(float(1).sub(lum.div(0.64)));
  return rgb.mul(float(1).sub(d.mul(amt)));
}

// what the eye gets from a sheet, given the drawing on it
function lightSheet(rgb, o = {}) {
  const V = normalize(cameraPosition.sub(positionWorld));
  const N = normalize(normalWorld);
  const side = sign(dot(N, V));                 // +1 looking at the drawn face
  const Nf = N.mul(side);
  const sunOn = smoothstep(-0.1, 0.14, dot(Nf, U.sun));   // 1: sun on the face we see
  const toward = saturate(dot(V.negate(), U.sun));        // looking into the light
  const glow = pow(toward, 2.2);

  // from behind, ink shows through the sheet faint and mirrored
  const back = smoothstep(0.0, -0.05, side);
  const paper = vec3(0.86, 0.79, 0.62);
  const drawn = mix(rgb, mix(rgb, paper, 0.3), back);

  // light through the paper: warmer, and brighter the more we face the sun,
  // with the uneven density of the sheet showing as cloudiness
  // away from the sun the shadow side is cool; toward it the paper glows warm
  let through = drawn.mul(mix(vec3(0.80, 0.79, 0.80), vec3(1.04, 0.93, 0.71), glow));
  if (grainTex) {
    const form = texture(grainTex, positionWorld.xz.add(positionWorld.yy).mul(0.012)).r.sub(0.5);
    through = through.mul(float(1).add(form.mul(glow.mul(0.5).add(0.22))));
  }
  const onFace = drawn.mul(vec3(0.97, 0.92, 0.83));
  const lit = mix(through, onFace, sunOn);
  let col = mix(drawn, lit, U.light);

  // distance cools and pales: far sheets take on the blue-grey of the air
  const d = length(cameraPosition.sub(positionWorld));
  const f = smoothstep(U.fadeNear, U.fadeFar, d).mul(o.fade ?? 0.5);
  col = mix(col, U.haze, f);
  return col;
}

// A standing sheet: cut paper, drawn on one side.
export function sheetMaterial(tex, o = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  // a small negative bias keeps pen lines from dissolving when a sheet is far off
  const t = decode(texture(tex, uv()).bias(o.bias ?? -0.75));
  const size = Math.max(tex.image?.width ?? 1024, tex.image?.height ?? 1024);
  m.colorNode = lightSheet(weigh(o.crisp === false ? t.rgb : crisp(t.rgb, uv(), size)), o);
  // The cut edge is resolved by multisample coverage instead of a hard test.
  // That gives a clean silhouette, and lets a sheet thin away as it turns
  // edge-on to the eye instead of collapsing into a bright sliver.
  const cut = saturate(t.a.sub(0.5).div(max(fwidth(t.a), 0.0005)).add(0.5));
  const V = normalize(cameraPosition.sub(positionWorld));
  const facing = dot(normalize(normalWorld), V).abs();
  m.opacityNode = cut.mul(smoothstep(0.03, o.edge ?? 0.2, facing));
  m.alphaToCoverage = true;
  m.alphaTest = 0.02;
  if (o.sway) {
    // paper standing in a breeze: the top edge breathes a little
    const ph = positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.05)).add(time.mul(o.swaySpeed ?? 1.1));
    const amt = uv().y.mul(uv().y).mul(o.sway);
    m.positionNode = positionLocal.add(normalLocal.mul(sin(ph).mul(amt)));
  }
  return m;
}

// The wash-like shadow a sheet throws on the ground: its own silhouette, sheared.
export function shadowMaterial(tex, o = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const a = texture(tex, uv()).bias(2.2).a;
  const d = length(cameraPosition.sub(positionWorld));
  const far = float(1).sub(smoothstep(500, 1300, d));
  m.colorNode = vec3(0.075, 0.085, 0.15);        // shadows carry the sky: cool slate, not brown
  // darkest at the foot, thinning toward the tip
  m.opacityNode = smoothstep(0.25, 0.7, a).mul(o.strength ?? 0.2).mul(float(1).sub(uv().y.mul(0.55))).mul(far).mul(U.light);
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  return m;
}

// Soft white body colour for clouds.
export function cloudMaterial(tex) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const t = decode(texture(tex, uv()));
  const V = normalize(cameraPosition.sub(positionWorld));
  const glow = pow(saturate(dot(V.negate(), U.sun)), 2.0);
  const lit = t.rgb.mul(mix(vec3(0.985, 0.97, 0.945), vec3(1.05, 1.0, 0.9), glow));
  const d = length(cameraPosition.sub(positionWorld));
  m.colorNode = mix(mix(t.rgb, lit, U.light), U.haze, smoothstep(500, 2400, d).mul(0.35));
  // a sheet turning edge-on thins out rather than smearing into a streak
  // the two crossed sheets of a cloud swap over a narrow band around 45 degrees
  const edge = smoothstep(0.66, 0.76, dot(normalize(normalWorld), V).abs());
  m.opacityNode = t.a.mul(0.96).mul(edge);
  return m;
}

// The map on the ground.
export function groundMaterial(tex, detail, o = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: !!o.transparent });
  const t = texture(tex, uv());
  let rgb = pow(max(t.rgb.div(max(t.a, 0.004)), 0.0), vec3(2.2));
  if (o.crisp) rgb = crisp(rgb, uv(), o.crisp);
  rgb = weigh(rgb, 0.4);
  const d = length(cameraPosition.sub(positionWorld));
  if (detail) {
    // repeating grain and tick marks, strongest close to the camera
    const dt = texture(detail, positionWorld.xz.mul(1 / 46)).rgb;
    const dt2 = grainTex ? float(1).add(texture(grainTex, positionWorld.xz.mul(1 / 13).add(vec2(0.37, 0.11))).r.sub(0.5).mul(0.3)) : float(1);
    const near = float(1).sub(smoothstep(30, 420, d));
    rgb = rgb.mul(mix(vec3(1), dt.mul(1.16), near.mul(0.9))).mul(mix(float(1), dt2, float(1).sub(smoothstep(6, 90, d))));
  }
  // low sun rakes across the sheet: a touch warmer and brighter looking into it
  const V = normalize(cameraPosition.sub(positionWorld));
  const glow = pow(saturate(dot(V.negate(), U.sun)), 3.0);
  const lit = rgb.mul(mix(vec3(0.97, 0.945, 0.9), vec3(1.07, 0.99, 0.85), glow));
  const f = smoothstep(U.fadeNear.mul(1.6), U.fadeFar.mul(1.25), d).mul(o.fade ?? 0.94);
  m.colorNode = mix(mix(rgb, lit, U.light), U.sky, f);
  if (o.transparent) m.opacityNode = t.a;
  return m;
}

// The backdrop sheet. Where the sun stands behind it the paper lights up.
export function skyMaterial(tex) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  const t = pow(texture(tex, uv()).rgb, vec3(2.2));
  const dir = normalize(positionLocal);
  const s = saturate(dot(dir, U.sun));
  let grain = float(1);
  if (grainTex) grain = float(1).add(texture(grainTex, uv().mul(vec2(9, 5))).r.sub(0.5).mul(0.07));
  const halo = pow(s, 5.0).mul(0.1).add(pow(s, 40.0).mul(0.16));
  const lit = t.mul(grain).mul(mix(vec3(0.97, 0.965, 0.955), vec3(1.0, 0.98, 0.93), pow(s, 1.6))).add(vec3(1.0, 0.88, 0.62).mul(halo));
  m.colorNode = mix(t.mul(grain), lit, U.light);
  return m;
}

// Ink or pencil marks floating in the air: birds, wind, notes on the backdrop.
export function markMaterial(tex, o = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true });
  const t = decode(texture(tex, uv()));
  m.colorNode = t.rgb;
  let a = t.a.mul(o.opacity ?? 1);
  if (o.vertexAlpha) a = a.mul(attribute('aAlpha', 'float'));
  m.opacityNode = a;
  return m;
}

// The paper plane: the one folded thing. Warm on the sunlit faces, cool in
// the folds, and a little light coming through the wing.
export function planeMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const V = normalize(cameraPosition.sub(positionWorld));
  const N = normalize(normalWorld);
  const Nf = N.mul(sign(dot(N, V)));
  const l = dot(Nf, U.sun);
  const tone = attribute('aTone', 'float');
  const warm = vec3(1.0, 0.985, 0.94), cool = vec3(0.6, 0.63, 0.71);
  let col = mix(cool, warm, smoothstep(-0.35, 0.55, l));
  const through = pow(saturate(dot(V.negate(), U.sun)), 2.0).mul(smoothstep(0.1, -0.4, l));
  col = col.add(vec3(0.34, 0.25, 0.1).mul(through));
  m.colorNode = col.mul(tone);
  return m;
}
