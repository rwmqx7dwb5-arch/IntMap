---
title: 出来事の履歴を過去へ遡らせる（Wikipedia Current events の取り込み）
date: 2026-11-20
newsen: Atlas can now answer about past years — news events back to 2012 are being added from Wikipedia's daily current-events record, each with the publishers it cites and the running story it belongs to.
newsjp: Atlas が過去の年についても答えられるよう、2012 年までの出来事を Wikipedia の日別の出来事の記録から順次足しています。各行に引用された媒体と、属する連載（続き物）を持ちます。
---

〈依頼〉 #1291 の後続: 埋め込みの滞留を解消し、過去の記事の取得範囲を広げ、「過去 10 年の台湾海峡の軍事的緊張の推移」に記録で答えられるようにする。

## したこと
- `_shared/news-backfill.js`（純粋）と `news-ingest` の `backfill` 段。詳細・規則・実測は `docs/NEWS-EVENTS.md` §19.7。
- 出典・規約・プライバシーの表記: `js/reference-data.js`・`js/legal-text.js`（CC BY-SA 4.0・日付だけを送る）。

## 測って採らなかった
- GDELT DOC API: 検索窓が直近 3 か月だけ。GDELT の Events/GKG の日別ファイルは 2015 年から全部あるが 1 日 数十 MB で Edge Function の時間に収まらず、CAMEO 符号は軍事的緊張の質を述べない。
- 各社のアーカイブ検索: 規約と費用が媒体ごとに違い、日付つきの網羅が取れない。

## 残っていること
- 日の粒度・場所なし・英語の記録（日本語の問いは Atlas が英語の語へ直して引く）。
- 本番での取り込みの実測は deploy 後（結果は PR に追記）。

## perf 天井を上げた理由(2026-11-24)
`atlas-cap-runs`(946.9 kB)・`atlas-console`(1137.8 kB)は能力 `news.history` と遡及の説明の分、`legal-text`(93.9 kB)は出典・利用規約の追記分(Wikipedia Current events・出来事の履歴)、`dist.assets`(22.06 MB)は同じ追記を含む配布物の増加。`gis-core`(701.2 kB)の増分は main 側の変更の測り直しで、この PR の新規コードではない。

## perf 天井の再引き上げ(main 合流後)

`atlas-cap-runs` 957.3 kB と `atlas-console` 1145.9 kB が合流後に天井を超えた。増分は main の能力追加(建物情報・描画の目撃者)と、本 PR の `news.history` 能力表の行によるもので、いずれも利用者が到達できる能力の実体。天井だけを `perf-budget.mjs --update` で上げた。
