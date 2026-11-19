---
title: Atlas が Python をその場で書いて隔離実行し、結果をデータセットに戻せるようにした（compute.run）
date: 2026-11-19
newsen: Atlas can now write and run Python (with numpy, pandas and the rest of the Pyodide distribution) on your datasets in an isolated sandbox, and the results come back as new datasets you can map, chart or save.
newsjp: Atlas が、手元のデータセットに対して Python（numpy・pandas など）をその場で書き、隔離された環境で実行できるようになりました。結果は新しいデータセットとして地図・グラフ・保存に使えます。
---

〈依頼（利用者承認済みの方針転換）〉 Atlas が「その場で Python を書いて隔離実行し、結果を IntMap のデータセット/グラフに
戻す」能力 `compute.run` を 1 つ足す。能力表は閉じたまま、唯一の例外として明記する。

## 0. 測った（2026-11-19・開発機・Chromium 1255 headless・index.html と同じ CSP の頁から実モジュールを駆動）

| 何 | 実測 |
|---|---|
| 版 | npm: pyodide **314.0.7**（2026-09-14 公開）／314.0.8 は 2026-11-13（2 週間未満）→ 314.0.7 に固定 |
| ハッシュ | 核 5 ファイルの sha256 を取得したバイトから計算し、jsDelivr の data API が述べる値と**一致**（2 経路） |
| 転送量（初回・キャッシュ無し） | 核 5 ファイル **6,239,991 B**（wasm 3.44 MB・stdlib 2.51 MB・asm.mjs 0.26 MB）／numpy 2,930,300 B／pandas＋依存 3 本 4,691,776 B——pandas を使う初回で計 13.86 MB。2 回目以降は 0 B（HTTP キャッシュ） |
| 起動 | 初回 **9.9 s**（別の回で 6.8 s）／HTTP キャッシュから **3.1〜3.5 s**（1 実行 1 Worker なので毎回払う） |
| パッケージ | numpy 初回 3.5 s・キャッシュ 0.6 s／pandas 初回 4.6 s、`import pandas` の実行自体が 4.9 s |
| 回帰の往復 | 200 行の CSV → numpy.polyfit → 新データセット（200 行・x/fitted/resid）と係数の値。実行 0.85 s、全体 14.3 s（初回） |
| 10 万行の OLS | 行の読み出し→配列→lstsq が **2.7 s**、WASM ヒープ **94 MB**（素の起動直後 31.5 MB） |
| CSP | `securitypolicyviolation`（document）と Worker の console に違反 **0 件**。`'unsafe-eval'` が WASM を通す（`'wasm-unsafe-eval'` は不要と実測） |
| 扉（Python の中から） | indexedDB・caches・XHR・WebSocket・Worker・BroadcastChannel・navigator.locks・OPFS・eval・`js.Function`・`js.Object.constructor(...)`・`pyodide.code.run_js`・importScripts・文字列の setTimeout：**全部閉**。fetch：他ホスト・この origin・固定ディレクトリ下の作った path（`…/full/leak-SECRET`）は**拒否**、lock 自体は 200 |
| 失敗の形 | 例外 → `python-exception`（観測）／無限ループ（上限 3 s 指定）→ `timeout`（未観測）／投影座標の点 → `output-not-lonlat` |
| 保存→再読込 | 3 データセットを保存・`clear()`・`load()` で復元、コード全文とハッシュが戻り、編集は `edit-would-contradict-recipe` で拒否、manifest は `recipe` / `recorded` |
| 上流の再計算 | filter（v≥10）→ Python（件数・合計）を作り、filter を v≥15 に `setParams` → Python の段が**同じ id で再実行**され {n:10,sum:145} → {n:5,sum:85}、stale なし |

否定された見立て: 「CSP に Pyodide のパスを 1 つ足す」——`importScripts()` と `import()` は integrity を取れないので、
パスを足しても SRI は付かない。逆に **integrity 付きで fetch して `blob:` で実行**すれば SRI が付き、`script-src` は既に
`blob:` を持つので**何も足さずに済む**（17.3 の「新しい CDN ホストを CSP に足さない」とも合う）。こちらを採った。
もう 1 つ: 最初の実装は scrub で `Function` の代役に新しい prototype を持たせ、Pyodide の `x instanceof Function` が全部偽になって
「globals must be a real dict」で全実行が落ちた——代役は本物の prototype と名前を持つ。

## 1. 作ったもの

- **`js/compute-sandbox.js`**（`window.IntMapCompute`、gisCore の遅延チャンクに mount）。1 実行 1 Worker（前の実行が
  `numpy.mean` を差し替えていても次に持ち越さない）。順序がそのまま安全の論証: ① Pyodide の 1 バイト目より前に `fetch` と
  `importScripts` を差し替え ② ハッシュで検証しながら読み込み ③ realm（global と prototype）から origin の保存領域・ほかの
  ネットワーク・入れ子の Worker・実行時のコード生成を除去し、扉ごとに再確認、閉じなければ走らせない ④ それからコード。
  出力は FeatureCollection / Feature の列 / dict の列 / DataFrame → 新データセット、それ以外は値。NaN は null にして**数える**。
- **能力 `compute.run`**（`js/atlas-cap-compute.js`・綴り `python`——`compute` は GIS の op の名前なので避けた）。
  列: writes `gis.dataset`／risk `session`／confirm `explicit`（外の文章を読んだ後はモデルの判断だけでは走らせない）／
  observer `none`＋`meta.unobserved`（`timeout` 等は「観測できなかった」）。
- **provenance `kind:'compute'`**: `{code(全文), codeSha256, inputs, output, runtime:'pyodide@314.0.7', python, packages, nonFinite}`。
  コードの上限 64,000 字は HARD_MAX_OUTPUT（5,000 トークン）から導いたので**切り詰めは起きない**＝どの記録も再実行できる。
  - `js/gis-datasets.js`: 編集は op と同じ理由で拒否（`detail.kind`）。
  - `js/gis-project.js`: 保存は**本体＋レシピ**（読み直しで 13 MB を落として再実行しない・乱数を引くコードは同じ答えにならない）、
    `setParams` の下流にあれば `IntMapCompute.rerun` で**再実行**（op のキャッシュは通さない）、無ければ `compute-unavailable` で stale。
    manifest はコードの段を `recipe` とし、環境は runtime と python の版で `recorded`。
  - `js/gis-panel.js`: 由来の欄が「由来が記録されていません」と偽っていたので「Python で計算」を足した（en+jp）。
- **CSP は不変**。`scripts/outbound-hosts.json` の jsDelivr の「何を取るか」に Pyodide を足し、`data/connection-ledger.json` を再生成。
- **`window.IntMapLazy` の読み取りが 1 本増えた**（`js/atlas-cap-compute.js` の run が gisCore を要求する。他の能力と同じ扉）。
  `node scripts/global-surface.mjs --update` で基準を更新。

## 1b. 費用（`npm run check:perf`、この木の build・origin/main より 6 commit 遅れた状態で測った）

- 起動時（eager）: requests 10 / modules 911 で**不変**。raw は +3.6 kB だが帯の内（増えたのは能力表の 1 行と観測器の 1 分岐）。
- 遅延チャンク: **gis-core +19.5 kB raw**（`js/compute-sandbox.js` の minify 後の実体 ≈ 17.8 kB——Worker のソース・
  Python の前置き・host）、atlas-cap-runs +5.5 kB と atlas-console +5.6 kB（`compute.run` の項目と catalogue の説明文）。
  どれも Python を使う／GIS を開く／Atlas を開くセッションだけが払う。Pyodide 本体（6.2 MB）は同梱していない。
- ⚠ async の合計は天井より +92.6 kB で、上の 3 つ（30.6 kB）で説明できない残りがある。チャンクごとに天井表と
  突き合わせると残りは `esm` +56.6 kB・`cesium` +19.5 kB など、この差分が触っていないもの（この worktree の
  `node_modules` は原本への junction で、依存の版が branch の lock と一致する保証が無い）。CI が測るのは merge 後の木なので、
  天井の引き上げ（`node scripts/perf-budget.mjs --update`）は origin/main を取り込んで build し直してから、上の 3 行の分だけを
  理由として行う。

## 2. 外へ向いた面が変わったこと

- 読者のブラウザが **cdn.jsdelivr.net の `pyodide/v314.0.7/full/` 以下**を取りに行くようになった（Atlas が Python を
  実行したときだけ。送るのはリクエストそのものだけ）。プライバシーの開示語「jsDelivr CDN」は既にある。
- 能力表に「このリポジトリの外で書かれたコードを実行する行」が 1 つ増えた。境界は Worker の realm の拒否リスト
  （`docs/SECURITY-ARCHITECTURE.md` §6・§8 の 26 番）。

## 3. 検査

- `tests/compute-sandbox-checks.test.mjs`（Node・11 件）: 要求の拒否／出力の分類／payload／観測と未観測（本物の
  メッセージ規約を話す代役 Worker で。phase の再送で時間上限が延びないこと・メッセージが自分を未観測と名乗れないこと）／
  provenance と編集拒否と rerun／Worker のソース（fetch の差し替えが loadPyodide より前・scrub が ready より前・拒否リストが
  SECURITY 文書と一致）／版とハッシュ／CSP が何も足していない／gis-worker の前提／能力の行と観測器／gis-project の再実行と manifest。
- `tests/compute-sandbox.spec.js`（ブラウザ）: build 済みの実頁で `IntMapOS.execute('compute.run')` → 回帰・扉（同じ 1 回の実行の中から
  15 個）・保存→再読込・CSP 違反 0。**CDN に届かない走者では理由つきで skip**（未観測を赤にしない。`tests/r184-drone.spec.js` と同じ流儀）。
  最終 build で 3 回とも pass、本体の時間 21.5 / 12.5 / 12.6 s（走るたびに新しいプロファイル＝Pyodide を取り直す）→
  `tests/durations.json` に上限の 22 s を記入。1 秒を超えるので deep 層に入る（`scripts/tiers.mjs` の価格規則）。
  最初の版は扉の検査を別の実行にして Pyodide を 2 回起動していた——1 回に畳んだ。
- ⚠ **未解決: スイート全体の天井（#R205 の 5,250 s）を 0.3 分超える**（`npm run check:testbudget`）。天井は上げない規則なので、
  この spec の 22 s をどこかから払い戻すか、この spec を持つかの判断が要る。

## テスト時間の払い戻し

この spec（22 秒）で全体が天井を 0.3 分超えた。天井は上げず、`tests/r530.spec.js` の表値 160 秒を
測り直して 80 秒にした（IM_PREBUILT_DIST=1・IM_TIER=all・1 worker・3 回、最も遅い wall 66 秒・全回 pass）。
spec は 1 行も触っていない。

## 起動費用の天井を上げた理由

遅延チャンクだけが増えた（起動時のバイト数と要求数は不変）。`gis-core` 589.2 → 608.4 kB（+19.2）、
`atlas-console` 1045.8 → 1051.8 kB（+6.0）、`atlas-cap-runs` +5.5 kB。Python の実行・出自・再計算の配線で、
`compute.run` を使うときにだけ読み込まれる。Pyodide 本体は同梱せず遅延取得（ハッシュ検証つき）なので、
同梱サイズには入らない。天井は origin/main を取り込んだ木で `perf-budget --update` した値。
