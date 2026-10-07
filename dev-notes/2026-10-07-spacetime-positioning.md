---
title: IntMap の位置づけを「地球の時空間アトラス」へ——ブランドの正本を書き換え、紹介ページの冒頭を時空間の時計と三つの入口に作り直す
date: 2026-10-07
newsen: The About page now opens on a clock: drag it and the same map changes from 3000 BC to the Cold War, each picture a real IntMap screenshot. Below it, three ways in — the world now, the world in any year, and Atlas.
newsjp: 紹介ページの冒頭に時計を置きました。動かすと、紀元前3000年から冷戦期まで同じ地図が変わります（どれも IntMap の実際の画面）。その下に「いまの世界」「どの年の世界も」「Atlas に訊く」の三つの入口があります。
---

〈依頼〉第 3 波「事業・プロダクト全体の再設計」のマーケティング担当（製品の位置づけとブランド）。IntMap は
「世界のニュース・気候・人口・経済・地政学データを一枚の地図に重ねる Web アプリ」と名乗ってきたが、それは
レイヤーの在庫の説明で、IntMap にしか無いもの（現在と全ての過去が一つの時計に載っていること、線ごとの根拠）を
言っていない。位置づけを言葉と入口にする。

## 0. 測ったこと（着手時）

- 「何であるか」の正本はすでに 1 つあった: `scripts/brand-text.mjs`（`scripts/brand.mjs` が index.html の head・
  `docTitle`/`docDesc`・manifest・README のタグライン・プレスキット・ローンチ下書きへ書く。プレスルームは
  `scripts/org-pages.mjs` が `words()` を読む）。前回の約束は「Every year of the world, on one map.」で、
  **時計の側だけ**を言い、同じ地図の今日のライブ（地震・雨雲レーダー・航空機・警報）を言っていなかった。
- 写しが 2 つ残っていた: 紹介ページの見出し（`scripts/landing-text.mjs` `about.hero.h1`。検査 ② が正本との一致を
  見ていた＝写しを前提にした検査）と、README のタグライン直下の手書きの一行（「A browser-based geospatial platform…」——
  4 通り目の「何であるか」）。
- 主張の裏付けは `PRODUCT.md` §3.1 で確かめた: 国境の 4 層（CShapes・OHM・Cliopatria・スナップショット）、都市名の
  その年の名前（江戸・コンスタンティノープル・スターリングラード）、地方区分の出版元記録と自作復元、両大戦の日ごと、
  ライブ航空機（全球）・地震（USGS）・RainViewer（直近 2 時間）・警報。都市名と地方区分は時計の下限まで遡らないので
  「記録が届くところでは」と限定した。
- 入口の形式: 共有 URL は `js/map-state.js` `encode` の `#v=…&l=…&tt=…`。**`tt` が無いリンクは現在へ戻る**。
  地震の層（`bx-eq`）は `share` を持たずリンクで運べない。**Atlas パネルを開く URL は無い**（アプリが読む問い合わせは
  `?here=` `?quest=` `?tour=` `?share=` だけ）。署名なしの Atlas は質問の候補を出し、時計が過去なら時代の候補に
  切り替わる（`js/atlas-examples.js` atlas-before-login）。

## 1. 新しい位置づけ（正本 `scripts/brand-text.mjs`）

| | English | 日本語 |
|---|---|---|
| カテゴリ `category`（新設） | A space-time atlas of the Earth | 地球の時空間アトラス |
| タグライン `tagline` | The world today, or in any year, on one map. | いまの世界も、どの年の世界も、一枚の地図で。 |
| 信頼の一行 `trust`（新設） | Every border is drawn from a named record, and every layer names its source. | 国境は線の一本まで出所の記録があり、レイヤーはすべて出典を明記しています。 |

説明文・リンクのカード・ポジショニング・裏付け（都市名と地方区分・両大戦・ライブの 3 項を足した）・短中長の紹介文も
同じ線で書き直した。数は一つも書いていない（`{floorBC}` などは `scripts/brand.mjs` が持ち主から埋める）。

## 2. 変えた面

- **生成で追従**: `index.html` の head（title・description・OGP・X・JSON-LD）、`js/locales/ui.en.js`/`ui.jp.js` の
  `docTitle`/`docDesc`、`manifest.webmanifest`、`docs/marketing/press-kit.md`（カテゴリと信頼の一行の行を追加）、
  `docs/marketing/launch-posts.md`（`scripts/launch-text.mjs` の Product Hunt のタグライン・説明、X の最初の投稿 2 本、
  note の題）。
- **README の冒頭**: 手書きの一行を消し、ブランドの印の間に `positioning.is` と `trust` を生成で書く。
- **プレスルーム**（`press.html`・`ja/press.html`）: 引用できる説明文にカテゴリと信頼の一行のコピー欄を足した。
- **紹介ページ**（`about.html`・`ja/about.html`）の冒頭を作り直した:
  - 見出しの上にカテゴリ、下に信頼の一行。**見出し・カテゴリ・信頼の一行は `scripts/landing.mjs` が正本から直接読む**
    （`landing-text.mjs` の `hero.h1` を消した）。
  - 横の絵は**時空間の時計**: 日付を持ちレイヤーを持たない見本（時計だけが絵を変える地図）を日付順に並べた
    `stripExamples()`——いまは紀元前 3000 年・100 年・1279 年・1900 年・1914 年・1920 年・1985 年の 7 枚（数は見本から
    導出。見本を足せば加わる）。1914 年だけが見え、他は `hidden` なので遅延読み込みの絵は選ばれるまで取らない。
    スライダーと年のボタンは `hidden` で出し、紹介ページだけに置く `STRIP_SCRIPT`（ハッシュで CSP に許可）が見せる。
    スクリプトが無ければ 1914 年の 1 枚とリンクだけ。
  - その下に**三つの入口**: 「いまの世界」（時刻なし＋`dl-radar`・`dl-planes`。リンクは `encode` が書く）、
    「どの年の世界も」（見本 `world-1279` の撮影済みリンクと歴史地図の入口）、「Atlas に訊く」（地図を開き、
    Atlas の場所とアカウントの要否を文が述べる）。印はアプリの線アイコン（`js/icons.js`）。
- **文書**: `PRODUCT.md` §1（位置づけと変更の事実）と §3.5（紹介ページ・プレスルーム）、`DECISIONS.md`
  「製品の位置づけは『地球の時空間アトラス』」、`docs/architecture/08-ui.md` §8.6・§8.6.2。

## 3. 検査

`tests/spacetime-positioning-checks.test.mjs`（7 件）——ブランドの新しい 3 欄が両言語で同じ形／全ての面が正本と
一字一句同じ（期待値は全部ブランドのモジュールから読む）／時計の枚が導出どおり・1 枚だけ見える・各枚が自分の撮影済み
リンク・操作は `hidden` で始まる／`STRIP_SCRIPT` を代役の文書の上で**実際に評価**して、スライダーとボタンが 1 枚と
その説明を出すこと・紹介ページにだけあり CSP のハッシュで許可されていること／「いま」のリンクが時刻を持たず、
運べる層だけで、アプリの符号化器が書いた形（decode→encode で不変）であること／新しい文に数を書いていないこと／
`PRODUCT.md` §1 と `DECISIONS.md` が位置づけを述べること。
既存の検査の変更: `tests/marketing-engine-checks.test.mjs` ②（見出しを `landing-text` の写しではなく生成したページから
読む）、`tests/press-room-checks.test.mjs` ①（コピー欄の数を 4 固定から一覧の長さへ）。

## 4. 統合時に足すリンク（他担当の入口。まだ存在しないので張っていない）

- **年ごとの世界地図ページ（`history-year-pages`）**: 紹介ページの「どの年の世界も」の入口の副リンク（いまは
  歴史地図の入口 `history/`）と、時計の各枚の説明（その年のページ）へ。`scripts/landing.mjs` `entrancesSection` /
  `heroStrip`。プレスルームの「フォローする」欄にも 1 行。
- **時代比較カード（`then-now-card`）**: 紹介ページの「いまの世界」と「どの年の世界も」の間をつなぐ導線（同じ場所の
  いまと昔）。時計の図の下か、三つの入口の下に 1 行。
- **時空間の検索（`where-when-search`）**: 紹介ページの冒頭の CTA（「地図を開く」の隣）と、「Atlas に訊く」の入口の
  副リンク。ブランドの裏付け（`proof`）に 1 項足すのは、その機能が本番に出てから。

## 5. 残したもの

- 古い約束の綴りがコードのコメントに 3 か所残る（`js/hist-knowledge.js`・`js/news-timeline.js`・
  `tests/hist-coverage-checks.test.mjs` の冒頭の注記。「製品の最初の約束」として引用）。挙動に関係しないので触っていない。
- 残り 7 言語の `docTitle`/`docDesc` は前々回の「Explore the world. Ask the map.」のまま（言語体制は凍結。en と jp だけを
  正本から書く）。
