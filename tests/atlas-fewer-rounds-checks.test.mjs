/* ============================================================================
 *  Atlas · fewer rounds — what one step learned reaches the next, so the next does not redo it
 * ----------------------------------------------------------------------------
 *  Measured on production 2026-11-24 (dev-notes/2026-11-24-atlas-fewer-rounds.md): one 226 s turn spent
 *  ~150 s in steps that ran the hosted web search again (the previous step's search was dropped between
 *  steps), one round re-sending a map whose places were looked up under the wrong spelling only, two rounds
 *  moving and looking at a camera the compose had already framed, and two rounds of plan calls alone.
 *  Every check here RUNS the shipping code (no source greps): the OpenAI provider against a scripted fetch,
 *  the protocol-2 normaliser, js/atlas-map-compose.js over a scripted gazetteer, js/atlas-plan.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fn = (p) => import(pathToFileURL(join(ROOT, 'supabase/functions', p)).href);

/* ── ① a step's web search goes to the next step by reference ─────────────────────────────── */
async function withFetch(answer, run) {
  const bodies = [];
  const keep = globalThis.fetch;
  globalThis.fetch = async (_u, init) => {
    bodies.push(JSON.parse(String(init && init.body || '{}')));
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try { return { out: await run(), bodies }; } finally { globalThis.fetch = keep; }
}
const meter = () => ({ ceiling: { take: async () => ({ ok: true }) }, add() {}, startedAt: Date.now() });
const ANSWER = {
  status: 'completed', model: 'gpt-6.2-sol',
  output: [
    { type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [] },
    { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: 'q' } },
    { type: 'function_call', call_id: 'call_1', name: 'map_view', arguments: '{"lat":1,"lng":2}' },
  ],
};

test('① a turn step is stored, and its search comes back as a reference the next step sends', async () => {
  const { callOpenAI } = await fn('ai-proxy/providers/openai.ts');
  const { normalizeTurn } = await fn('ai-proxy/turn.ts');
  const turn1 = normalizeTurn({ protocol: 2, input: [{ type: 'message', role: 'user', content: 'q' }], tools: [] });
  const a = await withFetch(ANSWER, () => callOpenAI('gpt-6.2-sol', 'k', 'p', 's', [], [], [], true, 500, false, false, 'low', 'auto', true, null, turn1, '', meter()));
  assert.equal(a.bodies[0].store, true, 'a turn step is stored so its items can be referenced');
  const refs = a.out.output.filter((it) => it.type === 'item_reference');
  assert.deepEqual(refs, [{ type: 'item_reference', id: 'ws_1' }], 'the search is in the step\'s items, where the client replays it from');
  assert.ok(a.out.webUsed, 'the search is still reported as having run');

  /* the next step: the client sends the items back as it got them — the normaliser keeps the reference, the provider sends it */
  const turn2 = normalizeTurn({ protocol: 2, input: [{ type: 'message', role: 'user', content: 'q' }].concat(a.out.output), tools: [] });
  assert.ok(turn2.items.some((it) => it.type === 'item_reference' && it.id === 'ws_1'), 'the normaliser keeps the reference');
  const b = await withFetch(ANSWER, () => callOpenAI('gpt-6.2-sol', 'k', 'p', 's', [], [], [], true, 500, false, false, 'low', 'auto', true, null, turn2, '', meter()));
  assert.ok(b.bodies[0].input.some((it) => it.type === 'item_reference' && it.id === 'ws_1'), 'the next request carries the search');
});

test('① a malformed reference is left out and said; a call that is not a turn keeps nothing on OpenAI\'s side', async () => {
  const { normalizeTurn } = await fn('ai-proxy/turn.ts');
  const t = normalizeTurn({ protocol: 2, input: [{ type: 'item_reference', id: 'bad id with spaces' }, { type: 'message', role: 'user', content: 'q' }], tools: [] });
  assert.ok(!t.items.some((it) => it.type === 'item_reference'));
  assert.equal(t.trim.invalidItems, 1);
  const { callOpenAI } = await fn('ai-proxy/providers/openai.ts');
  const plain = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }] };
  const c = await withFetch(plain, () => callOpenAI('gpt-6.2-sol', 'k', 'p', 's', [], [], [], false, 500, false, false, 'low', 'auto', true, null, null, '', meter()));
  assert.equal(c.bodies[0].store, false);
});

/* ── ② compose asks every spelling Atlas gave before «not_found» ─────────────────────────────── */
async function compose(geo) {
  const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
  const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
  const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
  const GEOBJ = makeAtlasGeoObject();
  const asked = [], fits = [];
  const g = {
    layers: { hasSource: () => true, addSource() {}, setSourceData() {}, has: () => true, add() {}, setVisible() {}, getLayout: () => 'visible', setFilter() {} },
    camera: { flyTo() {}, fitBounds: (b) => fits.push(b), getZoom: () => 3 },
    events: { onLayer() {}, on() {} }, render: { canvas: () => ({ style: {} }) },
  };
  const C = makeAtlasMapCompose({
    GE: () => g, ledger: makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject }), geoObject: GEOBJ.geoObject,
    geocode: async (q) => { asked.push(q); return geo[String(q).toLowerCase()] || null; },
    verifyPlaces: async (names) => new Map(names.map((n) => [n, null])),
    dispatch: async () => ({ ok: true }), itemTimeoutMs: 8000, passBudgetMs: 26000, verifyBudgetMs: 0,
  });
  return { C, asked, fits };
}

test('② a label written into `as` does not hide the name: the place resolves under `name` in the same call', async () => {
  const { C, asked } = await compose({ 'nangal, india': { lng: 76.37, lat: 31.39, name: 'Nangal' }, 'prayagraj, india': { lng: 81.85, lat: 25.44, name: 'Prayagraj' } });
  const r = await C.run({ items: [
    { name: 'Nangal', as: 'a description of the place, not a name', country: 'India' },
    { name: 'Prayagraj', as: 'another description', country: 'India' },
  ] }, { turnId: 't1' });
  assert.equal(r.exec.counts.placed, 2, 'both placed in ONE call: ' + JSON.stringify(r.exec.unplaced));
  assert.equal(asked[0], 'a description of the place, not a name, India', '`as` is still asked first');
  assert.ok(asked.includes('Nangal, India'));
});

test('② `as` keeps its priority: when it resolves, the bare label is never asked', async () => {
  const { C, asked } = await compose({ 'today, japan': { lng: 139.8, lat: 35.8, name: 'Today' }, 'label, japan': { lng: 0, lat: 0, name: 'Label' } });
  const r = await C.run({ items: [{ name: 'Label', as: 'Today', country: 'Japan' }] }, { turnId: 't1' });
  assert.equal(r.exec.counts.placed, 1);
  assert.deepEqual(asked, ['Today, Japan']);
  assert.equal(r.exec.placed.length, 1);
});

test('② a place that no spelling finds is unplaced, with every spelling that was spent', async () => {
  const { C } = await compose({});
  const r = await C.run({ items: [{ name: 'Nowhere', as: 'Neverland', country: 'India' }] }, { turnId: 't1' });
  assert.equal(r.exec.counts.placed, 0);
  assert.deepEqual(r.exec.unplaced[0].tried, ['Neverland, India', 'Neverland', 'Nowhere, India', 'Nowhere']);
});

/* ── ③ compose says what the camera now shows ────────────────────────────────────────────── */
test('③ the result states the framing it made, so a look is not needed to learn it', async () => {
  const { C, fits } = await compose({ 'a, india': { lng: 76, lat: 31, name: 'A' }, 'b, india': { lng: 82, lat: 25, name: 'B' } });
  const r = await C.run({ items: [{ name: 'A', country: 'India' }, { name: 'B', country: 'India' }] }, { turnId: 't1' });
  assert.equal(fits.length, 1);
  assert.equal(r.exec.view.framed, 'all_placed');
  assert.equal(r.exec.view.items, 2);
  const [w, s, e, n] = r.exec.view.bounds;
  assert.ok(w < 76 && e > 82 && s < 25 && n > 31, 'the stated bounds hold every placed item: ' + r.exec.view.bounds);
  const kept = await C.run({ items: [{ name: 'A', country: 'India' }], camera: 'keep' }, { turnId: 't2' });
  assert.equal(kept.exec.view.framed, 'kept');
  assert.equal(fits.length, 1, '"keep" moves nothing');
});

/* ── ④ the plan tells Atlas what a plan-only reply costs ──────────────────────────────────── */
test('④ the plan tool and its record say that a reply of plan calls alone is a round with nothing done', async () => {
  const { makeAtlasPlan, PLAN_TOOL } = await import('../js/atlas-plan.js');
  const P = makeAtlasPlan({});
  P.beginTurn();
  const rec = P.declare({ goal: 'g', steps: ['a', 'b'], current: 1 });
  assert.equal(rec.ok, true);
  assert.match(rec.note, /SAME reply/);
  assert.match(PLAN_TOOL.description, /ONLY plan calls/);
});
