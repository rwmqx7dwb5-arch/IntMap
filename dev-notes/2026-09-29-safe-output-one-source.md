---
title: 出力の無害化を 1 つの正本へ——48 ファイルが自前のエスケープを持ち、5 つは `"` を変換していなかった。独自実装・生きた文書でのテキスト化・url() を通らない href/src を形で数える台帳
date: 2026-09-29
---

〈依頼〉監査の結果: HTML エスケープの独自実装が 48 ファイル・49 か所あり強さがばらばら、href/src に
`IntMapSafe.url` を通らない補間がある、news-feed の `stripHTML` が生きた document で RSS の description を
解析している。範囲内のファイルを正本 `window.IntMapSafe`（index.html）へ寄せ、増えないように門を置く。

## 0. 測った

- 正本 `IntMapSafe.html` は `& < > " '` の 5 文字を変換する（index.html を評価して確認）——属性にも安全。
  正本側を直す必要は無かった。
- 門を先に書いて数えた（`node scripts/safe-output.mjs`）: 独自エスケープ **51**（index.html の正本と
  XML 用 2 つを含む）、生きた文書でのテキスト化 **1**、url() を通らない href/src の始まり **41**
  （定数で scheme が決まるもの・自ファイルの link builder を読んで除いたあと **31**）。
- 置き換えたあと、テストが Node で評価しているモジュールが 9 つあった（gis-atlas・atlas-map-compose・
  atlas-annotate・atlas-highlight・atlas-query・layer-manifest・waves・time-borders・routing-cards）。
  Node には `window.IntMapSafe` が無いので 74 件が `Cannot read properties of undefined (reading 'html')`
  で落ちた。⇒ この 9 つは元に戻して台帳の `pending` に残した（下の「残り」）。
- `stripHTML` を小さな ES モジュール（js/ の共有ヘルパー）に出す案は 2 つの実測で否定: news-feed.js は
  `tests/r169-checks` が **script として** parse する工場ファイルで `import` を置けない／静的 import は
  起動グラフのモジュール数（`tests/perf-baseline.json` の `modules: 284`、完全一致）を変える。

## 1. 直した

- 25 ファイルの独自エスケープを `window.IntMapSafe.html` への 1 行の委譲にした（ai-core・analysis-correlate・
  analysis-edu・analysis-panels・analysis-research・analysis-world-events・atlas-chart・dash-extended・
  drone-nav・map-extras・map-tools・monitors・navigation-ui・night-sky・pandemic-atlas・photo-geo・
  routing-ui・routing・sims・stats-compare・subcable-info・terrain-water・tool-panel・weather・world-packs）。
  `"` を変換していなかった analysis-edu / analysis-research はこれで属性に安全になる。
  挙動の差: `'` が `&#39;` になる（表示は同じ）、`null`/`undefined` が `"null"` ではなく空になる。
  エスケープ結果を textContent 等 HTML 以外へ入れている箇所は無かった（grep）。
- href/src: `js/cameras.js` のプリセット画像（OSM 編集可能な URL が `"` 置換だけで `data-u` と `img src` に
  入っていた）を `IntMapSafe.url` に通し、http(s) 以外は描かない。`js/ai-core.js` の報告画像と
  `js/photo-geo.js` の写真は `url(…, {allowData:true})`（どちらも canvas の data:image）。
- `js/news-feed.js` の `stripHTML` を `document.implementation.createHTMLDocument('')` の不活性な文書で
  解析するようにした（1 つを使い回す）。生きた文書の要素は未接続でも `<img src=x onerror=…>` を発火する。
- 門: `scripts/safe-output.mjs`＋`scripts/safe-output-ledger.json`、`scripts/static-checks.mjs` §12 の 1 規則。
  名前ではなく形（AST）で数える: `'&amp;'` と `'&lt;'` を**出力する**関数（decoder は数えない）／生きた
  `document.createElement` の要素へ非定数の innerHTML を入れて textContent を読む形／`href="`・`src="` の
  値を始める式が `IntMapSafe.url` 由来でないもの。台帳より多ければ落ち、少なければ台帳を下げさせる。
  `kept`（index.html の正本、gis-export の PAM XML、routing-export の GPX/KML）は理由の文が必須。
- 回帰: `tests/safe-output-one-source-checks.test.mjs`（委譲を木から発見して本物の IntMapSafe で評価・
  cameras の builder を評価・本物の stripHTML を「生きた文書に触れたら例外」の document で評価・門の変異）。

## 2. 残り（次の作業の入力＝台帳の `pending`）

- 独自エスケープ 23（kept 3 を除く）: admin.html・app-body ×2・atlas-console・countries-ui・data-layers・
  layer-packs ×3・map-ui ×4（範囲外）／sources-list（sources.html は IntMapSafe を読み込まない）／
  gis-atlas・atlas-map-compose・atlas-annotate・atlas-highlight・atlas-query・layer-manifest・waves・
  time-borders・routing-cards（Node で評価される）。後 2 群は**正本を module から import できる形にする**
  （index.html の変更）ことで初めて減らせる。
- url() を通らない href/src 25: admin.html・app-body・atlas-answer-render・atlas-console ×6・atlas-markdown ×2・
  atlas-reply・atlas-view-capture・beta-overlays・carto-basemap・companies-ui・countries-ui ×2・feedback・
  map-ui ×2・news-events ×2・sources-list・volcano-intel。先に scheme を検査してから `esc` だけで書いている
  ものも含む（門はその検査を見られない——`url()` に寄せれば数が下がる）。
- map-ui:3239 の「`<>&` を削除するだけ」は変換ではないので escaper の形に当たらない（範囲外・未対処）。
