---
title: 歴史地図の国境線・地方区分線の描き方を現在の地図と同じにした——縁取りの欠落・淡色基図での塗り替え・共有辺の重ね描き
date: 2026-10-06
newsen: Past-year borders and province lines now look exactly like today's — same dark edging, same colour on the light map, and shared boundaries are drawn once instead of twice.
newsjp: 過去の年の国境線・地方区分線の見た目を現在の地図と同じにしました（同じ縁取り・淡色地図でも同じ色・隣り合う境界を二重に描かない）。
---

〈依頼〉「歴史地図は、現在の地図の国境や地方区分境界線と、ちょっと違う。見た目を同じにしろ」「地方区分線も違う」。
線の形（ジオメトリ）は別セッションの担当なので触らず、描線だけを扱った。

## 0. 測った（本番、同じ場所・同じ倍率で Now と過去を撮り比べ）

- 国境: 現在の `borders-only-line` には暗い縁 `borders-only-casing` があり、`imtb-line` には無かった。
  `imtb-line` だけ `line-cap: round`。淡色の基図では #R705 の `colorFor` が `imtb-line` を `#59636e` に塗り替えていた
  （現在の線は淡色の CARTO の上でも `#d9dbe0`＋暗い縁）。
- 地方区分: paint の値は全部同じなのに、ルーマニア中部 2015 年 z7.6 で線が太く・白っぽく・破線が長く見えた。
  画面内の `imta-gap-line` の線分 1,057 本のうち 234 本が 2 回、75 本が 3 回、2 本が 4 回描かれていた。
  束の線は多角形の環から切り出すので、隣り合う単位が共有する辺を両方が描く。半透明（0.82）の破線が
  ずれて重なると不透明度が上がり、破線が噛み合って長く見える。現在の線は線レイヤーなので 1 回。
- 国境も同じ構造: 1950-07-01 の CShapes の国境 run 52,322 辺のうち 24,728 辺（47 %）が隣国の 2 本目。

## 1. 直した

- `js/border-style.js` に「国境という線」の layout / paint / 縁の paint を置き（`BORDER_LAYOUT` / `BORDER_PAINT` /
  `BORDER_CASING_PAINT`）、現在の国境・海岸線・時代の国境の 3 か所がそれを読む。`imtb-casing` を足し、
  `colorFor` と `js/historical-basemap.js` の塗り替えを外した。精度の破線は残す（利用者の判断）。
- `js/border-coast.js` に `strokedOnce`（無向の線分を 1 回だけ残し、落とした所で線を切る）。`imtb-ln-src` と
  地方区分の束の線（`linesFor` / `gapLinesFor`）はこれを通して渡す。1950 年の世界で 8–26 ms。
- 時代の国境の層一覧を `IntMapTimeBorders.layerIds` 1 つにし、`_applyBorders` と `clear()` の手書きの写しをやめた。

## 2. 残っているもの（今回の範囲外）

- 線の通り道の細かさ（CShapes・束の線は粗く、拡大で細かくならない）——形の作業として別セッション。
- 基図そのもの（現在は CARTO、過去は地形の基図）。地方区分の段（第 2・3 段は歴史だけ）は利用者の判断で据え置き。

## 3. 検査

`tests/hist-border-same-look-checks.test.mjs`（`strokedOnce` を出荷データで、両モジュールの配線）と
`tests/history-era-display-checks.test.mjs`（今日の線を出荷コードから描き、時代の線と縁が layout / paint で一致すること。
`border-style.js` 無しの代替値も）。どちらも変更前のコードで落ちることを確かめた。

## 4. CI の赤 3 件

- `check:perf`: 最初の CI で `eager.raw` 4758.6 kB（当時の天井 4734.5・幅 23.7）が赤。変更を外した main が同じ木で
  4757.3 kB で、main がすでに幅の内側ぎりぎりにいたところへ、この変更の main チャンク +1,298 バイトが乗った。いったん天井を
  上げたが、その後 main 側が天井を実測へ上げたので、rebase で main の天井を取り、この PR では天井を変えていない
  （rebase 後の実測は main の天井に対して +1.2 kB で幅の内側）。
- `check:histrecon`: dataverse.nl（RISTAT）が 504・無応答。分岐元の main では `--check` が毎回上流をダウンロードしていたが、
  その後の main（#1021）で保存済みの目録（`scripts/histrecon/atoms/catalogue-lock.json`）を読む形になっていたので、rebase で解消。
- `check:surface` も赤: `_applyBorders` が `window.IntMapTimeBorders` を 2 回多く読んでいた。1 つの局所変数に
まとめ、読み取りは 29 → 27（`window.IntMapBorderStyle` も 6 → 4）に減った。台帳は縮める向きにだけ書き換えた。
