/* ============================================================================
 *  IntMap · THE READING PAGES — 繁體中文   (#R231)
 * ----------------------------------------------------------------------------
 *  「まだ簡体・繁体中文に不十分な箇所があるから詰めて。」
 *
 *  ══ WHY THIS FILE DID NOT EXIST UNTIL NOW ══════════════════════════════════════════════════════
 *  js/page-i18n.js carried a five-row language list of its OWN, separate from js/lang-registry.js —
 *  so #R223's 繁體中文 and #R224's 简体中文 were added to the app and never reached sources.html or
 *  science.html. A reader with the whole app in Chinese opened Data sources and got English, and the
 *  page's language picker did not even offer them their language. #R231 made that file read the
 *  registry, which is what makes this file loadable at all.
 *
 *  ══ WHAT IS HERE, AND WHAT FALLS BACK ══════════════════════════════════════════════════════════
 *  The page CHROME and the STRUCTURE: both page titles, their standfirsts, the shared navigation
 *  words, and the heading + contents-entry of all 28 sections. The body prose of each section is not
 *  translated yet and renders in English, per section, underneath its Chinese heading.
 *
 *  ⚠ THAT IS A SUPPORTED STATE, NOT A HALF-BUILT ONE — and it is supported because #R231 made it so.
 *  Before this round js/page-i18n.js's `sectionsOf` replaced an English section WHOLESALE with its
 *  translated twin, so a section given a heading and no `blocks` DELETED its paragraphs. The merge is
 *  per FIELD now, exactly as that file's header always claimed ("the fallback is per key, not per
 *  page"), which is what lets a translation of these two long documents be delivered in passes
 *  instead of all at once.
 *
 *  ⚠ AND THE SIMPLIFIED TWIN IS GENERATED FROM THIS FILE — `node scripts/zh-hans.mjs` writes
 *  js/locales/pages.zh-hans.js (Taiwan→mainland vocabulary, then the character map). Never edit that
 *  one; tests re-run the generator and fail if the two disagree.
 * ========================================================================== */
window.IntMapPageI18N.define('zh-hant', {

  common: {
    backToMap: '回到地圖',
    contents: '目錄',
    toScience: '科學與運算邏輯',
    toSources: '資料來源'
  },

  sources: {
    title: '資料來源',
    meta: 'IntMap 呈現的每一項資料出自哪個機構、用在哪裡、如何取得、授權為何，以及這對你的隱私代表什麼。',
    sub: 'IntMap 顯示的每一個數字、每一條線、每一張影像，以及<b>它們從何而來</b>。由這些資料計算出來的東西則在<a href="./science.html">科學與運算邏輯</a>頁。',
    sections: [
      { id: 'what', nav: '關於本頁', h: '關於本頁' },
      { id: 'live', nav: '資料的新鮮度', h: '這些數字有多新' },
      { id: 'privacy', nav: '開啟圖層會送出什麼', h: '開啟一個圖層時會發生什麼事' },
      { id: 'licence', nav: '製作者與使用條款', h: '這些資料由誰製作，以及使用條款' },
      { id: 'limits', nav: '資料沒有告訴你的事', h: '資料沒有告訴你的事' },
      { id: 'list', nav: '依主題排列的清單', h: '依主題排列的清單' }
    ]
  },

  science: {
    title: '科學與運算邏輯',
    meta: 'IntMap 的每一項功能與模擬使用哪些資料、依據哪些方程式、在哪些假設之下運作。',
    sub: 'IntMap 畫出來的每一條線與每一個數字，都是由<b>公開資料</b>經由這裡寫明的方程式算出來的。資料本身的出處在<a href="./sources.html">資料來源</a>頁。',
    sections: [
      { id: 'principles', nav: '基本原則', h: '基本原則' },
      { id: 'elevation', nav: '高程資料', h: '高程資料 — 所有地形運算的基礎' },
      { id: 'water', nav: '地形與水流', h: '地形塑形與水流路徑' },
      { id: 'seismic', nav: '地震震動', h: '地震震動' },
      { id: 'tsunami', nav: '海嘯', h: '海嘯' },
      { id: 'sealevel', nav: '海平面與淹沒', h: '海平面與淹沒範圍' },
      { id: 'tides', nav: '潮汐', h: '潮汐' },
      { id: 'currents', nav: '洋流', h: '洋流' },
      { id: 'atmosphere', nav: '大氣與天空', h: '大氣與天空的顏色' },
      { id: 'sun', nav: '太陽、陰影、視域', h: '太陽、陰影與視域分析' },
      { id: 'sats', nav: '人造衛星', h: '人造衛星' },
      { id: 'space', nav: '太空與天體', h: '太空與天體' },
      { id: 'flight', nav: '飛行模型', h: '飛行模型' },
      { id: 'routing', nav: '路徑與可達性', h: '路徑規劃與可達範圍' },
      { id: 'trade', nav: '貿易流向', h: '貿易流向' },
      { id: 'energy', nav: '能源結構', h: '能源結構' },
      { id: 'crops', nav: '作物', h: '作物' },
      { id: 'alerts', nav: '警報', h: '氣象與災害警報' },
      { id: 'news', nav: '新聞定位', h: '新聞定位' },
      { id: 'time', nav: '時鐘與時光機', h: '時鐘與時光機' },
      { id: 'labels', nav: '標籤大小', h: '標籤大小' },
      { id: 'ai', nav: 'AI 不得決定的事', h: 'AI 不被允許決定的事' }
    ]
  }
});
