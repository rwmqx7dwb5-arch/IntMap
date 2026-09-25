/* atlas-50-remainder — the six things R802 §10 saw on production and left, written as the defects themselves.
 *
 * Every assertion names what a reader SAW on https://rwmqx7dwb5-arch.github.io/IntMap/ (build
 * 2026-09-18-R783, signed in; DEV-NOTES.md #R802 §6 / §9 / §10), not the shape of the repair —
 * [[intmap-restate-the-defect-not-the-fix]]. Where a check needs upstream data it uses the shipped
 * data files (the world gazetteer, the era sheets, the historical-name table) or a response captured
 * from the live service on 2026-09-25 and quoted below, never a list typed for the test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const CONSOLE_SRC = codeOnly(readLF(join(ROOT, 'js/atlas-console.js')));

const { makeAtlasAnswerPipeline } = await import('../js/atlas-answer-pipeline.js');
const { makeAtlasAnswerRender } = await import('../js/atlas-answer-render.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasGeoResolve } = await import('../js/atlas-geo-resolve.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

/* ══ ① 「使用データ」 LISTED WHAT WAS IN THE PROMPT, NOT WHAT THE ANSWER RESTED ON ═════════════════
   A question about a lake's area and one about a typhoon both ended 「使用データ: ニュース, 地震,
   ライブWeb検証」: `analyze` put a USGS earthquake block into every prompt and the line was the list of
   block labels. The model already says what each claim rests on (`evidenceIds`); the blocks had no id. */
test('atlas-50-remainder ① a data block the answer never cites is not listed as data it used', async () => {
  const { runStructuredAnswer } = makeAtlasAnswerPipeline();
  const { citedRecords } = makeAtlasAnswerRender();
  let prompt = '';
  const ask = async (p) => {
    prompt = p;
    /* the model reads the id the WEATHER block carries in its own heading, and cites only that */
    const m = /\[CURRENT WEATHER @ Lake Biwa — evidence id (\w+)\]/.exec(p);
    return { data: {
      directAnswer: { text: 'Lake Biwa covers about 670 km².', claimIds: ['c1'] },
      sections: [{ id: 's1', heading: 'Weather', blocks: [{ type: 'paragraph', text: 'It is 18 °C there now.', claimIds: ['c2'] }] }],
      claims: [
        { id: 'c1', text: 'Lake Biwa covers about 670 km².', claimType: 'fact', importance: 'primary', dimension: 'level', evidenceIds: [], confidence: 'medium' },
        { id: 'c2', text: 'It is 18 °C there now.', claimType: 'fact', importance: 'supporting', dimension: 'level', evidenceIds: m ? [m[1]] : [], confidence: 'medium' },
      ] }, meta: {} };
  };
  const RES = await runStructuredAnswer({
    question: 'How large is Lake Biwa?', systemPrompt: 'sys', language: 'English', webMode: 'off',
    dataBlock: ['[TIME CONTEXT]\nnow\n\n',
      { tag: 'CURRENT WEATHER @ Lake Biwa', label: 'weather', text: '18 °C' },
      '',
      { tag: 'EARTHQUAKES (USGS, last 24 h)', label: 'earthquakes', text: 'M4.1 off Chiba' }],
    ask, parseJSON: (t) => { try { return JSON.parse(t); } catch (_) { return null; } } });
  assert.match(prompt, /\[EARTHQUAKES \(USGS, last 24 h\) — evidence id \w+\]/, 'every block can be named by the answer');
  const labels = citedRecords(RES.env, RES.registry).map((r) => r.label);
  assert.deepEqual(labels, ['weather'], 'the answer cited the weather block and nothing else — got ' + labels.join(', '));
  assert.ok(!labels.includes('earthquakes'), 'an earthquake block in the prompt is not an earthquake in the answer');
});

test('atlas-50-remainder ① the line the reader sees is read off the citations, not off the prompt', () => {
  const i = CONSOLE_SRC.indexOf("L('Data used','使用データ'");
  assert.ok(i > 0, 'the analysis answer still states the data it used');
  const before = CONSOLE_SRC.slice(Math.max(0, i - 1400), i);
  assert.match(before, /citedRecords\(_env,_reg\)/, 'and it builds that list from what the rendered claims cite');
  assert.doesNotMatch(CONSOLE_SRC, /usedNames\.push\(/, 'no path adds a label because a block was put in the prompt');
});

/* ══ ② AN OCEAN ASKED FOR, A TOWN ANSWERED ══════════════════════════════════════════════════════
   `Pacific` → Pacifica, California (R802 §6). The confirming door took the search box's FIRST fuzzy
   row — a word-prefix match — before any rule was asked. The same line answers 「大西洋」 with Atlantic
   City (its Chinese name 大西洋城 contains the query) while Nominatim names the Atlantic Ocean and says
   it is an ocean. Nominatim responses below are the live answers captured on 2026-09-25. */
const NOMINATIM_2026_09_25 = {
  Pacific: [
    { lat: '46.5', lon: '-123.7', importance: 0.5237712301007281, class: 'boundary', type: 'administrative', addresstype: 'county', display_name: 'Pacific County, Washington, United States', namedetails: { name: 'Pacific County' } },
    { lat: '47.26', lon: '-122.25', importance: 0.46051249100619307, class: 'boundary', type: 'administrative', addresstype: 'village', display_name: 'Pacific, King County, Washington, 98047, United States', namedetails: { name: 'Pacific' } },
    { lat: '38.48', lon: '-90.74', importance: 0.4545822443087463, class: 'boundary', type: 'administrative', addresstype: 'town', display_name: 'Pacific, Franklin County, Missouri, United States', namedetails: { name: 'Pacific' } },
    { lat: '43.5', lon: '-89.5', importance: 0.31977730603466514, class: 'boundary', type: 'administrative', addresstype: 'city', display_name: 'Town of Pacific, Columbia County, Wisconsin, United States', namedetails: { name: 'Town of Pacific' } },
  ],
  大西洋: [
    { lat: '13.5819210', lon: '-38.3203120', importance: 0.7856583455604705, class: 'place', type: 'ocean', addresstype: 'ocean', display_name: 'Атлантикатә аокеан', namedetails: { name: 'Атлантикатә аокеан', 'name:en': 'Atlantic Ocean', 'name:ja': '大西洋' } },
  ],
  太平洋: [
    { lat: '-0.7031070', lon: '-120.9375000', importance: 0.7866111924686969, class: 'place', type: 'ocean', addresstype: 'ocean', display_name: 'المحيط الهادئ', namedetails: { name: 'المحيط الهادئ', 'name:en': 'Pacific Ocean', 'name:ja': '太平洋' } },
    { lat: '30.5765532', lon: '114.2352535', importance: 0.3002719692158251, class: 'railway', type: 'station', addresstype: 'railway', display_name: '太平洋, 汉西路, 武汉市, 中国', namedetails: { name: '太平洋', 'name:en': 'Taipingyang' } },
  ],
};
let _fetchReal = null;
async function withNetwork(fn) {
  _fetchReal = globalThis.fetch;
  const WORLD = fs.readFileSync(join(ROOT, 'data/gazetteer-world.json.gz'));
  globalThis.fetch = async (url) => {
    const u = String(url);
    let parsed = null;
    try { parsed = new URL(u, 'http://local.invalid/'); } catch { parsed = null; }
    const host = parsed ? parsed.hostname : '';
    if (parsed && parsed.pathname.endsWith('/gazetteer-world.json.gz')) return new Response(WORLD);
    if (host === 'nominatim.openstreetmap.org') {
      const q = decodeURIComponent((/[?&]q=([^&]*)/.exec(u) || [])[1] || '');
      return new Response(JSON.stringify(NOMINATIM_2026_09_25[q] || []), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('[]', { headers: { 'content-type': 'application/json' } });
  };
  try { return await fn(); } finally { globalThis.fetch = _fetchReal; }
}
async function realResolver(extraCtx) {
  /* the SHIPPED matcher over the SHIPPED world gazetteer — not a stub standing in for either */
  await import(pathToFileURL(join(ROOT, 'js/gazetteer.js')).href);
  await import(pathToFileURL(join(ROOT, 'js/search-geocode.js')).href);
  await window.IntMapGazetteer.warm();
  const HOST = { countryStats: {}, lang: 'en', get BUILTIN_GAZETTEER() { return window.IntMapGazetteer.index(); } };
  const S = window.IntMapModules.searchGeocode(HOST);
  const G = makeAtlasGeoResolve(HOST, Object.assign({ L: (e) => e, _setLast: (x) => x, localFuzzyPlaces: S.localFuzzyPlaces,
    lastPlace: () => null, GE: () => ({ camera: { getCenter: () => ({ lng: 0, lat: 0 }) } }) }, extraCtx || {}));
  return { G, S };
}

test('atlas-50-remainder ② a partial name is a suggestion, and the door that confirms does not take it', async () => {
  await withNetwork(async () => {
    const { G, S } = await realResolver();
    /* the matcher still OFFERS the partial rows — the search box is allowed to suggest (#R291) */
    assert.ok(S.localFuzzyPlaces('Pacific').some((r) => /Pacifica/.test(r.name) && !r.exact), 'Pacifica is offered, as a non-exact row');
    const p = await G.geocode('Pacific');
    assert.ok(p, 'the gazetteers still answer');
    assert.doesNotMatch(String(p.name), /^Pacifica$/, 'Pacific is not Pacifica — got ' + p.name);
    const a = await G.geocode('大西洋');
    assert.ok(a && a.kind === 'ocean', 'an ocean asked for is answered with the ocean the upstream declares — got ' + JSON.stringify(a));
    assert.doesNotMatch(String(a.name), /Atlantic City/, 'not with a town whose name contains it');
    const t = await G.geocode('太平洋');
    assert.equal(t && t.kind, 'ocean', '太平洋 → the ocean, not the station in Wuhan and not a fuzzy town');
    /* an exact row is still a local answer — the confirming door lost nothing it could confirm */
    const paris = await G.geocode('Paris');
    assert.ok(paris && paris.name === 'Paris' && Math.abs(paris.lat - 48.85) < 0.1, 'Paris still resolves locally');
  });
});

/* ══ ③ 「現在地」 DID NOT REACH view.locate ════════════════════════════════════════════════════════
   The row's spellings are English identifiers, so «my location» scored 100 and 「現在地」 scored 3 and
   lost to navigation.camera and routing.isochrone, whose CATEGORY hint contains the word. The product
   already holds the reader's own phrases for this act in nine languages (js/atlas-geo-resolve.js, the
   table #R413 made measurable) — every one of them must reach the capability that shows it. */
const CAPS = makeAtlasCapabilities({});
CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
const first = (q) => (CAPS.search(q, { want: 3, min: 1 }).ranked[0] || {}).id;
test('atlas-50-remainder ③ every phrase the product holds for 「where I am」 reaches view.locate first', () => {
  const W = makeAtlasGeoResolve.placeRules.selfLocWords;
  const all = Object.keys(W).reduce((a, k) => a.concat(W[k]), []);
  assert.ok(all.length >= 9, 'the vocabulary is the resolver\'s table');
  const miss = all.filter((p) => first(p) !== 'view.locate');
  assert.deepEqual(miss, [], 'phrases that do not reach view.locate: ' + miss.map((p) => p + ' → ' + first(p)).join(' | '));
  assert.equal(first('現在地 表示'), 'view.locate', 'the keyword form Atlas searches with');
  /* ⚠ AND IT TAKES NOTHING FROM THE CAPABILITIES THAT USE THE WORD AS AN ARGUMENT */
  assert.equal(first('現在地から大阪駅までの経路'), 'routing.route', 'a route FROM here is still a route');
  assert.equal(first('現在地から徒歩一時間で行ける範囲'), 'routing.isochrone', 'a reach FROM here is still a reach');
});

/* ══ ④ THE SAME LINE UNDER FOUR CAPTIONS WAS FOUR CALLS ══════════════════════════════════════════
   `callKey` is the call's arguments, so a line redrawn with a new label each time was never «the same
   call», each run came back `ok`, and nothing told Atlas the map still held ONE line. */
function lnK() {
  const line = CONSOLE_SRC.split('\n').find((l) => l.indexOf('const _lnK=') >= 0);
  assert.ok(line, 'the painter derives a line\'s identity in one expression');
  const expr = /const _lnK=(ps=>\{[\s\S]*?return a<b\?a:b; \})/.exec(line);
  assert.ok(expr, 'the identity is a function of the course');
  return new Function('return ' + expr[1])();
}
test('atlas-50-remainder ④ a course is the same line whichever end it is drawn from', () => {
  const K = lnK();
  const fwd = [[-21.94, 64.14], [18.42, -33.92]];
  assert.equal(K(fwd), K(fwd.slice().reverse()), 'Cape Town→Reykjavik is the line Reykjavik→Cape Town');
  assert.notEqual(K(fwd), K([[-21.94, 64.14], [18.42, -34.92]]), 'a different course is a different line');
  assert.match(CONSOLE_SRC, /resultKey:'map\.line:'\+_lnKey/, 'the line states what it drew as its result identity');
});
test('atlas-50-remainder ④ a relabelled redraw of the same line is named as the same work, and nothing is refused', async () => {
  const AGENT = makeAtlasAgent();
  const SCHEMAS = makeAtlasSchemas();
  const K = lnK();
  const course = [[-21.94, 64.14], [18.42, -33.92]];
  const labels = ['Reykjavik–Cape Town', 'Great-circle route', 'Distance line', 'Reykjavík to Cape Town', 'Line'];
  let i = 0; const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (act) => { ran.push(act); return { ok: true, html: '<div>Line drawn — ' + act.label + '</div>',
      meta: { painted: { lines: [act.label] }, resultKey: 'map.line:' + K(act.points) } }; } });
  const tools = surface.baseTools();
  const model = async () => ({ text: 'drawing.', turnState: 'continuing', toolCalls: [{ id: 'c' + i, name: 'run_capability',
    arguments: { id: 'map.drawLine', args: { points: (i % 2 ? course.slice().reverse() : course), label: labels[Math.min(i++, labels.length - 1)] } } }] });
  const out = await AGENT.runTurn({ model, tools, execute: surface.makeExecute(tools, AGENT), system: 'sys',
    messages: [{ role: 'user', content: 'Measure Reykjavik to Cape Town and draw the line' }] });
  assert.ok(ran.length >= 2, 'every call that was made RAN — a restyle is applied, nothing is refused');
  const marked = (out.results || []).filter((r) => r && r.sameResultAsEarlierCallThisTurn);
  assert.equal(marked.length, ran.length - 1, 'every redraw after the first is named as the same work');
  assert.match(String(marked[0].note || ''), /ONE of it, not two/, 'and the note says what is true of the map');
  assert.equal(out.stopped, 'repeated_calls', 'the relabelling treadmill ends by name, not at the working limit');
  assert.ok(ran.length < labels.length, 'it did not relabel the same line five times — ran ' + ran.length);
});
test('atlas-50-remainder ④ a revision of an artefact is a successor, never a repeat', async () => {
  const AGENT = makeAtlasAgent();
  const SCHEMAS = makeAtlasSchemas();
  let rev = 0;
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS,
    runAction: async () => ({ ok: true, html: '<div>map</div>', meta: { resultKey: 'map.compose:a1', artifact: { id: 'a1', revision: ++rev } } }) });
  const tools = surface.baseTools();
  let n = 0;
  const model = async () => (n++ < 3
    ? { text: 'composing.', turnState: 'continuing', toolCalls: [{ id: 'k' + n, name: 'run_capability', arguments: { id: 'map.compose', args: { title: 'v' + n } } }] }
    : { text: 'Done — here is the map.', turnState: 'final', toolCalls: [] });
  const out = await AGENT.runTurn({ model, tools, execute: surface.makeExecute(tools, AGENT), system: 'sys',
    messages: [{ role: 'user', content: 'map it' }] });
  assert.equal((out.results || []).filter((r) => r && r.sameResultAsEarlierCallThisTurn).length, 0, 'revision 2 is not revision 1 again');
});

/* ══ ⑤ 「ローマ帝国」 WAS 「地名が見つかりません」 — WITH THE MAP DRAWING IT ═══════════════════════════════
   Chronos at 117, the era sheet under the reply drawing the Roman Empire, and every door asked only
   gazetteers of the present. The record on screen names it — in every language data/histnames.json
   holds — and that record is what is asked. The feature collection below is built from the shipped
   era sheet for year 100 exactly as js/time-borders.js `erFC` builds it (NAME + `_i18n`). */
function eraSheet(year) {
  const w = {}; new Function('window', fs.readFileSync(join(ROOT, 'data/hist-eras.js'), 'utf8'))(w);
  const d = w.__HISTERAS, hn = JSON.parse(fs.readFileSync(join(ROOT, 'data/histnames.json'), 'utf8'));
  const sn = d.snaps.find((s) => s.y === year);
  const feats = sn.feats.map((ft) => {
    const nm = (ft[0] && ft[0].en) || '', ps = ft[2].map((p) => p.map((ri) => d.rings[ri]));
    const row = hn.byName && hn.byName.eras && hn.byName.eras[nm];
    return { type: 'Feature', properties: Object.assign({ NAME: nm }, row ? { _i18n: Object.assign({}, row.n, { en: nm }) } : {}),
      geometry: ps.length === 1 ? { type: 'Polygon', coordinates: ps[0] } : { type: 'MultiPolygon', coordinates: ps } };
  });
  return { type: 'FeatureCollection', features: feats };
}
test('atlas-50-remainder ⑤ a polity the map is drawing resolves by its own name, in the reader\'s language', async () => {
  const fc = eraSheet(100);
  const prev = window.IntMapTimeBorders;
  await withNetwork(async () => {
    try {
      window.IntMapTimeBorders = { active: () => true, currentFC: () => fc, current: () => 100 };
      const { G } = await realResolver();
      for (const q of ['ローマ帝国', 'Roman Empire', 'Römisches Kaiserreich']) {
        const e = await G.placeExtent(q);
        assert.ok(e && e.box, q + ' has an extent while the map draws it');
        const [[w, s], [ea, n]] = e.box;
        assert.ok(w < 12.5 && ea > 12.5 && s < 41.9 && n > 41.9, q + ' — the extent contains Rome: ' + JSON.stringify(e.box));
        const g = await G.geocode(q);
        assert.ok(g && g.kind === 'polity', q + ' — the point door answers it too');
      }
      /* only its own WHOLE name: a fragment of a name is not the polity */
      const frag = await G.geocode('Roman');
      assert.ok(!frag || frag.kind !== 'polity', '「Roman」 is not 「Roman Empire」 (it is a town in Romania, which is what it resolves to)');
      /* ⚠ AND ONLY WHILE IT IS DRAWN: at the live date the record is not in force, so it says nothing */
      window.IntMapTimeBorders = { active: () => false, currentFC: () => fc, current: () => null };
      assert.equal(await G.geocode('ローマ帝国'), null, 'no polity is claimed for a year the map is not showing');
    } finally { window.IntMapTimeBorders = prev; }
  });
});

/* ══ ⑥ AN ENGLISH QUESTION ANSWERED IN GERMAN ═══════════════════════════════════════════════════
   One of the 23 English questions was answered in German. The reply language was the FIRST language
   whose list held one word of the message — German was asked first, and one 「die」 or one umlaut was
   enough; Spanish was second, and one 「los」 or 「la」 was enough. A place name carries exactly those. */
function replyLang(msg, ui) {
  const i = CONSOLE_SRC.indexOf('function _replyLang(');
  const j = CONSOLE_SRC.indexOf('const _langLine=');
  assert.ok(i > 0 && j > i, 'the reply language is decided in one function');
  return new Function('_lastUserMsg', '_aiLangName', 'window', 'HOST', CONSOLE_SRC.slice(i, j) + ';return _replyLang();')(
    msg, () => ui || 'English', { IntMapLang: { englishName: () => ui || 'English' } }, { lang: 'en' });
}
test('atlas-50-remainder ⑥ one foreign word or letter in an English sentence does not decide its language', () => {
  for (const q of ['Show Los Angeles on the map', 'What is the weather in Zürich right now?', 'Why did the dinosaurs die out?',
    'Draw the route from Düsseldorf to Köln and show the distance', 'Where is La Paz and what is its altitude?']) {
    assert.equal(replyLang(q), 'English', q);
  }
  /* …and the languages the lists exist for are still recognised */
  assert.equal(replyLang('Zeige die Karte von Berlin'), 'German');
  assert.equal(replyLang('Wo ist Zürich?'), 'German');
  assert.equal(replyLang('Muestra el mapa de España'), 'Spanish');
  assert.equal(replyLang('Montre la carte de France'), 'French');
  assert.equal(replyLang('東京の天気'), 'Japanese');
});
