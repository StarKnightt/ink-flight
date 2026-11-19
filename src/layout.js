// The one hand-made valley. x runs east, z runs south, so north is -z.
// The ground sheet and the standing sheets both read from here, which keeps
// the drawn map and the things standing on it in register.

export const WORLD = { half: 800, soft: 660, ceil: 290, floor: 2.2 };

// Low sun in the west-north-west. Most sheets face south, so from the south
// the whole set is lit from behind and the paper glows.
export const SUN = (() => { const v = [-0.80, 0.26, -0.54]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

// river centreline, north (the falls) to the estuary
export const RIVER = [
  [-60, -660], [-98, -520], [-24, -390], [-88, -260], [2, -140], [22, -45], [22, 30],
  [44, 110], [112, 190], [232, 250], [380, 292], [520, 356], [660, 430],
];
export const RIVER_WIDTH = [12, 14, 16, 20, 26, 40, 40, 34, 36, 40, 48, 70, 120];

// coastline, north to south; everything east of it is sea
export const COAST = [
  [468, -800], [512, -610], [556, -440], [668, -318], [628, -206], [528, -104], [500, 40],
  [546, 176], [522, 292], [560, 340], [598, 452], [528, 590], [520, 700], [556, 800],
];

export const TOWN = { x: 22, z: 0 };
export const BRIDGE = { x: 22, z: 6, len: 104, height: 28, depth: 9 };
export const MILL = { x: -236, z: 96 };
export const LIGHT = { x: 632, z: -290 };
export const FALLS = { x: -60, z: -690 };
export const FOREST = { x: -340, z: -280, rx: 200, rz: 150 };

// field blocks: [cx, cz, width, depth, rotation]
export const FIELDS = [
  [-140, 230, 220, 150, 0.15], [-330, 250, 200, 170, -0.2], [160, 340, 240, 140, 0.35], [-40, 420, 260, 160, -0.08],
  [250, -70, 200, 150, 0.2], [330, 130, 180, 130, -0.3], [200, -230, 210, 140, 0.1], [-200, -60, 150, 120, -0.25],
  [-470, 80, 180, 200, 0.1], [380, -200, 150, 130, 0.4], [-300, 480, 240, 130, 0.05], [90, 560, 260, 120, -0.15],
];

// roads as polylines
export const ROADS = [
  [[-30, 6], [-110, 30], [-180, 70], [-236, 96], [-330, 130], [-470, 150], [-640, 210]],
  [[74, 6], [150, -20], [270, -90], [400, -170], [520, -240], [600, -280]],
  [[-60, -30], [-130, -110], [-220, -190], [-300, -250]],
  [[-34, 30], [-50, 150], [-70, 300], [-40, 460], [30, 640]],
  [[110, 30], [200, 110], [300, 200], [420, 250]],
];

// rounded hills that stand in the valley: [x, z, width, height, facing(rad from south), seed]
export const HILLS = [
  [-236, 110, 300, 60, 0.0, 201], [-470, -110, 360, 78, 0.25, 202], [310, -340, 380, 84, -0.2, 203],
  [262, 150, 290, 52, -0.15, 204], [-500, 330, 400, 76, 0.3, 205], [130, 430, 330, 50, -0.05, 206],
  [-130, -480, 320, 80, 0.1, 207], [440, 60, 240, 46, -0.35, 208], [-330, -420, 420, 96, 0.2, 209],
  [-640, 60, 300, 90, 0.5, 210], [60, -300, 260, 44, 0.05, 211], [400, 480, 300, 56, -0.3, 212],
  // and some that face east or west, so the valley has form from the side too
  [-560, -260, 300, 72, 1.35, 213], [190, -520, 320, 66, -1.3, 214], [350, 330, 250, 48, 1.4, 215], [-380, 580, 300, 58, -1.25, 216],
  [-120, 300, 220, 40, 1.5, 217], [470, -150, 240, 52, -1.45, 218],
];

// bookmarks for the browser check: position, look-at
export const CAMERAS = {
  hero: { pos: [102, 77, 414], at: [40, 40, 0] },      // the spawn view; the game uses the chase camera here
  town: { pos: [-70, 34, 150], at: [30, 20, -10] },
  mill: { pos: [-150, 40, 250], at: [-240, 34, 90] },
  light: { pos: [430, 60, -40], at: [640, 62, -300] },
  forest: { pos: [-250, 46, -60], at: [-350, 22, -290] },
  falls: { pos: [-20, 70, -330], at: [-60, 70, -690] },
  clouds: { pos: [60, 150, 260], at: [-40, 150, -200] },
  low: { pos: [30, 9, 150], at: [22, 12, 0] },
  west: { pos: [250, 90, 60], at: [-600, 60, -160] },
  back: { pos: [0, 110, -420], at: [40, 20, 200] },
};

// where the plane starts: the hero view
export const SPAWN = { pos: [92, 72, 404], yaw: 0.1, pitch: -0.04 };

// helpers shared by the map and the set
export function polyAt(pts, t) {
  const n = pts.length - 1, f = Math.min(n - 1e-6, Math.max(0, t * n));
  const i = Math.floor(f), u = f - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
}

// distance from a point to the river centreline, and the width there
export function riverAt(x, z) {
  let best = 1e9, bw = 20;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best) { best = d; bw = RIVER_WIDTH[i] + (RIVER_WIDTH[i + 1] - RIVER_WIDTH[i]) * t; }
  }
  return { d: best, w: bw };
}

// x of the coast at a given z (the coast runs roughly north-south)
export function coastX(z) {
  for (let i = 0; i < COAST.length - 1; i++) {
    const a = COAST[i], b = COAST[i + 1];
    if (z >= a[1] && z <= b[1]) return a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
  }
  return z < COAST[0][1] ? COAST[0][0] : COAST[COAST.length - 1][0];
}

export const isSea = (x, z) => x > coastX(z) + 4;
export const isWater = (x, z) => isSea(x, z) || (() => { const r = riverAt(x, z); return r.d < r.w * 0.5; })();
