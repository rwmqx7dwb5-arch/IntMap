---
title: nightly の deep tier が 2026-08-08 から緑にならない——3-D 体積の地面の高さが「0 が 2 回一致したら打ち切り」で標高タイルの到着を二度と読まなかったので、読み終えを標高ソースの状態（sourcedata / isSourceLoaded / idle / error）で決める。晩を並べて「連続で赤（退行の疑い）」と「散発（揺らぎ）」を分ける読み手 scripts/deep-history.mjs を置き、status が述べる。restored-layer-before-style の 9/29 の赤は範囲の前のコミットでも同じに落ちる負荷の観測失敗で、コードの退行ではなかった
date: 2026-09-30
---

〈依頼〉nightly deep tier（ci.yml の schedule）が 53 回連続で緑なし。切り分け（run 36634094537・2026-09-29・
head b684b168）の A（`tests/restored-layer-before-style.spec.js:127` が 9/28・9/29 の 2 晩連続）、B（`tests/r170.spec.js:122`
3-D volume の `ground > 0` 待ちで時間切れ）、C（毎晩違う 1〜3 件で赤く、退行と揺らぎが区別できず誰も読まない）。

## 0. 測った

### B — 3-D 体積の地面の高さ

- **ローカルで 4 回中 4 回落ちた**（`npx playwright test tests/r170.spec.js:122`・deep tier・HEAD）。nightly では
  14 晩中 赤 1 晩・再試行 2 晩（下の C の台帳）。
- 探り（同じ手順で 1 秒ごとに `state()` と `queryTerrainElevation` を並べた）:
  `ground` は 20 秒間ずっと **0**、同じ瞬間の `queryTerrainElevation` は t=1 s から **3,666.7 m**。
  ⇒ DEM は届いていた。**読む側が読むのをやめていた。**
- 原因は `chaseGround()` の 2 つの打ち切り: 400 ms ごとに読んで、**2 回連続で一致したら「落ち着いた」**、
  または **16 回（6.4 秒）で打ち切り**。タイル到着前の 0 が 1 回目と 2 回目で一致し、0.8 秒で打ち切られた。
  0 は「まだ届いていない」と「海面」の両方で、値からは決められない（コード自身の註がそう書いていた）。
  回数で打ち切る側も同じ形——S3 の標高タイルが 6.4 秒より遅れれば二度と読まない。
  ⇒ `.agents/rules/one-pass-or-a-reason.md` §5 の「観測できなかった」を「終わった」と扱っていた。

### A — restored-layer-before-style

- **9/28 の赤**（run 36493764477・head 001f2639）は、d03a5c85 がレーダー索引の取得に付けた期限が、負荷で
  止まったページの自分の凍結を数えて「上流が答えない」と判断し、行を外した形——これは **#818（6390ff70）**
  の記録がその run で実測したもので、main には既に直しがある（期限切れは拒否ではない・行を ON のまま
  時計を倍にして読み直す）＋ 659cd6ac のフリーズ耐性時計。
- **9/29 の赤**（それらを含む b684b168）: 1 回目は `:151`「the reported layers are on the map」が 30 秒、
  再試行は `:110` が 60 秒。CI の trace（shard rest-3 の artifact）で **plain 側の `!!window.__imap` 待ちに
  36 秒**かかっていた（`renderer` の里程標は 722 ms＝`__imap` は最初から在る）。述語ではなく、ページが
  評価の順番を回せていない。
- **ローカル再現**（2 worker・各ページ CPU 2 倍減速・spec を 2 本同時＝4 ページ）で **2/2 同じ行で落ちた**。
  落ちた瞬間に別経路で読むと **lyr-planes・lyr-radar とも地図に在り、箱も両方 ON**。`getStyle()` を読む
  `page.evaluate` 1 回が **29〜79 秒**戻らない。held ページの CPU プロファイル（178 秒）: idle **0.4 秒**、
  (program) 115 秒、`getBoundingClientRect` 9.7 秒・`querySelectorAll` 4.5 秒（凡例の積み上げ——
  `js/data-layers.js`）、ほか MapLibre。trace では主スレッドの `Commit` が 25 秒中 13.8 秒（SwiftShader で
  描く GPU 側を待っている）。
- **範囲の前のコミット 00897520（MapLibre 5.24）で同じ条件を走らせると、同じく 2/2 で同じ行に落ちた**
  （`page.evaluate` 63〜66 秒）。条件なし（1 worker・減速なし）では HEAD 4/4・2 倍減速 1 worker で HEAD 3/3 通過、
  00897520 は 2 倍減速で 1 敗 1 勝。plain 起動 30 秒の主スレッド時間は 00897520 と HEAD で同程度
  （JS 17.5〜18.8 s 対 13.1〜15.5 s・Commit 13.3 s 対 13.8 s）。
  ⇒ **9/27→9/28 の境は、9/28 についてはレーダー期限（既に修正済み）、9/29 以後はコードの退行ではない。**
  この spec が CI の 4 vCPU で 2 ページを「共有リンクが運べる全レイヤー」で同時に起動するとき、ページが
  評価を回せなくなる負荷の縁にある。通過した 9/26・9/27 も 2.1〜2.5 分かかっていた（spec の存在は 9/26 から）。

### C — 晩を並べる

- 14 晩（9/16〜9/29）を読んだ結果: **連続で赤（退行の疑い）1 件**＝restored-layer-before-style（9/28 から 2 晩）、
  **続けて赤だったが最新は通過 5 件**（r439 最長 9 晩・r410-late 8 晩・r379 4 晩・r174 3 晩・r184-imagery 2 晩）、
  **散発 51 件**（うち再試行でしか落ちていないものが大半）。
- 同じテストが晩によって `:117` と `:123`（r203）、`:125` と `:132`（r159）で出ていた——位置で束ねると 1 本が
  2 本に割れて連続が切れる。**ファイル › 題名**で束ねる。
- `gh run list … --limit 14` が、数分前は 9/16〜9/29 を返した同じ呼び出しで **8/30〜9/13** を返したことがある
  （同時に応答は 2 秒〜25 秒とばらついた）。最初の版はそれを窓として信じ、キャッシュをその 2 週間に刈り込んだ。

## 1. 直したこと

- **`js/volume3d.js` `chaseGround`**: 回数と時計をやめ、描画側が述べる標高ソースの状態で読む。地形ソース
  （`scene.getTerrain().source`、`js/terrain-water.js` が差し替える）の `sourcedata` で「読み直しが要る」、
  次の `render` で読んで動いていれば塗り直す、`isSourceLoaded` の後の 1 フレームまたは `idle` で読み終え、
  次のタイルで再び読む。地形ソースの `error` は `state().groundError` に上流の失敗として残す。`groundState`
  （off / reading / read）を `state()` に出す。保存済みの立体（下書きが無いときも）も同じ読み直しを受ける
  （以前は下書きの paint だけが追跡を始めた）。タイマーは 1 つも持たなくなった（`js/runtime.js` の import を外した）。
- **`scripts/deep-history.mjs`**（新規）: 各 deep shard の job log 末尾の Playwright 要約を窓の晩数ぶん読み、
  連続（退行の疑い）／続けて赤だったが最新は通過／散発の台帳に分ける。窓は action.yml の report 保存期間から読む。
  読めなかった晩は緑と数えず連続も切らない。終わった run は `<原本>/.intmap/deep-history.json`。窓は
  「一覧とキャッシュの和の run id 上位 n」（一覧が古くても正しい）。一覧が取れないときは保存済みの晩で分類し、
  そう述べる。
- **`scripts/worktree.mjs status`**: deep tier の行の下に分類を 1 行と、連続で赤のテスト名を出す。`--brief`
  （SessionStart）は**連続で赤があるときだけ** 1 行足す。
- ci.yml は変えていない——job log に要約が既にあり、report artifact（失敗した shard で 133〜512 MB）を読む
  必要が無かった。

## 2. 否定された見立て

- 「`js/geo-engine.js` の `canDraw()`／`styleParsed()` か `js/layer-rows.js` の `holdUntilDrawable`
  （`whenCanDraw().then(deliver)`）が解決しない」——すべての探りで `canDraw()===true`・`pending()===[]` に
  なっていた（plain 0.1〜4.5 s、held 3.6〜7.6 s）。CI の `:110` の 60 秒は述語ではなくページの評価待ち。
- 「MapLibre 6（95157a51）で `getStyle()` が `undefined` を返す」——6.11.2 も 5.24 も `serialize()` は
  `if(!this._loaded) return;` で同じ。`Style._loaded` はコンストラクタでしか false にならない。落ちた瞬間の
  `getStyle()` は 193〜235 層を返していた。遅いのは呼べるまでの順番。
- 「CPU 4 倍減速で再現できる」——できるが、00897520 も同じに落ちるので、範囲を切り分ける計器にならない。
- 「9/29 の赤はレーダーが外れた」——CI の再試行の trace では両ページともレーダーのタイルを取りに行っていた
  （層は在った）。

## 3. 残っていること

- restored-layer-before-style は CI で今後も負荷しだいで落ちうる。製品側で効くのは「全レイヤーが ON の
  ページで主スレッドが空かない」ことで、測った最大の JS 側の費用は凡例の積み上げ（`js/data-layers.js`
  の凡例配置——`getBoundingClientRect` による強制レイアウトと `querySelectorAll`）。今回の作業では触って
  よいファイルの外。
- 散発の台帳の上位（r410-late・r439・r379・r174 の「続けて赤だったが最新は通過」）は、直ったかの確認が次の読み手の仕事。

## 4. 検査

- `node --test tests/nightly-deep-regressions-checks.test.mjs` 9/9（分類器 5・地面の追跡 4——`js/volume3d.js`
  を実際に組み立て、イベントと標高を駆動する）。直す前のファイルでは地面の 4 本が落ちる。
- `npx playwright test tests/restored-layer-before-style.spec.js tests/r170.spec.js --repeat-each=3`（deep tier）
  **30 passed**。`tests/r170.spec.js:122` 単独 3/3（直す前 0/4）。
- `npm run check:static` `check:engine` `check:types` `check:docs` 緑。関係する node 検査 13 ファイル 153/153。
