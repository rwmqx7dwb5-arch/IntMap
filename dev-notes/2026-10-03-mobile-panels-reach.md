---
title: スマホで地図の上に浮かぶものを、名前ではなく性質で全部シートと出典の帯の上に収める——火山灰パネルとツアー作成、half に戻した Atlas の見本カード
date: 2026-10-03
newsen: On phones every panel that floats over the map can now be reached with a finger, above the sheet and the credits.
newsjp: スマホで地図の上に浮かぶパネルすべてに、シートと出典の帯の上で指が届くようになりました。
---

〈依頼〉#936 の本番検証（ba7e477・375×812・タッチ）で同じ形の欠陥が 2 件残っていた。1: 火山灰パネル（#ash-panel）は `.country-popup` ではないので規則が効かず、下端が y 812 まで伸び「Run on the live upper-air wind」がシートのつまみ（#sheet-grip, y 740）の下に隠れて押せない。2: Atlas の見本カードを開いたあとシートを half に戻すと、ログインのボタンが y 1088 と画面外に出る。カード 1 種ずつの特例は禁止。

## 0. 測った（前）

| 何 | 前 |
|---|---|
| 火山灰パネル | `#map-container` の子で、そこは**シートより下の積層文脈**。`z-index` が 2212 でも #sidebar の下。電話幅の CSS は `left:0; right:0; bottom:0` の下端シートで、`ash-go` @y740 を `#sheet-grip`、「Method and assumptions」@y791 を `#ms-input` が受けた |
| ツアー作成 | `<body>` 直下・`max-height:calc(100dvh - credit - 28px)`。ボタン 2 つが出典の帯の下（y 721 ＞ 699） |
| 見本カード（half） | `#atlas-panel` は 642〜812 の 170 px、`.atl-ex` は 735 px で**縮まず**、`overflow:hidden` の外側を `scrollIntoView` が動かすだけ。指で動かせる箱が無く、ログインのボタンは y 1088 |
| 地点プロファイル・ラジエーション等 | #936 の規則（`#map-container > .country-popup`）／元から範囲内で緑 |

## 1. 直した（構造）

- **`makeFloatFit`（`js/mobile-sheet.js`）**: <body>・`#map-container`・その列の**直下の子**から「位置が fixed/absolute・描かれている・指を受ける・操作部品を持つ」ものを**全数発見**し、シートの今の上端（`--sheet-cover`）・出典の帯の実測高（`--m-credit-h`）・凡例チップの行の下（`--m-legend-top`）で測る。収まっているものには何も書かない。はみ出すものだけに `data-m-fit`（`cap` 背丈・`dy` `translate`・`scroll`）を付け、CSS が読む。除外は性質で述べる: シート自身の画面・出典の帯（限界そのもの）・画面を覆う箱・**シートと同じ形でシートの上に描かれるモーダルの下端シート**（`<body>` の国カード。描画順は `elementsFromPoint` で読む——z-index の数ではない）・読者が動かしたもの（`data-dragged`）。
- 再測定: `setCover`（シートの段・指で動かす最中）・出典の帯の ResizeObserver・パネルの ResizeObserver・直下の子の増減と style/class/hidden の変化。自分の書き込みは `takeRecords()` で捨てる。
- 火山灰パネルの電話幅の CSS は操作グループの手前（`right:var(--m-legend-right)`）で止める——端から端までだと × が操作グループの下に入った（half で測って判明）。
- **Atlas `.atl-ex`**: `min-height:0; overflow-y:auto`（指で動かせる箱）、カードが開いている間は `.atl-sub` が退く。カードを開いたときに窓へ入れるのはカードの**操作の行**（`full` でも窓は約 360 px・カードは 461 px）。

## 2. 検査

- `tests/mobile-panels-reach.spec.js`（新規・375×812・タッチ）: 浮くものを性質で**発見**（census）し、その全部の操作部品を、本物の指でスクロールしたあとに `elementFromPoint` で自分に当たること・シートと出典の帯の上であることを測る。火山灰（シートを half に動かしたあとも）・ラジエーション・ツアー作成・地点プロファイル・half に戻した Atlas の見本カード。**直す前のコードで赤**: 火山灰（`ash-go` @y740 `covered by #sheet-grip`）・ツアー作成（出典の帯の下）・Atlas（箱がスクロールしない）。
- 段 1: static・i18n・docs・surface・engine・types・testbudget（`tests/durations.json` に 35 s を実測で）。新しい利用者向け文字列は無い。

⚠ 本番では未検証（このツリーでの実測のみ）。
