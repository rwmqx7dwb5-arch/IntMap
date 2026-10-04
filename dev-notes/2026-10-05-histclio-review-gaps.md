---
title: 1 つの名前に 2 つの寿命がある政体を表せなかった——Cliopatria の審査に「間（gaps）」を足し、ナジュド首長国の 1892–1901 を外した
date: 2026-10-05
newsen: Historical borders no longer name the Emirate of Nejd between its fall in 1891 and Ibn Saud's return in 1902; the shape stays and its card gives both years.
newsjp: 歴史地図で、1891 年の滅亡から 1902 年の Ibn Saud の帰還までの間、ナジュド首長国の名前を描かなくなりました。形は残り、カードが両方の年を述べます。
---

〈依頼〉`scripts/histclio/review.json` の `rows` は始まり `s` と終わり `e` しか持てず、同じ名前の下に
2 つの寿命があってその間がどちらでもない政体を表せない。間の形（`gaps: [[from, to]]`・天文年・両端を含む）を
足し、`applyReview`・カード・`check:histclio` に対称に通し、ナジュド首長国とハイチ帝国を史実で審査し直す。
前提の clio-lifespan-review（#991 の上に積まれた未 push の commit）がまだ main に無いので、その上に積んだ。

## 0. 測った

- **ナジュド首長国**: Cliopatria は «Emirate of Nejd» を 1824–1925 で途切れなく描く（上流の行も、出荷した行も）。
  QID Q146862 は第二次サウード王国で、Wikidata は 1818–1891 と述べる（所見は終わり側: 描かれた 1925 対 1891）。
  前回の審査はこれを `refuted`（other-identity）に置き、「1891–1902 の間は表せない」と書いていた。
- **ハイチ帝国**: 上流は «Empire of Haiti» を **1805–1915 で途切れなく**名指す（Wikipedia の欄は
  «First Empire of Haiti»・Q2006756 は 1804–1806）。⚠ ところが**出荷データには 1 行も無い**——その年の
  イスパニョーラ島は OHM（〜1885）と CShapes（1886〜）が述べ、合成がその土地を Cliopatria から引いている。
  よって所見も無く、前回の審査にも現れていなかった。

## 1. 史実（historical-verification.md §2-2）

- 第二次サウード王国は 1891-01-21 の Mulayda の戦いでラシード家に敗れて滅び、Riyadh はハーイルから統治された。
  Ibn Saud が Riyadh を奪還したのは 1902-01-13。その国（Riyadh とナジュドの首長国、1913 年からナジュドとハサー、
  1921 年からナジュド・スルタン国）が、Cliopatria が同じ名前で 1925 年まで描く 2 つ目の寿命である。
  ⇒ `gaps: [[1892, 1901]]`（1891 年と 1902 年は名前を描く）。
- ハイチ第一帝政は Dessalines の即位（1804）から暗殺（1806-10-17）まで。その後は北の State／Kingdom of Haiti と
  南の共和国、1820 年に共和国として統一。Soulouque が 1849-08-26 に第二帝政を宣し、1859-01-15 に退位。
  ⇒ `e: 1859, gaps: [[1807, 1848]]`。**今日は効かない判定**（行が出荷されていない）で、合成の条件が変わって
  Cliopatria の行がこの島に残ったときに効く。

## 2. 何を変えたか

- `scripts/build-hist-clio.mjs`: `reviewZones(R)` が審査行の時間軸を区間に切る（`start`・名前を描く・`gap`・
  `end`）。`applyReview` はそれで各行を切るだけになり、ビルドと門が同じ切り方を使う。外した行は
  `ws: 'gap'`・`wy` = 前の寿命の最後の年・`wz` = 次の寿命の最初の年を持つ。`circa` は間には付けない。
  `judgedSides` は `gaps` を**終わり側**の審査として数える（所見「項目の終わりより後に名前が描かれている」への
  答えは「項目はそこで終わり、間の後は 2 つ目の寿命」だから）。`e` と両方あっても 1 回。
- 門（`--check`）: `gaps` は整数の年の組で `from ≤ to`・順に並び互いに接せず・`s`〜`e` の内側（接していれば
  それは始まりか終わり）／間に名前を持つ出荷行が無い／外された出荷行の側と年がどれも `rows` の述べるもの
  （逆向きの照合。前回まではこの向きが無かった）。⚠ 実際に review.json を壊して確かめた: 間を 1903 年まで
  広げると「1902–1905 が間の中で名前を持つ」と「1891 の間を述べる行が無い」が、`[[1901, 1892]]` では形の検査が落ちる。
- `js/time-borders.js`: `clFC` が `_wYear2` を運び、`blankNote` が「史実はこの政体に断絶を置く——A に一度
  終わり、同じ名の政体が B に再び興った。そのためその間はこの名前を描かない」と述べる（en + jp のみ・
  CONSTITUTION §7）。枚の集計の `withheld` と `_withheldNote` も側が 2 値だという前提を外した。
- `scripts/histclio/review.json`: ナジュド首長国を `refuted` から `rows` へ、ハイチ帝国を `rows` に足した。
  ビルド後 80 所見・60 行で名前を外し・74 反証・0 pending。`data/hist-clio.js` は 12,911 → 12,913 行
  （ナジュドの 2 行が間の境で切れた）。`data/hist-eras-rest.js` は基礎の sha256 だけが変わった。
  `data/border-coast.js` と `data/hist-fidelity.json` は再生成して差分なし。

## 3. 残したもの

- ⚠ **間の後の行は、まだ第二次サウード王国の QID（Q146862）と Wikipedia の «Emirate of Nejd» を持っている。**
  2 つ目の寿命の項目は Wikidata の「第三次サウード王国」Q2011891（1902〜）だが、QID の決定
  （`verifiedQid`）は名前ごとに 1 つで、寿命ごとに分ける仕組みが無い。名前は正しい年にだけ出るようになったが、
  1902–1925 年の行の識別子は別の政体を指したまま。直すには QID を寿命（区間）ごとに持たせる構造が要る。

- 土台の 90dd7681（Q528546 を名前表の識別子欄から落とした再生成）で、`data/histnames.json` の訳語は
  13,612 → 13,624（`.md` が数える 2 記録分は 13,460 → 13,472）、識別子は 1,246 → 1,245 に動いたが、
  9 つの出典ページと `docs/architecture/07-map.md` の数が追従しておらず `check:docs`（`npm test` 内）が赤だった。
  実体に合わせた。⚠ Q528546 の 8 語を落としたのに総数は **12 増えている**——ff7c2eec と 90dd7681 の表を
  行ごとに比べると、Q528546 の 8 語が消え、Q170072・Q179876・Q62651 が各 5 語、Q29 が 3 語、Q769・Q354307 が
  各 1 語増えていた（計 −8 ＋20）。再生成が識別子欄の他の行も取り直した結果で、増えた語の中身は確かめていない。

## 4. 検査

`npm run check:histclio`・`check:histfidelity`・`check:bordercoast`・`check:docs` 緑。
`tests/hist-coverage-expansion-checks.test.mjs` に ④c（`reviewZones` の切り方・`judgedSides`・ナジュドが 1891 と
1902 に在り 1892/1895/1901 に無い・外した行の `gap 1891/1902`・ハイチの判定と出荷行が無いこと・カードの英日の文）。
