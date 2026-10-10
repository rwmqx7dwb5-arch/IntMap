---
title: Chronos パネルから開いた「この年を読む」「政体の盛衰」「あの頃といま」が、開いたパネル自身の下に隠れていた——開いた面に「使われているパネル」の印を移す（nightly 3 晩の赤 map-layer-system ②）
date: 2026-10-10
newsen: Fixed: the year book, the rise and fall of a polity and Then & now, opened from the Chronos panel, now appear in front of it instead of underneath it.
newsjp: 修正: Chronos パネルから開く「この年の世界」「政体の盛衰」「あの頃といま」が、パネルの下に隠れず手前に表示されるようになりました。
---

〈依頼〉nightly の deep tier で 2026-10-07 から 3 晩続けて赤だった `tests/map-layer-system.spec.js` ②（「Chronos パネルがその年を 1 ページで読む」）。
再現して止まる場所を確定し、製品の退行なら製品を、検査の陳腐化なら検査を直す。

## 1. 観測した事実

- `npm run build` → `IM_PREBUILT_DIST=1 IM_TIER=all` で単独再現（1280×720）。止まるのは spec の 84 行目、年鑑の「次の年」`.yb-step[data-step="1"]`
  のクリック。nightly（run 37996238625）と同じく「`#ntl-zone`（`.operation-room` の中）が pointer events を横取り」で 1 分切れ。
- `elementFromPoint` で測った重なり: 年鑑 `#yb-sheet` は `--z-sheet` 1650・`top:72 right:12`（886〜1268, 72〜188 から開く）。
  `#news-timeline` は `.im-front` の **2650**（x 934〜1274, y −6〜691）。「次の年」の中心で当たるのは `#ntl-zone`、年鑑の本文（x ≥ 934）は
  全部パネルの下で、見えていたのは左の 48 px だけ。
- 仕組み: 「この年を読む」を押す pointerdown が `js/ui-stack.js` の「使われているパネル」の印（#R253〜）を Chronos パネルに付け、
  2650 へ上げる。その操作が開いた年鑑は 1650 なので**開いたパネルの下に開く**。
- 「いつから」: 本文が隠れていたのは年鑑が出来たときから。2026-10-06 の nightly（01f9fe1d）は ② が 9.0 秒で緑。#1034（時空間の 3 本）が
  Chronos パネルに「あの頃といま」の行を足して 59 px 高くし（実測: その行を消すとパネル上端 −6 → 53）、覆いが年鑑の見出しの
  ボタンの中心まで届いたので、テストのクリックが通らなくなった。10-09 の「政体の盛衰」（2cc69613）でさらに 1 行伸びた。
- 同じ形は他に 2 つ: 同じパネルから同じ位置・同じ層に開く「政体の盛衰」`#pa-sheet`、`--z-window` の比較ウィンドウ（「あの頃といま」）。
  修正前の実測で比較ウィンドウの 9 点中 6 点がパネルに当たった。

⇒ 検査の陳腐化ではなく**製品の欠陥**（利用者も押せない・読めない）。

## 2. 直したこと

- `js/ui-stack.js` に `opened(el)`: 操作が開いた面へ印を移す——ジェスチャの中と同じ規則（`panelOf` で閉じた重なり文脈なら外側へ）、
  帯より上の層（ダイアログ）には付けない（#R508、付けると沈む）。
- 開く側が 1 行で述べる: `js/year-book.js`・`js/polity-arc.js`（シートを表示した直後）・`js/compare.js` の `open()`。
  1 件のための分岐ではなく「開いた面が使われているパネル」という事実を、開く関数自身が述べる形。
- 修正後の実測（同じ 9 点の当たり判定）: 3 面とも 9/9 が自分自身。もう一度 Chronos パネルを押せば印はパネルへ戻る（従来どおり）。
- `window.IntMapStack` の読みが 4 → 7（3 つの開く関数）。`ui-stack.js` は vm で評価される古典スクリプトで export を持たないので
  global のまま、`node scripts/global-surface.mjs --update` で基準線を更新。

## 3. 検査

- `tests/map-layer-system-chronos-checks.test.mjs`（node・評価）: ① 欠陥の形（押したパネルが上がり、シートが下になる）と `opened` が印を移すこと、
  閉じた文脈は外側、帯より上は触らない ② 比べる層は全部 `css/intmap.css` から読む ③ 年鑑と政体の盛衰の開く経路を記録用の stack で実際に走らせ、
  表示した後に `opened` を呼ぶこと（年鑑の呼び出しを外すと赤になるのを確認）。
- `tests/map-layer-system.spec.js` ②: 年鑑の箱全体の 9 点で `elementFromPoint` が年鑑自身に当たることを足した（押すボタン 1 つではなく面で訊く）。
- 比較ウィンドウは spec に足していない（第 2 の地図を開くので時間が要り、`check:testbudget` の天井がある）。上の 9 点の実測で確認。

## 4. 残したもの

- 「操作した面の中から開いた面が、その面の下に開く」は他の面にもありうる。開く関数が `opened` を呼ばない限り同じ形が残る。
  一般の発見（どの面が開いたかを DOM の変化から知る）は MutationObserver を常時張ることになり、地図のマーカーの style 変更を全部拾うので見送った。
