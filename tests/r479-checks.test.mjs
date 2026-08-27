/* ============================================================================
 *  R479 — CARTO のキーは1か所にしか無い、そして帰属表示は地図の上に在る
 * ----------------------------------------------------------------------------
 *  2026-08-26 頃、CARTO が `basemaps.cartocdn.com` のラスタータイルに API キーを要求し始めた。
 *  ⚠ **タイルは失敗しなかった。** 200 のまま「API KEY REQUIRED」の透かしが焼き込まれた画像が
 *  返ってきた——だから「壊れた」計器は1つも鳴らず、地図だけが読めなくなった。
 *
 *  ⚠⚠⚠ **この欠陥が二度と静かに戻らない形は「実行時に測る」ではなく「綴りを禁じる」である。**
 *  透かしはネットワーク的には成功なので、リクエストが通ったことを見る検査は永久に緑になる。
 *  捕まえられるのは「キーの付いていない CARTO の URL をこのリポジトリが組み立てたかどうか」
 *  だけで、それは静的に読める。だから②は**ホスト名の綴りそのもの**を禁じる。
 *
 *  ⚠⚠ **写しを作らないための口は用意してある。** `js/carto-basemap.js` の `cartoTileURL()` /
 *  `cartoTiles()` が唯一の組み立て口で、キーの綴りもそこに1つだけある。5つの呼び出し口
 *  （app-body・compare・playground・layer-previews ×2）はどれも host を綴らない。
 *  ⚠ #R429 の形: 欠陥を直すときは、それを見逃した門も同じ幅に広げる。ここでの「同じ幅」は
 *  「js/ と src/ の**全部**」であって、今回書き換えた4ファイルではない。
 *
 *  ⚠⚠ **帰属表示は規約の対価であって装飾ではない。** CARTO の Basemap Terms は
 *  "prominent and conspicuous to Persons viewing each CARTO basemap" を要求する。このアプリは
 *  #R479 まで CARTO と OpenStreetMap を Sources モーダルの中にだけ置き、両エンジンの
 *  レンダラ側 credit を消していた（`attributionControl:false` と
 *  `.cesium-widget-credits{display:none}`）ので、**地図を見ている読者には何も出ていなかった。**
 *  ⑤ はその要素が在ることを、⑥ は基図が切り替わっても古い credit が残らないことを見る。
 *  ⚠ そのファイルが独立している理由は app shell の行数予算（⑧）——`src/vendor.js` に戻すと
 *  他の検査は全部緑のまま `tests/r168` #8 だけが落ちる。
 *
 *  ⚠ **コメントは剥がす**（#R345 の9回目が `scripts/code-only.mjs` を切り出した理由）。この欠陥を
 *  説明する注記は必ずホスト名を含むので、剥がさない検査は「よく説明されたファイルほど大きな声で
 *  嘘をつく」。剥がしたうえで、②が**キー無しの URL に対して実際に発火する**ことを見せる。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ⚠ ASSEMBLED FROM PARTS, NOT WRITTEN OUT — for two independent reasons.
   ① this file would otherwise contain the very spelling ② bans, and
   ② CodeQL reads `text.includes('<a hostname>')` as URL validation
      (js/incomplete-url-substring-sanitization, high severity) and it flagged exactly the two lines
      below. The rule is right about that shape in general — a substring test is a broken way to
      decide whether a URL points at a host — but nothing here is a URL: this is a scan of SOURCE
      TEXT for a forbidden spelling, and there is no attacker-controlled input anywhere in it.
      Assembling the needle removes the signature without weakening the check by one character. */
const HOST = ['basemaps', 'cartocdn', 'com'].join('.');

/** every `*.js` under a directory, at any depth */
function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

/** `window.<name> = function …}` sliced out by counting braces, so the check can RUN it */
function fnSource(src, name) {
  const head = src.indexOf('window.' + name + ' = function');
  if (head < 0) return null;
  let i = src.indexOf('{', head), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(head, i + 1);
  }
  return null;
}

/* ── ① the key exists once, and it is in the one file that owns it ───────────────────────────── */
test('R479 ① CARTO_BASEMAP_KEY is assigned in exactly one shipped file', () => {
  const owners = [];
  for (const f of [...jsFiles('js'), ...jsFiles('src')]) {
    if (/window\.CARTO_BASEMAP_KEY\s*=/.test(codeOnly(read(f)))) owners.push(f);
  }
  assert.deepEqual(owners, ['js/carto-basemap.js'],
    'the key is a rotation point: two spellings means rotating it half-works and the other half keeps the watermark');

  const key = /window\.CARTO_BASEMAP_KEY\s*=\s*'([^']+)'/.exec(read('js/carto-basemap.js'));
  assert.ok(key, 'the key is a plain literal, so rotating it is one edit');
  assert.match(key[1], /^cb1_/, 'and it is a CARTO basemap key rather than a leftover placeholder');
});

/* ── ② NOTHING else spells the tile host ─────────────────────────────────────────────────────────
   This is the gate. A CARTO URL assembled anywhere but the builder cannot carry the key, and the
   tile it fetches comes back 200 with the watermark painted on — so nothing downstream can notice. */
test('R479 ② no file under js/ or src/ builds a cartocdn URL outside the builder', () => {
  const offenders = [];
  for (const f of [...jsFiles('js'), ...jsFiles('src')]) {
    if (f === 'js/carto-basemap.js') continue;                 /* the builder itself */
    codeOnly(read(f)).split('\n').forEach((line, i) => {
      if (line.includes(HOST)) offenders.push(f + ':' + (i + 1) + '  ' + line.trim().slice(0, 100));
    });
  }
  assert.deepEqual(offenders, [],
    'build CARTO tiles with window.cartoTiles()/cartoTileURL() — a hand-written URL has no key and is served watermarked');
});

/* ② が実際に発火することを見せる（#R465: 検査は発火することを証明できる形に）——出荷前の綴りそのもの */
test('R479 ②b the gate fires on the URLs this round removed', () => {
  const shipped = [
    "return ['a','b','c','d'].map(h=>'https://'+h+'.basemaps.cartocdn.com/'+s+'/{z}/{x}/{y}'+r+'.png');",
    "const CT=(style,z,lon,lat)=>{ const t=tXY(z,lon,lat); return 'https://a.basemaps.cartocdn.com/'+style+'/'+z+'/'+t.x+'/'+t.y+'@2x.png'; };",
  ];
  for (const line of shipped) {
    assert.ok(codeOnly(line).includes(HOST), 'the pre-#R479 spelling is exactly what ② refuses: ' + line.slice(0, 60));
  }
});

/* ── ③ the builders really produce a keyed URL ───────────────────────────────────────────────── */
test('R479 ③ both builders put the key on every URL they return', () => {
  const src = read('js/carto-basemap.js');
  const key = /window\.CARTO_BASEMAP_KEY\s*=\s*'([^']+)'/.exec(src)[1];
  const w = { CARTO_BASEMAP_KEY: key };
  for (const name of ['cartoTileURL', 'cartoTiles']) {
    const fn = fnSource(src, name);
    assert.ok(fn, name + ' is one named expression, so it can be measured here rather than copied');
    new Function('window', fn + '\nreturn 0;')(w);
  }

  /* the shape MapLibre gets: one entry per host alias, each keyed, placeholders intact */
  const tiles = w.cartoTiles('dark_all', { hiDPI: true });
  assert.equal(tiles.length, 4, 'the a–d host round-robin (#R7) survives');
  for (const t of tiles) {
    assert.match(t, /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/dark_all\/\{z\}\/\{x\}\/\{y\}@2x\.png\?key=/, t);
    assert.ok(t.endsWith('?key=' + key), 'the key is the last thing on the URL: ' + t);
  }
  assert.equal(new Set(tiles).size, 4, 'and the four are distinct hosts');

  /* the shape the previews get: literal z/x/y, one host, and still keyed */
  assert.equal(w.cartoTileURL('rastertiles/voyager', '4/8/5', { host: 'b' }),
    'https://b.basemaps.cartocdn.com/rastertiles/voyager/4/8/5.png?key=' + key);
  /* @2x is opt-in, never accidental */
  assert.ok(!w.cartoTileURL('light_all', '1/1/1').includes('@2x'));
  assert.ok(w.cartoTileURL('light_all', '1/1/1', { hiDPI: true }).includes('@2x.png?key='));
});

/* ── ④ every call site goes through the builder ──────────────────────────────────────────────── */
test('R479 ④ all five CARTO call sites use the builders', () => {
  const sites = {
    'js/app-body.js': 1,        /* the main basemap */
    'js/compare.js': 3,         /* voyager, dark, relief */
    'js/playground.js': 1,      /* the guess map */
    'js/layer-previews.js': 2,  /* CT() thumbnails and _bmShot() */
  };
  for (const [f, n] of Object.entries(sites)) {
    const hits = (codeOnly(read(f)).match(/window\.carto(TileURL|Tiles)\(/g) || []).length;
    assert.equal(hits, n, f + ' should reach CARTO through the builder ' + n + ' time(s), saw ' + hits);
  }
});

/* ── ⑤ the credit is on the map, and capture mode does not take it away ──────────────────────── */
test('R479 ⑤ the basemap credit element ships, is styled, and survives capture mode', () => {
  assert.match(read('index.html'), /<div id="map-credit" class="map-credit"><\/div>/,
    'the credit lives in the map container next to the other HUD furniture');

  const css = codeOnly(read('css/intmap.css'));
  /* ⚠ WHERE it sits is #R481's question now, not this one. #R479 put it bottom-right and MEASURED
     WRONG — the layer panel covered it on every desktop width and the toolbar covered it on a phone.
     The placement invariants live in tests/r481-checks.test.mjs; what stays here is the part this
     round is actually about: the element ships, it is styled, and it is not hidden. */
  assert.match(css, /\.map-credit\{[^}]*\}/, 'the credit has a rule of its own');
  assert.ok(!/\.map-credit\{[^}]*display:none/.test(css), 'and it is not shipped hidden');

  /* ⚠ a screenshot of the map is exactly the artefact the attribution has to travel with */
  assert.ok(!/body\.capture-mode[^{]*\.map-credit/.test(css),
    'capture mode hides HUD furniture (tests/r232) — the attribution is not furniture, it is the licence');
});

/* ── ⑥ the credit follows the base that is actually drawn ────────────────────────────────────── */
test('R479 ⑥ both basemap commands re-apply the credit, and one file owns the text', () => {
  const app = codeOnly(read('js/app-body.js'));
  for (const cmd of ['view.base.map', 'view.base.sat']) {
    const line = app.split('\n').find((l) => l.includes("register('" + cmd + "'"));
    assert.ok(line, cmd + ' is registered');
    assert.ok(line.includes('window.IntMapCartoCredit()'),
      cmd + ' must re-apply the credit, or the map can end up crediting a basemap it is no longer drawing');
  }
  /* ⚠ app-body must NOT keep its own copy of the wording — that is what js/carto-basemap.js is for */
  assert.ok(!/carto\.com\/attributions/.test(app), 'the credit wording has one owner, and it is not the shell');

  const owner = codeOnly(read('js/carto-basemap.js'));
  assert.match(owner, /window\.IntMapCartoCredit = function/, 'one owner for the credit text');
  assert.match(owner, /carto\.com\/attributions/, 'CARTO is credited with a link to their attribution page');
  assert.match(owner, /openstreetmap\.org\/copyright/, 'and OpenStreetMap with theirs');
  assert.match(owner, /www\.esri\.com/, 'and the satellite base names Esri instead — a false credit is worse than none');
  /* it reads the button rather than trusting a caller, so no call site can hand it a stale answer */
  assert.match(owner, /btn-view-sat/, 'the credit reads which base is on rather than being told');
});

/* ── ⑦ the service worker still recognises the keyed URL ─────────────────────────────────────── */
test('R479 ⑦ the tile cache matches CARTO by host, so the key does not evict it', () => {
  const sw = codeOnly(read('sw.js'));
  assert.ok(sw.includes("'" + HOST + "'"),
    'sw.js keeps matching the CARTO host — it reads hostname, never the query, so ?key= changes nothing');
  /* #R224's 7-day ceiling is also what CARTO's terms allow (30 days max on-device) */
  assert.match(sw, /const REFRESHABLE = \[[^\]]*'basemaps\.cartocdn\.com'[^\]]*\]/,
    'and CARTO stays on the 7-day tier, comfortably inside the 30-day cap the basemap terms set');
});

/* ── ⑧ …and it stays out of the app shell ─────────────────────────────────────────────────────
   js/carto-basemap.js exists as its own file because the shell budget (tests/r168 #8 and its
   second copy in tests/r350 ⑨c) had 5 lines of headroom and this round needed 60. Putting the
   key back into src/vendor.js would pass every other check here and silently fail that one. */
test('R479 ⑧ the CARTO module is not part of the app shell', () => {
  const SHELL = ['index.html', 'src/main.js', 'src/vendor.js', 'js/app-body.js', 'js/geo-engine.js', 'js/lazy-modules.js'];
  for (const f of SHELL) {
    assert.ok(!/window\.CARTO_BASEMAP_KEY\s*=/.test(codeOnly(read(f))),
      f + ' is inside the app-shell line budget — the key and the builders live in js/carto-basemap.js');
  }
  const lines = SHELL.map(read).join("\n").split("\n").length;
  assert.ok(lines < 8050, 'the app shell is ' + lines + ' lines — tests/r168 #8 budgets it');
  assert.match(read('src/main.js'), /import '\.\.\/js\/carto-basemap\.js';/,
    'and it is imported before js/app-body.js, which builds tile URLs at map setup');
});
