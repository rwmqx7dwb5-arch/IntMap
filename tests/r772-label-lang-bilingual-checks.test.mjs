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
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { asClassicScript } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
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
const NAMELESS_LOCAL = { 'name:en': 'Tokyo' };                 /* a tile row with no `name` at all */
const NO_READER_NAME = { name: 'Kabasakal' };                  /* nothing but the endonym */

const EN_BOTH = boot('en', 'ui+local');
const JP_BOTH = boot('jp', 'ui+local');
const FR_BOTH = boot('fr', 'ui+local');

/* ══ ① THE TWO LINES ════════════════════════════════════════════════════════════════════════════ */
test('① the reader language on line 1, the tile own name on line 2', () => {
  assert.equal(draw(EN_BOTH.get('ofm-city'), TOKYO), 'Tokyo' + NL + '東京');
  assert.equal(draw(JP_BOTH.get('ofm-city'), PARIS), 'パリ' + NL + 'Paris');
  /* the endonym is the SECOND line, never the first: a reader who set English reads English first. */
  assert.equal(draw(EN_BOTH.get('ofm-city'), TOKYO).split(NL)[0], 'Tokyo');
});

/* ══ ② ONE LINE WHEN THE SECOND WOULD SAY THE SAME THING ════════════════════════════════════════
   «Paris / Paris» is the failure this guards, and it is the common case in Europe — not an edge. */
test('② no doubled line when the reader language and the endonym agree', () => {
  assert.equal(draw(EN_BOTH.get('ofm-city'), PARIS), 'Paris');
  assert.equal(draw(FR_BOTH.get('ofm-city'), PARIS), 'Paris');
  /* a feature with no reader-language name falls to `name`, so both halves are the endonym → one line */
  assert.equal(draw(EN_BOTH.get('ofm-city'), NO_READER_NAME), 'Kabasakal');
});

/* ══ ③ NO TRAILING BLANK LINE WHEN THERE IS NO ENDONYM ══════════════════════════════════════════ */
test('③ a row with no name draws one line, not a line and an empty one', () => {
  const s = draw(EN_BOTH.get('ofm-city'), NAMELESS_LOCAL);
  assert.equal(s, 'Tokyo');
  assert.ok(!s.includes(NL), 'the label ends in a newline: ' + JSON.stringify(s));
});

/* ══ ④ THE OTHER THREE MODES ARE UNTOUCHED ══════════════════════════════════════════════════════
   A new option must not be a change to the ones already chosen by readers. */
test('④ ui / local / en still produce exactly one line, unchanged', () => {
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
test('⑤ the second line reaches every layer that draws a tile name', () => {
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
test('⑥ the expression uses no operator the Cesium evaluator refuses', () => {
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
test('⑧ the default mode is ui+local, is offered, and draws two lines', () => {
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
test('⑦ every option in the settings select is a mode that behaves distinctly', () => {
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
