/* ============================================================================
 *  atlas-output-fit — a budget Atlas raised (maxOutputHint) that the money fences cannot hold is FITTED to the
 *  remaining room and reserved once more, never refused while the task's own budget still fits (ai-proxy ask.ts,
 *  tasks/spec.ts fitOutputToRoom; .agents/rules/one-pass-or-a-reason.md §5).
 *
 *  ① a hint that fits is used as asked — one reservation, no fitting said
 *  ② a hint too big for the family's remaining room is fitted down to the largest budget the room affords and allowed
 *  ③ the same against the account's DAY room
 *  ④ when not even the task's own budget fits, the 409 turn_cost is answered as before, and no provider is asked
 *  ⑤ a call without a hint is never fitted: its refusal is the 409, after one reservation
 *  ⑥ fitOutputToRoom itself: the arithmetic of the reservation, capped at the ask, never below the floor
 *
 *  Runner: the function is evaluated in this process (Deno.serve captured, fetch stubbed — the shape of
 *  tests/delegation-journal-checks.test.mjs); the spend ledger is a stub that refuses exactly as reserve_ai_spend does.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fitOutputToRoom, maxOutputFor } from '../supabase/functions/ai-proxy/tasks/spec.ts';
import { TASKS } from '../supabase/functions/ai-proxy/tasks/index.ts';
import { priceOf, outputCeilingOf, OPENAI_DEFAULT_MODEL } from '../supabase/functions/_shared/ai-provider.js';
import { TURN_COST_CAP_USD } from '../supabase/functions/ai-proxy/config.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'stub' };
const USER = { id: '00000000-0000-4000-8000-000000000003', aud: 'authenticated', role: 'authenticated', created_at: '2020-01-01T00:00:00Z' };
const ANSWER = { model: OPENAI_DEFAULT_MODEL, status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"turn":"final","final_text":"ok"}', annotations: [] }] }],
  usage: { input_tokens: 50, output_tokens: 10 } };
const CAP = TURN_COST_CAP_USD * 1e6;
const BASE = maxOutputFor(TASKS.get('atlas_turn'));
const PRICE = priceOf(OPENAI_DEFAULT_MODEL);
const CEIL = outputCeilingOf(OPENAI_DEFAULT_MODEL);

/* the spend ledger: one family row and one day row, refusing as public.reserve_ai_spend does (family first, then the day) */
const L = { reserved: 0, spent: 0, dayReserved: 0, daySpent: 0, reserves: [], provider: [] };
const ledger = (o) => Object.assign(L, { reserved: 0, spent: 0, dayReserved: 0, daySpent: 0, reserves: [], provider: [] }, o || {});
const DB = {
  consume_ai_turn() { return [{ allowed: true, used: 1, charged: true, calls: 1, reason: '', gen: null }]; },
  reserve_ai_spend(a) {
    L.reserves.push(a);
    const row = (allowed, scope) => [{ allowed, reserved_micros: L.reserved, spent_micros: L.spent, scope, day_reserved_micros: L.dayReserved, day_spent_micros: L.daySpent }];
    if (L.reserved + L.spent + a.p_micros > a.p_cap_micros) return row(false, 'turn');
    if (a.p_day_cap_micros != null && L.dayReserved + L.daySpent + a.p_micros > a.p_day_cap_micros) return row(false, 'day');
    L.reserved += a.p_micros; L.dayReserved += a.p_micros;
    return row(true, '');
  },
  settle_ai_spend() { return true; }, settle_ai_turn() { return true; }, refund_ai_turn() { return 'refunded'; },
  record_ai_usage() { return null; }, record_usage_counts() { return null; }, log_ai_delegation() { return true; },
};
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
globalThis.Deno = { env: { get: (k) => ENV[k] || '' }, serve: (h) => { globalThis.__aiProxy = h; } };
console.error = () => {};
globalThis.fetch = async (u, init) => {
  const s = String(u && u.url ? u.url : u);
  let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
  if (new URL(s).hostname === 'api.openai.com') { L.provider.push(body); return json(ANSWER); }
  if (/\/auth\/v1\/user$/.test(s)) return json(USER);
  if (/\/rest\/v1\/profiles/.test(s)) return json([]);
  if (/\/rest\/v1\/rpc\/relay_take$/.test(s)) return json([{ allowed: true, remaining: 9 }]);
  const rpc = (/\/rest\/v1\/rpc\/([a-z_]+)$/.exec(s) || [])[1];
  if (rpc && DB[rpc]) return json(DB[rpc](body || {}));
  return json({ message: 'no route' }, 404);
};
await import(pathToFileURL(join(ROOT, 'supabase/functions/ai-proxy/index.ts')).href);
const serve = globalThis.__aiProxy;
const TURN = (hint) => ({ task: 'atlas_turn', protocol: 2, input: [{ type: 'message', role: 'user', content: 'hi' }], tools: [], ...(hint ? { maxOutputHint: hint } : {}) });
const post = async (body) => {
  const r = await serve(new Request('https://fn.test/', { method: 'POST', headers: { authorization: 'Bearer good', 'content-type': 'application/json', 'x-intmap-turn': 'root-fit' }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
/* the reservation of a budget is input + 2 × tokens × price; what the room affords is the largest such budget inside it */
const affords = (micros, tokens, room) => micros <= room && micros + 2 * PRICE.output > room && tokens >= BASE;

test('premise: the default model has a documented ceiling far above the task budget, so a hint can raise it', () => {
  assert.ok(CEIL > 20_000 && BASE < 20_000);
});

test('① a hint that fits is used as asked: one reservation, nothing fitted', async () => {
  ledger();
  const r = await post(TURN(20_000));
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.maxOutput, 20_000);
  assert.equal(r.body.meta.maxOutputFitted, undefined);
  assert.equal(L.reserves.length, 1);
  assert.ok(L.provider[0].max_output_tokens >= 20_000, 'the provider is asked for the raised budget');
});

test('② a hint too big for the family\'s remaining room is fitted down to what the room affords, and allowed', async () => {
  ledger({ spent: 1_500_000 });
  const r = await post(TURN(CEIL));
  assert.equal(r.status, 200, 'the request runs instead of stopping on a budget it would not have used');
  assert.equal(L.reserves.length, 2, 'one refusal, then ONE reservation of a different, smaller budget');
  const used = r.body.meta.maxOutput;
  assert.deepEqual(r.body.meta.maxOutputFitted, { asked: CEIL, used });
  assert.ok(used >= BASE && used < CEIL);
  const room = CAP - 1_500_000;
  assert.ok(affords(L.reserves[1].p_micros, used, room), `the fitted reservation ${L.reserves[1].p_micros} is the largest inside the room ${room}`);
  assert.ok(L.provider[0].max_output_tokens >= used && L.provider[0].max_output_tokens <= CEIL);
});

test('③ the same against the account\'s day room (scope day)', async () => {
  const dayCap = 10_000_000;   /* free: aiUsdPerDay 10 (_shared/plans.js) */
  ledger({ daySpent: dayCap - 1_000_000 });
  const r = await post(TURN(CEIL));
  assert.equal(r.status, 200);
  assert.equal(L.reserves.length, 2);
  assert.equal(L.reserves[0].p_day_cap_micros, dayCap);
  const used = r.body.meta.maxOutput;
  assert.deepEqual(r.body.meta.maxOutputFitted, { asked: CEIL, used });
  assert.ok(affords(L.reserves[1].p_micros, used, 1_000_000), 'fitted to the tighter room — the day\'s');
});

test('④ when not even the task\'s own budget fits, it is the 409 turn_cost as before, and no provider is asked', async () => {
  ledger({ spent: CAP - 10_000 });
  const r = await post(TURN(CEIL));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'turn_cost');
  assert.equal(L.reserves.length, 1, 'nothing below the task\'s budget is tried');
  assert.equal(L.provider.length, 0);
});

test('⑤ a call without a hint is never fitted: one reservation, then the 409', async () => {
  ledger({ spent: CAP - 10_000 });
  const r = await post(TURN(0));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'turn_cost');
  assert.equal(L.reserves.length, 1);
  ledger();
  const ok = await post(TURN(0));
  assert.equal(ok.body.meta.maxOutput, BASE, 'without a hint the task\'s own budget');
  assert.equal(ok.body.meta.maxOutputFitted, undefined);
});

test('⑥ fitOutputToRoom: the reservation\'s arithmetic, capped at the ask, never below the floor', () => {
  assert.equal(fitOutputToRoom({ asked: 100_000, floor: 2600, inputMicros: 1000, outputPrice: 10, roomMicros: 1_001_000 }), 50_000);
  assert.equal(fitOutputToRoom({ asked: 30_000, floor: 2600, inputMicros: 1000, outputPrice: 10, roomMicros: 1_001_000 }), 30_000, 'never more than asked');
  assert.equal(fitOutputToRoom({ asked: 100_000, floor: 2600, inputMicros: 1000, outputPrice: 10, roomMicros: 50_000 }), null, 'below the floor → null');
  assert.equal(fitOutputToRoom({ asked: 100_000, floor: 2600, inputMicros: 1000, outputPrice: 0, roomMicros: 1e9 }), null);
  assert.equal(fitOutputToRoom({ asked: 100_000, floor: 2600, inputMicros: 1000, outputPrice: 10, roomMicros: -5 }), null);
});
