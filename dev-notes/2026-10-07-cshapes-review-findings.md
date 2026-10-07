---
title: CShapes 2.0 の国境の所見 3 件を条約で審査した——北千島を 1886〜1945 年の日本へ戻し、韓国併合を施行日 1910-08-29 に、1946〜1972 年の南西諸島を米国の施政下として描き分ける（審査台帳 scripts/cshapes/review.json と、カードの説明行）
date: 2026-10-07
newsen: The historical map now draws the northern Kuril Islands as Japanese from 1875 to 1945, Korea as annexed on 29 August 1910 (when the treaty took effect), and the Ryukyu Islands under United States administration from 1946 to 1972 — each outline's card says which treaty decided it.
newsjp: 歴史地図で、北千島を 1875〜1945 年の日本領として、韓国併合を条約が施行された 1910 年 8 月 29 日として、琉球諸島を 1946〜1972 年の米国施政権下として描くようになりました。それぞれの輪郭のカードが、根拠の条約を述べます。
---

〈依頼〉「この線の根拠」の担当が史実照合で見つけた CShapes 2.0 由来の所見 3 件——①1900 年の占守島がロシアの中、
②韓国併合の日付が 1910-08-23、③1945〜1972 年の沖縄が「日本」——を一次的な史実で判定し、既存の作法（台帳と記録）で直す。

## 0. 測った——どこから来た誤りか

- **上流そのものの形**だった（取り込みの誤りではない）。`CShapes-2.0.geojson`（キャッシュ）でも占守・アトラソフ・
  幌筵・温禰古丹・春牟古丹・捨子古丹・新知の 7 島は 1886〜2019 年の全ロシア行に**同じポリゴンで**入っている。
- 理由は**上流の規約**。CShapes 2.0 Documentation（G. Schvitz, 2018-12-21, §3）を開いて読んだ:
  「we only code de jure changes … we code the day on which for example a treaty was signed」、除外規則に
  「Territorial changes below 10'000 sqkm」と「no evidence of territorial changes … backdated the current boundaries」。
  ⇒ ①は「1 万 km² 未満は記録しない」＋「今日の国境を遡らせる」の帰結、②は「調印日を変化日にする」規約、
  ③は「de jure だけを記録する」規約（施政権の分離は主権の移転ではない）。
- 島嶼を年と点で列挙した（CShapes → OHM 後期 → Cliopatria の合成を点で引く。`hist-fidelity --year` は重心で数えるので
  島の帰属を見られず、点で引く道具を作業中に書いた）:
  - 得撫・択捉・国後・色丹は CShapes に**どの年にもポリゴンが無い**。1886〜1923 年は OHM 後期が「大日本帝国」として
    描き、1924 年以後は**どの記録も描かない**（穴であって誤りではない）。
  - 小笠原・火山列島・大東・トカラも CShapes にポリゴンが無い（何も描かれない＝誤った主張も無い）。
  - 南樺太（7351）は 1905-09-05（ポーツマス条約の調印日）〜1945-08-14 で別単位として正しく描かれている。
  - 奄美・沖縄・宮古・八重山（Japan の 6 ポリゴン）は 1886〜2019 年ずっと Japan。

## 1. 判定

| 所見 | 判定 | 根拠 |
|---|---|---|
| ① 北千島がロシア | **直す**: 7 島を 1886-01-01〜1945-08-14 の Japan へ | 樺太・千島交換条約（1875-05-07 調印・08-22 発効）第 2 款: 占守島から得撫島までの 18 島を日本へ、境界は「ラパツカ岬と占守島の間の海峡」。終わりは CShapes 自身が南樺太・朝鮮・台湾の日本統治を終える 1945-08-14 に揃える |
| ② 併合 1910-08-23 | **直す**: 変化日を 1910-08-29 へ | 韓国併合ニ関スル条約は 8-22 調印、第 8 条「公布ノ日ヨリ之ヲ施行ス」、8-29 公布（官報号外 条約第 4 号）。それまでは大韓帝国の政府が治めていた。de jure でも主権の移転は施行日 |
| ③ 1945〜72 年の沖縄が日本 | **描き分ける**: 南西諸島を新しい単位「琉球諸島（アメリカ）」に（日本の潜在主権はカードが述べる） | SCAPIN-677（1946-01-29）が北緯 30 度以南（口之島を含む）の日本政府の施政を停止。1952-02-10 トカラ返還（以後北緯 29 度以南＝平和条約第 3 条）、1953-12-25 奄美返還（同日の民政府布告第 27 号の経緯線＝28°N124°40′E–24°N122°E–24°N133°E–27°N131°50′E–27°N128°18′E–28°N128°18′E）、1972-05-15 返還 |

③の線の引き方: IntMap は「その日に誰が治めていたか」を描く（朝鮮（アメリカ）・ドイツ（西側連合国）・台湾 1945〜49 の
中国と同じ規約）。本土の日本政府は占領下でも施政を続けたが、南西諸島ではその施政が停止されていた。CShapes の主権の
規約はカードに述べる（「この輪郭の出典 CShapes 2.0 は主権だけを記録し、これらの島を日本に含めている」）。

**審査して変えなかったもの**（台帳の `examined`）: 南千島が無いこと（穴。形の出典が要る）／小笠原・大東・トカラ（ポリゴンが
無いので移せない）／南樺太の調印日（1905 年 7 月に日本は既に樺太を占領・統治しており、調印日は統治の日より遅くない）／
台湾 1945〜49 の中国（施政で描いている。8-15〜10-24 の 71 日は CShapes の帝国終焉日）。

## 2. 作った——事例の分岐ではなく、判定の台帳とそれを当てる 1 つの関数

- **`scripts/cshapes/review.json`**（`scripts/histclio/review.json`・`scripts/histcourse/courses.json` と同じ作法）:
  `edges`（変化日の移動）・`ground`（島のポリゴンをある期間だけ別の記録へ。`within` に外環の全頂点が入るポリゴンだけを
  動かし、一部だけ入るポリゴンがあればビルドが止まる＝陸地を切らない）・`units`（CShapes に無い単位。7401 は IntMap の
  符号で GW 符号ではない）・`notes`（読者への説明行 en+jp）・`examined`。各判定は `history` と出典を持つ。
- **`scripts/build-cshapes.mjs --review`** が束に当てる。**冪等**（2 回目は何も変えない）で、`--check` は台帳を束に
  もう一度当てて 1 バイトも変わらないことと、各判定を束の上で測る（元の記録が期間中にその土地を描いていない・受け取る
  記録が期間を切れ目なく覆う・変化日が施行日にあり上流の日に無い・判定ごとに註がある）。`--precision-only` と
  再生成の比較も台帳を当ててから行うので、焼き直しで判定が黙って戻らない。
- ⚠ **1 つの土地は期間中 1 つの写し**: 1920-02-02〜09-01 のソ連行だけ島の粗い写し（精度更新で保持された行）を持って
  いて、行ごとの写しを渡すと日本が 1920 年に 2 回「描き直され」、`data/on-this-day.json` に存在しない出来事が出た
  （初版で実測）。受け取る記録は最も頂点の多い写しを期間中通して使い、使われなくなった粗いリング 7 本は落として
  リングプールを詰めた（`data/border-coast.js` はリング番号で印を持つので作り直した——海岸だけのリング 7 本が減った）。
- **読み手**: 註は束のトップレベル `review.notes` に載り、`js/hist-bundles.js` の head（丸ごとでもタイルでも同じ head）で
  ページへ届く。`js/time-borders.js` は `_csNotesOn` で輪郭に `_csNoteEn/_csNoteJp` を掛け、`typeNote` がカードの説明行に
  出す。註の期間が記録の辺で始まらないとき（大韓帝国の 8-23〜28）はキャッシュの鍵の軸に入れる（`_csCutList`。
  名前規則の軸と同じ。初版の鍵では 8 月 1 日を先に訊くと註が漏れる形だった）。「Ryukyu Islands (USA)」は
  `_CS_ERA` の規則と地名表（琉球諸島・en+jp）で「琉球諸島（アメリカ）」と書かれる。
- 依存する束を作り直した: `data/hist-borders-late.js`（OHM − CShapes。日本の行が 306→299 に。南千島の残りは同じで、
  CShapes 側の切れ目に合わせて割れていた行が合わさった）・`data/hist-clio.js`／`hist-eras-rest.js`（形は 1 バイトも
  変わらず `basis` だけ）・`data/hist-courses.js`（`basis` だけ）・`data/border-coast.js`・`data/hist-fidelity.json` ほか 2 本・
  `data/on-this-day.json`（1946-01-29・1953-12-25・1972-05-15 の出来事が加わり、1945-08-15 に日本の描き直し）。

## 3. 2 つの読み手（historical-verification §2b）

国境線は束（`data/cshapes.js` → `js/time-borders.js`）と、ビルドがそこから切るタイル（`dist/data/hvt`。同じ head と行）で
描かれる。OHM のベクタタイル（`js/hist-scale.js` `ohmFilter`）は admin_level 3 以上＝**地方区分だけ**で国境を描かない。
その地方区分の側に**別の所見が 2 つ**ある（今回は直していない・地方区分の記録の主題）:
- 1900 年の北千島に地方区分が無い（`hist-admin-recon` の北海道は択捉を含むが北千島を含まない）。
- `data/hist-admin-fill.js` の「Okinawa」行が 1945-11-26 から現在まで続き、1960 年の奄美大島も覆う（奄美は 1953 年から
  鹿児島県。1946〜72 年の沖縄県は存在しない）。

## 4. 残したもの

- CShapes は**すべての変化を調印日で**記録する（codebook §3）。施行日が後の変化はほかにもありうるが、今回は所見の 1 件だけを
  判定した。見つける道具（Wikidata の発効日と CShapes の辺の突き合わせ）はまだ無い。
- 点で帰属を引く道具は作業用で、`hist-fidelity --year` は重心で数える——島の帰属は列挙できない。

## 5. 検査

`tests/cshapes-review-findings-checks.test.mjs`（8 件・ビルダーの関数、束、`politiesAt`、ページのモジュール、`hist-bundles` の head を
評価）。ゲート: `check:cshapes`・`check:histborders`・`check:histfidelity`・`check:histeras`・`check:histclio`・
`check:bordercoast`・`check:histnames`・`check:wars`・`check:elections`・`check:static`・`check:docs`。束に触れる既存の検査
22 本（371 件）も緑。
