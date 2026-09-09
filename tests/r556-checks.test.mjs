/* ============================================================================
 *  #R556 — 船が出なかったのは鍵の問題ではなく、届いていたフレームを捨てていたから
 * ----------------------------------------------------------------------------
 *  「船舶レイヤーが表示されない。」
 *
 *  本番実測: aisstream の socket は 15 秒で **1,224 フレーム**を運んでいた。保持された船は **0**。
 *  WebSocket の既定 binaryType は 'blob' で、`String(ev.data)` は文字列 "[object Blob]" になり、
 *  `JSON.parse` が投げ、catch が飲む——**バルト海の外の全世界が空の海**になっていた。
 *  ⚠ #R510 のスタブは `data: JSON.stringify(m)` と**文字列**を送っていたので、
 *  この欠陥を一度も再現できなかった。**実物より寛容な fixture は、実物の壊れ方を隠す。**
 *
 *  検査するもの:
 *    ① バイトで届いたフレームが**船として保持される**（本番で起きていた退行そのもの）
 *    ② 保存値に包まれた資格情報が**取り出されて使われ**、包みは応答のどこにも出ない
 *    ③ aisstream の socket は**同時に1本だけ**（鍵1本あたり3接続・4本目は無言で拒否される）
 *    ④ 集合は**自分が届く範囲**を、保持している船から導いて名乗る（`cov`）
 *    ⑤ ブラウザ側でも**生のフレームを JSON.parse へ渡す経路が1つも無い**（BYOK 経路の同じ欠陥）
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const FN = 'supabase/functions/ais-feed/index.ts';

const POS = (mmsi, lat, lon) => ({
  MessageType: 'PositionReport',
  MetaData: { MMSI: mmsi, time_utc: new Date().toISOString() },
  Message: { PositionReport: { Latitude: lat, Longitude: lon, Sog: 10, Cog: 90, TrueHeading: 91 } },
});
const DT = { features: [
  { mmsi: 230001, properties: { sog: 5, cog: 10, heading: 11, navStat: 0, timestampExternal: Date.now() }, geometry: { coordinates: [24.9, 60.1] } },
] };

/*  the relay under a stub that behaves like the REAL upstream:
 *   · frames arrive as bytes unless `asText`
 *   · only `acceptKey` is accepted; anything else is thrown off the way aisstream throws it off
 *   · concurrent sockets are counted, because the cap is three and the fourth dies in silence
 */
async function runRelay(opts) {
  const url = pathToFileURL(join(ROOT, FN)).href;
  const src = [
    'globalThis.__calls = []; globalThis.__peakSockets = 0; let live = 0;',
    'globalThis.Deno = { env: { get: (k) => (' + JSON.stringify(opts.env || {}) + ')[k] || "" }, serve: (h) => { globalThis.__h = h; } };',
    'const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });',
    'globalThis.fetch = async (u) => {',
    '  const s = String(u);',
    '  if (s.indexOf("/storage/v1/object/public/") >= 0) return new Response("nope", { status: 404 });',
    '  if (s.indexOf("/storage/v1/object/") >= 0) return json({ Key: "ais/world.json" });',
    '  if (s.indexOf("/storage/v1/bucket") >= 0) return json({ name: "ais" });',
    '  if (s.indexOf("/api/ais/v1/locations") >= 0) return json(' + JSON.stringify(opts.locations || { features: [] }) + ');',
    '  if (s.indexOf("/api/ais/v1/vessels") >= 0) return json([]);',
    '  return new Response("unexpected " + s, { status: 500 });',
    '};',
    'const ACCEPT = ' + JSON.stringify(opts.acceptKey || null) + ';',
    'const AS_TEXT = ' + JSON.stringify(!!opts.asText) + ';',
    'const MSGS = ' + JSON.stringify(opts.wsMsgs || []) + ';',
    'const ENC = new TextEncoder();',
    'globalThis.WebSocket = class {',
    '  constructor(u) {',
    '    this.readyState = 1; this.binaryType = "blob"; this._closed = false;',
    '    live++; if (live > globalThis.__peakSockets) globalThis.__peakSockets = live;',
    '    globalThis.__calls.push("WS " + u);',
    '    setTimeout(() => { this.onopen && this.onopen(); }, 2);',
    '  }',
    '  send(body) {',
    '    let key = ""; try { key = JSON.parse(body).APIKey; } catch (_) {}',
    '    globalThis.__calls.push("SUB " + key);',
    '    setTimeout(() => {',
    '      if (ACCEPT && key !== ACCEPT) { this.onerror && this.onerror({ message: "" }); this._end(1006); return; }',
    '      for (const m of MSGS) {',
    '        const txt = JSON.stringify(m);',
    /* ⚠ THE POINT OF THIS WHOLE FILE: the real upstream sends BYTES. A stub that only ever sends
       strings cannot fail the way production failed. A reader that did not ask for arraybuffer is
       handed the object whose toString is the literal text "[object Blob]" — exactly what the
       browser hands it. */
    '        const data = AS_TEXT ? txt : (this.binaryType === "arraybuffer" ? ENC.encode(txt).buffer : { toString: () => "[object Blob]" });',
    '        this.onmessage && this.onmessage({ data: data });',
    '      }',
    '    }, 4);',
    '  }',
    '  _end(code) { if (this._closed) return; this._closed = true; live--; this.onclose && this.onclose({ code: code, reason: "" }); }',
    '  close() { if (this._closed) return; this._closed = true; live--; }',
    '};',
    'await import(' + JSON.stringify(url) + ');',
    'const out = [];',
    'for (const q of ' + JSON.stringify(opts.requests) + ') {',
    '  const r = await globalThis.__h(new Request("http://relay.test/" + q.q));',
    '  const h = {}; r.headers.forEach((v, k) => { h[k] = v; });',
    '  out.push({ status: r.status, headers: h, body: await r.text() });',
    '}',
    'process.stdout.write(JSON.stringify({ out: out, calls: globalThis.__calls, peakSockets: globalThis.__peakSockets }));',
  ].join('\n');
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 });
  return JSON.parse(raw);
}

/* ── ① a frame that arrives as bytes is a ship, not a discarded string ───────────────────────── */
test('R556 ① vessels delivered as BINARY frames are kept — the regression that emptied the world', async () => {
  const env = { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: 'abcdef0123456789', AIS_STORAGE_KEY: 'svc' };
  const wsMsgs = [POS(412000001, 24.2, 121.9), POS(477000003, 1.2, 103.8)];
  const bin = await runRelay({ env, locations: DT, wsMsgs, requests: [{ q: '?ws=1200' }] });
  const txt = await runRelay({ env, locations: DT, wsMsgs, asText: true, requests: [{ q: '?ws=1200' }] });
  const jb = JSON.parse(bin.out[0].body), jt = JSON.parse(txt.out[0].body);
  assert.equal(jb.n, 3, 'Digitraffic 1 + two vessels that arrived as BYTES');
  assert.equal(jb.p.aisstream, 2, 'the binary frames counted as aisstream vessels');
  assert.deepEqual(jb.a.map((r) => r[0]).sort(), jt.a.map((r) => r[0]).sort(),
    'bytes and text carry the same vessels — the reader does not get to choose which arrives');
});

/* ── ② the credential the stored value CONTAINS is the one that gets used ────────────────────── */
test('R556 ② a credential wrapped in something else is recovered, and the wrapping never escapes', async () => {
  const real = '0123456789abcdef0123456789abcdef01234567';        /* 40 hex, the shape aisstream issues */
  const stored = 'AISstream free tier - my key = ' + real;         /* what a paste through a shell leaves */
  const r = await runRelay({
    env: { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: stored, AIS_STORAGE_KEY: 'svc' },
    locations: DT, wsMsgs: [POS(412000001, 24.2, 121.9)], acceptKey: real,
    requests: [{ q: '?ws=1200' }, { q: '?meta=1' }],
  });
  const world = JSON.parse(r.out[0].body), meta = JSON.parse(r.out[1].body);
  assert.equal(world.p.aisstream, 1, 'the embedded credential was tried and accepted');
  assert.equal(meta.aisstreamCredential.acceptedForm, 'after-delimiter', 'and the function says WHICH form worked');
  /* neither the wrapping nor the credential may appear anywhere in any answer */
  for (const o of r.out) {
    const all = JSON.stringify(o.headers) + o.body;
    assert.ok(!all.includes(real), 'the credential is not in a header or a body');
    assert.ok(!all.includes(stored), 'nor is the value it was wrapped in');
  }
  assert.equal(meta.aisstreamCredential.len, stored.length, 'the shape report gives the length…');
  assert.ok(meta.aisstreamCredential.candidates.some((c) => c.len === 40 && c.shape === 'hex'),
    '…and the shape of each candidate');
});

/* ── ②b a quoted secret is unwrapped ────────────────────────────────────────────────────────── */
test('R556 ②b quotes a shell did not strip are removed, and the quotes must match', async () => {
  /* ⚠ THIS EXISTS BECAUSE CODEQL FOUND WHAT NO TEST HERE COULD. The first implementation built the
     unwrapping pattern by string concatenation and wrote '([\\s\\S]*)' inside a single-quoted
     string — where \\s and \\S are the letters s and S — so it only matched a quoted value made
     entirely of s and S. The value THIS round had to recover was not quoted, so every test passed. */
  const real = 'abcdef0123456789abcdef0123456789abcdef01';
  for (const q of ['"', "'"]) {
    const r = await runRelay({
      env: { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: q + real + q, AIS_STORAGE_KEY: 'svc' },
      locations: DT, wsMsgs: [POS(412000001, 24.2, 121.9)], acceptKey: real,
      requests: [{ q: '?ws=1200' }, { q: '?meta=1' }],
    });
    const meta = JSON.parse(r.out[1].body);
    assert.equal(JSON.parse(r.out[0].body).p.aisstream, 1, 'a value wrapped in ' + q + ' still connects');
    assert.equal(meta.aisstreamCredential.acceptedForm, 'dequoted');
  }
  /* mismatched quotes are NOT a quoted value — stripping them would invent a credential */
  const odd = await runRelay({
    env: { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: '"' + real + "'", AIS_STORAGE_KEY: 'svc' },
    locations: DT, wsMsgs: [POS(412000001, 24.2, 121.9)], acceptKey: real,
    requests: [{ q: '?meta=1' }],
  });
  const forms = JSON.parse(odd.out[0].body).aisstreamCredential.candidates.map((c) => c.form);
  assert.ok(!forms.includes('dequoted'), 'an opening quote is only a quote if the same character closes it');
});

/* ── ③ one socket at a time: the fourth connection dies without a word ───────────────────────── */
test('R556 ③ candidates are tried one socket at a time', async () => {
  const real = 'ffffffffffffffffffffffffffffffffffffffff';
  const r = await runRelay({
    env: { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: 'label = ' + real, AIS_STORAGE_KEY: 'svc' },
    locations: DT, wsMsgs: [POS(412000001, 24.2, 121.9)], acceptKey: real,
    requests: [{ q: '?ws=1200' }],
  });
  assert.equal(r.peakSockets, 1,
    'aisstream caps a key at three connections and refuses the fourth in silence (#R510) — probing must never stack sockets');
  const subs = r.calls.filter((c) => c.indexOf('SUB ') === 0);
  assert.ok(subs.length >= 2, 'the stored value was tried before the credential inside it');
  assert.equal(subs[subs.length - 1], 'SUB ' + real, 'and the accepted candidate is the one left running');
});

/* ── ④ the set says how far it reaches, from its own vessels ─────────────────────────────────── */
test('R556 ④ the answer carries the envelope of what the relay actually holds', async () => {
  const r = await runRelay({
    env: { SUPABASE_URL: 'http://sb.test', AISSTREAM_API_KEY: 'abcdef0123456789', AIS_STORAGE_KEY: 'svc' },
    locations: DT, wsMsgs: [POS(412000001, 24.2, 121.9)],
    requests: [{ q: '?ws=1200' }, { q: '?bbox=-60,-40,-50,-30' }],
  });
  const world = JSON.parse(r.out[0].body), empty = JSON.parse(r.out[1].body);
  assert.ok(Array.isArray(world.cov) && world.cov.length === 4, 'the world answer names its envelope');
  const [w, s, e, n] = world.cov;
  assert.ok(w <= 24.9 && e >= 121.9 && s <= 24.2 && n >= 60.1, 'the envelope contains every vessel held');
  assert.equal(empty.n, 0, 'the South Atlantic box holds nothing');
  assert.deepEqual(empty.cov, world.cov,
    'a caller who got NOTHING is told what this relay can see — an empty box must not describe itself');
});

/* ── ⑤ no path in the browser hands a raw frame to JSON.parse ────────────────────────────────── */
test('R556 ⑤ every AIS socket in the browser reads the frame it was actually sent', () => {
  /* ⚠ discovered, never listed: the files come off disk, so a second copy of this socket cannot be
     added in a file this test was not told about. */
  const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  let sockets = 0;
  for (const f of files) {
    const src = rd('js/' + f);
    if (!/aisstream/.test(src)) continue;
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    walk.simple(ast, {
      NewExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'WebSocket') return;
        const a = node.arguments[0];
        /* the HOST, not a substring: 'aisstream.io.evil.example' is a different server, and a check
           that only asks "does the URL contain aisstream.io" would happily bless a socket pointed
           somewhere else (CodeQL js/incomplete-url-substring-sanitization — it is right). */
        if (!a || a.type !== 'Literal') return;
        let host = '';
        try { host = new URL(String(a.value)).hostname; } catch (_) { return; }
        if (host !== 'stream.aisstream.io') return;
        sockets++;
        const near = src.slice(node.start, node.start + 400);
        assert.match(near, /binaryType\s*=\s*['"]arraybuffer['"]/,
          'js/' + f + ": the aisstream socket must ask for bytes it can read — the default is 'blob', " +
          'and String(blob) is the text "[object Blob]" (#R556 measured 1,224 frames kept as 0 vessels)');
      },
      CallExpression(node) {
        const c = node.callee;
        if (c.type !== 'MemberExpression' || !c.object || c.object.name !== 'JSON' || !c.property || c.property.name !== 'parse') return;
        const arg = node.arguments[0];
        if (arg && arg.type === 'MemberExpression' && arg.property && arg.property.name === 'data') {
          assert.fail('js/' + f + ': JSON.parse(<event>.data) parses whatever the frame toString gives — ' +
            'decode the frame first (#R556)');
        }
      },
    });
  }
  assert.ok(sockets >= 1, 'the BYOK socket still exists — it was not removed, it was fixed (AGENTS.md §3.1)');
});
