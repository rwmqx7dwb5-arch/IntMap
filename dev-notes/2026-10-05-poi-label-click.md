---
title: 施設・店舗名のラベルを押しても何も起きなかった——山や川と同じ「面を持たない名前」の一覧に入れた
date: 2026-10-05
newsen: Tapping a place, business or facility name on the map now opens its card — the name, Wikipedia and an AI brief — like peaks and rivers.
newsjp: 地図上の施設・店舗名を押すと、山や川と同じように名前・Wikipedia・AI 解説のカードが開くようになりました。
---

〈依頼〉「地点・施設ラベルをクリックしても無反応なのは不親切では？」（「Places, businesses & facilities」レイヤーのこと）

## 0. 読んだ
`ofm-poi`（名前）と `ofm-poi-dot`（点）は、`js/map-ui.js` のラベルの一覧（`PLACE_LBL` / `ALL_LBL`）にも、層ごとのクリック登録にも、カーソル登録にも、余白付きタップの問い合わせにも入っていなかった。押しても背景のクリックに落ちるだけ。

## 1. 直したもの
- 面を持たない名前（海・水域・川・山）の一覧を `GEO_LBL` 1 つにし、施設の 2 層をそこへ足した。以前この一覧は 3 か所に書き写されていて（`ALL_LBL` の連結・層ごとの登録・余白タップの正規表現）、正規表現のほうは `ofm-water2` を落としていた——一覧が 1 つなら 4 か所目は生まれない。
- 開くのは山・川と同じ `onGeoLabel` のポップアップ（両方の文字の見出し・コピー・Wikipedia・AI 解説、Isolate／Move なし）。

## 2. 検査
- `tests/r201-checks.test.mjs` ②a: 余白タップが `GEO_LBL` を読み、県名はそこに入っていない。
- `tests/history-click-ownership-checks.test.mjs`: 宣言の取り出しに `GEO_LBL` を足した（クリックの裁定の評価はそのまま緑）。
- `tests/shell-map-labels-checks.test.mjs` の R707 8 件は変更前の main でも同じく落ちる（この変更と無関係）。
