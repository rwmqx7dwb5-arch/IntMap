/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  anon-write-guard — 匿名で起こせる書き込みと上流の消費を、既存の 1 つの守りの形に揃える
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  元の欠陥（監査 2026-09-30）:
 *    ⑴ feedback / bug_reports は anon と authenticated が PostgREST から直接 INSERT できた。
 *       #R155 の len_guard は「1 行の長さ」を縛るが「行数」を縛るものは無く、公開キーで
 *       いくらでも行を作れた（admin が 1 行ずつ読む、PII を含む表）。
 *    ⑵ aviation-feed / ais-feed の `?refresh=1` は誰でも送れ、isolate ごとのバケットでしか
 *       抑えていなかった——isolate にまたがって送れば、それぞれが burst を与えた。
 *
 *  ここで測るのは「綴りがあるか」ではなく**実際にどう答えるか**である（Edge Function はソースを
 *  読まず評価する——#R505）:
 *    ② aviation-feed と ais-feed を子プロセスで評価し、プロジェクト全体の強制更新枠（relay_take・
 *       鍵 '*'）を超えた refresh=1 と、DB が答えないときの refresh=1 は**上流に 1 本も触れず**
 *       通常のキャッシュ済みの答えを返し（拒否ではない）、枠が許せば従来どおり上流へ行く。
 *       aviation の枠の大きさは掃引ワークフローの SLICES と cron から読んで照合する
 *    ③ reader-reports を評価し、拒否の形・バケットが書き込みより先・user_id と email は
 *       検証済みのアカウントからだけ・本文の user_id / created_at は捨てられる・IP は書かれない
 *    ④ ページ（js/feedback.js）は PostgREST へ直接書かず reader-reports へ送る
 *    ⑤ migration は INSERT の policy と grant を両方閉じ、行を消さない
 *  DB 側（権限の全数・service_role の書き込み・既存行）は supabase/tests/14_anon_write_guard_test.sql。
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p) => pathToFileURL(join(ROOT, p)).href;

/* ── ② the two feeds, evaluated (① — a shared secret comparison — was withdrawn with the design) ─────────────────────────────────── */

/* One child per scenario (a fresh isolate): the first request warms it, the second is the one
   measured. Every fetch is recorded; upstream = anything that is not this project's own backend
   (sb.test: PostgREST and Storage). relay_take answers `allowed` for the per-address callerGate
   buckets and `take` for the force bucket: 'allow' | 'deny' | 'down' (HTTP 500 — no answer). */
const SB = 'http://sb.test';
function runFeed(fn, take, requests) {
  const url = modUrl(join('supabase/functions', fn, 'index.ts'));
  const code = `
    globalThis.__calls = [];
    globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: ${JSON.stringify(SB)}, SUPABASE_SERVICE_ROLE_KEY: "svc" })[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    globalThis.fetch = async (u, init) => {
      const s = String(u);
      globalThis.__calls.push({ u: s, body: init && init.body ? String(init.body) : "" });
      if (s.endsWith("/rest/v1/rpc/relay_take")) {
        const b = JSON.parse(init.body);
        if (b.p_scope.endsWith(":ip")) return new Response(JSON.stringify([{ allowed: true, remaining: 9 }]), { status: 200 });
        if (${JSON.stringify(take)} === "down") return new Response("x", { status: 500 });
        return new Response(JSON.stringify([{ allowed: ${JSON.stringify(take)} === "allow", remaining: 0 }]), { status: 200 });
      }
      return new Response("no", { status: 404 });
    };
    globalThis.WebSocket = class { constructor(u) { globalThis.__calls.push({ u: "WS " + u }); this.readyState = 1;
      setTimeout(() => { this.onopen && this.onopen(); this.onclose && this.onclose({ code: 1000 }); }, 5); } send() {} close() {} };
    const m = await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = globalThis.__calls.length;
      const r = await globalThis.__h(new Request("http://feed.test/" + q));
      await r.text();
      const calls = globalThis.__calls.slice(before);
      out.push({ status: r.status, forced: r.headers.get("x-intmap-forced"),
        upstream: calls.filter((c) => !c.u.startsWith(${JSON.stringify(SB)})).length,
        forceTakes: calls.filter((c) => c.u.endsWith("/rpc/relay_take") && !JSON.parse(c.body).p_scope.endsWith(":ip")).map((c) => JSON.parse(c.body)) });
    }
    process.stdout.write(JSON.stringify({ out, FORCE: { scope: m.FORCE_SCOPE, burst: m.FORCE_BURST, period: m.FORCE_PERIOD_S } }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', code],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000, maxBuffer: 16 * 1024 * 1024 }));
}

const FEEDS = [
  { fn: 'aviation-feed', plain: '?ch=world', forced: '?ch=world&refresh=1&tiles=2' },
  { fn: 'ais-feed', plain: '', forced: '?refresh=1' },
];

for (const F of FEEDS) {
  test(`anon-write-guard ② ${F.fn}: ?refresh=1 beyond the project-wide allowance, or with the database silent, is served the cached answer and touches no upstream`, () => {
    const base = runFeed(F.fn, 'allow', [F.plain, F.plain]).out[1];
    assert.equal(base.upstream, 0, 'a warm isolate answers a plain request from what it holds');
    for (const [take, verdict] of [['deny', 'capped'], ['down', 'unavailable']]) {
      const r = runFeed(F.fn, take, [F.plain, F.forced]);
      const o = r.out[1];
      assert.equal(o.status, 200, 'not a refusal: ' + take);
      assert.equal(o.forced, verdict, 'the answer says why nothing was forced');
      assert.equal(o.upstream, base.upstream, `${take}: exactly what a reader without refresh=1 costs — nothing upstream`);
      assert.equal(o.forceTakes.length, 1, 'the allowance was asked once');
      const t = o.forceTakes[0];
      assert.equal(t.p_scope, r.FORCE.scope);
      assert.equal(t.p_key, '*', 'one bucket for every caller — the sweeper holds no secret to be told apart by');
      assert.equal(t.p_capacity, r.FORCE.burst);
      assert.ok(Math.abs(t.p_refill_per_sec - r.FORCE.burst / r.FORCE.period) < 1e-12, 'refilled at FORCE_BURST per FORCE_PERIOD_S');
    }
  });

  test(`anon-write-guard ② ${F.fn}: a granted refresh=1 still goes upstream, and a request without it never asks the allowance`, () => {
    const r = runFeed(F.fn, 'allow', [F.plain, F.forced]);
    assert.equal(r.out[0].forced, null, 'no refresh=1, no header');
    assert.equal(r.out[0].forceTakes.length, 0, 'a reader\'s request costs the allowance nothing');
    assert.equal(r.out[1].forced, 'granted');
    assert.ok(r.out[1].upstream > 0, 'the granted refresh reached the upstream');
  });
}

/* The aviation allowance is the sweeper's size, and the sweeper's numbers live in the workflow: read
   them there, so a change to either side that leaves the other behind goes red here. */
test('anon-write-guard ② aviation-feed\'s allowance is one sweep run (SLICES) per cron interval, read from the workflow; the sweep needs no secret', () => {
  const wf = src('.github/workflows/aviation-sweep.yml');
  const slices = Number((/^\s*SLICES=(\d+)\s*$/m.exec(wf) || [])[1]);
  const cron = (/cron:\s*'\*\/(\d+) \* \* \* \*'/.exec(wf) || [])[1];
  assert.ok(slices > 0 && cron, 'the workflow still states SLICES and a */N-minute cron');
  const { FORCE } = runFeed('aviation-feed', 'allow', ['?ch=meta']);
  assert.equal(FORCE.burst, slices, 'FORCE_BURST is the slices one run asks for');
  assert.equal(FORCE.period, Number(cron) * 60, 'FORCE_PERIOD_S is the cron interval');
  assert.match(wf, /\?ch=world&refresh=1&tiles=\d+/, 'the sweep still just asks with refresh=1');
  assert.ok(!/secrets\./.test(wf), 'and reads no secret — nothing has to be registered by hand before it can run');
  const ais = runFeed('ais-feed', 'allow', ['?meta=1']).FORCE;
  const ttl = Number((/const WORLD_TTL_MS = (\d+);/.exec(src('supabase/functions/ais-feed/index.ts')) || [])[1]);
  assert.equal(ais.burst, 1);
  assert.equal(ais.period * 1000, ttl, 'ais-feed (no sweeper): one forced refresh per WORLD_TTL_MS, project-wide');
});

/* ── ③ reader-reports, evaluated ─────────────────────────────────────────────────────────── */

const ENV = {
  SUPABASE_URL: 'https://stub.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
  SUPABASE_ANON_KEY: 'stub-publishable-key',
};
globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: () => {} };
const FN = await import(modUrl('supabase/functions/reader-reports/index.ts'));
const RL = await import(modUrl('supabase/functions/_shared/rate-limit.js'));
const { PRODUCTION_ORIGIN: PROD } = await import(modUrl('supabase/functions/_shared/client-error-shape.js'));

const CALLER_IP = '203.0.113.88';
const USER = { id: '11111111-2222-4333-8444-555555555555', email: 'reader@example.test' };
function req(method, body, headers) {
  return new Request('https://stub.supabase.test/functions/v1/reader-reports', {
    method,
    headers: { origin: PROD, 'x-forwarded-for': CALLER_IP + ', 10.0.0.1', 'content-type': 'application/json', ...(headers || {}) },
    body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}
/* fetch stub: relay_take answers per `allow`, /auth/v1/user answers per the token, an insert answers 201 */
function stubBackend(opts) {
  const o = opts || {};
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const h = new Headers((init && init.headers) || {});
    calls.push({ url: u, method: (init && init.method) || 'GET', body: init && init.body ? String(init.body) : '', auth: h.get('authorization') || '' });
    if (o.down) throw new Error('connect ECONNREFUSED');
    if (u.endsWith('/rpc/relay_take')) return new Response(JSON.stringify([{ allowed: o.allow !== false, remaining: 3 }]), { status: 200 });
    if (u.endsWith('/auth/v1/user')) {
      if (h.get('authorization') === 'Bearer good-user-token') return new Response(JSON.stringify(USER), { status: 200 });
      return new Response('{"msg":"invalid JWT"}', { status: 401 });
    }
    if (/\/rest\/v1\/(feedback|bug_reports)$/.test(u)) return new Response(null, { status: o.insertStatus || 201 });
    return new Response('{}', { status: 404 });
  };
  return calls;
}
const FEEDBACK = { kind: 'feedback', rating: 4, comment: '[General] works', lang: 'jp', ua: 'Mozilla/5.0', page: '/IntMap/' };
const BUG = { kind: 'bug', category: 'map', description: 'the layer does not draw', diagnostics: { build: 'b', errors: [] }, lang: 'en', build: '2026-09-30T00:00:00Z-abc', ua: 'Mozilla/5.0', page: '/IntMap/' };

test('anon-write-guard ③ reader-reports refuses what it must refuse, before touching the database', async () => {
  const calls = stubBackend();
  assert.equal((await FN.handle(req('GET'))).status, 405, 'GET');
  assert.equal((await FN.handle(req('POST', FEEDBACK, { origin: 'https://evil.example' }))).status, 403, 'a foreign Origin');
  const pre = await FN.handle(req('OPTIONS', null, { origin: 'https://evil.example' }));
  assert.equal(pre.status, 403);
  assert.equal(pre.headers.get('access-control-allow-origin'), null, 'a foreign origin cannot even read the refusal');
  const ok = await FN.handle(req('OPTIONS'));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), PROD, 'echoed, never *');
  assert.match(ok.headers.get('access-control-allow-headers') || '', /authorization/, 'the page may send its session token');
  assert.equal((await FN.handle(req('POST', 'x'.repeat(FN.MAX_BODY_BYTES + 1)))).status, 413, 'an oversized body');
  assert.equal((await FN.handle(req('POST', '{not json'))).status, 400, 'malformed JSON');
  assert.equal((await FN.handle(req('POST', { ...FEEDBACK, kind: 'donation' }))).status, 400, 'an unknown kind');
  for (const rating of [0, 6, 3.5, '4', null]) {
    assert.equal((await FN.handle(req('POST', { ...FEEDBACK, rating }))).status, 400, 'rating ' + JSON.stringify(rating));
  }
  assert.equal((await FN.handle(req('POST', { ...FEEDBACK, comment: 'x'.repeat(FN.LIMITS.feedback.comment + 1) }))).status, 400,
    'over the feedback_len_guard ceiling');
  assert.equal((await FN.handle(req('POST', { ...BUG, description: '   ' }))).status, 400, 'a bug report says something');
  assert.equal((await FN.handle(req('POST', { ...BUG, category: { a: 1 } }))).status, 400, 'a text column takes text');
  assert.equal((await FN.handle(req('POST', { ...BUG, diagnostics: { pad: 'x'.repeat(FN.LIMITS.diagnosticsChars) } }))).status, 413,
    'diagnostics over their ceiling');
  assert.equal(calls.length, 0, 'none of the above reached the Auth server or the database');
});

test('anon-write-guard ③ an anonymous report: both buckets BEFORE the write, user_id null, the body\'s identity and timestamps ignored, no IP written', async () => {
  const calls = stubBackend();
  const forged = { ...FEEDBACK, user_id: USER.id, email: 'typed@example.test', created_at: '2000-01-01T00:00:00Z', id: 7, is_admin: true };
  const res = await FN.handle(req('POST', forged));
  assert.equal(res.status, 201, await res.clone().text());
  assert.deepEqual(calls.map((c) => c.url.replace(ENV.SUPABASE_URL, '')), ['/rest/v1/rpc/relay_take', '/rest/v1/rpc/relay_take', '/rest/v1/feedback'],
    'no Auth call without a token; both buckets, then the insert');
  const row = JSON.parse(calls[2].body);
  assert.equal(row.user_id, null, 'an anonymous report names nobody, whatever the body says');
  assert.equal(row.email, 'typed@example.test', 'the address the reader typed is kept');
  assert.equal(row.rating, 4);
  assert.deepEqual(Object.keys(row).sort(), ['comment', 'email', 'lang', 'page', 'rating', 'ua', 'user_id'],
    'only the table\'s columns — created_at, id and anything else are the database\'s');
  assert.equal(calls[2].auth, 'Bearer ' + ENV.SUPABASE_SERVICE_ROLE_KEY, 'written as the service role');
  for (const c of calls) {
    assert.ok(!c.body.includes(CALLER_IP) && !c.body.includes('10.0.0.1'), `the caller's address reached ${c.url}: ${c.body}`);
  }
  const t0 = JSON.parse(calls[0].body);
  assert.equal(t0.p_scope, 'reader-reports:caller');
  assert.equal(t0.p_key, await RL.hashedCallerKey(req('POST'), ENV.SUPABASE_SERVICE_ROLE_KEY), 'keyed by the shared HMAC of the address');
  assert.equal(t0.p_capacity, FN.PER_READER_PER_HOUR * RL.READERS_PER_ADDRESS, 'an address may hold several readers');
  const t1 = JSON.parse(calls[1].body);
  assert.equal(t1.p_key, '*', 'the second bucket is project-wide');
  assert.equal(t1.p_capacity, FN.GLOBAL_PER_DAY);
  /* the publishable key in Authorization is not an account */
  const calls2 = stubBackend();
  assert.equal((await FN.handle(req('POST', FEEDBACK, { authorization: 'Bearer ' + ENV.SUPABASE_ANON_KEY }))).status, 201);
  assert.ok(!calls2.some((c) => c.url.endsWith('/auth/v1/user')), 'the publishable key is not sent to the Auth server as a user');
  assert.equal(JSON.parse(calls2.at(-1).body).user_id, null);
});

test('anon-write-guard ③ a signed-in report: user_id and email are the VERIFIED account\'s, a refused token is 401, not a quiet downgrade', async () => {
  let calls = stubBackend();
  const res = await FN.handle(req('POST', { ...BUG, user_id: '99999999-9999-4999-8999-999999999999', email: 'someone@else.test' }, { authorization: 'Bearer good-user-token' }));
  assert.equal(res.status, 201, await res.clone().text());
  assert.equal(calls[0].url, ENV.SUPABASE_URL + '/auth/v1/user', 'the token is asked of the Auth server first');
  const row = JSON.parse(calls.at(-1).body);
  assert.ok(calls.at(-1).url.endsWith('/rest/v1/bug_reports'));
  assert.equal(row.user_id, USER.id, 'the account the Auth server named, not the body\'s');
  assert.equal(row.email, USER.email);
  assert.deepEqual(row.diagnostics, BUG.diagnostics);
  const take = JSON.parse(calls.find((c) => c.url.endsWith('/rpc/relay_take')).body);
  assert.equal(take.p_key, 'uid:' + USER.id, 'a signed-in reader has their own bucket');
  assert.equal(take.p_capacity, FN.PER_READER_PER_HOUR);

  calls = stubBackend();
  const bad = await FN.handle(req('POST', FEEDBACK, { authorization: 'Bearer forged-or-expired' }));
  assert.equal(bad.status, 401);
  assert.ok(!calls.some((c) => /rest\/v1\/(feedback|bug_reports)|relay_take/.test(c.url)), 'a refused token spends no token and writes nothing');
});

test('anon-write-guard ③ the limiter fails closed and a refusal writes nothing; a failed insert is not reported as stored', async () => {
  let calls = stubBackend({ down: true });
  assert.equal((await FN.handle(req('POST', FEEDBACK))).status, 503, 'no limiter → no write');
  assert.ok(!calls.some((c) => /\/rest\/v1\/feedback$/.test(c.url)));
  calls = stubBackend({ allow: false });
  const limited = await FN.handle(req('POST', FEEDBACK));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1, 'the refusal says when to come back');
  assert.ok(!calls.some((c) => /\/rest\/v1\/feedback$/.test(c.url)), 'a refused caller wrote a row');
  stubBackend({ insertStatus: 409 });
  assert.equal((await FN.handle(req('POST', FEEDBACK))).status, 503, 'the database refused → the page is not told «sent»');
});

test('anon-write-guard ③ the per-caller key is the one shared rule — client-errors and reader-reports import it, neither keeps a copy', async () => {
  const CE = src('supabase/functions/client-errors/index.ts');
  const RR = src('supabase/functions/reader-reports/index.ts');
  for (const [name, s] of [['client-errors', CE], ['reader-reports', RR]]) {
    assert.match(s, /hashedCallerKey/, name + ' uses the shared HMAC key');
    assert.ok(!/crypto\.subtle\.importKey/.test(s), name + ' keeps no HMAC of its own');
  }
  assert.equal(await RL.hashedCallerKey(req('POST'), 'k', USER.id), 'uid:' + USER.id, 'a verified account keys by the account');
  assert.match(await RL.hashedCallerKey(req('POST'), 'k'), /^[0-9a-f]{32}$/);
  assert.notEqual(await RL.hashedCallerKey(req('POST'), 'k'), await RL.hashedCallerKey(req('POST', null, { 'x-forwarded-for': '198.51.100.9' }), 'k'));
});

/* ── ④ the page ──────────────────────────────────────────────────────────────────────────── */

/* sendReport is lifted out of the shipped file (the text that ships — tests/helpers/lift-function.mjs)
   and EVALUATED with a stub host and a recording fetch: what leaves the page is what is asserted. */
test('anon-write-guard ④ js/feedback.js sends both reports to reader-reports and never inserts through PostgREST', async () => {
  const code = codeOnly(src('js/feedback.js'));
  assert.ok(!/\.from\(\s*['"](feedback|bug_reports)['"]\s*\)/.test(code), 'no direct table write remains in the page');
  assert.match(code, /sendReport\('feedback',row\)/, 'the feedback form sends through it');
  assert.match(code, /sendReport\('bug',row\)/, 'and so does the bug reporter');
  /* the lifter starts at the word `function`; the declaration is `async function` */
  assert.match(code, /async function sendReport\(/);
  /* …and the deadline it reads, as shipped (a send that never answers must end: check:static fetch-deadline) */
  const deadline = /const SEND_DEADLINE_MS=\d+;/.exec(code);
  assert.ok(deadline, 'the send carries a deadline');
  const body = deadline[0] + '\nasync ' + liftFunction(code, 'sendReport');
  const win = { SUPABASE_URL: 'https://stub.supabase.test/' };
  const make = (fetchImpl, HOST) => new Function('window', 'fetch', 'HOST', body + '\nreturn sendReport;')(win, fetchImpl, HOST);
  const sent = [];
  const rec = async (u, init) => { sent.push({ u, init }); return { status: 201 }; };
  const DB = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  assert.equal(await make(rec, { user: { id: USER.id }, DB })('feedback', { rating: 5 }), true);
  assert.equal(sent[0].u, 'https://stub.supabase.test/functions/v1/reader-reports');
  assert.equal(sent[0].init.method, 'POST');
  assert.ok(sent[0].init.signal instanceof AbortSignal, 'the send can end');
  assert.equal(sent[0].init.headers.authorization, 'Bearer tok', 'a signed-in reader\'s token goes with it');
  assert.deepEqual(JSON.parse(sent[0].init.body), { rating: 5, kind: 'feedback' });
  await make(rec, { user: null, DB })('bug', { description: 'x' });
  assert.equal(sent[1].init.headers.authorization, undefined, 'a signed-out reader sends no Authorization');
  assert.equal(JSON.parse(sent[1].init.body).kind, 'bug');
  assert.equal(await make(async () => ({ status: 429 }), { user: null, DB })('feedback', { rating: 1 }), false,
    'a refusal is not «sent» — the bug reporter then keeps the report on the device');
  assert.equal(await make(async () => { throw new Error('offline'); }, { user: null, DB })('bug', {}), false);
});

/* ── ⑤ the migration ─────────────────────────────────────────────────────────────────────── */

test('anon-write-guard ⑤ the migration closes the direct INSERT at both layers and deletes nothing', () => {
  const sql = codeOnly(src('supabase/migrations/20260930090000_anon_write_guard.sql'), { lang: 'sql' });
  for (const t of ['feedback', 'bug_reports']) {
    assert.match(sql, new RegExp(`drop policy if exists ${t}_insert_any\\s+on public\\.${t};`), `${t}: the INSERT policy is dropped`);
    assert.match(sql, new RegExp(`revoke insert on table public\\.${t}\\s+from public, anon, authenticated;`), `${t}: the INSERT grant is revoked`);
  }
  assert.ok(!/\b(delete\s+from|truncate|drop\s+table|drop\s+column|update\s+public\.)/i.test(sql), 'non-destructive: no row or column is touched');
  assert.ok(!/create policy/i.test(sql), 'no new INSERT path for anon or authenticated');
});
