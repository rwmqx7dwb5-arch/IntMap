---
title: find_capability の語の検索に「句」を足した——到達は 34 → 37 / 157（問い丸ごとは 2 → 4 / 74）。日本語は 15 / 78 のまま。到達を大きく上げる 3 つの案は、どれも返す行と文書を膨らませて正しい行を「当てる」形になったので採らず、測った数と一緒に残す
date: 2026-10-04
newsen: Atlas finds the right tool more often when a request uses a phrase rather than a single word.
newsjp: Atlas が、依頼が単語ではなく句で書かれていても、合う道具を見つけやすくなりました。
---

〈依頼〉ops-next 担当が Atlas の夜間評価に足した到達の計器（`scripts/atlas-eval/reach.mjs`。この時点では ops-next の
worktree にだけある）の実測では、解答つきの問いの言葉だけで、必要な能力が find_capability の検索に出るのは
157 件中 34 件、問い単位で 74 問中 2 問。日本語の依頼が能力に届かない形が広い。検索の構造を作り直して到達を
実際に上げる。手書きの同義語表は禁止で、能力の宣言・en/jp の文・catalog から導く。Atlas を縛らず、上限も下げない。

## 0. 測り方

`reach.mjs` は読むだけで、この worktree には写していない。scratch のスクリプトが ops-next の `reach.mjs` の
`reachOf` / `boundRegistry` を絶対パスで import し、この worktree の `productModules` と `answer-key.json` に当てた
（統合時にファイルが重複しないように）。到達の数に加えて、同じ問いで `find_capability` が返す**行数**と、
返す**文書の大きさ**（`CAPS.catalogText(ids)`）も測った。`find` は得点した行を全部返し（#R413）、その全部の文書を
モデルに渡すので、行を増やせば「当たる」が、それは #R727 の 94 秒（60 id・42 kB）と同じ形になる。

| 版 | 到達 | 問い丸ごと | 日本語 | 英語 | 行数の中央値／最大 | 文書の中央値／最大 |
|---|---|---|---|---|---|---|
| 着手前（HEAD） | 34 / 157 | 2 / 74 | 15 / 78 | 19 / 79 | 7 / 49 | 30.6 / 62.4 kB |
| **採用: 句** | **37** | **4** | 15 | 22 | 8 / 51 | 33.8 / 70.4 kB |
| 案 A: 製品の en⇄jp 対訳（生成した 3,199 組）で要求を両言語で読む＋句 | 40 | 4 | 18 | 22 | 12 / 54 | 43.1 / 74.3 kB |
| 案 B: A＋項目の区間に書かれた語を、区間の df で数える（K=16） | 56 | 8 | 28 | 28 | 24 / 53 | 75.5 / 110.6 kB |
| 案 C: 句＋「名指し」はカテゴリ hint 以上の強さのときだけ | 47 | 9 | 25 | 22 | 9 / 55 | 35.5 / 86.1 kB |

## 1. 採ったもの——要求の句

`termsOf` の Latin の語に、隣り合う 2〜3 語の句を足した（3 文字以上の語を 1 つ含むもの）。語境界で照合し、重みは句自身の
df（**5 ブロック以上が持つ句は 0 点**、語と同じ規則）。項目は用例を句で書く——`data.value` は «what is the population
of X» と書くので、«population» も «of» も多くのブロックにあって 0 点でも、«population of» は 1 項目にしかない。
«what is the population of Japan» は着手前 `data.populationIn` 1 行だけだったが、`data.value` が 2 位に入る。
«of the» «on the map» は全ブロックにあるので何も返さない。「ありがとう」「thank you」は 0 件のまま。

`scripts/atlas-eval/cassettes/promoted-tool-runs-the-capability.json` を `scripted-cassettes.mjs --write` で記録し直した。
«measure distance between two places» の順位が `map.measure` 1 位のまま、`map.compose` と `time.changes` が足された
（句 «between two» を書く項目）。検索の検査（`atlas-capabilities` / `find-semantic` / `geo-resolve` / `semantic-search` /
`quality-lab` / `eval-harness` ほか 15 本、340 件）は全部緑。

## 2. 採らなかったもの（測った）

- **案 A（対訳）。** 生成器（翻訳の呼び出し箇所の en/jp と、UI の表の同じ鍵）から 3,199 組の語の対訳を作り、要求の
  語の相手側の語も証拠に足した。①相手側の語を能力の**綴り**にも当てると、ISS の依頼（「…最大仰角・…方位、仰角…」）で
  仰角→«pitch»、方位→«bearing» が別名に当たり、`view.pitch` が `layers.satellites` より上に来た（R728 ① が赤）。
  ②カタログの証拠にだけ使っても、長い日本語の依頼では訳語が多く、ISS は 24 行（R728 ① の上限 12）、「現在地の天気」は
  `data.weather` が 3 位に落ちた。③「カタログが書いていない語だけ訳す」に絞ると赤は消えたが、到達は句だけと同じ
  （37）。効かないものを Atlas のチャンクに 113 kB 足すのは偽物なので、生成器と生成物ごと消した。
- **案 B（項目の区間の df）。** «distance» 7 ブロック・«population» 14・«elevation» 11・«area» 14・«line» 13・«pin» 8
  ——主題の語はどれも 5 ブロック以上にあり 0 点になる。項目の区間に書かれた語を区間の df で数えると到達は 56 まで
  上がるが、行数の中央値は 24、文書は 75 kB。閾値を下げると、上がった到達と一緒に消える（K=4 で 37、K=10 で 45）。
- **案 C（名指しの強さ）。** 「名指されたらカテゴリの残りを降ろす」を「hint 以上の強さで名指されたら」にすると 47・
  問い丸ごと 9・日本語 25 になったが、その中身は**カテゴリ全員**だった。「令和2年国勢調査での日本の総人口は？」は
  40 行、「羽田と新千歳をピンして…直線距離は？」は 30 行。`data.value` が「当たった」のは data の能力全員が並んだ
  からで、区別できたからではない。#R802 の形（カテゴリの行が登録順で並ぶ）そのものなので採らない。

## 3. 測ってわかったこと（ops-next と利用者へ）

- **期待される 157 件のうち 40 件は、Atlas が最初から持っている中核の道具**（`view.flyTo` / `map.highlight` /
  `time.travel` / `data.query` ほか 11 個。`js/atlas-toolsurface.js` CORE）で、find_capability で探す必要が無い。
  中核を除くと着手前 18 / 117、句で 21 / 117。到達の計器が中核を「届いた」と数えれば、数字が実態に近くなる。
- 解答の側にも、語では届きようのない期待がある。`data.value` は**国**の値を返す能力（自身の項目がそう書く）なのに、
  富士山の標高・利根川の長さ・琵琶湖の面積の答えに期待されている。
- 日本語が語で届かない本当の理由は 2 つ。①一般的な行為の項目（ピン・線・計測・値）が日本語で主題を書いていない
  （`check:capabilities` ㉓ の台帳に 60 能力が載っている）。②主題の語が 5 ブロック以上にある。語の検索の外では、
  意味の検索（`searchFused`・atlas-embed）がこの差を埋める設計で、到達の計器はそちらを測っていない（本番で
  ログインが要るため）。

## 4. 検証

- `node --test tests/atlas-reach-checks.test.mjs` 3/3（句が届くこと・何にでもある句は 0 件・解答の問いの到達が
  37 / 4 を下回らないこと）。
- 検索まわりの node 検査 15 本・340/340。`scripted-cassettes.mjs` は記録し直したあと最新。
