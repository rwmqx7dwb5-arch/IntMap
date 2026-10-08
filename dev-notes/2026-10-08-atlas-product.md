---
title: 時をまたぐ道のり——1 本の線を Atlas が選んだ複数の時点で訊き、通る政体を順に・区間の km・越境点・一部の時点でだけ通る政体で答え、1 時点を政体ごとの色で地図に描く（Atlas time.journey・経路パネル「その年の国境」）
date: 2026-10-08
newsen: Atlas can follow one journey through time — "Vienna to Istanbul in 1913 and today" — naming the states the line crosses at each date, in order, with distances, drawn in each state’s colour. The route panel does the same for your route ("Borders that year").
newsjp: Atlas が 1 本の道のりを時代ごとにたどれるように——「1913 年と今日のウィーン→イスタンブール」「1925 年と 1990 年のパリ→モスクワ」に、時点ごとに通る国を順に・各区間の距離・国境を越える位置で答え、政体ごとの色で地図に描きます。経路パネルでも計算した経路を「その年の国境」で読めます。
---

〈依頼〉Atlas 分野の商品開発（全権委任）。「地球の時空間アトラス」として、現在と過去の地図を Atlas が使いこなす
新しい価値を 1 つ、この回で出荷できる大きさで。足し算のみ・偽物禁止。

## 何を作ったか（誰に・なぜ今）

**時をまたぐ道のり。** 1 本の線（地点間の大圏、または計算した経路）を、Atlas が選んだ複数の時点で訊く。

- 既にあったもの: 時点 × 世界（年鑑 `time.yearbook`）、時点 × 地点（この場所の歴史 `time.placeHistory`）、
  2 時点 × 画面（あの頃といま `time.thenNow`・`time.compare`）、今日 × 経路（経路パネル「国境」#R184）。
  **時点 × 線**が無かった——「オリエント急行は 1900 年にいくつの国を通ったか」「シルクロードは 700 年と 1400 年で」は、
  地図の記録に答えがあるのに誰も訊けなかった。
- 誰に: 歴史の授業（「第一次大戦の前後でウィーン→イスタンブールの国境は何本変わったか」）、旅と歴史の読者、
  ニュースの読者（国境の変化を「道のり」という具体で掴む）。
- 何を答えるか: 時点ごとに、線が通る政体を**順に**・区間ごとの km・越境の位置・海と記録の無い陸地の長さ。最後に
  **一部の時点でだけ通る政体**。1 時点を政体ごとの色で地図に描く（海と記録の無い陸地は灰色）。
- どこから: Atlas（`time.journey`、能力 217 番目）と、経路パネル「過去の路線網 ▸ その年の国境」（計算した経路をその年と今日で）。

## 構造（場当たりにしない）

- **測り方は 1 つ。** 経路パネルの「国境」が #R184 から持っていた標本（約 500 点・200 m 以上・700 点まで）と点包含を
  `js/routing-ops.js` のモジュール直下へ**そのまま**出して export し、新しい `js/journey-through-time.js` が同じ関数を import する
  （`_math` が公開する関数と同一であることを試験①が評価で確かめる）。写しを 2 つ持たない。別ファイルにしなかったのは、
  routing-ops が起動経路にあり、新しいモジュールは起動時の要求を 1 本増やすため（PR #1047 の最初の CI で check:perf が
  eager の requests 9→10・modules 315→316 を落とした）。同じ CI の check:surface（`window.IntMapSafe`・`IntMapTimeBorders`・
  `countryGeo` の読みが増えた）も、読みを持ち主の 1 か所（`year-book.js` の `esc`・`bordersNow`、`routing-ops.js` の
  `countryOutlines`）にまとめ、そこから import する形で直した。
- **多角形は地図が描くものと同じ呼び出し**——`js/time-borders.js` `collectionAt`（年鑑と時代の層が描く呼び出し）、
  今日は `window.countryGeo`。名前は年鑑の `nameIn` を export して使う（同じ地物に 2 つの読み方を作らない）。
- **Atlas が決める。** どの時点を何個、どれを描くかは Atlas。時点が無ければ時計の瞬間（`time.coverage` と同じ）。
  上限・打ち切りは足していない。同じ呼び出しの 2 回目は自分の区間を置き換え、`resultKey` が同じ（one-pass §4）。
- **観測できる完了。** 描いた区間は `meta.painted.lines` で宣言し、観測器 `paint` が地図の側の線 ID と突き合わせる。
  描けなかったら `partial` で、答えの文は返る。

## 史実照合（historical-verification §2-1・2）

`node scripts/journey-through-time.mjs --sites` が出荷した記録を Node で開き、同じ関数で読む。年と線を名指して列挙した結果:

- **パリ → モスクワ、1925 年**: France → Belgium → Germany 815 km → **Poland 104 km（ポーランド回廊）→ Germany 273 km（東プロイセン）**
  → Lithuania → Poland 5 km → Lithuania 129 km → **Poland 229 km（ヴィリニュス地方、1922–39 年はポーランド領）** → Soviet Union。
  ヴェルサイユ条約（1920-01-10 発効）の回廊と、1922 年の中部リトアニア併合に一致する。
- **同、1990 年**: West Germany 333 → East Germany 194 → **West Germany 15 km（西ベルリン）** → East Germany 70 → Poland →
  Soviet Union 15 km（カリーニングラード）→ Poland 5 → Soviet Union。CShapes はドイツ統一（1990-10-03）とリトアニアの承認
  （1991-09）をその日に置くので、6 月の線は両ドイツとソ連を通る。史実どおり。
- **ウィーン → イスタンブール**: 1913 年（6 月）は Austria-Hungary → Romania → Bulgaria 260 km → Ottoman Empire、記録の無い陸地 48 km。
  1913-08-15（ブカレスト条約の後）は Bulgaria 296 km・記録の無い陸地 13 km。1925 年と今日は Austria → Hungary → Romania →
  Bulgaria → Turkey。1913 年 6 月の記録の無い陸地は 2 区間——ブルガリアとオスマン帝国のあいだ（東経 27.3〜27.6 度、
  ストランジャ山地の付近）36 km と、チャタルジャの北 13 km。8 月 15 日には前者がブルガリアの区間になる。ロンドン条約（5 月 30 日）から
  ブカレスト条約（8 月 10 日）までのトラキアの帰属を CShapes がどう置いたかの理由はこの回では審査していない——答えは記録どおり
  「記録の無い陸地」と書き、「国が無い」とは書かない。
- 否定した見立て: 最初の実装は政体ごとの**合計** km を順路の各行に出していた（パリ→モスクワ 1925 年の Germany が 2 行とも
  1,089 km）。区間ごとの km（`legs`）に直し、合計は `polities` に分けた。
- 残る限界（答えにも書く）: 線は大圏であって当時の道ではない。越境の位置は標本の半分（パリ→モスクワで約 2.5 km）の精度で、
  今日の 5 km の区間（スヴァウキ付近のリトアニア／ポーランド）は標本間隔に近い。

## 検査

- `tests/atlas-product-checks.test.mjs` 8 本: ① 標本と点包含が経路パネルと同一の関数 ② 大圏（赤道・日付変更線・長さ）
  ③ 記録が描くものだけ（realm・2 つの主張・名前の無い形・海と記録の無い陸地・輪郭が無いとき outside）④ 読めない時点の理由
  ⑤ 時点の読み方 ⑥ Atlas（exec・描画の宣言・再描画が置き換える・地名の失敗）⑦ 出荷した記録での回廊・西ベルリン・
  オーストリア＝ハンガリー ⑧ 能力の宣言。
- `check:capabilities`・`check:catalog`・`check:atlasrepeat`・`check:docs`（能力数 216 → 217・到達可能 213 → 214 を各文書で）・
  `check:archfiles`・`check:static`・`check:i18n`。

## 触っていないもの

`supabase/functions/` は変えていない（Edge Function のデプロイは不要）。経路パネルの「国境」の結果は変わらない
（関数を移しただけで、数値は同じ）。
