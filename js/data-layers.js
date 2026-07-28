/* ============================================================================
 *  IntMap · The data-layer catalogue + engine — IntMapModules.dataLayers  (#R164)
 * ----------------------------------------------------------------------------
 *  The big layers IIFE: layer i18n strings, the ~50 regular data layers (Köppen, weather, wind,
 *  sea level, choropleths, night lights, …), their legends, the layer-panel organisation, per-layer
 *  opacity, dated-layer refresh and the self-healing layer audit (window.IntMapLayerAudit).
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R164): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang, countryGeo -> HOST.countryGeo, unitMode -> HOST.unitMode, mapTooltipEl -> HOST.mapTooltipEl
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.dataLayers=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const _collapseGroup=HOST._collapseGroup, _imTouchPrimary=HOST._imTouchPrimary, addCountryLayers=HOST.addCountryLayers, cName=HOST.cName, convTempText=HOST.convTempText, countryStats=HOST.countryStats, ensureMapTooltip=HOST.ensureMapTooltip, ensureTerrainSource=HOST.ensureTerrainSource, escapeHtml=HOST.escapeHtml, fmtPc=HOST.fmtPc, fmtTemp=HOST.fmtTemp, i18n=HOST.i18n, imToast=HOST.imToast, isMobile=HOST.isMobile, loadCountryData=HOST.loadCountryData, positionTooltip=HOST.positionTooltip, renderCoordReadout=HOST.renderCoordReadout, satToast=HOST.satToast, t=HOST.t;
  (function(){
    if(!map) return;
    Object.assign(i18n.en,{ lyrEU:"EU members", lyrClimate:"Köppen climate", lyrTemp:"Air temperature (2 m)", lyrPrecip:"Precipitation (IMERG)", lyrPop:"Population density", lyrHDI:"HDI (2022)", lyrDem:"Democracy Index (2023)", lyrNATO:"NATO members", lyrNight:"Day / night", lgdTitle:"Köppen–Geiger", climAt:"Climate", lyrSection:"Data layers", lyrGrpGeo:"Strategic geography", lyrGrpStrat:"Strategic networks", lyrGrpWeather:"Weather & environment", optLight:"Light", optDark:"Dark", optCyber:"Cyber Terminal", optClassic:"Age of Discovery", optPsychedelic:"Psychedelic", optMilitary:"Military", optMedical:"Medical", optBaroque:"Baroque (European)", optTaisho:"Taishō Japan", lyrRadar:"Precipitation radar (live)", lyrClouds:"Clouds · infrared (live)", lyrSST:"Sea-surface temperature", lyrSnow:"Snow & ice cover", lyrAOD:"Aerosol / haze", lyrNightSat:"Night lights (satellite)", lyrWind:"Wind (animated)", lgdRadarTitle:"Rain rate", lgdSSTTitle:"Sea-surface temp", lgdWindTitle:"Wind speed", lblFeedback:"Feedback & bug report", sendFeedbackBtn:"⭐ Send feedback", reportBugBtn:"🐞 Report a bug", lblPlayground:"Playground (beta)", playgroundBtn:"🎮 Open Playground", worldExplorerBtn:"🌍 Satellite Drop" });
    Object.assign(i18n.jp,{ lyrEU:"EU加盟国", lyrClimate:"ケッペン気候区分", lyrTemp:"気温（2m・再解析）", lyrPrecip:"降水量 (IMERG)", lyrPop:"人口密度", lyrHDI:"HDI (2022)", lyrDem:"民主主義指数 (2023)", lyrNATO:"NATO加盟国", lyrNight:"昼/夜", lgdTitle:"ケッペン・ガイガー", climAt:"気候区分", lyrSection:"データレイヤー", lyrGrpGeo:"戦略地理", lyrGrpStrat:"戦略ネットワーク", lyrGrpWeather:"気象・環境", optLight:"ライト", optDark:"ダーク", optCyber:"サイバーターミナル", optClassic:"大航海時代", optPsychedelic:"サイケデリック", optMilitary:"ミリタリー", optMedical:"メディカル", optBaroque:"豪華絢爛（ヨーロッパ）", optTaisho:"大正ロマン", lyrRadar:"降水レーダー（実時間）", lyrClouds:"雲・赤外（実時間）", lyrSST:"海面水温", lyrSnow:"積雪・海氷", lyrAOD:"エアロゾル・煙霧", lyrNightSat:"夜間光（衛星）", lyrWind:"風（アニメーション）", lgdRadarTitle:"降水強度", lgdSSTTitle:"海面水温", lgdWindTitle:"風速", lblFeedback:"フィードバック・バグ報告", sendFeedbackBtn:"⭐ フィードバックを送る", reportBugBtn:"🐞 バグを報告", lblPlayground:"プレイグラウンド (ベータ)", playgroundBtn:"🎮 プレイグラウンドを開く", worldExplorerBtn:"🌍 サテライトドロップ" });
    /* (#R12) New layer-category labels for the re-organized panel. */
    Object.assign(i18n.en,{ lyrGrpClimate:"Climate & weather", lyrGrpHazard:"Hazards & night sky", lyrGrpDemo:"Population & economy", lyrGrpGeoPol:"Geopolitics & defense", lyrGrpOthers:"Others (beta)" });
    Object.assign(i18n.jp,{ lyrGrpClimate:"気候・気象", lyrGrpHazard:"災害・夜空", lyrGrpDemo:"人口・経済", lyrGrpGeoPol:"地政学・防衛", lyrGrpOthers:"ベータ版・その他" });
    Object.assign(i18n.es,{ lyrGrpClimate:"Clima y meteorología", lyrGrpHazard:"Riesgos y cielo nocturno", lyrGrpDemo:"Población y economía", lyrGrpGeoPol:"Geopolítica y defensa", lyrGrpOthers:"Otras (beta)", lyrGrpMaritime:"Océanos y marítimo", lyrGrpTerrain:"Terreno y tierra", lyrGrpIndic:"Indicadores y capas" });   /* (#R40) Spanish layer-group names */
    /* (#R41) Russian layer-group names were MISSING entirely → group headers showed English in RU. */
    Object.assign(i18n.ru,{ lyrGrpClimate:"Климат и погода", lyrGrpHazard:"Опасности и ночное небо", lyrGrpDemo:"Население и экономика", lyrGrpGeoPol:"Геополитика и оборона", lyrGrpOthers:"Прочее (бета)", lyrGrpMaritime:"Океаны и море", lyrGrpTerrain:"Рельеф и высота", lyrGrpIndic:"Индикаторы и слои" });
    Object.assign(i18n.en,{ lyrGrpMaritime:"Oceans & maritime", lyrGrpIndic:"Indicators & overlays", lyrGrpTerrain:"Terrain & elevation", lyrHillshade:"Elevation relief (hillshade)", lyrContours:"Contour lines", lyrPopGrid:"Population density (1 km grid)", lgdTempTitle:"Air temp (2 m)", lyrTimeMonth:"Month", lblLang:"Language", newsLangMultiSel:"Multiple languages…", newsLangHint:"Headlines from each chosen language appear together; with an AI key their titles are auto-translated.", mTitleMap:"Map", mTitleTools:"Tools", mDone:"Done", lyrRelief:"Elevation (color relief)", lyrSubcables:"Submarine cables", lgdReliefTitle:"Elevation", lgdSubcablesTitle:"Submarine cables", lyrMilSpend:"Military spending ($B)", lyrMilSpendGDP:"Military spending (% GDP)", lyrGDPpc:"GDP per capita", lyrTFR:"Total fertility rate", lyrSeaLevel:"Sea-level change", lgdSeaLevelTitle:"Sea-level change" });
    Object.assign(i18n.jp,{ lyrGrpMaritime:"海洋・船舶", lyrGrpIndic:"指標・オーバーレイ", lyrGrpTerrain:"地形・標高", lyrHillshade:"陰影起伏（標高）", lyrContours:"等高線", lyrPopGrid:"人口密度（1kmグリッド）", lgdTempTitle:"気温(2m)", lyrTimeMonth:"月", lblLang:"言語", newsLangMultiSel:"複数の言語…", newsLangHint:"選択した各言語の見出しがまとめて表示されます。AIキーがあればタイトルを自動翻訳します。", mTitleMap:"地図", mTitleTools:"ツール", mDone:"完了", lyrRelief:"標高（カラー段彩）", lyrSubcables:"海底ケーブル", lgdReliefTitle:"標高", lgdSubcablesTitle:"海底ケーブル", lyrMilSpend:"国防費（$B）", lyrMilSpendGDP:"国防費（対GDP比）", lyrGDPpc:"1人当たりGDP", lyrTFR:"合計特殊出生率", lyrSeaLevel:"海面変動", lgdSeaLevelTitle:"海面変動" });
    /* (#R32) German for the layer panel + theme names + sections so DE isn't just the top chrome ("細部までドイツ語対応"). */
    Object.assign(i18n.de,{ lyrEU:"EU-Mitglieder", lyrClimate:"Köppen-Klima", lyrTemp:"Lufttemperatur (2 m)", lyrPrecip:"Niederschlag (IMERG)", lyrPop:"Bevölkerungsdichte", lyrHDI:"HDI (2022)", lyrDem:"Demokratieindex (2023)", lyrNATO:"NATO-Mitglieder", lyrNight:"Tag / Nacht", lgdTitle:"Köppen–Geiger", climAt:"Klima", lyrSection:"Datenebenen", lyrGrpGeo:"Strategische Geografie", lyrGrpStrat:"Strategische Netze", lyrGrpWeather:"Wetter & Umwelt", optLight:"Hell", optDark:"Dunkel", optCyber:"Cyber-Terminal", optClassic:"Zeitalter der Entdeckungen", optPsychedelic:"Psychedelisch", optMilitary:"Militärisch", optMedical:"Medizinisch", optBaroque:"Barock (europäisch)", optTaisho:"Taishō-Japan", lyrRadar:"Niederschlagsradar (live)", lyrClouds:"Wolken · Infrarot (live)", lyrSST:"Meeresoberflächentemperatur", lyrSnow:"Schnee & Eis", lyrAOD:"Aerosol / Dunst", lyrNightSat:"Nachtlichter (Satellit)", lyrWind:"Wind (animiert)", lgdRadarTitle:"Regenrate", lgdSSTTitle:"Meerestemperatur", lgdWindTitle:"Windgeschwindigkeit", lblFeedback:"Feedback & Fehlerbericht", sendFeedbackBtn:"⭐ Feedback senden", reportBugBtn:"🐞 Fehler melden", lblPlayground:"Spielwiese (Beta)", playgroundBtn:"🎮 Spielwiese öffnen", worldExplorerBtn:"🌍 Satellite Drop",
      lyrGrpClimate:"Klima & Wetter", lyrGrpHazard:"Gefahren & Nachthimmel", lyrGrpDemo:"Bevölkerung & Wirtschaft", lyrGrpGeoPol:"Geopolitik & Verteidigung", lyrGrpOthers:"Weitere (Beta)",
      lyrGrpMaritime:"Ozeane & Seefahrt", lyrGrpIndic:"Indikatoren & Overlays", lyrGrpTerrain:"Gelände & Höhe", lyrHillshade:"Reliefschattierung", lyrContours:"Höhenlinien", lyrPopGrid:"Bevölkerungsdichte (1-km-Raster)", lgdTempTitle:"Lufttemp. (2 m)", lyrTimeMonth:"Monat", mTitleMap:"Karte", mTitleTools:"Werkzeuge", mDone:"Fertig", lyrRelief:"Höhe (Farbrelief)", lyrSubcables:"Seekabel", lgdReliefTitle:"Höhe", lgdSubcablesTitle:"Seekabel", lyrMilSpend:"Militärausgaben ($ Mrd.)", lyrMilSpendGDP:"Militärausgaben (% BIP)", lyrGDPpc:"BIP pro Kopf", lyrTFR:"Geburtenrate", lyrSeaLevel:"Meeresspiegeländerung", lgdSeaLevelTitle:"Meeresspiegeländerung" });
    /* (#R33) German country-stat + common labels so the country panel/stats aren't English in DE mode. */
    Object.assign(i18n.de,{ statPop:"Bevölkerung", statGdp:"BIP (nominal)", statGdpPc:"BIP pro Kopf", statGdpPPP:"BIP (KKP)", statGdpPcPPP:"BIP pro Kopf (KKP)", statArea:"Fläche", statDensity:"Bev.-dichte", statRegion:"Region", statSub:"Subregion", statCapital:"Hauptstadt", statCurrency:"Währung", statLang:"Sprachen", statHDI:"HDI", statDem:"Demokratie-Idx", statMil:"Militärausgaben", statLife:"Lebenserwartung", statInet:"Internetnutzer", dataNA:"—", points:"Punkte", total:"Gesamt", perimeter:"Umfang", area:"Fläche", radius:"Radius", circumference:"Umfang", opacity:"Deckkraft", color:"Farbe", presetLbl:"Voreinstellung", clear:"Löschen", undoPt:"Punkt zurück", removeAll:"Alle entfernen", finalizeMeas:"Auf Karte behalten", elevProfile:"Höhenprofil", newsInArea:"Nachrichten im Gebiet", bearing:"Peilung", tabNews:"Nachrichten", tabInfo:"Informationen", tabStats:"Länder" });
    /* (#R36) Complete the German dictionary so every t()-driven dynamic surface (measure/area/radius tool,
       community, satellite controller, AI features, context menu, sources/premium modals, etc.) renders in
       German instead of falling back to English — closes the visible EN-leak in DE mode. */
    Object.assign(i18n.de,{
      loading:"Artikel werden geladen...", noMatch:"Keine Ergebnisse gefunden.", networkError:"Nachrichten konnten nicht geladen werden. Erneuter Versuch…",
      emptyHint:"Kein Tab ausgewählt — die Karte ist frei.<br>Wählen Sie oben einen Tab, um Inhalte anzuzeigen.",
      dashCatMil:"Militärbasen", dashCatTech:"Technik / Cyber", dashCatMar:"Maritim / Engstellen", dashCatGeo:"Geo / Klima", readWiki:"Auf Wikipedia lesen ↗",
      measure:"Messen", areaTool:"Fläche", measureHint:"Klicken zum Hinzufügen von Punkten · Doppelklick zum Beenden", areaHint:"3+ Punkte zum Umschließen hinzufügen · Doppelklick zum Beenden",
      radiusHint:"Klicken Sie auf die Karte, um einen Kreis zu platzieren. Mehrere Kreise möglich.", addCircle:"Kreis platzieren", details:"Details ↗",
      loadingData:"Länderdaten werden geladen...", noData:"Länderdaten nicht verfügbar.", sortGdp:"BIP", sortPop:"Bev.", sortArea:"Fläche", sortName:"A–Z", sortHDI:"HDI", sortMil:"Mil.$", elev:"Höhe", presetNone:"— auswählen —",
      spRunway:"Start-/Landebahn", spGarrison:"Garnison", spOperator:"Betreiber", spEstd:"Gegründet", spAircraft:"Flugzeuge", spType:"Typ", spCapacity:"Kapazität", spDepth:"Tiefe", spOutput:"Leistung", spReserves:"Reserven",
      widgetsBtn:"Widgets", measureBtn:"📏 Messen", areaBtn:"📐 Fläche",
      ctxDropPin:"Pin hier setzen", ctxMeasureFrom:"Messung hier beginnen", ctxPostHere:"Hier posten (Community)", ctxDistFrom:"Entfernung vom vorherigen Pin", ctxCopy:"Koordinaten kopieren", ctxClearPins:"Alle Pins entfernen", ctxThisPoint:"Dieser Punkt", coords:"Koordinaten", depth:"Tiefe", climate:"Klima",
      lyrEEZ:"Maritime AWZ / 12 sm", lyrShips:"Live-Schiffsverkehr", lyrPlanes:"Live-Flugverkehr", lyrThermal:"Wärmeanomalien (Brände)",
      planesZoomHint:"🔍 Hineinzoomen, um Live-Flugzeuge zu laden", shipsZoomHint:"🔍 Hineinzoomen, um Live-Schiffe zu laden", aisNoKey:"Live-Schiffe benötigen einen kostenlosen AISstream.io-API-Schlüssel — in den Einstellungen hinzufügen.", trafficFilter:"Filter", lyrTime:"Ebenendatum",
      commAdd:"+ Neuer Beitrag", commAddArmed:"Auf die Karte klicken, um einen Pin zu setzen", commTitle:"Titel", commBody:"Teilen Sie eine Beobachtung, Frage oder Theorie...", commPost:"Veröffentlichen", commCancel:"Abbrechen", commEmpty:"Noch keine Beiträge. Klicken Sie auf \"+ Neuer Beitrag\", um die Diskussion zu starten.", commComment:"Kommentar", commLocate:"Auf Karte anzeigen", commDelete:"Löschen", commReply:"Antworten", commWrite:"Kommentar schreiben...", commPostNew:"Neuer Beitrag", commPlacedAt:"Platziert bei", commSortHot:"Beliebt", commSortNew:"Neu", commSortTop:"Top", commSearchPh:"Beiträge suchen…", commInView:"Im Sichtfeld", commCat:"Kategorie", commCatAll:"Alle", commEdit:"Bearbeiten", commEdited:"bearbeitet", commEditPost:"Beitrag bearbeiten", commSaveEdit:"Änderungen speichern", commNoMatch:"Keine Beiträge entsprechen Ihren Filtern.",
      compare:"Vergleichen", compareEmpty:"Länderzeilen antippen zum Auswählen und Vergleichen.", compareView:"Vergleich anzeigen", compareClear:"Löschen", back:"Zurück", deletePin:"Löschen",
      satCtrlTitle:"Satellitenbilder", satProvider:"Anbieter", satDate:"Aufnahmedatum", satLatest:"Neueste verfügbar", satMosaicSuffix:"wolkenloses Mosaik", satLocked:"API-Schlüssel hinzufügen", satPrevDay:"Vorheriger Tag", satNextDay:"Nächster Tag", satKeyConnected:"Verbunden", satKeyNone:"Kein Schlüssel", satErrAuth:"{provider}: Authentifizierung fehlgeschlagen — API-Schlüssel prüfen", satErrTiles:"{provider}: Bilder nicht verfügbar — auf Ausweichquelle umgeschaltet",
      aiProvider:"KI-Anbieter", aiModel:"Modell", aiApiKey:"API-Schlüssel", aiKeyConnected:"Verbunden", aiKeyNone:"Kein Schlüssel", aiGetKey:"Schlüssel erhalten ↗", aiOnDevice:"Läuft auf dem Gerät in Chrome — kein API-Schlüssel nötig.", aiTest:"Verbindung testen", aiTesting:"Wird getestet…", aiTestOk:"Verbindung OK ✓", aiNoKey:"Fügen Sie zuerst einen KI-API-Schlüssel unter Einstellungen → KI-Funktionen hinzu.", aiNoVision:"Dieses Modell kann keine Bilder lesen. Wählen Sie GPT-4o, Claude 3.5 Sonnet oder Gemini 1.5 Pro.", aiChromeUnavail:"Die integrierte Chrome-KI ist hier nicht verfügbar. Verwenden Sie Chrome 127+ mit aktivierter On-Device-KI oder wählen Sie einen anderen Anbieter.", aiThinking:"KI analysiert…", aiError:"KI-Anfrage fehlgeschlagen", aiCopy:"Kopieren", aiCopied:"Kopiert ✓", aiClose:"Schließen", aiRetry:"Erneut versuchen",
      aiGeoBtn:"✨ Alle Nachrichten per KI verorten", aiGeoBtnSub:"✨ Thema per KI verorten", aiGeoBtnPub:"✨ Herausgeber per KI verorten", aiGeoBusy:"Wird verortet…", aiGeoNone:"Nichts zu verorten.", aiGeoDone:"{n} Meldungen verortet", aiGeoErr:"Geokodierung fehlgeschlagen", aiTransBusy:"Wird übersetzt…", aiTransDone:"{n} Titel übersetzt", aiTransNone:"Titel bereits in Ihrer Sprache.", aiTranslate:"Übersetzen", aiShowOriginal:"Original", aiTransNoText:"Kein Artikeltext zum Übersetzen — versuchen Sie die Web-Ansicht.",
      aiSumBtn:"Dieses Gebiet mit KI zusammenfassen", aiSumTitle:"Gebietsbriefing", aiSumSub:"{n} Nachrichten-Pins im ausgewählten Gebiet", aiSumNoArea:"Zeichnen Sie zuerst ein Gebiet oder platzieren Sie einen Kreis.", aiSumNoNews:"Keine Nachrichten-Pins in diesem Gebiet.", aiViewSumTitle:"Was auf dem Bildschirm passiert",
      aiVisHead:"KI-Änderungserkennung", aiVisBtn:"Änderungen erkennen", aiVisTitle:"Satelliten-Änderungsbericht", aiVisSub:"Vergleich {a} → {b}", aiVisBefore:"Vorher", aiVisAfter:"Nachher", aiVisCapturing:"Bilder werden erfasst…", aiVisPickDates:"Wählen Sie zwei Daten zum Vergleich.", aiVisNeedsDated:"Wechseln Sie im Satellitenmodus zu einem Anbieter mit Datumsauswahl (MODIS / VIIRS / Sentinel-2).", aiVisCapFail:"Die Kartenbilder konnten nicht erfasst werden.",
      lblNavInertia:"Trägheit", proSection:"Premium-Funktionen", proArchive:"🔒 10-Jahre-Zeitreise-Archiv", proIntel:"🔒 RU·CN lokale Primärquellen-Intel", proModalTitle:"IntMap Pro freischalten", proModalSub:"Gehen Sie über die Live-Karte hinaus — tiefe historische Archive und Primärquellen-Informationen.", srcModalTitle:"Datenquellen & Namensnennung", srcModalSub:"IntMap aggregiert die folgenden Drittanbieter-Daten, -Bilder und -APIs. Alle Marken gehören ihren Eigentümern.", screenshotSaved:"Screenshot gespeichert ✓", screenshotBusy:"Wird erfasst…", measureClickClose:"Klicken Sie auf den ersten Punkt zum Schließen",
      blueberryTitle:"IntMap unterstützen", blueberryBody:"Mein Ziel ist es, eine Karte zu schaffen, auf der Geografie, Klima, Geschichte, Ökologie, Demografie und das Weltgeschehen an einem Ort erkundet werden können.\nIntMap wird unabhängig entwickelt und wird laufend um neue Ebenen, Datensätze und Funktionen erweitert.\nWenn Ihnen IntMap gefällt und Sie seine zukünftige Entwicklung unterstützen möchten, können Sie unten beitragen.", blueberryGo:"Betrag auswählen ↗", blueberryNote:"Öffnet eine externe Seite (Stripe)."
    });

    const style=document.createElement('style');
    style.textContent=`
      .lyr-row{ display:flex; flex-direction:column; gap:2px; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
      .lyr-op{ width:100%; accent-color:var(--primary-color); display:none; margin:0 0 4px 24px; }
      .lyr-row.on .lyr-op{ display:block; }
      /* (#R128) NORMAL / desktop category heading. It was 12.5px muted — SMALLER and greyer than its own 13px
         layer rows, so a section title read as a de-emphasised sub-item ("分類名のテキストサイズが小さい・余白に
         合ってない・UIとしておかしい"). Make it a real heading: clearly larger than the rows (15.5px vs 13px),
         bold, full text colour, with a top margin that gives each group visible breathing room. Mirrors the mobile
         sheet's 18.5px-over-15.5px step (R127). */
      .lyr-head{ font-size:15.5px; font-weight:700; color:var(--text-main); margin:14px 2px 6px; text-transform:none; letter-spacing:-0.01em; }
      /* (#R15 / #26) "Others (beta)" group note */
      .lyr-others-note{ font-size:10.5px; color:var(--text-muted); opacity:0.8; margin:0 2px 4px; line-height:1.4; font-style:italic; }
      /* (#R8c) Desktop Köppen legend: FULL-HEIGHT by default (no scroll — all ~30 classes fit), and the
         ONLY legend that is resizable like a desktop window — vertical-only via the native resize grabber
         (CSS resize:vertical). Anchored to the top with an explicit height so the grabber actually resizes. */
      /* (#R9/#24) The legend box itself no longer scrolls — only the inner .kl-scroll does — so the title,
         the ⋮⋮ drag handle and the min/close buttons (all anchored to this non-scrolling box) stay pinned
         at the top while the climate rows scroll under them. */
      /* (#R10) Flex column (shown via inline display:flex): header (h4) pinned top, .kl-scroll flexes +
         scrolls, footer (opacity slider + hint) pinned bottom — so the opacity slider & minimise button
         are never clipped (the old overflow-hidden + max-height combo clipped them). */
      /* (#R13c) Width is LOCKED (min=max=216) so the native resize grabber can only change HEIGHT — the
         user reported the legend "stretching left-right"; vertical-only resize is the requested behavior. */
      /* (#R145) COMPACT legends: tighter padding/width/font. (#R146) but the 56dvh cap meant the vertical-resize grabber
         couldn't be dragged tall enough to reveal all 30 Köppen classes ("長く伸ばせられない") — restore the near-full-viewport
         ceiling so the legend can be stretched long again; height stays auto (fits content) with a comfortable default. */
      .koppen-legend{ box-sizing:border-box; display:none; flex-direction:column; position:absolute; top:74px; bottom:auto; left:24px; right:auto; z-index:1100; background:var(--popup-bg); border:1px solid rgba(128,128,128,0.15); border-radius:11px; padding:7px 10px; box-shadow:var(--shadow); backdrop-filter:blur(15px); height:auto; min-height:150px; max-height:calc(100dvh - 84px); overflow:hidden; resize:vertical; width:220px; min-width:180px; max-width:460px; font-size:10.4px; }   /* (#R155) box-sizing:border-box is load-bearing — the width _fitKoppenLegend sets now INCLUDES the 20px padding + 2px border, so the panel really hugs the text (the old content-box math under-counted them → "テキスト以上に横幅伸ばして…行の幅変わってない" dead space). max-width raised 340→460 so the longest German/Russian names are no longer clipped ("行の幅が狭すぎる"). width:220 is the pre-JS fallback. */
      .koppen-legend .kl-scroll{ overflow-y:auto; flex:1 1 auto; min-height:0; margin-top:1px; scrollbar-gutter:stable; }   /* (#R151) reserve the scrollbar gutter ALWAYS so climate-name rows keep a constant width while the legend is resized ("気候名の行幅が勝手に動かないように") — the appearing/disappearing scrollbar was stealing ~15px and reflowing the row text */
      /* (#R15 / #37) Make the vertical-resize grabber VISIBLE so users discover it — the user reported the
         resize "isn't implemented", but it was: the native grabber was just painted transparent. Now it
         shows a small diagonal grip at the bottom-right, matching the resize:vertical affordance. */
      .koppen-legend::-webkit-resizer{ background:linear-gradient(135deg, transparent 0 44%, var(--text-muted) 44% 52%, transparent 52% 68%, var(--text-muted) 68% 76%, transparent 76%); }
      .koppen-legend.legend-collapsed{ resize:none !important; }
      .koppen-legend h4{ margin:0 0 2px; font-size:11px; padding-right:18px; } .koppen-legend .kl-hint{ color:var(--text-muted); margin-top:2px; font-size:9px; line-height:1.35; }   /* (#R149/#R152) compact chrome so all 30 zones fit */
      .kl-period{ display:flex; align-items:center; gap:6px; margin:0 0 3px; }
      .kl-period label{ font-size:11px; color:var(--text-muted); }
      .kl-period select{ flex:1; background:var(--input-bg); color:var(--text-main); border:1px solid var(--glass-border,rgba(128,128,128,0.25)); border-radius:6px; padding:3px 6px; font-size:11.5px; cursor:pointer; }
      .legend-collapsed .kl-period{ display:none !important; }
      .kl-item{ display:flex; align-items:center; gap:6px; padding:0 4px; cursor:pointer; border-radius:5px; white-space:nowrap; line-height:1.2; }   /* (#R152) white-space:nowrap = ONE line per zone (was wrapping to 2 for the 14 long names → doubled the legend height); the code stays fixed, only the name ellipsises. (#R153) vertical padding 0.5px→0 + line-height 1.25→1.2 shaves ~35px off the 30-row block so the whole legend clears a 1366×768 laptop and the LAST zone (EF) is reachable by stretching. */
      .kl-item .kl-code{ flex-shrink:0; font-weight:600; }   /* (#R152) climate code always fully visible — it is the canonical identifier, so ellipsising the name never loses which zone a row is */
      .kl-item .kl-nm{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-muted); }   /* (#R152) name ellipsises on one line (full text on hover via title=) so rows stay 14px and 30 zones fit the screen */
      .kl-item:hover{ background:var(--input-bg); } .kl-item.sel{ font-weight:700; background:var(--input-bg); outline:2px solid var(--primary-color); } .kl-item.sel .kl-nm{ color:var(--text-main); }
      .kl-sw{ width:11px; height:11px; border-radius:3px; flex-shrink:0; border:1px solid rgba(0,0,0,0.2); }
      .kl-clear{ width:100%; margin-top:6px; padding:5px; background:var(--input-bg); color:var(--text-main); border:none; border-radius:7px; cursor:pointer; font-size:10.5px; font-weight:600; }
      .kl-clear:hover{ background:var(--primary-color); color:#fff; }
      .layer-popup-x{ position:absolute; top:6px; right:8px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:4px 6px; border-radius:6px; line-height:1; }
      .layer-popup-x:hover{ background:var(--input-bg); color:var(--info-mil); }
      /* Generic color-scale legend (HDI/Dem/Pop/NATO) */
      .data-legend{ display:none; position:absolute; left:24px; right:auto; z-index:1100; background:var(--popup-bg); border:1px solid rgba(128,128,128,0.15); border-radius:11px; padding:8px 10px; box-shadow:var(--shadow); backdrop-filter:blur(15px); width:178px; font-size:10.5px; }
      .data-legend h4{ margin:0 0 5px; font-size:11px; padding-right:18px; }
      .data-legend .dl-bar{ height:8px; border-radius:4px; margin:4px 0 3px; border:1px solid rgba(0,0,0,0.1); }
      .data-legend .dl-scale{ display:flex; justify-content:space-between; color:var(--text-muted); font-size:9.5px; }
      .data-legend .dl-hint{ color:var(--text-muted); margin-top:5px; font-size:9.5px; }
      /* (#R39) Short "what is this data" explanation for the non-obvious metrics. */
      .data-legend .dl-desc{ color:var(--text-main); opacity:0.82; margin-top:5px; font-size:9.5px; line-height:1.45; border-top:1px solid var(--glass-border,rgba(128,128,128,0.16)); padding-top:5px; }
      /* #30 — balanced legend header controls: drag handle (top-left), minimize + close (top-right,
         same size, evenly spaced), and the title padded so it never collides with either side. */
      .koppen-legend h4, .data-legend h4{ padding:0 44px 0 18px !important; min-height:16px; display:flex; align-items:center; }
      /* (#R8b) Minimize/close icons are DRAWN as CSS shapes at EVERY width (desktop · tablet · phone) —
         NOT font glyphs. ▢ / – / ✕ have different ink positions, so as glyphs they never quite line up;
         as identical centerd bars they are pixel-aligned at any DPR. (The earlier fix only covered ≤768px,
         leaving tablet/landscape-phone widths with the misaligned glyphs the user still saw.) */
      /* (#R8c) ONE shared declaration for the box, so close & min cannot diverge in top/size — only the
         horizontal offset differs. Verified on a live legend: both buttons share top and height exactly. */
      /* (#R9/#25) Center EVERY icon with transform:translate(-50%,-50%) — size-INDEPENDENT, so close (×),
         minimise (–) and collapsed (▢) share one pixel-exact center at any box size / DPR. This removes
         the last sub-pixel vertical drift between □ and × (the negative-margin centring rounded the 1.8px
         bar and the 12px square differently). Larger sizes below change ONLY width/height. */
      .data-legend .layer-popup-x, .koppen-legend .layer-popup-x, .legend-min{ position:absolute; top:6px; width:20px; height:20px; padding:0; font-size:0; border-radius:6px; line-height:0; box-sizing:border-box; }
      .data-legend .layer-popup-x, .koppen-legend .layer-popup-x{ right:6px; }
      .legend-min{ right:30px; }
      .data-legend .layer-popup-x::before, .data-legend .layer-popup-x::after,
      .koppen-legend .layer-popup-x::before, .koppen-legend .layer-popup-x::after,
      .legend-min::before{ content:''; position:absolute; top:50%; left:50%; width:11px; height:1.8px; border-radius:2px; background:currentColor; transform:translate(-50%,-50%); }
      .data-legend .layer-popup-x::before, .koppen-legend .layer-popup-x::before{ transform:translate(-50%,-50%) rotate(45deg); }
      .data-legend .layer-popup-x::after,  .koppen-legend .layer-popup-x::after{ transform:translate(-50%,-50%) rotate(-45deg); }
      .legend-collapsed .legend-min::before{ width:12px; height:12px; background:none; border:1.8px solid currentColor; border-radius:3px; transform:translate(-50%,-50%); }
      .data-legend .dl-drag, .koppen-legend .kl-drag{ top:8px; left:7px; font-size:12px; }
      /* Köppen criteria popup (#25) */
      .koppen-info-pop{ display:none; position:absolute; z-index:1300; width:236px; max-width:calc(100vw - 24px); background:var(--glass-fill); border:1px solid var(--glass-border); border-radius:12px; padding:12px 14px; box-shadow:var(--shadow); backdrop-filter:saturate(var(--glass-sat)) blur(var(--glass-blur)); -webkit-backdrop-filter:saturate(var(--glass-sat)) blur(var(--glass-blur)); font-size:12px; }
      .koppen-info-pop .kip-x{ position:absolute; top:6px; right:6px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; line-height:1; padding:4px 6px; border-radius:6px; }
      .koppen-info-pop .kip-x:hover{ background:var(--input-bg); }
      .koppen-info-pop .kip-h{ display:flex; align-items:center; gap:7px; font-weight:600; font-size:13px; padding-right:22px; margin-bottom:6px; }
      .koppen-info-pop ul{ margin:0; padding-left:16px; color:var(--text-muted); line-height:1.5; } .koppen-info-pop li{ margin:2px 0; }
      /* (#R8b) Phones just enlarge the same drawn icons to 30px tap targets with a clear gap; the SHAPES
         (centerd bars) come from the global rules above, so desktop & mobile are identical & aligned. */
      @media(max-width:768px){
        /* (#R18) ONE size for EVERY mobile ×/–: 32px. The R17 40px boxes made the legend buttons huge
           while the rest stayed small ("×の大きさがバラバラ。凡例はデカすぎる") and bloated the minimised
           legend. 32px is still a comfortable tap target and identical across legends, popups and panels. */
        .data-legend .layer-popup-x, .koppen-legend .layer-popup-x,
        .data-legend .legend-min, .koppen-legend .legend-min{ top:6px !important; width:27px !important; height:27px !important; border-radius:8px; background:rgba(128,128,128,0.16); }
        .data-legend .layer-popup-x, .koppen-legend .layer-popup-x{ right:6px !important; }
        .data-legend .legend-min, .koppen-legend .legend-min{ right:37px !important; }
        .data-legend .layer-popup-x::before, .data-legend .layer-popup-x::after,
        .koppen-legend .layer-popup-x::before, .koppen-legend .layer-popup-x::after,
        .legend-min::before{ width:15px; height:2.1px; }   /* transform:translate(-50%,-50%) keeps them centerd at any size */
        /* (#R23) match the LEGEND ×'s exact look (gray rounded box) on EVERY popup × so they read as the
           same UI ("ポップアップの×は凡例と同じUIに") — not just the same size. */
        .koppen-info-pop .kip-x, .pin-popup-close{ width:32px !important; height:32px !important; font-size:17px !important; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16); top:6px !important; right:6px !important; }
        /* (#R24) tool-panel × (measure / radius / draw / LOS / route …) gets the SAME gray rounded box as
           the legend × so every popup close reads as one UI ("測定機能などの×も凡例と同じUIに"). */
        .tool-panel .tp-close{ width:32px !important; height:32px !important; font-size:17px; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16); position:relative; top:0; right:0; }
        /* (#R19) The R18 32px unification covered legends/tool-panels but MISSED the other popups
           ("凡例はちょうどいいが、その他ポップアップは大きさが変わっていない"): the place-search result card,
           every MapLibre popup (place-label / pin / news), and the country info card. One 32px size for all. */
        .src-card-close{ width:32px !important; height:32px !important; font-size:17px !important; padding:0 !important; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16); top:6px !important; right:6px !important; }
        .maplibregl-popup-close-button{ width:32px !important; height:32px !important; font-size:19px !important; line-height:1 !important; padding:0 !important; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16) !important; right:6px !important; top:6px !important; }
        /* (#R26 FIX) R25 added position:relative here, which OVERRODE the position:absolute these close
           buttons rely on for their top/right corner placement — so they jumped out of position and taps
           missed them entirely ("×を押しても反応しない"). Keep ONLY touch-action (kills the iOS click delay);
           never set position here (each button keeps its own absolute corner rule).
           NOTE: this whole CSS block is a JS template-literal string, so this comment must contain NO
           back-tick characters (one would close the string early and break the entire script). */
        .maplibregl-popup-close-button, .layer-popup-x, .legend-min, .kip-x, .pin-popup-close,
        .country-popup-close, #cp-close, .src-card-close, .tp-close, .satc-close, .wgt-x{
          touch-action:manipulation !important; }
        /* (#R20) the real close button is .country-popup-close / #cp-close — the R19 selectors
           (.cp-close as a CLASS, .country-close, #country-popup-close) matched nothing, which is why
           the country popup's × stayed tiny ("ポップアップの右上の×が小さすぎて押せない"). */
        .country-popup-close, #cp-close{ width:32px !important; height:32px !important; font-size:19px !important; padding:0 !important; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16); }
        .maplibregl-popup-content{ padding-right:40px; }
        /* (#R22) Catch-all so NO popup/panel × can stay tiny again — the satellite controller (was 26px)
           and every "Close" button get the same 32px tap target ("×が小さすぎて押せない" re-report). */
        .satc-close{ width:32px !important; height:32px !important; font-size:20px !important; display:flex !important; align-items:center; justify-content:center; }
        button[aria-label="Close"], .ai-panel-close, .ai-x, .nrp-close, .fb-x, #fb-x{ min-width:32px !important; min-height:32px !important; }
        /* (#R21) the last stragglers — widget board ✕/⚙ and the widget-gallery ✕ join the ONE 32px size */
        .wgt-x{ width:32px !important; height:32px !important; border-radius:9px !important; font-size:15px !important; }
        .wgt-cfg{ width:32px !important; height:32px !important; border-radius:16px !important; right:6px !important; }
        #wgt-g-close{ width:32px !important; height:32px !important; border-radius:9px !important; font-size:15px !important; }
        .legend-collapsed .legend-min::before{ width:12px; height:12px; }
        /* (#R35) Tool-panel (Measure/Draw) min+close get the SAME 32px tap target + box as the legends. */
        .tp-min-btn,.tp-close{ width:32px !important; height:32px !important; border-radius:9px; }
        .tp-min-btn::before{ width:15px; height:2.1px; }
        .tool-panel.tp-collapsed .tp-min-btn::before{ width:13px; height:13px; }
        .tp-close::before,.tp-close::after{ width:15px; height:2.1px; }
        /* Minimised legend: keep the header compact so the (now 32px) buttons don't dwarf the title. */
        .data-legend.legend-collapsed, .koppen-legend.legend-collapsed{ padding:6px 10px !important; min-width:150px; }
        .data-legend.legend-collapsed h4, .koppen-legend.legend-collapsed h4{ min-height:32px !important; display:flex; align-items:center; }
        .data-legend .layer-popup-x:active, .koppen-legend .layer-popup-x:active,
        .data-legend .legend-min:active, .koppen-legend .legend-min:active{ background:var(--input-bg); color:var(--text-main); }
        .data-legend .dl-drag, .koppen-legend .kl-drag{ top:10px !important; left:8px !important; font-size:13px !important; }
        .koppen-legend h4, .data-legend h4{ padding:0 78px 0 24px !important; min-height:32px !important; }
        /* (#R10) Mobile Köppen legend ≈ square (width ≈ height) and the climate rows slide inside it. */
        .koppen-legend{ width:min(66vw,252px) !important; right:12px !important; height:auto !important; min-height:0 !important; max-height:min(72vw,330px) !important; resize:none !important; }
        .koppen-legend .kl-scroll{ max-height:none !important; }
      }`;
    document.head.appendChild(style);

    const mc=document.getElementById('map-container');
    const legend=document.createElement('div'); legend.className='koppen-legend'; legend.id='koppen-legend'; mc.appendChild(legend);
    /* Data legends for HDI / Democracy / Pop density / NATO / EEZ / Temperature — colored scale bars */
    /* (#R39) Short "what is this data" explanations for the NON-obvious metrics (well-known ones like
       population density / GDP are left without one, per "よく知られているもの以外は…説明を入れて"). 4-language. */
    const LEGEND_DESC={
      hdi:['Human Development Index — a 0–1 blend of life expectancy, schooling and income. Higher = more developed.','人間開発指数 — 平均寿命・教育・所得を0〜1で合成した指標。高いほど発展。','Index der menschlichen Entwicklung — 0–1 aus Lebenserwartung, Bildung und Einkommen. Höher = entwickelter.','Индекс человеческого развития — 0–1 из продолжительности жизни, образования и дохода. Выше = развитее.'],
      dem:['EIU score (0–10) of elections, pluralism, civil liberties and governance. Higher = more democratic.','EIUによる選挙・多元性・自由・統治の評価（0〜10）。高いほど民主的。','EIU-Wert (0–10) für Wahlen, Pluralismus, Freiheiten und Regierungsführung. Höher = demokratischer.','Оценка EIU (0–10): выборы, плюрализм, свободы и управление. Выше = демократичнее.'],
      tfr:['Average number of children a woman would have over her lifetime; about 2.1 keeps a population stable.','女性が生涯に産む子どもの平均数。約2.1で人口が維持される。','Durchschnittliche Kinderzahl pro Frau; etwa 2,1 hält die Bevölkerung stabil.','Среднее число детей на женщину; около 2,1 удерживает население стабильным.'],
      milSpendGDP:['Defense budget as a share of the country’s GDP — its military burden on the economy.','国防費が国のGDPに占める割合。経済における軍事負担。','Verteidigungsbudget als Anteil am BIP — die militärische Last für die Wirtschaft.','Военный бюджет как доля ВВП — военная нагрузка на экономику.'],
      aod:['Aerosol optical depth — how much haze, smoke and dust dim sunlight in the air column.','エアロゾル光学的厚さ — 大気中の霞・煙・砂塵が日射を遮る度合い。','Aerosol-optische Dicke — wie stark Dunst, Rauch und Staub das Sonnenlicht dämpfen.','Аэрозольная оптическая толщина — насколько дымка, дым и пыль ослабляют солнечный свет.'],
      nightsat:['Artificial light at night, from satellite — a proxy for urbanization and economic activity.','衛星が捉えた夜間の人工光 — 都市化や経済活動の代理指標。','Künstliches Licht bei Nacht (Satellit) — ein Indikator für Urbanisierung und Wirtschaft.','Искусственный свет ночью со спутника — индикатор урбанизации и экономики.'],
      snow:['Snow and ice cover from satellite (NDSI index). Brighter = more snow/ice on the ground.','衛星による積雪・海氷（NDSI指数）。明るいほど積雪・氷が多い。','Schnee- und Eisbedeckung per Satellit (NDSI). Heller = mehr Schnee/Eis.','Снежный и ледяной покров со спутника (индекс NDSI). Ярче = больше снега/льда.'],
      /* (#R40) explanations for more non-obvious metrics (en + jp; de/ru/es fall back to en). Well-known ones
         (population, GDP, area, density) intentionally get none. */
      eez:['Exclusive Economic Zone — the sea a country controls for fishing & resources, out to 200 nautical miles.','排他的経済水域 — 漁業・資源を管理できる海域（沿岸から200海里）。'],
      sst:['Sea-surface temperature from satellite — the skin temperature of the ocean.','衛星による海面水温 — 海の表層の温度。'],
      popgrid:['People per km² on a fine 1 km grid (not country averages) — shows where people actually cluster.','1kmグリッドの人口密度（国平均ではない）— 実際に人が集まる場所がわかる。'],
      sealevel:['Projected coastline change if sea level rises by the chosen amount — areas below that height flood.','選んだ海面上昇量で浸水する沿岸域 — その標高以下が水没。'],
      subcables:['Submarine fibre-optic cables carrying almost all intercontinental internet traffic.','大陸間インターネットの大半を担う海底光ファイバーケーブル。'],
      plates:['Boundaries of Earth’s tectonic plates — where most earthquakes and volcanoes occur.','地球のプレート境界 — 地震・火山の多くが起きる場所。'],
      ecoregions:['Distinct ecological regions (WWF/RESOLVE) grouping similar species, climate and habitat.','類似の生物・気候・生息環境でまとめた生態地域（WWF/RESOLVE）。'],
      worldcover:['ESA satellite land-cover classes (forest, cropland, built-up, water…) at 10 m resolution.','ESA衛星による土地被覆分類（森林・農地・市街地・水域など、10m解像度）。'],
      aurora:['Modeled auroral oval — where the northern/southern lights are likely visible right now.','オーロラ帯のモデル — 今オーロラが見える可能性が高い場所。'],
      thermal:['Satellite-detected heat sources in the last hours — mostly wildfires, also flares and volcanoes.','直近数時間に衛星が検知した熱源 — 主に山火事、ガスフレアや火山も。'],
      cpi:['Transparency International score (0–100) of perceived public-sector corruption. Higher = cleaner.','トランスペアレンシーによる公的部門の汚職体感指数（0〜100）。高いほど清廉。'],
      wbco2:['Carbon-dioxide emissions per person per year (tonnes) — a country’s per-capita climate footprint.','1人当たりの年間CO₂排出量（トン）— 国民1人の気候負荷。'],
      wbgini:['Gini index of income inequality (0 = perfectly equal, 100 = maximally unequal).','所得格差のジニ指数（0=完全平等、100=最大格差）。'],
      wbpov:['Share of people living on less than ~$2.15 a day (extreme poverty).','1日約2.15ドル未満で暮らす人の割合（極度の貧困）。'],
      wbinfmort:['Infant deaths before age 1 per 1,000 live births — a core health/development indicator.','出生1000人当たりの満1歳未満の死亡数 — 基本的な保健・開発指標。'],
      wbu5mort:['Deaths before age 5 per 1,000 live births.','出生1000人当たりの5歳未満死亡数。'],
      wbgdpgrow:['Year-on-year real GDP growth (%) — how fast the economy is expanding or contracting.','実質GDPの前年比成長率（％）。'],
      wbinfl:['Annual consumer-price inflation (%) — how fast prices are rising.','消費者物価の年間インフレ率（％）。'],
      wbrenew:['Share of final energy from renewable sources (hydro, wind, solar, biomass…).','最終エネルギーに占める再生可能エネルギー（水力・風力・太陽光・バイオなど）の割合。'],
      wbphys:['Physicians per 1,000 people — a measure of healthcare capacity.','人口1000人当たりの医師数 — 医療提供力の指標。'],
      wbwater:['Share of people with safely managed drinking water.','安全に管理された飲料水を利用できる人の割合。'],
      wbagri:['Share of land used for agriculture (crops + pasture).','農業（耕地＋牧草地）に使われる土地の割合。'],
      milSpend:['Total annual defense budget in US$ billions.','年間の国防費総額（10億米ドル）。'],
      /* (#R41) new layers */
      tz:['Standard time-zone boundaries (Natural Earth) with each zone’s current local time, updated every minute.','標準時タイムゾーンの境界（Natural Earth）。各ゾーンの現在時刻を毎分更新して表示。','Standard-Zeitzonengrenzen (Natural Earth) mit der aktuellen Ortszeit je Zone, jede Minute aktualisiert.','Границы часовых поясов (Natural Earth) с текущим местным временем каждой зоны, обновление каждую минуту.','Límites de husos horarios (Natural Earth) con la hora local actual de cada zona, actualizada cada minuto.'],
      webcams:['Public webcams worldwide, loaded live from OpenStreetMap for the current view — pan/zoom for more. Click a point: YouTube/image/panorama cams play in the popup, others open the operator page.','世界中の公開ウェブカメラを、表示範囲に応じてOpenStreetMapからライブ取得（移動・拡大で追加読み込み）。点をクリックするとYouTube・画像・パノラマはその場で再生、その他は提供元ページを開きます。','Öffentliche Webcams weltweit, live aus OpenStreetMap für den aktuellen Ausschnitt geladen — zum Laden verschieben/zoomen. Punkt anklicken: YouTube/Bild/Panorama spielen im Popup, andere öffnen die Betreiberseite.','Общедоступные веб-камеры по всему миру, подгружаются вживую из OpenStreetMap для текущего вида — двигайте/масштабируйте. Нажмите точку: YouTube/изображение/панорама — в окне, прочие — на сайте оператора.','Cámaras web públicas de todo el mundo, cargadas en vivo desde OpenStreetMap para la vista actual — desplaza/amplía. Haz clic en un punto: YouTube/imagen/panorámica se reproducen en la ventana, las demás abren la página del operador.']
    };
    function _legendDesc(id){ const d=LEGEND_DESC[id]; if(!d||!d[0]) return ''; const i=HOST.lang==='jp'?1:HOST.lang==='de'?2:HOST.lang==='ru'?3:HOST.lang==='es'?4:0; return '<div class="dl-desc">'+(d[i]||d[0])+'</div>'; }
    window._legendDescHTML=_legendDesc;
    function makeLegend(id,bottomPx,title,gradient,labels,hint){
      const el=document.createElement('div'); el.className='data-legend'; el.id='data-legend-'+id;
      el.style.bottom=bottomPx+'px';
      const noData=(['hdi','dem','pop','gdppc','tfr','milSpend','milSpendGDP'].includes(id))?`<div style="display:flex;align-items:center;gap:6px;margin-top:7px;font-size:10px;color:var(--text-muted);"><span style="display:inline-block;width:14px;height:10px;border-radius:3px;background:#9aa0a6;border:1px solid rgba(0,0,0,0.12);"></span>${HOST.lang==='jp'?'データなし':HOST.lang==='de'?'Keine Daten':HOST.lang==='ru'?'Нет данных':HOST.lang==='es'?'Sin datos':'No data'}</div>`:'';
      el.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="${id}" title="${t('close')}">✕</button><h4>${title}</h4><div class="dl-bar" style="background:${gradient};"></div><div class="dl-scale"><span>${labels[0]}</span><span>${labels[1]}</span></div>${noData}${hint?`<div class="dl-hint">${hint}</div>`:''}${_legendDesc(id)}`;
      mc.appendChild(el);
      el.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-'+id); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
      /* Drag (mouse + touch) is wired centrally by wireDrag() once it is defined below, so every
         data-legend behaves like the Köppen legend and stays movable on phones too (#10). */
      return el;
    }
    /* (#R110) the core data-legends bake `currentLang` at construction, so a LANGUAGE CHANGE left already-shown
       legends in the old language ("言語設定を変更したとき、すでに表示済みのレイヤーの凡例はその言語に切り替わらない").
       Wrap their build in buildCoreLegends() so it can be re-run in the new language; the element refs are hoisted to
       `let` (tileLegends & co. reference them) and reassigned on each rebuild. Opacity / date / unit VALUES live in
       persistent JS state (opacities[], layerDates[], windUnit…), so they survive a rebuild. */
    const CORE_LEGEND_IDS=['hdi','dem','pop','nato','gdppc','tfr','milSpend','milSpendGDP','snow','aod','nightsat','eez','temp','thermal','radar','sst','popgrid','relief','sealevel','wind'];
    let lgdHDI,lgdDem,lgdPop,lgdNATO,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat,lgdEEZ,lgdTemp,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdWind;
    function buildCoreLegends(){
      CORE_LEGEND_IDS.forEach(id=>{ const e=document.getElementById('data-legend-'+id); if(e) e.remove(); });   /* drop the old-language elements before rebuilding (no duplicate ids) */
    lgdHDI=makeLegend('hdi',140,(HOST.lang==='jp'?'HDI':'HDI'),'linear-gradient(to right,#a50026,#f46d43,#fee08b,#a6d96a,#1a9850)',['0.45','0.95'], HOST.lang==='jp'?'2022 国連UNDP':HOST.lang==='de'?'2022 UNDP':HOST.lang==='ru'?'2022 ПРООН':HOST.lang==='es'?'2022 PNUD':'2022 UNDP');
    lgdDem=makeLegend('dem',140,(HOST.lang==='jp'?'民主主義指数':HOST.lang==='de'?'Demokratieindex':HOST.lang==='ru'?'Индекс демократии':HOST.lang==='es'?'Índice de democracia':'Democracy Index'),'linear-gradient(to right,#a50026,#f46d43,#fee08b,#74add1,#313695)',['1','10'], HOST.lang==='jp'?'2023 EIU':'2023 EIU');
    lgdPop=makeLegend('pop',140,(HOST.lang==='jp'?'人口密度':HOST.lang==='de'?'Bevölkerungsdichte':HOST.lang==='ru'?'Плотность населения':HOST.lang==='es'?'Densidad de población':'Pop. density'),'linear-gradient(to right,#ffffcc,#fed976,#fd8d3c,#e31a1c,#800026)',['2','3000+'], HOST.lang==='jp'?'per km²':'per km²');
    lgdNATO=makeLegend('nato',140,'NATO',`linear-gradient(to right,#0a3d91,#1e63ff)`,[HOST.lang==='jp'?'加盟国':HOST.lang==='de'?'Mitglied':HOST.lang==='ru'?'Член':HOST.lang==='es'?'Miembro':'Member',''],HOST.lang==='jp'?'32か国':HOST.lang==='de'?'32 Mitglieder':HOST.lang==='ru'?'32 членов':HOST.lang==='es'?'32 miembros':'32 members');
    /* (#R15b / #38) Legends the value-scale layers were missing — choropleths (GDP pc, fertility, military
       spend $B & %GDP) and the snow / aerosol / night-lights rasters. They auto-gain an opacity slider via
       ensureLegendOpacity (their ids exist in `opacities`), moving that control onto the legend too. */
    lgdGdppc=makeLegend('gdppc',140,(HOST.lang==='jp'?'1人当たりGDP':HOST.lang==='de'?'BIP pro Kopf':HOST.lang==='ru'?'ВВП на душу населения':HOST.lang==='es'?'PIB per cápita':'GDP per capita'),'linear-gradient(to right,#fff7ec,#fee8c8,#fdbb84,#fc8d59,#e34a33,#7f0000)',['$1k','$90k+'], HOST.lang==='jp'?'名目・米ドル':HOST.lang==='de'?'USD, nominal':HOST.lang==='ru'?'долл. США, номинал':HOST.lang==='es'?'USD, nominal':'USD, nominal');
    lgdTfr=makeLegend('tfr',140,(HOST.lang==='jp'?'合計特殊出生率':HOST.lang==='de'?'Geburtenrate (TFR)':HOST.lang==='ru'?'Суммарный коэффициент рождаемости':HOST.lang==='es'?'Tasa de fecundidad total':'Total fertility rate'),'linear-gradient(to right,#2c7fb8,#7fcdbb,#ffffb2,#fe9929,#cc4c02)',['1.0','6.5+'], HOST.lang==='jp'?'2022 世界銀行':HOST.lang==='de'?'2022 Weltbank':HOST.lang==='ru'?'2022 Всемирный банк':HOST.lang==='es'?'2022 Banco Mundial':'2022 World Bank');
    lgdMil=makeLegend('milSpend',140,(HOST.lang==='jp'?'国防費（$B）':HOST.lang==='de'?'Militärausgaben ($ Mrd.)':HOST.lang==='ru'?'Военные расходы ($ млрд)':HOST.lang==='es'?'Gasto militar ($ mil M)':'Mil. spending ($B)'),'linear-gradient(to right,#fff7ec,#fdd49e,#fc8d59,#d7301f,#7f0000)',['$1B','$900B+'], 'SIPRI / IISS 2023');
    lgdMilGDP=makeLegend('milSpendGDP',140,(HOST.lang==='jp'?'国防費（対GDP）':HOST.lang==='de'?'Militärausgaben (% BIP)':HOST.lang==='ru'?'Военные расходы (% ВВП)':HOST.lang==='es'?'Gasto militar (% PIB)':'Mil. spending (% GDP)'),'linear-gradient(to right,#edf8fb,#b2e2e2,#66c2a4,#2ca25f,#006d2c)',['0.5%','6%+'], 'SIPRI / IISS 2023');
    lgdSnow=makeLegend('snow',140,(HOST.lang==='jp'?'積雪・海氷':HOST.lang==='de'?'Schnee & Eis':HOST.lang==='ru'?'Снег и лёд':HOST.lang==='es'?'Nieve y hielo':'Snow & ice'),'linear-gradient(to right,#2a78b8,#7fb3d9,#cfe6f5,#ffffff)',[HOST.lang==='jp'?'少':HOST.lang==='de'?'Wenig':HOST.lang==='ru'?'Мало':HOST.lang==='es'?'Bajo':'Low',HOST.lang==='jp'?'多':HOST.lang==='de'?'Viel':HOST.lang==='ru'?'Много':HOST.lang==='es'?'Alto':'High'], 'MODIS NDSI');
    lgdAod=makeLegend('aod',140,(HOST.lang==='jp'?'エアロゾル / 煙霧':HOST.lang==='de'?'Aerosol / Dunst':HOST.lang==='ru'?'Аэрозоль / дымка':HOST.lang==='es'?'Aerosol / bruma':'Aerosol / haze'),'linear-gradient(to right,#ffffcc,#fed976,#fd8d3c,#e31a1c,#800026)',[HOST.lang==='jp'?'清浄':HOST.lang==='de'?'Klar':HOST.lang==='ru'?'Чисто':HOST.lang==='es'?'Limpio':'Clear',HOST.lang==='jp'?'濃い':HOST.lang==='de'?'Trüb':HOST.lang==='ru'?'Мутно':HOST.lang==='es'?'Brumoso':'Hazy'], 'MODIS AOD');
    lgdNightsat=makeLegend('nightsat',140,(HOST.lang==='jp'?'夜間光（衛星）':HOST.lang==='de'?'Nachtlichter':HOST.lang==='ru'?'Ночные огни':HOST.lang==='es'?'Luces nocturnas':'Night lights'),'linear-gradient(to right,#05050f,#241a40,#7a5a1e,#ffd27f,#ffffff)',[HOST.lang==='jp'?'暗':HOST.lang==='de'?'Dunkel':HOST.lang==='ru'?'Темно':HOST.lang==='es'?'Oscuro':'Dark',HOST.lang==='jp'?'明':HOST.lang==='de'?'Hell':HOST.lang==='ru'?'Ярко':HOST.lang==='es'?'Brillante':'Bright'], 'VIIRS Black Marble');
    /* EEZ legend — one row per boundary TYPE (kept distinct), swatches match the BRIGHT SLD colours in addEEZ */
    lgdEEZ=document.createElement('div'); lgdEEZ.className='data-legend'; lgdEEZ.id='data-legend-eez'; lgdEEZ.style.bottom='140px';
    /* (#R79g) restored per-type colour coding (flattening it to one colour was wrong) — but now each type is a
       BRIGHT line for visibility. Colours here MUST match EEZ_STYLE in addEEZ. */
    const EEZ_CATS=[
      {c:'#39FF6A',n:{en:'EEZ — 200 NM',jp:'EEZ（200海里）',de:'AWZ — 200 sm',ru:'ИЭЗ — 200 миль',es:'ZEE — 200 mn'}},
      {c:'#12E3D6',n:{en:'Territorial sea — 12 NM',jp:'領海（12海里）',de:'Küstenmeer — 12 sm',ru:'Терр. море — 12 миль',es:'Mar territorial — 12 mn'}},
      {c:'#4D8BFF',n:{en:'Treaty boundary',jp:'条約による境界',de:'Vertragsgrenze',ru:'Договорная граница',es:'Límite por tratado'}},
      {c:'#B6FF3A',n:{en:'Median line',jp:'中間線',de:'Mittellinie',ru:'Срединная линия',es:'Línea media'}},
      {c:'#FFC21A',n:{en:'Court ruling',jp:'司法判断による境界',de:'Gerichtsurteil',ru:'Судебное решение',es:'Fallo judicial'}},
      {c:'#FF9E3D',n:{en:'Joint regime',jp:'共同管理水域',de:'Gemeinsames Regime',ru:'Совместный режим',es:'Régimen conjunto'}},
      {c:'#E64DFF',n:{en:'Unilateral claim (undisputed)',jp:'一方的主張（係争なし）',de:'Einseitiger Anspruch',ru:'Односторонняя претензия',es:'Reclamación unilateral'}},
      {c:'#FF4D4D',d:1,n:{en:'Unsettled / disputed',jp:'未確定・係争中',de:'Ungeklärt / strittig',ru:'Не урегулировано / спор',es:'Sin resolver / disputa'}},
      {c:'#FF7A3D',d:1,n:{en:'Unsettled median line',jp:'未確定の中間線',de:'Ungeklärte Mittellinie',ru:'Неурег. срединная линия',es:'Línea media sin resolver'}},
      {c:'#E6ECF2',d:1,n:{en:'Baselines (archipelagic / straight / normal)',jp:'基線（群島・直線・通常）',de:'Basislinien',ru:'Исходные линии',es:'Líneas de base'}},
      {c:'#C8D0D8',n:{en:'Connection line',jp:'接続線',de:'Verbindungslinie',ru:'Соединительная линия',es:'Línea de conexión'}}
    ];
    const eezRows=EEZ_CATS.map(cat=>`<div style="display:flex;align-items:center;gap:8px;font-size:11px;padding:1.5px 0;"><span style="display:inline-block;width:26px;height:0;border-top:3px ${cat.d?'dashed':'solid'} ${cat.c};box-shadow:0 0 4px ${cat.c};flex-shrink:0;"></span><span>${cat.n[HOST.lang]||cat.n.en}</span></div>`).join('');
    lgdEEZ.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="eez" title="${t('close')}">✕</button><h4>${HOST.lang==='jp'?'海洋管轄区域':HOST.lang==='de'?'Meereszonen':HOST.lang==='ru'?'Морские зоны':HOST.lang==='es'?'Zonas marítimas':'Maritime zones'}</h4>
      <div style="max-height:34vh; overflow-y:auto; margin:2px 0 4px; padding-right:2px;">${eezRows}</div>
      <div style="font-size:10px; color:var(--text-muted); line-height:1.5; margin-top:2px;">${HOST.lang==='jp'?'EEZ＝排他的経済水域。沿岸国が漁業・海底資源を管轄（最大200海里）。境界の種類で色分け（視認性のため明るい配色）。重なりは領有権紛争の目安。':HOST.lang==='de'?'AWZ = Ausschließliche Wirtschaftszone (bis 200 sm). Linienfarbe = Grenztyp (helle Farben für bessere Sichtbarkeit); Überlappungen = Streitfälle.':HOST.lang==='ru'?'ИЭЗ = исключительная экономическая зона (до 200 миль). Цвет линий — тип границы (яркие цвета для читаемости); наложения — споры.':HOST.lang==='es'?'ZEE = Zona Económica Exclusiva (hasta 200 mn). Color de línea = tipo de límite (colores vivos para visibilidad); solapamientos = disputas.':'EEZ = Exclusive Economic Zone (to 200 nm). Line colour = boundary type (bright colours for visibility); overlaps flag disputed claims.'}</div>
      <div class="dl-hint">${HOST.lang==='jp'?'出典: MarineRegions WMS':HOST.lang==='de'?'Quelle: MarineRegions WMS':HOST.lang==='ru'?'Источник: MarineRegions WMS':HOST.lang==='es'?'Fuente: MarineRegions WMS':'Source: MarineRegions WMS'}</div>`;
    mc.appendChild(lgdEEZ);
    lgdEEZ.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-eez'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Temperature legend (MODIS LST color ramp ≈ Kelvin) */
    lgdTemp=document.createElement('div'); lgdTemp.className='data-legend'; lgdTemp.id='data-legend-temp'; lgdTemp.style.bottom='140px';
    lgdTemp.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="temp" title="${t('close')}">✕</button><h4>${t('lgdTempTitle')||'Air temperature (2 m)'}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#3a0088,#0050d0,#0098ff,#00e0c0,#7dff66,#fff700,#ff9000,#ed1c24,#8a0027);"></div>
      <div class="dl-scale"><span>${fmtTemp(-40)}</span><span>${fmtTemp(40)}</span></div>
      <div class="dl-hint">${HOST.lang==='jp'?'MERRA-2 再解析・月別。全球で欠損なし。スライダーで月を選択。':HOST.lang==='de'?'MERRA-2-Reanalyse, monatlich — weltweit lückenlos. Monat per Schieberegler wählen.':HOST.lang==='ru'?'Реанализ MERRA-2, помесячно — без пропусков по всему миру. Месяц выбирается ползунком.':HOST.lang==='es'?'Reanálisis MERRA-2, mensual — sin huecos en todo el mundo. Elige el mes con el deslizador.':'MERRA-2 reanalysis, monthly — gap-free worldwide. Use the slider to pick a month.'}</div>`;
    mc.appendChild(lgdTemp);
    lgdTemp.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-temp'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Thermal anomalies legend (fire/heat-signature pixels) */
    lgdThermal=document.createElement('div'); lgdThermal.className='data-legend'; lgdThermal.id='data-legend-thermal'; lgdThermal.style.bottom='140px';
    lgdThermal.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="thermal" title="${t('close')}">✕</button><h4>${HOST.lang==='jp'?'熱異常(火災)':HOST.lang==='de'?'Thermische Anomalien':HOST.lang==='ru'?'Тепловые аномалии':HOST.lang==='es'?'Anomalías térmicas':'Thermal anomalies'}</h4>
      <div style="display:flex; align-items:center; gap:8px; font-size:11px; padding:4px 0;"><span style="display:inline-block;width:14px;height:14px;background:#ff3b30;border-radius:50%;box-shadow:0 0 8px rgba(255,59,48,0.6);"></span> ${HOST.lang==='jp'?'検知された火災・熱源':HOST.lang==='de'?'Erkannte Brände / Wärmequellen':HOST.lang==='ru'?'Обнаруженные пожары / тепловые источники':HOST.lang==='es'?'Fuegos activos / fuentes de calor detectados':'Detected active fire / heat source'}</div>
      <label style="display:flex; align-items:center; gap:6px; font-size:11px; margin:4px 0 2px; color:var(--text-muted);">${HOST.lang==='jp'?'期間':HOST.lang==='de'?'Zeitfenster':HOST.lang==='ru'?'Окно':HOST.lang==='es'?'Ventana':'Window'}: <select class="thermal-window" style="flex:1; padding:3px 6px; border-radius:6px; border:1px solid rgba(128,128,128,0.2); background:var(--input-bg); color:var(--text-main); font-size:11px;"><option value="24" data-i18n="thermWin24">${t('thermWin24')}</option><option value="48" data-i18n="thermWin48">${t('thermWin48')}</option><option value="72" data-i18n="thermWin72">${t('thermWin72')}</option></select></label>
      <div class="dl-hint">${HOST.lang==='jp'?'NASA FIRMS · MODIS + VIIRS（実データ・準リアルタイム）':HOST.lang==='de'?'NASA FIRMS · MODIS + VIIRS (echt, nahezu Echtzeit)':HOST.lang==='ru'?'NASA FIRMS · MODIS + VIIRS (реальные данные, почти в реальном времени)':HOST.lang==='es'?'NASA FIRMS · MODIS + VIIRS (real, casi en tiempo real)':'NASA FIRMS · MODIS + VIIRS (real, near-real-time)'}</div>`;
    mc.appendChild(lgdThermal);
    lgdThermal.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-thermal'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    { const sw=lgdThermal.querySelector('.thermal-window'); if(sw){ sw.value=window._thermalWindow||'24'; sw.addEventListener('change',()=>{ window._thermalWindow=sw.value; if(window._refreshThermal) window._refreshThermal(); try{ window._refreshLegendDates&&window._refreshLegendDates(); }catch(_){} }); } }
    /* Precipitation-radar legend (RainViewer rain-rate scale) */
    lgdRadar=document.createElement('div'); lgdRadar.className='data-legend'; lgdRadar.id='data-legend-radar'; lgdRadar.style.bottom='140px';
    lgdRadar.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="radar" title="${t('close')}">✕</button><h4>${t('lgdRadarTitle')||'Rain rate'}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#9bd2ff,#0080ff,#00c800,#ffe000,#ff7800,#ff0000,#c800c8);"></div>
      <div class="dl-scale"><span>${HOST.lang==='jp'?'弱い':HOST.lang==='de'?'Leicht':HOST.lang==='ru'?'Слабый':HOST.lang==='es'?'Ligero':'Light'}</span><span>${HOST.lang==='jp'?'激しい':HOST.lang==='de'?'Stark':HOST.lang==='ru'?'Сильный':HOST.lang==='es'?'Fuerte':'Heavy'}</span></div>
      <div class="dl-hint">${HOST.lang==='jp'?'RainViewer 実時間レーダー（最新フレーム）':HOST.lang==='de'?'RainViewer-Echtzeitradar (neuester Frame)':HOST.lang==='ru'?'Радар RainViewer в реальном времени (последний кадр)':HOST.lang==='es'?'Radar en vivo RainViewer (último fotograma)':'RainViewer live radar (latest frame)'}</div>`;
    mc.appendChild(lgdRadar);
    lgdRadar.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-radar'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Sea-surface-temperature legend (GHRSST MUR L4) */
    lgdSST=document.createElement('div'); lgdSST.className='data-legend'; lgdSST.id='data-legend-sst'; lgdSST.style.bottom='140px';
    lgdSST.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="sst" title="${t('close')}">✕</button><h4>${t('lgdSSTTitle')||'Sea-surface temp'}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#3a0088,#0033cc,#0099ff,#00e0c0,#7dff66,#ffe000,#ff7800,#e00000);"></div>
      <div class="dl-scale"><span>${fmtTemp(-2)}</span><span>${fmtTemp(32)}</span></div>
      <div class="dl-hint">${HOST.lang==='jp'?'GHRSST MUR L4（海域のみ）':HOST.lang==='de'?'GHRSST MUR L4 (nur Ozeane)':HOST.lang==='ru'?'GHRSST MUR L4 (только океаны)':HOST.lang==='es'?'GHRSST MUR L4 (solo océanos)':'GHRSST MUR L4 (oceans only)'}</div>`;
    mc.appendChild(lgdSST);
    lgdSST.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-sst'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Gridded population-density legend (NASA SEDAC GPW v4) */
    lgdPopGrid=document.createElement('div'); lgdPopGrid.className='data-legend'; lgdPopGrid.id='data-legend-popgrid'; lgdPopGrid.style.bottom='140px';
    lgdPopGrid.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="popgrid" title="${t('close')}">✕</button><h4>${HOST.lang==='jp'?'人口密度（グリッド）':HOST.lang==='de'?'Bevölkerungsdichte (Raster)':HOST.lang==='ru'?'Плотность населения (сетка)':HOST.lang==='es'?'Densidad de población (malla)':'Pop. density (grid)'}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#ffffd4,#fee391,#fec44f,#fe9929,#ec7014,#cc4c02,#8c2d04);"></div>
      <div class="dl-scale"><span>0</span><span>1000+ /km²</span></div>
      <div class="dl-hint">${HOST.lang==='jp'?'NASA SEDAC GPW v4（2020・約1km）。国境に依存しない実分布。':HOST.lang==='de'?'NASA SEDAC GPW v4 (2020, ~1 km). Reale Verteilung, unabhängig von Grenzen.':HOST.lang==='ru'?'NASA SEDAC GPW v4 (2020, ~1 км). Реальное распределение, независимое от границ.':HOST.lang==='es'?'NASA SEDAC GPW v4 (2020, ~1 km). Distribución real, independiente de fronteras.':'NASA SEDAC GPW v4 (2020, ~1 km). Real distribution, independent of borders.'}</div>`;
    mc.appendChild(lgdPopGrid);
    lgdPopGrid.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-popgrid'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Color-relief elevation legend (#5) */
    lgdRelief=document.createElement('div'); lgdRelief.className='data-legend'; lgdRelief.id='data-legend-relief'; lgdRelief.style.bottom='140px';
    lgdRelief.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="relief" title="${t('close')}">✕</button><h4>${HOST.lang==='jp'?'標高（カラー段彩）':HOST.lang==='de'?'Höhe (farbig)':HOST.lang==='ru'?'Высота (цвет)':HOST.lang==='es'?'Elevación (color)':'Elevation (color)'}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#0b4f8a,#7fb3d9,#1a7a3c,#a6d96a,#e6e08b,#d9a066,#a87b52,#cdbfb4,#ffffff);"></div>
      <div class="dl-scale"><span>${HOST.lang==='jp'?'深海':HOST.lang==='de'?'Tiefsee':HOST.lang==='ru'?'Глубоководье':HOST.lang==='es'?'Mar profundo':'Deep sea'}</span><span>${HOST.lang==='jp'?'高峰':HOST.lang==='de'?'Gipfel':HOST.lang==='ru'?'Вершины':HOST.lang==='es'?'Cumbres':'Peaks'}</span></div>
      <div class="dl-hint">${HOST.lang==='jp'?'AWS Terrain（terrarium DEM）':'AWS Terrain (terrarium DEM)'}</div>`;
    mc.appendChild(lgdRelief);
    lgdRelief.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-relief'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Sea-level-rise legend (#24) */
    lgdSeaLevel=document.createElement('div'); lgdSeaLevel.className='data-legend'; lgdSeaLevel.id='data-legend-sealevel'; lgdSeaLevel.style.bottom='140px';
    const slL=window._seaLevelM||0;
    lgdSeaLevel.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="sealevel" title="${t('close')}">✕</button><h4>${HOST.lang==='jp'?'海面変動':HOST.lang==='de'?'Meeresspiegel-Änderung':HOST.lang==='ru'?'Изменение уровня моря':HOST.lang==='es'?'Cambio del nivel del mar':'Sea-level change'}</h4>
      <div style="display:flex; align-items:center; gap:8px; font-size:11px; padding:4px 0;"><span style="display:inline-block;width:16px;height:11px;border-radius:3px;background:rgba(40,120,200,0.75);border:1px solid rgba(0,0,0,0.15);"></span> ${HOST.lang==='jp'?'浸水域 (≤ 現海面 ':HOST.lang==='de'?'Überflutet (≤ heute ':HOST.lang==='ru'?'Затоплено (≤ текущего ':HOST.lang==='es'?'Inundado (≤ hoy ':'Flooded (≤ today '}<b class="sl-cur">${(slL>=0?'+':'')+slL} m</b>${HOST.lang==='jp'?')':')'}</div>
      <label style="display:flex; align-items:center; gap:8px; font-size:11px; margin:4px 0 2px; color:var(--text-muted);">-150<input type="range" class="sl-legend-range" min="-150" max="70" step="1" value="${Math.max(-150,Math.min(70,slL))}" style="flex:1; accent-color:var(--primary-color);">+70 m</label>
      <div style="display:flex; gap:6px; margin:4px 0 2px;"><input type="number" class="sl-num" min="-11000" max="9000" step="1" value="${slL}" placeholder="m" style="flex:1; min-width:0; padding:5px 8px; border-radius:8px; border:1px solid rgba(128,128,128,0.25); background:var(--input-bg); color:var(--text-main); font-size:12px;"><button class="sl-set" style="padding:5px 12px; border:none; border-radius:8px; background:var(--primary-color); color:#fff; font-size:11px; font-weight:600; cursor:pointer;">${HOST.lang==='jp'?'設定':HOST.lang==='de'?'Festlegen':HOST.lang==='ru'?'Задать':HOST.lang==='es'?'Fijar':'Set'}</button></div>
      <div class="sl-err" style="display:none; color:var(--info-mil); font-size:10px; margin:0 0 2px;"></div>
      <div class="dl-hint">${HOST.lang==='jp'?'スライダーまたは数値（-11000〜9000 m、マイナス=海面低下）。AWS Terrain DEM に基づく簡易浸水。潮汐・防潮堤は未考慮。':HOST.lang==='de'?'Schieberegler oder Zahl (-11000–9000 m; negativ = Meeresspiegel-Abfall). Einfache „Badewannen“-Flutung aus dem AWS-Terrain-DEM — ohne Gezeiten & Deiche.':HOST.lang==='ru'?'Ползунок или число (-11000–9000 м; минус = падение уровня). Простое «наполнение ванны» по DEM AWS Terrain — без приливов и дамб.':HOST.lang==='es'?'Deslizador o número (-11000–9000 m; negativo = descenso del nivel). Inundación simple («bañera») según el DEM de AWS Terrain — sin mareas ni defensas.':'Slider or a number (-11000–9000 m; negative = sea-level fall). Naïve "bathtub" fill from the AWS Terrain DEM — ignores tides & defenses.'}</div>`;
    mc.appendChild(lgdSeaLevel);
    lgdSeaLevel.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-sealevel'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Sea-level slider lives in the legend too (#11) — control the simulation straight from the legend. */
    { const r=lgdSeaLevel.querySelector('.sl-legend-range'); if(r) r.addEventListener('input',()=>{ window._seaLevelM=parseInt(r.value,10)||0; if(window._refreshSeaLevel) window._refreshSeaLevel(); }); }
    /* (#R9) Custom value button: any number in [-11000, +9000]; out-of-range shows an inline error. */
    { const num=lgdSeaLevel.querySelector('.sl-num'), setb=lgdSeaLevel.querySelector('.sl-set'), err=lgdSeaLevel.querySelector('.sl-err');
      const apply=()=>{ const v=parseInt(num.value,10);
        if(isNaN(v)||v<-11000||v>9000){ if(err){ err.textContent=HOST.lang==='jp'?'-11000〜9000 の数値を入力してください':HOST.lang==='de'?'Zahl zwischen -11000 und 9000 eingeben':HOST.lang==='ru'?'Введите число от -11000 до 9000':HOST.lang==='es'?'Introduce un número entre -11000 y 9000':'Enter a number between -11000 and 9000'; err.style.display='block'; } return; }
        if(err) err.style.display='none'; window._seaLevelM=v; if(window._refreshSeaLevel) window._refreshSeaLevel(); };
      if(setb) setb.onclick=apply;
      if(num) num.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); apply(); } });
    }
    /* === Wind legend (#R12 / #19,#22) — replaces the floating top-center valid-time pill that overlapped
       the search box. Same draggable data-legend format as every other layer, carries the GFS valid time,
       a speed color ramp, AND a UNIT pulldown (m/s · km/h · kn · mph). === */
    window.WIND_UNITS=[['ms','m/s',1],['kmh','km/h',3.6],['kn','kn',1.94384],['mph','mph',2.23694]];
    try{ window.windUnit=localStorage.getItem('intmap_wind_unit')||'ms'; }catch(_){ window.windUnit='ms'; }
    if(!window.WIND_UNITS.some(u=>u[0]===window.windUnit)) window.windUnit='ms';
    window._windUnitEntry=()=>window.WIND_UNITS.find(u=>u[0]===window.windUnit)||window.WIND_UNITS[0];
    window.windUnitFactor=()=>window._windUnitEntry()[2];
    window.windUnitLabel=()=>window._windUnitEntry()[1];
    window.fmtWindSpeed=(ms)=>{ const v=(ms||0)*window.windUnitFactor(); return v.toFixed(v<10?1:0)+' '+window.windUnitLabel(); };
    const _windGrad='linear-gradient(to right,rgb(16,32,92) 0%,rgb(28,108,184) 7.5%,rgb(40,168,170) 17.5%,rgb(90,205,120) 27.5%,rgb(225,215,75) 40%,rgb(242,150,52) 55%,rgb(232,70,70) 72.5%,rgb(198,55,176) 100%)';
    lgdWind=document.createElement('div'); lgdWind.className='data-legend'; lgdWind.id='data-legend-wind'; lgdWind.style.bottom='140px';
    lgdWind.innerHTML=`<span class="dl-drag" title="${HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move'}">⋮⋮</span><button class="layer-popup-x" data-x="wind" title="${t('close')}">✕</button><h4>${HOST.lang==='jp'?'風（10m）':HOST.lang==='de'?'Wind 10 m':HOST.lang==='ru'?'Ветер 10 м':HOST.lang==='es'?'Viento 10 m':'Wind 10 m'}</h4>
      <div class="dl-bar" style="background:${_windGrad};"></div>
      <div class="dl-scale"><span>0</span><span class="wind-scale-max"></span></div>
      <div class="kl-period" style="margin:7px 0 2px;"><label>${HOST.lang==='jp'?'単位':HOST.lang==='de'?'Einheiten':HOST.lang==='ru'?'Единицы':HOST.lang==='es'?'Unidades':'Units'}</label><select id="wind-unit-sel">${window.WIND_UNITS.map(u=>`<option value="${u[0]}"${u[0]===window.windUnit?' selected':''}>${u[1]}</option>`).join('')}</select></div>
      <div class="dl-hint" id="wind-valid">${HOST.lang==='jp'?'Open-Meteo GFS（10m風）':HOST.lang==='de'?'Open-Meteo GFS (10-m-Wind)':HOST.lang==='ru'?'Open-Meteo GFS (ветер 10 м)':HOST.lang==='es'?'Open-Meteo GFS (viento a 10 m)':'Open-Meteo GFS (10 m wind)'}</div>`;
    mc.appendChild(lgdWind);
    lgdWind.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-wind'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Refresh the max-speed scale label + valid-time line; called on unit change + when new data lands. */
    window._updateWindLegend=function(){
      try{ const mx=lgdWind.querySelector('.wind-scale-max'); if(mx) mx.textContent=(40*window.windUnitFactor()).toFixed(0)+' '+window.windUnitLabel(); }catch(_){}
      try{ const vt=document.getElementById('wind-valid'); const gt=(window.Wind&&window.Wind.dataTime&&window.Wind.dataTime()); if(vt){ if(gt&&window._fmtWindTime){ vt.textContent=(HOST.lang==='jp'?'🌬 ':'🌬 ')+window._fmtWindTime(gt); } else { vt.textContent=HOST.lang==='jp'?'Open-Meteo GFS（10m風）':HOST.lang==='de'?'Open-Meteo GFS (10-m-Wind)':HOST.lang==='ru'?'Open-Meteo GFS (ветер 10 м)':HOST.lang==='es'?'Open-Meteo GFS (viento a 10 m)':'Open-Meteo GFS (10 m wind)'; } } }catch(_){}
    };
    { const sel=lgdWind.querySelector('#wind-unit-sel'); if(sel) sel.onchange=()=>{ window.windUnit=sel.value; try{ localStorage.setItem('intmap_wind_unit',window.windUnit); }catch(_){} window._updateWindLegend(); try{ renderCoordReadout(); }catch(_){} }; }
    window._updateWindLegend();
    }
    buildCoreLegends();   /* (#R110) build once now; re-run on language change (see the intmap-lang listener below) */
    /* Unified legend drag — MOUSE + TOUCH (#33), idempotent. Works for any legend whose handle is
       .dl-drag or .kl-drag, so EEZ/Temp/Thermal/… AND the Köppen legend are all movable on phones. */
    function wireDrag(el){
      if(!el) return;
      /* (#R19) DELEGATED drag — the fix for "凡例が動かせなくなることがたまにある": the old code wired the
         ⋮⋮/h4 handle NODES directly, but every innerHTML rebuild (date-pickers, opacity rows, language
         switch, Köppen era swap…) REPLACED those nodes and the new ones were never re-wired → the legend
         silently stopped moving. The listeners now live on the legend ROOT (which innerHTML rebuilds never
         replace) and find the live handle via closest(), so drag survives every rebuild, forever. */
      if(el.dataset.dragRootWired) return; el.dataset.dragRootWired='1';
      const HANDLE='.dl-drag,.kl-drag,h4,.tp-header';
      const begin=(cx,cy)=>{
        const startRect=el.getBoundingClientRect(), mcRect=mc.getBoundingClientRect();
        const ox=cx-startRect.left, oy=cy-startRect.top;
        /* Pin to the current on-screen spot BEFORE releasing the CSS bottom/right anchor, so the
           legend never flashes to a default corner when the drag starts (esp. on mobile, #10). Use
           inline !important so any mobile !important dock rule can't fight the drag. */
        const setp=(k,v)=>el.style.setProperty(k,v,'important');
        setp('left',(startRect.left-mcRect.left)+'px'); setp('top',(startRect.top-mcRect.top)+'px');
        setp('bottom','auto'); setp('right','auto'); el.dataset.dragged='1';
        return (mx,my)=>{
          const x=Math.max(8,Math.min(mcRect.width-startRect.width-8, mx-mcRect.left-ox));
          const y=Math.max(8,Math.min(mcRect.height-startRect.height-8, my-mcRect.top-oy));
          setp('left',x+'px'); setp('top',y+'px');
        };
      };
      const hitHandle=(t)=>{ const h=t&&t.closest&&t.closest(HANDLE); if(!h||!el.contains(h)) return null;
        if(t.closest('button,input,select,a,.legend-min,.layer-popup-x,.tp-close')) return null;   /* keep controls tappable */
        return h; };
      el.addEventListener('mousedown',ev=>{ const h=hitHandle(ev.target); if(!h) return; ev.preventDefault();
        const move=begin(ev.clientX,ev.clientY);
        const mv=e=>move(e.clientX,e.clientY); const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
        document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); });
      el.addEventListener('touchstart',ev=>{ const h=hitHandle(ev.target); if(!h) return; const t0=ev.touches[0]; if(!t0) return; ev.preventDefault();
        const move=begin(t0.clientX,t0.clientY);
        const mv=e=>{ const t=e.touches[0]; if(t) move(t.clientX,t.clientY); }; const up=()=>{ document.removeEventListener('touchmove',mv); document.removeEventListener('touchend',up); };
        document.addEventListener('touchmove',mv,{passive:false}); document.addEventListener('touchend',up); },{passive:false});
      /* the h4 cursor/touch-action hints are cosmetic — set them now and after any rebuild on hover */
      const hint=()=>{ el.querySelectorAll('h4').forEach(h=>{ h.style.cursor='move'; h.style.touchAction='none'; h.style.userSelect='none'; }); };
      hint(); el.addEventListener('mouseenter',hint);
    }
    window._wireLegendDrag=wireDrag;
    wireDrag(lgdEEZ); wireDrag(lgdTemp); wireDrag(lgdThermal); wireDrag(lgdRadar); wireDrag(lgdSST); wireDrag(lgdPopGrid); wireDrag(lgdRelief); wireDrag(lgdSeaLevel);
    wireDrag(lgdHDI); wireDrag(lgdDem); wireDrag(lgdPop); wireDrag(lgdNATO);   /* the makeLegend legends drag centrally too now (#10) */
    wireDrag(lgdGdppc); wireDrag(lgdTfr); wireDrag(lgdMil); wireDrag(lgdMilGDP); wireDrag(lgdSnow); wireDrag(lgdAod); wireDrag(lgdNightsat);   /* (#R15b #38) */
    /* (#R110) LANGUAGE CHANGE → rebuild the core legends in the new language, preserving which are open + any dragged
       position (opacity/date/unit values live in JS state and are re-injected by tileLegends/_refreshLegendDates).
       Generic legends re-localize their title in place; the Köppen legend rebuilds when it is open. */
    function _rebuildCoreLegends(){ if(!lgdHDI) return;
      const snap={};
      CORE_LEGEND_IDS.forEach(id=>{ const el=document.getElementById('data-legend-'+id); if(el) snap[id]={disp:el.style.display,dragged:el.dataset.dragged,cssText:el.style.cssText}; });
      buildCoreLegends();
      [lgdEEZ,lgdTemp,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdHDI,lgdDem,lgdPop,lgdNATO,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat,lgdWind].forEach(el=>{ try{ wireDrag(el); }catch(_){} });
      CORE_LEGEND_IDS.forEach(id=>{ const s=snap[id]; if(!s) return; const el=document.getElementById('data-legend-'+id); if(!el) return;
        if(s.dragged){ el.style.cssText=s.cssText; el.dataset.dragged='1'; }   /* keep a user-dragged legend exactly where it was */
        else if(s.disp&&s.disp!=='none'){ el.style.display=s.disp; } });   /* keep an open legend open (re-tiled below) */
      try{ document.querySelectorAll('.data-legend.generic-legend').forEach(el=>{ const id=(el.id||'').replace('data-legend-',''); if(id&&window._ensureGenericLegend) window._ensureGenericLegend(id); }); }catch(_){}
      try{ const kl=document.getElementById('koppen-legend'); if(kl&&getComputedStyle(kl).display!=='none'&&typeof buildLegend==='function') buildLegend(); }catch(_){}
      try{ tileLegends(); }catch(_){}
      try{ _refreshLegendDates(); }catch(_){}
    }
    window.addEventListener('intmap-lang', _rebuildCoreLegends);
    /* The Köppen legend's drag handle is (re)injected inside buildLegend() so it survives the
       innerHTML rebuild that previously wiped it — that rebuild was why it "couldn't be moved" (#22). */

    const dd=document.getElementById('layer-dropdown');
    const hr=document.createElement('hr'); hr.style.cssText='border:0;border-top:1px solid rgba(128,128,128,0.2);width:100%;margin:6px 0;'; dd.appendChild(hr);
    /* The top-level "Data layers" line is a SECTION LABEL, not a collapsible group (the real groups
       are the Weather/Terrain/… sub-headers below it). Mark it so it doesn't show a ▷ it can't act
       on (#30). */
    const head=document.createElement('div'); head.className='lyr-head lyr-section-label'; head.setAttribute('data-i18n','lyrSection'); head.textContent=i18n[HOST.lang].lyrSection; dd.appendChild(head);

    const opacities={climate:1,temp:0.62,precip:0.6,pop:0.7,hdi:0.65,dem:0.65,milSpend:0.7,milSpendGDP:0.7,gdppc:0.7,tfr:0.72,nato:0.55,night:0.4,nightsat:1,eez:0.7,ships:0.9,planes:0.9,thermal:0.75,radar:0.8,clouds:0.75,sst:0.7,snow:0.7,aod:0.7,popgrid:0.8,hillshade:0.55,contours:0.85,relief:0.7,sealevel:0.62,wind:0.9,subcables:0.95};   /* (#R122) Köppen climate default opacity = 100% */
    if(window._seaLevelM==null) window._seaLevelM=2;   /* default +2 m sea-level rise (#24) */
    /* Default to the freshest GIBS day that is reliably processed (−2 days). */
    const GIBS_DATE=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    /* Date-aware layers: temp, precip, thermal — these vary day-by-day. */
    const PRECIP_DATE=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    /* Air-temperature (MERRA-2 monthly reanalysis) lags ~3 months → default to the latest safe month. */
    function tempMonthISO(monthsBack){ const d=new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()-(monthsBack==null?3:monthsBack)); return d.toISOString().slice(0,10); }
    /* thermal is NOT date-keyed any more (#5): NASA FIRMS publishes rolling time-window layers, so the
       thermal row carries a window selector in its legend instead of a calendar date. */
    const layerDates={temp:tempMonthISO(3),precip:PRECIP_DATE,sst:GIBS_DATE,snow:GIBS_DATE,aod:GIBS_DATE};
    window._imLayerDates=layerDates;   /* (#R77) live reference for Atlas stateContext (vision §2 — dated-layer awareness) */
    /* (#R13c) Time-varying layers state WHEN their data is from, in the legend (user request). A small
       "as-of" line is appended to each dated legend and refreshed whenever the date/window changes. */
    function _legendWhenText(id){ const jp=HOST.lang==='jp';
      if(id==='radar') return (jp?'最新フレーム（実時間）':'Latest frame (live)');
      if(id==='thermal'){ const w=window._thermalWindow||'24'; return (jp?('直近'+w+'時間'):('Last '+w+' h')); }
      const d=layerDates[id]; if(!d) return '';
      if(id==='temp') return (jp?'対象月: ':'Month: ')+String(d).slice(0,7);
      return (jp?'データ: ':'Data: ')+d;
    }
    /* (#R15d) The date/window control now lives IN the legend (not the Layers panel). For radar (live) we
       just show the as-of text; temp gets a month picker; sst/snow/aod a date picker; thermal a 24/48/72 h
       window select. Each writes layerDates[id] / _thermalWindow and reloads the dated layer. */
    const _today=()=>new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    function _refreshLegendDates(){
      [['temp',lgdTemp],['thermal',lgdThermal],['radar',lgdRadar],['sst',lgdSST],['snow',lgdSnow],['aod',lgdAod]].forEach(([id,lg])=>{
        if(!lg) return;
        let w=lg.querySelector('.dl-when');
        if(!w){
          w=document.createElement('div'); w.className='dl-when'; w.style.cssText='font-size:10px;color:var(--text-muted);margin-top:4px;border-top:1px solid rgba(128,128,128,0.18);padding-top:4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
          const inSty='padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;';
          if(id==='radar'){ w.innerHTML='🕒 <span class="dl-when-t"></span>'; }
          else if(id==='thermal'){ w.innerHTML='🕒 <span>'+(HOST.lang==='jp'?'期間':HOST.lang==='de'?'Zeitfenster':HOST.lang==='ru'?'Окно':HOST.lang==='es'?'Ventana':'Window')+'</span> <select class="dl-win" style="'+inSty+'"><option value="24">24 h</option><option value="48">48 h</option><option value="72">72 h</option></select>';
            const s=w.querySelector('.dl-win'); s.value=window._thermalWindow||'24'; s.addEventListener('change',()=>{ window._thermalWindow=s.value; try{ window._refreshThermal&&window._refreshThermal(); }catch(_){} _refreshLegendDates(); }); }
          else if(id==='temp'){ w.innerHTML='🕒 <input type="month" class="dl-date" style="'+inSty+'">';
            const d=w.querySelector('.dl-date'); d.value=(layerDates[id]||'').slice(0,7); d.addEventListener('change',()=>{ if(!d.value)return; layerDates[id]=d.value+'-01'; if(map.getLayer('lyr-'+id)&&map.getLayoutProperty('lyr-'+id,'visibility')==='visible') refreshDatedLayer(id); _refreshLegendDates(); }); }
          else { w.innerHTML='🕒 <input type="date" class="dl-date" max="'+_today()+'" style="'+inSty+'">';
            const d=w.querySelector('.dl-date'); d.value=layerDates[id]||_today(); d.addEventListener('change',()=>{ layerDates[id]=d.value||_today(); if(map.getLayer('lyr-'+id)&&map.getLayoutProperty('lyr-'+id,'visibility')==='visible') refreshDatedLayer(id); _refreshLegendDates(); }); }
          lg.appendChild(w);
        }
        /* keep values in sync */
        const dt=w.querySelector('.dl-date'); if(dt){ dt.value = id==='temp' ? (layerDates[id]||'').slice(0,7) : (layerDates[id]||_today()); }
        const wn=w.querySelector('.dl-win'); if(wn) wn.value=window._thermalWindow||'24';
        const tt=w.querySelector('.dl-when-t'); if(tt) tt.textContent=_legendWhenText(id);
      });
    }
    window._refreshLegendDates=_refreshLegendDates;
    _refreshLegendDates();
    /* Thermal anomalies / active fire (#R7) — REAL NASA FIRMS detections served through NASA GIBS WMS.
       Why GIBS, not FIRMS' own WMS: the FIRMS MapServer caps requests per IP, so a tiled web map (dozens
       of tiles per view) quickly trips its quota and every tile comes back as the red error image
       "You have exceeded the transaction limit" — exactly what the user saw. GIBS is NASA's purpose-built
       high-volume tile/WMS service (no per-IP transaction cap), it rasterizes the VIIRS (NOAA-20 + SNPP)
       and MODIS (Terra + Aqua) thermal-anomaly point layers to PNG, needs no key and returns CORS:*.
       Verified live: 200 image/png, Access-Control-Allow-Origin:*.
       Each WMS GetMap takes a single day (TIME=YYYY-MM-DD), so the 24/48/72 h "window" is built by
       stacking the most-recent N UTC days as separate raster layers (today + previous days). */
    window._thermalWindow=window._thermalWindow||'24';        /* rolling window: 24 | 48 | 72 (h) → 2 | 3 | 4 recent UTC days */
    const GIBS_FIRE_LAYERS='VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_SNPP_Thermal_Anomalies_375m_All,MODIS_Terra_Thermal_Anomalies_All,MODIS_Aqua_Thermal_Anomalies_All';
    const THERMAL_IDS=['lyr-thermal','lyr-thermal-1','lyr-thermal-2','lyr-thermal-3'];
    let _thermalOn=false;
    function _utcDayISO(back){ return new Date(Date.now()-back*86400000).toISOString().slice(0,10); }
    function gibsThermalWMS(dayISO,layers){ return 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS='+(layers||GIBS_FIRE_LAYERS)+'&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+dayISO; }
    function thermalDayOffsets(){ const n={'24':2,'48':3,'72':4}[window._thermalWindow||'24']||2; const out=[]; for(let i=0;i<n;i++) out.push(i); return out; }
    /* (#R121) ROOT FIX — a combined LAYERS= GetMap fails ENTIRELY ("msShapefileOpen(): The requested shapefile
       cannot be found") when ANY one product has no data for that day (live-verified: VIIRS_SNPP missing for
       today & yesterday blanked the whole thermal layer). Probe each day once with a tiny GetMap, parse the
       failing product out of the ServiceException, and request only the products that actually draw. */
    const _thermalDayCache={};
    async function _thermalLayersFor(day){ if(_thermalDayCache[day]!==undefined) return _thermalDayCache[day];
      let list=GIBS_FIRE_LAYERS.split(',');
      for(let t=0;t<4&&list.length;t++){
        try{ const M=20037508.34;
          const r=await fetch('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS='+list.join(',')+'&CRS=EPSG:3857&BBOX='+(-M)+','+(-M)+','+M+','+M+'&WIDTH=4&HEIGHT=4&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+day);
          const ct=(r.headers.get('content-type')||'');
          if(r.ok&&ct.indexOf('image')>=0) break;
          const tx=await r.text(); const m=tx.match(/named '([^']+)'/)||tx.match(/named &#39;([^&#]+)&#39;/);
          if(!m||list.indexOf(m[1])<0){ list=[]; break; }
          list=list.filter(x=>x!==m[1]);
        }catch(_){ break; } }   /* network error → keep the current list (the layer may still draw) */
      _thermalDayCache[day]=list; return list; }
    function _clearThermal(){ THERMAL_IDS.forEach((lid,i)=>{ try{ if(map.getLayer(lid)) map.removeLayer(lid); }catch(_){} try{ const sid='src-thermal-'+i; if(map.getSource(sid)) map.removeSource(sid); }catch(_){} }); }
    function addFirmsThermal(){
      _clearThermal();
      thermalDayOffsets().forEach((off,i)=>{
        const sid='src-thermal-'+i, lid=THERMAL_IDS[i], day=_utcDayISO(off);
        _thermalLayersFor(day).then(list=>{
          if(!list||!list.length) return;   /* no fire product at all for that day (yet) — skip the slot honestly */
          try{
            if(map.getSource(sid)||map.getLayer(lid)) return;   /* a re-toggle raced us */
            map.addSource(sid,{type:'raster',tiles:[gibsThermalWMS(day,list.join(','))],tileSize:256,attribution:'NASA FIRMS / GIBS — MODIS & VIIRS active fire'});
            map.addLayer({id:lid,type:'raster',source:sid,layout:{visibility:_thermalOn?'visible':'none'},paint:{'raster-opacity':opacities.thermal}},beforeId);
          }catch(_){}
        }).catch(()=>{});
      });
    }
    function setThermalVis(on){ _thermalOn=on; THERMAL_IDS.forEach(lid=>{ if(map.getLayer(lid)) map.setLayoutProperty(lid,'visibility',on?'visible':'none'); }); }
    window._setThermalOpacity=function(v){ THERMAL_IDS.forEach(lid=>{ if(map.getLayer(lid)) map.setPaintProperty(lid,'raster-opacity',v); }); };
    /* Rebuild the stacked layers when the user switches the 24/48/72 h window in the legend. */
    window._refreshThermal=function(){
      const was=_thermalOn;
      try{ addFirmsThermal(); setThermalVis(was); }catch(e){ console.warn('thermal rebuild fail',e); }
    };
    /* (#R12) Layer taxonomy re-organized into clearer, purpose-built categories (per request to
       re-classify the panel): Climate & weather · Terrain & elevation · Oceans & maritime ·
       Hazards & night sky · Population & economy · Geopolitics & defense. */
    [
      ['__grp','lyrGrpClimate'],
      ['climate','lyrClimate'],['temp','lyrTemp'],['precip','lyrPrecip'],['radar','lyrRadar'],['wind','lyrWind'],['sst','lyrSST'],['snow','lyrSnow'],['aod','lyrAOD'],
      ['__grp','lyrGrpTerrain'],
      ['relief','lyrRelief'],['hillshade','lyrHillshade'],['contours','lyrContours'],['sealevel','lyrSeaLevel'],
      ['__grp','lyrGrpMaritime'],
      ['eez','lyrEEZ'],['subcables','lyrSubcables'],['ships','lyrShips'],['planes','lyrPlanes'],
      ['__grp','lyrGrpHazard'],
      ['thermal','lyrThermal'],['nightsat','lyrNightSat'],['night','lyrNight'],
      ['__grp','lyrGrpDemo'],
      ['pop','lyrPop'],['popgrid','lyrPopGrid'],['gdppc','lyrGDPpc'],['tfr','lyrTFR'],['hdi','lyrHDI'],['dem','lyrDem'],
      ['__grp','lyrGrpGeoPol'],
      ['milSpend','lyrMilSpend'],['milSpendGDP','lyrMilSpendGDP'],['nato','lyrNATO'],['eu','lyrEU']
    ].forEach(([id,key])=>{
      if(id==='__grp'){ const h=document.createElement('div'); h.className='lyr-head'; h.setAttribute('data-i18n',key); h.textContent=i18n[HOST.lang][key]||''; dd.appendChild(h); return; }
      const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-'+id;
      const isMonth=(id==='temp');                          /* air-temp uses a MONTH slider, not a day picker */
      const isDated=layerDates.hasOwnProperty(id) && !isMonth;
      const isTraffic=(id==='ships'||id==='planes');
      let extra='';
      if(isMonth){
        /* time slider over the last 36 months (value 36 = newest available month) */
        extra=`<div class="lyr-extras" style="display:none; padding:4px 0 6px 24px; font-size:11px;"><label style="display:flex; align-items:center; gap:8px; color:var(--text-muted);">${t('lyrTimeMonth')||'Month'}: <input type="range" id="mo-${id}" min="0" max="36" value="36" step="1" style="flex:1; accent-color:var(--primary-color);"><span id="molbl-${id}" style="min-width:58px; text-align:right; font-variant-numeric:tabular-nums;">${layerDates[id].slice(0,7)}</span></label></div>`;
      } else if(isDated){
        extra=`<div class="lyr-extras" style="display:none; padding:4px 0 6px 24px; font-size:11px;"><label style="display:flex; align-items:center; gap:6px; color:var(--text-muted);">${t('lyrTime')||'Date'}: <input type="date" id="dt-${id}" value="${layerDates[id]}" max="${new Date().toISOString().slice(0,10)}" style="padding:3px 6px; border-radius:6px; border:1px solid rgba(128,128,128,0.2); background:var(--input-bg); color:var(--text-main); font-size:11px;"></label></div>`;
      }
      if(isTraffic){
        extra=`<div class="lyr-extras" style="display:none; padding:4px 0 6px 24px; font-size:11px;"><label style="display:flex; align-items:center; gap:6px; color:var(--text-muted);">${t('trafficFilter')||'Filter'}: <select id="ft-${id}" style="padding:3px 6px; border-radius:6px; border:1px solid rgba(128,128,128,0.2); background:var(--input-bg); color:var(--text-main); font-size:11px;"><option value="all" data-i18n="filtAll">${t('filtAll')||'All'}</option><option value="civilian" data-i18n="filtCiv">${t('filtCiv')||'Civilian'}</option><option value="military" data-i18n="filtMil">${t('filtMil')||'Military'}</option></select></label></div>`;
      }
      const isSeaLevel=(id==='sealevel');
      if(isSeaLevel){
        /* Sea-level-rise simulator (#24): slider chooses a +rise in meters; the DEM recolors so
           everything below that level floods blue. */
        extra=`<div class="lyr-extras" style="display:none; padding:4px 0 6px 24px; font-size:11px;"><label style="display:flex; align-items:center; gap:8px; color:var(--text-muted);">${HOST.lang==='jp'?'海面変動':HOST.lang==='de'?'Meeresspiegel':HOST.lang==='ru'?'Уровень моря':HOST.lang==='es'?'Nivel del mar':'Sea-level'}: <input type="range" id="sl-${id}" min="-150" max="70" value="${Math.max(-150,Math.min(70,window._seaLevelM||0))}" step="1" style="flex:1; accent-color:var(--primary-color);"><span id="sllbl-${id}" style="min-width:52px; text-align:right; font-variant-numeric:tabular-nums;">${((window._seaLevelM||0)>=0?'+':'')+(window._seaLevelM||0)} m</span></label></div>`;
      }
      /* (#R15c) EVERY opacity layer now owns a legend (specific, generic, or the wind legend), so the
         opacity control lives THERE and the inline Layers-panel slider is hidden for all of them. */
      const HAS_LEGEND=new Set(['climate','hdi','dem','pop','popgrid','eez','temp','thermal','radar','sst','relief','sealevel',
        'gdppc','tfr','milSpend','milSpendGDP','snow','aod','nightsat','wind',
        'precip','clouds','ships','planes','hillshade','contours','night','subcables','nato','eu']);
      if(HAS_LEGEND.has(id)) w.classList.add('has-legend');
      w.innerHTML=`<label class="layer-option"><input type="checkbox" id="dl-${id}"> <span data-i18n="${key}">${i18n[HOST.lang][key]}</span></label><input type="range" class="lyr-op" id="op-${id}" min="0" max="1" step="0.05" value="${opacities[id]}">${extra}`;
      dd.appendChild(w);
      const cb=w.querySelector('#dl-'+id);
      cb.addEventListener('change',e=>{
        w.classList.toggle('on',e.target.checked);
        const ex=w.querySelector('.lyr-extras'); if(ex) ex.style.display=e.target.checked?'block':'none';
        toggleLayer(id,e.target.checked);
      });
      w.querySelector('#op-'+id).addEventListener('input',e=>setLayerOpacity(id,parseFloat(e.target.value)));
      if(isMonth){
        const sl=w.querySelector('#mo-'+id), lbl=w.querySelector('#molbl-'+id);
        sl.addEventListener('input',e=>{ const back=36-parseInt(e.target.value,10); layerDates[id]=tempMonthISO(3+back); if(lbl) lbl.textContent=layerDates[id].slice(0,7); if(cb.checked) refreshDatedLayer(id); try{ _refreshLegendDates(); }catch(_){} });
      }
      if(isDated){
        w.querySelector('#dt-'+id).addEventListener('change',e=>{ layerDates[id]=e.target.value||GIBS_DATE; if(cb.checked){ /* reload tiles for new date */ refreshDatedLayer(id); } try{ _refreshLegendDates(); }catch(_){} });
      }
      if(isTraffic){
        w.querySelector('#ft-'+id).addEventListener('change',e=>{ trafficFilters[id]=e.target.value; refreshTrafficLayer(id); });
      }
      if(isSeaLevel){
        const sl=w.querySelector('#sl-'+id);
        sl.addEventListener('input',e=>{ window._seaLevelM=parseInt(e.target.value,10)||0; if(window._refreshSeaLevel) window._refreshSeaLevel(); });
      }
    });

    /* (#R13) Re-classify the WHOLE layer panel into one coherent taxonomy. The static "Strategic
       geography / networks" groups, the dynamic data layers, the ECMWF rows and the land-cover rows are
       all appended from different places (static HTML + several IIFEs), so rather than rewrite each
       source we re-file every row under fresh category headers here. Place names / Country borders /
       Grid / Countries stay pinned at the top, untouched. Idempotent → safe to re-run on every open.
       Also moves "Open compare view" + "Upload GeoJSON" into a tidy Tools section at the very bottom
       (the user disliked them sitting mid-list). The old "Data layers" section label is dropped. */
    /* (#R14 / #17) "Active layers" — a live list of every currently-ON thematic layer, shown in the
       Layers panel just below the favorites bar and the Country-borders/Grid toggles. Each entry is a
       chip: click the name to scroll to its row, click ✕ to switch it off. Rebuilt whenever any layer
       checkbox changes and on every panel open. (The 4 utility toggles names/borders/grid/countries are
       excluded — they sit right above and would be redundant.) */
    window._refreshActiveLayers=function(){
      const dd=document.getElementById('layer-dropdown'); if(!dd) return;
      const sec=document.getElementById('layer-active-section'); if(!sec) return;
      const lang=(typeof HOST.lang!=='undefined')?HOST.lang:'en';
      const skip=new Set(['cb-names','cb-geolabels','cb-borders','cb-grid','cb-countries','cb-admin1','cb-roads','cb-rail2']);
      const seen=new Set(), chips=[];
      dd.querySelectorAll('input[type=checkbox]').forEach(cb=>{
        if(!cb.checked || skip.has(cb.id) || seen.has(cb)) return; seen.add(cb);   /* key by ELEMENT — geo/strategic rows have no id, so an id key collapsed them all to one */
        const lab=cb.closest('label'); if(!lab) return;
        /* (#R64) :not(.lsr-thumb) — the right-sidebar preview span sits BEFORE the name span and is empty,
           which silently blanked every chip name in right-sidebar mode. */
        const sp=lab.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb)');   /* the name span, not a color-swatch/preview span */
        let name=((sp?sp.textContent:lab.textContent)||'').trim();
        if(!name) return; chips.push({el:cb, name});
      });
      /* (#R139) publish the active thematic-layer count and, when it changes, re-sync the mobile FABs so the
         "Map & layers" FAB is accent-coloured ONLY while at least one thematic layer is on (matches this same
         set — the base name/border/grid/countries toggles above are already excluded via `skip`). */
      const _prevCnt=window._imActiveLayerCount; window._imActiveLayerCount=chips.length;
      if(_prevCnt!==chips.length){ try{ window._imSyncMobile&&window._imSyncMobile(); }catch(_){} }
      /* (#R15c) Skip the rebuild entirely when the active set is unchanged (kills needless flicker), and
         compensate the panel's scroll for any height change so toggling a layer doesn't make the whole
         list jump ("いちいち動いて目にうるさい"). */
      const sig=chips.map(c=>c.name).join('|');
      if(sec.dataset.sig===sig) return;
      /* (#R22) Compensate the ACTUAL scroll container's scrollTop. On mobile the layer-dropdown is
         position:static and the m-sheet body scrolls, so the old dd.scrollTop math was a no-op there →
         the list jerked on every toggle ("チェックをつけると視点位置がパチっと移動"). Walk up to the real
         scroller and, since the Active-layers section sits near the top, just add the height delta. */
      const scrollParent=(el)=>{ let n=el&&el.parentElement; while(n){ const st=getComputedStyle(n); if(/(auto|scroll)/.test(st.overflowY)&&n.scrollHeight>n.clientHeight+2) return n; n=n.parentElement; } return dd; };
      const scroller=scrollParent(sec);
      const beforeTop=scroller.scrollTop;
      sec.dataset.sig=sig;
      /* (#R32) Active layers is now a sticky-BOTTOM bar (pushed last in flow), so its growth/shrink no
         longer reflows the rows above. The old TOP-placement compensation (scrollTop += heightDelta) would
         NOW itself scroll the panel — so it is removed. Instead we simply PIN the scroller to exactly where
         it was, a pure no-move guard ("チェックを付けても1pxたりとも動かない / 視点を一切動かさない"). */
      const _restore=()=>{ try{ if(scroller && scroller.scrollTop!==beforeTop) scroller.scrollTop=beforeTop; }catch(_){} };
      /* (#R64) the bar is ALWAYS rendered (with "(0)" when empty) — if it appeared/disappeared with the first
         toggle, the rows below would shift by its height (the original R32 complaint). Constant height, always. */
      sec.style.display='';
      const title=(lang==='jp'?'表示中のレイヤー':lang==='de'?'Aktive Ebenen':lang==='ru'?'Активные слои':lang==='es'?'Capas activas':'Active layers');
      const clearTxt=(lang==='jp'?'すべて解除':lang==='de'?'Alle aus':lang==='ru'?'Сбросить все':lang==='es'?'Quitar todo':'Clear all');
      const listTxt=(lang==='jp'?'一覧':lang==='de'?'Liste':lang==='ru'?'Список':lang==='es'?'Lista':'List');
      /* (#R19) One-tap deselect-ALL ("すべてのレイヤーを選択解除できるボタン") in the section header.
         (#R69) + a "List" expander (see .alc-panel CSS note) — better UI, same constant bar height. */
      /* (#R72) icon List button (SVG list glyph; title carries the localized label) */
      const _listSvg='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.15" fill="currentColor" stroke="none"/><circle cx="3.6" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="3.6" cy="18" r="1.15" fill="currentColor" stroke="none"/></svg>';
      sec.innerHTML=`<div class="lyr-head lyr-section-label" style="margin-top:2px;display:flex;align-items:center;justify-content:space-between;gap:8px;"><span style="flex:1;min-width:0;">${title} (${chips.length})</span><button class="alc-exp" title="${listTxt}" aria-label="${listTxt}" aria-expanded="false">${_listSvg}</button><button class="alc-clear-all" style="flex:0 0 auto;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);border-radius:8px;padding:3px 9px;font-size:10.5px;cursor:pointer;">${clearTxt}</button></div><div class="active-lyr-chips"></div>`;
      sec.querySelector('.alc-clear-all').onclick=(e)=>{ e.stopPropagation();
        chips.forEach(c=>{ try{ if(c.el.checked){ c.el.checked=false; c.el.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){} });
        setTimeout(()=>{ try{ window._refreshActiveLayers(); }catch(_){} },0); };
      const wrap=sec.querySelector('.active-lyr-chips');
      /* (#R69) vertical mouse wheel scrolls the horizontal strip (it was near-impossible to reach overflowing
         chips with a mouse). */
      wrap.addEventListener('wheel',(e)=>{ if(e.deltaY&&!e.deltaX&&wrap.scrollWidth>wrap.clientWidth){ wrap.scrollLeft+=e.deltaY; e.preventDefault(); } },{passive:false});
      chips.forEach(c=>{
        const chip=document.createElement('span'); chip.className='active-lyr-chip';
        const nm=document.createElement('span'); nm.className='alc-name'; nm.textContent=c.name;
        nm.onclick=()=>{ const row=c.el.closest('.lyr-row')||c.el.closest('label'); if(row&&row.scrollIntoView) try{ row.scrollIntoView({block:'nearest'}); }catch(_){} };
        const x=document.createElement('button'); x.className='alc-x'; x.textContent='✕'; x.title=(lang==='jp'?'非表示':'Hide');
        x.onclick=(e)=>{ e.stopPropagation(); c.el.checked=false; c.el.dispatchEvent(new Event('change',{bubbles:true})); setTimeout(()=>{ try{ window._refreshActiveLayers(); }catch(_){} },0); };
        chip.appendChild(nm); chip.appendChild(x); wrap.appendChild(chip);
      });
      /* (#R69) expandable full list — an ABSOLUTE overlay under the bar (so the rows below never move): full
         layer names, the layer's own opacity slider mirrored inline (drives the real control), jump + remove. */
      const findOp=(cb)=>{ try{ const row=cb.closest('.lyr-row')||cb.closest('label'); if(!row) return null;
        let sl=row.querySelector('input[type=range]'); if(sl) return sl;
        let n=row.nextElementSibling,k2=0; while(n&&k2++<2){ if(n.matches&&n.matches('input[type=range]')) return n; const s2=n.querySelector&&n.querySelector('input[type=range]'); if(s2) return s2; n=n.nextElementSibling; } }catch(_){} return null; };
      const expBtn=sec.querySelector('.alc-exp');
      const buildPanel=()=>{
        const old=sec.querySelector('.alc-panel'); if(old) old.remove();
        const pn=document.createElement('div'); pn.className='alc-panel';
        if(!chips.length){ const em=document.createElement('div'); em.className='alc-empty'; em.textContent=(lang==='jp'?'表示中のレイヤーはありません':lang==='de'?'Keine aktiven Ebenen':lang==='ru'?'Нет активных слоёв':lang==='es'?'Sin capas activas':'No layers are on'); pn.appendChild(em); }
        chips.forEach(c=>{ const row=document.createElement('div'); row.className='alc-row';
          const nm=document.createElement('span'); nm.className='alcr-name'; nm.textContent=c.name; nm.title=c.name;
          nm.onclick=()=>{ const r2=c.el.closest('.lyr-row')||c.el.closest('label'); if(r2&&r2.scrollIntoView) try{ r2.scrollIntoView({block:'nearest'}); }catch(_){} };
          row.appendChild(nm);
          const src=findOp(c.el);
          if(src){ const rg=document.createElement('input'); rg.type='range';
            rg.min=src.min||0; rg.max=src.max||1; rg.step=src.step||'any'; rg.value=src.value;
            rg.title=(lang==='jp'?'透明度':lang==='de'?'Deckkraft':lang==='ru'?'Непрозрачность':lang==='es'?'Opacidad':'Opacity');
            rg.oninput=()=>{ try{ src.value=rg.value; src.dispatchEvent(new Event('input',{bubbles:true})); src.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} };
            row.appendChild(rg); }
          const x=document.createElement('button'); x.className='alc-x'; x.textContent='✕'; x.title=(lang==='jp'?'非表示':'Hide');
          x.onclick=()=>{ try{ c.el.checked=false; c.el.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} setTimeout(()=>{ try{ window._refreshActiveLayers(); }catch(_){} },0); };
          row.appendChild(x); pn.appendChild(row); });
        sec.appendChild(pn); };
      const setExp=(on)=>{ window._alcExpanded=!!on; expBtn.classList.toggle('on',!!on); expBtn.setAttribute('aria-expanded',on?'true':'false');
        if(on) buildPanel(); else { const old=sec.querySelector('.alc-panel'); if(old) old.remove(); } };
      expBtn.onclick=(e)=>{ e.stopPropagation(); setExp(!window._alcExpanded); };
      if(!window._alcCloser){ window._alcCloser=true;
        document.addEventListener('pointerdown',(e)=>{ try{ if(!window._alcExpanded) return; const s2=document.getElementById('layer-active-section'); if(s2&&!s2.contains(e.target)){ window._alcExpanded=false; const b2=s2.querySelector('.alc-exp'); if(b2){ b2.classList.remove('on'); b2.setAttribute('aria-expanded','false'); } const old=s2.querySelector('.alc-panel'); if(old) old.remove(); } }catch(_){} }); }
      if(window._alcExpanded) setExp(true);   /* keep the list open across rebuilds (layer set changed) */
      _restore();
    };
    /* (#R34) Relocate the Active-layers bar to the right scroll container per platform. On mobile it must be a
       sticky LAST CHILD of the SHEET scroller (.m-sheet-scroll) so it pins to the sheet bottom; on desktop it
       belongs at the bottom of the dropdown. reorganizeLayerPanel always re-appends it to the dropdown, so we
       re-place it after every reorganize and on layout changes. */
    /* (#R64) the bar goes to the TOP of its scroll container on BOTH platforms ("一番下にあったら意味ない");
       its fixed-height chip row keeps the R32 no-reflow guarantee. */
    window._placeActiveSection=function(){
      try{ const act=document.getElementById('layer-active-section'); if(!act) return;
        const isM = window.matchMedia && window.matchMedia('(max-width:768px)').matches;
        if(isM){ const sc=document.querySelector('#mo-sheet .m-sheet-scroll'); if(sc && sc.firstChild!==act) sc.insertBefore(act,sc.firstChild); }
        /* (#R70) while the right tile sidebar is open, the Active-layers bar lives at ITS top */
        else if(document.body.classList.contains('lsr-open')){ const bd=document.querySelector('#layer-sidebar-r .lsr-body'); if(bd && bd.firstChild!==act) bd.insertBefore(act,bd.firstChild); }
        else { const dd=document.getElementById('layer-dropdown'); if(dd && dd.firstChild!==act) dd.insertBefore(act,dd.firstChild); }
      }catch(_){}
    };
    /* Any layer checkbox toggle → refresh the active-layers list (deferred so toggleLayer runs first). */
    document.getElementById('layer-dropdown')&&document.getElementById('layer-dropdown').addEventListener('change',(e)=>{
      if(e.target&&e.target.type==='checkbox'){ setTimeout(()=>{ try{ window._refreshActiveLayers(); }catch(_){} },0);
        /* (#R24 fix) ONE deferred label re-assert, and NOT during the intro demo. The old 60/400/1200 ms burst
           spammed moveLayer → styledata, which kept the map from reaching 'idle' — and the GIBS overlays
           (nightsat/relief/popgrid) add inside `whenStyleReady()` (resolves on idle), so during the demo's
           rapid cycling their add was delayed past the 6.5 s window → "ケッペン以外のレイヤーが表示されない".
           The existing idle/styledata self-heal (labels-on-top block) keeps labels on top during the demo. */
        if(!window._imDemoActive) setTimeout(()=>{ try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} },700); }
    });
    /* (#R106) re-localize the "Active layers" heading (+ empty/chip text) on a language change. _refreshActiveLayers
       early-returns when the layer SET is unchanged (a signature guard), so the heading stayed in the old language
       ("言語設定を変えてもすぐ変わらない" in the Layers window). Clear the sig so it truly re-renders. */
    window.addEventListener('intmap-lang',()=>{ try{ const sec=document.getElementById('layer-active-section'); if(sec) sec.dataset.sig='relang'; /* a sentinel that never equals a real layer-name signature (incl. the empty "0 layers" case) → truly forces a re-render */ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){} });
    /* (#R28) SCROLL-CANCEL guard — only cancel a layer toggle when the gesture was a REAL scroll/drag,
       NOT a tap that jittered a little. The R27 version cancelled ANY click after a >10px pointer move,
       which silently DROPPED legitimate taps (a finger tap easily moves >10px on a phone) → that was the
       "チェックの動作が不安定" / "デスクトップでもチェックを付けても動かない" instability. The right signal is
       whether the LIST actually scrolled: remember the scroll container's scrollTop on pointer-down, and on
       click cancel ONLY if it moved (a real scroll) or the pointer travelled a long way (>26px = a drag, not
       a tap). A clean tap ALWAYS toggles; a scroll NEVER toggles. We only ever SUPPRESS — we never synthesize
       a toggle — so this can never turn a layer on by itself (no phantom layers). */
    /* (#R29) DETERMINISTIC single-toggle for the simple layer rows (the 4 utility toggles + every
       strategic/geo `label.layer-option`). The user re-reported the 4 checks "チラついたり誤チェックが入る".
       Root model: a tap can (a) double-fire on touch, or (b) land on a row a mid-tap reflow shifted →
       the WRONG row toggles. Fix: we OWN the toggle — preventDefault the native label toggle and toggle
       EXACTLY the row the FINGER WENT DOWN ON, exactly once, and only if the gesture was a real tap (no
       scroll, no drag, didn't drift to another row). Interactive sub-controls (color/opacity/buttons)
       are left alone. Rows with sub-controls (.lyr-row) keep suppress-only so their controls still work. */
    (function(){
      const dd=document.getElementById('layer-dropdown'); if(!dd) return;
      const scrollerOf=(el)=>{ let n=el; while(n&&n!==document.body){ const st=getComputedStyle(n); if(/(auto|scroll)/.test(st.overflowY)&&n.scrollHeight>n.clientHeight+2) return n; n=n.parentElement; } return dd; };
      const SUBCTRL='button, input[type=color], input[type=range], select, a, textarea, [role="button"], input[type=date], .alc-x, .alc-name, .alc-clear-all';
      /* (#R37) Resolve the checkbox a tap should toggle from EITHER a `label.layer-option` OR the whole
         `.lyr-row` (so a tap on the row's padding — outside the inner label — is no longer a dead zone, a
         real part of "しっかりタップしないとチェックがつかない"). The box always has pointer-events:none, so the
         finger never lands on the <input> itself → we are always the single, deterministic toggle path. */
      const boxFor=(el)=>{ if(!el||!el.closest) return null;
        const lab=el.closest('label.layer-option'); if(lab){ const c=lab.querySelector('input[type=checkbox]'); if(c) return c; }
        const row=el.closest('.lyr-row'); if(row){ const c=row.querySelector('input[type=checkbox]'); if(c) return c; }
        return null; };
      let downBox=null, downX=0, downY=0, far=false, pUpRan=false;
      dd.addEventListener('pointerdown',(e)=>{ pUpRan=false; if(e.target.closest&&e.target.closest(SUBCTRL)){ downBox=null; return; } downBox=boxFor(e.target); downX=e.clientX; downY=e.clientY; far=false; },true);
      /* >30px finger travel = a genuine drag/scroll (well above tap jitter, well below a deliberate swipe).
         This — NOT scrollTop-delta (momentum-settle false-positives, R28→R36) — is the reliable scroll signal. */
      dd.addEventListener('pointermove',(e)=>{ if(Math.abs(e.clientX-downX)>30||Math.abs(e.clientY-downY)>30) far=true; },true);
      /* (#R38) ROOT FIX for the re-reported "感度がよわい / しっかりタップしないとチェックがつかない": the toggle used to
         fire on the synthetic CLICK, which iOS emits ~300ms late and DROPS unpredictably inside a scroll container —
         so a normal tap often did nothing unless you pressed firmly. Toggle on POINTERUP instead (fires the instant
         the finger lifts, every time); the click handler is now ONLY a suppressor so the native label→checkbox
         activation can never double-toggle. Down-targeting (toggle the row the finger went DOWN on) is KEPT — it
         fixed "タップした行と違う行が反応する / Grid が勝手にチェックされる". We only ever SUPPRESS on a real drag —
         never synthesize a phantom toggle (no auto-check). */
      const toggleFromPointer=(e)=>{
        if(e.target.closest && e.target.closest(SUBCTRL)) return;
        const cb = downBox || boxFor(e.target);
        if(!cb || !cb.isConnected || far || cb.disabled) return;
        const scNow=scrollerOf(cb); const tp=scNow?scNow.scrollTop:0;
        const pin=()=>{ if(scNow){ scNow.scrollTop=tp; requestAnimationFrame(()=>{ try{ if(scNow.scrollTop!==tp) scNow.scrollTop=tp; }catch(_){} }); setTimeout(()=>{ try{ if(scNow.scrollTop!==tp) scNow.scrollTop=tp; }catch(_){} },0); } };
        cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true}));
        try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){}
        pin();
      };
      dd.addEventListener('pointerup',(e)=>{ pUpRan=true; try{ toggleFromPointer(e); }catch(_){} },true);
      dd.addEventListener('click',(e)=>{
        try{
          if(e.target.closest && e.target.closest(SUBCTRL)) return;     /* a real control handles itself */
          const r=e.target.closest&&(e.target.closest('label.layer-option')||e.target.closest('.lyr-row'));
          if(r){ e.preventDefault(); e.stopPropagation();   /* cancel the native label→box click so it can't double-toggle */
            if(!pUpRan){ toggleFromPointer(e); }            /* fallback for engines that synthesize click without pointerup */
          }
        }catch(_){ } finally { pUpRan=false; }
      },true);
    })();
    window.reorganizeLayerPanel=function(){
      const dd=document.getElementById('layer-dropdown'); if(!dd) return;
      try{
        /* (#R15 / #26) Curated taxonomy. Only the layers the user wants front-and-center live in these
           categories; every other (beta / incomplete) layer is swept into the "Others (beta)" group at the
           bottom so the panel reads cleanly. (#R15c) ec-time moved OUT of the panel into a floating legend. */
        /* (#R32b) The World-Bank choropleths + earthquakes are PROMOTED out of "Others (beta)" into real
           groups ("正規レイヤーに") — wbco2/wbforest = environment, the rest = population & economy, eq = hazards. */
        const GROUPS=[
          ['lyrGrpClimate',['climate','wind','radar','ec-cloud','snow','aod','gxaero','gxco','wbco2','wbforest']],   /* (#R40) the 7 GIBS temp/cloud/true-color rasters were DEMOTED to Others(beta) per request; only kept-quality rasters stay in real groups. (#R41) +OMPS UV aerosol index. (#R42) +carbon monoxide (AIRS, objective + exact legend) */
          ['lyrGrpMaritime',['sst','eez','subcables','planes','gxseaice','gxsstanom']],   /* (#R42b) chlorophyll-a DEMOTED to Others(beta) per request — stays out of the real group, swept into beta below */
          ['lyrGrpTerrain',['worldcover','ecoregions','plates','relief','hillshade','contours','sealevel','gxndvi','gxrelief','wbagri','gxsoil']],   /* (#R40) Blue Marble removed (deleted); +agricultural-land (World Bank) promoted. (#R42) +soil moisture (AMSR2, objective + exact legend) */
          ['lyrGrpDemo',['pop','popgrid','gdppc','tfr','hdi','dem','cpi','lifeexp','unemp','internet','wburb','wbelec','wbhealth','wbrenew','wbmobile','wbinfl','wbinfmort','wbgdpgrow','wblit','wbgini','wbpov','wbu5mort','wbwater','wbphys','wbschool']],   /* (#R39/#R40) promote objective/sourced World-Bank indicators (literacy, inequality, poverty, U5 mortality, safe water, physicians, schooling) to real layers — same standard as their already-promoted siblings */
          ['lyrGrpHazard',['thermal','aurora','nightsat','night','volc2','eq']],
          ['lyrGrpGeoPol',['milSpend','milSpendGDP','nato','eu','ukrfront','rail']],   /* (#R26) EU members layer added beside NATO; (#R122) fsu + histb removed per request */
          ['lyrGrpIndic',['tz']]   /* (#R41) Indicators & overlays — Time-zone layer promoted out of beta (objective Natural Earth data, has a legend + live clock) */
        ];
        /* Explicit order for the Others/beta group; a safety sweep below also catches anything missed. */
        const OTHERS_IDS=['ec-temp','temp','ec-precip','precip','ec-wind','ec-dew','ec-isobars','ec-slp','ec-cape','ec-sst','ships','seaRoute','chokepoints','dams','sahel','islandChain1','islandChain2','stringOfPearls','bri','pipelines','nuclear'];
        const rowFor=(id)=>{ let el=document.getElementById('lyrrow-'+id); if(el) return el;
          el=document.getElementById('eco-dl-'+id)||document.getElementById('l9-dl-'+id)||document.getElementById('beta-dl-'+id); if(el) return el.closest('.lyr-row')||el.closest('label');   /* (#R20) beta-dl- so promoted ex-beta layers (histb, ukrfront) can be filed into a real group */
          el=dd.querySelector('input[data-layer="'+id+'"]'); if(el) return el.closest('.lyr-row')||el.closest('label');
          return null; };
        const lang=(typeof HOST.lang!=='undefined')?HOST.lang:'en';
        const T=(k)=>{ try{ return (i18n[lang]&&i18n[lang][k])||(i18n.en&&i18n.en[k])||k; }catch(_){ return k; } };   /* (#R40) fall back to English (e.g. Spanish/beta) so group headers never show the raw key */
        /* strip old headers + top-level dividers (favorites' inner <hr> is nested, so it survives) */
        dd.querySelectorAll(':scope > .layer-group-title, :scope > .lyr-head').forEach(n=>n.remove());
        dd.querySelectorAll(':scope > hr').forEach(n=>n.remove());
        dd.querySelectorAll(':scope > .lyr-others-note').forEach(n=>n.remove());   /* (#R15b) was accumulating one note per run */
        const order=[];
        const fav=document.getElementById('layer-fav-section'); if(fav) order.push(fav);
        /* (#R33) Requested order: Place names, Country borders, State/province, Roads, Railways, Grid, Countries(info). */
        ['cb-names','cb-geolabels','cb-borders','cb-admin1','cb-roads','cb-rail2','cb-grid','cb-countries'].forEach(id=>{ const el=document.getElementById(id); const lab=el&&el.closest('label'); if(lab) order.push(lab); });
        /* (#R14 / #17) the live "Active layers" list. DESKTOP: right below the favorites + top toggles.
           (#R25) MOBILE: moved to the BOTTOM (just before Tools) — when it sat at the top, toggling the
           FIRST layer made it appear above the rows and the scroll-compensation had to scroll the list,
           which read as "視点位置がパチっと移動". At the bottom it never pushes the rows you're tapping, so the
           list truly doesn't move on check/uncheck. */
        let act=document.getElementById('layer-active-section'); if(!act){ act=document.createElement('div'); act.id='layer-active-section'; act.style.display='none'; }
        /* (#R28) Active layers is ALWAYS at the TOP now (right below the 4 utility toggles) on EVERY platform.
           The R25 move-to-bottom on mobile read as "active layers欄が消えた" — the list was buried below the
           whole layer list + Tools, so it looked removed. Back at the top it's always visible. (The iOS
           delayed-click retarget that the bottom-placement worked around is already killed by
           touch-action:manipulation, so growing this section no longer mis-targets a tap.) */
        /* (#R32) Active layers is NO LONGER at the top. It is pushed LAST as a position:sticky;bottom:0 bar
           (see end of this fn + the #layer-active-section CSS) so adding/removing chips never reflows the
           rows above → a layer toggle moves the panel 0px on desktop AND mobile, while it stays pinned visible. */
        const mkHr=()=>{ const h=document.createElement('hr'); h.style.cssText='border:0;border-top:1px solid rgba(128,128,128,0.2);width:100%;margin:6px 0;'; return h; };
        order.push(mkHr());
        const placed=new Set();
        GROUPS.forEach(([key,ids])=>{ const rows=ids.map(rowFor).filter(Boolean); if(!rows.length) return;
          const h=document.createElement('div'); h.className='lyr-head'; h.setAttribute('data-i18n',key); h.textContent=T(key); order.push(h);
          rows.forEach(r=>{ try{ r.style.display=''; }catch(_){} order.push(r); placed.add(r); }); });
        /* (#R15 / #26) "Others (beta)" — every remaining thematic layer row. Start with the explicit list,
           then a safety sweep adds any layer row not already placed (so new layers never strand at the top). */
        const otherRows=[];
        OTHERS_IDS.forEach(id=>{ const r=rowFor(id); if(r && !placed.has(r)){ otherRows.push(r); placed.add(r); } });
        /* (#R15b) CRITICAL: use :scope > so we only sweep TOP-LEVEL rows. The old `.lyr-row, label.layer-option`
           also matched the <label.layer-option> NESTED inside every .lyr-row and ripped those labels out of
           their parent rows (the panel "ぐちゃぐちゃ"). Direct children only: .lyr-row divs + the standalone
           geo/strategic labels. */
        dd.querySelectorAll(':scope > .lyr-row, :scope > label.layer-option').forEach(r=>{
          if(placed.has(r)) return;
          const cb=r.querySelector('input[type=checkbox]'); if(!cb) return;
          if(['cb-names','cb-geolabels','cb-borders','cb-grid','cb-countries','cb-admin1','cb-roads','cb-rail2'].includes(cb.id)) return;
          otherRows.push(r); placed.add(r);
        });
        if(otherRows.length){
          const oh=document.createElement('div'); oh.className='lyr-head'; oh.setAttribute('data-i18n','lyrGrpOthers'); oh.textContent=T('lyrGrpOthers'); order.push(oh);
          const note=document.createElement('div'); note.className='lyr-others-note'; note.textContent=(lang==='jp'?'動作しない場合や不完全な場合があります。':lang==='de'?'Kann unvollständig sein oder nicht voll funktionieren.':lang==='ru'?'Может быть неполным или работать не полностью.':lang==='es'?'Puede estar incompleto o no funcionar del todo.':'May be incomplete or not fully working.'); order.push(note);
          otherRows.forEach(r=>{ try{ r.style.display=''; }catch(_){} order.push(r); });
        }
        /* Tools section (compare + upload) pinned to the very bottom */
        const upBtn=document.getElementById('btn-upload-geojson');
        const cmpBtn=document.getElementById('btn-compare'); const ugj=document.getElementById('ugj-list');
        const corrBtn=document.getElementById('btn-correlate');   /* (#R39) capture BEFORE tools.innerHTML='' detaches it */
        let tools=document.getElementById('layer-tools'); if(!tools){ tools=document.createElement('div'); tools.id='layer-tools'; }
        const _pr=document.getElementById('lyr-presets');   /* (#R20) rescue the presets host before the wipe */
        const _edu=document.getElementById('edu-mount');    /* (#R20) …and the Education-mode button */
        tools.innerHTML='';
        const th=document.createElement('div'); th.className='lyr-head lyr-section-label'; th.style.marginTop='2px'; th.textContent=(lang==='jp'?'ツール':lang==='de'?'Werkzeuge':lang==='ru'?'Инструменты':lang==='es'?'Herramientas':'Tools'); tools.appendChild(th);
        /* reset display: these persistent buttons get moved here each rebuild; clear any stale display:none
           left over from an earlier collapse so the Tools section always shows (#R13c). */
        if(cmpBtn){ cmpBtn.style.display=''; cmpBtn.style.width='100%'; cmpBtn.style.margin='4px 0 0'; tools.appendChild(cmpBtn); }
        if(corrBtn){ corrBtn.style.display=''; corrBtn.style.width='100%'; corrBtn.style.margin='6px 0 0'; tools.appendChild(corrBtn); }   /* (#R39) two-layer scatter/correlation */
        if(upBtn){ upBtn.style.display=''; upBtn.style.width='100%'; upBtn.style.margin='6px 0 0'; tools.appendChild(upBtn); }
        if(ugj){ ugj.style.display=''; tools.appendChild(ugj); }
        if(_edu) tools.appendChild(_edu); /* (#R20) Education mode button lives in Tools */
        if(_pr) tools.appendChild(_pr);   /* (#R20) layer presets live in Tools */
        if(cmpBtn||upBtn){ order.push(mkHr()); order.push(tools); }
        order.forEach(n=>dd.appendChild(n));
        /* (#R64) Active layers is now the sticky-TOP bar ("一番下にあったら意味ない"); its fixed-height chip row
           preserves the R32 zero-movement guarantee. _placeActiveSection (called below) prepends it. */
        dd.insertBefore(act,dd.firstChild);
        /* drop the now-emptied module wrappers (their buttons/lists were moved into Tools above) */
        ['ec-mount','cmp-mount','ugj-mount'].forEach(id=>{ const w=document.getElementById(id); if(w) w.remove(); });
        /* (#R29) Mobile: "Others (beta)" is a pulldown — collapse it by default (unless the user opened it). */
        try{ if(window.matchMedia && window.matchMedia('(max-width:768px)').matches){ const _oh=dd.querySelector(':scope > .lyr-head[data-i18n="lyrGrpOthers"]'); if(_oh && !_oh.dataset.userToggled) _collapseGroup(_oh); } }catch(_){}
        try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){}
        try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){}   /* (#R34) move the bar to the sheet scroller on mobile */
      }catch(e){ try{ console.warn('reorganizeLayerPanel',e); }catch(_){} }
    };
    /* (#R19) Mobile-start smoothness: the very first panel reorganization (a few hundred DOM moves)
       used to run synchronously inside the boot path and contributed to the "スタート時の動作がぎこちない"
       jank. On phones it now waits for an idle slice (the panel is reorganized again on every open
       anyway, so nothing can be stale); desktop keeps the immediate call. */
    if(typeof isMobile==='function'&&isMobile()&&window.requestIdleCallback){ requestIdleCallback(()=>{ try{ window.reorganizeLayerPanel(); }catch(_){} },{timeout:2500}); }
    else window.reorganizeLayerPanel();

    const beforeId = map.getLayer('tool-poly') ? 'tool-poly' : undefined;
    const setVis=(l,on)=>{ if(map.getLayer(l)) map.setLayoutProperty(l,'visibility',on?'visible':'none'); };
    /* Verified: IMERG date-only URL (e.g. .../IMERG_Precipitation_Rate/default/2026-05-26/...)
       returns 200 OK for tile (0,0,0). The "blank" appearance was because there is little global
       precipitation visible at zoom 0 — keeping the date-only URL like MODIS Temperature. */
    const gibs=(layer,lvl,ext,time)=>[`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${time||GIBS_DATE}/GoogleMapsCompatible_Level${lvl}/{z}/{y}/{x}.${ext}`];
    /* Non-temporal GIBS layers (e.g. GPW population) omit the date segment entirely. */
    const gibsStatic=(layer,lvl,ext)=>[`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/GoogleMapsCompatible_Level${lvl}/{z}/{y}/{x}.${ext}`];
    function addRaster(id,tiles,maxz){ if(map.getSource('src-'+id))return; map.addSource('src-'+id,{type:'raster',tiles,tileSize:256,maxzoom:maxz}); map.addLayer({id:'lyr-'+id,type:'raster',source:'src-'+id,layout:{visibility:'none'},paint:{'raster-opacity':opacities[id]}},beforeId); }

    const NATO=new Set("USA CAN GBR FRA DEU ITA ESP PRT NLD BEL LUX DNK NOR ISL POL CZE SVK HUN ROU BGR HRV SVN EST LVA LTU GRC TUR ALB MNE MKD FIN SWE".split(' '));
    /* BUG FIX: previous version polled for the 'countries' source but never created it
       if the style finished loading after countryData arrived. Now we explicitly add
       the source/layers whenever we are ready and it is missing. */
    function withCountries(cb){
      loadCountryData().then(()=>{
        function tryAdd(){
          if(_canDraw()&&HOST.countryGeo&&!map.getSource('countries')){   /* (#R170) parsed style is all addCountryLayers needs */
            try{ addCountryLayers(); }catch(e){ console.warn('addCountryLayers failed (will retry)',e); }
          }
        }
        tryAdd();
        let n=0;
        (function w(){
          if(map&&map.getSource('countries')&&HOST.countryGeo){ try{ cb(); }catch(e){ console.warn('withCountries cb failed',e); } return; }
          /* Wait MUCH longer (200 tries × 200ms = 40 s) to survive slow CDN style loads. */
          if(n++<200){ tryAdd(); setTimeout(w,200); }
          else console.warn('withCountries: gave up waiting for country source');
        })();
      });
    }
    /* Helper: resolves as soon as it is SAFE TO ADD sources/layers — not when the map has fully settled.
       (#R170) That distinction is the whole point. This gate used to test map.isStyleLoaded(), which in
       MapLibre means "style parsed AND every source cache loaded", so it stayed false for most of the time
       the user was panning (measured 86% of a 12 s pan). Every layer that adds inside whenStyleReady()
       therefore waited for the map to fall idle, or for the 6 s hard-resolve below — measured toggle-ON →
       painted: 4497 ms / 3171 ms while busy vs 189 ms while idle. Same click, wildly different latency:
       the reported 「レイヤーをオンオフしても、時間差で表示されたり表示されなかったりする」.
       HOST.canDraw() answers the question actually being asked (is the style object parsed?), which is all
       addSource/addLayer need. The listeners + poll + hard-resolve below are kept unchanged as the safety
       net for the genuine not-yet-parsed window (first load, and a real setStyle() base-map swap). */
    /* function DECLARATION, not a const: it is called from withCountries() further UP this file, and a
       `const` here would leave those calls in the temporal dead zone (the #R167 trap). */
    function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!map.isStyleLoaded(); }catch(__){ return false; } } }
    function whenStyleReady(){
      return new Promise(res=>{
        let done=false;
        const fin=()=>{ if(done) return; done=true; try{ map.off('idle',ck); map.off('styledata',ck); map.off('load',ck); }catch(_){} res(); };
        const ck=()=>{ if(_canDraw()) fin(); };
        if(_canDraw()){ res(); return; }
        map.on('idle',ck); map.on('styledata',ck); map.on('load',ck);
        /* (#R41) ROOT CAUSE of "レイヤー/ラベルをチェックしても表示されない・ブラウザ再読み込みで治る": the old version
           waited ONLY on idle/load. If ANOTHER source is still loading or erroring, the map never reaches a clean
           idle, so this promise hung FOREVER and the layer was never added — a reload (clean state) was the only
           cure. Now also listen on styledata, POLL independently (covers the TOCTOU race where the style finished
           between the sync check and the listener registration), and as a last resort resolve anyway after ~6 s —
           addSource/addLayer work fine as long as the style object exists, so a slightly-early add beats a layer
           that never appears. */
        let n=0; (function poll(){ if(done) return; if(_canDraw()||n++>40) fin(); else setTimeout(poll,150); })();
      });
    }
    /* Hover a choropleth country → tooltip with its name + the metric value. */
    const CHORO_META={
      pop:{label:()=>HOST.lang==='jp'?'人口密度':HOST.lang==='de'?'Bevölkerungsdichte':HOST.lang==='ru'?'Плотность населения':HOST.lang==='es'?'Densidad de población':'Pop. density', fmt:s=>s.density!=null?Math.round(s.density).toLocaleString()+' /km²':'—'},
      hdi:{label:()=>'HDI (2022)', fmt:s=>s.hdi!=null?s.hdi.toFixed(3):'—'},
      dem:{label:()=>HOST.lang==='jp'?'民主主義指数 (2023)':HOST.lang==='de'?'Demokratieindex (2023)':HOST.lang==='ru'?'Индекс демократии (2023)':HOST.lang==='es'?'Índice de democracia (2023)':'Democracy Index (2023)', fmt:s=>s.dem!=null?s.dem.toFixed(2):'—'},
      /* Military spending choropleths (#26) — absolute (SIPRI 2023, $B) and as a share of GDP. */
      milSpend:{label:()=>HOST.lang==='jp'?'国防費 (2023)':HOST.lang==='de'?'Militärausgaben (2023)':HOST.lang==='ru'?'Военные расходы (2023)':HOST.lang==='es'?'Gasto militar (2023)':'Mil. spending (2023)', fmt:s=>s.milSpend!=null?'$'+s.milSpend+'B':'—'},
      milSpendGDP:{label:()=>HOST.lang==='jp'?'国防費 (対GDP)':HOST.lang==='de'?'Militärausgaben (% BIP)':HOST.lang==='ru'?'Военные расходы (% ВВП)':HOST.lang==='es'?'Gasto militar (% PIB)':'Mil. spending (% GDP)', fmt:s=>{ const p=(s.milSpend!=null&&s.gdp)?(s.milSpend/s.gdp*100):null; return p!=null?p.toFixed(2)+'%':'—'; }},
      /* GDP per capita (#R9) — nominal USD; (#R22) the readout also shows the PPP figure when loaded. */
      gdppc:{label:()=>HOST.lang==='jp'?'1人当たりGDP':HOST.lang==='de'?'BIP pro Kopf':HOST.lang==='ru'?'ВВП на душу населения':HOST.lang==='es'?'PIB per cápita':'GDP per capita', fmt:s=>s.gdppc!=null?(fmtPc(s.gdppc)+(s.gdppcPPP!=null?' · PPP '+fmtPc(s.gdppcPPP):'')):'—'},
      tfr:{label:()=>HOST.lang==='jp'?'合計特殊出生率':HOST.lang==='de'?'Geburtenrate (TFR)':HOST.lang==='ru'?'Суммарный коэффициент рождаемости':HOST.lang==='es'?'Tasa de fecundidad total':'Total fertility rate', fmt:s=>s.tfr!=null?s.tfr.toFixed(2):'—'}
    };
    /* (#R13c) Value of the active choropleth under the cursor, for the bottom-left coord readout —
       so EVERY numeric layer (not just Köppen/temp/SST) shows its value at the cursor. One
       queryRenderedFeatures over all visible choropleth fills → topmost wins. Returns "Label: value". */
    window.choroValueAt=function(lng,lat){
      try{
        if(!map||!countryStats) return null;
        const fillIds=Object.keys(CHORO_META).map(id=>id+'-fill').filter(L=>map.getLayer(L));
        if(!fillIds.length) return null;
        const pt=map.project([lng,lat]);
        const cv=map.getCanvas();
        const onScreen=pt&&pt.x>=0&&pt.y>=0&&pt.x<=((cv&&cv.clientWidth)||1e9)&&pt.y<=((cv&&cv.clientHeight)||1e9);
        if(onScreen){
          const hit=map.queryRenderedFeatures(pt,{layers:fillIds});
          if(hit&&hit.length){ const f=hit[0]; const id=f.layer.id.replace(/-fill$/,''); const meta=CHORO_META[id]; const s=countryStats[f.id];
            if(meta&&s){ return meta.label()+': '+meta.fmt(s); } } }
        /* (#R121) OFF-SCREEN (or renderer miss) → resolve the country by point-in-polygon over countryGeo and
           read the SAME countryStats the visible fill paints — the choropleth value no longer needs the point
           to be on screen ("choropleth画面外サンプリング"). Only VISIBLE fills report. */
        const visIds=fillIds.filter(Lid=>{ try{ return map.getLayoutProperty(Lid,'visibility')==='visible'; }catch(_){ return false; } });
        if(!visIds.length||!HOST.countryGeo||!HOST.countryGeo.features||!window._imPipGeo) return null;
        const f2=HOST.countryGeo.features.find(ft=>ft&&ft.id!=null&&ft.geometry&&window._imPipGeo(lng,lat,ft.geometry));
        if(f2){ const s2=countryStats[f2.id]; if(s2){ const id2=visIds[0].replace(/-fill$/,''); const meta2=CHORO_META[id2];
          if(meta2) return meta2.label()+': '+meta2.fmt(s2); } }
      }catch(_){}
      return null;
    };
    function wireChoroHover(id){
      const meta=CHORO_META[id]; if(!meta) return;
      map.__choroHover=map.__choroHover||{}; if(map.__choroHover[id]) return; map.__choroHover[id]=true;
      map.on('mousemove',id+'-fill',e=>{
        if(!e.features.length) return;
        const s=countryStats[e.features[0].id]; if(!s) return;
        const el=ensureMapTooltip(); el.style.display='block';
        el.innerHTML=`<div style="font-weight:600;font-size:14px;">${s.flag?s.flag+' ':''}${cName(s)}</div><div style="margin-top:5px;color:var(--text-muted);font-size:12px;">${meta.label()}: <b style="color:var(--text-main);">${meta.fmt(s)}</b></div>`;
        positionTooltip(e.point);
      });
      map.on('mouseleave',id+'-fill',()=>{ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
    }
    function addChoro(id){
      if(map.getLayer(id+'-fill'))return;
      let ramp;
      if(id==='hdi') ramp=['interpolate',['linear'],['to-number',['feature-state','hdi'],-1],.45,'#a50026',.6,'#f46d43',.7,'#fee08b',.8,'#a6d96a',.95,'#1a9850'];
      else if(id==='dem') ramp=['interpolate',['linear'],['to-number',['feature-state','dem'],-1],1,'#a50026',4,'#f46d43',6,'#fee08b',8,'#74add1',10,'#313695'];
      else if(id==='milSpend') ramp=['interpolate',['linear'],['to-number',['feature-state','milSpend'],-1],1,'#fff7ec',5,'#fdd49e',20,'#fc8d59',75,'#d7301f',300,'#7f0000',916,'#4d0000'];
      else if(id==='milSpendGDP') ramp=['interpolate',['linear'],['to-number',['feature-state','milSpendGDP'],-1],0.5,'#edf8fb',1,'#b2e2e2',2,'#66c2a4',3.5,'#2ca25f',6,'#006d2c'];
      else if(id==='gdppc') ramp=['interpolate',['linear'],['to-number',['feature-state','gdppc'],-1],1000,'#fff7ec',5000,'#fee8c8',15000,'#fdbb84',30000,'#fc8d59',55000,'#e34a33',90000,'#7f0000'];
      else if(id==='tfr') ramp=['interpolate',['linear'],['to-number',['feature-state','tfr'],-1],1,'#2c7fb8',2.1,'#7fcdbb',3,'#ffffb2',4.5,'#fe9929',6.5,'#cc4c02'];
      else ramp=['interpolate',['linear'],['to-number',['feature-state','pop'],-1],2,'#ffffcc',20,'#fed976',100,'#fd8d3c',500,'#e31a1c',3000,'#800026'];
      /* Countries WITHOUT data are painted neutral gray. NOTE: an UNSET feature-state reads as
         null, and MapLibre's to-number(null) is 0 (NOT the -1 fallback) — so we must test "<= 0",
         and applyChoro also writes an explicit -1 sentinel for no-data countries. All real metric
         values (HDI, Democracy 0–10, pop-density) are > 0, so "<= 0" cleanly means "no data". */
      const noData=['<=',['to-number',['feature-state',id],0],0];
      map.addLayer({id:id+'-fill',type:'fill',source:'countries',layout:{visibility:'none'},paint:{
        'fill-color':['case',noData,'#9aa0a6',ramp],
        /* No-data gray now scales with the opacity slider too (#44) — slightly subtler than data fills. */
        'fill-opacity':['case',noData,Math.max(0,opacities[id]*0.75),opacities[id]]
      }},beforeId);
      wireChoroHover(id);
    }
    function applyChoro(id,valFn){
      if(!HOST.countryGeo) return;
      let count=0;
      HOST.countryGeo.features.forEach(f=>{
        if(f.id==null) return;
        const s=countryStats[f.id];
        const v=s?valFn(s):null;
        if(v!=null && !isNaN(v) && v>0){ map.setFeatureState({source:'countries',id:f.id},{[id]:v}); count++; }
        else { map.setFeatureState({source:'countries',id:f.id},{[id]:-1}); }   /* explicit no-data → gray */
      });
      /* If no data made it through, the layer would be invisible — warn and bail. */
      if(count===0) console.warn('applyChoro: no feature-state set for',id);
    }
    /* (#R94) Re-apply every VISIBLE country choropleth from the current countryStats — used by the
       time-machine after it overlays a past year's World Bank figures (or restores the present). */
    window._imReapplyChoros=function(){ try{
      const M={ pop:s=>s.density, hdi:s=>s.hdi, dem:s=>s.dem,
        milSpend:s=>s.milSpend, milSpendGDP:s=>(s.milSpend!=null&&s.gdp)?s.milSpend/s.gdp*100:null,
        gdppc:s=>(s.gdppc!=null?s.gdppc:null), tfr:s=>(s.tfr!=null?s.tfr:null) };
      Object.keys(M).forEach(id=>{ try{ if(map.getLayer(id+'-fill')&&map.getLayoutProperty(id+'-fill','visibility')==='visible') applyChoro(id,M[id]); }catch(_){} });
    }catch(_){} };
    /* NATO members fill (#R7): brighter blue so it's clearly visible on the dark basemap, with a crisp
       outline. Built from a DEDICATED geojson (not the shared country feature-state) so we can drop the
       two member territories that lie SOUTH of the Tropic of Cancer — French Guiana (France) and Hawaii
       (USA) — which fall outside NATO's Article-6 treaty area. The Tropic of Cancer (23.4366°N) is drawn
       as a labeled gold line so the exclusion is self-explanatory. */
    const TROPIC_CANCER=23.4366;
    /* (#R7) NATO Article 6 limits the treaty area to Europe/North America and North-Atlantic islands
       NORTH of the Tropic of Cancer. So we drop EVERY member sub-polygon whose centroid is south of that
       line — French Guiana, Guadeloupe, Martinique, Saint-Martin, Mayotte, Réunion, New Caledonia, French
       Polynesia, Hawaii, Puerto Rico, Guam, … — while keeping all mainlands and the Atlantic islands
       (Azores, Madeira, Canaries) that ARE covered. Mainland polygons aren't clipped (centroid is north),
       so e.g. southern Florida/Texas stay whole. */
    function _ringCentroidLat(ring){ if(!ring||!ring.length) return 0; let sy=0; for(const p of ring) sy+=p[1]; return sy/ring.length; }
    function _dropSouthOfTropic(geom){
      if(!geom) return null;
      const keep=pc=>_ringCentroidLat(pc[0])>=TROPIC_CANCER;
      if(geom.type==='Polygon') return keep(geom.coordinates)?geom:null;
      if(geom.type==='MultiPolygon'){ const polys=geom.coordinates.filter(keep); return polys.length?{type:'MultiPolygon',coordinates:polys}:null; }
      return geom;
    }
    function buildNatoFC(){
      const feats=[];
      if(HOST.countryGeo&&HOST.countryGeo.features){
        HOST.countryGeo.features.forEach(f=>{ const code=String(f.id); if(!NATO.has(code)) return;
          /* (#R25) Time-travel like Historical borders: only show members who had ALREADY joined by the
             selected year (based on each country's real accession year). */
          const jy=NATO_JOIN[code]; if(jy && _natoYear && jy>_natoYear) return;
          const g=_dropSouthOfTropic(f.geometry);
          if(g) feats.push({type:'Feature',id:code,properties:{__code:code},geometry:g});
        });
      }
      return {type:'FeatureCollection',features:feats};
    }
    function tropicFC(){ const c=[]; for(let lo=-180;lo<=180;lo+=5) c.push([lo,TROPIC_CANCER]); return {type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}}]}; }
    function addNato(){
      if(!map.getSource('src-nato')) map.addSource('src-nato',{type:'geojson',data:buildNatoFC(),promoteId:'__code'});
      if(!map.getLayer('nato-fill')) map.addLayer({id:'nato-fill',type:'fill',source:'src-nato',layout:{visibility:'none'},paint:{'fill-color':'#2f6bff','fill-opacity':opacities.nato}},beforeId);
      if(!map.getLayer('nato-line')) map.addLayer({id:'nato-line',type:'line',source:'src-nato',layout:{visibility:'none'},paint:{'line-color':'#7fb0ff','line-width':1.6}},beforeId);
      if(!map.getSource('src-tropic')) map.addSource('src-tropic',{type:'geojson',data:tropicFC()});
      if(!map.getLayer('nato-tropic-line')) map.addLayer({id:'nato-tropic-line',type:'line',source:'src-tropic',layout:{visibility:'none'},paint:{'line-color':'#f4b740','line-width':1.4,'line-dasharray':[3,3],'line-opacity':0.9}},beforeId);
      if(!map.getLayer('nato-tropic-label')) map.addLayer({id:'nato-tropic-label',type:'symbol',source:'src-tropic',layout:{visibility:'none','symbol-placement':'line','text-field':(HOST.lang==='jp'?'北回帰線 (北緯23.4°)':HOST.lang==='de'?'Wendekreis des Krebses (23,4°N)':HOST.lang==='ru'?'Северный тропик (23,4° с.ш.)':HOST.lang==='es'?'Trópico de Cáncer (23,4°N)':'Tropic of Cancer (23.4°N)'),'text-size':11,'text-font':['literal',['Noto Sans Regular']],'symbol-spacing':340,'text-letter-spacing':0.04},paint:{'text-color':'#f4b740','text-halo-color':'rgba(0,0,0,0.65)','text-halo-width':1.3}},beforeId);
    }
    function applyNato(){ const src=map.getSource('src-nato'); if(src){ try{ src.setData(buildNatoFC()); }catch(_){} } }
    function setNatoVis(on){ ['nato-fill','nato-line','nato-tropic-line','nato-tropic-label'].forEach(l=>setVis(l,on)); }
    /* NATO accession years (#14) — shown on hover alongside the member's defense spend as % of GDP. */
    const NATO_JOIN={USA:1949,CAN:1949,GBR:1949,FRA:1949,ITA:1949,NLD:1949,BEL:1949,LUX:1949,DNK:1949,NOR:1949,ISL:1949,PRT:1949,GRC:1952,TUR:1952,DEU:1955,ESP:1982,CZE:1999,HUN:1999,POL:1999,BGR:2004,EST:2004,LVA:2004,LTU:2004,ROU:2004,SVK:2004,SVN:2004,ALB:2009,HRV:2009,MNE:2017,MKD:2020,FIN:2023,SWE:2024};
    /* (#R25 / #24) NATO enlargement time-travel: a year control (like Historical borders) filters the
       members fill to those who had joined by the chosen year. NATO_YEARS = the distinct accession years. */
    const NATO_YEARS=[...new Set(Object.values(NATO_JOIN))].sort((a,b)=>a-b);
    let _natoYear=NATO_YEARS[NATO_YEARS.length-1];   /* default: latest = all current members */
    function natoMemberCount(){ try{ return Object.values(NATO_JOIN).filter(y=>y<=_natoYear).length; }catch(_){ return ''; } }
    function natoLegend(){
      try{
        const el=window._registerLayerOpacity&&window._registerLayerOpacity('nato',['NATO members','NATO加盟国'],['nato-fill','nato-line'],'dl-nato');
        if(!el || el.querySelector('.nato-year-row')) { const lbl=el&&el.querySelector('.nato-year-val'); if(lbl) lbl.textContent=_natoYear; return; }
        const jp=HOST.lang==='jp';
        const row=document.createElement('div'); row.className='nato-year-row'; row.style.cssText='font-size:11px;color:var(--text-muted);margin-top:7px;display:flex;align-items:center;gap:7px;';
        if(typeof isMobile==='function'&&isMobile()){
          row.innerHTML=(jp?'加盟年':'Year')+' <select class="nato-year-sel" style="flex:1;min-width:0;font-size:14px;padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);">'+
            NATO_YEARS.map(y=>'<option value="'+y+'"'+(y===_natoYear?' selected':'')+'>'+y+'</option>').join('')+'</select>';
          row.querySelector('.nato-year-sel').addEventListener('change',(e)=>{ _natoYear=+e.target.value||_natoYear; applyNato(); const v=el.querySelector('.nato-year-val'); if(v) v.textContent=_natoYear; });
        } else {
          /* (#R27) Only the START and END years are labeled (a flex space-between row), not every
             accession year — the dense per-year ticks collided (1999/2004/2009/2017/2020/2023/2024 all
             bunched at the right) which was the "範囲のテキストが重なるクソUI". The selected year shows in
             the <b> readout, so no information is lost. */
          row.innerHTML=(jp?'加盟年':'Year')+' <span style="flex:1;min-width:90px;display:flex;flex-direction:column;gap:1px;">'+
            '<input type="range" min="0" max="'+(NATO_YEARS.length-1)+'" step="1" value="'+NATO_YEARS.indexOf(_natoYear)+'" style="width:100%;display:block;margin:0;box-sizing:border-box;">'+
            '<span style="display:flex;justify-content:space-between;font-size:8px;line-height:1;color:var(--text-muted);"><span>'+NATO_YEARS[0]+'</span><span>'+NATO_YEARS[NATO_YEARS.length-1]+'</span></span>'+
            '</span> <b class="nato-year-val" style="color:var(--text-main);min-width:34px;text-align:right;">'+_natoYear+'</b>';
          row.querySelector('input').addEventListener('input',(e)=>{ _natoYear=NATO_YEARS[+e.target.value]||_natoYear; const v=el.querySelector('.nato-year-val'); if(v) v.textContent=_natoYear; clearTimeout(natoLegend._t); natoLegend._t=setTimeout(applyNato,120); });
        }
        el.appendChild(row);
      }catch(_){}
    }
    function defensePctGDP(s){ if(!s||s.milSpend==null||!s.gdp) return null; const p=(s.milSpend/s.gdp)*100; return isFinite(p)?p:null; }
    function wireNatoHover(){
      if(map.__natoHover) return; map.__natoHover=true;
      map.on('mousemove','nato-fill',e=>{ if(!e.features.length) return; const s=countryStats[e.features[0].id]; if(!s) return;
        const yr=NATO_JOIN[s.code], pct=defensePctGDP(s);
        const el=ensureMapTooltip(); el.style.display='block';
        el.innerHTML=`<div style="font-weight:600;font-size:14px;">${s.flag?s.flag+' ':''}${cName(s)}</div>`+
          `<div style="margin-top:5px;color:var(--text-muted);font-size:12px;">${HOST.lang==='jp'?'NATO加盟年':HOST.lang==='de'?'NATO-Beitritt':HOST.lang==='ru'?'Вступление в НАТО':HOST.lang==='es'?'Ingreso en la OTAN':'Joined NATO'}: <b style="color:var(--text-main);">${yr||'—'}</b></div>`+
          `<div style="color:var(--text-muted);font-size:12px;">${HOST.lang==='jp'?'国防費':HOST.lang==='de'?'Verteidigungsausgaben':HOST.lang==='ru'?'Расходы на оборону':HOST.lang==='es'?'Gasto en defensa':'Defense spending'}: <b style="color:var(--text-main);">${s.milSpend!=null?'$'+s.milSpend+'B (2023)':'—'}</b></div>`+
          `<div style="color:var(--text-muted);font-size:12px;">${HOST.lang==='jp'?'国防費 (対GDP)':HOST.lang==='de'?'Verteidigung (% BIP)':HOST.lang==='ru'?'Оборона (% ВВП)':HOST.lang==='es'?'Defensa (% PIB)':'Defense (% GDP)'}: <b style="color:var(--text-main);">${pct!=null?pct.toFixed(2)+'%':'—'}</b></div>`;
        positionTooltip(e.point);
      });
      map.on('mouseleave','nato-fill',()=>{ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
    }

    /* (#R26 / EU) European Union members fill + accession-year time-travel control (mirrors NATO). Real
       enlargement years; the UK is dropped from 2020 (Brexit). EU outermost regions are NOT clipped. */
    const EU=new Set(['BEL','FRA','DEU','ITA','LUX','NLD','DNK','IRL','GBR','GRC','ESP','PRT','AUT','FIN','SWE','CYP','CZE','EST','HUN','LVA','LTU','MLT','POL','SVK','SVN','BGR','ROU','HRV']);
    const EU_JOIN={BEL:1958,FRA:1958,DEU:1958,ITA:1958,LUX:1958,NLD:1958,DNK:1973,IRL:1973,GBR:1973,GRC:1981,ESP:1986,PRT:1986,AUT:1995,FIN:1995,SWE:1995,CYP:2004,CZE:2004,EST:2004,HUN:2004,LVA:2004,LTU:2004,MLT:2004,POL:2004,SVK:2004,SVN:2004,BGR:2007,ROU:2007,HRV:2013};
    const EU_LEFT={GBR:2020};
    const EU_YEARS=[1958,1973,1981,1986,1995,2004,2007,2013,2020,2024];
    let _euYear=EU_YEARS[EU_YEARS.length-1];
    function euMemberAt(code,y){ const j=EU_JOIN[code]; if(j==null||j>y) return false; const l=EU_LEFT[code]; if(l&&y>=l) return false; return true; }
    function buildEuFC(){ const feats=[]; if(HOST.countryGeo&&HOST.countryGeo.features){ HOST.countryGeo.features.forEach(f=>{ const code=String(f.id); if(!EU.has(code)) return; if(!euMemberAt(code,_euYear)) return; feats.push({type:'Feature',id:code,properties:{__code:code},geometry:f.geometry}); }); } return {type:'FeatureCollection',features:feats}; }
    function addEu(){
      if(!map.getSource('src-eu')) map.addSource('src-eu',{type:'geojson',data:buildEuFC(),promoteId:'__code'});
      if(!map.getLayer('eu-fill')) map.addLayer({id:'eu-fill',type:'fill',source:'src-eu',layout:{visibility:'none'},paint:{'fill-color':'#1c3faa','fill-opacity':opacities.eu!=null?opacities.eu:0.5}},beforeId);
      if(!map.getLayer('eu-line')) map.addLayer({id:'eu-line',type:'line',source:'src-eu',layout:{visibility:'none'},paint:{'line-color':'#ffd617','line-width':1.5}},beforeId);
    }
    function applyEu(){ const s=map.getSource('src-eu'); if(s){ try{ s.setData(buildEuFC()); }catch(_){} } }
    function setEuVis(on){ ['eu-fill','eu-line'].forEach(l=>setVis(l,on)); }
    function euLegend(){
      try{
        const el=window._registerLayerOpacity&&window._registerLayerOpacity('eu',['EU members','EU加盟国'],['eu-fill','eu-line'],'dl-eu');
        if(!el || el.querySelector('.eu-year-row')){ const lbl=el&&el.querySelector('.eu-year-val'); if(lbl) lbl.textContent=_euYear; return; }
        const jp=HOST.lang==='jp';
        const row=document.createElement('div'); row.className='eu-year-row'; row.style.cssText='font-size:11px;color:var(--text-muted);margin-top:7px;display:flex;align-items:center;gap:7px;';
        if(typeof isMobile==='function'&&isMobile()){
          row.innerHTML=(jp?'加盟年':'Year')+' <select class="eu-year-sel" style="flex:1;min-width:0;font-size:14px;padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);">'+
            EU_YEARS.map(y=>'<option value="'+y+'"'+(y===_euYear?' selected':'')+'>'+y+'</option>').join('')+'</select>';
          row.querySelector('.eu-year-sel').addEventListener('change',(e)=>{ _euYear=+e.target.value||_euYear; applyEu(); const v=el.querySelector('.eu-year-val'); if(v) v.textContent=_euYear; });
        } else {
          /* (#R27) Same fix as NATO: label only the first/last year (space-between), not every dense
             enlargement year, so the range text no longer overlaps. */
          row.innerHTML=(jp?'加盟年':'Year')+' <span style="flex:1;min-width:90px;display:flex;flex-direction:column;gap:1px;">'+
            '<input type="range" min="0" max="'+(EU_YEARS.length-1)+'" step="1" value="'+EU_YEARS.indexOf(_euYear)+'" style="width:100%;display:block;margin:0;box-sizing:border-box;">'+
            '<span style="display:flex;justify-content:space-between;font-size:8px;line-height:1;color:var(--text-muted);"><span>'+EU_YEARS[0]+'</span><span>'+EU_YEARS[EU_YEARS.length-1]+'</span></span>'+
            '</span> <b class="eu-year-val" style="color:var(--text-main);min-width:34px;text-align:right;">'+_euYear+'</b>';
          row.querySelector('input').addEventListener('input',(e)=>{ _euYear=EU_YEARS[+e.target.value]||_euYear; const v=el.querySelector('.eu-year-val'); if(v) v.textContent=_euYear; clearTimeout(euLegend._t); euLegend._t=setTimeout(applyEu,120); });
        }
        el.appendChild(row);
      }catch(_){}
    }
    function wireEuHover(){
      if(map.__euHover) return; map.__euHover=true;
      map.on('mousemove','eu-fill',e=>{ if(!e.features.length) return; const s=countryStats[e.features[0].id]; const code=e.features[0].id; if(!s) return;
        const el=ensureMapTooltip(); el.style.display='block';
        el.innerHTML=`<div style="font-weight:600;font-size:14px;">${s.flag?s.flag+' ':''}${cName(s)}</div>`+
          `<div style="margin-top:5px;color:var(--text-muted);font-size:12px;">${HOST.lang==='jp'?'EU加盟年':HOST.lang==='de'?'EU-Beitritt':HOST.lang==='ru'?'Вступление в ЕС':HOST.lang==='es'?'Ingreso en la UE':'Joined EU'}: <b style="color:var(--text-main);">${EU_JOIN[code]||'—'}${EU_LEFT[code]?(' → '+EU_LEFT[code]+(HOST.lang==='jp'?' 離脱':HOST.lang==='de'?' ausgetreten':HOST.lang==='ru'?' вышла':HOST.lang==='es'?' salió':' left')):''}</b></div>`;
        positionTooltip(e.point);
      });
      map.on('mouseleave','eu-fill',()=>{ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
    }

    /* (#R94) NATO & EU enlargement follow the master spacetime clock: travel to a year → only members that
       had already joined by then are shown; back to "Now" → every current member. The per-layer year sliders
       in the legend still work as instant overrides and are kept in step with the clock. */
    function _syncYearLegend(prefix,years,val){ try{
      const v=document.querySelector('.'+prefix+'-year-val'); if(v) v.textContent=val;
      const row=document.querySelector('.'+prefix+'-year-row'); if(!row) return;
      const rg=row.querySelector('input[type=range]'); if(rg){ let idx=0; for(let i=0;i<years.length;i++){ if(years[i]<=val) idx=i; } rg.value=idx; }
      const se=row.querySelector('select'); if(se){ let best=years[0]; years.forEach(y=>{ if(y<=val) best=y; }); se.value=best; }
    }catch(_){} }
    try{ if(window.IntMapTime) window.IntMapTime.on(e=>{
      const nt=e.isLive?NATO_YEARS[NATO_YEARS.length-1]:e.year;
      if(nt!==_natoYear){ _natoYear=nt;
        try{ if(map.getLayer('nato-fill')&&map.getLayoutProperty('nato-fill','visibility')==='visible') applyNato(); }catch(_){}
        _syncYearLegend('nato',NATO_YEARS,_natoYear); }
      const et=e.isLive?EU_YEARS[EU_YEARS.length-1]:e.year;
      if(et!==_euYear){ _euYear=et;
        try{ if(map.getLayer('eu-fill')&&map.getLayoutProperty('eu-fill','visibility')==='visible') applyEu(); }catch(_){}
        _syncYearLegend('eu',EU_YEARS,_euYear); }
    }); }catch(_){}

    /* Rimland (#15,#17) — Spykman's coastal crescent as a LAND-only country fill (no sea painted). */
    const RIMLAND=new Set("GBR IRL FRA ESP PRT ITA NLD BEL DEU DNK NOR HRV ALB MNE GRC TUR SYR LBN ISR JOR IRQ IRN SAU YEM OMN ARE QAT KWT BHR PAK IND BGD LKA MMR THA KHM VNM MYS SGP IDN PHL BRN CHN KOR PRK JPN TWN".split(' '));
    function addRimland(){
      if(!map.getLayer('rimland-fill')) map.addLayer({id:'rimland-fill',type:'fill',source:'countries',layout:{visibility:'none'},paint:{'fill-color':'#0a84ff','fill-opacity':['case',['boolean',['feature-state','rimland'],false],0.30,0]}},beforeId);
      if(!map.getLayer('rimland-line')) map.addLayer({id:'rimland-line',type:'line',source:'countries',layout:{visibility:'none'},paint:{'line-color':'#5ab0ff','line-width':['case',['boolean',['feature-state','rimland'],false],1.2,0]}},beforeId);
    }
    function applyRimland(){ if(!HOST.countryGeo) return; HOST.countryGeo.features.forEach(f=>{ if(f.id==null) return; const s=countryStats[String(f.id)]; map.setFeatureState({source:'countries',id:f.id},{rimland:!!(s&&RIMLAND.has(s.code))}); }); }
    window.imToggleRimland=function(on){ if(on){ withCountries(()=>{ try{ addRimland(); applyRimland(); setVis('rimland-fill',true); setVis('rimland-line',true); }catch(e){ console.warn('rimland fail',e); } }); } else { setVis('rimland-fill',false); setVis('rimland-line',false); } };

    /* Former Soviet Union (#15) — the 15 republics of the USSR as a RED land-only country fill (no sea
       painted; uses the country polygons directly). Matches on the feature's ISO3 id so every republic
       fills even if it has no economic stats. */
    const FSU=new Set("RUS UKR BLR MDA EST LVA LTU GEO ARM AZE KAZ UZB TKM KGZ TJK".split(' '));
    function addFSU(){
      if(!map.getLayer('fsu-fill')) map.addLayer({id:'fsu-fill',type:'fill',source:'countries',layout:{visibility:'none'},paint:{'fill-color':'#e0312e','fill-opacity':['case',['boolean',['feature-state','fsu'],false],0.42,0]}},beforeId);
      if(!map.getLayer('fsu-line')) map.addLayer({id:'fsu-line',type:'line',source:'countries',layout:{visibility:'none'},paint:{'line-color':'#ff6b6b','line-width':['case',['boolean',['feature-state','fsu'],false],1.2,0]}},beforeId);
    }
    function applyFSU(){ if(!HOST.countryGeo) return; HOST.countryGeo.features.forEach(f=>{ if(f.id==null) return; map.setFeatureState({source:'countries',id:f.id},{fsu:FSU.has(String(f.id))}); }); }
    window.imToggleFSU=function(on){ if(on){ withCountries(()=>{ try{ addFSU(); applyFSU(); setVis('fsu-fill',true); setVis('fsu-line',true); }catch(e){ console.warn('fsu fail',e); } }); } else { setVis('fsu-fill',false); setVis('fsu-line',false); } };

    /* Sea-level-rise simulator (#24): a color-relief layer over the DEM that floods everything at or
       below the chosen +rise (window._seaLevelM, meters) in blue, leaving higher land transparent so
       the basemap shows through. The slider rebuilds the ramp live via _refreshSeaLevel. */
    function seaLevelRamp(){
      const L=window._seaLevelM||0;
      /* (#R9) Works for ANY offset incl. NEGATIVE (sea-level fall, the slider's minus side): build the
         candidate depth→color stops, then keep only strictly-ASCENDING ones so MapLibre's interpolate
         never receives a non-monotonic input (which threw with the old fixed -50 stop at low L). */
      const cand=[[-11000,'rgba(5,40,90,0.92)'],[L-50,'rgba(25,95,175,0.82)'],[L-1.5,'rgba(45,125,205,0.72)'],[L,'rgba(120,180,235,0.60)'],[L+0.6,'rgba(0,0,0,0)'],[12000,'rgba(0,0,0,0)']];
      const out=[]; let last=-Infinity;
      for(const c of cand){ if(c[0]>last){ out.push(c[0],c[1]); last=c[0]; } }
      return ['interpolate',['linear'],['elevation'], ...out];
    }
    function addSeaLevel(){
      try{ ensureTerrainSource(); }catch(_){}
      if(!map.getLayer('lyr-sealevel')){
        map.addLayer({id:'lyr-sealevel',type:'color-relief',source:'terrain-dem',layout:{visibility:'none'},paint:{'color-relief-opacity':opacities.sealevel,'color-relief-color':seaLevelRamp()}},beforeId);
      }
    }
    window._refreshSeaLevel=function(){
      if(map.getLayer('lyr-sealevel')){ try{ map.setPaintProperty('lyr-sealevel','color-relief-color',seaLevelRamp()); }catch(_){} }
      const L=window._seaLevelM||0, clamp=Math.max(-150,Math.min(70,L));
      /* (#R13c) imperial → show the offset in feet (slider stays in meters internally) */
      const _um=(typeof HOST.unitMode!=='undefined')?HOST.unitMode:'both';
      const slDisp=(L>=0?'+':'')+(_um==='imperial'?(Math.round(L*3.28084)+' ft'):(L+' m'));
      const sgn=slDisp;
      try{ const s=lgdSeaLevel.querySelector('.sl-cur'); if(s) s.textContent=slDisp; }catch(_){}
      /* Keep the legend slider, the legend number box and the in-dropdown slider in lock-step (#11). */
      try{ const lr=lgdSeaLevel.querySelector('.sl-legend-range'); if(lr && +lr.value!==clamp) lr.value=clamp; }catch(_){}
      try{ const nb=lgdSeaLevel.querySelector('.sl-num'); if(nb && +nb.value!==L) nb.value=L; }catch(_){}
      try{ const dd=document.getElementById('sl-sealevel'); if(dd){ if(+dd.value!==clamp) dd.value=clamp; const lbl=document.getElementById('sllbl-sealevel'); if(lbl) lbl.textContent=sgn; } }catch(_){}
    };

    let nightTimer=null;
    function buildNight(){ if(typeof turf==='undefined')return; const now=new Date(); const N=Math.floor((now-Date.UTC(now.getUTCFullYear(),0,0))/864e5); const decl=-23.44*Math.cos((2*Math.PI/365)*(N+10)); const utc=now.getUTCHours()+now.getUTCMinutes()/60; const subLng=(12-utc)*15; const antiLng=((subLng+360)%360)-180; let poly; try{ poly=turf.circle([antiLng,-decl],10001,{steps:128,units:'kilometers'}); }catch(e){return;} const src=map.getSource('src-night'); if(src)src.setData(poly); else map.addLayer({id:'lyr-night',type:'fill',source:(map.addSource('src-night',{type:'geojson',data:poly}),'src-night'),layout:{visibility:'none'},paint:{'fill-color':'#00112a','fill-opacity':opacities.night}},beforeId); }

    /* Köppen-Geiger climate (#13): rendered locally from the native 1 km GeoTIFFs in
       "Köppen-Geiger climate classification data/<period>.tif" (Beck et al. 2018, 30 classes) and
       REPROJECTED to Web Mercator (EPSG:3857) at ±85.0511° → koppen_mercator_<period>.png, so the image
       source aligns pixel-exactly with the Mercator basemap (no latitude drift) and avoids the
       "y=Infinity" error. Transparent ocean. Falls back to the Wikipedia PNG if the local file isn't
       published. The palette below is byte-identical to the PNGs so cursor pixel-sampling
       (Mercator-inverse) round-trips perfectly. */
    /* (#R12/#R13c) Multi-period Köppen. Default stays present-day (1991-2020). All four eras are
       reprojected by _koppen_convert.py to Web Mercator at 8192² (nearest-neighbor, crisp class
       boundaries) and named koppen_mercator_<period>.png (the old koppen_mercator.png was retired);
       1931-1960 & 1961-1990 now use the user's updated, distinct source TIFFs. */
    /* (#R31) The Köppen layer already supports multiple 30-year periods (1901–2020) via the SAME mechanism
       & UI. To add the Beck et al. 2018 "1980–2016" period the user asked for, drop the reprojected assets
       data/koppen_mercator_1980-2016.png (+ _4k.png) — produced by the SAME pipeline (Web-Mercator ±85.0511°,
       same palette) as the existing ones — then add ['1980-2016','koppen_mercator_1980-2016.png'] to the
       front of this list. The asset can't be generated in-app (it needs the raw 1980–2016 raster + a
       reprojection), so it's wired for one-line activation rather than shipped broken. */
    window.KOPPEN_PERIODS=[['1991-2020','koppen_mercator_1991-2020.png'],['1961-1990','koppen_mercator_1961-1990.png'],['1931-1960','koppen_mercator_1931-1960.png'],['1901-1930','koppen_mercator_1901-1930.png']];
    /* To enable 1980–2016 once the asset exists: window.KOPPEN_PERIODS.unshift(['1980-2016','koppen_mercator_1980-2016.png']); */
    if(!window._koppenPeriod) window._koppenPeriod='1991-2020';
    /* (#R17) The DISPLAYED Köppen is ALWAYS the full 8192² PNG — on EVERY device, no silent downgrade
       (the user: "画質を勝手に下げるな…画質は保持しろ"). The mobile OOM that crashed the tab was driven by a
       SECOND full-res copy we kept ourselves (the ~268 MB cursor-sampling/highlight decode) on top of
       MapLibre's own texture. So the DISPLAY uses the full 8192² here, while the sampling/highlight work
       canvas is built from the bundled 4096² on phones (koppenWorkURL) — quality of what you SEE is
       untouched, but peak memory drops by ~270 MB so it no longer crashes. */
    function koppenURLFor(p){ const e=window.KOPPEN_PERIODS.find(x=>x[0]===p)||window.KOPPEN_PERIODS[0]; return e[1]; }
    /* (#R23) The DISPLAY texture is the lighter 4k PNG on phones — the full 8192² PNG is a ~268 MB GPU
       texture that crashes iPhone Safari ("重い動作でブラウザが落ちる"); desktops keep the full 8192². */
    function koppenDisplayURL(p){ let u=koppenURLFor(p||window._koppenPeriod); try{ if(typeof isMobile==='function'&&isMobile()) u=u.replace(/\.png$/,'_4k.png'); }catch(_){} return u; }
    /* The sampling/highlight WORK image is ALWAYS the 4k PNG (downscaled to ≤2048² for CPU pixel ops):
       decoding the 8192² just to read a 2048² work canvas wasted ~200 MB on desktop too. */
    function koppenWorkURL(p){ return koppenURLFor(p).replace(/\.png$/,'_4k.png'); }
    let KURL=koppenDisplayURL(window._koppenPeriod);
    const KURL_FALLBACK='https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Koppen-Geiger_Map_World_present.svg/1920px-Koppen-Geiger_Map_World_present.svg.png';
    const KOPPEN_LATMAX=85.0511287798066;
    window.KCOORDS=[[-180,KOPPEN_LATMAX],[180,KOPPEN_LATMAX],[180,-KOPPEN_LATMAX],[-180,-KOPPEN_LATMAX]];
    const KCOORDS=window.KCOORDS;
    window.KCOL=[['Af',[0,0,255]],['Am',[0,120,255]],['Aw',[70,170,250]],['BWh',[255,0,0]],['BWk',[255,150,150]],['BSh',[245,165,0]],['BSk',[255,220,100]],['Csa',[255,255,0]],['Csb',[200,200,0]],['Csc',[150,150,0]],['Cwa',[150,255,150]],['Cwb',[100,200,100]],['Cwc',[50,150,50]],['Cfa',[200,255,80]],['Cfb',[100,255,80]],['Cfc',[50,200,0]],['Dsa',[255,0,255]],['Dsb',[200,0,200]],['Dsc',[150,50,150]],['Dsd',[150,100,150]],['Dwa',[170,175,255]],['Dwb',[90,120,220]],['Dwc',[75,80,180]],['Dwd',[50,0,135]],['Dfa',[0,255,255]],['Dfb',[55,200,255]],['Dfc',[0,125,125]],['Dfd',[0,70,95]],['ET',[178,178,178]],['EF',[102,102,102]]];
    window.KNAME={Af:{en:'Tropical rainforest',jp:'熱帯雨林'},Am:{en:'Tropical monsoon',jp:'熱帯モンスーン'},Aw:{en:'Savanna',jp:'サバナ'},BWh:{en:'Hot desert',jp:'砂漠(高温)'},BWk:{en:'Cold desert',jp:'砂漠(寒冷)'},BSh:{en:'Hot steppe',jp:'ステップ(高温)'},BSk:{en:'Cold steppe',jp:'ステップ(寒冷)'},Csa:{en:'Mediterranean, hot summer',jp:'地中海性(高温夏)'},Csb:{en:'Mediterranean, warm summer',jp:'地中海性(温暖夏)'},Csc:{en:'Mediterranean, cold summer',jp:'地中海性(冷涼夏)'},Cwa:{en:'Humid subtropical, dry winter',jp:'温暖冬季少雨'},Cwb:{en:'Subtropical highland',jp:'温帯高地'},Cwc:{en:'Subtropical highland, dry winter',jp:'温帯高地(冬季少雨)'},Cfa:{en:'Humid subtropical',jp:'温暖湿潤'},Cfb:{en:'Oceanic',jp:'西岸海洋性'},Cfc:{en:'Subpolar oceanic',jp:'亜寒帯海洋性'},Dsa:{en:'Continental, dry-hot summer',jp:'大陸性夏季少雨(高温)'},Dsb:{en:'Continental, dry-warm summer',jp:'大陸性夏季少雨(温暖)'},Dsc:{en:'Continental, dry summer (cold)',jp:'大陸性夏季少雨(冷涼)'},Dsd:{en:'Continental, dry summer (severe)',jp:'大陸性夏季少雨(厳寒)'},Dwa:{en:'Continental, dry winter (hot summer)',jp:'大陸性冬季少雨(高温夏)'},Dwb:{en:'Continental, dry winter (warm summer)',jp:'大陸性冬季少雨(温暖夏)'},Dwc:{en:'Subarctic, dry winter',jp:'亜寒帯冬季少雨'},Dwd:{en:'Subarctic, dry winter (severe)',jp:'亜寒帯冬季少雨(厳寒)'},Dfa:{en:'Humid continental, hot summer',jp:'亜寒帯湿潤(高温夏)'},Dfb:{en:'Humid continental, warm summer',jp:'亜寒帯湿潤(温暖夏)'},Dfc:{en:'Subarctic',jp:'亜寒帯'},Dfd:{en:'Subarctic, severe winter',jp:'亜寒帯(厳寒)'},ET:{en:'Tundra',jp:'ツンドラ'},EF:{en:'Ice cap',jp:'氷雪'}};
    /* (#R32b) German Köppen climate names ("ケッペンでは気候名が書かれていない" — DE showed undefined). */
    try{ const _kde={Af:'Tropischer Regenwald',Am:'Tropisches Monsunklima',Aw:'Savanne',BWh:'Heißwüste',BWk:'Kaltwüste',BSh:'Heiße Steppe',BSk:'Kalte Steppe',Csa:'Mediterran, heißer Sommer',Csb:'Mediterran, warmer Sommer',Csc:'Mediterran, kühler Sommer',Cwa:'Feuchtsubtropisch, trockener Winter',Cwb:'Subtropisches Hochland',Cwc:'Subtropisches Hochland, trockener Winter',Cfa:'Feuchtsubtropisch',Cfb:'Ozeanisch',Cfc:'Subpolar-ozeanisch',Dsa:'Kontinental, trocken-heißer Sommer',Dsb:'Kontinental, trocken-warmer Sommer',Dsc:'Kontinental, trockener Sommer (kühl)',Dsd:'Kontinental, trockener Sommer (streng)',Dwa:'Kontinental, trockener Winter (heißer Sommer)',Dwb:'Kontinental, trockener Winter (warmer Sommer)',Dwc:'Subarktisch, trockener Winter',Dwd:'Subarktisch, trockener Winter (streng)',Dfa:'Feuchtkontinental, heißer Sommer',Dfb:'Feuchtkontinental, warmer Sommer',Dfc:'Subarktisch',Dfd:'Subarktisch, strenger Winter',ET:'Tundra',EF:'Eiskappe'}; for(const k in _kde){ if(window.KNAME[k]) window.KNAME[k].de=_kde[k]; } }catch(_){}
    /* (#R153) Russian + Spanish Köppen climate names — previously absent from KNAME, so RU/ES users saw the ENGLISH fallback (violates the 5-language rule). Standard Köppen–Geiger terminology in each language. */
    try{ const _kru={Af:'Влажный тропический лес',Am:'Тропический муссонный',Aw:'Саванна',BWh:'Жаркая пустыня',BWk:'Холодная пустыня',BSh:'Жаркая степь',BSk:'Холодная степь',Csa:'Средиземноморский, жаркое лето',Csb:'Средиземноморский, тёплое лето',Csc:'Средиземноморский, прохладное лето',Cwa:'Влажный субтропический, сухая зима',Cwb:'Субтропическое нагорье',Cwc:'Субтропическое нагорье, сухая зима',Cfa:'Влажный субтропический',Cfb:'Океанический',Cfc:'Субполярный океанический',Dsa:'Континентальный, сухое жаркое лето',Dsb:'Континентальный, сухое тёплое лето',Dsc:'Континентальный, сухое лето (холодный)',Dsd:'Континентальный, сухое лето (суровый)',Dwa:'Континентальный, сухая зима (жаркое лето)',Dwb:'Континентальный, сухая зима (тёплое лето)',Dwc:'Субарктический, сухая зима',Dwd:'Субарктический, сухая зима (суровый)',Dfa:'Влажный континентальный, жаркое лето',Dfb:'Влажный континентальный, тёплое лето',Dfc:'Субарктический',Dfd:'Субарктический, суровая зима',ET:'Тундра',EF:'Ледниковый'}; for(const k in _kru){ if(window.KNAME[k]) window.KNAME[k].ru=_kru[k]; } }catch(_){}
    try{ const _kes={Af:'Selva tropical',Am:'Monzónico tropical',Aw:'Sabana',BWh:'Desierto cálido',BWk:'Desierto frío',BSh:'Estepa cálida',BSk:'Estepa fría',Csa:'Mediterráneo, verano caluroso',Csb:'Mediterráneo, verano templado',Csc:'Mediterráneo, verano fresco',Cwa:'Subtropical húmedo, invierno seco',Cwb:'Tierras altas subtropicales',Cwc:'Tierras altas subtropicales, invierno seco',Cfa:'Subtropical húmedo',Cfb:'Oceánico',Cfc:'Oceánico subpolar',Dsa:'Continental, verano seco y caluroso',Dsb:'Continental, verano seco y templado',Dsc:'Continental, verano seco (frío)',Dsd:'Continental, verano seco (severo)',Dwa:'Continental, invierno seco (verano caluroso)',Dwb:'Continental, invierno seco (verano templado)',Dwc:'Subártico, invierno seco',Dwd:'Subártico, invierno seco (severo)',Dfa:'Continental húmedo, verano caluroso',Dfb:'Continental húmedo, verano templado',Dfc:'Subártico',Dfd:'Subártico, invierno severo',ET:'Tundra',EF:'Casquete glaciar'}; for(const k in _kes){ if(window.KNAME[k]) window.KNAME[k].es=_kes[k]; } }catch(_){}
    const KCOL=window.KCOL, KNAME=window.KNAME;
    /* safe name lookup: current language → English fallback (never "undefined") */
    window.kName=function(code){ const e=window.KNAME&&window.KNAME[code]; return e?(e[HOST.lang]||e.en||code):code; };
    const kSelected=window.kSelected||(window.kSelected=new Set());
    window.kSelected=kSelected;
    /* === Köppen image → hidden canvas
       Lets us (a) sample climate at a lng/lat in O(1) by reading pixels,
       (b) build a "highlight only selected" canvas image and feed it back
           into the same source for in-place filtering. */
    window._koppenCanvas=null; window._koppenImg=null; window._koppenReady=false;
    /* PERF (#R13): the DISPLAYED Köppen raster is the full-res 8192² PNG (composited on the GPU). But
       cursor-sampling and class highlighting are CPU pixel ops, so they run on a small capped
       work-canvas (≤2048, nearest-neighbor so the exact KCOL palette is preserved). ~19 km/px is
       plenty to classify a point, and it makes the per-pixel index + highlight ~16× cheaper → the
       laggy period-switch / class-select the user reported is gone. */
    const KWORK_CAP=2048;
    function _mkKoppenWork(im){
      const nw=im.naturalWidth||im.width, nh=im.naturalHeight||im.height;
      const sc=Math.min(1, KWORK_CAP/Math.max(nw,nh,1));
      const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(nw*sc)); c.height=Math.max(1,Math.round(nh*sc));
      const cx=c.getContext('2d',{willReadFrequently:true}); cx.imageSmoothingEnabled=false; cx.drawImage(im,0,0,c.width,c.height);
      window._koppenImg=im; window._koppenCanvas=c; window._koppenReady=true;
    }
    function loadKoppenCanvas(){
      if(window._koppenImg) return Promise.resolve();
      return new Promise(resolve=>{
        /* (#R13b) NO crossOrigin on the LOCAL PNG: under file:// an `anonymous` request to a same-folder
           file can fail (no CORS headers on file://), which used to drop us to the wrong remote Wikipedia
           fallback → garbled highlight. Loading it plainly always gets the real image; getImageData may
           still throw on a tainted file:// canvas, but that's caught and only disables highlighting, never
           the base map. The remote fallback keeps crossOrigin (Wikimedia sends CORS). */
        const im=new Image();
        im.onload=()=>{ _mkKoppenWork(im); resolve(); };
        im.onerror=()=>{
          const im2=new Image(); im2.crossOrigin='anonymous';
          im2.onload=()=>{ _mkKoppenWork(im2); resolve(); };
          im2.onerror=()=>resolve(); im2.src=KURL_FALLBACK;
        };
        /* (#R17) sample/highlight from the lighter work image (4k on mobile); the DISPLAY source still uses
           the full 8192² KURL, so on-screen quality is unchanged while we avoid a 2nd 268 MB decode. */
        im.src=koppenWorkURL(window._koppenPeriod);
      });
    }
    function nearestKoppenCode(r,g,b,a){
      if(a<32) return null;
      let best=null,bestD=Infinity;
      for(const [code,c] of KCOL){
        const dr=r-c[0], dg=g-c[1], db=b-c[2]; const d=dr*dr+dg*dg+db*db;
        if(d<bestD){ bestD=d; best=code; }
      }
      return bestD<6000?best:null;
    }
    /* Sample Köppen code at lng/lat (image is equirectangular over lat [+90,-90], lng [-180,180]).
       Lazily loads the canvas on first call so the cursor-readout shows climate even
       when the Köppen overlay isn't enabled. */
    window._koppenLoadStarted=false;
    /* (#R23) Cursor/click climate sampling RESTORED — memory-safe: it reads the ≤2048² work canvas
       (~16 MB), never the full 8192² image (the 268 MB decode that caused the OOM). The big full-res
       highlight path (_koppenFull) stays disabled; only this cheap sampling + the small-canvas highlight
       come back, which is what the user asked to restore ("以前まであった…復活させて"). */
    window.sampleKoppenAt=function(lng,lat){ try{ return window.sampleKoppenAt_LEGACY(lng,lat); }catch(_){ return null; } };
    window.sampleKoppenAt_LEGACY=function(lng,lat){
      if(!window._koppenReady){
        if(!window._koppenLoadStarted){ window._koppenLoadStarted=true; loadKoppenCanvas(); }
        return null;
      }
      if(!window._koppenCanvas) return null;
      if(lat>85.0511||lat<-85.0511) return null;
      const W=window._koppenCanvas.width, H=window._koppenCanvas.height;
      const x=Math.max(0,Math.min(W-1,Math.round((lng+180)/360*W)));
      /* canvas is Web-Mercator → invert the Mercator Y to find the pixel row */
      const mercY=Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
      const y=Math.max(0,Math.min(H-1,Math.round((Math.PI-mercY)/(2*Math.PI)*H)));
      try{ const p=window._koppenCanvas.getContext('2d').getImageData(x,y,1,1).data; return nearestKoppenCode(p[0],p[1],p[2],p[3]); }
      catch(e){ return null; }
    };
    /* PERF (#12): classify every pixel into a Köppen-code index ONCE. The previous code ran a
       30-color nearest-match for every pixel on every highlight rebuild (W·H·30 ops per click,
       tens of millions), which is why per-climate highlighting felt heavy. With the index cached,
       each rebuild is a single cheap pass (no nearest-color search), ~30× faster. */
    window._koppenCodeIdx=null; window._koppenSrcData=null;
    function ensureKoppenCodeIndex(){
      if(window._koppenCodeIdx || !window._koppenCanvas) return;
      const c=window._koppenCanvas, W=c.width, H=c.height;
      let d; try{ d=c.getContext('2d').getImageData(0,0,W,H).data; }catch(e){ return; }
      const idx=new Uint8Array(W*H), cache=new Map();      /* RGB→code-index cache (only ~30 colors) */
      for(let p=0,i=0;p<idx.length;p++,i+=4){
        if(d[i+3]<32){ idx[p]=255; continue; }
        const key=(d[i]<<16)|(d[i+1]<<8)|d[i+2];
        let ci=cache.get(key);
        if(ci===undefined){
          let best=255,bestD=Infinity;
          for(let k=0;k<KCOL.length;k++){ const cc=KCOL[k][1],dr=d[i]-cc[0],dg=d[i+1]-cc[1],db=d[i+2]-cc[2],dd2=dr*dr+dg*dg+db*db; if(dd2<bestD){bestD=dd2;best=k;} }
          ci=(bestD<6000)?best:255; cache.set(key,ci);
        }
        idx[p]=ci;
      }
      window._koppenCodeIdx=idx; window._koppenSrcData=d;   /* keep the original pixels for fast recolor */
    }
    /* Highlight = recolor the climate image so SELECTED classes stay vivid and the rest is grayed +
       faded, then feed it back into the SAME image source (the proven R12 approach the user was happy
       with — no separate overlay layer). It's computed on the small work-canvas, so the per-pixel pass
       and the toDataURL are ~16× cheaper than on the full 8192² image → the class-select lag is gone but
       the behavior/appearance matches the version that worked. When nothing is selected we restore the
       full-res KURL. */
    function buildKoppenHighlightURL(selectedSet){
      if(!window._koppenReady||!window._koppenCanvas) return null;
      if(!selectedSet||selectedSet.size===0) return null;
      ensureKoppenCodeIndex();
      const idx=window._koppenCodeIdx, src=window._koppenSrcData; if(!idx||!src) return null;
      const W=window._koppenCanvas.width, H=window._koppenCanvas.height;
      const selIdx=new Uint8Array(KCOL.length);
      for(let k=0;k<KCOL.length;k++) if(selectedSet.has(KCOL[k][0])) selIdx[k]=1;
      const out=document.createElement('canvas'); out.width=W; out.height=H;
      const octx=out.getContext('2d'), img=octx.createImageData(W,H), o=img.data;
      for(let p=0,i=0;p<idx.length;p++,i+=4){
        const ci=idx[p];
        if(ci!==255 && selIdx[ci]){ o[i]=src[i]; o[i+1]=src[i+1]; o[i+2]=src[i+2]; o[i+3]=src[i+3]; }   /* selected: keep */
        else { const g=(src[i]+src[i+1]+src[i+2])/3; o[i]=g*0.6; o[i+1]=g*0.6; o[i+2]=g*0.6; o[i+3]=Math.floor(src[i+3]*0.28); }   /* rest: gray + faded */
      }
      octx.putImageData(img,0,0);
      try{ return out.toDataURL('image/png'); }catch(e){ return null; }
    }
    /* (#R13c) FULL-RES highlight. The user asked us to STOP dropping resolution when a class is
       highlighted: the small 2048² work-canvas is kept ONLY for fast cursor sampling, while the
       DISPLAYED highlight is now recolored at the source image's native resolution (8192² desktop /
       4096² mobile cap) and encoded ASYNCHRONOUSLY (toBlob → objectURL) so the map never blurs and the
       UI never freezes. Built lazily on first highlight, freed when the selection clears / era changes.
       Graceful fallback to the small-canvas highlight if the full path can't run (file:// taint / OOM). */
    window._koppenFull=null;
    /* (#R15) MEMORY-BUDGET-AWARE cap. The re-reported crash ("特定の気候を選ぶと落ちて先祖返り") is the tab
       being OOM-killed during the full-res highlight; the reloaded tab then serves a STALE file:// disk
       cache (the "old version revives" symptom). The output canvas alone is 4·W·H bytes (268 MB at 8192²),
       so on low-RAM machines we cap lower — keeping the highlight crisp but never crashing. 8 GB+ desktops
       keep full 8192² (no quality loss where it's safe). navigator.deviceMemory is coarse GB (or undefined). */
    /* (#R15c) The OOM kills the tab BEFORE any try/catch can fire (Chrome's OOM killer), so the only
       reliable fix is to never allocate the ~268 MB (8192²) output canvas + PNG buffer for the HIGHLIGHT.
       Cap the highlight at 4096² desktop / 2048² mobile (out-canvas ≤67 MB / ≤16 MB). The BASE Köppen
       image stays full 8192² (unhighlighted view = no quality loss); the grayed highlight at 4096² is
       still crisp at any normal zoom. This is what finally stops the "選ぶと落ちて先祖返り" crash. */
    function _koppenFullCap(){ try{
      if(typeof isMobile==='function'&&isMobile()) return 2048;
      const dm=(typeof navigator!=='undefined'&&navigator.deviceMemory)||0;
      if(dm && dm<=4) return 3072;        /* ≤4 GB → 3072² */
      return 4096;                        /* desktop → 4096² (≈67 MB out canvas — safe on any machine) */
    }catch(_){ return 3072; } }
    /* (#R14) MEMORY-SAFE full-res highlight — the previous version OOM-crashed the tab (and the page
       reloaded → "先祖返り"): at 8192² it held the 268 MB source pixel array + a 268 MB output ImageData
       + a 268 MB output canvas + the PNG-encode buffer ALL AT ONCE (>1 GB peak). Two changes roughly
       HALVE the peak so it no longer crashes, while keeping the SAME 8192²/4096² resolution (画質維持):
       (1) The Köppen image is a CATEGORICAL palette, so we never keep the raw RGBA — we keep only a
           1-byte-per-pixel class index (`idx`), built in horizontal STRIPS (peak ≈ one strip, not the
           whole image), and reconstruct every color from KCOL.
       (2) The output is written in STRIPS too (one small ImageData per strip, blitted onto the canvas),
           so we never allocate a second full-frame ImageData.
       Any allocation/taint failure is caught → the caller falls back to the small-canvas highlight. */
    function ensureKoppenFull(){
      if(window._koppenFull) return window._koppenFull;
      const im=window._koppenImg; if(!im) return null;
      const nw=im.naturalWidth||im.width, nh=im.naturalHeight||im.height;
      const cap=_koppenFullCap(), sc=Math.min(1, cap/Math.max(nw,nh,1));
      const W=Math.max(1,Math.round(nw*sc)), H=Math.max(1,Math.round(nh*sc));
      try{
        const idx=new Uint8Array(W*H), cache=new Map();
        const STRIP=Math.max(1,Math.min(H,Math.floor((1<<21)/Math.max(1,W))));   /* ≈2 M px / strip */
        const c=document.createElement('canvas'); c.width=W; c.height=STRIP;
        const cx=c.getContext('2d',{willReadFrequently:true}); cx.imageSmoothingEnabled=false;
        const srcScaleY=nh/H, srcScaleX=nw/W;
        for(let y0=0;y0<H;y0+=STRIP){
          const rows=Math.min(STRIP,H-y0);
          cx.clearRect(0,0,W,rows);
          /* draw the matching source-image band (handles cap down-scale via the source rect) */
          cx.drawImage(im, 0, Math.round(y0*srcScaleY), nw, Math.round(rows*srcScaleY), 0, 0, W, rows);
          const d=cx.getImageData(0,0,W,rows).data;   /* may throw on tainted file:// canvas → caught */
          for(let p=y0*W, i=0; i<d.length; p++, i+=4){
            if(d[i+3]<32){ idx[p]=255; continue; }
            const key=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; let ci=cache.get(key);
            if(ci===undefined){ let best=255,bestD=Infinity; for(let k=0;k<KCOL.length;k++){ const cc=KCOL[k][1],dr=d[i]-cc[0],dg=d[i+1]-cc[1],db=d[i+2]-cc[2],dd2=dr*dr+dg*dg+db*db; if(dd2<bestD){bestD=dd2;best=k;} } ci=(bestD<6000)?best:255; cache.set(key,ci); }
            idx[p]=ci;
          }
        }
        c.width=c.height=0;                            /* free the strip canvas backing */
        window._koppenFull={idx, W, H};                /* NO 268 MB src array kept — palette reconstructs it */
        return window._koppenFull;
      }catch(e){ return null; }
    }
    function freeKoppenFull(){ window._koppenFull=null; }   /* drop ~refs; GC reclaims the big typed arrays */
    function buildKoppenHighlightFull(selectedSet, cb){
      const f=ensureKoppenFull(); if(!f){ cb(null); return; }
      try{
        const idx=f.idx, W=f.W, H=f.H, N=KCOL.length;
        /* per-class color LUT (selected→vivid KCOL, else gray+faded); index 255 → transparent */
        const LR=new Uint8Array(256),LG=new Uint8Array(256),LB=new Uint8Array(256),LA=new Uint8Array(256);
        for(let k=0;k<N;k++){ const c=KCOL[k][1];
          if(selectedSet.has(KCOL[k][0])){ LR[k]=c[0];LG[k]=c[1];LB[k]=c[2];LA[k]=255; }
          else { const g=Math.round((c[0]+c[1]+c[2])/3*0.6); LR[k]=g;LG[k]=g;LB[k]=g;LA[k]=71; } }
        const out=document.createElement('canvas'); out.width=W; out.height=H;
        const octx=out.getContext('2d');
        if(!octx){ try{ out.width=out.height=0; }catch(_){} cb(null); return; }   /* alloc failed → small-canvas fallback, no crash */
        const STRIP=Math.max(1,Math.min(H,Math.floor((1<<21)/Math.max(1,W))));   /* one small ImageData / strip */
        for(let y0=0;y0<H;y0+=STRIP){
          const rows=Math.min(STRIP,H-y0);
          const img=octx.createImageData(W,rows), o=img.data;
          for(let p=y0*W, j=0; j<o.length; p++, j+=4){ const ci=idx[p]; o[j]=LR[ci]; o[j+1]=LG[ci]; o[j+2]=LB[ci]; o[j+3]=LA[ci]; }
          octx.putImageData(img,0,y0);
        }
        if(out.toBlob){ out.toBlob(b=>{ try{ out.width=out.height=0; }catch(_){} cb(b?URL.createObjectURL(b):null); }, 'image/png'); }
        else { let u=null; try{ u=out.toDataURL('image/png'); }catch(_){} try{ out.width=out.height=0; }catch(_){} cb(u); }
      }catch(e){ cb(null); }
    }
    /* ===== (#R18) GPU highlight — FULL native resolution on EVERY device, ZERO allocation. =====
       The canvas pipeline above re-encodes the whole image to highlight a class, which forced a
       resolution cap (the 8192² output canvas alone is ~268 MB → mobile OOM). Instead: the Köppen
       palette is CATEGORICAL, so `raster-color` (MapLibre ≥4.6 — we ship v5) can re-color each class
       IN THE SHADER on the original full-res texture: selected classes keep their vivid palette color,
       the rest collapse to faded gray. raster-color-mix maps each palette RGB to a unique scalar
       (weights [2.7,0.6,0.1] separate all 30 classes by ≥1.1% of the 0–3.3 range — safe even in fp16),
       and a `step` ramp assigns the output color per class. No second decode, no canvas, no PNG encode →
       the displayed quality is the full 8192² everywhere AND the crash vector is gone ("画質は保持しろ、
       ただしモバイルでも落とすな" — both at once). raster-resampling:nearest while highlighted keeps
       texels exact (no blended colors falling into the wrong bin); restored to linear when cleared.
       Runtime feature-detect (window._koppenGPUOK) falls back to the proven canvas path on old engines. */
    const KOPPEN_MIX=[2.7,0.6,0.1,0], KOPPEN_RANGE=[0,3.3];
    function _kScalar(c){ return 2.7*c[0]/255+0.6*c[1]/255+0.1*c[2]/255; }
    function koppenColorRamp(selectedSet){
      /* a `step` over the normalised raster-value: ocean/transparent (value≈0) → fully transparent;
         each class band → its color (selected = vivid, else faded gray). Stops are the midpoints
         between adjacent class scalars so every texel lands squarely in its own band. */
      const entries=KCOL.map(([code,c])=>({code,c,v:_kScalar(c)/KOPPEN_RANGE[1]})).sort((a,b)=>a.v-b.v);
      const colFor=(e)=>{ if(selectedSet.has(e.code)) return 'rgba('+e.c[0]+','+e.c[1]+','+e.c[2]+',1)';
        const g=Math.round((e.c[0]+e.c[1]+e.c[2])/3*0.6); return 'rgba('+g+','+g+','+g+',0.28)'; };
      const expr=['step',['raster-value'],'rgba(0,0,0,0)'];   /* below the first stop → transparent (ocean) */
      for(let i=0;i<entries.length;i++){ const lo=(i===0)?entries[0].v/2:(entries[i-1].v+entries[i].v)/2; expr.push(lo, colFor(entries[i])); }
      return expr;
    }
    /* Apply (or clear) the GPU recolor. Returns null if the layer isn't added yet (retry later, do NOT
       disable GPU), true on success, false only if the engine actually rejects raster-color → canvas fallback. */
    function applyKoppenGPUHighlight(){
      if(!map.getLayer('lyr-climate')) return null;
      try{
        if(kSelected.size===0){
          map.setPaintProperty('lyr-climate','raster-color', null);
          map.setPaintProperty('lyr-climate','raster-color-mix', null);
          map.setPaintProperty('lyr-climate','raster-color-range', null);
          try{ map.setPaintProperty('lyr-climate','raster-resampling','linear'); }catch(_){}
        } else {
          map.setPaintProperty('lyr-climate','raster-color-mix', KOPPEN_MIX);
          map.setPaintProperty('lyr-climate','raster-color-range', KOPPEN_RANGE);
          map.setPaintProperty('lyr-climate','raster-color', koppenColorRamp(kSelected));
          try{ map.setPaintProperty('lyr-climate','raster-resampling','nearest'); }catch(_){}
        }
        return true;
      }catch(e){ return false; }
    }
    window._koppenHLUrl=null; window._koppenHLSeq=0; window._koppenGPUOK=undefined;
    /* (#R22) Highlight recolor retired (backend raster only) — keep the function as a safe no-op so the
       many existing callers don't need touching; it just guarantees the plain era PNG is shown. */
    /* (#R23) Class highlight RESTORED — memory-safe small-canvas recolor only (≤2048² → ≤16 MB out).
       The big full-res highlight (_koppenFull / GPU path, 67-268 MB) stays OFF: that was the OOM source,
       not this cheap work-canvas. No selection → restore the plain display PNG. */
    window._refreshKoppenImage=function(){
      if(!map.getSource('src-climate')) return;
      clearTimeout(window._koppenRefreshT);
      window._koppenRefreshT=setTimeout(()=>{
        const setImg=(url)=>{ try{ if(map.getSource('src-climate')) map.getSource('src-climate').updateImage({url:url,coordinates:KCOORDS}); }catch(e){} };
        if(!window.kSelected || window.kSelected.size===0){ setImg(KURL); return; }
        if(!window._koppenReady){ if(!window._koppenLoadStarted){ window._koppenLoadStarted=true; loadKoppenCanvas().then(()=>{ try{ window._refreshKoppenImage(); }catch(_){} }); } return; }
        let u=null; try{ u=buildKoppenHighlightURL(window.kSelected); }catch(_){}
        setImg(u||KURL);
      },45);
    };
    window._refreshKoppenImage_LEGACY=function(){
      if(!map.getSource('src-climate')) return;
      /* Debounce so rapid multi-class selection coalesces into one rebuild (#12). */
      clearTimeout(window._koppenRefreshT);
      window._koppenRefreshT=setTimeout(()=>{
        /* (#R18) GPU path first — full-res, instant, no allocation. */
        if(window._koppenGPUOK!==false){
          const ok=applyKoppenGPUHighlight();
          if(ok===true){ window._koppenGPUOK=true;
            /* the GPU recolors the live full-res texture, so the source image stays the plain era PNG */
            if(window._koppenHLUrl){ try{ URL.revokeObjectURL(window._koppenHLUrl); }catch(_){} window._koppenHLUrl=null; }
            try{ if(map.getSource('src-climate')) map.getSource('src-climate').updateImage({url:KURL,coordinates:KCOORDS}); }catch(_){}
            freeKoppenFull();
            /* (#R19) The shader path never touches the per-pixel code index / source-copy buffers —
               drop them (up to ~270 MB desktop / ~80 MB mobile). The canvas fallback rebuilds them
               on demand, and cursor sampling reads the (kept) work canvas directly. */
            window._koppenCodeIdx=null; window._koppenSrcData=null;
            return;
          }
          if(ok===false){ window._koppenGPUOK=false; }   /* engine REJECTED raster-color → canvas pipeline below */
          else { return; }   /* ok===null: layer not added yet — addKoppen re-calls us once it is */
        }
        const seq=++window._koppenHLSeq;
        const setImg=(url)=>{ try{ map.getSource('src-climate').updateImage({url:url,coordinates:KCOORDS}); }catch(e){} };
        if(kSelected.size===0){
          setImg(KURL);
          if(window._koppenHLUrl){ try{ URL.revokeObjectURL(window._koppenHLUrl); }catch(_){} window._koppenHLUrl=null; }
          freeKoppenFull();
          return;
        }
        buildKoppenHighlightFull(kSelected,(url)=>{
          if(seq!==window._koppenHLSeq){ if(url){ try{ URL.revokeObjectURL(url); }catch(_){} } return; }   /* superseded by a newer selection */
          if(!url){ /* full-res path unavailable → low-res fallback so highlight still works */
            const u2=buildKoppenHighlightURL(kSelected); setImg(u2||KURL); return;
          }
          const prev=window._koppenHLUrl; setImg(url); window._koppenHLUrl=url;
          if(prev){ try{ URL.revokeObjectURL(prev); }catch(_){} }
        });
      },45);
    };
    /* Switch the active Köppen era (#R12). Resets the cached sampling canvas + per-pixel code index so
       cursor sampling and class-highlighting reflect the chosen period, then swaps the map image. */
    window.setKoppenPeriod=function(period){
      if(!window.KOPPEN_PERIODS.some(x=>x[0]===period)) return;
      window._koppenPeriod=period; KURL=koppenDisplayURL(period);
      /* (#R23) era changed → invalidate the cached sampling canvas + per-pixel code index so cursor
         sampling and the class highlight reflect the chosen period (they lazily reload the new era). */
      window._koppenImg=null; window._koppenCanvas=null; window._koppenReady=false; window._koppenLoadStarted=false;
      window._koppenCodeIdx=null; window._koppenSrcData=null;
      try{ if(map.getSource('src-climate')) map.getSource('src-climate').updateImage({url:KURL,coordinates:KCOORDS}); }catch(e){}
      try{ buildLegend(); }catch(_){}
      if(window.kSelected && window.kSelected.size>0 && window._refreshKoppenImage) window._refreshKoppenImage();
    };

    function addKoppen(){
      /* (#R22) Köppen is now a PURE BACKEND-RENDERED raster ("フロントエンドではなくバックエンドに戻して").
         We add the pre-rendered era PNG straight to the map — NO in-browser canvas decode, pixel
         sampling, or client-side highlight recolor (that whole pipeline was the recurring OOM / iPhone
         crash source). The legend stays as a color key (+ era switch + right-click criteria). */
      KURL=koppenDisplayURL(window._koppenPeriod);   /* (#R23) recompute now that isMobile() is reliable → phones get the 4k texture */
      if(!map.getSource('src-climate')){
        map.addSource('src-climate',{type:'image',url:KURL,coordinates:KCOORDS});
        /* (#R24) insert the raster BELOW the place-name / border label stack so Köppen never hides the
           country labels ("ケッペンを重ねると国名ラベルが後ろに隠れる"); raise() still self-heals as a backstop. */
        const _lblAnchor=['layer-sat-labels','borders-only-line','ofm-country','ofm-city','ofm-other'].find(id=>map.getLayer(id))||beforeId;
        map.addLayer({id:'lyr-climate',type:'raster',source:'src-climate',layout:{visibility:'visible'},paint:{'raster-opacity':opacities.climate,'raster-fade-duration':0}},_lblAnchor);
      } else { setVis('lyr-climate',true); }
      try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){}
      buildLegend();
      if(window.kSelected && window.kSelected.size>0 && window._refreshKoppenImage) window._refreshKoppenImage();
    }
    function buildLegend(){
      const lg=document.getElementById('koppen-legend');
      const clearBtn=kSelected.size>0?`<button class="kl-clear" id="kl-clear">${HOST.lang==='jp'?'選択解除':HOST.lang==='de'?'Auswahl aufheben':HOST.lang==='ru'?'Снять выделение':HOST.lang==='es'?'Quitar selección':'Clear selection'}</button>`:'';
      const dragTitle=HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите для перемещения':HOST.lang==='es'?'Arrastra para mover':'Drag to move';
      /* The drag handle is part of the rebuilt markup so it survives every innerHTML refresh — the
         old code injected it once after setup and buildLegend() wiped it, so the legend "couldn't be
         moved" (#22). */
      /* (#R12) Period pulldown — default present-day, switch to historical eras. */
      const perLabel=HOST.lang==='jp'?'期間':HOST.lang==='de'?'Zeitraum':HOST.lang==='ru'?'Период':HOST.lang==='es'?'Período':'Period';
      const periodSel=`<div class="kl-period"><label>${perLabel}</label><select id="kl-period">`+window.KOPPEN_PERIODS.map(([p])=>`<option value="${p}"${p===window._koppenPeriod?' selected':''}>${p}</option>`).join('')+`</select></div>`;
      /* (#R23) Click a class = highlight just that climate on the map (RESTORED). Selected rows get the
         .sel outline + a Clear button; long-press (mobile) / right-click (desktop) shows the criteria. */
      lg.innerHTML=`<span class="kl-drag" title="${dragTitle}">⋮⋮</span><button class="layer-popup-x" id="kl-close" title="${t('close')}">✕</button><h4>${t('lgdTitle')}</h4>`+periodSel+`<div class="kl-scroll">`+KCOL.map(([code,c])=>{ const _knm=KNAME[code]?(KNAME[code][HOST.lang]||KNAME[code].en):''; return `<div class="kl-item${kSelected.has(code)?' sel':''}" data-c="${code}" title="${code}${_knm?' · '+_knm:''}"><span class="kl-sw" style="background:rgb(${c[0]},${c[1]},${c[2]})"></span><span class="kl-code">${code}</span>${_knm?`<span class="kl-nm"> · ${_knm}</span>`:''}</div>`; }).join('')+`</div>`+clearBtn+`<div class="kl-hint">${_imTouchPrimary()?(HOST.lang==='jp'?'タップでその気候だけ強調 / 長押しで定義':HOST.lang==='de'?'Tippen: Klima hervorheben • lange drücken: Kriterien':HOST.lang==='ru'?'Касание — выделить климат • долгое нажатие — критерии':HOST.lang==='es'?'Toca para resaltar el clima • mantén pulsado para criterios':'Tap to highlight • long-press for criteria'):(HOST.lang==='jp'?'クリックでその気候だけ強調 / 右クリックで定義':HOST.lang==='de'?'Klick: Klima hervorheben • Rechtsklick: Kriterien':HOST.lang==='ru'?'Клик — выделить климат • правый клик — критерии':HOST.lang==='es'?'Clic: resaltar clima • clic derecho: criterios':'Click to highlight • right-click for criteria')}</div>`;
      const psel=lg.querySelector('#kl-period'); if(psel) psel.onchange=(e)=>{ window.setKoppenPeriod(e.target.value); };
      const clr=lg.querySelector('#kl-clear'); if(clr) clr.onclick=()=>{ kSelected.clear(); buildLegend(); if(window._refreshKoppenImage) window._refreshKoppenImage(); };
      lg.querySelectorAll('.kl-item').forEach(it=>{
        const code=it.dataset.c;
        const crit=(x,y)=>showKoppenInfo(code,x,y);
        let lpT=null, lpFired=false;
        it.onclick=()=>{ if(lpFired){ lpFired=false; return; } kSelected.has(code)?kSelected.delete(code):kSelected.add(code); buildLegend(); if(window._refreshKoppenImage) window._refreshKoppenImage(); };
        it.oncontextmenu=(e)=>{ e.preventDefault(); crit(e.clientX,e.clientY); };
        it.addEventListener('touchstart',(e)=>{ lpFired=false; const tt=e.touches&&e.touches[0]; lpT=setTimeout(()=>{ lpT=null; lpFired=true; crit(tt?tt.clientX:0,tt?tt.clientY:0); },480); },{passive:true});
        it.addEventListener('touchmove',()=>{ if(lpT){ clearTimeout(lpT); lpT=null; } },{passive:true});
        it.addEventListener('touchend',()=>{ if(lpT){ clearTimeout(lpT); lpT=null; } },{passive:true});
      });
      const xb=lg.querySelector('#kl-close'); if(xb) xb.onclick=()=>{ /* × also disables the layer (user request) */ const cb2=document.getElementById('dl-climate'); if(cb2){ cb2.checked=false; cb2.dispatchEvent(new Event('change')); } };
      try{ window._ensureLegendOpacity&&window._ensureLegendOpacity(lg); window._ensureLegendMinimize&&window._ensureLegendMinimize(lg); }catch(_){}
      try{ window._wireLegendDrag&&window._wireLegendDrag(lg); }catch(_){}
      try{ _fitKoppenLegend(lg); }catch(_){}
    }
    /* (#R150) "上下に伸ばして…一番下まで伸ばせない" — the user wants to DRAG the legend all the way down to the
       BOTTOM OF THE SCREEN and have it stop there. R147–R149 clamped max-height to the CONTENT height, so
       resize:vertical could never exceed the content: on a tall display (or with only a few classes selected)
       the grip stopped short of the bottom and the box refused to grow — exactly "一番下まで伸ばせない". The fix
       is to base the ceiling on the VIEWPORT, not the content: from the legend's own top edge down to ~12px
       above the screen bottom. Now the grip stretches to the very bottom and STOPS at the screen edge (the CSS
       max-height cap), while the inner .kl-scroll keeps every one of the ~30 classes reachable when the box is
       shorter than the content. Recomputed on rebuild / show / window-resize. Desktop only (mobile CSS owns it). */
    function _fitKoppenLegend(lg){ try{
      lg=lg||document.getElementById('koppen-legend'); if(!lg) return;
      const cs=getComputedStyle(lg);
      if(cs.display==='none' || lg.classList.contains('legend-collapsed')) return;
      if(window.innerWidth<=768) return;
      /* (#R154) WIDTH HUGS THE CONTENT (per language). Measure the widest zone row (code + " · name") with an off-screen
         span in the legend's own font, then size the panel to exactly that + row chrome + the reserved scrollbar gutter,
         clamped 176–324px and to what fits right of the panel. Ends BOTH width complaints at once: no dead space when the
         text is short (Japanese ≈ 205px border-box, was 286 = ~80px empty) and no clipping when it is long (German fits).
         Set ONLY here (build / show / window-resize), never during the vertical drag → the row width never shifts on its
         own ("気候名の行幅が勝手に動かない"). Rows are single-line (nowrap), so width does not change the measured height. */
      try{ const items=lg.querySelectorAll('.kl-item');
        if(items.length){ const m=document.createElement('span');
          m.style.cssText='position:absolute;left:-9999px;top:-9999px;visibility:hidden;white-space:nowrap;font-size:'+cs.fontSize+';font-family:'+cs.fontFamily+';';
          document.body.appendChild(m); let mx=0;
          items.forEach(it=>{ const cd=it.querySelector('.kl-code'), nm=it.querySelector('.kl-nm');
            m.style.fontWeight='600'; m.textContent=cd?cd.textContent:''; let w=m.offsetWidth;
            if(nm){ m.style.fontWeight='400'; m.textContent=nm.textContent; w+=m.offsetWidth; }
            if(w>mx) mx=w; });
          document.body.removeChild(m);
          if(mx>0){ const contentW=Math.round(mx + 11 + 12 + 8 + 15 + 22 + 6);   /* (#R155) border-box: swatch(11)+2 flex gaps(12)+item padding(8)+scrollbar gutter(15)+CONTAINER padding+border(22)+slack(6). Under box-sizing:border-box the width we set includes the 20px padding+2px border, so it must be added here — the old content-box formula omitted them, so the visible panel ran ~22px wider than the text it was sized for. */
            const room=Math.round((window.innerWidth - lg.getBoundingClientRect().left) - 16);
            const w=Math.max(190, Math.min(460, room>200?room:460, contentW));   /* (#R155) max 324→460 so the longest German/Russian names fit without clipping */
            lg.style.width=w+'px'; } }
      }catch(_){}
      const top=lg.getBoundingClientRect().top;                 /* rendered top edge (top-anchored: stable as it grows) */
      const renderedMax=Math.round(window.innerHeight - top - 8);   /* (#R154) 12→8: a few more px of reach toward the bottom so the LAST zone clears on a slightly shorter viewport too */
      /* (#R151) STOP WHEN ALL CLASSES ARE SHOWN ("すべての気候区分が表示されたら止まる"). R150 set max-height = the
         viewport ceiling with NO content clamp, so the resize grabber kept stretching into EMPTY space past the last
         class. Measure the natural height that shows every class (temporarily neutralise any dragged inline height +
         max-height so the box shrink-wraps), then cap at min(content, viewport): a short list stops exactly at its
         last row (no blank space), a list taller than the screen stops at the screen bottom with the inner .kl-scroll
         revealing the rest. Measured set→read→restore in one synchronous task → no paint, no flicker. */
      const prevH=lg.style.height, prevMH=lg.style.maxHeight;
      lg.style.maxHeight='none'; lg.style.height='auto';
      const naturalBorderBox=lg.getBoundingClientRect().height;   /* full height that shows every climate class */
      lg.style.height=prevH; lg.style.maxHeight=prevMH;
      const ceil=Math.min(renderedMax, Math.ceil(naturalBorderBox));   /* border-box: content OR viewport, whichever is smaller */
      /* max-height on a content-box element sizes the CONTENT box; the rendered border-box is that + padding + border. */
      let mh=ceil;
      if(cs.boxSizing!=='border-box'){ const pb=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0)+(parseFloat(cs.borderTopWidth)||0)+(parseFloat(cs.borderBottomWidth)||0); mh=Math.max(0, ceil-pb); }
      lg.style.maxHeight=Math.max(150, mh)+'px';
    }catch(_){} }
    window._fitKoppenLegend=_fitKoppenLegend;
    (function(){ let _klRz=null; window.addEventListener('resize',()=>{ if(_klRz) return; _klRz=setTimeout(()=>{ _klRz=null; try{ const lg=document.getElementById('koppen-legend'); if(!lg||getComputedStyle(lg).display==='none') return; if(window.innerWidth<=768) lg.style.maxHeight=''; else _fitKoppenLegend(lg); }catch(_){} },200); }); })();
    /* Decode a Köppen code into its defining criteria (#25) — letter by letter, EN + JP. */
    function koppenCriteria(code){
      const g=code[0], rest=code.slice(1), en=[], jp=[];
      const main={A:['Tropical — coldest month ≥ 18 °C','熱帯 — 最寒月も18°C以上'],
        B:['Arid — annual precipitation below the Köppen dryness threshold','乾燥帯 — 年降水量が乾燥限界未満'],
        C:['Temperate — coldest month 0–18 °C','温帯 — 最寒月0〜18°C'],
        D:['Continental — coldest month < 0 °C, warmest > 10 °C','冷帯（亜寒帯）— 最寒月0°C未満・最暖月10°C超'],
        E:['Polar — warmest month < 10 °C','寒帯 — 最暖月10°C未満']}[g];
      if(main){ en.push(main[0]); jp.push(main[1]); }
      const seg={ f:['No dry season (rain year-round)','年中湿潤（乾季なし）'], m:['Monsoonal — brief dry season, very wet overall','モンスーン（短い乾季・多雨）'],
        w:['Dry winter','冬季乾燥'], s:['Dry summer','夏季乾燥'],
        W:['Desert (true arid)','砂漠'], S:['Steppe (semi-arid)','ステップ（半乾燥）'],
        h:['Hot — mean annual ≥ 18 °C','高温（年平均18°C以上）'], k:['Cold — mean annual < 18 °C','寒冷（年平均18°C未満）'],
        a:['Hot summer — warmest ≥ 22 °C','高温の夏（最暖月22°C以上）'], b:['Warm summer — warmest < 22 °C, ≥4 months > 10 °C','温暖な夏（最暖月22°C未満、10°C超が4か月以上）'],
        c:['Cool short summer — 1–3 months > 10 °C','冷涼で短い夏（10°C超が1〜3か月）'], d:['Severe winter — coldest < −38 °C','厳寒の冬（最寒月−38°C未満）'],
        T:['Tundra — warmest month 0–10 °C','ツンドラ（最暖月0〜10°C）'], F:['Ice cap — every month < 0 °C','氷雪（全月0°C未満）'] };
      for(const ch of rest){ if(seg[ch]){ en.push(seg[ch][0]); jp.push(seg[ch][1]); } }
      return {en,jp};
    }
    function showKoppenInfo(code,x,y){
      const info=koppenCriteria(code), nm=KNAME[code]?(KNAME[code][HOST.lang]||KNAME[code].en):code;
      const lines=(HOST.lang==='jp'?info.jp:info.en).map(s=>`<li>${convTempText(s)}</li>`).join('');
      const col=(KCOL.find(k=>k[0]===code)||[,[150,150,150]])[1];
      let pop=document.getElementById('koppen-info-pop');
      if(!pop){ pop=document.createElement('div'); pop.id='koppen-info-pop'; pop.className='koppen-info-pop'; mc.appendChild(pop); }
      pop.innerHTML=`<button class="kip-x" title="${t('close')}">✕</button><div class="kip-h"><span class="kl-sw" style="background:rgb(${col[0]},${col[1]},${col[2]})"></span><b>${code}</b> · ${nm}</div><ul>${lines}</ul>`;
      pop.style.display='block';
      const r=mc.getBoundingClientRect();
      pop.style.left=Math.max(8,Math.min((x||0)-r.left, r.width-248))+'px';
      pop.style.top=Math.max(8,Math.min((y||0)-r.top, r.height-180))+'px';
      pop.querySelector('.kip-x').onclick=()=>{ pop.style.display='none'; };
    }
    window.showKoppenInfo=showKoppenInfo;
    window._buildKoppenLegend=buildLegend;   /* so a map-click highlight can refresh the legend's selection state */

    /* Stagger legends vertically so multiple can show without overlapping. Only re-tile
       legends that haven't been manually dragged (left/top still 'auto'/unset). */
    /* Opacity slider moved INTO the legend popup (#17). Injected lazily into each legend the first
       time it's shown; covers every layer that has a legend. */
    function legendIdOf(el){ if(!el) return null; if(el.id==='koppen-legend') return 'climate'; const m=/^data-legend-(.+)$/.exec(el.id||''); return m?m[1]:null; }
    function ensureLegendOpacity(el){
      const id=legendIdOf(el); if(!id||opacities[id]==null) return;
      if(el.querySelector('.dl-op-row')) return;
      const row=document.createElement('div'); row.className='dl-op-row';
      row.innerHTML=`${HOST.lang==='jp'?'透明度':HOST.lang==='de'?'Deckkraft':HOST.lang==='ru'?'Прозрачность':HOST.lang==='es'?'Opacidad':'Opacity'}<input type="range" min="0" max="1" step="0.05" value="${opacities[id]}"><span class="dl-op-val">${Math.round(opacities[id]*100)}%</span>`;
      const hint=el.querySelector('.dl-hint, .kl-hint'); if(hint && hint.parentNode===el) el.insertBefore(row,hint); else el.appendChild(row);
      const r=row.querySelector('input'), val=row.querySelector('.dl-op-val');
      r.addEventListener('input',()=>{ const v=parseFloat(r.value); setLayerOpacity(id,v); if(val) val.textContent=Math.round(v*100)+'%'; });
    }
    window._ensureLegendOpacity=ensureLegendOpacity;
    /* (#R152) contour DENSITY slider — added to the contour legend right under its opacity row (layer controls live
       in the legend, R16 rule). Dragging rebuilds contour-src with a finer/coarser interval table (on release). */
    function ensureContourDensity(el){ try{
      if(!el || legendIdOf(el)!=='contours') return;
      if(el.querySelector('.dl-cd-row')) return;
      const d=Math.max(0.25,Math.min(4,+window._contourDensity||1));
      const row=document.createElement('div'); row.className='dl-op-row dl-cd-row';
      row.innerHTML=`${HOST.lang==='jp'?'細かさ':HOST.lang==='de'?'Dichte':HOST.lang==='ru'?'Детализация':HOST.lang==='es'?'Detalle':'Detail'}<input type="range" min="0.5" max="3" step="0.25" value="${d}"><span class="dl-op-val">${d}×</span>`;
      const op=el.querySelector('.dl-op-row:not(.dl-cd-row)');
      if(op && op.parentNode===el) el.insertBefore(row, op.nextSibling);
      else { const hint=el.querySelector('.dl-hint, .kl-hint'); if(hint && hint.parentNode===el) el.insertBefore(row,hint); else el.appendChild(row); }
      const r=row.querySelector('input'), val=row.querySelector('.dl-op-val');
      r.addEventListener('input',()=>{ if(val) val.textContent=parseFloat(r.value)+'×'; });
      r.addEventListener('change',()=>{ if(window._setContourDensity) window._setContourDensity(parseFloat(r.value)); });
    }catch(_){} }
    window._ensureContourDensity=ensureContourDensity;
    /* (#R15c) Generic legend for layers that previously had ONLY an inline opacity slider in the Layers
       panel and no legend of their own (precip, clouds, ships, planes, hillshade, contours, day/night).
       Now every opacity lives in a legend, so the Layers panel can drop its inline sliders. The opacity row
       + minimise button are added automatically by tileLegends()/ensureLegendOpacity() (id matches
       data-legend-<id> → opacities[<id>]). */
    const GENERIC_LEG={
      precip:['Precipitation (IMERG)','降水量 (IMERG)'], clouds:['Clouds (infrared)','雲（赤外）'],
      ships:['Live ship traffic','船舶（リアルタイム）'], planes:['Live aircraft traffic','航空機（リアルタイム）'],
      hillshade:['Elevation relief (hillshade)','陰影起伏'], contours:['Contour lines','等高線'],
      night:['Day / night','昼/夜'], subcables:['Submarine cables','海底ケーブル'], nato:['NATO members','NATO加盟国']
    };
    /* (#R19) `names`/`cbId` make this usable for ANY layer ("どのレイヤーも透明度選択ができるように"):
       a caller can register a legend (with auto opacity row) for a layer that has none — geo/strategic
       lines, l9 dams/volcanoes/aurora, plates, the new beta layers… — without touching GENERIC_LEG. */
    function ensureGenericLegend(id, names, cbId){
      /* (#R38) store all four [EN, JP, DE, RU]; callers that pass only [EN, JP] still work (DE/RU fall back to
         EN — never Japanese). */
      if(names && !GENERIC_LEG[id]) GENERIC_LEG[id]=[names[0], names[1]||names[0], names[2]||names[0], names[3]||names[0]];
      if(!GENERIC_LEG[id]) return null;
      let el=document.getElementById('data-legend-'+id);
      if(!el){ el=document.createElement('div'); el.className='data-legend generic-legend'; el.id='data-legend-'+id; el.style.bottom='140px';
        (document.getElementById('map-container')||document.body).appendChild(el);
        try{ window._wireLegendDrag&&window._wireLegendDrag(el); }catch(_){} }
      if(cbId) el.dataset.cbId=cbId;
      const nm=GENERIC_LEG[id][{en:0,jp:1,de:2,ru:3}[HOST.lang]]||GENERIC_LEG[id][0];
      const _dragT=HOST.lang==='jp'?'ドラッグして移動':HOST.lang==='de'?'Zum Verschieben ziehen':HOST.lang==='ru'?'Перетащите':'Drag to move';
      if(!el.querySelector('h4')){ el.innerHTML='<span class="dl-drag" title="'+_dragT+'">⋮⋮</span><button class="layer-popup-x" data-x="'+(cbId||id)+'" title="'+t('close')+'">✕</button><h4>'+nm+'</h4>';   /* (#R40) data-x so the universal delegated × handler is a guaranteed fallback */
        el.querySelector('.layer-popup-x').onclick=()=>{ const cb=(el.dataset.cbId&&document.getElementById(el.dataset.cbId))||document.getElementById('dl-'+id)||document.querySelector('.geo-layer-cb[data-layer="'+id+'"]'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); } };
        /* (#R15d) ships/planes: the military/civilian filter moves from the Layers panel INTO the legend. */
        if(id==='ships'||id==='planes'){
          const fr=document.createElement('div'); fr.className='gl-filter-row'; fr.style.cssText='font-size:10.5px;color:var(--text-muted);margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
          const _fL=HOST.lang==='jp'?'絞り込み':HOST.lang==='de'?'Filter':HOST.lang==='ru'?'Фильтр':'Filter';
          const _fAll=HOST.lang==='jp'?'すべて':HOST.lang==='de'?'Alle':HOST.lang==='ru'?'Все':'All';
          const _fCiv=HOST.lang==='jp'?'民間':HOST.lang==='de'?'Zivil':HOST.lang==='ru'?'Гражданские':'Civilian';
          const _fMil=HOST.lang==='jp'?'軍用':HOST.lang==='de'?'Militär':HOST.lang==='ru'?'Военные':'Military';
          fr.innerHTML=_fL+' <select class="gl-filter" style="padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;"><option value="all">'+_fAll+'</option><option value="civilian">'+_fCiv+'</option><option value="military">'+_fMil+'</option></select>';
          el.appendChild(fr);
          const s=fr.querySelector('.gl-filter'); try{ s.value=(trafficFilters&&trafficFilters[id])||'all'; }catch(_){}
          s.addEventListener('change',()=>{ try{ trafficFilters[id]=s.value; }catch(_){} try{ refreshTrafficLayer(id); }catch(_){} });
          /* (#R172) aircraft can stand at their real altitude; the flat glyph is still one click away for
             anyone who wants a plain top-down picture. Lives next to the filter, same row, same legend. */
          if(id==='planes'){
            const a3=document.createElement('label'); a3.style.cssText='display:flex;align-items:center;gap:5px;cursor:pointer;';
            const _aL=HOST.lang==='jp'?'実際の高度で表示':HOST.lang==='de'?'In echter Höhe':HOST.lang==='ru'?'На реальной высоте':HOST.lang==='es'?'A su altitud real':'At real altitude';
            a3.innerHTML='<input type="checkbox" class="gl-alt3d" style="accent-color:var(--primary-color);">'+_aL;
            fr.appendChild(a3);
            const c3=a3.querySelector('.gl-alt3d'); try{ c3.checked=planes3DOn(); }catch(_){}
            c3.addEventListener('change',()=>{ try{ setPlanes3D(c3.checked); }catch(_){} });
          }
        }
      } else { el.querySelector('h4').textContent=nm; }
      /* (#R40) attach the 1-line "what is this data" explanation to the generic legend too (it was only on the
         dedicated climate legends before). Refreshed each call so it tracks the language; well-known metrics
         (population/GDP/area/density) have no entry and get nothing. */
      try{ if(window._legendDescHTML){ const dh=window._legendDescHTML(id); const old=el.querySelector('.dl-desc'); if(old) old.remove(); if(dh) el.insertAdjacentHTML('beforeend',dh); } }catch(_){}
      return el;
    }
    window._ensureGenericLegend=ensureGenericLegend;
    /* Minimize/expand a legend so a kept-open one doesn't hog the screen (esp. mobile Köppen). */
    function toggleLegendMin(el){
      const collapsed=el.classList.toggle('legend-collapsed');
      Array.from(el.children).forEach(ch=>{ if(ch.tagName==='H4'||ch.classList.contains('dl-drag')||ch.classList.contains('kl-drag')||ch.classList.contains('legend-min')||ch.classList.contains('layer-popup-x')) return; ch.style.display = collapsed?'none':''; });
      const b=el.querySelector('.legend-min'); if(b){ b.textContent=collapsed?'▢':'–'; b.title=collapsed?(HOST.lang==='jp'?'展開':HOST.lang==='de'?'Ausklappen':HOST.lang==='ru'?'Развернуть':HOST.lang==='es'?'Expandir':'Expand'):(HOST.lang==='jp'?'最小化':HOST.lang==='de'?'Minimieren':HOST.lang==='ru'?'Свернуть':HOST.lang==='es'?'Minimizar':'Minimize'); }
    }
    function ensureLegendMinimize(el){
      if(!el) return;
      let b=el.querySelector('.legend-min');
      if(!b){ b=document.createElement('button'); b.className='legend-min'; b.onclick=(e)=>{ e.stopPropagation(); toggleLegendMin(el); }; el.appendChild(b); }
      const collapsed=el.classList.contains('legend-collapsed');
      b.textContent=collapsed?'▢':'–'; b.title=collapsed?(HOST.lang==='jp'?'展開':HOST.lang==='de'?'Ausklappen':HOST.lang==='ru'?'Развернуть':HOST.lang==='es'?'Expandir':'Expand'):(HOST.lang==='jp'?'最小化':HOST.lang==='de'?'Minimieren':HOST.lang==='ru'?'Свернуть':HOST.lang==='es'?'Minimizar':'Minimize');
      /* On phones, start minimized so the legend never covers the map on open. */
      if(window.matchMedia&&window.matchMedia('(max-width:768px)').matches && !el.dataset.minInit){ el.dataset.minInit='1'; if(!collapsed) toggleLegendMin(el); }
    }
    window._ensureLegendMinimize=ensureLegendMinimize;
    /* Collapse every open, expanded legend (used when a phone user taps the map outside a legend, #29). */
    window._minimizeOpenLegends=function(){
      [document.getElementById('koppen-legend'),lgdHDI,lgdDem,lgdPop,lgdEEZ,lgdTemp,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat]
        .forEach(el=>{ if(el && (el.style.display==='block'||el.style.display==='flex') && !el.classList.contains('legend-collapsed')){ try{ toggleLegendMin(el); }catch(_){} } });
    };
    function tileLegends(){
      const all=[document.getElementById('koppen-legend'),lgdHDI,lgdDem,lgdPop,lgdEEZ,lgdTemp,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat,document.getElementById('data-legend-wind')].concat([...document.querySelectorAll('.data-legend.generic-legend')]);
      const visible=all.filter(el=>el&&el.style.display==='block' && !el.dataset.dragged);
      all.forEach(el=>{ if(el&&(el.style.display==='block'||el.style.display==='flex')) try{ ensureLegendOpacity(el); ensureContourDensity(el); ensureLegendMinimize(el); }catch(_){} });
      /* (#R13c) Desktop legends live on the LEFT of the map. In frosted-overlay mode the sidebar floats
         over the map, so offset past it (unless collapsed); mobile keeps its own right-dock CSS. */
      const ws=document.body.classList.contains('ws-mode');
      let leftBase=24;
      /* (#R85) BUGFIX: in workspace mode #sidebar is display:none, so getBoundingClientRect().width is 0 and the
         old `(0||440)+24` shoved every legend 464px to the RIGHT — that is why legends never appeared at the map's
         bottom-left in ws-mode. Only offset past the sidebar when it is genuinely visible with a real width. */
      try{ if(!ws && document.body.classList.contains('sidebar-glass')){ const sb=document.querySelector('.sidebar'); if(sb && !sb.classList.contains('collapsed') && getComputedStyle(sb).display!=='none'){ const w=sb.getBoundingClientRect().width; if(w>1) leftBase=w+24; } } }catch(_){}
      const mobile = !ws && window.matchMedia && window.matchMedia('(max-width:768px)').matches;
      if(ws){
        /* (#R85) workspace mode: dock legends to the BOTTOM-LEFT of the Map window ("ワークスペースモードでレイヤーを
           オンにしたら、凡例は地図の左下あたりに") — stack upward, clearing the coordinate readout in the corner. */
        let bottom=30;
        visible.forEach(el=>{ el.style.bottom=bottom+'px'; el.style.top='auto'; el.style.left='12px'; el.style.right='auto'; bottom += el.getBoundingClientRect().height+10; });
      } else if(mobile){
        /* (#R15d) Stack legends DOWNWARD from just below the search bar (top:64), left-aligned. The CSS
           default above is for the first paint; this keeps multiple open legends from overlapping. */
        let top=64;
        visible.forEach(el=>{ el.style.top=top+'px'; el.style.bottom='auto'; el.style.left='6px'; el.style.right='auto'; top += el.getBoundingClientRect().height+8; });
      } else {
        let bottom=140;
        visible.forEach(el=>{ el.style.bottom=bottom+'px'; el.style.top='auto'; el.style.left=leftBase+'px'; el.style.right='auto'; bottom += el.getBoundingClientRect().height+10; });
      }
    }
    /* Mark a legend as user-dragged so tileLegends() leaves it alone. */
    document.addEventListener('mousedown', e=>{
      const drag=e.target.closest('.dl-drag,.kl-drag'); if(!drag) return;
      const lg=drag.closest('.data-legend,.koppen-legend'); if(lg) lg.dataset.dragged='1';
    });
    /* ===== Traffic layer state ===== */
    const trafficFilters={ships:'all',planes:'all'};
    let planesData=[], shipsData=[], planesTimer=null, shipsTimer=null;
    let planesTime=0, planesSynthetic=false;   /* live-feed snapshot time (ms) + synthetic-fallback flag */
    let _planesMove=null, _planesMoveT=null;   /* viewport-follow refetch handle */
    let _planes3DZoom=null, _planes3DZoomT=null;   /* (#R172) rebuild the lifted glyphs when the scale changes */
    let _planesClear=null, _planesHover=null, _pickHover=false, _pickAt=0;   /* (#R173) picking a lifted aircraft */
    let _planesDbl=null, _planesClearT=null;   /* (#R174) a double-click is a ZOOM, not "you clicked empty sky" */
    /* (#R172) "is the aircraft layer on?" — it has two renderings now, so asking after one of them by name
       (as every call site used to) reports the layer as OFF whenever the other one is the visible one. */
    function planesLayerOn(){ try{
      const a=map.getLayer('lyr-planes')&&map.getLayoutProperty('lyr-planes','visibility')==='visible';
      const b=map.getLayer(PLANE3D_LYR)&&map.getLayoutProperty(PLANE3D_LYR,'visibility')==='visible';
      return !!(a||b); }catch(_){ return false; } }
    /* Aircraft military operator hints (very rough — based on callsign prefixes) */
    const MILITARY_CALLSIGN_PREFIXES=['RCH','REACH','SAM','EVAC','MUSCLE','HOMR','BLUE','RNGR','NATO','PAT','RFR','SPAR','THUG','SHELL','GRZLY','CLAMP','POPS','HAWG','SLAY','DUKE','LOBO','GUMP','HUSKY','HUNTR','BAND','TYRN','MAGMA','KING','CAMEL'];
    function classifyAircraft(callsign){
      if(!callsign) return 'civilian';
      const c=callsign.trim().toUpperCase();
      if(MILITARY_CALLSIGN_PREFIXES.some(p=>c.startsWith(p))) return 'military';
      if(/^[A-Z]{3,4}\d/.test(c)) return 'civilian';
      return 'civilian';
    }
    /* Try OpenSky first; if CORS / rate-limit fails, fall back to synthetic civilian + military aircraft so the layer is never empty. */
    const AIRPORTS=[
      [-73.78,40.64,'civilian','JFK'],[-118.41,33.94,'civilian','LAX'],[-87.90,41.98,'civilian','ORD'],[-122.38,37.62,'civilian','SFO'],[-97.04,32.90,'civilian','DFW'],[-80.29,25.79,'civilian','MIA'],[-79.63,43.68,'civilian','YYZ'],[-99.07,19.43,'civilian','MEX'],
      [-0.45,51.47,'civilian','LHR'],[2.55,49.01,'civilian','CDG'],[8.57,50.04,'civilian','FRA'],[4.76,52.31,'civilian','AMS'],[14.28,40.89,'civilian','FCO'],[28.81,41.28,'civilian','IST'],[-3.56,40.49,'civilian','MAD'],
      [37.41,55.97,'civilian','SVO'],[55.36,25.25,'civilian','DXB'],[51.61,25.27,'civilian','DOH'],[51.16,35.69,'civilian','IKA'],[31.40,30.11,'civilian','CAI'],[28.05,-26.13,'civilian','JNB'],
      [116.58,40.07,'civilian','PEK'],[121.81,31.14,'civilian','PVG'],[114.20,22.31,'civilian','HKG'],[121.55,25.07,'civilian','TPE'],[126.45,37.46,'civilian','ICN'],[139.78,35.55,'civilian','HND'],[140.39,35.77,'civilian','NRT'],[103.99,1.36,'civilian','SIN'],[100.75,13.69,'civilian','BKK'],[106.66,10.81,'civilian','SGN'],[77.10,28.55,'civilian','DEL'],[72.86,19.09,'civilian','BOM'],[101.71,2.74,'civilian','KUL'],[106.66,-6.13,'civilian','CGK'],[120.98,14.51,'civilian','MNL'],
      [151.18,-33.93,'civilian','SYD'],[174.79,-37.01,'civilian','AKL'],
      [-46.48,-23.43,'civilian','GRU'],[-58.42,-34.82,'civilian','EZE'],[-70.79,-33.39,'civilian','SCL'],[-74.14,4.70,'civilian','BOG'],
      /* Military bases (less dense) */
      [144.92,13.58,'military','Andersen'],[72.41,-7.31,'military','DG'],[-157.97,21.36,'military','HCK'],[127.02,36.96,'military','OSAN'],[7.60,49.44,'military','RAM'],[33.52,44.61,'military','SEV'],[126.68,37.96,'military','DMZ'],[35.18,32.99,'military','ROT'],[140.13,35.30,'military','YKS']
    ];
    function genSyntheticPlanes(){
      const arr=[], now=Math.floor(Date.now()/1000);
      AIRPORTS.forEach(([lng,lat,type,name])=>{
        const count = type==='military'?2:6;
        for(let i=0;i<count;i++){
          const r=200+Math.random()*1400; /* km radius */
          const ang=Math.random()*Math.PI*2;
          const dLat = (r/111)*Math.sin(ang);
          const dLng = (r/(111*Math.cos(lat*Math.PI/180)+1e-3))*Math.cos(ang);
          arr.push({
            icao24:Math.random().toString(36).slice(2,8).toUpperCase(),
            callsign: type==='military'?'MIL'+Math.floor(Math.random()*9000+1000):name+Math.floor(Math.random()*900+100),
            country: type==='military'?'MIL':'',
            tpos:now, lastContact:now,
            lng:lng+dLng, lat:lat+dLat,
            baroAlt:9000+Math.random()*3500, onGround:false, vel:200+Math.random()*60, heading:Math.random()*360, vrate:0,
            geoAlt:9000+Math.random()*3500, squawk:null, type
          });
        }
      });
      planesData=arr; planesTime=Date.now(); planesSynthetic=true;
      refreshTrafficLayer('planes');
    }
    /* Live aircraft = airplanes.live (free, key-less, CORS-enabled community ADS-B network).
       OpenSky's REST API is CORS-blocked from browsers and now rate-limits/auth-gates anonymous
       access, so it cannot be reached client-side; airplanes.live serves the SAME real live ADS-B
       data with proper CORS headers (and richer fields). We query the current viewport (center +
       radius, capped at the API's 250 nm max) so the aircraft match what's on screen, capturing
       every field for the tooltip + the exact data timestamp. Synthetic data is now a last resort
       only when the device is offline / the feed is unreachable. */
    let _lastPlaneFetch=0;
    /* airplanes.live caps the query radius at 250 nm, so below this zoom the viewport is far
       larger than the data coverage → only a central blob would show. Instead of that broken
       look, we prompt the user to zoom in (their explicit request). */
    const PLANES_MIN_ZOOM=5, SHIPS_MIN_ZOOM=6;
    function zoomHintEl(id,onClickZoom){
      let el=document.getElementById(id);
      if(!el){ el=document.createElement('button'); el.id=id; el.type='button';
        el.style.cssText='position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);z-index:1200;display:none;white-space:nowrap;background:rgba(18,18,20,0.82);color:#fff;border:none;border-radius:999px;padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,0.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
        el.onclick=()=>{ if(map) map.easeTo({zoom:onClickZoom,duration:600}); };
        const mc=document.getElementById('map-container'); if(mc) mc.appendChild(el);
      }
      return el;
    }
    function updatePlanesZoomHint(){
      const on=!!(map&&planesLayerOn());   /* (#R172) either rendering counts as "the layer is on" */
      const el=zoomHintEl('planes-zoom-hint',PLANES_MIN_ZOOM);
      if(on&&map.getZoom()<PLANES_MIN_ZOOM){ el.textContent=t('planesZoomHint'); el.style.display='block'; } else el.style.display='none';
    }
    function viewportRadiusNm(){
      try{ if(map){ const c=map.getCenter(), ne=map.getBounds().getNorthEast(), toR=Math.PI/180, R=6371;
        const dLat=(ne.lat-c.lat)*toR, dLon=(ne.lng-c.lng)*toR;
        const a=Math.sin(dLat/2)**2+Math.cos(c.lat*toR)*Math.cos(ne.lat*toR)*Math.sin(dLon/2)**2;
        const km=2*R*Math.asin(Math.min(1,Math.sqrt(a)));
        return Math.max(50,Math.min(250,Math.round(km/1.852))); } }catch(_){}
      return 250;
    }
    /* Normalise an airplanes.live ADS-B record to our internal plane shape (units → m, m/s). */
    function adsbToPlane(a,nowMs){
      const FT=0.3048, KT=0.514444, FPM=0.00508, onGround=a.alt_baro==='ground';
      /* (#R19) Military = dbFlags bit 0 ONLY. That bit comes from the curated Mictronics/tar1090
         registration database (per-airframe, not guessed), so it's trustworthy — which is why the
         military/civilian Filter stays. The old callsign-prefix heuristic ("KING", "SHELL", "BLUE"…)
         mislabeled ordinary airline callsigns as military and is dropped from the live path
         (classifyAircraft is still used by the clearly-labeled offline synthetic fallback only). */
      const mil=!!((a.dbFlags|0)&1);
      return {
        icao24:(a.hex||'').toUpperCase(), callsign:(a.flight||'').trim(), reg:a.r||'', acType:a.t||'', desc:a.desc||'',
        lng:a.lon, lat:a.lat,
        baroAlt: onGround?0:(typeof a.alt_baro==='number'?a.alt_baro*FT:null),
        geoAlt: (typeof a.alt_geom==='number'?a.alt_geom*FT:null),
        vel: (typeof a.gs==='number'?a.gs*KT:null),
        heading: (a.track!=null?a.track:(a.true_heading!=null?a.true_heading:(a.mag_heading!=null?a.mag_heading:0))),
        vrate: (typeof a.baro_rate==='number'?a.baro_rate*FPM:(typeof a.geom_rate==='number'?a.geom_rate*FPM:null)),
        squawk:a.squawk||'', onGround, category:(a.category||null),
        lastContact: a.seen!=null ? Math.floor(nowMs/1000 - a.seen) : Math.floor(nowMs/1000),
        type: mil?'military':'civilian'
      };
    }
    async function fetchPlanes(){
      _lastPlaneFetch=Date.now();
      /* Too zoomed out → don't query a central blob; show the "zoom in" prompt instead. */
      if(map && map.getZoom()<PLANES_MIN_ZOOM){ planesData=[]; planesSynthetic=false; refreshTrafficLayer('planes'); updatePlanesZoomHint(); return; }
      updatePlanesZoomHint();
      const lat=(map?map.getCenter().lat:48), lon=(map?map.getCenter().lng:8), rad=viewportRadiusNm();
      try{
        const r=await fetch(`https://api.airplanes.live/v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${rad}`);
        if(r.ok){
          const j=await r.json(); const ac=Array.isArray(j.ac)?j.ac:[];
          planesTime=(j.now||Date.now());
          planesSynthetic=false;
          planesData=ac.filter(a=>a.lat!=null&&a.lon!=null).slice(0,1800).map(a=>adsbToPlane(a,planesTime));
          recordTracks(planesData,planesTime);   /* (#R173) keep what we have actually seen — see planeTracks */
          refreshTrafficLayer('planes'); return;
        }
      }catch(e){ console.warn('airplanes.live fetch failed',e); }
      /* feed unreachable (offline / blocked) → clearly-labeled synthetic placeholder so the layer isn't empty */
      console.warn('Live aircraft feed unavailable — using synthetic placeholder'); genSyntheticPlanes();
    }
    /* Synthetic ship demo data — real-time AIS is paywalled. Distributes ships GLOBALLY along major sea lanes + chokepoints. */
    /* ===== Live ships via AISstream.io (real AIS over WebSocket) =====
       There is NO free, key-less, CORS-friendly global AIS feed, so this is BYOK: the user pastes
       their own FREE aisstream.io API key in Settings (stored only in this browser). With a key we
       stream real vessel positions for the current viewport; WITHOUT a key we show an honest prompt
       and NO ships — we never fabricate vessels. */
    let aisKey=''; try{ aisKey=localStorage.getItem('intmap_ais_key')||''; }catch(_){}
    let aisWS=null, shipsByMMSI={}, aisRefreshT=null, _aisMove=null, _aisMoveT=null, aisReconnectT=null;
    function updateShipsZoomHint(){
      const on=map&&map.getLayer('lyr-ships')&&map.getLayoutProperty('lyr-ships','visibility')==='visible';
      const el=zoomHintEl('ships-zoom-hint',SHIPS_MIN_ZOOM);
      if(on&&aisKey&&map.getZoom()<SHIPS_MIN_ZOOM){ el.textContent=t('shipsZoomHint'); el.style.display='block'; } else el.style.display='none';
    }
    function aisBBox(){ const b=map.getBounds(); return [[[b.getSouth(),b.getWest()],[b.getNorth(),b.getEast()]]]; }
    function stopAIS(){
      if(aisRefreshT){ clearTimeout(aisRefreshT); aisRefreshT=null; }
      if(aisReconnectT){ clearTimeout(aisReconnectT); aisReconnectT=null; }
      if(aisWS){ try{ aisWS.onclose=null; aisWS.close(); }catch(_){} aisWS=null; }
    }
    function shipMaterialize(){
      const cutoff=Date.now()-15*60000;   /* drop vessels not heard from in 15 min */
      shipsData=Object.values(shipsByMMSI).filter(s=>s.lat!=null&&s.lng!=null&&s.t>cutoff).map(s=>({
        lng:s.lng, lat:s.lat, mmsi:s.mmsi, name:s.name||'', callsign:s.callsign||'',
        speed:(s.sog!=null?s.sog:null), cog:(s.cog!=null?s.cog:null), heading:(s.heading!=null?s.heading:(s.cog!=null?s.cog:0)),
        navStatus:(s.navStatus!=null?s.navStatus:null), shipType:(s.shipType!=null?s.shipType:null),
        dest:s.dest||'', draught:(s.draught!=null?s.draught:null), imo:(s.imo!=null?s.imo:null), t:s.t,
        type:(s.shipType===35?'military':'civilian')
      }));
      refreshTrafficLayer('ships');
    }
    function scheduleShipRefresh(){ if(aisRefreshT) return; aisRefreshT=setTimeout(()=>{ aisRefreshT=null; shipMaterialize(); },1200); }
    function handleAIS(m){
      const md=m.MetaData||m.metadata||{}; const mmsi=md.MMSI||md.mmsi; if(mmsi==null) return;
      const s=shipsByMMSI[mmsi]||(shipsByMMSI[mmsi]={mmsi});
      if(md.latitude!=null) s.lat=md.latitude; if(md.longitude!=null) s.lng=md.longitude;
      if(md.ShipName) s.name=String(md.ShipName).trim();
      s.t=md.time_utc?(Date.parse(md.time_utc)||Date.now()):Date.now();
      const body=m.Message||m.message||{};
      if(m.MessageType==='PositionReport'){ const p=body.PositionReport||{};
        if(p.Latitude!=null) s.lat=p.Latitude; if(p.Longitude!=null) s.lng=p.Longitude;
        if(p.Sog!=null) s.sog=p.Sog; if(p.Cog!=null) s.cog=p.Cog;
        if(p.TrueHeading!=null&&p.TrueHeading<360) s.heading=p.TrueHeading; else if(p.Cog!=null) s.heading=p.Cog;
        if(p.NavigationalStatus!=null) s.navStatus=p.NavigationalStatus;
      } else if(m.MessageType==='ShipStaticData'){ const p=body.ShipStaticData||{};
        if(p.Name) s.name=String(p.Name).trim(); if(p.CallSign) s.callsign=String(p.CallSign).trim();
        if(p.Type!=null) s.shipType=p.Type; if(p.Destination) s.dest=String(p.Destination).trim();
        if(p.MaximumStaticDraught!=null) s.draught=p.MaximumStaticDraught; if(p.ImoNumber!=null) s.imo=p.ImoNumber;
      }
    }
    function connectAIS(){
      if(!aisKey||!map) return;
      stopAIS(); shipsByMMSI={}; shipsData=[]; refreshTrafficLayer('ships');
      let ws; try{ ws=new WebSocket('wss://stream.aisstream.io/v0/stream'); }catch(e){ imToast((HOST.lang==='jp'?'AIS接続失敗: ':HOST.lang==='de'?'AIS-Verbindung fehlgeschlagen: ':HOST.lang==='ru'?'Сбой подключения AIS: ':HOST.lang==='es'?'Fallo de conexión AIS: ':'AIS connect failed: ')+((e&&e.message)||e)); return; }
      aisWS=ws;
      ws.onopen=()=>{ try{ ws.send(JSON.stringify({APIKey:aisKey, BoundingBoxes:aisBBox(), FilterMessageTypes:['PositionReport','ShipStaticData']})); }catch(_){} };
      ws.onmessage=(ev)=>{ if(ws!==aisWS) return; try{ handleAIS(JSON.parse(ev.data)); scheduleShipRefresh(); }catch(_){} };
      ws.onerror=()=>{};
      ws.onclose=()=>{ if(ws!==aisWS) return; aisReconnectT=setTimeout(()=>{ if(map.getLayer('lyr-ships')&&map.getLayoutProperty('lyr-ships','visibility')==='visible'&&aisKey&&map.getZoom()>=SHIPS_MIN_ZOOM) connectAIS(); },4000); };
    }
    function startShips(){
      if(!aisKey){ imToast(t('aisNoKey')); updateShipsZoomHint(); return; }
      if(map.getZoom()<SHIPS_MIN_ZOOM){ updateShipsZoomHint(); return; }  /* connect once the user zooms in */
      connectAIS();
    }
    /* AIS ship-type code → label */
    function shipTypeLabel(c){ if(c==null) return ''; const jp=HOST.lang==='jp';
      if(c===35) return jp?'軍用':'Military'; if(c===30) return jp?'漁船':'Fishing'; if(c===36) return jp?'帆船':'Sailing'; if(c===37) return jp?'プレジャー':'Pleasure craft';
      if(c>=60&&c<=69) return jp?'旅客船':'Passenger'; if(c>=70&&c<=79) return jp?'貨物船':'Cargo'; if(c>=80&&c<=89) return jp?'タンカー':'Tanker';
      if(c>=40&&c<=49) return jp?'高速船':'High-speed craft'; if(c===50) return jp?'パイロット':'Pilot'; if(c===51) return 'SAR'; if(c===52) return jp?'タグ':'Tug'; if(c===55) return jp?'法執行':'Law enforcement';
      return jp?'その他':'Other'; }
    /* AIS navigational-status code → label */
    function navStatusLabel(c){ if(c==null) return ''; const jp=HOST.lang==='jp';
      const en=['Under way (engine)','At anchor','Not under command','Restricted manoeuvrability','Constrained by draught','Moored','Aground','Fishing','Under way (sailing)'];
      const ja=['航行中(機走)','錨泊','操縦不能','操縦制限','喫水制限','係留','座礁','漁労中','航行中(帆走)'];
      return (c>=0&&c<=8)?(jp?ja[c]:en[c]):''; }
    /* Ship glyphs (top-view hull) — colored + rotated by heading/COG, like the plane icons. */
    function ensureShipIcons(){
      if(!map) return;
      const make=(color)=>{ const s=40, cv=document.createElement('canvas'); cv.width=s; cv.height=s;
        const ctx=cv.getContext('2d'); ctx.translate(s/2,s/2);
        ctx.fillStyle=color; ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=1.6; ctx.lineJoin='round';
        const P=[[0,-16],[4.5,-7],[4.5,11],[3,15],[-3,15],[-4.5,11],[-4.5,-7]];
        ctx.beginPath(); P.forEach((p,i)=> i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
        return ctx.getImageData(0,0,s,s); };
      try{ if(!map.hasImage('ship-civ')) map.addImage('ship-civ',make('#17a2b8')); }catch(_){}
      try{ if(!map.hasImage('ship-mil')) map.addImage('ship-mil',make('#ff3b30')); }catch(_){}
    }
    /* AISstream key field in Settings (added via addEventListener so the existing handlers still run). */
    (function wireAisKey(){
      const ob=document.getElementById('btn-open-settings'), cb=document.getElementById('btn-close-settings');
      if(ob) ob.addEventListener('click',()=>{ const i=document.getElementById('setting-ais-key'); if(i) i.value=aisKey; });
      if(cb) cb.addEventListener('click',()=>{ const i=document.getElementById('setting-ais-key'); if(!i) return; const nk=i.value.trim();
        if(nk!==aisKey){ aisKey=nk; try{ aisKey?localStorage.setItem('intmap_ais_key',aisKey):localStorage.removeItem('intmap_ais_key'); }catch(_){}
          if(map&&map.getLayer('lyr-ships')&&map.getLayoutProperty('lyr-ships','visibility')==='visible'){ stopAIS(); startShips(); updateShipsZoomHint(); } } });
    })();
    /* ===== (#R172) AIRCRAFT AT THEIR REAL ALTITUDE ==========================================
       「Live aircraft trafficは、飛行中の高度に応じて、実際にIntMapの空間でもその高度に描画して。」
       The glyphs were a `symbol` layer, which MapLibre pins to the map SURFACE — a jet at 11 km and one
       taxiing sat at exactly the same height, and tilting the map showed no difference at all.
       MapLibre 5.24 has NO way to lift a symbol: `symbol-z-offset` / `symbol-elevation-reference` are
       absent from this build (checked in the dist — the properties simply do not exist), so the only
       primitive that takes a real altitude is `fill-extrusion`. Each aircraft therefore becomes a small
       aeroplane-shaped POLYGON built in ground metres, turned to its ADS-B track and extruded at its
       reported altitude, plus a hairline post down to its ground position so the height is readable and
       the aircraft stays tied to the point it is over.
       Honest about the one exaggeration: a real 60 m airframe is far under a pixel at these zooms, so the
       glyph has a MINIMUM on-screen size (it never shrinks below ~13 px) — the POSITION is real data, the
       silhouette's size is a symbol, exactly as the flat glyph always was.
       Altitude reference: the same trap the 3-D volume tool documents — with 3-D terrain on, the
       renderer's metres are above the GROUND, otherwise above SEA LEVEL. Airborne aircraft get the ground
       under the map centre subtracted so their altitude means AMSL either way; aircraft ON the ground are
       left at 0 so they sit on the terrain instead of hovering over it. */
    let planes3D=true; try{ planes3D=localStorage.getItem('intmap_planes3d')!=='0'; }catch(_){}
    let _planes3DStats={features:0,lifted:0,maxAlt:0,offsetM:0};
    const PLANE3D_SRC='src-planes-3d', PLANE3D_LYR='lyr-planes-3d', PLANE3D_POST='lyr-planes-post';
    /* ===== (#R173) THE TRACK OF A CLICKED AIRCRAFT =========================================
       「クリックした航空機はそれまでの軌跡も出るように。」 The track is REAL and it is OURS: every
       ADS-B poll (one every 20 s) is written into planeTracks, so what a click draws is the path this
       browser has actually watched the aeroplane fly since the layer was switched on — never an
       interpolation, never a guess about where it was before we were looking. The feed has no public
       history endpoint, and inventing one would be exactly the fabrication this project forbids, so the
       readout says how long the recorded track is and how many fixes it has.
       In 3-D the track is drawn where it happened: each leg is a thin ribbon extruded at the pair's own
       reported altitude, so a climb is visibly a climb. Flat mode keeps a plain line on the ground. */
    const TRACK_SRC='src-plane-track', TRACK_LINE='lyr-plane-track', TRACK_3D='lyr-plane-track-3d';
    const TRACK_MAX=400;            /* fixes per aircraft (~2 h at one poll every 20 s) */
    const TRACK_TTL=20*60000;       /* forget an aircraft 20 min after its last fix */
    const planeTracks=Object.create(null);
    let selectedPlane=null;         /* icao24 of the aircraft whose track is on screen */
    function recordTracks(list,tMs){
      const now=+tMs||Date.now();
      for(const d of list){
        const k=d.icao24; if(!k||d.lng==null||d.lat==null) continue;
        const alt=d.onGround?0:(d.geoAlt!=null?d.geoAlt:(d.baroAlt!=null?d.baroAlt:0));
        const arr=planeTracks[k]||(planeTracks[k]=[]);
        const last=arr[arr.length-1];
        /* skip a fix that repeats the previous one — a parked aircraft would otherwise fill the buffer */
        if(last&&Math.abs(last[0]-d.lng)<1e-6&&Math.abs(last[1]-d.lat)<1e-6&&Math.abs(last[2]-alt)<1) { last[3]=now; continue; }
        arr.push([d.lng,d.lat,alt,now]);
        if(arr.length>TRACK_MAX) arr.splice(0,arr.length-TRACK_MAX);
      }
      const cut=now-TRACK_TTL;
      for(const k in planeTracks){ const a=planeTracks[k]; if(!a.length||a[a.length-1][3]<cut) delete planeTracks[k]; }
      if(selectedPlane) drawTrack(selectedPlane);
    }
    /* a strip of ground metres along a leg, so the 3-D track is a ribbon rather than a zero-width sheet */
    function legRing(a,b,halfM){
      const r=Math.PI/180, mLat=110574, mLng=(111320*Math.cos(((a[1]+b[1])/2)*r))||1;
      let dx=(b[0]-a[0])*mLng, dy=(b[1]-a[1])*mLat; const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
      const nx=-dy*halfM, ny=dx*halfM;
      const P=(p,ox,oy)=>[p[0]+ox/mLng, p[1]+oy/mLat];
      const ring=[P(a,nx,ny),P(b,nx,ny),P(b,-nx,-ny),P(a,-nx,-ny)]; ring.push(ring[0]); return ring;
    }
    function trackStats(k){ const a=planeTracks[k]||[]; if(a.length<2) return {fixes:a.length,minutes:0,maxAlt:0};
      return { fixes:a.length, minutes:Math.round((a[a.length-1][3]-a[0][3])/60000),
        maxAlt:Math.round(a.reduce((m2,p)=>p[2]>m2?p[2]:m2,0)) }; }
    function drawTrack(k){
      if(!map||!map.getSource(TRACK_SRC)) return;
      const pts=(k&&planeTracks[k])||[];
      const feats=[];
      if(pts.length>=2){
        feats.push({type:'Feature',geometry:{type:'LineString',coordinates:pts.map(p=>[p[0],p[1]])},properties:{kind:'line'}});
        const mpp=_mppCentre(), off=_groundOffset(), half=Math.max(25,1.6*mpp), thick=Math.max(20,1.6*mpp);
        for(let i=1;i<pts.length;i++){
          const a=pts[i-1], b=pts[i];
          const alt=Math.max(0,((a[2]+b[2])/2)-off);
          if(!(alt>0)) continue;                       /* on the ground: the flat line already shows it */
          feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[legRing(a,b,half)]},
            properties:{kind:'leg',alt,top:alt+thick}});
        }
      }
      try{ map.getSource(TRACK_SRC).setData({type:'FeatureCollection',features:feats}); }catch(_){}
      const on=!!(k&&pts.length>=2);
      try{ if(map.getLayer(TRACK_LINE)) map.setLayoutProperty(TRACK_LINE,'visibility',(on&&!planes3D)?'visible':'none');
        if(map.getLayer(TRACK_3D)) map.setLayoutProperty(TRACK_3D,'visibility',(on&&planes3D)?'visible':'none'); }catch(_){}
    }
    /* ===== (#R173) PICKING AN AIRCRAFT THAT IS UP IN THE AIR =================================
       「立体時もホバーやクリックができるように。」 MapLibre answers queryRenderedFeatures on a
       fill-extrusion at its FOOTPRINT: measured with one stubbed aircraft at 11,003 m, the glyph drawn at
       y=272 and its ground point at y=388, the only row on the whole screen that reported the feature was
       388 — at z9.5, z11.5 and z13.5 alike. So the lifted aircraft could not be hovered or clicked where
       it is drawn; only the patch of ground it happened to be over could.
       The pick is therefore done here, against the aircraft's real position: the engine projects
       (lng, lat, altitude) through the renderer's own model matrices (coords.projectAltitude), and the
       nearest aircraft within a finger-sized radius wins. The ground footprint keeps working too — the
       post is a real thing to click at — so both ways of aiming at an aeroplane select the same one. */
    const PICK_PX=16;
    function pickPlane(pt){
      if(!planes3D||!pt) return null;
      const E=window.IntMapGeoEngine, pa=E&&E.coords&&E.coords.projectAltitude; if(!pa) return null;
      const off=_groundOffset(); let best=null, bestD=PICK_PX*PICK_PX;
      const filt=trafficFilters.planes;
      for(const d of planesData){
        if(d.lng==null||d.lat==null) continue;
        if(filt&&filt!=='all'&&d.type!==filt) continue;
        const alt=d.onGround?0:Math.max(0,(d.geoAlt!=null?d.geoAlt:(d.baroAlt!=null?d.baroAlt:0))-off);
        const p=pa([d.lng,d.lat],alt); if(!p) continue;
        const dx=p.x-pt.x, dy=p.y-pt.y, q=dx*dx+dy*dy;
        if(q<bestD){ bestD=q; best=d; }
      }
      return best;
    }
    /* Select / deselect the aircraft whose track is shown. Returns the icao24 now selected (or null). */
    function selectPlane(k){
      selectedPlane=(k&&planeTracks[k])?k:(k||null);
      drawTrack(selectedPlane);
      try{ refreshTrafficLayer('planes'); }catch(_){}   /* the glyph highlights itself via `sel` */
      return selectedPlane;
    }
    /* ground metres per screen pixel at the map centre — the same figure IntMapGeoEngine derives for the
       camera, computed here from the renderer's own map scale so it is defined at any pitch. */
    function _mppCentre(){ try{ const R=6371008.8, r=Math.PI/180, c=map.getCenter();
      let w=0; try{ const v=map.transform&&map.transform.worldSize; if(isFinite(v)&&v>0) w=v; }catch(_){}
      if(!w) w=512*Math.pow(2,map.getZoom()||0);
      const m=(2*Math.PI*R*Math.cos((c.lat||0)*r))/w; return (isFinite(m)&&m>0)?m:50; }catch(_){ return 50; } }
    /* the DEM height under the map centre (0 when 3-D terrain is off — then the renderer's metres already
       mean altitude above sea level and nothing has to be taken off) */
    function _groundOffset(){ try{ if(!HOST.terrain3D) return 0;
      const c=map.getCenter(); const g=map.queryTerrainElevation?map.queryTerrainElevation({lng:c.lng,lat:c.lat}):null;
      return (g==null||!isFinite(g))?0:+g; }catch(_){ return 0; } }
    /* An aeroplane silhouette in ground metres, centred on [lng,lat] and turned to `hdg` (°, clockwise from
       north). Same outline as the 2-D glyph so the layer does not change character when it goes 3-D. */
    const _PLANE_OUTLINE=[[0,-19],[2.2,-6],[2.2,-3],[17,5],[17,9],[2.2,4.5],[2.2,12],[6,16],[6,18],[0,15.5],[-6,18],[-6,16],[-2.2,12],[-2.2,4.5],[-17,9],[-17,5],[-2.2,-3],[-2.2,-6]];
    function planeRing(lng,lat,hdg,halfM){
      const r=Math.PI/180, s=halfM/19, th=(+hdg||0)*r, cs=Math.cos(th), sn=Math.sin(th);
      const mLat=110574, mLng=(111320*Math.cos(lat*r))||1, out=[];
      for(const p of _PLANE_OUTLINE){
        /* the outline is drawn nose-up in screen space (+y = south); rotate it into a compass track */
        const ex=p[0]*s, ey=-p[1]*s;                          /* east, north offsets in metres, track 0 */
        const e=ex*cs+ey*sn, n=-ex*sn+ey*cs;
        out.push([lng+e/mLng, lat+n/mLat]);
      }
      out.push(out[0]); return out; }
    function squareRing(lng,lat,halfM){ const r=Math.PI/180, mLat=110574, mLng=(111320*Math.cos(lat*r))||1;
      const dx=halfM/mLng, dy=halfM/mLat;
      return [[lng-dx,lat-dy],[lng+dx,lat-dy],[lng+dx,lat+dy],[lng-dx,lat+dy],[lng-dx,lat-dy]]; }
    function refreshPlanes3D(list){
      if(!map||!map.getSource(PLANE3D_SRC)) return;
      const mpp=_mppCentre(), off=_groundOffset();
      const half=Math.max(60, 13*mpp);                 /* never smaller than ~26 px across */
      const post=Math.max(6, 1.1*mpp);                 /* the hairline down to the ground */
      const thick=Math.max(30, 2.2*mpp);               /* give the glyph body so it is not a zero-height sheet */
      const feats=[];
      for(const d of list){
        if(d.lng==null||d.lat==null) continue;
        const alt=d.onGround?0:Math.max(0,(d.geoAlt!=null?d.geoAlt:(d.baroAlt!=null?d.baroAlt:0))-off);
        const props={ type:d.type, alt, top:alt+thick, sel:(d.icao24&&d.icao24===selectedPlane)?1:0, callsign:d.callsign||'', icao24:d.icao24||'', reg:d.reg||'',
          acType:d.acType||'', desc:d.desc||'', baroAlt:(d.baroAlt!=null?d.baroAlt:null), geoAlt:(d.geoAlt!=null?d.geoAlt:null),
          vel:(d.vel!=null?d.vel:null), heading:(d.heading!=null?d.heading:0), vrate:(d.vrate!=null?d.vrate:null),
          squawk:d.squawk||'', onGround:!!d.onGround, lastContact:(d.lastContact||0), category:(d.category!=null?d.category:null) };
        feats.push({ type:'Feature', geometry:{type:'Polygon',coordinates:[planeRing(d.lng,d.lat,d.heading,half)]}, properties:props });
        if(!d.onGround&&alt>0) feats.push({ type:'Feature', geometry:{type:'Polygon',coordinates:[squareRing(d.lng,d.lat,post)]},
          properties:{ type:d.type, alt:0, top:alt, post:1 } });
      }
      try{ map.getSource(PLANE3D_SRC).setData({type:'FeatureCollection',features:feats}); }catch(_){}
      /* what was actually handed over, kept here rather than read back out of the renderer: MapLibre 5 does
         not expose a GeoJSON source's data, and a reader that guessed at its internals reported "0 features"
         while the screen was full of aircraft. */
      _planes3DStats={ features:feats.length,
        lifted:feats.filter(f=>!f.properties.post&&(+f.properties.alt||0)>0).length,
        maxAlt:Math.round(feats.reduce((m2,f)=>(!f.properties.post&&+f.properties.alt>m2)?+f.properties.alt:m2,0)),
        offsetM:Math.round(off) };
    }
    function planes3DOn(){ return planes3D; }
    function setPlanes3D(v){ planes3D=!!v; try{ localStorage.setItem('intmap_planes3d',planes3D?'1':'0'); }catch(_){}
      try{ const on=map.getLayer('lyr-planes')&&map.getLayoutProperty('lyr-planes','visibility')==='visible';
        const on3=map.getLayer(PLANE3D_LYR)&&map.getLayoutProperty(PLANE3D_LYR,'visibility')==='visible';
        if(on||on3) applyPlanesMode(true); }catch(_){}
      return planes3D; }
    /* One representation at a time — the flat glyph and the lifted body are the same aircraft. */
    function applyPlanesMode(visible){
      try{ if(map.getLayer('lyr-planes')) map.setLayoutProperty('lyr-planes','visibility',(visible&&!planes3D)?'visible':'none');
        if(map.getLayer(PLANE3D_LYR)) map.setLayoutProperty(PLANE3D_LYR,'visibility',(visible&&planes3D)?'visible':'none');
        if(map.getLayer(PLANE3D_POST)) map.setLayoutProperty(PLANE3D_POST,'visibility',(visible&&planes3D)?'visible':'none');
      }catch(_){}
      if(!visible) selectPlane(null);            /* (#R173) the layer went off — the track goes with it */
      else drawTrack(selectedPlane);             /* …and it follows the flat/3-D switch */
      if(visible&&planes3D) refreshTrafficLayer('planes');
    }
    function refreshTrafficLayer(id){
      if(!map) return;
      const filt=trafficFilters[id];
      const src=map.getSource('src-'+id); if(!src) return;
      const data=id==='planes'?planesData:shipsData;
      const filtered=filt==='all'?data:data.filter(d=>d.type===filt);
      if(id==='planes') refreshPlanes3D(filtered);   /* (#R172) the lifted bodies ride the same filter */
      const features=filtered.map(d=>{
        const props = id==='planes'
          ? { type:d.type, sel:(d.icao24&&d.icao24===selectedPlane)?1:0, callsign:d.callsign||'', icao24:d.icao24||'', reg:d.reg||'', acType:d.acType||'', desc:d.desc||'',
              baroAlt:(d.baroAlt!=null?d.baroAlt:null), geoAlt:(d.geoAlt!=null?d.geoAlt:null),
              vel:(d.vel!=null?d.vel:null), heading:(d.heading!=null?d.heading:0), vrate:(d.vrate!=null?d.vrate:null),
              squawk:d.squawk||'', onGround:!!d.onGround, lastContact:(d.lastContact||d.tpos||0), category:(d.category!=null?d.category:null) }
          : { type:d.type, name:d.name||'', callsign:d.callsign||'', mmsi:(d.mmsi!=null?d.mmsi:null),
              vel:(d.speed!=null?d.speed:null), cog:(d.cog!=null?d.cog:null), heading:(d.heading!=null?d.heading:0),
              navStatus:(d.navStatus!=null?d.navStatus:null), shipType:(d.shipType!=null?d.shipType:null),
              dest:d.dest||'', draught:(d.draught!=null?d.draught:null), imo:(d.imo!=null?d.imo:null), t:(d.t||0) };
        return { type:'Feature', geometry:{type:'Point',coordinates:[d.lng,d.lat]}, properties:props };
      });
      src.setData({type:'FeatureCollection',features});
    }
    /* Plane glyphs (top-view silhouette) generated on a canvas, one per class, so we can color +
       rotate them by heading. Pointing "up" = heading 0; MapLibre icon-rotate is clockwise-from-north. */
    function ensurePlaneIcons(){
      if(!map) return;
      const make=(color)=>{
        const s=44, cv=document.createElement('canvas'); cv.width=s; cv.height=s;
        const ctx=cv.getContext('2d'); ctx.translate(s/2,s/2);
        ctx.fillStyle=color; ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=1.6; ctx.lineJoin='round';
        const P=[[0,-19],[2.2,-6],[2.2,-3],[17,5],[17,9],[2.2,4.5],[2.2,12],[6,16],[6,18],[0,15.5],[-6,18],[-6,16],[-2.2,12],[-2.2,4.5],[-17,9],[-17,5],[-2.2,-3],[-2.2,-6]];
        ctx.beginPath(); P.forEach((p,i)=> i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
        return ctx.getImageData(0,0,s,s);
      };
      try{ if(!map.hasImage('plane-civ')) map.addImage('plane-civ',make('#1e90ff')); }catch(_){}
      try{ if(!map.hasImage('plane-mil')) map.addImage('plane-mil',make('#ff3b30')); }catch(_){}
      try{ if(!map.hasImage('plane-sel')) map.addImage('plane-sel',make('#ffd23f')); }catch(_){}   /* (#R173) the clicked aircraft */
    }
    function fmtClock(ms){ try{ return new Date(ms).toLocaleTimeString(HOST.lang==='jp'?'ja-JP':'en-US'); }catch(_){ return ''; } }
    function agoStr(sec){ if(!sec) return ''; const s=Math.max(0,Math.round(Date.now()/1000-sec));
      const U=HOST.lang==='jp'?['秒前','分前','時間前']:HOST.lang==='de'?['s her','min her','h her']:HOST.lang==='ru'?['с назад','мин назад','ч назад']:HOST.lang==='es'?['s atrás','min atrás','h atrás']:['s ago','m ago','h ago'];
      const sep=(HOST.lang==='jp')?'':' ';
      if(s<60) return s+sep+U[0]; if(s<3600) return Math.floor(s/60)+sep+U[1]; return Math.floor(s/3600)+sep+U[2]; }
    function trafficTooltipHTML(id,p){
      const jp=HOST.lang==='jp';
      const row=(label,val)=>val!==''&&val!=null?`<div style="font-size:11px;margin-top:2px;"><span style="color:var(--text-muted);">${label}:</span> ${val}</div>`:'';
      const typeChip=`<div style="font-size:11px;margin-top:4px;color:${p.type==='military'?'var(--info-mil)':'var(--info-energy)'};font-weight:600;">${p.type==='military'?(jp?'軍用':'Military'):(jp?'民間':'Civilian')}</div>`;
      if(id==='ships'){
        const nm=escapeHtml(p.name||'')||('MMSI '+(p.mmsi||'—'));
        const spd=p.vel!=null?(Math.round(p.vel*10)/10)+' kn'+(p.vel?` · ${Math.round(p.vel*1.852)} km/h`:''):'';
        return `<div style="font-weight:700;font-size:13px;">🚢 ${nm}</div>`+
          row(jp?'種別':'Type',shipTypeLabel(p.shipType))+
          row('MMSI',p.mmsi)+
          row(jp?'呼出符号':'Call sign',escapeHtml(p.callsign||''))+
          (p.imo?row('IMO',p.imo):'')+
          row(jp?'速力':'Speed',spd)+
          row(jp?'針路(COG)':'Course',p.cog!=null?Math.round(p.cog)+'°':'')+
          row(jp?'船首方位':'Heading',p.heading!=null?Math.round(p.heading)+'°':'')+
          row(jp?'状態':'Status',navStatusLabel(p.navStatus))+
          row(jp?'喫水':'Draught',p.draught?p.draught+' m':'')+
          row(jp?'仕向地':'Destination',escapeHtml(p.dest||''))+
          typeChip+
          `<div style="font-size:10px;color:var(--text-muted);margin-top:5px;border-top:1px solid rgba(128,128,128,0.18);padding-top:4px;">${(jp?'最終受信':'Last seen')+' '+agoStr(Math.floor((p.t||0)/1000))}<br>aisstream.io · AIS</div>`;
      }
      /* planes — every available ADS-B field (airplanes.live) */
      const baroFt=p.baroAlt!=null?` (${Math.round(p.baroAlt*3.281)} ft)`:'';
      const velKmh=p.vel!=null?` · ${Math.round(p.vel*3.6)} km/h · ${Math.round(p.vel*1.944)} kn`:'';
      const vr=p.vrate!=null&&Math.abs(p.vrate)>=0.3?`${p.vrate>0?'▲':'▼'} ${Math.abs(p.vrate).toFixed(1)} m/s`:(p.vrate!=null?(jp?'水平飛行':'level'):'');
      const acName=p.desc||p.acType||'';
      return `<div style="font-weight:700;font-size:13px;">✈️ ${p.callsign||p.reg||p.icao24||'—'}</div>`+
        row(jp?'機体':'Aircraft',acName)+
        row(jp?'登録記号':'Reg.',p.reg)+
        row('ICAO24',p.icao24?p.icao24.toUpperCase():'')+
        row(jp?'高度(気圧)':'Altitude',p.onGround?(jp?'地上':'on ground'):(p.baroAlt!=null?Math.round(p.baroAlt)+' m'+baroFt:''))+
        row(jp?'高度(GPS)':'Geo alt',p.geoAlt!=null?Math.round(p.geoAlt)+' m':'')+
        row(jp?'対地速度':'Speed',p.vel!=null?Math.round(p.vel)+' m/s'+velKmh:'')+
        row(jp?'針路':'Track',p.heading!=null?Math.round(p.heading)+'°':'')+
        row(jp?'昇降率':'Vert. rate',vr)+
        row(jp?'スコーク':'Squawk',p.squawk)+
        typeChip+
        /* (#R173) what a click will draw, and how much of it there is. Named "observed" because that is
           exactly what it is — the fixes this browser has received, not a history we do not have. */
        (()=>{ const k=p.icao24||''; const st=trackStats(k);
          const en=`Observed track: ${st.fixes} fixes · ${st.minutes} min`;
          const ja=`観測した軌跡: ${st.fixes}点 · ${st.minutes}分`;
          const de=`Beobachtete Spur: ${st.fixes} Punkte · ${st.minutes} min`;
          const ru=`Наблюдаемый трек: ${st.fixes} точек · ${st.minutes} мин`;
          const es=`Traza observada: ${st.fixes} puntos · ${st.minutes} min`;
          const lbl=HOST.lang==='jp'?ja:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
          const tip=k===selectedPlane
            ? (HOST.lang==='jp'?'クリックで軌跡を消す':HOST.lang==='de'?'Klicken zum Ausblenden':HOST.lang==='ru'?'Нажмите, чтобы скрыть':HOST.lang==='es'?'Clic para ocultar':'Click to hide')
            : (HOST.lang==='jp'?'クリックで軌跡を表示':HOST.lang==='de'?'Klicken für die Spur':HOST.lang==='ru'?'Нажмите, чтобы показать':HOST.lang==='es'?'Clic para mostrar':'Click to show');
          return st.fixes>=2?`<div style="font-size:11px;margin-top:3px;color:#ffd23f;">${lbl} — ${tip}</div>`:''; })()+
        `<div style="font-size:10px;color:var(--text-muted);margin-top:5px;border-top:1px solid rgba(128,128,128,0.18);padding-top:4px;">${planesSynthetic?(jp?'※デモ用合成データ（実データ取得不可）':'Simulated placeholder (live feed unavailable)'):(jp?'最終受信':'Last seen')+' '+agoStr(p.lastContact)+' · '+fmtClock(planesTime)}<br>airplanes.live · ADS-B</div>`;
    }
    function setupTrafficLayer(id){
      if(map.getSource('src-'+id)) return;
      map.addSource('src-'+id,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(id==='planes'){
        ensurePlaneIcons();
        /* Aircraft = a real plane glyph rotated to its track (not a dot). */
        map.addLayer({id:'lyr-planes',type:'symbol',source:'src-planes',layout:{
          visibility:'none',
          'icon-image':['case',['==',['get','sel'],1],'plane-sel',['match',['get','type'],'military','plane-mil','plane-civ']],
          'icon-size':['interpolate',['linear'],['zoom'],2,0.4,5,0.58,9,0.78],
          'icon-rotate':['coalesce',['get','heading'],0],
          'icon-rotation-alignment':'map',
          'icon-allow-overlap':true,
          'icon-ignore-placement':true
        },paint:{'icon-opacity':opacities.planes}},beforeId);
        /* (#R172) the same aircraft, standing at their reported altitude. Two layers off one source: the
           post first so the body always draws over it. */
        if(!map.getSource(PLANE3D_SRC)) map.addSource(PLANE3D_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!map.getLayer(PLANE3D_POST)) map.addLayer({id:PLANE3D_POST,type:'fill-extrusion',source:PLANE3D_SRC,
          filter:['==',['get','post'],1], layout:{visibility:'none'},
          paint:{ 'fill-extrusion-color':['match',['get','type'],'military','#ff3b30','#1e90ff'],
            'fill-extrusion-opacity':Math.min(0.5,opacities.planes*0.5),
            'fill-extrusion-base':['get','alt'], 'fill-extrusion-height':['get','top'] }},beforeId);
        if(!map.getLayer(PLANE3D_LYR)) map.addLayer({id:PLANE3D_LYR,type:'fill-extrusion',source:PLANE3D_SRC,
          filter:['!=',['get','post'],1], layout:{visibility:'none'},
          paint:{ /* (#R173) the selected aircraft is the one whose track is drawn — say so in its colour */
            'fill-extrusion-color':['case',['==',['get','sel'],1],'#ffd23f',['match',['get','type'],'military','#ff3b30','#1e90ff']],
            'fill-extrusion-opacity':opacities.planes,
            'fill-extrusion-base':['get','alt'], 'fill-extrusion-height':['get','top'] }},beforeId);
        /* (#R173) the clicked aircraft's observed track — a flat line on the ground, and the same fixes as
           altitude ribbons for the 3-D representation. One source feeds both; only one is ever visible. */
        if(!map.getSource(TRACK_SRC)) map.addSource(TRACK_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!map.getLayer(TRACK_LINE)) map.addLayer({id:TRACK_LINE,type:'line',source:TRACK_SRC,
          filter:['==',['get','kind'],'line'], layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':'#ffd23f','line-width':['interpolate',['linear'],['zoom'],4,1.4,10,2.6],'line-opacity':0.95}},beforeId);
        if(!map.getLayer(TRACK_3D)) map.addLayer({id:TRACK_3D,type:'fill-extrusion',source:TRACK_SRC,
          filter:['==',['get','kind'],'leg'], layout:{visibility:'none'},
          paint:{'fill-extrusion-color':'#ffd23f','fill-extrusion-opacity':0.75,
            'fill-extrusion-base':['get','alt'],'fill-extrusion-height':['get','top']}},beforeId);
        /* the glyph's on-screen size is derived from the zoom, so rebuild the geometry when it changes */
        if(!_planes3DZoom){ _planes3DZoom=()=>{ if(!planes3D) return;
          if(!(map.getLayer(PLANE3D_LYR)&&map.getLayoutProperty(PLANE3D_LYR,'visibility')==='visible')) return;
          /* (#R174) the TRACK's ribbons are sized from the scale too (see drawTrack), and only the glyphs
             were being rebuilt — a track drawn at z8 kept its kilometre-wide legs all the way in. */
          clearTimeout(_planes3DZoomT); _planes3DZoomT=setTimeout(()=>{ try{ refreshTrafficLayer('planes'); }catch(_){}
            try{ if(selectedPlane) drawTrack(selectedPlane); }catch(_){} },160); };
          map.on('zoomend',_planes3DZoom); map.on('terrain',_planes3DZoom); }
      } else {
        ensureShipIcons();
        /* Ships = a ship glyph rotated to heading/COG (real AIS). */
        map.addLayer({id:'lyr-ships',type:'symbol',source:'src-ships',layout:{
          visibility:'none',
          'icon-image':['match',['get','type'],'military','ship-mil','ship-civ'],
          'icon-size':['interpolate',['linear'],['zoom'],4,0.5,8,0.72,12,0.95],
          'icon-rotate':['coalesce',['get','heading'],0],
          'icon-rotation-alignment':'map',
          'icon-allow-overlap':true,'icon-ignore-placement':true
        },paint:{'icon-opacity':opacities.ships}},beforeId);
      }
      /* Hover tooltip via shared map-tooltip — shows every available field + data freshness. */
      map.on('mouseenter','lyr-'+id,(e)=>{ if(!e.features.length)return; map.getCanvas().style.cursor='pointer'; const f=e.features[0]; const el=ensureMapTooltip(); el.style.display='block'; el.innerHTML=trafficTooltipHTML(id,f.properties); positionTooltip(map.project(f.geometry.coordinates)); });
      map.on('mousemove','lyr-'+id,(e)=>{ positionTooltip(e.point); });
      map.on('mouseleave','lyr-'+id,()=>{ map.getCanvas().style.cursor=''; if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
      /* (#R172) the lifted bodies answer the same hover — the aircraft is the same aircraft whichever way
         it is drawn, so the tooltip is the identical one (it is fed from the same ADS-B properties).
         (#R173) …and the same CLICK. Both representations, and the post under a lifted aircraft, select it
         and draw its track; clicking the map anywhere else clears the selection. */
      if(id==='planes'){
        [PLANE3D_LYR,PLANE3D_POST].forEach(ly=>{
          map.on('mouseenter',ly,(e)=>{ if(!e.features.length)return; map.getCanvas().style.cursor='pointer';
            const f=e.features[0]; const el=ensureMapTooltip(); el.style.display='block'; el.innerHTML=trafficTooltipHTML('planes',f.properties); positionTooltip(e.point); });
          map.on('mousemove',ly,(e)=>{ positionTooltip(e.point); });
          map.on('mouseleave',ly,()=>{ map.getCanvas().style.cursor=''; if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
        });

        /* The pick above, wired to the pointer: hovering a lifted aircraft shows the same tooltip and
           clicking it selects it, wherever on screen it is drawn. A click that hits neither the pick nor
           the footprint clears the selection — asked of the renderer rather than of a flag set by the layer
           handlers, so it does not depend on which listener MapLibre calls first. */
        if(!_planesHover){ _planesHover=(e)=>{
          if(!planes3D||!(map.getLayer(PLANE3D_LYR)&&map.getLayoutProperty(PLANE3D_LYR,'visibility')==='visible')) return;
          /* one pick per frame at most: a pointer emits far more moves than the screen has frames, and the
             pick walks every aircraft in the viewport (hundreds over a busy sky). */
          const _t=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
          if(_t-_pickAt<16) return; _pickAt=_t;
          const d=pickPlane(e.point);
          if(d){ map.getCanvas().style.cursor='pointer'; const el=ensureMapTooltip(); el.style.display='block';
            el.innerHTML=trafficTooltipHTML('planes',{ type:d.type, sel:(d.icao24===selectedPlane)?1:0, callsign:d.callsign||'', icao24:d.icao24||'', reg:d.reg||'',
              acType:d.acType||'', desc:d.desc||'', baroAlt:d.baroAlt, geoAlt:d.geoAlt, vel:d.vel, heading:d.heading,
              vrate:d.vrate, squawk:d.squawk||'', onGround:!!d.onGround, lastContact:(d.lastContact||0) });
            positionTooltip(e.point); _pickHover=true; }
          else if(_pickHover){ _pickHover=false; map.getCanvas().style.cursor='';
            try{ if(map.queryRenderedFeatures(e.point,{layers:[PLANE3D_LYR,PLANE3D_POST].filter(l=>map.getLayer(l))}).length) return; }catch(_){}
            if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; }
        }; map.on('mousemove',_planesHover); }
        /* ONE click handler, deliberately. It began as two — a layer-scoped one for the renderer's own
           footprint hit and a map-level one for the pick — and each of them TOGGLED, so a click that
           satisfied both selected the aircraft and immediately deselected it. Caught on production with
           41 real aircraft: the pick found the aeroplane, the click reported nothing selected. One
           handler, one decision: the pick first (that is where the aeroplane is drawn), then the
           renderer's footprint (the post and the flat glyph are real things to click at), else clear. */
        /* (#R174) 「Live air traffic でズームインすると、軌跡が消える」 — REPRODUCED, and it was this handler.
           Double-click IS how you zoom in on a map, and MapLibre delivers a double-click as two ordinary
           `click` events before its own `dblclick`. Both of them landed here, found no aircraft under the
           pointer, and cleared the selection — so the track vanished the instant the zoom began. Measured
           against a stubbed feed: wheel zoom z11 → z12.9 kept the selection and its 6 legs; one
           double-click at the same spot left `selected: null, legs: 0`.
           Two guards, and neither of them touches the zoom gesture:
             · the SECOND click of a double-click (originalEvent.detail ≥ 2) is ignored outright — it would
               otherwise also toggle OFF an aircraft that the first click had just selected;
             · clearing is DEFERRED past MapLibre's double-click window and cancelled by `dblclick`, so a
               click on empty map still deselects, one frame later than before.
           Selecting stays instantaneous: a click that actually hits an aeroplane is never deferred. */
        if(!_planesDbl){ _planesDbl=()=>{ if(_planesClearT){ clearTimeout(_planesClearT); _planesClearT=null; } };
          map.on('dblclick',_planesDbl); }
        if(!_planesClear){ _planesClear=(e)=>{
          try{ if(e&&e.originalEvent&&(e.originalEvent.detail|0)>=2) return; }catch(_){}
          let d=pickPlane(e.point), props=null;
          if(!d){ try{ const ls=['lyr-planes',PLANE3D_LYR,PLANE3D_POST].filter(l=>map.getLayer(l));
              const f=ls.length?map.queryRenderedFeatures(e.point,{layers:ls}):[];
              if(f&&f.length){ props=f[0].properties||{}; d=planesData.find(x=>x.icao24===(props.icao24||''))||null; } }catch(_){} }
          if(d&&d.icao24){
            if(_planesClearT){ clearTimeout(_planesClearT); _planesClearT=null; }
            selectPlane(d.icao24===selectedPlane?null:d.icao24);
            if(selectedPlane){ const el=ensureMapTooltip(); el.style.display='block';
              el.innerHTML=trafficTooltipHTML('planes',props||{ type:d.type, sel:1, callsign:d.callsign||'', icao24:d.icao24||'',
                reg:d.reg||'', acType:d.acType||'', desc:d.desc||'', baroAlt:d.baroAlt, geoAlt:d.geoAlt, vel:d.vel,
                heading:d.heading, vrate:d.vrate, squawk:d.squawk||'', onGround:!!d.onGround, lastContact:(d.lastContact||0) });
              positionTooltip(e.point); }
            return; }
          if(selectedPlane&&!_planesClearT) _planesClearT=setTimeout(()=>{ _planesClearT=null; if(selectedPlane) selectPlane(null); },320);
        }; map.on('click',_planesClear); }
      }
    }
    function startTraffic(id){
      setupTrafficLayer(id);
      setVis('lyr-'+id,true);
      if(id==='planes'){
        applyPlanesMode(true);   /* (#R172) flat glyphs OR lifted bodies — never both */
        fetchPlanes();
        if(planesTimer) clearInterval(planesTimer);
        planesTimer=setInterval(fetchPlanes,20000); /* live ADS-B refresh */
        /* follow the viewport: refetch real aircraft for wherever the user pans/zooms */
        if(!_planesMove){ _planesMove=()=>{ if(planesLayerOn()){ clearTimeout(_planesMoveT); _planesMoveT=setTimeout(()=>{ if(Date.now()-_lastPlaneFetch>1500) fetchPlanes(); },700); } }; map.on('moveend',_planesMove); map.on('zoom',updatePlanesZoomHint); }
        updatePlanesZoomHint();
      } else {
        startShips();
        /* viewport-follow: reconnect AIS for wherever the user pans (when zoomed in enough) */
        if(!_aisMove){ _aisMove=()=>{ if(map.getLayer('lyr-ships')&&map.getLayoutProperty('lyr-ships','visibility')==='visible'){ updateShipsZoomHint(); if(aisKey&&map.getZoom()>=SHIPS_MIN_ZOOM){ clearTimeout(_aisMoveT); _aisMoveT=setTimeout(connectAIS,1500); } else { stopAIS(); shipsByMMSI={}; shipsData=[]; refreshTrafficLayer('ships'); } } }; map.on('moveend',_aisMove); map.on('zoom',updateShipsZoomHint); }
        updateShipsZoomHint();
      }
    }
    function stopTraffic(id){
      setVis('lyr-'+id,false);
      if(id==='planes'){ applyPlanesMode(false); if(planesTimer){ clearInterval(planesTimer); planesTimer=null; } updatePlanesZoomHint(); }
      if(id==='ships'){ if(shipsTimer){ clearInterval(shipsTimer); shipsTimer=null; } stopAIS(); updateShipsZoomHint(); }
    }
    /* === EEZ via MarineRegions WMS === */
    /* (#R79g) The MarineRegions default style colours each boundary TYPE (200 NM / 12 NM / treaty / median /
       court / joint / unilateral / disputed / baselines / connection) but in DIM near-black tones that were
       unreadable over the ocean. The fix is NOT to flatten them to one colour (that destroyed the whole point
       of the layer) — it is to recolour EACH type to a BRIGHT, distinct line via an inline SLD (filter on the
       `line_type` attribute; verified against the live WMS). This same table drives the legend below, so the
       swatches always match exactly. Dash patterns are kept so baseline/unsettled variants stay distinguishable. */
    const EEZ_STYLE=[
      ['200 NM','#39FF6A',1.8,''],['12 NM','#12E3D6',1.8,''],['Treaty','#4D8BFF',1.8,''],
      ['Median line','#B6FF3A',1.7,''],['Court ruling','#FFC21A',1.8,''],['Joint regime','#FF9E3D',1.8,''],
      ['Unilateral claim (undisputed)','#E64DFF',1.8,''],
      ['Unsettled (maritime)','#FF4D4D',1.9,'10 5'],['Unsettled (land)','#FF4D4D',1.9,'3 3'],
      ['Unsettled median line (maritime)','#FF7A3D',1.9,'10 5'],['Unsettled median line (land)','#FF7A3D',1.9,'3 3'],
      ['Straight baseline','#B9C4CE',1.5,''],['Normal baseline (official)','#E6ECF2',1.5,'9 5'],
      ['Archipelagic baseline','#E6ECF2',1.5,'1 5'],['Connection line','#C8D0D8',1.1,'']
    ];
    function addEEZ(){
      if(map.getSource('src-eez')) return;
      const _x=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const rules=EEZ_STYLE.map(r=>'<Rule><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>line_type</ogc:PropertyName><ogc:Literal>'+_x(r[0])+'</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter><LineSymbolizer><Stroke><CssParameter name="stroke">'+r[1]+'</CssParameter><CssParameter name="stroke-width">'+r[2]+'</CssParameter><CssParameter name="stroke-opacity">1</CssParameter>'+(r[3]?('<CssParameter name="stroke-dasharray">'+r[3]+'</CssParameter>'):'')+'</Stroke></LineSymbolizer></Rule>').join('');
      const sld='<?xml version="1.0" encoding="UTF-8"?><StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>eez_boundaries</Name><UserStyle><FeatureTypeStyle>'+rules+'</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>';
      const wms='https://geo.vliz.be/geoserver/MarineRegions/wms?service=WMS&version=1.1.1&request=GetMap&layers=eez_boundaries&SLD_BODY='+encodeURIComponent(sld)+'&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&format=image/png&transparent=true';
      map.addSource('src-eez',{type:'raster',tiles:[wms],tileSize:256});
      map.addLayer({id:'lyr-eez',type:'raster',source:'src-eez',layout:{visibility:'none'},paint:{'raster-opacity':opacities.eez}},beforeId);
    }
    /* === Submarine cables (#36) — TeleGeography "Submarine Cable Map" open data ===
       Their public API serves all cable routes + landing points as GeoJSON; each cable
       carries its own color. Loaded lazily with the same CORS-proxy fallbacks used elsewhere. */
    let _subcablesLoading=false;
    async function fetchSubcables(){
      const cableUrl='https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
      const lpUrl='https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
      const proxies=[ x=>x, x=>`https://corsproxy.io/?url=${encodeURIComponent(x)}`, x=>`https://api.allorigins.win/raw?url=${encodeURIComponent(x)}`, x=>`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(x)}` ];
      async function grab(u){ for(const mk of proxies){ try{ const r=await fetch(mk(u)); if(!r.ok) continue; const j=await r.json(); if(j&&j.features) return j; }catch(_){} } return null; }
      const [cab,lp]=await Promise.all([grab(cableUrl),grab(lpUrl)]);
      return {cab,lp};
    }
    function addSubcables(){
      if(map.getLayer('lyr-subcables')){ setVis('lyr-subcables',true); setVis('lyr-subcables-glow',true); setVis('lyr-subcables-pts',true); return; }
      if(_subcablesLoading) return; _subcablesLoading=true;
      fetchSubcables().then(({cab,lp})=>{
        _subcablesLoading=false;
        if(!cab){ const cb=document.getElementById('dl-subcables'); if(cb){ cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on'); } try{ satToast(HOST.lang==='jp'?'海底ケーブルデータを取得できませんでした':HOST.lang==='de'?'Seekabel-Daten nicht verfügbar':HOST.lang==='ru'?'Данные о подводных кабелях недоступны':HOST.lang==='es'?'Datos de cables submarinos no disponibles':'Submarine cable data unavailable'); }catch(_){} return; }
        try{
          if(!map.getSource('src-subcables')) map.addSource('src-subcables',{type:'geojson',data:cab});
          map.addLayer({id:'lyr-subcables-glow',type:'line',source:'src-subcables',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#30b0c7'],'line-width':3.2,'line-opacity':0.20,'line-blur':3}},beforeId);
          map.addLayer({id:'lyr-subcables',type:'line',source:'src-subcables',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#30b0c7'],'line-width':['interpolate',['linear'],['zoom'],0,0.6,4,1.1,8,2],'line-opacity':opacities.subcables}},beforeId);
          if(lp){ if(!map.getSource('src-subcables-lp')) map.addSource('src-subcables-lp',{type:'geojson',data:lp});
            map.addLayer({id:'lyr-subcables-pts',type:'circle',source:'src-subcables-lp',minzoom:3,layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],3,1.6,8,3.5],'circle-color':'#ffd23f','circle-stroke-color':'#1a1a1a','circle-stroke-width':0.6,'circle-opacity':0.9}},beforeId); }
          setVis('lyr-subcables-glow',true); setVis('lyr-subcables',true); if(map.getLayer('lyr-subcables-pts')) setVis('lyr-subcables-pts',true);
        }catch(e){ console.warn('addSubcables',e); }
      });
    }
    /* === Contour lines — generated on the fly from the terrarium DEM by maplibre-contour === */
    let _mlcDem=null;
    /* (#R152) contour GRANULARITY slider — the [minor, major] metre intervals per zoom are BAKED into the vector
       tiles at source creation, so changing them means rebuilding the source. `_contourDensity` scales the base
       table (1 = default, >1 = finer/more lines by dividing the interval, <1 = coarser). The slider lives in the
       contour legend (per the R16 rule that layer controls live in the legend, never the Layers panel). */
    const _CONTOUR_BASE={ 5:[1000,4000], 6:[500,2000], 7:[500,2000], 8:[250,1000], 9:[200,1000], 10:[100,500], 11:[100,500], 12:[50,250], 13:[25,100], 14:[10,50], 15:[10,50] };
    window._contourDensity=window._contourDensity||1;
    function _contourThresholds(){ const d=Math.max(0.25,Math.min(4,+window._contourDensity||1)); const out={}; for(const z in _CONTOUR_BASE){ const b=_CONTOUR_BASE[z]; out[z]=[Math.max(1,Math.round(b[0]/d)), Math.max(2,Math.round(b[1]/d))]; } return out; }
    function _rebuildContours(){ try{ if(!map) return;
      const wasOn=map.getLayer('contour-lines') && map.getLayoutProperty('contour-lines','visibility')!=='none';
      ['contour-labels','contour-lines'].forEach(id=>{ try{ if(map.getLayer(id)) map.removeLayer(id); }catch(_){} });
      try{ if(map.getSource('contour-src')) map.removeSource('contour-src'); }catch(_){}
      addContours();
      if(wasOn){ try{ map.setLayoutProperty('contour-lines','visibility','visible'); }catch(_){} try{ map.setLayoutProperty('contour-labels','visibility','visible'); }catch(_){} }
    }catch(e){ console.warn('rebuildContours',e); } }
    window._setContourDensity=function(d){ window._contourDensity=Math.max(0.25,Math.min(4,+d||1)); _rebuildContours(); };
    function addContours(){
      if(map.getLayer('contour-lines')) return true;
      const MLC=window.mlcontour||window.maplibreContour; if(!MLC||!MLC.DemSource) return false;
      try{
        if(!_mlcDem){ _mlcDem=new MLC.DemSource({ url:'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', encoding:'terrarium', maxzoom:13, worker:true }); _mlcDem.setupMaplibre(maplibregl); }
        if(!map.getSource('contour-src')){
          map.addSource('contour-src',{ type:'vector', maxzoom:15, tiles:[ _mlcDem.contourProtocolUrl({
            /* (#R152) [minor, major] metre intervals, scaled by the user's density slider (_contourThresholds). */
            thresholds:_contourThresholds(),
            elevationKey:'ele', levelKey:'level', contourLayer:'contours' }) ] });
        }
        const dark=document.documentElement.getAttribute('data-theme')==='dark';
        map.addLayer({ id:'contour-lines', type:'line', source:'contour-src', 'source-layer':'contours', layout:{visibility:'none'},
          paint:{ 'line-color': dark?'rgba(220,180,120,0.6)':'rgba(150,100,40,0.7)', 'line-width':['match',['get','level'],1,1.3,0.55], 'line-opacity':opacities.contours } }, beforeId);
        map.addLayer({ id:'contour-labels', type:'symbol', source:'contour-src', 'source-layer':'contours', layout:{visibility:'none','symbol-placement':'line','symbol-spacing':320,'text-size':10,'text-field':['concat',['to-string',['get','ele']],' m'],'text-font':['Noto Sans Regular'],'text-allow-overlap':false},
          paint:{ 'text-color': dark?'#e8c890':'#7a5320', 'text-halo-color': dark?'rgba(0,0,0,0.7)':'rgba(255,255,255,0.8)', 'text-halo-width':1.2 } }, beforeId);
        return true;
      }catch(e){ console.warn('addContours',e); return false; }
    }
    /* === RainViewer: live precipitation radar + infrared cloud imagery, via its own
       "latest frame" API — this is genuinely real-time (refreshed every ~10 min). === */
    let _rvData=null, _rvAt=0, _rvPending=null, _rvTimer=null;
    function rvFetch(){
      if(_rvData && Date.now()-_rvAt<5*60000) return Promise.resolve(_rvData);
      if(_rvPending) return _rvPending;
      _rvPending=fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.ok?r.json():null)
        .then(j=>{ if(j){ _rvData=j; _rvAt=Date.now(); } _rvPending=null; return _rvData; })
        .catch(()=>{ _rvPending=null; return null; });
      return _rvPending;
    }
    function rvTiles(kind){
      if(!_rvData) return null;
      const host=_rvData.host||'https://tilecache.rainviewer.com';
      const frames=(kind==='radar') ? (_rvData.radar&&_rvData.radar.past) : (_rvData.satellite&&_rvData.satellite.infrared);
      if(!frames||!frames.length) return null;
      const path=frames[frames.length-1].path;  /* the most recent available frame */
      /* radar: color scheme 4 (blue→red), smoothed + snow; clouds: IR scheme 0 */
      return (kind==='radar') ? [host+path+'/256/{z}/{x}/{y}/4/1_1.png'] : [host+path+'/256/{z}/{x}/{y}/0/0_0.png'];
    }
    function addRainViewer(kind){
      const tiles=rvTiles(kind); if(!tiles) return false;
      try{ if(map.getLayer('lyr-'+kind)) map.removeLayer('lyr-'+kind); if(map.getSource('src-'+kind)) map.removeSource('src-'+kind); }catch(_){}
      addRaster(kind,tiles, kind==='radar'?12:10);
      setVis('lyr-'+kind,true);
      return true;
    }
    function rvAutoRefresh(){
      if(_rvTimer) return;
      _rvTimer=setInterval(()=>{ rvFetch().then(()=>{ ['radar','clouds'].forEach(k=>{
        if(map.getLayer('lyr-'+k)&&map.getLayoutProperty('lyr-'+k,'visibility')==='visible'){
          try{ const tiles=rvTiles(k), src=map.getSource('src-'+k); if(tiles&&src&&src.setTiles) src.setTiles(tiles); else if(tiles) addRainViewer(k); }catch(_){}
        }
      }); }); },240000);
    }
    /* === Refresh tiles for dated layers when the date selector changes === */
    function refreshDatedLayer(id){
      const date=layerDates[id]||GIBS_DATE;
      let tiles=null;
      /* NOTE: thermal is intentionally NOT here — it is a FIRMS WMS layer now (rolling time window),
         refreshed by window._refreshThermal, not by a GIBS date (#5). */
      if(id==='temp') tiles=gibs('MERRA2_2m_Air_Temperature_Monthly',6,'png',date);  /* gap-free reanalysis, monthly */
      else if(id==='precip') tiles=gibs('IMERG_Precipitation_Rate',6,'png',date+'T12:00:00Z');  /* IMERG requires a sub-daily timestamp or returns 404 */
      else if(id==='sst') tiles=gibs('GHRSST_L4_MUR_Sea_Surface_Temperature',7,'png',date);
      else if(id==='snow') tiles=gibs('MODIS_Terra_NDSI_Snow_Cover',8,'png',date);
      else if(id==='aod') tiles=gibs('MODIS_Combined_Value_Added_AOD',6,'png',date);
      if(!tiles) return;
      /* Remove and re-add the source/layer with new tiles */
      const wasVis=map.getLayer('lyr-'+id)?map.getLayoutProperty('lyr-'+id,'visibility')==='visible':false;
      if(map.getLayer('lyr-'+id)) map.removeLayer('lyr-'+id);
      if(map.getSource('src-'+id)) map.removeSource('src-'+id);
      const maxzMap={temp:6,precip:6,sst:7,snow:8,aod:6};
      addRaster(id,tiles, maxzMap[id]||6);
      if(wasVis) setVis('lyr-'+id,true);
    }
    function toggleLayer(id,on){
      if(on){
        if(id==='climate'){ addKoppen(); /* layer added async after CORS preflight; setVis once it appears */ const t0=Date.now(); (function w(){ if(map.getLayer('lyr-climate')){ setVis('lyr-climate',true); } else if(Date.now()-t0<5000){ setTimeout(w,150); } })(); legend.style.display='flex'; try{ const _f=()=>{ try{ window._fitKoppenLegend&&window._fitKoppenLegend(); }catch(_){} }; requestAnimationFrame(()=>{ requestAnimationFrame(_f); }); setTimeout(_f,120); }catch(_){} }   /* (#R147/#R148) fit legend height to content once visible — double-rAF + a timeout backstop so it runs after layout settles */
        else if(id==='temp'){
          lgdTemp.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{
            try{ addRaster('temp',gibs('MERRA2_2m_Air_Temperature_Monthly',6,'png',layerDates.temp),6); }catch(_){}
            try{ setVis('lyr-temp',true); }catch(_){}
          });
        }
        else if(id==='precip'){ whenStyleReady().then(()=>{ try{ addRaster('precip',gibs('IMERG_Precipitation_Rate',6,'png',layerDates.precip+'T12:00:00Z'),6); }catch(_){} try{ setVis('lyr-precip',true); }catch(_){} }); }
        else if(id==='thermal'){
          lgdThermal.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{ try{ addFirmsThermal(); setThermalVis(true); }catch(e){ console.warn('thermal (GIBS) fail',e); const cb=document.getElementById('dl-thermal'); if(cb){cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on');} try{ satToast(HOST.lang==='jp'?'火災データを取得できませんでした':HOST.lang==='de'?'Branddaten nicht verfügbar':HOST.lang==='ru'?'Данные о пожарах недоступны':HOST.lang==='es'?'Datos de incendios no disponibles':'Active-fire data unavailable'); }catch(_){} } });
        }
        else if(id==='radar'||id==='clouds'){
          if(id==='radar'){ lgdRadar.style.display='block'; tileLegends(); }
          whenStyleReady().then(()=>rvFetch()).then(()=>{
            if(!addRainViewer(id)){
              try{ satToast(HOST.lang==='jp'?'気象データを取得できませんでした':HOST.lang==='de'?'Wetterdaten nicht verfügbar':HOST.lang==='ru'?'Данные о погоде недоступны':HOST.lang==='es'?'Datos meteorológicos no disponibles':'Live weather data unavailable'); }catch(_){}
              const cb=document.getElementById('dl-'+id); if(cb){ cb.checked=false; const row=cb.closest('.lyr-row'); if(row) row.classList.remove('on'); }
              if(id==='radar'){ lgdRadar.style.display='none'; tileLegends(); }
              return;
            }
            rvAutoRefresh();
          });
        }
        else if(id==='sst'){
          lgdSST.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{ try{ addRaster('sst',gibs('GHRSST_L4_MUR_Sea_Surface_Temperature',7,'png',layerDates.sst),7); }catch(_){} try{ setVis('lyr-sst',true); }catch(_){} });
        }
        else if(id==='snow'){ lgdSnow.style.display='block'; tileLegends(); whenStyleReady().then(()=>{ try{ addRaster('snow',gibs('MODIS_Terra_NDSI_Snow_Cover',8,'png',layerDates.snow),8); }catch(_){} try{ setVis('lyr-snow',true); }catch(_){} }); }
        else if(id==='aod'){ lgdAod.style.display='block'; tileLegends(); whenStyleReady().then(()=>{ try{ addRaster('aod',gibs('MODIS_Combined_Value_Added_AOD',6,'png',layerDates.aod),6); }catch(_){} try{ setVis('lyr-aod',true); }catch(_){} }); }
        /* Night-time satellite (#R9/#39) — VIIRS "Black Marble" city-lights composite via NASA GIBS. */
        else if(id==='nightsat'){ lgdNightsat.style.display='block'; tileLegends(); whenStyleReady().then(()=>{ try{ addRaster('nightsat',gibs('VIIRS_Black_Marble',8,'png','2016-01-01'),8); }catch(_){} try{ setVis('lyr-nightsat',true); }catch(_){} }); }
        else if(id==='popgrid'){
          lgdPopGrid.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{ try{ addRaster('popgrid',gibsStatic('GPW_Population_Density_2020',7,'png'),7); }catch(_){} try{ setVis('lyr-popgrid',true); }catch(_){} });
        }
        else if(id==='wind'){ try{ const l=document.getElementById('data-legend-wind'); if(l){ l.style.display='block'; tileLegends(); window._updateWindLegend&&window._updateWindLegend(); } window.Wind&&window.Wind.toggle(true); }catch(_){} }
        else if(id==='relief'){
          /* Color elevation relief (#5) — MapLibre v5 color-relief over the DEM, hypsometric tint. */
          whenStyleReady().then(()=>{ try{
            ensureTerrainSource();
            if(!map.getLayer('lyr-relief')){
              map.addLayer({id:'lyr-relief',type:'color-relief',source:'terrain-dem',layout:{visibility:'none'},paint:{'color-relief-opacity':opacities.relief,
                'color-relief-color':['interpolate',['linear'],['elevation'],
                  -8000,'#062c5a',-4000,'#0b4f8a',-1000,'#2a78b8',-100,'#7fb3d9',-1,'#cfe6f5',
                  0,'#1a7a3c',150,'#4fae5b',500,'#a6d96a',1000,'#e6e08b',1800,'#d9a066',2800,'#a87b52',3800,'#9b6b4a',4800,'#cdbfb4',6000,'#ffffff']}},beforeId);
            }
            setVis('lyr-relief',true); if(lgdRelief){ lgdRelief.style.display='block'; tileLegends(); }
          }catch(e){ console.warn('relief fail',e); const cb=document.getElementById('dl-relief'); if(cb){cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on');} try{ satToast(HOST.lang==='jp'?'カラー標高を初期化できませんでした':HOST.lang==='de'?'Farbrelief nicht verfügbar':HOST.lang==='ru'?'Цветной рельеф недоступен':HOST.lang==='es'?'Relieve en color no disponible':'Color relief unavailable'); }catch(_){} } });
        }
        else if(id==='sealevel'){
          lgdSeaLevel.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{ try{ addSeaLevel(); setVis('lyr-sealevel',true); window._refreshSeaLevel(); }catch(e){ console.warn('sealevel fail',e); const cb=document.getElementById('dl-sealevel'); if(cb){cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on');} } });
        }
        else if(id==='subcables'){ whenStyleReady().then(()=>{ try{ addSubcables(); }catch(e){ console.warn('subcables',e); } }); }
        else if(id==='hillshade'){
          whenStyleReady().then(()=>{ try{
            ensureTerrainSource();
            if(!map.getLayer('lyr-hillshade')) map.addLayer({id:'lyr-hillshade',type:'hillshade',source:'terrain-dem',layout:{visibility:'none'},paint:{'hillshade-exaggeration':0.6,'hillshade-shadow-color':'#1a2a44','hillshade-highlight-color':'#ffffff','hillshade-accent-color':'#5a6b85'}},beforeId);
            setVis('lyr-hillshade',true);
          }catch(e){ console.warn('hillshade fail',e); } });
        }
        else if(id==='contours'){
          whenStyleReady().then(()=>{ try{ if(addContours()){ setVis('contour-lines',true); setVis('contour-labels',true); } else { const cb=document.getElementById('dl-contours'); if(cb){ cb.checked=false; const row=cb.closest('.lyr-row'); if(row) row.classList.remove('on'); } try{ satToast(HOST.lang==='jp'?'等高線を初期化できませんでした':HOST.lang==='de'?'Höhenlinien konnten nicht initialisiert werden':HOST.lang==='ru'?'Не удалось инициализировать изолинии':HOST.lang==='es'?'No se pudieron iniciar las curvas de nivel':'Could not initialise contours'); }catch(_){} } }catch(e){ console.warn('contours fail',e); } });
        }
        else if(id==='eez'){
          /* Show legend immediately so user sees feedback; defer source add until style loads */
          lgdEEZ.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{
            try{ addEEZ(); }catch(e){ console.warn('addEEZ failed',e); }
            try{ setVis('lyr-eez',true); }catch(_){}
          });
        }
        else if(id==='ships'||id==='planes'){ startTraffic(id); }
        else if(id==='pop'){
          lgdPop.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('pop'); applyChoro('pop',s=>s.density); setVis('pop-fill',true); }catch(e){ console.warn('pop choro fail',e); } });
        }
        else if(id==='hdi'){
          lgdHDI.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('hdi'); applyChoro('hdi',s=>s.hdi); setVis('hdi-fill',true); }catch(e){ console.warn('hdi choro fail',e); } });
        }
        else if(id==='dem'){
          lgdDem.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('dem'); applyChoro('dem',s=>s.dem); setVis('dem-fill',true); }catch(e){ console.warn('dem choro fail',e); } });
        }
        else if(id==='milSpend'){
          lgdMil.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('milSpend'); applyChoro('milSpend',s=>s.milSpend); setVis('milSpend-fill',true); }catch(e){ console.warn('milSpend choro fail',e); } });
        }
        else if(id==='milSpendGDP'){
          lgdMilGDP.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('milSpendGDP'); applyChoro('milSpendGDP',s=>(s.milSpend!=null&&s.gdp)?s.milSpend/s.gdp*100:null); setVis('milSpendGDP-fill',true); }catch(e){ console.warn('milSpendGDP choro fail',e); } });
        }
        else if(id==='gdppc'){
          lgdGdppc.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('gdppc'); applyChoro('gdppc',s=>s.gdppc!=null?s.gdppc:null); setVis('gdppc-fill',true); }catch(e){ console.warn('gdppc choro fail',e); } });
        }
        else if(id==='tfr'){
          lgdTfr.style.display='block'; tileLegends();
          /* (#R11) Total fertility rate — fetched live from the World Bank (latest year), cached. */
          withCountries(()=>{ try{ addChoro('tfr'); setVis('tfr-fill',true);
            const apply=()=>applyChoro('tfr',s=>s.tfr!=null?s.tfr:null);
            if(window._tfrData){ apply(); }
            else { fetch('https://api.worldbank.org/v2/country/all/indicator/SP.DYN.TFRT.IN?format=json&date=2022&per_page=400').then(r=>r.json()).then(j=>{ const arr=(j&&j[1])||[]; window._tfrData={}; arr.forEach(d=>{ if(d&&d.value!=null&&d.countryiso3code){ window._tfrData[d.countryiso3code]=+d.value; if(countryStats[d.countryiso3code]) countryStats[d.countryiso3code].tfr=+d.value; } }); apply(); }).catch(()=>{ try{ imToast(HOST.lang==='jp'?'出生率データを取得できませんでした':HOST.lang==='de'?'Fruchtbarkeitsdaten nicht verfügbar':HOST.lang==='ru'?'Не удалось загрузить данные о рождаемости':HOST.lang==='es'?'No se pudieron cargar los datos de fecundidad':'Could not load fertility data'); }catch(_){} }); }
          }catch(e){ console.warn('tfr choro fail',e); } });
        }
        else if(id==='nato'){
          /* NATO members fill (#14) + accession-year time-travel control (#R25/#24); accession year +
             defense %GDP also show on hover. */
          withCountries(()=>{ try{ addNato(); applyNato(); wireNatoHover(); setNatoVis(true); natoLegend(); }catch(e){ console.warn('nato fail',e); } });
        }
        else if(id==='eu'){
          /* (#R26) EU members fill + accession-year time-travel control (mirrors NATO). */
          withCountries(()=>{ try{ addEu(); applyEu(); wireEuHover(); setEuVis(true); euLegend(); }catch(e){ console.warn('eu fail',e); } });
        }
        else if(id==='night'){ buildNight(); setVis('lyr-night',true); if(nightTimer)clearInterval(nightTimer); nightTimer=setInterval(buildNight,60000); }
        /* (#R15c) layers without a dedicated legend get a generic one (so opacity moves out of the panel) */
        { try{ const gl=ensureGenericLegend(id); if(gl){ gl.style.display='block'; tileLegends(); } }catch(_){} }
        /* (#R30) ASYNC-RACE ORPHAN GUARD — root cause of "オンになっているのにactive layersに表示されず、消せない" /
           "勝手にレイヤーがオンになる". Most layers add+show inside whenStyleReady()/poll callbacks that resolve
           LATER. If the user UNCHECKED before that resolved, the deferred setVis(true) re-showed a layer whose
           checkbox is now OFF — a visible-but-unremovable orphan (the active-layers list reads the checkbox, so
           it never lists it). Re-assert the OFF state a few times after if the box went off in the meantime.
           toggleLayer(id,false) runs the full per-id hide path, so map ⇄ checkbox ⇄ active-list stay in sync. */
        { const _dlid='dl-'+id; [600,1500,3200].forEach(ms=>setTimeout(()=>{ try{ const cb=document.getElementById(_dlid); if(cb && !cb.checked){ toggleLayer(id,false); try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){} } }catch(_){} }, ms)); }
      } else {
        if(id==='hdi'||id==='dem'||id==='pop'||id==='milSpend'||id==='milSpendGDP'||id==='gdppc'||id==='tfr'){ setVis(id+'-fill',false); }
        else if(id==='nato'){ setNatoVis(false); try{ window._hideGenericLegend&&window._hideGenericLegend('nato'); }catch(_){} }
        else if(id==='eu'){ setEuVis(false); try{ window._hideGenericLegend&&window._hideGenericLegend('eu'); }catch(_){} }
        else if(id==='ships'||id==='planes'){ stopTraffic(id); }
        else if(id==='contours'){ setVis('contour-lines',false); setVis('contour-labels',false); }
        else if(id==='wind'){ try{ window.Wind&&window.Wind.toggle(false); const l=document.getElementById('data-legend-wind'); if(l) l.style.display='none'; }catch(_){} }
        else if(id==='thermal'){ setThermalVis(false); }
        else if(id==='subcables'){ setVis('lyr-subcables',false); setVis('lyr-subcables-glow',false); setVis('lyr-subcables-pts',false); }
        else { setVis('lyr-'+id,false); }
        if(id==='climate'){ legend.style.display='none';
          /* (#R19) Phones: drop the Köppen sampling work-set (4096² canvas + pixel copies, ~150 MB)
             the moment the layer is off — it lazily rebuilds on the next toggle. A big slice of the
             "何か重い動作をすると頻繁にブラウザが落ちます" memory pressure. Desktop keeps it for instant
             re-toggle. The GPU recolor path never needs these buffers at all. */
          if(typeof isMobile==='function'&&isMobile()){
            try{ window._koppenImg=null; window._koppenCanvas=null; window._koppenReady=false; window._koppenLoadStarted=false;
                 window._koppenCodeIdx=null; window._koppenSrcData=null; window._koppenFull=null; }catch(_){}
          }
        }
        if(id==='hdi') lgdHDI.style.display='none';
        if(id==='dem') lgdDem.style.display='none';
        if(id==='pop') lgdPop.style.display='none';
        if(id==='popgrid') lgdPopGrid.style.display='none';
        if(id==='relief') lgdRelief.style.display='none';
        if(id==='sealevel') lgdSeaLevel.style.display='none';
        if(id==='eez') lgdEEZ.style.display='none';
        if(id==='temp') lgdTemp.style.display='none';
        if(id==='thermal') lgdThermal.style.display='none';
        if(id==='radar') lgdRadar.style.display='none';
        if(id==='sst') lgdSST.style.display='none';
        if(id==='gdppc') lgdGdppc.style.display='none';
        if(id==='tfr') lgdTfr.style.display='none';
        if(id==='milSpend') lgdMil.style.display='none';
        if(id==='milSpendGDP') lgdMilGDP.style.display='none';
        if(id==='snow') lgdSnow.style.display='none';
        if(id==='aod') lgdAod.style.display='none';
        if(id==='nightsat') lgdNightsat.style.display='none';
        if(GENERIC_LEG[id]){ const gl=document.getElementById('data-legend-'+id); if(gl){ gl.style.display='none'; tileLegends(); } }   /* (#R15c) */
        if((id==='radar'||id==='clouds')&&_rvTimer){ const other=(id==='radar')?'clouds':'radar';
          const otherVis=map.getLayer('lyr-'+other)&&map.getLayoutProperty('lyr-'+other,'visibility')==='visible';
          if(!otherVis){ clearInterval(_rvTimer); _rvTimer=null; } }
        tileLegends();
        if(id==='night'&&nightTimer){ clearInterval(nightTimer); nightTimer=null; }
      }
    }
    /* (#R34) GENERIC ORPHAN SWEEP — the definitive fix for "オンになっているのにactive layersに表示されず、消すこと
       もできない" / "消したレイヤーが表示されっぱなし". Any data layer whose checkbox is OFF but whose map layer is
       still VISIBLE is an orphan: the active-layers list reads the checkbox, so it never lists it → the user
       can't remove it. The dl- guard at toggle time only re-checks for ~3s and only the dl- id; this catches
       EVERY case (slow async adds, any path) by reconciling on idle. Pure hide-only + idempotent: it walks
       each dl- checkbox and, if it's unchecked yet its layer is still painted, runs the real hide path. It
       NEVER turns anything on, so it can't cause "勝手にオンになる". */
    window._sweepOrphanLayers=function(){
      if(!_canDraw()||window._imDemoActive) return;   /* (#R170) reads getStyle().layers — a parsed style suffices */
      try{
        const visSet=new Set();
        map.getStyle().layers.forEach(l=>{ try{ if((map.getLayoutProperty(l.id,'visibility')||'visible')==='visible') visSet.add(l.id); }catch(_){} });
        document.querySelectorAll('#layer-dropdown input[id^="dl-"]').forEach(cb=>{
          if(cb.checked) return; const id=cb.id.slice(3);
          /* (#R36) catch EVERY visible sub-layer of this id, not just lyr-<id>/<id>-fill: a multi-part layer
             (subcables-glow/-pts, contour-lines/-labels …) left ONE sublayer painted = still a ghost. */
          let vis = visSet.has('lyr-'+id) || visSet.has(id+'-fill') || visSet.has(id+'-line');
          if(!vis) for(const L of visSet){ if(L.indexOf('lyr-'+id+'-')===0){ vis=true; break; } }
          if(vis){ try{ toggleLayer(id,false); }catch(_){} }
        });
      }catch(_){}
    };
    try{ if(map) map.on('idle',()=>{ try{ window._sweepOrphanLayers&&window._sweepOrphanLayers(); }catch(_){} }); }catch(_){}
    /* (#R41) The orphan sweep + label-raise self-heals were driven ONLY by 'idle'. When the map is wedged
       not-idle (a tile source erroring / looping), idle never fires, so "消したはずのレイヤーが残り続ける" and
       buried labels persisted until a reload. Drive the SAME idempotent, drift-only self-heals on a slow
       heartbeat too so they recover without an idle and without a reload. Each only acts on real drift, so in
       steady state this does nothing. */
    try{ if(map){ setInterval(()=>{ try{ window._sweepOrphanLayers&&window._sweepOrphanLayers(); }catch(_){} try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} }, 2500); } }catch(_){}
    /* (#R36) UNIVERSAL async-race orphan guard for EVERY layer subsystem (main dl-, eco-dl-, beta-dl-, bx-, l9-dl-).
       The dl- toggle-time guard + the dl- idle sweep only cover the MAIN system; the eco / World-Bank / hazard
       layers add+show inside THEIR OWN async callbacks, so an ON-then-quick-OFF can re-show a layer whose box is
       now OFF ("閉じたはずのレイヤーが表示され続ける"). When ANY layer checkbox goes OFF, re-assert that OFF a few
       times by re-running the checkbox's OWN change/hide path — idempotent, never turns anything on. */
    try{ const _dd=document.getElementById('layer-dropdown'); if(_dd) _dd.addEventListener('change',(e)=>{
      const cb=e.target; if(!cb||cb.type!=='checkbox'||cb.checked||cb.__reassertGuard) return;
      /* (#R38) NEVER re-dispatch on the 7 utility toggles. They are not async-race layers, and several have
         stateful handlers (cb-grid's setGrid; borders/roads/rail have their OWN multi-retry re-assert) — a
         re-dispatched change here is what flipped Grid back ON ("何度消しても自動的にチェックされる"). */
      if(['cb-names','cb-geolabels','cb-borders','cb-grid','cb-countries','cb-admin1','cb-roads','cb-rail2'].includes(cb.id)) return;
      [500,1400,3000].forEach(ms=>setTimeout(()=>{ try{ if(cb.checked||!cb.isConnected) return; cb.__reassertGuard=1; cb.dispatchEvent(new Event('change',{bubbles:true})); cb.__reassertGuard=0; }catch(_){ try{cb.__reassertGuard=0;}catch(__){} } },ms));
    }); }catch(_){}
    /* Expose for the lyr-row dt-/ft- handlers above */
    window.refreshDatedLayer=refreshDatedLayer;
    window.refreshTrafficLayer=refreshTrafficLayer;
    /* (#R172) aircraft altitude rendering — Atlas + the tests drive it through this, never through the layer ids */
    window.IntMapPlanes3D={ isOn:planes3DOn, set:setPlanes3D,
      /* (#R173) the clicked aircraft's track, also reachable by callsign / registration / ICAO24 so Atlas
         and the tests drive exactly what a click drives (#R82: everything is operable from Atlas). */
      select:selectPlane, selected:()=>selectedPlane, track:k=>((planeTracks[k||selectedPlane]||[]).slice()),
      /* diagnostics for the pick: where an aircraft is DRAWN, and which one a screen point would select */
      screenPos:k=>{ const d=planesData.find(x=>x.icao24===k); if(!d) return null;
        const E=window.IntMapGeoEngine, pa=E&&E.coords&&E.coords.projectAltitude; if(!pa) return null;
        const off=_groundOffset(), alt=d.onGround?0:Math.max(0,(d.geoAlt!=null?d.geoAlt:(d.baroAlt!=null?d.baroAlt:0))-off);
        return pa([d.lng,d.lat],alt); },
      pickAt:pt=>{ const d=pickPlane(pt); return d?d.icao24:null; },
      trackStats:k=>trackStats(k||selectedPlane),
      find:q=>{ const s2=String(q||'').trim().toUpperCase(); if(!s2) return null;
        const hit=planesData.find(d=>(d.icao24||'').toUpperCase()===s2)
          ||planesData.find(d=>(d.callsign||'').trim().toUpperCase()===s2)
          ||planesData.find(d=>(d.reg||'').toUpperCase()===s2)
          ||planesData.find(d=>((d.callsign||'')+' '+(d.reg||'')).toUpperCase().indexOf(s2)>=0);
        return hit?hit.icao24:null; },
      state:()=>{ const s2=_planes3DStats;
        return { on:planes3DOn(), planes:planesData.length, features:s2.features, lifted:s2.lifted, maxAlt:s2.maxAlt, groundOffsetM:s2.offsetM,
          visible:(()=>{ try{ return !!(map.getLayer(PLANE3D_LYR)&&map.getLayoutProperty(PLANE3D_LYR,'visibility')==='visible'); }catch(_){ return false; } })(),
          flatVisible:(()=>{ try{ return !!(map.getLayer('lyr-planes')&&map.getLayoutProperty('lyr-planes','visibility')==='visible'); }catch(_){ return false; } })(),
          selected:selectedPlane, tracked:Object.keys(planeTracks).length, track:trackStats(selectedPlane),
          trackVisible:(()=>{ try{ const l=planes3D?TRACK_3D:TRACK_LINE; return !!(map.getLayer(l)&&map.getLayoutProperty(l,'visibility')==='visible'); }catch(_){ return false; } })(),
          synthetic:planesSynthetic }; } };
    /* Unified time slider (#8): drive the day-based weather layers from the global news date.
       GIBS imagery lags ~2 days, so clamp future-ish dates back to the freshest processed day. */
    window.setGlobalLayerDate=function(iso){
      const maxIso=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
      let d = iso || maxIso; if(d>maxIso) d=maxIso;
      ['sst','snow','aod','thermal','precip'].forEach(id=>{
        layerDates[id]=d;
        const dp=document.getElementById('dt-'+id); if(dp) dp.value=d;
        if(map.getLayer('lyr-'+id) && map.getLayoutProperty('lyr-'+id,'visibility')==='visible') refreshDatedLayer(id);
      });
      try{ _refreshLegendDates(); }catch(_){}
    };
    window._trafficFilters=trafficFilters;
    function setLayerOpacity(id,v){ opacities[id]=v;
      if(id==='hdi'||id==='dem'||id==='pop'||id==='milSpend'||id==='milSpendGDP'||id==='gdppc'||id==='tfr'){
        /* Keep no-data countries gray (0.45) — see addChoro for the "<= 0" reasoning. */
        if(map.getLayer(id+'-fill')) map.setPaintProperty(id+'-fill','fill-opacity',['case',['<=',['to-number',['feature-state',id],0],0],Math.max(0,v*0.75),v]);
      }
      else if(id==='nato'){ if(map.getLayer('nato-fill'))map.setPaintProperty('nato-fill','fill-opacity',v); }
      else if(id==='eu'){ if(map.getLayer('eu-fill'))map.setPaintProperty('eu-fill','fill-opacity',v); }
      else if(id==='night'){ if(map.getLayer('lyr-night'))map.setPaintProperty('lyr-night','fill-opacity',v); }
      else if(id==='planes'){ if(map.getLayer('lyr-planes'))map.setPaintProperty('lyr-planes','icon-opacity',v);
        /* (#R172) the lifted bodies follow the same opacity slider; the posts stay fainter than the aircraft */
        try{ if(map.getLayer(PLANE3D_LYR))map.setPaintProperty(PLANE3D_LYR,'fill-extrusion-opacity',v);
          if(map.getLayer(PLANE3D_POST))map.setPaintProperty(PLANE3D_POST,'fill-extrusion-opacity',Math.min(0.5,v*0.5)); }catch(_){} }
      else if(id==='ships'){ if(map.getLayer('lyr-ships'))map.setPaintProperty('lyr-ships','icon-opacity',v); }
      else if(id==='hillshade'){ if(map.getLayer('lyr-hillshade'))map.setPaintProperty('lyr-hillshade','hillshade-exaggeration',Math.max(0.05,v)); }
      else if(id==='contours'){ if(map.getLayer('contour-lines'))map.setPaintProperty('contour-lines','line-opacity',v); if(map.getLayer('contour-labels'))map.setPaintProperty('contour-labels','text-opacity',v); }
      else if(id==='relief'){ if(map.getLayer('lyr-relief'))map.setPaintProperty('lyr-relief','color-relief-opacity',v); }
      else if(id==='sealevel'){ if(map.getLayer('lyr-sealevel'))map.setPaintProperty('lyr-sealevel','color-relief-opacity',v); }
      else if(id==='wind'){ const wc=document.getElementById('wind-canvas'); if(wc) wc.style.opacity=Math.min(1,0.5+v*0.5); try{ window.Wind&&window.Wind.setOpacity&&window.Wind.setOpacity(v*0.82); }catch(_){} }   /* (#R8b) particle alpha barely dims; slider mainly drives the geo-anchored speed-field raster */
      else if(id==='subcables'){ if(map.getLayer('lyr-subcables'))map.setPaintProperty('lyr-subcables','line-opacity',v); }
      else if(id==='thermal'){ try{ window._setThermalOpacity(v); }catch(_){} }
      else if(window._opacityTargets&&window._opacityTargets[id]){ _applyGenericOpacity(window._opacityTargets[id],v); }
      else { if(map.getLayer('lyr-'+id))map.setPaintProperty('lyr-'+id,'raster-opacity',v); }
    }
    /* ===== (#R19) Opacity for EVERY layer ("どのレイヤーも透明度選択ができるように") =====
       A type-aware setter + a registry mapping a legend id → its MapLibre layer ids. Any module can call
       window._registerLayerOpacity(id,[en,jp],layerIds,cbId) on toggle-ON: it gets a floating generic
       legend whose auto opacity row drives all its layers; _hideGenericLegend(id) on toggle-OFF. */
    window._opacityTargets=window._opacityTargets||{};
    const _OP_PROP={fill:'fill-opacity',line:'line-opacity',raster:'raster-opacity',circle:'circle-opacity',heatmap:'heatmap-opacity','fill-extrusion':'fill-extrusion-opacity',hillshade:'hillshade-exaggeration','color-relief':'color-relief-opacity'};
    function _applyGenericOpacity(ids,v){ (ids||[]).forEach(lid=>{ try{ const L=map.getLayer(lid); if(!L) return;
      if(L.type==='symbol'){ try{ map.setPaintProperty(lid,'icon-opacity',v); }catch(_){} try{ map.setPaintProperty(lid,'text-opacity',v); }catch(_){} return; }
      const p=_OP_PROP[L.type]; if(!p) return;
      map.setPaintProperty(lid,p,(p==='hillshade-exaggeration')?Math.max(0.05,v):v); }catch(_){} }); }
    window._applyGenericOpacity=_applyGenericOpacity;
    window._registerLayerOpacity=function(id,namesEnJp,layerIds,cbId){ try{
      /* (#R20) per-layer defaults: tectonic plates start at 30% per request. */
      if(opacities[id]==null) opacities[id]=((id==='plates'||id==='eco-plates')?0.30:(id==='worldcover'?1:(id==='tz'?0.5:0.85)));   /* (#R40) Land cover 100%; (#R79c) Time zones default 50% */
      window._opacityTargets[id]=layerIds||[];
      /* (#R74) feed the layer-state audit: remember which REAL style layers belong to this checkbox */
      try{ if(cbId&&layerIds&&layerIds.length){ (window._imAuditReg=window._imAuditReg||{})[cbId]=layerIds.slice(); } }catch(_){}
      const el=ensureGenericLegend(id,namesEnJp,cbId);
      if(el){ el.style.display='block'; try{ ensureLegendOpacity(el); }catch(_){} try{ ensureContourDensity(el); }catch(_){} try{ ensureLegendMinimize(el); }catch(_){} try{ tileLegends(); }catch(_){} }
      /* apply the registered default immediately so the layer paints at it (was: slider showed the
         default but the layer kept its hard-coded paint until first slider move) */
      try{ setTimeout(()=>{ try{ setLayerOpacity(id,opacities[id]); }catch(_){} },120); }catch(_){}
      return el; }catch(_){ return null; } };
    window._hideGenericLegend=function(id){ const el=document.getElementById('data-legend-'+id); if(el) el.style.display='none'; try{ tileLegends(); }catch(_){} };
    /* (#R108/#R109) re-localize every VISIBLE data-layer legend on a language change ("言語設定を変更したとき、すでに
       表示済みのレイヤーの凡例はその言語に切り替わらない"). ROOT CAUSE of the R108 miss: the common legends are
       DEDICATED `.data-legend` built once by makeLegend (NOT `.generic-legend`), so the old selector matched nothing.
       Now: generic legends re-render via ensureGenericLegend (title + description from GENERIC_LEG); dedicated legends
       get their <h4> title refreshed from the layer's CURRENT localized checkbox-label name (which updateI18n/the
       modules already re-localize). */
    window.addEventListener('intmap-lang',()=>{ setTimeout(()=>{ try{
      const _cleanName=(cb)=>{ try{ const lab=cb&&(cb.closest('label')||cb.closest('.lyr-row')); if(!lab) return ''; const sp=lab.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label')||lab.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb):not(.dl-drag)'); let s=(sp?sp.textContent:lab.textContent)||''; return s.replace(/\s+/g,' ').trim(); }catch(_){ return ''; } };
      document.querySelectorAll('.data-legend').forEach(el=>{ try{ if(!el||getComputedStyle(el).display==='none') return;
        const id=(el.id||'').replace(/^data-legend-/,''); if(!id) return;
        if(el.classList.contains('generic-legend')&&GENERIC_LEG[id]){ ensureGenericLegend(id); return; }   /* generic → curated multi-lang title + desc */
        const h4=el.querySelector('h4'); if(!h4) return;                                                    /* dedicated → localized layer name from its checkbox */
        const cb=document.getElementById('dl-'+id)||document.getElementById('cb-'+id)||document.getElementById(id);
        const nm=_cleanName(cb); if(nm) h4.textContent=nm;
      }catch(_){} });
    }catch(_){} },40); });
    /* (#R74) LAYER-STATE AUDIT ("レイヤーのオンオフが実情と対応していないことがある" / vision §16-17):
       a background reconciler that compares every layer CHECKBOX against the map's REAL style layers.
       Two mismatch directions, both observed in the wild:
         (a) box checked but nothing painted (source failed silently / a style swap wiped the layer and
             nothing re-added it) → after two consecutive detections the toggle is re-fired once (off→on,
             the same self-heal a human would do), at most once per 4 min per layer;
         (b) box unchecked but the layer is still visible (an engine's off-path missed it) → the stray
             style layers are hidden directly.
       Coverage: a static table for the classic dl-* engine + every layer that registers through
       _registerLayerOpacity (gx-*, bx-*, NATO/EU, webcams, heat, …). Canvas overlays (wind) and
       zoom-gated live traffic are intentionally excluded (their emptiness is legitimate).
       Diagnostics: window.IntMapLayerAudit.{run,check,log} — Atlas reads check() for honest state. */
    window._imAuditReg=window._imAuditReg||{};
    /* (#R81) AUTO-LEARN layer ownership so the reconciler covers EVERY layer, not only the hand-maintained
       tables. Empirically only 31 of 129 checkboxes were audit-covered — the rest (World-Bank, GIBS, ECMWF,
       geo-theory, NATO/EU, …) had NO "checked-but-blank" self-heal, so an occasional wipe left the box ON with
       nothing painted and nothing corrected it (the residual "レイヤーのオンオフと実態が乖離" the user still hit).
       On every toggle-ON we diff the style's layer list to learn which real layer ids that checkbox added and
       feed them to the SAME reconciler. STRICTLY additive + safe: the learned ids are used ONLY for the
       "checked-but-blank" (direction-a) heal — a harmless idempotent re-fire of the box's OWN change handler —
       NEVER to hide a layer (hiding stays with the id-table path + _sweepOrphanLayers), so a mis-attribution can
       at worst cause a needless re-fire of the correct checkbox, never hide the wrong layer. Attribution is
       skipped whenever another checkbox toggles during the capture window (ambiguous → conservative miss, which
       is safe: it just falls back to today's behaviour). */
    window._imLayerOwn=window._imLayerOwn||{};
    (function(){
      if(typeof map==='undefined'||!map||!map.on) return;
      const SKIP=/^(ofm-|country-|borders-|ref-|gl-|background$|land$|water$|waterway|admin|place-|poi-|road|bridge|tunnel|building|boundary|natural|landcover|landuse|coastline|sat$|layer-sat|nlq-|pl-outline|tool-|measure|radius|user-pin|news-|hl-|highlight|iso-mask|contour-label|imcmp-|imrad-|imroute-|sv-cov-|wind-field)/;   /* (#R84) exclude Atlas overlay layers + the wind colour-field from checkbox ownership learning */
      const snap=()=>{ const s=new Set(); try{ (map.getStyle().layers||[]).forEach(l=>s.add(l.id)); }catch(_){} return s; };
      let _seq=0;
      function learn(cbId){ const mine=++_seq; const before=snap();
        [500,1800,4000].forEach(ms=>setTimeout(()=>{ try{
          if(mine!==_seq) return;                 /* another checkbox toggled since → ambiguous window, skip */
          const cb=document.getElementById(cbId); if(!cb||!cb.checked) return;
          const now=snap(), own=window._imLayerOwn[cbId]=window._imLayerOwn[cbId]||new Set();
          now.forEach(id=>{ if(before.has(id)||SKIP.test(id)) return;
            for(const k in window._imLayerOwn){ if(k!==cbId&&window._imLayerOwn[k]&&window._imLayerOwn[k].has(id)) return; }   /* first owner keeps it — never steal */
            own.add(id); });
        }catch(_){} },ms)); }
      try{ const dd=document.getElementById('layer-dropdown'); if(dd) dd.addEventListener('change',e=>{ const cb=e.target; if(cb&&cb.type==='checkbox'&&cb.id){ if(cb.checked) learn(cb.id); else _seq++; } }); }catch(_){}
    })();
    (function(){
      const STATIC={
        'dl-climate':['lyr-climate'],'dl-temp':['lyr-temp'],'dl-precip':['lyr-precip'],'dl-sst':['lyr-sst'],
        'dl-snow':['lyr-snow'],'dl-aod':['lyr-aod'],'dl-nightsat':['lyr-nightsat'],'dl-popgrid':['lyr-popgrid'],
        'dl-relief':['lyr-relief'],'dl-hillshade':['lyr-hillshade'],'dl-sealevel':['lyr-sealevel'],
        'dl-eez':['lyr-eez'],'dl-night':['lyr-night'],'dl-radar':['lyr-radar'],
        'dl-contours':['contour-lines','contour-labels'],
        'dl-subcables':['lyr-subcables','lyr-subcables-glow','lyr-subcables-pts'],
        'dl-thermal':['lyr-thermal','lyr-thermal-1','lyr-thermal-2','lyr-thermal-3'],
        'dl-pop':['pop-fill'],'dl-hdi':['hdi-fill'],'dl-dem':['dem-fill'],'dl-gdppc':['gdppc-fill'],
        'dl-tfr':['tfr-fill'],'dl-milSpend':['milSpend-fill'],'dl-milSpendGDP':['milSpendGDP-fill']
      };
      /* (#R79) the base VECTOR toggles were never audited (idsFor returned null) — yet they are the most
         VISIBLE layers of all: default-on country borders, place names, water labels, state lines. Those are
         exactly the ones a user notices when the checkbox says ON but the map shows nothing. Cover them with
         the same reconciler. Their change handlers are idempotent + retry-hardened (ensurePlaceLabels /
         ensureBordersLayer / ensureRefLayers / applyCountryVisibility), so the heal is a single gentle
         re-fire of the change event (see BASE branch below) — no off→on flicker of the whole label stack. */
      const BASE={
        'cb-names':['ofm-country','ofm-city','ofm-other'],
        'cb-geolabels':['ofm-water','ofm-water2','ofm-river','ofm-peak','geo-sea'],
        'cb-borders':['borders-only-line'],'cb-countries':['country-fill'],
        'cb-admin1':['ref-admin1'],'cb-roads':['ref-roads'],'cb-rail2':['ref-rail']
      };
      const sus={}, healed={}, log=[];
      /* (#R85) NEVER FIGHT THE USER. The checked-but-blank heal pulses a layer off→on to force a re-add; the
         old 2nd half re-checked the box UNCONDITIONALLY, so if the user turned a layer OFF inside the 420 ms
         window it snapped back ON — the "オフにしてるレイヤーが勝手につく" the user still hit on desktop. Now every
         SYNTHETIC dispatch is tagged (cb.__syn) and every GENUINE user toggle is timestamped (cb.__userChangeT,
         via the capture listener below); the re-arm aborts if the user touched the box, and the audit skips any
         box the user toggled in the last 4 s. Purely additive: it can only DECLINE to act, never turn extra on. */
      const RECENT_USER=4000;
      const userTouched=cb=>{ try{ return !!cb.__userChangeT && (Date.now()-cb.__userChangeT)<RECENT_USER; }catch(_){ return false; } };
      const fireSyn=cb=>{ try{ cb.__syn=(cb.__syn||0)+1; }catch(_){} try{ cb.dispatchEvent(new Event('change',{bubbles:true})); }finally{ try{ cb.__syn=Math.max(0,(cb.__syn||1)-1); }catch(_){} } };
      function rearm(cb){ const t0=Date.now();
        try{ cb.checked=false; fireSyn(cb); }catch(_){}
        setTimeout(()=>{ try{ if(cb.__userChangeT&&cb.__userChangeT>t0) return;   /* user intervened during the pulse → respect their choice */
          if(!cb.checked){ cb.checked=true; fireSyn(cb); } }catch(_){} },420); }
      try{ document.addEventListener('change',e=>{ const cb=e.target; try{ if(cb&&cb.type==='checkbox'&&!cb.__syn&&!cb.__reassertGuard&&cb.closest&&cb.closest('#layer-dropdown')) cb.__userChangeT=Date.now(); }catch(_){} },true); }catch(_){}
      const idsFor=cbId=>STATIC[cbId]||BASE[cbId]||window._imAuditReg[cbId]||null;
      function painted(ids){ try{ for(const lid of ids){ if(map.getLayer(lid)&&map.getLayoutProperty(lid,'visibility')!=='none') return true; } }catch(_){} return false; }
      function check(cbId){ let ids=idsFor(cbId); if(!ids||!ids.length){ const own=window._imLayerOwn&&window._imLayerOwn[cbId]; ids=(own&&own.size)?Array.from(own):null; } if(!ids||!ids.length) return null; return painted(ids); }
      /* (#R81) direction-(a) heal for AUTO-LEARNED layers (those with no id-table entry). Checked-but-blank only —
         the exact same 2-hit debounce + 4-min cooldown + idempotent off→on re-fire the id-table path uses. Never
         hides anything (that path stays with the id tables + _sweepOrphanLayers), so learned ids can't mis-hide. */
      /* (#R81) layers whose emptiness is LEGITIMATE (live traffic is zoom-gated / may have no data; wind is a
         canvas) or whose handler is stateful (grid — see #R38) must NOT be re-fired by the learned-heal. Base
         vector toggles never reach here (they are in the BASE id-table). */
      const _LEARN_SKIP=/^(dl-ships|dl-planes|dl-wind|cb-grid)$/;
      /* (#R154) a layer id is owned by exactly ONE checkbox (learn code above never steals), but guard anyway: don't hide
         a learned-owned layer that a DIFFERENT *checked* layer also paints/owns — so an OFF-hide can never mis-hide. */
      function _ownedByCheckedOther(cbId,lid){ try{
          for(const k in window._imLayerOwn){ if(k!==cbId&&window._imLayerOwn[k]&&window._imLayerOwn[k].has(lid)){ const o=document.getElementById(k); if(o&&o.checked) return true; } }
          const boxes=document.querySelectorAll('#layer-dropdown input[type=checkbox]');
          for(let i=0;i<boxes.length;i++){ const o=boxes[i]; if(o.id===cbId||!o.checked) continue; const ids=idsFor(o.id); if(ids&&ids.indexOf(lid)>=0) return true; }
        }catch(_){} return false; }
      /* (#R154) the `!cb.checked` bail here was the "オフにしたレイヤーが表示されてしまう" root cause: for an AUTO-LEARNED
         layer (no id-table entry) toggleLayer(id,false) can't know its layer ids, so it stays painted, and NO reconciler
         hid it (the id-table hide branch never sees it; _sweepOrphanLayers only covers dl-* standard names). Now both
         directions are handled: OFF + still-painted owned layers → hide them (minus any a checked sibling legitimately owns). */
      function _auditLearned(cb){ try{ if(_LEARN_SKIP.test(cb.id)||userTouched(cb)) { sus[cb.id]=0; return; }
        const own=window._imLayerOwn&&window._imLayerOwn[cb.id]; if(!own||!own.size) return;
        const ownArr=Array.from(own);
        if(!cb.checked){
          if(painted(ownArr)){ const safe=ownArr.filter(lid=>!_ownedByCheckedOther(cb.id,lid));
            if(safe.length){ log.push({id:cb.id,t:Date.now(),fix:'hide-learned'}); if(log.length>60) log.shift();
              safe.forEach(lid=>{ try{ if(map.getLayer(lid)) map.setLayoutProperty(lid,'visibility','none'); }catch(_){} }); } }
          sus[cb.id]=0; return; }
        if(painted(ownArr)){ sus[cb.id]=0; return; }
        sus[cb.id]=(sus[cb.id]||0)+1;
        if(sus[cb.id]>=2&&(!healed[cb.id]||Date.now()-healed[cb.id]>240000)){ healed[cb.id]=Date.now(); sus[cb.id]=0;
          log.push({id:cb.id,t:Date.now(),fix:'rearm-learned'}); if(log.length>60) log.shift();
          rearm(cb); } }catch(_){} }
      function audit(){ try{
        /* (#R170) was gated on isStyleLoaded() — false ~86% of the time while browsing, so the self-heal that
           exists precisely to fix "box on, nothing painted" was itself mostly asleep. It reads getLayer() +
           visibility, which need only a parsed style. */
        if(!_canDraw()) return;
        document.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach(cb=>{ const ids=idsFor(cb.id); if(!ids||!ids.length){ _auditLearned(cb); return; }
          if(userTouched(cb)){ sus[cb.id]=0; return; }   /* (#R85) defer to a very recent user toggle — never race it */
          const vis=painted(ids);
          if(cb.checked&&!vis){ sus[cb.id]=(sus[cb.id]||0)+1;
            if(sus[cb.id]>=2&&(!healed[cb.id]||Date.now()-healed[cb.id]>240000)){ healed[cb.id]=Date.now(); sus[cb.id]=0;
              log.push({id:cb.id,t:Date.now(),fix:'rearm'}); if(log.length>60) log.shift();
              if(BASE[cb.id]){ /* base vector layer: idempotent handler → ONE gentle re-fire, no label flicker */
                fireSyn(cb); }
              else { rearm(cb); } } }
          else if(!cb.checked&&vis){ log.push({id:cb.id,t:Date.now(),fix:'hide'}); if(log.length>60) log.shift();
            ids.forEach(lid=>{ try{ if(map.getLayer(lid)) map.setLayoutProperty(lid,'visibility','none'); }catch(_){} }); sus[cb.id]=0; }
          else sus[cb.id]=0; });
      }catch(_){} }
      /* (#R108) periodic audit runs a bit sooner + more often (25s→12s start, 15s→10s cadence) so a checked-but-blank
         layer self-corrects faster ("選択状況と表示状況があっていない"); heal thresholds/cooldown unchanged (safe). */
      setTimeout(()=>{ setInterval(()=>{ if(!document.hidden) audit(); },10000); },12000);
      /* (#R109) TARGETED post-toggle heal — the moment a USER turns a layer ON, check ~2.8 s later whether its layers
         actually painted; if not (and they haven't re-toggled it), re-fire ONCE right away instead of waiting for the
         2-hit background audit. Directly attacks "選択状況と表示状況が合っていない" for a freshly-toggled layer, using
         the SAME cooldown + skip list so it can never fight the user. */
      try{ document.addEventListener('change',e=>{ const cb=e.target;
        try{ if(!(cb&&cb.type==='checkbox'&&!cb.__syn&&cb.checked&&cb.closest&&cb.closest('#layer-dropdown'))) return; if(_LEARN_SKIP.test(cb.id)) return;
          const t0=Date.now(); setTimeout(()=>{ try{ if(!cb.checked) return; if(cb.__userChangeT&&cb.__userChangeT>t0) return;   /* user re-toggled → respect it */
            let ids=idsFor(cb.id); if(!ids||!ids.length){ const own=window._imLayerOwn&&window._imLayerOwn[cb.id]; ids=(own&&own.size)?Array.from(own):null; } if(!ids||!ids.length) return;
            if(painted(ids)) return; if(healed[cb.id]&&Date.now()-healed[cb.id]<240000) return; healed[cb.id]=Date.now();
            log.push({id:cb.id,t:Date.now(),fix:'toggle-heal'}); if(log.length>60) log.shift();
            if(BASE[cb.id]) fireSyn(cb); else rearm(cb); }catch(_){} },2800);
        }catch(_){} },true); }catch(_){}
      /* (#R79) The audit was RIGHT but too SLOW: on a 15s cadence a checked-but-blank layer (source failed,
         or a base-map/style swap wiped the overlay and nothing re-added it) stayed visibly wrong for up to
         ~30s — that latency IS the "レイヤーのオンオフが実情と対応していないことがある" the user still notices.
         Trigger the SAME audit() (same thresholds, same 2-hit debounce, same 4-min heal cooldown) shortly
         after the map SETTLES (idle → every engine's styledata re-add has run) and when the tab regains
         focus (a background wipe otherwise waited out the whole 15s). So real desyncs now self-heal in a
         couple of seconds instead of half a minute — no new heal logic, just more trigger points. */
      try{ let _st=null; const soon=()=>{ clearTimeout(_st); _st=setTimeout(()=>{ if(!document.hidden) audit(); },1200); };
        if(map&&map.on){ map.on('idle',soon); }
        document.addEventListener('visibilitychange',()=>{ if(!document.hidden) soon(); }); }catch(_){}
      window.IntMapLayerAudit={run:audit,check,log:()=>log.slice(-20)};
    })();
  })();
};
