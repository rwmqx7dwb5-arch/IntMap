---
title: Share の 2 項目がどちらも同じ共有パネルを開き、パネルも一度に全部を並べていた——スクショは即保存、パネルはリンクだけを先に
date: 2026-10-05
newsen: Map screenshot now saves the picture straight away, and the share panel opens on just the link and a Copy button — title, note, embed and image are under More options.
newsjp: 「地図のスクリーンショット」は押すとすぐ画像を保存するようになり、共有パネルはリンクとコピーだけを先に表示します。題・一言・埋め込み・画像は「その他のオプション」にあります。
---

〈依頼〉「shareからどちらを押してもShare this viewウィンドウが開くのはちょっときもい。しかも、素人からしたら画面が複雑すぎ。」利用者の選択: スクショは「押したら即保存」、共有の窓は「リンク中心＋詳細は折りたたみ」（機能は 1 つも消さない）。

## 0. 見たもの
- 「Map screenshot」は `IntMapShare.open({tab:'image'})`、「Share / copy link」は `IntMapShare.open()`——同じパネルの別タブ。
- パネルは開いた瞬間に、題・一言の欄、リンク／埋め込み／画像のタブ、（画像タブなら）3 つの形の選択と大きなプレビューまで出す。

## 1. 直したもの
- `js/map-ui.js` `share`: リンク欄とコピー（と端末の共有）を常に見せ、「含まれる情報」・題と一言・埋め込み／画像のタブを `<details class="sh-more">「その他のオプション」` に移した。リンクはタブではなくなった（常に見えている）。`open({tab:'embed'|'image'})` や題・一言を渡す呼び手には畳みを開いて出す（Atlas の postcard はこれ）。畳みを閉じたら埋め込みのプレビューを止める。
- `IntMapShare.screenshot()` を足した: 画像タブと同じ `postcard()` を呼び、ファイルとして保存してトーストを出す。`#btn-screenshot` はこれを呼ぶ（`js/app-body.js`）。失敗はタイムラプス録画中・地図が読めない・作れないを画像タブと同じ文で述べる。
- 文言: `screenshotSaved`（en/jp）を足し、`postcardSavedNoCopy` の「リンクタブ」を「このパネル上部」に直した（en/jp。他 7 言語は凍結方針で据え置き）。

## 2. 検査
- `tests/map-postcard.spec.js` ③: メニューのスクショで PNG のダウンロードが起きパネルは開かない／リンクを開くとリンクとコピーだけが見え、題・タブは畳まれている／畳みを開くと揃っている／`open({tab:'image'})` では畳みが開いている。
- `tests/country-analysis-unify-checks.test.mjs` ⑤ を新しい配線（`screenshot()`・同じ `postcard`）に書き換えた。
