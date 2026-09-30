---
title: 画面の「重なり順」と「端末の種別」を、それぞれ 1 つの持ち主が決める構造にする——js/ui-stack.js（IntMapStack）と js/ui-device.js（IntMapDevice）
date: 2026-09-30
---

〈依頼〉 監査（2026-09-29）の実測にもとづく構造改革。重なりの不具合が繰り返し出ていた（#R508、#823 の overflow、#824 の親の重なり文脈）。

## 0. 測った（変更前、コメントを除いたコード）

- **前面の持ち主が 2 つ。** `js/window-manager.js` が登録済みウィンドウへ pointerdown ごとにインラインの z-index を 2200 から数え上げて書き（`WIN_Z_BASE=2200, WIN_Z_CAP=2599`）、`js/map-ui.js` の `_wireFrontMost` が同じ pointerdown で `.im-front` と `body.im-float-front` を動かし、2650 を `_FRONT_Z` として `css/intmap.css` と二重に持っていた。
- **素の z-index 数値**は `js/`・`*.html`・`css/` に **147 個（47 ファイル）**、異なる値 72 種類（1〜2147483647）。スタイルシートは既に層の変数へ移っていた。
- **電話/デスクトップの境界**は `js/` に **63 回（37 ファイル）**——`matchMedia('(max|min-width:76x px)')` 34 回（23 ファイル）、注入 CSS の `@media(...)` 24 回（18 モジュール）、`innerWidth` と 768 の比較 5 回。`isMobile()` の呼び出しは 79 回で、それは `MOBILE_MQ` を読んでいた。スタイルシートは `max-width:767px` が 5 ブロック・`min-width:768px` が 1 ブロックあり、**幅ちょうど 768 px でスクリプト（電話）と 6 規則（デスクトップ）が食い違っていた**——経路パネルは js/routing-ui.js から見て電話（ドラッグ無しのシート）なのに箱はデスクトップの形。
- **セーフエリア**の `env(safe-area-inset-*)` は 141 回（スタイルシート 24、js/ 14 ファイル 117）、`0px` のフォールバックの有無もまちまち。
- 向きを見る規則はスタイルシートに 1 つ（宇宙の時刻シート）。`_imPhoneClass` は GPU/メモリの判断にだけ使われていた。

## 1. 持ち主

- **`js/ui-stack.js`（`window.IntMapStack`）**——ウィンドウ同士の順（`order`／旧 `bringToFront`）と「いま使っているパネル」（`front`/`back`、`.im-front`・`body.im-float-front`）を **document の capture リスナー 1 本**で決める。pointerdown が入った登録済みウィンドウを外側から順に並べ（旧・要素ごとの capture リスナーと同じ順＝内側が上）、続けて印を動かす。帯の端は `css/intmap.css` の新しい層 `--z-window`（2200）・`--z-shell-front`（2600）・`--z-front`（2650）を `level()` で**読む**——JS に 2200・2599・2650 は無い。順位は `calc(var(--z-window) + n)` で書き、上限は `shell-front − window − 1`（読む）。`.im-front` は `var(--z-front)`、開いたサイドバーは `var(--z-shell-front)`。R253〜R508・front-mark-outer-context の理由のコメントはコードごと移した。
  - **#824 の形**（親の重なり文脈に閉じ込められる）は、印を帯の中で競う一番外側の重なり文脈へ付ける `panelOf` として持ち主の中にある。
  - **#823 の形**（祖先の overflow で切られる）は重なり順では直らない。`clipOf(el)` が包含ブロックの鎖をたどって切っている祖先と軸を返す（計測）。自動で直す機構（ポータル化）は入れていない。
- **`js/ui-device.js`（`window.IntMapDevice`）**——境界 `(max-width:768px)` を js/ で書く唯一の場所（`COMPACT`/`WIDE`、`compact()`＝`isMobile()`、注入 CSS は `media()`/`'@media'+COMPACT`）。`phoneBudget()` は旧 `_imPhoneClass` の本体（#R499 の 3 節をそのまま）、`touchPrimary()` は旧 `_imTouchPrimary`。形の問い `kind()`＝phone / phone-landscape / tablet / desktop（主ポインタ coarse・画面の短辺 ≤ 500 px・向き）。`<body>` に `im-compact`・`im-dev-<kind>`・`im-portrait`/`im-landscape` を media query の change で保つ。`js/app-body.js` の `isMobile`・`_imPhoneClass`・`_imTouchPrimary` は持ち主を呼ぶだけになり、`window._imPhoneClass` の公開はそのまま（js/mem-budget.js の読み手のため）。
- 2 つとも `src/main.js` で `client-error-report` の直後、style 文字列を組むどのモジュールより前に import する。

## 2. 移したもの（描画順は 1 つも動かしていない）

- **z-index**: js/ と index.html の素の数値 136 個を、同じ整数に解決する層の式へ機械的に置換（下の層と上の層のうち近い方・同点は下、`var(--z-x)` か `calc(var(--z-x) ± n)`。コメントの中は置換しない）。**147 → 11**（7 ファイル）。残りは理由つきで台帳の `why` に: `admin.html`・`css/pages.css`（`css/intmap.css` を読まない別文書）、`js/atlas-*.js` 5 本（別の作業が持っていて触れなかった）。`--z-max`（2147483647）を足し、開発者用の perf HUD だけがそこに座る。スタイルシートの解決済み順序列は、767→768 の書き換えで 2 行の**セレクタ文字列**だけが変わり、値は全部同じ。
- **768**: js/ の 63 回 → **6 回**（`js/atlas-*.js` 5 本と `js/war-layer.js`——触れない指示の範囲。同じ 768 を書いているので今日は持ち主と一致する）。`window.matchMedia(...)` の真偽は `IntMapDevice.compact()`、MediaQueryList が要る 3 か所（mobile-ui・basemap-switch・tool-panel）は `matchMedia(IntMapDevice.COMPACT)`、`min-width:769px` の 2 か所は `WIDE`。
- **safe-area**: `:root` に `--safe-top|right|bottom|left: env(safe-area-inset-*, 0px)` を 1 回だけ宣言し、141 回 → **3 回**（`js/atlas-*.js` 3 本、理由つき）。対象の env() はすべてフォールバックが 0 か無しだったので、対応ブラウザでは値が変わらない。
- 向きの規則 1 つ（宇宙の時刻シート）は `body.im-compact.im-portrait` を読む形にした。

## 3. 挙動を変えた点

- **幅ちょうど 768 px**: スタイルシートの 6 ブロック（経路パネル 2・ナビ・写真の位置推定・プレイグラウンドのボタン・デスクトップ側の経路パネル寸法）が 767/768 から 768/769 へ。768 px では**今まで js/ と残りの `max-width:768px` ブロックが既に電話**だったので、この 6 つがそれに揃った（経路パネルは電話のシートとしての箱と挙動が一致する）。767 px 以下・769 px 以上は何も変わらない。
- **横向きの携帯（844 px）は変えていない。** デスクトップ配置のまま（#R498 がレイアウトを幅の問いのままにした——横向きで電話の配置にすると読み出しが 1 つも出なくなる、と js/app-body.js の注記。CONSTITUTION §4 の「地図のボタンを消さない」とも合う）。依頼の「既存挙動を保ったまま判定を 1 か所に」に従い、配置の変更は提案に留める。変わったのは端末が `phone-landscape` と名指されること。`tests/r668.spec.js` に同じ iPhone の縦・横で「予算は電話・配置は縦=電話／横=デスクトップ・`<body>` のクラス」を足した。
- ウィンドウの順位は「単調に増える数」から「触った順の順位」になった。相対の順は同じで、上限（サイドバーの 1 つ下）に張り付いて同順位になる経路が無くなった。

## 4. 門と検査

- `check:static` の `z-layers` 規則に 2 つ足した: **0 でないファイルは台帳の `why` に理由**、**js/ と markup が読む層の名前（`var(--z-…)`・`IntMapStack.z('…')`）は `:root` にあること**（綴りを誤った層はブラウザでは落ちず `auto` で描かれる）。
- 新しい `check:static` 規則 `ui-owners`（`scripts/ui-owners.mjs`・台帳 `tests/ui-owners-baseline.json`）: 767/768 の分裂は即失敗、js/ の境界の数値と `:root` 外の `env(safe-area-inset-*)` はファイルごとに両方向で数え、残すなら理由。
- `tests/ui-layer-owner-checks.test.mjs`（評価する形）: 小さな DOM の上で持ち主を実行する——500 枚のウィンドウでもサイドバーを越えない、入れ子の内側が上、印は一番外側（#824）、9999 のダイアログは wheel でも pointerdown でも印を付けない（#R508）、地図の外殻は印を受けない（#R255）、`clipOf` が #823 の切り取りを見つけて包含ブロックの外の祖先を無視する、768/769、4 種類の端末、#R499 の予算の場合分け、`<body>` のクラス、そして実物の木の門。
- `tests/map-a11y-structure.spec.js` ⑤ に `clipOf(#ms-results)===null`、⑦ を追加（登録したウィンドウ 2 枚を順に押し、ブラウザが `calc(var(--z-window) + n)` を帯の中の整数に解決して押した順に並べ、サイドバーを押すと両方がサイドバーの下へ戻る）。
- 旧い検査のうち**ソースの綴り**を読んでいたもの（`WIN_Z_BASE`・`_FRONT_Z`・`_NOT_PANEL`・`act()` の形・`max-width:767px`・`z-index:2200` など）は、持ち主のファイルと層の名前へ読み替えた。fake の `matchMedia` を持つ 5 つの harness は `tests/helpers/ui-device.mjs` で**本物の** js/ui-device.js をその fake に配線する。
- `tests/global-surface-baseline.json`: `window.__imFrontMostWired`（旧 `_wireFrontMost` の二重配線防止）が無くなった分を記録。`IntMapStack`/`IntMapDevice` は js/mem-budget.js と同じ `(function(G){…})(window)` の形で公開していて、面の数え上げ（`window.X=` の代入）には現れない。

## 5. 残っているもの

- `js/atlas-*.js` の z-index 7・境界 5・safe-area 3、`js/war-layer.js` の境界 1。次にそのファイルを触るときに持ち主へ移す（台帳の `why` がそう言う）。
- 4200〜6300 の帯（宇宙ビュー・フライトシム・プレイグラウンド・ワークスペースの枠・アカウント系のダイアログ）には意味の名前が無く、`calc(var(--z-toast) + n)` と書かれている。値は元のまま。モーダル（10000）より下にダイアログが並ぶ今の順序そのものを見直すかは別の判断。
- #823 の形は計測できるようになったが、切られない配置（ポータル）を持ち主が強制する機構は入れていない。

## 統合時に足したこと — 公開名の台帳が綴りで数えていた

`check:surface`（`scripts/global-surface.mjs`）は `window.X =` の綴りだけを数えていたので、この回の 2 つの持ち主（`(function (G) { G.X = … })(window か globalThis)`）も、既存の `IntMapSafe`・`IntMapMemBudget`・`IntMapWavesGL`・`IntMapStreamline`・`IntMapWavePalette`・`IntMapCosmos`・`IntMapAdminLiteral` も台帳の外にいた（計 9）。事実（グローバルオブジェクトのプロパティへの代入）を構文木に訊く: 対象が `window` / `globalThis`、またはそれを渡されて呼ばれた関数の引数（内側の同名の引数は隠す）。Worker が自分に置く `window` の模倣（`js/gis-runtime.js`）とローカルの `self` は数えない。台帳 638 → 647。

## CI で見つかった 2 つ（製品 1・宣言 1）

- **地図の読み上げ（`js/map-narrator.js`）**: キーボードで地物を巡回すると、その押下自身の click を「ポインタでの選択」として受け、1.2 秒後に要約を予約していた。押下の処理が 1.2 秒以上メインスレッドを塞ぐと、「Feature k of n」が読まれる前に要約で上書きされる（#821 以来の競合で、この回が持ち込んだものではない）。`step()` 自身の押下の間は要約を予約しない。spec は瞬間の文字列を読むのをやめ、読み上げ欄に書かれた全文を記録して `Feature \d+ of \d+: Probe point` が書かれたことを確かめる（地物名まで要求＝前より厳しい）。
- **`types/globals.d.ts`** は `IntMapSafe` を「index.html が公開」と宣言していたが、実際は `js/safe-html.js` が IIFE で公開している。公開名の門が事実で数えるようになって見えた。宣言を直した（検査が正しかった）。
