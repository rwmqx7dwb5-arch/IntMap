---
title: MapLibre 6.13 をパッケージ同梱のソースから組む——配布物の二重配布（+130 kB gzip）を +4.9 kB に
date: 2026-10-11
---

〈きっかけ〉`dev-notes/2026-10-11-maplibre-6-13.md` が 6.13.0 を保留にした。配布物で入れると、地図本体と worker が
それぞれ共有部分（約 500 kB）を抱え、起動で同じコードを二度配る（eager +466 kB raw・+130 kB gzip）。6.13 の改善
（globe の中心が極まで、1 行のラベルの改行を省く、terrain タイルへの描画）と起動費用の交換として利用者に訊く予定だった。
**交換そのものを無くせた**ので、訊かずに入れた。

## 0. なぜソースから組めるのか

上流の 6.13 は配布物を自己完結に戻したが（#8621、古い worker がキャッシュに残る問題への対処）、パッケージは
**TypeScript のソース（`src/`、シェーダは生成済みの `.g.ts`）を同梱**し、上流自身のビルドは
`src/index.ts`（本体）と `src/source/worker.ts`（worker）の **2 つの入口を rolldown で束ねるだけ**
（パッケージの `build/readme.md`）。IntMap の build も rolldown（Vite 8）で、worker は既に同じビルドの entry チャンク
（`maplibreSharedWorker`）、共有チャンクは「worker の静的 import のグラフ」で決めていた。入口を配布物からソースへ
替えれば、共有部分は 6.12 までと同じく 1 チャンクに戻る。IntMap のチャンクは内容でハッシュされるので #8621 の
「古い worker」は起きない。

## 1. 変えたもの（`vite.config.js`）

- `maplibre-gl` の alias → インストール済みパッケージの `src/index.ts`、worker の入口 → `src/source/worker.ts`。
  CSS は配布物（`dist/maplibre-gl.css`）のまま。
- **`maplibreSource()`**: そのソースを **MapLibre 自身の設定で**変換する。npm に tsconfig は同梱されないので、
  無いと最寄りの IntMap の tsconfig（target es2022・`useDefineForClassFields` 未指定＝[[Define]]）を拾う。
  実測: 初期値の無いフィールド宣言が `defineProperty(this,'x',void 0)` として 1,710 個。大きさだけでなく意味が違う
  （親のコンストラクタが入れた値を子の宣言が undefined で上書きしうる）。上流の tsconfig.json（v6.13.0・2026-10-11 に
  読んだ）は target es2022・`useDefineForClassFields: false` で、配布物も代入の形（`this.status=e`）。この 2 つだけが
  出力を変える。Vite 自身の TypeScript 変換（`oxc`）からは除外する。
- **`ML_PACKAGES`**: MapLibre が届くパッケージをインストール済みの `package.json` から推移的に数え、2 つのチャンク
  グループに入れる（手で並べない。遅延の cesium グループも `pbf`・`@mapbox/vector-tile` を名指しするので、数えないと
  そちらへ落ちうる）。
- **`workerNeeds()`**: worker が評価してよいのは自分のグラフと、**束ね器自身が合成する runtime**
  （`rolldown/runtime.js`）だけ。依存の 1 つが CommonJS なので worker も相互運用の補助を使う。runtime はファイルにも
  プラグインにも由来しないのでモジュールの記録が無い（`getModuleInfo` が null）。プラグインが出す仮想モジュール
  （modulepreload polyfill。`document` に触る）は記録を持つので、従来どおり拒む。
- **app shell の段**: 失敗した build でも `closeBundle` は走り、Rolldown は失敗を渡さない。build report が無いので
  ENOENT を投げ、**Vite はそれを本当のエラーの代わりに表示していた**（実測: 上の runtime の拒否が
  「`.perf/build-report.json` が無い」と出た）。bundle が書かれたとき（`writeBundle`）だけ shell を書く。

## 2. 費用（6.12 の配布物と比べて）

| | 6.12 配布物（main） | 6.13 配布物（#1073 の CI） | **6.13 ソース（この変更）** |
|---|---|---|---|
| eager raw | 4,816.8 kB | +466 kB | **4,831.6 kB（+14.8）** |
| eager gzip | 1,590.0 kB | +130 kB | **1,594.8 kB（+4.9）** |
| eager brotli | 1,202.2 kB | — | **1,206.1 kB（+3.9）** |
| requests | 9 | — | 9 |

チャンク: 本体 606.5 kB・共有 537.8 kB・worker 4.7 kB・runtime 1.3 kB（runtime チャンクは以前からある）。
増分は帯の内で、raw/gzip/brotli の天井は上げていない。**上げたのは `eager.modules` 315 → 897 だけ**——
配布物は 1 ファイル＝1 モジュールだったものが、ソースのファイル単位で数えられるようになった勘定の変化で、
配るバイトではない。

## 3. 確かめた

- 新しい `tests/maplibre-from-source-checks.test.mjs`（5 件）: ① alias がインストール済みパッケージのソース入口で、
  その export 名が配布物の本体と完全に一致（`window.maplibregl` の形は不変）② クラスフィールドの意味が上流と同じ
  （`ML_TSCONFIG` を外すと落ちることを確かめた）③ MapLibre が届く全パッケージがチャンクグループに入る
  ④ runtime は許し polyfill は拒む ⑤ 失敗した build で app shell が投げない。
- `tests/maplibre-6-migration-checks.test.mjs` ③ を新しい入口に合わせた（worker チャンクはソースの入口から、
  dev は `worker.ts?worker&url`）。`command-census-checks` は緑。
- build 済み dist で `maplibre-6-migration.spec.js`・`r170.spec.js`・`smoke.spec.js` 計 70 件が緑。
  プレビューで `maplibregl.getVersion()` が 6.13.0、worker が共有チャンクと runtime を import して地図が描画される。
- check:static・types・engine・docs・perf・assets。

失効条件: 上流が tsconfig の 2 つの値を変えたとき（② が配布物と突き合わせる）、またはパッケージが `src/` の同梱を
やめたとき（① が落ちる）。後者なら配布物へ戻すか、上流のリポジトリからソースを取るかを決め直す。
