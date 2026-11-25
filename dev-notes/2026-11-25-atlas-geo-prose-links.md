---
title: Atlas の回答文と地図上の地理オブジェクトを双方向に連動させる——参照を 1 種類にし、クリックでカメラと一時強調、名前ラベルを最優先に、説明を配置時に持つ
date: 2026-11-25
---

〈依頼〉回答に関係する地理オブジェクト（都市・駅・トンネル・河川・国境・行政区域）は、地図に置いたかどうかに関わらず回答文でクリックでき、
カメラが動いて一時的に強調される。経路の始点・終点の表からも動く。過去の回答からも動く。Atlas が置いた名前ラベルは背景地名に負けない。
Atlas 配置地点はホバー／タップで簡易説明を出す（配置時に Atlas が構造化データとして付与、ホバーごとに AI は呼ばない）。

## 実測した原因

1. `linkProse()` が読むのは `map.compose` が配置した記録だけだった（最初の出現のみ）。Atlas が解決しても配置しなかった対象は、台帳（`atlas-geo-ledger`）にあっても回答文には現れなかった。
2. 地点表の経路行（`atl-cmp-rel`）の始点・終点の番号バッジに `data-geo` が無く、`relPub` は端点の id を持たなかった。
3. クリックは現在の描画レコード（`records`）を引いていた。`clear()` の後や別の compose の後では、過去の回答の参照が座標を失った。
4. **名前ラベルが消える真因は `text-optional` ではなかった。** MapLibre は積み順の上のレイヤーから先に衝突を解く。プレビューで実測すると、
   `atl-compose-t` は index 37、その上に basemap の symbol 層が 11 本（`ofm-city`・`ofm-country`・`ofm-water`・`ofm-river`…）あり、
   basemap の「Paris」が Atlas 自身の「Gare du Nord」より先に置かれていた（Atlas の層は style 読み込み時の位置に固定され、後から入った basemap の label が上に乗る）。

## 変えたこと

- **`js/atlas-geo-refs.js`（新）**: 地理オブジェクトへの参照を 1 種類（`ref`）にした。出所は ① compose が置いた記録 ② 描いた形（bbox）
  ③ その回答のターンに台帳が解決した場所。名前の一覧は持たない（解決された事実から導く）。台帳の識別子は回答文の語ではないので綴りから除く。
  `view()` は「点は中心へ（ズームアウトはしない）、広がりのある対象は全体が収まる枠へ」を返す。
- **`linkProse`**: 番号の無い参照は番号バッジ無しでリンクにする。台帳が解決していない地名はリンクにしない（無関係な地名を全部リンクにしない）。
- **クリック**（`reveal`）: カメラを動かし、専用 source `atl-geo-flash-src` に一時強調（点は輪、線・面は形、形が無ければ bbox の枠）を 2.6 秒だけ出して消す。
  マーカーは増えない。広がりのある対象で形が手元に無ければ、`shape` と同じ resolver で実形状を取り、全体を収める。参照は**バブルが持つ**（`el.__atlGeoRefs`）ので、過去の回答でも動く。
- **経路の表**: 端点のバッジに `data-geo`（`relPub` に `fromId`/`toId`）。
- **ラベル**: `liftLabels()` が style 変更ごとに名前レイヤーを他のすべての label の上へ戻す。`text-optional` は外した。Atlas 同士の衝突は従来どおり（allow-overlap を付けない）。
- **ホバー／タップの説明**: 配置時に Atlas が書く `note`（無ければ `role`）を `meta.compose.placed[].note` に持たせ、マーカーのホバー（タップは 4.5 秒保持）で名前と一緒に出す。
  マーカークリックで回答文の該当箇所へスクロールする既存の動きと共存。`map.compose` の schema 説明に `note` を追記。
- 台帳に `turn()` を追加（回答がどのターンのものかをバブルに刻むため）。`atlas-console.js` は同じ行数のまま `recordsFor(keep)` → `refsFor(keep,ai)`。

## 検査

`tests/atlas-geo-prose-links-checks.test.mjs`（refs の出所・過去の回答・view・linkProse・凡例の端点・クリックが過去の回答から動き marker を増やさない・ラベルが上に戻る）。

## 費用

`atlas-console` チャンクは 1399.9 → 約 1408 kB（+約 8 kB・compose の参照/一時強調/説明/ラベル持ち上げ。新モジュール `atlas-geo-refs.js` も同じチャンクへ）。
利用者が得るもの（回答文からの移動・強調・説明・ラベルの優先）の対価として ceiling を上げる（`perf-budget.mjs --update`）。
