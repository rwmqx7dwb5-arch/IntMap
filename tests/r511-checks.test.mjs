/* ============================================================================
 *  R511 — THE MAP AS AN OUTPUT MODALITY: `answer_mode`, held by code; `map.compose`, one call
 * ----------------------------------------------------------------------------
 *  These drive the SHIPPED modules — js/atlas-agent.js, js/atlas-toolsurface.js over the real
 *  registry and schemas, js/atlas-map-compose.js over the real geo ledger — with a scripted model,
 *  a scripted geocoder and a fake engine. Nothing here is a copy of the implementation.
 *
 *  ⚠ NO TEST HERE MATCHES ON THE USER'S WORDS, and none makes the LOOP know a tool's name: the gate
 *  reads a flag on a RESULT (`changedMap`), the way #R419's `endsTurn` is read. ⑤ proves it with a
 *  tool called `zzz`. What is asserted is what the loop does with what Atlas DECLARED.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

/* ── a scripted model ─────────────────────────────────────────────────────────────────────── */
function scripted(replies) {
  const seen = [];
  let i = 0;
  const fn = async (req) => { seen.push(req); const r = replies[Math.min(i, replies.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; };
  fn.seen = seen; fn.count = () => i;
  return fn;
}
const TOOLS = {
  zzz: { name: 'zzz', description: 'draws', parameters: { type: 'object', required: ['x'], properties: { x: { type: 'string', minLength: 1 } } } },
  web_search: { name: 'web_search', description: 'search', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1 } } } },
};
/* what the transcript showed the model on a given step, as the loop hands it over */
const toolNotes = (req) => (req.messages || []).filter((m) => m.role === 'tool').flatMap((m) => m.content || []);

/* ══ ① the gate: a "map" final with nothing drawn is handed back ONCE, then the drawn one passes ═══ */
test('R511 ①: a "map" final before anything drew is bounced as map_not_drawn; after compose it is accepted', async () => {
  const model = scripted([
    { text: 'ここがホルムズ海峡です。', toolCalls: [], answerMode: 'map' },                                  /* step 0: says map, drew nothing */
    (req) => {                                                                                                   /* step 1: sees the note, draws */
      const notes = toolNotes(req);
      assert.equal(notes.length, 1, 'exactly one note came back');
      assert.equal(notes[0].error, 'map_not_drawn');
      assert.match(notes[0].message, /answer_mode "map"/);
      assert.match(notes[0].message, /compose_map/, 'the note names the one-call tool');
      return { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'hormuz' } }], answerMode: 'map' };
    },
    { text: 'ホルムズ海峡①を地図に示しました。', toolCalls: [], answerMode: 'map' },
  ]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true, changedMap: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(out.stopped, 'answered');
  assert.equal(out.text, 'ホルムズ海峡①を地図に示しました。');
  assert.equal(out.answerMode, 'map');
  assert.equal(out.mapDrawn, true);
  assert.equal(out.trace.mapGate, 1);
  assert.equal(model.count(), 3, 'three model calls: the bounced final, the draw, the accepted final');
});

/* ══ ② R406 ① unchanged: a "text" answer (or none declared) on step 0 ends the turn with nothing run ═ */
test('R511 ②: "text" — and an undeclared mode — end the turn on step 0 exactly as before', async () => {
  for (const mode of ['text', '', undefined]) {
    let executed = 0;
    const model = scripted([{ text: 'La Seine fait environ 777 km.', toolCalls: [], answerMode: mode }]);
    const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => { executed++; return { ok: true }; }, messages: [{ role: 'user', content: 'x' }] });
    assert.equal(out.stopped, 'answered');
    assert.equal(executed, 0);
    assert.equal(model.count(), 1, `mode=${JSON.stringify(mode)}: one call, no bounce`);
    assert.equal(out.trace.mapGate, 0);
    assert.equal(out.mapDrawn, false);
  }
});

/* ══ ③ the bounce is bounded — a model that insists still terminates, and its words are kept ══════ */
test('R511 ③: after maxMapGate bounces a "mixed" final with nothing drawn is accepted as it stands', async () => {
  const model = scripted([{ text: 'The map would show it.', toolCalls: [], answerMode: 'mixed' }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(out.stopped, 'answered');
  assert.equal(out.trace.mapGate, AGENT.LIMITS.maxMapGate);
  assert.equal(model.count(), AGENT.LIMITS.maxMapGate + 1);
  assert.equal(out.text, 'The map would show it.', 'the reader still gets the sentence');
  assert.equal(out.answerMode, 'mixed');
  assert.equal(out.mapDrawn, false, '…and the record says the map was NOT drawn, so the caller can see the disagreement');
  /* it never bounces into the last step: with maxSteps 2 the first final is accepted */
  const m2 = scripted([{ text: 'x', toolCalls: [], answerMode: 'map' }]);
  const o2 = await AGENT.runTurn({ model: m2, tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'x' }], limits: { maxSteps: 2 } });
  assert.equal(o2.trace.mapGate, 1);
  assert.equal(o2.stopped, 'answered');
});

/* ══ ④ readReply: the declaration is read off the envelope; anything else is no declaration ════════ */
test('R511 ④: readReply reads answer_mode and TURN_SCHEMA declares it as an enum', () => {
  assert.equal(AGENT.readReply({ final_text: 'a', answer_mode: 'map' }, '', JSON.parse).answerMode, 'map');
  assert.equal(AGENT.readReply({ final_text: 'a', answer_mode: 'MIXED' }, '', JSON.parse).answerMode, 'mixed');
  assert.equal(AGENT.readReply({ final_text: 'a', answer_mode: 'picture' }, '', JSON.parse).answerMode, '');
  assert.equal(AGENT.readReply({ final_text: 'a' }, '', JSON.parse).answerMode, '');
  assert.deepEqual(AGENT.TURN_SCHEMA.properties.answer_mode.enum, ['text', 'map', 'mixed']);
  assert.deepEqual(AGENT.TURN_SCHEMA.required, ['final_text'], 'declaring a mode is not required — an ordinary answer stays an ordinary answer');
  assert.deepEqual(AGENT.ANSWER_MODES, ['text', 'map', 'mixed']);
});

/* ══ ⑤ the flag, not the name: only a SUCCESSFUL result with changedMap counts ═══════════════════ */
test('R511 ⑤: the gate reads `changedMap` on a successful result — a failed draw does not satisfy it', async () => {
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'p' } }], answerMode: 'map' },
    { text: 'done', toolCalls: [], answerMode: 'map' },
    { text: 'done', toolCalls: [], answerMode: 'text' },
  ]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: false, error: 'failed', changedMap: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(out.trace.mapGate, 1, 'the failed draw did not count, so the "map" final was bounced once');
  assert.equal(out.mapDrawn, false);
  /* and a successful one, whatever the tool is called, does */
  const m2 = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'p' } }], answerMode: 'map' },
    { text: 'done', toolCalls: [], answerMode: 'map' },
  ]);
  const o2 = await AGENT.runTurn({ model: m2, tools: TOOLS, execute: async () => ({ ok: true, changedMap: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(o2.trace.mapGate, 0);
  assert.equal(o2.mapDrawn, true);
  assert.equal(m2.count(), 2);
});

/* ══ ⑥ the surface: compose_map is CORE, its schema is real, and `changedMap` is stamped from the registry ═ */
test('R511 ⑥: compose_map is a CORE tool over map.compose, and the surface stamps changedMap from produces+status', async () => {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async (a) => {
    ran.push(a);
    if (a.type === 'compose') return { ok: true, html: '<div/>', meta: { status: 'completed', produced: ['map', 'explanation'] } };
    if (a.type === 'analyze') return { ok: true, html: '<div/>', meta: { status: 'completed', produced: ['explanation'] } };
    if (a.type === 'highlight') return { ok: true, html: '', meta: { status: 'partial', produced: ['map'], unverified: true } };
    return { ok: false, meta: { code: 'failed' }, error: 'no' };
  } });
  const core = surface.CORE.find((c) => c.name === 'compose_map');
  assert.ok(core, 'compose_map is in CORE');
  assert.equal(core.cap, 'map.compose');
  const tools = surface.baseTools();
  assert.ok(tools.compose_map, 'present on every turn');
  assert.deepEqual(tools.compose_map.parameters.required, ['items']);
  assert.equal(tools.compose_map.parameters.properties.items.minItems, 1);
  assert.ok(!('lat' in tools.compose_map.parameters.properties.items.items.properties), 'no coordinate field for the model to fill');
  assert.match(tools.compose_map.description, /never write coordinates/i);
  const exec = surface.makeExecute(tools, AGENT);
  const a = await exec({ name: 'compose_map', arguments: { items: [{ name: 'Strait of Hormuz', country: 'Iran' }] } });
  assert.equal(a.ok, true); assert.equal(a.changedMap, true, 'a completed map-producing capability changed the map');
  assert.equal(ran[0].type, 'compose', 'the tool call became the legacy action the dispatch speaks');
  const b = await exec({ name: 'research', arguments: { question: 'why' } });
  assert.equal(b.changedMap, undefined, 'an explanation-only capability did not');
  const c = await exec({ name: 'highlight', arguments: { countries: ['Iran'] } });
  assert.equal(c.changedMap, undefined, 'a partial (nothing painted) did not');
  /* schema: a call with no items is rejected before anything runs */
  const bad = AGENT.reject({ name: 'compose_map', arguments: { title: 'x' } }, tools);
  assert.equal(bad && bad.code, 'invalid_arguments');
});

/* ══ ⑦ the compose module over the real ledger, a scripted geocoder and a fake engine ═════════════ */
function fakeEngine(preset) {
  const calls = { addSource: [], addLayer: [], addBefore: [], setSourceData: [], flyTo: [], fitBounds: [], setVisible: [] };
  const layers = new Set(preset || []), sources = new Set();
  let data = null;
  const g = {
    layers: {
      hasSource: (id) => sources.has(id), addSource: (id) => { sources.add(id); calls.addSource.push(id); },
      setSourceData: (id, d) => { data = d; calls.setSourceData.push(id); }, has: (id) => layers.has(id),
      add: (d, before) => { layers.add(d.id); calls.addLayer.push(d.id); calls.addBefore.push(before); }, setVisible: (id, v) => calls.setVisible.push([id, v]),
      getLayout: () => 'visible', setFilter: () => {},
    },
    camera: { flyTo: (o) => calls.flyTo.push(o), fitBounds: (b, o) => calls.fitBounds.push([b, o]), getZoom: () => 3 },
    events: { onLayer: () => {}, on: () => {} },
    render: { canvas: () => ({ style: {} }) },
  };
  return { GE: () => g, calls, data: () => data, layers };
}
const GEO = { 'strait of hormuz, iran': { lng: 56.5, lat: 26.6, name: 'Strait of Hormuz' }, 'strait of malacca, malaysia': { lng: 100.8, lat: 2.5, name: 'Strait of Malacca' },
  'kotovsk, russia': { lng: 41.99, lat: 52.59, name: 'Kotovsk' }, 'tokyo, japan': { lng: 139.69, lat: 35.69, name: 'Tokyo' }, 'san francisco, united states': { lng: -122.42, lat: 37.77, name: 'San Francisco' } };
function makeCompose(opts) {
  const eng = fakeEngine(opts && opts.layers);
  const GEOBJ = makeAtlasGeoObject();
  const ledger = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  const asked = [];
  const geocode = async (q) => { asked.push(q); const k = String(q).toLowerCase(); if (opts && opts.hang && opts.hang.test(q)) return new Promise(() => {}); return GEO[k] || null; };
  const dispatched = [];
  const dispatch = async (a) => { dispatched.push(a); return { ok: a.countries ? a.countries[0] !== 'Atlantis' : true }; };
  const C = makeAtlasMapCompose({ GE: eng.GE, geocode, ledger, geoObject: GEOBJ.geoObject, dispatch, itemTimeoutMs: (opts && opts.itemTimeoutMs) || 8000, passBudgetMs: (opts && opts.passBudgetMs) || 26000 });
  return { C, eng, ledger, asked, dispatched };
}

test('R511 ⑦a: ledger first, geocoder second, the country appended once — and every result files back with its role', async () => {
  const { C, eng, ledger, asked } = makeCompose();
  ledger.record({ name: 'Bab-el-Mandeb', kind: 'water', countryCode: 'YE', lng: 43.3, lat: 12.6, provenance: 'geocoded_point' });
  const r = await C.run({ title: '中国の原油輸入路', items: [
    { name: 'Bab-el-Mandeb', country: 'Yemen', kind: 'water', role: '紅海の出口' },
    { name: 'Strait of Hormuz', country: 'Iran', kind: 'water', role: '入口' },
    { name: 'Kotovsk, Russia', country: 'Russia', kind: 'city' },
  ] });
  assert.equal(r.ok, true);
  assert.ok(!asked.some((q) => /bab-el-mandeb/i.test(q)), 'a place the ledger knows is not geocoded again');
  assert.ok(asked.includes('Strait of Hormuz, Iran'), 'an unknown place is asked for WITH its country');
  assert.ok(asked.includes('Kotovsk, Russia') && !asked.includes('Kotovsk, Russia, Russia'), '(#R489) the country is appended only when it is not already there');
  assert.deepEqual(r.meta.produced, ['map', 'explanation']);
  assert.deepEqual(r.meta.compose.placed.map((p) => p.n), [1, 2, 3], 'numbered in the order given');
  assert.equal(r.exec.status, 'ok');
  assert.equal(r.exec.unplaced.length, 0);
  const e = ledger.resolve('Strait of Hormuz', {});
  assert.ok(e && e.lng === 56.5 && e.role === '入口', 'the resolved place is in the ledger WITH the role it played');
  assert.equal(ledger.resolve('Bab-el-Mandeb', {}).role, '紅海の出口', '…and a known place gets its role for this answer');
  const feats = eng.data().features;
  assert.equal(feats.filter((f) => f.properties.t === 'pt').length, 3);
  assert.equal(eng.calls.fitBounds.length, 1, 'the camera framed all three');
  assert.ok(/atl-cmp/.test(r.html) && /入口/.test(r.html) && /中国の原油輸入路/.test(r.html), 'the legend carries the title, the names and the roles');
  assert.ok(/data-geo="/.test(r.html), 'legend rows carry the record id for the two-way link');
});

test('R511 ⑦b: what cannot be resolved is UNPLACED by name — never guessed, and told to Atlas and to the reader', async () => {
  const { C, eng } = makeCompose();
  const r = await C.run({ items: [{ name: 'Strait of Hormuz', country: 'Iran' }, { name: 'Nowhere Reef', country: 'Atlantis' }] });
  assert.equal(r.ok, true, 'one placed is enough to draw');
  assert.equal(r.exec.status, 'partial');
  assert.deepEqual(r.exec.unplaced, [{ name: 'Nowhere Reef', reason: 'not_found' }]);
  assert.match(r.exec.note, /NOT on the map/);
  assert.match(r.html, /Nowhere Reef/, 'the reader is told too');
  assert.equal(eng.data().features.length, 1, 'nothing was drawn for it');
  assert.equal(eng.calls.flyTo.length, 1, 'one place → fly, not fit');
  /* every item unresolvable → an honest failure, no legend, nothing produced */
  const { C: C2 } = makeCompose();
  const r2 = await C2.run({ items: [{ name: 'Nowhere Reef', country: 'Atlantis' }] });
  assert.equal(r2.ok, false);
  assert.equal(r2.meta.code, 'PLACE_NOT_FOUND');
  assert.deepEqual(r2.meta.produced, []);
  assert.equal(r2.html, '');
  /* and a model-supplied coordinate is ignored: the place is still resolved by NAME */
  const { C: C3, asked } = makeCompose();
  const r3 = await C3.run({ items: [{ name: 'Nowhere Reef', country: 'Atlantis', lng: 10, lat: 10 }] });
  assert.equal(r3.ok, false, 'a coordinate the model wrote is not a coordinate');
  assert.ok(asked.length >= 1);
});

test('R511 ⑦c: relations join placed items by name or number as great-circle arcs; an unplaced endpoint is skipped, not invented', async () => {
  const { C, eng } = makeCompose();
  const r = await C.run({ items: [
    { name: 'Tokyo', country: 'Japan', kind: 'city' }, { name: 'San Francisco', country: 'United States', kind: 'city' }, { name: 'Nowhere Reef', country: 'Atlantis' },
  ], relations: [
    { from: 'Tokyo', to: 2, type: 'flow', label: '航空路' },
    { from: 1, to: 'Nowhere Reef', type: 'link' },
    { from: 'Tokyo', to: 'Tokyo' },
  ] });
  assert.equal(r.exec.relationsDrawn, 1);
  assert.equal(r.exec.relationsSkipped.length, 2);
  assert.equal(r.exec.relationsSkipped[0].reason, 'endpoint_unplaced');
  assert.equal(r.exec.relationsSkipped[1].reason, 'same_endpoint');
  const rel = eng.data().features.find((f) => f.properties.t === 'rel');
  assert.ok(rel, 'the arc is in the source');
  assert.equal(rel.properties.arrow, 1, 'a flow has arrowheads');
  assert.equal(rel.geometry.type, 'MultiLineString', 'Tokyo → San Francisco crosses the antimeridian and is split');
  const pts = rel.geometry.coordinates.flat();
  assert.ok(pts.length > 10, 'a great circle, not a chord');
  assert.ok(pts.every((p) => Math.abs(p[1]) <= 90 && Math.abs(p[0]) <= 180));
  assert.ok(Math.max(...pts.map((p) => p[1])) > 45, 'the arc bows north of both endpoints, as a great circle between them does');
  assert.match(r.html, /航空路/);
  /* ⚠ a NUMBER is the position in the caller's `items`, not the marker number — measured on the
     live site: with item 1 unplaced, «from: 2» landed on the third item and the relation was
     reported as joining a place to itself */
  const { C: C2, eng: e2 } = makeCompose();
  const r2 = await C2.run({ items: [{ name: 'Nowhere Reef', country: 'Atlantis' }, { name: 'Tokyo', country: 'Japan' }, { name: 'San Francisco', country: 'United States' }],
    relations: [{ from: 2, to: 3, type: 'flow' }, { from: 1, to: 2 }] });
  assert.deepEqual(r2.exec.placed.map((p) => [p.n, p.name]), [[1, 'Tokyo'], [2, 'San Francisco']], 'markers are numbered by what landed');
  assert.equal(r2.exec.relationsDrawn, 1, 'items 2→3 are Tokyo→San Francisco, both placed');
  assert.equal(r2.exec.relationsSkipped[0].reason, 'endpoint_unplaced', 'item 1 is the unplaced one');
  const rel2 = e2.data().features.find((f) => f.properties.t === 'rel');
  assert.equal(rel2.properties.from, e2.data().features.find((f) => f.properties.name === 'Tokyo').properties.id);
});

test('R511 ⑦f: the layers go at the top of the stack, just under the reader\'s pins — not under an opaque fill', async () => {
  /* measured on the preview: anchored on the POI layer's list they landed under `country-fill` and rendered nothing */
  const { C, eng } = makeCompose({ layers: ['nlq-fill', 'country-fill', 'user-pin-shadow', 'user-pin-dot'] });
  await C.run({ items: [{ name: 'Tokyo', country: 'Japan' }] });
  assert.equal(eng.calls.addLayer.length, C.LAYERS.length);
  assert.ok(eng.calls.addBefore.every((b) => b === 'user-pin-shadow'), 'every compose layer is inserted directly under the pins');
  const { C: C2, eng: e2 } = makeCompose({ layers: ['nlq-fill', 'country-fill'] });
  await C2.run({ items: [{ name: 'Tokyo', country: 'Japan' }] });
  assert.ok(e2.calls.addBefore.every((b) => b === undefined), 'with no pins on the map they go on top — never under a fill');
});

test('R511 ⑦e: a name the gazetteer cannot find WITH its country is tried bare — a strait is not IN a country', async () => {
  const { C, asked } = makeCompose();
  GEO['strait of gibraltar'] = { lng: -5.6, lat: 35.95, name: 'Strait of Gibraltar' };
  const r = await C.run({ items: [{ name: 'Strait of Gibraltar', country: 'Spain', kind: 'water' }] });
  assert.deepEqual(asked, ['Strait of Gibraltar, Spain', 'Strait of Gibraltar'], 'country first, then the bare name — two requests, not one');
  assert.equal(r.exec.placed.length, 1);
  assert.equal(r.exec.unplaced.length, 0);
  delete GEO['strait of gibraltar'];
});

test('R511 ⑦d: a fill goes through the highlight path with the run stamp, and a geocoder that hangs is a timeout, not a wait', async () => {
  const { C, dispatched } = makeCompose();
  const r = await C.run({ __paintRun: 'run7', items: [{ name: 'Iran', kind: 'country', fill: true, role: 'producer' }, { name: 'Strait of Hormuz', country: 'Iran' }] });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, 'highlight');
  assert.deepEqual(dispatched[0].countries, ['Iran']);
  assert.equal(dispatched[0].__paintRun, 'run7', 'additive within the turn — the #R489 stamp travels');
  assert.equal(r.exec.fills[0].ok, true);
  assert.match(r.html, /Iran/);
  const { C: C2 } = makeCompose({ hang: /Malacca/, itemTimeoutMs: 40 });
  const t0 = Date.now();
  const r2 = await C2.run({ items: [{ name: 'Strait of Malacca', country: 'Malaysia' }, { name: 'Strait of Hormuz', country: 'Iran' }] });
  assert.ok(Date.now() - t0 < 2000, 'did not wait on the hung lookup');
  assert.deepEqual(r2.exec.unplaced, [{ name: 'Strait of Malacca', reason: 'timeout' }]);
  assert.equal(r2.exec.placed.length, 1, 'the other one still landed');
});

/* ══ ⑧ the prose link: text nodes only, first occurrence, never inside a link ═══════════════════ */
test('R511 ⑧: linkProse numbers the first mention of each place in the text nodes and leaves markup, links and other words alone', () => {
  const C = makeAtlasMapCompose({});
  const recs = [{ id: 'water:IR:hormuz', n: 1, color: '#0a84ff', spellings: ['Strait of Hormuz', 'ホルムズ海峡'] }, { id: 'city:JP:tokyo', n: 2, color: '#ff453a', spellings: ['Tokyo'] }];
  const html = '<p>The <b>Strait of Hormuz</b> and the Strait of Hormuz again; Tokyoite is not Tokyo. <a href="#">Tokyo</a> ホルムズ海峡。</p>';
  const out = C.linkProse(html, recs);
  assert.equal((out.match(/atl-geo-ref/g) || []).length, 2, 'one reference per record');
  assert.match(out, /<b><span class="atl-geo-ref" data-geo="water:IR:hormuz">Strait of Hormuz<span class="atl-geo-n"[^>]*>1<\/span><\/span><\/b>/, 'the first mention, inside the <b>, got the badge');
  assert.ok(out.indexOf('Tokyoite') >= 0 && !/Tokyo<span class="atl-geo-n"[^>]*>2<\/span><\/span>ite/.test(out), 'a word containing the name is not the name');
  assert.match(out, /is not <span class="atl-geo-ref" data-geo="city:JP:tokyo">Tokyo/, 'the standalone Tokyo is');
  assert.match(out, /<a href="#">Tokyo<\/a>/, 'the one inside the link is untouched');
  assert.equal(out.indexOf('data-geo="water:IR:hormuz"'), out.lastIndexOf('data-geo="water:IR:hormuz"'), 'the Japanese spelling was not linked a second time');
  assert.equal(C.linkProse(html, []), html, 'no records → unchanged');
  assert.equal(C.linkProse('<p data-x="Tokyo">x</p>', recs), '<p data-x="Tokyo">x</p>', 'never inside a tag');
  /* recordsFor reads the bubble's own results */
  const recsFor = C.recordsFor([{ ok: true, meta: { compose: { placed: [{ id: 'a', n: 1 }] } } }, { ok: true, meta: {} }, { ok: true, meta: { compose: { placed: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] } } }]);
  assert.deepEqual(recsFor.map((r) => r.id), ['a', 'b']);
});

/* ══ ⑨ the wiring: registry, schema, catalogue, observer, console, docs — one fact, one place ════ */
test('R511 ⑨: map.compose is registered, documented, observed, dispatched and described — and the shell did not grow', () => {
  const cap = CAPS.resolve('compose');
  assert.ok(cap && cap.id === 'map.compose');
  assert.deepEqual(cap.produces, ['map', 'explanation']);
  assert.equal(cap.observerKind, 'paint');
  for (const alias of ['mapCompose', 'composeMap', 'explainOnMap']) assert.equal(CAPS.resolve(alias).id, 'map.compose', alias);
  assert.ok(SCHEMAS.schemaFor('map.compose'), 'a schema of its own');
  assert.ok(makeAtlasCatalogText({}, {}).idsCovered().includes('map.compose'), 'the catalogue describes it');
  const caps = R('js/atlas-capabilities.js');
  assert.match(caps, /compose: sourceFeatureCount\('atl-compose-src'\)/, 'the paint observer counts the compose source');
  const mod = R('js/atlas-map-compose.js');
  assert.match(mod, /const SRC = 'atl-compose-src'/, '…and that is the source the module writes');
  const con = R('js/atlas-console.js');
  assert.match(con, /^import \{ makeAtlasMapCompose \} from '\.\/atlas-map-compose\.js';/m, 'imported at line start (scripts/js-reachability.mjs anchors there)');
  assert.match(con, /case 'compose': case 'mapCompose': case 'composeMap': case 'explainOnMap': return await COMPOSE\.run\(a\);/, 'every spelling the registry promises reaches the module');
  assert.match(con, /"answer_mode":"text"\|"map"\|"mixed"/, 'the REPLY FORMAT tells Atlas the field exists');
  assert.match(con, /COMPOSE\.linkProse\(head,_cr\)/, 'the answer is linked to the markers it drew');
  assert.match(con, /COMPOSE\.bind\(ai\)/);
  assert.match(con, /case 'reset':[^\n]*COMPOSE\.clear\(\)/, 'clearing highlights clears the composition');
  assert.match(con, /case 'clearAll':[^\n]*COMPOSE\.clear\(\)/);
  /* the overlay chip's layer list IS the module's list — one fact */
  const ovl = /compose:\[([^\]]+)\]/.exec(con);
  assert.ok(ovl, '_OVL has a compose row');
  const C = makeAtlasMapCompose({});
  assert.deepEqual(ovl[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')), C.LAYERS, '_OVL.compose lists exactly the layers the module draws');
  assert.ok(con.split(String.fromCharCode(10)).length < 4_910, 'js/atlas-console.js stayed under its shrink-only ceiling — the room came from blank lines');
  assert.match(R('docs/FILES.md'), /atlas-map-compose\.js/, 'docs/FILES.md describes the file');
  assert.match(R('js/atlas-styles.js'), /\.atl-geo-n\{/, 'the badge is styled');
});

/* ══ ⑩ the policy text did not grow a rule about meaning ═══════════════════════════════════════ */
test('R511 ⑩: no sentence was added to js/atlas-policy.js, and the loop does not read a tool NAME to decide the gate', () => {
  const pol = R('js/atlas-policy.js');
  assert.ok(!/answer_mode|compose/.test(pol), 'the mechanics live in the REPLY FORMAT and the tool, not in the core instruction');
  const agent = R('js/atlas-agent.js');
  const gate = agent.slice(agent.indexOf('const wantsMap'), agent.indexOf('continue;', agent.indexOf('const wantsMap')));
  assert.match(gate, /r\.changedMap === true/);
  assert.ok(!/r\.name|call\.name|tools\[/.test(gate), 'the gate reads a flag on the result, never a name');
});
