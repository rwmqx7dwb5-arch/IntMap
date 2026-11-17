---
title: 地図に浮かぶ操作類を「見えている地図」1 つの枠に入れた——パネルを避ける個別の規則と検索バーの監視 JS をやめ、ズームもパネル開閉も「枠の幅が変わった」1 つにした
date: 2026-11-17
newsen: The search bar, the map buttons and Chronos now stay on the part of the map you can see at any browser zoom, with the side panels open or closed; on a narrow map they fold into compact buttons instead of sliding under a panel.
newsjp: ブラウザを拡大しても、左右のパネルを開いても、検索バー・地図のボタン・Chronos が見えている地図の上に収まるようになりました。地図が狭いときはパネルの下に潜らず、小さなボタンに畳まれます。
---

〈依頼〉右サイドバー（レイヤー一覧）を開いた状態でブラウザのズームを大きくすると、地図上部の検索バーと下部の Chronos が崩れる。以前から何度も右サイドバー開閉時のボタン類の問題があった——直すなら根本的に。合意: 地図の列を唯一の基準にして作り直す。上下の帯へ移すのは最狭の段だけ。

## 0. 測った（変更前・ビルドした本体・ズームは CSS ビューポートの幅として再現）

| 状態 | 観測 |
|---|---|
| 1152×720（1440 画面の 125 %）・左フロスト開・右開 | 検索欄 436–1138 px、右パネルは 852 から。`elementFromPoint`（検索ボタン中央）＝レイヤー一覧のタイル |
| 同・左は不透明（地図の横）・右開 | 同じ。Chronos は 293 px から＝左パネル（0–400）の下 |
| 1440×900・左フロスト開・右閉 | 検索欄 721–1119 とスタック 1115– が 4 px 重なる |

原因は構造: 浮かぶ部品はそれぞれ**地図キャンバス全体**を基準に置かれ、乗っているパネルを 1 つずつ避けていた——右パネルは `body.lsr-open … right:calc(var(--lsr-w) + …)` が 4 部品ぶん、左のフロストは検索の中央寄せ 2 規則と座標表示 2 規則、さらに検索は JS（`js/mobile-ui.js` の #R21〜#R252 の監視）が両パネルとスタックの行を測って `--ms-left`／`--ms-right` を `position:fixed` の欄に書いていた。その監視の「上の行に収まらないなら全幅で下へ」の分岐が右パネルの幅を引かずに右端を決めたのが今回の絵。ズーム・パネル幅・言語のどれかが変わるたびに、規則の知らない場合が生まれる形だった。

## 1. 直した構造

- **`.map-frame`（index.html）＝見えている地図。** 検索・右上スタック・ツールパネル・衛星パネル・座標表示・Chronos をこの中へ移した。枠の左端はフロストの左パネルが地図に乗っている間だけ `--sidebar-w`、右端はレイヤーパネルが開いている間だけ `--lsr-w`。**パネルを知る規則はこの 2 つだけ**。枠はサイズコンテナで、ズーム・窓の幅・パネルの開閉は全部「枠の幅が変わった」になる。
- **上段はグリッド** `minmax(0,1fr) minmax(0,380px) minmax(max-content,1fr)`。スタックの列は内容幅を下回らないので、検索は構造上スタックに潜れない（余裕があれば中央、無ければ左へ寄る）。
- **下端は 1 行**（`.map-frame-bottom`）: 左に座標表示、右に Chronos。並ばない幅では `wrap-reverse` で Chronos が 1 段上へ。
- **狭い枠は形を変える**（コンテナクエリ）: 560px 未満で検索はボタンに畳む（空のまま押すと欄が開く・文字がある間は開いたまま）、2 つの表示ピルは新しい `#btn-view-menu` のメニューへ、Tools／Share は字を落とす（title が名前を持つ）、閉じた Chronos は副題を落として 1 行。360px 未満ではツールの行を縦にし、開いた検索は上段を全部使ってスタックを 1 段下げる。帯は作らなかった（縦に積むだけで足りた）。
- 年のレール（`thinPeek`）は窓の `resize` でしか印を間引き直さなかった。幅はもう枠のものなので、レール自身の `ResizeObserver` にした。
- 検索ボタンの「空なら欄にカーソル」は携帯だけだった。畳んだ欄はボタンだけなので、全端末で同じ規則にした。

## 2. 消したものと、引き継いだもの（substance-over-form）

| 消したもの | 何が同じだけ働いているか |
|---|---|
| `body.lsr-open:not(.ws-mode)` の `.map-controls-top`／`#tool-panel`／`#sat-controller`／`.news-timeline` の `right:calc(var(--lsr-w)+…)` と `transition:right` | 枠の右端 `right:var(--lsr-w)` と枠自身の `left`/`right` の遷移 |
| 検索の中央寄せ 2 規則（`--sidebar-w`／`--lsr-w` からの計算）・`min-width:170px`・`max-width:calc(100% - 330px)` | 上段グリッドの中央列（最大 380px）＋コンパクト段 |
| `body.ms-narrow`（fixed 配置）・`body.ms-hide` と、それを書く `js/mobile-ui.js` の監視（約 110 行） | グリッド（重ならない）・枠の端（パネルの下へ行かない）・コンパクト段（潰れない）・枠の遷移（スライドに追従） |
| `body.sidebar-glass .coord-readout{left:calc(var(--sidebar-w)+12px)}` と折り畳み時の 12px | 枠の左端＋下端の行（隅から 6px。Chronos と同じ余白） |
| `const mob=` と「携帯だけ」の空押し条件 | 全端末で同じ空押し規則 |

到達経路は減っていない: 5 つの表示ボタンは id もハンドラも同じ（Atlas・ショートカット・テストは直接押す）。携帯（≤768px）は枠が `display:contents` なので、シートへの貸し出し（`rememberHome`）を含め以前のまま。ワークスペースモードはコンパクト段を当てず、`js/workspace.js` の固定配置がそのまま効く。

⚠ 枠は z-index を持つ（`--z-controls` + 1）。#R253 の帯でサイドバーが基準値へ下がったとき、枠の中の部品がサイドバーより上に来るため。`IntMapStack` の前面印は、検索結果を押すと枠に付く（中の部品は枠の外の文脈と競えないので、競う場所＝枠へ印が上がる——front-mark-outer-context の規則どおり）。

## 3. 検査

- 新 `tests/map-chrome-layout.spec.js`: 1440 画面の 100/125/150 %、1920 画面の 200 % × 左パネル（閉／横／フロスト）× 右パネル（閉／開）× 明暗で、①枠と窓からはみ出さない ②開いたパネルと交差しない ③検索とスタックの各行・Chronos が交差しない ④各操作の中央の `elementFromPoint` がその操作。⑤ 1440 の 200 %（720×450）は携帯レイアウト ⑥ 畳んだ形でも同じ操作に届く。
- 監視 JS を前提にしていた検査を、守っていた欠陥のほうで言い直した: `chrome-overlap-checks`（#R484）・`shell-compass-controls-checks`（#R480 ⑤）・`shell-map-input-checks`（#R252 ⑥）・`shell-css-surface-checks`（#R309 ⑤）・`sidebar-layout-checks`（#R160 B5）・`map-a11y-structure.spec`（⑤ は狭い枠＝コンパクト段で、⑥ は印が枠に付く）。`z-layers-baseline.json` は `--update`。

## 4. 残したこと

- データ凡例（`js/data-layers.js` が JS で置く）と国情報カード（`.country-info`）は、まだフロストの左パネルを個別に避けている（`--sidebar-w` + 24px）。同じ形の欠陥なので、枠の左下へ入れるのが次の一歩。
- 枠 560／360px の段は英語のスタック幅の実測（1440×900 で 315px）から決めた。幅の広い言語では段の中で検索が細くなるだけで、重なりはグリッドが防ぐ。
