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
_koppen_convert.py              ケッペン TIFF → PNG（データ前処理。実行時には不要）
_precip_convert.py              CHELSA → メルカトル PNG（同上）
_precip_years_convert.py        GPCC → 年別 PNG（同上）
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
  aviation-worker.js / aviation-worker-client.js  ライブ航空機の在庫（デコード・格納・時効・フィルタ・GPU バッファの pack）をワーカーで回す
  satellite-wasm-stub.js            satellite.js の wasm 経路を使わないためのスタブ
fonts/                              Inter（サブセット woff2 ＋ MapLibre 用 pbf グリフ）と Pretendard
```

### 3.3 `js/` — 中核

```
app-body.js                       アプリ本体（392 KB・最大のファイル）。状態宣言・ブート・地図構築・
                                  DOM 配線・map.on() ハンドラ・IntMapOS・セッション永続化・IM_HOST。
                                  ⚠ 新規機能はここに足さない。§3.13 の手順で別ファイルへ
geo-engine.js                     レンダラの継ぎ目そのもの window.IntMapGeoEngine（178 KB）
camera-math.js                    ↳ カメラ幾何。メルカトル投影・カメラから見た「目」の位置・
                                  飽和するピッチ・球で見上げたときのズーム下限。引数を取り数を返す
                                  だけ（状態も、レンダラの名前も持たない）。⚠ `gGuard` だけは
                                  レンダラに直接訊くので geo-engine.js に残り、`guard` として渡る
geo-command-log.js                ↳ レンダラ命令の集計と比較。attempted / sent / same / absent と、
                                  「同じ値をもう一度送るか」の判定。既定では数えない（?cmdlog=1）
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
map-tooltip.js                  地図のホバー用ツールチップ 1 面（`ensureMapTooltip` / `positionTooltip` /
                                `setMapTooltipHTML`）。アプリ中のホバー処理が全部これを `window` 経由で使う。
                                `js/app-body.js` から**まるごと**出したもので、幾何（クランプ・下側への
                                反転・`--tip-ax`）は #R175 の本文そのまま。⚠ 出した理由は `tests/r168 #8` の
                                shell 予算——**天井は上げず、同量以上を外へ出す**（#R195/#R196 の規則）
map-extras.js                     残りの自己完結した地図表面モジュール
map-pick.js                       地図上の1点を拾う window.IntMapPick
map-typography.js                 このアプリの文字——どの書体が描き、どれだけの幅で出るか
place-labels.js                   地名・海洋名ラベルと、そのローカライズ
label-scale.js                    ラベルの大きさ window.IntMapLabelScale
compass.js                        方位の呼び名（9言語・16方位）window.IntMapCompass
chronos.js                        Chronos＝統一時間カーネル window.IntMapTime
label-occlusion.js                名前を最前面に、地球の裏側のマーカーを隠す
border-style.js                   国境線を1本にまとめるスタイル層
carto-basemap.js                  CARTO 基図の API キー・タイル URL 組み立て・地図上の帰属表示
coast-line.js                     海岸線・湖岸線——国境線と同じ手法で makeCoastLine()
grid-style.js                     経緯線のスタイル層
layer-home.js                     カメラを動かしてよいレイヤーの表 window.IntMapLayerHome
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
subcable-info.js                  海底ケーブル／陸揚げ地点のクリック情報ポップアップ。
                                  **地図には一切描かない**（線の paint/layout を読み書きしない）。
                                  `js/data-layers.js` から動的 import されるので eager には入らない
ocean-currents-field.js           海流——場のファイルの復号とストライド
osm-facilities.js                 実地調査された施設 IntMapFacilities
datacenters.js                    データセンターと AI インフラ IntMapDataCenters
railways.js                       世界の鉄道 IntMapRailways（OSM の実タグ・6軸の塗り分け・駅・詳細カード）
rail-schema.js                    鉄道の語彙 RailSchema。⚠ ビルド (scripts/rail/) とブラウザが同じこの1本を import する
cameras.js                        ライブカメラ層 IntMapModules.cameras
beta-overlays.js                  ベータのオーバーレイ IntMapModules.betaOverlays（火山レイヤー本体＝色モード4種・VEIによる大きさ・凡例・volcano.* コマンド）
volcano-intel.js                  火山の深さ window.IntMapVolcano（遅延）——噴火履歴11,043件・警戒レベルの4段・気象庁↔GVPの結合・詳細カード
volcano-layers.js                 火山の3レイヤー window.IntMapVolcanoLayers（遅延）——火山灰SIGMET・USGSハザード域・衛星SO₂
time-borders.js                   時間軸の上の歴史的国境 IntMapTimeBorders
time-countries.js                 時計の年から見た Countries タブ
history.js                        歴史的国家／同一性／マディソン系列
hist-cities.js                    時計の年の**都市名** IntMapHistCities（608都市・`ofm-city` の text-field を match で包む・記録は data/hist-cities.json）
us-elections.js                   すべての米大統領選挙 IntMapUSElections（州をクリックするとその州の票と選挙人）
war-fronts.js                     両大戦の**2行**（WW1／WW2）IntMapWarFronts（**eager**——行と IntMapOS 命令だけ）
war-layer.js                      両大戦の層そのもの（**on-demand**・`__imWarFronts`・大戦ごとに1インスタンス／凡例に日スライダーと再生）
war-geom.js                       戦線の線で国の輪郭を切る幾何 `WarGeom`（ビルドとブラウザが同じ1本を使う）
industry-web.js                   産業の相関 window.IntMapIndustry
companies.js                      企業データセットと時価総額のライブ算出 IntMapCompanies
company-data.js                   企業アトラスの読み口（索引1枚＋1社ぶんのプロフィールを遅延取得・施設語彙の正本） IntMapCompanyData
reference-data.js                 参照データ表
tables.js                         参照データ表（大きい方）
gazetteer.js                      ニュース地点解析の内蔵ガゼッティア
```

### 3.6 `js/` — ニュース

```
news-claims.js                    媒体間で食い違っている数量を取り出す規則（純粋なモジュール）。
                                  UI も scripts/news-events-eval.mjs --diffs も**この 1 本**を呼ぶので、
                                  ブラウザの外から歩留まりと精度を測れる
news-brief.js                     出来事の「読める中身」を組み立てる規則（純粋なモジュール）。原文の
                                  文の切り出し・1 系列 1 文・同一配信の除外・主要な数字・一致・
                                  「最新で何が更新されたか」。UI も
                                  scripts/news-events-eval.mjs --brief も**この 1 本**を呼ぶ
news-events.js                    出来事単位の News（一覧・カテゴリ chips・詳細・媒体間の相違・★）。
                                  遅延取得（IntMapLazy の newsEvents）で、束ね方は決めずにサーバーの
                                  結果を読む。正本は docs/NEWS-EVENTS.md
news-feed.js                      ニュースの取得・キャッシュ・見出しの翻訳
news-ui.js                        ニュース一覧・ピン・リーダー
news-context.js                   記事 → 場所／媒体の解決
news-cluster.js                   Atlas `research.events` の**ブラウザ側アダプタ**。判定は共有の
                                  `supabase/functions/_shared/news-cluster.js`（#R334）が行う。ここは記事の形の
                                  適合と、主題の点の選び方だけ（#R340）
news-sources.js                   どの媒体からニュースを取るか window.IntMapNewsSources
news-timeline.js                  ニュースのタイムマシン用タイムライン帯
newsgeo.js                        NewsGeo — 決定論的（非AI）のニュース地点解析
article-reader.js                 サイドバー内の記事リーダー。本文取得は 2 段（r.jina.ai → プロキシ経由の
                                  記事 HTML）で、両段あわせて 1 つの上限。上流のエラーページは本文にしない
```

### 3.7 `js/` — Atlas と AI

```
atlas-persona.js                  Atlas の人格の**正本**（名前・立場・由来・性格・対人姿勢・事実優先・
                                  意見・感情表現・自己設定・非開示。全 system prompt の先頭に入る唯一の写し）
atlas-console.js                  Atlas カーネル（自然言語コンソール／OS コマンド面。846 KB）
atlas-controls.js                 Atlas — 実 UI コントロールとモジュールメソッドへの全操作面
atlas-examples.js                 Atlas — 例文チップの候補プール（視界のプール `V` ＋ 国のプール `P` ／
                                  世界のプール `W` ＋ 点クリック用の `HERE`。選ぶのは `choose()`）
atlas-view-subject.js             Atlas — 「いま何を見ているか」の測定（視界に入る国・陸と海の割合・
                                  名前のある水域・タイルが名指す地名と山・戦略拠点・km 単位の縮尺）
atlas-styles.js                   Atlas パネルのスタイルシート 1 本（atlasPanelCSS）
atlas-geo-resolve.js              Atlas — 場所・地域の解決とカメラの寄せ方
atlas-reply.js                    Atlas — 返答の描画（安全な markdown・コード／数式・GFM 表・出典カード）
atlas-annotate.js                 Atlas — 返答本文の小注釈（単位換算・UTC→現地時刻・略語34語の展開）と、
                                  ホバー／タップで出る一枚。印は mdMini が返す HTML 文字列に入る
atlas-sims.js                     Atlas — 飛行・弾道・爆風・標高・勢力のアニメーション表示
atlas-sources.js                  Atlas — 外部の証拠源（首脳・ライブニュース・POI カタログ）
atlas-verify.js                   Atlas — 回答のコード側検証（内容分類・算術・出典・地図化の可否）
atlas-attach.js                   Atlas — 添付ファイルの正体判定と全画面ビューア
atlas-msg-tools.js                Atlas — メッセージごとの操作バー（コピー／再試行／編集）とその場編集
atlas-gloss.js                    Atlas — 回答文の語句を選択→右クリック（タッチは長押し→「解説」）で開く
                                  用語カード。意味・**この文での意味**・背景を AI が生成する。文脈は描画済みの
                                  DOM（その吹き出しと直前の質問）から採るのでカーネルの状態に依存しない。
                                  専用クォータ（`askAIGloss` → `x-intmap-lane: gloss`）で動き、
                                  質問回数を消費しない。同じ語×同じ回答はキャッシュして再要求しない
atlas-loader.js                   Atlas に手を伸ばすと Atlas を取りに行く window.IntMapAtlas
ai-core.js                        Atlas の AI 通信・利用枠・設定
atlas-capabilities.js             **能力レジストリの正本**（#R318）— IntMap が何をできるかの唯一の一覧。
                                  125 能力 × 別名・分類・副作用・生成物・危険度・確認要否・必要な対象・
                                  遅延モジュール、および観測器と検証器。起動バンドル側（Atlas 抜きで参照可）
atlas-catalog-text.js             Atlas — planner に渡す能力の説明文 40 ブロック（旧 SYS() の本文を逐語で移設）。
                                  各ブロックが「どの能力を説明しているか」を持つので関連分だけ送れる
atlas-anomaly-score.js            **分野横断の異常度**（#R397）— 地震・台風・洪水・火山・警報・紛争などを
                                  1つの尺度に載せる。深刻度は**種別ごとの固有スケール**（Mw／カテゴリ／VAL／
                                  CAP の4段）、他に影響人口・地理的範囲・平常時からの乖離・新しさ・確度・
                                  国際的重要性の7成分。`why` に成分の内訳を残すので順位を説明できる。
                                  ⚠ **偏りは標本の偏り**だった——USGS は数百行、他は数行。各種別の上位
                                  だけを競わせる（出力の割当ではない：真に地震の日は地震が1位になる）
atlas-geo-object.js               **地点の1つの形**（#R397）— GeoObject＝ID・名前・緯度経度・種別・日時・出典・
                                  確度と **provenance**（user_specified / map_click / feed_coordinate /
                                  event_location / geocoded_point / resolved_place_centroid / model_named）。
                                  `mergeKnown()` がコードの座標を回答の地点名へ戻すので、再ジオコードしない。
                                  ⚠ 代表点は `pointLike` ではない＝「その地点」として扱わない
atlas-geo-ledger.js               **この会話が解決した場所の台帳**（#R489）— 1度解決した地点を
                                  種別・国コード・正規名・**stableId**・座標・**その回答の中での役割**として
                                  ターンを越えて保持する。`resolve()` は再ジオコードの前に引かれ、
                                  `contextLines()` が次のターンのプロンプトへ**識別子として**渡る。
                                  時間窓（`setWindow`）も質問ごとに1度だけ固定して持つ。
                                  ⚠ 地点の**形**は `atlas-geo-object.js` のもの（provenance ごと受け取る）。
                                  ⚠ 従来ターンを越えたのは `actLabel` の**26文字**だけで、次のターンは
                                  同じ地名を自分の文章から**文字列として**取り直していた
atlas-admin1.js                   **第1レベル行政境界を、同梱ファイルから**（#R489）—
                                  `data/admin1-world.json.gz`（4,515 ユニット／247か国・#R290 で同梱）を
                                  **セッション1回**読み、名前・現地名・ISO 3166-2・HASC で引く。
                                  `hlTarget()` が `resolveHlTarget` の**ネットワークより前の段**。
                                  ⚠ 同名2ユニットの決め手は**問い合わせ側の行政区分語**（州/oblast/область…）
                                  ——あれば面積の大きい方＝「Moscow Oblast」は市ではなく州
atlas-agent.js                    **ターンの進行**（#R406）— Atlas が1手ごとに「最終回答」か「tool 呼び出し」を
                                  選び、機械的な結果を受けて次を選ぶ。ツール名の実在・引数の型・必須引数・
                                  回数の上限だけを見て、意味は一切決めない。DOM も network も触らない
atlas-toolsurface.js              **道具の面**（#R406）— 中核7ツール＋`find_capability`（全126を検索）／
                                  `run_capability`（ID指定で起動）。tool 呼び出しを旧 dispatch の action へ翻訳する
atlas-schemas.js                  **引数の schema**（#R406）— 126能力ぶんの型・列挙・範囲と `required`/`anyOf`。
                                  綴りは dispatch が実際に読む名前から取る（発明しない）
atlas-policy.js                   **中核指示**（#R406）— 1段落の中核指示（情報源の優先順位＝
                                  IntMap 内部データは最後／地図を触ってよい条件／座標の provenance の読み方）と、
                                  目的未達の判定文。⚠ 人格ではない（人格の正本は atlas-persona.js のみ）
atlas-turn-continuity.js          **早く終わったターンが残すもの**（#R419）— ①訊いた質問を会話の記録へ
                                  1行として残す（`actLabel` は `a.question` を読んでいなかったので
                                  `ask ""` と記録され、次のターンからは「一度も訊いていない」に見えた＝
                                  3回訊き直した）。②中止の印は**考え中の点だけ**を置き換える
                                  （旧: bubble ごと `innerHTML` 差し替え＝利用者がいま答えた質問が消えた）
atlas-turn-results.js             **1つの操作は、返信の中で1ブロック**（#R441）— そのターンの結果のうち
                                  どれを返信に載せるかを決める。①回答の族は #R159 のまま（主題ごとに最良、
                                  同点なら先に書いたもの）。②**同じ操作の繰り返しは最後のもの**——同一性は
                                  action の型と引数、または結果が自分で名乗った `meta.resultKey`。
                                  ⚠ 唯一の防壁が「描画済み HTML の文字列比較」だったので、経路は素通りした
                                  （`data-rset` が経路セットごとに変わる）。Atlas の呼び出し回数は制限しない
atlas-executor.js                 IntMapOS.execute() の中身（#R318）— 解決・可用性・引数検証・入力要求・
                                  前後の観測・完了待ち・事後条件・構造化結果・ライフサイクル・競合の直列化
atlas-results.js                  全操作が返す1つの形（#R318）。`ok` は `status==='completed'` からの導出で書けない
atlas-state.js                    アプリの状態をデータとして持つ（#R318）。各サブシステムが provider を登録し、
                                  モデル向けの文章はそこから派生する。ターン台帳（目標・計画・結果・objectId）
atlas-evidence.js                 Atlas — 証拠レジストリ（#R350）。ソースが入ってよい唯一の入口。URL の正規化と
                                  拒否理由、追跡パラメータの無視、重複の統合、捏造ホスト名の検出。1 回の呼び出しに
                                  束縛されるので、同時に走る 2 つの回答が引用を取り違えられない
atlas-answer-contract.js          Atlas — 回答の契約（#R350）。AnswerEnvelope の schema（ai-proxy と同一）・
                                  主張の意味区分（構成比／成長寄与／供給能力…）・単位クラス・文中の数値の読み取り
atlas-answer-audit.js             Atlas — 回答の監査（#R350／#R472）。冒頭結論と本文の矛盾、統計系列の混同、%とポイント、
                                  裏付けのない数値、本文中の URL など 39 のコードを構造から出す。所見であって判決ではない
atlas-answer-pipeline.js          Atlas — 台帳 → 1 回の呼び出し → 監査 → Atlas へ報告（#R350／#R472）。
                                  監査は回答を書き換えず・削らず・問い直さない。所見は Atlas が読んで判断する
atlas-answer-render.js            Atlas — 構造化回答の描画（#R350）。引用記号と出典カードはレジストリからのみ生成し、
                                  モデルが書いた URL はリンクにしない
```

### 3.8 `js/` — 分析・パネル・シミュレーション

```
analysis-panels.js                分析パネルの EAGER SHELL ——「起動時に走るもの」だけ:
                                  5つのファクトリ登録・#btn-correlate と #edu-mount/#btn-edu の生成・
                                  言語切替の再翻訳・地図クリックの転送、そして
                                  IntMapTimeSeries / IntMapAIResearch / IntMapCorrelate / IntMapEdu
                                  の非同期ファサード（呼ばれてから実装を取りに行く）
analysis-timeseries.js            ↳ 時系列チャートの実装        __imAnalysisTimeSeries（遅延）
analysis-research.js              ↳ AI リサーチの実装           __imAnalysisResearch（遅延）
analysis-correlate.js             ↳ 相関・散布図の実装          __imAnalysisCorrelate（遅延）
analysis-world-events.js          ↳ 世界の出来事アーカイブの実装 __imAnalysisEvents（遅延）
analysis-edu.js                   ↳ 学習モード・地図クイズの実装 __imAnalysisEdu（遅延）
stats-compare.js                  多国統計比較 IntMapStatsCompare
countries-ui.js                   Countries タブと国の詳細
companies-ui.js                   Companies タブ・比較ビュー・ダッシュボード
company-panel.js                  企業プロフィールのパネル（概要・財務・事業・拠点・進出国・組織・出典） IntMapCompanyPanel
company-facilities.js             選択中の企業の拠点を地図に描く（クラスタリング・6グループ・施設カード） IntMapCompanyFacilities
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
sims.js                           物理シミュレーションと太陽幾何（放射性物質拡散・範囲人口・
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
                                  （⚠ 1秒1件の床は #R489 で `nominatim-gate.js` へ移した＝共有の1つ）
nominatim-gate.js                 **Nominatim の前に立つ唯一のキュー**（#R489）— 公開エンドポイントの
                                  「1秒1リクエスト」を**アプリ全体で1つの counter** として守る。
                                  `reserve({drop:true})` は打鍵経路（古い問い合わせは捨てる・#R298 のまま）、
                                  `wait()` は一括経路（14件は**並ぶ**）。取得はしない＝枠を配るだけ
                                  window.IntMapNominatimGate ＋ ES import の両方（同一インスタンス）
routing-cards.js                  経路候補カード／手順／区間の共通描画 window.IntMapRouteCards
routing-export.js                 GPX・GeoJSON・共有状態 window.IntMapRouteExport
routing-ui.js                     経路パネル（Layers ▸ Tools ▸ Directions・遅延取得）window.IntMapRouteUI
routing-ops.js                    経路の分析 window.IntMapRoutingOps
routing-errors.js                 経路の失敗の分類（15コード・再試行可否・fallback可否）window.IntMapRouteErrors
routing-time.js                   計画の時刻（Chronos）と案内の時刻（壁時計）の区別 window.IntMapRouteClock
routing-traffic.js                交通情報つき provider のアダプタ（routing-relay 経由）window.IntMapRouteTraffic
navigation.js                     案内の進行役（GPS→照合→進捗→再探索）window.IntMapNavigation
navigation-store.js               案内の状態機械（10状態・遷移表）window.IntMapNavStore
navigation-match.js               GPS の受け入れ判定と経路への射影 window.IntMapNavMatch
navigation-guidance.js            残り・次の操作・逸脱・到着・音声の時期 window.IntMapNavGuide
navigation-camera.js              案内中のカメラ（追従・北上・全体・手動解除）window.IntMapNavCamera
navigation-voice.js               音声案内（9言語・off/alerts/guidance）window.IntMapNavVoice
navigation-sim.js                 位置シミュレータ（検証用・決定的）window.IntMapNavSim
navigation-ui.js                  案内専用 UI（上の指示カードと下の ETA バー）window.IntMapNavUI
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
aviation-live.js                  ライブ航空機レイヤーの制御役 window.IntMapAviation——取得・LOD・picking・選択
aircraft-points.js                航空機が実際にいる場所——数万機を1描画呼び出しで描く GPU 点群
plane-glyph.js                    飛行機マークの正本——頂点18のプランフォームを両エンジンが読む
aviation-codec.js                 IMAV/1 バイナリ形式の正本（encode/decode）。_shared/ へ写して server と共有
aviation-model.js                 provider 正規化・出典・タイル格子の正本。同じく _shared/ へ写す
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
wx-models.js                      予報モデルのレジストリ window.IntMapWxModels——提供モデル・出典・ライセンス。格子／変数／気圧面／予報期間は live metadata から導出（書き写さない）
wx-source.js                      ガードされた唯一の気象／UV ソース window.IntMapWx
wx-ecmwf.js                       ECMWF IFS モデル本体 window.IntMapECMWF——予報時刻軸・.om URL・復号済みの場・配色表
wx-wind.js                        風の粒子レンダラ window.IntMapWindGL——WebGL 1描画呼び出し／実経過時間基準
place-framing.js                  どこまで寄るか window.IntMapPlaceFraming
country-extent.js                 その国が「在る場所」の枠 window.IntMapCountryExtent——遠い海外領土を外し、±180 をまたぐ範囲を区間として書き下す
proxy-fetch.js                    CORS プロキシ経由の取得（相手先ごとに効くものが違う）。
                                  `opts.as` が受理する文書の形（feed／html／json）、`opts.budgetMs` が ladder 全体の上限、
                                  `opts.direct` が相手先を先に試すか、`opts.signal` が停止。⚠ 締切は**本文の読み終わりまで**掛かる
fetch-deadline.js                 締切つきの JSON 取得 `jsonWithin()`——相手が答えるのをやめても必ず終わる 1 回の取得
atlas-deadlines.js                Atlas の証拠集めが使ってよい時間——予算3つ・締切つきの gather・停止の届く JSON 取得器
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
ecoregions_2017.geojson           エコリージョン（自前ホスト）。**配布されるのはこれだけ**
  └ 同内容の JS グローバル版      `ecoregions_2017.js`（#R13b の `file://` 対策・`window.__ECOREGIONS_2017`）。
                                  中身は上と**バイト同一**なので `vite.config.js` の `STATIC_EXCLUDE` で
                                  dist から外してある。リポジトリからは消していない
railways/                         世界の鉄道（#R388 OpenStreetMap の実タグ）
  ├ world.json.gz                 z<6.5 の全世界（幹線・支線を一般化。文字列は持たない）
  ├ c/<lat>_<lon>.json.gz         5°セル。z≥6.5 で表示範囲ぶんだけ取得（路線名・事業者・OSM way id つき）
  ├ st/<lat>_<lon>.json.gz        駅・停留所。5°セル（z≥8・135,238件）
  └ index.json / st-index.json    存在するセルの一覧と gz バイト数（線／駅・404 を撃たないため）
volcanoes_gvp.json                火山（Smithsonian GVP 完新世＋観測機関が語っている座）
crust1.bin.gz / .json             CRUST1.0（地殻構造）
slab2.bin.gz / .json              Slab2（沈み込み帯のスラブ面）
tectonics.bin.gz / .json          PB2002（プレート境界）
vs30.png / vs30-phone.png / .json 場址項 Vs30 のラスタ
bathymetry.png / .json            海底地形
land-mask.png / .json             陸／海マスク
subcables.json                    海底ケーブルの経路（`scripts/build-subcables.mjs` が生成）。
                                  1本の Feature ＝ 1区間で、`quality` が verified / reconstructed /
                                  estimated、`src` がその出典。⚠ これが表示の主系統で、
                                  TeleGeography からの取得は移行用の fallback として残っている
subcables-lp.json                 陸揚げ地点（点）。既存の黄色い点はこれを描く
subcables-meta.json               ケーブル単位のメタデータ（所有者・RFS・総延長・接続国・
                                  陸揚げ地点）と、陸揚げ地点ごとの「ここに来るケーブル」。
                                  クリック時のポップアップだけが読む（線の描画は読まない）。
                                  ⚠ カードを9言語で出すための**結合鍵**も持つ——国名の
                                  ISO 3166-1 alpha-2（`countryCodes` / `cc`）・`rfsMonth` /
                                  `rfsQuarter`・`lengthKm`。国名や月名の訳語は入れない（CLDR）
subcables.build.json              生成の記録——件数・km・出典別の採否とライセンス・QA の全数値
subcable-overrides.json           生成の**訂正をデータとして持つ**もの（別名表・採否の明示・
                                  1セルより狭い水路・ケーブルが敷かれている川・追加の経由点・
                                  CLDR と綴りが違う国名の ISO コード）。コードに緯度経度を書かない
precip-mm.png / .json             年降水量の値格納ラスタ（8bit の log(mm)）と、その格子・帯・色
precip-year.png / .json           年別の年降水量（1枚に縦積み）
country-facts.json                国詳細カードの6欄——首都・通貨・言語・隣接（陸の国境）・時間帯・
                                  国連加盟（＋ demonym / independent）。**restcountries.com が撤去された
                                  ので同梱に切り替えた**（#R453）。上流は mledoze/countries（ODbL・
                                  restcountries 自身の上流）と IANA time-zone database。鍵は
                                  `js/countries-ui.js` が導くコード。生成は
                                  `scripts/build-country-facts.mjs`（`npm run build:countryfacts`・
                                  `--check` で上流と byte 比較）。カードを開いたときだけ取りに行く
hdi-series.json                   HDI（UNDP）193か国 × 1990–2022
maddison.json                     マディソン・プロジェクトの歴史 GDP・人口（1850–2018・`scripts/build-maddison.mjs`）
data/cshapes.js                   歴史的国境
us-elections.json / us-states.json  米大統領選挙（60回・州別2,342行の得票と選挙人つき）
wars.json                         両大戦の記録（支配・戦線・作戦・種別・兵力と死傷／`scripts/build-wars.mjs` が書き、検証する）
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
  config.toml                     ローカル/CI 用（本番非接続）。⚠ Edge Function は全13本をここに宣言する
  migrations/*.sql                DB の唯一の設計図（18本）。本番変更は必ずここを通す
  seed.sql                        100% 合成のシードデータ
  tests/*_test.sql                pgTAP（構造 ＋ RLS/権限マトリクス ＋ 関数。7本）
  functions/<name>/index.ts       Edge Functions（13本。一覧と各本の役割は Architecture.md §6.2）
  functions/_shared/              関数ではないライブラリ（newsgeo.js / relay-guard.js /
                                  atlas-persona.js / aviation-codec.js / aviation-model.js /
                                  news-cluster.js / news-geo-prompt.js / news-ingest.js / volcano-parse.js）
                                  ⚠ news-cluster.js は**サーバー専用**——クライアントの
                                  バンドルに入れない（docs/NEWS-EVENTS.md §5）
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
  build-maddison.mjs              `data/maddison.json` を MPD2020 から 1850 まで**延長**する（1900 以降は一字も書き換えない）
  build-wars.mjs                  `scripts/wars/` の記録 → `data/wars.json`。⚠ **証明できないものは書かない**——
                                  地名・gwcode・戦線が切る国・都市がどちらの側に落ちるかを全部検査する
  wars/                           両大戦の記録そのもの（`places.mjs` 座標／`lang.mjs` 語彙・陣営・**種別 KINDS**と規則／
                                  `ww1.mjs` `ww2.mjs` 支配・戦線・作戦／`source.mjs` 組み立て）
  master-sync.mjs                 **原本（main worktree）が merge 後の状態か**を見る（`npm run master:check` / `master:sync`）。
                                  原本の場所はハードコードせず `git rev-parse --git-common-dir` から導出する。
                                  ⚠ **branch を切り替えない。** 原本は「`main` の置き場」で作業場ではない
                                  （`CLAUDE.md` §6）。`main` 以外にいるときは何もせず報告する。
                                  ⚠ **未コミットの変更が「邪魔か」を判定するのは git。** 早送りが触らない
                                  ファイル（かつては他セッションの `.claude/launch.json` が定番の例だった。#R338 で追跡から外した）は素通りさせ、実際に
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
  build-report.mjs                **起動予算の計器**（vite プラグイン＋CLI）。Rollup の最終グラフから
                                  eager（index.html のエントリ＋静的 import の推移閉包＝modulepreload
                                  される集合）と async を**導出**し、raw / gzip / brotli とモジュール別の
                                  内訳を `.perf/build-report.json` に書く（追跡対象外）。
                                  ⚠ brotli は**2つの品質**を使う——ゲートが読む eager だけ 11、それ以外は 5。
                                  全部を 11 にするとビルドが 40 秒延びる（Cesium だけで 4.8 MB）。
  perf-budget.mjs                 **起動予算のゲート**（`npm run check:perf`・CI の静的 job）。
                                  eager は**両方向のラチェット**（増えたら退行／減ったのに天井が
                                  ついてこなければ「天井が古い」で落とす＝#R194 と同じ規則）、
                                  async chunk と dist の合計は**天井だけ**（縮むのは自由）。
                                  ⚠ `requests` と `modules` は**バイトではなく個数**なので完全一致で見る。
                                  基準は `tests/perf-baseline.json`（追跡対象）。`--update` で更新。
  mobile-trace.mjs                **2つのエンジンで1本のトレースを取る計器**（ゲートではない）。
                                  起動→最初のpan→最初のzoom→暖機→気象ON→警報ON を 1 本で走らせ、
                                  Chromium と **WebKit**（＝iOS Safari と同じ JavaScriptCore＋WebCore）
                                  を同じ機械・同じ再生バイトで並べる。⚠ **CPU スロットルは CDP のみ**
                                  なので既定は `--cpu 1`＝**両腕とも素**（片方だけ絞ると比較が壊れる）。
                                  ⚠ これは**エンジンの比較であって携帯の数字ではない**。
                                  サーバは自分で起動・停止し、`.frame-cache/` は
                                  `frame-profile.mjs` と**共有**する（別々に育てると腕がキャッシュの分だけ違う）。
  trace-probe.js                  上の**ページ側の計器**（`addInitScript` で最初のスクリプトより前に入る）。
                                  ⚠ **アプリではない**——`js/` も `src/` も import しない
                                  （`tests/r387-checks ⑤` が出荷経路への混入を落とす）。
                                  入れ子を差し引いた **self time** で placement / render / mapRender /
                                  texUpload / bufUpload / decode / workerPost / workerRecv を数え、
                                  **MessageChannel の ping ループ**で `longtask` 観測器を持たない
                                  WebKit でも主スレッドの詰まりを測る。
                                  ⚠ **付かなかったフックは 0 ではなく「不在」**として報告する。
  engine-coupling.mjs             レンダラ脱依存のゲート
  i18n-*.mjs                      翻訳の被覆と形の監査（§10）
  eol.mjs                         ソース検査は**バイト列ではなく内容**を読む（改行はチェックアウトの性質）
  code-only.mjs                   ソース検査は**散文ではなくコード**を読む。行／ブロックのコメントだけを
                                  外し、文字列・テンプレート・正規表現リテラルは1文字も変えない。
                                  ⚠ **写しを作らない**——`atlas-capability-audit.mjs` と
                                  `tests/helpers/fn-cors.js` は両方ここから import する
                                  （`tests/r345-checks ⑩` が2本目の定義を落とす）
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
  helpers/colour-difference.js    **2色がどれくらい違って見えるか**（sRGB→CIELAB＋CIEDE2000）。
                                  #R487 まで prod-smoke は「見分けられるか」を **sRGB のユークリッド距離**で
                                  訊いていたが、その距離は見え方を順序づけない（出荷中の風の表で実測、
                                  順序が逆になる対がある）。閾値は表からではなく**観測者から**採る
                                  ——ΔE00 は 1.0 が JND、2 以上が一目で分かる帯
  helpers/fn-cors.js              Edge Function の CORS 契約を**リポジトリから**読む（node 検査と
                                  prod-smoke の両方が使う）。⚠ 読むのは `codeOnly()` を通した
                                  コードだけ——コメントの中の `corsFor()` は契約ではない
  r<n>-checks.test.mjs            ラウンドごとに追加された Node の回帰検査（262本）
  *.spec.js                       ブラウザ回帰（100本）
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