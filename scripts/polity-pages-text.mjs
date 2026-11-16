/* ============================================================================
 *  IntMap · the polity entry pages — THE WORDS   (scripts/polity-pages-text.mjs)
 * ----------------------------------------------------------------------------
 *  The only copy of the prose around the generated pages history/polities/<slug>/ and their ja/ twins
 *  (scripts/polity-pages.mjs writes them into dist/ when the site is built). Everything a page states
 *  ABOUT HISTORY is not here: which polities have a page, when the map begins and stops drawing each, the
 *  area drawn under its name, the year that area is largest, the records that draw it and the other names
 *  are read from data/polity-arcs.json — the index scripts/build-polity-arcs.mjs measures with the map's
 *  own code — through the reader the app's «Rise and fall» sheet uses (js/polity-arc.js describe).
 *  These words only frame those facts; they make no claim of their own about the past.
 *
 *  ⚠ A NAME ON THE MAP IS WHAT A RECORD DRAWS, NOT A VERDICT OF HISTORY (.agents/rules/historical-verification.md).
 *  The page says «the map draws», «the record begins / stops drawing» — never «was founded», «fell», «ruled».
 *  An area is the area OF THE DRAWN SHAPE, never a claim about what a realm controlled (the app's sheet says
 *  the same beside its chart).
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7); `jp` is the app's spelling of Japanese.
 *  tests/polity-pages-checks.test.mjs holds the two languages to the same set of keys.
 *  Plain text only: the generator escapes every string. `{x}` placeholders are filled by the generator
 *  (scripts/history-pages.mjs `fill`), which refuses a placeholder it does not know.
 * ==========================================================================*/

export const TEXT = {
  en: {
    crumb: 'Rise and fall',
    /* a polity's page — the search it answers: «Mongol Empire map», «Ottoman Empire at its largest» */
    title: '{name} on the map: {span}, largest in {peak}',
    description: 'IntMap’s historical map draws {name} from {first} to {last}. The largest area it draws under that name is {km} km², in {peak}. See its drawn area year by year, each stretch with the record that draws it, and open the map in any year of its life. Free, no sign-up.',
    descriptionToday: 'IntMap’s historical map draws {name} from {first}, and still in {last}, the last year its records cover. The largest area it draws under that name is {km} km², in {peak}. See its drawn area year by year and open the map in any year. Free, no sign-up.',
    h1: '{name} through time',
    lede: 'When IntMap’s historical map begins and stops drawing {name}, how large the shape drawn under that name is in every year the records change it, and when it is largest — read from the map’s own records.',
    ctaPeak: 'Open the map in {peak}',
    ctaFirst: 'First drawn: {first}',
    ctaLast: 'Last drawn: {last}',
    ctaHub: 'All polities',
    cardAlt: '{name} in {peak}: the shape IntMap’s historical map draws under that name on 1 July {peak}, among the outlines it draws that day.',
    cardCaption: 'The map on 1 July {peak}, the year the shape drawn under this name is largest, drawn when the site is built from the same records and code the map uses. Grey is today’s land (Natural Earth 1:50m) where no record draws a polity that day. Simplified for display only.',
    factsH2: 'At a glance',
    facts: {
      first: 'First drawn',
      last: 'Last drawn',
      peak: 'Largest drawn area',
      stretches: 'Drawn in',
      changes: 'Years its drawn shape changes',
      records: 'Drawn by',
      wikidata: 'Wikidata',
    },
    peakValue: '{km} km² in {peak}',
    changesValue: '{n}',
    /* shown when the map draws the name in more than one stretch (the «Kingdom of Italy» of 887 and of 1861 share a name) */
    stretchesValue: '{n} separate stretches: {list}. The map writes the same name on each; it does not say they are one polity.',
    edge: {
      stated: 'The record draws it from {y}.',
      statedLast: 'The record stops drawing it after {y}.',
      /* from the year OpenHistoricalMap begins the map is read on 1 July of every year — an edge is between two readings */
      statedDay: 'The map draws it on 1 July {y} and not on 1 July of the year before.',
      statedLastDay: 'The map draws it on 1 July {y} and not on 1 July of the year after.',
      reach: '{y} is the first year {rec} covers: the record begins there, which is not a statement that the polity did.',
      reachLast: 'In {next} {by} takes over from {rec}; it may draw the same land under another name.',
      today: 'Still drawn in {y}, the last year the records cover.',
    },
    chartH2: 'Area drawn, year by year',
    chartSub: 'The area of the shape the map draws under this name (km², measured on the sphere), at every year the records change it, coloured by the record that draws it. Dashed lines are where one record hands over to the next. It is the area of a drawn shape, not a measure of what the polity controlled.',
    chartAlt: 'Area drawn under the name {name}, {first} to {last}; largest {km} km² in {peak}',
    yearsH2: 'The world in the years it is drawn',
    yearsSub: 'Pages of the whole world in the years of its life that have one, each listing every name the map draws that year.',
    otdH2: 'On this day',
    otdSub: 'Days on which the border record (CShapes 2.0) begins drawing it, stops drawing it, or redraws its borders.',
    otdKinds: { appeared: 'the map begins drawing it', ended: 'the map stops drawing it', redrawn: 'new borders' },
    otdYearOnly: 'Dated 1 January — the record may state only the year.',
    relatedH2: 'Other names in the records',
    relatedSub: 'Other names the records link to the same Wikidata item. They are listed because the records link them, not because IntMap judges them to be the same polity.',
    relatedJpSub: '',
    sourceH2: 'Sources and method',
    sourceRecord: '{src}.',
    method: [
      'The map is read at every instant its records change what they draw: every year before {ohmFrom} on which a Cliopatria row begins or ends or the map moves to another historical-basemaps sheet, and 1 July of every year from {ohmFrom} to {csTo}. A polity is the name the map writes on an outline; its area is the area of everything drawn under that name, on the sphere.',
      'Pages are written for every polity the dated records draw (Cliopatria, OpenHistoricalMap, CShapes). Names a historical-basemaps sheet alone draws state a period, not a year, and have no page; the app lists them in its «Rise and fall» sheet.',
    ],
    sourcesLink: 'All data sources',
    nav: { history: 'Historical maps by region', years: 'The world by year', onThisDay: 'On this day', hub: 'Rise and fall: all polities' },
    records: { cshapes: 'CShapes 2.0', ohm: 'OpenHistoricalMap', clio: 'Cliopatria', sheet: 'historical-basemaps' },
    /* the hub */
    hubTitle: 'Rise and fall — {n} empires, kingdoms and states on the historical map',
    hubDescription: '{n} polities IntMap’s historical map draws, from {first} to {last}: for each, when the map begins and stops drawing it, its drawn area year by year, and the year it is largest. Free, no sign-up.',
    hubLede: 'Every polity the dated records of IntMap’s historical map draw, grouped by the century (before 1000 BC, the millennium) the map first draws it, largest first. Each page shows when the map begins and stops drawing it, its drawn area through time with the record behind each stretch, and opens the map in the year it is largest.',
    largestH2: 'Largest drawn areas',
    hubItem: '{span} · largest {peak}',
    /* the post drafts (`--queue`) — a person approves and posts each one; nothing is sent from here */
    post: { x: '{name} on IntMap’s historical map: drawn {span}, largest in {peak} ({km} km² drawn). Its area year by year, with the record behind each stretch. {link}' },
  },
  jp: {
    crumb: '政体の盛衰',
    title: '{name}の地図——{span}、最大の描画は{peak}',
    description: 'IntMap の歴史地図は{name}を{first}から{last}まで描きます。この名前で描かれる面積が最も大きいのは{peak}の{km} km²。描かれた面積の推移を、各区間を描いた記録つきで見て、その一生のどの年でも地図を開けます。無料・登録不要。',
    descriptionToday: 'IntMap の歴史地図は{name}を{first}から描き、記録が届く最後の年である{last}にも描いています。この名前で描かれる面積が最も大きいのは{peak}の{km} km²。描かれた面積の推移を見て、どの年でも地図を開けます。無料・登録不要。',
    h1: '{name}の盛衰',
    lede: 'IntMap の歴史地図が{name}をいつ描き始め、いつ描かなくなるか、記録が変わる年ごとにこの名前で描かれる形の大きさ、そして最も大きいのはいつか——地図自身の記録から読みます。',
    ctaPeak: '{peak}の地図を開く',
    ctaFirst: '描き始め：{first}',
    ctaLast: '描き終わり：{last}',
    ctaHub: 'すべての政体',
    cardAlt: '{peak}の{name}：IntMap の歴史地図が{peak}7月1日にこの名前で描く形と、その日に描かれるほかの輪郭。',
    cardCaption: 'この名前で描かれる形が最も大きい年、{peak}の7月1日の地図です。サイトのビルド時に、地図と同じ記録と同じコードで描きました。灰色は、その日にどの記録も政体を描いていない現在の陸地（Natural Earth 1:50m）です。軽量化は表示のためだけです。',
    factsH2: '概要',
    facts: {
      first: '描き始め',
      last: '描き終わり',
      peak: '最大の描画面積',
      stretches: '描かれている期間',
      changes: '描かれる形が変わる年の数',
      records: '描いている記録',
      wikidata: 'Wikidata',
    },
    peakValue: '{peak}の{km} km²',
    changesValue: '{n}',
    stretchesValue: '{n}つの離れた期間：{list}。地図はどれにも同じ名前を書きますが、同じ政体だとは述べていません。',
    edge: {
      stated: '記録は{y}から描いています。',
      statedLast: '記録は{y}を最後に描かなくなります。',
      statedDay: '地図は{y}7月1日にはこれを描き、前の年の7月1日には描いていません。',
      statedLastDay: '地図は{y}7月1日にはこれを描き、次の年の7月1日には描いていません。',
      reach: '{y}は{rec}が覆う最初の年です：記録がそこで始まるのであって、政体がそこで始まったという主張ではありません。',
      reachLast: '{next}に{rec}から{by}へ引き継がれます。次の記録は同じ土地を別の名前で描くことがあります。',
      today: '記録が届く最後の年である{y}にも描かれています。',
    },
    chartH2: '描かれた面積の推移',
    chartSub: 'この名前で地図が描く形の面積（km²、球面上で測ったもの）を、記録が変える年ごとに、描いた記録で色分けして示します。破線はある記録から次の記録へ引き継ぐ年です。描かれた形の面積であって、その政体が支配した範囲の大きさではありません。',
    chartAlt: '{name}の名前で描かれた面積、{first}から{last}まで。最大は{peak}の{km} km²',
    yearsH2: '描かれている年の世界',
    yearsSub: 'その一生のうち、世界全体のページがある年。各ページはその年に地図が描くすべての名前を並べます。',
    otdH2: 'この日の歴史地図',
    otdSub: '国境の記録（CShapes 2.0）がこの名前を描き始める日・描かなくなる日・国境を描き直す日。',
    otdKinds: { appeared: '地図に現れる', ended: '地図から消える', redrawn: '国境が変わる' },
    otdYearOnly: '1月1日付け——記録が年だけを述べている場合があります。',
    relatedH2: '記録上の別の名前',
    relatedSub: '記録が同じ Wikidata の項目に結んでいる別の名前です。記録がそう結んでいるから並べるのであって、IntMap が同じ政体だと判定しているのではありません。',
    relatedJpSub: '日本語で地図が同じ名前を書くもの（項目は別）も並べます。',
    sourceH2: '出典と方法',
    sourceRecord: '{src}。',
    method: [
      '地図は、記録が描くものを変えるすべての瞬間に読んでいます：{ohmFrom}年より前は Cliopatria の行が始まる・終わる年と、地図が別の historical-basemaps の図に移る年、{ohmFrom}年から{csTo}年までは毎年7月1日。政体とは地図が輪郭に書く名前で、その面積はその名前で描かれるものすべての、球面上の面積です。',
      'ページは、日付を持つ記録（Cliopatria・OpenHistoricalMap・CShapes）が描くすべての政体について書いています。historical-basemaps の図だけが描く名前は年ではなく時期を述べるもので、ページはありません（アプリの「政体の盛衰」のシートには載っています）。',
    ],
    sourcesLink: 'すべてのデータ出典',
    nav: { history: '地域別の歴史地図', years: '年ごとの世界', onThisDay: 'この日の歴史地図', hub: '政体の盛衰：すべての政体' },
    records: { cshapes: 'CShapes 2.0', ohm: 'OpenHistoricalMap', clio: 'Cliopatria', sheet: 'historical-basemaps' },
    hubTitle: '政体の盛衰——歴史地図が描く{n}の帝国・王国・国家',
    hubDescription: 'IntMap の歴史地図が{first}から{last}までに描く{n}の政体：それぞれについて、地図がいつ描き始め・いつ描かなくなるか、描かれた面積の推移、最も大きい年。無料・登録不要。',
    hubLede: 'IntMap の歴史地図の日付を持つ記録が描くすべての政体を、地図が最初に描く世紀（紀元前1000年より前は千年紀）ごとに、大きい順に並べています。各ページは、地図が描き始める年と描かなくなる年、記録つきの描画面積の推移を示し、最も大きい年で地図を開きます。',
    largestH2: '描かれた面積が大きい政体',
    hubItem: '{span}・最大 {peak}',
    post: { x: 'IntMap の歴史地図の{name}: {span}に描かれ、最も大きいのは{peak}（描画 {km} km²）。面積の推移を、各区間を描いた記録つきで。{link}' },
  },
};
