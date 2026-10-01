# IntMap — 現状仕様書 §3 ファイル構成 (Files)

> **現状仕様書の §3。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §3.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 3. ファイル構成 (Files)

**ファイル台帳の正本は [`docs/FILES.md`](../FILES.md)。** `js/` の 1 本ずつの 1 行説明を
全部ここに置くと仕様書の 4 分の 1 が台帳になるので分けた。節番号は向こうでも `§3.1`〜`§3.13` の
ままで、他の文書からの `§3.x` 参照はそのまま通る。`node scripts/arch-files-check.mjs --check` が
`js/` の実体と台帳を突き合わせる——**どの段が `js/` の話かは `§3.x` の見出しが名乗るディレクトリで
決まる**ので、見出しはその段の飾りではなく主語である。

ここでは**置き場所の規約**だけを述べる。

- **リポジトリのルートがサイトそのもの**。`index.html` が頂点にあり、`css/` `js/` `src/` と
  静的アセット（Köppen ラスタ・国旗 webfont・`sw.js`・`data/`・`admin.html`・
  `science.html` / `sources.html` / `privacy.html` / `terms.html`）が横に並ぶ。
  `vite.config.js` の `STATIC_ASSETS` が「束ね器を通さずそのまま配るファイル」の**明示リスト**で、
  `tests/layer-boot-graph-checks.test.mjs` が、参照されているのにリストに無いアセットで落ちる。
- **`js/`** — アプリ本体。`js/app-body.js` が中核（`IM_HOST`）で、他は主題ごとのモジュール
  （地図の表面／データレイヤー／ニュース／Atlas と AI／分析とシミュレーション／宇宙／シェルと
  アカウント）。ファイル単位の役割は `docs/FILES.md` §3.3〜§3.10。
- **`src/`** — バンドラ側の入口だけ（`main.js` がページの入口で、`vendor.js` が npm 依存を同じグローバル名で
  再公開する）。アプリのロジックは置かない。`main.js` が並べるのは**まだ import の辺を持たない副作用モジュール**
  だけ——下の「ファイル同士の結び方」。
- **`css/`** — 3 本（アプリ本体・静的ページ・フォント）。
- **`data/`** — 同梱データ（ビルド時に生成した軌道要素・海流・星表など）。生成元は
  `scripts/build-*.mjs`。詳細は `docs/FILES.md` §3.11。
  ⚠ **その一部は git の外にある。** ルートの `data-assets.json`（追跡対象）が、各データ集合の
  パス・**中身の sha256**・それを運ぶ **GitHub Release の asset** を持つ唯一の正本で、
  `npm run data:pull`（`scripts/data-assets.mjs`）が取得→sha256 検証→チェックアウトの外の共有ストア
  （既定 `%LOCALAPPDATA%intmap-data`・OneDrive の外）→`data/` へのリンク（ディレクトリは junction／
  symlink、単一ファイルはコピー）を行う。**無い・目録と違う**ときは門が赤くなりその名前と
  `npm run data:pull` を言う（黙って飛ばさない）。規約と門は `docs/TESTING.md`
  「git の外にあるデータ」、判断の理由は `DECISIONS.md`。
- **`supabase/`** `docs/` `scripts/` `tests/` `.github/` — 運用側。詳細は `docs/FILES.md` §3.12。
- **`index.html` を分割するときの手順**は `docs/FILES.md` §3.13 が正本（`IM_HOST` の規約と、
  「いつ取りに行くか」という第2の軸を含む）。**分割は必ずその手順に従うこと。**

### ファイル同士の結び方 — `window` ではなく import のグラフ

**依存は `import`／`export` と依存注入で明示する。** あるファイルが別のファイルの物を使うなら、
そのファイルから名前で `import` する。`window` に載せて読み返す結合は、束ね器にも Node にも型検査にも
読み手にも見えない辺で、`src/main.js` の手書きの順序と、ソースの**文字列**を読む検査を生んでいた。

- **持ち主は export する。** `js/chronos.js`（`IntMapTime`）・`js/geo-engine.js`（`IntMapGeoEngine`）・
  `js/lang-registry.js`（`IntMapLang`）ほかが `export const` で公開し、読み手は `import` する。
  宣言された契約（`types/`）は**その export に** JSDoc で付いている——読み手が import する束縛が
  コンパイラの見る型である。
- **`window` は後方互換とデバッグの窓口。** export した持ち主は同じ物を 1 行で `globalThis` にも載せる
  （ブラウザの spec の `page.evaluate`・コンソール・静的ページのインライン script のため）。
  **モジュールがそれを `window` から読み返すことは無い**——`npm run check:surface` が拒む。
- **ファクトリは export。** 殻（`js/app-body.js`）は使うファクトリを名前で import して `x(IM_HOST)` と呼ぶ。
  無いファクトリは**リンクの誤り**（束ね器もブラウザも評価の前に拒む）で、起動後に一覧と突き合わせる
  ことはもう無い。遅延モジュールは `js/lazy-modules.js` の登録が `load: () => import('./x.js')` と
  `mount: (IM_HOST, m) => m.x(IM_HOST)` を対にし、ローダが `import()` の名前空間を `mount` へ渡す。
- **使う側へ渡す（依存注入）。** 静的 import が遅延チャンクを起動の束へ引き込む所では、逆向きに渡す——
  GL の独自レイヤー（立体・大気の縁・軌道点・航空機）は各モジュールが評価時に
  `IntMapGeoEngine.provideLayerKind(name, factory)` で engine に渡し、engine は自分の表から引く。
- **`src/main.js` に残るのは移行の残り。** トップレベルが宣言だけのファイルは、それを import する
  ファイルがある限り入口の一覧に要らない。残る行は副作用（`window` への公開・DOM のリスナ・行の登録）を
  まだ import の辺に変えていないファイルで、`node scripts/module-graph.mjs --entry` が 1 行ずつ理由を言う。

**移し方（葉から幹へ、機械的に）** — 道具は `scripts/module-graph.mjs`:

1. `node scripts/module-graph.mjs --plan` — `window` から読まれている名前を読まれる回数順に並べ、持ち主が
   既に export しているか、持ち主が**葉**か（持ち主自身が読む公開名が無く、export しても循環しない）を言う。
2. `--export NAME --write` — 持ち主の `window.NAME = …;` を `export const NAME = …;` ＋ 互換の 1 行にし、
   持ち主自身の読みを束縛に替える。
3. `--migrate NAME --write` — `window.NAME` を読む全ファイルに `import` を足し、読みを束縛に替える
   （`window.` の無い暗黙のグローバルも拾う）。束ねられる所（ページの module の入口から届き、classic の
   `<script>` でも Worker の中でもない）だけを書き、それ以外は理由つきで残す。
4. `--entry --write` — 入口の一覧から、順序を担わなくなった行を外す。
5. `npm run check:surface` → `node scripts/global-surface.mjs --update` で、減った読みを台帳に記録する。

**検査はソースを読まず、import して評価する。** `tests/helpers/import-module.mjs`（実体は
`scripts/lib/import-module.mjs`）の `importModule(path, { globals, mocks })` が対象ファイルを毎回新しく評価し、
その import の辺だけを差し替える（`mocks`）。ブラウザ（`window`・`document`）は `globals` で渡す。
規約の詳細は [`docs/TESTING.md`](../TESTING.md)。
