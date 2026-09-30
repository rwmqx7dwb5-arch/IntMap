---
title: 起動時に同期評価される JS を構造で減らす——レイヤーの「行」は起動時に、本体は初めて点けたときに読む（世界データ層・宇宙エクスプローラ）。stars.bin の読み手を 1 つに、ecoregions は URL でレンダラへ、Noto の規則シートは描画をブロックしない
date: 2026-09-30
---

〈依頼（監査・起動性能）〉同期 JS 7 チャンク・286 モジュール・4.93 MB（入口 main が 3.59 MB・73 %）。
`src/main.js` は静的 import 136 行・動的 0。レイヤーの行（棚・チェックボックス・Atlas から見える名前）は
同期のまま、実装本体を初回に import する形へ。ecoregions 9.76 MB のページ側 parse、stars.bin の 2 重読み、
Google Fonts の描画ブロッキングも。

## 0. 測った（着手時・この worktree の `vite build`）

- eager **4,945,707 B**（gzip 1,622,339・brotli 1,223,477）・**288 モジュール**・チャンク 7 本。main 3,604,153 B・192 モジュール。
- main の中の大きいもの（束ね前の rendered length）: data-layers 370,634 / **world-packs 296,498** / app-body 216,081 /
  map-ui 215,997 / layer-packs 137,077 / time-borders 135,771 / map-tools 129,131 / **space 123,670** / newsgeo 95,188 …
- Google Fonts の css2（JP+SC+TC × 400/500/600/700、Chrome の UA）: **1,386,296 B**（gzip 378,319）。
  1 ファミリー単独で JP 456,260 / SC 449,300 / TC 480,736。規則シートは `<link rel=stylesheet>` で描画をブロックしていた。

## 1. 行は起動時、本体は初回（`js/lazy-modules.js` `lazyBody` / `lazyRowFailed`）

行側が要る答えは 3 つで、どのモジュールでも同じなので 1 か所に書いた:
① クリックは到着の Promise 1 本に**押した順**に並ぶ（到着前の on→off が「遅れて on」の孤児レイヤーに
ならない——CONSTITUTION §3）② 何も取っていないときの off は何も取らない ③ **到着後は同期**（`tradeToggle(true)` の
直後に `trade().on` を読む呼び手が以前と同じ答えを得る——`tests/r211.spec.js` ④ はこれで一度落ちた。
最初の版は到着後も microtask を 1 つ挟んでいた）。④ 到着の失敗は覚えない。届かなかったら行を外して言う
（新しい文言は en+jp: 「このレイヤーを読み込めませんでした。接続を確認して、もう一度お試しください。」）。
⚠ `IntMapLazy.need('<name>')` のリテラルは呼び手側に置く（`lazyBody(() => window.IntMapLazy.need('…'))`）——
マニフェストの検査（layer-manifest ③）と静的な到達の検査がそのリテラルを読む。

### 1a. 世界データ層（`js/world-packs-rows.js` ＋ 本体 `js/world-packs.js`・`worldPacksBody`）

- 本体 6,300 行を AST で見て、行・ツールキット（~400 行）への依存を全数で出した（36 名）。ツールキットは
  `js/industry-web.js`・`js/ocean-currents.js`・`js/outbreaks.js` が**起動時に** `IntMapWorld._ui` から読むので
  eager 側に置き、本体には `_kit`（`_ui` ＋ 本体だけが読むもの）で渡す。言語ヘルパ（`L`/`LA`）と
  `_imCanDraw` は本体が自分で宣言する——i18n の計器は**ファイルが宣言した**ヘルパで訳語呼び出しを数え、
  `#R170` の検査は factory ごとの宣言を要求するため（渡すと BENIGN の衝突 3 件が「消えた」ように見えた）。
- `IntMapWorld` は到着前から在り、`state()` は「どれも点いていない」を答える。到着した本体が
  `Object.assign(window.IntMapWorld, STATE)` で入口を足す（eager だった頃の `Object.assign(…, STATE)` と同じ形）。
- 共有リンクの `world` 状態: `get` は到着前は null（点いている層が無いので正しい）、`set` は本体を取ってから適用。
- 行にポインタが乗った時点で `IntMapLazy.hint('worldPacksBody')`。
- マニフェストの 5 行に `lazy: ['worldPacksBody']`（layer-manifest ⑤ が実際に点けて確かめる）。

### 1b. 宇宙エクスプローラ（`js/space-approach.js` ＋ 本体 `js/space.js`・`spaceBody`）

- 入口は**ズームの床で使い切れないズームアウトの積分**（#R201）で、入力は毎セッション読むので、積分・ゲージ・
  `mount()` の受動リスナー（~165 行）を eager に残した。本体は `_kit` から同じ積分とゲージを読む
  （戻りのゲージと `close()` が同じ積分をゼロにする——積分もゲージも 1 つ）。
- 取得は**ゲージの予告が出た時点**（床の 2 ズーム手前、`NEAR_FLOOR`）で始まる。発火は 1.6 ズーム分の積分なので、
  普通は到着が先。まだなら到着してから渡る。
- ファサード `window.IntMapSpace`: `mount`／`open`／`setRate`（Atlas `space` が呼ぶ 2 つ）／`isOpen`／`atFloor`／
  `nearFloor`／`_pushOut`／`enterFromZoom`／`state()`（到着前は `loaded:false`——本体の答えを作らない）／`ready()`。
  到着した本体が `Object.assign(window.IntMapSpace, api)`。本体が返す API は `window.__imSpaceBody`
  （**新しい公開名**。`check:surface` の基準に足した。`js/lazy-modules.js` がこの名で到着を検証する——war-layer の
  `__imWarFronts` と同じ形）。
- `js/space-events.js`・`js/space-bodies.js`・`js/space-cosmos.js` は本体しか読まないので、本体が static import し、
  `src/main.js` から外した（boot guard の必須一覧から `IntMapCosmos` を外した——検査は到着時の検証へ移る）。
  `js/ephemeris.js` は `js/night-sky.js`・`js/space-sky.js` も読むので eager のまま。
- `tests/r203.spec.js`・`tests/smoke.spec.js` R207 ⑥ は API を同期で叩くので `ready()` を先に待つ。
  ⚠ smoke の R207 ⑥ は `if(!S.setScale) return {skip:true}` なので、待たなければ**黙って skip になるところだった**。

## 2. 移さなかったもの（依存を数えて決めた）

`window.X` を**同期で**呼ぶ読み手を全ファイルで数えた（atlas-* は触れない範囲なので、そこが呼ぶ形は変えられない）:

| 本体 | 同期の読み手 | 判断 |
|---|---|---|
| routing（76 kB） | `IntMapRouting` を 15 ファイル（Atlas・widgets・navigation・map-tools…） | ファサードが実装の写しになる |
| weather（82 kB） | `IntMapWxPlayer` を data-layers・news-timeline・war-layer・waves・wx-ecmwf・index.html | 時計の再生器は起動時に要る |
| sims（77 kB） | 4 factory・`IntMapSun` を theme-sky（起動時の空の色）・insolation・map-ui・tool-panel・Atlas | 起動時の読み手あり |
| newsgeo（95 kB） | gazetteer・news-context が起動時に読む | 起動経路 |
| layer-packs（137 kB） | 6 factory が各自の行を作り、`IntMapBeta2`（app-body・compare・map-ui）・`IntMapTimeZones`（routing・news-timeline）・`imUnitTemp`（6 ファイル） | factory ごとの分割が要る。次の候補は `religionLang`（`IntMapCulture` に外部の読み手 0） |

## 3. stars.bin の読み手を 1 つに（`js/star-catalogue.js`）

`js/space-sky.js` と `js/space.js` がそれぞれ fetch して IMSTAR1/2 を自前で歩いていた。バイトは
`js/data-door.js`（`as:'arrayBuffer'`）、レコードの復号は 1 関数（`decodeStarCatalogue`）、各ビューは自分の形だけ作る。
⚠ **最初の版で eager チャンクが 7 → 9 本になった。** `js/star-catalogue.js`（eager の space-sky と遅延の space の
両方が読む）から `js/data-door.js`（これも共有）へ static import を張ったため、Rolldown が
`js/fetch-deadline.js`・`js/proxy-fetch.js` を main に畳めなくなった（`vite.config.js` の fetch-deadline-layer の項と
同じ形）。扉は `window.IntMapDataDoor` 経由で読むことにして 7 本に戻った（実測）。
fetch の期限台帳は 125 → 123（raw fetch 2 本が期限つきの扉に置き換わった）。

## 4. ecoregions は URL でレンダラへ

`addSource({data:'data/ecoregions_2017.geojson'})`。Cesium のアダプタは文字列の `data` を自分で取る（既存）ので
2 エンジンとも同じ綴り。失敗はレンダラの `error`（`sourceId`）で受けて同じ文言。`__loadEcoregions` は比較ウィンドウ用に残した。
⚠ **MapLibre 6 は URL で読んだ GeoJSON をページへ構造化複製で返す**（worker の `loadData`: `if (params.request)
result.data = params.data`）。だからページの仕事はゼロにならない。実測（Playwright Chromium・CPU ÷4・レイヤー無しで
`sourcedata` metadata まで・3 回、背景の地図の仕事が混ざるのでばらつき大）: ページで parse 最長タスク 2,026 / 1,845 / 1,913 ms・
合計 8,132 / 4,648 / 7,438 ms → URL 864 / 1,842 / 1,232 ms・3,174 / 5,667 / 5,071 ms。描画込み・CPU 等倍では差が出なかった。
`window._ecoGJ`（読み手 0）は消えた（`check:surface` の基準からも）。

## 5. Noto の規則シート

`index.html` の `<link>` を外し、`js/map-typography.js` `ensureWebFonts()` が DOMContentLoaded（`<html lang>` が決まった後）と
`intmap-lang` で、`_readerFaces()` の面のうち `document.fonts` に宣言の無いものだけを注入する。実測（ブラウザ）: ja/en の起動で
JP と SC の 2 本、TC は取らない。⚠ SC を「中国語を選んだときだけ」にはしなかった——他国の現地名を描く `HAN_ALL` が SC で、
どの読者の地図にも要る（依頼文の案と違う。理由はこれ）。⚠ **残る問題**: MapLibre の TinySDF は面の到着前に
ラスタ化した CJK グリフを保持する。フォントファイル（unicode-range で初使用時に取得）にもともとあった競合で、
規則シートの到着もそこへ入った。直すには到着後にグリフを取り直させる必要があり、それは `js/geo-engine.js`
（`setCjkFontFamily` が同じファミリーなら何もしない）の仕事になる。

## 6. 数字（後）

- eager **4,669,431 B**（−276,276）・gzip **1,520,634**（−101,705）・brotli 1,151,301・**286 モジュール**（−2）・チャンク 7 本。
  main 3,327,877 B。async は +279,291 B（world-packs 180,478・space 98,818 の新チャンク）。`perf-baseline.json` は `--update`
  （eager は下がった分だけ、async は移した分の天井。CSS の +19 B は着手前のビルドから既にあった差）。
- 初回点灯の待ち（`IntMapLazy.need` を呼んでから到着まで。Playwright Chromium・`dist/` を `scripts/serve.mjs` で配信）: デスクトップ worldPacks 129–191 ms・
  space 170–691 ms（背景のタイル取得と競合）。fast-4G（150 ms・1.6 Mbps）＋ CPU ÷4: worldPacks 1.3 s（転送 0.52 s・67.5 kB gzip）、
  space 2.6–3.1 s（転送 2.0 s・同時 24 リクエスト）——space は予告で先に取り始めるので普通は隠れる。

## 7. 台帳の移動

`tests/fetch-deadline-baseline.json`（world-packs 19 → 18 ＋ rows 1、space 3 → 2、space-sky 1 → 0）・
`tests/z-layers-baseline.json`（ゲージの z-index が space.js → space-approach.js）は**移動**で、増えていない。

## 8. 検査

`tests/startup-lazy-layers-checks.test.mjs`: ① `LAZY_REGISTRY` の全項目が入口の **static import 閉包**に入っていない
（実際のグラフ。R209 ① は `src/main.js` の行だけを見ていた）② eager 側が閉包に在る ③ `lazyBody` を実行 ④ 宇宙の
ファサードを評価（到着前の答え・Atlas の順序・受け渡し）⑤ ecoregions が URL ⑥ 新しいビルドがあればビルドの報告と一致。
既存の文字列検査は、移ったコードを読むよう 2 ファイルを読む形にした（family 単位）。

## 統合時に足したこと — CJK の字形が後から届く

Noto の CSS を描画の外へ出すと、MapLibre が CJK を面の到着前にフォールバックで描き、TinySDF がその形を持ち続けうる（もとから unicode-range の分割ファイルは初回描画の後に届くので、同じ競合は以前からあった）。`document.fonts` が CJK の面（Noto Sans JP / SC / TC・Pretendard）の読み込み完了を報告したとき、`IntMapGeoEngine.scene.refreshCjkGlyphs()`（`setGlyphs` に同じ URL を渡す公開の扉＝グリフキャッシュを空にして記号層を組み直す）を 1 フレームに 1 回だけ呼ぶ。時計では呼ばない。実測（ビルド済み dist を headless Chromium 1400×900 で 15 秒）: 描き直し 1 回・読み込まれた Noto の面 13・ページエラー 0。回帰は ⑦（map-typography を偽の `document.fonts` で評価）。
