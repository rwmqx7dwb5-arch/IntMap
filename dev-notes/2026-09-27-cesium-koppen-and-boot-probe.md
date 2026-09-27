---
title: Cesium で Köppen を含む全ての image source が描かれていなかった／起動 25 秒後の自己診断が全訪問者から GDELT を叩いて 502 をコンソールに出していた／地図タップで凡例を畳む判定が display の綴りのままだった
date: 2026-09-27
---

〈依頼〉利用者承認済みの 3 件。①「Cesium エンジンで起動すると Köppen がオンで凡例も出ているのに地球儀が
塗られない」②「起動のたびに gdelt-relay の 502 がコンソールエラーになる」③「`_minimizeOpenLegends` が
まだ `display` の綴りで表示を判定している」。

## 0. 測った

- **① Köppen（Cesium）**: ビルド済みサイトを Cesium で起動し（既定オンのまま）、レイヤー記録を読んだ。
  style には `lyr-climate` と `src-climate` があり、行はチェック済み・凡例も出ているのに、記録は
  `imagery:false, provider:null`。アダプタは `image` source を
  `new SingleTileImageryProvider({url, rectangle})` で作っていたが、Cesium 1.104 以降この構築子は
  `tileWidth`/`tileHeight` を必須とし（`Check.typeOf.number`。アプリは source から import するので検査は生きている）、
  例外は `catch` で null になり、`_buildLayer` は層を作らずに黙って戻っていた。**仕様上の制約ではなく欠陥**で、
  Köppen だけでなく**全ての `image` source**（年降水量・日射・地震動の面・ShakeMap・地形の水・可視域・
  world packs）が同じ道で Cesium に一度も描かれていなかった。
  さらに**置き方も違っていた**：`SingleTileImageryProvider` は緯度に線形に貼るが、MapLibre の `image` source は
  4 隅を Web Mercator に写して Mercator Y に線形に貼る（Köppen の PNG はそのために Mercator へ再投影して
  ある）。地理座標で貼ると MapLibre が 60°N に置く行は約 35.6°N、23°N（サハラ）には 43.7°N（アルプス）の行が来る。
- **② 起動時の GDELT**: 本番の gdelt-relay へ自己診断と同じ URL を投げた（2026-09-27）——
  **502 `upstream_unavailable`・`x-intmap-gdelt-upstream: 429/1`・11.4 秒**、温め直しの受領証は
  `miss:upstream_unreachable/7@54s`。GDELT へ直接も **429・13.6 秒・`Retry-After` 無し**。
  自己診断（`js/atlas-console.js` `_PROBES`）は起動 25 秒後に**実際の GDELT 検索を梯子ごと**流していた：
  自前の中継 → 読者の IP から直接（→ 予算切れで中断＝ERR_ABORTED）。cold のあいだは 1 回の起動が
  在線読み 1・温め直し最大 7・直接読み 1 を GDELT に送り、**全訪問者が毎回起動時に上流へ要求を足していた**
  （キャッシュが fresh の 15 分だけは上流に届かない）。そして結果は「GDELT 到達不可」の 1 語で、
  中継が死んでいるのか上流が混んでいるのか区別が無かった。
- **③ 凡例**: `tileLegends()` は前の変更で `hidden`・インラインの `none`・計算済みの `display` を訊く形に
  なったが、`_minimizeOpenLegends` は `display==='block'||'flex'` のままだった。インラインが空で
  スタイルシートが出している凡例は開いたまま地図の上に残り、スタイルシートが全凡例を消している間
  （飛行中など）のインライン `flex` は畳まれる。共通化できなかったのは、`tests/r742` などの検査が
  `tileLegends` の中の閉包 `shown` を切り出せなかったから。

## 1. 直した

- **①** `js/cesium-layers.js` `makeImageSourceProvider()`：画像を Cesium 自身の読み込み器で読み、その
  幅・高さで、4 隅の Mercator 矩形を 1 枚のタイルとする `WebMercatorTilingScheme` のプロバイダを返す
  （非同期。Cesium の `fromUrl` と同じ形）。`js/cesium-engine.js` は `image` source を
  `ImageryLayer.fromProviderAsync` で style の位置にすぐ置く。`updateImage`（期間の切替・クラスの強調・
  高解像度への差し替え）は次の画像が読めるまで今の画像を画面に残し（`retiring`）、読めたら退かせる。
  ⚠ **構造として**：描けなかった層（プロバイダが作れない・種類を描かない・例外・画像が読めない）は
  `rec.unpainted` に理由を持ち、`error` に層名を載せて出す。**style に在って何も描かない層を黙って持たない。**
  アプリが使う層の種類は全て Cesium で描ける種類なので、「このエンジンでは描けない」と凡例に書く
  必要のある主題レイヤーは今は無い（描く手段があったので描いた）。使われなくなった `rectFromCoords` は外した。
- **②** 中継に `?peek=1` を足した（`supabase/functions/gdelt-relay`）：**上流に 1 回も触れず**、上流を最後に
  読んだ結果（`upstream-last.json`。どの読者の読みでも `refresh()` の出口で 1 つ書く）と `state`
  （`ok`／`busy`／`fault`／`unobserved`）と経過時間を **200** で返す。自己診断は `js/proxy-fetch.js`
  `peekOwnRelay()` でそれを 1 回だけ訊き、「中継が死んでいる（`down`）」「上流がいま拒んでいる（`busy`、
  診断表示は既存の『レート制限 (429)』）」「まだ何も観測していない（`unobserved`、⚪ 未観測）」を分ける。
  Atlas への健康フラグも `busy` を「到達不可」に入れない。
  **中継の status**：上流の 429 は妥当な「いまは無理」なので 502（上流の答えが不正）は誤り。
  `upstreamState()` の 1 つの読みから、429・5xx・時間切れ・到達不能は **503**、artlist でない 200 など
  壊れた答えは **502**（`_shared/relay-guard.js` が時間切れ・到達不能に既に 503 を返しているのと揃う）。
  判定する他の読み手も揃えた：`scripts/probe-relay-ladder.mjs` は 503 に自前の `upstream_…` 封筒が付いた
  答えを「中継は生きていて上流が拒んでいる」と読み、`dead`（exit 1）にしない（Supabase 自身の 503
  ＝関数が起動しなかった、は封筒が無いので従来どおり）。uptime.yml は exit code だけを読むので変更不要、
  prod-smoke は GDELT に触れない。
- **③** `legendShown()` を `tileLegends` と同じ階層の関数宣言にし、`tileLegends` と `_minimizeOpenLegends`
  の両方がそれを読む。切り出して評価する検査（`tests/r742`・`r740`・`r499`・`legend-stack-and-held-heal`）は
  `legendShown` も一緒に切り出す。

## 2. 検査

- `tests/cesium-koppen-and-boot-probe-checks.test.mjs`（node・約 1.4 秒）：① 出荷する Cesium を読み込み、
  旧経路の構築子が tileWidth 無しで投げること・新しいプロバイダが画像の大きさで Mercator の 1 枚になること・
  部分範囲の中段の行が地理の中点（38.3°）でなく Mercator の中点に来ること・読めない画像は reject（黙った空白で
  ない）こと。② 中継を評価（`Deno.serve` を捕まえる。時計は仮想）：cold で拒否は 503・壊れた答えは 502・
  上流の受領証が書かれる／peek は 200 で GDELT へ 0 回・書き込み 0 回／`peekOwnRelay` は中継の peek へ
  1 回だけ、GDELT へ 0 回で 5 つの状態を分ける／ladder の `upstreamRefused`。③ 両方を切り出して走らせ、
  綴りと事実が食い違う凡例で「タイラーが置いたもの＝タップで畳むもの」。
  **直す前（HEAD の源）に対しては 9 本中 8 本が赤**（残る 1 本は Cesium 自身の性質の記述）。③ は
  `_minimizeOpenLegends` の行だけを旧い綴りに戻した変異で赤（`hidden-attr` と `suppressed` を畳み、
  `by-stylesheet` を畳まない）。
- `tests/cesium-koppen-and-boot-probe-cesium.spec.js`（Cesium を実際に起動・既定オンのまま）：層が ready・
  `unpainted` 無し・Mercator。サハラ中央の画素が BWh の赤（実測 255,0,0。地理で貼るとアルプスの緑）、
  層を隠すと赤でない（対照）、`updateImage` の直後も前の画像が画面に残り、読めた後も赤。
  直す前はこの spec の最初の待ちが満たされない（`imagery:false`）。本体の実測 57.0 秒。
- 既存：`tests/r769`・`r468`（502 の固定を「失敗の status」に）・`r464`・`r742`・`r740`・`r499`・
  `legend-stack-and-held-heal`・`legend-reflow…`・`own-fetch-relay`・`audit-sweep-0927`・`r175`・`r318` ほか。

## 3. 残り

- gdelt-relay を**本番へ配備するまで**、新しい自己診断の peek は旧い関数に届いて 400 になる（`down` と
  表示される）。クライアントと関数は同じ変更で届ける必要がある。
- Open-Meteo と USGS の自己診断は今も訪問者ごとに直接叩いている（Open-Meteo はレート制限のある
  ホストで、アプリには `js/wx-source.js` の守られた窓口がある）。今回の依頼の外なので触っていない。
