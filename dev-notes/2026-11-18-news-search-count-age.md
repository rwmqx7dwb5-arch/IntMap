---
title: News の件数と一覧を 1 つの判定にする——カテゴリの件数は一覧の絞り込みからカテゴリだけを外した集合、検索の出来事は 72 時間で切らない
date: 2026-11-18
newsen: The topic counts above the news list now always match what the list shows, and a search lists the older events it finds, up to the 30 days events are kept.
newsjp: ニュース一覧の上のカテゴリの件数が、一覧に出る数と必ず一致するようにしました。検索は、見つけた古い出来事も（出来事を保つ 30 日まで）一覧に出します。
---

〈依頼〉本番検証（build 1be2049）の所見: 「cheating」で検索すると件数 18・一覧 13。

## 原因 — 「Kerch」と同じ形

本番の出来事の表で再現: 「cheating」に当たる出来事は 18 件、うち最後の記事が 72 時間以内なのは 13 件。
一覧（`js/app-body.js` `computeFilteredNews`）は生の配信を守るための 72 時間の打ち切り（`NEWS_MAX_AGE_MS`）を
当て、カテゴリの件数（`js/news-events.js` `renderChips`）は `globalData` をそのまま数えていた。
「Kerch」（件数 2・一覧 1、検索文に要約が無かった）も同じ形だった: **件数と一覧が別々の条件で数えていた**。
1 語ずつ直すと次の条件（★の範囲・媒体の絞り込み・地図の範囲）でまた離れる。

## 直し方

- **件数は一覧の判定そのものから数える。** `computeFilteredNews({ allTopics:true })` ＝ 一覧と同じ述語から
  カテゴリの軸だけを外した集合。`renderChips` はそれを数え、`globalData` を直に読まない。
- **検索の出来事は 72 時間で切らない。** 打ち切りは生の配信のため（サーバーが記事を 72 時間で消す）で、出来事の
  検索は出来事の表（30 日）に意図して訊いたもの——★・過去の日付と同じく対象外（docs/NEWS-EVENTS.md §9 の
  「検索: …（30 日）」どおり）。記事モードの検索（生の RSS）は今までどおり切る。⇒ 「cheating」は 18 件出る。

## 検査（1 語の事例ではなく、条件の全部）

`tests/news-search-count-age-checks.test.mjs` は `computeFilteredNews` を**ソースから取り出して評価**し、
述語が読む軸（範囲＝すべて／★・72 時間の内外・30 日・出来事／記事・媒体の可否・検索語の有無・地図の範囲・
過去の日付）を全部振った項目と状態で、**すべてのカテゴリについて「チップの数＝そのカテゴリを選んだときの一覧の数」**を
確かめる（64 通り）。述語が新しい名前を読み始めたら評価が ReferenceError で落ち、検査に軸を教えることになる。
`renderChips` が自前の一覧を読まないことも確かめる。

本番の行で同じ判定を回した（2026-11-18）: cheating 18＝18・Kerch 3＝3・Ukraine 200＝200・summit 131＝131、
どのカテゴリでも件数＝一覧。
