# IntMap — 現状仕様書 §12 壊れやすい部分・注意すべき部分

> **現状仕様書の §12。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §12.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 12. 壊れやすい部分・注意すべき部分

- **`reorganizeLayerPanel()` は DOM を大量に並べ替える。** タップ中に走ると行がずれて誤タップの原因になる。
- **レイヤーの一覧・棚・既定値は宣言 `js/layers/<id>.js` が持ち、`js/layer-manifest.js` はそこから導出する。** 行を足すなら宣言を 1 本足す（足さなくても行はベータへ掃かれて描かれるが、
  一覧を読む全員——タイル盤・共有リンク・お気に入り・セッション復元——がその行を知らず `tests/layer-manifest.spec.js` が落ちる）。GENERATED LAYERS の領域は手で書かない。基本表示の行を
  `index.html` に書き戻さない（既定の tick と `window.IntMapDefaultOn` が再び 2 か所になる）。
- **ケッペンのメモリ**：携帯は必ず軽量 `*_4k.png` を使い、作業キャンバスは 2048² へ直接デコードする。
- **ヘッドレスプレビューは `document.hidden`** なので WebGL の `load` が発火せず `requestAnimationFrame` も止まる（地図描画は DOM／状態／console で検証する）。rAF が来ないとスタイルは一生
  load されない（MapLibre は `_load()` に `frameAsync()` 越しに到達する。rAF が来なければ起動終了時に未捕捉例外 2・レイヤー 0）⇒ 待ち時間で諦める仕掛けはこの状態で猶予を使い切らない
  （`js/data-layers.js` の Köppen の梯子は `document.hidden` の間は期限を延ばす）。
- **既定 ON のレイヤーは、スタイルに拒否されたら「もう一度」を持たなければならない。** `js/app-body.js` は既定 ON の `change` をタイマー（300/600/1600/2600 ms）で撃つので、スタイル未完成の
  `addSource`/`addLayer` は `Style is not done loading.` を `change` リスナーの中で投げる（未捕捉になる）。握りつぶさず、建てる → 拒否されたら待って建て直す（`styledata` で起こされ、読者が
  チェックを外した瞬間に諦める。CONSTITUTION §2.1.3）。海底ケーブルと Köppen がこの梯子を持つ。
- **ニュースは `current_news` 依存**：cron が動いていないとフロントは自動でライブ RSS フォールバックに落ちる（鍵は不要だが中継に依存する）。
- **`styledata` の自己ループ**：`styledata` ハンドラの中で自分の source を消して足し直すと閉ループになる。ハンドラは `ensureLayers()` を呼び、既にあればスタイルに触らずに返り、作り直すのは
  本当にレイヤーが消えているときだけ。`styledata` は「基図が変わった」ではない（MapLibre はスタイルへの変更すべての後に撃つ——`Style.update` → `data`）。`js/layer-packs.js` の6つのパックの
  自己修復は1つの規則 `healWhenLost(GE, delay, rows, heal)` を通り、`rows()` が各行の「オンか」と「描くレイヤー id」をパック自身の表（`SETS`・`ROW_LAYERS`・`WB[k].ids`・`CFG[k].ids`・
  `TZ_IDS`・`layId(L)`）から述べ、`heal(keys)` はオンでレイヤーを失った行だけを受け取る（`delay` の間の判定は1回。リスナーは受領証 `rows`・`heals` を持ち、
  `tests/railways-handover-idempotent-checks.test.mjs` が購読から発見する）。
- **`source._data` は `setData()` のあとも古いことがある。** 読むのは `source.serialize()`。
- **MapLibre のフィルタ内 `['zoom']` は整数ズームでしか再評価されない。** 段は整数で書く。
- **`!important` は CSS アニメーションに勝つ。** ショートハンド（`background:` など）に付けると副プロパティ（`background-position`）が初期値に固定され `@keyframes` が効かない。ロングハンドで書く。
- **画素で決まる長さは投影に訊く**（`GE().coords.project`）。メルカトルのメートルは画面中心でしか合わない。
- **同じ入口が2つあれば、片方は忘れられている。** 状態を変える経路（`editDirty()` のような「必ず通れ」）は1本の関数にする。
- **時間を当てにする同期は、遅い経路で必ず外れる。** 終わったと教えてくれるもの（Promise・`transitionend`）に繋ぐ。
- **`null` は「値が無い」と「まだ取得していない」を区別しない。** キャッシュのミスを「データが無い」と読ませない（DEM・境界データ・フィード）。
- **同じ主題を2つの解像度で読むなら、「行の集合」は同じではない。** `countryStats` は起動時に Natural Earth **110 m**（177 コード）から作り、幾何だけを idle 後に **10 m**（252 コード）へ
  差し替える（`js/countries-ui.js`。差し替えた瞬間から `codeAtPoint` は 252 コードを答え、それを読む約25か所は未知コードを黙って読み飛ばす）。
  - **不変条件: `countryGeo` の全 id は `countryStats` に行を持つ**（両ループは `_mkStat()` 1本を通り、粗いファイルに無かったコードはアップグレードが行を作り、既存行は in-place で enrich する）。
    `tests/news-countries-checks.test.mjs` が粗いファイルと細かいファイルを食わせて検査する。
  - **国の身元は 3 つの綴りで書かれ、解決器はその 3 つを受け付ける**（`countryStats` は ISO 3166-1 alpha-3 を鍵にし、各行は `a2` と `ccn3` を持つ。`resolveCountrySync`——`js/atlas-console.js`
    ——はまず `_idCountry()` でこの 3 形を引き、当たらなければ `nameEn`/`nameJp` を採点する）。識別子の形をしていて店が知らないものは間違った識別子なので、ジオコーダへ行かず `null` を
    返し呼び出し側が「見つからず」に名前を並べる（6 つの dispatch が共有する。地名「バイエルン」→ ドイツの経路は変わらない）。
  - **国の範囲は 2 つ**: `bbox` はその国が在る場所（home extent・カメラを向ける先）、`bboxAll` は全ての土地の union（当たり判定の足切りにだけ使う）。分けるのは `js/country-extent.js`（label 点が
    入るパートを錨にし、3° 以内で連なるパートと国土の 1/3 以上を占めるパートだけを拾う。±180 をまたぐ国は東端が 180 を越える区間——ロシアは 26.9°E → 191.0°E）。`js/search-geocode.js` は
    この箱に `homeExtent` の印を付け、`js/place-framing.js` はその印があるとき OUTLIER 判定を飛ばす。`tests/place-framing-checks.test.mjs` が同梱の CShapes 181 件を全件歩いて「地球の有り得ない
    割合を占める枠は 1 つも無い」を検査する。
  - **後から作られた行は「現在の値」を持って現れる**（アップグレードは起動 3〜15 秒後で、世界銀行の下限 1960 年より前は重ね合わせが1回しか走らない）⇒ 行を作ったアップグレードが
    `IntMapTimeCountries.reapply()` を呼ぶ。現在のスナップショットは追加式（行が現れた時点で取る）。
- **地名検索の結果カードは「同じ地物は 1 行」で束ねる**（表示文字列の衝突では束ねない）。`js/search-geocode.js` の `doGeocode` は同梱の候補と 3 つのジオコーダ（Open-Meteo・Nominatim・
  Photon）を 1 枚に並べ、`_sameFeature` で突き合わせる——① 同じ OSM オブジェクト（`osm_type`/`osm_id`）、または ② 種別（`js/place-framing.js` の `placeClass`）・名前
  （`js/atlas-geo-resolve.js` の `placeRules.nkey`）・場所（片方の点がもう片方の extent の中か、その種別へ飛ぶズームで 2 点の差が `FRAME_PAD_PX`＝`gotoPlace` の padding 以内）が全部一致。
  束ねるときは多くを知っている行（確認済みの home extent ＞ 提供者の extent ＞ 無し、次に種別の有無）が残り、表示中の行はその場で書き換わる。同じ名前の別の物（京都市と京都駅）は束ねない。
  検査は `tests/search-result-dedupe-checks.test.mjs`（3 提供者の実測応答・到着順 3 通り）。
- **地名検索の 1 行は 1 つの記録**——ラベルの名前と飛ぶ先の点は同じ記録から来る。端末の候補（`localFuzzyPlaces`）は国の表・地名辞書の索引・世界の地名辞書から作り、首都の行は地名辞書の
  その都市の記録（同じ名前で GeoNames の iso2 が国の alpha-2 と一致するもの。手書きの行は国の範囲の中に立つもの）を使う（索引に同じ記録があれば 1 行で種別 `capital`。記録が無ければ首都の行は
  出さない）。索引の各項目は人口と iso2 を持つ（`js/gazetteer.js` の `index()`）。似ているものは `placeRules.agreement`（Dice、`NAME_AGREE_MIN`）で測り、名前そのものを含む行が端末に 1 つも
  無いときだけ探す。並びは ① 名前の一致（全体 ＞ 前方 ＞ 含む ＞ 似ている）② 種別の大きさ（`zoomTable()`）③ 人口で、カードの行は提供者を問わずこの順に差し込まれる。Enter は先頭の候補へ
  飛ぶ（名前全体が一致する行が端末にあればネットワークを待たず、無ければ 3 つのジオコーダを上限 5 秒待つ。IME の変換確定の Enter——`isComposing`／keyCode 229——は検索しない。
  `js/app-body.js`）。Atlas の確定の入口（`js/atlas-geo-resolve.js` の `geocode`）も完全一致の首都の行を採る。検査は `tests/search-identity-checks.test.mjs` と `tests/search-identity.spec.js`。
- **地名検索の各行は、ラベルの下に「何であるか」を添える**（2 行目 `.ms-kind` は `placeClass` の答えを `classNames()`——`PLACE_ZOOM` の全キーに en＋jp の名前。`station` は railway=* 全部
  なので「Station / railway」——で読んだもの）。同じ種別で名前が畳むと同じになる行が他にもあるときだけ、提供者自身の行政の連なり（Photon の county・city・district・locality、Open-Meteo の
  admin2〜4。粗い順）から、ラベルに出ておらず相手の行に無い最初の地名を足す（行は到着のたびにカード全体を塗り直す）。種別を答えられない行（AIRH・PRK など）には何も書かない。検査は
  `tests/ui-a11y-polish-checks.test.mjs` ①②。
- **「行がある」と「一覧に出る」は別の主張で、あいだに主権フラグが1枚ある**（`renderStats` は `sov!==false` で絞る）。フラグは `_mkStat()` が 1 か所で書き、5 ファイル 6 か所が読む
  （`js/countries-ui.js` の一覧・`js/stats-compare.js` の比較ピッカー・`js/atlas-console.js` の国名解決と順位付け・`js/atlas-examples.js` の起点チップ・`js/time-borders.js` の `tagSame`）。
  Natural Earth の `TYPE` が視点ごとの `FCLASS_*` より上位（`FCLASS_*` はある視点がその多角形をどう分類するかで国家の存否ではない——ノルウェーは `TYPE:"Sovereign country"` と
  `FCLASS_TLC:"Unrecognized"` を同時に持ち、`WOE_NOTE` がその理由を書く。ソマリランドと北キプロスは逆の並びで一覧に出る。FCLASS 分岐が立つのは 110 m で 4 件・10 m で 13 件で、ノルウェー
  以外は既に `TYPE:"Indeterminate"`）。**不変条件: 地図が「国」として描くものは Countries 一覧に行がある**（「国」は `TYPE` の `Sovereign country` / `Country` から導く。
  `tests/news-countries-checks.test.mjs` が TYPE × FCLASS の全組合せを、`tests/r410.spec.js` が実際の DOM の行と `countryGeo` を突き合わせる）。
- **失敗したフィードと、止まったフィードは違う。** 止まったフィードは全部の計器が「成功」を報告する。年齢を必ず測って印字する（§7.1）。
