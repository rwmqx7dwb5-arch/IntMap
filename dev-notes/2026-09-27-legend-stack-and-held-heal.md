---
title: 新しい利用者の既定の画面で凡例 2 枚が重なっていた／起動時に預かったレイヤーを自己修復が消していた／地名検索が同じ京都を 3 行並べていた——どれも本番の健康診断で見つけた
date: 2026-09-27
---

〈依頼〉「IntMap, 様々な側面から監査し、すべてやりきって。全部任せる。」の本番検証（`2026-09-27-audit-sweep-0927`
の続き）で見つけた製品の不具合 3 件。

## 0. 測った（本番）

- **凡例の重なり**: 新しいプロファイルで開くだけで、既定のケッペンと海底ケーブルが重なる。1440×900 で
  ケッペン y74〜559・ケーブル y546〜737（13px）、1280×720 ではケーブルがケッペンの下半分に乗る。
  `tileLegends()` は画面に出ている凡例を `el.style.display==='block'` で数えていて、デスクトップの
  ケッペン凡例は `flex` で出るので数から漏れ、他の凡例がケッペンを知らずに積まれていた。
- **保留中のレイヤーが消える**: `#l=dl-planes,dl-radar` を描けない状態で開いて解放すると、2 回中 1 回
  radar のチェックが外れたまま戻らなかった。原因は 2 つ重なっていた——① #R109 の post-toggle heal が、
  描けないので保留中の箱を「描かれていない＝失敗」と判定して OFF→420ms→ON と揺すった（観測できない
  ことを失敗と扱った：`.agents/rules/one-pass-or-a-reason.md` §5）② 保留を配り直す `change` が合成の印を
  持たず、heal 自身の OFF が利用者の操作として記録され、rearm の後半が「利用者が触った」と判断して止まった。
- **地名検索「Kyoto」の 3 行**: 想定（3 つのジオコーダが同じ京都）とは違い、京都市 1 行＋京都駅 2 行だった。
  重複除去の鍵が `label|lng.toFixed(2)|lat.toFixed(2)` で、90 m 以内の駅ノード 3 つが 0.01° の格子の
  境目をまたいで 2 升に分かれ、ラベルが 1 語違うだけの Open-Meteo の京都市（1.6 km 先）も束ねなかった。

## 1. 直したもの

1. `js/data-layers.js` `tileLegends()`: 表示の判定を綴り（`block`）から事実（`hidden`・インラインの
   `none`・計算済みの `display`）へ。自分の置き場を持つ凡例は `data-own-place` で**自分で宣言**し（今は
   ケッペンだけ・名前の一覧は持たない）、デスクトップではその実測の枠を障害物として積み上げが避ける。
   携帯は従来どおり全部を同じ積み上げに入れる。開閉の記憶は持ち主が隠したときだけ忘れる。
2. `js/data-layers.js` の heal は `observable()`（描ける・保留に入っていない）が偽なら判定しない。
   `js/layer-rows.js` の配り直しは**最後に預かった変更**の出どころを持つ（最初の「1 つでも利用者の
   変更があれば利用者」はブラウザで 2 回中 2 回まだ OFF だった——否定された見立て）。
3. `js/search-geocode.js`: `addItem` が「同じ地物か」を判定する——同じ OSM オブジェクト（Photon に
   `osm_type`/`osm_id` を持たせた）か、種別（`placeClass`）・名前（`nkey`）・場所（範囲の内側、または
   その種別へ飛ぶズームで `FRAME_PAD_PX`＝64px 以内。`gotoPlace` の余白と同じ定数を両方が読む）が全部一致。
   情報の多い行を残し、表示済みの行はその場で書き換えるので、答えの到着順によらず同じカードになる。
4. 試験予算: 新しい spec（1 起動・実測 7.3〜11.9 s）を `tests/durations.json` に 9 s で登録し、
   `TOTAL_BUDGET_S` をその分だけ上げた（過去の回と同じ形、理由は定数の註）。deep 115 本・計測 121 本。

## 2. 直さなかったもの

- 市と駅が同じ表示文字列（`Kyoto, Kyoto Prefecture, Japan`）で 2 行並ぶ。別の物なので束ねるのは誤りで、
  区別するには行に種別を出す画面の変更が要る——最終報告で提案する。
- `_minimizeOpenLegends`（携帯）は `block`/`flex` の綴りで判定したまま（挙動は正しい。既存の r742 検査が
  関数を単独で切り出すため共通化できなかった）。

## 3. 検査

`tests/legend-stack-and-held-heal-checks.test.mjs`（出荷している `tileLegends`・`holdUntilDrawable` を評価。
修正前 5 件赤）、`tests/legend-stack-and-held-heal.spec.js`（保留中の競合と 1440×900 の非重なり。3 回繰り返し緑）、
`tests/search-result-dedupe-checks.test.mjs`（実際の 3 提供元の応答で `doGeocode` を動かし、到着順 3 通り。
修正前 6/9 赤）。関連 node 224 件・Playwright 23 件・`check:static`・`check:engine`・`check:types`・
`check:docs`・`check:i18n`・`check:testbudget` 緑。
