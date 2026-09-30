/* ============================================================================
 *  shell-map-labels-checks — map labels — tile names, era labels, placement, typography
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r252-checks.test.mjs
 *  tests/r772-label-lang-bilingual-checks.test.mjs
 *  tests/r203-checks.test.mjs
 *  tests/r210-checks.test.mjs
 *  tests/r707-chronos-labelplacement-checks.test.mjs
 *  tests/r711-boundary-country-refresh-checks.test.mjs
 *  tests/r253-checks.test.mjs
 *  tests/r309-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { asClassicScript } from './app-source.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* js/map-typography.js, EVALUATED on top of the real language registry. The page's <html lang> is
   the BCP-47 TAG (what the document really carries), the name-key table and the renderer's setter are
   recording stubs, and window.addEventListener keeps its listeners so a language change can be fired. */
function typography(tag) {
  const listeners = {}, keysAskedFor = [], handed = [];
  /* (startup-lazy-layers) the page's FontFaceSet, as css/fonts.css really declares it — the faces this
     origin bundles, which js/map-typography.js `webFonts()` must not ask Google Fonts for */
  const bundled = [...read('css/fonts.css').matchAll(/@font-face\s*\{[^}]*?font-family:\s*'([^']+)'/g)].map((m) => ({ family: m[1] }));
  const w = { console, URL, document: { documentElement: { lang: tag, setAttribute() { } }, baseURI: 'https://example.invalid/app/', querySelector: () => null, addEventListener() { },
    fonts: { forEach: (fn) => bundled.forEach(fn) } } };
  w.window = w;
  w.addEventListener = (ev, fn) => { (listeners[ev] ||= []).push(fn); };
  const ctx = vm.createContext(w);
  for (const p of ['js/locales/_langs.js', 'js/lang-registry.js']) vm.runInContext(read(p), ctx, { filename: p });
  w.IntMapOsmNameKeys = (l) => { keysAskedFor.push(l); return l === 'jp' ? ['name:ja', 'name:en', 'name:latin'] : ['name:' + l, 'name:en']; };
  w.IntMapGeoEngine = { scene: { setCjkFontFamily: (f) => { handed.push(f); return true; } } };
  vm.runInContext(read('js/map-typography.js'), ctx, { filename: 'js/map-typography.js' });
  return { T: w.IntMapMapTypography, L: w.IntMapLang, keysAskedFor, handed, fire: (ev) => (listeners[ev] || []).forEach((f) => f()) };
}

/* ═══════════════════════ #R252 · from r252-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R252 source checks
 * ----------------------------------------------------------------------------
 *  Seven reports, seven properties. Each one is written as «the defect cannot come back», not
 *  «the fix is still typed here», wherever the difference is expressible.
 *
 *  ① the WorldPop progress bar is anchored to the ACTION ROW, never to a cell inside it;
 *  ② the Active-layers bar reads the layer sidebar's OWN background variable;
 *  ③ the place layer asks for the classes OpenMapTiles actually ships — `neighbourhood`, not
 *     `neighborhood` — and the three tiers it drew before are still ungated;
 *  ④ the place popup's heading and the place's IDENTITY are different arguments;
 *  ⑤ the admin-1 label is painted from js/border-style.js, not from a second copy of the colour;
 *  ⑥ the search-pill watcher re-runs when the right panel has FINISHED moving;
 *  ⑦ the CJK face is settable at runtime and something asks for it on every language change.
 *
 *  ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
 *  [[intmap-recurring-lessons]] E has caught nine rounds writing a check that trips on its own
 *  explanation of the defect. (This file's own prose names `neighborhood` and `--card-bg`.)
 * ==========================================================================*/
{

/* ── ③ THE CLASSES THE TILES ACTUALLY SHIP ───────────────────────────────────────────────────── */
/* spelling kept: browser script (js/place-labels.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R252 ③ ofm-other asks for the sub-municipal classes OpenMapTiles really has', () => {
  const pl = code(read('js/place-labels.js'));
  const filt = /id:'ofm-other'[\s\S]*?filter:\[([\s\S]*?)\],\s*\n\s*layout:/.exec(pl);
  assert.ok(filt, 'the ofm-other filter was not found — re-derive this check');
  const f = filt[1];

  for (const c of ['village', 'suburb', 'hamlet', 'borough', 'quarter', 'neighbourhood', 'isolated_dwelling', 'farm']) {
    assert.ok(f.includes(`'${c}'`), `ofm-other no longer admits the «${c}» class`);
  }
  /* ⚠ the US spelling is not a class in this schema and never matched anything */
  assert.doesNotMatch(f, /'neighbor(hood)'/,
    'the US spelling is back in the filter — OpenMapTiles ships «neighbourhood» and the other branch matches nothing');

  /* the three tiers that were already drawn stay ungated: their tier is 1 and the ladder starts at 1 */
  assert.match(pl, /\['village','suburb','hamlet'\],1,/,
    'the classes this layer has always drawn are no longer tier 1 — they would disappear below the new stops');
  assert.match(pl, /\['step',\['zoom'\],1, 13,2, 14,3\]/,
    'the class ladder changed shape — it must start at 1 so today’s labels are unaffected');

  /* ⚠ INTEGER STOPS: `['zoom']` in a FILTER is only re-evaluated at integer zooms (#R198) */
  const gate = /const OTHER_GATE=(.*)/.exec(pl);
  assert.ok(gate, 'OTHER_GATE not found');
  for (const n of (gate[1].match(/\b\d+(\.\d+)?\b/g) || [])) {
    assert.ok(!n.includes('.'), `the class ladder has a fractional zoom stop (${n}) — a filter only sees integers`);
  }

  /* collision has to be resolved by tier, or 452 neighbourhoods in one Osaka tile win over the ward */
  assert.match(pl, /'symbol-sort-key':\['\+',\['\*',OTHER_TIER,1000\]/,
    'ofm-other has no tier-first sort key — the finest tier would out-compete the coarse one at random');
});

/* ── ④ THE HEADING IS NOT THE IDENTITY ───────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/map-ui.js, js/place-labels.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R252 ④ the place popup shows both names, and still queries by the local one', () => {
  const mu = code(read('js/map-ui.js'));

  assert.match(mu, /safe=(?:window\.IntMapSafe\.html\()?String\(opts\.title\|\|name\)/,   /* (a11y-shared-dialog) encoded by the one encoder */
    'the popup heading is not taken from opts.title — the two-name caption cannot appear');
  /* …and everything that IDENTIFIES the place still uses `name`: a caption is not a query */
  assert.match(mu, /navigator\.clipboard\.writeText\(name\)/, 'Copy must write the place name, not the caption');
  assert.match(mu, /const wtitle=\(opts&&opts\.wiki\)\|\|name/, 'the Wikipedia probe must use the place name');
  assert.match(mu, /IntMapOutline\.show\(name,/, 'the boundary lookup must use the place name');

  /* the second name is resolved from the renderer’s own key list, never from a copy of it */
  assert.match(mu, /window\.IntMapOsmNameKeys&&window\.IntMapOsmNameKeys\(HOST\.lang\)/,
    'js/map-ui.js resolves the displayed name from its own list of languages instead of the exported one');
  assert.match(mu, /if\(local&&shown&&shown!==local\) return local\+' \('\+shown\+'\)'/,
    'the two names are printed even when they are the same string');
  /* ⚠ ALL THREE ROUTES INTO THE POPUP CARRY IT. #R210 records that the padded tap is a second door
     into the same popup and #R201 that admin-1 came in through a third; a caption on one of them is
     a caption a reader sees only sometimes. */
  /* ⚠ (#R564) ASKED OF EVERY CALL, NOT OF THREE SPELLINGS. This used to pin the exact argument text of
     the three known routes, and #R564 changed one of them (the era subdivision label now also hands
     over its own polygon) — a change that keeps the caption and broke the check. Worse, a FOURTH route
     added tomorrow would satisfy all three patterns by not existing. So the question is asked of every
     showPopup call there is: each one passes a title, because a caption on some of the doors is a
     caption the reader sees only sometimes. */
  const calls = [];
  for (let at = mu.indexOf('showPopup('); at >= 0; at = mu.indexOf('showPopup(', at + 1)) {
    if (/[A-Za-z0-9_$.]/.test(mu[at - 1] || '') || /function\s$/.test(mu.slice(Math.max(0, at - 12), at))) continue;          /* the declaration and `_showPopup` are not calls */
    let depth = 0, k = at + 'showPopup'.length;
    for (; k < mu.length; k++) { const c = mu[k]; if (c === '(') depth++; else if (c === ')') { depth--; if (!depth) break; } }
    calls.push(mu.slice(at, k + 1));
  }
  assert.ok(calls.length >= 3, 'only ' + calls.length + ' showPopup call(s) found — the reader of this check has drifted from the file');
  /* a call that FORWARDS an options object it was given (the `window._imPlacePopup` bridge) is
     transparent — the caption is its caller's business. A call that BUILDS one must put it in. */
  const builders = calls.filter((c) => c.includes('{'));
  assert.ok(builders.length >= 3, 'only ' + builders.length + ' showPopup call(s) build their own options — the reader of this check has drifted from the file');
  for (const c of builders) {
    assert.ok(/title:/.test(c), 'a showPopup call carries no two-name caption: ' + c.slice(0, 160));
  }

  /* the exported key list is published before any label exists, not as a side effect of the sea gazetteer */
  assert.match(code(read('js/place-labels.js')), /function ensurePlaceLabels\(\)\{[\s\S]{0,400}?window\.IntMapOsmNameKeys=OSM_NAME_KEYS/,
    'OSM_NAME_KEYS is not published from ensurePlaceLabels — js/map-ui.js would fall back to English keys');
});

/* ── ⑤ ONE COLOUR FOR THE REGION AND ITS NAME ────────────────────────────────────────────────── */
/* spelling kept for the place-labels and app-body halves: browser scripts (js/place-labels.js, js/app-body.js) that run against window, the DOM and the live map. The colour itself is read from js/border-style.js's export. */
test('#R252 ⑤ the admin-1 label is painted from js/border-style.js, not from a second copy', async () => {
  const pl = code(read('js/place-labels.js'));
  assert.match(pl, /const A1_TEXT=\(\)=>\{[^}]*window\.IntMapBorderStyle\.admin1/,
    'the admin-1 label colour is not read from the border-style module');
  assert.match(pl, /'text-color':A1_TEXT\(\)/, 'the declared ofm-admin1 paint is not the border colour');
  assert.match(pl, /\(id==='ofm-admin1'\)\?A1_TEXT\(\)/,
    'applyLabelLang no longer repaints ofm-admin1 with the border colour — the light/dark pass would undo it');

  /* the colour lives in ONE place, and it is the same one the line reads.
     (tests-by-topic) asked of the module's own export, not cut out of its text with a regex */
  const { ADMIN1_COLOR } = await import('../js/border-style.js');
  assert.match(String(ADMIN1_COLOR), /^#[0-9a-fA-F]{6}$/, 'ADMIN1_COLOR is no longer a colour exported by js/border-style.js — re-derive this check');
  const col = [null, ADMIN1_COLOR];
  assert.ok(code(read('js/app-body.js')).includes("'line-color':ADMIN1_COLOR"),
    'the province LINE stopped reading ADMIN1_COLOR — the label and the line could drift apart');
  /* the literal in place-labels is only the unreachable fallback, and it must agree with the real one */
  assert.ok(pl.includes(`'${col[1]}'`), `the fallback colour in js/place-labels.js disagrees with ADMIN1_COLOR (${col[1]})`);

  /* the halo carries that colour on BOTH basemaps — a light halo under #cba6f7 is ~1.4:1 */
  assert.match(pl, /\(id==='ofm-admin1'\|\|lightText\)\?'rgba\(0,0,0,0\.9\)'/,
    'the admin-1 halo follows the light/dark rule again — the violet would vanish on a light basemap');
});

/* ── ⑦ THE MAP’S CJK FACE FOLLOWS THE LANGUAGE ─────────────────────────────────────────────── */
test('#R252 ⑦ the local-ideograph family is settable at runtime and is set on every language change', () => {
  /* spelling kept: js/geo-engine.js is the adapter over a live MapLibre map (its glyph manager); the setter's body is read off its text. */
  const ge = code(read('js/geo-engine.js'));
  assert.match(ge, /setCjkFontFamily\(fam\)\{/, 'the adapter cannot change the CJK face');
  assert.match(ge, /gm\.localIdeographFontFamily=fam/, 'the glyph manager’s family is not written');
  /* the re-rasterisation goes through the public API, which is what empties the TinySDF built from
     the OLD family and reloads every tile that depends on glyphs */
  assert.match(ge, /m\.setGlyphs\(u\)/, 'the glyph cache is not invalidated — the old face stays in the atlas');
  assert.match(ge, /gm\.localIdeographFontFamily===fam\|\|/,
    'the setter is not idempotent — the boot language would pay for a glyph reload');
  assert.match(ge, /setCjkFontFamily:f=>A\(\)\.setCjkFontFamily\?A\(\)\.setCjkFontFamily\(f\):false/,
    'the contract does not expose setCjkFontFamily — no module outside the adapter can reach it');

  /* (tests-by-topic) the typography half is RUN: a language change is fired, and what the renderer
     is handed is recorded. */
  const t = typography('zh-Hans');
  t.fire('intmap-lang');
  assert.equal(t.handed.length, 1,
    'nothing asks the renderer to follow the language — the face stays the one the map was built with');
  assert.equal(t.handed[0], t.T.cjkFamily(),
    'the sync does not hand over cjkFamily() — a second answer to «which face» would drift from css/fonts.css');
  /* and the family it hands over is still per-language */
  assert.match(t.handed[0], /^'Noto Sans SC'/, 'cjkFamily() no longer puts the Simplified face first for zh-hans');
  assert.match(typography('ja').T.cjkFamily(), /^'Noto Sans JP'/, '…and the Japanese one first for Japanese');
});
}

/* ═══════════════════════ #R772 · from r772-label-lang-bilingual-checks.test.mjs ═══════════════════════ */
/* ══ IntMap · R772 — the app language with the local name underneath ════════════════════════════
   「Place-name labels に、設定言語の下に現地語で地名を併記する選択肢を足して」 — the shape is the
   one Google Maps / Google Earth draw in English: «Tokyo» on one line, «東京» on the next.

   ⚠ EVERY ASSERTION BELOW EVALUATES THE EXPRESSION THE RENDERER IS HANDED, through MapLibre's own
   parser and evaluator — not the source of js/place-labels.js. Reading the source would prove a
   branch exists, which was never in doubt; what has to be true is that a feature in Tokyo comes out
   as two lines, that a feature in Paris under a French UI comes out as one, and that the three
   older modes still produce exactly what they produced before. Same standing form as
   tests/r691-osm-ja-name-overrides-checks.test.mjs and [[intmap-edge-function-must-be-evaluated]].
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
{
const rd = read;
const NL = String.fromCharCode(10);

/* the module, run, with a renderer stub that records every `text-field` it is handed. */
function boot(lang, mode) {
  const setLayout = [];
  const noop = () => { };
  const layers = {
    has: () => true, hasSource: () => true, get: () => ({}), getLayout: () => 'visible',
    add: noop, setPaint: noop, setSourceData: noop,
    setLayout: (id, prop, val) => { setLayout.push({ id, prop, val }); }
  };
  const ctx = vm.createContext({});
  ctx.window = ctx;
  ctx.console = console;
  ctx.setTimeout = noop;
  ctx.document = { baseURI: 'https://example.invalid/' };
  ctx.matchMedia = () => ({ matches: false });
  ctx._imCanDraw = () => true;
  ctx.isMobile = () => false;
  ctx.imLabelLang = mode;
  ctx.IntMapGeoEngine = {
    hasRenderer: () => true, layers, camera: { getZoom: () => 6 },
    coords: { querySourceFeatures: () => [] }, events: { on: noop }
  };
  ctx.IntMapMapTypography = { placeFont: () => ['literal', ['Inter']], readerFont: () => ['literal', ['Inter']], cjkFamily: () => '', glyphRewrite: noop };
  ctx.IntMapLang = { pick: () => ({ arr: (a) => a[0] }) };
  ctx.SEA_LABELS = [];
  vm.runInContext(asClassicScript(rd('js/place-labels.js')), ctx);
  const HOST = {
    lang, mapType: 'std', namesOn: true, geoLabelsOn: true, poiOn: true, userTheme: 'dark',
    mapLabelsViaVector: () => true, canDraw: () => true, _stabIdx: { water: new Map() }
  };
  const api = ctx.window.IntMapModules.placeLabels(HOST);
  api.ensurePlaceLabels();
  api.applyLabelLang();
  const byId = new Map();
  for (const s of setLayout) if (s.prop === 'text-field') byId.set(s.id, s.val);
  assert.ok(byId.has('ofm-city'), 'applyLabelLang set no text-field on ofm-city — the stub is wrong, not the code');
  return byId;
}

const compiled = new Map();
function compile(e) {
  const k = JSON.stringify(e);
  if (compiled.has(k)) return compiled.get(k);
  const c = createExpression(e, { type: 'string', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  if (c.result !== 'success') assert.fail('MapLibre rejected the label expression: ' + JSON.stringify(c.value.map((x) => x.message)));
  compiled.set(k, c.value);
  return c.value;
}
const draw = (expr, properties) => compile(expr).evaluate({ zoom: 12 }, { type: 1, properties });

const TOKYO = { name: '東京', 'name:en': 'Tokyo', 'name:ja': '東京' };
const PARIS = { name: 'Paris', 'name:en': 'Paris', 'name:ja': 'パリ' };
const NAMELESS_LOCAL = { 'name:en': 'Tokyo' };
                 /* a tile row with no `name` at all */
const NO_READER_NAME = { name: 'Kabasakal' };
                  /* nothing but the endonym */

const EN_BOTH = boot('en', 'ui+local');
const JP_BOTH = boot('jp', 'ui+local');
const FR_BOTH = boot('fr', 'ui+local');

/* ══ ① THE TWO LINES ════════════════════════════════════════════════════════════════════════════ */
test('#R772 ① the reader language on line 1, the tile own name on line 2', () => {
  assert.equal(draw(EN_BOTH.get('ofm-city'), TOKYO), 'Tokyo' + NL + '東京');
  assert.equal(draw(JP_BOTH.get('ofm-city'), PARIS), 'パリ' + NL + 'Paris');
  /* the endonym is the SECOND line, never the first: a reader who set English reads English first. */
  assert.equal(draw(EN_BOTH.get('ofm-city'), TOKYO).split(NL)[0], 'Tokyo');
});

/* ══ ② ONE LINE WHEN THE SECOND WOULD SAY THE SAME THING ════════════════════════════════════════
   «Paris / Paris» is the failure this guards, and it is the common case in Europe — not an edge. */
test('#R772 ② no doubled line when the reader language and the endonym agree', () => {
  assert.equal(draw(EN_BOTH.get('ofm-city'), PARIS), 'Paris');
  assert.equal(draw(FR_BOTH.get('ofm-city'), PARIS), 'Paris');
  /* a feature with no reader-language name falls to `name`, so both halves are the endonym → one line */
  assert.equal(draw(EN_BOTH.get('ofm-city'), NO_READER_NAME), 'Kabasakal');
});

/* ══ ③ NO TRAILING BLANK LINE WHEN THERE IS NO ENDONYM ══════════════════════════════════════════ */
test('#R772 ③ a row with no name draws one line, not a line and an empty one', () => {
  const s = draw(EN_BOTH.get('ofm-city'), NAMELESS_LOCAL);
  assert.equal(s, 'Tokyo');
  assert.ok(!s.includes(NL), 'the label ends in a newline: ' + JSON.stringify(s));
});

/* ══ ④ THE OTHER THREE MODES ARE UNTOUCHED ══════════════════════════════════════════════════════
   A new option must not be a change to the ones already chosen by readers. */
test('#R772 ④ ui / local / en still produce exactly one line, unchanged', () => {
  const cases = [
    ['ui', 'en', TOKYO, 'Tokyo'], ['ui', 'jp', PARIS, 'パリ'],
    ['local', 'en', TOKYO, '東京'], ['local', 'jp', PARIS, 'Paris'],
    ['en', 'jp', TOKYO, 'Tokyo']
  ];
  for (const [mode, lang, props, want] of cases) {
    const got = draw(boot(lang, mode).get('ofm-city'), props);
    assert.equal(got, want, 'mode=' + mode + ' lang=' + lang);
  }
});

/* ══ ⑤ EVERY PLACE-NAME LAYER GETS IT, NOT JUST THE CITIES ══════════════════════════════════════
   The report is about place-name labels, and there are several layers that draw one. A fix applied
   to the city layer alone would leave the country, the prefecture, the POI and the water names in
   one language beside two-line city names — the shape #R429 records. */
test('#R772 ⑤ the second line reaches every layer that draws a tile name', () => {
  for (const id of ['ofm-country', 'ofm-admin1', 'ofm-city', 'ofm-other', 'ofm-poi', 'ofm-river', 'ofm-water']) {
    assert.ok(EN_BOTH.has(id), 'no text-field written for ' + id);
    assert.equal(draw(EN_BOTH.get(id), TOKYO), 'Tokyo' + NL + '東京', id);
  }
  /* the peak layer keeps its ▲ on the first line and takes the endonym under it. */
  assert.equal(draw(EN_BOTH.get('ofm-peak'), TOKYO), '▲ Tokyo' + NL + '東京');
});

/* ══ ⑥ THE OTHER ENGINE CAN READ IT ═════════════════════════════════════════════════════════════
   js/cesium-layers.js resolves these very layouts through js/cesium-style.js, whose evaluator names
   the operators it does NOT implement. `format` — the operator that would have let the second line
   be smaller — is in that set, so choosing it would have blanked every label on the Cesium engine
   with nothing failing. The list is read from that file rather than restated here. */
test('#R772 ⑥ the expression uses no operator the Cesium evaluator refuses', () => {
  const m = rd('js/cesium-style.js').match(/const UNSUPPORTED=new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'cesium-style.js no longer declares UNSUPPORTED — this check has lost its subject');
  const unsupported = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  assert.ok(unsupported.has('format'), 'the set no longer names format; re-read the reason above');
  const ops = new Set();
  (function walk(e) {
    if (!Array.isArray(e)) return;
    if (typeof e[0] === 'string') ops.add(e[0]);
    for (const x of e) walk(x);
  })(EN_BOTH.get('ofm-city'));
  const bad = [...ops].filter((o) => unsupported.has(o));
  assert.deepEqual(bad, [], 'the bilingual label uses operators Cesium cannot evaluate: ' + bad.join(', '));
});

/* ══ ⑧ THE SHIPPED DEFAULT IS THIS MODE, AND IT IS A MODE THAT EXISTS ═══════════════════════════
   「このハイブリッド方式をデフォルト設定に。」 A default is a value in js/app-body.js and an option
   in index.html and a branch in js/place-labels.js, and the three are written in three files — a
   default naming a mode nobody implements would draw the reader's language with no second line and
   nothing would say so. All three are read here; the behaviour half is RUN. */
test('#R772 ⑧ the default mode is ui+local, is offered, and draws two lines', () => {
  const m = rd('js/app-body.js').match(/window\.imLabelLang\s*=\s*'([^']+)'/);
  assert.ok(m, 'js/app-body.js no longer sets an initial imLabelLang');
  assert.equal(m[1], 'ui+local', 'the shipped default is not the bilingual mode');
  const sel = rd('index.html').match(/<select id="setting-label-lang">([\s\S]*?)<\/select>/)[1];
  assert.ok(sel.includes('value="' + m[1] + '"'), 'the default is not one of the offered options');
  assert.equal(draw(boot('en', m[1]).get('ofm-city'), TOKYO), 'Tokyo' + NL + '東京');
});

/* ══ ⑦ THE SETTING OFFERS EXACTLY THE MODES THE RENDERER IMPLEMENTS ═════════════════════════════
   Both halves are discovered: the options from index.html, the behaviour by RUNNING each one. An
   option nobody implements draws the wrong labels silently; a mode nobody can choose is dead code. */
test('#R772 ⑦ every option in the settings select is a mode that behaves distinctly', () => {
  const sel = rd('index.html').match(/<select id="setting-label-lang">([\s\S]*?)<\/select>/);
  assert.ok(sel, 'the Place-name labels select is gone from index.html');
  const opts = [...sel[1].matchAll(/<option value="([^"]+)" data-i18n="([^"]+)"/g)].map((m) => ({ v: m[1], k: m[2] }));
  assert.ok(opts.some((o) => o.v === 'ui+local'), 'the bilingual option is not offered');
  assert.equal(new Set(opts.map((o) => o.v)).size, opts.length, 'duplicate option values');
  assert.equal(new Set(opts.map((o) => o.k)).size, opts.length, 'two options share one i18n key');
  /* A mode that never draws anything another mode does not is dead code. ⚠ THE QUESTION IS ASKED
     ACROSS UI LANGUAGES, not under one: «Match app language» and «Always English» agree for an
     English reader and are two different settings all the same — asking only in English would have
     failed this on the first correct build, which is what [[intmap-ceiling-guards-are-not-policies]]
     records. The pair has to differ SOMEWHERE, and jp/en over these two features is where. */
  const seen = new Map();
  for (const o of opts) {
    const sig = JSON.stringify(['en', 'jp'].map((L) => {
      const b = boot(L, o.v);
      return [draw(b.get('ofm-city'), TOKYO), draw(b.get('ofm-city'), PARIS)];
    }));
    assert.ok(!seen.has(sig), 'options ' + seen.get(sig) + ' and ' + o.v + ' draw the same labels');
    seen.set(sig, o.v);
  }
});
}

/* ═══════════════════════ #R203 · from r203-checks.test.mjs ═══════════════════════ */
/* (#R203 — the round's own account of why these checks exist heads its other half, in tests/shell-launch-defaults-checks.test.mjs) */
{
const rd = read;

/* ── ⑤ THE PICTURE AND ITS CAPTION MOVE TOGETHER ────────────────────────────────────────────── */
/* spelling kept: browser script (js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R203 ⑤ the satellite labels fade with the imagery they are drawn on', () => {
  const body = rd('js/app-body.js');
  const grab = (id) => {
    const i = body.indexOf("{id:'" + id + "',type:'raster'");
    assert.ok(i > 0, id + ' is still declared as a raster layer');
    return /'raster-fade-duration':(\d+)/.exec(body.slice(i, i + 220));
  };
  const sat = grab('layer-sat'), lbl = grab('layer-sat-labels');
  assert.ok(sat && lbl, 'both raster layers still declare a fade duration');
  assert.equal(lbl[1], sat[1], 'the caption fades with the photograph');
  assert.ok(Number(sat[1]) > 0, 'and neither is a hard swap (#R191)');
});
}

/* ═══════════════════════ #R210 · from r210-checks.test.mjs ═══════════════════════ */
/* (#R210 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const rd = read;

test('R210 ⑤: enlarging the country label did not drag every other label up with it', () => {
  /* (tests-by-topic) EVALUATED: js/label-scale.js runs, and the sizes it hands out are compared. */
  const w = {}; w.window = w;
  vm.runInContext(rd('js/label-scale.js'), vm.createContext(w), { filename: 'js/label-scale.js' });
  const S = w.IntMapLabelScale;
  assert.ok(Array.isArray(S.SUB_REF), 'SUB has its own reference…');
  S.SUB.forEach(([z, s], i) => {
    assert.equal(z, S.SUB_REF[i][0], 'SUB has the stops of its own reference');
    assert.ok(Math.abs(s - S.SUB_REF[i][1] * S.SUB_RATIO) < 0.1,   /* sizes are floored to 0.1 px */
      `…and SUB is derived from it, not from REF (z${z}: ${s} vs ${S.SUB_REF[i][1]} × ${S.SUB_RATIO})`);
  });
  /* the reason it matters: where the country class raised REF, the non-place labels did NOT follow */
  const z = S.REF[S.REF.length - 1][0];
  assert.ok(S.subAt(z) < S.refAt(z) * S.SUB_RATIO,
    `deriving SUB from REF is what made the sea names grow — at z${z} sub ${S.subAt(z)} must stay under REF × ratio ${S.refAt(z) * S.SUB_RATIO}`);
});
}

/* ═══════════════════════ #R707 · from r707-chronos-labelplacement-checks.test.mjs ═══════════════════════ */
/* ══ R707 — ONE CHANCE PER POLITY WAS NOT ENOUGH CHANCES ═══════════════════════════════════════
 *
 *  #R520 answered 「昔の国名ラベルが1国につき何十個も出る」 by reducing the era names to ONE Point per
 *  NAME — the pole of the polity's largest part — and said so in its own comment («ONE Point per
 *  era identity»). That is also ONE CHANCE. `text-allow-overlap` is off on `imtb-lbl`/`imtb-lbl2`,
 *  so a name whose single candidate loses the collision is not moved elsewhere, it is GONE; and a
 *  record that puts one polity on two continents — Russian America in 1800, Alaska in 1960,
 *  Ottoman Tripolitania in 1900, French Algeria in 1860, Danish Greenland — drew the second
 *  territory with nothing on it at all. `_ERAVAR` (`text-variable-anchor`, five directions) was the
 *  compensation, and it moves ONE label around ONE point; it does not make a second place.
 *
 *  #R707 gives the other parts of a polity their own chance, under two tests that are about the
 *  RECORD and not about a list of names: the part has to be a territory in its own right
 *  (`_LBL_MIN_KM2`, measured), and its centre has to stand further from every part already labelled
 *  than the two territories are themselves wide (the sum of the radii of discs of equal area — no
 *  second threshold).
 *
 *  ⚠ WHAT THESE CHECKS MEASURE, AND WHAT THEY DELIBERATELY DO NOT.
 *  They EVALUATE the shipped module over the shipped bundles (#R505, #R621) and read the collection
 *  the label source is actually handed. They do NOT re-implement the rule: a check that recomputed
 *  `_LBL_MIN_KM2` and the spacing would be the same judgement in two places (#R536) and would agree
 *  with the code no matter what either of them said. They also do not name a country: a list of
 *  spellings guards the cases somebody thought of in 2026 and nothing the bundles grow afterwards
 *  (#R488, .agents/rules/no-ad-hoc-hardcoding.md). What they state instead:
 *
 *    ① the point that was there before is still there, on the same part, to the same digits;
 *    ② no part of a polity carries two of its names, and no name stands off its own polity;
 *    ③ where the RECORD ITSELF puts a huge territory far from the body it names, that polity now
 *       has more than one chance — and the situation is asserted to occur, so the check cannot pass
 *       by looking at nothing (#R699);
 *    ④ nothing small buys a name, and a sheet does not fill up with them;
 *    ⑤ every point of a name is still the same feature's properties, in a fresh object — what
 *       `_same`, `_locName`/`_modName` and `_clk` all read.
 * ==========================================================================*/
{
const rd = read;

/* ── the renderer as a RECORDER: it keeps what was written to each source and nothing else ─────── */
function makeEngine() {
  const layers = new Map(), sources = new Map();
  const eng = {
    hasRenderer: () => true, ready: () => true,
    layers: {
      hasSource: (id) => sources.has(id),
      addSource: (id, d) => { sources.set(id, d); },
      setSourceData: (id, d) => { if (!sources.has(id)) throw new Error('no such source: ' + id); sources.set(id, d); },
      has: (id) => layers.has(id), get: (id) => layers.get(id) || null,
      add: (def) => { layers.set(def.id, { def, layout: Object.assign({}, def.layout) }); },
      setLayout: (id, k, v) => { const l = layers.get(id); if (l) l.layout[k] = v; },
      getLayout: (id, k) => { const l = layers.get(id); return l ? l.layout[k] : undefined; },
      setPaint: () => {}, remove: (id) => layers.delete(id), move: () => {},
    },
    events: { onLayer: () => {}, on: () => {}, clickLayers: () => [], claimClick: () => {}, clickClaimed: () => false },
    coords: { queryRenderedFeatures: () => [] },
    ui: { popup: () => ({ setLngLat() { return this; }, setHTML() { return this; }, remove() {} }), attach: (p) => p },
    render: { canvas: () => ({ style: {} }) },
  };
  return { eng, layers, labels: () => sources.get('imtb-lbl-src') || null };
}

function loadModule() {
  const noop = () => {};
  const E = makeEngine();
  const win = {
    addEventListener: noop, setTimeout: (f) => { try { f(); } catch (_) {} return 0; }, clearTimeout: noop, setInterval: () => 0,
    IntMapModules: {}, IntMapGeoEngine: E.eng, IntMapTime: { on: noop }, _applyBorders: noop,
    document: {
      getElementById: () => null,
      createElement: () => { const el = {}; queueMicrotask(() => { try { el.onerror && el.onerror(); } catch (_) {} }); return el; },
      head: { appendChild: noop }, documentElement: { setAttribute: noop },
    },
    navigator: { language: 'en' },
  };
  win.window = win;
  const ctx = vm.createContext(win);
  /* the real registry, the real scales, the real border/coast marks — and all three shipped
     bundles, so every tier of the record answers (CShapes, OpenHistoricalMap, the era sheets). */
  for (const p of ['js/locales/_langs.js', 'js/lang-registry.js', 'js/label-scale.js', 'js/hist-scale.js',
    'js/border-coast.js', 'data/cshapes.js', 'data/hist-borders.js', 'data/hist-eras.js']) vm.runInContext(rd(p), ctx);
  vm.runInContext(rd('js/time-borders.js'), ctx);
  const HOST = { lang: 'en', canDraw: () => true, isMobile: () => false };
  return { mod: ctx.window.IntMapModules.timeBorders(HOST), E, win: ctx.window };
}

/* ── geometry the CHECK owns: what the record says, asked of the record, not of the module ─────── */
const R_KM = 6371.0088, D2R = Math.PI / 180;
/* spherical excess, dλ wrapped — the area a ring covers on the planet */
const ringKm2 = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    let dl = r[i][0] - r[j][0];
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    s += dl * D2R * (2 + Math.sin(r[j][1] * D2R) + Math.sin(r[i][1] * D2R));
  }
  return Math.abs(s / 2) * R_KM * R_KM;
};
/* 3-D mean of the outline, back on the sphere: no antimeridian case to get wrong */
const ringMid = (r) => {
  let x = 0, y = 0, z = 0, n = 0;
  for (const p of r) { const l = p[0] * D2R, q = p[1] * D2R, c = Math.cos(q); x += c * Math.cos(l); y += c * Math.sin(l); z += Math.sin(q); n++; }
  if (!n) return null;
  x /= n; y /= n; z /= n;
  return [Math.atan2(y, x) / D2R, Math.atan2(z, Math.hypot(x, y)) / D2R];
};
const gcKm = (a, b) => {
  const p1 = a[1] * D2R, p2 = b[1] * D2R, dl = (b[0] - a[0]) * D2R, dp = p2 - p1;
  const sp = Math.sin(dp / 2), sl = Math.sin(dl / 2);
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(sp * sp + Math.cos(p1) * Math.cos(p2) * sl * sl)));
};
/* the parts of a geometry — outer ring and its holes — largest first IN SQUARE DEGREES, which is
   the order the module uses to decide which one already carries the name */
const degArea = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(s / 2); };
const partsOf = (geom) => {
  const t = geom && geom.type, cs = geom && geom.coordinates;
  const polys = (t === 'Polygon') ? [cs] : (t === 'MultiPolygon') ? cs : null;
  if (!polys) return [];
  const out = [];
  for (const p of polys) {
    const r = p && p[0];
    if (!r || r.length < 4) continue;
    out.push({ poly: p, deg: degArea(r), km: ringKm2(r), mid: ringMid(r) });
  }
  out.sort((a, b) => b.deg - a.deg);
  return out;
};
/* ray cast against the outer ring, minus any hole it falls in */
const inRing = (x, y, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
  }
  return inside;
};
const inPart = (x, y, poly) => {
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false;
  return true;
};

/* ── the sheets: every tier of the shipped record ──────────────────────────────────────────────── */
const SHEETS = (() => {
  const ys = [];
  for (let y = 1890; y <= 2010; y += 10) ys.push(y);       /* data/cshapes.js */
  for (let y = 1700; y <= 1880; y += 20) ys.push(y);       /* data/hist-borders.js */
  for (const y of [-122999, -3999, -399, 200, 900, 1500]) ys.push(y);   /* data/hist-eras.js */
  return ys;
})();

/* one walk of the record, shared by every check below: the drawn label points beside the parts the
   record says the same names are made of */
const WALK = await (async () => {
  const { mod, E } = loadModule();
  const out = [];
  for (const y of SHEETS) {
    await mod._go(y);
    const lbl = E.labels(), fc = mod.currentFC();
    if (!lbl || !fc) continue;
    const by = new Map();
    for (const f of fc.features) {
      const p = f.properties || {};
      if (p._corrected || !f.geometry) continue;
      const k = String(p.NAME || p.name || '').trim();
      if (!k) continue;
      by.set(k, (by.get(k) || []).concat(partsOf(f.geometry)));
    }
    by.forEach((ps) => ps.sort((a, b) => b.deg - a.deg));
    const pts = new Map();
    for (const f of lbl.features) {
      const k = String((f.properties || {}).NAME || (f.properties || {}).name || '').trim();
      pts.set(k, (pts.get(k) || []).concat([f]));
    }
    out.push({ y, key: mod.current(), parts: by, pts, total: lbl.features.length });
  }
  return out;
})();

test('#R707 the record answered every tier, so the checks below are looking at something', () => {
  assert.equal(WALK.length, SHEETS.length, 'a sheet produced no label collection at all');
  const keys = new Set(WALK.map((s) => String(s.key).replace(/[0-9-]/g, '')));
  assert.ok(keys.has('cs') && keys.has('hb'), 'the CShapes and OpenHistoricalMap tiers did not both answer: ' + [...keys].join('/'));
  assert.ok(WALK.some((s) => s.parts.size > 60), 'no sheet decoded to a plausible number of polities');
});

/* ── ① the label that existed before has not moved ─────────────────────────────────────────────── */
test('R707 ①: every name still has its old anchor — the pole of its largest part, to the digit', () => {
  let checked = 0;
  const nameless = [];
  for (const sh of WALK) {
    for (const [nm, ps] of sh.parts) {
      if (!ps.length) continue;
      const got = sh.pts.get(nm);
      if (!got || !got.length) { nameless.push(sh.y + ' ' + nm); continue; }
      /* #R520's rule: one point, inside the largest part. It must still be among the points, and
         it must be the FIRST of them — the order is what a reader's collision sees first. */
      const [x, y] = got[0].geometry.coordinates;
      assert.equal(got[0].geometry.type, 'Point', sh.y + ': ' + nm + ' is not a Point');
      assert.ok(inPart(x, y, ps[0].poly),
        sh.y + ': ' + nm + "'s first anchor is no longer inside its largest part (" + x.toFixed(2) + ',' + y.toFixed(2) + ')');
      checked++;
    }
  }
  assert.ok(checked > 2000, 'only ' + checked + ' names were examined');
  /* ⚠ NOT «few»: NONE. Every name the record draws with at least one usable ring is labelled.
     (Two names in the bundles — «Hindu states» at 900 and «Bahmani Kingdom» at 1500 — are drawn
     with no ring of four points at all, so neither the module nor the loop above ever sees a part
     for them; they were unlabelled before this round for the same reason.) */
  assert.equal(nameless.length, 0, 'names with geometry and no label at all: ' + nameless.join(', '));
});

test('R707 ①: a polity the record draws in one piece still gets exactly one label', () => {
  let single = 0;
  for (const sh of WALK) {
    for (const [nm, ps] of sh.parts) {
      if (ps.length !== 1) continue;
      single++;
      assert.equal((sh.pts.get(nm) || []).length, 1,
        sh.y + ': ' + nm + ' is one polygon and got ' + (sh.pts.get(nm) || []).length + ' labels');
    }
  }
  assert.ok(single > 1000, 'only ' + single + ' single-part polities were examined');
});

/* ── ② one name never lands twice on the same ground, and never off its own ────────────────────── */
test('R707 ②: no part carries two of a polity\'s names, and no name stands off its polity', () => {
  let extra = 0;
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      const ps = sh.parts.get(nm);
      assert.ok(ps, sh.y + ': ' + nm + ' was labelled but the record holds no geometry for it');
      const used = [];
      for (const f of pts) {
        const [x, y] = f.geometry.coordinates;
        const hit = ps.findIndex((p) => inPart(x, y, p.poly));
        assert.ok(hit >= 0, sh.y + ': ' + nm + ' is labelled at ' + x.toFixed(2) + ',' + y.toFixed(2) + ' — a point that is not inside it');
        assert.ok(used.indexOf(hit) < 0, sh.y + ': ' + nm + ' put two labels on the SAME part');
        used.push(hit);
      }
      if (pts.length > 1) extra += pts.length - 1;
    }
  }
  assert.ok(extra > 0, 'no polity anywhere in the record got a second chance — check ③ would be vacuous');
});

/* ── ③ the defect itself: a huge territory far from the body that names it ─────────────────────── */
test('R707 ③: where the RECORD puts a vast territory far from its polity, the polity gets another chance', () => {
  /* The situation is described in the record's own terms and NOT in the module's: a part of at
     least a million square kilometres whose centre stands more than 3,000 km from the centre of
     the part that carries the name. Both numbers are far above anything the module tests, so this
     check states the DEFECT, not the rule that answers it — it stays true for any rule that fixes
     the defect, and false for the one-point-per-name rule that did not. */
  const HUGE_KM2 = 1e6, FAR_KM = 3000;
  const found = [];
  for (const sh of WALK) {
    for (const [nm, ps] of sh.parts) {
      const main = ps[0];
      if (!main || !main.mid) continue;
      for (let i = 1; i < ps.length; i++) {
        const p = ps[i];
        if (!p.mid || p.km < HUGE_KM2 || gcKm(p.mid, main.mid) < FAR_KM) continue;
        found.push(sh.y + ' ' + nm);
        assert.ok((sh.pts.get(nm) || []).length > 1,
          sh.y + ': ' + nm + ' spreads ' + Math.round(p.km).toLocaleString() + ' km² over '
          + Math.round(gcKm(p.mid, main.mid)).toLocaleString() + ' km and still has one label');
        break;
      }
    }
  }
  assert.ok(found.length >= 3,
    'the record holds ' + found.length + ' such territories — this check saw too few to be measuring anything (#R699)');
});

/* ── ④ and nothing small buys a name ───────────────────────────────────────────────────────────── */
test('R707 ④: a small island never gets a name of its own, and no sheet fills up with names', () => {
  /* 200,000 km² is BELOW the module's own floor on purpose: this check is not a copy of that number
     but a statement about what must never happen, and it would catch the #R520 thicket whatever the
     floor were set to. Every island named in that report is far under it — Hokkaidō 78,061 km²,
     Ireland 83,362, Luzon 94,455, Newfoundland 109,970, the South Island 113,916. */
  const SMALL_KM2 = 200000;
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      if (pts.length < 2) continue;
      const ps = sh.parts.get(nm);
      for (let k = 1; k < pts.length; k++) {
        const [x, y] = pts[k].geometry.coordinates;
        const p = ps.find((q) => inPart(x, y, q.poly));
        assert.ok(p && p.km >= SMALL_KM2,
          sh.y + ': ' + nm + ' took a second name onto a part of ' + Math.round((p && p.km) || 0).toLocaleString() + ' km²');
      }
    }
  }
  /* …and the thicket is bounded from both ends. MEASURED over the three bundles at 120 sheets: no
     polity anywhere reaches five labels, and the worst sheet gains 7 points on 163 names. The
     per-sheet allowance is written as a floor plus a share because the deep sheets are tiny —
     world_bc123000 names three polities and two of them straddle continents. */
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      assert.ok(pts.length <= 4,
        sh.y + ': ' + nm + ' has ' + pts.length + ' labels — that is the thicket #R520 was reported for');
    }
    assert.ok(sh.total - sh.parts.size <= 3 + sh.parts.size * 0.05,
      sh.y + ': ' + sh.total + ' labels for ' + sh.parts.size + ' polities — the sheet is filling up with names');
  }
});

/* ── ④b an added name stands CLEAR of the territory that already carries it ────────────────────── */
test('R707 ④: a second name never lands on a territory the first one already reaches across', () => {
  /* ⚠ THIS IS NOT THE MODULE'S RULE WRITTEN TWICE (#R536). The module requires the two centres to
     stand apart by the sum of BOTH radii; this requires only the FIRST — a strictly weaker
     statement, which any correct implementation satisfies and which a spacing-blind one does not.
     What it rules out is the shape #R520 was reported for: an island of a country's own
     archipelago taking a second copy of the country's name. Baffin Island's centre is 1,099 km
     from the centre of the Canadian mainland, whose equal-area radius is 1,606 km — it is inside
     the body that already carries «Canada», and stays unnamed. */
  let judged = 0;
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      if (pts.length < 2) continue;
      const ps = sh.parts.get(nm);
      const seen = [];
      for (const f of pts) {
        const [x, y] = f.geometry.coordinates;
        const p = ps.find((q) => inPart(x, y, q.poly));
        if (!p || !p.mid) continue;
        for (const q of seen) {
          assert.ok(gcKm(p.mid, q.mid) > Math.sqrt(q.km / Math.PI),
            sh.y + ': ' + nm + ' put a second name ' + Math.round(gcKm(p.mid, q.mid)).toLocaleString()
            + ' km away, inside the reach of a territory of ' + Math.round(q.km).toLocaleString() + ' km² that already had it');
          judged++;
        }
        seen.push(p);
      }
    }
  }
  assert.ok(judged > 20, 'only ' + judged + ' pairs of same-name labels were weighed');
});

/* ── ⑤ every point of a name is still the same feature, in its own object ──────────────────────── */
test('R707 ⑤: the added points read exactly what the first one does, and own their properties', () => {
  let pairs = 0;
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      if (pts.length < 2) continue;
      for (let k = 1; k < pts.length; k++) {
        /* `_same` chooses WHICH of the two layers draws it, `_locName`/`_modName` are the words,
           `NAME`/`_gw` are what `_clk` resolves — a second point that disagreed on any of them
           would open a different country from the one the reader tapped. */
        assert.deepEqual(pts[k].properties, pts[0].properties, sh.y + ': ' + nm + ' point ' + k + ' says something else');
        assert.notEqual(pts[k].properties, pts[0].properties,
          sh.y + ': ' + nm + ' point ' + k + ' SHARES the properties object — #R520 ② is why that must not happen');
        pairs++;
      }
    }
  }
  assert.ok(pairs > 0, 'no polity had a second point, so nothing was compared');
});
}

/* ═══════════════════════ #R711 · from r711-boundary-country-refresh-checks.test.mjs ═══════════════════════ */
/* The actual country module must consume the detail loader's arrival notification.
 * A reader test calling lineGeom itself cannot catch a missing source repaint. */
{
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function harness(global,years){
 const sources=new Map(),layers=new Map(),writes=[],callbacks=[],detail=new Map();
 const rings=[0,10].map(x=>[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]);
 const d={rings,feats:years.map((y,i)=>[global==='__HISTB'?{en:'Unit '+i}:'Unit '+i,i+1,y,1,1,y+9,12,31,[[i]]])};
 const geometry=(idx)=>({type:'MultiLineString',coordinates:[detail.get(idx)||rings[idx]]});
 const bc={load:async()=>({}),marks:()=>[1,1],onArrive:cb=>callbacks.push(cb),lineGeom:(_d,i)=>geometry(i),wholeLines:fc=>({type:'FeatureCollection',features:fc.features.map(f=>({type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:f.geometry.coordinates}}))})};
 const noop=()=>{};
 const w={window:null,[global]:d,IntMapModules:{},IntMapBorderCoast:bc,
  IntMapTime:{on:noop},addEventListener:noop,setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,
  _applyBorders:noop,navigator:{language:'en'},
  document:{getElementById:()=>null,createElement:()=>({}),head:{appendChild:noop},documentElement:{setAttribute:noop}},
  IntMapGeoEngine:{hasRenderer:()=>true,ready:()=>true,
   layers:{hasSource:id=>sources.has(id),addSource:(id,s)=>sources.set(id,s.data),setSourceData:(id,s)=>{sources.set(id,s);writes.push(id);},has:id=>layers.has(id),get:id=>layers.get(id),add:l=>layers.set(l.id,l),setLayout:noop,setPaint:noop,getLayout:()=>undefined,move:noop},
   events:{on:noop,onLayer:noop,clickLayers:()=>[]},coords:{queryRenderedFeatures:()=>[]},render:{canvas:()=>({style:{}})}
  }
 };
 w.window=w;const ctx=vm.createContext(w);
 for(const p of ['js/locales/_langs.js','js/lang-registry.js','js/label-scale.js','js/hist-scale.js','js/time-borders.js'])vm.runInContext(read(p),ctx);
 const mod=w.IntMapModules.timeBorders({lang:'en',canDraw:()=>true,isMobile:()=>false});
 return {mod,sources,writes,rings, async arrive(idx){const r=rings[idx];detail.set(idx,[r[0],[r[0][0]+0.5,0.0002],...r.slice(1)]);await Promise.resolve();callbacks.forEach(cb=>cb());},fine:idx=>detail.get(idx)};
}
for(const [global,years] of [['__HISTB',[1840,1850]],['__CSHAPES',[1890,1900]]]){
 test('#R711 '+global+': arrival repaints current line without resetting territory, labels or clock',async()=>{
  const h=harness(global,years);await h.mod._go(years[0]+2);
  assert.ok(h.sources.get('imtb-ln-src')?.features.length,'country line was initially drawn');
  const territory=h.sources.get('imtb-src'),labels=h.sources.get('imtb-lbl-src'),current=h.mod.currentFC(),date=h.mod.current();
  h.writes.length=0;await h.arrive(0);
  assert.deepEqual(h.writes,['imtb-ln-src']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sources.get('imtb-ln-src').features[0].geometry.coordinates)),[h.fine(0)]);
  assert.equal(h.sources.get('imtb-src'),territory);assert.equal(h.sources.get('imtb-lbl-src'),labels);
  assert.equal(h.mod.currentFC(),current);assert.equal(h.mod.current(),date);
 });
 test('#R711 '+global+': a reply from the prior date never restores the prior territory',async()=>{
  const h=harness(global,years);await h.mod._go(years[0]+2);await h.mod._go(years[1]+2);
  const current=h.mod.currentFC(),territory=h.sources.get('imtb-src'),labels=h.sources.get('imtb-lbl-src');
  h.writes.length=0;await h.arrive(0);
  assert.deepEqual(h.writes,['imtb-ln-src']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sources.get('imtb-ln-src').features[0].geometry.coordinates)),[h.rings[1]]);
  assert.equal(h.mod.currentFC(),current);assert.equal(h.sources.get('imtb-src'),territory);assert.equal(h.sources.get('imtb-lbl-src'),labels);
  h.mod._clear();h.writes.length=0;await h.arrive(1);assert.deepEqual(h.writes,[],'Now remains empty after late arrival');
 });
}
}

/* ═══════════════════════ #R253 · from r253-checks.test.mjs ═══════════════════════ */
/* (#R253 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{

/* ── ③ THE COPY BUTTON SAYS WHAT IT COPIES ──────────────────────────────────────────────────── */
/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R253 ③ the place popup copies the NAME, and says so in every language', () => {
  const ui = code(read('js/map-ui.js'));
  assert.match(ui, /class="plc-copy"[^>]*>\$\{window\.IntMapLang\.t\(HOST\.lang,'Copy name'/,
    'the copy button is back to a bare “Copy” — it must name what it copies');
  /* the four languages whose translations live in a table rather than in the argument list */
  for (const f of ['ui.fr.js', 'ui.ko.js', 'ui.zh.js', 'ui.zh-hans.js']) {
    assert.match(read(join('js', 'locales', f)), /["']Copy name["']\s*:/,
      `js/locales/${f} has no “Copy name” — that language shows the button in English`);
  }
  /* zh-Hans is DERIVED (#R224), so the authored side must carry it too or the next rebuild drops it */
  assert.match(read('scripts/zh/22-inline-r253.json'), /"Copy name"/,
    'the Traditional translation is only in the generated file — a rebuild of ui.zh.js would lose it');
});

/* ── ⑦ THE FACE FOLLOWS THE LABEL ───────────────────────────────────────────────────────────── */
test('#R253 ⑦ the CJK face is chosen per label, and the renderer is told which family a stack means', () => {
  const pl = code(read('js/place-labels.js'));

  /* (tests-by-topic) js/map-typography.js is RUN below (typography()), once per registered language,
     with <html lang> set to the TAG the document really carries. */
  /* the language is the APP's code, read back from the one registry list — not the BCP-47 tag */
  const ja = typography('ja');
  ja.T.placeFont();
  assert.deepEqual(ja.keysAskedFor, ['jp'],
    'the html tag is no longer walked back through IntMapLang.LANGS — 「ja」 reached the name-key table instead of 「jp」 '
    + '(window.IM_HOST does not exist; document.documentElement.lang is the tag, not the app code)');

  /* the choice itself, and the fact that a Latin UI is not exempt from it */
  const pf = ja.T.placeFont();
  assert.ok(Array.isArray(pf), 'placeFont is gone');
  assert.equal(pf[0], 'case', 'placeFont no longer emits a per-feature case');
  assert.deepEqual(JSON.parse(JSON.stringify(pf[1])), ['any', ['has', 'name:ja']],   /* (another realm's arrays) */
    'the condition is a second copy of the language→key list instead of the one place-labels builds text-field from');
  for (const tag of ['zh-Hant', 'zh-Hans', 'en', 'fr']) {
    const e = typography(tag).T.placeFont();
    assert.equal(e[0], 'case', `${tag}: the Chinese settings are exempted again — Noto Sans TC cannot draw 区/渋/峠, so a Japanese place `
      + 'name under a Traditional UI goes back to two faces');
  }

  /* ⚠ THE STACK NAME IS THE DELIVERY MECHANISM, so every face this can emit must be a REAL CSS
     family. MapLibre builds the rasteriser with `_createTinySDF(stack)` for any stack that is not
     the style-spec default, i.e. it reads the name as a font-family list — which is why the old
     «Noto Sans Regular» drew CJK from the system font. A name nobody has installed silently brings
     that defect straight back. Every face is collected from what the module RETURNS, per language. */
  const faces = new Set();
  for (const l of ja.L.LANGS) {
    const t = typography(l.html);
    for (const f of t.T.readerFont()) faces.add(f);
    const e = t.T.placeFont();
    for (const f of e[2][1].concat(e[3][1])) faces.add(f);
  }
  assert.ok(faces.size, 'placeFont/readerFont name no font families at all');
  for (const f of faces) {
    assert.ok(!/^Noto Sans (Regular|Italic)$/.test(f),
      `«${f}» is a glyph-server stack name, not an installed font family — MapLibre would rasterise CJK `
      + 'from the system sans-serif with it');
  }
  /* the families that are not bundled have to be the ones the page actually requests.
     (startup-lazy-layers) RUN, per language: js/map-typography.js `webFonts()` is what asks Google
     Fonts for them now (index.html no longer carries a render-blocking <link> for all three), so every
     Noto face a language's labels can emit must be in THAT language's request — otherwise the family
     named in text-font would not exist on that reader's page. */
  for (const l of ja.L.LANGS) {
    const t = typography(l.html);
    const asked = new Set(t.T.webFonts().map((w) => w.family));
    const e = t.T.placeFont();
    for (const f of t.T.readerFont().concat(e[2][1], e[3][1])) {
      if (/^Noto Sans /.test(f)) assert.ok(asked.has(f), `${l.html}: labels are drawn in «${f}» and the page never requests it`);
    }
    for (const w of t.T.webFonts()) assert.match(w.href, /^https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+(JP|SC|TC):wght@400;500;600;700&display=swap$/);
  }
  /* …and a family no label on this reader's map can use is not requested (TC was 480 kB of rules on every page) */
  assert.ok(!typography('ja').T.webFonts().some((w) => w.family === 'Noto Sans TC'), 'a Japanese page asks for Noto Sans TC again');
  assert.doesNotMatch(read('index.html'), /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/,
    'the Noto rule sheets are render-blocking again (1.39 MB of CSS before the first paint)');

  /* the layers use it, and re-apply it when the language changes */
  /* spelling kept: js/place-labels.js builds its layers inside the label factory against the live renderer; which font expression it passes is read off its text. */
  assert.match(pl, /const FONT=MT\(\)\.placeFont\(\)/, 'the place layers no longer name their own faces');
  assert.match(pl, /setLayout\(id,'text-font',fontExpr\)/, 'applyLabelLang does not re-apply the face with the language');
  assert.match(pl, /'text-font':FONTSEA/, 'the sea gazetteer no longer takes the reader’s own stack');

  /* …and a stack name that is a font family must still resolve to a real glyph URL: `text-font`
     doubles as the {fontstack} of every non-locally-rasterised range (Arabic, Thai, Devanagari…).
     (tests-by-topic) asked of glyphRewrite() itself, with the URLs MapLibre builds. */
  const cjk = ja.T.glyphRewrite('https://tiles.openfreemap.org/fonts/Noto%20Sans%20JP%2CNoto%20Sans%20SC/12288-12543.pbf', 'Glyphs');
  assert.ok(cjk && cjk.url, 'the glyph rewrite no longer folds the new stack names onto a stack the tile server serves');
  assert.equal(cjk.url, 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/12288-12543.pbf', 'the upstream stack is not named in the rewrite');
  const latin = ja.T.glyphRewrite('https://tiles.openfreemap.org/fonts/Noto%20Sans%20JP/0-255.pbf', 'Glyphs');
  assert.match(latin.url, /^https:\/\/example\.invalid\/app\/fonts\/Inter%20Regular\/0-255\.pbf$/, 'a Latin range still comes from this origin’s own atlas');
  assert.equal(ja.T.glyphRewrite('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/12288-12543.pbf', 'Glyphs'), undefined,
    'a stack the server already serves is left alone');
});
}

/* ═══════════════════════ #R309 · from r309-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R309 — source-level checks
 * ----------------------------------------------------------------------------
 *  Seven reports in one message:
 *    ①「CountriesのGDP/Descendingの行、フロストガラスにしたら四角の不要な背景が出てくる。消して。」
 *    ②「昔の国の国名ラベルを、今とおなじでクリック可能にして。そして、昔の国名ラベルの見た目や
 *        挙動も今の国名ラベルと完全に同じに。」
 *    ③「Atlasにはプリセットの送信文が用意されていますが、それは今地図で見ている地域に応じて
 *        用意して変えるようにして。」
 *    ④「フロストガラス時のAtlasの入力欄が、フロストガラスになっていない。（News, Companies,
 *        Countriesの検索欄も）」
 *    ⑤「フロストガラス時に、サイドバーを左右両方開けると、地名検索バーが潰れる。」
 *    ⑥「Base map & labelsは、タイル形式ではなく、トグルで行で並べる形式に。サムネイル画像は
 *        いらない。あと、Base map & labelsのオン数をレイヤーのオン数にみなすな。」
 *    ⑦「『レイヤーサムネイル』フォルダに、各レイヤー用のサムネイル画像を入れておいたので、
 *        それをすべて使って実際にレイヤータイルにいれてください。」
 *
 *  ⚠ EVERY ASSERTION BELOW IS A RELATION BETWEEN TWO PLACES IN THE REPOSITORY, NOT A SPELLING.
 *  Twenty-four rounds running, a legitimate change here has been turned red by a check that pinned a
 *  literal — #R306's own ⑥ pinned a character-counted window that CRLF pushed 11 bytes wider, so CI
 *  was green and Windows was red. So: ② asks 「is the era label the same VALUES as ofm-country」 by
 *  reading BOTH layer definitions, ⑥ asks 「does every counter subtract the SAME published list」,
 *  and ⑦ asks the file system and the module about each other. None of them can be satisfied by
 *  copying a number into this file, and none of them notices a reworded comment.
 * ==========================================================================*/
{
/* the comments in this project carry the reasoning, and several of them QUOTE the spellings that
   were replaced — a check that greps them proves nothing (23 rounds of exactly that) */
const code = (p) => codeOnly(read(p));

/* the body of a named function declaration, brace-balanced (#R228 / #R307) */
function fnBody(src, name) {
  /* the three shapes this repository declares a function in — a declaration, a property assignment
     and an arrow — so a check does not go red because the author picked a different one */
  let start = src.indexOf('function ' + name + '(');
  if (start < 0) { const m = new RegExp('\\b' + name + '\\s*=\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>)').exec(src); if (m) start = m.index; }
  assert.notEqual(start, -1, 'a function called ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
/* the brace-balanced object literal a layer is DEFINED by: `{id:'<layerId>', … }` */
function layerDef(src, id) {
  const start = src.indexOf("{id:'" + id + "'");
  assert.notEqual(start, -1, "the layer definition for '" + id + "' exists");
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces in the definition of ' + id);
}
/* one `'<key>':<value>` out of a layer definition, as source text */
function prop(def, key) {
  const m = new RegExp("'" + key + "':\\s*([^,}]+)").exec(def);
  return m ? m[1].trim() : null;
}

/* ══ ② 昔の国名ラベルは、現代の国名ラベルと「同じラベル」である ═══════════════════════════════
   The report is two halves — clickable, and identical to look at — and the second half is the one a
   check can hold. Both definitions are read here, so the day somebody restyles ofm-country the era
   labels are required to move with it. */
const PL = code('js/place-labels.js');
const TB = code('js/time-borders.js');
const MODERN = layerDef(PL, 'ofm-country');
const ERA = ['imtb-lbl', 'imtb-lbl2'].map((id) => ({ id, def: layerDef(TB, id) }));

/* spelling kept: browser script (js/place-labels.js, js/time-borders.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ② the era country labels carry the same values as ofm-country', () => {
  /* the plain values: whatever ofm-country says, both era layers must say */
  for (const key of ['text-letter-spacing', 'text-max-width', 'text-padding', 'text-color', 'text-halo-color', 'text-halo-width']) {
    const want = prop(MODERN, key);
    assert.ok(want, 'ofm-country declares ' + key);
    for (const e of ERA) {
      assert.equal(prop(e.def, key), want, e.id + ' uses ofm-country\'s ' + key + ' (' + want + ')');
    }
  }
  /* the size RAMP is a call into js/label-scale.js — the two files spell the module differently
     (`LS` vs `window.IntMapLabelScale`), so compare the ARGUMENT, which is the tier being asked for */
  const tier = (def) => { const m = /place\('([a-z]+)'\)/.exec(prop(def, 'text-size') || ''); return m && m[1]; };
  assert.equal(tier(MODERN), 'country', 'ofm-country asks IntMapLabelScale for the country tier');
  for (const e of ERA) assert.equal(tier(e.def), tier(MODERN), e.id + ' asks for the same label tier');
});

/* spelling kept: browser script (js/place-labels.js, js/time-borders.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ② the era labels open at the same zooms as ofm-country', () => {
  const zoomOf = (def, k) => { const m = new RegExp('\\b' + k + ':\\s*([0-9.]+)').exec(def); return m ? Number(m[1]) : null; };
  const maxz = zoomOf(MODERN, 'maxzoom');
  assert.equal(maxz, null, 'country names remain eligible when zooming in');
  for (const e of ERA) {
    assert.equal(zoomOf(e.def, 'maxzoom'), maxz, e.id + ' shares the modern country zoom range');
    /* ofm-country has no floor, so neither may they — a floor is what made the past disappear at
       world zoom while the present kept its names */
    assert.equal(zoomOf(MODERN, 'minzoom'), null, 'ofm-country has no minzoom');
    assert.equal(zoomOf(e.def, 'minzoom'), null, e.id + ' has no minzoom either');
  }
});

/* spelling kept: browser script (js/place-labels.js, js/time-borders.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ② the era labels get a REAL font family, and the basemap re-paints them', () => {
  /* js/map-typography.js records that «Noto Sans Regular» is not an installed family and that
     MapLibre 5 therefore rasterises it through sans-serif. Neither era label may name it. */
  for (const e of ERA) assert.ok(!/Noto Sans Regular/.test(e.def), e.id + ' does not ask for the retired stack');
  /* …and the face they DO ask for is the one for text already in the reader's language */
  assert.ok(/readerFont\(\)/.test(TB), 'js/time-borders.js takes its face from IntMapMapTypography.readerFont()');
  /* the colours above are the birth values; the basemap swap is what keeps them true afterwards */
  const body = fnBody(PL, 'applyLabelLang');
  for (const e of ERA) assert.ok(body.includes(e.id), 'applyLabelLang re-paints ' + e.id + ' with the rest of the country labels');
});

/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ② an era-label click says that it is spoken for', () => {
  /* THE root cause: js/map-ui.js's generic fallback calls clearHL() — which removes the popup —
     whenever the tap missed everything in ALL_LBL, and it runs in a microtask, i.e. always after
     this synchronous handler. #R210 built claimClick/clickClaimed for exactly this collision. */
  const opener = fnBody(TB, '_openEra');
  assert.ok(/claimClick\(/.test(opener), 'the era opener claims the click');
  assert.ok(/_imPlacePopup\(/.test(opener), 'the era opener still opens the shared place popup');
  /* and the per-layer handler goes through that one door rather than repeating its body */
  assert.ok(/_openEra\(/.test(TB.slice(TB.indexOf('const _clk='), TB.indexOf('const _clk=') + 1600)), 'the per-layer click calls the opener');
  /* the fallback it has to survive is still the one described above */
  const MU = code('js/map-ui.js');
  assert.ok(/clickClaimed/.test(MU), 'js/map-ui.js still steps aside for a claimed click');
});

/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ② the era labels have the padded tap the modern labels have', () => {
  /* js/map-ui.js has given every place label a padded hit-box since #R23 because "a finger tap
     almost never lands on the exact label glyph". Read ITS radii and require the same two.
     ⚠ (#R668) how much slop a tap needs is a question about the POINTER — not about the window's
     width and not about the device either (a touchscreen laptop's primary pointer really is a
     mouse). js/map-ui.js asks `_imTouchPrimary()` now, so the radii are read from the branches of
     THAT question; the two numbers are unchanged. */
  const MU = code('js/map-ui.js');
  const pads = [...MU.matchAll(/_imTouchPrimary\(\)[^?]*\?\s*(\d+)\s*:\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(pads.length, 'js/map-ui.js declares a touch radius and a mouse radius, chosen by the pointer');
  const [touch, mouse] = pads[0];
  const era = TB.slice(TB.indexOf("['imtb-lbl','imtb-lbl2'].forEach"));
  assert.ok(/queryRenderedFeatures\(\[\[/.test(era), 'the era labels are queried with a BOX, not only a point');
  assert.ok(new RegExp('pad\\s*=\\s*' + mouse + '\\b').test(era), 'the era mouse radius is the one map-ui uses (' + mouse + ')');
  assert.ok(new RegExp('pad\\s*=\\s*' + touch + '\\b').test(era), 'the era touch radius is the one map-ui uses (' + touch + ')');
  /* ⚠ (#R668) "the same padded tap" is two facts, not one: the same radii AND the same question. An
     era label that asked the width while map-ui asked the pointer would be back to a 6 px box on a
     phone in landscape — the defect this round found — with both numbers still matching. */
  assert.ok(/_imTouchPrimary/.test(era), 'the era labels ask the same pointer question map-ui asks');
});
}
