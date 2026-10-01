/* ============================================================================
 *  IntMap · the landing and teacher pages — THE WORDS   (scripts/landing-text.mjs)
 * ----------------------------------------------------------------------------
 *  The only copy of the prose on about.html / teachers.html and their ja/ twins. Those four files
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
    nav: { examples: 'Examples', teachers: 'For teachers', about: 'About', open: 'Open the map', lang: '日本語', langLabel: 'Read this page in Japanese' },
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
    footer: { sources: 'Data sources', science: 'Science & logic', privacy: 'Privacy Policy', terms: 'Terms of Service' },
  },

  jp: {
    nav: { examples: '見本', teachers: '先生へ', about: 'IntMap について', open: '地図を開く', lang: 'English', langLabel: 'このページを英語で読む' },
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
    footer: { sources: 'データの出典', science: '科学的根拠とロジック', privacy: 'プライバシーポリシー', terms: '利用規約' },
  },
};
