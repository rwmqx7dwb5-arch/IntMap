---
title: 続けて merge すると本番に何も届かない——main への push は走っている CI を cancel しない（待ち行列は最新 1 本に置き換わる）／security.yml の watch に timeout
date: 2026-11-16
---

〈依頼〉2026-11-15 に 7 本が続けて merge され、本番が 2026-10-22 の版のまま止まっていた。連続 merge でも最後の main が必ず本番に届く形へ CI の concurrency／配備の構成を直す（検査を省いて速くするのは不可）。

## 0. 測った（2026-11-16）

| 何 | 結果 |
|---|---|
| main の CI push run（11-15 17:51〜18:37 UTC） | 24ff5a57・9447fc5b・b6220633・892a8969・ab3ecbab・98beb3e4 の 6 本が **すべて次の push に cancel**。merge 間隔 3〜13 分、run は 17〜20 分 |
| 最後の c84eb35a（#1139） | 完走して**赤**: `ci-job-timeouts` が `security.yml:watch` に timeout が無いと言う。#1138 が job を足し、#1139 が門を足した——単独ではどちらも緑、合わせた木は誰も試していなかった |
| github-pages の deployment 記録 | 最新 success は 0b26439a（2026-10-22、deploy.yml の bot 経路）。main の CI push run が最後に緑だったのは 2026-10-13 |

## 1. 原因（構造）

`ci.yml` の concurrency が main の push でも `cancel-in-progress: true` だった。「新しい commit は古い commit を全部含む」は**新しい run が緑のときだけ**正しく、merge 間隔が run の長さより短い間は、**最後の 1 本が緑でない限り途中の緑の木は 1 本も公開されない**。最後の 1 本が赤になる確率は、まさに並行 PR の skew で高い（今回）。

## 2. 直したもの

- **`ci.yml`**: `cancel-in-progress: ${{ !(github.event_name == 'push' && github.ref == 'refs/heads/main') }}`。main の push だけ cancel しない。GitHub の concurrency は 1 グループに「走っている 1 本＋待っている 1 本」しか持たず、新しい push は**待っている方を置き換える**ので、走っている commit は完走して緑なら公開し、その後で最新の commit が走る。連続 merge の代償は最大 run 1 本分の待ちで、検査は 1 つも省いていない。PR・dispatch・nightly は従来どおり cancel する。公開の順序は従来どおり `pages-production` の中の `pages-publish-guard.mjs` が守る（祖先は公開しない）。
- **`security.yml` の `watch`**: `timeout-minutes: 15`。予定実行でしか走らず 2026-11-16 時点で一度も走っていないので、`docs/TESTING.md` の規則どおり床の 15 分。これで main が緑に戻る。
- **`docs/RELEASE.md`**: 「新しい push が古い run を cancel する」を現状へ。
- **検査** `tests/deploy-order-checks.test.mjs` ⑤: `cancel-in-progress` の式を**イベントごとに評価**し、main の push だけ `false`、他は `true` であることを測る（④ の固定値 `true` の主張は⑤へ移した）。

## 3. 退けた案

- **deploy を別 workflow（workflow_run）に分ける**: 公開が「緑だった run の成果物」を拾う形になり、ci-build-once（同じ run の `dist/` を公開する）と publish guard の 2 か所を作り直す割に、今回の欠陥（run が完走しない）は cancel をやめるだけで消える。
- **merge queue**: 検査を 2 回（PR と queue）走らせる構成で、利用者に設定変更を伴う。今回の skew は次の main run が捕まえ、その間も直前の緑が公開される。
