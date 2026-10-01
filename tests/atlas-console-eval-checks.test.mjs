/* ============================================================================
 *  js/atlas-console.js — defects measured by putting questions to Atlas on production
 * ----------------------------------------------------------------------------
 *  Four evaluation rounds (#R733, #R747, #R775, #R802), each written as the defect a reader saw.
 *  scripts/atlas-eval/questions.json cites #R802 ①④⑧ of this file by its old path.
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { readFileSync } from 'node:fs';
import { importModule, swappable } from './helpers/import-module.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* shared by the sections below (each used to declare its own copy) */
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r733-atlas-eval-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R733 — 本番で Atlas に複合指示を出して観測した 3 つの欠陥
 * ----------------------------------------------------------------------------
 *  2026-09-15、本番にログインして実測した 4 ターン。
 *
 *  ① 「地図を現代に戻したうえで、日本の人口上位5都市にピンを立てて、その人口を棒グラフで比べて」
 *     → 8 ステップすべてが `find_capability`（計 15 回）。`research.analyze` が 3 回（269 秒）。
 *       地図・チャート・時計の操作は **1 件も走らず**、6m37s ののち `stopped:'step_budget'`、
 *       `mapDrawn:false`。読者が頼んだ 3 件は 0 件行われ、回答文はそれを 1 語も述べなかった。
 *     根本: SYS() が渡す能力インデックスが `chart.compose` `map.compose` `view.flyTo` …
 *       ——**同じプロンプトが型付きツールとして手渡している 9 本**——を並べたうえで
 *       「これらは直接呼べる道具ではない、find_capability で探せ」と述べていた。
 *       手の中にあるものを探せと言われた模型は、予算が尽きるまで探した。
 *
 *  ② 「G7各国の1人あたりGDPを棒グラフで比較して、7か国を色分けして」
 *     → Atlas は **正しい識別子** `["CAN","FRA","DEU","ITA","JPN","GBR","USA"]` を渡した。
 *       IntMap が開いたパネルは **カナダ・フランス・ベルギー・イタリア・ベナン・米国**。
 *       `resolveCountrySync` は `nameEn`/`nameJp` としか照合せず「DEU」はどの国にも当たらない。
 *       `resolveCountry` はその文字列を **ジオコーダ**に渡し、返ってきた点が乗っていた国を
 *       無検証で採用した。ドイツはベルギーに、日本はベナンになり、英国は既出コードと衝突して消え、
 *       返答は「国の比較を開きました (7)」と「(6)」を並べ、失った国を 1 つも名指さなかった。
 *     ⚠ これは #R157/#R158 が禁じた「名前から誤った ISO3 を直す」ではない。逆に
 *       **正しい ISO3 を受け付ける**話で、`countryStats` が**その鍵にしている**識別子である。
 *
 *  ③ 「1914年のヨーロッパを見せて、オーストリア＝ハンガリーを強調して」
 *     → 冒頭で「オーストリア＝ハンガリー帝国を強調します」と宣言し、`map.highlight` を
 *       一度も呼ばず、`stopped:'step_budget'` で終わり、**やらなかったことを述べなかった**。
 *       打ち切りは IntMap だけが知る事実で、モデルには届いていない（強制 final の指示文は
 *       「上の結果が実際に起きたことだ、いま答えよ」だけで、「もう手が無い」とは言わない）。
 *
 *  ⚠ 評価であって読解ではない (#R505): ここは出荷されるモジュールを import し、出荷される
 *  関数本体を `liftFunction` で切り出して**実際に評価**する。綴りを grep する検査は、
 *  ①の index 文のように「正しいことを言っているが対象が間違っている」文を緑にしてしまう。
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const src = (rel) => codeOnly(readLF(join(ROOT, rel)));
const CONSOLE_SRC = (src('js/atlas-console.js') + '\n' + capsSource());

const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const CAPS = makeAtlasCapabilities({});
CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });

/* The real tool surface: the nine-or-so capabilities SYS() hands over as typed tools. */
const SURFACE = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: null });
const TOOLS = SURFACE.baseTools();
const DIRECT = Object.keys(TOOLS).map((k) => TOOLS[k].capabilityId).filter(Boolean);

/* ── ① the index told Atlas to go looking for what it was already holding ─────────────────── */

test('R733 ① every capability the prompt hands over as a tool is EXCLUDED from the "search for these" index', () => {
  assert.ok(DIRECT.length >= 5, 'the tool surface exposes capabilities by id (' + DIRECT.length + ')');
  const idx = CAPS.index(DIRECT);
  DIRECT.forEach((id) => {
    assert.ok(!new RegExp('(^|[\\s,])' + id.replace('.', '\\.') + '([\\s,.]|$)', 'm').test(idx),
      id + ' is a tool Atlas already has; listing it under "not tools you may call directly" is what cost #R733 its turn');
  });
  /* …and the index is still the whole rest of IntMap — the fix is not a smaller index. */
  const rest = CAPS.all().filter((c) => c && !c.withdrawn && DIRECT.indexOf(c.id) < 0);
  assert.ok(rest.length > 100, 'the other ' + rest.length + ' capabilities are still named');
  rest.forEach((c) => assert.ok(idx.indexOf(c.id) >= 0, c.id + ' must still be reachable through find_capability'));
});

test('R733 ① the index SAYS the tools are already the model\'s, not something to search for', () => {
  const idx = CAPS.index(DIRECT);
  assert.match(idx, /ALREADY YOURS/, 'the sentence states it');
  assert.match(idx, /never\s+spend a step searching for it/i, 'and states the cost of not believing it');
  /* ⚠ the claim is conditional on there BEING direct tools — an index built without them must not
     assert something false in the other direction. */
  assert.doesNotMatch(CAPS.index([]), /ALREADY YOURS/, 'with no direct tools there is nothing to say that about');
});

/* ── ② the store's own identifiers ───────────────────────────────────────────────────────────
   ⚠ THE SHIPPED MODULE, RUN (#R505). `countryByIdentifier` / `looksLikeCountryIdentifier` are
   properties of the real factory and the resolvers come out of the real factory, so what is measured
   is the code that ships. The RULE is what these state — 「each ISO 3166-1 form a record declares
   resolves back to that record」 — so the sweep is over whatever store the factory is given, and the
   alpha-3 half of it runs over the 239 countries IntMap actually ships in data/country-facts.json. */

const { makeAtlasGeoResolve } = await import('../js/atlas-geo-resolve.js');
const SHIPPED = JSON.parse(readLF(join(ROOT, 'data/country-facts.json'))).countries;
const _lnorm = (x) => String(x == null ? '' : x).replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase().replace(/\s+/g, ' ').trim();

function mountGeo(store) {
  return makeAtlasGeoResolve({}, {
    L: (en) => en, esc: (x) => String(x), _lnorm,
    cName: (r) => (r && (r.nameEn || r.name)) || '',
    countryStats: () => store,
    geo: () => ({ features: Object.keys(store).map((id) => ({ id, geometry: null })) }),
  });
}

test('R733 ② every ISO3 code IntMap ships resolves to its own record', () => {
  const codes = Object.keys(SHIPPED);
  assert.ok(codes.length > 200, 'the shipped universe is real (' + codes.length + ' countries)');
  const store = {};
  codes.forEach((c) => { store[c] = { nameEn: SHIPPED[c].dem || c, nameJp: '', a2: '', ccn3: '' }; });
  const R = mountGeo(store);
  const miss = codes.filter((c) => { const r = R.resolveCountrySync(c); return !r || r.code !== c; });
  assert.deepEqual(miss, [], 'DEU became Belgium in production because this list was all 239 codes long');
  assert.equal(R.resolveCountrySync('deu').code, 'DEU', 'lower case is the same identifier');
  assert.equal(R.resolveCountrySync(' JPN ').code, 'JPN', 'and so is a padded one');
});

const FOUR = () => ({
  DEU: { nameEn: 'Germany', nameJp: 'ドイツ', a2: 'DE', ccn3: '276' },
  JPN: { nameEn: 'Japan', nameJp: '日本', a2: 'JP', ccn3: '392' },
  BEL: { nameEn: 'Belgium', nameJp: 'ベルギー', a2: 'BE', ccn3: '056' },
  BEN: { nameEn: 'Benin', nameJp: 'ベナン', a2: 'BJ', ccn3: '204' },
});

test('R733 ② alpha-2 and numeric — the other two forms of the identifier the record declares', () => {
  const store = FOUR();
  const id = (q) => makeAtlasGeoResolve.countryByIdentifier(store, q);
  const R = mountGeo(store);
  Object.keys(store).forEach((code) => {
    assert.equal(id(code), code, code + ' (alpha-3)');
    assert.equal(id(store[code].a2), code, store[code].a2 + ' (alpha-2)');
    assert.equal(id(store[code].ccn3), code, store[code].ccn3 + ' (numeric)');
    assert.equal(id(String(parseInt(store[code].ccn3, 10))), code, 'numeric without its leading zero');
  });
  /* ⚠ AND NOT A NEIGHBOUR. The production failure was not 「no answer」 but 「a confident wrong one」. */
  assert.equal(id('XXX'), null, 'an identifier the store does not know has no answer here');
  assert.equal(id('999'), null, 'nor does a numeric one');
  assert.equal(id(''), null);
  /* names still work — this is added, not substituted */
  assert.equal(R.resolveCountrySync('Germany').code, 'DEU');
  assert.equal(R.resolveCountrySync('ドイツ').code, 'DEU');
});

test('R733 ② a code-shaped string the store does not know is NOT handed to the geocoder', async () => {
  const store = { DEU: { nameEn: 'Germany', nameJp: 'ドイツ', a2: 'DE', ccn3: '276' } };
  /* ⚠ THE GEOCODER'S FIRST ACT IS THE PROBE. `geocode()` asks `localFuzzyPlaces` before anything
     else, so recording that one call is how this test can tell 「stopped」 from 「went looking」 —
     an assertion on the return value alone cannot: an unreachable geocoder also returns null, which
     is how a missing guard would pass while still putting a request on the wire in a browser. */
  const asked = [];
  const R = makeAtlasGeoResolve({}, {
    L: (en) => en, esc: (x) => String(x), _lnorm,
    cName: (r) => (r && r.nameEn) || '',
    countryStats: () => store,
    _setLast: (x) => x,
    /* (#732) the row says it IS what was asked (`exact`) — the matcher's own statement, and since #732 the only
       kind of fuzzy row the confirming door takes; a row that merely resembles the query goes on to the gazetteers */
    localFuzzyPlaces: (q) => { asked.push(q); return [{ lng: 4.4, lat: 50.8, name: 'Deurne', kind: 'place', exact: true }]; },
    /* every country polygon here is DEU, so ANY point the geocoder returns 「is」 Germany — the exact
       shape that let a Belgian point be reported as Germany's neighbour in production. */
    geo: () => ({ features: [{ id: 'DEU', geometry: { type: 'Polygon', coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]] } }] }),
  });

  assert.equal(makeAtlasGeoResolve.looksLikeCountryIdentifier('ZZZ'), true, 'three ASCII letters is an identifier shape');
  assert.equal(makeAtlasGeoResolve.looksLikeCountryIdentifier('99'), true, 'so is a short number');
  assert.equal(makeAtlasGeoResolve.looksLikeCountryIdentifier('Bayern'), false, 'a place name is not');
  assert.equal(makeAtlasGeoResolve.looksLikeCountryIdentifier('日本'), false, 'nor is a name in another script');

  assert.equal(await R.resolveCountry('ZZZ'), null, 'an unknown alpha-3 is a WRONG IDENTIFIER, not a place');
  assert.equal(await R.resolveCountry('99'), null, 'nor is an unknown numeric one');
  assert.deepEqual(asked, [], 'and the geocoder was never asked — that call is where Germany became Belgium');

  /* ⚠ THE PLACE-NAME PATH IS KEPT. 「バイエルン」 → Germany is the behaviour this must not cost. */
  const bav = await R.resolveCountry('Bayern');
  assert.equal(bav && bav.code, 'DEU', 'a place name still resolves through the geocoder to the country it sits in');
  assert.deepEqual(asked, ['Bayern'], 'and that is the only thing the geocoder was asked about');
});

/* ── ③ a turn that ran out is not a turn that finished ───────────────────────────────────── */

test('R733 ③ only a LIMIT raises the truncation note — the normal stop never does', () => {
  const line = CONSOLE_SRC.split('\n').find((l) => l.indexOf('ai.__atlCut=') >= 0);
  assert.ok(line, 'the turn records whether it was cut short');
  const map = new Function('out', 'var ai={};' + line.trim() + 'return ai.__atlCut;');
  /* the two guards that actually fired in production, plus the rest of the family */
  ['step_budget', 'call_budget', 'time_budget', 'repeated_calls', 'malformed_limit']
    .forEach((s) => assert.equal(map({ stopped: s }), true, s + ' ended the turn before Atlas was done'));
  /* ⚠ THE ONE THAT MUST NOT. 'answered' is js/atlas-agent.js's normal finish; a note on every turn
     would say something false about every completed answer and teach the reader to ignore it. */
  ['answered', 'aborted', 'transport', 'awaiting_user', ''].forEach((s) =>
    assert.equal(map({ stopped: s }), false, s || '(none)' + ' is not a truncation'));
});

test('R733 ③ the note is rendered from that flag, and says what was NOT done', () => {
  const compose = liftFunction(CONSOLE_SRC, '_atlCompose');
  assert.match(compose, /ai\.__atlCut/, '_atlCompose reads the flag');
  assert.match(compose, /_cutNote\(\)/, 'and renders the note');
  const note = liftFunction(CONSOLE_SRC, '_cutNote');
  const text = new Function('L', 'esc', note + '\nreturn _cutNote();')(
    (en) => en, (s) => String(s));
  assert.match(text, /incomplete/i, 'the reader is told the answer may be incomplete');
  assert.match(text, /not done/i, '…and that what is missing was not merely left undescribed');
});

/* ── the clock is the third axis of the map, and it was the one behind a search ───────────── */

test('R733 ④ time.travel is a tool Atlas holds, not one it has to discover', () => {
  assert.ok(DIRECT.indexOf('time.travel') >= 0, 'Chronos is on the tool surface');
  /* ⚠ WHY IT HAD TO BE. Measured: the phrases a reader actually uses score NOTHING in the registry
     search, so discovery was not a slower path to the clock — it was no path at all. */
  ['地図を現代に戻す', '現代に戻す', '時計を現在に戻す', 'back to the present'].forEach((q) => {
    const hit = CAPS.search(q, { want: 3, min: 1 }).ranked.some((c) => c.id === 'time.travel');
    assert.equal(hit, false, '「' + q + '」 finds time.travel only because it is now a tool, never by searching');
  });
});

test('R733 ④ the other two axes were always tools, so this is the set being completed', () => {
  ['view.flyTo', 'layers.toggle', 'time.travel'].forEach((id) =>
    assert.ok(DIRECT.indexOf(id) >= 0, id + ' — where the map is, what is on it, and when it is'));
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r747-atlas-50-audit-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R747 — 54 QUESTIONS PUT TO ATLAS ON PRODUCTION, AND WHAT THE READER GOT BACK
 * ----------------------------------------------------------------------------
 *  Measured on production (build R746), 2026-09-16,
 *  signed in, with the answer text, `IntMapAtlasState.lastTurn().operations` and the
 *  screen recorded for every turn. The defects this file pins, each with its turn:
 *
 *  (1) `map.highlight` READ `targets` IN ONE PLACE AND NOT THE OTHER.
 *     js/atlas-country-ids.js reads `targets`/`iso3`/`codes`/`countries` and returns null for a
 *     request made purely of NAMES — deliberately, so it falls through to the concrete-place
 *     resolver. That resolver's own field list was written out by hand in js/atlas-console.js and
 *     `targets` was not in it, so a highlight whose members are names under `targets` — the shape
 *     js/atlas-catalog-text.js documents FIRST — was read by neither. Measured, one turn apart,
 *     with the same sixteen strings:
 *         map.highlight {targets:[...]}   -> failed/failed
 *         map.highlight {countries:[...]} -> completed/ok
 *     Five separate questions hit it (landlocked Africa / left-driving countries / Brazil's
 *     neighbours / EU euro members / borders China AND Russia); every one showed the reader
 *     "Nothing is highlighted yet - name the countries or regions" for a command that named ten
 *     to fifty-four countries, and the landlocked-Africa turn died on `repeated_calls` with
 *     nothing drawn and no count given. resolveHl('Botswana') -> BWA for every name in it.
 *
 *  (2) A REMOVAL WAS JUDGED BY WHETHER SOMETHING APPEARED.
 *     `map.clearHighlights` and `highlight {on:false}` run on the generic `paint` verdict, whose
 *     last line is `not_rendered` when nothing moved. Clearing an already-clear map moves nothing.
 *     Measured: "Colour the world by population density" spent SIX of sixteen operations on
 *     `reset`, every one FAIL/not_rendered; "Turn off everything you turned on" gave
 *     `highlight:FAIL/not_rendered` x5 and ended `repeated_calls` in 44 s — with the map clear and
 *     the objects panel reading "0 on the map".
 *
 *  (3) ONE OBJECT NAMED, THOUSANDS DRAWN. "Put a SINGLE marker on the ISS" -> the reply said it
 *     had placed the single marker; the globe carried the full active catalogue — 16,010 objects, measured
 *     on production 2026-09-16 (`GROUPS[].kb` is the declared download size in KILOBYTES, not a count).
 *
 *  (6) THE ACTION THE CATALOGUE SAYS TO PREFER WAS THE ONE NOT IN HAND. js/atlas-catalog-text.js:
 *     "USE THIS INSTEAD OF analyze ... FOR ANY SUCH QUESTION" about `query`, which was reachable
 *     only through `find_capability` while `research` sat in CORE. Measured: "cities above 3000 m
 *     with more than 500,000 people" — the catalogue's OWN worked example minus one condition —
 *     spent two `research` calls (1m53s + 1m54s, 5m10s in all) and never touched the cities table,
 *     which carries `elevM` and `pop`.
 *
 *  (7) ONE REPLY, TWO LANGUAGES. js/atlas-console.js mirrors the language the reader wrote in;
 *     js/atlas-query.js read the UI language. A Japanese question on an English UI came back with
 *     both in one bubble.
 *
 *  (8) THE MEASUREMENT NEVER REACHED THE ANSWER. "Измерь расстояние от Лиссабона до Кейптауна" ->
 *     `measure:ok, drawLine:ok`, and no figure anywhere in the reply.
 *
 *  (9) AN OBJECT IS WHERE IT IS, NOT WHAT IT IS CALLED. Six pins at Machu Picchu, seven identical
 *     500 km circles at Tokyo, five identical Lisbon->Cape Town lines — every call `ok`, each
 *     carrying a different caption or colour, so `callKey` saw a different request each time.
 *
 *  (10) A LAYER TURNED OFF WAS WARNED ABOUT PAINTING. "Waves - off" followed immediately by
 *     "Could not confirm the layer actually painted on the map ... toggling it again may help".
 *
 *  These tests EVALUATE the shipped modules (#R505) wherever the defect lived in what a verdict
 *  could SEE or in which fields a reader reads. The few source reads below are reads of a FACT
 *  about the file ("the warning is inside the turn-on branch"), never of a spelling.
 * ==========================================================================*/


if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeHighlightTargets } = await import('../js/atlas-country-ids.js');
/* (module-graph) js/atlas-capabilities.js IMPORTS the engine — it no longer reads window.IntMapGeoEngine —
   so the stub renderer is seated at that import edge for one observation and the seat emptied after it
   (an empty seat is an engine with nothing to ask, as an absent window.IntMapGeoEngine was). */
const engineSeat = swappable();
const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engineSeat.value } } });
const { makeEraHighlight } = await import('../js/atlas-era-highlight.js');

/* == (1) THE FIELDS THAT CARRY THE REQUEST ARE ASKED ONCE ================================== */

const LANDLOCKED_AFRICA = ['Botswana', 'Burkina Faso', 'Burundi', 'Central African Republic', 'Chad',
  'Ethiopia', 'Eswatini', 'Lesotho', 'Malawi', 'Mali', 'Niger', 'Rwanda', 'South Sudan', 'Uganda',
  'Zambia', 'Zimbabwe'];

/* the store as js/atlas-country-ids.js reads it: features whose properties declare the ISO columns */
const STORE = {
  features: [
    { id: 'DEU', properties: { __code: 'DEU', ISO_A2: 'DE', ISO_A3: 'DEU', NAME: 'Germany' } },
    { id: 'FRA', properties: { __code: 'FRA', ISO_A2: 'FR', ISO_A3: 'FRA', NAME: 'France' } },
    { id: 'BWA', properties: { __code: 'BWA', ISO_A2: 'BW', ISO_A3: 'BWA', NAME: 'Botswana' } }
  ]
};
const IDS = makeHighlightTargets({ geo: () => STORE, resolveCountrySync: () => null });

test('R747 (1a): a highlight made of NAMES under `targets` is read - the field list is one list', () => {
  const names = IDS.readNames({ targets: LANDLOCKED_AFRICA });
  assert.deepEqual(names, LANDLOCKED_AFRICA,
    'the production failure: `targets` carried sixteen country names and the name reader saw none of them');
  assert.equal(IDS.readGroups({ targets: LANDLOCKED_AFRICA }), null,
    'a request made purely of names offers no identifiers - #R742 contract, unchanged, and it is what makes it fall through');
});

test('R747 (1b): every field the identifier reader accepts, the name reader accepts too', () => {
  const fields = IDS.requestFields();
  assert.ok(fields.arrays.indexOf('targets') >= 0, '`targets` is the shape the catalogue documents first');
  for (const k of fields.arrays) {
    const got = IDS.readNames({ [k]: ['Botswana', 'Chad'] });
    assert.deepEqual(got, ['Botswana', 'Chad'], 'field `' + k + '` carries the request and must be read');
  }
  assert.deepEqual(IDS.readNames({ targets: [{ name: 'Germany', iso3: 'DEU' }] }), ['Germany'],
    'the {name, iso3} object form the catalogue documents');
  assert.deepEqual(IDS.readNames({ country: 'Germany and France' }), ['Germany', 'France']);
  assert.deepEqual(IDS.readNames({ country: 'ドイツとフランス' }), ['ドイツ', 'フランス']);
  assert.deepEqual(IDS.readNames({ groups: [{ targets: ['Chad'] }, { countries: ['Mali'] }] }), ['Chad', 'Mali']);
  assert.deepEqual(IDS.readNames({}), [], 'a request that names nothing reads as nothing');
});

test('R747 (1c): the concrete-place resolver does not keep a second field list of its own', () => {
  /* read, not run: the highlight case is a branch of the Atlas kernel's dispatch, which only a browser
     can build; the one reader it must use is RUN in (1a)/(1b). */
  /* the DEFECT restated: there were TWO lists and they disagreed. Not "`targets` is in the list" -
     that would pass again the next time a field is added to only one of them. */
  const src = (read('js/atlas-console.js') + '\n' + capsSource());
  const body = (capabilityEntry('highlight') || {}).run || '';   /* (atlas-capability-modules) the run of map.highlight */
  assert.ok(body, 'the highlight capability has no run - this check lost its subject');
  assert.ok(/const raw=_hlReadNames\(a\)/.test(body),
    'the name path must take its fields from js/atlas-country-ids.js, not restate them');
  assert.ok(!/String\(a\.countries\|\|a\.country\|\|a\.name\|\|a\.place\|\|a\.region\|\|a\.query/.test(body),
    'the hand-written field list is back: it is what dropped `targets`');
});

/* == (2) A REMOVAL IS COMPLETE WHEN THE THING IS GONE ====================================== */

const CAPS = makeAtlasCapabilities({ lang: 'en' });
const hl = CAPS.resolve('map.highlight');
const SOURCES = ['nlq-poly-src', 'nlq-line-src', 'user-pins', 'nlq-poi-src', 'atl-compose-src',
  'shk-cont-src', 'nlq-fac-src'];
function renderer() {
  const empty = { type: 'FeatureCollection', features: [] };
  return {
    hasRenderer: () => true,
    layers: { sourceData: (id) => { if (SOURCES.indexOf(id) < 0) throw new Error('no such source: ' + id); return empty; } },
    scene: { getStyle: () => ({ layers: [{ id: 'nlq-fill' }] }) },
    camera: { getCenter: () => ({ lng: 0, lat: 0 }), getZoom: () => 2, getBearing: () => 0, getPitch: () => 0 }
  };
}
function supplier(s) {
  return {
    countries: () => new Set(s.countries || []),
    era: () => (s.era || []).slice(),
    polys: () => (s.polys || []).map((n) => ({ name: n, geo: {} })),
    lines: () => (s.lines || []).map((n) => ({ name: n, geo: {} })),
    choro: () => (s.choro || []).reduce((o, c, i) => { o[c] = (i + 1) / 10; return o; }, {}),
    metric: () => s.metric || null
  };
}
function observe(s) {
  const hadP = window._imAtlasPaint, hadG = engineSeat.get();
  const r = renderer();
  window._imAtlasPaint = makeEraHighlight({ GE: () => r, resolveCountrySync: () => null })
    .paintState(supplier(s));
  engineSeat.set(r);
  try { return hl.observe(); }
  finally {
    if (hadP === undefined) delete window._imAtlasPaint; else window._imAtlasPaint = hadP;
    engineSeat.set(hadG);
  }
}
/* what js/atlas-console.js `_CLEARED(...)` produces */
const cleared = (...kinds) => ({ ok: true, html: '<div>cleared</div>',
  meta: { painted: kinds.reduce((o, k) => { o[k] = []; return o; }, {}) } });

test('R747 (2a): clearing an already-clear map is completed, not `not_rendered`', () => {
  const empty = observe({});
  const v = hl.verify({}, { on: false }, empty, empty, cleared('countries', 'polys', 'lines'));
  assert.equal(v.status, 'completed',
    'the production failure: `highlight {on:false}` answered FAIL/not_rendered five times and the turn died on repeated_calls');
  assert.equal(v.code, 'already_there');
});

test('R747 (2b): a clear that did clear something is completed too', () => {
  const before = observe({ countries: ['DEU', 'FRA'] });
  const after = observe({});
  const v = hl.verify({}, { on: false }, before, after, cleared('countries', 'polys', 'lines'));
  assert.equal(v.status, 'completed');
  assert.equal(v.code, 'ok', 'something moved, so it is the ordinary success');
});

test('R747 (2c): READ, NOT TRUSTED - a clear that left the highlights standing still fails', () => {
  const still = observe({ countries: ['DEU', 'FRA'] });
  const v = hl.verify({}, { on: false }, still, still, cleared('countries', 'polys', 'lines'));
  assert.equal(v.code, 'not_rendered',
    'declaring a surface empty while two countries are painted must not buy a pass');
});

test('R747 (2d): an undeclared removal keeps exactly the verdict it had - nothing is guessed', () => {
  const empty = observe({});
  const bare = hl.verify({}, { on: false }, empty, empty, { ok: true, html: '' });
  assert.equal(bare.code, 'not_rendered', 'no declaration -> the reading is unchanged (#R742 rule)');
  const blank = hl.verify({}, { on: false }, empty, empty, { ok: true, html: '', meta: { painted: {} } });
  assert.equal(blank.code, 'not_rendered', '`{}` names no surface, so it makes no claim');
});

test('R747 (2e): a DRAW is unaffected - presence is still judged by presence', () => {
  const six = ['CHN', 'KGZ', 'RUS', 'TKM', 'UZB', 'TJK'];
  const after = observe({ countries: six });
  const drew = { ok: true, html: '<div>x</div>', meta: { painted: { countries: six } } };
  assert.equal(hl.verify({}, {}, after, after, drew).code, 'already_there', '#R742 redraw rule, untouched');
  const lied = { ok: true, html: '<div>x</div>', meta: { painted: { countries: ['DEU'] } } };
  assert.equal(hl.verify({}, {}, after, after, lied).code, 'not_rendered');
});

test('R747 (2f): both clearing paths declare what they emptied', () => {
  /* read, not run: the two clearing paths are branches of the kernel's dispatch; the verdict on what
     they declare is RUN in (2a)–(2e). */
  const src = (read('js/atlas-console.js') + '\n' + capsSource());
  assert.ok(/const _CLEARED=\(\.\.\.kinds\)/.test(src), 'the declaration helper is gone');
  assert.ok(/_CLEARED\(/.test((capabilityEntry('reset') || {}).run || ''), '`reset` clears four surfaces and must say so');
  const offAt = src.indexOf('if(a.on===false||/^(off|clear|none|');
  assert.ok(offAt > 0 && /_CLEARED\(/.test(src.slice(offAt, offAt + 700)),
    '`highlight {on:false}` clears through the drawing capability and must say so too');
});

/* == (6) THE ACTION THE CATALOGUE SAYS TO PREFER IS IN HAND ================================ */

test('R747 (6): `data.query` is a first-class tool, because the catalogue tells Atlas to prefer it', async () => {
  /* RUN, not read (consolidation): the tools Atlas is HANDED are built by the shipped surface, and each
     is called once to see which capability it reaches. */
  const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
  const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
  const { makeAtlasAgent } = await import('../js/atlas-agent.js');
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const surface = makeAtlasToolSurface({ capabilities: makeAtlasCapabilities({}), schemas: makeAtlasSchemas(), runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools(), execute = surface.makeExecute(tools, makeAtlasAgent());
  const reached = new Set();
  const byArgs = await execute({ id: 'q', name: 'query_data', arguments: { from: 'countries' } });
  if (byArgs && byArgs.capability) reached.add(byArgs.capability);
  const rs = await execute({ id: 'r', name: 'research', arguments: { question: 'why' } });
  if (rs && rs.capability) reached.add(rs.capability);
  assert.ok(reached.has('data.query'),
    'the catalogue says USE THIS INSTEAD OF analyze about an action the model was not given');
  assert.ok(reached.has('research.analyze'),
    'and research is not taken away - nothing is (CONSTITUTION.md section 5)');
  assert.ok(/USE THIS INSTEAD OF "analyze"/.test(makeAtlasCatalogText({}, {}).text(['data.query'])), 'the catalogue instruction is this check subject');
});

/* == (7) ONE REPLY, ONE LANGUAGE ========================================================== */

test('R747 (7): the query engine writes in the language of the reply it is composing', () => {
  /* read, not run: the language is threaded from the kernel's composer into js/atlas-query.js through a
     binding made only when the kernel boots in a browser. */
  const q = read('js/atlas-query.js');
  assert.ok(/D\.lang === 'function'/.test(q),
    'js/atlas-query.js must take the reply language from its caller, not read the UI one');
  const c = (read('js/atlas-console.js') + '\n' + capsSource());
  assert.ok(/_Q\.bind\(\{lang:\(\)=>_mirrorLang\(\)/.test(c),
    'and the composer must pass the language it is mirroring');
});

/* == (8) THE MEASUREMENT REACHES THE ANSWER =============================================== */

test('R747 (8): `measure` returns the figure it measured', () => {
  /* read, not run: the host member lives in the shell (js/app-body.js) and the case in the kernel — both
     boot only in a browser. */
  const body = read('js/app-body.js');
  assert.ok(/measureReading\(pts\)/.test(body), 'the host must expose the reading the tool panel prints');
  const c = (read('js/atlas-console.js') + '\n' + capsSource());
  const m = (capabilityEntry('measure') || {}).run || '';
  assert.ok(/HOST\.measureReading/.test(m),
    'the production failure: measure:ok, drawLine:ok, and no distance anywhere in the reply');
});

/* == (10) A LAYER TURNED OFF IS NOT EVIDENCE ABOUT PAINTING =============================== */

test('R747 (10): the painting warning belongs to a turn-ON', () => {
  /* read, not run: the warning is emitted inside the kernel's layer case, which needs a live map to
     reach. */
  const c = (read('js/atlas-console.js') + '\n' + capsSource());
  /* the REASON this reads the LAST occurrence: the comment above the branch quotes the warning
     verbatim, and #R621 was turned red once by its own explanation. The subject is the emitter. */
  const i = c.lastIndexOf('Could not confirm the layer actually painted');
  assert.ok(i > 0, 'the warning moved - this check lost its subject');
  const line = c.slice(c.lastIndexOf('\n', i), i);
  assert.ok(/if\(!changed&&r\.want\)/.test(line),
    'a layer turned OFF was followed by a warning that it could not be confirmed to have painted');
});

/* == (9) AN OBJECT IS WHERE IT IS ========================================================= */

test('R747 (9): a pin, a circle and a line placed again at the same place are the same object', () => {
  /* read, not run: addPin / the radius tool live in the shell and drawLine in the kernel — all
     browser-only, all touching the map. */
  const body = read('js/app-body.js');
  const addPin = body.slice(body.indexOf('function addPin('), body.indexOf('function removePin('));
  assert.ok(/userPins\.find\(/.test(addPin) && /toFixed\(5\)/.test(addPin),
    'six pins landed on Machu Picchu because each call carried a different caption');
  const radAt = body.indexOf('window._radiusFromPoint=function');
  assert.ok(/radiusItems\.find\(/.test(body.slice(radAt, radAt + 1600)),
    'seven identical 500 km circles stacked on Tokyo');
  const c = (read('js/atlas-console.js') + '\n' + capsSource());
  const dl = (capabilityEntry('drawLine') || {}).run || '';
  assert.ok(/_lnSame/.test(dl), 'five identical Lisbon to Cape Town lines');
});

/* == (3) ONE OBJECT NAMED IS NOT THE WHOLE SKY ============================================ */

test('R747 (3): the satellite catalogue is chosen by asking the catalogues, and is bounded', () => {
  /* read, not run: narrow() fetches CelesTrak catalogues over the network, and the satellites case is
     the kernel's. */
  const sat = read('js/satellites-live.js');
  assert.ok(/async function narrow\(/.test(sat),
    'which catalogue holds a named object is a fact about the catalogues');
  const n = sat.slice(sat.indexOf('async function narrow('), sat.indexOf('function setGroup('));
  assert.ok(/\+g\.kb/.test(n) && /spent \+|spent\+/.test(n),
    'the search must be bounded by the size of the catalogue already selected - narrowing may not cost more than not narrowing');
  assert.ok(!/'iss'/i.test(n), 'no table of names: CelesTrak decides what each catalogue holds');
  assert.ok(/narrow,/.test(sat), 'and it is exported');
  const c = (read('js/atlas-console.js') + '\n' + capsSource());
  const s = (capabilityEntry('satellites') || {}).run || '';
  assert.ok(/A\.narrow\(q\)/.test(s), 'the reply claimed a single marker while 16,010 objects were drawn');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r775-atlas-eval-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R775 — 55 QUESTIONS PUT TO ATLAS ON PRODUCTION, AND THE FOUR DEFECTS THAT SURVIVED EVERY GATE
 * ----------------------------------------------------------------------------
 *  Measured on production, logged in, build 2026-09-17-R769.
 *  `npm test` was green, CI was green, and the reader was still being handed these:
 *
 *  ① 「GDP上位10か国を…1人あたりGDPと比べて」 — `data.rank {metric:"gdp_per_capita"}` answered with
 *     **Antarctica $200,000 in FIRST place**, ahead of Monaco, and 「下位」 came back as five rows all
 *     reading 0 /km². Nothing hardcodes $200,000: it is Natural Earth's own GDP_MD/POP_EST for a
 *     continent whose 「population」 is research-station staff (js/countries-ui.js:399). The Countries
 *     tab does not show Antarctica and neither does `map.highlight` — both ask `sov!==false`. Six
 *     Atlas paths never asked at all. ONE PREDICATE, asked everywhere (js/atlas-metrics.js).
 *
 *  ② The same turn sent `metric:"名目GDP（現在価格米ドル）"` → refused, `"gdp"` → ok, then
 *     `"名目GDP"` → **refused again, inside the same turn**. `gdp` prints itself 「GDP（名目）」: the
 *     query was the same two tokens in the other order, and #R741's partial match only ever asked
 *     「is the query part of a name」. It asks both directions now, still uniquely (#R741's rule is
 *     what keeps that safe). #R740/#R741/#R760 each fixed this file; the shape that got through them
 *     is ORDER, and the one that got through with it is a name plus a qualification.
 *
 *  ③ The refusal the reader saw was 「有効: pop, density, area, gdp, gdppc, hdi, dem, milSpend,
 *     milSpendGDP, tfr, lifeExp, internet」 — twelve internal identifiers and nothing saying what any
 *     of them means. The planner needs the key; the reader needs the name; one string can carry both.
 *
 *  ④ Atlas cleared or switched off work it had just produced, four times in one session:
 *     1900 borders drawn then both border layers switched OFF as the last two operations; a GDP
 *     choropleth painted then wiped by its own `map.clearAll` mid-turn; ten head offices never
 *     plotted because four of seven operations went on tidying an ALREADY EMPTY map; 22 Mediterranean
 *     countries highlighted, then cleared and redrawn three times, ending empty. #R742 gave LAYERS an
 *     origin mark for exactly this reason and stopped there — every DRAWING was still a bare count,
 *     so 「a layer you turned on for an EARLIER question」 was an instruction Atlas had no way to obey.
 *
 *  ⑤ And the chat did not scroll to the answer: with a 3,075px reply the reply began at 7,900 while
 *     `scrollTop` sat at 7,050 — 745px above the reader's OWN question. #R79g's intent is right; it
 *     anchored to a pixel while the content above it kept changing height.
 *
 *  ⚠ WHAT THESE HOLD THE ROUND TO: one predicate rather than six edited loops, a resolver that is
 *  still refused when the answer would be a guess, and marks that state an observation and command
 *  nothing — nothing Atlas could do before is refused now (CONSTITUTION.md §5).
 * ==========================================================================*/

const NL = String.fromCharCode(10);

/* the module under test is an ES module with no DOM in it — import it for real rather than
   reading its source, because #R505's finding is that source-reading checks cannot see order */
const METRICS_MOD = await import('file://' + join(ROOT, 'js', 'atlas-metrics.js').split('\\').join('/'));

/* the factory needs five helpers out of the kernel's closure; these are the same shapes, no more */
function makeMetrics(lang) {
  const pick = (tuple) => (Array.isArray(tuple) ? (lang === 'jp' ? tuple[1] : tuple[0]) : tuple);
  return METRICS_MOD.makeAtlasMetrics({}, {
    LA: (...a) => a,
    lx: pick,
    L: (...a) => pick(a),
    esc: (x) => String(x == null ? '' : x),
    warn: (h) => String(h),
    R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
  });
}

/* ── ① ONE PREDICATE FOR 「WHICH ROW IS A COUNTRY」 ─────────────────────────────────────────── */

test('R775 ① the predicate answers the measured rows, and narrows nothing else', () => {
  /* ⚠ it is a FACTORY member, not a module export — tests/r199 ① wants one binding on the import
     line and tests/r175 ③ wants every export imported by name; inside the factory both hold, and it
     is still ONE definition (js/atlas-metrics.js says why). */
  const ok = makeMetrics('en').isRankableCountry;
  assert.equal(typeof ok, 'function', 'makeAtlasMetrics must return isRankableCountry');
  /* Antarctica is the row the Countries tab already declines to show (sov===false, measured) */
  assert.equal(ok({ sov: false, nameEn: 'Antarctica' }), false);
  /* …and the dependencies the product DOES show stay — measured in the same screenshot,
     Bermuda 4th and the French Southern and Antarctic Lands 5th by GDP per capita */
  assert.equal(ok({ sov: true, nameEn: 'Bermuda' }), true);
  assert.equal(ok({ sov: true, nameEn: 'French Southern and Antarctic Lands' }), true);
  /* no record of sovereignty is not a claim that it is not one (#R742's rule, #R699's shape) */
  assert.equal(ok({ nameEn: 'Japan' }), true);
  /* a row with no name cannot be ranked by name */
  assert.equal(ok({ sov: true }), false);
  assert.equal(ok(null), false);
});

test('R775 ① every Atlas path that RANKS countryStats asks the predicate', () => {
  /* read, not run: the population is every countryStats loop in the kernel, discovered from its source;
     the predicate itself is RUN above. */
  const src = (read('js/atlas-console.js') + '\n' + capsSource());
  /* the母集合 is discovered, not listed: every enumeration of countryStats in the kernel.
     ⚠ THE RULE IS ATTACHED TO THE FACT, NOT TO A FUNCTION NAME (#R429): a loop that reads a METRIC
     off the row is producing a ranking, a shading or a score, and every one of those must ask who
     is a country. A loop that reads a NAME (the office-question matcher) or COUNTS coverage
     (`_fillMetric`) is not ranking anything, and is not asked to. */
  const loops = [];
  const needle = 'in countryStats){';
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) loops.push(src.slice(i, i + 220));
  assert.ok(loops.length >= 8, `expected the kernel to still enumerate countryStats; found ${loops.length}`);
  const ranking = loops.filter((L) => /\.m\.get\(|\bm\.get\(|sw=0,sv=0/.test(L));
  assert.ok(ranking.length >= 6, `expected at least 6 ranking loops, found ${ranking.length}`);
  ranking.forEach((L) => {
    assert.ok(/isRankableCountry|sov===false/.test(L),
      'a loop that ranks countryStats without asking who is a country:' + NL + L.slice(0, 200));
  });
});

/* ── ② THE RESOLVER READS CONTAINMENT IN BOTH DIRECTIONS ───────────────────────────────────── */

test('R775 ② the metric names measured on production resolve', () => {
  for (const lang of ['jp', 'en']) {
    const M = makeMetrics(lang);
    /* the two spellings that were refused in one production turn */
    assert.equal(M.metSpec('\u540d\u76eeGDP') && M.metSpec('\u540d\u76eeGDP').key, 'gdp', lang);
    assert.equal(M.metSpec('\u540d\u76eeGDP\uff08\u73fe\u5728\u4fa1\u683c\u7c73\u30c9\u30eb\uff09') && M.metSpec('\u540d\u76eeGDP\uff08\u73fe\u5728\u4fa1\u683c\u7c73\u30c9\u30eb\uff09').key, 'gdp', lang);
    /* the English form of the same shape: a name plus a qualification */
    assert.equal(M.metSpec('nominal GDP (current US$)').key, 'gdp', lang);
    /* the one Atlas actually sent and which already worked — unchanged */
    assert.equal(M.metSpec('gdp').key, 'gdp', lang);
    assert.equal(M.metSpec('gdp_per_capita').key, 'gdppc', lang);
    /* #R741's case must still work: a unique PART of a name is that name */
    assert.equal(M.metSpec('life').key, 'lifeExp', lang);
    /* #R740's: the right key, whichever set the metric lives in */
    assert.equal(M.metSpec('lifeExp').key, 'lifeExp', lang);
    assert.equal(M.metSpec('internet').key, 'internet', lang);
  }
});

test('R775 ② a guess is still worse than a refusal', () => {
  const M = makeMetrics('en');
  /* #R741's warning, held: `pop` is inside `pop` AND `popdensity`, so the exact hit wins and the
     fuzzy pass is never allowed to choose between them */
  assert.equal(M.metSpec('pop').key, 'pop');
  assert.equal(M.metSpec('density').key, 'density');
  /* nothing IntMap holds — still refused, and still refused permanently */
  assert.equal(M.metSpec('CO2 emissions per capita'), null);
  assert.equal(M.metSpec('corruption perceptions index'), null);
  assert.equal(M.metSpec(''), null);
  assert.equal(M.metSpec(null), null);
  /* ⚠ THE FIRST VERSION OF ②'s FIX FAILED THIS ONE: `dem` lives inside `demographics`, and asking
     only for containment made 「tell me about the demographics of the world」 the Democracy Index.
     A name counts only where it is a whole word in the ORIGINAL text. */
  assert.equal(M.metSpec('tell me about the demographics of the world'), null);
  assert.equal(M.metSpec('which country is the most democratic'), null, '`dem` inside `democratic` is not a name');
  assert.equal(M.metSpec('a map of popular music'), null, '`pop` inside `popular` is not a name');
  /* longest wins, so a qualified name resolves to the metric it names and not to its first token */
  assert.equal(M.metSpec('GDP per capita, current US$').key, 'gdppc');
  assert.equal(M.metSpec('population density by country').key, 'density');
  const r = M.unknownMetric('CO2 emissions per capita');
  assert.equal(r.ok, false);
  assert.equal(r.meta && r.meta.code, 'unknown_metric');
  assert.equal(r.meta && r.meta.permanent, true, '#R760: this KIND of request is not available, and another spelling cannot help');
});

/* ── ③ THE REFUSAL HAS TWO READERS AND ONE STRING ──────────────────────────────────────────── */

test('R775 ③ the refusal the READER sees names the metrics, not just their identifiers', () => {
  const M = makeMetrics('jp');
  const html = M.unknownMetric('\u540d\u76ee\u306e\u4f55\u304b').html;
  /* the planner still gets every key it must send back */
  M.metKeys().forEach((k) => assert.ok(html.includes(k), 'key missing from the refusal: ' + k));
  /* …and the reader is told what they are, in the language they are reading */
  assert.ok(html.includes('gdp (GDP\uff08\u540d\u76ee\uff09)'), 'the jp label is not beside the key:' + NL + html);
  assert.ok(html.includes('\u4eba\u53e3'), 'population is not named in Japanese:' + NL + html);
  const en = makeMetrics('en').unknownMetric('x').html;
  assert.ok(en.includes('gdp (GDP (nominal))'), 'the en label is not beside the key:' + NL + en);
  assert.ok(en.includes('lifeExp (Life expectancy)'), en);
});

/* ── ④ WHAT ATLAS DREW, AND WHEN ───────────────────────────────────────────────────────────── */

/* (consolidation) the two ④ checks used to read js/atlas-state.js for spellings. They now RUN the shipped
   state module: a turn is opened over a published `atlas` section, the section changes while an
   operation lands, and the ledger and the paragraph are asked what they say about it. */
async function drawingTurn(before, during) {
  const { makeAtlasState } = await import('../js/atlas-state.js');
  const S = makeAtlasState({});
  let at = before;
  S.registerStateProvider('atlas', () => at);
  S.beginTurn(1, 'q');                                   /* the baseline, attributed to no one */
  at = during;
  S.recordOperation(1, { capabilityId: 'map.test' });   /* where an operation lands */
  return S;
}

test('R775 ④ the drawing ledger is discovered from the snapshot, not from a list of capabilities', async () => {
  /* #R742's rule, held: the keys come off the published `atlas` section, so a drawing added later
     is marked without anybody writing its name here — `aKindNobodyListed` is exactly that drawing */
  const S = await drawingTurn({ pins: { n: 2 } }, { pins: { n: 2 }, choropleth: { label: 'GDP' }, aKindNobodyListed: { n: 3 }, userPins: { n: 1 } });
  assert.ok(S.paintOrigin('choropleth') && S.paintOrigin('choropleth').turnId === 1, 'no drawing-origin ledger');
  assert.ok(S.paintOrigin('aKindNobodyListed'),
    'paintKeysNow must read the published snapshot section, not a hand-written list — a hand-written list of drawing kinds is exactly what #R742 refused to write');
  /* recorded at the same two moments layers are, and nowhere else */
  assert.equal(S.paintOrigin('pins'), null, 'paints must be baselined at the turn boundary, attributed to no one');
  const T = await drawingTurn({}, {});
  T.registerStateProvider('atlas', () => ({ lines: { n: 1 } }));
  T.snapshot(); T.renderPrompt(T.snapshot());
  assert.equal(T.paintOrigin('lines'), null, 'paints must be observed where operations land — reading the state claims nothing');
  /* the reader's own pins are never claimed: the paragraph marks no user pin, whoever the ledger says put it there */
  const para = S.renderPrompt(S.snapshot());
  const userLine = para.split('\n').find((l) => /user pin\(s\) on the map/.test(l)) || '';
  assert.ok(userLine && !/YOU drew this/.test(userLine), 'userPins are the reader’s — a ledger may not claim an author it lacks');
});

test('R775 ④ the prompt says WHEN a drawing appeared, and says when there is nothing', async () => {
  /* every drawing the block reports carries the mark — the four measured failures were a highlight,
     a choropleth, a layer pair and a pin set, and naming only some of them would leave the next one.
     Choropleth and custom score share one line (a map is shaded one way), so they are two turns. */
  const drawn = { highlightCountries: 3, highlight: { name: 'EU' }, choropleth: { label: 'GDP' }, pins: { n: 2, kind: 'poi' },
    polygons: { n: 1, names: ['Alps'] }, lines: { n: 1 }, measure: { n: 2 }, radius: { n: 1 } };
  const one = await drawingTurn({}, drawn);
  const p1 = one.renderPrompt(one.snapshot());
  const two = await drawingTurn({}, { customScore: { name: 'livability' } });
  const p2 = two.renderPrompt(two.snapshot());
  const marked = (p, re) => { const l = p.split('\n').find((x) => re.test(x)) || ''; return /\[YOU drew this · turn 1 · THIS turn\]/.test(l); };
  for (const [k, re] of [['highlightCountries', /countries are highlighted/], ['highlight', /Current Atlas highlight/],
    ['choropleth', /shaded \(choropleth\)/], ['pins', /Atlas pins are on the map/], ['polygons', /polygon highlight/],
    ['lines', /line\(s\) drawn/], ['measure', /Measure tool active/], ['radius', /radius circle/]]) {
    assert.ok(marked(p1, re), 'drawing not marked: ' + k + ' — the mark is not in the state block, or the load-bearing word THIS turn is missing');
  }
  assert.ok(marked(p2, /CUSTOM Atlas evaluation score/), 'drawing not marked: customScore');
  /* …and the empty map is STATED, because absence of a line is not a statement */
  const empty = await drawingTurn({}, {});
  assert.match(empty.renderPrompt(empty.snapshot()), /NO Atlas drawing right now/, 'an empty map must say so — four clears were spent finding out');
  /* ⚠ it must remain an observation: nothing here switches anything off or keeps anything alive.
     read, not run: 「never acts」 is a claim about everything the ledger's code can reach. */
  const st = read('js/atlas-state.js');
  assert.ok(!/clearAll\(|\.remove\(|setVisible\(/.test(st.slice(st.indexOf('var paintOrigin'), st.indexOf('var paintOrigin') + 3000)),
    'the ledger must record, never act');
});

/* ── ⑤ THE CHAT SCROLLS TO THE ANSWER ──────────────────────────────────────────────────────── */

test('R775 ⑤ the auto-scroll anchors to the reader\u2019s question, not to a pixel', () => {
  /* read, not run: the auto-scroll is DOM code in the kernel's chat, which only a browser can drive. */
  const src = (read('js/atlas-console.js') + '\n' + capsSource());
  const i = src.indexOf('(#R79g) auto-scroll');
  assert.ok(i > 0, '#R79g\u2019s auto-scroll is gone');
  const block = src.slice(i, i + 2600);
  assert.ok(/\.atl-b\.u/.test(block), 'the anchor must be the last USER bubble');
  assert.ok(/offsetTop/.test(block), 'anchoring to an element means reading its offset, not the scroll height');
  /* #R79g's own half is untouched: near the bottom, a short reply still drops fully into view */
  assert.ok(/scrollHeight-chatEl\.scrollTop-chatEl\.clientHeight<150/.test(block), '#R79g\u2019s near-bottom test was removed');
  assert.ok(/chatEl\.scrollTop=chatEl\.scrollHeight/.test(block), '#R79g\u2019s short-reply behaviour was removed');
  /* …and a reader who scrolled away by hand is never yanked back */
  assert.ok(/clientHeight\*3/.test(block), 'nothing stops the anchor from yanking a reader who scrolled away');
});

/* ── ⑥ A TURN THAT DIED WITH NOTHING DONE KEEPS THE QUESTION ───────────────────────────────── */

test('R775 ⑥ a turn that filed no operation puts the question back in the composer', () => {
  /* read, not run: the composer refill is in the kernel's turn catch, which only a browser can drive. */
  const src = (read('js/atlas-console.js') + '\n' + capsSource());
  const i = src.indexOf('A TURN THAT DIED WITH NOTHING DONE');
  assert.ok(i > 0, 'the login-loss path does not restore the question');
  const block = src.slice(i - 900, i);
  /* it belongs to the turn's own catch, beside the red bubble the reader is shown */
  assert.ok(/inEl\.value=q/.test(block), 'the composer is not refilled');
  /* ⚠ ONLY when nothing ran — a half-finished turn must never be re-offered whole */
  assert.ok(/_t&&_t\.operations&&_t\.operations\.length/.test(block), 'the "nothing was done" condition is missing');
  /* ⚠ ONLY when the composer is empty — what the reader typed is theirs */
  assert.ok(/!String\(inEl\.value\|\|''\)\.trim\(\)/.test(block), 'it would overwrite what the reader has typed');
  /* ⚠ and it never sends by itself */
  assert.ok(!/fire\(\)/.test(block), 'restoring a question must not re-send it');
});

/* ── ⑦ A REFUSAL ABOUT THE KIND OF REQUEST SAYS SO, IN THE PANDEMIC ENGINE TOO ─────────────── */

test('R775 ⑦ sim.pandemicRun declares which refusals rewording cannot fix', async () => {
  /* read, not run: js/pandemic-atlas.js is a classic script with no export to call, and the surface's
     reader is RUN elsewhere (R760 ⓭); the claim is the declared flag at each refusal site. */
  const src = read('js/pandemic-atlas.js');
  /* the vocabulary was already in the refusal; what was missing is #R760's `permanent` */
  assert.ok(/function fail\(msg, code, permanent\)/.test(src), 'fail() cannot carry the fact');
  assert.ok(/permanent: permanent \? true : undefined/.test(src), 'the flag never reaches meta');
  /* ⚠ ONLY the unknown-key case — a value out of range is a different request that can succeed */
  assert.ok(/bad\.some\(\(b\) => b\.why === 'unknown'\)/.test(src),
    'params-rejected must be permanent only when the KEY is one this engine does not have');
  assert.ok(/'preset-unknown', true\)/.test(src), 'preset-unknown enumerates every preset — rewording cannot help');
  /* the model side of the contract is unchanged and still reads it */
  const surface = read('js/atlas-toolsurface.js');
  assert.ok(/permanentFailure: meta\.permanent \? true : undefined/.test(surface), '#R760’s reader moved or went away');
  /* …and the engine still enumerates what it DOES accept (that half was already right) */
  const model = read('js/pandemic-model.js');
  assert.ok(/accepts: Object\.keys\(PANDEMIC_PARAMS\)/.test(model), 'the refusal stopped carrying the vocabulary');
});

/* ── the kernel may not grow to pay for any of this ────────────────────────────────────────── */

test('R775 js/atlas-console.js stayed under its shrink-only ceiling', () => {
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok((read('js/atlas-console.js') + '\n' + capsSource()).length > 0);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r802-atlas-50-eval-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* R802 — what 46 questions put to the production Atlas measured, written as the defects themselves.
 *
 * Every assertion below names a thing a reader SAW on production
 * (build 2026-09-18-R783, signed in) and not the shape of the repair, because a check written as the
 * repair defends the repair and stops defending the reader — [[intmap-restate-the-defect-not-the-fix]].
 */

const CONSOLE_SRC = codeOnly((readLF(join(ROOT, 'js/atlas-console.js')) + '\n' + capsSource()));
const AGENT_SRC = codeOnly(readLF(join(ROOT, 'js/atlas-agent.js')));

const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const CAPS = makeAtlasCapabilities({});
CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
const top = (q) => CAPS.search(q, { want: 3, min: 1 }).ranked.map((r) => r.id);

/* ══ ① THE MEASURED SILENCE: A JAPANESE REQUEST REACHED NOTHING THE ENGLISH ONE REACHED ═══════════
   「東京から大阪までの鉄道ルートを引いて、所要時間と距離を教えて。」 — eight find_capability calls,
   ZERO operations, stopped at the step budget in 45 s, and the reader was told the turn had hit its
   working limit. 「世界の原子力発電所を地図に表示して、日本のものだけ強調して。」 — the same, 57 s.
   「東京の今日の天気と、今後3日間の予報を教えて。」 — data.weather never called; the reader was told the
   numbers could not be obtained, with the temperature layer painted on the map behind that sentence.
   IntMap authors in English AND Japanese (CONSTITUTION.md §7): a door only English opens is shut. */
test('R802 ① a request in Japanese reaches the same capability the English one reaches', () => {
  for (const [ja, en, id] of [
    ['東京から大阪までの鉄道ルート', 'plan a rail route from Tokyo to Osaka', 'routing.route'],
    ['天気予報', 'weather forecast', 'data.weather'],
    ['東京の今日の天気と3日間の予報', 'weather forecast for Tokyo today and the next three days', 'data.weather'],
  ]) {
    assert.ok(top(en).includes(id), 'the English request reaches ' + id + ' — ' + top(en).join(', '));
    assert.ok(top(ja).includes(id), 'the Japanese request reaches ' + id + ' — ' + ja + ' → ' + (top(ja).join(', ') || '(nothing)'));
  }
});

/* ══ ② AND WHAT IT REACHED INSTEAD WAS THE REGISTRY, IN ORDER ═════════════════════════════════════
   Measured with the tool surface instrumented: 「世界の原子力発電所を表示し、日本の原子力発電所だけを
   強調する」 answered layers.aircraftTrack, layers.allOff, layers.baseDisplay, layers.countryInfo,
   layers.isobars, layers.nightSide, layers.opacity, layers.planeAltitude — the first eight «layers.*»
   ids in alphabetical order — and «nuclear power plants …» answered the first eight «map.*».
   That is worse than answering nothing: Atlas believed them, rephrased, and spent the whole turn.
   A capability is a match because something in the request MATCHED IT, never because of where it sits. */
test('R802 ② a match is evidence about that capability, not its place in the registry', () => {
  const runs = {};
  for (const id of CAPS.all().map((c) => c.id)) { const p = id.split('.')[0]; (runs[p] = runs[p] || []).push(id); }
  for (const p of Object.keys(runs)) runs[p].sort();
  for (const q of [
    '世界の原子力発電所を表示し、日本の原子力発電所だけを強調する',
    '原子力発電所の世界データを地図に表示し、国別に日本だけ強調する',
    'nuclear power plants worldwide',
  ]) {
    const got = CAPS.search(q, { want: 8, min: 1 }).ranked.map((r) => r.id);
    if (got.length < 3) continue;                    /* nothing matched is an honest answer — ① covers the reaching */
    for (const p of Object.keys(runs)) {
      assert.notDeepEqual(got, runs[p].slice(0, got.length), q + ' answered with the head of «' + p + '.*» in registry order');
    }
  }
});

/* ══ ③ A THANK-YOU IS STILL NOT A SPATIAL QUERY (#R745's measurement, kept) ═══════════════════════ */
test('R802 ③ a request that names nothing IntMap has still matches nothing', () => {
  assert.deepEqual(top('ありがとう'), [], 'ありがとう → ' + top('ありがとう').join(', '));
});

/* ══ ④ THE PINS WERE JUDGED BY COUNTING THEM ══════════════════════════════════════════════════════
   research.situationMap returned «ok» and «not_rendered» ALTERNATELY for the same subject inside one
   turn, so Atlas read a success as a failure and fired again: seven times for 「日本の令制国を1750年の
   地図に描いて」 (9 m 16 s), six for 「1914年のヨーロッパの国境」 (6 m 55 s), five research.analyze calls
   for «Draw the 200 nautical mile EEZ around Iceland» (6 m 51 s). The cause is that the pin surface had
   no painter's declaration (#R742's third rung), so the verdict fell to a CARDINAL — and a redraw of
   the same pins moves no count. The surface must be one the reading holds and the painter can name. */
test('R802 ④ the markers are a surface the painter declares and the reading holds', () => {
  /* read, not run: the supplier bundle is built inside the kernel, which only a browser can build; the
     reading is RUN in R760 ⓪–⑤. */
  const era = codeOnly(readLF(join(ROOT, 'js/atlas-era-highlight.js')));
  assert.match(era, /PAINTED_IDS\s*=\s*\{[\s\S]{0,900}?\bpoi\s*:/, 'the reading holds a «poi» surface');
  assert.match(CONSOLE_SRC, /_ERA\.paintState\(\{[^}]*\bpoi\s*:\s*\(\)\s*=>\s*_pois/, 'the console supplies the markers to that reading');
  const pinned = (CONSOLE_SRC.match(/_PINNED\(/g) || []).length;
  assert.ok(pinned >= 6, 'every pinning capability declares through the one declaration (found ' + pinned + ')');
});

/* ══ ⑤ AN ABBREVIATION IS NOT A SENTENCE END ══════════════════════════════════════════════════════
   In the reader's own bubble: 「It identifies Dujuan (JMA Typhoon No.⏎⏎25 / 2625) in the western North
   Pacific」 and 「to simplify U.⏎⏎S. Antarctic Program flights」 — the reflow put a paragraph break inside
   «No. 25» and inside «U.S.». ⚠ AND THE GENUINE BOUNDARIES MUST STILL SPLIT: a repair that joins
   «…the Red Sea. The Nile…» has replaced one defect with another. */
test('R802 ⑤ the reflow keeps an abbreviation whole and still splits real sentences', () => {
  const src = codeOnly(readLF(join(ROOT, 'js/atlas-reply.js')));
  const line = src.split('\n').find((l) => l.indexOf('const _ATL_ATOM=') >= 0);
  assert.ok(line, 'the held atoms are one declaration');
  const ATOM = new Function('return ' + line.trim().replace(/^const _ATL_ATOM=/, '').replace(/;\s*$/, ''))();
  const SENT = /[^.!?。！？…]+(?:[.!?。！？…]+["”』）)]*|$)/g;
  const split = (s) => {
    const A = [];
    const held = String(s).replace(ATOM, (m) => { A.push(m); return '' + (A.length - 1) + ''; });
    return (held.match(SENT) || [held]).map((x) => (A.length ? x.replace(/(\d+)/g, (m, i) => A[+i]) : x));
  };
  assert.equal(split('It identifies Dujuan (JMA Typhoon No. 25 / 2625) in the western North Pacific.').length, 1, 'No. 25');
  assert.equal(split('a convention to simplify U.S. Antarctic Program flights and schedules.').length, 1, 'U.S.');
  assert.equal(split('St. Petersburg is in Russia. Mt. Fuji is in Japan.').length, 2, 'St. / Mt. — two sentences, not four');
  assert.equal(split('The ship crossed the Red Sea. The Nile is longer than the Amazon.').length, 2, 'a real boundary still splits');
  assert.equal(split('We flew to Italy. The Colosseum was open. It rained.').length, 3, 'three real boundaries still split');
});

/* ══ ⑥ A PLACE IntMap COULD NOT FIND WAS ANSWERED ABOUT ANYWAY ════════════════════════════════════
   data.layerValues {place:'Korean Peninsula'} and {place:'Amazon Basin'} answered
   「◈ map center — BWh · Hot desert」: a reading of wherever the reader happened to be looking, handed
   back as an answer about the place they named. */
test('R802 ⑥ a named place that did not resolve is not answered about the map centre', () => {
  /* read, not run: the layerData case is a branch of the kernel's dispatch, which needs a live map. */
  const body = codeOnly((capabilityEntry('layerData') || {}).run || '');
  assert.ok(body, 'the layer reading is one capability with a run');
  const placeAt = body.indexOf('if(a.place)');
  const centreAt = body.indexOf('GE().camera.getCenter()');
  assert.ok(placeAt > 0 && centreAt > placeAt, 'the named place is resolved before the centre is used');
  assert.match(body.slice(placeAt, centreAt), /else\s+return\s+R\(false/,
    'a named place that did not resolve stops here instead of falling through to the camera centre');
});

/* ══ ⑦ THE HIGHLIGHT'S NAME OUTLIVED THE HIGHLIGHT ════════════════════════════════════════════════
   Five consecutive turns opened by clearing 「the previous Syria highlight」, each spending an operation
   on a map that held nothing, because the state kept naming a highlight clearHl() had already emptied.
   The name is forgotten where the set is emptied, so every clearing path gets it. */
test('R802 ⑦ emptying the highlight forgets what it was called', () => {
  /* read, not run: clearHl is a closure of the kernel over its own highlight state. */
  const fn = liftFunction(CONSOLE_SRC, 'clearHl');
  assert.match(fn, /_hl\s*=\s*new Set\(\)/, 'clearHl empties the set');
  assert.match(fn, /_wctx\.highlight\s*=\s*null/, 'and forgets the name the state reports from');
});

/* ══ ⑧ A CUT TURN SAID 「working limit」 AND NEVER SAID THE ANSWER ══════════════════════════════════
   23 of the 46 measured turns ended with 「このターンは作業の上限に達したため…」. In several the work had
   SUCCEEDED and only the sentence was missing: «Show the top 10 countries by GDP per capita … and tell
   me which of them are NOT in the top 10 by total GDP» drew both tables and the choropleth, and all the
   prose the reader received was «I'm comparing the two rankings now.» The closing call existed but was
   reachable only when NOTHING had been said, and a first-step narration is something. */
test('R802 ⑧ a turn that ran out still gets the step that writes the answer', () => {
  const cutLine = AGENT_SRC.split('\n').find((l) => /CUT_STOPS\s*=/.test(l));
  assert.ok(cutLine, 'the stops that cut a turn short are named in one place');
  const CUT = new Function('return ' + cutLine.replace(/^[^=]*=/, '').replace(/;\s*$/, ''))();
  for (const s of ['step_budget', 'call_budget', 'time_budget', 'repeated_calls', 'malformed_limit']) {
    assert.equal(CUT[s], 1, s + ' is a turn that was cut short');
  }
  assert.equal(CUT.answered, undefined, 'a turn that answered was not cut short');
  assert.equal(CUT.awaiting_user, undefined, 'a turn that ended by asking the reader was not cut short');
  const i = AGENT_SRC.indexOf('cutShort');
  assert.ok(i > 0 && /if\s*\(cutShort\)\s*writeAnswer\s*=\s*true/.test(AGENT_SRC.slice(i, i + 800)),
    'being cut short is itself a reason to write the answer');
});
}
