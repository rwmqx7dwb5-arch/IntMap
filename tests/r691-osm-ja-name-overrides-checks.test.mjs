/* ══ IntMap · R691 — a `name:ja` is not automatically a Japanese name ═══════════════════════════
   Reported with a screenshot of Adana: every neighbourhood labelled with its Turkish words
   translated into kanji (平和 for Barış, 征服者 for Fatih, 良癖 for Yüreğir, 強川 for Seyhan).
   js/place-labels.js now REFUSES the recorded pairs and falls through its own key chain.

   ⚠ EVERY ASSERTION BELOW EVALUATES SOMETHING. Reading the source would prove that a table exists,
   which is the one thing that was never in doubt; what has to be true is that the expression the
   renderer is handed produces «Yüreğir» and that the popup beside it produces the same string.
   [[intmap-edge-function-must-be-evaluated]] and #R505 are the standing form of this.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { asClassicScript } from './app-source.mjs';
import { isRefusable, stripGenericTail, isLatinName, KEEP, FIELD } from '../scripts/build-osm-ja-rejects.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the module, run, with a renderer stub that records what `text-field` it is handed ─────────── */
function bootPlaceLabels(lang) {
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
  api.ensurePlaceLabels();           /* this is what publishes the resolver the popup asks */
  api.applyLabelLang();
  const field = setLayout.filter((s) => s.prop === 'text-field' && s.id === 'ofm-city').pop();
  assert.ok(field, 'applyLabelLang set no text-field on ofm-city — the stub is wrong, not the code');
  return { ctx, expr: field.val };
}

/* MapLibre's own parser, then MapLibre's own evaluator. A `match` with a repeated branch label is
   not a wrong answer, it is a REJECTED STYLE (#R211/#R427) — only this can say so. */
const compiled = new Map();
function compile(e) {
  if (compiled.has(e)) return compiled.get(e);
  const c = createExpression(e, { type: 'string', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  if (c.result !== 'success') assert.fail('MapLibre rejected the label expression: ' + JSON.stringify(c.value.map((x) => x.message)));
  compiled.set(e, c.value);
  return c.value;
}
const draw = (expr, properties) => compile(expr).evaluate({ zoom: 12 }, { type: 1, properties });

const JP = bootPlaceLabels('jp');
const EN = bootPlaceLabels('en');
/* the shipped rows, read as the PACKED records they are — `name|name:ja`, one per upstream
   record, which is why the i18n pair audit sees a key and not a translation (#R251's PACKED). */
const TABLE = [...rd('js/place-labels.js').matchAll(/\n {4}("(?:[^"\\]|\\.)*")/g)]
  .map((m) => JSON.parse(m[1]).split(FIELD));

/* ══ ① THE REPORTED LABELS ══════════════════════════════════════════════════════════════════════
   The four the reader photographed, plus the two the same account wrote in the same style. Each is
   asserted as the STRING THE RENDERER PRODUCES, not as a row in a table. */
test('① a refused name:ja falls through to the endonym, in the renderer', () => {
  const cases = [
    ['Seyhan', '強川', 'Seyhan'], ['Yüreğir', '良癖', 'Yüreğir district'],
    ['Sarıçam', '黄松', 'Sarıçam district'], ['Barış', '平和', null],
    ['Fatih', '征服者', null], ['Yenibaraj', '新弾幕', null]
  ];
  for (const [name, ja, en] of cases) {
    const p = { name, 'name:ja': ja };
    if (en) p['name:en'] = en;
    assert.equal(draw(JP.expr, p), en || name,
      `a Japanese reader still sees 「${ja}」 for ${name} — the refusal did not reach the renderer`);
  }
});

/* ══ ② IT IS A REFUSAL, NOT A CORRECTION ════════════════════════════════════════════════════════
   IntMap does not know what Kabasakal is called in Japanese. The point of the fallback is that the
   label is the one every other Turkish place without a `name:ja` already gets — so nothing here may
   ever start asserting an invented transliteration. */
test('② nothing invents a Japanese name', () => {
  for (const [name, ja] of TABLE) {
    const out = draw(JP.expr, { name, 'name:ja': ja });
    assert.equal(out, name, `${name} resolved to 「${out}」`);
    assert.ok(!/[぀-ヿ]/.test(out), `${name} was given an invented kana reading: ${out}`);
  }
});

/* ══ ③ ⚠⚠⚠ THE TABLE EXPIRES BY ITSELF ═════════════════════════════════════════════════════════
   This is the whole reason a case-by-case list is allowed to exist here at all
   (.agents/rules/no-ad-hoc-hardcoding.md §6 wants the condition that removes it). The runtime
   matches the WHOLE pair, so the day OSM carries a different `name:ja` the row goes inert and the
   new upstream value is used with no edit here — which is exactly what already happened to
   `Adana → 亜駄名` and `Toros → 強山` between the report and the sweep. */
test('③ a repaired upstream value is used, with no edit to the table', () => {
  assert.equal(draw(JP.expr, { name: 'Seyhan', 'name:ja': 'セイハン' }), 'セイハン',
    'a corrected name:ja is still being refused — the table matches on the name alone');
  assert.equal(draw(JP.expr, { name: 'Adana', 'name:ja': 'アダナ' }), 'アダナ');
  assert.equal(draw(JP.expr, { name: 'Toros', 'name:ja': 'トロス' }), 'トロス');
  assert.ok(!TABLE.some(([n]) => n === 'Adana' || n === 'Toros'),
    'the sweep listed a pair upstream has already repaired');
});

/* ══ ④ EVERY OTHER LABEL IN THE WORLD IS UNTOUCHED ══════════════════════════════════════════════ */
test('④ the refusal changes nothing else', () => {
  assert.equal(draw(JP.expr, { name: '東京', 'name:ja': '東京都' }), '東京都');
  assert.equal(draw(JP.expr, { name: 'İstanbul', 'name:ja': 'イスタンブール' }), 'イスタンブール');
  assert.equal(draw(JP.expr, { name: 'Ceyhan', 'name:ja': 'ジェイハン' }), 'ジェイハン');
  assert.equal(draw(JP.expr, { name: 'Adana' }), 'Adana');
  assert.equal(draw(JP.expr, { name: 'Paris', 'name:en': 'Paris', 'name:ja': 'パリ' }), 'パリ');
  /* the refusal is keyed by the FIELD it distrusts, so no other language may lose a name to it */
  assert.equal(draw(EN.expr, { name: 'Seyhan', 'name:ja': '強川', 'name:en': 'Seyhan' }), 'Seyhan');
  assert.equal(draw(EN.expr, { name: 'Barış', 'name:ja': '平和' }), 'Barış');
});

/* ══ ⑤ THE POPUP AND THE CHIPS GIVE THE SAME ANSWER AS THE LABEL ════════════════════════════════
   js/map-ui.js's place popup and js/atlas-view-subject.js's Atlas chips used to loop the published
   KEY ORDER themselves, which was enough while every value could be trusted. A loop cannot know
   about a refusal, so a popup would have printed 「良癖」 beside a label reading Yüreğir. */
test('⑤ the resolver the other two modules ask returns the drawn string', () => {
  const pick = JP.ctx.window.IntMapOsmName;
  assert.equal(typeof pick, 'function', 'js/place-labels.js publishes no IntMapOsmName');
  const keys = JP.ctx.window.IntMapOsmNameKeys('jp');
  for (const p of [{ name: 'Yüreğir', 'name:ja': '良癖', 'name:en': 'Yüreğir district' },
    { name: 'Barış', 'name:ja': '平和' },
    { name: 'Seyhan', 'name:ja': 'セイハン' },
    { name: 'İstanbul', 'name:ja': 'イスタンブール' }]) {
    assert.equal(pick(p, keys), draw(JP.expr, p),
      `the popup and the label disagree about ${p.name}`);
  }
  for (const [file, hook] of [['js/map-ui.js', 'IntMapOsmName'], ['js/atlas-view-subject.js', 'IntMapOsmName']]) {
    assert.ok(rd(file).includes('window.' + hook), `${file} still resolves the name itself`);
  }
});

/* ══ ⑥ THE SHIPPED ROWS ARE WHAT THE CRITERION PRODUCES ═════════════════════════════════════════
   The table is generated, and a hand-edit is the way a generated table stops being an observation.
   Both halves are asserted by EVALUATING the script's own criterion, so the criterion cannot drift
   away from the rows either. */
test('⑥ every shipped row satisfies the sweep criterion, and the exclusions are excluded', () => {
  assert.ok(TABLE.length >= 40, `the table collapsed to ${TABLE.length} rows`);
  for (const [name, ja] of TABLE) {
    assert.ok(isRefusable({ name, 'name:ja': ja, place: 'suburb' }),
      `${name} → ${ja} is in the table but the criterion would not have produced it`);
    assert.ok(!KEEP.has(name + FIELD + ja), `${name} → ${ja} is both refused and excluded`);
    assert.ok(!name.includes(FIELD) && !ja.includes(FIELD), `${name} → ${ja} cannot be packed unambiguously`);
  }
  /* the kinds Japanese really does translate — measured in the same sweep, all correct, all left */
  assert.ok(!isRefusable({ name: 'Karadeniz', 'name:ja': '黒海', place: 'sea' }), '黒海 is the Black Sea');
  assert.ok(!isRefusable({ name: 'Haliç', 'name:ja': '金角湾' }), '金角湾 is the Golden Horn');
  assert.ok(!isRefusable({ name: 'Orta Doğu Teknik Üniversitesi', 'name:ja': '中東工科大学' }));
  assert.ok(!isRefusable({ name: 'Yozgat', 'name:ja': 'ヨズガト県', boundary: 'administrative' }),
    'a transliteration carrying a generic tail was refused');
  assert.ok(!isRefusable({ name: '東京', 'name:ja': '東京都', place: 'city' }), 'criterion 2 lets a CJK name through');
  assert.equal(stripGenericTail('ヨズガト県'), 'ヨズガト');
  assert.equal(stripGenericTail('黒海地方'), '黒海');
  assert.equal(isLatinName('Şambayadı'), true);
  assert.equal(isLatinName('東京'), false);
  /* the exclusion is a judgement, so it must stay a NAMED one rather than a silent tweak */
  for (const [, why] of KEEP) assert.ok(why.length > 40, 'an exclusion carries no reason');
});
