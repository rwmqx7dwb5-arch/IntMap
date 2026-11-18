---
title: Atlas の地図説明が「地名の点を線で結ぶ」しか持たず、面や線である地物（地質帯・断層・川・流域）を模式図で完了扱いにしていた——項目に実形状を持たせ、取れなければ代用せず未完と報告する
date: 2026-11-18
pr: 1211
newsen: When Atlas maps a region or a line itself — a basin, a river, a geological zone, a fault — it now draws the thing's real outline with its source (approximate ones dashed and labelled), and says plainly when no real shape exists instead of joining nearby places with lines.
newsjp: Atlas が流域・川・地質帯・断層のような「面や線そのもの」を地図にするとき、実際の形を出典つきで描くように（近似は破線で明示）。実形状が無いときは近くの地名を線で結んで代用せず、描けなかったと伝えます。
---

〈依頼〉 外部の分析 3 本（AI の進化を生かす基盤／Atlas が既存機能を使い切れない／「フォッサマグナをマッピングして」が模式図で完了した件）を統合した構造改革を先導せよ。これはその第一歩。

## 0. 測った・確かめた

- `map.compose` の出力は**点と関係線だけ**だった（`features()` は Point と relation の LineString のみ）。面は `fill` で highlight に投げるが形は compose の外、線の実形状を受ける口は無い。
  実形状を取る仕組み（highlight の梯子＝admin-1 索引・合成・Nominatim ポリゴン＋名前一致・Web 接地の領域解決、川筋 `fetchRiverLine`）は既にあり、
  `atlas-map-compose.js` からの参照は **0 件**だった。
- 完了判定（`mapCompose` 観測器）と評価（`scripts/atlas-eval/map-state.mjs`）は**本数**しか見ていない——近くの町を線で結べば `completed`。
- Nominatim（2026-11-18）: 「糸魚川静岡構造線」0 件、「Itoigawa-Shizuoka Tectonic Line」は**案内板の点** 1 件、「フォッサマグナ」0 件、
  「Fossa Magna」は**ロンバルディアの用水路 3 本**（waterway/canal、LineString）。名前は一致するが別の大陸。
- 分析文の主張は scout で検証済み（Atlas 能力 244・夜間評価は secret 不在で 30 回停止・語彙到達 74 問中 4 問・`maxSteps` 8／600 秒・
  `byRef` はページ内メモリ・map.compose 24/24）。「GIS の既知の限界」節は無く `docs/GIS-CORE.md` に散在。

## 1. 直した

- `js/atlas-shape-resolve.js`（新設・純関数）: 名前と「見せたいもの」（`area`／`line`）から、上流が持つ形を `basis:'real'`、IntMap が作った形
  （欠けた合成・Web 接地の近似・方角切り出し・モデルの輪郭）を `basis:'derived'`＋`method` で返す。**矩形・種類違い・同名多数・名指した国の外**は
  形として返さない（`only_extent`／`kind_mismatch`／`ambiguous`／`elsewhere`）。網は全部注入。
- `js/atlas-map-compose.js`: 項目に `shape`。取れた形は compose の source に入り（実線＝real・破線＝derived・面は薄塗り）、凡例に出典か「近似」。
  取れなければ `shapesUnresolved` に理由つきで報告し、**点や関係線で代用しない**（モデルへの `shapeNote` もそう言う）。結果は `partial`。
  形だけが答えの名前は、その形の中心に番号を置く（`resolved_place_centroid`）。形を頼まない地図の `counts` は従来どおり。
- `js/atlas-capabilities.js` の `mapCompose` 観測器: 形が足りなければ `partial`／`shape_unresolved`、`unresolved` に名前。
- 能力の文（`atlas-cap-map.js`）と中核ツール `compose_map` の説明: 「物そのものが面や線なら `shape` を。関係線は場所の間のつながりで、1 つの物の輪郭ではない」。
- 状態 `atlas.shapes`（`area:real` などの内訳）を評価器が読める状態に出す——「線が 1 本ある」でなく「実形状の面がある」を問える。

## 2. 次の手（この先導の続き）

1. **専門データの典拠**: 断層・地質帯は OSM に無い。産総研 地質図 Navi／シームレス地質図 v2 の API と活断層 DB を典拠に足す
   （利用規約・帰属・商用可否の確認と出典ページの更新が要る——データソース変更の作法どおり、着手前に確認する）。
2. **評価の正常化**: 夜間評価の secret 2 本は人の操作が要る（本番ログインからの refresh token と fine-grained PAT）。設定手順は `docs/TESTING.md`。
   併せて answer-key に「面・線そのもの」の問い（流域・川・地質帯・海路）を足し、`atlas.shapes` で採点する。
3. ~~航路の既定~~ → **利用者の決定（2026-11-18「海路計算を既定に」）で、`type:"route"` の既定を `computed` にした。** 海上の経路が無い区間は
   `sea_path_failed` で描かず弧で代用しない。`flow` など他の型と、明示した `basis:"schematic"` は従来どおり大円の弧。

## 3. 起動費用

遅延チャンク `atlas-console` が 1008.6 → 1017.7 kB（+9.1 kB）。形の描画・凡例・解決器と、モデルへの説明文の分で、この機能の実体。
Atlas を開いたときだけ読まれ、起動時の費用は変わらない。天井を上げた。

## 4. 実画面

ビルドしたアプリで `IntMapConsole.dispatch({type:'compose'})`: 信濃川（line）は OSM の川筋 MultiLineString で real、長野県（area）は admin-1 索引の
Polygon で real、糸魚川静岡構造線は `not_found`、Fossa Magna（line・Japan）は `elsewhere`（ITA）で描かれず、結果は `partial`。凡例に出典と
「Shapes not drawn」。関係線は 1 本も引かれていない。

## 5. 検査

`tests/atlas-real-shapes-checks.test.mjs`（解決器を台本の梯子で・compose を偽エンジンで評価。用水路の誤答を `elsewhere` で拒むことを含む）。
compose・Atlas を触る既存 102 本（1,415 件）を走らせ、`atlas-one-declaration` ④ の写真（合成の on/off が切り替える層）に新しい 3 層を
「写真＋追加分」の形で足した（写真そのものは書き換えない——radiation と同じ扱い）。
