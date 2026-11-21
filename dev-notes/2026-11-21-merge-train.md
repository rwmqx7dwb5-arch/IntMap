---
title: PR が溜まり CI が 180 ジョブ待ち——1 回の CI で N 本を通す merge train を足し、台帳 3 本を merge driver に載せた
date: 2026-11-21
internal: 開発工程（CI の待ち行列と PR の着地）だけの変更で、読者に見える挙動は変わらない
---

〈依頼〉 マージが溜まりすぎている。CI を爆速にし、溜まった PR を流す。

## 0. 測った（2026-11-21 14 時頃）

- open PR 55 本（BLOCKED 43・DIRTY 11）。CI の未完了 run 53 本、ジョブは**実行中 19・待ち 180**——同時実行の天井（20）に張り付き。
- 成功した PR の run 44901155717: 実働の合計 約 78 runner 分、依存の最短経路 約 25 分、**開始から終了まで 2 時間 24 分**（各ジョブの待ち 25〜73 分）。
  ⇒ ジョブの中を速くしても効かない。効くのは**枠へ流し込む run の本数**。1 本の PR は PR で 1 回・main で 1 回、全部を走らせる。
- DIRTY の正体: GitHub は merge driver を使わない。`git merge-tree` を driver なし／ありで全 PR に当てると、衝突 13 本のうち 8 本は driver だけで解けた（`docs/FILES.md` が 11 本）。作ったセッションが去った後、誰も rebase しない。
- 細分化しすぎではなかった: open PR の大きさの中央値 1,412 行（merge 済みは 353 行）。衝突は同じ共有ファイル（`docs/FILES.md` 46 本・perf-baseline 29 本・能力表 26 本…）と、**同じ主題を並行で作った PR どうし**から来る。
- 赤い PR の 4 本（#1321・#1343・#1318・#1369）は `check:perf` の `dist.total` だけで落ちていた。検査された木は「#1310 の main＋PR」で、#1310（bot が天井を下げた commit）の天井がその木自身の build より 7.7 MB 低かった。今の main（#1280 が実測へ上げ直した）の上では消える赤。bot 側の欠陥は別件。

## 1. 直したもの

- `scripts/merge-train.mjs`: auto-merge の付いた open PR を origin/main の上へ driver 込みで順に merge し、生成器と `regen` を 1 回走らせた木を **1 本の PR・1 回の CI** にする。載った PR は自分の auto-merge と走行中の run を止める。列車の squash commit の `Merge-Train-Includes: #N@<sha>` を `.github/workflows/merge-train.yml` が main で読み、head が同じ PR を閉じる（載った後に push されたものは閉じない）。赤い列車は `--release` で戻す。候補は「各 PR についての事実」で決める（一覧を持たない）。`.gitattributes` を変える PR は後続の merge の解き方を変えるので先頭に載せる。
- `scripts/data-governance.mjs --update` を冪等に: 中身が同じなら `generatedAt` を書き換えない（毎回の時刻だけの書き換えが、どの 2 本の PR も同じ行で衝突させていた）。
- `.gitattributes`: `data/device-storage-ledger.json`・`data/connection-ledger.json`・`data/governance-ledger.json` を `regen` 種別に。3 本とも書き手が木から導く台帳で、試しの列車で断られた 30 本のうち 15 本がこのどれかで衝突していた。
- 手順: `.agents/skills/intmap-round/` §5、`docs/AGENT-SETUP.md` §12、`docs/FILES.md`。

## 2. しなかったこと

- **PR の CI を「触った範囲だけ」に絞ることはしなかった**: 1 本の CI の 78 分のうち Regression（約 40 分）と Gates（約 26 分）は文書・台帳も読む検査で、範囲で外すと捕まえていた退行を捕まえなくなる（本質的な削除）。同じ効果（run の本数を減らす）を列車が品質を下げずに出す。Security を絞る #1321 は列車に載せる。DB checks は 28 秒で絞る意味が無い。

## 3. 検査

`node --test tests/merge-train-checks.test.mjs`（trailer の往復・候補の事実・順序と上限・main の workflow が trailer で起動すること）。実データで `--build --dry` を 2 回（push も PR もしない）。

## 4. Regression の shard を main の実測で詰める

- 実測: 台帳 `.github/checks-cost.json` は 2026-10-01 の計測のまま（`--update` は手作業で、それ以降誰も走らせていない）。757 ファイルのうち 345 件が中央値 0.5 秒で見積もられ、run 44901155717 では shard 2/3 の合計が 2,694 秒、1/3 は 1,297 秒だった（job の壁時計は 18 分と 9 分）。
- 直したこと: ブラウザ層が既に持っている経路（main の `timings` job → actions cache → 次の run）を Regression にも通した。main の run が各 shard の計測を台帳へ畳み込んで cache に保存し、各 shard はそれを `$RUNNER_TEMP` に戻して `IM_CHECKS_COST` で指す（checkout の外なので、同じ job の clean-tree 検査に触れない）。cache が無ければ、コミット済みの台帳で今までどおり計画する。
- 今回の計測で台帳も一度更新した（3 shard とも予測 2,050 秒）。`--update` は今の木に無いファイルの行を捨てるようにした（別 branch の計測に main に無い検査が入っていた）。
- 総 runner 分は減らない。減るのは 1 run の壁時計（最も遅い shard）。

## 5. 最初の列車（#1372・23 本）で分かったこと

- CI の赤 4 件はどれも「各 PR 単独では緑、合わせると赤」だった。列車はそれを main ではなく列車の上で捕まえた。
  - **能力目録の位置の取り合い**: #1346 の `model.discover` と #1343 の `geo.ml` が `spatial-analysis` 節の位置 52 を両方とも取り、目録が組み立てられなかった（Regression 3 shard の赤のほとんどがこれ）。列車の上で `geo.ml` を空いている 51 へ移した。
  - **同じ向きに動いた数は 1 回分しか動かない**: 2 本の PR がそれぞれ Edge Function を 1 本足し、文書を 25→26 と同じに書き換えた。両側の変更が同一なので git は衝突と見なさず、合わせた木は 27 本なのに文書は 26 のまま。migration（71→73）と deep tier の spec 数（171→172）も同じ形。`tokens` の driver は衝突した hunk にしか呼ばれないので届かない。列車の上で実体の数へ直した。
- ⇒ `--build` は push の前に手元で `check:docs`・`check:catalog`・`check:capabilities` を走らせ（数秒〜数十秒）、赤なら push しない。直して commit したら `--push-only <worktree>` で続ける。CI の 1 時間を待たずに分かる赤は、CI に出さない。
