---
title: 同梱データの残りを表として宣言する——キー付きの記録・「当選した候補」の指し方・表の一覧の数え上げ。geo.regionStat を子 AI の対象に。固定の組み合わせと重複入口は測って残した
date: 2026-11-26
newsen: Atlas can now ask 15 more shipped tables as data — airports, sanctions, border crossings, World Heritage, U.S. elections, embassies, nuclear plants, small bodies and more.
newsjp: 空港・制裁・国境の検問所・世界遺産・米大統領選・大使館・原子力発電所・小天体など、同梱データ 15 表を Atlas が表として問い合わせられるようになりました。
---

〈依頼〉2026-11-25 の記録（generic-capabilities §3「残っていること」・worker-reach「残したこと」）を片づける: ① まだ `rowTables` を宣言していない同梱データを
数え上げて宣言 ② 問いの形の固定の組み合わせが汎用の道で同じだけ働くか確かめ、働くなら外す ③ 重複した入口を同じ物差しで統合 ④ `geo.regionStat` を子の対象に。

## 1. 表の宣言（数え上げと宣言）

- **数え上げは `node scripts/data-tables.mjs --undeclared`**: `data/` を歩き、行の形（オブジェクトの配列・コードをキーにした記録）を持つのに宣言の無い
  束を出す。手で並べない。測定（2026-11-26）: 884 ファイルに 2,114 の行状の集まり。その大半は企業 profile（`data/companies/profiles/*.json` 約 500 本、
  1 社 1 ファイル）・選挙の結果ファイル（`data/elections/` 217 本、1 回の選挙 1 ファイル）・交通フィード（`data/transit-*`）で、1 つの表ではなく
  「ファイルの家族」。家族を 1 つの表にする仕組み（行を複数ファイルから集める宣言）は作っていない——必要になった問いが出たときの仕事。
- **宣言した束（14 + 1）**: 空港（国別）・制裁（機関 × 対象国）・国境の検問所・世界遺産・米大統領選・大使館／領事館・宇宙施設（発射台・地上局ほか）・
  原子力発電所・小惑星と彗星の軌道要素・深宇宙天体・保健システム能力と予防接種率・国の基本事実・名称が変わった都市・古代の地点（Pleiades）・
  「この日の歴史」の厳選された出来事。合計 **21 表**（既存 6 + 新 15）。declaration の正本は `scripts/lib/row-tables.mjs`、各 builder は書き出すときに
  `withRowTables(name, out)` を通す（再生成しても宣言が消えない）。`scripts/build-on-this-day.mjs --check` が宣言入りの束を再生成して一致した。
- **仕組みに足した 2 つ**（宣言が多くの束で書けるようにするため。どちらも「その束のため」ではない）:
  - 行の入れ物が**コードをキーにした記録**でもよい（`rows:'countries'`、`$key` がキー）。空港・保健・国の基本事実がこれ。
  - 経路の 1 区間 `[field]` が**その行自身の別の欄の値**を指す。米大統領選は当選した候補の位置を `w` で持ち、先頭の候補が当選者とは限らない
    （1824 年はジャクソンが選挙人数で先頭だが、下院が選んだのはアダムズ）——`c.[w].n` が当選者。先頭を当選者と呼ぶ列は作らず、両方を別の列にした。
  - `via.field` を省くと索引が指す要素そのもの（世界遺産の国は文字列の配列）。
- **宣言しなかったもの**（理由つき）: `hdi-series`・`maddison`（年ごとの配列を持つ記録で、1 行 1 年の表にするには行の形を変える必要があり、
  ここでは束の形を変えない）／`moons`・`planet-names`（惑星ごとの配列）／`wars`・`polity-arcs`・`weekly-earth`（行の中に入れ子の配列があり、
  列にできるのは数え上げだけ）／`companies/index.json`（`check:companies` が形を固定している）／`volcanoes_gvp`（`volcanoes` が組み込みの表として既にある）。
  世界遺産の座標は `points` が平坦な配列で行と別に並ぶため列にしなかった（NEAR は使えない旨を表が自分で述べる）。
- **検査**: `tests/generic-capabilities-2-checks.test.mjs`（6）。宣言と索引の一致、builder が宣言を保つこと、コードをキーにした表、`[w]`、
  制裁・世界遺産・検問所の問い合わせ、2 つの束の結合（港から 20 km 以内の稼働中の原発）。

## 2. 固定の組み合わせ — 測って、外さなかった

物差し: 「消したあと、何が同じだけ働くか」（`.agents/rules/substance-over-form.md`）。

- **`research.impact`（地震 × 原発 × 都市）— 残す。** データの部分は `data.query` で同じに問える（地震 `earthquakes` と施設 `facilities` と都市 `cities` の
  NEAR、同梱の原発は今回 `nuclear-power-plants` として表になった）。残る差は 4 つで、どれも汎用の道に無い: ① 半径の円を描いて視野を合わせる
  ② 読み込み済みのニュースをその範囲で添える ③ 国の人口密度 ④ 世界オブジェクトの結びつき（`within_impact_of`）を作り、`research.scenario` が
  その結果（`exposure`）を 4 つの欄に使う（`atlas-reasoning`）。外すと scenario の「影響」欄が空になる。つまり「同じだけ働く」と言えないので外さない。
  次にやるなら: 円・視野・ニュース・密度を `data.query` の結果から Atlas が自分で組み立てられるか（`map.radius` + `news` + `research.related`）を測る。
- **`on-this-day.json` / `polity-arcs.json` / `weekly-earth.json` — 残す。** 3 つとも問いの形の**索引**ではなく、元の記録を再現できない（`weekly-earth` は
  USGS・EONET の週ごとの保管で、後から同じ週を引き直せない）／元の記録を読むための索引（`polity-arcs` は 4,449 本の弧と範囲、`on-this-day` は日ごとの
  国境変化）で、検索カード・年の書・生成ページ・`time.*` の 4 つの読み手が読む。外す先の「同じだけ働く道」が無い。
  代わりに **`on-this-day` の厳選された出来事 101 件の表（`dated-world-events`）を宣言**し、日付・種類・場所で問えるようにした
  （索引としての使い方は変えていない）。
- **`map.clearHighlights` / `map.clearAll` / `map.clear` — 統合しなかった。** 3 つは同じ入口の別名ではない: `reset`（ハイライトと濃淡だけ。ピンは残す。確認なし）・
  `clearAll`（**確認を要する**全消去。`explicit`。分離・計測・ルート・拡散まで消す）・`clear{what}`（名指した 1 種類だけ。確認なし）。確認の有無が違うので
  1 つに畳むと「全部消す」が確認なしで走るか、「ハイライトを消す」が確認を要するかのどちらかになる。さらに観測器の判定の書き込み先
  （`map.highlight,map.compose` と `map.all`）が違い、`atlas-console` が `type==='reset'` で作業記憶（scoreComponents）を捨て、サーバ側
  （`supabase/functions/_shared/atlas-cap-classes.js`）が名前で分類している。畳むなら先にこの 3 点を 1 つの規則へ移す必要があり、
  それを移した後でも「ハイライトだけ」と「全部」は別の意図なので、入口は 2 つ残る。今回は能力を減らさず、モデルが同じ空の地図に 3 つを順に
  呼んで手数を使う件（`already_clear` で済む）は既存の応答で足りている。
- **`time.compare` / `time.thenNow` — 統合しなかった。** `compare` は比較ウィンドウに**別の時点の地図**を開く（2 枚の地図）、`thenNow` は**1 つの場所の 2 つの時点**を
  1 枚の地図の中の分割線で見せる（js/compare.js の別の関数）。見せるものが違う。`atlas-skills-data` は両方を使う手順（「両方見せて」）を持つ。

## 3. `geo.regionStat`（worker-reach の残し事）

行は描画する（`draw:true` で境界レイヤを登録して塗る）のに書き込み先を名乗っておらず、`session && 書き込みなし` として「読者に見えるもの」と判定され
子に拒まれていた。行に `gis.dataset,map.object` を書き、`policy.headless` を宣言し、子（`source:'atlas-worker'`）の run は `draw` を無視して数値の表だけを返す
（描くのは親だけ。`data.query` / `model.run` と同じ形）。子の読み取り能力は 62 → 63 件。検査: `tests/worker-reach-lane-checks.test.mjs` ⑧。

## 4. 残したこと

- 企業 profile・選挙・交通のように、1 つの束が複数ファイルに分かれる家族を 1 つの表にする宣言は作っていない。
- 世界遺産・`hdi-series` の座標／年の列の表現。
- `research.impact` の 4 つの差（円・ニュース・密度・結びつき）を Atlas が汎用の能力から組み立てられるかの測定。
- 上の 3 つの確認・書き込み先・名前分類を 1 つの規則に移してから `map.clear*` を畳む設計。
