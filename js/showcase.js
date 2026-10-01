/* ============================================================================
 *  IntMap · THE SHOWCASE — the example maps, declared once   (js/showcase.js)
 * ----------------------------------------------------------------------------
 *  「拡散と授業の素材になる見本」 — a small set of maps that open, from a link, exactly as described.
 *  Four readers take them from HERE and from nowhere else:
 *    · the landing and teacher pages (about.html / teachers.html and their ja/ twins), which
 *      scripts/landing.mjs generates — gallery, lesson plan, sitemap;
 *    · Atlas, through `panel.showcase` (js/atlas-cap-panel.js), which opens one in the map;
 *    · tests/landing-showcase.spec.js, which opens every one and asks the map whether it drew it;
 *    · tests/landing-showcase-checks.test.mjs, which holds the captured links to the intent below.
 *
 *  ══ WHAT IS WRITTEN BY HAND, AND WHAT IS NOT ═══════════════════════════════════════════════════
 *  An entry states its INTENT: where the camera is, which date the clock is at (`at`; null = now),
 *  which layers are on, which base map. It does NOT state its link. The `#v=` link is the app's own
 *  encoding of a session (js/map-ui.js `viewHash` → `encode()`), and a link typed here would be a
 *  second encoder that drifts the day the format changes. So `scripts/showcase-capture.mjs` boots the
 *  real application, puts it into each intent through the app's own controls, and asks
 *  `IntMapBookmark.link()` for the address — the region at the bottom of this file is that answer,
 *  with the screenshot taken in the same session. `node scripts/landing.mjs --check` fails when a
 *  captured link no longer says what its intent says.
 *
 *  ══ `drawn` IS THE CLAIM, MADE CHECKABLE ═══════════════════════════════════════════════════════
 *  A historical example's title and sentence say what is on the map at that date. `drawn.labels`
 *  are the names its text relies on — the polity labels the time machinery draws for that day — and
 *  the spec fails if any of them is missing from the opened map. `drawn.admin` is the same for the
 *  first-level subdivisions. A text that names something the map does not draw is the
 *  「表示は正直」 failure (PRODUCT.md §2.1-3), so the names are asked of the map, not of this file.
 *  (.agents/rules/historical-verification.md: the year and place were listed with
 *  `node scripts/hist-fidelity.mjs --year <y> --in <bbox>` and against the institutions' dates —
 *  see dev-notes/2026-10-01-landing-showcase.md.)
 *
 *  ⚠ PURE DATA: no DOM, no `window` (js/lang-registry.js is imported for pickArgs, which node runs too).
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7), written LA(en, jp).
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';   /* the translation helper, by import — the same in node: pickArgs() returns the array it is handed */
/* IntMap-authored text is a positional tuple (en, jp) — IntMapLang.pickArgs(), the shape every i18n
   instrument reads; the browser resolves it with L.arr(), node reads [0] / [1]. */
const LA = /** @type {(...a: string[]) => string[]} */ (IntMapLang.pickArgs());

const DECLARED = [
  {
    id: 'europe-1914',
    topic: 'history',
    audience: ['curious', 'teachers'],
    curriculum: ['rekishi-c'],
    title: LA('Europe on 27 June 1914', '1914年6月27日のヨーロッパ'),
    blurb: LA(
      'The day before the shots in Sarajevo: Austria-Hungary, Serbia, Montenegro and the Ottoman Empire, with the borders CShapes 2.0 records for that day.',
      'サラエボ事件の前日。オーストリア＝ハンガリー、セルビア、モンテネグロ、オスマン帝国の国境を、CShapes 2.0 がその日について記録しているとおりに描きます。'),
    question: LA(
      'Which of these states had disappeared six years later? Open “Europe on 1 July 1920” and compare.',
      'この地図の国のうち、6年後に姿を消した国はどれでしょう。「1920年7月1日のヨーロッパ」を開いて比べてみましょう。'),
    view: { lng: 22, lat: 48.5, zoom: 3.3, proj: 'f' },
    base: 'map',
    at: '1914-06-27',
    layers: [],
    drawn: { labels: ['Austria-Hungary', 'Serbia', 'Montenegro', 'Ottoman Empire'] },
  },
  {
    id: 'europe-1920',
    topic: 'history',
    audience: ['curious', 'teachers'],
    curriculum: ['rekishi-c'],
    title: LA('Europe on 1 July 1920', '1920年7月1日のヨーロッパ'),
    blurb: LA(
      'After the First World War: Poland, Czechoslovakia, Finland, Estonia, Latvia and Lithuania are on the map, and Austria and Hungary are two countries.',
      '第一次世界大戦のあと。ポーランド、チェコスロバキア、フィンランド、エストニア、ラトビア、リトアニアが現れ、オーストリアとハンガリーは別の国になっています。'),
    question: LA(
      'The new states were made from land that had belonged to which empires in 1914?',
      '新しく現れた国々の土地は、1914年にはどの帝国に属していたでしょう。'),
    view: { lng: 22, lat: 48.5, zoom: 3.3, proj: 'f' },
    base: 'map',
    at: '1920-07-01',
    layers: [],
    drawn: { labels: ['Poland', 'Czechoslovakia', 'Finland', 'Estonia', 'Latvia', 'Lithuania', 'Austria', 'Hungary'] },
  },
  {
    id: 'ww2-1942',
    withheld: 'MEASURED 2026-10-02: opened from its link, the map can end on the war\u2019s first day instead of the link\u2019s date. js/map-ui.js restore() ticks the war row at +700 ms and sets the clock at +900 ms; js/war-layer.js moves the clock to the record\u2019s first day when its row comes on with the clock outside the war, and decides that only after data/wars.json (954 kB) has arrived. When the record arrives after +900 ms the war layer wins (1939-08-23 instead of 1942-11-01, seen in tests/landing-showcase.spec.js under load); on a real network that is the usual case. Returns when the share-link restore owns the clock over a row\u2019s entry move.',
    topic: 'history',
    audience: ['curious', 'teachers'],
    curriculum: ['rekishi-c'],
    title: LA('The Second World War, 1 November 1942', '第二次世界大戦　1942年11月1日'),
    blurb: LA(
      'Who held which territory on that day, Axis or Allied, from the war record IntMap carries.',
      'その日、どの地域を枢軸国と連合国のどちらが押さえていたかを、IntMap が持つ戦争の記録から描きます。'),
    question: LA(
      'Find Stalingrad and El Alamein on this map. How far from Germany and Italy had the Axis reached?',
      'この地図でスターリングラードとエル・アラメインを探してみましょう。枢軸国はドイツ・イタリアからどこまで進んでいたでしょう。'),
    view: { lng: 30, lat: 45, zoom: 2.6, proj: 'f' },
    base: 'map',
    at: '1942-11-01',
    layers: ['dl-ww2'],
    drawn: { labels: [] },
  },
  {
    id: 'cold-war-1985',
    topic: 'history',
    audience: ['curious', 'teachers'],
    curriculum: ['rekishi-d'],
    title: LA('Cold War Europe, 1985', '冷戦期のヨーロッパ　1985年'),
    blurb: LA(
      'West Germany and East Germany side by side, with Czechoslovakia, Yugoslavia and the Soviet Union, on the borders CShapes 2.0 records for that day.',
      '西ドイツと東ドイツが並び、チェコスロバキア、ユーゴスラビア、ソビエト連邦がある。CShapes 2.0 がその日について記録している国境です。'),
    question: LA(
      'Which of the countries on this map no longer exist? What took their place, and when?',
      'この地図の国のうち、今はもう存在しない国はどれでしょう。代わりにどの国が、いつ生まれたでしょう。'),
    view: { lng: 16, lat: 52, zoom: 3.2, proj: 'f' },
    base: 'map',
    at: '1985-07-01',
    /* ⚠ NOT dl-nato, though the shading would be the obvious picture: MEASURED 2026-10-02, a share link
       that switches dl-nato on loses its camera — js/layer-home.js frames NATO on that box's first
       activation, and the share-link restore (js/map-ui.js) does not mark its boxes `__imRestored` the way
       the session restore does — so the example would not open where its picture says. Reported. */
    layers: [],
    drawn: { labels: ['West Germany', 'East Germany', 'Czechoslovakia', 'Yugoslavia', 'Soviet Union'] },
  },
  {
    id: 'korea-1950',
    withheld: 'the same race as ww2-1942 (js/war-layer.js\u2019s entry move against the share-link restore\u2019s clock)',
    topic: 'history',
    audience: ['teachers'],
    curriculum: ['rekishi-d'],
    title: LA('The Korean War, 10 September 1950', '朝鮮戦争　1950年9月10日'),
    blurb: LA(
      'Eleven weeks into the war, from the war record IntMap carries: who held which part of the peninsula on that day.',
      '開戦から11週間。その日、半島のどこを誰が押さえていたかを、IntMap が持つ戦争の記録から描きます。'),
    question: LA(
      'Five days later came the landing at Incheon. Find Incheon on the map — why might a landing there change the war?',
      '5日後に仁川（インチョン）上陸作戦が行われます。地図で仁川を探し、そこへの上陸が戦況を変えうる理由を考えてみましょう。'),
    view: { lng: 127.8, lat: 36.4, zoom: 5.4, proj: 'f' },
    base: 'map',
    at: '1950-09-10',
    layers: ['dl-korea'],
    drawn: { labels: [] },
  },
  {
    id: 'japan-1900',
    topic: 'history',
    audience: ['curious', 'teachers'],
    curriculum: ['rekishi-b'],
    title: LA('Japan in 1900', '1900年の日本'),
    blurb: LA(
      'Japan divided into prefectures, not the old provinces: the domains were abolished in 1871. Taiwan is under Japanese rule, and Korea is the Korean Empire.',
      '令制国ではなく府県で区切られた日本（廃藩置県は1871年）。台湾は日本の統治下にあり、朝鮮半島は大韓帝国です。'),
    question: LA(
      'Which territories outside today’s Japan were ruled from Tokyo in 1900, and when did that end?',
      '1900年に東京から統治されていた、今日の日本の外にある地域はどこでしょう。その統治はいつ終わったでしょう。'),
    view: { lng: 133, lat: 34, zoom: 4, proj: 'f' },
    base: 'map',
    at: '1900-07-01',
    layers: [],
    drawn: { labels: ['Japan', 'Taiwan (Japan)', 'Korean Empire'], admin: ['Kagawa', 'Nara', 'Hokkaidō'] },
  },
  {
    id: 'world-100',
    topic: 'history',
    audience: ['curious', 'teachers'],
    curriculum: [],
    title: LA('The world in AD 100', '西暦100年の世界'),
    blurb: LA(
      'The Roman Empire and Han China at the two ends of Eurasia, with the Parthian and Kushan empires between them — the historical-basemaps snapshot for AD 100.',
      'ユーラシアの両端にローマ帝国と漢、その間にパルティアとクシャーナ朝。historical-basemaps の西暦100年のスナップショットです。'),
    question: LA(
      'What lay between Rome and Han China, and how might silk have travelled from one to the other?',
      'ローマと漢の間には何があったでしょう。絹はどのようにして一方から他方へ運ばれたのでしょう。'),
    view: { lng: 78, lat: 36, zoom: 1.9, proj: 'f' },
    base: 'map',
    at: '0100-07-01',
    layers: [],
    drawn: { labels: ['Roman Empire', 'Han', 'Parthian Empire', 'Kushan Empire'] },
  },
  {
    id: 'world-3000bc',
    topic: 'history',
    audience: ['curious', 'teachers'],
    curriculum: [],
    title: LA('The world in 3000 BC', '紀元前3000年の世界'),
    blurb: LA(
      'Egypt, Ur, the Indus valley civilisation and Minoan Crete — the historical-basemaps snapshot for 3000 BC.',
      'エジプト、ウル、インダス文明、ミノア文明。historical-basemaps の紀元前3000年のスナップショットです。'),
    question: LA(
      'Which of these early civilisations grew up beside a great river, and why would a river matter?',
      'これらの初期の文明のうち、大河のそばで生まれたのはどれでしょう。なぜ川が大切だったのでしょう。'),
    view: { lng: 47, lat: 29, zoom: 3, proj: 'f' },
    base: 'map',
    at: '-002999-07-01',
    layers: [],
    /* ⚠ not Elam: it is in data/hist-eras.js's 3000 BC sheet, and was drawn on 2026-10-01, but MEASURED
       2026-10-02 the border source (imtb-src) held 138 features for that date and not Elam — reported, cause
       not established. The text names only what the map is asked for below. */
    drawn: { labels: ['Egypt', 'Ur', 'Indus valley civilization', 'Minoan'] },
  },
  {
    id: 'ring-of-fire',
    topic: 'earth',
    audience: ['curious', 'teachers'],
    curriculum: ['chiri-c1'],
    title: LA('Volcanoes and plate boundaries', '火山とプレート境界'),
    blurb: LA(
      'Holocene volcanoes from the Smithsonian Global Volcanism Program, over the plate boundaries of Bird (2003).',
      'スミソニアン協会の Global Volcanism Program による完新世の火山を、Bird (2003) のプレート境界に重ねています。'),
    question: LA(
      'Why are so many volcanoes found around the edge of the Pacific Ocean?',
      'なぜ太平洋のまわりにこれほど多くの火山が並んでいるのでしょう。'),
    view: { lng: -175, lat: 8, zoom: 1.5, proj: 'f' },
    base: 'map',
    at: null,
    layers: ['eco-dl-plates', 'beta-dl-volc2'],
    drawn: {},
  },
  {
    id: 'koppen',
    topic: 'earth',
    audience: ['curious', 'teachers'],
    curriculum: ['chiri-b1'],
    title: LA('Climates of the world (Köppen–Geiger)', '世界の気候区分（ケッペン）'),
    blurb: LA(
      'The Köppen–Geiger climate classification of Beck and colleagues, for 1991–2020.',
      'Beck らによるケッペン＝ガイガーの気候区分（1991〜2020年）。'),
    question: LA(
      'Find two places at the same latitude with different climates. What makes the difference?',
      '同じ緯度にあるのに気候が違う2つの場所を探してみましょう。何がその違いを生んでいるのでしょう。'),
    view: { lng: 15, lat: 25, zoom: 1.4, proj: 'f' },
    base: 'map',
    at: null,
    layers: ['dl-climate'],
    drawn: {},
  },
];

/* ══ AN EXAMPLE THAT DOES NOT OPEN AS ITS PICTURE SAYS IS NOT SHOWN ═════════════════════════════════
   `withheld` is a sentence: the measured reason an example would open differently from its page. A
   withheld example stays declared (its text, view and captured link are kept, so it returns by deleting
   one field) and every reader — the pages, the sitemap, Atlas, the spec — reads SHOWCASE, which does
   not hold it. scripts/landing.mjs --check requires the sentence. */
export const SHOWCASE = DECLARED.filter((s) => !s.withheld);
export const WITHHELD = DECLARED.filter((s) => s.withheld);

/* The curriculum keys an entry may name. The words are the headings of 文部科学省「高等学校学習指導要領
   （平成30年告示）」 第2章第2節 地理歴史, quoted as they stand there (read 2026-10-01 from
   https://www.mext.go.jp/content/20230120-mxt_kyoiku02-100002604_03.pdf); the English is IntMap's
   gloss of them, not an official translation. Nothing else of the document is restated. */
export const CURRICULUM = {
  'chiri-b1': { subject: LA('Geography (Chiri Sōgō)', '地理総合'),
    item: LA('B (1) Diversity of ways of life and international understanding', 'Ｂ（1）生活文化の多様性と国際理解') },
  'chiri-c1': { subject: LA('Geography (Chiri Sōgō)', '地理総合'),
    item: LA('C (1) The natural environment and disaster prevention', 'Ｃ（1）自然環境と防災') },
  'rekishi-b': { subject: LA('History (Rekishi Sōgō)', '歴史総合'),
    item: LA('B Modernisation and us', 'Ｂ　近代化と私たち') },
  'rekishi-c': { subject: LA('History (Rekishi Sōgō)', '歴史総合'),
    item: LA('C Changes in the international order, mass society and us', 'Ｃ　国際秩序の変化や大衆化と私たち') },
  'rekishi-d': { subject: LA('History (Rekishi Sōgō)', '歴史総合'),
    item: LA('D Globalisation and us', 'Ｄ　グローバル化と私たち') },
};

/** one entry by id, or null */
export function showcaseById(id) {
  const k = String(id || '').trim().toLowerCase();
  return SHOWCASE.find((s) => s.id === k) || null;
}

/** the link that opens an entry in the map, relative to the site root — null until it is captured */
export function showcaseLink(id) {
  const c = CAPTURED[id];
  return c && c.hash ? './index.html' + c.hash : null;
}

/* ⚠ GENERATED SHOWCASE — BEGIN (node scripts/showcase-capture.mjs; DO NOT EDIT) */
export const CAPTURED = {
  "europe-1914": {
    "hash": "#v=22.0000,48.5000,3.30,0,0,f&tt=1914-06-27",
    "image": "img/showcase/europe-1914.jpg",
    "card": "img/showcase/europe-1914-card.jpg"
  },
  "europe-1920": {
    "hash": "#v=22.0000,48.5000,3.30,0,0,f&tt=1920-07-01",
    "image": "img/showcase/europe-1920.jpg",
    "card": "img/showcase/europe-1920-card.jpg"
  },
  "ww2-1942": {
    "hash": "#v=30.0000,45.0000,2.60,0,0,f&l=dl-ww2&tt=1942-11-01",
    "image": "img/showcase/ww2-1942.jpg",
    "card": "img/showcase/ww2-1942-card.jpg"
  },
  "cold-war-1985": {
    "hash": "#v=16.0000,52.0000,3.20,0,0,f&tt=1985-07-01",
    "image": "img/showcase/cold-war-1985.jpg",
    "card": "img/showcase/cold-war-1985-card.jpg"
  },
  "korea-1950": {
    "hash": "#v=127.8000,36.4000,5.40,0,0,f&l=dl-korea&tt=1950-09-10",
    "image": "img/showcase/korea-1950.jpg",
    "card": "img/showcase/korea-1950-card.jpg"
  },
  "japan-1900": {
    "hash": "#v=133.0000,34.0000,4.00,0,0,f&tt=1900-07-01",
    "image": "img/showcase/japan-1900.jpg",
    "card": "img/showcase/japan-1900-card.jpg"
  },
  "world-100": {
    "hash": "#v=78.0000,36.0000,1.90,0,0,f&tt=0100-07-01",
    "image": "img/showcase/world-100.jpg",
    "card": "img/showcase/world-100-card.jpg"
  },
  "world-3000bc": {
    "hash": "#v=47.0000,29.0000,3.00,0,0,f&tt=-002999-07-01",
    "image": "img/showcase/world-3000bc.jpg",
    "card": "img/showcase/world-3000bc-card.jpg"
  },
  "ring-of-fire": {
    "hash": "#v=-175.0000,8.0000,1.50,0,0,f&l=eco-dl-plates,beta-dl-volc2",
    "image": "img/showcase/ring-of-fire.jpg",
    "card": "img/showcase/ring-of-fire-card.jpg"
  },
  "koppen": {
    "hash": "#v=15.0000,25.0000,1.40,0,0,f&l=dl-climate",
    "image": "img/showcase/koppen.jpg",
    "card": "img/showcase/koppen-card.jpg"
  }
};
/* ⚠ GENERATED SHOWCASE — END */
