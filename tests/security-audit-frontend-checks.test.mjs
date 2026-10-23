/* ============================================================================
 *  security-audit — three findings of the front-end audit, held where they were found
 * ----------------------------------------------------------------------------
 *  ① js/news-ui.js — every map tooltip the news overlay writes escapes what the feed wrote. The mobile
 *    crosshair tooltip interpolated the RSS name / title / publisher raw (the title is the RSS <title> read
 *    as textContent, so an entity-encoded `&lt;img …&gt;` arrives as live markup); the dashboard pin tooltip
 *    did the same with its title and body. `setMapTooltipHTML` assigns innerHTML (js/map-tooltip.js) but is
 *    a function call, so scripts/output-taint.mjs does not count it as a sink — this check is what holds it.
 *  ② js/atlas-notebook-store.js / js/atlas-notebook.js — a notebook FILE is somebody else's calls. Its
 *    `replay` flag is judged again by the registry (and against the call that would really run), and an
 *    imported step reaches the dispatch stamped `__externalContent`, as the briefing's rebuild does, so the
 *    executor's confirmation rule applies. A step this device recorded replays exactly as before.
 *    A section of a briefing LINK the reader keeps into the notebook (js/atlas-briefing.js keep) is the same:
 *    imported, judged again when a replay would run it, stamped as outside content.
 *  ③ admin.html — connect-src names this project's Supabase host, not every *.supabase.co.
 *
 *  ①② run the shipped code (the real module, the real registry); only what a browser would supply is stubbed.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource, walkSource } from './helpers/ast.mjs';
import '../js/safe-html.js';
import { IntMapGeoEngine } from '../js/geo-engine.js';
import { newsUi } from '../js/news-ui.js';
import { entryFromTurn, toFile, fromFile, replayCalls, replayableStep, normalize, IMPORTED } from '../js/atlas-notebook-store.js';
import { buildBriefing, packBriefing } from '../js/atlas-briefing-codec.js';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { shownNotebook } from './helpers/notebook-shown.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EVIL = '<img src=x onerror=alert(1)>';

/* ── ① the news tooltips ─────────────────────────────────────────────────────────────────────────── */
test('security-audit ①: the news pin and band tooltips escape a feed title that carries markup (evaluated)', () => {
  const handlers = {}, written = [];
  const tip = { style: {}, contains: () => false };
  const saved = {}, KEYS = ['canDraw', 'layers', 'events', 'coords', 'render', 'camera'];
  KEYS.forEach((k) => { saved[k] = IntMapGeoEngine[k]; });
  const had = { win: Object.getOwnPropertyDescriptor(globalThis, 'window'), bound: globalThis._intelHandlersBound, set: globalThis.setMapTooltipHTML, show: globalThis.showMapTooltip };
  try {
    Object.assign(IntMapGeoEngine, {
      canDraw: () => true,
      layers: { hasSource: () => true, has: () => true, get: () => ({}), add() {}, addSource() {}, setSourceData() {}, setFeatureState() {} },
      events: { onLayer: (ev, layer, fn) => { handlers[ev + ':' + layer] = fn; }, on() {} },
      coords: { project: () => ({ x: 0, y: 0 }), queryRenderedFeatures: () => [] },
      render: { setCursor() {}, canvas: () => ({ style: {} }) },
      camera: { getCenter: () => ({ lng: 0, lat: 0 }), flyTo() {} },
    });
    if (!had.win) globalThis.window = globalThis;   /* the module reads its globals off `window`, as in a browser */
    globalThis._intelHandlersBound = false;
    globalThis.setMapTooltipHTML = (el, html) => { written.push(html); return el; };
    globalThis.showMapTooltip = (el) => el;
    const HOST = { lang: 'en', dashFeatures: [], ensureLabelPill() {}, ensureMapTooltip: () => tip, positionTooltip() {}, parseDate: (s) => new Date(s), userTZ: 'auto', isMobile: () => false };
    const ui = newsUi(HOST);
    /* ⚠ setupIntelLayers throws today AFTER the news handlers are bound: `GE().events.on('moveend', _crosshairNews)`
       calls the engine object, which the function's own `const GE = IntMapGeoEngine` shadows — so the handlers bound
       after it (the dashboard pins, the crosshair tap) are not reached. Reported with this check; not this check's subject. */
    try { ui.setupIntelLayers(); } catch (_) { /* see above */ }
    const props = { name: EVIL, title: 'Headline ' + EVIL, publisher: EVIL, pubDate: '2026-10-01T00:00:00Z', ev: '1', evSources: 2 };
    for (const key of ['mousemove:news-dots', 'mousemove:news-labels']) {
      assert.equal(typeof handlers[key], 'function', key + ' is bound');
      written.length = 0;
      handlers[key]({ features: [{ id: 1, properties: props, geometry: { coordinates: [0, 0] } }] });
      assert.equal(written.length, 1, key + ' writes the tooltip');
      assert.ok(!/<img/i.test(written[0]), key + ' carries no live <img>: ' + written[0]);
      assert.match(written[0], /&lt;img src=x onerror=alert\(1\)&gt;/, key + ' shows the title as text');
    }
  } finally {
    KEYS.forEach((k) => { IntMapGeoEngine[k] = saved[k]; });
    globalThis._intelHandlersBound = had.bound; globalThis.setMapTooltipHTML = had.set; globalThis.showMapTooltip = had.show;
    if (!had.win) delete globalThis.window;
  }
});

/* The crosshair tooltip sits behind an unconditional `return` today (mobile hover was switched off on request), so
   it cannot be evaluated; the dashboard pin's handler binds after it. Both are held by the same fact as the two
   above, read off the tree: EVERY `setMapTooltipHTML(el, html)` in the file hands it either the shared builder or
   a template whose every interpolation is IntMapSafe.html(…). */
test('security-audit ①: every setMapTooltipHTML in js/news-ui.js is the shared builder or a fully escaped template', () => {
  const src = read('js/news-ui.js');
  const calls = [];
  walkSource(parseSource(src), {
    CallExpression(n) {
      const c = n.callee;
      if (c.type === 'MemberExpression' && c.property && c.property.name === 'setMapTooltipHTML') calls.push(n);
    },
  });
  assert.ok(calls.length >= 4, 'the tooltip writes are found (' + calls.length + ')');
  const isEsc = (e) => e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && e.callee.object.name === 'IntMapSafe' && e.callee.property.name === 'html';
  for (const n of calls) {
    const v = n.arguments[1], at = 'js/news-ui.js:' + n.loc.start.line;
    if (v.type === 'CallExpression' && v.callee.type === 'Identifier' && v.callee.name === '_newsTipHTML') continue;
    assert.equal(v.type, 'TemplateLiteral', at + ' writes a template or the shared builder');
    v.expressions.forEach((e) => assert.ok(isEsc(e), at + ' interpolates «' + src.slice(e.start, e.end) + '» without IntMapSafe.html'));
  }
});

/* ── ② the notebook file ─────────────────────────────────────────────────────────────────────────── */
const CAPS = makeAtlasCapabilities({}, { publish: false });
const resolve = (id) => CAPS.resolve(id);
const legacy = (id) => resolve(id).legacy;
const fileWith = (steps) => JSON.parse(JSON.stringify(toFile([normalize({ id: 'nb-sec-0001', at: 1, updatedAt: 1, question: 'q', answer: 'a', steps })])));

test('security-audit ②: an imported step\'s replay flag is judged again by the registry, against the call that would run', () => {
  const fly = { cap: 'view.flyTo', args: { type: legacy('view.flyTo'), center: [1, 2] }, status: 'completed', replay: true };
  const f = fileWith([
    fly,
    /* an outward, 'explicit' row the file calls replayable */
    { cap: 'places.publish', args: { type: legacy('places.publish') }, status: 'completed', replay: true },
    /* a map step's label carrying another call in its args */
    { cap: 'view.flyTo', args: { type: legacy('places.publish') }, status: 'completed', replay: true },
    /* a reversible step the file says is NOT replayable is judged by the registry too */
    Object.assign({}, fly, { replay: false }),
    /* a step that failed is not replayed whatever the file says */
    Object.assign({}, fly, { status: 'failed' }),
  ]);
  const e = fromFile(f, resolve).entries[0];
  assert.deepEqual(e.steps.map((s) => s.replay), [true, false, false, true, false]);
  assert.ok(e.steps.every((s) => s.from === IMPORTED), 'every step of a file is marked as imported');
  assert.equal(fromFile(f).entries[0].steps.some((s) => s.replay), false, 'with no registry to ask, the file\'s own flag is never the answer');
  assert.equal(replayableStep({ cap: 'view.flyTo', args: { type: legacy('places.publish') }, status: 'completed' }, resolve), false);
});

test('security-audit ②: a replay stamps imported steps as outside content and leaves this device\'s steps as they were (evaluated)', async () => {
  /* a planted stamp in the file is not carried: normalize cleans `__` keys out of every step's args */
  const f = fileWith([{ cap: 'system.control', args: { type: legacy('system.control'), id: 'btn-x', __externalContent: false }, status: 'completed', replay: true }]);
  const imported = fromFile(f, resolve).entries[0];
  assert.equal('__externalContent' in imported.steps[0].args, false, 'a stamp written into the file is dropped');
  assert.deepEqual(replayCalls(imported, resolve).map((a) => a.__externalContent), [true]);
  assert.deepEqual(replayCalls(imported), [], 'with no registry to judge it at run time, an imported step does not run');

  const local = entryFromTurn({ at: 5, question: 'q2', reply: 'r', operations: [{ capabilityId: 'view.flyTo', status: 'completed', args: { type: legacy('view.flyTo'), center: [3, 4] } }] }, { resolve, now: 5 });
  assert.equal(local.steps[0].from, undefined, 'a recorded step carries no origin');
  assert.deepEqual(replayCalls(local), [{ type: legacy('view.flyTo'), center: [3, 4] }], 'a step this device recorded replays unchanged');
  /* the account copy and an entry stored before the field existed read the same way */
  const roundTrip = normalize(JSON.parse(JSON.stringify(imported)));
  assert.equal(roundTrip.steps[0].from, IMPORTED, 'the origin survives the device and the account copy');

  /* the page's replay through the real module: what reaches runDirect */
  const { notebook } = await shownNotebook();
  const NB = notebook.makeAtlasNotebook();
  const ran = [];
  NB.mount(null, { resolve, lang: () => 'en', runDirect: (label, acts) => { ran.push(acts); return Promise.resolve(); } });
  const r = await NB.importText(JSON.stringify(f));
  assert.equal(r.added, 1);
  NB.replay(await NB.store.get('nb-sec-0001'));
  const calls = ran[0].filter((a) => a.type !== 'notebookOpen');
  assert.deepEqual(calls.map((a) => [a.type, a.__externalContent]), [[legacy('system.control'), true]], 'the imported press reaches the dispatch as outside content');
  await NB.store.put(local);
  NB.replay(await NB.store.get(local.id));
  assert.deepEqual(ran[1].filter((a) => a.type !== 'notebookOpen').map((a) => a.__externalContent), [undefined], 'a recorded step is not stamped');
});

test('security-audit ②: a briefing section kept into the notebook replays as outside content, judged again (evaluated)', async () => {
  const { notebook, briefing } = await shownNotebook();
  const NB = notebook.makeAtlasNotebook();
  const ran = [];
  NB.mount(null, { resolve, lang: () => 'en', runDirect: (label, acts) => { ran.push(acts); return Promise.resolve(); } });
  const BR = briefing.makeAtlasBriefing(NB);
  /* the sender's entry, as their link carries it: one map step, and one outward call labelled as a map step */
  const sent = normalize({ id: 'nb-sec-0003', at: 1, updatedAt: 1, question: 'sent', answer: 'a', steps: [
    { cap: 'view.flyTo', args: { type: legacy('view.flyTo'), center: [5, 6] }, status: 'completed', replay: true },
    { cap: 'view.flyTo', args: { type: legacy('places.publish') }, status: 'completed', replay: true },
  ] });
  assert.equal((await BR.openPacked(await packBriefing(buildBriefing([sent], {})))).ok, true, 'the link opens');
  assert.equal((await BR.keep(0)).ok, true, 'the section is kept');
  const kept = await NB.store.get('nb-sec-0003');
  assert.ok(kept.steps.length && kept.steps.every((x) => x.from === IMPORTED), "every kept step is marked as the sender's");
  NB.replay(kept);
  assert.deepEqual(ran[0].filter((a) => a.type !== 'notebookOpen').map((a) => [a.type, a.__externalContent]), [[legacy('view.flyTo'), true]],
    "the map step runs as outside content; the call hidden under a map step's label does not run");
});

test("security-audit ②: a briefing's rebuild runs only what the registry judges replayable, as outside content (evaluated)", async () => {
  const { notebook, briefing } = await shownNotebook();
  const ran = [];
  const BR = briefing.makeAtlasBriefing(notebook.makeAtlasNotebook());
  BR.mount(null, { resolve, lang: () => 'en', runDirect: (label, acts) => { ran.push(acts); return Promise.resolve(); } });
  const sent = normalize({ id: 'nb-sec-0004', at: 1, updatedAt: 1, question: 'sent', answer: 'a', steps: [
    { cap: 'view.flyTo', args: { type: legacy('view.flyTo'), center: [7, 8] }, status: 'completed', replay: true },
    /* the link calls an outward, 'explicit' row replayable, and hides another under a map step's label */
    { cap: 'places.publish', args: { type: legacy('places.publish') }, status: 'completed', replay: true },
    { cap: 'view.flyTo', args: { type: legacy('places.publish') }, status: 'completed', replay: true },
  ] });
  assert.equal((await BR.openPacked(await packBriefing(buildBriefing([sent], {})))).ok, true, 'the link opens');
  BR.rebuild(0);
  assert.deepEqual(ran[0].filter((x) => x.type !== 'briefingOpen').map((x) => [x.type, x.__externalContent]), [[legacy('view.flyTo'), true]],
    "only the map step runs, stamped as the sender's");
});

/* ── ③ admin.html ────────────────────────────────────────────────────────────────────────────────── */
test('security-audit ③: admin.html connect-src names this project\'s Supabase host and no wildcard', () => {
  const html = read('admin.html');
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
  assert.ok(csp, 'admin.html declares a CSP');
  const connect = (csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === 'connect-src') || []).slice(1);
  assert.ok(connect.length, 'connect-src is declared');
  assert.ok(!connect.some((t) => t.includes('*')), 'no wildcard host: ' + connect.join(' '));
  /* the host the console's own client talks to — read from the page, not typed here */
  const url = (html.match(/window\.SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
  assert.ok(url, 'admin.html names its Supabase URL');
  assert.deepEqual(connect.filter((t) => t !== "'self'"), [new URL(url).origin]);
});
