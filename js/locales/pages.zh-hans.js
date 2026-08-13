/* ============================================================================
 *  IntMap · READING PAGES — zh-Hans   ⚠ GENERATED FILE — DO NOT EDIT BY HAND
 * ----------------------------------------------------------------------------
 *  「簡体を追加して。(beta)」 (#R224)
 *
 *  Produced from js/locales/pages.zh-hant.js by scripts/zh-hans.mjs: the Taiwan→mainland WORD table first
 *  (網路→网络, 資訊→信息, 螢幕→屏幕, 檔案→文件, 預設→默认, 選單→菜单, 使用者→用户 …), then the
 *  Traditional→Simplified character map. Fix a string in pages.zh-hant.js and re-run the script; editing
 *  this file directly is undone by the next run, and tests/r224-checks.test.mjs fails if the two
 *  ever disagree.
 *
 *      node scripts/zh-hans.mjs
 * ==========================================================================*/
window.IntMapPageI18N.define('zh-hans', {

  common: {
    backToMap: '回到地图',
    contents: '目录',
    toScience: '科学与运算逻辑',
    toSources: '数据来源'
  },

  sources: {
    title: '数据来源',
    meta: 'IntMap 呈现的每一项数据出自哪个机构、用在哪里、如何取得、授权为何，以及这对你的隐私代表什么。',
    sub: 'IntMap 显示的每一个数字、每一条线、每一张影像，以及<b>它们从何而来</b>。由这些数据计算出来的东西则在<a href="./science.html">科学与运算逻辑</a>页。',
    sections: [
      { id: 'what', nav: '关于本页', h: '关于本页' },
      { id: 'live', nav: '数据的新鮮度', h: '这些数字有多新' },
      { id: 'privacy', nav: '开启图层会送出什么', h: '开启一个图层时会发生什么事' },
      { id: 'licence', nav: '制作者与使用条款', h: '这些数据由谁制作，以及使用条款' },
      { id: 'limits', nav: '数据没有告诉你的事', h: '数据没有告诉你的事' },
      { id: 'list', nav: '依主题排列的列表', h: '依主题排列的列表' }
    ]
  },

  science: {
    title: '科学与运算逻辑',
    meta: 'IntMap 的每一项功能与模拟使用哪些数据、依据哪些方程序、在哪些假设之下运作。',
    sub: 'IntMap 画出来的每一条线与每一个数字，都是由<b>公开数据</b>经由这里写明的方程序算出来的。数据本身的出处在<a href="./sources.html">数据来源</a>页。',
    sections: [
      { id: 'principles', nav: '基本原则', h: '基本原则' },
      { id: 'elevation', nav: '高程数据', h: '高程数据 — 所有地形运算的基礎' },
      { id: 'water', nav: '地形与水流', h: '地形塑形与水流路径' },
      { id: 'seismic', nav: '地震震动', h: '地震震动' },
      { id: 'tsunami', nav: '海啸', h: '海啸' },
      { id: 'sealevel', nav: '海平面与淹没', h: '海平面与淹没范围' },
      { id: 'tides', nav: '潮汐', h: '潮汐' },
      { id: 'currents', nav: '洋流', h: '洋流' },
      { id: 'atmosphere', nav: '大气与天空', h: '大气与天空的颜色' },
      { id: 'sun', nav: '太阳、阴影、视域', h: '太阳、阴影与视域分析' },
      { id: 'sats', nav: '人造卫星', h: '人造卫星' },
      { id: 'space', nav: '太空与天体', h: '太空与天体' },
      { id: 'flight', nav: '飞行模型', h: '飞行模型' },
      { id: 'routing', nav: '路径与可达性', h: '路径规划与可达范围' },
      { id: 'trade', nav: '贸易流向', h: '贸易流向' },
      { id: 'energy', nav: '能源结构', h: '能源结构' },
      { id: 'crops', nav: '作物', h: '作物' },
      { id: 'alerts', nav: '警报', h: '气象与灾害警报' },
      { id: 'news', nav: '新闻定位', h: '新闻定位' },
      { id: 'time', nav: '时钟与时光机', h: '时钟与时光机' },
      { id: 'labels', nav: '标籤大小', h: '标籤大小' },
      { id: 'ai', nav: 'AI 不得决定的事', h: 'AI 不被允许决定的事' }
    ]
  }
});
