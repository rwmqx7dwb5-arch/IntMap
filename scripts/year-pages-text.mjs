/* ============================================================================
 *  IntMap · the year entry pages — THE WORDS   (scripts/year-pages-text.mjs)
 * ----------------------------------------------------------------------------
 *  The only copy of the prose around the generated pages history/years/<year>/ and their ja/ twins
 *  (scripts/year-pages.mjs writes them into dist/ when the site is built). Everything a page states
 *  ABOUT HISTORY is not here: which year has a page and why, the names the map draws, their records,
 *  the changes, the events and their sources are computed from the records the map draws, through the
 *  same code the map runs (scripts/history-pages.mjs mapReader) and the one dated-events index
 *  (js/time-index.js). These words only frame those facts — they make no claim of their own about the past.
 *
 *  ⚠ A NAME ON THE MAP IS WHAT A RECORD DRAWS, NOT A VERDICT OF HISTORY (.agents/rules/historical-verification.md).
 *  The page says «the map draws», «the record states» — never «existed», «was founded».
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7); `jp` is the app's spelling of Japanese.
 *  tests/history-year-pages-checks.test.mjs holds the two languages to the same set of keys.
 *  Plain text only: the generator escapes every string. `{x}` placeholders are filled by the generator
 *  (scripts/history-pages.mjs `fill`), which refuses a placeholder it does not know.
 * ==========================================================================*/

export const TEXT = {
  en: {
    crumb: 'The world by year',
    /* a year's page */
    /* ⚠ a different search from the region page history/world/<year>/ («World map in 1914» — the MAP): this page is the
       year's states, borders, changes and events. tests/history-year-pages-checks.test.mjs holds the two titles apart. */
    title: 'The world in {when}: states, borders and changes',
    description: 'Every state and border IntMap’s historical map draws on 1 July {when} — {n} names ({top}) — what changed since {prev}, and the events dated to that year, each with its source. Free, no sign-up.',
    descriptionFirst: 'Every state and border IntMap’s historical map draws on 1 July {when} — {n} names ({top}) — and the events dated to that year, each with its source. Free, no sign-up.',
    h1: 'The world in {when}',
    lede: 'On 1 July {when}, IntMap’s historical map draws {n} names across the world. The borders for this date come from {tier}.',
    unnamed: 'It also draws {k} outlines whose name the record does not give for this date.',
    cta: 'Open {when} on the map',
    ctaHub: 'All years',
    mapAlt: 'World map on 1 July {when}: the borders IntMap’s historical map draws on that date, from {tier}.',
    mapCaption: 'Drawn when the site is built from the same records and the same code the map uses, on 1 July {when}, in the Equal Earth projection. The picture is simplified for display only: each outline is reduced to about one pixel at this size, and outlines smaller than a pixel are left out of the picture — the map itself draws every one of them in full. Grey is land on which no record states a polity on this date (today’s coastline, Natural Earth 1:110m).',
    mapCaptionSheet: 'Paler fills are outlines drawn from the nearest historical-basemaps sheet ({sheet}), which is not dated to this year.',
    whyH2: 'Why this year has a page',
    why: {
      sheet: 'The historical-basemaps atlas drew a world sheet for this year.',
      turn: 'Among the largest year-to-year changes in the records the map dates by year or by day: {k} names begin or stop being drawn between 1 July {before} and 1 July {when}.',
      event: 'The year of {events} (dated events index, Wikidata).',
    },
    namesH2: 'Names on the map',
    namesSub: 'As the map labels them, largest first by the area of the outline drawn. Areas are of the drawn outline, rounded, and approximate. The record column says which record draws the outline; a Wikidata item is given where the record links one.',
    namesMore: 'All {n} names',
    colName: 'Name',
    colSource: 'Source spelling',
    colRecord: 'Record',
    colArea: 'Drawn area (km²)',
    described: 'a description by the source, not a name',
    changesH2: 'What changed since {prev}',
    changesSub: 'Names counted are those the records date to the year or the day (CShapes, OpenHistoricalMap, Cliopatria). Outlines filled from the nearest historical-basemaps sheet are counted only when both years are years that sheet was drawn for — otherwise the change would be the switch between two sheets, not a change in the world. Names are compared as written, so a polity a record names differently in the two years (Carthaginian Empire, then Carthage) is in both lists.',
    changesFirst: 'This is the earliest year with a page.',
    added: 'Now drawn ({k})',
    removed: 'No longer drawn ({k})',
    none: 'none',
    earlier: 'Earlier',
    later: 'Later',
    eventsH2: 'Events dated to {when}',
    eventsSub: 'Every record of IntMap’s one index of dated events whose date falls in this year: what the border record (CShapes 2.0) states about its own outlines, IntMap’s war record, and the world events Wikidata dates — each with its source and the precision of its date.',
    eventsNone: 'The index of dated events holds no event for {when}.',
    eventDay: 'On this day →',
    eventCite: 'Wikidata',
    recordBorder: 'the border record (CShapes 2.0)',
    recordWar: 'IntMap’s war record — {war}',
    sourceH2: 'Sources and method',
    sourceRecord: 'Borders and names: {src}.',
    method: [
      'Which years have a page is worked out when the site is built, from three rules applied to the records themselves: every year the historical-basemaps atlas drew a world sheet for; every year whose change from the year before (names the dated records begin or stop drawing) is in the top {quantile} of all such year-to-year changes since the dated records begin, leaving out the years where one record hands over to another; and every year of a geopolitical, war or revolution event in the dated events index, up to the last year the border records cover ({csTo}).',
      'On each year the map is read on 1 July, the instant the app’s own year links open on. Names are the source’s own, translated where the source or IntMap’s name table has a translation. A name is what a record draws there, not a verdict of history.',
    ],
    sourcesLink: 'All data sources',
    nav: { history: 'Historical maps by region', countries: 'Countries', onThisDay: 'On this day', worldRun: 'World map in {when} — the map, with the years it stays the same' },
    records: { cshapes: 'CShapes 2.0', ohm: 'OpenHistoricalMap', clio: 'Cliopatria', sheet: 'historical-basemaps' },
    /* the hub */
    hubTitle: 'The world by year — from {first} to {last}',
    hubDescription: '{n} years of the world’s political map, from {first} to {last}: each with the borders IntMap’s historical map draws, the names on it, what changed, and the events of that year. Free, no sign-up.',
    hubLede: '{n} years, each chosen from the records themselves: the years the historical-basemaps atlas drew a world sheet for, the years the dated records change most, and the years of the major geopolitical events in IntMap’s index. Each page shows the world on 1 July of that year, lists the names on it with their records, and opens the map there.',
    centuryAD: '{n} century',
    centuryBC: '{n} century BC',
    millenniumBC: '{n} millennium BC',
    /* (marketing-growth) the post drafts (`--queue`) — a person approves and posts each one; nothing is sent from here */
    post: { x: 'The world in {when}: {n} names on IntMap’s historical map ({top}), each with the record that draws it. {link}' },
  },
  jp: {
    crumb: '年ごとの世界',
    title: '{when}の世界——国と国境、前の年からの変化',
    description: 'IntMap の歴史地図が{when}7月1日に描くすべての国と国境——{n}の名前（{top}）——と、{prev}からの変化、その年の出来事。それぞれ出典つき。無料・登録不要。',
    descriptionFirst: 'IntMap の歴史地図が{when}7月1日に描くすべての国と国境——{n}の名前（{top}）——と、その年の出来事。それぞれ出典つき。無料・登録不要。',
    h1: '{when}の世界',
    lede: '{when}7月1日、IntMap の歴史地図は世界に{n}の名前を描きます。この日付の国境は{tier}によります。',
    unnamed: 'このほか、この日付について記録が名前を与えていない輪郭を{k}描いています。',
    cta: '{when}の地図を開く',
    ctaHub: 'すべての年',
    mapAlt: '{when}7月1日の世界地図：IntMap の歴史地図がこの日付に描く国境（{tier}）。',
    mapCaption: 'サイトのビルド時に、地図と同じ記録と同じコードで{when}7月1日を Equal Earth 図法で描いたものです。軽量化は表示のためだけです：輪郭はこの大きさでおよそ1ピクセルまで簡略化し、1ピクセルより小さい輪郭はこの絵では省いています——地図そのものはすべてを省略せずに描きます。灰色は、この日付にどの記録も政体を述べていない陸地です（現在の海岸線、Natural Earth 1:110m）。',
    mapCaptionSheet: '淡い塗りは、最も近い historical-basemaps の図（{sheet}）から補った輪郭で、この年の日付を持ちません。',
    whyH2: 'この年にページがある理由',
    why: {
      sheet: 'historical-basemaps の地図帳がこの年の世界図を描いています。',
      turn: '年または日の単位で日付を持つ記録の、前年からの変化が最も大きい年の一つです：{before}7月1日から{when}7月1日までに{k}の名前が描かれ始めるか、描かれなくなります。',
      event: '{events}の年です（日付つき出来事の索引、Wikidata）。',
    },
    namesH2: '地図に描かれる名前',
    namesSub: '地図が書く名前で、描かれる輪郭の面積が大きい順に並べています。面積は描かれた輪郭のもので、丸めた概算です。「記録」はその輪郭を描く記録で、記録が Wikidata の項目を結んでいる場合はそれを示します。',
    namesMore: '全{n}の名前',
    colName: '名前',
    colSource: '出典の綴り',
    colRecord: '記録',
    colArea: '描かれる面積（km²）',
    described: '出典による説明で、名前ではない',
    changesH2: '{prev}からの変化',
    changesSub: '数えるのは、年または日の単位で日付を持つ記録（CShapes・OpenHistoricalMap・Cliopatria）の名前です。最も近い historical-basemaps の図から補った輪郭は、両方の年がその図の描かれた年であるときだけ数えます——そうでなければ、変化は2枚の図の切り替わりであって世界の変化ではないからです。名前は書かれたとおりに比べるので、記録が2つの年で別の名前で書く政体（Carthaginian Empire と Carthage など）は両方の欄に出ます。',
    changesFirst: 'ページのある年のうち最も古い年です。',
    added: '新たに描かれる（{k}）',
    removed: '描かれなくなった（{k}）',
    none: 'なし',
    earlier: '前',
    later: '後',
    eventsH2: '{when}の出来事',
    eventsSub: 'IntMap の日付つき出来事の索引のうち、日付がこの年にあるすべての記録：国境の記録（CShapes 2.0）が自分の輪郭について述べていること、IntMap の戦争記録、Wikidata が日付を述べる世界の出来事——それぞれ出典と日付の精度つき。',
    eventsNone: '日付つき出来事の索引には、{when}の出来事がありません。',
    eventDay: 'この日の歴史地図 →',
    eventCite: 'Wikidata',
    recordBorder: '国境の記録（CShapes 2.0）',
    recordWar: 'IntMap の戦争記録 — {war}',
    sourceH2: '出典と方法',
    sourceRecord: '国境と名前：{src}。',
    method: [
      'どの年にページがあるかは、サイトのビルド時に記録そのものに3つの規則を当てて決めています：historical-basemaps の地図帳が世界図を描いたすべての年／前年からの変化（日付を持つ記録が描き始める・描かなくなる名前の数）が、日付を持つ記録が始まって以来の年ごとの変化の上位{quantile}に入るすべての年（ある記録から別の記録へ引き継ぐ年は除く）／日付つき出来事の索引にある地政・戦争・革命の出来事のすべての年（国境の記録が覆う最後の年 {csTo} 年まで）。',
      '各年は7月1日で地図を読みます（アプリの年のリンクが開く瞬間）。名前は出典のもので、出典か IntMap の名前表に訳があるときは訳します。名前は記録が描くものであって、何が存在したかの判定ではありません。',
    ],
    sourcesLink: 'すべてのデータ出典',
    nav: { history: '地域別の歴史地図', countries: '国の一覧', onThisDay: 'この日の歴史地図', worldRun: '{when}の世界地図——地図と、同じ名前が続く年' },
    records: { cshapes: 'CShapes 2.0', ohm: 'OpenHistoricalMap', clio: 'Cliopatria', sheet: 'historical-basemaps' },
    hubTitle: '年ごとの世界 — {first}から{last}まで',
    hubDescription: '{first}から{last}までの{n}年分の世界の政治地図：IntMap の歴史地図が描く国境、その上の名前、変化、その年の出来事。無料・登録不要。',
    hubLede: '記録そのものから選んだ{n}の年：historical-basemaps の地図帳が世界図を描いた年、日付を持つ記録が最も大きく変わる年、IntMap の索引にある主要な地政上の出来事の年。各ページはその年の7月1日の世界を示し、描かれる名前を記録つきで並べ、そこで地図を開きます。',
    centuryAD: '{n}世紀',
    centuryBC: '紀元前{n}世紀',
    millenniumBC: '紀元前{n}千年紀',
    post: { x: '{when}の世界: IntMap の歴史地図が描く{n}の名前（{top}）。どれも描いた記録つき。{link}' },
  },
};
