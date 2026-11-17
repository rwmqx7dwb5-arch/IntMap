---
title: 国単位の出来事を土地で問うと、今の国境が最後の戦争より後に始まる国（ウクライナ・ロシア・セルビアなど）で例外になっていた——今の国の行を国境の鏡へ取り寄せてから国土を読む
date: 2026-11-17
newsen: Fixed: for a country's news event, "This place's past" could fail to read the wars for countries whose present borders began after the last recorded war (Ukraine, Russia, Serbia and others). It now shows them, with the predecessor state's record.
newsjp: 国単位のニュースの出来事の「この土地の過去」で、今の国境が記録上最後の戦争より後に始まる国（ウクライナ・ロシア・セルビアなど）の戦争が読めなかった不具合を直しました。前身の国の記録として表示されます。
---

〈依頼〉「この土地の過去」の修正（news-past-fixes）の本番検証で、E（国単位の出来事を土地で問う）が本番で不合格だった。

## 1. 観測（本番 2026-11-17・ビルド 0a9a07d）

実際のウクライナの出来事（placeKind=country）で、戦争の節が「The war records could not be read (Cannot read properties of
undefined (reading '8'))」。`IntMapWarFronts.atPoint(31.17, 48.38, {level:'country'})` を直に呼んでも同じ。ロシア・セルビア・
モンテネグロ・スーダン・南スーダンも同じで、英国・フランス・ドイツ・日本は正常。

## 2. 原因

ページは CShapes の**疎な鏡**しか持たない（`js/hist-bundles.js`: 行は、それを要した問い——`during` など——が初めて運ぶ）。
戦争の層は自分の戦争の期間に効力のある行だけを運び（`load` の `during(t0, t1)`）、`contains` は worker が答えて鏡に
何も置かない。国単位の問いが読む**今の国の輪郭**は、今の行が記録上最後の戦争より後に始まる国では鏡に無い
（ウクライナの今の行は 2014-03-18 から）。時代の国境など、同じ鏡を別に満たす読み手が先に動いていれば出ない。

回帰検査が見逃した理由: 検査の扉は鏡に**全行**を持たせていた。本番の扉と同じく `during` が運んだ行だけを持つ扉に
変えると、本番と同じ例外で落ちた（再現）。

## 3. 直し方

`js/war-layer.js` `atPoint`（国単位）は、今の行が鏡に無ければ、その行が始まる日を `door.during` に問うて運ばせてから
国土を読む。運べなければ例外ではなく `unavailable`（`present-outline-unreachable`）を返し、カードは理由を述べる。

## 4. 検証

- `tests/news-past-fixes-checks.test.mjs` ⑤ の扉を本番と同じ疎な鏡にした（修正前は本番と同じ例外で落ちることを確認）。
  ウクライナに加えてロシア・セルビア・スーダンが `ok` を返すことも見る。
- 本番での確認は PR 本文に書く。

## 5. 起動費用

非同期チャンク `war-layer` の天井を 36.1 kB → 38.1 kB に上げた（`node scripts/perf-budget.mjs --update`）。増分は
国単位の問いを土地で問う部分（今の国土の標本・その日の割合・前身の印、news-past-fixes で入ったもの）と、この
修正の数行。チャンクは戦争のレイヤーか「この土地の過去」を開いたときだけ読まれ、起動時には読まれない。
