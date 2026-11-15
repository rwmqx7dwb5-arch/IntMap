---
title: maplibre-gl 6.18 で地図の離した後の慣性が無言で外れていた（Map._handlers の改名）——ホイールの終わり・Cesium の回転慣性・地球ドラッグの精度も新しい描画器に合わせ、Dependabot の 9 件を取り込む
date: 2026-11-16
internal: 依存の更新と、描画器の内部に合わせた追従。慣性・ホイール・回転は更新前と同じ感触に戻すもので、新しい挙動ではない
---

〈依頼〉Dependabot #1140（minor-and-patch 9 件: supabase-js 2.119.0・cesium 1.147.0・katex 0.19.1・maplibre-gl 6.18.0・satellite.js 7.2.0・@playwright/test 1.65.0・js-yaml 5.5.0・pdfjs-dist 6.5.438・vite 8.3.8）を緑にして main へ入れる。Dependabot の branch は #1105 より前の main から切られていて `package.json` の注記（deep tier 160 本）を古い 157 に戻していたので、main の `package.json` に 9 件の版だけを当て、lock は worktree 専用の `node_modules` で `npm install` して作り直した（原本の `node_modules` への junction を外してから——junction 越しの install は原本を書き換える）。

## 0. 測った——落ちた検査は全部、描画器が本当に変わった所だった

`tests/*-checks` は MapLibre の**入っている版のソース**を読み、IntMap が依存している内部を名指す。5 件の赤は 4 つの実際の変化:

| 赤 | 6.18 で変わったこと | 製品への影響 |
|---|---|---|
| map-motion ④ | `Map._handlers` → `Map._handlerManager`、`HandlerManager` は `this._dragPan._inertiaOptions` を渡す | **あった。** `js/geo-engine.js` の `_glideRelease` は `mm._handlers._inertia` が無いと黙って `false` を返す——離した瞬間の速度で滑る処理（pan と pinch の両方）と、ドラッグ中の行き先の先読み（`_dragDestination`）が無言で外れ、描画器の素の慣性（離すと半分の速さに落ちる）に戻っていた |
| map-motion ② | ホイールの終わりが `setTimeout`（`_finishTimeout`）から、結果に載せる `timeout` 要求＋トークン `_finishWait` に変わった（`onTimeout` は持っていないトークンを無視する） | **あった。** ばねが着く前に描画器が 200 ms で手振りを閉じるのを止めていた行が空振りし、連続ノッチの途中で zoomend が出うる |
| map-motion ④（ease） | ease の時計が `camera.ts` から `CameraMovementScheduler` へ（法則は同じ: 呼んだ時刻から `easing(t)`） | 無し。検査の読み先だけ |
| engine-cesium-input ① | 回転の慣性が線形の減速（`defaultBearingInertiaOptions`）から **摩擦**（`bearingFrictionOptions`: 半減期 140 ms・60°/s 未満は滑らない・上限 1200°/s・終わり 1°/s）へ（MapLibre Native に合わせた変更） | **あった。** Cesium の入力は MapLibre の手振りの写しなので、回転の慣性が MapLibre と違う感触になっていた |
| cesium-globe-drag ②③ | 地球の `Transform` が「カメラ状態の `Transform`」と「投影部品 `GlobeTransform`」に分かれた。さらに `versorSetLocationAtPoint` の回転が Float32 から **Float64** の四元数に | 1 つ目は検査の組み立てだけ。2 つ目は製品: `js/cesium-input.js` は 6.13 の単精度に合わせて `Math.fround` で丸めていて、1 手で 6e-7° ずれていた |

## 1. 直したこと

- `js/geo-engine.js`: 描画器の `HandlerInertia` を読む所を `_inertiaOf(mm)` の 1 か所にし、`Map._handlerManager` を読む（`_glideRelease` と `_dragDestination` の両方）。ホイールのばねは、着く前の終わりを「結果の `timeout` 要求とトークン `_finishWait` の両方を取り下げる」ことで延ばす（描画器自身の取り消しの作法）。
- `js/cesium-input.js`: 回転の慣性を `calculateFriction` の写し `frictionEase` に（遅い回転は滑らない・その家族が最長ならその easing で全体を運ぶ＝`extendDuration`）。地球ドラッグの回転は倍精度のまま。
- `js/satellites-live.js`: satellite.js 7.2 は深宇宙積分器の `atime`/`xli`/`xni` を記録に残す（リリースノートの Perf 項）。註の「毎回エポックから積分し直す」を 7.1 の事実として残し、7.2 の実測を足した。

## 2. 検査（緩めていない。新しい事実を同じ強さで名指す）

- `tests/map-motion-checks` ②: `_finishWait`・`timeout` の要求・`onTimeout` のトークン照合・`geo-engine.js` が両方を取り下げること。④: `Map` が `HandlerManager` を持つ欄の名前を**ソースから読み**、`geo-engine.js` がその名前を読むこと（次の改名でも同じ所で落ちる）。
- `tests/engine-cesium-input-checks` ①: 写す家族は pan/zoom/pitch の 3 つだけ（描画器に無い家族を写していないこと）と摩擦の 4 定数。**④b（新）**: `HandlerInertia` を同梱ソースから esbuild で組み、同じ記録した回転を描画器自身の時計（`setNow`）で与え、角度・時間・easing 曲線・「滑らない」判定まで `frictionEase` と一致すること。
- `tests/cesium-globe-drag-checks`: `createGlobeTransform()` で MapLibre の地球を丸ごと組む。9 経路の最悪の不一致 4.07e-11（丸めを外す前 6e-7°）。
- `tests/restored-layers-under-load-checks` ③: 前提が逆転したので書き換え。積分器の状態が記録に残ること、そして**使い回した記録が新しい記録と完全に同じ位置を返すこと**（エポックの前後・前進と後退を混ぜた 7 時刻 × 共鳴軌道 10 件）。実測（共鳴軌道 605 件・エポックから 3 年）: 初回 226 ms、2 回目以降 1.3 ms、使い回しと新規の差 0 km。

全 node 検査 7378 件のうち赤は 3 件で、どれもこの変更と無関係: `ci-job-timeouts` は main 自体の赤（`security.yml` の watch に上限が無い・#1143 が直す）、`security-audit` ① と ⑦ は全件同時実行の負荷で、単独では緑。

## 3. 起動の重さ（check:perf）

（build 後に追記）

（未了・引き継ぎ）build 後の実測: eager の bytes は帯の内側、modules だけ 908 > 897。base（c84eb35a・6.13）と比べた増分は maplibre-gl 自身の新ファイル +11（camera_movement_scheduler・elevation_hold・camera_state・transform・crs ほか）と **`@cesium/core/node_modules/earcut`（12 kB）が eager の `maplibre-gl` チャンクに入った 1 件**。cesium 1.147 で Cesium の earcut 3.0.2 の置き場所が `@cesium/core` に移り、`vite.config.js` の `inPackage` が「パスのどこかに `node_modules/earcut` を含むか」で判定するため、MapLibre の依存名 `earcut` に一致して Cesium の写しを起動チャンクへ引き込んでいる。直すのは規則: MapLibre の群は `ML_PACKAGES` が解決した**ディレクトリ**で判定する（名前ではなく）。直したあと build して modules +11 を確かめてから `--update`。
