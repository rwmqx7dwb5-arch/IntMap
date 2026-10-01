---
title: 並行 PR の migration が本番の履歴より古い時刻で着地し、Supabase の配備が止まっていた——2 本を後ろの時刻へ移し、PR の時点で拒む門を足す
date: 2026-10-01
---

〈依頼〉 監査と構造改革の作業中に、main の「Supabase deploy」が #869 の merge（680f610）から赤いことに気づいた。

## 0. 測った

- `supabase db push --dry-run refused (exit 1) — the production migration history does not match supabase/migrations`。
  その結果 `22 function(s) were NOT deployed`（ai-proxy ほか全関数）。
- `supabase migration list --linked`: 本番は `20261002100000`（#867 の台帳の下限）まで適用済みで、
  `20261001120000_operating_stats`（#874）と `20261002090000_usage_counts`（#869）が**それより古い時刻のまま未適用**。
- 原因は私（統合した側）の改番: #869 の migration は #866 と同じ時刻だったので 20261002090000 へ移したが、
  その時点で別 PR（#867）が 20261002100000 を取っており、先に着地した。どちらの PR も、分岐した main の上では
  正しい「次」だった。**2 本の PR を突き合わせるものは、本番の db push しか無かった。**

## 1. 直した

- 2 本を最新より後へ移した: `20261002110000_operating_stats.sql`・`20261002120000_usage_counts.sql`（中身は同じ・
  どちらも表と関数を足すだけで、互いにも #867 の制約にも依存しない）。`js/supporter.js` の註の名前も合わせた。
- **門**: `check:static` に規則 `migration-order`。base（`IM_DIFF_BASE`／PR では `HEAD^1`／手元では `origin/main`）の
  migration 一覧を git から読み、変更が**足した**ファイルの時刻が base の最新以下なら赤。手書きの「最新の時刻」は
  持たない。base が読めなければ警告（測れなかった、であって通ったではない）。判定は `scripts/migration-order.mjs`。
- 変異検査: 20261002095000 の migration を置くと赤になり、消すと緑に戻ることを確かめた。

## 2. 残したもの

- この門は「PR を作った時点の main」と比べるので、**同時に開いている 2 本が同じ時刻帯を取る**ことは PR の段では
  まだ起こりうる（片方が着地した後に再実行されれば赤くなる）。最後の柵は本番の db push の dry run のまま。
