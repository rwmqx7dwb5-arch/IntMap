---
title: 起動予算の天井ファイルを、並行 PR の衝突の常連から外す——PR が落ちるのは天井＋幅を超えて増えたときだけにし、下げるのは main の CI（perf-ceiling.yml が build の実測に --tighten をかけ、bot の PR を衛星カタログと共有の lander で「測った main の上にまだ乗っているときだけ」着地させる）。--update は超えた行だけを上げる
date: 2026-10-01
---

〈依頼（利用者承認 2026-10-01）〉`check:perf` の天井ファイル `tests/perf-baseline.json` が並行 PR の衝突の常連
（2026-09-30 に 1 日 4〜5 回。起動の中身を変える PR はほぼ全部ここで衝突し、rebase のたびに build して
`--update` していた）なので、「main の CI が天井を自動で下げていく」方式に変える。①減った・幅の中で動いた
PR は天井ファイルを触らずに緑、増えて幅を超えたときだけ赤 ②下がった分は main の CI が測り、bot が PR を
作って auto-merge（tle-refresh の仕組みを写さず再利用）③modules / requests も同じ枠組み ④緩みの期間を bot の
周期で上限づけ、緩みの幅を測る ⑤回帰 ⑥文書。js/・gate-lock・supabase/ は触らない。

## 0. 測った（着手時）

- 規則（`scripts/perf-budget.mjs` `judge()`）: eager は**両方向のラチェット**（天井×1.005／+2 kB を超えたら赤、
  天井から 4 %／16 kB を超えて下回っても赤＝「`--update` で下げよ」）、`requests`・`modules` は**完全一致**、
  async と dist は天井だけ。⇒ 起動グラフに触る PR は**どちらの方向でも**天井ファイルを書き換えさせられていた。
- `--update` は `measure()` の結果で**ファイル全体を書き直す**。2 本の PR がそれぞれ別の 1 行を受け入れても、
  全行が衝突した（memory の「--update は全項目を書き換える」の罠）。
- 直近の履歴 `git log -- tests/perf-baseline.json`: #820・#821・#829・#831・#833・#835・#836・#837 と、
  起動に触る PR がほぼ全部この 1 ファイルを持っていた。
- 本 worktree の build（Windows）で `check:perf` は緑、eager raw が天井 +0.8 kB（幅 23 kB の中）。
- リポジトリ設定（`gh api .../rulesets`）: `strict_required_status_checks_policy: false`・bypass なし・
  `allow_auto_merge: true`。**strict でない**ので、bot の PR の checks が見た木と merge 後の木が違いうる（§2）。
- `tle-refresh.yml` の着地は、bot の PR が `action_required` で止まる（#R372）・run の作成待ち・取消と赤の区別・
  merge・`deploy.yml` の起動（GITHUB_TOKEN の push は他の workflow を起こさない）を全部実測で得ていた。
  `DECISIONS.md` はそこを「写さない」と既に決めている（上流の死活の回）。

## 1. 判定の規則（`scripts/perf-budget.mjs`）

- 全行を 1 つの一覧 `metrics(m, b)` で歩き、判定・上げ・下げの 3 つが同じ一覧を読む（片方だけが行を忘れない）。
- **幅は 1 つ**: `band(key, 天井) = max(天井×0.5 %, 2048)`、個数は 0。「churn はどれだけか」への答えを 2 つ持たない。
- `judge()`（PR が受ける門）: **天井＋幅を超えて増えた行だけが error**。減った行・新しい chunk・消えた chunk は
  note（「main の CI が追う」）。天井の上にある行を `loose`（差・幅の何倍か・決めずに増やせる量）として返し、
  最も緩い行を `slackest` に。CLI は毎回 `slack:` 行を印字する（門が緩みで落ちなくなった分、見えるようにする）。
- `tighten()`（main の CI だけが呼ぶ）: 全行を `min(天井, 実測)`・新しい chunk に天井・消えた chunk の行を削除。
  **上げない**。提案するのは *due*（幅を超えて下回った行・個数が 1 でも下・chunk の出入り）があるときだけで、
  churn では PR を作らない。提案するときは幅の中の行も一緒に下げる。chunk の行は整列して書く（差分は動いた行だけ）。
- `raise()`（`--update`）: **超えた行だけ**を実測まで上げ、他の行は 1 バイトも書かない。理由は dev-notes に書くよう印字。
- 旧 STALE（4 %／16 kB）は、それが仕えた規則（PR が下げる）ごと撤去。

## 2. bot の流れ

1. `ci.yml` の `build` ジョブ（main への push のときだけ）が `perf-budget.mjs --report > perf-measured.json` を
   `perf-measured-<attempt>` として上げる（数 KB。280 MB の site artifact を bot に落とさせない）。
2. `.github/workflows/perf-ceiling.yml` が `workflow_run`（CI・completed・main）で起き、push の run で取消されて
   いないものだけを扱う。`git ls-remote` で **main がまだ測った commit か**を確かめ、動いていれば何もしない
   （新しい main の run が測る）。
3. artifact を落として `--tighten --measured`。変化が無ければ、古い run が残した bot の PR を閉じる
   （古い実測の天井を後で着地させない）。変化があれば `bot/perf-ceiling` に force-push し、PR を作る／本文を更新。
4. `.github/actions/land-bot-pr`（**tle-refresh.yml から移した lander**）が run を承認し、checks を待ち、merge し、
   `deploy.yml` を起動する。`require-current: 'true'` で、**PR の head が main の head を含む間だけ**
   merge する（strict でないので、merge 後の木を PR の checks が見たことをここで保証する）。main が動いたら
   `superseded` で止まり、次の run が提案し直す。merge は `--match-head-commit` で checks を見た head だけ。
- **deploy**: 天井ファイルは `dist/` に入らないが、`deploy.yml` を起動する。本番の `build-info.json` の sha が
  `release-state`・`worktree.mjs status` の「本番に出ているか」の読み手で、起動しないと bot の commit が
  「届いていない」と読まれ続ける。既存の規則（`audit-sweep-0927` ④: GITHUB_TOKEN で main に着地するものは
  deploy を起動する）とも一致。**循環しない**: deploy は CI を起こさず、PR の run はこの workflow を起こさない。
- **緩みの上限**: bot の着地後、どの天井も実測より幅 1 つを超えて上には残らない（due でなければ幅以内、
  due なら 0）。よって後続の PR が決めずに増やせるのは最大で幅 2 つ。期間は「main の CI が走る次の push」
  1 周。⚠ GITHUB_TOKEN の merge（bot 自身・衛星カタログ）は CI を起こさないので、main の最新が bot の
  commit のときは次の人の push まで延びる（その間も「増えた PR は落ちる」は変わらない）。

## 3. lander の共有（写さない）

`tle-refresh.yml` の着地の段を `.github/actions/land-bot-pr/action.yml` に**移した**（コメントの実測ごと）。
差分は: `what`（ログの名詞）、`require-current`、出力 `result`（none／landed／lost／superseded）、merge に
`--match-head-commit`。「race に負けたが main の catalogue は新しいか」の判定は catalogue 固有なので
`tle-refresh.yml` に残し、`result == 'lost'` のときだけ走る段にした（元の挙動と同じ: PR が無ければ走らず、
赤なら走らない）。検査 `audit-sweep-0927` ④ と `news-feed-audit` R372 ⑨ は lander の新しい置き場を読むように
した（④ は workflow と local action の両方を母集合にし、`uses:` で lander に届く workflow を着地する側と数える）。

## 4. 否定した・採らなかった見立て

- **ci.yml の中に bot の job を置く**: main の run の `cancel-in-progress` が次の push で着地を殺すのは都合が
  よいが、ci.yml は「書き込む job は pages と deep-alarm だけ」を明言しており、書き込み権限を足したくない。
  `workflow_run` の別 workflow にした（同じ性質は concurrency `perf-ceiling`・cancel-in-progress で得る）。
- **`gh pr merge --auto`**: strict でないので、checks が緑になった時点で main が動いていても merge される
  （試験されていない組み合わせが窓の間ずっと開く）。同期の lander で「main が動いていないこと」を確かめる。
- **main が動いても update-branch して PR の CI に裁かせる**: 安全だが、main が別の PR で増えていたときに
  bot の PR が赤になり、それを「本物の赤」と区別できない。動いたら譲るほうが単純で誤警報が無い。
- **理由の記録を機械で要求する**: `check:surface` の作法（dev-notes に名前を書く）に倣う案。上げたかどうかは
  PR と main の天井の差でしか分からず、PR の中の門からは見えない。`--update` が理由を書くよう印字するに留めた。

## 5. 検査

- 新規 `tests/perf-baseline-auto-tighten-checks.test.mjs`（8 件）: 偽の build report と実ファイルの dist/ を
  `measureFrom()`（門と同じ読み方）に通して判定。①縮小・幅内・chunk の出入りは緑 ②あらゆる種類の行の増加が
  赤、幅のちょうど端は緑・+1 で赤 ③tighten は 300 通りの摂動で一度も上げず、着地後に緩みが残らない
  ④churn では提案しない・個数 −1 と chunk の出入りは due ⑤raise は超えた行だけ ⑥緩みの上限（幅 1 つ／決めずに
  増やせるのは幅 2 つ）⑦追跡中の基準は自分自身に対して tighten しても 1 バイトも変わらない ⑧配線（CI の
  名前・completed・main・schedule でない・artifact 名の一致・--tighten だけ・lander と require-current）。
- 更新: `perf-startup-and-cache-checks` r311 ②③（改善は error でなく loose と note に）、`audit-sweep-0927` ④、
  `news-feed-audit` R372 ⑨、コメント 2 か所（`layer-atlas-chart`・`news-module-split`）。
