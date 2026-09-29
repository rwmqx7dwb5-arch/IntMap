/* ============================================================================
 *  Satellite imagery: the imapsat:// scheme, tile warming, the bundled floor and the tile worker
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r286-checks.test.mjs, tests/r190-checks.test.mjs, tests/r204-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { isBenign } from './helpers/network.js';
import { codeOnly } from '../scripts/code-only.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r286-checks.test.mjs — 5 of its 6 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/dash-extended.js・js/tile-warm.js・js/sat-proto.js は描画エンジンに閉じていて node では組み立てられない（判定関数と isBenign は実行している） */
/* ============================================================================
 *  IntMap · #R286 source checks — a tile template is not always a URL
 * ----------------------------------------------------------------------------
 *  tests/monitors.spec.js's console-error gate failed intermittently with twenty
 *  refusals of 「Loading the image 'imapsat://2/0/2' violates … "img-src 'self'
 *  https: data: blob:"」. `imapsat://` is IntMap's OWN scheme — js/sat-proto.js
 *  registers it — so a tile served through it is never a browser image load at
 *  all. The message therefore meant the raw template was reaching the browser
 *  instead of the handler, and it was: js/dash-extended.js's speculative prefetch
 *  read the ACTIVE STYLE's tile template and assigned it to `new Image().src`.
 *  The satellite source has held the protocol URL since #R158 and has been the
 *  DEFAULT basemap since #R207, so the ordinary case warmed nothing at all and
 *  paid for it in console errors.
 *
 *  ⚠ THE TWO WAYS TO MAKE THE SYMPTOM GO AWAY WITHOUT FIXING ANYTHING ARE ALSO
 *  CHECKED HERE — widening index.html's `img-src` to admit `imapsat:`, and adding
 *  the message to tests/helpers/network.js's benign list. Both are asserted
 *  BEHAVIOURALLY (§ ③ § ④) rather than by looking for a spelling.
 *
 *  ⚠ …AND SO IS THE REASON REFUSING IS SAFE (§ ⑤). The fix says «satellite is
 *  warmed by js/tile-warm.js instead». That is a claim about another file, so it
 *  is measured rather than left in a comment — #R278's rule: a rule written in
 *  prose and never measured is a rule nobody is holding.
 *
 *  ⚠ Sources are read through scripts/eol.mjs (#R283) and stripped of comments
 *  before every search, because the notes those files now carry quote the very
 *  expressions these checks require to be absent.
 * ==========================================================================*/
const read = (p) => readLF(resolve(ROOT, p));

/* the message Chromium logged, verbatim, for one of the twenty tiles */
const CSP_MESSAGE = "Loading the image 'imapsat://2/0/2' violates the following Content Security "
  + 'Policy directive: "img-src \'self\' https: data: blob:". The action has been blocked.';

/* the body of the speculative prefetch, comments removed, from its own source */
function prefetchBody() {
  const src = codeOnly(read('js/dash-extended.js'));
  const a = src.indexOf('function prefetch(lng,lat,z){');
  const b = src.indexOf("GE().events.on('moveend'", a);
  assert.ok(a >= 0 && b > a, 'js/dash-extended.js still has the speculative prefetch');
  return src.slice(a, b);
}

/* ── ① the prefetch decides on the SCHEME, and it decides before it builds an <img> ────────────
   Asserted as an ORDER, not as the presence of a line: a guard placed after the loop would satisfy
   "the predicate is called" and change nothing whatsoever. */
test('R286 ①: the prefetch refuses an unloadable template before it can reach an <img>', () => {
  const body = prefetchBody();
  const guard = body.indexOf('browserLoadable(tpl)');
  const img = body.indexOf('new Image()');
  assert.ok(guard >= 0, 'it asks whether the template is something the browser can load');
  assert.ok(img >= 0, 'it still warms ordinary http(s) templates through an <img>');
  assert.ok(guard < img, 'and it asks BEFORE it builds one, or the guard changes nothing');
  assert.match(body, /if\(!browserLoadable\(tpl\)\)\{[\s\S]*?return; \}/,
    'a template it cannot load ends the call rather than being substituted into anyway');
  /* …and the refusal is observable, so a path that quietly stopped running cannot pass for a
     path that correctly declined (tests/smoke.spec.js R286 ⑳ reads this). */
  assert.match(body, /refused:true/, 'the refusal is recorded');
  assert.match(codeOnly(read('js/dash-extended.js')), /window\.SpeculativePrefetch=\{ prefetch, last:\(\)=>_last \}/,
    'and exported, so the browser test can tell "refused" from "never ran"');
});

/* ── ② the predicate itself, in BOTH directions ────────────────────────────────────────────────
   #R283's rule: a check that only proved the refusal would also pass for `()=>false`, which would
   silently switch the whole prefetch off. The accepted half is the half that keeps it alive. */
test('R286 ②: it accepts what the browser can load and refuses every scheme this app registers', () => {
  const m = /const browserLoadable=(\(tpl\)=>\{[\s\S]*?\});/.exec(codeOnly(read('js/dash-extended.js')));
  assert.ok(m, 'the predicate is one named expression, so it can be measured here rather than copied');
  const loadable = new Function(`return (${m[1]});`)();

  for (const ok of ['https://server.arcgisonline.com/ArcGIS/.../tile/{z}/{y}/{x}',
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'http://127.0.0.1:4173/tiles/{z}/{x}/{y}.png',
    '//tiles.example/{z}/{x}/{y}.png',
    'tiles/{z}/{x}/{y}.png']) {
    assert.equal(loadable(ok), true, `must keep warming ${ok}`);
  }
  /* the schemes this app registers with the renderer — see the addProtocol call sites */
  for (const bad of ['imapsat://{z}/{y}/{x}', 'pmtiles://x/{z}/{x}/{y}', 'om://x',
    '  imapsat://2/0/2', 'IMAPSAT://2/0/2']) {
    assert.equal(loadable(bad), false, `must refuse ${bad}`);
  }
});

/* ── ③ the fix is not a wider policy ──────────────────────────────────────────────────────────
   Parsed out of the meta tag and compared as a SET, so `img-src 'self' https: data: blob: imapsat:`
   fails whatever order somebody writes it in. */
test('R286 ③: index.html\'s img-src still admits no custom scheme', () => {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(read('index.html'));
  assert.ok(csp, 'the page still carries its CSP meta tag');
  const img = csp[1].split(';').map((d) => d.trim()).find((d) => d.startsWith('img-src '));
  assert.ok(img, 'and an img-src directive');
  const sources = img.slice('img-src '.length).trim().split(/\s+/);
  assert.deepEqual(new Set(sources), new Set(["'self'", 'https:', 'data:', 'blob:']),
    'widening this to admit imapsat: would hide the defect rather than repair it');
});

/* ── ④ …nor a wider benign list ───────────────────────────────────────────────────────────────
   Asked of the function the gate actually calls, with the message Chromium actually logged. */
test('R286 ④: a CSP refusal is still a real console error, not a benign one', () => {
  assert.equal(isBenign(CSP_MESSAGE), false,
    'tests/helpers/network.js must keep classifying a CSP violation as a genuine failure');
  assert.equal(isBenign("Loading the image 'pmtiles://a/1/2/3' violates the following Content "
    + 'Security Policy directive: "img-src \'self\' https: data: blob:". The action has been blocked.'),
  false, 'and not only for the one scheme that happened to be caught');
  /* …and the list must still do its own job, or this check could be passed by breaking it */
  assert.equal(isBenign('Failed to load resource: net::ERR_FAILED'), true,
    'a blocked external host is still benign under the hermetic policy');
});

/* ── ⑤ …and the imagery the prefetch declines IS warmed, by the module that owns it ────────────
   js/tile-warm.js warms satellite on the same `moveend`, and #R206 made it build the URL from the
   protocol's own exported builder rather than from a template — exactly the step that was missing
   in js/dash-extended.js. Without this, "refuse" and "drop the feature" look the same. */
test('R286 ⑤: js/tile-warm.js still owns satellite warming, through the protocol\'s own URL', () => {
  const warm = codeOnly(read('js/tile-warm.js'));
  assert.match(warm, /events\.on\('moveend'[\s\S]{0,200}?predictivePrefetch/,
    'the satellite prefetch still runs on moveend');
  assert.match(warm, /HOST\.mapType!=='sat'\)\s*return/,
    'and satellite is the case it runs for');
  assert.match(warm, /window\.IntMapSatProto&&window\.IntMapSatProto\.tileUrl/,
    'and it asks the protocol for the URL it will actually fetch (#R206)');

  const proto = codeOnly(read('js/sat-proto.js'));
  assert.match(proto, /tileUrl:\(z,y,x\)=>_satUrl\(/, 'which the protocol still exports');
  assert.match(proto, /_SAT_HOSTS=\['https:\/\/[^']+','https:\/\/[^']+'\]/,
    'and it resolves to ordinary https origins — something the browser can load');
  assert.match(proto, /_satUrl=\(z,y,x\)=>_SAT_HOSTS\[\(x\+y\)&1\]/,
    'chosen by the (x+y)&1 host rule the render path uses');
});
}

/* ══════════ from tests/r190-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/world-base.js と js/cesium-engine.js はキャンバスと描画エンジンに閉じていて node では評価できない */
/* (#R190) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */

/* ── 3 · the pre-load satellite floor looks like the tiles it stands in for ──────────────────── */
test('R190 satellite: the bundled floor is colour-matched to the tiles that paint over it', () => {
  const src = read('js/world-base.js');
  /* measured from the page over the sixteen z2 World_Imagery tiles: Esri 85.5/121.3/125.9 against
     Blue Marble 72.4/84.3/101.1 — a 37-unit green gap. Per-channel least squares, R² 0.97/0.98/0.96. */
  assert.match(src, /const TONE=\[\[1\.1011,5\.81\],\[0\.9225,43\.53\],\[0\.9787,26\.94\]\];/,
    'the fitted per-channel transform');
  assert.match(src, /function toneMap\(im\)\{/, 'applied once to the decoded picture');
  assert.match(src, /im\.onload=\(\)=>\{ img=toneMap\(im\);/, '…on the load path everything waits on');
  assert.match(src, /function bitmapUrl\(\)\{/, 'and exported for the other engine');
  const ces = read('js/cesium-engine.js');
  assert.match(ces, /_wb\.bitmapUrl\(\)/, 'Cesium takes the colour-matched picture, not the raw file');
  /* …and it now covers deeper zooms, because a blurry patch of the RIGHT imagery beats a hole */
  assert.match(src, /minzoom:0, maxzoom:6,/, 'the floor reaches z6');
});
}

/* ══════════ from tests/r204-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: src/sat-worker.js は OffscreenCanvas と createImageBitmap を前提にする worker で node では起動できない */
/* (#R204) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */
const rd = read;

/* ── ③ THE SATELLITE JPEG IS DECODED OFF THE MAIN THREAD ──────────────────────────────────────── */
test('R204 ③ the tile worker answers with a bitmap, and keeps the bytes as the fallback', () => {
  const w = rd('src/sat-worker.js');
  assert.match(w, /async function decode\(buf\)/, 'the worker decodes');
  assert.match(w, /bitmap = await decode\(r\.buf\)/, 'on the path that used to return bytes');
  assert.match(w, /if \(!bitmap\) buf = r\.buf\.slice\(0\)/, 'and the bytes remain the fallback');
  /* ⚠ no colour-management shortcut: #R190 matched these tiles to the floor underneath them */
  assert.doesNotMatch(w, /colorSpaceConversion/, 'decode speed may not change the colours (#R190)');
});
}
