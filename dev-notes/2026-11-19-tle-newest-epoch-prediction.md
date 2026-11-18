---
title: 衛星カタログの newestEpoch が「取得より未来の予測 epoch」を数え、束が 3 日先の日付を名乗って回帰テストが落ちた——測定でない epoch を数えない
date: 2026-11-19
---

〈依頼〉 データ更新 PR（data/tle-refresh）が Regression 3/3 で赤いまま放置されていた。MERGED まで通す。

## 0. 測った
- `tests/restored-layers-under-load-checks.test.mjs` ⑥ が落ちる（`+2 d: 790 drawn against 15726`）。PR のデータを main に重ねて単独で再現した。
- 原因: CelesTrak は Chandra（CXO 25867）の要素を取得より **3 日先の epoch** で配る（builtAt 2026-11-18 に対し 2026-11-21）。`scripts/build-tle-snapshot.mjs` は全件の最大を `newestEpoch` にしていたので、束は 11-21 を名乗った。テストはその日を基準に ±2 日を測るため、残りの大半の要素の span から外れた。画面にも「(2026-11-21)」と未来の日が出る。
- 同じ PR が最初に赤かった `check:perf` と Regression 2/3 は、古い土台のせい（main を取り込んで消えた）。

## 1. 直した
- `newestEpoch` は取得時刻以前の epoch の最大とする（予測は同梱もされ伝播もするが、「束がどの日の測定か」には数えない）。`tests/engine-satellites-checks.test.mjs` の照合も同じ規則。
- この PR の `data/tle/catalogue.json` の `newestEpoch` は、同じ規則で計算し直した値に置いた（2026-11-21 → 2026-11-18T08:45:58Z）。この端末から CelesTrak へ届かず生成器を丸ごとは走らせられなかったため、他のデータには触れていない。次の定期更新は修正済みの生成器が書く。

## 2. 引き継ぎ
- 失効条件: CelesTrak が予測 epoch を配らなくなれば条件分岐は働かないだけで害はない。
