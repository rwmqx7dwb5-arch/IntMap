/* Ring assembly + simplification for scripts/build-hist-borders.mjs — see that file's header. */

/* ── stitching ──────────────────────────────────────────────────────────────
   An OHM boundary relation is a BAG OF WAYS, not a ring: each way is a shared
   border segment, drawn in whatever direction its author happened to draw it,
   and a country's outline is however many of them meet end to end. So the ring
   is reconstructed here by endpoint matching, and a way may have to be REVERSED
   to join (a shared segment is drawn once and used by both neighbours). */
const KEY = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);

export function stitch(ways) {
  const segs = ways.map(w => w.slice()).filter(w => w.length >= 2);
  const ends = new Map();                       /* endpoint key → [segment index…] */
  const add = (k, i) => { const a = ends.get(k); if (a) a.push(i); else ends.set(k, [i]); };
  segs.forEach((s, i) => { add(KEY(s[0]), i); add(KEY(s[s.length - 1]), i); });
  const used = new Array(segs.length).fill(false);
  const rings = [], open = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let ring = segs[i].slice();
    /* ⚠ BOTH DIRECTIONS, NOT JUST FORWARD. A relation whose outline has a genuine hole in it (two
       endpoints of degree 1 — measured: Bolivia 1839-1866 and Chile 1848-1866 each have exactly
       one such hole) is an open PATH, and a forward-only walk cuts that path wherever the seed
       happened to land. Measured with forward-only: Chile 1861-1866 came out as EIGHTEEN fragments
       of one path, and the biggest one was thrown away as "unclosed" — the country lost its
       coastline. Extending backwards from the seed too makes it one chain, which `closeGap` can
       then judge on its real size. */
    ring = extend(ring, segs, ends, used, KEY);
    if (KEY(ring[0]) !== KEY(ring[ring.length - 1])) {
      ring.reverse();
      ring = extend(ring, segs, ends, used, KEY);
    }
    if (KEY(ring[0]) === KEY(ring[ring.length - 1])) { ring.pop(); rings.push(ring); }
    else open.push(ring);
  }
  return { rings, open };
}

function extend(ring, segs, ends, used, KEY) {
  for (;;) {
    const k = KEY(ring[ring.length - 1]);
    if (k === KEY(ring[0])) break;              /* closed */
    const cand = (ends.get(k) || []).filter(j => !used[j]);
    if (!cand.length) break;
    const j = cand[0]; used[j] = true;
    const s = segs[j];
    const tail = KEY(s[0]) === k ? s.slice(1) : s.slice(0, -1).reverse();
    for (const p of tail) ring.push(p);
  }
  return ring;
}

/* ── Douglas–Peucker ────────────────────────────────────────────────────────
   Run on the CLOSED ring split at its two extreme points, so the simplifier
   cannot collapse a ring by picking a chord through it. */
function dp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, dd = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (dd === 0) { d = (px - ax) ** 2 + (py - ay) ** 2; }
      else { let t = ((px - ax) * dx + (py - ay) * dy) / dd; t = t < 0 ? 0 : t > 1 ? 1 : t;
             d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; }
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol * tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = []; for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

export function simplifyRing(ring, tol) {
  if (ring.length < 4) return null;
  let lo = 0, hi = 0;
  for (let i = 1; i < ring.length; i++) { if (ring[i][0] < ring[lo][0]) lo = i; if (ring[i][0] > ring[hi][0]) hi = i; }
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  const h1 = dp(ring.slice(a, b + 1), tol);
  const h2 = dp(ring.slice(b).concat(ring.slice(0, a + 1)), tol);
  const out = h1.concat(h2.slice(1, -1));
  return out.length >= 3 ? out : null;
}

export const ringArea = r => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
