---
title: 授業ツアーを作った——地図の状態を順に並べ、各段に読み上げる文と生徒への問いを付けて、全画面の授業モードで「次へ／前へ」と進む。段のリンクは見本と同じくアプリ自身に作らせ、語りの主張（国名・区分・区分が無いこと）はその日付の記録に訊き、歴史の段は年ごとに列挙して史実と照らし、地図を撮って見た
date: 2026-10-02
newsen: Classroom tours: a lesson as a sequence of maps, each step with narration and a question for students, played full-screen with Next and Back.
newsjp: 授業ツアーを追加。地図を順に並べ、各段に語りと生徒への問いを付けて、全画面の授業モードで「次へ／前へ」と進めます。
---

〈依頼〉「商品開発・マーケティング・営業。足し算。全権を委任する」（2026-10-02）。推奨顧客層の 2 つ目（歴史・地理の教員、
PRODUCT.md §2.4）に向けて、登録なしで 1 コマを回せる「授業ツアー」: 地図の状態（共有リンクと同じ状態）を順に並べ、
各段に短い語り（en/jp）と生徒への問い、「次へ／前へ」、全画面の授業モード（大きな文字・余計な UI を隠す・矢印／スペース）。
最初の 3 本、URL・教員ページ・アプリ内・Atlas からの起動。

## 0. 測った——年ごとに、何が描かれるか（.agents/rules/historical-verification.md）

**明治の日本**（`node scripts/hist-fidelity.mjs --year <y> --in 128,30,146,46`、国名は `data/hist-borders.js` を同じ箱で列挙）

| 年 | 第1級区分（記録） | 国の名 | 史実との照合 |
|---|---|---|---|
| 1860・1868・1870・1871 | 令制国 58 単位（五畿七道を含む）。すべて 701 → **1871-08-29** | Empire of Japan (1868-1869) | 廃藩置県 1871-08-29 ✓ |
| 1872 | **日本は 0**（`対馬国` は 1872-01-01 まで。他は 경상북도 と村レベル） | Empire of Japan (1869-1879) | — |
| 1876 | 滋賀県・愛媛県・名東県 の 3 だけ | 同上 | 当時は 3 府 35 県 |
| 1880 | 滋賀県 1 | 同上 | |
| 1890・1900 | 滋賀県（OHM）＋ 45 府県（穴埋め、**1881-02-07 から**） | Japan（CShapes） | 香川県の再置 1888-12-03 |

- ⚠ **1869 年 1 月より後の年は令制国の段にできない**: 記録は 1871-08-29 まで `陸奥国`・`出羽国` を 1 単位で持つが、
  陸奥は 1869-01-19（明治元年 12 月 7 日）に 陸奥・陸中・陸前・磐城・岩代 へ、出羽は 羽前・羽後 へ分かれている。
  1870 年の地図は分割前の 2 国を描く——**史実と違う**。⇒ 段は **1868-11-01**（明治改元 1868-10-23 のあと、分割の前）。
  この不一致そのものは直していない（`data/hist-admin1.js`・`data/hist-kuni.js` は担当範囲の外。§4 に報告）。
- ⚠ **1881〜1888 年は府県の段にできない**: 穴埋めの 45 府県は 1881-02-07 から今日の香川県・北海道を描くが、
  香川県は 1876〜1888 年は愛媛県の一部、北海道は 1882〜1886 年は函館・札幌・根室の 3 県。⇒ 府県の段は 1900 年
  （見本 `japan-1900`）。語りは「輪郭は今日の都道府県を 1881 年までさかのぼらせたもので、1900 年の境界そのものではない」と言う。
- **1872 年の段は「区分が無い」ことを主張する**。記録が日本の区分を 1 つも持たないので、地図は今日の府県で代用せず
  何も描かない——授業ではそれ自体が「史料の無いところを地図はどう描くべきか」の問いになる。**ビルドしたアプリで撮って
  見た**（`showcase-capture.mjs --shots`）: 1872-07-01 の日本は区分の線もラベルも無く、国の名だけ。線を描くもう 1 つの
  読み手（OHM のベクタタイル、規則 §2b）も線を出していない。
- 1868 年の画面: Dewa / Mutsu / Echigo / Sado / Noto Province など令制国のラベルと、五畿七道の名（Saikaido・Tokaido…）。

**第一次世界大戦前後のヨーロッパ**（`data/cshapes.js`、0,36,40,62 の箱で日付ごとに列挙）

- Austria-Hungary は **1918-11-02** まで、Austria・Hungary は 11-03 から、Czechoslovakia・Poland・Estonia は **11-11**
  から、Latvia は 11-18、Yugoslavia は 12-01、Finland は 1917-12-06、Lithuania は 1918-02-16。
  ⇒ 1918-11-11（休戦の日）の段は Austria・Hungary・Czechoslovakia・Poland・Finland・Estonia・Lithuania を主張する。
  ポーランドの独立記念日は史実でも 11-11。⚠ チェコスロバキアの独立宣言（10-28）とエストニアの独立宣言（1918-02-24）は
  CShapes の日付と違うので、**語りではこの 2 国の成立日を述べない**（「この日に現れる」と言うのはポーランドだけ）。
- 撮った画面: Hungary・Czechoslovakia・Poland・Estonia・Lithuania・Finland・Serbia・Montenegro のラベル。Austria の
  ラベルは衝突で出ない（`imtb-lbl-src` は持つ——見本 `europe-1920` と同じ事情）。
- 1920 年の段の語り: ヴェルサイユ条約（1919-06-28 署名）・トリアノン条約（1920-06-04。CShapes の Hungary も 06-04 で変わる）。
  ⚠ 記録の「Yugoslavia」（国名は 1929 年から）と、1919-06-28 からの「Danzig」（自由市は 1920 年）は語りに出さない。

**プレートと火山と地震**（`eco-dl-plates`・`beta-dl-volc2` を点けて撮った）

- プレート層は境界の線だけでなく**プレートごとに色を塗る**——最初の語りを「色分けされた区域がプレート、その間の線が
  境界」に直した。いちばん大きいのは太平洋プレート。
- 日本のまわり: 最初の語り「火山は海の中の境界から離れた**陸の上**に帯状に並ぶ」は誤り——伊豆諸島の火山は海の中に
  並んでいる。⇒「東と南の海の境界から少し離れて、境界と平行に連なる。日本列島に沿って、伊豆諸島を通って南へ」。
- アイスランド: 北米（ピンク）とユーラシア（青）の境界が島を横切り、火山がその上に並ぶ ✓。
- **地震は段の状態にできない**: `bx-eq` は共有リンクが運ばない（`js/layer-manifest.js` に `share` が無い。
  landing-showcase の記録と同じ）。⇒ 日本の段の問いで「レイヤー ▸ 災害・緊急 ▸ 地震（ライブ＋過去）をオンにして」と
  **アプリ自身の表示名で**頼む（テスト ⑥ が locale と `js/wb-layers.js` に照らす）。オンにした地震は共有リンクの外なので、
  次の段へ進んでも残る（復元は共有リンクが運ぶレイヤーだけを入れ替える）。

## 1. 作ったもの

- `js/tours.js` — ツアー 3 本の宣言（純データ）。段は見本を名指すか（`example:`）、見本と同じ形の意図
  （`view`・`base`・`at`・`layers`・`drawn`）を持つ。`drawn` に**不在の主張** `noAdminIn` を足した。
  生成領域 `CAPTURED_STEPS`、`tourLink`・`tourFromSearch`（`?tour=<id>&step=<n>`）。
- `scripts/showcase-capture.mjs` — 自前の段も**同じ `capture()`** で意図どおりの状態にして `IntMapBookmark.link()` を読む
  （写真は残さない。`--shots <dir>` で確認用に撮る）。`--only <段>` のときは js/showcase.js を書き直さない
  （書き直すと見本の順序だけが動いた——実測）。
- `js/tour-player.js` — 授業モード。段は**共有リンクの復元だけ**で開き（`history.replaceState`＋`IntMapBookmark.restore`）、
  時計とレイヤーを**リンク自身の `tt` と `l`** に照らして読み返す（6 秒上限。panel.showcase と同じ読み）。
  「残す一覧」の CSS（地図・凡例・出典表示・`#ai-toast`・パネル）は `js/embed-mode.js` と同じ作り。
  キー（→ / Space / Page Down、← / Shift+Space / Page Up、Home / End、F、T、Esc）、ステップの点、全画面。
  アプリ内から始めたツアーは終えると前の地図へ戻る。知らない id の URL はツアー一覧を開く。
  Atlas 用の一時ツアー（`addStep` が今の地図を記録・`sessionStorage`）。
- 入口: `src/main.js`（`?tour=` と `#btn-tours` のときだけ `import('../js/tour-player.js')`）、`index.html` の設定 ▸
  情報とサポートに `#btn-tours`（`viewTours` en/jp）、授業ページの「授業ツアー」の節（`scripts/landing.mjs` `toursSection`・
  `scripts/landing-text.mjs` `teachers.tours`・ヒーローの `ctaTours`）、Atlas の `panel.tour`
  （list / start / next / prev / go / exit / addStep / clear）と catalogue の 1 ブロック（ツアーの一覧は `TOURS` から）。
- `scripts/landing.mjs` — リンクと意図の照合を `linkProblems` 1 つにして、見本とツアーの段の両方がそれを使う。
  `tourProblems`（段が解決する・見せている見本だけを名指す・日英・捕えたリンクが意図どおり・古い捕捉が無い）。

## 2. Atlas の配線の形

別作業 atlas-capability-single-source が能力の宣言の形を作り替え中。配線の時点で
`gh pr list --state merged --search atlas-capability-single-source` は該当なし（返ったのは無関係の #7）
⇒ **既存の形**（`js/atlas-cap-panel.js` の項目＋`node scripts/atlas-caps.mjs --write`）で書いた。能力 153 → 154
（到達可能 153）、catalogue 60 → 61 ブロック。文書の件数（`PRODUCT.md`・`DECISIONS.md`・`docs/FILES.md`・
`docs/architecture/02-features.md`）は `check:docs` が求める実数へ。

## 3. 費用

- 同じ機械で `git archive HEAD` をビルドして比べた（この checkout は CRLF なので、天井の値とは直接比べない）:
  eager raw 4616.1 → 4616.6 kB（+0.5 kB: `src/main.js` の 3 行・設定の 1 要素・locale の 1 鍵）、eager gzip +0.1 kB。
  async raw 11405.0 → 11436.2 kB（+31.2 kB）、gzip 3740.9 → 3752.0 kB（+11.1 kB）。内訳: 新しいチャンク `tour-player`
  15.6 kB・`tours` 23.5 kB（見本の宣言 js/showcase.js も入る——Atlas とプレイヤーが共有）、`atlas-console` は
  1,137,885 → 1,130,691 B（**−7.2 kB**: 見本のデータがそちらへ移った）。
- ⇒ `node scripts/perf-budget.mjs --update` が async.gzip の天井だけを 3725.8 → 3752.0 kB に上げた。⚠ この機械（CRLF）の
  値で書いたので、増分のうち実費は上の +11.1 kB で、残りは改行の差。merge 後に main の計測で bot が下げる。
- `check:surface`（`--update`）: `js/tour-player.js` が window を 4 回読む——`IntMapBookmark`（`js/map-ui.js` が実行時に作り
  export が無い・1 か所の `BM()` に集めた）、`IntMapHistScale`（日付の表記の持ち主 `dateText`）、`IntMapI18N`（読者の言語）、
  `IntMapSafe`（HTML の符号化）。どれも持ち主が export していない。
- テスト時間: 新しい spec は作らない（全体の天井 5,250 秒・#R205。現在 5,249）。`tests/landing-showcase.spec.js` の最初の
  見本をツアーのアドレスから開くようにし、パネル・→ キー・Esc を同じ起動で測る。HEAD の spec と同じ dist で交互に 6 回
  測った差は +0.4 / +0.3 / +4.8 / +0.4 / −0.5 / +1.7 秒（中央値 +0.4 秒・機械の負荷で揺れる）。`tests/durations.json` の
  16（実測 14.4〜15.5 の上限）に収まるので動かしていない。

## 4. 作る途中で見つけた、担当範囲の外のこと（直していない）

1. **陸奥国・出羽国が 1869-01-19 の分割後も 1871-08-29 まで 1 単位で描かれる**（`data/hist-admin1.js`／`data/hist-kuni.js`）。
   北海道（1869 年に 11 国）も 1869〜1871 年に区分が無い。
2. **1872〜1880 年の日本の府県がほぼ無い**（記録が 1876 年に 3 単位・1880 年に 1 単位）。穴埋めは 1881-02-07 から
   今日の府県を描くので、1881〜1888 年の香川県（愛媛県の一部だった）と 1882〜1886 年の北海道 3 県と食い違う。
3. ベースマップの都市名: 1868 年は「Edo [?]」、1872 年は「Tokyo 東京都」（東京都は 1943 年）。
4. 段を進めた直後の 2〜5 秒、国の名は前の日付のまま（1872 → 1900 で「Joseon」「Empire of Japan (1869-1879)」が残り、
   CShapes の束が届くと「Korean Empire」「Japan」に替わる——実測 2 秒で旧・5 秒で新）。プレイヤーの読み返しは時計と
   レイヤーだけを見るので、この間もパネルは「開いた」と表示する。
5. 地震（`bx-eq`）は共有リンクが運ばない（既知）。
6. 授業モードでは凡例（「この日付の地図」の注記など）がパネルと重なることがある（凡例は消さない一覧に入れている）。

## 5. #890・#886 の着地のあと

- **Atlas の宣言の形**: #890（能力 1 つを 1 宣言に）が着地したので、`panel.tour` の catalogue の文を項目の `doc`
  （`{ in: 'panel.tour', text: (c) => … + c.tourList() + … }`）へ移し、`js/atlas-catalog-text.js` は塊の名前
  （`CATALOGUE_CHUNKS` の 1 行）と `tourList`（`TOURS` から導く）を渡すだけにした。`tourList` は catalogue の文が読む
  実行時の値なので、`js/atlas-caps.js` の註と `tests/atlas-capability-single-source-checks.test.mjs` の文脈の見本にも足した。
- **アドレスバー**: #886 の門（直接の `location.hash` / `history.*State(` の箇所は増やさない）が `js/tour-player.js` の
  3 か所で赤になった。`?tour=&step=` は地図の状態ではなくページの欄なので SCHEMA には入れず、`js/map-state.js` に
  `MapState.address(query, hash)`（ページの欄と、codec が書いた断片をバーに置く唯一の扉。復元はしない）を足して、
  プレイヤーはそれと `MapState.link()` / `hash()` / `carriesState()` だけを使う。門の台帳には map-state.js の
  1 読み・1 書きを理由つきで足した（tour-player は 0）。
