/* ============================================================================
 *  GIS · DATA THAT IS NOT IN THE APP — js/gis-remote.js
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE MEASURES, RESTATED AS DEFECTS ([[intmap-restate-the-defect-not-the-fix]]):
 *    ① the planner had no first move for data the app does not hold — `catalogue()` lists the app's
 *      own holdings — and js/gis-geotiff.js's readUrl() had no caller at all;
 *    ② 「カタログが答えなかった」 and 「カタログに無かった」 would arrive as one empty list;
 *    ③ 「供給元が窓の全部を返した」 、「供給元の範囲が窓を覆う」 、「世界の全部である」 are three claims, and a
 *      count cannot tell them apart — the third can never be `all`;
 *    ④ a licence that is not stated read as a licence that is open;
 *    ⑤ a catalogue's `href` is a way to make this process fetch an address of the caller's choosing.
 *
 *  ⚠ NOTHING HERE TOUCHES THE NETWORK. A fake `fetch` serves the catalogues and a fake ranged file
 *  serves the COG, so the verdicts are about this file's logic and cannot be a host's bad day. The
 *  live catalogues were measured once, by hand, on 2026-11-19 (dev-notes/2026-11-19-gis-data-supply.md).
 * ==========================================================================*/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeGisSources } from '../js/gis-sources.js';
import { makeGisRemote } from '../js/gis-remote.js';
import '../js/safe-html.js';

const json = (o, status) => ({ ok: (status || 200) < 400, status: status || 200, text: async () => JSON.stringify(o) });

/* a STAC-ish and an OGC-ish catalogue, as the standards state them */
function fakeWorld(over) {
  const o = over || {};
  const calls = [];
  const col = (id, extra) => Object.assign({ id, title: id.toUpperCase(), description: 'desc of ' + id, license: 'CC-BY-4.0', keywords: [],
    extent: { spatial: { bbox: [[-180, -90, 180, 90]] }, temporal: { interval: [['2000-01-01T00:00:00Z', null]] } } }, extra || {});
  const items = (n, matched, next) => ({ type: 'FeatureCollection', numberMatched: matched,
    features: Array.from({ length: n }, (_, i) => ({ type: 'Feature', id: 'i' + i, geometry: { type: 'Point', coordinates: [139 + i * 0.01, 35] }, properties: { n: i, nested: { a: 1 } }, assets: { data: { href: 's3://b/k' + i + '.tif', type: 'image/tiff; application=geotiff; profile=cloud-optimized' } } })),
    links: next ? [{ rel: 'next', href: next }] : [] });
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body ? JSON.parse(init.body) : null });
    const u = String(url);
    if (u.startsWith('https://stac.example/collections?')) {
      return json({ collections: [col('dem-global', { keywords: ['elevation'], description: 'Global elevation model' }), col('jp-only', { description: 'elevation Japan', extent: { spatial: { bbox: [[122, 24, 146, 46]] }, temporal: { interval: [['2010-01-01T00:00:00Z', '2015-12-31T00:00:00Z']] } } }), col('nolic', { license: undefined, description: 'elevation nowhere stated', extent: undefined })], links: [] });
    }
    if (u.startsWith('https://down.example/')) throw new Error('connect ECONNREFUSED');
    if (u.startsWith('https://ogc.example/collections?')) return json({ collections: [col('stations', { description: 'river stations', extent: { spatial: { bbox: [[-141, 41, -52, 84]] } } })], links: [] });
    if (u.startsWith('https://ogc.example/collections/stations?')) return json(col('stations', { extent: { spatial: { bbox: [[-141, 41, -52, 84]] } } }));
    if (u === 'https://stac.example/collections/dem-global') return json(col('dem-global', { keywords: ['elevation'] }));
    if (u === 'https://stac.example/collections/nolic') return json(col('nolic', { license: undefined, extent: undefined }));
    if (u === 'https://stac.example/search') {
      const b = JSON.parse(init.body);
      if (o.pages && !b.__page) return json(Object.assign(items(2, 5, null), { links: [{ rel: 'next', href: 'https://stac.example/search', method: 'POST', body: { __page: 2 }, merge: true }] }));
      if (o.pages && b.__page === 2) return json(items(3, 5, null));
      return json(items(Math.min(b.limit || 10, o.many || 3), o.many ? 500 : 3, null));
    }
    if (u.startsWith('https://ogc.example/collections/stations/items')) return json(items(4, 4, null));
    return json({}, 404);
  };
  return { fetch, calls };
}

function build(over, extra) {
  const w = fakeWorld(over);
  const rem = makeGisRemote(Object.assign({ fetch: w.fetch }, extra || {}));
  rem.add({ id: 'stac-x', kind: 'stac', url: 'https://stac.example' });
  rem.add({ id: 'ogc-x', kind: 'ogc-features', url: 'https://ogc.example' });
  rem.add({ id: 'down-x', kind: 'stac', url: 'https://down.example' });
  return { rem, calls: w.calls };
}
const only = (ids) => ({ catalogs: ids });

describe('gis-remote · addresses (⑤)', () => {
  const rem = makeGisRemote({});
  for (const bad of ['http://x.example/a', 'https://user:pw@x.example/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://10.1.2.3/a', 'https://192.168.0.5/a',
    'https://172.20.0.1/a', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/a', 'https://printer.local/a', 'https://svc.internal/a', 'file:///etc/passwd', 'not a url']) {
    test('refuses ' + bad, () => { const r = rem.publicUrl(bad); assert.equal(r.ok, false); assert.equal(r.why, 'url-not-public'); });
  }
  test('accepts an ordinary https host, and a public IP', () => {
    assert.equal(rem.publicUrl('https://earth-search.aws.element84.com/v1').ok, true);
    assert.equal(rem.publicUrl('https://8.8.8.8/x').ok, true);
    assert.equal(rem.publicUrl('https://172.32.0.1/x').ok, true, '172.32 is outside 172.16/12');
  });
  test('s3:// becomes the https address it stands for, and SAYS it was derived', () => {
    const r = rem.resolveHref('s3://bkt/a/b.tif');
    assert.equal(r.href, 'https://bkt.s3.amazonaws.com/a/b.tif');
    assert.equal(r.derivedFrom, 's3://bkt/a/b.tif');
    assert.equal(rem.resolveHref('https://x.example/a.tif').derivedFrom, null);
  });
  test('add() takes a catalogue only with a STATED kind and a public address', () => {
    assert.equal(rem.add({ kind: 'wms', url: 'https://x.example' }).why, 'catalog-kind-unknown');
    assert.equal(rem.add({ kind: 'stac', url: 'http://x.example' }).why, 'url-not-public');
    assert.equal(rem.add({ id: 'earth-search', kind: 'stac', url: 'https://x.example' }).why, 'bad-param');
  });
  test('a fetch to a private address is refused BEFORE any request', async () => {
    let asked = 0;
    const r2 = makeGisRemote({ fetch: async () => { asked++; return json({}); } });
    r2.add({ id: 'p', kind: 'stac', url: 'https://x.example' });
    assert.equal((await r2.add({ kind: 'stac', url: 'https://127.0.0.1' })).why, 'url-not-public');
    assert.equal(asked, 0);
  });
});

describe('gis-remote · what a collection STATES about place and time', () => {
  const rem = makeGisRemote({});
  test('spatial: covers / overlaps / outside / unstated, and a window across ±180 is not mangled', () => {
    const W = { w: 130, s: 30, e: 140, n: 40 };
    assert.equal(rem._spatialRelation([[-180, -90, 180, 90]], W), 'covers');
    assert.equal(rem._spatialRelation([[135, 35, 150, 50]], W), 'overlaps');
    assert.equal(rem._spatialRelation([[-80, 0, -70, 10]], W), 'outside');
    assert.equal(rem._spatialRelation(null, W), 'unstated');
    assert.equal(rem._spatialRelation([[-180, -90, 180, 90]], null), 'not-asked');
    /* Fiji-style window (w > e) against a box on the far side of the seam */
    assert.equal(rem._spatialRelation([[-180, -20, -170, -10]], { w: 175, s: -18, e: -175, n: -12 }), 'overlaps');
    assert.equal(rem._spatialRelation([[170, -20, 180, -10]], { w: 175, s: -18, e: -175, n: -12 }), 'overlaps');
    assert.equal(rem._spatialRelation([[0, -20, 10, -10]], { w: 175, s: -18, e: -175, n: -12 }), 'outside');
  });
  test('temporal: a bare year is the WHOLE year, an open end is open, no interval is unstated', () => {
    assert.deepEqual(rem._timeSpan('2023'), { from: Date.UTC(2023, 0, 1), to: Date.UTC(2024, 0, 1) });
    assert.equal(rem._temporalRelation([['2010-01-01T00:00:00Z', '2015-12-31T00:00:00Z']], '2023'), 'outside');
    assert.equal(rem._temporalRelation([['2010-01-01T00:00:00Z', '2015-12-31T00:00:00Z']], '2015'), 'overlaps');
    assert.equal(rem._temporalRelation([['2000-01-01T00:00:00Z', null]], '2023'), 'overlaps');
    assert.equal(rem._temporalRelation(null, '2023'), 'unstated');
    assert.equal(rem._temporalRelation(null, null), 'not-asked');
    assert.equal(rem._timeSpan('garbage').bad, true);
  });
});

describe('gis-remote · discover (②, ④)', () => {
  test('filters by place, period and EVERY word of q; "outside" is dropped, "unstated" is kept and marked', async () => {
    const { rem } = build();
    const r = await rem.discover(Object.assign({ q: 'elevation', bbox: [-122, 37, -121, 38], time: '2023' }, only(['stac-x'])));
    assert.equal(r.ok, true);
    const ids = r.entries.map((e) => e.id);
    assert.deepEqual(ids.sort(), ['dem-global', 'nolic'], 'jp-only is outside the place AND the period; the others stay');
    const nolic = r.entries.find((e) => e.id === 'nolic');
    assert.equal(nolic.match.spatial, 'unstated', 'a collection that states no extent is NOT claimed to cover the window');
    assert.equal(nolic.rights.license, null, '④ a licence not stated is null, never "open"');
    assert.equal(r.entries[0].id, 'dem-global', 'a stated covering extent outranks an unstated one');
    const none = await rem.discover(Object.assign({ q: 'elevation volcano', bbox: [0, 0, 1, 1] }, only(['stac-x'])));
    assert.equal(none.total, 0, 'every word is required');
  });
  test('② a catalogue that did not answer is REPORTED, not folded into 「nothing there」', async () => {
    const { rem } = build();
    const r = await rem.discover(only(['stac-x', 'down-x']));
    const down = r.catalogs.find((c) => c.id === 'down-x');
    assert.equal(down.answered, false);
    assert.equal(down.why, 'fetch-failed');
    assert.ok(r.entries.length > 0, 'the one that answered still answers');
    assert.equal(r.catalogs.find((c) => c.id === 'stac-x').complete, true);
  });
  test('refuses what it cannot read, by name, with the vocabulary', async () => {
    const { rem } = build();
    assert.equal((await rem.discover({ bbox: 'x' })).why, 'bad-param');
    assert.equal((await rem.discover({ time: 'garbage' })).why, 'bad-param');
    const u = await rem.discover({ catalogs: ['nope'] });
    assert.equal(u.why, 'catalog-unknown'); assert.ok(u.detail.catalogs.includes('earth-search'));
    assert.equal((await rem.discover({ kinds: ['wms'] })).why, 'bad-param');
  });
  test('the answer states ③ in words — a match is a STATEMENT, not a census', async () => {
    const { rem } = build();
    const r = await rem.discover(only(['stac-x']));
    assert.match(r.note, /worldCompleteness: unproven/);
  });
});

describe('gis-remote · inspect (③)', () => {
  test('inspect states the evidence; worldCompleteness is ALWAYS unproven, whatever the collection claims', async () => {
    const { rem } = build();
    const r = await rem.inspect('stac-x/dem-global', { bbox: [139, 35, 140, 36] });
    assert.equal(r.ok, true);
    assert.equal(r.evidence.spatialExtent, 'covers');
    assert.equal(r.evidence.license, 'stated');
    assert.equal(r.evidence.worldCompleteness, 'unproven');
    const a = r.sample.assets[0];
    assert.equal(a.cog, true); assert.equal(a.href, 'https://b.s3.amazonaws.com/k0.tif'); assert.equal(a.hrefDerivedFrom, 's3://b/k0.tif');
    const n = await rem.inspect('stac-x/nolic');
    assert.equal(n.evidence.license, 'unstated'); assert.equal(n.evidence.spatialExtent, 'not-asked');
    assert.equal((await rem.inspect('stac-x/missing')).why, 'collection-unknown');
    assert.equal((await rem.inspect('nonsense')).why, 'bad-param');
  });
  test('inspect answers with the refs the EXISTING doors read — discovery fetches no data itself', async () => {
    const { rem } = build();
    const r = await rem.inspect('stac-x/dem-global', { bbox: [139, 35, 140, 36] });
    assert.equal(r.refs.features, 'ogc:https://stac.example/collections/dem-global');
    assert.deepEqual(r.refs.grids, ['url:https://b.s3.amazonaws.com/k0.tif']);
    /* the guard is against a SECOND READER of values. acquire() (gis-data-acquisition-checks) is not one: it takes the door's readers by injection, and without them it refuses */
    assert.equal(typeof rem.readItems, 'undefined', 'a second reader of items would be a second implementation');
    assert.equal(typeof rem.readWindow, 'undefined');
    assert.equal((await rem.acquire('stac-x/dem-global', { bbox: [139, 35, 140, 36], width: 4, height: 4 })).why, 'bad-param', 'no reader handed in → no reading');
    assert.equal(typeof rem.cog, 'undefined');
  });
});

describe('gis-remote · declared in one place', () => {
  test('every refusal code the module can return is in refusals()', async () => {
    const rem = makeGisRemote({});
    const must = ['bad-param', 'url-not-public', 'catalog-unknown', 'catalog-kind-unknown', 'collection-unknown', 'fetch-failed', 'http-status', 'not-json', 'response-too-large'];
    for (const c of must) assert.ok(rem.refusals().includes(c), c);
    assert.ok(rem.kinds().includes('stac') && rem.kinds().includes('ogc-features'));
  });
  test('the built-in catalogues are all https, public and uniquely named', () => {
    const rem = makeGisRemote({});
    const ids = rem.catalogs().map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of rem.catalogs()) { assert.equal(rem.publicUrl(c.url).ok, true, c.id); assert.ok(rem.kinds().includes(c.kind), c.id); assert.ok(c.checked, c.id + ' has no observation date'); }
  });
});

describe('gis-sources · capabilityTable: every claim and every silence, asking nobody', () => {
  test('a registered source is in the table by being registered, and what it did not say is null, not false', () => {
    const S = makeGisSources();
    let asked = 0;
    S.supply('tbl-a', { fetch: async () => { asked++; return { ok: true, features: [] }; }, where: true });
    S.supply('tbl-b', { fetch: async () => { asked++; return { ok: true, features: [] }; } });
    S.declare('tbl-a', { extent: [-10, -10, 10, 10], complete: true });
    const t = S.capabilityTable();
    assert.equal(t.ok, true);
    const a = t.rows.find((r) => r.id === 'tbl-a'), b = t.rows.find((r) => r.id === 'tbl-b');
    assert.equal(a.road, 'supplier'); assert.equal(a.claimed.conditions, true); assert.equal(a.declared.extent, true); assert.equal(a.claimed.boundedEnd, true);
    assert.equal(b.claimed.conditions, false); assert.equal(b.declared.extent, false); assert.equal(b.claimed.boundedEnd, null, 'no declaration is silence (null), not "has no end" (false)');
    assert.equal(b.claimed.time, null, 'a supplier states nothing in advance about time');
    assert.equal(asked, 0, 'the table is free: no source was asked anything');
    assert.equal(t.summary.total, t.rows.length);
    assert.ok(t.summary.unstated.extent >= 1 && t.summary.cannot.conditions >= 1);
  });
});
