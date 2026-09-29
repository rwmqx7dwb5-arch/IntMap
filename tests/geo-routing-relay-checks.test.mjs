/* ============================================================================
 *  ROUTING · THE RELAY'S SPEND — routing-relay の上限
 * ----------------------------------------------------------------------------
 *  supabase/functions/routing-relay: the in-process rate map is bounded, the shared buckets are taken
 *  before Mapbox is asked, and the project-wide ceiling refuses with 429.
 *
 *  ⚠ A FILE OF ITS OWN ON PURPOSE: the Edge Function is evaluated with a `Deno` global installed
 *  BEFORE it is imported (it calls Deno.serve at import), which is a module-evaluation-time dependency
 *  no shared process can give back (tests/helpers/geo-shared.mjs says why).
 * ==========================================================================*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R801 · the relay spend   (was tests/r801-relay-spend-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  #R801 — routing-relay の支出制御は「プロセス内 Map の IP 別カウンター」だけだった
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  外部監査の指摘: ⑴ Map は isolate ごとに別で再起動で消え、プロジェクト全体の上限が無い
 *  ⑵ RATE_MAX_KEYS=4096 を超えたときの処理が「期限切れ掃除」だけなので、全部が有効期限内なら
 *  1 件も消えない（10,000 識別子を同時刻に入れて 10,000 保持を再現済み）。
 *
 *  この検査は 3 つの事実を測る。
 *    ① Map は宣言した最大件数を守る——**routing-relay/index.ts を実際に評価して** rateOk を
 *       10,000 回呼び、size を数える（#R505 と同じ理由でソースの正規表現ではない）。
 *    ② migration の relay_take は SECURITY DEFINER・search_path=''・service_role のみ。
 *       こちらは SQL なので Postgres 無しには評価できない——実際の評価は
 *       supabase/tests/08_relay_rate_limit_test.sql（pgTAP・CI の db.yml）が行い、ここは
 *       migration の文面が述べていることを固定する。
 *    ③ 共有 bucket の取得は Mapbox への fetch より**前**にある——ハンドラを呼び、fetch を
 *       スタブして呼び出しの順序を記録する。probe と不正な要求は DB を叩かない。
 *       global bucket は fail-closed、IP bucket は fail-open（Map が既に判定している）。
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

const src = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── routing-relay を評価してハンドラと内部を手に入れる（r769 と同じ形） ──────────────── */
const ENV = {
  MAPBOX_TOKEN: 'stub-mapbox-token',
  SUPABASE_URL: 'https://stub.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
};
let HANDLER = null;
globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: (h) => { HANDLER = h; } };

const relay = await import(pathToFileURL(join(ROOT, 'supabase/functions/routing-relay/index.ts')).href);
const { rateOk, buckets, RATE_MAX_KEYS, RATE_PER_MIN } = relay;

/* ── ① Map の上限 ───────────────────────────────────────────────────────────────────────── */
test('R801 ① the in-process Map never exceeds RATE_MAX_KEYS, even when nothing is idle', () => {
  assert.equal(typeof HANDLER, 'function', 'Deno.serve was reached');
  buckets.clear();
  const now = 1_700_000_000_000;
  const N = 10_000;
  assert.ok(N > RATE_MAX_KEYS, 'the reproduction needs more identifiers than the ceiling');
  for (let i = 0; i < N; i++) assert.equal(rateOk('caller-' + i, now), true);
  assert.ok(buckets.size <= RATE_MAX_KEYS,
    `10,000 identifiers at one instant: the Map holds ${buckets.size}, the declared ceiling is ${RATE_MAX_KEYS}`);
  /* the ones that went are the OLDEST — the survivors are exactly the last RATE_MAX_KEYS inserted */
  assert.equal(buckets.size, RATE_MAX_KEYS);
  assert.equal(buckets.has('caller-0'), false, 'the first identifier was evicted');
  assert.equal(buckets.has('caller-' + (N - RATE_MAX_KEYS - 1)), false, 'the last identifier before the survivors was evicted');
  assert.equal(buckets.has('caller-' + (N - RATE_MAX_KEYS)), true, 'the oldest survivor is the first of the last RATE_MAX_KEYS');
  assert.equal(buckets.has('caller-' + (N - 1)), true, 'the newest identifier survived');
});

test('R801 ① a caller that keeps calling is NOT the one evicted — recency, not insertion, decides', () => {
  buckets.clear();
  const now = 1_700_000_000_000;
  assert.equal(rateOk('hot', now), true);
  for (let i = 0; i < RATE_MAX_KEYS - 1; i++) rateOk('filler-' + i, now);
  assert.equal(buckets.size, RATE_MAX_KEYS, 'the Map is exactly full');
  assert.equal(rateOk('hot', now + 1), true, 'the hot caller is seen again (moves to the recent end)');
  rateOk('one-more', now + 1);
  assert.equal(buckets.size, RATE_MAX_KEYS);
  assert.equal(buckets.has('hot'), true, 'the hot caller survived');
  assert.equal(buckets.has('filler-0'), false, 'the least-recently-seen filler went instead');
});

test('R801 ① the idle sweep still runs first, and an evicted caller starts a fresh bucket', () => {
  buckets.clear();
  const t0 = 1_700_000_000_000;
  for (let i = 0; i < RATE_MAX_KEYS; i++) rateOk('old-' + i, t0);
  /* well past RATE_IDLE_MS (5 min): the sweep empties the Map before any recency eviction */
  const later = t0 + 10 * 60_000;
  rateOk('fresh', later);
  assert.equal(buckets.size, 1, 'every idle entry was swept; only the new caller remains');
  /* the bucket is a real limiter: RATE_PER_MIN takes, then a refusal */
  buckets.clear();
  for (let i = 0; i < RATE_PER_MIN; i++) assert.equal(rateOk('loop', t0), true);
  assert.equal(rateOk('loop', t0), false, 'the 61st call in the same instant is refused');
});

/* ── ② migration の文面 ─────────────────────────────────────────────────────────────────── */
const MIG = 'supabase/migrations/20260918100000_r801_relay_rate_limit.sql';
const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

test('R801 ② relay_take is SECURITY DEFINER, pins search_path, and is executable by service_role only', () => {
  const sql = stripSql(src(MIG));
  const fn = /create or replace function public\.relay_take\([\s\S]*?\$\$;/i.exec(sql);
  assert.ok(fn, 'relay_take is defined in the migration');
  assert.match(fn[0], /security definer/i, 'relay_take must be SECURITY DEFINER (no client may write the table)');
  assert.match(fn[0], /set search_path = ''/, 'relay_take must pin search_path (lint function_search_path_mutable)');
  assert.match(fn[0], /for update/i, 'the bucket row is read under a row lock (atomic refill + deduction)');
  assert.match(fn[0], /clock_timestamp\(\)/, 'elapsed time is wall-clock, not transaction start');
  const sig = 'public\\.relay_take\\(text, text, integer, numeric, integer\\)';
  assert.match(sql, new RegExp('revoke execute on function ' + sig + ' from public, anon, authenticated', 'i'),
    'EXECUTE must be revoked from public/anon/authenticated');
  assert.match(sql, new RegExp('grant\\s+execute on function ' + sig + ' to service_role', 'i'),
    'EXECUTE must be granted to service_role');
  assert.match(sql, /alter table public\.relay_rate_buckets enable row level security/i, 'RLS is on');
  assert.match(sql, /revoke all on table public\.relay_rate_buckets from public, anon, authenticated/i,
    'no client role holds any table privilege (TRUNCATE is not subject to RLS)');
  assert.ok(!/create policy[^;]*relay_rate_buckets/i.test(sql), 'no policy opens the table to anyone');
  const sweep = /create or replace function public\.sweep_relay_rate_buckets\([\s\S]*?\$\$;/i.exec(sql);
  assert.ok(sweep, 'the sweep exists');
  assert.match(sweep[0], /security definer/i);
  assert.match(sweep[0], /set search_path = ''/);
  /* the pgTAP file that evaluates the behaviour actually exists and names the function */
  const tap = src('supabase/tests/08_relay_rate_limit_test.sql');
  assert.match(tap, /relay_take/, 'the pgTAP harness exercises relay_take');
  assert.match(tap, /sweep_relay_rate_buckets/, 'the pgTAP harness exercises the sweep');
});

/* ── ③ 順序: bucket → Mapbox ──────────────────────────────────────────────────────────────── */
const ROUTE = 'https://edge.test/functions/v1/routing-relay?provider=mapbox&profile=mapbox%2Fdriving-traffic'
  + '&coords=139.7,35.6;139.8,35.7&overview=full';
const mapboxJson = '{"code":"Ok","routes":[{"duration":1,"distance":1}],"uuid":"abc"}';

/* fetch のスタブ。上流 (Mapbox) と PostgREST の rpc を、呼ばれた順に記録する。
   `rpc(scope)` が返す値で bucket の答えを決める: {allowed} / 'down'（到達不能） */
let CALLS = [];
function stubFetch(rpc) {
  globalThis.fetch = async (input, init) => {
    const u = String((input && input.url) || input);
    if (u.startsWith('https://stub.supabase.test/rest/v1/rpc/relay_take')) {
      const args = JSON.parse(init.body);
      CALLS.push({ kind: 'rpc', scope: args.p_scope, key: args.p_key, capacity: args.p_capacity });
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.authorization, 'Bearer stub-service-key', 'the service-role identity');
      const verdict = rpc(args.p_scope);
      if (verdict === 'down') throw new TypeError('connect ECONNREFUSED');
      return new Response(JSON.stringify([{ allowed: verdict.allowed, remaining: 5 }]),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith('https://api.mapbox.com/')) {
      CALLS.push({ kind: 'mapbox' });
      return new Response(mapboxJson, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('this check must not reach the network: ' + u);
  };
}

let ipSeq = 0;
async function ask(url, rpc) {
  CALLS = [];
  stubFetch(rpc);
  /* a fresh address per request, so stage 1 (the Map) never decides what stage 2 is measured on */
  const req = new Request(url, { headers: { 'x-forwarded-for': '10.0.' + Math.floor(ipSeq / 250) + '.' + (ipSeq++ % 250) } });
  const res = await HANDLER(req);
  return { res, calls: CALLS.slice(), body: await res.text() };
}
const ALLOW = () => ({ allowed: true });

test('R801 ③ every shared bucket is taken BEFORE Mapbox is asked, in the declared order', async () => {
  const { res, calls, body } = await ask(ROUTE, ALLOW);
  assert.equal(res.status, 200);
  assert.equal(body, mapboxJson, 'the upstream answer passes through unaltered');
  const kinds = calls.map((c) => c.kind);
  assert.deepEqual(kinds, ['rpc', 'rpc', 'rpc', 'rpc', 'mapbox'], 'four takes, then the paid call, nothing else');
  assert.deepEqual(calls.slice(0, 4).map((c) => c.scope),
    ['routing-relay:ip', 'routing-relay:ip:day', 'routing-relay:global:minute', 'routing-relay:global:day']);
  assert.deepEqual(calls.slice(2, 4).map((c) => c.key), ['*', '*'], 'the global buckets are one row each');
  assert.equal(calls[1].key, calls[0].key, 'the day share is keyed on the same caller as the minute bucket');
  assert.equal(calls[0].capacity, RATE_PER_MIN, 'the shared IP bucket states the same rate as the Map');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('R801 ③ the project-wide ceiling refuses with 429 spend_ceiling and Mapbox is never called', async () => {
  for (const scope of ['routing-relay:global:minute', 'routing-relay:global:day']) {
    const { res, calls, body } = await ask(ROUTE, (s) => ({ allowed: s !== scope }));
    assert.equal(res.status, 429, scope);
    assert.deepEqual(JSON.parse(body), { error: 'spend_ceiling' }, scope);
    assert.ok(!calls.some((c) => c.kind === 'mapbox'), scope + ': the paid call was not made');
  }
  /* and a refusal by the shared IP bucket is the caller's rate, not the project's */
  const { res, calls, body } = await ask(ROUTE, (s) => ({ allowed: s !== 'routing-relay:ip' }));
  assert.equal(res.status, 429);
  assert.deepEqual(JSON.parse(body), { error: 'rate_limit' });
  assert.deepEqual(calls.map((c) => c.kind), ['rpc'], 'refused at the first take; nothing after it');
});

test('R801 ③ the global buckets fail CLOSED and the IP bucket fails OPEN when the database does not answer', async () => {
  /* everything down: no paid call, and the reason is the limiter, not the provider */
  let r = await ask(ROUTE, () => 'down');
  assert.equal(r.res.status, 503);
  assert.deepEqual(JSON.parse(r.body), { error: 'limiter_unavailable' });
  assert.ok(!r.calls.some((c) => c.kind === 'mapbox'), 'fail-closed: Mapbox was not asked');
  /* only the IP take fails: the Map already throttled this caller, the global buckets still stand */
  r = await ask(ROUTE, (s) => (s === 'routing-relay:ip' ? 'down' : { allowed: true }));
  assert.equal(r.res.status, 200, 'fail-open for the per-caller bucket');
  assert.deepEqual(r.calls.map((c) => c.kind), ['rpc', 'rpc', 'rpc', 'rpc', 'mapbox']);
  /* the day bucket alone down: still closed */
  r = await ask(ROUTE, (s) => (s === 'routing-relay:global:day' ? 'down' : { allowed: true }));
  assert.equal(r.res.status, 503);
  assert.ok(!r.calls.some((c) => c.kind === 'mapbox'));
});

test('R801 ③ a probe and a malformed request never reach the shared buckets', async () => {
  let r = await ask('https://edge.test/functions/v1/routing-relay?probe=1', () => { throw new Error('rpc reached'); });
  assert.equal(r.res.status, 200);
  assert.deepEqual(JSON.parse(r.body), { ok: true, providers: { mapbox: true } });
  assert.deepEqual(r.calls, [], 'a probe costs nothing and asks nothing');
  r = await ask('https://edge.test/functions/v1/routing-relay?provider=mapbox&profile=mapbox%2Fdriving&coords=nope',
    () => { throw new Error('rpc reached'); });
  assert.equal(r.res.status, 400);
  assert.deepEqual(r.calls, [], 'a request refused for its shape takes no token');
});

test('R801 ③ the refresh endpoint is a paid call too, and passes the same buckets', async () => {
  const { res, calls } = await ask('https://edge.test/functions/v1/routing-relay?provider=mapbox&refresh=1&routeId=abc&routeIndex=0&legIndex=0', ALLOW);
  assert.equal(res.status, 200);
  assert.deepEqual(calls.map((c) => c.kind), ['rpc', 'rpc', 'rpc', 'rpc', 'mapbox']);
});

/* ── 受け側: 新しいコードは HTTP status でしか読まれない ────────────────────────────────── */
test('R801 the page reads the relay status, not the body code, so spend_ceiling needs no client change', async () => {
  /* ⚠ EVALUATED END TO END (it used to read js/routing-traffic.js and js/routing-errors.js for three
     spellings). The page's own adapter — js/routing-providers.js, js/routing-errors.js and
     js/routing-traffic.js, evaluated the way the page evaluates them — is pointed at THIS relay's
     handler, and the relay is made to refuse by its shared buckets. What the page reports is then the
     answer to the question the round asked: does a refusal the page never heard of (`spend_ceiling`,
     `limiter_unavailable`) arrive as a fact it already knows? */
  const w = { SUPABASE_URL: 'https://edge.test' };
  w.IntMapLang = { t: (l, ...a) => a[0], pick: () => (...a) => a[0], pickArgs: () => (...a) => a, locale: () => 'en-GB' };
  for (const f of ['js/routing-providers.js', 'js/routing-errors.js', 'js/routing-traffic.js']) {
    // eslint-disable-next-line no-new-func
    new Function('window', src(f))(w);
  }
  const T = w.IntMapRouteTraffic;
  let rpc = ALLOW;
  const relayAnswered = [];
  globalThis.fetch = async (input, init) => {
    const u = String((input && input.url) || input);
    if (u.startsWith('https://edge.test/functions/v1/routing-relay')) {
      /* the relay itself answers, with its own fetch for the buckets and the paid call */
      stubFetch(rpc);
      const res = await HANDLER(new Request(u, { headers: { 'x-forwarded-for': '10.9.' + (ipSeq % 250) + '.' + (ipSeq++ % 250) } }));
      globalThis.fetch = PAGE_FETCH;
      relayAnswered.push(res.status);
      return res;
    }
    throw new Error('the page must reach the relay and nothing else: ' + u);
  };
  const PAGE_FETCH = globalThis.fetch;
  assert.equal(await T.probe(), true, 'the adapter learns from the relay that Mapbox is configured');
  const from = { lng: 139.7, lat: 35.6 }, to = { lng: 139.8, lat: 35.7 };
  for (const [scope, want] of [['routing-relay:global:minute', 'PROVIDER_RATE_LIMIT'], ['routing-relay:global:day', 'PROVIDER_RATE_LIMIT']]) {
    rpc = (s) => ({ allowed: s !== scope });
    const r = await T.route(from, to, { mode: 'driving' });
    assert.equal(r.ok, false, scope);
    assert.equal(r.status, want, '429 spend_ceiling is a rate-limit fact to the page (' + scope + '): ' + r.status);
  }
  rpc = () => 'down';
  const down = await T.route(from, to, { mode: 'driving' });
  assert.equal(down.status, 'PROVIDER_UNAVAILABLE', '503 limiter_unavailable is «provider unavailable» to the page: ' + down.status);
  assert.deepEqual(relayAnswered, [200, 429, 429, 503], 'every answer above came from the relay itself');
  /* …and the error table answers those two statuses the same way when asked directly */
  assert.equal(w.IntMapRouteErrors.fromHTTP(429), 'PROVIDER_RATE_LIMIT');
  assert.equal(w.IntMapRouteErrors.fromHTTP(503), 'PROVIDER_UNAVAILABLE');
});

/* ══ #R347 ㉖ (moved here from the navigation checks: it is a property of this relay, and this file is
   the one that can evaluate the relay) ═══════════════════════════════════════════════════════════ */
test('R347 ㉖ the routing relay never caches, and never lets a caller inject a token', async () => {
  /* ⚠ EVALUATED (it used to read index.ts with its comments stripped and look for `no-store`, the
     absence of `s-maxage`, `MAPBOX_TOKEN`, `Deno.env.get` and a `searchParams.get('access_token')`).
     The relay is asked — a success, a refusal and a probe — and what it answers and what it forwards
     are measured: every response says no-store and none carries a shared-cache lifetime, and the paid
     call carries the key from the environment, never the one the caller put in the URL. */
  const forwarded = [];
  const evil = 'caller-supplied-token';
  const answers = [];
  for (const [url, rpc] of [
    [ROUTE + '&access_token=' + evil, ALLOW],
    [ROUTE + '&access_token=' + evil, (s) => ({ allowed: s !== 'routing-relay:global:day' })],
    ['https://edge.test/functions/v1/routing-relay?probe=1&access_token=' + evil, ALLOW],
  ]) {
    CALLS = [];
    stubFetch(rpc);
    const inner = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const u = String((input && input.url) || input);
      if (u.startsWith('https://api.mapbox.com/')) forwarded.push(new URL(u));
      return inner(input, init);
    };
    const res = await HANDLER(new Request(url, { headers: { 'x-forwarded-for': '10.8.0.' + (ipSeq++ % 250) } }));
    answers.push(res);
  }
  for (const res of answers) {
    const cc = res.headers.get('cache-control') || '';
    assert.match(cc, /no-store/, 'Mapbox §2.10.1 forbids caching Navigation API results (status ' + res.status + ')');
    assert.ok(!/s-maxage|max-age=[1-9]/.test(cc), 'every other relay in this repo sets s-maxage; this one must not: ' + cc);
  }
  assert.equal(forwarded.length, 1, 'only the allowed route request reaches Mapbox');
  assert.equal(forwarded[0].searchParams.getAll('access_token').join(','), ENV.MAPBOX_TOKEN,
    'the key is read from the environment, and a caller-supplied access_token is dropped, never forwarded');
  assert.ok(!forwarded[0].href.includes(evil), 'the caller\'s token appears nowhere in the forwarded request');
  /* 綴りのまま: config.toml は評価する対象ではなく配備の宣言そのもの。
     config.toml must declare it, or `supabase functions deploy` and doc-facts both go wrong */
  const cfg = src('supabase/config.toml');
  assert.ok(/\[functions\.routing-relay\]/.test(cfg), 'the function is declared');
});
