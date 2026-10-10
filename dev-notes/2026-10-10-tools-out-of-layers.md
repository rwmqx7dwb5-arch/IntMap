---
title: 道具とシミュレーションを Layers から外し、右上の Tools ▾（携帯は Map tools シート）の 4 節にまとめる（tools-out-of-layers）
date: 2026-10-10
newsen: Tools and simulations moved out of Layers into one Tools menu at the top right (the Map tools sheet on a phone), in four sections: measure & draw, utilities, simulations and analysis. Layers keeps only layers and presets; its search still finds a tool by name.
newsjp: 道具とシミュレーションが Layers から右上の「ツール」にまとまりました（携帯は Map tools シート）。測る・描く／道具／シミュレーション／分析の 4 節です。Layers はレイヤーとそのプリセットだけになり、Layers の検索に道具の名前を打てばその道具も出ます。
---

〈依頼〉「Layers」パネルに、レイヤーではない「道具」が混ざっている——「何を見るか」と「何をするか」が 1 つの箱にある。
右上の「Measure ▾」を「Tools ▾」に作り直して 4 節（測る・描く／道具／シミュレーション／分析）の 1 枚にし、
Layers からは道具群と分析の帯を外す。携帯の Map tools シートも同じ節構成に。能力と品質は下げない（統合は削除ではない）。

## 何を動かし、旧い入口から来た人がどこに着くか

| 旧い場所 | 新しい場所 | 呼び出し元の行き先（確かめた方法） |
|---|---|---|
| Layers パネル末尾の「ツール」節（`SIM_TOOLS` の 15 行、`toolsBlock()`） | Tools ▾ の「道具」（`group:'tool'` の 5 行）と「シミュレーション」（残りの 10 行）。携帯は Map tools シートの同じ 2 節 | 行は従来どおり `IntMapOS.exec(id,{source:'ui'})`。コマンドパレットは `data-act` の行を読む（ux-next ① が行ごとに名前で見つかることを測る）。右クリックメニュー・Atlas・ショートカットは同じコマンドを直に押すので変わらない |
| Layers の「ツール」節に運ばれていた `#layer-tools` の帯（比較ビュー・相関分析・地図データの読み込み・データと分析・プレイグラウンド） | Tools ▾ の「分析」。`_placeLayerTools()` の運び先だけが変わった | ボタンの id・ハンドラは同じ。パレットの `#layer-tools button` 面もそのまま。smoke R766 ①②③ が帯の扉を DOM から数え上げて到達可能性を測る（デスクトップ・携帯 375） |
| 同じ帯の「現在のレイヤー構成を保存」`#lyr-presets` | **Layers に残る**（レイヤー状態なので）——タイル盤の末尾の「プリセット」節 | 同じ `_placeLayerTools()` が Layers パネルのプリセット節へ運ぶ |
| 帯の `#btn-seismic-sim` / `#btn-pandemic-sim`（同じパネルの行と同じコマンドの 2 つ目の扉で、#R766 以来は運ばれるたびに隠されていた） | 行 `sim.seismic` / `sim.pandemic` が唯一の扉 | `js/app-body.js` の 2 つの登録から、もう無いボタンを指す `btn:` を外した（`js/atlas-selfcheck.js` が「ボタンがページに無い」と報告する種類のもの）。パレットは行の `data-act` で見つける |
| 右上の「Measure ▾」（距離／面積・描画・半径・3D 体積） | Tools ▾ の「測る・描く」。トリガ `#btn-measure-menu` と `#measure-dropdown` の id、4 ボタンの id とハンドラは**そのまま**で、ラベルが「Tools／ツール」になった | ショートカット M / R / D・Atlas の clickId・携帯の `data-proxy`・既存の spec（r170 / r171 / r151）は同じ id に着く |
| 携帯 Map tools シートの 6 タイル（グリッド・計測・描画・3D 体積・半径・スクリーンショット） | 同じ 6 タイルが「測る・描く」節に入り、その下に道具・シミュレーション・分析 | `data-proxy` の経路は同じ。行を押すとシートが下がる |

- **組み立ては 1 つ**: `js/map-ui.js` の `mountTools(container,{measure,onPick})`。デスクトップは起動 1.5 秒後（行のコマンドを
  カーネルに登録するのは従来どおりここ）とトリガを押すたび、携帯は `openSheet(toolsSheet)` のたびに呼ぶ（冪等）。
  行は `_toolRow()` 1 つが描き、点灯・2 度押しでの解除（#R264）・`dot`（経路が残っている印）は以前と同じ読み方。
- **Layers の検索は道具も見つける**（#R291「Layersの検索で route / directions / 経路 …から発見できるように」を失わないため）。
  文字が入っている間だけ、一致した道具の行が同じ `_toolRow()` でレイヤーの下に出る。空なら 1 行も無い。
- 節の見出しは各節で畳める（#R469 の「ツールも畳めるように」の能力を節ごとに残した）。件数バッジは付けていない。
- 帯の扉を押すと、行と同じくメニュー／シートが引っ込む（帯の中のファイル一覧のボタンは除く）。

## 文字列

新しく書いた文は en + jp だけ: 節の見出し「Measure & draw／測る・描く」「Utilities／道具」「Simulations／シミュレーション」
「Analysis／分析」と Layers の「Presets／プリセット」。Tools ▾ のラベルと title は既存の `ttlTools` / `ttlMapTools`（9 言語あり）。
使われなくなった `measureMenuBtn` / `ttlMeasureTools` は `#R450` の門（読み手の無い行）に従い `scripts/i18n-dead-key-codemod.mjs
--write` で全言語から外し、`tests/i18n-coverage-floor.json` を `--update-floor` で書き直した（keyed 414→412、positional
7161→7159——後者は帯の 2 ボタンの 5 言語ラベルで、同じ文は `SIM_TOOLS` の行に残っている）。

## 検査の置き場所

依頼は新しい spec `tests/tools-out-of-layers.spec.js` だったが、書いて測ると `check:testbudget` の core が 0.9 分（天井 0.3 分）
になった——新しいファイルは起動 1 回分（p75 36 秒）を請求される。同じ 4 本を `tests/smoke.spec.js` の末尾近く
（「tools-out-of-layers ①〜④」）に置き、既に起動しているページで測る。①デスクトップの Tools ▾ に 4 節と全行があり、
各行のコマンドがカーネルにある ②Layers に道具の行と帯が無く、検索では道具が出て、プリセットは Layers にある
③経路・地震シミュレーター・距離／面積がクリックで開き、メニューが閉じる ④携帯幅で Map tools シートに同じ節と同じ行がある。

## 共有窓口（`check:surface`）に足した読み

- `window.IntMapLayerSidebar`（`js/mobile-ui.js`）——携帯の Map tools シートを開くとき `mountTools` を呼ぶ。Layers シートが既に
  同じ窓口の `mountInto` を呼んでいるのと同じ形で、組み立てを 2 つ目に作らないための読み。
- `window._closeMeasureMenu`（`js/map-ui.js`、2 読み）——行を押したあと Tools ▾ を閉じる。閉じ方の持ち主は `js/app-body.js` で、
  クリックの外側で閉じるのも Share ▾ との排他も同じ関数を通る。
- `window.IntMapStack`（`js/map-ui.js`）——開いたメニューに `opened()` で前面の印を渡す。経路パネルを開いたまま
  Tools ▾ を開くと、前面の印を持つパネル（`.im-front`）がメニューの上にあり、経路の行の 2 度目の押下がパネルの見出しに
  落ちた（全件の smoke で R291 ① が実測で赤）。ポインタでの押下は `wire` が既に上げるが、パレットや Atlas の clickId は上げない。
- 減った読み（`window.IntMapLazy`・`IntMapOS`・`IntMapSeismic`・`_pgPandemic` 各 2）は、帯の地震・パンデミックのボタンを外した分。
