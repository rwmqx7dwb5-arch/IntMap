---
title: CI が遅い原因は実行時間ではなく runner の順番待ち。Security の PR 起動をコード変更のある PR に絞った
date: 2026-11-20
internal: CI の起動条件だけで、読者に見える変化は無い
---

〈依頼〉CI がいつも遅い。爆速にしろ。

## 0. 測った

- 成功した CI の所要は 19〜122 分（中央値 約80 分）。遅い run の中身は各 job 0〜16 分で、`Gates` は run 開始の約 1 時間後に始まっていた＝**待ち**。
- その時点で open PR 30 本・queued 20 run。1 run の runner 時間は約 76 分（Regression 3 shard で 約 48 分、ほぼ全部がテスト本体）。同時 job 数の上限を PR が奪い合っている。
- 回帰検査の shard は `.github/checks-cost.json` で既に長さ順に詰めてあり、足す余地は小さい。`Database checks` は必須チェックのため `paths:` を戻せず、ジョブ内で既に飛ばしている（db.yml 冒頭）。

## 1. 変えたもの

`security.yml` の `pull_request` にコード・ロックファイルの `paths:` を付けた。文書・記録・データだけの PR では CodeQL も npm audit も走らない。main への push と毎日の定期実行は従来どおり。Security は必須チェックではない（ruleset の 4 件に無い）ので、`db.yml` が戒めている「必須文脈が報告されない」事故は起きない。

## 2. 追加: CodeQL を PR から外した（利用者の指示「爆速にしろ」）

CodeQL は PR 上で実際に指摘を拾った実績（`tests/atlas-agent-repeat-checks.test.mjs` の注記）があり、外すと PR 上の検出は遅れる。利用者が速度を優先すると繰り返し述べたので `codeql` job を `pull_request` で飛ばした。main への push と日次の定期実行は残るので、指摘は遅くとも翌日に出る。`npm audit` は PR で走り続ける。戻すときは job の `if:` を消す。

## 3. 変えなかったもの

runner 枠の増設は料金が発生する。他セッションの赤い PR（11 本）には触れない。
