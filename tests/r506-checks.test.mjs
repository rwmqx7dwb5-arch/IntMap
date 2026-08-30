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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
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
