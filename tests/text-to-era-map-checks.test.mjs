/* (text-to-era-map) A PASSAGE ON THE MAP OF ITS OWN TIME — js/atlas-text-map.js, the `era` rung of js/atlas-map-compose.js
   and js/where-when.js `placeAt`, EVALUATED over the real records (data/hist-cities.json through the real js/hist-cities.js,
   data/hist-places.json) and two real passages: 奥の細道 (1702) and Caesar's Bellum Gallicum I. Only the modern gazetteer
   and the renderer are scripted. What is measured is what the feature promises the reader:
     · a year moves the clock only when the text states it (and the calendar's reading of the quote wins over Atlas's);
     · a name is drawn only when it is in the text, and a historical name is placed by the historical record first;
     · a name the records give two places is NOT placed — it comes back with the candidates. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

globalThis.window = globalThis;
await import('../js/hist-scale.js');
await import('../js/safe-html.js');
const WW = await import('../js/where-when.js');
const TM = await import('../js/atlas-text-map.js');
/* the capability as Atlas runs it: the entry's run, which hands the conversation off K to the module */
const ENTRY = (await import('../js/atlas-cap-time.js')).default.find((x) => x.row[0] === 'time.textMap');
const RUN = (a, dctx, K) => ENTRY.run(a, dctx, K);
const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
const { IntMapTime } = await import('../js/chronos.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');

const places = JSON.parse(read('data/hist-places.json'));
globalThis.document = { baseURI: new URL('./', ROOT).href, addEventListener: () => {}, querySelectorAll: () => [] };
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(String(u)), 'utf8')) });
await import('../js/hist-cities.js');
await window.IntMapHistCities.ensure();
window.IntMapHistPlaces = { ensure: async () => places, records: () => places.places };

/* 松尾芭蕉『おくのほそ道』（1702 年刊）旅立ち・草加 — public domain */
const OKU = '弥生も末の七日、明ぼのの空朧々として、月は在明にて光をさまれる物から、富士の峰幽にみえて、上野・谷中の花の梢又いつかはと心ぼそし。'
  + 'むつまじきかぎりは宵よりつどひて、舟に乗て送る。千じゆと云所にて船をあがれば、前途三千里のおもひ胸にふさがりて、幻のちまたに離別の泪をそそぐ。\n'
  + 'ことし元禄二とせにや、奥羽長途の行脚只かりそめに思ひたちて、呉天に白髪の恨を重ぬといへ共、耳にふれていまだめに見ぬさかひ、若生て帰らばと定なき頼の末をかけ、其日漸草加と云宿にたどり着にけり。';
/* C. Iulius Caesar, Commentarii de Bello Gallico I.6–7, I.23 — public domain */
const BG = 'Is dies erat a. d. V. Kal. Apr. L. Pisone, A. Gabinio consulibus. Caesari cum id nuntiatum esset, eos per provinciam nostram iter facere conari, '
  + 'maturat ab urbe proficisci et quam maximis potest itineribus in Galliam ulteriorem contendit et ad Genavam pervenit. '
  + 'Postridie eius diei, quod omnino biduum supererat cum exercitui frumentum metiri oporteret, et quod a Bibracte, oppido Haeduorum longe maximo et copiosissimo, '
  + 'non amplius milibus passuum XVIII aberat, rei frumentariae prospiciendum existimavit.';

function engine() {
  const sources = new Set(), layers = new Set(); let data = { features: [] };
  const g = { layers: { hasSource: (id) => sources.has(id), addSource: (id) => sources.add(id), setSourceData: (id, d) => { data = d; }, has: (id) => layers.has(id),
    add: (d) => layers.add(d.id), setVisible: () => {}, getLayout: () => 'visible' },
  camera: { flyTo: () => {}, fitBounds: () => {}, getZoom: () => 3 }, events: { onLayer: () => {}, on: () => {} }, render: { canvas: () => ({ style: {} }), claim: () => {} } };
  return { GE: () => g, count: () => data.features.filter((f) => f.properties.t === 'pt').length };
}
const GAZ = { '草加': { lng: 139.80, lat: 35.83, name: '草加市' }, '千住': { lng: 139.80, lat: 35.75, name: '千住' }, '上野': { lng: 139.77, lat: 35.71, name: '上野' },
  '谷中': { lng: 139.77, lat: 35.72, name: '谷中' }, '富士山': { lng: 138.73, lat: 35.36, name: '富士山' }, 'geneva': { lng: 6.14, lat: 46.20, name: 'Genève' } };
function kernel(text) {
  const eng = engine(), asked = [], GEOBJ = makeAtlasGeoObject();
  const COMPOSE = makeAtlasMapCompose({ GE: eng.GE, ledger: makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject }), geoObject: GEOBJ.geoObject, geocode: async (q) => { asked.push(q); return GAZ[String(q).toLowerCase()] || GAZ[q] || null; },
    histResolve: (n, w) => WW.placeAt(n, w, 'en'), verifyPlaces: undefined, L: (en, jp) => jp || en });
  const K = { L: (en, jp) => jp, esc: (s) => window.IntMapSafe.html(s), HOST: { lang: 'jp' }, COMPOSE, _lastUserMsg: text, _hist: [], _curTurn: 1 };
  return { K, eng, asked };
}

test('a year or day counted in 漢数字 is read as digits — and only where something is counted', () => {
  assert.equal(TM.countedDigits('元禄二とせ'), '元禄2年');
  assert.equal(TM.countedDigits('千六百八十九年'), '1689年');
  assert.equal(TM.countedDigits('一六八九年三月二十七日'), '1689年3月27日');
  assert.equal(TM.countedDigits('二条城'), '二条城', 'a street number is not a count of years');
  assert.equal(WW.parse(TM.countedDigits('ことし元禄二とせにや')).when.y, 1689);
});

test('a stated instant: the quote must be in the text, and the calendar\'s reading wins over Atlas\'s', () => {
  const c = [OKU];
  const ok = TM.readInstant({ quote: '元禄二とせ', read: '元禄2年' }, c, WW);
  assert.deepEqual([ok.ok, ok.by, ok.when.y], [true, 'code', 1689]);
  assert.equal(TM.readInstant({ quote: '元禄二とせ', read: '1700' }, c, WW).reason, 'reading_disagrees', 'Atlas cannot re-date the words the calendar reads');
  assert.equal(TM.readInstant({ quote: '元禄三年', read: '元禄3年' }, c, WW).reason, 'quote_not_in_text', 'words the passage does not contain move no clock');
  /* a consular date: no calendar here reads it, so Atlas's reading is used — and marked as Atlas's */
  const bg = TM.readInstant({ quote: 'L. Pisone, A. Gabinio consulibus', read: '58 BC' }, [BG], WW);
  assert.deepEqual([bg.ok, bg.by, bg.when.y], [true, 'atlas', -57]);
  /* a line break inside the quoted words is still the same words */
  assert.equal(TM.inText('L. Pisone,\nA. Gabinio', [BG]), true);
});

test('奥の細道: the clock goes to 1689 from 「元禄二とせ」, the places are the passage\'s, a name it does not contain is not drawn', async () => {
  const { K, eng, asked } = kernel(OKU);
  const r = await RUN({
    when: { quote: '元禄二とせ', read: '元禄2年' },
    places: [{ name: '富士', as: '富士山' }, { name: '上野' }, { name: '谷中' }, { name: '千じゆ', as: '千住' }, { name: '草加' }, { name: '平泉' }],
  }, { turnId: 't1' }, K);
  assert.equal(r.exec.era.applied, true); assert.equal(r.exec.era.year, 1689); assert.equal(r.exec.era.readBy, 'code');
  assert.equal(IntMapTime.when().getUTCFullYear(), 1689, 'the master clock is at the passage\'s year');
  assert.deepEqual(r.exec.placed.map((p) => p.name), ['富士', '上野', '谷中', '千じゆ', '草加']);
  assert.equal(r.exec.placed.find((p) => p.name === '千じゆ').as, '千住', 'Atlas\'s identification is kept and shown as its own');
  assert.deepEqual(r.exec.unplaced, [{ name: '平泉', reason: 'not_in_text' }]);
  assert.ok(!asked.includes('平泉'), 'a name that is not in the text is not even looked up');
  assert.equal(eng.count(), 5); assert.equal(r.exec.status, 'partial');
  assert.match(r.html, /地図の時点/); assert.match(r.html, /元禄二とせ/); assert.match(r.html, /文中に無いため配置せず/);
});

test('Bellum Gallicum: Bibracte is placed by Pleiades, Genavam by Atlas\'s identification, the year is Atlas\'s reading of the consuls', async () => {
  const { K, asked } = kernel(BG);
  const r = await RUN({
    when: { quote: 'L. Pisone, A. Gabinio consulibus', read: '58 BC' },
    places: [{ name: 'Genavam', as: 'Geneva' }, { name: 'Bibracte' }],
  }, { turnId: 't2' }, K);
  assert.equal(r.exec.era.year, -57); assert.equal(r.exec.era.readBy, 'atlas');
  const bib = r.exec.placed.find((p) => p.name === 'Bibracte');
  assert.deepEqual([bib.provenance, bib.source], ['historical_record', 'pleiades']);
  assert.ok(!asked.some((q) => /bibracte/i.test(q)), 'the ancient record answered — today\'s gazetteer was not asked');
  assert.ok(asked.includes('Geneva'), 'the inflected form is looked up by the form Atlas gave');
  assert.match(r.html, /Atlas が 58 BC と読みました/);
  assert.match(r.html, /古代の地名・Pleiades/);
});

test('no year in the passage: the clock is not moved, and a year known from outside is offered as an estimate, not applied', async () => {
  IntMapTime.setYear(1900, { source: 'test' });
  const text = '其日漸草加と云宿にたどり着にけり。';
  const { K } = kernel(text);
  const r = await RUN({ places: [{ name: '草加' }], inferred: { read: '1689', reason: 'おくのほそ道の旅は元禄2年' },
    when: undefined }, { turnId: 't3' }, K);
  assert.equal(r.exec.era.applied, false); assert.equal(r.exec.era.inferred.applied, false);
  assert.equal(IntMapTime.when().getUTCFullYear(), 1900, 'nothing the text does not state moves the clock');
  assert.match(r.html, /推定 .*1689.*文中に記載なし/);
  assert.match(r.html, /class="atl-era-yr inferred" data-era="/);
  assert.match(r.html, /時計は動かしていません/);
});

test('two places under one historical name are not chosen between — the candidates go back to Atlas', async () => {
  const { K, asked } = kernel('Alexandria');
  const r = await K.COMPOSE.run({ era: '300 BC', items: [{ name: 'Alexandria' }] }, { turnId: 't4' });
  assert.equal(r.ok, false);
  const u = r.exec.unplaced[0];
  assert.equal(u.reason, 'ambiguous'); assert.ok(u.candidates.length >= 2);
  assert.equal(asked.length, 0, 'today\'s gazetteer is not asked to pick one silently');
  /* the same name WITH a country is not left to the records' ambiguity */
  const r2 = await K.COMPOSE.run({ era: '300 BC', items: [{ name: 'Alexandria', country: 'Egypt' }] }, { turnId: 't5' });
  assert.equal(r2.exec.unplaced[0].reason, 'not_found', 'with a country it goes on to the gazetteer (scripted empty here)');
});

test('a historical name the city record holds is placed at the city it was: 江戸 in 1689 is Tokyo', async () => {
  const { K, asked } = kernel('江戸');
  const r = await K.COMPOSE.run({ era: '1689', items: [{ name: '江戸' }] }, { turnId: 't6' });
  const tokyo = JSON.parse(read('data/hist-cities.json')).cities.find((c) => c.id === 'tokyo');
  assert.equal(r.ok, true); assert.equal(r.exec.placed[0].source, 'histCities');
  assert.deepEqual([r.meta.compose.placed[0].lng, r.meta.compose.placed[0].lat], [tokyo.lon, tokyo.lat]);
  assert.equal(asked.length, 0);
  /* without `era` (a fresh conversation, so the ledger holds nothing) compose is unchanged: the gazetteer is asked as before */
  const fresh = kernel('江戸');
  const r0 = await fresh.K.COMPOSE.run({ items: [{ name: '江戸' }] }, { turnId: 't7' });
  assert.ok(fresh.asked.includes('江戸')); assert.equal(r0.ok, false);
});

test('an explicit `as` outranks the conversation\'s memory of the bare label', async () => {
  const { K } = kernel(OKU);
  GAZ['草加'] = { lng: 139.285, lat: 36.085, name: '草加' };   /* the namesake neighbourhood today's gazetteer offered (measured 2026-11-16) */
  GAZ['草加市'] = { lng: 139.804, lat: 35.825, name: '草加市' };
  await RUN({ when: { quote: '元禄二とせ', read: '元禄2年' }, places: [{ name: '草加' }] }, { turnId: 'a1' }, K);
  const r = await RUN({ when: { quote: '元禄二とせ', read: '元禄2年' }, places: [{ name: '草加', as: '草加市' }] }, { turnId: 'a2' }, K);
  assert.equal(r.meta.compose.placed[0].lng, 139.804, 'the revision is the place Atlas named, not the ledger\'s earlier answer for the label');
});

test('the capability is one entry: registered, catalogued, and its run is the module above', async () => {
  const caps = (await import('../js/atlas-cap-time.js')).default;
  const e = caps.find((x) => x.row[0] === 'time.textMap');
  assert.ok(e, 'time.textMap is a time.* entry');
  assert.deepEqual(e.schema().required, ['places']);
  assert.match(e.doc[0].text, /NEVER GIVE "when" FOR A YEAR THE TEXT DOES NOT STATE/);
  assert.match(read('js/atlas-capabilities.js'), /"time\.textMap","textMap"/, 'the generated registry carries the row');
});
