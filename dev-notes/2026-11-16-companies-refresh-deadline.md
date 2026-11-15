---
title: 企業アトラスの週次更新が 3 週続けて Overpass 待ちのまま 90 分で殺され、キャッシュも捨てていた——OpenStreetMap に期限を、キャッシュは失敗しても保存
date: 2026-11-16
internal: 週次の bot の運び方だけで、出荷されるプロフィールの形は変わらない
---

〈依頼〉放置期間の点検。`companies-refresh` は 2026-10-26・11-02・11-09 の 3 回とも `cancelled`。

## 0. 測った

- 3 回とも「Rebuild the batch」で、`querying OpenStreetMap…`（開始 2 分半後）を最後に 88 分無出力、`timeout-minutes: 90` で取消。孤児の `curl` が 2 本（並列 2）残っていた。
- 1 問は端点ごとに最大 200 秒かかって失敗しうる。失敗が成功と交互に出ると連続 12 回の遮断器は開かない。
- `actions/cache` の保存は**成功した job の post-step だけ**。取消された run は何も保存せず、次の週は `Cache not found` から始まっていた＝累積するはずのバッチが毎週ゼロから。

## 1. 直したこと

- `scripts/companies/osm.mjs`: `deadline`（epoch ms）。過ぎたら新しく訊かず、走っている要求もそれを越えない（`--max-time` を残り時間で縛る）。届かなかった企業は遮断器が開いたときと同じく `osmPending`。`build.mjs --osm-deadline <時刻>`（読めない値は拒む）。
- workflow: `actions/cache` を restore と save に分け、save は `always()`。build に `OSM_MINUTES`（45 分。根拠は workflow の註）の期限。
- 文書: `docs/COMPANIES.md` の更新手順。

## 2. 検査

`tests/companies-refresh-deadline-checks.test.mjs`: 期限切れでは要求を出さず全社を pending にする（修正前のコードでは実際に網へ出て赤）・workflow が期限を渡し、保存が `always()` で、成功時だけ保存する `actions/cache` が無い。
