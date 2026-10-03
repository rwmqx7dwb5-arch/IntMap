/* ============================================================================
 *  IntMap · the landing and teacher pages — THE WORDS   (scripts/landing-text.mjs)
 * ----------------------------------------------------------------------------
 *  The only copy of the prose on about.html / teachers.html — and (showcase-gallery) the two pages by use,
 *  news-map.html and embed-map.html — and their ja/ twins. Those files
 *  are GENERATED from this one by `node scripts/landing.mjs --write` (and held to it by `--check`),
 *  so a sentence is edited here and nowhere else. The example maps' own titles and questions are
 *  not here — they are js/showcase.js, which the app and Atlas read too.
 *
 *  ⚠ EVERY CLAIM IS ABOUT SOMETHING THAT EXISTS TODAY. 「表示は正直」(PRODUCT.md §2.1-3) applies
 *  to what IntMap says about itself as much as to what its map draws. Features still being built
 *  are not mentioned. A NUMBER is never typed here: `{floorBC}`, `{snapshots}`, `{ohmFrom}` … are
 *  filled by scripts/landing.mjs from the files that own them (js/hist-scale.js, data/hist-eras.js,
 *  js/time-borders.js, js/layers/), so the page cannot drift from the app.
 *
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7); `jp` is the app's spelling of Japanese.
 *  tests/landing-showcase-checks.test.mjs holds the two languages to the same set of keys.
 *  Plain text only: the generator escapes every string. Links are structured, never inline HTML.
 * ==========================================================================*/

export const TEXT = {
  en: {
    nav: { examples: 'Examples', teachers: 'For teachers', about: 'About', news: 'News on a map', embed: 'Embed a map', developers: 'Developers', history: 'Browse by year', open: 'Open the map', lang: '日本語', langLabel: 'Read this page in Japanese' },
    about: {
      title: 'IntMap — every year of the world, on one map',
      description: 'A free world map you can set to any date from {floorBC} to today, with historical borders, climate, population and live data on one map. No sign-up needed.',
      hero: {
        h1: 'Every year of the world, on one map.',
        sub: 'IntMap is a free world map you can set to any date from {floorBC} to today. Borders, figures and layers follow the clock, and the sources behind them are named.',
        ctaOpen: 'Open the map',
        ctaExamples: 'See the examples',
        note: 'Free. No account needed to use the map.',
        imgAlt: 'IntMap showing Europe on 27 June 1914, with the countries panel listing that year’s economies',
      },
      why: {
        h2: 'What makes it different',
        items: [
          { h: 'One clock for the whole map', p: 'Move the clock and the map moves with it: country borders from {snapshots} historical snapshots before {ohmFrom}, from OpenHistoricalMap from {ohmFrom} to {ohmTo}, and day by day from CShapes 2.0 from {csFrom} to {csTo} — and the countries panel shows the figures for that year where its source has them.' },
          { h: 'Honest about what it knows', p: 'IntMap has {layers} layers, and the Data sources page names every organisation whose data they show. Set the clock to a date a source does not describe and that layer is not drawn — the map tells you so, instead of showing today’s data under an old date.' },
          { h: 'Ask the map in words', p: 'Signed in, you can ask Atlas, IntMap’s AI assistant, in plain language. It answers on the map itself — turning layers on, moving the camera and the clock.' },
        ],
      },
      who: {
        h2: 'Who it is for',
        curious: { h: 'For map and history lovers', p: 'Open a year, compare it with another, and share exactly what you see with one link. Every example below opens in one tap, just as pictured.', cta: 'Browse the examples' },
        teachers: { h: 'For teachers', p: 'Nothing to install and no sign-up for students: a link opens the same map on every device in the room. Each example comes with a question for class.', cta: 'Teaching with IntMap' },
      },
      /* (showcase-gallery) the two pages by use, linked from here and linking back */
      uses: {
        h2: 'Use it for',
        news: { h: 'Reading the news', p: 'Each news event is a pin where it happened, with what each outlet reported — and the map around it.', cta: 'Read the news on a map' },
        embed: { h: 'Writing an article', p: 'Put a live map in a blog post or article with one line of HTML: your view, layers and date, with every data credit.', cta: 'Embed a map' },
        history: { h: 'Looking up a year', p: 'Pick a region and a date and see the names IntMap’s historical map draws there, with the source of every border. Each page opens the map at that place and date.', cta: 'Browse the historical maps by year' },
      },
      examples: { h2: 'Examples', sub: 'Each picture is a screenshot of IntMap. The link opens the same view, date and layers.', open: 'Open this map' },
      support: { h2: 'Support IntMap', p: 'IntMap is free and has no paid plan. Running it is paid for by donations — if it is useful to you, you can help keep it that way.', cta: 'Donate' },
      faq: {
        h2: 'Questions',
        items: [
          { q: 'Is IntMap free?', a: 'Yes. The map, every layer and the clock are free to use. Running costs are covered by donations.' },
          { q: 'Do I need an account?', a: 'No. Everything on the map works without one. Signing in adds Atlas, the AI assistant (with a daily limit per account), and keeps your settings in sync.' },
          { q: 'Where does the data come from?', a: 'From the organisations that publish it — weather services, NASA, UN bodies, universities, OpenStreetMap and historical-map projects. Every one is listed with its licence on the Data sources page.', link: { href: 'sources.html', label: 'Data sources' } },
          { q: 'How are the calculations done?', a: 'What each feature and simulation computes, and under which assumptions, is written out on the Science & logic page.', link: { href: 'science.html', label: 'Science & logic' } },
          { q: 'What about my privacy?', a: 'You can use the map without an account. What is stored when you sign in, and which services your browser contacts, is set out in the Privacy Policy.', link: { href: 'privacy.html', label: 'Privacy Policy' } },
          { q: 'Can I share a map?', a: 'Yes. The Share button gives a link that reopens the same position, zoom, base map, layers and date.' },
        ],
      },
    },
    teachers: {
      title: 'Teaching with IntMap — a free map for history and geography lessons',
      description: 'Plan a lesson with IntMap: example maps from {floorBC} to today, each with a question for class. Free, nothing to install, no student accounts.',
      hero: {
        h1: 'A map for the lesson, in one link.',
        sub: 'Students open the link on any device with a web browser and see exactly the map you chose — the same place, date and layers. No installation, no student accounts.',
        ctaPlan: 'A lesson in five steps',
        ctaExamples: 'Examples for class',
        ctaTours: 'Classroom tours',
        ctaBuild: 'Make your own tour',
      },
      plan: {
        h2: 'A 50-minute lesson in five steps',
        sub: 'Built on two examples, “Europe on 27 June 1914” and “Europe on 1 July 1920”. Any pair of examples works the same way.',
        steps: [
          { h: 'Before class (5 min)', p: 'Open the first example on the classroom screen and check that it loads. Copy its link for the students.' },
          { h: 'Introduce (10 min)', p: 'Show Europe on 27 June 1914 and read the question under it together.' },
          { h: 'Explore in pairs (15 min)', p: 'Students open both examples on their own devices and list what changed between 1914 and 1920.' },
          { h: 'Discuss (15 min)', p: 'Collect the changes. Which empires lost land, and which states appeared?' },
          { h: 'Wrap up (5 min)', p: 'Each pair moves the clock (the button at the bottom right of the map) to a year of its choice and reports one change. The Share button turns their view into a link you can collect.' },
        ],
        note: 'Nothing in this lesson needs an account. A teacher who signs in can also ask Atlas questions in words; Atlas has a daily limit per account.',
      },
      tours: {
        h2: 'Classroom tours',
        sub: 'A tour is a short lesson already laid out: a few maps in order, each with sentences to read out and a question for the class. It opens full screen in the map — large type for a projector, everything else put away — and you move through it with Next and Previous.',
        start: 'Start the tour',
        note: 'Move with the arrow keys, Space or a presentation clicker (Page Up / Page Down); F switches to full screen, T hides the text, Esc leaves the tour. The address bar always holds a link to the step on screen, so you can hand that one step to the students. No account is needed.',
      },
      build: {
        h2: 'Make a tour of your own',
        sub: 'The tours above are ours. The tour builder is for the lesson you teach: you set the map up, add it as a step, write what to say, and the whole tour becomes one link. No account is needed, and nothing is stored on a server.',
        steps: [
          { h: 'Open the tour builder', p: 'In the map, open Settings, then “About & support”, then “Classroom tours”, and choose “Make your own tour”. Atlas can open it too, if you ask for it in words.' },
          { h: 'Add the map as a step', p: 'Set up the place, date, layers and comparison for your first step and press “Add this map as a step”. A step is the map exactly as it was when you added it, the same thing the Share button records.' },
          { h: 'Write what to say', p: 'Give each step a title, the words to read out and, if you like, a question for the class. You can move steps up and down, replace a step’s map, delete a step, and preview the tour from any step.' },
          { h: 'Hand out the link', p: 'Copy the link, or use Share on a device that offers it. Anyone who opens it gets your tour in the same classroom mode as the tours above.' },
        ],
        link: { h: 'The tour is its link', p: 'Your tour is written into the link itself, so there is nothing to upload and no account to give students. The link has a length the site can serve, and the builder shows how much of it your tour uses and warns before a step would not fit; it does not hand out a link the site would refuse.' },
        draft: { h: 'Your draft stays in your browser', p: 'While you write, the draft is kept in this browser, so a reload does not lose it. It is not sent anywhere until you share the link. When you open a tour that someone shared, “Edit this tour” opens it in the builder.' },
        use: { h: 'In a lesson', p: 'Put the link on the classroom screen or in your class materials. Students move through it with Next and Previous on their own devices, and the address bar always holds a link to the step on screen. To change the tour, edit it and share the new link; links already handed out keep showing the tour they were made from.' },
      },
      examples: { h2: 'Examples for class', question: 'Question for class', open: 'Open this map', fits: 'Fits' },
      curriculum: {
        h2: 'Where the examples fit Japan’s high-school course',
        sub: 'For teachers in Japan: the 2018 Course of Study for upper secondary school made Geography (地理総合) and History (歴史総合) compulsory for every student. The headings below are quoted from it; which example fits which heading is IntMap’s own suggestion, not an official one.',
        colItem: 'Section of the Course of Study',
        colExamples: 'Examples',
        source: 'Source: Ministry of Education, Culture, Sports, Science and Technology, “高等学校学習指導要領（平成30年告示）”, read on 1 October 2026.',
        sourceLabel: 'The Course of Study (PDF, mext.go.jp)',
      },
      trust: {
        h2: 'Sources and reliability',
        items: [
          { h: 'Every provider is named', p: 'The Data sources page lists every organisation whose data the map shows, with its licence.', link: { href: 'sources.html', label: 'Data sources' } },
          { h: 'Past dates are drawn only from what describes them', p: 'Set the clock to a date and a layer whose source does not describe that date is not drawn. The map lists what it is leaving out, so students are never shown today’s data under an old date.' },
          { h: 'Where the borders come from', p: 'Before {ohmFrom}: {snapshots} snapshots from the historical-basemaps project, each one a single year, so a border between two snapshots is an approximation. {ohmFrom}–{ohmTo}: OpenHistoricalMap. {csFrom}–{csTo}: CShapes 2.0, day by day. The base map’s coastlines are today’s.' },
          { h: 'How the numbers are worked out', p: 'Every calculation and simulation, with its assumptions, is explained on the Science & logic page.', link: { href: 'science.html', label: 'Science & logic' } },
        ],
      },
    },
    /* (showcase-gallery) news-map.html — for a general reader of the news. Every sentence is about what the News tab
       does today (PRODUCT.md §3.1 «出来事単位のニュース» / «ライブニュースマップ»); nothing that is being built. */
    news: {
      title: 'Read the news on a map — IntMap',
      description: 'See where each news event happened and what each outlet reported, with the map around it — borders, people, climate and history — on one free world map.',
      hero: {
        h1: 'Read the news on a map.',
        sub: 'IntMap puts each news event where it happened — one pin per event, not one per article — and lets you lay the world around it: borders, people, climate and history.',
        ctaOpen: 'Open the map',
        ctaContext: 'Maps for context',
        note: 'Headlines and summaries are in English. Free, and no account is needed to read them.',
      },
      how: {
        h2: 'How it works',
        items: [
          { h: 'One pin per event', p: 'Articles that report the same event are gathered into one event, and the map shows one pin where it happened — down to a city, a port or a border crossing — for news from the last 72 hours.' },
          { h: 'What each outlet said', p: 'Open an event to read what happened in the words each outlet published, line by line with its name, with the key figures and where the reports agree and differ. IntMap does not say which outlet is right.' },
          { h: 'The map around it', p: 'Turn on layers to see what surrounds the place — where people live, borders, climate, cables, railways — and move the clock to see how the borders stood in another year.' },
          { h: 'Ask Atlas about it', p: 'Signed in, press «Ask Atlas» on an event: Atlas opens on that event, suggests questions about it and answers on the map itself.' },
        ],
      },
      context: { h2: 'Maps for context', sub: 'Ready-made maps of the world behind the headlines. Each picture is a screenshot of IntMap, and each opens as pictured.' },
      share: { h2: 'Share what you see', p: 'The Share button gives a link that reopens the same view, layers and date — or the code to put the map in your own article.', cta: 'Embed a map in an article' },
    },
    /* (showcase-gallery) embed-map.html — for a writer. What an embed shows and does is js/embed-mode.js's header,
       and the sizes and the code on the page are that file's own (EMBED_SIZES, embedUrl, iframeCode). */
    embed: {
      title: 'Embed a live map in your article — IntMap',
      description: 'Put an IntMap map in a blog post or article with one line of HTML: the view, layers and date you chose, with its legends and every data credit. Free.',
      hero: {
        h1: 'Put a live map in your article.',
        sub: 'Set up a map in IntMap, copy one line of HTML from Share, Embed, and paste it into your page. Your readers get the same view, layers and date — a map, not a screenshot.',
        ctaOpen: 'Open the map to make one',
        ctaCode: 'See the code',
        note: 'Free. No account is needed to make or to show an embedded map.',
      },
      steps: {
        h2: 'Three steps',
        items: [
          { h: 'Set up the map', p: 'Go to the place, turn on the layers and set the clock to the date you are writing about.' },
          { h: 'Share, then Embed', p: 'Press Share and choose the Embed tab. Pick one of its sizes, choose whether readers may pan and zoom, and copy the code.' },
          { h: 'Paste it into your page', p: 'The code is a standard iframe element. Paste it wherever your editor accepts HTML.' },
        ],
      },
      code: {
        h2: 'The code',
        sub: 'This is the code IntMap writes for the map pictured below, at the medium size:',
        sizes: 'The sizes the Embed tab offers, in pixels (width × height):',
        still: 'With interactive=0 added to the address, the frame is a still map that cannot be panned or zoomed:',
        imgAlt: 'The map the code above shows',
      },
      shows: {
        h2: 'What your readers see',
        items: [
          { h: 'The map as you set it', p: 'The same view, layers and date, with their legends and the date on the clock. A map set to a date stays at that date; a map set to now shows the data that is current when it is read.' },
          { h: 'Every data credit', p: 'The credits each data source asks for stay visible in the frame. In a narrow frame they wrap onto more lines rather than being cut off.' },
          { h: 'A way to the full map', p: 'A link in the frame opens the same view in IntMap, where the reader can explore further.' },
          { h: 'Nothing else', p: 'The frame is read-only: no panels, no search, no sign-in and no pop-ups — only the map, which readers may pan and zoom unless you turned that off.' },
        ],
      },
    },
    /* (developer-embed) developers.html — for a developer, a teacher building course material, a newsroom's interactive
       desk. The protocol tables, the code and the catalogue are not written here: js/embed-client.js PROTOCOL,
       scripts/landing.mjs (the code, from the hero example's captured link) and scripts/public-api.mjs (the catalogue,
       filled into the built page from the governance ledger). */
    developers: {
      title: 'Build on IntMap — embed API and open data',
      description: 'Steer an embedded IntMap map from your own page — set the date, move the camera, follow the reader — and take the open data it is built from, each dataset with the licence its source states.',
      hero: {
        h1: 'Build on the map.',
        sub: 'Put a map in your page that your page can steer, and take the data IntMap is built from — each dataset with the licence its source states and what that licence asks of you.',
        ctaEmbed: 'Steer an embed',
        ctaData: 'Open data',
        note: 'Free. No account and no key: the API is plain files on the same site as the map.',
      },
      api: {
        h2: 'Steer an embedded map',
        sub: 'Import the client and mount a map. Your page can then move it to a date or a place, show any share link, and hear where the reader has taken it.',
        commands: 'What your page can send',
        events: 'What the map tells your page',
        col: { name: 'Message', args: 'Fields', does: 'What it does' },
        /* what each message of js/embed-client.js PROTOCOL does — keyed by its name (commands, then events) */
        does: {
          commands: {
            get: 'Reply with the state the frame is in now.',
            state: 'Show the map a share-link fragment (#v=…) describes — layers, clock, comparison, caption and all.',
            view: 'Move the camera; everything else stays.',
            time: 'Set the clock to a date, or to 1 July of a year (astronomical numbering: 0 is 1 BC, -499 is 500 BC), or back to now.',
          },
          events: {
            ready: 'The frame has applied the link it was opened with. Sent once.',
            state: 'The map changed. cause says whether the reader moved it (reader) or a link or command did (restore).',
            reply: 'The answer to a command that carried an id.',
          },
        },
        raw: 'The client is a convenience. The protocol is plain postMessage, so a page can also speak it directly:',
        safe: 'A command can only change what the frame shows, exactly as a share link can. The frame reports the map’s state — the same link its own “Open in IntMap” button carries — and nothing about the reader, and only to the page that framed it.',
      },
      data: {
        h2: 'Open data',
        sub: 'The datasets the map draws, as files you can download, with no key and no rate limit beyond the web host’s. Every address below is a JSON file.',
        endpoints: [
          { path: 'catalog.json', p: 'Every dataset offered for reuse: its files, its size, its licence as its source states it, what that licence requires, the credit to show — and every dataset not offered, with the reason.' },
          { path: 'countries.json', p: 'The countries (Natural Earth codes, with English and Japanese names), and which datasets say something about each.' },
          { path: 'countries/JPN.json', p: 'One country: the row every per-country dataset has for it, each with its own dataset’s terms.' },
          { path: 'embed.json', p: 'The embed address and the message protocol above, as data.' },
        ],
        rule: 'A dataset is offered only when every source it comes from states a licence that permits redistribution. One that states none, or states terms that are not known to, is listed as not offered rather than offered quietly. Where a dataset combines sources, the strictest condition applies to the whole file.',
        table: 'The datasets, as this build of the site offers them',
      },
      terms: {
        h2: 'What you agree to when you reuse',
        items: [
          { h: 'Show the credit', p: 'When a dataset’s terms require credit, show the credit line the catalogue gives for it wherever you show the data.' },
          { h: 'Share-alike', p: 'A dataset under ODbL or a share-alike Creative Commons licence must stay under that licence when you publish it or something built from it.' },
          { h: 'Non-commercial', p: 'Datasets marked non-commercial may not be reused for commercial purposes. IntMap’s own files are under IntMap’s licence (personal, research and educational use).' },
          { h: 'IntMap’s code', p: 'The embed client is part of IntMap and under IntMap’s licence. The message protocol is documented on this page, so you can also speak it with your own code.' },
        ],
      },
    },
    footer: { sources: 'Data sources', science: 'Science & logic', privacy: 'Privacy Policy', terms: 'Terms of Service' },
  },

  jp: {
    nav: { examples: '見本', teachers: '先生へ', about: 'IntMap について', news: 'ニュースを地図で', embed: '地図を埋め込む', developers: '開発者向け', history: '年代から探す', open: '地図を開く', lang: 'English', langLabel: 'このページを英語で読む' },
    about: {
      title: 'IntMap — 世界のどの年も、一枚の地図で',
      description: '{floorBC}から今日まで、どの日付にも合わせられる無料の世界地図。歴史上の国境・気候・人口・リアルタイムのデータを一枚に重ねます。登録不要。',
      hero: {
        h1: '世界のどの年も、一枚の地図で。',
        sub: 'IntMap は、{floorBC}から今日までのどの日付にも合わせられる無料の世界地図です。国境も数字もレイヤーも時計に合わせて変わり、その出典を明記しています。',
        ctaOpen: '地図を開く',
        ctaExamples: '見本を見る',
        note: '無料。地図を使うのにアカウントは要りません。',
        imgAlt: '1914年6月27日のヨーロッパを表示した IntMap。国の一覧にはその年の経済規模が並ぶ',
      },
      why: {
        h2: 'ほかの地図と違うところ',
        items: [
          { h: '地図全体に、ひとつの時計', p: '時計を動かすと地図全体が動きます。国境は{ohmFrom}年より前が{snapshots}枚の歴史スナップショット、{ohmFrom}〜{ohmTo}年が OpenHistoricalMap、{csFrom}〜{csTo}年が CShapes 2.0 の日単位の記録。国の一覧も、出典に数字がある年はその年の数字を示します。' },
          { h: '知っていることだけを描く', p: 'IntMap には{layers}のレイヤーがあり、そのデータを公開しているすべての組織を「データの出典」ページに載せています。出典がその日付を述べていないレイヤーは描かず、描いていないことを地図が伝えます。古い日付の下に今日のデータを見せることはしません。' },
          { h: '言葉で地図に訊く', p: 'ログインすると、IntMap の AI アシスタント Atlas にふつうの言葉で質問できます。Atlas は地図そのもので答えます——レイヤーを点け、視点と時計を動かして。' },
        ],
      },
      who: {
        h2: 'こんな方に',
        curious: { h: '地図と歴史が好きなあなたへ', p: 'ある年を開き、別の年と比べ、見ているものをそのままリンク1つで共有できます。下の見本は、どれも写真のとおりにワンタップで開きます。', cta: '見本を見る' },
        teachers: { h: '先生へ', p: 'インストール不要、生徒のアカウント登録も不要。リンク1つで、教室のどの端末にも同じ地図が開きます。見本には授業で使える問いを添えています。', cta: '授業での使い方' },
      },
      uses: {
        h2: 'こんな使い方も',
        news: { h: 'ニュースを読む', p: 'ニュースの出来事が、起きた場所にピンで立ちます。各媒体が何と報じたか、そしてその周りの地図と一緒に読めます。', cta: 'ニュースを地図で読む' },
        embed: { h: '記事を書く', p: 'HTML 1行で、ブログや記事に動く地図を載せられます。あなたが選んだ視点・レイヤー・日付と、すべてのデータの出典表記がそのまま入ります。', cta: '地図を埋め込む' },
        history: { h: '年代から探す', p: '地域と日付を選ぶと、IntMap の歴史地図がその場所に描く名前の一覧が、国境ごとの出典つきで見られます。どのページからも、その場所と日付で地図が開きます。', cta: '歴史地図を年代から探す' },
      },
      examples: { h2: '見本', sub: '写真はすべて IntMap の画面です。リンクを開くと、同じ視点・日付・レイヤーで地図が開きます。', open: 'この地図を開く' },
      support: { h2: 'IntMap を支援する', p: 'IntMap は無料で、有料プランはありません。運営費は寄付でまかなっています。役に立ったら、無料のままであり続けるための支援をお願いします。', cta: '寄付する' },
      faq: {
        h2: 'よくある質問',
        items: [
          { q: 'IntMap は無料ですか？', a: 'はい。地図、すべてのレイヤー、時計は無料で使えます。運営費は寄付でまかなっています。' },
          { q: 'アカウントは必要ですか？', a: 'いいえ。地図の機能はすべてアカウントなしで使えます。ログインすると AI アシスタントの Atlas（アカウントごとに1日の上限あり）が使え、設定が同期されます。' },
          { q: 'データはどこから来ていますか？', a: '気象機関、NASA、国連機関、大学、OpenStreetMap、歴史地図のプロジェクトなど、データを公開している組織からです。すべての提供元をライセンスとともに「データの出典」ページに載せています。', link: { href: 'sources.html', label: 'データの出典' } },
          { q: '計算はどのように行っていますか？', a: '各機能とシミュレーションが何をどのような前提で計算しているかを「科学的根拠とロジック」ページで説明しています。', link: { href: 'science.html', label: '科学的根拠とロジック' } },
          { q: 'プライバシーは？', a: '地図はアカウントなしで使えます。ログイン時に何を保存するか、ブラウザがどのサービスに接続するかは、プライバシーポリシーに記載しています。', link: { href: 'privacy.html', label: 'プライバシーポリシー' } },
          { q: '地図を共有できますか？', a: 'はい。「共有」ボタンで、同じ位置・ズーム・ベースマップ・レイヤー・日付を開くリンクが作れます。' },
        ],
      },
    },
    teachers: {
      title: '授業での IntMap — 歴史と地理の授業のための無料の地図',
      description: 'IntMap で授業を組む：{floorBC}から今日までの見本の地図と、授業で使える問い。無料、インストール不要、生徒のアカウント不要。',
      hero: {
        h1: '授業の地図を、リンク1つで。',
        sub: '生徒はブラウザのある端末でリンクを開くだけで、先生が選んだ地図——同じ場所・日付・レイヤー——をそのまま見られます。インストールも、生徒のアカウントも要りません。',
        ctaPlan: '5つのステップで1コマ',
        ctaExamples: '授業で使える見本',
        ctaTours: '授業ツアー',
        ctaBuild: '自分のツアーを作る',
      },
      plan: {
        h2: '50分の授業を5つのステップで',
        sub: '「1914年6月27日のヨーロッパ」と「1920年7月1日のヨーロッパ」の2つの見本を使った例です。ほかの見本の組み合わせでも同じように使えます。',
        steps: [
          { h: '授業の前に（5分）', p: '1つ目の見本を教室の画面で開き、表示されることを確かめます。生徒用にリンクをコピーしておきます。' },
          { h: '導入（10分）', p: '1914年6月27日のヨーロッパを見せ、下に添えた問いを一緒に読みます。' },
          { h: 'ペアで調べる（15分）', p: '生徒は自分の端末で2つの見本を開き、1914年から1920年までに変わったことを書き出します。' },
          { h: '話し合う（15分）', p: '変化を集めます。どの帝国が土地を失い、どの国が現れたでしょうか。' },
          { h: 'まとめ（5分）', p: '各ペアが時計（地図の右下のボタン）を好きな年に動かし、変化を1つ発表します。「共有」ボタンで、その画面をリンクとして集められます。' },
        ],
        note: 'この授業にアカウントは要りません。ログインした先生は Atlas に言葉で質問することもできます（アカウントごとに1日の上限あり）。',
      },
      tours: {
        h2: '授業ツアー',
        sub: 'ツアーは、組み立て済みの短い授業です。いくつかの地図を順に並べ、それぞれに読み上げる文と生徒への問いを添えています。地図の中で全画面に開き——プロジェクターでも読める大きな文字で、ほかの画面要素はしまって——「次へ」「前へ」で進みます。',
        start: 'ツアーを始める',
        note: '矢印キー、スペース、プレゼンテーション用のリモコン（Page Up / Page Down）で進みます。F で全画面、T で文を隠し、Esc でツアーを終えます。アドレスバーには常にいま映しているステップへのリンクが入っているので、そのステップだけを生徒に渡すこともできます。アカウントは要りません。',
      },
      build: {
        h2: '自分のツアーを作る',
        sub: '上のツアーは私たちが作ったものです。ツアー作成は、あなたが教える授業のためのものです。地図を整えてステップとして加え、語りを書くと、ツアー全体が 1 本のリンクになります。アカウントは要らず、サーバには何も保存されません。',
        steps: [
          { h: 'ツアー作成を開く', p: '地図で「設定」の「情報とサポート」から「授業ツアー」を開き、「自分のツアーを作る」を選びます。Atlas に言葉で頼んでも開けます。' },
          { h: '地図をステップとして加える', p: '最初のステップにしたい場所・日付・レイヤー・比較を整えて「いまの地図をステップに追加」を押します。ステップは、加えた時点の地図そのままで、共有ボタンが記録するものと同じです。' },
          { h: '語りを書く', p: '各ステップに、題・読み上げる言葉・（任意で）クラスへの問いを書きます。ステップの上下の入れ替え、地図の差し替え、削除、好きなステップからの試し再生ができます。' },
          { h: 'リンクを配る', p: 'リンクをコピーするか、使える端末では共有を使います。リンクを開いた人は、上のツアーと同じ授業モードであなたのツアーを見られます。' },
        ],
        link: { h: 'ツアーはリンクそのもの', p: 'ツアーはリンクの中に書き込まれるので、アップロードも、生徒に渡すアカウントも要りません。リンクにはサイトが扱える長さがあり、作成画面はツアーがその何割を使っているかを示して、次のステップが入らないときは前もって知らせます。サイトが断る長さのリンクは渡しません。' },
        draft: { h: '下書きはこのブラウザに残る', p: '書いている間の下書きはこのブラウザに保存されるので、再読み込みしても消えません。リンクを共有するまで、どこにも送られません。誰かが共有したツアーを開いたときは、「このツアーを編集」で作成画面に取り込めます。' },
        use: { h: '授業での使い方', p: 'リンクを教室の画面や配布資料に載せます。生徒は自分の端末で「次へ」「前へ」を使って進み、アドレスバーにはいつも表示中のステップへのリンクが入っています。ツアーを直すときは編集して新しいリンクを共有します。すでに配ったリンクは、作ったときのツアーのままです。' },
      },
      examples: { h2: '授業で使える見本', question: '授業での問い', open: 'この地図を開く', fits: '対応' },
      curriculum: {
        h2: '高等学校学習指導要領との対応',
        sub: '平成30年告示の高等学校学習指導要領で、地理総合と歴史総合はすべての生徒が履修する科目になりました。下の見出しは同要領からの引用です。どの見本がどの項目に合うかは IntMap による提案であり、公式のものではありません。',
        colItem: '学習指導要領の項目',
        colExamples: '見本',
        source: '出典：文部科学省「高等学校学習指導要領（平成30年告示）」（2026年10月1日閲覧）',
        sourceLabel: '高等学校学習指導要領（PDF・文部科学省）',
      },
      trust: {
        h2: '出典と信頼性',
        items: [
          { h: 'すべての提供元を明記', p: '「データの出典」ページに、地図が示すデータのすべての提供元をライセンスとともに載せています。', link: { href: 'sources.html', label: 'データの出典' } },
          { h: '過去の日付は、それを述べる記録だけで描く', p: '時計をある日付に合わせると、出典がその日付を述べていないレイヤーは描かれません。描いていないものは地図が一覧で示すので、古い日付の下に今日のデータが出ることはありません。' },
          { h: '国境の出どころ', p: '{ohmFrom}年より前：historical-basemaps プロジェクトの{snapshots}枚のスナップショット。各スナップショットは1つの年のもので、その間の年の国境は近似です。{ohmFrom}〜{ohmTo}年：OpenHistoricalMap。{csFrom}〜{csTo}年：CShapes 2.0（日単位）。ベースマップの海岸線は現在のものです。' },
          { h: '数字の求め方', p: 'すべての計算とシミュレーションを、前提とともに「科学的根拠とロジック」ページで説明しています。', link: { href: 'science.html', label: '科学的根拠とロジック' } },
        ],
      },
    },
    news: {
      title: 'ニュースを地図で読む — IntMap',
      description: 'ニュースの出来事がどこで起きたか、各媒体が何と報じたかを、国境・人口・気候・歴史といった周りの地図と一緒に読める無料の世界地図。',
      hero: {
        h1: 'ニュースを地図で読む。',
        sub: 'IntMap は、ニュースの出来事を起きた場所に置きます。記事1本ごとではなく出来事1件ごとに1本のピン。その周りに国境・人・気候・歴史を重ねられます。',
        ctaOpen: '地図を開く',
        ctaContext: '背景を知る地図',
        note: '見出しと要約は英語です。無料で、読むのにアカウントは要りません。',
      },
      how: {
        h2: 'しくみ',
        items: [
          { h: '1つの出来事に1本のピン', p: '同じ出来事を報じた記事は1つの出来事にまとまり、地図には起きた場所に1本のピンが立ちます。都市・港・国境検問所まで絞り込み、直近72時間のニュースを表示します。' },
          { h: '各媒体が何と書いたか', p: '出来事を開くと、何が起きたかを各媒体が公表した文のまま、1行ごとに媒体名つきで読めます。主要な数字や、報道が一致している点と食い違っている点も並びます。どの媒体が正しいかを IntMap は言いません。' },
          { h: '周りの地図', p: 'レイヤーを点けると、その場所の周り——人の住む場所、国境、気候、海底ケーブル、鉄道——が見えます。時計を動かせば、別の年の国境も見られます。' },
          { h: 'Atlas に訊く', p: 'ログインして出来事の「Atlasに聞く」を押すと、Atlas がその出来事の上に開き、質問を提案し、地図そのもので答えます。' },
        ],
      },
      context: { h2: '背景を知る地図', sub: 'ニュースの背景にある世界を描いた地図です。写真はすべて IntMap の画面で、写真のとおりに開きます。' },
      share: { h2: '見ているものを共有する', p: '「共有」ボタンで、同じ視点・レイヤー・日付を開くリンクや、自分の記事に地図を載せるコードが作れます。', cta: '記事に地図を埋め込む' },
    },
    embed: {
      title: '記事に動く地図を埋め込む — IntMap',
      description: 'HTML 1行で、ブログや記事に IntMap の地図を載せられます。選んだ視点・レイヤー・日付が、凡例とすべてのデータの出典表記とともに入ります。無料。',
      hero: {
        h1: '記事に、動く地図を。',
        sub: 'IntMap で地図を整え、「共有」の「埋め込み」から HTML を1行コピーして、ページに貼るだけ。読者には同じ視点・レイヤー・日付の地図が届きます。スクリーンショットではなく地図そのものです。',
        ctaOpen: '地図を開いて作る',
        ctaCode: 'コードを見る',
        note: '無料。埋め込み地図を作るのにも表示するのにも、アカウントは要りません。',
      },
      steps: {
        h2: '3つの手順',
        items: [
          { h: '地図を整える', p: '場所へ移動し、レイヤーを点け、書いている内容の日付に時計を合わせます。' },
          { h: '「共有」から「埋め込み」へ', p: '「共有」を押して「埋め込み」タブを選びます。大きさと、読者がパン・ズームできるかを選んで、コードをコピーします。' },
          { h: 'ページに貼る', p: 'コードは標準の iframe 要素です。エディタが HTML を受け付けるところに貼ってください。' },
        ],
      },
      code: {
        h2: 'コード',
        sub: '下の写真の地図を中くらいの大きさで埋め込むとき、IntMap が書くコードです。',
        sizes: '「埋め込み」タブで選べる大きさ（ピクセル、幅 × 高さ）:',
        still: 'アドレスに interactive=0 を加えると、パンもズームもできない静止した地図になります。',
        imgAlt: '上のコードが表示する地図',
      },
      shows: {
        h2: '読者に見えるもの',
        items: [
          { h: '整えたとおりの地図', p: '同じ視点・レイヤー・日付と、その凡例、時計の日時。日付に合わせた地図はその日付のまま、「現在」の地図は読まれたときのデータを表示します。' },
          { h: 'すべてのデータの出典表記', p: '各データ提供元が求める出典表記は、フレームの中でも見えたままです。狭いフレームでは切らずに折り返します。' },
          { h: '地図全体への入口', p: 'フレームのリンクから同じ表示を IntMap で開き、さらに調べられます。' },
          { h: 'それ以外は何もない', p: 'フレームは読み取り専用です。パネルも検索もログインもポップアップもなく、あるのは地図だけ。パン・ズームは、オフにしない限り読者ができます。' },
        ],
      },
    },
    developers: {
      title: 'IntMap で作る — 埋め込み API とオープンデータ',
      description: '自分のページから埋め込んだ IntMap の地図を動かし（日付を合わせ、カメラを動かし、読者の操作を受け取る）、地図の元になっているオープンデータを、出典が述べるライセンスつきで取得できます。',
      hero: {
        h1: '地図の上に作る。',
        sub: 'あなたのページから動かせる地図を載せ、IntMap の元になっているデータを持ち出せます。データセットごとに、出典が述べるライセンスと、そのライセンスがあなたに求めることを添えています。',
        ctaEmbed: '埋め込みを動かす',
        ctaData: 'オープンデータ',
        note: '無料。アカウントもキーも不要です。API は地図と同じサイトに置かれたただのファイルです。',
      },
      api: {
        h2: '埋め込んだ地図を動かす',
        sub: 'クライアントを読み込んで地図を置くと、あなたのページから日付や場所へ動かし、任意の共有リンクを表示させ、読者が地図をどこへ動かしたかを受け取れます。',
        commands: 'あなたのページが送れるもの',
        events: '地図があなたのページに伝えるもの',
        col: { name: 'メッセージ', args: '項目', does: 'すること' },
        does: {
          commands: {
            get: 'いまの状態を返す。',
            state: '共有リンクの断片（#v=…）が述べる地図に切り替える——レイヤー・時刻・比較・題を含む全部。',
            view: 'カメラだけを動かす（他はそのまま）。',
            time: '時計をある日付へ、または年の 7 月 1 日へ（天文学的紀年: 0 は紀元前 1 年、-499 は紀元前 500 年）、または「いま」へ戻す。',
          },
          events: {
            ready: '開かれたリンクを適用し終えた。1 回だけ。',
            state: '地図が変わった。cause は読者が動かした（reader）か、リンクや命令が変えた（restore）か。',
            reply: 'id を付けた命令への返事。',
          },
        },
        raw: 'クライアントは便利のためのものです。中身は素の postMessage なので、ページから直接話すこともできます。',
        safe: '命令が変えられるのは枠の中に何を映すかだけで、共有リンクにできることと同じです。枠が伝えるのは地図の状態（枠自身の「IntMap で開く」と同じリンク）だけで、読者についての情報は含まず、送り先は枠を置いたページだけです。',
      },
      data: {
        h2: 'オープンデータ',
        sub: '地図が描いているデータセットを、ダウンロードできるファイルとして。キーは不要で、ウェブのホストの制限のほかに回数制限はありません。下のアドレスはどれも JSON ファイルです。',
        endpoints: [
          { path: 'catalog.json', p: '再利用できるデータセットの全部——ファイル・大きさ・出典が述べるとおりのライセンス・そのライセンスが求めること・表示する出典——と、出していないデータセットとその理由。' },
          { path: 'countries.json', p: '国の一覧（Natural Earth のコード、英語と日本語の名前）と、それぞれの国について何かを述べているデータセット。' },
          { path: 'countries/JPN.json', p: '1 か国ぶん。国ごとのデータセットがその国について持つ行を全部、それぞれのデータセットの条件つきで。' },
          { path: 'embed.json', p: '埋め込みのアドレスと、上のメッセージの約束事を、データとして。' },
        ],
        rule: 'データセットを出すのは、元になっている出典のすべてが再配布を許すライセンスを述べているときだけです。何も述べていないもの、再配布を許すと確認できない条件を述べているものは、黙って出さずに「出していないもの」として理由とともに載せます。複数の出典を合わせたデータセットには、いちばん厳しい条件がファイル全体にかかります。',
        table: 'このビルドのサイトが出しているデータセット',
      },
      terms: {
        h2: '再利用するときに守ること',
        items: [
          { h: '出典を表示する', p: '出典の表示を条件とするデータセットは、データを見せる場所に、カタログが示す出典の行を表示してください。' },
          { h: '継承', p: 'ODbL や継承条件つきのクリエイティブ・コモンズのデータセットは、それ（またはそれから作ったもの）を公開するときも同じライセンスのままにしてください。' },
          { h: '非営利', p: '非営利と記したデータセットは営利目的に再利用できません。IntMap 自身のファイルは IntMap のライセンス（個人・研究・教育での利用）に従います。' },
          { h: 'IntMap のコード', p: '埋め込みクライアントは IntMap の一部で、IntMap のライセンスに従います。メッセージの約束事はこのページに書いてあるので、自分のコードで話すこともできます。' },
        ],
      },
    },
    footer: { sources: 'データの出典', science: '科学的根拠とロジック', privacy: 'プライバシーポリシー', terms: '利用規約' },
  },
};
