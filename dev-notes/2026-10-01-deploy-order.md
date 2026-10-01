---
title: 古いコミットが新しいコミットの上に本番公開されていた——#849（8d7e473）の公開を親の #848（1a66ec7）が 4 分後に上書きした。公開する全ジョブが直前に「いま本番にあるのはどれか」を deployment 記録で訊き、その祖先なら公開を拒む。main 上の CI の dispatch が公開を cancel していた件は並行の #855 が同じ日に直したので、その式を検査で評価して守る
date: 2026-10-01
---

〈依頼〉2026-10-01 の本番検証が測った:「#849（8d7e473・データ更新）の Pages 公開が 20:13:48 に終わり、その**親** #848（1a66ec7）の公開が 20:17:32 に終わって上書きした。本番の build stamp は `1a66ec7`、`data/tle/catalogue.json` の `builtAt` は #849 のものではない」。根本原因を見つけ、既に公開されたコミットの祖先は公開を拒むようにし、回帰検査を付ける。#850・#851 の main CI の赤は他セッションの持ち物か確かめてから触る。追加で（利用者承認）main 上の dispatch が公開を cancel する件も直す——⚠ 着地前に、別セッションの #855（`ci-dispatch-keeps-publish`）が同じ欠陥を `format('dispatch-{0}', github.ref)` で直して先に merge したので、こちらの concurrency の変更は rebase で取り下げ、#855 の式をそのまま残した。

## 0. 測った

**run と deployment の時系列（`gh run list`・`gh api …/deployments?environment=github-pages`）**

| 時刻 (UTC) | 出来事 |
|---|---|
| 20:07:52 | #848 merge（1a66ec7）。CI push run 36770469543 開始 |
| 20:11:29 | #849 を catalogue bot（`tle-refresh.yml` → `land-bot-pr`）が **GITHUB_TOKEN で** merge（8d7e473・1a66ec7 の子）。**push の workflow は起動しない** |
| 20:11:32 | lander が `deploy.yml` を dispatch（run 36770879428） |
| 20:13:48 | deployment 6769135142 = **8d7e473** 公開 |
| 20:17:32 | #848 の CI run の `pages` ジョブが環境 `github-pages` の deployment 6769207899（**1a66ec7**）を作る |
| 20:18:38 | その deployment が success——**親が子を上書き** |

`ci.yml` の注釈は「新しい push が古い run を publish ごと cancel するので、古いコミットが新しいコミットを上書きすることはない」と述べていた。これは**新しいコミットが push で CI run を始める**ときにしか成り立たない。bot の merge は run を始めないので、親の run は誰にも cancel されず、`pages-production` の concurrency group は**公開を直列にするだけで順序を付けない**。⇒ 遅く終わった古い run がそのまま公開した。

**別の原因（同じ症状の「届かない」側）** — `ci.yml` の concurrency group は `ci-CI-<github.ref>` で、main 上の `workflow_dispatch` は push の run と**同じ group**に入る。dispatch の run は公開しない（`pages` は `event_name == 'push'` を要求）のに、push の run（公開する唯一の run）を cancel する。

| dispatch | cancel された push run | 経過 |
|---|---|---|
| 2026-09-30 21:40:56 c3990ff（#850） | 36780919393 | 31 秒 |
| 2026-10-01 02:06:20 281e584（#852） | 36804179219 | 50 秒 |

どちらの dispatch も公開しないので、#850〜#852 は本番に届いていなかった（#851 は自分の push run が r169 #3b で赤）。⚠ 02:46 に誰かが `deploy.yml` を押して 281e584 が公開され、いまは届いている。

**観測器も嘘をついていた** — `worktree.mjs status` は「本番 8d7e473」と述べていた。公開した run を**開始時刻**で並べて最新を本番としていたので、先に始まって後に公開した 1a66ec7 を見落とした。

## 1. 直したもの

1. **`scripts/pages-publish-guard.mjs`（新規）** — 本番にあるコミットを `github-pages` 環境の **最新の success な deployment** から読み（`/build-info.json` は CDN の max-age 600 で遅れうるので使わない）、GitHub の compare（base=本番・head=候補）が `behind`＝**候補が本番の祖先**なら公開を拒む。`identical`（再公開）・`ahead`・`diverged`（履歴の書き換え。順序が無い）は公開。API が答えないときは exit 1（「分からない」は「許可」でも「拒否」でもない）。拒否は緑（本番は既にこのコミットを含んでいる）。
2. **`ci.yml` の `pages` と `deploy.yml` の `deploy`** — `pages-production` の group の**中で**、publish の直前に guard を走らせ、`publish == 'true'` のときだけ `actions/deploy-pages` を走らせる。権限に `contents: read`・`deployments: read` を足した（checkout はこの 1 ファイルだけの sparse）。
3. **`rollback.yml`** — 古いコミットを出すのが目的なので guard を走らせない。その理由をヘッダの `publishes-older-by-design:` 行に書き、検査がその行を読む（無ければ guard を要求する）。
4. **`ci.yml` の concurrency** — 直したのは #855（dispatch は ref ごとに push と別の group）。この回は変更せず、検査 ④ がその式を評価して守る。
5. **`worktree.mjs status`** — 本番のコミットを同じ `liveDeployment()`（guard と同じ 1 つの規則）で読む。`gh api` 1 回が 4.3〜39 秒（このマシンで実測）なので 1 回 12 秒まで待ち、答えが無ければ「不明」と述べる（run から推測しない）。

## 2. 検査

`tests/deploy-order-checks.test.mjs`:
- ① 判定表（`behind` だけ拒否・知らない status は throw）
- ② 2026-09-30 の deployment 記録を再生し、**実際の祖先関係**（使い捨ての git リポジトリに 234b141→1a66ec7→8d7e473 を組む。CI は 1 コミット深さの checkout なので）で、20:17:30 時点の 1a66ec7 の公開が拒まれ、20:13:47 時点の 8d7e473 の公開は通ることを確かめる。同期・非同期の両方の読み手で。
- ③ `.github/workflows` から `actions/deploy-pages` を使う全ジョブを**発見し**、guard が先に走る・publish がその答えに依存する・`continue-on-error` が無い・権限がある・`pages-production` の中、を要求する。免除は rollback.yml だけ。
- ④ concurrency の式を**評価して**（GitHub の `format()` も解く）、main の dispatch が push と別 group、同じ branch の dispatch どうしは cancel しあい、別 branch どうしはしない、push・PR・nightly は従来どおりを確かめる。
- 変異検査: #855 より前の `ci.yml` に戻すと ③④ が赤（実測）。

既存の検査の修正: `ci-build-once` ⑥ の権限の完全一致に 2 つの read を足した。`reserved-hosts-and-deploy-reach` ② は deploy ジョブの本文を**先頭 1,200 文字**で切っていたので、guard の注釈で publish がその外へ出て赤になった——次のジョブの鍵までで切るようにした（窓の長さが関連性を決めていた）。

本番の実データでも走らせた（2026-10-01、本番 281e584）: 候補 1a66ec7 → `behind`・拒否、候補 281e584 → `identical`・公開。

## 3. #850・#851 の main CI の赤（触っていない）

- #850 の deep rest（`restored-layer-before-style.spec.js:134`・`r170.spec.js:122`・`r410-late.spec.js:89`）は **#852**（`feat/restored-layers-under-load`、別セッション・merge 済み）が扱った。
- #851 の `r169.spec.js:156`（R169 #3b）は #851 自身（`feat/news-list-keeps-position`、別セッション）の spec。
- main の HEAD 281e584 の dispatch run 36804246171 は core・deep の全ジョブが緑（Browser rest・Deep rest 1〜5 を含む）。r169 #3b はその run で通っている（1 回赤・1 回緑なので不安定の疑いは残る）。

## 4. 残したこと

- bot の merge は自分の push run を持たないので、`deploy.yml` は**ブラウザ段を通っていない木**を公開する（従来どおり。静的ゲートだけ）。今回の範囲外。
