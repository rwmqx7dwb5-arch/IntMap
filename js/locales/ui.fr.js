/* ============================================================================
 *  IntMap · UI STRINGS — French (Français)   (#R232)
 * ----------------------------------------------------------------------------
 *  「それが完了したらフランス語と韓国語を追加。」
 *
 *  ⚠ THIS FILE IS THE WHOLE COST OF THE LANGUAGE. No row in js/lang-registry.js, no import line in
 *  src/main.js, no picker entry, no launch-screen word: src/locale-boot.js globs js/locales/ui.*.js,
 *  so the set of languages IS the set of files here, and the registry derives 'fr' → label
 *  «Français» (Intl.DisplayNames), tag `fr`, pill FR from the code alone. That is what
 *  「言語を追加するのが1発で終わるように」 asked for, and this file is the proof it is true.
 *
 *  ⚠ TWO TABLES, AND THE SECOND ONE IS THE BIG ONE.
 *    · `ui`     — the 283 KEYED strings (tabs, settings, dialogs, tool names). Every screen's chrome.
 *    · `inline` — the 2,051 strings written inline at their call site as L('English', '日本語', …).
 *                 A language past the fifth cannot be an extra argument at 2,051 places, so it is
 *                 looked up here BY ITS ENGLISH SOURCE STRING (js/lang-registry.js `pick`).
 *
 *  ⚠ A MISSING KEY FALLS BACK TO ENGLISH, PER STRING — never per screen, never `undefined`. That is
 *  what lets a translation ship while it is still being filled in, and `node scripts/i18n-report.mjs`
 *  prints exactly how much of each table is done.
 * ========================================================================== */
window.IntMapLang.define('fr', { ui: {
      lnkTerms:"Conditions d'utilisation", lnkPrivacy:"Politique de confidentialité", legalTabTerms:"Conditions", legalTabPrivacy:"Confidentialité", commAddImage:"Ajouter une image",
      tabNews:"Actualités", tabSaved:"★ Enregistrés", tabInfo:"Informations", tabCompanies:"Entreprises", tabStats:"Pays", tabCommunity:"Communauté",
      searchPh:"Rechercher actualités / lieux...", filterCountriesPh:"Filtrer les pays...", filterCompaniesPh:"Filtrer les entreprises...", pickCountryMap:"Choisir un pays sur la carte", searchBtn:"Rechercher", searchLoadBtn:"Rechercher / Charger", loading:"Chargement des articles...",
      noMatch:"Aucun résultat.", networkError:"Impossible de charger les actualités. Nouvelle tentative…",
      emptyHint:"Aucun onglet sélectionné — la carte est dégagée.<br>Choisissez un onglet ci-dessus pour afficher du contenu.",
      viewMap:"Carte", viewSat:"Satellite", settings:"Paramètres", modalTitle:"Paramètres", close:"Fermer",
      setSecAppearance:"Apparence", setSecLayout:"Disposition et panneaux", setSecMap:"Comportement de la carte", setSecUnits:"Unités et heure", setSecNews:"Actualités et bandeau", setSecAI:"IA", setSecKeys:"Intégrations et clés", setSecAbout:"À propos et soutien",
      lblTheme:"Thème", lblTz:"Fuseau horaire", tzSearch:"Rechercher un fuseau…", btnApply:"Appliquer", optAuto:"Réglage du système", optLocal:"Local (réglage du système)",
      dashCatMil:"Bases militaires", dashCatTech:"Tech / Cyber", dashCatMar:"Maritime / Détroits", dashCatGeo:"Géo / Climat",
      readWiki:"Lire sur Wikipédia ↗", measure:"Mesurer", areaTool:"Surface", radius:"Rayon", vol3dTool:"Volume 3D", points:"Points", total:"Total", perimeter:"Périmètre", area:"Surface", clear:"Effacer", undoPt:"Annuler le point",
      measureHint:"Cliquez pour ajouter des points · double-cliquez pour terminer", areaHint:"Ajoutez au moins 3 points pour fermer · double-cliquez pour terminer", radiusHint:"Cliquez sur la carte pour placer un cercle. Plusieurs cercles possibles.",
      placeNames:"Noms de lieux", geoLabels:"Hydrographie et relief", adminBounds:"Limites régionales", roadsLayer:"Routes", railLayer:"Voies ferrées", countries:"Pays (infos)", addCircle:"Placer un cercle", removeAll:"Tout effacer", color:"Couleur",
      statPop:"Population", statGdp:"PIB (nominal)", statGdpPc:"PIB par habitant", statGdpPPP:"PIB (PPA)", statGdpPcPPP:"PIB par habitant (PPA)", statArea:"Superficie", statDensity:"Densité de population", statRegion:"Région", statSub:"Sous-région", statCapital:"Capitale", statCurrency:"Monnaie", statLang:"Langues", statHDI:"IDH", statDem:"Indice de démocratie", statMil:"Dépenses militaires", statLife:"Espérance de vie", statInet:"Internautes",
      details:"Détails ↗", loadingData:"Chargement des données du pays...", dataNA:"N/D", noData:"Données du pays indisponibles.", sortGdp:"PIB", sortPop:"Pop.", sortArea:"Surf.", sortName:"A–Z", sortHDI:"IDH", sortMil:"Mil.$", elev:"Alt.", bearing:"Azimut", presetNone:"— choisir —", presetLbl:"Plages prédéfinies", opacity:"Opacité", circumference:"Circonférence", lblUnits:"Unités de mesure", unitBoth:"Métrique + impérial", unitMetric:"Métrique seulement", unitImperial:"Impérial seulement", msPh:"Rechercher n'importe quel lieu sur Terre...",
      spRunway:"Piste", spGarrison:"Garnison", spOperator:"Exploitant", spEstd:"Créé en", spAircraft:"Aéronefs", spType:"Type", spCapacity:"Capacité", spDepth:"Profondeur", spOutput:"Production", spReserves:"Réserves",
      flat:"Plat", globe:"Globe", threeD:"⛰️ 3D", gridBtn:"🌐 Grille", gridLayer:"🌐 Grille et repères", widgetsBtn:"Widgets", lblTempUnit:"Température", tempBoth:"°C + °F", tempC:"°C seulement", tempF:"°F seulement", measureBtn:"📏 Mesurer", measureMenuBtn:"Mesurer", measureDistBtn:"📏 Distance / surface", areaBtn:"📐 Surface", drawBtn:"✏️ Dessiner", vol3dBtn:"🧊 Volume 3D", droneBtn:"🛸 Drone", radiusBtn:"⭕ Rayon", objectsBtn:"🗂 Objets", mScreenshot:"Capture de la carte", shareMenuBtn:"Partager", shareLinkBtn:"Partager / copier le lien", layersBtn:"Calques ▾",
      ctxDropPin:"Poser un repère", ctxMeasureFrom:"Commencer à mesurer", ctxPostHere:"Publier dans la communauté", ctxDistFrom:"Distance depuis le repère précédent", ctxCopy:"Copier les coordonnées", ctxClearPins:"Supprimer tous les repères", ctxThisPoint:"Ce point", coords:"Coordonnées", depth:"Profondeur", climate:"Climat", tlToday:"Aujourd'hui", tlTitle:"Machine à remonter le temps", tlMachine:"Machine à remonter le temps", tl10y:"−10 ans", tl5y:"−5 ans", tlNow:"Maintenant",
      lblPinMode:"Position des repères d'actualité", pinModeLoc:"Lieu du sujet", pinModePub:"Lieu de l'éditeur",
      lyrEEZ:"ZEE / 12 milles marins", lyrShips:"Trafic maritime en direct", lyrPlanes:"Trafic aérien en direct", lyrSats:"Satellites en direct", lyrThermal:"Anomalies thermiques (incendies)", planesZoomHint:"Zoomez pour charger les aéronefs en direct", planesAreaHint:"Zoomez — les aéronefs en direct couvrent la zone centrale de cette vue", poiLabels:"Lieux, commerces et équipements", shipsZoomHint:"Zoomez pour charger les navires en direct", aisNoKey:"Le trafic maritime en direct nécessite une clé API AISstream.io gratuite — ajoutez-la dans les Paramètres.", aisKeyLabel:"Trafic maritime en direct (clé AISstream)", aisKeyHint:"Obtenez une clé gratuite sur aisstream.io et collez-la ici pour voir le trafic maritime en direct. Stockée uniquement dans ce navigateur.",
      filtCiv:"Civil", filtMil:"Militaire", filtAll:"Tous", trafficFilter:"Filtre", lyrTime:"Date du calque", thermWin24:"24 dernières h", thermWin48:"48 dernières h", thermWin72:"72 dernières h",
      commAdd:"+ Nouveau message", commAddArmed:"Cliquez sur la carte pour placer le repère", commTitle:"Titre", commBody:"Partagez une observation, une question ou une hypothèse...", commPost:"Publier", commCancel:"Annuler", commEmpty:"Aucun message. Cliquez sur « + Nouveau message » pour lancer la discussion.", commComment:"Commenter", commLocate:"Voir sur la carte", commDelete:"Supprimer", commReply:"Répondre", commWrite:"Écrire un commentaire...", commPostNew:"Nouveau message", commPlacedAt:"Placé à", commSortHot:"Populaires", commSortNew:"Récents", commSortTop:"Meilleurs", commSearchPh:"Rechercher des messages…", commInView:"Dans la vue", commCat:"Catégorie", commCatAll:"Toutes", commEdit:"Modifier", commEdited:"modifié", commEditPost:"Modifier le message", commSaveEdit:"Enregistrer", commNoMatch:"Aucun message ne correspond à vos filtres.", borders:"Frontières", compare:"Comparer", compareEmpty:"Touchez des lignes de pays pour les sélectionner et les comparer.", coCompareEmpty:"Touchez des lignes d'entreprises pour les sélectionner et les comparer.", compareView:"Afficher la comparaison", compareClear:"Effacer", back:"Retour", deletePin:"Supprimer",
      satCtrlTitle:"Imagerie satellite", satProvider:"Fournisseur", satDate:"Date de prise de vue", satLatest:"La plus récente", satMosaicSuffix:"mosaïque sans nuages", satLocked:"clé API requise", satPrevDay:"Jour précédent", satNextDay:"Jour suivant", satKeysTitle:"Imagerie satellite (clé personnelle)", satKeyHint:"Saisissez une clé API pour débloquer ces fournisseurs dans le panneau Satellite. Les clés sont stockées uniquement dans ce navigateur.", satKeyConnected:"Connecté", satKeyNone:"Aucune clé", satErrAuth:"{provider} : échec de l'authentification — vérifiez la clé API", satErrTiles:"{provider} : imagerie indisponible — basculement sur la source de secours",
      aiSecTitle:"Fonctions IA", aiSecHint:"IA intégrée — gratuite pour les utilisateurs connectés (jusqu'à 10 usages par jour). Aucune clé API nécessaire.",
      aiProvider:"Fournisseur d'IA", aiModel:"Modèle", aiApiKey:"Clé API", aiKeyConnected:"Connecté", aiKeyNone:"Aucune clé", aiGetKey:"Obtenir une clé ↗", aiOnDevice:"Fonctionne sur l'appareil dans Chrome — aucune clé API nécessaire.",
      aiTest:"Tester la connexion", aiTesting:"Test en cours…", aiTestOk:"Connexion OK ✓",
      aiNoKey:"Ajoutez d'abord une clé API dans Paramètres → Fonctions IA.", aiNoVision:"Ce modèle ne peut pas lire les images. Choisissez GPT-4o, Claude 3.5 Sonnet ou Gemini 1.5 Pro.",
      aiChromeUnavail:"L'IA intégrée de Chrome n'est pas disponible ici. Utilisez Chrome 127+ avec l'IA sur l'appareil activée, ou choisissez un autre fournisseur.",
      aiThinking:"L'IA analyse…", aiError:"Échec de la requête IA", aiCopy:"Copier", aiCopied:"Copié ✓", aiClose:"Fermer", aiRetry:"Réessayer",
      aiGeoBtn:"✨ Localiser toutes les actualités par IA", aiGeoBtnSub:"✨ Localiser le sujet par IA", aiGeoBtnPub:"✨ Localiser l'éditeur par IA", aiTranslateTitles:"Traduire les titres", aiGeoBusy:"Localisation…", aiGeoNone:"Rien à localiser.", aiGeoDone:"{n} articles localisés", aiGeoErr:"Échec du géocodage", aiTransBusy:"Traduction…", aiTransDone:"{n} titres traduits", aiTransNone:"Les titres sont déjà dans votre langue.",
      lblNewsLang:"Langues des actualités", newsLangUi:"Langue actuelle uniquement", newsLangMulti:"Toutes les langues (traduction automatique des titres)", lblAiLocate:"Analyse de localisation par IA", aiLocManual:"Manuelle (bouton)", aiLocAuto:"Automatique pour toutes les actualités",
      aiTranslate:"Traduire", aiShowOriginal:"Original", aiTransNoText:"Aucun texte d'article à traduire — essayez la vue Web.",
      aiSumBtn:"Résumer cette zone avec l'IA", popInArea:"Population dans cette zone", popCalcing:"Calcul de la population…", popFail:"Échec du calcul de population — réessayez.", newsInArea:"Actualités dans cette zone", elevProfile:"Profil altimétrique", finalizeMeas:"Conserver sur la carte", aiSumTitle:"Synthèse de zone", aiSumSub:"{n} repères d'actualité dans la zone sélectionnée", aiSumNoArea:"Dessinez d'abord une zone ou placez un cercle.", aiSumNoNews:"Aucun repère d'actualité dans cette zone.",
      aiViewSumBtn:"Résumer cette vue", aiViewSumTitle:"Ce qui se passe à l'écran",
      aiVisHead:"Détection de changements par IA", aiVisBtn:"Détecter les changements", aiVisTitle:"Rapport de changement satellite", aiVisSub:"Comparaison {a} → {b}", aiVisBefore:"Avant", aiVisAfter:"Après", aiVisCapturing:"Capture de l'imagerie…", aiVisPickDates:"Choisissez deux dates à comparer.", aiVisNeedsDated:"Passez à un fournisseur avec dates (MODIS / VIIRS / Sentinel-2) en mode Satellite.", aiVisCapFail:"Impossible de capturer l'imagerie de la carte."
}, inline: {
    /* ⚠ FILLED FROM THE ENGLISH SOURCE STRING, which is argument 0 of every L(…) call — see the
       header. `node scripts/i18n-report.mjs --template fr` regenerates the full skeleton, and
       `node scripts/i18n-report.mjs` prints how much of it is done. Anything absent renders in
       English, per string. */
    /* (#R234) the seismic panel's new instruction banners, its 詳細設定 disclosure and the
       two-state run button. Item ③ 「フランス語、韓国語の整備を継続」. */
    "Advanced — model assumptions":"Avancé — hypothèses du modèle",
    "Choose an earthquake…":"Choisissez un séisme…",
    "Click the map to add an observation point.":"Cliquez sur la carte pour ajouter un point d’observation.",
    "Click to start, click each corner, and click the first point again to finish.":"Cliquez pour commencer, cliquez chaque sommet, puis cliquez à nouveau sur le premier point pour terminer.",
    "Draw the rupture area on the map.":"Tracez la zone de rupture sur la carte.",
    "Each point is added to the table below. Press the button again to turn this off.":"Chaque point s’ajoute au tableau ci-dessous. Appuyez de nouveau sur le bouton pour désactiver.",
    "If one is already placed, tapping moves it. Press the button again to turn this off.":"Si un épicentre existe déjà, le toucher le déplace. Appuyez de nouveau sur le bouton pour désactiver.",
    "Recompute the intensity map":"Recalculer la carte d’intensité",
    "Close":"Fermer", "Cancel":"Annuler", "Save":"Enregistrer", "Delete":"Supprimer", "Remove":"Retirer",
    "Apply":"Appliquer", "Reset":"Réinitialiser", "Search":"Rechercher", "Loading…":"Chargement…",
    "Layers":"Calques", "Settings":"Paramètres", "Map":"Carte", "Satellite":"Satellite", "Globe":"Globe",
    "Flat":"Plat", "Minimize":"Réduire", "Send":"Envoyer", "Copy":"Copier", "Open":"Ouvrir", "Back":"Retour",
    "Sources":"Sources", "Related articles":"Articles liés", "Cited sources":"Sources citées",
    "Web-verified sources":"Sources vérifiées sur le web", "Data used":"Données utilisées", "As of":"Au",
    "live web search":"recherche web en direct", "Stopped":"Arrêté", "Voice input":"Saisie vocale",
    "Attach a file":"Joindre un fichier", "Attach a file (image or text)":"Joindre un fichier (image ou texte)",
    "Ask Atlas anything…":"Demandez ce que vous voulez à Atlas…", "Thinking…":"Réflexion…",
    "Research: ":"Recherche : ", "Researching…":"Recherche en cours…", "Regenerate":"Régénérer",
    "Suggested questions":"Questions suggérées", "Ask a follow-up…":"Poser une question complémentaire…",
    "Seismic waves":"Ondes sismiques", "P wave":"Onde P", "S wave":"Onde S",
    "Rayleigh wave":"Onde de Rayleigh (de surface)", "Love wave":"Onde de Love (de surface)",
    "Method & sources":"Méthode et sources", "Observed at the time":"Valeurs observées à l'époque",
    "Load a past earthquake…":"Charger un séisme passé…", "Peak intensity":"Intensité maximale",
    "Slip":"Glissement", "Tsunami":"Tsunami", "Casualties":"Victimes", "strike/dip/rake":"azimut/pendage/glissement",
    "Educational model — in a real emergency follow the official authorities.":"Modèle éducatif — en cas d'urgence réelle, suivez les autorités officielles.",
    "depth":"profondeur", "Place":"Lieu", "shaking":"durée", "Shindo":"Shindo", "Minimize":"Réduire",
    "Day & night shading":"Ombrage jour/nuit", "Night side of the Earth":"Face nocturne de la Terre",
    "Ocean currents":"Courants marins", "Disaster simulator":"Simulateur de catastrophes",
    "My location":"Ma position", "Reset bearing":"Réinitialiser l'orientation", "Map tools":"Outils cartographiques",
    "Search layers…":"Rechercher des calques…", "Base map & labels":"Fond de carte et libellés",
    "Climate & weather":"Climat et météo", "Terrain & elevation":"Relief et altitude",
    "Oceans & maritime":"Océans et maritime", "Hazards & night sky":"Risques et ciel nocturne",
    "Population & economy":"Population et économie", "Geopolitics & defense":"Géopolitique et défense",
    "Others (beta)":"Autres (bêta)", "No data":"Aucune donnée", "Unavailable":"Indisponible",
    "Retry":"Réessayer", "Failed":"Échec", "Done":"Terminé", "km":"km", "Distance":"Distance",
    "Back to the map":"Retour à la carte", "Data sources":"Sources des données"
,
  "not felt": "non ressenti",
  "out of range": "hors de portée",
  "Oceanic path, surface waves (×)": "Trajet océanique, ondes de surface (×)",
  "Rupture outline": "Contour de la rupture",
  "segments": "segments",
  "The wavefronts are the outer envelope of the fronts from every sampled point of the rupture — solved on the sphere, so a hand-drawn outline keeps its concavity instead of being replaced by its convex hull — and each sampled point uses the travel-time curve for its OWN depth on the dipping plane. Surface-wave group velocity is integrated along each great-circle path rather than held constant, so an oceanic path runs ahead of a continental one; the 3.5 / 4.4 km/s figures are the continental reference and the ratio is in the advanced settings.": "Les fronts d'onde sont l'enveloppe extérieure des fronts issus de chaque point échantillonné de la rupture — résolue sur la sphère, de sorte qu'un contour tracé à la main conserve sa concavité au lieu d'être remplacé par son enveloppe convexe — et chaque point utilise l'hodochrone correspondant à SA PROPRE profondeur sur le plan incliné. La vitesse de groupe des ondes de surface est intégrée le long de chaque grand cercle plutôt que maintenue constante : un trajet océanique devance donc un trajet continental. Les valeurs 3,5 / 4,4 km/s sont la référence continentale et le rapport se règle dans les paramètres avancés.",
  "Place the hypocenter": "Placer l'hypocentre",
  "Tap inside the rupture area to place the hypocenter.": "Touchez l'intérieur de la zone de rupture pour placer l'hypocentre.",
  "That point is outside the rupture area — the rupture starts on the plane it happened on.": "Ce point est en dehors de la zone de rupture — la rupture commence sur le plan où elle s'est produite.",
  "This is where the rupture starts, so it sets the direction it runs in.": "C'est là que la rupture commence, ce qui détermine la direction dans laquelle elle se propage.",} });
