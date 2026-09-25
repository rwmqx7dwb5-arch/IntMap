---
title: レイヤーの一覧を DOM から宣言的な manifest へ移した（所有権リファクタの段 4 後半の土台）
date: 2026-09-25
---

〈#R798 §4 の続き。「行を作るために本体を eager に読む必要がある」「状態復元が 220 ms × 25 回のポーリング」〉

### 0. 実測（着手前・移行前のビルドを起動して数えた）

| 何 | 実測 |
|---|---|
| `#layer-dropdown` のチェックボックス | **174**（全部が行の先頭の箱で、id を持つ）。index.html の markup が **10**、残り **164** は 20 ファイルの `buildUI()` が 900 ms 以降に足す |
| 棚 | `js/data-layers.js` の `GROUPS` リテラル（253 行）が **18 の棚に 150 行**（名指し 56・畳み 94。文書は 140 / 84 のまま古かった）。短い名前 → 行は **id 接頭辞の表 6 種**（`eco-dl-` `l9-dl-` `beta-dl-` `wp-dl-` `fac-dl-` `ox-`）＋ `lyrrow-` ＋ `data-layer` |
| 一覧を DOM で数えていた読み手 | タイル盤 `rowsFromDropdown()`・共有リンク `activeLayers()`（接頭辞 9 種の selector）と復元の閉じる側・お気に入り `allLayerCbs()`・セッション復元（220 ms × 25 回）・棚の並べ替え（`rowFor` の表）・Atlas `layerCatalog()` ほか Atlas 4 か所 |
| 既定 ON | index.html の `checked` と `window.IntMapDefaultOn` の **2 か所で 1 つの編集**（#R476） |
| `OTHERS_IDS` の `ec-sst` | どの行にも解決しない**死んだ名前**（移行で落とした） |
| 名前 | 174 行中 **38 行**だけが `data-i18n` で名乗る。残り 136 行はモジュールが名前を組み立てる |
| 遅延モジュール | 行を 1 本ずつ**新しいページで** ON にして `IntMapLazy.need` を観測: **17 行 → 9 モジュール**（satellitesLive・waves・radiationLayer・warLayer×6 行・dataCenters・netHealthLive×2・aviationLive・railways・volcanoLayers×3）。⚠ 最初に 1 ページで順に測ったら、前の行の非同期 `need` が次の行に混ざり（dl-ships → railways、dl-dem → radiationLayer）、1 回しか `need` しないモジュールが後続の行から見えなかった（ww1 以降）——新しいページに変えて消えた |

### 1. `js/layer-manifest.js`（純データ）と `js/layer-rows.js`（DOM 側）

- **manifest** — `SHELVES = [{ key, layers:[{ id, key?, label?, rest?, on?, share?, html?, lazy? }] }]`。棚は
  `base`・18 の `lyrGrp*`（空の 2 棚もキーを保つ）・`lyrGrpOthers`（ベータ）・`hidden`。**手で写していない**:
  `scripts/layer-manifest-extract.mjs` が移行前のビルドから読み（`--rev b85cb6ee`）、`GROUPS` の各棚の註（#R15〜#R585 の
  移動の理由）と index.html の行の註（#R186・#R289/#R476）を**原文のまま**運んだ。
  view: `layerGroups()`（旧 `GROUPS` の形）・`betaKeys()`・`layerFor()`・`basicRows()`・`basicLayers()`・`hiddenRows()`・
  `defaultLayers()`・`defaultOn()`・`sharedIds()`・`htmlRows()`・`rowHTML()`・`catalog()`（Atlas の入口）。
- **行の生成** — 基本表示の 10 行（`cb-*`・`cb-countries` を含む）は index.html から消え、`js/layer-rows.js` が
  manifest から書く（markup は旧 index.html と**同じバイト列**）。`src/main.js` が `js/i18n.js` の直後、レジストリを
  読む最初のモジュール `js/data-layers.js` より前に import する。⇒ 既定の tick と `IntMapDefaultOn` は**同じ欄 `on`**。
- ⚠ **残り 164 行の生成は移していない。** 行のハンドラ・凡例・スライダー・名前の組み立ては各モジュールの `buildUI()`
  が持ち、しかも多くの `buildUI()` は「その id の行が既に在れば何もせず戻る」形なので、manifest が先に行を作ると
  ハンドラが付かなくなる。20 ファイルの `buildUI()` を「manifest の行を採用して配線する」形に変えるのが次の段で、
  この回の触ってよい範囲（data-layers.js は最小差分）を超える。

### 2. 読み手の移行

| 読み手 | 前 | 後 |
|---|---|---|
| `reorganizeLayerPanel` | `GROUPS` リテラル・`OTHERS_IDS`・接頭辞の表 | `GROUPS=layerGroups()`・`OTHERS_IDS=betaKeys()`（ベータの全行を明示の順で）・`rowFor` は manifest の id |
| `js/data-layers.js` 先頭の 5 一覧 | 手書きリテラル | manifest から導出 |
| タイル盤 `rowsFromDropdown()` | 登録簿を子から歩く | manifest の順・棚・`rest` でループ。行からは箱と名前だけ読む。manifest に無い行はベータ（掃き出しと同じ） |
| 共有リンク `activeLayers()`・復元の閉じる側 | 接頭辞 9 種の selector | `sharedIds()`（**同じ 87 行**——`checks` ① が旧 selector と照合） |
| お気に入り `allLayerCbs()` | 登録簿の全箱 | manifest の箱＋宣言されていない箱 |
| セッション復元 | 220 ms × 25 回 | `whenBoxes`（下） |

**残した読み手**（状態を読むもの）: セッションの snapshot（ON の箱）・不具合報告・飛行シムの退避・`data-layers.js` の
自己修復監査（7010 / 7035 行付近）・`scripts/layer-sweep.mjs`（計器）。**Atlas 側**（`atlas-console.js` の
`layerCatalog()`・`atlas-controls.js`・`atlas-answer-view.js`・`atlas-state.js`・`atlas-examples.js`）は別の実装役が
作り替え中なので触っていない——入口は `catalog()`。

### 3. ポーリングを消した

`whenBoxes(ids, fn)`: manifest が宣言せず文書にも無い id は**即座に落とす**（旧: 25 回問い合わせてから落とす）、
宣言された id は**行が挿入された瞬間**に適用する（`#layer-dropdown` の `MutationObserver`、最後の id で disconnect）。
時計は何も決めない。⚠ 旧実装は 5.5 s を過ぎて出来た行を**黙って復元しなかった**——今はそれも復元される
（`__imRestored` の印は残るので、`js/layer-home.js` の「復元はカメラを動かさない」はそのまま）。
共有リンクの `[700,1800,3200]` の再適用は変えていない（既定 ON の dispatch を待ってから閉じる、という別の理由の時刻）。

### 4. 検査

- `tests/layer-manifest-checks.test.mjs`（Node・評価）: ① DOM の無い所で一覧・棚・畳み（末尾に連続）・既定・共有・
  遅延が分かる／5 一覧が manifest から公開される／接頭辞の表と 220 ms の poll が無い／`share` が旧 selector と一致
  ② 生成行の形と `on`⇔`checked`、名前が en・jp で解決、index.html にもう無い、`layer-rows` が `data-layers` より前
  ③ manifest の遅延モジュール名が全部 `LAZY_REGISTRY` に在り、`IntMapLazy.need('<名>')` の呼び出し元が Atlas の外に在る
  ④ `whenBoxes` を偽の登録簿で駆動（宣言外は待たない・挿入で 1 回だけ適用・disconnect）。
- `tests/layer-manifest.spec.js`（ブラウザ・4 本・本体 18〜19 s を 3 回＝`durations.json` に 20）: ① 起動した文書の箱の
  集合＝manifest（双方向）② `reorganizeLayerPanel` 後の順・棚・畳みが manifest と一致（**旧 `rowsFromDropdown` の歩き方を
  spec に写して**比べた）、タイル盤のタイルが manifest の順 ③ 生成行の markup が `rowHTML` と一致 ④ 遅く出来る 2 行
  （`dl-webcams`・`wp-dl-currents`）が復元され `__imRestored` を持つ ⑤ 遅延モジュールごとに 1 行を ON にすると
  そのモジュールが読まれる。
- ⚠ **逆方向（「行を ON にして読まれる遅延モジュールは全部 manifest が名指ししている」）は門にしていない。**
  `LAZY_REGISTRY` はレイヤーの本体とパネル・シミュレータを区別しないので Node からは言えず、実行時に言うには
  174 回の新規起動が要る（抽出で 1 回やった）。
- 綴りを固定していた 18 本（r186・r187・r188・r211・r225・r235・r254・r255・r261・r289・r309・r355・r409・r439・r469・
  r476・r565・r585）と `tests/helpers/layer-groups.mjs` を、同じ事実を manifest に訊く形へ付け替えた（検査を消していない）。

### 5. 起動費用

`check:perf`: eager **+2 modules**（manifest・rows）、raw は自分の分 **+8.6 kB**（esbuild で各ファイルの前後を測った:
manifest +10.1 kB・rows +1.1 kB・data-layers −2.3 kB・map-ui −0.3 kB・session-tabs −0.3 kB・favs +0.2 kB）。
`tests/perf-baseline.json` は `--update` を使わず `eager.raw`（+8,610 B）と `eager.modules`（298→300）の 2 行だけ動かした。
⚠ 測定値はこの天井をなお +15.3 kB 上回っている（許容幅 0.5% の内）——それはこの回の差分ではなく main に既に在る分で、
`async` の新チャンク `atlas-geo-resolve` も同じく baseline に無い。追認していない。

### 6. 気づいたこと（直していない）

- 共有リンクは **World Bank の 63 行（`bx-*`）・施設 12 行（`fac-dl-*`）・`ox-*` 2 行**を運ばない（旧 selector の接頭辞に
  無かったため）。manifest の `share` が 1 行 1 欄になったので直すのは 1 文字ずつだが、挙動の変更なので確認待ち。
- `dl-nightside` は起動時に ON だが `IntMapDefaultOn` に無い（行を作るモジュールが自分で tick する）。
