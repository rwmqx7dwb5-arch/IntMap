/* ============================================================================
 *  IntMap · THE BRAND'S WORDS — the one place IntMap says what it is   (scripts/brand-text.mjs)
 * ----------------------------------------------------------------------------
 *  「価値提案がページごとにずれている」 (marketing-engine, 2026-10-03): the app's head said «Explore the
 *  world. Ask the map.», the landing page «Every year of the world, on one map.», the README «Explore
 *  the world across place, data, and time.» Three answers to «what is this», each true, none chosen.
 *  This file chooses. Everything that says what IntMap is to someone who has not opened it is derived
 *  from here by scripts/brand.mjs:
 *    · index.html's head (title, description, Open Graph, X card, JSON-LD, canonical) — the block
 *      between the GENERATED BRAND HEAD markers;
 *    · the app's own document title and description (js/locales/ui.en.js / ui.jp.js docTitle, docDesc),
 *      which js/lang-registry.js writes over the head at run time — they must say the same;
 *    · manifest.webmanifest, which scripts/build-app-manifest.mjs reads from that head;
 *    · README.md's one-line tagline;
 *    · docs/marketing/press-kit.md and docs/marketing/launch-posts.md (the launch material);
 *    · (press-room) press.html and ja/press.html, which scripts/org-pages.mjs fills from words();
 *    · (spacetime-positioning) the landing page's eyebrow and headline (scripts/landing-text.mjs), held to
 *      `category` and `tagline` by tests/marketing-engine-checks ② and tests/spacetime-positioning-checks.
 *
 *  ══ WHY «A SPACE-TIME ATLAS» (spacetime-positioning, 2026-10-07) ══════════════════════════════════
 *  The words before this said «a world map with one clock» and, before that, «news, climate, population,
 *  economy and geopolitics on one map». The second is an inventory of layers — any map site can say it.
 *  The first was right about the clock and silent about the present: it described IntMap as a
 *  historical map that also has layers, while the same map carries live earthquakes, rain radar,
 *  aircraft and warnings for today. What nothing else on the web does the same way is BOTH ENDS ON ONE
 *  MAP: the world as it is now, and the world on any date back to {floorBC} — borders, that year's city
 *  names and provinces, the two World Wars day by day — with every border drawn from a named record.
 *  So the category is named (`category`: a space-time atlas of the Earth), the promise says the two
 *  ends (`tagline`), and the trust is its own line (`trust`).
 *  The positioning still has to be true for the first visit, and the first visit has no account: the
 *  map, every layer and the clock are open to everyone; Atlas needs a sign-in and has a daily limit.
 *  So Atlas is a proof point and one of the three ways in, never the headline.
 *
 *  ⚠ EVERY CLAIM IS ABOUT SOMETHING THAT EXISTS TODAY (PRODUCT.md §2.1-3, 「表示は正直」). The features
 *  named here are in PRODUCT.md §3.1 (Chronos, the border tiers, historical city names, the
 *  reconstructed provinces, the two World Wars, live aircraft and earthquakes, radar, warnings). City
 *  names and provinces are claimed only «where the records reach» — they do not go back to the clock's
 *  floor. A NUMBER is never typed here: {floorBC}, {layers}, {snapshots}, {ohmFrom} … are filled by
 *  scripts/brand.mjs from the files that own them (the same facts scripts/landing.mjs reads).
 *  IntMap-authored text is en + jp (CONSTITUTION.md §7); `jp` is the app's spelling of Japanese.
 *  «IntMap» is a wordmark and is never translated; «Atlas» is the assistant's own name and is not
 *  translated either.
 * ==========================================================================*/

export const BRAND = {
  en: {
    /* the kind of thing IntMap is, in a few words — the press room's first line and the landing page's eyebrow */
    category: 'A space-time atlas of the Earth',
    tagline: 'The world today, or in any year, on one map.',
    title: 'IntMap — A space-time atlas of the Earth: the world today, or in any year',
    /* why the map can be believed, in one line */
    trust: 'Every border is drawn from a named record, and every layer names its source.',
    /* the search result's line: what it is, the range, what is on it, why trust it, what it costs */
    description: 'A free space-time atlas of the Earth. See today’s world live — earthquakes, rain radar, aircraft — or set the clock to any date from {floorBC} and the borders follow. Every source named. No sign-up.',
    /* the card a shared link unfolds into */
    /* what the social picture (og-image.jpg) shows — a screenshot of the app, described as it is */
    imageAlt: 'IntMap showing Europe with sea-surface temperature, submarine cables and rain radar, beside the Countries, Layers and Atlas panels',
    social: 'The world today, or in any year, on one map: live earthquakes, radar and aircraft for now, and borders for any date from {floorBC} — with that year’s city names and provinces where the records reach. {layers} layers, every source named, free and with no sign-up. Signed in, Atlas answers on the map.',
    positioning: {
      for: 'People who want to see where and when things happen and happened — history and geography learners and teachers, map lovers, and anyone following the news.',
      is: 'IntMap is a free space-time atlas of the Earth: one map for the world as it is now and as it was on any date.',
      that: 'For today, the map carries live feeds — earthquakes, rain radar, aircraft, weather warnings. Set the clock to any date from {floorBC} and the borders, the city names, the provinces and every layer follow, each drawn only from a record that describes that date, with its source named. It opens in a browser, with nothing to install and no account.',
      unlike: 'Unlike live maps, which know only today, and printed or static historical maps, which show the moments someone chose for you, IntMap puts the present and every past date on one clock; unlike GIS tools, it brings the data with it.',
    },
    proof: [
      'Borders for every year, layered by precision: CShapes 2.0 day by day from {csFrom} to {csTo}, OpenHistoricalMap from {ohmFrom} to {ohmTo}, Cliopatria from the Seshat Global History Databank year by year from {clioFromBC} where those are silent, and {snapshots} historical snapshots where none of them speaks.',
      'The map speaks the year’s language: a city label takes the name the city had then where the record holds one — Edo, Constantinople, Stalingrad — and provinces come from the publishers’ records or, where no record speaks, are reconstructed by IntMap from cited laws, gazettes and change lists.',
      'Both World Wars day by day: the ground each side held, the front lines on the dates the record places them, and the operations under way.',
      'The present, live: earthquakes, rain radar, aircraft, weather and disaster warnings, the weather forecast, and the news placed where it happened.',
      '{layers} layers — climate, hazards, population, economy, infrastructure, live feeds — each with its source and licence on the Data sources page. A layer whose source does not describe the chosen date is not drawn.',
      'One link reopens the same place, date and layers on any device; the same map can be embedded on another site.',
      'Atlas, IntMap’s AI assistant, answers on the map itself — switching layers, moving the camera and the clock — for signed-in users, within a daily limit per account.',
      'Free, with no ads and no paid plan; running costs are covered by donations. The interface is in {langs} languages.',
    ],
    pitch: {
      short: 'A free space-time atlas: the world today, or in any year from {floorBC}, on one map.',
      medium: 'IntMap is a free space-time atlas of the Earth. Today’s map carries live earthquakes, rain radar and aircraft; set the clock to any date from {floorBC} and the borders, the city names, the provinces and {layers} layers follow, each with its source named. It runs in a browser with no sign-up, and one link reopens exactly what you see.',
      long: 'IntMap is a free space-time atlas of the Earth: one map for the world as it is now and as it was on any date. For today it carries live earthquakes, rain radar, aircraft, weather warnings and the news placed where it happened. Move the clock anywhere from {floorBC} and the map moves with it: country borders day by day from CShapes 2.0 ({csFrom}–{csTo}) and OpenHistoricalMap ({ohmFrom}–{ohmTo}), year by year from Cliopatria (Seshat Global History Databank, from {clioFromBC}) where those are silent, and from {snapshots} historical snapshots where none of them speaks. Where the records reach, city labels take that year’s names and the provinces are drawn as they were, and both World Wars can be followed day by day. On the same map sit {layers} layers — climate, hazards, population, economy, infrastructure and live feeds — and every one names its source; a layer whose source does not describe the chosen date is simply not drawn. A link reopens the same place, date and layers on any device, and the page for teachers shows how to build a lesson on that. Signed in, Atlas, IntMap’s AI assistant, answers on the map itself. IntMap has no ads and no paid plan and is kept running by donations.',
    },
  },
  jp: {
    category: '地球の時空間アトラス',
    tagline: 'いまの世界も、どの年の世界も、一枚の地図で。',
    title: 'IntMap — 地球の時空間アトラス：いまの世界も、どの年の世界も',
    trust: '国境は線の一本まで出所の記録があり、レイヤーはすべて出典を明記しています。',
    description: '無料の地球の時空間アトラス。いまの世界を地震・雨雲レーダー・航空機のライブで、時計を{floorBC}からのどの日付に合わせてもその日の国境で。すべての出典を明記。登録不要。',
    imageAlt: '海面水温・海底ケーブル・雨雲レーダーを重ねたヨーロッパの地図と、国・レイヤー・Atlas のパネルを開いた IntMap の画面',
    social: 'いまの世界も、どの年の世界も、一枚の地図で。いまは地震・雨雲レーダー・航空機のライブ、時計を{floorBC}からのどこに合わせてもその日の国境——記録が届くところでは、その年の都市名と地方区分まで。{layers}のレイヤーすべてに出典を明記。無料・登録不要。ログインすれば、Atlas が地図の上で答えます。',
    positioning: {
      for: 'いつ・どこで起きている／起きたことかを自分の目で確かめたい人——歴史や地理を学ぶ人と教える人、地図が好きな人、ニュースを追う人。',
      is: 'IntMap は無料の地球の時空間アトラスです。いまの世界と、どの日付の世界も、一枚の地図で見られます。',
      that: 'いまの地図には、地震・雨雲レーダー・航空機・気象警報のライブが載ります。時計を{floorBC}からのどの日付に合わせても、国境・都市名・地方区分・すべてのレイヤーがついてきて、どれもその日付を述べる記録だけから描き、出典を明記します。ブラウザで開くだけで、インストールもアカウントも要りません。',
      unlike: '今日しか知らないライブ地図とも、誰かが選んだ一瞬だけを見せる地図帳や静的な歴史地図とも違い、いまとすべての過去を一つの時計に載せています。データを自分で用意することが前提の GIS とも違い、データは最初から地図にあります。',
    },
    proof: [
      'すべての年の国境を精度の順に重ねて：{csFrom}〜{csTo}年は CShapes 2.0、{ohmFrom}〜{ohmTo}年は OpenHistoricalMap（どちらも日単位）、それらが述べない土地に Seshat Global History Databank の Cliopatria（{clioFromBC}から・年単位）、どれも述べない土地に{snapshots}枚の歴史スナップショット。',
      '地図がその年の言葉で話します。記録がある都市は、ラベルがその年の名前になり（江戸、コンスタンティノープル、スターリングラード）、地方区分は出版元の記録から、どの記録も述べていない所は法令・官報・変更一覧の出典をつけて IntMap が復元しています。',
      '両大戦を日ごとに：それぞれの陣営の支配地域、記録が位置を伝えている日付の戦線、進行中の作戦。',
      'いまをライブで：地震、雨雲レーダー、航空機、気象・災害の警報、天気予報、起きた場所に置いたニュース。',
      '気候・災害・人口・経済・インフラ・リアルタイムの{layers}のレイヤー。すべての出典とライセンスを「データの出典」ページに載せています。選んだ日付を出典が述べていないレイヤーは描きません。',
      'リンク一つで、同じ場所・日付・レイヤーをどの端末でも開き直せます。同じ地図を他のサイトに埋め込むこともできます。',
      'IntMap の AI アシスタント Atlas は、地図そのものの上で答えます——レイヤーを点け、カメラと時計を動かして。ログインした人が使え、アカウントごとに一日の上限があります。',
      '広告なし・有料プランなしの無料。運営費は寄付で賄っています。画面は{langs}言語に対応。',
    ],
    pitch: {
      short: '無料の時空間アトラス。いまの世界も、{floorBC}からのどの年の世界も、一枚の地図で。',
      medium: 'IntMap は無料の地球の時空間アトラスです。いまの地図には地震・雨雲レーダー・航空機のライブが載り、時計を{floorBC}からのどの日付に合わせても、国境・都市名・地方区分・{layers}のレイヤーがついてきて、それぞれの出典が明記されています。ブラウザで登録なしに使え、リンク一つで見ているものをそのまま開き直せます。',
      long: 'IntMap は無料の地球の時空間アトラスです。いまの世界と、どの日付の世界も、一枚の地図で見られます。いまの地図には、地震・雨雲レーダー・航空機・気象警報のライブと、起きた場所に置いたニュースが載ります。時計を{floorBC}からのどこへ動かしても、地図がついてきます。国境は、{csFrom}〜{csTo}年の CShapes 2.0 と {ohmFrom}〜{ohmTo}年の OpenHistoricalMap（どちらも日単位）、それらが述べない土地に Seshat Global History Databank の Cliopatria（{clioFromBC}から・年単位）、どれも述べない土地に{snapshots}枚の歴史スナップショットを重ねたものです。記録が届くところでは、都市のラベルがその年の名前になり、地方区分も当時の形で描かれ、両大戦は日ごとに追えます。同じ地図に気候・災害・人口・経済・インフラ・リアルタイムの{layers}のレイヤーが重なり、すべてが出典を明記しています。選んだ日付を出典が述べていないレイヤーは、そもそも描きません。リンク一つで同じ場所・日付・レイヤーをどの端末でも開け、それを使った授業の組み立て方を「先生へ」のページにまとめています。ログインすれば、AI アシスタントの Atlas が地図の上で答えます。広告も有料プランもなく、寄付で運営しています。',
    },
  },
};
