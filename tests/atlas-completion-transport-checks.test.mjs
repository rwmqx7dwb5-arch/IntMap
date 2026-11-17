/* (atlas-completion) WHAT A CALL TO THE MODEL SAYS ABOUT ITSELF — the transport half of the 2026-11-17 reports.
 *
 *  MEASURED before this, on the shipped code (node, fetch stubbed):
 *   A6a js/ai-core.js handed a provider's 400 — relayed by ai-proxy as
 *       {error:"provider_unavailable", retryable:false, meta:{providerStatus:400}} — to its caller as
 *       {"message":"The AI service is temporarily unavailable — please try again shortly.","code":"provider_unavailable"}
 *       with no status, no retryable and no meta.
 *   A6b providers/openai.ts returned {"text":"half an ans","finishReason":"incomplete", …} for a Responses answer
 *       with status "incomplete" / incomplete_details.reason "max_output_tokens" — the reason was gone.
 *   B3  a web-required call whose search timed out came back {"webAttached":false,"webUsed":false, …} after a second,
 *       tool-free request — indistinguishable from a search that was never asked for or that found nothing.
 *   B4  a figure had to carry a statistical seriesId whatever it was (a fare, a travel time), and a page fetched
 *       earlier in the turn had no evidence id in the next call.
 *
 *  Everything here RUNS the code: ai-core with the browser around it stubbed, the providers with fetch stubbed,
 *  ai-proxy end to end through tests/helpers/ai-proxy-contract-run.mjs (Deno.serve captured), the pipeline with a
 *  scripted model. The research capability's two sentence builders are lifted out of their file and evaluated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importModule } from './helpers/import-module.mjs';
import { SITE_HOST } from '../supabase/functions/_shared/site-origin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'supabase', 'functions', 'ai-proxy');
const imp = (p) => import(pathToFileURL(join(FN, p)).href);

/* ── js/ai-core.js, imported fresh with the browser around it (the harness of tests/ai-quota-checks) ── */
const BROWSER = ['window', 'document', 'location', 'localStorage', 'navigator', 'fetch'];
const found = Object.fromEntries(BROWSER.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const restore = () => { for (const k of BROWSER) { if (found[k]) Object.defineProperty(globalThis, k, found[k]); else delete globalThis[k]; } };
async function core(respond) {
  const calls = [];
  const win = { INTMAP_AI_PROXY: { url: 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/ai-proxy' }, SUPABASE_ANON_KEY: 'anon-key' };
  win.window = win;
  win.sb = { auth: { async getSession() { return { data: { session: { access_token: 'jwt' } } }; } },
    from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { count: 0 } }; } }; } };
  const localStorage = { _m: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } };
  const document = { getElementById() { return null; } };
  const fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return respond(calls.length); };
  const M = await importModule('js/ai-core.js', { globals: { window: win, document, location: { protocol: 'https:', hostname: SITE_HOST }, localStorage, navigator: {}, fetch } });
  const HOST = { lang: 'en', user: { id: '613271ce-0000-4000-8000-000000000000' }, aiUsage: { date: '', used: 0, limit: 10 }, AI_FREE_DAILY: 10, aiButtonSyncers: [], openAuthModal() {}, t(k) { return k; } };
  return { IM: M.aiCore(HOST), calls };
}
const res = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get() { return 'application/json'; } },
  async json() { return JSON.parse(body); }, async text() { return body; } });
const failOf = async (IM) => { try { await IM.askAIJSONEnvelope('q', 's', null, { task: 'free_text', turnId: 't' }); } catch (e) { return e; } return null; };

test('A6a ① a failure the server calls not retryable keeps its code, status, retryable and meta — and is not «temporarily unavailable»', async () => {
  try {
    const body = JSON.stringify({ error: 'provider_unavailable', message: 'AI provider error 400.', retryable: false,
      meta: { provider: 'openai', model: 'gpt-6.1-sol', task: 'free_text', providerStatus: 400, bodyLen: 120, nested: { leak: 'x' } } });
    const { IM, calls } = await core(() => res(502, body));
    const e = await failOf(IM);
    assert.ok(e, 'the call failed');
    assert.equal(e.code, 'provider_unavailable');
    assert.equal(e.status, 502, 'the HTTP status rides on the Error');
    assert.equal(e.retryable, false, 'the server\'s retryable:false is kept');
    assert.equal(e.meta.providerStatus, 400);
    assert.equal(e.meta.nested, undefined, 'only flat scalar diagnostics are passed on');
    assert.doesNotMatch(e.message, /temporarily/i, 'a non-retryable failure is not said to be temporary');
    assert.match(e.message, /\(400\)/, 'the provider status is named');
    assert.equal(calls.length, 1, 'nothing retried it');
  } finally { restore(); }
});

test('A6a ② a retryable failure still reads as temporary; without a server verdict the status decides; a dead network is retryable', async () => {
  try {
    const t = await core(() => res(503, JSON.stringify({ error: 'provider_unavailable', message: 'The AI provider timed out.', retryable: true, meta: { timeout: true } })));
    const e1 = await failOf(t.IM);
    assert.equal(e1.retryable, true);
    assert.match(e1.message, /temporarily/i);
    assert.equal(e1.meta.timeout, true);
    const e500 = await failOf((await core(() => res(500, '<html>oops</html>'))).IM);
    assert.equal(e500.status, 500); assert.equal(e500.retryable, true); assert.equal(e500.code, 'http_500');
    const e400 = await failOf((await core(() => res(400, 'bad'))).IM);
    assert.equal(e400.status, 400); assert.equal(e400.retryable, false);
    const net = await failOf((await core(() => { throw new TypeError('Failed to fetch'); })).IM);
    assert.equal(net.code, 'network'); assert.equal(net.status, 0); assert.equal(net.retryable, true);
    assert.ok(net instanceof TypeError, 'the platform\'s error is annotated, not replaced');
    const quota = await failOf((await core(() => res(429, JSON.stringify({ error: 'limit', used: 10, limit: 10 })))).IM);
    assert.equal(quota.code, 'limit'); assert.equal(quota.retryable, false, 'the day\'s quota is not a retry');
  } finally { restore(); }
});

test('A6a ③ a successful answer\'s meta reaches the caller whole: status, incompleteReason, web', async () => {
  try {
    const meta = { protocol: 1, status: 'incomplete', incompleteReason: 'max_output_tokens', finishReason: 'incomplete', web: { state: 'failed', reason: 'timeout', searches: 0, sources: null } };
    const { IM } = await core(() => res(200, JSON.stringify({ text: '{"a":1}', meta })));
    const env = await IM.askAIJSONEnvelope('q', 's', null, { task: 'json_extract' });
    assert.equal(env.meta.status, 'incomplete');
    assert.equal(env.meta.incompleteReason, 'max_output_tokens');
    assert.deepEqual(env.meta.web, meta.web);
  } finally { restore(); }
});

/* ── the providers, evaluated with fetch stubbed ── */
const meter = { ceiling: { take: async () => ({ ok: true }) }, add() {} };
const ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
const msg = (text) => ({ type: 'message', content: [{ type: 'output_text', text, annotations: [] }] });
async function withFetch(fn, body) { const keep = globalThis.fetch; globalThis.fetch = fn; try { return await body(); } finally { globalThis.fetch = keep; } }

test('A6b openai: an incomplete Responses answer keeps its text and says why it stopped', async () => {
  const { callOpenAI } = await imp('providers/openai.ts');
  const call = () => callOpenAI('gpt-6.1-sol', 'k', 'p', 's', [], [], [], false, 500, false, false, 'low', 'auto', true, null, null, '', meter);
  const cut = await withFetch(async () => ok({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, model: 'm', output: [msg('half')] }), call);
  assert.equal(cut.text, 'half');
  assert.equal(cut.incompleteReason, 'max_output_tokens');
  const whole = await withFetch(async () => ok({ status: 'completed', model: 'm', output: [msg('all')] }), call);
  assert.equal(whole.incompleteReason, null);
});

test('A6b anthropic / gemini: a stop that is not the model\'s own end is reported in the provider\'s words', async () => {
  const { anthropicIncomplete, anthropicWeb } = await imp('providers/anthropic.ts');
  const { geminiIncomplete } = await imp('providers/gemini.ts');
  assert.equal(anthropicIncomplete('end_turn'), null);
  assert.equal(anthropicIncomplete('tool_use'), null);
  assert.equal(anthropicIncomplete('max_tokens'), 'max_tokens');
  assert.equal(anthropicIncomplete('pause_turn'), 'pause_turn');
  assert.equal(anthropicIncomplete(''), null, 'an absent stop_reason was not observed');
  assert.equal(geminiIncomplete('STOP'), null);
  assert.equal(geminiIncomplete('MAX_TOKENS'), 'MAX_TOKENS');
  assert.equal(geminiIncomplete('NO_CANDIDATE'), null);
  /* what Anthropic's search returned: a result list is counted, an error block is the failure's reason */
  const w = anthropicWeb({ content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }] }, true);
  assert.equal(w.webFailure, 'max_uses_exceeded');
  const w2 = anthropicWeb({ content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: [] }] }, true);
  assert.equal(w2.webSources, 0); assert.equal(w2.webFailure, undefined);
});

test('B3 openai: a required search taken away is reported as failed, with what took it', async () => {
  const { callOpenAI } = await imp('providers/openai.ts');
  const call = () => callOpenAI('gpt-6.1-sol', 'k', 'p', 's', [], [], [], true, 500, false, true, 'low', 'auto', true, null, null, '', meter);
  const sent = [];
  const timedOut = await withFetch(async (u, init) => {
    sent.push(JSON.parse(init.body));
    if (sent.length === 1) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    return ok({ status: 'completed', model: 'm', output: [msg('from memory')] });
  }, call);
  assert.deepEqual(sent.map((b) => (b.tools || []).map((t) => t.type)), [['web_search'], []], 'the second request ran without the search');
  assert.equal(timedOut.webFailure, 'timeout');
  let n = 0;
  const refused = await withFetch(async (u, init) => {
    n++; const b = JSON.parse(init.body);
    if ((b.tools || []).length) return new Response('{"error":{"message":"bad"}}', { status: 400 });
    return ok({ status: 'completed', model: 'm', output: [msg('no search')] });
  }, call);
  assert.equal(refused.webFailure, 'rejected');
  assert.ok(n >= 2);
  const empty = await withFetch(async () => ok({ status: 'completed', model: 'm', output: [{ type: 'web_search_call', action: { type: 'search', sources: [] } }, msg('nothing found')] }), call);
  assert.equal(empty.webFailure, undefined);
  assert.equal(empty.webSources, 0, 'the provider listed no result');
});

test('B3 webOutcome: never asked, taken away, not used, found nothing, found something — five different answers', async () => {
  const { webOutcome } = await imp('provider-call.ts');
  assert.deepEqual(webOutcome(false, {}), { state: 'not_run', reason: 'not_requested', searches: 0, sources: null });
  assert.equal(webOutcome(true, { webAttached: false, webFailure: 'timeout' }).state, 'failed');
  assert.equal(webOutcome(true, { webAttached: false, webFailure: 'timeout' }).reason, 'timeout');
  assert.equal(webOutcome(true, { webAttached: false }).reason, 'not_attached');
  assert.equal(webOutcome(true, { webAttached: true, webCount: 0 }).reason, 'model_did_not_search');
  assert.deepEqual(webOutcome(true, { webAttached: true, webCount: 2, webSources: 0, citations: [] }), { state: 'empty', reason: 'no_results', searches: 2, sources: 0 });
  assert.deepEqual(webOutcome(true, { webAttached: true, webCount: 1, citations: [{}, {}] }), { state: 'ok', reason: null, searches: 1, sources: 2 });
  assert.equal(webOutcome(true, { webAttached: true, webCount: 1, citations: [] }).sources, null, 'not reported is not zero');
});

/* ── ai-proxy end to end: the function's own answer carries what the provider said ── */
function runProxy(env, requests) {
  const dir = mkdtempSync(join(tmpdir(), 'aipc-completion-'));
  const file = join(dir, 'cfg.json');
  writeFileSync(file, JSON.stringify({ entry: pathToFileURL(join(FN, 'index.ts')).href, env, requests }));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--no-warnings', join(ROOT, 'tests', 'helpers', 'ai-proxy-contract-run.mjs')], { env: { ...process.env, AIPC_CFG_FILE: file }, maxBuffer: 16 * 1024 * 1024, timeout: 120_000 },
      (err, stdout, stderr) => { rmSync(dir, { recursive: true, force: true }); if (err) return reject(new Error((stderr || err.message).slice(0, 2000))); resolve(JSON.parse(stdout)); });
  });
}

test('A6b · B3 ai-proxy: meta.status / incompleteReason / web are the provider\'s report, in the answer the page receives', async () => {
  const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key', AI_PROVIDER: 'openai', AI_MODEL: 'gpt-6.1-sol', OPENAI_API_KEY: 'sk' };
  const user = { id: 'u-1', email: 'r@example.test', aud: 'authenticated', role: 'authenticated' };
  const headers = { Authorization: 'Bearer jwt', 'content-type': 'application/json', 'x-intmap-turn': 'turn-c1' };
  const out = await runProxy(env, [
    { method: 'POST', headers, user, body: { task: 'free_text', prompt: 'hi' },
      provider: [{ status: 200, json: { model: 'gpt-6.1-sol', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [msg('half an answer')] } }] },
    { method: 'POST', headers, user, body: { task: 'free_text', prompt: 'latest?', webMode: 'required' },
      provider: [{ status: 200, json: { model: 'gpt-6.1-sol', status: 'completed', output: [{ type: 'web_search_call', action: { type: 'search', sources: [] } }, msg('nothing on the web')] } }] },
  ]);
  const [cut, empty] = out.map((r) => r.body);
  assert.equal(out[0].status, 200);
  assert.equal(cut.text, 'half an answer', 'the text is kept');
  assert.equal(cut.meta.status, 'incomplete');
  assert.equal(cut.meta.incompleteReason, 'max_output_tokens');
  assert.deepEqual(cut.meta.web, { state: 'not_run', reason: 'not_requested', searches: 0, sources: null });
  assert.equal(empty.meta.status, 'complete');
  assert.equal(empty.meta.incompleteReason, null);
  assert.deepEqual(empty.meta.web, { state: 'empty', reason: 'no_results', searches: 1, sources: 0 });
});

/* ── the answer pipeline and its contract ── */
test('B4 pipeline: a page retrieved earlier in the turn has an id before the call; what the search did and whether the answer ended come back', async () => {
  const { makeAtlasAnswerPipeline } = await import('../js/atlas-answer-pipeline.js');
  const P = makeAtlasAnswerPipeline();
  let seen = '';
  const answer = { directAnswer: { text: 'The fare is 230 yen.', claimIds: ['c1'] }, sections: [], claims: [
    { id: 'c1', text: 'The fare is 230 yen.', claimType: 'fact', importance: 'primary', dimension: 'level', evidenceIds: ['e1'], confidence: 'high',
      metric: { kind: 'stated', value: 230, unit: '円', concept: 'adult fare' } }] };
  const RES = await P.runStructuredAnswer({
    question: 'fare?', dataBlock: '', systemPrompt: 'S', language: 'English', webMode: 'required', turnId: 't1', retrievedAt: '2026-11-17T09:00:00Z',
    webSources: [{ url: 'https://www.example-rail.test/fares', title: 'Fares', retrievedAt: '2026-11-17T08:58:00Z' }],
    ask: async (prompt) => { seen = prompt; return { data: answer, text: JSON.stringify(answer), callId: '', citations: [],
      meta: { webUsed: false, status: 'incomplete', incompleteReason: 'max_output_tokens', web: { state: 'failed', reason: 'timeout', searches: 0, sources: null } } }; },
    parseJSON: JSON.parse,
  });
  assert.match(seen, /\[e1\][^\n]*title: Fares/, 'the retrieved page is in the evidence block with an id');
  const rec = RES.registry.get('e1');
  assert.equal(rec.retrievedAt, '2026-11-17T08:58:00Z', 'with the time it was actually retrieved');
  assert.deepEqual(RES.web, { state: 'failed', reason: 'timeout', searches: 0, sources: null });
  assert.deepEqual(RES.finish, { status: 'incomplete', reason: 'max_output_tokens' });
  assert.deepEqual(RES.retrieved.map((r) => [r.id, r.url]), [['e1', 'https://www.example-rail.test/fares']]);
  assert.equal(RES.env.claims[0].metric.kind, 'stated', 'the declared kind survives normalisation');
  /* an unreported outcome is not a failed one */
  const R2 = await P.runStructuredAnswer({ question: 'q', dataBlock: '', systemPrompt: 'S', webMode: 'auto',
    ask: async () => ({ data: answer, citations: [], meta: { webUsed: true } }), parseJSON: JSON.parse });
  assert.equal(R2.web, null);
  assert.deepEqual(R2.finish, { status: null, reason: null });
});

test('B4 contract: what a figure owes follows its declared kind, never its words', async () => {
  const { makeAtlasAnswerContract } = await import('../js/atlas-answer-contract.js');
  const C = makeAtlasAnswerContract();
  assert.deepEqual(C.METRIC_KINDS, ['statistic', 'stated']);
  assert.deepEqual(C.metricObligations({ kind: 'stated' }).errors, ['unit'], 'a stated figure owes no series');
  assert.ok(C.metricObligations({ kind: 'statistic' }).errors.includes('seriesId'));
  assert.ok(C.metricObligations({}).errors.includes('seriesId'), 'an undeclared kind is held to the stricter reading');
  assert.ok(C.metricObligations({ kind: 'fare' }).errors.includes('seriesId'), 'an unknown kind is not a loophole');
  assert.equal(C.normalizeAnswer({ claims: [{ id: 'c', text: 'x', metric: { kind: 'nonsense', value: 1 } }] }).claims[0].metric.kind, '');
  assert.ok(C.ANSWER_SCHEMA.properties.claims.items.properties.metric.properties.kind, 'the model has a field to declare it in');
  assert.match(C.answerContractRules({}), /"stated"/);
  const server = readFileSync(join(FN, 'tasks', 'analysis_structured.ts'), 'utf8');
  assert.match(server, /kind: \{ type: "STRING" \},\s*seriesId:/, 'the schema ai-proxy enforces has it too');
});

/* ── js/atlas-cap-research.js: the two sentence builders, lifted and evaluated ── */
const RSRC = readFileSync(join(ROOT, 'js', 'atlas-cap-research.js'), 'utf8');
const lift = new Function(RSRC.slice(RSRC.indexOf('function webOutcomeLine('), RSRC.indexOf('/* The pages retrieved earlier in THIS turn')) + '; return { webOutcomeLine, groundsLine };')();
const EN = (en) => en, JP = (en, jp) => jp;

test('B3 research: the caveat is read off what happened — five search outcomes, and what the answer actually cites', () => {
  const said = [
    lift.webOutcomeLine({ state: 'failed', reason: 'timeout', searches: 0 }, EN),
    lift.webOutcomeLine({ state: 'failed', reason: 'rejected', searches: 0 }, EN),
    lift.webOutcomeLine({ state: 'empty', reason: 'no_results', searches: 2 }, EN),
    lift.webOutcomeLine({ state: 'not_run', reason: 'model_did_not_search', searches: 0 }, EN),
    lift.webOutcomeLine({ state: 'not_run', reason: 'not_attached', searches: 0 }, EN),
    lift.webOutcomeLine(null, EN),
  ];
  assert.equal(new Set(said).size, said.length, 'each outcome is said differently: ' + JSON.stringify(said));
  assert.match(said[0], /timed out/); assert.match(said[2], /found no matching pages/);
  /* the old sentence said «based mainly on already-gathered headlines» whatever was cited */
  const none = lift.groundsLine([], EN);
  assert.doesNotMatch(none, /headline/i, 'an answer that cites no headline is not said to rest on headlines');
  assert.match(none, /own knowledge/);
  const mixed = lift.groundsLine([{ origin: 'client_source' }, { origin: 'client_source' }, { origin: 'app_data' }], EN);
  assert.match(mixed, /2 retrieved article/); assert.match(mixed, /1 IntMap data record/);
  assert.match(lift.groundsLine([{ origin: 'hosted_web' }], JP), /検索で見つかったWebページ 1 件/);
});
