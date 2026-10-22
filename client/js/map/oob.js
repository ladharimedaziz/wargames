// Israel and Palestine are permanently out of bounds. Every map covers both with one OUT OF BOUNDS zone: a dark
// fill hiding bloc colours, slow-moving hazard stripes, a dashed amber border, and a warning-tape label.
import { OUT_OF_BOUNDS } from '/shared/engine/core.js';

const AMBER = '255,190,60';

export const OOB_FX = {
  drawOOB(ctx, time) {
    if (!this.atlas?.lo) return;
    const dpr = this.dpr, c = this.cam, k = c.k;
    // Same detail as the country fills underneath, so the zone covers them exactly.
    const A = (this.moving || k < 1.7 || !this.atlas.hi) ? this.atlas.lo : this.atlas.hi;
    const ids = OUT_OF_BOUNDS.filter(id => A.paths.get(id));
    if (!ids.length) return;
    this._oobPaths ||= new Map();
    if (!this._oobPaths.has(A)) { const p = new Path2D(); for (const id of ids) p.addPath(A.paths.get(id)); this._oobPaths.set(A, p); }
    const path = this._oobPaths.get(A);
    const box = this.oobBox(); if (!box) return;
    const [sx0, sy0, sx1, sy1] = box;
    ctx.save();
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * c.x, dpr * c.y);
    ctx.fillStyle = 'rgba(14,16,22,0.96)'; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Hazard stripes, drifting slowly.
    const gap = 9, off = (time * 6) % (gap * 2), pad = sy1 - sy0 + 20;
    ctx.strokeStyle = `rgba(${AMBER},0.28)`; ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let x = sx0 - pad - gap * 2 + off; x < sx1 + gap * 2; x += gap * 2) { ctx.moveTo(x, sy1 + 10); ctx.lineTo(x + pad, sy0 - 10); }
    ctx.stroke();
    ctx.restore();
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * c.x, dpr * c.y);
    ctx.strokeStyle = `rgba(${AMBER},${0.75 + 0.2 * Math.sin(time * 2)})`; ctx.lineWidth = 1.6 / k;
    ctx.setLineDash([4 / k, 3 / k]); ctx.lineDashOffset = -time * 8 / k; ctx.stroke(path); ctx.setLineDash([]);
    ctx.restore();
  },
  // Screen box of the zone.
  oobBox() {
    const c = this.cam, k = c.k;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of OUT_OF_BOUNDS) { const b = this.bounds.get(id); if (!b) continue; x0 = Math.min(x0, b[0][0]); y0 = Math.min(y0, b[0][1]); x1 = Math.max(x1, b[1][0]); y1 = Math.max(y1, b[1][1]); }
    if (!Number.isFinite(x0)) return null;
    return [x0 * k + c.x, y0 * k + c.y, x1 * k + c.x, y1 * k + c.y];
  },
  // The label goes on top of everything: on the zone when it is big enough, otherwise above it with a leader line.
  drawOOBLabel(ctx) {
    const box = this.oobBox(); if (!box) return;
    const [sx0, sy0, sx1, sy1] = box;
    const ar = this.opts.lang === 'ar', text = ar ? 'خارج النطاق' : 'OUT OF BOUNDS';
    const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2;
    const fs = Math.max(8, Math.min(16, (sx1 - sx0) * 0.22));
    ctx.save();
    ctx.font = `800 ${fs}px Rajdhani, Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!ar) ctx.letterSpacing = '1.5px';
    const w = ctx.measureText(text).width + 14, h = fs + 8;
    const big = sx1 - sx0 > w * 0.9;
    const lx = big ? cx : cx + 10, ly = big ? cy : sy0 - h / 2 - 14;
    if (!big) { ctx.strokeStyle = `rgba(${AMBER},0.8)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, sy0 + 4); ctx.lineTo(lx, ly + h / 2); ctx.stroke(); }
    ctx.fillStyle = `rgba(${AMBER},0.95)`; ctx.beginPath(); ctx.roundRect(lx - w / 2, ly - h / 2, w, h, 3); ctx.fill();
    ctx.fillStyle = '#14100a'; ctx.fillText(text, lx, ly + 0.5);
    ctx.restore();
  },
};
