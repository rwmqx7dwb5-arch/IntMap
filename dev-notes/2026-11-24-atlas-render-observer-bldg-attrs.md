---
title: 「描いた」は画面に届いたものにだけ言う(render.witness)と、3D 建物を選ぶと属性のカードが開く——実 GPU での表示速度も実測
date: 2026-11-24
newsen: Click a building in the 3D city models (Japan, the Netherlands, worldwide) to see its height, use, year built and storeys, with the dataset's licence. Atlas now says a map change is on screen only after checking that it really is.
newsjp: 3D都市モデル(日本・オランダ・世界)の建物をクリックすると、高さ・用途・建築年・階数が出典とライセンスつきで見られます。Atlas は、地図に描いたと言う前に、本当に画面に出ているかを確かめるようになりました。
---

〈依頼〉(1) 地図に図形を登録しても、画面外・不透明度 0・他レイヤーの陰・描画エラーなら利用者には見えない。Atlas が「描いた」と言う前に、実際に見えているかを観測する。(2) #1349 の 3D 建物と PLATEAU の建物を選んだとき、持っている属性を見られる UI。実 GPU での表示速度の実測。

## 1. 描画の観測器 `render.witness`(`js/render-witness.js`)
`render.drawn`(#1353 が足した描画記録の土台)は「描画エンジンが持ち、レイヤーが非表示でない」までしか言わない。その上に、同じ面について次を観測する:
不透明度 0(式で書かれていれば評価できないので**透明とは言わない**)／いまのズームがレイヤーの minzoom・maxzoom の外／特徴が画面の外(globe では裏側に回った点を project→unproject の往復で除く)／描画エンジンがその面かレイヤーにエラーを出した(`claim` の時点から聞く)／別レイヤーが覆っている。`pixels !== false` なら、**同じタスクの中で**「そのまま」と「そのレイヤーの不透明度を 0」にした 2 フレームを描いて特徴の位置の画素を比べ、不透明度を戻す(提示されるのは戻した後だけ)。

判定は `seen` / `not_seen`(理由つき)/ `unconfirmed`。**`unconfirmed`(フレームが来ない・隠れたタブ・redraw を持たないエンジン)は失敗として報告しない**(`one-pass-or-a-reason.md` §5)。Atlas は能力の実行ごとに `_drewSince` が見つけた面へこれを訊き、見えていない面があれば結果に「描きましたが、画面には見えていません: 理由」と `meta.seen` を付ける(`js/atlas-console.js`)。

### 実機で見つかって直した 4 つ(どれも単体の偽アダプタでは見えなかった)
実 MapLibre・実 Cesium を Intel Arc の実 GPU で動かし、既知の答えを持つ面(見える・不透明度 0・ズーム範囲外・画面外・緑の板で覆う)を作って測った。
1. **`visibility:none` で撮り直すと戻らない。** MapLibre は非表示のレイヤーのバケットを作らないので、再表示でタイルを worker で作り直す。「戻した」フレームがまだ「消した」絵のままで、**見えている面を「覆われている」と判定した**。→ 不透明度で比べる。
2. **不透明度の変更は 300 ms かけてフェードする。** 変更直後の同期描画は古い不透明度で描き、画素が一致した。→ `<prop>-transition` を 0 にしてから変え、**戻すときも transition が 0 のまま戻してから transition を戻す**(transition の設定を変えると現在値までのフェードが再開し、層が 0 から浮き上がる)。
3. **Cesium の `redraw()` は未適用のスタイル変更を反映しない。** `setPaint` は次のアニメーションフレームで適用されるので、同期描画は旧い文書を描き、同じ誤判定になった。→ `redraw()` が `_flush()` してから描く(隠れたタブで `onNextFrame` が使う同期描画にも効く)。
4. **globe の裏側の点も円盤の上に project される。** 裏側の面が「画素が変わった」と出た(背後の別物の変化を拾った)。→ project→unproject が元の位置に戻らない点を採らない。

実測(Chromium・Intel Arc・各エンジン): MapLibre globe z1.7 で 5 面が すべて期待どおり(seen 1・opacity_0・zoom_range・covered・viewport)、約 0.4〜1.0 s(1 回の呼び出しで 2 フレーム + 形状の走査)。Cesium z13 で seen / opacity_0 / covered(`no_pixels` と報告・Cesium のピックは覆われた面を拾わない)。呼び出し後の不透明度・transition は元の値(0.9 / 未設定)に戻る。

## 2. 3D 建物の属性カード(`js/building-attrs.js`・`js/building-info.js`)
**属性名は 3 データセットの実タイルから読んだ**(2026-11-24):
- PLATEAU(千代田区の b3dm バッチテーブル): `gml:name`・`bldg:measuredHeight`・`bldg:usage`・`bldg:class`・`bldg:storeysAboveGround/BelowGround`・`bldg:address`・`uro:BuildingIDAttribute_uro:buildingID`・`uro:BuildingDetailAttribute_uro:fireproofStructureType`/`districtsAndZonesType`・洪水浸水ランク等 45 項目。`bldg:yearOfConstruction` はこの区には無い(あれば建築年の行が出る)。
- 3D BAG(`lod22` の glb・EXT_structural_metadata): `oorspronkelijkbouwjaar`・`b3_bouwlagen`・`b3_dak_type`・`b3_h_nok`・`b3_h_maaiveld`・`status`・`identificatie` ほか。**「建物の高さ」という属性は無い**(`b3_h_nok` = 最長の棟線の高さ・公式スキーマ docs.3dbag.nl で確認)ので、見出しは棟線の高さ − 地面の高さで、カードが「算出」と書く。
- Re:Earth Buildings(glb): `height`・`height_method`・`min_height`・`num_floors`・`roof_shape`・`subtype`・`class`・`name`・`gers_id`・`source_height`。`height` は `height_method` で決まる(パリの建物で `density`)ので、見出しの下に決め方を併記し、既定値を計測値として見せない。

クリックは Cesium の `drillPick`(`pick` ではなく — 最上面はしばしば場所マーカー/ラベルで、その背後の建物を拾う)。選んだ建物は黄に着色し、次の選択・Esc・閉じるで戻す(`layers.clearBuildingPick`・両アダプタの契約)。カードは DOM のテキストのみ(上流の名前・住所を markup として解釈しない)、出典とライセンスを末尾に。デスクトップは左のカード、スマホ幅は上から下がるカード(下は検索/シートのドック・右は操作ボタンの帯なので)。
実画面で 3 データセットとも確認: 東京駅前(グラントウキョウサウスタワー 209.5 m・42 階・業務施設・耐火・商業地域・丸の内)/アムステルダム(3D BAG: 1667 年・スレート屋根・棟 16.1 m・Pand in gebruik)/パリ(Re:Earth: 24 m・`density`)。スマホ 375×812 でもカードは画面内(8,14)〜(311,355)。
**否定された見立て**: スマホで下から出るシート — 実測で下のドックの下に隠れた。カードの背景を `--popup-bg`(0.74 のガラス)にした — 3D の街の上でテキストを透かした。`--card-bg` の 90% にした。**残る限界**: 都市の地名ラベルをクリックすると既存のラベルのポップアップ(コピー/AI 要約…)が同時に出て、カードと重なる(ラベル側の既存の挙動に手を入れていない)。MapLibre の「3D 建物(都市)」は足跡の押し出しで建物ごとの属性を持たないので対象外。

## 3. 実 GPU・実機相当の表示速度(#1349 が未実施と明記していたもの)
**環境**: Chromium(Claude デスクトップのブラウザ)・`ANGLE (Intel, Intel(R) Arc(TM) Graphics, Direct3D11)`・22 コア・DPR 2・バックバッファ 2048×1490。以前の SwiftShader(CPU 描画)の計測とは別物。**フレーム時間は rAF の間隔ではなく**(ペインが隠れていると rAF が 1 fps に間引かれ、レイヤーを切った基準も 1.2 fps だった=計器の限界)、`scene.render()` の直後に `readPixels` で GPU を待たせた 60 回の所要時間。タイルが落ち着く(`loaded`)まで待った。

| 場面 | 開いたタイルセット | タイルのメモリ | 三角形 | 1 フレーム p50 / p95 | 3D 都市レイヤーを切った基準 p50 / p95 |
|---|---|---|---|---|---|
| 東京駅前 z16.5 pitch60(PLATEAU 千代田・中央 + Re:Earth) | 26(うち描画中 2 + Re:Earth) | 約 191 MB | 11k + 568k | 3.0 / 4.0 ms | 0.7 / 3.0 ms |
| アムステルダム z16.8(3D BAG + Re:Earth) | 2 | 約 42 MB | 201k + 276k | 3.3 / 4.9 ms | 0.7 / 1.5 ms |
| パリ z16.8(Re:Earth) | 1 | 約 24〜69 MB | 406k〜487k | 2.8 / 3.7 ms | — |

⇒ この GPU では 3D 建物は 1 フレームあたり **約 +2.3〜2.6 ms**(60 fps の予算 16.7 ms の約 15%)。JS ヒープは 450〜580 MB(レイヤーの有無で大きく変わらず、タイルの実体は GPU 側)。初回の内容が出るまで(網待ち): Amsterdam で約 17 s、Paris の Re:Earth で約 8.8 s(`tilesetInfo.selected > 0`)。
**端末別**: この計測は desktop の Arc 1 台。**スマホ・低性能 GPU の実フレーム時間は取れていない**(電話実機が無い)。スマホ幅のエミュレーションで確かめたのは配置と、`js/tileset-budget.js` が端末ごとに決めるタイルのメモリ上限・SSE が効くこと(同じ Arc 上なので速度は desktop と同じ)。実機の計測は未了。

## 4. 検査・予算
`tests/atlas-render-observer-bldg-attrs-checks.test.mjs`(13): 偽アダプタ(両アダプタが共に持つメンバーだけ)で、見える／不透明度 0／ズーム範囲外(maxzoom は排他)／画面外／エラー／覆われている／覆われていないのに画素が変わらない、式の不透明度と「円は 0 でも輪郭は 1」が透明扱いにならないこと、**判定不能が失敗にならない**こと、描画が例外で落ちても不透明度が戻ること、3 データセットの属性(実タイルの名前・ノーデータの値・出所の注記)、カードが DOM テキストだけで行のキーすべてに en/jp の語があること。`tests/atlas-chat-scroll-ownership-checks.test.mjs` の `_drewSince` の形の検査は `surfaces` が増えた形を許す。
`perf` の天井を上げた理由(`node scripts/perf-budget.mjs --update`): `eager.cssGzip` +約 2 kB は建物カードの CSS(1.7 kB 生)。`async chunk "cesium-engine"` +2.7 kB は建物のピックと `redraw` の flush。`atlas-console` +7 kB は見えていない面の報告(能力の実行ごとに観測器へ訊く分)。`gis-core` +3.9 kB は geo-engine の `witness` とエラー聴取。`render-witness`・`building-info`・`building-attrs` は遅延 chunk(起動の eager には入れていない)。
