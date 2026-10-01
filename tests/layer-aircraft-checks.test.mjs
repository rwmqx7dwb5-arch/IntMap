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
 *  ⚠ (remove-synthetic-planes) airplanes.live の旧掃引とその 2 つの描画だけを守っていた 4 本は、守る対象と
 *    一緒に撤去した（理由は各ブロックの冒頭）。撤去そのものは tests/remove-synthetic-planes-checks.test.mjs が測る。
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
/* ⚠ (remove-synthetic-planes) TWO OF THE THREE ARE WITHDRAWN WITH WHAT THEY GUARDED. 「R187 aircraft:
   the pick follows the rendering that is on」 pinned `pickPlane` / `_planeDrawAlt`, and 「R187 aircraft:
   a bigger budget, the same requests per second」 pinned the airplanes.live sweep's circle budget and
   its measured 1.2 s pace. Both were the per-browser sweep's, which is removed with its provider
   (403 to every request since #R341); the GPU cloud picks through js/aviation-live.js pick() and
   asks one server, so neither number has anything left to constrain. The removal is measured in
   tests/remove-synthetic-planes-checks.test.mjs. What #R187 asked for — THE FIRST MARK — is still
   checked, of the one place it is declared. */

/* ── 1. the aircraft mark is the FIRST one again ─────────────────────────────────────────────── */
test('R187 aircraft: the glyph is the original outline, stroke and size ramp', async () => {
  /* The outline shipped from the first commit through #R164. Checked point by point rather than as
     a blob so a "tidy-up" that nudges a vertex is a failure, not a silent redesign.
     (remove-synthetic-planes) js/plane-glyph.js is the one declaration since #R379, evaluated. */
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  if (!had) globalThis.window = {};
  let G;
  try { await import('../js/plane-glyph.js'); G = globalThis.window.IntMapPlaneGlyph; }
  finally { if (!had) delete globalThis.window; }
  assert.deepEqual(G.OUTLINE, [[0,-19],[2.2,-6],[2.2,-3],[17,5],[17,9],[2.2,4.5],[2.2,12],[6,16],[6,18],[0,15.5],
                               [-6,18],[-6,16],[-2.2,12],[-2.2,4.5],[-17,9],[-17,5],[-2.2,-3],[-2.2,-6]]);
  /* (#R246) 「両方とも：より太いアウトライン」 — the white line is one constant, thicker than 1.6 */
  assert.ok(G.STROKE > 1.6, 'the stroke is the one shared, thicker constant');
  assert.equal(G.CANVAS, 44, 'the original 44-unit artwork');
  /* ⚠ (#R247) the STOPS are the original ones scaled by 1.25 —「航空機の大きさを少し大きく」. */
  assert.deepEqual(G.SIZE, [[2, 0.5], [5, 0.725], [9, 0.975]], 'the size ramp — the original stops at 1.25x (#R247)');
  /* (#R189) the key is generation-bumped so a '1' stored under the R172–R186 default-TRUE era can
     no longer override the default — see r189-checks for the migration itself */
  const src = read('js/data-layers.js');
  assert.match(src, /let planes3D=true;[\s\S]{0,200}getItem\(PLANES3D_KEY\)/,
    'the real-altitude setting has its default and reads its own key');
});
}

/* ══════════ from tests/r188-checks.test.mjs — 2 of its 7 test(s) ══════════ */
/* ⚠ (remove-synthetic-planes) BOTH WITHDRAWN. 「R188 aircraft: the lattice is triangular…」 and
   「R188 aircraft: a 154-second sweep publishes as it goes, centre first」 pinned the planner, the
   pace and the carry-over rule of the per-browser airplanes.live sweep — the only thing in the app
   that fetched through them, removed with its provider. tests/remove-synthetic-planes-checks.test.mjs
   measures that none of it is left. */

/* ══════════ from tests/r190-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R190) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */

/* ── 1 · the aircraft mark, in BOTH renderings ───────────────────────────────────────────────── */
/* (remove-synthetic-planes) The lifted fill-extrusion body this pinned was the airplanes.live
   sweep's second rendering, removed with it. The two halves of #R190 that outlive it — ONE
   original outline for the mark, and 「at real altitudeはデフォルトで選択状態に」 — are asked of where
   they live: js/plane-glyph.js, and the setting js/data-layers.js hands to the cloud as `lift`. */
test('R190 aircraft: the lifted body is the original glyph, and "at real altitude" is the default', () => {
  const src = read('js/data-layers.js');
  assert.match(read('js/plane-glyph.js'), /const OUTLINE = \[\[0, -19\]/, 'the mark is the original outline, declared once');
  assert.doesNotMatch(src, /_PLANE_ORIG|_PLANE_OUTLINE|_PLANE_PLAN|_P_LEVELS|DETAIL_MAX_AIRCRAFT/,
    'js/data-layers.js builds no body of its own — neither the original copy nor the #R183/#R185 airliner');
  assert.match(src, /lift:planes3D/, 'the setting is what the cloud is told to draw');
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
  /* (remove-synthetic-planes) ONE click path now: the airplanes.live sweep's own click (and the
     poll-driven card refresh it did in recordTracks) went with that sweep. The path that is left —
     the GPU cloud's pick in _av2Click — keeps both halves of the claim. */
  const clicks = [...dl.matchAll(/if\(openPlaneCard\(d\)\)\{([^}]*)\}/g)];
  assert.equal(clicks.length, 1, 'the one click path that can open the card');
  for (const c of clicks) {
    assert.match(c[1], /hideMapTooltip\(HOST\.mapTooltipEl\)/,
      'a click opens the card and stands the tooltip down — through the one setter (#R499)');
  }
  assert.ok(dl.includes('else { const el=ensureMapTooltip();'), 'and falls back to the pinned tooltip if the card module is absent');
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
  /* (module-graph) the mount calls the export off the namespace its own import() resolved to */
  assert.ok(loader.includes('m.aircraftDetail(IM_HOST)'), 'the factory is instantiated');
  assert.ok(!/(?:window\.IntMapModules\.)?\baircraftDetail\(/.test(body) && !/from '\.\/aircraft-detail\.js'/.test(body),
    'js/app-body.js instantiates (or imports) it at boot as well — the module is then in the boot bundle regardless');
  assert.match(dl, /IntMapLazy\.need\('aircraftDetail'\)/,
    'the aircraft click does not fetch the card module first — it would reach a global that has not been downloaded');
  /* (module-graph) the boot-time guard was src/main.js's MODULE_FACTORIES list; a boot factory is now an
     export js/app-body.js imports by name, so a missing one is a link error — the import IS the guard */
  assert.match(body, /^import \{ droneNav \} from '\.\/drone-nav\.js';/m, 'droneNav is covered by the boot-time required-module guard');
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
