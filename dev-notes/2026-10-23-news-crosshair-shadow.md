---
title: news-ui の setupIntelLayers が自分の `const GE` で外側の `GE()` を影にし、ダッシュボードのピンの hover / leave / click が #R178 から一度も結ばれていなかった——影を消して結び、同じ形を js/ 全体で測る門と、復活する hover の出力の符号化
date: 2026-10-23
---

〈依頼〉 2026-10-23 のセキュリティ点検で評価中に観測された `TypeError: GE is not a function`（js/news-ui.js）を、実際の挙動として再現し、根本原因（名前の影）を直し、復活する機能が仕様どおりか・別経路で置き換えられていないかを確かめる。

## 0. 測った

- **再現（ビルドした本体をブラウザで）**: 起動後、エンジンの hover 集約（`adapter()._hvh.regs`）と MapLibre の委譲クリックに `news-dots` / `news-labels` の 6 つはあるが、`dash-dots` の mousemove / mouseleave / click は 0、`moveend` に十字線も無い。`window._crosshairNews` だけが公開されている＝例外の 1 行前までは走っている。呼び出し元（`whenCanDraw().then` と `styledata`）が例外を飲み、`window._intelHandlersBound` は先に立つので二度目以降は早期 return——**1 ページに 1 回投げて、以後は黙る**。
- **いつから**: 内側の `const GE=window.IntMapGeoEngine` は #R161 から、`map.on(…)` を `GE().events.on(…)` に替えたのが #R178（#61）。その時から投げていた。
- **形の数え上げ**: `tests/helpers/js-bindings.mjs` の字句スコープで「`X()` の X が関数と分からない const/let/var に解決し、1 つ外のスコープの同名が関数」を js/ 全体（139,001 呼び出し）で数えると、修正前は js/news-ui.js の `GE()` 22 件**だけ**。最初の試作は js/gis-datasets.js の `const no = refuseTime` も挙げたが、これは関数の別名（`valuesOf` が関数に解ける）なので除外して誤検出ではなくなった。⚠ 「関数でない値を呼ぶ」型の検査は 0 件で、この欠陥を**見逃した**——`IntMapGeoEngine` は即時関数の戻り値で、解決器はその値を解けない（過小近似）。だから門は値ではなく「名前が 2 つの意味を持つ」形に付けた。

## 1. 復活する 3 つは何だったか（二重実装の確認）

| 結び付け | 仕様と現状 | 判断 |
|---|---|---|
| ダッシュボードのピンの hover / leave / click（`dash-dots`） | 層と書き手は今も在る。書き手は js/analysis-world-events.js の出来事の索引だけ（`dash-points` に Wikidata のラベルを `title` として入れる）。企業の地図は js/company-facilities.js / js/company-footprint.js の別の層で、置き換えではない | **結ぶ**。hover の出力は `IntMapSafe.html` で符号化した（下の 2） |
| モバイルの十字線 → ニュースの小窓（`_crosshairNews` の moveend） | #R107 で利用者の依頼により無効化済み（本体は先頭の `return;` の後ろ）。生きていたのは「moveend ごとに共有ツールチップを隠す」だけで、それも #R178 から走っていない | **消す**（形式上の削除）。携帯でピンや帯を開くのは news-dots / news-labels のクリック → `_showMobileNewsPopup` が引き継いでいる。結んでいたら、#61 以来無かった「止まるたびに他の層のツールチップも消える」挙動を新しく足すことになった |
| 十字線の小窓のタップ（document の click） | `_xhrProps` を立てるのは到達不能な本体だけ＝常に無反応 | **消す**。同上 |

あわせて消したもの: 十字線だけが呼んでいた `_imCanDraw`（呼び手 0）、公開面の台帳の `_crosshairNews`（`npm run regen` が締めた）、その文字列「tap for details」の訳 4 行（fr / ko / zh / zh-hans。誰も要求できない鍵＝`i18n-dead-key-codemod --write`）と、それに合わせた `tests/i18n-coverage-floor.json` の 7 言語 −1 行。**読者がこの文を見たことは #R107 以来一度も無い**ので、能力は減っていない（`CONSTITUTION.md` §0 の 3 の床は「読者が持っているもの」を守る）。

## 2. 復活させる経路の出力

`dash-dots` の mousemove はピンの `title` / `body` / `color` を `setMapTooltipHTML`（innerHTML）へ**そのまま**書いていた。いま書き手が入れる `title` は Wikidata のラベル＝外部の文字列なので、結び付けを戻すと注入口も戻る。3 つとも `IntMapSafe.html` を通した。

## 3. 残っていること（この回の範囲外・判断が要る）

- **出来事の索引（`window._renderEventsArchive`）に到達する入口が無い。** `renderDashboard()` は #R139 から本体の第 1 文で `renderCompanies()` を返し、「出来事」へ切り替えるボタンはその到達不能な本体と出来事の画面自身にしか無い。だから `dash-points` も実際には空のまま。復元するか撤去するかは機能の判断なので、ここでは触らない。
- ピンのクリックは `setMode('info')` を呼ぶが、情報タブは今は企業一覧で、その再描画（`clearMarkers`）がピンを消す。退役したダッシュボード用に書かれた挙動のまま。

## 4. 検査

- `tests/news-crosshair-shadow-checks.test.mjs`: ① 合成プログラムで形を捕まえ・別名／関数どうし／呼ばない影は通す、js/ 全体で 0 件 ② 出荷する js/news-ui.js を偽のエンジンで評価し、`setupIntelLayers()` が投げない・dash-dots の 3 つが 1 回ずつ（2 回目の呼び出しで増えない）・moveend は declutter の 1 つだけ・hover が `<img onerror>` を文字として出す・leave で戻る・click が zoom 4 へ飛ぶ。**修正前の js/news-ui.js に差し替えると ①b と ② が赤**（② は `GE is not a function`）。
- `tests/news-geo-checks.test.mjs` #R161 #16 は `GE.layers.addSource('news-points'` という綴りを固定していたので、「GE を通る（呼んでも呼ばなくても）」と「news-dots / news-labels のポインタ処理が 6 つ」に言い直した。
- ブラウザ（ビルドした本体・デスクトップ幅）: 修正後は `dash-dots` の 3 つが登録され、出来事の索引の実データ（2024 Hualien earthquake）で本物のポインタの hover → カーソル pointer・feature-state hover・ツールチップ表示、離脱 → 戻る、クリック → `flyTo` zoom 4 と情報タブ。地名カード（台湾）はピンが在るときは出ない。⚠ ペインが隠れている間は rAF が 0 フレームで、飛行は描画が進んだ時点で完了した（URL の zoom 4.00）。
- 段 1: `check:static` `check:engine` `check:types` `check:i18n` `check:surface` 緑。news-ui・台帳を読む node 検査 64 本 874 件 緑。
