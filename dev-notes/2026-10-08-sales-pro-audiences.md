---
title: 共有パネルに「引用」タブ——図の下の出典表記・参考文献 5 形式（APA・Chicago・SIST 02・BibTeX・RIS）・その日の国境を形ごとの記録とライセンスつき GeoJSON で。国境の記録のライセンスを値にしてオープンデータのカタログに載せる
date: 2026-10-08
newsen: Share now has a Cite tab: the credit line to put under a published map, a reference in APA, Chicago, SIST 02, BibTeX or RIS, and — on a past date — that day's borders as GeoJSON, every shape with its record, dates and licence.
newsjp: 「共有」に「引用」タブを追加しました。掲載する地図の下に入れる出典表記、APA・Chicago・SIST 02・BibTeX・RIS の参考文献、過去の日付ではその日の国境の GeoJSON（形ごとに記録・日付・ライセンスつき）を作れます。
---

〈依頼〉第 3 波の営業担当（報道機関・研究者・開発者）。「全権を委任する。今を見てやるべきことを考えろ」——監査ではなく、
記者・研究者・開発者が IntMap を自分の仕事に組み込み、**出典として引用する理由を製品の中に作る**。外部への発信はしない。

## 0. 測った（何が欠けていたか）

- **引用の形が 1 つも無かった。** 共有パネルはリンク・埋め込み・画像。出典は地図の隅に印字されるだけで、
  記事の図の下に貼る 1 行も、論文の参考文献も、読者が自分で組み立てるしかなかった（`cite`・`BibTeX` を js/ で
  全数検索して 0 件）。研究者向けページの FAQ は「API はあるか」に「製品としては無い」と答えていたが、
  `api/v1/` と埋め込み API は既にある（文書が実態より古かった）。
- **IntMap にしか無いもの——線ごとの根拠のある歴史の国境——だけが持ち出せなかった。**
  `node scripts/public-api.mjs --stats`（2026-10-08）: `hist-borders`・`hist-borders-late`・`hist-clio`・`hist-eras`・
  `hist-eras-rest` はすべて **withheld «licence-not-stated — stated-only-in-prose»**。ライセンスが束の `src` の文の中に
  しか無く、カタログの語彙（`LICENCES`）は GPL-3.0 を知らなかった。

## 1. 作ったもの

- **ライセンスを値に**（`scripts/build-hist-borders.mjs`・`build-hist-clio.mjs`・`build-hist-eras.mjs` の `GOVERNANCE`）。
  合成されたファイルは上流を全部名指す: Cliopatria の行は Cliopatria のもの（CC BY 4.0）だが、**輪郭は OHM と CShapes が
  述べる土地を除いた残り**なので、その 2 つを `contributes:'outline'` として、CShapes には `rowsFrom:'1886-01-01'`
  （それより前に終わる行は CShapes に切られていない）を付けた。同じ土地をどちらが描くかも `priority` に書いた
  （台帳の `precedence.*` を増やさないため——`--update` の差分は縮むだけ）。CShapes の引用文は
  `build-cshapes.mjs` の `GOVERNANCE.cite` に値として移し、`CITATION` はそこから作る。
- **カタログ**（`scripts/public-api.mjs`）: 語彙に GPL-3.0（出典表示・継承・営利可）、上流の `cite`／`contributes`／`rowsFrom`
  を通す（`read()` の語彙の外なので、同じ上流の原文から位置で取る）、出さない項目にも `paths`。
  結果: 国境の 5 ファイルが載る（`hist-borders` CC0・`hist-eras` GPL は営利可、`hist-clio`／`hist-borders-late` は
  CShapes を含むので非営利の条件つき）。
- **`js/border-extract.js`**（純関数）: 描いている形ごとに、線のカードと同じ答え（`IntMapTimeBorders.provenanceOf` =
  `_provSide`）と、指紋が一致するときだけ索引のリレーション・タグ原文・誰が述べたか。条件は**形の行のファイルで
  カタログの項目に結び**、上流を行ごとに当てる。IntMap は営利なので、全上流が営利可なら輪郭つき、輪郭だけが非営利に
  切られたなら記録だけ（`geometry:null`）、行そのものが非営利（CShapes 2.0）なら件数・名前・入手先だけ。カタログが
  読めなければ何も出さない。表は書いていない（記録のライセンスが変われば、このファイルを触らずに出すものが変わる）。
- **`js/map-cite.js`**: 共有パネル 4 つ目の「引用」タブ（遅延チャンク）と `IntMapShare.cite()`。出典は絵葉書と同じ
  `mapCredits`、日付の精度も同じ `clockReading`（`js/map-recorder.js` から切り出して両者が読む）。APA は発行年を作らない（n.d.）。
- **Atlas `cite`**（`panel.cite`）: 同じタブを開き、出典表記・指定形式の参考文献・GeoJSON に入る件数と除いたもの・
  引用するデータを結果に載せる（保存は読者の押下）。
- 公開ページ: 報道・研究のタイル 3 枚ずつ、研究 FAQ の「どう引用するか」「API はあるか」（実態に合わせた）、開発者ページに
  「ある日の国境を、形ごとに」。利用規約 §12（保存したデータは形ごとの条件に従う・非営利の形は含めない）、出典ページの
  OHM／Cliopatria／historical-basemaps／CShapes の行。営業資料（`docs/sales/`）: 提案書に開発者の区分、FAQ 4 行、
  **外へ出す文の下書き `outreach-drafts.md`（承認待ち・未送信）**。

- **共有窓口に 1 本の読み**（`check:surface`）: `js/map-cite.js` が `window.IntMapTimeBorders` を読む（28 → 29）。持ち主は
  `js/app-body.js` が組む実体で、`js/time-borders.js` が export するのは工場（`timeBorders(HOST)`）だけなので import できない
  （`node scripts/module-graph.mjs --plan` も持ち主を app-body と述べる）。年鑑（`js/year-book.js`）と同じ読み方で、`--update` で記録した。

## 2. 史実との照合（年と場所を名指して）

- **1850 年 7 月 1 日・全世界、OHM の束から**（`tests/sales-pro-audiences-checks.test.mjs` ④）: その日に有効な行はすべて
  CC0 で輪郭つき、95% 以上が索引の指紋でリレーションに結べる。日本の範囲（128–146°E, 30–46°N）に絞るとアンデスの
  政体は入らない。
- **1914 年**（ビルドしたページで計測。1500 年 536 形すべて輪郭つき／1850 年 384 形すべて輪郭つき／1914 年 338 形のうち記録だけ 63・CShapes 275）: CShapes が描く主権国家は件数と名前だけ。1886 年以降の Cliopatria と OHM の継ぎ足し（コンゴ自由国の
  後継・ドイツ領東アフリカなど）は記録だけで輪郭なし。ファイルのライセンスに NC は 1 つも入らない。
- ⚠ 否定した見立て: 「1886 年以降の Cliopatria も輪郭ごと出せる」——束の `src` 自身が「CShapes（1886–2019）が述べる土地を
  除いた」と言い、`border-provenance-ohm.json` の後継ぎの行も `endBasis:'cut-cshapes'` を持つ。輪郭の辺は CShapes の線である。

## 3. 残したこと（利用者の判断が要る）

- **ブラウザの spec は木に入れていない。** 書いて緑（1 回の起動で 1850 年の引用・保存したファイルの中身・1914 年への移動、15.1 秒）だったが、
  全件の時間がちょうど上限（5,250 s）にあり、足すと 15 s 超える。上限は上げない方針で、古い記入値の測り直しで余地を作る作業が
  別に進んでいるので、それまで退避した。純関数と実データ（1850 年の世界）の検査は node 側で通っている。
- **日付を移る途中の形に新しい日付が付いていた**のを spec が見つけた: `drawnAt` は go() が呼ばれた瞬間を返し、新しい集合の
  読み込み中は前の年の形に次の年の日付が付いた。いま画面にある集合が答える瞬間（`_drawnWhen`、apply のときだけ書く）を返すようにした。

- 既存のカタログは非営利（NC）の条件のデータセットも「NC 付き」で出している（`cshapes`・`health`・`on-this-day` ほか）。
  今回の値の記述で `hist-clio`・`hist-borders-late` も同じ扱いで載った。「IntMap は営利、非営利の典拠は再配布しない」を
  カタログ全体に通すなら、NC を出さない規則への変更は既存の縮小なので提案に留める。
- CShapes 2.0 を地図に使い続けるかは別の見直し（memory `intmap-commercial-service-licences`）。差し替えれば、この
  抽出は記述を読むだけなので 1886 年以降も輪郭つきで出せるようになる。
