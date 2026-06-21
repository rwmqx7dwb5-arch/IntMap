# IntMap — 現状仕様書 (Architecture)

> 本ファイルは**開発日記ではなく**、現在の IntMap を再現・保守するための**現状仕様書**です。
> Claude や他のAIが、このファイルを読むだけで IntMap の構造をほぼ理解できることを目的とします。
> 時系列の経緯・根本原因の記録は `DEV-NOTES.md`、標準指示（やってはいけないこと等）は `CONSTITUTION.md` を参照。
> 実装を変えたら、この仕様書も更新すること。
>
> Last reviewed: 2026-06-21 (R41)
>
> **R41 の要点**：`whenStyleReady()` が永久ハングし得た問題を修正（idle/loadのみ待機→ポーリング＋ハード解決）＋自己修復をハートビート化（「チェックしても出ない／消したのに残る・再読込で治る」の真因）。相関/散布図の残差マップを再実装（先にモーダルを閉じる＋RdBu連続配色＋指標33→51）。ウェブカムを**実装**（検証済みの24時間ライブYouTube配信25件をポップアップ内に埋め込み再生。検索リンクのハリボテを廃止）。**タイムゾーンレイヤー**新設（Natural Earth境界＋各ゾーンの現在時刻を毎分更新）。GIBSラスターに色スケール凡例。鉄道線を濃色＋白枕木で視認性向上。水域/地形ラベルを別チェック（`cb-geolabels`）化＋河川ラベルを `waterway` 由来に修正（位置ズレ解消）。天気ポップアップの華氏完全対応＋移動可能化。ウィジェット36→41。i18n：RUのレイヤーグループ見出し欠落＋国詳細(Stats)のES欠落を修正、非AIニュース地点辞書を多言語強化。

---

## 1. 概要 (Overview)

IntMap は、世界のニュース・気候・人口・経済・地政学データを一枚の地図に重ねて表示する、
**単一HTMLファイルのWebアプリ**（フロントエンド全部入り）です。

- **本体は `index.html`（公開用、約15,000行・約1.4MB）一枚。** ビルド工程なし。ブラウザでそのまま動く。
- 地図エンジンは **MapLibre GL JS**（Mercator 平面 + Globe 投影）。Cesium は**廃止済み**。
- バックエンドは **Supabase**（DB・認証・ホスティング・Edge Functions）。
- 配信は OneDrive 上の静的ファイルを直接ホスト（`index.html` / `admin.html`）。
- 対応UI言語は **英語 (en) / 日本語 (jp) / ドイツ語 (de) / ロシア語 (ru) / スペイン語 (es, ベータ)** の5つ（R40でDE/RU復活＋ES追加。`i18n.es` は静的UIを網羅、深層の動的文字列はEN/JPフォールバック）。地名ラベルも全言語対応（`applyLabelLang` の `name:<lang>`）。

---

## 2. 主要機能一覧 (Features)

- **ライブニュースマップ** — 世界の見出しを「出来事が起きた場所」にピン表示。発信元（媒体HQ）表示にも切替可。
  地点解析は**サーバー側でAI事前解析**（後述）。72時間以内のニュースのみ表示。
- **70以上のデータレイヤー** — 気候(ケッペン/気温/降水/風/レーダー/雲/積雪/エアロゾル/一酸化炭素CO)、
  海洋(SST/海面水温偏差/海氷/EEZ/海底ケーブル/航空機。海洋クロロフィルはbeta)、
  地形(土地被覆/エコリージョン/プレート/段彩/陰影/等高線/海面上昇/植生NDVI/土壌水分)、人口・経済(人口/人口密度/GDP/HDI/出生率…)、
  災害・夜空(熱異常/オーロラ/夜間光/火山)、地政学・防衛(NATO/EU/旧ソ連/軍事費/前線/鉄道/歴史的国境…)、その他(beta)。
  GIBSラスタの**凡例は実際のNASAカラーマップXMLから生成**（色が地図と一致。R42で海氷・SST偏差等を是正）。
- **Globe / Flat / Satellite / 3D地形** 切替、コンパス、距離・面積計測、半径円(Radius)、可視判定(LOS/レーダー影)。
- **国情報** — Countries(info) を ON にして国をタップ → 統計カード＋詳細ポップアップ（世界銀行の時系列グラフ、比較）。
- **Isolate（この国だけ表示）** — 1国だけ残して周囲をマスク。国情報ポップアップ、または通常時に国名ラベルをタップ→ボタンから起動。
- **統計(Stats)・情報(Information)ダッシュボード・コミュニティ** タブ。
- **サイドバー・ウィジェット**（FX・ランダム国など、追加/並べ替え可）。
- **アカウント/AI機能** — ログインで使えるアカウント制AI（翻訳・要約・画像解析など。1日上限つき）。
- **テーマ (Theme)** — 10種（System/Light/Dark + Age of Discovery / Cyber Terminal / Psychedelic / Military /
  Medical / Baroque / Taishō）。テーマ変更でサイドバー外観（solid/frosted/transparent）を自動選択。
- **Playground (beta)** — 設定ではなく **Layers ▸ Tools**（旧Quizモードの場所）から起動。5モード（実データ）:
  World Explorer（衛星GeoGuessr。完全ランダム陸地・ズームアウト減点・開始地点ピン・回答地図はglobe・起動時に
  サイドバー収納/タブ解除）/ Pandemic Simulator（国別 SEIR メタ個体群＝実在都市に症例ドット・交通網拡散・自動
  ロックダウン/国境封鎖・変異株・ワクチン/治療・速報通知）/ Statecraft（旧Nation Sim。7指標＋5勢力で政策が
  制約される国家運営、1900–2026）/ World Sandbox（世界を編集：新国家を描く=turf面積/都市/海面/航路封鎖と影響）/
  Quiz mode。
- **β追加レイヤー(#R31)** — USGS地震（ライブ＋過去）・注目度ヒートマップ（ニュース密度）・World Bank コロプレス
  8種（CO₂/都市化/電力/医療費/森林/再エネ/携帯/インフレ、最新値）。`_registerLayerOpacity` で凡例+不透明度。
- **Bug Report** — 診断情報を自動添付してSupabase `bug_reports` に送信（オフライン時はローカル+クリップボード）。
- **Atlas（自然言語コンソール, beta, #R42〜#R42c)** — 自然言語で指示するとAIが**JSONアクション計画**を返し、実ディスパッチャが
  実行。**IntMapのほぼ全動作**を網羅（約35アクション、すべて既存コードに対応）: 移動/ズーム/投影/3D/ベース地図/方位/回転、
  レイヤー切替/グリッド/国情報、天気/AIブリーフ/比較/Isolate/ピン/計測(2地点間)/半径/相関ツール/ウィジェット/スクショ/共有/
  設定/タブ/タイムトラベル/全消去、テーマ/言語/単位、そして `countryStats` 上の**実分析**（ランキング・比率・**回帰残差relate**
  例「GDP per capitaの割にHDIの低い国」）。分析結果は専用 `nlq-src`（`window.countryGeo` 由来、Countries(info)レイヤー非依存）で
  国をハイライト＋一覧。**複合指示**対応（各アクションを順次await実行）。ウィンドウは**最小化・サイズ変更可**、×で地図上の
  ハイライトも消去。起動: ツールバー `⌖` / 右クリック / **Ctrl・⌘+K**。
- **天気ポップアップ（右クリック→「ここの天気」, #R40/#R42)** — Open-Meteo の現況＋5日予報（常に最新）。
  気温は設定の °C/°F/両方に完全対応（両方モードは日別予報も °F を併記, #R42）。ドラッグ移動・⟳更新可。
- **共有（Share this view, #R42/#R42b)** — `🔗` ツールバー/右クリックから**共有パネル**を表示。位置・ズーム・投影・ベース地図・
  選択中の全レイヤー・時刻(タイムトラベル)・比較状態を **URL（アドレスバー自体）にすべて格納**。リンクを開くと状態を完全復元
  （新規タブ＝完全復元、同一タブへの貼り付けも `hashchange` で復元。自タブのリロードはR33通りビュー以外クリア＝per-tab
  `sessionStorage` で判別）。コピー/ネイティブ共有対応。
- **お気に入りレイヤー、レイヤープリセット、共有パーマリンク（URLハッシュ）、スクリーンショット、PWA(Service Worker)**。
- **多言語ニュース翻訳**（任意）・**寄付(Stripe)**・**フィードバック**・**管理コンソール(admin.html)**。

---

## 3. ファイル構成と各ファイルの役割 (Files)

```
index.html                      公開用SPA本体（UI・地図・レイヤー・ニュース・AI呼び出し・i18n 全部入り）
admin.html                      管理コンソール（geo_pins / dashboard_cards / コミュニティ通報 / feedback の管理）
sw.js                           Service Worker（タイル等のキャッシュ・オフライン補助）
CONSTITUTION.md                 標準指示（最優先のルール集）
Architecture.md                 本ファイル（現状仕様書）
DEV-NOTES.md                    日記形式の開発記録（ラウンドごとの根本原因と修正の記録）
LICENSE
google….html                    Google Search Console 認証用

data/
  ecoregions_2017.geojson/.js   エコリージョン（自前ホスト。PMTiles が dead だったため geojson 化）
  railways_gauge.json           世界の鉄道（軌間別）
  volcanoes_gvp.json            火山（Smithsonian GVP 完新世）
koppen_mercator_*.png           ケッペン気候区分のベース画像（期間別）。
koppen_mercator_*_4k.png        モバイル用の軽量版（OOMクラッシュ対策。モバイルは 4k png を使う）
_koppen_convert.py              ケッペンTIFF→PNG 変換スクリプト（データ前処理。実行時には不要）
_rail_convert.py                鉄道データ変換スクリプト（同上）

supabase/
  functions/ai-proxy/index.ts       アカウント制AIプロキシ（鍵はサーバー側、1日上限）
  functions/refresh-news/index.ts   ニュース取得＋AI地点解析＋current_news 書き込み（cron）
  supabase_news_setup.sql           current_news スキーマ＋index＋RLS＋cron例（一度だけ実行）
  supabase_bug_reports.sql          bug_reports スキーマ＋RLS（一度だけ実行）
  .temp/linked-project.json         supabase CLI のリンク先（project ref）
```

> 参考: `index.backup-*.html` は過去のバックアップ。本番には使わない。

---

## 4. ニュース処理の流れ (News pipeline) — **R29で大きく変更**

### 4.1 サーバー側（事前処理）— `supabase/functions/refresh-news/index.ts`
1. **cron（約20分ごと）**で起動（`supabase_news_setup.sql` の pg_cron 例、または手動 POST）。
2. **Google News RSS をサーバー側で取得**（en / jp、world + business）。CORS 不要。
3. **地点解析（subject location）**:
   - **AIが第一手段**（en/jp の全記事）。`AI_PROVIDER`（anthropic/openai/gemini）でサーバー保持の鍵を使い、
     見出し＋説明から「出来事の起きた具体的な場所」を返させる。1回あたりバッチ（既定15件）、1実行あたり上限 `AI_CAP=120` 件。
   - **非AI辞書解析はフォールバック**：`geo_pins` テーブル＋埋め込み辞書（都市/地域/政府所在地メトニム/組織/デモニム）で
     スコアリング。AI失敗・en/jp 以外・API停止時に使う。
4. **重複防止・再解析防止**:
   - `current_news` は `(lang, link)` で upsert → **同じURLは重複保存しない**。
   - 直近72時間の既存行を読み、**すでに `analyzed_by='ai'` の記事は再びAIに送らない**（結果を再利用）。
5. **媒体HQ** は埋め込み publisher 辞書から解決（subject とは別に保存）。
6. `current_news` に書き込み。各行に `analyzed_by`（`'ai'|'dict'|'none'`）を記録。
7. **72時間より古い行を削除**（`pub_date` 基準、`fetched_at` も保険）。

### 4.2 フロントエンド（表示）— `index.html`
- 起動時 `fetchData()`：
  1. ローカルキャッシュ（`intmap_news_cache`）があれば即表示。
  2. **FAST PATH**：`loadNewsFromSupabase()` が `current_news` を1回 SELECT → `serverRowToItem()` で整形 → `startNews()` でピン即表示。
     **フロントはニュース地点解析のためにAIを呼ばない**（AIロケートボタンも無い）。
     - **⚠️ R40で一時停止中**：`const USE_SERVER_NEWS=false`（`window.__IM_USE_SERVER_NEWS`）で FAST PATH をスキップし、**全言語**でライブRSS＋クライアント非AI辞書（`analyzeContext`/`scoreGeo`）のみを使用中（ユーザー要望「一時的に停止」）。`true` に戻せばサーバー事前解析フィードが復活。辞書はDE/RU(`_DERU_GZ`)＋ES(`_ES_GZ`/`_ES_DEM`)を内蔵。
  3. **FALLBACK**：検索・時系列(time-travel)・多言語モード等、サーバーが焼いていないケースのみ、
     ライブRSS（CORSプロキシ経由）を取得し、クライアントの `analyzeContext()`（非AI辞書）で解析。
- **72時間フィルタ**：`computeFilteredNews()` が72時間より古い記事を表示から除外（保存(saved)・時系列モードは除外しない）。
- ピンの「主題(Subject) / 発信元(Publisher)」切替は `current_news` の両座標を使う**表示専用トグル**（AI呼び出しなし）。

---

## 5. AI APIの使い方と鍵管理 (AI usage & key policy)

- **方針：APIキーは絶対にフロントに置かない。** BYOK（ユーザーが鍵を入力）方式は**廃止済み (R27)**。
- **アカウント制AI** — `supabase/functions/ai-proxy/index.ts`:
  - フロントの `askAI()` → `aiCallServer()` が、ユーザーのSupabase JWT を付けて ai-proxy に POST。
  - ai-proxy は (1)JWTでユーザー確認（要ログイン）→ (2)`profiles.plan` で上限決定（R40で free=10/日 `PLAN_LIMITS`）→
    (3)`increment_ai_usage` RPC で当日分を原子的に消費（超過は 429）→ (4)**サーバー保持の鍵**でプロバイダ呼び出し →
    (5)失敗時は `refund_ai_usage` で消費分を返金。
  - プロバイダは `AI_PROVIDER`（`anthropic`|`openai`|`gemini`）。モデルは `AI_MODEL`（既定はプロバイダ毎）。
  - 用途：ニュースタイトル翻訳、ビューの要約、画像解析など**ユーザー操作のAI機能**。
- **ニュース地点解析AI** — `refresh-news` が**同じ鍵・同じ AI_PROVIDER 規約**でサーバー側実行（ユーザー枠は消費しない＝運用者の鍵）。
- フロントに見えるのは結果だけ。鍵・モデル選択UIはユーザーに見せない。

---

## 6. Supabase（テーブル・Edge Functions・環境変数）

**Project ref:** `vpekfwdpurzejrrmacac` / 公開(anon/publishable)キーは `index.html` の
`window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`（公開前提・RLSで保護）。

### 6.1 テーブル（フロント/管理が使用）
| テーブル | 用途 |
|---|---|
| `profiles` | ユーザープロフィール（表示名・plan・login_count 等） |
| `current_news` | **事前AI解析済みニュース**（subject/pub 座標、`analyzed_by`、`fetched_at` 他。R29で `analyzed_by` 追加） |
| `geo_pins` | ニュース地点解析の辞書（gazetteer）。管理コンソールで編集。refresh-news も読む |
| `favorites` | 保存記事（ブックマーク） |
| `user_prefs` | ユーザー設定の同期 |
| `dashboard_cards` | 情報(Information)ダッシュボードのカード（管理コンソールで編集） |
| `ai_usage` | AI利用量（1日あたりの消費）。`increment_ai_usage` / `refund_ai_usage` RPC で操作 |
| `community_posts` / `community_comments` / `community_votes` / `community_comment_votes` / `community_reports` | コミュニティ |
| `feedback` | フィードバック（3回目ログイン誘導＋設定からいつでも） |
| `bug_reports` | バグ報告（診断情報JSON付き。`supabase_bug_reports.sql`。anon が insert 可・admin が閲覧） |
| `donations` | 寄付記録 |

### 6.2 Edge Functions
- `ai-proxy` … アカウント制AI（要 `verify_jwt` 可、内部でも検証）。
- `refresh-news` … ニュース取得＋AI地点解析＋書き込み（`--no-verify-jwt` で公開、`REFRESH_SECRET` で保護推奨）。

### 6.3 SQL
- `supabase/supabase_news_setup.sql` … `current_news` 作成/拡張（`analyzed_by` 追加マイグレーション含む）＋index＋RLS＋cron例。
- `supabase_ai_usage.sql`（リポジトリ外・要作成/実行）… `ai_usage` テーブル＋ `increment_ai_usage`/`refund_ai_usage` RPC＋`profiles.plan/login_count`。

### 6.4 環境変数（Edge Functions の secrets）
- 自動注入: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- AI: `AI_PROVIDER`（anthropic|openai|gemini）, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`, `AI_MODEL`(任意)
- refresh-news: `REFRESH_SECRET`(任意・推奨), `NEWS_AI=off`(任意・AIを止め辞書のみにするkill-switch)

---

## 7. 地図・レイヤー・Globe・ウィジェットの構造

- **地図初期化**：`map = new maplibregl.Map(...)`。`renderWorldCopies` は投影/自由パンに応じて切替。基盤は CARTO/Esri ラスタ＋OpenFreeMap ベクタ(`ofm`)。
- **基盤切替**：`btn-view-map/sat` と `applyTheme()`＋`_reassertBase()`（スタイルロード競合に強いポーリング再適用）。
- **投影**：Flat(mercator)/Globe。3D地形は terrarium DEM（複数ホストで並列フェッチ、モバイルは maxzoom 13 でRAM安全）。
- **地名ラベル**：`ensurePlaceLabels()` が `ofm` の `place` レイヤから `ofm-country/city/other` を生成（冪等）。`cb-names`(既定ON)で表示。
- **国境ライン**：`borders-only-line`（`cb-borders`、既定OFF）。国塗り＝`country-fill`/`country-line`（`cb-countries`=Countries(info)）。
- **データレイヤー群**：`geoLayersDB` / 各種 setup 関数。`_registerLayerOpacity()` でレイヤーごとに透明度凡例。
- **レイヤーパネル再構成**：`reorganizeLayerPanel()` が DOM を毎回並べ替えて分類:
  `お気に入り → 4ユーティリティ(地名/国境/グリッド/Countries) → Active layers → 6テーマ群 → Others(beta) → Tools(compare/upload)`。
  グループは折り畳み可（デスクトップ）。モバイルは **Others(beta) だけ**プルダウン、他は常時展開。
- **Active layers**：`_refreshActiveLayers()` がオン中のレイヤーをチップ表示。常に上部。トグル時はスクロールを補正して**行が動かない**ようにする。
- **Globe専用**：`updateOcclusion()` で裏面ピンを隠す。
- **ウィジェット**：サイドバーのカード群（`intmap_widgets3` に定義保存）。FX・ランダム国など。「Add widget」で追加。

---

## 8. UI/UX の構造

- **サイドバー**（左）：タブ（News / Information / Stats / Community）、検索、ニュースフィード／ダッシュボード／コミュニティ。
- **マップ上コントロール**（右上）：Map/Sat、Flat/Globe/3D/コンパス、Grid、Measure、Radius、Layers。
- **ポップアップ類**：国情報カード(`country-info`)、国詳細(`country-popup`)、ピン/地名ポップアップ、凡例(ドラッグ可)。
- **設定モーダル**：言語・タイムゾーン・単位・テーマ・ニュース言語・衛星鍵(任意)・AI利用状況・出典・規約/プライバシー。
- **iOS風の作法**：セグメントコントロール、角丸カード、ボトムシート、初回ウェルカムカード(`_imWelcome`)。
- **初回ウェルカムカード(R29)**：旧「自動でレイヤーをON/OFFするデモ」（バグと誤認された）を廃し、
  iOS風の説明カードに変更。レイヤー紹介ツアー(`_imStartDemo`)は明示ボタン（カード内・設定内）からの任意起動に。
- **テーマ**：`applyTheme()` が `userTheme` から `body.theme-<id>` を排他トグル＋light/darkベースを設定（skin registry）。
  CSSはすべて静的 `<style>` 内（テンプレートリテラル不使用＝バッククォート罠なし）。テーマ変更時に最適サイドバー外観を自動適用。
- **Playground/Bug Report**：Playgroundは Layers ▸ Tools の `btn-edu` から `window._openPlayground`。Bug Report /
  Feedback は設定から `window._openBugReport` / `window._openFeedback`。Feedbackは種類（不具合/要望/良かった点等）・
  ログアウト時の任意メール・不具合はバグレポートへ誘導。Playgroundの各モードは createElement+インラインstyleで構築
  （CSS-in-template-literal を避ける）。
- **テキストに影を付けない**（`text-shadow:none` を徹底）。

---

## 9. モバイル対応の構造

- 判定は `isMobile()` と `@media(max-width:768px)`。
- **m-fab-stack**（右側の丸ボタン列：Layers/Tools/Compass 等）＋ **m-sheet**（ボトムシート、ピーク/フル detent）。
- レイヤーパネルは m-sheet 内に移動。`_expandAllLayerGroups()` で全展開（Others だけ折り畳み）。
- **チェックボックスのタップ**：`input{pointer-events:none}` ＋ `touch-action:manipulation` ＋
  **決定論的トグル**（指を下ろした行だけを1回トグル。スクロール/ドラッグ/隣行ドリフトでは発火しない＝誤チェック防止）。
- **compare を開いている間**：メインの m-fab-stack を**下に移動**（消さない）。compare の×と重ならない。
- **Radius パネル**：モバイルでは左下の**コンパクトなカード**（地図とFABを塞がない）。
- ピンチズーム感度はユーザー設定時のみカスタム適用（既定は素のピンチ）。

---

## 10. 多言語対応の構造

- `i18n.en` / `i18n.jp` の辞書 ＋ `t(key)`。`data-i18n` / `data-i18n-ph` 属性を `updateI18n()` が一括適用。
- `currentLang`（`intmap_settings` に保存）。ヘッダの EN/JP トグル＋設定で切替。
- UI言語は en/jp のみ（DE/RU は UI から廃止。古い設定は en にフォールバック）。
- ニュースは**多言語取得＋AIタイトル翻訳**が任意機能（`newsLangMode`、`aiTranslateTitles()`）。

---

## 11. フィードバック・寄付・管理機能

- **フィードバック**：`feedback` テーブル。`recordLogin()` が本物のログインを数え、3回目に既存モーダルを1回表示。
- **寄付**：Stripe リンク（言語別）。
  - EN: `https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en`
  - JP: `https://donate.stripe.com/8x29AM9Qa2se7JYetA5gc00?locale=ja`
  - 記録は `donations` テーブル。
- **管理コンソール `admin.html`**：`geo_pins`（ニュース辞書）の追加/編集、`dashboard_cards` 編集、
  `community_reports` の対応、`feedback` 閲覧、`community_posts/comments` のモデレーション。

---

## 12. 壊れやすい部分・注意すべき部分

- **【最重要】JSテンプレートリテラル内のCSSにバッククォートを書くと全画面が真っ白**（コメント内でも）。動的CSSは `'...'` で。
- **「パースOK」≠「動作OK」**。必ず**レイヤー行≈72個** ＋ **コンソールエラー0** を確認する。
- **basemap スタイル切替（Map↔Sat）はカスタム source/layer を破棄する**。`countries`/`country-fill` 等は
  必要時に再生成する（Countries(info) ハンドラは `addCountryLayers()` を再実行して自己修復）。
- **`reorganizeLayerPanel()` は DOM を大量に並べ替える**。タップ中に走ると行がずれて誤タップの原因になり得る。
- **ケッペンのOOMクラッシュ**：モバイルは必ず軽量 `*_4k.png` を使う（フル解像度はモバイルでRAM超過）。
- **ヘッドレスプレビューは `document.hidden`** で WebGL の `load` が発火しない。地図描画はDOM/状態/console で検証する。
  `requestAnimationFrame` も止まるため、UIのフェードイン等は `setTimeout` のフォールバックを持たせる（ウェルカムカード参照）。
- **ニュースは current_news 依存**：cron が動いていないとフロントは自動でライブRSSフォールバックに落ちる（鍵不要だがCORSプロキシ依存）。

## 13. 触ってよい部分 / 慎重に触るべき部分

**比較的安全（加算的に拡張しやすい）**
- 辞書の追加（`geo_pins`、クライアント `_EXTRA_GZ/_DEMONYM_GZ/_ORG_GZ`、サーバー `EMBEDDED_PLACES/DEMONYM_DICT/ORG_DICT`）。
- データレイヤーの追加（既存の setup パターンに倣う）。出典は `DATA_SOURCES` に追記。
- i18n 文言、ウィジェット、設定項目の追加。

**慎重に（壊れやすい中核）**
- `reorganizeLayerPanel()` / `_refreshActiveLayers()` / レイヤーパネルのDOM順序とスクロール補正。
- チェックボックスの決定論的トグル（`#layer-dropdown` の pointerdown/click ハンドラ）。
- `applyTheme()` / `_reassertBase()` / styledata 自己修復まわり。
- 投影・3D・compare の同期。Isolate のマスク順序(`toTop`)。
- AIプロキシ / refresh-news の鍵・上限・再利用ロジック。

---

## 14. 新しい環境で IntMap を復元する手順

1. **取得**：このリポジトリ一式を配置（`index.html` がそのまま本体）。
2. **Supabase プロジェクト**：プロジェクトを用意し、`index.html` の `window.SUPABASE_URL` /
   `window.SUPABASE_ANON_KEY` を自分のプロジェクトの URL・publishable(anon) キーに差し替え。
3. **SQL 実行**（SQL Editor で一度ずつ）:
   - `supabase/supabase_news_setup.sql`（`current_news` ＋ `analyzed_by` ＋ RLS ＋ cron例）。
   - `ai_usage` 用 SQL（`ai_usage` テーブル＋ `increment_ai_usage`/`refund_ai_usage` RPC＋`profiles.plan/login_count`）。
   - コミュニティ/プロフィール/favorites/dashboard_cards/feedback/donations 等のテーブル＋RLS（既存スキーマに準拠）。
4. **Edge Functions デプロイ**:
   - `supabase functions deploy ai-proxy`
   - `supabase functions deploy refresh-news --no-verify-jwt`
5. **Secrets 設定**:
   - `supabase secrets set AI_PROVIDER=anthropic`（または openai / gemini）
   - `supabase secrets set ANTHROPIC_API_KEY=...`（または OPENAI_API_KEY / GEMINI_API_KEY）
   - 任意: `AI_MODEL=...`, `REFRESH_SECRET=...`, `NEWS_AI=off`
6. **cron 設定**：`supabase_news_setup.sql` の pg_cron 例で `refresh-news` を約20分ごとに POST（`<PROJECT_REF>`・`<REFRESH_SECRET>` を置換）。
   初回は手動で1回 POST して `current_news` を埋める。
7. **静的ホスティング**：`index.html` / `admin.html` / `data/` / `koppen_*.png` / `sw.js` を静的配信（OneDrive 直配信 or 任意の静的ホスト）。
8. **OAuth/メール認証**：Supabase 認証で Google/Apple/メールを設定（任意）。
9. **動作確認**：ページを開き、(a) レイヤー行≈72個、(b) コンソールエラー0、(c) News タブでピンが即表示、
   (d) ログイン→AI機能が動く、を確認。

---

*変更履歴の詳細は `DEV-NOTES.md`、守るべき原則は `CONSTITUTION.md` を参照。*
