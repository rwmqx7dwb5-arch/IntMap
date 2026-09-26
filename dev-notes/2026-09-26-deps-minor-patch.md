---
title: dependabot の minor/patch から Cesium 1.145 と maplibre-contour 0.1.1 を入れた——Cesium が起動時に入ったのは版ではなく、束ね器の補助関数に置き場が無かったから。supabase-js 2.117 は据え置いた
date: 2026-09-26
---

〈dependabot PR #761（supabase-js 2.58.0→2.117.0・cesium 1.143.0→1.145.0・maplibre-contour 0.1.0→0.1.1）
の CI 赤を直して入れる。前日の `2026-09-25-deps-and-actions-bump` で「cesium 1.145 と supabase-js 最新は
据え置き」とした 2 件そのもの。途中で supabase-js を据え置く判断になった（§4）〉

## 0. 赤は 2 つ（残りはその結果）

- Regression 2/3: `tests/r175-checks` の「pinned versions did not drift」が `'0.1.1' !== '0.1.0'`。
- Gates 2/3: `check:perf`。eager raw **4.77 → 9.72 MB**・requests **6 → 7**・modules **306 → 1746**、
  注記に「async chunk "cesium" is gone from the build」。
- Static checks / Regression suite は上 2 つの集約ジョブが落ちただけ。
- `check:companies` の「4 curated tickers are not in the index」は**警告であって赤ではない**。
  main（原本 a8be1273）でも同じ 2 件の警告で「all twenty checks pass」。この PR とは無関係。

## 1. Cesium が起動時に入った仕組み（実測）

`.perf/build-report.json` を読むと、`main` が `cesium-*.js` から **`_`（`__vitePreload`）だけ**を
静的 import していた。`\0vite/preload-helper.js` が Cesium のチャンクに入っていたからで、原因は:

1. Cesium 1.145 は `@zip.js/zip.js` を `^2.9.0` に上げ、lock は 2.17.0 を解決した。
2. その `lib/core/zip-writer.js:368` が `await import("./zip-reader.js")` をする。Vite は動的 import を
   `__vitePreload` で包むので、Cesium 側のモジュールが preload helper に依存するようになった。
3. Rollup は **manual chunk が要求した依存を、最初に要求した manual chunk に一緒に入れる**。
   helper には置き場が指定されていなかったので、トラバース順で `cesium` に入った。
4. 動的 import を 1 つでも持つモジュールは全部 helper に依存する——`main` も。⇒ Cesium 全体が eager。

⚠ main の木で build すると helper は **`supabase` チャンク**に居た（supabase-js が動的 import を持つので
同じ仕組みで捕まっていた）。supabase は eager なので無害だっただけで、**置き場は最初から偶然だった**。
`\0commonjsHelpers.js` も同じ形（今は `maplibre-gl` に居るが、Cesium の CommonJS 依存も要求する）。

**直し方**: `vite.config.js` の `manualChunks` で、束ね器の仮想の補助モジュール（`\0` 始まりで
`node_modules/` を含まない id——`\0…/node_modules/<pkg>/…?commonjs-*` の包みはそのパッケージのもの）を
**全部 `maplibre-gl` に置く**。規則は「MapLibre の隣」ではなく「どのチャンクも依存しうる補助関数を、
遅延チャンクに捕まえさせない」。`maplibre-gl` はページと同じ寿命で必ず読まれる唯一の eager チャンク。
⚠ 否定した案: `'main'` を返すとエントリには合流せず**別の `main-*.js` が生まれ requests が 7** になった。
admin.html はアプリの JS を読まない（admin チャンクは 1 バイト）ので影響しない。

## 2. 入れた木の測定——main と同じ機械で

main（a8be1273）を `git archive` で作業用ディレクトリに出し、専用に `npm ci` して build、
`perf-budget.mjs --report` を両方で取って差をとった（この PR の最終の木＝supabase-js 2.58.0）:

| 項目 | main | この PR | 差 | 何が |
|---|---:|---:|---:|---|
| eager raw | 4,891,813 | 4,891,978 | +165 B | 補助関数が supabase → maplibre-gl へ移っただけ |
| eager requests / modules | 6 / 306 | 6 / 306 | 0 | |
| async `cesium` | 4,841,403 | 4,966,972 | **+125,569 B** | Cesium 1.143 → 1.145 |
| async raw / gzip | 11,285,568 / 3,707,587 | 11,410,985 / 3,749,457 | +125,417 / +41,870 B | 同上（async の合計） |
| dist.assets | 18,903,942 | 19,029,459 | +125,517 B | 同上 |

**天井**: `--update`（全項目を追認する）は使わず、`tests/perf-baseline.json` の**動いた 4 行だけ**
（async raw/gzip・async `cesium`・dist.assets）をこの実測値にした。eager の行は main の値のまま
（+165 B は許容幅の中）。

## 3. 版を写していた検査

`tests/r175-checks` は maplibre-contour を `'0.1.0'` の文字列で固定していた。maplibre-gl（#R158 の
カメラ API）と違い、0.1.0 に挙動を結んだ理由は記録に無く、#R175 で CDN の版を写しただけ。0.1.1 は
「MapLibre の worker へ転送されて切り離された tile buffer を、再要求で使い回していた」修正（`src/` を
比べて確認）。⇒ katex / vite と同じく「完全固定であること」を訊く形にした。

同じ写しは `src/vendor.js` の冒頭の一覧にもあった: `maplibre-contour@0.1.0` に加え、**`katex@0.16.11`
は package.json が 0.18.7 になった後も残っていた**。一覧を直し、`tests/r175-checks` に「一覧の
`name@version` は package.json の宣言と一致する（`@2` のような major だけの表記は major が一致する）」
検査を足した。一覧は検査に書かず、ヘッダから読む。直す前の木で 2 件（contour と katex）を報告して
赤くなることを確かめた。`admin.html` と `vite.config.js` のコメントにあった「supabase-js 2.58.0」は
版の写しをやめて package.json を指すだけにした（版は 2.58.0 のままで、述べている中身は変わらない）。
`docs/AVIATION-ARCHITECTURE.md` の Cesium の `alignedAxis` の式は 1.145 の `BillboardCollectionVS.glsl` でも
`acos(sign(y)*y*y/…)` のままであることを確かめて、そう書いた。

## 4. supabase-js 2.117 を据え置いた——利用者の判断事項が 2 つあるため

dependabot の PR には supabase-js 2.58.0 → 2.117.0 も入っていた。§1 を直した後でも、これだけで
次の 2 つが起きることを測った。どちらも依存の更新の中で黙って決めてよいことではないので、この PR では
`@supabase/supabase-js` を **2.58.0 に戻した**（`npm install --save-exact`。npm が再解決した
`@types/node`・`undici-types`・`ws` は main の lock の記録に戻し、lock の main との差は Cesium と
maplibre-contour の系統だけ）。

1. **起動時の読み込みが増える。** 2.117 で測った値（main 比）: eager raw **+94,729 B**・gzip **+23,417 B**・
   brotli +19,331 B。`supabase` チャンク 130,618 → 224,536 B（gzip 35,710 → 58,682）。中身（ソース寸法）は
   auth-js 166 → 407 kB、postgrest-js 51 → 111 kB、storage-js 45 → 113 kB（＋`iceberg-js` 16 kB）、
   realtime-js 76 → 99 kB（＋`@supabase/phoenix` 56 kB）。`createClient` が各クライアントを必ず組み立てる
   ので tree-shake されない。前日の記録もこの増分を「天井を上げるのは製品判断」として上げていない。
   ⚠ 削る道はありうる: アプリは `storage` と `functions` のクライアントを使っていない（`js/`・`src/`・
   `admin.html` を検索して 0 件。realtime は `js/auth-ui.js` と `js/monitors.js` の `DB.channel` で使う）。
   ただし `createClient` をやめて組み直す別の作業で、測っていない。
2. **パスキーの UI が初めて表に出る。** 判定は機能の有無で、`js/auth-ui.js:77`（`_passkeysAvailable`：
   `DB.auth.signInWithPasskey` が関数か）・`:83`（`DB.auth.passkey.list`）・`:197`（ログイン画面の
   ボタンの表示）・`:238`/`:240`（サインイン）・`:481`/`:483`（`registerPasskey` での登録）。
   2.58.0 の auth-js 2.72.0 にはこれらが 1 つも無い（`GoTrueClient.js` を数えて 0 件）ので #R155 以来ずっと
   隠れていた。2.117 の auth-js 2.117.0 の `dist/module/GoTrueClient.js` は `:237` で `this.passkey = {…}`、
   `:5579` で `signInWithPasskey`、`:5656` で登録を持つ。`docs/SECURITY-ARCHITECTURE.md` も「supabase-js
   ≥ 2.105 が要る」と書いている。上げればログイン画面とアカウントの「セキュリティ」に操作が出て、
   Supabase 側の RP ID / Origin の設定によっては押すと失敗する。

⇒ supabase-js の更新は、この 2 つを利用者が決めてから別に行う。

## 5. 検査

- `node --test tests/r175-checks.test.mjs tests/r311-checks.test.mjs`（緑）
- build → `check:perf`（within budget）・`check:assets`・`check:static`・`check:docs`（緑）
- `IM_TIER=all IM_SUITE=cesium` で `r180-cesium`・`r181-cesium`（20 件 緑。main で落ちると報告されていた
  r180 ⑤ も緑。r180 ⓪／r181 ⑦ の「既定のセッションは Cesium を 1 バイトも取らない」も緑）
- Supabase を読む spec: `r175`・`r510`・`r753-account-menu`・`r783-attach-recall`（緑）
- ⚠ `tests/r771-…-checks` の (7) は、**ローカルで `dist/` が在ると**赤になる（build-report だけを隠して
  「build 無しでは落ちる」を訊くが、`check:assets` は `dist/` を読むので通ってしまう）。`dist/` を退けると緑。
  CI の Regression シャードは build しないので出ない。この PR とは無関係の、検査の前提の穴。
