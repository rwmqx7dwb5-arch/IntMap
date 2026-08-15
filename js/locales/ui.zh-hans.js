/* ============================================================================
 *  IntMap · UI STRINGS — zh-Hans   ⚠ GENERATED FILE — DO NOT EDIT BY HAND
 * ----------------------------------------------------------------------------
 *  「簡体を追加して。(beta)」 (#R224)
 *
 *  Produced from js/locales/ui.zh.js by scripts/zh-hans.mjs: the Taiwan→mainland WORD table first
 *  (網路→网络, 資訊→信息, 螢幕→屏幕, 檔案→文件, 預設→默认, 選單→菜单, 使用者→用户 …), then the
 *  Traditional→Simplified character map. Fix a string in ui.zh.js and re-run the script; editing
 *  this file directly is undone by the next run, and tests/r224-checks.test.mjs fails if the two
 *  ever disagree.
 *
 *      node scripts/zh-hans.mjs
 * ==========================================================================*/
window.IntMapLang.define('zh-hans', {
  /* ① the keyed table — Settings, tabs, layer names, the static UI */
  ui: {
      /* ══ (#R240) THE SIXTH SURFACE — title / aria-label / placeholder, which had no key at all
         and were therefore English in every language however complete this table looked. See
         scripts/i18n-attr-audit.mjs, the gate that now measures «is this string in the system».  */
      "ttl3dTerrain":"3D 地形",
      "ttlCompass":"罗盘",
      "ttlVol3d":"在空中绘制实际尺寸的立体",
      "ttlDrawTrace":"手绘与描图",
      "accGraphite":"石墨灰",
      "accGreen":"绿色",
      "accIndigo":"靛蓝",
      "accOrange":"橙色",
      "accPink":"粉红",
      "accPurple":"紫色",
      "accRed":"红色",
      "accTeal":"蓝绿",
      "ttlGridLabels":"格线与标注",
      "ttlMapLayers":"地图与图层",
      "ttlMapOptions":"地图选项",
      "ttlPinPos":"地图图钉位置",
      "ttlMapTools":"地图工具",
      "ttlMeasureDA":"测量距离／面积",
      "ttlMeasureTools":"测量工具",
      "ttlMyLocation":"我的位置",
      "ttlObjects":"对象",
      "ttlRemove":"移除",
      "ttlResetNorth":"回正北方",
      "ttlResetBearing":"重置方位",
      "ttlSearchNews":"栏位有文字时搜索，否则依目前的新闻设置重新加载",
      "phPostBody":"分享观察、问题或推论…",
      "phPostTitle":"标题",
      "ttlToggleSidebar":"切换侧边栏",
      "ttlTools":"工具",
      "phAisKey":"aisstream.io API 金钥",
    "lnkTerms":"服务条款",
    "lnkPrivacy":"隐私权政策",
    "legalTabTerms":"条款",
    "legalTabPrivacy":"隐私权",
    "commAddImage":"新增图片",
    "accentCustom":"自定义颜色",
    "accentDefault":"默认",
    "atlasBtn":"Atlas — 用日常语言提问（beta）・Ctrl/⌘+K",
    "blueberryBody":"我的目标是打造一张地图，让地理、气候、历史、生态、人口与世界大事都能在同一个地方被探索。\nIntMap 由个人独立开发，并持续加入新的图层、数据集与功能。\n如果你喜欢使用 IntMap，并愿意支持它未来的开发，可以在下方赞助。",
    "blueberryBtn":"支持",
    "blueberryGo":"选择金额 ↗",
    "blueberryNote":"将开启外部页面（Stripe）。",
    "blueberryTitle":"支持 IntMap",
    "climAt":"气候区",
    "engineActive":"目前执行于：",
    "engineCesium":"Cesium — 具真实地形的立体地球仪",
    "engineFellBack":"Cesium 无法启动，因此本次会话改用 MapLibre。",
    "engineHint":"Cesium 在每个缩放层级都把地球算成真正的椭球体，使用相同的卫星影像与相同的高程数据。它只在被选用时才下载，切换时会重新加载页面。等高线与封闭立体工具仍仅限 MapLibre。",
    "engineMapLibre":"MapLibre — 2D／3D 地图（默认）",
    "engineSwitching":"正在切换引擎 — 重新加载中…",
    "eyeAltOff":"关闭（默认）",
    "eyeAltOn":"开启 — 显示相机高度",
    "favLayers":"常用图层",
    "flatPanFixed":"范围固定（以欧洲为中心）",
    "flatPanFree":"自由卷动（可绕行世界）",
    "labelLangEn":"一律英文",
    "labelLangLocal":"当地语言（原生文字）",
    "labelLangUi":"与应用语言相同",
    "layerPanelClassic":"传统下拉菜單",
    "layerPanelRight":"右侧边栏（视觉化，含预览）",
    "lblAccent":"强调色",
    "lblDataSources":"数据来源",
    "lblEngine":"地图引擎",
    "lblEyeAlt":"读数中的视点高度",
    "lblFeedback":"意见回馈与错误回报",
    "lblFlatPan":"平面地图的显示",
    "lblKbd":"键盘快捷键",
    "lblLabelLang":"地名标注",
    "lblLang":"语言",
    "lblLayerPanel":"图层面板",
    "lblMapColor":"地图颜色",
    "lblNavInertia":"惯性",
    "lblNavPan":"平移",
    "lblNavSens":"地图操作灵敏度",
    "lblNavZoom":"缩放",
    "lblNewsCountries":"依国家媒体筛选新闻",
    "lblNewsSources":"新闻媒体",
    "lblNightSide":"昼夜着色",
    "lblPlayground":"游乐场（beta）",
    "lblScience":"科学根据与逻辑",
    "lblShowRank":"排名编号（国家）",
    "lblSidebarStyle":"侧边栏外观",
    "lblSourcesPage":"数据来源",
    "lblTicker":"底部跑马灯（新闻与市场）",
    "lblTiltLimit":"地图倾角上限",
    "lblWsMode":"窗口工作区（桌面）",
    "lgdRadarTitle":"降水强度",
    "lgdReliefTitle":"高程",
    "lgdSSTTitle":"海面水温",
    "lgdSeaLevelTitle":"海平面变化",
    "lgdSubcablesTitle":"海底电缆",
    "lgdTempTitle":"气温（2 米）",
    "lgdTitle":"柯本–盖格",
    "lgdWindTitle":"风速",
    "lyrAOD":"气胶／烟霾",
    "lyrClimate":"柯本气候分类",
    "lyrClouds":"云・红外线（实时）",
    "lyrContours":"等高线",
    "lyrDem":"民主指数（2023）",
    "lyrEU":"欧盟成员国",
    "lyrGDPpc":"人均 GDP",
    "lyrGrpClimate":"气候与天气",
    "lyrGrpDemo":"人口与经济",
    "lyrGrpGeo":"战略地理",
    "lyrGrpGeoPol":"地缘政治与国防",
    "lyrGrpHazard":"灾害与夜空",
    "lyrGrpIndic":"指标与叠图",
    "lyrGrpMaritime":"海洋与海事",
    "lyrGrpOrbit":"太空与轨道",
    "lyrGrpOthers":"其他（beta）",
    "lyrGrpStrat":"战略网络",
    "lyrGrpTerrain":"地形与高程",
    "lyrGrpWeather":"天气与环境",
    "lyrHDI":"人类发展指数（2022）",
    "lyrHillshade":"地形起伏（阴影）",
    "lyrMilSpend":"国防支出（十亿美元）",
    "lyrMilSpendGDP":"国防支出（占 GDP %）",
    "lyrNATO":"NATO 成员国",
    "lyrNightSide":"昼夜着色",
    "lyrNightSat":"夜间灯光（卫星）",
    "lyrOceanCur":"海流",
    "lyrPop":"人口密度",
    "lyrPopGrid":"人口密度（1 公里网格）",
    "lyrPrecip":"降水量（IMERG）",
    "lyrRadar":"降水雷达（实时）",
    "lyrRelief":"高程（彩色地势）",
    "lyrSST":"海面水温",
    "lyrSeaLevel":"海平面变化",
    "lyrSection":"数据图层",
    "lyrSnow":"积雪与海冰",
    "lyrSubcables":"海底电缆",
    "lyrTFR":"总生育率",
    "lyrTemp":"气温（2 米）",
    "lyrTimeMonth":"月份",
    "lyrWind":"风（动画）",
    "mDone":"完成",
    "mTitleMap":"地图",
    "mTitleTools":"工具",
    "mapColorAuto":"与外观一致",
    "mapColorDark":"深色（黑）",
    "mapColorLight":"浅色（白）",
    "measureClickClose":"点击第一个点以闭合",
    "newsCountriesHint":"从你选择的国家媒体撷取标题（可复选）。",
    "newsCountryMultiSel":"选择国家…",
    "newsCountryOff":"仅默认数据源",
    "newsLangHint":"所选各语言的标题会一起显示；若有 AI 金钥，标题会自动翻译。",
    "newsLangMultiSel":"多种语言…",
    "newsSourceAll":"所有媒体",
    "newsSourceMultiSel":"选择媒体…",
    "newsSourcesHint":"只显示你勾选的媒体的标题。列表依你目前数据源实际包含的媒体建立。",
    "nightSideOff":"关闭 — 整颗地球均匀照亮",
    "nightSideOn":"开启（默认）— 让夜侧变暗并显示城市灯光",
    "optBaroque":"巴洛克（欧洲）",
    "optClassic":"大航海时代",
    "optCyber":"赛博终端",
    "optDark":"深色",
    "optLight":"浅色",
    "optMedical":"医疗",
    "optMilitary":"军事",
    "optPsychedelic":"迷幻",
    "optTaisho":"大正日本",
    "playgroundBtn":"🎮 开启游乐场",
    "proArchive":"🔒 十年时光回溯文件",
    "proIntel":"🔒 俄・中在地一手来源情报",
    "proModalSub":"超越实时地图 — 深度历史文件与一手来源情报。",
    "proModalTitle":"解锁 IntMap Pro",
    "proSection":"进阶功能",
    "reportBugBtn":"🐞 回报错误",
    "screenshotBtn":"地图屏幕撷取（隐藏控制项，保留图例）",
    "screenshotBusy":"撷取中…",
    "screenshotSaved":"已保存屏幕撷取 ✓",
    "sendFeedbackBtn":"⭐ 传送意见回馈",
    "shareView":"分享此画面（复制链接）",
    "showRankOff":"关闭",
    "showRankOn":"开启（默认）",
    "sidebarGlass2":"雾面玻璃（更透明）",
    "sidebarOpaque":"实色（默认）",
    "sidebarTranslucent":"雾面玻璃",
    "sortAsc":"递增",
    "sortDesc":"递减",
    "sortDir":"切换递增／递减",
    "sortLife":"平均寿命",
    "sortTfr":"生育率",
    "srcModalSub":"IntMap 汇整以下第三方数据、影像与 API。所有商标均属各自所有人。",
    "srcModalTitle":"数据来源与出处",
    "tickerOff":"关闭（默认）",
    "tickerOn":"开启 — 地图下方的细长条",
    "tiltHint":"选「不限制」可让你把视角倾过地平线，直到相机朝正上方。超过 180° 后画面会重复且方位反转，因此可在罗盘上按右键输入 0 到 360 的任意角度。",
    "tiltStandard":"标准 — 最高 78°（默认）",
    "tiltUnlimited":"不限制 — 完整 0–180° 范围",
    "tkItems":"显示的项目",
    "tkNews":"新闻标题",
    "tkgCom":"商品",
    "tkgCrypto":"加密资产",
    "tkgFx":"外汇",
    "tkgIdx":"指数",
    "uploadGeoJSON":"上传 GeoJSON",
    "viewDataSources":"应用内的快速列表",
    "viewKbd":"⌨ 检视键盘快捷键（或按 ?）",
    "viewScience":"每一项模拟如何运作 ↗",
    "viewSourcesPage":"开启数据来源页面 ↗",
    "worldExplorerBtn":"🌍 卫星空降",
    "wsHint":"新闻、国家、地图、图层与 Atlas 各自成为独立窗口，可自由移动、调整大小、收合与堆叠。你的版面配置会被保存。",
    "wsOff":"关闭（默认）",
    "wsOn":"开启 — 可自由浮动、可调整大小的窗口",
      tabNews:"新闻", tabSaved:"★ 收藏", tabInfo:"信息", tabCompanies:"企业", tabStats:"国家",
      searchPh:"搜索新闻／地点…", filterCountriesPh:"筛选国家…", filterCompaniesPh:"筛选企业…", pickCountryMap:"在地图上选择国家", searchBtn:"搜索", searchLoadBtn:"搜索／加载", loading:"正在加载报道…",
      noMatch:"找不到符合的结果。", networkError:"无法加载新闻，正在重试…",
      emptyHint:"尚未选择分页 — 地图目前是干净的。<br>请在上方选择分页以显示内容。",
      viewMap:"地图", viewSat:"卫星影像", settings:"设置", modalTitle:"设置", close:"关闭",
      tabDocked:"面板", lblDockPanels:"图例与工具窗口", dockPanelsOff:"显示于地图上（默认）", dockPanelsOn:"收进侧边栏分页", dockPanelsHint:"所有图例、读数与工具窗口都会移到左侧边栏的「面板」分页，让地图保持清爽。点击地点时出现、与地图位置相连的弹出窗口仍留在地图上。",
      setSecAppearance:"外观", setSecLayout:"版面与面板", setSecMap:"地图操作", setSecUnits:"單位与时间", setSecNews:"新闻与跑马灯", setSecAI:"AI", setSecKeys:"整合与金钥", setSecAbout:"关于与支持",
      lblTheme:"主题", lblTz:"时区设置", tzSearch:"搜索时区…", btnApply:"应用", optAuto:"系统默认", optLocal:"当地时间（系统默认）",
      dashCatMil:"军事基地", dashCatTech:"科技／网络", dashCatMar:"海运／咽喉点", dashCatGeo:"地理／气候",
      readWiki:"在维基百科阅读 ↗", measure:"测量", areaTool:"面积", radius:"半径", vol3dTool:"立体体积", points:"点", total:"合计", perimeter:"周长", area:"面积", clear:"清除", undoPt:"取消上一点",
      measureHint:"点击以新增点・双击结束", areaHint:"新增 3 点以上围成范围・双击结束", radiusHint:"点击地图放置圆形。可放置多个。",
      placeNames:"地名", geoLabels:"水域与地形标注", adminBounds:"州／省界", roadsLayer:"道路", railLayer:"铁路", countries:"国家（信息）", addCircle:"放置圆形", removeAll:"全部清除", color:"颜色",
      statPop:"人口", statGdp:"GDP（名目）", statGdpPc:"人均 GDP", statGdpPPP:"GDP（购买力平价）", statGdpPcPPP:"人均 GDP（购买力平价）", statArea:"面积", statDensity:"人口密度", statRegion:"地区", statSub:"次区域", statCapital:"首都", statCurrency:"货币", statLang:"语言", statHDI:"人类发展指数", statDem:"民主指数", statMil:"国防支出", statLife:"平均寿命", statInet:"网络使用人口",
      details:"详细数据 ↗", loadingData:"正在加载国家数据…", dataNA:"无数据", noData:"查无国家数据。", sortGdp:"GDP", sortPop:"人口", sortArea:"面积", sortName:"A–Z", sortHDI:"HDI", sortMil:"军费", elev:"海拔", bearing:"方位", presetNone:"— 请选择 —", presetLbl:"距离默认", opacity:"不透明度", circumference:"圆周长", lblUnits:"度量單位", unitBoth:"公制＋英制", unitMetric:"仅公制", unitImperial:"仅英制", msPh:"搜索地球上任何地点…",
      spRunway:"跑道", spGarrison:"驻军", spOperator:"营运者", spEstd:"设立", spAircraft:"机种", spType:"类型", spCapacity:"容量", spDepth:"深度", spOutput:"产量", spReserves:"蕴藏量",
      flat:"平面", globe:"地球仪", threeD:"⛰️ 3D", gridBtn:"🌐 经纬格线", gridLayer:"🌐 格线与标注", widgetsBtn:"小工具", lblTempUnit:"温度", tempBoth:"°C＋°F", tempC:"仅 °C", tempF:"仅 °F", measureBtn:"📏 测量", measureMenuBtn:"测量", measureDistBtn:"📏 距离／面积", areaBtn:"📐 面积", drawBtn:"✏️ 绘制", vol3dBtn:"🧊 立体体积", droneBtn:"🛸 无人机", radiusBtn:"⭕ 半径", objectsBtn:"🗂 对象", mScreenshot:"地图屏幕撷取", shareMenuBtn:"分享", shareLinkBtn:"分享／复制链接", layersBtn:"图层 ▾",
      ctxDropPin:"放置图钉", ctxMeasureFrom:"从此开始测量", ctxPostHere:"发布到社群", ctxDistFrom:"与前一个图钉的距离", ctxCopy:"复制坐标", ctxClearPins:"移除所有图钉", ctxThisPoint:"此地点", coords:"坐标", depth:"深度", climate:"气候", tlToday:"今天", tlTitle:"时光机", tlMachine:"时光机", tl10y:"−10年", tl5y:"−5年", tlNow:"现在",
      lblPinMode:"新闻图钉位置", pinModeLoc:"事件发生地", pinModePub:"媒体所在地",
      lyrEEZ:"专属经济海域／12海里", lyrShips:"实时船舶动态", lyrPlanes:"实时航班动态", lyrSats:"实时卫星", lyrThermal:"热异常（火点）", planesZoomHint:"放大以加载实时航班", planesAreaHint:"请放大 — 实时航班只涵盖画面中央区域", poiLabels:"地点、商家与设施", shipsZoomHint:"放大以加载实时船舶", aisNoKey:"实时船舶需要免费的 AISstream.io API 金钥 — 请在设置中新增。", aisKeyLabel:"实时船舶动态（AISstream 金钥）", aisKeyHint:"在 aisstream.io 申请免费金钥并贴在此处即可看到实时船舶。金钥仅保存在这个浏览器中。",
      filtCiv:"民用", filtMil:"军用", filtAll:"全部", trafficFilter:"筛选", lyrTime:"图层日期", thermWin24:"过去 24 小时", thermWin48:"过去 48 小时", thermWin72:"过去 72 小时",
      tabCommunity:"社群", commAdd:"＋ 新贴文", commAddArmed:"点击地图放置图钉", commTitle:"标题", commBody:"分享你的观察、问题或推论…", commPost:"发布", commCancel:"取消", commEmpty:"目前还没有贴文。点「＋ 新贴文」开始讨论。", commComment:"留言", commLocate:"在地图上显示", commDelete:"删除", commReply:"回覆", commWrite:"写下留言…", commPostNew:"新贴文", commPlacedAt:"放置于", commSortHot:"热门", commSortNew:"最新", commSortTop:"最高分", commSearchPh:"搜索贴文…", commInView:"画面范围内", commCat:"分类", commCatAll:"全部", commEdit:"编辑", commEdited:"已编辑", commEditPost:"编辑贴文", commSaveEdit:"保存变更", commNoMatch:"没有符合筛选条件的贴文。", borders:"国界", compare:"比较", compareEmpty:"点击国家列以选取并比较。", coCompareEmpty:"点击企业列以选取并比较。", compareView:"显示比较", compareClear:"清除", back:"返回", deletePin:"删除",
      satCtrlTitle:"卫星影像", satProvider:"提供者", satDate:"拍摄日期", satLatest:"最新可用", satMosaicSuffix:"无云镶嵌影像", satLocked:"需 API 金钥", satPrevDay:"前一天", satNextDay:"后一天", satKeysTitle:"卫星影像（自备金钥）", satKeyHint:"输入 API 金钥即可在卫星面板中使用这些提供者。金钥仅保存在这个浏览器中。", satKeyConnected:"已连接", satKeyNone:"无金钥", satErrAuth:"{provider}：验证失败 — 请检查 API 金钥", satErrTiles:"{provider}：影像无法取得 — 已切换为替代来源",
      aiSecTitle:"AI 功能", aiSecHint:"内建 AI — 登录用户免费（每日最多 10 次），不需要 API 金钥。",
      aiProvider:"AI 提供者", aiModel:"模型", aiApiKey:"API 金钥", aiKeyConnected:"已连接", aiKeyNone:"无金钥", aiGetKey:"取得金钥 ↗", aiOnDevice:"在 Chrome 上本机执行 — 不需要 API 金钥。",
      aiTest:"测试连接", aiTesting:"测试中…", aiTestOk:"连接正常 ✓",
      aiNoKey:"请先在「设置 → AI 功能」中新增 AI API 金钥。", aiNoVision:"这个模型无法读取影像。请改用 GPT-4o、Claude 3.5 Sonnet 或 Gemini 1.5 Pro。",
      aiChromeUnavail:"此处无法使用 Chrome 内建 AI。请使用 Chrome 127 以上并启用本机 AI，或改选其他提供者。",
      aiThinking:"AI 分析中…", aiError:"AI 请求失败", aiCopy:"复制", aiCopied:"已复制 ✓", aiClose:"关闭", aiRetry:"重试",
      aiGeoBtn:"✨ 以 AI 定位所有新闻", aiGeoBtnSub:"✨ 以 AI 定位事件地", aiGeoBtnPub:"✨ 以 AI 定位媒体", aiTranslateTitles:"翻译标题", aiGeoBusy:"定位中…", aiGeoNone:"没有可定位的项目。", aiGeoDone:"已定位 {n} 则报道", aiGeoErr:"地理编码失败", aiTransBusy:"翻译中…", aiTransDone:"已翻译 {n} 则标题", aiTransNone:"标题已是你的语言。",
      lblNewsLang:"新闻语言", newsLangUi:"仅目前语言", newsLangMulti:"所有语言（自动翻译标题）", lblAiLocate:"AI 位置分析", aiLocManual:"手动（按钮）", aiLocAuto:"所有新闻自动执行",
      aiTranslate:"翻译", aiShowOriginal:"原文", aiTransNoText:"没有可翻译的内文 — 请改用网页检视。",
      aiSumBtn:"以 AI 摘要这个区域", popInArea:"此区域人口", popCalcing:"正在计算人口…", popFail:"人口查询失败 — 请再试一次。", newsInArea:"此区域的新闻", elevProfile:"高程剖面", finalizeMeas:"保留在地图上", aiSumTitle:"区域简报", aiSumSub:"所选区域内有 {n} 个新闻图钉", aiSumNoArea:"请先画出范围或放置圆形。", aiSumNoNews:"此区域内没有新闻图钉。",
      aiViewSumBtn:"摘要目前画面", aiViewSumTitle:"画面上正在发生什么",
      aiVisHead:"AI 变化侦测", aiVisBtn:"侦测变化", aiVisTitle:"卫星影像变化报告", aiVisSub:"比较 {a} → {b}", aiVisBefore:"之前", aiVisAfter:"之后", aiVisCapturing:"正在撷取影像…", aiVisPickDates:"请选择两个日期进行比较。", aiVisNeedsDated:"请在卫星模式中改用可选日期的提供者（MODIS／VIIRS／Sentinel-2）。", aiVisCapFail:"无法撷取地图影像。" 
,
      tabMonitors:"监控",
    },
  /* ② the inline strings — every L(…) call site in js/*.js, keyed by its English text.
     1882 of them. A key left untranslated renders in English. */
  inline: {
    ' · right-drag to rotate': " ・右键拖动可旋转",   /* map-tools.js */
    ' · Shift afterburner': " ・Shift 后燃器",   /* flight-sim.js */
    ' biggest shown — click an item or pin to fly': " 个最大者，点击项目或图钉即可飞往",   /* atlas-console.js */
    ' cities/towns w/ OSM population tags': " 个具 OSM 人口标记的城镇",   /* atlas-console.js */
    ' d': " 天",   /* space.js */
    ' lower': "弱",   /* seismic.js */
    ' lunar eclipse': " 月食",   /* space.js */
    ' onto ': " 进入 ",   /* routing.js */
    ' solar eclipse': " 日食",   /* space.js */
    ' upper': "强",   /* seismic.js */
    '— true shape preserved': "— 保持真实形状",   /* map-tools.js */
    '— true size preserved': "— 保持真实面积",   /* map-tools.js */
    '(currency not stated)': "（未注明币别）",   /* industry-web.js */
    '(flight too short to map)': "（飞行距离太短，无法绘制）",   /* flight-sim.js */
    '(interrupted)': "（已中断）",   /* atlas-sims.js */
    '(live)': "（实时）",   /* space.js */
    '(no answer returned)': "（没有回应）",   /* atlas-console.js */
    '(no loaded news points inside the drawn area)': "（所绘范围内没有已加载的新闻点）",   /* atlas-console.js */
    '(none found in OSM within the radius)': "（半径内在 OSM 中找不到）",   /* atlas-console.js */
    '(unverified — data missing)': "（未经查证 — 缺少数据）",   /* terrain-water.js */
    '(up to 10)': "（最多 10 个）",   /* stats-compare.js */
    '(working back from the arrival deadline)': "（由抵达期限往回推算）",   /* routing.js */
    '← Exit workspace': "← 离开工作区",   /* workspace.js */
    '↻ Fly again': "↻ 再飞一次",   /* flight-sim.js */
    '↻ live': "↻ 实时",   /* cameras.js */
    '<1h ago': "1 小时内",   /* atlas-console.js */
    '−10y': "−10年",   /* news-timeline.js */
    '−5y': "−5年",   /* news-timeline.js */
    '▸ Show aspect (direction)': "▸ 显示坡向",   /* sims.js */
    '▸ Show slope (steepness)': "▸ 显示坡度",   /* sims.js */
    '◎ places the epicenter · ◇ adds a place.': "◎ 放置震央・◇ 新增地点。",   /* seismic.js */
    '⚠ Capped at 600 results — zoom into a sub-region for the rest': "⚠ 已限制为 600 笔结果 — 请放大到较小区域查看其余",   /* atlas-console.js */
    '⚠ Wikidata is community-maintained, so coverage is uneven: a company nobody has entered is simply absent, and «the largest» means «the largest Wikidata has a revenue for». An ownership graph is not a market-share or influence graph.': "⚠ Wikidata 由社群维护，因此涵盖程度并不平均：没有人建档的公司就是不存在于此，而「最大」的意思是「Wikidata 有营收数据者之中最大」。持股关系图不等于市占率或影响力图。",   /* industry-web.js */
    '✓ LANDED': "✓ 已降落",   /* flight-sim.js */
    '✕ CRASHED': "✕ 坠毁",   /* flight-sim.js */
    '⬡ = approximate extent (no official boundary exists — AI-traced outline)': "⬡＝概略范围（没有官方界线 — 由 AI 描绘）",   /* atlas-console.js */
    '⬡ = approximate extent (no official boundary exists)': "⬡＝概略范围（没有官方界线）",   /* atlas-console.js */
    '⬡ = approximate extent derived from web-verified boundary anchors (no official boundary exists for this region)': "⬡＝依据网络查证的边界锚点推得的概略范围（此区域没有官方界线）",   /* atlas-console.js */
    '📍 Current map view': "📍 目前地图画面",   /* flight-sim.js */
    '📍 Last flight end point': "📍 上次飞行终点",   /* flight-sim.js */
    '1 psi — windows shatter, light injuries': "1 psi — 玻璃破碎、轻伤",   /* atlas-sims.js */
    '1900 to present': "1900 年至今",   /* news-timeline.js */
    '20 psi — total destruction': "20 psi — 完全摧毁",   /* atlas-sims.js */
    '3-D volume': "立体体积",   /* volume3d.js */
    '3-D volume tool unavailable': "立体体积工具无法使用",   /* atlas-console.js */
    '3D globe': "3D 地球仪",   /* atlas-console.js */
    '3D terrain': "3D 地形",   /* atlas-console.js workspace.js */
    '5 psi — most buildings collapse': "5 psi — 多数建筑倒塌",   /* atlas-sims.js */
    'A custom score needs at least two indicators (components)': "自定义评分至少需要两项指标（成分）",   /* atlas-console.js */
    'a day back': "往前一天",   /* space.js */
    'a day on': "往后一天",   /* space.js */
    'a month back': "往前一个月",   /* space.js */
    'A month is a CLIMATOLOGY of that calendar month (six years averaged), not that month of a particular year.': "「月」是该历月的气候值（六年平均），并不是某一特定年份的那个月。",   /* ocean-currents.js */
    'a month on': "往后一个月",   /* space.js */
    'a year back': "往前一年",   /* space.js */
    'a year on': "往后一年",   /* space.js */
    'about': "约",   /* atlas-console.js */
    'above ground': "离地",   /* drone-nav.js */
    'above horizontal': "仰角",   /* atlas-console.js */
    'above MSL': "平均海平面以上",   /* world-packs.js */
    'above sea level': "海拔",   /* drone-nav.js */
    'Above the horizon': "在地平线以上",   /* satellite-detail.js */
    'Above the horizon here': "在此地的地平线以上",   /* satellites-live.js */
    'above the trend': "高于趋势",   /* analysis-panels.js */
    'Absolute magnitude': "绝对星等",   /* space.js */
    'Accent color': "强调色",   /* atlas-console.js */
    'Account': "账号",   /* atlas-console.js workspace.js */
    'Actions': "操作",   /* tool-panel.js */
    'active — rain washing particles down': "活跃 — 降雨正在冲刷粒状物",   /* atlas-console.js */
    'Add a place': "新增地点",   /* seismic.js */
    'Add a stop': "新增停靠点",   /* routing.js */
    'Add at center': "加在中心",   /* drone-nav.js */
    'Add at least two waypoints, then compute.': "请至少加入两个航点后再计算。",   /* drone-nav.js */
    'Add countries above to compare them.': "请在上方加入国家以进行比较。",   /* stats-compare.js */
    'Add on map': "在地图上新增",   /* drone-nav.js */
    'Adjusted to the terrain': "已贴合地形",   /* atlas-console.js */
    'admin borders': "行政区界",   /* atlas-console.js */
    'Advanced — model assumptions': "进阶 — 模型假设",   /* seismic.js */
    'Advisory': "注意",   /* world-packs.js */
    'Age of the elements': "元素的年龄",   /* satellite-detail.js */
    'AGL': "离地高度",   /* flight-sim.js */
    'ago': "前",   /* monitors.js */
    'AI failed (data kept)': "AI 执行失败（数据已保留）",   /* monitors.js */
    'AI-generated — verify with primary sources for important decisions.': "AI 生成内容 — 重要决策请以原始数据查证。",   /* analysis-panels.js */
    'Air around it': "周围空气",   /* aircraft-detail.js */
    'air quality': "空气质量",   /* atlas-console.js */
    'air quality (no place given)': "空气质量（未指定地点）",   /* atlas-console.js */
    'Airborne': "飞行中",   /* flight-sim.js */
    'airborne, up to': "空中，最高可达",   /* atlas-console.js */
    'Aircraft': "航机",   /* aircraft-detail.js drone-nav.js flight-sim.js */
    'Aircraft at real altitude': "航机以实际高度显示",   /* atlas-console.js */
    'Aircraft limits': "航机性能限制",   /* drone-nav.js */
    'Aircraft track cleared': "已清除航机轨迹",   /* atlas-console.js */
    'Airfield': "机场（简易）",   /* drone-ops.js */
    'Airport': "机场",   /* drone-ops.js */
    'AIRSPEED': "空速",   /* flight-sim.js */
    'airspeed capped at never-exceed': "空速已限制在不可超越速度",   /* aircraft-detail.js */
    'airspeed raised to the stall margin': "空速已提高到失速余裕",   /* aircraft-detail.js */
    'alert areas': "警报区域",   /* world-packs.js */
    'All': "全部",   /* world-packs.js */
    'All active satellites': "所有现役卫星",   /* satellites-live.js */
    'all conditions met': "所有条件皆已符合",   /* atlas-console.js */
    'All indicators': "所有指标",   /* stats-compare.js */
    'All outlets': "所有媒体",   /* news-sources.js */
    'all painting': "所有绘制内容",   /* atlas-console.js */
    'All systems normal.': "系统一切正常。",   /* atlas-console.js */
    'All-sky chart': "全天星图",   /* night-sky.js */
    'Allied / Entente Powers': "协约国阵营",   /* atlas-sims.js */
    'along': "沿着",   /* viewshed.js */
    'Along the way': "沿途",   /* routing.js */
    'already': "已经",   /* atlas-console.js */
    'Already in normal mode': "已经是一般模式",   /* atlas-console.js */
    'Already in workspace mode': "已经是工作区模式",   /* atlas-console.js */
    'Already running — it’s in progress.': "已在执行中 — 正在进行。",   /* monitors.js */
    'Already running on': "已在执行于",   /* atlas-console.js */
    'alt': "高度",   /* atlas-sims.js */
    'Alternative': "替代方案",   /* routing.js */
    'altitude': "高度",   /* atlas-console.js */
    'Altitude': "高度",   /* satellite-detail.js satellites-live.js sims.js */
    'ALTITUDE': "高度",   /* flight-sim.js */
    'Altitude (baro)': "高度（气压）",   /* aircraft-detail.js */
    'Altitude (GPS)': "高度（GPS）",   /* aircraft-detail.js */
    'Altitude band above sea level': "海拔高度带",   /* tool-panel.js */
    'altitude capped at the service ceiling': "高度已限制在实用升限",   /* aircraft-detail.js */
    'Altitude profile — terrain (filled) and the planned path': "高度剖面 — 地形（填色）与规划路径",   /* drone-nav.js */
    'amber = Fresnel-obstructed': "琥珀色＝受菲涅耳区遮蔽",   /* viewshed.js */
    'Ambiguous (several places share this name — not placed): ': "名称不明确（多个地点同名，未放置）：",   /* atlas-verify.js */
    'an hour back': "往前一小时",   /* world-packs.js */
    'an hour on': "往后一小时",   /* world-packs.js */
    'Analysis & simulation': "分析与模拟",   /* tool-panel.js */
    'Analyze': "分析",   /* viewshed.js */
    'Analyzing': "分析中",   /* atlas-console.js */
    'annular': "环食",   /* space.js */
    'Antenna gain (each end)': "天线增益（两端）",   /* drone-nav.js */
    'Antenna height (m)': "天线高度（米）",   /* sims.js viewshed.js */
    'Anyone who opens this link sees the map exactly as you do now.': "任何开启此链接的人，看到的地图都与你现在的画面完全相同。",   /* map-ui.js */
    'AoA': "攻角",   /* flight-sim.js */
    'apart': "相距",   /* drone-nav.js */
    'apart in time': "时间相距",   /* drone-nav.js */
    'Apogee (peak altitude)': "远地点（最高高度）",   /* atlas-console.js */
    'Apogee / perigee': "远地点／近地点",   /* satellite-detail.js */
    'appears as you zoom out': "缩小时显示",   /* atlas-console.js */
    'Applied': "已应用",   /* news-timeline.js */
    'Apply': "应用",   /* app-body.js */
    'approx.': "约",   /* atlas-console.js */
    'Approximate — 1916 empires (German, Austro-Hungarian, Ottoman, Russian, British) are shown on today’s borders. Romania & the US were still neutral in March 1916; both joined the Allies later (Aug 1916 / 1917).': "概略 — 1916 年的帝国（德意志、奥匈、鄂图曼、俄罗斯、大英）绘制在今日的国界上。1916 年 3 月时罗马尼亚与美国仍为中立，之后才加入协约国（1916 年 8 月／1917 年）。",   /* atlas-sims.js */
    'Approximate — historical powers mapped onto modern borders.': "概略 — 历史强权对应到现代国界。",   /* atlas-console.js */
    'Apr': "4月",   /* ocean-currents.js */
    'area': "面积",   /* countries-ui.js */
    'Area': "面积",   /* monitors.js */
    'area layer values': "区域图层数值",   /* atlas-console.js */
    'Area monitor': "区域监看",   /* monitors.js */
    'area news': "区域新闻",   /* atlas-console.js */
    'area population': "区域人口",   /* atlas-console.js */
    'Area ready': "范围已就绪",   /* monitors.js */
    'area(s)': "个区域",   /* routing.js */
    'Arrival times': "到达时刻",   /* routing.js */
    'Arrivals are ray-traced through the IASP91 Earth model; surface waves use 3.5 / 4.4 km/s group velocity. Ground motion is the stochastic method (Brune source; trilinear geometrical spreading AND path duration after Atkinson & Boore 1995; frequency-dependent crustal Q = Q₀·f^η after Raoof, Herrmann & Malagnini 1999; κ = 0.035 s; and the Cartwright & Longuet-Higgins 1956 peak factor with its bandwidth term). A point source and a drawn rupture are the SAME finite source: a point stands for the rupture its magnitude implies (Wells & Coppersmith 1994, log₁₀ A = −3.49 + 0.91·M — 2,163 km² at M7.5), so the distance is to that footprint combined with the focal depth, and a drawn rupture uses its own outline instead (M₀ = μAD̄) with wavefronts that carry the rupture propagation (Vr = 0.75β). No pseudo-depth is added to either, so the two agree at the same magnitude. The site term varies with the real terrain: Vs30 from topographic slope (Wald & Allen 2007) in quarter-wavelength amplification, measured over the DEM\'s own sample spacing and skipped where that is coarser than 2 km; sea cells are not painted. MMI is converted with the ShakeMap relation of Worden et al. 2012 from PGV taken over the band a strong-motion record delivers it in (4-pole high-pass at 0.1 Hz), and is NOT the JMA shindo scale. The JMA shindo IS its own definition here (気象庁「計測震度の算出方法」): the period-effect, 10 Hz high-cut and 0.5 Hz low-cut filters applied to the acceleration spectrum, then the level exceeded for a total of 0.3 s, I = 2·log₁₀ a₀ + 0.94 — the three components isotropised at V/H = 2/3 rather than simulated separately. The painted field runs to the end of the lowest class of the chosen scale: within 1,500 km it follows the terrain, and beyond that one cell is wider than the landforms inside it, so the field is a function of distance alone and is drawn as such. Past 1,000 km the regional spreading law is extrapolated, the panel says how much of the field that is, and the table still declines to print an intensity there. Educational model: in a real emergency follow the official authorities.': "到达时刻以 IASP91 地球模型进行射线追踪；表面波采用 3.5／4.4 km/s 群速度。地动采用随机震源法（Brune 震源谱；三段折线几何衰减与路径延时（Atkinson & Boore 1995）；频率相依的地壳 Q = Q₀·f^η（Raoof, Herrmann & Malagnini 1999）；κ = 0.035 秒；以及含带宽项的 Cartwright & Longuet-Higgins 1956 峰值因子）。点震源与绘制的震源域视为同一个有限震源：点震源代表其规模所隐含的破裂面（Wells & Coppersmith 1994，log₁₀ A = −3.49 + 0.91·M，M7.5 时为 2,163 km²），距离即为到该面的距离与震源深度的合成；绘制震源域时则改用其自身轮廓（M₀ = μAD̄），波前并带有破裂传播（Vr = 0.75β）。两者都不另加等效深度，因此相同规模下两者一致。场址项随真实地形变化：以地形坡度推估 Vs30（Wald & Allen 2007）并代入四分之一波长放大法，坡度以 DEM 自身的采样间距量测，间距粗于 2 km 时不使用；海域不上色。MMI 以 Worden et al. 2012 的 ShakeMap 关系式由 PGV 换算，PGV 取自强震纪录实际可提供的频带（0.1 Hz 四阶高通），并非气象厅震度阶级。气象厅震度在此依其本身定义计算（気象庁「计测震度の算出方法」）：对加速度频谱施加周期效应、10 Hz 高切与 0.5 Hz 低切滤波，取合计超过 0.3 秒的加速度 a₀，I = 2·log₁₀ a₀ + 0.94；三分量以 V/H = 2/3 等向化处理，而非分别模拟。着色范围延伸到所选阶级最低一级的边界：1,500 km 以内依循地形，超出后單一格子已宽于其中的地形起伏，因此仅为距离的函数并如实绘制。超过 1,000 km 属于区域衰减式的外插，面板会标示其占比，表格则不列出震度。此为教育用模型：实际灾害时请遵从官方指示。",   /* seismic.js */
    'Arrive at destination': "抵达目的地",   /* routing.js */
    'Arrive by': "最晚抵达",   /* routing.js */
    'Arrows: the measured flow — bigger and brighter where it is faster': "箭头：实测的流动 — 越快则越大越亮",   /* data-layers.js */
    'article': "篇报道",   /* atlas-console.js */
    'Article': "报道",   /* atlas-console.js */
    'articles': "篇报道",   /* atlas-console.js */
    'articles → ': "篇报道 → ",   /* atlas-console.js */
    'articles from ': "篇报道，来源：",   /* atlas-console.js */
    'As of': "数据时间",   /* atlas-console.js */
    'Ashfall': "火山灰降落",   /* sims.js */
    'ashfall plume': "火山灰烟流",   /* atlas-console.js */
    'Ask a follow-up…': "继续追问…",   /* analysis-panels.js */
    'Ask AI about here': "询问 AI 关于此地",   /* analysis-panels.js */
    'Ask anything about this spot…': "想问这个地点的什么都可以…",   /* analysis-panels.js */
    'Ask Atlas': "询问 Atlas",   /* tool-panel.js */
    'Ask Atlas anything…': "想问 Atlas 什么都可以…",   /* atlas-console.js */
    'Ask in plain language — Atlas drives the map for you. Try:': "用日常语言提问 — Atlas 会替你操作地图。试试看：",   /* atlas-console.js */
    'ask me anything about this spot': "想问这个地点的什么都可以",   /* atlas-console.js */
    'Ask me anything about this spot — I know exactly where it is.': "想问这个地点的什么都可以 — 我很清楚它在哪里。",   /* atlas-console.js */
    'Asteroid': "小行星",   /* space.js */
    'Asteroids & comets': "小行星与彗星",   /* space.js */
    'Asteroids and comets, from JPL Small-Body Database elements': "小行星与彗星，来自 JPL 小天体数据库的轨道要素",   /* space.js */
    'Asteroids and comets: JPL Small-Body Database osculating elements, propagated two-body. Planetary perturbations move the real body off this ellipse over years — enough to see where something is, not enough to point a telescope.': "小行星与彗星：JPL 小天体数据库的密切轨道要素，以二体问题外推。行星摄动会在数年间使实际天体偏离此椭圆 — 足以看出大致位置，但不足以据此指向望远镜。",   /* space.js */
    'at greatest elongation': "处于大距",   /* space.js */
    'at opposition': "处于冲",   /* space.js */
    'At the end of the road, ': "在道路尽头，",   /* routing.js */
    'At the roundabout take the ': "在圆环处走",   /* routing.js */
    'at the shore': "在岸边",   /* tsunami.js */
    'Atlas': "Atlas",   /* workspace.js */
    'Atlas (assistant)': "Atlas（助理）",   /* workspace.js */
    'Atlas can be inaccurate — verify important facts.': "Atlas 可能出错 — 重要事实请自行查证。",   /* atlas-console.js */
    'Atlas console': "Atlas 主控台",   /* keyboard-shortcuts.js */
    'Attach a file': "附加文件",   /* atlas-console.js */
    'Attach a file (image or text)': "附加文件（图片或文字）",   /* atlas-console.js */
    'Aug': "8月",   /* ocean-currents.js */
    'auto': "自动",   /* terrain-water.js */
    'Average slip (m)': "平均滑移量（米）",   /* seismic.js */
    'Avoid routing via Valhalla (OSM).': "避开路线由 Valhalla（OSM）计算。",   /* routing.js */
    'Avoid:': "避开：",   /* routing.js */
    'avoids ': "避开 ",   /* routing.js */
    'Axial tilt': "转轴倾角",   /* space.js */
    'az.': "方位",   /* satellites-live.js */
    'Azimuth': "方位角",   /* satellite-detail.js sims.js */
    'back a quarter cycle (6h12m)': "回退四分之一周期（6小时12分）",   /* world-packs.js */
    'back to now': "回到现在",   /* night-sky.js */
    'Back to now': "回到现在",   /* atlas-console.js news-timeline.js */
    'Back to statistics': "回到统计",   /* stats-compare.js */
    'Back to the map': "回到地图",   /* space.js */
    'Back to the normal layout': "回到一般版面",   /* atlas-console.js */
    'Bank': "倾斜",   /* aircraft-detail.js */
    'Bar chart': "长条图",   /* stats-compare.js */
    'barely felt': "几乎无感",   /* seismic.js */
    'base': "基准",   /* sims.js */
    'Base map & labels': "底图与标注",   /* map-ui.js */
    'basin': "流域",   /* terrain-water.js */
    'Basin boundary: real hydrological data — ': "流域界线：实测水文数据 — ",   /* atlas-console.js */
    'Basin outline unavailable — main stem only': "无流域轮廓数据 — 仅显示主流",   /* atlas-console.js */
    'Basis': "依据",   /* atlas-console.js */
    'battery': "电量",   /* atlas-console.js */
    'Battery': "电量",   /* drone-nav.js */
    'Bear slightly left': "稍微靠左",   /* routing.js */
    'Bear slightly right': "稍微靠右",   /* routing.js */
    'Bearing': "方位",   /* app-body.js atlas-console.js */
    'below DEM resolution': "低于 DEM 分辨率",   /* terrain-water.js */
    'Below the horizon': "在地平线以下",   /* satellite-detail.js */
    'below the horizon here': "在此地的地平线以下",   /* space.js */
    'Below the horizon here': "在此地的地平线以下",   /* satellites-live.js */
    'below the trend': "低于趋势",   /* analysis-panels.js */
    'Beyond the solar system: SIMBAD (CDS Strasbourg) positions, placed at the MEDIAN of every published distance measurement — methods disagree, sometimes by tens of per cent. Objects with no published distance are drawn on the sphere, without depth.': "太阳系之外：SIMBAD（史特拉斯堡 CDS）的位置，距离取所有已发表量测值的中位数 — 不同方法之间有时相差数十个百分点。没有已发表距离的天体则画在天球上，不含深度。",   /* space.js */
    'biggest exception': "最大例外",   /* atlas-console.js */
    'Bird (2002) plate model': "Bird（2002）板块模型",   /* layer-packs.js */
    'Blocked — usable by diffraction': "受阻 — 可靠绕射通联",   /* viewshed.js */
    'Blocked by terrain': "受地形阻挡",   /* viewshed.js */
    'Border crossings': "边境通关口",   /* routing.js */
    'Borders': "国界",   /* atlas-console.js countries-ui.js news-timeline.js */
    'Borders on the map follow the era.': "地图上的国界依照所选年代。",   /* countries-ui.js */
    'Bottom ticker': "底部跑马灯",   /* atlas-console.js */
    'Boundary outline': "界线轮廓",   /* map-tools.js */
    'BRAKE': "煞车",   /* flight-sim.js */
    'Brightest (naked eye)': "最亮（肉眼可见）",   /* satellites-live.js */
    'Broad': "宽",   /* terrain-water.js */
    'brush the ground up or down, draw a levee, drop water — the flow paths, the ponding and the breach direction follow.': "把地面刷高或刷低、画一道堤防、倒下水量 — 流路、积水与溃决方向都会随之改变。",   /* atlas-console.js */
    'Bug report': "错误回报",   /* atlas-console.js */
    'Building the 360° horizon and stepping a year…': "正在建立 360° 地平线并推进一年…",   /* sims.js */
    'Bundled catalog': "内建目录",   /* satellites-live.js */
    'Burnout velocity': "燃烧结束速度",   /* atlas-console.js */
    'Bus': "巴士",   /* routing.js */
    'Butter — ': "平稳落地 — ",   /* flight-sim.js */
    'by rail': "搭乘铁路",   /* atlas-console.js */
    'Call sign': "呼号",   /* aircraft-detail.js */
    'CAM LVL': "视点水平",   /* flight-sim.js */
    'Cancel': "取消",   /* flight-sim.js monitors.js */
    'Cancel — click the far end': "取消 — 请点击另一端",   /* viewshed.js */
    'capped': "已达上限",   /* terrain-water.js */
    'Car park': "停车场",   /* drone-ops.js */
    'cells': "格",   /* drone-nav.js seismic.js sims.js */
    'cells at': "格，间距",   /* tsunami.js */
    'cells interpolated (no DEM)': "格为内插（无 DEM）",   /* terrain-water.js */
    'Centaur': "半人马小行星",   /* space.js */
    'Center the map on it': "将地图置中于此",   /* satellite-detail.js */
    'Centered the map on the location': "已将地图置中于该位置",   /* atlas-console.js */
    'Central Powers': "同盟国阵营",   /* atlas-sims.js */
    'Cesium could not start': "Cesium 无法启动",   /* atlas-console.js */
    'Change (partial)': "变化（部分）",   /* monitors.js */
    'Change reported': "已回报变化",   /* monitors.js */
    'Change the values and press Analyze to re-run at this site; right-click the map to move it.': "修改数值后按「分析」即可在此地重算；右键点击地图可移动地点。",   /* viewshed.js */
    'Channel': "频道",   /* terrain-water.js */
    'Check other routes': "查看其他路线",   /* drone-nav.js */
    'checks run': "项检查",   /* atlas-console.js */
    'Chernobyl': "车诺比",   /* atlas-console.js */
    'Choose an earthquake…': "选择一次地震…",   /* seismic.js */
    'Choose destination': "选择目的地",   /* routing.js */
    'Choose start (or click the map)': "选择起点（或点击地图）",   /* routing.js */
    'Circle': "圆形",   /* tool-panel.js */
    'circles': "个圆形",   /* atlas-console.js */
    'Cited sources': "引用来源",   /* atlas-console.js */
    'city': "城市",   /* atlas-console.js */
    'city lights loaded': "已加载城市灯光",   /* atlas-console.js */
    'City/population query failed (Overpass busy) — population context unavailable': "城市／人口查询失败（Overpass 忙碌）— 无法提供人口背景",   /* atlas-console.js */
    'Civilian': "民用",   /* aircraft-detail.js */
    'clear': "清除",   /* industry-web.js */
    'Clear': "清除",   /* viewshed.js */
    'Clear all': "全部清除",   /* map-tools.js */
    'Clear line of sight': "通视良好",   /* viewshed.js */
    'Clear route': "清除路线",   /* drone-nav.js */
    'clear sky': "晴空",   /* widgets.js */
    'Clear sort': "清除排序",   /* stats-compare.js */
    'clear-sky beam': "晴空直达辐射",   /* sims.js */
    'Clear.': "晴朗。",   /* drone-nav.js */
    'Cleared': "已清除",   /* atlas-console.js */
    'Cleared map highlights.': "已清除地图标示。",   /* atlas-console.js */
    'Cleared the map': "已清除地图",   /* atlas-console.js */
    'Cleared. Press Analyze to re-run here, or right-click the map to move the site.': "已清除。按「分析」可在此重算，或右键点击地图移动地点。",   /* viewshed.js */
    'clears by': "消散于",   /* viewshed.js */
    'Click 3 or more points on the map to trace the footprint.': "在地图上点击 3 个以上的点以描绘范围。",   /* tool-panel.js */
    'Click a country on the map to add it': "点击地图上的国家以加入",   /* app-body.js stats-compare.js */
    'click a pin for details · say "clear facilities" to remove': "点击图钉查看详情・说「清除设施」即可移除",   /* atlas-console.js */
    'Click along the line, double-click to finish.': "沿线点击，双击结束。",   /* terrain-water.js */
    'Click anywhere on the sea to read the arrival time there.': "点击海面任一处即可读取该处的到达时刻。",   /* tsunami.js */
    'Click on a country (land)': "请点击国家（陆地）",   /* app-body.js stats-compare.js */
    'Click the map': "点击地图",   /* drone-nav.js */
    'Click the map to add a place to this table.': "点击地图即可把地点加入此表。",   /* seismic.js */
    'Click the map to add an observation point.': "点击地图以新增观测地点。",   /* seismic.js */
    'Click the map to drop a waypoint.': "点击地图以放置航点。",   /* drone-nav.js */
    'Click the map to start drawing': "点击地图开始绘制",   /* map-tools.js */
    'Click the point to analyze.': "点击要分析的地点。",   /* sims.js */
    'Click to start, click each corner, and click the first point again to finish.': "点击开始，沿轮廓逐点点击，再次点击起点即可结束。",   /* seismic.js */
    'Click two corners': "点击两个角",   /* routing.js */
    'Clicking the map adds a place to the table below. Press the button again to turn this off.': "点击地图会把地点加入下方表格。再按一次按钮即可关闭。",   /* seismic.js */
    'Close': "关闭",   /* aircraft-detail.js map-tools.js map-ui.js */
    'Closed': "已关闭",   /* atlas-console.js */
    'closed basin below sea level': "低于海平面的内流盆地",   /* terrain-water.js */
    'Closest approach': "最接近",   /* drone-nav.js */
    'coasts in view · level now, and the next turn': "视野内的海岸・现在的姿态与下一个转弯",   /* world-packs.js */
    'COCKPIT': "座舱",   /* flight-sim.js */
    'cold': "寒流",   /* ocean-currents.js */
    'Cold current — colder than the sea at the same latitude': "寒流 — 比同纬度的海水冷",   /* data-layers.js */
    'Cold current — measurably colder than the sea at the same latitude': "寒流 — 实测比同纬度的海水冷",   /* ocean-currents.js */
    'Collapse to title bar': "收合为标题列",   /* workspace.js */
    'Color': "颜色",   /* map-tools.js */
    'Color map by residual (blue = above, red = below)': "以残差为地图上色（蓝＝高于，红＝低于）",   /* analysis-panels.js */
    'Combines a historical overview with current live-news evidence.': "结合历史概观与目前的实时新闻证据。",   /* atlas-console.js */
    'Comet': "彗星",   /* space.js */
    'Coming up': "即将发生",   /* space.js */
    'Commodity': "商品",   /* world-packs.js */
    'companies': "家企业",   /* industry-web.js */
    'Companies': "企业",   /* workspace.js */
    'Compare': "比较",   /* app-body.js atlas-console.js monitors.js */
    'Compare against': "比较对象",   /* monitors.js */
    'Compare countries': "比较国家",   /* stats-compare.js */
    'Compare off': "关闭比较",   /* atlas-console.js */
    'Compare panel': "比较面板",   /* atlas-console.js */
    'Compare routes': "比较路线",   /* drone-nav.js */
    'Compiled from current live-news evidence IntMap gathered.': "依据 IntMap 搜集到的实时新闻证据汇整。",   /* atlas-console.js */
    'Compute': "计算",   /* drone-nav.js */
    'Compute a route first.': "请先计算路线。",   /* routing.js */
    'Compute propagation': "计算传播",   /* tsunami.js */
    'Compute the intensity map': "计算震度分布",   /* seismic.js */
    'Compute the next pass from here': "计算下一次由此经过的时刻",   /* satellite-detail.js */
    'computed from the real elevation model for the current view; pan/zoom to update.': "依目前画面由实测高程模型计算；平移或缩放可更新。",   /* atlas-console.js */
    'Computed from this app’s own ephemeris. Solar-eclipse local circumstances (where on Earth it is total) are not computed.': "由本应用自有的星历计算。日食的地面观测条件（地球上何处为全食）不在计算范围内。",   /* space.js */
    'Computing': "计算中",   /* tsunami.js */
    'Computing sightlines…': "正在计算视线…",   /* viewshed.js */
    'Computing the intensity map': "正在计算震度分布",   /* seismic.js */
    'Computing upcoming events…': "正在计算即将发生的天象…",   /* space.js */
    'Computing…': "计算中…",   /* map-tools.js sims.js */
    'Conditions not met': "条件未满足",   /* drone-nav.js */
    'conflict(s)': "起冲突",   /* atlas-console.js */
    'Contact with this spacecraft was lost. What is drawn is where its trajectory says it is, not a tracked position.': "与这艘太空船已失去联系。画面上显示的是其轨迹推算的位置，并非追踪到的实际位置。",   /* space.js */
    'Continue': "继续",   /* routing.js */
    'Continue on ': "沿着 ",   /* routing.js */
    'Continue straight': "直行",   /* routing.js */
    'Continue upright': "保持水平",   /* flight-sim.js */
    'Continuous': "连续",   /* terrain-water.js */
    'Control not found': "找不到该控制项",   /* atlas-controls.js */
    'Controlling obstacle': "关键障碍物",   /* viewshed.js */
    'Controls': "操作",   /* flight-sim.js */
    'Coordinate grid': "坐标格线",   /* keyboard-shortcuts.js */
    'Coordinates': "坐标",   /* aircraft-detail.js */
    'Copied': "已复制",   /* atlas-reply.js */
    'Copied!': "已复制！",   /* map-ui.js */
    'Copy': "复制",   /* atlas-console.js atlas-reply.js map-ui.js */
    'Copy message': "复制讯息",   /* atlas-console.js */
    'Coriolis cross-range': "科氏力横向偏移",   /* atlas-console.js */
    'correlation': "相关性",   /* analysis-panels.js */
    'Correlation': "相关性",   /* analysis-panels.js */
    'Correlation / scatter': "相关性／散布图",   /* analysis-panels.js */
    'Correlation is not causation; outliers and confounders matter.': "相关不等于因果；离群值与干扰因素都很重要。",   /* analysis-panels.js */
    'Correlation tool': "相关性工具",   /* atlas-console.js */
    'Could not apply the avoid options (routing service busy) — showing the normal route.': "无法应用避开选项（路径服务忙碌）— 显示一般路线。",   /* atlas-console.js routing.js */
    'could not be fetched': "无法取得",   /* space.js */
    'Could not build that historical map — try naming the war/year more specifically': "无法建立该历史地图 — 请更明确指出战争或年份",   /* atlas-console.js */
    'Could not compute (service busy) — try again': "无法计算（服务忙碌）— 请再试一次",   /* map-tools.js */
    'Could not compute the reachable area (routing service busy) — try again.': "无法计算可达范围（路径服务忙碌）— 请再试一次。",   /* atlas-console.js */
    'Could not confirm the layer actually painted on the map (its data may still be loading or its source may be down) — check the map; toggling it again may help': "无法确认图层是否真的画在地图上（数据可能仍在加载，或来源已离线）— 请检查地图，重新切换一次或许有帮助",   /* atlas-console.js */
    'Could not create the monitor.': "无法建立监看。",   /* atlas-console.js monitors.js */
    'Could not delete the monitor.': "无法删除监看。",   /* atlas-console.js */
    'Could not draw the map shading': "无法绘制地图着色",   /* atlas-console.js */
    'Could not draw the markers (map still loading)': "无法绘制标记（地图仍在加载）",   /* atlas-console.js */
    'Could not draw the markers (map still loading) — try again': "无法绘制标记（地图仍在加载）— 请再试一次",   /* atlas-console.js */
    'Could not draw the pins (map still loading)': "无法绘制图钉（地图仍在加载）",   /* atlas-console.js */
    'Could not fetch the live wind data the dispersion model needs': "无法取得扩散模型所需的实时风场数据",   /* atlas-console.js */
    'Could not find one of those places': "找不到其中一个地点",   /* atlas-console.js */
    'Could not load cameras — try again.': "无法加载摄影机 — 请再试一次。",   /* cameras.js */
    'Could not load country data — try again.': "无法加载国家数据 — 请再试一次。",   /* analysis-panels.js */
    'Could not load enough terrain data — try again.': "无法加载足够的地形数据 — 请再试一次。",   /* viewshed.js */
    'Could not load enough terrain data — wait a moment and press Analyze again.': "无法加载足够的地形数据 — 请稍候再按「分析」。",   /* viewshed.js */
    'Could not load monitors.': "无法加载监看列表。",   /* monitors.js */
    'Could not load the satellite catalog.': "无法加载卫星目录。",   /* satellites-live.js */
    'Could not paint the highlight (map still loading) — try again': "无法绘制标示（地图仍在加载）— 请再试一次",   /* atlas-console.js */
    'Could not pause the monitor.': "无法暂停监看。",   /* atlas-console.js */
    'Could not reach the USGS feed.': "无法连接到 USGS 数据源。",   /* seismic.js */
    'Could not read enough terrain here.': "此处无法读取足够的地形数据。",   /* sims.js */
    'Could not research this right now': "目前无法进行这项研究",   /* atlas-console.js */
    'Could not resume the monitor.': "无法恢复监看。",   /* atlas-console.js */
    'Could not run the map self-check for this answer.': "无法对这个回答执行地图自我检查。",   /* atlas-console.js */
    'Could not save the monitor.': "无法保存监看。",   /* monitors.js */
    'Could not start the flight simulator': "无法启动飞行模拟器",   /* atlas-console.js */
    'Could not verify the drawn shapes on the map': "无法在地图上验证所绘制的图形",   /* atlas-console.js */
    'Couldn\'t get your location — please try again.': "无法取得你的位置 — 请再试一次。",   /* atlas-console.js */
    'countries': "个国家",   /* atlas-console.js world-packs.js */
    'Countries': "国家",   /* analysis-panels.js news-timeline.js workspace.js */
    'countries scored': "个国家已评分",   /* atlas-console.js */
    'Country comparison opened': "已开启国家比较",   /* atlas-console.js */
    'Country info': "国家信息",   /* atlas-console.js */
    'Country not found': "找不到国家",   /* atlas-console.js */
    'Country outlines are not loaded yet — open the Countries tab once and try again.': "国界轮廓尚未加载 — 请先开启一次「国家」分页再试。",   /* routing.js */
    'Country sets drawn from real national borders (UN M49 standard where applicable)': "国家集合取自真实国界（适用处采 UN M49 标准）",   /* atlas-console.js */
    'country stats': "国家统计",   /* atlas-console.js */
    'covered': "已涵盖",   /* sims.js */
    'CRASHED': "坠毁",   /* flight-sim.js */
    'Create monitor': "建立监看",   /* monitors.js */
    'Crest above ground (m)': "坝顶高出地面（米）",   /* terrain-water.js */
    'Critical': "严重",   /* monitors.js */
    'Crop': "作物",   /* world-packs.js */
    'Crop cultivation': "作物栽培",   /* world-packs.js */
    'cross-sections': "剖面",   /* terrain-water.js */
    'Cruise speed is set above the aircraft’s maximum speed.': "巡航速度设置超过该机型的最大速度。",   /* drone-nav.js */
    'Crustal Q = Q₀·f^η': "地壳 Q = Q₀·f^η",   /* seismic.js */
    'current': "目前",   /* news-timeline.js */
    'Current location': "目前位置",   /* atlas-console.js */
    'Current map view': "目前地图画面",   /* monitors.js */
    'current view': "目前画面",   /* atlas-console.js */
    'Custom': "自定义",   /* drone-nav.js */
    'Custom color': "自定义颜色",   /* tool-panel.js */
    'custom evaluation layer': "自定义评估图层",   /* atlas-console.js */
    'Custom score': "自定义评分",   /* atlas-console.js */
    'Cycle': "周期",   /* map-tools.js routing.js */
    'd': "日",   /* terrain-water.js */
    'Daily': "每日",   /* monitors.js */
    'Data & connection status': "数据与连接状态",   /* atlas-console.js */
    'Data used': "使用的数据",   /* atlas-console.js */
    'Date': "日期",   /* news-timeline.js */
    'day': "日",   /* space.js */
    'Day/night': "昼夜",   /* news-timeline.js */
    'days': "天",   /* space.js */
    'days a year with no sun at all': "每年完全没有日照的天数",   /* sims.js */
    'Dec': "12月",   /* ocean-currents.js */
    'deep space': "深太空",   /* satellite-detail.js */
    'default': "默认",   /* atlas-console.js */
    'Delete': "删除",   /* map-tools.js monitors.js tool-panel.js */
    'Delete this monitor and its history?': "要删除此监看及其历史纪录吗？",   /* monitors.js */
    'Deleted': "已删除",   /* atlas-console.js */
    'density ': "密度 ",   /* atlas-console.js */
    'Depart at': "出发时间",   /* routing.js */
    'Deposition stays below mapped thresholds in this run (winds carried most activity out of the modeled area).': "本次模拟的沉降量低于制图门槛（风把大部分活度带出了模拟范围）。",   /* atlas-console.js */
    'Depressed': "下陷",   /* atlas-console.js */
    'depth': "深度",   /* seismic.js tsunami.js */
    'depth ': "深度 ",   /* atlas-console.js */
    'Depth (km)': "深度（公里）",   /* seismic.js */
    'Depth per stroke (m)': "每笔的深度（米）",   /* terrain-water.js */
    'Details': "详细数据",   /* space.js stats-compare.js */
    'Diameter': "直径",   /* space.js */
    'Differences': "差异",   /* routing.js */
    'diffraction loss': "绕射损失",   /* viewshed.js */
    'Directions': "路线指引",   /* routing.js */
    'Dirty bomb': "脏弹",   /* atlas-console.js */
    'Disaster simulator': "灾害模拟器",   /* atlas-console.js sims.js */
    'Discharge (m³/s)': "流量（m³/s）",   /* terrain-water.js */
    'dispersion': "扩散",   /* atlas-console.js */
    'displayed-layer values': "显示图层数值",   /* atlas-console.js */
    'Distance': "距离",   /* viewshed.js */
    'DISTANCE': "距离",   /* flight-sim.js */
    'distance only beyond': "仅依距离，超出",   /* seismic.js */
    'Domain': "计算范围",   /* tsunami.js */
    'Donate': "赞助",   /* atlas-console.js */
    'Done': "完成",   /* map-tools.js */
    'Done — use Redraw to start over': "完成 — 可按「重画」重新开始",   /* map-tools.js */
    'Done.': "完成。",   /* atlas-console.js */
    'Doppler factor': "都卜勒因子",   /* satellite-detail.js */
    'DOWN': "下",   /* flight-sim.js */
    'downrange': "射程方向",   /* atlas-sims.js */
    'Downstream': "下游",   /* terrain-water.js */
    'downwind': "下风处",   /* sims.js */
    'Drag ': "拖动 ",   /* map-tools.js */
    'Drag from one corner to the opposite one.': "从一角拖动到对角。",   /* tool-panel.js */
    'Drag from the center outwards to size the circle.': "从中心往外拖动以决定圆的大小。",   /* tool-panel.js */
    'Drag headers to reorder · click to sort': "拖动标题可重新排序・点击可排序",   /* stats-compare.js */
    'Drag term (B*)': "阻力项（B*）",   /* satellite-detail.js */
    'Drag the map normally. Pick a tool above to edit.': "照常拖动地图。请在上方选择工具以进行编辑。",   /* terrain-water.js */
    'Drag the slider to move the time of day, or press ▶ to run it. ⛰ adds the shade the terrain itself casts. ◎ then a click on the map reports that spot’s sunlight hours over a whole year.': "拖动滑杆可改变一天中的时刻，或按 ▶ 播放。⛰ 会加入地形自身投下的阴影。按 ◎ 后点击地图，即可回报该处全年的日照时数。",   /* sims.js */
    'Drag to look; use ◀ ▶ to turn (the map shows your facing).': "拖动可环顾四周；用 ◀ ▶ 转向（地图会显示你的朝向）。",   /* street-view.js */
    'Drag to move all the borders that meet here': "拖动可一并移动在此交会的所有边界",   /* workspace.js */
    'Drag to resize': "拖动可调整大小",   /* workspace.js */
    'Draw / trace': "绘制／描绘",   /* workspace.js */
    'Draw a radius': "画出半径",   /* tool-panel.js */
    'Draw an area': "画出范围",   /* routing.js */
    'Draw an area / place a circle first, or name a place.': "请先画出范围或放置圆形，或指定一个地点。",   /* atlas-console.js */
    'Draw the rupture area': "绘制震源域",   /* seismic.js */
    'Draw the rupture area on the map.': "请在地图上圈出震源域。",   /* seismic.js */
    'Drawing': "绘制中",   /* map-tools.js */
    'drawings': "个绘制图形",   /* atlas-console.js */
    'Drawings': "绘制图形",   /* map-tools.js */
    'drawn': "已绘制",   /* atlas-console.js */
    'Drawn area': "绘制的范围",   /* monitors.js */
    'Drawn from real OpenStreetMap boundary data': "依据 OpenStreetMap 的实际界线数据绘制",   /* atlas-console.js */
    'Drawn from the real administrative boundaries of the region\'s member units': "依据该区域各成员單位的实际行政界线绘制",   /* atlas-console.js */
    'Drive': "开车",   /* map-tools.js routing.js */
    'Drone navigation': "无人机航线规划",   /* drone-nav.js */
    'Drone planner open': "已开启无人机规划器",   /* atlas-console.js */
    'Drone planner unavailable': "无人机规划器无法使用",   /* atlas-console.js */
    'due now': "现已到期",   /* monitors.js */
    'Duration': "持续时间",   /* satellite-detail.js */
    'each indicator’s value for this year, by its own source': "各指标当年的数值，依其各自来源",   /* stats-compare.js */
    'Each point is added to the table below. Press the button again to turn this off.': "新增的地点会列在下方表格中。再次按下按钮即可关闭。",   /* seismic.js */
    'earth horizon': "地球地平线",   /* viewshed.js */
    'Earth Replay': "地球回放",   /* atlas-console.js sims.js */
    'earthquakes': "地震",   /* atlas-console.js */
    'Earthquakes': "地震",   /* monitors.js */
    'Earthquakes (7 days, in radius)': "地震（7 天内，半径范围）",   /* atlas-console.js */
    'Earthquakes near the route (last 24 h)': "路线附近的地震（过去 24 小时）",   /* routing.js */
    'east': "东",   /* atlas-console.js */
    'Eccentricity': "离心率",   /* satellite-detail.js space.js */
    'Economy': "经济",   /* countries-ui.js */
    'Educational approximation only — in a real emergency follow official authorities. Flood = connected inundation from the real elevation model; ash/smoke = wind-advected plume on live wind; radioactive = the Lagrangian fallout model. Tsunamis are modeled separately, by the propagation simulator.': "仅为教育性近似 — 实际灾害时请遵从官方指示。淹水＝依实测高程模型计算的连通淹没范围；火山灰／烟雾＝以实时风场推移的烟流；放射性＝拉格朗日沉降模型。海啸另由传播模拟器單独计算。",   /* sims.js */
    'elapsed': "已经过",   /* terrain-water.js */
    'Electricity': "电力",   /* world-packs.js */
    'elev.': "海拔",   /* satellites-live.js */
    'elevation': "高程",   /* atlas-console.js */
    'Elevation': "高程",   /* routing.js satellite-detail.js */
    'elevation (no place given)': "高程（未指定地点）",   /* atlas-console.js */
    'elevation from the map center': "由地图中心起算的高程",   /* atlas-console.js */
    'Elevation sampled live on a grid from the Copernicus DEM (Open-Meteo) — cells are graduated by depth/height.': "高程由 Copernicus DEM（Open-Meteo）实时采样成网格 — 各格依深度／高度分级。",   /* atlas-console.js */
    'elevation shading': "高程着色",   /* atlas-console.js */
    'Elevation tiles did not arrive — uniform site class, so the field is distance alone': "高程瓦片未送达 — 使用單一场址分类，因此震度仅是距离的函数",   /* seismic.js */
    'Elongation': "距角",   /* space.js */
    'Emergency warning': "紧急警报",   /* world-packs.js */
    'Emergency: ': "紧急：",   /* aircraft-detail.js */
    'Emission': "排放",   /* atlas-console.js */
    'Emitter category': "发射体类别",   /* aircraft-detail.js */
    'Employees': "员工人数",   /* industry-web.js */
    'end': "结束",   /* stats-compare.js */
    'Energy data could not be fetched.': "无法取得能源数据。",   /* world-packs.js */
    'Energy mix': "能源结构",   /* world-packs.js */
    'Enter a start and destination.': "请输入起点与目的地。",   /* routing.js */
    'Entering workspace…': "正在进入工作区…",   /* workspace.js */
    'Epoch': "历元",   /* satellite-detail.js */
    'equinox': "分点",   /* sims.js */
    'Era borders are still loading here — click again in a moment': "此处的年代国界仍在加载 — 请稍后再点一次",   /* app-body.js stats-compare.js */
    'error': "错误",   /* atlas-console.js */
    'Error': "错误",   /* monitors.js */
    'Error (data not saved)': "错误（数据未保存）",   /* monitors.js */
    'Error (report not saved)': "错误（报告未保存）",   /* monitors.js */
    'est. wave': "推估波高",   /* seismic.js */
    'Estimated time': "预估时间",   /* drone-nav.js */
    'Events (grouped news, last ': "事件（分群新闻，最近 ",   /* atlas-console.js */
    'events; the ': "起事件；共 ",   /* atlas-console.js */
    'Every': "每",   /* monitors.js */
    'Every 12 hours': "每 12 小时",   /* monitors.js */
    'Every 3 hours': "每 3 小时",   /* monitors.js */
    'Every 30 min': "每 30 分钟",   /* monitors.js */
    'Every 6 hours': "每 6 小时",   /* monitors.js */
    'Every condition is met.': "所有条件皆已满足。",   /* drone-nav.js */
    'Evidence': "证据",   /* monitors.js */
    'Exchange rates could not be fetched, so nothing is converted.': "无法取得汇率，因此未做任何换算。",   /* industry-web.js */
    'excl. pop <': "排除人口低于",   /* atlas-console.js */
    'excl. pop >': "排除人口高于",   /* atlas-console.js */
    'excluded for missing data': "因缺少数据而排除",   /* atlas-console.js */
    'exit': "离开",   /* routing.js */
    'Exit': "离开",   /* flight-sim.js */
    'exit ': "出口 ",   /* routing.js */
    'Exit workspace': "离开工作区",   /* workspace.js */
    'Export:': "导出：",   /* routing.js */
    'exports': "出口",   /* world-packs.js */
    'Exports': "出口",   /* world-packs.js */
    'external dose rate': "外部剂量率",   /* atlas-console.js */
    'extreme': "极端",   /* seismic.js */
    'Extreme': "极端",   /* widgets.js */
    'extreme nose attitude at touchdown': "触地时机首姿态过于极端",   /* flight-sim.js */
    'eye': "风暴眼",   /* night-sky.js */
    'Eye': "风暴眼",   /* view-controls.js */
    'facilities': "设施",   /* atlas-console.js */
    'facilities mapped': "处设施已标示",   /* atlas-console.js */
    'Facility search failed (OpenStreetMap Overpass busy, Wikidata had no match) — try again shortly': "设施搜索失败（OpenStreetMap Overpass 忙碌，Wikidata 也无相符项目）— 请稍后再试",   /* atlas-console.js */
    'facing': "朝向",   /* atlas-console.js */
    'Farmland': "农地",   /* drone-ops.js */
    'Farthest sight line': "最远视线",   /* viewshed.js */
    'Faster': "较快",   /* space.js */
    'Fastest': "最快",   /* routing.js */
    'Feb': "2月",   /* ocean-currents.js */
    'Feedback': "意见回馈",   /* atlas-console.js workspace.js */
    'Feels like': "体感温度",   /* weather.js */
    'ferries': "渡轮",   /* routing.js */
    'Ferries': "渡轮",   /* routing.js */
    'Ferry': "渡轮",   /* routing.js */
    'fertility rate': "生育率",   /* countries-ui.js */
    'Fetch & check': "取得并检查",   /* drone-nav.js */
    'Fetching USGS…': "正在取得 USGS…",   /* seismic.js */
    'field arrows at ': "点的流向箭头，间距 ",   /* ocean-currents.js */
    'Field arrows: shading and size are the measured speed (0 → 1.4 m/s)': "流向箭头：颜色深浅与大小代表实测流速（0 → 1.4 m/s）",   /* ocean-currents.js */
    'field loading…': "流向场加载中…",   /* ocean-currents.js */
    'filled from ': "补自 ",   /* stats-compare.js */
    'Filter bodies…': "筛选天体…",   /* space.js */
    'Final ground deposition (Cs-137-equivalent zones)': "最终地面沉降（铯-137 当量分区）",   /* atlas-console.js */
    'Find runways': "寻找跑道",   /* tool-panel.js */
    'findings': "项发现",   /* atlas-console.js */
    'Fine': "细",   /* terrain-water.js */
    'Finish drawing': "结束绘制",   /* seismic.js tool-panel.js */
    'Fires': "火灾",   /* monitors.js */
    'Firm — ': "平稳 — ",   /* flight-sim.js */
    'first arrival': "初达波",   /* tsunami.js */
    'First report': "最早报道",   /* atlas-console.js */
    'fixes': "次修正",   /* atlas-console.js */
    'FLAPS': "襟翼",   /* flight-sim.js */
    'Flat': "平面",   /* workspace.js */
    'flat → steep: green · yellow · orange · red (° gradient)': "平缓→陡峭：绿・黄・橙・红（角度梯度）",   /* sims.js */
    'Flat map': "平面地图",   /* atlas-console.js */
    'Flight': "飞行",   /* aircraft-detail.js */
    'Flight could not start': "无法开始飞行",   /* atlas-console.js */
    'flight path': "飞行路径",   /* atlas-console.js flight-sim.js */
    'Flight path — color = altitude (blue low → red high)': "飞行路径 — 颜色代表高度（蓝低 → 红高）",   /* flight-sim.js */
    'Flight Simulator': "飞行模拟器",   /* flight-sim.js */
    'Flight simulator — pick your aircraft & runway, then START': "飞行模拟器 — 选择机型与跑道，然后按 START",   /* atlas-console.js */
    'Flight simulator stopped': "已停止飞行模拟器",   /* atlas-console.js */
    'Flight time': "飞行时间",   /* atlas-console.js */
    'Flood': "淹水",   /* sims.js */
    'flood inundation': "淹水范围",   /* atlas-console.js */
    'flooded cells': "淹水格数",   /* terrain-water.js */
    'Flow stops here': "水流在此停止",   /* terrain-water.js */
    'Flow stops here (flat)': "水流在此停止（平坦）",   /* terrain-water.js */
    'Fly from these conditions': "以这些条件起飞",   /* aircraft-detail.js */
    'Fly to': "飞往",   /* map-tools.js */
    'Focus place search': "聚焦地点搜索",   /* keyboard-shortcuts.js */
    'FOLLOW': "追随",   /* flight-sim.js */
    'Follow terrain': "贴合地形",   /* drone-nav.js */
    'Follow the app clock — the sky as it is right now': "跟随应用时钟 — 呈现此刻的天空",   /* space.js */
    'Follows the real road network (Valhalla / OpenStreetMap) — not a distance circle.': "依循真实道路网（Valhalla／OpenStreetMap）— 不是距离圆。",   /* map-tools.js */
    'Footprint finished — map clicks no longer add points.': "范围已完成 — 点击地图不会再加入点。",   /* tool-panel.js */
    'Footprint radius': "覆盖半径",   /* satellite-detail.js */
    'For reference: natural background ≈ 2–3 mSv/yr; Japan\'s Fukushima evacuation criterion was 20 mSv/yr; Chernobyl\'s permanent-exclusion zone ≥1480 kBq/m².': "参考值：天然背景辐射约 2–3 mSv/年；日本福岛的避难基准为 20 mSv/年；车诺比永久禁区为 ≥1480 kBq/m²。",   /* atlas-console.js */
    'Former state': "前身国家",   /* countries-ui.js */
    'Framed the area on the map': "已在地图上框出该区域",   /* atlas-console.js */
    'Freehand': "手绘",   /* tool-panel.js */
    'Frequency (MHz)': "频率（MHz）",   /* sims.js viewshed.js */
    'Fresnel': "菲涅耳",   /* viewshed.js */
    'Fresnel zone obstructed': "菲涅耳区受阻",   /* viewshed.js */
    'from': "自",   /* tool-panel.js */
    'from bundled reference data': "取自内建参考数据",   /* stats-compare.js */
    'From the Earth': "自地球",   /* space.js */
    'From the map center': "自地图中心",   /* aircraft-detail.js satellite-detail.js satellites-live.js */
    'From the Sun': "自太阳",   /* space.js */
    'From where? Give a place.': "从哪里出发？请指定一个地点。",   /* atlas-console.js */
    'FUEL': "燃油",   /* flight-sim.js */
    'FUEL OUT': "燃油耗尽",   /* flight-sim.js */
    'Fukushima': "福岛",   /* atlas-console.js */
    'Full moon': "满月",   /* space.js */
    'Fullscreen': "全屏",   /* atlas-console.js keyboard-shortcuts.js */
    'Fullscreen unavailable here': "此处无法使用全屏",   /* atlas-console.js */
    'future — terminator only': "未来 — 仅显示晨昏线",   /* sims.js */
    'G-LIMIT': "G 限制",   /* flight-sim.js */
    'Galaxies & nebulae': "星系与星云",   /* space.js */
    'Galaxies, clusters and nebulae at their measured distances (SIMBAD)': "星系、星团与星云，依其实测距离配置（SIMBAD）",   /* space.js */
    'Galileo': "伽利略",   /* satellites-live.js */
    'Gamepad connected: ': "已连接游戏手把：",   /* flight-sim.js */
    'gap filled from the other source / bundled reference': "缺口由另一来源／内建参考数据补齐",   /* stats-compare.js */
    'gaps': "缺口",   /* viewshed.js */
    'GDP & population: Maddison Project (real GDP, 2011 int$). Other indicators: World Bank aggregate of the successor states.': "GDP 与人口：Maddison Project（实质 GDP，2011 年国际元）。其他指标：世界银行对继承国的合计。",   /* countries-ui.js */
    'GEAR': "起落架",   /* flight-sim.js */
    'gear-up belly landing': "收起起落架的机腹着陆",   /* flight-sim.js */
    'Generated': "产生时间",   /* monitors.js */
    'Geography': "地理",   /* countries-ui.js */
    'Geolocation unavailable': "无法取得定位",   /* atlas-console.js */
    'Geostationary': "地球同步静止",   /* satellites-live.js */
    'Geostationary (GEO)': "地球同步静止轨道（GEO）",   /* satellite-detail.js */
    'Geosynchronous (GSO)': "地球同步轨道（GSO）",   /* satellite-detail.js */
    'Give a year or date': "请提供年份或日期",   /* atlas-console.js */
    'Give me at least 2 places to visit (comma-separated), or drop pins first.': "请至少给我 2 个要造访的地点（以逗号分隔），或先放置图钉。",   /* atlas-console.js */
    'Give two dates (dateA / dateB, YYYY-MM-DD).': "请提供两个日期（dateA／dateB，YYYY-MM-DD）。",   /* atlas-console.js */
    'global': "全球",   /* tsunami.js */
    'Global feed: GDACS (Global Disaster Alert and Coordination System, UN/EC) — earthquakes, tropical cyclones, floods, volcanoes, droughts and wildfires.': "全球数据源：GDACS（联合国／欧盟的全球灾害警报与协调系统）— 地震、热带气旋、洪水、火山、干旱与野火。",   /* world-packs.js */
    'Globe': "地球仪",   /* atlas-console.js workspace.js */
    'Globe / flat / 3D terrain': "地球仪／平面／3D 地形",   /* keyboard-shortcuts.js */
    'Gold': "黄金",   /* map-ui.js */
    'Good': "良好",   /* widgets.js */
    'GPS': "GPS",   /* satellites-live.js */
    'Grass': "草地",   /* drone-ops.js */
    'Gray = terrain (curvature applied) · dashed = 60% Fresnel zone.': "灰色＝地形（已计入曲率）・虚线＝60% 菲涅耳区。",   /* viewshed.js */
    'green = terrain shadow': "绿色＝地形阴影",   /* viewshed.js */
    'Green alert': "绿色警戒",   /* world-packs.js */
    'Grid': "格线",   /* atlas-console.js tsunami.js */
    'Grid + labels': "格线＋标注",   /* workspace.js */
    'Ground (no-DEM fallback)': "地盘（无 DEM 时的替代值）",   /* seismic.js */
    'Ground at the site': "地点所在地面",   /* viewshed.js */
    'Ground below': "下方地面",   /* tool-panel.js */
    'Ground distance': "地面距离",   /* drone-nav.js */
    'Ground range': "地面射程",   /* atlas-console.js */
    'Ground speed': "地速",   /* aircraft-detail.js */
    'Ground station height': "地面站高度",   /* drone-nav.js */
    'Grouping is mechanical (place ≤150 km × time ≤48 h × headline similarity) on the loaded IntMap feed — one group = reports that likely cover the same occurrence; "first report → latest" shows how coverage moved. For source disagreements or deeper analysis, ask e.g. "analyze event 2".': "分群为机械式判定（地点 ≤150 km × 时间 ≤48 小时 × 标题相似度），仅就已加载的 IntMap 数据源 — 一个群组代表可能报道同一事件的多则报道；「最早报道 → 最新」显示报道如何演变。若要比较来源分歧或做更深入分析，可说「分析事件 2」。",   /* atlas-console.js */
    'h': "小时",   /* space.js terrain-water.js */
    'h ago': "小时前",   /* atlas-console.js */
    'Hard — ': "重落地 — ",   /* flight-sim.js */
    'hard rock (Vs30 1500)': "硬岩（Vs30 1500）",   /* seismic.js */
    'Hazardous': "危险",   /* widgets.js */
    'Heading (true / mag)': "航向（真／磁）",   /* aircraft-detail.js */
    'Height per stroke (m)': "每笔的高度（米）",   /* terrain-water.js */
    'Heliport': "直升机场",   /* drone-ops.js */
    'Hide': "隐藏",   /* aircraft-detail.js tool-panel.js */
    'Hide (reopen from the dock)': "隐藏（可从停靠列重新开启）",   /* workspace.js */
    'Hide ticker': "隐藏跑马灯",   /* map-ui.js */
    'High': "高",   /* atlas-console.js monitors.js widgets.js */
    'High ': "高 ",   /* atlas-console.js */
    'High — smaller changes': "高 — 变化较小",   /* monitors.js */
    'High Earth orbit': "高地球轨道",   /* satellite-detail.js */
    'High tide': "满潮",   /* world-packs.js */
    'highest': "最高",   /* atlas-console.js */
    'Highest': "最高",   /* routing.js */
    'Highest point': "最高点",   /* drone-nav.js satellite-detail.js */
    'highest ridge': "最高棱线",   /* sims.js */
    'Highlighted countries': "已标示的国家",   /* atlas-console.js */
    'highlights': "标示",   /* atlas-console.js */
    'Highlights cleared': "已清除标示",   /* atlas-console.js */
    'Highly elliptical (HEO)': "高椭圆轨道（HEO）",   /* satellite-detail.js */
    'highways': "公路",   /* routing.js */
    'Highways': "公路",   /* routing.js */
    'historical map': "历史地图",   /* atlas-console.js */
    'Historical network:': "历史路网：",   /* routing.js */
    'Historical overview from established sources — borders and figures are approximate.': "依据既有数据来源的历史概观 — 边界与数字皆为概略。",   /* atlas-console.js */
    'horizon': "地平线",   /* night-sky.js */
    'horizon scanned to': "地平线扫描至",   /* sims.js */
    'horizon: measured from the DEM': "地平线：由 DEM 实测",   /* night-sky.js */
    'horizon: NOT measured — ': "地平线：未实测 — ",   /* night-sky.js */
    'Hourly': "每小时",   /* monitors.js */
    'How often': "频率",   /* monitors.js */
    'Humidity': "湿度",   /* weather.js */
    'Identity': "识别",   /* aircraft-detail.js */
    'If one is already placed, tapping moves it. Press the button again to turn this off.': "若已设置震源，点击会将其移动。再次按下按钮即可关闭。",   /* seismic.js */
    'IMF unavailable — World Bank used': "IMF 数据无法取得 — 改用世界银行",   /* stats-compare.js */
    'impact': "冲击",   /* atlas-sims.js */
    'impact analysis within ': "冲击分析范围 ",   /* atlas-console.js */
    'Impact velocity (after drag)': "撞击速度（计入阻力后）",   /* atlas-console.js */
    'imports': "进口",   /* world-packs.js */
    'Imports': "进口",   /* world-packs.js */
    'in ': "于 ",   /* atlas-console.js space.js */
    'in eclipse': "进入食",   /* atlas-console.js satellites-live.js */
    'In eclipse': "进入食",   /* satellite-detail.js */
    'In force now': "目前生效",   /* world-packs.js */
    'in-window verified events': "时间范围内已查证的事件",   /* atlas-console.js */
    'incl.': "含",   /* satellites-live.js */
    'Inclination': "轨道倾角",   /* satellite-detail.js space.js */
    'Includes: position, zoom, projection, base map, every active layer, time-travel & compare state.': "包含：位置、缩放、投影、底图、所有启用的图层、时光机与比较状态。",   /* map-ui.js */
    'Indicated airspeed': "指示空速",   /* aircraft-detail.js */
    'Indicators': "指标",   /* stats-compare.js */
    'Industry': "产业",   /* industry-web.js */
    'Industry web': "产业关系网",   /* industry-web.js */
    'Inflow (m³/s)': "入流量（m³/s）",   /* terrain-water.js */
    'Integrated analysis': "整合分析",   /* atlas-console.js */
    'Intensity field: bundled 0.25° Vs30 where the DEM could not reach — the ground still varies': "震度分布：DEM 无法涵盖处采用内建的 0.25° Vs30（地盘仍有变化）",   /* seismic.js */
    'Intensity field: slope-based Vs30 (Wald & Allen 2007) on real DEM': "震度分布：以坡度推估 Vs30（Wald & Allen 2007），基于实测 DEM",   /* seismic.js */
    'Intensity fill opacity': "震度着色不透明度",   /* seismic.js */
    'Intensity scale': "震度阶级",   /* seismic.js */
    'Intercity Japan rail: real Shinkansen lines and stations, with times estimated from the operators’ published timetables (express pattern + service frequency) — not live times. Local segments use open GTFS (Transitous) where available; where none exists (e.g. Nagoya) they are distance-based estimates, marked as such. The line between stations is schematic.': "日本城际铁路：真实的新干线路线与车站，时间依营运者公布的时刻表推估（快车模式＋班次密度）— 并非实时时刻。地方路段在有开放 GTFS（Transitous）时采用之；没有的地方（例如名古屋）则以距离推估并标示。站与站之间的连接为示意线。",   /* atlas-console.js */
    'International designator': "国际识别码",   /* satellite-detail.js */
    'Interplanetary spacecraft, from JPL Horizons trajectories': "行星际探测器，依 JPL Horizons 轨迹",   /* space.js */
    'IntMap is an interactive world atlas — and I (Atlas) can operate all of it in plain language. You can: turn on 100+ DATA LAYERS (climate, population, economy, live weather) from the Layers panel; read LIVE NEWS pinned where events happen; use the TIME MACHINE (bottom-right) to travel 1900→now; open COUNTRIES to sort & compare country data; and switch to WORKSPACE mode for movable windows. Just ask me things like: "fly to Kenya", "show the population layer", "compare Japan and Germany", "highlight the top 10 by GDP per capita", "directions from Tokyo to Osaka by train", "which countries have the highest life expectancy?", or "brief me on the South China Sea". Ask "how do I …" for any specific feature.': "IntMap 是一个互动式世界地图集 — 而我（Atlas）可以用日常语言操作它的全部功能。你可以：从图层面板开启 100 种以上的数据图层（气候、人口、经济、实时天气）；阅读钉在事件发生地的实时新闻；用时光机（右下角）从 1900 年走到现在；开启「国家」分页排序与比较各国数据；并切换到工作区模式使用可移动的窗口。你可以直接问我：「飞到肯亚」「显示人口图层」「比较日本和德国」「标出人均 GDP 前十名」「东京到大阪的铁路路线」「哪些国家平均寿命最长？」或「帮我简报南海情势」。任何功能都可以问「我要怎么…」。",   /* atlas-console.js */
    'Inundated area': "淹没范围",   /* sims.js */
    'Invalid area': "范围无效",   /* monitors.js */
    'isolate': "單独显示",   /* atlas-console.js */
    'Isolate': "單独显示",   /* atlas-console.js */
    'Isolate off': "关闭單独显示",   /* atlas-console.js */
    'Isotope': "同位素",   /* atlas-console.js */
    'items': "项",   /* monitors.js */
    'Jan': "1月",   /* ocean-currents.js */
    'Japan — JMA, by issuing unit': "日本 — 气象厅，依发布單位",   /* world-packs.js */
    'Japan and the United States are drawn at the unit their agency issues at. Everywhere else is GDACS, which is an event feed, not a national warning service — a country with no GDACS event is not a country with no warnings. Educational display: follow the official authorities.': "日本与美国以其机关发布的單位绘制。其他地区使用 GDACS，那是事件数据源而非国家级警报服务 — 没有 GDACS 事件的国家不代表没有警报。教育用途显示：请遵从官方指示。",   /* world-packs.js */
    'Japan Meteorological Agency, at the unit the warning is issued for.': "日本气象厅，依警报发布的單位。",   /* world-packs.js */
    'JMA (shindo)': "气象厅震度",   /* seismic.js */
    'Jul': "7月",   /* ocean-currents.js */
    'Jump to latest': "跳到最新",   /* atlas-console.js */
    'Jun': "6月",   /* ocean-currents.js */
    'Jupiter Trojan': "木星特洛伊",   /* space.js */
    'just now': "刚刚",   /* monitors.js */
    'k m³': "千 m³",   /* terrain-water.js */
    'Keep ': "保留 ",   /* routing.js */
    'Keep on map': "保留在地图上",   /* tool-panel.js */
    'Keep zooming in to return to the map': "持续放大即可回到地图",   /* space.js */
    'Keep zooming out for space': "持续缩小即可进入太空",   /* space.js */
    'Keplerian two-body core with a selectable launch angle, plus Allen–Eggers atmospheric drag on the re-entry vehicle, an Earth-rotation (Coriolis) ground track and an optional MaRV terminal weave. Boost thrust is treated as an impulsive burnout at ~200 km; the 3-D arc is drawn to real world scale. Educational estimate — not an operational tool.': "以克卜勒二体问题为核心，可选择发射角，并对重返载具加入 Allen–Eggers 大气阻力、地球自转（科氏力）地面轨迹，以及可选的机动弹头终端机动。助推推力视为在约 200 km 高度的瞬时燃烧结束；立体弧线以真实世界尺度绘制。教育性推估 — 并非作战工具。",   /* atlas-console.js */
    'Key changes': "主要变化",   /* monitors.js */
    'Keyboard shortcuts': "键盘快捷键",   /* atlas-console.js keyboard-shortcuts.js */
    'Kind': "种类",   /* space.js */
    'Lagrangian particle model on LIVE Open-Meteo wind/temperature/precipitation (or the ERA5 archive for a past date): advection + stability-scaled turbulent diffusion + wet & dry deposition + radioactive decay. The source term (Bq), emission duration, isotope half-life and start time are yours to set; the colored ground zones are the final deposition classified by the real Chernobyl Cs-137 thresholds, and the dose figures assume a Cs-137 ground-shine conversion. EDUCATIONAL approximation, NOT an operational forecast — in a real emergency follow official authorities (SPEEDI / IAEA / local government).': "以实时 Open-Meteo 风场／气温／降水（或过去日期的 ERA5 文件）驱动的拉格朗日粒子模型：平流＋依稳定度调整的紊流扩散＋湿沉降与干沉降＋放射性衰变。源项（Bq）、排放持续时间、同位素半衰期与起始时刻皆可自行设置；地面彩色分区为最终沉降量，依车诺比实际的铯-137 门槛分级，剂量数字则假设铯-137 地面辐射的换算。此为教育性近似，并非作业预报 — 实际灾害时请遵从官方指示（SPEEDI／IAEA／地方政府）。",   /* atlas-console.js */
    'LANDED': "已降落",   /* flight-sim.js */
    'Landing sites': "降落地点",   /* drone-nav.js */
    'landing sites reachable': "处可到达的降落地点",   /* atlas-console.js */
    'Language': "语言",   /* atlas-console.js */
    'Largest spill': "最大泄漏",   /* terrain-water.js */
    'Last': "最近",   /* monitors.js */
    'Last run': "上次执行",   /* monitors.js */
    'Last seen': "最后出现",   /* aircraft-detail.js */
    'Latest': "最新",   /* stats-compare.js */
    'latest available at or before': "在此时刻或之前可取得的最新数据",   /* world-packs.js */
    'launch': "发射",   /* atlas-sims.js */
    'Launch angle': "发射角",   /* atlas-console.js */
    'Launched': "发射时间",   /* space.js */
    'Layer not found': "找不到图层",   /* atlas-console.js */
    'Layers': "图层",   /* atlas-console.js map-ui.js workspace.js */
    'Layers panel': "图层面板",   /* keyboard-shortcuts.js */
    'Learn': "了解",   /* atlas-console.js */
    'Least power': "最省电",   /* drone-ops.js */
    'Leave now': "现在出发",   /* routing.js */
    'Length': "长度",   /* drone-nav.js */
    'Levee / dam': "堤防／水坝",   /* terrain-water.js */
    'life expectancy': "平均寿命",   /* countries-ui.js */
    'Lift your finger to finish': "放开手指即可完成",   /* map-tools.js */
    'light': "光",   /* seismic.js */
    'Light travel time': "光行时间",   /* space.js */
    'limited to this aircraft’s service ceiling': "受限于该机型的实用升限",   /* flight-sim.js */
    'Line drawn': "已画出线段",   /* atlas-console.js */
    'line of sight': "视线",   /* atlas-console.js */
    'Line of sight': "视线",   /* atlas-console.js viewshed.js */
    'Line of sight (radar shadow)': "视线（雷达阴影）",   /* tool-panel.js */
    'Line width is proportional to the SQUARE ROOT of the value (a flow-map convention — the eye compares area, and a stroke’s area is width × length). Hover any arc for the exact figure; nothing here rescales the amounts. Source: BACI (CEPII) via OEC, HS 6-digit, year ': "线宽与数值的平方根成正比（流向图的惯例 — 眼睛比较的是面积，而线条的面积是宽×长）。将光标移到任一弧线可看到确切数字；此处不会重新缩放任何金额。来源：BACI（CEPII）经 OEC，HS 6 位码，年份 ",   /* world-packs.js */
    'line-of-sight breaks': "视线中断",   /* atlas-console.js */
    'Line-of-sight service area over real terrain (4/3-earth horizon + free-space path loss). A first approximation — no diffraction/clutter.': "依真实地形计算的视线服务范围（4/3 地球半径地平线＋自由空间路径损耗）。属初步近似 — 未计入绕射与杂波。",   /* sims.js */
    'line-of-sight service area over real terrain. Set antenna height / power / frequency in the panel; click to move the mast.': "依真实地形计算的视线服务范围。可在面板中设置天线高度／功率／频率；点击即可移动天线位置。",   /* atlas-console.js */
    'link margin': "链路余裕",   /* atlas-console.js */
    'Link margin': "链路余裕",   /* drone-nav.js */
    'Link to a point…': "链接到某个点…",   /* viewshed.js */
    'live': "实时",   /* night-sky.js space.js */
    'Live': "实时",   /* space.js world-packs.js */
    'live · drag to move': "实时・可拖动移动",   /* weather.js */
    'Live (present)': "实时（现在）",   /* news-timeline.js */
    'Live APIs: not probed': "实时 API：未检测",   /* atlas-console.js */
    'Live cameras': "实时摄影机",   /* cameras.js */
    'Live info': "实时信息",   /* tool-panel.js */
    'Live satellites off': "已关闭实时卫星",   /* atlas-console.js */
    'Live satellites on': "已开启实时卫星",   /* atlas-console.js */
    'live web news': "实时网络新闻",   /* atlas-console.js */
    'live web search': "实时网络搜索",   /* atlas-console.js */
    'live web verification': "实时网络查证",   /* atlas-console.js */
    'Live web verification did not complete for this time-sensitive question, so this is a PROVISIONAL assessment based mainly on already-gathered headlines — treat items as leads, not confirmed direct evidence.': "这个具时效性的问题未能完成实时网络查证，因此以下是主要依据既有标题的暂定判断 — 请视为线索，而非已确认的直接证据。",   /* atlas-console.js */
    'LOAD': "加载",   /* flight-sim.js */
    'Load a recent real earthquake': "加载近期真实地震",   /* seismic.js */
    'loaded news': "已加载的新闻",   /* atlas-console.js */
    'Loaded news near here': "附近已加载的新闻",   /* atlas-console.js */
    'Loading cameras…': "正在加载摄影机…",   /* cameras.js */
    'Loading data…': "正在加载数据…",   /* stats-compare.js */
    'Loading monitors…': "正在加载监看…",   /* monitors.js */
    'Loading runways…': "正在加载跑道…",   /* flight-sim.js */
    'Loading terrain DEM…': "正在加载地形 DEM…",   /* viewshed.js */
    'Loading the current atlas…': "正在加载海流图集…",   /* ocean-currents.js */
    'Loading the twelve monthly fields…': "正在加载十二个月份的场…",   /* ocean-currents.js */
    'Loading ticker…': "正在加载跑马灯…",   /* map-ui.js */
    'Loading time-zone boundaries…': "正在加载时区界线…",   /* layer-packs.js */
    'Loading trade data…': "正在加载贸易数据…",   /* world-packs.js */
    'loading…': "加载中…",   /* space.js world-packs.js */
    'Loading…': "加载中…",   /* weather.js world-packs.js */
    'Location is blocked for this site. Turn it on in your browser (tap the lock/permissions icon in the address bar), then ask me again.': "本网站的定位权限已被封锁。请在浏览器中开启（点网址列的锁头／权限图标），然后再问我一次。",   /* atlas-console.js */
    'Location permission was denied. Re-enable it in your browser settings, then ask again.': "定位权限遭拒。请在浏览器设置中重新启用，然后再问一次。",   /* atlas-console.js */
    'Location timed out': "定位逾时",   /* atlas-console.js */
    'location unverified': "位置未经查证",   /* atlas-console.js */
    'location web-verified': "位置已由网络查证",   /* atlas-console.js */
    'Lofted': "高抛弹道",   /* atlas-console.js */
    'log': "对数",   /* analysis-panels.js */
    'Log in': "登录",   /* monitors.js */
    'Log in to create and view area monitors.': "请登录以建立与检视区域监看。",   /* monitors.js */
    'Log in to run monitors.': "请登录以执行监看。",   /* monitors.js */
    'Log in to use monitors.': "请登录以使用监看功能。",   /* atlas-console.js */
    'long-run estimates for this year — World Bank / IMF annual series begin in 1960': "该年份的长期推估值 — 世界银行／IMF 年度序列自 1960 年开始",   /* stats-compare.js */
    'Looking for a photo of this airframe…': "正在寻找这架机体的照片…",   /* aircraft-detail.js */
    'LOS breaks': "视线中断",   /* drone-nav.js */
    'Low': "低",   /* atlas-console.js monitors.js widgets.js */
    'Low ': "低 ",   /* atlas-console.js */
    'Low — only big changes': "低 — 仅重大变化",   /* monitors.js */
    'Low Earth orbit (LEO)': "低地球轨道（LEO）",   /* satellite-detail.js */
    'Low tide': "干潮",   /* world-packs.js */
    'Lower': "较低",   /* terrain-water.js */
    'lowest': "最低",   /* atlas-console.js routing.js */
    'Lowest': "最低",   /* atlas-console.js */
    'Lowest ': "最低 ",   /* atlas-console.js */
    'Lowest clearance': "最小净空",   /* drone-nav.js */
    'LVL': "水平",   /* flight-sim.js */
    'Mach': "马赫",   /* aircraft-detail.js */
    'mag ': "星等 ",   /* space.js */
    'Magnitude (Mw)': "规模（Mw）",   /* seismic.js */
    'Make a U-turn': "回转",   /* routing.js */
    'Manage all map objects': "管理所有地图对象",   /* map-tools.js */
    'Manage every pin, drawing, radius, route, uploaded layer and reachable-area here — rename, recolor, hide or delete.': "在这里管理每一个图钉、绘图、半径、路线、上传的图层与可达范围 — 可重新命名、换色、隐藏或删除。",   /* atlas-console.js */
    'Map': "地图",   /* atlas-console.js monitors.js workspace.js */
    'MAP': "地图",   /* flight-sim.js */
    'Map ⇄ satellite': "地图 ⇄ 卫星",   /* keyboard-shortcuts.js */
    'map center': "地图中心",   /* atlas-console.js */
    'Map data not ready yet': "地图数据尚未就绪",   /* atlas-console.js */
    'Map engine': "地图引擎",   /* atlas-console.js */
    'Map lookup was unavailable — places could not be verified on the map right now.': "地图查询无法使用 — 目前无法在地图上验证这些地点。",   /* atlas-verify.js */
    'map shading': "地图着色",   /* atlas-console.js */
    'Map tilt limit': "地图倾角上限",   /* atlas-console.js */
    'Mapped from IntMap-gathered news evidence (GDELT + Google News + loaded news); positions are city-level — verify important facts.': "依 IntMap 搜集的新闻证据标绘（GDELT＋Google News＋已加载的新闻）；位置精度为城市层级 — 重要事实请自行查证。",   /* atlas-console.js */
    'Mapping': "标绘中",   /* atlas-console.js */
    'Mar': "3月",   /* ocean-currents.js */
    'Market capitalisation': "市值",   /* industry-web.js */
    'Mass': "质量",   /* space.js */
    'max': "最大",   /* drone-nav.js tsunami.js */
    'max ': "最大 ",   /* widgets.js */
    'MAX ALT': "最高高度",   /* flight-sim.js */
    'max depth': "最大深度",   /* sims.js terrain-water.js */
    'Max range': "最大射程",   /* sims.js */
    'Max walk': "最长步行",   /* routing.js */
    'Maximize / restore': "最大化／还原",   /* workspace.js */
    'Maximum 10 countries': "最多 10 个国家",   /* stats-compare.js */
    'Maximum wave height instead': "改为最大波高",   /* tsunami.js */
    'May': "5月",   /* ocean-currents.js */
    'may have stopped updating': "可能已停止更新",   /* atlas-console.js */
    'Meadow': "草原",   /* drone-ops.js */
    'Mean': "年平均",   /* ocean-currents.js */
    'mean slip': "平均滑移量",   /* tsunami.js */
    'Measure': "测量",   /* tool-panel.js world-packs.js */
    'Measure / radius / draw tool': "测量／半径／绘制工具",   /* keyboard-shortcuts.js */
    'Measure distance / area': "测量距离／面积",   /* workspace.js */
    'measured cells': "个实测格",   /* ocean-currents.js */
    'measured DEM': "实测 DEM",   /* tsunami.js */
    'measuring the horizon from the terrain…': "正在由地形量测地平线…",   /* night-sky.js */
    'Medium': "中",   /* monitors.js terrain-water.js */
    'Medium (default)': "中（默认）",   /* monitors.js */
    'Medium Earth orbit (MEO)': "中地球轨道（MEO）",   /* satellite-detail.js */
    'Merge': "合并",   /* routing.js */
    'Messages': "讯息",   /* aircraft-detail.js */
    'met — the satellite is up and in sunlight (needs a dark sky here)': "符合 — 卫星在地平在线且受阳光照射（此地需为暗夜）",   /* satellite-detail.js */
    'Midnight sun': "永昼",   /* widgets.js */
    'Military': "军用",   /* aircraft-detail.js */
    'Military area': "军事区",   /* drone-ops.js */
    'military spending': "国防支出",   /* countries-ui.js */
    'min': "分",   /* atlas-console.js map-tools.js routing.js */
    'min by rail': "分钟（铁路）",   /* atlas-console.js */
    'min late': "分钟误点",   /* atlas-console.js */
    'min reachable': "分钟可达",   /* atlas-console.js */
    'Min-energy': "最小能量",   /* atlas-console.js */
    'Minimize': "最小化",   /* atlas-console.js seismic.js tsunami.js */
    'Minimum antenna height here': "此处所需的最低天线高度",   /* viewshed.js */
    'Minimum-energy': "最小能量弹道",   /* atlas-console.js */
    'misses by': "未命中，偏差",   /* viewshed.js */
    'Model scale': "模型比例",   /* space.js */
    'moderate': "中等",   /* analysis-panels.js atlas-console.js seismic.js */
    'Moderate': "中等",   /* widgets.js */
    'Module/method not found': "找不到模组或方法",   /* atlas-controls.js */
    'Monitor created': "已建立监看",   /* atlas-console.js */
    'Monitor created.': "已建立监看。",   /* monitors.js */
    'Monitor not found.': "找不到监看。",   /* monitors.js */
    'Monitor ran: ': "监看已执行：",   /* monitors.js */
    'Monitors': "监看",   /* workspace.js */
    'Monitors are unavailable.': "监看功能无法使用。",   /* atlas-console.js */
    'month': "月",   /* space.js */
    'Moon': "月球",   /* night-sky.js */
    'Moons': "卫星（天然）",   /* space.js */
    'more (all are drawn on the map)': "个以上（地图上都已绘出）",   /* world-packs.js */
    'move here<br>= map syncs': "移到这里<br>＝地图同步",   /* street-view.js */
    'Move the cursor to trace → click to finish': "移动光标描绘 → 点击完成",   /* map-tools.js */
    'Moved to': "已移动至",   /* atlas-console.js */
    'Moving the working area here…': "正在把工作范围移到这里…",   /* terrain-water.js */
    'my location': "我的位置",   /* atlas-console.js atlas-geo-resolve.js */
    'N pole in polar night': "北极处于极夜",   /* sims.js */
    'Naked-eye conditions': "肉眼观测条件",   /* satellite-detail.js */
    'Name': "名称",   /* monitors.js satellite-detail.js */
    'named currents · ': "条具名海流・",   /* ocean-currents.js */
    'Named in the answer but not placed (couldn’t locate precisely): ': "回答中提到但未标绘（无法精确定位）：",   /* atlas-verify.js */
    'national borders': "国界",   /* atlas-console.js */
    'National park': "国家公园",   /* drone-ops.js */
    'Nature reserve': "自然保护区",   /* drone-ops.js */
    'near Earth': "近地",   /* satellite-detail.js */
    'near source': "近震源",   /* tsunami.js */
    'nearby': "附近",   /* drone-nav.js */
    'Need a base and a top altitude': "需要基准高度与顶部高度",   /* atlas-console.js */
    'Need a launch site and a target': "需要发射地点与目标",   /* atlas-console.js */
    'Need a route with at least two waypoints': "需要至少两个航点的路线",   /* atlas-console.js */
    'Need a start and a destination': "需要起点与目的地",   /* atlas-console.js */
    'Need at least three points': "至少需要三个点",   /* atlas-console.js */
    'Need at least two points': "至少需要两个点",   /* atlas-console.js */
    'Need start & destination': "需要起点与目的地",   /* atlas-console.js */
    'Need two places': "需要两个地点",   /* atlas-console.js */
    'negative': "负",   /* analysis-panels.js */
    'net': "净额",   /* routing.js */
    'Network error — please try again.': "网络错误 — 请再试一次。",   /* monitors.js */
    'Neutral': "中性",   /* atlas-sims.js */
    'Never sunlit on': "完全无日照于",   /* sims.js */
    'New event clusters': "新的事件群",   /* monitors.js */
    'New monitor': "新增监看",   /* monitors.js */
    'New moon': "新月",   /* space.js */
    'New name': "新名称",   /* map-tools.js */
    'New route': "新路线",   /* drone-nav.js */
    'newest': "最新",   /* atlas-console.js */
    'news': "新闻",   /* atlas-console.js */
    'News': "新闻",   /* atlas-console.js monitors.js news-timeline.js */
    'news · imagery · quakes time-traveled to this date': "新闻・影像・地震皆已时空跳跃到此日期",   /* sims.js */
    'News / Info / Countries / Community tab': "新闻／信息／国家／社群分页",   /* keyboard-shortcuts.js */
    'News along the route': "沿途新闻",   /* routing.js */
    'News feed': "新闻来源",   /* atlas-console.js */
    'Next': "下一个",   /* monitors.js */
    'Next pass': "下次通过",   /* satellite-detail.js */
    'Next run': "下次执行",   /* monitors.js */
    'Night side of the Earth': "地球的夜侧",   /* atlas-console.js */
    'Night sky': "星空",   /* tool-panel.js */
    'No': "否",   /* countries-ui.js */
    'No aircraft matching': "没有符合的航机",   /* atlas-console.js */
    'No area selected.': "未选取任何区域。",   /* monitors.js */
    'No area selected. Set a radius, draw an area, or resolve a region — or use the current map view below.': "未选取任何区域。请设置半径、画出范围或指定一个地区 — 或使用下方目前的地图画面。",   /* monitors.js */
    'No boundary polygon found for': "找不到界线多边形：",   /* atlas-console.js */
    'No change': "没有变化",   /* monitors.js */
    'No closed area was drawn — draw a loop on the map.': "未画出封闭范围 — 请在地图上围成一圈。",   /* seismic.js */
    'No coast in this view — pan to a coastline, or tap one for its tide times.': "此画面中没有海岸 — 请移动到海岸线，或点击一处查看潮汐时刻。",   /* world-packs.js */
    'No conflict with any other saved route.': "与其他已保存的路线没有冲突。",   /* drone-nav.js */
    'No countries match that filter': "没有符合该筛选条件的国家",   /* atlas-console.js */
    'no cultivation recorded in this cell': "此格内没有记录到耕作",   /* world-packs.js */
    'No current GDACS event for this country. GDACS only carries disasters above its own severity thresholds, and no national warning service is wired here yet — so this is not the same as "no warnings in force".': "此国家目前没有 GDACS 事件。GDACS 只收录超过其严重度门槛的灾害，而目前尚未接上任何国家级警报服务 — 因此这不等于「没有任何警报生效」。",   /* world-packs.js */
    'no data': "无数据",   /* world-packs.js */
    'No data': "无数据",   /* stats-compare.js */
    'No data for this country and year.': "此国家在该年份没有数据。",   /* world-packs.js */
    'No data for this country.': "此国家没有数据。",   /* world-packs.js */
    'no data for this metric': "此指标没有数据",   /* atlas-console.js */
    'no DEM': "无 DEM",   /* seismic.js */
    'No earthquakes or geolocated news near this route.': "此路线附近没有地震或已定位的新闻。",   /* routing.js */
    'No elevation data beyond here': "此处之后没有高程数据",   /* terrain-water.js */
    'No elevation data for this route yet.': "此路线尚无高程数据。",   /* routing.js */
    'No evidence stored.': "未保存任何证据。",   /* monitors.js */
    'No geolocated articles in the loaded news for this window/area': "此时间范围／区域内，已加载的新闻中没有已定位的报道",   /* atlas-console.js */
    'No headlines have loaded yet.': "尚未加载任何标题。",   /* news-sources.js */
    'No historical route found.': "找不到历史路线。",   /* routing.js */
    'No live news evidence could be gathered for this topic right now — nothing was invented. Try a broader topic or again shortly.': "目前无法就此主题搜集到实时新闻证据 — 没有任何内容是杜撰的。请换较广的主题或稍后再试。",   /* atlas-console.js */
    'No M2.5+ earthquakes in the last 24 h': "过去 24 小时内没有 M2.5 以上的地震",   /* atlas-console.js */
    'No mast height up to 500 m clears this path.': "高度 500 米以内没有任何天线高度能让这条路径通视。",   /* viewshed.js */
    'No match': "没有符合项目",   /* stats-compare.js */
    'No matching countries / metric unavailable.': "没有符合的国家／该指标无法使用。",   /* atlas-reply.js */
    'No matching monitor found.': "找不到符合的监看。",   /* atlas-console.js */
    'No monitors yet. Set a radius, draw an area, or resolve a region, then create a monitor to watch it for changes.': "尚无监看。请先设置半径、画出范围或指定地区，再建立监看以追踪其变化。",   /* monitors.js */
    'No objects on the map.': "地图上没有对象。",   /* atlas-console.js */
    'No objects yet. Drop a pin, draw, add a radius, upload GeoJSON, or make a route — they all show up here to manage in one place.': "尚无对象。放置图钉、绘图、加入半径、上传 GeoJSON 或建立路线 — 全都会出现在这里统一管理。",   /* map-tools.js */
    'No opacity control: ': "没有不透明度控制：",   /* atlas-console.js */
    'No other saved route to check against — save a second route first.': "没有其他已保存的路线可比对 — 请先保存第二条路线。",   /* drone-nav.js */
    'No overlapping data to correlate': "没有可供相关分析的重叠数据",   /* atlas-console.js */
    'No photo of this airframe is available.': "没有这架机体的照片。",   /* aircraft-detail.js */
    'No populated cities/towns within the radius (per OSM population tags)': "半径内没有有人居住的城镇（依 OSM 人口标记）",   /* atlas-console.js */
    'No precise boundary for': "没有精确界线：",   /* atlas-console.js */
    'No public-transit route found here': "此处找不到大众运输路线",   /* routing.js */
    'No public-transit route here — the area may have no open transit data yet. Try 🚗 or 🚶 above.': "此处没有大众运输路线 — 该地区可能还没有开放的运输数据。请改用上方的 🚗 或 🚶。",   /* atlas-console.js */
    'no published revenue': "未公布营收",   /* industry-web.js */
    'No rail reachable here in that time (or the rail-data service is busy). Try a point nearer a station, or 🚗/🚶.': "在该时间内铁路无法到达此处（或铁路数据服务忙碌）。请改选靠近车站的地点，或使用 🚗／🚶。",   /* atlas-console.js */
    'No readable data on the active layers here. Turn a data layer on first.': "此处启用中的图层没有可读取的数据。请先开启一个数据图层。",   /* atlas-console.js */
    'No route found (maybe no connection).': "找不到路线（可能没有连通）。",   /* routing.js */
    'No route found (no road connection between these points).': "找不到路线（这两点之间没有道路连通）。",   /* atlas-console.js */
    'No route to adjust': "没有可调整的路线",   /* atlas-console.js */
    'No route to check': "没有可检查的路线",   /* atlas-console.js */
    'No route to return from': "没有可回程的路线",   /* atlas-console.js */
    'No route yet': "尚无路线",   /* atlas-console.js */
    'No runs yet.': "尚未执行过。",   /* monitors.js */
    'No satellite matching': "没有符合的卫星",   /* atlas-console.js */
    'No Street View coverage here': "此处没有街景涵盖",   /* street-view.js */
    'No terrain data here.': "此处没有地形数据。",   /* sims.js */
    'No terrain/wind data here.': "此处没有地形／风场数据。",   /* sims.js */
    'No tide model at this point (inland or outside the model domain).': "此点没有潮汐模型（位于内陆或模型范围之外）。",   /* world-packs.js */
    'No time-series available': "没有时间序列可用",   /* stats-compare.js */
    'No tributaries returned by OpenStreetMap here': "OpenStreetMap 在此处没有回传任何支流",   /* atlas-console.js */
    'no wave in this run': "本次模拟没有产生波浪",   /* tsunami.js */
    'NOAA satellite altimetry (geostrophic) + blended wind stress (Ekman), 0.25° climatology. Warm / cold is measured against NOAA OISST at the same latitude.': "NOAA 卫星测高（地转流）＋混合风应力（艾克曼流），0.25° 气候值。暖流／寒流是与同纬度的 NOAA OISST 水温比较实测而得。",   /* data-layers.js */
    'None': "无",   /* monitors.js */
    'none — everything is held': "无 — 全部保留",   /* terrain-water.js */
    'None (default feeds only)': "无（仅默认数据源）",   /* news-sources.js */
    'none (k=1)': "无（k=1）",   /* viewshed.js */
    'none in area': "区域内没有",   /* atlas-console.js */
    'None of the identifiers for that request resolved to a real border': "该请求的识别码都无法对应到实际的界线",   /* atlas-console.js */
    'NORAD catalog number': "NORAD 目录编号",   /* satellite-detail.js */
    'north': "北",   /* atlas-console.js */
    'North': "北",   /* app-body.js */
    'northeast': "东北",   /* atlas-console.js */
    'northwest': "西北",   /* atlas-console.js */
    'Nose down': "机首下压",   /* flight-sim.js */
    'Nose up': "机首上仰",   /* flight-sim.js */
    'Not an available indicator': "不是可用的指标",   /* atlas-console.js */
    'Not enough countries have both values.': "同时具备两项数值的国家不足。",   /* analysis-panels.js */
    'Not enough data for this metric': "此指标的数据不足",   /* atlas-console.js */
    'Not enough usable indicators': "可用的指标不足",   /* atlas-console.js */
    'not felt': "无感",   /* seismic.js */
    'Not found': "找不到",   /* atlas-console.js */
    'not loaded yet': "尚未加载",   /* atlas-console.js */
    'not met': "未满足",   /* satellite-detail.js */
    'not painting': "未绘制",   /* atlas-console.js */
    'not shared': "未共享",   /* routing.js */
    'Note': "备注",   /* atlas-console.js */
    'Note: a small share of the tiniest streams was omitted at the display cap (all major tributaries are drawn)': "注意：在显示上限处省略了极少数最细的水流（所有主要支流都已绘出）",   /* atlas-console.js */
    'Nothing found — neither OpenStreetMap nor Wikidata has such facilities recorded here and the AI knows none it is sure of': "查无结果 — OpenStreetMap 与 Wikidata 都没有记录此处有这类设施，AI 也没有可确定的数据",   /* atlas-console.js */
    'Nothing found for': "查无结果：",   /* atlas-console.js */
    'Nothing in force right now.': "目前没有任何生效中的警报。",   /* world-packs.js */
    'Nothing is drawn — this is a failed query, not an industry with no companies.': "没有绘制任何内容 — 这是查询失败，并不代表这个产业没有企业。",   /* industry-web.js */
    'Nothing is highlighted yet — name the countries or regions': "目前没有标示任何项目 — 请指定国家或地区",   /* atlas-console.js */
    'nothing overtopping': "没有溢流",   /* atlas-console.js */
    'Nothing to clear for': "没有可清除的项目：",   /* atlas-console.js */
    'Nov': "11月",   /* ocean-currents.js */
    'now': "现在",   /* satellite-detail.js */
    'Now': "现在",   /* news-timeline.js sims.js */
    'Nuclear plant': "核能电厂",   /* drone-ops.js */
    'Object': "对象",   /* satellite-detail.js */
    'objects': "个对象",   /* atlas-console.js tool-panel.js */
    'Objects': "对象",   /* atlas-console.js map-tools.js */
    'Observed track: ': "观测到的轨迹：",   /* aircraft-detail.js */
    'Ocean currents': "海流",   /* ocean-currents.js */
    'Oct': "10月",   /* ocean-currents.js */
    'of sun a year': "的年日照",   /* sims.js */
    'of the disk': "的圆面",   /* viewshed.js */
    'of the view': "的画面",   /* sims.js */
    'off': "关",   /* atlas-console.js */
    'off-field': "场外",   /* flight-sim.js */
    'on': "开",   /* atlas-console.js */
    'on a quarter cycle (6h12m)': "前进四分之一周期（6小时12分）",   /* world-packs.js */
    'on the ground': "在地面",   /* aircraft-detail.js */
    'on the ground — released just above the field, flying': "在地面 — 于场区上空稍高处释放，飞行中",   /* aircraft-detail.js */
    'on the line': "在在线",   /* analysis-panels.js */
    'on the map': "在地图上",   /* atlas-console.js */
    'On the runway': "在跑道上",   /* flight-sim.js */
    'on time': "准点",   /* atlas-console.js */
    'on your left': "在你的左侧",   /* routing.js */
    'on your right': "在你的右侧",   /* routing.js */
    'one clock for the whole globe: pick a date/time and the day/night terminator is drawn for it; within ~10 years the news, satellite imagery and quakes time-travel to that date, and dated weather/air layers reload. ▶ plays time forward.': "全球共用一个时钟：选定日期时间后即画出当时的昼夜界线；约 10 年内的新闻、卫星影像与地震也会一并跳到该日期，有日期的天气／空气图层会重新加载。▶ 可让时间前进。",   /* atlas-console.js */
    'One clock for the whole globe: the day/night terminator is computed for any date; within ~10 years the news, satellite imagery and earthquakes time-travel to the date, and any dated weather/air layers reload for it. Turn on the layers you want to replay.': "全球共用一个时钟：任何日期都能算出昼夜界线；约 10 年内的新闻、卫星影像与地震会跳到该日期，有日期的天气／空气图层也会重新加载。请先开启你想回放的图层。",   /* sims.js */
    'One shot': "單次",   /* terrain-water.js */
    'Only images and text-based files can be attached': "只能附加图片与纯文字类文件",   /* atlas-console.js */
    'Only one route was returned — there is nothing to compare.': "只回传了一条路线 — 没有可比较的对象。",   /* routing.js */
    'Only the first 10 countries are compared': "只比较前 10 个国家",   /* atlas-console.js */
    'opacity': "不透明度",   /* atlas-console.js */
    'Opacity': "不透明度",   /* atlas-console.js tsunami.js */
    'open horizon': "开阔地平线",   /* atlas-console.js */
    'open horizon would give': "开阔地平线可达",   /* sims.js */
    'Open in Google Maps': "在 Google 地图开启",   /* street-view.js */
    'Open Monitors': "开启监看",   /* atlas-console.js */
    'open my monitors': "开启我的监看",   /* atlas-console.js */
    'Open the tsunami simulator': "开启海啸模拟器",   /* seismic.js */
    'Opened': "已开启",   /* atlas-console.js */
    'Opened the radioactive-fallout model.': "已开启放射性沉降模型。",   /* sims.js */
    'Opens the full radioactive-fallout model (source term, isotope, wind).': "开启完整的放射性沉降模型（源项、同位素、风场）。",   /* sims.js */
    'OpenStreetMap could not be reached.': "无法连接到 OpenStreetMap。",   /* routing.js */
    'Operations': "作业",   /* drone-nav.js */
    'Operator': "营运者",   /* space.js */
    'optical 1.13': "光学 1.13",   /* viewshed.js */
    'Optimized order': "优化顺序",   /* atlas-console.js */
    'option not found': "找不到该选项",   /* atlas-controls.js */
    'options — tap one to show it on the map': "个选项 — 点一个即可显示在地图上",   /* atlas-console.js */
    'or': "或",   /* keyboard-shortcuts.js */
    'or type your own answer…': "或自行输入答案…",   /* atlas-console.js */
    'Orange alert': "橙色警戒",   /* world-packs.js */
    'Orbit class': "轨道类别",   /* satellite-detail.js */
    'Orbital period': "轨道周期",   /* space.js */
    'Orbits': "轨道",   /* space.js */
    'Ordered shortest-first (nearest-neighbor + 2-opt), then driven on the OSM road network (OSRM). The first stop is fixed as the start.': "以最短优先排序（最近邻＋2-opt），再依 OSM 道路网（OSRM）行驶。第一个停靠点固定为起点。",   /* atlas-console.js */
    'Ordered shortest-first (nearest-neighbor + 2-opt). Road routing is busy — the optimized ORDER is shown; try again for the drawn route.': "以最短优先排序（最近邻＋2-opt）。道路路径服务忙碌 — 仅显示优化后的顺序；请稍后再试以取得实际路线。",   /* atlas-console.js */
    'Out of the news range (about the last 10 years)': "超出新闻可回溯的范围（约最近 10 年）",   /* news-timeline.js */
    'out to': "外扩至",   /* seismic.js */
    'outlets': "家媒体",   /* atlas-console.js */
    'outline': "轮廓",   /* atlas-console.js */
    'Outline cleared': "已清除轮廓",   /* atlas-console.js */
    'Outlined': "已描绘轮廓",   /* atlas-console.js */
    'Outside air temp.': "外界气温",   /* aircraft-detail.js */
    'OVERSPEED': "超速",   /* flight-sim.js */
    'Overtopping': "溢流",   /* terrain-water.js */
    'Owned by': "被持有",   /* industry-web.js */
    'owner → owned': "持有方 → 被持有方",   /* industry-web.js */
    'ownership links': "条持股关系",   /* industry-web.js */
    'Owns': "持有",   /* industry-web.js */
    'P here in': "P 波抵达此地于",   /* atlas-console.js */
    'P, S and surface wavefronts ray-traced through the IASP91 Earth model, with arrival time, shaking duration and Modified-Mercalli intensity for the places around it.': "P 波、S 波与表面波波前以 IASP91 地球模型射线追踪，并提供周围各地的到达时刻、震动持续时间与修订麦卡利震度。",   /* atlas-console.js */
    'Pan': "平移",   /* atlas-console.js */
    'Park': "公园",   /* drone-ops.js */
    'Part of the route is above 180 m, the highest level the wind model publishes — the 180 m wind is used there rather than an extrapolation.': "部分路线高于 180 米，那是风场模型公布的最高层 — 该处直接采用 180 米的风，而非外插。",   /* drone-ops.js */
    'partial': "偏食",   /* space.js */
    'Partial': "部分",   /* monitors.js */
    'partners': "伙伴",   /* world-packs.js */
    'Partners shown': "显示的伙伴",   /* world-packs.js */
    'Pass in progress': "通过中",   /* satellite-detail.js */
    'past 30 days': "过去 30 天",   /* monitors.js */
    'Path length (3-D)': "路径长度（立体）",   /* drone-nav.js */
    'Pause': "暂停",   /* monitors.js terrain-water.js */
    'PAUSE': "暂停",   /* flight-sim.js */
    'paused': "已暂停",   /* space.js */
    'Paused': "已暂停",   /* atlas-console.js monitors.js */
    'PAUSED': "已暂停",   /* flight-sim.js */
    'peak ahead ': "前方峰值 ",   /* widgets.js */
    'Peak coastal height (Green’s law)': "沿岸最大波高（格林定律）",   /* tsunami.js */
    'Peak deposition': "最大沉降量",   /* atlas-console.js */
    'Peak water rise (m)': "最大水位上升（米）",   /* sims.js */
    'Pearson r': "皮尔森 r",   /* analysis-panels.js */
    'Pen width': "笔宽",   /* terrain-water.js */
    'penumbral': "半影食",   /* space.js */
    'per 5-arcminute cell (~9 km)': "每 5 角分格（约 9 公里）",   /* world-packs.js */
    'Perihelion': "近日点",   /* space.js */
    'period': "周期",   /* atlas-console.js */
    'Period': "周期",   /* satellite-detail.js satellites-live.js space.js */
    'photo: Planespotters.net': "照片：Planespotters.net",   /* aircraft-detail.js */
    'Pick a country on the map': "在地图上选择国家",   /* stats-compare.js */
    'pick a date & time; buildings in view (zoom in) cast real shadows and the 3D scene is lit from the sun. Press ▶ to sweep the day.': "选择日期与时刻；视野内的建筑（请放大）会投下真实阴影，3D 场景也由太阳照明。按 ▶ 可扫过一整天。",   /* atlas-console.js */
    'Pick a point further away.': "请选择更远的地点。",   /* viewshed.js */
    'Pick on map': "在地图上选取",   /* routing.js */
    'Pick the hazard & source in the panel; the time slider steps the impact area. Educational approximation — follow official authorities in a real emergency.': "在面板中选择灾害类型与源头；时间滑杆会推进影响范围。教育性近似 — 实际灾害时请遵从官方指示。",   /* atlas-console.js */
    'Pin': "图钉",   /* atlas-console.js map-tools.js */
    'pins': "个图钉",   /* atlas-console.js */
    'Pins': "图钉",   /* map-tools.js */
    'Pitch': "俯仰",   /* app-body.js */
    'Place': "地点",   /* seismic.js */
    'Place / move the epicenter': "放置／移动震央",   /* seismic.js */
    'Place an epicenter to begin.': "请先放置震央。",   /* seismic.js */
    'Place antenna on map': "在地图上放置天线",   /* sims.js */
    'Place labels': "地点标注",   /* atlas-console.js */
    'Place names': "地名",   /* space.js */
    'Place names are drawn on a body — open one from the list': "地名是画在天体上的 — 请从列表开启一个天体",   /* space.js */
    'Place not found': "找不到地点",   /* atlas-console.js */
    'Place source on map': "在地图上放置源头",   /* sims.js */
    'Place water to see where it goes.': "倒下水量即可看到水往哪里流。",   /* terrain-water.js */
    'Plate code': "板块代码",   /* layer-packs.js */
    'playable now': "现在可玩",   /* tsunami.js */
    'Playground unavailable': "游乐场无法使用",   /* atlas-console.js */
    'Please set an area to monitor first (radius, drawn area, region, or the current map view).': "请先设置要监看的区域（半径、绘制范围、地区或目前地图画面）。",   /* monitors.js */
    'Please wait a moment before running again.': "请稍候再重新执行。",   /* monitors.js */
    'Plume follows the live wind at the source; the time slider extends it downwind.': "烟流依源头处的实时风场移动；时间滑杆会沿下风方向延伸。",   /* sims.js */
    'plume reach': "烟流范围",   /* atlas-console.js */
    'Plume reach': "烟流范围",   /* sims.js */
    'Pluto is drawn in its measured color: no global surface map is bundled for it, and the ones offered for the dwarf planets elsewhere are labeled fictional by their author. Its position and its IAU names are real.': "冥王星以其实测颜色绘制：本应用没有内建它的全球表面图，而其他矮行星可取得的贴图被作者标示为虚构。它的位置与 IAU 命名则是真实的。",   /* space.js */
    'points': "个点",   /* atlas-console.js viewshed.js */
    'points mapped — click a pin (or an item below) for the summary & article': "个点已标绘 — 点击图钉（或下方项目）可看摘要与报道",   /* atlas-console.js */
    'Polar low Earth orbit': "极地低地球轨道",   /* satellite-detail.js */
    'Polar night': "极夜",   /* widgets.js */
    'Politics & defense': "政治与国防",   /* countries-ui.js */
    'Polygon': "多边形",   /* map-tools.js tool-panel.js */
    'Polygon drawn': "已绘制多边形",   /* atlas-console.js */
    'Polygons': "多边形",   /* map-tools.js */
    'ponded': "积水",   /* atlas-console.js */
    'Ponded': "已积水",   /* terrain-water.js */
    'Ponds crossed': "越过的积水区",   /* terrain-water.js */
    'pop ': "人口 ",   /* atlas-console.js */
    'population': "人口",   /* countries-ui.js */
    'Population inside the circle(s): ': "圆形范围内的人口：",   /* atlas-console.js */
    'Population lookup failed (WorldPop busy) — try again.': "人口查询失败（WorldPop 忙碌）— 请再试一次。",   /* atlas-console.js */
    'Population nearby': "附近人口",   /* atlas-console.js */
    'population: ': "人口：",   /* atlas-console.js */
    'Position': "位置",   /* aircraft-detail.js */
    'Positions: JPL approximate elements (3000 BC – 3000 AD); the Moon: truncated ELP-2000/82. Surfaces: Solar System Scope textures (CC BY 4.0) from NASA/JPL/USGS imagery — except the Earth, which is the app’s own whole-Earth basemap (NASA Blue Marble via GIBS), the same picture the map draws under its satellite tiles. Names: USGS Gazetteer of Planetary Nomenclature (IAU). Stars: Hipparcos. Satellites other than the Moon are not modeled — their phase cannot be computed faithfully from published elements alone.': "位置：JPL 近似轨道要素（西元前 3000 年 – 西元 3000 年）；月球采截断的 ELP-2000/82。表面：Solar System Scope 贴图（CC BY 4.0），源自 NASA／JPL／USGS 影像 — 地球除外，地球使用本应用自有的全球底图（NASA Blue Marble，经 GIBS），与地图在卫星瓦片下所绘的是同一张。名称：USGS 行星地名录（IAU）。恒星：Hipparcos。月球以外的卫星未建模 — 仅凭已发表的轨道要素无法忠实计算其相位。",   /* space.js */
    'positive': "正",   /* analysis-panels.js */
    'Pour': "倒水",   /* terrain-water.js */
    'Pouring': "倒水中",   /* terrain-water.js */
    'pre-archive date — day/night terminator + any historical layers': "早于文件起始日期 — 仅显示昼夜界线与历史图层",   /* sims.js */
    'Precip.': "降水",   /* weather.js */
    'Precision': "精度",   /* viewshed.js */
    'prefectures': "都道府县",   /* world-packs.js */
    'Press “Add on map”, then click the map.': "请按「在地图上新增」，然后点击地图。",   /* drone-nav.js */
    'Press and drag on the map to trace an area': "在地图上按住并拖动以描绘范围",   /* map-tools.js */
    'Press and drag on the map to trace any outline.': "在地图上按住并拖动即可描绘任何轮廓。",   /* tool-panel.js */
    'Pressure': "气压",   /* weather.js */
    'previous run': "上次执行",   /* monitors.js */
    'Primary energy': "一次能源",   /* world-packs.js */
    'Prison': "监狱",   /* drone-ops.js */
    'Propagator branch': "外推方法分支",   /* satellite-detail.js */
    'Public-transit routing (Transitous / MOTIS) — includes REAL-TIME updates for this trip (live departures / delays where the operator publishes them).': "大众运输路径规划（Transitous／MOTIS）— 本行程含实时更新（营运者有公布时的实时发车／误点）。",   /* atlas-console.js */
    'Public-transit routing (Transitous / MOTIS) — timetable-based (no real-time data for this trip).': "大众运输路径规划（Transitous／MOTIS）— 以时刻表为准（本行程无实时数据）。",   /* atlas-console.js */
    'Publisher pins': "媒体所在地图钉",   /* atlas-console.js */
    'Publishers': "媒体",   /* monitors.js */
    'QNH': "修正海平面气压",   /* aircraft-detail.js */
    'Querying Wikidata…': "正在查询 Wikidata…",   /* industry-web.js */
    'Quota exceeded': "已超过用量上限",   /* monitors.js */
    'radio 4/3': "无线电 4/3",   /* viewshed.js */
    'Radio coverage': "无线电涵盖",   /* atlas-console.js sims.js */
    'Radio frequency': "无线电频率",   /* drone-nav.js */
    'Radio link': "无线电链路",   /* drone-nav.js */
    'Radioactive': "放射性",   /* sims.js */
    'radioactive dispersion & fallout': "放射性扩散与沉降",   /* atlas-console.js */
    'radioactive fallout': "放射性沉降",   /* atlas-console.js */
    'radius': "半径",   /* map-tools.js */
    'Radius': "半径",   /* space.js terrain-water.js workspace.js */
    'Radius circles': "半径圆",   /* map-tools.js */
    'Rail': "铁路",   /* routing.js */
    'Railways': "铁路",   /* routing.js */
    'Rainfall (mm)': "降雨量（mm）",   /* terrain-water.js */
    'Raise': "抬升",   /* terrain-water.js */
    'raised to clear the terrain below it': "已抬高以避开下方地形",   /* aircraft-detail.js */
    'Ran now': "刚刚执行",   /* atlas-console.js */
    'Ran: ': "已执行：",   /* monitors.js */
    'Range (km)': "射程（公里）",   /* viewshed.js */
    'rate-limited': "受频率限制",   /* atlas-console.js */
    'rays': "射线",   /* viewshed.js */
    'Re-entry velocity (100 km)': "重返速度（100 公里）",   /* atlas-console.js */
    'reachable': "可到达",   /* atlas-console.js drone-nav.js */
    'Reachable area': "可达范围",   /* map-tools.js viewshed.js */
    'Reachable area (drive/walk/cycle)': "可达范围（开车／步行／單车）",   /* tool-panel.js */
    'Reachable area along the REAL road network (Valhalla / OpenStreetMap) — drive / walk / cycle, not a distance circle. Adjust mode & time in the 🎯 panel.': "依真实道路网（Valhalla／OpenStreetMap）计算的可达范围 — 开车／步行／單车，不是距离圆。可在 🎯 面板调整方式与时间。",   /* atlas-console.js */
    'Reaches the sea': "流入海洋",   /* terrain-water.js */
    'Read and analyze this image. If it is a document, a maths/science problem, a table or text, transcribe it accurately and solve or explain it.': "请阅读并分析这张图片。若是文件、数学／科学题目、表格或文字，请正确转录并加以解答或说明。",   /* atlas-console.js */
    'Reading the feed…': "正在读取数据源…",   /* world-packs.js */
    'Reading the image': "正在读取图片",   /* atlas-console.js */
    'Reading the terrain': "正在读取地形",   /* terrain-water.js */
    'Reading the terrain elevation…': "正在读取地形高程…",   /* tool-panel.js */
    'Reading the terrain here…': "正在读取此处地形…",   /* terrain-water.js */
    'Reading the terrain…': "正在读取地形…",   /* sims.js terrain-water.js */
    'Reading the terrain… (coarser level)': "正在读取地形…（较粗的层级）",   /* terrain-water.js */
    'Reading the tide…': "正在读取潮汐…",   /* world-packs.js */
    'Reading this cell…': "正在读取此格…",   /* world-packs.js */
    'real 2011 int$': "2011 年实质国际元",   /* countries-ui.js */
    'real DEM': "实测 DEM",   /* terrain-water.js */
    'real GDP (2011 int$)': "实质 GDP（2011 年国际元）",   /* countries-ui.js */
    'Real terrarium elevation, sculpted by you. Water is routed by priority-flood depression filling and downslope volume accounting — it answers where the water stands and which way it leaves, not how fast the front travels.': "真实 terrarium 高程，由你亲手雕塑。水流以优先权洪水填洼与顺坡体积计算路由 — 它回答的是水停在哪里、往哪里流出，而不是波前推进得多快。",   /* terrain-water.js */
    'Receiver sensitivity': "接收机灵敏度",   /* drone-nav.js */
    'Reception': "接收",   /* aircraft-detail.js */
    'Recolored the current highlights': "已重新着色目前的标示",   /* atlas-console.js */
    'Recompute': "重新计算",   /* tsunami.js */
    'Recompute the intensity map': "重新计算震度分布",   /* seismic.js */
    'Rectangle': "矩形",   /* tool-panel.js */
    'Red = reachable': "红色＝可到达",   /* viewshed.js */
    'Red alert': "红色警戒",   /* world-packs.js */
    'Refraction': "折射",   /* viewshed.js */
    'Refresh': "刷新",   /* weather.js */
    'Regenerate': "重新产生",   /* analysis-panels.js */
    'Region': "地区",   /* monitors.js */
    'Registration': "注册编号",   /* aircraft-detail.js */
    'Rejected — invalid/degenerate shape (not drawn)': "已拒绝 — 形状无效或退化（未绘制）",   /* atlas-console.js */
    'Related articles': "相关报道",   /* atlas-console.js */
    'related indicators (all countries)': "相关指标（所有国家）",   /* atlas-console.js */
    'Related places': "相关地点",   /* atlas-console.js */
    'relative to': "相对于",   /* atlas-console.js */
    'Release start': "释放开始",   /* atlas-console.js */
    'released over': "释放历时",   /* atlas-console.js */
    'reload to apply': "重新加载后生效",   /* atlas-console.js */
    'reloading…': "重新加载中…",   /* atlas-console.js */
    'Remove': "移除",   /* atlas-console.js */
    'Rename': "重新命名",   /* map-tools.js */
    'Report not found.': "找不到报告。",   /* monitors.js */
    'Reports': "报告",   /* monitors.js */
    'Research: ': "研究：",   /* analysis-panels.js atlas-console.js */
    'Researching…': "研究中…",   /* atlas-console.js */
    'Researching… (background, history, economy, military, recent developments)': "研究中…（背景、历史、经济、军事、近期发展）",   /* analysis-panels.js */
    'Reset': "重置",   /* stats-compare.js terrain-water.js */
    'RESET': "重置",   /* flight-sim.js */
    'Reset layout': "重置版面",   /* workspace.js */
    'Reset north': "正北归位",   /* atlas-console.js keyboard-shortcuts.js workspace.js */
    'Reset terrain': "重置地形",   /* terrain-water.js */
    'Rest of the world — GDACS': "世界其他地区 — GDACS",   /* world-packs.js */
    'Restore': "还原",   /* atlas-console.js */
    'Restricted areas': "限制区",   /* drone-nav.js */
    'restricted areas within their buffers': "其缓冲区内的限制区",   /* atlas-console.js */
    'Restricted-area data could not be fetched — this route has NOT been checked against airports, military areas or reserves.': "无法取得限制区数据 — 本路线尚未与机场、军事区或保护区比对。",   /* drone-ops.js */
    'Result': "结果",   /* drone-nav.js */
    'Resume': "继续",   /* monitors.js */
    'Resume drawing': "继续绘制",   /* tool-panel.js */
    'Resumed': "已恢复",   /* atlas-console.js */
    'retrograde': "逆行",   /* space.js */
    'Retry': "重试",   /* atlas-console.js */
    'Return leg added': "已加入回程",   /* atlas-console.js */
    'Return to launch': "返回起飞点",   /* drone-nav.js */
    'Revenue': "营收",   /* industry-web.js */
    'revenue known — area ∝ revenue': "已知营收 — 面积正比于营收",   /* industry-web.js */
    'reverses with the season': "随季节反向",   /* ocean-currents.js */
    'Revolution at epoch': "历元时的圈数",   /* satellite-detail.js */
    'Rises': "升起",   /* satellite-detail.js */
    'Road routing via OSRM (OpenStreetMap) — up to 3 alternatives with lane guidance. Times are typical (no live traffic). Clear it with "clear the route".': "道路路径由 OSRM（OpenStreetMap）计算 — 最多 3 条替代路线并含车道指引。时间为典型值（无实时路况）。可说「清除路线」移除。",   /* atlas-console.js */
    'Road routing with your avoid options via Valhalla (OpenStreetMap). Times are typical (no live traffic). Clear it with "clear the route".': "依你的避开选项，由 Valhalla（OpenStreetMap）计算道路路径。时间为典型值（无实时路况）。可说「清除路线」移除。",   /* atlas-console.js */
    'Roads': "道路",   /* atlas-console.js routing.js */
    'rock (Vs30 760)': "岩盘（Vs30 760）",   /* seismic.js */
    'Roll left': "左滚",   /* flight-sim.js */
    'Roll right': "右滚",   /* flight-sim.js */
    'Rotation': "自转",   /* space.js */
    'round trip': "来回",   /* atlas-console.js */
    'Round trip': "来回",   /* drone-nav.js */
    'route': "路线",   /* atlas-console.js */
    'Route': "路线",   /* map-tools.js routing.js */
    'Route cleared': "已清除路线",   /* atlas-console.js */
    'Route comparison': "路线比较",   /* atlas-console.js */
    'Route on it': "规划到此的路线",   /* routing.js */
    'Route saved': "已保存路线",   /* drone-nav.js */
    'Routed along the REAL rail network (OpenStreetMap), naming the actual lines and stations it rides (walk to the nearest station). JR/Shinkansen publish no open timetable (GTFS), so the time is estimated from typical speeds per line class (high-speed / conventional) — not a live schedule.': "沿真实铁路网（OpenStreetMap）规划，并列出实际搭乘的路线与车站（步行至最近车站）。JR／新干线未公开开放时刻表（GTFS），因此时间依各线等级（高速／在来线）的典型速度推估 — 并非实时时刻。",   /* atlas-console.js */
    'routes — tap one to show it on the map': "条路线 — 点一条即可显示在地图上",   /* atlas-console.js */
    'Routing…': "路径计算中…",   /* routing.js */
    'RUD': "方向舵",   /* flight-sim.js */
    'Run history': "执行纪录",   /* monitors.js */
    'Run now': "立即执行",   /* monitors.js */
    'Run this request again': "重新执行这个请求",   /* atlas-console.js */
    'Running…': "执行中…",   /* monitors.js */
    'runs below sea level on land': "在陆地上低于海平面",   /* terrain-water.js */
    'rupture': "震源域",   /* seismic.js */
    'Rupture': "震源域",   /* seismic.js tsunami.js */
    'Rupture area drawn': "已绘制震源域",   /* tsunami.js */
    'rupture radius': "破裂半径",   /* seismic.js */
    's': "秒",   /* terrain-water.js */
    'S pole in polar night': "南极处于极夜",   /* sims.js */
    'Safest': "最安全",   /* drone-ops.js */
    'samples': "个采样",   /* viewshed.js */
    'Sampling': "采样中",   /* terrain-water.js */
    'Satellite': "卫星影像",   /* atlas-console.js workspace.js */
    'Save': "保存",   /* drone-nav.js */
    'Save & draw next': "保存并绘制下一个",   /* tool-panel.js */
    'Saved': "已保存",   /* atlas-console.js */
    'Saved routes': "已保存的路线",   /* drone-nav.js */
    'Scanning the coast in view…': "正在扫描画面中的海岸…",   /* world-packs.js */
    'Scheduled': "已排程",   /* monitors.js */
    'Science': "科学",   /* satellites-live.js */
    'Screenshot': "屏幕撷取",   /* atlas-console.js workspace.js */
    'Sea floor near the source': "震源附近的海底地形",   /* tsunami.js */
    'Sea level above mean sea level from the Open-Meteo Marine model, hourly, at the point you tapped. Highs and lows are the local extrema of that series (refined between samples). The shading is the ground at or below the current tide level, read from the same elevation model the sea-level layer uses — a still-water fill, not a run-up model.': "以 Open-Meteo Marine 模型提供的平均海平面以上潮位，逐时，位于你点击的地点。高潮与低潮为该序列的局部极值（在采样点之间再细算）。着色为目前潮位以下的陆地，取自海平面图层所用的同一套高程模型 — 属静水填充，并非溯上模型。",   /* world-packs.js */
    'Sea level above mean sea level from the Open-Meteo Marine model, hourly. Highs and lows are the local extrema of that series, refined between samples. Tap a coast for its own table and how far the water reaches — the shading is ground at or below that level, from the same elevation model the sea-level layer uses (a still-water fill, not a run-up model). The clock drives all of it.': "以 Open-Meteo Marine 模型提供的平均海平面以上潮位，逐时。高潮与低潮为该序列的局部极值，并在采样点之间再细算。点击海岸即可看到当地的潮汐表与海水可达范围 — 着色为该水位以下的陆地，取自海平面图层所用的同一套高程模型（静水填充，非溯上模型）。全部由时钟驱动。",   /* world-packs.js */
    'Sea route': "航线",   /* atlas-console.js */
    'sea temperature': "海水温度",   /* atlas-console.js */
    'sea temperature (no place given)': "海水温度（未指定地点）",   /* atlas-console.js */
    'Sea-floor uplift': "海底抬升",   /* tsunami.js */
    'Search & add countries…': "搜索并加入国家…",   /* stats-compare.js */
    'Search layers…': "搜索图层…",   /* map-ui.js */
    'Searching': "搜索中",   /* atlas-console.js */
    'Searching the next 24 hours…': "正在搜索未来 24 小时…",   /* satellite-detail.js */
    'See the past world': "看看过去的世界",   /* news-timeline.js */
    'seismic waves': "地震波",   /* atlas-console.js */
    'Seismic waves': "地震波",   /* atlas-console.js seismic.js */
    'Seismic waves (set as epicentre)': "地震波（设为震央）",   /* tool-panel.js */
    'Select a radius, draw an area, or resolve a region first — then say “monitor this area”.': "请先选定半径、画出范围或指定地区 — 然后说「监看这个区域」。",   /* atlas-console.js */
    'Select at least one indicator.': "请至少选择一项指标。",   /* stats-compare.js */
    'Selected': "已选取",   /* atlas-console.js world-packs.js */
    'Selected altitude': "选定高度",   /* aircraft-detail.js */
    'Semi-major axis': "半长轴",   /* space.js */
    'Send': "送出",   /* analysis-panels.js atlas-console.js */
    'Sensitivity': "灵敏度",   /* monitors.js */
    'Sep': "9月",   /* ocean-currents.js */
    'Set by the drawn rupture — remove it to edit': "由所绘震源域决定 — 移除后才可编辑",   /* seismic.js */
    'Set the heights and range, then analyze. Leave the frequency empty for pure geometry; give one to also get first-Fresnel and diffraction.': "设置高度与距离后再分析。频率留空即为纯几何计算；填入频率则会一并算出第一菲涅耳区与绕射。",   /* viewshed.js */
    'Set view': "设置视角",   /* app-body.js */
    'Sets': "集合",   /* satellite-detail.js */
    'Settings': "设置",   /* atlas-console.js workspace.js */
    'severe': "严重",   /* seismic.js */
    'Shaded cells at this level': "此水位的着色格数",   /* world-packs.js */
    'Shadow opacity': "阴影不透明度",   /* sims.js */
    'Shadows are cast by OSM buildings in view (zoom in past ~z15) and, with the terrain button on, by the real elevation model. Sun path from the SunCalc algorithm; 3D building faces are lit from the sun. The point analysis reads a 360° horizon off the DEM (curvature + refraction) and steps a whole year against it; the irradiance is CLEAR-SKY, not a weather forecast.': "阴影由画面中的 OSM 建筑投下（请放大至约 z15 以上），开启地形按钮后也会由实测高程模型投下。太阳轨迹采 SunCalc 算法；3D 建筑面由太阳照明。單点分析会由 DEM 读取 360° 地平线（含曲率与折射）并推算整年；辐照度为晴空值，不是天气预报。",   /* sims.js */
    'shaking': "震动",   /* seismic.js */
    'Shallow-water long waves on a spherical staggered grid, with total-depth pressure and Manning bottom friction, solved in a background thread. Depth from the terrarium DEM; initial sea-floor displacement from Okada (1985) summed over a tapered sub-fault grid, with Wells & Coppersmith (1994) fault dimensions and the strike read off the local bathymetric gradient. Cells are tens of kilometers, so this is an open-ocean model: arrival times and deep-water amplitude are meaningful, harbor resonance and run-up are not. Coastal height is a Green’s-law estimate. Educational model — in a real emergency follow the official authorities.': "球面交错格网上的浅水长波，含全水深压力项与曼宁底床摩擦，于背景执行绪求解。水深取自 terrarium DEM；初始海底位移采 Okada（1985），并在渐缩的次断层网格上加总，断层尺寸采 Wells & Coppersmith（1994），走向由当地海底地形梯度读出。格子为数十公里，因此属开放海域模型：到达时刻与深海波幅有意义，港湾共振与溯上则否。沿岸波高为格林定律推估。教育性模型 — 实际灾害时请遵从官方指示。",   /* tsunami.js */
    'Shallow-water long waves over the whole ocean; the frames stream in as they are solved.': "全海域的浅水长波；画面在求解过程中实时串流进来。",   /* atlas-console.js */
    'Share of electricity generated from low-carbon sources (nuclear + renewables)': "低碳来源（核能＋再生能源）发电占比",   /* world-packs.js */
    'Share of primary energy from fossil fuels (coal + oil + gas)': "化石燃料（煤＋石油＋天然气）占一次能源比例",   /* world-packs.js */
    'Share of the selected country’s total trade (the white country is the one selected)': "占所选国家总贸易额的比例（白色国家为所选国家）",   /* world-packs.js */
    'Share panel': "分享面板",   /* atlas-console.js */
    'Share the view': "分享此画面",   /* tool-panel.js */
    'Share this view': "分享这个画面",   /* map-ui.js workspace.js */
    'Share…': "分享…",   /* map-ui.js */
    'Shindo': "震度",   /* seismic.js */
    'Shortest': "最短",   /* drone-ops.js routing.js */
    'Show': "显示",   /* aircraft-detail.js space.js tool-panel.js */
    'Show / hide': "显示／隐藏",   /* map-tools.js */
    'Show / hide on the map': "在地图上显示／隐藏",   /* atlas-console.js */
    'Show change points on map': "在地图上显示变化点",   /* monitors.js */
    'Show details': "显示详情",   /* terrain-water.js */
    'Show on map': "在地图上显示",   /* monitors.js */
    'Showing the nearest available panorama — exact Street View coverage couldn\'t be verified (a network filter or browser extension may be blocking Google\'s tiles)': "显示最近可用的全景 — 无法确认确切的街景涵盖（可能有网络过滤器或浏览器扩充功能挡住了 Google 的瓦片）",   /* street-view.js */
    'Shown on the map': "已显示在地图上",   /* atlas-console.js */
    'shown on the map. I could not compile a written summary this time — try rephrasing the question.': "已显示在地图上。这次无法整理出文字摘要 — 请换个说法再问。",   /* atlas-console.js */
    'Signal': "讯号",   /* aircraft-detail.js */
    'Silver': "白银",   /* map-ui.js */
    'Sim window': "模拟窗口",   /* atlas-console.js */
    'Simulate': "模拟",   /* tsunami.js */
    'Simulation failed — try again.': "模拟失败 — 请再试一次。",   /* sims.js */
    'Sky from': "天空来自",   /* atlas-console.js */
    'Sky from here': "从此处看到的天空",   /* night-sky.js */
    'Slant range': "斜距",   /* satellite-detail.js */
    'Slope / aspect': "坡度／坡向",   /* sims.js */
    'Slope aspect (direction each slope faces)': "坡向（每个坡面朝向的方位）",   /* atlas-console.js */
    'slope direction (hue = compass bearing it faces)': "坡向（色相＝其朝向的方位）",   /* sims.js */
    'slope over': "坡度量测距离",   /* seismic.js */
    'Slope steepness (angle)': "坡度（角度）",   /* atlas-console.js */
    'Slower': "较慢",   /* space.js */
    'Smoke': "烟雾",   /* sims.js */
    'smoke plume': "烟流",   /* atlas-console.js */
    'Smooth — ': "平滑 — ",   /* flight-sim.js */
    'Society': "社会",   /* countries-ui.js */
    'soft soil (Vs30 180)': "软弱土层（Vs30 180）",   /* seismic.js */
    'Solar system': "太阳系",   /* space.js */
    'Some data sources need attention (red). Atlas uses fallbacks where it can.': "部分数据来源需要注意（红色）。Atlas 会在可行处使用替代来源。",   /* atlas-console.js */
    'Some member boundaries could not be fetched — the shape may be missing pieces': "部分成员界线无法取得 — 图形可能缺少一些部分",   /* atlas-console.js */
    'Some regions built from member administrative boundaries': "部分地区由成员的行政界线组成",   /* atlas-console.js */
    'Some regions from real OpenStreetMap boundaries': "部分地区取自 OpenStreetMap 的实际界线",   /* atlas-console.js */
    'Some ride-segment shapes could not be retrieved — those legs are listed above but not drawn on the map (no straight-line substitutes).': "部分乘车路段的形状无法取得 — 这些路段列在上方但未画在地图上（不以直线代替）。",   /* atlas-console.js */
    'Some targets could not be matched to border data — checking with the model': "部分目标无法对应到界线数据 — 正在向模型确认",   /* atlas-console.js */
    'soon': "即将",   /* monitors.js */
    'Sorry, I could not interpret that.': "抱歉，我无法理解这句话。",   /* atlas-console.js */
    'SOUND': "音效",   /* flight-sim.js */
    'Source': "来源",   /* aircraft-detail.js atlas-console.js cameras.js */
    'Source term': "源项",   /* atlas-console.js */
    'Source unavailable': "来源无法使用",   /* monitors.js */
    'Source: AI-estimated (neither OpenStreetMap nor Wikidata had matching entries here — positions are approximate, verify before relying on them)': "来源：AI 推估（此处 OpenStreetMap 与 Wikidata 都没有相符的项目 — 位置为概略值，采用前请自行查证）",   /* atlas-console.js */
    'Source: Our World in Data — Ember (electricity) and the Energy Institute Statistical Review (primary energy). The map shades the low-carbon share of electricity, and the fossil share of primary energy; the bar is the mix itself, because nine sources are not one color.': "来源：Our World in Data — Ember（电力）与 Energy Institute Statistical Review（一次能源）。地图着色为电力的低碳占比，以及一次能源的化石占比；长条则是能源结构本身，因为九种来源不能用一种颜色表示。",   /* world-packs.js */
    'Sources': "来源",   /* atlas-console.js space.js */
    'Sources per indicator: World Bank / IMF WEO / bundled reference (shown in bar & time-series views)': "各指标的来源：世界银行／IMF WEO／内建参考数据（在长条图与时间序列检视中标示）",   /* stats-compare.js */
    'Sources: NOAA CoastWatch blended sea-surface geostrophic currents from multi-mission satellite altimetry (0.25°); NOAA NCEI blended wind stress, turned into the Ekman surface current by the drifter-fitted relation of Ralph & Niiler (1999); and NOAA OISST v2.1 sea-surface temperature. All U.S. Government works in the public domain; altimetric products generated using AVISO+. This layer is a FIXED dataset that ships with the app: a climatological mean of fields spread across the whole record, on the source\'s own 0.25° grid, with each named current traced through that measured field from a published seed on its core. Warm / cold / zonal is MEASURED, not asserted — it is the current\'s own temperature against the zonal mean at the same latitude. Because it is a mean, it does not follow the app clock: it is the climatological picture, the same every time you open it.': "来源：NOAA CoastWatch 由多任务卫星测高融合而成的海表地转流（0.25°）；NOAA NCEI 融合风应力，并依 Ralph & Niiler（1999）以漂流浮标拟合的关系换算为艾克曼表层流；以及 NOAA OISST v2.1 海面水温。以上皆为美国政府公有领域作品；测高产品使用 AVISO+ 产制。本图层是随应用一并提供的固定数据集：以整段纪录期间的场求气候平均，采用来源本身的 0.25° 网格，每一条具名海流都是从其核心上已发表的种子点，在该实测场中追踪而成。暖流／寒流／东西流是实测而非宣称 — 它是该海流自身的水温与同纬度纬向平均的比较。由于是平均值，它不随应用时钟变动：它是气候平均的样貌，每次开启都相同。",   /* ocean-currents.js */
    'Sources: OpenStreetMap (facilities, city population tags — coverage varies by region), USGS (earthquakes), IntMap country statistics. Pins are clickable; the circle marks the analysis radius.': "来源：OpenStreetMap（设施、城市人口标记 — 各地涵盖程度不一）、USGS（地震）、IntMap 国家统计。图钉可点击；圆形标示分析半径。",   /* atlas-console.js */
    'south': "南",   /* atlas-console.js */
    'southeast': "东南",   /* atlas-console.js */
    'southwest': "西南",   /* atlas-console.js */
    'Space explorer': "宇宙探索",   /* atlas-console.js */
    'Space stations': "太空站",   /* satellites-live.js */
    'Spacecraft': "太空船",   /* space.js */
    'Spacecraft: NASA/JPL Horizons trajectories, sampled and interpolated. A trajectory is not telemetry — a mission that has ended or lost contact is still propagated, and is labelled as such.': "太空船：NASA／JPL Horizons 轨迹，采样后内插。轨迹不是遥测数据 — 任务已结束或已失联者仍会继续外推，并会如实标示。",   /* space.js */
    'SPD': "速度",   /* flight-sim.js */
    'Spearman ρ (rank)': "斯皮尔曼 ρ（等级）",   /* analysis-panels.js */
    'Speed': "速度",   /* satellite-detail.js space.js tsunami.js */
    'spill points': "溢流点",   /* atlas-console.js terrain-water.js */
    'Sports pitch': "运动场",   /* drone-ops.js */
    'Spreads into standing water': "扩散为积水",   /* terrain-water.js */
    'Squawk': "应答机码",   /* aircraft-detail.js */
    'STALL': "失速",   /* flight-sim.js */
    'Stand and look up': "站着抬头看",   /* tool-panel.js */
    'standard': "标准",   /* atlas-console.js */
    'Standing here': "站在此处",   /* night-sky.js */
    'Starlink': "Starlink",   /* satellites-live.js */
    'stars above the measured skyline': "颗恒星位于实测天际线之上",   /* atlas-console.js */
    'stars visible': "颗可见恒星",   /* night-sky.js */
    'Stars: Hipparcos (ESA 1997). Sun, Moon and planets: JPL approximate elements. Terrain: Terrarium DEM (Mapzen/AWS).': "恒星：Hipparcos（ESA 1997）。太阳、月球与行星：JPL 近似轨道要素。地形：Terrarium DEM（Mapzen／AWS）。",   /* night-sky.js */
    'start': "起点",   /* stats-compare.js */
    'Start': "开始",   /* routing.js */
    'START ▸': "开始 ▸",   /* flight-sim.js */
    'Start altitude': "起始高度",   /* flight-sim.js */
    'Start location': "起始位置",   /* flight-sim.js */
    'Start mode': "起始模式",   /* flight-sim.js */
    'Starting…': "启动中…",   /* viewshed.js */
    'stations reachable within the time budget, riding the REAL OSM rail network (edge time = length ÷ line-class speed) — colored green→orange by minutes. Not a live timetable.': "个车站可在时间预算内到达，行驶于真实 OSM 铁路网（路段时间＝长度 ÷ 线路等级速度）— 依分钟数由绿到橙着色。并非实时时刻表。",   /* atlas-console.js */
    'steepest': "最陡",   /* routing.js */
    'Step back': "上一步",   /* street-view.js */
    'Step forward': "下一步",   /* street-view.js */
    'Stepping through the solstice day…': "正在逐步推演至日至那天…",   /* sims.js */
    'steps': "步",   /* terrain-water.js tsunami.js viewshed.js */
    'stiff soil (Vs30 360)': "坚硬土层（Vs30 360）",   /* seismic.js */
    'still flowing at the 600 km limit': "在 600 公里界限处仍在流动",   /* terrain-water.js */
    'Stop': "停止",   /* routing.js */
    'Stop answering': "停止回答",   /* atlas-console.js */
    'Stopped': "已停止",   /* atlas-console.js */
    'stops': "个停靠点",   /* atlas-console.js */
    'straight': "直行",   /* routing.js */
    'Street View': "街景",   /* atlas-console.js street-view.js tool-panel.js */
    'Street View coverage': "街景涵盖",   /* atlas-console.js */
    'Street View mode — the light-blue lines are Google\'s real coverage; click one to open its panorama': "街景模式 — 浅蓝色线是 Google 的实际涵盖范围；点一条即可开启其全景",   /* street-view.js */
    'Street View mode on — the light-blue lines are Google\'s real coverage; click one to open its panorama': "已开启街景模式 — 浅蓝色线是 Google 的实际涵盖范围；点一条即可开启其全景",   /* atlas-console.js */
    'Street View off': "已关闭街景",   /* atlas-console.js */
    'Street View viewpoint — drag me to move it': "街景视点 — 拖动我即可移动",   /* street-view.js */
    'Stress drop (MPa)': "应力降（MPa）",   /* seismic.js */
    'strike': "走向",   /* tsunami.js */
    'strong': "强",   /* analysis-panels.js atlas-console.js seismic.js */
    'Sub-satellite point': "星下点",   /* satellite-detail.js */
    'sub-solar lat': "直射点纬度",   /* sims.js */
    'Subject pins': "事件地图钉",   /* atlas-console.js */
    'Subway': "地铁",   /* routing.js */
    'Suggested questions': "建议的问题",   /* analysis-panels.js */
    'sum of circles (overlaps counted twice)': "各圆面积之和（重叠处重复计算）",   /* atlas-console.js */
    'summer': "夏季",   /* sims.js */
    'sun': "太阳",   /* sims.js */
    'Sun': "太阳",   /* night-sky.js */
    'sun & shadow': "日照与阴影",   /* atlas-console.js */
    'Sun & shadow': "日照与阴影",   /* atlas-console.js sims.js */
    'sun positions': "太阳位置",   /* sims.js */
    'Sun-synchronous low Earth orbit': "太阳同步低地球轨道",   /* satellite-detail.js */
    'Sunlight at a point': "單点日照",   /* sims.js */
    'Sunlight hours & shade': "日照时数与遮蔽",   /* tool-panel.js */
    'Sunlight hours & terrain shade': "日照时数与地形遮蔽",   /* atlas-console.js */
    'sunlit': "受阳光照射",   /* atlas-console.js satellites-live.js */
    'Sunlit': "受阳光照射",   /* satellite-detail.js */
    'Sunrise': "日出",   /* widgets.js */
    'Sunset': "日落",   /* widgets.js */
    'Superseded by a newer route request.': "已被更新的路线请求取代。",   /* atlas-console.js */
    'Support': "支持",   /* workspace.js */
    'Surface wind': "地面风",   /* atlas-console.js */
    'Swap': "对调",   /* routing.js */
    'Swap rows/columns': "对调列与栏",   /* stats-compare.js */
    'Switch the map click to “Add a place” to add rows here.': "请把地图点击切换为「新增地点」以在此加入列。",   /* seismic.js */
    'Switch to workspace →': "切换到工作区 →",   /* workspace.js */
    'Switching to': "正在切换为",   /* atlas-console.js */
    'Table': "表格",   /* stats-compare.js */
    'Take the exit ramp': "下交流道",   /* routing.js */
    'Take the on-ramp': "上交流道",   /* routing.js */
    'Tap a coast for its tide times and how far the water reaches.': "点击海岸即可看到潮汐时刻与海水可达范围。",   /* world-packs.js */
    'Tap a country for its mix.': "点击国家可看其能源结构。",   /* world-packs.js */
    'Tap a country on the map.': "请在地图上点击国家。",   /* world-packs.js */
    'Tap a country to see who it trades with.': "点击国家可看它与谁贸易。",   /* world-packs.js */
    'Tap any country for the legend its own agency uses.': "点击任一国家，即可看到其机关自定义的图例。",   /* world-packs.js */
    'Tap the map to place it.': "点击地图即可放置。",   /* map-pick.js */
    'Tap the map to place the antenna.': "点击地图以放置天线。",   /* sims.js */
    'Tap the map to place the epicenter — or to move it. Press the button again to turn this off.': "点击地图以放置震央 — 或移动它。再按一次按钮即可关闭。",   /* seismic.js */
    'Tap the map to place the epicenter.': "点击地图以放置震央。",   /* seismic.js */
    'Tap the map to place the source.': "点击地图以放置源头。",   /* sims.js */
    'Tap the point to analyze.': "点击要分析的地点。",   /* sims.js */
    'tap to clear': "点击即可清除",   /* routing.js */
    'Target height (m)': "目标高度（米）",   /* viewshed.js */
    'Tell me a start and destination — e.g. "directions from Tokyo to Osaka" or "電車で新宿から横浜".': "请告诉我起点与目的地 — 例如「东京到大阪的路线」或「电车で新宿から横浜」。",   /* atlas-console.js */
    'terrain': "地形",   /* drone-nav.js */
    'terrain & water': "地形与水",   /* atlas-console.js */
    'Terrain & water': "地形与水",   /* atlas-console.js */
    'Terrain & water flow': "地形与水流",   /* tool-panel.js */
    'Terrain &amp; water': "地形与水",   /* terrain-water.js */
    'Terrain shadow': "地形阴影",   /* sims.js */
    'terrain to': "地形量测至",   /* seismic.js */
    'Terrain too coarse here — uniform site class used': "此处地形过于粗糙 — 已改用單一场址分类",   /* seismic.js */
    'That area is too large/detailed to save. Try a simpler shape.': "该范围太大或太细致，无法保存。请改用较简單的形状。",   /* monitors.js */
    'That name is ambiguous — which did you mean?': "这个名称不明确 — 你指的是哪一个？",   /* atlas-console.js */
    'That range reaches past the map’s poles — reduce it.': "该范围已超出地图的两极 — 请缩小。",   /* viewshed.js */
    'The AI provider quota was reached — this is separate from your IntMap free uses. Please try again later.': "AI 供应商的用量上限已达 — 这与你的 IntMap 免费次数无关。请稍后再试。",   /* ai-core.js */
    'The AI response was malformed — please try again.': "AI 回应格式错误 — 请再试一次。",   /* ai-core.js */
    'The AI returned an empty response — please try again.': "AI 回传了空白内容 — 请再试一次。",   /* ai-core.js */
    'The AI safety filter blocked that. Try rephrasing it as a public-information, broad-area analysis (e.g. an approximate zone or reach rings for defense/preparedness) rather than precise targeting.': "AI 的安全过滤机制挡下了该请求。请改以公开信息、大范围分析的方式提问（例如概略区域或用于防灾的距离环），而非精确目标。",   /* ai-core.js */
    'The AI service is busy right now — please try again in a moment (this is not your IntMap usage limit).': "AI 服务目前忙碌 — 请稍候再试（这不是你的 IntMap 用量上限）。",   /* ai-core.js */
    'The AI service is temporarily unavailable — please try again shortly.': "AI 服务暂时无法使用 — 请稍后再试。",   /* ai-core.js */
    'The AI structured output was invalid — please try again.': "AI 的结构化输出无效 — 请再试一次。",   /* ai-core.js */
    'The analysis returned no answer': "分析没有回传结果",   /* atlas-console.js */
    'The brief came back empty': "简报回传为空",   /* atlas-console.js */
    'The bundled current data could not be read.': "无法读取内建的海流数据。",   /* ocean-currents.js */
    'the current view': "目前画面",   /* atlas-console.js */
    'The dispersion simulation could not run (map still loading)': "扩散模拟无法执行（地图仍在加载）",   /* atlas-console.js */
    'the drawn area': "所绘范围",   /* atlas-console.js */
    'The drone operations module is unavailable': "无人机作业模组无法使用",   /* atlas-console.js */
    'The earthquake changed — recomputing the propagation.': "地震条件已改变 — 正在重新计算传播。",   /* tsunami.js */
    'The element set behind these numbers': "这些数字背后的轨道要素",   /* satellite-detail.js */
    'The elevation tiles could not be fetched — check the connection and try again.': "无法取得高程瓦片 — 请检查连接后再试。",   /* terrain-water.js */
    'The engine selector is unavailable.': "引擎选择器无法使用。",   /* atlas-console.js */
    'The evidence did not support any concrete mappable items — nothing was invented': "证据不足以支持任何具体可标绘的项目 — 没有任何内容是杜撰的",   /* atlas-console.js */
    'the field grid could not be read': "无法读取流向场网格",   /* ocean-currents.js */
    'The flight simulator is unavailable.': "飞行模拟器无法使用。",   /* aircraft-detail.js */
    'The flight starts the moment you do.': "你一动，飞行就开始。",   /* flight-sim.js */
    'The global sea-floor data could not be loaded, so there is nothing to propagate the wave over.': "无法加载全球海底数据，因此没有可供波浪传播的地形。",   /* tsunami.js */
    'The ground station is the first waypoint unless you set another.': "除非另行设置，否则地面站即为第一个航点。",   /* drone-nav.js */
    'the loaded catalog is': "已加载的目录为",   /* atlas-console.js */
    'The map highlight could not be drawn (map still loading)': "无法绘制地图标示（地图仍在加载）",   /* atlas-reply.js */
    'The map view could not be updated for this, but the explanation above stands.': "无法为此更新地图画面，但上面的说明仍然成立。",   /* atlas-console.js */
    'The monitor runs on our servers even when this page is closed. A report is generated only when a meaningful change is detected — every claim links to its source.': "即使关闭这个页面，监看仍会在我们的服务器上执行。只有侦测到有意义的变化时才会产生报告 — 每一项主张都会链接到其来源。",   /* monitors.js */
    'The monthly fields could not be read — the mean is shown.': "无法读取月别数据 — 显示年平均。",   /* ocean-currents.js */
    'the Moon is up here': "月亮在此地已升起",   /* space.js */
    'The obstacle is close to the far end, so raising THIS antenna barely helps — raise the other one.': "障碍物靠近另一端，因此提高「这一端」的天线几乎没有帮助 — 请提高另一端。",   /* viewshed.js */
    'The orbit': "轨道",   /* satellite-detail.js */
    'The ownership statements could not be fetched this time, so no lines are drawn. That is a failed query, not an absence of ownership.': "这次无法取得持股关系的叙述，因此没有画出任何连接。这是查询失败，并不代表没有持股关系。",   /* industry-web.js */
    'The parameters changed — press ▶ to recompute the intensity map.': "参数已变更 — 请按 ▶ 重新计算震度分布。",   /* seismic.js */
    'The past 30 days': "过去 30 天",   /* monitors.js */
    'The previous run': "上次执行",   /* monitors.js */
    'the query took longer than 45 s': "查询超过 45 秒",   /* industry-web.js */
    'the region outline was not available, so related places are shown as points': "无法取得该地区的轮廓，因此相关地点以点显示",   /* atlas-console.js */
    'The route already ends at the launch point': "路线已经在起飞点结束",   /* atlas-console.js */
    'The route already ends at the launch point.': "路线已经在起飞点结束。",   /* drone-nav.js */
    'The route ends where it started, so no separate return leg is needed.': "路线终点与起点相同，因此不需要另外的回程。",   /* drone-ops.js */
    'The routing service is unreachable right now (outage or network) — the route was NOT computed. Try again shortly.': "目前无法连接到路径服务（服务中断或网络问题）— 路线并未计算。请稍后再试。",   /* atlas-console.js */
    'The routing service is unreachable right now (outage or network) — try again shortly.': "目前无法连接到路径服务（服务中断或网络问题）— 请稍后再试。",   /* routing.js */
    'The routing service timed out — try again.': "路径服务逾时 — 请再试一次。",   /* atlas-console.js routing.js */
    'The run failed.': "执行失败。",   /* atlas-console.js */
    'The satellites of the selected planet, propagated from JPL mean elements': "所选行星的卫星，依 JPL 平均轨道要素外推",   /* space.js */
    'The shape resolved for that region was invalid (degenerate/self-intersecting) and was not drawn': "该地区解析出的形状无效（退化或自相交），未绘制",   /* atlas-console.js */
    'the shown search box': "显示中的搜索框",   /* atlas-console.js */
    'the solar system at the chosen instant, from published orbital elements.': "依据已发表的轨道要素，呈现所选时刻的太阳系。",   /* atlas-console.js */
    'The solution left its physical bounds and was stopped — no picture is shown rather than a wrong one.': "解答已超出其物理界限并已中止 — 宁可不显示画面，也不显示错的画面。",   /* tsunami.js */
    'The space explorer is not available in this build.': "此版本不提供宇宙探索功能。",   /* atlas-console.js */
    'The spacing follows the view — zoom in and the same measured grid is drawn finer, down to its own 0.25° (~28 km).': "箭头间距会跟随画面 — 放大后同一组实测网格会画得更细，最细可到其本身的 0.25°（约 28 公里）。",   /* ocean-currents.js */
    'the sun does not rise today': "今天太阳不会升起",   /* widgets.js */
    'the sun does not set today': "今天太阳不会落下",   /* widgets.js */
    'The tide model could not be fetched.': "无法取得潮汐模型。",   /* world-packs.js */
    'The time machine reaches back to 1900': "时光机可回溯到 1900 年",   /* atlas-console.js */
    'The trace failed here': "此处追踪失败",   /* terrain-water.js */
    'The tsunami propagation simulator is not available in this build.': "此版本不提供海啸传播模拟器。",   /* atlas-console.js */
    'the whole map (news, countries, borders, climate era) moves with it': "整张地图（新闻、国家、国界、气候年代）都会随之改变",   /* atlas-console.js */
    'the wind forecast is unavailable': "无法取得风场预报",   /* drone-ops.js */
    'Theme': "主题",   /* atlas-console.js */
    'Theme (light → dark → auto)': "主题（浅色 → 深色 → 自动）",   /* keyboard-shortcuts.js */
    'There is no other saved route to check against': "没有其他已保存的路线可比对",   /* atlas-console.js */
    'thermal — 3rd-degree burns': "热辐射 — 三度烧伤",   /* atlas-sims.js */
    'These elements are more than three days old — an SGP4 position drifts from them, so treat this as approximate.': "这些轨道要素已超过三天 — SGP4 位置会随之偏移，请视为概略值。",   /* satellite-detail.js */
    'These names are ambiguous — which did you mean for each?': "这些名称不明确 — 每一个你指的是哪一个？",   /* atlas-console.js */
    'Thickness': "厚度",   /* tool-panel.js */
    'Thinking': "思考中",   /* atlas-console.js */
    'Thinking…': "思考中…",   /* analysis-panels.js */
    'This browser cannot run the solver in a background thread, so the propagation model is unavailable here.': "这个浏览器无法在背景执行绪中执行求解器，因此此处无法使用传播模型。",   /* tsunami.js */
    'This camera is momentarily offline.': "这台摄影机暂时离线。",   /* cameras.js */
    'this company on Wikidata ↗': "在 Wikidata 上查看这家公司 ↗",   /* industry-web.js */
    'This crop and variable could not be fetched from GAEZ — it will be tried again when the map moves.': "无法从 GAEZ 取得此作物与变量 — 地图移动时会再试一次。",   /* world-packs.js */
    'This epicenter is inland — there is no sea to displace here.': "这个震央位于内陆 — 此处没有可被抬升的海水。",   /* tsunami.js */
    'This feed could not be fetched just now, so nothing below is a statement about what is in force.': "目前无法取得此数据源，因此以下内容并不代表实际生效中的警报。",   /* world-packs.js */
    'This help': "本说明",   /* keyboard-shortcuts.js */
    'This mission has ended. The trajectory is still published; the spacecraft is no longer operating.': "这项任务已结束。轨迹仍持续公布；太空船已不再运作。",   /* space.js */
    'This monitor can’t run right now.': "这个监看目前无法执行。",   /* monitors.js */
    'This monitor is paused — resume it to run.': "这个监看已暂停 — 请先恢复再执行。",   /* monitors.js */
    'This orbit is not closed — the object passes the Sun once and leaves. There is no period and no repeat.': "这条轨道不封闭 — 天体只经过太阳一次便离去。没有周期，也不会重复。",   /* space.js */
    'This satellite does not rise above the horizon here in the next 24 hours.': "未来 24 小时内，这颗卫星不会升到此地的地平线之上。",   /* satellite-detail.js */
    'This satellite is no longer in the current catalog.': "这颗卫星已不在目前的目录中。",   /* satellite-detail.js */
    'THR': "推力",   /* flight-sim.js */
    'Ticker': "跑马灯",   /* workspace.js */
    'Tides': "潮汐",   /* world-packs.js */
    'Tilt': "倾斜",   /* atlas-console.js */
    'Time': "时间",   /* drone-nav.js news-timeline.js sims.js */
    'TIME': "时间",   /* flight-sim.js */
    'Time — tap to add/remove (max 3)': "时间 — 点击可新增／移除（最多 3 个）",   /* map-tools.js */
    'Time machine': "时光机",   /* news-timeline.js */
    'Time machine unavailable': "时光机无法使用",   /* atlas-console.js */
    'time option applies to transit (road times are typical, not traffic-aware)': "时间选项仅适用于大众运输（道路时间为典型值，未计入路况）",   /* routing.js */
    'Time set': "已设置时间",   /* atlas-console.js */
    'Time speed': "时间速度",   /* terrain-water.js */
    'Time-series': "时间序列",   /* atlas-console.js stats-compare.js */
    'Time-zone data unavailable': "无法取得时区数据",   /* layer-packs.js */
    'Timed out': "已逾时",   /* monitors.js */
    'Timezones': "时区",   /* countries-ui.js */
    'tkgCom': 'tkgCom',   /* i18n-late.js */
    'tkgCrypto': 'tkgCrypto',   /* i18n-late.js */
    'tkgFx': 'tkgFx',   /* i18n-late.js */
    'tkgIdx': 'tkgIdx',   /* i18n-late.js */
    'tkItems': 'tkItems',   /* i18n-late.js */
    'tkNews': 'tkNews',   /* i18n-late.js */
    'to': "至",   /* tool-panel.js */
    'Today': "今天",   /* news-timeline.js sims.js weather.js */
    'Toggle sidebar': "切换侧边栏",   /* keyboard-shortcuts.js */
    'tolls': "收费道路",   /* routing.js */
    'Tolls': "收费道路",   /* routing.js */
    'Too few countries have enough data for this combination': "具备此组合足够数据的国家太少",   /* atlas-console.js */
    'Too many requests — wait a moment and try again.': "请求过于频繁 — 请稍候再试。",   /* atlas-console.js routing.js */
    'tools': "工具",   /* atlas-console.js */
    'Tools': "工具",   /* workspace.js */
    'Top': "前",   /* atlas-console.js */
    'Top ': "前 ",   /* atlas-console.js */
    'TOP SPEED': "最高速度",   /* flight-sim.js */
    'total': "合计",   /* space.js tool-panel.js */
    'Total climb': "总爬升",   /* drone-nav.js */
    'toward ': "朝向 ",   /* routing.js */
    'toward the': "朝向",   /* atlas-console.js */
    'traced as far as the elevation budget allows': "已依高程预算尽可能追踪",   /* terrain-water.js */
    'traced as far as the window budget allows': "已依窗口预算尽可能追踪",   /* terrain-water.js */
    'Tracing downstream': "正在往下游追踪",   /* terrain-water.js */
    'tracing…': "追踪中…",   /* terrain-water.js */
    'Track': "轨迹",   /* aircraft-detail.js */
    'Track of': "轨迹：",   /* atlas-console.js */
    'Trade data could not be fetched.': "无法取得贸易数据。",   /* world-packs.js */
    'Trade flows': "贸易流",   /* world-packs.js */
    'Traffic camera': "路况摄影机",   /* cameras.js */
    'Tram': "路面电车",   /* routing.js */
    'Trans-Neptunian object': "海王星外天体",   /* space.js */
    'Transit': "大众运输",   /* routing.js */
    'Transit data (GTFS) may not cover this area yet. Try 🚗 driving or 🚶 walking, or a route within a covered city/country.': "大众运输数据（GTFS）可能尚未涵盖此区域。请改用 🚗 开车或 🚶 步行，或选择已涵盖的城市／国家内的路线。",   /* routing.js */
    'Translate': "翻译",   /* atlas-console.js */
    'Transmit power': "发射功率",   /* drone-nav.js */
    'Transpose': "转置",   /* stats-compare.js */
    'Travel-time contours (hours)': "旅行时间等值线（小时）",   /* tsunami.js */
    'Tropic of Cancer': "北回归线",   /* map-readout.js */
    'Tropic of Capricorn': "南回归线",   /* map-readout.js */
    'True airspeed': "真空速",   /* aircraft-detail.js */
    'True scale': "实际比例",   /* space.js */
    'Try asking': "试着问",   /* analysis-panels.js */
    'Tsunami propagation': "海啸传播",   /* atlas-console.js tsunami.js */
    'turn': "转弯",   /* routing.js */
    'Turn left': "左转",   /* routing.js street-view.js */
    'Turn right': "右转",   /* routing.js street-view.js */
    'Turn sharply left': "大幅左转",   /* routing.js */
    'Turn sharply right': "大幅右转",   /* routing.js */
    'Turn sideways for the full deck': "请把手机横放以显示完整操作盘",   /* flight-sim.js */
    'Turn your phone sideways': "请把手机横放",   /* flight-sim.js */
    'TX power (dBm)': "发射功率（dBm）",   /* sims.js */
    'Type code': "型号代码",   /* aircraft-detail.js */
    'UN member': "联合国会员国",   /* countries-ui.js */
    'unavailable': "无法使用",   /* atlas-console.js world-packs.js */
    'Unavailable components skipped': "已略过无法取得的成分",   /* atlas-console.js */
    'Unbound orbit': "非闭合轨道",   /* space.js */
    'Uncertain in the image': "影像中无法确定",   /* atlas-console.js */
    'undated': "无日期",   /* atlas-console.js */
    'Undo': "复原",   /* terrain-water.js */
    'Unhealthy': "对健康有害",   /* widgets.js */
    'Unhealthy (sensitive)': "对敏感族群有害",   /* widgets.js */
    'United States — NWS': "美国 — NWS",   /* world-packs.js */
    'Unknown action': "未知的操作",   /* atlas-console.js */
    'Unknown color': "未知的颜色",   /* atlas-console.js */
    'Unknown metric': "未知的指标",   /* atlas-console.js */
    'Unknown module': "未知的模组",   /* atlas-controls.js */
    'Unknown monitor operation.': "未知的监看操作。",   /* atlas-console.js */
    'Unknown ranking metric': "未知的排名指标",   /* atlas-console.js */
    'unlimited': "无限制",   /* atlas-console.js */
    'Unlimited tilt': "不限制倾角",   /* atlas-console.js */
    'unreachable': "无法到达",   /* atlas-console.js */
    'unresolved slope': "坡度未解出",   /* seismic.js */
    'Unsupported language': "不支持的语言",   /* atlas-console.js */
    'Unsupported method': "不支持的方法",   /* atlas-controls.js */
    'UP': "上",   /* flight-sim.js */
    'up to': "最多",   /* atlas-console.js */
    'Up to 4 files per message': "每则讯息最多 4 个文件",   /* atlas-console.js */
    'Up to 4 images per message': "每则讯息最多 4 张图片",   /* atlas-console.js */
    'Updated': "已更新",   /* weather.js */
    'Uploaded data': "上传的数据",   /* map-tools.js */
    'US National Weather Service, active alerts.': "美国国家气象局，生效中的警报。",   /* world-packs.js */
    'Usable for PV': "可用于太阳光电",   /* sims.js */
    'Use': "使用",   /* drone-nav.js */
    'Use current map view': "使用目前的地图画面",   /* monitors.js */
    'Use:': "使用：",   /* routing.js */
    'Using the current map view — pan/zoom before creating, or close and set a radius, draw an area or resolve a region for a tighter watch.': "使用目前的地图画面 — 建立前可先平移或缩放，或关闭后改以半径、绘制范围或指定地区来更精准地监看。",   /* monitors.js */
    'using the map’s center as the observer': "以地图中心作为观测者",   /* space.js */
    'UTC': "UTC",   /* space.js */
    'V/SPEED': "垂直速度",   /* flight-sim.js */
    'valid': "有效",   /* atlas-console.js */
    'value rejected (out of range?)': "数值遭拒（超出范围？）",   /* atlas-controls.js */
    'verified on the map': "已在地图上验证",   /* atlas-console.js */
    'Verifying': "验证中",   /* atlas-console.js */
    'Vertical rate': "垂直速率",   /* aircraft-detail.js */
    'vertically': "垂直",   /* drone-nav.js */
    'Very high': "很高",   /* widgets.js */
    'very strong': "很强",   /* analysis-panels.js seismic.js */
    'Very unhealthy': "对健康极为有害",   /* widgets.js */
    'very weak': "很弱",   /* analysis-panels.js */
    'view': "画面",   /* night-sky.js */
    'View': "检视",   /* cameras.js workspace.js */
    'View report': "检视报告",   /* monitors.js */
    'Viewing the past': "正在检视过去",   /* news-timeline.js */
    'Viewing the past · tap': "正在检视过去・点击",   /* news-timeline.js */
    'Viewpoint altitude': "视点高度",   /* atlas-console.js */
    'Viewpoint altitude in the readout': "读数中的视点高度",   /* atlas-console.js */
    'violent': "剧烈",   /* seismic.js */
    'Voice input': "语音输入",   /* atlas-console.js */
    'Volume': "体积",   /* tool-panel.js volume3d.js */
    'Volume per click (m³)': "每次点击的体积（m³）",   /* terrain-water.js */
    'vs': "对",   /* analysis-panels.js */
    'Walk': "步行",   /* atlas-console.js map-tools.js routing.js */
    'Warhead': "弹头",   /* atlas-console.js */
    'warm': "暖流",   /* ocean-currents.js */
    'Warm current — measurably warmer than the sea at the same latitude': "暖流 — 实测比同纬度的海水暖",   /* ocean-currents.js */
    'Warm current — warmer than the sea at the same latitude': "暖流 — 比同纬度的海水暖",   /* data-layers.js */
    'Warning': "警告",   /* world-packs.js */
    'Warnings': "警报",   /* world-packs.js */
    'Watch for': "注意",   /* monitors.js */
    'Watching': "监看中",   /* monitors.js */
    'water': "水",   /* sims.js */
    'Water here': "此处的水",   /* terrain-water.js */
    'Water supply': "供水",   /* world-packs.js */
    'Wave scale': "波高比例尺",   /* tsunami.js */
    'waypoints': "个航点",   /* atlas-console.js */
    'Waypoints': "航点",   /* drone-nav.js */
    'ways in the corridor': "条廊道内的路径",   /* routing.js */
    'weak': "弱",   /* analysis-panels.js atlas-console.js seismic.js */
    'weather': "天气",   /* atlas-console.js */
    'Weather': "天气",   /* monitors.js weather.js */
    'Weather (live)': "天气（实时）",   /* tool-panel.js */
    'weather (no place given)': "天气（未指定地点）",   /* atlas-console.js */
    'Weather along the way': "沿途天气",   /* routing.js */
    'Weather layers': "天气图层",   /* atlas-console.js */
    'Weather satellites': "气象卫星",   /* satellites-live.js */
    'Weather service daily limit reached — retrying after 00:00 UTC': "已达气象服务的每日上限 — 将于 UTC 00:00 后重试",   /* widgets.js */
    'Weather services unreachable': "无法连接到气象服务",   /* widgets.js */
    'Weather temporarily unavailable (both weather services could not be reached — possibly rate-limited). Try again in a few minutes.': "天气暂时无法取得（两家气象服务都连不上 — 可能受到流量限制）。请几分钟后再试。",   /* weather.js */
    'web news search': "网络新闻搜索",   /* atlas-console.js */
    'web-derived': "取自网络",   /* atlas-console.js */
    'Web-verified sources': "经网络查证的来源",   /* atlas-console.js */
    'Website': "网站",   /* atlas-console.js */
    'west': "西",   /* atlas-console.js */
    'Wet deposition': "湿沉降",   /* atlas-console.js */
    'What is happening here recently?': "这里最近发生了什么事？",   /* atlas-console.js */
    'What is important about this place?': "这个地方有什么重要之处？",   /* atlas-console.js */
    'What kind of facilities?': "要找哪一类设施？",   /* atlas-console.js */
    'What should I analyze?': "要分析什么？",   /* atlas-console.js */
    'What should I map?': "要标绘什么？",   /* atlas-console.js */
    'What should I research and map?': "要研究并标绘什么？",   /* atlas-console.js */
    'Where is the release source? Name a plant/place, or right-click a point.': "释放源在哪里？请指定一座电厂或地点，或在地图上按右键。",   /* atlas-console.js */
    'Where it is now': "目前位置",   /* satellite-detail.js */
    'Where the routes differ': "路线的差异之处",   /* routing.js */
    'Where? Give an epicenter (place, or lng/lat).': "在哪里？请提供震央（地点，或经纬度）。",   /* atlas-console.js */
    'Where? Name a place or right-click a point': "在哪里？请指定地点或在地图上按右键",   /* atlas-console.js */
    'Which area should I scan?': "要扫描哪个区域？",   /* atlas-console.js */
    'Which countries or regions?': "哪些国家或地区？",   /* atlas-console.js */
    'Which countries should I compare?': "要比较哪些国家？",   /* atlas-console.js */
    'Which object? Give its id (see the map-object list).': "哪一个对象？请提供其 id（见地图对象列表）。",   /* atlas-console.js */
    'Which one?': "哪一个？",   /* atlas-console.js */
    'Which place to outline?': "要描绘哪个地点的轮廓？",   /* atlas-console.js */
    'Whole planet · 28 km': "整颗行星・28 公里",   /* tsunami.js */
    'Whole world': "全世界",   /* atlas-console.js */
    'Why is this area the way it is?': "这个地区为什么会是这样？",   /* atlas-console.js */
    'wide look-aheads': "宽广的前视距离",   /* terrain-water.js */
    'wider than the transect': "宽于断面",   /* terrain-water.js */
    'Widgets': "小工具",   /* atlas-console.js keyboard-shortcuts.js */
    'width': "宽度",   /* terrain-water.js */
    'Width (m)': "宽度（米）",   /* terrain-water.js */
    'Wikidata could not be reached: ': "无法连接到 Wikidata：",   /* industry-web.js */
    'Wikidata n/a': "Wikidata 无数据",   /* atlas-console.js */
    'Wikidata states no ownership link between this company and another one in this industry.': "Wikidata 没有记载这家公司与本产业中其他公司之间的持股关系。",   /* industry-web.js */
    'Wikidata’s public endpoint is rate-limiting this browser — wait a moment and switch the layer on again': "Wikidata 的公开端点正在限制这个浏览器的请求频率 — 请稍候再重新开启图层",   /* industry-web.js */
    'wind': "风",   /* atlas-console.js sims.js */
    'Wind': "风",   /* aircraft-detail.js drone-nav.js weather.js */
    'WIND': "风",   /* flight-sim.js */
    'Wind comes from MET Norway, which publishes 10 m wind only — the figures above are a 10 m wind, not a wind at the flight altitude.': "风场数据来自 MET Norway，它只公布 10 米高度的风 — 上面的数字是 10 米风，不是飞行高度的风。",   /* drone-ops.js */
    'Wind: Open-Meteo (MET Norway fallback) · restricted areas and landing sites: OpenStreetMap. The area check is ADVISORY and is not an airspace clearance — check the rules that apply where you fly.': "风场：Open-Meteo（MET Norway 为备援）・限制区与降落地点：OpenStreetMap。区域检查仅供参考，不等于空域许可 — 请依你飞行所在地的规定确认。",   /* drone-nav.js */
    'Window': "窗口",   /* workspace.js */
    'winter solstice': "冬至",   /* atlas-console.js */
    'Winter solstice': "冬至",   /* sims.js */
    'Winter-solstice shade': "冬至日的遮蔽",   /* sims.js */
    'with a published revenue': "有公布营收",   /* industry-web.js */
    'Workspace': "工作区",   /* workspace.js */
    'Workspace mode is desktop-only': "工作区模式仅限桌面版",   /* atlas-console.js workspace.js */
    'Workspace mode on — News, Countries, the map, layers and Atlas are now free-floating windows': "已开启工作区模式 — 新闻、国家、地图、图层与 Atlas 现在都是可自由移动的窗口",   /* atlas-console.js */
    'World Bank annual series begin in 1960 — latest available': "世界银行年度序列自 1960 年开始 — 显示最新可得值",   /* stats-compare.js */
    'World data': "世界数据",   /* world-packs.js */
    'World War I — March 1916': "第一次世界大战 — 1916 年 3 月",   /* atlas-sims.js */
    'Writing': "撰写中",   /* atlas-console.js */
    'X axis': "X 轴",   /* analysis-panels.js */
    'Y axis': "Y 轴",   /* analysis-panels.js */
    'year': "年",   /* atlas-console.js space.js */
    'Year': "年",   /* news-timeline.js stats-compare.js */
    'years': "年",   /* space.js */
    'Years': "年",   /* stats-compare.js */
    'Yes': "是",   /* countries-ui.js */
    'You have reached your monitor limit for this plan.': "你已达到此方案的监看数量上限。",   /* monitors.js */
    'Your monitors': "你的监看",   /* atlas-console.js */
    'yr': "年",   /* atlas-console.js countries-ui.js space.js */
    'zenith': "天顶",   /* night-sky.js */
    'zonal': "东西流",   /* ocean-currents.js */
    'Zonal — no measurable temperature contrast': "东西流 — 没有可测得的温度差",   /* data-layers.js */
    'Zonal — within ±0.6 K of the sea it flows through': "东西流 — 与所流经的海水相差在 ±0.6 K 以内",   /* ocean-currents.js */
    'Zoom': "缩放",   /* app-body.js atlas-console.js */
    'Zoom in / out': "放大／缩小",   /* keyboard-shortcuts.js */
    'ρ = Spearman rank correlation, r = Pearson (log scale where the metric is log-distributed). Correlation is NOT causation — third factors (income, region) can drive both sides; the listed exception countries are good places to test any explanation.': "ρ＝斯皮尔曼等级相关，r＝皮尔森相关（指标呈对数分布时使用对数尺度）。相关不等于因果 — 第三因素（所得、地区）可能同时影响双方；列出的例外国家很适合用来检验任何解释。",   /* atlas-console.js */
    /* == (#R231) THE STRINGS THIS TABLE COULD NOT SEE ====================================
       268 hand-written `lang==='jp'?...` chains became IntMapLang.t(...) calls this round
       (scripts/lang-ternary-codemod.mjs), which is what made them visible to
       scripts/i18n-report.mjs at all - the report had been printing 100 % while these
       rendered in English. Coverage went 100 % -> 91 % the moment they could be counted,
       and these are that gap closed. WARNING: ui.zh-hans.js is REGENERATED from this file,
       never edited by hand: `node scripts/zh-hans.mjs`. */
    ' h': " 小时",
    ' left': " 剩余",
    ' min': " 分",
    ' min ': " 分 ",
    ' rev/day': " 圈／日",
    ' s': " 秒",
    ' yr': " 年",
    '(3-D fault plane)': "（三维断层面）",
    '(auto)': "（自动）",
    '(below sea)': "（海面以下）",
    '(depth)': "（深度）",
    '＋ Add point': "＋ 新增点",
    '★ Saved': "★ 已收藏",
    '🌐 Web': "🌐 网页",
    '📍 Tap the map to choose where to post': "📍 点按地图选择发文位置",
    '📖 Reader': "📖 阅读器",
    '🔒 Only <b>Pro</b> users can add their own satellite imagery services (API integrations).': "🔒 只有 <b>Pro</b> 用户才能加入自己的卫星影像服务（API 整合）。",
    '2022 UNDP': "2022 联合国开发计划署",
    '2022 World Bank': "2022 世界银行",
    '32 members': "32 个成员国",
    'A satellite where-am-I geography game — dropped somewhere on Earth, guess your location.': "卫星影像猜位置的地理游戏 — 被丟到地球上的某处，猜猜你在哪里。",
    'Active layers': "使用中的图层",
    'Active-fire data unavailable': "无法取得实时火点数据",
    'Advanced — fault geometry': "进阶 — 断层几何",
    'Aerosol / haze': "气胶／霾",
    'AI brief': "AI 摘要",
    'AIS connect failed: ': "AIS 连接失败：",
    'At real altitude': "依实际高度",
    'Average slip': "平均滑移量",
    'AWS Terrain (terrarium DEM)': "AWS Terrain（terrarium 数值高程）",
    'Back': "返回",
    'Back to automatic': "回到自动",
    'Back to news': "回到新闻",
    'Base map': "底图",
    'Bio (public)': "自我介紹（公开）",
    'Bottom depth': "海底深度",
    'Bright': "明亮",
    'Catalog': "型录",
    'Clear selection': "清除选取",
    'Click to hide': "点按以隐藏",
    'Click to highlight • right-click for criteria': "点按以标示 • 右键设置条件",
    'Click to show': "点按以显示",
    'Color relief unavailable': "无法取得彩色地势图",
    'Computing rail reach…': "正在计算铁路可达范围…",
    'Could not add the submarine-cable layer': "无法加入海底电缆图层",
    'Could not extract text — use “🌐 Web” above to open the page.': "无法撷取内文 — 请用上方的「🌐 网页」开启页面。",
    'Could not initialize contours': "无法初始化等高线",
    'Could not load 3D terrain': "无法加载 3D 地形",
    'Could not load fertility data': "无法加载生育率数据",
    'Could not load image': "无法加载图片",
    'Couldn\'t get your location': "无法取得你的位置",
    'Crop image': "裁切图片",
    'Dark': "深色",
    'Decrease': "减少",
    'Deep sea': "深海",
    'Defense (% GDP)': "国防（占 GDP %）",
    'Defense spending': "国防支出",
    'Delete this comment?': "要删除这则留言吗？",
    'Delete this post?': "要删除这篇贴文吗？",
    'Democracy Index': "民主指数",
    'Democracy Index (2023)': "民主指数（2023）",
    'Detail': "详细",
    'Detected active fire / heat source': "侦测到的火点／热源",
    'dip': "倾角",
    'Dip': "倾角",
    'Display name': "显示名称",
    'Display name cannot be empty.': "显示名称不能空白。",
    'Drag to move': "拖动以移动",
    'Earth, sky & airspace': "地球、天空与空域",
    'ECMWF weather': "ECMWF 天气",
    'Edit comment': "编辑留言",
    'EEZ = Exclusive Economic Zone (to 200 nm). Line color = boundary type (bright colors for visibility); overlaps flag disputed claims.': "EEZ＝专属经济海域（至 200 海里）。线条颜色代表界线类型（采用高辨识度的亮色）；重叠处代表有争议的主张。",
    'Elevation (color)': "高程（彩色）",
    'English': "英文",
    'Enter a number between -11000 and 9000': "请输入 -11000 到 9000 之间的数字",
    'Enter a title or some text.': "请输入标题或内文。",
    'Estimated from world news density (approximate)': "依全球新闻密度推估（概略值）",
    'EUR': "欧元",
    'Expand': "展开",
    'Fault width': "断层宽度",
    'Filter': "筛选",
    'Filter…': "筛选…",
    'Flooded (≤ today ': "淹没范围（≤ 今日 ",
    'Forecast time: ': "预报时间：",
    'GDP per capita': "人均 GDP",
    'GHRSST MUR L4 (oceans only)': "GHRSST MUR L4（仅海洋）",
    'Hazy': "有霾",
    'Heavy': "濃厚",
    'Icon': "头像",
    'Increase': "增加",
    'Joined EU': "加入欧盟",
    'Joined NATO': "加入北约",
    'Land cover & earth science': "地表覆盖与地球科学",
    'last leg': "最后一段",
    'latest available figures': "最新可得数据",
    'Leave empty to estimate it': "留空则自动推估",
    'Light': "浅色",
    'List': "列表",
    'Live weather data unavailable': "无法取得实时天气数据",
    'Loading article…': "正在加载文章…",
    'Loading page…': "正在加载页面…",
    'Loading the catalog…': "正在加载型录…",
    'Loading...': "加载中…",
    'Local segment (no open timetable, estimate)': "在地路段（无公开时刻表，为推估值）",
    'Location blocked — enable it in your browser settings.': "定位被封锁 — 请在浏览器设置中开启。",
    'Location not set.': "尚未设置位置。",
    'Location unknown': "位置不明",
    'Log in or create an account to use AI features and sync your settings, widgets, favorites and avatar across devices.': "登录或注册账号即可使用 AI 功能，并在各裝置间同步你的设置、小工具、收藏与头像。",
    'Log out': "登出",
    'Log out of your account?': "要登出账号吗？",
    'Logged out': "已登出",
    'Maritime zones': "海域划界",
    'May be incomplete or not fully working.': "可能不完整或尚未完全可用。",
    'Measured area': "量测面积",
    'Measured line': "量测线",
    'Member': "成员国",
    'MERRA-2 reanalysis, monthly — gap-free worldwide. Use the slider to pick a month.': "MERRA-2 再分析数据，逐月 — 全球无缺漏。用滑杆选择月份。",
    'Mil. spending (% GDP)': "军费（占 GDP %）",
    'Mil. spending ($B)': "军费（十亿美元）",
    'Mil. spending (2023)': "军费（2023）",
    'Move': "移动",
    'NASA FIRMS · MODIS + VIIRS (real, near-real-time)': "NASA FIRMS · MODIS + VIIRS（真实数据，近实时）",
    'NASA SEDAC GPW v4 (2020, ~1 km). Real distribution, independent of borders.': "NASA SEDAC GPW v4（2020，约 1 公里）。真实分布，与国界无关。",
    'Night lights': "夜间灯光",
    'No bio yet.': "尚未填写自我介紹。",
    'No layers are on': "没有开启任何图层",
    'None selected': "未选取",
    'Only visible from here': "仅从此处可见",
    'Open in new tab': "在新分页开启",
    'Open original': "开启原文",
    'Open-Meteo GFS (10 m wind)': "Open-Meteo GFS（10 米风）",
    'Peaks': "山峰",
    'Please choose an image file': "请选择图片档",
    'Pop. density': "人口密度",
    'Pop. density (grid)': "人口密度（网格）",
    'Post failed: ': "发文失败：",
    'Projection': "投影",
    'Publisher unknown': "来源不明",
    'Radius ': "半径 ",
    'RainViewer live radar (latest frame)': "RainViewer 实时雷达（最新影格）",
    'Read ↗': "阅读 ↗",
    'Read article': "阅读文章",
    'Reply to ': "回覆 ",
    'Report this post as inappropriate?': "要检舉这篇贴文为不当内容吗？",
    'Reported. Thank you.': "已检舉，謝謝你。",
    'Satellite Drop': "卫星空降",
    'Save profile': "保存个人数据",
    'Saved.': "已保存。",
    'Saving…': "正在保存…",
    'Sea-level': "海平面",
    'Sea-level change': "海平面变化",
    'See IntMap Pro': "了解 IntMap Pro",
    'Set': "设置",
    'Showing news in the selected area': "显示所选范围内的新闻",
    'Slider or a number (-11000–9000 m; negative = sea-level fall). Naïve "bathtub" fill from the AWS Terrain DEM — ignores tides & defenses.': "用滑杆或直接输入数字（-11000–9000 米；负值代表海平面下降）。以 AWS Terrain 数值高程做最简單的「浴缸式」淹没推算 — 未考慮潮汐与防洪设施。",
    'Snow & ice': "雪与冰",
    'Source: ': "来源：",
    'Source: MarineRegions WMS': "来源：MarineRegions WMS",
    'start → end': "起点 → 终点",
    'Style &amp; presets': "样式与默认集",
    'Submarine cable data unavailable': "无法取得海底电缆数据",
    'Summarize and analyze the situation inside the drawn area': "摘要并分析所绘范围内的情势",
    'Summing the WorldPop population grid…': "正在加总 WorldPop 人口网格…",
    'surface projection': "地表投影",
    'tap for details': "点按查看详情",
    'Tap the map to move the pin': "点按地图移动图钉",
    'Tap to highlight • long-press for criteria': "点按以标示 • 长按设置条件",
    'The satellite layer is unavailable': "卫星图层无法使用",
    'Thermal anomalies': "热异常",
    'This site blocks embedding. Try “📖 Reader” or open it in a new tab.': "这个网站禁止内嵌。请改用「📖 阅读器」或在新分页开启。",
    'Top depth': "顶部深度",
    'Total fertility rate': "总生育率",
    'Tropic of Cancer (23.4°N)': "北回归线（23.4°N）",
    'Tutorial — layer showcase': "教学 — 图层导览",
    'Type': "类型",
    'Ukraine frontline on — pan to Ukraine to see it': "已开启烏克蘭前线 — 请平移到烏克蘭查看",
    'Units': "單位",
    'Update failed: ': "更新失败：",
    'Upload image': "上传图片",
    'USD, nominal': "美元，名目值",
    'Valid time (hourly)': "有效时间（每小时）",
    'Wind 10 m': "10 米风",
    'Wind data unavailable': "无法取得风场数据",
    'You have unsaved changes. Discard them?': "你有尚未保存的变更，要捨棄吗？",
    'Your profile': "你的个人数据",
    'mmi': "mmi",
    /* == (#R231) THE STRINGS THIS TABLE COULD NOT SEE ====================================
       268 hand-written `lang==='jp'?...` chains became IntMapLang.t(...) calls this round
       (scripts/lang-ternary-codemod.mjs), which is what made them visible to
       scripts/i18n-report.mjs at all - the report had been printing 100 % while these
       rendered in English. Coverage went 100 % -> 91 % the moment they could be counted,
       and these are that gap closed. WARNING: ui.zh-hans.js is REGENERATED from this file,
       never edited by hand: `node scripts/zh-hans.mjs`. */
    ')': "）",
    'Area monitors are not available right now.': "区域监视目前无法使用。",
    'You are a geopolitical analyst. Below are news headlines reported within a single geographic area. In about three concise lines, summarize what is happening in this region from a geopolitical perspective. Begin each line with \'- \'. Stay grounded in the given headlines and avoid over-speculation.': "你是地缘政治分析師。以下是在同一个地理范围内报道的新闻标题。请以地缘政治的角度，用大约三行简潔的中文摘要这个地区正在发生的事。每一行以「- 」开头。只根据所给的标题陳述，避免过度推测。",
    'You are a satellite-imagery analyst comparing two images of the same area (first = earlier, second = later). Report: military construction/expansion, movement of ships/aircraft/vehicles, land clearing, natural disasters (floods, fires, landslides), and urban/infrastructure change. Use bullet points, each with a confidence level (high/medium/low). If nothing changed, say so, and beware false positives from clouds, image quality, or seasonal differences.': "你是卫星影像分析師，正在比对同一地区的两张影像（第一张＝较早，第二张＝较晚）。请报告：军事设施的興建与扩张，船艦、航空器、车輛等裝备的移动，土地整地与伐除，自然灾害（洪水、火灾、山崩等），以及都市与基礎设施的变化。以条列方式呈现，每一项标注信心水准（高／中／低）。若没有变化就直接说明，并注意云量、影像质量或季节差异造成的误判。",
    'The drawn outline is the fault’s surface projection. Dip, width and depth are estimated from its length and shape (Wells & Coppersmith 1994 with the magnitude eliminated); the mean slip follows from the stress drop above (Eshelby). Leave a box empty to keep it estimated.': "所绘的轮廓是断层的地表投影。倾角、宽度与深度由其长度和形状推估（Wells & Coppersmith 1994，并消去规模项）；平均滑移量则由上方的应力降导出（Eshelby）。栏位留空即维持推估值。",
    "Casualties":"人员伤亡",
    "Educational model — in a real emergency follow the official authorities.":"教育用模型——实际灾害时请遵循官方机构的指示。",
    "Load a past earthquake…":"加载过去的地震…",
    "Love wave":"洛夫波（表面波）",
    "Method & sources":"计算方法与出处",
    "Observed at the time":"当时的实测值",
    "P wave":"P波",
    "Peak intensity":"最大震度",
    "Rayleigh wave":"瑞利波（表面波）",
    "S wave":"S波",
    "Slip":"滑移量",
    "strike/dip/rake":"走向／倾角／滑移角",
    "Tsunami":"海啸",
  "out of range": "超出范围",
  "Oceanic path, surface waves (×)": "行经海洋地壳的表面波 (×)",
  "Rupture outline": "震源域轮廓",
  "segments": "段",
  "The wavefronts are the outer envelope of the fronts from every sampled point of the rupture — solved on the sphere, so a hand-drawn outline keeps its concavity instead of being replaced by its convex hull — and each sampled point uses the travel-time curve for its OWN depth on the dipping plane. Surface-wave group velocity is integrated along each great-circle path rather than held constant, so an oceanic path runs ahead of a continental one; the 3.5 / 4.4 km/s figures are the continental reference and the ratio is in the advanced settings.": "波前是震源域各采样点所发出波前的外包络线，并在球面上求解，因此手绘的凹形轮廓会被保留，而不会被其凸包取代；每个采样点都使用其在倾斜断层面上「自身深度」所对应的走时曲线。表面波的群速度是沿各大圆路径积分而得，而非固定值，因此行经海洋地壳的路径会领先大陆地壳的路径；3.5 / 4.4 km/s 为大陆地壳的参考值，其比值可在进阶设置中调整。",
  "Place the hypocenter": "设置震央",
  "Tap inside the rupture area to place the hypocenter.": "请点击震源域内部以设置震央。",
  "That point is outside the rupture area — the rupture starts on the plane it happened on.": "该地点位于震源域之外——破裂是从其发生的断层面上开始的。",
  "This is where the rupture starts, so it sets the direction it runs in.": "这里是破裂的起点，因此决定了破裂传播的方向。",
  "Past earthquakes": "过去的地震",
  "Recent earthquakes": "最近的地震",
  "No list yet — press to load": "尚无列表——请按此加载",
  "Loading the recent earthquakes…": "正在加载最近的地震…",
  " events": " 件事件",
  "✓ Copied": "✓ 已复制",
  "📍 Places": "📍 地点",
  "🗓 Events": "🗓 事件",
  "Anonymous": "匿名",
  "Build the source": "建立震源",
  "Cargo": "货船",
  "Click on the map to place a location.": "请在地图上点击以指定位置。",
  "close legend: ": "关闭图例：",
  "close: ": "关闭：",
  "Could not load: ": "无法加载：",
  "Course": "航迹向 (COG)",
  "Data: ": "数据：",
  "date: ": "日期：",
  "Destination": "目的地",
  "Developer account — unlimited AI usage.": "开发者账号 — AI 使用不受限制。",
  "Draught": "吃水",
  "favorite: ": "我的最愛：",
  "Fishing": "漁船",
  "Geo alt": "高度 (GPS)",
  "Heading": "船首向",
  "High-speed craft": "高速船",
  "Latest frame (live)": "最新影格（实时）",
  "Law enforcement": "执法船",
  "level": "平飞",
  "Load an earthquake": "加载地震",
  "Log in to post, comment and vote.": "请登录以发表、留言与投票。",
  "Month: ": "月份：",
  "Move pin on map": "在地图上移动图钉",
  "No boundary available for this place": "找不到这个地点的范围",
  "on ground": "在地面",
  "Only posts in the current map view": "仅显示目前地图范围内的贴文",
  "opacity: ": "不透明度：",
  "Other": "其他",
  "Parameters": "参数",
  "Passenger": "客船",
  "Pilot": "领航船",
  "Pleasure craft": "游艇",
  "Reg.": "注册编号",
  "Report": "检舉",
  "Run and playback": "计算与播放",
  "Sailing": "帆船",
  "sea level rise (m)": "海平面上升 (m)",
  "Simulated placeholder (live feed unavailable)": "模拟示范数据（实时数据无法取得）",
  "Status": "状态",
  "Tanker": "油轮",
  "Tug": "拖船",
  "Upvote": "有帮助",
  "Vert. rate": "垂直速率",
  "Legends and tool windows will appear here instead of over the map.": "图例与工具窗口会显示在这里，而不是盖在地图上。",
  "Finish": "完成",
  "Redraw": "重新绘制",
  "Draw": "绘制",
  "Not set — optional, a point source works too": "未设置（可省略，点震源亦可）",
  "Not set": "未设置",
  "Add": "新增",
  "places": "个地点",
  "Nearby cities only": "仅邻近城市",
  "Rupture area": "震源域",
  "Hypocenter": "震央",
  "If one is already placed, tapping moves it.": "若已放置，点按即可移动。",
  "Observation points": "观测地点",
  "Each point is added to the table below.": "每个地点都会加入下方表格。",
  "A wavefront from a finite rupture is still a circle about the hypocenter whenever the rupture runs slower than the wave — the first arrival always comes from the point where the break started — so the shape you drew appears as the RUPTURE FRONT running across it (the filled area and its bright edge), not as a dent in the rings. What does bend the rings is the crust they cross: the body-wave travel time is corrected over its crustal share and the surface-wave group velocity is integrated along each great circle, so an oceanic path runs ahead of a continental one.": "只要破裂的传播速度慢于波速，有限震源的初动波面仍是以震央为中心的圆——最早抵达的永远是破裂起点发出的波。因此您所画的形状会以「破裂前缘」的方式出现（填色区域与其明亮的边缘），而不是让波环凹陷。真正让波环变形的是它们所穿越的地壳：实体波的走时会依其地壳路径比例修正，表面波的群速度则沿各大圆路径积分，因此海洋路径会领先大陆路径。",
  "Add observation points": "新增观测地点",
  "Every point you tap is added to the table.": "每点击一处，都会加入下方表格。",
  "Tap each corner on the map, then press Done.": "在地图上依序点击各个角，然后按「完成」。",
  "Tap inside the rupture area — this is where the rupture starts.": "请点击震源域内侧——这里就是破裂的起点。",
  "Tap the map. Tapping again moves it.": "点一下地图即可放置；再点一下会移到新位置。",
  "Intensity": "震度分布",
  "Tap the map to place the hypocenter. Drawing a rupture area first is optional.": "点一下地图放置震源。先绘制震源域为选用步驟。",
  "Press to solve the intensity field for this source.": "按下即可计算此震源的震度分布。",
  "Done — press ▶ above to watch the waves, or change anything and recompute.": "已完成 — 按上方的 ▶ 播放波动，或修改条件后重新计算。",
  "Active volcanoes": "活火山",
  "Air-defense zones (ADIZ ≈)": "防空识别区 (ADIZ ≈)",
  "Annual precipitation": "年降水量",
  "Anomaly vs climatology (ENSO signal)": "相对气候平均的距平（ENSO 讯号）",
  "Assassination": "暗殺",
  "ASTER global DEM color + shaded relief (static)": "ASTER 全球高程模型彩色分层＋阴影起伏（静态）",
  "Aurora forecast (NOAA)": "极光预报（NOAA）",
  "Brightness temp (thermal IR)": "亮温（热红外）",
  "CAPE instability (ECMWF)": "CAPE 不稳定度（ECMWF）",
  "Carbon monoxide (CO)": "一氧化碳 (CO)",
  "Chlorophyll-a (ocean color)": "葉绿素a（海色）",
  "Clear sky": "晴朗",
  "Cloud cover (ECMWF)": "云量（ECMWF）",
  "Cloud fraction (day)": "云量比例（日间）",
  "Cloud-top temperature": "云顶温度",
  "Clouds (infrared)": "云（红外）",
  "CO₂ per capita": "人均二氧化碳",
  "CO₂ per capita (t)": "人均二氧化碳（噸）",
  "Color relief (ASTER GDEM)": "彩色地势图（ASTER GDEM）",
  "Contour lines": "等高线",
  "Corruption indicator": "貪腐指标",
  "Current account (% GDP)": "经常帐（占GDP）",
  "Daily satellite (true color)": "每日卫星影像（真实色彩）",
  "Data centers & AI infra": "数据中心与AI基礎设施",
  "Day / night": "日／夜",
  "dense": "密集",
  "Dew point / humidity (ECMWF)": "露点／湿度（ECMWF）",
  "Disaster": "灾害",
  "Drizzle": "毛毛雨",
  "dry": "干燥",
  "Ecoregions (WWF/RESOLVE)": "生态区（WWF/RESOLVE）",
  "Education spending (% GDP)": "教育支出（占GDP）",
  "Elevation relief (hillshade)": "阴影起伏",
  "Enhanced monitoring": "加强监测",
  "Exclusion — permanent resettlement": "禁止进入区——永久遷离",
  "Exports (% GDP)": "出口（占GDP）",
  "FDI inflows (% GDP)": "外资流入（占GDP）",
  "Fertility rate": "总生育率",
  "Fog": "雾",
  "Forest area": "森林面积",
  "Freezing rain": "凍雨",
  "GDP (nominal)": "GDP（名目）",
  "GDP (PPP)": "GDP（购买力平价）",
  "GDP (US$)": "GDP（美元）",
  "GDP growth": "GDP 成长率",
  "GDP per capita (PPP)": "人均GDP（购买力平价）",
  "Geopolitics": "地缘政治",
  "GHRSST MUR sea-ice concentration": "GHRSST MUR 海冰密集度",
  "Globe tour (slow spin)": "地球导览（缓慢自转）",
  "Govt debt (% GDP)": "政府債务（占GDP）",
  "HDI": "人类发展指数",
  "Health spending (% GDP)": "医疗支出（占GDP）",
  "Heavy drizzle": "强毛毛雨",
  "Heavy rain": "大雨",
  "Heavy showers": "强阵雨",
  "Heavy snow": "大雪",
  "high": "高",
  "Homicide rate (/100k)": "兇殺率（每10萬人）",
  "humid": "潮湿",
  "Inflation (CPI)": "通膨（CPI）",
  "Internet penetration": "网络普及率",
  "Internet users": "网络用户",
  "Internet users %": "网络使用率 %",
  "Isobars (ECMWF)": "等压线（ECMWF）",
  "Land cover (ESA 2021)": "土地覆盖（ESA 2021）",
  "Land surface temp (day)": "地表温度（日间）",
  "Land surface temp (night)": "地表温度（夜间）",
  "Life expectancy": "平均寿命",
  "Light drizzle": "弱毛毛雨",
  "Light rain": "小雨",
  "Light showers": "弱阵雨",
  "Light snow": "小雪",
  "Live aircraft traffic": "实时航班",
  "Live satellites": "实时卫星",
  "Live ship traffic": "实时船舶",
  "low": "低",
  "Mainly clear": "大致晴朗",
  "Major dams": "主要水坝",
  "Mandatory evacuation": "强制撤离",
  "Mid-tropospheric CO — wildfire smoke, combustion & air pollution (AIRS)": "对流层中层一氧化碳——野火烟雾、燃烧与空气污染（AIRS）",
  "Military (% GDP)": "国防支出（占GDP）",
  "Military spending": "国防支出",
  "Military spending ($)": "国防支出（美元）",
  "MODIS atmospheric water vapor": "MODIS 大气可降水量",
  "MODIS band-31 thermal-IR brightness temperature": "MODIS 第31波段热红外亮温",
  "MODIS cloud fraction, daytime": "MODIS 云量比例（日间）",
  "MODIS cloud-top temperature; colder = taller storm clouds": "MODIS 云顶温度；越冷代表对流云发展越高",
  "MODIS land-surface temperature, daytime": "MODIS 地表温度（日间）",
  "MODIS land-surface temperature, nighttime": "MODIS 地表温度（夜间）",
  "MODIS Terra daily true-color mosaic": "MODIS Terra 每日真实色彩合成",
  "MODIS vegetation index (8-day)": "MODIS 植生指数（8日合成）",
  "NATO members": "北约成员国",
  "Ocean temperature (ECMWF)": "海水温度（ECMWF）",
  "Ocean-surface chlorophyll-a — phytoplankton / marine productivity (VIIRS)": "海洋表层葉绿素a——浮游植物／海洋生产力（VIIRS）",
  "OMPS UV-absorbing aerosols — smoke, dust, volcanic ash": "OMPS 紫外线吸收性气胶——烟塵、沙塵、火山灰",
  "Overcast": "阴天",
  "Partly cloudy": "局部多云",
  "Pharma manufacturing hubs": "制藥生产基地",
  "Population": "人口",
  "Precipitation (ECMWF)": "降水量（ECMWF）",
  "Precipitation (IMERG)": "降水量（IMERG）",
  "R&D (% GDP)": "研发支出（占GDP）",
  "Rain": "雨",
  "Relocation right / monitoring": "遷居权／监测区",
  "Renewable energy": "再生能源",
  "Revolution": "革命・政变",
  "Rime fog": "雾淞",
  "Sea ice (Arctic/Antarctic)": "海冰（北极／南极）",
  "Sea-ice concentration": "海冰密集度",
  "Sea-level pressure (ECMWF)": "海平面气压（ECMWF）",
  "Sea-surface temp anomaly": "海表温度距平",
  "Showers": "阵雨",
  "Snow": "雪",
  "Snow grains": "米雪",
  "Snow showers": "阵雪",
  "Soil moisture": "土壤水分",
  "Space & science": "太空与科学",
  "sparse": "稀疏",
  "Submarine cables": "海底电缆",
  "Surface soil moisture — drought & agriculture (AMSR2)": "表层土壤水分——干旱与农业指标（AMSR2）",
  "Tectonic plates": "板块边界",
  "Temperature 2 m (ECMWF)": "气温 2m（ECMWF）",
  "Thunderstorm": "雷雨",
  "Thunderstorm, hail": "伴随冰雹的雷雨",
  "Trace deposition": "微量沉降",
  "Unemployment": "失业",
  "Unemployment rate": "失业率",
  "Urban population": "都市人口比例",
  "UV Aerosol Index": "紫外线气胶指数",
  "Vegetation index (NDVI)": "植生指数 (NDVI)",
  "War": "战争",
  "Water vapor": "水气",
  "wet": "湿潤",
  "Wind 10 m arrows (ECMWF)": "10米风向风标（ECMWF）",
  "World railways (by gauge)": "世界铁路（依轨距）",
  "All goods": "所有品项",
  "Animal products": "动物产品",
  "Arms": "武器",
  "Banana": "香蕉",
  "Barley": "大麦",
  "Cassava": "木薯",
  "Cereals": "穀物（合计）",
  "Chemicals": "化学工业产品",
  "Citrus": "柑橘",
  "Cotton": "棉花",
  "Energy mix (electricity / primary)": "能源结构（电力／一次能源）",
  "Fodder crops": "飼料作物",
  "Foodstuffs": "调制食品",
  "Fruits and nuts": "水果与坚果",
  "Groundnut": "花生",
  "Harvested area": "收穫面积",
  "Instruments": "光学与精密仪器",
  "Irrigated": "灌溉",
  "Machines": "机械",
  "Main crops": "主要作物（合计）",
  "Maize": "玉米",
  "Metals": "金属",
  "Millet": "小米",
  "Mineral products": "礦产品",
  "Oil palm": "油棕",
  "Oil seeds": "油籽（合计）",
  "Olive": "橄欖",
  "Other cereals": "其他穀类",
  "Plastics & rubber": "塑胶与橡胶",
  "Potato and sweet potato": "马鈴薯与甘藷",
  "Precious metals": "貴金属",
  "Production": "产量",
  "Pulses": "豆类",
  "Rainfed": "雨養",
  "Rapeseed": "油菜籽",
  "Root crops": "根莖作物（合计）",
  "Sorghum": "高粱",
  "Soybean": "大豆",
  "Stimulants": "嗜好作物（咖啡・茶・可可）",
  "Sugarbeet": "甜菜",
  "Sugarcane": "甘蔗",
  "Sunflower": "向日葵",
  "Textiles": "紡織品",
  "Tobacco": "菸草",
  "Total": "合计",
  "Transportation": "运输设备",
  "Vegetable products": "植物产品",
  "Vegetables": "蔬菜",
  "Weather & disaster warnings": "气象与灾害警报",
  "Wetland rice": "水稻",
  "Wheat": "小麦",
  "Yams and other roots": "山藥与其他根莖作物",
  "Yield": "單位产量",
  "Advanced settings": "进阶设置",
  "Clear the loaded earthquake": "清除已加载的地震",
  "Depth": "深度",
  "Fault geometry": "断层形状",
  "Magnitude": "规模",
  "Model assumptions": "模型假设",
  "Play": "播放",
  "Playback speed": "播放速度",
  "Rupture size": "震源域大小",
  "Seismic wave simulator": "地震波模拟器",
  "Strike / dip / rake": "走向／倾角／滑移角",
  "Time since the rupture began": "自破裂开始经过的时间",
  "When": "发生时间",
  "Time-series — ": "时间序列 — ",
  "Source: World Bank Open Data": "来源：世界银行公开数据",
  "No data available": "没有可用的数据",
  " Do NOT open with a heading or bold line that merely repeats the place name — it is already on screen above your reply. Start straight with the content.": " 不要以只是重复地名的标题或粗体行开头——它已显示在你的回覆上方。请直接从内容开始。",
  "Recent nearby news headlines — reflect these in \"Recent developments\":\n": "附近的近期新闻标题——请反映在「近期动态」中：\n",
  "Context — recent nearby headlines:\n": "脈络——附近的近期标题：\n",
  "Conversation so far:\n": "目前为止的对话：\n",
  "Quiz mode": "测验模式",
  "Score ": "得分 ",
  "streak ": "连续 ",
  "Flag quiz (flag → country)": "国旗测验（国旗→国家）",
  "Capital quiz (capital → country)": "首都测验（首都→国家）",
  "Capital quiz (country → capital)": "首都测验（国家→首都）",
  "Map quiz (click the country)": "地图测验（点击国家）",
  "Silhouette quiz (shape → country)": "轮廓测验（形状→国家）",
  "Population duel (which is bigger?)": "人口对决（哪个较多？）",
  "Area duel (which is larger?)": "面积对决（哪个较大？）",
  "Each answer shows a learning card about the country.": "每次作答都会显示该国的学習卡片。",
  "Capital": "首都",
  "Pop": "人口",
  "Country data is still loading — try again in a moment.": "国家数据仍在加载中，请稍后再试。",
  "Click on the map:": "在地图上点击：",
  "Click that country on the map…": "在地图上点击那个国家…",
  "Skip": "略过",
  "👥 Which has the larger population?": "👥 哪一个人口较多？",
  "📐 Which is larger by area?": "📐 哪一个面积较大？",
  "Next →": "下一题 →",
  "Which country is this flag?": "这是哪一国的国旗？",
  "Which country is this shape?": "这是哪一国的形状？",
  "What is this country’s capital?": "这个国家的首都是？",
  "Which country has this capital?": "这是哪一国的首都？",
  "You picked: ": "你的答案：",
  "Click on a country": "请点击陆地（国家）",
  "You clicked: ": "你点击的国家：",
  "Playground": "游乐场",
  "Loading weather…": "加载天气中…",
  "Loading FX…": "加载汇率中…",
  "Clock": "时钟",
  "FX": "汇率",
  "wind ": "风 ",
  "Weather unavailable": "无法取得天气",
  "FX unavailable": "无法取得汇率",
  "fatalities ": "死亡人数 ",
  "Enter your email + API key (free registration at acleddata.com).": "请输入电子郵件与 API 金钥（于 acleddata.com 免费注册）。",
  "Error: ": "错误：",
  "Nothing returned — check the key, email and your API quota.": "没有取得数据——请检查金钥、电子郵件与 API 用量。",
  "†": "†",
  "Conflict events (ACLED)": "冲突事件（ACLED）",
  "Load last 14 days": "加载最近 14 天",
  "Armed Conflict Location & Event Data. Needs the free-registration email + API key.": "Armed Conflict Location & Event Data。需要免费注册的电子郵件与 API 金钥。",
  "As of: ": "更新：",
  "Could not load — toggle again later.": "无法加载——请稍后再开启一次。",
  "Russian-occupied": "俄罗斯占领区",
  "Crimea / Donbas (pre-2022)": "克里米亚／頓巴斯（2022 年前）",
  "Liberated": "已解放地区",
  "Unknown status": "状态不明",
  "Other claimed area": "其他主张地区",
  "Shows from zoom 14. Tilt (3D button / right-drag) to see depth.": "缩放 14 以上显示。用 3D 按钮或右键拖动倾斜即可看见立体感。",
  "Source: historical-basemaps (boundaries approximate)": "来源：historical-basemaps（边界为概略）",
  "Could not load.": "无法加载。",
  "No dated eruption": "无确定年代的噴发",
  " last eruption": " 年最后噴发",
  "Could not load volcano data": "无法加载火山数据",
  "Erupted since 1950": "1950 年以后噴发",
  "Erupted since 1500": "1500 年以后噴发",
  "Older / undated": "更早／无纪录",
  "Köppen climate": "柯本气候分类",
  "Ecoregions": "生态地区",
  "Hillshade": "阴影起伏",
  "Night lights (satellite)": "夜间灯光（卫星）",
  "Snow cover": "积雪",
  "Aerosol (AOD)": "气溶胶（AOD）",
  "Sea-surface temp": "海面温度",
  "Air temperature (monthly)": "气温（月平均）",
  "Precipitation": "降水量",
  "Population grid": "人口网格",
  "Ukraine frontline": "烏克蘭前线",
  "Volcanoes": "火山",
  "Aurora forecast": "极光预报",
  "Earthquakes (USGS)": "地震（USGS）",
  "Population density": "人口密度",
  "Military spending ($B)": "国防支出（十亿美元）",
  "Military spending (%GDP)": "国防支出（占 GDP %）",
  "Historical borders": "历史国界",
  "Railways (by gauge)": "铁路（依轨距）",
  "Data centers / cloud": "数据中心／云端",
  "Pharma & health": "制藥与医疗",
  "Sat": "卫星",
  "Two-way view sync": "双向视角同步",
  "Sync": "同步",
  "Independent of the main map": "与主地图独立",
  "Free": "独立",
  "Pixel-registered lens over the main map": "与主地图像素对齐的透视镜",
  "X-ray": "X 光",
  "Compare layer": "比较图层",
  "Select a layer…": "选择图层…",
  "Open compare view": "开启比较检视",
  "Language data not found — add data/asher_languages.geojson": "找不到语言数据——请加入 data/asher_languages.geojson",
  "Family: ": "语系：",
  "Intelligence (advanced)": "情报分析（进阶）",
  "Disputed boundaries": "争议边界",
  "Air-defense coverage": "防空涵盖范围",
  "World languages": "世界语言分布",
  "Send feedback": "传送意见",
  "Rate IntMap and tell us what to improve.": "为 IntMap 评分，并告诉我们可以改进什么。",
  "For bugs, the <b>Bug Reporter</b> auto-attaches diagnostics.": "回报错误时，<b>错误回报</b>会自动附上診断信息。",
  "Open it →": "开启 →",
  "Rating": "评分",
  "Comments (optional)": "意见（选填）",
  "Email (optional)": "电子郵件（选填）",
  "Submit": "送出",
  "Please pick a star rating.": "请选择星级评分。",
  "Sending…": "传送中…",
  "Could not send — please try again later.": "无法传送——请稍后再试。",
  "Thank you for your feedback": "感謝您的意见",
  "We read every note and use it to improve IntMap.": "我们会阅读每一则意见，并用于改进 IntMap。",
  "Thank you!": "謝謝您！",
  "Your high rating means a lot. If you enjoy IntMap, you can support its development — entirely optional.": "您的高度评价对我们意义重大。若您喜欢 IntMap，欢迎支持开发——完全出于自愿。",
  "Support IntMap": "支持 IntMap",
  "Maybe later": "下次再说",
  "Report a bug": "回报错误",
  "Describe what went wrong — steps to reproduce help a lot.": "请描述发生了什么问题——重现步驟会很有帮助。",
  "e.g. On mobile, tapping X causes Y…": "例：在手机上点击 X 会发生 Y…",
  "Diagnostics attached": "附加的診断信息",
  "Submit report": "送出回报",
  "Copy report to clipboard": "复制回报内容到剪贴簿",
  "Copied.": "已复制。",
  "Could not copy.": "无法复制。",
  "Please describe the bug.": "请描述错误内容。",
  "Report sent": "已送出回报",
  "Report saved": "已保存回报",
  "Thank you — we will look into it.": "感謝回报——我们会查看处理。",
  "Saved on this device and copied to your clipboard (offline).": "已离线保存在此裝置并复制到剪贴簿。",
  "Aurora forecast unavailable": "无法取得极光预报",
  "(unnamed)": "（无名称）",
  "Could not load plate data": "无法取得板块数据",
  "Could not load ecoregions": "无法加载生态地区数据",
  "Biome: ": "生物群系：",
  "Could not load railway data": "无法加载铁路数据",
  "AI superclusters": "AI 超级叢集",
  "Major pharma HQ / manufacturing clusters (representative sites). Pairs with the Life-expectancy layer.": "主要制藥企业总部与制造聚落（代表地点）。可与平均寿命图层搭配。",
  "Classified by each country’s predominant gauge (Natural Earth 10m)": "依各国主要轨距分类（Natural Earth 10m）",
  "World Bank WGI “Control of Corruption” score (0–100, higher = cleaner) — the open-API counterpart of TI’s CPI.": "世界银行 WGI「貪腐控制」分数（0–100，愈高愈清廉）——相当于 TI 貪腐印象指数的开放 API 指标。",
  "Life expectancy at birth (World Bank, 2022).": "出生时平均余命（世界银行，2022）。",
  "Unemployment, total (% of labor force; modeled ILO / World Bank, latest year).": "失业率（占勞动力 %；ILO 推估／世界银行，最新年度）。",
  "Individuals using the Internet (% of population; World Bank, latest year).": "使用互联网人口比例（占人口 %；世界银行，最新年度）。",
  "Average annual precipitation (depth in mm, long-term; World Bank).": "年平均降水量（深度 mm，长期平均；世界银行）。",
  "Could not load the data": "无法取得数据",
  " yrs": " 年",
  "Annotation ": "注记 ",
  "Code": "代码",
  "Municipality": "所在地",
  "Civil": "民用",
  "Longest runway": "最长跑道",
  "Runways": "跑道数",
  "Runway": "跑道",
  "Coords": "坐标",
  "Read on Wikipedia ↗": "在维基百科阅读 ↗",
  "Could not load data": "无法取得数据",
  "No matches": "无符合项目",
  "Runway search": "跑道搜索",
  "Metric (km/m)": "公制 (km/m)",
  "Imperial (mi/ft)": "英制 (mi/ft)",
  "By airport": "以机场为單位",
  "By runway": "以跑道为單位",
  "Search (loads data 1st run)": "搜索（第一次会加载数据）",
  "Radius (mi)": "半径 (mi)",
  "Radius (km)": "半径 (km)",
  "Min length (ft)": "最小长度 (ft)",
  "Min length (m)": "最小长度 (m)",
  "Area (loops)": "面积（封闭区域）",
  "Points (simpl/raw)": "点数（简化／原始）",
  "Resolution (smoothing)": "分辨率（平滑化）",
  "Kept on the map": "已保留在地图上",
  "Country border not found": "找不到国界数据",
  "Exit country view": "回到整体检视",
  "Straight-line (shortest): ": "直线距离（最短）：",
  "Computing sea route…": "计算航路中…",
  "Country data still loading — try again.": "国界数据仍在加载，请再试一次。",
  "No sea cell found near a point (is it on land?).": "找不到附近的海上格点（可能位于陆地）。",
  "No sea route found (blocked or unreachable).": "找不到航路（受阻或无法到达）。",
  "Sea route: ": "航路距离：",
  " pts": " 点",
  "End": "终点",
  "Pure shortest distance (ignore land)": "纯粹最短距离（忽略陆地）",
  "Click map to add a no-go zone": "点击地图以加入禁行区",
  "Compute route": "计算路线",
  "Pick two sea points (right-click → set start/end), then Compute.": "选择两个海上点（右键→设为起点／终点），然后按计算。",
  "No-go added (120 km circle). Press Compute route.": "已加入禁行区（120 公里圆）。请按「计算路线」。",
  "Save current layers as preset": "将目前图层存成默认组合",
  "Preset name:": "默认组合名称：",
  "Preset applied": "已应用默认组合",
  "Failed to add layer": "无法加入图层",
  "GeoJSON added: ": "已加入 GeoJSON：",
  "Could not parse JSON": "无法解析 JSON",
  "Not valid GeoJSON": "不是有效的 GeoJSON",
  "AUTO": "自动播放",
  "Intro demo:": "初次导览：",
  "End the intro demo": "结束导览",
  "End tour": "结束",
  "Experimental interactive modes built on real data.": "以真实数据打造的实验性互动模式。",
  "A full 6-DOF flight model — pick an aircraft and airport, then take off and land over the real 3-D terrain.": "完整六自由度飞行模型——选择机型与机场，在真实 3-D 地形上起降。",
  "Pandemic Simulator": "疫情模拟器",
  "Seed an outbreak and watch a scientific model spread it across real countries until a vaccine arrives.": "设置感染源，看科学模型如何在真实国家间传播，直到疫苗问世。",
  "Test your world geography: flags, capitals, map-clicks, silhouettes & duels.": "测试你的世界地理：国旗、首都、地图点击、轮廓与对决。",
  "Breaking": "快讯",
  "Country data unavailable": "无法加载国界数据",
  "Could not pick a spot": "无法选出地点",
  "Dropping you somewhere…": "正在把你送到某处…",
  "Where are you?": "这里是哪里？",
  "Back to start": "回到起点",
  "Make a guess": "作答",
  "Click the map to drop your guess": "点击地图标出你的猜测",
  "The less you zoom out, the higher your score (min zoom is penalised).": "缩小得愈少分数愈高（最小缩放会扣分）。",
  "Answer": "解答",
  "Distance: ": "距离：",
  "Actual: ": "正解：",
  "Base ": "基本分 ",
  "Zoom-out −": "缩小扣分 −",
  "min zoom ": "最小缩放 ",
  "no zoom-out!": "没有缩小！",
  "Play again": "再玩一次",
  "Outbreak has reached 10 countries.": "疫情已扩散至 10 个国家。",
  "WHO declares a global health emergency (PHEIC).": "WHO 宣布「国际关注的突发公共卫生事件」（PHEIC）。",
  "An effective treatment is found — fatality rate falls.": "找到有效疗法——致死率下降。",
  "Global death toll passes 1 million.": "全球死亡人数突破 100 萬。",
  "Global death toll passes 10 million.": "全球死亡人数突破 1000 萬。",
  "a minor outbreak": "小规模流行后结束",
  "the outbreak has ended": "疫情已结束",
  "a devastating pandemic, now over": "毁滅性大流行后结束",
  "Infected": "感染",
  "Dead": "死亡",
  "Recovered": "康复",
  "Vaccinated": "接种",
  "Day": "天数",
  "variants": "变异株",
  "vaccine R&D": "疫苗研发",
  "Outbreak setup": "疫情设置",
  "Infectivity R₀": "基本再生数 R₀",
  "Lethality %": "致死率（IFR）%",
  "Incubation (d)": "潛伏期（天）",
  "Infectious (d)": "传染期（天）",
  "Immunity (mo)": "免疫（月）",
  "▶ Tap a country on the map to place patient zero": "▶ 在地图上点击作为感染源的国家",
  "New outbreak": "重新开始",
  "⏸ Pause": "⏸ 暂停",
  "▶ Play": "▶ 播放",
  "Patient zero confirmed in ": "首例确診于 ",
  "No data right now — please try again in a moment.": "目前无法取得数据，请稍后再试。",
  "Source: World Bank · ": "来源：世界银行 · ",
  " · most recent value per country": "（各国最新值）",
  " + IMF WEO general govt gross debt (gap-fill)": " ＋ IMF WEO（一般政府总債务）补齐",
  "24h": "24 小时",
  "7d": "7 天",
  "30d M4.5+": "30 天 M4.5+",
  "1yr M6+": "1 年 M6+",
  "Could not load earthquake data": "无法取得地震数据",
  "Could not load ECMWF weather": "无法加载 ECMWF 数据",
  "ECMWF valid: ": "ECMWF 有效时间：",
  "latest": "最新",
  "Open-Meteo ECMWF IFS (hourly)": "Open-Meteo ECMWF IFS（每小时）",
  "Time & date": "现在时间与日期",
  "Analog clock": "类比时钟",
  "An analog clock face": "类比錶面",
  "Weather at your location (asks for location permission when added)": "目前位置的天气（新增时会要求位置权限）",
  "FX rate": "汇率",
  "Pick any currency pair": "选择任意货币对",
  "Crypto (BTC·ETH)": "加密资产（BTC·ETH）",
  "Price & 24h change": "价格与 24 小时变动",
  "Crypto market cap": "加密资产市值",
  "Total cap & BTC dominance": "总市值与 BTC 主导率",
  "Fear & Greed": "恐懼与貪婪指数",
  "Crypto market sentiment index": "加密市场情绪指数",
  "Gold spot (USD/oz)": "黄金现货价（USD/oz）",
  "Silver spot (USD/oz)": "白银现货价（USD/oz）",
  "Top-3 magnitude, last 24 h (USGS)": "近 24 小时规模前三（USGS）",
  "On this day": "历史上的今天",
  "A historical event from this date": "这一天的历史事件",
  "Featured layer": "推薦图层",
  "Random pick — tap to show it": "随机推薦，点击即显示",
  "Random country": "随机国家",
  "Flag & key facts": "国旗与基本数据",
  "Countdown": "倒数计时",
  "Set a date & title": "设置日期与标题",
  "Sunrise & sunset": "日出与日落",
  "At your location (if allowed) or map center": "目前位置（若允许）或地图中心",
  "Moon phase": "月相",
  "Tonight’s phase & illumination": "今晚的月相与亮度",
  "Air quality (AQI)": "空气质量（AQI）",
  "US AQI & PM2.5": "US AQI 与 PM2.5",
  "ISS tracker": "国际太空站追踪",
  "Live ISS position — tap to fly there": "ISS 实时位置，点击即可飞往",
  "World clock": "世界时钟",
  "Pick a city / timezone": "选择城市／时区",
  "Year progress": "今年进度",
  "How far through the year we are": "今年已过多少",
  "Featured article": "今日精选条目",
  "Wikipedia’s article of the day": "维基百科今日精选条目",
  "World population": "世界人口时钟",
  "Live estimate (UN-based)": "以联合国推估为基礎的实时估计",
  "UV index": "紫外线指数",
  "UV index at your location": "目前位置的紫外线指数",
  "Aurora (Kp)": "地磁与极光（Kp）",
  "Geomagnetic activity (NOAA SWPC)": "地磁活动（NOAA SWPC）",
  "Top technology story": "科技热门文章",
  "Next holiday": "下一个假日",
  "Next public holiday (pick a country)": "指定国家的下一个国定假日",
  "Next rocket launch": "下一次火箭发射",
  "The next spaceflight launch": "全球下一次发射预定",
  "Bitcoin network": "比特币网络",
  "Block height & fees": "区块高度与手续费",
  "Day progress": "今日进度",
  "How far through today we are": "今天已过多少",
  "Season": "季节",
  "Current season (hemisphere-aware)": "目前季节（依半球）",
  "Week number": "周次",
  "ISO week, day-of-year & days left": "ISO 周次、年中日数与剩余天数",
  "Unix time": "Unix 时间",
  "Live Unix timestamp": "目前的 Unix 时间戳",
  "Map center": "地图中心",
  "Center coordinates & zoom": "显示中心的坐标与缩放",
  "Next full moon": "下一次满月",
  "Days until the next full moon": "距离下次满月的天数",
  "Configure": "设置",
  "Edit": "编辑",
  "Add widget": "新增小工具",
  "Add a widget…": "要新增的小工具…",
  "Available widgets": "可新增的小工具",
  "as of ": "更新于 ",
  "Title (e.g. Olympics opening)": "标题（例：奥运开幕）",
  "World clock ": "世界时钟 ",
  "live estimate, UN-based": "以联合国推估为基礎的实时估计",
  "Southern Hemisphere": "南半球",
  "Northern Hemisphere": "北半球",
  "seconds since 1970-01-01 UTC": "自 1970-01-01 UTC 起的秒数",
  "zoom ": "缩放 ",
  "Tonight!": "就在今晚！",
  "until the next full moon": "距离下次满月",
  "until the next new moon": "距离下次新月",
  "lat ": "纬度 ",
  "daylight": "日照",
  "100-px bar ≈ ": "100 像素长条 ≈ ",
  "Location needed": "需要位置信息",
  "Allow location": "允许位置存取",
  "Locating…": "取得位置中…",
  "FX ": "汇率 ",
  "daylight ": "白昼长度 ",
  "age ": "月龄 ",
  "lit": "亮度",
  "Fly there →": "在地图上检视 →",
  "dominance": "主导率",
  "None ≥ M2.5 (24 h)": "无 M2.5 以上（24 小时）",
  "Tap for another": "点击看另一则",
  "Tap to show on the map →": "点击以显示在地图上 →",
  "Layer on: ": "已显示图层：",
  "loading country data": "加载国家数据中",
  "Fly to this country": "前往这个国家",
  "Pop ": "人口 ",
  "Another ↻": "换一个 ↻",
  "Set date & title via ⚙": "透过 ⚙ 设置日期与标题",
  "<span style=\"font-size:20px;\">Today! 🎉</span>": "<span style=\"font-size:20px;\">就是今天！🎉</span>",
  "Storm — aurora likely": "地磁暴——可能出现极光",
  "Active": "活跃",
  "Quiet": "平静",
  "Next holiday ": "下一个假日 ",
  "today": "今天",
  "fee ": "手续费 ",
  "block height": "区块高度",
  "Nine-dash line (S. China Sea)": "九段线（南海）",
  "Ukraine front line (approx.)": "烏克蘭前线（概略）",
  "Kashmir Line of Control": "喀什米尔控制线",
  "Korean DMZ": "朝鮮半岛军事分界线",
  "Taiwan Strait median line": "臺湾海峽中线",
  "General": "一般",
  "Feature idea": "功能建议",
  "Bug": "错误",
  "Influenza": "流行性感冒",
  "COVID-19": "COVID-19",
  "SARS": "SARS",
  "Ebola": "伊波拉出血热",
  "Measles": "麻疹",
  "Wave propagation": "波的传播",
  "Back to the start": "回到开头",
  "Jump to the end": "跳到结尾",
  "Display": "显示",
  "peak ahead": "稍后最高",
  "Place a source and watch the shaking spread": "设置震源，观看搖晃如何扩散",
  "U.S. presidential elections": "美国总统选舉",
  "Electoral votes": "选舉人票",
  "majority": "过半数",
  "of the popular vote": "普选得票率",
  "Earlier election": "上一次选舉",
  "Later election": "下一次选舉",
  "Split districts": "分割的选区",
  "Colour = who received the state’s electoral votes.": "颜色代表取得该州选舉人票的候选人。",
  "Source: National Archives · American Presidency Project": "来源：美国国家文件館 · American Presidency Project",
  "Could not load the election data": "无法加载选舉数据",
  "Map weather": "地图中心天气",
  "Live weather at the map center (no location permission)": "地图中心的实时天气（不需位置权限）",
  "Day length": "昼长",
  "Daylight hours at the map-center latitude": "地图中心纬度的日照时数",
  "Map scale": "地图比例尺",
  "Scale at the current zoom": "目前缩放层级的比例尺",
  "Calendar": "行事历",
  "This month, today highlighted": "本月，并标示今天",
  "Next new moon": "下一次新月",
  "Days until the next new moon": "距离下次新月的天数",
  "Time zones (live clock)": "时区（实时时钟）",
  "Educational model — in a real emergency follow the official authorities. These simulations do not predict whether damage will or will not occur; either way, keep the preparations you would need ready as a matter of routine.": "教育用模型 — 实际灾害时请遵循官方机关的指示。这些模拟并非预测是否会造成灾害；无论如何，请平时就做好必要的准备。",
  "⚠ Weather & disaster warnings": "⚠ 气象与灾害警报",
  "⚡ Energy mix": "⚡ 能源结构",
  "🌊 Ocean currents": "🌊 洋流",
  "🌊 Tides": "🌊 潮汐",
  "🌾 Crop cultivation": "🌾 作物种植",
  "🕸 Industry web": "🕸 产业关联网",
  "🚢 Trade flows": "🚢 贸易流动",
  "3C 273 — the first quasar ever identified": "3C 273 — 人类确认的第一个类星体",
  "An educational model. In a real emergency, follow the instructions of the official authorities. It does not predict whether damage will occur. Keep your everyday preparations ready.": "教育用模型。实际灾害时请遵循官方机关的指示。本模型不预测是否会造成灾害。请平时就做好必要的准备。",
  "Andromeda (M31) — the nearest large galaxy": "仙女座星系（M31）— 最近的大型星系",
  "Baselines (archipelagic / straight / normal)": "基线（群岛／直线／正常）",
  "Centre of the Milky Way": "银河系中心",
  "Cesium — true 3-D globe": "Cesium — 真正的 3D 地球仪",
  "Cold desert": "寒漠",
  "Cold steppe": "寒草原",
  "Connection line": "连接线",
  "Continental, dry summer (cold)": "大陆性，夏干（冷涼）",
  "Continental, dry summer (severe)": "大陆性，夏干（酷寒）",
  "Continental, dry winter (hot summer)": "大陆性，冬干（夏热）",
  "Continental, dry winter (warm summer)": "大陆性，冬干（夏暖）",
  "Continental, dry-hot summer": "大陆性，夏干热",
  "Continental, dry-warm summer": "大陆性，夏干暖",
  "Court ruling": "司法判决界线",
  "Dominion of Newfoundland": "紐芬蘭自治领",
  "East Germany": "东德",
  "East Turkestan": "东突厥斯坦",
  "Edge of the Milky Way’s stellar disc": "银河系恒星盘的边缘",
  "EEZ — 200 NM": "专属经济区 — 200 海里",
  "Free City of Danzig": "但澤自由市",
  "GN-z11 — one of the most distant galaxies measured (z = 10.6), comoving": "GN-z11 — 已测得最遥远的星系之一（z = 10.6），共动距离",
  "Heliopause — where Voyager 1 measured the solar wind stop": "日球层顶 — 航海家 1 号测得太阳风停止之处",
  "Hot desert": "热漠",
  "Hot steppe": "热草原",
  "Humid continental, hot summer": "湿潤大陆性，夏热",
  "Humid continental, warm summer": "湿潤大陆性，夏暖",
  "Humid subtropical": "湿潤副热带",
  "Humid subtropical, dry winter": "湿潤副热带，冬干",
  "Ice cap": "冰帽",
  "Joint regime": "共同管理海域",
  "Kuiper belt — the outer edge of the classical belt": "古柏带 — 传统带的外缘",
  "Manchukuo": "满洲国",
  "MapLibre (default)": "MapLibre（默认）",
  "Median line": "中线",
  "Mediterranean, cold summer": "地中海型，夏涼",
  "Mediterranean, hot summer": "地中海型，夏热",
  "Mediterranean, warm summer": "地中海型，夏暖",
  "Oceanic": "海洋性",
  "Oort cloud — the outer boundary inferred from long-period comets": "欧特云 — 由长周期彗星推得的外界",
  "Proxima Centauri — the nearest star": "比邻星 — 最近的恒星",
  "Savanna": "莽原",
  "Sirius — the brightest star in the sky": "天狼星 — 全天最亮的恒星",
  "South Vietnam": "南越",
  "South Yemen": "南葉门",
  "Subarctic": "副极地",
  "Subarctic, dry winter": "副极地，冬干",
  "Subarctic, dry winter (severe)": "副极地，冬干（酷寒）",
  "Subarctic, severe winter": "副极地，冬季酷寒",
  "Subpolar oceanic": "副极地海洋性",
  "Subtropical highland": "副热带高地",
  "Subtropical highland, dry winter": "副热带高地，冬干",
  "Territorial sea — 12 NM": "领海 — 12 海里",
  "The Coma cluster — a thousand galaxies bound together": "后髮座星系团 — 上千个星系受重力束縛在一起",
  "The cosmic microwave background — the oldest light there is (z ≈ 1100)": "宇宙微波背景 — 现存最古老的光（z ≈ 1100）",
  "The Large Magellanic Cloud — a satellite galaxy": "大麦哲倫星系 — 一个卫星星系",
  "The Orion Nebula — the nearest region forming massive stars": "獵户座大星云 — 最近的大质量恒星形成区",
  "The particle horizon — the edge of the observable universe": "粒子视界 — 可观测宇宙的边界",
  "The Pleiades — the nearest bright open cluster": "昴宿星团 — 最近的明亮疏散星团",
  "Tibet": "西藏",
  "Treaty boundary": "条约界线",
  "Tropical monsoon": "热带季风",
  "Tropical rainforest": "热带雨林",
  "Tundra": "苔原",
  "Unilateral claim (undisputed)": "單方主张（无争议）",
  "Unsettled / disputed": "未确定／有争议",
  "Unsettled median line": "未确定中线",
  "Virgo cluster — the centre of our supercluster": "室女座星系团 — 本超星系团的中心",
  "Airliner A320 · jet": "A320 客机 · 噴射机",
  "Austria-Hungary": "奥匈帝国",
  "British Raj (British India)": "英属印度",
  "Cessna 172 · trainer": "塞斯納 172 · 教練机",
  "Czechoslovakia": "捷克斯洛伐克",
  "Dutch East Indies": "荷属东印度",
  "Empire of Brazil": "巴西帝国",
  "Empire of Japan": "大日本帝国",
  "Ethiopia (incl. Eritrea)": "衣索比亚（含厄利垂亚）",
  "Ethiopian Empire": "衣索比亚帝国",
  "F-16 · fighter": "F-16 · 战鬥机",
  "F-35 Lightning II · stealth fighter": "F-35 閃电II · 匿踪战鬥机",
  "Francoist Spain": "佛朗哥时期西班牙",
  "French Third Republic": "法蘭西第三共和国",
  "German Empire": "德意志帝国",
  "Glider · sailplane": "滑翔机 · 无动力",
  "Imperial State of Iran": "伊朗帝国",
  "Indonesia (incl. East Timor)": "印尼（含东帝汶）",
  "Kingdom of Egypt": "埃及王国",
  "Kingdom of Hungary": "匈牙利王国",
  "Kingdom of Italy": "义大利王国",
  "Kingdom of Portugal": "葡萄牙王国",
  "Kingdom of Yugoslavia": "南斯拉夫王国",
  "Korean Empire": "大韓帝国",
  "Nautical seamarks (OpenSeaMap)": "航海标识（OpenSeaMap）",
  "Nazi Germany": "納粹德国",
  "Ottoman Empire": "鄂图曼帝国",
  "P-51 Mustang · warbird": "P-51 野马 · 二战名机",
  "Pakistan (incl. East Pakistan)": "巴基斯坦（含东巴基斯坦）",
  "Persia": "波斯",
  "Qing Empire": "大清帝国",
  "Rail infrastructure (OpenRailwayMap)": "铁道基礎设施（OpenRailwayMap）",
  "Republic of China": "中華民国",
  "Russian Empire": "俄罗斯帝国",
  "Seamarks (buoys, lights, depths) appear when you zoom into a coast or harbor.": "航海标识（浮标、灯标、水深）在放大到海岸或港口时才会显示。",
  "Serbia and Montenegro": "塞尔维亚和蒙特内哥罗",
  "Siam": "暹罗",
  "Soviet Russia (RSFSR)": "蘇维埃俄国（俄罗斯蘇维埃联邦社会主义共和国）",
  "Soviet Union": "蘇联",
  "Spanish Republic": "西班牙共和国",
  "Sudan (incl. South Sudan)": "蘇丹（含南蘇丹）",
  "United Arab Republic": "阿拉伯联合共和国",
  "United Kingdom of Great Britain and Ireland": "大不列顛及愛尔蘭联合王国",
  "Weimar Republic": "威瑪共和国",
  "West Germany": "西德",
  "Yugoslavia (SFRY)": "南斯拉夫（SFRY）",
  "Abyssinia": "阿比西尼亚",
  "Accra": "阿克拉",
  "Aden": "亚丁",
  "Adolescent fertility /1k": "青少年生育率 /千人",
  "Aerospace": "航太",
  "Agricultural land %": "农地面积 %",
  "Agriculture": "农业",
  "Air base": "空军基地",
  "Air defense": "防空",
  "Aircraft (combat radius)": "航空器（作战半径）",
  "Alaska": "阿拉斯加",
  "Alcohol per capita L": "人均酒精消费 L",
  "Alexandria, Egypt": "亚历山卓（埃及）",
  "Alexandria, Virginia (USA)": "亚历山德里亚（美国维吉尼亚州）",
  "Algeria": "阿尔及利亚",
  "Analysis": "分析",
  "Anglo-Egyptian Sudan": "英埃蘇丹",
  "Angola": "安哥拉",
  "Annam": "安南",
  "Antarctica": "南极洲",
  "Arabia": "阿拉伯",
  "Arabia (Nejd)": "阿拉伯（内志）",
  "Armed forces personnel": "军隊人数",
  "Asante": "阿散蒂",
  "Athens, Georgia (USA)": "雅典斯（美国喬治亚州）",
  "Athens, Greece": "雅典（希臘）",
  "Ato Trading Confederacy": "阿托贸易联盟",
  "Australia": "澳洲",
  "Automotive": "汽车",
  "Azimuthal equidistant": "方位等距投影",
  "Ballistic missiles": "弹道飞弹",
  "Banking": "银行",
  "Barotse": "巴罗策",
  "Base": "基地",
  "Basutoland": "巴蘇陀蘭",
  "Bavaria": "巴伐利亚",
  "Bechuanaland": "貝专納蘭",
  "Belgian Congo": "比属刚果",
  "Belgium": "比利时",
  "Birmingham, Alabama (USA)": "伯明罕（美国阿拉巴马州）",
  "Birmingham, UK": "伯明罕（英国）",
  "Bohemia": "波希米亚",
  "Border": "边界",
  "Borgu States": "博尔古諸邦",
  "Bosnia-Herzegovina": "波士尼亚与赫塞哥维納",
  "Brazil": "巴西",
  "British Bechuanaland": "英属貝专納蘭",
  "British East Africa": "英属东非",
  "British Guiana": "英属圭亚那",
  "British Honduras": "英属宏都拉斯",
  "British Protectorate": "英国保护地",
  "British Solomon Islands": "英属索罗门群岛",
  "British Somaliland": "英属索马利蘭",
  "Buganda": "布干达",
  "Bunyoro": "布尼奥罗",
  "Burma": "緬甸",
  "Calabar": "卡拉巴尔",
  "Cambridge, Massachusetts (USA)": "劍橋（美国麻薩諸塞州）",
  "Cambridge, UK": "劍橋（英国）",
  "Canal": "运河",
  "Cape Colony": "开普殖民地",
  "Central Asian Khanates": "中亚汗国",
  "Ceylon": "錫蘭",
  "China": "中国",
  "Chinese Warlords": "中国军閥",
  "Chokepoint": "咽喉要道",
  "Clean cooking fuel access %": "潔净炊事燃料普及率 %",
  "CO₂ emissions (Mt)": "CO₂ 排放量（百萬噸）",
  "Cochin China": "交趾支那",
  "Conflict": "冲突",
  "Congo": "刚果",
  "Congo Free State": "刚果自由邦",
  "Córdoba, Argentina": "科尔多瓦（阿根廷）",
  "Córdoba, Spain": "哥多華（西班牙）",
  "Cotonou": "科托努",
  "Cruise missiles": "巡弋飞弹",
  "Custom XYZ source": "自定义 XYZ 瓦片来源",
  "Cyber": "网络",
  "Cyrenaica": "昔蘭尼加",
  "Dahomey": "达荷美",
  "Dam": "水坝",
  "Danzig": "但澤",
  "Denmark": "丹麦",
  "Dutch Guiana": "荷属圭亚那",
  "Dutch New Guinea": "荷属新几内亚",
  "Earthquakes (live + history)": "地震（实时＋历史）",
  "East Aden Protectorate": "东亚丁保护地",
  "East Prussia": "东普魯士",
  "Education spending % GDP": "教育支出 占GDP %",
  "Egypt": "埃及",
  "Electricity access %": "电力普及率 %",
  "Electricity use /capita (kWh)": "人均用电量（kWh）",
  "Emirate of Bin Shalan": "賓沙蘭酋长国",
  "Emirate of Bukhara": "布哈拉汗国",
  "Employment in agriculture %": "农业就业比率 %",
  "Energy": "能源",
  "Energy use /capita": "人均能源消费",
  "Equal Earth": "等积地球投影",
  "Equirectangular": "等距圆柱投影",
  "Eritrea": "厄利垂亚",
  "Esri World Imagery": "Esri 卫星影像",
  "Ethiopia": "衣索比亚",
  "Extreme poverty %": "极端貧窮 %",
  "Far Eastern Republic": "远东共和国",
  "FDI inflow % GDP": "外人直接投资流入 占GDP %",
  "Federated Malay States": "马来联邦",
  "Federation of Rhodesia and Nyasaland": "罗德西亚与尼亚薩蘭联邦",
  "Federation of South Arabia": "南阿拉伯联邦",
  "Female labor participation %": "女性勞动参与率 %",
  "Fertility rate (births/woman)": "总生育率（人/婦女）",
  "Fezzan": "费赞",
  "Fixed broadband /100": "固网宽频 /百人",
  "Food industry": "食品",
  "Forest area %": "森林面积 %",
  "Formosa": "福尔摩沙",
  "France": "法国",
  "French Cameroons": "法属喀麦隆",
  "French Congo": "法属刚果",
  "French Equatorial Africa": "法属赤道非洲",
  "French Guiana": "法属圭亚那",
  "French Guinea": "法属几内亚",
  "French Indo-China": "法属印度支那",
  "French Indochina": "法属印度支那",
  "French Polynesia": "法属玻里尼西亚",
  "French Somaliland": "法属索马利蘭",
  "French Sudan": "法属蘇丹",
  "French Togoland": "法属多哥蘭",
  "French West Africa": "法属西非",
  "Futa Jallon": "富塔賈隆",
  "Futa Toro": "富塔托罗",
  "Gaza": "加薩",
  "GDP growth %": "GDP 成长率 %",
  "Georgia (the country)": "喬治亚（国家）",
  "Georgia, USA (the state)": "喬治亚州（美国）",
  "German East Africa": "德属东非",
  "German New Guinea": "德属新几内亚",
  "German Solomon Islands": "德属索罗门群岛",
  "German South-West Africa": "德属西南非",
  "Germany": "德国",
  "Gilbert and Ellice Islands": "吉尔伯特及埃利斯群岛",
  "GNI per capita (Atlas, US$)": "人均国民所得毛额（Atlas法, 美元）",
  "Gold Coast": "黄金海岸",
  "Govt debt % GDP": "政府債务 占GDP %",
  "Gran Colombia": "大哥倫比亚",
  "Griqualand West": "西格里夸蘭",
  "Guadalajara, Mexico": "瓜达拉哈拉（墨西哥）",
  "Guadalajara, Spain": "瓜达拉哈拉（西班牙）",
  "Guadeloupe": "瓜地洛普",
  "Guinea-Bissau": "几内亚比索",
  "Hail": "哈伊勒",
  "Hawaii": "夏威夷",
  "Health spend %GDP": "医疗支出 占GDP %",
  "Heat of Attention": "关注度热区图",
  "Hejaz": "漢志",
  "High-tech exports %": "高科技产品出口 %",
  "Hokkaido Shinkansen": "北海道新干线",
  "Hokuriku Shinkansen": "北陆新干线",
  "Homicide rate /100k": "兇殺率 /十萬人",
  "Hospital beds /1k": "病床数 /千人",
  "Hub": "樞紐",
  "Ibadan": "伊巴丹",
  "Imerina": "伊梅里納",
  "Imperial Japan": "大日本帝国",
  "Income inequality (Gini)": "所得不平等（吉尼系数）",
  "India": "印度",
  "Indonesia": "印尼",
  "Infant mortality /1k": "嬰兒死亡率 /千人",
  "Inflation % (CPI)": "通膨率 %（CPI）",
  "Information technology": "信息科技",
  "Inini": "伊尼尼",
  "Insurance": "保险",
  "Intl. tourist arrivals": "国际旅游客人次",
  "Irish Free State": "愛尔蘭自由邦",
  "Israel": "以色列",
  "Italian Somaliland": "义属索马利蘭",
  "Italy": "义大利",
  "Jamaica": "牙买加",
  "Japan": "日本",
  "Joetsu Shinkansen": "上越新干线",
  "Jordan": "约旦",
  "Joseon": "朝鮮",
  "Jupiter": "木星",
  "Kamerun": "德属喀麦隆",
  "Kampuchea": "柬埔寨（民主柬埔寨）",
  "Kanem-Bornu": "加涅姆-博尔努",
  "Karafuto": "樺太",
  "Khanate of Khiva": "希瓦汗国",
  "Kingdom of Brazil": "巴西王国",
  "Kingdom of Bulgaria": "保加利亚王国",
  "Kingdom of Greece": "希臘王国",
  "Kingdom of Hawaii": "夏威夷王国",
  "Kingdom of Iraq": "伊拉克王国",
  "Kingdom of Romania": "罗马尼亚王国",
  "Kingdom of Serbia": "塞尔维亚王国",
  "Kong": "孔",
  "Korea": "朝鮮",
  "Korea, Democratic People's Republic of": "朝鮮民主主义人民共和国",
  "Korea, Republic of": "大韓民国",
  "Kuba": "库巴王国",
  "Kyushu Shinkansen": "九州新干线",
  "Lagos": "拉哥斯",
  "Lagos Colony": "拉哥斯殖民地",
  "Libya": "利比亚",
  "Literacy rate %": "识字率 %",
  "Lozi": "洛齐",
  "Luba": "盧巴",
  "Lunda": "隆达",
  "Madagascar": "马达加斯加",
  "Malaya": "马来亚",
  "Manchester, New Hampshire (USA)": "曼徹斯特（美国新罕布夏州）",
  "Manchester, UK": "曼徹斯特（英国）",
  "Manchu Empire": "满洲帝国",
  "Manchuria": "满洲",
  "Mandatory Palestine": "英属託管巴勒斯坦",
  "Manufacturing % GDP": "制造业 占GDP %",
  "Māori": "毛利",
  "Mapbox access token": "Mapbox 存取权杖",
  "Mapbox Satellite": "Mapbox 卫星影像",
  "Maritime": "海事",
  "Mars": "火星",
  "Martinique": "马丁尼克",
  "Mbailundu": "姆拜倫杜",
  "Mercury": "水星",
  "Mesopotamia": "美索不达米亚",
  "Military spending % GDP": "军事支出 占GDP %",
  "Mining": "礦业",
  "Mirambo": "米蘭博",
  "Mobile subs /100": "行动电话门号 /百人",
  "Mollweide": "莫尔威投影",
  "Morocco": "摩洛哥",
  "Mossi States": "莫西諸邦",
  "Motor vehicle manufacturing": "汽车制造",
  "Mozambique": "莫三比克",
  "Muscat and Oman": "马斯喀特和阿曼",
  "Naples, Florida (USA)": "那不勒斯（美国佛罗里达州）",
  "Naples, Italy": "拿坡里（义大利）",
  "NASA GIBS · MODIS Terra": "NASA GIBS · MODIS Terra",
  "NASA GIBS · VIIRS (NOAA-20)": "NASA GIBS · VIIRS (NOAA-20)",
  "NASA GIBS · VIIRS (SNPP)": "NASA GIBS · VIIRS (SNPP)",
  "Natal": "納塔尔",
  "Naval base": "海军基地",
  "Ndebele": "恩德貝萊",
  "Neptune": "海王星",
  "Netherlands": "荷蘭",
  "Netherlands Antilles": "荷属安地列斯",
  "Netherlands Indies": "荷属东印度",
  "New Caledonia and Dependencies": "新喀里多尼亚及其属地",
  "New Guinea": "新几内亚",
  "New Hebrides": "新赫布里底",
  "Newfoundland": "紐芬蘭",
  "Nguni": "恩古尼",
  "Ngwato": "恩瓦托",
  "North Borneo": "北婆罗洲",
  "North Vietnam": "北越",
  "North Yemen": "北葉门",
  "North-Eastern Rhodesia": "东北罗德西亚",
  "North-Western Rhodesia": "西北罗德西亚",
  "Northern Nigeria": "北奈及利亚",
  "Northern Rhodesia": "北罗德西亚",
  "Norway": "挪威",
  "Nuclear": "核能",
  "Nyasaland": "尼亚薩蘭",
  "Oil Rivers Protectorate": "油河保护地",
  "Opobo": "奥波博",
  "Orange Free State": "奥蘭治自由邦",
  "Overweight adults %": "成人过重比率 %",
  "Ovimbundu": "奥文本杜",
  "Oyo": "奥约",
  "Papua": "巴布亚",
  "Papua and New Guinea": "巴布亚与新几内亚",
  "Paris, France": "巴黎（法国）",
  "Paris, Texas (USA)": "巴黎斯（美国德州）",
  "Patent applications (resident)": "专利申请件数（本国）",
  "Perth, Australia": "伯斯（澳洲）",
  "Perth, Scotland (UK)": "伯斯（蘇格蘭）",
  "Pharmaceuticals": "制藥",
  "Physicians /1k": "医師数 /千人",
  "Pipeline": "管线",
  "PM2.5 air pollution (µg/m³)": "PM2.5 空气污染（µg/m³）",
  "Population 65+ %": "65歲以上人口 %",
  "Population density /km²": "人口密度 /km²",
  "Population growth %": "人口成长率 %",
  "Port": "港口",
  "Portugal": "葡萄牙",
  "Portuguese East Africa": "葡属东非",
  "Portuguese Guinea": "葡属几内亚",
  "Portuguese Timor": "葡属帝汶",
  "Prussia": "普魯士",
  "Puerto Rico": "波多黎各",
  "Question": "提问",
  "R&D spending % GDP": "研发支出 占GDP %",
  "Rapa Nui": "拉帕努伊",
  "Rattanakosin Kingdom": "拉达那哥欣王国",
  "Refugees hosted": "收容难民人数",
  "Remittances % GDP": "僑汇 占GDP %",
  "Renewable electricity %": "再生能源发电 %",
  "Renewable energy %": "再生能源比率 %",
  "Republic of Hawaii": "夏威夷共和国",
  "Researchers /million": "研究人员 /百萬人",
  "Réunion": "留尼旺",
  "Rhodesia": "罗德西亚",
  "Rio de Oro": "里奥德奥罗",
  "Robinson": "罗賓森投影",
  "Ruanda-Urundi": "盧安达-烏隆地",
  "Rural population %": "鄉村人口 %",
  "Russia": "俄罗斯",
  "Rwanda": "盧安达",
  "Saar Protectorate": "薩尔保护领",
  "Safe water access %": "安全飲用水普及率 %",
  "Saint Petersburg, Russia": "聖彼得堡（俄罗斯）",
  "Saipan": "塞班",
  "Samori Empire": "薩摩里帝国",
  "San Jose, California (USA)": "聖荷西（美国加州）",
  "San José, Costa Rica": "聖荷西（哥斯大黎加）",
  "Sanitation access %": "卫生设施普及率 %",
  "Santiago de Compostela, Spain": "聖地亚哥-德孔波斯特拉（西班牙）",
  "Santiago, Chile": "聖地牙哥（智利）",
  "Saturn": "土星",
  "Saudi Arabia": "沙烏地阿拉伯",
  "Secondary enrollment %": "中等教育就学率 %",
  "Sentinel Hub (S2 / Landsat)": "Sentinel Hub (S2 / Landsat)",
  "Sentinel Hub instance ID": "Sentinel Hub 执行个体 ID",
  "Sentinel-2 cloudless (EOX)": "Sentinel-2 无云影像（EOX）",
  "Shona": "紹納",
  "Smoking prevalence %": "吸菸率 %",
  "Software": "软件",
  "Sokoto Caliphate": "索科托哈里发国",
  "South Africa": "南非",
  "South Korea": "南韓",
  "South Russia": "南俄罗斯",
  "South West Africa": "西南非",
  "Southern Cameroons": "南喀麦隆",
  "Southern Nigeria": "南奈及利亚",
  "Southern Rhodesia": "南罗德西亚",
  "Spaceport": "太空发射场",
  "Spain": "西班牙",
  "Spanish Guinea": "西属几内亚",
  "Spanish Morocco": "西属摩洛哥",
  "Spanish Sahara": "西属撒哈拉",
  "St. Petersburg, Florida (USA)": "聖彼得堡（美国佛罗里达州）",
  "Strait": "海峽",
  "Straits Settlements": "海峽殖民地",
  "Suicide rate /100k": "自殺率 /十萬人",
  "Sultanate of Utetera": "烏泰泰拉蘇丹国",
  "Sultanate of Zanzibar": "尚吉巴蘇丹国",
  "Swaziland": "史瓦济蘭",
  "Sweden–Norway": "瑞典-挪威",
  "Sydney, Australia": "雪梨（澳洲）",
  "Sydney, Nova Scotia (Canada)": "雪梨（加拿大新斯科细亚省）",
  "Syria": "叙利亚",
  "Tanganyika": "坦干伊喀",
  "Tanzania, United Republic of": "坦尚尼亚联合共和国",
  "Tax revenue % GDP": "稅收 占GDP %",
  "Tech hub": "科技樞紐",
  "Teke": "特克",
  "Telecommunications": "电信",
  "Tertiary enrollment %": "高等教育就学率 %",
  "The Bahamas": "巴哈马",
  "The Gambia": "甘比亚",
  "Togoland": "多哥蘭",
  "Tohoku Shinkansen": "东北新干线",
  "Tokaido–Sanyo Shinkansen": "东海道・山阳新干线",
  "Tonkin": "东京（越南北圻）",
  "Tourist arrivals": "旅游客人次",
  "Trade % of GDP": "贸易 占GDP %",
  "Transjordan": "外约旦",
  "Transvaal": "德蘭士瓦",
  "Trinidad": "千里达",
  "Tripoli, Lebanon": "的黎波里（黎巴嫩）",
  "Tripoli, Libya": "的黎波里（利比亚）",
  "Tripolitania": "的黎波里塔尼亚",
  "Trucial Oman": "休战阿曼",
  "Tukular Caliphate": "图库洛尔帝国",
  "Türkiye": "土耳其",
  "Ubangi-Shari": "烏班吉沙立",
  "Ukraine": "烏克蘭",
  "Under-5 mortality /1k": "五歲以下死亡率 /千人",
  "Undernourishment %": "营養不足人口 %",
  "Unemployment %": "失业率 %",
  "Unfederated Malay States": "马来属邦",
  "Union of South Africa": "南非联邦",
  "United Kingdom": "英国",
  "United States": "美国",
  "Upper Volta": "上伏塔",
  "Uranus": "天王星",
  "Urban population %": "都市人口 %",
  "Valencia, Spain": "瓦倫西亚（西班牙）",
  "Valencia, Venezuela": "瓦倫西亚（委内瑞拉）",
  "Venus": "金星",
  "Wallis and Futuna Islands": "瓦利斯和富图納群岛",
  "Walvis Bay": "鯨湾港",
  "West Bank": "约旦河西岸",
  "West Irian": "西伊里安",
  "Western Sahara": "西撒哈拉",
  "White Russia": "白俄罗斯",
  "Winkel Tripel": "温克尔三重投影",
  "Women in parliament %": "女性国会议员比率 %",
  "Xinjiang": "新疆",
  "XYZ URL template — use {z}/{x}/{y}": "XYZ 网址范本 — 使用 {z}/{x}/{y}",
  "Yaka": "亚卡",
  "Yeke": "耶凱",
  "Yemen": "葉门",
  "yesterday": "昨天",
  "Zaire": "薩伊",
  "Zululand": "祖魯蘭",
  }
});
