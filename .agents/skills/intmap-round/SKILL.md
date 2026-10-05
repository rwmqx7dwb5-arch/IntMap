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

### どのモデルで走らせるか（Claude Code のみ）

**既定は安いモデル。高いモデルは「実在した必要」があるときだけ、呼び出し側が上げる。**
⚠ 線は「機械的な仕事か」ではなく「**観測器か**」で引く——何を返すかが決まっている役と、
**設計が済んだものを書く**役は下げてよく、**本番で何が起きたかを判定する**役は下げない。

| 役 | 既定 | なぜ |
|---|---|---|
| `intmap-scout` | `sonnet` | 成果物が `file:line` の数え上げ。正解が機械的に決まり、漏れは網羅性の問題であって判断の問題ではない。**上書きしない** |
| `intmap-i18n` | `sonnet` | 9 言語の機械的な掃引。⚠ 言語体制は凍結中（`AGENTS.md` §3-5）なので出番自体が少ない。**上書きしない** |
| `intmap-verifier` | `sonnet` | 走らせて失敗を挙げるのは機械的。**判定が要る赤が出たときだけ下の条件で上げる** |
| `intmap-implementer` | `sonnet` | 設計・ファイル・達成条件はメインが決めてから渡し、差分はメインが読み、ゲートが測る。書くことは決まっている。**設計が残っているときだけ上げる** |
| `intmap-prod-verifier` | 継承（親と同じ） | 本番で**観測器の嘘**を見抜く役。#R736（21 手・10分29秒が全部その再試行）・#R742（207 操作中 52 件＝25%）・#R768 |

正本は `.agents/roles/*.md` の `claude: model:` で、`node scripts/agent-sync.mjs` が
`.claude/agents/*.md` の frontmatter へ写す。**綴りは `npm run check:agents` が拒む**
——Claude Code は知らないモデル名を**黙って無視して継承に戻す**ので、宣言だけが残る。

#### ⚠⚠⚠ 昇格させる条件（呼び出し側が Agent tool の `model: "opus"` で上書きする）

⚠ **実測（2026-10-03）: 既定を sonnet にした後の 316 起動のうち 92% が Opus で走っていた。**
verifier は 33 件中 32 件、scout は 52 件中 27 件が Opus。旧い条件は「判定させるときは上げる」
「迷ったら上げる」で、**検証の依頼はほぼ必ず判定を含むので、例外が既定になっていた**。
宣言は効いていて、上書きされなかった分だけが sonnet で走っていた。
⇒ **昇格は最初の依頼に付けない。答えを見てから、判定の要る 1 問だけを上げる。**

`intmap-verifier`:
- 最初の依頼（走らせる・落ちたものを挙げる・ログから失敗行を抜く）は**常に既定**。
- 返ってきた赤について次を訊く**2 問目だけ** `model: "opus"`:
  - その赤は**環境要因**（改行コード・ポート衝突・並行実行）か、**本物の退行**か
  - **緑だが実は死んでいる**のではないか
  - 失敗が**観測された事実**か、**観測できなかっただけ**か（`one-pass-or-a-reason.md` §5 の 2 つ）
- 既定の verifier 自身が「判定できない」と返したら、それも上げる理由になる。
- これは節約の例外ではなく、節約が**成立する条件**である——
  [`.agents/rules/one-pass-or-a-reason.md`](../../rules/one-pass-or-a-reason.md) §2 が数える繰り返しの
  原因の 1 番は「**観測器が嘘をついた**」。誤判定 1 回ぶんの再試行は、その役の全ラウンドぶんの節約より高い。

`intmap-implementer`:
- 渡す時点で**何をどう書くかが決まっていない**（設計判断を implementer に委ねる）なら `model: "opus"`。
  ⚠ 本来はメインが設計してから渡す。設計を委ねる依頼そのものが例外である。
- 既定で書いた差分が**ゲートかメインのレビューで差し戻された**なら、その再依頼は `model: "opus"`
  （実在した失敗のあとの昇格。`one-pass-or-a-reason.md` §5）。
- ⚠ **既定で書かせた差分は、メインが必ず読んでから統合する。** 暫定実装・ハリボテ（`AGENTS.md` §3-3）
  を拒むのはこの読みであって、モデル名ではない。

`intmap-scout` / `intmap-i18n` は上げない。scout の答えから判断が要るなら、それは**メインの仕事**である。

⚠ **この表と昇格条件は `.agents/rules/` には置けない。** あちらは 1 ファイル 6144 バイトの天井を
持ち（`tests/process-agent-context-checks.test.mjs` #R295 ⑥・毎セッションが払うから）、`execution-strategy.md` は
**余白 8 バイト**で埋まっている。検査自身が「detail は agent か skill へ移せ」と述べている。

---

## 3. ドキュメント（実装と**同じコミットで**）

| 触ったもの | 直す文書 |
|---|---|
| 現状仕様（挙動・構成・データ）が変わった | 現状仕様の該当章 `docs/architecture/<NN>-<slug>.md`（`Architecture.md` の表で引く。ラウンド番号・PR 番号を書かない）。⚠ **仕様どおりに戻すだけのバグ修正・内部の整理・テストの追加では触らない**——章は「今どうなっているか」で、それが変わっていないから |
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

**1 エントリ＝1 ファイル。** `DEV-NOTES.md` は `dev-notes/` への**固定の案内**（一覧を持たない。`--list` がその場で出す）で、手で編集しない
（`npm run check:docs` の `dev-notes` 規則が、案内でなくなれば落とす）。

```markdown
---
title: <一行の題。何が起きていて、何を直したか>
date: 2026-09-25
pr: 123            # 分かれば。PR を作ってから足してよい（無くても索引は作れる）
newsen: <読者に見える変化を 1 行・英語>     # 読者に見える変化を起こしたときだけ。両方か無しか
newsjp: <同じことを 1 行・日本語>
---

〈依頼〉 … ／ ## 0. 測った ／ ## 1. … ／ ## N. 検査
```

- ファイル名の日付は front matter の `date` と同じ。slug は `worktree.mjs new` に渡したもの。
- **読者に見える変化を起こしたら `newsen:` / `newsjp:` を書く**——それがそのまま更新情報（設定 ▸ 新着・`updates.html`・
  Atom フィード・Atlas の `system.whatsNew`）になる（`scripts/whats-new.mjs`）。平文・絵文字なし・280 字以内・
  技術者向けの言葉でなく**使う人に何が変わったか**。内部だけの変更には書かない（書かなければ告知されない）。
  ⚠ **書き忘れは黙って飛ばされる**ので、branch が記録を足し、かつ `PRODUCT.md` を変えた／ルートに `*.html` を足したときは、
  その記録に `newsen:`/`newsjp:` か `internal: <なぜ読者に見えないか>` が無いと `--check` が落ちる（`scripts/dev-notes.mjs` `newsOmissions`）。
- 書いたら `node scripts/dev-notes.mjs --check`。⚠ **`DEV-NOTES.md` は固定の案内で、一覧を持たない**——一覧を追跡していた間は、1 本 merge されるたびに開いている PR が全部このファイルで衝突した（実測 4 本同時）。一覧は `node scripts/dev-notes.mjs --list`。
- **詳しさは変更の大きさに比例させる**（既存の長いエントリに合わせない）。
  - **小さな変更**（仕様が変わらない修正・1〜2 ファイル・調査の要らなかったもの）は front matter と
    **本文 3〜5 行**で足りる: 何が起きていたか／何を直したか／どう確かめたか。節は要らない。
  - **調べたことがある変更**だけ節を立てて書く——測った数・否定された見立て・次の人が同じ穴に
    落ちないための事実。⚠ 書くことが無いのに節を埋めない。読まれない記録は記録の価値を下げる。
  - どちらでも `newsen:`/`newsjp:`（または `internal:`）の規則は同じ（下の項）。
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

- `r568-checks.test.mjs`（いまは `tests/radiation-plume-checks.test.mjs` に統合）を **2 セッションが両方新規作成**し、git が add/add を立て、
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

**全件はローカルで回さない**（どの段が CI のものかは上の正本の表）。PR の CI が同じ門を 3 台で全部走らせ、緑で
なければ merge されない（`AGENTS.md` §4）。ローカルの全件は約 10 分かかり、このマシンでは負荷で
退行でない赤も出ていた。CI が赤なら、**落ちた門だけを単独で**再現して直す。

**commit の直前に `npm run regen`**（約 25 秒）。生成物の再生成と、台帳の「下げるだけ」を 1 回で
済ませる——どちらも製品の欠陥ではなく帳簿のずれで、放っておくと CI が 12 分後に赤で知らせてくる
ものである。対象は `.gitattributes` の宣言から読まれる（`intmap-regen`・`intmap-tighten`。
`node scripts/regen.mjs --plan` が一覧を出す）。⚠ **台帳が緩む方向**（数が増えた・新しい名前・
並び替え）は**書き換えずに元へ戻して名指す**——それは判断であって帳簿ではない。理由を記録に
書いてから、名指された writer を自分で走らせる。

大量ログの読み分けは `intmap-verifier` に渡す。

---

## 5. commit → push → PR → CI → merge

```bash
npm run regen                                  # 生成物と台帳の帳簿（§4）
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

⚠ **merge 後に main で走る CI を待たない。** 本番公開はその run が緑になってから同じ run が行い、
赤なら公開しない（必須チェックは strict ではないので、merge 後の木を検査するのはこの run だけ）。

- ⚠ **push の前に番号を取り直す工程はもう無い**——名前が番号を持たないので、並行セッションに
  追い越されても改番するものが無い。`origin/main` が動いたら普通に rebase するだけ。
  `dev-notes/` の記録は別ファイルなので、**記録どうしが衝突することも無い**（索引は `--write` で作り直す）。
- **PR が DIRTY になったら**（並行 PR の着地）`git fetch && git rebase origin/main`。生成物・台帳・件数
  （perf-baseline・global-surface・durations・`TOTAL_BUDGET_S`・`plan(N)`・能力の生成行・cassette・文書の件数…）
  の衝突は **merge driver が解く**——main 側を取って `--write`／`--update` し直す手作業はもう無い（宣言は
  `.gitattributes`、仕組みは `docs/AGENT-SETUP.md` §12）。終わったら `node scripts/merge-driver.mjs --finish`
  （保留した生成器を merge 後の木で走らせる。build が要るものは印字だけ）→ 差分を commit →
  `git push --force-with-lease`。**それでも残った衝突は本物**（人が書いたものを両側が変えた）。
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

⚠ **この回の本番検証を、この回の中で待たない**（#R771・`AGENTS.md` §5.1）。Pages の公開は
merge のあと main の CI が緑になってから行われる（約 10 分以上）。**前回までの分を、次の作業の着手時（§0）にまとめて検証する。**
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
