---
title: Atlas の能力をひとつの場所に集める——2,190 行の dispatch switch をなくし、行・引数の schema・実行本体を js/atlas-cap-<名前空間>.js の 1 項目にまとめた。登録表・dispatch・schema の表はその項目から作る
date: 2026-09-30
---

〈依頼（監査）〉能力表 `js/atlas-capabilities.js`（146 行）と実体 `js/atlas-console.js` の dispatch switch
（147 の case・約 2,190 行）が別々で、`dispatchName → legacy` でつないでいた。1 能力を足すのに、行・case・
カタログ文・schema・観測器の選択（・場合により CORE・主題語）を別々に書き、`check:capabilities` の 23 規則が
継ぎ目を見張っていた。能力の処理を能力と同じ場所に置き、宣言と実行関数を 1 モジュールに持たせ、登録表・
dispatch・schema・観測器の選択をそこから導く。147 の case を全部、本文そのまま移す。遅延読み込みを保ち
eager を増やさない。足し方を文書にし、1 ファイル足すだけで現れることを検査で示す。

## 0. 測った（着手時）

- `js/atlas-console.js` 4,988 行・837,153 バイト（LF）・最長行 5,134 字。dispatch 関数は 1718〜3907 行、
  379,993 バイト。
- switch の腕は **147**（能力 146＋`default`）。うち**空の case が 3 つ**で、次の case に落ちていた:
  `volcano`→`volcanoFilter`・`heritage`→`heritageFilter`・`radiationObserved`→`radiationNear`。
  空でない case で最後まで走り抜けるもの・switch への `break`・`this`・`arguments` は **0**。
- 146 行すべてが列 1 の綴りをちょうど 1 つ持ち、その綴りの case がちょうど 1 つあった。
- case の本文が読むカーネルの名前（自由変数）を**スコープ解析で全数**数えた: **231**。うち `let` が 22
  （`_pois`・`_hlGen`・`_lastPlace`…。case の中で書くものは 10）、`import` が 9、残りは `const`・関数宣言・
  `HOST`。⚠ TypeScript 7 は JS の API を持たない（`require('typescript')` のキーは 2 つ）ので、解析は acorn の
  上に書いた小さなスコープ解決器で行った。

## 1. 形

- **能力ひとつ＝項目ひとつ。** `js/atlas-cap-<名前空間>.js`（19 本。名前空間は ID の先頭）の既定エクスポートが
  項目の配列で、1 項目は `{ row, schema, run }`。`row` は登録表の行そのもの（列の説明は
  `js/atlas-capabilities.js` の THE TABLE のまま）、`schema` は呼ぶたびに新しい schema を返す関数（組み立て関数は
  `js/atlas-caps.js`）、`run(a, dctx, K)` は旧 case の本体。
- **導出**（`js/atlas-caps.js`）: `capabilityRunners`（列 1 → run の null-prototype 表）・`capabilitySchemas`・
  `capabilityRows`・`unknownAction`（旧 `default`）・項目の検証（名前空間違い・綴りの重複・ID の重複・run 無し・
  列数違いを名指しで拒む）。
- **dispatch** は 1 回の参照: `(CAP_RUN[CAPS.dispatchName(a.type)] || unknownAction)(a, dctx, capDeps())`。
  ⚠ `async` をやめた——run が async 関数なので、その promise をそのまま返すと旧 switch と同じく最初の `await`
  までは同期に走る（async で包むと resolve が 2 tick 遅れる）。型が無いときは `Promise.resolve(R(true,''))`、
  例外は `Promise.reject`（旧実装と同じ見え方）。
- **K**（`capDeps()`）: run が読むカーネルの名前だけを getter で渡す。`let` は getter/setter で、本文中の参照を
  `K._pois` に書き換えた（唯一の本文の変更）。初回の dispatch で組む（宣言順の TDZ を踏まない）。`window` には
  何も足さない。
- **import はカーネルを通さない。** case が使っていた 9 の import（`personaPrompt`・`settleWithin`・`lateNote`・
  `resolveObserver`・`satelliteFacts`・`weatherFacts`・`routeFacts`・`ATTACH_LOG`・`ATL_FILE`）は、項目の
  ファイルが自分で import する。コンソールでは使われなくなった `atlas-result-facts.js` の import を外し、
  `atlas-deadlines.js` の import から `lateNote` を外した。
- **落ちていた 3 組**は、本文を持つ側を名前付き関数（`volcanoFilterRun` など）にして両方の項目が同じ関数を
  指す。置き場所は 2 つの名前空間のうち辞書順の先（`data`）——`map` が `data` から import し、循環を作らない。

## 2. 否定された見立て（2 つ）

- **サブディレクトリ `js/atlas-caps/` に置いた最初の版**は、`js/*.js` を歩く計器を一度に盲目にした。
  i18n の監査（`scripts/i18n-helpers.mjs` の `parseAll` は `js/` 直下だけを読む）が `atlas-caps/map.js` を
  知らずに落ち、`tests/app-source.mjs` も同じ。計器の側を直すのは今回の範囲の外で、しかも「次の新しい
  サブディレクトリ」がまた同じ穴になる。⇒ **`js/` 直下の `atlas-cap-<名前空間>.js`**。
- **登録表の行を別モジュール（`js/atlas-caps-table.js`）に生成した版**は、eager の中身は同じ（raw は
  HEAD の登録表でビルドしたものと同じ 4,670,954 B）なのに **eager.modules が 286→287**。modules は完全一致の
  ratchet。⇒ 行は `js/atlas-capabilities.js` の中の `GENERATED ROWS` の印の間へ写す。
- （途中の版）run の先頭を `const { L, LA } = K;` と分割代入にしたら、i18n の計器（`L = K.L` のような
  「名前 = 初期値」でしか翻訳関数を証明しない）と `LA(` のスコープ検査が 4 か所の `LA(` を見失った。⇒
  1 名 1 宣言子（`const L = K.L, LA = K.LA`）。`K` の getter は「1 文で返す getter」なので `exposedHelpers` が
  `LA` を翻訳関数の性質名として証明できる。

## 3. 同じであることの確かめ

- 移行は台本で機械的に行った（HEAD のソースから、AST で case の本文・前置きの注釈・同じ行の後置き注釈を
  切り出し、行と schema は注釈ごと項目へ運ぶ）。再実行できる形で、最後の版も HEAD から作り直した。
- 登録表: `toJSON()`・`aliasMap()`・全能力の記述子（ID・綴り・別名・分類・観測器・効果・生成物・危険度・確認・
  対象・遅延・undo）・**全綴りの `dispatchName`** が HEAD と JSON で**バイト一致**（順序も）。schema の表は
  deepEqual（キーの列挙順だけが名前空間順に変わった。順序を読む者は居ない——`ids()` の利用者を数えた）。
- 項目の各ファイルを同じスコープ解決器で読み直し、未解決の名前が既知のグローバル以外に **0**。
- `tests/atlas-capability-modules-checks.test.mjs` ② が**出荷される dispatch を持ち上げて評価**し、宣言された
  全綴り（300 超）がそれぞれ自分の項目の run に届くこと、`toString`・`constructor`・未知の綴り・大文字違いが
  `unknownAction` に落ちること、戻り値が常に promise であることを確かめる。③ は K が run の読む名前と
  過不足なく一致すること（足りなければ undefined、余れば依存の一覧が嘘になる）。
- `tests/atlas-capabilities-verdict-checks.test.mjs` ㉑ は flyTo の case を**文字列で持ち上げて評価**していた。
  いまは run を import して**そのまま呼ぶ**（K に記録用のカメラを渡す）——構造の改善がそのまま検査の改善になった。

## 4. 数

| | 前 | 後 |
|---|---|---|
| `js/atlas-console.js` | 4,988 行・837,153 B・最長行 5,134 字 | 3,035 行・431,828 B・最長行 2,745 字 |
| `js/atlas-capabilities.js` | 216,874 B | 166,507 B（行は JSON の写し） |
| `js/atlas-schemas.js` | 50,097 B | 4,972 B（組み立てるだけ） |
| 能力を 1 つ足すのに書くファイル | 4（登録表の行・switch の case・schema・カタログ文）＋観測器の列（行の中） | **2**（名前空間ファイルの項目 1 つ・カタログ文）＋ `node scripts/atlas-caps.mjs --write`。カーネルの名前で K に無いものが要るときだけ `capDeps()` に 1 行 |
| eager（check:perf） | raw 4,670,954 B（HEAD の登録表でビルド）・modules 286 | raw 4,670,954 B・modules 286 |
| 遅延チャンク atlas-console | 1,059,973 B（天井） | 1,099,713 B（+39,740 B・+3.7%） |

⚠ 遅延チャンクの増分は構造の費用で、隠していない: 行が遅延側にも載る（項目が宣言を持つので。約 17 KB）、
K の getter 231 本、各 run の先頭の `const x = K.x`、モジュールの枠。`tests/perf-baseline.json` の
`async.chunks["atlas-console"]` だけをこの実測に上げた（`--update` は全項目を書き換え、この回と無関係な
変動まで固定するので使わない）。

## 5. 触った台帳

- `tests/control-names-baseline.json`: 名前の無い操作子 9 件が `atlas-console.js` 2・`atlas-cap-layers.js` 2・
  `atlas-cap-sim.js` 3・`atlas-cap-ui.js` 2 に分かれた（合計 55 は不変。移っただけ）。
- `tests/global-surface-baseline.json`: `IntMapAtlasTrace` が「誰も読まない公開名」に入った。公開する行は同じ
  （`IntMapAtlasDev` のときだけ入るコンソール用の診断で、`dev-notes/2026-09-29-dead-code-removal.md` がそう
  述べている）。変わったのは、`Object.keys(window)` を歩く列挙器の免除が「公開するファイルが入口メソッドを
  定義しているか」で決まり、公開する行が `atlas-console.js` から `atlas-cap-research.js` に移ったこと。
- `tests/r285-checks.test.mjs` の `EXPECTED_CALLS`: persona の呼び出し 9 のうち 3（brief・研究地図・歴史地図）が
  `atlas-cap-research.js` へ。合計 22 は不変。`tests/atlas-console-kernel-checks.test.mjs` の RW の書き手も
  実際に書く項目のファイルへ。

## 6. 検査

- 新規 `tests/atlas-capability-modules-checks.test.mjs`（① 行と項目の 1 対 1・名前空間とファイル・switch が
  無いこと ② 出荷される dispatch の評価 ③ K の過不足 ④ **作業ツリーの外の写し**（import を辿って発見した
  33 ファイル）に名前空間ファイルを 1 本足して `--write --root` を走らせ、登録表・別名・schema・run に現れ、
  既存の順序が保たれ、作業ツリーは無傷 ⑤ 生成物の一致・eager は何も import しない・run に届くのは遅延の
  カーネルだけ ⑥ 不備な項目の拒否・null-prototype・schema が毎回新しい）。
- `scripts/atlas-capability-audit.mjs`: dispatch の群を項目から読む（`dispatchGroups`）。`auditWith` は `groups`
  も DATA として受ける（固定具が欠陥を渡せる）。カーネルの文は `kernelLines`（console＋項目）。生成物が
  項目と食い違えば `caps-generated` として名指しで落ちる。`scripts/atlas-catalog.mjs` も項目から読む。
- 既存の検査で case の綴りを読んでいたもの（約 65 ファイル）は、`tests/helpers/atlas-kernel.mjs` の
  `capabilityEntry(綴り|ID).run / .row / .schema`・`runAst`・`dispatchRuns`・`capsSource` で**同じ事実**を
  読むように直した。緩めたものは無い（「case が 1 行」の類は「項目に run がある」へ、行や schema の綴りは
  その項目の行・schema へ）。
- 走らせたもの: 関係する node 検査 119 本＋新規（2,317 件）緑・`check:catalog`・`check:capabilities`・
  `check:atlasrepeat`・`check:surface`・`check:types`・`check:engine`・`check:docs`・`check:archfiles`・
  `check:i18n`・`check:perf`（build 後）緑。`check:static` は `output-taint` の world-packs 2 件だけが赤——
  この回は触っていない（#833 で world-packs が変わり台帳が追いついていない。origin/main の #834 が直している）。

## 7. 残り

- `tests/helpers/scratch-tree.mjs`（作業ツリーの私有の写し）は origin/main の #834 で入り、この branch の
  base には無い。④ は自前で import の閉包だけを OS の一時ディレクトリへ写している。統合後は scratch-tree に
  寄せられる（#834 の `tree-writer` 規則が一時ディレクトリへの書き込みをどう見るかも確かめる）。
- 撤去・代替の表（`WITHDRAWN`・`FALLBACKS`・`FORBIDDEN_SUBSTITUTES`・`EQUIVALENTS`・`RULE_DOCUMENTED`）は ID を
  キーにした方針表として `js/atlas-capabilities.js` に残した。新しい能力を足すのに要らないので項目には
  入れていない。
