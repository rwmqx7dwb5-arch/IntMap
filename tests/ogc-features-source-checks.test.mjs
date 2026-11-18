/* ============================================================================
 *  FEATURES AT A URL — js/gis-ogcapi.js and the `ogc:` input of data.gis
 * ----------------------------------------------------------------------------
 *    ① no limit stated → ONE page, the server's next link handed back as the cursor, `partial`
 *    ② a limit stated → pages are followed until that many arrived; the end is the SERVER's word
 *    ③ a cursor on another origin, a next link elsewhere, a looping next link, http and non-features
 *       bodies are refused BY NAME
 *    ④ through data.gis an `ogc:` ref is a registered vector dataset an op runs on; a grid slot, and
 *       a condition the server would ignore, are refused
 *
 *  ⚠ THE SERVER IS WRITTEN HERE (a fake that pages 25 features by `offset`) and the expected counts
 *  come from the fixture, not from the module.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOTAL = 25, PAGE = 10;
const BASE = 'https://data.example.org/ogc/collections/ports';

const feature = (i) => ({ type: 'Feature', id: i, properties: { n: i, v: i * 2 }, geometry: { type: 'Point', coordinates: [130 + i * 0.1, 33] } });

function server(o) {
  const opt = o || {};
  const s = { seen: [] };
  s.fetch = async (url) => {
    const u = new URL(String(url));
    s.seen.push(u.href);
    if (opt.status) return { status: opt.status, json: async () => ({}) };
    if (opt.body !== undefined) return { status: 200, json: async () => opt.body };
    const offset = Number(u.searchParams.get('offset') || 0);
    const size = Math.min(Number(u.searchParams.get('limit') || PAGE), PAGE);
    const feats = [];
    for (let i = offset; i < Math.min(offset + size, TOTAL); i++) feats.push(feature(i));
    const links = [];
    if (opt.loop) links.push({ rel: 'next', href: u.href });
    else if (offset + size < TOTAL) {
      const n = new URL(u.href); n.searchParams.set('offset', String(offset + size));
      links.push({ rel: 'next', href: opt.elsewhere ? 'https://evil.example.net/x?offset=10' : n.href });
    }
    return { status: 200, json: async () => ({ type: 'FeatureCollection', features: feats, links, numberMatched: TOTAL, numberReturned: feats.length }) };
  };
  return s;
}

async function mod() { return (await import('../js/gis-ogcapi.js')).makeGisOgcApi(); }

test('① no limit: one page, the next link is the cursor, and it is partial', async () => {
  const g = await mod(), srv = server();
  const r = await g.readItems(BASE, { fetch: srv.fetch });
  assert.equal(r.ok, true, JSON.stringify(r.why));
  assert.equal(r.features.length, PAGE);
  assert.equal(srv.seen.length, 1, 'more than one page was read without a limit');
  assert.equal(r.coverage.completeness, 'partial');
  assert.equal(r.coverage.numberMatched, TOTAL);
  assert.ok(r.next, 'the cursor was not handed back');
  assert.match(srv.seen[0], /\/ports\/items\?/, 'items was not appended');
  const r2 = await g.readItems(BASE, { fetch: srv.fetch, cursor: r.next });
  assert.equal(r2.features[0].id, PAGE, 'the cursor did not continue where the first page stopped');
  const r3 = await g.readItems(BASE, { fetch: srv.fetch, cursor: r2.next });
  assert.equal(r3.features.length, TOTAL - 2 * PAGE);
  assert.equal(r3.next, null);
  assert.equal(r3.coverage.continues, false, 'the last page did not say nothing follows');
  assert.equal(r3.coverage.completeness, 'partial', 'a page reached by a cursor was called the whole collection');
});

test('② a limit: pages are followed until that many arrived, and bbox is sent', async () => {
  const g = await mod(), srv = server();
  const r = await g.readItems(BASE + '/items', { fetch: srv.fetch, limit: 25, bounds: [129, 32, 133, 34] });
  assert.equal(r.ok, true, JSON.stringify(r.why));
  assert.equal(r.features.length, TOTAL);
  assert.equal(r.coverage.pages, 3);
  assert.equal(r.coverage.completeness, 'all');
  assert.equal(new URL(srv.seen[0]).searchParams.get('bbox'), '129,32,133,34');
  const part = await g.readItems(BASE, { fetch: srv.fetch, limit: 12 });
  assert.equal(part.features.length, 20, 'the last page was cut instead of reported (a cut would make next skip rows)');
  assert.equal(part.coverage.completeness, 'partial');
  assert.ok(part.next);
});

test('③ foreign cursor, foreign next link, loops, http and non-features are refused by name', async () => {
  const g = await mod();
  assert.equal((await g.readItems(BASE, { fetch: server().fetch, cursor: 'https://evil.example.net/x' })).why, 'cursor-not-recognised');
  assert.equal((await g.readItems(BASE, { fetch: server({ elsewhere: true }).fetch, limit: 25 })).why, 'ogc-next-elsewhere');
  assert.equal((await g.readItems(BASE, { fetch: server({ loop: true }).fetch, limit: 25 })).why, 'ogc-next-loop');
  const srv = server();
  assert.equal((await g.readItems('http://data.example.org/c', { fetch: srv.fetch })).why, 'url-not-https');
  assert.equal(srv.seen.length, 0, 'a refused URL was fetched');
  assert.equal((await g.readItems(BASE, { fetch: server({ body: { type: 'Catalog' } }).fetch })).why, 'ogc-not-features');
  assert.equal((await g.readItems(BASE, { fetch: server({ status: 404 }).fetch })).why, 'http-status');
});

test('④ through data.gis an ogc: ref is a registered vector dataset; a grid slot and a condition are refused', async () => {
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
    const got = await atlas.run({ inputs: ['ogc:' + BASE], acquire: { bounds: [129, 32, 133, 34] }, title: 'Ports' });
    assert.equal(got.ok, true, JSON.stringify(got.why) + JSON.stringify(got.detail));
    assert.equal(got.dataset.kind, 'vector');
    assert.equal(got.dataset.count, PAGE);
    assert.equal(got.dataset.acquiredFrom, 'ogc:' + BASE);
    assert.equal(got.dataset.coverage.completeness, 'partial');
    assert.ok(got.dataset.next, 'the planner was not handed the cursor');
    assert.equal(data.get(got.dataset.id).provenance.kind, 'url-features');

    /* the next page, by the cursor the planner was handed */
    const more = await atlas.run({ inputs: ['ogc:' + BASE], acquire: { cursor: got.dataset.next } });
    assert.equal(more.ok, true, JSON.stringify(more.why));
    assert.equal(more.dataset.count, PAGE);

    /* an op runs on it */
    const f = await atlas.run({ op: 'filter', inputs: ['ogc:' + BASE], params: { where: [{ field: 'v', op: '>=', value: 10 }] } });
    assert.equal(f.ok, true, JSON.stringify(f.why) + JSON.stringify(f.detail));

    const cond = await atlas.run({ inputs: ['ogc:' + BASE], acquire: { where: [{ field: 'n', op: '>', value: 3 }] } });
    assert.equal(cond.ok, false);
    assert.equal(cond.why, 'ogc-param-not-supported');
    const grid = await atlas.resolve('ogc:' + BASE, 0, { kinds: ['raster'] }, { acquire: { bounds: [0, 0, 1, 1], width: 2, height: 2 } });
    assert.equal(grid.ok, false);
    assert.equal(grid.why, 'ogc-needs-a-vector-slot');
  } finally { globalThis.fetch = prev; }
});
