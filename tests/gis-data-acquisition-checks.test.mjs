/* ============================================================================
 *  gis-data-acquisition — a DISCOVERED dataset is not an ANALYSABLE one, and the Atlas can see which stage it is at
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE STATES (audit 2026-11-20 items 5.11 / 6.5; PR #1286's «unresolved»):
 *   ① «found» covered five facts (a catalogue says it exists / we may read it / bytes came / the bytes are real /
 *      it is a dataset) — so an all-nodata grid, a sign-in page and a timeout all looked like «got it» or «nothing»;
 *   ② a window across ±180 was read from ONE file and the other side was NaN;
 *   ③ data behind a login was reported as a network failure, and a slow catalogue as an empty one;
 *   ④ datasets could be found only by words + place + period — not by resolution, cloud, licence, or together with
 *      what the session already holds.
 *
 *  WHAT HAS TO STAY TRUE
 *   A  no one can WRITE «analysable»: it is derived from the stages; a failure cannot be recorded without its reason;
 *   B  every refusal code a reader declares is classified by KIND (a code this table does not know fails here);
 *      `unknown` (could not observe) and `failed` (observed no) are different, as are `blocked` and both;
 *   C  the content is looked at: empty, all-nodata, outside the window, no geometry are NOT «ok»;
 *   D  search filters judge what a record STATES; unstated is kept-and-marked (strict drops it); an unanswered
 *      catalogue is listed with its KIND of silence; held datasets join the same list;
 *   E  acquire() walks the stages and returns the STATE; a login is blocked (never worked around); a window across ±180
 *      is two windows, each read from the item whose own bbox covers it, and the parent says exactly which side is missing.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { codeOnly } = await import('../scripts/code-only.mjs');
const { makeGisPipeline, STAGES } = await import('../js/gis-pipeline.js');
const { makeGisRemote } = await import('../js/gis-remote.js');
const { resolutionOf, textScore, resolutionRelation, searchRecords, words } = await import('../js/gis-catalog-search.js');

/* ── A. the ledger ─────────────────────────────────────────────────────────────────────────────── */

test('A1 «analysable» cannot be written, and a failure cannot be recorded without its reason', () => {
  const P = makeGisPipeline({});
  assert.equal(P.record('x', 'analysis', { status: 'ok' }).ok, false, 'analysis is derived, not a stage anyone sets');
  assert.equal(P.record('x', 'fetched', { status: 'analysable' }).ok, false);
  assert.equal(P.record('x', 'fetched', { status: 'failed' }).ok, false, 'a failed stage must say why');
  assert.equal(P.record('x', 'fetched', { status: 'unknown' }).ok, false, 'an unobserved stage must say why');
  assert.equal(P.record('x', 'fetched', { status: 'pending' }).ok, false, 'pending is the absence of a record');
  assert.equal(P.record('x', 'fetched', { status: 'ok' }).ok, true);
});

test('A2 the verdict is derived: a discovery alone is not-ready; all ok is ready; a partial is ready-partial and says what is missing', () => {
  const P = makeGisPipeline({});
  P.record('a', 'discovered', { status: 'ok' });
  const v0 = P.verdict('a');
  assert.equal(v0.analysis, 'not-ready'); assert.equal(v0.blockedAt, 'access'); assert.equal(v0.reached, 'discovered');
  assert.equal(P.verdict('never-seen').known, false);
  for (const s of STAGES) P.record('a', s, { status: 'ok' });
  assert.equal(P.verdict('a').analysis, 'ready');
  P.record('a', 'fetched', { status: 'partial', facts: { missing: 'the east half of the window' } });
  for (const s of ['inspected', 'dataset']) P.record('a', s, { status: 'ok' });
  const v = P.verdict('a');
  assert.equal(v.analysis, 'ready-partial');
  assert.match(v.say, /east half of the window/);
  assert.equal(P.summary().analysis['ready-partial'], 1);
});

test('A3 not-observed is retryable and observed-no is not; blocked is neither and names the next step as none', () => {
  const P = makeGisPipeline({});
  P.recordFailure('t', 'fetched', 'timeout', { ms: 25000 });
  const t = P.verdict('t');
  assert.equal(t.stages.fetched.status, 'unknown'); assert.equal(t.retryable, true); assert.ok(t.next);
  P.recordFailure('g', 'fetched', 'http-status', { status: 404 });
  const g = P.verdict('g');
  assert.equal(g.stages.fetched.status, 'failed'); assert.equal(g.retryable, false); assert.equal(g.next, null);
  P.recordFailure('l', 'access', 'http-status', { status: 200, redirectedTo: 'https://sso.example/login' });
  const l = P.verdict('l');
  assert.equal(l.stages.access.status, 'blocked'); assert.equal(l.stages.access.kind, 'login'); assert.equal(l.next, null, 'a login is not retried and not worked around');
});

test('A4 every refusal code the readers declare is classified (a new code must be added to the table)', async () => {
  const P = makeGisPipeline({});
  const known = new Set(P.kinds());
  const codes = new Set(makeGisRemote({}).refusals());
  /* the codes the other readers return, read from their source rather than copied here */
  for (const f of ['js/gis-cog.js', 'js/gis-geotiff.js', 'js/gis-ogcapi.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/(?:fail|raise|refuse)\(\s*'([a-z][a-z0-9-]+)'/g)) codes.add(m[1]);
  }
  assert.ok(codes.size > 12, 'the walk found the codes');
  let other = [];
  for (const c of codes) {
    const r = P.classify(c, {});
    assert.ok(known.has(r.kind), c + ' → ' + r.kind + ' is a declared kind');
    assert.ok(['failed', 'blocked', 'unknown'].includes(r.status), c);
    if (r.kind === 'other') other.push(c);
  }
  /* «other» is the honest answer for a content refusal (a malformed file); it must stay the minority, or this table is not classifying */
  assert.ok(other.length <= codes.size * 0.7, 'most codes have a kind of their own; unclassified: ' + other.join(','));
});

test('A5 a stage re-read invalidates what was built on it', () => {
  const P = makeGisPipeline({});
  for (const s of STAGES) P.record('r', s, { status: 'ok' });
  P.record('r', 'fetched', { status: 'ok' });
  assert.equal(P.verdict('r').stages.inspected.status, 'pending', 'the inspection described the OLD bytes');
  assert.equal(P.verdict('r').analysis, 'not-ready');
});

test('A6 combine: parts that all held → ok; some held → partial naming the others; none → the first failure', () => {
  const P = makeGisPipeline({});
  for (const k of ['e', 'w']) for (const s of STAGES) P.record(k, s, { status: 'ok' });
  P.record('p', 'discovered', { status: 'ok' });
  P.combine('p', [{ key: 'e', label: 'east' }, { key: 'w', label: 'west' }]);
  assert.equal(P.verdict('p').analysis, 'ready');
  P.recordFailure('w', 'fetched', 'timeout', {});
  P.combine('p', [{ key: 'e', label: 'east' }, { key: 'w', label: 'west' }]);
  const v = P.verdict('p');
  assert.equal(v.stages.fetched.status, 'partial'); assert.match(v.stages.fetched.say, /not for west/);
  const q = makeGisPipeline({});
  q.record('p', 'discovered', { status: 'ok' });
  q.recordFailure('a', 'access', 'http-status', { status: 403 }); q.recordFailure('b', 'access', 'http-status', { status: 403 });
  q.combine('p', [{ key: 'a', label: 'one' }, { key: 'b', label: 'two' }]);
  assert.equal(q.verdict('p').stages.access.status, 'blocked');
});

/* ── C. the content is looked at ───────────────────────────────────────────────────────────────── */

test('C1 inspectRaster: empty, all-nodata, some-nodata, constant, outside the stated range', () => {
  const P = makeGisPipeline({});
  assert.equal(P.inspectRaster([]).why, 'empty-answer');
  assert.equal(P.inspectRaster(new Float32Array([NaN, NaN])).why, 'all-nodata');
  assert.equal(P.inspectRaster([-9999, -9999, -9999], { nodata: -9999 }).why, 'all-nodata');
  const some = P.inspectRaster([1, 2, NaN, 4]);
  assert.equal(some.status, 'partial'); assert.equal(some.facts.finite, 3); assert.match(some.missing, /1 of 4/);
  assert.equal(P.inspectRaster([5, 5, 5]).facts.constant, true);
  assert.equal(P.inspectRaster([1, 2, 3]).status, 'ok');
  const out = P.inspectRaster([1, 2, 900], { expect: { min: 0, max: 100 } });
  assert.equal(out.status, 'partial'); assert.equal(out.facts.outsideStatedRange, 1);
});

test('C2 inspectFeatures: an empty answer is this window, not the world; no geometry; outside the window', () => {
  const P = makeGisPipeline({});
  const e = P.inspectFeatures([]);
  assert.equal(e.status, 'failed'); assert.match(e.say, /not «nothing exists»/);
  const pt = (x, y) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: {} });
  assert.equal(P.inspectFeatures([pt(1, 1), pt(2, 2)], { box: [0, 0, 3, 3] }).status, 'ok');
  const o = P.inspectFeatures([pt(1, 1), pt(50, 50)], { box: [0, 0, 3, 3] });
  assert.equal(o.status, 'partial'); assert.equal(o.facts.outsideAskedWindow, 1);
  assert.equal(P.inspectFeatures([{ properties: { a: 1 } }]).why, 'no-geometry');
  /* a window across ±180 is judged on both sides */
  assert.equal(P.inspectFeatures([pt(179.9, 1), pt(-179.9, 1)], { box: [179, 0, -179, 3] }).status, 'ok');
});

test('C3 splitAtAntimeridian: both spellings of a crossing window, and null when it does not cross', () => {
  const P = makeGisPipeline({});
  assert.deepEqual(P.splitAtAntimeridian([170, -20, -170, -10]), [{ w: 170, s: -20, e: 180, n: -10 }, { w: -180, s: -20, e: -170, n: -10 }]);
  assert.deepEqual(P.splitAtAntimeridian([170, -20, 190, -10]), [{ w: 170, s: -20, e: 180, n: -10 }, { w: -180, s: -20, e: -170, n: -10 }]);
  assert.equal(P.splitAtAntimeridian([10, 0, 20, 5]), null);
  assert.equal(P.splitAtAntimeridian([-180, 0, 180, 5]), null, 'the whole globe is not a crossing');
});

/* ── D. search by what a dataset is ────────────────────────────────────────────────────────────── */

const json = (o) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(o), json: async () => o, type: 'basic' });
const world = [[-180, -90, 180, 90]];
const COLS = [
  { id: 'dem', title: 'Global DEM', description: 'Digital elevation model of the land surface', keywords: ['elevation', 'terrain'], license: 'proprietary', extent: { spatial: { bbox: world }, temporal: { interval: [['2011-01-01T00:00:00Z', null]] } }, summaries: { gsd: [30] } },
  { id: 's2', title: 'Sentinel optical', description: 'Multispectral imagery', keywords: ['optical'], license: 'CC-BY-4.0', extent: { spatial: { bbox: world }, temporal: { interval: [['2015-06-27T00:00:00Z', null]] } }, summaries: { gsd: [10, 20, 60], 'eo:cloud_cover': { minimum: 0, maximum: 100 } } },
  { id: 'notes', title: 'Elevation notes', description: 'free text', keywords: [] },
  { id: 'eu', title: 'European terrain', description: 'terrain of europe', keywords: ['elevation'], license: 'CC0-1.0', extent: { spatial: { bbox: [[-10, 35, 40, 70]] }, temporal: { interval: [['2000-01-01T00:00:00Z', '2010-12-31T00:00:00Z']] } }, summaries: { gsd: { minimum: 5, maximum: 5 } } },
];
function fakeWorld(over) {
  const o = over || {};
  const calls = [];
  const fetch = async (url, init) => {
    const u = String(url); calls.push({ url: u, init: init || null });
    if (o.route) { const r = o.route(u, init || {}); if (r) return r; }
    if (/^https:\/\/dead\.test/.test(u)) { if (o.deadHow === 'timeout') return new Promise((_, rej) => { if (init && init.signal) init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); }); throw new TypeError('Failed to fetch'); }
    if (/\/stac\/collections\?/.test(u)) return json({ collections: COLS, links: [] });
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => 'no', type: 'basic' };
  };
  fetch.calls = calls;
  return fetch;
}
function remote(over, deps) {
  const P = makeGisPipeline({});
  const M = makeGisRemote(Object.assign({ fetch: fakeWorld(over), pipeline: P }, deps || {}));
  M.add({ kind: 'stac', id: 'cat', url: 'https://cat.test/stac' });
  return { P, M, only: { catalogs: ['cat'] } };
}

test('D1 resolution is read from the standard members, in metres, and is null when nothing states it', () => {
  assert.deepEqual(resolutionOf({ summaries: { gsd: [10, 20, 60] } }), { min: 10, max: 60, source: 'summaries.gsd', unit: 'm' });
  assert.equal(resolutionOf({ summaries: { gsd: { minimum: 5, maximum: 5 } } }).min, 5);
  assert.equal(resolutionOf({ summaries: { 'raster:bands': [{ spatial_resolution: 30 }] } }).source, 'summaries.raster:bands');
  assert.equal(resolutionOf({ itemAssets: { data: { gsd: 2 } } }).source, 'item_assets');
  assert.equal(resolutionOf({ summaries: {} }), null);
  assert.equal(resolutionOf({ title: 'a 10 m product' }), null, 'a number in a title is not a statement');
  assert.equal(resolutionRelation({ min: 30, max: 30 }, { maxGsd: 10 }), 'misses');
  assert.equal(resolutionRelation({ min: 10, max: 60 }, { maxGsd: 10 }), 'meets');
  assert.equal(resolutionRelation(null, { maxGsd: 10 }), 'unstated');
  assert.equal(resolutionRelation(null, {}), 'not-asked');
});

test('D2 text: ALL words, where they are found matters, a prefix counts less than the word', () => {
  assert.deepEqual(words('Global-DEM, 30m'), ['global', 'dem', '30m']);
  const rec = (title, desc, kw) => ({ title, description: desc, keywords: kw || [], id: 'x', rights: { providers: [] } });
  assert.equal(textScore(['elevation', 'zzz'], rec('Elevation', 'elevation')), -1, 'one word of two is not «what I am looking for»');
  assert.ok(textScore(['elevation'], rec('Elevation', '')) > textScore(['elevation'], rec('Other', 'elevation')), 'title beats description');
  assert.ok(textScore(['elevation'], rec('Elevation', '')) > textScore(['elev'], rec('Elevation', '')), 'the word beats its prefix');
  assert.equal(textScore([], rec('a', 'b')), 0);
});

test('D3 search: resolution filter keeps the unstated by default and drops it when strict; cloud and licence likewise', async () => {
  const { M, only } = remote();
  const all = await M.search(Object.assign({ q: 'elevation' }, only));
  assert.deepEqual(all.entries.map((e) => e.id).sort(), ['dem', 'eu', 'notes']);
  const fine = await M.search(Object.assign({ q: 'elevation', maxGsd: 10 }, only));
  assert.deepEqual(fine.entries.map((e) => e.id).sort(), ['eu', 'notes'], 'dem (30 m) misses; notes states nothing and stays');
  assert.equal(fine.entries.find((e) => e.id === 'notes').match.resolution, 'unstated');
  assert.equal(fine.dropped.resolution, 1);
  const strict = await M.search(Object.assign({ q: 'elevation', maxGsd: 10, strict: true }, only));
  assert.deepEqual(strict.entries.map((e) => e.id), ['eu']);
  const lic = await M.search(Object.assign({ q: 'elevation', licensed: true }, only));
  assert.ok(!lic.entries.some((e) => e.id === 'notes'), 'a licence that is not stated is not an open one');
  const cloud = await M.search(Object.assign({ maxCloud: 10 }, only));
  assert.ok(cloud.entries.some((e) => e.id === 's2') && !cloud.entries.some((e) => e.id === 'dem' && e.match.cloud === 'meets'));
});

test('D4 search: place and period are judged on what is stated; the facets count what was found', async () => {
  const { M, only } = remote();
  const r = await M.search(Object.assign({ q: 'terrain', bbox: [140, 35, 141, 36] }, only));
  assert.deepEqual(r.entries.map((e) => e.id), ['dem'], 'the European collection states it does not cover Japan');
  assert.equal(r.dropped.place, 1);
  const t = await M.search(Object.assign({ q: 'terrain', time: '2024' }, only));
  assert.deepEqual(t.entries.map((e) => e.id), ['dem'], 'eu ended in 2010');
  const f = (await M.search(Object.assign({}, only))).facets;
  assert.equal(f.catalog.cat, 4); assert.equal(f.licence.unstated, 1); assert.equal(f.resolution.unstated, 1);
});

test('D5 held datasets join the same list, with what measuring them gave', async () => {
  const held = [{ id: 'ds7', title: 'Elevation of Hanoi', kind: 'raster', grid: { west: 105, north: 21, pixelLng: 0.001, pixelLat: -0.001 }, bands: [{ name: 'elevation' }], provenance: { bounds: [105, 20.9, 105.2, 21.1] } }];
  const { M, only } = remote({}, { data: { list: () => held } });
  const r = await M.search(Object.assign({ q: 'elevation', bbox: [105.05, 20.95, 105.1, 21] }, only));
  const h = r.entries.find((e) => e.origin === 'held');
  assert.ok(h, 'the held dataset is found');
  assert.equal(h.ref, 'dataset:ds7'); assert.ok(Math.abs(h.resolution.min - 111.32) < 0.01, 'pixelLat 0.001 deg ≈ 111 m');
  assert.equal(h.match.spatial, 'covers');
  assert.deepEqual(h.overlapBounds, [[105.05, 20.95, 105.1, 21]]);
  const only2 = await M.search({ q: 'elevation', origins: ['held'] });
  assert.deepEqual(only2.entries.map((e) => e.origin), ['held']);
  assert.equal(only2.catalogs.length, 0, 'asking only for held datasets asks no catalogue');
});

test('a held grid without a declared extent is found by its measured extent and carries exact nodata', async () => {
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const raster = makeGisRaster();
  const ds = {
    id: 'ds-grid', title: 'Test surface', kind: 'raster', count: 4, width: 2, height: 2,
    grid: { west: 37, north: 56, pixelLng: 0.02, pixelLat: 0.01 },
    bands: [{ name: 'sample', nodata: -9999 }],
    read: () => [1, -9999, 3, 4],
    provenance: { format: 'geotiff' },
  };
  ds.provenance.inspection = raster.describeBands(ds);
  const { M } = remote({}, { raster, data: { list: () => [ds] } });
  const queued = { origins: ['held'], bbox: [37.01, 55.985, 37.03, 55.99] };
  const [hit] = (await M.search(queued)).entries;
  assert.equal(hit.boundsBasis, 'measured');
  assert.deepEqual(hit.extent.bbox, [[37, 55.98, 37.04, 56]]);
  assert.deepEqual(hit.overlapBounds, [queued.bbox]);
  assert.equal(hit.format, 'geotiff');
  assert.equal(hit.resolution.min, 1113.2);
  assert.equal(hit.quality.inspection.bands[0].nodataCount, 1);
  const remoteWindow = await M.search({ ...queued, bbox: [-34, -16, -10, 22] });
  assert.deepEqual(remoteWindow.entries, []);
});

test('the GIS capability passes a dateline-spanning camera window and exposes held results as structured data', async () => {
  const { default: CAP_DATA } = await import('../js/atlas-cap-data.js');
  const cap = CAP_DATA.find((e) => e.row[0] === 'data.gisRemote');
  const previous = { IntMapLazy: globalThis.window?.IntMapLazy, IntMapGis: globalThis.window?.IntMapGis };
  const oldWindow = globalThis.window;
  globalThis.window ||= {};
  const asked = [], held = { id: 'ds-survey', origin: 'held', match: { spatial: 'overlaps' } };
  window.IntMapLazy = { need: async () => true };
  window.IntMapGis = { atlas: { remote: async (a) => { asked.push(a); return { ok: true, html: '', entries: [held] }; } } };
  try {
    const K = {
      GE: () => ({ camera: { getBounds: () => ({ getWest: () => 177, getEast: () => 184, getSouth: () => 4, getNorth: () => 12 }) } }),
      R: (ok, html, fields) => ({ ok, html, ...fields }),
    };
    const r = await cap.run({ action: 'search', origins: ['held'], inView: true }, { source: 'atlas-worker' }, K);
    assert.deepEqual(asked[0].bounds, [177, 4, -176, 12]);
    assert.deepEqual(r.exec.gisRemote, { held: [held], bounds: asked[0].bounds });
  } finally {
    if (oldWindow) Object.assign(window, previous);
    else delete globalThis.window;
  }
});

test('D6 a catalogue that did not answer is listed with its KIND of silence and counted, never «nothing there»', async () => {
  const { P, M } = remote();
  M.add({ kind: 'stac', id: 'dead', url: 'https://dead.test/stac' });
  const r = await M.search({ q: 'elevation', catalogs: ['cat', 'dead'] });
  const dead = r.catalogs.find((c) => c.id === 'dead');
  assert.equal(dead.answered, false); assert.equal(dead.kind_of_silence, 'unreachable');
  assert.ok(r.entries.length > 0, 'the one that answered is still searched');
  const slow = remote({ deadHow: 'timeout' }, { timeoutMs: 20 });
  slow.M.add({ kind: 'stac', id: 'dead', url: 'https://dead.test/stac' });
  const s = await slow.M.search({ q: 'elevation', catalogs: ['dead'], fresh: true });
  assert.equal(s.catalogs[0].why, 'timeout'); assert.equal(s.catalogs[0].kind_of_silence, 'unresponsive');
  assert.equal(slow.P.catalogHealth().find((h) => h.id === 'dead').unanswered, 1);
  assert.ok(P.catalogHealth().length >= 1);
});

test('D7 what a reader is shown is recorded as DISCOVERED and nothing further', async () => {
  const { P, M, only } = remote();
  const r = await M.search(Object.assign({ q: 'sentinel' }, only));
  const v = P.verdict(r.entries[0].ref);
  assert.equal(v.stages.discovered.status, 'ok'); assert.equal(v.analysis, 'not-ready'); assert.equal(v.blockedAt, 'access');
});

test('D8 the search is a pure function of its records: same input, same order (ties by title)', () => {
  const mk = (id, title) => ({ ref: 'c/' + id, catalog: 'c', kind: 'stac', id, title, description: '', keywords: [], extent: {}, rights: { license: 'x', providers: [] }, resolution: null, cloudCover: null, origin: 'catalogue' });
  const recs = [mk('b', 'Beta'), mk('a', 'Alpha'), mk('c', 'Alpha')];
  const dep = { spatial: () => 'not-asked', temporal: () => 'not-asked' };
  const a = searchRecords(recs, {}, dep).entries.map((e) => e.ref), b = searchRecords(recs.slice().reverse(), {}, dep).entries.map((e) => e.ref);
  assert.deepEqual(a, b);
});

/* ── E. acquire: the stages, and where it stopped ───────────────────────────────────────────────── */

function stacRoute(opts) {
  const o = opts || {};
  const item = (id, bbox, href) => ({ id, bbox, properties: { datetime: '2024-06-01T00:00:00Z', gsd: 30 }, assets: { data: { href: href, type: 'image/tiff; application=geotiff; profile=cloud-optimized', roles: ['data'] } } });
  return (u, init) => {
    if (/\/stac\/collections\/dem$/.test(u)) return json(COLS[0]);
    if (/\/stac\/search$/.test(u) && init.method === 'POST') {
      const b = JSON.parse(init.body).bbox || [0, 0, 0, 0];
      const items = [];
      /* the server answers a box that only TOUCHES an edge with the neighbouring tile too (measured) */
      if (b[0] >= 179) { items.push(item('W180', [-180, -17, -179, -16], 'https://data.test/W180.tif')); if (!o.noEast) items.push(item('E179', [179, -17, 180, -16], 'https://data.test/E179.tif')); }
      else if (b[2] <= -179) { if (!o.noWest) items.push(item('W180', [-180, -17, -179, -16], 'https://data.test/W180.tif')); }
      else items.push(item('N21', [105, 21, 106, 22], o.assetHref || 'https://data.test/N21.tif'));
      return json({ features: items, links: [] });
    }
    if (/^https:\/\/data\.test\//.test(u)) {
      if (o.login) return { ok: true, status: 200, redirected: true, url: 'https://sso.test/login', headers: { get: (k) => (/content-type/i.test(k) ? 'text/html' : null) }, text: async () => '<html>sign in</html>', arrayBuffer: async () => new ArrayBuffer(10) };
      if (o.forbid) return { ok: false, status: 403, headers: { get: () => null }, text: async () => 'AccessDenied', type: 'basic' };
      return { ok: true, status: 206, headers: { get: () => 'image/tiff' }, arrayBuffer: async () => new ArrayBuffer(1024), text: async () => '' };
    }
    return null;
  };
}
/* what the door's readGrid does with a read: record it through the ledger's own two ends */
function gridReader(P, cellsFor, log) {
  let n = 0;
  return async (href, win) => {
    const key = 'url:' + href; (log || []).push({ href, win });
    const cells = cellsFor(href);
    if (cells === 'fail') { P.readFailed(key, 'http-status', { status: 500, serverSaid: 'boom' }); return { ok: false, why: 'http-status' }; }
    const id = 'ds' + (++n);
    P.readSucceeded(key, cells.coverage || { completeness: 'all', reason: 'ok' }, P.inspectRaster(cells.values), id);
    return { ok: true, id: id };
  };
}
const good = () => ({ values: new Float32Array([1, 2, 3, 4]) });

test('E1 acquire walks every stage and returns the STATE: ready when each stage held', async () => {
  const log = [];
  const { P, M } = remote({ route: stacRoute() }, {});
  M.add({ kind: 'stac', id: 'c2', url: 'https://cat.test/stac' });
  const M2 = makeGisRemote({ fetch: fakeWorld({ route: stacRoute() }), pipeline: P, readGrid: gridReader(P, good, log) });
  M2.add({ kind: 'stac', id: 'cat', url: 'https://cat.test/stac' });
  const r = await M2.acquire('cat/dem', { bbox: [105.1, 21.1, 105.2, 21.2], width: 8, height: 8 });
  assert.equal(r.ok, true); assert.equal(r.state.analysis, 'ready'); assert.deepEqual(r.datasets, ['ds1']);
  for (const s of STAGES) assert.equal(r.state.stages[s].status, 'ok', s);
  assert.equal(log.length, 1); assert.deepEqual(log[0].win.bounds, [105.1, 21.1, 105.2, 21.2]);
});

test('E2 a login is BLOCKED at access and nothing is read; no other stage claims anything', async () => {
  const log = [];
  const P = makeGisPipeline({});
  const M = makeGisRemote({ fetch: fakeWorld({ route: stacRoute({ login: true }) }), pipeline: P, readGrid: gridReader(P, good, log) });
  M.add({ kind: 'stac', id: 'cat', url: 'https://cat.test/stac' });
  const r = await M.acquire('cat/dem', { bbox: [105.1, 21.1, 105.2, 21.2], width: 8, height: 8 });
  assert.equal(r.state.analysis, 'not-ready'); assert.equal(r.state.blockedAt, 'access');
  assert.equal(r.state.stages.access.status, 'blocked'); assert.equal(r.state.stages.access.kind, 'login');
  assert.match(r.state.say, /sso\.test\/login/);
  assert.equal(r.state.stages.fetched.status, 'pending'); assert.equal(log.length, 0, 'the reader is never asked to read behind a login');
  assert.equal(r.state.retryable, false);
});

test('E3 a 403 is blocked, a 500 on the read is unknown-and-retryable, an all-nodata grid is not analysable', async () => {
  const P = makeGisPipeline({});
  const run = async (route, cellsFor) => {
    const M = makeGisRemote({ fetch: fakeWorld({ route: route }), pipeline: P, readGrid: gridReader(P, cellsFor) });
    M.add({ kind: 'stac', id: 'cat', url: 'https://cat.test/stac' });
    return M.acquire('cat/dem', { bbox: [105.1, 21.1, 105.2, 21.2], width: 8, height: 8, time: undefined });
  };
  const f = await run(stacRoute({ forbid: true }), good);
  assert.equal(f.state.stages.access.kind, 'forbidden');
  const s = await run(stacRoute({ assetHref: 'https://data.test/other.tif' }), () => 'fail');
  assert.equal(s.state.stages.fetched.status, 'unknown'); assert.equal(s.state.retryable, true);
  const e = await run(stacRoute({ assetHref: 'https://data.test/empty.tif' }), () => ({ values: new Float32Array([NaN, NaN, NaN]) }));
  assert.equal(e.state.analysis, 'not-ready'); assert.equal(e.state.blockedAt, 'inspected');
  assert.equal(e.state.stages.inspected.why, 'all-nodata');
  assert.equal(e.state.stages.dataset.status, 'failed', 'the registry may hold it; the ledger says it must not be analysed');
});

test('E4 a window across ±180 is two windows read from the item whose OWN bbox covers each side', async () => {
  const log = [];
  const P = makeGisPipeline({});
  const M = makeGisRemote({ fetch: fakeWorld({ route: stacRoute() }), pipeline: P, readGrid: gridReader(P, good, log) });
  M.add({ kind: 'stac', id: 'cat', url: 'https://cat.test/stac' });
  const r = await M.acquire('cat/dem', { bbox: [179.6, -16.8, -179.6, -16.2], width: 64, height: 32 });
  assert.equal(r.acrossAntimeridian, true);
  assert.deepEqual(log.map((x) => x.href).sort(), ['https://data.test/E179.tif', 'https://data.test/W180.tif'], 'the tile that merely touches the edge is not read for the east side');
  assert.deepEqual(log.find((x) => /E179/.test(x.href)).win.bounds, [179.6, -16.8, 180, -16.2]);
  assert.deepEqual(log.find((x) => /W180/.test(x.href)).win.bounds, [-180, -16.8, -179.6, -16.2]);
  assert.equal(log.reduce((t, x) => t + x.win.width, 0), 64, 'the columns are shared out by longitude span');
  assert.equal(r.datasets.length, 2); assert.equal(r.state.analysis, 'ready');
});

test('E5 when one side has no item the parent is ready-partial and names THAT side', async () => {
  const P = makeGisPipeline({});
  const M = makeGisRemote({ fetch: fakeWorld({ route: stacRoute({ noWest: true }) }), pipeline: P, readGrid: gridReader(P, good) });
  M.add({ kind: 'stac', id: 'cat', url: 'https://cat.test/stac' });
  const r = await M.acquire('cat/dem', { bbox: [179.6, -16.8, -179.6, -16.2], width: 64, height: 32 });
  assert.equal(r.datasets.length, 1);
  assert.equal(r.state.analysis, 'ready-partial');
  assert.match(r.state.say, /west of the date line/);
  assert.match(r.state.say, /no-item-in-window|failed/);
  assert.equal(r.parts.find((x) => /west/.test(x.label)).state.analysis, 'not-ready');
  assert.equal(r.parts.find((x) => /east/.test(x.label)).state.analysis, 'ready');
});

test('E6 acquire refuses to guess what only the caller can state (window, resolution), and an unknown collection stops at discovered', async () => {
  const P = makeGisPipeline({});
  const M = makeGisRemote({ fetch: fakeWorld({ route: stacRoute() }), pipeline: P, readGrid: gridReader(P, good) });
  M.add({ kind: 'stac', id: 'cat', url: 'https://cat.test/stac' });
  assert.equal((await M.acquire('cat/dem', { width: 8, height: 8 })).why, 'bad-param');
  assert.equal((await M.acquire('cat/dem', { bbox: [0, 0, 1, 1] })).why, 'bad-param');
  const u = await M.acquire('cat/nonexistent', { bbox: [0, 0, 1, 1], width: 4, height: 4 });
  assert.equal(u.state.blockedAt, 'discovered'); assert.equal(u.state.stages.discovered.status, 'failed');
  assert.equal(u.state.stages.discovered.kind, 'unknown-reference');
});

test('E7 items: one page of scenes, filtered by cloud, with what the filter removed said', async () => {
  const route = (u, init) => {
    if (/\/search$/.test(u)) return json({ features: [{ id: 'a', properties: { datetime: '2024-01-01T00:00:00Z', 'eo:cloud_cover': 5 }, assets: {} }, { id: 'b', properties: { datetime: '2024-01-02T00:00:00Z', 'eo:cloud_cover': 80 }, assets: {} }], numberMatched: 40, links: [{ rel: 'next', href: 'x' }] });
    return null;
  };
  const { M } = remote({ route: route });
  const r = await M.items('cat/s2', { bbox: [0, 0, 1, 1], time: '2024', maxCloud: 20, limit: 2 });
  assert.deepEqual(r.items.map((x) => x.id), ['a']); assert.equal(r.droppedByCloud, 1); assert.equal(r.matched, 40); assert.equal(r.continues, true);
  assert.equal((await M.items('cat/s2', { time: '20x4' })).why, 'bad-param');
});

/* ── F. the door ───────────────────────────────────────────────────────────────────────────────── */

test('F1 the Atlas door declares the new actions and the schema accepts them; the actions come from the module, not a second list', () => {
  const doorSrc = readFileSync(join(ROOT, 'js/atlas-cap-data.js'), 'utf8');
  const M = makeGisRemote({});
  for (const a of M.actions().concat('sources', 'status')) assert.ok(doorSrc.includes("'" + a + "'"), 'the schema names ' + a);
  for (const f of ['maxGsd', 'minGsd', 'maxCloud', 'licensed', 'strict', 'origins', 'width', 'height']) assert.ok(doorSrc.includes(f + ': '), 'schema has ' + f);
  const atlas = readFileSync(join(ROOT, 'js/gis-atlas.js'), 'utf8');
  assert.match(atlas, /let _remote = null;/, 'one instance per session (a catalogue added stays added)');
  assert.match(atlas, /act === 'status'/);
});

test('F2 the new modules name no supplier in their code (every verdict is read from the response or the values)', () => {
  for (const f of ['js/gis-pipeline.js', 'js/gis-catalog-search.js']) {
    const code = codeOnly(readFileSync(join(ROOT, f), 'utf8'), { lang: 'js' });
    assert.doesNotMatch(code, /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i, f + ' holds no address');
    assert.doesNotMatch(code, /copernicus|landsat|usgs|nasa|planetary|sentinel|earth-search|esa\b/i, f + ' names no supplier');
  }
});

test('F3 the door never records an analysable state by itself: the only writers of a verdict are the readers and acquire', () => {
  const atlas = readFileSync(join(ROOT, 'js/gis-atlas.js'), 'utf8');
  assert.doesNotMatch(atlas, /record\([^)]*'analysis'/);
  assert.match(atlas, /P\.readSucceeded|readSucceeded\(P/);
});

test('strict satellite acquisition checks the chosen asset and scenes follows cloud-filtered pages', async () => {
  const P = makeGisPipeline({});
  const reads = [];
  const bounds = [105, 21, 106, 22];
  const footprint = [105.1, 21.1, 105.2, 21.2];
  const asset = (name, gsd) => ({ href: 'https://data.test/' + name + '.tif', gsd, type: 'image/tiff; application=geotiff; profile=cloud-optimized', roles: ['data'] });
  const scene = (id, cloud) => ({ id, bbox: bounds, properties: { datetime: '2024-06-01T00:00:00Z', gsd: 10, 'eo:cloud_cover': cloud },
    assets: { coarse: asset('coarse', 60), fine: asset('fine', 10), unknown: asset('unknown') } });
  const fallback = stacRoute();
  const route = (url, init) => {
    if (new URL(url).pathname === '/stac/collections') return json({ collections: [{ ...COLS[1], keywords: ['multispectral'] }], links: [] });
    if (url.endsWith('/stac/collections/s2')) return json(COLS[1]);
    if (url.endsWith('/stac/search')) return json({ features: [scene('cloudy', 95)], links: [{ rel: 'next', href: '?cursor=2' }] });
    if (url.endsWith('/stac/search?cursor=2')) return json({ features: [scene('clear', 5)], links: [] });
    return fallback(url, init);
  };
  const M = makeGisRemote({ fetch: fakeWorld({ route }), pipeline: P, readGrid: gridReader(P, good, reads) });
  M.add({ kind: 'stac', id: 'test-sat', url: 'https://cat.test/stac' });
  const options = { bbox: footprint, width: 8, height: 8, maxGsd: 20, maxCloud: 10, strict: true, time: '2024' };
  for (const key of ['coarse', 'unknown']) {
    const rejected = await M.acquire('test-sat/s2', { ...options, asset: key });
    assert.equal(rejected.state.analysis, 'not-ready', key);
  }
  assert.equal(reads.length, 0);
  const acquired = await M.acquire('test-sat/s2', options);
  assert.equal(acquired.state.analysis, 'ready');
  assert.equal(acquired.parts[0].item, 'clear');
  assert.equal(acquired.parts[0].asset, 'fine');
  assert.equal(acquired.parts[0].gsd, 10);
  const listed = await M.scenes({ bbox: footprint, time: '2024', modality: 'optical', maxCloud: 10, catalogs: ['test-sat'] });
  assert.deepEqual(listed.result.optical.scenes.map((row) => row.id), ['clear']);
  assert.equal(listed.result.optical.collections[0].pages, 2);
});
