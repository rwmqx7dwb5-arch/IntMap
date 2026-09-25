---
title: 依存と Actions を上げた。据え置いた MapLibre に critical の XSS があったので、到達経路を地図の生成口で閉じた
date: 2026-09-25
---

〈利用者「全てやって」——滞っていた dependabot の 2 本（npm 33 件・Actions 11 件）を処理する。途中で
`npm audit` が maplibre-gl の critical を出し、利用者は対処を「任せる」とした〉

## 0. 測った

- dependabot の npm PR は CI が広く赤かった。原因は 3 つ: `pbf` と `js-yaml` のメジャー更新で default export が
  無くなった（`scripts/build-glyphs.mjs:44` の `import Pbf from 'pbf'` ほか）、`maplibre-gl` の更新で
  `dist/maplibre-gl-dev.js` が無い（#R158 以来の完全固定を `tests/r175-checks.test.mjs` が守っている）。
- ⚠⚠ **`js-yaml` 5 は YAML 検証を黙って無効にしていた**——`scripts/static-checks.mjs` の
  `(await import('js-yaml')).default` が undefined になり、「未インストール」とみなして警告だけで通していた。
  named の `load` に直した。同じ形で `js/cesium-vector-tiles.js` は `pbf.default||pbf` のままだと
  **モジュールそのものを new して全タイルが黙って error** になっていた（`PbfReader` と `VectorTile` に直した）。
- ⚠⚠⚠ `npm audit`: **maplibre-gl ≤6.4.0 に critical の XSS**（GHSA-jrc7-96c5-q579。`DOM.sanitize()` が
  生きた NamedNodeMap を走査しながら属性を消すので 1 つおきに残る——`onerror` も）。書き込み先は
  AttributionControl の `innerHTML = DOM.sanitize(attribHTML)` だけで、attribHTML は各 source の
  `attribution`（遠隔の TileJSON／スタイル JSON の文字列を含む）。修正は 6.4.1 以降にしか無い。
  実測: 主地図・`js/carto-basemap.js`・飛行シムは `attributionControl:false` だったが、
  **`js/compare.js` と `js/playground.js` は `{compact:true}` で脆弱な経路が生きていた**。

## 1. 閉じた——版は上げず、到達経路を地図の生成口で

`new maplibregl.Map` を `js/geo-engine.js` の `_newMap` ただ 1 か所にし（`createView`・`createSubView` は
どちらもここを通る）、呼び手が何を渡しても `attributionControl:false` にする。呼び手 2 つを直すだけにしなかった
のは、**次に同じ経路を通る新しい地図にも効くように**（`.agents/rules/no-ad-hoc-hardcoding.md` §3）。
帰属表示はライセンスの条件なので消さない: 帰属表示を求める呼び手（`credit:true`・`attributionControl` の真値・
`customAttribution` は同じ意思として読む）には IntMap 側の `div.map-credit-view` を付け、いま描かれている
レイヤーと地形が読む source の `attribution` を**テキストノードと http(s) の `<a>` だけ**で組み立てる
——マークアップを一度も解釈しないので、sanitizer の良し悪しに依存しない。基図を替えれば表示も替わる。
6 系への移行は破壊的変更で、#R513 の A/B は not for merge のまま——**別の作業として残す**（`DECISIONS.md`・
`docs/SECURITY-ARCHITECTURE.md` §8 の 12）。

## 2. 上げたもの・据え置いたもの

- 上げた（npm）: @playwright/test 1.63・acorn 8.18・js-yaml 5.4.2（high の勧告 GHSA-2883-xcg3-v3hh も解消）・
  opencc-js 1.4.2・pdfjs-dist 6.3.289（`PDFDocumentProxy#destroy` が無くなったので loading task を
  `finally` で destroy: `scripts/elections/jp.mjs`）・@mapbox/vector-tile 3・katex 0.18.7・pbf 5.1.2・proj4 2.22。
- 上げた（Actions）: 8 ワークフローを dependabot と同じ SHA に（checkout v7.0.1・setup-node v7.0.0・
  upload-artifact v7.0.1・download-artifact v8.0.1・upload-pages-artifact v5.0.0・deploy-pages v5.0.1・
  cache/save v6.1.0・github-script v9.0.0・codeql v4.38.0・supabase/setup-cli v3.0.0）。deploy/rollback の
  入出力（`page_url`・artifact 名・権限）は変わらないことを読んで確かめた。⚠ download-artifact v5 以降は
  1 件だけ一致すると `path/<name>/` ではなく `path/` 直下に展開する（リリースノートに無い変更）——ci.yml は
  `find` で再帰的に探すので影響しない。
- **据え置いた**（どれもセキュリティ修正ではない）:
  - maplibre-gl 5.24.0 / maplibre-contour 0.1.0 — 意図的な完全固定（上の §1）。
  - vite 8 — 実際にビルドすると Rolldown のチャンク分けで Cesium 本体 4.9 MB が起動時に入り、起動時の読み込みが
    4.7 MB → 9.8 MB、モジュール数 298 → 1730。チャンク設計の作り直しが要る。
  - cesium 1.145 — 新しい zip.js の動的 import で Vite の preload helper が Cesium のチャンクに入り、main が
    それを静的 import して Cesium が起動時に読まれる。
  - @turf/* 7 と @supabase/supabase-js 最新 — 起動時の読み込みが増え（supabase +94 kB・turf +21 kB）
    `check:perf` の天井を越える。天井を上げるのは製品判断なので上げていない。
- ⚠ `.github/actions/browser-tier/action.yml` と、main 側で後から足された rollback の `actions/cache` は
  古い版のまま——dependabot は composite action を見ていない（`directory: /`）。

## 3. この回で踏んだもの

- ⚠⚠ **`npm install --package-lock-only` は junction 越しに原本の `node_modules/.package-lock.json` を書き換えた**
  （パッケージそのものは触らない）。原本で `npm ci` をやり直して元に戻した。依存を入れ替えて検証するときは、
  junction を `lstat` で確かめて外し、その worktree 専用に `npm ci` する（`docs/AGENT-SETUP.md` §5.1 と同じ理由）。

## 3b. 起動時の天井を上げた（理由つき）

`check:perf` の eager が天井を越えた: raw 4,853,021 → **4,873,325 B**（+20.3 kB）・gzip 1,624,241 → **1,632,906 B**（+8.7 kB）・brotli 1,235,813 → **1,242,302 B**。モジュール数は 302 のまま。上げた依存はどれも起動時のチャンクに入っていない（eager の node_modules 内訳を build-report から集計して確認）。増分のうちこの回のものは `js/geo-engine.js` の帰属表示の描画（§1。約 6 kB raw・コメント込み）で、残りはこの回の基点以後に main へ入った変更の分——**内訳を main 単独で測ってはいない**。帰属表示はライセンスの条件で、XSS の経路を閉じる代わりに要るものなので、`--update`（全項目を追認する）は使わず eager の 3 項目だけを実測値にした。

## 4. 検査

`tests/maplibre-attribution-xss-checks.test.mjs`（5 件）: ① 本物の geo-engine を、渡された値を記録する偽の
MapLibre で評価し、8 通りの頼み方のどれでも `attributionControl:false` が届く／構文木で `new …Map(` が
`_newMap` の 1 か所だけ ② compare / playground が帰属表示を持ち、基図の切り替えに追従し、`destroy` で消える
③ `<img src=x onerror=…>`・`javascript:`・`data:`・svg・script・iframe など 11 通りを渡しても、作られるのは
帰属表示の DIV と本物の https リンクだけで innerHTML への書き込みは 0 回。⚠ 3 通りの変異（強制を外す・
innerHTML に戻す・http(s) 制限を外す）でそれぞれ赤になることを確かめた。
既存: CI で赤かった 10 ファイル＋関連 8 ファイル、`check:static`・`check:engine`・`check:types`・`check:i18n`・
`check:surface`・`check:docs`・build・`check:perf`・`check:assets`・`build-glyphs --check`（差分ゼロ）。
