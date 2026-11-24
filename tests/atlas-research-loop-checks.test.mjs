/* atlas-research-loop — research.search (the tool side of an investigation Atlas steers) and the deliverable axis
   of the evaluation (scripts/atlas-eval/deliverables.mjs, scripts/atlas-completion-rate.mjs). Everything here runs the
   real modules over injected fetchers / recorded observations; nothing is read from the source text. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeResearchSearch, normaliseQuery, gdeltQueryOf, gnewsEditionOf } from '../js/atlas-research-search.js';
import { deliverablesOfTurn, completionRateOf, observeDeliverable } from '../scripts/atlas-eval/deliverables.mjs';
import { rowOf, renderTrend, readHistory } from '../scripts/atlas-completion-rate.mjs';
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');

/* a fake upstream: records what it was asked and answers from a table keyed by the query string */
function upstream(table) {
  const asked = { gdelt: [], gnews: [] };
  const doc = (u, origin, lang) => ({ url: u, title: 'T ' + u, src: new URL(u).hostname, date: '2026-11-20', dateType: 'x', origin, lang: lang || '', country: '' });
  return {
    asked,
    gdelt: async (q, sink, ts, budget, note) => { asked.gdelt.push({ q, ts }); const r = table[q]; if (r === 'down') return null; if (!r) { note.reason = 'ok'; return null; } r.forEach((u) => sink.push(doc(u, 'gdelt'))); note.reason = 'ok'; return 'x'; },
    gnews: async (q, sink, mk, edition) => { asked.gnews.push({ q, edition }); const n = mk(); const r = table['gn:' + q]; if (r === 'down') return null; n.reason = 'ok'; if (!r) return null; r.forEach((u) => sink.push(doc(u, 'gnews', edition && edition[0]))); return 'x'; },
  };
}

test('queries are searched in the language, country and site Atlas names — derived, not listed', async () => {
  const up = upstream({});
  const rs = makeResearchSearch({ gdelt: up.gdelt, gnews: up.gnews });
  await rs.run({ queries: [{ q: 'Kherson bridge', lang: 'uk', country: 'UA', site: 'president.gov.ua' }] }, 't1');
  assert.equal(up.asked.gdelt[0].q, 'Kherson bridge sourcelang:ukrainian sourcecountry:ukraine domainis:president.gov.ua');
  assert.deepEqual(up.asked.gnews[0].edition, ['uk', 'UA', 'UA:uk']);
  assert.equal(up.asked.gnews[0].q, 'Kherson bridge site:president.gov.ua');
  /* any language the platform names works — none of these is in a table of ours */
  const q = gdeltQueryOf(normaliseQuery({ q: 'x', lang: 'pl' }, 0), { language: (c) => ({ pl: 'Polish' }[c] || ''), region: () => '' });
  assert.equal(q, 'x sourcelang:polish');
  assert.equal(gnewsEditionOf(normaliseQuery({ q: 'x' }, 0)), null, 'no language named → the reader\'s own editions, as before');
});

test('what was already fetched is not fetched again, and says so', async () => {
  const up = upstream({ 'a b': ['https://x.example/1', 'https://x.example/2'], 'gn:a b': ['https://x.example/2', 'https://y.example/3'] });
  const rs = makeResearchSearch({ gdelt: up.gdelt, gnews: up.gnews });
  const r1 = await rs.run({ queries: [{ q: 'a b' }] }, 't1');
  assert.equal(r1.documents.length, 3, 'the document both engines found is listed once');
  const calls = up.asked.gdelt.length + up.asked.gnews.length;
  const r2 = await rs.run({ queries: [{ q: 'A B' }, { q: 'a b', lang: 'ru' }] }, 't1');
  assert.equal(r2.queries[0].alreadyRun, true);
  assert.equal(r2.queries[0].found, 3, 'the earlier result is reported, not re-fetched');
  assert.equal(r2.queries[1].alreadyRun, undefined, 'another language is a different search');
  assert.equal(up.asked.gdelt.length + up.asked.gnews.length, calls + 2, 'only the new query was fetched (one per engine)');
  /* a new turn starts a new memory */
  const r3 = await rs.run({ queries: [{ q: 'a b' }] }, 't2');
  assert.equal(r3.queries[0].alreadyRun, undefined);
});

test('ok / empty / unavailable are three answers, and a rejected row says why', async () => {
  const up = upstream({ 'has': ['https://x.example/1'], 'nothing': null, 'down': 'down', 'gn:down': 'down' });
  const rs = makeResearchSearch({ gdelt: up.gdelt, gnews: up.gnews });
  const r = await rs.run({ queries: [{ q: 'has', engine: 'gdelt' }, { q: 'nothing', engine: 'gdelt' }, { q: 'down' }, { q: 'x', lang: 'Ukrainian!' }] }, 't');
  assert.deepEqual(r.queries.map((q) => q.state), ['ok', 'empty', 'unavailable', 'rejected']);
  assert.match(r.queries[3].error, /language tag/);
  assert.equal(r.totals.states.unavailable, 1);
});

test('the investigation is carried, and what changed in method is computed from the queries', async () => {
  const up = upstream({});
  const rs = makeResearchSearch({ gdelt: up.gdelt, gnews: up.gnews });
  await rs.run({ queries: [{ q: 'port strike' }], gap: 'no figures' }, 't');
  const r = await rs.run({ queries: [{ q: 'port strike casualties', lang: 'uk', site: 'mod.gov.ua' }], gap: 'only English', changed: 'now in Ukrainian' }, 't');
  assert.equal(r.round, 2);
  assert.deepEqual(r.delta.words, ['casualties']);
  assert.deepEqual(r.delta.languages, ['uk']);
  assert.deepEqual(r.delta.sites, ['mod.gov.ua']);
  assert.deepEqual(r.investigation.history.map((h) => h.gap), ['no figures', 'only English']);
  assert.equal(r.investigation.changed, 'now in Ukrainian');
});

test('there is no cap: many queries, many rounds, all run', async () => {
  const up = upstream({});
  const rs = makeResearchSearch({ gdelt: up.gdelt, gnews: up.gnews });
  const qs = Array.from({ length: 40 }, (_, i) => ({ q: 'q' + i, engine: 'gdelt' }));
  const r = await rs.run({ queries: qs }, 't');
  assert.equal(r.queries.length, 40);
  assert.equal(up.asked.gdelt.length, 40);
  for (let i = 0; i < 12; i++) await rs.run({ queries: [{ q: 'round' + i, engine: 'gdelt' }] }, 't');
  assert.equal(rs.ledgerOf('t').rounds.length, 13);
});

test('the capability is registered, read-only, and reachable', () => {
  const cap = makeAtlasCapabilities({}).resolve('research.search');
  assert.ok(cap, 'research.search is in the registry');
  assert.equal(cap.risk, 'read-only');
  assert.equal(cap.ingests, 'external', 'what it returns is third-party text');
});

/* ── the deliverable axis ───────────────────────────────────────────────────────────────────────── */
const snapWith = (n) => ({ atlas: { shapes: { 'polygon:real': n } }, activeLayers: [] });
const q = { id: 'wc', deliverables: [{ kind: 'map', mapState: { drawn: [{ path: 'atlas.shapes.polygon:real', min: 8, why: 'one per team' }] } }, { kind: 'result', capability: 'data.table', path: 'rows', min: 3 }] };

test('a turn that said complete but drew nothing is counted as a false completion; an honest partial is not', () => {
  const said = deliverablesOfTurn(q, { measured: true, completion: 'complete', snapshot: snapWith(0), operations: [], calls: [] });
  assert.equal(said.finished, false);
  assert.equal(said.falseCompletion, true);
  const honest = deliverablesOfTurn(q, { measured: true, completion: 'partial', snapshot: snapWith(0), operations: [], calls: [] });
  assert.equal(honest.falseCompletion, false);
  assert.equal(honest.honestIncomplete, true);
});

test('everything present is finished; a missing section is unobserved, never absent', () => {
  const calls = [{ name: 'data.table', result: { rows: [1, 2, 3, 4] } }];
  const done = deliverablesOfTurn(q, { measured: true, completion: 'complete', snapshot: snapWith(9), operations: [{ capabilityId: 'data.table', status: 'completed' }], calls });
  assert.equal(done.finished, true);
  const blind = deliverablesOfTurn(q, { measured: true, completion: 'complete', snapshot: null, operations: [{ capabilityId: 'data.table', status: 'completed' }], calls });
  assert.equal(blind.finished, null, 'unobserved is not a failure');
  assert.equal(blind.falseCompletion, false);
  assert.equal(observeDeliverable({ kind: 'result', capability: 'data.table', path: 'rows', min: 3 }, { operations: null, calls: null }).verdict, 'unobserved');
});

test('the rate is over observed turns and unobserved is counted apart', () => {
  const rate = completionRateOf([
    deliverablesOfTurn(q, { measured: true, completion: 'complete', snapshot: snapWith(0), operations: [], calls: [] }),
    deliverablesOfTurn(q, { measured: true, completion: 'complete', snapshot: snapWith(9), operations: [{ capabilityId: 'data.table', status: 'completed' }], calls: [{ name: 'data.table', result: { rows: [1, 2, 3] } }] }),
    deliverablesOfTurn(q, { measured: true, completion: 'complete', snapshot: null, operations: null, calls: null }),
    null,
  ]);
  assert.equal(rate.turns, 3);
  assert.equal(rate.observedTurns, 2);
  assert.equal(rate.unobservedTurns, 1);
  assert.equal(rate.turnRate, 0.5);
  assert.deepEqual(rate.falseCompletion, ['wc']);
});

test('a question that states its map has that map as a deliverable without restating it', () => {
  const t = deliverablesOfTurn({ id: 'm', mapState: { drawn: [{ path: 'atlas.shapes.polygon:real', min: 1 }] } }, { measured: true, snapshot: snapWith(2) });
  assert.equal(t.finished, true);
  assert.equal(deliverablesOfTurn({ id: 'n' }, { measured: true }), null, 'a question that asks for nothing countable is not counted');
});

test('the history keeps measured rows only and reads back as a trend', () => {
  const rate = completionRateOf([deliverablesOfTurn(q, { measured: true, completion: 'complete', snapshot: snapWith(0), operations: [], calls: [] })]);
  assert.equal(rowOf({ dryRun: true, completionRate: rate }), null, 'a dry run is not a measurement');
  assert.equal(rowOf({ completionRate: completionRateOf([]) }), null);
  const row = rowOf({ when: '2026-11-24T00:00:00Z', build: 'abc', url: 'u', completionRate: rate });
  const rows = readHistory(JSON.stringify(row) + '\n' + JSON.stringify({ ...row, deliverableRate: 1 }) + '\nnot json\n');
  assert.equal(rows.length, 2);
  assert.match(renderTrend(rows), /latest vs previous/);
});

/* ── a schema is sent once ──────────────────────────────────────────────────────────────────────── */
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

async function findTurn(query) {
  const CAPS = makeAtlasCapabilities({}), AGENT = makeAtlasAgent();
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: async () => ({ ok: true, html: '<div/>', meta: { status: 'completed' } }) });
  const tools = surface.baseTools();
  let i = 0;
  const model = async () => (i++ === 0 ? { text: '', turnState: 'continuing', toolCalls: [{ id: 'f', name: 'find_capability', arguments: { query } }] } : { text: 'done', toolCalls: [] });
  const out = await AGENT.runTurn({ model, tools, execute: surface.makeExecute(tools, AGENT), footprint: (c) => surface.footprintOf(c, tools), promote: surface.promotionsOf, system: 's', messages: [{ role: 'user', content: 'q' }] });
  return out.results.find((r) => r.name === 'find_capability');
}

test('a match that became a tool does not carry its schema twice; one that did not become a tool keeps it', async () => {
  const found = await findTurn('route from Osaka station');
  assert.ok(found.matches.length > 0 && found.promotedTools.length > 0);
  for (const m of found.matches) {
    if (found.promotedTools.includes(m.tool)) { assert.equal(m.schema, undefined, m.id + ' is a tool now — its schema is in the definition'); assert.match(m.schemaIn, new RegExp(m.tool)); }
    else assert.ok(m.schema, m.id + ' was not offered as a tool, so run_capability is the only way to it and it keeps its schema');
  }
});
