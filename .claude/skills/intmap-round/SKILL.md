---
name: intmap-round
description: IntMap で「これを実装して」「これを直して」「これを追加して」のように、リポジトリのファイルを変更して最後に merge・deployment まで行く作業を始めるときの具体的な手順書。作業名（slug）の決め方、worktree の用意、並列分解、検証の段、PR・CI・squash merge・本番検証・原本同期・USB バックアップまでの実行順を持つ。質問に答えるだけ・調べるだけの依頼では使わない。
---

# IntMap · 作業を 1 本通す（intmap-round）

`AGENTS.md` §5 のワークフローを**実際のコマンドの順**にしたもの。規則は `AGENTS.md` と
`CONSTITUTION.md`、戦略は `.agents/rules/execution-strategy.md` にある。ここは**手順**だけ。

---

## 0. 着手前（並列にやる）

`AGENTS.md` §1 の事前確認は互いに独立なので、**まとめて 1 回で**済ませる。

```bash
node scripts/worktree.mjs status
```

これが一度に出す: 現在の branch / 未コミット変更 / 全 worktree / `origin/main` との差 /
最新の記録 / 前回までの未了（本番到達・本番検証・原本の同期。どれも **PR 番号**で述べる）。
ここに出ないものだけ個別に見る。⚠ **「空き番号」はもう出ない**——番号は名前にしない（§4）。

同時に（同じメッセージで）:

- 今回の主題の**正本**を [`docs/README.md`](../../../docs/README.md) で特定して、その文書を読む
- 調査が要るなら `intmap-scout` に投げる（自分で grep して回らない）

> **不明点があれば訊く。推測で埋めない**（`AGENTS.md` §8。訊き方は製品ごとに違う——
> `docs/AGENT-SETUP.md` §2）。
> 質問は説明文に混ぜず、必ず質問用の機能で行う。

---

## 1. 作業場を用意する

```bash
node scripts/worktree.mjs new <slug>
```

`<slug>` は**作業の主題**（小文字・数字・ハイフン、英字で始める。例 `dem-tile-budget`）。
これがやること（`AGENTS.md` §6 の要求そのもの）:

- slug を検める——**番号で始まる slug**（`r815-…`）と、**既に誰かが持っている slug**（branch
  `feat/<slug>`・worktree `wt-<slug>`・`tests/<slug>-checks.test.mjs`・`tests/<slug>.spec.js`・
  `dev-notes/*-<slug>.md`）を拒む
- branch `feat/<slug>` を `origin/main` から切る——**これが識別子の取得そのもの**。同じマシンの
  worktree は ref の名前空間を共有するので、同じ slug を 2 つ目のセッションが取ろうとすると
  **git 自身が拒む**（走査して「次の空き」を配る方式は、走査した全員に同じ答えを配っていた）
- **OneDrive の外**に worktree `wt-<slug>` を作る（原本は `main` の置き場であって作業場ではない）
- `node_modules` を原本から junction で貼る
- `.claude/launch.json` に `intmap-preview-<slug>` を足す。ポートは 4400〜4999 のうち、
  このマシンのどの `launch.json` も使っておらず、いま listen もされていない最小の番号
  （⚠ #R338 以降このファイルは**追跡対象外**。commit にも PR にも出てこない）
- 作業ディレクトリの絶対パスと、この作業のファイル名（§4）を印字する

**以降の編集は全部その worktree の中で行う。** 原本には 1 バイトも書かない。
PR を作ったら、その **PR 番号**が一意の識別子になる（squash merge が件名の末尾に `(#N)` を付ける）。

---

## 2. 実装する

`.agents/rules/execution-strategy.md` の §1〜§3 に従って分解する。要点だけ:

- 独立な仕事は**同じメッセージで**まとめて起動する
- 触るファイルが重ならない並列実装は、仕事ごとに `worktree.mjs new` で場所を作り、
  `intmap-implementer` に**絶対パスと触ってよいファイルの一覧**を渡す
- **同じファイルを 2 体に書かせない**
- 統合・commit はメインだけ
- 利用者に見える文字列を足したら `intmap-i18n` に 9 言語を回す

### どのモデルで走らせるか（Claude Code のみ・#R787）

**読むだけ・数えるだけ・掃くだけの役に、決める役の値段を払わない。**
⚠ 線は「機械的な仕事か」ではなく「**観測器か**」で引く——何を返すかが決まっている役は
下げてよく、**何が起きたかを判定する**役は下げない。

| 役 | 既定 | なぜ |
|---|---|---|
| `intmap-scout` | `sonnet` | 成果物が `file:line` の数え上げ。正解が機械的に決まり、漏れは網羅性の問題であって判断の問題ではない |
| `intmap-i18n` | `sonnet` | 9 言語の機械的な掃引。⚠ 言語体制は凍結中（`AGENTS.md` §3-5）なので出番自体が少ない |
| `intmap-verifier` | `sonnet` | ログから失敗行を抜くのは機械的。**ただし下の昇格条件がある** |
| `intmap-implementer` | 継承（親と同じ） | 実装判断そのもの。落とすと `AGENTS.md` §3-3 の暫定実装を踏む |
| `intmap-prod-verifier` | 継承（親と同じ） | 本番で**観測器の嘘**を見抜く役。ここを弱めるのは下の実測に真っ向から反する |

正本は `.agents/roles/*.md` の `claude: model:` で、`node scripts/agent-sync.mjs` が
`.claude/agents/*.md` の frontmatter へ写す。**綴りは `npm run check:agents` が拒む**
——Claude Code は知らないモデル名を**黙って無視して継承に戻す**ので、宣言だけが残る。

#### ⚠⚠⚠ 昇格させる条件（呼び出し側が Agent tool の `model` で上書きする）

**`intmap-verifier` に「この失敗は環境要因か、本物の退行か」を訊くときは `model: "opus"` を渡す。**
これは節約の例外ではなく、節約が**成立する条件**である——
[`.agents/rules/one-pass-or-a-reason.md`](../../rules/one-pass-or-a-reason.md) §2 が数える繰り返しの
原因の 1 番は「**観測器が嘘をついた**」で、実測は #R736（21 手・10分29秒が全部その再試行）・
#R742（207 操作中 52 件＝25%）・#R768。**誤判定 1 回ぶんの再試行は、その役の全ラウンドぶんの
節約より高い。**

昇格させるのは、次のどれかを訊いているとき:

- その赤は**環境要因**（改行コード・ポート衝突・並行実行・tree lock の枠切れ）か、**本物の退行**か
- **緑だが実は死んでいる**のではないか
- 失敗が**観測された事実**か、**観測できなかっただけ**か（`one-pass-or-a-reason.md` §5 の 2 つ）

単に「`npm test` を流して落ちた spec を挙げろ」なら既定のままでよい。
⚠ **迷ったら上げる。** 節約のために判断を曇らせた瞬間に、節約は目的を失う。

⚠ **この表と昇格条件は `.agents/rules/` には置けない。** あちらは 1 ファイル 6144 バイトの天井を
持ち（`tests/r295-checks.test.mjs` ⑥・毎セッションが払うから）、`execution-strategy.md` は
**余白 8 バイト**で埋まっている。検査自身が「detail は agent か skill へ移せ」と述べている。

---

## 3. ドキュメント（実装と**同じコミットで**）

| 触ったもの | 直す文書 |
|---|---|
| 実装を変えた | `Architecture.md`（**現状仕様**。ラウンド番号・PR 番号を書かない） |
| `js/` にファイルを足した・消した | `docs/FILES.md` |
| レイヤーの挙動 | `docs/MAP-LAYERS.md` |
| 機能を足した・撤去した | `PRODUCT.md` |
| 技術判断を新しくした・覆した | `DECISIONS.md` |
| 試験を足した・組み替えた | `docs/TESTING.md` |
| **文書を 1 本足した** | **`docs/README.md` に 1 行**（無いと `check:docs` が落ちる） |
| 常に | **`dev-notes/<YYYY-MM-DD>-<slug>.md` を 1 本**足す（他のファイルは触らない——一覧は `--list` がその場で作る） |
| **上に無い主題**（ニュース・企業・航空・火山・DB・警報・運用…） | **[`docs/README.md`](../../../docs/README.md) の表で引く** |

⚠ **最後の行は「その他」ではなく、この表の残り全部である。** ここに並んでいるのは
`docs/` にある文書の一部にすぎず、以前は最後の行が無かった——**ニュース・企業・航空・火山・DB を
触ったラウンドは、この手順書からは文書更新の義務が一切出てこなかった。**
どれが何の正本かを 1 枚で持っている唯一の表は `docs/README.md` なので、**書き写さずに引く。**

同じ事実を 2 か所に書かない。**正本を 1 つ決めて、他はそこへリンクする。**

### 記録の書き方（`dev-notes/`）

**1 エントリ＝1 ファイル。** `DEV-NOTES.md` は `dev-notes/` から**生成される索引**で、手で編集しない
（`npm run check:docs` の `dev-notes` 規則が、生成結果と食い違えば落とす）。

```markdown
---
title: <一行の題。何が起きていて、何を直したか>
date: 2026-09-25
pr: 123            # 分かれば。PR を作ってから足してよい（無くても索引は作れる）
---

〈依頼〉 … ／ ## 0. 測った ／ ## 1. … ／ ## N. 検査
```

- ファイル名の日付は front matter の `date` と同じ。slug は `worktree.mjs new` に渡したもの。
- 書いたら `node scripts/dev-notes.mjs --check`。⚠ **`DEV-NOTES.md` は固定の案内で、一覧を持たない**——一覧を追跡していた間は、1 本 merge されるたびに開いている PR が全部このファイルで衝突した（実測 4 本同時）。一覧は `node scripts/dev-notes.mjs --list`。
- 詳しさは既存のエントリと同じ程度（**何を・なぜ・実測**）。否定された見立ても残す。
- `R<N>.md` は番号で呼んでいた頃の記録で、名前は当時のまま（読むだけ・書き換えない）。
- ⚠ **旧形式で `DEV-NOTES.md` の先頭に `## R<N>` を足した branch を取り込むとき**（移行期の取り残し）は、
  その `DEV-NOTES.md` を材料に `node scripts/dev-notes.mjs --split --from <そのファイル>` →
  `--write`。`--split` は再実行できて、既存のエントリは同じ名前・同じ中身のまま、新しいものだけ足す。

---

## 4. 検証

**段とコマンドの表は [`.agents/rules/execution-strategy.md`](../../rules/execution-strategy.md) §4
が正本。**ここには書き写さない——そこを見て、この工程では段 0 から順に上げる。

この作業固有の義務だけ書く: 回帰検査は **`tests/<slug>-checks.test.mjs`**（spec なら
**`tests/<slug>.spec.js`**）という名前で置くだけでよい——`test:checks` は
`node --test "tests/**/*.test.mjs"` なので、名前が合っていれば登録なしに走る（#R529）。
**変更した・足した spec は PR の core で走る**（`scripts/tiers.mjs` の `changedSpecs()` が差分から
選ぶ。ローカルの `npm test` も `origin/main...HEAD` と未コミット分から同じものを選ぶ）——
「その回の spec が前に立たない」は起きない。高い spec も PR の前で 1 回走り、nightly にも残る。

### ⚠ 番号は名前ではない（この節が規約の正本・利用者承認済み）

`worktree.mjs` は以前「次の空きラウンド番号」を配っていた。**走査した全セッションが同じ番号を得る**
ので、改番は例外ではなく定常状態だった（#R671 は 7 回、同じ時期の別セッションは 4 回）。実測された被害:

- `tests/r568-checks.test.mjs` を **2 セッションが両方新規作成**し、git が add/add を立て、
  着地の自動化がそれを取り込んで**衝突マーカーごと commit**した（`… | tail -4` が `$?` を
  `tail` のものにしていた・#R420 の再演）。ファイルは `SyntaxError` で**1 本も走らなくなった**。
- memory の `intmap-r<N>-lessons.md` を改番のたびに rename していて、**別セッションのファイルに
  重ねて自分の記憶を失った**（#R565 と #R671 で **2 回**）。

#R674 は「番号 ＋ 主題」で名づけさせたが、番号は相変わらず動き、DEV-NOTES・ビルド印・プレビューの
ポートがそれに依存していた。⇒ **番号を名前から外した。** 名前は**主題（slug）だけ**で、PR を作ったら
PR 番号が識別子:

| 何 | 名前 | 例 |
|---|---|---|
| 回帰検査 | `tests/<slug>-checks.test.mjs` | `tests/process-without-round-numbers-checks.test.mjs` |
| spec | `tests/<slug>.spec.js` | （同じ slug で `.spec.js`） |
| 記録 | `dev-notes/<YYYY-MM-DD>-<slug>.md` | `dev-notes/2026-09-25-process-without-round-numbers.md` |
| **memory** | `intmap-<主題>.md`（**番号を書かない**） | `intmap-dem-tile-store-budget.md` |
| commit / PR の件名 | `<一行の要約>`（番号を付けない。squash が `(#N)` を付ける） | — |

- 名前は `node scripts/worktree.mjs new <slug>` が**その場で印字する**。手で組み立てない。
- リポジトリ側の門は `npm run check:static` の **`round-name`**（機械側の正本は
  `scripts/round-names.mjs`。何を測っているかは [`docs/TESTING.md`](../../../docs/TESTING.md)）。
  既存の `r<N>…` の名前は**過去のもの**として据え置き、**数と最大番号の 2 つで下向きにだけ動く**——
  **新しい `r<N>…` は主題付きでも拒まれる**。⚠ **memory はリポジトリの外**なので門が無い——
  番号を書かないことだけが守る（`AGENTS.md` §1）。
- ⚠ 過去の記録・コメント中の `#R<N>` は**当時の名前として**そのまま読む。書き換えない。

⚠ **`tests/` に置く `.mjs` で `node:test` を import するものは、必ず `*.test.mjs` と名づける。**
それ以外の名前は runner から見えず、一度も走らないまま永久に緑になる（`check:static` が捕まえる）。

大量ログの読み分けは `intmap-verifier` に渡す。

---

## 5. commit → push → PR → CI → merge

```bash
git add -A && git commit -m "<一行の要約>"
git push -u origin feat/<slug>
gh pr create --fill
gh pr merge --squash --auto --delete-branch   # 緑なら勝手に merge される。座って見ない
```

⚠ **`gh pr checks --watch` で CI を見張らない**（#R771）。実測で、赤い CI は 11.9分・12.2分
かかり、その間ずっと待っていた。`--auto` なら緑で自動 merge・branch 削除まで行き、**赤いときだけ**
戻ればよい。CI のゲートは 3 台に分かれ `fail-fast: false` なので、**1 回の run で落ちたゲートが
全部出る**——「1 つ直して 12 分待ってまた別のが赤」という往復がそもそも起きない
（`scripts/ci-gates.mjs`。計画は `node scripts/ci-gates.mjs --plan` が印字する）。

⚠ **これで工程が減ったのではない。やる「時刻」が動いただけ**（`AGENTS.md` §5.1 から移した実測）。
従来は 1 回の純粋な待ちが 45〜60 分あり、しかも赤い CI は 1 回引っかかるたびに 12 分、直してまた
12 分——「数時間」の正体は工程の数ではなく、**直列に並んだ待ちとその往復**だった。

⚠ **merge 後に main で走る CI を待たない。** PR の CI が緑なら同じ木が同じ結果を出す。

- ⚠ **push の前に番号を取り直す工程はもう無い**——名前が番号を持たないので、並行セッションに
  追い越されても改番するものが無い。`origin/main` が動いたら普通に rebase するだけ。
  `dev-notes/` の記録は別ファイルなので、**記録どうしが衝突することも無い**（索引は `--write` で作り直す）。
- CI の deploy ログは `mode:'serial'` だと**最初の 1 件しか見せない**。「赤が 1 件」は
  「壊れているのが 1 件」ではない。
- **非破壊的な migration・設定変更・deployment・commit・push・PR・merge に承認を求めない**
  （`AGENTS.md` §5）。

---

## 6. deployment と本番検証

Edge Function を変えたなら本番へ出す:

```bash
supabase functions deploy <name> --project-ref vpekfwdpurzejrrmacac --use-api
```

⚠ **`--use-api` を省くと無言でハングする**（既定は Docker を使うが、このマシンではデーモンが
動いていない。理由と実測は [`docs/AGENT-SETUP.md`](../../../docs/AGENT-SETUP.md) §9）。進んでいるかは経過時間ではなく
`supabase functions list` の `version` で見る。

⚠ **本数と名前をここに書き写さない。** 正本は [`AGENTS.md`](../../../AGENTS.md) §5.1、
機械が持っている実体は `supabase/config.toml` の `[functions.*]` 宣言そのもの
（`_shared/` は関数ではなくライブラリ）。手元で数えるならこれ:

```bash
grep -o '^\[functions\.[a-z0-9-]*\]' supabase/config.toml
```

この節はかつて本数と名前を写しており、実体が増えたあとも**3ラウンド気づかれなかった**——
文書どうしの食い違いを見る `npm run check:docs` が、当時この階層を読んでいなかったから。
今は読む（`scripts/doc-facts.mjs` の `edge-roster` / `edge-count`）。

サイトの本番検証は `intmap-prod-verifier` に渡す。**ローカルで測った数字を本番の数字として
報告しない。**

⚠ **この回の本番検証を、この回の中で待たない**（#R771・`AGENTS.md` §5.1）。Pages の deploy は
merge のあと数分かかる。**前回までの分を、次の作業の着手時（§0）にまとめて検証する。**
終えたら受領証を残す——これを書かない先送りは「やらなかった」と区別がつかない:

```bash
node scripts/worktree.mjs verified      # origin/main の HEAD（sha と件名の PR 番号）を「本番検証済み」として記録
```

---

## 7. 終了処理（省略できない。ただし**待たない**）

⚠ **この回でやるのは `done` だけ。** 残りは merge が本番へ届いてからでないと意味がなく、
届くのを待つと 1 本が 1 時間になる（#R771）。**次の作業の着手時にまとめて走らせる**
——`--sync` は冪等で、**1 回の実行がその時点で merge 済みの全セッション分を運ぶ**。

```bash
node scripts/worktree.mjs done          # この回: 自分の worktree と branch を片付ける
```

```bash
# 次の作業の着手時に、前回までの分をまとめて:
node scripts/worktree.mjs status        # 何が未了かを PR 番号で述べる（本番検証・原本・deploy）
node scripts/master-sync.mjs --sync     # 原本 (OneDrive) を origin/main へ早送り
node scripts/master-sync.mjs --check    # 原本が merge 後の状態か（exit 0 を確認）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1   # USB へ完全ミラー（毎回）
node scripts/worktree.mjs verified      # 本番検証を終えたら受領証
```

- `--sync` は**冪等**でロックが要らない。他セッションと同時に走ってよい。
- `status --brief`（SessionStart hook）は、未了が**あるときだけ** 1 行足す——毎回出る行は読まれない。
- ⚠ **`pwsh` ではない**（PowerShell 7 はこのマシンに無い。実測は `docs/AGENT-SETUP.md` §10）。
  かつてここは `pwsh -File …` と書いてあり、**書いてあるとおりにやると終了処理の最後の 1 歩が
  必ず `CommandNotFoundException` で落ちた**。
- `backup-usb.ps1` の最後の 1 行は `RESULT ok|skipped|failed`。`skipped` はエラーではない
  （USB 未接続、または候補が一意に決まらない）。
- `worktree.mjs done` は**自分が作った worktree と branch だけ**を消す。他セッションのものには
  触れない。

---

## 8. 最終報告（`AGENTS.md` §10・日本語）

実施した変更 / 実施したテストと結果 / CI 状態 / commit・PR・merge 状態 /
production deployment / production verification / 残っている問題。
正常に完了したなら**利用者による追加作業が不要であることも明示する**。

⚠ **削るべきものに気づいていたら、ここで提案する**（#R473 の方針転換）。作業中に見つけた
重複・死んだ機構・二重の正本・役目を終えた画面は、**依頼を止めずに完遂してから**、この報告の中で
「何を・なぜ・代わりに何が残るか・失うもの」を添えて出す。承認が無いうちは1バイトも消さない。
手続きの正本は `CONSTITUTION.md` §0 の 3、Atlas の但し書き（実装は削ってよいが到達可能な能力と
回答品質は削らない）は同 §5。

末尾に必ず 3 行:

```
GitHub: push済み / 最新
USB: <日時> 同期済み   （未接続なら「未接続のためスキップ」）
USB検証: 差分ゼロ
```
