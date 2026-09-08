/* The water authority for scripts/build-border-coast.mjs — see that file's header.

   data/coastline.json.gz is Natural Earth 1:10m physical, simplified to a 2 km tolerance
   (scripts/build-coastline.mjs). It ships as the world OCEAN edge (`coords`) plus the landlocked
   seas the same layer carries (`enclosed`, the Caspian). Both are edges of WATER, which is all this
   module needs: it answers, for a point, "is it on land, and how far away is the nearest water
   edge". Lake shores are in neither list, so a lake reads as land — which is what a border drawn
   across a lake wants.

   ⚠ THE RECORD IS A BAG OF CHAINS, NOT RINGS. 3,725 of its 3,777 parts already close; the other 52
   are pieces of continents Natural Earth splits into several line features (Eurasia arrives in
   nine). Parity — which is what point-in-polygon counts — is only defined on closed rings, so they
   are stitched back with the same endpoint walk scripts/histborders/geom.mjs runs on OHM ways.

   ⚠ THREE THINGS AT THE ANTIMERIDIAN, ALL MEASURED, NONE OPTIONAL:
   1. The two spellings of one place. A chain ending at +180 continues from −180, and `stitch` joins
      on exact endpoint equality. Folding +180 to −180 is not enough on its own — the record rounds
      to three decimals, so the pair arrives as 68.982 / 68.981 and misses. The seam latitude is
      therefore quantised as well. Shifting a whole chain by −360° instead does NOT work: measured,
      eight chains stayed open and the entire Eurasian coast fell out of the index (Sète, a port,
      read 203 km from the sea).
   2. Rings that cross the seam (Eurasia through Chukotka, and three slivers of Fiji). Longitudes
      are not planar there, so every crossing test below works on the WRAPPED difference instead —
      no unwrapping, no duplicated copies.
   3. Antarctica, whose coast winds a full 360° and closes round the pole rather than back on
      itself. A southward ray meets that closure from everywhere, so a pole ring simply contributes
      one constant crossing.  */
import { stitch } from '../histborders/geom.mjs';

const KM_PER_DEG = 110.574;
const CELL = 0.25;                                   /* index cell, degrees */
const NCOL = Math.round(360 / CELL);
const SEAM_LAT = 0.05;                               /* how far apart the two spellings of a seam point may be */

const wrap = (d) => { let x = d; while (x > 180) x -= 360; while (x <= -180) x += 360; return x; };
/* ⚠ ONE SPELLING PER MERIDIAN. −180 and +180 are the same place, and a query given one of them was
   answered differently from the other (measured: 66°N read sea at +180 and land at −180). The
   OpenHistoricalMap record has boundary edges drawn EXACTLY on that meridian — the Alaska
   convention line — so the difference is not hypothetical. Every query longitude is folded into
   [−180, 180) before anything indexes or compares it. */
const norm = (x) => { const v = ((x + 180) % 360 + 360) % 360 - 180; return v; };

function decode(parts, scale) {
  const out = [];
  for (const p of parts) {
    let x = p[0], y = p[1]; const pts = [[x / scale, y / scale]];
    for (let i = 2; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; pts.push([x / scale, y / scale]); }
    out.push(pts);
  }
  return out;
}

function weldSeam(chains) {
  const q = Math.round(1 / SEAM_LAT);
  const fold = (p) => (Math.abs(Math.abs(p[0]) - 180) < 1e-6 ? [-180, Math.round(p[1] * q) / q] : p);
  return chains.map((c) => { const o = c.slice(); o[0] = fold(o[0]); o[o.length - 1] = fold(o[o.length - 1]); return o; });
}

export function buildWater(rec) {
  const stats = { closed: 0, stitched: 0, seamClosed: 0, dropped: 0, droppedPts: 0 };
  const rings = [];
  for (const bag of [decode(rec.coords, rec.scale), decode(rec.enclosed || [], rec.scale)]) {
    const open = [];
    for (const c of bag) {
      const a = c[0], b = c[c.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) { rings.push(c.slice(0, -1)); stats.closed++; }
      else open.push(c);
    }
    const st = stitch(weldSeam(open));
    for (const r of st.rings) { rings.push(r); stats.stitched++; }
    for (const r of st.open) {
      const a = r[0], b = r[r.length - 1];
      /* a chain that walked the whole way round and came back to the seam a rounding apart */
      if (Math.abs(Math.abs(a[0]) - 180) < 1e-6 && Math.abs(Math.abs(b[0]) - 180) < 1e-6 && Math.abs(a[1] - b[1]) <= SEAM_LAT) {
        rings.push(r); stats.seamClosed++;
      } else { stats.dropped++; stats.droppedPts += r.length; }
    }
  }
  return index(rings, stats);
}

function index(rings, stats) {
  const ax = [], ay = [], dl = [], dy = [];       /* start point, wrapped Δlng, Δlat */
  let polar = 0;                                   /* constant crossings a southward ray always meets */
  for (const r of rings) {
    let wind = 0, latSum = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const d = wrap(b[0] - a[0]);
      ax.push(a[0]); ay.push(a[1]); dl.push(d); dy.push(b[1] - a[1]);
      wind += d; latSum += a[1];
    }
    /* winds a full turn — it closes round a pole rather than back on itself, and a southward ray
       meets that closure from everywhere on the map. */
    if (Math.abs(wind) > 180 && latSum / r.length < 0) polar++;
  }
  const n = ax.length;

  const grid = new Map();                          /* "cx,cy" → segment indices, for the nearest edge */
  const col = new Map();                           /* wrapped column → segment indices, for the southward ray */
  const push = (m, k, i) => { const a = m.get(k); if (a) a.push(i); else m.set(k, [i]); };
  for (let i = 0; i < n; i++) {
    const x0 = ax[i], x1 = ax[i] + dl[i];
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const y0 = Math.min(ay[i], ay[i] + dy[i]), y1 = Math.max(ay[i], ay[i] + dy[i]);
    for (let c = Math.floor(lo / CELL); c <= Math.floor(hi / CELL); c++) {
      const cw = ((c % NCOL) + NCOL) % NCOL;
      push(col, cw, i);
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) push(grid, cw + ',' + cy, i);
    }
  }

  function segKm(px, py, i, kx) {
    const sx = wrap(ax[i] - px) * kx, sy = (ay[i] - py) * KM_PER_DEG;
    const ex = dl[i] * kx, ey = dy[i] * KM_PER_DEG;
    const L = ex * ex + ey * ey;
    let t = L ? -(sx * ex + sy * ey) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = sx + t * ex, qy = sy + t * ey;
    return Math.sqrt(qx * qx + qy * qy);
  }

  /* the nearest water edge, in km. Cell rings are walked outwards and the walk stops as soon as the
     ring's own floor exceeds the best found — the rule js/coastline.js uses on latitude bands.

     ⚠ `maxKm` IS NOT AN OPTIMISATION FLAG, IT IS THE QUESTION. Every caller here asks "is this
     point further from the water than the band", never "how far exactly", and an unbounded walk
     has to reach the coast from the middle of a continent: Denver is 1,168 km out, which is 58 cell
     rings, and the first version of this loop scanned the whole square instead of its rim, so one
     such query cost ~195,000 cell probes. The report over 674k edges had not finished in ten
     minutes. Bounded, the same sweep is seconds. A result above `maxKm` is a LOWER BOUND, not a
     distance — only compare it, never print it. */
  function distKm(px0, py, maxKm) {
    const px = norm(px0);
    const kx = KM_PER_DEG * Math.cos(py * Math.PI / 180);
    const step = Math.min(kx, KM_PER_DEG) * CELL;
    const lim = maxKm == null ? NCOL : Math.min(NCOL, Math.ceil(maxKm / step) + 2);
    const cx0 = Math.floor(px / CELL), cy0 = Math.floor(py / CELL);
    let best = Infinity;
    const scan = (cx, cy) => {
      const a = grid.get(((cx % NCOL) + NCOL) % NCOL + ',' + cy); if (!a) return;
      for (const i of a) { const d = segKm(px, py, i, kx); if (d < best) best = d; }
    };
    for (let r = 0; r <= lim; r++) {
      if (best < (r - 1) * step) break;
      if (r === 0) scan(cx0, cy0);
      else {
        for (let cx = cx0 - r; cx <= cx0 + r; cx++) { scan(cx, cy0 - r); scan(cx, cy0 + r); }
        for (let cy = cy0 - r + 1; cy <= cy0 + r - 1; cy++) { scan(cx0 - r, cy); scan(cx0 + r, cy); }
      }
    }
    return best;
  }

  /* parity of a ray cast SOUTH. Latitude does not wrap, so the ray needs no seam bookkeeping; the
     segment's own longitude span is read as a WRAPPED difference so a seam-crossing edge counts once.

     ⚠ THE HALF-OPEN RULE IS ON THE ENDPOINTS, NOT ON THE TRAVERSAL. Asking `0 <= t < 1` counts a
     segment that STARTS on the ray and skips one that ENDS on it — which is a different rule
     depending on which way the ring happens to be drawn, so a spike that touches the ray and turns
     back scored 1 instead of 2. Measured on the shipped record: Nairobi came out as sea at exactly
     36.8200 and as land at every neighbouring longitude, because the coordinates are rounded to
     three decimals and the ray landed on a vertex. `(0 <= u) !== (d <= u)` is the usual rule and is
     symmetric. */
  function onLand(px0, py) {
    const px = norm(px0);
    const a = col.get(((Math.floor(px / CELL) % NCOL) + NCOL) % NCOL);
    let c = polar;
    if (a) for (const i of a) {
      const d = dl[i], u = wrap(px - ax[i]);
      if ((0 <= u) === (d <= u)) continue;
      if (ay[i] + (u / d) * dy[i] < py) c++;
    }
    return (c & 1) === 1;
  }

  /* + on land, − at sea, in km from the nearest water edge. Beyond `maxKm` the MAGNITUDE is only a
     lower bound (see distKm) — the sign is always exact, because it comes from the parity, not the
     distance. */
  const inlandKm = (px, py, maxKm) => (onLand(px, py) ? 1 : -1) * distKm(px, py, maxKm);
  return { rings: rings.length, segments: n, polar, stats, distKm, onLand, inlandKm };
}
