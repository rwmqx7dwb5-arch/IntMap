/* ============================================================================
 *  R551 — ONE REQUEST, ONE MAP: artifact identity, revisions, honest partials
 * ----------------------------------------------------------------------------
 *  「地図マッピングが一回で完結せず、途中結果と完成結果が二重表示される」
 *
 *  One question — 「日本の製鉄所をマッピングして」 — produced TWO map explanations stacked in one
 *  reply: 「日本の主な製鉄所」 5件 + 「配置できなかった場所」11件, and under it 「日本の主要製鉄所・
 *  製鉄地区」 16件. Both described the same map, which was holding only the second.
 *
 *  ⚠ THESE CHECKS DRIVE THE SHIPPING MODULES, NOT COPIES OF THEM (#R505). js/atlas-map-compose.js
 *  runs over a scripted gazetteer, a scripted web verifier and a fake engine; js/atlas-capabilities.js's
 *  verifiers are called as the kernel calls them; js/atlas-turn-results.js is handed the real results.
 *  Nothing here greps a source file for a spelling except where the fact IS a spelling (⑧).
 *
 *  ⚠ AND SEVERAL OF THEM ARE DIFFERENTIAL: ④ and ⑤ run the OLD verifier beside the new one on the
 *  same evidence, because 「直った」 has to mean 「前の実装ならここで間違えた」 and not 「今の実装は自分
 *  に同意する」.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasTurnResults } = await import('../js/atlas-turn-results.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
const CAPS = makeAtlasCapabilities({});
const TR = makeAtlasTurnResults({});
const SCHEMAS = makeAtlasSchemas();

/* ── a fake renderer that reports the feature count the observer actually reads ─────────────── */
function fakeEngine() {
  const layers = new Set(), sources = new Set();
  let data = { type: 'FeatureCollection', features: [] };
  const g = {
    layers: {
      hasSource: (id) => sources.has(id), addSource: (id) => sources.add(id),
      setSourceData: (id, d) => { data = d; }, has: (id) => layers.has(id),
      add: (d) => layers.add(d.id), setVisible: () => {}, getLayout: () => 'visible', setFilter: () => {},
    },
    camera: { flyTo: () => {}, fitBounds: () => {}, getZoom: () => 3 },
    events: { onLayer: () => {}, on: () => {} },
    render: { canvas: () => ({ style: {} }) },
  };
  return { GE: () => g, data: () => data, count: () => (data.features || []).length };
}

const GEO = {
  '加古川製鉄所, japan': { lng: 134.83, lat: 34.75, name: '加古川製鉄所' },
  '室蘭地区, japan': { lng: 140.97, lat: 42.32, name: '室蘭地区' },
  'kobe, japan': { lng: 135.19, lat: 34.69, name: 'Kobe' },
  'a, japan': { lng: 1, lat: 1, name: 'A' },
};

function makeCompose(opts) {
  opts = opts || {};
  const eng = fakeEngine();
  const GEOBJ = makeAtlasGeoObject();
  const ledger = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  const asked = [], verified = [], dispatched = [];
  const geocode = async (q) => {
    asked.push(q);
    if (opts.hang && opts.hang.test(q)) return new Promise(() => {});
    /* ⚠ a SLOW gazetteer is modelled by moving the injected clock, not by sleeping: the budget is
       measured in `now()`, so this measures the real branch instantly and deterministically. */
    if (opts.slow && opts.slow.test(q) && opts.tick) opts.tick();
    return (opts.geo || GEO)[String(q).toLowerCase()] || null;
  };
  const verifyPlaces = opts.verifyPlaces === false ? undefined : async (names) => {
    verified.push(names.slice());
    const m = new Map();
    names.forEach((n) => m.set(n, (opts.web && opts.web[n]) || null));
    return m;
  };
  const C = makeAtlasMapCompose({
    GE: eng.GE, geocode, verifyPlaces, ledger, geoObject: GEOBJ.geoObject, now: opts.now,
    dispatch: async (a) => { dispatched.push(a); return { ok: true }; },
    itemTimeoutMs: opts.itemTimeoutMs || 8000,
    passBudgetMs: opts.passBudgetMs || 26000,
    verifyBudgetMs: opts.verifyBudgetMs == null ? 14000 : opts.verifyBudgetMs,
  });
  return { C, eng, ledger, asked, verified, dispatched };
}

const strong = (lng, lat) => ({ found: true, lng, lat, webUsed: true, confidence: 0.8 });
const items = (...names) => names.map((n) => ({ name: n, country: 'Japan' }));

/* ══ ① TWO COMPOSES IN ONE TURN ARE TWO REVISIONS OF ONE MAP ═══════════════════════════════════
   The turn id arrives as execution context. Same turn → same artifact, revision 2. A different
   turn → a different artifact starting again at revision 1. */
test('R551 ①: the turn id makes two composes two revisions of one artifact, and a new turn starts a new one', async () => {
  const { C } = makeCompose();
  const r1 = await C.run({ title: '日本の主な製鉄所', items: items('加古川製鉄所') }, { turnId: 't1' });
  const r2 = await C.run({ title: '日本の主要製鉄所・製鉄地区', items: items('加古川製鉄所', '室蘭地区') }, { turnId: 't1' });
  const r3 = await C.run({ items: items('加古川製鉄所') }, { turnId: 't2' });

  assert.equal(r1.meta.artifact.id, 'map:t1');
  assert.equal(r1.meta.artifact.revision, 1);
  assert.equal(r2.meta.artifact.id, 'map:t1', 'the same request is the same map');
  assert.equal(r2.meta.artifact.revision, 2, '…and the second call is its next revision');
  assert.equal(r2.meta.resultKey, r1.meta.resultKey, 'one identity, so the reply keeps one of them');
  assert.notEqual(r3.meta.artifact.id, 'map:t1', 'a different turn is a different map');
  assert.equal(r3.meta.artifact.revision, 1);

  /* ⚠ THE TITLE IS NOT THE IDENTITY. The reported transcript changed it between the two calls,
     which is exactly why an argument-derived key saw two operations. */
  assert.notEqual(r1.meta.compose.id, r2.meta.compose.id, 'still two distinct runs…');
  assert.equal(r1.meta.resultKey, 'map.compose:map:t1', '…of one artefact');
});

/* ══ ② A REVISION RESTATES THE MAP — it does not pile onto the draft it is correcting ══════════ */
test('R551 ②: a revision replaces the previous one; numbering restarts and the fill token changes', async () => {
  const { C, eng, dispatched } = makeCompose();
  await C.run({ items: [{ name: '加古川製鉄所', country: 'Japan', fill: true, kind: 'country' }] }, { turnId: 't9' });
  const before = eng.count();
  const r2 = await C.run({ items: items('加古川製鉄所', '室蘭地区') }, { turnId: 't9' });

  assert.equal(before, 1, 'the draft drew one');
  assert.equal(eng.count(), 2, 'the revision drew two — not three (1 + 2)');
  assert.deepEqual(r2.meta.compose.placed.map((p) => p.n), [1, 2], 'numbered from 1: the revision IS the map');
  assert.equal(C.records().length, 2);

  /* the fill's paint stamp is the revision's, so js/atlas-console.js's _hlAdd replaces the draft's
     shading instead of accumulating it (#R489's rule, applied at the right granularity) */
  assert.equal(dispatched.length, 1);
  assert.match(dispatched[0].__paintRun, /^map:t9#r1$/);
});

/* ══ ③ THE REPLY KEEPS THE REVISION THE MAP IS HOLDING — even when it scores worse ═════════════ */
test('R551 ③: turn-results collapses two revisions to one, and the later one wins whatever its score', () => {
  const draft = { act: { type: 'compose', title: 'A', items: [1] }, ok: true, html: '<div>DRAFT</div>',
    meta: { produced: ['map', 'explanation'], resultKey: 'map.compose:map:t1', artifact: { id: 'map:t1', revision: 1 } } };
  const finalRev = { act: { type: 'compose', title: 'B', items: [1, 2] }, ok: true, html: '<div>FINAL</div>',
    meta: { produced: ['map', 'explanation'], resultKey: 'map.compose:map:t1', artifact: { id: 'map:t1', revision: 2 } } };

  const kept = TR.keep([draft, finalRev]);
  assert.equal(kept.length, 1, 'ONE block in the reply, not two');
  assert.equal(kept[0].html, '<div>FINAL</div>');

  /* ⚠ THE HARD CASE: the later revision admitted to a gap, so #R441's score RANKS IT LOWER. It is
     still the one on the map, and a reply describing the other one describes markers that are gone. */
  const honest = { act: { type: 'compose', title: 'B', items: [1, 2] }, ok: true, html: '<div>HONEST</div>',
    meta: { produced: ['map', 'explanation'], partial: true, resultKey: 'map.compose:map:t1', artifact: { id: 'map:t1', revision: 2 } } };
  assert.ok(TR.score(honest) < TR.score(draft), 'the honest revision really does score lower');
  const kept2 = TR.keep([draft, honest]);
  assert.equal(kept2.length, 1);
  assert.equal(kept2[0].html, '<div>HONEST</div>', 'the reply follows the map, not the score');

  /* two genuinely different artefacts still coexist */
  const other = { act: { type: 'compose', items: [9] }, ok: true, html: '<div>OTHER</div>',
    meta: { produced: ['map'], resultKey: 'map.compose:map:t2', artifact: { id: 'map:t2', revision: 1 } } };
  assert.equal(TR.keep([draft, finalRev, other]).length, 2, 'a different map is not collapsed away');
});

/* ══ ④ FIVE OF SIXTEEN IS NOT `completed` — and the old verifier said it was ═══════════════════ */
test('R551 ④: a partial compose reaches the kernel as partial, where the paint verifier called it completed', async () => {
  const { C } = makeCompose({ web: {} });   /* the web rung grounds nothing */
  const r = await C.run({ items: items('加古川製鉄所', 'ないない製鉄所', 'ないない2製鉄所') }, { turnId: 't3' });

  assert.equal(r.ok, true, 'one place did land, so the call is not a failure');
  assert.equal(r.exec.status, 'partial');
  assert.equal(r.meta.partial, true, 'and it says so where a generic reader looks');
  assert.deepEqual(r.meta.counts, { requested: 3, placed: 1, unplaced: 2, relationsRequested: 0, relationsDrawn: 0 });

  const cap = CAPS.resolve('compose');
  const before = { compose: 0, visible: 0, objects: 0 }, after = { compose: 1, visible: 0, objects: 0 };
  const verdict = cap.verify(CAPS.context ? CAPS.context() : {}, {}, before, after, r);
  assert.equal(verdict.status, 'partial', 'the kernel is told the map is not finished');
  assert.equal(verdict.code, 'incomplete');
  assert.deepEqual(verdict.unresolved, ['ないない製鉄所', 'ないない2製鉄所'], 'by NAME, so the repair has something to act on');

  /* ⚠⚠⚠ DIFFERENTIAL — AND THE THING THAT MADE IT WRONG WAS THE PAIR, NOT EITHER HALF.
     `paint` DOES look at `meta.partial`; js/atlas-map-compose.js simply never set it, putting its
     honesty in `exec.status` where no verifier was reading. So the old world is reproduced exactly:
     the same run, with the flag this round added taken back off. */
  const paint = CAPS.OBSERVERS && CAPS.OBSERVERS.paint;
  assert.ok(paint, 'the observer map.compose used to be declared with, kept here so the comparison cannot quietly stop running');
  const asItWas = { ok: r.ok, html: r.html, exec: r.exec, meta: Object.assign({}, r.meta, { partial: undefined }) };
  assert.equal(asItWas.exec.status, 'partial', 'the module always knew…');
  const old = paint.verify({}, {}, before, after, asItWas);
  assert.equal(old.status, 'completed', '…and the OLD pair answered completed: 0 → 1 features moved, so it passed');
  /* the new verifier reads `exec` itself, so it is right even without the flag */
  assert.equal(cap.verify({}, {}, before, after, asItWas).status, 'partial', 'the new verifier does not depend on the flag alone');
});

/* ══ ⑤ SIXTEEN MARKERS MOVED TO THE RIGHT PLACE IS A REPAIR, NOT A NO-OP ══════════════════════ */
test('R551 ⑤: a revision with the same count but corrected coordinates is completed, not not_rendered', async () => {
  const { C } = makeCompose();
  const r = await C.run({ items: items('加古川製鉄所', '室蘭地区') }, { turnId: 't4' });
  assert.equal(r.exec.status, 'ok');

  const cap = CAPS.resolve('compose');
  const same = { compose: 2, visible: 0, objects: 0 };
  const verdict = cap.verify({}, {}, same, same, r);
  assert.equal(verdict.status, 'completed', 'what is ON the map is the evidence, not how much the tally moved');
  assert.equal(verdict.observed.compose.placed, 2);

  const paint = CAPS.OBSERVERS && CAPS.OBSERVERS.paint;
  assert.ok(paint, 'the observer map.compose used to be declared with, kept here so the comparison cannot quietly stop running');
  const old = paint.verify({}, {}, same, same, r);
  assert.equal(old.status, 'partial', 'the OLD verdict — nothing changed, so a real repair read as not_rendered');
  assert.equal(old.code, 'not_rendered');
});

/* ══ ⑥ A NAME THE CLOCK NEVER REACHED IS NOT A NAME THAT DOES NOT EXIST ═══════════════════════ */
test('R551 ⑥: timeout and not_attempted are distinguished from not_found and still reach the web rung', async () => {
  /* one call to the gazetteer eats more than the whole pass budget, so the FIRST name times out
     mid-lookup and the second is never asked at all — the shape a sixteen-place list takes against a
     1,100 ms rate floor. */
  function slowRig(web) {
    let t = 0;
    return makeCompose({ slow: /遅い/, tick: () => { t += 30000; }, now: () => t, web: web });
  }
  const rig = slowRig({ '遅い1, Japan': strong(10, 10), '遅い2, Japan': strong(11, 11) });
  const r = await rig.C.run({ items: items('遅い1', '遅い2') }, { turnId: 't5' });

  assert.equal(rig.verified.length, 1, 'ONE web call carrying the whole list, not one per name');
  assert.deepEqual(rig.verified[0], ['遅い1, Japan', '遅い2, Japan'],
    'BOTH names went to the rung that could still place them — and under the SAME spelling the gazetteer was asked, country and all');
  assert.equal(r.meta.counts.placed, 2, 'and both landed');
  assert.equal(r.exec.status, 'ok');

  /* when the web rung cannot ground them either, the ORIGINAL reason survives: 「時間切れ」 and
     「そんな場所は無い」 are different facts, and Atlas repairs them differently. */
  const rig2 = slowRig({});
  const r2 = await rig2.C.run({ items: items('遅い1', '遅い2') }, { turnId: 't6' });
  const reasons = r2.exec.unplaced.map((u) => u.reason);
  assert.deepEqual(reasons, ['timeout', 'not_attempted'], 'the clock ran out on the first and never reached the second');
  assert.ok(!reasons.includes('not_found'), 'neither is reported as a name the world does not hold');
});

/* ══ ⑦ WHAT DID NOT FIT IS REPORTED, AND THE CAP IS DECLARED WHERE THE MODEL CAN SEE IT ═══════ */
test('R551 ⑦: a 25-item request loses nothing in silence, and the schema declares the same limit', async () => {
  const { C } = makeCompose({ web: {} });
  const many = Array.from({ length: 25 }, (_, i) => ({ name: 'A', country: 'Japan', kind: 'x' + i }));
  const r = await C.run({ items: many }, { turnId: 't7' });

  assert.equal(r.meta.counts.requested, 25, 'the request is reported as what it was');
  const over = r.exec.unplaced.filter((u) => u.reason === 'over_item_limit');
  assert.equal(over.length, 1, 'the 25th is named, not dropped');

  /* ⚠ AND THE MODEL IS TOLD UP FRONT, which is the structural half: a cap the tool schema declares
     stops the 25-item call being emitted at all. The two numbers must not drift. */
  const sc = SCHEMAS.schemaFor('map.compose');
  assert.equal(sc.properties.items.maxItems, 24);
  assert.equal(sc.properties.relations.maxItems, 24);
  const src = R('js/atlas-map-compose.js');
  assert.equal(+/const MAX_ITEMS = (\d+)/.exec(src)[1], sc.properties.items.maxItems, 'the runtime cap and the declared cap are one number');
  assert.equal(+/const MAX_RELATIONS = (\d+)/.exec(src)[1], sc.properties.relations.maxItems);
});

/* ══ ⑧ THE EXECUTION CONTEXT REACHES THE CASE — the stamp used to be stripped at the boundary ══ */
test('R551 ⑧: the turn id travels as execution context, not as an argument the console deletes', async () => {
  /* the fact IS the boundary: runActions builds the kernel's arguments by dropping every `__` key,
     so anything the case needs about the TURN cannot ride on the action. */
  const con = R('js/atlas-console.js');
  assert.match(con, /k!=='type'&&k\.slice\(0,2\)!=='__'/, 'the console still strips internal fields from the arguments…');
  assert.match(con, /return await COMPOSE\.run\(a,dctx\)/, '…so the case is handed the context separately');
  assert.match(R('js/atlas-executor.js'), /turnId: op\.turnId, source: op\.source/, 'the executor puts it in the third argument');

  /* and the legacy adapter forwards it, live */
  const seen = [];
  const caps = makeAtlasCapabilities({});
  caps.bindRuntime({ dispatch: (a, ctx) => { seen.push({ a, ctx }); return { ok: true, html: '' }; } });
  const cap = caps.resolve('compose');
  await cap.execute({}, { items: [{ name: 'x' }] }, { turnId: 'turn-42', operationId: 'op-1', source: 'atlas' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].a.type, 'compose');
  assert.equal(seen[0].ctx.turnId, 'turn-42', 'which turn this belongs to reaches the dispatch case');
  assert.ok(!('turnId' in seen[0].a), 'and it is NOT smuggled in as a user argument');
});

/* ══ ⑨ A HALF-DONE CALL IS NOT A FINISHED ONE ═════════════════════════════════════════════════ */
test('R551 ⑨: the turn does not freeze a partial call as a success it need not repeat', () => {
  const src = R('js/atlas-agent.js');
  const line = /if \(ckey && rec\.ok !== false([^)]*)\) doneCalls\[ckey\] = rec;/.exec(src);
  assert.ok(line, 'the memo line is still there');
  for (const st of ['partial', 'running', 'needs_input']) {
    assert.ok(line[1].includes("'" + st + "'"), st + ' is excluded from the memo');
  }
  /* a completed call is still memoised — #R489's whole point, which this must not undo */
  assert.ok(!line[1].includes("'completed'"), 'a completed call is still remembered');
});

/* ══ ⑩ THE NOTE TELLS ATLAS HOW TO FINISH, not just that something failed ═════════════════════ */
test('R551 ⑩: a partial hands Atlas the move that finishes the map in one more call', async () => {
  const { C } = makeCompose({ web: {} });
  const r = await C.run({ items: items('加古川製鉄所', 'ないない製鉄所') }, { turnId: 't8' });
  const note = r.exec.note;
  assert.ok(note, 'a partial carries a note');
  assert.match(note, /COMPLETE list/, 'it asks for the whole map, not only the failures');
  assert.match(note, /FREE/, '…and says why that is cheap (the ledger already holds what landed)');
  assert.match(note, /map:t8/, 'it names the artefact this would be the next revision of');
  assert.match(note, /APPROXIMATE/, 'and it refuses to let a town silently stand in for a factory');
  assert.ok(!/\{ART\}/.test(note), 'the placeholder was filled in');
});

/* ══ ⑪ A MAP THE READER IS LOOKING AT MUST NOT BE CALLED «not drawn» ══════════════════════════
   #R511 holds an `answer_mode:"map"` answer to the fact that some capability produced the map, and
   that fact was stamped only on `completed`. Once map.compose tells the truth about 5-of-16, the
   honest answer would have been bounced as `map_not_drawn` — about five markers plainly on screen —
   and the only recovery offered is another compose_map call: the second card, all over again. */
test('R551 ⑪: a partial compose that really painted still counts as having produced the map', async () => {
  const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
  let reply = null;
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => reply });
  const exec = surface.makeExecute(surface.baseTools(), { validateAgainst: () => {} });
  const call = { name: 'compose_map', arguments: { items: [{ name: 'x' }] } };

  /* the shape map.compose now returns when some of the names could not be placed */
  reply = { ok: false, html: '<div class="atl-cmp">…</div>',
    meta: { status: 'partial', produced: ['map', 'explanation'], partial: true } };
  const m1 = await exec(call);
  assert.equal(m1.status, 'partial', 'still honest about being incomplete…');
  assert.equal(m1.changedMap, true, '…and still honest that the map changed');
  assert.deepEqual(m1.producedModes, ['map', 'explanation']);

  /* …and a run that painted nothing still produces nothing */
  reply = { ok: false, html: '', meta: { status: 'partial', produced: [] } };
  const m2 = await exec(call);
  assert.equal(m2.changedMap, undefined);
  assert.equal(m2.producedModes, undefined);

  /* the verifier is what decides which of the two it was */
  const cap = CAPS.resolve('compose');
  const nothing = cap.verify({}, {}, { compose: 0 }, { compose: 0 },
    { ok: true, exec: { status: 'partial', counts: { requested: 2, placed: 0 }, unplaced: [{ name: 'x' }] } });
  assert.deepEqual(nothing.produced, [], 'nothing on the map: the verdict says it produced nothing');
  const some = cap.verify({}, {}, { compose: 0 }, { compose: 1 },
    { ok: true, exec: { status: 'partial', counts: { requested: 2, placed: 1 }, unplaced: [{ name: 'x' }] } });
  assert.ok(!some.produced || some.produced.length, 'something on the map: the registry\u2019s produces stands');
});
