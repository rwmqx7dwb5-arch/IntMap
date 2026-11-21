---
title: 完了判定の指摘が一度きりで、直した後は誰も確かめていなかった——独立した読みを記録が増えたときだけ繰り返し、満たした部分も Atlas に見せる
date: 2026-11-20
newsen: Atlas's completion check now re-reads the request after Atlas acts on a finding and shows what is already covered, so a half-finished comparison is no longer taken as done.
newsjp: Atlas の完了判定が、指摘に応じて作業した後に依頼をもう一度読み直し、満たされた部分も Atlas に示すようになり、半分だけの比較が完了として通らなくなった。
---

〈依頼〉 総合技術調査（2026-11-20）。範囲・出典・分析条件・成果物を照らし合わせ、何が達成され何が未完成かを Atlas が把握して自己修正できるようにする。手数上限・固定分類で縛らない。#1305（成果物の中身の観測）の上に積む。

## 0. 測ったこと
- `js/atlas-agent.js` の独立した読み（verify）は 1 ターンに 1 回。指摘を受けた Atlas が作業しても、**その作業が指摘を閉じたかは誰も確かめず**、`results.length` が増えただけで指摘を「処理済み」として捨てていた（「10 港を見つけた」→「残り 10 港」の指摘→ 1 港だけ足して終わり、でも complete）。
- 指摘は「足りないもの」だけで、**既に満たしたもの**が Atlas に渡らないので、全体のどこまで来たかを自分で組み立てるしかなかった。

## 1. 変えたこと
- 読みの再実行条件を「1 回だけ」から「**前回の読みより記録（results）が増えたとき**」へ。記録が同じなら同じ観測の二度目になるので走らない（one-pass-or-a-reason）。Atlas が作業せず「要らない」と答え直した場合は従来どおり再読せず、指摘は記録に残る。回数の上限は足していない（再読には Atlas の新しい作業が要り、既存の maxSteps／時間が柵）。
- 読み手へ `previous`（自分の前回の指摘）と `round` を渡し、作業が指摘を閉じたかを判断させる。読み手は `met:[{need,how}]`（満たした部分とその根拠）も返し、Atlas への注記に「Already covered」として載る。`trace.goalLedger = {rounds, met, unmet}` に**観測できた最後の読み**を残す（観測できなかった読みは台帳を書き換えない）。
- 規則文に、範囲（挙げた/含意した対象の全部か標本か）・必要な出典・分析条件/期間・成果物の形を**照らす観点**として足した。分類表ではなく「この依頼が実際に述べるものだけを挙げる」と明記。判断は読み手と Atlas。コードは依頼の語を読まない。
- `atlas_verify` のスキーマに `met`（任意）を足し、`maxOutput` を 500→900。

## 2. 直していないもの
- 本番での実測（20 港の比較で再読が実際に不足を閉じるか）は未実施。`atlas_verify` は Edge Function の変更を含むので merge 後の CI deploy 後に確かめる。
- 最終回答への「未完成の部分」の表示は `unmet`（既存）に載るのみで、UI の変更はしていない。

## 3. 検査
`tests/atlas-goal-ledger-checks.test.mjs`（作業後の再読・同じ記録は二度読まない・met の運搬・previous の提示）。既存の `atlas-goal-verifier-checks` は無変更で通る。

## 4. perf 天井を上げた理由
`async.raw` の天井を 14136.4 → 14221.3 kB（+84.9 kB）。CI の測定値（14221.3 kB）をローカルでも再現した。増分の大半は #1305（Evidence Graph の永続・統合・ノート連携）と main 側の新しい遅延チャンク（`atlas-orchestrate` 82.3 kB・`gis-packed` 7.9 kB）で、この変更自身は `atlas-agent` / `atlas-goal-verify` の数百バイトのみ。遅延読み込みのチャンクで起動経路には載らない。main の CI が merge 後に測定値へ締める。

## 天井を上げた理由(perf)
async.raw の天井を 14221.0→14297.0 kB へ上げた。完了判定が依頼を読み直す経路（`js/atlas-agent.js`・`js/atlas-goal-verify.js`・Evidence Graph の配送）の分で、遅延チャンクの生サイズが増えた。
