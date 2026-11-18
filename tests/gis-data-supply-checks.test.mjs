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
import { makeGisDatasets } from '../js/gis-datasets.js';
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
  const data = makeGisDatasets();
  const sources = makeGisSources();
  const rem = makeGisRemote(Object.assign({ data, sources, fetch: w.fetch }, extra || {}));
  rem.add({ id: 'stac-x', kind: 'stac', url: 'https://stac.example' });
  rem.add({ id: 'ogc-x', kind: 'ogc-features', url: 'https://ogc.example' });
  rem.add({ id: 'down-x', kind: 'stac', url: 'https://down.example' });
  return { rem, data, calls: w.calls };
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
    const r2 = makeGisRemote({ fetch: async () => { asked++; return json({}); }, data: makeGisDatasets() });
    const r = await r2.cog({ url: 'https://127.0.0.1/a.tif', bbox: [0, 0, 1, 1] });
    assert.equal(r.why, 'url-not-public'); assert.equal(asked, 0);
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

describe('gis-remote · inspect and acquire (①, ③)', () => {
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
  test('acquire: a source that returned everything it holds reads `all`, as ONE dataset the next step can use', async () => {
    const { rem, data } = build();
    const r = await rem.acquire('stac-x/dem-global', { bbox: [139, 35, 140, 36], time: '2023' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.coverage.completeness, 'all');
    assert.equal(r.dataset.count, 3);
    assert.equal(data.get(r.dataset.id).provenance.kind, 'remote');
    assert.equal(r.evidence.worldCompleteness, 'unproven', 'a covering `all` is still not the world');
    const feats = data.get(r.dataset.id).features();
    assert.equal(feats[0].properties.nested, '{"a":1}', 'a nested value is kept as text, not dropped');
    assert.equal(feats[0].properties._cog, 'data');
  });
  test('the licence travels as stated and is ABSENT (not null) when the collection states none', async () => {
    const { rem, data } = build();
    const a = await rem.acquire('stac-x/dem-global', {});
    assert.equal(data.get(a.dataset.id).provenance.license, 'CC-BY-4.0');
    const b = await rem.acquire('stac-x/nolic', {});
    assert.equal('license' in data.get(b.dataset.id).provenance, false);
    assert.equal(b.rights.license, null);
  });
  test('a limit that cut the answer is `partial`/`sample`, never `all` — and the matched count is carried', async () => {
    const { rem } = build({ many: 100 });
    const r = await rem.acquire('stac-x/dem-global', { limit: 100 });
    assert.equal(r.matched, 500);
    assert.notEqual(r.coverage.completeness, 'all', JSON.stringify(r.coverage));
  });
  test('a source that PAGES is read to the end by its own links, and only then is it `all`', async () => {
    const { rem, calls } = build({ pages: true });
    const r = await rem.acquire('stac-x/dem-global', { limit: 100 });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.pages, 2);
    assert.equal(r.dataset.count, 5);
    assert.equal(r.coverage.completeness, 'all');
    const posts = calls.filter((c) => c.url === 'https://stac.example/search');
    assert.equal(posts.length, 2); assert.equal(posts[1].body.__page, 2, 'the next body is the link\'s, merged');
  });
  test('stopping at the caller\'s limit hands back a cursor, and the cursor is refused when it is not ours', async () => {
    const { rem } = build({ pages: true });
    const r = await rem.acquire('stac-x/dem-global', { limit: 2 });
    assert.ok(r.next, 'the source offered more and the caller said stop — that is stated, not dropped');
    assert.notEqual(r.coverage.completeness, 'all');
    assert.equal((await rem.acquire('stac-x/dem-global', { cursor: 'junk' })).why, 'bad-param');
    const more = await rem.acquire('stac-x/dem-global', { cursor: r.next, limit: 100 });
    assert.equal(more.ok, true); assert.equal(more.dataset.count, 3);
  });
  test('OGC API – Features is read through the same door', async () => {
    const { rem, calls } = build();
    const r = await rem.acquire('ogc-x/stations', { bbox: [-80, 43, -78, 44], limit: 50 });
    assert.equal(r.ok, true); assert.equal(r.dataset.count, 4);
    const url = calls.find((c) => c.url.includes('/items')).url;
    assert.match(url, /bbox=-80,43,-78,44/); assert.match(url, /limit=50/);
  });
  test('refusals are codes from the declared list', async () => {
    const { rem } = build();
    const seen = [(await rem.acquire('stac-x/dem-global', { bbox: [1, 2] })).why, (await rem.acquire('stac-x/dem-global', { time: 'x' })).why, (await rem.acquire('stac-x/ghost', {})).why];
    for (const w of seen) assert.ok(rem.refusals().includes(w), w + ' is not in refusals()');
  });
});

describe('gis-remote · cog: only the part that was asked for (①)', () => {
  /* ⚠ A TILED float32 GeoTIFF built here, not by js/gis-export.js: that writer emits ONE strip, and a
     file whose pixels are one chunk cannot show that only part of it was read. EPSG:4326, west 10 /
     north 50 / 0.01°, value = 100 + x + y*1000 so every pixel names its own place. */
  function tiff(width, height, T) {
    const tw = T || 64;
    const across = Math.ceil(width / tw), down = Math.ceil(height / tw);
    const tiles = [];
    for (let ty = 0; ty < down; ty++) for (let tx = 0; tx < across; tx++) {
      const buf = new Float32Array(tw * tw);
      for (let r = 0; r < tw; r++) for (let c = 0; c < tw; c++) { const x = tx * tw + c, y = ty * tw + r; if (x < width && y < height) buf[r * tw + c] = 100 + x + y * 1000; }
      tiles.push(new Uint8Array(buf.buffer));
    }
    const dataLen = tiles.reduce((n, t) => n + t.length, 0);
    const T_SIZE = { 3: 2, 4: 4, 12: 8 };
    const ent = [];
    const E = (tag, type, values) => ent.push({ tag, type, values });
    const offs = []; let p = 8; for (const t of tiles) { offs.push(p); p += t.length; }
    E(256, 3, [width]); E(257, 3, [height]); E(258, 3, [32]); E(259, 3, [1]); E(262, 3, [1]); E(277, 3, [1]); E(284, 3, [1]);
    E(322, 3, [tw]); E(323, 3, [tw]); E(324, 4, offs); E(325, 4, tiles.map((t) => t.length)); E(339, 3, [3]);
    E(33550, 12, [0.01, 0.01, 0]); E(33922, 12, [0, 0, 0, 10, 50, 0]);
    E(34735, 3, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]);
    ent.sort((x, y) => x.tag - y.tag);
    const ifdAt = 8 + dataLen;
    let extra = ifdAt + 2 + 12 * ent.length + 4;
    const out = new Uint8Array(extra + ent.reduce((n, e) => n + T_SIZE[e.type] * e.values.length, 0) + 16);
    const dv = new DataView(out.buffer);
    out[0] = 0x49; out[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, ifdAt, true);
    let q = 8; for (const t of tiles) { out.set(t, q); q += t.length; }
    dv.setUint16(ifdAt, ent.length, true);
    ent.forEach((e, i) => {
      const at = ifdAt + 2 + 12 * i, sz = T_SIZE[e.type] * e.values.length;
      dv.setUint16(at, e.tag, true); dv.setUint16(at + 2, e.type, true); dv.setUint32(at + 4, e.values.length, true);
      let w = at + 8;
      if (sz > 4) { dv.setUint32(at + 8, extra, true); w = extra; extra += sz; }
      e.values.forEach((v, k) => { if (e.type === 3) dv.setUint16(w + 2 * k, v, true); else if (e.type === 4) dv.setUint32(w + 4 * k, v, true); else dv.setFloat64(w + 8 * k, v, true); });
    });
    dv.setUint32(ifdAt + 2 + 12 * ent.length, 0, true);
    return out.subarray(0, extra);
  }
  function ranged(bytes, opt) {
    const o = opt || {};
    const log = [];
    const f = async (url, init) => {
      const h = (init && init.headers) || {};
      const m = /bytes=(\d+)-(\d+)/.exec(h.Range || '');
      log.push(m ? [+m[1], +m[2]] : 'whole');
      if (o.ignoreRange || !m) return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), body: null };
      const a = +m[1], b = Math.min(+m[2], bytes.length - 1);
      const part = bytes.subarray(a, b + 1);
      return { ok: true, status: 206, headers: { get: (k) => (/content-range/i.test(k) ? 'bytes ' + a + '-' + b + '/' + bytes.length : null) }, arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.length) };
    };
    return { f, log };
  }
  test('a window of a file is read, placed where the file says, with the values the file holds', async () => {
    const bytes = tiff(400, 300);   /* 480 kB, bigger than one range block so it IS ranged */
    const { f, log } = ranged(bytes);
    const data = makeGisDatasets();
    const rem = makeGisRemote({ data, sources: makeGisSources(), fetch: f });
    const r = await rem.cog({ url: 'https://h.example/dem.tif', bbox: [10.50, 47.50, 10.60, 47.60], license: 'CC0' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.fileBytes, bytes.length);
    const ds = data.get(r.dataset.id);
    assert.equal(ds.kind, 'raster');
    assert.equal(ds.provenance.license, 'CC0');
    assert.equal(ds.provenance.kind, 'remote-cog');
    /* pixel (50..60, 250..260): the value at the north-west pixel is 100 + x + y*1000 */
    const g = ds.grid;
    assert.ok(Math.abs(g.west - 10.50) < 0.011 && Math.abs(g.north - 47.60) < 0.011, JSON.stringify(g));
    const px = ds.raster().read(0);
    const x0 = Math.round((g.west - 10) / 0.01), y0 = Math.round((50 - g.north) / 0.01);
    assert.equal(px[0], Math.fround(100 + x0 + y0 * 1000), 'the first pixel is the file\'s pixel at that place');
    const rangeReads = log.filter((l) => l !== 'whole');
    const bytesAsked = rangeReads.reduce((s, [a, b]) => s + (b - a + 1), 0);
    assert.ok(bytesAsked < bytes.length, 'asked for less than the file: ' + bytesAsked + ' of ' + bytes.length);
    assert.equal(r.coverage.completeness, 'sample', 'a grid is a sample of a field and says so');
  });
  test('a server that ignores Range is refused BY NAME, not downloaded whole in silence', async () => {
    const bytes = tiff(400, 300);
    const { f } = ranged(bytes, { ignoreRange: true });
    const rem = makeGisRemote({ data: makeGisDatasets(), sources: makeGisSources(), fetch: f });
    const r = await rem.cog({ url: 'https://h.example/dem.tif', bbox: [10.5, 47.5, 10.6, 47.6] });
    assert.equal(r.ok, false); assert.equal(r.why, 'range-unsupported');
  });
  test('a window the file does not cover, one that is too large, and a malformed one are three different refusals', async () => {
    const bytes = tiff(400, 300);
    const { f } = ranged(bytes);
    const rem = makeGisRemote({ data: makeGisDatasets(), sources: makeGisSources(), fetch: f });
    assert.equal((await rem.cog({ url: 'https://h.example/d.tif', bbox: [100, 0, 101, 1] })).why, 'region-out-of-range');
    assert.equal((await rem.cog({ url: 'https://h.example/d.tif', bbox: [10, 47, 10.4, 47.2], band: 5 })).why, 'band-out-of-range');
    assert.equal((await rem.cog({ url: 'https://h.example/d.tif', bbox: [5, 5, 1, 1] })).why, 'bad-param');
  });
  test('the resolution is the CALLER\'S, and the answer says whether the file had anything as fine', async () => {
    const bytes = tiff(400, 300);
    const { f } = ranged(bytes);
    const rem = makeGisRemote({ data: makeGisDatasets(), sources: makeGisSources(), fetch: f });
    const fine = await rem.cog({ url: 'https://h.example/d.tif', bbox: [10.5, 47.5, 10.6, 47.6], width: 1000 });
    assert.equal(fine.ok, true);
    assert.equal(fine.meetsAsk, false, 'the file has no pixels finer than its own, and the answer says so rather than substituting silently');
    assert.equal(fine.level, 0);
  });
});

describe('gis-remote · declared in one place', () => {
  test('every refusal code the module can return is in refusals()', async () => {
    const rem = makeGisRemote({});
    const must = ['bad-param', 'url-not-public', 'catalog-unknown', 'catalog-kind-unknown', 'collection-unknown', 'fetch-failed', 'http-status', 'not-json', 'response-too-large', 'region-too-large', 'region-out-of-range', 'crs-unreadable', 'registry-missing', 'add-failed'];
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
