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
- **残る手作業（利用者）**: Location Platform のアカウント作成、API キー（権限 basemaps・参照元を本番の origin に・期限 ≤1 年・従量課金は無効のまま）。
  鍵を受け取ったら `ESRI_IMAGERY_KEY` に入れ、同じ計器（scratchpad の ab.mjs）で鍵なしと比べる。
- 移行しないもの: 参照ラベル（`World_Boundaries_and_Places`）・道路のプレビュー（`World_Transportation`）・陰影起伏は鍵付きの一覧に無い／別の
  サービスなので、今回は鍵なしのまま。

## 3. 全域変数の新しい結合（`check:surface` の台帳を更新）

- `window.IntMapCartoCredit` ×1・`window.IntMapSafe` ×1（`js/carto-basemap.js`）: 出典の文が届いたら表示を描き直す。同じファイルが既に両方を使っている形。

## 4. 検査

- `tests/sat-arcgis-3d-checks.test.mjs`（worker の待ち行列・取り下げ・枠の返却・標高の画面格子・拒否から鍵なし取り直しまでを偽のネットワークで評価）、
  `tests/esri-imagery-checks.test.mjs`。既存の検査の追随: layer-satellite-imagery R286 ⑤、process-map-shell-source-lines R195 ④、map-motion ⑤。
- ゲート: datagov・archfiles・engine・types が緑。数字はすべて headless で、実機ではない。
