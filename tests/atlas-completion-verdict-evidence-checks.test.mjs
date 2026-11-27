/* ============================================================================
 *  atlas-completion-verdict — three defects an outside audit reproduced, each EVALUATED through the real functions
 *
 *   ④ a checker's "supported" with no source and no excerpt was counted as supported (and unchecked:0). It is the model's agreement,
 *      not a check: it is `asserted` (basis model_unsourced) and the turn's row counts it with the unchecked. With a source and the
 *      source's words it is supported; when the session holds the page whole, the words must be in it.
 *   ⑥ the web evidence store remembered only the turn that FETCHED a record, so a search asked again in turn 2 was answered from the
 *      store and turn 2's answer had none of its sources. Fetched-by and used-by are two facts now.
 *      And the turn's tally of «the answer names the finding's source» dropped the whole query and accepted a prefix, so two series
 *      of one portal (?id=dem, ?id=landcover) were one source. The address identity is js/atlas-evidence.js canonicalizeUrl's.
 *   ⑧ evidence_used had a column, a recorder and a test, and no caller: the moment the turn first takes a gathered source in hand
 *      is now marked by the store when the parent's own reader is handed one (a delegated worker's read is not the parent's).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { verifyOutcome, verifyContract } = await import('../js/atlas-orchestrate.js');
const { buildTurnMetrics, makeTurnRecorder } = await import('../js/atlas-turn-metrics.js');
const { webEvidence, makeWebEvidence } = await import('../js/atlas-web-evidence.js');
const webCaps = (await import('../js/atlas-cap-web.js')).default;
const cap = (id) => webCaps.find((e) => e.row[0] === id);

const ok = (id, extra) => Object.assign({ id, state: 'done', findings: [], facts: [], gaps: [], sources: [], notFound: [], costUsd: 0, calls: 1 }, extra);
const of = ok('a', { findings: [{ claim: 'Suez opened in 1869' }] });
const KIT = (turn, extra) => ({ R: (o, html, x) => ({ ok: o, html, ...(x || {}) }), warn: (x) => x, esc: (x) => String(x), L: (en) => en, note: (x) => x, _curTurnKey: turn, ...extra });

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
test('④ an id and "supported" with no source or excerpt is not supported: it is asserted, and the turn counts it unchecked', () => {
  const bare = verifyOutcome([{ of, by: ok('verify-a', { findings: [{ id: 'a#1', claim: 'Suez opened in 1869', verdict: 'supported' }] }) }]);
  assert.equal(bare.counts.supported, 0);
  assert.equal(bare.counts.asserted, 1);
  assert.equal(bare.basis.model, 0); assert.equal(bare.basis.model_unsourced, 1);
  const c = bare.checked[0];
  assert.deepEqual([c.verdict, c.said, c.basis], ['asserted', 'supported', 'model_unsourced']);

  const named = verifyOutcome([{ of, by: ok('verify-a', { findings: [{ id: 'a#1', claim: 'x', verdict: 'supported', source: 'https://canal.example/history' }] }) }]);
  assert.equal(named.counts.supported, 0, 'a source with none of its words is cited, not evidenced (js/atlas-job-core.js findingBasis)');

  const row = buildTurnMetrics({ completion: 'complete', results: [{ meta: { integrated: { verification: bare } } }] }, {});
  assert.deepEqual([row.verify_model, row.verify_unchecked], [0, 1], 'the row the database receives: no model check, one claim nobody checked');
});

test('④ with a source and the source\'s words it is supported; held whole, the words must be in the page', () => {
  const by = ok('verify-a', { findings: [{ id: 'a#1', claim: 'x', verdict: 'supported', source: 'https://canal.example/history', excerpt: 'The canal opened to shipping on 17 November 1869.' }] });
  const o = verifyOutcome([{ of, by }]);
  assert.equal(o.counts.supported, 1); assert.equal(o.counts.asserted, 0);
  assert.equal(o.basis.model, 1);
  assert.equal(o.checked[0].excerpt, 'not_looked_up', 'no reader of held text was given: it says so, and claims nothing about the page');

  const page = 'History. The canal OPENED to shipping on 17 November, 1869 — after ten years of work.';
  const found = verifyOutcome([{ of, by }], { heldText: (u) => (u === 'https://canal.example/history' ? page : null) });
  assert.deepEqual([found.counts.supported, found.checked[0].excerpt], [1, 'in_source'], 'compared by fold: case, spacing and punctuation aside');

  const absent = verifyOutcome([{ of, by }], { heldText: () => 'History. The canal opened in 1875.' });
  assert.deepEqual([absent.counts.supported, absent.counts.asserted, absent.checked[0].excerpt], [0, 1, 'not_in_source']);

  const unheld = verifyOutcome([{ of, by }], { heldText: () => null });
  assert.deepEqual([unheld.counts.supported, unheld.checked[0].excerpt], [1, 'not_looked_up'], 'a page not held is not observed — never called a failure');
});

test('④ the checker is asked for the excerpt it checked against', () => {
  const c = verifyContract('a', { claims: [{ id: 'a#1', claim: 'Suez opened in 1869' }] });
  assert.match(c.goal, /"excerpt"/); assert.match(c.returns, /"excerpt"/);
  assert.match(verifyContract('a').goal, /excerpt/);
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
test('⑥ the same search in turn 1 and turn 2: asked once, turn 2 is given its sources, the fetch stays turn 1\'s', async () => {
  webEvidence.clear();
  let asked = 0;
  const askAIJSONEnvelope = async () => { asked++; return { text: 'Japan: 124 million (2024).', citations: [{ url: 'https://stats.example/pop?id=jp', title: 'Stats' }], meta: { webUsed: true, webSearches: 1 } }; };
  const search = cap('web.search');
  const r1 = await search.run({ queries: [{ q: 'population of japan' }] }, {}, KIT('T1', { askAIJSONEnvelope }));
  const r2 = await search.run({ queries: [{ q: 'Population of Japan' }] }, {}, KIT('T2', { askAIJSONEnvelope }));
  assert.equal(asked, 1);
  assert.equal(r2.exec.web.searches[0].how, 'stored');
  assert.deepEqual(webEvidence.turnSources('T2').map((x) => x.url), ['https://stats.example/pop?id=jp'], 'turn 2 used it, so turn 2\'s answer can cite it');
  assert.deepEqual(webEvidence.turnSources('T1').map((x) => x.url), ['https://stats.example/pop?id=jp']);
  const rec = webEvidence.read(r1.exec.web.searches[0].evidenceId, 200);
  assert.equal(rec.fetchedTurn, 'T1', 'when and by whom it was fetched is kept');
  assert.deepEqual(rec.usedBy, ['T1', 'T2']);
  assert.equal(webEvidence.turnSources('T3').length, 0, 'a turn that used nothing is given nothing');
  const reread = await cap('web.evidence').run({ ref: r1.exec.web.searches[0].evidenceId }, {}, KIT('T3'));
  assert.ok(reread.ok);
  assert.equal(webEvidence.turnSources('T3').length, 1, 'a re-read with web.evidence is a use by the turn that re-read it');
});

test('⑥ a cited source noted for a turn, and a page the light reader opened, are that turn\'s', async () => {
  const ev = makeWebEvidence();
  ev.note([{ url: 'https://news.example/a', title: 'A' }], { via: 'web.search', query: 'q', turn: 'T5' });
  ev.note([{ url: 'https://news.example/a?utm_source=x', title: 'A' }], { via: 'web.search', query: 'q2', turn: 'T6' });
  assert.deepEqual(ev.turnSources('T6').map((x) => x.url), ['https://news.example/a'], 'the same source cited again in another turn is that turn\'s too');

  const prev = { fetch: globalThis.fetch, url: globalThis.window.SUPABASE_URL, key: globalThis.window.SUPABASE_ANON_KEY };
  globalThis.window.SUPABASE_URL = 'https://edge.test'; globalThis.window.SUPABASE_ANON_KEY = 'k';
  let sent = 0;
  globalThis.fetch = async (u, init) => { sent++; const b = JSON.parse(init.body); return { status: 200, json: async () => ({ ok: true, status: 200, state: { url: b.url, cookies: {} }, page: { title: 'Portal', text: 'body', links: [] } }) }; };
  try {
    webEvidence.clear();
    const HOST = { DB: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } } };
    const browse = cap('web.browse');
    await browse.run({ action: 'open', url: 'https://portal.example/series?id=dem' }, {}, KIT('T7', { HOST }));
    await browse.run({ action: 'open', url: 'https://portal.example/series?id=dem&utm_source=feed' }, {}, KIT('T8', { HOST }));
    assert.equal(sent, 1, 'the second open is answered from the store');
    assert.deepEqual(webEvidence.turnSources('T8').map((x) => x.url), ['https://portal.example/series?id=dem']);
    assert.deepEqual(webEvidence.turnSources('T7').map((x) => x.url), ['https://portal.example/series?id=dem'], 'a page opened through web.browse belongs to its turn (it belonged to none)');
  } finally { globalThis.fetch = prev.fetch; globalThis.window.SUPABASE_URL = prev.url; globalThis.window.SUPABASE_ANON_KEY = prev.key; }
});

test('⑥ one source by its canonical address: two series of one portal are two, a campaign parameter is not a second', () => {
  const findings = [{ claim: 'elevation', source: 'https://portal.example/series?id=dem', excerpt: 'dem values' }];
  const row = (cites, text) => buildTurnMetrics({ completion: 'complete', text: text || '', results: [{ meta: { delegated: [{ findings }] } }] }, { cites });
  assert.equal(row([{ url: 'https://portal.example/series?id=landcover' }]).claims_backing, 0, 'another query of the same path is another source');
  assert.equal(row([{ url: 'https://portal.example/series' }]).claims_backing, 0, 'the path without its query is not this source either (no prefix match)');
  assert.equal(row([{ url: 'https://portal.example/series?id=dem&utm_source=newsletter' }]).claims_backing, 1, 'a campaign parameter does not make a second source');
  assert.equal(row([], 'From https://portal.example/series?id=dem.').claims_backing, 1, 'named in the prose');
  assert.equal(row([], 'From https://portal.example/series?id=landcover.').claims_backing, 0);
  const named = buildTurnMetrics({ completion: 'complete', text: 'According to Some Outlet, …', results: [{ meta: { delegated: [{ findings: [{ claim: 'c', source: 'Some Outlet', excerpt: 'w' }] }] } }] }, { cites: [] });
  assert.equal(named.claims_backing, 1, 'a source that is not an address is still named by its words');
});

/* ── ⑧ ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
test('⑧ evidence_used: the turn\'s own web.search records it; a worker\'s read records the arrival only, the parent\'s later use the moment', async () => {
  webEvidence.clear();
  const askAIJSONEnvelope = async () => ({ text: 'An answer.', citations: [{ url: 'https://src.example/1', title: 'S' }], meta: { webUsed: true, webSearches: 1 } });
  const search = cap('web.search');

  let t = 0;
  const rec = makeTurnRecorder({ now: () => t, emit: () => {} });
  t = 1500;
  await search.run({ queries: [{ q: 'first question' }] }, {}, KIT('U1', { askAIJSONEnvelope }));
  t = 9000;
  const row = rec.recordAnswer({ completion: 'complete', text: 'x' }, 'U1');
  assert.equal(row.evidence_arrived_ms, 1500);
  assert.equal(row.evidence_used_ms, 1500, 'the parent ran the search: it had the source in hand the moment it arrived');

  t = 0;
  const rec2 = makeTurnRecorder({ now: () => t, emit: () => {} });
  t = 2000;
  await search.run({ queries: [{ q: 'a worker question' }] }, { source: 'atlas-worker' }, KIT('U2', { askAIJSONEnvelope }));
  assert.equal(rec2.row({}).evidence_arrived_ms, 2000);
  assert.equal(rec2.row({}).evidence_used_ms, null, 'a delegated worker\'s read is not the parent\'s use');
  t = 3500;
  await search.run({ queries: [{ q: 'a worker question' }] }, {}, KIT('U2', { askAIJSONEnvelope }));
  assert.equal(rec2.row({}).evidence_used_ms, 3500, 'the parent took the stored record in hand');
  t = 4000;
  webEvidence.turnSources('U2', { use: true });
  assert.equal(rec2.recordAnswer({ completion: 'complete', text: 'x' }, 'U2').evidence_used_ms, 3500, 'the first use only');

  t = 0;
  const rec3 = makeTurnRecorder({ now: () => t, emit: () => {} });
  t = 300;
  await search.run({ queries: [{ q: 'only a worker asked this' }] }, { source: 'atlas-worker' }, KIT('U3', { askAIJSONEnvelope }));
  t = 700;
  assert.equal(webEvidence.turnSources('U3').length, 1);
  assert.equal(rec3.row({}).evidence_used_ms, null, 'listing is not using');
  assert.equal(webEvidence.turnSources('U3', { use: true }).length, 1);
  assert.equal(rec3.recordAnswer({ completion: 'complete', text: 'x' }, 'U3').evidence_used_ms, 700, 'handing what a worker gathered to the turn\'s answer is the parent\'s use');
});
