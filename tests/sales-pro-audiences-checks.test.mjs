/* ============================================================================
 *  sales-pro-audiences · cite this map, and take the borders of a date away — the pieces, evaluated
 * ----------------------------------------------------------------------------
 *  ① the border records state their licences as VALUES, and the open-data catalogue offers what they permit:
 *    OpenHistoricalMap 1689–1885 (CC0) and the historical-basemaps sheets (GPL-3.0) for commercial reuse, the files
 *    cut against CShapes as non-commercial — and every withheld entry names its files
 *  ② the one spelling of CShapes outside its builder is its builder's, and `rowsFrom` is the day CShapes begins in
 *    all three places that state it (the bundle, the page, the OHM builder)
 *  ③ a shape is released, released without its outline, or withheld, by the catalogue's terms row by row —
 *    a Cliopatria row that ends before 1886 was never cut against CShapes and is not held to its terms
 *  ④ the real record: the world on 1 July 1850 from data/hist-borders.js, each feature joined to its relation
 *    through the provenance index by fingerprint, and a stale fingerprint is refused, not borrowed
 *  ⑤ the references: APA (n.d. — a live map has no publication year), Chicago, SIST 02, BibTeX (escaped) and RIS
 * ========================================================================== */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { model } from '../scripts/public-api.mjs';
import { GOVERNANCE as CLIO_GOV } from '../scripts/build-hist-clio.mjs';
import { GOVERNANCE as CSHAPES_GOV } from '../scripts/build-cshapes.mjs';
import { Y_MAX } from '../scripts/build-hist-borders.mjs';
import { termsForSide, buildExtract, isoDay, EXTRACT_SCHEMA } from '../js/border-extract.js';
import { rowKey } from '../js/border-provenance.js';
import { references, isoOf, CITE_FORMATS } from '../js/map-cite.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ev = (p) => { const w = {}; new Function('window', read(p))(w); return Object.values(w)[0]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;

const { catalog } = model();
const ds = (id) => catalog.datasets.find((d) => d.id === id);

test('① the border records are in the catalogue, under the terms they state', () => {
  const hb = ds('hist-borders');
  assert.ok(hb, 'data/hist-borders.js is offered (it was withheld as «stated-only-in-prose»)');
  assert.deepEqual(hb.licences, ['CC0-1.0']);
  assert.equal(hb.terms.commercial, true);
  const er = ds('hist-eras');
  assert.ok(er && er.licences.includes('GPL-3.0') && er.terms.commercial && er.terms.shareAlike, 'the sheets are GPL-3.0: commercial reuse, share-alike');
  for (const id of ['hist-clio', 'hist-borders-late']) {
    const d = ds(id);
    assert.ok(d, id + ' is listed');
    assert.equal(d.terms.commercial, false, id + ' was cut against CShapes, so the whole file is non-commercial');
    const cs = d.upstreams.find((u) => u.licenceId === 'CC-BY-NC-SA-4.0');
    assert.equal(cs && cs.contributes, 'outline', id + ': CShapes shaped the outline only');
  }
  assert.ok(ds('hist-clio').upstreams.some((u) => u.cite && /Cliopatria/.test(u.cite)), 'Cliopatria’s citation travels as a value');
  assert.ok(ds('cshapes').upstreams[0].cite && /CShapes 2\.0 Dataset/.test(ds('cshapes').upstreams[0].cite), 'CShapes’ citation travels as a value');
  assert.ok(catalog.withheld.length && catalog.withheld.every((w) => Array.isArray(w.paths) && w.paths.length), 'every withheld entry names its files');
});

test('② one CShapes, and one first day of CShapes', () => {
  const up = CLIO_GOV['data/hist-clio.js'].upstreams.find((u) => u.licence === 'CC BY-NC-SA 4.0');
  const own = CSHAPES_GOV['data/cshapes.js'];
  for (const k of ['publisher', 'url', 'licence', 'paidBy', 'cite']) assert.equal(up[k], own[k], 'build-hist-clio spells CShapes’ ' + k + ' as build-cshapes does');
  const late = CLIO_GOV['data/hist-borders-late.js'].upstreams.find((u) => u.licence === 'CC BY-NC-SA 4.0');
  assert.equal(late.publisher, own.publisher);
  const cs = ev('data/cshapes.js');
  const first = Math.min(...cs.feats.map((r) => ymd(r[2], r[3], r[4])));
  const [y, m, d] = up.rowsFrom.split('-').map(Number);
  assert.equal(ymd(y, m, d), first, 'rowsFrom is the earliest start in data/cshapes.js');
  assert.equal(y, Y_MAX + 1, 'and the day after the OpenHistoricalMap window ends');
  assert.match(read('js/time-borders.js'), new RegExp('const CS_MIN=' + y + '\\b'), 'and the page’s CS_MIN');
});

test('③ released, attributes only, or withheld — by the terms of each row', () => {
  const side = (o) => Object.assign({ rec: 'ohm', name: 'X', recordName: 'X', ids: [] }, o);
  const ohm = termsForSide(side({ bundle: 'data/hist-borders.js', start: [1850, 1, 1], end: [1860, 1, 1] }), catalog);
  assert.equal(ohm.state, 'released'); assert.deepEqual(ohm.licences, ['CC0-1.0']); assert.equal(ohm.credit, false);
  const clioEarly = termsForSide(side({ rec: 'clio', bundle: 'data/hist-clio.js', start: [1800, 1, 1], end: [1886, 1, 1] }), catalog);
  assert.equal(clioEarly.state, 'released', 'a row ending on 1886-01-01 (exclusive) was never cut against CShapes');
  assert.ok(clioEarly.licences.includes('CC-BY-4.0') && clioEarly.credit);
  const clioLate = termsForSide(side({ rec: 'clio', bundle: 'data/hist-clio.js', start: [1886, 1, 1], end: [1900, 1, 1] }), catalog);
  assert.equal(clioLate.state, 'attributes', 'a row from 1886 keeps its record, not its outline');
  assert.ok(clioLate.blockedBy.length === 1 && clioLate.blockedBy[0].outlineOnly);
  assert.equal(termsForSide(side({ rec: 'ohm-late', bundle: 'data/hist-borders-late.js', start: [1890, 1, 1], end: [1900, 1, 1] }), catalog).state, 'attributes');
  const cs = termsForSide(side({ rec: 'cshapes', bundle: 'data/cshapes.js', start: [1914, 1, 1], end: [1918, 1, 1], endInclusive: true }), catalog);
  assert.equal(cs.state, 'withheld'); assert.equal(cs.reason, 'non-commercial');
  const sheet = termsForSide(side({ rec: 'sheet', bundle: 'data/hist-eras.js', sheet: 1500 }), catalog);
  assert.equal(sheet.state, 'released'); assert.ok(sheet.shareAlike);
  assert.equal(termsForSide(side({ unattributed: true }), catalog).reason, 'no-record');
  const snap = termsForSide(side({ rec: 'clio', bundle: 'data/hist-clio.js', start: [1700, 1, 1], end: [1800, 1, 1], coastSnap: { file: 'data/hist-coast-snap.js' } }), catalog);
  assert.equal(snap.state, 'released'); assert.ok(snap.licences.includes('public-domain'), 'a coast piece is under its parent’s terms and the coast’s');
  const w = catalog.withheld[0];
  assert.equal(termsForSide(side({ bundle: w.paths[0] }), catalog).reason, 'catalogue:' + w.reason);
  assert.equal(termsForSide(side({ bundle: 'data/hist-borders.js' }), null).reason, 'no-catalogue', 'no catalogue, nothing released');
  assert.equal(isoDay([-499, 1, 1]), '-0499-01-01'); assert.equal(isoDay([3000, 1, 1]), null); assert.equal(isoDay([-99999, 1, 1]), null);
});

test('④ the world on 1 July 1850, from the shipped record, joined to its relations', () => {
  const d = ev('data/hist-borders.js');
  const ix = JSON.parse(read('data/border-provenance-ohm.json'));
  const at = ymd(1850, 7, 1);
  const feats = [], sideOf = new Map();
  d.feats.forEach((r, i) => {
    if (!(ymd(r[2], r[3], r[4]) <= at && at < ymd(r[5], r[6], r[7]))) return;
    const polys = r[8].map((poly) => poly.map((ri) => d.rings[ri]));
    const f = { type: 'Feature', properties: { NAME: (r[0] && r[0].en) || r[0] }, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } };
    feats.push(f);
    /* the side as js/time-borders.js `_provSide` hands it over for an OpenHistoricalMap row */
    sideOf.set(f, { rec: 'ohm', bundle: 'data/hist-borders.js', name: f.properties.NAME, recordName: f.properties.NAME, ids: r[1] ? [{ kind: 'wikidata', value: r[1] }] : [],
      start: [r[2], r[3], r[4]], end: [r[5], r[6], r[7]], index: { name: 'ohm', file: 'data/hist-borders.js', i, key: rowKey(r) } });
  });
  assert.ok(feats.length > 50, 'the record draws the world of 1850 (' + feats.length + ' shapes)');
  const { geojson, summary } = buildExtract({ features: feats, sideOf: (f) => sideOf.get(f), catalog, at: { y: 1850, m: 7, d: 1, exact: true },
    site: catalog.site, link: 'https://example.invalid/#v', generatedAt: '2026-10-08T00:00:00Z', indexes: { ohm: ix } });
  assert.equal(summary.released, feats.length, 'every OpenHistoricalMap shape of 1850 is released (CC0)');
  assert.equal(geojson.intmap.schema, EXTRACT_SCHEMA); assert.equal(geojson.intmap.at, '1850-07-01');
  const withRel = geojson.features.filter((f) => f.properties.ohm_relation);
  assert.ok(withRel.length >= feats.length * 0.95, 'the provenance index names the relation of almost every row (' + withRel.length + '/' + feats.length + ')');
  assert.match(withRel[0].properties.ohm_relation[0], /^https:\/\/www\.openhistoricalmap\.org\/relation\/\d+$/);
  assert.ok(geojson.features.every((f) => f.geometry && f.properties.licences[0] === 'CC0-1.0' && f.properties.start && f.properties.file === 'data/hist-borders.js'));
  /* a fingerprint that is not the shipped row's is refused, never borrowed */
  const f0 = feats[0], s0 = sideOf.get(f0);
  sideOf.set(f0, Object.assign({}, s0, { index: Object.assign({}, s0.index, { key: '00000000' }) }));
  const again = buildExtract({ features: [f0], sideOf: (f) => sideOf.get(f), catalog, at: { y: 1850, m: 7, d: 1 }, indexes: { ohm: ix } });
  assert.equal(again.geojson.features[0].properties.ohm_relation, undefined);
  /* the view keeps only what reaches into it: Japan's bounding box holds no Andean shape */
  const jp = buildExtract({ features: feats, sideOf: (f) => sideOf.get(f), catalog, at: { y: 1850, m: 7, d: 1 }, bbox: [128, 30, 146, 46], indexes: { ohm: ix } });
  assert.ok(jp.summary.shapes > 0 && jp.summary.shapes < feats.length);
  assert.ok(!jp.geojson.features.some((f) => /Peru|Bolivia|Chile/.test(f.properties.record_name || '')));
});

test('⑤ the references say the map, its date, the day it was read and its link — and invent no year', () => {
  const r = references({ link: 'https://example.invalid/#v=1&t=1850', title: 'Borders & 100% of 1850', accessed: '2026-10-08',
    instant: { iso: '1850-07-01', label: { en: '1 July 1850', jp: '1850年7月1日' } }, credits: ['OpenHistoricalMap (CC0)', 'Natural Earth'] });
  assert.match(r.apa, /^IntMap\. \(n\.d\.\)\. Borders & 100% of 1850 \[Map of 1 July 1850\]\. Retrieved October 8, 2026, from https:/);
  assert.match(r.chicago, /Accessed October 8, 2026\./);
  assert.match(r.sist02, /\(参照 2026-10-08\)\.$/);
  assert.match(r.bibtex, /title {8}= \{\{Borders \\& 100\\% of 1850\}\}/);
  assert.match(r.bibtex, /url {10}= \{https:\/\/example\.invalid\/#v=1&t=1850\}/, 'the url field is written verbatim');
  assert.match(r.bibtex, /^@misc\{intmap_18500701,/);
  assert.match(r.ris, /^TY {2}- MAP\n/); assert.match(r.ris, /\nER {2}- $/); assert.match(r.ris, /\nY2 {2}- 2026\/10\/08\n/);
  assert.match(r.credit.en, /^Map: IntMap, 1 July 1850 \(https:.*\)\. Data: OpenHistoricalMap \(CC0\); Natural Earth\.$/);
  assert.match(r.credit.jp, /^地図: IntMap（1850年7月1日）/);
  const bc = references({ link: 'x', accessed: '2026-10-08', instant: { iso: '-0499-01-01', label: { en: '500 BC', jp: '紀元前500年' } }, credits: [] });
  assert.match(bc.bibtex, /^@misc\{intmap_m04990101,/);
  assert.equal(bc.title.en, 'IntMap map view, 500 BC');
  assert.ok(!/Data:/.test(bc.credit.en), 'no data drawn, no data named');
  assert.equal(isoOf(-499, 1, 1), '-0499-01-01');
  assert.deepEqual([...CITE_FORMATS], ['apa', 'chicago', 'sist02', 'bibtex', 'ris']);
});
