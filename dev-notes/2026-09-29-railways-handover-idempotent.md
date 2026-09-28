---
title: 鉄道の世界の線が詳細の上に残り続けた——基図差し替えの自己修復が styledata のたびに toggle(true) を撃ち、toggle(true) が毎回世界図を再送して詳細の引き渡しを取り消していた／同じ形の自己修復を layer-packs の 6 パック全部で「レイヤーが消えたときだけ」の 1 つの規則に
date: 2026-09-29
---

〈依頼〉本番（b778dd6）で、鉄道レイヤーをオン → 東京 z5 → jumpTo z9 すると、詳細の線（`rail-det-ln`）が
描かれてから 20〜25 秒経っても世界の線（`rail-ln`）が消えず二重に描かれたままだった。

## 0. 測った（本番）

- 45 秒間 map の `idle` が **0 回**。`rail-det-src` はタイルつき `sourcedata` が **2,666 件**来ても一度も
  読み込み完了にならない。
- 15 秒で `styledata` **14 回**・`IntMapRailways.toggle(true)` **15 回**。

## 1. 原因の連鎖

1. `js/layer-packs.js` betaPack2 の「self-heal across basemap swaps」が `styledata` のたびに
   `IntMapRailways.toggle(true)` を呼んでいた。⚠ **`styledata` は「基図が変わった」ではない**——MapLibre は
   スタイルへの変更すべて（可視性・paint・filter・レイヤー追加。自己修復自身の書き込みを含む）の後に
   `Style.update` → `data` → `styledata` を撃つ（`node_modules/maplibre-gl/src/style/style.ts`）。
2. `toggle(true)` は毎回、世界図 111,660 本を `setSourceData('rail-src')` し直していた。
3. 続く `refreshDetail` → `revealDetail` が、待っている引き渡しを取り消して詳細を送り直していた。
4. ソースが完了せず `idle` も来ないので、引き渡しが永久に終わらない。直前の #787 で「描けてから隠す」
   待ちにしたので表に出た（その前は `setSourceData` と同じ tick で隠していたので、待ちが終わらないことは
   見えなかった）。

`.agents/rules/one-pass-or-a-reason.md` §2-3「操作が冪等でない」の形。

## 2. 直したもの（構造で 2 つ）

- **`toggle(true)` を冪等にした**（`js/railways.js`）。モジュールがソースのいま持っているもの
  （`sentWorld` = 渡した世界図、`sentDetail` = 渡して表示中／引き渡し中のセルの組）を覚え、同じものは
  送らない。記録を消すのは詳細が地図から下りたとき（閾値未満・セル過多・OFF・`drop()`）と、
  `ensure()` がソースを作り直したときだけ。同じセル内の小さな `moveend` も同じ理由で再送しなくなった。
- **自己修復は「行のレイヤーがスタイルから消えた」ときだけ撃つ——`js/layer-packs.js` の 6 パック全部**。
  ハンドラは 6 本あり（earthSky / landCover / betaPack2 / religionLang / timeZones / gibsScience）、どれも
  `styledata` のたびに撃っていた。1 つの規則 `healWhenLost(GE, delay, rows, heal)`（ファイル先頭）に寄せ、
  各パックは**自分の表から**行とレイヤー id を述べる（`SETS`・`ROW_LAYERS`・`WB[k].ids`・`CFG[k].ids`・
  `TZ_IDS`・`layId(L)`）。`heal(keys)` はオンでレイヤーを失った行だけを受け取り、`delay` の間に何回
  `styledata` が来ても判定は 1 回。止まったもの: オーロラ（NOAA）とプレート境界の再取得、時間帯ラベル・
  製薬・世界銀行 5 行の再送、データセンターの OSM 再取得、鉄道の `toggle(true)`。
  - betaPack2 の行ごとのレイヤー id は `ROW_LAYERS` を正本にし、不透明度の登録も同じ一覧を読む。
    timeZones は `setVis` と自己修復が `TZ_IDS` を共有する。
  - earthSky の海氷（`seaice`）は、以前の門（`state.dams||…||state.aurora`）に入っていなかったので
    単独でオンのときは修復されなかった。行の一覧を `SETS` から取るようにしたので修復される。

### ついでに見つかった実在の欠陥（同じ修正で直る）

- 基図差し替えのあと、`detailCovers` が true のまま残り、`toggle(true)` の `setVis(['rail-ln'], !detailCovers)`
  が**新しい空の詳細ソースの上で世界図を下ろしていた**（引き渡し完了前に線が 1 本も無い）。
  `ensure()` がソースを作り直すときに `detailCovers` と待っている引き渡しを戻すようにした。

## 3. 検査

`tests/railways-handover-idempotent-checks.test.mjs`。実物の `js/railways.js` と `js/layer-packs.js` を
偽の描画器で**評価する**（文字列として読まない）。

- ① 引き渡し待ちの間に `toggle(true)` を 15 回：世界図の再送 0・詳細の再送 0・待ちは生きたまま・
  `idle` で `rail-ln` が下りる。完了後の `toggle(true)` も `rail-ln` を戻さない。
- ② 基図差し替え（ソースとレイヤーが消える）では建て直し、新しいソースで引き渡しをやり直す。
  OFF→ON も引き渡しをやり直す。
- ③ **パックを手で並べない**。`js/layer-packs.js` が `IntMapModules` に足した工場（自分の import の分を
  除く）を全部建て、`styledata` の購読者を**購読から**発見し、パネルに出た行のチェックを全部オンにする
  （実測 6 パック・購読者 6・行 22）。レイヤーが在る間に `styledata` を 14 回撃って、取得・送信・
  レイヤー追加・自己修復の実行がすべて 0、スタイルが全部を失ったら各自己修復がちょうど 1 回。
  全購読者が `healWhenLost` を通ることも述べる。

直す前の赤（直した版を退避して元に戻し、確かめてから直した版に戻した）:

- ①②：元の `js/railways.js` で赤（世界図の再送／差し替え後に空の詳細の上で世界図を下ろす）。
- ③：元の `js/layer-packs.js` で、14 回の `styledata` が **取得 +140・送信 +14・鉄道 `toggle` +14・
  データセンター `toggle` +14**。betaPack2 だけ直した中間の版でも赤（残り 5 パックの再取得）。

## 4. 残したもの

- `styledata` がなぜ本番で約 1 秒に 1 回来ていたかは、発生源を 1 つずつは特定していない。規則を
  「在るか」に付けたので、発生源が何であっても自己修復はもう撃たない。
