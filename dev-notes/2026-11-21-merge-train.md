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

## 6. 最初の列車の 2 周目で直したもの・降ろしたもの

- **検索と監査が目録を 2 通りに読んでいた**: `js/atlas-capabilities.js` の `docBlocks` は、能力の説明の始まりが見つからないとき裸の `"<綴り>"` を探す。#1343 が `spatial-analysis` 節を長くして model.discover の `{"type":"modelDiscover"` が次の断片へ移ると、その予備の規則が data.gisRemote の `"action":"discover"|"search"|…` に当たり、残りの文を model.discover のものと読んだ（data.gisRemote は自分の説明のどの語でも 0 点）。引数の**名前**（`"show"?:`）を言及と読まない規則は 2026-10-13 からあったが、**値**（`:` の後・`|` の選択肢）は無く、監査（`scripts/atlas-capability-audit.mjs` の `marksOf`）には名前の規則すら無かった。⇒ `quotedIsArgument` を 1 つ置き、検索も監査もそれを呼ぶ（`tests/merge-train-checks.test.mjs` ⑥）。
- **#1368 を降ろした**: 新しい `js/gis-engine-domain.js` が製品のどこからも import されていない（`audit-structure` ①）。#1368 自身の CI も赤。
- **#1364 を降ろした**: ブラウザ全体の時間の天井 5,250 秒に対し、#1356（55 秒）と #1364（12 秒）が単独ではそれぞれ収まり、合わせると 5,258 秒。天井は上げずに時間を返す方針（`scripts/test-budget.mjs` の履歴）なので、#1364 は 8 秒を返してから次の列車に載せる。

## 7. 3 周目: 起動予算の天井と、2 回数えられた数

- **天井 6 行を merge 後の build で上げた**（`perf-budget.mjs --update`）。merge driver は両側が動かした量の行で main の値を取る（`intmap-clash=upstream`）ので、各 PR が理由を書いて上げた天井は列車の上で消え、合計で超える。上げ幅を、列車に載った PR が自分の branch で上げた幅の合計と突き合わせた: async.raw +676 kB（PR の合計 1,259 kB）・dist.assets +696 kB（1,205）・atlas-cap-runs +86 kB（127）・atlas-console +41 kB（65）は合計の内側。async.gzip +247 kB（220）と gis-core +20 kB（17）は合計を 27 kB と 3 kB 超える——前者は合わせた束の圧縮率、後者は main に先に入った #1289（gis-network）と列車の #1281（gis-semantics）が同じ chunk に同居した分。新しい機能を運ぶ遅延読み込みの chunk だけで、起動時に読むものは増えていない。
- **同じ PR が main と列車の両方に入ると、`tokens` の driver はその増分を 2 回足す**（#1332・#1355・#1293 などが列車に載った後に元のセッションから単独で merge された）。plan(152) が 158 に、表の数 68 が 71 に、能力の数 270 が 272 になった。全部を実体へ戻した。同じ向きに動いた数が 1 回しか動かない（§5）のと鏡の形で、どちらも push 前の速い門が捕まえる。
- ⇒ push 前の門に `check:testbudget` と build ＋ `check:perf` を足した（数分。CI は 1 時間）。

## 8. 4 周目: 車両が単独で main に入ると、列車の上で増分が 2 回数えられる

- 列車に載せた後も元のセッションが auto-merge を掛け直し、#1293・#1299・#1332・#1333・#1340・#1355 が単独で main に入った。列車へ main を取り込むと、`json` の `sum` と `tokens` の driver は「両側が動かした」と読んで同じ PR の増分を足す——翻訳の床 de/es/ru が 7204→7212（実体 7205）、§7 の plan・表・能力の数も同じ形。
- 実測で直したが、根は「列車を main の上で更新するとき、既に main に入った車両を差分として持ったままにする」こと。次に列車を作り直すときは、取り込みではなく **main の上で残りの車両だけから組み直す**（`--build` の候補は既に main にあるものを `MERGED` として外す）。
- ⚠ 取り込みで衝突が残ったまま `git add -A` で commit すると、マーカーごと入る（push 前に `git grep` で捕まえて巻き戻した）。
- 5 周目: main の bot（#1374）が天井を下げた後に取り込んだので、§7 の 6 行が main の値へ戻っていた。同じ理由で上げ直した（前回からの増分は main に入った #1308 の分）。

### 列車の組み直し（2026-11-24）

CI 緑のあとに main が #1294・#1358・#1376 で動き DIRTY になった。#1294 は列車の車両でもあり、同じ PR が両側にあると sum/tokens の driver が増分を 2 回数え、表の一覧・plan・関数数・文の行が二重になった。数を手で戻すのではなく、列車の中の #1294 の merge を `revert -m 1` で取り消してから main を取り込んだ（plan は履歴から 152 と求め直し、二重の行は残っていない）。#1348 は別セッションが同じ中身を #1381 として出し直したので列車から外した。乗っていた 12 両中 8 両がそれぞれのセッションの push で head を動かしていた（ほとんどは perf 天井と数の追従、#1346 は能力 id を `model.find` へ改名、#1281 は位置の衝突を自分で解消）ので、最新 head を取り込み trailer をその sha にした。perf の天井は取り込んだ車両の和で 5 行上がり、`--update` で実測に合わせた（列車の中身＝各車両がそれぞれ理由を書いた増分の和）。

残る欠陥: 乗車後も車両のセッションが head を動かし続け、auto-merge を付け直す。`--build` が publish 直前に head の移動を検出して取り込み直すこと、および車両側のセッションに「乗車済み」を伝える経路が要る。

追記（同日）: 手で解消した main の取り込みで、衝突を解く**前に** `regen` を走らせたため、衝突マーカー入りで解析できなかった `js/atlas-console.js`・`js/atlas-toolsurface.js` の行が output-taint の台帳から消え、CI の Regression で落ちた。台帳を解消後の木から書き直した。`--build` は衝突した車両を載せないので、この順序の誤りは手作業の取り込みだけで起きる——生成器は衝突を解いて commit した後にだけ走らせる。

### 再取り込み（2026-11-24 夜）

- **#1324 が main へ単独で着地**したので、列車内の 2 つの車両 merge（初回と最新 head の取り込み）を `git revert -m 1` で取り消してから main を取り込んだ（増分の二重計上を防ぐ。#1294 と同じ形）。trailer からも外した。
- main の #1337（web-browse）との衝突 2 件は両方の内容を合わせて解消した。`relay-guard` を使う関数は実数で数えて 24 本（認証あり 6・任意 1・無認証 17）。
- 数を実数に合わせた: Edge Function 28・migration 75・表 70・`00_structure_test.sql` の `plan(156)`（70 表 × 2 ＋ 単発 16）。`06-supabase.md` の表一覧で `connections` の行が 2 回出ていたので、片方を消して `web_session_journal` を足した。
- 起動予算: main 側で天井が実測まで下がっていたので、列車の build で 4 行を上げ直した（async.raw 15231.7 / gzip 5178.0 / atlas-cap-runs 1051.5 / atlas-console 1180.0 kB）。上げた分は列車に載った車両のコードで、新しい費用ではない。

### 列車 #1372 の結末（2026-11-25）

列車の CI は 3 回全部緑になったが、そのたびに CI が終わるまでの間に main が進んで DIRTY に戻り、着地できなかった。その間に車両の PR は、所有するセッションが個別に（または統合 PR を通して）main へ入れていった。#1336・#1276・#1314・#1343・#1346・#1369 は個別に、#1290 は #1315 に置き換わって着地した。そこで別のセッションが #1372 を閉じた。失われた変更は無い。

分かったこと: **車両を所有するセッションが動き続けている間は、列車は追いつけない。** 列車に載せた時点で車両側の auto-merge と push を止め、載ったことを車両側へ知らせる仕組みが要る（列車の 1 回の CI よりも main が速く進むなら、列車は永遠に DIRTY になる）。
