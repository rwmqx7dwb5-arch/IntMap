---
title: 地図の 1 フレームの描画負荷を測り直し、レイヤーの統合・除外は効果が誤差内と確認した（変更は残さない）
date: 2026-11-24
---

〈依頼〉パン・ズームを Google Earth 並みに。dev-notes/2026-11-20-pan-smoothness.md が残した「18 の line・13 の circle・16 の symbol を
統合・除外して 1 フレームの描画命令を減らす」を、見た目を変えずにできるか測った。**結論: 残すべき変更は無い。コードは触っていない。**

## 1. 現状（衛星＋globe の既定表示、desktop、`--cpu 4`、3 反復、機械 29〜60% 使用中）

wheel p50 16.7〜33 ms、drag 33〜83 ms。同じ build を ABAB で 2 回ずつ流しても arm 間の差より同じ arm の run 間の差が大きい
（機械の混み具合が支配）。MapLibre の `renderer:paint` は wheel で約 490〜580 ms／約 60 フレーム。

## 2. 可視レイヤーの実体（z 1.7・61 レイヤー中 style 上の可視 41）

- 「可視 53」は **style 上 `visibility != none` の数**で、描くものがあるとは限らない。geojson 源が空の 30 層
  （grid-*・tool-*・community-*・news-*・dash-*・user-pin-*・place-hl-*）は特徴 0 件で bucket が作られず draw は 0。
- WebGL の draw を層ごとに外して差を取った（`gl.draw*` を数え、層を 1 枚ずつ非表示）。1 フレーム 209 draw のうち
  層に帰せられたのは約 106: ref-admin1 28・layer-world-base 24・im-night-shade 14・grid-lines-casing 12・
  ofm-country 6・layer-world-cap 6・place-hl-fill 4 ほか（borders-only 3+3、geo-sea 2、night-lights 1）。
  残り約 100 は層でない描画（globe の大気・空・stencil 等）。
- draw は「層 × 可視タイル」で増える。タイルが同じ源の層でも paint（casing と本線の幅・色）が違う組は
  1 層にできない（できても draw 数は同じで、見た目が変わる）。同一 paint・同一 filter の組は style に無かった。

## 3. 上限実験（統合・除外が効きうる最大値）

空の 30 層を `removeLayer` で全部外した build と外さない build を `--dist` 同一・`--setup` で ABAB（各 3 反復、wheel / drag）:

| arm | wheel p50 | wheel paint ms | drag p50 | drag paint ms |
|---|---|---|---|---|
| A（そのまま） | 33.4 / 33.4 | 540 / 582 | 83 / 67 | 468 / 587 |
| B（空 30 層を除去） | 33.3 / 33.4 | 558 / 546 | 50 / 33 | 463 / 454 |

wheel は同一。drag は B がやや良く見えるが、同条件の A 内でも 33〜83 ms まで散る（machine 79% busy）ので
**誤差の範囲**。層 loop の固定費は測れる大きさに無い。よって空層の統合・除外は実装しない
（呼び出し元・Atlas の能力・描画に影響するリスクだけが残る）。

## 4. 残り（Google Earth 並みには未達）

- 描画の本体は **ofm のベクタタイル（ref-admin1 の破線を含む）と世界下地ラスタ**のタイル別 draw と、globe の層でない描画。
  ref-admin1 は z<3 で opacity 0.3 の破線が 28 draw。見た目を変えずに減らすなら draw ごとの設計変更（破線の事前焼き込み、
  z<3 のタイルを 1 枚に畳むなど）で、レイヤーの統合では届かない。次の仕事。
- 動作中の衛星の blank/blurry（drag で `satellite:blank` 約 120 タイル・フレーム）は、MapLibre が親タイルを出しているのに
  worker の衛星タイルが間に合わない分。先読み（PR #1383 の DEM とは別の、衛星タイルの先読み）が次の候補で、今回は触っていない。
- 計測器: `scratch/` の層別 draw 数えは使い捨て。恒常化するなら `map-motion` に `--draws-by-layer` として足す。
