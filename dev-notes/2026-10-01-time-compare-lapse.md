---
title: 時計を地図ごとに持てるようにし、比較ウィンドウを「1914 年 | 今日」にできる二時点比較と、描画を待って進むタイムラプスを足す
date: 2026-10-01
---

〈依頼〉PRODUCT.md §4 項目 9「時間の統合 — 二時点比較」の足し算の造形。#861 の「時刻 T の世界を典拠が述べる範囲でだけ描く」1 つの時間の機構の上に、①比較ウィンドウに「もう片側の時刻」を持たせる、②年・日・時の任意モードで時計を連続して進める再生、③Atlas 配線（能力・カタログ・dispatch・状態・実行後検証）、④共有 URL に比較側の時刻。

## 0. 測った（着手前の構造）

| 何 | 着手前 | 意味 |
|---|---|---|
| 時計の数 | `js/chronos.js` の IIFE が返す **1 個**（`IntMapTime`）を約 30 ファイルが import | 2 つ目の地図が持てる「時計」という物が無かった |
| 比較ウィンドウ（`js/compare.js`）と時計 | **結線 0**。層は取ってきたものを描く | メイン地図が 1914 年でも、ウィンドウは今日の地震・2 日前の積雪を描いていた（#861 が直した欠陥の、比較側の残り） |
| ウィンドウの「過去の国境」 | `IntMapBeta.hbCurrent()`（別の歴史層が最後に読んだ年）か、無ければ **1914 の枚を名指しで取得** | 読者が選んでいない年。時計が無いので「どの年か」を述べる手段も無かった |
| `js/time-borders.js` の記録の選択 | `go()` の中で、**メイン地図への描画と絡み合って**いた（CShapes → OHM → 枚、各段の落ち方） | 2 つ目の地図は写すしかなかった（写しは禁止） |
| 時間カーネル（`js/layer-time-kernel.js`）の瞬間 | `clockAt()` が `IntMapTime` 固定 | 「この層はこの瞬間を述べるか」が**ページの**問いになっていた |
| 予報の再生器（`js/news-timeline.js` `fcPlay`） | モデルの有効時刻を 900 ms ごとに進める。年・日を再生するものは無し | — |

## 1. 何を作ったか

**時計は地図が持つ物になった。** `js/chronos.js` の本体を `makeClock(name)` という工場にし、`IntMapTime` はその 1 個目（メイン地図の時計。メンバー・床・放送は不変）。比較ウィンドウは `makeClock('compare')` を持つ。⚠「歴史へ向かう意思」（`intent`）は**ページの**信号として工場の外に 1 つだけ置いた——ウィンドウを 1914 年にしても歴史の束の先読みは同じように始まる。

**カーネルは「どの地図の時計か」と「その地図で誰が描くか」で訊かれる。** `verdict(id, clock, drawnBy)`。典拠が述べることは地図が変わっても同じなので宣言（`js/layer-time-decl.js`）はそのまま使い、時計を当てる者（`follows` / `self` / `ownDate`）だけをその地図のものに差し替える（純粋な規則 `js/layer-time.js` の `onMap`）。ウィンドウの各層は登録簿の中で `lid`（同じ典拠を描くメイン地図の層）と `drawnBy` を名乗る——**名前の一覧を別に持たない**。メイン地図の層に無い典拠（MERRA-2 月平均気温）は同じ語彙で自分の宣言を持ち、`judge(decl, clock)` が同じ `validate` を通して判定する（その初月 1980-01-01 は NASA GIBS の DescribeDomains を 2026-10-01 に読んで得た値。終端は上流が発行し続けるので書かない）。

**ウィンドウの層は時計に従うか、従わないと述べる。** 日付つき GIBS 4 層と MERRA-2 はウィンドウの日（月）のタイルへ張り替え（`setSourceTiles`）、ケッペンはウィンドウの年を含む 30 年期間（`KOPPEN_PERIODS` から読む）。WorldCover・人口グリッド・統計の塗り分けは自前の日付（`ownDate`）として「自分の日付を表示」と述べ、ライブ（地震・オーロラ・火災・前線）は過去では描かずに理由を出す。

**国境の選択を 1 つの関数にした。** `js/time-borders.js` の `collectionAt(when, {live})`（描かない・「何を表示中か」の状態を持たない）と `modernAt(when, live)`。`go()` はその答えを描くだけになり、メイン地図の購読者も `modernAt` を使う。比較ウィンドウとタイムラプスはこれに訊く。#868（滅んだ政体の名前を外す年代の規則）を取り込んだ後は、枚の段の答えが `_eraShow` / `_eraState` を通るので、**比較ウィンドウにも同じ年代の規則が効く**（1600 年の窓で、上流の名前を保ったまま外された政体の集合がメイン地図の連鎖の答えと一致することを smoke で測る）。⚠ 枚の段の順序を読む既存の検査（`tests/history-era-borders-checks.test.mjs` #R518 ④・#R690 ④）は `go()` の本文を切り出していたので、連鎖の持ち主である `collectionAt` の本文を読むように直した——主張（日単位の帯が枚より先・帯の中で空なら枚へ落ちる）は変えていない。

**ウィンドウの基図も時刻に従う。** 最初の版は 1914 の国境の下に CARTO のラスタ（**今日の**政治境界と国名——South Sudan・Rwanda）を描いていた（スクリーンショットで確認）。メイン地図は era の記録が答える瞬間に物理地理へ替える（`js/historical-basemap.js`）ので、ウィンドウも同じ層定義を自分の OpenFreeMap ソースで描き、その瞬間は CARTO を隠す（判定は `modernAt`、メイン地図と同じ 1 つの規則）。

**タイムラプス**（`js/time-lapse.js`、Chronos パネル `#ntl-lapse`）。年・日・時・刻み・開始〜終了（終了の既定は現在）・速度（½・1・2・4×）・ループ。**1 コマはその瞬間が描けてから**: ①カーネルがその瞬間を判定済み（`lastSettled`。現在を離れて表がまだ無いなら「まだ」）②全タイル到着（`IntMapGeoEngine.ready()`＝MapLibre の style `loaded()`）③画面の国境がその瞬間の記録（`collectionAt` の鍵と `current()`）。**訊ける相手がいない条件はコマを止めない**（三値。「観測できない」は「描けていない」ではない——`.agents/rules/one-pass-or-a-reason.md` §5）。そのあと速度ぶん留まる。だからコマは常に 1 つしか飛んでおらず、遅いタイルはラプスを遅くするだけで瞬間を飛ばさない。時計が他者（スライダー・リンク・Atlas）に動かされたら止まる（1 つの時計に書き手 2 人を作らない、#R293 の形）。`prefers-reduced-motion` では最も遅い速度に固定して述べる。各コマで、チェック済みの層の「描き始め／描かれなくなった」をカーネルの答えから記録する。

**Atlas。** `time.compare`（ウィンドウを開いてその時計を設定・`layer` でウィンドウの層も選べる）と `time.lapse`（再生・停止）。新しい観測器 `timeView` は**ウィンドウと再生器そのもの**に実行後の状態を訊き、結果の `want`（狙った状態）と一致したときだけ `completed`、呼ぶ前から一致していれば `already_there`、訊けなければ `unobserved`、一致しなければ `partial/no_change`。状態の `time` 節に `compare`（瞬間・従属か独自か・層と描けない理由）と `lapse`（範囲・今の瞬間・最後の出入り）。カタログの文は `js/atlas-catalog-text.js`。

**共有 URL。** `cmp=` の隣に `ct=`（年・ISO 日・`now`。従っている間は書かない）。`js/map-ui.js` はウィンドウの時計を `import`（`compareTime`）で読み、その変化でリンクを書き直す。

## 2. 歴史の主張として何が描かれたか（`.agents/rules/historical-verification.md`）

ウィンドウ 1914-06-15・メイン 1960-06-15 の実測（smoke の time-compare-lapse ①）。両側とも CShapes 2.0 の日単位の枚: ウィンドウ `cs19140421`（1914-04-21 から有効）150 形、メイン `cs19600427` 164 形。

- 1914 だけにあるもの: Austria-Hungary・Serbia・Montenegro・Russia・Germany（帝国）・Newfoundland（自治領）・German Togoland・Kamerun・Italian Somaliland・Dahomey (France)・Niger (France)・Cote d'Ivoire (France)・Nigeria (UK)・Iceland (Denmark)・Alaska (USA)。**第一次世界大戦の開戦（1914-07-28）より前**の世界として正しい（サラエボ事件は 6-28）。
- 1960 だけにあるもの: Ireland・West/East Germany・Austria・Hungary・Czechoslovakia・Yugoslavia・Soviet Union・Cyprus・Finland・Iceland・Mali・Upper Volta・Ghana・Togo・Cameroon・British Cameroons・Congo・Democratic Republic of the Congo。
- ⚠ **未決として残す観測**: 1960-06-15 の枚で Dahomey・Niger・Cote D'Ivoire・Nigeria・British Somaliland が宗主国の括弧なしの名前で出る。独立はそれぞれ 1960-08-01・08-03・08-07・10-01・06-26。CShapes 2.0 が 1958 年の自治（フランス共同体内の共和国）や 1960-04-27 の改版で名前の形を変えている可能性があり、**この変更は記録の選択を 1 つにしただけで、名前の付け方には触れていない**（メイン地図は以前から同じ枚を描いている）。名前と独立日の突き合わせは別の作業として残す。
- メインを今日に戻すと、メイン地図は era の線を描かず（`TimeBorders.active()===false`、現在の基図が答える）、ウィンドウは 1914 のまま描く。「1914 | Today」。

## 3. 設計判断

- **比較側の層は、メイン地図の層のモジュールを再利用しない。** ウィンドウは独自の複製（`CMP_LAYERS`）を描く既存の構造で、そこに「誰が時計を当てるか」の宣言を足した。メイン地図のモジュールを 2 つ目の地図に走らせる構造（モジュールを地図で引数化）は今回の範囲を越える。
- **ウィンドウの既定は「従う」。** 同じ瞬間なら以前と同じものを描く——ただし #861 の規則はウィンドウにも効くので、メイン地図が過去にあるときウィンドウのライブ層は描かれなくなる（以前は今日の地震を描いていた）。
- **タイムラプスに打ち切りを置かない。** 描画が永遠に終わらないタイルは、コマを永遠に止める（状態行が「地図の描画を待っています」と述べ、読者は止められる）。上限で先へ進めば「描けていないコマを描けたと言う」観測器になる。
- **再生の記号は CSS で描く。** 予報再生器の SVG（`IntMapWxPlayer.IC`）を innerHTML に入れると、別モジュールの値として `output-taint` の台帳に未判定の葉が 2 つ増える。形（三角・二本線）は同じ語彙。

## 4. 統合で片付いたこと

- `js/time-borders.js` の切り出しは統合側で #868 と合流済み（枚の段は `_eraShow` / `_eraState`）。
- `check:surface`・`check:perf` の台帳は統合側で作り直し済み（読みの増減と起動費の理由は下の節）。
- 能力の数の文（`check:docs` capability-count）: `PRODUCT.md`・`docs/FILES.md`・`DECISIONS.md`・`docs/architecture/02-features.md` を 149／148 に。
- **新しい spec ファイルは作らない**（`docs/TESTING.md` の前例）: ブラウザの検査は `tests/smoke.spec.js` の末尾に 2 本として入れた。smoke は `CORE_ALWAYS` で既に起動しているので起動の値段を払わず、`check:testbudget` と `deep-tier-size` の本数は動かない。共有ページなので各検査は時計・窓・チェックした箱・パネルを元に戻し、①はハッシュ遷移の復元が `js/map-ui.js` の自分の時計（3.2 s の層の再適用・3.5 s の `restoring` 解除）で走り終えるのを待つ——待たないと②の箱を外していた（実測）。共有リンクの復元は 2 回目の起動ではなく同じページのハッシュ遷移で測る。

## 5. 検査

- `node --test tests/time-compare-lapse-checks.test.mjs`（5 件）: 2 つの時計が独立でメインのメンバーは不変・意思はページで 1 つ／`onMap` で典拠の述べることは変わらず当てる者だけ変わる（ケッペン 1890 unstated・1950 stated・2024 carried、人口の塗り分け 1914 own-date）／ウィンドウの全層が読める宣言を名乗る（MERRA-2 は `validate` を通り 1914 unstated・1990 stated）／ラプスが 1900→1902 を毎年 1 コマで進み終端で止まる・日単位・時計を動かされたら止まる・空の範囲を拒む／`timeView` が状態を観測し、狙いと違えば `no_change`、訊けなければ `unobserved`。
- `tests/smoke.spec.js` の time-compare-lapse ①②: ① ウィンドウ 1914 の地震は描かず理由を出す、ウィンドウ 1914 とメイン 1960 が**別々の枚**の国境を描く、窓の基図は物理地理、1600 年の窓で滅んだ政体の名前が外れメイン地図の連鎖と同じ集合、メインを今日に戻してもウィンドウは 1914、`ct=1914` へのハッシュ遷移で窓の時刻が戻る、Atlas `time.compare` が completed・二度目は `already_there`。② ラプス 1898→1903 が `[1898,…,1903]` を飛ばさず進み、ケッペンは 1899 で預かられ終端では描かれ、状態に「描き始め」が載る、Atlas `time.lapse` の再生・停止が completed。
- 実測: smoke 全体 57/57 緑（2.2 分、うち time-compare-lapse の 2 本で約 1 分）。

## 起動費の天井を上げた理由

比較窓の時計（`makeClock`）とカーネルの `verdict(id, clock, drawnBy)` は起動時の `chronos.js` / `layer-time*.js` に入り（eager.raw / brotli）、タイムラプスの再生器と `time.compare` / `time.lapse` の能力は Atlas のチャンクと遅延チャンクに入る（async.gzip・atlas-console）。どれもこの変更の分で、`node scripts/perf-budget.mjs --update` で超えた行だけを上げた。eager にはこの機械の計測差が乗っている可能性があり、天井は main の実測で bot が下げる。

## 6. origin/main との合流（#868・#869・#871・#875）

- 能力は 150（#869 の `settings.usageCounts` と本作業の 2 つ）、到達可能 149。文書の件数は `check:docs` の実数に合わせた。
- #875 の「`tt` の無いリンクは現在」と揃え、**`cmp=` があって `ct=` の無いリンクは、比較窓をメイン地図の時計に従わせる**（`js/map-ui.js`）。smoke ① で `ct=1914` のリンクと `ct` の無いリンクを順に開き、窓が 1914 → 従属に戻ることを測る（2 本目は 1 本目の復元のタイマーが済んでから開く——重ねると #875 の待ち行列で 2 つ目の復元が後ろへずれ、次の検査の箱を外した。実測）。
- 起動費の台帳（`perf --update`: async.raw・dist.assets）と global surface の台帳は main の台帳から作り直した。増分は main 側の合流分と §1 のもの。
- `tests/history-chronos-clock-checks.test.mjs` R679 ⑩ は、紀元前の年を答えない拒否を `go()` の形（`{…return;}`）でだけ読んでいた。拒否は連鎖の持ち主 `collectionAt` の `return null` に移ったので、両方の形を受ける（主張は不変）。
- 台本カセット `rail-request-reached-nothing` は能力検索の結果に新しい 2 能力が並ぶので書き直した（`scripted-cassettes.mjs --write`）。
