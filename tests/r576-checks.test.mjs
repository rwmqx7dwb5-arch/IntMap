/* ============================================================================
 *  R576 · A DROPPED FILE IS READ, NOT GUESSED AT
 * ----------------------------------------------------------------------------
 *  「外部データ投入がGeoJSONで止まっている。特にCSVをドラッグ → 緯度経度列を
 *    自動認識 → 即ピン化はIntMapにはかなり合います。」
 *
 *  ⚠ THESE DRIVE THE SHIPPED MODULE, NOT ITS SOURCE TEXT (#R505). Every case below
 *  builds a real File out of real bytes and calls the real js/geo-import.js — the
 *  same function js/map-ui.js awaits — so a decoder that stops working fails here
 *  even if every spelling this file could have pinned stayed the same.
 *
 *  ⚠ WHAT IS NOT HERE, AND WHY. KML, KMZ and GPX are parsed with DOMParser, which
 *  a browser has and Node does not. Handing this file a substitute parser would be
 *  the #R552 mistake exactly — a fixture more capable than the thing that ships
 *  cannot detect that the shipped thing is broken — so those formats are driven in
 *  a real browser by tests/r576.spec.js, and ⑨ below holds Node to the honest
 *  answer rather than a half-working one.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as acorn from 'acorn';
import { zip } from './helpers/zip.mjs';
import { GEO_IMPORT } from '../js/geo-import.js';
const { readGeoFile } = GEO_IMPORT;

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const file = (name, body) => new File([typeof body === 'string' ? Buffer.from(body, 'utf8') : body], name);
const coords = (r) => r.fc.features.map((f) => f.geometry.coordinates);

/* ══ ① A CSV OF COORDINATES BECOMES PINS ══════════════════════════════════════════════════════
   The whole request in one case: drag a CSV, the columns are recognised, pins appear. */
test('R576 ①: a CSV with named lat/lon columns becomes points, in lon,lat order', async () => {
  const csv = 'name,latitude,longitude,note\n' +
    'Tokyo,35.6812,139.7671,capital\n' +
    'Osaka,34.6937,135.5023,\n' +
    'Sapporo,43.0618,141.3545,north\n' +
    'Naha,26.2124,127.6809,south\n';
  const r = await readGeoFile(file('cities.csv', csv));
  assert.equal(r.ok, true);
  assert.equal(r.format, 'csv');
  assert.equal(r.fc.features.length, 4);
  /* GeoJSON is lon,lat — the one ordering mistake that puts every pin in the wrong hemisphere. */
  assert.deepEqual(coords(r)[0], [139.7671, 35.6812]);
  /* the non-coordinate columns survive as properties, blanks dropped */
  assert.equal(r.fc.features[0].properties.name, 'Tokyo');
  assert.equal(r.fc.features[0].properties.note, 'capital');
  assert.equal('note' in r.fc.features[1].properties, false);
  /* and it REPORTS which columns it chose, because the reader has to be able to check the guess */
  assert.equal(r.stats.lat, 'latitude');
  assert.equal(r.stats.lon, 'longitude');
});

/* ══ ② THE HEADER IS EVIDENCE; THE VALUES ARE THE VETO ════════════════════════════════════════
   The decoy columns here are all numeric and all plausible. Only the RANGE separates them. */
test('R576 ②: decoy numeric columns do not win, and a header-less file still works', async () => {
  /* id and temperature are numbers in the latitude band; population is not. */
  const decoys = 'id,temperature,lat,lon,population\n' +
    '1,21.5,35.68,139.76,13960000\n' +
    '2,18.2,34.69,135.50,2691000\n' +
    '3,9.4,43.06,141.35,1973000\n' +
    '4,23.1,26.21,127.68,319000\n';
  const a = await readGeoFile(file('d.csv', decoys));
  assert.equal(a.ok, true);
  assert.equal(a.stats.lat, 'lat');
  assert.equal(a.stats.lon, 'lon');

  /* No header at all: the numbers alone have to decide. Only one ordered pair can be
     (latitude, longitude) here, because 139.76 cannot be a latitude. */
  const bare = '35.68,139.76\n34.69,135.50\n43.06,141.35\n26.21,127.68\n';
  const b = await readGeoFile(file('bare.csv', bare));
  assert.equal(b.ok, true);
  assert.deepEqual(coords(b)[0], [139.76, 35.68]);

  /* ⚠ AND THE COLUMN NAMED "lat" LOSES WHEN ITS VALUES SAY IT IS NOT ONE. A file that labels its
     columns backwards is common; believing the label over the numbers puts every pin at sea. */
  const swapped = 'lat,lon\n139.76,35.68\n135.50,34.69\n141.35,43.06\n127.68,26.21\n';
  const c = await readGeoFile(file('s.csv', swapped));
  assert.equal(c.ok, true);
  assert.deepEqual(coords(c)[0], [139.76, 35.68], 'the out-of-band column can only be longitude');
});

/* ══ ③ WHEN IT CANNOT TELL, IT SAYS SO — AND SAYS WHAT IT LOOKED AT ═══════════════════════════
   `.agents/rules/no-ad-hoc-hardcoding.md`: コードの仕事は根拠のないものを拒むこと. #R515 is the
   round a guessed coordinate put 宇部港 in 浜松市; a refusal is the correct output here. */
test('R576 ③: a table with no coordinates is REFUSED, naming the columns it considered', async () => {
  /* ⚠ units AND price BOTH SURVIVE EVERY VETO: numeric, varied, and inside ±90. Nothing rules
     this pair out — and "nothing ruled it out" is not evidence, which is why the module asks for
     something that POSITIVELY says "coordinate" (an axis word, a hemisphere letter, or a value no
     latitude can hold) and refuses when there is none. Without that rule this sales report lands
     in the Gulf of Guinea, one pin per row, and looks perfectly convincing. */
  const csv = 'product,units,price\nwidget,12,4.50\ngadget,7,19.99\nsprocket,3,2.25\ncog,44,0.99\n';
  const r = await readGeoFile(file('sales.csv', csv));
  assert.equal(r.ok, false);
  assert.equal(r.why, 'coordinates-not-identifiable');
  const named = r.detail.considered.map((c) => c.column);
  assert.ok(named.includes('units') && named.includes('price'), 'the reader is told what was examined');

  /* Two nameless numeric columns, both inside ±90: in range, and genuinely unidentifiable. */
  const tiny = '10.0,20.0\n11.0,21.0\n12.0,22.0\n';
  const t = await readGeoFile(file('t.csv', tiny));
  assert.equal(t.ok, false);
  assert.equal(t.why, 'coordinates-not-identifiable');

  /* And when no pair survives the vetoes at all, that is a different answer with its own
     sentence — population cannot be either axis, and there is nothing else to consider. */
  const pop = 'city,population\nTokyo,13960000\nOsaka,2691000\nSapporo,1973000\nNaha,319000\n';
  const q = await readGeoFile(file('pop.csv', pop));
  assert.equal(q.ok, false);
  assert.equal(q.why, 'no-coordinate-columns');
});

/* ══ ④ THE DELIMITER AND THE DECIMAL POINT ARE ONE DECISION ═══════════════════════════════════ */
test('R576 ④: tab, semicolon and the European decimal comma are all read', async () => {
  const tsv = 'name\tlat\tlon\nA\t35.68\t139.76\nB\t34.69\t135.50\nC\t43.06\t141.35\nD\t26.21\t127.68\n';
  const a = await readGeoFile(file('x.tsv', tsv));
  assert.equal(a.ok, true);
  assert.equal(a.stats.delimiter, '\t');
  assert.deepEqual(coords(a)[0], [139.76, 35.68]);

  /* ⚠ 52,37 IS FIFTY-TWO POINT THREE SEVEN when ';' is what separates the columns. Read with a
     comma delimiter this file is nonsense; read with a comma decimal point it is Berlin. */
  const de = 'Ort;Breite;Länge\nBerlin;52,52;13,40\nHamburg;53,55;9,99\nKöln;50,94;6,96\nMünchen;48,14;11,58\n';
  const b = await readGeoFile(file('de.csv', de));
  assert.equal(b.ok, true);
  assert.equal(b.stats.delimiter, ';');
  assert.deepEqual(coords(b)[0], [13.40, 52.52]);
  assert.equal(b.fc.features[0].properties.Ort, 'Berlin');
});

/* ══ ⑤ THE ENCODING IS THE ATTACHMENT READER'S ANSWER, SHARED ═════════════════════════════════
   #R540 built this and wired it only to Atlas. A Shift_JIS CSV — the ordinary output of Excel on
   a Japanese Windows — used to arrive at this path through readAsText, which assumes UTF-8. */
test('R576 ⑤: a Shift_JIS CSV keeps its names instead of arriving as mojibake', async () => {
  const sjis = Buffer.concat([
    Buffer.from('name,lat,lon\n', 'latin1'),
    Buffer.from([0x93, 0x8C, 0x8B, 0x9E]),                     /* 東京 */
    Buffer.from(',35.68,139.76\n', 'latin1'),
    Buffer.from([0x91, 0xE5, 0x8D, 0xE3]),                     /* 大阪 */
    Buffer.from(',34.69,135.50\n', 'latin1'),
    Buffer.from([0x8E, 0x44, 0x96, 0x79]),                     /* 札幌 */
    Buffer.from(',43.06,141.35\n', 'latin1'),
    Buffer.from([0x93, 0xDF, 0x94, 0x65]),                     /* 那覇 */
    Buffer.from(',26.21,127.68\n', 'latin1'),
  ]);
  /* the bytes really are not UTF-8, or this would prove nothing */
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(sjis));
  const r = await readGeoFile(file('jp.csv', sjis));
  assert.equal(r.ok, true);
  assert.equal(r.fc.features[0].properties.name, '東京');
  assert.equal(r.fc.features[3].properties.name, '那覇');
});

/* ══ ⑥ A CELL CAN BE THE GEOMETRY ITSELF ══════════════════════════════════════════════════════
   Recognised by parsing the VALUE. A column called "the_geom", "shape" or "wkt" is the same
   column, and none of those names appears in js/geo-import.js. */
test('R576 ⑥: a WKT column carries lines and areas that a lat/lon pair cannot', async () => {
  const csv = 'id,the_geom\n' +
    '1,"POINT(139.76 35.68)"\n' +
    '2,"LINESTRING(139.7 35.6, 139.8 35.7, 139.9 35.8)"\n' +
    '3,"POLYGON((139.0 35.0, 140.0 35.0, 140.0 36.0, 139.0 36.0, 139.0 35.0))"\n';
  const r = await readGeoFile(file('g.csv', csv));
  assert.equal(r.ok, true);
  assert.equal(r.format, 'csv-geometry');
  assert.deepEqual(r.fc.features.map((f) => f.geometry.type), ['Point', 'LineString', 'Polygon']);
  assert.equal(r.fc.features[0].properties.id, '1');
  assert.equal(r.stats.geometryColumn, 'the_geom');

  /* An SRID that is not WGS 84 is refused rather than drawn 500 km from where it belongs. */
  const utm = 'id,geom\n1,"SRID=3857;POINT(15556000 4257000)"\n2,"SRID=3857;POINT(15000000 4000000)"\n3,"SRID=3857;POINT(14000000 3900000)"\n4,"SRID=3857;POINT(13000000 3800000)"\n';
  const u = await readGeoFile(file('utm.csv', utm));
  assert.equal(u.ok, false);
});

/* ══ ⑦ DEGREES, MINUTES AND SECONDS ═══════════════════════════════════════════════════════════ */
test('R576 ⑦: DMS values are read, and the hemisphere letter decides the axis', async () => {
  const csv = 'name,a,b\n' +
    'Tokyo,"35°40′52″N","139°45′1″E"\n' +
    'Rio,"22°54′30″S","43°12′36″W"\n' +
    'Reykjavik,"64°8′46″N","21°56′2″W"\n' +
    'Perth,"31°57′8″S","115°51′32″E"\n';
  const r = await readGeoFile(file('dms.csv', csv));
  assert.equal(r.ok, true);
  const [lon, lat] = coords(r)[0];
  assert.ok(Math.abs(lat - 35.6811) < 0.001, 'north is positive: ' + lat);
  assert.ok(Math.abs(lon - 139.7503) < 0.001, 'east is positive: ' + lon);
  const [rioLon, rioLat] = coords(r)[1];
  assert.ok(rioLat < 0 && rioLon < 0, 'south and west are negative');
});

/* ══ ⑧ GeoJSON STILL WORKS, AND NOW LOSES NOTHING ═════════════════════════════════════════════
   The four shapes the old 58 lines accepted, plus the two the renderer draws and the app's own
   sanitizeFeatures used to drop on the floor after they had been accepted. */
test('R576 ⑧: every GeoJSON shape the old path took still works, and two that used to vanish', async () => {
  const pt = JSON.stringify({ type: 'Point', coordinates: [139.76, 35.68] });
  const bare = await readGeoFile(file('a.geojson', pt));
  assert.equal(bare.ok, true);
  assert.equal(bare.format, 'geojson');
  assert.equal(bare.fc.features.length, 1);

  const feat = await readGeoFile(file('b.json', JSON.stringify({ type: 'Feature', geometry: JSON.parse(pt), properties: { n: 1 } })));
  assert.equal(feat.ok, true);
  assert.equal(feat.fc.features[0].properties.n, 1);

  /* ⚠ MultiPoint AND GeometryCollection ARE FLATTENED. MapLibre draws both, but the app's
     IntMapGeodesy.sanitizeFeatures (which this path now runs through) keeps neither — so before
     #R576 they were accepted by toFC and then silently disappeared off the map. */
  const multi = await readGeoFile(file('c.geojson', JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { k: 'm' }, geometry: { type: 'MultiPoint', coordinates: [[1, 1], [2, 2], [3, 3]] } },
      {
        type: 'Feature', properties: { k: 'g' }, geometry: {
          type: 'GeometryCollection',
          geometries: [{ type: 'Point', coordinates: [4, 4] }, { type: 'LineString', coordinates: [[5, 5], [6, 6]] }],
        },
      },
    ],
  })));
  assert.equal(multi.ok, true);
  assert.equal(multi.fc.features.length, 5, 'three points, a point and a line');
  assert.equal(multi.fc.features.every((f) => f.geometry.type === 'Point' || f.geometry.type === 'LineString'), true);
  assert.equal(multi.fc.features[0].properties.k, 'm', 'the parent feature\'s properties are carried down');

  /* JSON that is not GeoJSON gets its own sentence, not "could not parse JSON". */
  const nope = await readGeoFile(file('d.json', JSON.stringify({ hello: 'world' })));
  assert.equal(nope.ok, false);
  assert.equal(nope.why, 'json-not-geojson');
});

/* ══ ⑨ THE ARCHIVE, AND THE HONEST ANSWER ABOUT WHAT IS NOT SUPPORTED ═════════════════════════ */
test('R576 ⑨: a ZIP is opened and its contents decided by content; a Shapefile says so by name', async () => {
  /* A zipped Shapefile is the single most common thing a person drops on a web map, and
     "not valid GeoJSON" was a wrong answer about it for the life of the feature. */
  const shp = zip([
    ['ports.shp', Buffer.from([0, 0, 39, 10, 0, 0, 0, 0])],
    ['ports.dbf', Buffer.from([3, 0, 0, 0])],
    ['ports.prj', Buffer.from('GEOGCS["WGS 84"]', 'utf8')],
  ]);
  const s = await readGeoFile(file('ports.zip', shp));
  assert.equal(s.ok, false);
  assert.equal(s.why, 'shapefile');

  /* A ZIP holding a CSV is read out of the archive, and says which entry it came from. */
  const csvZip = zip([['readme.txt', Buffer.from('notes\n', 'utf8')],
  ['data/points.csv', Buffer.from('name,lat,lon\nA,35.68,139.76\nB,34.69,135.50\nC,43.06,141.35\nD,26.21,127.68\n', 'utf8')]]);
  const z = await readGeoFile(file('bundle.zip', csvZip));
  assert.equal(z.ok, true);
  assert.equal(z.format, 'csv');
  assert.equal(z.entry, 'data/points.csv');

  /* ⚠ AND KML IS NOT HALF-READ HERE. Node has no DOMParser; the module says so rather than
     falling back to something weaker. tests/r576.spec.js drives KML/KMZ/GPX in a real browser. */
  assert.equal(typeof globalThis.DOMParser, 'undefined', 'if Node gains one, ⑨ needs revisiting');
  const kml = await readGeoFile(file('a.kml', '<?xml version="1.0"?>\n<kml><Document><Placemark><name>P</name><Point><coordinates>139.7,35.6</coordinates></Point></Placemark></Document></kml>'));
  assert.equal(kml.ok, false);
  assert.equal(kml.why, 'xml-no-parser');
});

/* ══ ⑩ EVERY REFUSAL HAS A SENTENCE ═══════════════════════════════════════════════════════════
   ⚠ THE SET IS DISCOVERED, NOT LISTED. A hand-written list of codes is the thing #R529 deleted:
   the next `why` someone adds would not be in it, and the reader would get the generic fallback
   for a case the code knew how to describe exactly. Both files are PARSED (#R552) — one for the
   codes it can emit, the other for the codes it answers. */
test('R576 ⑩: js/map-ui.js has a sentence for every refusal js/geo-import.js can return', () => {
  const emitted = new Set();
  const collect = (node, seen) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.type === 'Property' && node.key && (node.key.name === 'why' || node.key.value === 'why')
      && node.value && node.value.type === 'Literal' && typeof node.value.value === 'string') emitted.add(node.value.value);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => collect(c, seen));
      else if (v && typeof v === 'object' && typeof v.type === 'string') collect(v, seen);
    }
  };
  collect(acorn.parse(src('js/geo-import.js'), { ecmaVersion: 'latest', sourceType: 'module' }), new Set());
  assert.ok(emitted.size >= 12, 'the parse found the codes: ' + emitted.size);

  /* the codes js/map-ui.js's reasonText() compares against — the whole function's string literals */
  const ui = src('js/map-ui.js');
  const at = ui.indexOf('function reasonText(');
  assert.ok(at > 0, 'reasonText() is where the sentences live');
  const body = ui.slice(at, ui.indexOf('function labelFor(', at));
  const answered = new Set([...body.matchAll(/why===['"]([a-z-]+)['"]/g)].map((m) => m[1]));

  const silent = [...emitted].filter((w) => !answered.has(w));
  assert.deepEqual(silent, [], 'refusals with no sentence of their own: ' + silent.join(', '));
});

/* ══ ⑪ THE CEILING IS ONE NUMBER, NOT TWO COPIES ══════════════════════════════════════════════ */
test('R576 ⑪: the map holds no second opinion about how much may be read', async () => {
  const { ATL_FILE } = await import('../js/atlas-attach.js');
  assert.equal(GEO_IMPORT.LIMITS.readBytes, ATL_FILE.LIMITS.readBytes);
  /* and the picker no longer filters by extension — see js/atlas-console.js, #R158 */
  const ui = src('js/map-ui.js');
  const decl = ui.slice(ui.indexOf("fileInput.type='file'"), ui.indexOf('function toFC') + 400);
  assert.equal(/fileInput\.accept\s*=/.test(decl), false, 'an accept list is a list of extensions');
  /* empty and oversized files are refused by name rather than by exception */
  assert.equal((await readGeoFile(file('e.csv', ''))).why, 'empty');
});
