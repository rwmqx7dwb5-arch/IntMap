---
title: 機能の整理——重複実装と「あるだけ」の機能を片付け、世界銀行の塗り分けを 1 系統に・撤去した行の旧 id を宣言 1 か所で読み替える
date: 2026-11-16
newsen: World Bank country maps (life expectancy, unemployment, internet, corruption, national precipitation) now come from one set of layers with a year picker and tap-to-read values on touch screens; old links and saved sessions open the same maps.
newsjp: 世界銀行の国別塗り分け（平均寿命・失業率・インターネット・汚職・国別年降水量）を 1 系統にまとめ、年の選択とタッチでの数値表示をそろえました。古いリンクや保存したセッションも同じ地図を開きます。
---

〈依頼〉「機能増えすぎでは？ 機能を消すのではなく整理を」→ 棚卸し 26 件のうち ①（不要物の片付け）と ②（重複の統合）。③（答えが違う入口の多さ）はやらない。

## 0. 測った

棚卸し（scout 2 回）で ② の候補を精査した結果、**重複に見えて能力が違う**ものが多かった。統合すると利用者が失うので**行わなかった**:

| 候補 | 行わなかった理由（実測） |
|---|---|
| 国別統計 61 行を指標ブラウザ 1 本へ | 複数指標の同時重ね・指標ごとのお気に入り・サムネイルが失われる |
| 出生率 `dl-tfr`／`bx-wbfert` | 同じ系列だが `dl-tfr` は 1960 年まで、`bx-wbfert` は 1990 年から |
| 軍事費 `dl-milSpend`／`bx-wbmilgdp` | 別の量（総額モードは相手が無い） |
| 人口密度 `dl-pop`／`bx-wbdensity` | 別系列（1850 年からのマディソンと 1990 年からの WDI） |
| 旧クイズ → ラーンクエスト | 国旗・首都・シルエット・人口/面積対決はクエストに無い |
| 「その他」棚の 11 行 | 年降水量（世界銀行）以外は固有の描画を持つ |

## 1. 片付けたもの（形式上の削除。何が役目を引き継いだか）

- **有料プランの名残**: `js/premium-plan.js`（中身は空の `openProModal` と再描画だけの `refreshProUI`）、常に真を返す `imIsPro`、
  その分岐で到達不能だった衛星の「Pro 限定」表示とアップグレードボタン、設定されない `proIntelOn` の枝、生成されない
  `.premium-*` / `.ppm-*` の CSS／JS 選択子。衛星の自前キー欄はそのまま（施錠の枝が消えただけ）。
- **ウェルカムカード `_imWelcome`**: 呼び出しがコメントアウトされ到達不能。ガイドツアーの入口（`_imStartDemo`）は残る。
- **`js/dash-extended.js` の (E) 重ね描き**: 入口が空（`buildUI(){ return; }`）で、出典の無い手書き座標（防空圏 14 点・係争線 5 本）
  と、配布されていない言語ファイルを読む重ね描き。Atlas の汎用 module 経路からだけ届いた。引き継ぎ: ウクライナ前線は
  `beta-dl-ukrfront`、言語は `beta-dl-cat-language`。係争線と防空圏は**相当物が無い**——出典つきで作り直すなら別の作業。
- **仕様書の古い記述**: `PRODUCT.md` の Playground（廃止済みの Statecraft／World Sandbox）と、読める Shapefile／GeoPackage／Excel を
  「読めない」としていた行。
- 上の撤去で誰も参照しなくなった翻訳行 146 行は `scripts/i18n-dead-key-codemod.mjs --write` で除いた（`#R450` の門）。

## 2. 統合したもの

- **世界銀行の第 2 の実装（`js/layer-packs.js` の `WB` 表と `wbToggle`）を撤去し、`js/wb-layers.js` の 1 表へ。**
  平均寿命・失業率・インターネットは同じ系列を 2 行が塗っていた（`bx-wblife`／`bx-wbunemp`／`bx-wbnet` を残し、畳み込みから出して
  共有リンクに載せる）。汚職指標と年降水量（国別平均）はこの表の新しい行 `bx-wbcpi`・`bx-wbprecip`。
  引き継いだ能力: 年の選択・時計追従・凡例・出典・灰色の欠測表示は表側が元から持つ。**タッチでのタップ表示**は旧側にしか無かった
  ので表側（`_wbHover`）へ移した——61 行すべてが得る。Atlas の語（life expectancy / unemployment / internet / corruption）は残った行へ。
- **WDI の source を読みに付けた**: `readWorldBank` は source を名乗らない読みに目録の source を使う。表側の `wbSeries` は
  source を渡しておらず、汚職指標（source 3）の系列は取れていなかった（旧側は単年の別の読みに落ちていた）。
- **撤去した行の旧 id を宣言 1 か所で**: 宣言に `formerly` を足し、`js/layer-manifest.js` の `currentIds` / `translateRetired` が読む。
  これまで保存セッションは `js/session-tabs.js` の `RETIRED` 表、共有リンクは `js/map-ui.js` の `dl-wars` の特例、お気に入りは
  何も持っておらず、3 つの入口が別々だった。既存の 7 件（海流・夜側・気温・CO₂・国防費・世界大戦の分割）も宣言へ移した。

## 3. 検査

`tests/map-layer-system-checks.test.mjs`（組が 0 であること・旧 id が新しい行を開くこと）、`tests/history-wars-checks.test.mjs`
②⑮ と `tests/session-restore-checks.test.mjs` ⑥ は `translateRetired` を評価する形に書き換えた。
