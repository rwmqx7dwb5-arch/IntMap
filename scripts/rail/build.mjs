/* ============================================================================
 *  IntMap · WORLD RAILWAYS — the build  (cache  ->  data/railways/*)  (#R388)
 * ----------------------------------------------------------------------------
 *  Turns the Overpass cache written by scripts/rail/fetch.mjs into what ships:
 *
 *    data/railways/world.json.gz     every heavy-rail route on the planet,
 *                                    generalised for z0–z6, no strings
 *    data/railways/c/<cell>.json.gz  5° cells at full detail, with names,
 *                                    operators and the OSM id behind each line
 *    data/railways/index.json        which cells exist and how big they are
 *
 *  Nothing here reaches the network. Re-deciding what ships is a rebuild, not a
 *  re-sweep.
 *
 *  ══ FOUR THINGS THIS FILE HAS TO GET RIGHT ══════════════════════════════════
 *
 *  ⚠ ONE WAY, ONE LINE. Overpass returns every way that INTERSECTS a cell, with
 *    its whole geometry — so a line crossing a cell edge is in the cache twice,
 *    identically. Deduplicating by OSM id is not tidiness: without it the map
 *    draws those lines twice, and a half-transparent layer shows the seam.
 *
 *  ⚠ OSM SPLITS WAYS AT EVERY BRIDGE. The Iberian sample is 6,831 ways for about
 *    3,600 route-km — 1.9 ways per kilometre, split wherever a tag changes or a
 *    bridge begins. Joining the ones whose ATTRIBUTES ARE IDENTICAL end-to-end
 *    MEASURED 4.4× fewer features and cost nothing: two ways with the same gauge,
 *    the same voltage and the same name are one line, and were one line all along.
 *
 *  ⚠ A CHAIN IS CLIPPED INTO EVERY CELL IT CROSSES, WITH ONE VERTEX OF OVERLAP.
 *    Filing it in the cell holding its midpoint — which is exactly the mistake
 *    this whole round exists to undo — would make it vanish when you pan one cell
 *    over. The overlap vertex is what keeps the line reaching the cell edge
 *    instead of stopping a pixel short of it.
 *
 *  ⚠ SIMPLIFICATION IS PER LEVEL, MERGING IS NOT. Merge once on the full
 *    signature, then simplify each level from the same chains — simplifying first
 *    would move the endpoints and the chains would no longer meet.
 *
 *  Usage
 *    node scripts/rail/build.mjs            build everything from the cache
 *    node scripts/rail/build.mjs --report   print what would be written
 * ==========================================================================*/
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR } from './fetch.mjs';
import { RailSchema } from '../../js/rail-schema.js';

const {
  classOf, statusOf, gaugeOf, dualGauge, elecOf, voltageOf, freqOf, currentOf,
  speedOf, tracksOf, usageOf, highspeedOf, modeOf, yearOf, HEAVY,
  elecBucket, speedBucket, tracksBucket, encodeLines, str,
} = RailSchema;

/* The property names each level ships, in the order the dictionary stores them. */
const WORLD_KEYS = ['k', 'x', 'g', 'be', 'bs', 'bt', 'bm'];
const CELL_KEYS = ['k', 'x', 'g', 'dg', 'e', 'v', 'q', 'c', 's', 't', 'u', 'h', 'm', 'y', 'n', 'r', 'o', 'ow', 'w', 'cw'];
const WORLD_SCALE = 1000;      /* 3 decimals — the level's own rounding */
const CELL_SCALE = 100000;     /* 5 decimals */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'railways');
const CELL_DEG = 5;

/* Level tolerances, in degrees. ⚠ THE WORLD LEVEL IS EXACTLY AS FAITHFUL AS THE FILE IT
   REPLACES — 0.012° and two decimals are what _rail_convert.py used — and that is the point: at
   z6.5, where the 5° cells take over, one pixel is about 1.2 km at the equator, so precision past
   this is paid for by every reader and seen by none. MEASURED on the finished planet: 0.008°/3dp
   cost 1.43 MB gz, 0.012°/2dp costs 0.89 MB, and 0.02°/2dp saves only 0.07 MB more while going
   visibly coarser than what it replaced. */
const WORLD_TOL = 0.012, WORLD_DP = 2;
/* ⚠ THE WORLD LEVEL IS GENERALISED BY LENGTH AS WELL AS BY SHAPE, and that is a decision with a
   number on it. At z5 a 3 km chain is under one pixel; drawing 200,000 of them costs the whole
   file and shows a smear. Chains shorter than this are dropped FROM THE WORLD LEVEL ONLY — they
   are all still in the 5° cells, one zoom step away, with every tag they had. The build PRINTS how
   many it dropped and how much length that was, because a coverage bound nobody states reads as
   "we drew everything".

   ⚠ AND A SHORT CHAIN IS NOT ALWAYS A SHORT LINE. The chains break wherever an ATTRIBUTE changes,
   so a trunk route through a station throat can be a 2 km chain with a main line on both ends.
   Dropping it by length alone punches a hole in a line that is continuous on the ground — a defect
   that looks exactly like missing data. So a short chain is dropped only when it is ISOLATED: when
   neither of its endpoints is shared with a chain that is being kept. MEASURED below. */
const WORLD_MIN_KM = 6;
const CELL_TOL = 0.0012, CELL_DP = 5;

const log = (...a) => console.log(...a);

/* ── douglas–peucker ─────────────────────────────────────────────────────── */
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let worst = -1, wi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0], py = pts[i][1];
      let d2;
      if (L2 === 0) { d2 = (px - ax) ** 2 + (py - ay) ** 2; }
      else {
        let t = ((px - ax) * dx + (py - ay) * dy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d2 > worst) { worst = d2; wi = i; }
    }
    if (worst > t2) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
/** great-circle length of a polyline, km */
function lengthKm(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const dy = (y2 - y1) * 111.32;
    const dx = (x2 - x1) * 111.32 * Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    m += Math.sqrt(dx * dx + dy * dy);
  }
  return m;
}
function round(pts, dpDigits) {
  const f = 10 ** dpDigits;
  const out = [];
  for (const p of pts) {
    const q = [Math.round(p[0] * f) / f, Math.round(p[1] * f) / f];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  return out;
}

/* ── read the cache, normalise, deduplicate ──────────────────────────────── */
function readCache() {
  if (!existsSync(CACHE_DIR)) throw new Error('no cache at ' + CACHE_DIR + ' — run scripts/rail/fetch.mjs first');
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const seen = new Set();
  const ways = [];
  let dupes = 0, cells = 0;
  for (const f of files) {
    let j;
    try { j = JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf8')); }
    catch (_) { log('  ⚠ unreadable cache cell ' + f); continue; }
    cells++;
    for (const el of j.elements || []) {
      if (seen.has(el.id)) { dupes++; continue; }
      seen.add(el.id);
      const g = el.geometry;
      if (!g || g.type !== 'LineString' || !g.coordinates || g.coordinates.length < 2) continue;
      const t = el.tags || {};
      const k = classOf(t);
      if (!k) continue;
      ways.push({ id: el.id, k, pts: g.coordinates, t });
    }
  }
  log(`  cache ${cells} cells · ${ways.length} distinct ways (${dupes} duplicate copies dropped)`);
  return ways;
}

/* Every value the product can show, parsed once. `null` means OSM did not say. */
function propsOf(w) {
  const t = w.t;
  return {
    k: w.k,
    x: statusOf(t),
    g: gaugeOf(t), dg: dualGauge(t) || undefined,
    e: elecOf(t), v: voltageOf(t), q: freqOf(t), c: currentOf(t),
    s: speedOf(t), tr: tracksOf(t), u: usageOf(t), h: highspeedOf(t) || undefined,
    m: modeOf(t), y: yearOf(t),
    n: t.n || t.o || null, r: t.p || null,
    o: t.q || t.r || null, ow: t.s || null, w: t.y || null,
    cw: t.z || t.A || null,
  };
}

/* ── merge ways whose attributes are identical and whose ends meet ───────── */
const ptKey = (p) => Math.round(p[0] * 1e7) + ',' + Math.round(p[1] * 1e7);

function mergeChains(ways, sigOf) {
  const groups = new Map();
  for (const w of ways) {
    const s = sigOf(w);
    let g = groups.get(s);
    if (!g) { g = []; groups.set(s, g); }
    g.push(w);
  }
  const chains = [];
  for (const list of groups.values()) {
    /* endpoint -> the ways that start or end there, inside this signature only */
    const byEnd = new Map();
    list.forEach((w, i) => {
      for (const p of [w.pts[0], w.pts[w.pts.length - 1]]) {
        const kk = ptKey(p);
        let a = byEnd.get(kk); if (!a) { a = []; byEnd.set(kk, a); }
        a.push(i);
      }
    });
    const used = new Uint8Array(list.length);
    for (let i = 0; i < list.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      let chain = list[i].pts.slice();
      const ids = [list[i].id];
      for (let dir = 0; dir < 2; dir++) {
        for (;;) {
          const tail = dir === 0 ? chain[chain.length - 1] : chain[0];
          const cands = byEnd.get(ptKey(tail)) || [];
          let grew = false;
          for (const j of cands) {
            if (used[j]) continue;
            const p = list[j].pts;
            let add = null;
            if (ptKey(p[0]) === ptKey(tail)) add = p.slice(1);
            else if (ptKey(p[p.length - 1]) === ptKey(tail)) add = p.slice(0, -1).reverse();
            if (!add) continue;
            used[j] = 1; ids.push(list[j].id);
            chain = dir === 0 ? chain.concat(add) : add.reverse().concat(chain);
            grew = true; break;
          }
          if (!grew) break;
        }
      }
      chains.push({ pts: chain, props: propsOf(list[i]), ids });
    }
  }
  return chains;
}

/* ── cells ───────────────────────────────────────────────────────────────── */
const cellOf = (lon, lat) => [
  Math.floor(lat / CELL_DEG) * CELL_DEG,
  Math.floor(lon / CELL_DEG) * CELL_DEG,
];
export const cellKey = (lat, lon) => `${lat}_${lon}`.replace(/-/g, 'm');

/** Every maximal run of vertices inside `cell`, extended one vertex past each
 *  end so the drawn line reaches the cell edge instead of stopping short. */
function clipToCell(pts, lat0, lon0) {
  const lat1 = lat0 + CELL_DEG, lon1 = lon0 + CELL_DEG;
  const inside = (p) => p[1] >= lat0 && p[1] < lat1 && p[0] >= lon0 && p[0] < lon1;
  const runs = [];
  let i = 0;
  while (i < pts.length) {
    if (!inside(pts[i])) { i++; continue; }
    let a = i;
    while (i < pts.length && inside(pts[i])) i++;
    let b = i - 1;
    if (a > 0) a--;
    if (b < pts.length - 1) b++;
    runs.push(pts.slice(a, b + 1));
  }
  return runs;
}

/* ── emit ────────────────────────────────────────────────────────────────── */
const clean = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== '') out[k] = v;
  return out;
};
const fc = (features) => ({ type: 'FeatureCollection', features });

function main() {
  const report = process.argv.includes('--report');
  const ways = readCache();

  /* ── the world file ──────────────────────────────────────────────────────
     Heavy rail only: at z5 a tram network is one pixel of noise laid over the
     mainline it runs beside. Merged on the AXIS VALUES ONLY, so a line does not
     break in two because one half carries a name. */
  const worldWays = ways.filter((w) => HEAVY.has(w.k));
  const axisSig = (w) => {
    const p = propsOf(w);
    /* ⚠ MERGE ON WHAT THE LEVEL SHIPS, NOT ON WHAT THE TAGS SAY. The first version keyed these
       chains on the READINGS — raw voltage, raw maxspeed, raw track count — so two kilometres of
       one line signed 158 km/h and 160 km/h were two features, and at z5 they are the same pixel
       in the same colour. The world file carries BUCKETS, so the buckets are its identity;
       anything finer is fragmentation that only the file size can feel. Gauge stays exact,
       because gauge is shipped exact. */
    return [p.k, p.x, p.g, elecBucket(p.e, p.v || 0, p.c), speedBucket(p.s), tracksBucket(p.tr), p.m || 'na'].join('');
  };
  log('  merging world level …');
  const worldChains = mergeChains(worldWays, axisSig);
  /* simplify first, then decide what survives — the decision is about what will be DRAWN */
  const simplified = [];
  for (const ch of worldChains) {
    const pts = round(dp(ch.pts, WORLD_TOL), WORLD_DP);
    if (pts.length < 2) continue;
    simplified.push({ pts, props: ch.props, km: lengthKm(pts), keep: false });
  }
  const endKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);
  const touch = new Map();
  simplified.forEach((c, i) => {
    for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) {
      const k = endKey(p);
      let a = touch.get(k); if (!a) { a = []; touch.set(k, a); }
      a.push(i);
    }
  });
  const queue = [];
  simplified.forEach((c, i) => { if (c.km >= WORLD_MIN_KM) { c.keep = true; queue.push(i); } });
  /* anything a kept chain ends on is kept too, transitively — that is what closes the holes */
  while (queue.length) {
    const c = simplified[queue.pop()];
    for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) {
      for (const j of touch.get(endKey(p)) || []) {
        if (!simplified[j].keep) { simplified[j].keep = true; queue.push(j); }
      }
    }
  }
  const worldFeatures = [];
  let worldVerts = 0, shortDropped = 0, shortKm = 0, keptKm = 0, rescued = 0;
  for (const ch of simplified) {
    const pts = ch.pts, km = ch.km;
    if (!ch.keep) { shortDropped++; shortKm += km; continue; }
    if (km < WORLD_MIN_KM) rescued++;
    keptKm += km;
    worldVerts += pts.length;
    const p = ch.props;
    /* ⚠ THE WORLD FILE SHIPS BUCKETS, NOT READINGS, FOR EVERY AXIS BUT GAUGE. MEASURED on a
       251-cell partial sweep: 15,126 lines carried 2.99 MB, of which the vertices were 0.78 MB —
       the rest was eleven properties per line, and at z5 not one of them is legible as a number.
       The buckets are what the colour asks for, and they are what the legend names; the readings
       themselves are in the 5° cells, one zoom step away. Gauge stays a number because it is the
       flagship axis and «1435 mm» is the answer people came for. */
    worldFeatures.push({
      pts,
      props: clean({
        k: p.k, x: p.x === 'operational' ? undefined : p.x, g: p.g,
        be: elecBucket(p.e, p.v || 0, p.c), bs: speedBucket(p.s), bt: tracksBucket(p.tr),
        bm: p.m || 'na',
      }),
    });
  }
  const worldJson = JSON.stringify(encodeLines(worldFeatures, WORLD_KEYS, WORLD_SCALE));
  const worldGz = gzipSync(Buffer.from(worldJson), { level: 9 });
  log(`  world  ${worldFeatures.length} lines · ${worldVerts} verts · ${(worldJson.length / 1e6).toFixed(2)} MB raw · ${(worldGz.length / 1e6).toFixed(2)} MB gz`);
  log(`         generalised out of the world level: ${shortDropped} chains under ${WORLD_MIN_KM} km `
    + `(${Math.round(shortKm)} km of ${Math.round(shortKm + keptKm)} = ${(shortKm / (shortKm + keptKm) * 100).toFixed(1)}% of route length) — all of them still in the 5° cells; `
    + `${rescued} short chains kept because a kept chain ends on them`);

  /* ── the cells ───────────────────────────────────────────────────────────
     Everything, at full detail, with the strings and the OSM id. */
  log('  merging cell level …');
  const fullSig = (w) => {
    const p = propsOf(w);
    return [p.k, p.x, p.g, p.e, p.v, p.q, p.s, p.tr, p.u, p.h, p.m, p.y, p.n, p.r, p.o, p.ow].join('');
  };
  const cellChains = mergeChains(ways, fullSig);
  const cells = new Map();
  for (const ch of cellChains) {
    const pts = round(dp(ch.pts, CELL_TOL), CELL_DP);
    if (pts.length < 2) continue;
    /* which cells does this chain touch? */
    const touched = new Set();
    for (const p of pts) { const [la, lo] = cellOf(p[0], p[1]); touched.add(la + '|' + lo); }
    const p = ch.props;
    const props = clean({
      k: p.k, x: p.x === 'operational' ? undefined : p.x, g: p.g, dg: p.dg,
      e: p.e, v: p.v, q: p.q, c: p.c, s: p.s, t: p.tr, u: p.u, h: p.h, m: p.m,
      y: p.y, n: p.n, r: p.r, o: p.o, ow: p.ow, w: p.w, cw: p.cw, i: ch.ids[0],
    });
    for (const t of touched) {
      const [la, lo] = t.split('|').map(Number);
      const runs = clipToCell(pts, la, lo);
      if (!runs.length) continue;
      const key = cellKey(la, lo);
      let arr = cells.get(key); if (!arr) { arr = []; cells.set(key, arr); }
      for (const r of runs) arr.push({ pts: r, props });
    }
  }
  let cellRaw = 0, cellGz = 0, cellLines = 0;
  const index = { cell: CELL_DEG, cells: {} };
  const payloads = [];
  for (const [key, feats] of cells) {
    const json = JSON.stringify(encodeLines(feats, CELL_KEYS, CELL_SCALE, 'i'));
    const gz = gzipSync(Buffer.from(json), { level: 9 });
    cellRaw += json.length; cellGz += gz.length; cellLines += feats.length;
    index.cells[key] = gz.length;
    payloads.push([key, gz]);
  }
  log(`  cells  ${cells.size} files · ${cellLines} lines · ${(cellRaw / 1e6).toFixed(1)} MB raw · ${(cellGz / 1e6).toFixed(1)} MB gz`);

  if (report) { log('  --report: nothing written'); return; }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'c'), { recursive: true });
  writeFileSync(join(OUT, 'world.json.gz'), worldGz);
  for (const [key, gz] of payloads) writeFileSync(join(OUT, 'c', key + '.json.gz'), gz);
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
  log(`  wrote ${OUT}`);
}

main();
