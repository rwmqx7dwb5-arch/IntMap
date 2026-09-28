---
title: 本番の deploy が 3 回赤だったが、サイトは出ていた——配備後の検査が MapLibre 6 の予約名 maplibre.invalid を「DNS から消えたホスト」と呼び、状況表示は run 全体の赤を「本番に届いていない」と読んでいた
date: 2026-09-29
---

〈依頼〉多面的な監査の続き。起動時の状況表示が「本番未到達 #788 #787 #785 / deploy failure」を出した。

## 0. 測った

- deploy.yml の run 36412394387・36412996298・36423632705（MapLibre 6 の merge 以降の 3 本）は、
  `Build + verify` と `Deploy to Pages` が success、`Post-deploy smoke (live URL)` だけが failure。
  本番のビルド印は `2026-09-28T12:43:06Z-d03a5c8`（#788）＝**サイトは出ていた**。
- 赤は `tests/prod-smoke.spec.js` #R533「配信物が名指す第三者のホストが全部 DNS で引ける」で、4 回とも
  `maplibre.invalid` だけが死んでいると言っていた。MapLibre 6 は相対 URL を `https://maplibre.invalid` を
  基底に解決する。`.invalid` は RFC 6761 が「決して解決しない」と予約した TLD で、接続先ではない。
- `scripts/worktree.mjs status` の「本番への到達」は deploy の run の **conclusion が success** の最後の
  ものを本番と読んでいたので、smoke だけの赤で「3 commit が本番に届いていない」と述べた。

## 1. 直したもの

1. `tests/prod-smoke.spec.js`: 特殊用途名（RFC 2606 / 6761 の `.invalid`・`.test`・`.example`・`.localhost` と
   `example.{com,net,org}`）を、名前の一覧ではなく**予約そのもの**で掃引から外す。
2. `scripts/worktree.mjs`: run が赤でも、**公開するジョブ**（deploy.yml の中で `actions/deploy-pages` を使う
   ジョブ。名前は書かず yml から見つける `pagesJobName`）が success なら本番に出たと読む。赤い run は従来どおり
   別の行（「最新の deploy が failure」）で述べる——「届いていない」と「検査が赤」は次の手が違う。

## 2. 検査

`tests/reserved-hosts-and-deploy-reach-checks.test.mjs`（① 予約名だけを外す：`maplibre.invalid` は外れ
`api.maplibre.org`・`invalid.org`・`example-data.com` は残る ② `pagesJobName` を実物の deploy.yml と fixture で評価）。
`node scripts/worktree.mjs status` が「origin/main が本番に出ている (d03a5c8)」と「最新の deploy が failure」を分けて述べることを確認。
