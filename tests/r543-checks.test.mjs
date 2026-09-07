/* ============================================================================
 *  R543 — THE CHART AS AN OUTPUT MODALITY: one gate over a SET, and a renderer that refuses
 * ----------------------------------------------------------------------------
 *  #R511 made the map something an answer can BE rather than a side effect of one. The numbers
 *  stayed prose: every capability that ranks, compares, relates or queries produced values, and the
 *  only way any of them reached the reader as a picture was if one of three panels happened to be
 *  the thing opened. This round adds `chart.compose` and — the part that matters more — generalises
 *  #R511's single-purpose gate instead of putting a second one beside it (CONSTITUTION.md §5).
 *
 *  ⚠ THESE DRIVE THE SHIPPED MODULES, AND THEY EVALUATE THEM (#R505). The renderer is reached
 *  through its own registration on `window.IntMapModules` — the door the app uses — so a module that
 *  parses but throws on evaluation fails here rather than in production. What is asserted is what it
 *  RETURNS and what its HTML CONTAINS, never how either is spelled in the source.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
/* ⚠ these two export NOTHING: a lazily-loaded module registers its factory on window.IntMapModules
   (the shape js/atlas-query.js has), because an export no js/ module imports by name is dead code
   under tests/r175 ③ — and the only file that could import them statically is js/atlas-console.js,
   whose chunk is exactly what the lazy split was for. Reaching them THROUGH the registration is also
   what proves the module evaluates rather than merely parses (#R505). */
await import('../js/atlas-chart.js');
await import('../js/atlas-answer-view.js');
const makeAtlasChart = globalThis.window.IntMapModules.atlasChart;
const makeAtlasAnswerView = globalThis.window.IntMapModules.atlasAnswerView;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
const DOCS = makeAtlasCatalogText({}, {});

/* the renderer, built the way the console builds it: its own L and esc, no globals needed */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CH = makeAtlasChart({ lang: 'en' }, { L: (en) => en, esc });
const marks = (html) => (html.match(/data-mark="1"/g) || []).length;

const LINE = { kind: 'line', title: 'GDP', source: 'World Bank WDI', x: { type: 'year' },
  series: [{ label: 'Japan', points: [{ x: 2000, y: 4.9 }, { x: 2010, y: 5.7 }, { x: 2020, y: 5.0 }] }] };
const BARS = { kind: 'bar', title: 'Emitters', source: 'EDGAR 2024',
  series: [{ points: [{ label: 'China', y: 12.7 }, { label: 'USA', y: 5.0 }, { label: 'India', y: 2.9 }] }] };
const TIME = { kind: 'timeline', title: 'Korean War', source: 'IntMap war layers',
  events: [{ t: '1950-06-25', label: 'Invasion' }, { t: '1950-09-15', label: 'Inchon' }, { t: '1953-07-27', label: 'Armistice' }] };

/* ══ ① THE REFUSALS. The renderer's job is not to judge whether the numbers are right; it is to
      refuse to draw ones that arrive with no grounds (.agents/rules/no-ad-hoc-hardcoding.md §2.2). ══ */
test('R543 ①: a chart with no stated source is refused, and so is one thinner than its kind allows', () => {
  const noSrc = CH.render({ kind: 'bar', series: [{ points: [{ label: 'a', y: 1 }, { label: 'b', y: 2 }] }] });
  assert.equal(noSrc.ok, false);
  assert.equal(noSrc.reason, 'no_source', 'provenance is a precondition, not a decoration');

  /* the §2.6 minimum js/widget-render.js already enforces, applied from the same reasoning:
     a sparkline from one value is decoration shaped like evidence */
  const thin = CH.render({ kind: 'line', source: 'S', series: [{ label: 'a', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] });
  assert.equal(thin.ok, false);
  assert.equal(thin.reason, 'too_few_points');
  assert.match(thin.detail, /3/, 'the refusal says what was needed, so Atlas can answer in words instead');

  const oneBar = CH.render({ kind: 'bar', source: 'S', series: [{ points: [{ label: 'only', y: 1 }] }] });
  assert.equal(oneBar.reason, 'too_few_categories', 'one bar is not a comparison');

  const oneEvent = CH.render({ kind: 'timeline', source: 'S', events: [{ t: '1950-01-01', label: 'x' }] });
  assert.equal(oneEvent.reason, 'too_few_events');

  assert.equal(CH.render({ kind: 'pie', source: 'S' }).reason, 'unknown_kind');

  /* ⚠ and padding to reach the minimum is not available either: an undated event is dropped, so
     three events of which two lack dates is still a refusal, not a two-point timeline drawn thin */
  const padded = CH.render({ kind: 'timeline', source: 'S', events: [{ t: '1950-01-01', label: 'a' }, { label: 'b' }, { t: 'soon', label: 'c' }] });
  assert.equal(padded.ok, false, 'rows that carry no date cannot make up the count');
});

/* ══ ② WHAT IT DRAWS IS WHAT IT SAYS IT DREW — the fact the observer verifies ═════════════════ */
test('R543 ②: every plotted mark is stamped, and the reported count equals the marks in the HTML', () => {
  for (const spec of [LINE, BARS, TIME, { ...LINE, kind: 'scatter' }]) {
    const r = CH.render(spec);
    assert.equal(r.ok, true, spec.kind + ' renders');
    assert.ok(r.plotted > 0, spec.kind + ' reports what it plotted');
    assert.equal(marks(r.html), r.plotted, spec.kind + ': the artefact carries exactly the marks the renderer claims');
  }
  /* two series are two colours AND two names — colour is never the only carrier */
  const two = CH.render({ kind: 'line', source: 'S', series: [
    { label: 'Alpha', points: [{ x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }] },
    { label: 'Beta', points: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }] }] });
  assert.match(two.html, /Alpha/); assert.match(two.html, /Beta/);
});

/* ══ ③ DROPPED ROWS ARE COUNTED OUT LOUD ═════════════════════════════════════════════════════ */
test('R543 ③: a value that is not a number is dropped, and the caption says how many', () => {
  const r = CH.render({ kind: 'bar', source: 'S', series: [{ points: [
    { label: 'a', y: 1 }, { label: 'b', y: NaN }, { label: 'c', y: 3 }, { label: 'd', y: null }] }] });
  assert.equal(r.ok, true);
  assert.equal(r.plotted, 2, 'only the real rows are drawn');
  const cap = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(r.html);
  assert.ok(cap, 'there is a caption');
  assert.match(cap[1], /2/, 'and it states the two rows that were not drawable');
  assert.match(cap[1], /S/, '…alongside the source');
});

/* ══ ④ THE TICK GENERATOR — js/ had none before this round ════════════════════════════════════ */
test('R543 ④: nice-number ticks are finite, ordered, and span the data', () => {
  for (const [lo, hi] of [[0, 100], [0, 7], [-5, 5], [1000, 1e6], [0, 1], [3, 3], [-0.004, 0.004]]) {
    const s = CH.niceScale(lo, hi, 4);
    assert.ok(s && isFinite(s.lo) && isFinite(s.hi) && s.step > 0, `${lo}..${hi} produces a scale`);
    assert.ok(s.lo <= lo && s.hi >= hi, `${lo}..${hi}: the scale contains the data`);
    assert.ok(s.ticks.length >= 2 && s.ticks.length <= 12, `${lo}..${hi}: ${s.ticks.length} ticks is a readable number`);
    assert.ok(s.ticks.every((t) => isFinite(t)), 'no NaN tick');
    for (let i = 1; i < s.ticks.length; i++) assert.ok(s.ticks[i] > s.ticks[i - 1], 'ticks ascend');
  }
});

/* ══ ⑤ COLOUR IS A TOKEN, AND NUMBERS GO THROUGH Intl (#R492) ════════════════════════════════ */
test('R543 ⑤: the renderer writes no colour of its own and rolls no number table of its own', () => {
  const html = [LINE, BARS, TIME].map((s) => CH.render(s).html).join('');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(html), 'no hex colour reaches the reply — css/ owns every hue');
  assert.match(html, /var\(--chart-cat-1\)/, 'series colour comes from the token');
  const src = R('js/atlas-chart.js');
  assert.ok(!/toLocaleString\(\)/.test(src), 'a locale-less toLocaleString is the #R492 defect');
  /* ⚠ the claim is "no hand-rolled magnitude table", NOT "the letter M never appears" — an SVG path
     command IS 'M'. So assert the shape such a table actually has: a division by a power of ten
     concatenated to a unit letter, which is exactly what the four existing charts do and what
     #R492 recorded as the defect. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/1e(3|6|9|12)\)/.test(code), 'no /1e9 magnitude division');
  assert.ok(!/\+\s*'(k|M|B|T)'/.test(code), "no unit letter concatenated onto a scaled number");
  assert.match(code, /Intl\.NumberFormat|IntMapWidgetCore/, '…and the formatting it does use is Intl in the app locale');
  /* the palette it names is the one the stylesheet defines, all ten of them */
  const css = R('js/atlas-styles.js');
  for (let i = 1; i <= 10; i++) assert.ok(css.includes('--chart-cat-' + i + ':'), '--chart-cat-' + i + ' is defined');
  assert.match(css, /\[data-theme="dark"\][^']*--chart-cat-1:/, 'and redefined for dark mode');
});

/* ══ ⑥ THE OBSERVER READS THE ARTEFACT, NOT THE CLAIM ════════════════════════════════════════ */
test('R543 ⑥: the chart observer counts the marks that shipped; an empty figure is not_rendered', () => {
  const cap = CAPS.resolve('chart.compose');
  const O = CAPS.OBSERVERS.chart;
  assert.ok(cap, 'chart.compose is in the registry');
  assert.equal(cap.observerKind, 'chart', 'and it is watched by the chart observer');
  assert.deepEqual(cap.produces, ['chart', 'explanation'], 'it declares the output the gate holds it to');
  assert.deepEqual(cap.lazyModules, ['atlasChart'], 'and the module that has to arrive first');
  assert.ok(O, 'the chart observer exists');

  const drawn = CH.render(BARS);
  {
    const good = O.verify({}, {}, null, null, { ok: true, html: drawn.html, meta: { chart: { kind: 'bar', plotted: drawn.plotted } } });
    assert.equal(good.status, 'completed');
    /* ⚠ ok around an empty figure is NOT a completed chart — the same verdict `paint` gives a draw
       that painted nothing. This is the check that stops a broken renderer reporting success. */
    const empty = O.verify({}, {}, null, null, { ok: true, html: '<figure></figure>', meta: { chart: { kind: 'bar', plotted: 3 } } });
    assert.equal(empty.status, 'partial');
    assert.equal(empty.code, 'not_rendered');
    /* and a disagreement between the claim and the artefact is caught too */
    const lying = O.verify({}, {}, null, null, { ok: true, html: drawn.html, meta: { chart: { kind: 'bar', plotted: 99 } } });
    assert.equal(lying.status, 'partial');
    const failed = O.verify({}, {}, null, null, { ok: false, html: '' });
    assert.equal(failed.status, 'failed');
  }
});

/* ══ ⑦ THE GATE IS ONE GATE OVER A SET ═══════════════════════════════════════════════════════ */
function scripted(replies) {
  let i = 0;
  const fn = async () => { const r = replies[Math.min(i, replies.length - 1)]; i++; return r; };
  fn.count = () => i;
  return fn;
}
const TOOLS = { zzz: { name: 'zzz', description: 'makes', parameters: { type: 'object', required: ['x'], properties: { x: { type: 'string', minLength: 1 } } } } };

test('R543 ⑦: a "chart" final with nothing produced is bounced as chart_not_drawn; a produced chart passes', async () => {
  const notes = [];
  const model = scripted([
    { text: 'Here is the trend.', toolCalls: [], answerMode: 'chart' },
    { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'go' } }], answerMode: 'chart' },
    { text: 'Here is the trend.', toolCalls: [], answerMode: 'chart' },
  ]);
  const out = await AGENT.runTurn({ model, tools: TOOLS,
    execute: async () => ({ ok: true, status: 'completed', producedModes: ['chart', 'explanation'] }),
    messages: [{ role: 'user', content: 'chart it' }] });
  (out.trace.steps || []).forEach((s) => { if (s.bounced) notes.push(s.bounced); });
  assert.deepEqual(notes, ['chart_not_drawn'], 'bounced once, under its own name');
  assert.equal(out.trace.outputGate, 1);
  assert.equal(out.answerMode, 'chart');
  assert.ok(out.produced.includes('chart'), 'the record says a chart was produced');
  assert.equal(out.mapDrawn, false, '…and that no map was');
});

test('R543 ⑧: "mixed" is satisfied by EITHER output — a widening, so nothing #R511 accepted is refused now', async () => {
  const byChart = await AGENT.runTurn({ model: scripted([{ text: 'both', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'g' } }], answerMode: 'mixed' }, { text: 'both', toolCalls: [], answerMode: 'mixed' }]),
    tools: TOOLS, execute: async () => ({ ok: true, status: 'completed', producedModes: ['chart'] }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(byChart.trace.outputGate, 0, 'a chart satisfies "mixed"');

  /* ⚠ #R511's own signal still satisfies it: a caller driving runTurn with its own execute sets
     `changedMap` and nothing else, and demoting that would break the contract they were given. */
  const byMap = await AGENT.runTurn({ model: scripted([{ text: 'both', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'g' } }], answerMode: 'mixed' }, { text: 'both', toolCalls: [], answerMode: 'mixed' }]),
    tools: TOOLS, execute: async () => ({ ok: true, changedMap: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(byMap.trace.outputGate, 0, 'and so does a map');
  assert.equal(byMap.mapDrawn, true);
});

test('R543 ⑨: the vocabulary widened and the gate stayed ONE gate', () => {
  assert.deepEqual(AGENT.ANSWER_MODES, ['text', 'map', 'chart', 'mixed']);
  assert.deepEqual(AGENT.TURN_SCHEMA.properties.answer_mode.enum, AGENT.ANSWER_MODES, 'the schema reads the same list');
  assert.deepEqual(AGENT.TURN_SCHEMA.required, ['final_text'], 'declaring a mode is still not required');
  const agent = R('js/atlas-agent.js');
  /* the whole point of the round: adding a modality did not add a second bounce beside the first */
  assert.equal((agent.match(/gateBounces\+\+/g) || []).length, 1, 'there is exactly one place a final is handed back');
  assert.equal((agent.match(/trace\.outputGate\+\+/g) || []).length, 1);
  assert.ok(!/wantsMap|wantsChart/.test(agent), 'no per-modality branch survived the generalisation');
  /* and the tool surface stops discarding the rest of the produces column */
  assert.match(R('js/atlas-toolsurface.js'), /out\.producedModes = out\.produced\.slice\(\)/);
});

/* ══ ⑩ THE CAPABILITY IS REGISTERED, SCHEMA'D, CATALOGUED, TOOLED AND DISPATCHED ═════════════ */
test('R543 ⑩: chart.compose is reachable by every route Atlas actually has', () => {
  const sch = SCHEMAS.schemaFor('chart.compose');
  assert.ok(sch && sch.properties && Object.keys(sch.properties).length, 'it declares its arguments');
  assert.ok((sch.required || []).includes('source'), 'and `source` is required at the schema too, not only in the renderer');

  assert.ok(DOCS.idsCovered().includes('chart.compose'), 'the planner is told it exists');
  /* check:catalog matches the double-quoted spelling inside the block, so assert the real thing */
  assert.match(DOCS.text(['chart.compose']), /"type":"chart"/);

  const tools = R('js/atlas-toolsurface.js');
  assert.match(tools, /name: 'chart', cap: 'chart\.compose'/, 'it is a CORE tool, not something only find_capability can reach');

  const con = R('js/atlas-console.js');
  assert.match(con, /^ {8}case 'chart': case 'chartCompose': case 'plot': case 'graph':/m,
    'the dispatch door starts a line at eight spaces — scripts/atlas-catalog.mjs reads it there');
  assert.match(con, /IntMapLazy\.need\('atlasChart'\)/, 'and it is lazy');
  /* the renderer must NOT be in the boot graph: tests/perf-baseline.json pins eager.modules exactly */
  assert.ok(!/^import .*atlas-chart\.js/m.test(con), 'no static import of the renderer');
  const lazy = R('js/lazy-modules.js');
  assert.match(lazy, /atlasChart: 'IntMapAtlasChart'/, 'the published global is declared');
  assert.match(lazy, /case 'atlasChart': return import\('\.\/atlas-chart\.js'\)/, 'the loader knows the file');
  assert.match(lazy, /case 'atlasChart': window\.IntMapAtlasChart=/, 'and the mounter publishes it');
});

/* ══ ⑪ THE CATALOGUE ARRAY HAS NO HOLES ══════════════════════════════════════════════════════
   Found while adding a block: `js/atlas-catalog-text.js` carried `},,` between the gloss block and
   the compose block. `length` said 46 and forty-five existed; Architecture.md had copied the 46
   down. The check whose job was "no block is empty" iterated with forEach, which SKIPS a hole —
   so it could not see the one empty block in the file. This asserts the structure, not the count. */
test('R543 ⑪: every catalogue block exists — a stray comma makes a hole that forEach cannot see', () => {
  const blocks = DOCS.blocks();
  const missing = [];
  for (let i = 0; i < blocks.length; i++) if (!(i in blocks)) missing.push(i);
  assert.deepEqual(missing, [], 'the array literal has no elided element');
  assert.equal(Object.keys(blocks).length, blocks.length, 'length and population agree');
  blocks.forEach((b) => assert.ok(b.bytes > 0, 'and no block is empty'));
});

/* ══ ⑫ THE VIEW AN ANSWER WAS DRAWN IN ════════════════════════════════════════════════════════
   The overlay snapshot and its chip have repainted an answer's SHAPES since #R118. What no
   snapshot carried was the view — the camera, and for this app above all THE CLOCK. A reply about
   1950 whose shapes are repainted over a 2026 basemap is not that reply's map. ⚠ The assertion
   that matters most here is the negative one: layers the reader turned on afterwards stay on. */
function mkDoc(active, layers) {
  const els = {};
  ['btn-view-sat', 'btn-view-3d', 'btn-view-flat'].forEach((id) => {
    els[id] = { id, clicked: 0, classList: { contains: (c) => c === 'active' && active.includes(id) }, click() { els[id].clicked++; } };
  });
  Object.keys(layers).forEach((id) => { els[id] = { id, checked: layers[id], click() { els[id].checked = true; } }; });
  return { getElementById: (id) => els[id] || null, querySelectorAll: () => Object.keys(layers).map((id) => els[id]), _els: els };
}
const SNAP = {
  camera: { lat: 37.5, lng: 127.0, zoom: 6.2, bearing: 10, pitch: 30, base: 'satellite', projection: 'flat' },
  time: { live: false, travelDate: '1950-06-25', instant: '1950-06-25T00:00:00.000Z' },
  activeLayers: [{ id: 'dl-wars' }, { id: 'dl-borders' }],
};

test('R543 ⑫: the view is restored exactly — and a layer the reader added afterwards is LEFT ON and reported', () => {
  const flights = [], times = [], execs = [];
  const doc = mkDoc([], { 'dl-wars': true, 'dl-borders': false, 'dl-quakes': true });
  const AV = makeAtlasAnswerView({}, {
    GE: () => ({ camera: { flyTo: (o) => flights.push(o) } }),
    time: { set: (d, o) => times.push([d.toISOString(), o && o.source]) },
    os: { exec: (cap, a) => execs.push([cap, a.params.id]) },
    doc,
  });
  const r = AV.apply(SNAP, { duration: 0 });

  assert.equal(r.ok, true);
  assert.deepEqual(r.skipped, [], 'nothing was skipped when everything was present');
  assert.equal(doc._els['btn-view-sat'].clicked, 1, 'the basemap it was drawn on');
  assert.equal(doc._els['btn-view-flat'].clicked, 1, 'and the projection');
  assert.equal(doc._els['btn-view-3d'].clicked, 0, 'the projection it was NOT drawn in is left alone');
  assert.deepEqual(times, [['1950-06-25T00:00:00.000Z', 'ui']], 'the clock goes back to the instant the answer was written at');
  assert.deepEqual(flights[0].center, [127, 37.5]);
  assert.equal(flights[0].zoom, 6.2);

  /* ⚠⚠ the negative assertions — this is the behaviour the header commits to */
  assert.deepEqual(execs, [['layer.on', 'dl-borders']], 'only the layer that was missing is switched on');
  assert.equal(doc._els['dl-quakes'].checked, true, 'a layer the reader enabled AFTER this answer is not switched off');
  assert.deepEqual(r.extraLayers, ['dl-quakes'], '…and the caller is told, so it can say so instead of claiming an identical view');
});

test('R543 ⑬: what it could not do is reported, never claimed — and an empty snapshot is not a success', () => {
  /* a page with none of the controls on it, no renderer, no clock and no kernel */
  const bare = { getElementById: () => null, querySelectorAll: () => [] };
  const AV = makeAtlasAnswerView({}, { GE: () => null, time: null, os: null, doc: bare });
  const r = AV.apply(SNAP, { duration: 0 });
  assert.equal(r.ok, false, 'nothing could be applied, so it does not report success');
  assert.ok(r.skipped.some((s) => s.startsWith('time')), 'a missing clock is skipped with a reason');
  assert.ok(r.skipped.some((s) => s.startsWith('camera')), 'so is a missing renderer');
  assert.ok(r.skipped.some((s) => s.startsWith('basemap')), '…and a control that is not on the page');
  assert.deepEqual(r.applied, [], 'nothing is claimed');

  const nothing = AV.apply(null);
  assert.equal(nothing.ok, false);

  /* the module is reachable the same way the renderer is */
  const lazy = R('js/lazy-modules.js');
  assert.match(lazy, /atlasAnswerView: 'IntMapAnswerView'/);
  assert.match(lazy, /case 'atlasAnswerView': return import\('\.\/atlas-answer-view\.js'\)/);
  assert.match(lazy, /case 'atlasAnswerView': window\.IntMapAnswerView=/);
  /* the capture rides on the snapshot the bubble already carried, not a second mechanism */
  assert.match(R('js/atlas-console.js'), /ai\.__viewSnap=ASTATE\.snapshot\(\{only:\['camera','time','activeLayers'\]\}\)/);
  /* and the button is a SIBLING of the bubble, because _atlCompose rebuilds the bubble (#R492) */
  const mt = R('js/atlas-msg-tools.js');
  assert.match(mt, /aiEl\.__viewSnap/);
  assert.match(mt, /IntMapLazy\.need\('atlasAnswerView'\)/);
  assert.match(mt, /insertAdjacentElement\('afterend',bar\)/);
});

/* ══ ⑭ THE PICTURE IS TRUE TO THE NUMBERS ═════════════════════════════════════════════════════
   Everything above proves the renderer runs, refuses well and reports honestly. None of it proves
   the drawing is CORRECT — a chart that renders beautifully and puts the bars in the wrong
   proportion is worse than no chart, because it is a confident wrong answer. These read the
   geometry back out of the emitted SVG and check it against the arithmetic. */
test('R543 ⑭: bar length is proportional to the value, and zero is where zero is', () => {
  const r = CH.render({ kind: 'bar', source: 'S', series: [{ points: [{ label: 'A', y: 40 }, { label: 'B', y: 10 }, { label: 'C', y: -20 }] }] });
  const bars = [...r.html.matchAll(/left:([\d.]+)%;width:([\d.]+)%/g)].map((m) => ({ left: +m[1], width: +m[2] }));
  assert.equal(bars.length, 3);
  /* the domain is min(0,-20) .. max(0,40) = 60 wide, so zero sits a third of the way across */
  const zero = 20 / 60 * 100;
  assert.ok(Math.abs(bars[0].width - 40 / 60 * 100) < 0.05, '40 spans 40/60 of the track');
  assert.ok(Math.abs(bars[1].width - 10 / 60 * 100) < 0.05, '10 spans 10/60');
  assert.ok(Math.abs(bars[0].width / bars[1].width - 4) < 0.01, 'four times the value is four times the bar');
  assert.ok(Math.abs(bars[0].left - zero) < 0.05 && Math.abs(bars[1].left - zero) < 0.05, 'positives start at zero');
  assert.ok(Math.abs(bars[2].left) < 0.05, 'the negative one runs leftwards from zero, not rightwards');
  assert.ok(Math.abs(bars[2].left + bars[2].width - zero) < 0.05, '…and ends exactly at zero');
});

test('R543 ⑭b: the value axis is linear and its gridlines are where the values land', () => {
  const r = CH.render({ kind: 'line', source: 'S', series: [{ label: 'a', points: [{ x: 0, y: 0 }, { x: 1, y: 50 }, { x: 2, y: 100 }] }] });
  const d = /class="atl-ch-l"[^>]*d="([^"]+)"/.exec(r.html)[1];
  const xy = d.trim().split(/[ML]\s*/).filter(Boolean).map((p) => p.trim().split(/\s+/).map(Number));
  assert.equal(xy.length, 3);
  assert.ok(xy[0][1] > xy[1][1] && xy[1][1] > xy[2][1], 'a bigger value is higher on screen');
  assert.ok(Math.abs((xy[0][1] - xy[1][1]) - (xy[1][1] - xy[2][1])) < 0.15, 'equal value steps are equal pixel steps');
  assert.ok(xy[0][0] < xy[1][0] && xy[1][0] < xy[2][0], 'x advances left to right');
  const gridY = [...r.html.matchAll(/class="atl-ch-g"[^>]*y1="([\d.]+)"/g)].map((m) => +m[1]);
  assert.equal(gridY.length, CH.niceScale(0, 100, 4).ticks.length, 'one gridline per tick');
  assert.ok(Math.abs(Math.min(...gridY) - xy[2][1]) < 0.15, 'the top gridline is where the maximum sits');
  assert.ok(Math.abs(Math.max(...gridY) - xy[0][1]) < 0.15, 'and the bottom one where the minimum does');
});

test('R543 ⑭c: a timeline places events by TIME, not by their order in the list', () => {
  const evs = [{ t: '2000-01-01', label: 'a' }, { t: '2001-01-01', label: 'b' }, { t: '2010-01-01', label: 'c' }];
  const r = CH.render({ kind: 'timeline', source: 'S', events: evs });
  const cx = [...r.html.matchAll(/class="atl-ch-p"[^>]*cx="([\d.]+)"/g)].map((m) => +m[1]);
  assert.equal(cx.length, 3);
  const t = evs.map((e) => Date.parse(e.t));
  const want = (t[1] - t[0]) / (t[2] - t[0]);
  const got = (cx[1] - cx[0]) / (cx[2] - cx[0]);
  assert.ok(Math.abs(got - want) < 0.005, `the middle event sits at ${want.toFixed(4)} of the span, got ${got.toFixed(4)}`);
  /* ⚠ the whole point: one year then nine years must NOT look like two equal steps */
  assert.ok(got < 0.2, 'an index-based axis would have put it at 0.5; this is a time axis');
});

test('R543 ⑭d: a scatter draws no trend line it was not given', () => {
  const r = CH.render({ kind: 'scatter', source: 'S', series: [{ label: 'a', points: [{ x: 1, y: 9 }, { x: 5, y: 2 }, { x: 9, y: 7 }] }] });
  assert.ok(!/class="atl-ch-l"/.test(r.html), 'no path — the reader is not shown a relationship the data was not asked to support');
  assert.equal((r.html.match(/class="atl-ch-p"/g) || []).length, 3);
});

/* ══ ⑮ THE SPOKEN LABEL IS THE WHOLE CHART FOR A READER WHO CANNOT SEE IT ══════════════════════
   ⚠⚠ AND THIS TEST FILE COULD NOT SEE THE DEFECT UNTIL IT STOPPED TAKING THE FALLBACK. Under node
   there is no `window.IntMapWidgetCore`, so `num()` fell into its own catch and returned
   `String(v)` — every assertion above about formatting was measuring the fallback, not the path
   that ships. In the browser the real formatter applied the axis's COMPACT notation to the spoken
   sentence too, and 2000..2020 both became "2K": a stated range containing no range, for the one
   reader with nothing else to go on. #R505's rule, arriving through the accessibility door. */
test('R543 ⑮: with the real number formatter mounted, the aria range does not collapse', () => {
  const nf = {};
  const prev = globalThis.window.IntMapWidgetCore;
  globalThis.window.IntMapWidgetCore = {
    locale: () => 'en-GB',
    num: (v, o) => { const k = JSON.stringify(o || {}); if (!nf[k]) nf[k] = new Intl.NumberFormat('en-GB', o || {}); return nf[k].format(v); },
  };
  try {
    const C = makeAtlasChart({ lang: 'en' }, { L: (en) => en, esc });
    const aria = (spec) => /aria-label="([^"]*)"/.exec(C.render(spec).html)[1];

    const pts = [{ x: 2000, y: 1 }, { x: 2010, y: 2 }, { x: 2020, y: 3 }];
    const plain = aria({ kind: 'line', source: 'S', series: [{ label: 'a', points: pts }] });
    assert.ok(/2,?000/.test(plain) && /2,?020/.test(plain), `the spoken range names both ends: ${plain}`);
    assert.ok(!/2K.*2K/.test(plain), 'the two ends are not both "2K"');

    /* the AXIS keeps the compact form — it has millimetres, not a sentence. ⚠ asserted as a
       PROPERTY (the label is far shorter than the written-out number) rather than as a spelling:
       en-GB compacts a million to "1m", en-US to "1M", and pinning either would be a check that
       passes in one locale and fails in the next for no defect at all. */
    const svg = C.render({ kind: 'line', source: 'S', series: [{ label: 'a', points: [{ x: 0, y: 1000 }, { x: 1, y: 500000 }, { x: 2, y: 1000000 }] }] }).html;
    const ticks = [...svg.matchAll(/class="atl-ch-ax"[^>]*>([^<]*)</g)].map((m) => m[1]);
    const top = ticks.find((t) => /^[\d.]+\s*\D+$/.test(t) && t.length <= 4);
    assert.ok(top, `a million on the value axis is drawn compactly, not as 1,000,000 — got ${JSON.stringify(ticks)}`);
    assert.ok(!ticks.some((t) => t.includes('1,000,000')), 'the axis does not spell the whole number out');

    /* and a declared year axis reads as a year in both places, with no thousands separator */
    const yr = aria({ kind: 'line', source: 'S', x: { type: 'year' }, series: [{ label: 'a', points: pts }] });
    assert.ok(yr.includes('2000') && yr.includes('2020'), `a year axis speaks years: ${yr}`);
    assert.ok(!yr.includes('2,000'), 'a year is not a quantity, so it carries no group separator');
  } finally { globalThis.window.IntMapWidgetCore = prev; }
});

/* ══ ⑯ THE WHOLE PATH, NOT THE PIECES ═════════════════════════════════════════════════════════
   Everything above tests a part. This drives the SHIPPED tool surface over the REAL registry and
   the REAL schemas, so what is proved is that a `chart` tool call becomes the legacy action the
   dispatch speaks, and that the registry's `produces` column is what ends up satisfying the gate —
   no test-only wiring in between. ⚠ This is the assertion that would have caught the whole feature
   being reachable in theory and dead in practice (#R493's shape). */
test('R543 ⑯: `chart` is a CORE tool over chart.compose, and the surface stamps the chart from produces+status', async () => {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async (a) => {
    ran.push(a);
    if (a.type === 'chart') return { ok: true, html: '<figure data-mark="1"/>', meta: { status: 'completed', produced: ['chart', 'explanation'], chart: { kind: 'bar', plotted: 1 } } };
    return { ok: false, meta: { code: 'failed' }, error: 'no' };
  } });

  const core = surface.CORE.find((c) => c.name === 'chart');
  assert.ok(core, 'chart is in CORE — the output gate names it as the recovery, so the model must be able to see it');
  assert.equal(core.cap, 'chart.compose');

  const tools = surface.baseTools();
  assert.ok(tools.chart, 'present on every turn');
  assert.ok(tools.chart.parameters.required.includes('source'), 'the schema demands provenance too, not only the renderer');
  assert.deepEqual(tools.chart.parameters.properties.kind.enum, ['line', 'bar', 'scatter', 'timeline']);

  const exec = surface.makeExecute(tools, AGENT);
  const a = await exec({ name: 'chart', arguments: { kind: 'bar', source: 'EDGAR 2024', series: [{ points: [{ label: 'x', y: 1 }, { label: 'y', y: 2 }] }] } });
  assert.equal(a.ok, true);
  assert.equal(ran[0].type, 'chart', 'the tool call became the legacy action the dispatch speaks');
  assert.ok(Array.isArray(a.producedModes) && a.producedModes.includes('chart'),
    'the surface hands the loop the whole produces column, which is what makes answer_mode "chart" satisfiable');
  assert.notEqual(a.changedMap, true, 'and a chart is NOT a map — the two outputs stay distinguishable');

  /* ⚠ AND THE SCHEMA IS ENFORCED BY THE LOOP, NOT BY `makeExecute`. Measured: calling exec directly
     with `{kind:'bar'}` and no `source` runs it — `reject()` is what stands between a model's call
     and the dispatch, and it is in js/atlas-agent.js. So the claim worth asserting is the one that
     is true in operation: a chart call missing its provenance never reaches the renderer at all.
     (The renderer's own `no_source` refusal, tested in ①, is the second line for anything that
     arrives by another door — the two are belt and braces, not a duplicate.) */
  ran.length = 0;
  const notes = [];
  const model = async (req) => {
    (req.messages || []).filter((m) => m.role === 'tool').forEach((m) => (m.content || []).forEach((c) => notes.push(c)));
    return notes.length ? { text: 'answered in words instead', toolCalls: [] }
      : { text: '', toolCalls: [{ id: 'a', name: 'chart', arguments: { kind: 'bar' } }] };
  };
  const out = await AGENT.runTurn({ model, tools, execute: exec, messages: [{ role: 'user', content: 'chart it' }] });
  assert.equal(out.trace.rejected, 1, 'the call was rejected');
  assert.equal(ran.length, 0, '…and never reached the dispatch');
  assert.ok(notes.some((n) => n && n.error === 'invalid_arguments'), 'Atlas is told WHY, so it can supply the source and try again');
});
