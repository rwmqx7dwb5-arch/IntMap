/* ============================================================================
 *  IntMap · «This week on Earth» — THE WORDS   (scripts/weekly-earth-text.mjs)
 * ----------------------------------------------------------------------------
 *  The only copy of the prose around the generated pages weekly/<YYYY>-W<ww>/ and their ja/ twins, their Atom feeds
 *  and the post drafts (scripts/weekly-earth-pages.mjs writes all of them). What a page states ABOUT A WEEK is not
 *  here: the events, their wording and their sources come from data/weekly-earth.json through js/weekly-earth.js
 *  `describe` — the same words Atlas says. These words only frame them.
 *
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7); `jp` is the app's spelling of Japanese.
 *  tests/weekly-earth-checks.test.mjs holds the two languages to the same set of keys.
 *  Plain text only: the generator escapes every string. `{x}` placeholders are filled by the generator, which
 *  refuses a placeholder it does not know (scripts/history-pages.mjs fill).
 * ==========================================================================*/

export const TEXT = {
  en: {
    crumb: 'This week on Earth',
    nav: 'This week on Earth',
    hubTitle: 'This week on Earth — the planet’s large natural events, week by week',
    hubDescription: 'Every week, the earthquakes of magnitude {mag} and above that USGS lists and the storms, volcanoes, floods, ice and large wildfires NASA’s EONET tracks — each one opens the map on its place and day. {n} weeks, newest first, with a feed.',
    hubLede: 'Each week, as the public records list it: the earthquakes of magnitude {mag} and above in the USGS catalogue, and the natural events NASA’s EONET tracks. Each event opens the map where and when it happened. {n} weeks, from {first} to {last}.',
    hubLatest: 'Latest week',
    hubArchive: 'Every week',
    weekTitle: 'This week on Earth: {week}',
    weekDescription: '{summary}. Largest: {headline}. Each event opens the map on its place and day.',
    weekDescriptionNone: '{summary}. Each event opens the map on its place and day.',
    weekH1: 'This week on Earth',
    weekLede: '{week} (ISO week {slug}, in UTC): {summary}.',
    headlineH2: 'Largest earthquake of the week',
    headlineH2Event: 'Strongest event of the week',
    openWeek: 'Open the whole week on the map',
    open: 'Open on the map',
    quakesH2: 'Earthquakes of magnitude {mag} and above',
    quakesNone: 'The USGS catalogue lists no earthquake of magnitude {mag} or above in this week.',
    eventsH2: 'Natural events tracked by NASA EONET',
    eventsNone: 'EONET lists no event with an observation in this week.',
    fewerWildfires: '{n} smaller wildfires (stated burned area under {ha} ha) are counted here and not listed.',
    provisional: 'This week ended recently. USGS revises magnitudes as its review proceeds and EONET adds events as its sources report them, so the page will be updated once more.',
    sourceLink: 'source',
    nav2: { prev: 'Previous week', next: 'Next week', hub: 'Every week', feed: 'Subscribe (Atom feed)', history: 'Historical maps by region and year' },
    methodH2: 'What this page states',
    method: [
      'Every line is what a public record states: USGS’s magnitude, time, depth and place for an earthquake (the place is written by USGS, in English), and EONET’s title, dates and originating source for every other event. IntMap adds no description of damage or consequences.',
      'A week is ISO 8601’s: Monday 00:00 UTC to the following Monday. An event that lasts several days appears in every week in which EONET has an observation of it, at its latest position in that week.',
      'The largest earthquake is chosen by USGS’s magnitude; with no earthquake, the storm with the highest wind EONET states. Nothing is ranked by judgement.',
      'Wildfires are listed when the burned area EONET states is {ha} ha (100 km²) or more; the rest are counted. An event EONET gives only as an outline is listed and not placed, because those outlines do not state their axis order.',
    ],
    sourceH2: 'Sources',
    usgsLine: 'Earthquakes: U.S. Geological Survey, Earthquake Hazards Program — FDSN event service. U.S. public domain.',
    eonetLine: 'Natural events: NASA Earth Observatory Natural Event Tracker (EONET) v3, with the originating source named on each event. A U.S. Government work; courtesy of NASA.',
    sourcesLink: 'Every data source IntMap uses',
    feedTitle: 'This week on Earth — IntMap',
    feedSubtitle: 'Each week’s large earthquakes (USGS) and natural events (NASA EONET), each opening the map where and when it happened.',
    /* the post drafts (`--queue`) — a person approves and posts each one; nothing is sent from here */
    post: { x: 'This week on Earth ({week}): {headline}. {summary}. On the map: {link}' },
  },
  jp: {
    crumb: '今週の地球',
    nav: '今週の地球',
    hubTitle: '今週の地球 — 地球の大きな自然現象を、1週間ごとに',
    hubDescription: '毎週、USGS が記録した M{mag} 以上の地震と、NASA の EONET が追跡する嵐・火山・洪水・氷山・大規模な山火事。どれも、その場所とその日の地図で開きます。{n} 週ぶんを新しい順に。フィードで購読できます。',
    hubLede: '公開された記録が述べるとおりに、1週間ずつ。USGS の地震カタログにある M{mag} 以上の地震と、NASA の EONET が追跡する自然現象です。どの出来事も、起きた場所とその日の地図で開きます。{first}〜{last}、{n} 週ぶん。',
    hubLatest: '最新の週',
    hubArchive: 'すべての週',
    weekTitle: '今週の地球: {week}',
    weekDescription: '{summary}。最大: {headline}。どの出来事も、その場所とその日の地図で開きます。',
    weekDescriptionNone: '{summary}。どの出来事も、その場所とその日の地図で開きます。',
    weekH1: '今週の地球',
    weekLede: '{week}（ISO 週 {slug}・UTC）: {summary}。',
    headlineH2: 'この週の最大の地震',
    headlineH2Event: 'この週の最も強い現象',
    openWeek: 'この週のすべてを地図で開く',
    open: '地図で開く',
    quakesH2: 'M{mag} 以上の地震',
    quakesNone: 'USGS のカタログには、この週の M{mag} 以上の地震はありません。',
    eventsH2: 'NASA EONET が追跡した自然現象',
    eventsNone: 'EONET には、この週に観測のある現象はありません。',
    fewerWildfires: 'これより小さい山火事（記録された焼失面積が {ha} ヘクタール未満）{n} 件は、数だけを示し一覧には載せていません。',
    provisional: 'この週は終わったばかりです。USGS は審査に応じてマグニチュードを改め、EONET は情報源の報告に応じて現象を加えるため、このページはもう一度更新されます。',
    sourceLink: '出典',
    nav2: { prev: '前の週', next: '次の週', hub: 'すべての週', feed: '購読する（Atom フィード）', history: '地域と年代から歴史地図を探す' },
    methodH2: 'このページが述べていること',
    method: [
      'どの行も、公開された記録が述べていることです。地震は USGS のマグニチュード・時刻・深さ・場所（場所は USGS が英語で書いたもの）、それ以外の現象は EONET の名称・日付と、EONET が示す元の情報源です。被害や影響についての記述を IntMap は加えていません。',
      '週は ISO 8601 の週（月曜 0 時 UTC から翌週の月曜まで）です。数日にわたる現象は、EONET に観測のあるすべての週に、その週の最後の位置で載ります。',
      '最大の地震は USGS のマグニチュードで選びます。地震のない週は、EONET が述べる風速が最も強い嵐です。判断による順位づけはしていません。',
      '山火事は、EONET が述べる焼失面積が {ha} ヘクタール（100 km²）以上のものを載せ、それ以外は件数だけを示します。EONET が輪郭だけで示す現象は、その輪郭が軸の順序を明示していないため、一覧に載せて位置は示しません。',
    ],
    sourceH2: '出典',
    usgsLine: '地震: 米国地質調査所（USGS）Earthquake Hazards Program — FDSN event service。米国のパブリックドメイン。',
    eonetLine: '自然現象: NASA Earth Observatory Natural Event Tracker（EONET）v3。各現象に元の情報源を示しています。米国政府の著作物（NASA 提供）。',
    sourcesLink: 'IntMap が使うデータの出典一覧',
    feedTitle: '今週の地球 — IntMap',
    feedSubtitle: '毎週の大きな地震（USGS）と自然現象（NASA EONET）。どれも、起きた場所とその日の地図で開きます。',
    post: { x: '今週の地球（{week}）: {headline}。{summary}。地図で見る: {link}' },
  },
};
