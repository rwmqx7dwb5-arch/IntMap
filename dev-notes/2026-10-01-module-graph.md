---
title: ファイル同士を window ではなく import で結ぶ——時計・描画の継ぎ目・言語の登録簿を export にして 2,174 か所の window 読みを import に、ファクトリの登録簿 window.IntMapModules を廃止して 147 個を export に。src/main.js は 136 行と 107 名の一覧から 85 行へ（残る行は理由つき）。window の読み返し 6,410 → 3,783、検査の文字列評価（移した部分）145 → 76 か所。起動は測定できる差なし
date: 2026-10-01
pr: 860
---

〈依頼〉「求めるのは修正ではなく革命・改革。整形ではなく造形」（全面委任）。ファイル同士が `window` で結合している構造を、明示的なモジュールのグラフへ作り替える。依存は import/export と依存注入で、読み込み順は import のグラフから導き、`window` は後方互換とデバッグの窓口に縮める。`check:surface` の数を大きく下げて台帳に残し、葉から幹へ機械的に移す段取りを作り、IntMapLang・IntMapModules・IntMapGeoEngine・IntMapTime の 4 つの読み手を import へ。移したモジュールの「ソース文字列を読む検査」を「import して評価する検査」へ置き換え、その割合を前後で報告する。起動が遅くならないことを示す。

## 0. 測った（着手前、`origin/main` 281e584 と同じ木）

| 何 | 着手前 | 後 | 測り方 |
|---|---:|---:|---|
| `js/`・`src/` のファイル | 392 | 392 | `node scripts/module-graph.mjs` |
| import/export を持つファイル | 202 | 312 | 同上 |
| `window` に載せるだけのファイル | 190 | 80 | 同上 |
| `src/main.js` の import 行 | 136 | 85 | 同上 |
| `window.IntMapModules.x =` の登録 | 148 | **0** | 同上 |
| `MODULE_FACTORIES` | 107 名 | **無し** | — |
| 公開名の `window` 読み返し（js/・src/） | 6,410 | **3,783** | `check:surface` の新しい `reads` 登録（`window.`・`globalThis.`・`self.`・暗黙のグローバル） |
| うち 4 つ（Lang 1,800・Modules 419・GeoEngine 193・Time 185） | 2,597 | **0** | 同上 |
| `window` に公開される名前 | 650 | 649 | `check:surface`（`IntMapModules` が消えた） |
| node の検査ファイル | 421 | 425 | — |
| 移したモジュール（199 ファイル）を**文字列で評価**する箇所 | 145 | **76** | `new Function`/`vm.run*` の呼び出しのうち、直前 6 行が移したファイルのパスを読むもの |
| 移したモジュールを **import で評価**する箇所 | 184 | **248** | `importModule`/`requireModule`/`import` の対象が移したファイル |
| 全体で js/・src/ を文字列評価する箇所 | 274 | 201 | 同上（全ファイル） |

⚠ 監査の数字（読み出し 7,677・window 名 628/647・文字列を読む検査 220/400）は数え方が違う（コメントを除く正規表現・名前の母集合）。上の表は**同じ道具で同じ木の前後**を測ったもので、比べてよいのはこちら。文字列評価の割合は、移したモジュールについて **44% → 23%**（145/(145+184) → 76/(76+248)）。

**実装担当（9 体並列）が報告した件数**: 文字列評価 → import に移した検査 約 385 件、文字列評価のまま残した検査 65 件（すべて「巨大な closure の中の関数断片を取り出して評価する」もの——モジュールとして外に出ていない関数は import できない。残した理由は各検査のコメントに 1 行ずつ）。

## 1. 何を作ったか

**持ち主は export、読み手は import。** `js/chronos.js`（`IntMapTime`）・`js/geo-engine.js`（`IntMapGeoEngine`）・`js/lang-registry.js`（`IntMapLang`）を `export const` にし、読み手 41・118・149 ファイルに `import` を足して読みを束縛に替えた。続けて葉の持ち主 6 つ（`IntMapEraName`・`IntMapBorderCoast`・`IntMapRefData`・`IntMapWhoDonName`・`IntMapTables`・`SEA_LABELS`）も同じ道具で移した。各持ち主は同じ物を 1 行で `globalThis` にも載せる（**互換の窓**: ブラウザの spec・コンソール・静的ページのインライン script）。宣言された契約（`types/`）は**export の JSDoc** に付けた——読み手が import する束縛がコンパイラの見る型で、以前の「型付きの `window.*` 代入」と同じ強さで契約を検査する。

**ファクトリの登録簿を廃止。** `window.IntMapModules.x = function (HOST) {…}` の 147 個を `export function x(HOST) {…}` にし、`js/app-body.js` が名前で import して `x(IM_HOST)` と呼ぶ。無いファクトリは**リンクの誤り**（束ね器もブラウザも評価前に拒む）になったので、起動後に一覧と突き合わせていた `MODULE_FACTORIES` を外した（`__imModuleCheck.missingFactories` は常に `[]`——spec と本番スモークが見る欄なので残し、意味をコメントに書いた）。遅延モジュールは `js/lazy-modules.js` の `mount: (IM_HOST, m) => m.x(IM_HOST)` で、ローダが `import()` の名前空間を渡す。

**依存注入。** engine は GL の独自レイヤー 4 種（立体・大気の縁・軌道点・航空機）を `window.IntMapModules` から引いていた。静的 import にすると遅延の航空機レイヤーが起動の束に入るので、逆向きにした——各モジュールが評価時に `IntMapGeoEngine.provideLayerKind(name, factory)` で渡し、engine は私有の表から引く。4 つは export ではなくなった。

**入口は導出。** トップレベルが宣言だけで、他のモジュールが import するファイルは入口の一覧に要らない（評価の時刻が動いても観測できない）。その 51 行を外した。残る 85 行は副作用（`window` への公開・リスナ・行の登録）をまだ import の辺にしていないファイルで、`--entry` が 1 行ずつ理由を言う。

**道具 `scripts/module-graph.mjs`**: 報告（台帳の列）／`--plan`（葉から幹への順）／`--export NAME`／`--migrate NAME`（暗黙のグローバルも拾う。classic の `<script>`・Worker・ページから届かないファイル・同名の束縛を持つファイルは**理由つきで拒む**）／`--factories`（遅延ファイルへの静的な辺は拒む）／`--entry`。

**検査は import して評価する。** `scripts/lib/import-module.mjs`（`tests/helpers/import-module.mjs` が再公開）の `importModule(path, { globals, mocks })` が対象を毎回新しく評価し、**その直接の import だけ**を差し替える（Node 24 の `module.registerHooks`、同期・同スレッド）。`swappable()` は場合ごとに振る舞いを変える stub、`requireModule`/`langRegistry` は同期の形（ビルドスクリプト用）。

**静的ページ** privacy/terms/science/sources.html は `<script type="module">` に（`js/lang-registry.js` が export を持つため。順序は module script どうしで保たれる）。

## 2. 門（gate）

- `check:surface` に **`reads` 登録**（名前 → 回数、両向きのラチェット）と、**ラチェットでない規則**「持ち主が export している名前を、モジュールが `window` から読むことは常に 0」を足した。
- `check:static` の「呼ばれないファクトリ」は `export-readers.mjs`（読み手の無い export）に吸収され、代わりに `window.IntMapModules` の**復活**を拒む。
- `export-readers.mjs` がローダの `mount: (IM_HOST, m) => m.x()` を読み手として数える。
- `tests/module-graph-checks.test.mjs` ①〜⑧: 持ち主を import で評価／import の辺だけを差し替え／道具が固定の木で言ったとおりに書き、**書いてはいけない場合を拒む**／`ensureImport`／実際の木で「登録簿なし・export 名の window 読み 0・入口の全行に理由」。

## 3. 移す途中で見つかったもの（作業の副産物ではなく、構造が見えるようになった結果）

- **型**: `window.IntMapLang` は `any` だったので、`IntMapLang.t(lang, en, jp, …)` が 1 引数の関数として宣言されていることを誰も知らなかった（本体が `arguments` を読む）。import した瞬間にコンパイラが 2 か所を指摘——`t` に実際の署名を書いた。
- **暗黙のグローバル**: `js/atlas-cap-view.js` は `IntMapGeoEngine` を `window.` 無しで読んでいた。持ち主が `window.X =` でなくなった瞬間に `check-split-scope` が「何にも解決しない自由識別子」として拾った。道具が暗黙のグローバルも辺として扱うようにした。
- **「無いこと」で判定していた所**: `js/gis-layers.js`・`js/gis-sources.js` は「地図が無い」を「`window.IntMapGeoEngine` が無い」で判定していた。import では engine は常に在るので、ヘッドレスの GIS（Node・Worker の 2 つ目の realm）が `map-unavailable` でなく `layer-unknown` を返すようになっていた（検査 R732 ⑨ が捕まえた）。engine 自身に訊く（`hasRenderer()`）形にした。ブラウザでは地図ができる前の呼び出しも正しく「地図が無い」と答える。
- **生成器の綴り**: `scripts/zh-hans.mjs` は `window.IntMapLang.define('zh'` という綴りを目印に表を切り出し、ヘッダを捨てていたので、import 行も捨てて**読み込んだ瞬間に投げる簡体字の表**を書くところだった。import 行を本文と一緒に運ぶようにした。コードを**書く**側の道具（新言語の雛形・3 つの codemod）も `window.IntMapLang.*` を書いていたので、素の束縛＋`ensureImport` に。
- **検査が黙って本物を測っていた**: 天気・GIS の検査のいくつかは、stub を `window` に置いたまま import していたため、移行後に**本物の engine に対して**緑のまま走っていた（地図が無いので何も描かれず、「描かれなかった」を正しいとして通る形のものがあった）。stub を import の辺で渡すようにして、意図した世界に戻した。
- **計器の約束違反**: `scripts/perf-compare.mjs` は見出しで「2 つのビルドを 2 つの URL で比べられる」と言いながら、腕を必ず `--base` に連結していた。完全な URL をそのまま使うようにした。
- **新しい `window` 読み 1 件**: 着手中に main へ入った commit（News の過去時刻の修正）が `window.IntMapSafe` を 1 か所足した。`IntMapSafe` の持ち主 `js/safe-html.js` は `admin.html` が classic script として読むので、まだ export できない。`reads` 登録に 115 → 116 として記録した（このラチェットが最初に捕まえた実例）。

- **CodeQL が見えるようになった流れ**: PR の CodeQL が「変更した行の上の警告」24 件で赤になった。どれも `main` で 2026-07 / 09 から開いていた既存の警告で、`window.IntMapX` → `IntMapX` の書き換えで行が変わったため、この PR に数えられた。却下せず直した——
  - `js/data-layers.js` の AIS: #R801 の MMSI の門が `/^d{1,9}$/`（**バックスラッシュが落ちて「d」という文字だけに一致**）で、実在の MMSI は全部拒まれて**船が 1 隻も保持されていなかった**うえ、汚染の警告も閉じていなかった。`\d` に戻し、保持先を `Map` にした（鍵が `Object.prototype` に届く経路そのものが無い）。`tests/module-graph-checks.test.mjs` ⑨。
  - `js/map-ui.js` の凡例: 局所の `esc` が `< > &` を消すだけで `"` を残し、二重引用符の属性に入っていた → 唯一の符号器 `IntMapSafe.html`。
  - `js/app-body.js` の時計ウィジェット: 読者の設定（タイムゾーン）を `innerHTML` に符号化せず入れていた → `IntMapSafe.html`。
  - 検査 3 本の正規表現の作り方（`$` や `.()$` だけを逃がしていた）→ 全メタ文字。
  - この 2 か所で `window.IntMapSafe` の読みが 116 → 118（`reads` 登録に記録。`safe-html.js` はまだ export できない——§5）。
- **着地後に入った検査**: 全件テストの後に main へ入った `tests/atlas-live-stream-checks.test.mjs` が `js/ai-core.js` を文字列で評価していた（CI の Regression 3/3 で赤）→ import に。続けて main に入ったレイヤー宣言化（`js/layers/`）とは `js/satellites-live.js` 1 本で衝突した——main 側を採って道具を掛け直した（冪等なので手で混ぜない）。その変更が持ち込んだ `scripts/layer-descriptors.mjs` はロケールの表を `vm` で評価していたので require に、`window.IntMapLayers` の読みは 20 → 23（`reads` に記録）。CodeQL の残り 1 件（`js/app-body.js:3156` アバター切り抜きの `blob:` URL を `<img>` に入れる箇所）は利用者の承認を得て誤検知として dismiss（alert #66）。

## 4. 起動が遅くならないこと

**束（`check:perf` と build-report、同じ機械で両方をビルド）**: eager JS raw 4,564.3 → 4,533.5 kB（−30.8）、gzip 1,487.5 → 1,491.3（+3.8、+0.26%）、brotli 1,125.7 → 1,124.9（−0.8）、要求 9 → 9、モジュール 291 → 291。`check:perf` は天井の内側。

**起動（`scripts/perf-compare.mjs`、2 つのビルドを同じ origin の別パスで配り、A B を交互に 8 回＋A/A の対照）**: first pixel 2,271 → 2,292 ms（雑音 ±524）、操作可能 4,291 → 4,189 ms（±798）、FCP 426 → 481 ms（±323）、長タスク合計 2,340 → 2,417 ms（±597）——**どれも雑音の内側＝差は測定できない**。外部要求は再生キャッシュに無く両腕とも遮断（同条件）。DOM ノード −356・リスナ −110 は雑音の外だったので確かめた——起動後の DOM を 2 つのビルドで比べると要素数 4,021 / 4,021、id ごとの部分木の大きさも全部一致し、行 164 / 164。差は採取時刻の揺れで、欠けた UI は無い。

**ブラウザでの実測（ビルドした `dist/`）**: レイヤー行 164（smoke の基準 100 以上）・`__imModuleCheck.missing` 空・遅延モジュール 44 個すべてが届いて `mount` され公開名を出す（`__imLazyCheck.failed` 空）・GL の 4 種がすべて engine から独自レイヤーを組む（`addLayer` の手前で確認）・言語切替後の状態は旧ビルドと同じ（英語のまま残る行は両方とも「HDI (2022)」1 行）・静的ページ 4 枚は本文の文字数まで旧ビルドと一致・コンソールのエラーは外部の 429 のみ。`check:i18n` の出力は行番号のずれ（import 行の分）以外、旧ビルドとバイト同一。

## 5. 残り（次に移すもの）

`node scripts/module-graph.mjs --plan` が順を言う（2026-10-01、この木）。読まれる回数の上位は `IntMapLazy`（123・持ち主が `__imLazyCheck` を読む）・`_registerLayerOpacity`（70）・`_hideGenericLegend`（64）・`countryGeo`（54）で、**持ち主が葉＝次の一手でそのまま移せる**のは `IntMapLabelScale`（48 か所・31 ファイル）と `IntMapDialog`（38・21）。今回止めたのは、どちらも多くの検査が文字列で評価しているファイルで、移すと検査の書き換えがもう一巡要るから——移した 10 名の検査を全部緑にするところまでを今回の範囲にした。
⚠ **`--plan` がまだ見ていない形がある**: `IntMapSafe`（116）・`IntMapDevice`（65）のように**大域オブジェクトを渡された IIFE** で公開する持ち主は、`check:surface` は数えるが `--plan`／`--export` は持ち主として見つけない。`IntMapSafe` はさらに `admin.html` の classic script でもあるので、移す前に admin のページを module にする必要がある。入口に残る 85 行は、その公開を読む側が import へ移るたびに `--entry` が減らす。
