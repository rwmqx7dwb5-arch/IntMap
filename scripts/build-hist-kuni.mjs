#!/usr/bin/env node
/* ============================================================================
 *  build-hist-kuni.mjs — data/hist-kuni.js  (#R668)
 * ----------------------------------------------------------------------------
 *  THE SUBDIVISIONS UPSTREAM IS SILENT ABOUT, DRAWN FROM A RASTER WE MAY USE.
 *
 *  ── WHY THIS FILE EXISTS (measured 2026-09-10) ─────────────────────────────
 *  「日本は北半分の令制国が全滅。」 Measured, and true, and NOT a defect in
 *  IntMap's pipeline: OpenHistoricalMap simply does not hold those units.
 *  Asked for every relation whose name ends in 国 at admin_level 3-4, OHM returns
 *  exactly 53 of the classical 68 provinces. Fifteen are absent as relations —
 *  陸奥 出羽 信濃 越後 上野 下野 美濃 飛騨 若狭 越前 加賀 能登 越中 佐渡 隠岐 —
 *  which is the whole of 東山道 and 北陸道, i.e. everything north and east of the
 *  Kinai except the Tōkaidō coast. OSM proper is no help: it holds 53 as well, and
 *  the two sets differ by ONE unit (OSM has 隠岐 and lacks 近江; OHM the reverse),
 *  so even their union is 54/68.
 *
 *  ── WHY NOT SOMEBODY ELSE'S POLYGONS ──────────────────────────────────────
 *  Two datasets hold all 68 and neither may be shipped from a public repository:
 *    · CODH 旧国・旧郡境界データセット (geoshape.ex.nii.ac.jp/kg) — 85 units,
 *      superb (陸中 alone is 24,584 vertices) and **CC BY-NC 4.0**, inherited from
 *      人間文化研究機構's 幕末明治地勢地図境界データ. Non-commercial is upstream's
 *      term; it cannot be relaxed downstream.
 *    · Harvard Dataverse «Japan Tokugawa GIS» (doi:10.7910/DVN/2CVTR0) — 68 + 松前,
 *      whose deposit metadata says CC0 while the README inside the ZIP says
 *      "non-commercial academic purposes only" and a third file says CC BY-NC-SA.
 *      A licence that contradicts itself is not a licence to redistribute under.
 *  Every GitHub copy measured traces back to one of those two.
 *
 *  ── WHAT THIS BUILD ACTUALLY DOES ─────────────────────────────────────────
 *  It DERIVES the polygons, from two records IntMap may use without reservation:
 *    ① EXTENT  — Asukana/Ryoseikoku_20230626_TSV, **CC0 1.0**: 663 tiles of
 *       256x256 integer province codes at web-mercator zoom 10. One cell is
 *       0.001373 degrees of longitude, ~112 m at 36N — FINER than the 281 m mean
 *       vertex spacing OHM's own 伊豆国 is drawn with, and sixteen times finer than
 *       the 0.02 degree simplification data/hist-admin1.js ships. The raster is
 *       vectorised here: cell edges between one code and anything else are joined
 *       into rings, collinear runs collapse, and the staircase is taken off with
 *       Douglas-Peucker at half a cell.
 *    ② NAME    — Wikidata, **CC0**: every item of class 令制国 (Q860290) carries a
 *       coordinate (P625). A traced region is named by which of those points falls
 *       inside it. NOTHING here is a hand-written table of names or of coordinates:
 *       #R515 forbids exactly that, and #R574 measured what hand-typed coordinates
 *       are worth (130 km out).
 *
 *  ── AND ONLY WHAT UPSTREAM IS SILENT ABOUT IS WRITTEN ─────────────────────
 *  ⚠ A unit OHM already holds is NOT emitted, and the rule is not a list of fifteen
 *  names — it is a JOIN against data/hist-admin1.js: a traced region whose name is
 *  already in the shipped OHM bundle is dropped. The day a mapper adds 越後国 to
 *  OpenHistoricalMap, this build stops emitting it, with no edit here. A hand-kept
 *  list of fifteen would go on drawing it twice.
 *
 *  Output: the same ring-pooled literal the other three bundles use, so
 *  js/time-admin1.js reads it with the code it already has.
 *      window.__HISTKUNI = { v, src, built, tolerance, rings:[…], feats:[…] }
 *      feat = [ name, lvl, sy,sm,sd, ey,em,ed, [[ringIdx…]…], names, id ]
 *  `id` is null by construction: these units have no OpenHistoricalMap relation, and
 *  that null is what js/time-admin1.js reads to know the tiles cannot be carrying
 *  them — so their line is drawn from here even while the tile line is live.
 *
 *  Usage: node scripts/build-hist-kuni.mjs [--tol 0.0007] [--dec 5] [--check]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CHECK = args.includes('--check');
const OUT = path.resolve(ROOT, argOf('--out', 'data/hist-kuni.js'));
const TOL = parseFloat(argOf('--tol', '0.0007'));    /* half a cell — takes the staircase off, keeps the shape */
const QUANT = Math.pow(10, parseInt(argOf('--dec', '5'), 10));   /* 5 decimals = ~1 m; the cell is ~112 m */
const CACHE = path.resolve(argOf('--cache', path.join(process.env.TEMP || '/tmp', 'kuni-raster-cache')));
const MIN_CELLS = 12;   /* a ring under a dozen cells is raster noise, not an island */

const Z = 10, TS = 256, WORLD = TS * (1 << Z);
const RASTER_REPO = 'Asukana/Ryoseikoku_20230626_TSV';
const RASTER_SRC = 'https://github.com/' + RASTER_REPO + ' (CC0 1.0) · vectorised by scripts/build-hist-kuni.mjs';
const NAME_SRC = 'Wikidata (CC0)';
const SRC = 'Derived: ' + RASTER_SRC + ' · names from ' + NAME_SRC;

/* the ring/polygon assembler is js/ohm-rings.js — one owner, evaluated, never copied (#R668) */
const OHMR = (function () {
  const sandbox = { window: {}, console, Number, Array, Math, JSON };
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'ohm-rings.js'), 'utf8'), ctx, { filename: 'ohm-rings.js' });
  return sandbox.window.IntMapOhmRings;
})();

/* ── web mercator, zoom 10 pixel grid ⇄ lon/lat ──────────────────────────── */
const gx2lon = (gx) => (gx / WORLD) * 360 - 180;
const gy2lat = (gy) => { const n = Math.PI - 2 * Math.PI * (gy / WORLD); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

/* ── the raster ──────────────────────────────────────────────────────────── */
function loadGrid() {
  if (!fs.existsSync(CACHE)) throw new Error('raster cache missing: ' + CACHE + ' — run with --fetch first');
  const files = fs.readdirSync(CACHE).filter((f) => /^zxy_10_\d+_\d+\.tsv$/.test(f));
  if (!files.length) throw new Error('raster cache holds no tiles: ' + CACHE);
  let tx0 = Infinity, tx1 = -Infinity, ty0 = Infinity, ty1 = -Infinity;
  for (const f of files) { const m = /^zxy_10_(\d+)_(\d+)\.tsv$/.exec(f); const x = +m[1], y = +m[2];
    if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; }
  const W = (tx1 - tx0 + 1) * TS, H = (ty1 - ty0 + 1) * TS;
  const g = new Uint8Array(W * H);
  for (const f of files) {
    const m = /^zxy_10_(\d+)_(\d+)\.tsv$/.exec(f);
    const ox = (+m[1] - tx0) * TS, oy = (+m[2] - ty0) * TS;
    const rows = fs.readFileSync(path.join(CACHE, f), 'utf8').split('\n');
    for (let r = 0; r < TS && r < rows.length; r++) {
      const line = rows[r]; if (!line) continue;
      const cells = line.split('\t');
      for (let c = 0; c < TS && c < cells.length; c++) {
        const v = +cells[c]; if (v) g[(oy + r) * W + (ox + c)] = v;
      }
    }
  }
  return { g, W, H, ox: tx0 * TS, oy: ty0 * TS, tiles: files.length };
}

/* ── ① the cells of one code → closed rings, in grid coordinates ─────────
   Every unit edge that separates a cell of this code from anything else is a piece
   of its boundary, emitted with the interior on a consistent side so the pieces join
   in one direction. This is exact: no threshold, no marching-squares interpolation,
   nothing to tune — the boundary of a set of squares IS a set of unit segments.
   ⚠ EVERY CODE IS TRACED IN ONE PASS OVER THE GRID, not one pass per code. The grid is 224 million
   cells; scanning it once per province is seventy-three of those, and this build has to run again
   every time upstream moves. */
function ringsAll(G) {
  const { g, W, H } = G;
  const byCode = new Map();   /* code → Map("x,y" → [[x2,y2]…] outgoing) */
  const edgesOf = (c) => { let m = byCode.get(c); if (!m) { m = new Map(); byCode.set(c, m); } return m; };
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const code = g[row + x]; if (!code) continue;
      const edges = edgesOf(code);
      const push = (ax, ay, bx, by) => {
        const k = ax + ',' + ay; let a = edges.get(k); if (!a) { a = []; edges.set(k, a); } a.push([bx, by]);
      };
      if (y === 0     || g[row - W + x] !== code) push(x, y, x + 1, y);
      if (x === W - 1 || g[row + x + 1] !== code) push(x + 1, y, x + 1, y + 1);
      if (y === H - 1 || g[row + W + x] !== code) push(x + 1, y + 1, x, y + 1);
      if (x === 0     || g[row + x - 1] !== code) push(x, y + 1, x, y);
    }
  }
  const out = new Map();
  for (const [code, edges] of byCode) out.set(code, joinRings(edges));
  return out;
}
function joinRings(edges) {
  const rings = [];
  for (const startKey of [...edges.keys()]) {
    while ((edges.get(startKey) || []).length) {
      const ring = [];
      let cx = +startKey.split(',')[0], cy = +startKey.split(',')[1];
      const sx = cx, sy = cy;
      let guard = 0;
      for (;;) {
        const k = cx + ',' + cy, out = edges.get(k);
        if (!out || !out.length) break;
        const nxt = out.pop(); if (!out.length) edges.delete(k);
        ring.push([cx, cy]);
        cx = nxt[0]; cy = nxt[1];
        if (cx === sx && cy === sy) break;
        if (++guard > 40e6) break;
      }
      if (ring.length >= 4) { ring.push([sx, sy]); rings.push(ring); }
    }
  }
  return rings;
}

/* ── ② the staircase comes off: collinear runs first (lossless), then DP ─── */
function dropCollinear(r) {
  const o = [r[0]];
  for (let i = 1; i < r.length - 1; i++) {
    const a = o[o.length - 1], b = r[i], c = r[i + 1];
    if ((b[0] - a[0]) * (c[1] - a[1]) === (b[1] - a[1]) * (c[0] - a[0])) continue;
    o.push(b);
  }
  o.push(r[r.length - 1]);
  return o;
}
function simplifyRing(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]], tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, den = dx * dx + dy * dy;
    let far = -1, fd = 0;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0], py = pts[i][1];
      let t = den ? ((px - ax) * dx + (py - ay) * dy) / den : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx, qy = ay + t * dy;
      const dd = (px - qx) * (px - qx) + (py - qy) * (py - qy);
      if (dd > fd) { fd = dd; far = i; }
    }
    if (fd > tol2 && far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
const quant = (r) => {
  const o = []; let px = NaN, py = NaN;
  for (const p of r) {
    const x = Math.round(p[0] * QUANT) / QUANT, y = Math.round(p[1] * QUANT) / QUANT;
    if (x !== px || y !== py) { o.push([x, y]); px = x; py = y; }
  }
  if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push([o[0][0], o[0][1]]);
  return o;
};

/* ── ③ names, from Wikidata ──────────────────────────────────────────────── */
async function kuniPoints() {
  const cf = path.join(CACHE, 'wikidata-kuni.json');
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const q = 'SELECT ?p ?pLabel ?jaLabel ?deLabel ?ruLabel ?esLabel ?frLabel ?koLabel ?zhtLabel ?zhsLabel ?coord ?inc ?dis WHERE {'
    + ' ?p wdt:P31 wd:Q860290 . ?p wdt:P625 ?coord .'
    + ' OPTIONAL { ?p wdt:P571 ?inc } OPTIONAL { ?p wdt:P576 ?dis }'
    + " OPTIONAL { ?p rdfs:label ?jaLabel FILTER(LANG(?jaLabel)='ja') }"
    + " OPTIONAL { ?p rdfs:label ?deLabel FILTER(LANG(?deLabel)='de') }"
    + " OPTIONAL { ?p rdfs:label ?ruLabel FILTER(LANG(?ruLabel)='ru') }"
    + " OPTIONAL { ?p rdfs:label ?esLabel FILTER(LANG(?esLabel)='es') }"
    + " OPTIONAL { ?p rdfs:label ?frLabel FILTER(LANG(?frLabel)='fr') }"
    + " OPTIONAL { ?p rdfs:label ?koLabel FILTER(LANG(?koLabel)='ko') }"
    + " OPTIONAL { ?p rdfs:label ?zhtLabel FILTER(LANG(?zhtLabel)='zh-hant') }"
    + " OPTIONAL { ?p rdfs:label ?zhsLabel FILTER(LANG(?zhsLabel)='zh-hans') }"
    + ' SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q),
    { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'IntMap/build-hist-kuni (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
  if (!r.ok) throw new Error('wikidata HTTP ' + r.status);
  const j = await r.json();
  const val = (b, k) => (b[k] ? b[k].value : '');
  const rows = j.results.bindings.map((b) => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value) || [];
    const names = { en: val(b, 'pLabel'), ja: val(b, 'jaLabel'), de: val(b, 'deLabel'), ru: val(b, 'ruLabel'),
                    es: val(b, 'esLabel'), fr: val(b, 'frLabel'), ko: val(b, 'koLabel'),
                    'zh-Hant': val(b, 'zhtLabel'), 'zh-Hans': val(b, 'zhsLabel') };
    for (const k of Object.keys(names)) if (!names[k]) delete names[k];
    const yr = (v) => (v ? parseInt(String(v.value).replace(/^-/, '').slice(0, 4), 10) : null);
    return { q: b.p.value.split('/').pop(), lon: +m[1], lat: +m[2], names, inc: yr(b.inc), dis: yr(b.dis) };
  }).filter((x) => Number.isFinite(x.lon) && Number.isFinite(x.lat) && x.names.ja);
  fs.writeFileSync(cf, JSON.stringify(rows));
  return rows;
}

/* ══ ⚠ (#R668) THE COORDINATE IS ONE POINT, AND ONE POINT DOES NOT NAME EVERY REGION ═══════════
   Measured on this raster: of 73 traced regions, seven hold no 令制国 coordinate at all — among
   them the whole northern tip of Honshū, which the raster codes apart from the rest of 陸奥 — and
   three regions hold TWO, because a province's single Wikidata point sits close enough to a border
   to fall on the other side of it.
   So a second CC0 signal is asked for exactly the regions the first could not name: Wikidata's
   PREFECTURES carry a coordinate too, and each one states which province it succeeded (P1365
   «replaces» / P131 «located in»). 青森県 says 陸奥国, and that is how the tip of Honshū gets its
   name — from the record, not from a table somebody typed here. */
async function prefPoints() {
  const cf = path.join(CACHE, 'wikidata-pref.json');
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  /* ⚠ NOT ONLY PREFECTURES, AND NOT ONLY THEIR OWN COORDINATE. Measured: 126 prefectures exist as
     Wikidata items, 50 carry a coordinate and FIVE state the province they replaced — the intersection
     of those two is empty, so a query that demands both returns nothing at all (it did). The claim that
     matters is P1365 «replaces», whoever makes it, and the point may be the claimant's own or its
     capital's. That is 18 rows, and 青森県 → 陸奥国 is one of them. */
  /* ⚠ AND THE PROVINCE A PREFECTURE SUCCEEDED MAY ITSELF BE A SUCCESSOR. 青森県 states that it
     replaced 陸奥国 — but the item it points at is the 陸奥国 the 1869 division CREATED (Q3297721),
     which did not exist in the raster's own year, so a build that stopped there found nothing in
     force and left the tip of Honshū nameless. That item states in turn what IT replaced: the
     classical 陸奥国 (Q907389). One hop, asked of the record, and it is the same hop that resolves
     all seven of the 1869 provinces (陸中 陸前 岩代 磐城 羽前 羽後 and the new 陸奥). */
  const q = 'SELECT ?p ?coord ?kuni ?prev WHERE {'
    + ' ?p wdt:P1365 ?kuni . ?kuni wdt:P31 wd:Q860290 .'
    + ' OPTIONAL { ?kuni wdt:P1365 ?prev }'
    + ' { ?p wdt:P625 ?coord } UNION { ?p wdt:P36 ?cap . ?cap wdt:P625 ?coord } }';
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q),
    { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'IntMap/build-hist-kuni (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
  if (!r.ok) throw new Error('wikidata HTTP ' + r.status);
  const j = await r.json();
  const rows = j.results.bindings.map((b) => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value) || [];
    return { lon: +m[1], lat: +m[2], kuni: b.kuni.value.split('/').pop(),
             prev: b.prev ? b.prev.value.split('/').pop() : null };
  }).filter((x) => Number.isFinite(x.lon) && Number.isFinite(x.lat));
  fs.writeFileSync(cf, JSON.stringify(rows));
  return rows;
}

/* ── ④ what OpenHistoricalMap already holds — the join that keeps this additive ── */
function ohmNames() {
  const s = fs.readFileSync(path.join(ROOT, 'data', 'hist-admin1.js'), 'utf8');
  const d = JSON.parse(s.slice(s.indexOf('=') + 1, s.lastIndexOf(';')));
  const set = new Set();
  for (const f of d.feats) { if (f[0]) set.add(f[0]); const n = f[9] || {}; if (n.ja) set.add(n.ja); }
  return set;
}

/* ── point in ring, on the traced grid rings (grid coordinates) ──────────── */
function pipRing(x, y, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

/* ══ ⚠ THE GATE MUST RUN WHERE THE RASTER IS NOT ═══════════════════════════════════════════════
   The 663 tiles are 130 MB and are not in the repository, so CI — and any clone that has not run
   the build — has no raster to compare against. A `--check` that needed one would be a gate that is
   green only on the machine that last built the file, which is the same as no gate. So the checks
   that need only the SHIPPED file run always, and the one that needs upstream runs when upstream is
   on disk. Both are stated, so a reader can see which one they got. */
function checkShipped() {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (!cur) { console.error('FAILED ' + path.relative(ROOT, OUT) + ' does not exist'); process.exit(1); }
  const d = JSON.parse(cur.slice(cur.indexOf('=') + 1, cur.lastIndexOf(';')));
  const already = ohmNames();
  const fail = [];
  if (!d.feats.length) fail.push('the file holds no units');
  if (!/CC0/.test(d.src || '')) fail.push('src must name the licence the units were derived under');
  for (const f of d.feats) {
    if (f[10] !== null) fail.push(f[0] + ': a unit OpenHistoricalMap does not hold must carry a null relation id');
    if (already.has(f[0])) fail.push(f[0] + ' is in data/hist-admin1.js too — it would be drawn twice');
    if (!f[9] || !f[9].ja || !f[9].en) fail.push(f[0] + ': a unit the reader can see needs at least its own name and English');
    let n = 0;
    for (const poly of f[8]) for (const ri of poly) {
      const r = d.rings[ri];
      if (!r) { fail.push(f[0] + ': ring index ' + ri + ' is not in the pool'); continue; }
      n += r.length;
      if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) fail.push(f[0] + ': a ring does not close');
    }
    /* ⚠ THE POINT OF THE FILE IS THAT IT IS NOT COARSE. data/hist-admin1.js draws 伊豆国 with 29
       vertices; a unit here that came out under a hundred means the vectoriser lost the shape. */
    if (n < 100) fail.push(f[0] + ': only ' + n + ' vertices — this file exists to be finer than the bundle');
  }
  if (fail.length) { console.error(fail.map((m) => 'FAILED ' + m).join('\n')); process.exit(1); }
  console.log('✓ data/hist-kuni.js — ' + d.feats.length + ' units OpenHistoricalMap does not hold, '
    + d.rings.reduce((a, r) => a + r.length, 0) + ' vertices, none of them also in data/hist-admin1.js');
}

(async function main() {
  if (CHECK) {
    checkShipped();
    if (!fs.existsSync(CACHE) || !fs.readdirSync(CACHE).some((f) => /^zxy_10_/.test(f))) {
      console.log('· the raster is not on this machine, so the derivation itself was not re-run');
      return;
    }
  }
  const G = loadGrid();
  console.error('· raster', G.tiles, 'tiles →', G.W + '×' + G.H, 'cells');

  const counts = new Map();
  for (let i = 0; i < G.g.length; i++) { const v = G.g[i]; if (v) counts.set(v, (counts.get(v) || 0) + 1); }
  console.error('  distinct province codes', counts.size);

  const YEAR = parseInt(argOf('--year', '1868'), 10);   /* the raster publishes itself under this year (its own directory) */
  const all = await kuniPoints();
  /* ⚠ ONLY THE PROVINCES THE RASTER'S OWN YEAR HAD. Wikidata's 令制国 class holds 83 items, which is
     every province that ever existed: 諏方国 (721-731), and the seven the 1869 division created out
     of 陸奥 and 出羽 (陸中 陸前 岩代 磐城 羽前 羽後 and a second 陸奥). Measured, leaving them in is
     not harmless — 諏方国's coordinate sits inside the Shinano region and claimed it, so the map
     named 信濃国 after a province that had been gone for eleven centuries. The span is in the record
     (P571 / P576); asking it is the fix, and it is the same fix for all eight. */
  const pts = all.filter((p) => (p.inc == null || p.inc <= YEAR) && (p.dis == null || p.dis >= YEAR));
  console.error('· wikidata 令制国 with a coordinate:', all.length, '→ in force in', YEAR + ':', pts.length);
  const prefs = await prefPoints();
  console.error('· wikidata prefectures that name the province they succeeded:', prefs.length);
  const byQ = new Map(all.map((p) => [p.q, p]));
  const already = ohmNames();
  const claimed = new Set();

  const pool = [], poolIx = new Map();
  const put = (r) => { const k = JSON.stringify(r); let ix = poolIx.get(k); if (ix === undefined) { ix = pool.length; pool.push(r); poolIx.set(k, ix); } return ix; };
  const feats = [];
  const named = [], unnamed = [], skipped = [], merged = [];

  const traced = ringsAll(G);
  console.error('· traced', traced.size, 'regions in one pass over the grid');

  /* ══ ⚠⚠⚠ A PROVINCE MAY BE MORE THAN ONE OF THE RASTER'S CODES ═══════════════════════════════
     Measured: this raster codes the northern tip of Honshū apart from the rest of 陸奥国 — the
     1869 division's 陸奥, left standing in a set that is otherwise the classical sixty-eight. A
     build that named one code one province therefore drew 陸奥国 stopping at 40.45°N, with the
     whole of what is now 青森県 blank, which is the very complaint this round exists to answer.
     So codes are RESOLVED first and GROUPED by the province they resolve to, and the geometry is
     assembled per province. Nothing here says «those two codes are Mutsu»: code A holds 陸奥国's
     own coordinate, code B holds 青森県, and 青森県 states in Wikidata that it replaced 陸奥国. */
  const group = new Map();   /* province q → { hit, codes:[…], rings:[…] } */
  for (const code of [...counts.keys()].sort((a, b) => a - b)) {
    if (counts.get(code) < MIN_CELLS) continue;
    const gridRings = (traced.get(code) || []).filter((r) => r.length >= 5);
    if (!gridRings.length) continue;

    /* name it: which 令制国 coordinate falls in this code's cells? Asked of the RINGS, so a point
       in a neighbouring province cannot claim it — and asked of ALL of them, because «the first one
       inside» is an answer that depends on the order Wikidata happened to return. */
    const inRegion = (lon, lat) => {
      const gx = (lon + 180) / 360 * WORLD - G.ox;
      const sn = Math.sin(lat * Math.PI / 180);
      const gy = WORLD * (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) - G.oy;
      let inside = false;
      for (const r of gridRings) if (pipRing(gx, gy, r)) inside = !inside;
      return inside;
    };
    let hits = pts.filter((p) => !claimed.has(p.q) && inRegion(p.lon, p.lat));
    /* ⚠ AND IF NONE DID, ASK THE PREFECTURES. Seven of this raster's regions hold no province
       coordinate at all — the northern tip of Honshū among them, which the raster codes apart from
       the rest of 陸奥. A prefecture inside such a region states the province it succeeded, so the
       region is named from the record rather than left blank or guessed at. */
    if (!hits.length) {
      const q = new Set();
      for (const f of prefs) { if (!inRegion(f.lon, f.lat)) continue; q.add(f.kuni); if (f.prev) q.add(f.prev); }
      hits = [...q].map((id) => byQ.get(id)).filter((p) => p
        && (p.inc == null || p.inc <= YEAR) && (p.dis == null || p.dis >= YEAR));
    }
    if (!hits.length) { unnamed.push(code); continue; }
    /* two points in one region is one point on the wrong side of a border: keep the one nearest the
       region's own centre of mass, which is the one the region is actually about. */
    let hit = hits[0];
    if (hits.length > 1) {
      let cx = 0, cy = 0, n = 0;
      for (const r of gridRings) for (const pt of r) { cx += pt[0]; cy += pt[1]; n++; }
      cx = gx2lon(cx / n + G.ox); cy = gy2lat(cy / n + G.oy);
      hit = hits.slice().sort((a, b) => ((a.lon - cx) ** 2 + (a.lat - cy) ** 2) - ((b.lon - cx) ** 2 + (b.lat - cy) ** 2))[0];
    }
    claimed.add(hit.q);
    let grp = group.get(hit.q);
    if (!grp) { grp = { hit, codes: [], rings: [] }; group.set(hit.q, grp); }
    grp.codes.push(code);
    for (const r of gridRings) grp.rings.push(r);
  }

  for (const grp of group.values()) {
    const hit = grp.hit;
    if (already.has(hit.names.ja)) { skipped.push(hit.names.ja); continue; }

    /* grid → lon/lat, staircase off, holes nested by the shared assembler */
    const geoRings = [];
    for (const r of grp.rings) {
      const simp = simplifyRing(dropCollinear(r), 0.5);
      if (simp.length < 4) continue;
      const ll = quant(simplifyRing(simp.map((p) => [gx2lon(p[0] + G.ox), gy2lat(p[1] + G.oy)]), TOL));
      if (ll.length >= 4 && OHMR.ringArea(ll) > 0) geoRings.push(ll);
    }
    if (!geoRings.length) { unnamed.push(grp.codes.join('+')); continue; }
    const polys = OHMR.polysOf(geoRings, 0);
    const idx = polys.map((poly) => poly.map((ring) => put(ring))).filter((a) => a.length);
    if (!idx.length) { unnamed.push(grp.codes.join('+')); continue; }

    /* ⚠ THE SPAN IS THE RASTER'S OWN CLAIM AND NOTHING MORE. The tiles are published
       under the year 1868 and the 令制国 were abolished by the 廃藩置県 of 1871-08-29,
       which is the end date OpenHistoricalMap carries on all 53 provinces it does hold
       — so these fifteen end when their fifty-three neighbours end, and start open,
       exactly as those neighbours do. Inventing a founding date per province is what
       this repository's rules call a placeholder. */
    feats.push([hit.names.ja, 4, -199, 1, 1, 1871, 8, 29, idx, hit.names, null]);
    named.push(hit.names.ja);
    if (grp.codes.length > 1) merged.push(hit.names.ja + ' = raster codes ' + grp.codes.join('+'));
  }

  const body = 'window.__HISTKUNI=' + JSON.stringify({
    v: 1, src: SRC, built: new Date().toISOString().slice(0, 10), tolerance: TOL,
    levels: [4], rings: pool, feats
  }) + ';\n';

  if (CHECK) {
    const cur = fs.readFileSync(OUT, 'utf8');
    const curD = JSON.parse(cur.slice(cur.indexOf('=') + 1, cur.lastIndexOf(';')));
    const curNames = new Set(curD.feats.map((f) => f[0]));
    const bad = named.filter((n) => !curNames.has(n)).concat([...curNames].filter((n) => !named.includes(n)));
    if (bad.length) { console.error('FAILED data/hist-kuni.js disagrees with the raster: ' + bad.join(' ')); process.exit(1); }
    console.log('✓ …and it re-derives from the raster: the same ' + named.length + ' units');
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);
  const verts = pool.reduce((a, r) => a + r.length, 0);
  console.error('· wrote', path.relative(ROOT, OUT), (body.length / 1048576).toFixed(2) + ' MB',
                '| units', feats.length, '| rings', pool.length, '| vertices', verts);
  console.error('· emitted:', named.join(' '));
  if (merged.length) console.error('· one province, several raster codes:', merged.join(' · '));
  console.error('· already in data/hist-admin1.js, so not emitted:', skipped.length, 'units');
  if (unnamed.length) console.error('· ⚠ codes no 令制国 coordinate fell inside:', unnamed.join(','));
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
