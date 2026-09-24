/*
 *  R801 — 公開リレーの入力は「形式が合っている」ではなく「呼び出し元が実際に送るもの」で受ける
 *  ───────────────────────────────────────────────────────────────────────────────
 *  外部監査が挙げた欠陥を、**関数を実際に評価して**測る（ソースを読んで綴りを探さない。#R505）。
 *  Edge Function は子プロセスで評価し、`Deno.serve` に渡された handler を本物の Request で叩く。
 *  上流は fetch / WebSocket のスタブで、何が・何本同時に・どのホストへ訊かれたかを記録する。
 *
 *    ① `?bbox=` は座標である（aviation-feed: span 1e9 が `Invalid array length` を投げていた）
 *    ② _shared/read-budget.js の算術（#R504 の bucket をそのまま運んだこと）
 *    ③ alerts-relay: 索引の href は索引と同じ origin だけ／CAP の取得は上限付きの並列
 *    ④ alerts-relay: `?u=` は未知のクエリ鍵・ポート・違う scheme を拒み、自分の swicUrl は通す
 *    ⑤ alerts-relay: `?ma=` は MA_PARALLEL 本ずつ
 *    ⑥ quotes-relay: 不正な `%` は 400 であって 500 ではない／ポート付きは 400
 *    ⑦ radiation-sources: us-epa の series は登録局にしか URL を作らない（`..` は path にならない）
 *    ⑧ ais-feed: `?refresh=1` は bucket が許した回数しか上流へ行かない／公開 meta と note に秘密の形状も
 *       上流の文も無い／bbox は共有の規則で読む
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const UA = 'IntMap/1.0';

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

/* ── ③ ④ ⑤ alerts-relay ────────────────────────────────────────────────────────────────────── */
const TW_INDEX = 'https://alerts.ncdr.nat.gov.tw/RssAtomFeed.ashx';
const entry = (href, i) =>
  `<entry><title>中央氣象署 ${i}</title><updated>2026-09-18T0${i % 10}:00:00Z</updated><link href="${href}"/></entry>`;
const CAP_OK =
  '<alert><status>Actual</status><msgType>Alert</msgType><sent>2026-09-18T00:00:00+08:00</sent>' +
  '<senderName>中央氣象署</senderName><info><category>Met</category><event>大雨</event><severity>Severe</severity>' +
  '<expires>2999-01-01T00:00:00+08:00</expires><area><areaDesc>臺北市</areaDesc></area></info></alert>';

test('R801 ③ alerts-relay follows a CAP index link only on the index\'s own origin, and counts what it refused', () => {
  const links = [
    'https://alerts.ncdr.nat.gov.tw/Capstorage/CWA/a.cap',
    'https://evil.example/steal.cap',                      /* another host */
    'http://alerts.ncdr.nat.gov.tw/Capstorage/CWA/b.cap',   /* the right host on the wrong scheme */
    'https://alerts.ncdr.nat.gov.tw:8443/Capstorage/c.cap', /* the right host on another port */
    'https://user:pw@alerts.ncdr.nat.gov.tw/Capstorage/d.cap',
    'https://alerts.ncdr.nat.gov.tw/Capstorage/CWA/e.cap',
  ];
  const feed = '<feed>' + links.map(entry).join('') + '</feed>';
  const r = runEdge('alerts-relay', {
    routes: [
      ['RssAtomFeed\\.ashx', { body: feed, type: 'application/xml; charset=utf-8' }],
      ['\\.cap$', { body: CAP_OK, type: 'application/xml' }],
    ],
    requests: ['?cap=tw'],
  });
  assert.equal(r.out[0].status, 200, r.out[0].body);
  const j = JSON.parse(r.out[0].body);
  const fetched = r.calls.filter((c) => /\.cap$/.test(c)).map((c) => c.replace(/^GET /, ''));
  assert.deepEqual(fetched.sort(), [links[0], links[5]].sort(), 'only the index\'s own https origin is fetched');
  assert.ok(!r.calls.some((c) => /evil\.example/.test(c)), 'no byte was asked of the other host');
  assert.equal(j.offHost, 4, 'the refused links are counted in the answer, not lost');
  assert.equal(j.indexTotal, 2);
  assert.equal(j.count, 2, 'the two bulletins on the right origin were read');
});

test('R801 ③ CAP files are fetched at most CAP_PARALLEL at a time, each under a byte ceiling and a content-type rule', () => {
  const src = rd('supabase/functions/alerts-relay/index.ts');
  const PAR = +(/const CAP_PARALLEL = (\d+);/.exec(src) || [])[1];
  assert.ok(PAR >= 2, 'CAP_PARALLEL is declared');
  const n = 18;
  const feed = '<feed>' + Array.from({ length: n }, (_, i) => entry('https://alerts.ncdr.nat.gov.tw/cap/' + i + '.cap', i)).join('') + '</feed>';
  const r = runEdge('alerts-relay', {
    routes: [
      ['RssAtomFeed\\.ashx', { body: feed, type: 'application/xml' }],
      ['/cap/1\\.cap$', { body: '<html>login</html>', type: 'text/html' }],
      ['\\.cap$', { body: CAP_OK, type: 'application/xml', delayMs: 40 }],
    ],
    requests: ['?cap=tw'],
  });
  const j = JSON.parse(r.out[0].body);
  assert.equal(r.calls.filter((c) => /\.cap$/.test(c)).length, n, 'every link on the right origin was asked');
  assert.ok(r.maxInflight <= PAR, `at most ${PAR} in flight, measured ${r.maxInflight}`);
  assert.ok(r.maxInflight >= 2, 'and it is a pool, not a serial walk (' + r.maxInflight + ')');
  assert.equal(j.count, n - 1, 'the HTML answer was refused by the content-type rule and did not become a bulletin');
  assert.equal(j.unread, 1, 'and that refusal is counted');
  /* the guard is the shared one: a byte ceiling is declared for both the index and the files */
  assert.match(src, /maxBytes: CAP_INDEX_MAX_BYTES/);
  assert.match(src, /maxBytes: CAP_FILE_MAX_BYTES/);
  assert.ok(!/await fetch\(/.test(src), 'no upstream read in alerts-relay bypasses fetchGuarded');
});

test('R801 ④ ?u= refuses query keys nobody sends, ports, userinfo and the wrong scheme — and admits its own swicUrl', () => {
  const CN = 'https://www.nmc.cn/rest/findAlarm';
  const r = runEdge('alerts-relay', {
    routes: [
      ['nmc\\.cn', { body: '{"data":{"page":{"list":[]}}}' }],
      ['severeweather\\.wmo\\.int', { body: '{"type":"FeatureCollection","features":[]}' }],
    ],
    requests: [
      '?u=' + encodeURIComponent('http://www.nmc.cn/rest/findAlarm?pageNo=1&pageSize=300&signaltype=&signallevel=&province='),
      '?u=' + encodeURIComponent('http://www.nmc.cn/rest/findAlarm?pageNo=1&evil=1'),
      '?u=' + encodeURIComponent(CN + '?pageNo=1'),
      '?u=' + encodeURIComponent('https://feeds.meteoalarm.org:8443/api/v1/warnings/feeds-germany'),
      '?u=' + encodeURIComponent('https://feeds.meteoalarm.org/api/v1/warnings/feeds-germany?x=1'),
      '?u=' + encodeURIComponent('https://user:pw@www.nmc.cn/rest/findAlarm'),
      '?u=' + encodeURIComponent('https://severeweather.wmo.int/f/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=other:layer&outputFormat=application/json'),
      '?u=' + encodeURIComponent('https://severeweather.wmo.int/f/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=local_postgis:postgis_geojsons&outputFormat=text/csv'),
      '?u=' + encodeURIComponent("https://severeweather.wmo.int/f/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=local_postgis:postgis_geojsons&outputFormat=application/json&cql_filter=1=1"),
      '?swic=070',
    ],
  });
  const [cnOk, cnKey, cnScheme, maPort, maKey, cnUser, wfsType, wfsFmt, wfsCql, swic] = r.out;
  assert.equal(cnOk.status, 200, 'what js/world-packs.js sends for the CMA list is relayed: ' + cnOk.body);
  assert.equal(cnKey.status, 400, 'an unknown query key is refused');
  assert.equal(cnScheme.status, 200, '(#R803) https is what js/world-packs.js actually sends for the CMA list, and the upstream answers it — refusing it blanked China on production');
  assert.equal(maPort.status, 400, 'a port is another origin');
  assert.equal(maKey.status, 400, 'the MeteoAlarm feed takes no query');
  assert.equal(cnUser.status, 400, 'userinfo is refused');
  assert.equal(wfsType.status, 400, 'another GeoServer layer is not relayed');
  assert.equal(wfsFmt.status, 400, 'nor another output format');
  assert.equal(wfsCql.status, 400, 'nor an arbitrary cql_filter');
  /* the rule admits what this function itself composes: take the URL ?swic= actually fetched
     and offer it back through ?u= */
  assert.equal(swic.status, 200, swic.body);
  const composed = r.calls.map((c) => c.replace(/^GET /, '')).find((c) => /severeweather\.wmo\.int\/f\/wfs/.test(c));
  assert.ok(composed, 'the swic path fetched its WFS url');
  const again = runEdge('alerts-relay', {
    routes: [['severeweather\\.wmo\\.int', { body: '{"type":"FeatureCollection","features":[]}' }]],
    requests: ['?u=' + encodeURIComponent(composed)],
  });
  assert.equal(again.out[0].status, 200, 'the allow-list admits the function\'s own WFS request: ' + again.out[0].body);
  /* no request above reached an upstream it should not have */
  assert.ok(!r.calls.some((c) => /evil=1|:8443|x=1|other:layer|text\/csv|1=1/.test(c)), 'a refused URL was fetched anyway: ' + r.calls.join(' '));
});

test('R801 ⑤ ?ma= fetches MA_PARALLEL countries at a time, not all six at once', () => {
  const src = rd('supabase/functions/alerts-relay/index.ts');
  const PAR = +(/const MA_PARALLEL = (\d+);/.exec(src) || [])[1];
  assert.ok(PAR >= 1 && PAR < 6, 'MA_PARALLEL is declared and smaller than the country cap');
  const r = runEdge('alerts-relay', {
    routes: [['feeds\\.meteoalarm\\.org', { body: '{"warnings":[]}', delayMs: 40 }]],
    requests: ['?ma=germany,france,italy,spain,austria,poland'],
  });
  assert.equal(r.out[0].status, 200, r.out[0].body);
  assert.equal(r.calls.filter((c) => /feeds-/.test(c)).length, 6, 'all six countries were asked');
  assert.ok(r.maxInflight <= PAR, `at most ${PAR} in flight, measured ${r.maxInflight}`);
  assert.equal(Object.keys(JSON.parse(r.out[0].body).countries).length, 6);
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

/* ── ⑦ radiation-sources ────────────────────────────────────────────────────────────────────── */
test('R801 ⑦ us-epa builds a series url only for a registered station — a code with ".." has nothing to ask for', async () => {
  const { PROVIDERS } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/radiation-sources.js')).href);
  const p = PROVIDERS.find((x) => x.id === 'us-epa');
  assert.ok(p && p.series, 'us-epa has a series mode');
  for (const code of ['../../../etc/passwd', 'WA/../../x', '..', 'wa/richland/..', 'x', '']) {
    assert.deepEqual(p.series.urls({ code, to: '2026-09-09T00:00:00Z' }), [], 'no url for unregistered code ' + JSON.stringify(code));
  }
  const a = p.series.urls({ code: 'WA/RICHLAND', to: '2026-09-09T00:00:00Z' });
  const b = p.series.urls({ code: 'wa/richland', to: '2026-09-09T00:00:00Z' });
  assert.equal(a.length, 1);
  assert.deepEqual(a, b, 'the registered spelling is what goes upstream, whatever case the caller used');
  assert.match(a[0], /^https:\/\/radnet\.epa\.gov\/cdx-radnet-rest\/api\/rest\/csv\/2026\/fixed\/WA\/RICHLAND$/);
  /* a code the register knows but spelt with a space is still the register's path, encoded */
  const c = p.series.urls({ code: 'wi/la crosse' });
  assert.match(c[0], /\/fixed\/wi\/la%20crosse$/);
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
