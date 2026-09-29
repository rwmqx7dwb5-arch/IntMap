---
title: 実行時に挿入する他 origin の <script> を SRI で固定する——#R175 は CDN のタグを 7 本同梱したが、実行時に挿入する 2 本は unpkg から無検証で動いていた。規則を「ファイル」ではなく「CSP が許す全ホスト」に付け、固定できないものは理由の文つきで宣言させる
date: 2026-09-29
---

〈依頼（監査・セキュリティ中）〉本体ページが実行時に第三者 CDN からスクリプトを SRI なしで挿入している——
`js/layer-packs.js` の `pmtiles@3.0.6`、`js/wx-ecmwf.js` の `@openmeteo/weather-map-layer@0.0.19`（どちらも unpkg）。
unpkg かパッケージが侵害されると、任意の JS がアプリの origin で動き、`localStorage` の Supabase の JWT と
BYOK 鍵が読まれる。文書は「`src/vendor.js` で unpkg を 7 本やめた」と述べていたが、
**同じ判断が一部の経路にしか効いていなかった**。

## 0. 測った

- **天気 SDK は GPL-2.0。** npm tarball の `LICENSE` は GPL v2 の全文で、依存の `@openmeteo/file-reader@0.0.15` も
  `"license": "GPL-2.0-only"`。IntMap のライセンスは独自（Personal & Research Use）。R314 はこれを理由に
  「同梱してはならない」と判断していた。⇒ **同梱（npm 依存＋動的 import）はライセンスの判断が要る**ので行わず、
  **unpkg のまま SRI で固定する**ことにした（コーディネータ判断・R314 の判断を保つ）。
- **中身は 3 経路で同一。** `dist/index.js` 2,988,460 B は unpkg・jsDelivr・npm tarball のすべてでバイト単位で一致し、
  sha384 は `fdX/+ZwRKmcCzvOsr6noy9b1Nki8xYPmHjgXnjzpdUAexWmlixujwbbR6VIZpfq0`。`pmtiles@3.0.6/dist/pmtiles.js`
  48,555 B も unpkg と tarball で一致し、sha384 は `4sbA4B4Oqxkzs6apu8HaZcGrL3BySmt0tO/LQf6al3hkgq8ijZFxkTkvxxZZ/3PU`。
  unpkg も jsDelivr も `Access-Control-Allow-Origin: *` を返す（`crossorigin` 付きで SRI を検証できる条件）。
  測り方: `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`。
- **`loadPMTiles` は呼ばれていない。** `js/`・`src/`・`tests/`・`scripts/` のどこにも呼び出し元が無い。
  R13（`7374e061`）で生態域が自前の GeoJSON に替わってから、この読み込み器は実行されていない。
- **jsDelivr の予備は必ず拒否される。** `index.html` の CSP `script-src` に `https://cdn.jsdelivr.net` は無い
  （`docs/SECURITY-ARCHITECTURE.md` §6 が外した理由を書いている）。
- **SDK の実物**: ESM 版 `dist/index.mjs` は `@openmeteo/file-reader` を 1 本 import し、`js/wx-ecmwf.js` が
  `sdk.*` で使う 17 個を全部 export している。UMD 版 `dist/index.js` は `globalThis.OMWeatherMapLayer` に載せる
  （今のコードが読む形）。worker は blob URL から作られ、失敗すると data URL に落ちる（`worker-src 'self' blob:` で通る）。

## 1. 直したもの

- `js/wx-ecmwf.js` — `SDK_URLS` を `{ src, integrity }` の配列にし、`loadSDK` が `integrity` と
  `crossOrigin='anonymous'` を付ける。ハッシュが合わなければ `onerror` から次の URL へ進み、最後は拒否で終わる
  （改竄された CDN は、到達できない CDN と同じ扱いになり、実行されない）。**ハッシュは `SDK_VER` の版に属する**
  ので、版を上げるときは測り直して同じ編集で書く、と註に書いた。
- `js/layer-packs.js` — 死んでいる `loadPMTiles` にも `integrity` と `crossOrigin` を付けた（将来呼ばれても安全な形）。
- `index.html` — **触っていない**。CSP の `https://unpkg.com` は SDK が使うので残す。

## 2. 門 — 規則を「2 つのファイル」ではなく事実に付けた

`scripts/runtime-scripts.mjs`（`npm run check:static` の 12 番）。

- **網は CSP の `script-src` ホストそのもの。** ブラウザが他 origin のスクリプトを動かせるのは CSP が許すホストだけ
  なので、配信物の中でそのホストを名指す文字列は**全部が「場所」**になる。固定された `<script>` が消費していない
  文字列は、ローダの形を認識できなくてもそれだけで赤くなる（`import('https://…')` でも、まだ誰も書いていない
  ヘルパでも）。
- **`<script>` の場所は acorn で見つける。** `createElement('script')` のほか、Clarity の `createElement(r)` の
  ように `r` が IIFE の引数で `"script"` に束縛されている形も、その束縛を辿って見つける。`src` は リテラル・連結の
  左端・`new URL(x, base).href`・配列の要素・オブジェクトの `src` 欄まで解く。
- **固定できないものは理由の文つきで宣言する**（`UNPINNABLE`）: Street View の JSONP（`maps.googleapis.com`。
  応答が呼び出しごとに作られる）、gtag.js（`www.googletagmanager.com`）、Clarity（`www.clarity.ms`）。
  あとの 2 つは配信元が URL に版を持たないまま中身を変えるうえ、`INTMAP_ANALYTICS` が真のときしか読まれない（いまは偽）。
- **CSP のホストは、使われているか `CSP_ONLY` に宣言されているか。** `www.google-analytics.com` と
  `ssl.google-analytics.com` はコードに名前が無いが、gtag.js が実行時に使う可能性がある（未測定）ので、
  推測で消さずに宣言した。
- **どの宣言も両方向で照合する。** 何にも当たらなくなった宣言、配信されないファイルへの宣言、理由が文になっていない
  宣言（40 字未満）、使われているのに `CSP_ONLY` にある宣言は、すべて赤くなる。
- **母集合は発見する。** ルートのページ、`js/`・`src/` の全体（到達しないものも含めて外側に誤る）、`vite.config.js`
  の `STATIC_ASSETS`（その AST から読む）。⚠ `harness/waves.html` は unpkg から MapLibre 5 と SDK を素の `<script>`
  で読むが、ビルドが `harness/` を `dist/` にコピーしない計測用ページなので母集合の外。`STATIC_ASSETS` に入れば
  自動で母集合に入り、固定を求められる（検査 ⑫ がこの前提を測る）。
- ⚠ **ハッシュがバイトと一致するかは、この門ではなくブラウザが確かめる。** 門が証明するのは「形の正しい
  `sha256|384|512-` を持つ」ことまで。

回帰検査 `tests/vendored-runtime-scripts-checks.test.mjs`（13 件）は、実際の配信物をメモリ上で変異させて、
門が赤くなることを確かめる: SDK の `integrity` を消す／`crossOrigin` を消す／配列の片方だけ壊す／PMTiles の固定を
消す／新しいローダを 3 つの形で足す／Clarity の宣言を外す／宣言を古くする・配信外にする・短くする／
CSP に未使用ホストを足す。

## 3. 削除提案（承認制なので、今回は実施していない）

1. **`js/layer-packs.js` の `loadPMTiles`（`pmReady`・`pmLoading`・`pmQ` を含む 7 行）を消す。** R13 以来呼び出し元が
   無い。消えるのは「将来だれかが PMTiles を読むときの入口」で、失う能力は無い（生態域は自前の GeoJSON で描かれている）。
   消せば unpkg の `pmtiles` への参照が 1 本なくなる。
   ⚠ 併せて、`js/dash-extended.js:93` の註「The app registers seven protocols (`imapsat`, `pmtiles`, `om`, …)」は
   **いまも事実と違う**。`pmtiles` プロトコルを登録するのはこの呼ばれない読み込み器だけだから。
2. **`js/wx-ecmwf.js` の jsDelivr の予備を消すか、CSP に `https://cdn.jsdelivr.net` を足して生かすか。** いまは CSP が
   取得前に必ず拒否するので、「2 つ目の CDN」ではなく「2 つ目の拒否」になっている（コンソールにエラーが 1 本増える
   のは unpkg が落ちたときだけ）。どちらを選んでも、固定は付けてあるので同じ中身しか動かない。
   生かすなら §6 の「jsDelivr は fetch 先でしかない」という判断を覆すことになる。

## 4. 検査

- `node --test tests/vendored-runtime-scripts-checks.test.mjs` — 13/13 緑。
- `node scripts/runtime-scripts.mjs --report` — 配信物 376 ファイル、全部固定済みか宣言済み。
- `npm run check:static` — 緑（このマシンでは全体で約 5 分。この門の分は 1 回あたり約 4 秒で、大半は
  `data/*.js` 約 160 MB の読み込みと約 130 ファイルの構文解析）。
- `wx-ecmwf` / `layer-packs` / `unpkg` / `script-src` / `jsdelivr` を読む既存の検査 59 本 — 685/685 緑。
- **実ブラウザで固定つきの SDK が読めること**: `npx playwright test tests/smoke.spec.js -g "R276 ⑲"` — 緑。
  `EC.loadSDK()` が `integrity` と `crossOrigin` の付いたタグで unpkg から実物を読み、`getColorScale` まで動いた。
  ハッシュが違っていれば `onerror` から拒否で終わるので、この検査は落ちる。
- `npm run build` → `npm run check:perf` — 予算内。2 つの固定はどちらも起動チャンク `main-*.js` に入る
  （`js/wx-ecmwf.js` も `js/layer-packs.js` も起動時に読まれるため）。増えたのはコード約 0.4 kB（ハッシュ 3 本と
  代入。註は minify で落ちる）の見積もりで、EAGER の実測は ceiling +2.8 kB（requests 9・modules 284 は変化なし）。
  この +2.8 kB には、ceiling を書いた時点以降の main の差も含まれる（main だけのビルドとは比べていない）。
- `npm run check:assets` — 緑。
