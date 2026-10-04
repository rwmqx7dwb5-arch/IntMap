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
 *    · docs/marketing/press-kit.md and docs/marketing/launch-posts.md (the launch material).
 *
 *  ══ WHY «EVERY YEAR OF THE WORLD» AND NOT «ASK THE MAP» ═══════════════════════════════════════════
 *  The positioning has to be true for the first visit, and the first visit has no account: the map,
 *  every layer and the clock are open to everyone; Atlas needs a sign-in and has a daily limit. So the
 *  promise is the thing nobody has to sign up for and nothing else on the web does the same way —
 *  one clock for the whole map, from {floorBC} to today, every source named — and Atlas is the
 *  proof point for those who stay, not the headline. The landing page (scripts/landing-text.mjs)
 *  already made that choice; tests/marketing-engine-checks.test.mjs holds its headline to TAGLINE so
 *  the two cannot part again.
 *
 *  ⚠ EVERY CLAIM IS ABOUT SOMETHING THAT EXISTS TODAY (PRODUCT.md §2.1-3, 「表示は正直」). A NUMBER is
 *  never typed here: {floorBC}, {layers}, {snapshots}, {ohmFrom} … are filled by scripts/brand.mjs from
 *  the files that own them (the same facts scripts/landing.mjs reads). IntMap-authored text is en + jp
 *  (CONSTITUTION.md §7); `jp` is the app's spelling of Japanese. «IntMap» is a wordmark and is never
 *  translated; «Atlas» is the assistant's own name and is not translated either.
 * ==========================================================================*/

export const BRAND = {
  en: {
    tagline: 'Every year of the world, on one map.',
    title: 'IntMap — Every year of the world, on one map',
    /* the search result's line: what it is, the range, what is on it, why trust it, what it costs */
    description: 'A free world map you can set to any date from {floorBC} to today — historical borders, climate, population and live data on one map, every source named. No sign-up.',
    /* the card a shared link unfolds into */
    /* what the social picture (og-image.jpg) shows — a screenshot of the app, described as it is */
    imageAlt: 'IntMap showing Europe with sea-surface temperature, submarine cables and rain radar, beside the Countries, Layers and Atlas panels',
    social: 'Set the clock anywhere from {floorBC} to today and the borders, figures and layers follow. {layers} layers, every source named, free and with no sign-up — and, signed in, Atlas drives the map from plain words.',
    positioning: {
      for: 'People who want to see where and when things happened — history and geography learners and teachers, map lovers, and anyone following the news.',
      is: 'IntMap is a free world map with one clock for everything on it.',
      that: 'Set it to any date from {floorBC} to today and every border, figure and layer follows, with the source of each named. It opens in a browser, with nothing to install and no account.',
      unlike: 'Unlike printed atlases and static historical maps, which show one moment someone chose for you, and unlike GIS tools, which expect you to bring and prepare the data yourself.',
    },
    proof: [
      'Borders for every year, layered by precision: CShapes 2.0 day by day from {csFrom} to {csTo}, OpenHistoricalMap from {ohmFrom} to {ohmTo}, Cliopatria from the Seshat Global History Databank year by year from {clioFromBC} where those are silent, and {snapshots} historical snapshots where none of them speaks.',
      '{layers} layers — climate, hazards, population, economy, infrastructure, live feeds — each with its source and licence on the Data sources page. A layer whose source does not describe the chosen date is not drawn.',
      'One link reopens the same place, date and layers on any device; the same map can be embedded on another site.',
      'Atlas, IntMap’s AI assistant, operates the map from plain language for signed-in users, within a daily limit per account.',
      'Free, with no ads and no paid plan; running costs are covered by donations. The interface is in {langs} languages.',
    ],
    pitch: {
      short: 'A free world map you can set to any year from {floorBC} to today.',
      medium: 'IntMap is a free world map with one clock for everything on it. Set it to any date from {floorBC} to today and the borders, figures and {layers} layers follow, each with its source named. It runs in a browser with no sign-up, and one link reopens exactly what you see.',
      long: 'IntMap is a free world map with one clock for everything on it. Move the clock anywhere from {floorBC} to today and the map moves with it: country borders day by day from CShapes 2.0 ({csFrom}–{csTo}) and OpenHistoricalMap ({ohmFrom}–{ohmTo}), year by year from Cliopatria (Seshat Global History Databank, from {clioFromBC}) where those are silent, and from {snapshots} historical snapshots where none of them speaks. On the same map sit {layers} layers — climate, hazards, population, economy, infrastructure and live feeds — and every one names its source; a layer whose source does not describe the chosen date is simply not drawn. A link reopens the same place, date and layers on any device, and the page for teachers shows how to build a lesson on that. Signed in, Atlas, IntMap’s AI assistant, operates the map from plain language. IntMap has no ads and no paid plan and is kept running by donations.',
    },
  },
  jp: {
    tagline: '世界のどの年も、一枚の地図で。',
    title: 'IntMap — 世界のどの年も、一枚の地図で',
    description: '{floorBC}から今日まで、どの日付にも合わせられる無料の世界地図。歴史上の国境・気候・人口・リアルタイムのデータを一枚に重ね、すべての出典を明記。登録不要。',
    imageAlt: '海面水温・海底ケーブル・雨雲レーダーを重ねたヨーロッパの地図と、国・レイヤー・Atlas のパネルを開いた IntMap の画面',
    social: '時計を{floorBC}から今日までのどこに合わせても、国境も数字もレイヤーもついてきます。{layers}のレイヤーすべてに出典を明記。無料・登録不要。ログインすれば、Atlas が言葉どおりに地図を動かします。',
    positioning: {
      for: 'いつ・どこで起きたことかを自分の目で確かめたい人——歴史や地理を学ぶ人と教える人、地図が好きな人、ニュースを追う人。',
      is: 'IntMap は、地図の上のすべてに一つの時計を持つ無料の世界地図です。',
      that: '{floorBC}から今日までのどの日付に合わせても、国境・数字・レイヤーがすべてついてきて、それぞれの出典が明記されています。ブラウザで開くだけで、インストールもアカウントも要りません。',
      unlike: '誰かが選んだ一瞬だけを見せる地図帳や静的な歴史地図とも、データを自分で用意することが前提の GIS とも違います。',
    },
    proof: [
      'すべての年の国境を精度の順に重ねて：{csFrom}〜{csTo}年は CShapes 2.0、{ohmFrom}〜{ohmTo}年は OpenHistoricalMap（どちらも日単位）、それらが述べない土地に Seshat Global History Databank の Cliopatria（{clioFromBC}から・年単位）、どれも述べない土地に{snapshots}枚の歴史スナップショット。',
      '気候・災害・人口・経済・インフラ・リアルタイムの{layers}のレイヤー。すべての出典とライセンスを「データの出典」ページに載せています。選んだ日付を出典が述べていないレイヤーは描きません。',
      'リンク一つで、同じ場所・日付・レイヤーをどの端末でも開き直せます。同じ地図を他のサイトに埋め込むこともできます。',
      'IntMap の AI アシスタント Atlas が、ログインした人の言葉どおりに地図を操作します（アカウントごとに一日の上限あり）。',
      '広告なし・有料プランなしの無料。運営費は寄付で賄っています。画面は{langs}言語に対応。',
    ],
    pitch: {
      short: '{floorBC}から今日まで、どの年にも合わせられる無料の世界地図。',
      medium: 'IntMap は、地図の上のすべてに一つの時計を持つ無料の世界地図です。{floorBC}から今日までのどの日付に合わせても、国境・数字・{layers}のレイヤーがついてきて、それぞれの出典が明記されています。ブラウザで登録なしに使え、リンク一つで見ているものをそのまま開き直せます。',
      long: 'IntMap は、地図の上のすべてに一つの時計を持つ無料の世界地図です。時計を{floorBC}から今日までのどこへ動かしても、地図がついてきます。国境は、{csFrom}〜{csTo}年の CShapes 2.0 と {ohmFrom}〜{ohmTo}年の OpenHistoricalMap（どちらも日単位）、それらが述べない土地に Seshat Global History Databank の Cliopatria（{clioFromBC}から・年単位）、どれも述べない土地に{snapshots}枚の歴史スナップショットを重ねたものです。同じ地図に気候・災害・人口・経済・インフラ・リアルタイムの{layers}のレイヤーが重なり、すべてが出典を明記しています。選んだ日付を出典が述べていないレイヤーは、そもそも描きません。リンク一つで同じ場所・日付・レイヤーをどの端末でも開け、それを使った授業の組み立て方を「先生へ」のページにまとめています。ログインすれば、AI アシスタントの Atlas が言葉どおりに地図を操作します。広告も有料プランもなく、寄付で運営しています。',
    },
  },
};
