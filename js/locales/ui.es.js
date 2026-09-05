/* ============================================================================
 *  IntMap · UI STRINGS — Spanish (Español)   (#R221)
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
window.IntMapLang.define('es', { ui: {
      /* ══ ⚠⚠⚠ (#R249) THE FIFTEENTH SURFACE — THE DOCUMENT'S OWN METADATA ═══════════════════════
         「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。」
         index.html's <title> and <meta name="description"> were literals in the markup, so the
         browser tab, the bookmark and every shared link said 「Explore the world. Ask the map.」 in
         all nine languages — while every instrument printed 100 %, because no instrument looked at
         the document itself. sources.html and science.html had localised both since #R239
         (js/page-i18n.js), which is what made the gap invisible: the mechanism existed and the
         application page simply never used it. scripts/i18n-doc-audit.mjs is the gate that stops a
         sixteenth one being forgotten. */
      docTitle:"IntMap — Explora el mundo. Pregunta al mapa.",
      docDesc:"IntMap es un mapa mundial interactivo para explorar geografía, clima, historia, población, eventos globales y mucho más, con control en lenguaje natural gracias a Atlas.",

      /* ══ (#R240) THE SIXTH SURFACE — title / aria-label / placeholder, which had no key at all
         and were therefore English in every language however complete this table looked. See
         scripts/i18n-attr-audit.mjs, the gate that now measures «is this string in the system».  */
      ttl3dTerrain:"Terreno 3D",
      ttlCompass:"Brújula",
      ttlVol3d:"Dibujar en el aire un volumen 3-D a escala real",
      ttlDrawTrace:"Dibujo a mano alzada y calco",
      accGraphite:"Grafito",
      accGreen:"Verde",
      accIndigo:"Índigo",
      accOrange:"Naranja",
      accPink:"Rosa",
      accPurple:"Morado",
      accRed:"Rojo",
      accTeal:"Verde azulado",
      ttlGridLabels:"Cuadrícula y etiquetas",
      ttlMapLayers:"Mapa y capas",
      ttlMapOptions:"Opciones del mapa",
      ttlMapTools:"Herramientas del mapa",
      ttlMeasureDA:"Medir distancia / área",
      ttlMeasureTools:"Herramientas de medición",
      ttlMyLocation:"Mi ubicación",
      ttlObjects:"Objetos",
      ttlRemove:"Quitar",
      ttlResetNorth:"Orientar al norte",
      ttlResetBearing:"Restablecer el rumbo",
      ttlSearchNews:"Buscar si el campo tiene texto; si no, recargar con los ajustes de noticias actuales",
      phPostBody:"Comparte una observación, una pregunta o una teoría…",
      phPostTitle:"Título",
      ttlToggleSidebar:"Mostrar u ocultar la barra lateral",
      ttlTools:"Herramientas",
      phAisKey:"Clave de API de aisstream.io",
      lnkTerms:"Términos del servicio", lnkPrivacy:"Política de privacidad", legalTabTerms:"Términos", legalTabPrivacy:"Privacidad", commAddImage:"Añadir imagen",
      tabNews:"Noticias", tabCompanies:"Empresas", tabStats:"Países", 
      searchPh:"Buscar noticias / lugares...", filterCountriesPh:"Filtrar países...", filterCompaniesPh:"Filtrar empresas...", evCatsAria:"Categorías de sucesos", pickCountryMap:"Elegir país en el mapa", searchBtn:"Buscar", searchLoadBtn:"Buscar / Cargar", msPh:"Buscar cualquier lugar de la Tierra...",
      viewMap:"Mapa", viewSat:"Satélite", flat:"Plano", globe:"Globo", threeD:"⛰️ 3D", gridBtn:"🌐 Cuadrícula", gridLayer:"🌐 Cuadrícula y etiquetas",
      settings:"Ajustes", modalTitle:"Ajustes", close:"Cerrar", btnApply:"Aplicar", lblLang:"Idioma",
      setSecAppearance:"Apariencia", setSecLayout:"Diseño y paneles", setSecMap:"Comportamiento del mapa", setSecUnits:"Unidades y hora", setSecNews:"Noticias y cinta", setSecAI:"IA", setSecKeys:"Integraciones y claves", setSecAbout:"Información y soporte",
      lblTheme:"Apariencia", optAuto:"Predeterminado del sistema", optLight:"Claro", optDark:"Oscuro", 
      lblMapColor:"Color del mapa", mapColorAuto:"Como la apariencia", mapColorLight:"Claro (blanco)", mapColorDark:"Oscuro (negro)",
      tabDocked:"Paneles", lblDockPanels:"Leyendas y ventanas de herramientas", dockPanelsOff:"Sobre el mapa (predeterminado)", dockPanelsOn:"Reunidas en una pestaña lateral", dockPanelsHint:"Cada leyenda, lectura y ventana de herramientas pasa a la pestaña «Paneles» de la barra lateral izquierda, dejando el mapa despejado. Los globos anclados a un lugar que ha pulsado siguen en el mapa.",
      lblUnits:"Unidades de medida", unitBoth:"Métrico + imperial", unitMetric:"Solo métrico", unitImperial:"Solo imperial",
      lblTempUnit:"Temperatura", tempBoth:"°C + °F", tempC:"Solo °C", tempF:"Solo °F",
      lblTz:"Zona horaria", tzSearch:"Buscar zona horaria…", optLocal:"Local (predeterminado del sistema)",
      lblNewsLang:"Idiomas de noticias", newsLangUi:"Solo el idioma actual", newsLangMultiSel:"Varios idiomas…", newsLangMulti:"Todos los idiomas (traducir títulos)", newsLangHint:"Los titulares de todos los idiomas aparecen juntos; con una clave de IA los títulos se traducen automáticamente.",
      lblSidebarStyle:"Barra lateral", sidebarOpaque:"Sólida (predeterminada)", sidebarTranslucent:"Vidrio esmerilado", sidebarGlass2:"Vidrio esmerilado (más transparente)",
      lblLabelLang:"Etiquetas de lugares", labelLangUi:"Como el idioma de la app", labelLangLocal:"Idioma local (alfabeto original)", labelLangEn:"Siempre en inglés",
      /* (#R180) motor de renderizado */
      lblEngine:"Motor del mapa", engineMapLibre:"MapLibre — mapa 2-D/3-D (predeterminado)", engineCesium:"Cesium — globo 3-D real con relieve real",
      engineHint:"Cesium dibuja la Tierra como un elipsoide real en cualquier zoom, con las mismas imágenes de satélite y los mismos datos de elevación. Solo se descarga al seleccionarlo, y cambiar recarga la página. Las curvas de nivel y la herramienta de sólido 3-D cerrado siguen siendo exclusivas de MapLibre.",
      engineSwitching:"Cambiando de motor — recargando…", engineFellBack:"Cesium no pudo iniciarse, así que esta sesión funciona con MapLibre.",
      engineActive:"En uso: ",
      /* (#R171) límite de inclinación + altitud de la cámara */
      lblTiltLimit:"Límite de inclinación del mapa", tiltStandard:"Estándar — hasta 78° (predeterminado)", tiltUnlimited:"Sin límite — todo el rango 0–180°",
      tiltHint:"Sin límite puedes inclinar más allá del horizonte hasta que la cámara mire en vertical. Pasados los 180° la vista se repite con el rumbo invertido, así que con clic derecho en la brújula puedes escribir cualquier ángulo de 0 a 360.",
      lblEyeAlt:"Altitud del punto de vista en la barra", eyeAltOff:"Desactivado (predeterminado)", eyeAltOn:"Activado — mostrar la altitud de la cámara", lblNightSide:"Sombreado de día y noche", nightSideOn:"Activado (predeterminado) — oscurecer el lado nocturno y mostrar las luces urbanas", nightSideOff:"Desactivado — un globo iluminado de forma uniforme",
      lblNavSens:"Sensibilidad de navegación", lblNavZoom:"Zoom", lblNavPan:"Desplazamiento",
      satKeysTitle:"Imágenes de satélite (BYOK)", satKeyHint:"Introduce una clave API para desbloquear estos proveedores en el panel de satélite. Las claves se guardan solo en este navegador.",
      aisKeyLabel:"Tráfico marítimo en vivo (clave AISstream)", aisKeyHint:"Opcional. Los barcos en vivo ya funcionan sin clave, desde un feed compartido. Tu propia clave gratuita de aisstream.io transmite todo el mundo directamente a este navegador, algo más reciente. Se guarda solo en este navegador.",
      aiSecTitle:"Funciones de IA", aiSecHint:"IA integrada — gratis al iniciar sesión (hasta 10 usos al día). No se necesita clave API.",
      blueberryBtn:"Apoyar", borders:"Fronteras de países", coastline:"Costas y orillas", countries:"Países (info)", placeNames:"Nombres de lugares", geoLabels:"Etiquetas de agua y relieve", adminBounds:"Fronteras de estados/provincias", roadsLayer:"Carreteras", railLayer:"Ferrocarriles", favLayers:"Favoritos",
      measureMenuBtn:"Medir", measureDistBtn:"📏 Distancia / área", drawBtn:"✏️ Dibujar", vol3dBtn:"🧊 Volumen 3-D", radiusBtn:"⭕ Radio", objectsBtn:"🗂 Objetos", mScreenshot:"Captura del mapa", shareMenuBtn:"Compartir", shareLinkBtn:"Compartir / enlace", screenshotBtn:"Captura del mapa (oculta los controles, mantiene las leyendas)", layersBtn:"Capas ▾", uploadGeoJSON:"Subir GeoJSON",
      lblDataSources:"Fuentes de datos", lblScience:"Ciencia y lógica", viewScience:"Cómo calcula cada simulación ↗", viewSourcesPage:"Abrir la página de fuentes de datos ↗", lblNewsCountries:"Países de noticias", newsCountriesHint:"Déjalo vacío para noticias de todo el mundo.",
      lyrGrpGeo:"Geografía estratégica", lyrGrpOthers:"Beta", lyrGrpOthersReal:"Otras",
      filtCiv:"Civil", filtMil:"Militar", filtAll:"Todos", thermWin24:"Últimas 24 h", thermWin48:"Últimas 48 h", thermWin72:"Últimas 72 h",
      tlMachine:"Chronos", 
      aiTranslateTitles:"Traducir títulos", 
      loading:"Cargando artículos...", noMatch:"No se encontraron resultados.", networkError:"No se pudieron cargar las noticias. Reintentando…", emptyHint:"Ninguna pestaña seleccionada — el mapa está despejado.<br>Elige una pestaña arriba para mostrar contenido.",
      dashCatMil:"Bases militares", dashCatTech:"Tecnología / Ciber", dashCatMar:"Marítimo / Estrechos", dashCatGeo:"Geo / Clima", readWiki:"Leer en Wikipedia ↗",
      measure:"Medir", areaTool:"Área", radius:"Radio", vol3dTool:"Volumen 3-D", points:"Puntos", total:"Total", perimeter:"Perímetro", area:"Área", clear:"Borrar", undoPt:"Deshacer punto",
      radiusHint:"Haz clic en el mapa para colocar un círculo. Se permiten varios círculos.", removeAll:"Borrar todo", color:"Color",
      statPop:"Población", statGdp:"PIB (nominal)", statGdpPc:"PIB per cápita", statGdpPPP:"PIB (PPA)", statGdpPcPPP:"PIB per cápita (PPA)", statArea:"Superficie", statDensity:"Densidad de población", statRegion:"Región", statCapital:"Capital", statCurrency:"Moneda", statLang:"Idiomas", statHDI:"IDH", statDem:"Índice de democracia", statMil:"Gasto militar", statLife:"Esperanza de vida", statInet:"Usuarios de Internet",
      details:"Detalles ↗", loadingData:"Cargando datos del país...", dataNA:"N/D", noData:"Datos del país no disponibles.",
      sortGdp:"PIB", sortPop:"Pob.", sortArea:"Sup.", sortName:"A–Z", sortHDI:"IDH", sortMil:"Mil.$", elev:"Altitud", bearing:"Rumbo", presetNone:"— seleccionar —", presetLbl:"Rangos predefinidos", opacity:"Opacidad", circumference:"Circunferencia",
      spType:"Tipo", 
      ctxDropPin:"Poner un marcador", ctxMeasureFrom:"Empezar a medir", ctxPostHere:"Publicar en la comunidad", ctxDistFrom:"Distancia desde el marcador anterior", ctxCopy:"Copiar coordenadas", ctxClearPins:"Quitar todos los marcadores", ctxThisPoint:"Este punto", coords:"Coordenadas", depth:"Profundidad", climate:"Clima",
      lyrEEZ:"ZEE marítima / 12 mn", lyrShips:"Tráfico marítimo en vivo", lyrPlanes:"Tráfico aéreo en vivo", lyrSats:"Satélites en vivo", lyrThermal:"Anomalías térmicas (incendios)", planesZoomHint:"Acerca para cargar aviones en vivo", planesAreaHint:"Acerca — los aviones cubren la zona central de esta vista", poiLabels:"Lugares, empresas e instalaciones", shipsZoomHint:"Acerca para cargar barcos en vivo", aisNoKey:"Los barcos en vivo no están disponibles ahora — el feed compartido no respondió.", trafficFilter:"Filtro", lyrTime:"Fecha de la capa",
      commAdd:"+ Nueva publicación", commTitle:"Título", commBody:"Comparte una observación, pregunta o teoría...", commPost:"Publicar", commCancel:"Cancelar", commEmpty:"Aún no hay publicaciones. Haz clic en \"+ Nueva publicación\" para empezar.", commLocate:"Mostrar en el mapa", commDelete:"Eliminar", commReply:"Responder", commWrite:"Escribe un comentario...", commPostNew:"Nueva publicación", commPlacedAt:"Colocado en", commSortHot:"Popular", commSortNew:"Nuevo", commSortTop:"Top", commSearchPh:"Buscar publicaciones…", commInView:"En vista", commCat:"Categoría", commCatAll:"Todas", commEdit:"Editar", commEdited:"editado", commEditPost:"Editar publicación", commSaveEdit:"Guardar cambios", commNoMatch:"Ninguna publicación coincide con tus filtros.",
      compare:"Comparar", compareEmpty:"Toca filas de países para elegir y comparar.", coCompareEmpty:"Toca filas de empresas para elegir y comparar.", compareView:"Mostrar comparación", compareClear:"Borrar", back:"Atrás", deletePin:"Eliminar",
      satCtrlTitle:"Imágenes de satélite", satProvider:"Proveedor", satDate:"Fecha de captura", satLatest:"Más reciente disponible", satMosaicSuffix:"mosaico sin nubes", satLocked:"añadir clave API", satPrevDay:"Día anterior", satNextDay:"Día siguiente", satKeyConnected:"Conectado", satKeyNone:"Sin clave", satErrAuth:"{provider}: fallo de autenticación — comprueba la clave API", satErrTiles:"{provider}: imágenes no disponibles — se cambió a reserva",
      aiProvider:"Proveedor de IA", aiNoKey:"Primero añade una clave API de IA en Ajustes → Funciones de IA.", aiNoVision:"Este modelo no puede leer imágenes. Elige GPT-4o, Claude 3.5 Sonnet o Gemini 1.5 Pro.", aiThinking:"La IA está analizando…", aiError:"Falló la solicitud de IA", aiCopy:"Copiar", aiCopied:"Copiado ✓", aiClose:"Cerrar", aiRetry:"Reintentar",
      aiTransBusy:"Traduciendo…", aiTransDone:"{n} títulos traducidos", aiTransNone:"Los títulos ya están en tu idioma.", aiTranslate:"Traducir", aiShowOriginal:"Original", aiTransNoText:"No hay texto de artículo para traducir — prueba la vista web.",
      aiSumBtn:"Resumir esta zona con IA", popInArea:"Población en esta zona", popCalcing:"Calculando población…", popFail:"No se pudo obtener la población — inténtalo de nuevo.", newsInArea:"Noticias en esta zona", elevProfile:"Perfil de elevación", finalizeMeas:"Mantener en el mapa", aiSumTitle:"Informe de zona", aiSumSub:"{n} marcadores de noticias en la zona seleccionada", aiSumNoArea:"Primero dibuja una zona o coloca un círculo.", aiSumNoNews:"No hay marcadores de noticias en esta zona.", 
      aiVisHead:"Detección de cambios por IA", aiVisBtn:"Detectar cambios", aiVisTitle:"Informe de cambios por satélite", aiVisSub:"Comparando {a} → {b}", aiVisBefore:"Antes", aiVisAfter:"Después", aiVisCapturing:"Capturando imágenes…", aiVisPickDates:"Elige dos fechas para comparar.", aiVisNeedsDated:"Cambia a un proveedor con fecha (MODIS / VIIRS / Sentinel-2) en el modo satélite.", aiVisCapFail:"No se pudieron capturar las imágenes del mapa.",
      mTitleMap:"Mapa", mTitleTools:"Herramientas", mDone:"Hecho"
,
      tabMonitors:'Monitores',
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
      lblNavInertia:"Inercia",
      lyrEU:"Miembros de la UE",
      lyrClimate:"Clima de Köppen",
      lyrPrecip:"Precipitación (IMERG)",
      lyrPop:"Densidad de población (por país)",
      lyrHDI:"IDH (2022)",
      lyrDem:"Índice de democracia (2023)",
      lyrNATO:"Miembros de la OTAN",
      lyrNightSide:"Sombreado de día y noche",
      lgdTitle:"Köppen–Geiger",
      lyrSection:"Capas de datos",
      lyrRadar:"Radar de precipitación (en vivo)",
     lyrSST:"Temperatura de la superficie del mar",
      lyrSnow:"Nieve y hielo",
      lyrAOD:"Aerosol / calima",
      lyrNightSat:"Luces nocturnas (satélite)",
      lyrWind:"Viento",
      lgdRadarTitle:"Intensidad de lluvia",
      lgdSSTTitle:"Temp. del mar",
      lblFeedback:"Comentarios y errores",
      sendFeedbackBtn:"⭐ Enviar comentarios",
      reportBugBtn:"🐞 Informar de un error",
      lyrHillshade:"Relieve (sombreado)",
      lyrContours:"Curvas de nivel",
      lyrPopGrid:"Densidad de población (malla 1 km)",
      lyrRelief:"Elevación (relieve en color)",
      lyrSubcables:"Cables submarinos",
      lyrMilSpend:"Gasto militar",
      lyrGDPpc:"PIB per cápita",
      lyrTFR:"Tasa de fecundidad total",
      lyrSeaLevel:"Cambio del nivel del mar",
      proArchive:"🔒 Archivo de viaje en el tiempo (10 años)",
      proIntel:"🔒 Fuentes primarias locales RU·CN",
      srcModalTitle:"Fuentes de datos y atribución",
      srcModalSub:"IntMap agrega los siguientes datos, imágenes y API de terceros. Todas las marcas pertenecen a sus propietarios.",
      screenshotSaved:"Captura guardada ✓",
      measureClickClose:"Haz clic en el primer punto para cerrar",
      blueberryTitle:"Apoya IntMap",
      blueberryBody:"Mi objetivo es crear un mapa donde la geografía, el clima, la historia, la ecología, la demografía y los acontecimientos mundiales puedan explorarse en un solo lugar.\nIntMap se desarrolla de forma independiente y se amplía continuamente con nuevas capas, conjuntos de datos y funciones.\nSi te gusta usar IntMap y quieres apoyar su desarrollo futuro, puedes contribuir a continuación.",
      blueberryGo:"Elige un importe ↗",
      blueberryNote:"Abre una página externa (Stripe).",
      lyrGrpClimate:"Clima y meteorología",
      lyrGrpHazard:"Riesgos y emergencias",
      lyrGrpDemo:"Población y demografía",
      lyrGrpGeoPol:"Geopolítica y defensa",
      lyrGrpPolitics:"Política y gobernanza",
      lyrGrpSecurity:"Defensa y seguridad",
      lyrGrpHealth:"Salud y saneamiento",
      lyrGrpTech:"Tecnología e infraestructura",
      lyrGrpEnergy:"Energía y recursos",   /* (#R258) */
      lyrGrpEconomy:"Economía y comercio",   /* (#R261) */
      lyrGrpSociety:"Sociedad y educación",   /* (#R261) */
      lyrGrpTransport:"Transporte y movilidad",   /* (#R261) */
      lyrGrpAgri:"Agricultura y alimentación",   /* (#R261) */
      lyrGrpMaritime:"Océanos",
      lyrGrpTerrain:"Terreno y altitud",
      lyrGrpNature:"Naturaleza y cobertura del suelo",
      lyrGrpIndic:"Indicadores y capas",
      lyrGrpOrbit:"Espacio",
      lblAccent:"Color de acento",
      accentDefault:"Predeterminado",
      accentCustom:"Color personalizado",
      lblShowRank:"Números de rango (Países)",
      showRankOff:"Desactivado",
      showRankOn:"Activado (predeterminado)",
      shareView:"Compartir esta vista (copiar enlace)",
      lblKbd:"Atajos de teclado",
      viewKbd:"⌨ Ver atajos de teclado (o pulsa ?)",
      newsCountryOff:"Solo fuentes predeterminadas",
      newsCountryMultiSel:"Elegir países…",
      lblNewsSources:"Medios de noticias",
      newsSourceAll:"Todas las fuentes",
      newsSourceMultiSel:"Elegir medios…",
      newsSourcesHint:"Solo se muestran titulares de los medios marcados. La lista se construye con los medios que realmente trae tu fuente actual.",
      lblTicker:"Cinta inferior (noticias y mercados)",
      tickerOff:"Desactivada (predeterminado)",
      tickerOn:"Activada — franja fina bajo el mapa",
      tkItems:"Elementos mostrados",
      tkNews:"Titulares",
      tkgFx:"Divisas",
      tkgIdx:"Índices",
      tkgCom:"Materias primas",
      tkgCrypto:"Cripto",
      sortLife:"Esperanza de vida",
      sortTfr:"Fecundidad",
      sortAsc:"Ascendente",
      sortDesc:"Descendente",
      sortDir:"Cambiar orden",
      lblWsMode:'Espacio de ventanas (escritorio)',
      wsHint:'Noticias, países, el mapa, las capas y Atlas se convierten en ventanas propias que puedes mover, redimensionar, plegar y apilar libremente. Tu diseño se guarda.',
    
      ttlLayersPanel:"Capas",
      ttlFavorite:"Favorito",
    } });
