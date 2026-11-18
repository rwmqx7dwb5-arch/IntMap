/* ============================================================================
 *  GIS FOUNDATION REFINE · KML / GPX WRITERS AND THE ATLAS DOOR TO EXPORT
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE MEASURES, RESTATED AS DEFECTS ([[intmap-restate-the-defect-not-the-fix]]):
 *    ① a dataset could leave the app only as a spreadsheet, a GIS container or GeoJSON — not as the
 *      two files a phone, Google Earth and a handheld GPS open — and what the writer produced was
 *      never put back through a reader that is not the writer;
 *    ② a shape a format cannot hold (a polygon in GPX) is the case where 「書き出しました」 is a lie
 *      the moment it leaves the polygons out;
 *    ③ a time column that only LOOKS like a date, or a value that is not a date in the format's
 *      lexical space, is written as a moment nobody declared;
 *    ④ Atlas could draw, save and re-run a dataset and could not take it away.
 *
 *  ⚠ THE FAR END OF EVERY LOOP IS A READER THAT ALREADY EXISTS (js/geo-import.js decodeKML /
 *  decodeGPX). Node has no DOMParser and this repository has no XML dependency, so a STRICT parser
 *  is written HERE — it throws on anything XML 1.0 forbids (an unescaped `&` or `<`, a control
 *  code, a mismatched tag, an unquoted attribute) — and, where a real Chromium can be launched,
 *  the same bytes are handed to the browser's own DOMParser as the independent witness.
 *  There is no epsilon: JSON/JS number-to-text is the shortest round-tripping decimal.
 * ==========================================================================*/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GEO_IMPORT } from '../js/geo-import.js';
import { makeGisDatasets } from '../js/gis-datasets.js';
import { makeGisExport } from '../js/gis-export.js';
import '../js/safe-html.js';
import { read } from './helpers/geo-shared.mjs';

/* ── a strict XML 1.0 reader exposing the slice of the DOM js/geo-import.js uses ─────────────── */
const CHAR = /^[\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]*$/u;
const NAME = /^[A-Za-z_][\w.\-]*(:[A-Za-z_][\w.\-]*)?$/;
function unescapeXml(s, where) {
  if (/&(?!(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);)/.test(s)) throw new Error('bare & in ' + where);
  return s.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e === 'amp') return '&'; if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
    return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}
function parseStrict(text) {
  if (!CHAR.test(text)) throw new Error('illegal XML character');
  let i = 0;
  const fail = (m) => { throw new Error(m + ' at ' + i + ': ' + text.slice(Math.max(0, i - 20), i + 20)); };
  const mk = (qname, attrs, parent) => {
    const n = { qname, localName: qname.includes(':') ? qname.split(':')[1].toLowerCase() : qname.toLowerCase(), attrs, children: [], parentElement: parent, text: '', nextElementSibling: null, firstElementChild: null };
    Object.defineProperty(n, 'textContent', { get() { return n.text + n.children.map((c) => c.textContent).join(''); } });
    n.getAttribute = (k) => (k in attrs ? attrs[k] : null);
    return n;
  };
  if (text.startsWith('<?xml')) { const e = text.indexOf('?>'); if (e < 0) fail('unterminated declaration'); i = e + 2; }
  let root = null; const stack = [];
  while (i < text.length) {
    if (text[i] === '<') {
      if (text[i + 1] === '/') {
        const e = text.indexOf('>', i); const nm = text.slice(i + 2, e).trim(); const top = stack.pop();
        if (!top || top.qname !== nm) fail('mismatched </' + nm + '>'); i = e + 1; continue;
      }
      let j = i + 1; while (j < text.length && !/[\s/>]/.test(text[j])) j++;
      const qname = text.slice(i + 1, j); if (!NAME.test(qname)) fail('bad element name ' + qname);
      const attrs = {}; i = j;
      for (;;) {
        while (/\s/.test(text[i])) i++;
        if (text[i] === '>' || text[i] === '/') break;
        const m = /^([A-Za-z_][\w.\-:]*)\s*=\s*"([^"<]*)"/.exec(text.slice(i)); if (!m) fail('bad attribute');
        if (m[1] in attrs) fail('duplicate attribute ' + m[1]);
        attrs[m[1]] = unescapeXml(m[2], 'attribute'); i += m[0].length;
      }
      const parent = stack[stack.length - 1] || null;
      const el = mk(qname, attrs, parent);
      if (parent) { const prev = parent.children[parent.children.length - 1]; if (prev) prev.nextElementSibling = el; else parent.firstElementChild = el; parent.children.push(el); }
      else { if (root) fail('two roots'); root = el; }
      if (text[i] === '/') { i += 2; } else { i += 1; stack.push(el); }
    } else {
      const e = text.indexOf('<', i); const end = e < 0 ? text.length : e;
      const t = text.slice(i, end);
      if (stack.length) stack[stack.length - 1].text += unescapeXml(t, 'text'); else if (t.trim()) fail('text outside the root');
      i = end;
    }
  }
  if (stack.length) fail('unclosed <' + stack[stack.length - 1].qname + '>');
  if (!root) fail('no root');
  const all = []; (function walk(n) { all.push(n); n.children.forEach(walk); })(root);
  return {
    documentElement: root,
    getElementsByTagName: (n) => (n === '*' ? all : (n === 'parsererror' ? [] : all.filter((x) => x.qname === n))),
  };
}
class StrictDOMParser { parseFromString(t) { return parseStrict(t); } }

describe('gis-foundation-refine · export — KML and GPX', () => {

  globalThis.window = globalThis;
  globalThis.DOMParser = StrictDOMParser;
  const EX = makeGisExport();
  const DATA = makeGisDatasets();
  globalThis.IntMapData = DATA;   /* the id door of the writer resolves through window.IntMapData at call time */
  let seq = 0;
  const fresh = (spec) => DATA.add(Object.assign({ id: 'gfr-exp-' + (++seq) }, spec));
  const pt = (x, y, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props || {} });
  const line = (c, props) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: props || {} });
  const file = (name, bytes) => new File([Buffer.from(bytes)], name);
  const back = async (out) => { const r = await GEO_IMPORT.readGeoFile(file(out.filename, out.bytes)); assert.equal(r.ok, true, 'read back failed: ' + JSON.stringify(r.why || r)); return r; };

  const NASTY = 'a & b <c> "d" \'e\' 東京 \u{1F5FA}';
  const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const HOLE = [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]];

  test('KML: Point / LineString / Polygon with a hole / Multi* come back with identical coordinates and attributes', async () => {
    const feats = [
      pt(139.76712345678901, 35.68123456789012, { name: NASTY, pop: 13960000, code: '01100', flag: true }),
      line([[1, 2], [3, 4.5], [5, 6]], { title: 'only a title', n: 3 }),
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [SQUARE, HOLE] }, properties: { name: 'with hole' } },
      { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[SQUARE], [[[20, 20], [30, 20], [30, 30], [20, 20]]]] }, properties: { name: 'two parts' } },
      { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[7, 8], [9, 10]] }, properties: { name: 'pair' } },
      { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] }, properties: { name: 'two lines' } },
    ];
    const rec = fresh({ title: 'kml set', features: feats, provenance: { kind: 'import', license: 'CC-BY-4.0', attribution: 'ACME & Co.' } });
    const out = EX.write(rec.id, { format: 'kml' });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.mediaType, 'application/vnd.google-earth.kml+xml');
    assert.equal(out.filename, 'kml set.kml');
    parseStrict(out.text);   /* well-formed, under a parser that refuses everything XML refuses */

    const r = await back(out);
    assert.equal(r.format, 'kml');
    /* a Multi* comes back as one feature per part (decodeKML pushes every geometry of a Placemark) */
    const expected = [];
    for (const f of feats) {
      const g = f.geometry;
      const parts = g.type === 'MultiPolygon' ? g.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
        : g.type === 'MultiPoint' ? g.coordinates.map((c) => ({ type: 'Point', coordinates: c }))
          : g.type === 'MultiLineString' ? g.coordinates.map((c) => ({ type: 'LineString', coordinates: c })) : [g];
      for (const p of parts) expected.push({ geometry: p, properties: f.properties });
    }
    assert.equal(r.fc.features.length, expected.length);
    expected.forEach((e, i) => {
      const got = r.fc.features[i];
      assert.deepEqual(got.geometry, e.geometry, 'geometry ' + i);
      for (const [k, v] of Object.entries(e.properties)) assert.equal(got.properties[k], String(v), 'property ' + k + ' of ' + i);
    });
    /* the name rule is stated, and a title-only feature is named by its title (counted) */
    assert.equal(r.fc.features[1].properties.name, 'only a title');
    assert.deepEqual(out.stated.nameFrom, { name: 5, title: 1 });
    assert.equal(out.stated.license, 'CC-BY-4.0');
    assert.equal(out.stated.provenanceCarried, false);
    assert.match(out.text, /Licence: CC-BY-4\.0/);
    assert.ok(out.text.includes('ACME &amp; Co.'), 'the attribution is escaped');
  });

  test('KML: a feature with no name field is not given one, and a row with no shape is still a Placemark', () => {
    const rec = fresh({ title: 'nameless', features: [pt(1, 2, { v: 1 }), { type: 'Feature', geometry: null, properties: { v: 2 } }] });
    const out = EX.write(rec.id, { format: 'kml' });
    assert.equal(out.ok, true);
    assert.ok(!/<Placemark><name>/.test(out.text));
    assert.equal(out.stated.rowsWithoutGeometry, 1);
    assert.equal((out.text.match(/<Placemark>/g) || []).length, 2);
    parseStrict(out.text);
  });

  test('KML/GPX: control characters XML cannot hold are removed and COUNTED, and the file still parses', () => {
    const rec = fresh({ title: 'ctl', features: [pt(1, 2, { name: 'a\u0001b\u0000c' })] });
    for (const format of ['kml', 'gpx']) {
      const out = EX.write(rec.id, { format });
      assert.equal(out.ok, true);
      assert.ok(out.stated.charactersRemoved >= 2, format + ' ' + out.stated.charactersRemoved);
      parseStrict(out.text);
    }
  });

  test('KML time: written only where the dataset DECLARES it; an undeclared date-looking column is an attribute', async () => {
    const feats = [pt(1, 1, { when: '2020-05-01T10:00:00Z', n: 1 }), pt(2, 2, { when: '1889', n: 2 }), pt(3, 3, { when: '明治22年', n: 3 })];
    const undeclared = fresh({ title: 'u', features: feats });
    const o1 = EX.write(undeclared.id, { format: 'kml' });
    assert.ok(!/<TimeStamp>/.test(o1.text), 'a column that merely looks like a date became a time');

    const declared = fresh({ title: 'd', features: feats.map((f) => ({ ...f, properties: { ...f.properties, when: f.properties.when } })), time: { kind: 'instant', field: 'when' } });
    assert.ok(declared.time && declared.time.field === 'when', 'the registry kept the declaration: ' + JSON.stringify(declared.timeRefused || null));
    const o2 = EX.write(declared.id, { format: 'kml' });
    assert.equal((o2.text.match(/<TimeStamp>/g) || []).length, 2, 'ISO dateTime and a gYear are written');
    assert.deepEqual(o2.stated.time, { carried: 2, notCarried: 1 });   /* 「明治22年」 is not a KML date: kept as an attribute, counted */
    const r = await back(o2);
    assert.equal(r.fc.features[2].properties.when, '明治22年');
  });

  test('KML track: a declared per-position axis becomes a gx:Track and comes back as the same axis', async () => {
    const times = ['2021-01-01T00:00:00Z', '2021-01-01T00:01:00Z', '2021-01-01T00:02:00Z'];
    const eles = [10, 12.5, 11];
    const rec = fresh({
      title: 'ride', time: { kind: 'track', timesField: 'coordTimes', elevationField: 'coordEle' },
      features: [line([[0, 0], [1, 1], [2, 2]], { name: 'r', coordTimes: times, coordEle: eles })],
    });
    assert.equal(rec.time && rec.time.kind, 'track');
    const out = EX.write(rec.id, { format: 'kml' });
    assert.match(out.text, /<gx:Track>/);
    assert.equal(out.stated.tracks, 1);
    const r = await back(out);
    assert.deepEqual(r.fc.features[0].geometry.coordinates, [[0, 0], [1, 1], [2, 2]]);
    assert.deepEqual(r.fc.features[0].properties.coordTimes, times);
    assert.deepEqual(r.fc.features[0].properties.coordEle, eles);
  });

  test('GPX: points are wpt, lines are trk, a MultiLineString is one trk with several trkseg — and it reads back', async () => {
    const feats = [
      line([[0, 0], [1, 1]], { name: 'L1', desc: 'a & b', cmt: 'c', type: 'road', extra: 'x<y' }),
      pt(139.5, 35.5, { name: NASTY, sym: 'Flag', ele: 12.5, kind: 'city' }),
      { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[5, 5], [6, 6]], [[7, 7], [8, 8]]] }, properties: { name: 'ML' } },
      { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[9, 9], [10, 10]] }, properties: { name: 'MP' } },
    ];
    const rec = fresh({ title: 'gpx set', features: feats });
    const out = EX.write(rec.id, { format: 'gpx' });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.mediaType, 'application/gpx+xml');
    assert.equal(out.filename, 'gpx set.gpx');
    parseStrict(out.text);
    assert.equal((out.text.match(/<wpt /g) || []).length, 3);
    assert.equal((out.text.match(/<trk>/g) || []).length, 2);
    assert.equal((out.text.match(/<trkseg>/g) || []).length, 3);
    assert.ok(out.text.indexOf('<wpt ') < out.text.indexOf('<trk>'), 'the schema puts waypoints before tracks');

    const r = await back(out);
    assert.equal(r.format, 'gpx');
    const byName = (n) => r.fc.features.filter((f) => f.properties.name === n);
    assert.deepEqual(byName('L1')[0].geometry, feats[0].geometry);
    assert.equal(byName('L1')[0].properties.desc, 'a & b');
    assert.equal(byName('L1')[0].properties.cmt, 'c');
    assert.equal(byName('L1')[0].properties.type, 'road');
    assert.deepEqual(byName(NASTY)[0].geometry, feats[1].geometry);
    assert.equal(byName(NASTY)[0].properties.sym, 'Flag');
    assert.equal(byName(NASTY)[0].properties.ele, '12.5');
    assert.deepEqual(byName('ML').map((f) => f.geometry.coordinates), feats[2].geometry.coordinates);
    assert.deepEqual(byName('MP').map((f) => f.geometry.coordinates), feats[3].geometry.coordinates);
    /* attributes GPX has no element for travel in <extensions>, in a namespace of their own */
    assert.match(out.text, /<intmap:attr name="extra">x&lt;y<\/intmap:attr>/);
    assert.match(out.text, /<intmap:attr name="kind">city<\/intmap:attr>/);
  });

  test('GPX: polygons are refused BY NAME with the count — nothing is dropped in silence', () => {
    const rec = fresh({
      title: 'mixed', features: [pt(1, 1, { name: 'a' }), { type: 'Feature', geometry: { type: 'Polygon', coordinates: [SQUARE] }, properties: {} },
        { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[SQUARE]] }, properties: {} }, { type: 'Feature', geometry: { type: 'Polygon', coordinates: [SQUARE] }, properties: {} }],
    });
    const out = EX.write(rec.id, { format: 'gpx' });
    assert.equal(out.ok, false);
    assert.equal(out.why, 'export-geometry-not-representable');
    assert.equal(out.detail.format, 'gpx');
    assert.equal(out.detail.count, 3);
    assert.deepEqual(out.detail.geometryTypes, { Polygon: 2, MultiPolygon: 1 });
    assert.equal(out.detail.writable, 1);
    assert.ok(EX.refusals().includes('export-geometry-not-representable'));
    /* the same dataset is fine as KML */
    assert.equal(EX.write(rec.id, { format: 'kml' }).ok, true);
  });

  test('GPX: <time> only where a time field is DECLARED and the value is an xsd:dateTime; a track axis is written per point', async () => {
    const pts = [pt(1, 1, { time: '2020-05-01T10:00:00Z', n: 1 }), pt(2, 2, { time: '1889', n: 2 })];
    const undeclared = fresh({ title: 'gu', features: pts });
    const o1 = EX.write(undeclared.id, { format: 'gpx' });
    assert.ok(!/<time>/.test(o1.text.replace(/<metadata>.*<\/metadata>/s, '')), 'a property called time became <time> with no declaration');
    assert.match(o1.text, /<intmap:attr name="time">2020-05-01T10:00:00Z<\/intmap:attr>/);

    const declared = fresh({ title: 'gd', features: pts, time: { kind: 'instant', field: 'time' } });
    assert.equal(declared.time && declared.time.field, 'time');
    const o2 = EX.write(declared.id, { format: 'gpx' });
    assert.equal((o2.text.match(/<time>/g) || []).length, 1, 'only the dateTime is a GPX time');
    assert.deepEqual(o2.stated.time, { carried: 1, notCarried: 1 });
    const r2 = await back(o2);
    assert.equal(r2.fc.features[0].properties.time, '2020-05-01T10:00:00Z');

    const times = ['2021-01-01T00:00:00Z', null, '2021-01-01T00:02:00Z'];
    const trk = fresh({
      title: 'gt', time: { kind: 'track', timesField: 'coordTimes', elevationField: 'coordEle' },
      features: [line([[0, 0], [1, 1], [2, 2]], { name: 'ride', coordTimes: times, coordEle: [1, 2, 3] })],
    });
    assert.equal(trk.time && trk.time.kind, 'track', JSON.stringify(trk.timeRefused || null));
    const o3 = EX.write(trk.id, { format: 'gpx' });
    const r3 = await back(o3);
    assert.deepEqual(r3.fc.features[0].properties.coordTimes, times);
    assert.deepEqual(r3.fc.features[0].properties.coordEle, [1, 2, 3]);
  });

  test('KML/GPX: another CRS and a non-finite position are refused by name', () => {
    const utm = EX.write({ id: 'x', kind: 'vector', crs: 'EPSG:3857', features: [pt(1, 1)] }, { format: 'kml' });
    assert.equal(utm.why, 'export-crs-unsupported');
    assert.equal(EX.write({ id: 'x', kind: 'vector', crs: 'EPSG:3857', features: [pt(1, 1)] }, { format: 'gpx' }).why, 'export-crs-unsupported');
    for (const format of ['kml', 'gpx']) {
      const o = EX.write({ id: 'x', kind: 'vector', features: [pt(NaN, 1)] }, { format });
      assert.equal(o.why, 'export-serialise-failed', format);
    }
    assert.equal(EX.write({ id: 'x', kind: 'vector', features: [{ type: 'Feature', geometry: null, properties: {} }] }, { format: 'gpx' }).why, 'export-empty');
  });

  test('the format list is the declaration: kml and gpx are offered for vector, never for a grid, and the writer produces each', () => {
    const vec = EX.formats('vector').map((f) => f.id);
    assert.ok(vec.includes('kml') && vec.includes('gpx'));
    assert.ok(!EX.formats('raster').some((f) => f.id === 'kml' || f.id === 'gpx'));
    const grid = EX.write({ id: 'g', kind: 'raster', width: 1, height: 1, bands: [{}], read: () => [1] }, { format: 'kml' });
    assert.equal(grid.why, 'export-format-not-for-kind');
  });

  test('independent witness: the bytes parse in a real browser DOMParser with no parsererror', async (t) => {
    let pw = null, browser = null;
    try { pw = await import('playwright'); browser = await pw.chromium.launch(); } catch (_) { browser = null; }
    if (!browser) return t.skip('no Chromium in this environment');
    try {
      const rec = fresh({ title: NASTY, features: [pt(1, 2, { name: NASTY, 'k & <v>': 'v"1"' }), line([[0, 0], [1, 1]], { name: 'l' })] });
      const page = await browser.newPage();
      for (const format of ['kml', 'gpx']) {
        const out = EX.write(rec.id, { format });
        const errs = await page.evaluate((x) => { const d = new DOMParser().parseFromString(x, 'application/xml'); return d.getElementsByTagName('parsererror').length; }, out.text);
        assert.equal(errs, 0, format + ' did not parse in Chromium');
      }
    } finally { await browser.close(); }
  });
});

/* ── Atlas: the door to export ─────────────────────────────────────────────────────────────── */
describe('gis-foundation-refine · export — the Atlas door', () => {

  async function boot() {
    globalThis.window = globalThis;
    const saved = [];
    /* the smallest browser a download needs: an anchor that records what it was told to save */
    globalThis.document = {
      body: { appendChild() { } },
      createElement() { return { style: {}, click() { saved.push({ href: this.href, name: this.download }); }, remove() { } }; },
    };
    const data = makeGisDatasets();
    globalThis.IntMapData = data;
    const { makeGisAtlas } = await import('../js/gis-atlas.js');
    const atlas = makeGisAtlas({ data, ops: {}, layers: null, draw: () => ({ ok: true }) });
    return { data, atlas, saved };
  }

  test('atlas.export saves the file, says what was lost first, and takes its formats from the writer', async () => {
    const { data, atlas, saved } = await boot();
    const ds = data.add({ title: 'places', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { name: 'A' } },
      { type: 'Feature', geometry: null, properties: { name: 'no shape' } },
    ], provenance: { kind: 'import', license: 'ODbL' } });
    const r = await atlas.export({ dataset: ds.id, format: 'kml' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.filename, 'places.kml');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'places.kml');
    assert.equal(r.stated.rowsWithoutGeometry, 1);
    const lostAt = Math.max(r.html.indexOf('rows with no shape: 1'), r.html.indexOf('図形を持たない行: 1'));
    const keptAt = Math.max(r.html.indexOf('licence carried: ODbL'), r.html.indexOf('ライセンスを入れました: ODbL'));
    assert.ok(lostAt > 0 && keptAt > lostAt, 'the loss is stated, and before what was kept: ' + r.html);
  });

  test('atlas.export: no format and an unknown format are refused with every format the writer declares; GPX refuses polygons by name', async () => {
    const { data, atlas, saved } = await boot();
    const ds = data.add({ title: 'areas', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: {} }] });
    const declared = makeGisExport().formats('vector').map((f) => f.id);
    for (const format of [undefined, 'shp-nope']) {
      const r = await atlas.export({ dataset: ds.id, format });
      assert.equal(r.ok, false);
      assert.ok(['export-format-not-named', 'export-format-unknown'].includes(r.why));
      assert.deepEqual(r.detail.formats, makeGisExport().formats().map((f) => f.id));
      for (const id of declared) assert.ok(r.html.includes(id), id + ' is not in the refusal the planner reads');
    }
    const g = await atlas.export({ dataset: ds.id, format: 'gpx' });
    assert.equal(g.why, 'export-geometry-not-representable');
    assert.equal(g.detail.count, 1);
    assert.equal(saved.length, 0, 'nothing was saved by a refused export');
    const miss = await atlas.export({ dataset: 'nope-nothing', format: 'kml' });
    assert.equal(miss.ok, false);
  });

  test('the capability row exists, reaches the door, and declares what it does to the reader honestly', () => {
    const src = read('js/atlas-cap-data.js');
    const at = src.indexOf("row: ['data.gisExport'");
    assert.ok(at > 0);
    const row = src.slice(at, src.indexOf('\n', at));
    assert.match(row, /'gisExport'/);
    assert.match(row, /'persist', 'explicit'/, 'a file written to the reader\'s device is not a read');
    assert.match(row, /'gisCore'/);
    /* the planner is handed no copy of the formats: the guide points at the writer's refusal */
    const doc = src.slice(at, src.indexOf("schema: () =>", at));
    assert.ok(!/"format":"(kml|gpx|geojson)"/.test(doc), 'a retyped format enum in the guide');
  });
});
