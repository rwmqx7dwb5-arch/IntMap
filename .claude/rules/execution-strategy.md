# IntMap — 実行戦略 (How the work is executed, every session)

`CLAUDE.md` §5 が **何を・どの順で**やるか。このファイルは **それをどう速く・安全にやるか**。
利用者は「これを実装して」「これを直して」としか言わない。
**分解・並列化・委譲・隔離・検証の段は、毎回 Claude 自身が決める。利用者に管理させない。**

## 1. 依頼を受けたら、まず分解する

1. 依頼を**独立な仕事**に分ける（互いの出力を必要としないもの）。
2. 独立な仕事が 2 つ以上あるなら、**同じメッセージの中で**まとめて起動する。1 つずつ待たない。
3. 依存のある仕事だけを直列に残す。
4. 待ちが出たら、その間に**別の独立作業**を進める。**ポーリングしない**（`CLAUDE.md` §4）。

## 2. 自分でやるか、subagent へ渡すか

**渡す**——生ログをメインの context に持ち込まないため:

| 仕事 | agent |
|---|---|
| リポジトリ探索・「この事実は何か所にあるか」の全数調査・呼び出し元の特定 | `intmap-scout` |
| テスト／CI／ビルドの**大量ログ**の解析、ゲートの実行と失敗の切り分け | `intmap-verifier` |
| 9 言語の翻訳掃引と `check:i18n` の穴埋め | `intmap-i18n` |
| 本番サイトでの検証（操作・計測・スクリーンショット） | `intmap-prod-verifier` |
| 触るファイルが重ならない**並列実装** | `intmap-implementer` |

**渡さない**——自分でやるほうが速いもの:

- 場所が分かっている 1〜2 ファイルの読み書き
- 1〜2 コマンドで終わる確認
- **設計判断・最終判断・利用者への報告**（これは委譲できない）

⚠ **小さい仕事を並列化しない。** 委譲する目安は、**3 ファイル以上を読む**／**出力が 100 行を超える**／
**独立に 30 秒以上かかる**のいずれか。それ未満は起動費のほうが高い。

## 3. 並列編集の安全（競合・二重実装・矛盾を防ぐ）

- **同じファイルを 2 つの agent に書かせない。** 分解は**ファイル単位**で行い、重なるなら直列にする。
- 並列実装のときは、`node scripts/worktree.mjs new <slug>` で**作業ごとに worktree を用意**し、
  各 implementer には**その絶対パスと、触ってよいファイルの一覧**を渡す。
- ⚠ **Agent tool の `isolation: "worktree"` を IntMap では使わない。** それが作る worktree は
  `<repo>/.claude/worktrees/` ＝ **OneDrive の中**になる（実測した影響は `CLAUDE.md` §6 の ⚠ 箱）。
  `scripts/worktree.mjs` は OneDrive の外に作る。
- **統合・commit・push・merge はメインだけが行う。** agent にさせない。
- 他セッションの branch・worktree・未コミット変更・stash に触れない（`CLAUDE.md` §6）。
- ラウンド番号は `node scripts/worktree.mjs status` が示す**空き番号**を使い、**push の直前に取り直す**
  （過去に 3 回、別セッションと衝突している）。

## 4. 検証は段で上げる——作業中は対象だけ、広い網は 1 回だけ

| 段 | いつ | コマンド |
|---|---|---|
| 0 | 編集の直後 | 触った検査だけ `node --test tests/r<N>-checks.test.mjs` |
| 1 | 主題のゲート | `npm run check:static` / `check:i18n` / `check:docs` / `check:catalog` / `check:engine` |
| 2 | 該当 spec だけ | `npx playwright test tests/r<N>.spec.js` |
| 3 | **push の直前に 1 回** | `npm test`（CI と同じ門） |
| 4 | 3-D・Cesium・物理・シミュレータを触ったとき | `npm run test:deep` |

⚠ 段 3 を作業の途中で何度も回さない（`CLAUDE.md` §4）。⚠ 段を飛ばして push しない。
⚠ **速度のために品質を落とさない。** 段を省くのではなく、**段の中を並列にする**。

## 5. context を太らせない

- 大量ログは agent に読ませ、**結論だけ**受け取る。
- 大きなファイルを `cat` で丸ごと出さない——`sed -n '<a>,<b>p'` / `grep -n` で必要な範囲だけ。
- 生成物・依存・巨大データ（`dist/`・`node_modules/`・`data/`）を読まない。
- 同じ調査を 2 回しない。agent に投げた調査を自分でもやり直さない。

## 6. 手順の正本

ラウンド 1 本を通す**具体的な手順**は `/intmap-round` にある（`.claude/skills/intmap-round/`）。
状態の把握・worktree の用意・後片付けは `node scripts/worktree.mjs`。
