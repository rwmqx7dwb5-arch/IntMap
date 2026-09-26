---
title: Vite 6.4 → 8.3（Rolldown・Oxc）——manualChunks は「依存ごと取り込む 1 つの group」になって Cesium を起動時に引き込み、Lightning CSS は標準の backdrop-filter を捨てていた。分割は優先度つき group で、CSS は esbuild で、解決は mainFields で以前と同じにした
date: 2026-09-27
---

〈dependabot PR #764（vite 6.4.3 → 8.3.0）の CI 赤を直して入れる。上げたのは 8.3.1（同じ 8.3 系の
patch）。supabase-js・maplibre-gl・Turf は別の作業が同時に上げているので、`package.json` で触ったのは
`vite` と、Vite 8 が連れてこなくなった `esbuild` だけ〉

## 0. CI の赤は 2 つ

- `check:perf`: eager.modules **1700 > 306**、eager.raw **9324.7 kB**。
- Regression: `Cannot find package 'esbuild'`（`tests/atlas-native-tools-checks` と
  `tests/r705-chronos-border-precision-checks`）。

このマシンで設定を変えずに vite 8.3.1 で build して再現した: eager raw **9450.9 kB**・requests **8**・
modules **1733**（CI の数と違うのは 8.3.0 と 8.3.1、Linux と Windows の差。形は同じ）。

## 1. Cesium が起動時に入った仕組み——manualChunks は Rolldown では「1 つの group」

Vite 8 は Rolldown で束ねる。Rolldown の `output.manualChunks` は非推奨の互換層で、関数を
**`codeSplitting.groups` の 1 つの group の `name()`** に変換する（型定義 `rolldown/dist/shared/define-config-*.d.mts`
の説明どおり）。そして group は**捕まえたモジュールの依存も再帰的に取り込む**
（`includeDependenciesRecursively`、既定 true）。1 つの group の中では名前の間に優劣が無いので、
先に出会った名前が共有の依存を持っていく。実測（`.perf/build-report.json`）で `cesium` が取ったもの:

- `\0vite/preload-helper.js`——前日の `2026-09-26-deps-minor-patch` で `maplibre-gl` に置いたはずのもの。
  `id.startsWith('\0')` の規則は効いていたが、cesium の依存としての捕獲が勝った。
- `\0@oxc-project+runtime/helpers/esm/{typeof,toPrimitive,toPropertyKey,defineProperty}.js`——
  `build.target: 'es2020'` で class field を下げるための Oxc の補助（vite 6 の build にはこの種の共有
  モジュールが 1 本も無かった）。
- `topojson-client`（13 モジュール）——Cesium の GeoJsonDataSource が依存している。以前は `geo` が名指しで取っていた。

main と supabase がこれらを cesium チャンクから import した結果、第2エンジン全体が eager になった。
加えて Rolldown は自分の runtime（`\0rolldown/runtime.js`）を **`rolldown-runtime` という独立チャンク**に置いた。

### 直し方——優先度

`build.rolldownOptions.output.codeSplitting.groups` に 4 つの group を**優先度つきで**書いた
（`build.rollupOptions` は Vite 8 で `rolldownOptions` に改名され、旧名は非推奨の別名）:

| Rollup 時代（vite 6） | Rolldown（vite 8） |
|---|---|
| `build.rollupOptions` | `build.rolldownOptions` |
| `output.manualChunks(id)` が名前を返す | `output.codeSplitting.groups[]`（`name`・`test`・`priority`） |
| `\0` 始まりの補助 → `'maplibre-gl'` | `maplibre-gl` group（優先度 4）の `test` に補助と `maplibre-gl` |
| `@turf/*`・`topojson-client` → `'geo'`、重い側は `return` | `geo` group（3）の `test` から重い側を除外 |
| `@supabase/*` → `'supabase'` | `supabase` group（3） |
| `cesium`・`@mapbox/vector-tile`・`pbf` → `'cesium'` | `cesium` group（1、最下位） |
| （esbuild が暗黙に `browser` の中身を嗅いだ） | `resolve.mainFields: ['module','browser','jsnext:main','jsnext']` |
| CSS 最小化 esbuild（既定） | `build.cssMinify: 'esbuild'`（既定は Lightning CSS） |
| `optimizeDeps.exclude: ['satellite.js']` | 同じ（理由の半分が変わった。§5） |

高い優先度の group が先にモジュール（とその依存）を取り、低い group は取り返せない。パッケージの
判定は Rollup 時代と同じ「`node_modules/<名前>` の前方一致」で、id の区切りは `/` に揃えてから比べる。

### どうしても残った 1 本——`rolldown-runtime`

Rolldown の文書 `docs/in-depth/manual-code-splitting.md`「Why there's always a runtime.js chunk?」と
実装文書 `internal-docs/code-splitting/implementation.md`「Runtime Module Placement」によると、
code splitting が有効なら runtime は**まず独立チャンクに置かれ、manual の group は runtime を
「割り当て済み」として扱う**（`test` にも渡らない）。後から既存チャンクに畳めるのは、循環を作らないと
証明できたときだけで、**manual group のチャンクが host になれるのは唯一の消費者であるときだけ**。
この build で runtime を import するのは 11 チャンク（main・`maplibre-gl`（CommonJS 包みの `__commonJS`）・`supabase`・`geo`・`cesium` ほか）で、
main へ畳むと main → `maplibre-gl` → main の循環になる。したがって **requests 6 → 7 は構造上の代償**で、
中身は 1,291 B、`index.html` の `modulepreload` で他と並行に取られる葉のチャンク。

## 2. 前後の実測（同じマシン・同じ日。v6 は origin/main の木を vite 6.4.3 で build したもの）

| | vite 6.4.3（main） | vite 8.3.1 設定そのまま | vite 8.3.1 この変更 | 天井（`tests/perf-baseline.json`） |
|---|---:|---:|---:|---:|
| eager raw | 4778.7 kB | 9450.9 kB | **4655.5 kB** | 4770.2 kB |
| eager gzip | 1600.5 kB | 2838.8 kB | **1526.8 kB** | 1597.4 kB |
| eager brotli | 1218.8 kB | 2143.5 kB | **1144.1 kB** | 1216.3 kB |
| eager requests | 6 | 8 | **7** | 6 |
| eager modules | 306 | 1733 | **296** | 306 |
| eager CSS raw / gzip | 334.5 / 56.4 kB | 331.7 / 55.8 kB | **334.5 / 56.4 kB** | 333.9 / 56.2 kB |
| async raw / gzip | 11143.7 / 3661.6 kB | 6215.8 / 2268.2 kB | **11007.4 / 3578.6 kB** | 11143.5 / 3661.6 kB |
| dist/assets | 18584.9 kB | — | **18323.4 kB** | 18583.5 kB |

eager のチャンク（raw）:

| チャンク | vite 6 | vite 8（この変更） |
|---|---:|---:|
| main | 3,655,909 B（187 モジュール） | 3,560,221 B（187） |
| maplibre-gl | 1,055,844 B（7） | 1,031,610 B（8） |
| supabase | 129,448 B（68） | 122,906 B（56） |
| geo | 52,137 B（44） | 51,164 B（44） |
| rolldown-runtime | — | 1,291 B（1） |

- **eager に入るソースモジュールの集合は同一**（ファイル単位で突き合わせた）。modules の 306 → 296 は
  束ね器の仮想モジュールの差だけ: vite 6 にだけあった CommonJS 包み 11 本（maplibre-gl 2・postgrest-js と node-fetch 9）＋
  `\0commonjsHelpers.js`＋描画長 0 の再輸出バレル 3 本（`@supabase/functions-js`・`@supabase/storage-js` の
  `index.js` と `lib/types.js`）＝15、
  vite 8 にだけある Oxc の補助 4 本＋runtime 1 本＝5。
- バイトが減ったのは Oxc の最小化器による（同じモジュール集合で main −95.7 kB）。
- async の 4 本は名前だけが変わった: `@turf/convex`・`@turf/buffer`・`proj4`・`satellite.js` の入口を
  Rollup はファイル名から `index` と呼び、Rolldown は親ディレクトリから `es`・`es`・`lib`・`dist` と呼ぶ。
  facade と大きさは同じ。
- ⚠ **`check:perf` は天井のままでは緑にならない**: requests +1（上の構造上の代償）と、gzip・brotli・modules
  の「改善したのに天井が古い」。requests +1（rolldown の runtime 1,291 B が独立チャンクで、modulepreload で
  並行に取られる）を、eager raw −117 kB・gzip −72 kB と引き換えに**受け入れて**（利用者承認「全部」）、
  `node scripts/perf-budget.mjs --update` で天井を記録し直した（eager raw 4,767,192 B・gzip 1,563,397 B・7 requests・296 modules）。

## 3. `browser` と `module`——Vite 8 は中身を嗅がなくなった

Vite 8 の移行文書「Removed Module Resolution Using Format Sniffing」: `browser` と `module` の両方を
持つパッケージは、以前は `browser` のファイルを読んで ESM でなければ `module` を選んでいた。Vite 8 は
`resolve.mainFields` の順（既定 `browser` が先）に従う。実測で 3 パッケージのファイルが替わった:
`polygon-clipping`（esm.js → umd.js。**eager の geo チャンク**の中）、`turf-jsts`（jsts.mjs → jsts.min.js）、
`html2canvas`（esm.js → UMD の dist/html2canvas.js）。

移行文書は `resolve.alias` での名指しを勧めるが、それは名前の一覧になる。代わりに node_modules を
全数で数えた: `browser` 文字列と `module` を両方持つパッケージは 10、うち `exports` の無い 5
（`geojson-rbush/node_modules/rbush`・`html2canvas`・`opentype.js`・`polygon-clipping`・`turf-jsts`）は
**全部 `browser` 側が非 ESM**＝以前の Vite が `module` を選んだ場合。`exports` を持つものは `exports` が
答えるので `mainFields` に届かない。よって `module` を `browser` の前に置けば以前と同じ解決になり、
3 パッケージはファイル単位で vite 6 と一致した。`browser` が**オブジェクト**（ファイル対応表）のものは
`'browser'` が一覧に残っているので今までどおり効く。

## 4. Lightning CSS は `backdrop-filter` を捨てていた

設定を直した build で `main-*.css` を本番の配信物（同じ木を vite 6 で build したもの、`main-BXLc3Jvy.css`）と
突き合わせると、**40 規則が `-webkit-backdrop-filter` だけを持ち、標準の `backdrop-filter` を失っていた**
（本番は 0 規則）。`css/` はこの組を `backdrop-filter: X; -webkit-backdrop-filter: X;` の順で書いている。
lightningcss 1.33 を直接呼んで再現した:

| 入力 | 出力（target: es2020 相当・Chrome 80 だけ・無し、どれでも） |
|---|---|
| `backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)` | `-webkit-backdrop-filter:blur(2px)` |
| `-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)` | 両方残る |
| `user-select`・`mask`・`appearance` の同じ並び | 両方残る |

Chromium（このテストスイートの headless Chromium）は `CSS.supports('-webkit-backdrop-filter','blur(2px)')`
が **false**、接頭辞付きだけの要素の計算値は **`none`**——サイドバー・ドロップダウン・シートのガラスが
Chrome / Edge で消える（Firefox は接頭辞を持ったことが無い）。`build.cssMinify: 'esbuild'` で
**本番と 1 バイトも違わない CSS**（同じハッシュ）に戻した。この選択は `css/` の宣言順に触らない。

## 5. esbuild の扱い

Vite 8 は esbuild を依存に持たない（optional peer `^0.27.0 || ^0.28.0`）。テスト 2 本が直接 import していた:
① ai-proxy の TypeScript の一区画から型を剥がして `new Function` で評価する（`loader: 'ts'`）、
② `js/border-style.js`（`export const` を持つ ES module）を `format: 'iife'` にして `vm` で評価する。
**devDependency として明示した**（0.28.2、Vite 8 の peer 範囲内）。そのうえ §4 で CSS の最小化にも使う。
`allowScripts` の許可も `esbuild@0.25.12` → `esbuild@0.28.2` に合わせた（npm 11.16 はこれを強制し、
版が合わないと postinstall を保留する——実測で警告が出た）。

否定した案:
- `rolldown/utils` の `transformSync`（Oxc）に置き換える——rolldown は vite の推移的依存で、
  **宣言していない依存をテストが使う**という今回の赤の形をそのまま繰り返す。しかも ESM → IIFE の変換を持たない。
- `vite` の `transformWithOxc`——宣言済みだが非同期で、やはり IIFE 化を持たない。
- Node の `module.stripTypeScriptTypes`——①には足りるが②を持たない。

## 6. 事前バンドル（dev）と satellite.js

`optimizeDeps.exclude: ['satellite.js']` の理由は「esbuild の事前バンドルが alias を通らず、Emscripten 入口の
top-level await で死ぬ」だった。vite 8.3.1 の `optimizeDeps()` を exclude 無しで走らせて測った（サーバは
立てていない）: **死なない**（Rolldown の ESM 出力は top-level await を許す）が、**alias はやはり届かず**、
`await import("./pthreads-release-….js")` として本物の Emscripten 入口を束ねた。ビルドは stub なので、
外すと dev と本番が別の satellite.js を走らせる。exclude は残し、注記を実測に合わせた。

## 7. その他の非互換（確かめて、該当なし）

- worker 5 本（`src/*-worker.js`、IIFE 出力）は `import.meta` を使っていない（Vite 8 は IIFE の
  `import.meta.url` を polyfill しない）。
- `define`・`legacy`・`build.commonjsOptions`・`worker.rollupOptions`・object 形式の manualChunks は使っていない。
- `build.target: 'es2020'` はそのまま（Vite 8 の既定 target の変更は、明示している以上効かない）。
- `scripts/` に `vite` の API を直接 import するものは無い（プラグインは `generateBundle` の `bundle` を読むだけで、
  Rolldown の `OutputChunk` も `isEntry`・`imports`・`modules[id].renderedLength` を持つ）。
- admin.html の 2 つの `<script src>` についての「can't be bundled without type="module"」は vite 6 でも出ていた。

## 8. 検証

- build → `check:perf`（天井を更新して緑）・`check:assets`・`check:static`・`check:engine`・`check:types` 緑。
- node 検査: vite.config.js を読む 16 本＋esbuild の 2 本。`tests/r180-checks` ③ だけが赤だった（下の理由。**group を評価する形に直して 17 件緑**：cesium のモジュールの
  持ち主は `cesium`、main が import する `\0vite/preload-helper.js` の持ち主は `maplibre-gl`、cesium の優先度は最低）——
  vite.config.js を `/node_modules\/cesium.*return 'cesium'/s` という**綴り**で読んでいて、group の書き方に
  その綴りが無い。守るべき事実（cesium が遅延チャンクに独りで居る）は build の報告か group の評価で測るべきもの。
- spec（`IM_TIER=all`、この worktree の vite 8 build に対して）: smoke・r175・r209・r184-satellites・
  r179-engine・r379-cesium（76 通過・1 skip）、r180/r181/r182-cesium（1 worker で 28 通過。
  R181 ⑦「既定セッションは Cesium を 1 バイトも転送しない」を含む）。
- `npm test`: browser 半分は緑。checks 半分は r180 ③ と、gate-lock の待ちで落ちた 3 本
  （r353 ⑮・r407・r500。単独で再実行して全部緑）。
- lock から素の `npm ci` が `allowScripts` の警告なしで通り、`deps-fresh` も一致。
