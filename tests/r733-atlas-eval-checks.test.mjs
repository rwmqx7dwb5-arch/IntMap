/* ============================================================================
 *  #R733 — 本番で Atlas に複合指示を出して観測した 3 つの欠陥
 * ----------------------------------------------------------------------------
 *  2026-09-15、本番 (rwmqx7dwb5-arch.github.io/IntMap) にログインして実測した 4 ターン。
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
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const src = (rel) => codeOnly(readLF(join(ROOT, rel)));
const CONSOLE_SRC = src('js/atlas-console.js');

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
    localFuzzyPlaces: (q) => { asked.push(q); return [{ lng: 4.4, lat: 50.8, name: 'Deurne', kind: 'place' }]; },
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
