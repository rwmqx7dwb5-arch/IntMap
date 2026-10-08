/* ============================================================================
 *  IntMap · the country entry pages — THE WORDS   (scripts/country-pages-text.mjs)
 * ----------------------------------------------------------------------------
 *  The only copy of the prose around the generated pages countries/<code>/ and their ja/ twins
 *  (scripts/country-pages.mjs writes them into dist/ when the site is built). What a page states
 *  ABOUT A COUNTRY is not here: the name is Natural Earth's (scripts/public-api.mjs countryUniverse),
 *  the facts are the offered datasets' rows with their own terms (public-api `countryFile`), the labels
 *  of those facts are the app's country card's (js/locales/ui.*.js), the events are the war record's
 *  through js/on-this-day.js `describe`. These words only frame them.
 *
 *  ⚠ A PRESENT-DAY COUNTRY IS NOT A HISTORICAL POLITY (.agents/rules/historical-verification.md). The
 *  history section says «historical maps of the region this outline lies in», never that the country
 *  existed then or under that name; the events section says «dated to a place inside today's outline».
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7); `jp` is the app's spelling of Japanese.
 *  tests/country-pages-checks.test.mjs holds the two languages to the same set of keys.
 *  Plain text only: the generator escapes every string. `{x}` placeholders are filled by the generator
 *  (scripts/history-pages.mjs `fill`), which refuses a placeholder it does not know.
 * ==========================================================================*/

export const TEXT = {
  en: {
    crumb: 'Countries',
    hubTitle: 'Every country on the map — population density, history and open data',
    hubDescription: '{n} countries and territories, each with a page that opens IntMap’s map on it: its population-density grid, the historical maps of its region, and the open data about it with its terms.',
    hubLede: '{n} countries and territories, as Natural Earth draws them. Each page opens the map on that country, with its population density, the historical maps of its region and the open data IntMap may share about it.',
    /* the title names only what the page has: the parts present, in this order */
    title: 'Map of {name} — {parts}',
    /* (marketing-growth) the link card's description, for a reader who cannot see it */
    cardAlt: 'Map of {name}, highlighted among the countries around it',
    titleParts: { pop: 'population density', history: 'historical maps', facts: 'facts' },
    description: 'Open {name} on IntMap’s interactive map: the population-density grid, the historical maps of {regions}, and {facts} — each with its source.',
    descriptionNoRegion: 'Open {name} on IntMap’s interactive map: the population-density grid and {facts} — each with its source.',
    descriptionFacts: 'its basic facts',
    descriptionNoFacts: 'the open data about it',
    h1: 'Map of {name}',
    lede: 'Open {name} on the map — framed on the country itself, not on every far-off island it holds — and look at it by population density, by the historical maps of its region, or with the open data below.',
    cta: 'Open {name} on the map',
    ctaPop: 'Population density map of {name}',
    factsH2: 'Facts',
    factsSub: 'As the source states them, in the source’s own words.',
    factsSource: 'Source: {credit}. Licence: {licences}.',
    historyH2: 'Historical maps',
    historySub: 'IntMap’s historical maps of the regions this outline lies in, on every date the map draws them. A region is a frame on the map, not a statement that {name} existed then: the names on each map are the ones the historical records give.',
    eventsH2: 'Dated events in this outline',
    eventsSub: 'Events of IntMap’s war record dated to a place inside today’s outline of {name}. Each links to the page of its calendar day, which opens the map on that day.',
    dataH2: 'Open data about {name}',
    dataSub: 'The datasets IntMap may share about {name}, each under its own terms. The values are in one file:',
    dataFile: 'api/v1/countries/{code}.json',
    terms: 'Requires: {terms}',
    credit: 'Credit: {credit}',
    dataNone: 'No dataset IntMap may share has a row for {name}.',
    methodH2: 'What this page states',
    method: [
      'The outline, the name and the code are Natural Earth’s (admin-0, public domain), the set IntMap’s map draws countries from. The map opens on the frame the app’s country search uses for it: the country itself, not every far-off island it holds.',
      'A historical map is listed when its region’s frame overlaps this outline. It is listed for the place, not for the country: the borders on it are what the historical records draw.',
      'An event is listed when the point the war record gives it falls inside this outline — a fact about the point, not about which state held the place at the time.',
    ],
    sourcesLink: 'Every source and its licence',
    nav: { hub: 'Every country', history: 'Historical maps by region and year', onThisDay: 'On this day', developers: 'Open data for developers' },
  },
  jp: {
    crumb: '国から探す',
    hubTitle: 'すべての国の地図——人口密度・歴史地図・オープンデータ',
    hubDescription: '{n} の国と地域。各ページから IntMap の地図をその国で開けます——人口密度のグリッド、その地域の歴史地図、そして条件つきで再利用できるオープンデータ。',
    hubLede: 'Natural Earth が描く {n} の国と地域。各ページは地図をその国で開き、人口密度・その地域の歴史地図・IntMap が共有できるオープンデータへつなぎます。',
    title: '{name}の地図——{parts}',
    cardAlt: '{name}を強調した周辺の地図',
    titleParts: { pop: '人口密度', history: '歴史地図', facts: '基本データ' },
    description: '{name}を IntMap の地図で開く: 人口密度のグリッド、{regions}の歴史地図、{facts}——それぞれ出典つき。',
    descriptionNoRegion: '{name}を IntMap の地図で開く: 人口密度のグリッドと{facts}——それぞれ出典つき。',
    descriptionFacts: '基本データ',
    descriptionNoFacts: 'オープンデータ',
    h1: '{name}の地図',
    lede: '{name}を地図で開きます——遠く離れた島々まで含めた枠ではなく、その国そのものの枠で。人口密度で、その地域の歴史地図で、または下のオープンデータと一緒に見られます。',
    cta: '{name}を地図で開く',
    ctaPop: '{name}の人口密度の地図',
    factsH2: '基本データ',
    factsSub: '出典が述べているとおりに、出典の言葉のままで載せています。',
    factsSource: '出典: {credit}。ライセンス: {licences}。',
    historyH2: '歴史地図',
    historySub: 'この輪郭が入る地域の、IntMap の歴史地図（地図が描くすべての日付）。地域は地図の枠であって、その時代に{name}があったという意味ではありません。各地図の名前は、歴史の記録が描くものです。',
    eventsH2: 'この輪郭の中で日付のある出来事',
    eventsSub: 'IntMap の戦争の記録のうち、今日の{name}の輪郭の中の地点に日付がついている出来事。それぞれ暦の日のページへつながり、そこから地図をその日で開けます。',
    dataH2: '{name}のオープンデータ',
    dataSub: 'IntMap が{name}について共有できるデータセット。それぞれ自身の条件に従います。値は 1 つのファイルにあります:',
    dataFile: 'api/v1/countries/{code}.json',
    terms: '条件: {terms}',
    credit: '表示する出典: {credit}',
    dataNone: 'IntMap が共有できるデータセットに、{name}の行はありません。',
    methodH2: 'このページが述べていること',
    method: [
      '輪郭・名前・コードは Natural Earth（admin-0、パブリックドメイン）のもので、IntMap の地図が国を描くのと同じ集合です。地図は、アプリの国の検索が使うのと同じ枠——遠く離れた島々を含めない、その国そのもの——で開きます。',
      '歴史地図は、その地域の枠がこの輪郭と重なるときに載せています。載せているのは場所についてであって国についてではありません——地図上の国境は歴史の記録が描くものです。',
      '出来事は、戦争の記録が与える地点がこの輪郭の中にあるときに載せています——地点についての事実であって、当時その場所をどの国が治めていたかではありません。',
    ],
    sourcesLink: 'すべての出典とライセンス',
    nav: { hub: 'すべての国', history: '地域と年代で探す歴史地図', onThisDay: 'この日の歴史地図', developers: '開発者向けオープンデータ' },
  },
};
