/* ============================================================================
 *  Live aircraft: the glyph, the sweep, the detail card and the recorded tracks
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r187-checks.test.mjs, tests/r188-checks.test.mjs, tests/r190-checks.test.mjs, tests/r506-checks.test.mjs, tests/r175-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { LAZY_REGISTRY, LAZY_NAMES } from '../js/lazy-modules.js';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r187-checks.test.mjs — 3 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R187) the round's header note is kept with its largest block, in tests/layer-globe-rendering-checks.test.mjs */

/* ── 1. the aircraft mark is the FIRST one again ─────────────────────────────────────────────── */
test('R187 aircraft: the glyph is the original outline, stroke and size ramp', () => {
  const src = read('js/data-layers.js');
  /* The outline shipped from the first commit through #R164. Checked point by point rather than as
     a blob so a "tidy-up" that nudges a vertex is a failure, not a silent redesign. */
  const m = /_PLANE_ORIG\s*=\s*\[([\s\S]*?)\];/.exec(src);
  assert.ok(m, '_PLANE_ORIG must exist');
  const pts = JSON.parse('[' + m[1].replace(/\s+/g, '') + ']');
  assert.deepEqual(pts, [[0,-19],[2.2,-6],[2.2,-3],[17,5],[17,9],[2.2,4.5],[2.2,12],[6,16],[6,18],[0,15.5],
                         [-6,18],[-6,16],[-2.2,12],[-2.2,4.5],[-17,9],[-17,5],[-2.2,-3],[-2.2,-6]]);
  /* a flat fill and a 1.6 px white line — no drop shadow, no white rim, no dark hairline */
  const fn = /function ensurePlaneIcons\(\)\{[\s\S]*?\n    \}/.exec(src);
  assert.ok(fn, 'ensurePlaneIcons must exist');
  /* (#R246) 「両方とも：より太いアウトライン」 — the width is `PLANE_STROKE` now, a constant the flat
     glyph AND the lifted 3-D body read, so thickening it cannot make the two renderings disagree. */
  assert.match(fn[0], /lineWidth=PLANE_STROKE/, 'the stroke is the one shared constant');
  assert.match(fn[0], /const s=44\b/, 'the original 44-unit artwork');
  assert.ok(!/shadowBlur/.test(fn[0]), 'the #R183 drop shadow is gone');
  assert.ok(!/lineWidth=2\.6/.test(fn[0]), 'the #R183 white rim is gone');
  /* the original size ramp */
  /* (#R192) the ramp is stated once, in _PLANE_SIZE, and BOTH renderings read it — see
     tests/r192-checks.
     ⚠ (#R247) the STOPS are the original ones scaled by 1.25 —「航空機の大きさを少し大きく」. What this
     test is for is that there is ONE table and that its shape (three stops, at z2/z5/z9) is the
     original ramp's; the scale is the reader's to ask about. */
  assert.match(src, /const _PLANE_SIZE=\[\[2,0\.5\],\[5,0\.725\],\[9,0\.975\]\];/,
    'the icon-size ramp — the original stops at 1.25x (#R247)');
  /* …and the flat glyph is what a default profile SEES: #R185 measured that the lifted 3-D body is
     shown instead of it, so restoring the glyph without this changes nothing on screen. */
  /* (#R189) the key is generation-bumped so a '1' stored under the R172–R186 default-TRUE era can
     no longer override the default — see r189-checks for the migration itself */
  assert.match(src, /let planes3D=true;[\s\S]{0,200}getItem\(PLANES3D_KEY\)/,
    '3-D aircraft bodies must default OFF');
});

/* ── 1b. …and the click still finds the aircraft it can now see ──────────────────────────────── */
test('R187 aircraft: the pick follows the rendering that is on', () => {
  const src = read('js/data-layers.js');
  /* Caught by tests/r175 — which is about the DETAIL CARD and not about 3-D at all. `pickPlane`
     opened with `if(!planes3D) return null`, so the moment the flat glyph became the default again,
     clicking an aircraft selected nothing, opened no card and drew no track. A default change is not
     allowed to take a feature with it. */
  assert.ok(!/function pickPlane\(pt\)\{\s*\n?\s*if\(!planes3D/.test(src),
    'pickPlane must not bail out when the flat glyph is the rendering');
  assert.match(src, /function _planeDrawAlt\(d\)\{[\s\S]{0,200}if\(!planes3D\|\|d\.onGround\) return 0;/,
    'the drawn altitude is 0 for the flat glyph and the reported altitude for the 3-D body');
  /* the pick and the "where is it drawn" diagnostic must BOTH go through it — a pick that used a
     different offset would look for the aeroplane somewhere it is not (#R174) */
  const uses = src.match(/_planeDrawAlt\(d\)/g) || [];
  assert.ok(uses.length >= 2, `only ${uses.length} caller(s) of _planeDrawAlt — pick and screenPos must agree`);
});

/* ── 2. the sweep is wider, and still paced at the measured rate ─────────────────────────────── */
test('R187 aircraft: a bigger budget, the same requests per second', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /PLANE_CIRCLE_NM\s*=\s*250\b/, '250 nm is still the API maximum (300 answers 403)');
  assert.match(src, /PLANE_GAP_MS\s*=\s*1200\b/, 'the measured sustainable spacing must NOT move with the budget');
  /* ⚠ (#R668) the PREDICATE moved and the NUMBERS did not: which sweep a device may run is a
     question about the device, not about the window's width (`isMobile()` is a 768 px media query,
     so a phone in landscape was authorised the 128-circle sweep on the same radio and the same
     memory the 24 was measured for). So this reads the two branches and their numbers — the fact —
     and tolerates any spelling of the device predicate that js/mem-budget.js owns. */
  const b = /PLANE_CIRCLE_BUDGET=\(\)=>\((?:_phoneDev\(\)|window\.IntMapMemBudget\.deviceIsPhone\([^()]*\))\?(\d+):(\d+)\)/.exec(src);
  assert.ok(b, 'the budget must be a two-branch phone/desktop constant decided by the DEVICE '
    + '(_phoneDev()/IntMapMemBudget.deviceIsPhone), not by a width media query');
  /* (#R188) raised again, to 128 / 24, together with a triangular covering lattice — the report came
     back a third time. What this test is really guarding is that the budget only ever GROWS and that
     the pace never moves with it, so the numbers are checked as a floor rather than as an equality
     (tests/r188-checks.test.mjs pins the current values). */
  assert.ok(+b[2] >= 48, `desktop budget ${b[2]} must not fall below #R187's 48`);
  assert.ok(+b[1] >= 12, `mobile budget ${b[1]} must not fall below #R187's 12`);
  /* the poll interval has to be able to EXPRESS the full sweep — a clipped ceiling would mean
     polling faster than the pace that was measured to be sustainable */
  const cl = /Math\.max\(20000,Math\.min\((\d+),Math\.round\(n\*(\d+)\)\)\)/.exec(src);
  assert.ok(cl, 'the poll interval must stay a clamped n×rate rule');
  assert.ok(+cl[1] >= +b[2] * +cl[2], `a ${b[2]}-circle sweep needs ${+b[2] * +cl[2]} ms but the ceiling is ${cl[1]} ms`);
});
}

/* ══════════ from tests/r188-checks.test.mjs — 2 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* ============================================================================
 *  R188 — source-level checks (no browser)
 * ----------------------------------------------------------------------------
 *  Six instructions, every one of them a re-report. What each of these guards is
 *  the MEASUREMENT that finally named the cause, so a later tidy-up cannot quietly
 *  put the same defect back.
 * ==========================================================================*/

/* ── 1. live aircraft: a triangular covering, a bigger budget, the SAME pace ─────────────────── */
test('R188 aircraft: the lattice is triangular, so each request covers 1.36× the sky', () => {
  const src = read('js/data-layers.js');
  /* The optimal covering of a plane by equal circles: neighbours at r√3, rows at that × √3/2.
     #R186/#R187 stepped by the inscribed SQUARE (r√2), which keeps 2r² of a circle's πr². */
  assert.match(src, /const stepKm=rKm\*Math\.sqrt\(3\)\*PLANE_LATTICE_MARGIN;/,
    'centres must be spaced r√3 — the covering lattice, not the inscribed square');
  assert.match(src, /const rowKm=stepKm\*Math\.sqrt\(3\)\/2;/, 'rows at √3/2 of the step');
  assert.match(src, /const off=\(j&1\)\?dLng\/2:0;/, 'alternate rows offset by half a step');
  assert.ok(!/Math\.SQRT2\*0\.94/.test(src), 'the inscribed-square step must be gone');

  /* the area arithmetic the round claims, checked rather than asserted in a comment */
  const r = 250 * 1.852, margin = 0.96;
  const step = r * Math.sqrt(3) * margin, row = step * Math.sqrt(3) / 2;
  const hex = step * row, square = Math.pow(r * Math.SQRT2 * 0.94, 2);
  assert.ok(hex / square > 1.3, `covering gain ${(hex / square).toFixed(2)}× should be ~1.36`);

  /* ⚠ the pace is a MEASUREMENT and must not move: 34 circles at 1,200 ms all answered 200, the
     same 34 at 700 ms gave 12 successes and then 16 consecutive hard failures. */
  assert.match(src, /const PLANE_GAP_MS=1200;/, 'the measured spacing is 1.2 s and is unchanged');
  assert.match(src, /const PLANE_CIRCLE_NM=250;/, 'r=250 is the API maximum (300/500 answer 403)');
  /* ⚠ (#R668) the two numbers are the measurement and are pinned exactly; the predicate in front of
     them is not a spelling this test owns, only a REQUIREMENT that it be the device one — the width
     media query handed a phone in landscape (844 px) the desktop sweep. */
  assert.match(src, /PLANE_CIRCLE_BUDGET=\(\)=>\((?:_phoneDev\(\)|window\.IntMapMemBudget\.deviceIsPhone\([^()]*\))\?24:128\)/,
    'the budget is 128 circles (phone 24), and which arm a device takes is decided by the device');
  assert.match(src, /_phoneDev=\(\)=>\{[\s\S]{0,120}window\.IntMapMemBudget\.deviceIsPhone\(/,
    'and the local `_phoneDev` really delegates to the single owner in js/mem-budget.js');
  /* the long-run rate is 3.5 s a circle whatever the budget — so the ceiling has to clear it */
  const poll = /return Math\.max\(20000,Math\.min\((\d+),Math\.round\(n\*3500\)\)\);/.exec(src);
  assert.ok(poll, 'planePollMs must keep the 3.5 s-a-circle rule');
  assert.ok(+poll[1] >= 128 * 3500,
    `poll ceiling ${poll[1]} ms clips a 128-circle sweep (${128 * 3500} ms) — that would ask FASTER than measured`);
});

test('R188 aircraft: a 154-second sweep publishes as it goes, centre first', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /const PLANE_PUBLISH_MS=4000;/, 'the sweep publishes every few seconds');
  /* ⚠ (#R245) …and the FIRST success publishes without waiting for that interval — `lastPub` starts
     at the sweep's own start, so the centre circle's aircraft used to sit in `byHex` for four
     seconds with nothing on screen (「表示されるまでが遅い」). The cadence after it is unchanged. */
  assert.match(src, /if\(ok>0&&\(published===0 \? circles\.length>1 : Date\.now\(\)-lastPub>=PLANE_PUBLISH_MS\)\) publish\(false\);/,
    '…from inside the circle loop, first success immediately, then every PLANE_PUBLISH_MS');
  /* a carried-over aircraft is dropped only once the sweep has RE-ASKED about its patch of sky */
  assert.match(src, /function planeCellOf\(lat,lng\)\{/, 'the lattice must answer "which cell is this"');
  assert.match(src, /if\(cell!=null&&swept\.has\(cell\)\) continue;/,
    'carry-over must be resolved by "was this cell asked?", not by age alone');
  /* …and the cell key travels with the circle, because rows beyond ±88° are skipped */
  assert.match(src, /out\.push\(\[Math\.max\(-89\.9,Math\.min\(89\.9,lat\)\),lng,j\*nx\+i\]\);/,
    'each circle carries its cell key');
  /* centre-out order: measured row-major, the first four circles landed in the mid-Atlantic */
  assert.match(src, /out\.sort\(\(a,b\)=>\{/, 'circles must be ordered by distance from the view centre');
  /* a sweep the camera has left behind is abandoned — safe only because it already published */
  assert.match(src, /if\(Math\.abs\(dLng\)<cv\.coverKmX\/2&&Math\.abs\(dLat\)<cv\.coverKmY\/2\) return;/,
    'a new request takes over when the centre has moved more than half the covered block');
  assert.match(src, /finally \{ if\(mine===_planeSweep\) _planeBusy=false; \}/,
    'only the owning sweep may clear the busy flag');
});
}

/* ══════════ from tests/r190-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R190) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */

/* ── 1 · the aircraft mark, in BOTH renderings ───────────────────────────────────────────────── */
test('R190 aircraft: the lifted body is the original glyph, and "at real altitude" is the default', () => {
  const src = read('js/data-layers.js');
  /* the 3-D silhouette and the 2-D icon are literally the same outline now */
  assert.match(src, /const _PLANE_OUTLINE=_PLANE_ORIG;/,
    'the lifted body draws the outline the flat glyph draws');
  assert.match(src, /const _PLANE_ORIG=\[\[0,-19\]/, 'and that outline is the original one');
  /* …declared ABOVE both uses. #R167/#R183/#R189 all lost a module to this exact TDZ. */
  assert.ok(src.indexOf('const _PLANE_ORIG=') < src.indexOf('const _PLANE_OUTLINE=_PLANE_ORIG'),
    '_PLANE_ORIG must be declared before the alias that reads it');
  assert.ok(src.indexOf('const _PLANE_ORIG=') < src.indexOf('function ensurePlaneIcons'),
    '…and before the icon factory, or the module dies in its own temporal dead zone');
  /* the #R183/#R185 construction is gone with the plan-form it was grown from */
  assert.doesNotMatch(src, /_P_LEVELS/, 'the part-height table is gone');
  assert.doesNotMatch(src, /_PLANE_PLAN/, 'and the airliner plan-form it was grown from');
  assert.doesNotMatch(src, /DETAIL_MAX_AIRCRAFT/, 'and the budget that switched between the two bodies');
  assert.doesNotMatch(src, /rgba\(255,255,255,0\.97\)/, 'the white rim plate is gone');
  /* one aeroplane per aircraft, at the #R172 size.
     (#R191) the body ring is now the shared outline INSET by the glyph's own stroke and a second ring
     carries the stroke itself (see _PLANE_CORE / _PLANE_RIM) — still the one silhouette this test is
     about, and still one aeroplane per aircraft. The stroke's own geometry is pinned in tests/r191. */
  assert.match(src, /coordinates:\[planeRingPts\(d\.lng,d\.lat,d\.heading,half,_PLANE_CORE\)\]/, 'one aeroplane per aircraft');
  /* (#R192) the size is the GLYPH's own ramp now, at every zoom — the 60 m floor was making the
     lifted mark 2.7x too big past z14.5. See tests/r192-checks. */
  assert.match(src, /const half=iconHalfPx\*mpp;/, 'and the original 13-px half-length');
  /* the default, and the storage generation that makes the default reachable */
  assert.match(src, /const PLANES3D_KEY='intmap_planes3d3';/, 'a new key generation');
  assert.match(src, /let planes3D=true;/, 'default ON — 「at real altitudeはデフォルトで選択状態に」');
  assert.match(src, /removeItem\('intmap_planes3d'\); localStorage\.removeItem\('intmap_planes3d2'\)/,
    'both older keys are removed, so neither can override the new default');
});
}

/* ══════════ from tests/r506-checks.test.mjs — 4 of its 4 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/aviation-live.js と js/data-layers.js の配線（①②）は DOM・worker に閉じていて node では組み立てられない（記録器 ③④ は vm で実行している） */
/* ============================================================================
 *  #R506 — 航跡は消えたのではなく、記録の片側だけが残っていた
 * ----------------------------------------------------------------------------
 *  「航空トラフィックレイヤーは、前までトラックもあったんですが、なくなってしまいました。」
 *
 *  本当にあった。そして**記録は今も動いていた**。#R341 が航空レイヤーを丸ごと置き換えたとき、
 *  `src/aviation-worker.js` の **TRACK リングバッファは持ち越された**（同ラウンドが自分で
 *  「これは実機能で CONSTITUTION §0.3 が縮小を禁じている」と書いている）。持ち越されなかったのは
 *  **反対側**である——描画（`drawTrack` / `TRACK_LINE` / `TRACK_3D`）も、詳細カードの Show/Hide 行も、
 *  Atlas の `layers.aircraftTrack` も、全部**旧レイヤーの `planeTracks`** を読んだままで、それは
 *  旧掃引が止まった日から空だった。だから機体を選ぶと**0点の軌跡**が描かれ、両レイヤーが隠された。
 *  ⚠ **空の軌跡と「まだ軌跡が無い」は見分けがつかない**ので、誰も壊れたと気づけなかった。
 *
 *  ⚠⚠⚠ そして繋いだ瞬間に、**描ける状態ではないことが分かった**。本番実測（London z7・263機）:
 *
 *      脚の中央値              267 kt   ← 正しい。機体自身の対地速度と一致する
 *      900 kt を超えた脚       263本中 30本
 *      最悪                    25,283 kt（1,679 km を 129 秒）
 *
 *  1,679 km の直線は、どの飛行機も飛んでいない。**軌跡は証拠であって（§17.1）、これは捏造になる。**
 *  ⇒ 記録器に物理の門を入れた。ここで検査するのはその門と、それを露わにした2つの構造である:
 *
 *    ① 橋が全部つながっている（worker → aviation-live → data-layers → 既存の描画）。
 *       ⚠ **描画は1行も作り直していない。** 隣に2つ目の描画を建てるのが「1つの事実に正本が2つ」
 *       （§22.1）の始まりなので、足したのは「worker の点を、既に読まれている配列へ入れる」だけ。
 *    ② フィートとメートル。`planeTracks` は**メートル AMSL**（`drawTrack` が脚ごとの地面を引く）で、
 *       wire は `altFt`。換算を落とした軌跡は 3.3 倍の高さに描かれ、**動く機能に見える**。
 *    ③ 物理の門——出荷される `trackRecord` を vm に切り出して回す（#R498 の手口）。
 *    ④ 追い出しは「本当に一番古いもの」を選ぶ。`used` はメッセージの時刻を入れていたので、
 *       1通で書かれた全スロットが同じ値になり、走査は**毎回スロット0**を選んでいた。
 * ==========================================================================*/
const rd = read;
const WORKER = 'src/aviation-worker.js';

/* ── ① the bridge, end to end ───────────────────────────────────────────────────────────────── */
test('R506 ① the worker’s fixes reach the drawing that was already there', () => {
  const live = rd('js/aviation-live.js');
  assert.match(live, /async function track\(hex\) \{/, 'aviation-live can ask the worker for a track');
  assert.match(live, /W\(\)\.track\(hex \|\| ST\.selected \|\| ''\)/, '…through the worker client');
  assert.match(live, /function onTrack\(fn\)/, 'and the page can subscribe to it');
  assert.match(live, /track, find, onTrack,/, 'all three are on the public surface');
  /* the push happens where a new fix can exist — on a published frame — and only when something
     is selected, so an unselected session pays nothing */
  assert.match(live, /if \(ST\.selected && ST\.onTrack\) \{/, 'the push is guarded by the selection');

  const dl = rd('js/data-layers.js');
  assert.match(dl, /function _av2TrackApply\(hex,fixes\)\{/, 'the page turns those fixes into planeTracks');
  assert.match(dl, /planeTracks\[k\]=pts/, '…which is the very array drawTrack reads');
  assert.match(dl, /_av2TrackSync\(hex\);/, 'a click asks immediately rather than waiting for the next poll');
  assert.match(dl, /_av2\.onTrack\(\(hex,fixes\)=>_av2TrackApply\(hex,fixes\)\)/, 'and it keeps growing while selected');

  /* ⚠ NOTHING SECOND WAS BUILT. If a round ever adds its own line layer beside TRACK_LINE, these
     two stop being the only drawing and the product has two answers to one question (§22.1). */
  const srcIds = (dl.match(/const TRACK_SRC=|TRACK_LINE=|TRACK_3D=/g) || []).length;
  assert.equal(srcIds, 3, 'the track still has exactly one source and two layers');
});

test('R506 ② the wire is feet and the store is metres', () => {
  const dl = rd('js/data-layers.js');
  assert.match(dl, /const FT_M=0\.3048;/, 'the conversion is a named constant');
  assert.match(dl, /pts\.push\(\[f\.lon,f\.lat,\(f\.altFt\|\|0\)\*FT_M,f\.t\]\)/,
    'every fix is converted on the way in — a track that skipped this draws 3.3x too high and still looks like a working feature');
});

/* ── ③④ the shipped recorder, run ───────────────────────────────────────────────────────────── */
function recorder() {
  const src = rd(WORKER);
  const grab = (re, what) => { const m = re.exec(src); assert.ok(m, 'could not find ' + what); return m[0]; };
  const code = [
    grab(/^const D2R = [^\n]*$/m, 'D2R'),
    grab(/^const TRACK_MAX_KT = [^\n]*$/m, 'TRACK_MAX_KT'),
    grab(/^const KM_PER_KT_S = [^\n]*$/m, 'KM_PER_KT_S'),
    grab(/\nconst TRACK = \{[\s\S]*?\n\};/, 'the TRACK slab'),
    grab(/\nfunction trackInit\(\)[\s\S]*?\n\}/, 'trackInit'),
    grab(/\nfunction trackSlot\([\s\S]*?\n\}/, 'trackSlot'),
    grab(/\nfunction trackRecord\([\s\S]*?\n\}/, 'trackRecord'),
    grab(/\nfunction trackOf\([\s\S]*?\n\}/, 'trackOf'),
    grab(/\nfunction my2lat\([\s\S]*?\n\}/, 'my2lat'),
    grab(/\nfunction mx2lon\([^\n]*$/m, 'mx2lon'),
  ].join('\n');
  /* ⚠ THE SHIPPED CODE, NOT A COPY OF IT (#R498). A test that re-implements the arithmetic keeps
     guarding yesterday's arithmetic the moment the constant moves. */
  const ctx = {
    Math, SELECTED: 0,
    CODEC: { hexToNum: (h) => parseInt(h, 16), numToHex: (n) => n.toString(16).padStart(6, '0') },
    Uint32Array, Uint16Array, Float64Array, Float32Array, Map,
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nglobalThis.__T = { TRACK, trackRecord, trackOf, TRACK_MAX_KT };', ctx);
  return ctx.__T;
}

const lon2mx = (lon) => (lon + 180) / 360;
const lat2my = (lat) => {
  const p = Math.max(-89.9999, Math.min(89.9999, lat)) * Math.PI / 180;
  return (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + p / 2))) / 360;
};

test('R506 ③ a leg no aircraft could fly restarts the track instead of drawing it', () => {
  const T = recorder();
  const hex = 'abc123', icao = parseInt(hex, 16);
  const t0 = 1_700_000_000_000;

  /* a real 450 kt leg over 60 s — about 13.9 km — is kept, and joins the previous fix */
  T.trackRecord(icao, t0, lon2mx(0.0), lat2my(51.0), 35000);
  T.trackRecord(icao, t0 + 60_000, lon2mx(0.2), lat2my(51.0), 35000);
  assert.equal(T.trackOf(hex).length, 2, 'an ordinary leg is two fixes of one track');

  /* the measured pathology: 1,679 km in 129 s (25,283 kt). The earlier fixes are real observations
     but they are not continuous with this one, so the track begins again HERE. */
  T.trackRecord(icao, t0 + 189_000, lon2mx(17.1), lat2my(42.8), 35000);
  const after = T.trackOf(hex);
  assert.equal(after.length, 1, 'the impossible leg is not drawn — the track restarts at the new fix');
  assert.ok(Math.abs(after[0].lon - 17.1) < 0.01, '…and the new fix is the one that survives');

  /* and the bound is a bound, not a coincidence: just under it is kept, just over it is not */
  const T2 = recorder();
  const s0 = 1_700_000_000_000;
  const kmFor = (kt, secs) => kt * (1.852 / 3600) * secs;
  const degLonAt51 = (km) => km / (111.32 * Math.cos(51 * Math.PI / 180));
  T2.trackRecord(icao, s0, lon2mx(0), lat2my(51), 0);
  T2.trackRecord(icao, s0 + 60_000, lon2mx(degLonAt51(kmFor(T.TRACK_MAX_KT * 0.9, 60))), lat2my(51), 0);
  assert.equal(T2.trackOf(hex).length, 2, '90 % of the ceiling is a fast aircraft, and it is kept');

  const T3 = recorder();
  T3.trackRecord(icao, s0, lon2mx(0), lat2my(51), 0);
  T3.trackRecord(icao, s0 + 60_000, lon2mx(degLonAt51(kmFor(T.TRACK_MAX_KT * 1.5, 60))), lat2my(51), 0);
  assert.equal(T3.trackOf(hex).length, 1, '150 % of the ceiling is not an aircraft, and it is dropped');
});

test('R506 ④ eviction retires the least recently updated slot, not slot 0', () => {
  const T = recorder();
  const cap = T.TRACK.cap;
  const t0 = 1_700_000_000_000;
  /* fill the slab in ONE message — every fix carries the same timestamp, which is exactly the case
     the old `used = nowMs` could not tell apart (the app opens at z1, so the first viewport poll IS
     the whole world and really does hand this loop more aircraft than there are slots) */
  for (let i = 1; i <= cap; i++) T.trackRecord(i, t0, lon2mx(0), lat2my(51), 0);
  /* touch the FIRST slot's aircraft again, so it is now the most recently updated */
  /* ⚠ a PLAUSIBLE second fix — 7 km in 60 s is 226 kt. A 1-second hop of the same distance would
     be 13,600 kt and ③ would (correctly) restart the track, which is a different test. */
  T.trackRecord(1, t0 + 60000, lon2mx(0.1), lat2my(51), 0);
  const before = T.trackOf('000001').length;
  assert.equal(before, 2, 'aircraft #1 has two fixes before anything is evicted');

  /* now push one more aircraft in: something must go, and it must not be aircraft #1 */
  T.trackRecord(cap + 1, t0 + 61000, lon2mx(0), lat2my(51), 0);
  assert.equal(T.trackOf('000001').length, 2,
    'the most recently updated aircraft was evicted — `used` is not ordering anything');
  assert.equal(T.trackOf(((cap + 1)).toString(16).padStart(6, '0')).length, 1, 'and the new arrival got a slot');
});
}

/* ══════════ from tests/r175-checks.test.mjs — 3 of its 16 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js・js/aircraft-detail.js・js/flight-sim.js は DOM と描画エンジンに閉じたファクトリで node では組み立てられない（遅延モジュールの登録は LAZY_REGISTRY を import して問うている） */
/* (#R175) the round's header note is kept with its largest block, in tests/layer-boot-graph-checks.test.mjs */

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
/* (#R175) the application body is js/app-body.js now — the camera hook, the tooltip clamp and the
   module instantiations all live there. THAT is what those assertions must read: pointed at
   index.html they would pass vacuously, which is precisely the failure this file exists to prevent. */
/* (#R178) the application body is TWO files now — js/geo-engine.js was carved out of app-body.js
   this round (the renderer adapter + the IntMapGeoEngine facade, moved verbatim). Same program,
   two files, so every invariant below still asks the same question. */
const body = [readFileSync(join(ROOT, 'js/app-body.js'), 'utf8'),
              readFileSync(join(ROOT, 'js/geo-engine.js'), 'utf8'),
              /* (#R322) …and THREE now: the camera geometry moved to js/camera-math.js when the
                 renderer-command census pushed the shell over its line ceiling (tests/r168 #8).
                 Same program, same invariants — the functions are byte-identical to the versions
                 that were in js/geo-engine.js, modulo the indentation of the move.
                 ⚠ THIS JOIN, NOT appShell(): r168 #8 counts the SHELL'S LINES from appShell, and
                 putting 375 lines back into it would undo the move this file is following. */
              readFileSync(join(ROOT, 'js/camera-math.js'), 'utf8')].join('\n');
const entry = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
const panel = readFileSync(join(ROOT, 'js/aircraft-detail.js'), 'utf8');
const sim = readFileSync(join(ROOT, 'js/flight-sim.js'), 'utf8');

test('R175 ②: the click opens a detail card, and the ADS-B record carries the whole feed', () => {
  const dl = readFileSync(join(ROOT, 'js/data-layers.js'), 'utf8');
  for (const f of ['ias:', 'tas:', 'mach:', 'oat:', 'navAlt:', 'navQnh:', 'roll:', 'trueHdg:', 'magHdg:', 'windDir:', 'windSpd:', 'rssi:', 'messages:', 'src:', 'emergency:']) {
    assert.ok(dl.includes(f), `adsbToPlane must carry ${f} — the card shows it and the sim starts from it`);
  }
  /* ══ ⚠ (#R499) THE RELATION, NOT THE SPELLING ═══════════════════════════════════════════════
     This asserted the exact characters of one line — `HOST.mapTooltipEl.style.display='none'` —
     and #R499 changed them everywhere on purpose: the tooltip's `display` is written in ONE place
     now (js/map-tooltip.js's showMapTooltip / hideMapTooltip), because thirty-seven sites across
     eight files wrote it unguarded on every mousemove and made the `offsetWidth` read beside it a
     forced synchronous layout. #R488 is the standing lesson about what happened here: a check that
     pins a spelling cannot tell a rename from a regression, and it goes red on the change that
     makes the code MORE correct. So the claim is the one this test's own name makes — the branch
     that opens the card is the branch that stands the tooltip down — and it is asserted of BOTH
     places that branch exists (the label click and the 3-D body click). */
  const clicks = [...dl.matchAll(/if\(openPlaneCard\(d\)\)\{([^}]*)\}/g)];
  assert.equal(clicks.length, 2, 'the two click paths that can open the card are still two');
  for (const c of clicks) {
    assert.match(c[1], /hideMapTooltip\(HOST\.mapTooltipEl\)/,
      'a click opens the card and stands the tooltip down — through the one setter (#R499)');
  }
  assert.ok(dl.includes('else { const el=ensureMapTooltip();'), 'and falls back to the pinned tooltip if the card module is absent');
  assert.match(dl, /P\.update\(d,\{track:_trackCard\(d\.icao24\)\}\)/, 'the open card is refreshed by the live poll');
  /* ⚠ (#R311) THE CARD IS FETCHED WHEN THE AIRCRAFT IS CLICKED, so the factory call moved out of
     js/app-body.js into js/lazy-modules.js's mount and the boot guard can no longer see the key.
     The two things this asserted — «the factory is instantiated exactly once with the shared host»
     and «one list knows this factory exists» — are both still asserted, of the places that now hold
     them. What is NOT asserted any more is that it happens at boot, which this round made false on
     purpose: 30 kB of detail card for a session that never clicks an aircraft. */
  const loader = readFileSync(join(ROOT, 'js/lazy-modules.js'), 'utf8');
  /* (#R798) the mount is an entry of the registry; its spelling is the static gate's business */
  assert.ok(LAZY_REGISTRY.aircraftDetail && typeof LAZY_REGISTRY.aircraftDetail.mount === 'function' && LAZY_REGISTRY.aircraftDetail.publishes === 'IntMapAircraftPanel',
    'the factory is instantiated by the registry and publishes the panel');
  assert.ok(loader.includes('window.IntMapModules.aircraftDetail(IM_HOST)'), 'the factory is instantiated');
  assert.ok(!body.includes('window.IntMapModules.aircraftDetail('),
    'js/app-body.js instantiates it at boot as well — the module is then in the boot bundle regardless');
  assert.match(dl, /IntMapLazy\.need\('aircraftDetail'\)/,
    'the aircraft click does not fetch the card module first — it would reach a global that has not been downloaded');
  const inList = (name, list) => new RegExp(`const ${list} = \\[[^\\]]*'${name}'`).test(entry);
  assert.ok(inList('droneNav', 'MODULE_FACTORIES'), 'droneNav is covered by the boot-time required-module guard');
  assert.ok(LAZY_NAMES.includes('aircraftDetail'),
    'aircraftDetail is covered by the deferred half of that guard — one list still knows every factory');
});

test('R175 ②: the flight starts from the aircraft’s OWN conditions', () => {
  assert.match(panel, /FS\.start\(\{ aircraft:ic\.key, lng:ic\.lng, lat:ic\.lat, alt:ic\.alt, hdg:ic\.hdg, speed:ic\.speed, keepAlt:true \}\)/,
    'position, altitude, heading, airspeed and the machine — and keepAlt, or the sim would raise it');
  /* the spawn-clearance opt-out must exist AND leave the old default alone */
  assert.match(sim, /const _clrLift=\(\)=>\(st&&st\._keepAlt\)\?30:1500, _clrMin=\(\)=>\(st&&st\._keepAlt\)\?30:1200;/,
    'ground+1,500 m stays the default for every caller that does not know its altitude');
  assert.match(sim, /st\._keepAlt=!!opts\.keepAlt;/);
  assert.match(sim, /function spec\(k\)\{ const a=AIRCRAFT\[k\]; if\(!a\) return null;/,
    'the flight envelope is read from the simulator, never copied into the card');
  /* the type→machine ladder: an A0 emitter category is "no information", and taking it at face value
     is what flew a Boeing 737-800 as a Cessna in the first build of this card */
  assert.match(panel, /if\(\/BOEING\|AIRBUS\|EMBRAER/, 'the registry description is consulted when the category says nothing');
  assert.ok(panel.includes("A0:") === false, 'A0 (“no information”) is never printed as if it were a fact');
});

test('R175 ②: the card speaks all five languages and credits the photographer', () => {
  const calls = [...panel.matchAll(/\bL\(/g)].length;
  assert.ok(calls > 40, `the card should be fully localised (found ${calls} L() calls)`);
  /* every L(...) must carry five arguments — a four-argument call is a missing language */
  const short = [...panel.matchAll(/L\((?:'[^']*'|"[^"]*")(?:\s*,\s*(?:'[^']*'|"[^"]*")){0,3}\)/g)];
  assert.equal(short.length, 0, `every L() takes five languages; ${short.length} call(s) do not: ${short.slice(0, 2).map((m) => m[0]).join(' | ')}`);
  assert.match(panel, /planespotters\.net/i, 'the photo source is named');
  assert.match(panel, /acp-credit/, 'and the photographer is credited — the licence requires it');
  const refs = readFileSync(join(ROOT, 'js/reference-data.js'), 'utf8');
  assert.match(refs, /Planespotters\.net/, 'the photo API is registered in Sources ▸ terms');
});
}
