/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  security-audit — セキュリティ総点検で確かめた 6 件を、構造で直したことを評価で示す
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  元の欠陥（2026-10-23 実測）:
 *    ① client-errors の redact() のメール式は `@` の無い長い連続で 2 次になり（64 KiB で 2.8 s）、
 *       レート制限より前（parseBody → shapeReport）で走るので、未認証で CPU を食えた。同じ形が
 *       引用符（“…” 「…」 3.6 s）・topFrame（1.5 s）・UA の Safari 規則（1.6 s）にもあった。
 *    ② レート制限の鍵が 2 本あり（平文の callerKey と HMAC の hashedCallerKey）、平文側を使う関数は
 *       relay_rate_buckets に読者の IP を残していた。IPv6 は 1 アドレス 1 バケットで、同じ /64 の中で
 *       アドレスを回せば新しいバケットが作れた。
 *    ③ radiation-feed の from/to は Date.parse が数を返すかだけを見て、STUK の URL に連結されていた。
 *    ④ ?u= を受ける 5 本の relay のうち 3 本がホスト名しか見ず、ポートと userinfo を通した。
 *    ⑤ 問い合わせのメール判定が `a@b.c?bcc=x@y.z` を通し、管理画面の mailto: に連結されていた。
 *    ⑥ 退会は有効なトークンだけで実行された（利用者承認: 直近 10 分以内のログインを要求する）。
 *
 *  測るのは綴りではなく関数を評価した答え（#R505）。Edge Function は Deno.serve を捕まえ fetch を
 *  差し替えて、上流へ実際に何が出ていくかを見る。
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p) => pathToFileURL(join(ROOT, p)).href;

const S = await import(modUrl('supabase/functions/_shared/client-error-shape.js'));
const RL = await import(modUrl('supabase/functions/_shared/rate-limit.js'));
const RG = await import(modUrl('supabase/functions/_shared/relay-guard.js'));
const RAD = await import(modUrl('supabase/functions/_shared/radiation-sources.js'));
const INQ = await import(modUrl('supabase/functions/_shared/inquiry-shape.js'));
const RSI = await import(modUrl('supabase/functions/delete-account/recent-sign-in.js'));

/* a seeded generator, so a failure names an input that can be replayed */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const repeatTo = (unit, n) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);

/* ══ ① the scrubbers: the same output as before, in linear time ══════════════════════════════════
   THE ORACLE is the code as it was (copied here verbatim — it is the reference these must equal). */
function oldRedact(text, opts) {
  const o = opts || {};
  let s = String(text == null ? '' : text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g, '<token>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<token>')
    .replace(/(["'`])[^"'`\n]{25,}\1/g, '$1…$1')
    .replace(/“[^”\n]{25,}”/g, '“…”')
    .replace(/「[^」\n]{25,}」/g, '「…」');
  if (o.digits !== false) s = s.replace(/\d{6,}/g, '<n>');
  return s;
}
function oldTopFrame(stack) {
  for (const raw of String(stack || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /([^\s()@/]+?)(:\d+:\d+|:\d+)\)?\s*$/.exec(line);
    if (!m || !(/^at\s/.test(line) || line.includes('@'))) continue;
    const fn = /^at\s+(?:async\s+)?(?:new\s+)?([^\s(]+)\s+\(/.exec(line) || /^([^@\s]*)@/.exec(line);
    return ((fn && fn[1]) ? fn[1] + ' ' : '') + m[1] + m[2];
  }
  return '';
}
const OLD_SAFARI = /\bVersion\/(\d+)[.\d]*\s(?:Mobile\/\S+\s)?Safari\//;
const NEW_SAFARI_PROBE = (ua) => { const b = S.browserOf(ua); return /^Safari /.test(b) ? b.slice(7) : null; };

/* pieces that reach every branch of every pattern: addresses that are and are not, a JWT, a 32-run,
   quotes of each kind open and closed, long digit runs, newlines, and the characters at their edges */
const PIECES = ['a', 'Z', '9', '0', '.', '_', '%', '+', '-', '@', ' ', '\n', '\r', '"', "'", '`', '“', '”', '「', '」',
  'user.name+tag@example.com', 'x@y.co', 'a@b', '@.', 'a@b.c', 'eyJabcdefghijk', '.xyz', '1234567',
  'abcdefghijklmnopqrstuvwxyzABCDEF', '"' + 'q'.repeat(26) + '"', '“' + 'w'.repeat(25) + '”', '「' + 'k'.repeat(30) + '」',
  '“short”', '「短い」', ':', '/', '(', ')', 'mail@host.example.org', 'Ü', 'é'];
function randomText(r, maxPieces) {
  let s = '';
  const n = 1 + Math.floor(r() * maxPieces);
  for (let i = 0; i < n; i++) s += pick(r, PIECES);
  return s;
}

test('security-audit ① redact() answers exactly what the old patterns answered (random and edge cases)', () => {
  const r = rng(20261023);
  const edge = ['', 'a@b.cd', 'a@b.c', 'x@@y.zz', 'a.b@c.d.ef5', '1234567@x.yz', '@example.com', 'a@.com', 'a@-.zz',
    '“' + 'a'.repeat(25) + '”', '“' + 'a'.repeat(24) + '”', '““' + 'a'.repeat(30) + '”', '“' + 'a'.repeat(30) + '\n”',
    '「「「' + 'b'.repeat(40) + '」」', '"' + 'c'.repeat(30) + "'", repeatTo('a.', 300), repeatTo('1', 300) + '@x.yz',
    'mail me at Person.Name@Example.COM today', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig and more'];
  for (const t of edge) {
    assert.equal(S.redact(t), oldRedact(t), JSON.stringify(t));
    assert.equal(S.redact(t, { digits: false }), oldRedact(t, { digits: false }), JSON.stringify(t));
  }
  for (let i = 0; i < 20000; i++) {
    const t = randomText(r, 24);
    assert.equal(S.redact(t), oldRedact(t), 'differs on ' + JSON.stringify(t));
  }
});

test('security-audit ① topFrame() and the Safari rule answer what the old patterns answered', () => {
  const r = rng(7);
  const FRAME_PIECES = ['at ', 'async ', 'new ', 'fn', ' (', ')', 'https://h.example/a/', 'b.js', ':', '12', '3', '@', '/',
    ' ', '\t', 'x', '.', '(', '\n', 'index-abc.js:1:2', ':4:5)', 'Object.<anonymous>', '<anonymous>'];
  const edge = ['at f (https://x/a.js:10:20)', 'f@https://x/a.js:10:20', 'at f (:1:2)', 'at f (a:1:2:3)', 'at a1:2',
    'at x:1 )', 'at x:1)  ', 'at x:)', '@:1', 'at ' + repeatTo('a:1', 200), 'g@' + repeatTo('1', 50)];
  for (const t of edge) assert.equal(S.topFrame(t), oldTopFrame(t), JSON.stringify(t));
  for (let i = 0; i < 20000; i++) {
    let t = '';
    const n = 1 + Math.floor(r() * 14);
    for (let k = 0; k < n; k++) t += pick(r, FRAME_PIECES);
    assert.equal(S.topFrame(t), oldTopFrame(t), 'differs on ' + JSON.stringify(t));
  }
  const UA_PIECES = ['Version/', '1', '16', '.', '4', ' ', 'Mobile/15E148', 'Safari/', '604.1', 'x'];
  for (let i = 0; i < 20000; i++) {
    let ua = '';
    const n = 1 + Math.floor(r() * 10);
    for (let k = 0; k < n; k++) ua += pick(r, UA_PIECES);
    const m = OLD_SAFARI.exec(ua);
    assert.equal(NEW_SAFARI_PROBE(ua), m ? m[1] : null, 'differs on ' + JSON.stringify(ua));
  }
});

/* THE BOUND. 100 ms for a 64 KiB input (MAX_BODY_BYTES of client-errors — the most one request can
   carry). MEASURED 2026-10-23 on this machine: the old forms took 1,500–3,700 ms on these inputs, the
   new ones at most 8.8 ms (a whole shapeReport of 64 KiB message + stack + path, first run). 100 ms is
   over ten times that (room for a slow CI runner) and still fifteen times below the fastest of the
   quadratic ones — so it fails on the defect, not on the runner. */
const BOUND_MS = 100;
const N = 64 * 1024;
const HOSTILE = {
  'digits, no @': repeatTo('1', N),
  'a. run, no @': repeatTo('a.', N),
  'local@ repeated': repeatTo('a@', N),
  'opening curly quotes': repeatTo('“', N),
  'opening corner brackets': repeatTo('「', N),
  'curly + letter': repeatTo('“a', N),
  'one frame line': 'at ' + repeatTo('a', N),
  'frame of :1': 'at ' + repeatTo('a:1', N) + 'x',
  'url of :1': 'http://x' + repeatTo(':1', N) + 'a',
  'a 32-run of dashes': 'a' + repeatTo('-', N),
};
function timed(f) { const t = performance.now(); f(); return performance.now() - t; }

test('security-audit ① a 64 KiB hostile body is scrubbed in linear time, on every path the server runs', () => {
  for (const [name, s] of Object.entries(HOSTILE)) {
    for (const [what, f] of [
      ['redact', () => S.redact(s)],
      ['cleanMessage', () => S.cleanMessage(s)],
      ['cleanStack', () => S.cleanStack(s)],
      ['topFrame', () => S.topFrame(s)],
      ['shapeReport', () => S.shapeReport({ message: s, stack: s }, { path: s, release: s })],
    ]) {
      const ms = timed(f);
      assert.ok(ms < BOUND_MS, `${what} on «${name}» took ${ms.toFixed(1)} ms (bound ${BOUND_MS})`);
    }
  }
  for (const ua of ['Version/' + repeatTo('1', N), 'Version/1.' + repeatTo('1', N) + 'x', repeatTo('Version/1 Mobile/', N)]) {
    const ms = timed(() => S.browserOf(ua));
    assert.ok(ms < BOUND_MS, `browserOf took ${ms.toFixed(1)} ms`);
  }
});

/* ══ ② one caller key: hashed, by /64 for IPv6 ══════════════════════════════════════════════════ */
const reqFrom = (xff) => new Request('https://fn.test/', { headers: xff == null ? {} : { 'x-forwarded-for': xff } });
const keyOf = (xff, o) => RL.callerKey(reqFrom(xff), { secret: 'test-secret', ...(o || {}) });

test('security-audit ② callerKey never returns or contains the address, and an account comes first', async () => {
  for (const a of ['203.0.113.7', '2001:db8:1:2::1', '::ffff:203.0.113.7', 'unknown', 'uid:11111111-2222-4333-8444-555555555555']) {
    const k = await keyOf(a);
    assert.match(k, /^[0-9a-f]{32}$/, a);
    assert.ok(!k.includes(a) && !k.startsWith('uid:'), a);
  }
  const uid = '6F1D2C3B-0000-4000-8000-00000000ABCD';
  assert.equal(await keyOf('203.0.113.7', { uid }), 'uid:' + uid.toLowerCase());
  assert.equal(await keyOf('203.0.113.7', { uid: 'not-a-uuid' }), await keyOf('203.0.113.7'));
  assert.notEqual(await keyOf('203.0.113.7'), await keyOf('203.0.113.7', { secret: 'another-secret' }), 'the key is keyed by the secret');
  assert.equal(RL.hashedCallerKey, undefined, 'the second, parallel key function is gone');
});

test('security-audit ② IPv6 is one caller per /64; an IPv4-mapped address is its IPv4', async () => {
  assert.equal(await keyOf('2001:db8:1:2::1'), await keyOf('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), 'same /64 → same bucket');
  assert.equal(await keyOf('2001:db8:1:2::1'), await keyOf('2001:0DB8:0001:0002:0000:0000:0000:0001'), 'spelling does not matter');
  assert.equal(await keyOf('[2001:db8:1:2::9]'), await keyOf('2001:db8:1:2::1'), 'a bracketed address');
  assert.notEqual(await keyOf('2001:db8:1:2::1'), await keyOf('2001:db8:1:3::1'), 'another /64 → another bucket');
  assert.notEqual(await keyOf('2001:db8::1'), await keyOf('2001:db8:0:1::1'));
  assert.equal(await keyOf('::ffff:203.0.113.7'), await keyOf('203.0.113.7'), 'mapped, dotted');
  assert.equal(await keyOf('::ffff:cb00:7107'), await keyOf('203.0.113.7'), 'mapped, hex');
  assert.notEqual(await keyOf('203.0.113.7'), await keyOf('203.0.113.8'), 'IPv4 is per address');
  assert.equal(await keyOf('010.000.000.001'), await keyOf('10.0.0.1'));
  assert.equal(await keyOf(null), await keyOf(''), 'no address → one shared bucket');
  assert.equal(RL.callerNetwork('2001:db8:1:2:3:4:5:6'), 'v6:2001:db8:1:2::/64');
  assert.equal(RL.callerNetwork('::'), 'v6:0:0:0:0::/64');
  assert.equal(RL.callerNetwork('203.0.113.7'), 'v4:203.0.113.7');
});

test('security-audit ② the keyless relays\' gate stores the hash, and no function keys a bucket by the address', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify([{ allowed: true, remaining: 5 }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = (k) => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k] || '';
    assert.equal(await RL.callerGate(reqFrom('198.51.100.4'), {}, { scope: 'x-relay', readerPerMin: 1, env }), null);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent.length, 1);
  assert.match(sent[0].p_key, /^[0-9a-f]{32}$/);
  assert.equal(sent[0].p_key, await RL.callerKey(reqFrom('198.51.100.4'), { secret: 'svc' }));
  /* discovered, not listed: every function file that reads the caller's address does so through callerKey */
  const fnRoot = join(ROOT, 'supabase/functions');
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p); else if (/\.(?:js|ts)$/.test(n)) files.push(p);
    }
  })(fnRoot);
  const readers = files.filter((p) => /callerAddress\(|x-forwarded-for/.test(codeOnly(readFileSync(p, 'utf8'))))
    .map((p) => relative(ROOT, p).split('\\').join('/'));
  assert.deepEqual(readers, ['supabase/functions/_shared/rate-limit.js'], 'the caller address is read outside the one key function');
});

/* ══ the five ?u= relays and radiation-feed, evaluated with Deno.serve captured ═════════════════ */
const upstream = [];
let captured = null;
globalThis.Deno = { env: { get: () => '' }, serve: (a, b) => { captured = typeof a === 'function' ? a : b; } };
const handlers = new Map();   /* a module is evaluated once; its handler is kept */
async function handlerOf(fn) {
  if (handlers.has(fn)) return handlers.get(fn);
  captured = null;
  await import(modUrl('supabase/functions/' + fn + '/index.ts'));
  assert.equal(typeof captured, 'function', fn + ' did not call Deno.serve');
  handlers.set(fn, captured);
  return captured;
}
async function ask(handler, query) {
  upstream.length = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    upstream.push(String(url));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await handler(new Request('https://fn.test/?' + query));
  } finally {
    globalThis.fetch = realFetch;
  }
  return upstream.slice();
}

/* each relay with one URL its own client builds — the baseline that IS forwarded */
const RELAYS = {
  'news-relay': 'https://news.google.com/rss/search?q=x&hl=en-US&gl=US&ceid=US:en',
  'gdelt-relay': 'https://api.gdeltproject.org/api/v2/doc/doc?query=x&mode=artlist&format=json',
  'quotes-relay': 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d',
  'sv-cov': 'https://mts0.google.com/vt?lyrs=svv&x=0&y=0&z=0',
  'alerts-relay': 'https://feeds.meteoalarm.org/api/v1/warnings/feeds-germany',
};

test('security-audit ④ the five ?u= relays ask one origin rule, and none forwards a port, userinfo or plain http', async () => {
  for (const [fn, ok] of Object.entries(RELAYS)) {
    const host = new URL(ok).hostname;
    const h = await handlerOf(fn);
    const sentTo = (calls) => calls.filter((u) => new URL(u).hostname === host);
    assert.ok(sentTo(await ask(h, 'u=' + encodeURIComponent(ok))).length >= 1, fn + ' no longer forwards its own client\'s URL');
    for (const [why, bad] of [
      ['a port', ok.replace(host, host + ':8443')],
      ['an explicit default port is still the origin', null],
      ['userinfo', ok.replace('https://', 'https://user:pw@')],
      ['a user name alone', ok.replace('https://', 'https://user@')],
      ['plain http', ok.replace('https://', 'http://')],
      ['a trailing-dot host', ok.replace(host, host + '.')],
      ['a look-alike host', ok.replace(host, host + '.evil.example')],
    ]) {
      if (!bad) continue;
      assert.deepEqual(sentTo(await ask(h, 'u=' + encodeURIComponent(bad))), [], `${fn} forwarded ${why}: ${bad}`);
      assert.deepEqual((await ask(h, 'u=' + encodeURIComponent(bad))).filter((u) => /evil\.example/.test(u)), []);
    }
    /* `:443` on https is the default port, written out — the same origin, which URL normalises away */
    assert.ok(sentTo(await ask(h, 'u=' + encodeURIComponent(ok.replace(host, host + ':443')))).length >= 1, fn + ' refused :443');
    /* the relay's source asks the shared rule rather than keeping its own */
    assert.match(codeOnly(src('supabase/functions/' + fn + '/index.ts')), /allowedUpstream\(/, fn);
  }
  /* alerts-relay's CMA feed is the one upstream that is http (measured, see its UPSTREAMS) — still
     no port and no userinfo there */
  const alerts = await handlerOf('alerts-relay');
  const cma = 'http://www.nmc.cn/rest/findAlarm?pageNo=1&pageSize=10';
  assert.ok((await ask(alerts, 'u=' + encodeURIComponent(cma))).some((u) => new URL(u).hostname === 'www.nmc.cn'));
  for (const bad of [cma.replace('www.nmc.cn', 'www.nmc.cn:8080'), cma.replace('http://', 'http://a:b@')]) {
    assert.ok(!(await ask(alerts, 'u=' + encodeURIComponent(bad))).some((u) => new URL(u).hostname === 'www.nmc.cn'), bad);
  }
  /* the rule itself */
  assert.equal(RG.allowedUpstream('https://a.example/x', ['a.example']).hostname, 'a.example');
  assert.equal(RG.allowedUpstream('https://A.EXAMPLE/x', ['a.example']).hostname, 'a.example', 'the parser lower-cases the host');
  for (const bad of ['https://a.example:444/', 'https://u@a.example/', 'https://:p@a.example/', 'ftp://a.example/', 'https://b.a.example/', 'not a url']) {
    assert.equal(RG.allowedUpstream(bad, ['a.example']), null, bad);
  }
  assert.ok(RG.allowedUpstream('http://a.example/', ['a.example'], { schemes: ['https:', 'http:'] }));
});

/* ══ ③ radiation-feed: the window travels as instants ═══════════════════════════════════════════ */
test('security-audit ③ the series window is re-written from the instant it parses to; an injected suffix never reaches the URL', async () => {
  const inject = '2024-01-01 12:00 (&x=y#frag)';
  assert.ok(Number.isFinite(Date.parse(inject)), 'the premise: Date.parse reads this as an instant');
  assert.deepEqual(RAD.seriesWindow(inject, '2024-01-02T12:00:00Z', 0), { from: new Date(Date.parse(inject)).toISOString().slice(0, 19) + 'Z', to: '2024-01-02T12:00:00Z' });
  assert.equal(RAD.seriesWindow('not a date', null, 0), null);
  assert.equal(RAD.seriesWindow(null, 'nope', 0), null);
  const now = Date.UTC(2026, 9, 23, 12, 0, 0);
  assert.deepEqual(RAD.seriesWindow(null, null, now), { from: '2026-10-22T12:00:00Z', to: '2026-10-23T12:00:00Z' }, 'the defaults: now and a day before');
  /* the builder encodes whatever it is handed (the probe script calls it directly) */
  const fi = RAD.providerById('fi-stuk');
  const [u] = fi.series.urls({ code: '101004', from: inject, to: inject });
  assert.ok(!/[&#]x=y|#frag| /.test(u), u);
  assert.equal(new URL(u).searchParams.get('starttime'), inject, 'it arrives as one value, not as structure');
  /* and the function, evaluated: what goes upstream carries the canonical instant and nothing else */
  const h = await handlerOf('radiation-feed');
  const sent = await ask(h, 'mode=series&station=fi-stuk:101004&from=' + encodeURIComponent(inject) + '&to=' + encodeURIComponent('2024-01-02 00:00 (&y=z)'));
  const fmi = sent.filter((x) => new URL(x).hostname === 'opendata.fmi.fi');
  assert.equal(fmi.length, 1, JSON.stringify(sent));
  const q = new URL(fmi[0]).searchParams;
  assert.match(q.get('starttime'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(q.get('endtime'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(q.get('x'), null);
  assert.equal(q.get('y'), null);
  assert.equal(new URL(fmi[0]).hash, '');
});

/* ══ ⑤ the enquiry's reply address, at both ends ═══════════════════════════════════════════════ */
test('security-audit ⑤ a reply address cannot carry mailto: structure, and the console encodes it anyway', () => {
  for (const ok of ['desk@example.org', 'first.last+tag@sub.example.co.jp', "o'brien@example.ie", 'ü@exämple.de', 'a@b.cd']) {
    assert.ok(INQ.isReplyAddress(ok), ok);
  }
  for (const bad of ['a@b.c?bcc=x@y.z', 'a@b.c&cc=x', 'a@b.c,x@y.z', 'a@b.c;x@y.z', 'a@b', 'a@b.', 'a@.b', 'a@b..c',
    'a b@c.d', 'a@b.c#x', 'a%40b@c.d', 'a@b/c.d', '"a"@b.c', 'a@[1.2.3.4]', '<a@b.c>', 'a=b@c.d', 'a@b.c\n', '@b.c', 'a@', 'not-an-address']) {
    assert.ok(!INQ.isReplyAddress(bad), bad);
  }
  /* the console's Reply link, lifted from the file that ships and run */
  const mailtoReply = new Function('return ' + liftFunction(codeOnly(src('js/admin-inquiries.js')), 'mailtoReply'))();
  for (const addr of ['a@b.c?bcc=x@y.z', 'a@b.c,evil@y.z', 'a@b.c&cc=x@y.z', 'desk@example.org']) {
    const href = mailtoReply(addr);
    const u = new URL(href);
    assert.deepEqual([...u.searchParams.keys()], ['subject'], href);
    assert.ok(!/[?&,;#=]/.test(u.pathname), 'the recipient part carries structure: ' + href);
    assert.equal(decodeURIComponent(u.pathname), addr, 'and decodes back to the one address it was given');
  }
  assert.equal(mailtoReply('desk@example.org').split('?')[0], 'mailto:desk@example.org');
});

/* ══ ⑥ deleting the account needs a recent sign-in ═════════════════════════════════════════════ */
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => b64url({ alg: 'ES256', typ: 'JWT' }) + '.' + b64url(claims) + '.signature';

test('security-audit ⑥ the last sign-in (amr) must be within ten minutes — stale, absent and foreign tokens are refused', () => {
  const uid = '11111111-2222-4333-8444-555555555555';
  const now = Date.UTC(2026, 9, 23, 12, 0, 0);
  const sec = Math.floor(now / 1000);
  assert.equal(RSI.REAUTH_WINDOW_S, 600, 'the window the user approved');
  const verdict = (claims, who) => RSI.recentSignIn(jwt(claims), who || uid, now);
  assert.deepEqual(verdict({ sub: uid, amr: [{ method: 'password', timestamp: sec - 30 }] }), { ok: true, age: 30 });
  assert.equal(verdict({ sub: uid, amr: [{ method: 'oauth', timestamp: sec - 600 }] }).ok, true, 'Google is "oauth", judged the same way');
  assert.equal(verdict({ sub: uid, amr: [{ method: 'oauth', timestamp: sec - 601 }] }).reason, 'stale');
  assert.equal(verdict({ sub: uid, amr: [{ method: 'password', timestamp: sec - 86400 }, { method: 'totp', timestamp: sec - 5 }] }).ok, true, 'the newest method decides');
  assert.equal(verdict({ sub: uid }).reason, 'no_amr', 'no amr → refused (fails closed)');
  assert.equal(verdict({ sub: uid, amr: [] }).reason, 'no_amr');
  assert.equal(verdict({ sub: uid, amr: [{ method: 'password' }] }).reason, 'no_amr');
  assert.equal(verdict({ sub: uid, amr: [{ method: 'password', timestamp: 'soon' }] }).reason, 'no_amr');
  assert.equal(verdict({ sub: uid, amr: 'password' }).reason, 'no_amr');
  assert.equal(verdict({ sub: 'someone-else', amr: [{ method: 'password', timestamp: sec }] }).reason, 'other_account');
  assert.equal(RSI.recentSignIn('not.a-jwt', uid, now).reason, 'unreadable');
  assert.equal(RSI.recentSignIn('', uid, now).reason, 'unreadable');
  assert.equal(RSI.bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(RSI.bearerToken('Basic abc'), '');
  /* the function refuses BEFORE anything is purged, and the page leads to the sign-in sheet */
  const fn = codeOnly(src('supabase/functions/delete-account/index.ts'));
  const gate = fn.indexOf('recentSignIn(');
  assert.ok(gate > 0 && gate < fn.indexOf('delete_account_data') && gate < fn.indexOf('auth.admin.deleteUser'), 'the recency check is not ahead of the purge');
  assert.match(fn.slice(gate, fn.indexOf('delete_account_data')), /error: "reauth_required"/);
  const page = codeOnly(src('js/auth-ui.js'));
  const branch = page.slice(page.indexOf("'reauth_required'"), page.indexOf("'reauth_required'") + 400);
  assert.match(branch, /openAuthModal\(/, 'a refusal for an old sign-in does not lead to signing in again');
});

/* ══ ⑦ the project keys: the new generation first, read in one place ══════════════════════════
   Supabase retires the legacy anon / service_role JWTs by the end of 2026. Every function asked for
   SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY by name, so disabling them would have stopped all
   twenty-one at once. _shared/supabase-keys.js now prefers SUPABASE_SECRET_KEYS /
   SUPABASE_PUBLISHABLE_KEYS (both injected in production — measured 2026-10-23). */
const KEYS = await import(modUrl('supabase/functions/_shared/supabase-keys.js'));
test('security-audit ⑦ the new secret / publishable key wins; the legacy JWT is only the fallback', () => {
  const both = (k) => ({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_new' }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_new' }),
    SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy.service', SUPABASE_ANON_KEY: 'eyJ.legacy.anon',
  })[k] || '';
  assert.equal(KEYS.secretKey(both), 'sb_secret_new');
  assert.equal(KEYS.publishableKey(both), 'sb_publishable_new');
  assert.equal(KEYS.secretKeyKind(both), 'secret');
  const legacy = (k) => ({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy.service', SUPABASE_ANON_KEY: 'eyJ.legacy.anon' })[k] || '';
  assert.equal(KEYS.secretKey(legacy), 'eyJ.legacy.service');
  assert.equal(KEYS.publishableKey(legacy), 'eyJ.legacy.anon');
  assert.equal(KEYS.secretKeyKind(legacy), 'legacy');
  /* a named key other than "default", a bare key, and garbage */
  assert.equal(KEYS.secretKey((k) => (k === 'SUPABASE_SECRET_KEYS' ? '{"ops":"sb_secret_ops"}' : '')), 'sb_secret_ops');
  assert.equal(KEYS.secretKey((k) => (k === 'SUPABASE_SECRET_KEYS' ? 'sb_secret_bare' : '')), 'sb_secret_bare');
  assert.equal(KEYS.secretKey((k) => (k === 'SUPABASE_SECRET_KEYS' ? '{"default":"sb_publishable_wrong"}' : '')), '');
  assert.equal(KEYS.secretKeyKind(() => ''), 'none');
  /* a signed-out client's bearer is a public key of either generation — and never the secret */
  assert.ok(KEYS.isPublicKey(both, 'sb_publishable_new'));
  assert.ok(KEYS.isPublicKey(both, 'eyJ.legacy.anon'));
  assert.ok(!KEYS.isPublicKey(both, 'sb_secret_new'));
  assert.ok(!KEYS.isPublicKey(both, ''));
  assert.deepEqual(KEYS.serviceHeaders('sb_secret_new'), { apikey: 'sb_secret_new', authorization: 'Bearer sb_secret_new' });
});

test('security-audit ⑦ no function names a project-key variable except the one resolver (discovered)', () => {
  const fnRoot = join(ROOT, 'supabase/functions');
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p); else if (/\.(?:js|ts)$/.test(n)) files.push(p);
    }
  })(fnRoot);
  const NAMES = /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SUPABASE_SECRET_KEYS|SUPABASE_PUBLISHABLE_KEYS|SB_SECRET_KEY)\b/;
  const readers = files.filter((p) => NAMES.test(codeOnly(readFileSync(p, 'utf8'))))
    .map((p) => relative(ROOT, p).split('\\').join('/'));
  assert.deepEqual(readers, ['supabase/functions/_shared/supabase-keys.js'], 'a function reads a project key by name instead of through _shared/supabase-keys.js');
});

test('security-audit ⑦ delete-account proves the admin credential before it removes anything', () => {
  const fn = codeOnly(src('supabase/functions/delete-account/index.ts'));
  const check = fn.indexOf('auth.admin.getUserById');
  assert.ok(check > 0, 'no admin credential check');
  assert.ok(check < fn.indexOf('delete_account_data'), 'the admin credential is checked after the data is already gone');
  assert.ok(fn.indexOf('delete_account_data') < fn.indexOf('auth.admin.deleteUser'));
});
