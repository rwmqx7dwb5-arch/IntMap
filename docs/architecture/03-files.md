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
- **`src/`** — バンドラ側の入口だけ（`main.js` が `js/*.js` を index.html と同じ順で import し、
  `vendor.js` が npm 依存を同じグローバル名で再公開する）。アプリのロジックは置かない。
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
