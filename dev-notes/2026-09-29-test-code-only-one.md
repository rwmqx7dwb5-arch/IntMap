---
title: ソースを読む器具を 1 つにした——コメント剥がしの写しが tests/ と scripts/ に 635 か所（170 ファイル）あり、正本 scripts/code-only.mjs に lang・offsets・literals・parser のオプションを足して 627 か所を置き換え、残りを「形」で数える台帳に載せた。置き換えで結果が変わったのは 1 件で、写しのほうが 4,468 行のコードを見ていなかった
date: 2026-09-29
---

〈依頼〉構造監査の実測——「コメント剥がし（codeOnly / stripComments / noComments …）の手書きの写しが tests/ に 110 個、scripts/ にも別実装。写しの大半は正規表現版で、`//` を含む文字列・URL・正規表現リテラルで誤作動しうる」——を受けて、「ソースを読む器具」を 1 つにする構造改革。

## 0. 測った

- 監査の「110 個」は**名前**で数えた数だった。名前ではなく**何をするか**を構文木で数え直すと、`tests/` と `scripts/` の 170 ファイルに **635 か所**:
  - コメントの正規表現リテラルを `.replace()` する呼び出し 578（連鎖にすると約 336 本。うち 67 本は名前すら無く、1 つの assertion の中に直に書かれていた）
  - 開き記号を比べる手書きのループ（`c === '/' && next === '*'` など）の比較 51（関数にして 27 本）
  - offset を使う acorn の `onComment` 3・コメント行を落とす `.filter()` 3
- 写しが訊いていた問いは 1 つではなかった。分類すると 7 通り——(1) JS のコメントだけ外す (2) 位置（offset）と行番号を保つ (3) 文字列・テンプレート・正規表現の中身も空白にする (4) 文法（acorn）で決める (5) CSS（ブロックコメントだけ） (6) HTML（`<!-- -->` だけ） (7) SQL（`--` とブロック、`'…'` の中では止める）。**正本が (1) しか答えなかったので、残り 6 つは写しになった。**

## 1. やったこと

- `scripts/code-only.mjs` に 4 つのオプション（`lang`・`offsets`・`literals:'blank'`・`parser:'acorn'`）。**既定の出力は変えていない**——リポジトリの 1,212 ファイルで旧版とバイト一致を確かめた。`{ parser:'acorn', literals:'blank' }` は `scripts/global-surface.mjs` の旧 `codeOnly` と 1,203 ファイルでバイト一致、`{ parser:'acorn', offsets:true }` は同ファイルの `withoutComments` と 368 ファイルで一致（差は 6 ファイル、HTML コメントの中の CR を空白にせず残すことだけ。offset は同じ）。
- 写しを置き換えた。構文木で連鎖を見つけて `codeOnly(base, opts)` に書き換える codemod（`lang` は入力から、`offsets` は置換関数が `m.replace(/[^\n]/g,' ')` の形のときに付ける）＋手作業（ループ 22 本・SQL の 2 本・per-line の `split/map/join` 5 本・HTML＋JS を両方外す 1 本・acorn の `onComment` 3 本・コメント行の `filter` 3 本・配列を括弧で切り出す `scripts/newsgeo-eval.mjs`）。**635 → 10 か所**（4 ファイル）。
- 残した 10 か所は台帳 `scripts/comment-strippers-ledger.json` に載せた。`kept`（理由つき）: 正本そのもの（4）、`tests/r345-checks` の LEGACY——旧 heuristic が誤っていることを示す**標本**（2）、`tests/stalled-fetch-and-surface-gauge-checks` の `replacedCodeOnly`——固定されたテストが赤くなるための**変異体**（2）。`pending`: 0（下の §2 の 1 件は統合時に決着させ、写しを外した）。 → 残りは 3 ファイル・8 か所。
- 再発防止: `npm run check:static` に `comment-stripper` 規則（`scripts/comment-strippers.mjs`）。判定は綴りの一覧ではなく**形**（上の 4 形）で、台帳と両方向に照合する（増えたら「`codeOnly` を import せよ」、減ったら「台帳を下げよ」）。
- AST 用の共有器具 `tests/helpers/ast.mjs`（`parseSource`＝acorn の設定を 1 か所・module→script・読めなければ throw／`walkSource`）。**移行したのは新規の検査だけ**で、acorn を直に import するファイルは tests 66・scripts 29 のまま（`tests/seam-coupling-and-camera-checks` は acorn の import が要らなくなった。`scripts/` は新しい 2 本が acorn を読むので 31）。
- 文書: `docs/TESTING.md`（静的検査の一覧に規則 1 行・「the source-reading instruments」の表）、`docs/FILES.md`（code-only・comment-strippers・helpers/ast）。

## 2. 置き換えの前後で結果が変わったもの（全 394 ファイルを 1 本ずつ前後で走らせ、通った test の名前の集合を照合）

- **変わったのは 2 ファイル。うち 1 件が写しの誤り、1 件は置き換えの道具の誤り。**
- ⚠ **写しの誤り: `tests/atlas-console-kernel-checks` R165 #2 の (d)「どのモジュールも自分の持たない host メンバーに書かない」。** 共有の読み（`literals:'blank'`）に替えると赤——`js/app-body.js` の `IM_HOST.applyDockMode= / .dockRefresh= / .dockedCount=` が見えるようになった。旧ループは正規表現リテラルを知らず、文字列を行を越えて伸ばすので、正規表現の中の引用符 1 つが「文字列」を開いてその先のコードを空白にする。**実測で `js/` の 47 ファイル・4,468 行の実コードを空白にしていた**（`js/app-body.js` だけで 886 行）。同じく隠れていた `js/article-reader.js` の `HOST.readerOpen / readerCurrent` はそのファイルが持つメンバーなので緑のまま。——**この 3 つが契約違反なのか、host が自分のメンバーを宣言しているだけなのかは、読み手ではなく契約の問いなので決めていない。** 
  **統合時に決めた:** 3 つはどれも `const IM_HOST={` を宣言する当のファイルが、literal の後で（必要な closure ができてから）自分の面にメンバーを足している**宣言**であって、他人の書き込みではない。(d) は「宣言ファイル（名前でなく `const IM_HOST={` で発見）の `IM_HOST.x=` は、RW でない x について**1 メンバー 1 回だけ**遅延宣言として認める。2 回目は他と同じく rebind として落ちる」に直し、写しは正本 `codeOnly(src,{literals:'blank'})` に置き換えた。他のファイルのゼロ書き込み契約は変わらない。
- 道具の誤り: `tests/atlas-capabilities-checks` が全体で落ちた——codemod が `function codeOnly(src) { return codeOnly(String(src)); }` を作り、スタックを使い切った（import と同名の包み）。関数を消して直した。以後の検査のため `docs/TESTING.md` に「import と同名で包まない」を書いた。
- 変わらなかったが意味を正したもの（結果は前後で同じ）: CSS を JS の読みに渡していた 5 ファイル（写し経由 4・`codeOnly` 自身 2）を `lang:'css'` に、SQL の 4 か所を `lang:'sql'` に（`--` しか知らなかった手書きのループと、ブロックコメントを JS の正規表現で二度外していた箇所）、ブロックコメントだけ外していた JS の写しは行コメントも外すように。
- 前後で比べられなかったもの: 前の実行で落ちていた 5 ファイルのうち 4 つ（`deps-runtime-majors` ④・`dead-code-removal` ⑦・`layer-test-gates-and-docs` R286 ⑥・`process-doc-facts-claims` R500）は後の実行と単独実行で緑——並列負荷の揺れ。`process-doc-facts-sweep` #R274 ① は前後とも赤（この変更の前から）。

## 3. 事故（この作業の中で）

- 後の一括実行で、ファイルごとの 15 分の打ち切りが**変異の最中の検査**を殺し、`js/locales/pages.fr.js` が**空のまま**残った（624 行消失）。それを読む `process-doc-facts-histb-count` が赤になって気づいた。`git cat-file --filters HEAD:<path>` で原状に戻した（`git checkout` は使わない）。⚠ **変異する検査を外から殺すと木が壊れる**——打ち切りを入れるなら、殺したあとに `git status` で自分の触っていないファイルを見る。

## 4. 否定した見立て

- 「監査の 110 個を名前で置き換えれば済む」——67 本は名前が無く、27 本は正規表現ではなくループだった。規則を名前に付けていたら、次の写しは新しい名前で来る。
- 「正本の既定を強くすれば（文字列も空白に）オプションは要らない」——約 90 本の既存の import が既定の出力に依存している。既定はバイト一致のまま、問いごとにオプションを足した。

## 5. 検査

- `node --test tests/test-code-only-one-checks.test.mjs`（8）: 既定の不変・offsets・lang 3 種・acorn と scanner の一致・4 形の検出と非検出・台帳の両方向・木と台帳の一致・helpers/ast。
- `npm run check:static`（`comment-stripper` を含む）・`npm run check:docs`・置き換えた全ファイルの `node --test`。

## 統合時の追記 — 規則は最初の日に効いた

main に並行して入った map-a11y-structure（#821）の 2 本の新スクリプト `scripts/z-layers.mjs`・`scripts/control-names.mjs` が、それぞれ自前のコメント剥がしを書いていた（正規表現 3・acorn の onComment 1）。rebase した瞬間に `comment-stripper` 規則が 4 か所を赤にしたので、正本（`lang:'css'`／`lang:'html'`／`parser:'acorn'`、いずれも `offsets:true`）へ移した。
⚠ 移したら `admin.html` の **z-index の生の数 3 件**（`header` 10・`.toast`・`.modal-bg` 2000）が見えた。旧 `stripHtmlComments` は HTML の上で CSS のブロックコメントの正規表現を走らせていて、`<style>` の外の `/*`〜`*/` に挟まれた範囲ごと空白にしていた——**写しが誤っていた 2 例目**。台帳（`tests/z-layers-baseline.json`）は 144→147 で、隠れていた数を正直に載せた（admin.html は intmap.css の層変数を読まないので、層化は別の論点）。
