---
title: 「現在地の天気」が天気に届かず、同じ記事に番号が 2 系統あった——連続の中の語を分割器に訊き、記事の番号を証拠レジストリ 1 つにした
date: 2026-09-25
---

〈利用者「実装をやって。やる箇所は、並行してる実装や現状見て自分で見つけて」。直近 20 本の記録が先送りした作業を
全数で拾い、開いている 4 本の PR（#748 #747 #739 #729）とファイルが重ならないものから選んだ。検査は
`tests/atlas-find-semantic-checks.test.mjs` 7 件〉

## 0. 選ばなかった候補と、既に済んでいた候補

- **`find_capability` を `searchFused` へ配線**（`2026-09-25-atlas-semantic-search.md` §2 の「残っているもの」）は
  **#738 で既に配線済み**だった（`js/atlas-toolsurface.js` の `find`）。記録の「残り」が古かっただけで、
  `Architecture.md` の同じ段落も「まだ同期の `search` を呼んでいる」と述べていたので直した。
- ⚠ 本番検証（intmap-prod-verifier・2026-09-25）で **本番 DB の `atlas_capability_vectors` は 0 行**
  ——ログインした状態の意味検索は、本番でまだ一度も成功していない（埋め込みモデルに鍵が届くかは未測定のまま）。
  ⇒ 綴りの検索が日本語の問いを読めることの重みは、意味検索がある今も変わっていない。
- 本番 DB・cron・削除を伴う候補（migration 履歴の整合、bucket policy、`sweep_relay_rate_buckets` の cron 登録、
  `_resolve.mjs` の撤去）は利用者の判断が要るので選ばなかった。

## 1. 「現在地の天気」——連続は文字種で切られ、助詞も同じ文字種だった

実測（この回の修正前、`CAPS.search(q, {want:3, min:1})`）:

| 問い | 返った順位 |
|---|---|
| 現在地の天気 | routing.isochrone, routing.setEndpoints, … navigation.* の 10 行。**data.weather 無し** |
| ここの天気 | **0 件** |
| 今いる場所の天気 | view.locate だけ |
| 天気 現在地 | view.locate 43 > data.weather 6 |

CJK の要求は `[぀-ヿ㐀-鿿]+` で**文字種の連続**に切られる。助詞「の」も同じ範囲なので「現在地の天気」は 1 つの連続で、
証拠になるのは連続全体か 4 文字以上の断片（#R745 の床。「東京の」が 3 文字で地震に当たった実測が理由）だけ——
2 文字の「天気」は**どちらにも当たらない**。天気のカタログ文は「天気」を書いている。

⇒ **連続の中の語の位置を、プラットフォームの単語分割器（`Intl.Segmenter`、ICU の辞書）に訊く。**
`現在地|の|天気`・`ここ|の|天気`・`今|いる|場所|の|天気`。2 文字以上の語を Latin の語と同じく
「ブロックが持つ数で割った 6 点」の証拠にする。語彙の一覧はどこにも書いていない。

- 分割器が 1 語とみなす連続（「ありがとう」）からは何も増えない——#R745 の実測はそのまま 0 件。
- 別名・語句（`phrases`）の照合規則は**変えていない**。「現在地から大阪駅まで」で現在地を view.locate の名指しに
  しない設計（`atlas-50-remainder` ③）はそのまま。変えたのはカタログ文の証拠だけ。
- 分割器の無い環境（古いブラウザ）では従来どおり連続だけを読む。

修正後: 現在地の天気 → **data.weather が 1 位**／ここの天気 → **data.weather が 1 位**／今いる場所の天気 →
view.locate, **data.weather**（「今いる場所」は現在地の語表の語なので両方が候補——どちらを呼ぶかは Atlas が決める）。
経路・原発・鉄道ルート・東京の天気の 1 位は不変。能力検索を読む既存の検査 55 ファイルは全部緑のまま。

天気の実行器は `geocode(a.place)` を通るので、「現在地」（SELFLOC）・「ここ」（DEIXIS）は既に解決できていた
——欠けていたのは検索で届くことだけだった。

## 2. 同じ記事に番号が 2 系統——引用が別の記事を指していた

分析の経路（`js/atlas-console.js` の analyze）はニュースを 2 回プロンプトに載せていた:

1. `NEWS EVIDENCE` — `_analyzeEvidence` が**日付の新しい順**に `[e1]…` を振る
2. `EVIDENCE RECORDS` — 証拠レジストリ（`js/atlas-evidence.js`）が `clientSources`（= `srcSink`、**取得順**）に `e1…` を振る

同じ `e3` が 2 つの一覧で別の記事を指し、claim の `evidenceIds` は**レジストリ**で解決される。GDELT と Google News の
答えが返る順は日付順ではないので、NEWS の一覧から番号を読んだ引用は、読者の出典行に**別の記事**を名指させうる。

⇒ **番号の持ち主をレジストリ 1 つにした。**
- レジストリに `idOf(url)`（正規化した URL → そのレジストリが振った id。記録が無ければ null）。
- パイプラインの `dataBlock` の部品は**レジストリの関数**でもよい——`clientSources` を登録したあとに
  `{ idOf }` を渡して文にする（`js/atlas-answer-pipeline.js`）。
- analyze は NEWS EVIDENCE をその関数として渡し、`clientSources` には**同じ一覧の順**（新しい順・重複除去後）を渡す
  ——レジストリでも `e1` が最新になる。レジストリが記録を持たない記事は `[no id — not citable]` と書き、
  別の記事の番号を借りない。

他の 2 経路（`researchMap` と `mapReport`）は自分で振った番号を自分で解決していて、レジストリを使わないので一致していた。

## 3. 検査

`tests/atlas-find-semantic-checks.test.mjs`（7 件）:
- ① 上の 3 つの問いの順位（修正前の実測が欠陥）／「ありがとう」0 件・経路・鉄道・東京の天気の 1 位は不変／
  分割器を使い語彙表を書いていないこと。
- ② `atlas-console.js` の `_analyzeEvidence`・`_evidenceBlock` を**実際に評価**し、本物のパイプラインと
  レジストリに通して、NEWS の各行の id が EVIDENCE RECORDS の**同じ題の記事**を指すことを測る。
  **旧い組み合わせ（一覧は日付順・レジストリは取得順）をこの検査が捕まえることも測る**。

触った門: `check:static` `check:catalog` `check:capabilities` `check:atlasrepeat` `check:docs` ＋ 触ったモジュールを読む既存検査。

## 4. 残っていること

- 裸の「Pacific」（Pacific County）と `research.analyze` の言い換え——`2026-09-25-atlas-50-remainder.md` §9 のまま。
- 本番で意味検索が一度も成功していない（上の §0）。ログインした本番検証で `atlas_capability_vectors` に行が入るかを見る。
