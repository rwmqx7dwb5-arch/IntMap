---
title: Atlas の画面部品と戦争レイヤーに残っていた z-index・768・safe-area を持ち主の形へ移し、台帳の「別作業が持っていた」例外を 0 にする
date: 2026-09-30
---

〈依頼〉 ui-layer-owner（`dev-notes/2026-09-30-ui-layer-owner.md`）で別作業と重なるため見送った `js/atlas-*.js` と `js/war-layer.js` の残りを、値＝描画順・境界を変えずに持ち主へ移す。

## 0. 測った（`node scripts/z-layers.mjs` / `node scripts/ui-owners.mjs`、変更前）

- 素の z-index 数値: **7**（`js/atlas-annotate.js` 1・`js/atlas-attach.js` 1・`js/atlas-file-view.js` 1・`js/atlas-gloss.js` 2・`js/atlas-styles.js` 2）。ほかに別文書の `admin.html` 3・`css/pages.css` 1。
- 768 の直書き: **6**（上の atlas 5 本に 1 つずつ、`js/war-layer.js` 1）。
- `env(safe-area-inset-*)`: **3**（`js/atlas-attach.js`・`js/atlas-gloss.js`・`js/atlas-styles.js`）。
- Atlas の dispatch が `js/atlas-cap-<ns>.js` へ移った（#835）後も、残りはすべて上の 6 ファイル（スタイル文字列と `isMobile()`）にあり、cap モジュールには 1 つも無かった。

## 1. 移したもの（解決する整数は全部同じ）

| 場所 | 前 | 後 |
|---|---|---|
| `.atl-antip`（注釈の吹き出し） | 20000 | `calc(var(--z-modal) + 10000)` |
| `.atl-lightbox`（添付の全面表示） | 2600 | `var(--z-shell-front)` |
| `.atl-fv-table th`（sticky 見出し） | 1 | `calc(var(--z-inset) + 1)` |
| `.atl-gloss` / `.atl-gloss-pill` | 100060 / 100061 | `calc(var(--z-overlay) + 70)` / `+ 71` |
| `#atlas-panel` | 1850 | `calc(var(--z-sheet) + 200)` |
| `#atlas-panel .atl-jump` | 5 | `calc(var(--z-inset) + 5)` |

- 768: 注入 CSS の `@media(max-width:768px){…}` 4 か所は `IntMapDevice.media(css)` か `'@media'+IntMapDevice.COMPACT`（組み上がる文字列は同じ）、`atlas-gloss.js` の `isMobile()` は `IntMapDevice.compact()`、`js/war-layer.js` は `window.IntMapDevice.media(…)`。
- safe-area: `env(safe-area-inset-top)` → `var(--safe-top)`、`env(safe-area-inset-bottom,0px)` → `var(--safe-bottom)`（`:root` の宣言がフォールバック 0px を持つので、対応ブラウザでは同値）。
- 台帳: `tests/z-layers-baseline.json` は 11 → **4**（残りは `admin.html` 3・`css/pages.css` 1——`css/intmap.css` を読まない別文書なので層の名前が存在しない。理由は台帳の `why` のまま）。`tests/ui-owners-baseline.json` は breakpoints・safeArea・why ともに**空**。
- `Architecture.md` の z-layers の段落から「別の作業が持っていた `js/atlas-*.js` の 5 本」を消した。

## 2. 1 つだけ形が違うところ

atlas の 5 本は ES モジュールで、スタイル文字列の一部は**モジュール評価時**に組まれ、Node のテストからも import される。そこで各ファイルが `import './ui-device.js'` で依存を宣言し（`import './safe-html.js'` と同じ作法）、持ち主を `(globalThis.IntMapDevice || window.IntMapDevice)` で読む。`js/ui-device.js` は `window` があれば `window` に、無ければ `globalThis` に載るので、ブラウザでは同じオブジェクト、Node では import の後にハーネスが `window` を偽物へ差し替えることがある（実測: `tests/atlas-annotate-checks.test.mjs` と `tests/atlas-reply-render-checks.test.mjs` が `globalThis.IntMapDevice` だけ／`window` 優先だけの読み方でそれぞれ落ちた）。`js/ui-device.js` が `js/safe-html.js` と同じく常に `globalThis` に載れば、読み方は `globalThis.IntMapDevice` 1 つにできる（今回は触っていない）。

## 3. 検査

- `node --test`: `tests/ui-layer-owner-checks.test.mjs` と、触った 6 ファイルを読む atlas / wars / shell の検査 21 本（376 件）緑。
- `npm run check:static check:surface check:types check:engine check:capabilities check:docs` 緑。
- `IM_TIER=all npx playwright test tests/r508.spec.js tests/r494.spec.js tests/r783-attach-recall.spec.js` 15 件緑（前面の印と z-index、Atlas パネルの描画、添付）。
