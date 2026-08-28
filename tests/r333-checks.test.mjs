/* ============================================================================
 *  R333 — the front end and the Edge Functions are deployed by different means,
 *          and nothing compared what each side actually got
 * ----------------------------------------------------------------------------
 *  js/ reaches production by pushing to main: deploy.yml builds it and publishes to Pages.
 *  An Edge Function reaches production only when a human runs `supabase functions deploy`.
 *  One commit, two delivery paths, no gate between them.
 *
 *  #R318 shipped `x-intmap-turn` on BOTH sides — so that the planner call, the bounded repair
 *  calls and the image self-check of one question would cost one use instead of three. The front
 *  end arrived. ai-proxy did not. Production kept answering preflights with the pre-#R318 list:
 *
 *    access-control-allow-headers: authorization, x-client-info, apikey, content-type
 *
 *  A custom request header absent from that list fails the browser's PREFLIGHT, so the POST is
 *  never sent. fetch() rejects — it does not reject on 4xx/5xx, only on a network/CORS refusal —
 *  and the client sees a bare "Failed to fetch" with no status to explain it. Every Atlas question
 *  failed that way, measured in production: the same probe from the same page origin returned
 *  HTTP 401 with `x-intmap-turn` once the function was deployed, and still returns "Failed to
 *  fetch" for a header nobody allows.
 *
 *  ⚠ WHY NO EXISTING CHECK COULD HAVE CAUGHT IT. The repository was self-consistent the entire
 *  time Atlas was down: js/ai-core.js sent the header and supabase/functions/ai-proxy/index.ts
 *  allowed it. Comparing the repo against itself reproduces the green. Only production disagreed,
 *  so the assertion that catches THIS lives in tests/prod-smoke.spec.js, against the live URL.
 *
 *  What lives HERE is everything decidable without the network, plus the guarantee that the
 *  production-side assertion still exists — a check that deleted itself would be silent in
 *  exactly the way this round is about.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import {
  repoCorsContract, repoFunctionNames, frontendCustomHeaders,
  declaredAllowHeaders, corsForAllowHeaders, sharedCorsBase, parseAllowHeaders,
} from './helpers/fn-cors.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('1. every shipped function has a CORS contract this check can actually read', () => {
  const contract = repoCorsContract(ROOT);
  const unknown = [...contract].filter(([, v]) => v.via === 'unknown').map(([n]) => n);
  /* ⚠ (#R320) A list that quietly drops what it could not parse reads as a complete list. The
     first draft of this helper read only the literal tables and found FOUR of eight functions —
     the other four build theirs through _shared/relay-guard.js's corsFor(). Had it shipped that
     way, half the fleet would have been "covered" by a check that never looked at it. */
  assert.deepEqual(unknown, [], 'no function may be silently skipped');
  assert.equal(contract.size, repoFunctionNames(ROOT).length, 'one entry per shipped function');
  assert.ok(contract.size >= 8, `expected the documented 8+ functions, saw ${contract.size}`);
});

test('2. ai-proxy still allows x-intmap-turn — the header whose absence took Atlas down', () => {
  const { headers } = repoCorsContract(ROOT).get('ai-proxy');
  assert.ok(headers.has('x-intmap-turn'),
    'removing it from the source is how the outage starts again, one deploy later');
  for (const base of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
    assert.ok(headers.has(base), `${base} is still required for an authenticated POST`);
  }
});

test('3. every custom header the front end sends is allowed by some shipped function', () => {
  const front = frontendCustomHeaders(ROOT);
  assert.ok(front.size >= 1, 'the front end sets at least one x-intmap-* request header');
  assert.ok(front.has('x-intmap-turn'), 'including the one #R318 introduced');

  const allowed = new Set();
  for (const [, v] of repoCorsContract(ROOT)) for (const h of v.headers) allowed.add(h);
  const orphans = [...front].filter(([h]) => !allowed.has(h))
    .map(([h, files]) => `${h} (sent by ${files.join(', ')})`);
  /* This is the HALF of the failure that is decidable offline: a header added to js/ and forgotten
     on the server. The other half — declared in both and deployed to neither — needs production,
     and is asserted in prod-smoke. Neither test alone covers the round. */
  assert.deepEqual(orphans, [], 'a header no function allows can never survive a preflight');
});

test('4. the ambiguity guard refuses a file that declares the table twice', () => {
  /* ⚠ (#R323) A regex over a whole file cannot say WHICH table it matched. Picking the first hit
     silently is how a gate ends up describing a table nobody ships. */
  assert.throws(
    () => declaredAllowHeaders('"Access-Control-Allow-Headers": "a"\n"Access-Control-Allow-Headers": "b"', 'two'),
    /ambiguous/, 'two literal tables must refuse, not guess');
  assert.throws(
    () => corsForAllowHeaders('corsFor()\ncorsFor("range")', new Set(), 'two'),
    /ambiguous/, 'two corsFor() calls must refuse too');
  assert.equal(declaredAllowHeaders('nothing at all'), null, 'and no table is null, not a throw');
});

test('5. _shared is a library, not a function — it is never counted as one', () => {
  const names = repoFunctionNames(ROOT);
  assert.ok(!names.some((n) => n.startsWith('_')), '_shared must not appear as a function');
  assert.ok(existsSync(new URL('../supabase/functions/_shared/relay-guard.js', import.meta.url)),
    'and it does exist — the exclusion is deliberate, not a missing directory');
  /* AGENTS.md §5 names this trap by hand: `[functions._shared]` in config.toml is the mistake. */
  const cfg = readLF(new URL('../supabase/config.toml', import.meta.url));
  assert.ok(!/\[functions\._shared\]/.test(cfg), '_shared must not be declared in config.toml');
});

test('6. the contract comes from index.ts, not the undeployed gemini backup beside it', () => {
  const backup = new URL('../supabase/functions/ai-proxy/index.gemini-backup.ts', import.meta.url);
  if (!existsSync(backup)) return;                 // it may be deleted one day; that is fine
  const ghost = declaredAllowHeaders(readLF(backup), 'index.gemini-backup.ts');
  assert.ok(ghost && !ghost.has('x-intmap-turn'), 'the backup predates #R318 (guard assumption)');
  const live = repoCorsContract(ROOT).get('ai-proxy').headers;
  /* Reading the directory instead of index.ts would compare production against a file that is
     never deployed — and would have called the outage healthy. */
  assert.ok(live.has('x-intmap-turn'), 'the live table wins over the ghost beside it');
});

test('7. corsFor() is resolved through _shared, extra header and all', () => {
  const base = sharedCorsBase(ROOT);
  assert.ok(base && base.has('content-type'), '_shared/relay-guard.js still defines the base set');
  const contract = repoCorsContract(ROOT);
  const sv = contract.get('sv-cov');
  assert.equal(sv.via, 'corsFor', 'sv-cov builds its table through corsFor');
  assert.ok(sv.headers.has('range'), 'corsFor("range") contributes the extra header');
  for (const h of base) assert.ok(sv.headers.has(h), `and still carries the base header ${h}`);
  const plain = contract.get('alerts-relay');
  assert.equal(plain.via, 'corsFor');
  assert.ok(!plain.headers.has('range'), 'corsFor() without an argument adds nothing');
});

test('8. the production-side assertion still exists — the half that needs the network', () => {
  /* ⚠ (#R317) A check that stops existing is indistinguishable from a check that passes. The
     offline tests above cannot see a deploy that never happened; only prod-smoke can. */
  const spec = readLF(new URL('../tests/prod-smoke.spec.js', import.meta.url));
  assert.match(spec, /#R333/, 'prod-smoke still carries the deployed-contract test');
  assert.match(spec, /repoCorsContract/, 'and still reads the contract out of this repository');
  assert.match(spec, /method:\s*'OPTIONS'/, 'and still asks production with a real preflight');
  const helper = readLF(new URL('./helpers/fn-cors.js', import.meta.url));
  assert.match(helper, /export function repoCorsContract/, 'the shared helper is still shared');
});

test('9. parseAllowHeaders normalises the way a browser compares header names', () => {
  const s = parseAllowHeaders('Authorization,  X-Intmap-Turn ,content-type,');
  assert.deepEqual([...s].sort(), ['authorization', 'content-type', 'x-intmap-turn'],
    'case-insensitive, trimmed, and empty entries dropped');
  assert.equal(parseAllowHeaders(undefined).size, 0, 'a missing header is an empty set, not a crash');
});
