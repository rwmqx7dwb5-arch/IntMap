/* ============================================================================
 *  IntMap · UI STRINGS — Korean (한국어)   (#R232)
 * ----------------------------------------------------------------------------
 *  「それが完了したらフランス語と韓国語を追加。」
 *
 *  ⚠ THIS FILE IS THE WHOLE COST OF THE LANGUAGE — see the matching note in ui.fr.js. No registry
 *  row, no import line, no picker entry: src/locale-boot.js globs js/locales/ui.*.js and the registry
 *  derives 'ko' → label 한국어 (Intl.DisplayNames), tag `ko`, pill KO from the code alone.
 *
 *  ⚠ TWO TABLES: `ui` is the 283 KEYED strings (the chrome of every screen); `inline` is the 2,051
 *  strings written at their call site as L('English', '日本語', …), looked up here BY THEIR ENGLISH
 *  SOURCE STRING. A missing entry falls back to English PER STRING — never per screen.
 * ========================================================================== */
window.IntMapLang.define('ko', { ui: {
      lnkTerms:"이용약관", lnkPrivacy:"개인정보 처리방침", legalTabTerms:"약관", legalTabPrivacy:"개인정보", commAddImage:"이미지 추가",
      tabNews:"뉴스", tabSaved:"★ 저장됨", tabInfo:"정보", tabCompanies:"기업", tabStats:"국가", tabCommunity:"커뮤니티",
      searchPh:"뉴스 / 장소 검색...", filterCountriesPh:"국가 필터...", filterCompaniesPh:"기업 필터...", pickCountryMap:"지도에서 국가 선택", searchBtn:"검색", searchLoadBtn:"검색 / 불러오기", loading:"기사를 불러오는 중...",
      noMatch:"결과가 없습니다.", networkError:"뉴스를 불러오지 못했습니다. 다시 시도 중…",
      emptyHint:"선택된 탭이 없습니다 — 지도가 비어 있습니다.<br>위에서 탭을 선택하면 내용이 표시됩니다.",
      viewMap:"지도", viewSat:"위성", settings:"설정", modalTitle:"설정", close:"닫기",
      setSecAppearance:"화면", setSecLayout:"레이아웃 및 패널", setSecMap:"지도 동작", setSecUnits:"단위 및 시간", setSecNews:"뉴스 및 티커", setSecAI:"AI", setSecKeys:"연동 및 키", setSecAbout:"정보 및 지원",
      lblTheme:"테마", lblTz:"시간대 설정", tzSearch:"시간대 검색…", btnApply:"적용", optAuto:"시스템 기본값", optLocal:"현지 (시스템 기본값)",
      dashCatMil:"군사 기지", dashCatTech:"기술 / 사이버", dashCatMar:"해양 / 요충지", dashCatGeo:"지리 / 기후",
      readWiki:"위키백과에서 보기 ↗", measure:"측정", areaTool:"면적", radius:"반경", vol3dTool:"3D 부피", points:"지점", total:"합계", perimeter:"둘레", area:"면적", clear:"지우기", undoPt:"지점 취소",
      measureHint:"클릭하여 지점 추가 · 더블클릭하여 완료", areaHint:"3개 이상의 지점으로 둘러싸기 · 더블클릭하여 완료", radiusHint:"지도를 클릭해 원을 놓습니다. 여러 개 가능합니다.",
      placeNames:"지명", geoLabels:"수계 및 지형 이름", adminBounds:"주 / 도 경계", roadsLayer:"도로", railLayer:"철도", countries:"국가 (정보)", addCircle:"원 놓기", removeAll:"모두 지우기", color:"색상",
      statPop:"인구", statGdp:"GDP (명목)", statGdpPc:"1인당 GDP", statGdpPPP:"GDP (PPP)", statGdpPcPPP:"1인당 GDP (PPP)", statArea:"면적", statDensity:"인구 밀도", statRegion:"지역", statSub:"소지역", statCapital:"수도", statCurrency:"통화", statLang:"언어", statHDI:"HDI", statDem:"민주주의 지수", statMil:"국방비", statLife:"기대 수명", statInet:"인터넷 이용자",
      details:"자세히 ↗", loadingData:"국가 데이터를 불러오는 중...", dataNA:"해당 없음", noData:"국가 데이터를 사용할 수 없습니다.", sortGdp:"GDP", sortPop:"인구", sortArea:"면적", sortName:"가나다", sortHDI:"HDI", sortMil:"국방비", elev:"고도", bearing:"방위", presetNone:"— 선택 —", presetLbl:"범위 프리셋", opacity:"불투명도", circumference:"둘레", lblUnits:"측정 단위", unitBoth:"미터법 + 야드파운드법", unitMetric:"미터법만", unitImperial:"야드파운드법만", msPh:"지구상의 어떤 장소든 검색...",
      spRunway:"활주로", spGarrison:"주둔 부대", spOperator:"운영자", spEstd:"설립", spAircraft:"항공기", spType:"종류", spCapacity:"수용력", spDepth:"수심", spOutput:"생산량", spReserves:"매장량",
      flat:"평면", globe:"지구본", threeD:"⛰️ 3D", gridBtn:"🌐 격자", gridLayer:"🌐 격자 및 좌표", widgetsBtn:"위젯", lblTempUnit:"온도", tempBoth:"°C + °F", tempC:"°C만", tempF:"°F만", measureBtn:"📏 측정", measureMenuBtn:"측정", measureDistBtn:"📏 거리 / 면적", areaBtn:"📐 면적", drawBtn:"✏️ 그리기", vol3dBtn:"🧊 3D 부피", droneBtn:"🛸 드론", radiusBtn:"⭕ 반경", objectsBtn:"🗂 객체", mScreenshot:"지도 스크린샷", shareMenuBtn:"공유", shareLinkBtn:"공유 / 링크 복사", layersBtn:"레이어 ▾",
      ctxDropPin:"핀 놓기", ctxMeasureFrom:"측정 시작", ctxPostHere:"커뮤니티에 게시", ctxDistFrom:"이전 핀으로부터의 거리", ctxCopy:"좌표 복사", ctxClearPins:"모든 핀 삭제", ctxThisPoint:"이 지점", coords:"좌표", depth:"수심", climate:"기후", tlToday:"오늘", tlTitle:"타임머신", tlMachine:"타임머신", tl10y:"−10년", tl5y:"−5년", tlNow:"현재",
      lblPinMode:"뉴스 핀 위치", pinModeLoc:"사건 발생지", pinModePub:"언론사 소재지",
      lyrEEZ:"배타적 경제수역 / 12해리", lyrShips:"실시간 선박", lyrPlanes:"실시간 항공기", lyrSats:"실시간 위성", lyrThermal:"열 이상 (산불)", planesZoomHint:"확대하면 실시간 항공기를 불러옵니다", planesAreaHint:"확대하세요 — 실시간 항공기는 화면 중앙 영역만 표시됩니다", poiLabels:"장소, 상점 및 시설", shipsZoomHint:"확대하면 실시간 선박을 불러옵니다", aisNoKey:"실시간 선박에는 무료 AISstream.io API 키가 필요합니다 — 설정에서 추가하세요.", aisKeyLabel:"실시간 선박 (AISstream 키)", aisKeyHint:"aisstream.io에서 무료 키를 받아 여기에 붙여넣으면 실시간 선박이 표시됩니다. 이 브라우저에만 저장됩니다.",
      filtCiv:"민간", filtMil:"군용", filtAll:"전체", trafficFilter:"필터", lyrTime:"레이어 날짜", thermWin24:"최근 24시간", thermWin48:"최근 48시간", thermWin72:"최근 72시간",
      commAdd:"+ 새 글", commAddArmed:"지도를 클릭해 핀을 놓으세요", commTitle:"제목", commBody:"관찰, 질문 또는 견해를 공유하세요...", commPost:"게시", commCancel:"취소", commEmpty:"아직 글이 없습니다. 「+ 새 글」을 눌러 대화를 시작하세요.", commComment:"댓글", commLocate:"지도에서 보기", commDelete:"삭제", commReply:"답글", commWrite:"댓글 작성...", commPostNew:"새 글", commPlacedAt:"위치", commSortHot:"인기", commSortNew:"최신", commSortTop:"베스트", commSearchPh:"글 검색…", commInView:"화면 내", commCat:"분류", commCatAll:"전체", commEdit:"수정", commEdited:"수정됨", commEditPost:"글 수정", commSaveEdit:"변경 사항 저장", commNoMatch:"필터와 일치하는 글이 없습니다.", borders:"국경", compare:"비교", compareEmpty:"국가 행을 탭해 선택하고 비교하세요.", coCompareEmpty:"기업 행을 탭해 선택하고 비교하세요.", compareView:"비교 보기", compareClear:"지우기", back:"뒤로", deletePin:"삭제",
      satCtrlTitle:"위성 영상", satProvider:"제공처", satDate:"촬영일", satLatest:"최신", satMosaicSuffix:"무운량 모자이크", satLocked:"API 키 필요", satPrevDay:"이전 날", satNextDay:"다음 날", satKeysTitle:"위성 영상 (본인 키)", satKeyHint:"API 키를 입력하면 위성 패널에서 해당 제공처를 사용할 수 있습니다. 키는 이 브라우저에만 저장됩니다.", satKeyConnected:"연결됨", satKeyNone:"키 없음", satErrAuth:"{provider}: 인증 실패 — API 키를 확인하세요", satErrTiles:"{provider}: 영상을 사용할 수 없어 대체 소스로 전환했습니다",
      aiSecTitle:"AI 기능", aiSecHint:"내장 AI — 로그인한 사용자는 무료 (하루 최대 10회). API 키가 필요 없습니다.",
      aiProvider:"AI 제공처", aiModel:"모델", aiApiKey:"API 키", aiKeyConnected:"연결됨", aiKeyNone:"키 없음", aiGetKey:"키 받기 ↗", aiOnDevice:"Chrome에서 기기 내에서 실행됩니다 — API 키가 필요 없습니다.",
      aiTest:"연결 테스트", aiTesting:"테스트 중…", aiTestOk:"연결 정상 ✓",
      aiNoKey:"먼저 설정 → AI 기능에서 API 키를 추가하세요.", aiNoVision:"이 모델은 이미지를 읽을 수 없습니다. GPT-4o, Claude 3.5 Sonnet 또는 Gemini 1.5 Pro를 선택하세요.",
      aiChromeUnavail:"여기서는 Chrome 내장 AI를 사용할 수 없습니다. 기기 내 AI가 활성화된 Chrome 127 이상을 쓰거나 다른 제공처를 선택하세요.",
      aiThinking:"AI가 분석 중…", aiError:"AI 요청 실패", aiCopy:"복사", aiCopied:"복사됨 ✓", aiClose:"닫기", aiRetry:"다시 시도",
      aiGeoBtn:"✨ 모든 뉴스를 AI로 위치 지정", aiGeoBtnSub:"✨ 사건 위치를 AI로 지정", aiGeoBtnPub:"✨ 언론사 위치를 AI로 지정", aiTranslateTitles:"제목 번역", aiGeoBusy:"위치 지정 중…", aiGeoNone:"위치를 지정할 항목이 없습니다.", aiGeoDone:"{n}건의 기사 위치를 지정했습니다", aiGeoErr:"지오코딩 실패", aiTransBusy:"번역 중…", aiTransDone:"{n}개의 제목을 번역했습니다", aiTransNone:"제목이 이미 사용 언어입니다.",
      lblNewsLang:"뉴스 언어", newsLangUi:"현재 언어만", newsLangMulti:"모든 언어 (제목 자동 번역)", lblAiLocate:"AI 위치 분석", aiLocManual:"수동 (버튼)", aiLocAuto:"모든 뉴스에 자동 적용",
      aiTranslate:"번역", aiShowOriginal:"원문", aiTransNoText:"번역할 본문이 없습니다 — 웹 보기를 사용해 보세요.",
      aiSumBtn:"이 지역을 AI로 요약", popInArea:"이 지역의 인구", popCalcing:"인구 계산 중…", popFail:"인구 조회 실패 — 다시 시도하세요.", newsInArea:"이 지역의 뉴스", elevProfile:"고도 단면", finalizeMeas:"지도에 남기기", aiSumTitle:"지역 브리핑", aiSumSub:"선택 지역 내 뉴스 핀 {n}개", aiSumNoArea:"먼저 영역을 그리거나 원을 놓으세요.", aiSumNoNews:"이 지역에는 뉴스 핀이 없습니다.",
      aiViewSumBtn:"이 화면 요약", aiViewSumTitle:"화면에서 벌어지는 일",
      aiVisHead:"AI 변화 탐지", aiVisBtn:"변화 탐지", aiVisTitle:"위성 변화 보고서", aiVisSub:"{a} → {b} 비교", aiVisBefore:"이전", aiVisAfter:"이후", aiVisCapturing:"영상 캡처 중…", aiVisPickDates:"비교할 두 날짜를 선택하세요.", aiVisNeedsDated:"위성 모드에서 날짜 선택이 가능한 제공처(MODIS / VIIRS / Sentinel-2)로 전환하세요.", aiVisCapFail:"지도 영상을 캡처하지 못했습니다."
}, inline: {
    /* ⚠ KEYED BY THE ENGLISH SOURCE STRING — see the header. `node scripts/i18n-report.mjs --template ko`
       regenerates the full skeleton; anything absent renders in English, per string. */
    "Close":"닫기", "Cancel":"취소", "Save":"저장", "Delete":"삭제", "Remove":"제거",
    "Apply":"적용", "Reset":"초기화", "Search":"검색", "Loading…":"불러오는 중…",
    "Layers":"레이어", "Settings":"설정", "Map":"지도", "Satellite":"위성", "Globe":"지구본",
    "Flat":"평면", "Minimize":"최소화", "Send":"보내기", "Copy":"복사", "Open":"열기", "Back":"뒤로",
    "Sources":"출처", "Related articles":"관련 기사", "Cited sources":"인용 출처",
    "Web-verified sources":"웹으로 확인된 출처", "Data used":"사용한 데이터", "As of":"기준일",
    "live web search":"실시간 웹 검색", "Stopped":"중지됨", "Voice input":"음성 입력",
    "Attach a file":"파일 첨부", "Attach a file (image or text)":"파일 첨부 (이미지 또는 텍스트)",
    "Ask Atlas anything…":"Atlas에게 무엇이든 물어보세요…", "Thinking…":"생각 중…",
    "Research: ":"조사: ", "Researching…":"조사 중…", "Regenerate":"다시 생성",
    "Suggested questions":"추천 질문", "Ask a follow-up…":"이어서 질문하기…",
    "Seismic waves":"지진파", "P wave":"P파", "S wave":"S파",
    "Rayleigh wave":"레일리파 (표면파)", "Love wave":"러브파 (표면파)",
    "Method & sources":"계산 방법과 출처", "Observed at the time":"당시 실측값",
    "Load a past earthquake…":"과거 지진 불러오기…", "Peak intensity":"최대 진도",
    "Slip":"미끄러짐량", "Tsunami":"쓰나미", "Casualties":"인명 피해", "strike/dip/rake":"주향/경사/미끄러짐각",
    "Educational model — in a real emergency follow the official authorities.":"교육용 모델입니다 — 실제 재난 시에는 공식 기관의 지시를 따르세요.",
    "depth":"깊이", "Place":"지점", "shaking":"지속", "Shindo":"진도", "Minimize":"최소화",
    "Day & night shading":"주야 음영", "Night side of the Earth":"지구의 밤쪽",
    "Ocean currents":"해류", "Disaster simulator":"재난 시뮬레이터",
    "My location":"내 위치", "Reset bearing":"방위 초기화", "Map tools":"지도 도구",
    "Search layers…":"레이어 검색…", "Base map & labels":"기본 지도와 라벨",
    "Climate & weather":"기후와 날씨", "Terrain & elevation":"지형과 고도",
    "Oceans & maritime":"해양", "Hazards & night sky":"재해와 밤하늘",
    "Population & economy":"인구와 경제", "Geopolitics & defense":"지정학과 국방",
    "Others (beta)":"기타 (베타)", "No data":"데이터 없음", "Unavailable":"사용할 수 없음",
    "Retry":"다시 시도", "Failed":"실패", "Done":"완료", "km":"km", "Distance":"거리",
    "Back to the map":"지도로 돌아가기", "Data sources":"데이터 출처"
} });
