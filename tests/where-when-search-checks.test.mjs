/* (where-when-search) «WHERE + WHEN» IN ONE FIELD — js/where-when.js, and the three doors that ask it.
   The parse is EVALUATED (not read): every form the product promises, the forms it must refuse, and the forms it must
   leave alone (an address, a postcode, a road number). The historical place readers are the REAL records
   (data/hist-cities.json through the real js/hist-cities.js, data/hist-places.json). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

globalThis.window = globalThis;
await import('../js/hist-scale.js');
const WW = await import('../js/where-when.js');
const MIN = window.IntMapHistScale.FLOOR;
const NOW = new Date(Date.UTC(2026, 9, 7, 12));
const P = (q) => WW.parse(q, { min: MIN, now: NOW });

test('the promised forms are read: place, astronomical year, month, day', () => {
  const cases = [
    ['京都 1600', '京都', 1600, null, null],
    ['Berlin May 1945', 'Berlin', 1945, 5, null],
    ['ローマ 紀元前44年', 'ローマ', -43, null, null],
    ['Constantinople 1453', 'Constantinople', 1453, null, null],
    ['1900年の上海', '上海', 1900, null, null],
    ['江戸 1868-01', '江戸', 1868, 1, null],
    ['1914', '', 1914, null, null],
    ['Rome 44 BC', 'Rome', -43, null, null],
    ['AD 800 Aachen', 'Aachen', 800, null, null],
    ['8 May 1945 Berlin', 'Berlin', 1945, 5, 8],
    ['May 8, 1945', '', 1945, 5, 8],
    ['Paris in 1900', 'Paris', 1900, null, null],
    ['京都1600年', '京都', 1600, null, null],
    ['Rome 15 March 44 B.C.', 'Rome', -43, 3, 15],
    ['Uruk 3400 BC', 'Uruk', -3399, null, null],
    ['紀元前3400年 ウルク', 'ウルク', -3399, null, null],
    ['1945年5月8日 ベルリン', 'ベルリン', 1945, 5, 8],
  ];
  for (const [q, place, y, m, d] of cases) {
    const p = P(q);
    assert.ok(p.when, q + ' reads an instant');
    assert.equal(p.problem, null, q + ' has no problem');
    assert.deepEqual([p.place, p.when.y, p.when.m, p.when.d], [place, y, m, d], q);
  }
});

test('Japanese era years are ICU\'s japanese calendar, to a year; a lunisolar month is not converted and is said so', () => {
  const a = P('慶長5年 京都'); assert.deepEqual([a.place, a.when.y, a.when.calendar, a.when.era.name], ['京都', 1600, 'japanese', '慶長']);
  const b = P('明治元年 東京'); assert.deepEqual([b.when.y, b.when.era.n], [1868, 1]);
  const c = P('令和元年5月1日'); assert.deepEqual([c.when.y, c.when.m, c.when.d], [2019, 5, 1], 'after 1873 the month is Gregorian');
  const d = P('慶応4年3月 江戸'); assert.deepEqual([d.when.y, d.when.m, d.when.dropped], [1868, null, 'lunisolar']);
  assert.match(WW.problemText(d, 'jp'), /太陰太陽暦/);
  assert.match(WW.problemText(d, 'en'), /lunisolar/);
  /* every era ICU carries maps back onto itself: era start + n − 1, formatted in the japanese calendar, is that era */
  const E = WW.japaneseEras();
  assert.ok(E.size >= 230, 'ICU carries the eras from 大化 (measured 2026-10-07: ' + E.size + ')');
  const f = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric', timeZone: 'UTC' });
  for (const name of ['大化', '慶長', '明治', '大正', '昭和', '平成', '令和']) {
    const e = E.get(name); assert.ok(e, name);
    const t = new Date(0); t.setUTCFullYear(e.start, 11, 31);
    assert.equal(f.formatToParts(t).find((x) => x.type === 'era').value, name, name + ' starts in ' + e.start);
  }
});

test('what cannot be converted is refused with the reason, never read as a Common Era year', () => {
  for (const q of ['康熙5年', '乾隆30年', '永楽元年']) {
    const p = P(q); assert.equal(p.when, null, q); assert.equal(p.problem && p.problem.code, 'unknown-era', q);
    assert.match(WW.problemText(p, 'jp'), /変換できる元号ではありません/);
  }
  assert.equal(P('Rome 2027').when, null, 'a bare year after today is not a year (a postcode)');
  assert.equal(P('Berlin May 2027').problem.code, 'future');
  assert.equal(WW.parse('Uruk 200000 BC', { min: MIN, now: NOW }).problem.code, 'before-floor');
});

test('lines that are not a place-and-time are left alone', () => {
  for (const q of ['1600 Pennsylvania Avenue', 'Route 66', '10115', 'Tokyo', 'District 9', '8001', 'Area 51']) {
    const p = P(q); assert.equal(p.when, null, q); assert.equal(p.place, q, q);
  }
});

test('the vocabulary is the platform\'s: era words and month names come from Intl, not from this file', () => {
  const V = WW.vocabulary();
  assert.ok(V.bceWords.includes('紀元前') && V.bceWords.includes('BC') && V.ceWords.includes('西暦'));
  assert.equal(V.months.get('may'), 5); assert.equal(V.months.get('mai'), 5, 'de/fr month names — every declared language');
  const src = read('js/where-when.js');
  for (const word of ['January', 'February', 'December', '慶長', '明治', '昭和', '平成', '令和']) assert.ok(!new RegExp("['\"]" + word + "['\"]").test(src), word + ' is not spelled as a literal');
});

test('the reading is written in the reader\'s words, BCE through the platform', () => {
  assert.equal(WW.whenText(P('ローマ 紀元前44年').when, 'jp'), '紀元前44年');
  assert.equal(WW.whenText(P('Rome 44 BC').when, 'en'), '44 BC');
  assert.equal(WW.whenText(P('京都 1600').when, 'jp'), '1600年');
  assert.equal(WW.whenText(P('慶長5年 京都').when, 'jp'), '1600年（慶長5年）');
  assert.equal(WW.whenText(P('Berlin May 1945').when, 'en'), 'May 1945');
});

test('applyWhen sets a clock the way Chronos sets a year, a month and a day', () => {
  const calls = [];
  const clock = { min: MIN, setYear: (y, o) => calls.push(['year', y, o.source]), set: (d, o) => calls.push(['set', window.IntMapHistScale.ymd(d), o.source]), iso: () => 'x', isLive: () => false };
  WW.applyWhen(P('京都 1600').when, { clock, source: 't' });
  WW.applyWhen(P('Berlin May 1945').when, { clock, source: 't' });
  WW.applyWhen(P('Rome 15 March 44 BC').when, { clock, source: 't' });
  assert.deepEqual(calls, [['year', 1600, 't'], ['set', '1945-05-15', 't'], ['set', '-000043-03-15', 't']]);
});

/* the real record through the real reader */
const cities = JSON.parse(read('data/hist-cities.json'));
const places = JSON.parse(read('data/hist-places.json'));
globalThis.document = { baseURI: new URL('./', ROOT).href };
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(String(u))), 'utf8') });
await import('../js/hist-cities.js');
await window.IntMapHistCities.ensure();
window.IntMapHistPlaces = { ensure: async () => places, records: () => places.places };

test('the historical city record answers a name it HAD, and says what the city is called today', async () => {
  assert.equal(await WW.ensureHist(), true, 'both readers settle their own ensure()');
  assert.equal(window.IntMapHistCities.records().length, cities.cities.length);
  const c = WW.histCandidates('Constantinople', P('Constantinople 1453').when, 'en').find((r) => r.source === 'histCities');
  const ist = cities.cities.find((x) => x.id === 'istanbul');
  assert.ok(c, 'Constantinople is found'); assert.deepEqual([c.lng, c.lat], [ist.lon, ist.lat]);
  assert.match(c.note, /today Istanbul/);
  const edo = WW.histCandidates('江戸', P('江戸 1868-01').when, 'jp').find((r) => r.source === 'histCities');
  assert.ok(edo && edo.id === 'tokyo', '江戸 is Tokyo');
  assert.match(edo.note, /今日の 東京/);
});

test('Pleiades answers an ancient name; a period with no attested name is said', () => {
  const r = WW.histCandidates('Roma', P('Roma 44 BC').when, 'en').find((x) => x.source === 'pleiades' && x.id === 'pl-423025');
  assert.ok(r); assert.doesNotMatch(r.note, /no name of it is attested/);
  const late = WW.histCandidates('Roma', { y: 1200, m: null, d: null, precision: 'year' }, 'en').find((x) => x.id === 'pl-423025');
  assert.match(late.note, /no name of it is attested/);
});

test('the era name of a modern place is the record\'s, by its own guard', () => {
  const tokyo = cities.cities.find((x) => x.id === 'tokyo');
  assert.equal(WW.eraNameAt(tokyo.lon, tokyo.lat, P('Tokyo 1700').when, 'jp', '東京'), '江戸');
  assert.equal(WW.eraNameAt(tokyo.lon, tokyo.lat, P('Tokyo 1950').when, 'jp', '東京'), null, 'outside every span: the modern name stands');
});

test('samePlace is the record guard: one city copies are one place, two cities are two', () => {
  const tokyo = cities.cities.find((x) => x.id === 'tokyo');
  assert.equal(WW.samePlace({ lng: tokyo.lon, lat: tokyo.lat, guard: tokyo.g }, { lng: 139.76, lat: 35.68 }), true);
  assert.equal(WW.samePlace({ lng: tokyo.lon, lat: tokyo.lat, guard: tokyo.g }, { lng: 135.77, lat: 35.01 }), false, 'Kyoto is not Tokyo');
  assert.equal(WW.samePlace({ lng: 1, lat: 1 }, { lng: 1, lat: 1 }), false, 'without a guard the caller own fold decides');
});

test('interpret: one place one row, the time-only row, and nothing for a line with no instant', async () => {
  const tokyo = cities.cities.find((x) => x.id === 'tokyo');
  const local = (q) => (q === '東京' ? [{ name: '東京', lng: tokyo.lon, lat: tokyo.lat, kind: 'capital', level: 3 }] : []);
  const a = await WW.interpret('東京 1700', { local, lang: 'jp', min: MIN });
  assert.equal(a.rows.filter((r) => Math.abs(r.lat - tokyo.lat) < 0.01).length, 1, 'the gazetteer row and the record\'s Tokyo are one row');
  assert.match(a.rows[0].title, /^東京 · 1700年$/); assert.match(a.rows[0].sub, /江戸/);
  const b = await WW.interpret('1914', { local, lang: 'en', min: MIN });
  assert.equal(b.rows.length, 1); assert.ok(b.rows[0].timeOnly); assert.equal(b.rows[0].title, 'Go to 1914');
  const c = await WW.interpret('Tokyo', { local, lang: 'en', min: MIN });
  assert.equal(c.rows.length, 0);
});

test('every door asks the one reading: the search field, the palette and Atlas', () => {
  const sg = read('js/search-geocode.js'), cp = read('js/command-palette.js'), at = read('js/atlas-where-when.js'), cap = read('js/atlas-cap-time.js');
  for (const [name, src] of [['search', sg], ['palette', cp], ['atlas', at]]) assert.match(src, /import\('\.\/where-when\.js'\)/, name + ' fetches js/where-when.js on use (never at boot)');
  assert.match(cap, /row: \['time\.whereWhen',\s+'whereWhen'/);
  assert.match(cap, /import\('\.\/atlas-where-when\.js'\)/, 'the Atlas run is fetched on first use (check:perf)');
  assert.match(read('js/atlas-capabilities.js'), /\["time\.whereWhen","whereWhen"/, 'the registry copy carries it (atlas-caps --write)');
  /* one reading, one Enter (one-pass-or-a-reason.md): an instant alone goes at once; with a place, ONE place goes — the
     same rule as time.whereWhen; there is no «show first, go on the second Enter» state */
  assert.ok(sg.includes("if(go&&when&&!rowWhen){ if(res){ res.style.display='none'; } _picked(inp,typed); WW.applyWhen(when,{source:'search'}); return; }"), 'an instant alone goes on the first Enter');
  assert.match(sg, /const one=_onePlace\(true\); if\(one\)\{ one\.el\.click\(\); return; \}/);
  assert.doesNotMatch(sg, /_imWhenShown/);
  /* no door parses dates itself */
  for (const src of [sg, cp, at]) assert.doesNotMatch(src, /紀元前\\s\*\(\\d/);
  assert.doesNotMatch(read('src/main.js'), /where-when/, 'not on the boot path');
});
