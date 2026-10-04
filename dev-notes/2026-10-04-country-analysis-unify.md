---
title: 国の分析を 1 系統に——世界銀行の指標目録と取得を 1 か所へ、時系列グラフは多国比較の時系列表示、AI調査は Atlas の brief 一本、Screenshot は共有パネルの画像タブ
date: 2026-10-04
newsen: A country's time-series chart, its AI research and the map screenshot now each go through one path — and the screenshot carries the legends and data credits.
newsjp: 国の時系列グラフ・AI調査・地図のスクリーンショットがそれぞれ 1 つの経路になり、スクリーンショットには凡例と出典表記が入るようになりました。
---

〈依頼〉 統合 B（国の時系列・指標の 3 系統を 1 つに）・統合 C（国の「AI 調査」の三段フォールバック）・統合 H（画像の書き出し口が 2 つ）。
利用者は機能の統合を承認済み（「任せる」）。

## 1. 実測——何が何本あったか

- **世界銀行の指標が 7 つの表に手書き**されていた: `js/wb-layers.js`（塗り分けの 61 行）・`js/stats-compare.js`（多国比較の 22 系列）・
  `js/analysis-timeseries.js`（国の時系列 6 系列——全部が多国比較にもあった真部分集合）・`js/analysis-correlate.js`（散布図の軸 37）・
  `js/time-countries.js`（時計の 7）・`js/layer-packs.js`（5 行）・`js/layer-previews.js`（タイル 35）。CO₂ の「廃止された
  EN.ATM.CO2E.PC の代わりに AR5 系列を先に読む」も 3 か所に別々に書かれていた。⚠ 依頼の見立てにあった `js/indicator-browser.js` は
  **別の目録ではなかった**——`wb-layers.js` の `indicators()` と宣言の `measures` から組み立てている（ヘッダが自分でそう述べ、実装もそう）。
- **取得は 9 か所**（上の 7 ファイル＋`js/app-body.js` の PPP・`js/data-layers.js` の出生率）。キャッシュの持ち方、「空」の意味、
  「失敗」の意味がそれぞれ違った（同時実行の上限 6 は多国比較だけが持っていた——#R69 で 321 本同時発射を測った当のもの）。
- **国の時系列が 2 つ**（国カードのモーダルと多国比較の時系列表示）、**「AI調査」が 3 段**（Atlas の brief → `IntMapConsole.brief` → 調査パネル。
  どれになるかは Atlas が読み込み済みかどうかで決まり、パネルの brief は Web 検索も出典カードも持たなかった）。
- **地図の画像が 2 口**（Share ▾ の Screenshot＝`js/screenshot.js`、共有パネルの「画像」＝`js/map-recorder.js` postcard）。前者は
   `#map-container` だけを写す PNG で、凡例（地図上の DOM）は入るが**帰属表示の行 `#map-credit` は容器の外**にあるので入らなかった
  （出典表示の義務を満たさない。依頼の「凡例も入らない」は実測では誤りで、欠けていたのは出典表記）。

## 2. やったこと

- **`js/wb-indicators.js`（新規）** — 指標の目録 `WB_INDICATORS`（キー・系列 `code`／合算 `parts`／廃止系列 `fallback`／WDI の `source`・
  名前（既存の訳をそのまま運んだ）・単位・国テーブルの欄 `stat`）と、取得 1 本 `readWorldBank`。答えの語彙は
  `ok`（値あり・保持）／`none`（API が答えて値なし・保持）／`unavailable`（答えなし・保持しない＝次は読み直す）と、時間切れの `late`
  （観測できなかったのであって拒否ではない——one-pass-or-a-reason §5）。応答中の読みは共有し、同時 6 本まで（#R69 の 6 を全体の上限へ）。
  `makeWorldBankReader({ readWithin, clockFor })` が本体で、検査は同じコードを短い時計で組み立てて走らせる。
- 読み手は**キーで引く**: `wb-layers.js` の行は `{id, k, ramp}` だけ（`_wbInd` が系列・名前・単位を読み込む）、`stats-compare.js` は
  `W('gdp',{imf:…, fmt:…})`、散布図の軸は `['co2', log, fmt]`（軸の id `wb:<code>` は不変——Atlas の `correlate` が使う）、
  `time-countries.js` の FIELDS は `stat` を持つ指標から導出、`layer-packs.js` の行は `k`、タイルは `k`、Atlas の `_fillMetric` と
  `app-body.js` の `_imFillStat` は `wbIndicatorFor(field)`。
- **ラベルは系列ごとに 1 つ**になった。多国比較と散布図の名前のうち、塗り分けの行と同じ系列のものは行の名前に揃った
  （例:「失業率」→「失業率 %」、「平均寿命」→「平均寿命（世界銀行）」。#R246「ONE NAME, ONE PLACE」の延長）。
- **国の時系列** — `IntMapStatsCompare.timeline(code)` が多国比較を **その 1 か国・`tl` 印の 6 系列・時系列表示**で開く。国カードの
  「時系列グラフ」と Atlas の `data.timeSeries` はこれを呼ぶ（能力は減らない——Atlas は結果を**パネルの状態**から判定する）。
  旧チャートより増えたもの: 国を足す・他の 20 余の指標・IMF 切替・表・年の窓。`js/analysis-timeseries.js` と `IntMapTimeSeries` を畳んだ。
- **AI調査** — 国カードと地名ポップアップの両方が `IntMapAtlas.call('brief', name, lngLat)` の 1 本（ローダーが Atlas を取ってくる）。
  調査パネルにあって Atlas の brief に無かった「続けて訊く質問の候補」は、**到着と同じ 1 つの組み立て**（`js/atlas-reading.js`
  `offerHtml`/`wireOffer`）で brief の下に出す（`offer()`。候補は askHere と同じ `pointExamples`）。パネルの brief が持っていた
  「最初の行が地名だけなら落とす」は Atlas 側に既にある（`js/atlas-reply.js` `dropLeadTitle`）。「ここを AI に聞く」は #R83 から Atlas の
  askHere。`js/analysis-research.js` と `IntMapAIResearch` を畳んだ。
- **Screenshot** — `#btn-screenshot` は `IntMapShare.open({ tab:'image' })`。凡例と全出典表記（必ず焼き込まれる）が入った 1 枚になる。Atlas の
  `panel.screenshot` は同じボタンを押すので同じ所へ行く。`js/screenshot.js` を畳んだ（キーボード・作業窓・携帯のツールはどれも
  ボタンを押すだけだった）。
- 発見器 `scripts/lib/indicator-series.mjs` は目録を読む（行が `k` を書けば目録の系列に読み替える）。`measures` の照合は 0 問題のまま。

## 3. 検査

- 新規 `tests/country-analysis-unify-checks.test.mjs`（12 件・評価中心）: 系列コードと API の住所が目録以外の js/ に無い（AST で全 js/ の文字列）／
  目録の一意性／発見器が目録経由で行の系列を見つける／`readWorldBank` の語彙・保持・共有・同時 6 本・住所・時計の倍率（スタブの
  readWithin で走らせる）／`timeline` と Atlas `data.timeSeries` の run を評価／AI調査と Screenshot の配線と旧モジュールの不在。
- 書き換えた既存検査（主張は弱めず新しい形で守る）: `tests/helpers/wb-rows.mjs`（新規）が `wb-layers.js` の表と `_wbInd` を
  **実行して**行を返し、R266 ③・R254 ⑦・R270 ③⑥・R289 ④・map-layer-system ④ がそれを読む。⑥ の wb-layers／layer-packs、
  stalled-fetch ④ の出生率は本物の `readWorldBank` を注入。stalled-fetch ⑦ の床「時計つきの読みが 5 本以上」は、5 本が 1 本に
  畳まれたので「その 1 本（`js/wb-indicators.js`）を見つける」に変えた（`(cont.)` が 3 形の判別を別に保証）。
- 台帳: `tests/global-surface-baseline.json`（下記）・`tests/output-taint-baseline.json`（748→722 sink、381→380）・
  `tests/i18n-coverage-floor.json`（下記）・`scripts/i18n-key-collision-audit.mjs` の BENIGN から**衝突しなくなった** 21 語を削除
  （同じ英語に違う日本語が付いていた指標名——統合で 1 つになった）。

## 4. 窓口の増分と、訳の行（理由を書いて下げたもの）

- `check:surface` の新しい辺: `window.IntMapStatsCompare` の読み +2（国カードと Atlas の `timeline`——遅延モジュールなので静的 import
  できない）、`window.IntMapShare` +1（Screenshot ボタン——共有パネルは `js/map-ui.js` の factory が起動時に公開する）。
  減ったもの: `IntMapTimeSeries`・`IntMapAIResearch`・`__imAnalysis{TimeSeries,Research}` と、その読み。
- `i18n-dead-key-codemod --write` で **109 行**（ui.* の `screenshotSaved` 各 1、fr/ko/zh/zh-hans の inline 各 26）と staging 14 行を
  消した。どれも**畳んだ機能の文**（調査パネル・旧チャート・旧ボタン）と、目録へ 1 つに揃えたことで呼ばれなくなった旧ラベルで、
  #R450 ②「何も訊けない行を持たない」がそれを要求する。床は `--update-floor` で下げた（keyed 421→420、inline zh 6321→6285 など）。
  ⚠ 残っている行は 1 つも消していない——消えたのは**呼び手が無くなった**行だけ。

## 5. 残り

- 共有パネルの画像は地図の描画フレーム＋描いた凡例・出典で、旧 Screenshot が html2canvas で写していた **DOM の上乗せ**
  （HTML マーカー・タイムバーなど）は入らない。必要なら postcard 側の仕事。
- `js/layer-previews.js` のタイルの色段は、層が読み込まれる前の答えとして**写し**のまま（#R270 の注記どおり。系列は目録から）。
