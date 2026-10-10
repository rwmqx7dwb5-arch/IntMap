# IntMap — 現状仕様書 §3 ファイル構成 (Files)

> **現状仕様書の §3。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §3.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 3. ファイル構成 (Files)

**ファイル台帳の正本は [`docs/FILES.md`](../FILES.md)**——`js/` の 1 本ずつの 1 行説明を持つのは台帳の側（節番号は向こうでも `§3.1`〜`§3.13`）。`node scripts/arch-files-check.mjs --check` が `js/` の実体と台帳を突き合わせ、どの段が
`js/` の話かは `§3.x` の見出しが名乗るディレクトリで決まる（見出しはその段の主語）。ここでは**置き場所の規約**だけを述べる。

- **リポジトリのルートがサイトそのもの**。`index.html` が頂点にあり、`css/` `js/` `src/` と静的アセット（Köppen ラスタ・国旗 webfont・`sw.js`・`data/`・`admin.html`・`science.html` /
  `sources.html` / `privacy.html` / `terms.html`）が横に並ぶ。`vite.config.js` の `STATIC_ASSETS` が束ね器を通さずそのまま配るファイルの明示リストで、`tests/layer-boot-graph-checks.test.mjs`
  が参照されているのにリストに無いアセットで落ちる。
- **`js/`** — アプリ本体。`js/app-body.js` が中核（`IM_HOST`）で、他は主題ごとのモジュール（地図の表面／データレイヤー／ニュース／Atlas と AI／分析とシミュレーション／宇宙／シェルと
  アカウント）。ファイル単位の役割は `docs/FILES.md` §3.3〜§3.10。
- **`src/`** — バンドラ側の入口だけ（`main.js` がページの入口、`vendor.js` が npm 依存を同じグローバル名で再公開する）。アプリのロジックは置かない。
- **`css/`** — 3 本（アプリ本体・静的ページ・フォント）。
- **`data/`** — 同梱データ（生成元は `scripts/build-*.mjs`。`docs/FILES.md` §3.11）。その一部は git の外にある——ルートの `data-assets.json`（追跡対象）が各データ集合のパス・中身の sha256・
  それを運ぶ GitHub Release の asset を持つ唯一の正本で、`npm run data:pull`（`scripts/data-assets.mjs`）が取得→sha256 検証→チェックアウトの外の共有ストア（既定 `%LOCALAPPDATA%intmap-data`・
  OneDrive の外）→`data/` へのリンク（ディレクトリは junction／symlink、単一ファイルはコピー）を行う。無い・目録と違うときは門が赤くなりその名前と `npm run data:pull` を言う。規約と門は
  `docs/TESTING.md`「git の外にあるデータ」、理由は `DECISIONS.md`。
- **`supabase/`** `docs/` `scripts/` `tests/` `.github/` — 運用側（`docs/FILES.md` §3.12）。
- **`index.html` を分割するときの手順**は `docs/FILES.md` §3.13 が正本（`IM_HOST` の規約と「いつ取りに行くか」という第2の軸を含む）。

### ファイル同士の結び方 — `window` ではなく import のグラフ

**依存は `import`／`export` と依存注入で明示する。**

- **持ち主は export する**（`js/chronos.js`＝`IntMapTime`・`js/geo-engine.js`＝`IntMapGeoEngine`・`js/lang-registry.js`＝`IntMapLang` ほかが `export const`）。宣言された契約（`types/`）は
  その export に JSDoc で付く。
- **`window` は後方互換とデバッグの窓口**（持ち主は同じ物を 1 行で `globalThis` にも載せる——ブラウザの spec の `page.evaluate`・コンソール・静的ページのインライン script のため）。
  モジュールがそれを `window` から読み返すことは無い（`npm run check:surface` が拒む）。
- **ファクトリは export**（殻 `js/app-body.js` は名前で import して `x(IM_HOST)` と呼ぶ。無いファクトリはリンクの誤り）。遅延モジュールは `js/lazy-modules.js` の登録が
  `load: () => import('./x.js')` と `mount: (IM_HOST, m) => m.x(IM_HOST)` を対にする。
- **使う側へ渡す（依存注入）**——静的 import が遅延チャンクを起動の束へ引き込む所では逆向きに渡す（GL の独自レイヤー——立体・大気の縁・軌道点・航空機——は各モジュールが
  `IntMapGeoEngine.provideLayerKind(name, factory)` で engine に渡す）。
- **`src/main.js` に残るのは移行の残り**（副作用——`window` への公開・DOM のリスナ・行の登録——をまだ import の辺に変えていないファイル。`node scripts/module-graph.mjs --entry` が
  1 行ずつ理由を言う）。

**移し方（葉から幹へ、機械的に）** — 道具は `scripts/module-graph.mjs`:

1. `node scripts/module-graph.mjs --plan` — `window` から読まれている名前を回数順に並べ、持ち主が export しているか、持ち主が葉か（export しても循環しない）を言う。
2. `--export NAME --write` — 持ち主の `window.NAME = …;` を `export const NAME = …;` ＋ 互換の 1 行にし、持ち主自身の読みを束縛に替える。
3. `--migrate NAME --write` — `window.NAME` を読む全ファイルに `import` を足し読みを束縛に替える（`window.` の無い暗黙のグローバルも拾う。束ねられる所——ページの module の入口から届き、
   classic の `<script>` でも Worker の中でもない——だけを書き、それ以外は理由つきで残す）。
4. `--entry --write` — 入口の一覧から順序を担わなくなった行を外す。
5. `npm run check:surface` → `node scripts/global-surface.mjs --update` で、減った読みを台帳に記録する。

**検査はソースを読まず、import して評価する**（`tests/helpers/import-module.mjs`＝実体は `scripts/lib/import-module.mjs` の `importModule(path, { globals, mocks })` が対象を毎回新しく評価し、
import の辺だけを `mocks` で差し替え、ブラウザは `globals` で渡す。規約は [`docs/TESTING.md`](../TESTING.md)）。

### イベントの結び方 — 宣言表 `js/bus.js`

**IntMap 自身が window に投げるイベントは、`js/bus.js` の `EVENTS` に 1 行ずつ宣言する**（名前・意味 `means`・payload の形 `detail`——`{ a, b }` はその鍵だけを持つ object、`null` は無し——・
発行元のファイル `from`、必要なら旧綴り `aliases`・まだ素の DOM 呼び出しを使うファイルとその理由 `pending`〔理由は同じファイルの `WHY`〕・聞かれているのに誰も投げないこと `orphan`）。

- **投げる・聞くは `bus.emit(name, detail)` / `bus.on(name, fn) → off` / `bus.once(name, fn)`**（`import * as bus from './bus.js'`）。配信は `window.dispatchEvent` のままなので、
  `window.addEventListener('intmap-…')` の既存の読み手も同じものを聞く。payload が無ければ `Event`、あれば `CustomEvent`（`detail`）。
- **綴りは `intmap-…` が正規名**（`intmap:shakemap`・`intmap:ai-limit` は別名。`emit` は正規名と全別名を 1 回ずつ投げ、`on` は全綴りを聞いて自分の `emit` が作った別名の写しを捨てる）。
- **宣言に無い名前は node と開発サーバでは例外、本番の build（`import.meta.env.PROD`）では 1 名前に 1 回の警告で通す。**
- **門は `tests/event-bus-checks.test.mjs`**（`js/`・`src/`・ページのインライン script を acorn で読んでイベントの場所を発見し——`addEventListener` / `removeEventListener` / `new Event` /
  `new CustomEvent` の第 1 引数、bus の呼び出し、runtime の scope の `.on(target, name)`。名前は文字列・穴の無い template・それを束ねた const・import した const まで解決する——表と両向きに
  突き合わせる。bus 自体は評価して配信・解除・once・別名を測る）。接頭辞 `intmap` の無い名前を `new Event` で投げるイベントは見えない（接頭辞がこの門の見える名前空間）。
