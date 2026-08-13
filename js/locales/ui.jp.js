/* ============================================================================
 *  IntMap · UI STRINGS — Japanese (日本語)   (#R221)
 * ----------------------------------------------------------------------------
 *  ONE LANGUAGE, ONE FILE. Moved out of js/i18n.js verbatim — not a character of the text below
 *  was retyped; only the object it sits in changed owner. See js/lang-registry.js for what a new
 *  language costs (this file, one row in LANGS, one import in src/main.js) and for why the
 *  the `inline` table exists (a NEW language uses it; the first five do not).
 *
 *  ⚠ A KEY MISSING FROM THIS FILE FALLS BACK TO ENGLISH, PER KEY — js/i18n.js chains the table
 *  onto the English one with Object.create, so a young translation shows its own language wherever
 *  it has one and English only where it does not. Nothing has to be kept in sync by hand.
 * ========================================================================== */
window.IntMapLang.define('jp', { ui: {
      lnkTerms:"利用規約", lnkPrivacy:"プライバシーポリシー", legalTabTerms:"規約", legalTabPrivacy:"プライバシー", commAddImage:"画像を追加",
      tabNews:"ニュース", tabSaved:"★ 保存済", tabInfo:"情報", tabCompanies:"企業", tabStats:"国別統計",
      searchPh:"ニュース・地域を検索...", filterCountriesPh:"国を絞り込み...", filterCompaniesPh:"企業を絞り込み...", pickCountryMap:"地図で国をクリックして追加", searchBtn:"検索", searchLoadBtn:"検索 / 再読込", loading:"記事を読み込み中...",
      noMatch:"該当する情報がありません", networkError:"ニュースを読み込めませんでした。再試行します…",
      emptyHint:"未選択です。地図には何も表示されていません。<br>上のタブを選ぶと情報が表示されます。",
      viewMap:"標準マップ", viewSat:"衛星写真", settings:"設定", modalTitle:"設定", close:"閉じる",
      setSecAppearance:"外観", setSecLayout:"レイアウトとパネル", setSecMap:"地図の動作", setSecUnits:"単位と時刻", setSecNews:"ニュースとティッカー", setSecAI:"AI", setSecKeys:"連携・キー", setSecAbout:"情報とサポート",
      lblTheme:"テーマ", lblTz:"基準タイムゾーン", tzSearch:"タイムゾーンを検索…", btnApply:"適用", optAuto:"システム標準", optLocal:"ローカル標準時 (端末依存)",
      dashCatMil:"軍事・戦略拠点", dashCatTech:"技術・サイバー", dashCatMar:"海上輸送・要衝", dashCatGeo:"地政学・気候",
      readWiki:"Wikipediaで詳細を見る ↗", measure:"距離計測", areaTool:"面積計測", radius:"半径", vol3dTool:"3D立体", points:"地点数", total:"合計距離", perimeter:"外周", area:"面積", clear:"クリア", undoPt:"一つ戻る",
      measureHint:"クリックで地点追加・ダブルクリックで確定", areaHint:"3点以上で範囲を囲む・ダブルクリックで確定", radiusHint:"地図をクリックで円を配置。複数配置可。",
      placeNames:"地名表示", geoLabels:"水域・地形ラベル", adminBounds:"州・県境", roadsLayer:"道路網", railLayer:"鉄道", countries:"国境・国情報", addCircle:"円を追加", removeAll:"全削除", color:"色",
      statPop:"人口", statGdp:"GDP(名目)", statGdpPc:"一人当たりGDP", statGdpPPP:"GDP(購買力平価)", statGdpPcPPP:"一人当たりGDP(PPP)", statArea:"面積", statDensity:"人口密度", statRegion:"地域", statSub:"小地域", statCapital:"首都", statCurrency:"通貨", statLang:"言語", statHDI:"HDI", statDem:"民主主義指数", statMil:"軍事費", statLife:"平均寿命", statInet:"ネット利用率",
      details:"詳細 ↗", loadingData:"国データを読み込み中...", dataNA:"データなし", noData:"国データを取得できませんでした。", sortGdp:"GDP", sortPop:"人口", sortArea:"面積", sortName:"50音", sortHDI:"HDI", sortMil:"軍事費", elev:"標高", bearing:"方位角", presetNone:"— 選択 —", presetLbl:"射程プリセット", opacity:"透明度", circumference:"円周", lblUnits:"計測単位", unitBoth:"メートル＋ヤードポンド", unitMetric:"メートルのみ", unitImperial:"ヤードポンドのみ", msPh:"世界中の地名を検索...",
      spRunway:"滑走路長", spGarrison:"駐留兵力", spOperator:"運用", spEstd:"開設", spAircraft:"主要機種", spType:"分類", spCapacity:"容量", spDepth:"水深", spOutput:"出力", spReserves:"埋蔵量",
      flat:"平面", globe:"地球儀", threeD:"⛰️ 3D", gridBtn:"🌐 グリッド", gridLayer:"🌐 グリッド・地名", widgetsBtn:"ウィジェット", lblTempUnit:"気温の単位", tempBoth:"°C + °F", tempC:"°Cのみ", tempF:"°Fのみ", measureBtn:"📏 計測", measureMenuBtn:"計測", measureDistBtn:"📏 距離・面積", areaBtn:"📐 面積", drawBtn:"✏️ 描画", vol3dBtn:"🧊 3D立体", droneBtn:"🛸 ドローン", radiusBtn:"⭕ 半径", objectsBtn:"🗂 オブジェクト", mScreenshot:"地図のスクリーンショット", shareMenuBtn:"共有", shareLinkBtn:"共有・リンク", layersBtn:"レイヤー ▾",
      ctxDropPin:"ピンを刺す", ctxMeasureFrom:"計測を開始", ctxPostHere:"コミュニティに投稿", ctxDistFrom:"直前ピンからの距離", ctxCopy:"座標をコピー", ctxClearPins:"全ピンを削除", ctxThisPoint:"この地点", coords:"座標", depth:"水深", climate:"気候区分", tlToday:"今日", tlTitle:"タイムマシン", tlMachine:"タイムマシン", tl10y:"10年前", tl5y:"5年前", tlNow:"現在",
      lblPinMode:"ニュースピン位置", pinModeLoc:"記事の場所", pinModePub:"発信地(報道機関本社)",
      lyrEEZ:"領海・EEZ", lyrShips:"船舶トラフィック(リアルタイム)", lyrPlanes:"航空トラフィック(リアルタイム)", lyrSats:"人工衛星(リアルタイム)", lyrThermal:"熱異常(火災)", planesZoomHint:"ズームインで航空機を表示", planesAreaHint:"ズームインで全域表示（現在は中央部のみ取得）", poiLabels:"施設・店舗・企業名", shipsZoomHint:"ズームインで船舶を表示", aisNoKey:"船舶のリアルタイム表示には AISstream.io の無料APIキーが必要です。設定から登録してください。", aisKeyLabel:"船舶トラフィック (AISstreamキー)", aisKeyHint:"aisstream.io で無料キーを取得し貼り付けると船舶のリアルタイム表示が有効になります。キーはこのブラウザにのみ保存されます。",
      filtCiv:"民間", filtMil:"軍用", filtAll:"全て", trafficFilter:"絞り込み", lyrTime:"レイヤー日付", thermWin24:"過去24時間", thermWin48:"過去48時間", thermWin72:"過去72時間",
      tabCommunity:"コミュニティ", commAdd:"+ 新規投稿", commAddArmed:"地図をクリックしてピンを刺してください", commTitle:"タイトル", commBody:"考察・発見・疑問を投稿してください...", commPost:"投稿", commCancel:"キャンセル", commEmpty:"投稿はまだありません。「+ 新規投稿」をタップして議論を始めましょう。", commComment:"コメント", commLocate:"地図で見る", commDelete:"削除", commReply:"返信", commWrite:"コメントを書く...", commPostNew:"新規投稿", commPlacedAt:"投稿位置", commSortHot:"話題", commSortNew:"新着", commSortTop:"人気", commSearchPh:"投稿を検索…", commInView:"表示範囲", commCat:"カテゴリ", commCatAll:"すべて", commEdit:"編集", commEdited:"編集済み", commEditPost:"投稿を編集", commSaveEdit:"変更を保存", commNoMatch:"条件に一致する投稿がありません。", borders:"国境線", compare:"比較", compareEmpty:"行をタップして国を選び比較", coCompareEmpty:"行をタップして会社を選び比較", compareView:"比較を表示", compareClear:"クリア", back:"戻る", deletePin:"削除",
      satCtrlTitle:"衛星画像", satProvider:"プロバイダ", satDate:"撮影日", satLatest:"最新（自動取得）", satMosaicSuffix:"雲なしモザイク", satLocked:"APIキーを登録", satPrevDay:"前日", satNextDay:"翌日", satKeysTitle:"衛星画像プロバイダ (BYOK)", satKeyHint:"APIキーを入力すると、Satelliteパネルで各プロバイダを選択できます。キーはこのブラウザにのみ保存されます。", satKeyConnected:"接続済み", satKeyNone:"未登録", satErrAuth:"{provider}: 認証に失敗しました — APIキーを確認してください", satErrTiles:"{provider}: 画像を取得できません — フォールバックに切替えました",
      aiSecTitle:"AI機能", aiSecHint:"内蔵AI — ログインすると無料でご利用いただけます（1日10回まで）。APIキーは不要です。",
      aiProvider:"AIプロバイダ", aiModel:"モデル", aiApiKey:"APIキー", aiKeyConnected:"接続済み", aiKeyNone:"未登録", aiGetKey:"キーを取得 ↗", aiOnDevice:"Chrome内で端末内実行されます（APIキー不要）。",
      aiTest:"接続テスト", aiTesting:"テスト中…", aiTestOk:"接続に成功しました ✓",
      aiNoKey:"先に 設定 → AI機能 でAPIキーを登録してください。", aiNoVision:"このモデルは画像を解析できません。GPT-4o / Claude 3.5 Sonnet / Gemini 1.5 Pro を選択してください。",
      aiChromeUnavail:"このブラウザではChrome内蔵AIを利用できません。Chrome 127以降で端末内AIを有効にするか、別のプロバイダを選択してください。",
      aiThinking:"AIが解析中…", aiError:"AIリクエストに失敗しました", aiCopy:"コピー", aiCopied:"コピーしました ✓", aiClose:"閉じる", aiRetry:"再試行",
      aiGeoBtn:"✨ 全ニュースをAIで地点解析", aiGeoBtnSub:"✨ 主題地をAI解析", aiGeoBtnPub:"✨ 発信元をAI解析", aiTranslateTitles:"タイトルを翻訳", aiGeoBusy:"地点解析中…", aiGeoNone:"解析する記事がありません。", aiGeoDone:"{n}件の地点を解析しました", aiGeoErr:"地点解析に失敗しました", aiTransBusy:"翻訳中…", aiTransDone:"{n}件のタイトルを翻訳しました", aiTransNone:"すでにこの言語のタイトルです。",
      lblNewsLang:"ニュースの言語", newsLangUi:"現在の言語のみ", newsLangMulti:"全言語（タイトルを自動翻訳）", lblAiLocate:"AIによる地点解析", aiLocManual:"手動（ボタン）", aiLocAuto:"全ニュースで自動実行",
      aiTranslate:"AI翻訳", aiShowOriginal:"原文", aiTransNoText:"翻訳できる本文がありません（ページ表示をお試しください）。",
      aiSumBtn:"この範囲をAIで要約", popInArea:"この範囲の人口", popCalcing:"人口を算出中…", popFail:"人口を取得できませんでした。もう一度お試しください。", newsInArea:"この範囲のニュース", elevProfile:"標高断面", finalizeMeas:"地図に残す", aiSumTitle:"エリア地政学ブリーフィング", aiSumSub:"選択範囲内のニュース {n}件", aiSumNoArea:"先に範囲を描画するか円を配置してください。", aiSumNoNews:"この範囲内にニュースピンがありません。",
      aiViewSumBtn:"今の表示エリアを要約", aiViewSumTitle:"画面内で起きていること",
      aiVisHead:"AI変化検出", aiVisBtn:"変化を検出", aiVisTitle:"衛星画像 変化レポート", aiVisSub:"{a} → {b} を比較", aiVisBefore:"過去", aiVisAfter:"新しい", aiVisCapturing:"画像を取得中…", aiVisPickDates:"比較する2つの日付を選択してください。", aiVisNeedsDated:"衛星モードで日付選択可能なプロバイダ（MODIS / VIIRS / Sentinel-2）に切替えてください。", aiVisCapFail:"地図画像を取得できませんでした。"
} });
