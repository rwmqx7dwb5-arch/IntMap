/* ============================================================================
 *  The precipitation radar layer (RainViewer zoom ceiling)
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r482-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r482-checks.test.mjs — 5 of its 5 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない（③ は拒否すべき旧い綴りそのものに対して門を実行している） */
/* ============================================================================
 *  R482 — 降水レーダーのタイルは z7 で終わる。その先は「絵に描かれた失敗」
 * ----------------------------------------------------------------------------
 *  「降水レーダー（実時間）レイヤーはある程度以上ズームしたら zoom level not supported と
 *    透かしがなりますが、それが出ないようにしてください。」
 *
 *  実測（2026-08-28・tilecache.rainviewer.com・4大陸・/256/ と /512/ の両方）:
 *    z4–z7  本物のレーダー（隣り合うタイルが互いに違う: 435 B – 19,100 B）
 *    z8 以降 どこでも**バイト単位で同一の 1,370 B の PNG**——灰色の板に
 *           「Zoom Level Not Supported」。HTTP は **200**。
 *
 *  ⚠⚠⚠ これは #R479（CARTO の「API KEY REQUIRED」）と**同じ形**である。通信は成功し、
 *  失敗は画像の中に焼き込まれる。だから `onerror` も、タイル数の計器も、ネットワークを見る
 *  検査も**永久に緑**になる。捕まえられるのは「このリポジトリが z8 以上のレーダータイルを
 *  要求する綴りを持っているか」だけで、それは**静的に読める**。
 *
 *  ⚠ 直し方は「z7 より上でレイヤーを隠す」ではない。z7 のタイルを**引き伸ばす**（overzoom）と、
 *  どのズームでも雨の場は画面に残る——読者が求めたのはそれ。無料モザイクは元々 ~2 km/px なので、
 *  z7（赤道で ~1.2 km/px）は既にネイティブ解像度であり、引き伸ばしが足すのは**ぼけであって
 *  誤りではない**。
 *
 *  ⚠⚠ **この数字を上げてはならない。** 天井を高くしても無料枠に無い解像度は買えない。
 *  買えるのは灰色の板だけである（#R433 の形——閾値を上げるのは defect の再導入）。
 * ==========================================================================*/

/** 無料枠が実際にレーダーを返す最も深いズーム（実測）。検査の側にも書いて、実装と突き合わせる。 */
const MEASURED_MAX_Z = 7;

function rvMaxZ() {
  /* (layer-packages) the radar row's implementation is its layer package js/layer-pkg-radar.js (dl-radar `pkg`) */
  const m = /const\s+RV_MAX_Z\s*=\s*(\d+)\s*;/.exec(codeOnly(read('js/layer-pkg-radar.js')));
  assert.ok(m, 'js/layer-pkg-radar.js は RV_MAX_Z を数値リテラルで宣言する（1か所で変えられる形）');
  return Number(m[1]);
}

/* ── ① 天井は名前を持ち、1か所にしか無い ─────────────────────────────────────────────── */
test('R482 ① RV_MAX_Z is declared exactly once and is at most the measured ceiling', () => {
  const src = codeOnly(read('js/data-layers.js') + '\n' + read('js/layer-pkg-radar.js'));   /* once across both — the package and the file it left */
  const all = src.match(/const\s+RV_MAX_Z\s*=/g) || [];
  assert.equal(all.length, 1, '天井が2つ綴られていると、片方だけ直った状態が作れてしまう');
  assert.ok(rvMaxZ() <= MEASURED_MAX_Z,
    `RainViewer の無料タイルは z${MEASURED_MAX_Z} までしか本物を返さない（z${MEASURED_MAX_Z + 1} 以降は 200 のまま「Zoom Level Not Supported」の板）`);
});

/* ── ② レーダーのラスターソースはその天井で作られる（数値リテラルを直に書かない） ───────── */
test('R482 ② the radar raster source is built with RV_MAX_Z, not a bare number', () => {
  const src = codeOnly(read('js/data-layers.js') + '\n' + read('js/layer-pkg-radar.js'));   /* (layer-packages) once across both */
  const calls = [...src.matchAll(/addRaster\(\s*'radar'\s*,\s*([^)]*)\)/g)].map((m) => m[1].trim());
  assert.equal(calls.length, 1, 'レーダーのラスターは1か所でしか作られない');
  assert.match(calls[0], /,\s*RV_MAX_Z\s*$/,
    "addRaster('radar',tiles,RV_MAX_Z) — 直書きの数字は #R482 以前の 12 に戻る道を開ける");
});

/* ── ②b その天井が本当にソースの maxzoom として渡ることを、addRaster 自身で確かめる ─────
   #R465 の形: 検査は「守っているつもり」ではなく「効いている」ことを見せる。三番目の引数が
   maxzoom に届いていなければ、①も②も緑のまま z8 が要求される。 */
test('R482 ②b addRaster hands its third argument to the source as maxzoom', () => {
  const line = codeOnly(read('js/data-layers.js'))
    .split('\n').find((l) => l.includes('function addRaster('));
  assert.ok(line, 'addRaster は js/data-layers.js にある');
  const arg = /function addRaster\(\s*\w+\s*,\s*\w+\s*,\s*(\w+)\s*\)/.exec(line);
  assert.ok(arg, 'addRaster(id,tiles,maxz) の三引数');
  assert.ok(new RegExp('maxzoom\\s*:\\s*' + arg[1] + '\\b').test(line),
    'その引数がラスターソースの maxzoom になる——ならなければ天井は何も止めていない');
});

/* ── ③ ゲートが #R482 以前の綴りに対して実際に発火する ────────────────────────────────── */
test('R482 ③ the gate refuses the pre-#R482 spelling', () => {
  const shipped = "      addRaster('radar',tiles,12);";
  const calls = [...codeOnly(shipped).matchAll(/addRaster\(\s*'radar'\s*,\s*([^)]*)\)/g)].map((m) => m[1].trim());
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0], /,\s*RV_MAX_Z\s*$/,
    '出荷されていた綴りは②が拒否するものと一致していなければならない');
  assert.equal(Number(/,\s*(\d+)\s*$/.exec(calls[0])[1]), 12,
    '天井は 12 と書いてあった——データの5段先');
});

/* ── ④ このリポジトリが組み立てる他の RainViewer タイル URL も、天井の中に居る ───────────
   凡例のサムネイル（js/layer-previews.js）は固定ズームの1枚を焼く。そこが z8 になれば、
   レイヤーパネルの絵そのものが灰色の板になる——地図が直っても読者は板を見る。 */
test('R482 ④ every fixed-zoom RainViewer tile URL in the repo asks for a served zoom', () => {
  const src = codeOnly(read('js/layer-previews.js'));
  const line = src.split('\n').find((l) => l.includes('_radar=') && l.includes('1_1.png'));
  assert.ok(line, 'js/layer-previews.js の radarURL() が1枚の RainViewer タイルを組み立てる');
  const inUrl = /\/(?:256|512)\/(\d+)\//.exec(line);
  assert.ok(inUrl, 'そのズームは URL に直書きされている');
  assert.ok(Number(inUrl[1]) <= MEASURED_MAX_Z,
    `サムネイルのズーム z${inUrl[1]} は無料枠の天井 z${MEASURED_MAX_Z} を超えている`);
  const tile = /tXY\(\s*(\d+)\s*,/.exec(line);
  assert.ok(tile, 'タイル座標も同じ関数で計算される');
  assert.equal(Number(tile[1]), Number(inUrl[1]),
    'URL のズームとタイル座標のズームは同じ数でなければならない（違えば別の場所の絵が出る）');
});
}
