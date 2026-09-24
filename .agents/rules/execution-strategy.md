# IntMap — 実行戦略 (How the work is executed, every session)

`AGENTS.md` §5 が **何を・どの順で**。ここは **それをどう速く・安全に**。
**分解・並列化・委譲・隔離・検証の段は、毎回 Claude 自身が決める。利用者に管理させない。**

## 1. 依頼を受けたら、まず分解する

1. 依頼を**独立な仕事**に分ける（互いの出力を要さないもの）。
2. 2 つ以上あるなら**同じメッセージで**まとめて起動する。1 つずつ待たない。
3. 依存のある仕事だけを直列に残す。
4. 待ちが出たら**別の独立作業**を進める。**ポーリングしない**（`AGENTS.md` §4）。

## 2. 自分でやるか、subagent へ渡すか

**渡す**——生ログをメインの context に持ち込まないため:

| 仕事 | agent |
|---|---|
| リポジトリ探索・全数調査・呼び出し元の特定 | `intmap-scout` |
| テスト／CI／ビルドの**大量ログ**の解析と失敗の切り分け | `intmap-verifier` |
| 9 言語の翻訳掃引と `check:i18n` の穴埋め | `intmap-i18n` |
| 本番サイトでの検証（操作・計測・スクリーンショット） | `intmap-prod-verifier` |
| 触るファイルが重ならない**並列実装** | `intmap-implementer` |

**渡さない**——自分でやるほうが速いもの:

- 場所が分かっている 1〜2 ファイルの読み書き
- 1〜2 コマンドで終わる確認
- **設計・最終判断・利用者への報告**（委譲できない）

⚠ **小さい仕事を並列化しない。** 目安は **3 ファイル以上**／**100 行超**／**30 秒以上**。
それ未満は起動費のほうが高い。

## 3. 並列編集の安全（競合・二重実装・矛盾を防ぐ）

- **同じファイルを 2 体に書かせない。** 分解は**ファイル単位**で、重なるなら直列にする。
- implementer には**作業ディレクトリの絶対パスと、触ってよいファイルの一覧**を渡す。
  ⚠ **ハーネスが作る worktree を隔離に使わない**（OneDrive の中にできる。`docs/AGENT-SETUP.md` §5）
  ——`node scripts/worktree.mjs new <slug>` が外に作る。
- **統合・commit・push・merge はメインだけが行う。** agent にさせない。
- 他セッションの branch・worktree・未コミット変更・stash に触れない（`AGENTS.md` §6）。
- 識別子は**主題（slug）**。番号を名前にしない——tests・記録・memory も slug で（§6 の skill §4）。

## 4. 検証は段で上げる——作業中は対象だけ、広い網は 1 回だけ

| 段 | いつ | コマンド |
|---|---|---|
| 0 | 編集の直後 | 触った検査だけ `node --test tests/<slug>-checks.test.mjs` |
| 1 | 主題のゲート | 下の表から**触った主題のものだけ** |
| 2 | 該当 spec だけ | `npx playwright test tests/<slug>.spec.js` |
| 3 | **push の直前に 1 回** | `npm test` |
| 4 | 3-D・Cesium・物理・シミュレータを触ったとき | `npm run test:deep` |

⚠ **下の表が段 1 の全部である**（`package.json` の `check:*` が正本で、
`gate-lists` 規則が両者を突き合わせる）。**ゲートを足したらこの表と
`.agents/roles/intmap-verifier.md` の両方に書く**（経緯は開発記録の R403、第 6 節）。

| 触った主題 | ゲート |
|---|---|
| 何であれ（構文・JSON/YAML・merge marker・秘密） | `npm run check:static` |
| レンダラ・型に触れるコード | `npm run check:engine` `npm run check:types` |
| 利用者に見える文字列 | `npm run check:i18n` |
| 企業アトラス | `npm run check:companies` |
| 文書 | `npm run check:docs` |
| エージェントの文脈（`AGENTS.md`・`.agents/` と生成物） | `npm run check:agents` |
| `js/` を足した・消した | `npm run check:archfiles` |
| 紛争データ | `npm run check:wars` |
| 言語レイヤー | `npm run check:languages` |
| 国政選挙のデータ | `npm run check:elections` |
| 歴史都市名 | `npm run check:histcities` |
| CShapes の国境と、その下 | `npm run check:cshapes` `npm run check:histborders` |
| 全時代の国境（紀元前も） | `npm run check:histeras` |
| 歴史的な政体名 | `npm run check:histnames` |
| 歴史的な行政区分 | `npm run check:histadmin` |
| 歴史地図が述べていること | `npm run check:histfidelity` |
| 導出した令制国 | `npm run check:kuni` |
| 現代の区分を遡らせた穴埋め | `npm run check:histfill` |
| 国境のどの辺を描くか | `npm run check:bordercoast` |
| 拡大時の精密な輪郭 | `npm run check:borderdetail` |
| 歴史地点（Pleiades） | `npm run check:histplaces` |
| Atlas の dispatch / catalogue | `npm run check:catalog` |
| Atlas の能力表 | `npm run check:capabilities` |
| Atlas の観測器の判定 | `npm run check:atlasrepeat` |
| 共有窓口 | `npm run check:surface` |
| 起動費用・配られる資産（**build が要る**） | `npm run check:perf` `npm run check:assets` |
| spec を足した・組み替えた | `npm run check:testbudget` |

⚠ 段 3 を作業の途中で何度も回さない（`AGENTS.md` §4）。⚠ 段を飛ばして push しない。
⚠ **速度のために品質を落とさない。** 段を省くのではなく、**段の中を並列にする**。

## 5. context を太らせない

- 大量ログは agent に読ませ、**結論だけ**受け取る。
- 大きなファイルを `cat` で丸ごと出さない——`sed -n '<a>,<b>p'` / `grep -n` で必要な範囲だけ。
- 生成物・依存・巨大データ（`dist/`・`node_modules/`・`data/`）を読まない。
- 同じ調査を 2 回しない。

## 6. 手順の正本

作業 1 本の**具体的な手順**と**ファイル名**は
`.agents/skills/intmap-round/`（Claude `/intmap-round` ／ Codex `$intmap-round`）。
状態・worktree・片付けは `node scripts/worktree.mjs`。
