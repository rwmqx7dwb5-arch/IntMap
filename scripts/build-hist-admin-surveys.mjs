#!/usr/bin/env node
/* ============================================================================
 *  build-hist-admin-surveys.mjs — data/hist-admin-surveys.js  (hist-coverage-depth)
 * ----------------------------------------------------------------------------
 *  FIRST-LEVEL SUBDIVISIONS THAT A PUBLISHER SURVEYED AND DATED, WHERE OPENHISTORICALMAP HOLDS NONE.
 *
 *  ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────
 *  「歴史地図の coverage を徹底的に増強しろ。まだ不十分な時代や地域もある。より広く、より正確に。」
 *  Measured 2026-10-05 on the shipped bundles (scripts/hist-fidelity.mjs, 0.25° grid): the share of
 *  the world's land carrying a first-level unit was 17.3% in 1800, 30.1% in 1850, 41.0% in 1900. The
 *  only global dated source is OpenHistoricalMap (scripts/build-hist-admin1.mjs measured eight
 *  others in #R530 and none was one). But a global source is not the only kind there is: national
 *  and regional publishers survey their own historical divisions, to the day, under open licences —
 *  and #R530's list dismissed the best of them as «excellent, but ONE country». One country at a
 *  time is how the rest of the map will be filled.
 *
 *  ── WHAT IS DRAWN, AND WHAT IS THE CLAIM ───────────────────────────────────────────────────
 *  Each harvester in scripts/histsurveys/ (DISCOVERED, not listed) reads one publisher's record and
 *  hands back units with the publisher's own dates and precision. This file:
 *    1. asks the harvester which of its units are first-level subdivisions (`admits`) — that is
 *       knowledge about the source, so it lives beside the source;
 *    2. collapses a snapshot record's identical consecutive rows into one span (`collapse`);
 *    3. YIELDS TO OPENHISTORICALMAP: on any interval where an in-force unit of data/hist-admin1.js
 *       already covers a quarter of this unit's ground, this record is silent — the reader is never
 *       shown two lines for one province (the double-claim gate in scripts/hist-fidelity.mjs may
 *       not grow), and OHM is the record IntMap's line tiles draw;
 *    4. simplifies to the first tier's own tolerance (read from data/hist-admin1.js, not typed);
 *    5. writes the publisher's dates and their precision beside each row, so the popup says
 *       «1867 – 1870» where the publisher stated years and never prints a day nobody stated.
 *  The claim is the publisher's, not IntMap's: «this unit, with this outline, from this date».
 *  HIST_ADMIN_GAPS (js/border-coast.js) lists this file as a RECORD (`derived: false`) — not a derivation.
 *
 *  Output — the gap-bundle shape js/hist-bundles.js splices (columns 0-9 by position):
 *      window.__HISTADMSURVEY = { v, src, built, tolerance, decimals, levels, sources, dates, rings, feats }
 *      feat  = [ name, lvl, sy,sm,sd, ey,em,ed, [[ringIdx…]…], names, source, upstreamId, sovereign ]
 *      dates = { <row index>: { start:{raw,precision,derived?}, end:{raw,precision,derived?,basis?} } }
 *  Dates use an exclusive end, like every tier.
 *
 *  Usage:  node scripts/build-hist-admin-surveys.mjs --fetch    # each harvester downloads into its cache
 *          node scripts/build-hist-admin-surveys.mjs            # build from the caches
 *          node scripts/build-hist-admin-surveys.mjs --check    # verify the COMMITTED bundle, offline
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { simplifyGeoJSON } from './lib/elections-geo.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const LEVEL = 4;

/* ⚠ (upstream-liveness) 出自は値である。読むのは js/data-governance.js の read() と
   npm run check:datagov（scripts/data-governance.mjs）。
   ⚠ THE DECLARATION IS A LITERAL BECAUSE THE GATE READS IT AS DATA — it does not run this module, so a value
   computed from the harvesters reads as an unreadable declaration. The literal is the harvesters' own
   `SOURCE` values for the publishers the built files credit; `--check` (checkGovernance below) compares
   it with them and with the bundles' `sources`, so a publisher added, dropped or relicensed in
   scripts/histsurveys/ fails the gate until this is rewritten — the copy cannot drift silently.
   `attribution`/`creditRequired` follow the licence (CC0 imposes none; RISTAT's attribution is a request);
   `paidBy` is the js/reference-data.js row naming the same URL. */
export const GOVERNANCE = {
  'data/hist-admin-surveys.js': {
    upstreams: [
      {
        "publisher": "Ancient World Mapping Center & Pedar Foss (MAGIS), via Pelagios; dates and Latin names from Pleiades",
        "url": "https://github.com/pelagios/magis-pleiades-regions",
        "licence": "CC BY (geometry: «Copyright AWMC & Foss, CC-BY», no version stated) · CC BY 3.0 (Pleiades dates and names)",
        "licenceUrl": "https://creativecommons.org/licenses/by/3.0/",
        "attribution": true,
        "creditRequired": true,
        "paidBy": "Pelagios MAGIS — Pleiades Regions (Roman provinces digitised by Pedar Foss from the Barrington Atlas; CC BY) with Pleiades (CC BY 3.0)"
      },
      {
        "publisher": "Nejjar (University of Oxford), via Harvard Dataverse",
        "url": "https://doi.org/10.7910/DVN/YOHIFN",
        "licence": "CC0 1.0",
        "licenceUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": false,
        "creditRequired": false,
        "paidBy": "Nejjar (University of Oxford) — Palestine 1896 and Syria and Lebanon 1926 administrative boundaries (CC0 1.0)"
      },
      {
        "publisher": "Natural Resources Canada",
        "url": "https://open.canada.ca/data/en/dataset/e88ce995-b69a-4595-a752-bb06b061b5a3",
        "licence": "Open Government Licence - Canada",
        "licenceUrl": "https://open.canada.ca/en/open-government-licence-canada",
        "attribution": true,
        "creditRequired": true,
        "paidBy": "Natural Resources Canada — Territorial Evolution, 1867 to 2003 (Open Government Licence – Canada)"
      },
      {
        "publisher": "Electronic Repository of Russian Historical Statistics (RISTAT)",
        "url": "https://doi.org/10.34894/NQOASN",
        "licence": "CC0 1.0 with a request for attribution",
        "licenceUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": false,
        "creditRequired": false,
        "paidBy": "Electronic Repository of Russian Historical Statistics (RISTAT) — Russian Empire Historical GIS Maps, 1897 (CC0 1.0)"
      },
      {
        "publisher": "Virtual Shanghai (ENP-China Project)",
        "url": "https://www.virtualshanghai.net/Maps/Base?ID=2210",
        "licence": "CC0 1.0",
        "licenceUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": false,
        "creditRequired": false,
        "paidBy": "Virtual Shanghai (ENP-China Project) — Provinces in Republican China, 1912-1949 (CC0 1.0)"
      }
    ],
    cadence: 'irregular',
    cadenceBasis: { observed: 'finished historical atlases; on 2026-10-05 the newest revision among them is Virtual Shanghai (2026-06-19), the oldest AHCB (2011)', expires: 'when a publisher announces a new edition', canon: 'scripts/histsurveys/<publisher>.mjs SOURCE' },
    builtBy: 'scripts/build-hist-admin-surveys.mjs',
  },
  'data/hist-admin-surveys-nc.js': {
    upstreams: [
      {
        "publisher": "HGIS de las Indias (Werner Stangl, University of Graz)",
        "url": "https://doi.org/10.7910/DVN/YPEU5E",
        "licence": "CC BY-NC-SA 4.0",
        "licenceUrl": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        "attribution": true,
        "creditRequired": true,
        "paidBy": "HGIS de las Indias (Werner Stangl, University of Graz) — Territorial gazetteer for Spanish America, 1701-1808"
      }
    ],
    licence: 'CC BY-NC-SA 4.0',
    cadence: 'irregular',
    cadenceBasis: { observed: 'on 2026-10-05 the HGIS de las Indias gazetteer is at V4 (2023-10-26)', expires: 'when the publisher releases a new version', canon: 'scripts/histsurveys/hgisindias.mjs SOURCE' },
    builtBy: 'scripts/build-hist-admin-surveys.mjs',
  },
};

/* the overlap that hands ground to the record — the same share scripts/build-hist-admin-fill.mjs
   uses for the same question (OVERLAP_MIN), so the two yields cannot disagree about what «already
   answered» means. ⚠ It is imported, not copied, below. */
/* ⚠ AND THE SAMPLE AND THE POINT-IN-POLYGON PASS ARE THAT FILE'S TOO — one lattice, one scanline
   (`hitMask` asks a polygon about all of a unit's points in one pass; a ray per point did not finish
   on the first trial build of this file, measured 2026-10-05: no output after 10 minutes). */
import { samplePoints, answeredSpans } from './build-hist-admin-fill.mjs';

const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const parseIso = (s) => { const m = /^(-?\d{1,6})-(\d\d)-(\d\d)$/.exec(String(s || '')); return m ? ymd(+m[1], +m[2], +m[3]) : null; };
const split = (n) => { const y = Math.floor(n / 10000), r = n - y * 10000; return [y, Math.floor(r / 100), r % 100]; };
const OPEN = ymd(9999, 1, 1);

function loadBundle(rel) {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { window: w });
  return w[Object.keys(w)[0]];
}

/* ── geometry ──────────────────────────────────────────────────────────────────────────── */
function bboxOf(polys) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}
/* the harvesters hand back MultiPolygon coordinates, or the GeoJSON geometry object holding them */
const multi = (c) => (Array.isArray(c) ? c : c && c.type === 'Polygon' ? [c.coordinates] : c && c.type === 'MultiPolygon' ? c.coordinates : []);
const dayOf = (n) => { const [y, m, d] = split(n); return Date.UTC(2000, m - 1, d) / 864e5 + y * 365.2425; };
const meets = (p, q) => !(p[2] < q[0] || p[0] > q[2] || p[3] < q[1] || p[1] > q[3]);
function subtract(ivs, [s, e]) {
  const out = [];
  for (const [a, b] of ivs) { if (e <= a || s >= b) { out.push([a, b]); continue; } if (a < s) out.push([a, s]); if (e < b) out.push([e, b]); }
  return out;
}

/* ── the harvesters, discovered ─────────────────────────────────────────────────────────── */
async function harvesters() {
  const dir = path.join(ROOT, 'scripts', 'histsurveys');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    if (!mod.SOURCE || typeof mod.harvest !== 'function') continue;
    out.push({ file: 'scripts/histsurveys/' + f, mod });
  }
  /* --only newberry,nrcan — a trial build of some publishers (never committed: --check names every one) */
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
  return only ? out.filter((h) => only.includes(h.mod.SOURCE.key)) : out;
}

/* ⚠ A SNAPSHOT RECORD STATES THE SAME UNIT AGAIN AT EVERY SNAPSHOT. NRCan's territorial evolution is
   23 maps; New Brunswick is 23 rows with one outline. Drawn as rows they are one line that flickers
   its identity at every snapshot year, and a click reports a span that is an artefact of the
   publication. Consecutive rows of one name, one sovereign and the SAME outline (exact coordinates)
   whose spans touch are one span. A changed outline is a new row — that change is the record's claim. */
function collapse(units) {
  const key = (u) => u.name + '\u0001' + (u.sovereign || '') + '\u0001' + JSON.stringify(u.coords);
  const by = new Map();
  for (const u of units) { const k = key(u); if (!by.has(k)) by.set(k, []); by.get(k).push(u); }
  const out = [];
  for (const list of by.values()) {
    list.sort((a, b) => parseIso(a.start) - parseIso(b.start));
    let cur = null;
    for (const u of list) {
      if (cur && cur.end && u.start === cur.end) {
        cur = { ...cur, end: u.end, endPrecision: u.endPrecision, endDerived: u.endDerived, endBasis: u.endBasis, merged: (cur.merged || [cur.id]).concat(u.id) };
      } else { if (cur) out.push(cur); cur = u; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/* ── the record this one yields to ──────────────────────────────────────────────────────── */
function recordUnits() {
  const d = loadBundle('data/hist-admin1.js');
  const first = new Set(d.levels);
  const out = [];
  for (const f of d.feats) {
    if (!first.has(f[1])) continue;
    const polys = f[8].map((poly) => poly.map((ri) => d.rings[ri]).filter((r) => r && r.length >= 4)).filter((p) => p.length);
    if (!polys.length) continue;
    out.push({ polys, bb: bboxOf(polys), s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]) });
  }
  return { units: out, tolerance: d.tolerance, decimals: d.decimals };
}

async function main() {
  const hs = await harvesters();
  if (args.includes('--fetch')) { for (const h of hs) { console.error('· fetch ' + h.mod.SOURCE.key); await h.mod.fetchRaw(); } }

  const rec = recordUnits();
  const TOL = rec.tolerance, DEC = Number.isFinite(rec.decimals) ? rec.decimals : 4;
  const sources = {}, rows = [], dropped = {};
  const stats = {};

  /* ⚠ A HARVESTER WHOSE CACHE IS MISSING FAILS THE BUILD. Skipping it would ship a record with one
     publisher silently gone and every one of its units withdrawn from the map. */
  const got = [];
  for (const h of hs) got.push({ h, r: await h.mod.harvest() });
  /* ══ ⚠ TWO PUBLISHERS ON ONE PIECE OF GROUND: THE ONE THAT STATES MORE ANSWERS ══════════════════
     The yield to OpenHistoricalMap is not enough once there are several publishers: two of them may
     stand on one year over one province. They are taken in the order of how precisely each dates
     its units (the share stated to the day, then to the month), and a later one yields to every row
     an earlier one has already placed — by the same test and share it yields to OHM with. The order
     is computed from the records, not written here. */
  const sharp = (r) => { const n = r.units.length || 1; let d = 0, m = 0; for (const u of r.units) { if (u.startPrecision === 'day') d++; else if (u.startPrecision === 'month') m++; } return d / n + m / n / 1000; };
  got.sort((p, q) => sharp(q.r) - sharp(p.r) || (p.h.mod.SOURCE.key < q.h.mod.SOURCE.key ? -1 : 1));
  const pool = rec.units.slice();

  for (const { h, r: harvested } of got) {
    const S = h.mod.SOURCE;
    const admits = typeof h.mod.admits === 'function' ? h.mod.admits : () => true;
    const st = stats[S.key] = { upstream: harvested.units.length + harvested.dropped.length, droppedUpstream: harvested.dropped.length, notFirstLevel: 0, collapsed: 0, yielded: 0, units: 0, rows: 0 };
    const kept = [];
    for (const u of harvested.units) {
      const ok = admits(u);
      if (ok !== true) { st.notFirstLevel++; (dropped[S.key + ':' + ok] = (dropped[S.key + ':' + ok] || 0) + 1); continue; }
      kept.push(u);
    }
    const units = collapse(kept);
    st.collapsed = kept.length - units.length;
    sources[S.key] = { publisher: S.publisher, title: S.title, url: S.url, licence: S.licence, licenceUrl: S.licenceUrl, licenceStatedAt: S.licenceStatedAt, citation: S.citation, builtBy: h.file,
      ...(S.nonCommercial ? { nonCommercial: true } : {}), ...(S.shareAlike ? { shareAlike: true } : {}), ...(S.inheritedTerms ? { inheritedTerms: S.inheritedTerms } : {}) };
    const placed = [];
    let n = 0;
    for (const u of units) {
      if (++n % 50 === 0) process.stderr.write('  ' + S.key + ' ' + n + '/' + units.length + '\r');
      const s = parseIso(u.start), e = u.end ? parseIso(u.end) : OPEN;
      if (s == null || !(e > s)) { (dropped[S.key + ':bad span'] = (dropped[S.key + ':bad span'] || 0) + 1); continue; }
      const polys = multi(u.coords).map((poly) => poly.filter((r) => r && r.length >= 4)).filter((p) => p.length);
      if (!polys.length) continue;
      const pts = samplePoints(polys), bb = bboxOf(polys);
      /* a record already answers this ground on its own spans: yield them */
      let alive = [[s, e]];
      /* the record's units together, on each interval between their own change dates (answeredSpans) */
      const ans = answeredSpans(pts, bb, pool, s, e);
      for (const iv of ans.spans) alive = subtract(alive, iv);
      const by = ans.who.map((r) => r.who || 'OpenHistoricalMap');
      /* ══ ⚠ A GAP BETWEEN TWO OF THE RECORD'S OWN ROWS IS A SEAM, NOT AN ABSENCE ══════════════════════
         MEASURED 2026-10-05 on the first build: all 159 rows Newberry contributed were spans of a few
         days — Connecticut 1786, Maryland 1791, Virginia 1792 — falling between two OpenHistoricalMap
         rows of the same ground whose dates disagree with Newberry's by days. The record answers that
         ground before and after; the interval is the two records disagreeing about a handover, which
         scripts/hist-fidelity.mjs already names a seam. Drawing a second outline there for three days
         is not coverage. ⚠ AND THE SECOND BUILD SHOWED THE SAME AT THE EDGES: 145 one-day rows, each the
         last day of a Newberry version where OpenHistoricalMap's exclusive end and Newberry's inclusive
         one (converted +1) disagree by a day. So once the record answers ANY of a unit's span, a
         remaining piece shorter than a year is dropped — a year being the coarsest precision any of
         these records states, inside which a handover's dating cannot be told apart. A unit the
         record does not answer at all keeps its whole span, however short (a census year is a year). */
      const cut = !(alive.length === 1 && alive[0][0] === s && alive[0][1] === e);
      if (cut) alive = alive.filter(([a, b]) => dayOf(b) - dayOf(a) >= 366);
      if (!alive.length) { st.yielded++; continue; }
      if (alive.length !== 1 || alive[0][0] !== s || alive[0][1] !== e) st.yielded++;
      const fc = simplifyGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] }, { tolerance: TOL, decimals: DEC });
      const g = fc.features[0].geometry;
      const simp = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      st.units++;
      const who = [...new Set(by)].join(' / ') || 'another record';
      /* the publisher's own statement, at its own precision; a year before 1 keeps its sign ('-0030') */
      const raw = (iso, p) => { const m = /^(-?\d+)-(\d\d)-(\d\d)$/.exec(iso); return !m ? iso : p === 'year' ? m[1] : p === 'month' ? m[1] + '-' + m[2] : iso; };
      for (const [a, b] of alive) {
        placed.push({ polys, bb, s: a, e: b, who: S.publisher });
        rows.push({
          name: u.name, names: Object.fromEntries(Object.entries(u.names || { en: u.name }).filter(([, v]) => v)),
          a, b, polys: simp, src: S.key, nc: !!S.nonCommercial, id: u.id, sov: u.sovereign || null,
          dates: {
            start: { raw: raw(u.start, u.startPrecision), precision: u.startPrecision, ...(u.startDerived ? { derived: true, basis: u.startBasis } : {}), ...(a !== s ? { derived: true, basis: who + ' answers for this ground until here' } : {}) },
            end: u.end ? { raw: raw(u.end, u.endPrecision), precision: u.endPrecision, ...(u.endDerived ? { derived: true, basis: u.endBasis } : {}), ...(b !== e ? { derived: true, basis: who + ' answers for this ground from here' } : {}) }
                       : { raw: null, precision: null, ...(b !== e ? { derived: true, basis: who + ' answers for this ground from here' } : {}) },
          },
        });
        st.rows++;
      }
    }
    pool.push(...placed);
    console.error('  ' + S.key + ' ' + JSON.stringify(st));
  }

  /* ══ ⚠ A NON-COMMERCIAL SOURCE IS NEVER MIXED INTO THE OPEN RECORD ═════════════════════════════
     A share-alike non-commercial licence binds the file that combines its geometry. So each record
     HIST_ADMIN_GAPS (js/border-coast.js) declares as non-derived takes exactly the publishers whose own
     `nonCommercial` matches its own — the separation data/cshapes.js keeps for CShapes. */
  for (const G of HIST_ADMIN_GAPS.filter((g) => g.derived === false)) {
    const mine = rows.filter((r) => r.nc === !!G.nonCommercial);
    const S = Object.fromEntries(Object.entries(sources).filter(([, v]) => !!v.nonCommercial === !!G.nonCommercial));
    write(G, mine, S, TOL, DEC);
  }
  if (Object.keys(dropped).length) console.error('  not first-level / dropped: ' + JSON.stringify(dropped));
}

function write(G, rows, sources, TOL, DEC) {
  /* ⚠ A PUBLISHER IS CREDITED FOR WHAT THE FILE DRAWS FROM IT, NOT FOR BEING ASKED. Measured on the
     2026-10-05 build: OpenHistoricalMap already answered every interval of Newberry's states and of the
     1926 USSR layer, so neither contributed a row — a credit to them would say the map draws their
     outlines when it draws none. Their harvesters stay: the yield is re-measured on every build, and a
     unit OHM stops answering is drawn from them again, credited again. */
  const used = new Set(rows.map((r) => r.src));
  sources = Object.fromEntries(Object.entries(sources).filter(([k]) => used.has(k)));
  rows = rows.slice().sort((p, q) => p.a - q.a || (p.name < q.name ? -1 : p.name > q.name ? 1 : 0));
  const rings = [], ringKey = new Map(), feats = [], dates = {};
  const pool = (r) => { const k = JSON.stringify(r); let i = ringKey.get(k); if (i == null) { i = rings.push(r) - 1; ringKey.set(k, i); } return i; };
  rows.forEach((r, i) => {
    const [sy, sm, sd] = split(r.a), [ey, em, ed] = split(r.b);
    feats.push([r.name, LEVEL, sy, sm, sd, ey, em, ed, r.polys.map((p) => p.map(pool)), r.names.en ? r.names : { en: r.name, ...r.names }, r.src, r.id, r.sov]);
    dates[i] = r.dates;
  });
  const src = Object.values(sources).map((s) => s.publisher + ', ' + s.title + ' (' + s.licence + ')').join(' · ') + ' · assembled by scripts/build-hist-admin-surveys.mjs'
    + (G.nonCommercial ? ' · this file: CC BY-NC-SA 4.0' : '');
  const data = { v: 1, src, built: new Date().toISOString().slice(0, 10), tolerance: TOL, decimals: DEC, levels: [LEVEL], dateSemantics: 'exclusive-end',
    ...(G.nonCommercial ? { licence: 'CC BY-NC-SA 4.0' } : {}), sources, dates, rings, feats };
  const out = path.join(ROOT, G.file);
  fs.writeFileSync(out, 'window.' + G.global + '=' + JSON.stringify(data) + ';\n');
  console.error('· wrote ' + G.file + ' ' + (fs.statSync(out).size / 1e6).toFixed(2) + ' MB | rows ' + feats.length + ' | rings ' + rings.length + ' | sources ' + Object.keys(sources).join(','));
  for (const y of [1800, 1850, 1897, 1900, 1926, 1950]) {
    const t = ymd(y, 7, 1);
    console.error('  in force ' + y + ': ' + feats.filter((f) => ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t).length);
  }
}

/* ── --check: the committed bytes, offline ─────────────────────────────────────────────── */
/* the js/reference-data.js row naming each URL — the row that pays a publisher's credit */
const ROW_BY_URL = new Map([...fs.readFileSync(path.join(ROOT, 'js', 'reference-data.js'), 'utf8').matchAll(/\{n:'((?:[^'\\]|\\.)*)',u:'([^']*)'/g)].map((m) => [m[2], m[1].replace(/\\'/g, "'")]));
async function checkGovernance(fail) {
  const S = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'histsurveys')).filter((n) => n.endsWith('.mjs'))) {
    const m = await import(pathToFileURL(path.join(ROOT, 'scripts', 'histsurveys', f)).href); if (m.SOURCE) S[m.SOURCE.key] = m.SOURCE;
  }
  const rows = ROW_BY_URL;
  for (const G of HIST_ADMIN_GAPS.filter((g) => g.derived === false)) {
    if (!fs.existsSync(path.join(ROOT, G.file))) continue;
    const d = loadBundle(G.file), decl = (GOVERNANCE[G.file] || {}).upstreams || [];
    const want = Object.keys(d.sources || {}).map((k) => S[k]).filter(Boolean);
    if (decl.length !== want.length) fail.push(G.file + ': GOVERNANCE names ' + decl.length + ' publisher(s), the bundle credits ' + want.length + ' — rewrite the literal from scripts/histsurveys/*.mjs SOURCE');
    for (const w of want) {
      const u = decl.find((x) => x.url === w.url);
      if (!u) { fail.push(G.file + ': GOVERNANCE does not declare ' + w.publisher); continue; }
      for (const k of ['publisher', 'licence', 'licenceUrl']) if (u[k] !== w[k]) fail.push(G.file + ': GOVERNANCE ' + k + ' of ' + w.key + ' is «' + u[k] + '», its harvester says «' + w[k] + '»');
      if (u.paidBy && rows.get(w.url) !== u.paidBy) fail.push(G.file + ': paidBy of ' + w.key + ' is not the js/reference-data.js row at ' + w.url);
    }
  }
}
async function check() {
  const fail = [], said = [];
  await checkGovernance(fail);
  for (const G of HIST_ADMIN_GAPS.filter((g) => g.derived === false)) {
    const n0 = fail.length;
    checkOne(G, fail);
    if (fail.length === n0) said.push(G.file);
  }
  if (fail.length) { for (const m of fail.slice(0, 20)) console.error('✖ ' + m); process.exit(1); }
  console.log('✓ hist-admin-surveys — ' + said.join(', ') + ': every row dated as its source states it, every publisher licensed and credited, no non-commercial publisher in an open record');
}
function checkOne(G, fail) {
  const ok = (c, m) => { if (!c) fail.push(G.file + ': ' + m); };
  if (!fs.existsSync(path.join(ROOT, G.file))) { fail.push(G.file + ' is missing'); return; }
  const d = loadBundle(G.file);
  ok(d && d.v === 1, 'v must be 1');
  ok(/^\d{4}-\d\d-\d\d$/.test(d.built || ''), 'built must be an ISO date');
  ok(Array.isArray(d.levels) && d.levels.length === 1 && d.levels[0] === LEVEL, 'levels must be [' + LEVEL + ']');
  ok(!G.nonCommercial || d.licence === 'CC BY-NC-SA 4.0', 'a non-commercial record must state its own licence');
  const S = d.sources || {};
  for (const [k, s] of Object.entries(S)) {
    ok(!!s.nonCommercial === !!G.nonCommercial, 'publisher ' + k + (s.nonCommercial ? ' is non-commercial and may not be combined into an open record' : ' is open but sits in the non-commercial record'));
    ok(s.licence && /^https?:/.test(s.licenceUrl || '') && /^https?:/.test(s.licenceStatedAt || ''), 'publisher ' + k + ' must state its licence, its licence URL and where the licence was read');
    ok(s.publisher && s.citation, 'publisher ' + k + ' must name itself and the citation it asks for');
    ok(String(d.src || '').includes(s.publisher), 'src must credit ' + s.publisher);
    ok(ROW_BY_URL.has(s.url), 'publisher ' + k + ' has no js/reference-data.js row at ' + s.url + ' — the sources page would not name what the map draws');
  }
  for (let i = 0; i < d.rings.length; i++) {
    const r = d.rings[i];
    if (!Array.isArray(r) || r.length < 4 || r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) { fail.push(G.file + ': ring ' + i + ' is not a closed ring of 4+ points'); break; }
  }
  const used = new Set();
  d.feats.forEach((f, i) => {
    if (f.length !== 13) { fail.push(G.file + ': feat ' + i + ' has ' + f.length + ' columns, not 13'); return; }
    if (!f[0] || !f[9] || !f[9].en) fail.push(G.file + ': feat ' + i + ' has no name');
    if (!S[f[10]]) fail.push(G.file + ': feat ' + i + ' names publisher «' + f[10] + '», which `sources` does not declare');
    if (!(ymd(f[2], f[3], f[4]) < ymd(f[5], f[6], f[7]))) fail.push(G.file + ': feat ' + i + ' ends before it starts');
    for (const p of f[8]) for (const ri of p) { if (!(ri >= 0 && ri < d.rings.length)) fail.push(G.file + ': feat ' + i + ' points outside the ring pool'); used.add(ri); }
    /* ⚠ THE RECORD NEVER STATES A DAY ITS PUBLISHER DID NOT. A row whose publisher states only a year
       opens on 1 January of it (the tiers' reading of «1867») — any other day would be invented. */
    const dt = d.dates && d.dates[i];
    if (!dt || !dt.start || !dt.start.raw) { fail.push(G.file + ': feat ' + i + ' carries no source date'); return; }
    if (!dt.start.derived) {
      const mm = /^(-?\d+)(?:-(\d\d))?(?:-(\d\d))?$/.exec(dt.start.raw) || [];
      const [y, m, dd] = [Number(mm[1]), mm[2] ? Number(mm[2]) : 0, mm[3] ? Number(mm[3]) : 0];
      if (y !== f[2] || (m && m !== f[3]) || (dd && dd !== f[4]) || (!m && (f[3] !== 1 || f[4] !== 1))) fail.push(G.file + ': feat ' + i + ' opens on ' + f.slice(2, 5).join('-') + ' but its publisher states ' + dt.start.raw);
    }
  });
  ok(used.size === d.rings.length, 'every pooled ring must be used (' + used.size + ' of ' + d.rings.length + ')');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.includes('--check')) check().catch((e) => { console.error('FAILED', e); process.exit(1); });
  else main().catch((e) => { console.error('FAILED', e); process.exit(1); });
}
