/* ============================================================================
 *  R621 — the measured-radiation layer, asked the way the browser asks it
 * ----------------------------------------------------------------------------
 *  #R585 shipped a layer whose legend was EMPTY in production and whose station popup never opened
 *  once, and every check it brought with it was green. Both defects were swallowed by `try/catch`,
 *  so neither appeared in the console either. They were found by opening the production site.
 *
 *  ⚠ THE CHECKS WERE NOT MERELY INCOMPLETE — THEY WERE BUILT SO THEY COULD NOT SEE IT.
 *    · The language stub was `pick: () => (v) => Array.isArray(v) ? v[0] : v`. The REAL `pick`
 *      (js/lang-registry.js) takes POSITIONAL arguments and returns `arguments[0]` — hand it an
 *      array and you get the array back. The stub repaired the bug on the way past, so
 *      `L(LA(a,b,…))` looked like a string in the test and was an array in the browser: `.split`
 *      threw, the catch ate it, and the legend rendered as an empty box under a title.
 *    · The renderer stub was hand-written, so it had whatever member the module happened to call.
 *      `GE().popup` does not exist in the shipped facade at all — it is `GE().ui.popup` — and a
 *      hand-written double can never notice a door that was never there.
 *
 *  So this file uses the REAL language registry, and enumerates the renderer surface from the
 *  SHIPPED engine. A fixture more capable than the real thing is worth nothing (#R552), and these
 *  two were more capable in exactly the places that mattered.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── the renderer surface, EVALUATED rather than read ──────────────────────────────────────────
   The first attempt parsed js/geo-engine.js and could not find the contract: the file publishes
   `window.IntMapGeoEngine = (function(){ … })()` and that IIFE returns a CALL, not a literal, so
   the AST would have had to model the factory to learn anything. #R505's answer applies here too —
   import the module and ASK the object. What the browser gets is what this enumerates. */
async function engineSurface() {
  const g = globalThis;
  if (typeof g.window === 'undefined') g.window = g;
  g.document = g.document || {
    createElement: () => ({ style: {}, classList: { add() { }, remove() { } }, appendChild() { }, querySelector: () => null }),
    querySelector: () => null, addEventListener() { }, readyState: 'complete', body: { appendChild() { } },
  };
  await import('../js/geo-engine.js');
  const E = g.window.IntMapGeoEngine;
  assert.ok(E, 'js/geo-engine.js published nothing — this check is blind, fix it rather than deleting it');
  const nested = new Map();
  for (const k of Object.keys(E)) {
    const v = E[k];
    if (v && typeof v === 'object') nested.set(k, new Set(Object.keys(v)));
  }
  return { top: new Set(Object.keys(E)), nested };
}

test('the layer only reaches for renderer members the shipped engine actually publishes', async () => {
  const surface = await engineSurface();
  const top = surface.top, nested = surface.nested;
  assert.ok(top.size > 5, 'the engine surface came out as ' + top.size + ' members — the enumeration is wrong, not the layer');
  /* ⚠ COMMENTS ARE STRIPPED FIRST, and the first run of this check is why: it flagged `GE().popup`
     out of the very comment that explains the defect. A rule whose own explanation trips it is a
     rule you end up deleting the explanation for — the same lesson the EURDEP check learned. */
  const src = read('js/radiation-layer.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const bad = [];
  const call = new RegExp('GE\\(\\)\\.([A-Za-z_$][\\w$]*)(?:\\.([A-Za-z_$][\\w$]*))?', 'g');
  for (const m of src.matchAll(call)) {
    const a = m[1], b = m[2];
    if (!top.has(a)) { bad.push('GE().' + a); continue; }
    if (b && nested.has(a) && !nested.get(a).has(b)) bad.push('GE().' + a + '.' + b);
  }
  assert.deepEqual([...new Set(bad)], [],
    'the layer calls renderer members that do not exist — in the browser these are calls into undefined, and the surrounding try/catch means nothing is ever printed:\n  ' + [...new Set(bad)].join('\n  '));
});

test('every language call hands pick() ARGUMENTS, never the array pickArgs() builds', () => {
  /* `L(LA(…))` type-checks, runs, and returns an ARRAY. Downstream that array reaches `.split`,
     `IntMapSafe.html` or the DOM: the first throws into a catch and blanks the whole legend, the
     others print all five languages joined by commas. Neither is visible from reading the line,
     which is why it is measured as a shape. */
  const wrap = new RegExp('\\bL\\(\\s*LA\\(', 'g');
  for (const f of ['js/radiation-layer.js', 'js/beta-overlays.js', 'js/atlas-controls.js']) {
    const hits = [...read(f).matchAll(wrap)].length;
    assert.equal(hits, 0, f + ' wraps a pickArgs() tuple in a pick() call ' + hits + ' time(s) — pass the arguments straight to L(), or use L.arr() for a tuple held as data');
  }
});

test('the legend actually writes its cautions, run with the REAL language registry', async () => {
  const g = globalThis;
  if (typeof g.window === 'undefined') g.window = g;
  const noop = () => { };
  g.document = g.document || {
    createElement: () => ({ className: '', innerHTML: '', querySelector: () => null }),
    querySelector: () => null, addEventListener: noop, readyState: 'complete',
  };
  await import('../js/lang-registry.js');          /* the real pick()/pickArgs(), not a stub */
  assert.equal(typeof g.window.IntMapLang.pick, 'function', 'the real language registry did not load');

  const layers = {
    _s: new Set(), _l: new Set(),
    hasSource: (id) => layers._s.has(id), addSource: (id) => layers._s.add(id),
    has: (id) => layers._l.has(id), add: (d) => layers._l.add(d && d.id),
    setLayout: noop, setSourceData: noop, getLayout: () => 'none', sourceData: () => null,
  };
  /* only what the engine publishes — `popup` deliberately absent from the top level */
  g.window.IntMapGeoEngine = {
    layers: layers, events: { on: noop, onLayer: noop }, ready: () => true,
    ui: { popup: () => ({ setLngLat: function () { return this; }, setHTML: function () { return this; } }), attach: (x) => x },
  };
  g.window.IntMapSafe = { html: (s) => String(s) };
  g.window.IntMapLabelScale = { sub: (n) => n };
  g.window.IntMapModules = g.window.IntMapModules || {};
  g.window.addEventListener = g.window.addEventListener || noop;

  const host = {
    _key: null,
    querySelector: (sel) => (sel === '.rad-key' ? host._key : null),
    insertBefore: (el) => { host._key = el; },
    appendChild: (el) => { host._key = el; },
  };
  g.window._registerLayerOpacity = () => host;

  /* the smallest feed that exercises every legend row: a source that answered, one that could not
     be read, and a period-mean set the clock is not on. */
  g.fetch = async () => ({
    ok: true,
    json: async () => ({
      v: 1, at: '2026-09-10T00:00:00Z', unit: 'nSv/h',
      sources: [
        { id: 'de-bfs', name: 'BfS', attribution: 'BfS', licence: 'DL-DE/BY-2.0', n: 1, read: true, historyDays: 365, chunks: 1 },
        { id: 'us-epa', name: 'EPA', attribution: 'EPA', licence: 'PD', n: 0, read: false, historyDays: 1, chunks: 1 },
        { id: 'nl-rivm', name: 'RIVM', attribution: 'RIVM', licence: 'CC0', n: 1, read: true, historyDays: 0, asOf: '2011', chunks: 1 },
      ],
      stations: [{ c: 'de-bfs:1', s: 'de-bfs', n: 'A', y: 50, x: 8, v: 90, t: '2026-09-10T00:00:00Z', q: 'H*(10)', k: 'hourly-mean' }],
      reference: [{ c: 'nl-rivm:1', s: 'nl-rivm', n: 'B', y: 52, x: 5, v: 70, t: '2011', q: 'ambient-gamma', k: 'period-mean' }],
    }),
  });

  await import('../js/radiation-layer.js');
  const api = g.window.IntMapModules.radiationLayer({ lang: 'en', canDraw: () => true });
  api.toggle(true);
  await new Promise((r) => setTimeout(r, 40));   /* let load() settle; it paints and re-legends */
  api.legend();
  api.toggle(false);                             /* stop the refresh tick so the runner can exit */
  /* ⚠ …and clear the fallback timer too. With no runtime HOST mounted, js/runtime.js's everyTick
     degrades to a raw setInterval kept in `everyTick.pending`; that handle holds the event loop
     open and the test FILE times out even though every assertion passed. Cleaning up what this
     test started is the test's own business. */
  const rt = await import('../js/runtime.js');
  if (rt.everyTick && rt.everyTick.pending) {
    for (const entry of rt.everyTick.pending.values()) { try { clearInterval(entry.h); } catch (_) { } }
    rt.everyTick.pending.clear();
  }

  const html = (host._key && host._key.innerHTML) || '';
  assert.ok(html.length > 0,
    'the legend wrote nothing — in production this is an empty box under a title, and the reader is shown radiation dots with no caveat at all');
  assert.ok(html.indexOf('50') >= 0, 'the legend does not state the natural-background band');
  assert.ok(/[Rr]ain|降雨/.test(html), 'the legend lost the rain caveat — BfS measures a factor of three');
  /* a pickArgs() tuple that reaches the DOM prints as «English,日本語,Deutsch,…». One probe for that
     shape: the English caution followed, after a comma, by its Japanese twin. */
  assert.ok(!/normal natural background[^<]*通常の自然放射線量/.test(html),
    'the legend printed more than one language at once — a pickArgs() tuple reached the DOM');
});
