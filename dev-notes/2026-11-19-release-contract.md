---
title: Pages の公開が DB 検査と Supabase 配備を待たなかった——サーバー側の版を契約にして、公開前に待ち・公開後に照合する
date: 2026-11-19
newsen: Site updates now wait until the matching server-side update is live, so a failed back-end deploy can no longer leave the new site talking to an older server.
newsjp: サイトの更新は、対応するサーバー側の更新が本番に出るまで待つようになった。バックエンドの配備が失敗したまま新しいサイトだけが出ることはない。
---

〈依頼〉 外部監査の指摘: `ci.yml` の Pages 公開は build・静的検査・ブラウザ検査にだけ依存し、`db.yml` と `supabase-deploy.yml` を待たない。

## 0. 測ったこと
- 2026-11-18: Pages だけが更新され、migration 失敗で 22 本の Edge Function が数時間古いまま（クライアントが古いサーバーを叩く窓）。
- `pages`/`aws` の `needs` は build・static・checks-gate・browser-gate のみ。`db.yml`・`supabase-deploy.yml` は別ワークフローで `needs:` が名指せない。`deploy.yml` の手動公開は元から門の外。

## 1. 変えたこと（統合せず、契約にした）
- `scripts/release-contract.mjs`:
  - **サーバー面**＝`supabase-deploy.yml` の push `paths:`（配備を起動する条件と同じもの。第二の一覧を持たない）。公開する commit S が要求する版 H＝S 以前でその面を最後に触れた commit。
  - `--gate`（新 job `server-ready`、`pages`・`aws` が `needs`）: H か子孫の `supabase-deploy` push run が成功・S の `db.yml` push run が成功、を GitHub API で確かめ、実行中は待つ（25 分・ブラウザ検査と並行）。失敗・取消・期限切れは赤で公開されない。run が無いことは成功ではなく待ち。
  - `--write`（build）: `release-contract.json` を `dist/` へ（S・H・migration 先頭・名簿・クライアントが叩く関数）。叩く関数は `js/` `src/` の `functions/v1/<name>` から導き、配備する名簿に無ければ build が赤。
  - `--live`（`post-smoke`）: 公開された契約を読み戻し、各関数が本番に実在するか（404 か）を見る。
- 検査 `tests/release-contract-checks.test.mjs`: 面の導出・判定表（2026-11-18 の「migration 失敗で後続の成功なし」を含む）・待ちの期限・実リポジトリの契約・公開 job の discover・404 の判定。

## 2. 限界（正直に）
- migration の適用そのものは `SUPABASE_ACCESS_TOKEN` が要るので Pages の job では測らない。`db push` が入っている deploy job の成功で代える。本番履歴との実測は nightly drift が続ける。
- 手動 `deploy.yml`／`rollback.yml` は人が選ぶ公開として門の外。
- 後方互換（古いクライアント×新しいサーバー）は機械では測れない。`docs/RELEASE.md` に約束として書いた（列・関数の削除は呼び手が消えた後の別の変更）。
- 実 CI での `server-ready` の初回の挙動は merge 後の main の run で確かめる。
