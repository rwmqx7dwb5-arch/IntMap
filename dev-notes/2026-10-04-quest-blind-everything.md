---
title: 学ぶクエストが本番で答えを見せていた——年は凡例・ニュース一覧・アドレスバーに、場所当てのタップはニュースの点に。印字する要素が自分で述べる属性と、エンジンの「タップを持つ者」
date: 2026-10-04
pr: 978
newsen: In Learn quests, the year is now hidden everywhere it appears while you guess, and tapping your answer no longer opens a news story under it.
newsjp: 学ぶクエストで、年を当てる間は年がどこにも出なくなり、場所当てで答えをタップしても下のニュースが開かなくなりました。
---

〈依頼〉 `dev-notes/2026-10-04-learn-quests.md`（#973）の本番検証。全権委任のラウンドの続き。

## 0. 測った（本番・2026-10-04、ビルド印 `2026-10-04T07:55:53Z-0989787`）

- 年代当て: body に `im-quest-blind`、`#news-timeline` は `visibility:hidden`——**それでも答えが見えた**。凡例
  `#data-legend-worldtime` が「The map at 1945-03-07」、ニュース一覧 `#live-news-feed` にその日付、アドレスバーに `tt=1945-03-07`。
- 場所当て: 1 回のタップで「290 / 1000」と同時に、左の欄にニュース記事（Riyadh）が開いた。

## 1. なぜ

- 隠す要素は `js/quest-panel.js` に**手で書いた一覧**（`#news-timeline`・`#m-clock`・`.dl-clockrow`）だった。読んで見つけた
  3 つで、凡例とニュース一覧とアドレスバーを知らなかった。一覧は、日付を印字するモジュールが増えた日に黙って腐る。
- `claimClick` は「このタップは取った」を**後から**記録するだけで、`clickClaimed()` を訊く処理（地名ラベル）にしか効かない。
  ニュースの点・火山・ピンは訊かないので開く。「しばらくの間、全部のタップを持つ」は別の事実で、置き場所はすべての
  クリック処理が通るエンジンの `on` / `onLayer` だった。

## 2. 直したこと

| 何 | どう |
|---|---|
| 年を印字する要素 | 一覧をやめ、**要素が自分で述べる** `data-prints-map-time`。作る側が付ける: `#news-timeline`・`#m-clock`・`#live-news-feed`（index.html）、`#data-legend-worldtime`（`js/layer-time-kernel.js`）、`.dl-clockrow`（`js/data-layers.js`）。CSS は属性を隠す |
| アドレスバー | `MapState.holdAddress(reason)` / `addressHeld()`（`js/map-state.js`）。書き手 `js/map-ui.js` の `save` が保留中は書かない。年代当ての間だけ |
| タップ | `events.holdTaps(owner)` / `tapsHeldBy()`（`js/geo-engine.js`）。保持中は、`{ tapOwner }` が保持者と一致するクリック処理だけが走る（`on` / `once` / `onLayer` の 'click' をエンジンが包む。`off` は包んだものを外す）。場所当ての問題が答えを待つ間だけ。移動・拡大・ホバーは止めない |
| 型 | `types/geo-engine.d.ts` の `on/off/once` に options、`holdTaps`・`tapsHeldBy` |

## 3. 否定した見立て・残したもの

- 一覧に 3 つ足すだけの直し方は、次に日付を印字するモジュールで同じことが起きるので採らなかった（`.agents/rules/no-ad-hoc-hardcoding.md`）。
  属性は「要素が何を印字するか」という事実で、作る側が知っている。
- 各クリック処理に `clickClaimed()` を訊かせる直し方は、処理の数だけ同じ行が要り、新しい処理が訊き忘れる。エンジンで 1 か所。
- `GE().raw()` で地図の生の `on` を直に呼ぶ処理はこの保持を通らない（エンジンを迂回するものは `check:engine` が数を抑えている）。

## 4. 検査

`tests/learn-quests-checks.test.mjs`: ⑦ を書き直し（一覧が無いこと・CSS が属性を隠すこと・本番で答えを見せた 5 つの印字する要素が属性を持つこと・
アドレスバーの保留を書き手が守ること）、⑩ を追加（偽の adapter で、保持中はクエストの処理だけが走り、ニュースの点と地図全体の処理は走らない・
放すと全部走る・`off` が包んだ処理を外す）。
