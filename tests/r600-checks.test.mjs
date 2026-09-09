/* ============================================================================
 *  IntMap · R600 — THE CROSS-DATASET QUERY, AUDITED END TO END
 * ----------------------------------------------------------------------------
 *  Four defects were reported against one answer to 「人口100万人以上、年間降水量500mm未満、
 *  外洋の海岸線から200km以上の都市」, and a fifth was found while measuring them:
 *
 *   ① the same 34 rows were drawn TWICE, in two tables, one with coordinates and one without;
 *   ② the country code was printed twice per row — 「Wuzhong CN | CN」;
 *   ③ `Al Mawşil al Jadīdah` (a PPLX — «section of populated place») stood in the answer as a
 *      city of 2,065,597, while the real Mosul sits in the same GeoNames file as PPLA / 1,683,000;
 *   ④ 「UEruemqi」 — GeoNames' ASCII transliteration, printed as if it were the English name;
 *   ⑤ …and Tokyo, Cairo, Baghdad, Tehran, Moscow, Delhi, Mumbai and 71 other places over a million
 *      people were ABSENT from the `cities` table altogether.
 *
 *  ⚠ THESE CHECKS DRIVE THE SHIPPED MODULES. js/atlas-query.js is loaded and RUN — the only things
 *  stubbed are DATA (a row array standing in for the gazetteer) and the language picker, never a
 *  collaborator that decides anything. A fixture that made its own decisions could not tell whether
 *  the shipping code makes the right ones (#R552), and a check that reads the source for a spelling
 *  cannot tell whether the code was ever evaluated (#R505).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as acorn from 'acorn';
import { makeAtlasTurnResults } from '../js/atlas-turn-results.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the query engine, loaded and run ───────────────────────────────────────────────────────── */
const ORIGINS = ['raw', 'sampled', 'computed', 'network', 'derived'];

/** A gazetteer row in the shape js/gazetteer.js `_rowsFrom` publishes.
 *  [type, terms, lng, lat, en, ja, pop, iso2, gid, fcode, disp, cur] */
const gzRow = (en, pop, iso2, gid, fcode, disp) =>
  ['city', [en], 10, 50, en, en, pop, iso2, gid, fcode, disp || '', 0];

async function engine(rows, placeKinds) {
  const pick = () => { const f = (...a) => a[0]; f.arr = (a) => (Array.isArray(a) ? a[0] : String(a)); return f; };
  globalThis.window = {
    IntMapLang: { pick, pickArgs: () => ((...a) => a) },
    IntMapModules: {},
    IntMapGazetteer: {
      warm: async () => rows,
      worldMeta: () => ({ count: rows.length, placeKinds: placeKinds === undefined ? KINDS : placeKinds }),
    },
  };
  globalThis.document = { baseURI: 'http://localhost/' };
  const mod = await import('../js/atlas-query.js?' + Math.random());
  void mod;
  const API = globalThis.window.IntMapModules.atlasQuery({ lang: 'en', addPin: () => null });
  /* the two country facts the engine asks its host for, and nothing else */
  API.bind({ countryStats: () => ({ CHN: { a2: 'CN', nameEn: 'China' }, IRQ: { a2: 'IQ', nameEn: 'Iraq' } }),
    countryName: (s) => s.nameEn });
  return API;
}

/* GeoNames' own verdicts, in the shape the build ships them (see scripts/build-gazetteer.mjs). */
const KINDS = {
  PPL: { kind: 'settlement', desc: 'populated place' },
  PPLA: { kind: 'settlement', desc: 'seat of a first-order administrative division' },
  PPLA2: { kind: 'settlement', desc: 'seat of a second-order administrative division' },
  PPLC: { kind: 'settlement', desc: 'capital of a political entity' },
  PPLX: { kind: 'part', desc: 'section of populated place' },
  PPLH: { kind: 'defunct', desc: 'historical populated place' },
  PPLQ: { kind: 'defunct', desc: 'abandoned populated place' },
  PPLW: { kind: 'defunct', desc: 'destroyed populated place' },
};

/* ══ ① A SECTION OF A CITY IS NOT A CITY ═══════════════════════════════════════════════════════ */
test('R600 ①: the cities table admits places and refuses parts of places and places that are gone', async () => {
  const API = await engine([
    gzRow('Mosul', 1683000, 'IQ', '99072', 'PPLA'),
    gzRow('Al Mawsil al Jadidah', 2065597, 'IQ', '99071', 'PPLX', 'Al Mawşil al Jadīdah'),
    gzRow('Kowloon', 2232339, 'HK', '1819609', 'PPLX'),
    gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2'),
    gzRow('Gonebury', 3000000, 'CN', '9', 'PPLQ'),
    gzRow('Newcode', 4000000, 'CN', '10', 'PPLZZ'),   /* GeoNames has not classified this one */
  ]);
  const res = await API.run({ from: 'cities', where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  const names = res.rows.map((r) => r.name);

  assert.ok(names.includes('Mosul'), 'the real Mosul must be in the answer');
  assert.ok(!names.includes('Al Mawşil al Jadīdah'), 'a PPLX is a section of a city, not a city');
  assert.ok(!names.includes('Kowloon'), 'the same rule, on a second measured case');
  assert.ok(!names.includes('Gonebury'), 'a place GeoNames records as abandoned is not a city');
  assert.ok(names.includes('Wuzhong'), 'an administrative seat IS a city');
  /* ⚠ THE DEFAULT FOR AN UNKNOWN CODE IS TO ADMIT. «GeoNames has not classified this yet» is not
     evidence that the place is a district, and a silent drop would remove real cities the day
     GeoNames adds a code. The build is what fails loudly when a code has no published description. */
  assert.ok(names.includes('Newcode'), 'an unclassified code is admitted, not silently dropped');

  /* the counts stop being one number the moment a row is refused */
  assert.equal(res.universe.loaded, 6, 'six records came out of the source list');
  assert.equal(res.universe.notACity, 3, 'two sections of a place and one abandoned place');
  assert.equal(res.universe.eligible, 3, 'Mosul, Wuzhong and the unclassified one');
  assert.equal(res.scanned, 3, 'evaluated counts the rows the conditions were actually asked about');
});

test('R600 ①b: with no verdicts shipped, nothing is refused — an older file degrades, it does not lie', async () => {
  const API = await engine([gzRow('Kowloon', 2232339, 'HK', '1819609', 'PPLX')], null);
  const res = await API.run({ from: 'cities', where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  assert.equal(res.rows.length, 1, 'a v2 gazetteer carries no feature codes and no verdicts');
  assert.equal(res.universe.classified, false);
});

/* ══ ② THE DISPLAY NAME IS NOT THE MATCHING SURFACE ════════════════════════════════════════════ */
test('R600 ②: a row prints the name chosen for a reader, not GeoNames ASCII transliteration', async () => {
  const API = await engine([gzRow('UEruemqi', 3029372, 'CN', '1529102', 'PPLA', 'Ürümqi')]);
  const res = await API.run({ from: 'cities', where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  assert.equal(res.rows[0].name, 'Ürümqi');
  assert.equal(res.rows[0].asciiName, 'UEruemqi', 'the transliteration is kept — it is a real matching surface');
  /* ⚠ the ID IS THE GEONAMES ID. `c17` meant «row 17 of whichever build is loaded», so the same
     city changed identity on every rebuild and again whenever the phone cut the list short. */
  assert.equal(res.rows[0].id, 'geonames:1529102');
  assert.equal(res.rows[0].geonameId, '1529102');

  /* …and the row says WHICH RECORD it is, so a population can be checked against its source.
     「Wuzhong 7,202,654」 is GeoNames' own figure for a prefecture seat, not IntMap arithmetic —
     the reader can only know that if the row names the record. */
  const out = await API.answer({ from: 'cities', show: ['pop'], where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  assert.match(out.html, /Record type[^"]*PPLA/, 'the feature code, with GeoNames own words for it');
  assert.match(out.html, /GeoNames ID: 1529102/);
  /* ⚠ AND THE TRANSLITERATION REACHES THE READER NOWHERE IN THE FRAGMENT — not as the label and
     not in a tooltip either. The first draft of `rowProvenance` included it and this file still
     passed, because it was asking about the CELL; tests/r600.spec.js ③ asks about the whole
     fragment and caught it. The two now agree, and this is the cheaper of the two to run. */
  assert.doesNotMatch(out.html, /UEruemqi/, 'the ASCII matching key is not something a reader is shown');
});

/* ══ ③ THE COUNTRY, ONCE ═══════════════════════════════════════════════════════════════════════ */
test('R600 ③: the country code is not printed twice, and the column shows a country', async () => {
  const API = await engine([gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2')]);
  const withCountry = await API.answer({ from: 'cities', show: ['pop', 'country'],
    where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  assert.ok(withCountry.html.includes('China'), 'the country column names the country');
  assert.ok(!/Wuzhong<\/?span[^>]*>?\s*<span[^>]*>CN</.test(withCountry.html), 'no code glued to the name');
  assert.equal((withCountry.html.match(/>CN</g) || []).length, 0, 'the bare code is not printed at all when the column is shown');

  /* …and when the reader did NOT ask for the country, the code beside the name still does its job */
  const withoutCountry = await API.answer({ from: 'cities', show: ['pop'],
    where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  assert.ok(/>CN</.test(withoutCountry.html), 'with no country column the name still carries the code');
});

test('R600 ③b: the country column compares on the CODE, whatever it prints', async () => {
  const API = await engine([gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2'), gzRow('Mosul', 1683000, 'IQ', '99072', 'PPLA')]);
  const res = await API.run({ from: 'cities', show: ['country'], where: [{ col: 'country', op: '==', value: 'CN' }] });
  assert.deepEqual(res.rows.map((r) => r.name), ['Wuzhong'],
    'a predicate on a localised label would break the moment the reader changed language');
});

/* ══ ④ ONE OPERATION, ONE TABLE ════════════════════════════════════════════════════════════════ */
test('R600 ④: the identity of a query is what it resolved, not which columns it printed', async () => {
  const API = await engine([gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2')]);
  const q = (extra) => Object.assign({ from: 'cities', where: [{ col: 'pop', op: '>=', value: 1000000 }] }, extra);

  const a = await API.run(q({ show: ['pop'] }));
  const b = await API.run(q({ show: ['pop', 'lat', 'lng'] }));
  assert.ok(a.resultKey, 'the case must declare one — without it the turn falls back on the arguments');
  assert.equal(a.resultKey, b.resultKey, 'two drafts of one answer, differing only in what they show');

  /* an alias is not a different question … */
  const c = await API.run(q({ show: ['pop'], where: [{ col: 'pop', op: 'gte', value: 1000000 }] }));
  assert.equal(a.resultKey, c.resultKey, '`gte` and `>=` are the same condition');

  /* … but everything that changes WHICH ROWS COME BACK is */
  for (const [what, spec] of [
    ['a different threshold', q({ where: [{ col: 'pop', op: '>=', value: 2000000 }] })],
    ['a different table', { from: 'countries' }],
    ['a country scope', q({ in: ['CN'] })],
    ['a row limit', q({ limit: 5 })],
    ['an ordering', q({ order: { col: 'pop', dir: 'asc' } })],
  ]) {
    const r = await API.run(spec);
    assert.notEqual(a.resultKey, r.resultKey, what + ' is a different question');
  }

  /* ⚠⚠ AND THE FIELDS THAT ARE NOT IN THE SCHEMA COUNT TOO. `quakeRows` reads `sinceDays`,
     `minMagnitude` and `bbox` straight off the spec and `facilityRows` reads `kind`; none of them
     appear in js/atlas-schemas.js's property list for data.query. A key built from a remembered
     list of fields would have merged two earthquake questions a month apart in their window. */
  const q1 = await API.run({ from: 'cities', sinceDays: 30, where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  const q2 = await API.run({ from: 'cities', sinceDays: 365, where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  assert.notEqual(q1.resultKey, q2.resultKey, 'a field the schema never declared still decides the rows');

  /* …and the clamp is respected: two limits that resolve to the same rows are one answer. */
  const c1 = await API.run(q({ limit: 1000 }));
  const c2 = await API.run(q({ limit: 200 }));
  assert.equal(c1.resultKey, c2.resultKey, 'both clamp to OUT_CAP, so both resolved the same rows');
});

test('R600 ④b: the turn keeps ONE block for two runs that resolved the same rows', () => {
  const TR = makeAtlasTurnResults();
  const key = 'data.query:cities|pop>=1000000|null|[]|null|50';
  const act = (show) => ({ type: 'query', from: 'cities', show });
  const kept = TR.keep([
    { act: act(['pop']), ok: true, html: '<table>first</table>', meta: { resultKey: key, status: 'completed' } },
    { act: act(['pop', 'lat', 'lng']), ok: true, html: '<table>second</table>', meta: { resultKey: key, status: 'completed' } },
  ]);
  assert.equal(kept.length, 1, 'this is the reported defect: the reader saw both');
  assert.ok(kept[0].html.includes('second'), 'the later run is the one the app is holding');

  /* ⚠ AND THE GUARD MUST NOT OVER-COLLAPSE. Two genuinely different questions stay two answers. */
  const two = TR.keep([
    { act: act(['pop']), ok: true, html: '<table>cn</table>', meta: { resultKey: key + ':CN', status: 'completed' } },
    { act: act(['pop']), ok: true, html: '<table>iq</table>', meta: { resultKey: key + ':IQ', status: 'completed' } },
  ]);
  assert.equal(two.length, 2);
});

test('R600 ④c: the shipped dispatch actually hands the key to the turn', () => {
  /* ⚠ MEASURED ON THE WIRING THAT SHIPS, not on a copy of it (#R552): a key the engine builds and
     the door drops is a key nothing has. */
  const src = read('js/atlas-console.js');
  const tree = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', ranges: true });
  let seen = null;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'SwitchCase' && n.test && n.test.type === 'Literal' && n.test.value === 'dataQuery') {
      seen = src.slice(n.range[0], n.range[1]);
    }
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(tree);
  assert.ok(seen, 'the data.query dispatch case must still be reachable in the parse tree');
  assert.match(seen, /resultKey/, 'the door reads the key the engine declared');
  assert.match(seen, /meta\s*[:=]\s*\{\s*resultKey/, 'and passes it as meta, which is where opKey looks');
});

/* ══ ⑤ EVERY COLUMN SAYS HOW ITS NUMBER WAS OBTAINED ═══════════════════════════════════════════ */
test('R600 ⑤: every column the planner may name declares a source AND an origin', async () => {
  const API = await engine([]);
  const cat = API.catalogue();
  let n = 0;
  for (const t of cat.tables) {
    for (const id of cat.columns[t]) {
      const c = API.columnFor(t, id);
      assert.ok(c, t + '.' + id + ' is advertised to the planner but does not resolve');
      assert.ok(ORIGINS.includes(c.origin), t + '.' + id + ' has origin=' + c.origin);
      n++;
    }
  }
  assert.ok(n >= 40, 'the whole registry was walked, not a corner of it — saw ' + n);

  /* the three the reported answer used, each a genuinely different kind of number */
  assert.equal(API.columnFor('cities', 'pop').origin, 'raw');
  assert.equal(API.columnFor('cities', 'precipMm').origin, 'sampled');
  assert.equal(API.columnFor('cities', 'coastKm').origin, 'computed');
  assert.equal(API.columnFor('cities', 'elevM').origin, 'network');
  /* ⚠ NOT DERIVABLE FROM `cost`: precipMm and coastKm are both cost 1 and are not the same thing. */
  assert.equal(API.columnFor('cities', 'precipMm').cost, API.columnFor('cities', 'coastKm').cost);
});

test('R600 ⑤b: the method block prints the chain of counts and how each number was obtained', async () => {
  const API = await engine([
    gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2'),
    gzRow('Kowloon', 2232339, 'HK', '1819609', 'PPLX'),
  ]);
  const out = await API.answer({ from: 'cities', show: ['pop'], where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  const h = out.html;
  assert.match(h, /source records/, 'how many records the source holds');
  assert.match(h, /are a place in its own right/, 'how many of them are a place');
  assert.match(h, /evaluated/, 'how many the conditions were asked about');
  assert.match(h, /match/, 'how many survived');
  assert.match(h, /a field of the source record, copied/, 'population is read, not measured');
  assert.match(h, /section of another place/, 'and the reader is told what was refused, and why');
});

/* ══ ⑥ WHAT THE BUILD MUST KEEP SHIPPING ═══════════════════════════════════════════════════════ */
test('R600 ⑥: the world gazetteer carries GeoNames identity, feature code and a display name', () => {
  const p = join(ROOT, 'data', 'gazetteer-world.json.gz');
  assert.ok(existsSync(p), 'data/gazetteer-world.json.gz');
  const doc = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));

  assert.deepEqual(doc.fields.slice(0, 7), ['en', 'ja', 'iso2', 'lng', 'lat', 'pop', 'alt'],
    'the first seven positions are a contract with six consumers and eight tests — append only');
  for (const f of ['gid', 'fcode', 'disp', 'cur']) assert.ok(doc.fields.includes(f), 'fields must carry ' + f);

  const iGid = doc.fields.indexOf('gid'), iFc = doc.fields.indexOf('fcode'), iCur = doc.fields.indexOf('cur');
  const ids = new Set();
  for (const r of doc.rows) {
    assert.match(String(r[iGid]), /^\d+$/, 'every row keeps its GeoNames id');
    assert.ok(!ids.has(r[iGid]), 'a GeoNames id identifies one row: ' + r[iGid]);
    ids.add(r[iGid]);
    assert.ok(r[iFc], 'every row keeps its feature code');
    assert.ok(r[iCur] === 0 || r[iCur] === 1, 'the curated flag is a flag');
  }

  /* ⚠ THE VERDICTS COME FROM GEONAMES' OWN SENTENCES, and this is where that is checked. The build
     classifies by description; if GeoNames rewords one, the derivation must still land here. */
  assert.ok(doc.placeKinds, 'the build must ship the classification the browser cannot compute');
  assert.equal(doc.placeKinds.PPLX.kind, 'part', 'section of populated place');
  for (const code of ['PPLH', 'PPLQ', 'PPLW', 'PPLCH']) {
    if (doc.placeKinds[code]) assert.equal(doc.placeKinds[code].kind, 'defunct', code + ' is gone');
  }
  for (const code of ['PPL', 'PPLA', 'PPLA2', 'PPLC']) {
    assert.equal(doc.placeKinds[code].kind, 'settlement', code + ' is a place');
  }
  for (const code in doc.placeKinds) assert.ok(doc.placeKinds[code].desc, code + ' must carry the published description it was classified by');
});

test('R600 ⑥b: the reported rows, in the shipped file', () => {
  const doc = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString('utf8'));
  const iGid = doc.fields.indexOf('gid'), iFc = doc.fields.indexOf('fcode'), iDisp = doc.fields.indexOf('disp');
  const byGid = new Map(doc.rows.map((r) => [String(r[iGid]), r]));

  const mawsil = byGid.get('99071');
  assert.ok(mawsil, 'Al Mawşil al Jadīdah is still in the file — it is a real name in the news');
  assert.equal(mawsil[iFc], 'PPLX', 'and it is still a section of a place, which is why queries refuse it');
  assert.ok(byGid.get('99072'), 'the real Mosul is in the file');
  assert.equal(byGid.get('99072')[iFc], 'PPLA');

  const urumqi = byGid.get('1529102');
  assert.ok(urumqi, 'Ürümqi');
  const shown = urumqi[iDisp] || urumqi[0];
  assert.notEqual(shown, 'UEruemqi', 'the transliteration must not be what a reader is shown');

  /* ⑤ — the hole nothing had noticed: the most important cities on Earth were not in this list */
  const named = new Set(doc.rows.map((r) => String(r[iDisp] || r[0])));
  for (const city of ['Tokyo', 'Cairo', 'Baghdad', 'Moscow', 'Mumbai', 'Delhi', 'Paris', 'Mosul']) {
    assert.ok(named.has(city), city + ' must be in the place list the query engine reads');
  }
});

test('R600 ⑥d: the phone gets the verdicts as well as the codes', () => {
  /* ⚠⚠ A SLICE THAT CARRIED THE FEATURE CODES AND NOT THE CLASSIFICATION would put districts back
     into the answer ON PHONES ONLY, from the same build, with nothing in either file saying so —
     the reader on the small screen gets Kowloon as a city and the reader on the large one does not.
     `placeKinds` is a header field, so it has to be copied like the other header fields. */
  const world = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString('utf8'));
  const phone = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-phone.json.gz'))).toString('utf8'));
  assert.deepEqual(phone.fields, world.fields, 'the two artefacts must be one build');
  assert.deepEqual(phone.placeKinds, world.placeKinds,
    'the phone reads the same verdicts, so `cities` means the same thing on both');
  const iFc = phone.fields.indexOf('fcode');
  const unknown = phone.rows.filter((r) => !phone.placeKinds[r[iFc]]).length;
  assert.equal(unknown, 0, 'every code in the shipped phone rows is classified in its own header');
});

test('R600 ⑥c: js/ does not carry a hand-written list of GeoNames feature codes', () => {
  /* ⚠ THE POINT OF READING featureCodes_en.txt IS THAT NOBODY HAS TO KEEP A LIST. A spelling here
     would be the thing this round removed, growing back one code at a time. */
  const src = read('js/atlas-query.js');
  const hits = src.match(/['"]PPL[A-Z0-9]*['"]/g) || [];
  assert.deepEqual(hits, [], 'feature codes belong to GeoNames and to the shipped verdicts, not to this file');
});
