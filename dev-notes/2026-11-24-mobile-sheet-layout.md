---
title: スマホの画面構成を地図中心に作り直す——検索は地図内の丸、タブと設定はメニュー、Chronos は入力欄へ
date: 2026-11-24
newsen: On phones the map now has more room — place search is a circle on the map, tabs and settings live in one menu, and Atlas opens by default.
newsjp: スマホで地図が広く使えるようになりました。地名検索は地図内の丸いボタン、タブと設定は 1 つのメニューに入り、Atlas が最初から開きます。
---

〈依頼〉スマホの IntMap の UI が地図を脇役にしている（ボトムシートが巨大・ヘッダー肥大・入力欄が二重・操作系が散らばる）。

## 0. 測った

- 390×844 で、検索欄・座標・ロゴ行（アカウント・Feedback・Settings）・4 タブの 4 段で、シートの上端から本体まで約 270px。
- 上部の検索欄と下部の Atlas 入力欄の二重、チャットの下に空白が残る。

## 1. 変えたこと（スマホ幅 768px 以下だけ）

| 以前 | いま |
|---|---|
| 検索欄がシート上部（`#m-search-slot`） | 地図内の左上に 44px の丸。押すと地図の幅いっぱいの欄になる（`css/intmap.css` の `.map-frame-top > .map-search`）。欄に触れてもシートは持ち上がらない |
| ロゴ・アカウント・Feedback・Settings の行と 4 タブがシートの常設 | 「⋯」ボタン 1 つ。押すと、4 タブをアイコン付きのタイル、アカウント・Feedback・Settings を行にしたカードが開く。ノードは元のまま（id・ハンドラ不変）で、`.control-panel` を `.header-area` に貸す（`js/mobile-ui.js` の `moveTo(ctrlPanel, menuCard)`） |
| Chronos ボタンがシート上部 | Atlas タブのあいだは入力欄のマイクの左へ。他のタブでは上部へ戻る（`placeClock`） |
| 起動時のタブなし | Atlas が既定。起動 2.5 秒後に一度だけ開く |
| 最小の停止位置が検索行 | 最小は「座標行 + Atlas の入力欄」（`recompute` の `peek`） |

- 入力欄: 送信ボタンを 44px から 34px にし、「Ask Atlas anything…」を 1 行に収めた。
- 説明文: 「Ask in plain language — Atlas drives the map for you.」（末尾の「Try:」「例:」を全言語で削除）。

## 2. 廃止したもの

- **Hands-free voice**（デスクトップも）。ボタン、`js/atlas-voice.js`、その検査、`docs/FILES.md` の行。
  引き継ぐもの: マイクの音声入力（`atl-mic`）は残る。連続して聞き続ける機能は無くなった。
  `tests/i18n-coverage-floor.json` の de/es/ru の positional が 7204 → 7199 に下がったのは、この機能の L() 5 行を消したため。
- **Atlas が送る文の提案**（`.atl-chip`）。出す経路は残した: `makeAtlasExamples(HOST, { suggestPrompts: true })` で元に戻る
  （`examples()` の選び方、`_preview`、未ログイン向けの説明カードはそのまま）。
  未ログインの案内文から「例を押すと…」の一文を外した（en・jp）。

## 3. 落とし穴

- Chronos を貼り替える `MutationObserver` が、すでにホームにあるノードを `insertBefore` で動かして自分を起こし続け、ページが固まった。
  戻すのは「いまホームに無いとき」だけにした。
- メニューのカードに `var(--popup-bg)` / `--sidebar-bg` を使うと半透明で、後ろの文字が透けた。`--bg-color` に文字色を 5% 混ぜた単色にした。
- `check:static` の keyboard-reach は、クリック処理中の `closest('.header-area,…')` を div の受け口と数える。`box.contains(e.target)` に書き換えた。
- 試して戻したもの: 「Atlas が動き始めたらシートを半分へ下げる」「`.sidebar{overflow:clip}`」は入れていない。

## 4. 未確認

- 実機（iOS Safari）での操作感。ブラウザペイン（390×844）でメニューの開閉・Chronos の位置・1 行の入力欄を確認した。
- 他のタブ（News など）を選んだときの Chronos の位置の長い操作。
