---
title: Atlas の本番自動評価を凍結した——自動の機械評価は評価として成立しないという開発者の判断
date: 2026-11-19
---

〈依頼〉 技術評価の P0「本番 Atlas の nightly eval を実走させる」。

## 0. 測った

- `atlas-eval.yml` は 2026-11-15 から 11-18 まで 4 夜連続で 30〜35 秒で失敗していた。原因は repository secret
  `ATLAS_EVAL_REFRESH_TOKEN` と `ATLAS_EVAL_SECRET_WRITER` の未設定（Issue #755）。
- 未設定時は gate が欠けた名前を述べて exit 1 になる（無言で緑にはならない）。直すところは無かった。

## 1. 判断と理由

**開発者（利用者）の判断: Atlas の本番評価は凍結する。**
理由: 評価を自動で、開発者本人以外の、しかも機械に任せても、Atlas の回答が良いかどうかの評価としては成立しない。
開発者自身が全部を見て決める。よって設定（ログイン・PAT・利用枠）を整えて走らせる投資はしない。

## 2. したこと

- `gh workflow disable atlas-eval.yml`（スケジュール実行を止めた）。Issue #755 を理由付きで閉じた。
- コード・テスト・PR ごとのオフラインのリプレイ（`--replay`）は残した。消していない。

## 3. 再開するとき

`gh workflow enable atlas-eval.yml` と、`docs/TESTING.md`「Atlas evaluation」の one-time setup（2 つの secret と
アカウントの利用枠）。再開は開発者の判断で行う。
