/* ============================================================================
 *  #R738 · 属性値による着色と、登録の失敗が読者に届くこと
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §6 said two things about js/map-ui.js's import path, and this round makes both
 *  of them false:
 *
 *    · 「属性値による着色が無い。取り込みは 8 色パレットの循環 1 色で描かれる。」
 *    · registerDataset() ended in `catch(_){}` — a file could be ON THE MAP and absent from the
 *      analysis registry with nothing anywhere saying so.
 *
 *  ⚠ WHAT THIS FILE MEASURES IS BEHAVIOUR, NOT SPELLING. js/map-ui.js is an ES module that publishes
 *  window.IntMapModules.geojsonUpload, so the SHIPPED closure is evaluated here against a recording
 *  renderer and a stub document, and the assertions are made about what it painted and what it said.
 *  A test that grepped for `'fill-color'` would stay green the day the line layer stopped being
 *  repainted — which is the exact half-done state this round forbids (the failure shape recorded in
 *  [[intmap-r488-lessons]]: a check that fixes a spelling cannot see a dead rule).
 *
 *  ① the colouring reaches ALL THREE layers (fill, line, circle) — none left behind
 *  ② missing values have a colour of their own, and it is not the colour of the first class
 *  ③ 「これは数か」 is answered by IntMapData's one rule, never by a second one written here
 *  ④ registerDataset has no silent catch: every failure path says a sentence to the reader
 *  ⑤ add(fc, name) — the two-argument call js/gis-core.js makes — still behaves as before
 *  ⑥ the classifier is a pure function and can be measured alone (cuts, ties, folding)
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ── the stub world js/map-ui.js's upload closure needs ───────────────────────────────────────
   Only what the closure actually touches: a renderer that RECORDS, a document with no layer
   dropdown (so the button mount returns early), and the language function. */
function stubEl() {
  return { style: {}, value: '', innerHTML: '', type: '', multiple: false,
    addEventListener() { }, appendChild() { }, querySelector: () => null, querySelectorAll: () => [] };
}

function stubRenderer() {
  const R = { sources: new Map(), layers: new Map(), paints: [], removed: [] };
  R.api = {
    hasRenderer: () => true,
    camera: { fitBounds() { } },
    events: { on() { }, once() { } },
    ready: () => true,
    layers: {
      addSource: (id, d) => { R.sources.set(id, d); },
      hasSource: (id) => R.sources.has(id),
      removeSource: (id) => { R.sources.delete(id); },
      has: (id) => R.layers.has(id),
      add: (d) => { R.layers.set(d.id, d); },
      remove: (id) => { R.layers.delete(id); R.removed.push(id); },
      setPaint: (id, prop, value) => { R.paints.push({ id, prop, value }); const L = R.layers.get(id); if (L) L.paint = Object.assign({}, L.paint, { [prop]: value }); },
    },
  };
  return R;
}

let booted = null;
async function boot() {
  if (booted) return booted;
  const toasts = [];
  const warned = [];
  const R = stubRenderer();
  const w = {};
  w.IntMapGeoEngine = R.api;
  w.IntMapLang = {
    /* the real one takes the current language's POSITIONAL index; en+jp is what this round writes */
    t: (lang, ...args) => (lang === 'jp' ? (args[1] || args[0]) : args[0]),
    locale: () => 'en',
  };
  globalThis.window = w;
  globalThis.document = {
    createElement: () => stubEl(),
    body: { appendChild() { } },
    getElementById: () => null,
    addEventListener() { },
  };
  const origWarn = console.warn;
  console.warn = (...a) => { warned.push(a.map(String).join(' ')); };
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const rules = makeGisDatasets();          /* the app's one typing rule — handed to the classifier */
  await import('../js/map-ui.js');
  w.IntMapModules.geojsonUpload({ lang: 'en', imToast: (m) => toasts.push(m) });
  console.warn = origWarn;
  booted = { w, R, rules, toasts, warned, UP: w.GeoJSONUpload };
  return booted;
}

const feat = (props, lng, lat) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lng || 0, lat || 0] } });
const fc = (features) => ({ type: 'FeatureCollection', features });

/* Every paint value the renderer was handed for one import, keyed by layer id. */
function paintsFor(R, sid) {
  const out = new Map();
  for (const p of R.paints) if (p.id.indexOf(sid + '-') === 0) out.set(p.id, p);
  return out;
}

/* Every colour literal inside a MapLibre expression, whatever its shape. */
function coloursIn(expr) {
  const out = [];
  (function walk(x) {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)) out.push(x.toLowerCase());
  })(expr);
  return out;
}

/* ══ ① 着色は 3 枚すべてに届く ═══════════════════════════════════════════════════════════════ */

test('R738 ① an attribute colouring reaches the fill, the line AND the circle layer', async () => {
  const { R, UP } = await boot();
  const put = UP.add(fc([feat({ k: 'a' }), feat({ k: 'b' }), feat({ k: 'a' })]), 'three.geojson');
  assert.ok(put && put.sid, 'add() must report the import it made, so the caller can bind a dataset to it');
  const before = R.paints.length;
  const res = await UP.style(put.n, { field: 'k', mode: 'categorical' });
  assert.equal(res.ok, true, 'a categorical colouring on a present column must be accepted: ' + res.why);

  const painted = paintsFor(R, put.sid);
  /* The layers that exist for this import are the ones that must have been repainted — the set is
     read from the renderer rather than written here, so a fourth layer added later is included. */
  const mine = Array.from(R.layers.keys()).filter((id) => id.indexOf(put.sid + '-') === 0);
  assert.ok(mine.length >= 3, 'an import draws at least three layers');
  for (const id of mine) {
    assert.ok(painted.has(id), 'layer left with its original single colour: ' + id);
    assert.ok(Array.isArray(painted.get(id).value), 'the colouring must be an expression, not one colour: ' + id);
  }
  /* …and they are all the SAME expression: three layers coloured by three rules would be three maps. */
  const exprs = new Set(mine.map((id) => JSON.stringify(painted.get(id).value)));
  assert.equal(exprs.size, 1, 'the three layers must be painted from one expression');
  /* each layer's colour paint property is the one its own type carries */
  const props = new Set(mine.map((id) => painted.get(id).prop));
  assert.equal(props.size, mine.length, 'each layer takes its own colour property');
  assert.ok(R.paints.length > before);

  /* the legend and the map come from the same snapshot: every colour the legend names is in the
     expression the renderer was given, and nothing else is */
  const lg = res.legend;
  const inExpr = new Set(coloursIn(painted.get(mine[0]).value));
  for (const c of lg.classes) assert.ok(inExpr.has(c.color.toLowerCase()), 'legend class colour missing from the map expression: ' + c.color);
  assert.ok(inExpr.has(lg.missing.color.toLowerCase()), 'the legend names a missing colour the map does not use');
});

test('R738 ① a null spec puts the layer back to its single colour', async () => {
  const { R, UP } = await boot();
  const put = UP.add(fc([feat({ k: 'a' }), feat({ k: 'b' })]), 'reset.geojson');
  await UP.style(put.n, { field: 'k', mode: 'categorical' });
  const res = await UP.style(put.n, null);
  assert.equal(res.ok, true);
  assert.equal(res.legend, null);
  assert.equal(UP.styleOf(put.n).legend, null);
  const painted = paintsFor(R, put.sid);
  for (const [, p] of painted) assert.equal(typeof p.value, 'string', 'un-styling must hand back a plain colour');
});

/* ══ ② 欠損は色ではない ════════════════════════════════════════════════════════════════════ */

test('R738 ② missing values get a colour of their own — never the first class colour', async () => {
  const { UP } = await boot();
  const put = UP.add(fc([feat({ v: 10 }), feat({ v: 20 }), feat({}), feat({ v: '' }), feat({ v: 30 })]), 'holes.geojson');
  const res = await UP.style(put.n, { field: 'v', mode: 'graduated', method: 'equal', classes: 3 });
  assert.equal(res.ok, true, res.why);
  const lg = res.legend;
  assert.equal(lg.missing.count, 2, 'both the absent property and the empty cell are missing');
  const classColours = lg.classes.map((c) => c.color.toLowerCase());
  assert.ok(!classColours.includes(lg.missing.color.toLowerCase()), 'missing must not share a colour with a class');
  assert.notEqual(lg.missing.color.toLowerCase(), classColours[0], 'missing painted as the lowest class reads as a zero');
  /* the count of the classes plus the missing count is the number of features — nothing vanished */
  const counted = lg.classes.reduce((s, c) => s + c.count, 0) + lg.missing.count;
  assert.equal(counted, lg.total, 'every feature is in exactly one legend row');
});

test('R738 ② categorical folding states how much it folded, and the fold is not a class colour', async () => {
  const { UP, rules } = await boot();
  /* twelve distinct values against a palette of eight: the remainder must be SAID, not dropped */
  const values = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j <= i; j++) values.push('c' + i);
  const res = UP.classify(values, { field: 'c', mode: 'categorical', color: '#ff9500' }, rules);
  assert.equal(res.ok, true);
  const lg = res.legend;
  assert.ok(lg.other, 'twelve categories and eight colours must produce a fold');
  assert.equal(lg.classes.length + lg.other.distinct, 12, 'no category may be silently dropped');
  const shown = lg.classes.reduce((s, c) => s + c.count, 0);
  assert.equal(shown + lg.other.count + lg.missing.count, values.length, 'the fold carries the features it swallowed');
  assert.equal(new Set(lg.classes.map((c) => c.color)).size, lg.classes.length, 'two classes may not share a colour');
  assert.ok(!lg.classes.some((c) => c.color === lg.other.color), 'the fold is not one of the classes');
  assert.notEqual(lg.other.color, lg.missing.color, '「その他」 and 「値なし」 are different claims');
});

/* ══ ③ 数かどうかは 1 つの規則にしか訊かない ══════════════════════════════════════════════ */

test('R738 ③ numeric typing goes through IntMapData — a leading-zero code column is not a scale', async () => {
  const { UP, rules } = await boot();
  /* MapLibre's own to-number would read "01100" as 1100. IntMapData refuses it (docs/GIS-CORE.md
     §1.1), and a graduated colouring built on it would join a statistic to the wrong municipality. */
  const codes = ['01100', '01101', '01102', '01100'];
  assert.equal(rules.asNumber('01100'), null, 'the app rule refuses a padded numeral');
  const res = UP.classify(codes, { field: 'code', mode: 'graduated' }, rules);
  assert.equal(res.ok, false);
  assert.equal(res.why, 'field-not-numeric');
  assert.ok(String(UP.styleReason(res.why)).length > 0, 'every refusal a reader can reach has a sentence');
  /* the same column IS colourable as categories — the refusal is about the scale, not the column */
  assert.equal(UP.classify(codes, { field: 'code', mode: 'categorical' }, rules).ok, true);
});

test('R738 ③ the upload section writes no second number rule of its own', async () => {
  const src = section(read('js/map-ui.js'));
  assert.ok(!/parseFloat\s*\(/.test(src), 'parseFloat in this section would be a second answer to 「これは数か」');
  /* every value-typing question is asked of the handed-in rules object */
  assert.ok(/typeColumn\s*\(/.test(src) && /asNumber\s*\(/.test(src) && /isEmpty\s*\(/.test(src),
    'the classifier must ask the registry the three questions it needs about values');
});

test('R738 ③ without the data module a colouring is refused BY NAME, never guessed', async () => {
  const { w, UP, rules } = await boot();
  const put = UP.add(fc([feat({ v: 1 }), feat({ v: 2 })]), 'nomodule.geojson');
  const held = w.IntMapData, lazy = w.IntMapLazy;
  w.IntMapData = null; w.IntMapLazy = { need: async () => false };
  const res = await UP.style(put.n, { field: 'v', mode: 'graduated' });
  w.IntMapData = held; w.IntMapLazy = lazy;
  assert.equal(res.ok, false);
  assert.equal(res.why, 'data-unavailable');
  assert.notEqual(UP.styleReason('data-unavailable'), UP.styleReason('field-not-numeric'), 'two different failures may not read the same');
  /* handed an object that cannot answer the three value questions, the classifier refuses rather
     than falling back to a rule of its own */
  assert.equal(UP.classify([1, 2], { field: 'v' }, {}).why, 'data-unavailable');
  assert.ok(rules);
});

/* ══ ④ 登録の失敗は必ず読者に届く ══════════════════════════════════════════════════════════ */

/* The upload closure, read out of the module that publishes it. The anchor is the registry key
   index.html loads it by — its identity, not an incidental spelling; if it moves, this fails loudly
   rather than quietly measuring nothing. */
function section(src) {
  const at = src.indexOf('window.IntMapModules.geojsonUpload');
  assert.ok(at > 0, 'js/map-ui.js no longer publishes the upload module under that name');
  let i = src.indexOf('{', at), depth = 0, end = -1;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  assert.ok(end > i);
  return src.slice(at, end + 1);
}

function fnBody(src, header) {
  const at = src.indexOf(header);
  assert.ok(at > 0, 'function not found: ' + header);
  let depth = 0, end = -1, i = src.indexOf('{', at);
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return src.slice(at, end + 1);
}

test('R738 ④ registerDataset has no silent catch, and every failure path says a sentence', async () => {
  const body = fnBody(section(read('js/map-ui.js')), 'async function registerDataset(');
  /* ⚠ A GUARD AROUND LOGGING IS NOT A SWALLOWED FAILURE. `try{ console.warn(…) }catch(_){}` is how
     this file keeps a diagnostic from becoming a second fault; it is folded away first so that what
     is measured is the thing that matters — a catch that drops a real failure on the floor. */
  const meat = body.replace(/try\s*\{\s*console\.[a-z]+\([\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{\s*\}/g, 'LOG;');
  assert.ok(!/catch\s*\([^)]*\)\s*\{\s*(\/\*[\s\S]*?\*\/\s*)?\}/.test(meat),
    'an empty catch here is the defect this round removes: the layer is drawn and nothing says it was not registered');
  /* A reader-facing sentence is an IntMapLang call. There are two named failures — the module never
     arrived, and the registry refused the file — and each must be able to reach the reader. */
  const said = (body.match(/IntMapLang\.t\(/g) || []).length;
  assert.ok(said >= 2, 'both named failures must have a sentence of their own, got ' + said);
  /* …and the exception's own message must not be one of them (it is a developer string, in one
     language, about an internal object). It goes to the console. */
  assert.ok(/console\.warn/.test(body), 'the detail belongs in the console');
  assert.ok(!/IntMapLang\.t\([^)]*e\.message/.test(body), 'an exception message is not a sentence for a reader');
});

test('R738 ④ the drawn layer is bound to its dataset by identifier, not by title', async () => {
  const { UP } = await boot();
  const a = UP.add(fc([feat({ k: 'x' })]), 'same-name.csv');
  const b = UP.add(fc([feat({ k: 'y' })]), 'same-name.csv');
  UP.link(a.n, 'ds-41'); UP.link(b.n, 'ds-42');
  assert.equal(UP.find('ds-41').n, a.n);
  assert.equal(UP.find('ds-42').n, b.n);
  assert.equal(UP.find(a.n).sid, a.sid, 'the import number still resolves');
  assert.equal(UP.find('ds-nope'), null, 'an unknown id is null, not the first row');
  const res = await UP.style('ds-42', { field: 'k', mode: 'categorical' });
  assert.equal(res.ok, true);
  assert.equal(UP.styleOf('ds-41').legend, null, 'colouring one dataset must not colour the other');
});

/* ══ ⑤ 既存の呼び出し元の署名 ══════════════════════════════════════════════════════════════ */

test('R738 ⑤ add(fc, name) — the two-argument call js/gis-core.js makes — is unchanged', async () => {
  const { R, UP } = await boot();
  const n0 = UP._items.length;
  const put = UP.add(fc([feat({ a: 1 })]), 'from-an-analysis-step');
  assert.equal(UP._items.length, n0 + 1);
  const it = UP._items[UP._items.length - 1];
  assert.equal(it.name, 'from-an-analysis-step');
  assert.ok(it.col && /^#[0-9a-f]{6}$/i.test(it.col), 'an import still gets its palette colour');
  assert.equal(it.legend, null, 'a fresh import is not classified');
  assert.ok(R.sources.has(put.sid), 'the features are in the renderer');
  for (const p of ['-fill', '-line', '-pt']) {
    const L = R.layers.get(put.sid + p);
    assert.ok(L, 'layer missing: ' + p);
    assert.equal(typeof (L.paint['fill-color'] || L.paint['line-color'] || L.paint['circle-color']), 'string',
      'an unclassified import is drawn in one colour, exactly as before');
  }
  /* ⚠ THE INVARIANT IS THE SIGNATURE, NOT ONE CALLER'S SPELLING. This line used to assert that
     js/gis-core.js calls add() with two arguments — and then js/gis-core.js started passing the
     dataset id, deliberately, so that a layer drawn from an analysis result can be coloured by one of
     its own columns. What has to stay true is that the LATER arguments are optional, which the call
     above (two arguments, no report, no ids) has just demonstrated end to end. Pinning the caller's
     spelling instead measures whoever happened to call it on the day the test was written. */
  assert.equal(put.n, UP._items.length, 'the two-argument call still gets its item back');
  assert.equal(it.datasetId == null, true, 'and claims no dataset, because none was named');
});

/* ══ ⑥ 分類器は単体で測れる ════════════════════════════════════════════════════════════════ */

test('R738 ⑥ quantile and equal-interval cut in different places, and both say which they were', async () => {
  const { UP, rules } = await boot();
  const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const q = UP.classify(vals, { field: 'v', mode: 'graduated', method: 'quantile', classes: 2, color: '#0a84ff' }, rules).legend;
  assert.equal(q.method, 'quantile');
  assert.equal(q.classes.length, 2);
  assert.equal(q.cuts.length, 1);
  assert.ok(Math.abs(q.cuts[0] - 5.5) < 1e-9, 'the median of 1..10 is 5.5, got ' + q.cuts[0]);
  assert.deepEqual(q.classes.map((c) => c.count), [5, 5], 'quantiles put equal counts in each class');

  const e = UP.classify(vals, { field: 'v', mode: 'graduated', method: 'equal', classes: 4, color: '#0a84ff' }, rules).legend;
  assert.equal(e.method, 'equal');
  assert.deepEqual(e.cuts.map((c) => Math.round(c * 100) / 100), [3.25, 5.5, 7.75]);
  assert.deepEqual(e.classes.map((c) => c.count), [3, 2, 2, 3]);
  assert.equal(e.classes[0].from, 1);
  assert.equal(e.classes[3].to, 10, 'the last class is closed at the maximum');
  /* the ramp is ordered: one hue, getting darker — adjacent steps are never the same colour */
  assert.equal(new Set(e.classes.map((c) => c.color)).size, 4);
});

test('R738 ⑥ ties collapse the classes — and the collapse is declared, not hidden', async () => {
  const { UP, rules } = await boot();
  const vals = [5, 5, 5, 5, 5, 5, 5, 5, 5, 9];
  const lg = UP.classify(vals, { field: 'v', mode: 'graduated', method: 'quantile', classes: 4, color: '#34c759' }, rules).legend;
  assert.ok(lg.classes.length < 4, 'identical values cannot be cut into four classes');
  assert.equal(lg.collapsed, 4 - lg.classes.length, 'the number of classes that could not be made is stated');
  assert.equal(lg.classes.reduce((s, c) => s + c.count, 0), vals.length);
});

test('R738 ⑥ an empty column is refused rather than coloured in one class', async () => {
  const { UP, rules } = await boot();
  const r = UP.classify(['', '  ', null, undefined], { field: 'v', mode: 'categorical' }, rules);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'field-empty');
  assert.equal(UP.classify([1, 2], { mode: 'categorical' }, rules).why, 'no-field');
  assert.equal(UP.classify([1, 2], { field: 'v', mode: 'rainbow' }, rules).why, 'mode-unknown');
});

test('R738 ⑥ the classifier touches no DOM and no renderer — the same values give the same answer twice', async () => {
  const { UP, rules } = await boot();
  const vals = ['a', 'b', 'a', 'c', '', 'b'];
  const one = UP.classify(vals, { field: 'k', mode: 'categorical', color: '#af52de' }, rules);
  const two = UP.classify(vals.slice(), { field: 'k', mode: 'categorical', color: '#af52de' }, rules);
  assert.deepEqual(one, two, 'a pure classifier answers a copy of its input identically');
  assert.equal(one.legend.missing.count, 1);
  assert.deepEqual(one.legend.classes.map((c) => c.label), ['a', 'b', 'c'], 'classes are ordered by how many features carry them');
  /* ⚠ the missing keys carry '' because that is what ['to-string',['get',field]] answers for a
     feature that has no such property — the map and the legend must agree about that feature */
  assert.ok(one.legend.missing.keys.includes(''), 'an absent property must land in the missing branch');
});
