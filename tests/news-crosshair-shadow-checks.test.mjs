/* ============================================================================
 *  news-crosshair-shadow — one name, one meaning: a function's name is not shadowed where it is called
 * ----------------------------------------------------------------------------
 *  THE DEFECT: js/news-ui.js's factory declares the renderer accessor `const GE=()=>IntMapGeoEngine`,
 *  and setupIntelLayers() declared its OWN `const GE=IntMapGeoEngine` inside. Everything written `GE.x`
 *  in that function worked; the first `GE()` in it threw `TypeError: GE is not a function`, which the
 *  caller swallowed — so the dashboard-pin hover / leave / click were never bound, from #R178 (where
 *  `map.on(…)` became `GE().events.on(…)`) until the 2026-10-23 security audit saw the throw.
 *
 *  ① The SHAPE, over every file in js/: a call `X()` whose X resolves (by lexical scope, through
 *    tests/helpers/js-bindings.mjs) to a const/let/var that is not known to hold a function, while the
 *    same name one scope further out IS a function. The fact is about bindings, not about `GE` or this
 *    file: measured on the pre-fix tree it named the 22 `GE()` calls in js/news-ui.js and nothing else
 *    (an alias of a function — js/gis-datasets.js's `const no = refuseTime` — is a function and passes).
 *  ② The behaviour, by evaluating the shipped module against a stand-in engine: setupIntelLayers()
 *    returns instead of throwing, the dashboard pins get their three handlers, and the hover writes the
 *    pin's text as text (the only writer of dash-points puts Wikidata labels in `title`).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource } from './helpers/ast.mjs';
import { bindProgram, linkParents } from './helpers/js-bindings.mjs';
import { importModule } from './helpers/import-module.mjs';
import { installSafe } from './helpers/safe-html.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* the scopes js-bindings.mjs resolves through, so «one scope further out» is asked of the same resolver */
const SCOPE_TYPES = new Set(['Program', 'BlockStatement', 'StaticBlock', 'SwitchStatement', 'ForStatement', 'ForInStatement',
  'ForOfStatement', 'CatchClause', 'ClassExpression', 'ClassDeclaration', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/* every call of a function's name made where an inner non-function binding of that name shadows it */
function shadowedCalls(files) {
  const P = bindProgram(files);
  const isFnRec = (r) => !!r && (r.kind === 'fn' || (r.kind === 'var' && !r.path.length && !!r.decl.init && P.isFn(r.decl.init)));
  const out = [];
  for (const c of P.calls) {
    if (c.callee.type !== 'Identifier') continue;
    const d = P.lookup(c.callee);
    if (!d || d.kind !== 'var') continue;
    if (d.decl.init && (P.isFn(d.decl.init) || P.valuesOf(d.decl.init).some(P.isFn))) continue;   /* it may hold a function */
    let owner = null;
    for (let a = d.decl.parent; a && !owner; a = a.parent) {
      if (SCOPE_TYPES.has(a.type) && P.lookup({ type: 'Identifier', name: c.callee.name, parent: a }) === d) owner = a;
    }
    if (!owner) continue;
    const outer = P.lookup({ type: 'Identifier', name: c.callee.name, parent: owner.parent });
    if (isFnRec(outer)) out.push(`${c.file}:${c.loc.start.line} ${c.callee.name}() — shadowed at line ${d.decl.loc.start.line}`);
  }
  return out;
}
const program = (srcs) => Object.entries(srcs).map(([f, src]) => ({ f, ast: linkParents(parseSource(src, { sourceType: 'module' })) }));

test('news-crosshair-shadow ①a: the shape is caught, and what only looks like it is not', () => {
  const found = shadowedCalls(program({
    'js/a.js': `export const ENGINE = { events: { on() {} } };`,
    'js/defect.js': `import { ENGINE } from './a.js';
      export function ui() {
        const GE = () => ENGINE;
        function setup() {
          const GE = ENGINE;
          GE.events.on('x');
          GE().events.on('y');
        }
        return setup;
      }`,
    'js/alias.js': `function refuse(w) { return w; }
      function no(w) { return w; }
      export function declare() { const no = refuse; return no('x'); }`,
    'js/fn-over-fn.js': `function L(x) { return x; }
      export function outer() { function L(y) { return y; } return L(1); }`,
    'js/no-call.js': `const GE = () => 1;
      export function f() { const GE = { a: 1 }; return GE.a; }`,
  }));
  assert.deepEqual(found, ['js/defect.js:7 GE() — shadowed at line 5']);
});

function jsFilesUnder(dir) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'locales' && e.name !== 'vendor') out.push(...jsFilesUnder(join(dir, e.name))); continue; }
    if (e.name.endsWith('.js')) out.push(join(dir, e.name).replace(/\\/g, '/'));
  }
  return out;
}

test('news-crosshair-shadow ①b: no file in js/ calls a function by a name an inner non-function binding shadows', () => {
  const files = jsFilesUnder('js').map((f) => {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const ast = parseSource(src, { sourceType: 'module', orNull: true, allowReturnOutsideFunction: true })
      || parseSource(src, { sourceType: 'script', allowReturnOutsideFunction: true });
    return { f, ast: linkParents(ast) };
  });
  assert.ok(files.some((x) => x.f === 'js/news-ui.js'), 'js/news-ui.js is in the population');
  assert.deepEqual(shadowedCalls(files), [], 'each of these calls reaches the inner binding, not the function its name was given to');
});

/* ── ② the module itself ─────────────────────────────────────────────────────────────────────── */
function standIn() {
  const sources = new Map(), layers = new Map(), state = [], on = [], onLayer = [], flights = [];
  const canvas = { style: { cursor: '' } };
  const E = {
    canDraw: () => true, ready: () => true, hasRenderer: () => true,
    layers: {
      hasSource: (id) => sources.has(id), addSource: (id, s) => { sources.set(id, s); },
      add: (l) => { layers.set(l.id, l); }, has: (id) => layers.has(id), get: (id) => layers.get(id),
      setSourceData: (id, d) => { sources.set(id, { ...sources.get(id), data: d }); },
      setFeatureState: (f, s) => { state.push([f.source, f.id, s]); },
    },
    events: { on: (type, cb) => on.push({ type, cb }), onLayer: (type, layer, cb) => onLayer.push({ type, layer, cb }) },
    render: { setCursor: (c) => { canvas.style.cursor = c; }, canvas: () => canvas },
    coords: { project: () => ({ x: 10, y: 20 }), queryRenderedFeatures: () => [] },
    camera: { flyTo: (o) => flights.push(o), getCenter: () => ({ lng: 0, lat: 0 }) },
  };
  return { E, sources, layers, state, on, onLayer, flights, canvas };
}

test('news-crosshair-shadow ②: setupIntelLayers binds the dashboard pins, and their hover writes text as text', async () => {
  const S = standIn();
  const tip = { innerHTML: '', shown: 0, hidden: 0 };
  const win = globalThis;
  installSafe(win);
  Object.assign(win, {
    showMapTooltip: () => { tip.shown++; }, hideMapTooltip: () => { tip.hidden++; },
    setMapTooltipHTML: (el, html) => { el.innerHTML = html; return el; }, triggerLayerHover: () => {},
    IntMapLabelScale: { sub: (k) => 12 * k },   /* the label text size the news band asks for — not what this measures */
  });
  const document = { getElementById: () => null, addEventListener: () => {}, body: { classList: { contains: () => false } } };
  const { newsUi } = await importModule('js/news-ui.js', {
    globals: { window: win, document },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: S.E } },
  });
  const modes = [];
  const HOST = {
    lang: 'en', newsFeatures: [], dashFeatures: [], extendedDashDB: [], bookmarks: [], mode: 'info',
    ensureLabelPill() {}, scheduleNewsDeclutter() {}, refreshNewsPill() {}, isMobile: () => false,
    ensureMapTooltip: () => tip, positionTooltip() {}, setMode: (m) => modes.push(m),
    get mapTooltipEl() { return tip; },
  };
  delete win._intelHandlersBound;
  const ui = newsUi(HOST);
  assert.doesNotThrow(() => ui.setupIntelLayers(), 'setupIntelLayers runs to its end');
  assert.ok(S.layers.has('dash-dots') && S.sources.has('dash-points'), 'the dashboard pin layer exists');

  const bound = (type, layer) => S.onLayer.filter((r) => r.type === type && r.layer === layer);
  for (const type of ['mousemove', 'mouseleave', 'click']) assert.equal(bound(type, 'dash-dots').length, 1, `dash-dots ${type} is bound once`);
  for (const type of ['mousemove', 'mouseleave', 'click']) assert.equal(bound(type, 'news-dots').length, 1, `news-dots ${type} is still bound once`);
  assert.equal(S.on.filter((r) => r.type === 'moveend').length, 1, 'the only moveend is the news declutter (the retired crosshair is not bound)');

  /* a second call (styledata re-runs it) binds nothing twice */
  ui.setupIntelLayers();
  assert.equal(bound('click', 'dash-dots').length, 1);

  const pin = { id: 'ev0', geometry: { coordinates: [139.7, 35.7] },
    properties: { title: '<img src=x onerror=alert(1)>Tokyo', body: 'a & b', color: '#007aff', layerRef: '' } };
  bound('mousemove', 'dash-dots')[0].cb({ features: [pin] });
  assert.equal(S.canvas.style.cursor, 'pointer');
  assert.deepEqual(S.state.at(-1), ['dash-points', 'ev0', { hover: true }]);
  assert.ok(tip.shown >= 1);
  assert.ok(tip.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;Tokyo'), 'the title is escaped: ' + tip.innerHTML);
  assert.ok(!/<img/i.test(tip.innerHTML) && tip.innerHTML.includes('a &amp; b'));

  bound('mouseleave', 'dash-dots')[0].cb({});
  assert.deepEqual(S.state.at(-1), ['dash-points', 'ev0', { hover: false }]);
  assert.equal(S.canvas.style.cursor, '');

  bound('click', 'dash-dots')[0].cb({ features: [pin] });
  assert.deepEqual(S.flights.at(-1), { center: [139.7, 35.7], zoom: 4, speed: 1.2 });
});
