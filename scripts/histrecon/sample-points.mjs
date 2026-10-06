/* ==========================================================================
 * scripts/histrecon/sample-points.mjs   (hist-reconstruction · the lattice sample, by scanline)
 *
 * The same points scripts/build-hist-admin-fill.mjs `samplePoints` returns — the cells of a GRID lattice over the
 * unit's box whose centres lie inside it, capped to MAX_SAMPLE by an even stride, else the unit's own vertices —
 * decided by ONE even-odd scanline pass (js/hist-knowledge.js `scan`) instead of one ray cast per cell.
 *
 * WHY: MEASURED 2026-10-06 (hist-recon-expand) — a full reconstruction build ran past two hours. Indonesia alone
 * spent 218 s of 295 s in samplePoints → inPolys: regencies of tens of thousands of vertices, every lattice cell of
 * their box ray-cast against every ring. The scanline visits each edge once per row it crosses.
 *
 * ⚠ IT MUST RETURN THE SAME POINTS, IN THE SAME ORDER — the cap is a stride over the list, and tests 3 and 4 read
 *   shares off it. The crossing rule is the same (an edge crosses a row's centre when exactly one end lies at or
 *   below it; a cell is inside between pairs of crossings), the cells are walked x-major as samplePoints walks
 *   them, and the x/y of each point are accumulated the same way. A point exactly on an edge could in principle be
 *   decided differently; tests/hist-recon-expand-checks.test.mjs compares the two on real units and requires
 *   identity. The fill keeps its own function (its rows are not rebuilt by this change).
 * ========================================================================== */
import { scan } from '../../js/hist-knowledge.js';
import { GRID, MAX_SAMPLE } from '../build-hist-admin-fill.mjs';

export function samplePointsFast(polys) {
  const rings = polys.map((p) => p[0]);
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const r of rings) for (const p of r) { if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]; if (p[1] < mny) mny = p[1]; if (p[1] > mxy) mxy = p[1]; }
  /* the lattice exactly as samplePoints walks it (accumulated, not multiplied) */
  const xs = []; for (let x = mnx + GRID / 2; x <= mxx; x += GRID) xs.push(x);
  const ys = []; for (let y = mny + GRID / 2; y <= mxy; y += GRID) ys.push(y);
  const NX = Math.max(1, xs.length), NY = Math.max(1, ys.length);
  let out = [];
  if (xs.length && ys.length) {
    const inside = new Uint8Array(xs.length * ys.length);
    const win = { x0: mnx, y0: mny, res: GRID, NX: xs.length, NY: ys.length };
    for (const p of polys) {
      const mask = new Uint8Array(xs.length * ys.length);
      scan(win, p, (j, i0, i1) => { for (let i = i0; i <= i1; i++) mask[i * ys.length + j] = 1; });
      for (let k = 0; k < mask.length; k++) if (mask[k]) inside[k] = 1;
    }
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) if (inside[i * ys.length + j]) out.push([xs[i], ys[j], i, j]);
  }
  const win = { x0: mnx, y0: mny, res: GRID, NX, NY };
  let vertex = false;
  if (!out.length) { for (const r of rings) for (const p of r) out.push([p[0], p[1], -1, -1]); vertex = true; }
  if (out.length > MAX_SAMPLE) {
    const step = out.length / MAX_SAMPLE, cut = [];
    for (let i = 0; i < MAX_SAMPLE; i++) cut.push(out[Math.floor(i * step)]);
    out = cut;
  }
  out.win = win;
  if (vertex) out.vertex = true;
  return out;
}
