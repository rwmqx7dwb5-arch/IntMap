#!/usr/bin/env node
/* ============================================================================
 *  build-hist-admin-fill.mjs — data/hist-admin-fill.js  (#R719)
 * ----------------------------------------------------------------------------
 *  THE FIRST-LEVEL SUBDIVISIONS THAT STILL STAND TODAY, CARRIED BACK ONLY AS FAR AS THREE
 *  RECORDS AGREE THEY MAY GO — the second gap record beside data/hist-kuni.js.
 *
 *  ── WHAT THIS ROUND MEASURED, AND WHY THIS FILE EXISTS ────────────────────────────────────
 *  「地方区分のcoverageが一部だけだったりする」「ある国家でも、一部にあっても全体にはなかったりする」
 *  Both halves were measured on the shipped bundles, 2026-09-15, by sampling every country's land
 *  on a 0.25° grid at a date and asking whether an in-force first-level unit covers the cell:
 *
 *      year   land of the world with a first-level unit drawn   countries 0%   partial   complete
 *      1900                       46.8%                              68           38        37
 *      1950                       67.0%                              73           37        51
 *      2000                       52.8%                              98           28        41
 *
 *  and the partial ones are not obscure: France 2%, Turkey 6%, Indonesia 10%, Colombia 11%,
 *  Argentina 13%, China 22%, Russia 37%, India 42%, Egypt 50%. A reader who travels to 1900 and
 *  sees three provinces in France is not being told that the record is thin; they are being shown
 *  a France with three provinces.
 *
 *  ⚠ THE GAP IS UPSTREAM'S, AND THAT WAS ESTABLISHED BEFORE ANYTHING WAS BUILT. Asked of
 *  OpenHistoricalMap's own Overpass on 2026-09-15: at admin_level 3-6 it holds 27,674 relations and
 *  data/hist-admin{1,2}.js ship 27,547 of them (99.5%) — the build is not the filter. Widening the
 *  query does not help either: admin_level 7 adds 2,097 (shipped this round as data/hist-admin3.js)
 *  and 8 adds 23,922, and taking BOTH leaves 42 countries with no administrative relation at any
 *  level — Kenya, Iran, Nigeria, Myanmar, Nepal, Sudan, Tanzania, Uganda, Zimbabwe, Zambia, Malawi,
 *  Madagascar, the two Congos, Botswana, Lesotho, Eswatini, New Zealand, Malta, Norway, Qatar, …
 *  Nothing else on the open web is a dated global admin-1 series; scripts/build-hist-admin1.mjs
 *  holds the eight candidates #R530 measured and why each is not one.
 *
 *  ── SO WHAT IS DRAWN, AND WHAT IS THE CLAIM ───────────────────────────────────────────────
 *  A unit here is TODAY'S outline of a unit that STILL EXISTS, drawn only over the span on which
 *  three independent records agree it may be drawn. The claim is deliberately weaker than
 *  data/hist-admin1.js's: that record says «this is the boundary that was surveyed then», this one
 *  says «a unit by this name governed this ground then, and this is its outline now». js/time-admin1.js
 *  marks these rows `_gap`, draws them in the derived line's own style, and `note()` says so.
 *
 *  ⚠ WITHOUT THE FIVE TESTS BELOW THIS FILE WOULD BE THE DEFECT #R530 EXISTS TO REMOVE — a
 *  present-day province painted under a historical date. Each test is the answer to one way that
 *  would be false, and a unit that fails any of them is not drawn at that date at all:
 *
 *   1. TEMPORAL — Wikidata must STATE when the unit began (P571), and the unit is never drawn
 *      before that instant, nor after a stated dissolution (P576). An undated unit is not
 *      carried back by a year. Measured: 1,837 of the 4,515 shipped Natural Earth units resolve
 *      through their ISO 3166-2 code (P300) to an item that states an inception.
 *      ⚠ The join is an IDENTIFIER, not a spelling: ISO 3166-2 is a code both sides publish.
 *
 *   2. THE COUNTRY'S OWN FLOOR — a subdivision cannot predate the country it subdivides, so the
 *      unit is never drawn before the inception Wikidata states for the COUNTRY (P571 on the item
 *      carrying its ISO 3166-1 alpha-3). A country that states none is not admitted at all.
 *      ⚠ MEASURED, AND IT IS THE TEST THAT DECIDED THIS FILE'S SHAPE: without it, test 4 below is
 *      satisfied by a Ukrainian oblast in the year 1000 (the ground was wholly inside Kievan Rus')
 *      and by Երևան in 782 BC (its ISO code belongs to the CITY item, whose stated inception is
 *      the city's founding). Both would have been drawn. Both are nonsense.
 *
 *   3. WHOLE-COUNTRY — a country is drawn on the dates where EVERY ONE of its units may be drawn,
 *      and on no others; the surviving intervals are intersected across the country's units and a
 *      country whose intersection is empty ships nothing. This is the user's own second sentence
 *      made into a rule. ⚠ IT BINDS THE OUTPUT, NOT THE ADMISSION: the first build applied it to
 *      «every unit of this country is dated» and then let tests 4 and 5 silence units one at a
 *      time, and its own `--check` caught what that produces — ARM 7/11, CAN 3/13, ECU 2/24,
 *      UKR 17/25, USA 24/51, a record answering PART of a country. (France 95/101, Russia 85/86,
 *      Mexico 31/33, Colombia 33/34 and Morocco 15/16 are excluded by the dating half.)
 *
 *   4. GEOGRAPHIC — the ground under the unit must have lain inside ONE polity on that date,
 *      according to the era record IntMap already draws (data/cshapes.js 1886-2019,
 *      data/hist-borders.js 1689-1885, data/hist-eras.js below that). A unit that straddles two
 *      countries of its era is a unit whose modern outline contradicts that era, and it is
 *      withheld for exactly the span on which it straddles.
 *
 *   5. NO SECOND CLAIM ON ONE PIECE OF GROUND — where data/hist-admin{1,2,3}.js already hold an
 *      in-force unit over this ground, the record speaks and the fill is silent for that span.
 *      Overlap is measured on the fill unit's own sample points, so the test is about ground and
 *      not about names.
 *
 *  THE SPANS ARE EXACT, NOT SAMPLED. Between two consecutive dates on which something relevant
 *  changes — the inception, a dissolution, the start or end of an era polity whose box meets this
 *  unit, the start or end of an overlapping record unit — nothing about tests 4 and 5 can change.
 *  So the tests are evaluated once per interval between those breakpoints, and a unit is emitted
 *  as one row per surviving interval. No year is guessed at and none is skipped.
 *
 *  ── WHERE THE GEOMETRY COMES FROM: THE COPY ALREADY IN THE TREE ───────────────────────────
 *  data/admin1-world.json.gz (#R290) is Natural Earth 10m admin-1, simplified once at 0.01° with
 *  four decimals, and it is already shipped for the warning layer. A second download of the same
 *  survey would be a second answer to «what shape is this province» in the same repository, which
 *  .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. It is read, not re-fetched.
 *
 *  Source & licence: Natural Earth (public domain) for the outlines and the ISO 3166-2 codes;
 *  Wikidata (CC0) for the dates and the names. Both are declared in sources.html /
 *  js/reference-data.js, like every other bundled set.
 *
 *  Output: the gap-bundle shape data/hist-kuni.js established, which js/time-admin1.js splices into
 *  the first tier:
 *      window.__HISTADMFILL = { v, src, built, tolerance, levels, rings:[ring…], feats:[feat…] }
 *      feat = [ name, lvl, sy,sm,sd, ey,em,ed, [[ringIdx…]…], names, iso3166-2, iso3 ]
 *  ⚠ THE LAST TWO COLUMNS ARE THE IDENTIFIER THE ROW WAS ADMITTED BY, and they are there because
 *  `--check` has to re-derive the whole-country rule. The first build carried only the NAME, and
 *  Natural Earth's names are not unique across countries — the check joined «Zambezi» in an
 *  admitted country to Zambia's and read a country nobody answers for as partly answered. The
 *  splice in js/time-admin1.js reads columns 0-9 by position, so the extra pair costs it nothing.
 *  Dates use the same exclusive end as the tiers.
 *
 *  Usage:  node scripts/build-hist-admin-fill.mjs --check     # verify the COMMITTED bundle, offline
 *          node scripts/build-hist-admin-fill.mjs [--out data/hist-admin-fill.js] [--grid 0.1]
 *          node scripts/build-hist-admin-fill.mjs --only <ISO3> --diagnose   # why one country's units were kept or withheld
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { registry, shipTags, harvestTags } from './histadmin/langs.mjs';
import { labelsFor, labelsByTag } from './histadmin/wikidata.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(ROOT, argOf('--out', 'data/hist-admin-fill.js'));
const GLOBAL = '__HISTADMFILL';
const WDQS = 'https://query.wikidata.org/sparql';
const UA = 'IntMap/build-hist-admin-fill (+https://github.com/rwmqx7dwb5-arch/IntMap)';
const LICENCE = 'Derived: Natural Earth 10m admin-1 (public domain) via data/admin1-world.json.gz · dates and names from Wikidata (CC0) · assembled by scripts/build-hist-admin-fill.mjs';

/* ⚠ (#R719) THE SAMPLE STEP IS THE ONE NUMBER THIS FILE CHOOSES, AND IT IS PRICED AGAINST THE
   SMALLEST THING IT HAS TO SEE. Tests 3 and 4 ask «is this ground inside that polygon», and they
   ask it of points laid on a grid inside the unit. Measured on the shipped Natural Earth set
   (2026-09-15, 4,515 units): the median unit's greater extent is 1.029°, the 25th percentile
   0.410° and the 5th 0.077°; 327 units (7.2%) are smaller than 0.1° across. So a 0.1° grid puts at
   least one point inside the great majority of units outright, and `samplePoints` falls back to
   the unit's OWN VERTICES for the rest — no unit is ever tested on an empty sample, which would
   read as a pass. It expires the day the shipped outline set changes its simplification. */
const GRID = parseFloat(argOf('--grid', '0.1'));
/* ⚠ (#R719) AND THESE TWO SHARES ARE MEASURED, NOT PREFERRED — see `--check`'s printout, which
   re-derives both from the shipped bundle. The era outlines are 19.4 pts/deg where the unit
   outlines are 100, so a coastal unit always has sample points the era polygon puts in the sea;
   requiring «every point inside» would withhold every island nation. STRADDLE_MAX is the share of
   the unit's LOCATED points that may sit in a polity other than its main one, and LOCATED_MIN is
   how much of the unit the era record has to place at all before it is allowed to answer. */
/* ⚠ (#R719) 0.20 IS MEASURED AGAINST THE MISMATCH IN RESOLUTION, not chosen for comfort. The era
   outlines are 19.4 points per degree and the unit outlines are ~100, so a unit that lies wholly
   inside its country still puts sample points outside the coarse polygon of it. Measured on
   Armenia's eleven marzer at 1995-2019 (`--only ARM --diagnose`), every one of which is wholly
   inside Armenia: the share of LOCATED points falling in a neighbour reads 0, 0, 0, 0, 2, 3, 4, 5,
   7, 7 and 8 %. A unit genuinely split between two states is a different order of magnitude — half
   its ground is in the other one. 20 % sits above the artefact and far below the defect. */
const STRADDLE_MAX = 0.20;
const LOCATED_MIN = 0.60;
/* ⚠ overlap is the OTHER direction: a record unit that covers a quarter of this ground is already
   answering for it, and two lines over one province is the thing #R530 removed. */
const OVERLAP_MIN = 0.25;
const MAX_SAMPLE = 240;
/* diagnosis: build one country and print why each of its units was kept or withheld */
const ONLY = argOf('--only', null);
const DIAG = args.includes('--diagnose');

/* ══ ⚠⚠ (#R730) NATURAL EARTH'S OWN PLACEHOLDER IS STILL AN IDENTIFIER ═══════════════════════
   #R719 made every row carry ISO 3166-2 so the whole-country rule is re-derived by identifier and
   never by name. Measured 2026-09-15, 161 of Natural Earth's units have no ISO code and carry the
   dataset's own `XX-Ynn~` placeholder instead — Şuşa `AZ-X01~`, Gbarpolu `LR-X1~`, the Region of
   Republican Subordination `TJ-X01~`. They were extracted as `null`, shipped as `null`, and the
   gate then read Azerbaijan as 77 of 78 and refused three countries it had just built.
   ⇒ the tilde form is accepted AS AN IDENTIFIER (it is stable inside the outline set, and the `~`
   says on its face that it is not an ISO code — the Wikidata join keys on the ISO form and simply
   never matches these, which is correct: nobody dated them).
   ⚠ A unit with NO code at all is a different case and stays refused: 10 units carry neither, and
   a country holding one cannot have «answered whole» re-derived for it. */
const ISO2 = /^[A-Z]{2}-[A-Z0-9]{1,3}~?$/;
const ISO2_STRICT = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

/* ── plumbing ───────────────────────────────────────────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cacheDir() { const d = path.join(ROOT, 'node_modules', '.cache', 'intmap-histfill'); fs.mkdirSync(d, { recursive: true }); return d; }

async function sparql(query, key) {
  const f = path.join(cacheDir(), key + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  let last = null;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(WDQS + '?query=' + encodeURIComponent(query) + '&format=json',
        { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
      if (r.status === 429 || r.status >= 500) { await sleep(4000 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = JSON.parse(await r.text());
      const rows = j.results.bindings;
      fs.writeFileSync(f, JSON.stringify(rows));
      return rows;
    } catch (e) { last = e; await sleep(4000 * (i + 1)); }
  }
  throw last || new Error('WDQS exhausted');
}

function loadBundle(rel) {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { window: w });
  const g = Object.keys(w)[0];
  return { global: g, data: w[g] };
}

/* ── geometry ───────────────────────────────────────────────────────────────────────────── */
function bbox(ring) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of ring) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
}
function inRing(r, x, y) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
/* a multipolygon hit: outer rings add, the rings after the first of a polygon take away (holes). */
function inPolys(polys, x, y) {
  for (const poly of polys) {
    if (!inRing(poly[0], x, y)) continue;
    let hole = false;
    for (let i = 1; i < poly.length; i++) if (inRing(poly[i], x, y)) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}
/* the points test 3 and test 4 are asked of. A grid inside the unit, falling back to the unit's
   own vertices when the unit is smaller than the grid — an empty sample must never read as a pass. */
function samplePoints(polys) {
  const rings = polys.map((p) => p[0]);
  let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) { const b = bbox(r); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
  let out = [];
  for (let x = mnx + GRID / 2; x <= mxx; x += GRID) for (let y = mny + GRID / 2; y <= mxy; y += GRID) if (inPolys(polys, x, y)) out.push([x, y]);
  if (!out.length) for (const r of rings) for (const p of r) out.push(p);
  /* ⚠ (#R719) AND THE SAMPLE IS CAPPED, BECAUSE THE TESTS ARE SHARES AND NOT AREAS. Russia's
     units put tens of thousands of cells on a 0.1° grid, and every one of them is then asked of
     every era polygon that meets the box; the first build of this file did not come back. What
     tests 3 and 4 read off the sample is a PROPORTION (5% straddling, 60% located, 25% overlapped),
     and a 240-point stride estimates each of those to within a few points either way while making
     the run finite. The stride is even over the grid, so it does not favour one end of a unit. */
  if (out.length > MAX_SAMPLE) {
    const step = out.length / MAX_SAMPLE, cut = [];
    for (let i = 0; i < MAX_SAMPLE; i++) cut.push(out[Math.floor(i * step)]);
    out = cut;
  }
  return out;
}

/* ── the era record, asked for «which polity was this ground in on this date» ───────────────
   The three records are the SAME three js/time-borders.js draws, and each answers for its own
   band. The bands are read off the records themselves — hist-borders publishes `window`, cshapes'
   reach is the span of its own rows, hist-eras is a list of sheets with the year each opens — so
   none of the three boundaries is typed here. */
const ymd = (y, m, d) => y * 10000 + m * 100 + d;

function eraIndex() {
  const cs = loadBundle('data/cshapes.js').data;
  const hb = loadBundle('data/hist-borders.js').data;
  const he = loadBundle('data/hist-eras.js').data;

  const pack = (d, feats, nameOf) => feats.map((f, i) => {
    const polys = f[8].map((poly) => poly.map((ri) => d.rings[ri]).filter((r) => r && r.length >= 4)).filter((p) => p.length);
    let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
    return { id: nameOf(f, i), polys, bb: [mnx, mny, mxx, mxy], s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]) };
  }).filter((u) => u.polys.length);

  const csU = pack(cs, cs.feats, (f, i) => 'cs' + i).map((u) => ({ ...u, rec: 'cs' }));
  const hbU = pack(hb, hb.feats, (f, i) => 'hb' + i).map((u) => ({ ...u, rec: 'hb' }));
  let csMin = Infinity, csMax = -Infinity;
  for (const f of cs.feats) { csMin = Math.min(csMin, f[2]); csMax = Math.max(csMax, f[5]); }
  const hbWin = hb.window || [Infinity, -Infinity];

  /* ⚠ THE SHEETS BECOME SPANS TOO, SO THE THREE RECORDS ANSWER IN ONE SHAPE. Each snapshot stands
     until the next one opens, and the last one stands until data/hist-borders.js takes over — the
     same reading js/time-borders.js gives them. A polity is then a {polys, bb, s, e} whichever
     record it came from, and nothing below this line has to know which. */
  const heU = [];
  he.snaps.forEach((s, i) => {
    const from = ymd(s.y, 1, 1);
    const to = (i + 1 < he.snaps.length) ? ymd(he.snaps[i + 1].y, 1, 1) : ymd(hbWin[0], 1, 1);
    s.feats.forEach((f, k) => {
      const polys = f[2].map((poly) => poly.map((ri) => he.rings[ri]).filter((r) => r && r.length >= 4)).filter((p) => p.length);
      if (!polys.length) return;
      let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
      heU.push({ id: 'he' + i + '_' + k, rec: 'he', polys, bb: [mnx, mny, mxx, mxy], s: from, e: to });
    });
  });

  /* ⚠ EACH RECORD ONLY ANSWERS FOR ITS OWN BAND, and the bands are the records' own reach: outside
     it a record says nothing rather than saying «empty», which would read as «no country here». */
  const csFrom = ymd(csMin, 1, 1), hbFrom = ymd(hbWin[0], 1, 1);
  /* ⚠ (#R719) THE RECORD IS A FIELD, NOT THE FIRST LETTER OF AN ID. The first build read it as
     `u.id[0]`, and BOTH 'hb…' and 'he…' begin with 'h' — so every one of the 54 deep-past sheets
     was clipped to data/hist-borders.js's 1689-1885 band and answered for nothing at all. Measured
     on that build: 1,480 intervals were withheld for «ground the era record does not place», almost
     all of them before 1689, where the record that could have placed them had been silenced by a
     string comparison. .agents/rules/no-ad-hoc-hardcoding.md §1: an identifier is not a spelling. */
  const bandOf = (u) => (u.rec === 'cs' ? [csFrom, ymd(csMax, 12, 31) + 1]
                       : u.rec === 'hb' ? [hbFrom, csFrom]
                       : [ymd(he.snaps[0].y, 1, 1), hbFrom]);

  /** every polity from any of the three records whose box meets this one, with its span clipped to
      the band its record answers for. Computed ONCE per fill unit. */
  function meeting(box) {
    const out = [];
    for (const u of csU) if (meets(u.bb, box)) out.push(u);
    for (const u of hbU) if (meets(u.bb, box)) out.push(u);
    for (const u of heU) if (meets(u.bb, box)) out.push(u);
    return out.map((u) => { const b = bandOf(u); return { id: u.id, rec: u.rec, polys: u.polys, bb: u.bb, s: Math.max(u.s, b[0]), e: Math.min(u.e, b[1]) }; })
      .filter((u) => u.e > u.s);
  }
  return { meeting, floor: he.snaps[0].y, ceiling: ymd(csMax, 12, 31) };
}
const meets = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

/* ── the record's own units, for test 4 ─────────────────────────────────────────────────────
   Discovered from data/ rather than listed, for the reason build-border-coast.mjs discovers the
   same population: a tier that lands there tomorrow has to be consulted without anyone
   remembering to come back here. */
function recordUnits() {
  const out = [];
  for (const file of fs.readdirSync(path.join(ROOT, 'data')).sort()) {
    if (!/^hist-admin\d+\.js$/.test(file)) continue;
    const { data: d } = loadBundle('data/' + file);
    for (const f of d.feats) {
      const polys = f[8].map((poly) => poly.map((ri) => d.rings[ri]).filter((r) => r && r.length >= 4)).filter((p) => p.length);
      if (!polys.length) continue;
      let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
      out.push({ polys, bb: [mnx, mny, mxx, mxy], s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]) });
    }
  }
  return out;
}

/* ── Wikidata: which ISO 3166-2 code began when ─────────────────────────────────────────────
   One query, cached. The date is taken at DAY precision where Wikidata states a day and at the
   first day of the stated year or month where it does not — the same reading the tiers give an
   EDTF-lite `start_date`, so the two records cannot disagree about what «1850» means. */
function stampOf(iso, floorTo) {
  /* ⚠ WDQS writes the leading `+` for some values and not for others — measured 2026-09-15 on the
     same query this build caches: `1715-01-01T00:00:00Z` and `+1976-02-03T00:00:00Z` both appear.
     A regex that requires the sign reads 2,401 dated rows as 6. */
  const m = /^([+-]?\d{4,})-(\d\d)-(\d\d)/.exec(String(iso || ''));
  if (!m) return null;
  const y = parseInt(m[1], 10);
  let mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  if (!Number.isFinite(y)) return null;
  if (!mo) mo = floorTo === 'end' ? 12 : 1;
  if (!d) d = floorTo === 'end' ? 31 : 1;
  return ymd(y, mo, d);
}

/* ══ ⚠⚠⚠ (#R719/#R730) THE FLOOR IS THE SET, NOT THE CONSTITUTION ════════════════════════════
   #R719 measured the defect correctly: test 3 asks «was this ground inside ONE polity on that
   date», which a Ukrainian oblast satisfies in the year 1000 — the land was wholly inside Kievan
   Rus' — and today's Երևան satisfies it in 782 BC, because ISO 3166-2 `AM-ER` sits on the CITY
   item whose stated inception is the city's founding. Both would have been drawn.
   ⚠ BUT THE FLOOR IT CHOSE WAS THE COUNTRY'S OWN P571, AND THAT IS A DIFFERENT FACT. Measured
   2026-09-15: the item carrying `JPN` states 1947-05-03 (the post-war constitution), `CHN`
   1949-10-01, `IND` 1947-08-15, `TUR` 1923-10-29. Under that floor a record built to fill the
   19th and early 20th century could not draw Japan, China, India or Turkey AT ALL before the
   middle of the 20th — which is the reader's own report, one layer further down: they opened
   1918 Japan and got ONE prefecture.
   ⇒ the floor is THE SET'S: the LATEST inception stated by a unit of the same country. It is
   about the units rather than about a constitution, it can never be earlier than any unit's own
   stated date, and it is exactly what the whole-country intersection below produces anyway —
   which is also why it still refuses the two rows #R719 measured: Armenia is drawn from the
   latest of its eleven provinces, not from Yerevan's 782 BC, and Ukraine from the latest of its
   twenty-five oblasts. A country whose units state nothing is admitted by neither rule. */
async function wikidataSpans() {
  const rows = await sparql(`SELECT ?code ?item ?inc ?dis WHERE {
  ?item wdt:P300 ?code .
  OPTIONAL { ?item wdt:P571 ?inc }
  OPTIONAL { ?item wdt:P576 ?dis }
}`, 'p300-spans');
  const out = new Map();
  for (const r of rows) {
    const code = r.code.value;
    const s = stampOf(r.inc && r.inc.value, 'start');
    if (s == null) continue;
    const e = stampOf(r.dis && r.dis.value, 'end');
    const prev = out.get(code);
    /* one code, several items happens where a unit was re-founded; the EARLIEST stated inception
       is the one that can be defended, and a stated dissolution always wins over none. */
    if (!prev || s < prev.s) out.set(code, { qid: r.item.value.split('/').pop(), s, e: e == null ? null : e });
    else if (prev && e != null && prev.e == null) prev.e = e;
  }
  return out;
}

/* ── interval arithmetic on [start, end) stamps ─────────────────────────────────────────── */
/** the intervals either set covers, merged — the reader sees a unit where EITHER record draws it */
function union(a, b) {
  const all = a.concat(b).filter((iv) => iv[1] > iv[0]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const iv of all) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) { if (iv[1] > last[1]) last[1] = iv[1]; } else out.push(iv.slice());
  }
  return out;
}

/** the intervals both sets cover — [start, end) throughout */
function intersect(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]), e = Math.min(a[i][1], b[j][1]);
    if (e > s) out.push([s, e]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}
function subtract(spans, cut) {
  const out = [];
  for (const [s, e] of spans) {
    if (cut[1] <= s || cut[0] >= e) { out.push([s, e]); continue; }
    if (cut[0] > s) out.push([s, cut[0]]);
    if (cut[1] < e) out.push([cut[1], e]);
  }
  return out;
}
/* ⚠ (#R719) THE ENCODE IS MONOTONIC FOR NEGATIVE YEARS AND THE NAIVE DECODE IS NOT. `y*10000 +
   m*100 + d` orders correctly on both sides of year 0 (the year term dominates and, within a
   negative year, a later month is nearer zero = larger). Taking it apart with `trunc` and `%`
   does not: −500-06-15 encodes as −4999385, and `trunc(v/10000)` reads −499 while `v % 100`
   reads −85. Measured: the gate caught it as «feat 6 has an impossible month or day». */
const splitYmd = (v) => {
  const neg = v < 0, a = Math.abs(v);
  const y = Math.floor(a / 10000), m = Math.floor(a / 100) % 100, d = a % 100;
  return neg ? [-y, m, d] : [y, m, d];
};

/* ── build ──────────────────────────────────────────────────────────────────────────────── */
async function main() {
  const reg = registry(ROOT);
  const SHIP = shipTags(ROOT, reg);
  const HARVEST = harvestTags(ROOT, reg);
  const ne = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  console.error('· natural earth: ' + ne.f.length + ' units in ' + ne.countries + ' countries (tol ' + ne.tolerance + ')');

  const spans = await wikidataSpans();
  console.error('· wikidata: ' + spans.size + ' ISO 3166-2 codes state an inception');

  /* test 1 + test 2 — dated, and dated for the WHOLE country. */
  const byCountry = new Map();
  for (const f of ne.f) {
    const code = f.n.split('|').find((p) => ISO2.test(p)) || null;
    const wd = code && ISO2_STRICT.test(code) ? spans.get(code) : null;
    const c = byCountry.get(f.i) || { all: [], dated: 0 };
    c.all.push({ f, code, wd });
    if (wd) c.dated++;
    byCountry.set(f.i, c);
  }
  /* ══ ⚠⚠⚠ (#R730) A SET FLOOR, SO THAT «MOSTLY DATED» IS NOT THE SAME AS «NOT DATED» ══════════
     #R719 admitted a country only when EVERY unit states an inception, and refused the rest. What
     the reader got from that is in their own screenshot of 1918 Japan: ONE prefecture — Shiga,
     the only Japanese unit OpenHistoricalMap holds — on a map of the Empire of Japan. Wikidata
     states an inception for 27 of Japan's 47 prefectures, so Japan was refused whole.
     ⚠ AND REFUSING IS NOT NEUTRAL. «一部だけ» is what the reader reported four rounds running, and
     a record that ships nothing leaves exactly that, because the OTHER record is partial.
     ⇒ a unit its own upstream never dated takes the LATEST inception stated by a unit of the same
     country. That is the weakest claim the set supports — «by this date every member that states a
     date had been established» — and it can never draw a unit before its own stated date, because
     it is the maximum of them. For Japan it is 1888-12-03, the day Kagawa separated from Ehime and
     the 47-prefecture set took the extent it still has.
     ⚠ THE GUARD IS THAT THE SET MUST ACTUALLY BE DATED: at least three units and at least half of
     them. Turkey states 7 of 81 and stays refused; France 95 of 101 and Japan 27 of 47 pass.
     ⚠ The floor is a DERIVED bound and the row says so — js/time-admin1.js draws these in the
     derived line's own style and `note()` names the record. */
  const SET_FLOOR_MIN = 3;
  const setFloor = new Map();
  for (const [iso3, c] of byCountry) {
    if (c.dated < SET_FLOOR_MIN || c.dated * 2 < c.all.length) continue;
    let latest = null;
    for (const u of c.all) if (u.wd && (latest == null || u.wd.s > latest)) latest = u.wd.s;
    if (latest != null) setFloor.set(iso3, latest);
  }
  let floored = 0;
  for (const [iso3, c] of byCountry) {
    const f = setFloor.get(iso3);
    if (f == null) continue;
    for (const u of c.all) if (!u.wd) { u.wd = { s: f, e: null, derived: 'the latest inception stated by a unit of the same country' }; c.dated++; floored++; }
  }
  console.error('· set floor: ' + setFloor.size + ' country(ies) date their own undated units from their latest stated inception (' + floored + ' unit(s))');

  const admitted = [], refusedPartial = [], refusedNoFloor = [], refusedNoId = [];
  for (const [iso3, c] of byCountry) {
    if (c.all.some((u) => !u.code)) { refusedNoId.push(iso3); continue; }
    if (c.dated === c.all.length && c.all.length >= 1) {
      if (setFloor.has(iso3)) admitted.push(iso3); else refusedNoFloor.push(iso3);
    } else if (c.dated) refusedPartial.push(iso3 + ' ' + c.dated + '/' + c.all.length);
  }
  if (refusedNoId.length) console.error('· ' + refusedNoId.length + ' country(ies) hold a unit with no identifier at all and are refused: ' + refusedNoId.join(' '));
  if (refusedNoFloor.length) console.error('· ' + refusedNoFloor.length + ' dated country(ies) have no set floor and are refused: ' + refusedNoFloor.join(' '));
  console.error('· whole-country test: ' + admitted.length + ' countries admitted, '
    + refusedPartial.length + ' refused for being partly dated, '
    + (byCountry.size - admitted.length - refusedPartial.length) + ' with no dated unit at all');

  const deferred = new Set();   /* (#R730) units left to data/hist-admin*.js — stated in the bundle */
  const era = eraIndex();
  const rec = recordUnits();
  console.error('· record units consulted for overlap: ' + rec.length);

  const rings = [], ringKey = new Map(), feats = [];
  const poolRing = (r) => {
    const k = r.length + ':' + r[0][0] + ',' + r[0][1] + ':' + r[(r.length / 2) | 0][0];
    let ix = ringKey.get(k);
    if (ix != null && rings[ix].length === r.length) return ix;
    ix = rings.push(r) - 1; ringKey.set(k, ix); return ix;
  };

  const stats = { units: 0, rows: 0, droppedStraddle: 0, droppedUnlocated: 0, droppedOverlap: 0, droppedEmpty: 0, droppedWhole: 0 };
  const qids = [];
  const pending = [];

  let done = 0;
  for (const iso3 of admitted) {
    if (ONLY && iso3 !== ONLY) continue;
    console.error('  ' + iso3 + ' (' + (++done) + '/' + admitted.length + ')');
    const live = [];
    for (const u of byCountry.get(iso3).all) {
      const g = u.f.g;
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
        .map((poly) => poly.filter((r) => r && r.length >= 4)).filter((p) => p.length);
      if (!polys.length) { stats.droppedEmpty++; continue; }
      const pts = samplePoints(polys);
      if (!pts.length) { stats.droppedEmpty++; continue; }
      let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
      const box = [mnx, mny, mxx, mxy];

      const start = Math.max(u.wd.s, setFloor.get(iso3), ymd(era.floor, 1, 1));   /* (#R730) the set's floor, not the constitution's */
      const end = u.wd.e == null ? ymd(9999, 1, 1) : u.wd.e;
      if (end <= start) { stats.droppedEmpty++; continue; }

      /* test 3 — evaluated exactly once per interval on which the era map cannot change here.
         ⚠ THE POINT-IN-POLYGON WORK IS DONE ONCE PER (point, polity), NOT ONCE PER INTERVAL. The
         polities that meet this unit do not change with the date — only WHICH OF THEM are in force
         does — so the expensive half is hoisted out of the interval loop and the loop reads a
         precomputed column. The first build of this file did it the other way and did not finish. */
      const near = era.meeting(box);
      const hitsOf = near.map((eu) => {
        let n = 0; const mask = new Uint8Array(pts.length);
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (p[0] >= eu.bb[0] && p[0] <= eu.bb[2] && p[1] >= eu.bb[1] && p[1] <= eu.bb[3] && inPolys(eu.polys, p[0], p[1])) { mask[i] = 1; n++; }
        }
        return { n, mask };
      });
      const bps = new Set();
      for (const eu of near) { if (eu.s > start && eu.s < end) bps.add(eu.s); if (eu.e > start && eu.e < end) bps.add(eu.e); }
      let alive = [];
      /* ⚠ the first interval has nothing behind it, so «no record answers» means «not drawn» there
         — the fill never starts on a date the era record is silent about. */
      let lastVerdict = false;
      let cur = start;
      for (const stop of [...bps].sort((a, b) => a - b).concat([end])) {
        const inForce = [];
        for (let k = 0; k < near.length; k++) if (near[k].s <= cur && near[k].e > cur && hitsOf[k].n) inForce.push(k);
        let located = 0, best = 0;
        const claimed = new Uint8Array(pts.length);
        for (const k of inForce) {
          let own = 0;
          const mask = hitsOf[k].mask;
          for (let i = 0; i < pts.length; i++) if (mask[i]) { own++; if (!claimed[i]) { claimed[i] = 1; located++; } }
          if (own > best) best = own;
        }
        /* ══ ⚠⚠⚠ A SEAM IN THE RECORD IS NOT A STATEMENT ABOUT THE LAND ════════════════════════
           MEASURED on Sweden (`--only SWE --diagnose`): the intervals this test was throwing away
           were `1719..1719`, `1814..1814`, `1905..1905` and `2019..9999` — a day at the Treaty of
           Nystad, a day at the Treaty of Kiel, a day at the dissolution of the union, and every
           date after data/cshapes.js's window ends. On those the era record places NOTHING here
           (`located` is 0), which is not «this ground was somewhere else»: it is «no record covers
           this instant». Withholding on it was withholding on the record's own seams, and it is
           how the first build lost 16 of its 25 countries — one unit failing at one instant empties
           the whole country's intersection.
           So a verdict is only ever formed where the record ANSWERS. Where it says nothing, the
           last verdict it did give stands. ⚠ That is not an assumption about the world: the first
           interval of every unit begins at the LATER of its own stated inception and its COUNTRY's
           (test 2), so an unanswered interval can never carry a verdict from before either. */
        const answered = located > 0 && located / pts.length >= LOCATED_MIN;
        const ok = answered ? (located - best) / located <= STRADDLE_MAX : lastVerdict;
        if (DIAG) console.error('    ' + u.code + ' ' + splitYmd(cur)[0] + '..' + splitYmd(stop)[0]
          + ' located ' + (located / pts.length * 100).toFixed(0) + '% straddle '
          + (located ? ((located - best) / located * 100).toFixed(0) : '—') + '% ' + (ok ? 'KEEP' : 'drop'));
        if (answered) lastVerdict = ok;
        if (ok) alive.push([cur, stop]);
        else if (!answered) stats.droppedUnlocated++;
        else stats.droppedStraddle++;
        cur = stop;
      }
      /* merge the intervals the era map happened to split but the verdict did not */
      alive = alive.reduce((acc, iv) => { const last = acc[acc.length - 1]; if (last && last[1] === iv[0]) last[1] = iv[1]; else acc.push(iv.slice()); return acc; }, []);
      if (!alive.length) continue;

      /* ⚠⚠⚠ (#R730) WHAT THE RECORD ANSWERS IS COVERAGE, NOT A GAP. Test 4 below hands ground back
         to data/hist-admin{1,2,3}.js so nothing is drawn twice — but #R719 then intersected the
         WHOLE-COUNTRY rule over what survived it, so a single unit the record answers emptied the
         country. That is precisely Japan: OpenHistoricalMap holds 滋賀県 and nothing else, the fill
         fell silent for Shiga, the intersection went empty, and 1918 Japan shipped ONE prefecture.
         ⇒ the completeness test reads what the READER SEES — the fill's own intervals UNION the
         record's — while the emitted rows stay only the fill's half. */
      const alive3 = alive.map((iv) => iv.slice());
      const answeredIv = [];

      /* test 4 — the record's own units take the ground back for their own spans. */
      for (const r of rec) {
        if (!meets(r.bb, box)) continue;
        const need = Math.ceil(OVERLAP_MIN * pts.length);
        let hit = 0, seen = 0, enough = true;
        for (const p of pts) {
          seen++;
          if (p[0] >= r.bb[0] && p[0] <= r.bb[2] && p[1] >= r.bb[1] && p[1] <= r.bb[3] && inPolys(r.polys, p[0], p[1])) hit++;
          /* a county cannot take a state's ground: stop as soon as the threshold is out of reach */
          if (hit + (pts.length - seen) < need) { enough = false; break; }
        }
        if (!enough || hit < need) continue;
        answeredIv.push([r.s, r.e]);
        const before = alive.length;
        alive = subtract(alive, [r.s, r.e]);
        if (alive.length !== before || !alive.length) stats.droppedOverlap++;
      }
      /* ⚠ A UNIT WHOSE WHOLE SPAN THE RECORD ANSWERS STAYS IN `live`. Dropping it here is what
         made `live.length === all.length` false and took the country with it. */
      const shown = union(alive3, answeredIv);
      if (!shown.length) continue;

      live.push({ u, polys, alive, shown });
    }

    /* ══ ⚠⚠⚠ THE WHOLE-COUNTRY RULE IS ABOUT THE OUTPUT, NOT THE INPUT ════════════════════════
       The first build applied it to the ADMISSION — «every unit of this country is dated» — and
       then let tests 3 and 4 silence units one at a time. Its own `--check` caught what that
       produces: ARM 7/11, CAN 3/13, ECU 2/24, UKR 17/25, USA 24/51 — a record answering PART of a
       country, which is the exact defect the reader reported and the exact thing this record was
       built not to create. So the surviving intervals are INTERSECTED across every unit of the
       country: a country is drawn on the dates where ALL of its units may be drawn, and on no
       others. A country whose intersection is empty ships nothing at all. */
    let whole = live.length === byCountry.get(iso3).all.length ? [[ymd(-122999, 1, 1), ymd(9999, 1, 1)]] : [];
    for (const L of live) whole = intersect(whole, L.shown);   /* (#R730) what the reader sees, both records together */
    if (!whole.length) { stats.droppedWhole += live.length; continue; }

    for (const L of live) {
      const spans = intersect(whole, L.alive);
      /* ⚠ (#R730) A UNIT THIS RECORD DRAWS NOTHING FOR IS NOT A HOLE — it is a unit the OHM record
         answers, and the reader sees it there. `--check` re-derives the whole-country rule from the
         shipped bytes, so the bytes have to SAY which units those are; otherwise the gate reads
         Japan as 46 of 47 and refuses the very thing this round fixed. */
      if (!spans.length) { deferred.add(L.u.code); continue; }
      const ringIx = L.polys.map((poly) => poly.map(poolRing));
      const en = L.u.f.n.split('|')[0];
      stats.units++;
      for (const [s, e] of spans) {
        const [sy, sm, sd] = splitYmd(s), [ey, em, ed] = splitYmd(e);
        pending.push({ qid: L.u.wd.qid, row: [en, 4, sy, sm, sd, ey, em, ed, ringIx, { en }, L.u.code, iso3] });
        stats.rows++;
      }
      qids.push(L.u.wd.qid);
    }
  }

  /* names — the same join the tiers use, so one item names one unit in one way everywhere. */
  const labels = await labelsFor([...new Set(qids)], ROOT, (m) => process.stderr.write(m.endsWith('   ') ? m : m + '\n'));
  let filled = 0;
  for (const p of pending) {
    const lab = labels.get(p.qid);
    if (lab) { const got = labelsByTag(lab, SHIP, reg); for (const k of Object.keys(got)) if (!p.row[9][k]) { p.row[9][k] = got[k]; filled++; } }
    feats.push(p.row);
  }
  console.error('· names: ' + filled + ' columns filled from Wikidata in ' + SHIP.join(',') + ' (harvest set is ' + HARVEST.join(',') + ')');

  const data = {
    v: 1,
    src: LICENCE,
    built: new Date().toISOString().slice(0, 10),
    tolerance: ne.tolerance,
    levels: [4],
    /* (#R730) the units this record deliberately leaves to data/hist-admin{1,2,3}.js, so the gate
       can re-derive «a country is answered whole» over what the READER sees rather than over one
       record's half of it. */
    deferred: [...deferred].sort(),
    rings,
    feats,
  };
  fs.writeFileSync(OUT, 'window.' + GLOBAL + '=' + JSON.stringify(data) + ';\n');
  const bytes = fs.statSync(OUT).size;
  console.error('· wrote ' + path.relative(ROOT, OUT) + ' ' + (bytes / 1e6).toFixed(2) + ' MB | units ' + stats.units
    + ' | rows ' + stats.rows + ' | rings ' + rings.length);
  console.error('  withheld: ' + stats.droppedStraddle + ' interval(s) for straddling, ' + stats.droppedUnlocated
    + ' for ground the era record does not place, ' + stats.droppedOverlap + ' for ground the record already answers for, '
    + stats.droppedWhole + ' unit(s) because their country could not be answered whole on any date');
  for (const y of [1700, 1800, 1900, 1950, 2000]) {
    const st = ymd(y, 6, 15);
    console.error('  in force ' + y + ': ' + feats.filter((f) => ymd(f[2], f[3], f[4]) <= st && ymd(f[5], f[6], f[7]) > st).length);
  }
}

/* ── check ──────────────────────────────────────────────────────────────────────────────────
   Offline, on the COMMITTED bytes. It re-derives nothing from upstream — the same rule
   scripts/build-hist-admin1.mjs's `--check` follows — and asks only what the file can be asked
   without the network. */
function check() {
  const fail = [];
  const ok = (cond, msg) => { if (!cond) fail.push(msg); };
  if (!fs.existsSync(OUT)) { console.error('✖ ' + path.relative(ROOT, OUT) + ' is missing'); process.exit(1); }
  const src = fs.readFileSync(OUT, 'utf8');
  const globals = [...src.matchAll(/^\s*window\.(__[A-Za-z0-9_$]+)\s*=/gm)].map((m) => m[1]);
  ok(globals.length === 1 && globals[0] === GLOBAL, 'the file must define exactly ' + GLOBAL + ' (found ' + globals.join(',') + ')');
  const w = {}; vm.runInNewContext(src, { window: w });
  const d = w[GLOBAL];
  ok(d && d.v === 1, 'v must be 1');
  ok(/Natural Earth/i.test(d.src || ''), 'src must name Natural Earth');
  ok(/public domain/i.test(d.src || ''), 'src must name the outline licence');
  ok(/Wikidata/i.test(d.src || '') && /CC0/.test(d.src || ''), 'src must name Wikidata and its licence');
  ok(/^\d{4}-\d\d-\d\d$/.test(d.built || ''), 'built must be an ISO date');
  ok(Number.isFinite(d.tolerance) && d.tolerance > 0, 'tolerance must be a finite positive number');

  for (let i = 0; i < d.rings.length; i++) {
    const r = d.rings[i];
    if (!Array.isArray(r) || r.length < 4) { fail.push('ring ' + i + ' has fewer than 4 points'); break; }
    const a = r[0], z = r[r.length - 1];
    if (a[0] !== z[0] || a[1] !== z[1]) { fail.push('ring ' + i + ' is not closed'); break; }
    let bad = false;
    for (const p of r) if (!(Math.abs(p[0]) <= 180.001 && Math.abs(p[1]) <= 90.001)) { bad = true; break; }
    if (bad) { fail.push('ring ' + i + ' leaves the globe'); break; }
  }
  const used = new Set();
  for (let i = 0; i < d.feats.length; i++) {
    const f = d.feats[i];
    if (f.length !== 12) { fail.push('feat ' + i + ' has ' + f.length + ' columns, not 12'); break; }
    if (!ISO2.test(String(f[10] || ''))) { fail.push('feat ' + i + ' carries no ISO 3166-2 code — the whole-country rule cannot be re-derived from a name'); break; }
    if (!/^[A-Z]{2,3}$/.test(String(f[11] || ''))) { fail.push('feat ' + i + ' carries no country code'); break; }
    if (!f[0]) { fail.push('feat ' + i + ' has no name'); break; }
    if (f[3] < 1 || f[3] > 12 || f[6] < 1 || f[6] > 12 || f[4] < 1 || f[4] > 31 || f[7] < 1 || f[7] > 31) { fail.push('feat ' + i + ' has an impossible month or day'); break; }
    const s = f[2] * 10000 + f[3] * 100 + f[4], e = f[5] * 10000 + f[6] * 100 + f[7];
    if (!(s < e)) { fail.push('feat ' + i + ' ends before it starts'); break; }
    let bad = false;
    for (const poly of f[8]) for (const ri of poly) { if (!(ri >= 0 && ri < d.rings.length)) { bad = true; break; } used.add(ri); }
    if (bad) { fail.push('feat ' + i + ' points outside the ring pool'); break; }
    if (!f[9] || !f[9].en) { fail.push('feat ' + i + ' has no English name'); break; }
  }
  ok(used.size === d.rings.length, 'every pooled ring must be used (' + used.size + ' of ' + d.rings.length + ')');

  /* ⚠ THE INVARIANT THIS FILE EXISTS FOR: a row may never be drawn before the date Wikidata
     states, and the WHOLE-COUNTRY rule means a country is either answered completely or not at
     all. The first is carried by the row itself; the second is re-derived here from the shipped
     outline set, because a build that quietly admitted a partly-dated country would reproduce the
     very defect this record was made to remove. */
  const ne = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  /* ⚠ JOINED BY THE CODE, NOT BY THE NAME. Natural Earth's unit names repeat across countries, and
     the first version of this check counted a namesake in an answered country as an answer for a
     country nobody answers for. */
  const drawn = new Set(d.feats.map((f) => f[10]));
  const defer = new Set(d.deferred || []);
  const byC = new Map();
  for (const f of ne.f) {
    const code = f.n.split('|').find((p) => ISO2.test(p)) || null;
    const c = byC.get(f.i) || { all: 0, drawn: 0, deferred: 0 };
    c.all++; if (code && drawn.has(code)) c.drawn++; else if (code && defer.has(code)) c.deferred++;
    byC.set(f.i, c);
  }
  const partial = [...byC].filter(([, c]) => (c.drawn || c.deferred) && c.drawn + c.deferred < c.all)
    .map(([k, c]) => k + ' ' + (c.drawn + c.deferred) + '/' + c.all);
  ok(!partial.length, 'a country is answered completely or not at all; partly answered: ' + partial.join(', '));
  /* ⚠ AND «DEFERRED» IS CHECKED, NOT TRUSTED. A build could satisfy the line above by listing every
     missing code, so each deferred unit must really be covered by the record it was deferred to:
     its outline's own interior points are tested against data/hist-admin{1,2,3}.js. */
  /* ⚠ THE GEOMETRY HALF RUNS WHERE THE RECORD IS, AND SAYS WHICH HALF RAN. The bundles it reads are
     82 MB, so a synthetic world (tests/r719-histmap-coverage-checks) holds the outline set and this
     record and nothing else — the same split build-hist-kuni.mjs states for its raster. */
  const recFiles = fs.readdirSync(path.join(ROOT, 'data')).filter((n) => /^hist-admin[0-9]\.js$/.test(n));
  if (defer.size && !recFiles.length) console.log('· ' + defer.size + ' deferred unit(s) not verified against the record — data/hist-admin*.js is not on disk');
  if (defer.size && recFiles.length) {
    const recPolys = [];
    for (const nm of recFiles) {
      const wv = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', nm), 'utf8'), { window: wv });
      const dd = wv['__HISTADM' + nm.match(/[0-9]/)[0]];
      for (const r of dd.feats) recPolys.push(r[8].map((poly) => poly.map((ri) => dd.rings[ri])));
    }
    const orphan = [];
    for (const code of defer) {
      const unit = ne.f.find((f) => String(f.n || '').split('|').includes(code));
      if (!unit) { orphan.push(code + ' (no outline)'); continue; }
      const g = unit.g;
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
        .map((poly) => poly.filter((r) => r && r.length >= 4)).filter((pp) => pp.length);
      const pts = polys.length ? samplePoints(polys) : [];
      if (!pts.some((pt) => recPolys.some((polys) => inPolys(polys, pt[0], pt[1])))) orphan.push(code);
    }
    ok(!orphan.length, orphan.length + ' unit(s) are deferred to the record but no record row covers them: ' + orphan.slice(0, 8).join(', '));
  }
  /* …and the row's own country column must agree with the outline set it was taken from */
  const isoOf = new Map();
  for (const f of ne.f) { const code = f.n.split('|').find((p) => ISO2.test(p)); if (code) isoOf.set(code, f.i); }
  for (const f of d.feats) if (isoOf.get(f[10]) && isoOf.get(f[10]) !== f[11]) { fail.push('feat for ' + f[10] + ' says country ' + f[11] + ', the outline set says ' + isoOf.get(f[10])); break; }

  const answered = [...byC].filter(([, c]) => c.drawn + c.deferred === c.all && c.all).length;
  if (fail.length) { for (const m of fail) console.error('✖ ' + m); process.exit(1); }
  const span = d.feats.reduce((a, f) => [Math.min(a[0], f[2]), Math.max(a[1], f[5])], [Infinity, -Infinity]);
  console.log('✓ hist-admin-fill — ' + d.feats.length + ' rows over ' + drawn.size + ' units in ' + answered
    + ' countries, ' + d.rings.length + ' pooled rings, ' + span[0] + '…' + span[1]
    + '; every ring used, every country answered whole, no row before its stated inception');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.includes('--check')) check();
  else main().catch((e) => { console.error('FAILED', e); process.exit(1); });
}
