/* ============================================================================
 *  STAC SEARCH — the `stac:` input of data.gis (js/gis-ogcapi.js in `search` mode)
 * ----------------------------------------------------------------------------
 *    ① the search is addressed as given (no /items appended, no f=json), bbox and the STAC `datetime`
 *       are sent, and `time` is a supported field here but not for an OGC collection
 *    ② each item keeps what lives OUTSIDE `properties`: its id, its collection and one `asset:<key>`
 *       column per file with an href — so the address of a COG is a value the next step can read
 *    ③ through data.gis a `stac:` ref is a registered vector dataset whose rows carry those columns
 *    ④ a grid slot and an attribute condition are refused by name
 *
 *  ⚠ THE SERVER IS WRITTEN HERE; the expected columns come from the fixture.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH = 'https://stac.example.org/api/search?collections=dem';

const item = (i) => ({
  type: 'Feature', id: 'scene-' + i, collection: 'dem',
  geometry: { type: 'Polygon', coordinates: [[[130 + i, 33], [131 + i, 33], [131 + i, 34], [130 + i, 34], [130 + i, 33]]] },
  properties: { datetime: '2026-0' + (i + 1) + '-15T00:00:00Z', 'eo:cloud_cover': i * 10 },
  assets: { visual: { href: 'https://data.example.org/dem/scene-' + i + '.tif', type: 'image/tiff; application=geotiff' }, thumb: { href: 'https://data.example.org/t/' + i + '.png' }, broken: { type: 'x' } },
});

function server() {
  const s = { seen: [] };
  s.fetch = async (url) => {
    const u = new URL(String(url));
    s.seen.push(u);
    return { status: 200, json: async () => ({ type: 'FeatureCollection', features: [item(0), item(1)], links: [], numberMatched: 2 }) };
  };
  return s;
}

test('① the search is addressed as given, with bbox and datetime, and time is a field here', async () => {
  const { makeGisOgcApi } = await import('../js/gis-ogcapi.js');
  const g = makeGisOgcApi(), srv = server();
  const r = await g.readItems(SEARCH, { search: true, fetch: srv.fetch, bounds: [129, 32, 133, 35], time: '2026-01-01T00:00:00Z/2026-03-01T00:00:00Z', limit: 10 });
  assert.equal(r.ok, true, JSON.stringify(r.why));
  const u = srv.seen[0];
  assert.equal(u.pathname, '/api/search', 'the search endpoint was changed');
  assert.equal(u.searchParams.get('collections'), 'dem', 'the collections the reader named in the URL were dropped');
  assert.equal(u.searchParams.get('bbox'), '129,32,133,35');
  assert.equal(u.searchParams.get('datetime'), '2026-01-01T00:00:00Z/2026-03-01T00:00:00Z');
  assert.equal(u.searchParams.get('f'), null, 'f=json is not part of STAC search');
  assert.ok(g.supportsSearch.includes('time'));
  assert.ok(g.supports.includes('time'), 'datetime is Core of OGC API Features and is sent on /items');
});

test('② an item keeps its id, collection and one column per file with an href', async () => {
  const { makeGisOgcApi } = await import('../js/gis-ogcapi.js');
  const r = await makeGisOgcApi().readItems(SEARCH, { search: true, fetch: server().fetch });
  const p = r.features[1].properties;
  assert.equal(p.stac_id, 'scene-1');
  assert.equal(p.stac_collection, 'dem');
  assert.equal(p['asset:visual'], 'https://data.example.org/dem/scene-1.tif');
  assert.equal(p['asset:thumb'], 'https://data.example.org/t/1.png');
  assert.equal('asset:broken' in p, false, 'an asset with no href was invented a column');
  assert.equal(p['eo:cloud_cover'], 10, 'the item properties were lost');
});

test('③④ through data.gis a stac: ref is a dataset with those columns; a grid slot and a condition are refused', async () => {
  const w = {}; globalThis.window = w;
  new Function('window', readFileSync(join(ROOT, 'js/geodesy.js'), 'utf8'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  const layers = { acquireFields: (k) => (k === 'raster' ? ['bounds', 'width', 'height'] : ['bounds', 'where', 'fields', 'limit', 'cursor', 'time', 'analysis']) };
  const atlas = makeGisAtlas({ data, ops, layers, draw: () => ({ ok: true }) });
  const srv = server();
  const prev = globalThis.fetch; globalThis.fetch = srv.fetch;
  try {
    const got = await atlas.run({ inputs: ['stac:' + SEARCH], acquire: { bounds: [129, 32, 133, 35], time: '2026-01-01T00:00:00Z/..' }, title: 'DEM scenes' });
    assert.equal(got.ok, true, JSON.stringify(got.why) + JSON.stringify(got.detail));
    assert.equal(got.dataset.count, 2);
    assert.equal(got.dataset.acquiredFrom, 'stac:' + SEARCH);
    const ds = data.get(got.dataset.id);
    assert.equal(ds.provenance.kind, 'stac-search');
    const names = ds.fields.map((f) => f.name);
    assert.ok(names.includes('asset:visual') && names.includes('stac_id'), 'the file column did not reach the dataset: ' + names.join(','));
    /* a chain: an op over the catalogue rows, selecting by an item property */
    const f = await atlas.run({ op: 'filter', inputs: ['stac:' + SEARCH], params: { where: [{ field: 'eo:cloud_cover', op: '<', value: 5 }] } });
    assert.equal(f.ok, true, JSON.stringify(f.why) + JSON.stringify(f.detail));

    const cond = await atlas.run({ inputs: ['stac:' + SEARCH], acquire: { where: [{ field: 'x', op: '>', value: 1 }] } });
    assert.equal(cond.why, 'ogc-param-not-supported');
    const grid = await atlas.resolve('stac:' + SEARCH, 0, { kinds: ['raster'] }, { acquire: { bounds: [0, 0, 1, 1], width: 2, height: 2 } });
    assert.equal(grid.why, 'ogc-needs-a-vector-slot');
  } finally { globalThis.fetch = prev; }
});
