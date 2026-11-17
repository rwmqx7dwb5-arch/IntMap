---
title: 企業アトラスの週次 PR が毎回 check:perf の dist.total で赤——bot は自分のバイトぶんだけ天井を上げる（perf-budget --raise-own）
date: 2026-11-16
internal: 週次の bot が起動予算の天井をどう扱うかだけで、出荷されるものは変わらない
---

〈依頼〉期限の修正（`companies-refresh-deadline`）の先に残った詰まり。企業データ更新の PR（`data/companies-refresh`・#1101）が
`check:perf` で赤になり、`land-bot-pr` が着地させられない。人の手なしに着地できる仕組みを main へ。

## 0. 測った（2026-11-16）

| 何 | 結果 |
|---|---|
| 手動 run 43744761841（main から 11-15 起動） | `refresh` job が failure。期限の修正で build は最後まで走り PR を更新したが、PR の検査が赤で land-bot-pr が止めた |
| その PR の赤 | ① Gates 2/3: `dist.total grew: 1398060.0 kB > ceiling 1391034.0 kB (band 6955.2 kB)` ② Regression 1/3: `security.yml:watch` に timeout が無い（#1139 で main は直っている＝PR の base が古かっただけ） ③ Migrations: Supabase CLI が `@trpc/server` の npm キャッシュに失敗（main の同じ検査は緑＝一過性） |
| この回のバッチが data/companies に足したバイト | 1,371,136 B（git の blob サイズで b6220633 → 4258b753） |
| 天井超過のうちバッチの分 | 約 1.3 MB / 超過 7.0 MB。**残りはバッチのものではない** |
| main の天井 | 11-15 の第 4 波（#1105）で 1391034 → 1533506 kB に上がった |

**超過の正体**: 幅（band）の中で増えた PR は緑で、天井を上げない。だから main は天井＋1 幅の近くまで育てる。
天井を下げる `perf-ceiling.yml` は下げるだけ。そこへバッチの 1 バイトが乗ると赤になる。人は `--update` で上げて理由を書くが、
bot は書けない。しかも build から `--update` すると、main が決めずに使った幅まで追認してしまう——門が決めさせるための増分そのものを。

## 1. 直したもの

- **`scripts/perf-budget.mjs --raise-own <path>...`**: 作業ツリーが `<path>` の下で HEAD に対して足したバイトのうち、
  **出荷されるもの**だけを数え、それが着地する deploy 行（`dist.total`・`dist.data`・`dist.assets`）の天井をちょうどその分だけ上げる。
  build は要らない（git の blob サイズと作業ツリーの stat）。縮んだときは何も上げず、下げもしない（下げるのは main の CI のまま）。
  - 「出荷されるか・dist のどこへ行くか」は **`vite.config.js` の `STATIC_ASSETS` / `STATIC_EXCLUDE` そのもの**から読む（写さない）。
  - 「どの行に数えられるか」は新しい `DIST_ROWS` 1 表。`measureFrom()` の測定・`metrics()` の判定・`ownGrowth()` の説明が同じ表を読む。
- **`.github/workflows/companies-refresh.yml`**: 自分が書き換える場所を `OWNED: data/companies` で 1 回だけ宣言し、
  差分の有無・`--raise-own`・`git add` が同じ値を使う。commit の前に `npm ci` → `--raise-own` → バッチと天井を同じ commit に。
  上げた行と量は commit メッセージ・PR 本文・run summary に表で載る（既存の PR は `gh pr edit` で本文を書き換える）。

**弱めていないもの**: PR の `check:perf` は今まで通り本物の build を判定する。上げたのはバッチのバイトちょうどなので、
それ以外の増分（main の幅を超えるもの、他のパスのもの）は今まで通り赤。起動時の行（eager・phone）は上げないので、
バッチがそこへ入り込めば赤。数式は `tests/companies-perf-own-bytes-checks.test.mjs` ③ が、「上げなければ赤／上げればバッチちょうどが緑／
説明できない 10 kB は赤」の 3 点で押さえる。

実データで確かめた: 現 main の作業ツリーに #1101 の data/companies を置いて `--raise-own data/companies` → `dist.total`・`dist.data` が
+1339.0 kB（= 1,371,136 B、上の git の計測と一致）。

## 2. 残るもの（測って判断する）

- **天井ファイルの衝突**: バッチの PR が待っている間に `perf-ceiling.yml` が `dist.total` を下げて main に着地すると、同じ行が衝突し
  `gh pr update-branch` が失敗する → land-bot-pr は `lost` で終わる（失敗ではない）。翌週の run は main から branch を作り直すので、
  そのバッチは pending のまま次に回る。毎週起きるようなら、land-bot-pr が更新に失敗したときに呼び出し側へ「準備し直し」を渡す形を考える。
- `data-refresh.mjs` の名簿に載っている他の bot も同じ構造を持つ。いまは小さくて幅に収まっている。赤くなったら同じ `--raise-own` を使える。
