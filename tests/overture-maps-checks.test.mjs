/* ============================================================================
 *  GIS · OVERTURE MAPS BY WINDOW — js/gis-overture.js
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE MEASURES, RESTATED AS DEFECTS ([[intmap-restate-the-defect-not-the-fix]]):
 *    ① 25 billion buildings cannot be loaded, so a window must reach ONLY the files, row groups and columns
 *      it needs — a read that opens everything is the failure, and it looks like a slow success;
 *    ② a release URL typed into code is dead in 60 days (the bucket expires releases) — the release is read;
 *    ③ «the catalogue did not answer» is not «there is nothing there»;
 *    ④ a licence is a value the ROWS state: the verbatim set of them, or no `licence` at all — never a guess for
 *      «Overture», and never `open` for a row that states none;
 *    ⑤ a GERS identifier is re-issued, so an object is never identified by the id alone — the id, the source
 *      records Overture stated for it, and the release;
 *    ⑥ a catalogue's `href` is data, not an instruction: an address that is not public is not fetched;
 *    ⑦ a result is an ordinary dataset of the registry — the input of the next step, with its coverage.
 *
 *  ⚠ NOTHING HERE TOUCHES THE NETWORK. A fake `fetch` serves the STAC catalogue and a fake Parquet reader serves
 *  files, so the verdicts are about this file's logic and cannot be a host's bad day. The real release was measured
 *  once, by hand, on 2026-11-20 (scripts/overture-probe.mjs, dev-notes/2026-11-20-overture-maps.md).
 * ==========================================================================*/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGisOverture } from '../js/gis-overture.js';
import { makeGisSources } from '../js/gis-sources.js';
import { read as govRead, account, attribution, freshness } from '../js/data-governance.js';
import { toSql } from '../scripts/world-graph/ingest-overture.mjs';
import { installWindow } from './helpers/geo-shared.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (o, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => o, text: async () => JSON.stringify(o) });
const S = 'https://stac.overturemaps.org';

/* ── a row, as Overture writes it ── */
function place(id, lng, lat, o) {
  const x = o || {};
  return {
    id, geometry: { type: 'Point', coordinates: [lng, lat] }, bbox: { xmin: lng, xmax: lng, ymin: lat, ymax: lat },
    names: { primary: x.name || null, common: null, rules: null }, taxonomy: { primary: x.cat || 'restaurant', hierarchy: ['a', x.cat || 'restaurant'], alternates: null },
    basic_category: x.cat || 'restaurant', confidence: x.conf == null ? 0.9 : x.conf,
    sources: x.sources === undefined ? [{ dataset: 'meta', license: 'CDLA-Permissive-2.0', record_id: x.rec || null }] : x.sources,
    addresses: [{ freeform: x.addr || null, country: 'JP' }], websites: ['https://x.example'], version: 1,
  };
}

/* three files by longitude; the middle one has two row groups, one far from the window */
const COLS = ['id', 'geometry', 'confidence', 'websites', 'addresses', 'names', 'sources', 'basic_category', 'taxonomy', 'version', 'bbox'].map((n) => ({ name: n, nested: ['websites', 'addresses', 'names', 'sources', 'taxonomy', 'bbox', 'geometry'].indexOf(n) >= 0 }));
function world(over) {
  const o = over || {};
  const f2rows = o.f2rows || [
    place('g-tokyo-1', 139.70, 35.60, { name: '東京セミコン', cat: 'manufacturer', rec: 'r1' }),
    place('g-tokyo-2', 139.80, 35.65, { name: 'Tokyo Port', cat: 'marina', rec: 'r2' }),
    place('g-kumamoto', 130.84, 32.89, { name: '熊本セミコンテクノパーク', cat: 'industrial_company', rec: 'r3', sources: [{ dataset: 'meta', license: 'CDLA-Permissive-2.0', record_id: 'r3' }, { dataset: 'Overture', license: 'CDLA-Permissive-2.0', record_id: null }] }),
    place('g-osaka', 135.50, 34.69, { name: 'Osaka', cat: 'cafe', rec: 'r4' }),
  ];
  /* file 2: [100,180] — row groups sorted by space: group 0 = Kumamoto/Osaka region, group 1 = Tokyo region, group 2 = far east */
  const files = {
    'https://bucket.example/places/part-0.parquet': { groups: [{ rows: [place('g-nyc', -74, 40.7, { rec: 'r9' })] }] },
    'https://bucket.example/places/part-1.parquet': { groups: [{ rows: [place('g-paris', 2.35, 48.85, { rec: 'r8' })] }] },
    'https://bucket.example/places/part-2.parquet': { groups: [{ rows: [f2rows[2], f2rows[3]] }, { rows: [f2rows[0], f2rows[1]] }, { rows: [place('g-far', 170, -40, { rec: 'r7' })] }] },
  };
  let start = 0;
  for (const u of Object.keys(files)) {
    start = 0;
    for (const g of files[u].groups) {
      g.start = start; start += g.rows.length;
      const xs = g.rows.map((r) => r.bbox.xmin), ys = g.rows.map((r) => r.bbox.ymin);
      g.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
  }
  const fetchLog = [];
  const extents = o.extents || [[-180, -90, 0, 90], [0, -90, 100, 90], [100, -90, 180, 90]];
  const itemBboxes = o.itemBboxes || extents;
  const fetch = async (url) => {
    const u = String(url); fetchLog.push(u);
    if (o.down) throw new Error('connect ECONNREFUSED');
    if (u === S + '/catalog.json') return json({ type: 'Catalog', latest: '2026-11-18.0', registry: { path: 's3://x/registry' }, links: [
      { rel: 'child', href: S + '/2026-10-21.0/catalog.json' }, { rel: 'child', href: S + '/2026-11-18.0/catalog.json', latest: true }] });
    if (u === S + '/2026-11-18.0/catalog.json') return json({ type: 'Catalog', id: '2026-11-18.0', links: [{ rel: 'child', href: S + '/2026-11-18.0/places/catalog.json' }, { rel: 'child', href: S + '/2026-11-18.0/buildings/catalog.json' }] });
    if (u === S + '/2026-11-18.0/places/catalog.json') return json({ id: 'places', links: [{ rel: 'child', href: S + '/2026-11-18.0/places/place/collection.json' }, { rel: 'pmtiles', href: 'https://tiles.example/places.pmtiles' }] });
    if (u === S + '/2026-11-18.0/buildings/catalog.json') return json({ id: 'buildings', links: [{ rel: 'child', href: S + '/2026-11-18.0/buildings/building/collection.json' }] });
    if (u === S + '/2026-11-18.0/places/place/collection.json') return json({ id: 'place', license: 'other', extent: { spatial: { bbox: [[-180, -90, 180, 90]].concat(extents) } },
      links: [0, 1, 2].map((i) => ({ rel: 'item', href: S + '/2026-11-18.0/places/place/0000' + i + '/0000' + i + '.json' })) });
    const m = /places\/place\/0000(\d)\/0000\d\.json$/.exec(u);
    if (m) { const i = +m[1]; const href = o.badHref && i === 2 ? o.badHref : 'https://bucket.example/places/part-' + i + '.parquet';
      return json({ id: '0000' + i, bbox: itemBboxes[i], properties: { num_rows: 9, num_row_groups: 1 }, assets: { aws: { href: href } } }); }
    return json({}, 404);
  };
  const readLog = [], openLog = [];
  const parquet = {
    async open(url, io) {
      openLog.push(url);
      const f = files[url];
      if (!f) throw new Error('no such file ' + url);
      return { url, io, columns: o.columns || COLS, numRows: 9, rowGroups: f.groups.map((g) => ({ start: g.start, rows: g.rows.length, bbox: g.bbox })), _f: f };
    },
    async read(h, a, b, cols) {
      readLog.push({ url: h.url, a: a, b: b, cols: cols.slice() });
      h.io.requests++; h.io.bytes += (b - a) * 10;
      const all = [].concat(...h._f.groups.map((g) => g.rows));
      return { get: (c, i) => (i >= a && i < b && all[i] ? all[i][c] : undefined) };
    },
  };
  return { fetch, fetchLog, parquet, readLog, openLog };
}
const mk = (over, extra) => { const w = world(over); return Object.assign({ O: makeGisOverture(Object.assign({ fetch: w.fetch, parquet: w.parquet, dataHosts: ['bucket.example'], now: () => Date.parse('2026-11-20T00:00:00Z') }, extra || {})) }, w); };
const TOKYO = [139.4, 35.0, 140.4, 36.0];

describe('gis-overture · the release is read, never typed (②③)', () => {
  test('latest comes from the catalogue; the date is said as a date', async () => {
    const { O } = mk();
    const r = await O.release();
    assert.equal(r.ok, true); assert.equal(r.version, '2026-11-18.0'); assert.equal(r.asOf, '2026-11-18');
    assert.deepEqual(r.releases, ['2026-10-21.0', '2026-11-18.0']);
  });
  test('an older release is asked by name; an unknown one is refused with the list', async () => {
    const { O } = mk();
    assert.equal((await O.release({ version: '2026-10-21.0' })).version, '2026-10-21.0');
    const r = await O.release({ version: '2020-01-01.0' });
    assert.equal(r.ok, false); assert.equal(r.why, 'release-unknown'); assert.deepEqual(r.detail.releases, ['2026-10-21.0', '2026-11-18.0']);
  });
  test('a catalogue that did not answer is catalogue-unreachable — not an empty list', async () => {
    const { O } = mk({ down: true });
    for (const r of [await O.release(), await O.plan({ theme: 'places', type: 'place', bbox: TOKYO }), await O.query({ theme: 'places', type: 'place', bbox: TOKYO })]) {
      assert.equal(r.ok, false); assert.equal(r.why, 'catalogue-unreachable'); assert.equal(r.features, undefined);
    }
  });
  test('themes() states what the release holds, from the catalogue', async () => {
    const { O } = mk();
    const t = await O.themes();
    assert.deepEqual(t.themes.map((x) => x.theme + ':' + x.types.map((y) => y.type).join(',')), ['places:place', 'buildings:building']);
    assert.equal(t.themes[0].pmtiles, 'https://tiles.example/places.pmtiles');
  });
  test('an unknown theme / type is refused with what exists', async () => {
    const { O } = mk();
    const a = await O.plan({ theme: 'nope', type: 'place', bbox: TOKYO }); assert.equal(a.why, 'theme-unknown'); assert.deepEqual(a.detail.themes, ['places', 'buildings']);
    const b = await O.plan({ theme: 'places', type: 'nope', bbox: TOKYO }); assert.equal(b.why, 'type-unknown'); assert.deepEqual(b.detail.types, ['place']);
  });
});

describe('gis-overture · plan(): which files, and nothing of their rows (①)', () => {
  test('only the files whose stated extent meets the window are named, and only those items are fetched', async () => {
    const { O, fetchLog } = mk();
    const p = await O.plan({ theme: 'places', type: 'place', bbox: TOKYO });
    assert.equal(p.ok, true);
    assert.deepEqual(p.files.map((f) => f.id), ['00002']);
    assert.equal(p.filesTotal, 3);
    assert.equal(fetchLog.filter((u) => /places\/place\/0000\d\/0000\d\.json$/.test(u)).length, 1, 'a file that cannot touch the window was fetched');
    assert.equal(p.extentsAligned, true);
  });
  test('a window across the antimeridian is two windows', async () => {
    const { O } = mk();
    const p = await O.plan({ theme: 'places', type: 'place', bbox: [170, -10, -170, 10] });
    assert.equal(p.bbox.length, 2); assert.deepEqual(p.files.map((f) => f.id), ['00000', '00002']);
  });
  test('a window that is not [w,s,e,n] in degrees is refused', async () => {
    const { O } = mk();
    for (const b of ['x', [1, 2, 3], [0, 10, 1, 5], [0, -91, 1, 5], [NaN, 0, 1, 1], [-181, 0, 1, 1]]) {
      const r = await O.plan({ theme: 'places', type: 'place', bbox: b }); assert.equal(r.ok, false, JSON.stringify(b)); assert.equal(r.why, 'bad-param');
    }
  });
  test('when the collection\'s extents do not line up with its items, EVERY item is read — a file is never guessed away', async () => {
    const { O, fetchLog } = mk({ extents: [[-180, -90, 0, 90], [0, -90, 100, 90], [100, -90, 180, 90]], itemBboxes: [[-180, -90, 0, 90], [0, -90, 99.5, 90], [90, -90, 180, 90]] });
    const p = await O.plan({ theme: 'places', type: 'place', bbox: [95, 0, 99, 1] });
    assert.equal(p.extentsAligned, false);
    assert.deepEqual(p.files.map((f) => f.id).sort(), ['00001', '00002']);
    assert.equal(fetchLog.filter((u) => /places\/place\/0000\d\/0000\d\.json$/.test(u)).length >= 3, true);
  });
  test('⑥ an address that does not state itself public is not fetched', async () => {
    for (const bad of ['http://bucket.example/p.parquet', 'https://127.0.0.1/p.parquet', 'https://[::1]/p', 'https://user:pw@bucket.example/p', 'https://10.0.0.5/p', 'https://x.internal/p', 'https://localhost/p']) {
      const { O } = mk({ badHref: bad });
      const p = await O.plan({ theme: 'places', type: 'place', bbox: TOKYO });
      assert.equal(p.ok, false, bad); assert.equal(p.why, 'url-not-public');
      const q = await O.query({ theme: 'places', type: 'place', bbox: TOKYO }); assert.equal(q.why, 'url-not-public', bad);
    }
  });
});

describe('gis-overture · only the hosts Privacy §4 names are fetched (⑥)', () => {
  test('a public https file on a host nobody disclosed is not opened', async () => {
    const { O, openLog } = mk({ badHref: 'https://evil.example/p.parquet' });
    const q = await O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    assert.equal(q.ok, false); assert.equal(q.why, 'host-not-disclosed'); assert.equal(q.detail.host, 'evil.example');
    assert.deepEqual(openLog, []);
  });
  test('a catalogue entry that points off the catalogue\'s own host is not fetched', async () => {
    const w = world();
    const f = async (u) => (String(u).endsWith('place/collection.json') ? json({ id: 'place', extent: { spatial: { bbox: [[-180, -90, 180, 90], [100, -90, 180, 90]] } }, links: [{ rel: 'item', href: 'https://evil.example/item.json' }] }) : w.fetch(u));
    const O = makeGisOverture({ fetch: f, parquet: w.parquet, dataHosts: ['bucket.example'] });
    const p = await O.plan({ theme: 'places', type: 'place', bbox: TOKYO });
    assert.equal(p.ok, false); assert.equal(p.why, 'host-not-disclosed');
  });
  test('the real defaults are the two hosts the ledger and the policy state', () => {
    const led = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/outbound-hosts.json'), 'utf8')).hosts.map((h) => h.host);
    const src = fs.readFileSync(path.join(ROOT, 'js/gis-overture.js'), 'utf8');
    const data = /const DATA_HOSTS = \['([^']+)'\]/.exec(src)[1];
    for (const h of [data, new URL(makeGisOverture({}).terms().stac).hostname]) assert.ok(led.indexOf(h) >= 0, h + ' is fetched and not in scripts/outbound-hosts.json');
  });
});

describe('gis-overture · query(): the rows of a window (①)', () => {
  test('row groups outside the window are never opened; pass 1 reads bbox only; pass 2 only the groups that matched', async () => {
    const { O, readLog, openLog } = mk();
    const r = await O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    assert.equal(r.ok, true);
    assert.deepEqual(r.features.map((f) => f.id).sort(), ['g-tokyo-1', 'g-tokyo-2']);
    assert.deepEqual(openLog, ['https://bucket.example/places/part-2.parquet'], 'a file outside the window was opened');
    assert.deepEqual(r.read.rowGroups, { total: 3, read: 1, matched: 1 });
    const scans = readLog.filter((x) => x.cols.length === 1 && x.cols[0] === 'bbox');
    assert.equal(scans.length, 1);
    assert.deepEqual([scans[0].a, scans[0].b], [2, 4], 'only Tokyo\'s row group was scanned');
    assert.equal(readLog.every((x) => x.a >= 2 && x.b <= 4), true, 'rows of the other groups were read');
  });
  test('the contact lists are not read unless asked for; geometry and id always are', async () => {
    const { O, readLog } = mk();
    await O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    const pass2 = readLog.filter((x) => x.cols.length > 1);
    assert.equal(pass2.length >= 1, true);
    for (const x of pass2) { assert.equal(x.cols.indexOf('websites'), -1); assert.ok(x.cols.indexOf('geometry') >= 0 && x.cols.indexOf('id') >= 0); }
    const w = mk();
    await w.O.query({ theme: 'places', type: 'place', bbox: TOKYO, columns: ['names', 'websites'] });
    assert.ok(w.readLog.filter((x) => x.cols.length > 1)[0].cols.indexOf('websites') >= 0);
  });
  test('a feature is GeoJSON with what Overture states on the row', async () => {
    const { O } = mk();
    const r = await O.query({ theme: 'places', type: 'place', bbox: [130, 32, 131, 33] });
    const f = r.features[0];
    assert.equal(f.type, 'Feature'); assert.equal(f.id, 'g-kumamoto'); assert.deepEqual(f.geometry, { type: 'Point', coordinates: [130.84, 32.89] });
    assert.equal(f.properties.gers, 'g-kumamoto'); assert.equal(f.properties.name, '熊本セミコンテクノパーク'); assert.equal(f.properties.category, 'industrial_company');
    assert.equal(f.properties.source_licences, 'CDLA-Permissive-2.0');
    assert.deepEqual(JSON.parse(f.properties.source_records), [{ dataset: 'meta', record_id: 'r3' }], 'a source with no record id states none — it is not invented');
    assert.equal(r.windowTest, 'bbox-intersects'); assert.equal(r.worldCompleteness, 'unproven');
  });
  test('where: the same vocabulary as every other condition, and a missing value satisfies nothing', async () => {
    const { O } = mk();
    const q = (where) => O.query({ theme: 'places', type: 'place', bbox: [100, -90, 180, 90], where });
    assert.deepEqual((await q([{ field: 'names.primary', op: 'contains', value: 'セミコン' }])).features.map((f) => f.id).sort(), ['g-kumamoto', 'g-tokyo-1']);
    assert.deepEqual((await q([{ field: 'taxonomy.primary', op: 'in', value: ['marina', 'cafe'] }])).features.map((f) => f.id).sort(), ['g-osaka', 'g-tokyo-2']);
    assert.deepEqual((await q([{ field: 'taxonomy.primary', op: '==', value: 'marina' }, { field: 'names.primary', op: 'contains', value: 'Tokyo' }])).features.map((f) => f.id), ['g-tokyo-2'], 'two conditions are AND');
    assert.equal((await q([{ field: 'confidence', op: 'between', value: [0.95, 1] }])).count, 0);
    assert.equal((await q([{ field: 'confidence', op: '>=', value: 0.9 }])).count, 5);
    assert.equal((await q([{ field: 'names.primary', op: '!=', value: 'Osaka' }])).count, 3, 'the far row has no name: not «a name other than Osaka»');
    const e = mk({ f2rows: [place('n1', 139.7, 35.6, { name: null }), place('n2', 139.8, 35.6, { name: 'X' }), place('n3', 130.8, 32.8), place('n4', 135.5, 34.6)] });
    assert.deepEqual((await e.O.query({ theme: 'places', type: 'place', bbox: TOKYO, where: [{ field: 'names.primary', op: '!=', value: 'Osaka' }] })).features.map((f) => f.id), ['n2'], 'a row with no name is not «a name other than Osaka»');
  });
  test('an unknown op / column / malformed where is refused by name, with the vocabulary', async () => {
    const { O } = mk();
    const op = await O.query({ theme: 'places', type: 'place', bbox: TOKYO, where: [{ field: 'confidence', op: 'like', value: 1 }] });
    assert.equal(op.why, 'op-unknown'); assert.ok(op.detail.ops.indexOf('contains') >= 0);
    const col = await O.query({ theme: 'places', type: 'place', bbox: TOKYO, where: [{ field: 'nonexistent', op: '==', value: 1 }] });
    assert.equal(col.why, 'column-unknown'); assert.ok(col.detail.columns.indexOf('names') >= 0);
    assert.equal((await O.query({ theme: 'places', type: 'place', bbox: TOKYO, where: 'x' })).why, 'bad-param');
    assert.equal((await O.query({ theme: 'places', type: 'place', bbox: TOKYO, where: [{ field: 'a', op: 'in', value: 3 }] })).why, 'bad-param');
    assert.equal((await O.query({ theme: 'places', type: 'place', bbox: TOKYO, limit: 0 })).why, 'bad-param');
  });
  test('the comparison vocabulary is js/gis-ops.js\'s CONDITION_OPS, spelled the same', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/gis-ops.js'), 'utf8');
    const m = /const CONDITION_OPS = \[([^\]]*)\]/.exec(src);
    assert.ok(m, 'CONDITION_OPS not found in js/gis-ops.js');
    const ops = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
    assert.deepEqual(makeGisOverture({}).ops().slice().sort(), ops.slice().sort());
  });
  test('a limit truncates and SAYS so; the count before it is carried', async () => {
    const { O } = mk();
    const r = await O.query({ theme: 'places', type: 'place', bbox: [100, -90, 180, 90], limit: 2 });
    assert.equal(r.count, 2); assert.equal(r.available, 5); assert.equal(r.truncated, true);
  });
  test('a reader that fails is read-failed, not an empty answer', async () => {
    const w = world();
    const O = makeGisOverture({ fetch: w.fetch, dataHosts: ['bucket.example'], parquet: { open: w.parquet.open, read: async () => { throw new Error('range 416'); } } });
    const r = await O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    assert.equal(r.ok, false); assert.equal(r.why, 'read-failed'); assert.equal(r.features, undefined);
  });
  test('cancelled is cancelled', async () => {
    const { O } = mk();
    const ctl = new AbortController(); ctl.abort();
    const r = await O.query({ theme: 'places', type: 'place', bbox: TOKYO, signal: ctl.signal });
    assert.equal(r.ok, false); assert.equal(r.why, 'cancelled');
  });
});

describe('gis-overture · the licence is a value the rows state (④)', () => {
  test('the dataset\'s licence is the verbatim SET of the rows\' own', async () => {
    const m = mk({ f2rows: [place('a', 139.7, 35.6, { sources: [{ dataset: 'osm', license: 'ODbL-1.0', record_id: 'w1@1' }] }), place('b', 139.8, 35.6, { sources: [{ dataset: 'meta', license: 'CDLA-Permissive-2.0', record_id: '9' }] }), place('c', 130.8, 32.8), place('d', 135.5, 34.6)] });
    const r = await m.O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    assert.deepEqual(r.licences.sort(), ['CDLA-Permissive-2.0', 'ODbL-1.0']);
    assert.equal(r.provenance.licence, 'CDLA-Permissive-2.0; ODbL-1.0'.split('; ').sort().join('; '));
    assert.equal(r.provenance.attribution, true); assert.match(attribution(r.provenance), /ODbL-1\.0/);
  });
  test('rows that state none → NO `licence` member at all (silence is not a grant), and the terms page is still named', async () => {
    const m = mk({ f2rows: [place('a', 139.7, 35.6, { sources: [{ dataset: 'x', license: null, record_id: '1' }] }), place('b', 139.8, 35.6, { sources: [] }), place('c', 130.8, 32.8), place('d', 135.5, 34.6)] });
    const r = await m.O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    assert.equal('licence' in r.provenance, false); assert.deepEqual(r.licences, []);
    assert.equal(r.provenance.licenceUrl, 'https://docs.overturemaps.org/attribution/');
  });
  test('the record is in js/data-governance.js\'s own vocabulary: it reads, accounts, credits and ages', async () => {
    const { O } = mk();
    const r = await O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    const g = govRead(r.provenance);
    assert.equal(g.publisher, 'Overture Maps Foundation');
    assert.equal(g.licence, 'CDLA-Permissive-2.0');
    assert.equal(g.asOf, '2026-11-18'); assert.equal(g.cadence, 'P1M');
    assert.equal(g.builtBy, 'js/gis-overture.js');
    assert.equal(g.paidBy, makeGisOverture({}).terms().creditRow);
    assert.match(attribution(r.provenance), /Overture/);
    const acc = account(r.provenance);
    const silent = acc.undeclared.map((u) => u.facet);
    for (const f of ['origin.publisher', 'origin.url', 'origin.retrievedAt', 'origin.builtBy', 'rights.licence', 'rights.licenceUrl', 'rights.attribution', 'rights.paidBy', 'freshness.asOf', 'freshness.cadence', 'integrity.schema']) assert.equal(silent.indexOf(f), -1, 'facet left silent: ' + f);
    assert.equal(freshness(r.provenance, '2026-11-20T00:00:00Z').verdict, 'fresh');
    assert.equal(freshness(r.provenance, '2027-03-01T00:00:00Z').verdict, 'stale', 'a monthly release four months old is stale');
  });
  test('the credit row it names exists in the reader-visible sources (matched by value)', () => {
    const t = makeGisOverture({}).terms();
    const src = fs.readFileSync(path.join(ROOT, 'js/reference-data.js'), 'utf8');
    assert.ok(src.includes("n:'" + t.creditRow + "'") || src.includes('n:"' + t.creditRow + '"'), 'DATA_SOURCES has no row named «' + t.creditRow + '»');
  });
});

describe('gis-overture · a result is a dataset of the registry (⑦)', () => {
  test('acquire() registers it; coverage is js/gis-sources.js\'s verdict, never a second one', async () => {
    const data = (await bootData()).data;
    const S2 = makeGisSources();
    const { O } = mk({}, { data: data, sources: S2 });
    const r = await O.acquire({ theme: 'places', type: 'place', bbox: TOKYO, title: 'Tokyo places' });
    assert.equal(r.ok, true, JSON.stringify(r));
    const ds = data.get(r.id);
    assert.equal(ds.count, 2); assert.equal(ds.title, 'Tokyo places'); assert.equal(ds.crs, 'EPSG:4326');
    assert.equal(ds.provenance.publisher, 'Overture Maps Foundation'); assert.equal(ds.provenance.release, '2026-11-18.0');
    assert.deepEqual(ds.provenance.recipe, { door: 'overture', theme: 'places', type: 'place', release: '2026-11-18.0', bbox: TOKYO, where: null });
    assert.equal(ds.provenance.coverage.completeness, 'all'); assert.equal(ds.provenance.worldCompleteness, 'unproven');
    assert.ok(ds.fields.some((f) => f.name === 'name'));
    const lim = await O.acquire({ theme: 'places', type: 'place', bbox: [100, -90, 180, 90], limit: 2 });
    assert.equal(data.get(lim.id).provenance.coverage.completeness, 'sample');
    assert.equal(data.get(lim.id).provenance.coverage.reason, 'limit-truncated');
  });
  test('without a registry it is refused by name, not thrown', async () => {
    const { O } = mk({}, { data: null });
    const r = await O.acquire({ theme: 'places', type: 'place', bbox: TOKYO });
    assert.equal(r.ok, false); assert.equal(r.why, 'add-failed');
  });
  test('the next step takes it as an input: relate nearer-than over two Overture datasets', async () => {
    const { data, ops } = await bootData();
    const { O } = mk({}, { data: data, sources: makeGisSources() });
    const sites = await O.acquire({ theme: 'places', type: 'place', bbox: [100, -90, 180, 90], where: [{ field: 'names.primary', op: 'contains', value: 'セミコン' }] });
    const ports = await O.acquire({ theme: 'places', type: 'place', bbox: [100, -90, 180, 90], where: [{ field: 'taxonomy.primary', op: '==', value: 'marina' }] });
    assert.equal(sites.result.count, 2); assert.equal(ports.result.count, 1);
    const near = await ops.run({ op: 'relate', inputs: [sites.id, ports.id], params: { predicate: 'nearer-than', maxKm: 100 } });
    assert.equal(near.ok, true, near.why);
    const rows = near.dataset.features();
    assert.deepEqual(rows.map((f) => f.properties.gers), ['g-tokyo-1'], 'Tokyo\'s site is 10 km from Tokyo\'s port; Kumamoto\'s is ~900 km');
  });
});

describe('gis-overture · the world graph (⑤)', () => {
  test('worldNodes(): ids.gers, the stated position, and the source records in the history', async () => {
    const { O } = mk();
    const r = await O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    const w = O.worldNodes(r);
    assert.equal(w.ok, true);
    const n = w.nodes.find((x) => x.ids.gers === 'g-tokyo-1');
    assert.equal(n.type, 'facility'); assert.match(n.ref, /^facility:gers-g-tokyo-1$/); assert.equal(n.name, '東京セミコン');
    assert.equal(n.lng, 139.70); assert.equal(n.lat, 35.60); assert.equal(n.provenance, 'source_coordinate'); assert.equal(n.country, null);
    assert.equal(n.facts.overture.release, '2026-11-18.0'); assert.equal(n.facts.country_iso2, 'JP');
    assert.equal(n.sources[0].licence, 'CDLA-Permissive-2.0');
    const h = w.history.find((x) => x.id === 'g-tokyo-1');
    assert.deepEqual(h, { ref: n.ref, scheme: 'gers', id: 'g-tokyo-1', release: '2026-11-18.0', status: 'present', source_records: [{ dataset: 'meta', record_id: 'r1' }], observed: '2026-11-20' });
    assert.ok(/^[a-z_]+:.{1,200}$/.test(n.ref), 'the ref breaks the table\'s check');
  });
  test('a polygon has no position to state: lng/lat null, never a centroid made up here', async () => {
    const poly = Object.assign(place('g-poly', 139.7, 35.6, { name: 'Block', rec: 'r5' }), { geometry: { type: 'Polygon', coordinates: [[[139.7, 35.6], [139.71, 35.6], [139.71, 35.61], [139.7, 35.6]]] } });
    const { O } = mk({ f2rows: [poly, place('x', 139.8, 35.6), place('y', 130.8, 32.8), place('z', 135.5, 34.6)] });
    const w = O.worldNodes(await O.query({ theme: 'places', type: 'place', bbox: TOKYO }));
    const n = w.nodes.find((x) => x.ids.gers === 'g-poly');
    assert.equal(n.lng, null); assert.equal(n.lat, null); assert.equal(n.provenance, null);
  });
  test('toSql(): idempotent upserts, the id adopted BEFORE the write, a name with a quote is escaped, one transaction', async () => {
    const { O } = mk({ f2rows: [place('g-1', 139.7, 35.6, { name: "O'Hara \\ plant", rec: 'r1' }), place('g-2', 139.8, 35.6, { rec: 'r2' }), place('g-3', 130.8, 32.8), place('g-4', 135.5, 34.6)] });
    const r = await O.query({ theme: 'places', type: 'place', bbox: TOKYO });
    const sql = toSql(O.worldNodes(r), { release: r.release.version, theme: 'places', type: 'place' });
    assert.match(sql, /^-- IntMap world graph/); assert.match(sql, /\nbegin;\n/); assert.match(sql, /\ncommit;\n$/);
    assert.equal((sql.match(/insert into public\.world_graph_nodes/g) || []).length, 2);
    assert.equal((sql.match(/insert into public\.world_graph_id_history/g) || []).length, 2);
    assert.equal((sql.match(/public\.world_graph_adopt_id\(/g) || []).length, 4, 'every write asks which object the id belongs to');
    assert.match(sql, /on conflict \(ref\) do update/); assert.match(sql, /on conflict \(ref, scheme, ext_id, release\) do update/);
    assert.match(sql, /ids = public\.world_graph_nodes\.ids \|\| excluded\.ids/, 'ids is merged, never replaced wholesale');
    assert.ok(sql.includes("'O''Hara \\ plant'"), 'a quote is doubled');
    assert.ok(!/world_graph_nodes[^;]*\(select/i.test(sql.replace(/world_graph_adopt_id/g, '')), 'a node is written without a subselect');
  });
  test('the migration holds what the SQL above calls', () => {
    const mig = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261125120000_world_graph_id_history.sql'), 'utf8');
    for (const s of ['create table if not exists public.world_graph_id_history', 'function public.world_graph_resolve_id', 'function public.world_graph_adopt_id', 'enable row level security', 'grant all on public.world_graph_id_history to service_role', 'world_graph_id_history_uq']) assert.ok(mig.includes(s), 'migration lacks: ' + s);
    assert.ok(/revoke execute on function public\.world_graph_adopt_id[^;]*from public, anon, authenticated/.test(mig), 'the ingest helper must not be callable by a reader');
    assert.ok(!/grant (insert|update|delete|all)[^;]*world_graph_id_history[^;]*(anon|authenticated)/i.test(mig), 'a client role was given write on the history');
  });
});

describe('gis-overture · the module itself', () => {
  test('imports in Node with no DOM, publishes ONE export, and registers on window only when there is one', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/gis-overture.js'), 'utf8');
    assert.equal((src.match(/^export /gm) || []).length, 1);
    assert.equal(typeof makeGisOverture, 'function');
    assert.deepEqual(makeGisOverture({}).actions(), ['release', 'themes', 'plan', 'query', 'acquire']);
  });
  test('no release version, no bucket address and no hand-written list of themes lives in the module', () => {
    const src = codeOnly(fs.readFileSync(path.join(ROOT, 'js/gis-overture.js'), 'utf8'));
    assert.ok(!/\b20\d\d-\d\d-\d\d\.\d\b/.test(src), 'a release version is written in code');
    assert.ok(!/s3:\/\//.test(src), 'an s3:// address is written in code');
    assert.ok(!/'(places|buildings|divisions|transportation)'.*'(places|buildings|divisions|transportation)'/.test(src),'a list of themes is written in code — the catalogue says which themes exist');
  });
  test('every refusal code the module returns is declared', () => {
    const O = makeGisOverture({});
    const src = fs.readFileSync(path.join(ROOT, 'js/gis-overture.js'), 'utf8');
    const used = [...src.matchAll(/refuse\('([a-z-]+)'/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    for (const u of used) assert.ok(O.refusals().indexOf(u) >= 0, 'undeclared refusal: ' + u);
  });
});

/* the real registry and the real ops, as tests/atlas-gis-checks.test.mjs boots them */
async function bootData() {
  installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  const w = globalThis.window;
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisRaster = makeGisRaster(); w.IntMapGisExpr = makeGisExpr();
  await geometry.ready();
  return { data, ops };
}
