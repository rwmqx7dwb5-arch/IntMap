# IntMap — ファイル台帳 (Files)

> **どのファイルが何をしているか**の一覧。`Architecture.md` §3 の本体をそのまま移したもので、
> **節番号は Architecture 側と同じ**（`§3.1`〜`§3.13`）——他の文書からの `§3.x` という参照が
> そのまま生きるようにしてある。
>
> - **正本**: このファイル。`js/` にファイルを足したら**同じコミットで**ここに1行足す。
> - **読む人**: 実装に入る前に「触るファイルはどれか」を知りたい人。
> - **更新条件**: `js/` / `css/` / `src/` / `data/` / `supabase/` / `scripts/` / `tests/` /
>   `.github/` にファイルを追加・削除・改名したとき。
> - `scripts/arch-files-check.mjs` が `js/` の実体とこの台帳を突き合わせる。
> - 全体像・データフロー・不変条件は [`../Architecture.md`](../Architecture.md)。

---


> ⚠ **`js/` の一覧は `node scripts/arch-files-check.mjs --check` が実体と突き合わせる。**
> ファイルを足す・改名する・分割するときは、ここも同じコミットで直すこと。
> 各ファイルの1行説明は、そのファイル自身の先頭コメント（`IntMap · …`）と同じ主題にする。

### 3.1 ルート

```
index.html                      公開用SPAのマークアップ＋ブート script（919行）。アプリ本体は js/app-body.js
admin.html                      管理コンソール（geo_pins / dashboard_cards / コミュニティ通報 / feedback）。
                                バンドラを通らない独立ページ。Supabase SDK は同梱版を読む
sw.js                           Service Worker。タイル等のキャッシュとオフライン補助。キャッシュ名は
                                バージョン付きで、activate が旧世代を消す。cache-first の対象は
                                「自分が知っているホストの、不変なタイル」だけに限定する
science.html / sources.html     読み物2ページ（手法の説明・出典の一覧）。バンドラを通らないので
                                言語一覧は scripts/i18n-langs.mjs が生成する js/locales/_langs.js から読む
google….html                    Google Search Console 認証用
package.json / package-lock     npm スクリプトと依存。dependencies がアプリに入る依存の唯一のリスト
.nvmrc                          Node のバージョン（CI・ローカル共通）
vite.config.js                  ビルド設定（チャンク分割・静的アセットのコピー・prebuild フック）
playwright.config.js            hermetic なブラウザ試験（webServer=scripts/serve.mjs）
playwright.prod.config.js       実 URL に対する本番スモーク（webServer 無し・retry 3）
CLAUDE.md                       Claude Code が毎セッション自動で読む恒久指示（作業の進め方・ワークフロー・
                                確認要件・報告要件・作業終了処理）。⚠ 秘密情報を書いてはならない
                                （このリポジトリは public）
CLAUDE.local.md                 同じ機構のローカル上書き。**追跡対象外**（.gitignore ＋ .git/info/exclude）。
                                公開できない資格情報だけを置く
CONSTITUTION.md                 標準指示（最優先のルール集）
Architecture.md                 本ファイル（現状仕様書）
DEV-NOTES.md                    直近ラウンドの開発記録（新しい順）
DEV-NOTES-ARCHIVE.md            それ以前の全記録（古い順・追記しない）
PRODUCT.md                 Atlas の到達目標と実装状況の対応表
README.md                       公開向けの紹介（英語）
SECURITY.md                     脆弱性の報告方法と、公開値・秘密値の区別
LICENSE
koppen_mercator_*.png           ケッペン気候区分のベース画像（期間別）
koppen_mercator_*_4k.png        同・軽量版（携帯はこちらを使う。フル解像度は携帯で RAM 超過）
precip_mercator_1981-2010.png   年降水量の平年値（CHELSA V2.1 bio12）。_4k は軽量版
og-image.jpg / IntMap.Icon*.png OGP 画像とアイコン
TwemojiCountryFlags.woff2       国旗グリフ
USGS.能登.pdf                    地震モデルの検証に使った公表資料
_koppen_convert.py              ケッペン TIFF → PNG（データ前処理。実行時には不要）
_precip_convert.py              CHELSA → メルカトル PNG（同上）
_precip_years_convert.py        GPCC → 年別 PNG（同上）
_rail_convert.py                鉄道データ変換（同上）
```

### 3.2 `css/` / `src/` / `fonts/`

```
css/
  intmap.css                        アプリのスタイルシート全体
  pages.css                         読み物2ページ（science.html / sources.html）のスタイル
  fonts.css                         同梱フォントの @font-face
src/
  main.js                           js/ を index.html と同じ順序で import するエントリ
  vendor.js                         npm 依存を従来と同じグローバル名で再公開し、Supabase クライアントを作る
  locale-boot.js                    import.meta.glob('../js/locales/ui.*.js') で言語をディレクトリから読む（lazy）
  sat-worker.js / sat-worker-client.js      衛星の軌道計算（SGP4/SDP4）をワーカーで回す
  tsunami-worker.js / tsunami-worker-client.js  津波の伝播計算をワーカーで回す
  satellite-wasm-stub.js            satellite.js の wasm 経路を使わないためのスタブ
fonts/                              Inter（サブセット woff2 ＋ MapLibre 用 pbf グリフ）と Pretendard
```

### 3.3 `js/` — 中核

```
app-body.js                       アプリ本体（392 KB・最大のファイル）。状態宣言・ブート・地図構築・
                                  DOM 配線・map.on() ハンドラ・IntMapOS・セッション永続化・IM_HOST。
                                  ⚠ 新規機能はここに足さない。§3.13 の手順で別ファイルへ
geo-engine.js                     レンダラの継ぎ目そのもの window.IntMapGeoEngine（178 KB）
runtime.js                        1つのフレームループ・1つのタイマー・1つのライフサイクル
lazy-modules.js                   押されてから取りに行くモジュール window.IntMapLazy。⚠ 指定子はすべてリテラル
engine-select.js                  このセッションがどのエンジンで走るかを DOMContentLoaded 前に決める
cesium-engine.js                  第2エンジン——同じ契約の裏で動く CesiumJS
cesium-style.js                   style 言語の解釈器（式・フィルタ・色）。純粋なので Node から検証できる
cesium-layers.js                  Cesium のプロバイダとレイヤー描画
cesium-vector-tiles.js            第2エンジンのベクタタイル
cesium-input.js                   Cesium のカメラを MapLibre のジェスチャで動かす
i18n.js                           window.IntMapI18N — キー付き UI 表の組み立て
i18n-late.js                      後から足す翻訳と、ティッカー自身の設定パネル
lang-registry.js                  言語の唯一のリスト window.IntMapLang（code / label / html / alias と pick）
lang-switch.js                    言語変更は「待てるイベント」——文字列が届く前に描き直さない
locales/_langs.js                 生成物。読み物2ページ用の言語コード一覧（scripts/i18n-langs.mjs が書く）
locales/ui.<code>.js              1言語＝1ファイルの UI 文字列表（9言語）
locales/pages.<code>.js           読み物2ページの文字列表（9言語）
page-i18n.js                      読み物2ページの言語機械 window.IntMapPageI18N
sources-list.js                   sources.html の出典レジストリ（生成された一覧）
```

### 3.4 `js/` — 地図の表面

```
map-ui.js                         地図の周りの UI（レイヤーレジストリ／レイヤーサイドバー／ティッカー／
                                  レイヤープリセット／ラベルのポップアップ／GeoJSON 取り込み／共有ハッシュ）
map-tools.js                      対話ツール（投影ビュー・描画・Isolate・海路・見通し線・オブジェクト一覧・
                                  アウトライン・図形移動・到達圏（車・徒歩・自転車・公共交通）・3-D 弧）
map-readout.js                    座標・標高・レイヤー値・コンパスの読み出しと経緯線
map-extras.js                     残りの自己完結した地図表面モジュール
map-pick.js                       地図上の1点を拾う window.IntMapPick
map-typography.js                 このアプリの文字——どの書体が描き、どれだけの幅で出るか
place-labels.js                   地名・海洋名ラベルと、そのローカライズ
label-scale.js                    ラベルの大きさ window.IntMapLabelScale
compass.js                        方位の呼び名（9言語・16方位）window.IntMapCompass
chronos.js                        Chronos＝統一時間カーネル window.IntMapTime
label-occlusion.js                名前を最前面に、地球の裏側のマーカーを隠す
border-style.js                   国境線を1本にまとめるスタイル層
coast-line.js                     海岸線・湖岸線——国境線と同じ手法で makeCoastLine()
grid-style.js                     経緯線のスタイル層
layer-dropdown.js                 レイヤーメニューとそのアコーディオン
layer-favs.js                     ★を付けたレイヤーとクイックピックのチップ
layer-previews.js                 レイヤーのサムネイル IntMapLayerPreviews
tile-warm.js                      カメラがこれから必要とするタイルを温める
wheel-zoom.js                     ホイールと、地図がどれだけ速く応えるか
view-controls.js                  傾きの上限と、視点高度の読み出し
map-projection.js                 投影——地球儀か平面か。平面地図は必ず巻き、それが再確認され続ける
basemap-switch.js                 携帯のベースマップ切替 window.IntMapBasemapSwitch
opening-view.js                   アプリが開く視点——黒い地球ではなく、光の当たった地球
theme-sky.js                      テーマと空——アプリの色と、太陽の位置
sky-model.js                      空自身の色（Rayleigh ＋ Mie を march する）
limb-layer.js                     このアプリが描く大気の縁 IntMapModules.limbLayer
night-side.js                     地球の夜側 window.IntMapNightSide
world-base.js                     全球衛星ベース window.IntMapWorldBase
satellite.js                      衛星画像コントローラ
sat-proto.js                      衛星タイルの imapsat:// スキーム
solid3d.js                        地図の上に立つ閉じた立体
streamline.js                     地理的なベクトル場の流線 window.IntMapStreamline
coast-mask.js                     求めた解像度での海岸線 window.IntMapCoastMask
land-mask.js                      同梱の陸／海マスク window.IntMapLandMask
bathymetry.js                     同梱の海底地形 window.IntMapBathymetry
dem-source.js                     標高の出所と深さ（terrarium の native max = z15）
geodesy.js                        極と日付変更線に安全な幾何 window.IntMapGeodesy
```

### 3.5 `js/` — データレイヤー

```
data-layers.js                    データレイヤーの目録＋エンジン（495 KB）。GROUPS が棚を決める
layer-packs.js                    追加レイヤーパック（地球と空／土地被覆／ベータ2／宗教・言語／
                                  タイムゾーン／GIBS の科学プロダクト）
wb-layers.js                      世界銀行指標の塗り分けと最新統計の更新
world-packs.js                    世界データ層——貿易・エネルギー・気象警報・潮汐・作物（282 KB）
precip-annual.js                  年降水量——国別平均ではなく実測グリッド
ocean-currents.js                 海流——同梱のアトラス盤
ocean-currents-field.js           海流——場のファイルの復号とストライド
osm-facilities.js                 実地調査された施設 IntMapFacilities
datacenters.js                    データセンターと AI インフラ IntMapDataCenters
cameras.js                        ライブカメラ層 IntMapModules.cameras
beta-overlays.js                  ベータのオーバーレイ IntMapModules.betaOverlays
time-borders.js                   時間軸の上の歴史的国境 IntMapTimeBorders
time-countries.js                 時計の年から見た Countries タブ
history.js                        歴史的国家／同一性／マディソン系列
us-elections.js                   すべての米大統領選挙 IntMapUSElections（州をクリックするとその州の票と選挙人）
industry-web.js                   産業の相関 window.IntMapIndustry
companies.js                      企業データセットと時価総額のライブ算出 IntMapCompanies
reference-data.js                 参照データ表
tables.js                         参照データ表（大きい方）
gazetteer.js                      ニュース地点解析の内蔵ガゼッティア
```

### 3.6 `js/` — ニュース

```
news-feed.js                      ニュースの取得・キャッシュ・見出しの翻訳
news-ui.js                        ニュース一覧・ピン・リーダー
news-context.js                   記事 → 場所／媒体の解決
news-sources.js                   どの媒体からニュースを取るか window.IntMapNewsSources
news-timeline.js                  ニュースのタイムマシン用タイムライン帯
newsgeo.js                        NewsGeo — 決定論的（非AI）のニュース地点解析
article-reader.js                 サイドバー内の記事リーダー
```

### 3.7 `js/` — Atlas と AI

```
atlas-persona.js                  Atlas の人格の**正本**（名前・立場・由来・性格・対人姿勢・事実優先・
                                  意見・感情表現・自己設定・非開示。全 system prompt の先頭に入る唯一の写し）
atlas-console.js                  Atlas カーネル（自然言語コンソール／OS コマンド面。846 KB）
atlas-controls.js                 Atlas — 実 UI コントロールとモジュールメソッドへの全操作面
atlas-geo-resolve.js              Atlas — 場所・地域の解決とカメラの寄せ方
atlas-reply.js                    Atlas — 返答の描画（安全な markdown・コード／数式・GFM 表・出典カード）
atlas-sims.js                     Atlas — 飛行・弾道・爆風・標高・勢力のアニメーション表示
atlas-sources.js                  Atlas — 外部の証拠源（首脳・ライブニュース・POI カタログ）
atlas-verify.js                   Atlas — 回答のコード側検証（内容分類・算術・出典・地図化の可否）
atlas-attach.js                   Atlas — 添付ファイルの正体判定と全画面ビューア
atlas-msg-tools.js                Atlas — メッセージごとの操作バー（コピー／再試行／編集）とその場編集
atlas-loader.js                   Atlas に手を伸ばすと Atlas を取りに行く window.IntMapAtlas
ai-core.js                        Atlas の AI 通信・利用枠・設定
```

### 3.8 `js/` — 分析・パネル・シミュレーション

```
analysis-panels.js                分析パネル（時系列・AIリサーチ・相関・世界の出来事・学習モード）
stats-compare.js                  多国統計比較 IntMapStatsCompare
countries-ui.js                   Countries タブと国の詳細
companies-ui.js                   Companies タブ・比較ビュー・ダッシュボード
dash-extended.js                  ダッシュボードのキャッシュと拡張情報カード
widgets.js                        ウィジェット板の入口 IntMapModules.widgets ——
                                  HOST との接続と window.IntMapWidgets2 の公開契約だけを持つ
widget-core.js                    ウィジェット基盤の中核 IntMapWidgetCore ——
                                  定義レジストリ・WidgetContext・状態モデル（12状態）・
                                  DOM ツールキット（innerHTML 連結の経路が無い）・自前SVGアイコン・
                                  盤面で1本だけ動く共有ティッカー
widget-store.js                   保存と移行 IntMapWidgetStore —— intmap_widgets4 /
                                  intmap_widgets3 からの無損失移行（冪等）/ config 検証 /
                                  前回成功データの TTL キャッシュ
widget-scheduler.js               更新スケジューラ IntMapWidgetScheduler —— requestKey ごとに1要求・
                                  共有 Promise・TTL・stale-while-revalidate・abort・指数バックオフ・
                                  IntersectionObserver による可視性管理
widget-render.js                  レンダーキット IntMapWidgetRender —— カードが取りうる7つの形
                                  （値・時系列・一覧・地理・警報・記事・カレンダー＋進捗）
widget-defs-time.js               定義：時計・進捗・月・太陽・カレンダー・カウントダウン（全て局所計算）
widget-defs-data.js               定義：天気・大気/UV・地震・国・人口・祝日・知識・宇宙
widget-defs-markets.js            定義：為替・暗号資産・Fear&Greed・金銀・Bitcoin ネットワーク
widget-defs-map.js                定義：地図中心／縮尺／おすすめレイヤー、および IntMap 固有の
                                  9種（有効レイヤー・表示範囲の状況・地図上のニュース・保存地点の警報・
                                  国のウォッチ・地域監視・経路・Atlas ブリーフィング・Chronos）
widget-layout.js                  盤面 IntMapWidgetLayout —— S/M/L グリッド・並べ替え（ポインタと
                                  キーボード）・スタック・カードメニュー・Undo・設定フォーム
widget-gallery.js                 追加ギャラリー IntMapWidgetGallery —— 検索・カテゴリ・実レンダラーの
                                  プレビュー・サイズ切替・追加前設定（プレビューは通信も権限要求もしない）
widget-smart.js                   Smart Stack IntMapWidgetSmart —— 文脈による決定論的な優先順位と
                                  「なぜ表示されたか」の説明、切替のちらつき防止
tool-panel.js                     計測／半径ツールのパネルと地図のコンテキストメニュー
elevation-profile.js              標高断面のパネル
sims.js                           物理シミュレーションと太陽幾何（放射性物質拡散・範囲人口・傾斜・
                                  日照・鉄道の到達圏）
seismic.js                        地震波シミュレータ（477 KB）
seismic-events.js                 過去の地震——公表された震源パラメータ
seismic-site.js                   場址項は周波数の関数である window.IntMapSiteAmp
seismic-subfault.js               破壊は1枚のすべる矩形ではない window.IntMapSubfault
earth-structure.js                この地震は何で、その下に何があるか window.IntMapEarth
fault-geometry.js                 描かれた輪郭は断層面の投影である window.IntMapFaultGeom
vs30-mask.js                      同梱の場址項 window.IntMapVs30
tsunami.js                        津波の伝播 window.IntMapTsunami
terrain-water.js                  地形の編集と水の流れ（194 KB）
water-dynamics.js                 水は届くまでに時間がかかる window.IntMapWaterDynamics
insolation.js                     地形の影と日照時間のエンジン
viewshed.js                       電波・通信圏／見通し線——同じ可視領域の2つの解析
volume3d.js                       Measure ▸ 3-D 体積——実スケールの箱が空中に立つ
river-course.js                   どの区間が同じ川か window.IntMapRiverCourse
drone-nav.js                      ドローン航法——地形を見た飛行計画
drone-ops.js                      ドローンの運航条件 window.IntMapDroneOps
routing.js                        車／徒歩／自転車／公共交通の経路計算と地図描画 IntMapRouting
routing-store.js                  経路の唯一の状態 window.IntMapRouteStore（Atlas とパネルが共有）
routing-providers.js              各ルーターが実際にできること window.IntMapRouteProviders
routing-geocode.js                地点の候補検索・順位付け window.IntMapRouteGeocode
routing-cards.js                  経路候補カード／手順／区間の共通描画 window.IntMapRouteCards
routing-export.js                 GPX・GeoJSON・共有状態 window.IntMapRouteExport
routing-ui.js                     経路パネル（Layers ▸ Tools ▸ Directions・遅延取得）window.IntMapRouteUI
routing-ops.js                    経路の分析 window.IntMapRoutingOps
```

### 3.9 `js/` — 宇宙・空

```
space.js                          宇宙エクスプローラ window.IntMapSpace（220 KB）
space-bodies.js                   ほかに何があるか（探査機・小惑星・太陽系外）window.IntMapSpaceBodies
space-cosmos.js                   太陽系の外へ出る距離の梯子 window.IntMapCosmos
space-events.js                   天文現象 window.IntMapSpaceEvents
space-sky.js                      地球の背後の実際の星空 window.IntMapSky
ephemeris.js                      惑星の実位置 window.IntMapEphemeris
night-sky.js                      地上の1点から見た空 window.IntMapNightSky
satellites-live.js                ライブ衛星 window.IntMapSatellites
satellite-detail.js               ライブ衛星——クリックの先の詳細カード
orbit-points.js                   衛星が実際にいる場所——軌道上の点
aircraft-detail.js                ライブ航空機——クリックの先の詳細カード
```

### 3.10 `js/` — シェル・アカウント・その他

```
mobile-ui.js                      モバイル UI とレスポンシブのシェル
window-manager.js                 浮遊パネルのドラッグ／リサイズ／重なり順
workspace.js                      浮遊ウィンドウのワークスペースモード（デスクトップ）
session-tabs.js                   タブバーと、その裏の OS 登録と、両方を復元するセッション
keyboard-shortcuts.js             キーボードと、それを一覧するカード
onboarding.js                     ウェルカムカード・案内デモ・進捗コントロール
screenshot.js                     スクリーンショットのボタン
sidebar-style.js                  左サイドバーの材質（不透明／フロスト2種）と、フロスト時にカメラへ渡す左 inset
search-geocode.js                 検索欄——問い合わせの前処理・ジオコーディング・結果カード
compare.js                        並べて／スワイプで比べる地図 IntMapCompare
playground.js                     Playground (beta) IntMapModules.playground
flight-sim.js                     フライトシミュレーター IntMapFlightSim（238 KB）
street-view.js                    ストリートビューのパネルと実カバレッジ IntMapStreetView
community.js                      コミュニティのフィード
community-board.js                コミュニティ板——一覧・カード・投稿・地図層
feedback.js                       フィードバックとバグ報告のモーダル
auth-ui.js                        アカウント・認証・Supabase のブート
legal-text.js                     利用規約とプライバシーポリシーの**本文**（唯一の写し。JA/EN）
legal.js                          その本文をアプリ内モーダルに表示する
legal-page.js                     同じ本文を privacy.html / terms.html として出す（chrome は9言語）
premium-plan.js                   プレミアムの節——ただしその全機能が無料である
monitors.js                       Area Monitors IntMapMonitors
weather.js                        気象 IntMapModules.{wind,weatherEC,weatherPanel}
wx-source.js                      ガードされた唯一の気象／UV ソース window.IntMapWx
wx-ecmwf.js                       ECMWF IFS モデル本体 window.IntMapECMWF——予報時刻軸・.om URL・復号済みの場・配色表
wx-wind.js                        風の粒子レンダラ window.IntMapWindGL——WebGL 1描画呼び出し／実経過時間基準
place-framing.js                  どこまで寄るか window.IntMapPlaceFraming
proxy-fetch.js                    CORS プロキシ経由の取得（相手先ごとに効くものが違う）
perf-hud.js                       実機の計器 `?perf=1`
admin-literal.js                  admin.html の初期データ読み取り——**評価器ではなくパーサ**
```

### 3.11 `data/`

```
admin1-world.json.gz              世界の第1級行政区画（Natural Earth 10m 由来・247か国 4,515区分・2.38 MB）。
                                  気象警報レイヤーが「発令なし」を区分単位で塗るための索引で、警報の
                                  形を引く最後の段でもある。生成は scripts/build-admin1.mjs
gazetteer-world.json.gz           世界の地名の長い尾（cities1000 由来・18言語）。必要になった時に取得する
gazetteer-phone.json.gz           携帯が取りに行くのはこちら。上のファイルの先頭 12,000 行を切り出したもの
ecoregions_2017.geojson / .js     エコリージョン（自前ホスト）
railways_gauge.json               世界の鉄道（軌間別）
volcanoes_gvp.json                火山（Smithsonian GVP 完新世）
crust1.bin.gz / .json             CRUST1.0（地殻構造）
slab2.bin.gz / .json              Slab2（沈み込み帯のスラブ面）
tectonics.bin.gz / .json          PB2002（プレート境界）
vs30.png / vs30-phone.png / .json 場址項 Vs30 のラスタ
bathymetry.png / .json            海底地形
land-mask.png / .json             陸／海マスク
precip-mm.png / .json             年降水量の値格納ラスタ（8bit の log(mm)）と、その格子・帯・色
precip-year.png / .json           年別の年降水量（1枚に縦積み）
hdi-series.json                   HDI（UNDP）193か国 × 1990–2022
maddison.json                     マディソン・プロジェクトの歴史 GDP・人口
data/cshapes.js                   歴史的国境
us-elections.json / us-states.json  米大統領選挙（60回・州別2,342行の得票と選挙人つき）
religion.json / language.json     宗教・言語の分布
osm-space.json / osm-diplo.json   宇宙基地・地上局／外交公館の全球スナップショット
ocean-currents*.bin.gz / .json    海流の場
stars.bin / stars.json / deep-sky.json / planets/ / planets.json / moons.json /
  planet-names.json / small-bodies.json / spacecraft.json                星表・天体
basins_mrb.json                   主要流域
gibs-range.json                   GIBS 各プロダクトの実配信期間（二分探索で実測したもの）
world-basemap.jpg / .json         粗い全球衛星ベース
tle/                              衛星の軌道要素カタログ（定期生成の同梱スナップショット）
```

### 3.12 `supabase/` / `docs/` / `scripts/` / `tests/` / `.github/`

```
supabase/
  config.toml                     ローカル/CI 用（本番非接続）。⚠ Edge Function は全8本をここに宣言する
  migrations/*.sql                DB の唯一の設計図（7本）。本番変更は必ずここを通す
  seed.sql                        100% 合成のシードデータ
  tests/*_test.sql                pgTAP（構造 ＋ RLS/権限マトリクス ＋ 関数。6本）
  functions/<name>/index.ts       Edge Functions（8本。§6.2）
  functions/_shared/              関数ではないライブラリ（newsgeo.js / relay-guard.js）
docs/
  TESTING.md                      テストの分類と走らせ方
  RELEASE.md                      リリース手順（**配信方法の正本**）
  MONITORING.md                   監視と、鳴ったときに見る場所
  INCIDENT-RESPONSE.md            本番障害・セキュリティ事故の runbook
  DATABASE.md / MIGRATIONS.md / DATABASE.md / BACKUP-RESTORE.md / INCIDENT-RESPONSE.md
                                  DB の構造・変更手順・権限テスト・バックアップ・事故対応
  SECURITY-ARCHITECTURE.md        脅威モデル・データフロー・CSP（**セキュリティの正本**）
  TESTING.md             セキュリティ検査の走らせ方
  AREA-MONITORS.md                Area Monitors の運用
scripts/
  serve.mjs                       依存ゼロの静的サーバ（GitHub Pages と同じ配信＝gzip も含む）
  static-checks.mjs               構文・JSON・YAML・マージ衝突・秘密検出・HTML 参照の存在
  doc-facts.mjs                   **文書間の固定事実の照合**（§15.5）
  atlas-catalog.mjs               **Atlas の操作カタログのゲート**（`PRODUCT.md` §3.4・ディスパッチャ ⇄ SYS）
  arch-files-check.mjs            Architecture §3 と js/ の突き合わせ
  master-sync.mjs                 **原本（main worktree）が merge 後の状態か**を見る（`npm run master:check` / `master:sync`）。
                                  原本の場所はハードコードせず `git rev-parse --git-common-dir` から導出する。
                                  ⚠ **branch を切り替えない。** 原本は「`main` の置き場」で作業場ではない
                                  （`CLAUDE.md` §6）。`main` 以外にいるときは何もせず報告する。
                                  ⚠ **未コミットの変更が「邪魔か」を判定するのは git。** 早送りが触らない
                                  ファイル（他セッションの `.claude/launch.json` など）は素通りさせ、実際に
                                  上書きになるときだけ `git merge --ff-only` 自身の理由を出して止まる。
                                  `--check` も「遅れている」と「汚れている」を分け、汚れは**警告**で exit 0。
                                  ⚠ **早送りだけ＝冪等**なので並行セッションが同時に走らせてよく、
                                  排他ロックを必要としない。
                                  ⚠ `npm test` には入れない——CI のチェックアウトは detached な PR ref。
  worktree.mjs                    **セッションの作業場**（`status` / `new <slug>` / `done`）。`CLAUDE.md` §6 が
                                  手作業で求めていた 6 工程——空きラウンド番号・branch・OneDrive 外の
                                  worktree・`node_modules` の junction・preview 設定——を 1 コマンドにする。
                                  原本の場所は `master-sync.mjs` と同じく `--git-common-dir` から導出。
                                  ⚠ **空き番号は 5 つの出典から取る**（`DEV-NOTES.md`・branch・worktree・
                                  `launch.json`・`tests/`）。索引だけを見ると **merge 済み**しか見えず、
                                  いま走っている `feat/r<N>-…` と衝突する（過去 3 回）。
                                  ⚠ `done` は **`git worktree remove` のエラーを判定にしない**——原本の
                                  `.git/worktrees/` は OneDrive が掴んでいて消せないので、`prune` してから
                                  一覧に訊く。branch は `-d`、断られたら `origin/main` と**木を比べて**
                                  同一のときだけ消す（§5 は `--squash` で merge するので `-d` は必ず断る）。
                                  ⚠ `status` は**前夜の deep tier の判定**も出す（`scripts/deep-alarm.mjs` と
                                  同じ答え）。`gh` が無い・未ログイン・オフラインは**黙って省略**し、
                                  6 秒で打ち切る——`status` は決して非ゼロで終わらない（#R304）。
  engine-coupling.mjs             レンダラ脱依存のゲート
  i18n-*.mjs                      翻訳の被覆と形の監査（§10）
  eol.mjs                         ソース検査は**バイト列ではなく内容**を読む（改行はチェックアウトの性質）
  build-*.mjs                     data/ の生成（実行時には不要）。`build-admin1.mjs` は Natural Earth 10m
                                  admin-1 を 0.01°（≈1.1 km）で間引いて data/admin1-world.json.gz を書く
  run-tests.mjs / test-parallel.mjs / shard-plan.mjs / test-budget.mjs   テストの実行と予算
  tiers.mjs                       core / deep の**分割は価格**（`CORE_MAX_S`＝1秒）。実測 core 6 本 / deep 59 本。
  baseline.mjs                    main の前回結果と突き合わせ、**その失敗が main にも在るか**を言う
  deep-alarm.mjs                  **nightly の deep tier が赤いことを人に届ける**（ci.yml の `deep-alarm` job）。
                                  赤→ Issue を開く／**本文を今夜の失敗テスト名で書き直す**（shard の
                                  `junit.xml` から採る）、緑→ 閉じる。**1本を書き直す**——毎晩コメントを
                                  足すのは同じ沈黙を大きな字で書くだけ。⚠ `cancelled` は合格ではない。
                                  ⚠ 実測: 2026-08-08〜08-21 の nightly は**14回連続で赤**、集約ジョブは
                                  毎回正直に報告していた——誰も見ていなかっただけ（#R304）。
  backup-db.sh / restore-test.sh  DB のバックアップと隔離復元
tests/
  tests/smoke.spec.js                   hermetic なスモーク
  tests/internal-qa.spec.js             内部 QA（IntMapAtlasQA / IntMapRegionResolverTest / IntMapUIAudit）
  tests/prod-smoke.spec.js              実 URL に対するスモーク（PROD_URL）
  tests/security.spec.js                実ブラウザでの無害化確認
  helpers/network.js              hermetic なルーティングと console の分類
  r<n>-checks.test.mjs            ラウンドごとに追加された Node の回帰検査（135本）
  *.spec.js                       ブラウザ回帰（67本）
.github/workflows/
  ci.yml                          PR ＋ push main ＋ 手動。静的検査＋hermetic ブラウザ試験
  deploy.yml                      本番公開（**有効**。§15.4）
  rollback.yml                    手動ロールバック（履歴に実在する ref のみ）
  db.yml                          supabase/** 変更時の DB 検査（本番非接続）
  db-backup.yml                   休眠（Secret 2本が登録されるまで各 run skip）
  security.yml                    CodeQL ほかセキュリティ検査
  uptime.yml                      6時間ごとの死活監視＋Issue の自動起票／自動クローズ
  tle-refresh.yml                 衛星軌道要素スナップショットの定期更新
```

---

## 3.13 index.html の分割方式 — **今後の分割はこの手順に従うこと**

`index.html` は「マークアップ＋ブート」だけの状態にしてある。**新しい機能を `js/app-body.js` に足さない。**
新しい主題は新しいファイルにし、以下の規約を満たすこと。

### 手順

1. **切り出す単位は「継ぎ目」で選ぶ。** 大きい塊ではなく、外から見た依存が細い所で切る。
2. **ブロック全文をそのままファクトリで包み、代入なしで呼ぶ**：`window.X=(function(){ … })()`、
   あるいは `window.IntMapModules.x=function(HOST){ … }`。
3. **可変値はホスト・インターフェース `IM_HOST` 経由で読む。** クロージャ内で**再代入される**値
   （`currentLang` / `currentUser` / `currentProj` / `currentMapType` / `terrainOn` …）を値渡しすると
   古い値に固定される。`HOST.lang` のように毎回読む。
4. **不変値はファクトリ先頭で元の名前に束縛し直す**：`const imToast=HOST.imToast, …;`。
   本体は1文字も変えずに済む。
5. **`map` だけは第1引数**（boot 時に1回だけ代入され、全モジュール本体が裸の `map` を使うため）。
6. **パラメータ名は `HOST`**（`H` は既存の1文字識別子と衝突する）。
7. **書き込みが必要な値は RW メンバー**にする：`get x(){return x;}, set x(v){x=v;}` の1行ペア。
   変数の実体は元の場所に残る＝**単一の真実の源**。
8. **巻き上げが要る関数はシムを置く。** 元が巻き上げ関数宣言だったものは、`index.html` 側に
   `function f(){ return IntMapModules.x.f.apply(this,arguments); }` を置く（レシーバも引数もそのまま透過）。
9. **変数はエクスポートできない**（シムは関数にしか作れない）。

### `IM_HOST` の規約

- **メンバーは全て getter。** ⑴ **LIVE**：手順3の可変値が常に現在値になる。
  ⑵ **LAZY**：getter の本体は読まれるまで評価されないので、まだ定義されていない関数を掴まない。
- **RW メンバーは明示的に一覧を固定**する（`tests/r165-checks.test.mjs`）。増やすときはその一覧も直す。

### 「いつ取りに行くか」という第2の軸

置き場所とは別に、**起動時に読むか、押されてから取りに行くか**を決める。`js/lazy-modules.js` の
`window.IntMapLazy` が遅延モジュールを持つ（フライトシム／Playground／地震／津波／地形と水／
見通し線／ストリートビュー／夜空／Atlas カーネル）。

- ファクトリを呼んだ瞬間に**共有 UI を作らない**こと（レイヤー行やタブは、押される前に現れてはならない）。
- **入口が数えられること。** 右クリックメニュー・タブ・設定のボタン・Atlas の dispatch のどれから来ても
  同じ1つの入口に集まるようにする。出口（✕ / `close()`）も1つにする。
- 遅延モジュールは**開き終わったことを知らせる**。`OS.exec` が返す到着の Promise に繋ぐ——
  「終わった時刻を推定する」タイマーを書かない。

### 分割を守る検査

- `scripts/check-split-scope.mjs` … acorn で、手順3・7・9の不変条件を検査する。
- `scripts/static-checks.mjs` … 未読込のモジュール／呼ばれていないファクトリ／移設元の残骸を検査する。
- `tests/r162-checks.test.mjs` / `tests/r163-checks.test.mjs` / `tests/r165-checks.test.mjs` …
  ホストメンバーと RW 一覧を固定する。
- `tests/app-source.mjs` … 文字列一致の回帰テスト群が `index.html` だけでなく `css/` ＋ `js/` も読む。
- `tests/r163.spec.js` … **実ブラウザで実際に動かす**。静的検査だけでは束縛の誤りを捕まえられない。

---