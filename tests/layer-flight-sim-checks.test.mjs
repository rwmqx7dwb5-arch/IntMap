/* ============================================================================
 *  The flight simulator: where a flight starts from the map view, and its touch controls
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r187-checks.test.mjs, tests/r188-checks.test.mjs, tests/r190-checks.test.mjs, tests/r216-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r187-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/flight-sim.js は描画エンジンのカメラと DOM を前提に動くシミュレータで node では起動できない */
/* (#R187) the round's header note is kept with its largest block, in tests/layer-globe-rendering-checks.test.mjs */

/* ── 10. the flight starts where the user is looking ─────────────────────────────────────────── */
test('R187 flight sim: an airborne "current map view" start uses the real eye', () => {
  const src = read('js/flight-sim.js');
  assert.match(src, /if\(state\.loc==='__here'&&state\.mode!=='ground'\)/, 'scoped to the current-view airborne start');
  assert.match(src, /GE\(\)\.camera\.eye\?GE\(\)\.camera\.eye\(\):null/, 'the viewpoint comes from the engine contract');
  assert.match(src, /o\.keepAlt=true/, 'and start() must not overrule it with the +1,500 m clearance');
  /* ⚠ (#R210 → #R212) THE CLAMP CAME BACK ON REQUEST. #R190 clamped to the service ceiling;
     「一定高度以上は強制的に高度を下げさせられるのを辞めて」 removed it in #R210; 「やっぱ元に戻して」
     put it back in #R212. The claim this test is really about is untouched by all three: the start
     altitude comes from the EYE, not from a round number — plus the floor, which is a fact about the
     ground rather than a preference. The ceiling is the airframe's own, not a literal. */
  assert.match(src, /o\.alt=Math\.max\(150,Math\.min\(_ceil,eye\.alt\)\)/, "the start altitude is the eye's own, floored and capped");
  assert.match(src, /const _ac=AIRCRAFT\[state\.ac\][\s\S]{0,90}_ceil=\(_ac&&_ac\.ceil\)/, 'and the cap is that aircraft’s service ceiling');
});
}

/* ══════════ from tests/r188-checks.test.mjs — 1 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/flight-sim.js は描画エンジンのカメラと DOM を前提に動くシミュレータで node では起動できない */
/* (#R188) the round's header note is kept with its largest block, in tests/layer-aircraft-checks.test.mjs */

/* ── 6. flight sim: the view's tilt reaches both the aeroplane and the camera ────────────────── */
test('R188 flight sim: "current map view" carries the tilt, clamped to the airframe', () => {
  const src = read('js/flight-sim.js');
  assert.match(src, /o\.viewGamma=\(_p-90\)\*Math\.PI\/180;/,
    'the view tilt becomes a flight-path angle (90° = level, the sim\'s own convention)');
  assert.match(src, /o\.viewCam=\{ pitch:_p, bearing:\(isFinite\(_b\)\?_b:0\), roll:\(isFinite\(_r\)\?_r:0\) \};/,
    '…and the camera is seeded from the same view');
  /* clamped to what the airframe can HOLD, from the same polar as the level trim — no round numbers */
  assert.match(src, /function computeTrim\(gammaWant\)\{/, 'the trim must accept a requested path angle');
  assert.match(src, /const gMax=Math\.asin\(Math\.max\(-1,Math\.min\(1,\(Tmx-Drag\)\/Math\.max\(1,ac\.m\*g0\)\)\)\);/,
    'the climb limit is full thrust against drag');
  assert.match(src, /const _glide=-Math\.atan2\(CD,Math\.max\(0\.05,CLn\)\);/,
    'the descent limit is the idle glide angle');
  assert.match(src, /gamma=Math\.max\(Math\.min\(_glide,gMax\),Math\.min\(gMax,gammaWant\)\);/,
    'the request is clamped between them — a top-down map must not become a vertical dive');
  /* every path that existed before passes no argument and must be unchanged */
  assert.match(src, /\} else \{ st\.thr=Math\.max\(0\.02,Math\.min\(1,Drag\/\(ac\.Tmax\*densF\)\)\);/,
    'the no-argument branch is still the level trim');
  /* the camera intro: frame one is the view START was pressed on */
  assert.match(src, /st\._camSeed=\{ pitch:\+vc\.pitch,/, 'the seed is stored on the flight state');   /* (#R189) the seed also carries eye+dist */
  assert.match(src, /st\._cB=sd\?sd\.bearing:bearingT; st\._cR=sd\?sd\.roll:rollT; st\._cP=sd\?sd\.pitch:pitchT;/,
    'the smoother starts from the map view, not the aeroplane');
  assert.match(src, /const cap=\(_intro>0\?110:900\)\*Math\.max\(0\.001,dt\)/, 'and eases rather than cuts');
  assert.match(src, /if\(age>=st\._camSeed\.ms\) st\._camSeed=null;/,
    'the seed is dropped when the intro ends, so the #R174 constants come back exactly');
});
}

/* ══════════ from tests/r190-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/flight-sim.js は描画エンジンのカメラと DOM を前提に動くシミュレータで node では起動できない */
/* (#R190) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */

/* ── 5 · the flight simulator flies the angle the view was showing ───────────────────────────── */
test('R190 flight sim: the view\'s tilt becomes the aeroplane\'s flight path', () => {
  const src = read('js/flight-sim.js');
  assert.match(src, /function _flyViewGamma\(vg\)\{/, 'the attitude is set from the view');
  /* the limit is the height the recovery needs, not a round number */
  assert.match(src, /const c=1-h\*g0\*\(n-1\)\/Math\.max\(1,Vt\*Vt\);/,
    'h = V²(1−cos γ)/(g(n−1)) solved for the steepest recoverable dive');
  assert.match(src, /st\.q=qFromEuler\(0,aT\+gam,yaw\)/, 'the nose really points there');
  assert.match(src, /st\.vb=\[Vt\*Math\.cos\(aT\),0,Vt\*Math\.sin\(aT\)\];/,
    'body-axis velocity is the trim’s — rotating the nose rotates the PATH');
  /* it runs AFTER the terrain read, or the pull-out room is unknown */
  assert.ok(src.indexOf('const tr0=_terrRead(st.lng,st.lat)') < src.indexOf('_flyViewGamma(st._wantGamma)'),
    'the height under the aeroplane has to be known first');
  /* the pre-flight card stops being silent about the altitude it will use.
     ⚠ (#R210 → #R212) the ceiling DECIDES it again («やっぱ元に戻して»), so the card is back to saying
     it is limited. The claim kept across all three revisions is that the card still warns. */
  assert.match(src, /class="fss-note"/, 'the card previews what an airborne start will use');
  assert.match(src, /limited to this aircraft’s service ceiling/, '…and still warns when the view is above the ceiling');
});
}

/* ══════════ from tests/r216-checks.test.mjs — 2 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/flight-sim.js は描画エンジンのカメラと DOM を前提に動くシミュレータで node では起動できない */
/* (#R216) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

/* ── ⑩ the flight simulator on a phone ──────────────────────────────────────────────── */
test('#R216 ⑩ the touch controls are the four arrows again, and they hold the same keys', () => {
  const s = read('js/flight-sim.js');
  assert.match(s, /class="fs-dpad"/, 'there is no four-way pad');
  for (const k of ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
    assert.ok(s.includes('data-k="' + k + '"'), 'the pad is missing ' + k);
  assert.equal(/class="fs-stick"/.test(s), false, 'the analog stick is still the touch control');
  /* a finger that slides off a button must release it, or the elevator stays hard over */
  assert.match(s, /b\.addEventListener\('pointercancel',up\)/, 'a cancelled press is never released');
});
test('#R216 ⑩ …and a flight asks for landscape, then says so if it cannot have it', () => {
  const s = read('js/flight-sim.js');
  assert.match(s, /function _goLandscape\(\)/, 'nothing asks for landscape');
  assert.match(s, /orientation[\s\S]{0,40}lock\('landscape'\)/, 'the orientation is never locked');
  assert.match(s, /id="fs-rotate"|_rotEl\.id='fs-rotate'/, 'there is no rotate prompt for a browser that refuses');
  assert.match(s, /function start\(opts\)\{[\s\S]{0,200}_goLandscape\(\)/, 'start() does not ask');
  assert.match(s, /_endLandscape\(\)/, 'the lock outlives the flight');
});
}
