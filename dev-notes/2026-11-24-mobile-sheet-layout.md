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

## 3b. CI で赤になって直したもの（いずれも製品の欠陥）

- **既定の Atlas が開かなかった**: Atlas タブは kernel の `panel.tab` 命令で、kernel は遅延 chunk。2.5 秒時点で押すと `atlas-kernel-not-loaded` と答えて何も開かない。`IntMapLazy.need('atlasConsole')` を待ってから押す（メニューを開いていれば押さない）。
- **場所カードが検索候補を覆った**: 2 回目の検索で前回のカードが候補の上に乗り、押せなかった。検索欄が開いている間は候補をカードより手前に出す。
- **入力欄の 4 ボタンが 44px 未満**: 見た目は 34px の丸のまま、押せる範囲を 44px にした（padding 5px + background-clip）。
- **背の高いパネルが右のボタン列を覆った**: 最小の停止位置が高くなった分、ツアービルダーなどが上へ伸びた。パネルの上限（floor）を右のボタン列の下端までにした。
- **過去の年が丸いボタンに押し込まれた**: 年があるときは入力欄の Chronos を横長のピルに広げる。
- **Chronos の指のなぞりの検査**: 時計が画面の右寄りに来たので、右へ 1900→1943 ではなく左へ 1950→1943（同じ境界）に変えた。
- **「地図の覆われ方」の天井**: 休止中のシートが Atlas の入力欄を含む（画面の約 29%）ので 0.2 → 0.34。依頼の「地図 70〜80%」に合わせた。

## 3c. 上げた予算と台帳

- 共有窓口の台帳（`check:surface`）: `window.IntMapLazy` の読みが 1 件増えた（191 → 192）。起動 2.5 秒後の既定の Atlas が、kernel の遅延 chunk を `IntMapLazy.need('atlasConsole')` で待つため。指の pointerdown が頼むのと同じ温め方で、`js/mobile-ui.js` は遅延 chunk の所有者ではないので import できない。


- `eager.cssRaw` 373.4 → 385.4 kB（その後の追加: 入力欄 4 ボタンの 44px 化、ピル、touch-action）、旧 373.4 → 383.3 kB、`eager.cssGzip` 61.8 → 64.8 kB: メニューのカード（タイルと行のアイコン）、地図内の検索の丸、入力欄の 44px 化の CSS。引き継ぎ: スマホの旧ヘッダーの規則（`#m-search-slot` など）を消したが、新しい面のほうが大きい。
- `gis-core` 697.3 → 701.2 kB: この変更の持ち物ではなく、取り込んだ `origin/main` 側の増加。

## 4. 未確認

- 実機（iOS Safari）での操作感。ブラウザペイン（390×844）でメニューの開閉・Chronos の位置・1 行の入力欄を確認した。
- 他のタブ（News など）を選んだときの Chronos の位置の長い操作。

### 3d. perf の天井（main の取り込み後に測り直し）

main の新しい取り込み（atlas-file-make・atlas-knowledge・transit-planner など新しい遅延チャンクと、atlas-cap-runs の増加）で async 合計・atlas-cap-runs・dist.assets の天井を超えたため、main を取り込んだ木でビルドし直して --update した。増えた分は main 側の機能であり、この PR の変更ではない（この PR は ハンズフリー音声の削除で配信物は減る側）。async.raw 14680.9→14756.3 kB・async.gzip 4956.6→4986.1 kB・atlas-cap-runs 989.3→995.0 kB・dist.assets 22068.6→22212.7 kB。
