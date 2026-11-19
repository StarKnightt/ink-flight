// A standing sheet: paper cut to a silhouette, browned at the cut, then drawn on.
// Usage: S.paper(path) for every piece of the silhouette, pen = S.ink(), draw,
// then S.finish() trims any ink that strayed off the paper.

import { makeRng } from './rng.js';
import { canvas, papers, ageEdges } from './paper.js';
import { Pen, paperFill } from './ink.js';

export const SHEET_BOLD = 1.5;

export function makeSheet(w, h, seed, tone = 'warm') {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rnd = makeRng(seed);
  const tile = papers()[tone];
  const off = [Math.floor(rnd() * 512), Math.floor(rnd() * 512)];
  let mask = null;
  const S = {
    c, ctx, rnd, w, h, tone,
    paper(path) { paperFill(ctx, path, tile, { offset: off }); },
    // patch paper back over existing marks (a nearer form hiding a farther one)
    repaper(path, a = 0.9) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = a;
      paperFill(ctx, path, tile, { offset: off });
      ctx.restore();
    },
    ink(o = {}) {
      mask = canvas(w, h);
      mask.getContext('2d').drawImage(c, 0, 0);
      // uneven toning inside the sheet
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 5; i++) {
        const x = rnd() * w, y = rnd() * h, r = rnd.range(0.2, 0.5) * Math.max(w, h);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(170,132,80,${rnd.range(0.02, 0.06)})`);
        g.addColorStop(1, 'rgba(170,132,80,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
      if (o.edges !== false) ageEdges(c, o.edge);
      ctx.globalCompositeOperation = 'multiply';
      return new Pen(ctx, rnd, { bold: SHEET_BOLD, ...o });
    },
    pen(o = {}) { return new Pen(ctx, rnd, { bold: SHEET_BOLD, ...o }); },
    finish() {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      return c;
    },
  };
  return S;
}
