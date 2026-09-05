/* ============================================================================
 *  IntMap · UI STRINGS — German (Deutsch)   (#R221)
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
window.IntMapLang.define('de', { ui: {
      /* ══ ⚠⚠⚠ (#R249) THE FIFTEENTH SURFACE — THE DOCUMENT'S OWN METADATA ═══════════════════════
         「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。」
         index.html's <title> and <meta name="description"> were literals in the markup, so the
         browser tab, the bookmark and every shared link said 「Explore the world. Ask the map.」 in
         all nine languages — while every instrument printed 100 %, because no instrument looked at
         the document itself. sources.html and science.html had localised both since #R239
         (js/page-i18n.js), which is what made the gap invisible: the mechanism existed and the
         application page simply never used it. scripts/i18n-doc-audit.mjs is the gate that stops a
         sixteenth one being forgotten. */
      docTitle:"IntMap — Die Welt erkunden. Die Karte fragen.",
      docDesc:"IntMap ist eine interaktive Weltkarte zur Erkundung von Geografie, Klima, Geschichte, Bevölkerung, Weltgeschehen und mehr – mit natürlichsprachlicher Steuerung durch Atlas.",

      /* ══ (#R240) THE SIXTH SURFACE — title / aria-label / placeholder, which had no key at all
         and were therefore English in every language however complete this table looked. See
         scripts/i18n-attr-audit.mjs, the gate that now measures «is this string in the system».  */
      ttl3dTerrain:"3D-Gelände",
      ttlCompass:"Kompass",
      ttlVol3d:"Ein maßstabsgetreues 3-D-Volumen in die Luft zeichnen",
      ttlDrawTrace:"Freihand zeichnen & nachzeichnen",
      accGraphite:"Graphit",
      accGreen:"Grün",
      accIndigo:"Indigo",
      accOrange:"Orange",
      accPink:"Rosa",
      accPurple:"Violett",
      accRed:"Rot",
      accTeal:"Türkis",
      ttlGridLabels:"Gitter + Beschriftungen",
      ttlMapLayers:"Karte & Ebenen",
      ttlMapOptions:"Kartenoptionen",
      ttlMapTools:"Kartenwerkzeuge",
      ttlMeasureDA:"Entfernung / Fläche messen",
      ttlMeasureTools:"Messwerkzeuge",
      ttlMyLocation:"Mein Standort",
      ttlObjects:"Objekte",
      ttlRemove:"Entfernen",
      ttlResetNorth:"Nach Norden ausrichten",
      ttlResetBearing:"Ausrichtung zurücksetzen",
      ttlSearchNews:"Suchen, wenn das Feld Text enthält, sonst mit den aktuellen Nachrichteneinstellungen neu laden",
      phPostBody:"Beobachtung, Frage oder These teilen …",
      phPostTitle:"Titel",
      ttlToggleSidebar:"Seitenleiste ein-/ausblenden",
      ttlTools:"Werkzeuge",
      phAisKey:"aisstream.io-API-Schlüssel",
      lnkTerms:"Nutzungsbedingungen", lnkPrivacy:"Datenschutzerklärung", legalTabTerms:"Bedingungen", legalTabPrivacy:"Datenschutz", commAddImage:"Bild hinzufügen",
      tabNews:"Nachrichten", tabCompanies:"Unternehmen", tabStats:"Länder", 
      searchPh:"Nachrichten / Orte suchen...", filterCountriesPh:"Länder filtern...", filterCompaniesPh:"Unternehmen filtern...", evCatsAria:"Ereigniskategorien", pickCountryMap:"Land auf der Karte wählen", searchBtn:"Suchen", searchLoadBtn:"Suchen / Laden", msPh:"Beliebigen Ort auf der Erde suchen...",
      viewMap:"Karte", viewSat:"Satellit", flat:"Flach", globe:"Globus", threeD:"⛰️ 3D", gridBtn:"🌐 Gitter", gridLayer:"🌐 Gitter & Beschriftung",
      settings:"Einstellungen", modalTitle:"Einstellungen", close:"Schließen", btnApply:"Übernehmen", lblLang:"Sprache",
      setSecAppearance:"Aussehen", setSecLayout:"Layout & Panels", setSecMap:"Kartenverhalten", setSecUnits:"Einheiten & Zeit", setSecNews:"Nachrichten & Ticker", setSecAI:"KI", setSecKeys:"Integrationen & Schlüssel", setSecAbout:"Info & Support",
      lblTheme:"Darstellung", optAuto:"Systemstandard", optLight:"Hell", optDark:"Dunkel", 
      lblMapColor:"Kartenfarbe", mapColorAuto:"Wie Darstellung", mapColorLight:"Hell (weiß)", mapColorDark:"Dunkel (schwarz)",
      tabDocked:"Fenster", lblDockPanels:"Legenden und Werkzeugfenster", dockPanelsOff:"Auf der Karte (Standard)", dockPanelsOn:"In einem Seitenleisten-Tab gesammelt", dockPanelsHint:"Jede Legende, Anzeige und jedes Werkzeugfenster wandert in den Tab „Fenster“ der linken Seitenleiste, damit die Karte frei bleibt. Popups, die an einem angeklickten Ort hängen, bleiben auf der Karte.",
      lblUnits:"Maßeinheiten", unitBoth:"Metrisch + Imperial", unitMetric:"Nur metrisch", unitImperial:"Nur imperial",
      lblTempUnit:"Temperatur", tempBoth:"°C + °F", tempC:"Nur °C", tempF:"Nur °F",
      lblTz:"Zeitzone", tzSearch:"Zeitzone suchen…", optLocal:"Lokal (Systemstandard)",
      lblNewsLang:"Nachrichtensprachen", newsLangUi:"Nur aktuelle Sprache", newsLangMultiSel:"Mehrere Sprachen…", newsLangMulti:"Alle Sprachen (Titel automatisch übersetzen)", newsLangHint:"Schlagzeilen aller Sprachen erscheinen gemeinsam; mit einem KI-Schlüssel werden die Titel automatisch übersetzt.",
      lblSidebarStyle:"Seitenleiste", sidebarOpaque:"Solide (Standard)", sidebarTranslucent:"Mattglas", sidebarGlass2:"Mattglas (transparenter)",
      lblLabelLang:"Ortsbeschriftungen", labelLangUi:"Wie App-Sprache", labelLangLocal:"Lokale Sprache (Originalschrift)", labelLangEn:"Immer Englisch",
      /* (#R180) Render-Engine */
      lblEngine:"Karten-Engine", engineMapLibre:"MapLibre — 2-D/3-D-Karte (Vorgabe)", engineCesium:"Cesium — echter 3-D-Globus mit realem Gelände",
      engineHint:"Cesium stellt die Erde in jedem Zoom als echtes Ellipsoid dar, mit denselben Satellitenbildern und denselben Höhendaten. Sie wird nur bei Auswahl heruntergeladen, und der Wechsel lädt die Seite neu. Höhenlinien und das geschlossene 3-D-Körper-Werkzeug bleiben MapLibre vorbehalten.",
      engineSwitching:"Engine wird gewechselt — neu laden…", engineFellBack:"Cesium konnte nicht starten, diese Sitzung läuft daher mit MapLibre.",
      engineActive:"Aktiv: ",
      /* (#R171) Neigungsgrenze + Kamerahöhe */
      lblTiltLimit:"Neigungsgrenze der Karte", tiltStandard:"Standard — bis 78° (Vorgabe)", tiltUnlimited:"Unbegrenzt — der volle Bereich 0–180°",
      tiltHint:"Unbegrenzt lässt die Karte über den Horizont hinaus kippen, bis die Kamera senkrecht nach oben blickt. Jenseits von 180° wiederholt sich die Ansicht mit umgekehrter Blickrichtung — per Rechtsklick auf den Kompass lässt sich jeder Winkel von 0 bis 360 eingeben.",
      lblEyeAlt:"Kamerahöhe in der Anzeige", eyeAltOff:"Aus (Vorgabe)", eyeAltOn:"An — Höhe des Blickpunkts zeigen", lblNightSide:"Tag-/Nachtschattierung", nightSideOn:"An (Vorgabe) — Nachtseite abdunkeln & Stadtlichter zeigen", nightSideOff:"Aus — gleichmäßig beleuchteter Globus",
      lblNavSens:"Navigationsempfindlichkeit", lblNavZoom:"Zoom", lblNavPan:"Schwenken",
      satKeysTitle:"Satellitenbilder (BYOK)", satKeyHint:"Geben Sie einen API-Schlüssel ein, um diese Anbieter im Satelliten-Panel freizuschalten. Schlüssel werden nur in diesem Browser gespeichert.",
      aisKeyLabel:"Live-Schiffsverkehr (AISstream-Schlüssel)", aisKeyHint:"Optional. Live-Schiffe funktionieren auch ohne Schlüssel über einen gemeinsamen Feed. Ein eigener kostenloser Schlüssel von aisstream.io streamt die ganze Welt direkt in diesen Browser, etwas aktueller. Wird nur in diesem Browser gespeichert.",
      aiSecTitle:"KI-Funktionen", aiSecHint:"Integrierte KI — nach der Anmeldung kostenlos nutzbar (bis zu 10×/Tag). Kein API-Schlüssel erforderlich.",
      blueberryBtn:"Unterstützen", borders:"Ländergrenzen", coastline:"Küsten- & Uferlinien", countries:"Länder (Info)", placeNames:"Ortsnamen", geoLabels:"Gewässer- & Geländenamen", adminBounds:"Bundesland-/Provinzgrenzen", roadsLayer:"Straßen", railLayer:"Eisenbahnen", favLayers:"Favoriten",
      measureMenuBtn:"Messen", measureDistBtn:"📏 Distanz / Fläche", drawBtn:"✏️ Zeichnen", vol3dBtn:"🧊 3-D-Volumen", radiusBtn:"⭕ Radius", objectsBtn:"🗂 Objekte", mScreenshot:"Karten-Screenshot", shareMenuBtn:"Teilen", shareLinkBtn:"Teilen / Link", screenshotBtn:"Karten-Screenshot (blendet Bedienelemente aus, behält Legenden)", layersBtn:"Ebenen ▾", uploadGeoJSON:"GeoJSON hochladen",
      lblDataSources:"Datenquellen", lblScience:"Wissenschaft & Logik", viewScience:"Wie jede Simulation rechnet ↗", viewSourcesPage:"Datenquellen-Seite öffnen ↗", lblNewsCountries:"Nachrichten-Länder", newsCountriesHint:"Lassen Sie das Feld leer für weltweite Nachrichten.",
      lyrGrpGeo:"Strategische Geografie", lyrGrpOthers:"Beta", lyrGrpOthersReal:"Weitere",
      filtCiv:"Zivil", filtMil:"Militär", filtAll:"Alle", thermWin24:"Letzte 24 Std", thermWin48:"Letzte 48 Std", thermWin72:"Letzte 72 Std",
      tlMachine:"Chronos", 
      aiTranslateTitles:"Titel übersetzen", 
      /* (#R37) full DE coverage — the 184 keys that were falling back to English (measure/stats/community/AI/satellite/context). */
      loading:"Artikel werden geladen...", noMatch:"Keine Ergebnisse gefunden.", networkError:"Nachrichten konnten nicht geladen werden. Erneuter Versuch…", emptyHint:"Kein Tab ausgewählt — die Karte ist frei.<br>Wählen Sie oben einen Tab, um Inhalte anzuzeigen.",
      dashCatMil:"Militärbasen", dashCatTech:"Technik / Cyber", dashCatMar:"Maritim / Engpässe", dashCatGeo:"Geo / Klima", readWiki:"Auf Wikipedia lesen ↗",
      measure:"Messen", areaTool:"Fläche", radius:"Radius", vol3dTool:"3-D-Volumen", points:"Punkte", total:"Gesamt", perimeter:"Umfang", area:"Fläche", clear:"Löschen", undoPt:"Punkt zurück",
      radiusHint:"Klicken Sie auf die Karte, um einen Kreis zu platzieren. Mehrere Kreise möglich.", removeAll:"Alle löschen", color:"Farbe",
      statPop:"Bevölkerung", statGdp:"BIP (nominal)", statGdpPc:"BIP pro Kopf", statGdpPPP:"BIP (KKP)", statGdpPcPPP:"BIP pro Kopf (KKP)", statArea:"Fläche", statDensity:"Bevölkerungsdichte", statRegion:"Region", statCapital:"Hauptstadt", statCurrency:"Währung", statLang:"Sprachen", statHDI:"HDI", statDem:"Demokratie-Index", statMil:"Militärausgaben", statLife:"Lebenserwartung", statInet:"Internetnutzer",
      details:"Details ↗", loadingData:"Länderdaten werden geladen...", dataNA:"k. A.", noData:"Länderdaten nicht verfügbar.",
      sortGdp:"BIP", sortPop:"Bev.", sortArea:"Fläche", sortName:"A–Z", sortHDI:"HDI", sortMil:"Mil.$", elev:"Höhe", bearing:"Peilung", presetNone:"— wählen —", presetLbl:"Bereichsvorgaben", opacity:"Deckkraft", circumference:"Umfang",
      spType:"Typ", 
      ctxDropPin:"Pin setzen", ctxMeasureFrom:"Messung beginnen", ctxPostHere:"In der Community posten", ctxDistFrom:"Entfernung vom vorherigen Pin", ctxCopy:"Koordinaten kopieren", ctxClearPins:"Alle Pins entfernen", ctxThisPoint:"Dieser Punkt", coords:"Koordinaten", depth:"Tiefe", climate:"Klima",
      lyrEEZ:"Meeres-AWZ / 12 sm", lyrShips:"Live-Schiffsverkehr", lyrPlanes:"Live-Flugverkehr", lyrSats:"Live-Satelliten", lyrThermal:"Wärmeanomalien (Brände)", planesZoomHint:"Hineinzoomen, um Live-Flugzeuge zu laden", planesAreaHint:"Hineinzoomen — Live-Flugzeuge decken den mittleren Bereich dieser Ansicht ab", poiLabels:"Orte, Betriebe & Einrichtungen", shipsZoomHint:"Hineinzoomen, um Live-Schiffe zu laden", aisNoKey:"Live-Schiffe sind gerade nicht verfügbar — der gemeinsame Feed hat nicht geantwortet.", trafficFilter:"Filter", lyrTime:"Ebenen-Datum",
      commAdd:"+ Neuer Beitrag", commTitle:"Titel", commBody:"Teilen Sie eine Beobachtung, Frage oder Theorie...", commPost:"Posten", commCancel:"Abbrechen", commEmpty:"Noch keine Beiträge. Klicken Sie auf \"+ Neuer Beitrag\", um die Diskussion zu starten.", commLocate:"Auf Karte zeigen", commDelete:"Löschen", commReply:"Antworten", commWrite:"Kommentar schreiben...", commPostNew:"Neuer Beitrag", commPlacedAt:"Platziert bei", commSortHot:"Angesagt", commSortNew:"Neu", commSortTop:"Top", commSearchPh:"Beiträge suchen…", commInView:"Im Sichtfeld", commCat:"Kategorie", commCatAll:"Alle", commEdit:"Bearbeiten", commEdited:"bearbeitet", commEditPost:"Beitrag bearbeiten", commSaveEdit:"Änderungen speichern", commNoMatch:"Keine Beiträge entsprechen Ihren Filtern.",
      compare:"Vergleichen", compareEmpty:"Länderzeilen antippen zum Auswählen und Vergleichen.", coCompareEmpty:"Unternehmenszeilen antippen zum Auswählen und Vergleichen.", compareView:"Vergleich anzeigen", compareClear:"Löschen", back:"Zurück", deletePin:"Löschen",
      satCtrlTitle:"Satellitenbilder", satProvider:"Anbieter", satDate:"Aufnahmedatum", satLatest:"Neueste verfügbar", satMosaicSuffix:"wolkenloses Mosaik", satLocked:"API-Schlüssel hinzufügen", satPrevDay:"Vorheriger Tag", satNextDay:"Nächster Tag", satKeyConnected:"Verbunden", satKeyNone:"Kein Schlüssel", satErrAuth:"{provider}: Authentifizierung fehlgeschlagen — API-Schlüssel prüfen", satErrTiles:"{provider}: Bilder nicht verfügbar — auf Ersatz umgeschaltet",
      aiProvider:"KI-Anbieter", aiNoKey:"Fügen Sie zuerst einen KI-API-Schlüssel unter Einstellungen → KI-Funktionen hinzu.", aiNoVision:"Dieses Modell kann keine Bilder lesen. Wählen Sie GPT-4o, Claude 3.5 Sonnet oder Gemini 1.5 Pro.", aiThinking:"KI analysiert…", aiError:"KI-Anfrage fehlgeschlagen", aiCopy:"Kopieren", aiCopied:"Kopiert ✓", aiClose:"Schließen", aiRetry:"Wiederholen",
      aiTransBusy:"Übersetzen…", aiTransDone:"{n} Titel übersetzt", aiTransNone:"Titel bereits in Ihrer Sprache.", aiTranslate:"Übersetzen", aiShowOriginal:"Original", aiTransNoText:"Kein Artikeltext zum Übersetzen — versuchen Sie die Web-Ansicht.",
      aiSumBtn:"Dieses Gebiet mit KI zusammenfassen", popInArea:"Bevölkerung in diesem Gebiet", popCalcing:"Berechne Bevölkerung…", popFail:"Bevölkerungsabfrage fehlgeschlagen — erneut versuchen.", newsInArea:"Nachrichten in diesem Gebiet", elevProfile:"Höhenprofil", finalizeMeas:"Auf Karte behalten", aiSumTitle:"Gebiets-Briefing", aiSumSub:"{n} Nachrichten-Pins im ausgewählten Gebiet", aiSumNoArea:"Zeichnen Sie zuerst ein Gebiet oder platzieren Sie einen Kreis.", aiSumNoNews:"Keine Nachrichten-Pins in diesem Gebiet.", 
      aiVisHead:"KI-Änderungserkennung", aiVisBtn:"Änderungen erkennen", aiVisTitle:"Satelliten-Änderungsbericht", aiVisSub:"Vergleich {a} → {b}", aiVisBefore:"Vorher", aiVisAfter:"Nachher", aiVisCapturing:"Bilder werden erfasst…", aiVisPickDates:"Wählen Sie zwei Daten zum Vergleich.", aiVisNeedsDated:"Wechseln Sie im Satellitenmodus zu einem datumsfähigen Anbieter (MODIS / VIIRS / Sentinel-2).", aiVisCapFail:"Kartenbilder konnten nicht erfasst werden.",
      mTitleMap:"Karte", mTitleTools:"Werkzeuge", mDone:"Fertig" 
,
      tabMonitors:'Monitore',
      /* ══ ⚠⚠⚠ (#R239) MOVED HERE — THE KEYED TABLE HAD SIX HOMES AND FIVE OF THEM SPOKE
         FIVE LANGUAGES ═══════════════════════════════════════════════════════════════════════
         js/i18n-late.js, js/data-layers.js, js/wheel-zoom.js, js/workspace.js, js/app-body.js and
         js/premium-plan.js each carried `Object.assign(i18n.en,{…})` … `Object.assign(i18n.es,{…})`
         beside the feature that used the strings — written when there were five languages, and
         never extended when there were nine. js/i18n.js chains every table onto English with
         `Object.create(en)`, so the keys those files never gave to fr / ko / zh did not go
         `undefined`: they rendered IN ENGLISH, and no instrument reported it, because every
         instrument counted the keys ui.en.js HAS. Measured before this move: fr and ko had 5 of
         those 92 keys, de / ru / es had 82 — the Support dialog, the data-source modal, the
         screenshot messages and most of Settings, in English, in four languages.
         [[intmap-recurring-lessons]] G — one quantity, one place. 109 keys arrived here from that
         move; `node scripts/i18n-keyed-audit.mjs` fails if a seventh home is ever opened. */
      lyrGrpOrbit:"Weltraum",
      lyrEU:"EU-Mitglieder",
      lyrClimate:"Köppen-Klima",
      lyrPrecip:"Niederschlag (IMERG)",
      lyrPop:"Bevölkerungsdichte (nach Land)",
      lyrHDI:"HDI (2022)",
      lyrDem:"Demokratieindex (2023)",
      lyrNATO:"NATO-Mitglieder",
      lyrNightSide:"Tag-/Nachtschattierung",
      lgdTitle:"Köppen–Geiger",
      lyrSection:"Datenebenen",
      lyrRadar:"Niederschlagsradar (live)",
     lyrSST:"Meeresoberflächentemperatur",
      lyrSnow:"Schnee & Eis",
      lyrAOD:"Aerosol / Dunst",
      lyrNightSat:"Nachtlichter (Satellit)",
      lyrWind:"Wind",
      lgdRadarTitle:"Regenrate",
      lgdSSTTitle:"Meerestemperatur",
      lblFeedback:"Feedback & Fehlerbericht",
      sendFeedbackBtn:"⭐ Feedback senden",
      reportBugBtn:"🐞 Fehler melden",
      lyrGrpClimate:"Klima & Wetter",
      lyrGrpHazard:"Gefahren & Notfälle",
      lyrGrpDemo:"Bevölkerung & Demografie",
      lyrGrpGeoPol:"Geopolitik & Verteidigung",
      lyrGrpPolitics:"Politik & Regierungsführung",
      lyrGrpSecurity:"Verteidigung & Sicherheit",
      lyrGrpHealth:"Gesundheit & Hygiene",
      lyrGrpTech:"Technik & Infrastruktur",
      lyrGrpEnergy:"Energie & Rohstoffe",   /* (#R258) */
      lyrGrpEconomy:"Wirtschaft & Handel",   /* (#R261) */
      lyrGrpSociety:"Gesellschaft & Bildung",   /* (#R261) */
      lyrGrpTransport:"Verkehr & Mobilität",   /* (#R261) */
      lyrGrpAgri:"Landwirtschaft & Ernährung",   /* (#R261) */
      lyrGrpMaritime:"Ozeane",
      lyrGrpIndic:"Indikatoren & Overlays",
      lyrGrpTerrain:"Gelände & Höhe",
      lyrGrpNature:"Natur & Bodenbedeckung",
      lyrHillshade:"Reliefschattierung",
      lyrContours:"Höhenlinien",
      lyrPopGrid:"Bevölkerungsdichte (1-km-Raster)",
      lyrRelief:"Höhe (Farbrelief)",
      lyrSubcables:"Seekabel",
      lyrMilSpend:"Militärausgaben",
      lyrGDPpc:"BIP pro Kopf",
      lyrTFR:"Geburtenrate",
      lyrSeaLevel:"Meeresspiegeländerung",
      lblNavInertia:"Trägheit",
      proArchive:"🔒 10-Jahre-Zeitreise-Archiv",
      proIntel:"🔒 RU·CN lokale Primärquellen-Intel",
      srcModalTitle:"Datenquellen & Namensnennung",
      srcModalSub:"IntMap aggregiert die folgenden Drittanbieter-Daten, -Bilder und -APIs. Alle Marken gehören ihren Eigentümern.",
      screenshotSaved:"Screenshot gespeichert ✓",
      measureClickClose:"Klicken Sie auf den ersten Punkt zum Schließen",
      blueberryTitle:"IntMap unterstützen",
      blueberryBody:"Mein Ziel ist es, eine Karte zu schaffen, auf der Geografie, Klima, Geschichte, Ökologie, Demografie und das Weltgeschehen an einem Ort erkundet werden können.\nIntMap wird unabhängig entwickelt und wird laufend um neue Ebenen, Datensätze und Funktionen erweitert.\nWenn Ihnen IntMap gefällt und Sie seine zukünftige Entwicklung unterstützen möchten, können Sie unten beitragen.",
      blueberryGo:"Betrag auswählen ↗",
      blueberryNote:"Öffnet eine externe Seite (Stripe).",
      lblAccent:"Akzentfarbe",
      accentDefault:"Standard",
      accentCustom:"Eigene Farbe",
      lblShowRank:"Rangnummern (Länder)",
      showRankOff:"Aus",
      showRankOn:"An (Standard)",
      shareView:"Diese Ansicht teilen (Link kopieren)",
      lblKbd:"Tastaturkürzel",
      viewKbd:"⌨ Tastaturkürzel anzeigen (oder ? drücken)",
      newsCountryOff:"Nur Standard-Feeds",
      newsCountryMultiSel:"Länder auswählen…",
      lblNewsSources:"Nachrichtenquellen",
      newsSourceAll:"Alle Quellen",
      newsSourceMultiSel:"Quellen auswählen…",
      newsSourcesHint:"Es werden nur Schlagzeilen der angehakten Quellen gezeigt. Die Liste stammt aus den Quellen, die Ihr aktueller Feed tatsächlich liefert.",
      lblTicker:"Ticker unten (News & Märkte)",
      tickerOff:"Aus (Standard)",
      tickerOn:"An — schmaler Streifen unter der Karte",
      tkItems:"Angezeigte Einträge",
      tkNews:"Schlagzeilen",
      tkgFx:"Devisen",
      tkgIdx:"Indizes",
      tkgCom:"Rohstoffe",
      tkgCrypto:"Krypto",
      sortLife:"Lebenserwartung",
      sortTfr:"Geburtenrate",
      sortAsc:"Aufsteigend",
      sortDesc:"Absteigend",
      sortDir:"Auf-/absteigend umschalten",
      lblWsMode:'Fenster-Workspace (Desktop)',
      wsHint:'News, Länder, Karte, Ebenen und Atlas werden zu eigenen Fenstern, die Sie frei verschieben, skalieren, einklappen und stapeln können. Das Layout wird gespeichert.',
    
      ttlLayersPanel:"Ebenen",
      ttlFavorite:"Favorit",
    } });
