---
title: 3D の衛星画像が鮮明になるまで——律速は Esri の接続待ち。捨てたタイルの取得を取り下げ・描画枠を即返却・標高の先読みを画面上に、取得先を ArcGIS Location Platform の鍵へ切り替えられる 1 か所に
date: 2026-11-17
newsen: The 3D satellite view turns sharp much sooner after you move the tilted map (a desktop pan went from about 12 s to under 2 s), and the map credit now reads "Powered by Esri" with the imagery sources.
newsjp: 傾けた 3D の衛星画像が、動かしたあと早く鮮明になります（パソコンのパンで約 12 秒→2 秒弱）。地図の出典表示は「Powered by Esri」と画像の提供元になりました。
---

〈依頼〉「3D の衛星画像も爆速に」「移行したいので、その準備も含めて全部やっといて」（ArcGIS Location Platform への移行）。

## 0. 測った（本番・headless・DPR 2 のデスクトップと携帯、2D／3D 傾き 0／傾き 70°）

- 3D は右上の「3D」ボタン（MapLibre の terrain）。傾き 70° で、カメラ停止から全タイルが鮮明になるまで:
  デスクトップのパン 12.7 s（2D 1.2 s）・ジャンプ 3.7 s（1.6 s）・回転 5.3 s。
- 待ちの 54〜91 % が Esri への接続の空き待ち。Esri の 2 ホストは HTTP/1.1 だけ（`nextHopProtocol`）＝12 接続。
  傾けると要求が 2D の 1.5〜4.5 倍、@2x で手前の z16〜17 が 4 倍、パン中に通り過ぎた約 260 タイル（約 1,020 取得）が
  順番待ちに残り、最終画面に要るのは約 45 タイル。
- 携帯は 54 % が MapLibre の共有の画像要求枠（16、移動中 8）の待ちで、捨てたタイルが worker の取得が終わるまで枠を持っていた。
- 地形を切っても傾けると標高の読み出しが 35〜112 件出ていた。出していたのは `js/map-readout.js` ではなく `js/app-body.js` の
  `prefetchDEMViewport`（`getBounds()` 全体に 7×7 点＝傾けると地平線まで散る）。
- 否定された見立て: 「描画が重い」（傾けて 30 fps に落ちるが鮮明化への寄与は小さい）・デコード（1 % 未満）。

## 1. 直したこと（1 つのビルドで `setTuning` を切り替えた ABBA）

| 場面 | 本番 | 採用 |
|---|---|---|
| デスクトップ 3D パン | 11.5 s（6 回中 3 回は 15 s 以内に揃わず） | 1.7 s（Esri 要求 870→474） |
| デスクトップ 3D ジャンプ | 4.2 s | 3.1 s |
| デスクトップ 3D 回転 | 7.0 s | 6.3 s（ばらつき大） |
| 携帯 3D ジャンプ／パン／回転 | 1.78／0.45／0.85 s（同一ビルドの旧設定） | 1.53／0.48／0.62 s |
| デスクトップ 2D ジャンプ／パン | 1.46／1.27 s | 1.29／2.07 s（範囲が重なり差は判定不能。2D では取り下げがほぼ 0 件） |

- **取得の待ち行列を worker が持つ**（`src/sat-worker.js` `LANES`）: 鍵なしの窓口へは 1 ホスト 12 本まで渡し、まだ渡していない取得は
  描画側が捨てたら取り下げる。渡した取得は取り消さない（#R196 の理由のまま）。6 は 2D を遅くし（ジャンプ 0.64→1.67 s）、24 は 3D の改善を減らした。
  鍵付き（h2）には上限を掛けない。
- **捨てたタイルの描画枠を即返却**（`src/sat-worker-client.js`）: abort の時点で reject、遅れて届いた bitmap は close。
- **標高の先読みを画面上の 7×7 点に**（空は `onSurface` で除く）: デスクトップ 3D の DEM 要求 ジャンプ 73→51・回転 117→74。
- 試して捨てたもの: 新しいフレームを先にする順序（中心から順の MapLibre の要求を崩し悪化）、画面の画素密度で @2x を省く
  （要求は 9〜26 % 減るが速くならず、遠くで低解像度のまま取ったタイルが近づいても残る）。コードは消した。

## 2. ArcGIS Location Platform への移行の準備

- **取得先を `js/esri-imagery.js` 1 か所に**: World Imagery の URL を写していた 6 か所（`sat-proto`・`sat-worker`・`app-body` の
  satellite ソース・`tables.js` の提供元一覧・`compare.js`・`flight-sim.js` の 2 か所）が全部ここを通る。`ESRI_IMAGERY_KEY` が空なら今までどおり、
  鍵を 1 行入れれば `ibasemaps-api.arcgis.com`（h2）へ。検査は `tests/esri-imagery-checks.test.mjs`（他のファイルが綴りを持たないこと含む）。
- **鍵が拒否されても地図は消えない**: 拒否は HTTP 200 の JSON（鍵なしで実測 `{"error":{"code":499,…}}`）なので状態では見えない。
  非 2xx か image/* 以外なら `imageryRefused()` でそのページの間は鍵なしへ戻し、同じタイルを 1 回取り直す（worker と本線の両方）。
  従量課金を無効にしたまま無料枠を使い切った場合もこの経路になる（超過時の応答の形は鍵が無く未実測）。
- **課金はタイル単位**（月 200 万枚無料、超過は 1,000 枚 $0.15、ブラウザのキャッシュ命中は数えない）。セッション課金は Basemap Styles
  サービス経由だけで、このラスタ URL には効かない（公式文書で確認）。支出の上限機能は無い——従量課金を無効にしておくことが上限になる。
- **出典**: 「Powered by Esri · Sources: <copyrightText>」。文言はサービスの `copyrightText` を 1 回読む（見た値 2026-11-17:
  Esri, Vantor, Earthstar Geographics, and the GIS User Community）。旧表記の「Maxar」は古かった。
- **キャッシュ**: 鍵付きのタイルは Service Worker に入れない（協定 Map display §6 は HTTP のキャッシュ指示の範囲だけを認める）。
- 通信先の台帳（`scripts/outbound-hosts.json`）に `ibasemaps-api.arcgis.com` を足し、`data/connection-ledger.json` を再生成。
- **鍵は作った。そして入れなかった（2026-11-18、利用者の判断）**: 権限は Basemaps › Basemap styles service（`premium:user:basemaps`）1 つ・
  Public application・No item access・参照元 `https://rwmqx7dwb5-arch.github.io`・期限 2027-11-16。権限が足りることはタイル 1 枚（image/jpeg）で確認。
  ⚠ **参照元の制限はタイルに効かない**——新しい z11 のタイルが他所の Referer でも Referer 無しでも JPEG で返った。コードに置けば誰でも使える
  ので、使わない間は置かない（控えは追跡されない場所）。
- **鍵付きは鍵なしより遅かった**（同じ実行の中で build 2 本・別ポート・アームごとに別の冷えた山地・ABBA、デスクトップ 4 回・携帯 3 回）:

  | 場面 | 鮮明化 鍵付き / 鍵なし | 1 取得の往復 p50 鍵付き / 鍵なし | 鍵付きの課金対象（件/回） |
  |---|---|---|---|
  | PC 3D ジャンプ／パン／回転 | 1.58 / 1.31・1.27 / 1.08・0.77 / 0.62 s | 717 / 70・961 / 115・355 / 72 ms | 382・982・608 |
  | PC 2D ジャンプ／パン | 0.73 / 0.59・0.28 / 0.00 s | 366 / 65・188 / 52 ms | 95・292 |
  | 携帯 3D ジャンプ／パン／回転 | 1.73 / 0.68・0.57 / 0.07・0.62 / 0.10 s | 287 / 59・234 / 27・190 / 39 ms | 107・159・160 |

  プロトコルは期待どおり（CDP: 鍵付き h2・鍵なし http/1.1）、拒否は 108 回中 0。鍵なしの初バイトは p50 約 14 ms＝日本の近くの CDN から
  返っている。h2 で 12 接続の天井が消える利点より、1 取得の往復が 5〜10 倍遠いことのほうが大きかった。§1 の待ち行列で天井の待ちが
  既に小さくなっていたことが効いている。鍵付きに上限 12 を掛けると更に遅い（3D ジャンプ 1.58→3.91 s）ので、鍵付きは上限なしのまま。
  ⚠ 日本の 1 回線・1 時間帯の観測。海外の利用者・CDN が温まった後の鍵付きは測っていない——鍵を入れる前に測り直す。
- **否定された見立て**: 「移行すれば速くなる」。速くなるのは 12 接続の天井が律速のときだけで、その天井は §1 で先に外れた。
- 移行しないもの: 参照ラベル（`World_Boundaries_and_Places`）・道路のプレビュー（`World_Transportation`）・陰影起伏は鍵付きの一覧に無い／別の
  サービスなので、今回は鍵なしのまま。

## 3. 起動費用（`perf-budget --update`）

- `eager.modules` +1: `js/esri-imagery.js`（衛星画像の URL を作る 1 か所。起動の地図スタイルの satellite ソースが使う）。
- 出典の `copyrightText` を読む関数は、通信の時計（`js/fetch-deadline.js`・`js/proxy-fetch.js`）を自分で import せず `js/app-body.js` から
  受け取る。worker もこのモジュールを読むので静的 import できず、動的 import にした版では 2 つが起動の別チャンクに分かれて
  `eager.requests` が 9→11 になった（測って直した）。

## 4. 全域変数の新しい結合（`check:surface` の台帳を更新）

- `window.IntMapCartoCredit` ×1・`window.IntMapSafe` ×1（`js/carto-basemap.js`）: 出典の文が届いたら表示を描き直す。同じファイルが既に両方を使っている形。

## 5. 検査

- `tests/sat-arcgis-3d-checks.test.mjs`（worker の待ち行列・取り下げ・枠の返却・標高の画面格子・拒否から鍵なし取り直しまでを偽のネットワークで評価）、
  `tests/esri-imagery-checks.test.mjs`。既存の検査の追随: layer-satellite-imagery R286 ⑤、process-map-shell-source-lines R195 ④、map-motion ⑤。
- ゲート: datagov・archfiles・engine・types が緑。数字はすべて headless で、実機ではない。
