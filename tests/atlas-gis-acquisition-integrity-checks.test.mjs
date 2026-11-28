import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGisPipeline } from '../js/gis-pipeline.js';
import { makeGisRemote } from '../js/gis-remote.js';
import { makeGisDatasets } from '../js/gis-datasets.js';
import capabilities from '../js/atlas-cap-data.js';

const ref = 'fast/imagery';
const bounds = [130, 32, 134, 36];
const datetime = '2024-06-01T00:00:00Z';
const collection = {
  id: 'imagery', title: 'Satellite imagery', extent: { spatial: { bbox: [bounds] } },
  summaries: { 'eo:cloud_cover': [5, 95], gsd: [10] },
};
function item(id, bbox, cloud, gsd = 10) {
  return {
    id, bbox, properties: { datetime, 'eo:cloud_cover': cloud, gsd },
    assets: { data: { href: 'https://pixels.test/' + id + '.tif', gsd, type: 'image/tiff; application=geotiff; profile=cloud-optimized' } },
  };
}

function setup(features, served = {}, opts = {}) {
  const pipeline = makeGisPipeline({});
  const log = [];
  const data = new Map();
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const fetch = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === 'pixels.test') return new Response(new Uint8Array(1024), { status: 206, headers: { 'Content-Type': 'image/tiff' } });
    if (u.hostname === 'slow.test') await slow;
    if (u.pathname === '/stac/search') {
      if (opts.search) return Response.json(opts.search(u, init));
      return Response.json({ features, links: [] });
    }
    const stated = opts.collection || collection;
    if (u.pathname === '/stac/collections') return Response.json({ collections: [stated], links: [] });
    return Response.json(stated);
  };
  const readGrid = async (href, win) => {
    const name = new URL(href).pathname.slice(1, -4);
    const extent = served[name] || win.bounds;
    log.push({ name, bounds: win.bounds });
    const coverage = { requested: win.bounds, served: extent, completeness: extent === win.bounds ? 'all' : 'partial', reason: 'window-extends-past-the-file' };
    const inspection = pipeline.inspectRaster(opts.cells?.[name] || [12, 24, 36, 48]);
    const id = 'dataset-' + log.length;
    data.set(id, { kind: 'raster', id, provenance: { coverage } });
    pipeline.readSucceeded(win.ledgerKey || 'url:' + href, coverage, inspection, id);
    return { ok: true, id };
  };
  const remote = makeGisRemote({ fetch, pipeline, readGrid, data });
  for (const id of ['fast', 'slow']) remote.add({ kind: 'stac', id, url: 'https://' + id + '.test/stac' });
  return { remote, log, release };
}

const query = { bbox: bounds, catalogs: ['fast'], width: 40, height: 40 };

test('early acquisition applies the requested cloud ceiling to the actual scene', async () => {
  const { remote, log } = setup([item('cloudy', bounds, 95), item('unknown', bounds), item('clear', bounds, 5)], {},
    { collection: { ...collection, summaries: undefined } });
  const r = await remote.search({ ...query, maxCloud: 10, strict: true, until: 'ready' });
  assert.deepEqual(log.map((x) => x.name), ['clear']);
  const part = r.early.parts[0];
  assert.equal(part.item, 'clear');
  assert.equal(part.datetime, datetime);
  assert.equal(part.cloud, 5);
  assert.equal(part.gsd, 10);
  assert.equal(part.validPixelFraction, 1);
  assert.equal(part.coverageFraction, 1);
  assert.equal(part.matches.cloud, 'meets');
});

test('RFC 7946 six-coordinate and four-coordinate boxes agree across the date line', async () => {
  const { remote } = setup([item('six', [130, 32, -10, 134, 36, 300], 5)]);
  const miss = await remote.search({ ...query, bbox: [140, 33, 135, 141, 34, 142] });
  assert.equal(miss.total, 0);
  const rows = await remote.items(ref, { bbox: [130, 32, -10, 134, 36, 300] });
  assert.deepEqual(rows.items[0].bbox, bounds);
  for (const extent of [[178, -20, -178, -15], [178, -20, -10, -178, -15, 100]]) {
    assert.equal(remote._spatialRelation([extent], { w: 179, s: -19, e: -179, n: -16 }), 'covers');
  }
  const { remote: wrapped, log } = setup([item('dateline', [178, -20, -10, -178, -15, 100], 5)]);
  const acquired = await wrapped.acquire(ref, { ...query, bbox: [179, -19, 0, -179, -16, 400] });
  assert.equal(acquired.coverage.fraction, 1);
  assert.deepEqual(log.map((entry) => entry.bounds), [[179, -19, 180, -16], [-180, -19, -179, -16]]);
});

test('adjacent tile reads together qualify for an early result before a slow catalogue answers', { timeout: 2000 }, async () => {
  const west = [130, 32, 132, 36], east = [132, 32, 134, 36];
  const { remote, log, release } = setup([item('west', west, 5), item('east', east, 5)]);
  try {
    const r = await remote.search({ ...query, catalogs: ['fast', 'slow'], until: 'ready' });
    assert.deepEqual(r.stillAsking, ['slow']);
    assert.equal(r.early.state.analysis, 'ready');
    assert.equal(r.early.coverage.fraction, 1);
    assert.deepEqual(r.early.coverage.missingBounds, []);
    assert.deepEqual(log, [{ name: 'west', bounds: west }, { name: 'east', bounds: east }]);
  } finally { release(); }
});

test('partially loaded tiles report a gap using served bounds rather than the catalogue extent', async () => {
  const west = [130, 32, 132, 36], east = [132, 32, 134, 36];
  const { remote } = setup([item('west', west, 5), item('east', east, 5)], { west: [130, 32, 131, 36] });
  const r = await remote.acquire(ref, query);
  assert.equal(r.state.analysis, 'ready-partial');
  assert.equal(r.datasets.length, 2);
  assert.equal(r.coverage.fraction, 0.75);
  assert.deepEqual(r.coverage.missingBounds, [[131, 32, 132, 36]]);
  assert.equal(r.parts[0].coverageFraction, 0.25);
  const search = await remote.search({ ...query, until: 'ready' });
  assert.equal(search.early, undefined);
  assert.deepEqual(search.acquisitionAttempts[0].coverage.missingBounds, [[131, 32, 132, 36]]);
});

test('a later STAC page can fill the gap and excludes cloud-unknown scenes in strict mode', async () => {
  const left = [130, 32, 132, 36], right = [132, 32, 134, 36];
  const requests = [];
  const { remote, log } = setup([], {}, { search(url, init) {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (body.token === 'east') return { features: [item('east', right, 8)], links: [] };
    return {
      features: [item('unknown', bounds), item('west', left, 5)],
      links: [{ rel: 'next', href: url.pathname, method: 'POST', body: { token: 'east' }, merge: true }],
    };
  } });
  const r = await remote.search({ ...query, until: 'ready', strict: true, maxCloud: 10 });
  assert.equal(r.early.state.analysis, 'ready');
  assert.deepEqual(log.map((x) => x.name), ['west', 'east']);
  assert.deepEqual(requests[1], { ...requests[0], token: 'east' });
});

test('actual scenes are checked against the requested period and asset resolution', async () => {
  const bbox = [-51, 63, -47, 65];
  const old = item('prior-year', bbox, 1);
  old.properties.datetime = '2022-06-15T00:00:00Z';
  const coarse = item('coarse-band', bbox, 1);
  coarse.assets.data['raster:bands'] = [{ spatial_resolution: 60 }];
  const current = item('current', bbox, 7);
  const { remote, log } = setup([old, coarse, current], {}, { collection: { ...collection, extent: { spatial: { bbox: [bbox] } } } });
  const r = await remote.search({ ...query, bbox, maxCloud: 15, maxGsd: 20, time: '2024-06', strict: true, until: 'ready' });
  assert.deepEqual(log.map((x) => x.name), ['current']);
  assert.deepEqual(r.early.parts[0].matches, { cloud: 'meets', resolution: 'meets', temporal: 'overlaps' });
});

test('a file with no valid measurements does not cover a gap and partial pixels are reported', async () => {
  const bbox = [-43, -23, -39, -18];
  const west = [-43, -23, -41, -18], east = [-41, -23, -39, -18];
  const { remote } = setup([item('water', west, 1), item('coast', east, 4)], {}, {
    cells: { water: [NaN, NaN, NaN, NaN], coast: [1, 2, 3, NaN] },
  });
  const r = await remote.acquire(ref, { ...query, bbox });
  assert.equal(r.state.analysis, 'ready-partial');
  assert.equal(r.coverage.fraction, 0.5);
  assert.deepEqual(r.coverage.missingBounds, [west]);
  assert.equal(r.parts[0].validPixelFraction, 0);
  assert.equal(r.parts[1].validPixelFraction, 0.75);
  assert.equal(r.datasets.length, 1);
});

test('Atlas dispatch passes acquired observations and held planning rows to the model', async () => {
  const { remote } = setup([item('clear', bounds, 5)]);
  const observation = await remote.acquire(ref, { ...query, maxCloud: 10, strict: true });
  const held = { id: 'held-1', origin: 'held', bounds, overlapBounds: [bounds], resolution: { min: 10, max: 10 }, quality: { inspected: true } };
  const cap = capabilities.find((c) => c.row[0] === 'data.gisRemote');
  const previous = globalThis.window;
  try {
    let result = { ...observation, datasetsCreated: [{ id: 'dataset-1', version: 'v1' }] };
    globalThis.window = { IntMapLazy: { need: async () => {} }, IntMapGis: { atlas: { remote: async () => result } } };
    const K = { R: (ok, html, detail) => ({ ok, html, ...detail }) };
    const acquired = await cap.run({ action: 'acquire' }, {}, K);
    assert.deepEqual(acquired.meta.datasetsCreated, [{ id: 'dataset-1', version: 'v1' }]);
    assert.equal(acquired.meta.gisRemote.acquisition.parts[0].cloud, 5);
    assert.equal(acquired.meta.gisRemote.acquisition.coverage.fraction, 1);
    result = { ok: true, entries: [held] };
    const searched = await cap.run({ action: 'search', origins: ['held'] }, {}, K);
    assert.deepEqual(searched.meta.gisRemote.held, [held]);
    assert.equal(searched.meta.datasetsCreated, undefined);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test('held-only search uses the registry epoch for a raster', async () => {
  const data = makeGisDatasets();
  const ds = data.add({
    kind: 'raster', width: 1, height: 1, grid: { west: 130, north: 36, pixelLng: 4, pixelLat: 4 },
    time: { kind: 'constant', start: datetime }, bands: [{ name: 'elevation' }], read: () => new Float32Array([10]),
    provenance: { bounds },
  });
  const remote = makeGisRemote({ data, fetch: () => assert.fail('held search must not fetch catalogues') });
  const match = await remote.search({ origins: ['held'], time: '2024', strict: true });
  assert.equal(match.entries[0].id, ds.id);
  assert.deepEqual(match.entries[0].extent.time, [[new Date(datetime).toISOString(), new Date(datetime).toISOString()]]);
  assert.equal((await remote.search({ origins: ['held'], time: datetime, strict: true })).entries[0].match.temporal, 'overlaps');
  assert.equal((await remote.search({ origins: ['held'], time: '2023', strict: true })).total, 0);
});
