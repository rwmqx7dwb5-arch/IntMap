/* ============================================================================
 *  gemini-embed-pacing — supabase/functions/_shared/embedding-provider.js, a model that embeds one input per request
 * ----------------------------------------------------------------------------
 *  Measured on production 2026-11-25: seeding the capability catalogue sent 150 embedContent requests at once and
 *  Gemini answered 429 (upstream_rate_limit), so the catalogue was never stored. These checks run the real helper
 *  against a scripted provider: the burst is bounded, a 429 is waited out (the provider's Retry-After first) and
 *  counted, and a wait that would pass the deadline fails as the 429 it is.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof globalThis.Deno === 'undefined') globalThis.Deno = { env: { get: () => '' } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EP = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/embedding-provider.js')).href);
const MODEL = 'gemini-embedding-001';

function provider(opts) {
  let inFlight = 0, maxInFlight = 0, calls = 0, refusals = opts.refuse || 0;
  const door = async (url) => {
    if (url.includes('/models?')) {
      return new Response(JSON.stringify({ models: [{ name: 'models/' + MODEL, supportedGenerationMethods: ['embedContent', 'countTokens'] }] }), { status: 200 });
    }
    calls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    if (refusals > 0) { refusals--; return new Response('{"error":"quota"}', { status: 429, headers: opts.retryAfter ? { 'retry-after': String(opts.retryAfter) } : {} }); }
    return new Response(JSON.stringify({ embedding: { values: [3, 4, 0, 0] } }), { status: 200 });
  };
  return { door, stats: () => ({ calls, maxInFlight }) };
}

test('gemini-embed-pacing ① many inputs: never more than EMBED_PARALLEL in flight, and every vector comes back in order, unit length', async () => {
  const P = provider({});
  await EP.listGeminiEmbeddingModels('k', P.door);
  const inputs = Array.from({ length: 50 }, (_, i) => 'doc ' + i);
  const r = await EP.embedGemini('k', MODEL, inputs, P.door, { dim: 4, sleep: async () => {} });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.vectors.length, 50);
  assert.ok(P.stats().maxInFlight <= EP.EMBED_PARALLEL, 'burst bounded: ' + P.stats().maxInFlight);
  assert.ok(P.stats().maxInFlight > 1, 'still parallel');
  assert.deepEqual(r.vectors[0], [0.6, 0.8, 0, 0]);
});

test('gemini-embed-pacing ② a 429 is waited out — the provider\'s Retry-After first — and counted; the vectors still all arrive', async () => {
  const P = provider({ refuse: 3, retryAfter: 2 });
  await EP.listGeminiEmbeddingModels('k', P.door);
  const waits = [];
  const r = await EP.embedGemini('k', MODEL, ['a', 'b', 'c', 'd'], P.door, { sleep: async (ms) => { waits.push(ms); } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.vectors.length, 4);
  assert.equal(r.retries, 3);
  assert.deepEqual(waits, [2000, 2000, 2000], 'the named wait, not ours');
});

test('gemini-embed-pacing ③ a wait that would pass the deadline is not taken: the call fails as the 429 it is', async () => {
  const P = provider({ refuse: 100 });
  await EP.listGeminiEmbeddingModels('k', P.door);
  let t = 0;
  const r = await EP.embedGemini('k', MODEL, ['a'], P.door, { now: () => t, sleep: async (ms) => { t += ms; } });
  assert.equal(r.ok, false);
  assert.equal(r.status, 429);
  assert.ok(r.retries > 0 && t <= EP.EMBED_RETRY_DEADLINE_MS, 'waited within the deadline only: ' + t);
});
