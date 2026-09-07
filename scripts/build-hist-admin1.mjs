#!/usr/bin/env node
/* ============================================================================
 *  build-hist-admin1.mjs — data/hist-admin1.js  (#R530)
 * ----------------------------------------------------------------------------
 *  The FIRST-LEVEL SUBDIVISIONS of the world, with the DATES they were in force —
 *  the admin-1 twin of data/cshapes.js, so that moving the clock changes the
 *  provinces the same way it already changes the countries.
 *
 *  ── WHY THIS FILE EXISTS (measured, #R530) ─────────────────────────────────
 *  Before this round the province layer (`ref-admin1`) drew OpenFreeMap/OSM's
 *  PRESENT-DAY boundaries and read no clock at all, so a reader who travelled to
 *  1900 got the 1900 countries with the 2026 provinces drawn on top of them.
 *
 *  Nothing on the open web ships a finished world admin-1 time series. Measured
 *  2026-09-07, every candidate and what it actually is:
 *    · aourednik/historical-basemaps — 54 files, all sovereign states. Zero admin-1.
 *    · Who's On First `region`       — 5,315 records, `edtf:inception` = "uuuu"
 *                                      on every one sampled. A present-day ledger.
 *    · Natural Earth 10m admin-1     — 4,596 units, ZERO date fields.
 *    · CHGIS (China)                 — province time series ends 1911; only 9 of
 *                                      its records reach 1850. EULA is non-commercial.
 *    · HGIS de las Indias            — 1701-1808 only, and a 752 MB .rar.
 *    · Eurostat GISCO NUTS           — oldest vintage is 2003.
 *    · Newberry AHCB                 — day-exact and excellent, but ONE country.
 *    · MPIDR / Mosaic                — host does not answer on 80 or 443.
 *  ⇒ **OpenHistoricalMap is the only global, dated, openly-licensed one**, and it
 *  is CC0 with `start_date`/`end_date` on 4,221 / 3,524 of its 4,268 admin-1
 *  relations, to the DAY where the day is known.
 *
 *  ⚠ THE COVERAGE IS REAL AND PARTIAL, AND THE MAP MUST SAY SO. OHM holds ~614
 *  units in force in 1900 against 4,596 present-day ones. That is not a bug to
 *  paper over: drawing a present-day province under a 1900 date — or clipping one
 *  to the era's country — would be inventing a boundary nobody surveyed. This
 *  build ships what exists; js/time-admin1.js reports what is missing.
 *
 *  Output format: the SAME ring-pooled JS literal as data/cshapes.js, because the
 *  two files are read by twin modules and one shape means one set of habits.
 *      window.__HISTADM1 = { v, src, built, rings:[ring…], feats:[feat…] }
 *      feat = [ name, lvl, sy,sm,sd, ey,em,ed, [[ringIdx…]…], names ]
 *      names = { en, ja, de, ru, es, fr, ko, 'zh-Hant', 'zh-Hans' }  (present keys only)
 *  Dates are inclusive on both ends, exactly like CShapes, so js/time-admin1.js
 *  reuses the epoch index verbatim.
 *
 *  Source & licence: OpenHistoricalMap, CC0 1.0 (openhistoricalmap.org/copyright).
 *  Declared in sources.html / js/reference-data.js like every other bundled set.
 *
 *  ⚠ THE SIMPLIFICATION IS PRICED AGAINST THE COUNTRY BUNDLE, NOT GUESSED. Measured
 *  on this exact extract (3,061 relations), Douglas-Peucker tolerance x coordinate
 *  decimals -> shipped bytes, raw / brotli:
 *      0.008 deg, 4 dec  15.46 MB / 1.54 MB     <- the first build; 3x cshapes to PARSE
 *      0.015 deg, 3 dec   8.33 MB / --
 *      0.020 deg, 3 dec   6.55 MB / 0.67 MB     <- shipped
 *      0.025 deg, 3 dec   5.50 MB / 0.59 MB     (13 units fall under MIN_AREA)
 *  data/cshapes.js is 5.33 MB / 0.38 MB, and #R192 measured that a bundle this size is
 *  paid mostly in main-thread PARSE, not in transfer — which is why the raw column is
 *  the one that decided it. 0.02 deg keeps every unit the coarser step drops.
 *
 *  Usage:  node scripts/build-hist-admin1.mjs [--out data/hist-admin1.js]
 *                                            [--tol 0.02] [--dec 3] [--since 1850] [--batch 20]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EP = 'https://overpass-api.openhistoricalmap.org/api/interpreter';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT   = path.resolve(ROOT, argOf('--out', 'data/hist-admin1.js'));
const TOL   = parseFloat(argOf('--tol', '0.02'));        /* ~2.2 km — see the size note in the header */
const SINCE = parseInt(argOf('--since', '1850'), 10);    /* the clock's own floor (js/chronos.js) */
const BATCH = parseInt(argOf('--batch', '20'), 10);
const CACHE = path.resolve(ROOT, argOf('--cache', path.join(process.env.TEMP || '/tmp', 'ohm-adm1-cache')));
const QUANT = Math.pow(10, parseInt(argOf('--dec', '3'), 10));   /* --dec 3 = ~110 m at the equator */
const MIN_AREA = 1e-5;                                   /* deg^2 — drop slivers, keep small city-states */

/* IntMap's nine (AGENTS.md section 3.5). OHM tags them `name:<code>`. */
const LANGS = { en:'name:en', ja:'name:ja', de:'name:de', ru:'name:ru', es:'name:es',
                fr:'name:fr', ko:'name:ko', 'zh-Hant':'name:zh-Hant', 'zh-Hans':'name:zh-Hans' };

/* ── EDTF-lite → [y,m,d] ────────────────────────────────────────────────────
   OHM writes ISO-ish dates with EDTF qualifiers: `1871-05-04`, `1871-05`, `1871`,
   `-0500` (BCE), and the uncertainty marks `~ ? %` plus open ranges `..`. Anything
   that is not a plain year-first date (`C18`, `18xx`, `unknown`) is UNKNOWN — the
   caller then treats the edge as open rather than inventing a day. */
function edtf(raw, edge) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[~?%]/g, '').replace(/\.\.$/, '').trim();
  if (!s || /^(unknown|present|now)$/i.test(s)) return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const m = /^(\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(s);
  if (!m) return null;
  let y = parseInt(m[1], 10); if (neg) y = -y;
  const hasM = m[2] != null, hasD = m[3] != null;
  const mo = hasM ? parseInt(m[2], 10) : (edge === 'end' ? 12 : 1);
  if (!(mo >= 1 && mo <= 12)) return null;
  let d;
  if (hasD) { d = parseInt(m[3], 10); if (!(d >= 1 && d <= 31)) return null; }
  else d = (edge === 'end') ? new Date(Date.UTC(y, mo, 0)).getUTCDate() : 1;
  return [y, mo, d];
}

/* ── Douglas–Peucker, iterative (a recursive one blows the stack on a 40k-point ring) ── */
function simplifyRing(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const seg = stack.pop(), a = seg[0], b = seg[1];
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
const ringArea = r => { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
const quant = r => {
  const o = []; let px = NaN, py = NaN;
  for (const p of r) {
    const x = Math.round(p[0] * QUANT) / QUANT, y = Math.round(p[1] * QUANT) / QUANT;
    if (x !== px || y !== py) { o.push([x, y]); px = x; py = y; }
  }
  if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push([o[0][0], o[0][1]]);
  return o;
};

/* ── Overpass ──────────────────────────────────────────────────────────────
   ⚠ ONE REQUEST FOR THE WHOLE PLANET IS NOT AN OPTION: `out geom` on Europe alone
   measured 763 MB / 14.4 M vertices. Tags come first (5.6 MB), the ids we actually
   need are chosen here, and geometry arrives in small id batches that are cached on
   disk and resumed — a build that dies at 80 % must not start over. */
async function overpass(ql, tries = 5) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(EP, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'IntMap/build-hist-admin1 (+https://github.com/rwmqx7dwb5-arch/IntMap)' },
        body: ql
      });
      if (r.status === 429 || r.status === 504 || r.status >= 500) { await new Promise(s => setTimeout(s, 5000 * (i + 1))); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return JSON.parse(await r.text());
    } catch (e) { last = e; await new Promise(s => setTimeout(s, 4000 * (i + 1))); }
  }
  throw last || new Error('overpass exhausted');
}

/* member ways → closed rings. OHM relation members arrive as unordered open ways. */
function ringsOf(el) {
  const segs = [];
  for (const m of (el.members || [])) {
    if (m.type !== 'way' || !Array.isArray(m.geometry)) continue;
    if (m.role && m.role !== 'outer' && m.role !== 'inner') continue;
    const g = m.geometry.filter(p => p && Number.isFinite(p.lon) && Number.isFinite(p.lat)).map(p => [p.lon, p.lat]);
    if (g.length >= 2) segs.push(g);
  }
  const key = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);
  const rings = [], used = new Array(segs.length).fill(false);
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let cur = segs[i].slice();
    let grew = true;
    while (grew) {
      grew = false;
      if (cur.length > 3 && key(cur[0]) === key(cur[cur.length - 1])) break;
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const s = segs[j], a = key(cur[cur.length - 1]), b = key(cur[0]);
        if (key(s[0]) === a)                 { cur = cur.concat(s.slice(1)); used[j] = true; grew = true; }
        else if (key(s[s.length - 1]) === a) { cur = cur.concat(s.slice(0, -1).reverse()); used[j] = true; grew = true; }
        else if (key(s[s.length - 1]) === b) { cur = s.slice(0, -1).concat(cur); used[j] = true; grew = true; }
        else if (key(s[0]) === b)            { cur = s.slice(1).reverse().concat(cur); used[j] = true; grew = true; }
        if (grew) break;
      }
    }
    if (cur.length >= 4) { if (key(cur[0]) !== key(cur[cur.length - 1])) cur.push([cur[0][0], cur[0][1]]); rings.push(cur); }
  }
  return rings;
}
/* outer rings become polygons; a ring wholly inside a bigger one becomes its hole. */
const bboxOf = r => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; };
const inside = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
function polysOf(rings) {
  const rs = rings.map(r => ({ r, a: ringArea(r), bb: bboxOf(r) })).filter(o => o.a >= MIN_AREA).sort((p, q) => q.a - p.a);
  const polys = [], taken = new Array(rs.length).fill(false);
  for (let i = 0; i < rs.length; i++) {
    if (taken[i]) continue;
    taken[i] = true;
    const poly = [rs[i].r];
    for (let j = i + 1; j < rs.length; j++) if (!taken[j] && inside(rs[j].bb, rs[i].bb)) { taken[j] = true; poly.push(rs[j].r); }
    polys.push(poly);
  }
  return polys;
}

(async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  /* ⚠ THE TAG SWEEP IS CACHED TOO. It was not, and a rebuild at a different --tol
     therefore had to re-ask Overpass for the whole 5.6 MB index — which is the one
     request in this script with no id to retry on, so a rate-limited answer killed a
     build whose 153 geometry batches were all already on disk. Re-simplifying must
     cost nothing but CPU. Delete the cache directory to re-pull from upstream. */
  const tf = path.join(CACHE, 'tags.json');
  let tagJson;
  if (fs.existsSync(tf)) { console.error('· tags (cached)'); tagJson = JSON.parse(fs.readFileSync(tf, 'utf8')); }
  else {
    console.error('· tags …');
    tagJson = await overpass('[out:json][timeout:600];relation["boundary"="administrative"]["admin_level"~"^(3|4)$"];out tags;');
    fs.writeFileSync(tf, JSON.stringify(tagJson));
  }
  const all = (tagJson.elements || []).filter(e => e.type === 'relation' && e.tags);
  console.error('  relations', all.length);

  /* Which of them can EVER be on screen? The clock floor is `--since`, so a unit that
     ended before it can never be shown, and one with no dates at all is a present-day
     unit that `ref-admin1` already draws from the live vector tiles. */
  const want = [];
  for (const el of all) {
    const t = el.tags;
    const s = edtf(t.start_date, 'start'), e = edtf(t.end_date, 'end');
    if (!s && !e) continue;
    if (e && e[0] < SINCE) continue;
    want.push({ el, s, e });
  }
  console.error('  datable & reachable from', SINCE, '→', want.length);

  /* geometry, in resumable id batches */
  const geom = new Map();
  const ids = want.map(w => w.el.id);
  let fetched = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const cf = path.join(CACHE, 'g' + chunk[0] + '-' + chunk.length + '.json');
    let j;
    if (fs.existsSync(cf)) { try { j = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch (_) { j = null; } }
    if (!j) {
      j = await overpass('[out:json][timeout:900];relation(id:' + chunk.join(',') + ');out geom;');
      fs.writeFileSync(cf, JSON.stringify(j));
      fetched++;
    }
    for (const el of (j.elements || [])) if (el.type === 'relation') geom.set(el.id, el);
    process.stderr.write('\r  geom ' + Math.min(i + BATCH, ids.length) + '/' + ids.length + ' (net ' + fetched + ')   ');
  }
  process.stderr.write('\n');

  /* ring pool: identical rings are shared, which is where most of the saving is —
     a province and its neighbour trace the same line from opposite sides. */
  const pool = [], poolIx = new Map();
  const put = r => { const k = JSON.stringify(r); let ix = poolIx.get(k); if (ix === undefined) { ix = pool.length; pool.push(r); poolIx.set(k, ix); } return ix; };

  const feats = [];
  let dropped = 0;
  for (const w of want) {
    const el = geom.get(w.el.id);
    if (!el) { dropped++; continue; }
    const polys = polysOf(ringsOf(el));
    const idx = [];
    for (const poly of polys) {
      const ringIx = [];
      for (const ring of poly) {
        const q = quant(simplifyRing(ring, TOL));
        if (q.length >= 4 && ringArea(q) >= MIN_AREA) ringIx.push(put(q));
      }
      if (ringIx.length) idx.push(ringIx);
    }
    if (!idx.length) { dropped++; continue; }
    const t = w.el.tags;
    const s = w.s || [SINCE - 200, 1, 1];    /* open start = already there when the clock begins */
    const e = w.e || [9999, 12, 31];         /* open end  = still in force */
    const names = {};
    for (const code of Object.keys(LANGS)) { const v = t[LANGS[code]]; if (v) names[code] = v; }
    feats.push([String(t.name || t['name:en'] || '').trim(), parseInt(t.admin_level, 10) || 4,
                s[0], s[1], s[2], e[0], e[1], e[2], idx, names]);
  }

  const src = 'OpenHistoricalMap contributors (CC0) · openhistoricalmap.org';
  const body = 'window.__HISTADM1=' + JSON.stringify({
    v: 1, src, built: new Date().toISOString().slice(0, 10), since: SINCE, tolerance: TOL,
    rings: pool, feats
  }) + ';\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);

  const years = [1850, 1870, 1900, 1914, 1938, 1950, 1990, 2020];
  const alive = y => { const t = y * 10000 + 615;
    return feats.filter(f => (f[2] * 10000 + f[3] * 100 + f[4]) <= t && (f[5] * 10000 + f[6] * 100 + f[7]) >= t).length; };
  console.error('· wrote', path.relative(ROOT, OUT), (body.length / 1048576).toFixed(2) + ' MB',
                '| feats', feats.length, '| rings', pool.length, '| dropped', dropped);
  console.error('· in force:', years.map(y => y + '=' + alive(y)).join(' '));
})().catch(e => { console.error('FAILED', e); process.exit(1); });
