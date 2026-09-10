---
name: intmap-round
description: IntMap で「これを実装して」「これを直して」「これを追加して」のように、リポジトリのファイルを変更して最後に merge・deployment まで行く作業を始めるときの具体的な手順書。ラウンド番号の取り方、worktree の用意、並列分解、検証の段、PR・CI・squash merge・本番検証・原本同期・USB バックアップまでの実行順を持つ。質問に答えるだけ・調べるだけの依頼では使わない。
---

# IntMap · ラウンドを 1 本通す

`AGENTS.md` §5 のワークフローを**実際のコマンドの順**にしたもの。規則は `AGENTS.md` と
`CONSTITUTION.md`、戦略は `.agents/rules/execution-strategy.md` にある。ここは**手順**だけ。

---

## 0. 着手前（並列にやる）

`AGENTS.md` §1 の事前確認は互いに独立なので、**まとめて 1 回で**済ませる。

```bash
node scripts/worktree.mjs status
```

これが一度に出す: 現在の branch / 未コミット変更 / 全 worktree / **空いているラウンド番号** /
`origin/main` との差 / 直近のラウンド。ここに出ないものだけ個別に見る。

同時に（同じメッセージで）:

- `node scripts/handoff.mjs init`（未作成なら） → `node scripts/handoff-inbox.mjs pull`
  → `node scripts/handoff.mjs prepare` — GPT からの受け渡し（`.agents/rules/gpt-handoff.md`）
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

これがやること（`AGENTS.md` §6 の要求そのもの）:

- 空いているラウンド番号 `N` を決める
- branch `feat/r<N>-<slug>` を `origin/main` から切る
- **OneDrive の外**に worktree を作る（原本は `main` の置き場であって作業場ではない）
- `node_modules` を原本から junction で貼る
- `.claude/launch.json` に `intmap-preview-r<N>` / ポート **`4000 + N`** を足す
  （R403 なら 4403。⚠ 以前ここは `42<N>` と書いてあり、それが合うのは N が 200 番台のときだけ
  だった——例に使われていた R257 → 4257 は `4000+257` の別の読み方でしかない）
  （⚠ #R338 以降このファイルは**追跡対象外**。commit にも PR にも出てこない）
- 作業ディレクトリの絶対パスを印字する

**以降の編集は全部その worktree の中で行う。** 原本には 1 バイトも書かない。

---

## 2. 実装する

`.agents/rules/execution-strategy.md` の §1〜§3 に従って分解する。要点だけ:

- 独立な仕事は**同じメッセージで**まとめて起動する
- 触るファイルが重ならない並列実装は、仕事ごとに `worktree.mjs new` で場所を作り、
  `intmap-implementer` に**絶対パスと触ってよいファイルの一覧**を渡す
- **同じファイルを 2 体に書かせない**
- 統合・commit はメインだけ
- 利用者に見える文字列を足したら `intmap-i18n` に 9 言語を回す

---

## 3. ドキュメント（実装と**同じコミットで**）

| 触ったもの | 直す文書 |
|---|---|
| 実装を変えた | `Architecture.md`（**現状仕様**。ラウンド番号を書かない） |
| `js/` にファイルを足した・消した | `docs/FILES.md` |
| レイヤーの挙動 | `docs/MAP-LAYERS.md` |
| 機能を足した・撤去した | `PRODUCT.md` |
| 技術判断を新しくした・覆した | `DECISIONS.md` |
| 試験を足した・組み替えた | `docs/TESTING.md` |
| **文書を 1 本足した** | **`docs/README.md` に 1 行**（無いと `check:docs` が落ちる） |
| 常に | `DEV-NOTES.md` の**先頭**に `R<N>` エントリ（索引行と本文の両方） |
| **上に無い主題**（ニュース・企業・航空・火山・DB・警報・運用…） | **[`docs/README.md`](../../../docs/README.md) の表で引く** |

⚠ **最後の行は「その他」ではなく、この表の残り全部である。** ここに並んでいるのは
`docs/` にある文書の一部にすぎず、以前は最後の行が無かった——**ニュース・企業・航空・火山・DB を
触ったラウンドは、この手順書からは文書更新の義務が一切出てこなかった。**
どれが何の正本かを 1 枚で持っている唯一の表は `docs/README.md` なので、**書き写さずに引く。**

同じ事実を 2 か所に書かない。**正本を 1 つ決めて、他はそこへリンクする。**

---

## 4. 検証

**段とコマンドの表は [`.agents/rules/execution-strategy.md`](../../rules/execution-strategy.md) §4
が正本。**ここには書き写さない——そこを見て、この工程では段 0 から順に上げる。

このラウンド固有の義務だけ書く: その回の回帰検査は **`tests/r<N>-<主題>-checks.test.mjs`**
（spec なら `tests/r<N>-<主題>.spec.js`）という名前で置くだけでよい——`test:checks` は
`node --test "tests/**/*.test.mjs"` なので、名前が合っていれば登録なしに走る（#R529）。

### ⚠ ラウンド番号は名前ではない（この節が規約の正本・#R672）

番号は**このセッションのものではない**——並列セッションは全員が同じ走査（`worktree.mjs` の
`nextRound`）から「次の空き番号」を取り、`origin/main` が動くたびに取り直す。
**改番は例外ではなく定常状態**（#R671 は 7 回、同じ時期の別セッションは 4 回）。実測された被害:

- `tests/r568-checks.test.mjs` を **2 セッションが両方新規作成**し、git が add/add を立て、
  着地の自動化がそれを取り込んで**衝突マーカーごと commit**した（`… | tail -4` が `$?` を
  `tail` のものにしていた・#R420 の再演）。ファイルは `SyntaxError` で**1 本も走らなくなった**。
- memory の `intmap-r<N>-lessons.md` を改番のたびに rename していて、**別セッションのファイルに
  重ねて自分の記憶を失った**（#R565 と #R671 で **2 回**）。

⚠ **直せるのは merge ではなく名前である。** 1 つのチェックアウトの中では「相手が別の番号を
取ったか」を原理的に証明できない（相手の branch はここに無い）。証明できるのは**名前が番号の
持たないもの＝主題を持っているか**だけ。⇒ **番号 ＋ 主題**で名づける:

| 何 | 名前 | 例 |
|---|---|---|
| その回の回帰検査 | `tests/r<N>-<主題>-checks.test.mjs` | `tests/r671-dem-store-checks.test.mjs` |
| その回の spec | `tests/r<N>-<主題>.spec.js` | `tests/r180-cesium.spec.js` |
| **memory** | `intmap-<主題>.md`（**番号を書かない**） | `intmap-dem-tile-store-budget.md` |

- 名前は `node scripts/worktree.mjs new <slug>` が**番号を取ったその場で印字する**。手で組み立てない。
- リポジトリ側の門は `npm run check:static` の **`round-name`**（機械側の正本は
  `scripts/round-names.mjs`。何を測っているかは [`docs/TESTING.md`](../../../docs/TESTING.md)）。
  既存の番号だけの名前は**過去のもの**として据え置いてあり、**数と最大ラウンドの 2 つで下向きに
  だけ動く**。⚠ **memory はリポジトリの外**なので門が無い——番号を書かないことだけが守る
  （`AGENTS.md` §1）。
- ⚠ **改番に「全文置換」を使わない。** `R<from>` → `R<to>` の一括置換は**他人のラウンドの文まで
  書き換える**（実測: `docs/TESTING.md` の見出しと `DEV-NOTES.md` の 1 行）。動かすのは
  **自分のファイル名だけ**を対象にしたパターン（`rd+-<自分の主題>`）。

⚠ **`tests/` に置く `.mjs` で `node:test` を import するものは、必ず `*.test.mjs` と名づける。**
それ以外の名前は runner から見えず、一度も走らないまま永久に緑になる（`check:static` が捕まえる）。

大量ログの読み分けは `intmap-verifier` に渡す。

---

## 5. commit → push → PR → CI → merge

```bash
git add -A && git commit -m "R<N>: <一行の要約>"
git push -u origin feat/r<N>-<slug>
gh pr create --fill
gh pr checks --watch          # CI を確認し、赤なら直す
gh pr merge --squash --delete-branch
```

- **push の直前にラウンド番号を取り直す**（`node scripts/worktree.mjs status`）。
  ⚠ **これは稀な事故ではない。** `DEV-NOTES.md` を「改番」「番号を取り直」で引けば実例が並ぶ
  （ここは長く「過去に 3 回」と書いてあったが、そう書いた時点で既に下限だった）。1 回の改番が
  30 か所を超えることがあるので、**取り直しは push の直前に、毎回**。
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

---

## 7. 終了処理（省略できない）

```bash
node scripts/master-sync.mjs --sync     # 原本 (OneDrive) を origin/main へ早送り
node scripts/master-sync.mjs --check    # 原本が merge 後の状態か（exit 0 を確認）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1   # USB へ完全ミラー（毎回）
node scripts/worktree.mjs done          # 自分の worktree と branch を片付ける
```

- `--sync` は**冪等**でロックが要らない。他セッションと同時に走ってよい。
- ⚠ **`pwsh` ではない**（PowerShell 7 はこのマシンに無い。実測は `AGENTS.md` §11.2）。
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
