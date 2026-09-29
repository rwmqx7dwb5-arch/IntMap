---
title: 出力の無害化の正本を 1 つのファイルへ——index.html の inline にしか無かったので、Node が評価する 9 モジュールと sources.html・admin.html が自前のエスケープを持ち続けていた。独自エスケープ 23→8・url() を通らない href/src 25→7
date: 2026-09-29
---

〈依頼〉前段（`dev-notes/2026-09-29-safe-output-one-source.md`）が残したもの——正本 `window.IntMapSafe` が
index.html の inline にしか無く module から読めないので、Node で評価される 9 ファイル（gis-atlas・
atlas-map-compose・atlas-annotate・atlas-highlight・atlas-query・layer-manifest・waves・time-borders・
routing-cards）と sources.html（sources-list）が独自エスケープを残していた——を片付ける。正本を 1 つの js
ファイルにし、ハーネスへ配り、範囲内の独自エスケープと url() を通らない href/src を正本へ寄せる。
⚠ app-body・map-ui・countries-ui・data-layers・companies-ui・feedback は別作業（a11y-shared-dialog）が
同時に触るので範囲外。

## 0. 測った

- **index.html の inline script で `IntMapSafe` を使うものは 0**（定義の 1 行だけ）。src/main.js の固定の
  3 枠（geo-engine・engine-select・newsgeo）とその依存（camera-math・geo-command-log・click-ownership）、
  src/vendor.js も 0。⇒ inline を残す理由が無いので、**inline を消して module に置き換えた**（2 つの正本を
  作らない）。本体の文字列は inline と同一（`html`/`inert`/`url` を写したのではなく移した）。
- ⚠ **`export` を持つ ES module にはしなかった。** sources.html と admin.html はバンドラを通らない静的
  ページで、描画する script が classic なので、`<script type="module">` にすると描画より後に評価されうる。
  ⇒ js/admin-literal.js と同じ形——classic な IIFE が 1 つのグローバル（`globalThis.IntMapSafe`）を置く。
  module として import しても同じグローバルが置かれる（Node でも）。
- 置き換え後、touch したファイルを名指すテスト 280 本（3,150 件）を走らせて **17 件が落ちた**。全部
  「正本の置き場所」か「ハーネスの window に IntMapSafe が無い」のどちらかだった:
  audit-sweep-0927・r801・safe-output-one-source は index.html から IIFE を切り出して評価していた／
  r155 は admin.html の `esc`/`safeUrl` を 1 行 eval していた／r291・r705・r707 は classic ファイルを自前の
  `window` で評価していた／r157・r204 はソースの綴りを固定していた／check:docs（index.html の行数・js/ の本数）。
- 起動時: `eager.modules` 284 → **285**（js/safe-html.js。main チャンクに入る・minify 後 ~1.1 kB）。
  ⚠ この worktree の土台（PR #802 の f6cc96a2）では `eager.requests` が既に 10（天井 9）——
  `proxy-fetch` が別チャンクで起動時に読まれていたもので、#802 の後続 commit（c53c6f41）が 9 に戻している。
  本変更の分ではないので天井は触っていない。raw/gzip の差も許容幅の中。

## 1. 直した

- **正本 `js/safe-html.js`**: `IntMapSafe = { html, esc, url, text }`。`text()` は前段で news-feed.js の中に
  書いた「不活性な文書（createHTMLDocument）でのテキスト化」を移したもので、`stripHTML` はそれへの委譲に。
- **読み込み方**: src/main.js が固定の 3 枠の直後で import／sources.html・admin.html は描画する script より前に
  `<script src="./js/safe-html.js">`（vite.config.js の STATIC_ASSETS がコピー）／ES module は
  `import './safe-html.js'` して `globalThis.IntMapSafe` を読む（11 本）／classic なファイルは今まで通り
  呼び出し時に `window.IntMapSafe`。index.html の inline 定義は消した（コメントだけ残す）。
- **ハーネスへ配る**: `tests/helpers/safe-html.mjs` の `installSafe(target)` が本物のファイルを `target` を
  global として評価して載せる（写し・恒等関数の代用は作らない）。r155・r291・r705・r707 が使う。
  audit-sweep・r801・safe-output-one-source は js/safe-html.js を直接評価するように。
- **独自エスケープ**を委譲へ: 上の 9 ファイル・sources-list・atlas-console・layer-packs ×3・admin.html。
  `'` を変換していなかったもの（gis-atlas・atlas-query・time-borders・routing-cards・layer-manifest・waves・
  atlas-annotate・atlas-console）は単引用符の属性にも、`"` も `'` も変換していなかった layer-packs の 1 つは
  属性そのものに、これで安全。
  挙動の差は前段と同じ（`'`→`&#39;`・`null`→空）。r204 が綴りを固定している plate layer の `String(s)` は残した。
- **url() を通らない href/src** を `IntMapSafe.url` へ: atlas-console ×6（衛星比較画像・添付画像は
  `allowData`——添付の符号器が出すのは 4 種のラスタだけ）・atlas-answer-render（窓の有無で素通りしていた
  分岐を消し、Node の検査でも guard が走る）・atlas-markdown ×2・atlas-reply・atlas-view-capture
  （`allowData`）・beta-overlays・carto-basemap（定数の URL だが builder の引数なので門には見えない——
  builder の中で通す）・volcano-intel・sources-list（175 件全部 http(s) を実測）・admin.html。
  news-events は既に `U()` で通していたが、同じファイルの別の `u` と束縛が衝突して門が見分けられなかった
  ので変数名を分けた。admin.html の `safeUrl` は同一オリジンの相対パスを従来通り通し、それ以外は正本の
  scheme 判定に委ねる（r155 が相対パスを許すことを固定している）。
- 台帳: `node scripts/safe-output.mjs --write`。`kept` の「正本」は index.html → js/safe-html.js。
- 回帰: `tests/safe-output-single-module-checks.test.mjs`——① 定義が木の中に 1 つ（inline を戻す変異で 2 つ）
  ② main.js で先に評価されるものとその依存・index.html の inline が IntMapSafe を使わない ③ 2 ページが描画
  より前に読み込み、build がコピーする ④ `globalThis.IntMapSafe` を読む module は import している（発見）
  ⑤ 10 ファイルの委譲を本物で評価・layer-manifest と atlas-markdown を端から端まで ⑥ `text()` は不活性な
  文書だけで解析し、ingest が使う ⑦ 門が戻したコピーと素の href を数える。tests/security.spec.js に
  `text()` が実ブラウザで何も実行しないことを 1 件。

## 2. 残り（台帳の `pending`・すべて範囲外のファイル）

- 独自エスケープ 8: app-body ×2・countries-ui・data-layers・map-ui ×4。
- url() を通らない href/src 7: app-body・companies-ui・countries-ui ×2・feedback・map-ui ×2。
- map-ui の「`<>&` を削除するだけ」（変換ではない）は前段と同じく未対処。
- index.html は別作業（モーダルの role 付け）も触るので、`Architecture.md` 冒頭の index.html の行数（928）は
  合流時に数え直しになる（check:docs が言う）。
