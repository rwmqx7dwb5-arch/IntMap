// ============================================================================
//  IntMap — Edge Function security-logic tests (#R138). Pure Node (node:test),
//  no Deno runtime required (CI has none). Two kinds of assertion:
//    1. UNIT tests of the constant-time secret comparison used by refresh-news.
//    2. SOURCE regression guards: the security-critical Edge Functions are read
//       and asserted to still hold their invariants, so a future edit cannot
//       silently reintroduce the fail-OPEN refresh-news guard, a URL-query secret,
//       an unauthenticated ai-proxy, or an uncapped prompt/image input.
//  Run: node --test tests/security-logic.mjs   (also part of `npm test`).
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const refreshNews = read('supabase/functions/refresh-news/index.ts');
const aiProxy = read('supabase/functions/ai-proxy/index.ts');

// ---- Mirror of refresh-news timingSafeEqual (kept in lock-step; unit-tested here) ----
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

test('timingSafeEqual: equal strings compare true', () => {
  assert.equal(timingSafeEqual('s3cr3t-token', 's3cr3t-token'), true);
  assert.equal(timingSafeEqual('', ''), true);
});

test('timingSafeEqual: any difference compares false', () => {
  assert.equal(timingSafeEqual('s3cr3t-token', 's3cr3t-tokeX'), false); // last byte differs
  assert.equal(timingSafeEqual('Xs3cr3t-token', 's3cr3t-token'), false); // length differs
  assert.equal(timingSafeEqual('secret', ''), false);
  assert.equal(timingSafeEqual('secret', 'secret ') , false);            // trailing space
});

test('timingSafeEqual: the mirror matches the source (same algorithm shape)', () => {
  // The source must implement a constant-time compare (no early-return === on the secret).
  assert.match(refreshNews, /function timingSafeEqual/);
  assert.match(refreshNews, /diff \|=/);            // accumulates, no early break
  assert.doesNotMatch(refreshNews, /got !== secret/); // the old timing-unsafe compare is gone
});

test('refresh-news is FAIL-CLOSED: unset REFRESH_SECRET refuses every request (503)', () => {
  // With the secret unset the function must return 503 "not_configured" and never run.
  assert.match(refreshNews, /const secret = Deno\.env\.get\("REFRESH_SECRET"\) \|\| ""/);
  assert.match(refreshNews, /if \(!secret\)/);
  assert.match(refreshNews, /not_configured/);
  assert.match(refreshNews, /status: 503/);
});

test('refresh-news reads the secret ONLY from a header, never a URL query string', () => {
  assert.match(refreshNews, /req\.headers\.get\("x-refresh-secret"\)/);
  // The old query-string channel (leaks the secret into access logs) must be gone.
  assert.doesNotMatch(refreshNews, /searchParams\.get\(\s*["']secret["']\s*\)/);
});

test('refresh-news only runs on POST (GET/others rejected)', () => {
  assert.match(refreshNews, /req\.method !== "POST"/);
  assert.match(refreshNews, /method_not_allowed/);
});

test('ai-proxy REQUIRES a valid JWT (login) before doing any work', () => {
  assert.match(aiProxy, /auth\.getUser\(\)/);
  assert.match(aiProxy, /if \(!user\) return json\(\{ error: "auth"/);
});

test('ai-proxy enforces the per-user daily quota via the SECURITY DEFINER RPC', () => {
  assert.match(aiProxy, /increment_ai_usage/);
  assert.match(aiProxy, /error: "limit"/);
  assert.match(aiProxy, /}, 429\)/);           // over-quota → 429
});

test('ai-proxy caps prompt and image input (no unbounded request)', () => {
  assert.match(aiProxy, /MAX_PROMPT = \d/);
  assert.match(aiProxy, /MAX_IMAGES = \d/);
  assert.match(aiProxy, /\.slice\(0, MAX_PROMPT\)/);
  assert.match(aiProxy, /\.slice\(0, MAX_IMAGES\)/);
});

test('ai-proxy does not log the prompt / provider key / JWT', () => {
  // Telemetry logging must be metadata-only. Assert the prompt variable is never passed to console.*.
  const logCalls = [...aiProxy.matchAll(/console\.(?:error|log|warn|info)\(([^\n]*)/g)].map((m) => m[1]);
  for (const c of logCalls) {
    assert.doesNotMatch(c, /\bprompt\b/, `a console call references prompt: ${c}`);
    assert.doesNotMatch(c, /\bkey\b/, `a console call references key: ${c}`);
    assert.doesNotMatch(c, /authHeader|Authorization|jwt/i, `a console call references the JWT: ${c}`);
  }
});
