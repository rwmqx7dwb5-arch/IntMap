# IntMap — 現状仕様書 §12 壊れやすい部分・注意すべき部分

> **現状仕様書の §12。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §12.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 12. 壊れやすい部分・注意すべき部分

- **`reorganizeLayerPanel()` は DOM を大量に並べ替える。** タップ中に走ると行がずれて誤タップの原因になる。
- **レイヤーの一覧・棚・既定値は `js/layer-manifest.js` の 1 か所。** 行を足すなら manifest に 1 行足す——
  足さなくても行はベータへ掃かれて描かれるが、manifest を読む全員（タイル盤・共有リンク・お気に入り・
  セッション復元）がその行を知らず、`tests/layer-manifest.spec.js` が落ちる。基本表示の行を
  `index.html` に書き戻さない（既定の tick と `window.IntMapDefaultOn` が再び 2 か所になる）。
- **ケッペンのメモリ**：携帯は必ず軽量 `*_4k.png` を使い、作業キャンバスは 2048² へ直接デコードする。
- **ヘッドレスプレビューは `document.hidden`** なので WebGL の `load` が発火せず `requestAnimationFrame` も
  止まる。地図描画は DOM／状態／console で検証する。
  ⚠⚠ **そして「rAF が来ない」は「スタイルが一生 load されない」と同義である。** MapLibre は自分の
  `_load()` に `frameAsync()`（＝`requestAnimationFrame`）越しに到達するので、**一度も合成されない文書は
  スタイルの解析を終えない**。実測（対照つき・5/5 再現）: rAF が通常なら起動終了時に未捕捉例外 0・
  レイヤー 63、rAF が来なければ**未捕捉例外 2・レイヤー 0**。
  ⇒ **待ち時間で諦める仕掛けは、この状態で猶予を使い切ってはならない。** 動いていないのは
  レンダラであって、読者がタブを見た瞬間に全部動き出す。`js/data-layers.js` の Köppen の梯子は
  `document.hidden` の間は期限を延ばす。
- ⚠⚠ **既定 ON のレイヤーは、スタイルに拒否されたら「もう一度」を持たなければならない。**
  `js/app-body.js` は既定 ON の `change` を**タイマー**（300/600/1600/2600 ms）で撃つので、`load` を
  待たない。スタイル未完成のときの `addSource`/`addLayer` は `Style is not done loading.` を投げ、
  それは**`change` リスナーの中**なので `dispatchEvent` を包む `try{}` には見えない
  （リスナー内の例外は dispatcher へ伝播せず global に報告される）＝**未捕捉**になる。
  ⚠ **握りつぶしてはならない**——飛んだ操作は飛んだままで、「チェックが入っているのに描かれない」が
  恒久化する（CONSTITUTION §2.1.3）。**建てる → 拒否されたら待って建て直す**（`styledata` で起こされ、
  読者がチェックを外した瞬間に諦める）。海底ケーブルはこの梯子を持っていて、同じ起動で **53 回**投げても
  誰にも届いていない。Köppen だけが持っていなかった。
- **ニュースは `current_news` 依存**：cron が動いていないとフロントは自動でライブ RSS フォールバックに落ちる
  （鍵は不要だが中継に依存する）。
- **`styledata` の自己ループ**：レイヤーが `styledata` ハンドラの中で自分の source を消して足し直すと、
  レンダラが再び `styledata` を撃つ閉ループになる。ハンドラは `ensureLayers()` を呼び、
  **既にあればスタイルに触らずに返る**こと。作り直すのは**本当にレイヤーが消えているときだけ**。
  ⚠ **`styledata` は「基図が変わった」ではない**——MapLibre は**スタイルへの変更すべて**（可視性・paint・
  filter・レイヤーの追加。自己修復自身の書き込みも含む）の後に撃つ（`Style.update` → `data`）。
  `js/layer-packs.js` の6つのパックの自己修復は**1つの規則 `healWhenLost(GE, delay, rows, heal)`** を通り、
  `rows()` が各行の「オンか」と「描くレイヤー id」を**そのパック自身の表**から述べ（`SETS`・`ROW_LAYERS`・
  `WB[k].ids`・`CFG[k].ids`・`TZ_IDS`・`layId(L)`）、`heal(keys)` は**オンでレイヤーを失った行だけ**を
  受け取る。`delay` の間に何回来ても判定は1回。リスナーは受領証（`rows`・`heals`）を持ち、検査は購読から
  自己修復を発見する（`tests/railways-handover-idempotent-checks.test.mjs`）。
- **`source._data` は `setData()` のあとも古いことがある。** 読むのは `source.serialize()`。
- **MapLibre のフィルタ内 `['zoom']` は整数ズームでしか再評価されない。** 段は整数で書く。
- **`!important` は CSS アニメーションに勝つ。** ショートハンド（`background:` など）に `!important` を
  付けると、そこに含まれる副プロパティ（`background-position`）が重要宣言として初期値に固定され、
  `@keyframes` が一度も効かなくなる。ロングハンドで書く。
- **画素で決まる長さは投影に訊く**（`GE().coords.project`）。メルカトルのメートルは画面中心でしか合わない。
- **同じ入口が2つあれば、片方は忘れられている。** 状態を変える経路（`editDirty()` のような「必ず通れ」）は
  **1本の関数**にする。注記を2本目・3本目と足さない。
- **時間を当てにする同期は、遅い経路で必ず外れる。** 終わった時刻を推定せず、終わったと教えてくれるもの
  （Promise・`transitionend`）に繋ぐ。
- **`null` は「値が無い」と「まだ取得していない」を区別しない。** キャッシュのミスを「データが無い」と
  読ませない（DEM・境界データ・フィードのいずれもこの形で壊れる）。
- **同じ主題を2つの解像度で読むなら、属性は地物ごとに同じでも「行の集合」は同じではない。**
  国の属性表 `countryStats` は起動時に Natural Earth **110 m**（177 コード）から作り、幾何だけを
  idle 後に **10 m**（252 コード）へ差し替える（`js/countries-ui.js`）。差し替えた瞬間から
  `codeAtPoint` は 252 コードを答えるので、**行を作らない enrichment だけのアップグレードは
  「幾何は答えるのに表が知らない」コードを 75 件生む**——そしてそれを読む約25か所（choropleth の
  ホバーと塗り値・NATO/EU・データセンター詳細・時代境界の解決・ニュースの国名
  フォールバック・シルエットクイズ・Atlas の5経路・`resolveCountryId` 自身）は**すべて未知コードを
  黙って読み飛ばす**ので、計器は何も言わない。
  ⚠ **不変条件: `countryGeo` の全 id は `countryStats` に行を持つ。** 両ループは行の構築を
  `_mkStat()` 1本に通し、粗いファイルに無かったコードはアップグレードが**行を作る**（既存行は
  in-place で enrich するだけ——後から走る PPP・指標補完・時代機械の書き込みを捨てないため）。
  `tests/news-countries-checks.test.mjs` が、粗いファイルと細かいファイルを実際に食わせて出荷ローダを走らせ、
  この一致を検査する。
  ⚠⚠⚠ **国の身元は 3 つの綴りで書かれ、解決器はその 3 つを受け付ける。** `countryStats` は
  **ISO 3166-1 alpha-3 を鍵**にし、各行は同じ標準の他の 2 形——`a2`（alpha-2）と `ccn3`（numeric）——を
  持つ。`resolveCountrySync`（`js/atlas-console.js`）はまず `_idCountry()` でこの 3 形を引き、
  当たらなければ従来どおり `nameEn`/`nameJp` を採点する。⚠ **鍵そのものを受け付けていなかった間、
  Atlas が渡した `DEU` はどの国にも当たらず、`resolveCountry` がその文字列をジオコーダへ送り、
  返ってきた点が乗っていた国（ベルギー）を無検証で採用していた**（日本はベナンに、英国は消えた。
  実測は `DEV-NOTES.md`）。⚠ **識別子の形をしていて店が知らないものは、間違った識別子であって
  地名ではない**ので、そこでジオコーダへは行かず `null` を返し、呼び出し側が「見つからず」に名前を
  並べる——highlight 経路が既に定めていた「誤った ID は申告し、コードは直さない」を、
  6 つの dispatch が共有するこの解決器にも効かせたもの。地名（「バイエルン」→ ドイツ）の経路は変えない。
  ⚠ **国の範囲は 2 つあり、答える問いが違う。** `bbox` は**その国が在る場所**（home extent）で、
  カメラを向ける先。`bboxAll` は**その国が土地を持つ全ての場所**の union で、当たり判定の
  足切りにだけ使う（部分集合にしてはならない）。分けるのは `js/country-extent.js`——国の label 点が
  入るパートを錨にし、**3° 以内で連なるパート**と**国土の 1/3 以上を占めるパート**だけを拾う。
  ±180 をまたぐ国は、東端が 180 を越える**区間**として書き下す（ロシアは 26.9°E → 191.0°E）。
  ⚠ union を枠に使うと 252 コードのうち **32 が枠を失う**（実測：25 が OUTLIER 規則で拒否され
  `country` zoom 4.4、7 が「巨大」で zoom 3.2）。`js/search-geocode.js` はこの箱に `homeExtent` の
  印を付け、`js/place-framing.js` はその印があるとき OUTLIER 判定を飛ばす——もう刈ってある箱に
  外れ値の推測を当てないため。`tests/place-framing-checks.test.mjs` が同梱の CShapes 181 件を全件歩いて
  「地球の有り得ない割合を占める枠は 1 つも無い」を検査する。
  ⚠ **後から作られた行は「現在の値」を持って現れる。** アップグレードは起動から 3〜15 秒後に走るので、
  そのとき時計が過去にあれば、新しい行だけが**その年ではなく現在**を語る。世界銀行の下限 1960 年より
  前は重ね合わせが**1回しか走らない**ので、直す機会が二度と来ない（実測: 1860 年の一覧が
  「1 シンガポール $501B・3 香港 $382B」で始まっていた）。⇒ 行を作ったアップグレードが
  `IntMapTimeCountries.reapply()` を呼び、画面の年へ引き込む。**現在のスナップショットは追加式**で、
  行が現れた時点で取られる（一度きりだと「現在へ戻す」でその行だけ空になる）。
- **地名検索の結果カードは「同じ地物は 1 行」で束ねる。表示文字列の衝突では束ねない。**
  `js/search-geocode.js` の `doGeocode` は同梱の候補と 3 つのジオコーダ（Open-Meteo・Nominatim・Photon）を
  1 枚に並べ、行を足すたびに `_sameFeature` で既存の行と突き合わせる。同じ地物とみなすのは
  ① **同じ OSM オブジェクト**（Nominatim と Photon は `osm_type`/`osm_id` を返す）、または
  ② **種別**（`js/place-framing.js` の `placeClass`。GeoNames の PPLA と OSM の city は同じ `city`）・
  **名前**（`js/atlas-geo-resolve.js` の `placeRules.nkey` で幅・大小・発音区別符号を畳む）・**場所**
  （片方の点がもう片方の extent の中にあるか、その種別へ飛ぶズームで 2 点の差がカードの枠余白
  `FRAME_PAD_PX`＝`gotoPlace` の padding 以内）が全部一致するとき。束ねるときは**多くを知っている行**
  （確認済みの home extent ＞ 提供者の extent ＞ 無し、次に種別の有無）が残り、表示中の行はその場で
  書き換わる——どのジオコーダが先に答えたかでカードが変わらない。⚠ 以前の鍵
  「ラベル＋座標を 0.01° に丸めたもの」は、セルの境をまたぐ 2 点を何 m 近くても分け、
  1 語違うラベルは何も束ねなかった（実測：「Kyoto」で京都駅の 3 ノードが 2 行、Open-Meteo の京都市が
  別行）。⚠ **同じ名前の別の物は束ねない**——京都市と京都駅は 2 行として残る。検査は
  `tests/search-result-dedupe-checks.test.mjs`（実測した 3 提供者の応答で出荷の `doGeocode` を走らせ、
  全行を押して行き先を数える。到着順 3 通り）。
- **地名検索の各行は、ラベルの下に「何であるか」を控えめに添える。** Photon のラベルは名前・市・州・国
  だけで種別を含まないので、京都市と京都駅はどちらも「Kyoto, Kyoto Prefecture, Japan」と読めた。
  各行の 2 行目（`.ms-kind`）は、その行について既に計算している `placeClass` の答えを
  `js/place-framing.js` の `classNames()`（`PLACE_ZOOM` の全キーに en＋jp の名前。名前はその分類に
  入るもの全体を述べる——`station` は railway=* 全部なので「Station / railway」）で読んだもの。
  ⚠ **同じ種別で名前が畳むと同じになる行が他にもあるとき**だけ、提供者自身の行政の連なり
  （Photon の county・city・district・locality、Open-Meteo の admin2〜4。粗い順）から、ラベルに出て
  おらず相手の行に無い最初の地名を足す（実測：Photon の「Kyoto」駅と地下鉄の「Kyōto」駅は
  「Minami Ward」と「Shimogyo Ward」）。行は到着のたびにカード全体を塗り直す——相方が後から来るため。
  種別を答えられない行（GeoNames の AIRH・PRK など）には何も書かない。検査は
  `tests/ui-a11y-polish-checks.test.mjs` ①②（`zoomTable()` の全キーに名前があること／実測した応答で、
  畳んだラベルの地名集合と 2 行目が一致する行が無いこと。en と jp・到着順 3 通り）。
- **「行がある」と「一覧に出る」は別の主張で、あいだに主権フラグが1枚ある。** `countryGeo` の全 id が
  `countryStats` に行を持つこと（上）は、その国が **Countries 一覧に出ること**を意味しない——
  `renderStats` は `sov!==false` で絞るからである。このフラグは `_mkStat()` が **1 か所で**書き、
  **5 ファイル 6 か所**が読む（`js/countries-ui.js` の一覧・`js/stats-compare.js` の比較ピッカー・
  `js/atlas-console.js` の国名解決と順位付け・`js/atlas-examples.js` の起点チップ・
  `js/time-borders.js` の `tagSame`）。**1 枚のフラグが 6 か所を同時に消す。**
  ⚠ **Natural Earth の `TYPE` が、視点ごとの `FCLASS_*` より上位である。** 同じ行が矛盾することが
  あり、実際に矛盾している——ノルウェーは `TYPE:"Sovereign country"` と `FCLASS_TLC:"Unrecognized"`
  を同時に持つ。`FCLASS_*` は**その多角形をある視点がどう分類するか**であって国家の存否ではなく、
  ノルウェー自身の `WOE_NOTE`（「Svalbard・Jan Mayen・Bouvet を含まない」）がその視点差の理由を
  書いている（`ISO_A3`/`ISO_A2`/`ISO_N3` が `-99` なのも同じ理由）。**この family が主権の欄で
  ないことはファイル自身が示している**——ソマリランドと北キプロスは `FCLASS_ISO:"Unrecognized"` かつ
  `FCLASS_TLC:"Admin-0 country"` という逆の並びを持ち、一覧に出ている。
  実測: FCLASS 分岐が立つのは 110 m で 4 件・10 m で 13 件、**ノルウェー以外はすべて既に**
  `TYPE:"Indeterminate"`（Scarborough Shoal・Serranilla・Bajo Nuevo・Bir Tawil・Wake・Siachen・
  南パタゴニア氷原・キプロス緩衝地帯）なので、TYPE を上位に置いても**各縮尺で判定が動くのは 1 件だけ**。
  ⚠ **不変条件: 地図が「国」として描くものは、Countries 一覧に行がある。** 「国」は名前の一覧では
  なく **Natural Earth 自身の `TYPE`**（`Sovereign country` / `Country`）から導く。
  `tests/news-countries-checks.test.mjs` が TYPE × FCLASS の全組合せを出荷ローダに食わせてこれを検査し、
  `tests/r410.spec.js` の Countries 一覧ステップが**実際の DOM の行**と `countryGeo` を突き合わせる。
- **失敗したフィードと、止まったフィードは違う。** 止まったフィードは全部の計器が「成功」を報告する。
  年齢を必ず測って印字する（§7.1）。
