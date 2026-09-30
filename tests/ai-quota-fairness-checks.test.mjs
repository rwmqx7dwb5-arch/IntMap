/* ============================================================================
 *  ai-quota-fairness — a batch of new accounts cannot spend everyone's AI day
 * ----------------------------------------------------------------------------
 *  THE DEFECT THIS FILE STATES (so that the next variant of it fails here too):
 *
 *  ai-proxy's project-wide ceiling (GLOBAL_PER_DAY, `ai-proxy:global:day`) was ONE bucket that every
 *  account drained, and each account was bounded only by its plan (at most 180 requests a day). So
 *  about 17 accounts could empty it, and an empty bucket stops EVERY reader's AI — the reader who has
 *  used IntMap for months as much as the account made five minutes ago. Accounts cost one confirmed
 *  e-mail address each.
 *
 *  ⇒ The rule, stated as a fact about the function and not about one code path:
 *     ① an account's cohort is its age (auth.users.created_at), and «established» needs the date;
 *     ② a share takes from its own bucket BEFORE the whole, so a refused share spends nothing of the
 *       reserve, and the reserve is whole − share whatever the environment says;
 *     ③ ai-proxy, RUN: for every provider and both request shapes (a plain task and an Atlas
 *       protocol-2 turn) and the gloss lane, a newcomer whose share is spent sends NOTHING to the
 *       provider and never touches the project bucket, and is refunded; an established account in
 *       the same moment is answered from the project bucket alone.
 *     ④ nothing anyone had is lowered: the project ceiling, the plans and TURN_MAX_CALLS are the
 *       numbers they were, and the share is sized above the busiest newcomer day ever recorded.
 *
 *  Runner: the Edge Function is evaluated in a child process with Deno.serve captured and fetch
 *  stubbed (the shape of tests/edge-spend-and-models-checks.test.mjs), and the limiter's answer is
 *  chosen PER BUCKET, which is what this file is about.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'supabase/functions');
const SUPA = 'https://sb.test';
const P = await import(pathToFileURL(join(FN, '_shared/ai-provider.js')).href);
const L = await import(pathToFileURL(join(FN, '_shared/ai-ledger.js')).href);
const DAY = 86400 * 1000;

/* ══ ① the cohort ═════════════════════════════════════════════════════════════════════════════ */
test('ai-quota-fairness ① the cohort is the account\'s age, and «established» needs the date', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(L.cohortOf(ago(0), now), L.NEWCOMER);
  assert.equal(L.cohortOf(ago(L.NEWCOMER_AGE_DAYS * DAY - 1000), now), L.NEWCOMER, 'a second short of the age is still new');
  assert.equal(L.cohortOf(ago(L.NEWCOMER_AGE_DAYS * DAY), now), L.ESTABLISHED);
  assert.equal(L.cohortOf(ago(400 * DAY), now), L.ESTABLISHED);
  /* the claim needs its evidence: no date, a garbled date or a date in the future is not an old account */
  for (const bad of [undefined, null, '', 'yesterday', new Date(now + DAY).toISOString()]) {
    assert.equal(L.cohortOf(bad, now), L.NEWCOMER, 'created_at ' + JSON.stringify(bad) + ' was read as established');
  }
  assert.ok(Number.isInteger(L.NEWCOMER_AGE_DAYS) && L.NEWCOMER_AGE_DAYS >= 1);
});

/* ══ ② the share, evaluated against the limiter ═══════════════════════════════════════════════ */
/* fetch stubbed for relay_take only; `answer(scope)` → a row, or null for «the database is silent» */
async function withLimiter(answer, fn) {
  const saved = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u, init) => {
    const body = JSON.parse(init.body);
    asked.push(body.p_scope + ':' + body.p_capacity + ':' + body.p_cost);
    const a = answer(body.p_scope);
    return a === null ? new Response('', { status: 503 }) : new Response(JSON.stringify([a]), { status: 200 });
  };
  try { return { result: await fn(), asked }; } finally { globalThis.fetch = saved; }
}
const ENV = (extra = {}) => (k) => ({ SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: 'svc', ...extra })[k] || '';

test('ai-quota-fairness ② a share is taken before the whole, and a refused share spends nothing of the reserve', async () => {
  const whole = P.spendCeiling({ fn: 'unit-fn', perDay: 90, env: ENV() });
  const share = P.shareCeiling({ fn: 'unit-fn', share: 'newcomer', of: whole, perDay: 30, env: ENV() });
  assert.equal(share.scope, 'unit-fn:newcomer:day');
  assert.equal(share.perDay, 30);
  assert.equal(share.reserved, 60, 'what the share cannot reach is whole − share');

  /* both say yes → both asked, share first, and the receipt is the whole's (the door accepts it) */
  let r = await withLimiter(() => ({ allowed: true, remaining: 5 }), () => share.take(2));
  assert.deepEqual(r.asked, ['unit-fn:newcomer:day:30:2', 'unit-fn:global:day:90:2']);
  assert.equal(r.result.ok, true);

  /* the share is spent → the whole is never asked */
  r = await withLimiter((s) => ({ allowed: s !== 'unit-fn:newcomer:day', remaining: 0 }), () => share.take(1));
  assert.deepEqual(r.asked, ['unit-fn:newcomer:day:30:1'], 'a refused share reached into the reserve');
  assert.deepEqual(r.result, { ok: false, code: 'share_ceiling' });

  /* the share says yes, the whole says no → the whole's refusal, unchanged */
  r = await withLimiter((s) => ({ allowed: s !== 'unit-fn:global:day', remaining: 0 }), () => share.take(1));
  assert.equal(r.result.code, 'spend_ceiling');

  /* silent → closed, and the whole is not asked either */
  r = await withLimiter(() => null, () => share.take(1));
  assert.deepEqual(r.result, { ok: false, code: 'limiter_unavailable' });
  assert.equal(r.asked.length, 1);

  /* a share of a different function's ceiling, or of nothing, is no ceiling */
  const other = P.spendCeiling({ fn: 'other-fn', perDay: 90, env: ENV() });
  for (const bad of [P.shareCeiling({ fn: 'unit-fn', share: 'newcomer', of: other, perDay: 30, env: ENV() }), P.shareCeiling({ fn: 'unit-fn', share: 'newcomer', perDay: 30, env: ENV() })]) {
    r = await withLimiter(() => ({ allowed: true, remaining: 1 }), () => bad.take(1));
    assert.deepEqual([r.result, r.asked], [{ ok: false, code: 'no_ceiling' }, []]);
  }
});

test('ai-quota-fairness ② the environment moves a share but cannot make it claim a reserve it lacks', () => {
  const whole = P.spendCeiling({ fn: 'ai-proxy', perDay: 3000, env: ENV() });
  assert.equal(P.shareEnvName('ai-proxy', 'newcomer'), 'AI_PROXY_NEWCOMER_PER_DAY');
  const moved = P.shareCeiling({ fn: 'ai-proxy', share: 'newcomer', of: whole, perDay: 1000, env: ENV({ AI_PROXY_NEWCOMER_PER_DAY: '400' }) });
  assert.deepEqual([moved.perDay, moved.reserved], [400, 2600]);
  const over = P.shareCeiling({ fn: 'ai-proxy', share: 'newcomer', of: whole, perDay: 1000, env: ENV({ AI_PROXY_NEWCOMER_PER_DAY: '99999' }) });
  assert.deepEqual([over.perDay, over.reserved], [3000, 0], 'a share above the whole is clamped to it, and says it reserves nothing');
  for (const junk of ['0', '-5', 'many', '']) {
    assert.equal(P.shareCeiling({ fn: 'ai-proxy', share: 'newcomer', of: whole, perDay: 1000, env: ENV({ AI_PROXY_NEWCOMER_PER_DAY: junk }) }).perDay, 1000);
  }
});

/* ══ ③ ai-proxy, run ═════════════════════════════════════════════════════════════════════════ */
function runProxy(requests, o) {
  const url = pathToFileURL(join(FN, 'ai-proxy', 'index.ts')).href;
  const src = `
    const ENV = ${JSON.stringify(o.env)};
    globalThis.Deno = { env: { get: (k) => ENV[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    const routes = ${JSON.stringify(o.routes)}.map(([re, r]) => [new RegExp(re), r]);
    const takes = ${JSON.stringify(o.takes || {})};
    const hosts = ${JSON.stringify(P.PROVIDER_HOSTS)};
    globalThis.__calls = [];
    globalThis.fetch = async (u, init) => {
      const s = String(u && u.url ? u.url : u);
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
      const provider = hosts.includes(new URL(s).hostname);
      globalThis.__calls.push({ url: s, provider, scope: body && body.p_scope, capacity: body && body.p_capacity });
      if (/\\/rest\\/v1\\/rpc\\/relay_take$/.test(s)) {
        const t = Object.prototype.hasOwnProperty.call(takes, body.p_scope) ? takes[body.p_scope] : { allowed: true, remaining: 9 };
        return new Response(JSON.stringify(t ? [t] : null), { status: t ? 200 : 503, headers: { "content-type": "application/json" } });
      }
      const hit = routes.find(([re]) => re.test(s));
      const r = hit ? hit[1] : { status: 404, json: { message: "no route" } };
      return new Response(JSON.stringify(r.json === undefined ? {} : r.json), { status: r.status || 200, headers: { "content-type": "application/json" } });
    };
    const mod = await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = globalThis.__calls.length;
      let status = 0, json = null;
      try {
        const r = await globalThis.__h(new Request("https://fn.test/", { method: "POST", headers: q.headers, body: JSON.stringify(q.body) }));
        status = r.status; try { json = await r.json(); } catch (_) { json = null; }
      } catch (e) { status = -1; json = { thrown: String(e && e.message || e) }; }
      out.push({ status, json, calls: globalThis.__calls.slice(before) });
    }
    const S = mod.SPEND;
    const sh = S.shares && S.shares.newcomer;
    process.stdout.write(JSON.stringify({ out, spend: { whole: S.ceiling.perDay, scope: S.ceiling.scope,
      newcomer: sh && { scope: sh.scope, perDay: sh.perDay, reserved: sh.reserved } } }));
    process.exit(0);
  `;
  return JSON.parse(execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 32 * 1024 * 1024 }));
}

const NOW = Date.now();
const userAged = (days) => ({ id: '00000000-0000-4000-8000-00000000000' + (days > 30 ? 2 : 1), aud: 'authenticated', role: 'authenticated', created_at: new Date(NOW - days * DAY).toISOString() });
const REPLIES = {
  anthropic: ['api\\.anthropic\\.com/v1/messages', { json: { model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 3, output_tokens: 2 } } }],
  openai: ['api\\.openai\\.com/v1/responses', { json: { model: 'gpt-5.6-terra', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"ok":true}' }] }], usage: { input_tokens: 3, output_tokens: 2 } } }],
  gemini: [':generateContent', { json: { modelVersion: 'gemini-3.5-flash', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } } }],
};
const KEYS = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
const dbFor = (user) => [
  ['/auth/v1/user$', { json: user }],
  ['/rest/v1/profiles', { json: [] }],
  ['/rest/v1/rpc/consume_ai_turn$', { json: [{ allowed: true, used: 1, charged: true, calls: 1 }] }],
  ['/rest/v1/rpc/consume_ai_gloss$', { json: [{ allowed: true, used: 1 }] }],
  ['/rest/v1/rpc/(refund|settle)_ai_(turn|gloss)$', { json: [{ ok: true }] }],
  ['/rest/v1/rpc/record_ai_usage$', { json: null }],
];
const SHAPES = {
  plain: { headers: { 'x-intmap-turn': 't-plain' }, body: { task: 'free_text', prompt: 'hello' } },
  turn: { headers: { 'x-intmap-turn': 't-turn' }, body: { task: 'atlas_turn', protocol: 2, input: [{ type: 'message', role: 'user', content: 'hello' }], tools: [] } },
  gloss: { headers: { 'x-intmap-lane': 'gloss' }, body: { task: 'gloss', prompt: 'what is a watershed' } },
};
const req = (shape) => ({ headers: { authorization: 'Bearer good', 'content-type': 'application/json', ...SHAPES[shape].headers }, body: SHAPES[shape].body });

for (const provider of Object.keys(REPLIES)) {
  test(`ai-quota-fairness ③ ai-proxy (${provider}): a newcomer whose share is spent sends nothing and leaves the project bucket alone; an established reader is answered`, () => {
    const env = { SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: provider, [KEYS[provider]]: 'stub' };
    const shapes = Object.keys(SHAPES);
    const takes = { 'ai-proxy:newcomer:day': { allowed: false, remaining: 0 } };

    const fresh = runProxy(shapes.map(req), { env, routes: [...dbFor(userAged(0)), REPLIES[provider]], takes });
    fresh.out.forEach((o, i) => {
      const where = provider + '/' + shapes[i] + ': ';
      assert.deepEqual(o.calls.filter((c) => c.provider).map((c) => c.url), [], where + 'the provider was asked');
      assert.ok(o.calls.some((c) => c.scope === 'ai-proxy:newcomer:day'), where + 'the newcomer share was not consulted: ' + JSON.stringify(o.calls.map((c) => c.scope || c.url)));
      assert.ok(!o.calls.some((c) => c.scope === 'ai-proxy:global:day'), where + 'a refused newcomer reached into the project bucket');
      assert.equal(o.status, 503, where + JSON.stringify(o.json));
      assert.equal(o.json.error, 'provider_quota');
      assert.equal(o.json.meta.ceiling, 'newcomer_day');
      assert.ok(o.calls.some((c) => /refund_ai_(turn|gloss)$/.test(c.url)), where + 'the charged use was not given back');
    });

    /* the same moment, a year-old account: the project bucket alone, and an answer */
    const old = runProxy(shapes.map(req), { env, routes: [...dbFor(userAged(365)), REPLIES[provider]], takes });
    old.out.forEach((o, i) => {
      const where = provider + '/' + shapes[i] + ': ';
      assert.equal(o.status, 200, where + JSON.stringify(o.json));
      assert.ok(!o.calls.some((c) => c.scope === 'ai-proxy:newcomer:day'), where + 'an established reader was drawn from the newcomer share');
      const order = o.calls.map((c) => c.scope || (c.provider ? 'provider' : ''));
      assert.ok(order.indexOf('ai-proxy:global:day') >= 0 && order.indexOf('ai-proxy:global:day') < order.indexOf('provider'), where + order.join(' '));
    });

    /* and a newcomer with share left is answered, taking share then whole before the request */
    const ok = runProxy([req('turn')], { env, routes: [...dbFor(userAged(1)), REPLIES[provider]] }).out[0];
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const order = ok.calls.map((c) => c.scope || (c.provider ? 'provider' : '')).filter(Boolean);
    assert.deepEqual(order.slice(0, 3), ['ai-proxy:newcomer:day', 'ai-proxy:global:day', 'provider']);
  });
}

/* ══ ④ nothing anyone had is lowered ═══════════════════════════════════════════════════════════ */
test('ai-quota-fairness ④ the share is carved out of the project ceiling, not added under it, and the reserve is most of the day', () => {
  const env = { SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'stub' };
  const { spend } = runProxy([], { env, routes: [] });
  assert.equal(spend.scope, 'ai-proxy:global:day');
  assert.equal(spend.newcomer.scope, 'ai-proxy:newcomer:day');
  assert.equal(spend.newcomer.perDay + spend.newcomer.reserved, spend.whole);
  assert.ok(spend.newcomer.reserved > spend.newcomer.perDay, 'the reserve for established accounts is the larger part');
  /* the share is sized above the busiest newcomer day ever recorded (production, 2026-10-01: 16 turns
     by accounts under a week old), even if every one of those turns had used all TURN_MAX_CALLS 12 */
  assert.ok(spend.newcomer.perDay >= 16 * 12, 'the share would not have held the busiest recorded newcomer day');
  /* an established reader's request is asked of a bucket the size of the whole day — the share
     narrowed nothing for them */
  const old = runProxy([req('plain')], { env, routes: [...dbFor(userAged(365)), REPLIES.anthropic] }).out[0];
  assert.deepEqual(old.calls.filter((c) => c.scope).map((c) => c.scope + ':' + c.capacity), ['ai-proxy:global:day:' + spend.whole]);

  /* the env moves the whole, and the share and the reserve move with it (a fraction, not a number) */
  const moved = runProxy([], { env: { ...env, AI_PROXY_GLOBAL_PER_DAY: String(spend.whole * 2) }, routes: [] }).spend;
  assert.equal(moved.whole, spend.whole * 2);
  assert.equal(moved.newcomer.perDay, spend.newcomer.perDay * 2, 'the share did not follow the whole');
});
