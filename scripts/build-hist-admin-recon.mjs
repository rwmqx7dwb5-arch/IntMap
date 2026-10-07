#!/usr/bin/env node
/* ==========================================================================
 * scripts/build-hist-admin-recon.mjs   (hist-reconstruction)
 *
 * data/hist-admin-recon.js — FIRST-LEVEL UNITS INTMAP RECONSTRUCTS ITSELF, where no published record
 * (OpenHistoricalMap, a publisher's dated atlas) answers and the present-day outline cannot simply be
 * carried back (data/hist-admin-fill.js refuses: «undated», «before-set-floor», a layout that no longer
 * exists).
 *
 * ══ THE METHOD (approved on the Meiji pilot, scripts/histrecon/build-meiji-v2.mjs) ════════════════════
 *   A unit on a span is a UNION OF ATOMS — finer units whose boundaries are the historical lines — and
 *   every membership is a stated fact with a citation. Nothing is drawn by hand, smoothed, interpolated
 *   or guessed. The facts live in one dossier per country (scripts/histrecon/dossiers/<ISO3>.json,
 *   format in docs/HIST-RECONSTRUCTION.md); scripts/histrecon/dossier-check.mjs refuses a dossier unless
 *     ③ every atom belongs to exactly one unit at every instant (or is named outside / unresolved),
 *     ② the number of units equals what the sources state on their dates,
 *     ④ every span cites a source,
 *   and this file measures what needs geometry:
 *     · test 3 (the SAME test data/hist-admin-fill.js applies, imported, not copied): the ground must lie
 *       in a polity the era map draws on that date, and not straddle two — the dossier's claim about the
 *       country is checked against the map the reader sees;
 *     · test 4: a span yields to OpenHistoricalMap and to every publisher's record (answeredSpans, the
 *       shared yield) — a reconstruction is the weaker claim wherever a dated record states the unit.
 *   What a test withholds is reported with its reason; nothing disappears silently.
 *
 * ══ PRECEDENCE ═══════════════════════════════════════════════════════════════════════════════════════
 *   OpenHistoricalMap > publishers' records > THIS RECORD > the present-day outline carried back.
 *   The fill yields to this record (recordFiles() in build-hist-admin-fill.mjs reads HIST_ADMIN_GAPS'
 *   `reconstructed` flag): a cited timeline outranks «Wikidata says the name was founded in D».
 *
 * ══ PRECISION ════════════════════════════════════════════════════════════════════════════════════════
 *   Atoms are read at the precision their publisher released (Natural Earth 10m at full precision, not the
 *   0.01° data/admin1-world.json.gz). The bundle is simplified to data/hist-admin1.js's tolerance for the
 *   overview only; data/border-detail serves the unsimplified union when the reader zooms in.
 *
 * Usage:  node scripts/build-hist-admin-recon.mjs [--only ISO3] [--report <file.json>]
 *         node scripts/build-hist-admin-recon.mjs --check      verify dossiers + committed bundle, offline (atom ids from the catalogue lock)
 *         node scripts/build-hist-admin-recon.mjs --lock       rewrite only the catalogue lock (reads the atom sets)
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { cacheDir } from './histrecon/atoms/ne-admin1.mjs';
import { withheldFile } from './histrecon/withheld-file.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pc from 'polygon-clipping';
import turfUnion from '@turf/union';
import { simplifyGeoJSON } from './lib/elections-geo.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';
import { checkDossier, norm, atomCountriesOf, catalogueView } from './histrecon/dossier-check.mjs';
import { datasetOf } from './histrecon/atoms/geoboundaries.mjs';
import { hitMask, answeredSpans, eraIndex, recordUnits, recordFiles, LOCATED_MIN, STRADDLE_MAX, OVERLAP_MIN } from './build-hist-admin-fill.mjs';
import { applyAnnex, annexProblems } from './histrecon/annex.mjs';   /* (hist-findings-sweep) ground an assembler's atoms do not hold — scripts/histrecon/annex/<KEY>.json */
import { samplePointsFast as samplePoints } from './histrecon/sample-points.mjs';   /* the fill's samplePoints, by scanline — identical points (scripts/histrecon/sample-points.mjs) */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIERS = path.join(ROOT, 'scripts', 'histrecon', 'dossiers');
const ATOMS = path.join(ROOT, 'scripts', 'histrecon', 'atoms');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ONLY = argOf('--only', null);
const G = HIST_ADMIN_GAPS.find((g) => g.reconstructed);
const LEVEL = 4;
const REPO = 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/';

/* ── geoBoundaries datasets in use, read from the dossiers. The licence is per dataset (public domain, CC BY,
   CC BY IGO, ODbL, CC BY-SA …). LICENSE §5: a record derived from a share-alike source is offered under THAT
   licence — so each record's sources entry names its datasets and their licences, and the governance record
   lists one upstream per licence. ─────────────────────────────────────────────────────────────────────── */
const LICENCE_URL = [
  [/Open Database License/i, 'https://opendatacommons.org/licenses/odbl/1-0/'],
  [/Public Domain Dedication and License|PDDL/i, 'https://opendatacommons.org/licenses/pddl/1-0/'],
  [/CC0/i, 'https://creativecommons.org/publicdomain/zero/1.0/'],
  [/ShareAlike 4.0/i, 'https://creativecommons.org/licenses/by-sa/4.0/'],
  [/ShareAlike 3.0/i, 'https://creativecommons.org/licenses/by-sa/3.0/'],
  [/ShareAlike 2.0/i, 'https://creativecommons.org/licenses/by-sa/2.0/'],
  [/3.0 Intergovernmental|3.0 IGO/i, 'https://creativecommons.org/licenses/by/3.0/igo/'],
  [/Attribution 4.0/i, 'https://creativecommons.org/licenses/by/4.0/'],
  [/Attribution 3.0/i, 'https://creativecommons.org/licenses/by/3.0/'],
  [/Attribution 2.5 India/i, 'https://creativecommons.org/licenses/by/2.5/in/'],
  [/Attribution 2.5/i, 'https://creativecommons.org/licenses/by/2.5/'],
  [/Open Government Licence v3/i, 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'],
  [/Open Government Canada/i, 'https://open.canada.ca/en/open-government-licence-canada'],
  [/Etalab/i, 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/'],
  [/Data license Germany/i, 'https://www.govdata.de/dl-de/by-2-0'],
  [/swisstopo/i, 'https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices'],
  [/ShareAlike 4.0/i, 'https://creativecommons.org/licenses/by-sa/4.0/'],
];
export function licenceUrlOf(licence) { for (const [re, u] of LICENCE_URL) if (re.test(licence)) return u; return null; }
const isPublicDomain = (l) => /^Public Domain$|CC0|PDDL|Public Domain Dedication/i.test(l);
export const isShareAlike = (l) => /Open Database License|ShareAlike/i.test(l);
/** [{ iso, level, …manifest entry }] a dossier draws on, when its atom set is a geoBoundaries one */
export function gbDatasetsOf(D) {
  const m = /^gb-(adm[123])@/.exec(D.atomSet || '');
  if (!m) return [];
  const level = m[1].toUpperCase();
  return atomCountriesOf(D).map((iso) => ({ iso, level, ...(datasetOf(iso, level) || {}) })).filter((d) => d.licence);
}
/* the one js/reference-data.js row that credits every geoBoundaries dataset: it links to the list of each dataset's original
   publisher and licence (the manifest, and each record's sources entry) — CC BY 4.0 §3(a)(1) allows credit by such a URI */
export const GB_ROW = 'geoBoundaries (William & Mary geoLab) — national boundary datasets used as parts of the reconstructed historical divisions';
/* the atom modules and the dossiers, read once: an atom set that is neither Natural Earth, RISTAT nor geoBoundaries
   states its own credit (SOURCE.creditRow) and the geoBoundaries datasets it reads (GB_PARTS). ⚠ GOVERNANCE below
   must stay pure data (scripts/data-governance.mjs evaluates it sliced out of this file — a call is «unreadable»,
   measured 2026-10-06), so these derivations are what tests/hist-recon-expand-checks.test.mjs compares that literal
   with: every credit row and every licence the dossiers actually use must be declared. */
const ATOM_MODULES = await Promise.all(fs.readdirSync(ATOMS).filter((n) => n.endsWith('.mjs')).sort().map((n) => import(pathToFileURL(path.join(ATOMS, n)).href)));
const DOSSIERS_READ = fs.existsSync(DOSSIERS) ? fs.readdirSync(DOSSIERS).filter((x) => x.endsWith('.json')).sort().map((n) => JSON.parse(fs.readFileSync(path.join(DOSSIERS, n), 'utf8'))) : [];
const SETS_USED = new Set(DOSSIERS_READ.map((D) => D.atomSet));
const OWN_CREDIT_MODULES = ATOM_MODULES.filter((m) => m.SET && SETS_USED.has(m.SET) && m.SOURCE && m.SOURCE.creditRow);
export function moduleUpstreams() {
  return OWN_CREDIT_MODULES.map((m) => ({ publisher: m.SOURCE.publisher, url: m.SOURCE.url, licence: m.SOURCE.licence, licenceUrl: m.SOURCE.licenceUrl,
    attribution: !!m.SOURCE.attribution, creditRequired: !!m.SOURCE.creditRequired, paidBy: m.SOURCE.creditRow }));
}
export function gbUpstreams() {
  const byLic = new Map();
  const add = (d) => { if (!d || !d.licence) return; if (!byLic.has(d.licence)) byLic.set(d.licence, new Set()); byLic.get(d.licence).add(d.iso + ' ' + d.level); };
  for (const D of DOSSIERS_READ) for (const d of gbDatasetsOf(D)) add(d);
  for (const m of OWN_CREDIT_MODULES) for (const p of m.GB_PARTS || []) add({ iso: p.iso, level: p.level, ...(datasetOf(p.iso, p.level) || {}) });
  return [...byLic].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([licence, ds]) => ({
    publisher: 'geoBoundaries (William & Mary geoLab) — gbOpen datasets under ' + licence, url: 'https://www.geoboundaries.org/',
    licence, licenceUrl: licenceUrlOf(licence) || 'https://www.geoboundaries.org/', attribution: !isPublicDomain(licence), creditRequired: !isPublicDomain(licence),
    datasets: [...ds].sort(), offeredUnder: isShareAlike(licence) ? licence : null,
    paidBy: GB_ROW,
  }));
}

/* ⚠ 出自は値である（js/data-governance.js の read() と npm run check:datagov が読む）。 */
export const GOVERNANCE = {
  'data/hist-admin-recon.js': {
    upstreams: [
      { publisher: 'Natural Earth', url: 'https://www.naturalearthdata.com/', licence: 'Public domain',
        licenceUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', attribution: false, creditRequired: false,
        paidBy: 'Natural Earth' },
      { publisher: 'IntMap', url: 'https://github.com/rwmqx7dwb5-arch/IntMap/tree/main/scripts/histrecon', licence: 'IntMap licence (LICENSE)',
        licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/LICENSE', attribution: false, creditRequired: false,
        paidBy: 'IntMap — reconstructed historical first-level divisions: dossiers of cited facts' },
      { publisher: 'Electronic Repository of Russian Historical Statistics (RISTAT)', url: 'https://doi.org/10.34894/NQOASN', licence: 'CC0 1.0 with a request for attribution',
        licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: true, creditRequired: false,
        paidBy: 'Electronic Repository of Russian Historical Statistics (RISTAT) — Russian Empire Historical GIS Maps, 1897 (CC0 1.0)' },
      { publisher: '国土交通省 国土数値情報（行政区域データ N03, 1920）', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2015.html',
        licence: '国土数値情報ダウンロードサイトコンテンツ利用規約（旧国土情報利用約款準拠版）', licenceUrl: 'https://nlftp.mlit.go.jp/ksj/other/agreement_02.html', attribution: true, creditRequired: true,
        paidBy: '国土交通省 国土数値情報 行政区域データ（N03・1920 年 1 月 1 日時点）— 明治の府県の復元の部品' },
      { publisher: '政府統計の総合窓口(e-Stat)', url: 'https://www.e-stat.go.jp/gis', licence: '政府標準利用規約（第2.0版）',
        licenceUrl: 'https://www.e-stat.go.jp/terms-of-use', attribution: true, creditRequired: true,
        paidBy: '政府統計の総合窓口（e-Stat）国勢調査 2020 年 小地域（町丁・字等別）境界データ — 明治の府県の復元で旧村を切り分ける部品' },
      { publisher: 'geoBoundaries (William & Mary geoLab)', url: 'https://www.geoboundaries.org/',
        licence: 'per dataset, as each publisher states (public domain, CC0, CC BY, CC BY IGO, ODbL 1.0, CC BY-SA, OGL …) — scripts/histrecon/atoms/geoboundaries-manifest.json; a record derived from a share-alike dataset is offered under that licence (LICENSE §5)',
        licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/scripts/histrecon/atoms/geoboundaries-manifest.json', attribution: true, creditRequired: true,
        paidBy: GB_ROW },
      { publisher: 'Emre Amasyalı (McGill University)', url: 'https://github.com/emreamasyali/ottoman-anatolia-schooling-hgis', licence: 'CC BY 4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: true, creditRequired: true,
        paidBy: 'Emre Amasyalı (McGill University) — Ottoman Anatolia Schooling HGIS: kaza boundaries c. 1893 (CC BY 4.0), parts of the reconstructed Ottoman provinces' },
    ],
    cadence: 'static',
    cadenceBasis: { observed: 'on 2026-10-05 every atom set is pinned (Natural Earth commit ca96624, RISTAT version 3, N03 1920, e-Stat 2020); the record changes only when the research in a dossier changes', expires: 'when a dossier is revised or an atom set is re-pinned', canon: 'scripts/histrecon/atoms/*.mjs SET and scripts/histrecon/dossiers/*.json' },
    builtBy: 'scripts/build-hist-admin-recon.mjs',
  },
};

const ymd = (iso) => { const [y, m, d] = iso.split('-').map(Number); return y * 10000 + m * 100 + d; };
const isoOf = (v) => { const y = Math.floor(v / 10000), m = Math.floor(v / 100) % 100, d = v % 100; return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
const addDay = (iso) => new Date(Date.parse(iso + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
/* the era outlines' resolution: data/hist-borders.js and CShapes as shipped carry ~19.4 vertices per degree
   (measured by scripts/build-hist-admin-fill.mjs's own comment, #R719) — a vertex every ~0.05°; twice that */
const ERA_RES = 0.1;
const SHIFTS = [[ERA_RES, 0], [-ERA_RES, 0], [0, ERA_RES], [0, -ERA_RES], [ERA_RES, ERA_RES], [ERA_RES, -ERA_RES], [-ERA_RES, ERA_RES], [-ERA_RES, -ERA_RES]];

/* a record unit's sample points do not change during a build — computed once per unit.
   MEASURED 2026-10-06: Belarus 1991 (5 rows) took 6,135 s, 99 % inside samplePoints: every seam test re-sampled the
   record unit beside it, and beside Belarus stand continent-sized units (a 0.1° lattice over their whole box). */
const SAMPLED = new WeakMap();
const samplesOf = (r) => { let p = SAMPLED.get(r); if (!p) { p = samplePoints(r.polys); SAMPLED.set(r, p); } return p; };
/** the smaller of: the share of this unit's sample points the other units cover, and the share of theirs this covers */
function sameUnit(polys, pts, others) {
  let a = 0; const m = new Uint8Array(pts.length);
  for (const r of others) { const h = hitMask(r.polys, pts); for (let i = 0; i < h.length; i++) if (h[i]) m[i] = 1; }
  for (let i = 0; i < m.length; i++) a += m[i];
  let b = 0, n = 0;
  for (const r of others) { const op = samplesOf(r); const h = hitMask(polys, op); n += op.length; for (let i = 0; i < h.length; i++) b += h[i]; }
  return Math.min(pts.length ? a / pts.length : 0, n ? b / n : 0);
}
const dayOf = (v) => Date.parse(isoOf(v) + 'T00:00:00Z') / 864e5;

export function dossierFiles() {
  if (!fs.existsSync(DOSSIERS)) return [];
  return fs.readdirSync(DOSSIERS).filter((n) => /^[A-Z]{3}(-[a-z0-9-]+)?\.json$/.test(n)).sort().map((n) => path.join(DOSSIERS, n));
}
/** reconstructions that hand over finished shapes (scripts/histrecon/assembled/*.mjs: KEY, COUNTRY, candidates()) */
async function assemblers() {
  const dir = path.join(ROOT, 'scripts', 'histrecon', 'assembled');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) out.push(await import(pathToFileURL(path.join(dir, f)).href));
  return out;
}
async function atomModule(set) {
  for (const f of fs.readdirSync(ATOMS).filter((n) => n.endsWith('.mjs'))) {
    const m = await import(pathToFileURL(path.join(ATOMS, f)).href);
    if (m.SET === set) return m;
  }
  throw new Error('no atom module declares SET = ' + set);
}

/** no two dossiers may describe the same land on the same day. On one atom set that is the same atom in
    overlapping scopes (two regions of the Russian Empire split its 1897 uyezds by group); across atom sets it is
    the same present-day country in overlapping scopes — a 1967 dossier on geoBoundaries districts must end where
    the Natural Earth one begins, or the map would carry two answers with seams between them.
    entries: [{ file, D, atoms: the catalogue rows D draws on }] → the refusals, as sentences */
export function sameLandClaims(entries) {
  const bad = [];
  const win = (D) => [norm(D.scope.from), D.scope.to ? addDay(norm(D.scope.to)) : '9999-12-31'];
  const meet = (p, q) => p[0] < q[1] && q[0] < p[1];
  const claim = new Map();
  for (const { file, D, atoms } of entries) {
    const mine = D.atomGroups ? atoms.filter((x) => D.atomGroups.includes(x.group)) : atoms;
    const w = win(D);
    for (const x of mine) {
      const k = D.atomSet + '|' + x.id;
      for (const prev of claim.get(k) || []) if (meet(prev.w, w)) bad.push(file + ': atom ' + x.id + ' is also covered by ' + prev.file + ' in an overlapping scope');
      if (!claim.has(k)) claim.set(k, []);
      claim.get(k).push({ w, file });
    }
  }
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const P = entries[i].D, Q = entries[j].D;
    if (P.atomSet === Q.atomSet) continue;
    const shared = atomCountriesOf(P).filter((c) => atomCountriesOf(Q).includes(c));
    if (shared.length && meet(win(P), win(Q))) bad.push(entries[i].file + ' and ' + entries[j].file + ' both describe ' + shared.join(',') + ' in overlapping scopes on different atom sets');
  }
  return bad;
}

/** the dossiers, each checked; a dossier that fails ③②④ stops the build */
/* ══ THE ATOM CATALOGUE, LOCKED — so that the gate never downloads the atoms ══════════════════════════════════
   ③ (each atom of a country in exactly one unit) needs the list of a country's atoms, not their shapes. The full
   build reads it from the atom sets (Natural Earth, RISTAT, geoBoundaries — gigabytes: the Philippines' ADM3 alone is
   532 MB) and writes the ids it read here; `--check` — which CI runs on every push — reads only this file.
   MEASURED 2026-10-06: `--check` reading the sets ran out of memory at node's default heap on this machine, and on
   CI it would have fetched every country's dataset. If a dossier names a set or country the lock lacks, the gate
   fails and says to run the build — it never falls back to the network. */
export const CATALOGUE_LOCK = path.join(ROOT, 'scripts', 'histrecon', 'atoms', 'catalogue-lock.json');
function readLock() {
  if (!fs.existsSync(CATALOGUE_LOCK)) return null;
  const j = JSON.parse(fs.readFileSync(CATALOGUE_LOCK, 'utf8'));
  const out = {};
  for (const [set, byCountry] of Object.entries(j.sets)) {
    out[set] = {};
    for (const [c, rows] of Object.entries(byCountry)) out[set][c] = rows.map((r) => (Array.isArray(r) ? { id: r[0], group: r[1] } : { id: r }));
  }
  return out;
}
function writeLock(mods) {
  const sets = {};
  for (const [set, { cat, countries }] of [...mods].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    sets[set] = {};
    for (const c of countries.slice().sort()) if (cat[c]) sets[set][c] = cat[c].map((a) => (a.group != null && a.group !== c ? [a.id, a.group] : a.id)).sort((p, q) => (String(p) < String(q) ? -1 : 1));
  }
  fs.writeFileSync(CATALOGUE_LOCK, JSON.stringify({ note: 'The atom ids (and their group where a dossier selects by it) of every atom set and country the dossiers name — written by the full build of scripts/build-hist-admin-recon.mjs, read by its --check (the gate never downloads atoms).', sets }) + '\n');
  console.error('· wrote ' + path.relative(ROOT, CATALOGUE_LOCK) + ' ' + (fs.statSync(CATALOGUE_LOCK).size / 1e6).toFixed(2) + ' MB');
}

export async function loadDossiers({ fromLock = false } = {}) {
  const out = [], mods = new Map(), bad = [];
  const lock = fromLock ? readLock() : null;
  if (fromLock && !lock) bad.push(path.relative(ROOT, CATALOGUE_LOCK) + ' is missing — run node scripts/build-hist-admin-recon.mjs');
  const read = dossierFiles().map((f) => ({ f, D: JSON.parse(fs.readFileSync(f, 'utf8')) })).filter(({ D }) => !ONLY || D.country === ONLY);
  /* an atom set is asked only for the countries its dossiers name (geoBoundaries has 459 datasets) */
  const countriesOf = new Map();
  for (const { D } of read) { if (!countriesOf.has(D.atomSet)) countriesOf.set(D.atomSet, new Set()); for (const c of atomCountriesOf(D)) countriesOf.get(D.atomSet).add(c); }
  for (const [set, cs] of countriesOf) {
    if (fromLock) {
      const cat = (lock && lock[set]) || {};
      for (const c of cs) if (!cat[c]) bad.push('the catalogue lock has no ' + set + ' atoms for ' + c + ' — run node scripts/build-hist-admin-recon.mjs to refresh it');
      mods.set(set, { m: null, countries: [...cs], cat });
    } else { const m = await atomModule(set); mods.set(set, { m, countries: [...cs], cat: await m.catalogue([...cs]) }); }
  }
  if (fromLock && bad.length) return { dossiers: [], mods, bad };
  for (const { f, D } of read) {
    const r = checkDossier(D, mods.get(D.atomSet).cat);
    if (r.err.length) bad.push(path.basename(f) + ': ' + r.err.slice(0, 5).join(' | '));
    out.push({ file: f, D });
  }
  bad.push(...sameLandClaims(out.map(({ file, D }) => ({ file: path.basename(file), D, atoms: catalogueView(D, mods.get(D.atomSet).cat)[D.country] || [] }))));
  return { dossiers: out, mods, bad };
}

/** the union of atoms. polygon-clipping can throw on large unions of many small polygons.
    MEASURED 2026-10-06: «Infinite loop when putting segment endpoints in a priority queue» on 5 of 12 Bangladesh
    division unions of 34–163 upazilas (geoBoundaries ADM3), and «Unable to complete output ring» on 9 of 19 Ottoman
    vilayets. Snapping the coordinates did NOT cure Bangladesh; unioning PAIRWISE (a balanced tree of two-way unions)
    did, and gave the same area as polyclip-ts's one-shot union to the fourth decimal of a square degree for all 12.
    British India's Bengal (the same upazilas among 400+ atoms) failed even pairwise; @turf/union (a declared
    dependency, built on polyclip-ts, the maintained successor of polygon-clipping) completes it.
    So: one-shot → pairwise tree → @turf/union → pairwise on a 1e-9° (≈ 0.1 mm) and then 1e-8° grid — far below any
    surveyed line's precision and the overview's 0.004° — and the step used is reported. Expires if the union library
    is replaced. */
function turfUnionOf(gs) {
  const fc = { type: 'FeatureCollection', features: gs.map((g) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: g } })) };
  const u = turfUnion(fc);
  if (!u) return [];
  return u.geometry.type === 'Polygon' ? [u.geometry.coordinates] : u.geometry.coordinates;
}
export function robustUnion(gs, label, log = console.error, union = (...g) => pc.union(...g), whole = turfUnionOf) {
  if (gs.length === 1) return gs[0];
  const tree = (xs) => { while (xs.length > 1) { const n = []; for (let i = 0; i < xs.length; i += 2) n.push(i + 1 < xs.length ? union(xs[i], xs[i + 1]) : xs[i]); xs = n; } return xs[0]; };
  let e0;
  try { return union(...gs); } catch (e) { e0 = e; }
  try { const u = tree(gs.slice()); log('    union of ' + label + ' computed pairwise (' + e0.message.slice(0, 60) + ')'); return u; } catch { /* next */ }
  try { const u = whole(gs); log('    union of ' + label + ' computed by @turf/union (' + e0.message.slice(0, 60) + ')'); return u; } catch { /* next */ }
  for (const k of [1e9, 1e8]) {
    const snap = (g) => g.map((poly) => poly.map((ring) => {
      const out = [];
      for (const [x, y] of ring) { const p = [Math.round(x * k) / k, Math.round(y * k) / k]; const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); }
      if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
      return out;
    }).filter((r) => r.length >= 4)).filter((p) => p.length);
    try { const u = tree(gs.map(snap)); log('    union of ' + label + ' recomputed pairwise on a ' + (1 / k) + '° grid (' + e0.message.slice(0, 60) + ')'); return u; } catch { /* next grid */ }
  }
  throw new Error('union of ' + label + ' failed even pairwise on a 1e-8° grid: ' + e0.message);
}

/* a union of pinned atoms is the same bytes every build — kept on disk outside the repository, keyed by the atom
   set, the sorted atoms and a digest of their geometry (so a re-pinned or edited atom never reuses a stale union).
   The assembler and fineUnits (data/border-detail) share it. MEASURED 2026-10-06: the unions of Indonesia's and the
   Philippines' regencies took ~55 s and ~900 s per build. */
const unionMemo = new Map();
export function cachedUnion(set, atoms, geom) {
  const sorted = atoms.slice().sort();
  const key = set + '|' + sorted.join(',');
  if (unionMemo.has(key)) return unionMemo.get(key);
  const gs = sorted.map((a) => geom.get(a));
  if (gs.some((g) => !g)) throw new Error('atom without geometry in ' + key.slice(0, 200));
  const h = createHash('sha256').update(key);
  for (const g of gs) h.update(JSON.stringify(g));
  const dir = path.join(cacheDir(), 'recon-unions');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, h.digest('hex').slice(0, 40) + '.json');
  let u;
  if (fs.existsSync(file)) u = JSON.parse(fs.readFileSync(file, 'utf8'));
  else { u = robustUnion(gs, key.slice(0, 120)); fs.writeFileSync(file, JSON.stringify(u)); }
  unionMemo.set(key, u);
  return u;
}

function bboxOf(polys) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}

async function build() {
  const { dossiers, mods, bad } = await loadDossiers();
  if (bad.length) { console.error('✖ dossiers refused:\n  ' + bad.join('\n  ')); process.exit(1); }
  if (!ONLY) writeLock(mods);
  console.error('· ' + dossiers.length + ' dossier(s)');
  const geomOf = new Map();
  for (const [set, { m, countries }] of mods) geomOf.set(set, await m.geometries(countries));
  const era = eraIndex();
  /* the records it yields to — never its own previous build */
  const rec = recordUnits(recordFiles().filter((f) => f !== G.file));
  console.error('· record units consulted for the yield: ' + rec.length);

  /* a union of pinned atoms is the same bytes every build — kept on disk outside the repository, keyed by the
     atom set, the sorted atoms and a digest of their geometry (so a re-pinned or edited atom never reuses a stale
     union). MEASURED 2026-10-06: the unions of Indonesia's and the Philippines' regencies took ~55 s and ~900 s. */
  const unionOf = (set, atoms) => cachedUnion(set, atoms, geomOf.get(set));

  /* ── the candidates: one per (unit, span) — from dossiers (unions of atoms) and from the assemblers in
     scripts/histrecon/assembled/ (a reconstruction that needs more than a union, e.g. Meiji's partly moved
     villages cut with ōaza — it runs its own criteria and hands over finished shapes) ─────────────────── */
  const groups = [];
  for (const { file, D } of dossiers) {
    const scopeEnd = addDay(norm(D.scope.to));
    const list = [];
    for (const u of D.units) for (const [k, s] of u.spans.entries()) {
      list.push({ unit: u, span: s, k, from: ymd(norm(s.from)), to: ymd(s.to != null ? norm(s.to) : scopeEnd),
        polys: () => unionOf(D.atomSet, s.atoms).map((p) => p.filter((r) => r.length >= 4)).filter((p) => p.length) });
    }
    groups.push({ key: path.basename(file, '.json'), country: D.country, file: path.relative(ROOT, file).split(path.sep).join('/'), units: D.units.length, unresolved: (D.unresolved || []).length, list, parts: gbDatasetsOf(D) });
  }
  for (const m of await assemblers()) {
    if (ONLY && m.COUNTRY !== ONLY) continue;
    const g = await m.candidates({ log: (x) => console.error('    ' + x) });
    const list = applyAnnex(m.KEY, g.list, (x) => console.error('    ' + x));
    groups.push({ key: m.KEY, country: m.COUNTRY, file: g.file, units: g.units, unresolved: g.unresolved, list: list.map((c) => ({ ...c, polys: () => c.polys })) });
  }

  const rows = [], report = { built: new Date().toISOString().slice(0, 10), records: {} };
  for (const grp of groups) {
    const t0 = Date.now();
    const R = report.records[grp.key] = { country: grp.country, file: grp.file, units: grp.units, spans: 0, drawn: 0, withheld: [], yielded: 0, unresolved: grp.unresolved };
    for (const c of grp.list) {
      R.spans++;
      const { unit: u, span: s, k, from, to } = c;
      const polys = c.polys();
      const pts = samplePoints(polys);
      const box = bboxOf(polys);
      /* test 3 — the era map must place this ground in one polity on the span */
      const near = era.meeting(box);
      let nearWide = null;
      const hits = near.map((eu) => { const m = hitMask(eu.polys, pts); let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return { n, m }; });
      /* the same points moved by the era outline's own resolution — asked only where the era map places none of
         this ground (below) */
      const shifted = new Map();
      const movedPts = SHIFTS.map(([dx, dy]) => Object.assign(pts.map((p) => [p[0] + dx, p[1] + dy, p[2]]), { vertex: pts.vertex }));
      const nearBy = (q) => {
        if (!shifted.has(q)) shifted.set(q, movedPts.some((mp) => hitMask(nearWide[q].polys, mp).some((h) => h)));
        return shifted.get(q);
      };
      const bps = new Set();
      for (const eu of near) { if (eu.s > from && eu.s < to) bps.add(eu.s); if (eu.e > from && eu.e < to) bps.add(eu.e); }
      if (era.present > from && era.present < to) bps.add(era.present);
      let alive = [], cur = from, last = null;
      for (const stop of [...bps].sort((p, q) => p - q).concat([to])) {
        const present = cur >= era.present;
        let located = 0, best = 0;
        const claimed = new Uint8Array(pts.length);
        for (let q = 0; q < near.length; q++) {
          if (!(near[q].s <= cur && near[q].e > cur && hits[q].n)) continue;
          let own = 0; const m = hits[q].m;
          for (let i = 0; i < pts.length; i++) if (m[i]) { own++; if (!claimed[i]) { claimed[i] = 1; located++; } }
          if (own > best) best = own;
        }
        let answered = present || (located > 0 && (pts.vertex || located / pts.length >= LOCATED_MIN));
        let ok = present ? true : answered ? (located - best) / located <= STRADDLE_MAX : (last ?? false);
        /* ⚠ GROUND THE ERA OUTLINE LEAVES IN THE SEA BY ITS OWN COARSENESS IS NOT GROUND NO POLITY HELD.
           MEASURED 2026-10-05 on the first full build: Conakry, Labuan, San Andrés, Batanes, Cotabato City, Lapu-Lapu
           City and Jervis Bay — capitals, islands and coastal cities the dossiers place with laws — were withheld as
           «no polity on this ground», because the era outlines carry ~19.4 points per degree and their coast passes
           seaward of a peninsula or misses a small island. ⇒ where the era map places NONE of the unit's points, the
           points moved by ERA_RES (twice the era outline's vertex spacing) in eight directions are asked; if exactly
           one polity in force answers, the ground is read as that polity's. Two answering is not resolved this way:
           a unit the coarse lines put between two polities stays withheld (straddle is decided only on real hits). */
        if (!present && located === 0) {
          const by = new Set();
          nearWide ??= era.meeting([box[0] - ERA_RES, box[1] - ERA_RES, box[2] + ERA_RES, box[3] + ERA_RES]);
          for (let q = 0; q < nearWide.length; q++) if (nearWide[q].s <= cur && nearWide[q].e > cur && nearBy(q)) by.add(nearWide[q].id);
          if (by.size === 1) { answered = true; ok = true; }
        }
        if (answered) last = ok;
        if (ok) alive.push([cur, stop]);
        else R.withheld.push({ unit: u.id, span: k, from: isoOf(cur), to: isoOf(stop), why: answered ? 'the era map divides this ground between polities (straddle ' + Math.round((located - best) / located * 100) + '%)' : 'the era map places no polity on this ground', test: 3 });
        cur = stop;
      }
      alive = alive.reduce((acc, iv) => { const l = acc[acc.length - 1]; if (l && l[1] === iv[0]) l[1] = iv[1]; else acc.push(iv.slice()); return acc; }, []);
      /* test 4 — yield to the dated records */
      const ans = answeredSpans(pts, box, rec, from, to);
      for (const iv of ans.spans) {
        const before = alive.reduce((acc, x) => acc + x[1] - x[0], 0);
        alive = alive.flatMap(([p, q]) => (iv[1] <= p || iv[0] >= q) ? [[p, q]] : [[p, iv[0]], [iv[1], q]].filter((x) => x[1] > x[0]));
        if (alive.reduce((acc, x) => acc + x[1] - x[0], 0) !== before) R.yielded++;
      }
      /* ⚠ A LEFTOVER SHORTER THAN A YEAR BESIDE AN ANSWERED SPAN IS A DATE DISAGREEMENT ONLY IF THE RECORD BESIDE IT
         IS THE SAME UNIT. build-hist-admin-surveys.mjs drops every such piece; for a reconstruction that is wrong.
         MEASURED 2026-10-05 on the Meiji record: OpenHistoricalMap's 滋賀県 begins 1872-09-28 — the day 犬上県 was
         merged into it — with the whole of present Shiga, and the rule dropped the seven months before it in which
         滋賀県 was the southern half and 犬上県 the northern: two real units nobody else states, not a seam.
         ⇒ a piece is a seam when the record's unit in force just before or just after it IS this unit: each covers
         at least 1 − OVERLAP_MIN of the other's sample points (the same share answeredSpans uses for «answers»,
         read both ways). ⚠ Not an area ratio: the first version compared areas and read OHM's 滋賀県 (Lake Biwa
         inside) against the 1920 survey's (lake outside) as 1.2 — two outlines of one unit, judged different.
         Otherwise the piece is a different configuration and is kept.
         ⚠ The 1872 case also shows OHM writing a pre-1873 Japanese date in the lunisolar calendar as if Gregorian
         (明治5年9月28日 is 1872-10-30; OHM states 1872-09-28) — this record yields to it by precedence and the
         month is reported, not corrected here. */
      if (ans.spans.length) {
        alive = alive.filter(([p, q]) => {
          if (dayOf(q) - dayOf(p) >= 366) return true;
          /* the record's units in force just before and just after the piece — a seam if EITHER side is this unit */
          const sides = [ans.spans.some((iv) => iv[1] === p) ? p - 1 : null, ans.spans.some((iv) => iv[0] === q) ? q : null].filter((t) => t != null);
          if (!sides.length) return true;
          let ratio = 0, seam = false;
          for (const t of sides) {
            const beside = ans.who.filter((r) => r.s <= t && r.e > t);
            if (!beside.length) continue;
            const x = sameUnit(polys, pts, beside);
            ratio = Math.max(ratio, x);
            if (x >= 1 - OVERLAP_MIN) { seam = true; break; }
          }
          if (seam) R.withheld.push({ unit: u.id, span: k, from: isoOf(p), to: isoOf(q), why: 'a sliver beside a dated record of the same unit (mutual cover ' + ratio.toFixed(2) + '): the two records disagree on the date by < 1 year', test: 4 });
          return !seam;
        });
      }
      for (const [p, q] of alive) {
        rows.push({ country: grp.country, key: grp.key, unit: u, span: s, k, a: p, b: q, polys, dossier: grp.file, parts: grp.parts || [], dates: c.dates || null, startStated: p === from, endStated: q === to && s.to != null });
        R.drawn++;
      }
    }
    console.error('  ' + grp.key + ': ' + R.units + ' units, ' + R.spans + ' spans → ' + R.drawn + ' rows · yielded ' + R.yielded + ' · withheld ' + R.withheld.length + ' · unresolved ' + R.unresolved + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  /* ── the ground the dossiers researched and could not settle (`unresolved` with atoms and a window): not drawn,
     but written to G.withheld so the present-day outline carried back yields to it (js/border-coast.js `withheld`).
     MEASURED 2026-10-06 (hist-recon-expand): without it the fill drew today's Almaty, East Kazakhstan and Kostanay
     regions across 1991–97 — before the 1997 mergers that made those shapes — exactly where the KAZ dossier had
     found the old lines cut through today's districts; the same for Georgia's regions from 1995-01-01 (the last of
     them was created 1995-12-19) and Moldova's raioane from 2003-01-01 (in force 2003-03-21). */
  const withheld = [];
  for (const { file, D } of dossiers) {
    const scopeFrom = norm(D.scope.from), scopeEnd = addDay(norm(D.scope.to));
    for (const u of D.unresolved || []) {
      if (!Array.isArray(u.atoms) || !u.atoms.length) continue;
      let a = u.from != null ? norm(u.from) : scopeFrom, b = u.to != null ? norm(u.to) : scopeEnd;
      if (a < scopeFrom) a = scopeFrom;
      if (b > scopeEnd) b = scopeEnd;
      if (!(a < b)) continue;
      const atoms = u.atoms.filter((x) => geomOf.get(D.atomSet).has(x));
      if (!atoms.length) continue;
      withheld.push({ key: path.basename(file, '.json'), from: ymd(a), to: ymd(b), what: String(u.what || u.unit || '').slice(0, 200),
        /* the atoms side by side, not their union: the fill only asks which of its lattice points lie inside, and a union
           of an enclave belt failed even pairwise (Bangladesh, measured 2026-10-06) */
        polys: atoms.flatMap((x) => geomOf.get(D.atomSet).get(x)).map((p) => p.filter((r) => r.length >= 4)).filter((p) => p.length) });
    }
  }
  return { rows, report, withheld };
}

/** the withheld ground, simplified as the overview is (it is compared with the fill's lattice, never drawn) */
function writeWithheld(withheld, file, tol, dec) {
  /* each atom on its own: an islet the overview's tolerance would erase is kept unsimplified (rounded to the same
     decimals) — this ground is only asked «which lattice points lie inside», never drawn */
  const k = 10 ** dec, round = (polys) => polys.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * k) / k, Math.round(y * k) / k])));
  const one = (poly) => {
    try {
      const fc = simplifyGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: poly } }] }, { tolerance: tol, decimals: dec });
      const g = fc.features[0].geometry;
      return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    } catch { return round([poly]); }
  };
  const out = withheld.map((w) => ({ key: w.key, s: w.from, e: w.to, what: w.what, polys: w.polys.flatMap(one) })).sort((p, q) => p.s - q.s || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
  fs.writeFileSync(file, JSON.stringify({ note: 'Ground the reconstruction dossiers researched and could not settle (their unresolved entries with atoms), per window [s, e) as YYYYMMDD. Never drawn; the present-day outline carried back (scripts/build-hist-admin-fill.mjs) yields to it. Written by scripts/build-hist-admin-recon.mjs.', built: new Date().toISOString().slice(0, 10), tolerance: tol, decimals: dec, units: out }) + '\n');
  console.error('· wrote ' + file + ' ' + (fs.statSync(file).size / 1e6).toFixed(2) + ' MB | ' + out.length + ' withheld windows');
}

/** the full-precision outlines of one record (a dossier's basename or an assembler's KEY), for
    scripts/build-border-detail.mjs: [{ id: unit id, coords: MultiPolygon }] — every span's union, so the
    detail builder can take the one whose simplification IS the shipped row (its byte-for-byte proof). */
export async function fineUnits(recordKey) {
  const out = [];
  for (const f of dossierFiles()) {
    if (path.basename(f, '.json') !== recordKey) continue;
    const D = JSON.parse(fs.readFileSync(f, 'utf8'));
    const geom = await (await atomModule(D.atomSet)).geometries(atomCountriesOf(D));
    for (const u of D.units) for (const s of u.spans) out.push({ id: u.id, coords: cachedUnion(D.atomSet, s.atoms, geom) });
  }
  for (const m of await assemblers()) {
    if (m.KEY !== recordKey) continue;
    for (const c of applyAnnex(m.KEY, (await m.candidates()).list)) out.push({ id: c.unit.id, coords: c.polys });
  }
  return out;
}

/* the overview's simplification is the first tier's: its tolerance, and its decimals where it states them — else 4,
   the same fallback build-hist-admin-surveys.mjs applies to the same bundle.
   ⚠ (hist-reconstruction) MEASURED 2026-10-05: the first version GUESSED the decimals from the first coordinates
   in the file's head; the head is now all `dates`, the guess was Math.max() of nothing = −Infinity, and every
   shipped coordinate came out null (2,005 rows, 458 «distinct» rings that were all [null,null]). */
function readTol() {
  const head = fs.readFileSync(path.join(ROOT, 'data', 'hist-admin1.js'), 'utf8').slice(0, 4000);
  const tol = Number(/"tolerance":([0-9.]+)/.exec(head)[1]);
  const m = /"decimals":(\d+)/.exec(head);
  const dec = m ? Number(m[1]) : 4;
  if (!(tol > 0) || !Number.isInteger(dec)) throw new Error('data/hist-admin1.js: no usable tolerance/decimals (' + tol + ', ' + dec + ')');
  return { tol, dec };
}

function write(rows, file, tol, dec) {
  rows = rows.slice().sort((p, q) => p.a - q.a || (p.country < q.country ? -1 : p.country > q.country ? 1 : p.unit.id < q.unit.id ? -1 : 1));
  const rings = [], ringKey = new Map(), feats = [], dates = {}, sources = {};
  const pool = (r) => { const k = JSON.stringify(r); let i = ringKey.get(k); if (i == null) { i = rings.push(r) - 1; ringKey.set(k, i); } return i; };
  const simplified = new Map();
  rows.forEach((r, i) => {
    let polys = r.polys;
    if (tol > 0) {
      if (!simplified.has(polys)) {
        const fc = simplifyGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] }, { tolerance: tol, decimals: dec });
        const g = fc.features[0].geometry;
        simplified.set(polys, g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
      }
      polys = simplified.get(polys);
    }
    const key = 'recon:' + r.key;
    if (!sources[key]) {
      const parts = (r.parts || []).map((d) => ({ dataset: 'geoBoundaries ' + d.iso + ' ' + d.level, url: d.url, year: d.year, source: d.source, licence: d.licence }));
      const sa = [...new Set(parts.map((p) => p.licence).filter(isShareAlike))];
      sources[key] = { publisher: 'IntMap', title: 'Reconstructed first-level divisions — ' + r.key + ' (one cited fact per membership)', url: REPO + r.dossier,
        citation: 'IntMap reconstruction from cited facts (' + r.dossier + ')' + (parts.length ? '; parts: ' + parts.map((p) => p.dataset + ' (' + p.source + ', ' + p.licence + ')').join('; ') : '') + '.',
        ...(parts.length ? { parts } : {}), ...(sa.length ? { offeredUnder: sa } : {}) };
    }
    const [sy, sm, sd] = isoOf(r.a).split('-').map(Number), [ey, em, ed] = isoOf(r.b).split('-').map(Number);
    const names = { en: r.unit.names.en, ...(r.unit.names.ja ? { ja: r.unit.names.ja } : {}), ...(r.unit.names.local ? { local: r.unit.names.local } : {}) };
    feats.push([r.unit.names.en, LEVEL, sy, sm, sd, ey, em, ed, polys.map((p) => p.map(pool)), names, key, r.unit.id, r.country]);
    const prec = r.span.precision || (String(r.span.from).length === 4 ? 'year' : String(r.span.from).length === 7 ? 'month' : 'day');
    dates[i] = r.dates && r.startStated && r.endStated ? r.dates : {
      start: r.startStated ? { raw: String(r.span.from), precision: prec } : { raw: isoOf(r.a), precision: 'day', derived: true, basis: 'the era map or a dated record changes on this day' },
      end: r.endStated ? { raw: String(r.span.to), precision: String(r.span.to).length === 10 ? 'day' : String(r.span.to).length === 7 ? 'month' : 'year' }
        : { raw: isoOf(r.b), precision: 'day', derived: true, basis: r.span.to == null ? 'the dossier\'s scope ends' : 'the era map or a dated record changes on this day' },
      ...(r.unit.wikidata ? { wikidata: r.unit.wikidata } : {}),
      ...(r.unit.iso ? { iso: r.unit.iso } : {}),
    };
  });
  const data = { v: 1, src: 'IntMap reconstruction: first-level units as unions of finer units — Natural Earth admin-1 (public domain), RISTAT 1897 uyezds (CC0 1.0), geoBoundaries (per dataset: public domain, CC0, CC BY, CC BY IGO, ODbL 1.0, CC BY-SA), Amasyalı kazas (CC BY 4.0), N03 and e-Stat for Japan (CC BY 4.0 compatible) — one cited fact per membership (scripts/histrecon/dossiers); a record derived from a share-alike source is offered under that licence, named in its sources entry (LICENSE §5) · assembled by scripts/build-hist-admin-recon.mjs',
    built: new Date().toISOString().slice(0, 10), tolerance: tol, decimals: dec, levels: [LEVEL], dateSemantics: 'exclusive-end', reconstructed: true, sources, dates, rings, feats };
  fs.writeFileSync(file, 'window.' + G.global + '=' + JSON.stringify(data) + ';\n');
  console.error('· wrote ' + path.relative(ROOT, file) + ' ' + (fs.statSync(file).size / 1e6).toFixed(2) + ' MB | rows ' + feats.length + ' | rings ' + rings.length);
  return data;
}

/* ── --check: the committed dossiers and bundle, offline ───────────────────────────────────────── */
async function check() {
  let fail = 0;
  const F = (m) => { console.log('  ✖ ' + m); fail++; };
  const { dossiers, bad } = await loadDossiers({ fromLock: true });
  for (const b of bad) F('dossier ' + b);
  const file = path.join(ROOT, G.file);
  if (!fs.existsSync(file)) { if (dossiers.length) F(G.file + ' missing while ' + dossiers.length + ' dossier(s) exist'); }
  else {
    const w = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: w });
    const d = w[G.global];
    /* a row names its record by its source key «recon:<record>» — a dossier's basename (one polity may have
       several: RUE-north, RUE-west…) or an assembler's KEY, which states its own units and their spans */
    const byKey = new Map(dossiers.map(({ file, D }) => [path.basename(file, '.json'), D]));
    const asm = new Map();
    for (const m of await assemblers()) if (typeof m.statedSpans === 'function') asm.set(m.KEY, m.statedSpans());
    /* (hist-findings-sweep) the annex ledgers — scripts/histrecon/annex/<KEY>.json, offline */
    for (const m of await assemblers()) for (const p of annexProblems(m.KEY, asm.get(m.KEY))) F(p);
    for (const n of (fs.existsSync(path.join(ROOT, 'scripts', 'histrecon', 'annex')) ? fs.readdirSync(path.join(ROOT, 'scripts', 'histrecon', 'annex')) : []))
      if (!asm.has(n.replace(/\.json$/, ''))) F('scripts/histrecon/annex/' + n + ' names no assembler KEY');
    d.feats.forEach((f, i) => {
      const key = String(f[10] || '').replace(/^recon:/, '');
      const a = f[2] * 10000 + f[3] * 100 + f[4], b = f[5] * 10000 + f[6] * 100 + f[7];
      if (!d.dates[i] || !d.dates[i].start) F('row ' + i + ' has no date record');
      let spans, scopeEnd;
      const D = byKey.get(key);
      if (D) {
        if (D.country !== f[12]) return F('row ' + i + ' names country ' + f[12] + ' but its record ' + key + ' is ' + D.country);
        const u = D.units.find((x) => x.id === f[11]);
        if (!u) return F('row ' + i + ' names unit ' + f[11] + ' which ' + key + ' does not have');
        spans = u.spans; scopeEnd = ymd(addDay(norm(D.scope.to)));
      } else if (asm.has(key)) {
        const st = asm.get(key);
        spans = st.units.get(f[11]);
        if (!spans) return F('row ' + i + ' names unit ' + f[11] + ' which the assembler ' + key + ' does not state');
        scopeEnd = ymd(st.scopeEnd);
      } else return F('row ' + i + ' names record ' + key + ' which no dossier or assembler is');
      const inside = spans.some((s) => ymd(norm(s.from)) <= a && (s.to == null ? scopeEnd : ymd(norm(s.to))) >= b);
      if (!inside) F('row ' + i + ' (' + f[11] + ' ' + a + '…' + b + ') lies outside every span its record states');
    });
    if (!fail) console.log('  ✓ ' + d.feats.length + ' rows, each inside a span its dossier states');
  }
  console.log(fail ? '✖ check:histrecon — ' + fail + ' failure(s)' : '✓ check:histrecon');
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!G) { console.error('HIST_ADMIN_GAPS has no `reconstructed` record (js/border-coast.js)'); process.exit(2); }
  if (args.includes('--check')) await check();
  else if (args.includes('--lock')) {
    const { mods, bad } = await loadDossiers();
    if (bad.length) { for (const b of bad) console.error(b); process.exit(1); }
    writeLock(mods);
  }
  else {
    const { rows, report, withheld } = await build();
    const { tol, dec } = readTol();
    if (!ONLY) write(rows, path.join(ROOT, G.file), tol, dec);
    if (!ONLY && G.withheld) writeWithheld(withheld, withheldFile(), tol, dec);
    const rep = argOf('--report', null);
    if (rep) fs.writeFileSync(rep, JSON.stringify(report, null, 1));
  }
}
