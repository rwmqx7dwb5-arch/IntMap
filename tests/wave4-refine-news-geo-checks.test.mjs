/* ============================================================================
 *  wave4-refine — the news edition, world flows, company ties and the geometry under the nearest-site regions
 *  (js/gis-geometry.js · js/gis-ops.js · js/news-edition-core.js · js/news-edition.js · js/news-events.js ·
 *   js/world-flows-core.js · js/world-flows.js · js/company-ties.js · js/card-clearance.js)
 * ----------------------------------------------------------------------------
 *  Each block was written against the code as it stood and was RED there, for the reason its first line names:
 *    ① a window round the world (box(−180,−10,180,10)) gave the nearest-site regions ok:true with 0 rows — the −180 → 180
 *       edge was read as the seam and the band folded to a line; a polar cap the same; Antarctica's ring was refused;
 *    ② a run that loses ground without any step failing by name is reconciled against the window, not reported whole;
 *    ③ «new since your last visit» is what ARRIVED (first_seen_at) — the mark and the server count read one column;
 *    ④ the server is asked the same window rule as the edition, null first_published_at included;
 *    ⑤ the framing box is the shortest stretch of longitude (Fiji + Samoa is not the whole world);
 *    ⑥ a record is read at the INSTANT it states (2024-03-01 is not mid-2024);
 *    ⑦ company ties: no «0 of 0 (null%)», a list cut only when asked, and the shading that could not be drawn is counted;
 *    ⑧ an archive day chip is worded in UTC.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from '../scripts/lib/import-module.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import * as N from '../js/news-edition-core.js';
import * as C from '../js/world-flows-core.js';
import { frameBox } from '../js/card-clearance.js';
import { summaryText, shown, shadeCount } from '../js/company-ties.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(rd(p));

/* world flows' card module, its browser collaborators replaced at the import edges (as tests/wave4-mobility-checks does) */
const clock = { ms: null, sets: [], on: () => () => {}, isLive() { return this.ms == null; }, nowMs() { return this.ms == null ? Date.now() : this.ms; },
  year() { return new Date(this.nowMs()).getFullYear(); }, isPresentYear: (y) => y >= new Date().getFullYear(),
  set(d) { this.sets.push(+d); }, setYear() { this.sets.push('year'); }, setNow() { this.sets.push('now'); } };
const WF = await importModule('js/world-flows.js', {
  mocks: {
    'js/chronos.js': { IntMapTime: clock },
    'js/geo-engine.js': { IntMapGeoEngine: { hasRenderer: () => false, events: { on: () => {} } } },
    'js/fetch-deadline.js': { jsonWithin: async (p) => json(p) },
    'js/host-door.js': { whenHost: async () => ({ lang: 'en', imToast: () => {} }) },
  },
});

/* the GIS layer, booted as tests/gis-voronoi-checks.test.mjs boots it */
async function gis() {
  const { installWindow } = await import('./helpers/geo-shared.mjs');
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisVoronoi } = await import('../js/gis-voronoi.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(); makeGisVoronoi(); const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  return { w, data, geometry, ops };
}
const P = (ring) => ({ type: 'Polygon', coordinates: [ring] });
const box = (W, S, E, N) => [[W, S], [E, S], [E, N], [W, N], [W, S]];
const pt = (lng, lat) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
const feat = (g) => ({ type: 'Feature', properties: {}, geometry: g });
async function voronoi(B, sites, wins) {
  const s = B.data.add({ title: 's', features: sites }), x = B.data.add({ title: 'w', features: wins.map(feat) });
  return B.ops.run({ op: 'voronoi', inputs: [s.id, x.id] });
}
const areaOf = (r) => r.dataset.features().reduce((a, f) => a + f.properties._areaKm2, 0);

test('① a band, a polar cap and Antarctica, stated by their full parallels, are the ground they state', async () => {
  const B = await gis();
  const band = P(box(-180, -10, 180, 10));
  /* the kernel: a shape inside the band meets it, a point in it is in it */
  const hit = B.geometry.attempt.intersection(P(box(0, -5, 90, 5)), band);
  assert.equal(hit.ok, true);
  assert.ok(hit.geometry, 'a box inside the band met nothing — the band was folded into a line at the seam');
  assert.ok(Math.abs(B.ops.areaKm2(hit.geometry) - B.ops.areaKm2(P(box(0, -5, 90, 5)))) < 1, 'the intersection is the inner box');
  assert.equal(B.geometry.pointInGeometry([0, 0], band), true);
  /* a shape across the seam meets the band on BOTH sides of it */
  const seam = B.geometry.attempt.intersection(P([[170, -5], [-170, -5], [-170, 5], [170, 5], [170, -5]]), band);
  assert.equal(seam.geometry && seam.geometry.type, 'MultiPolygon', 'a seam-crossing box inside the band lost one side');
  assert.ok(Math.abs(B.ops.areaKm2(seam.geometry) - 2 * B.ops.areaKm2(P(box(170, -5, 180, 5)))) < 1);

  /* the op the defect was reported on: three sites on the equator, the band as the window */
  const r = await voronoi(B, [pt(0, 0), pt(120, 0), pt(-120, 0)], [band]);
  assert.equal(r.ok, true, 'refused: ' + r.why);
  assert.equal(r.dataset.features().length, 3, 'every site has a region in a window round the world');
  assert.equal(r.stats.sitesOutsideWindow, 0);
  assert.ok(Math.abs(areaOf(r) - B.ops.areaKm2(band)) / B.ops.areaKm2(band) < 1e-9, 'the regions add up to the band');
  assert.equal(r.stats.windowsNotCovered, 0);
  /* a polar cap written the same way */
  const cap = await voronoi(B, [pt(0, 60), pt(120, 60), pt(-120, 60)], [P(box(-180, 75, 180, 90))]);
  assert.equal(cap.dataset.features().length, 3);
  /* Antarctica as Natural Earth writes it — the pole edge −180 → 180 at −90 — is no longer refused */
  const ant = P([[-180, -90], [180, -90], [180, -70], [90, -66], [0, -70], [-90, -72], [-180, -70], [-180, -90]]);
  const ar = await voronoi(B, [pt(166.7, -77.8), pt(0, -90), pt(-68.1, -67.6), pt(77.97, -68.58)], [ant]);
  assert.equal(ar.ok, true, 'Antarctica was refused: ' + ar.why);
  assert.equal(ar.dataset.features().length, 4);
  /* clip reads the same kernel: points in the band are kept, not silently dropped */
  const s = B.data.add({ title: 'p', features: [pt(0, 0), pt(50, 5), pt(0, 40)] }), w = B.data.add({ title: 'b', features: [feat(band)] });
  const c = await B.ops.run({ op: 'clip', inputs: [s.id, w.id] });
  assert.equal(c.ok, true);
  assert.equal(c.dataset.features().length, 2, 'clip by a band kept ' + c.dataset.features().length + ' of the 2 points inside it');
  /* and what is still refused is a ring that goes round a pole without saying which */
  assert.equal(B.geometry.attempt.union([P([[0, 80], [90, 85], [180, 80], [-90, 89], [0, 80]])]).why, 'geometry-wraps-world');
  /* a ring that writes one vertex twice across the seam reads exactly as before (the seam reading wins whenever it is a ring) */
  assert.deepEqual(B.geometry.unwrapRing([[170, 10], [180, 10], [-180, 10], [-170, 10], [-170, -10], [-180, -10], [180, -10], [170, -10]]).map((p) => p[0]),
    [170, 180, 180, 190, 190, 180, 180, 170]);
});

test('② ground lost without a named failure is reconciled against the window — not reported as a whole answer', async () => {
  const B = await gis();
  const real = B.geometry;
  /* a kernel whose intersection «succeeds» with nothing — the shape the band defect had */
  B.w.IntMapGisGeometry = Object.assign({}, real, { attempt: Object.assign({}, real.attempt, { intersection: () => ({ ok: true, geometry: null }) }) });
  const none = await voronoi(B, [pt(0, 0), pt(40, 0)], [P(box(-20, -20, 60, 20))]);
  assert.equal(none.ok, false, 'a run that covered none of its window reported ok');
  assert.equal(none.why, 'geometry-failed');
  assert.equal(none.detail.detail && none.detail.detail.stage, 'window-coverage');
  /* part of it: the pieces west of 20°E come back empty */
  B.w.IntMapGisGeometry = Object.assign({}, real, { attempt: Object.assign({}, real.attempt, {
    intersection: (a, b) => { const r = real.attempt.intersection(a, b); const xs = a.coordinates[0].map((p) => p[0]); return Math.max(...xs) <= 20 ? { ok: true, geometry: null } : r; } }) });
  const part = await voronoi(B, [pt(0, 0), pt(40, 0)], [P(box(-20, -20, 60, 20))]);
  assert.equal(part.ok, true);
  assert.ok(part.stats.geometryFailed >= 1, 'the lost ground left no trace');
  assert.equal(part.stats.windowsNotCovered, 1);
  assert.equal(part.stats.farthestBoundKm, null, 'a bound was claimed over ground that was not computed');
  assert.equal(part.stats.farthestBoundWhy, 'regions-not-computed');
  B.w.IntMapGisGeometry = real;
});

test('③ «new since your last visit» is what arrived since then — one column for the mark and the count', () => {
  const seen = Date.parse('2026-10-05T12:00:00Z');
  const row = (id, pub, seenAt) => ({ public_id: id, representative_title: id, first_published_at: pub, first_seen_at: seenAt, last_article_at: '2026-10-05T20:00:00Z', independent_source_count: 1, article_count: 1 });
  const ed = N.buildEdition([
    row('late-ingest', '2026-10-05T11:00:00Z', '2026-10-05T12:30:00Z'),   /* published before the visit, reached IntMap after it */
    row('early', '2026-10-05T11:00:00Z', '2026-10-05T11:05:00Z'),
    row('backdated', '2026-10-05T13:00:00Z', '2026-10-05T11:59:00Z'),    /* a later timestamp on something already on the map */
  ], { sinceMs: Date.parse('2026-10-05T00:00:00Z'), untilMs: Date.parse('2026-10-06T00:00:00Z'), seenMs: seen });
  const mark = Object.fromEntries(ed.events.map((e) => [e.id, e.sinceSeen]));
  assert.deepEqual(mark, { 'late-ingest': true, early: false, backdated: false });
  assert.equal(N.ARRIVAL_COL, 'first_seen_at');
  /* the server's count asks the same column (js/news-events.js) */
  const src = codeOnly(rd('js/news-events.js'));
  assert.match(src, /\.gt\(ARRIVAL_COL, new Date\(seen\)\.toISOString\(\)\)/);
  assert.doesNotMatch(src, /\.gt\('first_published_at'/);
});

/* the window rule, evaluated the way PostgREST evaluates the `or` expression the page sends */
function evalFilter(expr, row) {
  let i = 0;
  const parseList = () => { const out = []; for (;;) { out.push(parseTerm()); if (expr[i] === ',') { i++; continue; } break; } return out; };
  const parseTerm = () => {
    const m = /^(and|or)\(/.exec(expr.slice(i));
    if (m) { i += m[0].length; const xs = parseList(); assert.equal(expr[i], ')'); i++; return { op: m[1], xs }; }
    const t = /^([a-z_]+)\.(lt|gte|is)\.("[^"]*"|null)/.exec(expr.slice(i)); assert.ok(t, 'unparsed at ' + expr.slice(i));
    i += t[0].length; return { col: t[1], cmp: t[2], v: t[3] === 'null' ? null : Date.parse(t[3].slice(1, -1)) };
  };
  const ev = (n) => {
    if (n.op === 'and') return n.xs.every(ev);
    if (n.op === 'or') return n.xs.some(ev);
    const x = row[n.col] == null ? null : Date.parse(row[n.col]);
    if (n.cmp === 'is') return x == null;
    if (x == null) return false;   /* SQL: a comparison with NULL is not true */
    return n.cmp === 'lt' ? x < n.v : x >= n.v;
  };
  const tree = parseTerm(); assert.equal(i, expr.length); return ev(tree);
}

test('④ the server is asked the edition\'s own window rule, rows with no first_published_at included', () => {
  const win = { sinceMs: Date.parse('2026-10-05T00:00:00Z'), untilMs: Date.parse('2026-10-06T00:00:00Z') };
  const f = N.windowFilter(win);
  const r = (id, pub, seen, last) => ({ public_id: id, representative_title: id, first_published_at: pub, first_seen_at: seen, last_article_at: last, independent_source_count: 1, article_count: 1 });
  const rows = [
    r('no-publish-time', null, '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z'),
    r('no-times-but-seen', null, '2026-10-05T09:00:00Z', null),
    r('no-last', '2026-10-05T03:00:00Z', '2026-10-05T03:01:00Z', null),
    r('before', '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z', '2026-10-04T23:00:00Z'),
    r('after', '2026-10-06T01:00:00Z', '2026-10-06T01:00:00Z', '2026-10-06T02:00:00Z'),
    r('through', '2026-10-04T10:00:00Z', '2026-10-04T10:00:00Z', '2026-10-07T00:00:00Z'),
    r('null-publish-seen-after', null, '2026-10-06T03:00:00Z', null),
  ];
  const server = rows.filter((x) => evalFilter(f, x)).map((x) => x.public_id).sort();
  const edition = N.buildEdition(rows, win).events.map((e) => e.id).sort();
  assert.deepEqual(server, edition, 'the server and the edition keep different rows');
  assert.ok(server.includes('no-publish-time') && server.includes('no-last'), 'a null column dropped the row at the server');
  const page = codeOnly(rd('js/news-edition.js'));
  assert.match(page, /\.or\(windowFilter\(win\)\)/, 'js/news-edition.js sends the rule from the core');
  assert.doesNotMatch(page, /\.lt\('first_published_at'/);
});

test('⑤ the framing box is the shortest stretch of longitude, shared by the edition and world flows', () => {
  /* Fiji and Samoa: 10° apart across 180°, not 350° the other way */
  const fs = frameBox([[178, -18], [-172, -14]]);
  assert.deepEqual(fs, [[178, -18], [188, -14]]);
  assert.deepEqual(frameBox([[10, 0], [20, 5]]), [[10, 0], [20, 5]]);
  /* an arc unwrapped past 180° and the raw position of its far end are one stretch */
  const tokyoSf = C.arcLine([139.7, 35.7], [-122.4, 37.8]);
  const b = frameBox([tokyoSf, [-122.4, 37.8], [139.7, 35.7]]);
  assert.ok(b[1][0] - b[0][0] < 120, 'Tokyo → San Francisco framed ' + (b[1][0] - b[0][0]).toFixed(1) + '° wide');
  /* four points a quarter-turn apart: three quarters of the world, whichever quarter is left out */
  const q = frameBox([[0, 0], [90, 0], [180, 0], [-90, 0]]);
  assert.equal(q[1][0] - q[0][0], 270);
  /* an arc as wide as the world is the world */
  assert.deepEqual(frameBox([[[-170, 0], [10, 0], [190, 0]]]), [[-180, 0], [180, 0]]);
  assert.equal(frameBox([]), null);
  for (const f of ['js/news-edition.js', 'js/world-flows.js']) assert.match(codeOnly(rd(f)), /frameBox\(/, f + ' frames with the shared box');
});

test('⑥ a record is read at the instant it states, not at its year', async () => {
  const IDX = json('data/world-flows.json'), P = C.placeIndex(IDX), mex = P.byCode.get('MEX'), jpn = P.byCode.get('JPN');
  const at = (s) => Date.parse(s);
  /* DESA's stock is as at 1 July: on 1 March 2024 the latest stock is mid-2020 */
  assert.equal(C.yearFor(IDX.migration.years, at('2024-03-01T00:00:00Z'), C.midYearMs).year, 2020);
  assert.equal(C.yearFor(IDX.migration.years, at('2024-07-01T00:00:00Z'), C.midYearMs).year, 2024);
  assert.deepEqual(C.yearFor([1990, 2000], at('1990-03-01T00:00:00Z'), C.midYearMs), { year: null, reason: 'before-record', first: 1990, firstMs: C.midYearMs(1990) });
  /* June 2014's route table holds once June is over */
  assert.equal(C.heldFromMs('2014-06'), at('2014-07-01T00:00:00Z'));
  assert.equal(C.heldFromMs('2014'), at('2015-01-01T00:00:00Z'));
  /* a cable whose ready-for-service year is the clock's year is not claimed in service, and is reported apart */
  const meta = json('data/subcables-meta.json');
  const y = 2020, cc = P.rows[jpn].a2;
  const same = Object.values(meta.cables).filter((c) => !c.isPlanned && c.rfsYear === y && (c.countryCodes || []).includes(cc)).length;
  assert.ok(same > 0, 'the record holds a Japanese cable of ' + y + ' (the case this is about)');
  const mid = C.cablePartners(meta, P, jpn, Date.UTC(y, 2, 1)), end = C.cablePartners(meta, P, jpn, Date.UTC(y + 1, 0, 1));
  assert.equal(mid.sameYear, same);
  assert.equal(end.systems - mid.systems, same, 'the systems of ' + y + ' are counted once the year is over');
  /* the card's module, at the clock of the report */
  clock.ms = at('2024-03-01T00:00:00Z');
  const r = await WF.read('migration', mex, 'out', clock.ms);
  assert.equal(r.year, 2020, 'a clock at 2024-03-01 read the mid-2024 stock');
  clock.ms = null;
  /* Atlas naming a year reads it where a tap would put the clock (1 July), and moves the clock to that instant */
  const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), L: (en) => en, warn: (s) => s, note: (s) => s, HOST: { lang: 'en' } };
  const a = await WF.atlas({ country: 'MEX', kind: 'migration', year: 2020 }, K);
  assert.equal(a.meta.worldFlows.readings[0].year, 2020);
  assert.match(a.meta.worldFlows.readings[0].caveat, /present-day borders/, 'the card says the estimate is within present-day borders');
  assert.match(codeOnly(rd('js/world-flows.js')), /現在の国境による推計/);
});

test('⑦ company ties: no share of nothing, a list cut only when asked, unshaded countries counted', () => {
  const t = (en) => en;
  const empty = { kind: 'world', sites: 0, cross: { sites: 0, companies: 0, share: null }, pairs: [] };
  const s = summaryText(empty, t, (c) => c);
  assert.doesNotMatch(s, /null|0 of 0/, 'the empty reading said: ' + s);
  const R = { kind: 'world', sites: 10, cross: { sites: 6, companies: 3, share: 60 }, pairs: Array.from({ length: 40 }, (_, k) => ({ from: 'A' + k, to: 'B', nCompanies: 40 - k, sites: 1 })) };
  const cut = shown(R, 25);
  assert.equal(cut.pairs.length, 25); assert.deepEqual(cut.listed, { shown: 25, of: 40 });
  assert.equal(shown(R).pairs.length, 40, 'without a length the whole list comes back');
  const C1 = { kind: 'country', cc: 'JPN', partners: [{ cc: 'USA' }, { cc: 'DEU' }] };
  assert.deepEqual(shadeCount(C1, null), { wanted: 3, drawn: 0, missing: ['JPN', 'USA', 'DEU'], outlines: false });
  const geo = { features: [{ properties: { __code: 'JPN' } }, { properties: { __code: 'USA' } }] };
  assert.deepEqual(shadeCount(C1, geo).missing, ['DEU']);
});

test('⑧ an archive day chip is worded as the UTC day it is', () => {
  const src = codeOnly(rd('js/news-edition.js'));
  assert.doesNotMatch(src, /T12:00:00Z/, 'a chip worded from noon UTC in the reader\'s zone is the next day from UTC+12');
  assert.match(src, /const fmtUtcDay = \(day\) => \{[^\n]*timeZone: 'UTC'/);
  assert.match(src, /backDays\(now\)\.map\(\(d\) => \[d, fmtUtcDay\(d\)\]\)/);
});
