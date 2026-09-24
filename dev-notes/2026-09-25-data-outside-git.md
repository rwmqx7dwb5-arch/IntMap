---
title: 数百 MB のデータを git の外へ出した——目録が正本で、無いものは赤く名指される
date: 2026-09-25
---

〈利用者が「データを git から出す（履歴は書き換えない）」を承認。外部アカウントは作らず GitHub の中で完結させる〉

### 0. 実測（着手時）

| 何 | 実測 |
|---|---|
| `data/border-detail/` | 追跡 **5,621 ファイル**・blob（LF）で **415,019,194 B**。この Windows の作業ツリーでは CRLF で 415,024,815 B（1 ファイル 1 バイトずつ多い） |
| `data/hist-eras.js` | blob 10,644,502 B。作業ツリーは CRLF で別の sha256（`f9aaba48…` ≠ blob の `17e521f6…`） |
| 写しの食い違い | `ci.yml`・`package.json`・`scripts/test-parallel.mjs`・`docs/TESTING.md`・verifier 役（3 か所）が「**5,622** ファイル・409 MB」と書き写していた。実数は 5,621 |
| 並行 worktree | このマシンに同時に 19 本。どれも 420 MB を丸ごと展開していた |
| `check:assets` | `dist/` にある物だけを裁く。**データ集合の無いビルドは 5,000 件少ない物を裁いて緑**になる形だった |

### 1. 形

- **`data-assets.json`（追跡）が正本。** 集合ごとにパス・中身の sha256（定義は `scripts/data-assets.mjs` 冒頭）・件数・バイト数・
  Release の tag / asset / asset の sha256。tag は `data-<集合>-<sha12>` なので、**どのコミットも自分のバイトを中身で名指す**。
- **`npm run data:pull`**: Release から取得 → asset の sha256 と中身の sha256 を両方照合 → チェックアウトの外の共有ストア
  （`%LOCALAPPDATA%\intmap-data\<集合>\<sha>`、読み取り専用）→ `data/` へ **junction／symlink**（ディレクトリ）か**コピー**（単一ファイル）。
  同じ sha は取り直さない。置けない集合は名前と理由を出して exit 1。目録と違う実体は上書きを拒む（`--force` で置換）。
  ストアを OneDrive の中に置こうとすると拒む。
- **`npm run data:publish <集合>`**: 決定的に固め（自前の ustar＋gzip・mtime 0・整列。bsdtar と GNU tar の差を持ち込まない）、
  `gh release create`、**公開 URL から読み戻して一致を確かめてから**目録を書き換える。`--from-git <rev>` は git の blob を
  そのまま（autocrlf を無視し、各 blob id を再計算して ls-tree と照合）出荷する——今回の 2 集合はこれで出した。

### 2. 作った Release（公開リポジトリで既に公開されていた同じデータ）

| tag | asset | asset のバイト | asset の sha256 | 中身の sha256 |
|---|---|---|---|---|
| `data-border-detail-60aeb464b81e` | `border-detail-60aeb464b81e.tar.gz` | 91,221,106 | `1b917d11…832e62e` | `60aeb464…bab63ffc`（5,621 files・415,019,194 B） |
| `data-hist-eras-17e521f62f7a` | `hist-eras-17e521f62f7a.tar.gz` | 3,459,615 | `70f28c48…d35b65e` | `17e521f6…ed06395a`（10,644,502 B） |

⚠ 実測: 最初の Release は `--latest=false` でも「Latest」になった（他に選ぶものが無い）。2 本とも **pre-release** にして
`releases/latest` を 404 に戻し、`publish` も `--prerelease` で作るようにした。asset の URL は同じく 200。
dry-run と本番の 2 回、border-detail の asset の sha256 は同一だった（決定的であることの実測）。
空のストアからの `data:pull` は 63 秒（~95 MB の取得＋展開＋検証）、2 回目以降は検証だけで約 3〜9 秒。

### 3. 門を赤くした場所（「データが無いのに緑」を作らない）

- `npm test` の checks 半分の**最初の段**が `data-assets.mjs verify`。`npm run test:checks` はデータが無ければ全ファイルが通っても赤。
- `check:borderdetail`・`check:histeras`（`--check-upstream` も）・`tests/helpers/hist-eras.mjs`・`check:docs` の hist-eras の読み手は
  ENOENT ではなく**集合の名前と `npm run data:pull`** を言う。`build-border-detail.mjs` はリンク越しの再生成を自分で拒む。
- `check:assets` は目録の各集合が **`dist/` に目録どおりのバイトで**在ることを要求（無い・違う・**リンクのまま**は赤）。
  `vite.config.js` の静的コピーに `dereference`。`asset-report` の walk はリンクしたディレクトリも辿る。
- ⚠ **`check:data` という宣言された門は足さなかった。** 足すと `.agents/rules/execution-strategy.md` の門の表に 1 行要り、
  あのファイルは 6144 バイトの天井まで **8 バイト**（#R808 の実測）。代わりに `npm test` の最初の段と各門の中に置いた。

### 4. CI・ローカル・原本・USB

- `.github/actions/data-assets`（`actions/cache` の key＝`data-assets.json` の hash ＋ `pull`）を gates・checks・upstream・
  browser-tier（browser／deep）・deploy の build で**ビルドと検査の前に**使う。formats（GDAL の読み戻し）・timings・deep-alarm・
  post-smoke はデータを読まないので付けていない（確認済み）。`rollback.yml` は**対象コミットの**目録とスクリプトで取り、
  目録の無い古いコミットでは取らない。`doc-facts` の `ci-gates` 規則は `uses:` されたローカル composite action の段も数える。
- `scripts/worktree.mjs`（R815 が書き換え中なので**最小差分**）: `placeData(dir, verb)` 1 関数を足し、`new` で `pull`、
  `done` で削除の前に `unlink`（再帰削除が junction 越しにストアへ届かないように）。
- `scripts/master-sync.mjs --sync`: 早送りのあと原本に `data:pull`。置けなければ成功を報告しない。
  ⚠ 早送りそのものが原本の `data/border-detail/*` を消す（追跡を外したコミット）ので、この段が無いと原本からデータが消える。
- **USB**: `docs/AGENT-SETUP.md` §10 の不変条件は「追跡ファイルの完全ミラー」だったので、そのままだと**次のミラーで USB から
  415 MB が「リポジトリに無いもの」として消える**。`backup-usb.ps1` は `data-assets.mjs list`（検証つき）の一覧を追跡ファイルに
  足してミラーし、原本にデータが無い・違うなら**ミラーせず** `RESULT failed data-assets-not-placed`。

### 5. 検査

`tests/data-outside-git-checks.test.mjs`（13 件・ネットワーク不要）——①未追跡かつ ignore／2 つのチェックアウトが
1 つのストアへのリンクを持つ／`unlink` はストアに届かない／ストアは OneDrive を拒む ②改変されたコピーを名指し、上書きを拒み
`--force` で戻す／リンクの先のストアの改変を検出（書き込みは EPERM）／固め方が決定的で中身の sha256 に展開される／
目録の tag と asset 名が中身の sha を持つ ③データの無いチェックアウトで実際の門スクリプト（border-detail・hist-eras・verify・
test-checks・helper）が赤で `npm run data:pull` と言う／`dist/` に無い・リンクなら `check:assets` が赤／データを読む全ジョブが
先に取得する（ジョブ名ではなく**走らせるもの**で発見）／rollback の順序／**合成リポジトリで、追跡を外すコミットを `master-sync --sync`
が越えて原本にリンクを置く**／USB 側の `list` が失敗時に 1 行も出さない。

### 6. 残り

- `npm run dev`（Vite 開発サーバ）がリンク先を配るかは確かめられなかった（試した 3 回とも `createServer` 後に応答が返らず、
  リンクの有無と切り分けられていない）。プレビューと試験は `dist/` を配る `serve.mjs` で、そちらは実体。
- 次に出す候補（同じ手順）: `data/hist-borders.js`・`data/hist-admin1.js`・`data/hist-admin2.js`・`data/cshapes.js`。
  目録に 1 行足し → `node scripts/data-assets.mjs publish <集合> --from-git HEAD` → `git rm --cached` と `.gitignore` →
  その集合を読む門に `requireData` を足す。⚠ `data/border-coast.js` は `data/` の束を**発見**するので、ファイル集合はコピーで置く。
