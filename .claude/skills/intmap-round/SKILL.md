---
name: intmap-round
description: IntMap で「これを実装して」「これを直して」「これを追加して」のように、リポジトリのファイルを変更して最後に merge・deployment まで行く作業を始めるときの具体的な手順書。作業名（slug）の決め方、worktree の用意、並列分解、検証の段、PR・CI・squash merge・本番検証・原本同期・USB バックアップまでの実行順を持つ。質問に答えるだけ・調べるだけの依頼では使わない。
---

# IntMap · 作業を 1 本通す（intmap-round）

`AGENTS.md` §5 のワークフローを**実際のコマンドの順**にしたもの。規則は `AGENTS.md` と
`CONSTITUTION.md`、戦略は `.agents/rules/execution-strategy.md`。ここは**手順**だけ。

## 0. 着手前（並列にやる）

`AGENTS.md` §1 の事前確認を**まとめて 1 回で**済ませる:

```bash
node scripts/worktree.mjs status
```

branch / 未コミット変更 / 全 worktree / `origin/main` との差 / 最新の記録 / 前回までの未了（本番到達・
本番検証・原本の同期。**PR 番号**で述べる）を出す。同じメッセージで、主題の**正本**を
[`docs/README.md`](../../../docs/README.md) で特定して読み、調査が要るなら `intmap-scout` に投げる。
不明点は推測で埋めず、質問用の機能で訊く（`AGENTS.md` §8・手段は `docs/AGENT-SETUP.md` §2）。

## 1. 作業場を用意する

```bash
node scripts/worktree.mjs new <slug>
```

`<slug>` は**作業の主題**（小文字・数字・ハイフン、英字で始める。例 `dem-tile-budget`）。これがやること:

- **番号で始まる slug**（`r815-…`）と、**既に誰かが持っている slug**（branch `feat/<slug>`・worktree
  `wt-<slug>`・`tests/<slug>-checks.test.mjs`・`tests/<slug>.spec.js`・`dev-notes/*-<slug>.md`）を拒む
- branch `feat/<slug>` を `origin/main` から切る——**これが識別子の取得そのもの**（同じマシンの worktree は
  ref の名前空間を共有するので、同じ slug を 2 つ目のセッションが取ると git 自身が拒む）
- **OneDrive の外**に worktree `wt-<slug>` を作り、`node_modules` を原本から junction で貼る
- `.claude/launch.json` に `intmap-preview-<slug>` を足す（ポートは 4400〜4999 のうち、このマシンのどの
  `launch.json` も使っておらず listen もされていない最小の番号。このファイルは**追跡対象外**）
- 作業ディレクトリの絶対パスと、この作業のファイル名（§4）を印字する

**以降の編集は全部その worktree の中で行う。** 原本には 1 バイトも書かない。PR を作ったら **PR 番号**が
一意の識別子になる（squash merge が件名の末尾に `(#N)` を付ける）。

## 2. 実装する

`.agents/rules/execution-strategy.md` の §1〜§3 に従って分解する。独立な仕事は同じメッセージで起動し、
重ならない並列実装は仕事ごとに `worktree.mjs new` で場所を作って `intmap-implementer` に**絶対パスと触って
よいファイルの一覧**を渡す。同じファイルを 2 体に書かせない。統合・commit はメインだけ。利用者に見える
文字列を足したら `intmap-i18n` に回す。

### どのモデルで走らせるか（Claude Code のみ）

**既定は安いモデル。上げるのは実在した必要があるときだけ、呼び出し側が。** 線は「機械的か」ではなく「**観測器か**」
——本番で何が起きたかを判定する役は下げない。

| 役 | 既定 | なぜ |
|---|---|---|
| `intmap-scout` | `sonnet` | 成果物は `file:line` の数え上げ。**上書きしない** |
| `intmap-i18n` | `sonnet` | 機械的な掃引（言語は凍結中・`AGENTS.md` §3 の 5）。**上書きしない** |
| `intmap-verifier` | `sonnet` | 走らせて失敗を挙げるのは機械的。**判定が要る赤だけ下の条件で上げる** |
| `intmap-implementer` | `sonnet` | 設計はメインが済ませ、差分はメインが読みゲートが測る。**設計が残るときだけ上げる** |
| `intmap-prod-verifier` | 継承（親と同じ） | 本番で**観測器の嘘**を見抜く役（`one-pass-or-a-reason.md` §2） |

正本は `.agents/roles/*.md` の `claude: model:`（`node scripts/agent-sync.mjs` が `.claude/agents/` へ写し、綴りは
`npm run check:agents` が拒む——Claude Code は知らないモデル名を黙って継承に戻す）。

**昇格**（Agent tool の `model: "opus"`）は**最初の依頼に付けず、答えを見てから判定の要る 1 問だけ**（実測 2026-10-03:
「判定させるときは上げる」の間は 316 起動の 92% が Opus。実数は `node scripts/agent-models.mjs`）。

- `intmap-verifier`: 走らせる・失敗を挙げる依頼は常に既定。返った赤について訊く**2 問目だけ** `model: "opus"`——
  環境要因か本物の退行か／緑だが実は死んでいないか／観測された失敗か観測できなかっただけか
  （[`one-pass-or-a-reason.md`](../../rules/one-pass-or-a-reason.md) §5）。既定が「判定できない」と返したときも上げる。
- `intmap-implementer`: 設計を委ねるとき、または差分がゲートかレビューで差し戻された後の再依頼だけ `model: "opus"`。
  **既定で書かせた差分は、メインが必ず読んでから統合する**（ハリボテ（`AGENTS.md` §3 の 3）を拒むのはこの読み）。
- scout / i18n は上げない（scout の答えから要る判断はメインの仕事）。

## 3. ドキュメント（実装と**同じコミットで**）

| 触ったもの | 直す文書 |
|---|---|
| 現状仕様（挙動・構成・データ）が変わった | 該当章 `docs/architecture/<NN>-<slug>.md`（`Architecture.md` の表で引く。ラウンド番号・PR 番号を書かない）。仕様どおりに戻すだけの修正・内部の整理・テストの追加では触らない |
| `js/` にファイルを足した・消した | `docs/FILES.md` |
| レイヤーの挙動 | `docs/MAP-LAYERS.md` |
| 機能を足した・撤去した | `PRODUCT.md` |
| 技術判断を新しくした・覆した | `DECISIONS.md` |
| 試験を足した・組み替えた | `docs/TESTING.md` |
| **文書を 1 本足した** | **`docs/README.md` に 1 行**（無いと `check:docs` が落ちる） |
| 常に | **`dev-notes/<YYYY-MM-DD>-<slug>.md` を 1 本**（他のファイルは触らない） |
| **上に無い主題すべて**（ニュース・企業・航空・火山・DB・警報・運用…） | **[`docs/README.md`](../../../docs/README.md) の表で引く**（何が何の正本かを持つ唯一の表。書き写さない） |

同じ事実を 2 か所に書かない。正本を 1 つ決めて、他はそこへリンクする。

### 記録の書き方（`dev-notes/`）

**1 エントリ＝1 ファイル。** `DEV-NOTES.md` は固定の案内で一覧を持たず、手で編集しない（一覧は
`node scripts/dev-notes.mjs --list`。一覧を追跡していた間は 1 本の merge で開いている PR が全部衝突した）。

```markdown
---
title: <一行の題。何が起きていて、何を直したか>
date: 2026-09-25
pr: 123            # 分かれば。PR を作ってから足してよい
newsen: <読者に見える変化を 1 行・英語>     # 読者に見える変化を起こしたときだけ。両方か無しか
newsjp: <同じことを 1 行・日本語>
---

〈依頼〉 … ／ ## 0. 測った ／ ## 1. … ／ ## N. 検査
```

- ファイル名の日付は `date` と同じ、slug は `worktree.mjs new` に渡したもの。
- **読者に見える変化には `newsen:` / `newsjp:`**——そのまま更新情報（設定 ▸ 新着・`updates.html`・Atom・Atlas の
  `system.whatsNew`。`scripts/whats-new.mjs`）になる。平文・絵文字なし・280 字以内・使う人に何が変わったか。
  branch が記録を足し、かつ `PRODUCT.md` を変えた／ルートに `*.html` を足したのに `newsen:`/`newsjp:` も
  `internal: <なぜ読者に見えないか>` も無いと `--check` が落ちる（`scripts/dev-notes.mjs` `newsOmissions`）。
- 書いたら `node scripts/dev-notes.mjs --check`。
- **詳しさは変更の大きさに比例させる。** 小さな変更（仕様が変わらない・1〜2 ファイル・調査不要）は front matter と
  本文 3〜5 行（何が起きていたか／何を直したか／どう確かめたか）。調べたことがある変更だけ節を立てる
  （測った数・否定された見立て・次の人のための事実）。書くことが無いのに節を埋めない。
- `R<N>.md` は番号で呼んでいた頃の記録（読むだけ・書き換えない）。旧形式で `DEV-NOTES.md` の先頭に `## R<N>` を
  足した branch を取り込むときは `node scripts/dev-notes.mjs --split --from <そのファイル>` → `--write`（再実行可）。

## 4. 検証

段とコマンドの表は [`.agents/rules/execution-strategy.md`](../../rules/execution-strategy.md) §4 が正本（書き写さない）。
段 0 から順に上げる。回帰検査は **`tests/<slug>-checks.test.mjs`**（spec なら **`tests/<slug>.spec.js`**）と名づけて
置くだけで `test:checks`（`node --test "tests/**/*.test.mjs"`）が拾う。変更した・足した spec は PR の core で走る
（`scripts/tiers.mjs` の `changedSpecs()`。ローカルの `npm test` も `origin/main...HEAD` と未コミット分から選ぶ）。

### 番号は名前ではない（この節が規約の正本・利用者承認済み）

番号を配っていた頃は走査した全セッションが同じ番号を得て、改番が定常状態だった（同名検査の add/add 衝突が
マーカーごと commit された・memory の rename が別セッションの記憶を上書きした）。名前は**主題（slug）だけ**:

| 何 | 名前 |
|---|---|
| 回帰検査 / spec | `tests/<slug>-checks.test.mjs` / `tests/<slug>.spec.js` |
| 記録 | `dev-notes/<YYYY-MM-DD>-<slug>.md` |
| **memory** | `intmap-<主題>.md`（**番号を書かない**。門が無く、これだけが守る） |
| commit / PR の件名 | `<一行の要約>`（番号を付けない。squash が `(#N)` を付ける） |

- 門は `npm run check:static` の **`round-name`**（正本 `scripts/round-names.mjs`・[`docs/TESTING.md`](../../../docs/TESTING.md)）。
  既存の `r<N>…` は据え置き、数と最大番号は下向きにだけ動く——**新しい `r<N>…` は主題付きでも拒まれる**。
  過去の記録・コメント中の `#R<N>` は当時の名前として読み、書き換えない。
- `tests/` の `.mjs` で `node:test` を import するものは必ず `*.test.mjs`（それ以外は runner から見えず永久に緑。
  `check:static` が捕まえる）。

**全件はローカルで回さない**（約 10 分・負荷で退行でない赤も出る）。PR の CI が同じ門を 3 台で全部走らせる
（`AGENTS.md` §4）。CI が赤なら**落ちた門だけを単独で**再現して直す。

**commit の直前に `npm run regen`**（約 25 秒）——生成物の再生成と台帳の「下げるだけ」を 1 回で済ませる（放っておくと
CI が 12 分後に赤で知らせる帳簿のずれ）。対象は `.gitattributes` の `intmap-regen`・`intmap-tighten` から読まれる
（`node scripts/regen.mjs --plan`）。**台帳が緩む方向**（数が増えた・新しい名前・並び替え）は書き換えずに元へ戻して
名指される——それは判断なので、理由を記録に書いてから名指された writer を自分で走らせる。

大量ログの読み分けは `intmap-verifier` に渡す。

## 5. commit → push → PR → CI → merge

```bash
npm run regen                                  # 生成物と台帳の帳簿（§4）
git add -A && git commit -m "<一行の要約>"
git push -u origin feat/<slug>
gh pr create --fill
gh pr merge --squash --auto --delete-branch   # 緑なら勝手に merge される。座って見ない
```

- **`gh pr checks --watch` で CI を見張らない。** 赤い CI は 1 回約 12 分で、待ちとその往復が「数時間」の正体だった。
  `--auto` なら緑で merge・branch 削除まで行き、赤いときだけ戻る。ゲートは 3 台・`fail-fast: false` で 1 回の run に
  落ちたゲートが全部出る（計画は `node scripts/ci-gates.mjs --plan`）。
- **PR が DIRTY になったら** `git fetch && git rebase origin/main`。生成物・台帳・件数（perf-baseline・global-surface・
  durations・`TOTAL_BUDGET_S`・`plan(N)`・能力の生成行・cassette・文書の件数…）の衝突は **merge driver が解く**（宣言は
  `.gitattributes`、仕組みは `docs/AGENT-SETUP.md` §12）。終わったら `node scripts/merge-driver.mjs --finish`（保留した
  生成器を merge 後の木で走らせる。build が要るものは印字だけ）→ 差分を commit → `git push --force-with-lease`。
  **それでも残った衝突は本物**（人が書いたものを両側が変えた）。
- **Atlas の能力を足す PR が並行で何本もあるときは、auto-merge を 1 本にだけ掛ける**（2026-10-08〜09 実測、5 本）。
  手書きの能力数（`check:docs` の capability-count）・`async.*` の perf 天井・評価の録画（cassette）は 1 本入るたびに
  残りでずれ、必須チェックが strict でないので古い main の上で緑の PR が続けて入ると main が赤になる。1 本ずつ
  rebase →（`atlas-caps --write`・能力数・`npm run regen`・build・`perf-budget --update`・門）で着地させるか、残りを
  **統合 1 本**にまとめる。並行の担当には能力数・天井・録画を触らせず、統合時に合わせる。
- CI の deploy ログは `mode:'serial'` だと最初の 1 件しか見せない。「赤が 1 件」は「壊れているのが 1 件」ではない。

## 6. deployment と本番検証

Edge Function を変えたなら本番へ出す:

```bash
supabase functions deploy <name> --project-ref vpekfwdpurzejrrmacac --use-api
```

通常は merge 後に CI が出し、手での deploy は緊急時の手段。`--use-api` を省くと無言でハングする（Docker デーモンが
動いていない）。進捗は `supabase functions list` の `version` で見る。理由・CI の配備・名簿の正本は
[`docs/AGENT-SETUP.md`](../../../docs/AGENT-SETUP.md) §9（**本数と名前をここに書き写さない**）。実体は `supabase/config.toml` の `[functions.*]`（`_shared/` はライブラリ）。手元で数えるなら:

```bash
grep -o '^\[functions\.[a-z0-9-]*\]' supabase/config.toml
```

サイトの本番検証は `intmap-prod-verifier` に渡す。**ローカルで測った数字を本番の数字として報告しない。**
この回の中では待たない（Pages の公開は merge 後の main の CI が緑になってから・約 10 分以上）。
**前回までの分を次の作業の着手時（§0）にまとめて検証し**、受領証を残す:

```bash
node scripts/worktree.mjs verified      # origin/main の HEAD（sha と件名の PR 番号）を「本番検証済み」として記録
```

## 7. 終了処理（省略できない。ただし**待たない**）

**この回でやるのは `done` だけ。** 残りは merge が本番へ届いてからでないと意味が無いので、**次の作業の着手時に
まとめて**走らせる（1 回の `--sync` がその時点で merge 済みの全セッション分を運ぶ）。

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

`--sync` はロック不要で他セッションと同時に走ってよい。`status --brief`（SessionStart hook）は未了が**あるときだけ**
1 行足す。`done` は**自分が作った worktree と branch だけ**を消す。USB の起動器（`pwsh` ではない）と `RESULT` 行の
読み方は `AGENTS.md` §11.2。

## 8. 最終報告（`AGENTS.md` §10・日本語）

項目は `AGENTS.md` §10、末尾のバックアップ状態は同 §11.4。

**形式上の削除（死んだコード・二重実装・重複した入口・二重の正本）は報告を待たずに行い**、何を消し何が役目を
引き継いだかを記録に書く。**能力か品質が下がるものだけ**をここで提案する（正本 `.agents/rules/substance-over-form.md`・
`CONSTITUTION.md` §0 の 3・Atlas は同 §5）。
