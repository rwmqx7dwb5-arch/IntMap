---
title: Atlas の評価が「線が 1 本あるか」しか見ず、町を結んだ線でも川をなぞったことになっていた——地図の形を種類と出どころで数え、答案に実形状と「描けないと言う」を問わせる
date: 2026-11-18
pr: 1215
newsen: When Atlas explains something on the map with an outline that was pieced together from web anchors, that outline is now drawn dashed and labelled approximate, like every other outline IntMap builds rather than holds.
newsjp: Atlas の地図説明で、Web 上の手がかりから組み立てた輪郭は、IntMap が作った他の輪郭と同じく破線で「近似」と表示するようにしました。
---

〈依頼〉 外部分析 3 本を統合した構造改革のうち、品質検証の続き。前段（atlas-real-shapes、PR rwmqx7dwb5-arch/IntMap#1211）で
Atlas の状態に `atlas.shapes` が出るようになったので、評価がそれで「頼まれた地物の実形状が地図にあるか」を採点できるようにする。

## 0. 測った・確かめた

- 評価器 `scripts/atlas-eval/map-state.mjs` の `drawn` は件数しか読まず、`answer-key.json` に形を問う問いは無かった。
  `shinano-river-length` は `atlas.lines ≥ 1` で合格——`map.drawLine` で町を 3 つ結んだ線も `atlas.lines` に入る（`js/atlas-cap-map.js`
  drawLine は `_hlLines` に積む）。
- 前段の `atlas.shapes` は **compose が描いた形だけ**を数えていた。「信濃川をなぞって」に Atlas が普通に使うのは `map.highlight`
  （川筋 `fetchRiverLine`）で、その線は数えられない。⇒ 評価器だけ直しても、正しい答えを落第にする。highlight 側にも出どころが要った。
- `atlas.shapes.<x>` の第 3 要素は語彙検査を素通りしていた（`atlas.shapes.aera:real` が緑）。
- Nominatim（2026-11-18）: 「Median Tectonic Line」は博物館と峠の**点**だけ／「中央構造線」0 件、「Wallace Line」は**オンタリオ州の道路** 2 本、
  「Tanakura Tectonic Line」0 件。糸魚川静岡構造線・フォッサマグナは前段の記録のとおり。
- 出典（新しい問いの値は全部、そのページで数字を確かめた）: 利根川流域 16,840 km²（国交省 利根川ダム統合管理事務所）、
  長野県 13,561.56 km²（長野県）、Texas 695,662 km²（U.S. Census Bureau）、スエズ運河 193.30 km（Suez Canal Authority）。
  メコン川は MRC の現行ページが「約 4,900 km」で 4,909 km は二次資料だけ——問いにしなかった。

## 1. 直した

- `js/atlas-shape-resolve.js`: 形の語彙 `SHAPE_KINDS`（area／line）× `SHAPE_BASES`（real／derived／**unstated**）を 1 か所に。
  `shapeBasisOf(r)` が highlight の梯子の答えの出どころを決める**唯一の規則**（矩形は unstated、近似・欠け・切り出し・Web 接地は derived）。
  compose の面の段もこれを使う——前段は `derived_anchors` を approx 無しなら real と呼んでいた（ヘッダの定義と食い違い）。
  `tallyShapes` が `{n, '<kind>:<basis>': k}` を数える。
- `js/atlas-cap-map.js`: highlight の各段が描く形に `shapeBasis`（国境・国集合＝real、梯子の輪郭＝`shapeBasisOf`、川筋・支流＝real、
  流域＝AI 輪郭なら derived）。`map.drawLine`／`drawPolygon` は付けない＝unstated。描画の properties に `sb` で載り、復元でも失わない。
- `js/atlas-console.js` `_atlasOverlayState`: `atlas.shapes` を**地図に残った全部の形**の集計に——compose の形と関係線（schematic は unstated、
  computed の海路は derived）、highlight の面と線、点灯した国（area:real）。`atlas.lines` は従来どおり（ルート・大円の問いが読む）。
- `scripts/atlas-eval/map-state.mjs`: 語彙 `shapeKeys` を製品の宣言から発見し、`atlas.shapes.<kind>:<basis>` 以外を赤に。
- `scripts/atlas-eval/grade.mjs`: 答えの種類 `declines`（返答が「形が無い・描けない」と言っているか、日英の書き方の表で読む）と分類 `shape`。
  `declines` の行は `until`（それが形の問いに変わる典拠）と、地図側の `max: 0`（代用なし）を持たないと鍵の検査が落ちる。
- `answer-key.json`: 川（信濃川・ナイル）を `line:real` に、面（琵琶湖・大阪府・東京都・ロシア・カナダ・ドイツ・スペリオル湖）を
  `area:real`（または行政界アウトライン）に強めた。足した問い: 利根川流域・長野県・Texas（面）、スエズ運河（線）、
  糸魚川静岡構造線・中央構造線・Wallace Line・Tanakura Tectonic Line（線を描かずに断る）、フォッサマグナ（面を描かずに断る）。
  Wallace Line は**名前の一致する本物の線が別の大陸にある**罠で、`line:real` も 0 を求める。
- `scripted-cassettes.mjs`: 4 本——川筋をなぞる（合格）、町を結んだ線で代用（地図で不合格）、町を結んだ断層（答え・地図とも不合格）、
  正直に断る（合格）。
- 文書: `docs/TESTING.md` の地図の軸に「物そのもの」と「形の無い物」。夜間評価の準備手順にあった問いの数の書き写しを消し、
  `--validate` を見るように（数は鍵が持つ）。`docs/FILES.md`。

## 2. 検証

- `node scripts/atlas-eval.mjs --offline`: 再生は全カセットが記録どおり（新しい 4 本の地図の判定が期待どおり）、`--validate` 緑。
- `tests/eval-shape-grading-checks.test.mjs`（新設）と、評価・Atlas 状態・compose・能力表に触れる既存の node 検査。
- ゲート: static・catalog・capabilities・atlasrepeat・types・engine・docs。

## 3. 残り

- **本番の夜間評価は secret 2 本が無く止まったまま**（`ATLAS_EVAL_REFRESH_TOKEN`・`ATLAS_EVAL_SECRET_WRITER`）。本人のログインと
  PAT 作成が要り、エージェントは代行できない（手順 `docs/TESTING.md`「The one-time setup」）。これが無い限り、上の問いは
  オフラインの台本でしか回らない。
- 断る問いの `until` は「今日の観測」。産総研の活断層 DB・地質図を典拠に足したら、構造線の問いは `line:real` の問いに書き換える。
- `atlas.lines` で合格するルート・大円の問いはそのまま（2 点を結ぶ線そのものが答えで、物の形ではない）。
