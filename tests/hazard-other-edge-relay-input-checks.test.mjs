/* ============================================================================
 *  EDGE FUNCTIONS — what the relays accept as input (bbox, read budget, quotes, AIS)
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The Edge Functions are RUN in a child process with
 *    their upstreams stubbed; the pin left is that both feeds import one parser rather than keeping a
 *    copy.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r801-relay-input-checks.test.mjs (tests #1, #2, #3, #8, #10, #11 of 11) ═══
    R801 — 公開リレーの入力は「形式が合っている」ではなく「呼び出し元が実際に送るもの」で受ける
    外部監査が挙げた欠陥を、**関数を実際に評価して**測る（ソースを読んで綴りを探さない。#R505）。
    Edge Function は子プロセスで評価し、`Deno.serve` に渡された handler を本物の Request で叩く。
    上流は fetch / WebSocket のスタブで、何が・何本同時に・どのホストへ訊かれたかを記録する。

      ① `?bbox=` は座標である（aviation-feed: span 1e9 が `Invalid array length` を投げていた）
      ② _shared/read-budget.js の算術（#R504 の bucket をそのまま運んだこと）
      ③ alerts-relay: 索引の href は索引と同じ origin だけ／CAP の取得は上限付きの並列
      ④ alerts-relay: `?u=` は未知のクエリ鍵・ポート・違う scheme を拒み、自分の swicUrl は通す
      ⑤ alerts-relay: `?ma=` は MA_PARALLEL 本ずつ
      ⑥ quotes-relay: 不正な `%` は 400 であって 500 ではない／ポート付きは 400
      ⑦ radiation-sources: us-epa の series は登録局にしか URL を作らない（`..` は path にならない）
      ⑧ ais-feed: `?refresh=1` は bucket が許した回数しか上流へ行かない／公開 meta と note に秘密の形状も
         上流の文も無い／bbox は共有の規則で読む */
{
const rd = read;

/* ── the runner: one child per Edge Function, the handler captured, upstreams stubbed ─────────
   `routes` is [[regexSource, { status, body, type, delayMs }], …]; anything unmatched answers 404.
   The child reports every fetch call, the highest number in flight at once, and each answer. */
function runEdge(fn, opts) {
  const url = pathToFileURL(join(ROOT, 'supabase/functions', fn, 'index.ts')).href;
  const src = `
    globalThis.__calls = []; globalThis.__inflight = 0; globalThis.__maxInflight = 0;
    globalThis.Deno = { env: { get: (k) => (${JSON.stringify(opts.env || {})})[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    const routes = ${JSON.stringify(opts.routes || [])}.map(([re, r]) => [new RegExp(re), r]);
    globalThis.fetch = async (u, init) => {
      const s = String(u);
      globalThis.__calls.push((init && init.method || "GET") + " " + s);
      const hit = routes.find(([re]) => re.test(s));
      if (!hit) return new Response("unexpected " + s, { status: 404, headers: { "content-type": "text/plain" } });
      const r = hit[1];
      globalThis.__inflight++; globalThis.__maxInflight = Math.max(globalThis.__maxInflight, globalThis.__inflight);
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
      globalThis.__inflight--;
      return new Response(r.body == null ? "" : r.body, { status: r.status || 200, headers: { "content-type": r.type || "application/json" } });
    };
    globalThis.WebSocket = class {
      constructor(u) { this.readyState = 1; globalThis.__calls.push("WS " + u);
        setTimeout(() => { this.onopen && this.onopen();
          for (const m of ${JSON.stringify(opts.wsMsgs || [])}) this.onmessage && this.onmessage({ data: JSON.stringify(m) });
          this.onclose && this.onclose({ code: 1000, reason: "upstream said: bye" }); }, 5); }
      send() {} close() {}
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(opts.requests)}) {
      const t0 = Date.now();
      const r = await globalThis.__h(new Request("http://relay.test/" + q));
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      out.push({ status: r.status, headers: h, body: await r.text(), ms: Date.now() - t0 });
    }
    process.stdout.write(JSON.stringify({ out, calls: globalThis.__calls, maxInflight: globalThis.__maxInflight }));
  `;
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(raw);
}

/* ── ① a bbox is four coordinates ──────────────────────────────────────────────────────────── */
test('R801 ① _shared/bbox.js refuses what is not a box and keeps the antimeridian reading', async () => {
  const { parseBbox } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/bbox.js')).href);
  assert.equal(parseBbox('0,0,1e9,1'), null, 'a longitude of 1e9 is not a coordinate');
  assert.equal(parseBbox('0,0,1e8,1'), null);
  assert.equal(parseBbox('-181,0,1,1'), null);
  assert.equal(parseBbox('0,-91,1,1'), null);
  assert.equal(parseBbox('0,5,1,4'), null, 'south above north');
  assert.equal(parseBbox('0,0,1'), null);
  assert.equal(parseBbox('a,b,c,d'), null);
  assert.equal(parseBbox(''), null);
  assert.equal(parseBbox(null), null);
  assert.deepEqual(parseBbox('119,21,123,26'), [119, 21, 123, 26]);
  assert.deepEqual(parseBbox('170,-10,-170,10'), [170, -10, -170, 10], 'w > e is a box across the antimeridian, not an error');
});

test('R801 ① aviation-feed answers 400 to a planet-sized bbox, at once, instead of building the fan', () => {
  const r = runEdge('aviation-feed', {
    routes: [],
    requests: ['?ch=view&bbox=0,0,1e9,1', '?ch=view&bbox=0,0,1e8,1', '?ch=view&bbox=190,0,1,1', '?ch=view&bbox=x,0,1,1'],
  });
  for (const o of r.out) {
    assert.equal(o.status, 400, 'not a box → 400: ' + o.body);
    assert.match(o.body, /bbox=w,s,e,n required/);
    /* the 1e8 span cost 4.3 s of CPU before; a refusal is a parse and a JSON.stringify */
    assert.ok(o.ms < 1500, 'the refusal must not pay for the fan first (' + o.ms + ' ms)');
  }
});

/* ── ② the bucket's arithmetic, now shared ──────────────────────────────────────────────────── */
test('R801 ② read-budget: floor(elapsed·rate) when empty, never above burst, never above rate on average', async () => {
  const { makeReadBudget } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/read-budget.js')).href);
  const RATE = 0.34, BURST = 6;
  const b = makeReadBudget({ ratePerSec: RATE, burst: BURST });
  assert.equal(b.take(6, 1000), 6, 'a bucket that has never refilled holds its full burst (#R504)');
  assert.equal(b.take(6, 1000 + 10000), Math.floor(10 * RATE), '10 s of refill grants floor(10 · rate)');
  b.seed(1000);
  assert.equal(b.take(9999, 1000 + 86400_000), BURST, 'a day of quiet still only fills the burst');
  b.seed(0);
  let got = 0;
  for (let t = 1; t <= 3600; t++) got += b.take(4, t * 1000);
  assert.ok(got <= Math.ceil(3600 * RATE) + BURST, `an hour of asking for 4 a second granted ${got}`);
  /* refund never overfills; peek does not spend */
  b.refund(100);
  assert.equal(b.tokens(), BURST);
  const before = b.tokens();
  b.peek(3600 * 1000 + 50000);
  assert.equal(b.tokens(), before, 'peek() is a reading, not a refill');
  /* seed(): empty as of that instant, refilled from there — what a cold isolate adopts from the ledger */
  b.seed(5000);
  assert.equal(b.take(1, 5000), 0);
  assert.equal(b.take(1, 5000 + Math.ceil(1000 / RATE) + 1), 1);
});

/* ── ⑥ quotes-relay ─────────────────────────────────────────────────────────────────────────── */
test('R801 ⑥ quotes-relay: a malformed percent-escape is a 400, a port is a 400, and a good chart url still passes', () => {
  const r = runEdge('quotes-relay', {
    routes: [['finance\\.yahoo\\.com', { body: '{"chart":{"result":[{}],"error":null}}' }]],
    requests: [
      '?u=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/%E0%A4%A?range=1d'),
      '?u=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/AAPL%?range=1d'),
      '?u=' + encodeURIComponent('https://query1.finance.yahoo.com:8443/v8/finance/spark?symbols=AAPL'),
      '?u=' + encodeURIComponent('https://user:pw@query1.finance.yahoo.com/v8/finance/spark?symbols=AAPL'),
      '?u=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/BRK-B?range=1d&interval=1d'),
    ],
  });
  const [bad1, bad2, port, user, ok] = r.out;
  assert.equal(bad1.status, 400, 'URIError from decodeURIComponent used to escape as a 500');
  assert.equal(bad2.status, 400);
  assert.equal(port.status, 400, 'a port is another origin');
  assert.equal(user.status, 400, 'userinfo is refused');
  assert.equal(ok.status, 200, ok.body);
  assert.equal(r.calls.length, 1, 'only the admitted url was fetched');
});

/* ── ⑧ ais-feed ─────────────────────────────────────────────────────────────────────────────── */
const POS = (mmsi, lat, lon) => ({ MessageType: 'PositionReport', MetaData: { MMSI: mmsi, time_utc: new Date().toISOString() },
  Message: { PositionReport: { Latitude: lat, Longitude: lon, Sog: 10, Cog: 90, TrueHeading: 91 } } });
const DT = { features: [
  { mmsi: 230001, properties: { sog: 5, cog: 10, heading: 11, navStat: 0, timestampExternal: Date.now() }, geometry: { coordinates: [24.9, 60.1] } },
] };

test('R801 ⑧ ais-feed: ?refresh=1 goes upstream only as often as the bucket grants; the public answers carry no secret shape and no upstream text', () => {
  const src = rd('supabase/functions/ais-feed/index.ts');
  const BURST = +(/const REFRESH_BURST = (\d+);/.exec(src) || [])[1];
  assert.ok(BURST >= 1, 'REFRESH_BURST is declared');
  const key = 'abcdef0123456789';
  const r = runEdge('ais-feed', {
    env: { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: key, AIS_STORAGE_KEY: 'svc' },
    routes: [
      ['storage/v1/object/public/', { status: 404, body: 'nope', type: 'text/plain' }],
      ['storage/v1/object/', { body: '{"Key":"ais/world.json"}' }],
      ['storage/v1/bucket', { body: '{"name":"ais"}' }],
      ['digitraffic\\.fi/api/ais/v1/locations', { body: JSON.stringify(DT) }],
      ['digitraffic\\.fi/api/ais/v1/vessels', { body: '[]' }],
    ],
    wsMsgs: [POS(412000001, 24.2, 121.9)],
    requests: [
      '?refresh=1&ws=1000', '?refresh=1&ws=1000', '?refresh=1&ws=1000', '?refresh=1&ws=1000',
      '?meta=1', '?bbox=119,21,123,26', '?bbox=0,0,1e9,1',
    ],
  });
  const upstreamRounds = r.calls.filter((c) => /ais\/v1\/locations/.test(c)).length;
  assert.equal(upstreamRounds, BURST, `four forced refreshes bought ${upstreamRounds} upstream rounds; the burst is ${BURST}`);
  assert.equal(r.calls.filter((c) => /^WS /.test(c)).length, BURST, 'and as many aisstream sockets');
  for (const o of r.out.slice(0, 4)) assert.equal(o.status, 200, 'a denied refresh is still served: ' + o.body);
  const meta = JSON.parse(r.out[4].body);
  assert.equal(meta.upstream.refreshDenied, 4 - BURST, 'the denials are counted where ?meta=1 can show them');
  assert.equal(meta.aisstreamConfigured, true, 'whether a key is set is still answered');
  assert.equal(meta.aisstreamCredential, undefined, 'the length and character classes of the secret are not');
  const everything = r.out.map((o) => JSON.stringify(o.headers) + o.body).join('\n');
  assert.ok(!everything.includes(key), 'the key is nowhere');
  assert.ok(!/len16|"len"|"classes"|"candidates"/.test(everything), 'nor its shape');
  assert.ok(!everything.includes('upstream said'), 'nor the close reason the socket carried');
  /* the lifecycle facts #R510/#R556 diagnose from are still in the note */
  const note = r.out[0].headers['x-intmap-note'];
  assert.match(note, /open:rs1/);
  assert.match(note, /close:1000(\||\]|$)/, 'the close CODE is kept, the reason is not: ' + note);
  /* the bbox is read by the shared rule: a box is a view, a non-box is the world */
  assert.equal(r.out[5].headers['x-intmap-channel'], 'view');
  assert.equal(r.out[6].headers['x-intmap-channel'], 'world', 'a planet-sized bbox is «no box» for ais-feed, as before');
  assert.equal(r.out[6].status, 200);
});

/* ── the two functions read their box through the one shared rule ────────────────────────────── */
test('R801 ⑧ both feeds import parseBbox from _shared/bbox.js and neither keeps a copy', () => {
  for (const fn of ['aviation-feed', 'ais-feed']) {
    const s = rd('supabase/functions/' + fn + '/index.ts');
    assert.match(s, /import \{ parseBbox \} from "\.\.\/_shared\/bbox\.js";/, fn + ' imports the shared reader');
    assert.ok(!/function parseBbox\(/.test(s), fn + ' has no private copy of it');
    assert.match(s, /import \{ makeReadBudget \} from "\.\.\/_shared\/read-budget\.js";/, fn + ' draws from the shared bucket');
  }
});
}
