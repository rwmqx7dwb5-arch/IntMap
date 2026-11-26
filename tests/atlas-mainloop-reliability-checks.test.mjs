/* ============================================================================
 *  atlas-mainloop-reliability — the main loop's one retry, the request order the cache can use, a document sent once
 * ----------------------------------------------------------------------------
 *  ① provider-call.ts transientRetry: a failure that was OBSERVED and is transient (5xx, no status, a per-minute 429) is retried,
 *     counted; a timeout, a quota, a 4xx, a safety block is not; the retries end; a retry that cannot fit the window is not made.
 *  ② js/atlas-agent.js composeInput puts the part that does not change first; transportSay names the cause of a transport stop.
 *  ③ ai-proxy: a provider block survives the turn input check, a cache marker follows the conversation only when a turn asks,
 *     a cache write is priced at 1.25x, a document is uploaded once with an expiry.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PC = await imp('supabase/functions/ai-proxy/provider-call.ts');
const TURN = await imp('supabase/functions/ai-proxy/turn.ts');
const USAGE = await imp('supabase/functions/_shared/ai-usage.js');
const PROV = await imp('supabase/functions/_shared/ai-provider.js');
const { ProviderError, transientRetry, isTransient } = PC;

const unavailable = (status, meta = {}) => new ProviderError('provider_unavailable', 'x', 503, true, status ? { providerStatus: status, ...meta } : meta);

test('① a 5xx, an unreachable host and a per-minute 429 are retried and counted; the third failure is thrown', async () => {
  const makers = [() => unavailable(503), () => unavailable(0), () => new ProviderError('provider_rate_limit', 'x', 503, true, { providerStatus: 429, retryAfter: '0s' })];
  for (const mk of makers) {
    let n = 0; const seen = [];
    const out = await transientRetry(async () => { n++; if (n < 2) throw mk(); return 'ok'; }, { retry: (w) => seen.push(w) });
    assert.equal(out, 'ok'); assert.equal(n, 2); assert.equal(seen.length, 1);
  }
  let n = 0;
  await assert.rejects(transientRetry(async () => { n++; throw new ProviderError('provider_rate_limit', 'x', 503, true, { providerStatus: 429, retryAfter: '0s' }); }, {}), (e) => e instanceof ProviderError);
  assert.equal(n, 2, 'a 429 is tried one more time, not two');
  n = 0;
  await assert.rejects(transientRetry(async () => { n++; throw unavailable(503); }, {}), (e) => e instanceof ProviderError);
  assert.equal(n, 3, '1 attempt + 2 retries, the policy the Gemini path always had');
});

test('① what is not transient is thrown at once', async () => {
  const cases = [unavailable(0, { timeout: true }), unavailable(0, { tooLarge: true }), unavailable(400), unavailable(503, { ceiling: 'project_day' }),
    new ProviderError('provider_quota', 'x', 502, false, { providerStatus: 429 }), new ProviderError('provider_blocked', 'x', 502, false, {}), new Error('plain')];
  for (const e of cases) {
    let n = 0;
    await assert.rejects(transientRetry(async () => { n++; throw e; }, {}));
    assert.equal(n, 1, JSON.stringify(e.meta || e.message));
    assert.equal(isTransient(e).transient, false);
  }
});

test('① a retry the request window cannot hold is not made', async () => {
  let n = 0;
  const meter = { startedAt: Date.now() - 119_500 };   // providerBudgetMs: 150 s - 30 s margin - 119.5 s used = 0.5 s left
  await assert.rejects(transientRetry(async () => { n++; throw unavailable(503); }, meter));
  assert.equal(n, 1);
});

test('① every provider call site of ask.ts goes through the one retry, and the bearer prefix is Bearer plus whitespace', () => {
  const ask = read('supabase/functions/ai-proxy/ask.ts');
  assert.ok(/transientRetry\(\(\) => callOpenAI/.test(ask) && /transientRetry\(\(\) => turnReq \? callAnthropicTurn/.test(ask) && /geminiRetry\(\(\) => callGeminiTurn/.test(ask));
  assert.ok(ask.includes('replace(/^Bearer\\s+/i'), 'the bearer prefix is `Bearer\\s+`');
  assert.ok(/return await transientRetry\(call, meter\)/.test(read('supabase/functions/ai-proxy/providers/gemini.ts')), 'Gemini has its own copy of the policy again');
});

test('① a 400 is read for the summary before the summary is given up for the isolate', () => {
  const o = read('supabase/functions/ai-proxy/providers/openai.ts');
  assert.ok(/summary && \/summar\/i\.test\(await r\.clone\(\)\.text\(\)/.test(o));
});

test('② the stable block is the first input item and the console sends it; the transport stop names its cause', () => {
  const src = read('js/atlas-agent.js');
  const i = src.indexOf('if (stableItem) input.push(stableItem);');
  const j = src.indexOf('kept.forEach(function (it) { input.push(it); });');
  assert.ok(i > 0 && j > i, 'the stable item is pushed before the history');
  assert.ok(/function transportSay\(out, L\)/.test(src) && /const API = \{ transportSay,/.test(src));
  const con = read('js/atlas-console.js');
  assert.ok(/stable:c0\.stable/.test(con) && !/_c0\.text\+=TOOLS\.liveEnum/.test(con), 'the layer names went back to the front of the request');
  assert.ok(/transportSay\(out,L\)/.test(con));
});

test('③ a provider block of the search survives the turn check; a malformed one is left out and said', () => {
  const blk = { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://example.org/', encrypted_content: 'abc' }] };
  const r = TURN.normalizeTurn({ protocol: 2, input: [{ type: 'message', role: 'user', content: 'hi' }, { type: 'provider_block', provider: 'anthropic', block: blk }, { type: 'provider_block', provider: 'anthropic', block: 'nope' }], tools: [] });
  assert.equal(r.items.filter((x) => x.type === 'provider_block').length, 1);
  assert.equal(r.trim.droppedProviderBlocks, 1);
});

test('③ the conversation gets a cache marker only when a turn asks, never on an empty block, never past four', () => {
  const body = { model: 'm', system: 'S', tools: [{ name: 'a' }], messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'r' }] }] };
  assert.equal(USAGE.withPromptCache(body).messages[1].content[0].cache_control, undefined);
  const turn = USAGE.withPromptCache(body, { messages: true });
  assert.ok(turn.messages[1].content[0].cache_control, 'the last block of the conversation is the breakpoint');
  assert.equal(body.messages[1].content[0].cache_control, undefined, 'the caller body was edited');
  const empty = USAGE.withPromptCache({ ...body, messages: [{ role: 'user', content: [{ type: 'text', text: ' ' }] }] }, { messages: true });
  assert.equal(empty.messages[0].content[0].cache_control, undefined);
  const eph = { type: 'ephemeral' };
  const full = USAGE.withPromptCache({ ...body, tools: [{ name: 'a', cache_control: eph }, { name: 'b', cache_control: eph }, { name: 'c', cache_control: eph }, { name: 'd', cache_control: eph }] }, { messages: true });
  assert.equal(full.messages[1].content[0].cache_control, undefined, 'a fifth breakpoint');
});

test('③ a cache write is priced at 1.25x the input price (Anthropic, 5-minute lifetime); no other provider reports one', () => {
  const model = Object.keys(PROV.MODEL_PRICE_USD_PER_MTOK).find((m) => /claude/i.test(m)) || Object.keys(PROV.MODEL_PRICE_USD_PER_MTOK)[0];
  const p = PROV.priceOf(model);
  const w = { input: 0, cached_read: 0, cache_write: 1_000_000, output: 0 };
  assert.equal(PROV.costMicros(model, w, 'anthropic'), Math.ceil(1_000_000 * 1.25 * p.input));
  assert.equal(PROV.costMicros(model, w, 'openai'), 0);
});

test('③ the Anthropic turn keeps the search blocks, continues pause_turn and sets no search cap of its own', () => {
  const src = read('supabase/functions/ai-proxy/providers/anthropic.ts');
  assert.ok(!/max_uses\s*:/.test(src), 'a fixed max_uses is back');
  assert.ok(/pause_turn/.test(src) && /provider_block/.test(src) && /withPromptCache\(body, \{ messages: true \}\)/.test(src));
});

test('③ a document is uploaded once with a one-hour expiry, signed per account, and the OpenAI turn names the file', () => {
  const d = read('supabase/functions/ai-proxy/doc-refs.ts');
  assert.ok(d.includes('expires_after[seconds]", "3600"') && d.includes('purpose", "user_data"') && /FILE_ID\.test\(id\)/.test(d) && /hmacHex\(account, id\)/.test(d));
  const o = read('supabase/functions/ai-proxy/providers/openai.ts');
  assert.ok(/file_id: dp\.fileId/.test(o) && /await uploadDocs\(key, docs, meter\)/.test(o));
  const c = read('js/atlas-console.js');
  assert.ok(/docs:_atts\.docRefs\?undefined:_atts\.docs,docRefs:_atts\.docRefs/.test(c));
});
