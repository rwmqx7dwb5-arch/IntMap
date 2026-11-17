---
title: 方位磁針を文字盤に作り直し、Atlas の回答下の隙間と入力欄のハイライトを除き、左上の補助操作を 1 行で控えめに
date: 2026-11-17
newsen: The compass is now a dial with tick marks, a red north pointer and an N. Atlas replies sit closer to their copy and retry buttons, the Atlas field no longer glows when you type, and the sidebar header is one compact row.
newsjp: 方位磁針を、目盛りと赤い北の三角と N の文字盤に作り直しました。Atlas の回答とコピー・再試行の間を詰め、入力欄は入力中に光らなくなりました。サイドバー上部はロゴと補助ボタンを 1 行にまとめました。
---

〈依頼〉2026-11-17 の利用者の一括依頼のうち、見た目の小修正（方位磁針・Atlas の余白と入力欄・左上の操作部・右上の間隔）。
同じ依頼の Atlas 完了判定・News・Countries/Companies・新レイヤーは別セッション（別 PR）。

## 1. 方位磁針

利用者が渡した `compass-reproduction.html`（144px の CSS 再現）を参考に、デスクトップ `#btn-compass` と携帯 `#m-fab-compass` の
同じ 1 枚の絵（40×40）を作り直した。薄い円盤と輪・22.5° ごとの先細りの目盛り 15 本（北の 1 本は赤い三角に置き換わる）・
東南西の 3 本だけ明るい・中央の単線の N。参考は 22.5° 回った状態の写しだった（赤い三角が 22.5°、明るい目盛りが 112.5/202.5/292.5°）
ので、北を上に戻した位置で描いた。赤以外は `currentColor` で、外側の 42px のガラス円（周りの釦と同じ）とテーマに馴染む。
文字盤ごと `rotate(-bearing)` で回る（書き手 `js/map-readout.js`・`js/mobile-ui.js` は不変）。
検査 R504 ⑥⑦ は綴りの数ではなく幾何を測るよう書き直した: 各目盛りの重心の方位が 22.5° の格子に乗り、明るいものが 90/180/270°、
赤い三角の先端が北、N は丸端の単線。

## 2. Atlas

- **回答とコピー/再試行の隙間**: 会話列の `gap:10px`（携帯 12px）＋操作行の `margin-top:4px`＋ボタンの内余白だった。
  操作行の margin を -6px（携帯 -8px）にして回答の直下 4px に置く。会話と会話の間（gap）は変えていない。
- **入力欄のハイライト**: 2 つの規則から来ていた。Atlas 自身の `.atl-in:focus`（枠を主色＋3px の影）と、全体共通の
  `:focus-visible` の 2px の輪（`!important`。テキスト欄はクリックでも :focus-visible に当たる）。前者を消し、後者は
  `#atlas-panel .atl-in` だけ名指しで外した。`tests/ui-a11y-polish.spec.js` の Tab 巡回はこの欄を理由付きで除く。
- **「青い小さい丸」**: 利用者のスクリーンショットではキャレットの上端に付く丸。利用者によれば **Microsoft Edge で、Atlas の欄だけ**に出る
  （地図上部の検索欄・Feedback の欄・ChatGPT/Claude では出ない）。
  - IntMap の DOM ではない: デスクトップ幅と iPhone 幅で、フォーカス前後の画面要素（20px 以下・青系の塗り/線/影）を差分し、
    フォーカスで現れる要素は 0 件。Atlas のコードにもキャレットに付く要素は無い（`.atl-caret` は回答の生成中の印で入力欄とは無関係）。
    このマシンのブラウザペイン（Chromium）で本番を開いても出ない。
  - **否定した見立て**: 最初「Windows 11 のテキスト カーソル インジケーター」と報告したが、レジストリを読むとこのマシンでは無効
    （`HKCU\Software\Microsoft\Windows NT\CurrentVersion\Accessibility` の `Configuration` が空）で、設定色も紫系（`IndicatorColor`
    0xFF00BF＝BGR）だった。撤回した。Chronos の「Now」点（`.ntl-peek-here`）も常時表示で無関係。
  - 残る見立て: Edge の書き込み支援がこの欄に付けている印。ChatGPT/Claude の入力欄は textarea ではなく編集可能な div。
    そこで書き込み支援と自動入力を断る標準の属性（`writingsuggestions="false"`・`autocomplete="off"`）を Atlas の質問欄と編集欄に付けた。
    スペルチェックは能力なので残した。⚠ Edge 実機では確かめられていない（利用者の環境でだけ出る）——本番で利用者に確かめてもらう。

## 3. 左上と右上

- `.header-area` を縦 2 段から 1 行（ロゴ左・補助ボタン右、幅が足りなければ折り返し）に、下余白 20→14px。
- 補助ボタン（ワークスペース・ログイン・フィードバック・設定）はデスクトップ幅で背景なし・`--text-muted`・小さめ、触れたときだけ塗る。
  主タブ（News/Companies/Countries/Atlas）は塗りを保つので、視線が主タブへ行く。携帯は 44px の指の大きさを保つため触っていない。
- 右上の Map/Satellite と Flat/Globe/3D の 2 つの組の間隔 4→8px。

## 4. 検査

`tests/ui-compass-atlas-polish-checks.test.mjs`（隙間＝gap＋margin を和で測る・フォーカスの 2 規則・補助ボタンが主タブより弱い）、
`tests/shell-compass-controls-checks.test.mjs` R504 ⑥⑦ の書き直し。
