---
title: 地図上の物体を 1 つの基盤にまとめた——Atlas が描いたものの色・太さ・透明度を Atlas からも Objects からも同じ入口で変える。描画の見た目と Objects / ホバーのガラス化
date: 2026-11-26
---

発注書の指摘: 「Atlas が自分で描いた線の色を変えられなかった」。原因は個別の欠陥ではなく、物体の操作が 4 か所に分かれていたこと。

## 構造として直したこと

- **描いたものは全部、作成の瞬間から id を持つ物体**。`drawLine` は id を返さず、線は `_hlLines` にいるだけで Objects の一覧にも出なかった。いまは `window._imHlLines`（`_imHlPolys` と同じ形）が id を付け、`drawLine`・`drawPolygon`・`compose` は作成結果に `objectIds` を返す（compose は場所・形状・つながりの各 id）。
- **属性の読み書きは `IntMapObjects` の 1 本**（`js/map-tools.js`）: `list()` / `getObj(id)` は色・太さ・不透明度・面積・種類（点/線/面）・**その物体が変えられる属性（`editable`）**を返し、`set(id, {color,width,opacity,name,hidden})` が唯一の変更口。Objects パネルのスライダー・色選択と Atlas の `map.object` はどちらも同じ setter を呼ぶ。色は名前（`red`）でも `#hex` でも受け、読めなければ `invalid` として返す。変えられない属性は黙って成功にせず `unsupported` で返す。
- **登録していない描画も編集できる**: 「その他の描画」（レンダラが claim している source）には、source を読むスタイルレイヤーへ色・太さ・不透明度を当てる汎用の setter を付けた。painter ごとの個別実装を待たずに届く。
- **Atlas の入口**: `map.object` に `op: get / set`（`color`・`width`・`opacity`・`hidden`・`name`）。schema の `kind` は列挙をやめ（実在しない `nogo`/`pt` を持ち、`line`/`place`/`shape`/`link`/`poi`/`drawn` を持たなかった）。
- **状態**: `atlas-state` の `objects.items` に色・太さ・不透明度・geom・面積・`editable` を載せた（以前は id・種類・名前だけ）。
- **観測器**: `object` の観測器が id 一覧だけでなく各物体の見た目の署名（色|太さ|不透明度|hidden|名前）を前後で読む。`set` は「その id が残り、見た目が呼びの言うとおりになった」を地図から読み、同じ値への再設定は `already_there`。以前は id が変わらない操作はすべて `no_change` だった。
- **Eval**: 複数ステップで既存物体を編集する場面（線を引く → id を持ち越す → 同じ id を赤・太く・透かす）を scripted cassette `drawn-line-restyled-by-id-across-turns` と記録 `restyle-drawn-line-across-turns` に足した。ブラウザでの実測は `tests/smoke.spec.js` の atlas-objects-unify ①〜④（線・面の描画 → set → Objects パネルで同じ物体を開く）。

## 描画の見た目（`js/atlas-map-compose.js`・ハイライトの面）

- 面: 色の彩度を落とし（×0.55）、不透明度 17%（既定）。境界 1.2px・線 2.2px・つながり ≤2.4px、彩度を 0.7〜0.8 に落とした同色相。色は 1 つの値から導出するので、再着色すれば塗りも線も一緒に動く。ハイライト用ポリゴン（`nlq-poly-*`）も同じ規則（塗り 20%、境界 1.4px）。
- ラベル: 白文字＋弱い黒の影（太い白縁をやめた）。名前は `text-variable-anchor`（上・下・右・左）で互いを避ける。
- 番号マーカー: 半径 11→7.5（約 70%）、白縁 2→1.3、数字 11.5→9。数字は配置を予約する（`text-ignore-placement:false`）ので、あとから置かれる基図の都市名が番号の上に重ならない。重なるマーカーは、カメラの縮尺で 15px 以内のものを小さな螺旋上に散らす（表示だけ。記録は真の座標を保つ・`zoomend` で再計算）。
- ホバー: 対象のマーカーと、同じ項目の形状だけが明るくなる（塗り 34%・線 1.4 倍）。
- ホバーのポップアップと Objects パネルはフロストグラス（`backdrop-filter: blur(22–26px) saturate(1.7)` と薄い縁・内側のハイライト）。Objects パネルは #R124 で「不透明にする」と決めていたが、今回の発注で上書き。

## Objects パネル

フロストグラス、絞り込み（6 件以上で出る）、面の物体に面積の表示（km²／m²）・種類ごとに面積の大きい順・合計面積、すべての「その他の描画」に表示／非表示。

## 「地図上の成果物 図形 1」の表示

回答の下に出る「Atlas が描いたもの」の行のボタン。ボタンを押すとその描画の場所へ地図が動く。ラベルが「図形 1」だったので何かが伝わらなかった。呼びが名前を持たないときは、描いたものの種類（ライン・ポリゴン・マーカー・説明の図…）＋通し番号を出し、見出しは「Atlas が地図に描いたもの」にした。消さなかった（地図へ戻る入口という能力があるため）。

## 「当時の地図」（消さずに調べた結果）

`js/atlas-msg-tools.js:157` の回答の下のバー（`msgTools`）にあるボタン「当時の地図」（`Map as it was`）。その回答を書いたときのカメラ・時計・有効だったレイヤーのスナップショット（`ai.__viewSnap`、`js/atlas-console.js:2860` が `ASTATE.snapshot({only:['camera','time','activeLayers']})` で撮る）を `IntMapAnswerView.apply`（遅延ロード `atlasAnswerView`）で復元する。「その回答の地図に戻す」ボタンで、歴史とは関係がない。名前が「当時」なので歴史地図の機能に見えるが、実際は「回答を書いた時点の地図状態に戻す」。**消さない**（能力）。ボタン名を「この回答の地図に戻す」にするかは利用者の判断に任せる（名前の変更は表示の変更なので勝手にはしなかった）。

## 全数監査（UI でできて Atlas からはできない操作）

scout の静的な全数で 17 件。このラウンドで開放したのは次。

| 状態 | 項目 |
|---|---|
| 開放した | Objects パネルの色・太さ・不透明度・表示切替（全種類）、描いた線・面・マーカー・compose の図の個別 id |
| 未開放（記録） | 計測の確定（距離/面積→注記）、自由描画の Keep on map、3D 立体の保存と編集（`commit/updateObj/removeObj`）、ピンの題・説明の編集、マイマップの切替・地図ごと削除・アカウントへ保存、設定 13 項目（サイドバー形式・順位表示・ティッカー・地図の色・ドック・ラベル言語・ズーム感度・パン感度・慣性・タイムゾーン・ニュース言語/国/ソース） |

未開放はそれぞれ独立した作業で、別セッションに切り分けるのが妥当（計測・Draw・3D は物体の作成経路、設定 13 項目は `settings.*` に 1 行ずつ）。

## 検証

- `node --test` で eval 3 本・answer-sources 通過。`tests/smoke.spec.js` の ①〜④（線・面の id → set → 一覧の読み戻し → パネルのガラス/面積/色）。
- 本番での確認（線・面・点それぞれ）は deploy 後に実施し、下に追記する。

## CI で見つかった構造の変更点（同じ PR で直した）

- `check:surface`: `window._imHlLines`・`window._imHlPoi`（`_imHlPolys` と同じ「描画を物体として手渡す」形）と、`IntMapAtlasCompose.objects` の読みが増えた。物体の一覧は描画を持つモジュールが持つ手持ちの状態を読むほかなく、import すると遅延チャンクが本体側へ割れる（起動時リクエスト増・`check:perf`）。ので window の手渡しにして、`tests/global-surface-baseline.json` を更新した。
- `check:perf`: `atlas-cap-runs` 1134.4→1140.2 kB、`atlas-console` 1454.1→1463.1 kB に天井を上げた。買ったもの: 物体の属性・面積・汎用スタイル・観測器の署名・描画の見た目の導出（彩度・ホバー・マーカーの散らし）。起動時リクエストと modules は増えていない（他の行は書かれていない）。
- `tests/atlas-completion-routes-checks.test.mjs` B2b: 「合成した地図は 1 つの匿名の面として一覧にある」という旧設計の主張を、「場所・形状・つながりがそれぞれ compose の結果が報告する id で一覧にあり、編集できる」に更新した（能力は減っていない。1 つの面だったものが、個別に編集できる物体になった）。
- `check:testbudget`: 専用の spec（起動 17 秒）は全体の天井を超えるので、既存の `tests/smoke.spec.js` の起動を共有する 4 テストにした。

- `check:perf`（main 取り込み後の再測定）: `eager.brotli` 1196.4→1202.7 kB・`atlas-console` 1462.7→1471.8 kB・`dist.assets` 23028.9→23156.1 kB に天井を上げた。eager の増分は `js/map-tools.js`（物体基盤・面積・汎用スタイル・パネル）。同じビルドで他の行は超えていない（`--update` は超えた 3 行だけ書いた）。main に合流した他の変更（#1465・#1467・#1469・#1470）のぶんも同じ測定に含まれる。

## 本番での確認（2026-11-26、#1468・#1473 の公開後、本番 Pages）

`IntMapConsole.dispatch` から、線・面・点の 3 種を描き、それぞれを `object set` で変え、`IntMapObjects` と Objects パネルで読み戻した。
- 線 `line_1`: `drawLine` が id を返し、`set color=red width=6 opacity=0.5` が通り、読み戻しは `#ff0000 / 6 / 0.5`。
- 面 `poly_1`: `set color=#00aa55 width=3 opacity=0.8`。読み戻しの不透明度が 0.16（painter が持つ 0.2 倍の値）になる不具合を発見し、#1473 で修正。公開後に再測定して 0.8。
- 点（compose の場所 `unknown:FRA:パリ`）: `compose` が `objectIds` を返し、`set color=purple opacity=0.6` が通り、読み戻しは `#800080 / 0.6`。幅は持たないので `unsupported: width` と返った（成功を装わない）。
- Objects パネル: 4 行（2 場所・面・線）、`backdrop-filter: blur(26px) saturate(1.7)`、面の行に 46,684 km²、色の入力が設定値と一致。
- 未確認: マーカーの色が描画に反映された見た目（ブラウザ枠が非表示でタイルを読めず、source の中身と一覧の読み戻しで確認）。ホバーのポップアップの見た目は実機で見ていない。
