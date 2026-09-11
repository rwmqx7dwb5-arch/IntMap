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
 *      names = { en, ja, de, ru, es, fr, ko, 'zh-Hant', 'zh-Hans' }  (present keys only — the keys
 *              are js/lang-registry.js's `html` tags, read off that registry rather than typed)
 *  Dates use an exclusive end: an exact end_date is the first inactive day.
 *  Year/month ends advance to the next period; original dates remain in metadata.
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
 *  ── WHAT A UNIT IS CALLED (#R695) ─────────────────────────────────────────
 *  A line with no readable label is a line the reader cannot ask about. Upstream names most units
 *  in their own language only — measured 2026-09-11, 20,357 of the second tier's 22,708 rows had no
 *  `name:<lang>` at all — but 17,120 of those carry a `wikidata` tag, and Wikidata labels the item
 *  in every language IntMap has. scripts/histadmin/ holds that join: which item may speak for which
 *  unit (names.mjs), where the labels come from (wikidata.mjs) and which languages ship
 *  (langs.mjs → scripts/histnames/langs.mjs). Filling only ever ADDS to an empty column.
 *
 *  Usage:  node scripts/build-hist-admin1.mjs --check           # verify the COMMITTED bundles, offline (#R680)
 *          node scripts/build-hist-admin1.mjs --names           # refresh every tier's NAMES, geometry untouched
 *          node scripts/build-hist-admin1.mjs [--out data/hist-admin1.js]
 *                                            [--tol 0.02] [--dec 3] [--since <clock floor>] [--batch 20]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { registry, harvestTags, shipTags } from './histadmin/langs.mjs';
import { itemVerdicts, fillNames, chineseTags, missingByTag } from './histadmin/names.mjs';
import { labelsFor, labelsByTag } from './histadmin/wikidata.mjs';
import { plainLabel } from './histeras/match.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EP = 'https://overpass-api.openhistoricalmap.org/api/interpreter';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT   = path.resolve(ROOT, argOf('--out', 'data/hist-admin1.js'));
const PREVIOUS = {};
if (!args.includes('--check') && !args.includes('--names') && fs.existsSync(OUT))
  new Function('window', fs.readFileSync(OUT, 'utf8'))(PREVIOUS);
const previousData = Object.values(PREVIOUS).find(d => Array.isArray(d?.feats));
const TOL   = parseFloat(argOf('--tol', previousData?.tolerance ?? '0.02'));        /* ~2.2 km — see the size note in the header */
function clockFloor() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/hist-scale.js'), 'utf8'), sandbox);
  const floor = sandbox.window.IntMapHistScale.FLOOR;
  if (!Number.isInteger(floor)) throw new Error('hist-scale FLOOR is missing');
  return floor;
}
const SINCE = args.includes('--check') || args.includes('--names') ? null : parseInt(argOf('--since', clockFloor()), 10);
const BATCH = parseInt(argOf('--batch', '20'), 10);
/* (#R564) THE LEVELS ARE AN ARGUMENT, AND THERE IS ONE FILE PER TIER. The first-level tier (3,4) is
   what the province row draws at every zoom; the deeper tier is fetched only when the reader zooms
   past it (js/time-admin1.js). ONE script, because the two bundles are the SAME record read with the
   same rules - a second script would be a second place to change the day OHM changes a tag. The cache
   is keyed by the level set for the reason the tag sweep is cached at all: re-simplifying must cost
   nothing but CPU. */
const LEVELS = String(argOf('--levels', '3,4')).split(',').map(v => parseInt(v, 10)).filter(Number.isFinite);
const lvlRe = levels => '^(' + levels.join('|') + ')$';
const cacheOf = levels => path.join(process.env.TEMP || '/tmp', 'ohm-adm' + levels.join('') + '-cache');
/* == (#R604) THE GLOBAL IS DERIVED FROM THE OUTPUT FILE, NOT DEFAULTED TO THE FIRST TIER =========
   `--global` used to default to `__HISTADM1` whatever `--out` said, so building the deeper tier
   without remembering that flag wrote data/hist-admin2.js containing `window.__HISTADM1=` - a file
   that loads, parses, reports no error, and REPLACES the first tier's record with the second's the
   moment js/time-admin1.js injects it. Measured here on 2026-09-10: a 15 MB bundle whose every
   assertion about itself was true and whose name was wrong. The two are not independent facts -
   data/hist-adminN.js holds `__HISTADMN` by convention - so the name is READ OFF the convention and
   `--global` stays only as an override for an output the convention does not cover. */
const GLOBAL = argOf('--global', (function () {
  const m = /hist-admin(\d+)\.js$/i.exec(OUT);
  return m ? '__HISTADM' + m[1] : '__HISTADM1';
})());
const CACHE = path.resolve(ROOT, argOf('--cache', cacheOf(LEVELS)));
function coordinateDecimals(data) {
  if (Number.isInteger(data?.decimals)) return data.decimals;
  if (!data?.rings) return 3;
  let digits = 0;
  for (const ring of data.rings) for (const point of ring) for (const v of point)
    digits = Math.max(digits, (String(v).split('.')[1] || '').length);
  return digits;
}
const DECIMALS = parseInt(argOf('--dec', coordinateDecimals(previousData)), 10);
const QUANT = Math.pow(10, DECIMALS);   /* --dec 3 = ~110 m at the equator */
const MIN_AREA = 1e-5;                                   /* deg^2 — drop slivers, keep small city-states */

/* ══ (#R695) THE LANGUAGE COLUMNS ARE THE APP'S OWN LIST, EVALUATED — NOT TYPED HERE ═════════════
   This was a literal table of nine `name:<tag>` pairs, and it was WRONG in the way a hand-kept list
   is always wrong: it had no row for a bare `name:zh`, so 1,807 Chinese names upstream had written
   were dropped, silently, by a build whose every check was green. The bundle's key alphabet is
   js/lang-registry.js's `html` column (that is what js/time-admin1.js resolves a reader's language
   through), so it is READ off that registry — scripts/histadmin/langs.mjs evaluates it, the way
   scripts/build-whs.mjs evaluates the same file. Add a language to the app and this follows.
   `name:zh` itself is upstream's, not the app's: see `zhNames` below. */
const REG = registry(ROOT);
const TAGS = harvestTags(ROOT, REG);          /* every language the app has, as OSM suffixes */
const SHIP = shipTags(ROOT, REG);             /* the ones this build may ADD a name in (policy) */
const LANGS = Object.fromEntries(TAGS.map(t => [t, 'name:' + t]));
/* ⚠⚠⚠ (#R695) `opencc-js` IS LOADED LAZILY, AND THAT IS NOT A PERFORMANCE CHOICE. #R680's ten
   mutation checks prove this gate BREAKS when the bundle is broken, and they do it by copying the
   script into a synthetic root under %TEMP% and running it there — a root with no `node_modules`.
   A STATIC `import … from 'opencc-js'` therefore threw ERR_MODULE_NOT_FOUND before a single line
   ran, and all ten went red: the safety net that proves the gate works was taken out by the gate's
   own new dependency. (Measured: `check:histadmin` itself stayed green throughout, because
   `--check` never needs a converter — so nothing that reads the shipped bytes could see it.)
   ⚠ THE TWO NEIGHBOURS ALREADY DO THIS, for the same reason and with the same words:
   scripts/build-hist-borders.mjs and scripts/build-histnames.mjs both `await import('opencc-js')`
   inside the path that needs it. This is the third. */
let _cc = null;
async function converters() {
  if (_cc) return _cc;
  const OpenCC = await import('opencc-js');
  _cc = { toSimp: OpenCC.Converter({ from: 'tw', to: 'cn' }), toTrad: OpenCC.Converter({ from: 'cn', to: 'tw' }) };
  return _cc;
}
/* ⚠ AND THE FAILURE IS LOUD. A caller that reaches the Chinese rule without having awaited
   `converters()` gets an exception naming the rule, not a silently unconverted name. */
const cc = () => { if (!_cc) throw new Error('scripts/build-hist-admin1.mjs: converters() must be awaited before a name:zh is classified'); return _cc; };

/* ── EDTF-lite → [y,m,d] ────────────────────────────────────────────────────
   OHM writes ISO-ish dates with EDTF qualifiers: `1871-05-04`, `1871-05`, `1871`,
   `-0500` (BCE), and the uncertainty marks `~ ? %` plus open ranges `..`. Anything
   that is not a plain year-first date (`C18`, `18xx`, `unknown`) is UNKNOWN — the
   caller then treats the edge as open rather than inventing a day. */
function dateInfo(raw) {
  const text = raw == null ? '' : String(raw).trim();
  const clean = text.replace(/[~?%]/g, '').replace(/\.\.$/, '').trim();
  const m = /^(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(clean);
  return { raw: text || null, precision: m ? (m[3] ? 'day' : m[2] ? 'month' : 'year') : 'unknown',
    qualified: /[~?%]/.test(text) };
}
function calendarDate(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return dt;
}
function edtf(raw, edge) {
  const info = dateInfo(raw);
  if (info.precision === 'unknown') return null;
  const m = /^(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(String(raw).trim().replace(/[~?%]/g, '').replace(/\.\.$/, '').trim());
  const y = Number(m[1]), mo = Number(m[2] || 1), day = Number(m[3] || 1);
  const dt = calendarDate(y, mo, day);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== day) return null;
  if (edge === 'end' && info.precision !== 'day') {
    dt.setUTCFullYear(y + (info.precision === 'year' ? 1 : 0), info.precision === 'year' ? 0 : mo, 1);
  }
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

/* Equal, explicit days follow the country builder's single-day source convention.
   This preserves OHM's same-day records; it is not independent historical verification. */
function dateSpan(startRaw, endRaw) {
  const s = edtf(startRaw, 'start'), e = edtf(endRaw, 'end');
  const start = dateInfo(startRaw), end = dateInfo(endRaw);
  const key = d => d[0] * 10000 + d[1] * 100 + d[2];
  let normalization;
  if (s && e && /^-?\d{4,6}-\d{2}-\d{2}$/.test(start.raw || '') && start.raw === end.raw && key(s) === key(e)) {
    const dt = calendarDate(e[0], e[1], e[2] + 1);
    e.splice(0, 3, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    normalization = 'single-day';
  }
  return { s, e, valid: !(start.precision !== 'unknown' && !s) && !(end.precision !== 'unknown' && !e) && !(s && e && key(s) >= key(e)),
    metadata: { start, end, ...(normalization ? { normalization } : {}) } };
}

/* An unknown date supplies no evidence to extend a unit into a newly reachable era.
   Preserve its previously published display bound, explicitly distinguished from a source date. */
function boundedStart(span, previous) {
  if (span.s) return span.s;
  if (!previous) return null;
  const bound = previous.slice(2, 5);
  span.metadata.start.boundary = 'preserved-display-bound';
  span.metadata.start.bound = bound.slice();
  return bound;
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

/* ══ (#R669) THE RING ASSEMBLER IS js/ohm-rings.js, EVALUATED — NOT COPIED HERE ═══════════════
   The click highlight now fetches ONE relation from the same Overpass and has to turn the same
   unordered open member ways into the same polygon (js/time-admin1.js). Two implementations of
   «which runs of these ways are the same ring» are two answers to one question the first day one of
   them is touched, so this build evaluates the browser's file the way scripts/build-whs.mjs
   evaluates js/lang-registry.js. */
const OHMR = (function () {
  const sandbox = { window: {}, console, Number, Array, Math, JSON };
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'ohm-rings.js'), 'utf8'), ctx, { filename: 'ohm-rings.js' });
  const R = sandbox.window.IntMapOhmRings;
  if (!R || typeof R.ringsOf !== 'function' || typeof R.polysOf !== 'function') throw new Error('js/ohm-rings.js did not define IntMapOhmRings');
  return R;
})();
const ringsOf  = el => OHMR.ringsOf(el);
const ringArea = r => OHMR.ringArea(r);
const polysOf  = rings => OHMR.polysOf(rings, MIN_AREA);


/* ══ ── CHECK (offline) ─────────────────────────────────────────────────────────────────────────
   (#R680) THE TWO LARGEST BUNDLES IN data/ HAD NO GATE AT ALL. data/hist-admin1.js (10.4 MB) and
   data/hist-admin2.js (16.2 MB) are where the map gets every first- and second-level line, every
   label on one, every answer to a click on one and every coverage count — 26.7 MB of shipped bytes
   that `npm test` and CI weighed nothing of. Each of the four neighbouring historical bundles has
   a gate (`check:histborders`, `check:histeras`, `check:kuni`, `check:bordercoast`); these two were
   written after those and were simply never given one, so a bundle that broke — or that quietly
   went stale — would have said so to nobody.

   ⚠ THIS RE-DERIVES NOTHING, AND SAYS SO. Same judgement and same measured reason as
   `check:histborders` / `check:histeras`: the build consumes OHM's whole admin_level 3–6 extract
   (28,211 relations; one resumed run measured 3.4 GB of Overpass), which CI cannot hold. What is
   proved is that the COMMITTED bytes are internally sound and still joined to the files that read
   them. The residual — a bundle that has drifted from upstream still passes — is written out in
   docs/TESTING.md rather than left to be inferred.

   ⚠ THE TIERS ARE DISCOVERED, NOT LISTED. `data/hist-admin<N>.js` holds `window.__HISTADM<N>` at
   admin_level 2N+1 and 2N+2; that convention is what #R604's accident violated and what `--global`
   above already reads off the file name. A hand-written pair of filenames here would silently skip
   a third tier the day one is added, so the list is the directory.

   ⚠ TWO JOINS THIS GATE DOES NOT OWN, and does not restate:
     · data/hist-kuni.js must not name a unit these bundles already hold (it would be drawn twice).
       正本 is `check:kuni` — it measures that from the derived side, where the decision is made.
     · every ring's border/coastline marks. 正本 is `check:bordercoast`, which RE-DERIVES all of
       them against the bundled coastline. What is kept here is the O(1) half it cannot state
       cheaply: that the marks were built against THIS many rings — i.e. that the bundle has not
       been rebuilt without them. */
const TIERRE = /^hist-admin(\d+)\.js$/;
function tiers() {
  return fs.readdirSync(path.join(ROOT, 'data')).filter(f => TIERRE.test(f)).sort()
    .map(f => { const n = parseInt(TIERRE.exec(f)[1], 10);
      return { file: 'data/' + f, n, global: '__HISTADM' + n, levels: [2 * n + 1, 2 * n + 2] }; });
}
/* ⚠ (#R680) A CEILING, NOT A WAIVER LIST. Three shipped records carry no name in any language —
   OHM relations 2698257 (level 3, 1918–1921) and 2735085 / 2735454 (level 6, 1895–1923). A reader
   cannot be told anything about such a unit: it has no label, and a click on it answers with a
   blank. Naming those three ids here would be the per-case rule .agents/rules/no-ad-hoc-hardcoding.md
   forbids, and asserting nothing would let the next rebuild ship four hundred of them — the #R669
   shape, where a build silently dropped what it did not recognise.
     観測   3, measured 2026-09-11 over the committed bundles (1 in tier 1, 2 in tier 2).
     失効   the moment the builder refuses to emit a nameless record, or upstream names these —
            then this goes to 0 and stays there. It only ever moves DOWN, like scripts/test-budget.mjs.
     正本   this line. Nothing else states a nameless budget. */
const NAMELESS_MAX = 3;

/* ⚠ (#R695) AND A CEILING ON HOW MANY UNITS THE READER CANNOT READ. `NAMELESS_MAX` counts units
   with no name in ANY language — three of them. It says nothing about the case that was actually
   shipping: 20,357 second-tier units with a perfectly good Polish or Thai `name` and not one word
   a Japanese reader could read. Measured before this round: 0.5 % of the second tier carried a
   Japanese name, 6.5 % an English one, and no invariant anywhere measured that at all.
     観測   35.2 % — the worst SHIPPED language (Japanese) over both committed tiers,
            2026-09-11, after the Wikidata fill: 9,684 of 27,528 units.
     失効   this is a SHARE, not a headcount, so it survives upstream growing; it moves DOWN when
            the fill improves, exactly like NAMELESS_MAX and scripts/test-budget.mjs, and never up.
            Widening the shipped set (scripts/histnames/langs.mjs) re-measures it, because a
            language IntMap has just started shipping starts from wherever upstream left it.
     正本   this line. Nothing else states a name-coverage budget. */
const UNREADABLE_MAX_PCT = 35.2;

function bcSets() {
  const f = path.join(ROOT, 'data', 'border-coast.js');
  if (!fs.existsSync(f)) return null;
  const w = {}; new Function('window', fs.readFileSync(f, 'utf8'))(w);
  return (w.__IMBCOAST || {}).sets || null;
}

function check() {
  const bad = [];
  const list = tiers();
  if (list.length < 2) bad.push('data/ holds ' + list.length + ' hist-admin tier(s) — the map reads at least two');
  const sets = bcSets();
  if (!sets) bad.push('data/border-coast.js does not declare the ring-mark sets these bundles are joined to');
  const owner = new Map();          /* OHM relation id → the tier that already claimed it */
  const allFeats = [];              /* (#R695) the name budget is one share over the whole record */
  let nameless = 0, feats = 0, rings = 0, pts = 0;
  const nowY = new Date().getUTCFullYear();

  for (const t of list) {
    const p = path.join(ROOT, t.file);
    if (!fs.existsSync(p)) { bad.push(t.file + ' does not exist'); continue; }
    const w = {};
    try { new Function('window', fs.readFileSync(p, 'utf8'))(w); }
    catch (e) { bad.push(t.file + ' does not evaluate: ' + e.message); continue; }
    /* ⚠ (#R604) THE FILE MUST NAME ITSELF. Building the deeper tier without `--global` wrote
       `window.__HISTADM1=` into data/hist-admin2.js — 15 MB whose every assertion about itself was
       true and whose name was wrong, replacing the first tier's record the moment it loaded.
       tests/r604-checks ⑦ watches this from the shipped side; the build's own gate watches it too,
       because the build is where the name is chosen. */
    const named = Object.keys(w).filter(k => /^__HISTADM/.test(k));
    if (named.length !== 1 || named[0] !== t.global) {
      bad.push(t.file + ' defines ' + (named.join(', ') || 'no __HISTADM* global') + ' — it must define ' + t.global + ' and nothing else');
      continue;
    }
    const d = w[t.global];

    if (d.v !== 1) bad.push(t.file + ': v is ' + d.v + ', expected 1');
    if (!/OpenHistoricalMap/i.test(d.src || '') || !/CC0/.test(d.src || ''))
      bad.push(t.file + ': src must name OpenHistoricalMap and the CC0 licence it is redistributed under');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.built || '')) || isNaN(Date.parse(d.built)))
      bad.push(t.file + ': built is ' + d.built + ', expected an ISO date');
    if (!Number.isInteger(d.since)) bad.push(t.file + ': since is ' + d.since + ', expected an integer year');
    if (!(Number.isFinite(d.tolerance) && d.tolerance > 0)) bad.push(t.file + ': tolerance is ' + d.tolerance);
    /* the tier a file NAMES and the tier it HOLDS are one fact — see the convention above */
    if (String(d.levels) !== String(t.levels))
      bad.push(t.file + ': declares levels ' + JSON.stringify(d.levels) + ', but its name says ' + JSON.stringify(t.levels));
    if (!Array.isArray(d.rings) || !d.rings.length) { bad.push(t.file + ': no rings'); continue; }
    if (!Array.isArray(d.feats) || !d.feats.length) { bad.push(t.file + ': no feats'); continue; }

    const say = (i, f, m) => bad.push(t.file + ' feat ' + i + ' (' + ((f && f[0]) || (f && f[9] && Object.values(f[9])[0]) || 'rel ' + (f && f[10])) + '): ' + m);
    d.rings.forEach((r, i) => {
      if (!Array.isArray(r) || r.length < 4) { bad.push(t.file + ' ring ' + i + ' has ' + (r && r.length) + ' points — a closed ring needs four'); return; }
      if (r.some(q => !Array.isArray(q) || q.length !== 2 || !isFinite(q[0]) || !isFinite(q[1]) ||
                      q[0] < -180.001 || q[0] > 180.001 || q[1] < -90.001 || q[1] > 90.001))
        bad.push(t.file + ' ring ' + i + ' leaves the globe');
      else if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])
        bad.push(t.file + ' ring ' + i + ' does not close');
    });

    const used = new Set();
    d.feats.forEach((f, i) => {
      if (!Array.isArray(f) || f.length !== 11) { say(i, f, 'has ' + (f && f.length) + ' columns, expected 11'); return; }
      if (!d.levels.includes(f[1])) say(i, f, 'is admin_level ' + f[1] + ', which this tier does not hold');
      const s = f[2] * 10000 + f[3] * 100 + f[4], e = f[5] * 10000 + f[6] * 100 + f[7];
      if (!(f[3] >= 1 && f[3] <= 12 && f[6] >= 1 && f[6] <= 12 && f[4] >= 1 && f[4] <= 31 && f[7] >= 1 && f[7] <= 31))
        say(i, f, 'has a month or day outside the calendar');
      else if (!(d.dateSemantics === 'exclusive-end' ? s < e : s <= e)) say(i, f, 'has an empty or backwards interval');
      for (const offset of [2, 5]) {
        const dt = calendarDate(f[offset], f[offset + 1], f[offset + 2]);
        if (dt.getUTCFullYear() !== f[offset] || dt.getUTCMonth() + 1 !== f[offset + 1] || dt.getUTCDate() !== f[offset + 2])
          say(i, f, 'has an invalid calendar date');
      }
      if (d.dateSemantics === 'exclusive-end' && !d.dates?.[f[10]]) say(i, f, 'has no source date metadata');
      if (f[5] < d.since) say(i, f, 'ended before ' + d.since + ', the floor this bundle was built to');
      if (!Array.isArray(f[8]) || !f[8].length) say(i, f, 'has no polygons');
      else for (const poly of f[8]) for (const ri of poly) {
        if (!(Number.isInteger(ri) && ri >= 0 && ri < d.rings.length)) say(i, f, 'points at ring ' + ri + ', which is not in the pool');
        else used.add(ri);
      }
      const nm = f[9] || {};
      for (const k of Object.keys(nm)) if (!Object.prototype.hasOwnProperty.call(LANGS, k))
        say(i, f, 'carries a name under ' + k + ', which is not one of the languages this build reads');
      /* U+FFFD is what a mis-decoded upstream response leaves behind — check:histeras measures the
         same thing on the era snapshots, for the same reason: it renders, so nothing else notices. */
      for (const v of [f[0]].concat(Object.values(nm))) if (/�/.test(String(v || ''))) say(i, f, 'has a replacement character in a name');
      if (!f[0] && !Object.keys(nm).length) nameless++;
      /* column 10 is what makes the click sharp (#R669): one record, fetched whole from upstream.
         Two records under one id would send the reader's tap to the wrong geometry. */
      if (!(Number.isInteger(f[10]) && f[10] > 0)) say(i, f, 'has no OpenHistoricalMap relation id');
      else if (owner.has(f[10])) say(i, f, 'reuses relation ' + f[10] + ', already held by ' + owner.get(f[10]));
      else owner.set(f[10], t.file);
    });
    if (used.size !== d.rings.length)
      bad.push(t.file + ': ' + (d.rings.length - used.size) + ' of ' + d.rings.length + ' pooled rings are referenced by no feature — bytes shipped for nothing');

    /* ⚠ A PROPERTY, NOT A HEADCOUNT. `check:histborders` asks the same question of its 36-year
       window year by year; here the reach is the whole calendar, so the unit is the century. How
       MANY units a century holds is upstream's business and moves every time OHM grows — that
       every century the bundle claims to cover has SOMETHING to draw is this file's own business. */
    for (let y = Math.max(1, d.since); y <= nowY; y += 100) {
      const t15 = y * 10000 + 615;
      if (!d.feats.some(f => (f[2] * 10000 + f[3] * 100 + f[4]) <= t15 && (f[5] * 10000 + f[6] * 100 + f[7]) >= t15))
        bad.push(t.file + ': nothing is in force on ' + y + '-06-15 — a century this bundle claims to reach draws nothing');
    }

    /* the O(1) half of the border/coastline join — see the note above; check:bordercoast owns the rest */
    if (sets) {
      const set = Object.values(sets).find(v => v && v.file === t.file);
      if (!set) bad.push(t.file + ' has no ring-mark set in data/border-coast.js — every edge of it would be stroked as a border');
      else if (set.rings !== d.rings.length)
        bad.push(t.file + ' holds ' + d.rings.length + ' rings and data/border-coast.js was built against ' + set.rings
          + ' — the marks are indexed by ring, so they now describe other polygons. Re-run scripts/build-border-coast.mjs.');
    }
    feats += d.feats.length; rings += d.rings.length; pts += d.rings.reduce((a, r) => a + r.length, 0);
    for (const f of d.feats) allFeats.push(f);
  }

  /* ══ (#R695) CAN THE READER READ IT? ════════════════════════════════════════════════════════
     Two questions, and neither is a list of languages: which ones ship is scripts/histnames/langs.mjs
     and which tag each of them is stored under is js/lang-registry.js (scripts/histadmin/langs.mjs
     crosses the two). Restore the nine and both of these follow with no edit here. */
  if (allFeats.length) {
    const missing = missingByTag(allFeats, SHIP);
    let worst = null;
    for (const tag of SHIP) if (!worst || missing[tag].pct > missing[worst].pct) worst = tag;
    if (missing[worst].pct > UNREADABLE_MAX_PCT)
      bad.push(missing[worst].missing + ' of ' + allFeats.length + ' units (' + missing[worst].pct.toFixed(1)
        + ' %) carry no `' + worst + '` name, over the ceiling of ' + UNREADABLE_MAX_PCT
        + ' % — a reader of that language is shown a unit they cannot read. Re-run'
        + ' `node scripts/build-hist-admin1.mjs --names`, or lower the ceiling if upstream really did shrink.');
    /* ⚠ A PROPERTY, NOT A NUMBER: the languages this build FILLS must be the best covered ones. If a
       language nobody fills is ahead of one that ships, the fill did not run over these bytes — which
       is precisely what a stale bundle looks like, and what no count of its own would ever say. */
    const others = missingByTag(allFeats, TAGS.filter(t => !SHIP.includes(t)));
    for (const tag of Object.keys(others)) if (others[tag].missing < missing[worst].missing)
      bad.push('`' + tag + '` is better covered (' + (allFeats.length - others[tag].missing) + ' units) than the shipped `'
        + worst + '` (' + (allFeats.length - missing[worst].missing) + ') — the name stage has not been run over these bundles');
  }

  if (nameless > NAMELESS_MAX)
    bad.push(nameless + ' features carry no name in any language, over the ceiling of ' + NAMELESS_MAX
      + ' — a unit with no name has no label and answers a click with a blank');

  if (bad.length) {
    console.error('hist-admin: ' + bad.length + ' problem(s)');
    for (const b of bad.slice(0, 25)) console.error('  ' + b);
    if (bad.length > 25) console.error('  … and ' + (bad.length - 25) + ' more');
    process.exit(1);
  }
  const cov = allFeats.length ? missingByTag(allFeats, SHIP) : {};
  console.log('✓ hist-admin — ' + list.length + ' tiers, ' + feats + ' units, ' + rings + ' pooled rings, '
    + pts + ' vertices; every century covered, every ring used, every unit joined to its OHM relation'
    + (nameless ? ' (' + nameless + '/' + NAMELESS_MAX + ' nameless)' : '')
    + '; readable in ' + SHIP.map(t => t + ' ' + (100 - cov[t].pct).toFixed(1) + '%').join(', '));
}

/* ⚠ THE TAG SWEEP IS CACHED TOO. It was not, and a rebuild at a different --tol
   therefore had to re-ask Overpass for the whole 5.6 MB index — which is the one
   request in this script with no id to retry on, so a rate-limited answer killed a
   build whose 153 geometry batches were all already on disk. Re-simplifying must
   cost nothing but CPU. Delete the cache directory to re-pull from upstream.
   ⚠ (#R695) AND IT IS ASKED FOR PER TIER, BY THE TIER'S OWN LEVELS. The name stage below needs
   every tier's tags at once (an item's claimants are not confined to one bundle), so the sweep
   that was inlined in the build is a function of the levels it is sweeping. */
async function tagSweep(levels, cache) {
  fs.mkdirSync(cache, { recursive: true });
  const tf = path.join(cache, 'tags.json');
  if (fs.existsSync(tf)) { console.error('· tags ' + levels.join(',') + ' (cached)'); return JSON.parse(fs.readFileSync(tf, 'utf8')); }
  console.error('· tags ' + levels.join(',') + ' …');
  /* ══ (#R669) THE CLAIM IS THE LEVEL, AND A MISSING `boundary` TAG IS A MISSING TAG ══════════
     Measured on OHM 2026-09-10: 28,211 relations carry admin_level 3-6 and 27,662 of them are
     `boundary=administrative`. Of the 549 that are not, 538 are a DIFFERENT KIND OF OBJECT that
     merely borrows the level column — religious_administration (431), census (79), statistical
     (18), election, disputed — and those are correctly none of this layer's business. The other
     ELEVEN are first-level subdivisions with the tag simply absent, and they were being dropped
     for it: 直隸 Chihli (admin_level 4, 1644-1911), CdZ-Gebiet Elsaß, «Augustan Italian provinces»
     among them. `type=boundary` with a level and no competing `boundary` value is an
     administrative boundary whose tagger did not write the word down. */
  const j = await overpass('[out:json][timeout:600];('
    + 'relation["boundary"="administrative"]["admin_level"~"' + lvlRe(levels) + '"];'
    + 'relation["type"="boundary"][!"boundary"]["admin_level"~"' + lvlRe(levels) + '"];'
    + ');out tags;');
  fs.writeFileSync(tf, JSON.stringify(j));
  return j;
}
const byId = tagJson => new Map((tagJson.elements || [])
  .filter(e => e.type === 'relation' && e.tags).map(e => [e.id, e.tags]));

/* ── the names UPSTREAM itself wrote about one relation, keyed by the bundle's suffixes ──────────
   ⚠ `name:zh` is not one of the app's tags and is handled by its own rule — see chineseTags(). */
function upstreamNames(t) {
  const names = {};
  for (const tag of TAGS) { const v = t[LANGS[tag]]; if (v) names[tag] = v; }
  const zh = String(t['name:zh'] || '').trim();
  if (zh) for (const tag of chineseTags(zh, cc().toSimp, cc().toTrad)) if (!names[tag]) names[tag] = zh;
  return names;
}

/* ══ (#R695) THE NAME STAGE — ONE IMPLEMENTATION, TWO CALLERS ═══════════════════════════════════
   Both the full build and `--names` end here, because «which item may name which unit» is one
   question and two answers to it would drift the first day either caller was touched.
   ⚠ THE UNIVERSE IS EVERY TIER, NOT THE ONE BEING WRITTEN. Q724 (Maine) is claimed by two
   first-tier units and five second-tier ones, and it is the second tier that reveals the borrowing
   («Devonshire County»). A build that judged one tier alone would hand «Maine» to units the other
   tier already showed it cannot describe, and the two bundles would disagree about the same item.
   @param units [{feats, tagsById, write}]  — every tier; only `write` ones are filled
 */
async function nameStage(units) {
  await converters();   /* (#R695) the Chinese rule below is sync; this is where its dependency is settled */
  const claims = [];
  for (const u of units) for (const f of u.feats) {
    const t = u.tagsById.get(f[10]); if (!t) continue;
    const q = String(t.wikidata || '').trim();
    if (q) claims.push({ qid: q, name: f[0] });
  }
  const verdicts = itemVerdicts(claims);
  const usable = [...verdicts].filter(([, v]) => v.ok).map(([q]) => q);
  const refused = verdicts.size - usable.length;
  console.error('· wikidata: ' + verdicts.size + ' items claimed by ' + claims.length + ' units; '
    + refused + ' refused (one item, units that do not agree on a name)');
  const labels = await labelsFor(usable, ROOT, m => process.stderr.write(m.endsWith('   ') ? m : m + '\n'));
  const tally = {};
  for (const u of units) {
    if (!u.write) continue;
    for (const f of u.feats) {
      const t = u.tagsById.get(f[10]); if (!t) continue;
      const q = String(t.wikidata || '').trim();
      const v = verdicts.get(q);
      if (!v || !v.ok) continue;
      const byTag = labelsByTag(labels.get(q), SHIP, REG);
      for (const tag of fillNames(f[9], byTag, plainLabel)) tally[tag] = (tally[tag] || 0) + 1;
    }
  }
  console.error('· filled: ' + (Object.keys(tally).map(k => k + '=' + tally[k]).join(' ') || 'nothing'));
  return tally;
}

/** one committed tier, loaded: its rows, its upstream tags, and whether this run may write it. */
async function tierUnit(t, write) {
  const p = path.join(ROOT, t.file);
  const w = {};
  new Function('window', fs.readFileSync(p, 'utf8'))(w);
  const d = w[t.global];
  if (!d || !Array.isArray(d.feats)) throw new Error(t.file + ' holds no ' + t.global + ' feature rows');
  return { tier: t, data: d, feats: d.feats, tagsById: byId(await tagSweep(t.levels, cacheOf(t.levels))), write };
}

/** every committed tier EXCEPT the one this run is writing — the rest of the item universe. */
async function otherTiers(global) {
  const out = [];
  for (const t of tiers()) if (t.global !== global && fs.existsSync(path.join(ROOT, t.file))) out.push(await tierUnit(t, false));
  return out;
}

/* ══ (#R695) `--names` — REFRESH THE NAMES OF EVERY COMMITTED TIER, AND NOTHING ELSE ═════════════
   ⚠ THIS IS NOT A SECOND BUILD. It runs the SAME upstreamNames() and the SAME nameStage() the full
   build runs, over rows it read back rather than rows it just made, and it re-serialises the ring
   pool it was given — byte for byte, because it never looks at a coordinate.
   ⚠ AND THAT IS THE POINT. The geometry in these bundles is joined to data/border-coast.js BY RING
   INDEX: `check:bordercoast` re-derives every mark against the bundled coastline, and this build's
   own gate refuses a bundle whose ring count has moved. Names change far more often than lines do
   (upstream adds a `name:ja`, Wikidata gains a label), and re-deriving 22,708 simplified polygons —
   3.6 GB of cached Overpass — to change a string column is both expensive and the one way this
   round could have moved a line it was not asked to move. */
async function refreshNames() {
  await converters();   /* (#R695) `upstreamNames` classifies name:zh synchronously — settle it first */
  const units = [];
  for (const t of tiers()) units.push(await tierUnit(t, true));
  /* upstream's own words first: a suffix the old table did not read (`name:zh`) arrives here, and
     nothing already in the row is replaced — what the bundle holds, the bundle keeps. */
  let fromOsm = 0;
  for (const u of units) for (const f of u.feats) {
    const t = u.tagsById.get(f[10]); if (!t) continue;
    const had = Object.keys(f[9] || {}).length;
    f[9] = Object.assign(upstreamNames(t), f[9] || {});
    fromOsm += Object.keys(f[9]).length - had;
  }
  console.error('· from upstream tags: ' + fromOsm + ' name column(s) the old language table did not read');
  await nameStage(units);
  for (const u of units) {
    const d = u.data;
    const body = 'window.' + u.tier.global + '=' + JSON.stringify({
      ...d, built: new Date().toISOString().slice(0, 10)
    }) + ';\n';
    fs.writeFileSync(path.join(ROOT, u.tier.file), body);
    console.error('· wrote ' + u.tier.file + ' ' + (body.length / 1048576).toFixed(2) + ' MB (rings untouched: '
      + d.rings.length + ')');
  }
}

async function main() {
  await converters();   /* (#R695) upstreamNames() below classifies name:zh synchronously */
  fs.mkdirSync(CACHE, { recursive: true });
  const tagJson = await tagSweep(LEVELS, CACHE);
  const all = (tagJson.elements || []).filter(e => e.type === 'relation' && e.tags);
  console.error('  relations', all.length);

  /* Which of them can EVER be on screen? The clock floor is `--since`, so a unit that
     ended before it can never be shown.
     ══ ⚠⚠⚠ (#R669) AN UNDATED RECORD IS NOT A PRESENT-DAY RECORD ═══════════════════════════════
     This loop used to `continue` on `!s && !e`, and the reason written here was that a relation
     with no dates «is a present-day unit that `ref-admin1` already draws from the live vector
     tiles». Measured 2026-09-10, that is false of every one of the thirteen it dropped: 安房国 and
     壱岐国 (provinces abolished in 1871), 東海道 · 山陰道 · 西海道 (the circuits they belonged to),
     Ziemia Płocka, Ziemia Wyszogrodzka, Stockholm, Dahme-Spreewald, Bodenwerder, Столінскі раён,
     граница and one unnamed row. None of them is a present-day first-level unit and `ref-admin1`
     draws none of them.
     ⚠ AND THE LINE WAS ALREADY DRAWING THEM. js/hist-scale.js `ohmFilter` lets a tile feature with
     no `start_decdate` through at EVERY date — deliberately, because a record that states no span
     cannot be excluded from one. So the era line has been striking 安房国 all along while the
     bundle held no label for it, no answer to a click on it and no count of it: the drop did not
     remove the unit from the map, it removed the map's ability to say what the unit was.
     An absent start preserves the existing record's published display bound. It does not
     move with the clock floor; new records lacking a start are logged for source resolution. */
  const want = [], deferred = [];
  const previousRows = new Map((PREVIOUS[GLOBAL]?.feats || []).map(f => [f[10], f]));
  let backwards = 0;
  for (const el of all) {
    const t = el.tags;
    if (!LEVELS.includes(parseInt(t.admin_level, 10))) continue;   /* (#R564) the cache is per level set, but the filter is stated where it is read */
    const span = dateSpan(t.start_date, t.end_date), { s, e } = span;
    if (e && e[0] < SINCE) continue;
    /* ⚠ (#R564) A SPAN THAT ENDS BEFORE IT STARTS IS NOT A SPAN, and upstream has some: measured
       2026-09-09, two at levels 3-4 (名東県 1881-12-26 → 1873-02-20; Mexican Cession 1850-12-12 →
       1850-09-09) and five at 5-6 (four Burnett County rows and Merionethshire, each ending the day
       before it starts). Such a record can never be in force, so it draws nothing — but it was
       shipped, and every one of its two dates entered the EPOCH INDEX, which is what decides when the
       map re-renders. Dropping them here is not a special case for those seven: it is the rule that a
       record must describe an interval, applied where the interval is read. */
    if (!span.valid) { backwards++; continue; }
    const start = boundedStart(span, previousRows.get(el.id));
    if (!start) { deferred.push({ id: el.id, name: t.name || '', start_date: t.start_date || null }); continue; }
    if (e && start[0] * 10000 + start[1] * 100 + start[2] >= e[0] * 10000 + e[1] * 100 + e[2]) { backwards++; continue; }
    want.push({ el, s: start, e, metadata: span.metadata });
  }
  console.error('  deferred new records with unknown start:', deferred.length, JSON.stringify(deferred));
  console.error('  datable & reachable from', SINCE, '→', want.length, '| dropped for a backwards span:', backwards);

  /* ring pool: identical rings are shared, which is where most of the saving is -
     a province and its neighbour trace the same line from opposite sides. */
  const pool = [], poolIx = new Map();
  const put = r => { const k = JSON.stringify(r); let ix = poolIx.get(k); if (ix === undefined) { ix = pool.length; pool.push(r); poolIx.set(k, ix); } return ix; };

  /* == (#R604) EACH BATCH IS SIMPLIFIED AS IT ARRIVES, AND THE RAW GEOMETRY IS DROPPED =========
     This loop used to fill a `Map` with every relation's RAW Overpass geometry and simplify the whole
     planet afterwards. That is bounded by how much UPSTREAM holds, not by how much this script needs,
     and at `--since 1 --levels 5,6` upstream holds 22,807 relations: measured 2026-09-10, the build
     died at 14,000 of them with "Ineffective mark-compacts near heap limit" against V8's ~4 GB
     default, after eighteen minutes of downloading that all had to be thrown away.
     WARNING - THE FIX IS NOT A BIGGER `--max-old-space-size`. That is a number somebody has to raise
     again the next time OHM grows, on every machine that runs this, and has to remember to. Nothing
     here ever needs two relations at once: a batch is fetched, each relation in it becomes pooled
     ring indices, and its raw geometry arrives and leaves inside ONE iteration. What is retained is
     the OUTPUT (the ring pool and the feature rows), which is the size of the file being written.
     The disk cache is untouched and still resumable, which is what made those eighteen minutes
     recoverable rather than lost. */
  const feats = [], dates = {};
  const previousNames = new Map((PREVIOUS[GLOBAL]?.feats || []).map(f => [f[10], f[9]]));
  let dropped = 0, fetched = 0;
  const owed = new Map(want.map(w => [w.el.id, w]));
  const ids = want.map(w => w.el.id);
  /* ══ ⚠⚠⚠ (#R669) THE CACHE IS KEYED BY THE RECORD, NOT BY ITS POSITION IN THIS RUN'S LIST ══════
     It used to be keyed by the batch — `g<first id>-<length>.json` — which addresses a relation's
     geometry by WHERE that relation happened to fall in the id list of the run that downloaded it.
     Admitting ONE more relation (which is exactly what the two coverage fixes above do) shifts every
     later batch boundary by one, so every later file becomes unfindable and a resumable build that
     already holds 4,699 of 4,776 relations on disk re-downloads all of them: measured on this
     machine, 3.4 GB and about forty minutes of Overpass for a change that needed eighteen records.
     A relation's geometry is a fact about that relation, so it is stored under that relation's id.
     Existing batch files are exploded into per-id files once and removed, so nothing already paid
     for is lost, and the build stays resumable for the reason it always was. */
  const RELDIR = path.join(CACHE, 'rel');
  fs.mkdirSync(RELDIR, { recursive: true });
  const relFile = id => path.join(RELDIR, id + '.json');
  (function seedFromBatches() {
    const olds = fs.readdirSync(CACHE).filter(f => /^g\d+-\d+\.json$/.test(f));
    if (!olds.length) return;
    console.error('· re-keying ' + olds.length + ' cached batches by relation id …');
    let n = 0;
    for (const f of olds) {
      const full = path.join(CACHE, f);
      try {
        const j = JSON.parse(fs.readFileSync(full, 'utf8'));
        for (const el of (j.elements || [])) {
          if (el.type !== 'relation') continue;
          const rf = relFile(el.id);
          if (!fs.existsSync(rf)) { fs.writeFileSync(rf, JSON.stringify(el)); n++; }
        }
      } catch (_) { /* a truncated batch is simply re-fetched below */ }
      try { fs.unlinkSync(full); } catch (_) { }
    }
    console.error('  ' + n + ' relations re-keyed');
  })();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const missing = chunk.filter(id => !fs.existsSync(relFile(id)));
    if (missing.length) {
      const j = await overpass('[out:json][timeout:900];relation(id:' + missing.join(',') + ');out geom;');
      for (const el of (j.elements || [])) if (el.type === 'relation') fs.writeFileSync(relFile(el.id), JSON.stringify(el));
      /* an id upstream no longer answers for is recorded as answered-with-nothing, so a resumed
         build does not ask for it again forever. It stays `owed`, so it is still counted as dropped. */
      for (const id of missing) if (!fs.existsSync(relFile(id))) fs.writeFileSync(relFile(id), 'null');
      fetched++;
    }
    for (const id of chunk) {
      const w = owed.get(id); if (!w) continue;
      let el = null;
      try { el = JSON.parse(fs.readFileSync(relFile(id), 'utf8')); } catch (_) { el = null; }
      if (!el || el.type !== 'relation') continue;
      owed.delete(id);
      absorb(w, el);
      el = null;   /* the record's raw geometry is dead HERE, not at the end of the planet */
    }
    process.stderr.write('\r  geom ' + Math.min(i + BATCH, ids.length) + '/' + ids.length + ' (net ' + fetched + ', kept ' + feats.length + ')   ');
  }
  /* asked for and never returned - counted exactly as the old loop counted a missing id, so the
     "dropped" figure the build prints still means the same thing. */
  dropped += owed.size;
  process.stderr.write('\n');

  function absorb(w, el) {
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
    if (!idx.length) { dropped++; return; }
    const t = w.el.tags;
    const s = w.s;                         /* sourced date or explicitly preserved display bound */
    const e = w.e || [9999, 12, 31];         /* open end  = still in force */
    const names = Object.assign(upstreamNames(t), previousNames.get(w.el.id) || {});
    dates[w.el.id] = w.metadata;
    /* ══ (#R669) COLUMN 10 IS THE OHM RELATION ID, AND IT IS WHAT MAKES THE CLICK SHARP ═════════
       The shipped ring is simplified at `--tol` because a planet-wide bundle has to be; the unit a
       reader just tapped is ONE record, and one record can be fetched whole. js/time-admin1.js asks
       Overpass for this id and re-draws the highlight at upstream's own geometry (伊豆国: 29
       vertices here, 2,800 there). Without the id the click would have to find the record by NAME,
       which is the mistake #R515 forbade. */
    feats.push([String(t.name || t['name:en'] || '').trim(), parseInt(t.admin_level, 10) || 4,
                s[0], s[1], s[2], e[0], e[1], e[2], idx, names, w.el.id]);
  }

  /* the name stage sees this run's tier plus every tier already in data/ — see nameStage() */
  await nameStage([{ feats, tagsById: byId(tagJson), write: true }].concat(await otherTiers(GLOBAL)));

  const src = 'OpenHistoricalMap contributors (CC0) · openhistoricalmap.org';
  const body = 'window.' + GLOBAL + '=' + JSON.stringify({
    v: 1, src, built: new Date().toISOString().slice(0, 10), since: SINCE, tolerance: TOL,
    levels: LEVELS, decimals: DECIMALS, dateSemantics: 'exclusive-end', dates, rings: pool, feats
  }) + ';\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);

  const years = [1850, 1870, 1900, 1914, 1938, 1950, 1990, 2020];
  const alive = y => { const t = y * 10000 + 615;
    return feats.filter(f => (f[2] * 10000 + f[3] * 100 + f[4]) <= t && (f[5] * 10000 + f[6] * 100 + f[7]) >= t).length; };
  console.error('· wrote', path.relative(ROOT, OUT), (body.length / 1048576).toFixed(2) + ' MB',
                '| feats', feats.length, '| rings', pool.length, '| dropped', dropped);
  console.error('· in force:', years.map(y => y + '=' + alive(y)).join(' '));
}

if (args.includes('--check')) check();
else if (args.includes('--names')) refreshNames().catch(e => { console.error('FAILED', e); process.exit(1); });
else main().catch(e => { console.error('FAILED', e); process.exit(1); });
