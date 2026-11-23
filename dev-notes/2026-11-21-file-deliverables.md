---
title: Atlas が実際のファイル(PDF・Word・PowerPoint・Excel ほか)を作って返せるようにした——file.create
date: 2026-11-21
newsen: Atlas can now hand you a real file — a PDF, Word document, slides, spreadsheet, web page, Markdown, text, CSV or JSON — to save or open, instead of asking you to print its answer.
newsjp: Atlas が、回答を印刷するよう頼む代わりに、PDF・Word・スライド・Excel・HTML・Markdown・テキスト・CSV・JSON の本物のファイルを作って、保存・開くボタン付きで返せるようになりました。
---

〈依頼〉「最近の東欧情勢を調査して PDF 化」に Atlas は 4 分 22 秒で本文を書いたが PDF は作らず、印刷操作を利用者に任せた。
情報収集と文章生成はあるのに、成果物を作る能力が実行経路につながっていなかった。のちに「PDF 以外のファイルも」と追加。

## 0. 調べた
- `PRODUCT.md` は PDF・プレゼン生成を「後回し」と書いていた(更新した)。
- #1330(Excel 出力・`js/office-writer.js`)と #1314(`work.job`)は**未マージ**。依存せずに作った。
  #1330 は「データセット→xlsx」、こちらの xlsx は「文書の表→xlsx」で入口が違うが、**ZIP/シートの書き出しは重複する**。
  両方が main に入ったら一本化する(`js/file-office.js` の `zip` / `writeXlsx` と `office-writer.js`)。
- リポジトリに CJK フォントは無い。実行時にフォントのバイトを取る手段もブラウザには無い。

## 1. 作ったもの(1 能力 `file.create` / 部品は形式ごとに分離)
- `js/file-doc.js` 文書モデル(見出し・段落・箇条書き・表・画像・引用・コード・改ページ・出典)と Markdown の読み取り。空の文書は拒む。
- `js/file-pdf.js` 組版と PDF 書き出し。日本語の禁則、見出しの孤立防止、段落の 1 行残し防止、表の見出し行の繰り返し、ページより高い行のスライス、しおり、出典 URL のリンク。
  **(当初はページ画像＋透明文字だったが、同日 `dev-notes/2026-11-21-pdf-vector.md` で文字・図形ともベクターに作り直した。)**
- `js/file-office.js` docx(スタイル・本物の箇条書き・表・画像・ページ番号・ハイパーリンク)/ pptx(見出しごとのスライド・表・画像・出典)/ xlsx(表をシートに・数は数)。
- `js/file-text.js` html / md / txt / csv(BOM 付き・1 表)/ json。各形式が持てないものは `stated` で返し、カードに出す。
- `js/atlas-file-make.js`(lazy `atlasFile`)canvas 描画、グラフ(`chart.compose` の spec を html2canvas で画像化)と地図(`K.VFRAMES`)の取り込み、書き出し後の**読み戻し**、保存・開くカード。
- `js/atlas-cap-file.js` 能力 `file.create`(`makeFile`、別名 makePdf 等)。catalog の `file.create` ブロック・能力表・lazy を同時に登録。

## 2. 「作った」と言う条件(読み戻し)
PDF: ヘッダ・xref の全オフセット・ページ木と枚数・各ページの画像ストリーム長と JPEG マーカー・透明文字を ToUnicode で復号して**文書の文字と全文字照合**・システムに無い字形(豆腐)の検査。
docx/pptx: ZIP の CRC・関係の宛先・コンテンツタイプ・XML 整形式・本文の文字。xlsx: 構造。失敗はカードに赤で出る。

## 3. 測った(2026-11-21)
- 本番相当の build(preview)で `IntMapConsole.dispatch({type:'makeFile',…})` が成功し、カードが返る。
- **別の読者 pdfjs-dist** で同じバイトを開き、1 ページ・日本語本文・しおり・タイトルを取得、描画して見出し・表・出典・フッタが読めることを目視。
- 9 形式すべてがブラウザで `ok`(読み戻しの問題 0)。グラフ(棒)を入れた PDF も `ok`。

## 4. 限界(書いておく)
- docx/pptx/xlsx は構造と文字を読み戻しで確かめたが、**Office では開いていない**。pptx の配置は特に目視が要る(カードにも書く)。
- 画像化の速度は 1 ページ 1 秒未満(測定: 1 ページ + グラフで約 2.5 秒)。
- 保存したファイルの寿命はタブの間(ページを閉じるとカードのボタンは「期限切れ」と言う)。永続化は #1314 の仕事。

## 5. 回帰
`tests/file-deliverables-checks.test.mjs`(10 件): 空文書の拒否・形式名の解決・Markdown・禁則・PDF の往復と**壊したときの失敗**(xref・文字・ページ数・切断)・長い文書のページ分割・表の見出し繰り返し・巨大な行・OOXML の CRC/関係/コンテンツタイプ・CSV の BOM と引用・HTML が script を作らないこと。

## 6. 共有窓口(check:surface)
新しい結合は `window.IntMapVendor` の読み 1 件(html2canvas。スクリーンショットと同じ入口で、vendor.js は export を持たない)。`atlas-file-make.js` は能力から literal の dynamic import で届き、グローバルも lazy-registry の項目も増やしていない。基準線は `node scripts/global-surface.mjs --update` で更新した。
