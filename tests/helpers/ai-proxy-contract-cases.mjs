/* ============================================================================
 *  The requests tests/atlas-core-split-checks.test.mjs ① sends to ai-proxy, and how one build of
 *  the function is run on them (tests/helpers/ai-proxy-contract-run.mjs, one child process a case).
 *  photograph(ref) runs a git ref's ai-proxy/index.ts — the function before the split was ONE file —
 *  from a temporary directory; scripts/ai-proxy-photograph.mjs writes what it returns to FIXTURE.
 * ==========================================================================*/
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURE = join(ROOT, 'tests', 'fixtures', 'atlas-core-split-before.json');
const RUNNER = join(ROOT, 'tests', 'helpers', 'ai-proxy-contract-run.mjs');

/* ── the requests ─────────────────────────────────────────────────────────────────────────────── */
const SB = 'https://sb.test';
const BASE_ENV = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
const OA_ENV = { ...BASE_ENV, AI_PROVIDER: 'openai', AI_MODEL: 'gpt-5.6-terra', OPENAI_API_KEY: 'sk-oa' };
const USER = { id: 'u-1', email: 'reader@example.test', aud: 'authenticated', role: 'authenticated' };
const H = (extra = {}) => ({ Authorization: 'Bearer jwt', 'content-type': 'application/json', 'x-intmap-turn': 'turn-0001', ...extra });
const ask = (body, more = {}) => ({ method: 'POST', headers: H(more.headers), body, user: USER, ...more, headers: H(more.headers) });

const oaText = (text, extra = {}) => ({ status: 200, json: {
  model: 'gpt-5.6-terra', status: 'completed',
  output: [{ type: 'web_search_call', id: 'ws1' }, { type: 'message', content: [{ type: 'output_text', text,
    annotations: [{ type: 'url_citation', url: 'https://a.test/x?utm=1', title: 'A', start_index: 0, end_index: 3 }] }] }],
  usage: { input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 20 } }, ...extra } });
const oaTurn = { status: 200, json: { model: 'gpt-5.6-terra', status: 'completed', output: [
  { type: 'reasoning', id: 'rs_1', encrypted_content: 'ENC' },
  { type: 'function_call', call_id: 'call_9', name: 'find_capability', arguments: '{"q":"layers"}' },
  { type: 'message', content: [{ type: 'output_text', text: 'Looking.' }] },
], usage: { input_tokens: 900, output_tokens: 40 } } };
const ANSWER = JSON.stringify({ directAnswer: { text: 'Yes.', claimIds: [] }, sections: [], claims: [] });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PDF = Buffer.from('%PDF-1.4 tiny').toString('base64');
const TOOLS = [
  { name: 'find_capability', description: 'Find a capability.', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
  { name: 'run_capability', description: 'Run one.', parameters: { type: 'object', properties: { id: { type: 'string' }, lat: { type: 'number' } }, anyOf: [{ required: ['id'] }, { required: ['lat'] }] } },
  { name: 'set_layer', description: 'Promoted.', parameters: { type: 'object', properties: {} }, promoted: true },
];
const TURN = (extra = {}) => ({ task: 'atlas_turn', protocol: 2, system: 'SYS', tools: TOOLS, input: [
  { type: 'message', role: 'user', content: 'earlier' },
  { type: 'message', role: 'assistant', content: 'ok' },
  { type: 'attachments', channels: ['images'] },
  { type: 'message', role: 'user', content: 'show the layers' },
  { type: 'reasoning', id: 'rs_0', encrypted_content: 'E0' },
  { type: 'function_call', call_id: 'call_1', name: 'find_capability', arguments: '{"q":"x"}' },
  { type: 'function_call_output', call_id: 'call_1', output: 'result' },
  { type: 'bogus' },
], ...extra });
const OA_SSE = [
  ['response.created', { type: 'response.created', response: { id: 'r1' } }],
  ['response.reasoning_summary_text.delta', { type: 'response.reasoning_summary_text.delta', delta: '**Plan** thinking' }],
  ['response.output_text.delta', { type: 'response.output_text.delta', delta: 'Hel' }],
  ['response.output_text.delta', { type: 'response.output_text.delta', delta: 'lo' }],
  ['response.completed', { type: 'response.completed', response: { model: 'gpt-5.6-terra', status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }], usage: { input_tokens: 5, output_tokens: 2 } } }],
];

export const CASES = {
  'refusals before the provider (openai)': { env: OA_ENV, requests: [
    { method: 'OPTIONS', headers: {} },
    { method: 'PUT', headers: H(), body: '{}', user: USER },
    { method: 'POST', headers: H(), body: { task: 'free_text', prompt: 'hi' }, user: null },
    ask({ task: 'nope', prompt: 'hi' }),
    ask({ task: '__proto__', prompt: 'hi' }),
    ask({ task: 'free_text', prompt: 'hi' }, { headers: { 'x-intmap-lane': 'gloss' } }),
    ask({ task: 'gloss', prompt: 'hi' }),
    ask({ task: 'free_text', prompt: '' }),
    ask({ task: 'gloss', prompt: 'term', images: [PNG] }, { headers: { 'x-intmap-lane': 'gloss' } }),
    ask({ task: 'atlas_turn', protocol: 2, input: [{ type: 'attachments', channels: ['docs'] }] }),
    ask({ task: 'atlas_turn', protocol: 2, input: Array.from({ length: 6 }, (_, i) => ({ type: 'function_call_output', call_id: 'c' + i, output: 'x'.repeat(96_000) })) }),
    ask({ task: 'free_text', prompt: 'hi' }, { rpc: { consume_ai_turn: [{ allowed: false, reason: 'limit', used: 10, calls: 1 }] } }),
    ask({ task: 'free_text', prompt: 'hi' }, { rpc: { consume_ai_turn: [{ allowed: false, reason: 'turn_calls', used: 3, calls: 13 }] } }),
    ask({ task: 'free_text', prompt: 'hi' }, { rpc: { consume_ai_turn: { error: 'boom' } } }),
    ask({ task: 'free_text', prompt: 'hi' }, { rpc: { consume_ai_gloss: [{ allowed: false, used: 60 }] }, headers: { 'x-intmap-lane': 'gloss' } }),
    ask({ op: 'models', task: 'free_text', prompt: 'hi' }),
    ask({ task: 'atlas_grade', prompt: 'grade' }),
    ask('{not json'),
  ] },
  'answers (openai)': { env: OA_ENV, requests: [
    ask({ task: 'free_text', prompt: 'hello', system: 'S', webMode: 'auto' }, { provider: [oaText('hi there')] }),
    ask({ task: 'brief', prompt: 'latest', webMode: 'required' }, { provider: [oaText('news')] }),
    ask({ task: 'map_report', prompt: 'report', requestedCount: 20 }, { provider: [oaText('{"title":"t","overview":"o","items":[]}')] }),
    ask({ task: 'analysis_structured', prompt: 'why' }, { provider: [oaText('not json')] }),
    ask({ task: 'analysis_structured', prompt: 'why', effortHint: 'high' }, { provider: [oaText(ANSWER)] }),
    ask({ task: 'json_extract', prompt: 'x', schema: { type: 'OBJECT', properties: { a: { type: 'STRING', enum: ['p', 'q'] }, b: { type: 'NUMBER' } }, required: ['b'] } }, { provider: [oaText('{"a":null,"b":1}')] }),
    ask({ task: 'research_map', prompt: 'x', schema: { type: 'OBJECT', properties: { __proto__: { type: 'STRING' } } } }, { provider: [oaText('{}')] }),
    ask({ task: 'vision_read', prompt: 'read', effortHint: 'high', imageDetail: 'high', images: [PNG, 'data:image/svg+xml;base64,AAAA', PNG] }, { provider: [oaText('{"answer":"2"}')] }),
    ask({ task: 'analysis', prompt: 'with files', files: [{ name: 'a.csv', text: 'a,b\n1,2' }, { name: 'big.txt', text: 'y'.repeat(130_000), truncated: false }, { text: '' }],
      docs: [{ name: 'p.pdf', mime: 'application/pdf', b64: PDF }, { name: 'x.doc', mime: 'application/msword', b64: PDF }] }, { provider: [oaText('read them')] }),
    ask({ task: 'gloss', prompt: 'what is X' }, { headers: { 'x-intmap-lane': 'gloss' }, provider: [oaText('{"term":"X","kind":"n","sense":"s","inContext":"c"}')] }),
    ask({ task: 'free_text', prompt: 'p', provider: 'anthropic', model: 'claude-x' }, { provider: [oaText('ignored pick')] }),
    ask({ ...TURN(), images: [PNG] }, { provider: [oaTurn] }),
    ask(TURN({ toolChoice: 'none' }), { provider: [oaText('done.')] }),
    ask({ task: 'atlas_plan', prompt: 'plan' }, { provider: [oaText('{"actions":[]}')] }),
  ] },
  'failures and ladders (openai)': { env: OA_ENV, requests: [
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 429, json: { error: { message: 'Rate limit reached for requests per minute' } } }] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 429, json: { error: { code: 'insufficient_quota' } } }] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 500, json: { error: 'x' } }] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 404, json: { error: { code: 'model_not_found' } } }, oaText('fell back')] }),
    ask({ task: 'json_extract', prompt: 'p', schema: { type: 'OBJECT', properties: { a: { type: 'STRING' } } } }, { provider: [{ status: 400, json: { error: 'schema' } }, oaText('{"a":"1"}')] }),
    ask({ task: 'free_text', prompt: 'p', webMode: 'required' }, { provider: [{ status: 400, json: {} }, { status: 400, json: {} }, { status: 400, json: {} }, oaText('no tools')] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 200, json: { model: 'm', status: 'incomplete', output: [] } }, oaText('second')] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 200, json: { model: 'm', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] } }] }),
    ask({ task: 'free_text', prompt: 'p' }, { rpc: { relay_take: [{ allowed: false, remaining: 0 }] }, provider: [oaText('never')] }),
    ask({ task: 'free_text', prompt: 'p' }, { ageDays: 1, rpc: { relay_take: [{ allowed: false, remaining: 0 }] }, provider: [oaText('never')] }),
  ] },
  'stream and replay (openai)': { env: OA_ENV, requests: [
    ask({ ...TURN(), stream: true, replayKey: 'replay-0001' }, { provider: [{ sse: OA_SSE }] }),
    ask({ ...TURN(), stream: true }, { provider: [{ status: 400, json: {} }, { sse: OA_SSE }] }),
    ask(TURN(), { headers: { 'x-intmap-replay': 'replay-0002' },
      rpc: { peek_ai_answer: [{ state: 'done', attempts: 1, status: 200, body: { text: 'held', charged: true, meta: { streamed: true, task: 'atlas_turn' } } }] } }),
    ask({ ...TURN(), replayKey: 'replay-0003' }, { rpc: { claim_ai_answer: [{ outcome: 'done', attempts: 2, status: 200, body: { text: 'stored', meta: {} } }] } }),
    ask({ ...TURN(), replayKey: 'replay-0004' }, { headers: { 'x-intmap-replay': 'replay-0004' },
      rpc: { peek_ai_answer: [], claim_ai_answer: [{ outcome: 'claimed', attempts: 2, status: 0, body: null, after_state: 'failed' }] }, provider: [oaTurn] }),
    ask({ ...TURN(), replayKey: 'replay-0005' }, { rpc: { claim_ai_answer: { error: 'down' } }, provider: [oaTurn] }),
    ask({ ...TURN(), replayKey: 'bad key!' }, { provider: [oaTurn] }),
    ask({ ...TURN(), stream: true }, { provider: [{ sse: [['error', { type: 'error', error: { message: 'overloaded' } }]] }] }),
  ] },
  'the developer account': { env: { ...OA_ENV, DEV_USER_IDS: 'u-1', GEMINI_API_KEY: 'g-key', ANTHROPIC_API_KEY: 'a-key' }, requests: [
    ask({ op: 'models' }, { provider: [
      { status: 200, json: { data: [{ id: 'gpt-5.6-terra' }, { id: 'gpt-6-astra' }, { id: 'bad id!' }] } },
      { status: 200, json: { models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] } },
      { status: 500, json: {} },
    ] }),
    ask({ task: 'free_text', prompt: 'p', model: 'gpt-5.6-sol' }, { provider: [{ status: 403, json: { error: 'does not have access to model' } }] }),
    ask({ task: 'free_text', prompt: 'p', provider: 'anthropic' }, { provider: [{ status: 200, json: { model: 'claude-x', content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', usage: { input_tokens: 3, output_tokens: 1 } } }] }),
    ask({ task: 'atlas_grade', prompt: 'grade', system: 'rubric', provider: 'anthropic' }, { provider: [{ status: 200, json: { modelVersion: 'gemini-3.5-flash', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"scores":{}}' }] } }] } }] }),
  ] },
  'anthropic': { env: { ...BASE_ENV, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a-key' }, requests: [
    ask({ task: 'free_text', prompt: 'p', system: 'S', webMode: 'auto', images: [PNG], files: [{ name: 'f', text: 't' }], docs: [{ name: 'd.pdf', mime: 'application/pdf', b64: PDF }] }, { provider: [{ status: 200, json: {
      model: 'claude-x', stop_reason: 'end_turn', usage: { input_tokens: 9, output_tokens: 3, server_tool_use: { web_search_requests: 2 } },
      content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'text', text: 'cited', citations: [{ type: 'web_search_result_location', url: 'https://b.test/p#h', title: 'B' }, { type: 'web_search_result_location', url: 'https://b.test/p', title: 'B' }] }] } }] }),
    ask({ ...TURN(), webMode: 'auto' }, { provider: [{ status: 200, json: { model: 'claude-x', stop_reason: 'tool_use', usage: { input_tokens: 9, output_tokens: 3 },
      content: [{ type: 'text', text: 'calling' }, { type: 'tool_use', id: 'tu_1', name: 'find_capability', input: { q: 'z' } }] } }] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 200, json: { model: 'claude-x', content: [], stop_reason: 'end_turn' } }] }),
    ask({ task: 'atlas_grade', prompt: 'grade' }),
  ] },
  'gemini': { env: { ...BASE_ENV, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g-key', GEMINI_SEARCH_ENABLED: 'true' }, requests: [
    ask({ task: 'map_report', prompt: 'p', webMode: 'off', requestedCount: 3 }, { provider: [{ status: 200, json: { modelVersion: 'g', candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'hmm' }, { text: '{"items":[]}' }] } }] } }] }),
    ask({ task: 'free_text', prompt: 'p', webMode: 'auto' }, { provider: [{ status: 200, json: { candidates: [{ finishReason: 'MALFORMED_FUNCTION_CALL' }] } }, { status: 200, json: { modelVersion: 'g', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'plain' }] } }] } }] }),
    ask({ task: 'json_extract', prompt: 'p', schema: { type: 'OBJECT', properties: { a: { type: 'STRING' } } } }, { provider: [{ status: 400, json: { error: 'schema' } }, { status: 200, json: { modelVersion: 'g', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] } }] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 503, json: { error: 'overloaded' } }, { status: 200, json: { modelVersion: 'g', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'after retry' }] } }] } }] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 429, json: { error: { message: 'quota', details: [{ quotaId: 'GenerateRequestsPerDayPerProject' }] } } }] }),
    ask({ task: 'free_text', prompt: 'p' }, { provider: [{ status: 200, json: { promptFeedback: { blockReason: 'SAFETY' } } }] }),
    ask(TURN(), { provider: [{ status: 200, json: { modelVersion: 'g', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'turn text' }, { functionCall: { name: 'find_capability', args: { q: 'y' } }, thoughtSignature: 'sig' }] } }] } }] }),
  ] },
  'no provider key':{ env: { ...BASE_ENV, AI_PROVIDER: 'openai' }, requests: [
    ask({ task: 'free_text', prompt: 'p' }),
  ] },
  'the function has no Supabase URL':{ env: { AI_PROVIDER: 'openai' }, requests: [
    ask({ task: 'free_text', prompt: 'p' }),
  ] },
};

/* ── running one build ───────────────────────────────────────────────────────────────────────── */
function runCase(entryUrl, c) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--no-warnings', RUNNER], {
      env: { ...process.env, AIPC_CFG: JSON.stringify({ entry: entryUrl, env: c.env, requests: c.requests }) },
      maxBuffer: 64 * 1024 * 1024, timeout: 120_000,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error('ai-proxy contract run failed: ' + (stderr || err.message).slice(0, 2000)));
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('unreadable run output: ' + stdout.slice(0, 500))); }
    });
  });
}
export const runAll = async (entryUrl) => Object.fromEntries(await Promise.all(Object.entries(CASES).map(async ([k, c]) => [k, await runCase(entryUrl, c)])));

/* The photograph: a ref's ai-proxy/index.ts, run from a temporary directory with its relative imports
   pointed at this checkout's supabase/functions/ (the shared modules it was written against) and the
   one bare import at the package this checkout resolves. */
export async function photograph(ref) {
  const src = execFileSync('git', ['show', ref + ':supabase/functions/ai-proxy/index.ts'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const fnDir = pathToFileURL(join(ROOT, 'supabase', 'functions', 'ai-proxy') + '/').href;
  const supa = import.meta.resolve('@supabase/supabase-js');
  const pointed = src
    .replace(/from "(\.{1,2}\/[^"]+)"/g, (_, p) => 'from "' + new URL(p, fnDir).href + '"')
    .replace(/from "@supabase\/supabase-js"/g, 'from "' + supa + '"');
  if (/from "\.{1,2}\//.test(pointed)) throw new Error('a relative import was left unpointed');
  const dir = mkdtempSync(join(tmpdir(), 'atlas-core-split-'));
  try {
    const entry = join(dir, 'index.ts');
    writeFileSync(entry, pointed);
    const sha = execFileSync('git', ['rev-parse', ref], { cwd: ROOT, encoding: 'utf8' }).trim();
    return { source: sha + ':supabase/functions/ai-proxy/index.ts', cases: await runAll(pathToFileURL(entry).href) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
