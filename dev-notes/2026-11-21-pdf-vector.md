---
title: Atlas の PDF を「ページ画像＋透明文字」から、文字も図形もベクターの PDF に作り直した
date: 2026-11-21
newsen: Atlas's PDFs are now real vector documents — text and shapes stay sharp at any zoom, and only maps and charts are pictures.
newsjp: Atlas が作る PDF の文字と図形がベクターになりました。どれだけ拡大してもぼやけず、画像なのは地図とグラフだけです。
---

〈依頼〉`file.create` の PDF は、ページ全体を 144dpi の JPEG にして透明文字を重ねていた。拡大すると粗く、ページ数に比例して重く、
カードにも「文字は画像」と書くしかなかった。リポジトリに CJK フォントは無く、同梱もしない（ライセンス・サイズ）。

## 1. 方式
- **字形は利用者の端末のフォントから取る。** `js/file-glyph.js`: 文字を 192px で canvas に描き、アルファ場から **marching squares（0.5 の等高線・
  線形補間でサブピクセル）→ Douglas-Peucker（許容 1.0/1000em）** で輪郭を取り、1000 単位/em の閉パスにする。
  `glyphOf(ch, style) → { adv, path }` が書き手との契約で、node のテストは決定的な偽字形を渡す（canvas 側は `canvasGlyphOf`）。
- **`js/file-pdf.js` の書き手**: 文字は **Type3 フォント**（グリフ手続き＝even-odd の塗りパス・`d1`）。スタイル別（通常／太字／等幅）に分け、
  1 フォント 255 字までで複数フォントへ。各フォントに **ToUnicode** を付けるので検索・選択・コピーは従来どおり。
  グリフ幅は layout の `measure` に合わせた水平拡縮（Tz）で、画面の組版と一致。矩形・罫線・色は `re f` / `m l S` のベクター。
  **画像（グラフ・地図）だけ** XObject（JPEG・同一画像は 1 回）。ストリームは Flate（`CompressionStream`）。
  ページ飾り（箇条書きの記号・番号・フッタ・繰り返しの表見出し）は `/Artifact` で包む。
- ブラウザ側 `js/atlas-file-make.js`: ページ画像の描画（`pageJpeg`）を廃止し、`glyphOf` / `imageOf` / `deflate` を渡す。`missingGlyphs`（豆腐検出）は維持。

## 2. 何を消し、何が引き継いだか
| 消したもの | 引き継いだもの |
|---|---|
| ページ画像（`pageJpeg`・144dpi・`SCALE`）と page 画像の JPEG マーカー検査 | 実在する図（グラフ・地図）の画像 XObject と JPEG マーカー検査。文字は輪郭そのもの |
| 透明文字層（`3 Tr`・CID Identity-H の 1 本のフォント） | 可視の Type3 文字＋ToUnicode。`verifyPdf` が**ページの描画が指すフォントを通して**復号し、文書の全文字と照合（`/Artifact` は除外） |
| 「ページの文字は画像」というカードの注記 | 「文字と図形はベクター、字形はこの端末のフォント、地図・グラフは画像」（en+jp） |
`verifyPdf` は非同期になった（Flate を `inflate` で読む）。新しく見る: Type3 の CharProcs 数＝Widths 数＝ToUnicode 数＝LastChar、各手続きが `d1` で始まり
パスが閉じて `f*` で終わること、画像の数。

## 3. 測った（2026-11-21、ブラウザ pane の実 Chromium）
- 1 ページ（見出し・箇条書き・表・引用・コード・出典・鬱龍驫麤）の PDF: **新 93.6 KB／従来のページ JPEG 約 101 KB＋文字層**。長文 4 ページ＋画像: 78 KB。
  生成は 1 ページ約 0.8〜2 秒（冷えた初回は字形のトレースで数秒）。
- Chromium 内蔵の PDF 表示器（PDFium・別の描画系）で開き、見出し・表・出典・リンク・画像・日本語が崩れず読めることを目視（88%）。
  ⚠ 表示器の拡大操作は埋め込みフレームからは触れず **実際の 800% 表示は目視していない**。代わりに、トレースした輪郭を 400px の em（10.5pt の約 30 倍）で
  塗り、フォント自身の raster と重ねた一致度（IoU）: 平均 **0.987**（太字 0.989）。最初は 0.91〜0.94 で、サンプル中心（+0.5px）のずれを直して 0.97〜0.99 になった。
- **別の読者 pdfjs-dist 3.11**（node）で、偽字形の PDF を開き、全 1 ページ・しおり 2 件・本文の文字が欠けなく抽出されることを確認。⚠ pdf.js は `/Artifact` を除外せず、
  箇条書き記号とフッタ「1 / 1」も抽出する（Word の PDF と同じ挙動。`verifyPdf` は除外して比べる）。実ブラウザ生成の PDF 自体を pdf.js に通すのは未実施（バイトを
  node へ持ち出す手段が無かった）。
- **Office（docx/pptx/xlsx）**: LibreOffice・Word は無いので描画は確認できない。代わりに別の読者で: 全 XML パート（docx 8・pptx 20・xlsx 8）を xmldom で整形式検査（問題 0）、
  docx を **mammoth** で HTML に変換して見出し 2 階層・箇条書き・番号リスト・表（見出し行）・ハイパーリンクが構造として出て、文書の全文字が取れた、pptx と xlsx を **officeparser** で読んで
  スライドごとの本文・表・出典が出た。⚠ **確認できていない範囲**: Word/PowerPoint/LibreOffice での配置・余白・フォント代替・スライドのはみ出し、スタイルの見た目。

## 4. 限界
- 字形は「その端末のフォントを 192px で読んだ輪郭」（精度は約 1/1000em）。フォントが無い字は従来どおり `missingGlyphs` が検出して失敗にする（描かない）。
- 折れ線の輪郭（曲線への当てはめはしていない）。許容 1.0 で IoU 0.987、0.7 にするとファイルが約 3 割増えたので採らなかった。
- 別端末で開いても同じ見た目だが、**字形を作った端末のフォントの形**になる。

## 5. 回帰
`tests/file-deliverables-checks.test.mjs`: PDF の往復（圧縮・非圧縮）・ベクターであること（Type3・`d1`・`f*`・`re f`、ページ画像と `3 Tr` が無い）・255 字超で複数フォント・画像 1 回・
長文のページ分割/表見出し/巨大行・壊したときの失敗（xref・文字・ページ数・画像数・塗りの欠落・ToUnicode の欠落）・marching squares が輪の 2 輪郭を 1px 未満で返すこと。

## 6. 起動費用の天井を上げた理由（check:perf・2026-11-21）
`file.create` を main へ載せたことで、**一度も読まれなければ起動に響かない** async 側が増えた。測った増分（build の dist）:
- 新しい async チャンク `atlas-file-make`（書き手 file-doc / file-pdf / file-glyph / file-office / file-text を含む）**64.8 kB**。能力が呼ばれたときだけ読まれる。
- `atlas-cap-runs` +14.0 kB（`file.create` の run）、`atlas-console` +22.1 kB（能力表・catalogue の `file.create` の説明）。
- 合計 async.raw 14376→14552 kB・async.gzip 4865→4911 kB・dist.assets 21797→21989 kB。残りの増分は、天井を記録してから main に入った他の作業の分（`gis-pipeline` 11.2 kB・`imagery-atlas` 3.6 kB ほか。main の CI が merge 後に記録し直す）。
- 起動時に読まれる経路（main の entry / startup の行）は増えていない（`check:perf` の startup の行は超えていない）。`node scripts/perf-budget.mjs --update` が上げたのは超えた 5 行だけ。
⚠ この checkout には `data/hist-eras.js` と `data/border-detail/` が無く（git の外・data:pull）、build の最後の `intmap-history-pages` は失敗する。JS のチャンクは出力済みで上の数字はそこから取った。データ由来の 2 行（border-detail・hist-eras が dist に無い）は環境起因で、CI では出ない。
- 2026-11-23 に main を取り込んだあと、main 側が天井を上げ直していたため、同じ内訳（`atlas-file-make` 64.8 kB・`atlas-cap-runs` +7.6 kB・`atlas-console` +11.2 kB が **main の最新の天井に対する超過分**）で 4 行だけ上げ直した（async.raw 14487→14579 kB・async.gzip 4890→4921 kB）。新しい理由は無い。
