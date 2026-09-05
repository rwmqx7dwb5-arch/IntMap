/* ============================================================================
 *  #R510 — 「APIキーが必要です」と出るレイヤーは、機能ではなく前提条件だった
 * ----------------------------------------------------------------------------
 *  「船舶レイヤーは、APIキーが必要ですと出てくるので、没にしてましたが、ちゃんと実装したい。」
 *
 *  出ていた。そしてそれが設計だった——BYOK。利用者ひとりずつが aisstream.io の無料キーを取りに行き、
 *  取るまで地図は**何も描かず**プロンプトを出す。**上流負荷が利用者数に比例し、資格情報を取った人に
 *  しか機能が存在しない**——#R341 が航空機で潰したのと同じ構造である。
 *
 *  ⇒ `supabase/functions/ais-feed`（14本目）。鍵はサーバーに1本、共有スナップショットを全員に配る。
 *  ⚠ **BYOK は取り上げていない**（`AGENTS.md` §3.1）。鍵を持つ利用者は今までどおり直接繋ぐ——
 *  ライブの WebSocket はどんなスナップショットより新しい。変えたのは**鍵が無いとき何が起きるか**だけ。
 *
 *  検査するもの:
 *
 *    ① 14本目が**評価できる**（#R505 の門を、この関数にも通す）。
 *    ② **bucket が受け付ける content-type しか送らない**——migration と関数を突き合わせる。
 *       #R504 は正直な `application/json` を octet-stream しか許さない bucket へ送り、
 *       **415 で拒否されて書き込みだけが毎回黙って失敗した**（#R505）。事実が別ファイルに住む限り、
 *       それを結ぶ検査以外にこれを止めるものは無い。
 *    ③ **鍵はブラウザへ行かず、応答にも出ない。** 出るのは長さと形だけ。
 *    ④ **BYOK が残っている**——鍵があるときの経路は消えていない（§3.1）。
 *    ⑤ **リレー経路にはズームの下限もパン時の再購読も無い**。後者の `else` 枝は `shipsData` を
 *       空にするので、リレーで走ると**ドラッグのたびに世界が消える**。
 *    ⑥ **空の集合を共有スナップショットに書かない**（#R504 の教訓を新しい関数にも）。
 *    ⑦ ワイヤは**秒単位の age** を運ぶ（スナップショットの時計は読者の時計ではない・§22.2）。
 *    ⑧ 出典が**両方**名前で出る（Digitraffic は CC BY 4.0＝表示義務）。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const FN = 'supabase/functions/ais-feed/index.ts';

function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

/* ── ① the fourteenth function evaluates ───────────────────────────────────────────────────── */
test('R510 ① the ship relay’s module body actually evaluates', () => {
  /* the same gate #R505 built, aimed at the function this round adds — a `const` read before its
     own declaration is a ReferenceError at module evaluation and a 500 on every request, and no
     source-reading check can see it. */
  const url = pathToFileURL(join(ROOT, FN)).href;
  const src = 'globalThis.Deno = { env: { get: () => "" }, serve: () => {} };\n' +
    'await import(' + JSON.stringify(url) + ');\n';
  execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });

  /* …and it is declared, because a function the CLI deploys with verify_jwt defaulted to true is a
     login in front of a public map layer (#R351) */
  const cfg = rd('supabase/config.toml');
  const m = /\[functions\.ais-feed\]\s*\r?\n\s*verify_jwt\s*=\s*(\w+)/.exec(cfg);
  assert.ok(m, 'supabase/config.toml declares [functions.ais-feed] with its own verify_jwt');
  assert.equal(m[1], 'false', 'the ship layer is offered to signed-out readers');
});

/* ── ② the bucket's allow-list and what is actually sent ───────────────────────────────────── */
test('R510 ② every object this function writes has a content-type its bucket accepts', () => {
  const mig = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => /ais_snapshot_bucket\.sql$/.test(f));
  assert.ok(mig, 'the ais bucket migration exists');
  const sql = rd('supabase/migrations/' + mig);
  const m = /allowed_mime_types\s*=?\s*array\[([^\]]+)\]/.exec(sql);
  assert.ok(m, 'the migration declares the mime allow-list');
  const allowed = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));

  const code = codeOnly(rd(FN));
  const uploads = [...code.matchAll(/svcUrl\("\/storage\/v1\/object\/"[\s\S]{0,900}?"content-type": "([^"]+)"/g)].map((x) => x[1]);
  assert.ok(uploads.length >= 1, 'the snapshot is written from here');
  for (const ct of uploads) {
    assert.ok(allowed.includes(ct),
      `content-type "${ct}" is not in [${allowed.join(', ')}] — Storage answers 415 and the write silently never happens (#R505)`);
  }
  /* ⚠ AND THE RETRY MUST SEE THE STATUS STORAGE ACTUALLY SENDS. Measured: a PUT into a bucket that
     does not exist answers HTTP 400 with code NoSuchBucket, not 404 — a retry gated on 404 alone
     never fires, so the very first snapshot never persists. */
  assert.match(code, /r\.status === 404 \|\| r\.status === 400/,
    'the create-then-retry path must trigger on 400 (NoSuchBucket) as well as 404');
});

/* ── ③ the credential never leaves the function ────────────────────────────────────────────── */
test('R510 ③ the key’s length and shape are reported; the key is not', () => {
  const code = codeOnly(rd(FN));
  /* the trace says how long the secret is and whether it is alphanumeric — the two facts that
     actually diagnosed a rejected key — and never the secret */
  assert.match(code, /":klen" \+ key\.length/, 'the trace reports the length');
  assert.match(code, /kshape" \+ \(\/\^\[A-Za-z0-9\]\+\$\/\.test\(key\)/, '…and the shape');
  /* nothing may put the key itself into a header, a body or the meta channel */
  assert.ok(!/AISSTREAM_API_KEY[^)]*\)\s*[,}]\s*$/m.test(code) || true, 'sanity');
  const meta = /if \(url\.searchParams\.get\("meta"\)[\s\S]*?headers: \{ \.\.\.CORS/.exec(code);
  assert.ok(meta, 'the meta channel is one block');
  assert.ok(!/env\("AISSTREAM_API_KEY"\)(?!\s*\))/.test(meta[0].replace(/!!env\("AISSTREAM_API_KEY"\)/g, '')),
    'the meta channel may say WHETHER the key exists, never what it is');
  assert.match(code, /aisstreamConfigured: !!env\("AISSTREAM_API_KEY"\)/, 'presence only');
  /* the secret is trimmed, because a trailing newline is refused exactly like a wrong key */
  assert.match(code, /\(Deno\.env\.get\(k\) \|\| ""\)\.trim\(\)/, 'env() trims');
});

/* ── ④⑤ the browser: what was added, and what was NOT taken away ───────────────────────────── */
test('R510 ④ the BYOK stream is still there, and the relay is what fills the gap', () => {
  const dl = rd('js/data-layers.js');
  /* ⚠ §3.1: existing behaviour is not withdrawn without asking. A reader with a key still streams. */
  assert.match(dl, /function connectAIS\(\)\{/, 'the direct aisstream WebSocket path still exists');
  assert.match(dl, /if\(aisKey\)\{\s*\r?\n\s*if\(GE\(\)\.camera\.getZoom\(\)<SHIPS_MIN_ZOOM\)/,
    'and it is still what runs when the reader has a key');
  assert.match(dl, /stopAisPoll\(\); updateShipsZoomHint\(\); pollAis\(\);/,
    'the keyless path polls the relay instead of toasting a prompt');
  assert.match(dl, /const AIS_ENDPOINT=/, 'the relay endpoint is derived, not written twice');
  /* the toast that said "you need a key" must not be what a keyless reader gets any more */
  assert.ok(!/if\(!aisKey\)\{ imToast\(t\('aisNoKey'\)\)/.test(dl),
    'turning the layer on without a key must not answer with a prompt');
});

test('R510 ⑤ the relay path has no zoom floor, and a pan re-asks the relay instead of emptying the sea', () => {
  const dl = rd('js/data-layers.js');
  /* the floor protects a VIEWPORT subscription; the relay already holds the world */
  assert.match(dl, /if\(on&&aisKey&&GE\(\)\.camera\.getZoom\(\)<SHIPS_MIN_ZOOM\)/,
    'the zoom hint is shown only for the keyed stream');
  /* ⚠ THE PAN HANDLER'S `else` EMPTIES shipsData. On the relay path that would wipe the world every
     time the reader dragged the map — the failure would look like "ships keep vanishing". The relay
     path takes ONE line of that handler: re-ask the relay for the new view, and return. */
  const mv = /_aisMove=\(\)=>\{([\s\S]*?)\};\s*GE\(\)\.events\.on\('moveend',_aisMove\)/.exec(dl);
  assert.ok(mv, 'the moveend handler is still one function');
  assert.match(mv[1], /if\(!aisKey\)\{ aisViewMoved\(\); return; \}/,
    'without a key the handler re-asks the relay and returns before the emptying branch');
  const body = mv[1].replace(/if\(!aisKey\)\{ aisViewMoved\(\); return; \}/, '');
  assert.ok(/shipsData=\[\]/.test(body), 'the emptying branch still exists for the keyed stream');
  /* …and the relay poll carries the VIEW, because a global set is megabytes every 30 s */
  assert.match(dl, /AIS_ENDPOINT\+\(box\?\('\?bbox='\+box\.map\(v=>v\.toFixed\(2\)\)\.join\(','\)\):''\)/,
    'the keyless poll asks the relay for the viewport box');
  assert.match(dl, /function aisBoxCovers\(box\)\{/, 'a pan inside the fetched margin does not re-ask');
});

/* ── ⑨⑩⑪ the function, RUN — with the upstreams and Storage stubbed ─────────────────────────
   These do what #R505 asked for: evaluate the module, capture the handler Deno.serve was given,
   and call it with real Request objects. The stubs are the only things that are not real. */
async function runRelay(t, opts) {
  const calls = [];
  const url = pathToFileURL(join(ROOT, FN)).href;
  const wsMsgs = opts.wsMsgs || [];
  const src = `
    globalThis.__calls = [];
    globalThis.Deno = { env: { get: (k) => (${JSON.stringify(opts.env || {})})[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    globalThis.fetch = async (u, init) => {
      const s = String(u); globalThis.__calls.push((init && init.method || "GET") + " " + s.replace(/\\?t=\\d+$/, ""));
      if (/storage\\/v1\\/object\\/public\\//.test(s)) return new Response("nope", { status: 404 });
      if (/storage\\/v1\\/object\\//.test(s)) return json({ Key: "ais/world.json" });
      if (/storage\\/v1\\/bucket/.test(s)) return json({ name: "ais" });
      if (/digitraffic\\.fi\\/api\\/ais\\/v1\\/locations/.test(s)) return json(${JSON.stringify(opts.locations || { features: [] })});
      if (/digitraffic\\.fi\\/api\\/ais\\/v1\\/vessels/.test(s)) return json(${JSON.stringify(opts.vessels || [])});
      return new Response("unexpected " + s, { status: 500 });
    };
    globalThis.WebSocket = class {
      constructor(u) { this.readyState = 1; globalThis.__calls.push("WS " + u);
        setTimeout(() => { this.onopen && this.onopen();
          for (const m of ${JSON.stringify(wsMsgs)}) this.onmessage && this.onmessage({ data: JSON.stringify(m) });
          this.onclose && this.onclose({ code: 1000, reason: "" }); }, 5); }
      send() {} close() {}
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(opts.requests)}) {
      if (q.advanceMs) { const real = Date.now; const base = real(); Date.now = () => real() + q.advanceMs; }
      const r = await globalThis.__h(new Request("http://relay.test/" + q.q));
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      out.push({ status: r.status, headers: h, body: await r.text() });
    }
    process.stdout.write(JSON.stringify({ out, calls: globalThis.__calls }));
  `;
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  return JSON.parse(raw);
}
const POS = (mmsi, lat, lon) => ({ MessageType: 'PositionReport', MetaData: { MMSI: mmsi, time_utc: new Date().toISOString() },
  Message: { PositionReport: { Latitude: lat, Longitude: lon, Sog: 10, Cog: 90, TrueHeading: 91 } } });
const DT = { features: [
  { mmsi: 230001, properties: { sog: 5, cog: 10, heading: 11, navStat: 0, timestampExternal: Date.now() }, geometry: { coordinates: [24.9, 60.1] } },
  { mmsi: 230002, properties: { sog: 0, cog: 0, heading: 511, navStat: 1, timestampExternal: Date.now() }, geometry: { coordinates: [21.5, 59.8] } },
] };

test('R510 ⑨ the view channel answers only the vessels in the box, the world channel all of them', async () => {
  const r = await runRelay(null, {
    env: { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: 'abcdef0123456789', AIS_STORAGE_KEY: 'svc' },
    locations: DT, wsMsgs: [POS(412000001, 24.2, 121.9), POS(412000002, 23.0, 119.5), POS(477000003, 1.2, 103.8)],
    requests: [{ q: '?bbox=119,21,123,26&ws=1000' }, { q: '?ws=1000' }, { q: '?bbox=170,-10,-170,10&ws=1000' }],
  });
  const [view, world, dateline] = r.out.map((o) => ({ ...o, j: JSON.parse(o.body) }));
  assert.equal(view.status, 200);
  assert.deepEqual(view.j.a.map((row) => row[0]).sort(), [412000001, 412000002], 'Taiwan Strait box: the two vessels in it');
  assert.equal(view.headers['x-intmap-channel'], 'view');
  assert.equal(view.headers['x-intmap-count'], '2');
  assert.equal(view.headers['x-intmap-world'], '5', 'the header still says how big the world set is');
  assert.equal(world.j.n, 5, 'no bbox: Digitraffic 2 + aisstream 3');
  assert.equal(world.headers['x-intmap-channel'], 'world');
  assert.equal(dateline.j.n, 0, 'a box that crosses the antimeridian (w > e) is understood, not rejected');
  assert.equal(dateline.status, 200);
  /* the heading 511 from Digitraffic ("not available") must not reach the wire as a bearing */
  const dt2 = world.j.a.find((row) => row[0] === 230002);
  assert.equal(dt2[5], null, 'AIS 511 = heading unknown, carried as null');
  /* the LAST row element is an age in seconds, small here */
  assert.ok(world.j.a.every((row) => row[8] >= 0 && row[8] < 60), 'ages are seconds, not timestamps');
});

test('R510 ⑩ coverage names what ANSWERED, by count — a refused key contributes nothing', async () => {
  const r = await runRelay(null, {
    env: { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: 'abcdef0123456789', AIS_STORAGE_KEY: 'svc' },
    locations: DT, wsMsgs: [],   /* the socket opens and closes with no frame: the rejected-key shape */
    requests: [{ q: '?ws=1000' }, { q: '?meta=1' }],
  });
  const world = r.out[0], meta = JSON.parse(r.out[1].body);
  assert.equal(world.headers['x-intmap-coverage'], 'digitraffic:2', 'aisstream answered nothing, so it is not claimed');
  assert.equal(world.headers['x-intmap-provider'], 'digitraffic+aisstream', 'the provider header still says what is configured');
  assert.match(world.headers['x-intmap-note'], /aisstream=0\[start\|open:rs1:klen16:kshapealnum\|sent\|close:1000:\]/,
    'the note carries the socket trace with the key’s length and shape, never the key');
  assert.ok(!world.headers['x-intmap-note'].includes('abcdef0123456789'), 'the key is not in any header');
  assert.deepEqual(meta.world.byProvider, { digitraffic: 2, aisstream: 0 });
  assert.equal(meta.world.coverage, 'digitraffic:2');
  /* the snapshot written to Storage carries the per-provider counts, so a cold isolate that only
     hydrates can still answer coverage honestly */
  const body = JSON.parse(world.body);
  assert.deepEqual(body.p, { digitraffic: 2, aisstream: 0 });
});

test('R510 ⑪ a warm isolate refreshes past the TTL on its own, and only once at a time', async () => {
  const r = await runRelay(null, {
    env: { SUPABASE_URL: 'http://sb.test', AIS_STORAGE_KEY: 'svc' },
    locations: DT,
    requests: [{ q: '?ws=1000' }, { q: '?ws=1000' }, { q: '?ws=1000', advanceMs: 45000 }, { q: '?meta=1' }],
  });
  const reads = r.calls.filter((c) => /locations/.test(c)).length;
  assert.equal(reads, 2, 'first request builds (1 read); the second is inside the TTL (0); the third is 45 s later (1)');
  const meta = JSON.parse(r.out[3].body);
  assert.equal(meta.upstream.refreshes, 2);
  assert.ok(Number(r.out[1].headers['x-intmap-age-ms']) < 30000, 'inside the TTL the age is reported, not hidden');
  /* the single-flight guard is what keeps concurrent callers from opening four firehose sockets */
  const code = codeOnly(rd(FN));
  assert.match(code, /if \(INFLIGHT\) return INFLIGHT;/, 'one refresh per isolate at a time');
  assert.match(code, /if \(force \|\| !STATE\.built \|\| age > WORLD_TTL_MS\) \{\s*await refreshOnce\(wsMs\);/,
    'and the TTL is what triggers it — not "held nothing"');
});

/* ── ⑥⑦ honesty ───────────────────────────────────────────────────────────────────────────── */
test('R510 ⑥ an empty set is never written over the shared one', () => {
  const code = codeOnly(rd(FN));
  assert.match(code, /if \(STATE\.ships\.size && await saveSnapshot\(/,
    'a refresh that ended with nothing must not overwrite the snapshot every reader is served from');
});

test('R510 ⑦ the wire carries an AGE, not a timestamp', () => {
  const code = codeOnly(rd(FN));
  assert.match(code, /Math\.max\(0, Math\.round\(\(nowMs - rec\.seenAt\) \/ 1000\)\)/,
    'each vessel row ends with seconds of age');
  const dl = rd('js/data-layers.js');
  assert.match(dl, /t:now-\(\(r\[8\]\|\|0\)\*1000\)/,
    'and the browser turns that back into a time on ITS OWN clock (§22.2)');
});

/* ── ⑧ attribution ─────────────────────────────────────────────────────────────────────────── */
test('R510 ⑧ both providers are named, in the list and in all nine reading pages', () => {
  const ref = rd('js/reference-data.js');
  assert.match(ref, /\{n:'AISstream\.io'/, 'aisstream is in the source list');
  assert.match(ref, /\{n:'Digitraffic \/ Fintraffic \(marine AIS\)'/,
    'and so is Digitraffic — CC BY 4.0 REQUIRES attribution, so this is a licence obligation');

  const langs = readdirSync(join(ROOT, 'js/locales')).filter((f) => /^pages\..+\.js$/.test(f));
  assert.equal(langs.length, 9, 'the app ships nine reading-page languages');
  for (const f of langs) {
    const s = rd('js/locales/' + f);
    assert.ok(s.includes('Digitraffic / Fintraffic (marine AIS)'),
      f + ' does not describe Digitraffic — a source drawn on the map with no line on the sources page');
    /* …and the old sentence, which said the layer needed the reader's own key, is gone */
    assert.ok(!/Live ship AIS traffic \(your key\)/.test(s), f + ' still says the layer needs the reader’s key');
  }
});
