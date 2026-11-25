---
title: Atlas 回答の出典・成果物・組版の情報設計——本文の「(apnews.com)」を出典チップに、背景地図の帰属を出典に数えない、成果物の名前とボタン、見出しの縮小
date: 2026-11-25
newsen: Atlas answers now show cited pages as small source chips with a hover card, stop counting the background map's credits as sources, and read more calmly.
newsjp: Atlas の回答で、引用元が小さな出典チップ（ホバー／タップで媒体・題名・元記事）になり、背景地図の帰属は出典に数えず、見出しやリンクも落ち着いた組版になりました。
---

〈依頼〉問題は出典の不足ではなく情報設計と表示階層。本文の青い下線リンクが目立ちすぎ、背景地図 4 件で「この回答の出典 · 5」になり、
成果物が「途中の調査結果と操作のメッセージ」という残り物の名前で畳まれ、見出しが本文の約 2 倍の大きさだった。

## 変更
- **出典チップ**（`js/atlas-answer-sources.js` `chipSources`）: ラベルがホスト名のリンク（Atlas が引用に書く「(apnews.com)」）を、ファビコン付きの小さな角丸チップにする。
  1 組の括弧内の複数は 1 つのクラスタ（先頭 2 つ表示・残りは「+N」）。href はそのまま保つので到達できるものは減らない。説明文のリンクは通常のリンクのまま。
  ホバー（モバイルは最初のタップ）で媒体名・ファビコン・題名・日付・概要・元記事リンクのカードを出す。題名などは計画呼び出しの引用（`_curPlanCites`）から引く。
- **出典一覧**: 本文で引用したページは URL ごとに 1 件へ重複排除して数え、折りたたみの一覧に載せる。
- **背景地図の帰属を数えない**: `kind: 'map'` は件数に入れず、一覧の行にもせず、「背景地図の帰属（この回答の出典ではありません）」として別行にする。
  道具が実際に読んだデータは `number` / `line` のまま数える。地図上の帰属表示（法的義務）と引用の出典表記は変えていない。
- **成果物**: 描かせた図形（`drew`）を「地図上の成果物」のボタンにし、押すと描画元のデータの範囲へ地図を移す。折りたたみの名前は「成果物・調査結果」。
  地点表のクリックとリンク化は別作業（atlas-map-link）の `atlas-map-compose.js` が持つので触っていない。
- **引用**: APA / Chicago / BibTeX / RIS は機能を変えずに、小さなメニュー（丸いボタン）の中へ。
- **組版**（`js/atlas-styles.js`）: h1〜h3・リード見出しを 1.9/1.56/1.3/1.28em から 1.32/1.2/1.1/1.06em へ、太さ 600→560、見出し下の余白を広げた。本文中のリンクは地の色＋薄い下線にした。

## 引き継いだもの・測ったこと
- 数字の `[n]` 印、線の根拠ボタン、引用の中身は従来のまま（`tests/atlas-cited-answers-checks.test.mjs` が緑のまま）。
- 回帰: `tests/atlas-answer-sources-checks.test.mjs`（チップ・クラスタ・重複排除・帰属の分離・成果物・見出し）、`tests/atlas-answer-sources.spec.js`（実ページ・デスクトップとモバイルのタップ）。
- データソースの表記・利用規約ページへの影響なし（地図上の帰属とプライバシー情報は触っていない）。ファビコンは既存の `www.google.com/s2/favicons` を従来どおり使う。

## 予算
- 非同期チャンク `atlas-knowledge`（出典モジュールを含む）が 43.2 kB → 52.4 kB に増えた。チップ・カード・成果物・メニューの描画と CSS による。`perf-budget --update` で天井を上げた。
- 見出しを縮めたので、見出しの大きさ・太さを固定していた既存の検査（assistant-panel / atlas-reply-render / process-atlas-source-lines）の値を新しい値に更新した。
- 本文の出典チップとフッターの href を `IntMapSafe.url` で通すため、`js/atlas-answer-sources.js` が `window.IntMapSafe` を 2 か所読む（175 → 177）。`global-surface --update` でその 2 件を基準に入れた。他の出力は既存の `esc` を使い、新しい窓口は足していない。
