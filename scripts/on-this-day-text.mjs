/* ============================================================================
 *  IntMap · the «on this day» pages and post drafts — THE WORDS   (scripts/on-this-day-text.mjs)
 * ----------------------------------------------------------------------------
 *  The only copy of the prose around the generated pages on-this-day/<MM-DD>/ and their ja/ twins, and of the
 *  post drafts (scripts/on-this-day-pages.mjs writes both). What a page states ABOUT A DAY is not here: the events,
 *  their wording and their sources come from data/on-this-day.json through js/on-this-day.js `describe` — the same
 *  sentences the app's sheet and Atlas say. These words only frame them.
 *
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7); `jp` is the app's spelling of Japanese.
 *  tests/marketing-next-checks.test.mjs holds the two languages to the same set of keys.
 *  Plain text only: the generator escapes every string. `{x}` placeholders are filled by the generator, which
 *  refuses a placeholder it does not know.
 * ==========================================================================*/

export const TEXT = {
  en: {
    crumb: 'On this day',
    hubTitle: 'On this day — the map of history, for every day of the year',
    hubDescription: 'For every day of the calendar, the events IntMap’s records date to it, from {from} to {to} — the days the border record begins drawing, stops drawing or redraws a country, and the dated events of IntMap’s war record. Each opens the map on that day.',
    hubLede: '{n} events on {d} days of the calendar, from {from} to {to}: the days the border record ({cshapes}) begins drawing, stops drawing or redraws a polity, and the dated events of IntMap’s war record. Pick a day.',
    hubEmpty: 'A day without a link: the records the map draws date no event to it.',
    dayTitle: 'On this day, {day} — {n} events on the map of history',
    dayDescription: '{year}: {headline}. And {more} more events dated {day}, each opening the map on that very day.',
    dayDescriptionOne: '{year}: {headline}. The map of that very day, with its source.',
    dayH1: '{day} on the map of history',
    dayLede: '{n} events the records the map draws date to {day}, from {first} to {last}. Each one opens the map on that very day.',
    pictureAlt: 'The map on {date}: {headline}',
    open: 'Open the map on this day',
    record: { border: 'Border record (CShapes 2.0)', war: 'War record · {war}' },
    yearOnlyH2: 'Dated 1 January',
    yearOnlyNote: 'The border record dates these to 1 January. For some of them that is a year, not a day, so they are listed apart and never as the day’s headline.',
    nav: { prev: 'Previous day', next: 'Next day', hub: 'Every day of the year', history: 'Historical maps by region and year' },
    methodH2: 'What this page states',
    method: [
      'A border event is what the border record states about its own outlines, under the names IntMap’s map writes on that day: «the map begins drawing», «stops drawing», «new borders for». It is computed by the map’s own code, comparing the day with the day before.',
      'A name the record does not date is not listed: the map’s table of era names is written in years, so a renaming that falls on another country’s border day is left out.',
      'OpenHistoricalMap, which the map draws from 1689 to 1885, is not included: its dates carry no precision, and most of its first-of-the-month dates are months or years written as days.',
      'The war record covers only the wars IntMap documents day by day ({wars}).',
    ],
    sourceH2: 'Sources',
    sourcesLink: 'Every data source IntMap uses',
    /* the post drafts (`--queue`) — a person approves and posts each one; nothing is sent from here */
    post: {
      x: 'On this day in {year}: {headline} — the map of that very day: {link}',
      long: '{day}, {year}: {headline}.\n\nIntMap opens the world map on any day — this one included, with every border as it stood that day and the record it comes from.\n{link}',
    },
  },
  jp: {
    crumb: 'この日の歴史地図',
    hubTitle: 'この日の歴史地図 — 1年のどの日にも、その日の世界地図',
    hubDescription: '暦のどの日にも、IntMap の記録がその日に日付をつけている出来事を（{from}〜{to}年）。国境の記録が国を描き始めた日・描かなくなった日・国境を描き変えた日と、IntMap の戦争記録の日付つきの出来事。どれもその日の地図で開きます。',
    hubLede: '暦の {d} 日に {n} 件（{from}〜{to}年）。国境の記録（{cshapes}）が政体を描き始めた日・描かなくなった日・描き変えた日と、IntMap の戦争記録の日付つきの出来事です。日付を選んでください。',
    hubEmpty: 'リンクの無い日は、地図が描く記録に日付つきの出来事がない日です。',
    dayTitle: '{day}の歴史地図 — この日に地図が変わった{n}件',
    dayDescription: '{year}年: {headline}。ほか{day}の出来事 {more} 件を、どれもその日の地図で。',
    dayDescriptionOne: '{year}年: {headline}。その日の地図を、出典つきで。',
    dayH1: '{day}の歴史地図',
    dayLede: '地図が描く記録が{day}に日付をつけている出来事は {n} 件（{first}〜{last}年）。どれも、その日の地図で開きます。',
    pictureAlt: '{date}の地図: {headline}',
    open: 'この日の地図を開く',
    record: { border: '国境の記録（CShapes 2.0）', war: '戦争の記録・{war}' },
    yearOnlyH2: '1月1日付けの記録',
    yearOnlyNote: '国境の記録がこれらを1月1日付けにしています。そのうちいくつかは日ではなく年を表すため、分けて示し、この日の見出しにはしません。',
    nav: { prev: '前の日', next: '次の日', hub: '1年のすべての日', history: '地域と年代から歴史地図を探す' },
    methodH2: 'このページが述べていること',
    method: [
      '国境の出来事は、国境の記録が自分の輪郭について述べていることを、IntMap の地図がその日に書く名前で示したものです（「地図に現れる」「地図から消える」「国境が変わる」）。地図自身のコードで、その日と前日を比べて求めています。',
      '記録が日付をつけていない名前は載せません。地図の時代名の表は年単位で書かれているため、別の国の国境が変わる日に重なった改名は除いています。',
      '地図が 1689〜1885 年に使う OpenHistoricalMap は含めていません。日付に精度の情報がなく、月初めの日付の多くは月や年を日として書いたものだからです。',
      '戦争の記録は、IntMap が日単位で扱う戦争だけです（{wars}）。',
    ],
    sourceH2: '出典',
    sourcesLink: 'IntMap が使うデータの出典一覧',
    post: {
      x: '{year}年の今日（{day}）: {headline}。その日の世界地図はこちら: {link}',
      long: '{year}年{day}: {headline}。\n\nIntMap は、どの日の世界地図でも開けます。この日も、その日の国境と、その出典つきで。\n{link}',
    },
  },
};
