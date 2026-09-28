---
title: maplibre-gl 5.24 → 6.11.2——移した内部は 6 つ、どれも黙って効かなくなる形だった。6.8 で球の地下判定が本当に走り出して無制限チルトの視点が 1,223 km 流れ、6.4.1 でカスタム層にも globe のクロスフェードが実値で届いて衛星・航空機の点が z11→12 で消えていた
date: 2026-09-27
---

〈依頼〉dependabot PR #763（maplibre-gl 5.24 → 6.11）を、前の担当の実測（開発記録 `2026-09-27-deps-runtime-majors` §3）
から引き継いで入れる（利用者承認「全部」）。入れたのは 6.11.2（6 系の最新 patch）。**機能を劣化させないこと**を
動いているレンダラで示し、劣化を避けられない所があれば止めて報告する。

## 0. 結論

入れた。§3 の 2 件（球の地下判定・カスタム層の高度単位）は 6 系の**挙動の変化**で、移行しただけでは直らず、
それぞれ直して、直ったことを同じ spec が測る。**劣化として残ったものは無い。** 残した未了は §7。

## 1. API の対応表（6 系で何に移したか）

| 5.24 で使っていたもの | 6.11.2 | 移した先 |
|---|---|---|
| `import maplibregl from 'maplibre-gl'` | default export が無い（ESM 専用） | `import * as maplibregl`（`src/vendor.js`） |
| worker は束の中の文字列（blob） | `dist/maplibre-gl-worker.mjs` が隣の `maplibre-gl-shared.mjs` を import する実ファイル | Vite の `?worker&url` で自己完結の worker を組み、最初の Map より前に公開 API `setWorkerUrl` |
| `map.transform`（13 か所） | 削除。Map は Camera を**合成**し `map._camera.transform` | 内部。`js/geo-engine.js` の `_tr(m)` 1 か所に閉じた |
| `map.isEasing()` | Map は転送しない（`undefined`＝`isAnimating()` が常に偽） | 内部。`_cam(m).isEasing()` |
| `map.transformCameraUpdate = fn` | Map の欄は読まれない（代入は黙って何もしない） | **公開** `map.setTransformCameraUpdate(fn)` |
| `map._elevateCameraIfInsideTerrain` の上書き | Camera のメソッド（`this` は Camera）。Map への上書きは呼ばれない | 内部。`_cam(m)` に上書き |
| `transform.getMatrixForModel` | 削除・公開の代替なし | カスタム層に渡る投影データを、シェーダの `projectTileFor3D` と同じ式で CPU で通す（`_lifted`） |
| `transform.getProjectionDataForCustomLayer` 他の行列・遠クリップ面 | 同名で Camera の transform にある | `_tr(m)` 経由 |
| `camera-math.js` の `gC2C(t, m)`（`m.transform` を見に行く） | — | 第 2 引数を**transform** にした（map を探しに行かない） |
| `config.MAX_PARALLEL_IMAGE_REQUESTS` | 同じ（`getMaxParallelImageRequests()` も公開） | 変更なし |

アダプタが Map に対して呼ぶ 82 種のメソッドは全部 6.11.2 の `Map.prototype` にある（`tests/maplibre-6-migration-checks` ①
が束縛を解決して数える——`const m=new Map()` の JS の Map を取り違えないように）。前の担当の一覧に無かったのは
`isEasing` と `transformCameraUpdate` の 2 つ（どちらも投げずに黙る）。

## 2. 内部依存の移し方と、劣化が無いことの根拠

**口は 2 つだけ**（`_cam`＝`map._camera`、`_tr`＝その transform）。6 系でも painter が描画に使う transform は
Camera のもの（`new Painter(gl, this._camera.transform)`・`migrateProjection` が painter に新しいものを渡す）で、
spec ① が「アダプタの読む transform ＝ painter の transform」を実物で確かめる。transform は投影変更で**置き換わる**ので
毎回読み直す（キャッシュしない）。

- **高度つき hover**（航空機・衛星・3-D 機体）: 物差しは**MapLibre 自身が高度に置いた点の描画**——6.6 の
  `symbol-height-offset`（アンカー `absolute`）で持ち上げた記号の画素を、表示／非表示の 2 フレームの差で拾う。
  実測（東京、画素の重心 vs `projectAltitude`）: 平面 z10・pitch 60・10 km — 描画 y 238.5 / 計算 238.48、
  globe z8・pitch 50・50 km — 215.5 / 214.8、クロスフェード中 z11.5・8 km — 33.8 / 38.6（5.24 の
  `getMatrixForModel` は mainMatrix だけでフェードを知らず 38.6 を返していた＝同じ）。spec ③ は 3 条件とも
  5 px 以内・地上点から 40 px 以上離れていることを要求する。
- **地下補正の修理**（無制限チルト）: 上書き先を Camera に。5.24 と同じく modifier の先頭で、順序は同じ。
  ⚠ ただし §3.1 の変化があり、球の分岐を足した。
- **視点ピボットのフック**: 公開 `setTransformCameraUpdate`。`eyePivotDiag()` は Camera の欄を読む。
- **遠クリップ面の延長（地平線の点滅対策 #R203）**: `_tr` 経由で同じ `overrideNearFarZ`。`tests/r203` は各フレームの
  値が数であることも要求するようにした（6 系で `__imap.transform.farZ` を読むと全フレーム `undefined` で、
  比の検査が**素通り**していた）。
- **飛行シムの視点**（#R158 の固定理由）: 6 系の `calculateCameraOptionsFromTo` は投影ごとに式を持つ（球は
  `vertical_perspective_transform.ts` の球面の式）が、コックピットの視距離 1,800 m は z≈15 で常に平面の領域。
  spec ⑤ が `camera.fromTo`→`jumpTo` の目の位置を描画行列から読み（camera-ruler）、3 姿勢とも 2 m 未満・次フレーム
  0.5 m 未満を確かめる。⚠ 最初の版はこれを `setCenterClamped(false)` 抜きで測り 2,888 m ずれた——飛行シム自身は
  飛行中に clamp を外している（`js/flight-sim.js`）ので、測り方の誤り。
- **ジェスチャ**: `tests/r179`（実ドラッグで平面・球・z1.7〜18・69°N）と `r177`・`r178` が全部緑。

## 3. 6 系の挙動の変化で、移すだけでは直らなかった 2 件

### 3.1 球の地下判定が走るようになり、無制限チルトの視点が流れた

6.8.0: 「`getCameraAltitude()` が globe / vertical-perspective で NaN を返し、…カメラの地形判定を無効にしていた」。
5.24 では**球の提案カメラは常に「地上」と判定されていた**（NaN との比較が偽）。6 系では正しく判定され、
見上げドラッグの提案カメラ（ピボットは地表に溶接・ズームはドラッグ開始時のまま）は 95° を越えると本当に
地球の内側に入る（目の半径 √(1+2·dg·cos p+dg²)）。
**実測**（globe z6 東京、70 歩の ctrl ドラッグ）: 提案 96° を判定が 95.21° に書き換え、フックはその書き換え後の
カメラの目を保持し、ドラッグが続く間に視点が **1,223 km**（z9）／1,668 km（Tromsø）流れた。5.24 の同じ木では
0 m で 104.42° に飽和。
直し方は既存の修理と同じ考え——「エンジンがこれから作るカメラを判定させる」——を球の自由度で: 球はズームを
使って目を保つ（標高は球では効かない）ので、フック自身の解（`gLimitPitch`、飽和込み）を**複製**に当てて判定し、
**提案は触らない**（提案のズームと中心はフックが次のフレームで読む履歴で、書くとドリーと読まれる）。
直後の同じ計測で 0 m・104.42° 飽和＝5.24 と一致。`tests/r179` の globe 3 件が赤→緑。

### 3.2 カスタム層の高度が、globe のクロスフェード中に消えた

6.4.1: 「カスタム層に `projectionTransition` を globe/mercator の遷移中も 1 に固定して渡していた」を直した。
これで z11→12 の間、prelude の `interpolateProjectionFor3D` が **fallbackMatrix・(x, y, e)** と混ぜるようになった
——カスタム層の fallback は平面の行列で z は **Mercator 単位**、球の半分は **m**。1 つの `e` では両方を満たせない。
**実測**（6.11.2、globe z11.5・transition 0.5、東京 8 km、オービット層の点を画素で探す）: どこにも描かれない
（5.24 では y 15.5 に描かれていた）。制御した探査層で `e`=8000 は描画なし、`e`=2.9·10⁻⁴（Mercator 単位）は
y 198.5（球の半分がそれを m と読むので高さが半分）。
⇒ `js/lifted-projection.js` の `projectLifted(p, metres, merc)`：球の半分には prelude 自身の `projectToSphere` と
`u_projection_matrix` に m、平面の半分には `u_projection_fallback_matrix` に Mercator 単位、`u_projection_transition`
で混ぜる（prelude と同じ式）。球でないときは prelude の `projectTileFor3D(p, merc)` そのもの。衛星
（`orbit-points`）・航空機（`aircraft-points`、機首方向の探査 2 点も）・3-D 体積（`solid3d`）が共有する。
**直後の実測**（オービット層の点の画素 vs `projectMercAlt`）: 平面 z10 — 238.3 / 238.5、globe z8 — 213.7 / 214.8、
z11.5 — 33.8 / 38.6（MapLibre 自身の記号も 33.8）、z11.8 — 254.4 / 255.8。spec ③b が 3 条件を 6 px で測る。

⚠ **同じ計測で見つかった、5.24 からの既存の食い違い（直ったが、原因は切り分けきれていない）**: 平面 z10・pitch 60・
高度 10 km のオービット層の点は、**5.24 の main のビルドでも** 6.11.2 の §3.2 修正前でも地上位置（y 388）に描かれて
いた（hover の `projectMercAlt` は y 238.5 を指す）。`bufferData` を捕まえると高度 10000 m と係数 3.07·10⁻⁸ は正しく
アップロードされ、`u_altScale` も 1 だった。同じ入力を `projectLifted(p, alt, alt*a_mscale)` で渡す今の形は y 238.3 に
描く（spec ③b の平面の条件）。旧い `mix(alt, alt*a_mscale, u_altScale)` の形がなぜ地上に落ちたかは切り分けて
いない——制御した探査層でも、属性から `e` を組むと 10 km が描かれず、uniform で 3·10⁻⁴ を渡すと y 241.5 に描かれた
（ドライバは SwiftShader）。「描く位置と拾う位置が同じ」は今は spec が画素で測っている。

## 4. worker の配布と起動費用（`check:perf`）

6 系は ESM 専用で worker を実ファイルで配る。Vite の `?worker&url` は worker を**本体の束とチャンクを共有しない
別の束**として組むので、`maplibre-gl-shared.mjs`（516 kB）が本体側と worker 側に**二重に入る**。
5.24 の UMD は 1 ファイル（1,056,837 B）の中で shared を 1 回だけ持ち、worker はその文字列から blob を作っていた。

⚠ **worker はチャンクではなくアセット**なので、`scripts/build-report.mjs` の「入口からの静的 import の閉包」には
入らず、**入れないと起動費用が +35 kB に見えた**（実際は +535 kB raw）。起動経路の `?worker&url` モジュールが
名指すアセットを eager に数えるようにした（名前ではなくモジュールグラフで判定。関数内で `new Worker(new URL(…))`
する航空機・放射線・衛星・津波の worker は入らない）。

| eager（main の天井 → この変更の後、main は #779/#780 を含む実測） | 前 | 後 | Δ |
|---|---:|---:|---|
| raw | 4,812,654 | 5,365,102 | +552,448（worker 510,110 ＋ 本体側 maplibre +36,046 ＋ #779 の本体） |
| gzip | 1,574,007 | 1,734,624 | +160,617（worker 145,209） |
| brotli | 1,180,357 | 1,312,705 | +132,348（worker 119,266） |
| requests | 7 | 8 | +1（worker） |
| modules | 280 | 283 | +3（`maplibre-gl.mjs`・`maplibre-gl-shared.mjs`・worker URL モジュール ← UMD 1 本・`lifted-projection.js`） |
| CSS raw | 342,540 | 356,704 | +14,164（6 系の `maplibre-gl.css` 69,930 → 83,144 ＋ #779） |

本体側の `maplibre-gl` チャンクは 1,031,614 → 1,067,660 B（6 系のライブラリ自体の増分：bidi-js、MLT 1.3、
複合文字の字形、…）。worker は別スレッドで解析されるので主スレッドの解析費用は本体側の +36 kB だけだが、
**転送は brotli で約 +120 kB 増える**。天井は main の記録を基準に、この変更が動かした行（eager 全行・
`dist.total`・`dist.assets`）だけを実測で書いた（`--update` の出した async の揺れ −22 B とキー順の入れ替えは戻した）。

**提案（未実施）**: MapLibre の `dist/*.mjs` 3 本を**束ねずにそのまま**版つきのディレクトリで配れば、本体と worker が
同じ shared を読み、worker 側は 19 kB になる（実測 3 本で 1,125,285 B raw ／ brotli 約 252 kB。今は 1,577,770 B ／
約 352 kB）。束ね器の外部参照と import 解決（import map か出力パスの書き換え）、dev サーバ、`maplibre-gl` group
（束ね器の補助モジュールの置き場でもある）を組み替える作業になるので、移行とは別にした。

## 5. 6.0 の描画の既定の変化（受け入れたもの）

`zoomLevelsToOverscale` 既定 4・半透明の線の重なり・offset つきアイコンの拡大廃止・複合文字の組版・
GeoJSON の入れ子 properties が値で返る——`docs/MAP-LAYERS.md` §7.5。
入れ子を持つ source を**実行して数えた**（175 のレイヤーを 1 つずつ点けて `setData`／`addSource` を捕まえる）:
`imtb-src`・`imtb-lbl-src`（`_i18n`）・`imta-src`（`dates`）・`elec-src`（`n`）・`ukr-src`（`styleMapHash`）で 5.24 と
同じ集合。読み手は source のデータを読むか、`js/map-ui.js` の `_eraSourceDates` のように文字列と値の両方を受ける。
同じ 175 レイヤーで 5.24 と 6 のコンソールの警告・エラーを比べ、6 だけに出るものは無かった（両方に出たのは上流の
空応答・502 だけ。6 の 1 回目に出た遅延チャンクの取得失敗は計測中に `dist/` を作り直したためで、作り直しの無い再計測では出ない）。

## 6. 検査

**足した**: `tests/maplibre-6-migration-checks.test.mjs`（アダプタが呼ぶ Map のメソッドが入っている版に実在する／
内部は `_cam`・`_tr` の 2 口だけ／`src/vendor.js` が namespace と自己完結 worker を最初の Map より前に渡す）、
`tests/maplibre-6-migration.spec.js`（§2・§3 の実測 10 件。1 boot を共有。durations 64・`TOTAL_BUDGET_S` +64 は
#R402 の較正の上限側：27.5 s × r143 の比 2.30）。

**5.24 の内部文字列を読んでいた検査を、評価に直した**:
- `r322-checks` ①: `dist/maplibre-gl-dev.js` が無いと `existsSync` で**早期 return して緑**だった（6 系で黙って空振り）。
  `Style.prototype.setPaintProperty/setLayoutProperty/setFilter` と `GeoJSONSource.prototype.setData` を代役の上で実行する。
- `r230-checks` ③: `getMaxParallelImageRequests()` を訊く。
- `r182-checks` ①: キーボード・スクロールの定数は `KeyboardHandler`／`ScrollZoomHandler` を Node で組んで欄を読む。
  モジュール内の `const` にしか無いもの（回転・傾きの速さは 6.1 から `MapOptions` の `rotateSpeed`/`pitchSpeed`）は
  パッケージが同梱する `src/` の宣言から読む（ファイル名は書かず木を探し、値が 2 通りなら落ちる）。
- `r241-checks` ④: z11→12 の帯は spec ④ が動いている globe に訊く。
- 版を固定していた `r158` #6・`r175` ③: 「**正確な版で固定されている**」を測る（内部に触れる以上、浮かせない）。
  固定が守っていた事実（コックピットの目の位置）は spec ⑤。
- `r177`・`r178`・`r179`・`r203`: レンダラの内部は `tests/helpers/camera-ruler.js` の `__mlCam()`/`__mlTr()` だけが
  読み、内部が動いたら**投げる**（`m.transformCameraUpdate == null` は 6 系で空振りの合格だった）。
- `r705-chronos-border-precision-checks`: style-spec 26 の `createExpression` は式の位置（第 2 引数）が必須。
- `r171`・`r176`・`r172`・`r173`・`r174`・`r401`・`r411`: 綴りが変わった箇所（`gC2C(t,t)`・`setTransformCameraUpdate`・
  `projectLifted`）。

**Cesium の操作（`js/cesium-input.js`）**: 6 系で変わった慣性の速度の測り方（離した瞬間までの直近 60 ms・先頭は
区間の始点だけ・`VELOCITY_WINDOW`）を写した。

## 7. 残したもの（未了）

- ⚠ **Cesium の globe ドラッグの法則**: 6.4 で MapLibre の globe のドラッグは掴んだ点を指に付けるバーソル回転
  （`versorSetLocationAtPoint`）になり、`computeGlobePanCenter` は慣性だけが使う。`js/cesium-input.js` はまだ 5.24 の
  法則でドラッグする。第 2 エンジンの操作感の変更なので、この移行には入れていない（`#R182` の「MapLibre と同じ
  反応」を 6 系に追従させるなら別の作業）。
- 束ねない配布（§4 の提案）。
- `symbol-height-offset`（6.6）で、`js/data-layers.js` が「5.24 には記号を持ち上げる手段が無い」と書いて
  fill-extrusion で代用している箇所を置き換えられる——機能の追加なのでここでは触れていない。
- #747 の帰属表示の防御は残した（DECISIONS.md: 上流の修正は 1 実装の 1 版に掛かったもので、IntMap 側の帰属表示は
  「描かれている source だけ」を出す製品上の役割も持つ）。`npm audit --omit=dev` は 0 件になった。
