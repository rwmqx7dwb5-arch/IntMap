---
title: Atlas の入力欄・編集欄・フローティング・モバイル長押し・場所検索を整える
date: 2026-11-25
---

〈依頼〉デスクトップ: 入力欄と画面下端の隙間・送信ボタンの大きさ・1 行でも出るスクロールバー・編集欄のクリック時の強調。
モバイル: コピー／編集を長押しのポップアップへ。フローティング: 文字のグロー・入力欄の位置・上部バー・上下端の消え方。
場所検索: 文言と、Atlas へ送る経路の撤去。

## 欠陥の述べ直し（直し方ではなく）

- 1 行の入力欄でスクロールバーが出た原因は、`.atl-in`（高さ 42px・padding 11px・行高 18.85px）の中身が 41px で、枠の 40px を
  1px 超えて常に「溢れて」いたこと。ホバーの CSS（`*:hover` でつまみを塗る）はそれを見せていただけ。直したのは
  `overflow-y:hidden` を既定にし、`autoGrow` が実測の溢れ（`scrollHeight > clientHeight + 1`）のときだけ `auto` にする形。
  編集欄 `.atl-edit-in` も同じ。
- 編集欄の強調は `:focus` の青いリング（`box-shadow:0 0 0 3px`）。外し、枠線も変えない。
- タッチ画面にホバーは無く、利用者のメッセージの下のバーは常時表示（0.55）だった。`@media(hover:none)` ではバーを消し、
  メッセージの長押し（430ms。OS のメニューが開く約 500ms より短い）で Copy／Edit のメニューを出す。メニューは再実装せず、
  非表示のバーの本物のボタンを押す（コピーの代替経路・編集の巻き戻しは 1 つの実装のまま）。iOS の選択・コールアウトは
  `-webkit-touch-callout:none` と `user-select:none`、Android は touch 直後の `contextmenu` の preventDefault で抑える。
  開始は `pointerType==='touch'` のみ（マウスの右クリックと選択は変えない）。

## 変えたこと

- `js/atlas-styles.js`: 送信 38→34px、入力欄下の padding 4→2、注記 `.atl-ainote` の下余白 7→3・行高 1.4→1.3。
- `js/atlas-float.js`: 上部バーの「Atlas」の名前と「Atlas タブで開く」ボタンを削除（入口は Atlas のサイドバータブ `#btn-community`・A キー・
  `floatRoute` が従来どおり残る）。カードの下端を `bottom:48px→6px`（Chronos バーの下端 6px と同じ）、上端 `84px→36px`。
  会話は `mask-image` の上 56px・下 30px のグラデーションで消え、同じ長さの padding を持つので静止時の文字は消える帯に入らない
  （下の 30px が入力欄との間の間）。グロー（`text-shadow`）を 3 層から 5 層に強めた。
- `js/search-geocode.js`: `_askAtlasRow` と `.ms-atlas` の経路を削除（入力欄 → Atlas の経路は Atlas 自身の入力欄だけ）。
  `js/mobile-ui.js`: プレースホルダは「Search places」/「場所を検索」に固定し、幅で文を切り替える測定（`fits`）は不要になり削除。
- 未使用になった `atlFloatToTab` の文字列は 9 言語のロケールに残している（9 言語は凍結・削除しない）。

## 検証

- `tests/atlas-composer-float-ux-checks.test.mjs`（新規）、更新: `desktop-one-entry.spec.js`・`ui-a11y-polish.spec.js`（行が無いこと）、
  `geo-map-ui-shell-checks`・`shell-atlas-surface-checks`・`atlas-panel-ui-checks`（新しい値）。
- ビルドして dist を配り、デスクトップ・375px・フローティングを目視（記録は PR 本文）。
