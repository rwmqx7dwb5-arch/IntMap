/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  anonymous-usage-counts — 自前の匿名集計だけでマーケティングの効果を測る
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  利用者の決定（2026-10-01）: Cookie なし・IP や個人を保存しない・Supabase に日別・流入元・使われた
 *  機能の**件数だけ**。ここで測るのは「ファイルがあるか」ではなく、**何が届き、何が届かないか**。
 *  ソースを読むだけの検査は評価順序を見ない（#R505）ので、3 つとも実際に評価する。
 *    ① 宣言（supabase/functions/usage-count/shape.js）——許可外の metric・形の悪い dimension を捨てる。
 *       ブラウザとサーバーが同じファイルを import していること。
 *    ② ブラウザ（js/usage-counts.js）——偽の window で評価し、ページが隠れたときに送られる本文を読む。
 *       DNT / GPC / 設定オフ / ローカル preview では 1 本も送らない。オフは未送信分を捨てる。
 *    ③ Edge Function（usage-count）——Deno と fetch を差し替えて handle() を呼び、拒否の形・DB に渡る
 *       値・**IP・User-Agent・送られてきた個人情報がどこにも書かれないこと**・レート制限を確かめる。
 *  DB 側（RLS・加算・日別の上限・保持）は supabase/tests/15_usage_counts_test.sql（pgTAP）。
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p, q) => pathToFileURL(join(ROOT, p)).href + (q ? '?' + q : '');

const S = await import(modUrl('supabase/functions/usage-count/shape.js'));
const U = await import(modUrl('js/usage-counts.js'));          // Node: no window → nothing installed
const CE = await import(modUrl('supabase/functions/_shared/client-error-shape.js'));
const M = await import(modUrl('js/layer-manifest.js'));
const PROD = CE.PRODUCTION_ORIGIN;

/* ── ① 宣言 ──────────────────────────────────────────────────────────────────────────── */

test('anonymous-usage-counts ① an undeclared metric, or a dimension its rule refuses, is not counted', () => {
  assert.equal(S.acceptRow('ip', '203.0.113.7', 1), null, 'an undeclared metric');
  assert.equal(S.acceptRow('user_id', '11111111-1111-1111-1111-111111111111', 1), null);
  assert.equal(S.acceptRow('question', 'where is my house', 1), null);
  assert.equal(S.acceptRow('__proto__', '', 1), null, 'a prototype key is not a metric');
  assert.equal(S.acceptRow('lang', 'de', 1), null, 'lang is en / jp / other only');
  assert.equal(S.acceptRow('device', 'Mozilla/5.0 (iPhone)', 1), null, 'device is mobile / desktop only');
  assert.equal(S.acceptRow('feature', 'export', 1), null, 'an undeclared feature');
  assert.equal(S.acceptRow('utm_campaign', 'a.person@example.com', 1), null, 'a tag that carries an e-mail address');
  assert.equal(S.acceptRow('utm_source', 'news letter', 1), null, 'a space');
  assert.equal(S.acceptRow('utm_source', 'x'.repeat(41), 1), null, 'longer than 40');
  assert.equal(S.acceptRow('ref', '192.168.1.20', 1), null, 'an address literal is not a host name');
  assert.equal(S.acceptRow('ref', 'johns-laptop.local', 1), null, 'a local name');
  assert.equal(S.acceptRow('ref', 'localhost', 1), null);
  assert.equal(S.acceptRow('ref', 'https://x.com/some/path?u=1', 1), null, 'a URL is not a host name');
  assert.equal(S.acceptRow('layer', 'dl-wind?x=1', 1), null);
  assert.equal(S.acceptRow('view', '', 0), null, 'a count of zero');
  assert.deepEqual(S.acceptRow('utm_source', '  NewsLetter ', 1), { m: 'utm_source', d: 'newsletter', n: 1, cap: 100 }, 'a tag is lower-cased');
  assert.deepEqual(S.acceptRow('ref', 'News.YCombinator.com', 1), { m: 'ref', d: 'news.ycombinator.com', n: 1, cap: 200 });
  assert.deepEqual(S.acceptRow('view', '', 5), { m: 'view', d: '', n: 1, cap: 1 }, 'a once-per-page metric is clamped to 1');
  assert.deepEqual(S.acceptRow('atlas', '', 7), { m: 'atlas', d: '', n: 7, cap: 1 }, 'Atlas questions carry their count');
});

test('anonymous-usage-counts ① the browser and the server read ONE declaration — no copy to drift', () => {
  const fn = src('supabase/functions/usage-count/index.ts');
  assert.match(fn, /from "\.\/shape\.js"/, 'the function imports the declaration');
  assert.match(src('js/usage-counts.js'), /from '\.\.\/supabase\/functions\/usage-count\/shape\.js'/, 'the browser imports the same file');
  /* every feature the browser listens for is a declared dimension, and every declared one is heard */
  assert.deepEqual(Object.keys(U.FEATURES).sort(), S.METRICS.feature.dim.values.slice().sort());
  /* the layer ceiling leaves room for the catalogue to grow (the expiry its comment states) */
  const ratio = M.LAYERS.length / S.METRICS.layer.maxDims;
  assert.ok(ratio < 0.75, `the layer catalogue (${M.LAYERS.length}) is ${(ratio * 100).toFixed(0)}% of layer.maxDims — raise it in shape.js`);
  /* every layer id the manifest holds passes the server's shape rule (or the server would drop real use) */
  const refused = M.LAYERS.map((l) => l.id).filter((id) => !S.acceptRow('layer', id, 1));
  assert.deepEqual(refused, [], 'layer ids the server would refuse');
});

test('anonymous-usage-counts ① parse reads only the three positions of each row', () => {
  const body = JSON.stringify({
    ip: '203.0.113.9', user_id: 'u', question: 'secret',
    c: [['view', '', 1, 'extra'], ['atlas', '', 3], ['nope', 'x', 1], ['lang', 'jp', 1], { m: 'view' }, ['view', '', 1]],
  });
  const r = S.parse(body);
  assert.deepEqual(r.rows.map((x) => [x.m, x.d, x.n]), [['view', '', 1], ['atlas', '', 3], ['lang', 'jp', 1]],
    'undeclared rows and non-array rows are dropped; a repeated once-per-page row stays at 1');
  assert.ok(!JSON.stringify(r).includes('203.0.113.9') && !JSON.stringify(r).includes('secret'));
  assert.equal(S.parse('{"c":[]}').error, 'invalid_request');
  assert.equal(S.parse(JSON.stringify({ c: Array.from({ length: S.MAX_ROWS_PER_REQUEST + 1 }, () => ['view', '', 1]) })).error, 'invalid_request');
});

test('anonymous-usage-counts ① the arrival is read from the address, as host names and tags only', () => {
  assert.equal(S.referrerOf('', 'rwmqx7dwb5-arch.github.io'), 'direct');
  assert.equal(S.referrerOf('https://www.reddit.com/r/maps/comments/abc?utm=1', 'rwmqx7dwb5-arch.github.io'), 'www.reddit.com');
  assert.equal(S.referrerOf('https://rwmqx7dwb5-arch.github.io/IntMap/privacy.html', 'rwmqx7dwb5-arch.github.io'), null, 'IntMap\'s own page is not an arrival');
  assert.equal(S.referrerOf('http://10.0.0.4:8080/', 'x'), 'other');
  assert.deepEqual(S.campaignOf('?utm_source=Twitter&utm_medium=social&utm_campaign=launch%20day&x=1'),
    [{ m: 'utm_source', d: 'twitter' }, { m: 'utm_medium', d: 'social' }], 'a campaign tag with a space is not stored');
  assert.equal(S.entryOf('?embed=1', '', 'navigate'), 'embed');
  assert.equal(S.entryOf('', '#v=2&c=1,2,3', 'navigate'), 'link');
  assert.equal(S.entryOf('', '#v=2&c=1,2,3', 'reload'), null, 'a reload of one\'s own tab is not an arrival by link');
  assert.equal(S.entryOf('', '', 'navigate'), null);
  assert.equal(S.langBucket('jp'), 'jp'); assert.equal(S.langBucket('en'), 'en'); assert.equal(S.langBucket('de'), 'other');
});

/* ── ② ブラウザ ─────────────────────────────────────────────────────────────────────────── */

test('anonymous-usage-counts ② the counter sends declared rows only, once per page load, and an opt-out discards', () => {
  const sent = [];
  let reason = null;
  const c = U.createCounter({ reason: () => reason, endpoint: () => 'https://stub/functions/v1/usage-count', send: (u, t) => { sent.push(t); return true; } });
  assert.ok(c.add('view', ''));
  assert.ok(!c.add('view', ''), 'a page view is counted once per page load');
  c.add('layer', 'dl-wind'); c.add('layer', 'dl-wind');
  c.add('atlas', ''); c.add('atlas', ''); c.add('atlas', '');
  assert.ok(!c.add('question', 'what is the capital of France'), 'an undeclared metric is not even recorded');
  assert.equal(c.flush(), 1);
  const body = JSON.parse(sent[0]);
  assert.deepEqual(body, { c: [['view', '', 1], ['layer', 'dl-wind', 1], ['atlas', '', 3]] });
  assert.equal(c.flush(), 0, 'nothing pending → nothing sent');

  c.add('feature', 'share');
  reason = 'off';
  assert.equal(c.flush(), 0, 'switched off → nothing sent');
  reason = null;
  assert.equal(c.flush(), 0, '…and what was pending when it was switched off was discarded, not kept for later');
  for (const r of ['dnt', 'gpc']) {
    reason = r;
    assert.ok(!c.add('atlas', ''), `${r}: nothing is recorded`);
  }
  reason = 'local';
  c.add('atlas', '');
  assert.equal(c.flush(), 0, 'a local preview never sends');
  assert.equal(c.pending().length, 1, '…but it still records, so the page can show what WOULD be sent (the spec reads preview())');
});

test('anonymous-usage-counts ② a large count or a long list is split, never inflated or cut', () => {
  const sent = [];
  const c = U.createCounter({ reason: () => null, endpoint: () => 'u', send: (u, t) => { sent.push(JSON.parse(t)); return true; } });
  for (let i = 0; i < 230; i++) c.add('atlas', '');
  for (const l of M.LAYERS.slice(0, 70)) c.add('layer', l.id);
  c.flush();
  const rows = sent.flatMap((b) => b.c);
  assert.ok(sent.every((b) => b.c.length <= S.MAX_ROWS_PER_REQUEST));
  assert.equal(rows.filter((r) => r[0] === 'atlas').reduce((a, r) => a + r[2], 0), 230, 'every question is counted');
  assert.ok(rows.every((r) => r[2] <= S.METRICS[r[0]].max), 'no row passes its per-request max');
  assert.equal(rows.filter((r) => r[0] === 'layer').length, 70);
});

test('anonymous-usage-counts ② features are heard where the app already speaks — a click, a capability, an Atlas turn', () => {
  const at = (sel) => ({ closest: (s) => (s === sel ? {} : null) });
  assert.equal(U.featureOfClick(at('#btn-compare')), 'compare');
  assert.equal(U.featureOfClick(at('#btn-share')), 'share');
  assert.equal(U.featureOfClick(at('[data-act="play"]')), 'timelapse');
  assert.equal(U.featureOfClick({ closest: () => null }), null);
  globalThis.window = { INTMAP_STRIPE_URL_EN: 'https://donate.stripe.com/abc?locale=en', INTMAP_STRIPE_URL_JP: 'https://donate.stripe.com/def?locale=ja' };
  try {
    const link = (href) => ({ closest: (s) => (s === 'a[href]' ? { href } : null) });
    assert.equal(U.featureOfClick(link('https://donate.stripe.com/def?locale=ja')), 'donate');
    assert.equal(U.featureOfClick(link('https://example.com/donate')), null);
  } finally { delete globalThis.window; }
  assert.equal(U.featureOfOperation({ capabilityId: 'panel.compare', phase: 'completed', kernel: 'atlas' }), 'compare');
  assert.equal(U.featureOfOperation({ capabilityId: 'panel.compare', phase: 'started' }), null, 'only a completed operation');
  assert.equal(U.featureOfOperation({ cmd: 'panel.share', phase: 'completed' }), null, 'the syscall-log copy of the same phase is not counted twice');
  assert.ok(U.isAtlasQuestion({ kernel: 'atlas', phase: 'turn', turnId: 3 }));
  assert.ok(!U.isAtlasQuestion({ kernel: 'atlas', phase: 'completed', capabilityId: 'map.pin' }));
});

test('anonymous-usage-counts ② the opt-out order and the arrival rows, evaluated', () => {
  assert.equal(U.optOutReason({ origin: PROD }), null, 'production, nothing set → counting is on');
  assert.equal(U.optOutReason({ origin: PROD, dnt: true, gpc: true, pref: 'off' }), 'dnt', 'the browser\'s own signal is named first');
  assert.equal(U.optOutReason({ origin: PROD, gpc: true }), 'gpc');
  assert.equal(U.optOutReason({ origin: PROD, pref: 'off' }), 'off');
  assert.equal(U.optOutReason({ origin: 'http://127.0.0.1:4808' }), 'local');
  assert.equal(U.optOutReason({ origin: PROD + '.evil.example' }), 'local', 'a look-alike origin is not production');
  assert.deepEqual(U.arrivalRows({ search: '?embed=1&utm_medium=Email', hash: '', navType: 'navigate', referrer: 'https://blog.example.org/post/1', host: 'rwmqx7dwb5-arch.github.io' }),
    [{ m: 'view', d: '' }, { m: 'entry', d: 'embed' }, { m: 'ref', d: 'blog.example.org' }, { m: 'utm_medium', d: 'email' }]);
  assert.deepEqual(U.arrivalRows({ search: '', hash: '', navType: 'reload', referrer: 'https://rwmqx7dwb5-arch.github.io/IntMap/', host: 'rwmqx7dwb5-arch.github.io' }),
    [{ m: 'view', d: '' }], 'a reload from IntMap\'s own page is a view and nothing else');
});

/* the real module, installed on a fake page */
async function bootPage(opts) {
  const o = opts || {};
  const listeners = { doc: {}, win: {} };
  const beacons = [];
  const store = new Map(Object.entries(o.store || {}));
  const on = (bag) => (type, fn) => { (bag[type] = bag[type] || []).push(fn); };
  const doc = {
    referrer: o.referrer || '',
    visibilityState: 'visible',
    documentElement: { getAttribute: () => 'en' },
    addEventListener: on(listeners.doc),
    getElementById: () => null,
  };
  globalThis.window = {
    SUPABASE_URL: 'https://stub.supabase.test/',
    IM_HOST: { lang: o.lang || 'jp' },
    IntMapDevice: { kind: () => o.kind || 'phone' },
    addEventListener: on(listeners.win),
  };
  if (o.windowDnt) globalThis.window.doNotTrack = '1';
  globalThis.document = doc;
  globalThis.location = { origin: o.origin || PROD, hostname: 'rwmqx7dwb5-arch.github.io', search: o.search || '', hash: o.hash || '' };
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      doNotTrack: o.dnt ? '1' : null, globalPrivacyControl: !!o.gpc,
      sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true; },
    },
  });
  await import(modUrl('js/usage-counts.js', 'boot=' + Math.random()));
  const fire = (bag, type, ev) => (listeners[bag][type] || []).forEach((f) => f(ev || {}));
  const hide = () => { doc.visibilityState = 'hidden'; fire('doc', 'visibilitychange'); };
  const bodies = async () => Promise.all(beacons.map(async (b) => JSON.parse(await b.blob.text())));
  const done = () => { for (const k of ['window', 'document', 'location', 'localStorage']) delete globalThis[k]; };
  return { listeners, beacons, fire, hide, bodies, store, done, api: globalThis.window.IntMapUsage };
}

test('anonymous-usage-counts ② on the production page the arrival is sent when the page is hidden — and nothing personal is in it', async () => {
  const p = await bootPage({ referrer: 'https://t.co/abc123', search: '?utm_source=X&utm_campaign=Launch', hash: '#v=2&c=1,2' });
  try {
    /* a layer the READER switched on (trusted), and one the session restore switched on (not trusted, no activation) */
    const box = (id, trusted) => ({ target: { type: 'checkbox', checked: true, id, closest: (s) => (s === '#layer-dropdown' ? {} : null) }, isTrusted: trusted });
    p.fire('doc', 'change', box('dl-wind', true));
    p.fire('doc', 'change', box('dl-climate', false));
    p.fire('doc', 'change', box('not-a-layer', true));
    p.fire('win', 'appinstalled');
    p.hide();
    assert.equal(p.beacons.length, 1);
    assert.equal(p.beacons[0].url, 'https://stub.supabase.test/functions/v1/usage-count');
    assert.equal(p.beacons[0].blob.type, 'text/plain', 'a CORS-safelisted type, so the beacon needs no preflight');
    const [body] = await p.bodies();
    const rows = body.c.map((r) => r.join('|')).sort();
    assert.deepEqual(rows, ['device|mobile|1', 'entry|link|1', 'feature|install|1', 'lang|jp|1', 'layer|dl-wind|1', 'ref|t.co|1', 'utm_campaign|launch|1', 'utm_source|x|1', 'view||1'].sort(),
      'the restored layer and the undeclared box are not counted; a first navigation with a map view in its hash is «link»');
    for (const r of body.c) assert.ok(S.acceptRow(r[0], r[1], r[2]), `a row outside the declaration was sent: ${r}`);
    const text = JSON.stringify(body);
    assert.ok(!/abc123|Mozilla|11111111/.test(text), 'no referrer path, no User-Agent, no id');
    p.hide();
    assert.equal(p.beacons.length, 1, 'a second hide with nothing new sends nothing');
  } finally { p.done(); }
});

test('anonymous-usage-counts ② Do Not Track, Global Privacy Control, the switch and a local preview each send nothing', async () => {
  for (const o of [{ dnt: true }, { windowDnt: true }, { gpc: true }, { store: { [U.PREF_KEY]: 'off' } }, { origin: 'http://127.0.0.1:4808' }]) {
    const p = await bootPage(o);
    try {
      p.fire('win', 'appinstalled');
      p.hide();
      p.fire('win', 'pagehide');
      assert.equal(p.beacons.length, 0, `sent with ${JSON.stringify(o)}`);
    } finally { p.done(); }
  }
  /* switching it OFF on a running page stops it at once and drops what was counted */
  const p = await bootPage({});
  try {
    assert.deepEqual(p.api.status(), { on: true, sending: true, reason: null });
    const st = p.api.set(false);
    assert.deepEqual(st, { on: false, sending: false, reason: 'off' });
    assert.equal(p.store.get(U.PREF_KEY), 'off', 'the choice is remembered on this device');
    p.hide();
    assert.equal(p.beacons.length, 0, 'the page view counted before the switch was discarded');
    p.api.set(true);
    assert.equal(p.store.has(U.PREF_KEY), false, 'on is the default, so nothing is stored for it');
  } finally { p.done(); }
});

/* ── ③ Edge Function ───────────────────────────────────────────────────────────────────── */

const ENV = { SUPABASE_URL: 'https://stub.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key' };
globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: () => {} };
const FN = await import(modUrl('supabase/functions/usage-count/index.ts'));

const CALLER_IP = '203.0.113.77';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) Safari/604.1';
function req(method, body, headers) {
  return new Request('https://stub.supabase.test/functions/v1/usage-count', {
    method,
    headers: { origin: PROD, 'x-forwarded-for': CALLER_IP + ', 10.0.0.1', 'user-agent': UA, authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExIn0.sig', ...(headers || {}) },
    body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}
function stubDb(opts) {
  const o = opts || {};
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const name = String(url).split('/rpc/')[1];
    calls.push({ name, url: String(url), body: init && init.body ? String(init.body) : '' });
    if (o.down) throw new Error('connect ECONNREFUSED');
    if (name === 'relay_take') return new Response(JSON.stringify([{ allowed: o.allow !== false, remaining: 5 }]), { status: 200 });
    if (name === 'record_usage_counts') return new Response(JSON.stringify(o.counted == null ? 2 : o.counted), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  return calls;
}

test('anonymous-usage-counts ③ the function refuses what it must refuse, before touching the database', async () => {
  const calls = stubDb();
  assert.equal((await FN.handle(req('GET'))).status, 405);
  assert.equal((await FN.handle(req('POST', { c: [['view', '', 1]] }, { origin: 'https://evil.example' }))).status, 403, 'a foreign Origin');
  const pre = await FN.handle(req('OPTIONS', null, { origin: 'https://evil.example' }));
  assert.equal(pre.status, 403);
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const ok = await FN.handle(req('OPTIONS'));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), PROD, 'echoed, never *');
  assert.equal((await FN.handle(req('POST', 'x'.repeat(FN.MAX_BODY_BYTES + 1)))).status, 413);
  assert.equal((await FN.handle(req('POST', '{not json'))).status, 400);
  const allUnknown = await FN.handle(req('POST', { c: [['ip', CALLER_IP, 1], ['email', 'a@b.cd', 1]] }));
  assert.equal(allUnknown.status, 202);
  assert.deepEqual(await allUnknown.json(), { accepted: 0 }, 'undeclared rows are accepted and not stored');
  assert.equal(calls.length, 0, 'none of the above reached the database');
});

test('anonymous-usage-counts ③ only declared rows reach the database — and the IP, the User-Agent, the account and anything extra do not', async () => {
  const calls = stubDb({ counted: 2 });
  const body = {
    user_id: '11111111-1111-1111-1111-111111111111', ip: '198.51.100.4', question: 'where do I live', t: Date.now(),
    c: [['view', '', 1], ['atlas', '', 4, 'the question text'], ['utm_source', 'me@example.com', 1], ['device', UA, 1], ['nope', 'x', 1]],
  };
  const res = await FN.handle(req('POST', body));
  assert.equal(res.status, 202, await res.clone().text());
  assert.deepEqual(await res.json(), { accepted: 2, counted: 2, full: 0 });
  assert.deepEqual(calls.map((c) => c.name), ['relay_take', 'relay_take', 'record_usage_counts'], 'both buckets are taken BEFORE the write');
  const sent = JSON.parse(calls[2].body);
  assert.deepEqual(sent, { p_rows: [{ m: 'view', d: '', n: 1, cap: 1 }, { m: 'atlas', d: '', n: 4, cap: 1 }] },
    'the database receives the declared rows, with the SERVER\'s ceiling, and nothing else');
  for (const c of calls) {
    for (const leak of [CALLER_IP, '10.0.0.1', 'iPhone', '11111111', '198.51.100.4', 'where do I live', 'the question text', 'me@example.com', 'eyJhbGci']) {
      assert.ok(!c.body.includes(leak), `«${leak}» reached the database in ${c.name}: ${c.body}`);
    }
  }
  const k1 = JSON.parse(calls[0].body).p_key;
  assert.match(k1, /^[0-9a-f]{32}$/, 'the per-caller bucket is an HMAC of the address, not the address');
  assert.equal(JSON.parse(calls[1].body).p_key, '*', 'the second bucket is project-wide');
});

test('anonymous-usage-counts ③ the limiter fails closed, and a refusal writes nothing', async () => {
  let calls = stubDb({ down: true });
  assert.equal((await FN.handle(req('POST', { c: [['view', '', 1]] }))).status, 503);
  assert.ok(!calls.some((c) => c.name === 'record_usage_counts'));
  calls = stubDb({ allow: false });
  assert.equal((await FN.handle(req('POST', { c: [['view', '', 1]] }))).status, 429);
  assert.ok(!calls.some((c) => c.name === 'record_usage_counts'), 'a refused caller wrote a row');
  calls = stubDb({ counted: 1 });
  const partial = await FN.handle(req('POST', { c: [['ref', 'a.example.org', 1], ['ref', 'b.example.org', 1]] }));
  assert.deepEqual(await partial.json(), { accepted: 2, counted: 1, full: 1 }, 'a row refused at the daily ceiling is reported as full');
});

/* ── ④ 表・設定・開示 ──────────────────────────────────────────────────────────────────── */

test('anonymous-usage-counts ④ the table is (day, metric, dimension, count) and nothing else; the function is registered', () => {
  /* the migration that creates the table, found by what it does — not by a file name a renumber would break */
  const made = readdirSync(join(ROOT, 'supabase/migrations')).filter((n) => /create table (if not exists )?public\.usage_counts\s*\(/i.test(src('supabase/migrations/' + n)));
  assert.equal(made.length, 1, 'exactly one migration creates public.usage_counts: ' + made.join(', '));
  const sql = src('supabase/migrations/' + made[0]);
  const table = /create table if not exists public\.usage_counts \(([\s\S]*?)\n\);/.exec(sql);
  assert.ok(table);
  const cols = [...table[1].matchAll(/^\s*([a-z_]+)\s+(text|bigint|date|timestamptz|inet|uuid|jsonb)/gm)].map((m) => m[1]);
  assert.deepEqual(cols.sort(), ['count', 'day', 'dimension', 'metric']);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /using \(\(select public\.is_admin\(\)\)\)/);
  assert.match(sql, /grant\s+execute on function public\.record_usage_counts\(jsonb\)\s+to service_role/);
  assert.match(sql, /cron\.schedule\('usage-counts-purge', '27 3 \* \* \*', 'select public\.purge_usage_counts\(400\)'\)/);
  assert.match(src('supabase/config.toml'), /\[functions\.usage-count\]\nverify_jwt = false/);
  /* the server takes the day from its own clock: no date or time comes from the browser */
  assert.match(sql, /v_day\s+date := \(now\(\) at time zone 'utc'\)::date/);
  assert.ok(!/\bp_(?:day|time|at|ts)\b/.test(sql), 'no record_usage_counts parameter carries a date or a time');
});

test('anonymous-usage-counts ④ the switch is in Settings and reachable from Atlas', () => {
  const html = src('index.html');
  assert.match(html, /<select id="setting-usage-counts"><option value="on" data-i18n="usageCountsOn">[^<]*<\/option><option value="off" data-i18n="usageCountsOff">/);
  for (const f of ['js/locales/ui.en.js', 'js/locales/ui.jp.js']) {
    const t = src(f);
    for (const k of ['lblUsageCounts', 'usageCountsOn', 'usageCountsOff']) assert.match(t, new RegExp('\\b' + k + ':"[^"]+"'), `${f} ${k}`);
  }
  assert.match(src('js/atlas-capabilities.js'), /\["settings\.usageCounts","usageCounts"/);
  assert.match(src('src/main.js'), /^import '\.\.\/js\/usage-counts\.js';$/m);
});

test('anonymous-usage-counts ④ the privacy policy says what is counted and how to stop it, in both languages', () => {
  const legal = src('js/legal-text.js');
  assert.match(legal, /Anonymous usage statistics\./, 'EN §1');
  assert.match(legal, /匿名の利用統計/, 'JA §1');
  assert.match(legal, /Usage counts are deleted after 400 days/, 'EN §6 retention');
  assert.match(legal, /利用統計の件数は400日後に削除します/, 'JA §6 retention');
  assert.match(legal, /Do Not Track/);
});

test('anonymous-usage-counts ④ the Atlas console announces a question on the kernel bus (the count is all that is read)', () => {
  const c = src('js/atlas-console.js');
  assert.match(c, /IntMapOS\.emit\(\{\s*kernel:\s*'atlas',\s*phase:\s*'turn',\s*turnId:\s*turn\s*\}\)/,
    'js/atlas-console.js must emit {kernel:\'atlas\', phase:\'turn\', turnId} when a question is sent — and nothing of the question');
});
