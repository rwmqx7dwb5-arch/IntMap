/* ============================================================================
 *  (atlas-search-evidence-store) The session's web evidence store, and the three doors that use it.
 *
 *  What is claimed (each is OBSERVED here, none read off the source text):
 *   ① a query is the same query whatever its case, width, spacing or edge punctuation
 *   ② acquire(): the same fetch running twice is ONE request; a fresh record is answered from the store; refresh:true fetches again;
 *      a failure is never stored (the next call tries again); a record past its time to live is not served
 *   ③ note(): a cited source is found by any spelling of its address (campaign parameters, fragment, trailing slash), keeping title + query
 *   ④ the light reader (js/web-browse.js): two asks for one address — the second spelled differently — make ONE request, the second says
 *      `evidence.reused`, and a click on a ref of the reused page still works (the state was restored); a handoff is never stored
 *   ⑤ web.search: its questions run AT THE SAME TIME (not one after another), an identical question in the same call or a later one is
 *      not searched twice, and a search that did not actually run is said to be not_run, never given as a result
 *   ⑥ web.evidence: re-reads a record by id, address or words, with its sources; no ref lists what is held
 *   ⑦ the server: `web_search` is a registered task, and the journal row carries how many searches ran inside the call
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeWebEvidence, queryKey } from '../js/atlas-web-evidence.js';
import { journalArgs } from '../supabase/functions/_shared/ai-ledger.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('① a query is its words, not its spelling', () => {
  assert.equal(queryKey('  Population of  JAPAN?  '), queryKey('population of japan'));
  assert.equal(queryKey('ＵＳ　ＧＤＰ'), queryKey('us gdp'), 'full-width letters and spaces fold');
  assert.notEqual(queryKey('population of japan'), queryKey('population of china'));
});

test('② acquire: joined while running, stored while fresh, refreshed on request, failure not kept, expired not served', async () => {
  let t = 1_000_000;
  const ev = makeWebEvidence({ now: () => t });
  let calls = 0;
  const fetcher = (n) => async () => { calls += 1; await tick(20); return { ok: true, text: 'body ' + n, value: { n } }; };
  const [a, b] = await Promise.all([ev.acquire('page', 'k', fetcher(1)), ev.acquire('page', 'k', fetcher(2))]);
  assert.equal(calls, 1, 'two askers at the same moment make one request');
  assert.deepEqual([a.how, b.how].sort(), ['fetched', 'joined']);
  assert.equal(a.entry.id, b.entry.id);

  const c = await ev.acquire('page', 'k', fetcher(3));
  assert.equal(c.how, 'stored'); assert.equal(calls, 1);
  const d = await ev.acquire('page', 'k', fetcher(4), { refresh: true });
  assert.equal(d.how, 'fetched'); assert.equal(calls, 2); assert.equal(d.entry.id, a.entry.id, 'a refresh replaces the record, keeping its id');
  const e = await ev.acquire('page', 'k', fetcher(5), { fits: () => false });
  assert.equal(e.how, 'fetched', 'a stored record that does not fit this request is not enough');

  const bad = await ev.acquire('page', 'bad', async () => ({ ok: false, error: new Error('x') }));
  assert.equal(bad.entry, null); assert.equal(ev.find('page', 'bad'), null, 'a failure is not stored');
  const again = await ev.acquire('page', 'bad', async () => ({ ok: true, text: 'now fine' }));
  assert.equal(again.how, 'fetched', 'and the next call tries again');

  t += 11 * 60e3;
  assert.equal(ev.find('page', 'k'), null, 'past its time to live it is not served');
  assert.equal(ev.list().length, 0, 'and not listed as held');
  assert.ok(ev.list({ stale: true }).length >= 1, 'unless the stale ones are asked for');
});

test('③ note: one source under every spelling of its address, with title and the queries that found it', () => {
  const ev = makeWebEvidence();
  assert.equal(ev.note([{ url: 'https://Example.com/a/?utm_source=x#top', title: 'A page' }], { via: 'worker', query: 'q one' }), 1);
  assert.equal(ev.note([{ url: 'https://example.com/a?utm_campaign=y', title: 'ignored later title' }], { via: 'turn', query: 'q two' }), 0, 'the same page is not a second record');
  const r = ev.read('https://example.com/a');
  assert.equal(r.title, 'A page'); assert.deepEqual(r.cited.queries, ['q one', 'q two']);
  assert.equal(ev.note([{ url: 'javascript:alert(1)', title: 'x' }, { url: 'http://127.0.0.1/x' }], {}), 0, 'a scheme or a private host is not a source');
});

test('③b turnSources: only this turn\'s pages and cited sources, in the shape the answer call takes', async () => {
  const ev = makeWebEvidence();
  await ev.acquire('search', 's', async () => ({ ok: true, turn: 'T1', text: 't', sources: [{ url: 'https://a.example/x', title: 'X' }] }));
  await ev.acquire('page', 'https://b.example/p', async () => ({ ok: true, turn: 'T2', url: 'https://b.example/p', title: 'P', text: 'p' }));
  const s1 = ev.turnSources('T1');
  assert.deepEqual(s1.map((x) => x.url), ['https://a.example/x']);
  assert.ok(s1[0].retrievedAt && 'publisher' in s1[0] && 'title' in s1[0]);
  assert.deepEqual(ev.turnSources('T2').map((x) => x.url), ['https://b.example/p']);
  assert.deepEqual(ev.turnSources('nope'), []);
});

/* ── ④ the light reader, against a fake edge function ─────────────────────────────────────────────────────────── */
async function withDoor(fn) {
  const sent = [];
  const prev = { window: globalThis.window, fetch: globalThis.fetch };
  globalThis.window = { SUPABASE_URL: 'https://edge.test', SUPABASE_ANON_KEY: 'k' };
  const page = (url, extra) => ({ ok: true, state: { url, cookies: {}, page: { l: [{ href: url + '/next' }] } }, status: 200, page: { title: 'T ' + url, text: 'text of ' + url, links: [{ ref: 'l1', text: 'next', href: url + '/next' }] }, ...extra });
  globalThis.fetch = async (u, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    await tick(15);
    let out;
    if (/handoff/.test(body.url || '')) out = { ok: false, code: 'handoff', handoff: { kind: 'login', url: body.url }, state: { url: body.url } };
    else if (body.action === 'click') out = page('https://x.example/clicked', { clickedFrom: body.state && body.state.url });
    else out = page(String(body.url));
    return { status: 200, json: async () => out };
  };
  try {
    const { webBrowseDoor } = await import('../js/web-browse.js');
    const { webEvidence } = await import('../js/atlas-web-evidence.js');
    webEvidence.clear();
    const HOST = { DB: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } } };
    await fn(webBrowseDoor(HOST), sent, webEvidence);
  } finally { globalThis.window = prev.window; globalThis.fetch = prev.fetch; }
}

test('④ the light reader: one request for one address however it is spelled, state restored on reuse, handoff not kept', async () => {
  await withDoor(async (door, sent) => {
    const [a, b] = await Promise.all([
      door.browse({ action: 'open', url: 'https://x.example/doc' }),
      door.browse({ action: 'open', url: 'https://X.example/doc/?utm_source=news#part' }),
    ]);
    assert.equal(sent.length, 1, 'two spellings of one address, asked together: one request');
    assert.ok(a.ok && b.ok);
    assert.ok([a, b].some((r) => r.evidence.reused === true), 'the second asker is told it was reused');
    assert.ok([a, b].some((r) => r.evidence.reused === false));
    assert.equal(a.evidence.id, b.evidence.id);
    assert.equal(door.currentUrl(), 'https://x.example/doc', 'the browsing state is the reused page, so its refs still mean something');

    const later = await door.browse({ action: 'open', url: 'https://x.example/doc' });
    assert.equal(sent.length, 1); assert.equal(later.evidence.how, 'stored'); assert.ok(later.evidence.ageSec >= 0);
    const click = await door.browse({ action: 'click', ref: 'l1' });
    assert.equal(sent.length, 2); assert.equal(click.clickedFrom, 'https://x.example/doc', 'a click goes out with the state the reused page left');

    const more = await door.browse({ action: 'open', url: 'https://x.example/doc', textChars: 20000 });
    assert.equal(more.evidence.reused, true, 'the page was not truncated, so a larger text asked for is already all there is');

    const fresh = await door.browse({ action: 'open', url: 'https://x.example/doc', refresh: true });
    assert.equal(sent.length, 3); assert.equal(fresh.evidence.reused, false);

    const h1 = await door.browse({ action: 'open', url: 'https://x.example/handoff' });
    const h2 = await door.browse({ action: 'open', url: 'https://x.example/handoff' });
    assert.equal(h1.code, 'handoff'); assert.equal(h2.code, 'handoff');
    assert.equal(sent.length, 5, 'a hand-over is the site\'s answer of that moment, not a page: asked again each time');
  });
});

/* ── ⑤ ⑥ the capabilities ─────────────────────────────────────────────────────────────────────────────────────── */
async function capsOf() {
  globalThis.window = globalThis.window || {};
  const mod = await import('../js/atlas-cap-web.js');
  const by = (id) => mod.default.find((e) => e.row[0] === id);
  return { search: by('web.search'), evidence: by('web.evidence') };
}
const KIT = (extra) => ({ R: (ok, html, o) => ({ ok, html, ...(o || {}) }), warn: (x) => x, esc: (x) => String(x), L: (en) => en, note: (x) => x, _curTurnKey: 'turn-1', ...extra });

test('⑤ web.search: questions run together, a repeat is not searched twice, an un-run search is not a result', async () => {
  const { search } = await capsOf();
  assert.ok(search, 'web.search is declared');
  const { webEvidence } = await import('../js/atlas-web-evidence.js');
  webEvidence.clear();
  let running = 0, peak = 0, asked = [];
  const askAIJSONEnvelope = async (prompt, sys, imgs, opts) => {
    asked.push({ prompt, opts }); const n = asked.length;
    running += 1; peak = Math.max(peak, running);
    await tick(40);
    running -= 1;
    const noSearch = /unrun/.test(prompt);
    return { text: 'Answer for ' + prompt.slice(0, 40), citations: [{ url: 'https://src.example/' + n, title: 'S' + n }], meta: { webUsed: !noSearch, webSearches: noSearch ? 0 : 2 } };
  };
  const K = KIT({ askAIJSONEnvelope });
  const r = await search.run({ queries: [{ q: 'population of japan' }, { q: 'Population of Japan.' }, { q: 'population of china' }, { q: 'unrun question' }] }, {}, K);
  assert.equal(asked.length, 3, 'the second spelling of the first question is not asked again');
  assert.ok(peak >= 3, 'the three distinct questions ran at the same time (peak ' + peak + ')');
  assert.ok(asked.every((x) => x.opts.task === 'web_search' && x.opts.webMode === 'required' && x.opts.turnId === 'turn-1'));
  const s = r.exec.web.searches;
  assert.equal(s.filter((x) => x.state === 'ok').length, 2);
  assert.equal(s.find((x) => /unrun/.test(x.q)).state, 'not_run', 'a search that did not run is never given as a search result');
  assert.ok(s[0].evidenceId && s[0].sources.length === 1 && s[0].sources[0].url.startsWith('https://src.example/'), 'the answer keeps its sources');
  assert.equal(r.exec.web.untrusted, true);

  const again = await search.run({ queries: [{ q: 'POPULATION OF JAPAN' }] }, {}, K);
  assert.equal(asked.length, 3, 'a later asker is answered from the store (only the un-run one is tried again)');
  assert.equal(again.exec.web.searches[0].how, 'stored');
  assert.equal(webEvidence.turnSources('turn-1').length, 2, 'the turn\'s answer call can cite what was found');
  const refreshed = await search.run({ queries: [{ q: 'population of japan' }], refresh: true }, {}, K);
  assert.equal(refreshed.exec.web.searches[0].how, 'fetched');
});

test('⑥ web.evidence: re-read by id, by address, by words; no ref lists; unknown says so and lists', async () => {
  const { search, evidence } = await capsOf();
  const { webEvidence } = await import('../js/atlas-web-evidence.js');
  webEvidence.clear();
  const askAIJSONEnvelope = async () => ({ text: 'Population is 124 million (2024).', citations: [{ url: 'https://stats.example/pop', title: 'Stats' }], meta: { webUsed: true, webSearches: 1 } });
  const K = KIT({ askAIJSONEnvelope });
  const s = await search.run({ queries: [{ q: 'population of japan' }] }, {}, K);
  const id = s.exec.web.searches[0].evidenceId;
  const byId = await evidence.run({ ref: id }, {}, K);
  assert.ok(byId.ok); assert.match(byId.exec.web.evidence.text, /124 million/); assert.equal(byId.exec.web.evidence.sourceList[0].url, 'https://stats.example/pop');
  const byWords = await evidence.run({ ref: 'Population of Japan' }, {}, K);
  assert.equal(byWords.exec.web.evidence.id, id);
  const byUrl = await evidence.run({ ref: 'https://stats.example/pop#x' }, {}, K);
  assert.equal(byUrl.exec.web.evidence.kind, 'cited');
  const listed = await evidence.run({}, {}, K);
  assert.ok(listed.exec.web.held.some((h) => h.id === id));
  const none = await evidence.run({ ref: 'ev9999' }, {}, K);
  assert.equal(none.ok, false); assert.equal(none.meta.code, 'no_such_evidence'); assert.ok(Array.isArray(none.exec.web.held));
});

test('⑦ the server: web_search is a registered task and a journal row says how many searches ran', () => {
  assert.match(read('supabase/functions/ai-proxy/tasks/all.ts'), /as web_search } from "\.\/web_search\.ts"/);
  assert.match(read('supabase/functions/ai-proxy/tasks/web_search.ts'), /name: "web_search"/);
  assert.equal(journalArgs({ user: 'u', root: 'r', task: 'web_search', outcome: 'ok', web: true, webSearches: 3 }).p_web_searches, 3);
  assert.equal(journalArgs({ user: 'u', root: 'r', outcome: 'ok' }).p_web_searches, 0);
  assert.match(read('supabase/migrations/20261130100000_journal_web_searches.sql'), /add column if not exists web_searches/);
  const ask = read('supabase/functions/ai-proxy/ask.ts');
  assert.match(ask, /journalTask === "web_search"/); assert.match(ask, /webSearches: out\.webCount/);
});
