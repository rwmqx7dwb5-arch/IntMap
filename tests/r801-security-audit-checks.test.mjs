// ============================================================================
//  tests/r801-security-audit-checks.test.mjs — the September 2026 security audit
// ----------------------------------------------------------------------------
//  What the audit found and this round closed, measured where it can be measured by running
//  the code rather than reading it:
//    ① a bounded fetch keeps its deadline over the BODY, not only the headers, and caps bytes;
//    ② redirects are inspected hop by hop (same https origin, or the caller's own rule), bounded;
//    ③ ai-proxy settles a turn before answering and refunds only the call that charged;
//    ④ the request body of ai-proxy is read through the capped reader, and monitor-run reads
//       its body only after the caller is known;
//    ⑤ no Edge Function puts the Gemini key in a query string;
//    ⑥ the ledger migration refuses to refund a settled turn in one atomic statement;
//    ⑦ 'unsafe-eval' in the page CSP is still REQUIRED (Cesium bundles knockout, which evaluates
//       `(0,eval)("this")` at load — measured 2026-09-18: without it the 3-D engine never starts).
//       The day Cesium stops needing it this test fails, which is the signal to remove it.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const guard = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/relay-guard.js')).href);

/* A fetch stub: `plan` maps a URL to { status, headers, body } where body is a string, a
   Uint8Array, or an async generator of chunks (to make the body slow or endless). */
function stubFetch(plan, calls) {
  return async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: (init && init.method) || 'GET' });
    const p = typeof plan === 'function' ? plan(u, init) : plan[u];
    if (!p) throw new TypeError('unplanned ' + u);
    const signal = init && init.signal;
    let body;
    if (typeof p.body === 'function') {
      const gen = p.body();
      body = new ReadableStream({
        async pull(ctl) {
          if (signal && signal.aborted) { ctl.error(new DOMException('aborted', 'AbortError')); return; }
          const { value, done } = await gen.next();
          if (done) ctl.close(); else ctl.enqueue(value);
        },
      });
    } else body = p.body == null ? null : p.body;
    return new Response(body, { status: p.status || 200, headers: p.headers || {} });
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bytes = (n) => new Uint8Array(n);

test('R801 ① fetchBounded: the deadline covers the body, and the byte ceiling cuts a stream', async () => {
  const real = globalThis.fetch;
  try {
    const calls = [];
    globalThis.fetch = stubFetch((u) => {
      if (u.endsWith('/slow')) return { body: async function* () { yield bytes(10); await sleep(400); yield bytes(10); } };
      if (u.endsWith('/big')) return { body: async function* () { for (let i = 0; i < 50; i++) yield bytes(1024); } };
      if (u.endsWith('/ok')) return { body: '{"a":1}', headers: { 'content-type': 'application/json' } };
      if (u.endsWith('/hop')) return { status: 302, headers: { location: 'https://x.test/ok' } };
      return null;
    }, calls);
    await assert.rejects(guard.fetchBounded('https://x.test/slow', { method: 'POST' }, { timeoutMs: 120, maxBytes: 1 << 20 }),
      (e) => e instanceof guard.RelayError && e.code === 'upstream_timeout', 'a body slower than the deadline must time out, not hang');
    await assert.rejects(guard.fetchBounded('https://x.test/big', {}, { timeoutMs: 5000, maxBytes: 8 * 1024 }),
      (e) => e instanceof guard.RelayError && e.code === 'upstream_too_large', 'a streamed body past the ceiling must be refused');
    const r = await guard.fetchBounded('https://x.test/ok', { method: 'POST' }, { timeoutMs: 5000, maxBytes: 1 << 20 });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { a: 1 }, 'the caller still gets a Response with .json()');
    await assert.rejects(guard.fetchBounded('https://x.test/hop', { method: 'POST' }, { timeoutMs: 5000, maxBytes: 1 << 20 }),
      (e) => e instanceof guard.RelayError && e.code === 'upstream_redirect', 'a provider POST is never redirected');
  } finally { globalThis.fetch = real; }
});

test('R801 ② followRedirects: each hop is inspected, bounded, and not followed off-origin', async () => {
  const real = globalThis.fetch;
  try {
    const calls = [];
    const plan = {
      'https://a.test/1': { status: 302, headers: { location: '/2' } },
      'https://a.test/2': { status: 301, headers: { location: 'https://a.test/3' } },
      'https://a.test/3': { body: 'done' },
      'https://a.test/off': { status: 302, headers: { location: 'https://evil.test/x' } },
      'https://a.test/http': { status: 302, headers: { location: 'http://a.test/3' } },
      'https://a.test/port': { status: 302, headers: { location: 'https://a.test:8443/3' } },
      'https://a.test/loop': { status: 302, headers: { location: 'https://a.test/loop' } },
      'https://evil.test/x': { body: 'never' },
    };
    globalThis.fetch = stubFetch(plan, calls);
    const ok = await guard.fetchGuarded('https://a.test/1', { timeoutMs: 5000 });
    assert.equal(ok.text(), 'done', 'same-origin hops are followed');
    for (const start of ['https://a.test/off', 'https://a.test/http', 'https://a.test/port', 'https://a.test/loop']) {
      await assert.rejects(guard.fetchGuarded(start, { timeoutMs: 5000 }),
        (e) => e instanceof guard.RelayError && e.code === 'upstream_redirect', start + ' must not be followed');
    }
    assert.ok(!calls.some((c) => c.url.startsWith('https://evil.test/')), 'the off-origin target was fetched');
    const loops = calls.filter((c) => c.url === 'https://a.test/loop').length;
    assert.equal(loops, guard.MAX_REDIRECTS + 1, 'a redirect loop must stop at MAX_REDIRECTS hops');
    /* the caller's own allow-list decides when it is given */
    calls.length = 0;
    const r = await guard.fetchGuarded('https://a.test/off', { timeoutMs: 5000, allowRedirect: (next) => next.hostname === 'evil.test' });
    assert.equal(r.text(), 'never', 'allowRedirect hands the hop to the caller');
    /* and every fetch it issues is manual, never the platform's silent follow */
    const src = read('supabase/functions/_shared/relay-guard.js');
    assert.doesNotMatch(codeOnly(src), /redirect:\s*"follow"/, 'a silent follow survives somewhere');
  } finally { globalThis.fetch = real; }
});

test('R801 ③ ai-proxy settles the turn before answering and refunds only the call that charged', () => {
  const proxy = codeOnly(read('supabase/functions/ai-proxy/index.ts'));
  const settleDef = proxy.indexOf('const settle = async');
  assert.ok(settleDef > 0, 'no settle() in ai-proxy');
  assert.match(proxy, /db\.rpc\("settle_ai_turn"/, 'settle_ai_turn is never called');
  const settleCall = proxy.indexOf('await settle();');
  assert.ok(settleCall > 0, 'settle() is never awaited');
  assert.match(proxy.slice(settleCall, settleCall + 80), /await settle\(\);\s*return json\(\{/, 'settle() must run at the success return, immediately before the answer leaves');
  const refund = proxy.slice(proxy.indexOf('const refund = async'), proxy.indexOf('const settle = async'));
  assert.match(refund, /if \(isDev \|\| !charged\) return;/, 'a call that did not charge must not ask for a refund');
  assert.match(refund, /refund_ai_turn/, 'the turn is still released with the charge (#R318)');
});

test('R801 ④ request bodies: ai-proxy reads through the capped reader, monitor-run only after auth', () => {
  const proxy = codeOnly(read('supabase/functions/ai-proxy/index.ts'));
  assert.match(proxy, /readCapped\(req, MAX_BODY_BYTES\)/);
  assert.doesNotMatch(proxy, /req\.(arrayBuffer|json|text)\(\)/, 'an unbounded body read survives in ai-proxy');
  const mon = codeOnly(read('supabase/functions/monitor-run/index.ts'));
  assert.doesNotMatch(mon, /req\.(arrayBuffer|json|text)\(\)/, 'an unbounded body read survives in monitor-run');
  const getUser = mon.indexOf('userClient.auth.getUser()');
  const readBody = mon.indexOf('await readPayload()');
  assert.ok(getUser > 0 && readBody > getUser, 'monitor-run must verify the caller before it reads the body');
  assert.doesNotMatch(mon, /message: claimErr\.message/, 'the database error text must not reach the caller');
  assert.doesNotMatch(mon, /error_detail: String\(\(e as Error\)\?\.message/, 'an exception message must not be stored where the owner reads it');
  /* the provider ceiling is ONE number in two files */
  const a = proxy.match(/const PROVIDER_MAX_BYTES = ([^;]+);/);
  const b = mon.match(/const PROVIDER_MAX_BYTES = ([^;]+);/);
  assert.ok(a && b, 'PROVIDER_MAX_BYTES is missing from one of the two');
  assert.equal(a[1].trim(), b[1].trim(), 'ai-proxy and monitor-run must cap the provider answer at the same size');
});

test('R801 ⑤ no Edge Function carries the Gemini key in a query string', () => {
  const dir = join(ROOT, 'supabase/functions');
  const offenders = [];
  for (const name of readdirSync(dir)) {
    let src;
    try { src = readFileSync(join(dir, name, 'index.ts'), 'utf8'); } catch (_) { continue; }
    const code = codeOnly(src);
    if (/[?&]key=/.test(code) && /generativelanguage\.googleapis\.com/.test(code)) offenders.push(name);
  }
  assert.deepEqual(offenders, [], 'these functions put the key in the URL');
});

test('R801 ⑥ the ledger migration refuses a settled turn atomically and revokes what RLS cannot see', () => {
  const mig = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => /r801_quota_ledger/.test(f));
  assert.ok(mig, 'the migration is missing');
  const sql = read('supabase/migrations/' + mig).toLowerCase();
  assert.match(sql, /add column if not exists succeeded boolean not null default false/);
  assert.match(sql, /create or replace function public\.settle_ai_turn\(p_user uuid, p_turn text\)/);
  assert.match(sql, /delete from public\.ai_turns t\s+where t\.user_id = p_user and t\.turn_key = v_key and not t\.succeeded\s+returning t\.charged, t\.usage_date into v_charged, v_date;/,
    'the refund must be ONE delete … returning, guarded by succeeded');
  assert.doesNotMatch(sql.slice(sql.indexOf('function public.refund_ai_turn')), /select t\.charged into v_charged/, 'the old SELECT-then-DELETE survives');
  assert.match(sql, /revoke truncate, references, trigger on public\.%i from anon, authenticated/, 'the schema-wide revoke loop is missing');
  assert.match(sql, /grant\s+execute on function public\.settle_ai_turn\(uuid, text\) to service_role/);
  assert.match(sql, /with check \(user_id is null or user_id = \(select auth\.uid\(\)\)\)/, 'feedback/bug_reports still accept any user_id');
  assert.match(sql, /grant update \(title, body, img, lat, lng, category, edited_at\) on public\.community_posts/, 'the author grant is not column-scoped');
});

test("R801 ⑦ 'unsafe-eval' in the page CSP is still required by the bundled Cesium (knockout)", () => {
  const html = read('index.html');
  const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  const script = (csp.match(/script-src[^;]*/) || [''])[0];
  let cesium = '';
  try { cesium = readFileSync(join(ROOT, 'node_modules/cesium/Build/Cesium/Cesium.js'), 'utf8'); } catch (_) { cesium = ''; }
  if (!cesium) return;   /* no node_modules on this checkout: nothing to measure the reason against */
  const needsEval = cesium.includes('(0,eval)("this")') || /new Function\("return "/.test(cesium);
  if (needsEval) {
    assert.match(script, /'unsafe-eval'/, "Cesium still evaluates code at load; removing 'unsafe-eval' breaks the 3-D engine (measured #R801)");
  } else {
    assert.doesNotMatch(script, /'unsafe-eval'/, "Cesium no longer needs eval — remove 'unsafe-eval' from index.html's CSP");
  }
});
