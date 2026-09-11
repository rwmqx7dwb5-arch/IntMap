#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/hist-eras.js — the deep past, bundled                    (#R679)
 * ----------------------------------------------------------------------------
 *  ══ WHAT WAS THERE BEFORE, MEASURED ════════════════════════════════════════════════════════════
 *  Everything before 1850 was fetched AT RUN TIME from GitHub raw through somebody else's CORS
 *  proxy (js/time-borders.js: corsproxy.io, then allorigins). 1850-1885 is bundled
 *  (data/hist-borders.js) and 1886-2019 is bundled (data/cshapes.js) — only the deep past
 *  depended on two third parties being up, and none of the SEVENTEEN BC snapshots the upstream
 *  publishes were ever asked for. This file brings the whole upstream set in-tree.
 *
 *  ══ THE UPSTREAM LIST IS DISCOVERED, NOT WRITTEN DOWN ══════════════════════════════════════════
 *  `--fetch` reads the repository's own directory listing through the GitHub contents API and
 *  takes every file matching /^world_(bc)?\d+\.geojson$/. Measured 2026-09-10: 53 files
 *  (36 AD, 17 BC), 71.5 MB raw. A count is never a condition here — if upstream adds a snapshot,
 *  the build takes it and --check still passes, because --check tests PROPERTIES (both eras
 *  present, years ordered) and not a number.
 *
 *  ══ ⚠ THE LICENCE IS NOT WHAT THE ROUND ASSUMED. MEASURED 2026-09-10 ═══════════════════════════
 *  The task described this upstream as CC BY 4.0. It is not: the repository's LICENSE file is the
 *  verbatim GNU GENERAL PUBLIC LICENSE Version 3 (35,147 bytes, first lines "GNU GENERAL PUBLIC
 *  LICENSE / Version 3, 29 June 2007"), and GitHub's own licence detector answers
 *  {"key":"gpl-3.0","spdx_id":"GPL-3.0"}. README.md (11,358 bytes) contains no occurrence of
 *  "licen", "CC BY", "creativecommons", "copyright" or "attribution" — its Credits section names
 *  the provenance ("collected, adapted and converted from diverse sources … anonymous students
 *  from the ThinkQuest Team C006628") but states no separate data licence. So the only licence
 *  statement the project makes is GPL-3.0, and that is what `src` says. Do not write CC BY here
 *  from memory: the string below is what was read, and --check holds it.
 *
 *  ══ THE YEAR OF A FILE (⚠ off-by-one country) ══════════════════════════════════════════════════
 *  `world_100` is AD 100. `world_bc323` is 323 BC. IntMap's clock counts ASTRONOMICAL years —
 *  there is a year 0, and N BC is the astronomical year 1-N — so bc323 is stored as -322 and bc1
 *  as 0. ⚠ Upstream's own index.json uses the OTHER convention (it writes bc123000 as
 *  "year": -123000, the plain BC number negated), so the two records disagree by one for every BC
 *  file and neither is wrong; only one of them is the clock's. The conversion lives in exactly one
 *  place, `astroYear()` below, and --check EVALUATES that function rather than trusting the bytes.
 *
 *  ══ WHAT THE DEEP SNAPSHOTS ACTUALLY DRAW ══════════════════════════════════════════════════════
 *  The oldest files are not maps of states: world_bc123000 draws "Homo heidelbergensis" and
 *  "Neanderthal", world_bc10000 draws "Jōmon" and "Khoisan", world_bc3000 draws "Dapenkeng
 *  culture". That is the upstream's subject matter, not an error, and it is not hidden here.
 *  Whatever the upstream itself says about a feature travels with the feature (see ATTRS): its own
 *  SUBJECTO / PARTOF / BORDERPRECISION / type / wikipedia — and `type` is the field that actually
 *  answers "what is this", in upstream's own words ("hunter-gatherers", "kingdom", "state
 *  society"). Nothing is classified here by a hand-written list of names, so a feature upstream did
 *  not classify carries no classification.
 *  ⚠ AND 7,309 OF THE 17,521 UPSTREAM FEATURES HAVE AN EMPTY NAME — 18 of them name themselves in
 *  their other fields and are recovered (see below); the remaining 7,291 have every documented
 *  field null, while carrying MORE AREA than the named ones in the deep files (world_bc123000:
 *  18,345 deg² against 3,210). Those ship in a second lane, `blank`: geometry with no identity,
 *  which is what upstream says they are. Dropping them would delete most of the drawn world;
 *  naming them would invent a name.
 *
 *      node scripts/build-hist-eras.mjs --fetch    # discover + download the upstream set (network)
 *      node scripts/build-hist-eras.mjs            # build data/hist-eras.js from the cache
 *      node scripts/build-hist-eras.mjs --check    # verify the COMMITTED file's invariants (offline)
 *      node scripts/build-hist-eras.mjs --sweep    # re-measure the tolerance table below
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { simplifyRing, ringArea } from './histborders/geom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'hist-eras.js');
/* ⚠ ONE CACHE FILE PER SNAPSHOT, KEYED BY THE SNAPSHOT'S OWN NAME — never by its position in the
   download order (#R669 keyed a 3.4 GB cache by batch index and lost all of it). */
const CACHE = process.env.INTMAP_HISTERAS_CACHE || join(tmpdir(), 'intmap-histeras-cache');

const API = 'https://api.github.com/repos/aourednik/historical-basemaps/contents/geojson';
const RAW = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/';
const FILE_RE = /^world_(bc)?(\d+)\.geojson$/;

export const V = 1;
export const SRC = 'aourednik/historical-basemaps (github.com/aourednik/historical-basemaps) · GPL-3.0 (repository LICENSE, read 2026-09-10)';

/* ── the year of a file ─────────────────────────────────────────────────────
   The ONLY place the BC convention is written. --check evaluates it. */
export function astroYear(key) {
  const m = /^(bc)?(\d+)$/.exec(String(key));
  if (!m) return null;
  const n = +m[2];
  return m[1] ? 1 - n : n;      /* N BC → astronomical 1-N (so bc1 → 0); AD N → N */
}

/* ⚠ NOTHING IS SIMPLIFIED AWAY THAT THE STORED PRECISION COULD STILL SHOW. The budget was the
   first question — the bundles IntMap already ships at this order of magnitude are
   data/hist-admin1.js (10.0 MB) and data/hist-admin2.js (15.5 MB), so 10-20 MB was the target for
   53 world snapshots whose raw upstream is 71.5 MB. Measured sweep of the BUILT bytes (DEC=3
   throughout; `--sweep --wide` re-measures it):
       tol 0     minArea 0        12.3 MB  712,070 pts  9,102 rings   (nothing simplified at all)
       tol 0.001 minArea 0        10.6 MB  607,558 pts  8,814 rings   ← shipped
       tol 0.001 minArea 0.0002   10.4 MB  595,813 pts  7,467 rings
       tol 0.002 minArea 0.0006    9.8 MB  562,092 pts  7,294 rings
       tol 0.01  minArea 0.004     8.1 MB  458,203 pts  6,741 rings
       tol 0.05  minArea 0.004     4.9 MB  268,947 pts  6,492 rings
   The whole corpus fits the budget UNSIMPLIFIED, so the aggressive tolerances above buy nothing
   and cost coastline: 0.05° (~5.5 km) would have thrown away 339 k points to save 5.7 MB of a
   budget that was never tight. So the tolerance is not a taste — it is DERIVED from the storage
   grid: 10^-DEC degrees, the smallest distance the shipped coordinates can express. A point that
   Douglas-Peucker removes at that tolerance is a point the rounding would have collapsed anyway.
   And for the same reason NOTHING is dropped for being small: a ring that survives rounding with
   three distinct points is a real island at the precision this file stores.
   ⚠ EXPIRES IF: the upstream set grows enough to push the built file past ~20 MB (re-run
   `--sweep --wide` and pick the finest row that still fits), or DEC changes — TOL follows it. */
const DEC = 3;                        /* coordinate decimals, matching data/cshapes.js and data/hist-borders.js */
const TOL = Math.pow(10, -DEC);       /* one grid cell — see above; not an independent number */
const MIN_AREA = 0;                   /* keep every ring that is still a ring after rounding */
/* ⚠ (#R695) AND «STILL A RING» IS NOT «STILL A SHAPE» — MEASURED, AND THE LINE ABOVE IS WHY IT HAD
   TO BE. 904 of the 8,814 rings this file ships (10.3%) enclose EXACTLY ZERO signed area at the
   coordinates it stores, and 891 of them are paths that double back on themselves (the same vertex
   twice). They are upstream's digitizing artifacts: 421 of the 2,730 ring instances are already
   zero-area in the raw GeoJSON, and the other 2,309 enclose 2.7e-5 deg² BETWEEN THEM — a third of a
   square kilometre over 2,309 rings averaging 190 km of path. So the sentence above («a ring that
   survives rounding with three distinct points is a real island at the precision this file stores»)
   is true of every ring except these, which have no interior at any precision.
   ⚠ THEY ARE STILL KEPT, AND MIN_AREA STAYS 0. Dropping them was measured too: it would remove
   2,734 polygon entries, 1,007 of the unnamed `blank` polygons this file created that lane for, and
   12 named features — two of which («Andean hunter-gatherers», «Savanna hunter-gatherers», 1783)
   have no other polygon and would leave the record entirely. Nothing upstream drew is thrown away
   here; what is decided elsewhere is whether such a ring is STROKED, and the answer is no —
   scripts/build-border-coast.mjs marks it «stroke nothing», because a ring with no interior is not
   the boundary of anything. The fill layers already drew nothing for them. */

/* ── U+FFFD ───────────────────────────────────────────────────────────────────────
   ⚠ A STRING CONTAINING U+FFFD IS NOT A NAME. The replacement character is already IN the upstream
   bytes — measured, 8 of them, all in world_bc323.geojson, four fields each of two features
   ("Teotihuac�n", "Monte Alb�n") — plus one more in world_1100's PARTOF ("Arag�n"). It is not a
   decoding choice of ours; the same shape as #R604's "a value outside the year range is not a
   date, it is an absent date".

   Such a string is REPAIRED FROM THE CORPUS, never from a hand-written table of eight fixes: the
   damaged text becomes a pattern with one wildcard per replacement character, and the healthy
   strings of all 53 snapshots are matched against it.
   ⚠ THE CORPUS DISAGREES WITH ITSELF, so "exactly one candidate" is the wrong test — measured, the
   same place is spelled "Teotihuacán" in eight snapshots and "Teotihuacàn" in three, and Monte
   Albán appears as "Monte Alb?n" in two (a literal question mark: a second, older mojibake in the
   same upstream, which no U+FFFD test can see). Requiring a
   unique candidate refuses all of them and loses Teotihuacán and Monte Albán from the map. The
   test is therefore the corpus's own STRICT PLURALITY: the spelling it uses most often wins, and a
   tie refuses. Nothing here knows what these places are called; it only counts what upstream says.
   A string that cannot be repaired is not a name — the feature keeps its geometry in the `blank`
   lane below and is named by the report. */
const FFFD = '�';
const hasFFFD = s => String(s).indexOf(FFFD) >= 0;
function repair(name, healthy) {
  const re = new RegExp('^' + name.split('').map(c => c === FFFD ? '.' :
    c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
  let best = null, bestN = 0, tie = false;
  for (const [h, n] of healthy) {
    if (!re.test(h)) continue;
    if (n > bestN) { best = h; bestN = n; tie = false; }
    else if (n === bestN) tie = true;
  }
  return tie ? null : best;
}

/* ── what upstream says about a feature ─────────────────────────────────────
   ⚠ WHAT IS BEING DRAWN IS ANSWERED BY THE UPSTREAM, OR NOT AT ALL. The deep snapshots draw
   peoples and archaeological cultures rather than states, and where upstream knows that, it says
   so ITSELF in a free-text field: measured across the 53 files, 141 features carry a non-empty one
   — 48 spelled `TYPE`, 93 spelled `type`, all of them in the nine snapshots bc700 … bc10000 — with
   values "culture" (46), "hunter-gatherers" (14), "Hunter-Foragers" (12), "pastoral nomads",
   "state society", "civilization", "complex farming society / chiefdom" and so on. That field is
   carried through as `t`, verbatim.
   ⚠ AND THAT IS ALL THAT CAN BE DERIVED. The other 10,071 named features say nothing about their
   own nature — including world_bc123000's "Neanderthal" and "Homo heidelbergensis", which carry no
   type at all — and NOTHING IS INVENTED FOR THEM: there is no table here that declares Neanderthal
   a species and Saba a kingdom. The absence of `t` means the upstream did not classify that
   feature, and BORDERPRECISION cannot stand in for it (it is 1 = "approximate" on every feature of
   every deep file, so it separates nothing).
   ⚠ The two spellings are not two fields — property lookup is case-folded once per feature, so a
   snapshot that switches case (as upstream does between bc1500 and bc2000) cannot silently drop it.

   The rest is the schema upstream's README documents: SUBJECTO (the power exercising authority),
   PARTOF (the larger cultural area, "e.g. Czechs as part of the Slavic tribes"), BORDERPRECISION
   (its own ordinal 1 approximate / 2 moderately precise / 3 determined by international law), plus
   the self-describing `wikipedia` link where it exists.
   ⚠ SUBJECTO and PARTOF REPEAT THE NAME more often than not (measured: 9,755 and 9,956 of 17,521),
   so they are stored only where they differ from it — a repeat carries no information. */
const ATTRS = [['s', 'subjecto'], ['p', 'partof'], ['bp', 'borderprecision'],
               ['t', 'type'], ['w', 'wikipedia']];
const SAME_AS_NAME_DROPPED = ['s', 'p'];

const listCache = () => readdirSync(CACHE).filter(f => FILE_RE.test(f));
const keyOf = f => { const m = FILE_RE.exec(f); return (m[1] || '') + m[2]; };

/* ── fetch ──────────────────────────────────────────────────────────────────*/
async function get(url, json) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'intmap-build-hist-eras' } });
      if (r.ok) return json ? await r.json() : await r.text();
      if (r.status !== 429 && r.status !== 403 && r.status !== 502) throw new Error('HTTP ' + r.status + ' ' + url);
    } catch (e) { if (i === 4) throw e; }
    await new Promise(s => setTimeout(s, 3000 * (i + 1)));
  }
  throw new Error('give up ' + url);
}

async function fetchAll() {
  mkdirSync(CACHE, { recursive: true });
  const listing = await get(API, true);
  const files = listing.map(e => e.name).filter(n => FILE_RE.test(n)).sort();
  console.error('upstream lists ' + files.length + ' snapshot(s)');
  let got = 0;
  for (const f of files) {
    const p = join(CACHE, f);                  /* keyed by the file's own name, not by its index */
    if (existsSync(p) && statSync(p).size > 0) continue;
    const txt = await get(RAW + f, false);
    writeFileSync(p, txt);
    got++;
    process.stderr.write('  ' + f + ' ' + (txt.length / 1e6).toFixed(2) + ' MB\n');
  }
  console.error('cache ' + CACHE + ': ' + files.length + ' file(s), ' + got + ' newly downloaded');
}

/* ── build ──────────────────────────────────────────────────────────────────*/
/* rounding to the storage grid can make two neighbours — including the last and the first, which
   are neighbours on a closed ring — the same point; those collapse away here rather than shipping
   as zero-length edges. Rings stay OPEN (no repeated first point), the convention data/hist-borders.js
   uses. */
const round = r => {
  const out = r.map(p => [+p[0].toFixed(DEC), +p[1].toFixed(DEC)])
    .filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  while (out.length > 1) { const a = out[0], b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop(); else break; }
  return out;
};

/* one case-folded view of a feature's properties — upstream spells the same field `TYPE` in one
   snapshot and `type` in the next, and that is a spelling, not a second field */
const propsOf = ft => {
  const out = {};
  for (const [k, v] of Object.entries((ft && ft.properties) || {})) {
    const lk = k.toLowerCase();
    if (out[lk] == null || out[lk] === '') out[lk] = v;
  }
  return out;
};
const nameOf = p => { const v = p && p.name; return v == null ? '' : String(v).trim(); };

/* GeoJSON rings repeat their first point at the end; simplifyRing() works on OPEN rings (the
   convention data/hist-borders.js stitches to), so the closing point is dropped first. */
function openRing(coords) {
  const r = (coords || []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) &&
    p[0] >= -180.001 && p[0] <= 180.001 && p[1] >= -90.001 && p[1] <= 90.001);
  if (r.length > 1) { const a = r[0], b = r[r.length - 1]; if (a[0] === b[0] && a[1] === b[1]) r.pop(); }
  return r;
}

function polysOf(geom, tol, minArea) {
  const raw = !geom ? [] : geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  const out = [];
  for (const poly of raw) {
    const kept = [];
    for (let i = 0; i < (poly || []).length; i++) {
      const open = openRing(poly[i]);
      /* ⚠ A TRIANGLE IS A POLYGON, AND simplifyRing() SAYS IT IS NOT. Its `ring.length < 4 → null`
         guard belongs to the stitched OHM rings it was written for; here it deleted whole features
         — measured, 438 of the 17,521 upstream features have every shell drawn as exactly four raw
         points, i.e. one closed triangle, and every one of them vanished. A ring with three
         distinct points has nothing left to simplify, so it passes through untouched. */
      const s = open.length === 3 ? open : simplifyRing(open, tol);
      /* a shell that does not survive takes its holes with it; a hole that does not survive is
         simply not a hole any more */
      const r = s ? round(s) : null;
      if (!r || r.length < 3 || Math.abs(ringArea(r)) < minArea) { if (i === 0) { kept.length = 0; break; } continue; }
      kept.push(i === 0 ? (ringArea(r) < 0 ? r.slice().reverse() : r)      /* shell CCW */
                        : (ringArea(r) > 0 ? r.slice().reverse() : r));    /* hole   CW */
    }
    if (kept.length) out.push(kept);
  }
  return out;
}

/* pass 1 — every healthy NAME-LIKE STRING in the corpus WITH ITS FREQUENCY, so a broken one can be
   repaired from what upstream mostly says. Names and the fields that hold names (SUBJECTO /
   PARTOF / ABBREVN) all count: the damage is in whichever field the character landed in — measured,
   "Aragón" is healthy in world_1100's NAME and broken in the same feature's PARTOF. */
function healthyNames() {
  const counts = new Map();
  const FIELDS = ['name', 'subjecto', 'partof', 'abbrevn'];
  for (const f of listCache()) {
    const j = JSON.parse(readFileSync(join(CACHE, f), 'utf8'));
    for (const ft of j.features || []) {
      const p = propsOf(ft);
      for (const k of FIELDS) { const v = p[k];
        if (typeof v === 'string' && v.trim() && !hasFFFD(v)) counts.set(v.trim(), (counts.get(v.trim()) || 0) + 1); }
    }
  }
  return counts;
}

function build({ report, tol = TOL, minArea = MIN_AREA, write = true } = {}) {
  const files = listCache().sort((a, b) => astroYear(keyOf(a)) - astroYear(keyOf(b)));
  if (!files.length) throw new Error('cache is empty — run with --fetch first (' + CACHE + ')');
  const healthy = healthyNames();

  const ringPool = new Map(), rings = [];
  const put = r => { const k = JSON.stringify(r); let i = ringPool.get(k);
    if (i === undefined) { i = rings.length; rings.push(r); ringPool.set(k, i); } return i; };

  const snaps = [];
  const stat = { broken: 0, repaired: 0, unrepairable: [], blank: 0, namedBySiblings: 0, noGeom: 0, rawPts: 0, rawFeats: 0 };
  for (const f of files) {
    const key = keyOf(f);
    /* ⚠ ONE SNAPSHOT AT A TIME, SIMPLIFIED AND RELEASED. #R604 held every raw feature in a Map and
       walked into V8's 4 GB ceiling; the raw JSON of a file is dropped before the next is read. */
    const j = JSON.parse(readFileSync(join(CACHE, f), 'utf8'));
    const feats = [], blank = [], blankPrecision = [];
    for (const ft of j.features || []) {
      stat.rawFeats++;
      const props = propsOf(ft);
      /* the same rule for every damaged string, whichever field it sits in */
      const mend = (v, where) => {
        if (typeof v !== 'string' || !hasFFFD(v)) return v;
        stat.broken++;
        const fixed = repair(v, healthy);
        if (fixed) { stat.repaired++; return fixed; }
        stat.unrepairable.push(key + ' ' + where + '="' + v + '"');
        return null;
      };
      let nm = mend(nameOf(props), 'NAME');
      nm = nm == null ? '' : String(nm).trim();
      /* ⚠ A FEATURE CAN NAME ITSELF IN EVERY FIELD EXCEPT THE NAME FIELD. Measured: world_bc5000
         holds a feature whose NAME is six spaces while its ABBREVN, SUBJECTO and PARTOF all read
         "Cardial Ware culture", and 23 more unnamed features carry an ABBREVN. So when NAME says
         nothing, the feature's other name-bearing fields are asked — and they are believed only if
         ALL of the ones that are present say THE SAME THING. Disagreement is not a name: SUBJECTO
         is the ruling power, which for a subject province is somebody else's name entirely. */
      if (!nm) {
        const said = new Set();
        for (const k of ['abbrevn', 'subjecto', 'partof']) {
          const v = mend(props[k], k.toUpperCase());
          if (typeof v === 'string' && v.trim()) said.add(v.trim());
        }
        if (said.size === 1) { nm = [...said][0]; stat.namedBySiblings++; }
      }
      const g = ft.geometry;
      for (const poly of (g && g.type === 'MultiPolygon' ? g.coordinates : g && g.type === 'Polygon' ? [g.coordinates] : []))
        for (const r of poly || []) stat.rawPts += (r || []).length;
      const polys = polysOf(g, tol, minArea).map(p => p.map(r => put(r))).filter(p => p.length);
      if (!polys.length) { stat.noGeom++; continue; }
      /* ⚠ AN UNNAMED POLYGON IS NOT A POLITY, AND IT IS NOT RUBBISH EITHER. Measured: 7,291 of the
         17,521 upstream features have NAME, ABBREVN, SUBJECTO and PARTOF ALL null — and they are
         not offcuts, they are most of the drawn world in the deep files (world_bc123000: 18,345
         deg² unnamed against 3,210 deg² named; world_bc5000: 12,328 against 2,868). Dropping them
         would delete the map; naming them would invent a name. So they ship in a separate lane,
         `blank`, as geometry with no identity — which is exactly what the upstream says they are.
         Every entry of `feats` therefore has a name, and nothing upstream drew is thrown away. */
      const at = {};
      for (const [short, tag] of ATTRS) {
        let v = props[tag];
        if (v == null) continue;
        if (typeof v === 'number') { at[short] = v; continue; }
        v = mend(String(v), tag.toUpperCase());
        if (v == null) continue;                            /* damaged beyond repair → no attribute */
        v = String(v).trim();
        if (!v) continue;
        if (v === nm && SAME_AS_NAME_DROPPED.includes(short)) continue;
        at[short] = v;
      }
      /* Geometry stays in its established lane; precision belongs to unnamed shapes too. */
      if (!nm) { stat.blank++; blank.push(polys); blankPrecision.push(at.bp ?? null); continue; }
      feats.push([{ en: nm }, at, polys]);
    }
    snaps.push({ key, y: astroYear(key), feats, blank, blankPrecision });
  }
  snaps.sort((a, b) => a.y - b.y);

  const body = JSON.stringify({ v: V, src: SRC, built: new Date().toISOString().slice(0, 10), rings, snaps });
  const text = 'window.__HISTERAS=' + body + ';\n';
  if (write) writeFileSync(OUT, text);

  if (report) {
    const nf = snaps.reduce((a, s) => a + s.feats.length, 0);
    const pts = rings.reduce((a, r) => a + r.length, 0);
    console.log('snapshots ' + snaps.length + ' (BC ' + snaps.filter(s => s.y <= 0).length + ', AD ' + snaps.filter(s => s.y > 0).length + ')' +
      '   features ' + nf + '/' + stat.rawFeats + '   rings ' + rings.length + '   points ' + pts + ' (raw ' + stat.rawPts + ')   bytes ' + text.length);
    console.log('named by their own other fields because NAME was empty: ' + stat.namedBySiblings);
    /* (#R695) kept, and not stroked — see MIN_AREA above. Printed so it cannot go unnoticed again. */
    const flat = rings.filter(r => ringArea(r) === 0);
    console.log('rings enclosing no area at the stored precision: ' + flat.length + ' of ' + rings.length +
      ' (' + (100 * flat.length / rings.length).toFixed(1) + '%, ' + flat.reduce((a, r) => a + r.length, 0) +
      ' points) — kept here, marked «stroke nothing» by scripts/build-border-coast.mjs');
    console.log('U+FFFD names: ' + stat.broken + ' broken, ' + stat.repaired + ' repaired from the corpus, ' +
      stat.unrepairable.length + ' unrepairable' + (stat.unrepairable.length ? ' → ' + stat.unrepairable.join(', ') : ''));
    console.log('unnamed upstream polygons carried in the `blank` lane: ' + stat.blank +
      ' (' + snaps.reduce((a, s) => a + s.blank.length, 0) + ' shipped)   dropped for having no ring left after simplification: ' + stat.noGeom);
    const withAttr = {}; for (const [short] of ATTRS) withAttr[short] = snaps.reduce((a, s) => a + s.feats.filter(f => f[1][short] != null).length, 0);
    console.log('features carrying upstream attributes', withAttr);
    console.log('year → features: ' + snaps.map(s => s.y + ':' + s.feats.length).join('  '));
  }
  return { text, snaps, rings };
}

/* ── sweep (how the tolerance above was chosen) ─────────────────────────────*/
function sweep() {
  const grid = process.argv.includes('--wide')
    ? [[0, 0], [0.001, 0], [0.001, 0.0002], [0.002, 0.0006], [0.004, 0.0006], [0.006, 0.001], [0.01, 0.004], [0.02, 0.004], [0.05, 0.004]]
    : [[0.01, MIN_AREA], [0.02, MIN_AREA], [0.03, MIN_AREA], [0.05, MIN_AREA], [0.08, MIN_AREA], [0.12, MIN_AREA]];
  for (const [t, a] of grid) {
    const { text, rings } = build({ tol: t, minArea: a, write: false });
    console.log(t.toFixed(3) + '°  minArea ' + a + '  ' + (text.length / 1e6).toFixed(1) + ' MB  ' +
      rings.reduce((x, r) => x + r.length, 0) + ' points  ' + rings.length + ' rings');
  }
}

/* ── check (offline) ────────────────────────────────────────────────────────
   ⚠ RE-DERIVES NOTHING. The build needs 71.5 MB of upstream GeoJSON that CI does not have, so the
   gate measures the SHIPPED BYTES' invariants — and it measures PROPERTIES, never counts, so a
   snapshot added upstream cannot turn it red. */
function check() {
  const src = readFileSync(OUT, 'utf8');
  const w = {}; new Function('window', src)(w);
  const d = w.__HISTERAS;
  const bad = [];
  const ok = (c, m) => { if (!c) bad.push(m); };
  ok(d && d.v === V, 'v must be ' + V);
  ok(d && typeof d.src === 'string' && /historical-basemaps/.test(d.src) && /GPL-3\.0/.test(d.src),
     'src must name the upstream repository and the licence its LICENSE file states (GPL-3.0)');
  ok(d && /^\d{4}-\d{2}-\d{2}$/.test(String(d && d.built)), 'built must be a YYYY-MM-DD date');
  ok(d && Array.isArray(d.rings) && d.rings.length > 0, 'rings missing');
  ok(d && Array.isArray(d.snaps) && d.snaps.length > 0, 'snaps missing');
  if (bad.length) return fail(bad);

  d.rings.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 3) bad.push('ring ' + i + ' has ' + (r && r.length) + ' points');
    else if (r.some(p => !Array.isArray(p) || p.length !== 2 || !isFinite(p[0]) || !isFinite(p[1]) ||
                          p[0] < -180.001 || p[0] > 180.001 || p[1] < -90.001 || p[1] > 90.001))
      bad.push('ring ' + i + ' leaves the globe');
  });

  let prev = -Infinity, bc = 0, ad = 0, feats = 0, blanks = 0;
  d.snaps.forEach((s, i) => {
    const where = 'snap ' + i + ' (' + s.key + ')';
    /* ⚠ THE YEAR IS RE-DERIVED BY EVALUATING astroYear(), not compared against a table — this is
       the one line that keeps the astronomical convention alive. */
    if (astroYear(s.key) !== s.y) bad.push(where + ' says y=' + s.y + ' but astroYear() says ' + astroYear(s.key));
    if (!(s.y > prev)) bad.push(where + ' is out of order or duplicated (y=' + s.y + ' after ' + prev + ')');
    prev = s.y;
    if (s.y <= 0) bc++; else ad++;
    if (!Array.isArray(s.feats) || !s.feats.length) { bad.push(where + ' has no features'); return; }
    for (const f of s.feats) {
      feats++;
      const nm = f[0];
      if (!nm || typeof nm !== 'object' || !nm.en) { bad.push(where + ' has a feature with no English name'); continue; }
      for (const k of Object.keys(nm)) if (hasFFFD(nm[k])) bad.push(where + ' name "' + nm[k] + '" contains U+FFFD');
      for (const k of Object.keys(f[1] || {})) if (hasFFFD(f[1][k])) bad.push(where + ' attribute "' + f[1][k] + '" contains U+FFFD');
      if (!Array.isArray(f[2]) || !f[2].length) { bad.push(where + ' feature ' + nm.en + ' has no polygons'); continue; }
      for (const poly of f[2]) for (const ri of poly)
        if (!(Number.isInteger(ri) && ri >= 0 && ri < d.rings.length)) bad.push(where + ' points at ring ' + ri);
    }
    /* the identity-less lane is checked the same way, minus the name it does not claim to have */
    if (!Array.isArray(s.blank)) { bad.push(where + ' has no `blank` lane (it may be empty, but it must exist)'); return; }
    if (!Array.isArray(s.blankPrecision) || s.blankPrecision.length !== s.blank.length)
      bad.push(where + ' has misaligned unnamed boundary precision');
    for (const polys of s.blank) {
      blanks++;
      if (!Array.isArray(polys) || !polys.length) { bad.push(where + ' has an empty entry in `blank`'); continue; }
      for (const poly of polys) for (const ri of poly)
        if (!(Number.isInteger(ri) && ri >= 0 && ri < d.rings.length)) bad.push(where + ' blank points at ring ' + ri);
    }
  });
  ok(bc > 0, 'no BC snapshot — the deep past is the point of this bundle');
  ok(ad > 0, 'no AD snapshot');
  ok(astroYear('bc1') === 0 && astroYear('bc323') === -322 && astroYear('100') === 100,
     'astroYear() no longer maps bc1→0, bc323→-322, 100→100');
  if (bad.length) return fail(bad);
  console.log('hist-eras ok — ' + d.snaps.length + ' snapshots (' + bc + ' BC, ' + ad + ' AD, ' +
    d.snaps[0].y + '…' + d.snaps[d.snaps.length - 1].y + '), ' + feats + ' named features, ' +
    blanks + ' unnamed upstream polygons, ' + d.rings.length + ' rings');
}
function fail(bad) {
  console.error('hist-eras: ' + bad.length + ' problem(s)');
  for (const b of bad.slice(0, 25)) console.error('  ' + b);
  process.exitCode = 1;
}

const arg = process.argv.slice(2);
if (arg.includes('--check')) check();
else if (arg.includes('--fetch')) await fetchAll();
else if (arg.includes('--sweep')) sweep();
else build({ report: true });
