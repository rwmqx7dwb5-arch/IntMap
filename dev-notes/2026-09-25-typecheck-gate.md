---
title: 地図エンジンの契約を型にした——2 つのアダプタは 156 と 142 のメンバーを返し、16 個はどちらか片方にしか無かった
date: 2026-09-25
---

〈依頼: tsconfig／jsconfig／eslint／`.d.ts` が 0 件・`@ts-check` 0 ファイル・JSDoc 12 ファイル 48 件。
geo-engine の 8 名前空間と IM_HOST 277 項目は自前の AST 検査と散文だけで守られ、Architecture.md §1.2 自身が
「アダプタにだけ足したメソッドは静かに落ちる」と書いている。型検査を `npm run check:types` として足し、
契約を型にして両エンジンに掛けること〉

### 0. 実測（着手時）

| 何 | 実測 |
|---|---|
| `makeMapLibreAdapter` が返すメンバー | **156** |
| `makeCesiumAdapter` が返すメンバー | **142** |
| MapLibre にだけあるもの | **15**: `viewFrame` `setHorizonReach` `setCjkFontFamily` `instrumentFrames` `commandStats` `commandsReset` `commandConfig` `sceneStats` `addLimb` `limbDrawn` `setLimb` `removeLimb` `hasLimb` `_hoverHub` `setSunDirection` |
| Cesium にだけあるもの | **1**: `setWorldBase` |
| それを述べていた場所 | どこにも無い（`tests/r323-checks` が比べていたのは能力**表**で、メソッド集合ではない） |
| ファサードの扱い | 16 個とも `A().x ? A().x() : 既定値` で確かめて呼んでいた——**今日の時点では壊れていない**。壊れうるのは次に足されたもの |

### 1. やったこと

- **TypeScript 7.0.2 を `devDependencies` に固定**（`npm install -D typescript@7.0.2 --save-exact --package-lock-only`）。
  ⚠ この worktree の `node_modules` は原本への junction なので、普通に install すると**原本の node_modules を
  書き換える**。`--package-lock-only` は `package.json` と lock だけを書き、node_modules に触れない。
  lock の差分は `typescript` と、その平台別の任意依存 `@typescript/typescript-<os>-<cpu>` 20 本の**追加だけ**。
  ⚠ 原本の node_modules にはまだ typescript が無い——**`npm install`（または `npm ci`）を一度走らせるまで、
  原本とそこへ junction する worktree で `npm run check:types` と下の回帰検査は落ちる**。CI は `npm ci` なので影響なし。
- **`npm run check:types`** ＝ `node scripts/typecheck.mjs` → `tsc --noEmit -p tsconfig.json`（ファイルにしたのは
  `scripts/ci-gates.mjs --check` が「`scripts/*.mjs` を指さないゲート」を拒むから——最初は `tsc` を直に書いて
  `tests/r771` (6) に落とされた。typescript が無いときは「`npm install` が要る」と言って落ちる）。`checkJs` off・`strict` off・`moduleDetection: force`
  （js/ は全部 ES module。off だと export の無いファイルを `import()` した 22 か所が「module ではない」になる）。
  **母集合は `// @ts-check` を持つファイル**で、`tsconfig.json` に一覧は無い（`include` は js/ 全体を
  「見える」ようにするだけ）。最初の母集合: `js/geo-engine.js`・`js/cesium-engine.js`・`js/runtime.js`・
  `js/lazy-modules.js`・`js/chronos.js`。所要 約 1 秒。
- **契約を型に**: `types/geo-engine.d.ts` — `GeoEngineAdapterCore`（両方が持つ 141。`id`・`capabilities` を含む）／`MapLibreOnly`（15）／
  `CesiumOnly`（1）／`MapLibreAdapterState`（アダプタが `this` に置く状態 3 つ）／8 名前空間の
  `GeoEngineFacade`／`GeoEngineCapabilities`（能力表 3 つを注釈）。`makeMapLibreAdapter` は `MapLibreAdapter`、
  `makeCesiumAdapter` は `CesiumAdapter`、`engineFacade` は `GeoEngineFacade` を返すと JSDoc で宣言。
  ファサードの `A` は `() => GeoEngineAdapter`（片方だけのメンバーは任意）。
  メンバー集合と引数の個数は**実装から AST で導いた**（手で並べていない）。引数型はまだ `any`。
- `types/chronos.d.ts`（`window.IntMapTime`）・`types/globals.d.ts`（検査対象が読む window の名前）・
  `types/im-host.d.ts`（IM_HOST のうち 20 項目。277 全部ではない）。
- `scripts/ci-gates.mjs` は `check:*` を**発見する**ので、`package.json` に足しただけで CI のシャードに載る
  （`.github/gate-cost.json` には CI の実測が無いので書いていない——中央値で計画される）。

### 2. 出た型エラーと扱い（挙動は変えていない）

pragma を付けただけで 173 件（`strict` を切った後。TS 7 は既定で `strict` が on で、そのままだと 1,509 件）、
契約の型で注釈した後にさらに 35 件。全部を下の形で 0 にした。

| 何 | 件数 | 扱い |
|---|---|---|
| `window.X` が `Window` に無い | 127 | `types/globals.d.ts` に宣言（js/src が公開する名前は `check:surface` の基準に在ることを検査） |
| `maplibregl` が無い | 16 | `declare var maplibregl: any` |
| export の無いファイルの `import()` | 22 | `moduleDetection: force`（設定。コードは不変） |
| 能力表の `engine: string` が `'maplibre'\|'cesium'` にならない | 3 | 表を `GeoEngineCapabilities` で注釈 |
| アダプタが `this._hzOff` / `_dynImg` / `_hvh` を持つ（＋ canvas の 8） | 19 | `MapLibreAdapterState` として宣言。canvas の `_imDraw` / `_imStop` は `DynamicImageCanvas` |
| sub-view のファサードに `destroy` を足す | 2 | `GeoEngineFacade.destroy?` |
| `CesiumView` の `_inputActive` / `_inputTouched`（js/cesium-input.js が書く） | 3 | **`// @ts-expect-error` と理由の文**（2 行）。挙動を変えずに型で直す道が無かった: constructor の `/** @type */ this.x;` 宣言は TS 7 では効かず、クラスフィールドにすると実体に `undefined` の自前プロパティが増える。読む側で型キャストする形は通ったが、`tests/r182-checks` ⑥ が `if(this._inputActive) return;` の綴りを固定しているので採らなかった（他の回の検査は緩めない） |
| `Object.defineProperty(OS,'min',{get})` の後の代替代入が readonly | 1 | 代入側で `{min:number}` へキャスト |
| `setTimeout(...).unref`（Node でだけ在る） | 4 | 同じ判定を `any` へキャストした局所変数で行う |

`@ts-expect-error` はこの 2 件だけで、どちらも理由の文を持つ（持たないものは回帰検査が落とす）。

⚠ `.agents/rules/execution-strategy.md` には 1 ファイル 6,144 バイトの天井（`tests/r295-checks` ⑥）があり、着手時 6,138 バイト
——**6 バイトしか空いていなかった**。§4 の表に 1 行足すと超えるので、`check:types` は「レンダラ・型に触れるコード」の行に
`check:engine` と並べ、`check:perf` と `check:assets` の 2 行（どちらも「build が要る」）を 1 行に束ねた（情報は減らしていない。6,137 バイト）。

### 3. 回帰検査 `tests/typecheck-gate-checks.test.mjs`（元の欠陥を述べる）

js/ と types/ を一時ディレクトリへ写し、**本物の tsc** で: ① 無改変の写しは通る ② MapLibre のアダプタにだけ
足したメソッドは `js/geo-engine.js` で落ちる ③ Cesium にだけ足したものは `js/cesium-engine.js` で落ちる
④ 契約で必須にして MapLibre だけが実装したものは、**欠けている側** `js/cesium-engine.js` で落ちる
⑤ 契約に無いメソッドを呼ぶファサードは TS2339 ⑥ 一覧に無い探針ファイルは、`// @ts-check` を付けた瞬間に
検査される。加えて IMHost の名前・書き込み可否が `global-surface-baseline.json` と矛盾しないこと、
`globals.d.ts` が公開されていない名前を「js/src が公開する」と言わないこと、`@ts-expect-error` に理由の文が
あること。所要 約 10 秒。

⚠ **検査自身で 1 度詰まった**: 「先頭のコメントの中に `// @ts-check` があるか」を
`/^\s*(\/\*[\s\S]*?\*\/\s*)*\/\/\s*@ts-check/` の 1 本の正規表現で訊いたら、長い見出しコメントを持つ
ファイルで**終わらない後戻り**になり、node --test が 5 分黙った。線形の走査に替えた。

### 4. 残り

- ⚠ **ファサードが任意メンバーを確かめずに呼ぶ誤りは、まだ捕まらない。** `strictNullChecks` が要り、
  現母集合で 309 件（TS18047 `possibly null` 192 件、うち 142 件は起動前 `null` の `Cesium`／TS2722 16 件は
  ファサードの正しいガード——`A().x ?` は 2 度目の呼び出し `A().x()` を狭めない）。別の変更。
- 引数・戻り値の型はほぼ `any`。1 メンバーずつ締めれば、tsc が両側で確かめる。
- 母集合を広げるのはファイルに pragma を足すだけ。
