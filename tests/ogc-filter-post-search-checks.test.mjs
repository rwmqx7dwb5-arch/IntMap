/* ============================================================================
 *  js/gis-ogcapi.js — datetime on /items, CQL2 filter only when the server states it, STAC POST search
 *  ⚠ THE SERVERS ARE WRITTEN HERE; expected values come from the fixtures, not from the module.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

const COL = 'https://data.example.org/ogc/collections/ports';
const feat = (i) => ({ type: 'Feature', id: i, properties: { n: i }, geometry: { type: 'Point', coordinates: [130, 33] } });
const mod = async () => (await import('../js/gis-ogcapi.js')).makeGisOgcApi();

function server(conformsTo) {
  const s = { seen: [] };
  s.fetch = async (url, init) => {
    const u = new URL(String(url));
    s.seen.push({ href: u.href, init: init || {} });
    if (u.pathname.endsWith('/conformance')) return { status: conformsTo ? 200 : 404, json: async () => ({ conformsTo: conformsTo || [] }) };
    return { status: 200, json: async () => ({ type: 'FeatureCollection', features: [feat(1)], links: [], numberMatched: 1 }) };
  };
  return s;
}

test('① datetime is sent on /items (Core of OGC API Features)', async () => {
  const g = await mod(); const s = server();
  const r = await g.readItems(COL, { time: '2026-01-01/2026-02-01', fetch: s.fetch });
  assert.ok(r.ok);
  assert.equal(new URL(s.seen[0].href).searchParams.get('datetime'), '2026-01-01/2026-02-01');
  assert.ok(g.supports.includes('time'));
});

test('② a filter is refused BY NAME when /conformance does not state it, and never sent', async () => {
  const g = await mod();
  for (const conf of [null, ['http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core'], ['http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/features-filter']]) {
    const s = server(conf);
    const r = await g.readItems(COL, { filter: "n > 3", fetch: s.fetch });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'ogc-filter-not-declared');
    assert.ok(s.seen.every((x) => !/\/items/.test(x.href)), 'the items were fetched without the condition being honoured');
  }
});

test('③ a filter is sent when both classes are stated; /conformance is the API root\'s', async () => {
  const g = await mod();
  const s = server(['http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/features-filter', 'http://www.opengis.net/spec/cql2/1.0/conf/cql2-text']);
  const r = await g.readItems(COL, { filter: 'n > 3', fetch: s.fetch });
  assert.ok(r.ok);
  assert.equal(new URL(s.seen[0].href).pathname, '/ogc/conformance');
  const u = new URL(s.seen[1].href);
  assert.equal(u.searchParams.get('filter'), 'n > 3');
  assert.equal(u.searchParams.get('filter-lang'), 'cql2-text');
});

function stacServer(pages) {
  const s = { seen: [] };
  s.fetch = async (url, init) => {
    const i = init || {};
    const body = i.body ? JSON.parse(i.body) : null;
    s.seen.push({ href: String(url), method: i.method || 'GET', body });
    const n = s.seen.length - 1;
    const links = n < pages - 1 ? [{ rel: 'next', href: 'https://stac.example.org/search', method: 'POST', body: { token: 't' + (n + 1) }, merge: true }] : [];
    return { status: 200, json: async () => ({ type: 'FeatureCollection', features: [feat(n)], links }) };
  };
  return s;
}

test('④ STAC POST: the body carries the query; a POST next link is followed with its merged body', async () => {
  const g = await mod(); const s = stacServer(3);
  const r = await g.readItems('https://stac.example.org/search', { search: true, method: 'POST', bounds: [1, 2, 3, 4], time: '2026', limit: 3, collections: ['dem'], fetch: s.fetch });
  assert.ok(r.ok);
  assert.equal(s.seen.length, 3);
  assert.ok(s.seen.every((x) => x.method === 'POST'));
  assert.deepEqual(s.seen[0].body, { bbox: [1, 2, 3, 4], limit: 3, datetime: '2026', collections: ['dem'] });
  assert.equal(s.seen[1].body.token, 't1');
  assert.deepEqual(s.seen[1].body.bbox, [1, 2, 3, 4], 'merge:true dropped the original query');
  assert.equal(r.features.length, 3);
  assert.equal(r.coverage.completeness, 'all');
});

test('⑤ STAC POST that stops with more to come says so and gives no URL cursor', async () => {
  const g = await mod(); const s = stacServer(5);
  const r = await g.readItems('https://stac.example.org/search', { search: true, method: 'POST', limit: 1, fetch: s.fetch });
  assert.ok(r.ok);
  assert.equal(r.next, null);
  assert.equal(r.coverage.completeness, 'partial');
  assert.match(r.coverage.reason, /post-next-not-resumable/);
  assert.equal(r.coverage.continues, true);
});

test('⑥ POST on a Features collection, a POST with a cursor and a bad method are refused', async () => {
  const g = await mod(); const s = stacServer(1);
  assert.equal((await g.readItems(COL, { method: 'POST', fetch: s.fetch })).why, 'bad-param');
  assert.equal((await g.readItems('https://stac.example.org/search', { search: true, method: 'PUT', fetch: s.fetch })).why, 'bad-param');
  assert.equal((await g.readItems('https://stac.example.org/search', { search: true, method: 'POST', cursor: 'https://stac.example.org/x', fetch: s.fetch })).why, 'cursor-not-recognised');
  assert.equal(s.seen.length, 0);
});
