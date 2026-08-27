/* ============================================================================
 *  IntMap · UI STRINGS — zh-Hans   ⚠ GENERATED FILE — DO NOT EDIT BY HAND
 * ----------------------------------------------------------------------------
 *  「簡体を追加して。(beta)」 (#R224)
 *
 *  Produced from js/locales/ui.zh.js by scripts/zh-hans.mjs: this project’s Taiwan→mainland WORD
 *  table first (its own reviewed choices), then OpenCC twp→cn for the orthography itself (#R251 —
 *  the 440-pair map it replaced covered 439 of the 1,529 characters in use). Fix a string in
 *  ui.zh.js and re-run the script; editing
 *  this file directly is undone by the next run, and tests/r224-checks.test.mjs fails if the two
 *  ever disagree.
 *
 *      node scripts/zh-hans.mjs
 * ==========================================================================*/
window.IntMapLang.define('zh-hans', {
  /* ① the keyed table — Settings, tabs, layer names, the static UI */
  ui: {
      /* ══ ⚠⚠⚠ (#R249) THE FIFTEENTH SURFACE — THE DOCUMENT'S OWN METADATA ═══════════════════════
         「全ての言语について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。」
         index.html's <title> and <meta name="description"> were literals in the markup, so the
         browser tab, the bookmark and every shared link said 「Explore the world. Ask the map.」 in
         all nine languages — while every instrument printed 100 %, because no instrument looked at
         the document itself. sources.html and science.html had localised both since #R239
         (js/page-i18n.js), which is what made the gap invisible: the mechanism existed and the
         application page simply never used it. scripts/i18n-doc-audit.mjs is the gate that stops a
         sixteenth one being forgotten. */
      docTitle:"IntMap — 探索世界，向地图提问。",
      docDesc:"IntMap 是一款互动式世界地图，可探索地理、气候、历史、人口与全球时事等，并支持由 Atlas 提供的自然语言操作。",

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
      "ttlMapTools":"地图工具",
      "ttlMeasureDA":"测量距离／面积",
      "ttlMeasureTools":"测量工具",
      "ttlMyLocation":"我的位置",
      "ttlObjects":"对象",
      "ttlRemove":"移除",
      "ttlResetNorth":"回正北方",
      "ttlResetBearing":"重置方位",
      "ttlSearchNews":"字段有文字时搜索，否则依目前的新闻设置重新加载",
      "phPostBody":"分享观察、问题或推论…",
      "phPostTitle":"标题",
      "ttlToggleSidebar":"切换侧边栏",
      "ttlTools":"工具",
      "phAisKey":"aisstream.io API 密钥",
    "lnkTerms":"服务条款",
    "lnkPrivacy":"隐私权政策",
    "legalTabTerms":"条款",
    "legalTabPrivacy":"隐私权",
    "commAddImage":"新增图片",
    "accentCustom":"自定义颜色",
    "accentDefault":"默认",
    "blueberryBody":"我的目标是打造一张地图，让地理、气候、历史、生态、人口与世界大事都能在同一个地方被探索。\nIntMap 由个人独立开发，并持续加入新的图层、数据集与功能。\n如果你喜欢使用 IntMap，并愿意支持它未来的开发，可以在下方赞助。",
    "blueberryBtn":"支持",
    "blueberryGo":"选择金额 ↗",
    "blueberryNote":"将开启外部页面（Stripe）。",
    "blueberryTitle":"支持 IntMap",
    "engineActive":"目前执行于：",
    "engineCesium":"Cesium — 具真实地形的立体地球仪",
    "engineFellBack":"Cesium 无法启动，因此本次会话改用 MapLibre。",
    "engineHint":"Cesium 在每个缩放层级都把地球算成真正的椭球体，使用相同的卫星影像与相同的高程数据。它只在被选用时才下载，切换时会重新加载页面。等高线与封闭立体工具仍仅限 MapLibre。",
    "engineMapLibre":"MapLibre — 2D／3D 地图（默认）",
    "engineSwitching":"正在切换引擎 — 重新加载中…",
    "eyeAltOff":"关闭（默认）",
    "eyeAltOn":"开启 — 显示相机高度",
    "favLayers":"常用图层",
    "labelLangEn":"一律英文",
    "labelLangLocal":"当地语言（原生文字）",
    "labelLangUi":"与应用语言相同",
    "lblAccent":"强调色",
    "lblDataSources":"数据来源",
    "lblEngine":"地图引擎",
    "lblEyeAlt":"读数中的视点高度",
    "lblFeedback":"意见回馈与错误回报",
    "lblKbd":"键盘快捷键",
    "lblLabelLang":"地名标注",
    "lblLang":"语言",
    "lblMapColor":"地图颜色",
    "lblNavInertia":"惯性",
    "lblNavPan":"平移",
    "lblNavSens":"地图操作灵敏度",
    "lblNavZoom":"缩放",
    "lblNewsCountries":"依国家媒体筛选新闻",
    "lblNewsSources":"新闻媒体",
    "lblNightSide":"昼夜着色",
    "lblScience":"科学根据与逻辑",
    "lblShowRank":"排名编号（国家）",
    "lblSidebarStyle":"侧边栏外观",
    "lblTicker":"底部跑马灯（新闻与市场）",
    "lblTiltLimit":"地图倾角上限",
    "lblWsMode":"窗口工作区（桌面）",
    "lgdRadarTitle":"降水强度",
    "lgdSSTTitle":"海面水温",
    "lgdTitle":"柯本–盖格",
    "lyrAOD":"气胶／烟霾",
    "lyrClimate":"柯本气候分类",
   "lyrContours":"等高线",
    "lyrDem":"民主指数（2023）",
    "lyrEU":"欧盟成员国",
    "lyrGDPpc":"人均 GDP",
    "lyrGrpClimate":"气候与天气",
    "lyrGrpDemo":"人口与人口结构",
    "lyrGrpGeo":"战略地理",
    "lyrGrpGeoPol":"地缘政治与国防",
    "lyrGrpPolitics":"政治与治理",
    "lyrGrpSecurity":"国防与安全",
    "lyrGrpHealth":"医疗与卫生",
    "lyrGrpTech":"科技与基础设施",
    "lyrGrpEnergy":"能源与资源",   /* (#R258) */
    "lyrGrpEconomy":"经济与贸易",   /* (#R261) */
    "lyrGrpSociety":"社会与教育",   /* (#R261) */
    "lyrGrpTransport":"交通与运输",   /* (#R261) */
    "lyrGrpAgri":"农业与粮食",   /* (#R261) */
    "lyrGrpHazard":"灾害与紧急",
    "lyrGrpIndic":"指标与叠图",
    "lyrGrpMaritime":"海洋",
    "lyrGrpOrbit":"太空",
    "lyrGrpOthers":"Beta",
    "lyrGrpOthersReal":"其他",
    "lyrGrpTerrain":"地形与高程",
    "lyrGrpNature":"自然与土地覆盖",
    "lyrHDI":"人类发展指数（2022）",
    "lyrHillshade":"地形起伏（阴影）",
    "lyrMilSpend":"国防支出",
    "lyrNATO":"NATO 成员国",
    "lyrNightSide":"昼夜着色",
    "lyrNightSat":"夜间灯光（卫星）",
    "lyrOceanCur":"海流",
    "lyrPop":"人口密度（各国）",
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
    "lyrWind":"风",
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
    "newsLangHint":"所选各语言的标题会一起显示；若有 AI 密钥，标题会自动翻译。",
    "newsLangMultiSel":"多种语言…",
    "newsSourceAll":"所有媒体",
    "newsSourceMultiSel":"选择媒体…",
    "newsSourcesHint":"只显示你勾选的媒体的标题。列表依你目前数据源实际包含的媒体建立。",
    "nightSideOff":"关闭 — 整颗地球均匀照亮",
    "nightSideOn":"开启（默认）— 让夜侧变暗并显示城市灯光",
    "optDark":"深色",
    "optLight":"浅色",
    "proArchive":"🔒 十年时光回溯文件",
    "proIntel":"🔒 俄・中在地一手来源情报",
    "reportBugBtn":"🐞 回报错误",
    "screenshotBtn":"地图屏幕撷取（隐藏控制项，保留图例）",
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
    "viewKbd":"⌨ 检视键盘快捷键（或按 ?）",
    "viewScience":"每一项模拟如何运作 ↗",
    "viewSourcesPage":"开启数据来源页面 ↗",
    "wsHint":"新闻、国家、地图、图层与 Atlas 各自成为独立窗口，可自由移动、调整大小、收合与堆叠。你的版面配置会被保存。",
      tabNews:"新闻", tabCompanies:"企业", tabStats:"国家",
      searchPh:"搜索新闻／地点…", filterCountriesPh:"筛选国家…", filterCompaniesPh:"筛选企业…", evCatsAria:"事件分类", pickCountryMap:"在地图上选择国家", searchBtn:"搜索", searchLoadBtn:"搜索／加载", loading:"正在加载报道…",
      noMatch:"找不到符合的结果。", networkError:"无法加载新闻，正在重试…",
      emptyHint:"尚未选择分页 — 地图目前是干净的。<br>请在上方选择分页以显示内容。",
      viewMap:"地图", viewSat:"卫星影像", settings:"设置", modalTitle:"设置", close:"关闭",
      tabDocked:"面板", lblDockPanels:"图例与工具窗口", dockPanelsOff:"显示于地图上（默认）", dockPanelsOn:"收进侧边栏分页", dockPanelsHint:"所有图例、读数与工具窗口都会移到左侧边栏的「面板」分页，让地图保持清爽。点击地点时出现、与地图位置相连的弹出窗口仍留在地图上。",
      setSecAppearance:"外观", setSecLayout:"版面与面板", setSecMap:"地图操作", setSecUnits:"单位与时间", setSecNews:"新闻与跑马灯", setSecAI:"AI", setSecKeys:"整合与密钥", setSecAbout:"关于与支持",
      lblTheme:"主题", lblTz:"时区设置", tzSearch:"搜索时区…", btnApply:"应用", optAuto:"系统默认", optLocal:"当地时间（系统默认）",
      dashCatMil:"军事基地", dashCatTech:"科技／网络", dashCatMar:"海运／咽喉点", dashCatGeo:"地理／气候",
      readWiki:"在维基百科阅读 ↗", measure:"测量", areaTool:"面积", radius:"半径", vol3dTool:"立体体积", points:"点", total:"合计", perimeter:"周长", area:"面积", clear:"清除", undoPt:"取消上一点",
      radiusHint:"点击地图放置圆形。可放置多个。",
      placeNames:"地名", geoLabels:"水域与地形标注", adminBounds:"州／省界", roadsLayer:"道路", railLayer:"铁路", countries:"国家（信息）", removeAll:"全部清除", color:"颜色",
      statPop:"人口", statGdp:"GDP（名目）", statGdpPc:"人均 GDP", statGdpPPP:"GDP（购买力平价）", statGdpPcPPP:"人均 GDP（购买力平价）", statArea:"面积", statDensity:"人口密度", statRegion:"地区", statCapital:"首都", statCurrency:"货币", statLang:"语言", statHDI:"人类发展指数", statDem:"民主指数", statMil:"国防支出", statLife:"平均寿命", statInet:"网络使用人口",
      details:"详细数据 ↗", loadingData:"正在加载国家数据…", dataNA:"无数据", noData:"查无国家数据。", sortGdp:"GDP", sortPop:"人口", sortArea:"面积", sortName:"A–Z", sortHDI:"HDI", sortMil:"军费", elev:"海拔", bearing:"方位", presetNone:"— 请选择 —", presetLbl:"距离默认", opacity:"不透明度", circumference:"圆周长", lblUnits:"度量单位", unitBoth:"公制＋英制", unitMetric:"仅公制", unitImperial:"仅英制", msPh:"搜索地球上任何地点…",
      spType:"类型", 
      flat:"平面", globe:"地球仪", threeD:"⛰️ 3D", gridBtn:"🌐 经纬格线", gridLayer:"🌐 格线与标注", lblTempUnit:"温度", tempBoth:"°C＋°F", tempC:"仅 °C", tempF:"仅 °F", measureMenuBtn:"测量", measureDistBtn:"📏 距离／面积", drawBtn:"✏️ 绘制", vol3dBtn:"🧊 立体体积", radiusBtn:"⭕ 半径", objectsBtn:"🗂 对象", mScreenshot:"地图屏幕撷取", shareMenuBtn:"分享", shareLinkBtn:"分享／复制链接", layersBtn:"图层 ▾",
      ctxDropPin:"放置图钉", ctxMeasureFrom:"从此开始测量", ctxPostHere:"发布到社区", ctxDistFrom:"与前一个图钉的距离", ctxCopy:"复制坐标", ctxClearPins:"移除所有图钉", ctxThisPoint:"此地点", coords:"坐标", depth:"深度", climate:"气候", tlMachine:"Chronos", 
      lyrEEZ:"专属经济海域／12海里", lyrShips:"实时船舶动态", lyrPlanes:"实时航班动态", lyrSats:"实时卫星", lyrThermal:"热异常（火点）", planesZoomHint:"放大以加载实时航班", planesAreaHint:"请放大 — 实时航班只涵盖画面中央区域", poiLabels:"地点、商家与设施", shipsZoomHint:"放大以加载实时船舶", aisNoKey:"实时船舶需要免费的 AISstream.io API 密钥 — 请在设置中新增。", aisKeyLabel:"实时船舶动态（AISstream 密钥）", aisKeyHint:"在 aisstream.io 申请免费密钥并贴在此处即可看到实时船舶。密钥仅保存在这个浏览器中。",
      filtCiv:"民用", filtMil:"军用", filtAll:"全部", trafficFilter:"筛选", lyrTime:"图层日期", thermWin24:"过去 24 小时", thermWin48:"过去 48 小时", thermWin72:"过去 72 小时",
      commAdd:"＋ 新贴文", commTitle:"标题", commBody:"分享你的观察、问题或推论…", commPost:"发布", commCancel:"取消", commEmpty:"目前还没有贴文。点「＋ 新贴文」开始讨论。", commLocate:"在地图上显示", commDelete:"删除", commReply:"回复", commWrite:"写下留言…", commPostNew:"新贴文", commPlacedAt:"放置于", commSortHot:"热门", commSortNew:"最新", commSortTop:"最高分", commSearchPh:"搜索贴文…", commInView:"画面范围内", commCat:"分类", commCatAll:"全部", commEdit:"编辑", commEdited:"已编辑", commEditPost:"编辑贴文", commSaveEdit:"保存变更", commNoMatch:"没有符合筛选条件的贴文。", borders:"国界", coastline:"海岸线与湖岸线", compare:"比较", compareEmpty:"点击国家列以选取并比较。", coCompareEmpty:"点击企业列以选取并比较。", compareView:"显示比较", compareClear:"清除", back:"返回", deletePin:"删除",
      satCtrlTitle:"卫星影像", satProvider:"提供者", satDate:"拍摄日期", satLatest:"最新可用", satMosaicSuffix:"无云镶嵌影像", satLocked:"需 API 密钥", satPrevDay:"前一天", satNextDay:"后一天", satKeysTitle:"卫星影像（自备密钥）", satKeyHint:"输入 API 密钥即可在卫星面板中使用这些提供者。密钥仅保存在这个浏览器中。", satKeyConnected:"已连接", satKeyNone:"无密钥", satErrAuth:"{provider}：验证失败 — 请检查 API 密钥", satErrTiles:"{provider}：影像无法取得 — 已切换为替代来源",
      aiSecTitle:"AI 功能", aiSecHint:"内置 AI — 登录用户免费（每日最多 10 次），不需要 API 密钥。",
      aiProvider:"AI 提供者", 
      aiNoKey:"请先在「设置 → AI 功能」中新增 AI API 密钥。", aiNoVision:"这个模型无法读取影像。请改用 GPT-4o、Claude 3.5 Sonnet 或 Gemini 1.5 Pro。",
      aiThinking:"AI 分析中…", aiError:"AI 请求失败", aiCopy:"复制", aiCopied:"已复制 ✓", aiClose:"关闭", aiRetry:"重试",
      aiTranslateTitles:"翻译标题", aiTransBusy:"翻译中…", aiTransDone:"已翻译 {n} 则标题", aiTransNone:"标题已是你的语言。",
      lblNewsLang:"新闻语言", newsLangUi:"仅目前语言", newsLangMulti:"所有语言（自动翻译标题）", 
      aiTranslate:"翻译", aiShowOriginal:"原文", aiTransNoText:"没有可翻译的内文 — 请改用网页检视。",
      aiSumBtn:"以 AI 摘要这个区域", popInArea:"此区域人口", popCalcing:"正在计算人口…", popFail:"人口查询失败 — 请再试一次。", newsInArea:"此区域的新闻", elevProfile:"高程剖面", finalizeMeas:"保留在地图上", aiSumTitle:"区域简报", aiSumSub:"所选区域内有 {n} 个新闻图钉", aiSumNoArea:"请先画出范围或放置圆形。", aiSumNoNews:"此区域内没有新闻图钉。",
      aiVisHead:"AI 变化侦测", aiVisBtn:"侦测变化", aiVisTitle:"卫星影像变化报告", aiVisSub:"比较 {a} → {b}", aiVisBefore:"之前", aiVisAfter:"之后", aiVisCapturing:"正在撷取影像…", aiVisPickDates:"请选择两个日期进行比较。", aiVisNeedsDated:"请在卫星模式中改用可选日期的提供者（MODIS／VIIRS／Sentinel-2）。", aiVisCapFail:"无法撷取地图影像。" 
,
      tabMonitors:"监控",
    
      ttlLayersPanel:"图层",
      ttlFavorite:"收藏",
    },
  /* ② the inline strings — every L(…) call site in js/*.js, keyed by its English text.
     1882 of them. A key left untranslated renders in English. */
  inline: {
    /* (#R372) the reload prompt raised by index.html — a redeploy seen from an already-open tab */
    "{n} lookups left today": "今日剩余解说 {n} 次",   /* #R491 */
    'A new version of IntMap is available. Reload to continue.': 'IntMap 有新版本可用。请重新加载以继续。',
    "AI-generated — verify anything important.": "由 AI 生成，重要信息请自行查证。",   /* #R491 */
    'An old cached version of IntMap loaded.': '加载的是缓存中的旧版 IntMap。',
    "Ask Atlas for more": "让 Atlas 详述",   /* #R491 */
    "Background": "背景",   /* #R491 */
    "Explain": "解说",   /* #R491 */
    "Explain \"{term}\" in more depth.": "请更详细地说明「{term}」。",   /* #R491 */
    "In this passage": "在此段落中的意思",   /* #R491 */
    "Looking it up…": "查询中…",   /* #R491 */
    "Meaning": "意思",   /* #R491 */
    "Name the phrase to explain.": "请指定要解说的字词。",   /* #R491 */
    "opened the term card": "已开启术语卡片",   /* #R491 */
    "Related": "相关词",   /* #R491 */
    'Reload': '重新加载',
    'Name a category': '请指定分类',
    'No such event category': '没有这个事件分类',
    'reported by 2+ independent outlets': '由 2 家以上独立媒体报道',
    'server-side clustering over the full 72-hour window': '在服务器端针对完整 72 小时窗口做的分群',
    "That is a passage, not a term — select a word or a phrase.": "这是一整段，不是词汇——请选取一个字词或片语。",   /* #R491 */
    'The events surface is not available': '目前无法使用事件列表',
    "The glossary card could not open.": "无法开启解说卡片。",   /* #R491 */
    "The lookup came back empty.": "未取得解说内容。",   /* #R491 */
    'with no location': '地点不明',
    'Business & Economy': '财经',
    'Latest article': '最新报道',
    'Follow-up': '后续报道',
    'matching events': '则符合的事件',
    /* (#R386) 出来事単位の News — js/news-events.js。この4言语は位置引数の5つ目より后なので、英语の原文を键にここで引く。 */
    '1 source': '1 家媒体',
    'Category decided by: {by}.': '分类的决定来源：{by}。',
    'Climate & Weather': '气候与天气',
    'Coverage': '报道媒体',
    'Disasters': '灾害',
    'Event category': '事件分类',
    'First': '首报',
    'First reported': '首次报道',
    'Grouped from published headlines by a deterministic rule (time, place, shared rare words) — not by an AI summary.': '依时间、地点与罕见词汇的决定性规则，从已发布的标题分群，而非由 AI 摘要。',
    'How this event was assembled': '这则事件如何组成',
    'Independent outlets are counted by ownership group, so syndicated copies of one story count once. Here: {a} articles, {b} independent.': '独立媒体以资本集团计算，同稿转载仅计一次。此处：{a} 篇报道、{b} 家独立媒体。',
    'IntMap does not judge which is right. These are the figures each outlet actually printed.': 'IntMap 不判断孰是孰非，这里呈现的是各家媒体实际刊出的数字。',
    'No location could be resolved for this event.': '无法判定这则事件的地点。',
    'Politics & Conflict': '政治与冲突',
    'Reviewed and locked by an operator.': '已由维运者确认并锁定。',
    'Same group': '同一集团',
    'Science & Health': '科学与健康',
    'Where outlets differ': '媒体之间的分歧',
    'amount': '金额',
    'injured': '受伤人数',
    'killed': '死亡人数',
    'missing': '失踪人数',
    'percentage': '百分比',
    '{a} articles · {b} independent outlets': '{a} 篇报道 · {b} 家独立媒体',
    '{n} sources': '{n} 家媒体',
    '{n}d ago': '{n} 天前',
    '{n}h ago': '{n} 小时前',
    '{n}m ago': '{n} 分前',
    /* (#R405) 出来事の中身（What happened / 主要な数字 / 最新记事 / 一致 / 発信元）— js/news-events.js。位置引数は5言语までなので、この4言语はここで引く。 */
    '{s} became the newest outlet to report this, {t}.': '{s} 是最新加入报道这则事件的媒体（{t}）。',
    'first appears in this report': '首次出现于这篇报道',
    'How this was written — the exact wording each sentence came from ({n})': '这段文字从何而来 — 每句话所依据的原文（{n} 则）',
    'In each outlet’s own words': '各家媒体的原文',
    'IntMap combined what these outlets published into the paragraph above. Every sentence was machine-checked against the wording shown here before it was saved; sentences that could not be checked are discarded, never shown.': '上面这段是 IntMap 将这些媒体所发布的内容整合而成。每一句在保存前都已由机器与此处显示的原文比对过；无法比对的句子一律舍弃，绝不显示。',
    'Key figures': '关键数字',
    'Only one outlet supplied article text for this event, so this is all IntMap can show without leaving the app.': '这则事件只有一家媒体提供内文，因此不离开 IntMap 就能读到的内容仅止于此。',
    'Read at {s} ↗': '在 {s} 阅读 ↗',
    'Read it at the source': '前往原始媒体阅读',
    'Sentences are quoted from what each outlet published. IntMap does not rewrite or paraphrase them.': '句子皆按各家媒体实际刊出的原文引用。IntMap 不会改写，也不会用自己的话重述。',
    'The outlets covering this event publish headline-only feeds, so IntMap has no article text to show. Open a report below to read it at the source.': '报道这则事件的媒体，其数据源只提供标题，因此 IntMap 没有内文可显示。请从下方的报道前往原始媒体阅读。',
    'The outlets covering this event supplied no usable article text — only headlines. IntMap does not invent the rest.': '报道这则事件的媒体并未提供可用的内文 — 只有标题。IntMap 不会编造其余内容。',
    'What happened': '发生了什么事',
    'What the latest report added': '最新报道补充了什么',
    'Where outlets agree': '媒体之间的共识',
    'Which outlet said what, in the order they published it.': '依发布的先后顺序，列出各家媒体各自写了什么。',
    "% of GDP": "占 GDP %",
    "By accession year": "依加入年份",
    "Carbon-dioxide emissions — the country total in megatonnes a year, or the same series divided by population; switch between the two in this legend.": "二氧化碳排放量 — 全国每年的总量（百万公吨），或同一组数据除以人口的每人排放量；可在此图例中切换。",
    "Chronos reaches back to {y}": "Chronos 可回溯到 {y} 年",
    "Coastlines": "海岸线",
    "Control IntMap’s unified time": "操作 IntMap 的统一时间",
    "Control the map’s time": "操作地图的时间",
    "EV": "票",
    "No popular vote — this state’s electors were appointed by its legislature.": "没有普选 — 这一州的选举人由州议会指派。",
    "No state-level return is recorded for this election.": "这次选举没有留下这一州的纪录。",
    "One colour": "单一颜色",
    "The record does not break this state’s electors down by candidate.": "纪录中没有把这一州的选举人依候选人分列。",
    "Time zones": "时区",
    "Total ($B)": "总额（十亿美元）",
    "Total votes cast": "总投票数",
    "Where the map is centred (standard time)": "地图中心所在地的标准时间",
    "Wind from the {d} — the arrow points the way it is blowing": "{d}风 — 箭头指向风吹去的方向",
    "You have used today’s free term lookups. Your Atlas questions are unaffected.": "今日的免费术语解说次数已用完。这不影响您向 Atlas 提问的次数。",   /* #R491 */
    "Your device": "设备时间",
    "Your setting": "你设置的时区",
    'Air pressure reduced to sea level — highs, lows and the storm centre.': "换算至海平面的气压——高压、低压与风暴中心。",
    'Air temperature 2 m above the ground.': "地面上方 2 米处的气温。",
    'Animate': "播放动画",
    'Convective available potential energy: how much lift a thunderstorm could draw on.': "对流可用位能：雷雨可以动用的上升能量。",
    'drag to move': "拖动可移动",
    'First step': "第一个时刻",
    'Fraction of the sky covered by cloud.': "天空被云覆盖的比例。",
    'Gusts': "阵风",
    'Latest frame': "最新影格",
    'Lines of equal sea-level pressure, labelled in hPa.': "海平面气压相等的等值线，标示单位为 hPa。",
    'Loading the wind model…': "正在加载风场模式…",
    'Next border change': "下一次国界变更",   /* (#R421) news-timeline.js */
    'Next frame': "下一影格",
    'no frames': "没有影格",
    'Oldest frame': "最旧的影格",
    'Particles': "粒子",   /* weather.js (#R313) */
    'Pressure (MSL)': "海平面气压",
    'Previous border change': "上一次国界变更",   /* (#R421) news-timeline.js */
    'Previous frame': "上一影格",
    'RainViewer radar — the last two hours, 10 min apart': "RainViewer 雷达——最近两小时，每 10 分钟一张",
    'run': "初始时刻",
    'Strongest gust expected in the hour ending at the valid time.': "至有效时刻为止的一小时内，预期最强的瞬间阵风。",
    'Temperature at which the air would saturate — the moisture field.': "空气达到饱和的温度——即水气场。",
    'Total precipitation forecast for the hour ending at the valid time.': "至有效时刻为止一小时的预测总降水量。",
    'Valid at': "有效时刻",
    'Wind direction arrows at 10 m, coloured by speed.': "高度 10 米的风向箭头，依风速上色。",
    'Wind particles': "风场粒子",   /* atlas-console.js (#R313) */
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
    /* routing.js */
    '← Exit workspace': "← 离开工作区",   /* workspace.js */
    '↻ Fly again': "↻ 再飞一次",   /* flight-sim.js */
    '↻ live': "↻ 实时",   /* cameras.js */
    '<1h ago': "1 小时内",   /* atlas-console.js */
    '−10y': "−10年",   /* news-timeline.js */
    '−5y': "−5年",   /* news-timeline.js */
    /* seismic.js */
    '⚠ Capped at 600 results — zoom into a sub-region for the rest': "⚠ 已限制为 600 笔结果 — 请放大到较小区域查看其余",   /* atlas-console.js */
    '⚠ Wikidata is community-maintained, so coverage is uneven: a company nobody has entered is simply absent, and «the largest» means «the largest Wikidata has a revenue for». An ownership graph is not a market-share or influence graph.': "⚠ Wikidata 由社区维护，因此涵盖程度并不平均：没有人建档的公司就是不存在于此，而「最大」的意思是「Wikidata 有营收数据者之中最大」。持股关系图不等于市占率或影响力图。",   /* industry-web.js */
    '✓ LANDED': "✓ 已降落",   /* flight-sim.js */
    '× CRASHED': "× 坠毁",   /* flight-sim.js */
    '⬡ = approximate extent (no official boundary exists — AI-traced outline)': "⬡＝概略范围（没有官方界线 — 由 AI 描绘）",   /* atlas-console.js */
    '⬡ = approximate extent (no official boundary exists)': "⬡＝概略范围（没有官方界线）",   /* atlas-console.js */
    '⬡ = approximate extent derived from web-verified boundary anchors (no official boundary exists for this region)': "⬡＝依据网络查证的边界锚点推得的概略范围（此区域没有官方界线）",   /* atlas-console.js */
    '📍 Current map view': "📍 目前地图画面",   /* flight-sim.js */
    '📍 Last flight end point': "📍 上次飞行终点",   /* flight-sim.js */
    '1 psi — windows shatter, light injuries': "1 psi — 玻璃破碎、轻伤",   /* atlas-sims.js */
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
    /* seismic.js */
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
    /* world-packs.js */
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
    'Approximate — 1916 empires (German, Austro-Hungarian, Ottoman, Russian, British) are shown on today’s borders. Romania & the US were still neutral in March 1916; both joined the Allies later (Aug 1916 / 1917).': "概略 — 1916 年的帝国（德意志、奥匈、奥斯曼、俄罗斯、大英）绘制在今日的国界上。1916 年 3 月时罗马尼亚与美国仍为中立，之后才加入协约国（1916 年 8 月／1917 年）。",   /* atlas-sims.js */
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
    'Arrivals are ray-traced through the IASP91 Earth model; surface waves use 3.5 / 4.4 km/s group velocity. Ground motion is the stochastic method (Brune source; trilinear geometrical spreading AND path duration after Atkinson & Boore 1995; frequency-dependent crustal Q = Q₀·f^η after Raoof, Herrmann & Malagnini 1999; κ = 0.035 s; and the Cartwright & Longuet-Higgins 1956 peak factor with its bandwidth term). A point source and a drawn rupture are the SAME finite source: a point stands for the rupture its magnitude implies (Wells & Coppersmith 1994, log₁₀ A = −3.49 + 0.91·M — 2,163 km² at M7.5), so the distance is to that footprint combined with the focal depth, and a drawn rupture uses its own outline instead (M₀ = μAD̄) with wavefronts that carry the rupture propagation (Vr = 0.75β). No pseudo-depth is added to either, so the two agree at the same magnitude. The site term varies with the real terrain: Vs30 from topographic slope (Wald & Allen 2007) in quarter-wavelength amplification, measured over the DEM\'s own sample spacing and skipped where that is coarser than 2 km; sea cells are not painted. MMI is converted with the ShakeMap relation of Worden et al. 2012 from PGV taken over the band a strong-motion record delivers it in (4-pole high-pass at 0.1 Hz), and is NOT the JMA shindo scale. The JMA shindo IS its own definition here (気象庁「計測震度の算出方法」): the period-effect, 10 Hz high-cut and 0.5 Hz low-cut filters applied to the acceleration spectrum, then the level exceeded for a total of 0.3 s, I = 2·log₁₀ a₀ + 0.94 — the three components isotropised at V/H = 2/3 rather than simulated separately. The painted field runs to the end of the lowest class of the chosen scale: within 1,500 km it follows the terrain, and beyond that one cell is wider than the landforms inside it, so the field is a function of distance alone and is drawn as such. Past 1,000 km the regional spreading law is extrapolated, the panel says how much of the field that is, and the table still declines to print an intensity there. Educational model: in a real emergency follow the official authorities.': "到达时刻以 IASP91 地球模型进行射线追踪；表面波采用 3.5／4.4 km/s 群速度。地动采用随机震源法（Brune 震源谱；三段折线几何衰减与路径延时（Atkinson & Boore 1995）；频率相依的地壳 Q = Q₀·f^η（Raoof, Herrmann & Malagnini 1999）；κ = 0.035 秒；以及含带宽项的 Cartwright & Longuet-Higgins 1956 峰值因子）。点震源与绘制的震源域视为同一个有限震源：点震源代表其规模所隐含的破裂面（Wells & Coppersmith 1994，log₁₀ A = −3.49 + 0.91·M，M7.5 时为 2,163 km²），距离即为到该面的距离与震源深度的合成；绘制震源域时则改用其自身轮廓（M₀ = μAD̄），波前并带有破裂传播（Vr = 0.75β）。两者都不另加等效深度，因此相同规模下两者一致。场址项随真实地形变化：以地形坡度推估 Vs30（Wald & Allen 2007）并代入四分之一波长放大法，坡度以 DEM 自身的采样间距量测，间距粗于 2 km 时不使用；海域不上色。MMI 以 Worden et al. 2012 的 ShakeMap 关系式由 PGV 换算，PGV 取自强震纪录实际可提供的频带（0.1 Hz 四阶高通），并非气象厅震度阶级。气象厅震度在此依其本身定义计算（気象庁「计测震度の算出方法」）：对加速度频谱施加周期效应、10 Hz 高切与 0.5 Hz 低切滤波，取合计超过 0.3 秒的加速度 a₀，I = 2·log₁₀ a₀ + 0.94；三分量以 V/H = 2/3 等向化处理，而非分别模拟。着色范围延伸到所选阶级最低一级的边界：1,500 km 以内依循地形，超出后单一格子已宽于其中的地形起伏，因此仅为距离的函数并如实绘制。超过 1,000 km 属于区域衰减式的外插，面板会标示其占比，表格则不列出震度。此为教育用模型：实际灾害时请遵从官方指示。",   /* seismic.js */
    'Arrive at destination': "抵达目的地",   /* routing.js */
    'Arrive by': "最晚抵达",   /* routing.js */
    /* data-layers.js */
    'article': "篇报道",   /* atlas-console.js */
    'Article': "报道",   /* atlas-console.js */
    'articles': "篇报道",   /* atlas-console.js */
    'articles → ': "篇报道 → ",   /* atlas-console.js */
    'articles from ': "篇报道，来源：",   /* atlas-console.js */
    'As of': "数据时间",   /* atlas-console.js */
    'Ashfall': "火山灰降落",   /* sims.js */
    /* atlas-console.js */
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
    /* seismic.js */
    /* routing.js */
    'Avoid:': "避开：",   /* routing.js */
    'avoids ': "避开 ",   /* routing.js */
    'Axial tilt': "转轴倾角",   /* space.js */
    'az.': "方位",   /* satellites-live.js */
    'Azimuth': "方位角",   /* satellite-detail.js sims.js */
    /* world-packs.js */
    'back about a quarter cycle (6 h)': "回退约四分之一周期（6小时）",   /* world-packs.js */
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
    /* terrain-water.js */
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
    'Bundled catalog': "内置目录",   /* satellites-live.js */
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
    /* viewshed.js */
    'Channel': "频道",   /* terrain-water.js */
    'Check other routes': "查看其他路线",   /* drone-nav.js */
    'checks run': "项检查",   /* atlas-console.js */
    'Chernobyl': "切尔诺贝利",   /* atlas-console.js */
    'Choose an earthquake…': "选择一次地震…",   /* seismic.js */
    /* routing.js */
    /* routing.js */
    'Circle': "圆形",   /* tool-panel.js */
    'circles': "个圆形",   /* atlas-console.js */
    /* atlas-console.js */
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
    /* viewshed.js */
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
    /* seismic.js */
    'Close': "关闭",   /* aircraft-detail.js map-tools.js map-ui.js */
    'Closed': "已关闭",   /* atlas-console.js */
    /* terrain-water.js */
    'Closest approach': "最接近",   /* drone-nav.js */
    'coasts in view · level now, and the next turn': "视野内的海岸・现在的姿态与下一个转弯",   /* world-packs.js */
    'COCKPIT': "座舱",   /* flight-sim.js */
    'cold': "寒流",   /* ocean-currents.js */
    /* data-layers.js */
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
    'Several controls match': '多个控制项符合',   /* atlas-controls.js (#R320) */
    'Controlling obstacle': "关键障碍物",   /* viewshed.js */
    'Controls': "操作",   /* flight-sim.js */
    'Coordinate grid': "坐标格线",   /* keyboard-shortcuts.js */
    'Coordinates': "坐标",   /* aircraft-detail.js */
    'Copied': "已复制",   /* atlas-reply.js */
    'Copied!': "已复制！",   /* map-ui.js */
    'Copy': "复制",   /* atlas-console.js atlas-reply.js map-ui.js */
    'Copy name': "复制地名",   /* map-ui.js */
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
    /* atlas-console.js */
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
    /* atlas-console.js */
    'Could not reach the USGS feed.': "无法连接到 USGS 数据源。",   /* seismic.js */
    'Could not read enough terrain here.': "此处无法读取足够的地形数据。",   /* sims.js */
    'Could not research this right now': "目前无法进行这项研究",   /* atlas-console.js */
    /* atlas-console.js */
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
    /* terrain-water.js */
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
    /* terrain-water.js */
    'Details': "详细数据",   /* space.js stats-compare.js */
    'Diameter': "直径",   /* space.js */
    'Differences': "差异",   /* routing.js */
    'diffraction loss': "绕射损失",   /* viewshed.js */
    'Directions': "路线指引",   /* routing.js */
    'Dirty bomb': "脏弹",   /* atlas-console.js */
    /* atlas-console.js sims.js */
    /* terrain-water.js */
    'dispersion': "扩散",   /* atlas-console.js */
    'displayed-layer values': "显示图层数值",   /* atlas-console.js */
    'Distance': "距离",   /* viewshed.js */
    'DISTANCE': "距离",   /* flight-sim.js */
    /* seismic.js */
    'Domain': "计算范围",   /* tsunami.js */
    'Donate': "赞助",   /* atlas-console.js */
    'Done': "完成",   /* map-tools.js */
    'Done — use Redraw to start over': "完成 — 可按「重画」重新开始",   /* map-tools.js */
    'Done.': "完成。",   /* atlas-console.js */
    'Doppler factor': "都卜勒因子",   /* satellite-detail.js */
    'DOWN': "下",   /* flight-sim.js */
    'downrange': "射程方向",   /* atlas-sims.js */
    'Downstream': "下游",   /* terrain-water.js */
    /* sims.js */
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
    "Drawn from real first-level administrative boundaries (the bundled Natural Earth index)": "依实际的一级行政界线绘制（内置 Natural Earth 索引）",   /* (#R489) */
    "No boundary could be resolved for": "无法解析出界线",   /* (#R489) */
    "No boundary resolved": "界线未解析",   /* (#R489) */
    "None of those identifiers could be matched to a boundary in the data IntMap holds — the places may well exist": "这些识别码都无法对应到 IntMap 持有的界线数据——地点本身可能确实存在",   /* (#R489) */
    "source": "来源",   /* (#R489) */
    'Drawn from real OpenStreetMap boundary data': "依据 OpenStreetMap 的实际界线数据绘制",   /* atlas-console.js */
    'Drawn from the real administrative boundaries of the region\'s member units': "依据该区域各成员单位的实际行政界线绘制",   /* atlas-console.js */
    'Drive': "开车",   /* map-tools.js routing.js */
    'Drone navigation': "无人机航线规划",   /* drone-nav.js */
    'Drone planner open': "已开启无人机规划器",   /* atlas-console.js */
    'Drone planner unavailable': "无人机规划器无法使用",   /* atlas-console.js */
    'due now': "现已到期",   /* monitors.js */
    'Duration': "持续时间",   /* satellite-detail.js */
    'each indicator’s value for this year, by its own source': "各指标当年的数值，依其各自来源",   /* stats-compare.js */
    /* seismic.js */
    'earth horizon': "地球地平线",   /* viewshed.js */
    'Earth Replay': "地球回放",   /* atlas-console.js sims.js */
    'earthquakes': "地震",   /* atlas-console.js */
    'Earthquakes': "地震",   /* monitors.js */
    'Earthquakes (7 days, in radius)': "地震（7 天内，半径范围）",   /* atlas-console.js */
    'Earthquakes near the route (last 24 h)': "路线附近的地震（过去 24 小时）",   /* routing.js */
    'east': "东",   /* atlas-console.js */
    'Eccentricity': "离心率",   /* satellite-detail.js space.js */
    'Economy': "经济",   /* countries-ui.js */
    /* sims.js */
    'elapsed': "已经过",   /* terrain-water.js */
    'Electricity': "电力",   /* world-packs.js */
    'elev.': "海拔",   /* satellites-live.js */
    'elevation': "高程",   /* atlas-console.js */
    'Elevation': "高程",   /* routing.js satellite-detail.js */
    'elevation (no place given)': "高程（未指定地点）",   /* atlas-console.js */
    'elevation from the map center': "由地图中心起算的高程",   /* atlas-console.js */
    'Elevation sampled live on a grid from the Copernicus DEM (Open-Meteo) — cells are graduated by depth/height.': "高程由 Copernicus DEM（Open-Meteo）实时采样成网格 — 各格依深度／高度分级。",   /* atlas-console.js */
    'elevation shading': "高程着色",   /* atlas-console.js */
    'Elevation tiles did not arrive — uniform site class, so the field is distance alone': "高程瓦片未送达 — 使用单一场址分类，因此震度仅是距离的函数",   /* seismic.js */
    'Elongation': "距角",   /* space.js */
    'Emergency warning': "紧急警报",   /* world-packs.js */
    'Emergency: ': "紧急：",   /* aircraft-detail.js */
    'Emission': "排放",   /* atlas-console.js */
    'Emitter category': "发射体类别",   /* aircraft-detail.js */
    'Employees': "员工人数",   /* industry-web.js */
    'end': "结束",   /* stats-compare.js */
    'Energy data could not be fetched.': "无法取得能源数据。",   /* world-packs.js */
    'Energy mix': "能源结构",   /* world-packs.js */
    /* routing.js */
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
    /* routing.js */
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
    /* terrain-water.js */
    'Flow stops here': "水流在此停止",   /* terrain-water.js */
    /* terrain-water.js */
    'Fly from these conditions': "以这些条件起飞",   /* aircraft-detail.js */
    'Fly to': "飞往",   /* map-tools.js */
    'Focus place search': "聚焦地点搜索",   /* keyboard-shortcuts.js */
    'FOLLOW': "追随",   /* flight-sim.js */
    'Follow terrain': "贴合地形",   /* drone-nav.js */
    'Follow the app clock — the sky as it is right now': "跟随应用时钟 — 呈现此刻的天空",   /* space.js */
    'Follows the real road network (Valhalla / OpenStreetMap) — not a distance circle.': "依循真实道路网（Valhalla／OpenStreetMap）— 不是距离圆。",   /* map-tools.js */
    'Footprint finished — map clicks no longer add points.': "范围已完成 — 点击地图不会再加入点。",   /* tool-panel.js */
    'Footprint radius': "覆盖半径",   /* satellite-detail.js */
    'For reference: natural background ≈ 2–3 mSv/yr; Japan\'s Fukushima evacuation criterion was 20 mSv/yr; Chernobyl\'s permanent-exclusion zone ≥1480 kBq/m².': "参考值：天然背景辐射约 2–3 mSv/年；日本福岛的避难基准为 20 mSv/年；切尔诺贝利永久禁区为 ≥1480 kBq/m²。",   /* atlas-console.js */
    'Former state': "前身国家",   /* countries-ui.js */
    'Framed the area on the map': "已在地图上框出该区域",   /* atlas-console.js */
    'Freehand': "手绘",   /* tool-panel.js */
    'Frequency (MHz)': "频率（MHz）",   /* sims.js viewshed.js */
    'Fresnel': "菲涅耳",   /* viewshed.js */
    'Fresnel zone obstructed': "菲涅耳区受阻",   /* viewshed.js */
    'from': "自",   /* tool-panel.js */
    'from bundled reference data': "取自内置参考数据",   /* stats-compare.js */
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
    /* sims.js */
    'G-LIMIT': "G 限制",   /* flight-sim.js */
    'Galaxies & nebulae': "星系与星云",   /* space.js */
    'Galaxies, clusters and nebulae at their measured distances (SIMBAD)': "星系、星团与星云，依其实测距离配置（SIMBAD）",   /* space.js */
    'Galileo': "伽利略",   /* satellites-live.js */
    'Gamepad connected: ': "已连接游戏手把：",   /* flight-sim.js */
    'gap filled from the other source / bundled reference': "缺口由另一来源／内置参考数据补齐",   /* stats-compare.js */
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
    /* world-packs.js */
    'Globe': "地球仪",   /* atlas-console.js workspace.js */
    'Globe / flat / 3D terrain': "地球仪／平面／3D 地形",   /* keyboard-shortcuts.js */
    'Gold': "黄金",   /* map-ui.js */
    'Good': "良好",   /* widgets.js */
    'GPS': "GPS",   /* satellites-live.js */
    'Grass': "草地",   /* drone-ops.js */
    'Gray = terrain (curvature applied) · dashed = 60% Fresnel zone.': "灰色＝地形（已计入曲率）・虚线＝60% 菲涅耳区。",   /* viewshed.js */
    'green = terrain shadow': "绿色＝地形阴影",   /* viewshed.js */
    /* world-packs.js */
    'Grid': "格线",   /* atlas-console.js tsunami.js */
    'Grid + labels': "格线＋标注",   /* workspace.js */
    'Ground (no-DEM fallback)': "地盘（无 DEM 时的替代值）",   /* seismic.js */
    'Ground at the site': "地点所在地面",   /* viewshed.js */
    'Ground below': "下方地面",   /* tool-panel.js */
    'Ground distance': "地面距离",   /* drone-nav.js */
    'Ground range': "地面射程",   /* atlas-console.js */
    'Ground speed': "地速",   /* aircraft-detail.js */
    'Ground station height': "地面站高度",   /* drone-nav.js */
    /* atlas-console.js */
    'h': "小时",   /* space.js terrain-water.js */
    'h ago': "小时前",   /* atlas-console.js */
    'Hard — ': "重落地 — ",   /* flight-sim.js */
    'hard rock (Vs30 1500)': "硬岩（Vs30 1500）",   /* seismic.js */
    'Hazardous': "危险",   /* widgets.js */
    'Heading (true / mag)': "航向（真／磁）",   /* aircraft-detail.js */
    /* terrain-water.js */
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
    /* drone-nav.js satellite-detail.js */
    'highest ridge': "最高棱线",   /* sims.js */
    'Highlighted countries': "已标示的国家",   /* atlas-console.js */
    'highlights': "标示",   /* atlas-console.js */
    'Highlights cleared': "已清除标示",   /* atlas-console.js */
    'Highly elliptical (HEO)': "高椭圆轨道（HEO）",   /* satellite-detail.js */
    'highways': "公路",   /* routing.js */
    'Highways': "公路",   /* routing.js */
    'historical map': "历史地图",   /* atlas-console.js */
    /* routing.js */
    'Historical overview from established sources — borders and figures are approximate.': "依据既有数据来源的历史概观 — 边界与数字皆为概略。",   /* atlas-console.js */
    'horizon': "地平线",   /* night-sky.js */
    'horizon scanned to': "地平线扫描至",   /* sims.js */
    'horizon: measured from the DEM': "地平线：由 DEM 实测",   /* night-sky.js */
    'horizon: NOT measured — ': "地平线：未实测 — ",   /* night-sky.js */
    'Hourly': "每小时",   /* monitors.js */
    'How often': "频率",   /* monitors.js */
    'Humidity': "湿度",   /* weather.js */
    'Identity': "识别",   /* aircraft-detail.js */
    /* seismic.js */
    'IMF unavailable — World Bank used': "IMF 数据无法取得 — 改用世界银行",   /* stats-compare.js */
    'impact': "冲击",   /* atlas-sims.js */
    'impact analysis within ': "冲击分析范围 ",   /* atlas-console.js */
    'Impact velocity (after drag)': "撞击速度（计入阻力后）",   /* atlas-console.js */
    'imports': "进口",   /* world-packs.js */
    'Imports': "进口",   /* world-packs.js */
    'in ': "于 ",   /* atlas-console.js space.js */
    'in eclipse': "进入食",   /* atlas-console.js satellites-live.js */
    'In eclipse': "进入食",   /* satellite-detail.js */
    'in-window verified events': "时间范围内已查证的事件",   /* atlas-console.js */
    'incl.': "含",   /* satellites-live.js */
    'Inclination': "轨道倾角",   /* satellite-detail.js space.js */
    'Includes: position, zoom, projection, base map, every active layer, time-travel & compare state.': "包含：位置、缩放、投影、底图、所有启用的图层、时光机与比较状态。",   /* map-ui.js */
    'Indicated airspeed': "指示空速",   /* aircraft-detail.js */
    'Indicators': "指标",   /* stats-compare.js */
    'Industry': "产业",   /* industry-web.js */
    'Industry web': "产业关系网",   /* industry-web.js */
    /* terrain-water.js */
    /* atlas-console.js */
    /* seismic.js */
    /* seismic.js */
    'Intensity fill opacity': "震度着色不透明度",   /* seismic.js */
    'Intensity scale': "震度阶级",   /* seismic.js */
    'Intercity Japan rail: real Shinkansen lines and stations, with times estimated from the operators’ published timetables (express pattern + service frequency) — not live times. Local segments use open GTFS (Transitous) where available; where none exists (e.g. Nagoya) they are distance-based estimates, marked as such. The line between stations is schematic.': "日本城际铁路：真实的新干线路线与车站，时间依营运者公布的时刻表推估（快车模式＋班次密度）— 并非实时时刻。地方路段在有开放 GTFS（Transitous）时采用之；没有的地方（例如名古屋）则以距离推估并标示。站与站之间的连接为示意线。",   /* atlas-console.js */
    'International designator': "国际识别码",   /* satellite-detail.js */
    'Interplanetary spacecraft, from JPL Horizons trajectories': "行星际探测器，依 JPL Horizons 轨迹",   /* space.js */
    /* atlas-console.js */
    /* sims.js */
    'Invalid area': "范围无效",   /* monitors.js */
    'isolate': "单独显示",   /* atlas-console.js */
    'Isolate': "单独显示",   /* atlas-console.js */
    'Isolate off': "关闭单独显示",   /* atlas-console.js */
    'Isotope': "同位素",   /* atlas-console.js */
    'items': "项",   /* monitors.js */
    'Jan': "1月",   /* ocean-currents.js */
    /* world-packs.js */
    /* world-packs.js */
    /* world-packs.js */
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
    'Lagrangian particle model on LIVE Open-Meteo wind/temperature/precipitation (or the ERA5 archive for a past date): advection + stability-scaled turbulent diffusion + wet & dry deposition + radioactive decay. The source term (Bq), emission duration, isotope half-life and start time are yours to set; the colored ground zones are the final deposition classified by the real Chernobyl Cs-137 thresholds, and the dose figures assume a Cs-137 ground-shine conversion. EDUCATIONAL approximation, NOT an operational forecast — in a real emergency follow official authorities (SPEEDI / IAEA / local government).': "以实时 Open-Meteo 风场／气温／降水（或过去日期的 ERA5 文件）驱动的拉格朗日粒子模型：平流＋依稳定度调整的紊流扩散＋湿沉降与干沉降＋放射性衰变。源项（Bq）、排放持续时间、同位素半衰期与起始时刻皆可自行设置；地面彩色分区为最终沉降量，依切尔诺贝利实际的铯-137 门槛分级，剂量数字则假设铯-137 地面辐射的换算。此为教育性近似，并非作业预报 — 实际灾害时请遵从官方指示（SPEEDI／IAEA／地方政府）。",   /* atlas-console.js */
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
    /* world-packs.js */
    'line-of-sight breaks': "视线中断",   /* atlas-console.js */
    /* sims.js */
    'line-of-sight service area over real terrain. Set antenna height / power / frequency in the panel; click to move the mast.': "依真实地形计算的视线服务范围。可在面板中设置天线高度／功率／频率；点击即可移动天线位置。",   /* atlas-console.js */
    'link margin': "链路余裕",   /* atlas-console.js */
    'Link margin': "链路余裕",   /* drone-nav.js */
    'Link to a point…': "链接到某个点…",   /* viewshed.js */
    'live': "实时",   /* night-sky.js space.js */
    'Live': "实时",   /* space.js world-packs.js */
    /* weather.js */
    /* news-timeline.js */
    'Live APIs: not probed': "实时 API：未检测",   /* atlas-console.js */
    'Live cameras': "实时摄影机",   /* cameras.js */
    'Live info': "实时信息",   /* tool-panel.js */
    'Live satellites off': "已关闭实时卫星",   /* atlas-console.js */
    'Live satellites on': "已开启实时卫星",   /* atlas-console.js */
    'live web news': "实时网络新闻",   /* atlas-console.js */
    '{n} source(s) did not answer within {s}s': "{n} 个来源未在 {s} 秒内回应",   /* atlas-console.js */
    'live web search': "实时网络搜索",   /* atlas-console.js */
    'live web verification': "实时网络查证",   /* atlas-console.js */
    'Live web verification did not complete for this time-sensitive question, so this is a PROVISIONAL assessment based mainly on already-gathered headlines — treat items as leads, not confirmed direct evidence.': "这个具时效性的问题未能完成实时网络查证，因此以下是主要依据既有标题的暂定判断 — 请视为线索，而非已确认的直接证据。",   /* atlas-console.js */
    'LOAD': "加载",   /* flight-sim.js */
    /* seismic.js */
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
    /* atlas-console.js */
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
    /* sims.js */
    /* routing.js */
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
    'Module/method not found': "找不到模块或方法",   /* atlas-controls.js */
    'Monitor created': "已建立监看",   /* atlas-console.js */
    'Monitor created.': "已建立监看。",   /* monitors.js */
    'Monitor not found.': "找不到监看。",   /* monitors.js */
    'Monitor ran: ': "监看已执行：",   /* monitors.js */
    'Monitors': "监看",   /* workspace.js */
    /* atlas-console.js */
    'month': "月",   /* space.js */
    'Moon': "月球",   /* night-sky.js */
    'Moons': "卫星（天然）",   /* space.js */
    'more (all are drawn on the map)': "个以上（地图上都已绘出）",   /* world-packs.js */
    'move here<br>= map syncs': "移到这里<br>＝地图同步",   /* street-view.js */
    'Move the cursor to trace → click to finish': "移动光标描绘 → 点击完成",   /* map-tools.js */
    'Moved to': "已移动至",   /* atlas-console.js */
    'Moving the working area here…': "正在把工作范围移到这里…",   /* terrain-water.js */
    'my location': "我的位置",   /* atlas-console.js atlas-geo-resolve.js */
    /* sims.js */
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
    /* sims.js */
    'News / Info / Countries / Community tab': "新闻／信息／国家／社区分页",   /* keyboard-shortcuts.js */
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
    /* world-packs.js */
    'no data': "无数据",   /* world-packs.js */
    'No data': "无数据",   /* stats-compare.js */
    'No data for this country and year.': "此国家在该年份没有数据。",   /* world-packs.js */
    'No data for this country.': "此国家没有数据。",   /* world-packs.js */
    'no data for this metric': "此指标没有数据",   /* atlas-console.js */
    'no DEM': "无 DEM",   /* seismic.js */
    /* routing.js */
    /* terrain-water.js */
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
    /* atlas-console.js */
    'No monitors yet. Set a radius, draw an area, or resolve a region, then create a monitor to watch it for changes.': "尚无监看。请先设置半径、画出范围或指定地区，再建立监看以追踪其变化。",   /* monitors.js */
    'No objects on the map.': "地图上没有对象。",   /* atlas-console.js */
    'No objects yet. Drop a pin, draw, add a radius, upload GeoJSON, or make a route — they all show up here to manage in one place.': "尚无对象。放置图钉、绘图、加入半径、上传 GeoJSON 或建立路线 — 全都会出现在这里统一管理。",   /* map-tools.js */
    'No opacity control: ': "没有不透明度控制：",   /* atlas-console.js */
    'No other saved route to check against — save a second route first.': "没有其他已保存的路线可比对 — 请先保存第二条路线。",   /* drone-nav.js */
    'No overlapping data to correlate': "没有可供相关分析的重叠数据",   /* atlas-console.js */
    'No photo of this airframe is available.': "没有这架机体的照片。",   /* aircraft-detail.js */
    'No populated cities/towns within the radius (per OSM population tags)': "半径内没有有人居住的城镇（依 OSM 人口标记）",   /* atlas-console.js */
    'No precise boundary for': "没有精确界线：",   /* atlas-console.js */
    /* routing.js */
    'No public-transit route here — the area may have no open transit data yet. Try 🚗 or 🚶 above.': "此处没有大众运输路线 — 该地区可能还没有开放的运输数据。请改用上方的 🚗 或 🚶。",   /* atlas-console.js */
    'no published revenue': "未公布营收",   /* industry-web.js */
    'No rail reachable here in that time (or the rail-data service is busy). Try a point nearer a station, or 🚗/🚶.': "在该时间内铁路无法到达此处（或铁路数据服务忙碌）。请改选靠近车站的地点，或使用 🚗／🚶。",   /* atlas-console.js */
    'No readable data on the active layers here. Turn a data layer on first.': "此处启用中的图层没有可读取的数据。请先开启一个数据图层。",   /* atlas-console.js */
    /* routing.js */
    'No route found (no road connection between these points).': "找不到路线（这两点之间没有道路连通）。",   /* atlas-console.js */
    'No route to adjust': "没有可调整的路线",   /* atlas-console.js */
    'No route to check': "没有可检查的路线",   /* atlas-console.js */
    'No route to return from': "没有可回程的路线",   /* atlas-console.js */
    'No route yet': "尚无路线",   /* atlas-console.js */
    'No runs yet.': "尚未执行过。",   /* monitors.js */
    'No satellite matching': "没有符合的卫星",   /* atlas-console.js */
    'No Street View coverage here': "此处没有街景涵盖",   /* street-view.js */
    /* sims.js */
    /* sims.js */
    'No tide model at this point (inland or outside the model domain).': "此点没有潮汐模型（位于内陆或模型范围之外）。",   /* world-packs.js */
    'No time-series available': "没有时间序列可用",   /* stats-compare.js */
    'No tributaries returned by OpenStreetMap here': "OpenStreetMap 在此处没有回传任何支流",   /* atlas-console.js */
    'no wave in this run': "本次模拟没有产生波浪",   /* tsunami.js */
    /* data-layers.js */
    'None': "无",   /* monitors.js */
    'none — everything is held': "无 — 全部保留",   /* terrain-water.js */
    'None (default feeds only)': "无（仅默认数据源）",   /* news-sources.js */
    'none (k=1)': "无（k=1）",   /* viewshed.js */
    'none in area': "区域内没有",   /* atlas-console.js */
    /* atlas-console.js */
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
    /* atlas-console.js */
    /* world-packs.js */
    /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    'Areas the agency published but this map could not place: ': "机关已发布但本地图无法定位的区域：",   /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    'Extending the model to here…': "正在把模型延伸到这里…",   /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    /* world-packs.js (#R271) */
    /* industry-web.js */
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
    /* world-packs.js */
    'on about a quarter cycle (6 h)': "前进约四分之一周期（6小时）",   /* world-packs.js */
    'Worldwide': "全球",   /* world-packs.js */
    'on the ground': "在地面",   /* aircraft-detail.js */
    'on the ground — released just above the field, flying': "在地面 — 于场区上空稍高处释放，飞行中",   /* aircraft-detail.js */
    'on the line': "在在线",   /* analysis-panels.js */
    'on the map': "在地图上",   /* atlas-console.js */
    'On the runway': "在跑道上",   /* flight-sim.js */
    'on time': "准点",   /* atlas-console.js */
    'on your left': "在你的左侧",   /* routing.js */
    'on your right': "在你的右侧",   /* routing.js */
    /* atlas-console.js */
    /* sims.js */
    'One shot': "单次",   /* terrain-water.js */
    'Only images and text-based files can be attached': "只能附加图片与纯文字类文件",   /* atlas-console.js */
    'Only one route was returned — there is nothing to compare.': "只回传了一条路线 — 没有可比较的对象。",   /* routing.js */
    'Only the first 10 countries are compared': "只比较前 10 个国家",   /* atlas-console.js */
    'opacity': "不透明度",   /* atlas-console.js */
    'Opacity': "不透明度",   /* atlas-console.js tsunami.js */
    'open horizon': "开阔地平线",   /* atlas-console.js */
    'open horizon would give': "开阔地平线可达",   /* sims.js */
    'Open in Google Maps': "在 Google 地图开启",   /* street-view.js */
    /* atlas-console.js */
    /* atlas-console.js */
    'Open the tsunami simulator': "开启海啸模拟器",   /* seismic.js */
    /* ⚠ (#R354) THE ONLY CALL SITE IS A DATE, NOT AN EVENT. The `/* atlas-console.js *␘/` this row
       used to name is gone; the one live `L('Opened',…)` in js/ is js/company-facilities.js's
       facility card, where the value beside it is the year the site OPENED (开设 / Eröffnet /
       Apertura). 「已开启」 reads «has been switched on» and was the label of a plant's opening
       year in both Chinese locales. */
    'Opened': "启用",   /* company-facilities.js */
    /* sims.js */
    /* sims.js */
    'OpenStreetMap could not be reached.': "无法连接到 OpenStreetMap。",   /* routing.js */
    'Operations': "作业",   /* drone-nav.js */
    'Operator': "营运者",   /* space.js */
    'optical 1.13': "光学 1.13",   /* viewshed.js */
    'Optimized order': "优化顺序",   /* atlas-console.js */
    'option not found': "找不到该选项",   /* atlas-controls.js */
    'options — tap one to show it on the map': "个选项 — 点一个即可显示在地图上",   /* atlas-console.js */
    'or': "或",   /* keyboard-shortcuts.js */
    'or type your own answer…': "或自行输入答案…",   /* atlas-console.js */
    /* world-packs.js */
    'Orbit class': "轨道类别",   /* satellite-detail.js */
    'Orbital period': "轨道周期",   /* space.js */
    'Orbits': "轨道",   /* space.js */
    'Ordered shortest-first (nearest-neighbor + 2-opt), then driven on the OSM road network (OSRM). The first stop is fixed as the start.': "以最短优先排序（最近邻＋2-opt），再依 OSM 道路网（OSRM）行驶。第一个停靠点固定为起点。",   /* atlas-console.js */
    'Ordered shortest-first (nearest-neighbor + 2-opt). Road routing is busy — the optimized ORDER is shown; try again for the drawn route.': "以最短优先排序（最近邻＋2-opt）。道路路径服务忙碌 — 仅显示优化后的顺序；请稍后再试以取得实际路线。",   /* atlas-console.js */
    /* news-timeline.js */
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
    /* world-packs.js */
    "A published cloud region or campus. The point is the location the operator publishes (a city or county), not a surveyed building; fields the operator does not publish are left out rather than estimated.": "已公布的云端区域或园区。点位是营运者公布的地点（城市或郡），并非实测建物；营运者未公布的字段一律略过，不做估算。",   /* datacenters.js */
    "AI compute": "AI 运算",   /* datacenters.js */
    "AI compute campus": "AI 运算园区",   /* datacenters.js */
  "All areas in force in this country": "此国家所有生效中的区域",   /* (#R275) */
    "Cloud region": "云端区域",   /* datacenters.js */
    "Colocation": "主机代管",   /* datacenters.js */
    "Colocation / carrier hotel": "主机代管／电信汇集点",   /* datacenters.js */
    "Country": "国家",   /* datacenters.js */
    "Data center": "数据中心",   /* datacenters.js */
  "Educational — follow the official authorities.": "仅供参考——请以官方机构发布为准。",   /* world-packs.js (#R293) */
  "IntMap read": "IntMap 取得",   /* world-packs.js (#R293) */
  "issued": "发布",   /* world-packs.js (#R293) */
  "Not covered, or not read yet (diagonal hatching)": "未支持或尚未取得（斜线）",   /* world-packs.js (#R293) */
  "Educational display — follow the official authorities.": "仅供参考，请以官方机关发布为准。",   /* (#R275) */
    "HPC / research computing": "HPC／研究运算",   /* datacenters.js */
    "In service": "启用时间",   /* datacenters.js */
    "IT capacity": "IT 容量",   /* datacenters.js */
  "IntMap is not connected to this country’s warning service, so it is saying nothing about this point — not that nothing is in force.": "IntMap 未连接此国家的警报机关，因此对此地点不作任何陈述——并非表示没有发布警报。",   /* (#R275) */
  "National services via the WMO register": "各国气象机关（经 WMO 登录）",   /* (#R275) */
  "No country here.": "此处没有国家。",   /* (#R275) */
  "Not read yet": "尚未取得",   /* (#R275) */
  "Nothing in force at this point.": "此地点没有生效中的警报。",   /* (#R275) */
    "Operator’s own page": "营运者官方页面",   /* datacenters.js */
    "OSM object": "OSM 对象",   /* datacenters.js */
    "Other (OpenStreetMap)": "其他（OpenStreetMap）",   /* datacenters.js */
    "Power": "电力",   /* datacenters.js */
    "Published cloud regions, AI campuses, carrier hotels and TOP500 sites, plus every data centre mapped in OpenStreetMap for the current view (zoom in past z6). Click any point for the full record.": "已公布的云端区域、AI 园区、电信汇集点与 TOP500 设施，加上目前视野内 OpenStreetMap 上所有的数据中心（z6 以上）。点击任一点位可看完整数据。",   /* datacenters.js */
    "Region code": "区域代码",   /* datacenters.js */
    "Supercomputing": "超级电脑",   /* datacenters.js */
    "Surveyed in OpenStreetMap. Every field above comes from that object’s own tags; nothing is inferred.": "OpenStreetMap 的实测数据。以上字段皆为该对象自身的标签，未做任何推论。",   /* datacenters.js */
    'Partners shown': "显示的伙伴",   /* world-packs.js */
    'Pass in progress': "通过中",   /* satellite-detail.js */
    'past 30 days': "过去 30 天",   /* monitors.js */
    'Path length (3-D)': "路径长度（立体）",   /* drone-nav.js */
    'Pause': "暂停",   /* monitors.js terrain-water.js */
    'PAUSE': "暂停",   /* flight-sim.js */
    'paused': "已暂停",   /* space.js */
    'Paused': "已暂停",   /* atlas-console.js monitors.js */
    'PAUSED': "已暂停",   /* flight-sim.js */
    /* widgets.js */
    'Peak coastal height (Green’s law)': "沿岸最大波高（格林定律）",   /* tsunami.js */
    'Peak deposition': "最大沉降量",   /* atlas-console.js */
    /* sims.js */
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
    /* routing.js */
    /* atlas-console.js */
    'Pin': "图钉",   /* atlas-console.js map-tools.js */
    'pins': "个图钉",   /* atlas-console.js */
    'Pins': "图钉",   /* map-tools.js */
    'Pitch': "俯仰",   /* app-body.js */
    'Place': "地点",   /* seismic.js */
    /* seismic.js */
    'Place an epicenter to begin.': "请先放置震央。",   /* seismic.js */
    /* sims.js */
    'Place labels': "地点标注",   /* atlas-console.js */
    'Place names': "地名",   /* space.js */
    'Place names are drawn on a body — open one from the list': "地名是画在天体上的 — 请从列表开启一个天体",   /* space.js */
    'Place not found': "找不到地点",   /* atlas-console.js */
    /* sims.js */
    'Place water to see where it goes.': "倒下水量即可看到水往哪里流。",   /* terrain-water.js */
    'Plate code': "板块代码",   /* layer-packs.js */
    'playable now': "现在可玩",   /* tsunami.js */
    'Playground unavailable': "游乐场无法使用",   /* atlas-console.js */
    'Please set an area to monitor first (radius, drawn area, region, or the current map view).': "请先设置要监看的区域（半径、绘制范围、地区或目前地图画面）。",   /* monitors.js */
    'Please wait a moment before running again.': "请稍候再重新执行。",   /* monitors.js */
    /* sims.js */
    'plume reach': "烟流范围",   /* atlas-console.js */
    /* sims.js */
    'Pluto is drawn in its measured color: no global surface map is bundled for it, and the ones offered for the dwarf planets elsewhere are labeled fictional by their author. Its position and its IAU names are real.': "冥王星以其实测颜色绘制：本应用没有内置它的全球表面图，而其他矮行星可取得的贴图被作者标示为虚构。它的位置与 IAU 命名则是真实的。",   /* space.js */
    'points': "分",   /* widget-defs-data.js */
    'points mapped — click a pin (or an item below) for the summary & article': "个点已标绘 — 点击图钉（或下方项目）可看摘要与报道",   /* atlas-console.js */
    'Polar low Earth orbit': "极地低地球轨道",   /* satellite-detail.js */
    'Polar night': "极夜",   /* widgets.js */
    'Politics & defense': "政治与国防",   /* countries-ui.js */
    'Polygon': "多边形",   /* map-tools.js tool-panel.js */
    'Polygon drawn': "已绘制多边形",   /* atlas-console.js */
    'Polygons': "多边形",   /* map-tools.js */
    'ponded': "积水",   /* atlas-console.js */
    'Ponded': "已积水",   /* terrain-water.js */
    /* terrain-water.js */
    'pop ': "人口 ",   /* atlas-console.js */
    'population': "人口",   /* countries-ui.js */
    'Population inside the circle(s): ': "圆形范围内的人口：",   /* atlas-console.js */
    'Population lookup failed (WorldPop busy) — try again.': "人口查询失败（WorldPop 忙碌）— 请再试一次。",   /* atlas-console.js */
    'Population nearby': "附近人口",   /* atlas-console.js */
    'population: ': "人口：",   /* atlas-console.js */
    'Position': "位置",   /* aircraft-detail.js */
    'Positions: JPL approximate elements (3000 BC – 3000 AD); the Moon: truncated ELP-2000/82. Surfaces: Solar System Scope textures (CC BY 4.0) from NASA/JPL/USGS imagery — except the Earth, which is the app’s own whole-Earth basemap (NASA Blue Marble via GIBS), the same picture the map draws under its satellite tiles. Names: USGS Gazetteer of Planetary Nomenclature (IAU). Stars: Hipparcos. Satellites other than the Moon are not modeled — their phase cannot be computed faithfully from published elements alone.': "位置：JPL 近似轨道要素（公元前 3000 年 – 公元 3000 年）；月球采截断的 ELP-2000/82。表面：Solar System Scope 贴图（CC BY 4.0），源自 NASA／JPL／USGS 影像 — 地球除外，地球使用本应用自有的全球底图（NASA Blue Marble，经 GIBS），与地图在卫星瓦片下所绘的是同一张。名称：USGS 行星地名录（IAU）。恒星：Hipparcos。月球以外的卫星未建模 — 仅凭已发表的轨道要素无法忠实计算其相位。",   /* space.js */
    'positive': "正",   /* analysis-panels.js */
    'Pour': "倒水",   /* terrain-water.js */
    /* terrain-water.js */
    /* sims.js */
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
    /* atlas-console.js */
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
    /* atlas-console.js */
    'radius': "半径",   /* map-tools.js */
    'Radius': "半径",   /* space.js terrain-water.js workspace.js */
    'Radius circles': "半径圆",   /* map-tools.js */
    'Rail': "铁路",   /* routing.js */
    'Railways': "铁路",   /* routing.js */
    /* terrain-water.js */
    'Raise': "抬升",   /* terrain-water.js */
    'raised to clear the terrain below it': "已抬高以避开下方地形",   /* aircraft-detail.js */
    /* atlas-console.js */
    'Ran: ': "已执行：",   /* monitors.js */
    'Range (km)': "射程（公里）",   /* viewshed.js */
    'rate-limited': "受频率限制",   /* atlas-console.js */
    'rays': "射线",   /* viewshed.js */
    'Re-entry velocity (100 km)': "重返速度（100 公里）",   /* atlas-console.js */
    'reachable': "可到达",   /* atlas-console.js drone-nav.js */
    'Reachable area': "可达范围",   /* map-tools.js viewshed.js */
    'Reachable area (drive/walk/cycle)': "可达范围（开车／步行／单车）",   /* tool-panel.js */
    'Reachable area along the REAL road network (Valhalla / OpenStreetMap) — drive / walk / cycle, not a distance circle. Adjust mode & time in the 🎯 panel.': "依真实道路网（Valhalla／OpenStreetMap）计算的可达范围 — 开车／步行／单车，不是距离圆。可在 🎯 面板调整方式与时间。",   /* atlas-console.js */
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
    /* terrain-water.js */
    'Receiver sensitivity': "接收机灵敏度",   /* drone-nav.js */
    'Reception': "接收",   /* aircraft-detail.js */
    'Recolored the current highlights': "已重新着色目前的标示",   /* atlas-console.js */
    'Recompute': "重新计算",   /* tsunami.js */
    'Recompute the intensity map': "重新计算震度分布",   /* seismic.js */
    'Rectangle': "矩形",   /* tool-panel.js */
    'Red = reachable': "红色＝可到达",   /* viewshed.js */
    /* world-packs.js */
    'Refraction': "折射",   /* viewshed.js */
    'Refresh': "刷新",   /* weather.js */
    'Regenerate': "重新产生",   /* analysis-panels.js */
    'Region': "地区",   /* monitors.js */
    'Registration': "注册编号",   /* aircraft-detail.js */
    'Rejected — invalid/degenerate shape (not drawn)': "已拒绝 — 形状无效或退化（未绘制）",   /* atlas-console.js */
    /* atlas-console.js */
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
    /* world-packs.js */
    'Restore': "还原",   /* atlas-console.js */
    'Restricted areas': "限制区",   /* drone-nav.js */
    'restricted areas within their buffers': "其缓冲区内的限制区",   /* atlas-console.js */
    'Restricted-area data could not be fetched — this route has NOT been checked against airports, military areas or reserves.': "无法取得限制区数据 — 本路线尚未与机场、军事区或保护区比对。",   /* drone-ops.js */
    'Result': "结果",   /* drone-nav.js */
    'Resume': "继续",   /* monitors.js */
    'Resume drawing': "继续绘制",   /* tool-panel.js */
    /* atlas-console.js */
    'retrograde': "逆行",   /* space.js */
    'Retry': "重试",   /* atlas-console.js */
    'Return leg added': "已加入回程",   /* atlas-console.js */
    'Return to launch': "返回起飞点",   /* drone-nav.js */
    'Revenue': "营收",   /* industry-web.js */
    'revenue known — area ∝ revenue': "已知营收 — 面积正比于营收",   /* industry-web.js */
    'reverses with the season': "随季节反向",   /* ocean-currents.js */
    'Revolution at epoch': "历元时的圈数",   /* satellite-detail.js */
    'Rises': "升起",   /* satellite-detail.js */
    /* atlas-console.js */
    /* atlas-console.js */
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
    /* routing.js */
    'RUD': "方向舵",   /* flight-sim.js */
    'Run history': "执行纪录",   /* monitors.js */
    'Run now': "立即执行",   /* monitors.js */
    'Run this request again': "重新执行这个请求",   /* atlas-console.js */
    'Running…': "执行中…",   /* monitors.js */
    /* terrain-water.js */
    'rupture': "震源域",   /* seismic.js */
    'Rupture': "震源域",   /* seismic.js tsunami.js */
    'Rupture area drawn': "已绘制震源域",   /* tsunami.js */
    'rupture radius': "破裂半径",   /* seismic.js */
    's': "秒",   /* terrain-water.js */
    /* sims.js */
    'Safest': "最安全",   /* drone-ops.js */
    'samples': "个采样",   /* viewshed.js */
    'Sampling': "采样中",   /* terrain-water.js */
    'Satellite': "卫星影像",   /* atlas-console.js workspace.js */
    'Save': "保存",   /* drone-nav.js */
    'Save & draw next': "保存并绘制下一个",   /* tool-panel.js */
    'Saved': "已保存",   /* atlas-console.js */
    'Saved routes': "已保存的路线",   /* drone-nav.js */
    'Scanning the coast in view…': "正在扫描画面中的海岸…",   /* world-packs.js */
    'Scheduled': "已调度",   /* monitors.js */
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
    /* news-timeline.js */
    'seismic waves': "地震波",   /* atlas-console.js */
    'Seismic waves': "地震波",   /* atlas-console.js seismic.js */
    "About this model": "关于此模型",   /* (#R258) */
    "Coal / oil / gas": "煤炭／石油／天然气",   /* (#R258) */
    "Crest above ground": "堤顶高（地面以上）",   /* (#R258) */
    "Depth per stroke": "每一笔的深度",   /* (#R258) */
    /* (#R258) */
    "Disperse a release on the live wind field": "在实际风场中扩散排放",   /* (#R258) */
    "Elapsed": "已经过",   /* (#R258) */
    "Flow arrows": "流向箭头",   /* (#R258) */
    "Fuel / source": "燃料／能源",   /* (#R258) */
    "Height per stroke": "每一笔的高度",   /* (#R258) */
    "How far you get in a given time": "在指定时间内能走多远",   /* (#R258) */
    /* (#R258) */
    "Method": "方式",   /* (#R258) */
    "Mine / shaft": "矿场／竖坑",   /* (#R258) */
    "Mines, quarries & wells": "矿场、采石场与油气井",   /* (#R258) */
    "Night sky from here": "此地的夜空",   /* (#R258) */
    "Oil or gas well": "油井／气井",   /* (#R258) */
    "Other / biomass": "其他／生质能",   /* (#R258) */
    "Output": "出力",   /* (#R258) */
    "Place water on the map first": "请先在地图上放置水",   /* (#R258) */
    "OpenStreetMap did not answer — pan or zoom to try again": "OpenStreetMap 没有回应——移动或缩放地图可再试一次",   /* (#R262) */
  "The water has come to rest — press ↺ to run it again, or place more": "水已静止——按 ↺ 重新播放，或再放置更多水",   /* (#R275) */
  "This country’s service is in the update cycle and has not been read yet.": "此国家的机关正在更新调度中，尚未取得。",   /* (#R275) */
  "Warnings at this point": "此地点的警报",   /* (#R275) */
    "across": "／",   /* (#R261) */
    "Airport / airfield": "机场／飞行场",   /* (#R261) */
    "Airports & air infrastructure": "机场与航空设施",   /* (#R261) */
    "Airports, airfields, terminals, heliports and control towers mapped in OpenStreetMap for the current view. Click any point for its ICAO/IATA code, runway length and operator where the object carries them.": "目前显示范围内 OpenStreetMap 收录的机场、飞行场、航厦、直升机坪与塔台。点击任一点可查看 ICAO/IATA 代码、跑道长度与营运者（限该对象本身具备者）。",   /* (#R261) */
    "Ambulance station": "救护站",   /* (#R261) */
    "Battery, clearance and no-fly zones over the real terrain": "在真实地形上解算电池、离地高度与禁航区",   /* (#R261) */
    "Cancel — click the new site": "取消（点击新地点）",   /* (#R261) */
    "Capacity": "处理能力",   /* (#R261) */
    "Cargo / container terminal": "货柜／货运码头",   /* (#R261) */
    "Change the values and press Analyze to re-run at this site; “Move the site…” puts it somewhere else.": "变更数值后按「分析」可重算同一地点；「变更地点…」可移到别处。",   /* (#R261) */
    "Cleared. Press Analyze to re-run here, or “Move the site…” to place it somewhere else.": "已清除。按「分析」重算，或用「变更地点…」放到别处。",   /* (#R261) */
    "College": "学院",   /* (#R261) */
  "by the area the service names": "以发布机关指定的区域为单位",   /* (#R275) */
    "continuous": "持续",   /* (#R261) */
    /* (#R261) */
    "Control tower": "塔台",   /* (#R261) */
    /* (#R261) */
    "Crane": "装卸起重机",   /* (#R261) */
  "continuous — never stops": "持续——不会停止",   /* (#R275) */
    "curated": "收录",   /* (#R261) */
    "Data centers & AI infrastructure": "数据中心与 AI 基础设施",   /* (#R261) */
    "Dish diameter": "天线直径",   /* (#R261) */
    "Drone flight planner": "无人机飞行规划",   /* (#R261) */
    /* (#R261) */
    "Emergency services": "紧急应变据点（消防、警察、救护）",   /* (#R261) */
    "Ferry terminal": "渡轮码头",   /* (#R261) */
    "Fire station": "消防队",   /* (#R261) */
    "Fire stations, police stations, ambulance stations and mountain-rescue posts mapped in OpenStreetMap for the current view — how far help has to come from, which no national statistic answers.": "目前显示范围内 OpenStreetMap 收录的消防队、警察局、救护站与山难救助据点。「救援从哪里来」是国家统计答不出来的事。",   /* (#R261) */
    /* (#R261) */
    "Harbour type": "港口类别",   /* (#R261) */
    /* (#R261) */
    "IATA code": "IATA 代码",   /* (#R261) */
    "ICAO code": "ICAO 代码",   /* (#R261) */
    "International airport": "国际机场",   /* (#R261) */
    /* (#R261) */
    "Launch pad": "发射台",   /* (#R261) */
    "Launch pads, spaceports, satellite ground stations and radio telescopes mapped in OpenStreetMap for the current view — the ground half of everything the orbit layers show overhead.": "目前显示范围内 OpenStreetMap 收录的发射台、太空基地、卫星地面站与电波望远镜——轨道图层在头顶描绘之物的地面另一半。",   /* (#R261) */
    "Move the site…": "变更地点…",   /* (#R261) */
    "Next source": "下一个水源",   /* (#R261) */
    /* (#R261) */
    "Observatory": "天文台／观测站",   /* (#R261) */
  "more countries": "个国家",   /* (#R275) */
    "of": "／全",   /* (#R261) */
    "On the map": "已配置",   /* (#R261) */
    "one shot": "单次",   /* (#R261) */
    /* (#R261) */
    "Police station": "警察局",   /* (#R261) */
    "Port / harbour": "港湾",   /* (#R261) */
    "Ports, harbours & terminals": "港湾与码头",   /* (#R261) */
    "Ports, harbours, ferry terminals, container and cargo terminals and cranes mapped in OpenStreetMap for the current view — where cargo physically changes vehicle.": "目前显示范围内 OpenStreetMap 收录的港湾、渔港、渡轮码头、货柜／货运码头与装卸起重机——货物实际换载的地方。",   /* (#R261) */
  "one shot — stops when its volume is used up": "单次——水量用完即停止",   /* (#R275) */
    "published capacity": "公布容量",   /* (#R261) */
    "Pumping station": "抽水站",   /* (#R261) */
    "Radio telescope": "电波望远镜",   /* (#R261) */
    "Rescue post": "救助据点",   /* (#R261) */
    "Research institute": "研究机构",   /* (#R261) */
    /* (#R261) */
    "Runway length": "跑道长度",   /* (#R261) */
    "Satellite ground station": "卫星地面站",   /* (#R261) */
    /* (#R261) */
    /* (#R261) */
    "Spaceports & ground stations": "太空基地与地面站",   /* (#R261) */
    "Students": "学生人数",   /* (#R261) */
    "Substance": "处理对象",   /* (#R261) */
    "Terminal": "航厦",   /* (#R261) */
    /* (#R261) */
    "Universities & research institutes": "大学与研究机构",   /* (#R261) */
    "Universities, colleges, research institutes, observatories and libraries mapped in OpenStreetMap for the current view — where teaching and research actually happen, beside the enrolment percentages.": "目前显示范围内 OpenStreetMap 收录的大学、学院、研究机构、天文台与图书馆——在就学率的数字旁，放上教学与研究实际发生的地方。",   /* (#R261) */
    "University": "大学",   /* (#R261) */
    "Wastewater treatment": "污水处理厂",   /* (#R261) */
    "Water & wastewater plant": "自来水与污水设施",   /* (#R261) */
    "Water tower / reservoir": "水塔／配水池",   /* (#R261) */
    "Water works": "净水场",   /* (#R261) */
    "Water works, wastewater treatment plants, pumping stations, water towers and reservoirs mapped in OpenStreetMap for the current view — the plant that makes safe water and sanitation real in a place, rather than the national percentage.": "目前显示范围内 OpenStreetMap 收录的净水场、污水处理厂、抽水站、水塔与配水池——不是各国普及率，而是让当地自来水与污水处理真正运作的设施本身。",   /* (#R261) */
    /* (#R261) */
    "Power plants & grid": "发电厂与输变电设施",   /* (#R258) */
    "Quarry": "采石场",   /* (#R258) */
    "Radioactive plume simulator": "放射性烟羽扩散模拟器",   /* (#R258) */
    "Rainfall": "降水量",   /* (#R258) */
    "Resource": "资源",   /* (#R258) */
    "Sculpt the ground, pour water, build a levee": "塑形地形、注水、筑堤",   /* (#R258) */
    /* (#R258) */
    "Source & notes": "来源与注记",   /* (#R258) */
    "Substation": "变电所",   /* (#R258) */
    "Terrain & water simulator": "地形与水流模拟器",   /* (#R258) */
    "The sky a person standing here has": "站在此地所见的天空",   /* (#R258) */
    "Tool": "工具",   /* (#R258) */
    /* (#R258) */
    "Voltage": "电压",   /* (#R258) */
    /* (#R258) */
    /* (#R258) */
    "Where the sun reaches, hour by hour": "逐小时的日照范围",   /* (#R258) */
    "Width": "宽度",   /* (#R258) */
    "Mines, quarries, mine shafts and oil or gas wells mapped in OpenStreetMap for the current view — the places raw material physically leaves the ground. Click any point for the resource and operator as tagged.": "目前检视范围内 OpenStreetMap 所登录的矿场、采石场、竖坑与油气井，也就是原料实际离开地面的地点。点击任一点可看到标签中的资源与营运者。",   /* (#R258) */
    "Power stations, substations, wind turbines and solar farms mapped in OpenStreetMap for the current view — where the electricity is actually generated and stepped up, not a national average. Click any point for its output, fuel and operator as tagged.": "目前检视范围内 OpenStreetMap 所登录的发电厂、变电所、风力机组与太阳能电厂——电力实际产生与升压的地点，而非全国平均值。点击任一点可看到标签中的出力、燃料与营运者。",   /* (#R258) */
    "Arrow width is proportional to the SQUARE ROOT of the value (a flow-map convention — the eye compares area, and a stroke’s area is width × length), and the arrow points the way the goods move. Hover any arrow for the exact figure; nothing here rescales the amounts. Source: BACI (CEPII) via OEC, HS 6-digit, year ": "箭头宽度与金额的平方根成正比（流线图惯例：眼睛比较的是面积，而线条面积为宽×长），箭头指向货物流动的方向。将光标移到箭头上可看到确切金额；此处不对金额做任何缩放。来源：BACI (CEPII) / OEC，HS 6 位码，年份 ",   /* (#R258) */
    'Earthquake simulator (set as epicentre)': "地震模拟器（设为震央）",   /* tool-panel.js */
    /* atlas-console.js */
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
    'Shadows are cast by OSM buildings in view (zoom in past ~z15) and, with the terrain button on, by the real elevation model. Sun path from the SunCalc algorithm; 3D building faces are lit from the sun. The point analysis reads a 360° horizon off the DEM (curvature + refraction) and steps a whole year against it; the irradiance is CLEAR-SKY, not a weather forecast.': "阴影由画面中的 OSM 建筑投下（请放大至约 z15 以上），开启地形按钮后也会由实测高程模型投下。太阳轨迹采 SunCalc 算法；3D 建筑面由太阳照明。单点分析会由 DEM 读取 360° 地平线（含曲率与折射）并推算整年；辐照度为晴空值，不是天气预报。",   /* sims.js */
    'shaking': "震动",   /* seismic.js */
    'Shallow-water long waves on a spherical staggered grid, with total-depth pressure and Manning bottom friction, solved in a background thread. Depth from the terrarium DEM; initial sea-floor displacement from Okada (1985) summed over a tapered sub-fault grid, with Wells & Coppersmith (1994) fault dimensions and the strike read off the local bathymetric gradient. Cells are tens of kilometers, so this is an open-ocean model: arrival times and deep-water amplitude are meaningful, harbor resonance and run-up are not. Coastal height is a Green’s-law estimate. Educational model — in a real emergency follow the official authorities.': "球面交错格网上的浅水长波，含全水深压力项与曼宁底床摩擦，于背景线程求解。水深取自 terrarium DEM；初始海底位移采 Okada（1985），并在渐缩的次断层网格上加总，断层尺寸采 Wells & Coppersmith（1994），走向由当地海底地形梯度读出。格子为数十公里，因此属开放海域模型：到达时刻与深海波幅有意义，港湾共振与溯上则否。沿岸波高为格林定律推估。教育性模型 — 实际灾害时请遵从官方指示。",   /* tsunami.js */
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
    'Signal': "信号",   /* aircraft-detail.js */
    'Silver': "白银",   /* map-ui.js */
    'Sim window': "模拟窗口",   /* atlas-console.js */
    'Simulate': "模拟",   /* tsunami.js */
    /* sims.js */
    'Sky from': "天空来自",   /* atlas-console.js */
    'Sky from here': "从此处看到的天空",   /* night-sky.js */
    'Slant range': "斜距",   /* satellite-detail.js */
    'slope over': "坡度量测距离",   /* seismic.js */
    'Slower': "较慢",   /* space.js */
    /* sims.js */
    /* atlas-console.js */
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
    /* atlas-console.js */
    'SOUND': "音效",   /* flight-sim.js */
    'Source': "来源",   /* aircraft-detail.js atlas-console.js cameras.js */
    'Source term': "源项",   /* atlas-console.js */
    'Source unavailable': "来源无法使用",   /* monitors.js */
    'Source: AI-estimated (neither OpenStreetMap nor Wikidata had matching entries here — positions are approximate, verify before relying on them)': "来源：AI 推估（此处 OpenStreetMap 与 Wikidata 都没有相符的项目 — 位置为概略值，采用前请自行查证）",   /* atlas-console.js */
    'Source: Our World in Data — Ember (electricity) and the Energy Institute Statistical Review (primary energy). The map shades the low-carbon share of electricity, and the fossil share of primary energy; the bar is the mix itself, because nine sources are not one color.': "来源：Our World in Data — Ember（电力）与 Energy Institute Statistical Review（一次能源）。地图着色为电力的低碳占比，以及一次能源的化石占比；长条则是能源结构本身，因为九种来源不能用一种颜色表示。",   /* world-packs.js */
    'Sources': "来源",   /* atlas-console.js space.js */
    'Sources per indicator: World Bank / IMF WEO / bundled reference (shown in bar & time-series views)': "各指标的来源：世界银行／IMF WEO／内置参考数据（在长条图与时间序列检视中标示）",   /* stats-compare.js */
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
    /* terrain-water.js */
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
    /* terrain-water.js */
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
    /* sims.js */
    /* atlas-console.js */
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
    'Sunlight at a point': "单点日照",   /* sims.js */
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
    /* world-packs.js */
    'Tap the map to place it.': "点击地图即可放置。",   /* map-pick.js */
    /* sims.js */
    /* seismic.js */
    'Tap the map to place the epicenter.': "点击地图以放置震央。",   /* seismic.js */
    /* sims.js */
    'Tap the point to analyze.': "点击要分析的地点。",   /* sims.js */
    /* routing.js */
    'Target height (m)': "目标高度（米）",   /* viewshed.js */
    'Tell me a start and destination — e.g. "directions from Tokyo to Osaka" or "電車で新宿から横浜".': "请告诉我起点与目的地 — 例如「东京到大阪的路线」或「电车で新宿から横浜」。",   /* atlas-console.js */
    'terrain': "地形",   /* drone-nav.js */
    'terrain & water': "地形与水",   /* atlas-console.js */
    'Terrain & water': "地形与水",   /* atlas-console.js */
    'Terrain & water flow': "地形与水流",   /* tool-panel.js */
    'Terrain &amp; water': "地形与水",   /* terrain-water.js */
    'Terrain shadow': "地形阴影",   /* sims.js */
    'terrain to': "地形量测至",   /* seismic.js */
    'Terrain too coarse here — uniform site class used': "此处地形过于粗糙 — 已改用单一场址分类",   /* seismic.js */
    'That area is too large/detailed to save. Try a simpler shape.': "该范围太大或太细致，无法保存。请改用较简单的形状。",   /* monitors.js */
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
    'The bundled current data could not be read.': "无法读取内置的海流数据。",   /* ocean-currents.js */
    'the current view': "目前画面",   /* atlas-console.js */
    'The dispersion simulation could not run (map still loading)': "扩散模拟无法执行（地图仍在加载）",   /* atlas-console.js */
    'the drawn area': "所绘范围",   /* atlas-console.js */
    'The drone operations module is unavailable': "无人机作业模块无法使用",   /* atlas-console.js */
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
    /* routing.js */
    'The routing service timed out — try again.': "路径服务逾时 — 请再试一次。",   /* atlas-console.js routing.js */
    /* atlas-console.js */
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
    /* terrain-water.js */
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
    'This browser cannot run the solver in a background thread, so the propagation model is unavailable here.': "这个浏览器无法在背景线程中执行求解器，因此此处无法使用传播模型。",   /* tsunami.js */
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
    /* routing.js */
    'Time set': "已设置时间",   /* atlas-console.js */
    /* terrain-water.js */
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
    /* terrain-water.js */
    /* terrain-water.js */
    /* terrain-water.js */
    /* terrain-water.js */
    'Track': "轨迹",   /* aircraft-detail.js */
    'Track of': "轨迹：",   /* atlas-console.js */
    'Trade data could not be fetched.': "无法取得贸易数据。",   /* world-packs.js */
    'Trade flows': "贸易流",   /* world-packs.js */
    'Traffic camera': "路况摄影机",   /* cameras.js */
    'Tram': "路面电车",   /* routing.js */
    'Trans-Neptunian object': "海王星外天体",   /* space.js */
    'Transit': "大众运输",   /* routing.js */
    /* routing.js */
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
    /* widgets.js */
    /* world-packs.js */
    'Unknown action': "未知的操作",   /* atlas-console.js */
    'Unknown color': "未知的颜色",   /* atlas-console.js */
    'Unknown metric': "未知的指标",   /* atlas-console.js */
    'Unknown module': "未知的模块",   /* atlas-controls.js */
    /* atlas-console.js */
    'Unknown ranking metric': "未知的排名指标",   /* atlas-console.js */
    'unlimited': "无限制",   /* atlas-console.js */
    'Unlimited tilt': "不限制倾角",   /* atlas-console.js */
    'unreachable': "无法到达",   /* atlas-console.js */
    /* seismic.js */
    'Unsupported language': "不支持的语言",   /* atlas-console.js */
    'Unsupported method': "不支持的方法",   /* atlas-controls.js */
    'UP': "上",   /* flight-sim.js */
    'up to': "最多",   /* atlas-console.js */
    'Up to 4 files per message': "每则讯息最多 4 个文件",   /* atlas-console.js */
    'Up to 4 images per message': "每则讯息最多 4 张图片",   /* atlas-console.js */
    'Updated': "已更新",   /* weather.js */
    'Uploaded data': "上传的数据",   /* map-tools.js */
    /* world-packs.js */
    'Usable for PV': "可用于太阳光电",   /* sims.js */
    'Use': "使用",   /* drone-nav.js */
    'Use current map view': "使用目前的地图画面",   /* monitors.js */
    /* routing.js */
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
    'Viewing the future': "正在检视未来",   /* news-timeline.js */
    'Viewing the past': "正在检视过去",   /* news-timeline.js */
    /* news-timeline.js */
    'Viewpoint altitude': "视点高度",   /* atlas-console.js */
    'Viewpoint altitude in the readout': "读数中的视点高度",   /* atlas-console.js */
    'violent': "剧烈",   /* seismic.js */
    'Voice input': "语音输入",   /* atlas-console.js */
    'Volume': "体积",   /* tool-panel.js volume3d.js */
    /* terrain-water.js */
    'vs': "对",   /* analysis-panels.js */
    'Walk': "步行",   /* atlas-console.js map-tools.js routing.js */
    'Warhead': "弹头",   /* atlas-console.js */
    'warm': "暖流",   /* ocean-currents.js */
    'Warm current — measurably warmer than the sea at the same latitude': "暖流 — 实测比同纬度的海水暖",   /* ocean-currents.js */
    /* data-layers.js */
    'Warning': "警告",   /* world-packs.js */
    'Warnings': "警报",   /* world-packs.js */
    'Watch for': "注意",   /* monitors.js */
    'Watching': "监看中",   /* monitors.js */
    'water': "水",   /* sims.js */
    /* terrain-water.js */
    'Water source': "水源",   /* terrain-water.js (#R284) */
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
    /* widgets.js */
    /* widgets.js */
    'Weather temporarily unavailable (both weather services could not be reached — possibly rate-limited). Try again in a few minutes.': "天气暂时无法取得（两家气象服务都连不上 — 可能受到流量限制）。请几分钟后再试。",   /* weather.js */
    'web news search': "网络新闻搜索",   /* atlas-console.js */
    'web-derived': "取自网络",   /* atlas-console.js */
    'Web-verified sources': "经网络查证的来源",   /* atlas-console.js */
    /* atlas-console.js */
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
    /* terrain-water.js */
    /* terrain-water.js */
    'Widgets': "小工具",   /* atlas-console.js keyboard-shortcuts.js */
    'width': "宽度",   /* terrain-water.js */
    /* terrain-water.js */
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
    /* data-layers.js */
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
    'A satellite where-am-I geography game — dropped somewhere on Earth, guess your location.': "卫星影像猜位置的地理游戏 — 被丢到地球上的某处，猜猜你在哪里。",
    'Active layers': "使用中的图层",
    'Active-fire data unavailable': "无法取得实时火点数据",
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
    'Drag to move': "拖动以移动",
    'Earth, sky & airspace': "地球、天空与空域",
    'Could not be read': "无法读取",   /* world-packs.js (#R284) */
    'this service could not be reached just now, so the map is not saying anything about this country. It is retried on every update.': "目前无法连接到该机关，因此地图对这个国家不作任何表述。每次更新时会重试。",   /* world-packs.js (#R284) */
    /* weather.js (#R284) */
    'ECMWF weather': "ECMWF 天气",
    'One step back': "上一个时刻",   /* weather.js (#R284) */
    'One step forward': "下一个时刻",   /* weather.js (#R284) */
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
    'Heavy': "浓厚",
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
    'Log in or create an account to use AI features and sync your settings, widgets, favorites and avatar across devices.': "登录或注册账号即可使用 AI 功能，并在各设备间同步你的设置、小工具、收藏与头像。",
    'Log out': "登出",
    'Log out of your account?': "要登出账号吗？",
    'Logged out': "已登出",
    'Maritime zones': "海域划界",
    'May be incomplete or not fully working.': "可能不完整或尚未完全可用。",
    'Measured area': "量测面积",
    'Measured line': "量测线",
    'Member': "成员国",
    'Mil. spending (% GDP)': "军费（占 GDP %）",
    'Mil. spending ($B)': "军费（十亿美元）",
    'Mil. spending (2023)': "军费（2023）",
    'Move': "移动",
    'NASA FIRMS · MODIS + VIIRS (real, near-real-time)': "NASA FIRMS · MODIS + VIIRS（真实数据，近实时）",
    'NASA SEDAC GPW v4 (2020, ~1 km). Real distribution, independent of borders.': "NASA SEDAC GPW v4（2020，约 1 公里）。真实分布，与国界无关。",
    'Night lights': "夜间灯光",
    'No bio yet.': "尚未填写自我介绍。",
    'No layers are on': "没有开启任何图层",
    'None selected': "未选取",
    'Open in new tab': "在新分页开启",
    'Open original': "开启原文",
    'Peaks': "山峰",
    'Please choose an image file': "请选择图片档",
    'Pop. density': "人口密度",
    'Pop. density (grid)': "人口密度（网格）",
    'Post failed: ': "发文失败：",
    'Projection': "投影",
    'Radius ': "半径 ",
    'Read ↗': "阅读 ↗",
    'Read article': "阅读文章",
    'Reply to ': "回复 ",
    'Report this post as inappropriate?': "要检举这篇贴文为不当内容吗？",
    'Reported. Thank you.': "已检举，谢谢你。",
    'Satellite Drop': "卫星空降",
    'Save profile': "保存个人数据",
    'Saved.': "已保存。",
    'Saving…': "正在保存…",
    'Sea-level': "海平面",
    'Sea-level change': "海平面变化",
    'See IntMap Pro': "了解 IntMap Pro",
    'Set': "设置",
    'Showing news in the selected area': "显示所选范围内的新闻",
    'Slider or a number (-11000–9000 m; negative = sea-level fall). Naïve "bathtub" fill from the AWS Terrain DEM — ignores tides & defenses.': "用滑杆或直接输入数字（-11000–9000 米；负值代表海平面下降）。以 AWS Terrain 数值高程做最简单的「浴缸式」淹没推算 — 未考虑潮汐与防洪设施。",
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
    'Units': "单位",
    'Update failed: ': "更新失败：",
    'Upload image': "上传图片",
    'USD, nominal': "美元，名目值",
    'Wind 10 m': "10 米风",
    'Wind data unavailable': "无法取得风场数据",
    'You have unsaved changes. Discard them?': "你有尚未保存的变更，要舍弃吗？",
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
    'Below are news headlines reported within a single geographic area. In about three concise lines, summarize what is happening in this region from a geopolitical perspective. Begin each line with \'- \'. Stay grounded in the given headlines and avoid over-speculation.': "以下是在同一个地理范围内报道的新闻标题。请以地缘政治的角度，用大约三行简洁的中文摘要这个地区正在发生的事。每一行以「- 」开头。只根据所给的标题陈述，避免过度推测。",
    'Compare two images of the same area (first = earlier, second = later). Report: military construction/expansion, movement of ships/aircraft/vehicles, land clearing, natural disasters (floods, fires, landslides), and urban/infrastructure change. Use bullet points, each with a confidence level (high/medium/low). If nothing changed, say so, and beware false positives from clouds, image quality, or seasonal differences.': "请比对同一地区的两张影像（第一张＝较早，第二张＝较晚）。请报告：军事设施的兴建与扩张，船舰、航空器、车辆等装备的移动，土地整地与伐除，自然灾害（洪水、火灾、山崩等），以及都市与基础设施的变化。以条列方式呈现，每一项标注信心水准（高／中／低）。若没有变化就直接说明，并注意云量、影像质量或季节差异造成的误判。",
    'The drawn outline is the fault’s surface projection. Dip, width and depth are estimated from its length and shape (Wells & Coppersmith 1994 with the magnitude eliminated); the mean slip follows from the stress drop above (Eshelby). Leave a box empty to keep it estimated.': "所绘的轮廓是断层的地表投影。倾角、宽度与深度由其长度和形状推估（Wells & Coppersmith 1994，并消去规模项）；平均滑移量则由上方的应力降导出（Eshelby）。字段留空即维持推估值。",
    "Casualties":"人员伤亡",
    "Educational model — in a real emergency follow the official authorities.":"教育用模型——实际灾害时请遵循官方机构的指示。",
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
  "The wavefronts are the outer envelope of the fronts from every sampled point of the rupture — solved on the sphere, so a hand-drawn outline keeps its concavity instead of being replaced by its convex hull — and each sampled point uses the travel-time curve for its OWN depth on the dipping plane. Surface-wave group velocity is integrated along each great-circle path rather than held constant, so an oceanic path runs ahead of a continental one; the 3.5 / 4.4 km/s figures are the continental reference and the ratio is in the advanced settings.": "波前是震源域各采样点所发出波前的外包络线，并在球面上求解，因此手绘的凹形轮廓会被保留，而不会被其凸包取代；每个采样点都使用其在倾斜断层面上「自身深度」所对应的走时曲线。表面波的群速度是沿各大圆路径积分而得，而非固定值，因此行经海洋地壳的路径会领先大陆地壳的路径；3.5 / 4.4 km/s 为大陆地壳的参考值，其比值可在高级设置中调整。",
  "Place the hypocenter": "设置震央",
  "Tap inside the rupture area to place the hypocenter.": "请点击震源域内部以设置震央。",
  "That point is outside the rupture area — the rupture starts on the plane it happened on.": "该地点位于震源域之外——破裂是从其发生的断层面上开始的。",
  "This is where the rupture starts, so it sets the direction it runs in.": "这里是破裂的起点，因此决定了破裂传播的方向。",
  "Past earthquakes": "过去的地震",
  "Recent earthquakes": "最近的地震",
  "No list yet — press to load": "尚无列表——请按此加载",
  "Loading the recent earthquakes…": "正在加载最近的地震…",
  " events": " 件事件",
  "this service is in the update cycle and has not been read yet, so the map is not saying anything about this country until it has.": "此机关正在更新调度中，尚未取得；在取得之前，本地图对此国家不作任何陈述。",   /* (#R275) */
  "via WMO SWIC": "经 WMO SWIC",   /* (#R275) */
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
  "favorite: ": "我的最爱：",
  "Fishing": "渔船",
  "Geo alt": "高度 (GPS)",
  "Heading": "船首向",
  "High-speed craft": "高速船",
  "Latest frame (live)": "最新影格（实时）",
  "Law enforcement": "执法船",
  "level": "平飞",
  "Load an earthquake": "加载地震",
  "Log in to post, comment and vote.": "请登录以发表、留言与投票。",
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
  "Report": "检举",
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
  "Tap the map to place the hypocenter. Drawing a rupture area first is optional.": "点一下地图放置震源。先绘制震源域为选用步骤。",
  "Press to solve the intensity field for this source.": "按下即可计算此震源的震度分布。",
  "Active volcanoes": "活火山",
  "Air-defense zones (ADIZ ≈)": "防空识别区 (ADIZ ≈)",
  "Annual precipitation": "年降水量",
  "Assassination": "暗杀",
  "ASTER global DEM color + shaded relief (static)": "ASTER 全球高程模型彩色分层＋阴影起伏（静态）",
  "Aurora forecast (NOAA)": "极光预报（NOAA）",
  "Clear sky": "晴朗",
  "CO₂ per capita": "人均二氧化碳",
  "CO₂ per capita (t)": "人均二氧化碳（吨）",
  "Color relief (ASTER GDEM)": "彩色地势图（ASTER GDEM）",
  "Contour lines": "等高线",
  "Corruption indicator": "贪腐指标",
  "Current account (% GDP)": "经常帐（占GDP）",
  "Data centers & AI infra": "数据中心与AI基础设施",
  "Day / night": "日／夜",
  "dense": "密集",
  "Disaster": "灾害",
  "Drizzle": "毛毛雨",
  "dry": "干燥",
  "Ecoregions (WWF/RESOLVE)": "生态区（WWF/RESOLVE）",
  "Education spending (% GDP)": "教育支出（占GDP）",
  "Elevation relief (hillshade)": "阴影起伏",
  "Enhanced monitoring": "加强监测",
  "Exclusion — permanent resettlement": "禁止进入区——永久迁离",
  "Exports (% GDP)": "出口（占GDP）",
  "FDI inflows (% GDP)": "外资流入（占GDP）",
  "Fertility rate": "总生育率",
  "Fog": "雾",
  "Forest area": "森林面积",
  "Freezing rain": "冻雨",
  "GDP (nominal)": "GDP（名目）",
  "GDP (PPP)": "GDP（购买力平价）",
  "GDP (US$)": "GDP（美元）",
  "GDP growth": "GDP 成长率",
  "GDP per capita (PPP)": "人均GDP（购买力平价）",
  "Geopolitics": "地缘政治",
  "GHRSST MUR sea-ice concentration": "GHRSST MUR 海冰密集度",
  "Auto-rotate": "自动旋转",
  "Govt debt (% GDP)": "政府债务（占GDP）",
  "HDI": "人类发展指数",
  "Health spending (% GDP)": "医疗支出（占GDP）",
  "Heavy drizzle": "强毛毛雨",
  "Heavy rain": "大雨",
  "Heavy showers": "强阵雨",
  "Heavy snow": "大雪",
  "high": "高",
  "Homicide rate (/100k)": "凶杀率（每10万人）",
  "humid": "潮湿",
  "Inflation (CPI)": "通膨（CPI）",
  "Internet penetration": "网络普及率",
  "Internet users": "网络用户",
  "Internet users %": "网络使用率 %",
  "Land cover (ESA 2021)": "土地覆盖（ESA 2021）",
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
  "Military (% GDP)": "国防支出（占GDP）",
  "Military spending": "国防支出",
  "Military spending ($)": "国防支出（美元）",
  "MODIS vegetation index (8-day)": "MODIS 植生指数（8日合成）",
  "NATO members": "北约成员国",
  "Overcast": "阴天",
  "Partly cloudy": "局部多云",
  "Pharma manufacturing hubs": "制药生产基地",
  "Population": "人口",
  "Precipitation (IMERG)": "降水量（IMERG）",
  "R&D (% GDP)": "研发支出（占GDP）",
  "Rain": "雨",
  "Relocation right / monitoring": "迁居权／监测区",
  "Renewable energy": "再生能源",
  "Revolution": "革命・政变",
  "Rime fog": "雾淞",
  "Sea ice (Arctic/Antarctic)": "海冰（北极／南极）",
  "Sea-ice concentration": "海冰密集度",
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
  "Vegetation index (NDVI)": "植生指数 (NDVI)",
  "War": "战争",
  "wet": "湿润",
  "All goods": "所有品项",
  "Animal products": "动物产品",
  "Arms": "武器",
  "Banana": "香蕉",
  "Barley": "大麦",
  "Cassava": "木薯",
  "Cereals": "谷物（合计）",
  "Chemicals": "化学工业产品",
  "Citrus": "柑橘",
  "Cotton": "棉花",
  "Energy mix (electricity / primary)": "能源结构（电力／一次能源）",
  "Fodder crops": "饲料作物",
  "Foodstuffs": "调制食品",
  "Fruits and nuts": "水果与坚果",
  "Groundnut": "花生",
  "Harvested area": "收获面积",
  "Instruments": "光学与精密仪器",
  "Irrigated": "灌溉",
  "Machines": "机械",
  "Main crops": "主要作物（合计）",
  "Maize": "玉米",
  "Metals": "金属",
  "Millet": "小米",
  "Mineral products": "矿产品",
  "Oil palm": "油棕",
  "Oil seeds": "油籽（合计）",
  "Olive": "橄榄",
  "Other cereals": "其他谷类",
  "Plastics & rubber": "塑料与橡胶",
  "Potato and sweet potato": "马铃薯与甘藷",
  "Precious metals": "贵金属",
  "Production": "产量",
  "Pulses": "豆类",
  "Rainfed": "雨养",
  "Rapeseed": "油菜籽",
  "Root crops": "根茎作物（合计）",
  "Sorghum": "高粱",
  "Soybean": "大豆",
  "Stimulants": "嗜好作物（咖啡・茶・可可）",
  "Sugarbeet": "甜菜",
  "Sugarcane": "甘蔗",
  "Sunflower": "向日葵",
  "Textiles": "纺织品",
  "Tobacco": "烟草",
  "Total": "合计",
  "Transportation": "运输设备",
  "Vegetable products": "植物产品",
  "Vegetables": "蔬菜",
  "Weather & disaster warnings": "气象与灾害警报",
  "Wetland rice": "水稻",
  "Wheat": "小麦",
  "Yams and other roots": "山药与其他根茎作物",
  "Yield": "单位产量",
  "Advanced settings": "高级设置",
  "Clear the loaded earthquake": "清除已加载的地震",
  "Depth": "深度",
  "Fault geometry": "断层形状",
  "Magnitude": "规模",
  "Model assumptions": "模型假设",
  "Play": "播放",
  "Playback speed": "播放速度",
  "Rupture size": "震源域大小",
  "Earthquake simulator": "地震模拟器",
  "Strike / dip / rake": "走向／倾角／滑移角",
  "Time since the rupture began": "自破裂开始经过的时间",
  "When": "发生时间",
  "Time-series — ": "时间序列 — ",
  "Source: World Bank Open Data": "来源：世界银行公开数据",
  "No data available": "没有可用的数据",
  " Do NOT open with a heading or bold line that merely repeats the place name — it is already on screen above your reply. Start straight with the content.": " 不要以只是重复地名的标题或粗体行开头——它已显示在你的回复上方。请直接从内容开始。",
  "Recent nearby news headlines — reflect these in \"Recent developments\":\n": "附近的近期新闻标题——请反映在「近期动态」中：\n",
  "Context — recent nearby headlines:\n": "脉络——附近的近期标题：\n",
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
  "Each answer shows a learning card about the country.": "每次作答都会显示该国的学习卡片。",
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
  "Date & time": "日期与时间",
  "FX": "汇率",
  "wind ": "风 ",
  "Weather unavailable": "无法取得天气",
  "FX unavailable": "无法取得汇率",
  "fatalities ": "死亡人数 ",
  "Enter your email + API key (free registration at acleddata.com).": "请输入电子邮件与 API 密钥（于 acleddata.com 免费注册）。",
  "Error: ": "错误：",
  "Nothing returned — check the key, email and your API quota.": "没有取得数据——请检查密钥、电子邮件与 API 用量。",
  "†": "†",
  "Conflict events (ACLED)": "冲突事件（ACLED）",
  "Load last 14 days": "加载最近 14 天",
  "Armed Conflict Location & Event Data. Needs the free-registration email + API key.": "Armed Conflict Location & Event Data。需要免费注册的电子邮件与 API 密钥。",
  "As of: ": "更新：",
  "Could not load — toggle again later.": "无法加载——请稍后再开启一次。",
  "Russian-occupied": "俄罗斯占领区",
  "Crimea / Donbas (pre-2022)": "克里米亚／顿巴斯（2022 年前）",
  "Liberated": "已解放地区",
  "Unknown status": "状态不明",
  "Other claimed area": "其他主张地区",
  "Shows from zoom 14. Tilt (3D button / right-drag) to see depth.": "缩放 14 以上显示。用 3D 按钮或右键拖动倾斜即可看见立体感。",
  "Source: historical-basemaps (boundaries approximate)": "来源：historical-basemaps（边界为概略）",
  "Could not load.": "无法加载。",
  "No dated eruption": "无确定年代的喷发",
  " last eruption": " 年最后喷发",
  "Could not load volcano data": "无法加载火山数据",
  "Erupted since 1950": "1950 年以后喷发",
  "Erupted since 1500": "1500 年以后喷发",
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
  "Ukraine frontline": "乌克兰前线",
  "Volcanoes": "火山",
  "Aurora forecast": "极光预报",
  "Earthquakes (USGS)": "地震（USGS）",
  "Population density": "人口密度",
  "Military spending ($B)": "国防支出（十亿美元）",
  "Military spending (%GDP)": "国防支出（占 GDP %）",
  "Historical borders": "历史国界",
  "Data centers / cloud": "数据中心／云端",
  "Pharma & health": "制药与医疗",
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
  "Intelligence (advanced)": "情报分析（高级）",
  "Disputed boundaries": "争议边界",
  "Air-defense coverage": "防空涵盖范围",
  "World languages": "世界语言分布",
  "Send feedback": "传送意见",
  "Rate IntMap and tell us what to improve.": "为 IntMap 评分，并告诉我们可以改进什么。",
  "For bugs, the <b>Bug Reporter</b> auto-attaches diagnostics.": "回报错误时，<b>错误回报</b>会自动附上诊断信息。",
  "Open it →": "开启 →",
  "Rating": "评分",
  "Comments (optional)": "意见（选填）",
  "Email (optional)": "电子邮件（选填）",
  "Submit": "送出",
  "Please pick a star rating.": "请选择星级评分。",
  "Sending…": "传送中…",
  "Could not send — please try again later.": "无法传送——请稍后再试。",
  "Thank you for your feedback": "感谢您的意见",
  "We read every note and use it to improve IntMap.": "我们会阅读每一则意见，并用于改进 IntMap。",
  "Thank you!": "谢谢您！",
  "Your high rating means a lot. If you enjoy IntMap, you can support its development — entirely optional.": "您的高度评价对我们意义重大。若您喜欢 IntMap，欢迎支持开发——完全出于自愿。",
  "Support IntMap": "支持 IntMap",
  "Maybe later": "下次再说",
  "Report a bug": "回报错误",
  "Describe what went wrong — steps to reproduce help a lot.": "请描述发生了什么问题——重现步骤会很有帮助。",
  "e.g. On mobile, tapping X causes Y…": "例：在手机上点击 X 会发生 Y…",
  "Diagnostics attached": "附加的诊断信息",
  "Submit report": "送出回报",
  "Copy report to clipboard": "复制回报内容到剪贴板",
  "Copied.": "已复制。",
  "Could not copy.": "无法复制。",
  "Please describe the bug.": "请描述错误内容。",
  "Report sent": "已送出回报",
  "Report saved": "已保存回报",
  "Thank you — we will look into it.": "感谢回报——我们会查看处理。",
  "Saved on this device and copied to your clipboard (offline).": "已离线保存在此设备并复制到剪贴板。",
  "Aurora forecast unavailable": "无法取得极光预报",
  "(unnamed)": "（无名称）",
  "Could not load plate data": "无法取得板块数据",
  "Could not load ecoregions": "无法加载生态地区数据",
  "Biome: ": "生物群系：",
  "Could not load railway data": "无法加载铁路数据",
  "Major pharma HQ / manufacturing clusters (representative sites). Pairs with the Life-expectancy layer.": "主要制药企业总部与制造聚落（代表地点）。可与平均寿命图层搭配。",
  "World Bank WGI “Control of Corruption” score (0–100, higher = cleaner) — the open-API counterpart of TI’s CPI.": "世界银行 WGI「贪腐控制」分数（0–100，愈高愈清廉）——相当于 TI 贪腐印象指数的开放 API 指标。",
  "Life expectancy at birth (World Bank, 2022).": "出生时平均余命（世界银行，2022）。",
  "Unemployment, total (% of labor force; modeled ILO / World Bank, latest year).": "失业率（占劳动力 %；ILO 推估／世界银行，最新年度）。",
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
  "By airport": "以机场为单位",
  "By runway": "以跑道为单位",
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
  "Global death toll passes 1 million.": "全球死亡人数突破 100 万。",
  "Global death toll passes 10 million.": "全球死亡人数突破 1000 万。",
  "a minor outbreak": "小规模流行后结束",
  "the outbreak has ended": "疫情已结束",
  "a devastating pandemic, now over": "毁灭性大流行后结束",
  "Infected": "感染",
  "Dead": "死亡",
  "Recovered": "康复",
  "Vaccinated": "接种",
  "Day": "日",
  "variants": "变异株",
  "vaccine R&D": "疫苗研发",
  "Outbreak setup": "疫情设置",
  "Infectivity R₀": "基本再生数 R₀",
  "Lethality %": "致死率（IFR）%",
  "Incubation (d)": "潜伏期（天）",
  "Infectious (d)": "传染期（天）",
  "Immunity (mo)": "免疫（月）",
  "▶ Tap a country on the map to place patient zero": "▶ 在地图上点击作为感染源的国家",
  "New outbreak": "重新开始",
  "⏸ Pause": "⏸ 暂停",
  "▶ Play": "▶ 播放",
  "Patient zero confirmed in ": "首例确诊于 ",
  "No data right now — please try again in a moment.": "目前无法取得数据，请稍后再试。",
  "Source: World Bank · ": "来源：世界银行 · ",
  " · most recent value per country": "（各国最新值）",
  " + IMF WEO general govt gross debt (gap-fill)": " ＋ IMF WEO（一般政府总债务）补齐",
  "24h": "24 小时",
  "7d": "7 天",
  "30d M4.5+": "30 天 M4.5+",
  "1yr M6+": "1 年 M6+",
  "Could not load earthquake data": "无法取得地震数据",
  "Could not load ECMWF weather": "无法加载 ECMWF 数据",
  "latest": "最新",
  "Analog clock": "模拟时钟",
  "FX rate": "汇率",
  "Crypto market cap": "加密资产市值",
  "Fear & Greed": "恐惧与贪婪指数",
  "On this day": "历史上的今天",
  "Featured layer": "推荐图层",
  "Random country": "随机国家",
  "Countdown": "倒数计时",
  "Sunrise & sunset": "日出与日落",
  "Moon phase": "月相",
  "Air quality (AQI)": "空气质量（AQI）",
  "ISS tracker": "国际太空站追踪",
  "World clock": "世界时钟",
  "Year progress": "今年进度",
  "How far through the year we are": "今年已过多少",
  "Featured article": "今日精选条目",
  "Wikipedia’s article of the day": "维基百科今日精选条目",
  "World population": "世界人口时钟",
  "UV index": "紫外线指数",
  "Next holiday": "下一个假日",
  "Next rocket launch": "下一次火箭发射",
  "Bitcoin network": "比特币网络",
  "Day progress": "今日进度",
  "How far through today we are": "今天已过多少",
  "Season": "季节",
  "Unix time": "Unix 时间",
  "Map center": "地图中心",
  "Next full moon": "下一次满月",
  "Edit": "编辑",
  "as of ": "更新于 ",
  "live estimate, UN-based": "以联合国推估为基础的实时估计",
  "Southern Hemisphere": "南半球",
  "Northern Hemisphere": "北半球",
  "seconds since 1970-01-01 UTC": "自 1970-01-01 UTC 起的秒数",
  "zoom ": "缩放 ",
  "lat ": "纬度 ",
  "daylight": "日照",
  "Allow location": "允许位置访问",
  "FX ": "汇率 ",
  "daylight ": "白昼长度 ",
  "age ": "月龄 ",
  "lit": "亮度",
  "dominance": "主导率",
  "Pop ": "人口 ",
  "Active": "活跃",
  "Quiet": "平静",
  "today": "今天",
  "block height": "区块高度",
  "Nine-dash line (S. China Sea)": "九段线（南海）",
  "Ukraine front line (approx.)": "乌克兰前线（概略）",
  "Kashmir Line of Control": "喀什米尔控制线",
  "Korean DMZ": "朝鲜半岛军事分界线",
  "Taiwan Strait median line": "台湾海峡中线",
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
  "Place a source and watch the shaking spread": "设置震源，观看摇晃如何扩散",
  "U.S. presidential elections": "美国总统选举",
  "Electoral votes": "选举人票",
  "majority": "过半数",
  "of the popular vote": "普选得票率",
  "Earlier election": "上一次选举",
  "Later election": "下一次选举",
  "Split districts": "分割的选区",
  "Colour = who received the state’s electoral votes.": "颜色代表取得该州选举人票的候选人。",
  "Source: National Archives · American Presidency Project": "来源：美国国家文件馆 · American Presidency Project",
  "Could not load the election data": "无法加载选举数据",
  "Day length": "昼长",
  "Map scale": "地图比例尺",
  "Calendar": "行事历",
  "Next new moon": "下一次新月",
  "Time zones (live clock)": "时区（实时时钟）",
  "⚠ Weather & disaster warnings": "⚠ 气象与灾害警报",
  "⚡ Energy mix": "⚡ 能源结构",
  "🌊 Ocean currents": "🌊 洋流",
  "🌊 Tides": "🌊 潮汐",
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
  "Continental, dry summer (cold)": "大陆性，夏干（冷凉）",
  "Continental, dry summer (severe)": "大陆性，夏干（酷寒）",
  "Continental, dry winter (hot summer)": "大陆性，冬干（夏热）",
  "Continental, dry winter (warm summer)": "大陆性，冬干（夏暖）",
  "Continental, dry-hot summer": "大陆性，夏干热",
  "Continental, dry-warm summer": "大陆性，夏干暖",
  "Court ruling": "司法判决界线",
  "Dominion of Newfoundland": "纽芬兰自治领",
  "East Germany": "东德",
  "East Turkestan": "东突厥斯坦",
  "Edge of the Milky Way’s stellar disc": "银河系恒星盘的边缘",
  "EEZ — 200 NM": "专属经济区 — 200 海里",
  "Free City of Danzig": "但泽自由市",
  "GN-z11 — one of the most distant galaxies measured (z = 10.6), comoving": "GN-z11 — 已测得最遥远的星系之一（z = 10.6），共动距离",
  "Heliopause — where Voyager 1 measured the solar wind stop": "日球层顶 — 航海家 1 号测得太阳风停止之处",
  "Hot desert": "热漠",
  "Hot steppe": "热草原",
  "Humid continental, hot summer": "湿润大陆性，夏热",
  "Humid continental, warm summer": "湿润大陆性，夏暖",
  "Humid subtropical": "湿润副热带",
  "Humid subtropical, dry winter": "湿润副热带，冬干",
  "Ice cap": "冰帽",
  "Joint regime": "共同管理海域",
  "Kuiper belt — the outer edge of the classical belt": "古柏带 — 传统带的外缘",
  "Manchukuo": "满洲国",
  "MapLibre (default)": "MapLibre（默认）",
  "Median line": "中线",
  "Mediterranean, cold summer": "地中海型，夏凉",
  "Mediterranean, hot summer": "地中海型，夏热",
  "Mediterranean, warm summer": "地中海型，夏暖",
  "Oceanic": "海洋性",
  "Oort cloud — the outer boundary inferred from long-period comets": "欧特云 — 由长周期彗星推得的外界",
  "Proxima Centauri — the nearest star": "比邻星 — 最近的恒星",
  "Savanna": "莽原",
  "Sirius — the brightest star in the sky": "天狼星 — 全天最亮的恒星",
  "South Vietnam": "南越",
  "South Yemen": "南也门",
  "Subarctic": "副极地",
  "Subarctic, dry winter": "副极地，冬干",
  "Subarctic, dry winter (severe)": "副极地，冬干（酷寒）",
  "Subarctic, severe winter": "副极地，冬季酷寒",
  "Subpolar oceanic": "副极地海洋性",
  "Subtropical highland": "副热带高地",
  "Subtropical highland, dry winter": "副热带高地，冬干",
  "Territorial sea — 12 NM": "领海 — 12 海里",
  "The Coma cluster — a thousand galaxies bound together": "后发座星系团 — 上千个星系受重力束缚在一起",
  "The cosmic microwave background — the oldest light there is (z ≈ 1100)": "宇宙微波背景 — 现存最古老的光（z ≈ 1100）",
  "The Large Magellanic Cloud — a satellite galaxy": "大麦哲伦星系 — 一个卫星星系",
  "The Orion Nebula — the nearest region forming massive stars": "猎户座大星云 — 最近的大质量恒星形成区",
  "The particle horizon — the edge of the observable universe": "粒子视界 — 可观测宇宙的边界",
  "The Pleiades — the nearest bright open cluster": "昴宿星团 — 最近的明亮疏散星团",
  "Tibet": "西藏",
  "Treaty boundary": "条约界线",
  "Tropical monsoon": "热带季风",
  "Tropical rainforest": "热带雨林",
  "Tundra": "苔原",
  "Unilateral claim (undisputed)": "单方主张（无争议）",
  "Unsettled / disputed": "未确定／有争议",
  "Unsettled median line": "未确定中线",
  "Virgo cluster — the centre of our supercluster": "室女座星系团 — 本超星系团的中心",
  "Airliner A320 · jet": "A320 客机 · 喷射机",
  "Austrian Empire": "奥地利帝国",
  "Austria-Hungary": "奥匈帝国",
  "British Raj (British India)": "英属印度",
  "Cessna 172 · trainer": "塞斯纳 172 · 教练机",
  "Czechoslovakia": "捷克斯洛伐克",
  "Dutch East Indies": "荷属东印度",
  "Empire of Brazil": "巴西帝国",
  "Empire of Japan": "大日本帝国",
  "Ethiopia (incl. Eritrea)": "埃塞俄比亚（含厄立特里亚）",
  "Ethiopian Empire": "埃塞俄比亚帝国",
  "F-16 · fighter": "F-16 · 战斗机",
  "F-35 Lightning II · stealth fighter": "F-35 闪电II · 匿踪战斗机",
  "Francoist Spain": "佛朗哥时期西班牙",
  "French Third Republic": "法兰西第三共和国",
  "German Empire": "德意志帝国",
  "Glider · sailplane": "滑翔机 · 无动力",
  "Imperial State of Iran": "伊朗帝国",
  "Indonesia (incl. East Timor)": "印尼（含东帝汶）",
  "Kingdom of Egypt": "埃及王国",
  "Kingdom of Hungary": "匈牙利王国",
  "Kingdom of Italy": "意大利王国",
  "Kingdom of Portugal": "葡萄牙王国",
  "Kingdom of Yugoslavia": "南斯拉夫王国",
  "Korean Empire": "大韩帝国",
  "Nautical seamarks (OpenSeaMap)": "航海标识（OpenSeaMap）",
  "Nazi Germany": "纳粹德国",
  "Ottoman Empire": "奥斯曼帝国",
  "P-51 Mustang · warbird": "P-51 野马 · 二战名机",
  "Pakistan (incl. East Pakistan)": "巴基斯坦（含东巴基斯坦）",
  "Persia": "波斯",
  "Qing Empire": "大清帝国",
  "Rail infrastructure (OpenRailwayMap)": "铁道基础设施（OpenRailwayMap）",
  "Republic of China": "中华民国",
  "Russian Empire": "俄罗斯帝国",
  "Seamarks (buoys, lights, depths) appear when you zoom into a coast or harbor.": "航海标识（浮标、灯标、水深）在放大到海岸或港口时才会显示。",
  "Serbia and Montenegro": "塞尔维亚和蒙特内哥罗",
  "Siam": "暹罗",
  "Soviet Russia (RSFSR)": "苏维埃俄国（俄罗斯苏维埃联邦社会主义共和国）",
  "Soviet Union": "苏联",
  "Spanish Republic": "西班牙共和国",
  "Sudan (incl. South Sudan)": "苏丹（含南苏丹）",
  "United Arab Republic": "阿拉伯联合共和国",
  "United Kingdom of Great Britain and Ireland": "大不列颠及爱尔兰联合王国",
  "Weimar Republic": "威玛共和国",
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
  "Alexandria, Virginia (USA)": "亚历山德里亚（美国弗吉尼亚州）",
  "Algeria": "阿尔及利亚",
  "Analysis": "分析",
  "Anglo-Egyptian Sudan": "英埃苏丹",
  "Angola": "安哥拉",
  "Annam": "安南",
  "Antarctica": "南极洲",
  "Arabia": "阿拉伯",
  "Arabia (Nejd)": "阿拉伯（内志）",
  "Armed forces personnel": "军队人数",
  "Asante": "阿散蒂",
  "Athens, Georgia (USA)": "雅典斯（美国佐治亚州）",
  "Athens, Greece": "雅典（希腊）",
  "Ato Trading Confederacy": "阿托贸易联盟",
  "Australia": "澳洲",
  "Automotive": "汽车",
  "Azimuthal equidistant": "方位等距投影",
  "Ballistic missiles": "弹道导弹",
  "Banking": "银行",
  "Barotse": "巴罗策",
  "Base": "基地",
  "Basutoland": "巴苏陀兰",
  "Bavaria": "巴伐利亚",
  "Bechuanaland": "贝专纳兰",
  "Belgian Congo": "比属刚果",
  "Belgium": "比利时",
  "Birmingham, Alabama (USA)": "伯明罕（美国阿拉巴马州）",
  "Birmingham, UK": "伯明罕（英国）",
  "Bohemia": "波希米亚",
  "Border": "边界",
  "Borgu States": "博尔古诸邦",
  "Bosnia-Herzegovina": "波士尼亚与赫塞哥维纳",
  "Brazil": "巴西",
  "British Bechuanaland": "英属贝专纳兰",
  "British East Africa": "英属东非",
  "British Guiana": "英属圭亚那",
  "British Honduras": "英属洪都拉斯",
  "British Protectorate": "英国保护地",
  "British Solomon Islands": "英属所罗门群岛",
  "British Somaliland": "英属索马利兰",
  "Buganda": "布干达",
  "Bunyoro": "布尼奥罗",
  "Burma": "缅甸",
  "Calabar": "卡拉巴尔",
  "Cambridge, Massachusetts (USA)": "剑桥（美国马萨诸塞州）",
  "Cambridge, UK": "剑桥（英国）",
  "Canal": "运河",
  "Cape Colony": "开普殖民地",
  "Central Asian Khanates": "中亚汗国",
  "Ceylon": "锡兰",
  "China": "中国",
  "Chinese Warlords": "中国军阀",
  "Chokepoint": "咽喉要道",
  "Clean cooking fuel access %": "洁净炊事燃料普及率 %",
  "CO₂ emissions (Mt)": "CO₂ 排放量（百万吨）",
  "Cochin China": "交趾支那",
  "Conflict": "冲突",
  "Congo": "刚果",
  "Congo Free State": "刚果自由邦",
  "Córdoba, Argentina": "科尔多瓦（阿根廷）",
  "Córdoba, Spain": "哥多华（西班牙）",
  "Cotonou": "科托努",
  "Cruise missiles": "巡弋导弹",
  "Custom XYZ source": "自定义 XYZ 瓦片来源",
  "Cyber": "网络",
  "Cyrenaica": "昔兰尼加",
  "Dahomey": "达荷美",
  "Dam": "水坝",
  "Danzig": "但泽",
  "Denmark": "丹麦",
  "Dutch Guiana": "荷属圭亚那",
  "Dutch New Guinea": "荷属新几内亚",
  "Earthquakes (live + history)": "地震（实时＋历史）",
  "East Aden Protectorate": "东亚丁保护地",
  "East Prussia": "东普鲁士",
  "Education spending % GDP": "教育支出 占GDP %",
  "Egypt": "埃及",
  "Electricity access %": "电力普及率 %",
  "Electricity use /capita (kWh)": "人均用电量（kWh）",
  "Emirate of Bin Shalan": "宾沙兰酋长国",
  "Emirate of Bukhara": "布哈拉汗国",
  "Employment in agriculture %": "农业就业比率 %",
  "Energy": "能源",
  "Energy use /capita": "人均能源消费",
  "Equal Earth": "等积地球投影",
  "Equirectangular": "等距圆柱投影",
  "Eritrea": "厄立特里亚",
  "Esri World Imagery": "Esri 卫星影像",
  "Ethiopia": "埃塞俄比亚",
  "Extreme poverty %": "极端贫穷 %",
  "Far Eastern Republic": "远东共和国",
  "FDI inflow % GDP": "外人直接投资流入 占GDP %",
  "Federated Malay States": "马来联邦",
  "Federation of Rhodesia and Nyasaland": "罗德西亚与尼亚萨兰联邦",
  "Federation of South Arabia": "南阿拉伯联邦",
  "Female labor participation %": "女性劳动参与率 %",
  "Fezzan": "费赞",
  "Fixed broadband /100": "固网宽带 /百人",
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
  "French Polynesia": "法属波利尼西亚",
  "French Somaliland": "法属索马利兰",
  "French Sudan": "法属苏丹",
  "French Togoland": "法属多哥兰",
  "French West Africa": "法属西非",
  "Futa Jallon": "富塔贾隆",
  "Futa Toro": "富塔托罗",
  "Gaza": "加沙",
  "GDP growth %": "GDP 成长率 %",
  "Georgia (the country)": "格鲁吉亚（国家）",
  "Georgia, USA (the state)": "佐治亚州（美国）",
  "German East Africa": "德属东非",
  "German New Guinea": "德属新几内亚",
  "German Solomon Islands": "德属所罗门群岛",
  "German South-West Africa": "德属西南非",
  "Germany": "德国",
  "Gilbert and Ellice Islands": "吉尔伯特及埃利斯群岛",
  "GNI per capita (Atlas, US$)": "人均国民所得毛额（Atlas法, 美元）",
  "Gold Coast": "黄金海岸",
  "Govt debt % GDP": "政府债务 占GDP %",
  "Gran Colombia": "大哥伦比亚",
  "Griqualand West": "西格里夸兰",
  "Guadalajara, Mexico": "瓜达拉哈拉（墨西哥）",
  "Guadalajara, Spain": "瓜达拉哈拉（西班牙）",
  "Guadeloupe": "瓜地洛普",
  "Guinea-Bissau": "几内亚比绍",
  "Hail": "哈伊勒",
  "Hawaii": "夏威夷",
  "Health spend %GDP": "医疗支出 占GDP %",
  "Heat of Attention": "关注度热区图",
  "Hejaz": "汉志",
  "High-tech exports %": "高科技产品出口 %",
  "Hokkaido Shinkansen": "北海道新干线",
  "Hokuriku Shinkansen": "北陆新干线",
  "Homicide rate /100k": "凶杀率 /十万人",
  "Hospital beds /1k": "病床数 /千人",
  "Hub": "枢纽",
  "Ibadan": "伊巴丹",
  "Imerina": "伊梅里纳",
  "Imperial Japan": "大日本帝国",
  "Income inequality (Gini)": "所得不平等（吉尼系数）",
  "India": "印度",
  "Indonesia": "印尼",
  "Infant mortality /1k": "婴儿死亡率 /千人",
  "Inflation % (CPI)": "通膨率 %（CPI）",
  "Information technology": "信息科技",
  "Inini": "伊尼尼",
  "Insurance": "保险",
  "Intl. tourist arrivals": "国际旅游客人次",
  "Irish Free State": "爱尔兰自由邦",
  "Israel": "以色列",
  "Italian Somaliland": "义属索马利兰",
  "Italy": "意大利",
  "Jamaica": "牙买加",
  "Japan": "日本",
  "Joetsu Shinkansen": "上越新干线",
  "Jordan": "约旦",
  "Joseon": "朝鲜",
  "Jupiter": "木星",
  "Kamerun": "德属喀麦隆",
  "Kampuchea": "柬埔寨（民主柬埔寨）",
  "Kanem-Bornu": "加涅姆-博尔努",
  "Karafuto": "桦太",
  "Khanate of Khiva": "希瓦汗国",
  "Kingdom of Brazil": "巴西王国",
  "Kingdom of Bulgaria": "保加利亚王国",
  "Kingdom of Greece": "希腊王国",
  "Kingdom of Hawaii": "夏威夷王国",
  "Kingdom of Iraq": "伊拉克王国",
  "Kingdom of Romania": "罗马尼亚王国",
  "Kingdom of Serbia": "塞尔维亚王国",
  "Kong": "孔",
  "Korea": "朝鲜",
  "Korea, Democratic People's Republic of": "朝鲜民主主义人民共和国",
  "Korea, Republic of": "大韩民国",
  "Kuba": "库巴王国",
  "Kyushu Shinkansen": "九州新干线",
  "Lagos": "拉哥斯",
  "Lagos Colony": "拉哥斯殖民地",
  "Libya": "利比亚",
  "Literacy rate %": "识字率 %",
  "Lozi": "洛齐",
  "Luba": "卢巴",
  "Lunda": "隆达",
  "Madagascar": "马达加斯加",
  "Malaya": "马来亚",
  "Manchester, New Hampshire (USA)": "曼彻斯特（美国新罕布什尔州）",
  "Manchester, UK": "曼彻斯特（英国）",
  "Manchu Empire": "满洲帝国",
  "Manchuria": "满洲",
  "Mandatory Palestine": "英属托管巴勒斯坦",
  "Manufacturing % GDP": "制造业 占GDP %",
  "Māori": "毛利",
  "Mapbox access token": "Mapbox 访问权杖",
  "Mapbox Satellite": "Mapbox 卫星影像",
  "Maritime": "海事",
  "Mars": "火星",
  "Martinique": "马丁尼克",
  "Mbailundu": "姆拜伦杜",
  "Mercury": "水星",
  "Mesopotamia": "美索不达米亚",
  "Military spending % GDP": "军事支出 占GDP %",
  "Mining": "矿业",
  "Mirambo": "米兰博",
  "Mobile subs /100": "移动电话门号 /百人",
  "Mollweide": "莫尔威投影",
  "Morocco": "摩洛哥",
  "Mossi States": "莫西诸邦",
  "Motor vehicle manufacturing": "汽车制造",
  "Mozambique": "莫桑比克",
  "Muscat and Oman": "马斯喀特和阿曼",
  "Naples, Florida (USA)": "那不勒斯（美国佛罗里达州）",
  "Naples, Italy": "拿坡里（意大利）",
  "NASA GIBS · MODIS Terra": "NASA GIBS · MODIS Terra",
  "NASA GIBS · VIIRS (NOAA-20)": "NASA GIBS · VIIRS (NOAA-20)",
  "NASA GIBS · VIIRS (SNPP)": "NASA GIBS · VIIRS (SNPP)",
  "Natal": "纳塔尔",
  "Naval base": "海军基地",
  "Ndebele": "恩德贝莱",
  "Neptune": "海王星",
  "Netherlands": "荷兰",
  "Netherlands Antilles": "荷属安的列斯",
  "Netherlands Indies": "荷属东印度",
  "New Caledonia and Dependencies": "新喀里多尼亚及其属地",
  "New Guinea": "新几内亚",
  "New Hebrides": "新赫布里底",
  "Newfoundland": "纽芬兰",
  "Nguni": "恩古尼",
  "Ngwato": "恩瓦托",
  "North Borneo": "北婆罗洲",
  "North Vietnam": "北越",
  "North Yemen": "北也门",
  "North-Eastern Rhodesia": "东北罗德西亚",
  "North-Western Rhodesia": "西北罗德西亚",
  "Northern Nigeria": "北尼日利亚",
  "Northern Rhodesia": "北罗德西亚",
  "Norway": "挪威",
  "Nuclear": "核能",
  "Nyasaland": "尼亚萨兰",
  "Oil Rivers Protectorate": "油河保护地",
  "Opobo": "奥波博",
  "Orange Free State": "奥兰治自由邦",
  "Overweight adults %": "成人过重比率 %",
  "Ovimbundu": "奥文本杜",
  "Oyo": "奥约",
  "Papua": "巴布亚",
  "Papua and New Guinea": "巴布亚与新几内亚",
  "Paris, France": "巴黎（法国）",
  "Paris, Texas (USA)": "巴黎斯（美国德州）",
  "Patent applications (resident)": "专利申请件数（本国）",
  "Perth, Australia": "伯斯（澳洲）",
  "Perth, Scotland (UK)": "伯斯（苏格兰）",
  "Pharmaceuticals": "制药",
  "Physicians /1k": "医师数 /千人",
  "Pipeline": "管线",
  "PM2.5 air pollution (µg/m³)": "PM2.5 空气污染（µg/m³）",
  "Population 65+ %": "65岁以上人口 %",
  "Population density /km²": "人口密度 /km²",
  "Population growth %": "人口成长率 %",
  "Port": "港口",
  "Portugal": "葡萄牙",
  "Portuguese East Africa": "葡属东非",
  "Portuguese Guinea": "葡属几内亚",
  "Portuguese Timor": "葡属帝汶",
  "Prussia": "普鲁士",
  "Puerto Rico": "波多黎各",
  "Question": "提问",
  "R&D spending % GDP": "研发支出 占GDP %",
  "Rapa Nui": "拉帕努伊",
  "Rattanakosin Kingdom": "拉达那哥欣王国",
  "Refugees hosted": "收容难民人数",
  "Remittances % GDP": "侨汇 占GDP %",
  "Renewable electricity %": "再生能源发电 %",
  "Renewable energy %": "再生能源比率 %",
  "Republic of Hawaii": "夏威夷共和国",
  "Researchers /million": "研究人员 /百万人",
  "Réunion": "留尼旺",
  "Rhodesia": "罗德西亚",
  "Rio de Oro": "里奥德奥罗",
  "Robinson": "罗宾森投影",
  "Ruanda-Urundi": "卢旺达-乌隆地",
  "Rural population %": "乡村人口 %",
  "Russia": "俄罗斯",
  "Rwanda": "卢旺达",
  "Saar Protectorate": "萨尔保护领",
  "Safe water access %": "安全饮用水普及率 %",
  "Saint Petersburg, Russia": "圣彼得堡（俄罗斯）",
  "Saipan": "塞班",
  "Samori Empire": "萨摩里帝国",
  "San Jose, California (USA)": "圣荷西（美国加州）",
  "San José, Costa Rica": "圣荷西（哥斯达黎加）",
  "Sanitation access %": "卫生设施普及率 %",
  "Santiago de Compostela, Spain": "圣地亚哥-德孔波斯特拉（西班牙）",
  "Santiago, Chile": "圣地牙哥（智利）",
  "Saturn": "土星",
  "Saudi Arabia": "沙特阿拉伯",
  "Secondary enrollment %": "中等教育就学率 %",
  "Sentinel Hub (S2 / Landsat)": "Sentinel Hub (S2 / Landsat)",
  "Sentinel Hub instance ID": "Sentinel Hub 执行个体 ID",
  "Sentinel-2 cloudless (EOX)": "Sentinel-2 无云影像（EOX）",
  "Shona": "绍纳",
  "Smoking prevalence %": "吸烟率 %",
  "Software": "软件",
  "Sokoto Caliphate": "索科托哈里发国",
  "South Africa": "南非",
  "South Korea": "南韩",
  "South Russia": "南俄罗斯",
  "South West Africa": "西南非",
  "Southern Cameroons": "南喀麦隆",
  "Southern Nigeria": "南尼日利亚",
  "Southern Rhodesia": "南罗德西亚",
  "Spaceport": "太空发射场",
  "Spain": "西班牙",
  "Spanish Guinea": "西属几内亚",
  "Spanish Morocco": "西属摩洛哥",
  "Spanish Sahara": "西属撒哈拉",
  "St. Petersburg, Florida (USA)": "圣彼得堡（美国佛罗里达州）",
  "Strait": "海峡",
  "Straits Settlements": "海峡殖民地",
  "Suicide rate /100k": "自杀率 /十万人",
  "Sultanate of Utetera": "乌泰泰拉苏丹国",
  "Sultanate of Zanzibar": "尚吉巴苏丹国",
  "Swaziland": "斯威士兰",
  "Sweden–Norway": "瑞典-挪威",
  "Sydney, Australia": "雪梨（澳洲）",
  "Sydney, Nova Scotia (Canada)": "雪梨（加拿大新斯科细亚省）",
  "Syria": "叙利亚",
  "Tanganyika": "坦干伊喀",
  "Tanzania, United Republic of": "坦桑尼亚联合共和国",
  "Tax revenue % GDP": "税收 占GDP %",
  "Tech hub": "科技枢纽",
  "Teke": "特克",
  "Telecommunications": "电信",
  "Tertiary enrollment %": "高等教育就学率 %",
  "The Bahamas": "巴哈马",
  "The Gambia": "冈比亚",
  "Togoland": "多哥兰",
  "Tohoku Shinkansen": "东北新干线",
  "Tokaido–Sanyo Shinkansen": "东海道・山阳新干线",
  "Tonkin": "东京（越南北圻）",
  "Tourist arrivals": "旅游客人次",
  "Trade % of GDP": "贸易 占GDP %",
  "Transjordan": "外约旦",
  "Transvaal": "德兰士瓦",
  "Trinidad": "千里达",
  "Tripoli, Lebanon": "的黎波里（黎巴嫩）",
  "Tripoli, Libya": "的黎波里（利比亚）",
  "Tripolitania": "的黎波里塔尼亚",
  "Trucial Oman": "休战阿曼",
  "Tukular Caliphate": "图库洛尔帝国",
  "Türkiye": "土耳其",
  "Ubangi-Shari": "乌班吉沙立",
  "Ukraine": "乌克兰",
  "Under-5 mortality /1k": "五岁以下死亡率 /千人",
  "Undernourishment %": "营养不足人口 %",
  "Unemployment %": "失业率 %",
  "Unfederated Malay States": "马来属邦",
  "Union of South Africa": "南非联邦",
  "United Kingdom": "英国",
  "United States": "美国",
  "Upper Volta": "上伏塔",
  "Uranus": "天王星",
  "Urban population %": "都市人口 %",
  "Valencia, Spain": "瓦伦西亚（西班牙）",
  "Valencia, Venezuela": "瓦伦西亚（委内瑞拉）",
  "Venus": "金星",
  "Wallis and Futuna Islands": "瓦利斯和富图纳群岛",
  "Walvis Bay": "鲸湾港",
  "West Bank": "约旦河西岸",
  "West Irian": "西伊里安",
  "Western Sahara": "西撒哈拉",
  "White Russia": "白俄罗斯",
  "Winkel Tripel": "温克尔三重投影",
  "Women in parliament %": "女性国会议员比率 %",
  "Xinjiang": "新疆",
  "XYZ URL template — use {z}/{x}/{y}": "XYZ 网址范本 — 使用 {z}/{x}/{y}",
  "Yaka": "亚卡",
  "Yeke": "耶凯",
  "Yemen": "也门",
  "yesterday": "昨天",
  "Zaire": "萨伊",
  "Zululand": "祖鲁兰",
  "Accessibility": "无障碍",
  "Account / login": "账号／登录",
  "Account & sign-in": "账号与登录",
  "AI & Atlas": "AI 与 Atlas",
  "AI features": "AI 功能",
  "Data accuracy": "数据准确度",
  "Design & layout": "设计与版面",
  "Map & layers": "地图与图层",
  "Mobile": "移动设备",
  "Performance": "性能",
  "Performance / crash": "性能／崩溃",
  "Simulators": "模拟器",
  "Space & sky": "太空与星空",
  "Translation & language": "翻译与语言",
  "UI / display": "界面／显示",
  "Aerosol optical depth — how much haze, smoke and dust dim sunlight in the air column.": "气溶胶光学厚度 — 大气中的霾、烟与尘埃遮蔽阳光的程度。",
  "Aerospace & Defense": "航太与国防",
  "Altitude limit": "高度上限",
  "Annual consumer-price inflation (%) — how fast prices are rising.": "年度消费者物价通膨率（%）— 物价上涨的速度。",
  "Annual precipitation (mm)": "年降水量（mm）",
  "Arable land %": "耕地比例 %",
  "Arid — annual precipitation below the Köppen dryness threshold": "干燥 — 年降水量低于柯本干燥门槛",
  "Armed forces": "军队人数",
  "Artificial light at night, from satellite — a proxy for urbanization and economic activity.": "卫星观测的夜间人造光 — 都市化与经济活动的替代指标。",
  "Australia & New Zealand": "澳洲与新西兰",
  "Average number of children a woman would have over her lifetime; about 2.1 keeps a population stable.": "妇女一生平均生育子女数；约 2.1 可维持人口稳定。",
  "Basic sanitation %": "基本卫生设施 %",
  "Basic water access %": "基本饮用水普及率 %",
  "Battery capacity": "电池容量",
  "Battery for the return": "返航所需电量",
  "Battery reserve": "电池保留量",
  "Boundaries of Earth’s tectonic plates — where most earthquakes and volcanoes occur.": "地球板块边界 — 多数地震与火山发生之处。",
  "Buddhism": "佛教",
  "Caribbean": "加勒比地区",
  "Christianity": "基督宗教",
  "Climb rate": "爬升率",
  "Climb-limited": "受爬升能力限制",
  "Cold — mean annual < 18 °C": "冷 — 年均温低于 18 °C",
  "Consumer": "消费",
  "Consumer Staples": "民生必需品",
  "Continental — coldest month < 0 °C, warmest > 10 °C": "大陆性 — 最冷月低于 0 °C、最暖月高于 10 °C",
  "Cool short summer — 1–3 months > 10 °C": "夏季短凉 — 高于 10 °C 者 1～3 个月",
  "Corruption (control, WGI)": "贪腐控制（WGI）",
  "Crosswind": "侧风",
  "Cruise power draw": "巡航耗电",
  "Cruise speed": "巡航速度",
  "Currency": "货币",
  "Deaths before age 5 per 1,000 live births.": "每千名活产中未满 5 岁死亡数。",
  "Defense budget as a share of the country’s GDP — its military burden on the economy.": "国防预算占 GDP 的比重 — 经济承担的军事负担。",
  "Descent rate": "下降率",
  "Desert (true arid)": "沙漠（真正干燥）",
  "Distinct ecological regions (WWF/RESOLVE) grouping similar species, climate and habitat.": "依相似物种、气候与栖地划分的生态区（WWF/RESOLVE）。",
  "Dominant religion": "主要宗教",
  "Dry summer": "夏干",
  "Dry winter": "冬干",
  "E-commerce": "电子商务",
  "Eastern Africa": "东非",
  "Eastern Europe": "东欧",
  "Education spend %GDP": "教育支出占 GDP %",
  "EIU score (0–10) of elections, pluralism, civil liberties and governance. Higher = more democratic.": "EIU 对选举、多元、公民自由与治理的评分（0～10）。愈高愈民主。",
  "Electricity use /capita": "人均用电量",
  "Elevation data": "高程数据",
  "Emergency landing sites": "紧急降落地点",
  "Empty mass": "空机重量",
  "Environment & energy": "环境与能源",
  "ESA satellite land-cover classes (forest, cropland, built-up, water…) at 10 m resolution.": "ESA 卫星土地覆盖分类（森林、农地、建成区、水域等），分辨率 10 米。",
  "EU members": "欧盟成员国",
  "Europe": "欧洲",
  "Exclusive Economic Zone — the sea a country controls for fishing & resources, out to 200 nautical miles.": "专属经济海域 — 国家可管理渔业与资源的海域，自岸起 200 海里。",
  "Female labor force %": "女性劳动参与率 %",
  "Financials": "金融",
  "Fiscal & trade": "财政与贸易",
  "Fixed-wing / VTOL survey aircraft": "定翼／垂直起降测绘机",
  "Flag": "国旗",
  "GDP/capita (PPP)": "人均 GDP（购买力平价）",
  "Gini index of income inequality (0 = perfectly equal, 100 = maximally unequal).": "所得不均吉尼系数（0＝完全平等，100＝极度不均）。",
  "GNI per capita": "人均国民所得毛额",
  "Ground clearance": "离地高度",
  "Healthcare": "医疗保健",
  "Heavy-lift multirotor": "重载多旋翼机",
  "Hinduism": "印度教",
  "HIV prevalence %": "艾滋病毒盛行率 %",
  "Hot — mean annual ≥ 18 °C": "热 — 年均温 18 °C 以上",
  "Hot summer — warmest ≥ 22 °C": "夏热 — 最暖月 22 °C 以上",
  "Human Development Index — a 0–1 blend of life expectancy, schooling and income. Higher = more developed.": "人类发展指数 — 由平均寿命、教育与所得合成的 0～1 指标。愈高愈发展。",
  "Ice cap — every month < 0 °C": "冰原 — 各月皆低于 0 °C",
  "Indonesian": "印尼语",
  "Industrials": "工业",
  "Infant deaths before age 1 per 1,000 live births — a core health/development indicator.": "每千名活产中未满 1 岁死亡数 — 核心健康与发展指标。",
  "Internet & Media": "网络与媒体",
  "Internet users (%)": "网络使用率（%）",
  "Islam": "伊斯兰教",
  "Judaism": "犹太教",
  "Languages": "语言",
  "Life expectancy (years)": "平均寿命（年）",
  "Materials": "原物料",
  "Max altitude (AGL)": "最大高度（离地）",
  "Max speed": "最大速度",
  "Media": "媒体",
  "Melanesia": "美拉尼西亚",
  "Micronesia": "密克罗尼西亚",
  "Middle Africa": "中非",
  "Mil. spend (% GDP)": "国防支出（占 GDP %）",
  "Mil. spending": "国防支出",
  "Min ground clearance (AGL)": "最低离地高度（AGL）",
  "Modeled auroral oval — where the northern/southern lights are likely visible right now.": "极光椭圆模型 — 目前可能看得到极光的区域。",
  "Monsoonal — brief dry season, very wet overall": "季风型 — 干季短、整体极湿",
  "No dry season (rain year-round)": "无干季（全年有雨）",
  "Northern Africa": "北非",
  "Northern America": "北美洲",
  "Northern Europe": "北欧",
  "Oceania": "大洋洲",
  "Out-of-pocket health %": "自付医疗支出 %",
  "Payload": "酬载重量",
  "Payments": "支付",
  "People & society": "人口与社会",
  "People per km² on a fine 1 km grid (not country averages) — shows where people actually cluster.": "以 1 公里网格计算的人口密度（非国家平均）— 呈现人群实际聚集之处。",
  "Physicians per 1,000 people — a measure of healthcare capacity.": "每千人医师数 — 医疗量能的指标。",
  "PM2.5 air pollution": "PM2.5 空气污染",
  "Polar — warmest month < 10 °C": "极地 — 最暖月低于 10 °C",
  "Polynesia": "波利尼西亚",
  "Primary language": "主要语言",
  "Projected coastline change if sea level rises by the chosen amount — areas below that height flood.": "依所选海平面上升幅度推估的海岸线变化 — 低于该高度的地区将被淹没。",
  "Prosumer quadcopter (~1 kg)": "半专业四旋翼机（约 1 公斤）",
  "Public webcams worldwide, loaded live from OpenStreetMap for the current view — pan/zoom for more. Click a point: YouTube/image/panorama cams play in the popup, others open the operator page.": "全球公开网络摄影机，依目前画面范围自 OpenStreetMap 实时加载（平移或缩放可加载更多）。点击一个点：YouTube、影像与全景会在窗口中播放，其余则开启营运者页面。",
  "R&D spend %GDP": "研发支出占 GDP %",
  "Radio line of sight": "无线电视距",
  "Radio link & line of sight": "无线电链路与视距",
  "Radio range": "无线电距离",
  "Range": "续航距离",
  "Reference": "基准",
  "Restricted area": "禁限航区",
  "Retail": "零售",
  "Satellite-detected heat sources in the last hours — mostly wildfires, also flares and volcanoes.": "近数小时卫星侦测到的热源 — 多为野火，也包括燃烧塔与火山。",
  "Sea-surface temperature from satellite — the skin temperature of the ocean.": "卫星量测的海表温度 — 海洋表层的温度。",
  "Semiconductors": "半导体",
  "Severe winter — coldest < −38 °C": "严寒 — 最冷月低于 −38 °C",
  "Share of final energy from renewable sources (hydro, wind, solar, biomass…).": "最终能源中再生能源（水力、风力、太阳能、生质等）的比重。",
  "Share of land used for agriculture (crops + pasture).": "用于农业（耕地＋牧地）的土地比例。",
  "Share of people living on less than ~$2.15 a day (extreme poverty).": "每日生活费低于约 2.15 美元的人口比例（极端贫穷）。",
  "Share of people with safely managed drinking water.": "可取得安全管理饮用水的人口比例。",
  "Snow and ice cover from satellite (NDSI index). Brighter = more snow/ice on the ground.": "卫星观测的积雪与冰覆盖（NDSI 指数）。愈亮代表雪冰愈多。",
  "South America": "南美洲",
  "Southern Africa": "南部非洲",
  "Southern Europe": "南欧",
  "Standard time-zone boundaries (Natural Earth) with each zone’s current local time, updated every minute.": "标准时区界线（Natural Earth）并显示各时区目前当地时间，每分钟更新。",
  "Steppe (semi-arid)": "草原（半干燥）",
  "Sub-250 g class quadcopter": "250 公克以下级四旋翼机",
  "Submarine fiber-optic cables carrying almost all intercontinental internet traffic.": "承载几乎所有洲际网络流量的海底光纤电缆。",
  "Technology": "科技",
  "Telecom": "电信",
  "Temperate — coldest month 0–18 °C": "温带 — 最冷月 0～18 °C",
  "Terrain": "地形",
  "Total annual defense budget in US$ billions.": "年度国防预算总额（十亿美元）。",
  "Transparency International score (0–100) of perceived public-sector corruption. Higher = cleaner.": "国际透明组织的公部门贪腐印象指数（0～100）。愈高愈清廉。",
  "Tropical — coldest month ≥ 18 °C": "热带 — 最冷月 18 °C 以上",
  "Tundra — warmest month 0–10 °C": "苔原 — 最暖月 0～10 °C",
  "Unaffiliated": "无宗教信仰",
  "Unemployment rate (%)": "失业率（%）",
  "Warm summer — warmest < 22 °C, ≥4 months > 10 °C": "夏温 — 最暖月低于 22 °C，高于 10 °C 者 4 个月以上",
  "Western Africa": "西非",
  "Western Asia": "西亚",
  "Western Europe": "西欧",
  "Wind at altitude": "高空风",
  "Wind data": "风场数据",
  "Wind limit": "风速上限",
  "Year-on-year real GDP growth (%) — how fast the economy is expanding or contracting.": "实质 GDP 年增率（%）— 经济扩张或萎缩的速度。",
  "Add a company…": "新增公司…",
  "Add condition": "新增条件",
  "as of": "截至",
  "Company": "公司",
  "Compare companies": "比较公司",
  "Export CSV": "导出 CSV",
  "Filter by value": "依数值筛选",
  "Founded": "成立",
  "Headquarters": "总部",
  "In comparison": "比较中",
  "Loading price history…": "正在加载价格历史…",
  "Loading share-price history…": "正在加载股价历史…",
  "Market cap": "市值",
  "market cap at year-end · today's share counts · other figures latest reported": "年终市值 · 目前股数 · 其他数字为最新申报值",
  "Market cap: today's share count × historical price · US-listed live names only": "市值：目前股数 × 历史股价 · 仅限美股上市个股",
  "Metrics": "指标",
  "monthly close, split-adjusted (Yahoo)": "月收盘价，经分割调整（Yahoo）",
  "Net income": "净利",
  "No conditions yet.": "尚无条件。",
  "No data for the selected metrics.": "所选指标没有数据。",
  "no history": "无历史数据",
  "No price history for these companies (US-listed live names only).": "这些公司没有价格历史（仅限美股上市个股）。",
  "No share-price history (snapshot figure only).": "无股价历史（仅有单点数值）。",
  "P/E ratio": "本益比",
  "Pick at least one metric above.": "请在上方至少选择一项指标。",
  "reported": "申报",
  "Sector": "产业",
  "Share price": "股价",
  "value (5B, 100000…)": "数值（5B、100000…）",
  "value (5M, 20000…)": "数值（5M、20000…）",
  "Coal": "煤",
  "Gas": "天然气",
  "Oil": "石油",
  "Hydro": "水力",
  "Solar": "太阳能",
  "Bioenergy": "生质能",
  "Other renewables": "其他再生能源",
  "Snowstorm": "暴风雪",
  "Storm": "暴风",
  "High waves": "巨浪",
  "Storm surge": "风暴潮",
  "Dense fog": "浓雾",
  "Dry air": "干燥",
  "Avalanche": "雪崩",
  "Low temperature": "低温",
  "Frost": "霜",
  "Snow accretion": "积雪附着",
  "Snowmelt": "融雪",
  "Earthquake": "地震",
  "Volcano": "火山",
  "Drought": "干旱",
  "Wildfire": "野火",
  "Air temperature": "气温",
  "Sea surface temp": "海面温度",
  "in view": "视野内",
  "News points": "新闻地点",
  "Live aircraft": "实时航班",
  "Live ships": "实时船舶",
  "tracked": "追踪中",
  "yrs": "年",
  "Country choropleth": "国家分级着色图",
  "fire pixels within ~15 km": "约 15 公里内火点像元",
  "none detected within ~15 km": "约 15 公里内未侦测到",
  "Thermal anomalies (fires)": "热异常（火点）",
  "last": "最近",
  "Tree cover": "树木覆盖",
  "Shrubland": "灌木地",
  "Grassland": "草地",
  "Cropland": "农地",
  "Built-up": "建成区",
  "Bare / sparse vegetation": "裸地／稀疏植被",
  "Snow and ice": "冰雪",
  "Permanent water bodies": "永久水体",
  "Herbaceous wetland": "草本湿地",
  "Mangroves": "红树林",
  "Moss and lichen": "苔藓与地衣",
  "Standard 1435 mm": "标准轨 1435 mm",
  "Iberian 1668 mm": "伊比利轨距 1668 mm",
  "Irish 1600 mm": "爱尔兰轨距 1600 mm",
  "Religion distribution": "宗教分布",
  "Language distribution": "语言分布",
  "2011 Tōhoku (Great East Japan)": "2011 东北（东日本大地震）",
  "JMA 7 (Kurihara, Miyagi)": "JMA 7（宫城县栗原）",
  "Moment magnitude 9.0 (JMA) to 9.1 (USGS).": "矩震级 9.0（JMA）至 9.1（USGS）。",
  "1960 Valdivia (Great Chilean)": "1960 瓦尔迪维亚（智利大地震）",
  "MMI XI–XII (Valdivia · Puerto Montt)": "MMI XI–XII（瓦尔迪维亚 · 蒙特港）",
  "The largest earthquake ever instrumentally recorded.": "有仪器纪录以来最大的地震。",
  "1964 Great Alaska (Prince William Sound)": "1964 阿拉斯加大地震（威廉王子湾）",
  "MMI XI (Anchorage · Valdez · Seward)": "MMI XI（安克拉治 · 瓦尔迪兹 · 苏厄德）",
  "The second-largest earthquake ever instrumentally recorded.": "有仪器纪录以来第二大的地震。",
  "2004 Sumatra–Andaman (Indian Ocean)": "2004 苏门答腊–安达曼（印度洋）",
  "MMI IX (Banda Aceh)": "MMI IX（班达亚齐）",
  "Rupture ran roughly 1,300 km northward over about 10 minutes.": "破裂在约 10 分钟内向北延伸约 1,300 公里。",
  "1995 Kobe (Great Hanshin-Awaji)": "1995 神户（阪神·淡路大地震）",
  "JMA 7 — the first time the class was ever assigned": "JMA 7——该级别首次被使用",
  "A shallow crustal strike-slip event directly beneath a city — small moment, extreme local intensity.": "都市正下方的浅层走滑地震——矩不大，但局部震度极高。",
  "1923 Great Kantō": "1923 关东大地震",
  "JMA 6 on the scale of the day (Sagami Bay coast, Tokyo lowlands)": "依当时阶级为 JMA 6（相模湾沿岸、东京低地）",
  "Most of the loss came from fire, not from shaking: the simulator models the shaking only.": "多数损失来自火灾而非震动；本模拟器仅计算震动。",
  "2023 Kahramanmaraş (Türkiye–Syria)": "2023 卡赫拉曼马拉什（土耳其–叙利亚）",
  "MMI XI–XII (Antakya · Kahramanmaraş)": "MMI XI–XII（安塔基亚 · 卡赫拉曼马拉什）",
  "A second Mw 7.5 event on the Çardak fault followed nine hours later; only the first is modelled here.": "九小时后恰尔达克断层又发生 Mw 7.5 地震；此处仅模拟第一次。",
  "2008 Wenchuan (Sichuan)": "2008 汶川（四川）",
  "CSIS XI (Yingxiu · Beichuan) ≈ MMI XI": "中国震度 XI（映秀 · 北川）≈ MMI XI",
  "The rupture ran ~300 km northeast along the Longmenshan thrust — strongly unilateral.": "破裂沿龙门山逆冲断层向东北延伸约 300 公里，具强烈单向性。",
  "2010 Haiti (Léogâne)": "2010 海地（莱奥甘）",
  "MMI IX (Port-au-Prince · Léogâne)": "MMI IX（太子港 · 莱奥甘）",
  "Most of the slip was on a blind thrust beside the Enriquillo fault, not on the fault itself.": "多数滑移发生在恩里基约断层旁的盲逆断层，而非断层本身。",
  "2024 Noto Peninsula": "2024 能登半岛",
  "JMA 7 (Shika, Ishikawa); MMI IX": "JMA 7（石川县志贺町）；MMI IX",
  "A reverse-fault rupture on the peninsula’s north coast that lifted the coastline out of the sea — the ground itself rose, so several fishing harbours were left dry.": "半岛北岸的逆断层破裂使海岸线抬升出海面——地盘本身上升，数个渔港因而干涸。",
  "Light (< 7 t)": "轻型（< 7 吨）",
  "Small (7–34 t)": "小型（7–34 吨）",
  "Large (34–136 t)": "大型（34–136 吨）",
  "High-vortex large (B757)": "大型高涡流（B757）",
  "Heavy (> 136 t)": "重型（> 136 吨）",
  "High performance (> 5 g, > 400 kn)": "高性能（> 5 g、> 400 节）",
  "Rotorcraft": "旋翼机",
  "Glider / sailplane": "滑翔机",
  "Lighter-than-air": "轻于空气航空器",
  "Parachutist": "跳伞者",
  "Ultralight / paraglider": "超轻型／飞行伞",
  "Unmanned aircraft": "无人航空器",
  "Space / trans-atmospheric": "太空／跨大气层飞行器",
  "Surface — emergency vehicle": "地面车辆（紧急）",
  "Surface — service vehicle": "地面车辆（勤务）",
  "Point obstacle": "点状障碍物",
  "Earth": "地球",
  "Pluto": "冥王星",
  "Ukraine frontline (DeepState)": "乌克兰前线（DeepState）",
  "Ukraine frontline (live)": "乌克兰前线（实时）",
  "3D buildings (cities)": "3D 建筑（城市）",
  "Volcanoes (Smithsonian GVP)": "火山（史密森尼 GVP）",   /* (#R432) */
  "Unchanged / not confirmed": "未变／未确认",
  "Data gaps": "数据缺口",
  "Limitations": "限制与不确定性",
  "arrives": "到达",
  "no arrival": "未到达",
  "coast": "沿岸",
  "Elevation relief": "高程晕渲",
  "Population density (1 km grid)": "人口密度（1 公里网格）",
  "Explore the world, one layer at a time": "一层一层，探索世界",
  "100+ data layers": "超过 100 种数据图层",
  "Climate, population, economy, geopolitics & live weather": "气候、人口、经济、地缘政治与实时天气",
  "Live news map": "实时新闻地图",
  "World headlines pinned to where they actually happen": "把世界头条钉在真正发生的地点",
  "Globe, satellite & time machine": "地球仪、卫星与时光机",
  "3D terrain, real imagery, and travel back to 1850": "3D 地形、实拍影像，回溯至 1850 年",
  "Atlas AI & country data": "Atlas AI 与国家数据",
  "Ask in plain language, compare countries, even fly a jet": "用日常语言提问、比较国家，甚至驾驶喷射机",
  "Start exploring": "开始探索",
  "Africa": "非洲",
  "Asia": "亚洲",
  "North America": "北美洲",
    "Address": "地址",   /* (#R255) */
    "Airfields, naval bases, barracks, ranges and danger areas tagged military in OpenStreetMap for the current view. The public record only — nothing here is inferred from imagery.": "目前视野范围内 OpenStreetMap 标记为 military 的机场、海军基地、营区、靶场与危险区域。仅为公开纪录，未包含任何影像判读推估。",   /* (#R255) */
    "Base / barracks": "基地／营区",   /* (#R255) */
    "Beds": "病床数",   /* (#R255) */
    "Clear search": "清除搜索",   /* (#R255) */
    "Clinic": "诊所",   /* (#R255) */
    "Communication tower / mast": "通讯塔／天线杆",   /* (#R255) */
    "Consulate": "领事馆",   /* (#R255) */
    "Diplomatic missions": "外交馆舍",   /* (#R255) */
    "Doctors": "医师诊间",   /* (#R255) */
    "Embassies, consulates and other diplomatic missions mapped in OpenStreetMap for the current view. Click any point for the record.": "目前视野范围内 OpenStreetMap 上的大使馆、领事馆等外交馆舍。点击任一点位可查看纪录。",   /* (#R255) */
    "Embassy": "大使馆",   /* (#R255) */
    "Emergency": "紧急",   /* (#R255) */
    "Health facilities": "医疗机构",   /* (#R255) */
    "Height": "高度",   /* (#R255) */
    "Hospital": "医院",   /* (#R255) */
    "Hospitals, clinics, doctors and pharmacies mapped in OpenStreetMap for the current view. Click any point for beds, speciality, operator and opening hours where the object carries them.": "目前视野范围内 OpenStreetMap 上的医院、诊所与药局。病床数、科别、经营者与看诊时间仅在该对象本身带有标签时显示。",   /* (#R255) */
    "Internet exchange": "互联网交换中心",   /* (#R255) */
    "Internet exchanges, telephone exchanges, communication masts and towers mapped in OpenStreetMap for the current view — the physical plant the network actually runs on.": "目前视野范围内 OpenStreetMap 上的互联网交换中心、电话交换局与通讯塔——网络实际运行所依附的实体设施。",   /* (#R255) */
    "Military sites": "军事设施",   /* (#R255) */
    "objects in view": "笔（视野范围内）",   /* (#R255) */
    "Opening hours": "看诊时间",   /* (#R255) */
    "Other military site": "其他军事设施",   /* (#R255) */
    "Other mission": "其他馆舍",   /* (#R255) */
    "Pharmacy": "药局",   /* (#R255) */
    "Phone": "电话",   /* (#R255) */
    "Range / danger area": "靶场／危险区域",   /* (#R255) */
    "Represents": "派遣国",   /* (#R255) */
    "Service": "所属军种",   /* (#R255) */
    "Speciality": "科别",   /* (#R255) */
    "Surveyed in OpenStreetMap. Every field above is that object’s own tag; nothing is inferred, and a field the object does not carry is left out rather than estimated.": "OpenStreetMap 的实测数据。上述字段皆为该对象自身的标签，未做任何推论；对象未带有的字段一律略过，不做估算。",   /* (#R255) */
    "Telecom & internet infrastructure": "电信与互联网基础设施",   /* (#R255) */
    "Telephone exchange": "电话交换局",   /* (#R255) */
    "This crop layer could not start.": "无法启动此作物图层。",   /* (#R255) */
    "Zoom in to load this view": "请放大以加载此范围",   /* (#R255) */
    " countries": " 个国家",   /* (#R266) */
    " countries reporting": " 个国家有数据",   /* (#R266) */
    " · ": " · ",   /* (#R266) */
    "An anomaly is a DIFFERENCE, not a temperature. Each pixel is today’s sea-surface temperature minus the 1985–2014 average for that same spot on that same day of the year, so red means warmer than usual there and blue means cooler than usual there — a +2 °C patch in the Arctic and a +2 °C patch in the tropics are the same departure from normal, not the same water. Grey is normal. The scale is clamped at ±3 °C. This is the map El Niño and La Niña are read off: a warm tongue along the equatorial Pacific is El Niño, a cool one is La Niña.": "距平是「差值」而非水温本身：每个像素是当日该点的海面水温，减去同一地点、同一日期的 1985–2014 年平均。红色代表比当地常年偏暖，蓝色代表偏冷，灰色为接近常年；色阶上限为 ±3 °C。圣婴／反圣婴即由此图判读——赤道太平洋出现暖舌为圣婴，冷舌为反圣婴。",   /* (#R266) */
    /* (#R266) */
    "Catholic": "天主教",   /* (#R266) */
    /* (#R266) */
    /* (#R266) */
    "Christian (not separated)": "基督宗教（未分教派）",   /* (#R266) */
    /* (#R266) */
    "Each country is coloured by the group with the largest share; tap a country for the full composition. Source: CIA World Factbook (public domain).": "各国以占比最大的群体上色；点击国家可看完整组成。数据来源：CIA World Factbook（公有领域）。",   /* (#R266) */
    /* (#R266) */
    /* (#R266) */
    "Finnish 1524 mm": "芬兰轨距 1524 mm",   /* (#R266) */
    "Folk & traditional": "民间与传统宗教",   /* (#R266) */
    /* (#R266) */
    "How far today’s sea-surface temperature is from normal for this place and this time of year": "当日海面水温与该地、该时期常年值的差距",   /* (#R266) */
    /* (#R266) */
    "Latest per country": "各国最新年",   /* (#R266) */
    /* (#R266) */
    /* (#R266) */
    "Normal 1981–2010 (1 km)": "常年值 1981–2010（1 公里）",   /* (#R266) */
    "Normal: CHELSA V2.1 bio12, mean annual precipitation 1981–2010, 30 arc-seconds (~1 km), reprojected to Web Mercator and masked to land. Its 16-bit storage saturates at 6,553 mm, so the very wettest places (parts of Meghalaya, the Chilean fjords) are shown at that ceiling. Years: GPCC Full Data Monthly V2022 (Deutscher Wetterdienst), a rain-gauge analysis at 0.5° over land, with the twelve monthly totals of each year summed. A gauge analysis has nothing to say over the ocean, which is why the sea is empty in both.": "常年值：CHELSA V2.1 bio12（1981–2010 年平均年降水量，30 角秒 ≈ 1 公里），重新投影为网页麦卡托并仅显示陆地。受 16 比特保存上限影响，于 6,553 公厘饱和，因此最多雨的地区（梅加拉亚部分地区、智利峡湾等）以该上限显示。年份：GPCC Full Data Monthly V2022（德国气象局）陆地 0.5° 雨量计分析，将各年十二个月的合计相加。雨量计分析无法描述海上，因此两者的海域皆为空白。",   /* (#R266) */
    "Orthodox": "正教会",   /* (#R266) */
    "Population density /km² (World Bank)": "人口密度 /km²（世界银行）",   /* (#R266) */
    "Protestant": "新教",   /* (#R266) */
    "Russian 1520 mm": "俄罗斯轨距 1520 mm",   /* (#R266) */
    "Shinto": "神道",   /* (#R266) */
    "Shipped snapshot": "随附的快照",   /* (#R266) */
    "Source text": "出处原文",   /* (#R266) */
    "Sources and caveats": "出处与注意事项",   /* (#R266) */
    "That single year’s total, on a 55 km gauge analysis — land only.": "该年一整年的合计，55 公里雨量计分析（仅陆地）。",   /* (#R266) */
    "The 1981–2010 average, on a 1 km grid — how much rain and snow a place gets in a normal year.": "1981–2010 年的平均，以 1 公里网格呈现：一个地方在常年一年内的雨雪总量。",   /* (#R266) */
    "The company data could not be loaded just now.": "目前无法加载企业数据。",   /* (#R266) */
    "Try again": "再试一次",   /* (#R266) */
    "What is an anomaly?": "什么是距平？",   /* (#R266) */
    "warnings": "则",   /* (#R266) */
    "warnings in": "则 /",   /* (#R266) */
    "zoom in for the live record": "放大后可取得实时纪录",   /* (#R266) */
  "front": "前缘",
  "Flow": "水流",
  "left the area": "流出范围",
  "at rest": "静止",
  "at rest this becomes": "静止时",
  "ticks hit the step cap (the clock ran ahead of the water)": "刻数达到步进上限（时钟走在水之前）",
  "Travel time": "到达时间",
  "over": "距离",
  "as set": "依设置值",
  "from the sources": "来自水源流量",
  "from the placed volume": "来自放置的水量",
  "fall": "落差",
  "relief": "起伏",
    "Annual precipitation (by country)": "年降水量（各国平均）",   /* (#R266) */
    /* (#R266) */
  /* (#R255) */
  "At rest": "静止",   /* (#R267) */
  "integrated": "积分",   /* (#R267) */
  "flowing": "流动中",   /* (#R267) */
  "still flowing at the edge of the modelled area": "在计算范围边缘仍在流动",   /* (#R267) */
  "still moving when the ⏭ budget ran out": "达到 ⏭ 计算上限时仍在流动",   /* (#R267) */
  "extended": "范围扩充",   /* (#R267) */
  "drawn at": "绘制解像度",   /* (#R267) */
  "cells with no DEM (closed)": "个保存格无高程数据（已封闭）",   /* (#R267) */
  "cells hold water that did not flow into them": "个保存格的水并非流入而来",   /* (#R267) */
  "extensions could not read the elevation data": "次范围扩充无法读取高程数据",   /* (#R267) */
  "The modelled area has reached its limit — water leaving its edge is counted, not drawn.": "计算范围已达上限；流出边缘的水只计入统计，不再绘制。",   /* (#R267) */
  "— when the water reached the front, on the run that drew it": "— 与画面同一次积分中水抵达前端的时刻",   /* (#R267) */
  "Run on until the water stops moving": "继续计算至水不再流动",   /* (#R267) */
  "Real terrarium elevation, sculpted by you. The water is integrated in time by the 2-D shallow-water equations in their local inertial form (Bates 2010, q-centred after de Almeida 2012) with Manning friction at n = 0.035, so a flood wave takes the time a flood wave takes. The same model runs the whole course: the lattice is extended in whichever direction the water goes, at the same cell size, so there is no second calculation and no second drawing downstream. ⏭ runs this model on until the water stops moving.": "您正在编辑真实高程数据。水以二维浅水方程序的局部惯性形式（Bates 2010；de Almeida 2012 的 q 中心化）进行时间积分，曼宁粗率 n = 0.035，因此洪峰需要多少时间就走多少时间。上游到下游是同一个模型：格网会沿水前进的方向以相同的格子尺寸延伸，因此下游并没有另一套计算或另一层绘制。⏭ 会让同一个模型继续跑到水不再流动为止。",
  "By area": "依地区",
  "cells have no elevation data and the water cannot enter them": "个网格没有高程数据，水无法进入",
  "Creoles & pidgins": "克里奥尔语与皮钦语",
  "Data year": "数据年份",
  "Each municipality": "各市区町村",
  "every 60 s": "每 60 秒",
  "Land cover (ESA)": "土地覆盖（ESA）",
  "Live OpenStreetMap for this view, merged with the shipped snapshot": "本视图的实时 OpenStreetMap，与随附快照合并",
  "Montenegrin": "蒙特内哥罗语",
  "Serbo-Croatian": "塞尔维亚-克罗地亚语",
  "signals": "个",
  "Sikhism": "锡克教",
  "This product ends at": "此数据集结束于",
  "Tint raised / lowered ground": "为填高／挖低处着色",
  "Unspecified / no answer": "未说明／未作答",
  "year not stated": "未注明年份",
  "Fula": "富拉语",
  "Cook Islands Māori": "库克群岛毛利语",
  "Gilbertese": "吉尔伯特语",
  "Niuean": "纽埃语",
  "Bislama": "比斯拉马语",
  "Nauruan": "瑙鲁语",
  "Palauan": "帕劳语",
  "Marshallese": "马绍尔语",
  "Tuvaluan": "图瓦卢语",
  "Tok Pisin": "巴布亚皮钦语",
  "Greenlandic": "格陵兰语",
  "Dzongkha": "宗喀语",
  "Gale": "暴风",
  "Strong wind": "强风",
  "Snow and wind": "风雪",
  "Landslide": "土砂灾害",
  "Ice accretion": "着冰",
  "Fertility rate (World Bank)": "生育率（世界银行）",
  "Life expectancy (World Bank)": "平均寿命（世界银行）",
  "UNDP publishes no HDI for this year": "UNDP 未发布该年度的 HDI",
  "areas": "区域",
  "Areas published but not locatable on this map: ": "已发布但本地图无法定位的区域：",
  "Read from this service but not in force now: ": "已自该机关读取、但目前未生效者：",   /* world-packs.js (#R383) */
  "expired": "已过期",   /* world-packs.js (#R383) */
  "starting later": "将于稍后生效",   /* world-packs.js (#R383) */
  "Starting later in: ": "将于稍后生效的区域：",   /* world-packs.js (#R383) */
  "Blue (IV)": "蓝色（IV级）",
  "by district": "以郡为单位",
  "by issuing region": "以发布区域为单位",
  "by municipality": "以市町村为单位",
  "by province": "以省为单位",
  "by region": "以地区为单位",
  "by state": "以州为单位",
  "by warning area": "以警报区为单位",
  "Colours": "配色",
  "Danger": "危险",
  "Danger warning": "危险警报",
  "Delayed": "略旧",
  "Diagnostics": "诊断",
  "Each agency’s own published scale": "各机关公布的等级",
  "Each country is drawn from its own agency, at the unit that agency issues for. Educational display — follow the official authorities.": "各国均以该国机关的发布单位绘制。仅供参考，请以官方机关发布为准。",
  "Europe — MeteoAlarm": "欧洲 — MeteoAlarm",
  "every 30 s": "每 30 秒",
  "Every area every connected service published could be located.": "已连接的各机关所发布的所有区域皆已定位。",
  "Fresh": "最新",
  "higher rank": "上位等级",
  "IntMap has no connection to this country’s warning service, so it is saying nothing about it — not that nothing is in force. Follow the national authority.": "IntMap 未连接此国家的警报机关，因此本地图对此国家不作任何陈述——并非表示没有发布警报。请以该国官方机关为准。",
  "IntMap normalised scale — IntMap’s own conversion": "IntMap 换算（IntMap 自行换算）",
  "IntMap scale": "IntMap 换算",
  "Loading": "加载中",
  "lower rank": "下位等级",
  "No feed connected": "未支持（未连接数据来源）",
  "Nothing in force": "未发布",
  "Nothing in force right now — this country’s service was read and had nothing to publish.": "目前无发布中的警报（已正常读取该国机关，且无发布内容）。",
  "Official": "各国官方",
  "oldest feed": "最旧的来源",
  "Orange (II)": "橙色（II级）",
  "Pick a tool and the grid is built for the current view.": "选择工具后，会为目前显示范围建立网格。",
  "Red (I)": "红色（I级）",
  "Replay from the start": "从头重播",
  "Severe": "严重（Severe）",
  "Simulation": "模拟计算",
  "Source status": "来源状态",
  "Stale": "过旧",
  "Standard": "标准",
  "Tap any country for its own agency’s scale and the areas in force.": "点击国家可查看该机关的等级与发布中的区域。",
  "territory-wide": "全境为发布单位",
  "The clock is the newest item in that feed, not how long ago it was fetched. A national service with nothing to publish is quiet, not broken.": "显示的时间为该来源中最新项目的时刻，并非下载时刻。没有内容可发布的机关是「安静」，而非「故障」。",
  "This agency’s own ranks": "此机关自身的等级",
  "Ultra": "极高",
  "Yellow (III)": "黄色（III级）",
  "Air quality": "空气质量",
  "Amount to pour": "注水总量",
  "Coastal": "沿岸",
  "Cold": "低温",
  "Cyclone": "台风",
  "Dust": "沙尘",
  "Flash flood": "暴洪",
  "Heat": "高温",
  "How fast it pours": "注水速度",
  "Ice": "结冰",
  "It keeps pouring at that rate until you stop it — there is no total.": "会以该速度持续注水，直到你停止为止——没有总量上限。",
  "Levee": "堤防",
  "Low water": "枯水",
  "Marine": "海上",
  "One click pours {v} m³ in all, at {r} m³/s — about {t} of simulated time, then it stops.": "单次点击共注入 {v} m³，速度为每秒 {r} m³——模拟时间约 {t} 后停止。",
  "This country’s service could not be fetched just now — nothing is being said about this point.": "目前无法取得该国机关的信息——本地点并未作任何说明。",
  "Tornado": "龙卷风",
  "Volcanic ash": "火山灰",
  "Water": "水",
  "Hailstorm": "冰雹",
  "Heavy rainfall": "大雨",
  "Thunderstorms": "雷雨",
  "The reachable area is computed for 1 to 120 minutes — ask again inside that range.": "可达范围以 1 至 120 分钟计算，请在此范围内重新指定。",
  "The reachable area was computed, but the map layer could not be created (the map style was still loading) — try again in a moment.": "可达范围已计算完成，但无法建立地图图层（地图样式尚在加载）— 请稍后再试一次。",   /* (#R267) */
  "Temperature": "气温",   /* (#R288) */
  "Month": "对象月份",   /* (#R288) */
  "Forecast": "预报",   /* (#R288) */
  /* (#R288) */
  /* (#R288) */
  "monthly mean": "月平均",   /* (#R288) */
  /* (#R288) */
  "Nothing in force is drawn per administrative unit in {u} countries ({n} units), and country-wide in {c}.": "「未发布」在 {u} 个国家以行政区为单位绘制（共 {n} 个区），在 {c} 个国家则以整国绘制。",   /* (#R288) */
  ' km from the nearest routable road.': ' 公里（距离最近的可通行道路）。',   /* (#R291) */
  ' of the points returned no forecast (the shared weather client is rate-limited); the others are real.': ' 个地点未取得预报（共用天气用户端受速率限制），其余为实测数据。',   /* (#R291) */
  '“Avoid highways” is a strong preference on this provider, not a prohibition.': '在此供应商，「避开高速公路」是强偏好而非禁止。',   /* (#R291) */
  '“Near the route” means within 250 km for earthquakes and 60 km for geolocated news, measured to the nearest sample point.': '「路线附近」指地震 250 公里、具坐标的新闻 60 公里以内，以最近的采样点量测。',   /* (#R291) */
  '(next day)': '（隔天）',   /* (#R291) */
  'active': '使用中',   /* (#R291) */
  'Alternatives are not available with stops on this provider — showing one route.': '此供应商在有经由地时不提供替代路线 — 仅显示一条。',   /* (#R291) */
  'Area ': '范围 ',   /* (#R291) */
  'arrive': '抵达',   /* (#R291) */
  'At least one service has to stay selected — a transit route with nothing to ride is not a route.': '至少要保留一种交通工具 — 没有可搭乘工具的大众运输路线不成立。',   /* (#R291) */
  'At least one service has to stay selected.': '至少要保留一种交通工具。',   /* (#R291) */
  'Avoid': '回避',   /* (#R291) */
  'Choose a destination': '选择目的地',   /* (#R291) */
  'Choose a start': '选择出发地',   /* (#R291) */
  'Choose a start and a destination.': '请选择出发地与目的地。',   /* (#R291) */
  'City': '城市',   /* (#R291) */
  'Clear this field': '清除此栏',   /* (#R291) */
  'Click the map to set this point. Esc cancels.': '点击地图以指定此地点，按 Esc 取消。',   /* (#R291) */
  'Click two corners… (Esc cancels)': '点击对角两点…（Esc 取消）',   /* (#R291) */
  'Click two opposite corners on the map to draw a box the route may not enter.': '在地图上点击对角两点，即可画出路线不得进入的方框。',   /* (#R291) */
  /* (#R291) */
  'Compute a route first — these describe a route that exists.': '请先计算路线 — 这些分析是针对既有路线的。',   /* (#R291) */
  'Date and time': '日期与时间',   /* (#R291) */
  'Departure or arrival': '出发或抵达',   /* (#R291) */
  'Directions sections': '路线区段',   /* (#R291) */
  'Enter a start and a destination to see routes.': '输入出发地与目的地即可显示路线。',   /* (#R291) */
  'estimate': '概估',   /* (#R291) */
  'Finding routes…': '搜索路线中…',   /* (#R291) */
  'Getting a location took too long — try again, or pick a point on the map.': '取得目前位置耗时过久 — 请重试，或在地图上选点。',   /* (#R291) */
  'High-speed rail': '高速铁路',   /* (#R291) */
  'Highlight this area': '强调此范围',   /* (#R291) */
  'Historical network': '过去的路网',   /* (#R291) */
  'Includes real-time departures and delays where the operator publishes them.': '在业者公开的范围内，包含实时发车与误点信息。',   /* (#R291) */
  'Intercity Japan: real Shinkansen lines and stations, with times estimated from the operators’ published timetables — not live departures. The alignment between stations is schematic.': '日本城际铁路：采用真实的新干线路线与车站，所需时间依业者公布的时刻表推估（非实时）。站间线形为示意。',   /* (#R291) */
  'Keep out of an area': '禁止通过范围',   /* (#R291) */
  'Lanes: use ': '车道：使用 ',   /* (#R291) */
  'live traffic': '实时路况',   /* (#R291) */
  'Local service': '在地路线',   /* (#R291) */
  'Location permission was refused — type a place or pick one on the map instead.': '位置权限遭拒 — 请改为输入地点或在地图上选取。',   /* (#R291) */
  'min early': '分钟提前',   /* (#R291) */
  'Minimise': '最小化',   /* (#R291) */
  'Most I will walk': '步行上限',   /* (#R291) */
  'Move this stop earlier': '将此经由地上移',   /* (#R291) */
  'Move this stop later': '将此经由地下移',   /* (#R291) */
  'Network kind': '路网种类',   /* (#R291) */
  'No areas drawn.': '尚未画出任何范围。',   /* (#R291) */
  'No limit': '无限制',   /* (#R291) */
  'No place matches that.': '找不到相符的地点。',   /* (#R291) */
  'No provider IntMap can use publishes ': 'IntMap 可使用的供应商皆未提供：',   /* (#R291) */
  'No public-transit route here — this area may have no open timetable data.': '此区间没有大众运输路线 — 该地区可能尚无公开时刻表数据。',   /* (#R291) */
  'Not available': '未支持',   /* (#R291) */
  'One point is about ': '其中一个地点距离约 ',   /* (#R291) */
  'OpenStreetMap’s own record of when lines existed — not a historical atlas. Its date coverage is uneven, and the answer says how much of the route ran on dated line.': '依 OpenStreetMap 自身对「何时存在」的记录，并非历史地图。其年代数据涵盖不均，结果会标明路线中有多少比例行经有年代记录的路线。',   /* (#R291) */
  'Options': '选项',   /* (#R291) */
  'Partly real-time': '部分实时',   /* (#R291) */
  'Pick a point on the map': '在地图上选点',   /* (#R291) */
  'Pick this point on the map': '在地图上选取此地点',   /* (#R291) */
  'Plan routes by car, transit, walking or cycling': '规划汽车、大众运输、步行或自行车路线',   /* (#R291) */
  'Point on the map': '地图上的地点',   /* (#R291) */
  'Real-time': '实时',   /* (#R291) */
  'Recent': '最近',   /* (#R291) */
  'Remove this area': '删除此范围',   /* (#R291) */
  'Remove this stop': '删除此经由地',   /* (#R291) */
  'Resize the panel': '调整面板高度',   /* (#R291) */
  'Reverse': '对调',   /* (#R291) */
  'road incidents and closures': '事故与封路',   /* (#R291) */
  'Route options': '路线候选',   /* (#R291) */
  'Routed by ': '路线提供：',   /* (#R291) */
  'Search is unavailable right now.': '目前无法使用搜索。',   /* (#R291) */
  'Searching…': '搜索中…',   /* (#R291) */
  'Share': '分享',   /* (#R291) */
  'Some ride segments have no usable shape — those legs are listed but not drawn (no straight-line substitutes).': '部分乘车区间没有可用的线形 — 这些区间会列出但不绘制（不以直线替代）。',   /* (#R291) */
  'Station': '车站',   /* (#R291) */
  'That box is too small to keep a route out of — draw a larger one.': '此范围太小，无法排除路线 — 请画得大一些。',   /* (#R291) */
  'That request could not be understood by the routing service.': '路线服务无法解读此请求。',   /* (#R291) */
  'The analyses did not load.': '分析模块加载失败。',   /* (#R291) */
  'The avoid options could NOT be applied (the provider was unreachable) — this is the ordinary route.': '无法应用回避条件（无法连接至供应商）— 这是一般路线。',   /* (#R291) */
  'The keep-out area could NOT be applied (the provider was unreachable) — this route may pass through it.': '无法应用禁止通过范围（无法连接至供应商）— 此路线可能穿越该范围。',   /* (#R291) */
  'The link includes the places in this route: ': '此链接包含路线中的地点：',   /* (#R291) */
  'The location fix is only accurate to about ': '目前位置的精度约为 ',   /* (#R291) */
  'The location is unavailable right now.': '目前无法取得位置。',   /* (#R291) */
  'The place search could not be reached — check the connection and try again.': '无法连接至地点搜索 — 请检查连接后重试。',   /* (#R291) */
  'The routing service is unreachable (outage or no network) — the route was NOT computed.': '无法连接至路线服务（故障或网络问题）— 路线并未计算。',   /* (#R291) */
  'The routing service timed out.': '路线服务逾时。',   /* (#R291) */
  'The time you set shifts the arrival calculation only; the road provider has no traffic forecast to give it to.': '所设置的时间仅用于计算抵达时刻；道路供应商并无可应用的路况预测。',   /* (#R291) */
  'There is no road connection between these points.': '这两个地点之间没有道路链接。',   /* (#R291) */
  'This browser cannot provide a location.': '此浏览器无法提供位置信息。',   /* (#R291) */
  'This device is offline.': '此设备目前离线。',   /* (#R291) */
  'This provider accepts at most ': '此供应商最多接受 ',   /* (#R291) */
  'Timetable': '时刻表',   /* (#R291) */
  'Timetable-based — no real-time data is published for this trip.': '以时刻表为准 — 此行程未公开实时信息。',   /* (#R291) */
  'Too many requests to the routing service — wait a moment.': '对路线服务的请求过多 — 请稍候。',   /* (#R291) */
  'transfers': '次转乘',   /* (#R291) */
  'Travel mode': '交通工具',   /* (#R291) */
  'Try driving': '改用汽车',   /* (#R291) */
  'Try transit': '改用大众运输',   /* (#R291) */
  'Try walking': '改用步行',   /* (#R291) */
  'Typical travel time — live traffic is not included.': '标准所需时间 — 未纳入实时路况。',   /* (#R291) */
  'Use these services': '使用的交通工具',   /* (#R291) */
  'Where routes differ': '路线分歧之处',   /* (#R291) */
  'Working back from the arrival deadline.': '自抵达时刻反推计算。',   /* (#R291) */
  'Your avoid options are honoured by a provider that returns one route, so there are no alternatives to compare.': '回避条件由仅回传单一路线的供应商处理，因此没有可比较的替代路线。',
  " days": "天",
  " days ago": "天前",
  "100 pixels is about": "100 像素约为",
  "100 px covers": "100 像素的距离",
  "24 h": "24 小时",
  "24-hour change": "24 小时变动",
  "24-hour volume": "24 小时成交量",
  "30-day high": "30 日最高",
  "30-day low": "30 日最低",
  "a country is selected": "已选取国家",
  "A day earlier": "前一天",
  "A day later": "后一天",
  "A fixed country": "固定的国家",
  "A layer worth trying here, and a switch to turn it on": "值得在此尝试的图层，以及开关",
  "A live estimate, from the UN projection": "根据联合国推估的实时估计",
  "a route is on the map": "地图上有路线",
  "a severe warning is in force": "有严重警报生效中",
  "about a city": "约一座城市",
  "about a city block": "约一个街区",
  "about a continent": "约一个大陆",
  "about a country": "约一个国家",
  "about a neighbourhood": "约一个社区",
  "Add a widget": "新增小工具",
  "Add to the board": "加入面板",
  "added": "已新增",
  "Added a watch card": "已新增追踪卡片",
  "advisory": "注意",
  "Age": "月龄",
  "alerts": "警报",
  "Alerts for your places": "您的地点的警报",
  "already added": "已加入",
  "Already on your board": "已在您的面板上",
  "Also compare": "一并比较",
  "Alternatives": "替代路线",
  "An analog face, with a sweeping second hand": "有秒针的模拟表面",
  "analog": "模拟",
  "Analog": "模拟",
  "anniversary": "纪念日",
  "Another city’s time, and its offset from yours": "其他城市的时间与时差",
  "Another country": "换一个国家",
  "Any currency pair, live": "任何货币对的实时汇率",
  "Area monitors": "地区监控",
  "areas monitored": "监控中的地区",
  "Around each place": "每个地点周围",
  "Ask Atlas again": "再次询问 Atlas",
  "Ask Atlas for one": "向 Atlas 索取",
  "At your location or the map centre": "在您的位置或地图中心",
  "Atlas briefing": "Atlas 简报",
  "Atlas is only asked when you press the button": "只有按下按钮时才会询问 Atlas",
  "aurora": "极光",
  "Automatic": "自动",
  "Autumn": "秋",
  "Back to the list": "回到列表",
  "Bar": "长条",
  "block": "区块",
  "Block height and current fees": "区块高度与目前手续费",
  "bn": "十亿",
  "Both": "两者",
  "Break up the stack": "解散堆叠",
  "Break up this stack": "解散此堆叠",
  "briefed": "产生于",
  "briefing": "简报",
  "BTC dominance": "BTC 市占率",
  "by population": "依人口",
  "calendar": "行事历",
  "can add more than one": "可加入多个",
  "Cancelled": "已取消",
  "Categories": "分类",
  "centre": "中心",
  "Change city": "更换城市",
  "Change country": "更换国家",
  "Change pair": "更换货币对",
  "Change place": "更换地点",
  "Change zone": "更换时区",
  "Choose automatically (Smart Stack)": "自动选择（Smart Stack）",
  "Cities": "城市",
  "clock": "时钟",
  "Clocks": "时钟",
  "Coins": "币种",
  "Coming phases": "接下来的月相",
  "comments": "留言",
  "Comparable to": "相当于",
  "Conditions where you are (asks for location)": "您所在位置的天气（需要位置权限）",
  "coordinates": "坐标",
  "Could not copy": "无法复制",
  "Could not reach the source": "无法连上来源",
  "countdown": "倒数计时",
  "country": "国家",
  "Country watch": "国家追踪",
  "Counts what is inside the current view, among data already loaded": "只计算目前检视范围与已加载的数据",
  "crypto": "加密货币",
  "Crypto (BTC · ETH)": "加密货币（BTC·ETH）",
  "Crypto market sentiment, 0–100": "加密货币市场情绪，0–100",
  "currency": "货币",
  "Current position of the ISS": "ISS 目前位置",
  "d ": "天 ",
  "D° M′ S″": "度分秒",
  "Daily high, next 7 days": "未来 7 天最高气温",
  "date": "日期",
  "day length": "日照长度",
  "Day length through the year": "全年日照长度变化",
  "Day of year": "年内第几天",
  "Daylight": "日照长度",
  "daytime": "白天",
  "deadline": "期限",
  "Decimal": "十进位",
  "Decimal degrees": "十进位度",
  "deep": "深度",
  "Degrees, minutes, seconds": "度、分、秒",
  "Density": "人口密度",
  "Digital": "数位",
  "discover": "探索",
  "distance": "距离",
  "down": "下跌",
  "Duplicate": "复制",
  "earthquake": "地震",
  "Edit cities": "编辑城市",
  "Edit coins": "编辑币种",
  "Edit currencies": "编辑货币",
  "Edit mode off": "已结束编辑模式",
  "Edit mode on. Use the arrow keys to move a widget.": "编辑模式。可用方向键移动。",
  "Elevation along the way": "沿途高度",
  "emergency": "特别警报",
  "Environment": "环境",
  "event": "活动",
  "events": "事件",
  "Events in the current view": "目前检视范围内的事件",
  "Example data — the real card fills in once it is added": "这是范例数据，加入后会显示实际数据",
  "exchange rate": "汇率",
  "Extreme fear": "极度恐惧",
  "Extreme greed": "极度贪婪",
  "Face": "显示样式",
  "Fast": "快速",
  "Fear": "恐惧",
  "Fear and greed": "恐惧与贪婪",
  "Fear and greed, last 30 days": "近 30 日的恐惧与贪婪指数",
  "featured": "推荐",
  "fee": "手续费",
  "Fire": "火灾",
  "First quarter": "上弦月",
  "flag": "国旗",
  "Flag and key facts — random, or the one you selected": "国旗与基本数据（随机或所选国家）",
  "Fly there": "前往该处",
  "Follow the Chronos time": "跟随 Chronos 时间",
  "Follow the country selected on the map": "跟随地图上选取的国家",
  "Following Chronos": "跟随 Chronos 中",
  "Follows wherever the map is looking": "跟随地图检视的位置",
  "forecast": "预报",
  "Format": "显示格式",
  "From": "来源货币",
  "GDP per person": "人均 GDP",
  "geomagnetic": "地磁",
  "Geomagnetic activity (Kp)": "地磁活动（Kp 指数）",
  "Greed": "贪婪",
  "Growth": "增长",
  "h ": "小时 ",
  "Hazards": "灾害",
  "Hazards & live": "灾害与实时",
  "headlines": "头条",
  "Headlines": "头条",
  "Headlines placed near where the map is looking": "位于地图中心附近的头条",
  "hemisphere": "半球",
  "here": "此地",
  "Hexadecimal": "十六进位",
  "Hide it": "隐藏",
  "Hide them all": "全部隐藏",
  "history": "历史",
  "holiday": "假日",
  "How long the sun is up here today": "今天此地日照多长",
  "How many": "显示笔数",
  "How many nights until the moon is full": "距离下次满月还有几晚",
  "How many nights until the moon is new": "距离下次新月还有几晚",
  "How much ground a pixel covers, with something to compare it to": "一个像素涵盖的距离，附比较基准",
  "in": "还有",
  "Include my location": "包含我的位置",
  "index": "指数",
  "IntMap": "IntMap",
  "Inverse": "反向汇率",
  "ISO week": "ISO 周",
  "ISO week number and how far through it": "ISO 周次与进度",
  "it is about what the map is showing": "与地图显示的内容有关",
  "it is about where you are": "与您所在位置有关",
  "it is next in the stack": "是堆叠中的下一项",
  "it suits the time of night": "适合夜间时段",
  "Knowledge": "知识",
  "large": "大",
  "Large": "大",
  "Last quarter": "下弦月",
  "Latitude": "纬度",
  "Launch sites": "发射场",
  "layer": "图层",
  "layers": "图层",
  "layers on": "显示中",
  "Layers that follow this time": "跟随此时间的图层",
  "left": "剩余",
  "Live events inside the part of the world you are looking at": "您正在检视的范围内发生的事",
  "Location": "地点",
  "Location is blocked in the browser": "浏览器已封锁位置权限",
  "Locator": "位置图",
  "Longitude": "经度",
  "lunar": "月龄",
  "m ": "分 ",
  "magnitude": "规模",
  "Map & places": "地图与地点",
  "map centre": "地图中心",
  "Map centre": "地图中心",
  "market cap": "市值",
  "Markets": "市场",
  "markets are open around now": "现在是交易时段",
  "medium": "中",
  "metal": "贵金属",
  "Milliseconds": "毫秒",
  "Minor storm — aurora possible at high latitudes": "小型磁暴 — 高纬度可能出现极光",
  "Mode": "交通方式",
  "monitor": "监控",
  "Monitors are in the sidebar": "监控在侧边栏中",
  "moon": "月亮",
  "navigation": "导航",
  "News & knowledge": "新闻与知识",
  "News on the map": "地图上的新闻",
  "Next full": "下次满月",
  "Next new": "下次新月",
  "Next public holiday": "下一个国定假日",
  "Next widget in the stack": "堆叠中的下一个小工具",
  "night-time": "夜间",
  "No briefing yet": "尚无简报",
  "no change": "无变动",
  "No earthquake above this magnitude in the last 24 hours": "过去 24 小时没有超过此规模的地震",
  "No geolocated headlines are loaded for this area": "此区域没有加载具坐标的头条",
  "No layers are switched on": "没有开启任何图层",
  "No route is on the map — plan one and it will appear here": "地图上没有路线，建立后会显示于此",
  "No upcoming public holidays are published for this country": "此国家未公布即将到来的假日",
  "no warnings": "无警报",
  "No warnings are in force at your places": "您的地点没有生效中的警报",
  "none": "无",
  "not available for this widget": "此小工具无法选用",
  "Nothing is generated automatically": "不会自动产生",
  "Nothing live is loaded inside this view": "此检视范围未加载实时信息",
  "Nothing matches that search": "没有符合的搜索结果",
  "Nothing to report right now": "目前没有可回报的内容",
  "of daylight": "的日照",
  "of daylight today": "今天的日照",
  "Offline — showing the last update": "离线中 — 显示最后取得的内容",
  "on your board": "个在面板上",
  "one you have not tried yet": "您尚未试过的图层",
  "Open monitors": "开启监控",
  "Open the earthquake layer": "开启地震图层",
  "Open the layers panel": "开启图层面板",
  "Open the layers panel from the sidebar": "请从侧边栏开启图层面板",
  "Open the route panel": "开启路线面板",
  "Open the warnings layer": "开启警报图层",
  "Open the weather layer": "开启气象图层",
  "orbit": "轨道",
  "overlay": "叠加图层",
  "past": "过去",
  "Peak today": "今日最大值",
  "people per second": "人／秒",
  "Per gram": "每公克",
  "per troy ounce": "每金衡盎司",
  "phase": "月相",
  "Picked up. Use the arrow keys to move it, then press Enter.": "已抓起。用方向键移动，再按 Enter 确定。",
  "Pin this page to the front": "将此页固定在前",
  "Place saved": "已保存地点",
  "Placed": "已放置",
  "Planetary K index, recent readings": "近期的行星 K 指数",
  "pollution": "污染",
  "present": "现在",
  "Preview": "预览",
  "Previous widget in the stack": "堆叠中的上一个小工具",
  "Price and 24-hour change": "价格与 24 小时变动",
  "progress": "进度",
  "Progress": "进度",
  "Provider": "营运者",
  "public holiday": "国定假日",
  "Random each time": "每次随机",
  "rank": "排名",
  "Real time": "实际时间",
  "Recent headlines": "近期头条",
  "related to your selection": "与您的选取有关",
  "Remaining": "剩余",
  "report": "报告",
  "Reset the size": "回复默认大小",
  "Restore the default board": "回复默认面板",
  "Ring": "环形",
  "rocket": "火箭",
  "Route status": "路线状态",
  "same": "相同",
  "same time": "相同时间",
  "Save a place, or allow your location, to watch it here": "保存地点或允许位置权限后即可在此检视",
  "Save this place": "保存此地点",
  "saved places": "已保存的地点",
  "scale": "比例尺",
  "Scale": "比例尺",
  "Search widgets": "搜索小工具",
  "season": "季节",
  "Seconds since 1970-01-01 UTC": "自 1970-01-01 UTC 起的秒数",
  "seismic": "地震活动",
  "sentiment": "情绪",
  "Set a date and a title": "设置日期与标题",
  "Set a date to count down to": "请设置倒数的日期",
  "Settings for": "设置：",
  "Severe storm": "剧烈磁暴",
  "Share of total capitalisation": "市值占比",
  "Show it": "显示",
  "Show me another": "换一则",
  "Show on the map": "在地图上显示",
  "Show seconds": "显示秒数",
  "Show the whole route": "显示整条路线",
  "shown": "显示中",
  "Site": "发射场",
  "situation": "状况",
  "Situation in view": "检视范围的状况",
  "Size": "大小",
  "small": "小",
  "Small": "小",
  "Smallest magnitude": "最小规模",
  "Something else": "其他候选",
  "Source limit reached": "已达来源上限",
  "Source limit reached — retrying ": "已达来源上限 — 重试 ",
  "South–North": "南–北",
  "space": "太空",
  "Space": "太空",
  "space station": "太空站",
  "spot price": "现货价",
  "Spot price, US dollars per troy ounce": "现货价（美元／金衡盎司）",
  "Spring": "春",
  "stack": "堆叠",
  "Stack of": "堆叠：",
  "Stack pages": "堆叠页面",
  "Stack with the next widget": "与下一个小工具堆叠",
  "State": "状态",
  "Statistics, warnings and headlines for one country": "单一国家的统计、警报与头条",
  "Stop choosing automatically": "停止自动选择",
  "Strong storm — aurora possible further south": "强烈磁暴 — 更低纬度也可能出现极光",
  "Style": "样式",
  "Suggested": "推荐",
  "suggestion": "建议",
  "suits what you are looking at": "符合您正在检视的内容",
  "summary": "摘要",
  "Summer": "夏",
  "sunrise": "日出",
  "Sunrise and sunset depend on where you are": "日出与日落因地点而异",
  "sunset": "日落",
  "Take out of the stack": "移出堆叠",
  "tap to show": "点按以显示",
  "technology": "科技",
  "temperature": "气温",
  "That card is already on the board": "该卡片已在面板上",
  "That layer is not available here": "此处无法使用该图层",
  "The areas you have asked IntMap to keep an eye on": "您请 IntMap 留意的地区",
  "The coordinate the map is looking at, ready to copy": "地图检视的坐标，可直接复制",
  "The last 24 hours, from the USGS feed": "过去 24 小时（USGS）",
  "The last briefing you asked Atlas for — never generated on its own": "您最后请 Atlas 产生的简报，不会自动产生",
  "The map has not finished loading yet": "地图尚未加载完成",
  "the map is showing another time": "地图正显示其他时间",
  "the map is showing live data": "地图正显示实时数据",
  "The next public holiday in a country you pick": "所选国家的下一个假日",
  "The next scheduled orbital launch": "下一次预定的轨道发射",
  "The planetary K index, and what it means for aurora": "行星 K 指数与极光概率",
  "The route currently on the map, and where to go next with it": "地图上的路线与后续操作",
  "The route on the map": "地图上的路线",
  "The season where the map is looking": "地图检视位置的季节",
  "The time the whole map is showing, and how far it is from now": "整张地图显示的时间，以及与现在的差距",
  "The top stories right now": "目前的热门文章",
  "The warnings layer has not been switched on yet": "警报图层尚未开启",
  "The weather here depends on where “here” is": "天气因地点而异",
  "The weather service hit its daily limit": "气象服务已达每日上限",
  "The weather service is briefly unavailable": "气象服务暂时无法使用",
  "This source is no longer available": "此来源目前无法使用",
  "This widget could not be drawn": "无法绘制此小工具",
  "This widget needs your location": "此小工具需要您的位置",
  "time": "时刻",
  "Time & calendar": "时间与行事历",
  "Time and date, in any zone": "任一时区的时间与日期",
  "time travel": "时间移动",
  "Time zone": "时区",
  "timestamp": "时间戳记",
  "timezone": "时区",
  "Title": "标题",
  "To": "目标货币",
  "to go": "后",
  "today, but not live": "今天，但不是实时",
  "Today, the month, and what is marked on it": "今天、本月与其上的标记",
  "Today’s peak UV, clear-sky": "今日最大 UV（晴空时）",
  "tonight": "今晚",
  "Tonight": "今晚",
  "Tonight’s phase and illumination": "今晚的月相与亮度",
  "Total capitalisation and BTC dominance": "总市值与 BTC 市占率",
  "total market capitalisation": "总市值",
  "Trend": "走势",
  "Unhealthy for sensitive groups": "对敏感族群不良",
  "Unpin this page": "取消固定此页",
  "Unsettled": "略为活跃",
  "until full moon": "距离满月",
  "until new moon": "距离新月",
  "up": "上涨",
  "Updating…": "更新中…",
  "US AQI and PM2.5 at a point": "该地点的美国 AQI 与 PM2.5",
  "Use my location": "使用我的位置",
  "Use the map centre": "使用地图中心",
  "Uses your location once you add it": "加入后会使用您的位置",
  "viewport": "检视范围",
  "vs. here": "与此地相差",
  "vs. yesterday": "与昨日相比",
  "Waning crescent": "残月",
  "Waning gibbous": "亏凸月",
  "warning": "警报",
  "warnings are in force": "有警报生效中",
  "Warnings in force": "生效中的警报",
  "Warnings in force at the places you saved or are watching": "您已保存或追踪地点的生效警报",
  "watch": "警戒",
  "Watch a place": "追踪地点",
  "watch area": "监控地区",
  "Watch this country": "追踪此国家",
  "Waxing crescent": "眉月",
  "Waxing gibbous": "盈凸月",
  "Weather & environment": "天气与环境",
  "Weather at the map centre": "地图中心的天气",
  "week": "周",
  "Week": "周",
  "week number": "周次",
  "Week progress": "本周进度",
  "West–East": "西–东",
  "What happened on today’s date": "在今天这个日期发生的事",
  "What is drawn on the map, and switches for each": "地图上绘制的内容与各自的开关",
  "Whatever is selected on the map": "地图上所选取的对象",
  "Where the map is looking": "地图检视的位置",
  "Where the station is right now": "太空站目前的位置",
  "Where these earthquakes were": "这些地震的位置",
  "Where these stories are placed": "这些报道的位置",
  "Which country": "哪个国家",
  "Why is this showing?": "为什么显示这个？",
  "Widget board": "小工具面板",
  "Widget options": "小工具选项",
  "Widget removed": "已移除小工具",
  "Winter": "冬",
  "world": "世界",
  "World": "世界",
  "World & countries": "世界与国家",
  "world clock": "世界时钟",
  "you are monitoring an area": "您正在监控某个地区",
  "You are not monitoring any area yet": "您尚未监控任何地区",
  "you pinned it": "您已将其固定",
  "you used it recently": "您最近使用过",
  "Your board could not be saved — storage is full": "无法保存面板 — 保存空间已满",
  "Your board is empty": "您的面板是空的",
  "Your most recent data": "您最近取得的数据",
  "Zone": "时区",
  "zoom": "缩放",
  "My location": "我的位置",   /* (#R291) */
  "Arrival": "抵达",   /* (#R296) */
  "Close the directions panel (this also removes the route from the map)": "关闭路线面板（地图上的路线也会一并移除）",   /* (#R296) */
  "Could not run — the live wind field was unavailable.": "无法执行——取不到实时风场数据。",   /* (#R296) */
  "Getting your location…": "正在取得您的位置…",   /* (#R296) */
  "Lagrangian dispersion over the live wind field, with decay and wet deposition. Educational — in a real emergency follow the official authorities.": "在实时风场上的拉格朗日扩散模式（含衰变与湿沉降）。仅供教学参考——实际灾害时请遵循官方机关的指示。",   /* (#R296) */
  "No source placed yet": "尚未设置释放源",   /* (#R296) */
  "Place the source on the map": "在地图上设置释放源",   /* (#R296) */
  "Radio coverage & line of sight": "电波涵盖范围／视通线",   /* (#R296) */
  "Radioactive dispersion": "放射性物质扩散",   /* (#R296) */
  "Reach": "到达",   /* (#R296) */
  "Reachable area (drive/walk/cycle/transit)": "可达范围（开车／步行／单车／大众运输）",   /* (#R296) */
  "Release (h)": "释放时间 (h)",   /* (#R296) */
  "Rides the real rail network (OpenStreetMap), at typical speeds per line class — not a published timetable. Walk to the nearest station is included.": "沿真实铁路网（OpenStreetMap）以各线种的标准速度推算的范围（并非公告时刻表）。已含步行至最近车站的时间。",   /* (#R296) */
  "Run the dispersion": "执行扩散",   /* (#R296) */
  "Signal from a transmitter here, and what the terrain hides": "设在此处的发射机能到达哪里，以及地形挡住了什么",   /* (#R296) */
  "Tap the map to place the release source.": "点一下地图以放置释放源。",   /* (#R296) */
  "Time — the rail model solves one budget, so the largest is used": "时间——铁路模式一次只解一个时间预算，因此采用最大值",   /* (#R296) */
  "Times are typical (no live traffic).": "所需时间为不含实时路况的标准值。",   /* (#R296) */
  "times below are local to each place": "以下时刻为各地点的当地时间",   /* (#R296) */
  "Use my current location": "使用目前位置",   /* (#R296) */
  "Use my location (permission was refused)": "使用目前位置（权限遭拒）",   /* (#R296) */
  "Window (h)": "追踪时间 (h)",   /* (#R296) */
  "Edit message": "编辑讯息",   /* (#R298) */
  "every {0} s": "每 {0} 秒",   /* (#R298) */
  "Find routes": "搜索路线",   /* (#R298) */
  "Tap the map to choose a point": "点一下地图以选择地点",   /* (#R298) */
  "The map is not ready to choose a point yet": "地图尚未就绪，无法选择地点",   /* (#R298) */
  "Countries at Danger or above": "危险等级以上的国家",   /* (#R299) */
  "No country is at Danger or above right now.": "目前没有国家达到危险等级以上。",   /* (#R299) */
  "IntMap’s own conversion — the same step is not the same danger.": "IntMap 自行换算——同一等级不代表危险程度相同。",   /* (#R299) */
  "Each agency’s own colours. Tap a country for its exact scale.": "颜色为各机关自身的配色。点击国家可查看确切等级。",   /* (#R299) */
  "No point placed yet": "尚未设置地点",   /* (#R299) */
  "Place the point on the map": "在地图上设置地点",   /* (#R299) */
  "The route planner is open on the map — fill in the two fields there, or say the places here.": "已在地图上开启路线指引面板——请在面板中填入起点与目的地，或在这里告诉我地点。",   /* (#R299) */
  "Where from? Give a place (or lng/lat).": "从哪里看的天空？请指定地点（或经纬度）。",   /* (#R299) */
  "Where? Give the transmitter site (place, or lng/lat).": "发射机位置在哪里？请指定地点或经纬度。",   /* (#R299) */
  "Where? Give the point (place, or lng/lat).": "在哪里？请提供地点（地名，或经纬度）。",   /* (#R302) */
  "Arrival times need a point — name a place, or tap the map first.": "到达时刻需要一个地点——请指定地名，或先点一下地图。",   /* (#R302) */
  "Brief me on {place} — the latest": "帮我简报{place}的最新情势",   /* atlas-console.js (#R309) */
  "Compare {place} with its neighbours — GDP, defense and population": "比较{place}与邻国 — GDP、国防支出与人口",   /* atlas-console.js (#R309) */
  "How has {place}'s economy changed since 1990?": "{place}的经济从 1990 年以来有什么变化？",   /* atlas-console.js (#R309) */
  "What is the weather and any active warnings in {place}?": "{place}的天气如何？有哪些生效中的警报？",   /* atlas-console.js (#R309) */
  "Compare the USA, China and India — GDP, defense and population": "比较美国、中国与印度 — GDP、国防支出与人口",   /* atlas-console.js (#R309) */
  "Which countries spend the most on defense relative to GDP?": "哪些国家的国防支出占 GDP 比重最高？",   /* atlas-console.js (#R309) */
  "Brief me on the South China Sea — the latest": "帮我简报南海的最新情势",   /* atlas-console.js (#R309) */
  "Which countries have the highest life expectancy?": "哪些国家平均寿命最长？",   /* atlas-console.js (#R309) */
  "Which weather warnings are in force over {place} right now, and who issued them?": "{place}：目前生效中的气象警报有哪些？由哪个机关发布？",   /* atlas-examples.js (#R313) */
  "What has been shaking near {place}, and which fault or plate boundary is behind it?": "{place}：附近最近哪里发生了地震？背后是哪条断层或板块边界？",   /* atlas-examples.js (#R313) */
  "Which volcanoes near {place} are restless, and what would an eruption reach?": "{place}：附近有哪些火山正在活动？一旦喷发会波及到哪里？",   /* atlas-examples.js (#R313) */
  "What is driving the wind pattern over {place} today?": "{place}：今天上空的风场是由什么主导的？",   /* atlas-examples.js (#R313) */
  "Which submarine cables land in {place}, and what happens if one is cut?": "{place}：有哪些海底电缆在此登陆？其中一条被切断会怎么样？",   /* atlas-examples.js (#R313) */
  "What is flying over {place} right now, and where are those aircraft going?": "{place}：现在有哪些飞机在上空飞行？要飞往哪里？",   /* atlas-examples.js (#R313) */
  "What is moving through {place}’s waters right now, and what is it carrying?": "{place}：现在有哪些船正通过其海域？载运的是什么？",   /* atlas-examples.js (#R313) */
  "What was happening in {place} in {year}?": "{year} 年的{place}发生了什么事？",   /* atlas-examples.js (#R313) */
  "{place} is one of the most crowded countries on Earth — how does it absorb that?": "{place}是世界上人口最密集的国家之一——它是怎么承受下来的？",   /* atlas-examples.js (#R313) */
  "Almost nobody lives per square kilometre in {place} — so where do people actually live?": "{place}的人口密度是全球最低之一——那么人们实际上都住在哪里？",   /* atlas-examples.js (#R313) */
  "{place} spans enormous distances — how is it physically held together?": "{place}幅员极为辽阔——是什么在实体上把它维系在一起？",   /* atlas-examples.js (#R313) */
  "{place} is tiny — what does its economy actually run on?": "{place}是个很小的国家——经济实际上靠什么运转？",   /* atlas-examples.js (#R313) */
  "{place} is one of the largest economies in the world — what is actually carrying it?": "{place}是世界最大的经济体之一——真正撑起它的是什么？",   /* atlas-examples.js (#R313) */
  "How does {place} sustain one of the highest incomes per person anywhere?": "{place}的人均收入是全球最高之一——是怎么维持的？",   /* atlas-examples.js (#R313) */
  "{place} spends an unusually large share of its economy on defense — on what, and against what?": "{place}的国防支出占经济的比重异常地高——花在什么上？又是为了防备什么？",   /* atlas-examples.js (#R313) */
  "What single change would do the most for everyday life in {place}?": "{place}：哪一项改变最能改善当地的日常生活？",   /* atlas-examples.js (#R313) */
  "How is {place} actually governed, and who really decides?": "{place}实际上是怎么治理的？真正做决定的是谁？",   /* atlas-examples.js (#R313) */
  "What keeps {place}’s institutions working as well as they do?": "{place}的制度为什么能维持得这么好？",   /* atlas-examples.js (#R313) */
  "Why do people in {place} live longer than almost anywhere else?": "{place}的人为什么比世界上几乎任何地方都长寿？",   /* atlas-examples.js (#R313) */
  "How much of {place} is actually online, and what is the bottleneck?": "{place}实际上有多少人能上网？瓶颈在哪里？",   /* atlas-examples.js (#R313) */
  "Where are {place}’s people concentrated, and where is that shifting?": "{place}的人口集中在哪里？又正往哪里移动？",   /* atlas-examples.js (#R313) */
  "What happens in {place}’s capital that matters beyond its borders?": "{place}：首都发生的事情里，有哪些影响会超出国界？",   /* atlas-examples.js (#R313) */
  /* ══ (#R313 追记2) THE UN M49 MACRO-REGION NAMES — SHIPPED STRINGS, NOT A RUNTIME LOOKUP ══════
     `{sub}` in the chip below is one of the 22 M49 macro-regions. The browser cannot name them:
     Intl.DisplayNames({type:'region'}) answers for 'JP' and returns undefined for '030' in V8,
     so the names have to be here. ⚠ ONLY THE SIX THIS TABLE DID NOT ALREADY CARRY ARE LISTED —
     Caribbean, Eastern/Middle/Northern/Southern/Western Africa, Eastern/Northern/Southern/Western
     Europe, Northern America, South America, Western Asia, Melanesia, Micronesia and Polynesia are
     already rows of this same table (js/atlas-console.js names the same regions from the same
     English keys), and a second row with the same key would be a duplicate, not a translation.
     ⚠ Bare nouns, no article: each one lands inside the parentheses of the chip. */
  "Eastern Asia": "东亚",   /* atlas-examples.js (#R313 追记2) */
  "South-Eastern Asia": "东南亚",   /* atlas-examples.js (#R313 追记2) */
  "Southern Asia": "南亚",   /* atlas-examples.js (#R313 追记2) */
  "Central Asia": "中亚",   /* atlas-examples.js (#R313 追记2) */
  "Central America": "中美洲",   /* atlas-examples.js (#R313 追记2) */
  "Australia and New Zealand": "澳洲与新西兰",   /* atlas-examples.js (#R313 追记2) */
  "How does {place} differ from the other countries in its region ({sub})?": "{place}与同一地区（{sub}）的其他国家有什么不同？",   /* atlas-examples.js (#R313 追记2) */
  "What did the world look like in {year}?": "{year} 年的世界是什么样子？",   /* atlas-examples.js (#R313) */
  "Where in the world are the most severe weather warnings in force right now?": "目前全球哪里发布了最严重的气象警报？",   /* atlas-examples.js (#R313) */
  "Which plate boundaries have been most active in the past week?": "过去一周最活跃的板块边界是哪些？",   /* atlas-examples.js (#R313) */
  "Which submarine cable chokepoints carry the most of the world’s traffic?": "全球流量最集中的海底电缆咽喉点在哪里？",   /* atlas-examples.js (#R313) */
  /* ── (#R337) the widened starter-chip pool: geography, currency, language and pairs of facts ── */
  "The equator runs through {place} — what does that do to its seasons and its rain?": "赤道横贯{place}，这对它的季节与降雨有什么影响？",   /* atlas-examples.js (#R337) */
  "Part of {place} lies inside the Arctic Circle — who lives up there, and on what?": "{place}有一部分位于北极圈内。那里住着谁？靠什么过活？",   /* atlas-examples.js (#R337) */
  "All of {place} lies between the tropics — how does that decide what grows and where people live?": "{place}全境都在热带。这决定了什么作物长得出来、人又住在哪里？",   /* atlas-examples.js (#R337) */
  "{place} is scattered over far more sea than land — which piece of it lies furthest out?": "{place}的领土散布在远比陆地更广的海域上。最远的一块在哪里？",   /* atlas-examples.js (#R337) */
  "{place} is wealthy and tightly governed at once — what holds that arrangement together?": "{place}既富裕又治理严密。是什么撑起这样的组合？",   /* atlas-examples.js (#R337) */
  "{place} has one of the biggest economies in the world and one of the lower incomes per head — where does the gap sit?": "{place}拥有世界级的经济规模，人均所得却偏低。落差出在哪里？",   /* atlas-examples.js (#R337) */
  "People in {place} live long lives on modest incomes — what is going right?": "{place}所得不算高，人却长寿。哪里做对了？",   /* atlas-examples.js (#R337) */
  "{place} uses the US dollar instead of a currency of its own — why, and what did it give up?": "{place}使用美元而非自己的货币。为什么？又放弃了什么？",   /* atlas-examples.js (#R337) */
  "{place} runs in {n} languages at once — how do government, school and media handle that?": "{place}同时以{n}种语言运作。行政、学校与媒体如何应付？",   /* atlas-examples.js (#R337) */
  "{place} does not set its own interest rates — it uses the euro. What has that bought, and what has it cost?": "{place}不自定义利率——它用的是欧元。这换来了什么，又付出了什么？",   /* atlas-examples.js (#R337) */
  "Fewer people live in {place} than in a mid-sized city — how does a state that small work?": "{place}的人口比一座中型城市还少。这样的规模，国家怎么运转？",   /* atlas-examples.js (#R337) */
  "{place} has one of the lowest incomes per head anywhere — where does the money that does arrive come from?": "{place}的人均所得是全球最低之列。那些确实进来的钱从哪里来？",   /* atlas-examples.js (#R337) */
  "Life is cut short in {place} compared with most of the world — by what, and what is changing?": "{place}的平均寿命在全球偏低。原因是什么？又有什么正在改变？",   /* atlas-examples.js (#R337) */
  "Almost everyone in {place} is online — what did it take to get there?": "{place}几乎人人上网。走到这一步需要什么？",   /* atlas-examples.js (#R337) */
  "{place} spends almost nothing on defence — who or what actually guarantees its security?": "{place}几乎不花钱在国防上。实际保障它安全的是谁、是什么？",   /* atlas-examples.js (#R337) */
  "More than a hundred million people live in {place} — what does the state do well at that scale, and what breaks?": "{place}住着超过一亿人。在这种规模下，国家做得好的是什么？又是哪里撑不住？",   /* atlas-examples.js (#R337) */
  "{place}’s summer is the northern hemisphere’s winter — where does that show up in its economy?": "{place}的夏天是北半球的冬天。这在它的经济里体现在哪里？",   /* atlas-examples.js (#R337) */
  "Winter days are short in {place} — what does that do to its energy use and how people live?": "{place}冬天日照很短。这对能源使用与生活方式有什么影响？",   /* atlas-examples.js (#R337) */
  "What is falling over {place} right now, and where is it heading next?": "此刻{place}正在下什么？接下来会往哪里移动？",   /* atlas-examples.js (#R337) */
  "How much of {place} sits low enough for the sea to reach it, and by when?": "{place}有多少土地低到海水会淹上来？到什么时候？",   /* atlas-examples.js (#R337) */
  "Which tectonic plates meet near {place}, and how fast are they moving?": "{place}附近有哪些板块交会？移动速度多快？",   /* atlas-examples.js (#R337) */
  "Which climate zones does {place} span, and which of them are shifting?": "{place}横跨哪些气候带？其中哪些正在移动？",   /* atlas-examples.js (#R337) */
  "How far do {place}’s maritime claims reach, and where are they contested?": "{place}的海域主张延伸到哪里？哪些地方有争议？",   /* atlas-examples.js (#R337) */
  "What is passing over {place} in orbit right now, and what is it for?": "此刻有哪些卫星正通过{place}上空？它们是做什么用的？",   /* atlas-examples.js (#R337) */
  "Where do {place}’s data centres sit, and what decided those locations?": "{place}的数据中心分布在哪里？是什么决定了这些位置？",   /* atlas-examples.js (#R337) */
  "What do the night lights over {place} say about where its people and money are?": "{place}的夜间灯光说明了人与钱在哪里？",   /* atlas-examples.js (#R337) */
  "Which coastlines does the sea reach first as it rises?": "海平面上升时，最先被淹到的海岸线是哪些？",   /* atlas-examples.js (#R337) */
  "Where are the tectonic plates moving fastest, and what is that building?": "板块移动最快的地方在哪里？那里正在形成什么？",   /* atlas-examples.js (#R337) */
  "How crowded is low Earth orbit now, and who owns what up there?": "现在的低地球轨道有多拥挤？上面的东西又分别属于谁？",   /* atlas-examples.js (#R337) */
  "Which countries host the most data centres, and what draws them there?": "哪些国家的数据中心最多？是什么把它们吸引过去？",   /* atlas-examples.js (#R337) */
  "You are looking at the border between {a} and {b} — how was that line drawn, and what crosses it?": "现在看到的是{a}与{b}之间的国界。这条线是怎么画出来的？又有什么跨越它？",   /* atlas-examples.js (#R392) */
  "{nc} countries meet inside this view — what decides where the lines fall?": "这个视野里有 {nc} 个国家相接。界线落在哪里，是由什么决定的？",   /* atlas-examples.js (#R392) */
  "Two countries face each other across this water — where does the boundary run, and who polices it?": "两个国家隔着这片水域相望。界线走在哪里？由谁巡逻执法？",   /* atlas-examples.js (#R392) */
  "This is one of the world’s maritime chokepoints — what passes through it, and what happens if it closes?": "这里是全球海运的咽喉要道之一。有什么从这里通过？一旦封闭会怎么样？",   /* atlas-examples.js (#R392) */
  "There is a spaceport or tracking station in this view — what launches or listens from here?": "这个视野里有太空发射场或卫星追踪站。从这里发射什么？又在听什么？",   /* atlas-examples.js (#R392) */
  "Major energy infrastructure runs through this view — what does it move, and who depends on it?": "有大型能源设施穿过这个视野。它输送什么？谁依赖它？",   /* atlas-examples.js (#R392) */
  "This is one of the world’s technology clusters — what is actually made here, and why here?": "这里是全球主要的科技重镇之一。这里实际生产什么？又为什么是这里？",   /* atlas-examples.js (#R392) */
  "There is a major port or naval facility in this view — what moves through it, and who runs it?": "这个视野里有主要港口或海军设施。有什么从这里进出？又是谁在管理？",   /* atlas-examples.js (#R392) */
  "There is a major military installation in this view — whose is it, and what does it cover?": "这个视野里有大型军事设施。它属于哪一国？涵盖的范围到哪里？",   /* atlas-examples.js (#R392) */
  "{water}: what crosses it here, and how deep does it get?": "{water}：有什么从这一带经过？水有多深？",   /* atlas-examples.js (#R392) */
  "{water}: who has a coast on it, and what is contested there?": "{water}：哪些国家在这片海域有海岸？那里有什么争议？",   /* atlas-examples.js (#R392) */
  "{water}: who fishes it, who ships through it, and who drills in it?": "{water}：在这里捕鱼的、行船的、钻探的，分别是谁？",   /* atlas-examples.js (#R392) */
  "{water} is a narrow passage — who controls both sides, and what moves through it?": "{water}：一条狭窄的水道。两侧各由谁控制？有什么从中通过？",   /* atlas-examples.js (#R392) */
  "{water}: what lives in it, who draws water from it, and is it shrinking?": "{water}：里面住着什么？谁在取水？水面是不是正在缩小？",   /* atlas-examples.js (#R392) */
  "This is where {place} meets {water} — what does that coast carry?": "这里是{place}与{water}相接之处。这条海岸线承担着什么？",   /* atlas-examples.js (#R392) */
  "{city}: what is this part of it used for, and what stood here before?": "{city}：这一带是做什么用的？以前这里有什么？",   /* atlas-examples.js (#R392) */
  /* (#R455) 「{city}は何の上に筑かれ…」を、街の性格で3つに割ったうちの2つ — js/atlas-examples.js。
     ⚠ {city} / {water} は描画时に地名へ置换されるトークン。缀りを変えると一致しない。 */
  "{city} sits within sight of a border — what crosses there, and how has that shaped the place?": "{city}：从这座城市一眼就能望见国界。有什么跨越那条线？这又如何塑造了这座城市？",   /* atlas-examples.js (#R455) */
  "{city} lives off {water} — what comes and goes through here, and who depends on it?": "{city}：这座城市以{water}为生。有什么从这里进出？又有谁依赖它？",   /* atlas-examples.js (#R455) */
  "{city}: what is it built on, and what does it do that its neighbours do not?": "{city}：这座城市建立在什么之上？它做了哪些邻近城市做不到的事？",   /* atlas-examples.js (#R392) */
  "This view is almost continuous built-up area — where does {city} actually end?": "这个视野几乎是连成一片的建成区。{city}到底在哪里结束？",   /* atlas-examples.js (#R392) */
  "{city} is the only named place in this whole view — what keeps it supplied?": "整个视野里有名字的地方只有{city}。是什么在供养它？",   /* atlas-examples.js (#R392) */
  "There is not one named settlement in this view — what is this land used for?": "这个视野里没有一个有名字的聚落。这片土地用来做什么？",   /* atlas-examples.js (#R392) */
  "There is no land anywhere in this view — what lies on the seabed under it, and who claims it?": "这个视野里没有半点陆地。下方的海底有什么？又是谁在主张权利？",   /* atlas-examples.js (#R392) */
  "This view is nearly all {water} with a little land in it — whose land is that, and what does it control?": "{water}：这个视野几乎全是水，只有一小块陆地。那块陆地属于谁？又控制着什么？",   /* atlas-examples.js (#R392) */
  "The equator crosses this view — where exactly, and what changes from one side to the other?": "赤道横穿这个视野。它究竟从哪里通过？两侧又有什么不同？",   /* atlas-examples.js (#R392) */
  "Everything in this view sits in the high latitudes — what does the ice do to it through the year?": "这个视野整个位于高纬度。一年之中，冰对这里做了什么？",   /* atlas-examples.js (#R392) */
  "{peak} rises {ele} m here — what does it do to the weather and the routes around it?": "{peak}：海拔 {ele} 米，耸立在此。它如何改变周围的天气与路线？",   /* atlas-examples.js (#R392) */
  /* (#R455) 「いま画面の中に実际に何件あるか」を数えたうえで出すプリセット — js/atlas-examples.js。
     ⚠ {ncab} / {nvolc} / {nquake} は描画时に数字へ置换されるトークン。缀りを変えると一致しない。 */
  "{ncab} submarine cable landings sit inside this view — where do those cables run, and what happens if one is cut?": "这个视野里有 {ncab} 处海底电缆登陆点。这些电缆通往哪里？其中一条被切断会怎么样？",   /* atlas-examples.js (#R455) */
  "One submarine cable lands inside this view — where does it go, and what happens if it is cut?": "这个视野里有一处海底电缆登陆点。这条电缆通往哪里？被切断会怎么样？",   /* atlas-examples.js (#R455) */
  "{nvolc} volcanoes stand inside this view — which of them is restless, and what would an eruption reach?": "这个视野里有 {nvolc} 座火山。哪一座正在活动？一旦喷发会波及到哪里？",   /* atlas-examples.js (#R455) */
  "{nquake} earthquakes have been recorded inside this view — which fault or plate boundary is behind them?": "这个视野里记录到 {nquake} 次地震。背后是哪条断层或板块边界？",   /* atlas-examples.js (#R455) */
  "There is news pinned inside this view right now — what is happening here, and who is reporting it?": "此刻这个视野里标着新闻地点。这里发生了什么事？又是谁在报道？",   /* atlas-examples.js (#R455) */
  "Aircraft are crossing this view right now — where are they coming from, and what routes are these?": "此刻有飞机正横越这个视野。它们从哪里起飞？这些是什么航线？",   /* atlas-examples.js (#R455) */
  "Ships are moving through this view right now — what are they carrying, and where are they bound?": "此刻有船只正通过这个视野。载运的是什么？要开往哪里？",   /* atlas-examples.js (#R455) */
  "Satellites are passing over this view right now — what are they for, and who operates them?": "此刻有卫星正飞越这个视野上空。它们是做什么用的？又是谁在营运？",   /* atlas-examples.js (#R455) */
  "There is a volcano inside this view — is it restless, and what would an eruption reach?": "这个视野里有一座火山。它正在活动吗？一旦喷发会波及到哪里？",   /* atlas-examples.js (#R455) */
  "One earthquake has been recorded inside this view — which fault or plate boundary is behind it?": "这个视野里记录到一次地震。背后是哪条断层或板块边界？",   /* atlas-examples.js (#R455) */
  "There is data-centre capacity inside this view — what does it serve, and what does it draw in power and water?": "这个视野里有数据中心。它服务的是什么？又要用掉多少电和水？",   /* atlas-examples.js (#R455) */
  "Wind particles over the temperature layer": "气温图层上的风场粒子",   /* atlas-console.js (#R337) */
  "Wind particles over the gust layer": "阵风图层上的风场粒子",   /* atlas-console.js (#R439) */
  "Wind particles over the pressure layer": "气压图层上的风场粒子",   /* atlas-console.js (#R439) */
  "Wind particles over the precipitation layer": "降水量图层上的风场粒子",   /* atlas-console.js (#R455) */
  "sea-level pressure switched on": "已开启海平面气压",   /* atlas-console.js (#R439) */
  "This panel could not be loaded — check your connection and try again.": "无法加载此面板 — 请检查网络连接后再试一次。",   /* analysis-panels.js (#R322) */
  "Columbus reaches the Americas": "哥伦布抵达美洲",   /* analysis-world-events.js (#R322) */
  "First Atlantic crossing opens the Columbian exchange.": "首次横渡大西洋，开启新旧大陆之间的哥伦布大交换。",   /* analysis-world-events.js (#R322) */
  "Peace of Westphalia": "威斯特伐利亚和约",   /* analysis-world-events.js (#R322) */
  "Birth of the modern sovereign-state order.": "近代主权国家体系的起点。",   /* analysis-world-events.js (#R322) */
  "Great Lisbon Earthquake": "里斯本大地震",   /* analysis-world-events.js (#R322) */
  "Quake+tsunami killed tens of thousands; shook European thought.": "地震与海啸造成数万人罹难，也撼动了欧洲思想。",   /* analysis-world-events.js (#R322) */
  "French Revolution": "法国大革命",   /* analysis-world-events.js (#R322) */
  "Storming of the Bastille topples the old order.": "攻陷巴士底监狱，旧制度随之崩溃。",   /* analysis-world-events.js (#R322) */
  "Congress of Vienna": "维也纳会议",   /* analysis-world-events.js (#R322) */
  "Post-Napoleonic balance-of-power settlement.": "拿破仑战争后重建欧洲的均势体系。",   /* analysis-world-events.js (#R322) */
  "Treaty of Nanking": "南京条约",   /* analysis-world-events.js (#R322) */
  "Ends the First Opium War; cedes Hong Kong.": "第一次鸦片战争结束，香港割让予英国。",   /* analysis-world-events.js (#R322) */
  "Lincoln assassinated": "林肯遇刺",   /* analysis-world-events.js (#R322) */
  "US president shot at Ford’s Theatre.": "美国总统在福特剧院中枪。",   /* analysis-world-events.js (#R322) */
  "Meiji Restoration": "明治维新",   /* analysis-world-events.js (#R322) */
  "Japan’s rapid modernisation begins.": "日本开始急速近代化。",   /* analysis-world-events.js (#R322) */
  "Suez Canal opens": "苏伊士运河通航",   /* analysis-world-events.js (#R322) */
  "Europe–Asia sea route shortened by ~7,000 km.": "欧亚航线缩短约7,000公里。",   /* analysis-world-events.js (#R322) */
  "Krakatoa eruption": "喀拉喀托火山大喷发",   /* analysis-world-events.js (#R322) */
  "One of the deadliest volcanic events in history.": "史上死伤最惨重的火山灾难之一。",   /* analysis-world-events.js (#R322) */
  "Wright brothers’ first flight": "莱特兄弟首次飞行",   /* analysis-world-events.js (#R322) */
  "Powered flight begins at Kitty Hawk.": "动力飞行在小鹰镇成真。",   /* analysis-world-events.js (#R322) */
  "San Francisco earthquake": "旧金山大地震",   /* analysis-world-events.js (#R322) */
  "M7.9 quake and fires destroy the city.": "规模7.9的地震与大火摧毁全市。",   /* analysis-world-events.js (#R322) */
  "Titanic sinks": "泰坦尼克号沉没",   /* analysis-world-events.js (#R322) */
  "1,500+ die in the North Atlantic.": "逾1,500人葬身北大西洋。",   /* analysis-world-events.js (#R322) */
  "Assassination in Sarajevo": "萨拉热窝事件",   /* analysis-world-events.js (#R322) */
  "Archduke Franz Ferdinand shot — WWI ignites.": "斐迪南大公遇刺，第一次世界大战随之爆发。",   /* analysis-world-events.js (#R322) */
  "Panama Canal opens": "巴拿马运河通航",   /* analysis-world-events.js (#R322) */
  "Atlantic and Pacific joined.": "大西洋与太平洋自此相连。",   /* analysis-world-events.js (#R322) */
  "Russian Revolution": "俄国革命",   /* analysis-world-events.js (#R322) */
  "Bolsheviks seize Petrograd.": "布尔什维克夺取彼得格勒。",   /* analysis-world-events.js (#R322) */
  "WWI Armistice": "第一次世界大战停战",   /* analysis-world-events.js (#R322) */
  "Fighting ends in the Compiègne railway carriage.": "各方在贡比涅森林的火车车厢内签署停战协定。",   /* analysis-world-events.js (#R322) */
  "1918 influenza pandemic": "1918年流感大流行",   /* analysis-world-events.js (#R322) */
  "Tens of millions die worldwide.": "全球数千万人死亡。",   /* analysis-world-events.js (#R322) */
  "Treaty of Versailles": "凡尔赛条约",   /* analysis-world-events.js (#R322) */
  "Redraws Europe; seeds future conflict.": "重划欧洲版图，也埋下新的冲突火种。",   /* analysis-world-events.js (#R322) */
  "Great Kantō earthquake": "关东大地震",   /* analysis-world-events.js (#R322) */
  "Tokyo–Yokohama devastated; ~105,000 dead.": "东京与横滨毁于一旦，罹难者约10万5千人。",   /* analysis-world-events.js (#R322) */
  "Wall Street Crash": "华尔街股灾",   /* analysis-world-events.js (#R322) */
  "Black Tuesday opens the Great Depression.": "黑色星期二揭开大萧条的序幕。",   /* analysis-world-events.js (#R322) */
  "WWII begins": "第二次世界大战爆发",   /* analysis-world-events.js (#R322) */
  "Germany attacks Westerplatte, invades Poland.": "德军砲击韦斯特普拉特，挥军入侵波兰。",   /* analysis-world-events.js (#R322) */
  "Attack on Pearl Harbor": "偷袭珍珠港",   /* analysis-world-events.js (#R322) */
  "Japan strikes the US Pacific Fleet.": "日本突袭美国太平洋舰队。",   /* analysis-world-events.js (#R322) */
  "D-Day landings": "诺曼第登陆",   /* analysis-world-events.js (#R322) */
  "Largest amphibious invasion in history.": "史上规模最大的两栖登陆作战。",   /* analysis-world-events.js (#R322) */
  "Bretton Woods Conference": "布雷顿森林会议",   /* analysis-world-events.js (#R322) */
  "Dollar-centerd postwar monetary order.": "确立以美元为中心的战后货币体系。",   /* analysis-world-events.js (#R322) */
  "Trinity nuclear test": "三位一体核试验",   /* analysis-world-events.js (#R322) */
  "First nuclear detonation.": "人类史上第一次核爆。",   /* analysis-world-events.js (#R322) */
  "Hiroshima": "广岛原子弹爆炸",   /* analysis-world-events.js (#R322) */
  "First atomic bombing of a city.": "人类史上首次对城市投下原子弹。",   /* analysis-world-events.js (#R322) */
  "United Nations founded": "联合国成立",   /* analysis-world-events.js (#R322) */
  "UN Charter signed in San Francisco.": "《联合国宪章》在旧金山签署。",   /* analysis-world-events.js (#R322) */
  "Indian independence": "印度独立",   /* analysis-world-events.js (#R322) */
  "End of the British Raj; Partition follows.": "英属印度落幕，随后印巴分治。",   /* analysis-world-events.js (#R322) */
  "Gandhi assassinated": "甘地遇刺",   /* analysis-world-events.js (#R322) */
  "Shot in New Delhi.": "在新德里遭枪击身亡。",   /* analysis-world-events.js (#R322) */
  "People’s Republic of China founded": "中华人民共和国成立",   /* analysis-world-events.js (#R322) */
  "Mao proclaims the PRC in Beijing.": "毛泽东在北京宣告建国。",   /* analysis-world-events.js (#R322) */
  "NATO founded": "北约成立",   /* analysis-world-events.js (#R322) */
  "North Atlantic Treaty signed in Washington.": "《北大西洋公约》在华盛顿签署。",   /* analysis-world-events.js (#R322) */
  "Korean War begins": "朝鲜战争爆发",   /* analysis-world-events.js (#R322) */
  "North invades across the 38th parallel.": "北方越过三十八度线南侵。",   /* analysis-world-events.js (#R322) */
  "Suez Crisis": "苏伊士运河危机",   /* analysis-world-events.js (#R322) */
  "Canal nationalisation triggers war; superpowers force a halt.": "运河收归国有引发战争，美苏施压迫使停火。",   /* analysis-world-events.js (#R322) */
  "Sputnik 1": "斯普特尼克1号",   /* analysis-world-events.js (#R322) */
  "First artificial satellite — the space age begins.": "人类第一颗人造卫星，太空时代就此展开。",   /* analysis-world-events.js (#R322) */
  "Treaty of Rome": "罗马条约",   /* analysis-world-events.js (#R322) */
  "European Economic Community founded.": "欧洲经济共同体就此成立。",   /* analysis-world-events.js (#R322) */
  "Cuban Revolution": "古巴革命",   /* analysis-world-events.js (#R322) */
  "Castro takes Havana.": "卡斯特罗进入哈瓦那掌权。",   /* analysis-world-events.js (#R322) */
  "Berlin Wall built": "柏林围墙筑起",   /* analysis-world-events.js (#R322) */
  "East Germany seals the inner-Berlin border.": "东德封锁柏林市内的边界。",   /* analysis-world-events.js (#R322) */
  "Gagarin orbits Earth": "加加林绕行地球",   /* analysis-world-events.js (#R322) */
  "First human in space.": "人类首次进入太空。",   /* analysis-world-events.js (#R322) */
  "Cuban Missile Crisis": "古巴导弹危机",   /* analysis-world-events.js (#R322) */
  "The Cold War’s closest brush with nuclear war.": "冷战期间最接近核战的一刻。",   /* analysis-world-events.js (#R322) */
  "JFK assassinated": "肯尼迪总统遇刺",   /* analysis-world-events.js (#R322) */
  "Shot in Dallas.": "在达拉斯遭枪击身亡。",   /* analysis-world-events.js (#R322) */
  "Six-Day War": "六日战争",   /* analysis-world-events.js (#R322) */
  "Israel takes Sinai, Golan, West Bank, Gaza.": "以色列夺取西奈半岛、戈兰高地、约旦河西岸与加沙。",   /* analysis-world-events.js (#R322) */
  "Martin Luther King Jr. assassinated": "马丁·路德·金博士遇刺",   /* analysis-world-events.js (#R322) */
  "Shot in Memphis.": "在孟菲斯遭枪击身亡。",   /* analysis-world-events.js (#R322) */
  "Apollo 11": "阿波罗11号",   /* analysis-world-events.js (#R322) */
  "Launch of the first crewed Moon landing.": "人类首次载人登月任务发射升空。",   /* analysis-world-events.js (#R322) */
  "Nixon shock": "尼克松震撼",   /* analysis-world-events.js (#R322) */
  "Dollar–gold convertibility ends.": "美元停止兑换黄金。",   /* analysis-world-events.js (#R322) */
  "1973 oil crisis": "1973年石油危机",   /* analysis-world-events.js (#R322) */
  "OPEC embargo quadruples oil prices.": "石油输出国组织禁运，油价暴涨四倍。",   /* analysis-world-events.js (#R322) */
  "Fall of Saigon": "西贡陷落",   /* analysis-world-events.js (#R322) */
  "Vietnam War ends.": "越战就此结束。",   /* analysis-world-events.js (#R322) */
  "Iranian Revolution": "伊朗革命",   /* analysis-world-events.js (#R322) */
  "Shah falls; Islamic Republic founded.": "巴列维王朝垮台，伊斯兰共和国成立。",   /* analysis-world-events.js (#R322) */
  "Soviet invasion of Afghanistan": "苏联入侵阿富汗",   /* analysis-world-events.js (#R322) */
  "A decade-long quagmire begins.": "长达十年的泥淖就此开始。",   /* analysis-world-events.js (#R322) */
  "Bhopal gas disaster": "博帕尔毒气外泄事故",   /* analysis-world-events.js (#R322) */
  "World’s worst industrial accident.": "史上最严重的工业灾难。",   /* analysis-world-events.js (#R322) */
  "Plaza Accord": "广场协议",   /* analysis-world-events.js (#R322) */
  "Coordinated dollar depreciation; yen surges.": "各国协同压低美元，日元急速升值。",   /* analysis-world-events.js (#R322) */
  "Chernobyl disaster": "切尔诺贝利核灾",   /* analysis-world-events.js (#R322) */
  "Worst nuclear accident in history.": "史上最严重的核能事故。",   /* analysis-world-events.js (#R322) */
  "Challenger disaster": "挑战者号航天飞机失事",   /* analysis-world-events.js (#R322) */
  "Shuttle lost 73 seconds after launch.": "航天飞机于升空73秒后解体。",   /* analysis-world-events.js (#R322) */
  "Fall of the Berlin Wall": "柏林围墙倒塌",   /* analysis-world-events.js (#R322) */
  "The Iron Curtain cracks open.": "铁幕自此出现裂口。",   /* analysis-world-events.js (#R322) */
  "Tiananmen Square crackdown": "天安门事件",   /* analysis-world-events.js (#R322) */
  "Pro-democracy protests suppressed.": "民主运动遭到武力镇压。",   /* analysis-world-events.js (#R322) */
  "Gulf War": "波斯湾战争",   /* analysis-world-events.js (#R322) */
  "Coalition liberates Kuwait.": "多国联军解放科威特。",   /* analysis-world-events.js (#R322) */
  "Dissolution of the USSR": "苏联解体",   /* analysis-world-events.js (#R322) */
  "The Soviet flag is lowered over the Kremlin.": "苏联国旗自克里姆林宫降下。",   /* analysis-world-events.js (#R322) */
  "End of apartheid": "种族隔离制度终结",   /* analysis-world-events.js (#R322) */
  "Mandela becomes president.": "曼德拉就任总统。",   /* analysis-world-events.js (#R322) */
  "Rabin assassinated": "拉宾总理遇刺",   /* analysis-world-events.js (#R322) */
  "Israeli PM shot at a peace rally.": "以色列总理在和平集会上遭枪击。",   /* analysis-world-events.js (#R322) */
  "Hong Kong handover": "香港主权移交",   /* analysis-world-events.js (#R322) */
  "British rule ends after 156 years.": "156年的英国统治就此告终。",   /* analysis-world-events.js (#R322) */
  "Asian financial crisis": "亚洲金融风暴",   /* analysis-world-events.js (#R322) */
  "Baht collapse cascades across Asia.": "泰铢崩跌，冲击扩散至全亚洲。",   /* analysis-world-events.js (#R322) */
  "Euro launched": "欧元诞生",   /* analysis-world-events.js (#R322) */
  "Single currency for 11 EU states.": "欧盟11国启用单一货币。",   /* analysis-world-events.js (#R322) */
  "September 11 attacks": "九一一恐怖攻击",   /* analysis-world-events.js (#R322) */
  "Al-Qaeda attacks New York and Washington.": "基地组织攻击纽约与华盛顿。",   /* analysis-world-events.js (#R322) */
  "Iraq War begins": "伊拉克战争开打",   /* analysis-world-events.js (#R322) */
  "US-led coalition invades Iraq.": "美国主导的联军入侵伊拉克。",   /* analysis-world-events.js (#R322) */
  "Indian Ocean tsunami": "南亚大海啸",   /* analysis-world-events.js (#R322) */
  "~230,000 dead across 14 countries.": "14个国家约23万人罹难。",   /* analysis-world-events.js (#R322) */
  "Hurricane Katrina": "卡特里娜飓风",   /* analysis-world-events.js (#R322) */
  "New Orleans flooded.": "新奥尔良全城遭洪水淹没。",   /* analysis-world-events.js (#R322) */
  "Lehman Brothers collapse": "雷曼兄弟破产",   /* analysis-world-events.js (#R322) */
  "Global financial crisis erupts.": "全球金融危机就此爆发。",   /* analysis-world-events.js (#R322) */
  "Arab Spring begins": "阿拉伯之春揭幕",   /* analysis-world-events.js (#R322) */
  "Tunisian uprising spreads across the region.": "突尼斯的起义扩散至整个地区。",   /* analysis-world-events.js (#R322) */
  "Greek debt crisis": "希腊债务危机",   /* analysis-world-events.js (#R322) */
  "Eurozone sovereign-debt crisis begins.": "欧元区主权债务危机的开端。",   /* analysis-world-events.js (#R322) */
  "Haiti earthquake": "海地大地震",   /* analysis-world-events.js (#R322) */
  "~200,000+ dead near Port-au-Prince.": "太子港一带逾20万人罹难。",   /* analysis-world-events.js (#R322) */
  "Tōhoku earthquake & tsunami": "东日本大地震与海啸",   /* analysis-world-events.js (#R322) */
  "M9.1 quake, tsunami and the Fukushima accident.": "规模9.1的地震、海啸，以及福岛核灾。",   /* analysis-world-events.js (#R322) */
  "Annexation of Crimea": "克里米亚遭并吞",   /* analysis-world-events.js (#R322) */
  "Russia seizes the peninsula from Ukraine.": "俄罗斯自乌克兰手中夺取半岛。",   /* analysis-world-events.js (#R322) */
  "First orbital booster landing": "轨道火箭第一节首次回收着陆",   /* analysis-world-events.js (#R322) */
  "SpaceX lands Falcon 9 — reusability era.": "SpaceX成功回收猎鹰9号，开启可重复使用的时代。",   /* analysis-world-events.js (#R322) */
  "Brexit referendum": "英国脱欧公投",   /* analysis-world-events.js (#R322) */
  "UK votes to leave the EU.": "英国投票决定退出欧盟。",   /* analysis-world-events.js (#R322) */
  "COVID-19 outbreak": "COVID-19疫情爆发",   /* analysis-world-events.js (#R322) */
  "Pandemic that reshaped the world.": "改变了整个世界的大流行。",   /* analysis-world-events.js (#R322) */
  "Russia invades Ukraine": "俄罗斯入侵乌克兰",   /* analysis-world-events.js (#R322) */
  "Largest war in Europe since 1945.": "1945年以来欧洲规模最大的战争。",   /* analysis-world-events.js (#R322) */
  "Abe Shinzō assassinated": "安倍晋三前首相遇刺",   /* analysis-world-events.js (#R322) */
  "Former Japanese PM shot in Nara.": "日本前首相在奈良遭枪击身亡。",   /* analysis-world-events.js (#R322) */
  "Türkiye–Syria earthquakes": "土耳其与叙利亚强震",   /* analysis-world-events.js (#R322) */
  "M7.8 doublet; 55,000+ dead.": "规模7.8的双主震，逾5万5千人罹难。",   /* analysis-world-events.js (#R322) */
  "October 7 attacks / Gaza war": "十月七日攻击与加沙战争",   /* analysis-world-events.js (#R322) */
  "Hamas attack and the war that followed.": "哈马斯发动攻击，随后演变为战争。",   /* analysis-world-events.js (#R322) */
  "Taiwan (Hualien) earthquake": "台湾花莲地震",   /* analysis-world-events.js (#R322) */
  "M7.4 quake off eastern Taiwan.": "台湾东部外海发生规模7.4的地震。",   /* analysis-world-events.js (#R322) */
  "Fall of the Assad regime": "阿萨德政权垮台",   /* analysis-world-events.js (#R322) */
  "Syrian government collapses; Assad flees.": "叙利亚政府崩溃，阿萨德出逃国外。",   /* analysis-world-events.js (#R322) */
  "2024 US presidential election": "2024年美国总统大选",   /* analysis-world-events.js (#R322) */
  "Trump wins a second, non-consecutive term.": "特朗普赢得非连续的第二个任期。",   /* analysis-world-events.js (#R322) */
  "Haitian independence": "海地独立",   /* analysis-world-events.js (#R322) */
  "First Black-led republic; slavery abolished.": "史上第一个由黑人领导的共和国，并废除奴隶制。",   /* analysis-world-events.js (#R322) */
  "Penicillin discovered": "青霉素的发现",   /* analysis-world-events.js (#R322) */
  "Fleming opens the antibiotic era.": "弗莱明开启抗生素的时代。",   /* analysis-world-events.js (#R322) */
  "Warsaw Pact formed": "华沙公约组织成立",   /* analysis-world-events.js (#R322) */
  "Soviet-led military alliance.": "由苏联主导的军事同盟。",   /* analysis-world-events.js (#R322) */
  "Year of Africa": "非洲独立年",   /* analysis-world-events.js (#R322) */
  "17 African nations gain independence.": "17个非洲国家在这一年独立。",   /* analysis-world-events.js (#R322) */
  "German reunification": "两德统一",   /* analysis-world-events.js (#R322) */
  "East and West Germany reunite.": "东德与西德重新合而为一。",   /* analysis-world-events.js (#R322) */
  "Coalition expels Iraq from Kuwait.": "多国联军将伊拉克逐出科威特。",   /* analysis-world-events.js (#R322) */
  "iPhone introduced": "iPhone发表",   /* analysis-world-events.js (#R322) */
  "The modern smartphone era begins.": "现代智能手机的时代就此展开。",   /* analysis-world-events.js (#R322) */
  "Higgs boson discovered": "希格斯玻色子的发现",   /* analysis-world-events.js (#R322) */
  "CERN confirms the Higgs boson.": "CERN证实希格斯玻色子的存在。",   /* analysis-world-events.js (#R322) */
  "Inter-Korean summit": "两韩领袖会谈",   /* analysis-world-events.js (#R322) */
  "Koreas meet at Panmunjom.": "南北双方在板门店会面。",   /* analysis-world-events.js (#R322) */
  "WHO declares COVID-19 a pandemic": "WHO宣布COVID-19为大流行",   /* analysis-world-events.js (#R322) */
  "Global pandemic declared in March 2020.": "2020年3月正式宣告全球大流行。",   /* analysis-world-events.js (#R322) */
  "US Capitol attack": "美国国会大厦遭闯入",   /* analysis-world-events.js (#R322) */
  "Rioters storm the US Capitol.": "暴徒冲进国会大厦。",   /* analysis-world-events.js (#R322) */
  "Fall of Constantinople": "君士坦丁堡陷落",   /* analysis-world-events.js (#R322) */
  "Ottomans end the Byzantine Empire.": "奥斯曼帝国终结了拜占庭帝国。",   /* analysis-world-events.js (#R322) */
  "Protestant Reformation": "宗教改革",   /* analysis-world-events.js (#R322) */
  "Luther’s 95 Theses split Western Christianity.": "路德的《九十五条论纲》使西方基督教分裂。",   /* analysis-world-events.js (#R322) */
  "US Declaration of Independence": "美国独立宣言",   /* analysis-world-events.js (#R322) */
  "Thirteen colonies declare independence.": "十三个殖民地宣告独立。",   /* analysis-world-events.js (#R322) */
  "On the Origin of Species": "《物种起源》出版",   /* analysis-world-events.js (#R322) */
  "Darwin sets out evolution by natural selection.": "达尔文提出以自然选择为机制的演化论。",   /* analysis-world-events.js (#R322) */
  "World War I begins": "第一次世界大战爆发",   /* analysis-world-events.js (#R322) */
  "The assassination in Sarajevo triggers global war.": "萨拉热窝的刺杀事件引爆世界大战。",   /* analysis-world-events.js (#R322) */
  "Bolsheviks seize power in Petrograd.": "布尔什维克在彼得格勒夺取政权。",   /* analysis-world-events.js (#R322) */
  "End of World War I": "第一次世界大战结束",   /* analysis-world-events.js (#R322) */
  "Armistice signed at Compiègne.": "各方在贡比涅签署停战协定。",   /* analysis-world-events.js (#R322) */
  "Wall Street Crash of 1929": "1929年华尔街股灾",   /* analysis-world-events.js (#R322) */
  "Market collapse triggers the Great Depression.": "股市崩盘引爆大萧条。",   /* analysis-world-events.js (#R322) */
  "World War II begins": "第二次世界大战爆发",   /* analysis-world-events.js (#R322) */
  "Germany invades Poland.": "德国入侵波兰。",   /* analysis-world-events.js (#R322) */
  "End of World War II": "第二次世界大战结束",   /* analysis-world-events.js (#R322) */
  "Japan’s surrender ends the war.": "日本投降，大战就此终结。",   /* analysis-world-events.js (#R322) */
  "Partition of India": "印巴分治",   /* analysis-world-events.js (#R322) */
  "British India splits into two states.": "英属印度一分为二。",   /* analysis-world-events.js (#R322) */
  "Establishment of Israel": "以色列建国",   /* analysis-world-events.js (#R322) */
  "The State of Israel is declared.": "以色列国正式宣告成立。",   /* analysis-world-events.js (#R322) */
  "Stonewall uprising": "石墙事件",   /* analysis-world-events.js (#R322) */
  "Catalyst of the modern LGBT-rights movement.": "现代LGBT权利运动的起点。",   /* analysis-world-events.js (#R322) */
  "Nixon visits China": "尼克松访问中国",   /* analysis-world-events.js (#R322) */
  "A turning point in US–China relations.": "美中关系的重大转折。",   /* analysis-world-events.js (#R322) */
  "Iraq invades Kuwait": "伊拉克入侵科威特",   /* analysis-world-events.js (#R322) */
  "Trigger of the Gulf War.": "波斯湾战争的导火线。",   /* analysis-world-events.js (#R322) */
  "Rwandan genocide": "卢旺达大屠杀",   /* analysis-world-events.js (#R322) */
  "~800,000 killed in about 100 days.": "约100天内有近80万人遇害。",   /* analysis-world-events.js (#R322) */
  "Deepwater Horizon oil spill": "深水地平线漏油事故",   /* analysis-world-events.js (#R322) */
  "Largest marine oil spill in history.": "史上规模最大的海上原油外泄。",   /* analysis-world-events.js (#R322) */
  "November 2015 Paris attacks": "2015年11月巴黎连环恐攻",   /* analysis-world-events.js (#R322) */
  "Coordinated attacks kill 130 across Paris.": "多起同步攻击造成130人死亡。",   /* analysis-world-events.js (#R322) */
  "Notre-Dame fire": "巴黎圣母院大火",   /* analysis-world-events.js (#R322) */
  "The Paris cathedral’s spire collapses in flames.": "大教堂的尖塔在烈焰中崩塌。",   /* analysis-world-events.js (#R322) */
  "US withdrawal from Afghanistan": "美军撤出阿富汗",   /* analysis-world-events.js (#R322) */
  "The Taliban retake Kabul.": "塔利班重新掌控喀布尔。",   /* analysis-world-events.js (#R322) */
  "ChatGPT launched": "ChatGPT上线",   /* analysis-world-events.js (#R322) */
  "Generative AI reaches mass adoption.": "生成式AI就此普及。",   /* analysis-world-events.js (#R322) */
  "JWST first images": "韦布太空望远镜首批影像",   /* analysis-world-events.js (#R322) */
  "Deepest infrared view of the universe yet.": "迄今最深远的红外线宇宙影像。",   /* analysis-world-events.js (#R322) */
  "Black Death reaches Europe": "黑死病传入欧洲",   /* analysis-world-events.js (#R322) */
  "Plague kills roughly a third of Europe.": "鼠疫夺走欧洲约三分之一的人口。",   /* analysis-world-events.js (#R322) */
  "Copernican heliocentrism": "哥白尼提出日心说",   /* analysis-world-events.js (#R322) */
  "Copernicus places the Sun at the center.": "哥白尼把太阳置于宇宙的中心。",   /* analysis-world-events.js (#R322) */
  "Newton’s Principia": "牛顿《自然哲学的数学原理》出版",   /* analysis-world-events.js (#R322) */
  "Laws of motion and universal gravitation.": "提出运动定律与万有引力定律。",   /* analysis-world-events.js (#R322) */
  "Industrial Revolution": "工业革命",   /* analysis-world-events.js (#R322) */
  "Steam power launches modern industry.": "蒸汽动力开启了近代工业。",   /* analysis-world-events.js (#R322) */
  "Battle of Waterloo": "滑铁卢战役",   /* analysis-world-events.js (#R322) */
  "Napoleon’s final defeat.": "拿破仑最后一场败仗。",   /* analysis-world-events.js (#R322) */
  "DNA double helix": "DNA双螺旋结构",   /* analysis-world-events.js (#R322) */
  "Watson & Crick reveal the structure of DNA.": "沃森与克里克解开DNA的结构。",   /* analysis-world-events.js (#R322) */
  "First ascent of Everest": "首次登顶珠穆朗玛峰",   /* analysis-world-events.js (#R322) */
  "Hillary and Tenzing reach the summit.": "希拉里与丹增登上世界最高峰。",   /* analysis-world-events.js (#R322) */
  "First human heart transplant": "全球首例人类心脏移植",   /* analysis-world-events.js (#R322) */
  "Barnard performs the operation in Cape Town.": "巴纳德在开普敦完成这场手术。",   /* analysis-world-events.js (#R322) */
  "Munich Olympics massacre": "慕尼黑奥运惨案",   /* analysis-world-events.js (#R322) */
  "Israeli athletes taken hostage and killed.": "以色列选手遭挟持并杀害。",   /* analysis-world-events.js (#R322) */
  "Iran–Iraq War begins": "两伊战争爆发",   /* analysis-world-events.js (#R322) */
  "An eight-year war begins along the border.": "边境上展开长达八年的战争。",   /* analysis-world-events.js (#R322) */
  "Falklands War": "马尔维纳斯战争",   /* analysis-world-events.js (#R322) */
  "Britain and Argentina clash over the islands.": "英国与阿根廷为争夺群岛而交战。",   /* analysis-world-events.js (#R322) */
  "World Wide Web proposed": "万维网（WWW）的提案",   /* analysis-world-events.js (#R322) */
  "Berners-Lee invents the Web at CERN.": "伯纳斯-李在CERN发明了万维网。",   /* analysis-world-events.js (#R322) */
  "Dolly the sheep cloned": "克隆羊多莉诞生",   /* analysis-world-events.js (#R322) */
  "First mammal cloned from an adult cell.": "第一只由成体细胞复制而成的哺乳动物。",   /* analysis-world-events.js (#R322) */
  "Human Genome Project completed": "人类基因组计划完成",   /* analysis-world-events.js (#R322) */
  "The human genome is fully sequenced.": "人类基因组的定序全部完成。",   /* analysis-world-events.js (#R322) */
  "Fall of Gaddafi": "卡扎菲政权垮台",   /* analysis-world-events.js (#R322) */
  "Libya’s long-time ruler is overthrown.": "统治利比亚数十年的领导人遭到推翻。",   /* analysis-world-events.js (#R322) */
  "Paris Climate Agreement": "巴黎气候协定",   /* analysis-world-events.js (#R322) */
  "196 parties adopt a global climate accord.": "196个缔约方通过全球气候协定。",   /* analysis-world-events.js (#R322) */
  "Sudan civil war": "苏丹内战",   /* analysis-world-events.js (#R322) */
  "Fighting erupts between the army and the RSF.": "政府军与快速支持部队爆发战斗。",   /* analysis-world-events.js (#R322) */
  '{what} — done.': '{what} — 已完成。',   /* atlas-results.js (#R318) atlas.result.completed.named */
  'Still running…': '仍在执行中…',   /* atlas-results.js (#R318) atlas.result.running */
  'Still running — {done} of {total}.': '执行中 — {total} 项中的 {done} 项。',   /* atlas-results.js (#R318) atlas.result.running.progress */
  'Partly done — {done} of {total}.': '部分完成 — {total} 项中的 {done} 项。',   /* atlas-results.js (#R318) atlas.result.partial */
  'That did not happen.': '这并未执行。',   /* atlas-results.js (#R318) atlas.result.failed */
  'Cancelled.': '已取消。',   /* atlas-results.js (#R318) atlas.result.cancelled */
  'Replaced by your newer request.': '已被你较新的要求取代。',   /* atlas-results.js (#R318) atlas.result.superseded */
  'I need one more thing before I can do that.': '在执行之前，我还需要一项信息。',   /* atlas-results.js (#R318) atlas.result.needs_input */
  'It was calculated but nothing was drawn on the map.': '已完成计算，但地图上没有画出任何东西。',   /* atlas-results.js (#R318) atlas.code.not_rendered */
  'It is on the map but currently hidden.': '它在地图上，但目前处于隐藏状态。',   /* atlas-results.js (#R318) atlas.code.not_visible */
  'Nothing on the map changed.': '地图上没有任何变化。',   /* atlas-results.js (#R318) atlas.code.no_change */
  'That is not available right now.': '目前无法使用。',   /* atlas-results.js (#R318) atlas.code.unavailable */
  'I do not have that operation.': '我没有这项操作。',   /* atlas-results.js (#R318) atlas.code.unknown_capability */
  'The values given for that operation were not usable.': '传给该操作的数值无法使用。',   /* atlas-results.js (#R318) atlas.code.bad_args */
  'Several things match — which one?': '有多个相符的项目 — 是哪一个？',   /* atlas-results.js (#R318) atlas.code.ambiguous_target */
  'It did not finish in time.': '未能在时限内完成。',   /* atlas-results.js (#R318) atlas.code.timeout */
  'It stopped with an error.': '因发生错误而停止。',   /* atlas-results.js (#R318) atlas.code.threw */
  'That one needs your confirmation first.': '这一项需要你先确认。',   /* atlas-results.js (#R318) atlas.code.needs_confirm */
  'Tap the point on the map you mean.': '请在地图上点击你所指的地点。',   /* atlas-results.js (#R318) atlas.input.point */
  'Draw the line on the map.': '请在地图上画出线条。',   /* atlas-results.js (#R318) atlas.input.polyline */
  'Draw the area on the map.': '请在地图上画出范围。',   /* atlas-results.js (#R318) atlas.input.polygon */
  'Choose one:': '请选择一项：',   /* atlas-results.js (#R318) atlas.input.choice */
  'Tell me the value to use.': '请告诉我要使用的值。',   /* atlas-results.js (#R318) atlas.input.text */
  'Tell me the number to use.': '请告诉我要使用的数字。',   /* atlas-results.js (#R318) atlas.input.number */
  'You asked for this on the map, and it is not on the map yet.': '你要求把它显示在地图上，但它还没有出现在地图上。',   /* atlas-results.js (#R318) atlas.goal.map_missing */
  'You asked for an explanation, and I only operated the map.': '你要求的是说明，但我只操作了地图。',   /* atlas-results.js (#R318) atlas.goal.explanation_missing */
  'You asked me to do something, and I only wrote about it.': '你要求的是操作，但我只用文字说明。',   /* atlas-results.js (#R318) atlas.goal.action_missing */
  'Not every target was reached: {names}': '并非所有目标都达成：{names}',   /* atlas-results.js (#R318) atlas.goal.targets_missing */
  'This request needed too many tries — nothing more was used from your daily allowance. Please rephrase it and try again.': '这次请求尝试的次数过多 — 你每日的可用次数并未再被扣除。请换个说法再试一次。',   /* ai-core.js (#R318) aiTurnCallsMsg */
  'place': '地点',   /* atlas-console.js (#R330) research.events footnote */
  'headline similarity': '标题相似度',   /* atlas-console.js (#R330) research.events footnote */
  '{t} slower than usual': '比平常慢{t}',   /* navigation-ui.js (#R347) */
  'A faster route saves {t}': '有更快的路线，可省{t}',   /* navigation-ui.js (#R347) */
  'Alerts only': '仅重要提示',   /* navigation-ui.js (#R347) */
  'arrive ': '抵达 ',   /* atlas-console.js (#R347) */
  'Arriving at {n}': '即将抵达{n}',   /* navigation-voice.js (#R347) */
  'Arriving at your destination': '即将抵达目的地',   /* navigation-voice.js (#R347) */
  'Arriving soon': '即将抵达',   /* navigation-ui.js (#R347) */
  'Current road': '行驶中的道路',   /* navigation-ui.js (#R347) */
  'Distance left': '剩余距离',   /* navigation-ui.js (#R347) */
  'End navigation': '结束导航',   /* navigation-ui.js (#R347) */
  'Fewer details': '显示较少',   /* navigation-ui.js (#R347) */
  'Finding a new route…': '正在寻找新路线…',   /* navigation-ui.js (#R347) */
  'Follow my position': '跟随我的位置',   /* navigation-ui.js (#R347) */
  'Following your position again.': '已恢复跟随你的位置。',   /* atlas-console.js (#R347) */
  'In {d}, {a}': '前方{d}，{a}',   /* navigation-voice.js (#R347) */
  'Location accuracy': '定位精度',   /* navigation-ui.js (#R347) */
  'More details': '显示更多',   /* navigation-ui.js (#R347) */
  'Mute voice guidance': '关闭语音导航',   /* navigation-ui.js (#R347) */
  'Navigation is not running.': '没有进行中的导航。',   /* atlas-console.js (#R347) */
  'Navigation is paused': '导航已暂停',   /* navigation-ui.js (#R347) */
  'Navigation is unavailable in this session.': '本次会话无法使用导航。',   /* atlas-console.js (#R347) */
  'Navigation started': '已开始导航',   /* atlas-console.js (#R347) */
  'Navigation stopped.': '已停止导航。',   /* atlas-console.js (#R347) */
  'New route found': '已找到新路线',   /* navigation-voice.js (#R347) */
  'Next stop': '下一个途经点',   /* navigation-ui.js (#R347) */
  'Off': '关闭',   /* navigation-ui.js (#R347) */
  'Off route': '已偏离路线',   /* navigation-voice.js (#R347) */
  'Off route.': '已偏离路线。',   /* atlas-console.js (#R347) */
  'On': '开启',   /* navigation-ui.js (#R347) */
  'Plan a route first — tell me where from and where to.': '请先规划路线 — 告诉我起点和终点。',   /* atlas-console.js (#R347) */
  'Re-centre the map': '回到我的位置',   /* navigation-ui.js (#R347) */
  'Rerouting': '正在重新规划路线',   /* navigation-voice.js (#R347) */
  'simulated': '模拟',   /* atlas-console.js (#R347) */
  'Simulated drive': '模拟行驶',   /* navigation-ui.js (#R347) */
  'Standard travel time — traffic not included.': '标准所需时间 — 未纳入路况。',   /* atlas-console.js (#R347) */
  'Stop reached': '已抵达途经点',   /* navigation-ui.js (#R347) */
  'Switch': '切换',   /* navigation-ui.js (#R347) */
  'then': '接着',   /* navigation-ui.js (#R347) */
  'Time left': '剩余时间',   /* navigation-ui.js (#R347) */
  'Traffic data is out of date': '路况数据已过期',   /* navigation-ui.js (#R347) */
  'Traffic included': '已纳入路况',   /* navigation-ui.js (#R347) */
  'Traffic is not included': '未纳入路况',   /* navigation-ui.js (#R347) */
  'Traffic-aware.': '已纳入路况。',   /* atlas-console.js (#R347) */
  'Turn voice guidance on': '开启语音导航',   /* navigation-ui.js (#R347) */
  'Turn-by-turn navigation': '逐向导航',   /* navigation-ui.js (#R347) */
  'Via point': '途经点',   /* navigation-ui.js navigation-voice.js (#R347) */
  'Via point: {n}': '途经点：{n}',   /* navigation-voice.js (#R347) */
  'Voice guidance': '语音导航',   /* navigation-ui.js (#R347) */
  'You have arrived': '已抵达目的地',   /* navigation-ui.js navigation-voice.js (#R347) */
  'You have arrived at {n}': '已抵达{n}',   /* navigation-voice.js (#R347) */
  'You have left the route': '你已偏离路线',   /* navigation-ui.js (#R347) */
  'No route found between these points.': '找不到连接这两点的路线。',   /* routing-errors.js (#R347) */
  'Still waiting for your location.': '仍在等待你的位置。',   /* routing-errors.js (#R347) */
  'Location permission is off. Allow it to navigate.': '定位权限已关闭，导航需要开启权限。',   /* routing-errors.js (#R347) */
  'Your device cannot fix a position here.': '这里无法测得你的位置。',   /* routing-errors.js (#R347) */
  'The routing server took too long.': '路线服务器等待超时。',   /* routing-errors.js (#R347) */
  'The routing server is rate-limiting requests.': '路线服务器正在限制请求次数。',   /* routing-errors.js (#R347) */
  'The routing server is unavailable.': '无法连接到路线服务器。',   /* routing-errors.js (#R347) */
  'This area is outside the router’s coverage.': '这个地区不在路线服务的覆盖范围内。',   /* routing-errors.js (#R347) */
  'That request cannot be routed as written.': '在这个条件下无法计算路线。',   /* routing-errors.js (#R347) */
  'Traffic data is unavailable; standard routing used.': '无法取得路况数据，改用标准路线。',   /* routing-errors.js (#R347) */
  'No public transport data for this journey.': '这段行程没有公共交通数据。',   /* routing-errors.js (#R347) */
  'You appear to be offline.': '你目前似乎处于离线状态。',   /* routing-errors.js (#R347) */
  'Could not find a new route from here.': '无法从这里计算新的路线。',   /* routing-errors.js (#R347) */
  'That request was replaced by a newer one.': '这个请求已被较新的请求取代。',   /* routing-errors.js (#R347) */
  'Routing failed for an unknown reason.': '路线计算因不明原因失败。',   /* routing-errors.js (#R347) */
  'Times come from the map’s clock ({year}), not from today — live timetables do not cover it.': '时刻依地图的时钟（{year}年），而非今天 — 实时时刻表并未涵盖该时间。',   /* routing-time.js (#R347) */
  'Times are calculated from the map’s clock ({year}), not from today.': '时刻以地图的时钟（{year}年）为基准计算，而非今天。',   /* routing-time.js (#R347) */
  'Traffic data was unavailable — this is the standard travel time.': '无法取得路况数据 — 这是标准所需时间。',   /* routing-cards.js (#R347) */
  '1 day': '1 天',   /* war-layer.js (#R409) */
  '15 days': '15 天',   /* war-layer.js (#R409) */
  '5 days': '5 天',   /* war-layer.js (#R409) */
  'casualties': '伤亡',   /* war-layer.js (#R409) */
  'Casualties and prisoners': '伤亡与俘虏',   /* war-layer.js (#R409) */
  'Commonly cited totals, both sides together.': '皆为常见引用的双方合计数字。',   /* war-layer.js (#R409) */
  'Company rule in India': '东印度公司统治下的印度',   /* war-fronts.js / history.js (#R349) */
  'Could not load the war data': '无法加载战争数据',   /* war-fronts.js / history.js (#R349) */
  'First day': '第一天',   /* war-layer.js (#R409) */
  'forces': '兵力',   /* war-layer.js (#R409) */
  'Forces engaged': '投入兵力',   /* war-layer.js (#R409) */
  'Front lines': '战线',   /* war-fronts.js / history.js (#R349) */
  'line of': '战线日期',   /* war-fronts.js / history.js (#R349) */
  'Match the time machine': '对齐时光机',   /* war-layer.js (#R409) */
  'On this day of the war': '这一天的战况',   /* war-layer.js (#R409) */
  'One day back': '后退一天',   /* war-layer.js (#R409) */
  'One day forward': '前进一天',   /* war-layer.js (#R409) */
  'Second French Empire': '法兰西第二帝国',   /* war-fronts.js / history.js (#R349) */
  'Step': '步进',   /* war-layer.js (#R409) */
  'Symbols': '符号',   /* war-layer.js (#R409) */
  'The slider moves this layer only — it never moves the time machine. Moving the time machine brings this layer with it. Front lines are shown for the dates the record gives a position for, and hold until the next one: the date beside each line is the date it is from.': '滑杆只移动这个图层——不会移动时光机。反过来，移动时光机时这个图层也会跟着走。战线只在记录给出位置的日期上绘制，并保持到下一个日期：线旁的日期就是该线的日期。',   /* war-layer.js (#R409) */
  'This layer draws the days of one war. Move its slider, or jump to the first day:': '这个图层描绘一场战争的每一天。请移动下方的滑杆，或跳到开战的第一天：',   /* war-layer.js (#R409) */
  'World War I (day by day)': '第一次世界大战（逐日）',   /* war-fronts.js war-layer.js (#R409) */
  'World War II (day by day)': '第二次世界大战（逐日）',   /* war-fronts.js war-layer.js (#R409) */
  '{n} more running today': '另有 {n} 件在同一天进行',   /* war-layer.js (#R409) */
  " ash area(s) in force": " 个火山灰区域生效中",
  " eruptions": " 次喷发",
  "{h} Holocene volcanoes": "{h} 座全新世火山",   /* (#R432) */
  "{h} Holocene volcanoes + {m} older ones an observatory watches": "{h} 座全新世火山 + {m} 座由观测机构监视的更古老火山",   /* (#R432) */
  " international SIGMETs": " 份国际 SIGMET",
  " years": " 年",
  "1 million or more within 30 km": "30 公里内 100 万人以上",
  "1,000 – 10,000": "1,000 – 10,000 人",
  "10,000 – 100,000": "10,000 – 100,000 人",
  "100,000 – 1 million": "10 万 – 100 万人",
  "Advisory / YELLOW": "注意 / YELLOW",
  "Aerodromes nearby": "周边机场",
  "Ash, gas and heat": "火山灰、气体与热异常",
  "Ashfall (2 in. or more)": "降灰（2 英吋以上）",
  "Asking the USGS earthquake catalog…": "正在查询 USGS 地震目录…",
  "Aviation colour code": "航空色码",
  "Basis for inclusion": "收录依据",
  "BCE ": "公元前 ",
  "Change": "变化",
  "Confirmed eruptions": "已确认的喷发",
  "continuing": "持续中",
  "Could not load the volcano overlays": "无法加载火山图层",
  "Dominant magma composition": "主要岩浆组成",
  "Dot size is the largest VEI on record, in every mode.": "在所有模式下，点的大小都代表已记录的最大 VEI。",
  "Draw them on the map": "在地图上绘出",
  "Earliest / latest": "最早 / 最新",
  "Earthquakes nearby": "周边地震",
  "Erupting or erupted this year": "今年喷发或正在喷发",
  "Eruption warning level": "喷发警戒等级",
  "Eruptions": "喷发纪录",
  "Eruptions at VEI 4 or above": "VEI 4 以上的喷发",
  "Events": "事件数",
  "Every recorded eruption, most recent first": "所有已记录的喷发（由新到旧）",
  "Explosivity": "爆发规模",
  "Explosivity of this volcano’s own eruptions (VEI)": "此火山自身喷发的爆发规模（VEI）",
  "Exposure": "影响范围",
  "Find aerodromes within 150 km": "搜索 150 公里内的机场",
  "Floods": "洪水",
  "Form and setting": "形貌与构造环境",
  "Geologic epoch": "地质时代",
  "Geological summary": "地质概要",
  "Grey is not “calm”. It means no volcano observatory publishes a current level for that volcano in a form a map can read — USGS covers the United States, JMA covers Japan, and the Smithsonian/USGS weekly report covers whatever was reported this week anywhere.": "灰色不代表「平静」。它表示没有任何火山观测机构以地图可读的形式公布该火山的现行等级 —— USGS 涵盖美国、JMA 涵盖日本，史密森尼／USGS 周报则涵盖本周在世界各地被通报的火山。",
  "GVP volcano number": "GVP 火山编号",
  "Issued": "发布",
  "Japan — JMA eruption warning": "日本 —— 气象厅喷发警报",
  "Japan Meteorological Agency": "日本气象厅",
  "JMA does not operate a numbered eruption warning level for this volcano; the worded warning above is what it publishes.": "此火山未实施气象厅的喷发警戒等级；上方的文字警报即为公布内容。",
  "Lahars": "火山泥流（Lahar）",
  "Landform": "地形分类",
  "Largest": "最大规模",
  "Largest recorded VEI": "已记录的最大 VEI",
  "Last eruption": "最近喷发",
  "Lava flows": "熔岩流",
  "Look for earthquakes within 50 km, last 30 days": "搜索 50 公里内、近 30 天的地震",
  "Magma composition is GVP’s dominant rock type for this volcano — the silica content behind it is what makes an eruption runny or sticky, and therefore effusive or explosive. It is a property of the volcano, not a forecast of the next eruption.": "岩浆组成是 GVP 记录的此火山主要岩石类型 —— 其背后的二氧化硅含量决定熔岩的黏稠与否，也就决定喷发偏溢流型或爆发型。这是火山的性质，不是对下次喷发的预测。",
  "Mapped hazard zones": "已公布的火山灾害范围",
  "Median interval since 1500": "1500 年以来的喷发间隔（中位数）",
  "Near-vent (multiple hazards)": "火口近旁（复合灾害）",
  "No aerodrome is mapped within 150 km.": "150 公里内没有机场。",
  "No current statement published": "无现行状态的公布信息",
  "No figure published": "无公布数值",
  "No machine-readable hazard-zone GIS is published for this volcano. Pyroclastic-flow, ashfall and lahar zones exist on paper for many volcanoes and as data for very few; this map draws only the ones that exist as data, and says so for the rest rather than drawing a modelled circle.": "此火山没有公布机器可读的灾害范围 GIS 数据。火山碎屑流、降灰与火山泥流的想定范围在许多火山有纸本地图，但以数据形式公开的极少；本地图只绘出以数据存在者，其余则明确说明没有，而不画出推估的圆圈。",
  "No observatory statement published": "无观测机构的公布信息",
  "No VEI on record": "无 VEI 纪录",
  "No volcanic-ash SIGMET is in force anywhere right now.": "目前全球没有任何生效中的火山灰 SIGMET。",
  "No volcano observatory publishes a machine-readable current level for this volcano. That is not the same as \"quiet\" — it means this map has nothing to report.": "没有任何火山观测机构以机器可读的形式公布此火山的现行等级。这不等于「平静」，而是表示本地图没有可报告的信息。",
  "No VONA has been issued for this volcano in the last year. VONA is issued by the volcano observatories of a handful of countries — the United States among them — so an absence here is not a statement about volcanoes elsewhere.": "过去一年内未曾对此火山发布 VONA。发布 VONA 的仅限美国等少数国家的观测机构，因此此处空白并不代表其他地区火山的状况。",
  "Normal / GREEN": "平常 / GREEN",
  "Older dated eruption": "更早的喷发纪录",
  "Open the GVP record": "开启 GVP 原始数据",
  "OpenStreetMap did not answer.": "OpenStreetMap 没有回应。",
  "People living around it": "周边人口",
  "People nearby": "周边人口",
  "Photograph": "照片",
  "Population counts are the Global Volcanism Program’s own figures for this volcano.": "人口数值为 GVP 针对此火山公布的数字。",
  "Primary volcano type": "火山主要类型",
  "Published volcano hazard zones (USGS)": "已公布的火山灾害范围（USGS）",
  "read from ": "读取自 ",
  "Read the notice": "阅读原文",
  "Reading the eruption record…": "正在读取喷发纪录…",
  "Reading…": "读取中…",
  "Report period": "报告期间",
  "Rows in grey are recorded by GVP as uncertain eruptions.": "灰色列为 GVP 记录的「不确定喷发」。",
  "Satellite SO₂ column (OMPS)": "卫星 SO₂ 总量（OMPS）",
  "Searching OpenStreetMap…": "正在搜索 OpenStreetMap…",
  "Show satellite SO₂ (OMPS, today)": "显示卫星 SO₂（OMPS，当日）",
  "Show satellite thermal anomalies here": "显示此处的卫星热异常",
  "Show volcanic-ash areas now in force (SIGMET)": "显示目前生效的火山灰区域（SIGMET）",
  "Smithsonian / USGS Weekly Volcanic Activity Report": "史密森尼／USGS 周间火山活动报告",
  "Subregion": "次区域",
  "Summit elevation": "山顶标高",
  "Tectonic setting": "构造环境",
  "The bundled eruption record could not be loaded.": "无法加载随附的喷发纪录。",
  "The Global Volcanism Program holds no dated eruption for this volcano. It is in the Holocene catalog on other evidence — see “The volcano”.": "GVP 未记录此火山任何有日期的喷发。它是依其他证据被收录于全新世目录中（参见「火山概貌」）。",
  "The Global Volcanism Program publishes no population figures for this volcano.": "GVP 未公布此火山的人口数值。",
  "The Global Volcanism Program records no eruption of this volcano within the Holocene. GVP holds it in the Pleistocene catalog; it is on this map because a volcano observatory publishes a current alert level for it.": "GVP 未记录此火山在全新世期间的任何喷发。GVP 将其收录于更新世目录；它出现在本地图上，是因为有火山观测机构公布其现行警戒等级。",   /* (#R432) */
  "The largest VEI this volcano has actually produced, from its own eruption record.": "此火山自身喷发纪录中的最大 VEI。",
  "The record": "纪录总览",
  "The SIGMET feed did not answer.": "SIGMET 数据来源没有回应。",
  "The USGS catalog holds no earthquake within 50 km in the last 30 days. Volcanic seismicity is often too small or too shallow for the global catalog — a local network may still be recording it.": "USGS 目录中近 30 天内 50 公里范围没有地震。火山性地震常因规模小、震源浅而未收入全球目录 —— 当地观测网可能仍有记录。",
  "The USGS earthquake catalog did not answer.": "USGS 地震目录没有回应。",
  "The USGS hazard service did not answer.": "USGS 灾害范围服务没有回应。",
  "The USGS notice feed did not answer.": "USGS 通报数据来源没有回应。",
  "The volcano": "火山概貌",
  "This volcano is not in the loaded catalog.": "此火山不在已加载的目录中。",
  "This week — Smithsonian / USGS Weekly Volcanic Activity Report": "本周 —— 史密森尼／USGS 周间火山活动报告",
  "U.S. Geological Survey · published for 7 volcanic centres in California and for no others": "U.S. Geological Survey · 仅就加州 7 个火山区公布",
  "Uncertain eruptions": "不确定的喷发",
  "Under 1,000": "1,000 人以下",
  "United States — USGS aviation colour code and alert level": "美国 —— USGS 航空色码与警戒等级",
  "Upper troposphere & stratosphere — the band an eruption plume appears in": "上对流层与平流层 —— 喷烟出现的高度带",
  "USGS national threat ranking": "USGS 全国威胁等级",
  "VEI is the Volcanic Explosivity Index — the erupted volume and plume height of one eruption on a 0–8 scale, as recorded by the Global Volcanism Program. It is the only structured measure of eruptive size the catalog carries; an eruption STYLE (Strombolian, Vulcanian, Plinian…) is not a field in that database and is therefore not shown here as if it were.": "VEI 是火山爆发指数 —— 由 GVP 记录的单次喷发喷出量与喷烟高度，以 0〜8 表示。这是目录中唯一结构化的喷发规模量度；「喷发型式」（斯通博利式、伏尔坎宁式、普林尼式等）不是该数据库的字段，因此此处不会将其当作既有数据呈现。",
  "Volcanic ash areas in force (SIGMET)": "生效中的火山灰区域（SIGMET）",
  "Volcano alert level": "火山警戒等级",
  "Volcano hazard zones (USGS)": "火山灾害范围（USGS）",
  "Volcanoes — the Smithsonian GVP catalog": "火山 —— 史密森尼 GVP 目录",   /* (#R432) */
  "VONA — Volcano Observatory Notice for Aviation": "VONA —— 航空用火山信息",
  "Warning / RED": "警报 / RED",
  "Warning unit": "警报对象火山",
  "Watch / ORANGE": "警戒 / ORANGE",
  "Watched, at its baseline": "常时观测・平常水准",
  "Within 10 km": "半径 10 公里内",
  "Within 100 km": "半径 100 公里内",
  "Within 30 km": "半径 30 公里内",
  "Within 5 km": "半径 5 公里内",
  "Zones published": "已公布的范围",   /* war-fronts.js / history.js (#R349) */
  "Secondary headquarters": "第二总部",
  "Regional headquarters": "区域总部",
  "Office": "办事处",
  "Branch": "分公司",
  "Subsidiary office": "子公司办事处",
  "Sales office": "销售办事处",
  "Factory": "工厂",
  "Assembly plant": "组装厂",
  "Refinery": "炼油厂",
  "Smelter": "冶炼厂",
  "Shipyard": "造船厂",
  "Brewery": "酿酒厂",
  "Mine": "矿场",
  "Power plant": "发电厂",
  "Research site": "研究据点",
  "R&D center": "研发中心",
  "Technical center": "技术中心",
  "Laboratory": "实验室",
  "Test facility": "试验设施",
  "Design center": "设计中心",
  "Logistics site": "物流据点",
  "Distribution center": "配送中心",
  "Warehouse": "仓库",
  "Port terminal": "港口码头",
  "Store": "门市",
  "Museum": "博物馆",
  "Training center": "训练中心",
  "Other site": "其他据点",
  "Offices": "办事处",
  "Plants": "工厂",
  "R&D": "研发",
  "Logistics": "物流",
  "Manufacturing": "制造",
  "Corporate": "集团管理",
  "In operation": "营运中",
  "Announced": "已宣布",
  "Under construction": "兴建中",
  "Located to the city only": "仅定位到城市",
  "Located to the region only": "仅定位到州省",
  "Overview": "概览",
  "Business": "业务",
  "Locations": "据点",
  "Legal name": "法定名称",
  "Leadership": "经营团队",
  "Operating income": "营业利益",
  "Total assets": "资产总额",
  "Listed on": "上市市场",
  "Legal form": "法人型态",
  "Listing and identifiers": "上市与识别码",
  "Nothing about this company is published yet.": "目前尚未公开这家公司的任何信息。",
  "Main activities": "主要业务",
  "Products": "产品",
  "Services": "服务",
  "Brands": "品牌",
  "Parent company": "母公司",
  "Subsidiaries": "主要子公司",
  "Affiliates": "主要关联企业",
  "Organization": "集团结构",
  "No business detail is published for this company.": "尚未公开这家公司的业务内容。",
  "No facilities are published for this company.": "尚未公开这家公司的据点。",
  "No facilities match this filter.": "没有符合此筛选条件的据点。",
  "No coordinates published": "未公开坐标",
  "Countries with facilities": "设有据点的国家",
  "Retail network": "门市据点",
  "The company atlas is not available yet.": "企业地图集尚无法使用。",
  "This company profile could not be loaded.": "无法加载这家公司的简介。",
  "This point is the city’s representative location, not the site itself — the source names only the city.": "此坐标为该城市的代表位置，而非设施本身——来源仅指出城市。",
  "The source names only the state or province, so this point is that region’s representative location.": "来源仅指出州或省，因此此坐标为该地区的代表位置。",
  "Role": "职能",
  "Research": "研究领域",
  "Profile and locations": "简介与据点",
  "Profile unavailable": "无法取得简介",
  "Market data": "市场数据",
  "Financial figures": "财务数据",
  "Closed permanently": "永久关闭",
  "Site location": "所在地",
  "Closed in": "关闭",
  "{n} cables here": "此处有 {n} 条",
  "Cables landing here": "在此登陆的电缆",
  "Data last checked": "数据最后确认日",
  "Estimated": "推估",
  "Landing point": "登陆点",
  "Landing points": "登陆点",
  "Owners": "所有者",
  "Planned": "规划中",
  "Ready for service": "启用时间",
  "Reconstructed": "重建",
  "Route quality": "路径精度",
  "Route source": "路径来源",
  "Submarine cable": "海底电缆",
  "Supplier": "敷设商",
  "Unknown": "不明",
  "Verified": "实测",
  "Surveyed sections": "实测区间的来源",
  "Model": "模式",
  "switching to": "正在切换至",
  "could not be reached": "无法取得",
  "no data for this layer": "此图层没有数据",
  "level not published": "未提供此气压面",
  "outside this model’s area": "超出此模式的范围",
  "not answering": "没有回应",
  "Precipitation (forecast)": "降水量（预报）",
  "Wind 10 m arrows": "风 10 米风向箭头",
  "Wind gusts": "最大阵风",
  "Cloud cover": "云量",
  "Dew point / humidity": "露点／湿度",
  "Isobars": "等压线",
  "Sea-level pressure": "海平面气压",
  "CAPE instability": "CAPE 不稳定度",
  "no such weather layer": "没有这个气象图层",   /* ai-core.js (#R318) aiTurnCallsMsg */
  "Aircraft type": "机型",
  "Announcement": "发布内容",
  "Clean air": "空气洁净",
  "Days elapsed": "已过天数",
  "Economy fee": "经济费率",
  "Elevation angle": "仰角",
  "Emergency room": "急诊",
  "Highest altitude": "最高高度",
  "map points": "个地图点",
  "Max": "最高",
  "Max elevation": "最大仰角",
  "Metric": "指标",
  "Min": "最低",
  "Neighbours": "邻国",
  "Place it": "放置",
  "Runway use": "跑道用途",
  "Sample points": "个采样点",
  "Sample spacing": "采样间隔",
  "Selected day": "所选日期",
  "Shape": "图形",
  "Signal source": "信号来源",
  "Time window": "时间范围",
  "total eclipse": "全食",
  "Turn all off": "全部关闭",
  "watchlist": "关注列表",
  "Wind power": "风力",
  "Q{q} {y}": "{y}年第{q}季",
  "Routes are approximate: a few stretches are published survey positions, most are reconstructed from sea-floor terrain. A line is not the exact position of the cable. Click one for the accuracy of that stretch.": "路线为近似值：仅少数区间是公开的实测位置，多数是依海底地形重建而成。线条并非缆线的确切位置。点击可查看该区间的精度。",

  /* ══ (#R388) WORLD RAILWAYS — OpenStreetMap’s own tag on each track ════════════════════════════════
     js/railways.js · js/layer-packs.js · js/compare.js · js/atlas-console.js. The seven rows the
     Natural-Earth layer needed («World railways (by gauge)», «Broad 1676 mm (India, Argentina)»,
     «Cape 1067 mm (Japan etc.)», «Meter 1000 mm», «Unknown / other», «Railways (by gauge)» and its
     «predominant gauge» note) are DELETED above: those English source strings no longer exist, and
     a row nothing can key into is a row nobody re-reads.
     ⚠ Grey is «OSM does not state it», never «unknown» and never «other» — the whole layer turns on
     that distinction, so every language spells the absence out rather than rounding it off. */
  /* the layer row, the compare-map row and the Atlas refusal */
  "World railways": "世界铁路",
  "no such railway view": "没有这种铁路着色方式",
  /* the seven colour axes (js/railways.js AXIS_LABEL) */
  "Gauge": "轨距",
  "Electrification": "电气化",
  "Line speed": "最高速度",
  "Tracks": "轨道数",
  "Traffic": "客货运",
  "Line type": "铁路类型",
  "Not stated in OSM": "OSM 未注明",
  /* gauge buckets */
  "Indian 1676 mm": "印度轨距 1676 mm",
  "Other broad gauge": "其他宽轨",
  "Cape 1067 mm": "开普轨距 1067 mm",
  "Metre 1000 mm": "米轨 1000 mm",
  "750–999 mm": "750～999 mm",
  "600–749 mm": "600～749 mm",
  "Under 600 mm": "低于 600 mm",
  "dual gauge": "双轨距",
  /* electrification buckets */
  "25 kV AC": "交流 25 kV",
  "15 kV AC": "交流 15 kV",
  "Other AC": "其他交流",
  "3 kV DC": "直流 3 kV",
  "1.5 kV DC": "直流 1.5 kV",
  "Other DC": "其他直流",
  "Electrified, system not stated": "已电气化（系统未注明）",
  "Not electrified": "未电气化",
  /* line-speed buckets */
  "300 km/h and above": "300 km/h 以上",
  "250–299 km/h": "250～299 km/h",
  "200–249 km/h": "200～249 km/h",
  "160–199 km/h": "160～199 km/h",
  "120–159 km/h": "120～159 km/h",
  "80–119 km/h": "80～119 km/h",
  "40–79 km/h": "40～79 km/h",
  "Under 40 km/h": "低于 40 km/h",
  /* track-count and traffic buckets */
  "Single track": "单线",
  "Double track": "双线",
  "Triple track": "三线",
  "Four or more tracks": "四线以上",
  "Passenger only": "仅客运",
  "Freight only": "仅货运",
  "Passenger and freight": "客货兼营",
  /* line-type buckets (railway=*) and the usage words under the card title */
  "Heavy rail": "一般铁路",
  "Narrow gauge": "窄轨铁路",
  "Light rail": "轻轨",
  "Metro / subway": "地铁",
  "Main line": "干线",
  "Branch line": "支线",
  "Industrial line": "专用线",
  "Heritage / tourist line": "旅游铁路",
  "Military line": "军用线",
  "Test track": "试验线",
  /* the detail card and the station card */
  "High-speed line": "高速铁路",
  "Line number": "路线编号",
  "OSM way": "OSM 路径",
  "Halt": "招呼站",
  "Modes": "交通方式",
  "Network": "路网",
  "Station code": "车站代码",
  "UIC reference": "UIC 代码",
  "Train": "火车",
  /* the two provenance notes — the whole point of the layer */
  "Every field above is a tag on this track in OpenStreetMap. A field OSM does not carry is left out rather than guessed — the layer never fills a gauge in from the country the line happens to run through.": "以上每个字段都是 OpenStreetMap 标在这段轨道上的标签。OSM 没有的字段一律省略，不做推测——本图层不会用路线经过的国家去补轨距。",
  "Every value is the tag OpenStreetMap carries on that track. Grey means OSM does not state it — nothing is filled in from the country the line runs through. Zoom past z6.5 for full detail, z8 for stations.": "每个数值都是 OpenStreetMap 标在该段轨道上的标签。灰色代表 OSM 未注明——不会依照路线经过的国家补上。放大到 z6.5 以上显示完整细节，z8 以上显示车站。",

  /* the two switches under the axis buttons (js/layer-packs.js railLegend) */
  "Urban rail (metro, tram, light rail)": "城市轨道（地铁、路面电车、轻轨）",
  "Stations and halts (from z8)": "车站与招呼站（z8 以上）",

  /* ⚠ (#R370) SPLIT OFF BY THE KEY-COLLISION GATE, so each must differ from its old neighbour:
     «In operation» stays js/company-data.js (a plant that is running) and «Opened» stays
     js/company-facilities.js (a site opening). A line that runs and a factory that runs are
     one English word and two Japanese ones, which is what the gate measures. */
  "Line in operation": "已通车",
  "Year opened": "启用年份",
  "ADVISORY": "注意",
  "Aeolian Volcanic Arc": "埃奥利亚火山弧",
  "Afar Rift Volcanic Province": "阿法尔裂谷火山省",
  "Alaska Peninsula Volcanic Arc": "阿拉斯加半岛火山弧",
  "Alaska Volcano Observatory": "阿拉斯加火山观测站",
  "Albertine Rift Volcanic Province": "艾伯丁裂谷火山省",
  "Aleutian Ridge Volcanic Arc": "阿留申海岭火山弧",
  "Amsterdam-St. Paul Hotspot Volcano Group": "阿姆斯特丹—圣保罗热点火山群",
  "Andaman Volcanic Province": "安达曼火山省",
  "Andesite / Basaltic Andesite": "安山岩 / 玄武质安山岩",
  "Antarctic Peninsula Volcanic Province": "南极半岛火山省",
  "Antarctic-Scotia Volcanic Regions": "南极—斯科舍火山区",
  "Arabia-Central Asia Volcanic Regions": "阿拉伯—中亚火山区",
  "Arctic Ridge Volcanic Province": "北极海岭火山省",
  "Atlantic Ocean Volcanic Regions": "大西洋火山区",
  "Austral Andean Volcanic Arc": "安第斯最南部火山弧",
  "Austral-Cook Hotspot Volcano Group": "南方群岛—库克群岛热点火山群",
  "Azores-Terceira Rift Volcanic Province": "亚速尔—特塞拉裂谷火山省",
  "Baikal Rift Volcanic Province": "贝加尔裂谷火山省",
  "Balleny Hotspot Volcano Group": "巴列尼热点火山群",
  "Basalt / Picro-Basalt": "玄武岩 / 苦橄玄武岩",
  "Basin and Range Volcanic Province": "盆岭火山省",
  "Bismarck Sea Volcanic Province": "俾斯麦海火山省",
  "Bismarck Volcanic Arc": "俾斯麦火山弧",
  "Bougainville Volcanic Arc": "布干维尔火山弧",
  "Caldera": "破火山口",
  "Caldera(s)": "破火山口群",
  "California Coast Ranges Volcano Group": "加利福尼亚海岸山脉火山群",
  "California Volcano Observatory": "加州火山观测站",
  "Canary Volcanic Province": "加那利火山省",
  "Cape Verde Hotspot Volcano Group": "佛得角热点火山群",
  "Cascades Volcano Observatory": "喀斯开火山观测站",
  "Caucasus Volcanic Province": "高加索火山省",
  "Central America Volcanic Arc": "中美洲火山弧",
  "Central Anatolian Volcanic Province": "中安纳托利亚火山省",
  "Central Andean Volcanic Arc": "中安第斯火山弧",
  "Central East Asia Volcanic Province": "东亚中部火山省",
  "Central European Volcanic Province": "中欧火山省",
  "Central Kamchatka Volcanic Arc": "中堪察加火山弧",
  "Central Mid-Atlantic Rift Volcanic Province": "大西洋中央裂谷中部火山省",
  "Chem/Bio: Hydration Rind": "化学/生物：水合层",
  "Chem/Bio: Lichenometry": "化学/生物：地衣测定法",
  "Chiapanecan Volcanic Arc": "恰帕斯火山弧",
  "Cluster": "火山群",
  "Complex": "复合火山",
  "Composite": "复成火山",
  "Compound": "复式火山",
  "Cone": "火山锥",
  "Continuing Eruptive Activity": "延续的喷发活动",
  "Continuing Unrest": "延续的火山活动异常",
  "Correlation: Anthropology": "对比：人类学",
  "Correlation: Magnetism": "对比：地磁",
  "Correlation: Tephrochronology": "对比：火山灰年代学",
  "Crater rows": "火口列",
  "Crozet Hotspot Volcano Group": "克罗泽热点火山群",
  "Dacite": "英安岩",
  "East Central Sahara Volcanic Province": "撒哈拉中东部火山省",
  "Eastern Africa Volcanic Regions": "东非火山区",
  "Eastern Asia Volcanic Regions": "东亚火山区",
  "Eastern Australia Volcanic Regions": "东澳洲火山区",
  "Eastern Kamchatka Volcanic Arc": "东堪察加火山弧",
  "Eastern Pacific Volcanic Regions": "东太平洋火山区",
  "Eastern Philippine Volcanic Arc": "东菲律宾火山弧",
  "Eruption Dated": "喷发已定年",
  "Eruption Observed": "喷发经观测",
  "European Volcanic Regions": "欧洲火山区",
  "Evidence Credible": "证据可信",
  "Evidence Uncertain": "证据不确定",
  "Explosion crater(s)": "爆裂火口群",
  "Fiji Volcanic Arc": "斐济火山弧",
  "Fissure vent": "裂隙喷口",
  "Fissure vent(s)": "裂隙喷口群",
  "Foidite": "似长石岩",
  "GREEN": "绿",
  "Galapagos Hotspot Volcano Group": "加拉帕戈斯热点火山群",
  "Galapagos Rift Volcanic Province": "加拉帕戈斯裂谷火山省",
  "Garibaldi Volcanic Arc": "加里波第火山弧",
  "Gulf of California Rift Volcanic Province": "加利福尼亚湾裂谷火山省",
  "Halmahera Volcanic Arc": "哈马黑拉火山弧",
  "Hawaiian Volcano Observatory": "夏威夷火山观测站",
  "Hawaiian-Emperor Hotspot Volcano Group": "夏威夷—天皇热点火山群",
  "Hellenic Volcanic Arc": "希腊火山弧",
  "High Cascades Volcanic Arc": "高喀斯喀特火山弧",
  "High Lava Plains Volcanic Province": "高熔岩平原火山省",
  "High Threat": "威胁高",
  "Holocene": "全新世",
  "Iceland Neovolcanic Rift Volcanic Province": "冰岛新火山裂谷火山省",
  "Inner Banda Volcanic Arc": "内班达火山弧",
  "Interior Western Canada Volcanic Province": "加拿大西部内陆火山省",
  "Intraplate / Continental crust (> 25 km)": "板块内部 / 大陆地壳（> 25 km）",
  "Intraplate / Intermediate crust (15-25 km)": "板块内部 / 中间地壳（15-25 km）",
  "Intraplate / Oceanic crust (< 15 km)": "板块内部 / 海洋地壳（< 15 km）",
  "Isotopic: 14C (calibrated)": "同位素：14C（已校正）",
  "Isotopic: 14C (uncalibrated)": "同位素：14C（未校正）",
  "Isotopic: Ar/Ar": "同位素：Ar/Ar",
  "Isotopic: Cosmic Ray Exposure": "同位素：宇宙射线曝露",
  "Isotopic: K/Ar": "同位素：K/Ar",
  "Isotopic: Po-Pb": "同位素：Po-Pb",
  "Isotopic: Uranium-series": "同位素：铀系",
  "Italian Peninsula Volcanic Provinces": "意大利半岛火山省",
  "Izu Volcanic Arc": "伊豆火山弧",
  "Kenyan Rift Volcanic Province": "肯尼亚裂谷火山省",
  "Kerguelen Hotspot Volcano Group": "凯尔盖朗热点火山群",
  "Kuril Volcanic Arc": "千岛火山弧",
  "Lava cone": "熔岩锥",
  "Lava cone(es)": "熔岩锥群",
  "Lava dome": "熔岩穹丘",
  "Lava dome(s)": "熔岩穹丘群",
  "Lesser Antilles Volcanic Arc": "小安的列斯火山弧",
  "Low Threat": "威胁低",
  "Luzon Volcanic Arc": "吕宋火山弧",
  "Maar": "低平火山口",
  "Maar(s)": "低平火山口群",
  "Madagascar-Comoros Volcanic Province": "马达加斯加—科摩罗火山省",
  "Madeira Hotspot Volcano Group": "马德拉热点火山群",
  "Main Ethiopian Rift Volcanic Province": "埃塞俄比亚主裂谷火山省",
  "Mariana Volcanic Arc": "马里亚纳火山弧",
  "Marion Hotspot Volcano Group": "马里恩热点火山群",
  "Mathematicians Ridge Volcanic Province": "数学家海岭火山省",
  "McMurdo Volcanic Province": "麦克默多火山省",
  "Middle America-Caribbean Volcanic Regions": "中美洲—加勒比火山区",
  "Middle Kermadec Volcanic Arc": "克马德克中部火山弧",
  "Mindanao Volcanic Province": "棉兰老火山省",
  "Minor": "小型火山",
  "Minor (Basaltic)": "小型火山（玄武岩质）",
  "Minor (Silicic)": "小型火山（硅质）",
  "Moderate Threat": "威胁中等",
  "NORMAL": "正常",
  "Nankai Volcanic Arc": "南海火山弧",
  "Negros-Sulu Volcanic Arc": "内格罗斯—苏禄火山弧",
  "New Activity/Unrest": "新增活动/火山活动异常",
  "New Eruptive Activity": "新增喷发活动",
  "New Unrest": "新增火山活动异常",
  "North America Volcanic Regions": "北美洲火山区",
  "Northeast Japan Volcanic Arc": "日本东北火山弧",
  "Northeast Lau Basin Volcano Group": "劳海盆东北部火山群",
  "Northeast Pacific Rifts Volcanic Province": "东北太平洋裂谷火山省",
  "Northeastern Australia Volcanic Province": "澳洲东北部火山省",
  "Northern Africa Volcanic Regions": "北非火山区",
  "Northern Alaska-Bering Sea Volcanic Province": "阿拉斯加北部—白令海火山省",
  "Northern Andean Volcanic Arc": "北安第斯火山弧",
  "Northern Arabia Volcanic Province": "阿拉伯北部火山省",
  "Northern Cordilleran Volcanic Province": "北科迪勒拉火山省",
  "Northern East Pacific Rise Volcanic Province": "东太平洋海隆北部火山省",
  "Northern Galapagos Volcanic Province": "加拉帕戈斯北部火山省",
  "Northern Kermadec Volcanic Arc": "克马德克北部火山弧",
  "Northern Mariana Islands": "北马里亚纳群岛",
  "Northern Tibetan Plateau Volcanic Province": "青藏高原北部火山省",
  "Northwestern Pacific Volcanic Regions": "西北太平洋火山区",
  "ORANGE": "橙",
  "Observations: Aviation": "观测：航空",
  "Observations: Hydrophonic": "观测：水下听音器",
  "Observations: Photo / Video": "观测：照片 / 视频",
  "Observations: Reported": "观测：据报告",
  "Observations: Satellite (infrared)": "观测：卫星（红外线）",
  "Observations: Satellite (visual)": "观测：卫星（可见光）",
  "Observations: Seismicity": "观测：地震活动",
  "Ogasawara Volcanic Arc": "小笠原火山弧",
  "Ongoing Activity": "持续中的活动",
  "Ongoing Unrest": "持续中的火山活动异常",
  "Pacific-Antarctic Ridge Volcanic Province": "太平洋—南极海岭火山省",
  "Phono-tephrite /  Tephri-phonolite": "响碱玄岩 / 碱玄响岩",
  "Phonolite": "响岩",
  "Pitcairn Hotspot Volcano Group": "皮特凯恩热点火山群",
  "Pleistocene": "更新世",   /* (#R432) */
  "Pyroclastic cone": "火山碎屑锥",
  "Pyroclastic cone(s)": "火山碎屑锥群",
  "Queen Charlotte Volcano Group": "夏洛特女王火山群",
  "RED": "红",
  "Radiogenic: Fission track": "放射成因：裂变径迹",
  "Radiogenic: Thermoluminescence": "放射成因：热释光",
  "Red Sea Rift Volcanic Province": "红海裂谷火山省",
  "Reunion Hotspot Volcano Group": "留尼旺热点火山群",
  "Rhyolite": "流纹岩",
  "Rift zone / Continental crust (> 25 km)": "裂谷带 / 大陆地壳（> 25 km）",
  "Rift zone / Intermediate crust (15-25 km)": "裂谷带 / 中间地壳（15-25 km）",
  "Rift zone / Oceanic crust (< 15 km)": "裂谷带 / 海洋地壳（< 15 km）",
  "Rukwa Rift Volcanic Province": "鲁克瓦裂谷火山省",
  "Ryukyu Volcanic Arc": "琉球火山弧",
  "Salas y Gómez Ridge Volcano Group": "萨拉斯—戈梅斯海岭火山群",
  "Samoan Hotspot Volcano Group": "萨摩亚热点火山群",
  "Sangihe Volcanic Arc": "桑义赫火山弧",
  "Shield": "盾状火山",
  "Shield(pyroclastic)": "盾状火山（火山碎屑质）",
  "Shield(s)": "盾状火山群",
  "Sicily Volcanic Province": "西西里火山省",
  "Sidereal: Dendrochronology": "历年：树轮年代学",
  "Sidereal: Ice Core": "历年：冰芯",
  "Sidereal: Varve Count": "历年：纹泥计数",
  "Society Islands Hotspot Volcano Group": "社会群岛热点火山群",
  "Solomon Volcanic Province": "所罗门群岛火山省",
  "Somalian-Antarctic Volcanic Regions": "索马里—南极火山区",
  "South America Volcanic Regions": "南美洲火山区",
  "South Sandwich Volcanic Arc": "南桑威奇火山弧",
  "South Shetlands Volcanic Arc": "南设得兰火山弧",
  "Southeast Asia Volcanic Province": "东南亚火山省",
  "Southeast Sahara Volcanic Province": "撒哈拉东南部火山省",
  "Southeastern Australia Volcanic Province": "澳洲东南部火山省",
  "Southern Andean Volcanic Arc": "南安第斯火山弧",
  "Southern Atlantic Volcano Group": "南大西洋火山群",
  "Southern East Pacific Rise Volcanic Province": "东太平洋海隆南部火山省",
  "Southern Kermadec Volcanic Arc": "克马德克南部火山弧",
  "Southern Pacific Volcanic Regions": "南太平洋火山区",
  "Southwest Arabia Volcanic Province": "阿拉伯西南部火山省",
  "Southwestern Pacific Volcanic Regions": "西南太平洋火山区",
  "Stratovolcano": "层状火山",
  "Stratovolcano(es)": "层状火山群",
  "Stratovolcano?": "层状火山（推测）",
  "Subduction zone / Continental crust (> 25 km)": "俯冲带 / 大陆地壳（> 25 km）",
  "Subduction zone / Crustal thickness unknown": "俯冲带 / 地壳厚度不明",
  "Subduction zone / Intermediate crust (15-25 km)": "俯冲带 / 中间地壳（15-25 km）",
  "Subduction zone / Oceanic crust (< 15 km)": "俯冲带 / 海洋地壳（< 15 km）",
  "Sunda Volcanic Arc": "巽他火山弧",
  "Sunda-Banda Volcanic Regions": "巽他—班达火山区",
  "Taupo Volcanic Arc": "陶波火山弧",
  "Tofua Volcanic Arc": "托富阿火山弧",
  "Tonga-Kermadec Volcanic Regions": "汤加—克马德克火山区",
  "Trachyandesite / Basaltic Trachyandesite": "粗面安山岩 / 玄武质粗面安山岩",
  "Trachybasalt / Tephrite Basanite": "粗面玄武岩 / 碱玄岩-碧玄岩",
  "Trachyte / Trachydacite": "粗面岩 / 粗面英安岩",
  "Trans-Mexican Volcanic Arc": "横贯墨西哥火山弧",
  "Trobriand Volcanic Province": "特罗布里恩火山省",
  "Tuff cone": "凝灰岩锥",
  "Tuff cone(s)": "凝灰岩锥群",
  "Tuff ring(s)": "凝灰岩环群",
  "UNASSIGNED": "未指定",
  "Uncertain": "不确定",
  "Undersea Features": "海底地形",
  "Unrest / Holocene": "火山活动异常 / 全新世",
  "Vanuatu Volcanic Arc": "瓦努阿图火山弧",
  "Very High Threat": "威胁极高",
  "Very Low Threat": "威胁极低",
  "Volcanic field": "火山区",
  "WARNING": "警报",
  "WATCH": "戒备",
  "West Central Sahara Volcanic Province": "撒哈拉中西部火山省",
  "Western Africa Volcanic Province": "西非火山省",
  "Western Anatolian Volcanic Province": "西安纳托利亚火山省",
  "Western Antarctica Volcanic Province": "西南极洲火山省",
  "Western Arabia Volcanic Province": "阿拉伯西部火山省",
  "Western European Volcanic Province": "西欧火山省",
  "Western North Island Volcanic Province": "北岛西部火山省",
  "Western Pacific Volcanic Regions": "西太平洋火山区",
  "Wrangell Volcanic Arc": "兰格尔火山弧",
  "YELLOW": "黄",
  "Yellowstone Volcano Observatory": "黄石火山观测站",
  "Yellowstone-Snake River Hotspot Volcano Group": "黄石—蛇河热点火山群",
  "administered by": "管理国",
  "claimed by": "主权主张国",
  "レベル２（火口周辺規制）": "第2级（请勿接近火山口）",
  "レベル３（入山規制）": "第3级（请勿接近火山）",
  "入山危険": "请勿进入火山",
  "周辺海域警戒": "周边海域警戒",
  "引上げ": "调升",
  "引下げ": "调降",
  "火口周辺危険": "火山口周边危险",
  "継続": "维持",
  "Above normal": "高于平常",
  "Erupting in the map’s year": "在地图年份喷发",
  "GVP records {n} volcano(es) as erupting in {y}. The clock reaches back to 1850; the card shows every eruption in the record.": "GVP 记录中，{y} 年正在喷发的火山有 {n} 座。时钟可回溯至 1850 年；卡片会显示纪录中的所有喷发。",
  "Has produced VEI 4+": "曾达 VEI 4 以上",
  "Largest recorded VEI: {v}, from {n} eruptions on record": "已记录的最大 VEI：{v}（共 {n} 次喷发纪录）",
  "Last eruption: {y}": "最近喷发：{y}",
  "Name a volcano.": "请指定火山名称。",
  "No observatory publishes a current level for it.": "没有任何观测机构公布此火山的现行等级。",
  "No volcano called “{q}” is in the Smithsonian GVP catalog this map carries.": "本地图所收录的史密森尼 GVP 目录中没有名为「{q}」的火山。",   /* (#R432) */
  "Published in English by the source and shown exactly as written. Descriptions written by an observatory are not machine-translated here; the classifications above are translated because they come from a fixed vocabulary.": "由来源以英文发布，并照原文呈现。观测机构撰写的叙述在此不做机器翻译；上方的分类用语则有翻译，因为它们出自固定的词汇表。",
  "Published in Japanese by the agency and shown exactly as issued — this map does not reword a warning.": "由气象厅以日文发布，并照原文呈现 —— 本地图不会改写警报的用语。",
  "Say which volcano view: a colour mode, a filter, or the map’s year.": "请指定火山图层要变更的项目：色彩模式、筛选条件，或地图年份。",
  "Somebody publishes a level": "有公布的状态",
  "This is a published statement, not silence: USGS monitors this volcano and its current level is the one above. The date is when that level was last issued — it stands until USGS changes it.": "这是已公布的声明，而不是沉默：USGS 监测此火山，其现行等级即为上方所示。日期是该等级最后一次发布的时间 —— 在 USGS 变更之前一直有效。",
  "map year": "地图年份",
  "{n} volcanoes shown": "显示 {n} 座",
  /* (#R416) News UI — js/news-ui.js (the mobile pin sheet) and js/news-events.js
     (the category chips). ⚠ "All topics" is the CATEGORY axis: the scope chip sitting
     beside it on the same row is "All" = 「全部」, so this one must NOT be that word.
     One row, two controls, one word would read as one control. */
  "All topics": "所有分类",
  "Open event": "开启事件",
  /* (#R455) ニュースカードのボタン（押すと出来事の详细が同じ面に开く）— js/news-events.js。
     「1 source」「{n} sources」はこの表の上のほうに既にあり、ここはそれを括弧に入れたボタン文言。 */
  "Details (1 source)": "详情（1 家媒体）",   /* news-events.js (#R455) */
  "Details ({n} sources)": "详情（{n} 家媒体）",   /* news-events.js (#R455) */
  "Seven seas (open ocean)": "七海（外海）",
  "Eurasia": "欧亚大陆",
  "Middle East": "中东",
  "South Asia": "南亚",
  "Southeast Asia": "东南亚",
  "East Asia": "东亚",
  "API key": "API 密钥",
  "Base map and projection": "底图与投影",
  "Close popup": "关闭弹出窗口",
  "email": "电子邮件",
  "file: ": "文件: ",
  "remove": "移除",
  "Password": "密码",
  "Create account": "建立账号",
  "Log In": "登录",
  "Password (min. 8 chars, incl. a number)": "密码（至少 8 个字元，须含数字）",
  " Holocene volcanoes": " 座全新世火山",
  "Default": "默认",
  "Clean": "清爽",
  "{n} more": "其他 {n} 项",
  }
});
