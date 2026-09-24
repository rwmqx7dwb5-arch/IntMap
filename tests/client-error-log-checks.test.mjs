/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  client-error-log — エラー監視が設定されていないまま、何も記録されていなかった
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  元の欠陥: エラー監視は index.html の Sentry ローダーで、DSN が一度も設定されていなかった。
 *  ローダーは全訪問で 1 行目の `if(!dsn) return;` で帰り、**利用者のブラウザで起きた例外は
 *  どこにも記録されなかった**。本番を見ていたのは「ページが配信されているか」を 6 時間ごとに
 *  訊く uptime だけで、「動いているか」を訊くものは無かった。
 *
 *  ここで測るのは「ファイルがあるか」ではなく、**例外が実際にどこへ届くか**である。
 *  ソースを読むだけの検査は評価順序を見ない（#R505）ので、3 つとも実際に評価する。
 *    ① 本番のオリジンで投げられた例外は、洗われて client-errors へ送られる——reporter を
 *       偽の window で評価し、listener に ErrorEvent を渡して、送られた本文を読む。
 *       ローカル preview（127.0.0.1）からは 1 本も送られない。Sentry のローダーは消えている。
 *    ② 洗浄・fingerprint・セッション上限——共有の shape 関数と createReporter を評価する。
 *    ③ Edge Function——Deno と fetch を差し替えて handle() を呼び、拒否の形・DB に渡る値・
 *       **IP がどこにも書かれないこと**・fingerprint をサーバーが計算することを確かめる。
 *  DB 側（RLS・count の加算・保持）は supabase/tests/10_client_errors_test.sql（pgTAP）。
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p, q) => pathToFileURL(join(ROOT, p)).href + (q ? '?' + q : '');

const S = await import(modUrl('supabase/functions/_shared/client-error-shape.js'));
const R = await import(modUrl('js/client-error-report.js'));   // Node: no window → no listeners installed

const PROD = S.PRODUCTION_ORIGIN;
const STACK = [
  "TypeError: Cannot read properties of undefined (reading 'lat')",
  '    at renderCard (https://rwmqx7dwb5-arch.github.io/IntMap/assets/app-body-B3x9.js?v=2#frag:1:234567)',
  '    at HTMLButtonElement.<anonymous> (https://rwmqx7dwb5-arch.github.io/IntMap/assets/main-Q1.js:3:9)',
].join('\n');

/* ── ① 例外は届く／ローカルからは送らない／Sentry は消えた ───────────────────────────────── */

async function bootReporter(origin) {
  const listeners = {};
  const beacons = [];
  globalThis.window = {
    INTMAP_BUILD: '2026-09-25-client-error-log',
    SUPABASE_URL: 'https://stub.supabase.test/',
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  globalThis.document = {};
  globalThis.location = { origin, pathname: '/IntMap/' };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true; } },
  });
  /* a fresh evaluation of the SAME file — the query string only defeats the module cache */
  await import(modUrl('js/client-error-report.js', 'boot=' + Math.random()));
  /* the page's globals stay in place while its events are dispatched — the reporter reads
     window.SUPABASE_URL and location at report time, as it does in a browser */
  const done = () => { delete globalThis.window; delete globalThis.document; delete globalThis.location; };
  return { listeners, beacons, done };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test('client-error-log ① an exception thrown on the production page reaches client-errors, scrubbed', async () => {
  const { listeners, beacons, done } = await bootReporter(PROD);
  assert.equal((listeners.error || []).length, 1, 'the reporter listens for `error`');
  assert.equal((listeners.unhandledrejection || []).length, 1, 'the reporter listens for `unhandledrejection`');

  const err = new TypeError("Cannot read properties of undefined (reading 'lat')");
  err.stack = STACK;
  listeners.error[0]({ message: "Uncaught TypeError: Cannot read properties of undefined (reading 'lat')", error: err });
  await settle();
  assert.equal(beacons.length, 1, 'one exception → one report sent');
  assert.equal(beacons[0].url, 'https://stub.supabase.test/functions/v1/client-errors');
  const body = JSON.parse(await beacons[0].blob.text());
  assert.equal(beacons[0].blob.type, 'text/plain', 'a CORS-safelisted type, so the beacon needs no preflight');
  assert.equal(body.release, '2026-09-25-client-error-log');
  assert.equal(body.path, '/IntMap/');
  assert.equal(body.errors.length, 1);
  assert.equal(body.errors[0].kind, 'error');
  assert.equal(body.errors[0].message, "TypeError: Cannot read properties of undefined (reading 'lat')", 'Chromium\'s «Uncaught » prefix is dropped');
  assert.ok(!/[?#]/.test(body.errors[0].stack.replace(/<anonymous>/g, '')), 'no query or fragment survives in the stack');
  assert.match(body.errors[0].stack, /app-body-B3x9\.js:1:234567/, 'the frame keeps its line:column');

  /* the same defect again is not sent twice */
  listeners.error[0]({ message: 'Uncaught TypeError: Cannot read properties of undefined (reading \'lat\')', error: err });
  await settle();
  assert.equal(beacons.length, 1, 'the same fingerprint is sent once per page load');

  /* a rejection with an Error reason is reported; a network failure is not */
  const rej = new Error('boom in the layer loader'); rej.stack = 'Error: boom in the layer loader\n    at load (https://rwmqx7dwb5-arch.github.io/IntMap/assets/x.js:9:9)';
  listeners.unhandledrejection[0]({ reason: rej });
  listeners.unhandledrejection[0]({ reason: new TypeError('Failed to fetch') });
  listeners.unhandledrejection[0]({ reason: 'a bare string' });
  await settle();
  assert.equal(beacons.length, 2, 'the Error rejection was sent; the network failure and the non-Error reason were not');
  assert.equal(JSON.parse(await beacons[1].blob.text()).errors[0].kind, 'rejection');
  done();
});

test('client-error-log ① a local preview sends nothing — development and the test suite write no rows', async () => {
  for (const origin of ['http://127.0.0.1:4808', 'http://localhost:4173', 'https://example.pages.dev']) {
    const { listeners, beacons, done } = await bootReporter(origin);
    const e = new Error('local failure'); e.stack = 'Error: local failure\n    at f (http://127.0.0.1:4808/src/x.js:1:1)';
    listeners.error[0]({ message: 'Uncaught Error: local failure', error: e });
    await settle();
    done();
    assert.equal(beacons.length, 0, `${origin} sent a report`);
  }
});

test('client-error-log ① the dormant Sentry loader is gone, and the reporter is on the boot path', () => {
  const html = src('index.html');
  assert.doesNotMatch(html, /INTMAP_SENTRY_DSN|intmap-sentry-dsn|Sentry\.init/, 'the Sentry loader is still in index.html');
  const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  assert.doesNotMatch(csp, /sentry/i, 'the CSP still allows the Sentry CDN');
  assert.match(src('src/main.js'), /^import '\.\.\/js\/client-error-report\.js';$/m, 'src/main.js does not import the reporter');
  /* the one definition is shared, not copied: the reporter imports the Edge Function's shape file */
  assert.match(src('js/client-error-report.js'), /from '\.\.\/supabase\/functions\/_shared\/client-error-shape\.js'/);
  assert.match(src('supabase/functions/client-errors/index.ts'), /from "\.\.\/_shared\/client-error-shape\.js"/);
});

/* ── ② 洗浄・fingerprint・上限 ─────────────────────────────────────────────────────────── */

test('client-error-log ② query strings and fragments are removed from the path, the message and the stack', () => {
  assert.equal(S.cleanPath('https://rwmqx7dwb5-arch.github.io/IntMap/?lat=35.6&lng=139#layer=quakes'), '/IntMap/');
  assert.equal(S.cleanPath('/IntMap/admin.html?code=abc'), '/IntMap/admin.html');
  assert.equal(S.cleanPath('/IntMap/#access_token=eyJabc'), '/IntMap/');
  const shaped = S.shapeReport({
    kind: 'error',
    message: 'Load of https://api.example.test/v1/q?token=SECRET&user=me#frag failed for a@b.example',
    stack: STACK,
  }, { release: '2026-09-25-client-error-log', path: '/IntMap/?q=secret' });
  assert.ok(!/SECRET|user=me|frag|a@b\.example/.test(JSON.stringify(shaped)), 'a query, fragment or e-mail address survived: ' + JSON.stringify(shaped));
  assert.match(shaped.message, /https:\/\/api\.example\.test\/v1\/q failed for <email>/);
  assert.equal(shaped.path, '/IntMap/');
  assert.equal(shaped.frame, 'renderCard app-body-B3x9.js:1:234567', 'the top frame is file + position, without origin or query');
  /* a long quoted string (possibly something typed) and a JWT are masked */
  const typed = S.cleanMessage('SyntaxError: "my home address is 1 Example Street" is not valid JSON; key eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig');
  assert.ok(!/Example Street|eyJhbGci/.test(typed), typed);
  /* the release must look like a build id, or it is dropped */
  assert.equal(S.cleanRelease('2026-09-25-client-error-log'), '2026-09-25-client-error-log');
  assert.equal(S.cleanRelease('<script>'), '');
});

test('client-error-log ② the fingerprint is stable for one defect and distinct for another', async () => {
  const a1 = S.shapeReport({ kind: 'error', message: 'RangeError: index 12 out of range', stack: STACK }, {});
  const a2 = S.shapeReport({ kind: 'error', message: 'RangeError: index 907 out of range', stack: STACK.replace('?v=2#frag', '?v=3') }, { path: '/IntMap/?other=1' });
  const f1 = await S.fingerprint(a1);
  assert.match(f1, /^[0-9a-f]{32}$/, 'the shape the table\'s CHECK requires');
  assert.equal(await S.fingerprint(a1), f1, 'the same report hashes the same twice');
  assert.equal(await S.fingerprint(a2), f1, 'a different number in the message, query or page is still the same defect');
  const elsewhere = S.shapeReport({ kind: 'error', message: 'RangeError: index 12 out of range', stack: STACK.replace(':1:234567', ':1:99') }, {});
  assert.notEqual(await S.fingerprint(elsewhere), f1, 'the same message at another position is another defect');
  const asRejection = S.shapeReport({ kind: 'rejection', message: 'RangeError: index 12 out of range', stack: STACK }, {});
  assert.notEqual(await S.fingerprint(asRejection), f1, 'an error and a rejection are kept apart');
});

test('client-error-log ② one page load sends at most MAX_PER_SESSION reports, and each fingerprint once', async () => {
  const sent = [];
  const rep = R.createReporter({ origin: PROD, release: 'r', path: () => '/IntMap/', endpoint: () => 'https://x/functions/v1/client-errors', send: (u, b) => sent.push(b) });
  const verdicts = [];
  for (let i = 0; i < S.MAX_PER_SESSION + 5; i++) {
    /* distinct defects: different top frames */
    verdicts.push(await rep.report({ kind: 'error', message: 'Error: defect', stack: `Error: defect\n    at f (https://h/a.js:${i + 1}:1)` }));
  }
  assert.equal(sent.length, S.MAX_PER_SESSION, `${sent.length} reports left one page load`);
  assert.equal(verdicts.filter((v) => v === 'capped').length, 5);
  assert.equal(await rep.report({ kind: 'error', message: 'Error: defect', stack: 'Error: defect\n    at f (https://h/a.js:1:1)' }), 'capped');

  const rep2 = R.createReporter({ origin: PROD, release: 'r', path: () => '/', endpoint: () => 'https://x', send: () => true });
  assert.equal(await rep2.report({ kind: 'error', message: 'Error: once', stack: '' }), 'sent');
  assert.equal(await rep2.report({ kind: 'error', message: 'Error: once', stack: '' }), 'duplicate');
  assert.equal(await rep2.report({ kind: 'error', message: 'Failed to fetch', stack: '' }), 'dropped');
  /* a rejection whose reason is not an Error is described by its type, never by its value (it may be anything) */
  assert.deepEqual(R.fromEvent({ reason: 'the text someone typed' }, 'rejection'), { kind: 'rejection', message: 'Non-Error promise rejection', stack: '' });
  assert.equal(await rep2.report(R.fromEvent({ reason: { any: 'value' } }, 'rejection')), 'dropped');
  assert.equal(R.fromEvent({ message: 'Uncaught RangeError: r', error: null }, 'error').message, 'RangeError: r');
  assert.equal(await rep2.report({ kind: 'error', message: 'x', stack: 'x\n    at f (chrome-extension://abc/c.js:1:1)' }), 'dropped', 'an extension\'s defect is not ours');
  const off = R.createReporter({ origin: 'http://127.0.0.1:4808', send: () => { throw new Error('must not send'); } });
  assert.equal(await off.report({ kind: 'error', message: 'Error: local' }), 'off');
});

test('client-error-log ② the browser is a name and a major version, never the User-Agent string', () => {
  assert.equal(S.browserOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.80 Safari/537.36'), 'Chrome 140');
  assert.equal(S.browserOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'), 'Edge 140');
  assert.equal(S.browserOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'), 'Safari 18');
  assert.equal(S.browserOf('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'), 'Firefox 131');
  assert.equal(S.browserOf('curl/8.4.0'), 'Other');
});

/* ── ③ Edge Function を評価する ──────────────────────────────────────────────────────── */

const ENV = { SUPABASE_URL: 'https://stub.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key' };
globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: () => {} };
const FN = await import(modUrl('supabase/functions/client-errors/index.ts'));

const CALLER_IP = '203.0.113.77';
function req(method, body, headers) {
  return new Request('https://stub.supabase.test/functions/v1/client-errors', {
    method,
    headers: { origin: PROD, 'x-forwarded-for': CALLER_IP + ', 10.0.0.1', 'user-agent': 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', ...(headers || {}) },
    body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}
/* fetch stub: every RPC the function makes is recorded; relay_take answers per `take` */
function stubDb(opts) {
  const o = opts || {};
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const name = String(url).split('/rpc/')[1];
    calls.push({ name, url: String(url), body: init && init.body ? String(init.body) : '' });
    if (o.down) throw new Error('connect ECONNREFUSED');
    if (name === 'relay_take') return new Response(JSON.stringify([{ allowed: o.allow !== false, remaining: 5 }]), { status: 200 });
    if (name === 'record_client_error') return new Response(JSON.stringify(o.verdict || 'inserted'), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  return calls;
}
const report = (over) => ({ release: '2026-09-25-client-error-log', path: '/IntMap/?lat=1', errors: [{ kind: 'error', message: 'TypeError: x is undefined', stack: STACK, ...(over || {}) }] });

test('client-error-log ③ the function refuses what it must refuse, before touching the database', async () => {
  const calls = stubDb();
  assert.equal((await FN.handle(req('GET'))).status, 405, 'GET');
  assert.equal((await FN.handle(req('POST', report(), { origin: 'https://evil.example' }))).status, 403, 'a foreign Origin');
  const pre = await FN.handle(req('OPTIONS', null, { origin: 'https://evil.example' }));
  assert.equal(pre.status, 403);
  assert.equal(pre.headers.get('access-control-allow-origin'), null, 'a foreign origin is not even allowed to read the refusal');
  const ok = await FN.handle(req('OPTIONS'));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), PROD, 'the allowed origin is echoed, never *');
  assert.equal((await FN.handle(req('POST', 'x'.repeat(FN.MAX_BODY_BYTES + 1)))).status, 413, 'an oversized body');
  assert.equal((await FN.handle(req('POST', '{not json'))).status, 400, 'malformed JSON');
  const eleven = { errors: Array.from({ length: S.MAX_PER_REQUEST + 1 }, (_, i) => ({ message: 'E' + i })) };
  assert.equal((await FN.handle(req('POST', eleven))).status, 400, 'more than MAX_PER_REQUEST reports');
  const benign = await FN.handle(req('POST', report({ message: 'Failed to fetch' })));
  assert.equal(benign.status, 202);
  assert.deepEqual(await benign.json(), { accepted: 0 }, 'a benign report is accepted and not stored');
  assert.equal(calls.length, 0, 'none of the above reached the database');
  /* the local preview origin is accepted by the function (the client is what never sends from it) */
  assert.equal((await FN.handle(req('OPTIONS', null, { origin: 'http://127.0.0.1:4808' }))).status, 204);
});

test('client-error-log ③ a report is stored with a server-computed fingerprint, and the caller\'s IP is written nowhere', async () => {
  const calls = stubDb();
  const forged = report({ fingerprint: 'ffffffffffffffffffffffffffffffff' });
  const res = await FN.handle(req('POST', forged));
  assert.equal(res.status, 202, await res.clone().text());
  assert.deepEqual(calls.map((c) => c.name), ['relay_take', 'relay_take', 'record_client_error'], 'both buckets are taken BEFORE the write');
  const rec = JSON.parse(calls[2].body);
  const expected = await S.fingerprint(S.shapeReport(forged.errors[0], forged));
  assert.equal(rec.p_fingerprint, expected, 'the fingerprint is the server\'s, not the body\'s');
  assert.notEqual(rec.p_fingerprint, 'ffffffffffffffffffffffffffffffff');
  assert.equal(rec.p_path, '/IntMap/', 'the page path lost its query');
  assert.equal(rec.p_browser, 'Chrome 140', 'the User-Agent is reduced to a name and major version');
  assert.equal(rec.p_max_rows, FN.MAX_ROWS);
  for (const c of calls) {
    assert.ok(!c.body.includes(CALLER_IP), `the caller's address reached the database in ${c.name}: ${c.body}`);
    assert.ok(!c.body.includes('10.0.0.1'));
  }
  /* the per-caller bucket is keyed by an HMAC of the address: stable per address, not the address */
  const k1 = JSON.parse(calls[0].body).p_key;
  assert.match(k1, /^[0-9a-f]{32}$/);
  assert.equal(await FN.callerKey(req('POST'), ENV.SUPABASE_SERVICE_ROLE_KEY), k1);
  assert.notEqual(await FN.callerKey(req('POST', null, { 'x-forwarded-for': '198.51.100.1' }), ENV.SUPABASE_SERVICE_ROLE_KEY), k1);
  assert.equal(JSON.parse(calls[1].body).p_key, '*', 'the second bucket is project-wide');
});

test('client-error-log ③ the limiter fails closed, and a refusal writes nothing', async () => {
  let calls = stubDb({ down: true });
  assert.equal((await FN.handle(req('POST', report()))).status, 503, 'no limiter → no write');
  assert.ok(!calls.some((c) => c.name === 'record_client_error'));
  calls = stubDb({ allow: false });
  assert.equal((await FN.handle(req('POST', report()))).status, 429);
  assert.ok(!calls.some((c) => c.name === 'record_client_error'), 'a refused caller wrote a row');
});

/* ── ④ 表は個人を識別する列を持たず、保持は方針と同じ 30 日 ─────────────────────────── */

test('client-error-log ④ the table has no column for an identity, and the policy states the 30 days in both languages', () => {
  const sql = src('supabase/migrations/20260925110000_client_errors.sql');
  const table = /create table if not exists public\.client_errors \(([\s\S]*?)\n\);/.exec(sql);
  assert.ok(table, 'the migration creates public.client_errors');
  const cols = [...table[1].matchAll(/^\s*([a-z_]+)\s+(text|bigint|timestamptz|inet|uuid|jsonb)/gm)].map((m) => m[1]);
  assert.deepEqual(cols.sort(), ['browser', 'count', 'fingerprint', 'first_seen', 'kind', 'last_seen', 'message', 'path', 'release', 'stack']);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /using \(\(select public\.is_admin\(\)\)\)/, 'reading is an admin\'s');
  assert.match(sql, /grant\s+execute on function public\.record_client_error\([^)]*\)\s+to service_role/);
  assert.match(sql, /cron\.schedule\('client-errors-purge', '17 3 \* \* \*', 'select public\.purge_client_errors\(30\)'\)/);
  const legal = src('js/legal-text.js');
  assert.match(legal, /Error records are deleted 30 days after the same error last occurred/);
  assert.match(legal, /エラー記録は、同じエラーが最後に発生してから30日後に削除します/);
  assert.match(legal, /Your IP address, your account, the query string or fragment of any address, and anything you typed are not recorded/);
});
