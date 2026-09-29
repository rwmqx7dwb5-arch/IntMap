---
title: 地図にテキスト代替とキーボードでの地物選択を足し、重なり順を名前のついた層にし、名前の無い操作要素と一文字ショートカットを構造で直す——z-index 86 宣言・54 値は描画順を 1 つも動かさずに 12 層へ、名前の無い操作要素は 69 → 55
date: 2026-09-29
---

〈依頼（監査・アクセシビリティの構造）〉地図のテキスト代替が 0、z-index に共通の変数が 0、名前の無い
アイコンボタン、一文字のショートカットを切る手段が無い（WCAG 2.1.4）、reduced-motion／forced-colors が
コンポーネントごとの追いかけ——を、事例ではなく構造で直す。

## 0. 測った（着手時・静的）

- **地図のテキスト代替が 0。** `#map` に role も名前も無い。視覚的に隠した文字の class は 0 件。aria-live は
  10 件あるが地図の状態を述べるものは 0。地物をキーボードで選ぶ手段は 0（ポップアップは全部ポインタの押下から）。
- **重なり順**: `css/intmap.css` の z-index は **86 宣言・54 種類の値**（0〜200001。監査の「98 宣言・56 種類」は
  コメント内の出現を含む数）。共通の変数は 0。偶然の同値がある——1500 が `.btn-toggle-sidebar` と
  `.search-result-card`。`css/`・`js/`・ルートの `*.html` の数値リテラルの z-index は、コメントを除いて **229**
  （うち `css/intmap.css` 85）。
- **名前の無い操作要素**: 下の計器で **69**（24 ファイル）。監査が手で確認した photo-geo の −/+、news-ui の ★、
  space の ▶、map-tools の ＋/－、playground の × 2 つ、ai-core の select 2 つ、analysis-world-events の年の
  input 2 つ、app-body の切り抜きの range、admin.html の出来事の checkbox を全部拾う。
- 一文字のショートカット（`js/keyboard-shortcuts.js`）に無効化の手段が無い。
- prefers-reduced-motion は 8 ブロック、forced-colors は 4 ブロックで、どちらも 1 コンポーネントずつ。

## 1. 地図を文章で出す 1 つの面——`js/map-narrator.js`

- 視覚的に隠した `#map-narration`（`role="status"`・`aria-live="polite"`・`aria-atomic`・新しい `.im-sr-only`）に
  1 段落。**変化が落ち着いてから 1 回**（1.2 秒のデバウンス。パンは 40 回ではなく 1 回の読み上げ）、
  文が変わったときだけ書く。`#map` は `role="region"`・言語に合う `aria-label`（地図）・
  `aria-describedby`・`aria-keyshortcuts`。
- **各節はそれを持つ読み手から読む。新しい判断・新しい通信を足していない。**
  - 表示中のレイヤー: Active layers の帯（`_refreshActiveLayers` が書くチップの名前）。変化は
    `MutationObserver` で受ける。
  - 表示範囲の件数: `window.IntMapLayers.featuresIn(id, null)`（アプリの「この範囲にある地物」の唯一の述語）。
    ⚠ 最初は各登録の `summary()` を読もうとしたが、登録簿はそれを公開していない（`declarationOf` は `holds`
    を返す）。登録簿を書き換えずに済む公開の扉が `featuresIn` だった。
  - 場所: 今日なら `HOST.countryGeo` を `window._imPipGeo`（bbox キャッシュ付きの共有述語）で引き、名前は
    `HOST.cName`。⚠ **時計が過去の年を指す間は現代の国を使わない**——`js/countries-ui.js` がクリックで守る規則と
    同じで、`IntMapTimeBorders.currentFC()`（その年の記録）が `_i18n[lang]` で名づける。答えの無い節は書かない
    （`.agents/rules/historical-verification.md` §2-3）。
  - 日付: `window.IntMapTime`（紀元前は「紀元前 44 年」「44 BCE」）。
- **地物のキーボード巡回。** 地図にフォーカスがあるとき Alt+N／Alt+Shift+N。画面中央の 70 % 四方を 9×9 の
  点で `queryRenderedFeatures` し、地物ごとに中心に最も近い画素を残して近い順に並べ（点の地物は自分の位置を
  project して押す）、**レンダラ自身の click 経路で押す**——新しい facade `GE().events.pressAt(point)`。
  MapLibre アダプタは `new maplibregl.MapMouseEvent('click', …)` を `fire` し、Cesium アダプタは LEFT_CLICK と
  同じ `dispatch('click', …)` を呼ぶ。だから所有権（`clickLayers`・`claimClick`／`clickClaimed`）・ポップアップ・
  カードの判定はポインタのクリックとまったく同じで、**新しい popup は作っていない**。
  巡る層は `clickLayers({ownersOnly:true})`——`ownership:'fallback'`（歴史面の無名地形の説明）は地物ではない
  ので巡回に入らない（[[intmap-click-listeners-are-not-owners]] の区別をそのまま使う）。
  ⚠ Alt+N を選んだ理由: 一文字のショートカットは修飾キーで return する、MapLibre のキーボード処理は矢印と
  ±、調べた範囲でブラウザ既定の割り当てにも無い（Firefox のメニューの accelerator は F／E／V／S／B／T／H）。`e.code` で読むので macOS の Option+N（dead key）でも動く。
  ⚠ **巡回に入らないもの**: 地図全体の `events.on('click')` で自前の当たり判定をする物（航空機・衛星・
  地震計の選択など）。登録簿に無いので点を知らない。
- エンジン名はアダプタ層（`js/geo-engine.js`・`js/cesium-engine.js`）にしか書いていない（`check:engine` 緑。
  MapLibre の API ヒストグラムに `MapMouseEvent:1` が増えた）。型は `types/geo-engine.d.ts` の
  `GeoEngineAdapterCore` と `GeoEngineEvents` に `pressAt`。

## 2. 重なり順を名前のついた層へ

- `:root` に 12 層: inset 0 / marker 100 / map-overlay 900 / controls 1000 / dropdown 1300 / sheet 1650 /
  popup 2000 / menu 2500 / toast 3000 / modal 10000 / overlay 99990 / system 200000。境目は**実際の値の分布の
  隙間**から取った。各宣言は `var(--z-層)` か `calc(var(--z-層) + n)`（n は元の値 − 層の底。9999 の 2 つは
  `calc(var(--z-modal) - 1)`）。
- **描画順は 1 つも動いていない。** `scripts/z-layers.mjs` が全宣言を解決した順序列を、**書き換える前の
  スタイルシートから**台帳 `tests/z-layers-baseline.json` に書き、書き換えた後に同じ列を完全一致で照合して
  緑（86 宣言）。ブラウザ自身の解決（CSSOM の各規則の値を探針に置いて `getComputedStyle`）も台帳と一致する
  （`tests/map-a11y-structure.spec.js` ③）。1500 の同値はそのまま（名前を付ける回であって順を変える回ではない）。
- 数値リテラルの z-index: **229 → 144**（`css/intmap.css` 85 → 0）。残りは JS のインライン style と
  `index.html`・`css/pages.css`。台帳はファイルごとに両方向（増えたら落ち、減ったら下げる）。
  ⚠ JS の数値は今回移していない。`js/map-ui.js` の `_FRONT_Z` は CSS の `.im-front` と同じ数の写しで、
  `tests/shell-css-surface-checks.test.mjs` #R508 ① が両者を照合している（今は層を解決して比べる）。
- 数値を正規表現で読んでいた既存の検査 7 本（geo-routing-ui R298 ⑭・layer-ui-surfaces #R254 ⑧・
  shell-css-surface #R508 ①③・#R253 ④・news-feed-audit R372 ②・sidebar-layout R160 B1）を、
  `scripts/z-layers.mjs` の `resolveValue`／`tokens` で層を解決してから比べる形に直した（主張は同じ）。

## 3. 名前の無い操作要素の ratchet——`scripts/control-names.mjs`

- keyboard-reach と同じ契約: ファイルごとに数え、`tests/control-names-baseline.json` と両方向で照合する
  `check:static` の `control-names` 規則。マークアップ（`js/` の文字列・テンプレートとルートの `*.html`、
  コメントを除く）と、`document.createElement` を作った関数の中で読む構文木の 2 形。
- 数えないもの: 中身が計算される button（証拠にならない）、**空の button**（コードが後で文字を書く——
  `index.html` の時間帯のモード切替など 21 件がこれで、最初の版は誤検出していた）、関数の外へ出ない要素
  （`.click()` するためだけのファイル選択。構文木で「引数・返り値・代入・配列に出るか」を見る）、
  隠れた要素、`<label>` の中・`<label for>` の指す id。placeholder は accname で名前になる（`select` を除く）——
  描画時の全数を測る `tests/form-control-names.spec.js` と同じ読み方。
- 直したもの（en + jp、既存の i18n の仕組み）: photo-geo の −/+（「小さく／大きく — 項目名」。既存の
  tool-panel の訳と同じ語にした——「減らす／増やす」は `i18n-key-collision` が 1 つの英語キーに 2 つの意味として
  落とした）、news-ui の ★（Bookmark／ブックマーク）、space の ▶（Play / pause／再生 / 一時停止）、map-tools の
  ＋／－（Zoom in／out）、playground の × 2 つ（既存のキー `HOST.t('close')`——9 言語ある）、ai-core の select 2 つ、
  analysis-world-events の年の input 2 つ、app-body の切り抜きの range（両脇の －／＋ は `aria-hidden`）、
  admin.html の checkbox（`aria-labelledby` で見出しを指す。新しい文字列なし）。**69 → 55**。
  `js/atlas-console.js` の 9 件は別作業が編集中なので台帳に残した。

## 4. 一文字のショートカットの無効化（WCAG 2.1.4）

- 設定 ▸ キーボードショートカット に「1 文字のショートカットキー」（オン（既定）／オフ — Ctrl/⌘ や Alt との
  組み合わせのみ）。`localStorage` の `intmap_kbd_single`。昼夜の切り替えと同じく、変えた瞬間に効く。
  オフでは修飾キーの無い全ショートカット（「?」を含む）が何もしない。Escape はダイアログ登録簿のものなので対象外。
- ショートカットのヘルプに Alt+N／Alt+Shift+N の行を足した。
- ⚠ 行の文言は **`js/keyboard-shortcuts.js` が en + jp で書く**（`intmap-lang` で書き直す）。最初は
  `ui.en.js`／`ui.jp.js` に keyed の行を 3 つ足したが、`tests/hazard-other-i18n-registry-checks` R223 ⑩ が
  「zh の keyed 表は en 以上の行を持つ」を守っていて落ちた——keyed の行を足すと凍結中の 7 言語にも行を
  求めることになる。index.html の `<label for>` と空の `<option>` は残し、名前は label が与える。
- narrator の待ちは生の `setInterval` にしない（`tests/shell-runtime-checks` R408 ②a）——レンダラは
  `GE().whenCanDraw()`、Active layers の帯は `js/runtime.js` の `everyTick`（隠れたタブでは休む）。

## 5. reduced-motion／forced-colors をページ全体で 1 か所

- reduced-motion は、既存の末尾の 1 ブロック（a11y-shared-dialog）に「ページ全体の transition を即時に・
  scroll-behavior:auto」を足した。⚠ 別のブロックとして末尾に置くと、`tests/a11y-shared-dialog-checks` が
  「最後の reduced-motion ブロック」を読むので、その規則を読めなくなる——同じブロックに入れるのが正しい形
  だった（「1 ブロック」はそのブロックを指す）。アニメーションは止めない（回転する読み込み表示は作業中の唯一の印、
  というそのブロックの判断を守る）。
- forced-colors は末尾に 1 ブロック: 全体の backdrop-filter を外す・`aria-pressed`／`aria-selected`／
  `aria-current` に Highlight の輪郭・**`#map` は `forced-color-adjust:none`**（階級区分・凡例・マーカーの色は
  情報そのもの）。コンポーネント別の既存ブロックは消していない。

## 6. 検査

- `tests/map-a11y-structure-checks.test.mjs`（評価型 10 本）と `tests/map-a11y-structure.spec.js`
  （1 回の起動で 4 段: 名前付き region と live 領域がレイヤーのオンで要約を更新する／Alt+N が中心に置いた
  探針の地物を、その層の click 所有者自身のハンドラで押す（視点は動かない）／CSSOM の全 z-index をブラウザが
  解決した値が台帳と一致する／ショートカットの切り替え）。
  ⚠ 4 本に分けた最初の版は 22 秒で、全体の予算を 0.4 分超えた。起動を 1 回にして 10.8〜13.8 秒。
  `tests/durations.json` に 13、`scripts/test-budget.mjs` の `TOTAL_BUDGET_S` に +13（これまでの足し方と同じ）。
  ⚠ 1 回の起動にしたら ② が落ちた——① で最初に見つかる主題のレイヤーが 1 地域だけのレイヤー（EU など）だと、
  初回だけその地域へ枠を合わせる（CONSTITUTION §3 の例外）ので、カメラが動いている最中に ② の「視点は
  動かない」を測っていた。① の終わりにレイヤーを消し、カメラが止まるのを待つ。
- ゲート: `check:static`（`control-names`・`z-layers` の 2 規則を足した。門の一覧に余白が無いので
  keyboard-reach と同じく static の規則）・`check:engine`・`check:types`・`check:i18n`・`check:docs`・
  `check:archfiles`・`check:surface`・`check:testbudget` 緑。

## 7. 残したこと

- **`check:perf` の天井を受け入れて上げた**（`--update`）。eager gzip +9.4 kB・modules +1・cssRaw +2.7 kB。
  内訳を測り直した: 同じマシンで**この変更を外した `origin/main` を build すると eager raw が既に天井 +16.4 kB**
  （許容幅 0.5% の内側なので main の CI は緑）。この変更の純増は eager raw +7.6 kB（narrator 6.8 kB・
  shortcuts と geo-engine 0.8 kB）と cssRaw +2.6 kB（層の変数と全体の 2 ブロック）で、それが main の余白を
  超えさせた。narrator は読み上げ領域を起動直後から持つ必要があるので遅延させない。
- JS の数値リテラルの z-index 144 件と、名前の無い操作要素 55 件（うち atlas-console 9）は台帳に載ったまま。
- 巡回は `clickLayers` に登録された層だけ。地図全体の click で自前の当たり判定をする物は入らない。
