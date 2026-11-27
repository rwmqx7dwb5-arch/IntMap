---
title: 国名の消える閾値・地名ポップアップ 2×2・操作感度の基準値の付け替え・Isolate の国境線
date: 2026-11-27
newsen: Country names go as soon as the view is no wider than the country, place popups use a 2x2 button grid, the navigation sensitivity sliders now read 100% at the tuned default, and Isolate redraws the map's own border above its mask.
newsjp: 国名は国より狭い範囲へズームすると消え、地名ポップアップのボタンは 2 行 2 列に。操作感度は調整済みの値が 100%（既定）になり、Isolate は地図の国境線をマスクの上に引き直します。
---

〈依頼〉 発注書のうち 4 項目。個別の国・地名の一覧は持たず、規則で効かせる。

## 1. 国名の消える閾値
`NAME_GONE_SHARE` 2 → 1（`js/country-extent.js`）。国の長辺が表示範囲に達したら国名を filter から外す（機構は 11-26 の `fitCountryNames` のまま）。2 のときは国の半分が見えていても名前が残った。設計値で観測値ではなく、国名は 1 件も列挙しない。admin1 は従来どおり rank の階段と maxzoom 9 で消え、都市名は拡大しても有用なので残す（領域を持たない点なので「領域の大きさ」で測れない）。

## 2. 地名ポップアップ
`.plc-acts` を flex（モバイルは縦積み）から 2 列の grid に（`css/intmap.css`）。非表示の Wikipedia ボタンは格子に入らず、4 つ出れば 2×2、3 つなら 2+1。

## 3. 操作感度
スライダーの 100% を、これまでの実効値 170/170/110 にした。`NAV_BASE`（`js/wheel-zoom.js`）が唯一の換算で、`imNav*` はスライダー値（1＝既定）のまま。ピンチ・ダブルクリックズームも同じ基準を掛ける。
移行: 保存設定に `navVer:2` を持たせた。旧い保存値のうち 1（＝旧既定。触っていない人が保存していた値）は新しい既定の 1 に従い、それ以外は意図して変えた値なので旧実効値を保つ（値 ÷ 基準、5% 刻み）。
旧 100% を保存していた人は、挙動が従来より速くなる（これが「元の値を既定に」の帰結）。

## 4. Isolate の輪郭と国境線
前回（11-26）は穴の形を 10m に揃えた。残る差は穴の元（Natural Earth）と画面の国境線（ofm の `boundary`）が別の測量であること。穴の縁そのものは ofm にできない（ofm に国の面は無い）ので、縁の上に ofm の国境線（その国の `adm0_l`/`adm0_r`、z5 以上）を引き直す。z5 未満は ofm に線が無いので多角形の縁で代える。国コードの読みは Outline と共通の `ofmCountryCodes`。

## 検査
`tests/map-labels-sensitivity-outline-checks.test.mjs`。ピンチの既存検査（`layer-pointer-performance-checks`）は基準 1.7 を掛けた期待値に更新。
