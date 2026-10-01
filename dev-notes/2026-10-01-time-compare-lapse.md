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

**国境の選択を 1 つの関数にした——ただし実装担当の触ってよい範囲の外なので、パッチとして渡した。** `js/time-borders.js` の `collectionAt(when, {live})`（描かない・「何を表示中か」の状態を持たない）と `modernAt(when, live)`。`go()` はその答えを描くだけになり、メイン地図の購読者も `modernAt` を使う。比較ウィンドウとタイムラプスはこれに訊く。⚠ **このパッチが当たっていない木では、ウィンドウの歴史国境は「国境の記録を読めませんでした」と述べて描かない**（偽の線は出さない）。

**ウィンドウの基図も時刻に従う。** 最初の版は 1914 の国境の下に CARTO のラスタ（**今日の**政治境界と国名——South Sudan・Rwanda）を描いていた（スクリーンショットで確認）。メイン地図は era の記録が答える瞬間に物理地理へ替える（`js/historical-basemap.js`）ので、ウィンドウも同じ層定義を自分の OpenFreeMap ソースで描き、その瞬間は CARTO を隠す（判定は `modernAt`、メイン地図と同じ 1 つの規則）。

**タイムラプス**（`js/time-lapse.js`、Chronos パネル `#ntl-lapse`）。年・日・時・刻み・開始〜終了（終了の既定は現在）・速度（½・1・2・4×）・ループ。**1 コマはその瞬間が描けてから**: ①カーネルがその瞬間を判定済み（`lastSettled`。現在を離れて表がまだ無いなら「まだ」）②全タイル到着（`IntMapGeoEngine.ready()`＝MapLibre の style `loaded()`）③画面の国境がその瞬間の記録（`collectionAt` の鍵と `current()`）。**訊ける相手がいない条件はコマを止めない**（三値。「観測できない」は「描けていない」ではない——`.agents/rules/one-pass-or-a-reason.md` §5）。そのあと速度ぶん留まる。だからコマは常に 1 つしか飛んでおらず、遅いタイルはラプスを遅くするだけで瞬間を飛ばさない。時計が他者（スライダー・リンク・Atlas）に動かされたら止まる（1 つの時計に書き手 2 人を作らない、#R293 の形）。`prefers-reduced-motion` では最も遅い速度に固定して述べる。各コマで、チェック済みの層の「描き始め／描かれなくなった」をカーネルの答えから記録する。

**Atlas。** `time.compare`（ウィンドウを開いてその時計を設定・`layer` でウィンドウの層も選べる）と `time.lapse`（再生・停止）。新しい観測器 `timeView` は**ウィンドウと再生器そのもの**に実行後の状態を訊き、結果の `want`（狙った状態）と一致したときだけ `completed`、呼ぶ前から一致していれば `already_there`、訊けなければ `unobserved`、一致しなければ `partial/no_change`。状態の `time` 節に `compare`（瞬間・従属か独自か・層と描けない理由）と `lapse`（範囲・今の瞬間・最後の出入り）。カタログの文は `js/atlas-catalog-text.js`。

**共有 URL。** `cmp=` の隣に `ct=`（年・ISO 日・`now`。従っている間は書かない）。`js/map-ui.js` はウィンドウの時計を `import`（`compareTime`）で読み、その変化でリンクを書き直す。

## 2. 歴史の主張として何が描かれたか（`.agents/rules/historical-verification.md`）

ウィンドウ 1914-06-15・メイン 1960-06-15 の実測（spec ①、パッチを当てたビルド）。両側とも CShapes 2.0 の日単位の枚: ウィンドウ `cs19140421`（1914-04-21 から有効）150 形、メイン `cs19600427` 164 形。

- 1914 だけにあるもの: Austria-Hungary・Serbia・Montenegro・Russia・Germany（帝国）・Newfoundland（自治領）・German Togoland・Kamerun・Italian Somaliland・Dahomey (France)・Niger (France)・Cote d'Ivoire (France)・Nigeria (UK)・Iceland (Denmark)・Alaska (USA)。**第一次世界大戦の開戦（1914-07-28）より前**の世界として正しい（サラエボ事件は 6-28）。
- 1960 だけにあるもの: Ireland・West/East Germany・Austria・Hungary・Czechoslovakia・Yugoslavia・Soviet Union・Cyprus・Finland・Iceland・Mali・Upper Volta・Ghana・Togo・Cameroon・British Cameroons・Congo・Democratic Republic of the Congo。
- ⚠ **未決として残す観測**: 1960-06-15 の枚で Dahomey・Niger・Cote D'Ivoire・Nigeria・British Somaliland が宗主国の括弧なしの名前で出る。独立はそれぞれ 1960-08-01・08-03・08-07・10-01・06-26。CShapes 2.0 が 1958 年の自治（フランス共同体内の共和国）や 1960-04-27 の改版で名前の形を変えている可能性があり、**この変更は記録の選択を 1 つにしただけで、名前の付け方には触れていない**（メイン地図は以前から同じ枚を描いている）。名前と独立日の突き合わせは別の作業として残す。
- メインを今日に戻すと、メイン地図は era の線を描かず（`TimeBorders.active()===false`、現在の基図が答える）、ウィンドウは 1914 のまま描く。「1914 | Today」。

## 3. 設計判断

- **比較側の層は、メイン地図の層のモジュールを再利用しない。** ウィンドウは独自の複製（`CMP_LAYERS`）を描く既存の構造で、そこに「誰が時計を当てるか」の宣言を足した。メイン地図のモジュールを 2 つ目の地図に走らせる構造（モジュールを地図で引数化）は今回の範囲を越える。
- **ウィンドウの既定は「従う」。** 同じ瞬間なら以前と同じものを描く——ただし #861 の規則はウィンドウにも効くので、メイン地図が過去にあるときウィンドウのライブ層は描かれなくなる（以前は今日の地震を描いていた）。
- **タイムラプスに打ち切りを置かない。** 描画が永遠に終わらないタイルは、コマを永遠に止める（状態行が「地図の描画を待っています」と述べ、読者は止められる）。上限で先へ進めば「描けていないコマを描けたと言う」観測器になる。
- **再生の記号は CSS で描く。** 予報再生器の SVG（`IntMapWxPlayer.IC`）を innerHTML に入れると、別モジュールの値として `output-taint` の台帳に未判定の葉が 2 つ増える。形（三角・二本線）は同じ語彙。

## 4. 統合時に要ること（実装担当の範囲外）

1. **`js/time-borders.js` のパッチ**（`collectionAt` / `modernAt` の切り出し）を当てる。無いと spec ① と比較側の国境が落ちる。
2. **`node scripts/global-surface.mjs --update`**: `window.IntMapBeta` の読みが 3 減り（ウィンドウが `hbCurrent` を読まなくなった）、増えるのは `window.IntMapCompare` +2（Atlas の能力と観測器——どちらも遅延チャンクか「時計と描画だけを import する」と決まった能力登録簿で、`js/compare.js` を import すると起動チャンクから 3 モジュールが割れた: `eager.requests` 9 → 12 を `scripts/perf-budget.mjs` で実測して取りやめ）、`window.IntMapHistScale` +1（ラプスの年の約束事 `utcAt`／`ymd`）、`window.IntMapTimeBorders` +2（ウィンドウとラプスが `collectionAt`／`modernAt` を訊く）、`window.IntMapHistoricalBasemap` +1（ウィンドウの物理地理の層定義）。どれも持ち主がファクトリ／IIFE の公開で export を持たないので import にできない。
3. **`check:perf`**: 新しい遅延チャンク `time-lapse`（8.6 kB）。起動チャンクの増分は、変更した 6 ファイルを esbuild で縮めて gzip した差で **+4.0 kB**（うち `js/compare.js` +3.3 kB）、`eager.requests` は 9 のまま。このマシンの build は `dist/data` まで main の天井と 82 kB ずれる（改行コード）ので、天井を上げる判断は CI の数で。CSS は Chronos パネルの既存の分節コントロール（`.ntl-modes`）を再利用して足し分を抑えた。
4. **能力の数の文**（`check:docs` capability-count）: `PRODUCT.md`・`docs/FILES.md` は 149／148 に直した。`DECISIONS.md` と `docs/architecture/02-features.md` の「147 / 146」は実装担当の範囲外。
5. **`tests/durations.json` に `time-compare-lapse` の実測秒**（`check:docs` deep-tier-size・`check:testbudget`）: 計られていない spec は固定の core に数えられ、core 7・全体 131 になる。spec 2 本は 2 workers で 38 秒（パッチを当てたビルド・ビルド時間を除く）。`docs/TESTING.md`／`package.json` の「全体 130」は 131 に。

## 5. 検査

- `node --test tests/time-compare-lapse-checks.test.mjs`（5 件）: 2 つの時計が独立でメインのメンバーは不変・意思はページで 1 つ／`onMap` で典拠の述べることは変わらず当てる者だけ変わる（ケッペン 1890 unstated・1950 stated・2024 carried、人口の塗り分け 1914 own-date）／ウィンドウの全層が読める宣言を名乗る（MERRA-2 は `validate` を通り 1914 unstated・1990 stated）／ラプスが 1900→1902 を毎年 1 コマで進み終端で止まる・日単位・時計を動かされたら止まる・空の範囲を拒む／`timeView` が状態を観測し、狙いと違えば `no_change`、訊けなければ `unobserved`。
- `tests/time-compare-lapse.spec.js`: ① ウィンドウ 1914 の地震は描かず理由を出す、ウィンドウ 1914 とメイン 1960 が**別々の枚**の国境を描く（上の名前の差）、メインを今日に戻してもウィンドウは 1914、`ct=1914` のリンクから開き直せる、Atlas `time.compare` が completed、同じ呼び出しの二度目は `already_there`。② ラプス 1898→1903 が `[1898,1899,1900,1901,1902,1903]` を 1 つも飛ばさず進み、ケッペンは 1899 で預かられ 1903 では描かれ、状態に「描き始め」が載る、Atlas `time.lapse` の再生・停止が completed。
- 実測: パッチを当てたビルド（ビルド設定の外側で `js/time-borders.js` を差し替え、作業ツリーの原文は不変）で ①② とも緑。パッチ無しのビルドでは ② 緑・① は国境の段で時間切れ（ウィンドウが「読めませんでした」と述べる）。
