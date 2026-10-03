/* ============================================================================
 *  IntMap · THE LAUNCH POSTS — drafts, per channel   (scripts/launch-text.mjs)
 * ----------------------------------------------------------------------------
 *  Drafts only. NOTHING HERE IS POSTED BY ANY SCRIPT: scripts/brand.mjs writes them into
 *  docs/marketing/launch-posts.md and, with `--print <id>`, prints one ready to paste (its link filled
 *  with the site's address and the channel's utm tags). Posting is a person's act, approved per channel
 *  (docs/marketing/README.md lists what needs approval).
 *
 *  ⚠ The same rules as scripts/brand-text.mjs: every claim is about something that exists today, every
 *  number is a placeholder filled from the file that owns it — `{date:<example>}` and `{image:<example>}` are an
 *  example map's date and picture (js/showcase.js) — no emoji (AGENTS.md §3-6). `{url}` is the
 *  post's link — the site path in `path`; `utm` names the channel, and is added only to a link into the app
 *  (scripts/brand.mjs postUrl says why). Community rules change and are not restated here: each draft says to read them first.
 * ==========================================================================*/

export const POSTS = [
  {
    id: 'producthunt', channel: 'Product Hunt', lang: 'en', path: '', utm: 'producthunt',
    fields: {
      Name: 'IntMap',
      Tagline: 'Every year of the world, on one map',
      Description: 'A free world map you can set to any date from {floorBC} to today. Borders, figures and {layers} layers follow the clock, every source is named, and one link reopens exactly what you see. No sign-up.',
      Link: '{url}',
    },
    body: `Hi Product Hunt —

IntMap is the world map I wanted and could not find: one map with one clock for everything on it.

Move the clock anywhere from {floorBC} to today and the map follows. Borders come from {snapshots} historical snapshots before {ohmFrom}, OpenHistoricalMap from {ohmFrom} to {ohmTo}, and CShapes 2.0 day by day from {csFrom} to {csTo}. The {layers} layers on the same map — climate, hazards, population, economy, infrastructure, live feeds — each name their source, and a layer whose source says nothing about the date you chose is not drawn, rather than showing today's data under an old date.

Things to try:
- Open Europe on {date:europe-1914}, then on {date:europe-1920}, and compare the two.
- Share the map: the link reopens the same place, date and layers on any device, or embeds the same map on your own site.
- Sign in and ask Atlas, the built-in assistant, to do it for you in plain words.

It is free, with no ads and no paid plan; donations keep it running. I would love to hear what you looked up first, and what you could not find.

{url}`,
  },
  {
    id: 'hackernews', channel: 'Hacker News (Show HN)', lang: 'en', path: '', utm: 'hackernews',
    fields: { Title: 'Show HN: IntMap – a world map you can set to any date from {floorBC} to today', URL: '{url}' },
    body: `IntMap is a browser map with one clock for everything on it. Set it to any date from {floorBC} to today and the borders, the country figures and the layers follow.

Some details that may interest people here:

- Borders come from three records, chosen per instant: {snapshots} snapshots of aourednik/historical-basemaps before {ohmFrom}, OpenHistoricalMap from {ohmFrom} to {ohmTo}, and CShapes 2.0 (ETH Zürich) day by day from {csFrom} to {csTo}.
- A layer only draws when its source describes the instant on the clock. Set the clock to {ohmFrom} and you do not get today's temperatures under a {ohmFrom} label; the layer says it has nothing for that date.
- The whole state of the map — view, layers, date, base map — is in the URL fragment, so a link is the map. The same link with ?embed=1 is a read-only embed.
- It is a static site on GitHub Pages (MapLibre GL, with an optional 3-D globe), no account needed. The AI part, Atlas, runs server-side on Supabase Edge Functions and needs a sign-in, with a daily limit per account.
- The historical entry pages (one per region and per date at which what the map draws there changes) are generated at build time by running the map's own border code in Node, so they list exactly what the map draws.

Every data source and licence is listed on the Data sources page. Feedback on what is wrong is the most useful thing you could give me.`,
  },
  {
    id: 'reddit-mapporn', channel: 'Reddit r/MapPorn', lang: 'en', path: 'history/europe/', utm: 'reddit',
    fields: { Title: 'Europe on {date:europe-1914} and on {date:europe-1920}, drawn from CShapes 2.0 [OC]', Image: '{image:europe-1914} + {image:europe-1920}' },
    body: `Both maps are screenshots of IntMap, a free web map you can set to any date from {floorBC} to today. Borders for these dates come from CShapes 2.0 (ETH Zürich), which records state borders day by day from {csFrom} to {csTo}.

Europe at every date its map changes, with the list of states drawn for each: {url}

(Read the subreddit's rules on image posts and self-promotion before posting; this is a draft.)`,
  },
  {
    id: 'reddit-geography', channel: 'Reddit r/geography', lang: 'en', path: 'history/', utm: 'reddit',
    fields: { Title: 'I made a free world map with one clock: set it to any year from {floorBC} to today and the borders follow' },
    body: `IntMap puts historical borders, climate, population, hazards and live data on one map, and every one of them follows the same clock. Before {ohmFrom} the borders are {snapshots} historical snapshots; from {ohmFrom} to {ohmTo} they come from OpenHistoricalMap and from {csFrom} to {csTo} from CShapes 2.0, day by day.

Each region and date also has a plain page listing every state and people the map draws there, with the source: {url}

I would like to know where it is wrong. Every source and licence is on the Data sources page.

(Read the subreddit's rules on self-promotion before posting; this is a draft.)`,
  },
  {
    id: 'reddit-internetisbeautiful', channel: 'Reddit r/InternetIsBeautiful', lang: 'en', path: '', utm: 'reddit',
    fields: { Title: 'IntMap: a free world map you can set to any date from {floorBC} to today — the borders, figures and {layers} layers follow the clock', URL: '{url}' },
    body: `(Link post. Read the subreddit's rules before posting; this is a draft.)`,
  },
  {
    id: 'reddit-gis', channel: 'Reddit r/gis', lang: 'en', path: '', utm: 'reddit',
    fields: { Title: 'A time-aware web map: historical borders day by day ({csFrom}–{csTo}) and from {floorBC}, with every layer gated on what its source covers' },
    body: `IntMap is a browser map (MapLibre GL) where every layer follows one clock. Borders are chosen per instant from three records: CShapes 2.0 day by day from {csFrom} to {csTo}, OpenHistoricalMap from {ohmFrom} to {ohmTo}, and {snapshots} snapshots of historical-basemaps before that. A layer is only drawn when its source describes the instant — the map says so instead of drawing today's data under an old date.

The map state lives in the URL, so a link reopens the same view, layers and date, and ?embed=1 makes it a read-only embed. Sources and licences are listed per layer.

I would value criticism of the time model and of how the three border records are stitched together: {url}

(Read the subreddit's rules on self-promotion before posting; this is a draft.)`,
  },
  {
    id: 'x-en', channel: 'X (English thread)', lang: 'en', path: '', utm: 'x',
    fields: {},
    thread: [
      'IntMap is a free world map with one clock for everything on it. Set it to any date from {floorBC} to today and the borders, figures and layers follow. No sign-up. {url}',
      'Borders: {snapshots} historical snapshots before {ohmFrom}, OpenHistoricalMap {ohmFrom}–{ohmTo}, and CShapes 2.0 day by day {csFrom}–{csTo}.',
      '{layers} layers sit on the same map, each with its source named. If a source says nothing about the date on the clock, the layer is not drawn — no old labels on today\'s data.',
      'A link reopens the same place, date and layers on any device, and the same map can be embedded on another site. Signed in, Atlas — the built-in assistant — drives the map from plain words.',
    ],
  },
  {
    id: 'x-ja', channel: 'X（日本語スレッド）', lang: 'jp', path: '', utm: 'x',
    fields: {},
    thread: [
      'IntMap は、地図の上のすべてに一つの時計を持つ無料の世界地図です。{floorBC}から今日までのどの日付に合わせても、国境・数字・レイヤーがついてきます。登録不要。{url}',
      '国境は、{ohmFrom}年より前が{snapshots}枚の歴史スナップショット、{ohmFrom}〜{ohmTo}年が OpenHistoricalMap、{csFrom}〜{csTo}年が CShapes 2.0（日単位）です。',
      '同じ地図に{layers}のレイヤー。すべて出典を明記し、選んだ日付を出典が述べていないレイヤーは描きません。古い日付の下に今日のデータを出すことはしません。',
      'リンク一つで同じ場所・日付・レイヤーをどの端末でも開けます。他のサイトへの埋め込みも可。ログインすれば AI アシスタントの Atlas が言葉どおりに地図を動かします。',
    ],
  },
  {
    id: 'note', channel: 'note', lang: 'jp', path: 'ja/history/', utm: 'note',
    fields: { 'タイトル': '世界のどの年も、一枚の地図で——IntMap を作っている理由' },
    body: `（下書き。本文は作り手の言葉で書き直すこと）

地図帳の歴史地図は、誰かが選んだ一瞬しか見せてくれません。ある年のヨーロッパは載っていても、その前後の年は載っていないし、その地図の国境がどこから来たのかも書いてありません。

IntMap は、地図の上のすべてに一つの時計を持たせた無料の世界地図です。{floorBC}から今日までのどの日付に合わせても、国境も数字もレイヤーもついてきます。

■ 国境はどこから来ているか
・{ohmFrom}年より前：historical-basemaps の{snapshots}枚のスナップショット
・{ohmFrom}〜{ohmTo}年：OpenHistoricalMap
・{csFrom}〜{csTo}年：CShapes 2.0（スイス連邦工科大学チューリッヒ校）を日単位で

■ 描かないことを選ぶ
選んだ日付を出典が述べていないレイヤーは描きません。{ohmFrom}年に合わせて今日の気温が出てくる地図は、正確そうに見えて嘘をついているからです。

■ リンクが地図になる
共有リンクには、場所・日付・レイヤーがすべて入っています。授業で配れば、全員の端末に同じ地図が開きます。

■ 地域と年で選ぶ歴史地図
地域と日付ごとに、地図が描く国や民族の名前を一覧にしたページも用意しました：{url}

広告も有料プランもなく、寄付で運営しています。間違いを見つけたら、ぜひ教えてください。`,
  },
  {
    id: 'zenn', channel: 'Zenn', lang: 'jp', path: 'ja/history/', utm: 'zenn',
    fields: { 'タイトル': '地図が描くものだけを書く：歴史地図の入口ページを、地図自身のコードから生成する', 'トピック': 'javascript, maplibre, seo, gis' },
    body: `（下書き。コードの引用は公開リポジトリの該当箇所から取ること）

## はじめに
IntMap の地図の状態は URL のフラグメント（#v=…&tt=…）にあり、サーバーには届きません。検索エンジンから見ると、「{date:europe-1914}のヨーロッパの地図」はどこにも存在しないことになります。

## やったこと
地域と日付ごとに、地図が描く名前を並べた静的ページを、ビルド時に生成しました：{url}

## 地図と同じ答えを出すために、地図のコードを Node で動かす
- ブラウザ用の国境モジュールを、DOM と描画エンジンを差し替えて Node で実体化する
- \`collectionAt(date)\` に日付を渡し、地図が描く FeatureCollection をそのまま受け取る（CShapes 2.0 → OpenHistoricalMap → historical-basemaps の順の選択も、年代に合わない名前を出さない規則も、地図と共通）
- ラベルを決める処理も同じものを呼び、地図が書く名前（日本語を含む）をページに載せる

## ページを作る単位
{ohmFrom}年より前はスナップショット一枚ごと、それ以降は「毎年同じ日付に描かれる名前が変わらない年の続き」ごとに一ページ。隣り合うページは必ず内容が違う。

## 地域に入るかどうか
輪郭を地域の矩形で切り抜いた球面上の面積があるかどうか。面積は描かれた輪郭のものとして明記する。

## 歴史の主張として検証する
形式の検査が緑でも主張が正しいとは限らない。年と場所を名指して列挙し、制度の成立・廃止と突き合わせる。

## おわりに
間違いを見つけたら教えてください。`,
  },
];
