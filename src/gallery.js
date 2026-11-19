// Flat review of the drawings, before they stand up in 3D. Open with ?gallery=NAME.
import { papers } from './draw/paper.js';
import * as scenery from './draw/scenery.js';

const SETS = {
  land: () => [
    ['ridge near', scenery.drawRidge({ seed: 101, fade: 0, w: 1600, h: 520 }).canvas],
    ['ridge mid', scenery.drawRidge({ seed: 102, fade: 0.5, w: 1600, h: 460 }).canvas],
    ['ridge far', scenery.drawRidge({ seed: 103, fade: 0.9, w: 1600, h: 400, jag: 0.6 }).canvas],
    ['hill', scenery.drawHill({ seed: 201, w: 1400, h: 400 }).canvas],
    ['cliff headland', scenery.drawCliff({ seed: 301, shape: 'headland', w: 1400, h: 560 }).canvas],
    ['cliff falls', scenery.drawCliff({ seed: 302, shape: 'falls', w: 1400, h: 600 }).canvas],
  ],
  trees: () => [
    ...['oak', 'pine', 'poplar', 'cypress', 'bush'].map((k, i) => [k, scenery.drawTree({ seed: 400 + i, kind: k }).canvas]),
    ['tree line ink', scenery.drawTreeLine({ seed: 501 }).canvas],
    ['tree line pencil', scenery.drawTreeLine({ seed: 502, pencil: true }).canvas],
    ['cloud', scenery.drawCloud({ seed: 601 }).canvas],
    ['cloud', scenery.drawCloud({ seed: 602 }).canvas],
  ],
};

export async function showGallery(name) {
  document.body.classList.add('gallery');
  const mods = { ...SETS };
  try { const b = await import('./draw/buildings.js'); if (b.gallery) mods.town = b.gallery; } catch {}
  try { const m = await import('./draw/marks.js'); if (m.gallery) mods.marks = m.gallery; } catch {}
  try { const g = await import('./draw/ground.js'); if (g.gallery) mods.ground = g.gallery; } catch {}
  const wrap = document.createElement('div');
  wrap.className = 'gal';
  wrap.style.backgroundImage = `url(${papers().sky.toDataURL()})`;
  document.body.appendChild(wrap);
  const t0 = performance.now();
  for (const [label, c] of (mods[name] || mods.land)()) {
    const f = document.createElement('figure');
    f.appendChild(c);
    const cap = document.createElement('figcaption');
    cap.textContent = `${label}  ${c.width}x${c.height}`;
    f.appendChild(cap);
    wrap.appendChild(f);
  }
  const ms = (performance.now() - t0).toFixed(0);
  console.log(`[gallery] ${name} drawn in ${ms} ms`);
  // one contact sheet on sky paper, saved through the dev server for review
  const cs = [...wrap.querySelectorAll('canvas')];
  const W = 1800, pad = 16;
  let x = pad, y = pad, rowH = 0;
  const pos = cs.map((c) => {
    const s = Math.min(1, (W - pad * 2) / c.width);
    const w = c.width * s, h = c.height * s;
    if (x + w > W - pad) { x = pad; y += rowH + pad; rowH = 0; }
    const p = { c, x, y, w, h };
    x += w + pad; rowH = Math.max(rowH, h);
    return p;
  });
  const sheet = document.createElement('canvas');
  sheet.width = W; sheet.height = y + rowH + pad;
  const g = sheet.getContext('2d');
  g.fillStyle = g.createPattern(papers().sky, 'repeat');
  g.fillRect(0, 0, sheet.width, sheet.height);
  for (const p of pos) g.drawImage(p.c, p.x, p.y, p.w, p.h);
  const blob = await new Promise((r) => sheet.toBlob(r, 'image/png'));
  await fetch(`/__shot?name=gal-${name}`, { method: 'POST', body: blob }).catch(() => {});
  window.__galleryDone = { name, ms, count: cs.length };
}
