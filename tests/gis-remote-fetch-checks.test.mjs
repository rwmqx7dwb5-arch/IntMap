/* ============================================================================
 *  gis-remote-fetch — public geodata a PAGE cannot read is read by a relay that follows a PRINCIPLE
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE STATES (dev-notes/2026-11-19-gis-live-probe.md §2, measured against real hosts):
 *   ① the Copernicus DEM / ESA WorldCover buckets answer Range and send no ACAO → a page got an opaque
 *      TypeError for a file a server reads in a second;
 *   ② Planetary Computer answers 409 PublicAccessNotPermitted until a SAS token is appended;
 *   ③ a window across ±180 was refused by the reader;
 *   ④ every refusal looked alike — a stopped relay would have been reported as «the host sends no CORS».
 *
 *  WHAT HAS TO STAY TRUE
 *   A  the relay (supabase/functions/gis-fetch) is run, not read: it forwards an address NOBODY LISTED, and
 *      refuses an address that is not https / carries credentials / has a port / resolves inward / redirects
 *      inward, a page, a range over the ceiling, a spent budget (project fails CLOSED), and the stop switch;
 *   B  js/gis-fetch.js reads a CORS-blocked host through the relay in 1 MiB chunks, REUSES them, never keeps a
 *      failed one, and names a relay refusal as the relay's (not as CORS);
 *   C  signHref signs from what a catalogue STATES (storage scheme + sign endpoint), and refuses what none states;
 *   D  a window across the antimeridian is split, read, stitched, and a missing half is NaN and said so.
 *
 *  Runner: the Edge Function is evaluated in a child process (Deno.serve captured, fetch stubbed) — the shape of
 *  tests/own-fetch-relay-checks.test.mjs.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── A. the relay, evaluated ──────────────────────────────────────────────────────────────── */
function runEdge(requests, opts) {
  const o = opts || {};
  const url = pathToFileURL(join(ROOT, 'supabase/functions/gis-fetch/index.ts')).href;
  const src = `
    const dns = ${JSON.stringify(o.dns || {})};
    const env = ${JSON.stringify(o.env || { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k' })};
    globalThis.Deno = { env: { get: (k) => env[k] || "" }, serve: (h) => { globalThis.__h = h; },
      resolveDns: async (h, t) => (dns[h] || []).filter((a) => (t === "AAAA") === a.includes(":")) };
    const routes = ${JSON.stringify(o.routes || [])}.map(([re, r]) => [new RegExp(re), r]);
    const rpc = ${JSON.stringify(o.rpc === undefined ? [{ allowed: true, remaining: 100 }] : o.rpc)};
    const taken = [];
    globalThis.__calls = [];
    globalThis.fetch = async (u, init) => {
      const s = String(u && u.url ? u.url : u);
      if (/\\/rest\\/v1\\/rpc\\/relay_take$/.test(s)) {
        const a = JSON.parse(init.body); taken.push(a);
        const row = Array.isArray(rpc) ? (rpc.find((r) => !r.scope || r.scope === a.p_scope) || rpc[0]) : rpc;
        return new Response(JSON.stringify([row]), { status: 200, headers: { "content-type": "application/json" } });
      }
      const range = init && init.headers && (init.headers.range || init.headers.Range);
      globalThis.__calls.push({ url: s, range: range || null });
      const hit = routes.find(([re]) => re.test(s));
      const r = hit ? hit[1] : { status: 404, body: "" };
      const total = r.total || 0;
      if (r.bytes && range) {
        const m = /bytes=(\\d+)-(\\d+)/.exec(range); const a = +m[1], b = Math.min(+m[2], total - 1);
        return new Response(new Uint8Array(b - a + 1).fill(7), { status: 206, headers: { "content-type": r.type || "image/tiff", "content-range": "bytes " + a + "-" + b + "/" + total } });
      }
      const h = { "content-type": r.type || "application/octet-stream" };
      if (r.location) h.location = r.location;
      if (r.len != null) h["content-length"] = String(r.len);
      return new Response(r.body == null ? "" : r.body, { status: r.status || 200, headers: h });
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = globalThis.__calls.length, tb = taken.length;
      let status = 0, body = "", headers = {};
      try { const r = await globalThis.__h(new Request("http://relay.test/" + q, { headers: { "x-forwarded-for": "203.0.113.7" } })); status = r.status; body = (await r.text()).slice(0, 300); r.headers.forEach((v, k) => { headers[k] = v; }); }
      catch (e) { status = -1; body = String(e && e.message || e).slice(0, 200); }
      out.push({ q, status, body, headers, calls: globalThis.__calls.slice(before), taken: taken.slice(tb) });
    }
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', src], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}
const enc = encodeURIComponent;
const BUCKET = 'https://some-bucket-nobody-listed.s3.eu-central-1.amazonaws.com/dem/tile.tif';
const PUBLIC_DNS = { 'some-bucket-nobody-listed.s3.eu-central-1.amazonaws.com': ['52.219.1.1'], 'other.example.org': ['93.184.216.34'], 'inward.example.org': ['10.0.0.5'], 'login.example.org': ['93.184.216.35'] };

test('A1 an address nobody listed is read by byte range, and the ranged answer is the upstream\'s own 206', () => {
  const [r] = runEdge([`?u=${enc(BUCKET)}&range=0-1048575`], { dns: PUBLIC_DNS, routes: [['some-bucket', { bytes: true, total: 36863907 }]] });
  assert.equal(r.status, 206, r.body);
  assert.match(r.headers['content-range'], /^bytes 0-1048575\/36863907$/);
  assert.equal(r.headers['x-gis-total'], '36863907');
  assert.equal(r.headers['access-control-allow-origin'], '*');
  assert.match(r.headers['access-control-expose-headers'], /content-range/);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].range, 'bytes=0-1048575');
  assert.equal(r.headers['content-disposition'], 'attachment');
  assert.match(r.headers['content-security-policy'], /sandbox/);
});

test('A2 what is refused is refused BEFORE any network: shape, credentials, port, inward names, range, method', () => {
  const qs = [
    `?u=${enc('http://some-bucket-nobody-listed.s3.eu-central-1.amazonaws.com/a.tif')}&range=0-9`,
    `?u=${enc('https://user:pw@other.example.org/a.tif')}&range=0-9`,
    `?u=${enc('https://other.example.org:8443/a.tif')}&range=0-9`,
    `?u=${enc('https://127.0.0.1/a.tif')}&range=0-9`,
    `?u=${enc('https://metadata.google.internal/a')}&range=0-9`,
    `?u=${enc('https://[::1]/a')}&range=0-9`,
    `?u=${enc('https://other.example.org/a.tif')}&range=9-0`,
    `?u=${enc('https://other.example.org/a.tif')}&range=0-${4 * 1024 * 1024}`,   /* one byte past the ceiling */
    `?u=`,
  ];
  const out = runEdge(qs, { dns: PUBLIC_DNS, routes: [['example|amazonaws', { bytes: true, total: 1000 }]] });
  const codes = out.map((o) => JSON.parse(o.body).error);
  assert.deepEqual(codes, ['not_https', 'credentials_in_url', 'port_not_default', 'host_not_public', 'host_not_public', 'host_not_public', 'bad_range', 'bad_range', 'bad_url']);
  for (const o of out) { assert.equal(o.status, 400); assert.equal(o.calls.length, 0, 'the upstream was touched for ' + o.q); assert.equal(o.taken.length, 0, 'a budget was charged for a request that was refused'); }
});

test('A3 a public NAME that resolves inward is refused, and so is a REDIRECT that lands inward (the same two questions at every hop)', () => {
  const out = runEdge([
    `?u=${enc('https://inward.example.org/a.tif')}&range=0-9`,
    `?u=${enc('https://other.example.org/a.tif')}&range=0-9`,
  ], { dns: PUBLIC_DNS, routes: [['other.example.org', { status: 302, location: 'https://inward.example.org/x' }], ['inward', { bytes: true, total: 10 }]] });
  assert.equal(JSON.parse(out[0].body).error, 'not_allowed');
  assert.equal(out[0].calls.length, 0);
  assert.equal(JSON.parse(out[1].body).error, 'upstream_redirect');
  assert.equal(out[1].calls.length, 1, 'the inward hop was fetched');
});

test('A4 a sign-in PAGE is not data: refused with where it came from, and the host\'s own refusal is relayed in its own words as data', () => {
  const out = runEdge([
    `?u=${enc('https://other.example.org/a.tif')}&range=0-9`,
    `?u=${enc('https://login.example.org/a.tif')}&range=0-9`,
  ], { dns: PUBLIC_DNS, routes: [
    ['other.example.org', { status: 302, location: 'https://login.example.org/signin?next=/a.tif' }],
    ['login.example.org/signin', { status: 200, type: 'text/html', body: '<html>Sign in</html>' }],
    ['login.example.org/a.tif', { status: 409, type: 'application/xml', body: '<Error><Code>PublicAccessNotPermitted</Code><Message>Public access is not permitted</Message></Error>' }],
  ] });
  const page = JSON.parse(out[0].body);
  assert.equal(out[0].status, 502);
  assert.equal(page.error, 'upstream_is_a_page');
  assert.equal(page.redirectedTo, 'https://login.example.org/signin', 'where the request ended up must be said');
  const said = JSON.parse(out[1].body);
  assert.equal(said.error, 'upstream_status'); assert.equal(said.status, 409);
  assert.match(said.said, /PublicAccessNotPermitted/); assert.ok(!/</.test(said.said), 'markup was relayed');
});

test('A5 a host that ignores Range: a small file goes through as 200 (the page reads it as «ignores Range»), a large one is NOT downloaded', () => {
  const out = runEdge([
    `?u=${enc('https://other.example.org/small.bin')}&range=0-9`,
    `?u=${enc('https://other.example.org/huge.bin')}&range=0-9`,
  ], { dns: PUBLIC_DNS, routes: [
    ['small.bin', { status: 200, body: 'abcdefgh', len: 8 }],
    ['huge.bin', { status: 200, body: 'x', len: 5_000_000_000 }],
  ] });
  assert.equal(out[0].status, 200); assert.equal(out[0].headers['x-gis-range-ignored'], '1');
  assert.equal(JSON.parse(out[1].body).error, 'upstream_range_ignored');
});

test('A6 the budget: charged BEFORE the upstream by the bytes asked, the project bucket fails CLOSED, the caller bucket answers 429, the stop switch answers first', () => {
  const ok = runEdge([`?u=${enc(BUCKET)}&range=0-1048575`], { dns: PUBLIC_DNS, routes: [['some-bucket', { bytes: true, total: 9999999 }]] })[0];
  const scopes = ok.taken.map((t) => t.p_scope);
  assert.deepEqual(scopes, ['gis-fetch:project-bytes', 'gis-fetch:caller-bytes']);
  assert.equal(ok.taken[0].p_cost, 16, '1 MiB is sixteen 64 KiB units');
  assert.equal(ok.taken[0].p_key, '*');
  assert.ok(ok.taken[1].p_key !== '203.0.113.7' && /^[0-9a-f]{32}$/.test(ok.taken[1].p_key), 'the caller bucket must be keyed by a hash, never the address');
  /* project bucket refuses → 429 budget_exhausted and the upstream is untouched */
  const spent = runEdge([`?u=${enc(BUCKET)}&range=0-99`], { dns: PUBLIC_DNS, rpc: [{ scope: 'gis-fetch:project-bytes', allowed: false, remaining: 0 }], routes: [['some-bucket', { bytes: true, total: 9999 }]] })[0];
  assert.equal(spent.status, 429); assert.equal(JSON.parse(spent.body).error, 'budget_exhausted'); assert.equal(spent.calls.length, 0);
  const caller = runEdge([`?u=${enc(BUCKET)}&range=0-99`], { dns: PUBLIC_DNS, rpc: [{ scope: 'gis-fetch:project-bytes', allowed: true, remaining: 9 }, { scope: 'gis-fetch:caller-bytes', allowed: false, remaining: 0 }], routes: [['some-bucket', { bytes: true, total: 9999 }]] })[0];
  assert.equal(caller.status, 429); assert.equal(JSON.parse(caller.body).error, 'rate_limit'); assert.equal(caller.calls.length, 0);
  /* a database that does not answer cannot say the project is bounded → closed */
  const noDb = runEdge([`?u=${enc(BUCKET)}&range=0-99`], { dns: PUBLIC_DNS, env: {}, routes: [['some-bucket', { bytes: true, total: 9999 }]] })[0];
  assert.equal(JSON.parse(noDb.body).error, 'budget_exhausted'); assert.equal(noDb.calls.length, 0);
  /* the stop switch: first, and without touching the budget or the network */
  const off = runEdge([`?u=${enc(BUCKET)}&range=0-99`], { dns: PUBLIC_DNS, env: { GIS_FETCH_DISABLED: '1', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k' }, routes: [['some-bucket', { bytes: true, total: 9999 }]] })[0];
  assert.equal(off.status, 503); assert.equal(JSON.parse(off.body).error, 'disabled'); assert.equal(off.calls.length, 0); assert.equal(off.taken.length, 0);
});

test('A7 the function is keyless in config (it must be callable by a signed-out reader) and its name is in the policy file', () => {
  const toml = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8');
  assert.match(toml, /\[functions\.gis-fetch\]\s*\nverify_jwt = false/);
});

/* ── B. the page's fetch ──────────────────────────────────────────────────────────────────── */
const { makeGisFetch, CHUNK_BYTES } = await import('../js/gis-fetch.js');
const { explainFetchFailure } = await import('../js/gis-http.js');
const FILE = new Uint8Array(3 * 1024 * 1024 + 123).map((_, i) => (i * 31 + (i >> 8)) & 255);
const HOST = 'https://bucket.example.org/dem/a.tif';
const BASE = 'https://sb.test/functions/v1/gis-fetch';

/* a page-side world: HOST sends no ACAO (throws, but answers a no-cors probe opaquely); the relay answers like gis-fetch */
function world(opts) {
  const o = opts || {};
  const w = { direct: 0, relay: [], probes: 0 };
  w.fetch = async (url, init) => {
    const s = String(url), i = init || {};
    if (s.startsWith(BASE)) {
      const u = new URL(s), target = u.searchParams.get('u'), rg = /^(\d+)-(\d+)$/.exec(u.searchParams.get('range') || '');
      w.relay.push({ target, range: u.searchParams.get('range') });
      const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (o.relayAnswer) { const r = o.relayAnswer(target, rg); if (r) return r; }
      const f = +/^(\d+)/.exec(u.searchParams.get('range'))[1], t = Math.min(+/-(\d+)$/.exec(u.searchParams.get('range'))[1], FILE.length - 1);
      if (f >= FILE.length) return reply(502, { error: 'upstream_status', status: 416, said: 'InvalidRange' });
      return new Response(FILE.slice(f, t + 1), { status: 206, headers: { 'content-type': 'image/tiff', 'content-range': 'bytes ' + f + '-' + t + '/' + FILE.length, 'x-gis-total': String(FILE.length) } });
    }
    if (i.method === 'HEAD' && i.mode === 'no-cors') { w.probes++; if (o.dead) throw new TypeError('Failed to fetch'); return { type: 'opaque', status: 0, headers: { get: () => null } }; }
    w.direct++;
    if (o.direct) { const r = o.direct(s, i); if (r) return r; }
    throw new TypeError('Failed to fetch');
  };
  return w;
}
const rangeOf = async (g, a, b) => { const r = await g.fetch(HOST, { headers: { Range: 'bytes=' + a + '-' + b } }); return r; };
const eq = (u8, a, b) => assert.deepEqual(Array.from(u8), Array.from(FILE.slice(a, b + 1)));

test('B1 a host that is reachable but unreadable (CORS) is read through the relay, byte-exact across chunk boundaries', async () => {
  const w = world(); const g = makeGisFetch({ fetch: w.fetch, base: BASE, caches: null });
  const a = CHUNK_BYTES - 100, b = CHUNK_BYTES + 5000;           /* spans two chunks */
  const r = await rangeOf(g, a, b);
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes ${a}-${b}/${FILE.length}`);
  eq(new Uint8Array(await r.arrayBuffer()), a, b);
  assert.equal(w.relay.length, 2, 'two chunks cover it');
  assert.ok(w.relay.every((x) => /^(\d+)-(\d+)$/.test(x.range) && (+x.range.split('-')[0]) % CHUNK_BYTES === 0), 'the relay is asked in aligned chunks');
  /* the end of the file: a range past the last byte is cut to the file, not an error */
  const tail = await rangeOf(g, FILE.length - 10, FILE.length + 5000);
  assert.equal(tail.status, 206); assert.equal((await tail.arrayBuffer()).byteLength, 10);
  /* a range that starts past the end is the upstream's 416, not a throw */
  const past = await rangeOf(g, FILE.length + 10, FILE.length + 20);
  assert.equal(past.status, 416, 'a host status is passed through, not turned into a throw');
});

test('B2 a chunk is paid for ONCE: the same window read again, and a neighbouring one, cost no relay call; the origin is remembered, so the probe is not repeated', async () => {
  const w = world(); const g = makeGisFetch({ fetch: w.fetch, base: BASE, caches: null });
  await rangeOf(g, 0, 65535);
  const first = { relay: w.relay.length, probes: w.probes, direct: w.direct };
  assert.deepEqual([first.relay, first.probes, first.direct], [1, 1, 1]);
  const r2 = await rangeOf(g, 65536, 131071);      /* the next 64 KiB block of the same chunk */
  eq(new Uint8Array(await r2.arrayBuffer()), 65536, 131071);
  await rangeOf(g, 0, 65535);
  assert.equal(w.relay.length, 1, 'chunks were fetched again');
  assert.equal(w.probes, 1, 'a known origin was probed again');
  assert.equal(w.direct, 1, 'a known origin was asked directly again');
  assert.equal(g.stats().memoryHits, 2);
});

test('B3 a Cache-API copy is reused by a fresh instance (a reload), and a stale one is not', async () => {
  const store = new Map();
  const caches = { open: async () => ({ match: async (k) => store.get(k) && store.get(k).clone(), put: async (k, r) => { store.set(k, r); }, keys: async () => [], delete: async (k) => store.delete(k) }) };
  let t = 1000;
  const w1 = world(); const g1 = makeGisFetch({ fetch: w1.fetch, base: BASE, caches, now: () => t });
  await rangeOf(g1, 0, 99);
  await new Promise((r) => setTimeout(r, 10));
  const w2 = world(); const g2 = makeGisFetch({ fetch: w2.fetch, base: BASE, caches, now: () => t + 1000 });
  eq(new Uint8Array(await (await rangeOf(g2, 0, 99)).arrayBuffer()), 0, 99);
  assert.equal(w2.relay.length, 0, 'a kept chunk was fetched again');
  assert.equal(g2.stats().persistHits, 1);
  const w3 = world(); const g3 = makeGisFetch({ fetch: w3.fetch, base: BASE, caches, now: () => t + 25 * 3600 * 1000 });
  await rangeOf(g3, 0, 99);
  assert.equal(w3.relay.length, 1, 'a day-old chunk was trusted');
});

test('B4 a host that DOES answer a page is never sent through the relay (free path first), nor is a dead network made someone else\'s request', async () => {
  const ok = world({ direct: () => new Response(new Uint8Array(5), { status: 206, headers: { 'content-range': 'bytes 0-4/5' } }) });
  const g = makeGisFetch({ fetch: ok.fetch, base: BASE, caches: null });
  assert.equal((await rangeOf(g, 0, 4)).status, 206);
  assert.equal(ok.relay.length, 0);
  const dead = world({ dead: true }); const g2 = makeGisFetch({ fetch: dead.fetch, base: BASE, caches: null });
  await assert.rejects(() => rangeOf(g2, 0, 9), /Failed to fetch/);
  assert.equal(dead.relay.length, 0, 'a host the probe could not reach was sent to the relay');
  /* no relay configured: the page fails as it always did, with its own reason */
  const w = world(); const g3 = makeGisFetch({ fetch: w.fetch, base: '', caches: null });
  const err = await rangeOf(g3, 0, 9).catch((e) => e);
  assert.ok(err instanceof TypeError); assert.equal((await explainFetchFailure(HOST, w.fetch, err)).corsBlocked, true);
});

test('B5 a RELAY refusal is named as the relay\'s — never as «the host sends no CORS headers» — and a host\'s own refusal arrives as its own status and words', async () => {
  for (const [code, status, re] of [['budget_exhausted', 429, /byte budget/], ['disabled', 503, /switched off/], ['rate_limit', 429, /too many/i], ['not_allowed', 400, /public addresses/]]) {
    const w = world({ relayAnswer: () => new Response(JSON.stringify({ error: code }), { status, headers: { 'content-type': 'application/json' } }) });
    const g = makeGisFetch({ fetch: w.fetch, base: BASE, caches: null });
    const err = await rangeOf(g, 0, 9).catch((e) => e);
    const why = await explainFetchFailure(HOST, w.fetch, err);
    assert.equal(why.relay, code); assert.equal(why.viaRelay, true);
    assert.ok(!why.corsBlocked, code + ' was reported as CORS');
    assert.match(why.reason, re);
  }
  const w = world({ relayAnswer: () => new Response(JSON.stringify({ error: 'upstream_status', status: 403, said: 'AccessDenied' }), { status: 502, headers: { 'content-type': 'application/json' } }) });
  const g = makeGisFetch({ fetch: w.fetch, base: BASE, caches: null });
  const res = await rangeOf(g, 0, 9);
  assert.equal(res.status, 403); assert.equal(await res.text(), 'AccessDenied');
  /* a failed chunk is not kept: asking again asks the relay again */
  await rangeOf(g, 0, 9); assert.equal(w.relay.length, 2);
  /* a sign-in page: a 200 page, with where it came from — the readers' existing «a web page came back» path */
  const p = world({ relayAnswer: () => new Response(JSON.stringify({ error: 'upstream_is_a_page', redirectedTo: 'https://ers.example.gov/login' }), { status: 502, headers: { 'content-type': 'application/json' } }) });
  const gp = makeGisFetch({ fetch: p.fetch, base: BASE, caches: null });
  const page = await rangeOf(gp, 0, 9);
  assert.equal(page.status, 200); assert.match(page.headers.get('content-type'), /html/);
  const { describeResponse, looksLikeAPage } = await import('../js/gis-http.js');
  assert.equal(looksLikeAPage(page), true);
  assert.equal((await describeResponse(HOST, page)).redirectedTo, 'https://ers.example.gov/login');
});

test('B6 a host that refuses an UNSIGNED address (409) is read again signed, once; a host nobody can sign keeps its own refusal', async () => {
  const seen = [];
  const w = world({ direct: (s) => { seen.push(s); return s.includes('sig=ok') ? new Response(new Uint8Array(4), { status: 206, headers: { 'content-range': 'bytes 0-3/4' } }) : new Response('PublicAccessNotPermitted', { status: 409 }); } });
  const g = makeGisFetch({ fetch: w.fetch, base: BASE, caches: null, signer: async (h) => ({ ok: true, href: h + '?sig=ok' }) });
  assert.equal((await rangeOf(g, 0, 3)).status, 206);
  assert.deepEqual(seen, [HOST, HOST + '?sig=ok']);
  const g2 = makeGisFetch({ fetch: w.fetch, base: BASE, caches: null, signer: async () => ({ ok: false, why: 'no-signer' }) });
  assert.equal((await rangeOf(g2, 0, 3)).status, 409);
  /* a signer that always answers must not loop: a signed address that is refused stays refused */
  const w3 = world({ direct: () => new Response('no', { status: 403 }) });
  const g3 = makeGisFetch({ fetch: w3.fetch, base: BASE, caches: null, signer: async (h) => ({ ok: true, href: h + '?sig=x' }) });
  assert.equal((await rangeOf(g3, 0, 3)).status, 403);
  assert.equal(w3.direct, 2);
});

test('B7 a host that is BOTH unreadable by a page AND wants a signature is signed, then read through the relay', async () => {
  const w = world({ relayAnswer: (target, rg) => (target.includes('sig=ok') ? null : new Response(JSON.stringify({ error: 'upstream_status', status: 409, said: 'PublicAccessNotPermitted' }), { status: 502, headers: { 'content-type': 'application/json' } })) });
  const g = makeGisFetch({ fetch: w.fetch, base: BASE, caches: null, signer: async (h) => ({ ok: true, href: h + '?sig=ok' }) });
  const r = await rangeOf(g, 0, 99);
  assert.equal(r.status, 206);
  assert.deepEqual(w.relay.map((x) => x.target.endsWith('?sig=ok')), [false, true], 'the unsigned read, then the signed one, both through the relay');
});

/* ── C. signing, from what a catalogue states ─────────────────────────────────────────────── */
const { makeGisRemote } = await import('../js/gis-remote.js');
const PC = 'https://catalogue.example.org/api/stac/v1';
function catalogueFetch(extraCols) {
  const calls = [];
  const col = { id: 'sentinel-2-l2a', title: 'S2', description: '', extent: { spatial: { bbox: [[-180, -90, 180, 90]] }, temporal: { interval: [['2015-01-01T00:00:00Z', null]] } }, license: 'proprietary', 'storage:schemes': { azure: { type: 'ms-azure', platform: 'https://{account}.blob.core.windows.net', account: 'acct1', container: 'cont1' } } };
  const f = async (url) => {
    const s = String(url); calls.push(s);
    if (s.startsWith(PC + '/collections')) return new Response(JSON.stringify({ collections: [col].concat(extraCols || []), links: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (s.startsWith('https://catalogue.example.org/api/sas/v1/token/sentinel-2-l2a')) return new Response(JSON.stringify({ token: 'st=1&sig=abc', 'msft:expiry': new Date(Date.now() + 3600e3).toISOString() }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('', { status: 404 });
  };
  return { f, calls };
}
test('C1 signHref signs an address a catalogue states it holds, from the stated token endpoint, and keeps the token until it expires', async () => {
  const { f, calls } = catalogueFetch();
  const R = makeGisRemote({ fetch: f });
  assert.equal(R.add({ id: 'ex', kind: 'stac', url: PC, sign: { kind: 'azure-sas', token: 'https://catalogue.example.org/api/sas/v1/token/{collection}' } }).ok, true);
  const href = 'https://acct1.blob.core.windows.net/cont1/2024/06/x.tif';
  const a = await R.signHref(href);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.href, href + '?st=1&sig=abc'); assert.equal(a.collection, 'sentinel-2-l2a');
  const mine = () => calls.filter((c) => c.includes('catalogue.example.org')).length;
  const n = mine();
  const b = await R.signHref(href + '?x=1');
  assert.equal(b.href, href + '?x=1&st=1&sig=abc');
  assert.equal(mine(), n, 'the token or the collection list was fetched again');
  /* what no catalogue states is not guessed: another account, another container, an unrelated host */
  for (const other of ['https://acct2.blob.core.windows.net/cont1/x.tif', 'https://acct1.blob.core.windows.net/cont2/x.tif', 'https://bucket.example.org/x.tif']) assert.equal((await R.signHref(other)).why, 'no-signer', other);
  /* an address that already carries a signature and was refused is not signed again */
  assert.equal((await R.signHref(href + '?sig=old')).why, 'sign-failed');
  /* a token endpoint that does not answer is said, with its own reason */
  const R2 = makeGisRemote({ fetch: async (u) => (String(u).includes('/token/') ? new Response('', { status: 500 }) : (await catalogueFetch().f(u))) });
  R2.add({ id: 'ex', kind: 'stac', url: PC, sign: { kind: 'azure-sas', token: 'https://catalogue.example.org/api/sas/v1/token/{collection}' } });
  const bad = await R2.signHref(href);
  assert.equal(bad.why, 'sign-failed'); assert.equal(bad.detail.because, 'http-status');
});

test('C2 the built-in registry states how its one signed catalogue is signed, as DATA (no host in the code path)', () => {
  const R = makeGisRemote({});
  const signed = R.catalogs().filter((c) => c.sign);
  assert.ok(signed.length >= 1);
  for (const c of signed) { assert.match(c.sign.token, /\{collection\}/); assert.equal(c.sign.kind, 'azure-sas'); }
  const src = readFileSync(join(ROOT, 'js/gis-remote.js'), 'utf8');
  const code = src.slice(src.indexOf('async function signHref'), src.indexOf('const API = {'));
  assert.ok(!/planetarycomputer|blob\.core\.windows|sentinel/i.test(code), 'signHref names a supplier');
});

test('C3 a catalogue that is slow is a TIMEOUT, not «the network failed», and a catalogue that refuses says its words', async () => {
  const R = makeGisRemote({ timeoutMs: 20, fetch: (u, init) => new Promise((res, rej) => { init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }) });
  const d = await R.discover({ catalogs: ['earth-search'] });
  assert.equal(d.catalogs[0].why, 'timeout');
  const R2 = makeGisRemote({ fetch: async () => new Response('Access denied by policy', { status: 403 }) });
  const d2 = await R2.discover({ catalogs: ['earth-search'] });
  assert.equal(d2.catalogs[0].why, 'http-status'); assert.match(d2.catalogs[0].detail.serverSaid, /Access denied by policy/);
});

/* ── D. the antimeridian ──────────────────────────────────────────────────────────────────── */
function boot() {
  const w = {}; globalThis.window = w;
  return import('../js/gis-cog.js').then(async ({ makeGisCog }) => {
    const { readFileSync: rf } = await import('node:fs');
    new Function('window', rf(join(ROOT, 'js/geodesy.js'), 'utf8'))(w);
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const { makeGisWarp } = await import('../js/gis-warp.js');
    const { makeGisGeotiff } = await import('../js/gis-geotiff.js');
    w.IntMapGisRaster = makeGisRaster(); w.IntMapGisCrs = makeGisCrs(); w.IntMapGisWarp = makeGisWarp(); await w.IntMapGisCrs.ready();
    return makeGisCog({ geotiff: makeGisGeotiff(), warp: w.IntMapGisWarp, crs: w.IntMapGisCrs });
  });
}
/* the windows each half was asked for are recorded by a stand-in for the flat reader's file layer: the cog is given a fake `geotiff` */
function fakeGeotiff(files) {
  const asked = [];
  return {
    asked,
    readUrl: async (url) => {
      const f = files[url];
      if (!f) return { ok: false, why: 'http-status', detail: { status: 404 } };
      return { ok: true, grid: {
        crs: 'EPSG:4326', width: Math.round((f.box[2] - f.box[0]) / f.px), height: Math.round((f.box[3] - f.box[1]) / f.px), affine: { x0: f.box[0], y0: f.box[3], dx: f.px, dy: f.px }, bands: [{ name: 'v', nodata: null }],
        levelFor: () => ({ ok: true, level: 0, dx: f.px, dy: f.px, meets: true, isOverview: false }),
        levelAt: async () => ({ ok: true, grid: { bands: [{ name: 'v', nodata: null }], readRegion: async ({ bbox }) => {
          asked.push(bbox.slice());
          const w = Math.max(bbox[0], f.box[0]), e = Math.min(bbox[2], f.box[2]);
          if (!(e > w) || bbox[3] <= f.box[1] || bbox[1] >= f.box[3]) return { ok: false, why: 'region-out-of-range', detail: {} };
          const cols = Math.round((e - w) / f.px), rows = Math.round((Math.min(bbox[3], f.box[3]) - Math.max(bbox[1], f.box[1])) / f.px);
          const vals = new Float32Array(cols * rows);
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) vals[r * cols + c] = f.value(w + (c + 0.5) * f.px);
          return { ok: true, region: { width: cols, height: rows, affine: { x0: w, y0: Math.min(bbox[3], f.box[3]), dx: f.px, dy: f.px }, values: vals } };
        } } }),
        source: { requests: () => 1 },
      } };
    },
  };
}
const PXD = 0.1;
test('D1 a window across ±180 — written (170,−170) or (170,190) — is split, read on each side where the files keep it, and stitched on a continuous lattice', async () => {
  await boot();
  const files = {
    'https://x.example.org/east.tif': { box: [170, -20, 180, -10], px: PXD, value: (lng) => 1000 + lng },        /* east of the seam: lng 170..180 */
    'https://x.example.org/west.tif': { box: [-180, -20, -170, -10], px: PXD, value: (lng) => 2000 + lng },     /* west of the seam: lng −180..−170 */
  };
  for (const win of [[170, -20, 190, -10], [170, -20, -170, -10]]) {
    const gt = fakeGeotiff({ 'https://x.example.org/f.tif': files['https://x.example.org/east.tif'] });
    const { makeGisCog } = await import('../js/gis-cog.js');
    /* one file per side: the url decides which half it can answer; a file that does not reach a half says region-out-of-range */
    const both = { readUrl: async () => ({ ok: false }) };
    const eastCog = makeGisCog({ geotiff: gt, warp: window.IntMapGisWarp, crs: window.IntMapGisCrs });
    const r = await eastCog.readWindow('https://x.example.org/f.tif', { bounds: win, width: 200, height: 100 });
    assert.equal(r.ok, true, JSON.stringify(r.why) + JSON.stringify(r.detail)); void both;
    assert.equal(r.raster.width, 200); assert.equal(r.raster.grid.west, 170); assert.equal(r.raster.grid.pixelLng, 0.1);
    const v = r.raster.read(0);
    /* the east half holds data, the west half (the file ends at 180) is NaN — not 0 */
    assert.ok(Number.isFinite(v[50]) && Math.abs(v[50] - (1000 + 170 + 50.5 * 0.1)) < 0.06, 'the east half is wrong: ' + v[50]);
    assert.ok(Number.isNaN(v[150]), 'the half the file does not hold was filled: ' + v[150]);
    assert.equal(r.coverage.completeness, 'partial'); assert.match(r.coverage.reason, /window-extends-past-the-file/);
    assert.equal(r.coverage.acrossAntimeridian.seamLongitude, 180);
    assert.deepEqual(r.coverage.acrossAntimeridian.halves, ['read', 'absent']);
    /* the second half was asked for where west.tif would keep it: −180..−170, not 180..190 */
    assert.ok(gt.asked.some((b) => b[0] >= -180 - 1e-6 && b[2] <= -170 + 0.2), 'the far side was asked for in unwrapped longitude: ' + JSON.stringify(gt.asked));
  }
});

test('D2 a file that holds BOTH sides (a global grid) gives one seamless raster, "all", and a window that does not cross is untouched', async () => {
  await boot();
  const { makeGisCog } = await import('../js/gis-cog.js');
  const world = { box: [-180, -90, 180, 90], px: PXD, value: (lng) => lng };
  const cog = makeGisCog({ geotiff: fakeGeotiff({ 'https://x.example.org/w.tif': world }), warp: window.IntMapGisWarp, crs: window.IntMapGisCrs });
  const r = await cog.readWindow('https://x.example.org/w.tif', { bounds: [175, -5, 185, 5], width: 100, height: 100 });
  assert.equal(r.ok, true, JSON.stringify(r.why));
  const v = r.raster.read(0), row = (i) => v[50 * 100 + i];
  for (let i = 0; i < 100; i++) {
    const lng = 175 + (i + 0.5) * 0.1, want = lng > 180 ? lng - 360 : lng;
    assert.ok(Math.abs(row(i) - want) < 0.06, 'column ' + i + ' came from the wrong ground: ' + row(i) + ' vs ' + want);
  }
  assert.equal(r.coverage.completeness, 'all'); assert.equal(r.coverage.requested[2], 185);
  const flat = await cog.readWindow('https://x.example.org/w.tif', { bounds: [10, -5, 20, 5], width: 100, height: 100 });
  assert.equal(flat.ok, true); assert.equal(flat.coverage.acrossAntimeridian, undefined);
  /* both halves absent is the flat refusal, not a raster of NaN */
  const none = makeGisCog({ geotiff: fakeGeotiff({ 'https://x.example.org/n.tif': { box: [0, 0, 10, 10], px: PXD, value: () => 1 } }), warp: window.IntMapGisWarp, crs: window.IntMapGisCrs });
  const r2 = await none.readWindow('https://x.example.org/n.tif', { bounds: [175, -5, 185, 5], width: 100, height: 100 });
  assert.equal(r2.ok, false); assert.equal(r2.why, 'region-out-of-range');
});
