/* ============================================================================
 *  data-studio — the reader's own table: bound to places, carried by a link, read from Excel, kept off the boot path
 *  (node --test)
 * ----------------------------------------------------------------------------
 *  What is held here, by running the code on the repository's real data (not by reading the source):
 *    ① a column of ISO alpha-2 / alpha-3 / numeric codes, or of country names written in Japanese, German or French,
 *      is recognised for what it is and every row resolves to the Natural Earth record the map will colour
 *      (js/table-bind.js over data/ne-countries/ and the platform's Intl.DisplayNames);
 *    ② a city name that is several places is NOT resolved (no «largest one» chosen in silence) — and resolves once
 *      a country column of the same row narrows it;
 *    ③ a column of quantities is not mistaken for a key, though small integers are ISO numeric codes by accident;
 *    ④ the link's document round-trips: packed (js/link-codec.js, the tour's packing) → the map state's `ds` →
 *      decoded, the same table and the same colouring; and what a link says is read, not trusted;
 *    ⑤ a table too big for a link is refused by the browser ceiling (js/link-codec.js LINK_LIMIT_MEASURED);
 *    ⑥ a link written before `ds` existed encodes to the same bytes, and only a restore that carries `ds` fetches
 *      the studio;
 *    ⑦ js/data-studio.js and js/table-bind.js are not statically reachable from the page entry (not in the boot bundle);
 *    ⑧ an Excel workbook is a table: its sheet reaches the same table decoder a CSV does (tests/fixtures), and the
 *      text form Atlas reads is framed so it can be read back sheet by sheet.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { decodeNECountries } from '../js/ne-countries.js';
import { countriesFrom, countryIndex, cityIndex, detect, bind, normName, placeKey, DETECT_MIN } from '../js/table-bind.js';
import { packStudio, unpackStudio, readStudio, linkDoc, linkFits, studio, studioState } from '../js/data-studio.js';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';
import { packText, unpackText, LINK_LIMIT_MEASURED } from '../js/link-codec.js';
import { encodeCustomTour, decodeCustomTour } from '../js/tours.js';
import { MapState } from '../js/map-state.js';
import { ATL_FILE } from '../js/atlas-attach.js';
import { GEO_IMPORT } from '../js/geo-import.js';
import { graph } from '../scripts/module-graph.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const gz = (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString('utf8'));
const NE = decodeNECountries(gz('data/ne-countries/ne_50m_admin_0_countries.json.gz'));
const COUNTRIES = countryIndex(countriesFrom(NE.features));
const CITIES = cityIndex(gz('data/gazetteer-phone.json.gz'));
const IDX = { countries: COUNTRIES, cities: CITIES };
const col = (name, values) => ({ columns: [name], rows: values.map((v) => ({ [name]: v })) });

test('① codes and names in three languages are recognised and resolve to the record the map colours', () => {
  assert.ok(COUNTRIES.locales.some((l) => /^ja/.test(l)) && COUNTRIES.locales.some((l) => /^de/.test(l)) && COUNTRIES.locales.some((l) => /^fr/.test(l)),
    'the platform must name regions in ja, de and fr for this check to mean anything: ' + COUNTRIES.locales.length + ' locales');
  const cases = [
    ['iso2', ['JP', 'DE', 'FR', 'BR'], ['JPN', 'DEU', 'FRA', 'BRA']],
    ['iso3', ['JPN', 'DEU', 'FRA', 'BRA'], ['JPN', 'DEU', 'FRA', 'BRA']],
    ['numeric', ['392', '276', '250', '004'], ['JPN', 'DEU', 'FRA', 'AFG']],
    ['country', ['日本', 'ドイツ', 'フランス', 'ブラジル'], ['JPN', 'DEU', 'FRA', 'BRA']],
    ['country', ['Japan', 'Deutschland', 'Frankreich', 'Brasilien'], ['JPN', 'DEU', 'FRA', 'BRA']],
    ['country', ['Japon', 'Allemagne', 'France', 'Brésil'], ['JPN', 'DEU', 'FRA', 'BRA']],
  ];
  for (const [kind, cells, keys] of cases) {
    const d = detect(col('x', cells), IDX);
    assert.equal(d.key, 'x', kind + ': the column was not offered as the key'); assert.equal(d.kind, kind, cells.join(',') + ' was read as ' + d.kind);
    const b = bind(col('x', cells), { column: 'x', kind }, IDX);
    assert.deepEqual(b.rows.map((r) => r.key), keys, kind + ' resolved to the wrong records');
    assert.equal(b.resolved, cells.length);
  }
  /* the key is what the polygons are joined on: the record's own ISO alpha-3, else Natural Earth's ADM0_A3 */
  const kosovo = NE.features.find((f) => f.properties.ADM0_A3 === 'KOS').properties;
  assert.equal(placeKey(kosovo), 'KOS'); assert.equal(bind(col('c', ['XK']), { column: 'c', kind: 'iso2' }, IDX).rows[0].key, 'KOS');
  /* names are normalised the same way on both sides: accents, case, punctuation — but not the kana voicing mark */
  assert.equal(normName("Côte d’Ivoire"), normName("COTE D'IVOIRE"));
  assert.notEqual(normName('ガーナ'), normName('カーナ'));
  /* a name two countries share is ambiguous, not decided */
  const congo = bind(col('c', ['Congo']), { column: 'c', kind: 'country' }, IDX).rows[0];
  assert.equal(congo.key, null); assert.equal(congo.why, 'ambiguous'); assert.deepEqual([...congo.candidates].sort(), ['COD', 'COG']);
});

test('② an ambiguous city is left unplaced, and the same row\'s country narrows it', () => {
  const t = { columns: ['city', 'country'], rows: [{ city: 'Hull', country: 'Canada' }, { city: 'Hull', country: 'GB' }, { city: 'Oran', country: '' }] };
  const loose = bind(t, { column: 'city', kind: 'city' }, IDX);
  assert.ok(loose.rows.every((r) => r.key === null && r.why === 'ambiguous'), 'a name several places share was resolved without grounds');
  assert.ok(loose.rows[0].candidates.length >= 2 && new Set(loose.rows[0].candidates.map((c) => c.iso2)).size >= 2, 'the candidates are reported');
  const narrowed = bind(t, { column: 'city', kind: 'city', within: 'country' }, IDX);
  const ca = CITIES.byGid.get(narrowed.rows[0].key), gb = CITIES.byGid.get(narrowed.rows[1].key);
  assert.equal(ca && ca.iso2, 'CA'); assert.equal(gb && gb.iso2, 'GB');
  assert.equal(narrowed.rows[2].why, 'ambiguous', 'a row whose country cell is empty is not narrowed by a neighbour');
  /* detect: a table with a city column and a country column offers the country column for narrowing a city key */
  const d = detect({ columns: ['city', 'cc'], rows: [{ city: 'Osaka', cc: 'JP' }, { city: 'Lyon', cc: 'FR' }, { city: 'Hull', cc: 'GB' }] }, IDX);
  const cityCol = d.columns.find((c) => c.name === 'city');
  assert.equal(cityCol.kind, 'city');
});

test('③ a column of quantities is not a key', () => {
  const t = { columns: ['country', 'population', 'share', 'year'], rows: [
    { country: 'Japan', population: '125', share: '0.4', year: '2024' }, { country: 'Germany', population: '84', share: '1.2', year: '2024' },
    { country: 'France', population: '68', share: '2.5', year: '2023' }, { country: 'Algeria', population: '12', share: '3', year: '2024' },
    { country: 'Afghanistan', population: '4', share: '0.9', year: '2022' } ] };
  const d = detect(t, IDX);
  assert.equal(d.key, 'country'); assert.equal(d.kind, 'country');
  for (const c of ['population', 'share', 'year']) assert.ok(!(d.columns.find((x) => x.name === c).ratio >= DETECT_MIN), c + ' was offered as a key');
  /* 4 and 12 ARE ISO numeric codes (Afghanistan, Algeria): without a cell written the way the standard writes the code
     (three digits, zeros kept) the column is refused by name, not offered */
  const n = detect(col('n', ['4', '12', '8', '24']), IDX).columns[0];
  assert.equal(n.kind, null); assert.equal(n.refused, 'numeric-not-evidenced');
  /* …and the reader may still choose it: their choice reads a code whose zeros were dropped */
  assert.deepEqual(bind(col('n', ['4', '12']), { column: 'n', kind: 'numeric', chosen: true }, IDX).rows.map((r) => r.key), ['AFG', 'DZA']);
});

const MODEL = { title: '人口の表.xlsx', kind: 'country', column: '国', value: '人口', within: null,
  style: { field: '人口', mode: 'graduated', method: 'equal', classes: 4 },
  rows: [{ cell: '日本', key: 'JPN', value: '125.1' }, { cell: 'Deutschland', key: 'DEU', value: '84.5' }, { cell: 'Atlantis', key: null, value: '7' }, { cell: 'France', key: 'FRA', value: '' }] };

test('④ the link round-trips the table and the colouring, through the map state, and is read without trust', async () => {
  const v = await packStudio(MODEL);
  assert.match(v, /^[zj][A-Za-z0-9_-]+$/, 'the packed value is the link-codec spelling');
  const h = MapState.encode({ view: { lng: 10, lat: 50, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' }, ds: v });
  assert.ok(h.endsWith('&ds=' + v), 'ds is appended last');
  const back = await unpackStudio(MapState.decode(h).ds);
  assert.equal(back.ok, true); assert.equal(back.dropped, 0);
  const m = back.model;
  assert.equal(m.title, MODEL.title); assert.equal(m.kind, 'country'); assert.equal(m.column, '国'); assert.equal(m.value, '人口');
  assert.deepEqual(m.rows.map((r) => [r.cell, r.key, r.value]), MODEL.rows.map((r) => [r.cell, r.key, r.value]));
  assert.deepEqual(m.style, MODEL.style);
  /* the same packing as a classroom tour's `t` (one implementation): a tour still round-trips, and a 'j' value reads */
  const t = await encodeCustomTour({ title: 'T', steps: [{ hash: '#v=1.0000,2.0000,3.00,0,0,f', title: 's', say: 'a', ask: 'b' }] });
  const tt = await decodeCustomTour(t, (x) => MapState.encode(MapState.decode(x)));
  assert.equal(tt.title, 'T'); assert.equal(tt.steps[0].hash, '#v=1.0000,2.0000,3.00,0,0,f');
  assert.equal(await unpackText('j' + Buffer.from('{"a":1}').toString('base64url')), '{"a":1}');
  /* a link is somebody else's bytes: a key that is not a key, a kind that is not a kind, a colouring of a column the
     link does not carry — each refused or dropped, and the count said */
  const bad = linkDoc(MODEL); bad.r.push(['x', '<script>'], 'not a row');
  const rb = readStudio(bad); assert.equal(rb.ok, true); assert.equal(rb.dropped, 2); assert.equal(rb.model.rows.length, 4);
  assert.equal(readStudio(Object.assign(linkDoc(MODEL), { k: 'planet' })).ok, false);
  assert.equal(readStudio(Object.assign(linkDoc(MODEL), { v: 2 })).why, 'newer-version');
  const noCol = linkDoc(Object.assign({}, MODEL, { value: null })); assert.equal(readStudio(noCol).model.style, null, 'a colouring with no column to colour was kept');
  /* a value that inflates past its cap is refused, not truncated */
  const bomb = await packText('[' + '0,'.repeat(500000) + '0]');
  assert.equal(await unpackText(bomb, 1000), null);
  assert.equal((await unpackStudio('not base64 !!')).ok, false);
});

test('⑤ a table too big for a link is refused by the measured browser ceiling', async () => {
  assert.equal(LINK_LIMIT_MEASURED, 2097152);
  assert.deepEqual(linkFits('x'.repeat(LINK_LIMIT_MEASURED)), { chars: LINK_LIMIT_MEASURED, limit: LINK_LIMIT_MEASURED, fits: true });
  /* a real table whose cells do not compress: the packed link passes the ceiling, and the verdict says so */
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  const rows = []; for (let i = 0; i < 90000; i++) rows.push({ cell: 'c' + rnd().toString(36) + rnd().toString(36), key: 'JPN', value: String(rnd()) + '.' + rnd() });
  const v = await packStudio(Object.assign({}, MODEL, { rows }));
  const url = 'https://example.org/IntMap/' + MapState.encode({ view: { lng: 0, lat: 0, zoom: 1, bearing: 0, pitch: 0, proj: 'flat' }, ds: v });
  const f = linkFits(url);
  assert.equal(f.fits, false, 'a ' + f.chars + '-character link was called shareable');
  assert.ok(f.chars > LINK_LIMIT_MEASURED);
});

test('⑥ a link from before `ds` is byte-identical, and only a link carrying `ds` brings the studio its table', async () => {
  const old = ['#v=139.7000,35.6800,9.00,0,0,f&l=dl-quakes&tt=1914-06-15&title=T&note=N', '#v=1.0000,2.0000,3.00,0,0,g&sat=1&t3=1&b=zAbc',
    '#v=1.0000,2.0000,3.00,0,0,f&mm=eyJ2IjoxfQ'];
  for (const h of old) { assert.equal(MapState.encode(MapState.decode(h)), h); assert.equal(MapState.decode(h).ds, null); }
  const rows = MapState.SCHEMA.filter((f) => f.params.length).map((f) => f.key);
  assert.equal(rows[rows.length - 1], 'ds', 'ds is appended after every older field');
  const f = MapState.SCHEMA.find((x) => x.key === 'ds');
  assert.equal(f.owner, 'js/data-studio.js'); assert.equal(f.restore, 'full');
  assert.equal('lazy' in f, false, 'the studio is not a js/lazy-modules.js module, so the row names no lazy loader');
  /* what js/map-ui.js (viewHash) hears to decide whether to import the studio: the restore's own decoded state */
  const heard = []; const off = MapState.onRestore((e) => { if (e.phase === 'start') heard.push(e.state.ds); });
  MapState.restore(old[0], { full: true });
  MapState.restore('#v=1.0000,2.0000,3.00,0,0,f&ds=zAAAA', { full: true });
  off();
  assert.deepEqual(heard, [null, 'zAAAA'], 'a restore without a table must not look like one that carries one');
  /* the owner registers when the studio is first made (studio(HOST)) — after the restore began — and is still handed the value
     the restore left pending: the studio reads it, cannot (it is not a studio link) and says so */
  const toasts = [];
  const C = studio({ lang: 'en', imToast: (m) => toasts.push(m) });
  assert.equal(studio({}), C, 'one controller per page');
  await new Promise((r) => setTimeout(r, 450));
  assert.ok(toasts.some((m) => /could not be read/.test(m)), 'the pending value never reached the studio: ' + JSON.stringify(toasts));
  assert.equal(studioState().source, null);
});

test('⑦ the studio is not on the boot path', () => {
  const G = graph(ROOT);
  const seen = new Set(), stack = G.moduleEntries.slice();
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f) || !G.facts.has(f)) continue; seen.add(f);
    for (const s of G.facts.get(f).imports) { if (!s.startsWith('.')) continue; const r = join(f, '..', s).replace(/\\/g, '/'); if (!seen.has(r)) stack.push(r); }
  }
  assert.ok(seen.size > 50, 'the static walk found the page\'s modules (' + seen.size + ')');
  for (const f of ['js/data-studio.js', 'js/table-bind.js']) assert.equal(seen.has(f), false, f + ' is statically reachable from the page entry');
  assert.ok(G.asModule.has('js/data-studio.js'), 'the studio is reachable at all (through its lazy import)');
});

test('⑧ an Excel sheet is a table: the same decoder a CSV reaches, and its text form reads back sheet by sheet', async () => {
  const bytes = readFileSync(join(ROOT, 'tests/fixtures/data-studio-population.xlsx'));
  const z = ATL_FILE.zipOpen(new Uint8Array(bytes));
  assert.equal(ATL_FILE.zipKind(z.names), 'xlsx');
  const sheets = await ATL_FILE.sheetTables(z, ATL_FILE.LIMITS.readBytes);
  assert.equal(sheets.length, 1); assert.equal(sheets[0].name, '人口');
  assert.deepEqual(sheets[0].rows[0], ['国', '人口（百万人）']); assert.deepEqual(sheets[0].rows[1], ['日本', '125.1']);
  const file = { name: 'population.xlsx', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
  const r = await GEO_IMPORT.readGeoFile(file);
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200)); assert.equal(r.format, 'table'); assert.equal(r.entry, '人口');
  assert.equal(r.stats.delimiter, 'xlsx'); assert.deepEqual(r.stats.columns, ['国', '人口（百万人）']);
  assert.equal(r.fc.features.length, 4); assert.ok(r.fc.features.every((f) => f.geometry === null));
  const d = detect({ features: r.fc.features, stats: r.stats }, IDX);
  assert.equal(d.key, '国'); assert.equal(d.kind, 'country');
  assert.deepEqual(bind({ features: r.fc.features, stats: r.stats }, { column: '国', kind: 'country' }, IDX).rows.map((x) => x.key), ['JPN', 'DEU', 'FRA', 'BRA']);
  /* the text Atlas reads is unchanged by the shared walk, and its own framing reads back */
  const att = await ATL_FILE.read({ name: 'population.xlsx', size: bytes.length, type: '', arrayBuffer: file.arrayBuffer });
  assert.equal(att.from, 'xlsx');
  assert.equal(att.text, '--- 人口 ---\n国\t人口（百万人）\n日本\t125.1\nDeutschland\t84.5\nFrance\t68.2\nBrasil\t203.1');
  assert.deepEqual(ATL_FILE.sheetSections(att.text), [{ name: '人口', text: '国\t人口（百万人）\n日本\t125.1\nDeutschland\t84.5\nFrance\t68.2\nBrasil\t203.1' }]);
});

test('⑨ the studio publishes nothing on window, and every entry reaches it by the same literal import()', () => {
  const G = graph(ROOT);
  const me = G.facts.get('js/data-studio.js');
  assert.deepEqual([...me.writes], [], 'js/data-studio.js writes a window property');
  assert.ok(!Object.values(LAZY_REGISTRY).some((e) => /data-studio/.test(String(e.load))), 'the studio is registered as a lazy module');
  const statics = [], dynamics = {};
  for (const [f, ff] of G.facts) {
    if (ff.imports.some((x) => /(^|\/)data-studio\.js$/.test(x))) statics.push(f);
    const n = ff.dynamicImports.filter((x) => x === './data-studio.js').length; if (n) dynamics[f] = n;
  }
  assert.deepEqual(statics, [], 'a static import of the studio puts it on that module\'s graph');
  /* the four entries in js/map-ui.js (the button, a dropped table, Layers ▸ Tools, a restore carrying ds), Atlas's run and its observer */
  assert.ok((dynamics['js/map-ui.js'] || 0) >= 4, 'js/map-ui.js entries: ' + JSON.stringify(dynamics));
  assert.ok(dynamics['js/atlas-cap-data.js'] >= 1 && dynamics['js/atlas-capabilities.js'] >= 1, JSON.stringify(dynamics));
  for (const [f, ff] of G.facts) {
    if (f === 'js/data-studio.js') continue;
    assert.ok(!ff.reads.some((r) => r.name === 'IntMapDataStudio'), f + ' reads window.IntMapDataStudio');
  }
});
