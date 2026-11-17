---
title: Companies の時刻は日付と時刻の境でだけ折り返す／国カードは出典の発行者名を年と並べる
date: 2026-11-18
pr: 1194
newsen: In the Companies list a quote time now breaks only between its date and its time, and the country card names each figure's publisher beside its year.
newsjp: Companies の一覧で、株価の時刻は日付と時刻の境でだけ改行されるように。国カードは各数値の年と並べて出典の発行者名を表示。
---

〈依頼〉社名の欄の幅を直した変更の本番検証（build 9f2d705）で見つかった崩れ: ライブ株価の時刻が幅 54 px の欄で「2026-11-」と「18 04:53」に分かれる（1440×900 と 375×812 の両方）。変更は「日付と時刻の 2 行」と述べていたので、日付と時刻の境でだけ折り返すように直し、その形を DOM で測る。あわせて、国カードの GDP の出典表記が長い点は判断を任された。

## 0. 原因

時刻の欄を折り返し可（`white-space:normal`）にしたとき、ブラウザは空白に加えて**ハイフンの後**でも行を分ける。「2026-11-18」は 3 つに分かれうる語で、欄が日付より狭いと日付の中で切れていた。

## 1. 直したもの

- `js/companies-ui.js` `_coAsOfChip`: 時刻表記を空白で語に分け、語ごとに改行しない要素（`.co-asof-w`、`white-space:nowrap`）で包む。行が分かれるのは語の間の空白だけ——日付・時刻・「/」・「FY2025」・「year-end 2025」はそれぞれ 1 片。表記の文字列（`textContent`）は変わらない。
- 国カードの出典は**発行者名**（`World Bank`・`UNDP`・`EIU`・`SIPRI / IISS`・`Natural Earth`）。引用は `source`（全文）と `publisher`（短い名前）の 2 つを持ち（`js/tables.js` `STAT_SOURCES`・`js/wb-indicators.js` `wbCitation`・国の表の Natural Earth の行）、`js/country-figures.js` の `figure` が両方を返す。カードは `publisher`、回答の出典一覧は従来どおり `source` の全文。出典を述べていない値は年だけ。

## 2. 判断したもの・しなかったもの

- **長い社名の省略**（本番 40 行中 14 行、「Alphabet (Google)」「JPMorgan Chase」など）は直さない。社名の欄は床（88 px）を保ったうえで残りを価格・時刻・詳細と分け合う設計で、全文は行の title に出る。これ以上広げると時刻か詳細ボタンが削れる。

## 3. 検査

- `tests/companies-name-width.spec.js` に、全行の時刻表記について**語ごとの行の数**（`getClientRects()` が 1）と、時刻が日付と同じ行か次の行にあることを測る検査を足した。携帯幅は本番で崩れた 375×812 に。
- `tests/companies-live-time-wrap-checks.test.mjs`: 引用が全文と発行者名を両方持ち、`figure` が両方を返すこと／`STAT_SOURCES` の全行と `wbCitation` が発行者名を持つこと。
