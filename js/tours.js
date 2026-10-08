/* ============================================================================
 *  IntMap · CLASSROOM TOURS — a lesson as a sequence of maps, declared once   (js/tours.js)
 * ----------------------------------------------------------------------------
 *  「教員が登録なしで 1 コマを回せるツアー」 (classroom-tours, 2026-10-02). A tour is an ordered list of
 *  map states, each with a few sentences for the teacher to read out (`say`) and a question for the
 *  class (`ask`); the reader steps through it with Next / Previous in a full-screen classroom mode
 *  (js/tour-player.js). Five readers take tours from HERE and from nowhere else:
 *    · js/tour-player.js — the classroom mode, opened by `?tour=<id>&step=<n>`, Settings ▸ About, or Atlas;
 *    · Atlas, through `panel.tour` (js/atlas-cap-panel.js);
 *    · scripts/landing.mjs — the tours section of the teacher pages (teachers.html, ja/teachers.html);
 *    · scripts/showcase-capture.mjs — which makes each step's link (below);
 *    · tests/classroom-tours-checks.test.mjs and tests/landing-showcase.spec.js.
 *  A tour a TEACHER writes (js/tour-builder.js) is not declared here: it lives in its own address,
 *  `?tour=custom&t=…` — the codec for that form is at the end of this file, with the other `?tour=` readers.
 *
 *  ══ A STEP IS A MAP STATE, AND ITS LINK IS THE APP'S OWN ══════════════════════════════════════
 *  A step either NAMES an example of js/showcase.js (`example:`) — and is then exactly that example:
 *  its view, date, layers, picture and captured link — or states its own INTENT in the same shape an
 *  example does (`view`, `base`, `at`, `layers`, `drawn`). It never states a link. The `#v=` address is
 *  the app's encoding of a session (js/map-ui.js `encode()`), so scripts/showcase-capture.mjs boots the
 *  built app, puts it into each intent through the app's own controls and asks `IntMapBookmark.link()`
 *  — the generated region at the bottom of this file is that answer. `node scripts/landing.mjs --check`
 *  fails when a captured step link no longer says what its intent says, exactly as it does for the
 *  examples, and the player opens a step through the share link's own restore
 *  (`IntMapBookmark.restore`), the path a pasted link takes. There is no second encoder and no second
 *  restorer.
 *
 *  ══ `say` AND `ask` ARE CLAIMS ABOUT THE MAP, MADE CHECKABLE ═══════════════════════════════════
 *  A step's sentences say what is on the map on that date, so `drawn` names what they rely on, as in
 *  js/showcase.js: `labels` (the polity labels the time machinery holds for that day), `admin` (the
 *  first-level units it holds), and `noAdminIn` — a box in which the sentence says the map draws NO
 *  first-level unit (a claim of absence is a claim too). tests/classroom-tours-checks.test.mjs asks the
 *  records the map draws from; the dates and names were listed with
 *  `node scripts/hist-fidelity.mjs --year <y> --in <bbox>` and against the institutions' own dates
 *  (.agents/rules/historical-verification.md — the measurements are in dev-notes/2026-10-02-classroom-tours.md).
 *
 *  ⚠ PURE DATA: no DOM, no `window` (node reads this file; the player and Atlas import it).
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7), written LA(en, jp).
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';   /* pickArgs() — the same tuple helper js/showcase.js uses */
import { SHOWCASE, CAPTURED } from './showcase.js';
import { packText, unpackText } from './link-codec.js';   /* (map-document-unify, data-studio) the one packing — the 'z'/'j' letter included */

const LA = /** @type {(...a: string[]) => string[]} */ (IntMapLang.pickArgs());

export const TOURS = [
  {
    id: 'ww1-europe',
    topic: 'history',
    curriculum: ['rekishi-c'],
    title: LA('Europe before and after the First World War, 1914–1920', '第一次世界大戦前後のヨーロッパ　1914→1920'),
    blurb: LA(
      'Three dates on one map of Europe: the eve of the war, the armistice, and the map after the peace treaties.',
      '同じヨーロッパの地図で3つの日付をたどります。開戦の直前、休戦の日、講和条約のあと。'),
    steps: [
      {
        example: 'europe-1914',
        say: LA(
          'Europe on 27 June 1914, the day before the assassination in Sarajevo. Austria-Hungary stretches across the middle of the map, and the Ottoman Empire still holds land in Europe.',
          '1914年6月27日、サラエボ事件の前日のヨーロッパです。地図の中央にオーストリア＝ハンガリーが広がり、オスマン帝国はまだヨーロッパに領土を持っています。'),
        ask: LA(
          'Find Sarajevo. Which state did it belong to on this day?',
          'サラエボを探してみましょう。この日、サラエボはどの国に属していたでしょう。'),
      },
      {
        id: 'europe-1918-armistice',
        title: LA('Europe on 11 November 1918', '1918年11月11日のヨーロッパ'),
        view: { lng: 22, lat: 48.5, zoom: 3.3, proj: 'f' },
        base: 'map',
        at: '1918-11-11',
        layers: [],
        say: LA(
          '11 November 1918, the day of the armistice that ended the fighting on the Western Front. Austria-Hungary is gone from the map: Austria, Hungary and Czechoslovakia are drawn in its place, and Poland appears on this day.',
          '1918年11月11日、西部戦線の戦闘を終わらせた休戦協定の日です。地図からオーストリア＝ハンガリーが消え、その場所にオーストリア、ハンガリー、チェコスロバキアが描かれています。ポーランドはこの日に地図に現れます。'),
        ask: LA(
          'Which of the states on this map had been part of the Russian Empire in 1914?',
          'この地図の国のうち、1914年にはロシア帝国の一部だった国はどれでしょう。'),
        drawn: { labels: ['Austria', 'Hungary', 'Czechoslovakia', 'Poland', 'Finland', 'Estonia', 'Lithuania'] },
      },
      {
        example: 'europe-1920',
        say: LA(
          '1 July 1920, after the peace treaties — with Germany at Versailles in June 1919, with Hungary at Trianon in June 1920. On the Baltic, Latvia has joined Estonia and Lithuania.',
          '1920年7月1日、講和条約のあとです（ドイツとのヴェルサイユ条約は1919年6月、ハンガリーとのトリアノン条約は1920年6月）。バルト海沿岸では、エストニアとリトアニアにラトビアが加わっています。'),
        ask: LA(
          'Compare 1914 and 1920. Which states lost the most land, and which states are new?',
          '1914年と1920年を比べてみましょう。最も多くの土地を失ったのはどの国で、新しく現れたのはどの国でしょう。'),
      },
    ],
  },
  {
    /* (sales-schools) 歴史総合 Ｂ（2）「結び付く世界と日本の開国」 — the unit the course of study words as 「中国の開港と
       日本の開国」. Every date below is a row edge of the record the map draws from (data/hist-borders.js, OpenHistoricalMap):
       Qing's outline changes on 1858-05-28 (the Treaty of Aigun) and 1860-11-14 (the Convention of Peking with Russia),
       and 130.7 E 42.6 N — the land just north of the Tumen — passes from Qing to the Russian Empire on 1860-11-14
       (node scripts/place-history.mjs --at 130.75,42.55). The sentences name no date for Hong Kong's growth (the record's
       Kowloon row begins 1860-10-18, not the convention's 10-24) and nothing about Sakhalin (the record draws it Russian
       from 1856, before the 1875 treaty) — measured, and left out. dev-notes/2026-10-08-sales-schools.md. */
    id: 'opening-of-japan',
    topic: 'history',
    curriculum: ['rekishi-b'],
    title: LA('The opening of China and Japan, 1853–1900', '中国の開港と日本の開国　1853→1900'),
    blurb: LA(
      'East Asia on the day Perry arrived, after the treaties of 1858–1860, when Japan opened Korea in 1876, and in 1900.',
      'ペリーが来航した日、1858〜1860年の条約のあと、日本が朝鮮を開国させた1876年、そして1900年の東アジアをたどります。'),
    steps: [
      {
        id: 'east-asia-1853',
        title: LA('East Asia on 8 July 1853', '1853年7月8日の東アジア'),
        view: { lng: 125, lat: 38, zoom: 3.4, proj: 'f' },
        base: 'map',
        at: '1853-07-08',
        layers: [],
        say: LA(
          '8 July 1853: four American warships under Commodore Matthew Perry anchor off Uraga, at the mouth of Edo Bay, with a letter asking Japan to open its ports. On this map Japan is the Tokugawa shogunate and Korea is Joseon. Ryukyu is drawn as a kingdom of its own: it sent tribute to Qing, while since 1609 it had also been under the control of Japan’s Satsuma domain. Qing China has already lost the Opium War to Britain: by the Treaty of Nanking (1842) it opened five ports to British trade and ceded Hong Kong Island, the small British territory at the mouth of the Pearl River.',
          '1853年7月8日、ペリーの率いるアメリカの軍艦4隻が江戸湾の入口の浦賀沖に停泊し、開港を求める国書を届けます。この地図で日本は徳川幕府、朝鮮半島は朝鮮王朝です。琉球は独自の王国として描かれています。琉球は清に朝貢する一方、1609年からは薩摩藩の支配も受けていました。中国の清はすでにアヘン戦争でイギリスに敗れ、南京条約（1842年）で5つの港をイギリスとの貿易に開き、香港島を割譲しています。珠江の河口にある小さなイギリス領がそれです。'),
        ask: LA(
          'Find Hong Kong and Uraga. Why did Britain and the United States want ports in East Asia in the 1840s and 1850s?',
          '香港と浦賀を探してみましょう。1840〜50年代に、イギリスやアメリカはなぜ東アジアに港を求めたのでしょう。'),
        drawn: { labels: ['Tokugawa Shogunate', 'Qing', 'Joseon', 'Ryukyu Kingdom', 'Russian Empire', 'British Hong Kong'] },
      },
      {
        id: 'east-asia-1861',
        title: LA('East Asia on 1 January 1861', '1861年1月1日の東アジア'),
        view: { lng: 125, lat: 38, zoom: 3.4, proj: 'f' },
        base: 'map',
        at: '1861-01-01',
        layers: [],
        say: LA(
          'Seven years later. In 1858 Japan signed treaties of commerce with the United States, the Netherlands, Russia, Britain and France, and in 1859 Yokohama, Nagasaki and Hakodate opened to foreign trade. Qing, defeated again by Britain and France, has given land to Russia: the north bank of the Amur by the Treaty of Aigun (1858), and the land east of the Ussuri River, down to the border of Korea, by the Convention of Peking (1860).',
          '7年後です。1858年に日本はアメリカ・オランダ・ロシア・イギリス・フランスと通商条約を結び、1859年に横浜・長崎・箱館が外国との貿易に開かれました。清は再びイギリスとフランスに敗れ、ロシアに領土を譲っています。アイグン条約（1858年）でアムール川の北岸を、北京条約（1860年）でウスリー川の東、朝鮮との境までの土地を。'),
        ask: LA(
          'Compare with 1853. Which state gained land, from whom — and which new neighbour does Joseon now have?',
          '1853年と比べてみましょう。どの国が、どの国から土地を得たでしょう。朝鮮にはどんな新しい隣国ができたでしょう。'),
        drawn: { labels: ['Tokugawa Shogunate', 'Qing', 'Joseon', 'Russian Empire'] },
      },
      {
        id: 'east-asia-1876',
        title: LA('East Asia on 1 March 1876', '1876年3月1日の東アジア'),
        view: { lng: 125, lat: 38, zoom: 3.4, proj: 'f' },
        base: 'map',
        at: '1876-03-01',
        layers: [],
        say: LA(
          'Japan has a new government since the Meiji Restoration of 1868, and now does to Korea what was done to Japan. In February 1876, after a clash off Ganghwa Island, Japan made Joseon sign the Treaty of Ganghwa: Korean ports were opened to Japanese trade, and Japanese in Korea were to be judged by Japanese consuls — terms like those of Japan’s own treaties of 1858.',
          '1868年の明治維新で日本は新しい政府となり、今度は日本がされたことを朝鮮に対して行います。江華島付近での衝突のあと、1876年2月、日本は朝鮮に日朝修好条規を結ばせました。朝鮮の港が日本との貿易に開かれ、朝鮮にいる日本人は日本の領事が裁くことになりました。1858年に日本が結んだ条約と似た内容です。'),
        ask: LA(
          'The treaty of 1876 moved no border. What changed that a map of borders cannot show — and what kind of map or source would show it?',
          '1876年の条約は国境を1つも動かしていません。国境の地図には描けない、何が変わったのでしょう。それを示すには、どんな地図や資料が要るでしょう。'),
        drawn: { labels: ['Empire of Japan (1869-1879)', 'Qing', 'Joseon', 'Russian Empire'] },
      },
      {
        example: 'japan-1900',
        say: LA(
          'Japan in 1900, forty-seven years after Perry. Japan has a constitution (1889), has won a war with Qing (1894–95) and rules Taiwan, and Korea is now the Korean Empire. In 1899 the treaties that had let foreign consuls judge their own people in Japan came to an end.',
          'ペリー来航から47年後、1900年の日本です。日本は憲法を持ち（1889年）、清との戦争に勝って（1894〜95年）台湾を統治し、朝鮮は大韓帝国となっています。1899年には、外国の領事が日本国内で自国民を裁く条約の取り決めが終わりました。'),
        ask: LA(
          'Look back over the four maps. In 1853 Japan was asked to open; by 1900 Japan rules land outside its islands. What changed in between, and what did not show on these maps?',
          '4枚の地図を振り返ってみましょう。1853年に日本は開国を求められる側でした。1900年には島々の外の土地を統治しています。その間に何が変わり、何はこれらの地図に表れなかったでしょう。'),
      },
    ],
  },
  {
    id: 'meiji-japan',
    topic: 'history',
    curriculum: ['rekishi-b'],
    title: LA('Meiji Japan: from provinces to prefectures', '明治の日本：令制国から府県へ'),
    blurb: LA(
      'How the map of Japan was redrawn in the Meiji era: the old provinces in 1868, the years after the domains were abolished, and the prefectures of 1900.',
      '明治時代に日本の地図がどう描き直されたかをたどります。1868年の令制国、廃藩置県のあとの時期、そして1900年の府県。'),
    steps: [
      {
        id: 'japan-1868',
        title: LA('Japan in November 1868', '1868年11月の日本'),
        view: { lng: 136.5, lat: 36, zoom: 5, proj: 'f' },
        base: 'map',
        at: '1868-11-01',
        layers: [],
        say: LA(
          'Japan in the first year of Meiji. The map divides the country into the old provinces (kuni), a system in use since the eighth century. The provinces were the country’s geography, not its government: the land was ruled by the new government and the domains (han), which this map does not draw.',
          '明治元年の日本です。地図は国土を、8世紀から用いられてきた令制国で区切っています。令制国は国土の区分であって政治の単位ではありません。実際に土地を治めていたのは新政府と各藩で、この地図はそれらを描いていません。'),
        ask: LA(
          'Find the province where your school is. Which of today’s prefectures covers the same land?',
          '学校のある地域の令制国を探してみましょう。今日のどの都道府県がその土地にあたるでしょう。'),
        drawn: { admin: ['武蔵国', '山城国', '陸奥国'] },
      },
      {
        id: 'japan-1872',
        title: LA('Japan in July 1872', '1872年7月の日本'),
        view: { lng: 136.5, lat: 36, zoom: 5, proj: 'f' },
        base: 'map',
        at: '1872-07-01',
        layers: [],
        say: LA(
          'The domains were abolished in August 1871 and replaced by prefectures, which were merged and redrawn again and again over the next two decades. The records IntMap draws from describe almost none of the prefectures of the 1870s, so on this date the map draws no divisions of Japan at all, rather than drawing today’s prefectures in their place.',
          '1871年8月の廃藩置県で藩は廃止されて府県に置き換えられ、府県はその後20年近く、統合と分割を繰り返しました。IntMap が使う記録には1870年代の府県がほとんど無いため、この日付の地図は日本を区切る線を描きません。今日の府県で代用することはしません。'),
        ask: LA(
          'If a map of 1872 showed today’s prefectures, what might it lead you to believe that was not true?',
          '1872年の地図に今日の都道府県が描かれていたら、どんな誤解をしてしまうでしょう。'),
        drawn: { noAdminIn: [129.5, 30, 146, 46] },
      },
      {
        example: 'japan-1900',
        say: LA(
          'Japan in 1900, divided into prefectures. Their outlines here are today’s prefectures carried back to 1881, not the borders of 1900 themselves. Taiwan has been ruled from Tokyo since 1895, and Korea is the Korean Empire.',
          '1900年の日本は府県で区切られています。ここでの輪郭は今日の都道府県を1881年までさかのぼらせたもので、1900年の境界そのものではありません。台湾は1895年から日本の統治下にあり、朝鮮半島は大韓帝国です。'),
        ask: LA(
          'Compare with 1868. Which provinces became a single prefecture, and which provinces were divided among several?',
          '1868年と比べてみましょう。そのまま1つの県になった令制国と、いくつかの府県に分かれた令制国はどれでしょう。'),
      },
    ],
  },
  {
    /* (sales-schools) 歴史総合 Ｄ（3）「世界秩序の変容と日本」 — 「冷戦の終結」 in the course of study's words; KS3 history
       «challenges for Britain, Europe and the wider world 1901 to the present day». The dates are CShapes 2.0's rows
       (data/cshapes.js): the German Democratic Republic ends 1990-10-02; Czechoslovakia ends 1992-12-31 and the Czech
       Republic and Slovakia begin 1993-01-01; the fifteen successor states of the Soviet Union are all in force on
       1993-01-01. ⚠ No sentence dates a single successor state: CShapes starts them on different days (the Baltic
       states 1991-09-06, the Soviet recognition; Belarus 1991-08-25; Ukraine 1991-12-26) and Slovenia and Croatia on
       1992-04-27, which are not their declarations. ⚠ The second step is 1991-07-01 (the Warsaw Pact's formal end), not
       the reunification day: on 1990-10-03 the map LABELS the Federal Republic «West Germany» — js/history.js's era name
       for DEU runs `from:1949,to:1990` by whole years, though the record itself says «Germany» from that day (seen in
       the captured picture). ⚠ The last step is in 1993, not in the last days of 1991: the map's name
       rule (js/time-borders.js _CS_ERA 365) calls the record «Soviet Union» through 1991-12-31. Macedonia is not named:
       the same table labels it «North Macedonia» in every year. Both reported in dev-notes/2026-10-08-sales-schools.md. */
    id: 'cold-war-end',
    topic: 'history',
    curriculum: ['rekishi-d'],
    title: LA('The end of the Cold War in Europe, 1985–1993', '冷戦の終結とヨーロッパの地図　1985→1993'),
    blurb: LA(
      'Divided Germany in 1985, Germany reunited in 1990, and the map of 1993 after the Soviet Union, Yugoslavia and Czechoslovakia had broken apart.',
      '分断されたドイツ（1985年）、統一したドイツ（1990年）、そしてソ連・ユーゴスラビア・チェコスロバキアが解体したあとの1993年の地図をたどります。'),
    steps: [
      {
        example: 'cold-war-1985',
        say: LA(
          'Europe in July 1985, a few months after Mikhail Gorbachev became the leader of the Soviet Union. Germany is divided into West Germany and East Germany, and three large states — Czechoslovakia, Yugoslavia and the Soviet Union — each hold many peoples inside one border.',
          '1985年7月のヨーロッパです。ゴルバチョフがソ連の指導者となって数か月後です。ドイツは西ドイツと東ドイツに分かれ、チェコスロバキア、ユーゴスラビア、ソ連という3つの大きな国が、それぞれ1つの国境の中に多くの民族を抱えています。'),
        ask: LA(
          'Which states on this map were allies of the Soviet Union in the Warsaw Pact, and which were members of NATO?',
          'この地図の国のうち、ワルシャワ条約機構でソ連の同盟国だったのはどの国でしょう。NATO の加盟国はどの国でしょう。'),
      },
      {
        id: 'europe-1991',
        title: LA('Europe on 1 July 1991', '1991年7月1日のヨーロッパ'),
        view: { lng: 16, lat: 52, zoom: 3.2, proj: 'f' },
        base: 'map',
        at: '1991-07-01',
        layers: [],
        say: LA(
          '1 July 1991. Germany has been one state again since 3 October 1990, when East Germany joined the Federal Republic — eleven months after the Berlin Wall was opened in November 1989. On this day the Warsaw Pact, the Soviet Union’s military alliance with the states of eastern Europe, is formally dissolved. Czechoslovakia, Yugoslavia and the Soviet Union are still on the map.',
          '1991年7月1日です。1990年10月3日に東ドイツが西ドイツに加わり、ドイツは再び1つの国になっています。1989年11月にベルリンの壁が開かれてから11か月後のことでした。この日、ソ連と東ヨーロッパの国々の軍事同盟であるワルシャワ条約機構が正式に解散します。チェコスロバキア、ユーゴスラビア、ソ連はまだ地図の上にあります。'),
        ask: LA(
          'Compare with 1985. Which border has disappeared? Why might it have been the first to go?',
          '1985年と比べてみましょう。消えた国境はどれでしょう。なぜそれが最初に消えたのでしょう。'),
        drawn: { labels: ['German Federal Republic', 'Czechoslovakia', 'Yugoslavia', 'Russia (Soviet Union)'] },
      },
      {
        id: 'europe-1993',
        title: LA('Europe and the former Soviet Union on 1 January 1993', '1993年1月1日のヨーロッパと旧ソ連'),
        view: { lng: 38, lat: 50, zoom: 2.6, proj: 'f' },
        base: 'map',
        at: '1993-01-01',
        layers: [],
        say: LA(
          '1 January 1993, the day Czechoslovakia divided peacefully into the Czech Republic and Slovakia. The Soviet Union was dissolved in December 1991: where it was, the map now draws Russia and fourteen other states, among them Estonia, Latvia, Lithuania, Belarus, Ukraine, Moldova, Georgia and Kazakhstan. Yugoslavia has broken apart too, in war: Slovenia, Croatia and Bosnia and Herzegovina are drawn as separate states, and the name Yugoslavia stays with Serbia and Montenegro.',
          '1993年1月1日、チェコスロバキアが平和的にチェコとスロバキアに分かれた日です。ソ連は1991年12月に解体し、その場所に地図はロシアと14の国を描いています。エストニア、ラトビア、リトアニア、ベラルーシ、ウクライナ、モルドバ、ジョージア、カザフスタンなどです。ユーゴスラビアも戦争の中で解体し、スロベニア、クロアチア、ボスニア・ヘルツェゴビナが別々の国として描かれ、ユーゴスラビアの名はセルビアとモンテネグロに残っています。'),
        ask: LA(
          'Count the states drawn where the Soviet Union was. Which three of them had been independent once before, between the two world wars? (The tour on the First World War shows them in 1920.)',
          'ソ連があった場所に描かれている国を数えてみましょう。そのうち、2つの世界大戦の間にも一度独立していた3つの国はどれでしょう（第一次世界大戦のツアーの1920年の地図にあります）。'),
        drawn: { labels: ['Russia (Soviet Union)', 'Estonia', 'Latvia', 'Lithuania', 'Belarus (Byelorussia)', 'Ukraine', 'Moldova',
          'Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyz Republic', 'Tajikistan',
          'Czech Republic', 'Slovakia', 'Slovenia', 'Croatia', 'Bosnia-Herzegovina', 'Yugoslavia', 'German Federal Republic'] },
      },
    ],
  },
  {
    id: 'plates-volcanoes',
    topic: 'earth',
    curriculum: ['chiri-c1'],
    title: LA('Plates, volcanoes and earthquakes', 'プレートと火山と地震'),
    blurb: LA(
      'Where the Earth’s plates meet, and what happens there: the Pacific rim, Japan and Iceland.',
      '地球のプレートが接するところで何が起きているかを、太平洋のまわり、日本、アイスランドでたどります。'),
    steps: [
      {
        id: 'plates-pacific',
        title: LA('The plate boundaries', 'プレートの境界'),
        view: { lng: -175, lat: 8, zoom: 1.5, proj: 'f' },
        base: 'map',
        at: null,
        layers: ['eco-dl-plates'],
        say: LA(
          'Each coloured area is one of the plates that make up the Earth’s surface, and the lines between them are the plate boundaries — from Peter Bird’s 2003 model. The plates move a few centimetres a year, and most of what this tour shows happens where they meet.',
          '色分けされた1つ1つの区域が地球の表面をつくるプレートで、その間の線がプレート境界です（Peter Bird による2003年のモデル）。プレートは1年に数センチメートルずつ動いていて、このツアーで見るもののほとんどは、プレートどうしが接するところで起きています。'),
        ask: LA(
          'Which is the largest plate on this map, and which plates border it?',
          'この地図でいちばん大きなプレートはどれでしょう。そのプレートに接しているのはどのプレートでしょう。'),
        drawn: {},
      },
      {
        example: 'ring-of-fire',
        say: LA(
          'The same map with the volcanoes of the last twelve thousand years or so (the Holocene), from the Smithsonian Institution’s Global Volcanism Program. Many of them line the edge of the Pacific.',
          '同じ地図に、およそ1万2千年前以降（完新世）に活動した火山を重ねました。スミソニアン協会の Global Volcanism Program のデータです。その多くが太平洋のふちに並んでいます。'),
        ask: LA(
          'Are the volcanoes exactly on the boundary lines, or beside them? Is it the same everywhere?',
          '火山はプレート境界の線のちょうど上にあるでしょうか、それとも線のそばでしょうか。どこでも同じでしょうか。'),
      },
      {
        id: 'plates-japan',
        title: LA('Around Japan', '日本のまわり'),
        view: { lng: 138, lat: 36.5, zoom: 4.3, proj: 'f' },
        base: 'map',
        at: null,
        layers: ['eco-dl-plates', 'beta-dl-volc2'],
        say: LA(
          'Around Japan several plates meet. The volcanoes form a chain that runs parallel to the boundaries in the ocean to the east and south, some distance away from them: along the length of Japan, and on south through the Izu Islands.',
          '日本のまわりでは、いくつものプレートが接しています。火山は、東と南の海にあるプレート境界から少し離れて、境界と平行に連なっています。日本列島に沿って、そして伊豆諸島を通って南へと続いています。'),
        ask: LA(
          'Switch on the earthquakes (Layers ▸ Hazards & emergencies ▸ Earthquakes (live + history)). Do the earthquakes fall on the boundary lines, on the volcanoes, or somewhere else?',
          '地震のレイヤー（レイヤー ▸ 災害・緊急 ▸ 地震（ライブ＋過去））をオンにしてみましょう。地震はプレート境界の線の上、火山の上、それともほかの場所で起きているでしょう。'),
        drawn: {},
      },
      {
        id: 'plates-iceland',
        title: LA('Iceland', 'アイスランド'),
        view: { lng: -19, lat: 64.8, zoom: 4.2, proj: 'f' },
        base: 'map',
        at: null,
        layers: ['eco-dl-plates', 'beta-dl-volc2'],
        say: LA(
          'Iceland sits on the Mid-Atlantic Ridge, where two plates move apart and new crust forms. Here the volcanoes lie along the boundary itself.',
          'アイスランドは大西洋中央海嶺の上にあります。ここでは2つのプレートが離れていき、新しい地殻が生まれています。火山はプレート境界そのものに沿って並んでいます。'),
        ask: LA(
          'Japan and Iceland both have many volcanoes. How are the plate boundaries they sit on different?',
          '日本もアイスランドも火山の多い国です。それぞれがのっているプレート境界は、どう違うでしょう。'),
        drawn: {},
      },
    ],
  },
];

/* ══ ONE STEP, RESOLVED — what every reader needs, in one shape ═════════════════════════════════
   An `example` step is the example itself (js/showcase.js), so its view, date, layers, title, `drawn`
   and link are read from there and not repeated here; an own step carries them and its link is the
   captured one below. `hash` is null until the step is captured (a reader that needs the link says so
   rather than inventing one). */
export function resolveStep(step) {
  if (step.example) {
    const s = SHOWCASE.find((x) => x.id === step.example);
    if (!s) return null;
    const c = CAPTURED[s.id];
    return { key: s.id, example: s.id, title: s.title, say: step.say, ask: step.ask, view: s.view, base: s.base,
      at: s.at, layers: s.layers, drawn: s.drawn || {}, hash: (c && c.hash) || null, image: (c && c.image) || null };
  }
  const c = CAPTURED_STEPS[step.id];
  return { key: step.id, example: null, title: step.title, say: step.say, ask: step.ask, view: step.view, base: step.base,
    at: step.at, layers: step.layers, drawn: step.drawn || {}, hash: (c && c.hash) || null, image: null };
}

/** one tour by id, or null */
export function tourById(id) {
  const k = String(id || '').trim().toLowerCase();
  return TOURS.find((t) => t.id === k) || null;
}

/** a tour's steps, resolved (an unresolvable step is dropped — scripts/landing.mjs --check refuses one) */
export function tourSteps(tour) {
  return ((tour && tour.steps) || []).map(resolveStep).filter(Boolean);
}

/* ══ THE GUIDE — Settings ▸ Tutorial, a tour made from the examples ═══════════════════════════════
   (guide-unify) The first-run tutorial used to be its own mechanism in js/onboarding.js: a hand-written list of
   four layers switched on by a timer. It is now a tour like any other and is played by the same player. Its steps
   are DERIVED — the examples of js/showcase.js that say `guide: true`, in that file's order, each with the
   example's own title, sentence, question and captured link — so there is no second list of what to show, and a
   new example joins the guide by one word in its own declaration. It is not in TOURS: it is not a lesson, and
   the teacher pages and the picker list TOURS. `?tour=guide` reopens it. Only an example that has been captured
   (it has a link) is a step. */
export const GUIDE_TOUR_ID = 'guide';
export function guideTour() {
  const steps = SHOWCASE.filter((s) => s.guide).map((s) => {
    const c = CAPTURED[s.id];
    return c && c.hash ? { key: s.id, title: s.title, say: s.blurb, ask: s.question, hash: c.hash } : null;
  }).filter(Boolean);
  return { id: GUIDE_TOUR_ID, title: LA('A first look at IntMap', 'IntMap をはじめて見る'), steps };
}

/** the picture a tour is shown with: the first of its steps that is an example (it has a screenshot) */
export function tourCover(tour) {
  const s = tourSteps(tour).find((x) => x.image);
  return s ? s.image : null;
}

/* ══ THE ADDRESS OF A TOUR — `?tour=<id>&step=<n>`, n counted from 1 ════════════════════════════════
   The query names the tour and the step; the fragment, when present, is that step's own share link, so
   the page opens on the step's map through the ordinary boot restore (js/map-ui.js) — the reader's saved
   session yields to a link that carries a state — and the player only has to show the words. A link
   with no fragment (typed by hand) works too: the player restores the step itself. */
export function tourQuery(id, n, t) {
  return '?tour=' + encodeURIComponent(id) + (t ? '&t=' + t : '') + '&step=' + Math.max(1, Math.round(+n || 1));
}
export function tourLink(id, n) {
  const t = tourById(id); if (!t) return null;
  const steps = tourSteps(t); const i = Math.min(steps.length, Math.max(1, Math.round(+n || 1)));
  const st = steps[i - 1]; if (!st) return null;
  return './index.html' + tourQuery(t.id, i) + (st.hash || '');
}
/** `?tour=…&step=…` read back → { id, step } (step counted from 1) and, for a written tour, `t` — its own text; or null */
export function tourFromSearch(search) {
  let q; try { q = new URLSearchParams(String(search || '')); } catch (_) { return null; }
  const id = q.get('tour'); if (!id) return null;
  const n = parseInt(q.get('step') || '1', 10);
  const out = { id: String(id).trim().toLowerCase(), step: Number.isFinite(n) && n > 0 ? n : 1 };
  const t = q.get('t'); if (t) out.t = t;   /* only a written tour has one */
  if (q.get(TOUR_EDIT_PARAM) === '1') out.edit = true;   /* (curriculum-sales-kit) open it in the builder, not the player */
  return out;
}

/* ══ A TOUR WRITTEN BY A READER — `?tour=custom&t=<the tour>&step=<n>` (tour-builder) ═══════════════════
   A teacher's own tour (js/tour-builder.js) is kept nowhere but in its address: no account, no server, no
   table. `t` is the tour — its title and, per step, the step's map link (the codec's own fragment, js/map-state.js
   `MapState.hash()`), its title, the words to read out and the question for the class — as JSON, compressed with
   DEFLATE (the platform's CompressionStream) and written in base64url, so it needs no escaping in a query.
   The first character says how the rest is written, so a link written today stays readable when the form changes:
     'z'  deflate-raw of the UTF-8 JSON (every browser IntMap supports, Node ≥ 18)
     'j'  the UTF-8 JSON itself — written only where CompressionStream is missing; read everywhere
   The JSON is { v: 1, n: title, s: [[fragment without '#', title, say, ask], …] }.
   ⚠ THE PLAYER DOES NOT TRUST THE TEXT. Every step's fragment is read by the codec and WRITTEN AGAIN by it
   (MapState.encode(MapState.decode(…))): a fragment that names no map becomes a step with no link (the player
   says so — js/tour-player.js `no-link`), and nothing the codec does not write reaches the address bar. The words
   are plain text, escaped where they are shown. */
export const CUSTOM_TOUR_ID = 'custom';

/* ⚠ THE LIMIT IS THE SERVER'S, AND IT WAS MEASURED. The query is sent to the server (the fragment is not), and
   the hosted site (GitHub Pages) answers a request whose path + query is longer than 8,192 bytes with
   «414 URI Too Long» — measured 2026-10-03 by bisection against the production origin: a path + query of 8,192
   bytes is served (200), 8,193 is refused (414). So the builder holds `location.pathname + query` to this, and
   says so before a step that would cross it is added. It is invalid the day the app is served from another host
   (re-measure; the method is in dev-notes/2026-10-03-tour-builder.md) or the tour moves out of the query. */
export const TOUR_REQUEST_LIMIT = 8192;

/* (map-document-unify) the packing is js/link-codec.js — the same bytes this file wrote with its own copy, which the
   briefing's codec also had (tests/map-document-unify-checks holds a tour written by that copy against this one) */

/* ⚠ HOW BIG A TOUR MAY INFLATE TO. A `t` is somebody else's bytes, and DEFLATE can expand a few kilobytes a
   thousandfold, so the reader stops at this size and the tour is not read (the player then shows the list of
   tours, as for any unreadable `t`). A DECISION, NOT A MEASUREMENT: twice the account's ceiling on one saved
   document's steps (supabase/migrations/20261004120000_map_documents.sql, 1 MiB) — the largest tour IntMap itself
   writes into a `t` is a saved document played from the Library — doubled for the JSON escaping that differs
   between the two spellings. Expire when that ceiling moves. */
export const TOUR_INFLATED_MAX = 2 * 1048576;

/** a written tour → the text of its `t` parameter. `tour` is { title, steps: [{ hash, title, say, ask }] }.
    `opts.plain` — the uncompressed letter (js/link-codec.js packText: for a link a generator writes into a page) */
export async function encodeCustomTour(tour, opts) {
  const steps = ((tour && tour.steps) || []).map((s) => [String((s && s.hash) || '').replace(/^#/, ''), String((s && s.title) || ''), String((s && s.say) || ''), String((s && s.ask) || '')]);
  const json = JSON.stringify({ v: 1, n: String((tour && tour.title) || ''), s: steps });
  return packText(json, opts);
}

/** the text of a `t` parameter → { title, steps: [{ key, title, say, ask, hash }] }, or null when it is not a tour.
    `canon(hash)` writes a fragment again through the map's codec ('' when it names no map) — js/map-state.js, handed
    in so this file stays readable without a DOM. */
export async function decodeCustomTour(t, canon) {
  const s = String(t || ''); if (s.length < 2) return null;
  /* the ceiling is this file's (TOUR_INFLATED_MAX); the letter and the bytes are js/link-codec.js's */
  const json = await unpackText(s, TOUR_INFLATED_MAX);
  if (json == null) return null;
  let o; try { o = JSON.parse(json); } catch (_) { return null; }
  if (!o || o.v !== 1 || !Array.isArray(o.s)) return null;
  const steps = o.s.filter(Array.isArray).map((r, i) => {
    let hash = null;
    try { const h = canon ? canon('#' + String(r[0] || '')) : ''; hash = h || null; } catch (_) { hash = null; }
    return { key: CUSTOM_TOUR_ID + '-' + (i + 1), title: String(r[1] == null ? '' : r[1]), say: String(r[2] == null ? '' : r[2]), ask: String(r[3] == null ? '' : r[3]), hash };
  });
  return { title: String(o.n == null ? '' : o.n), steps };
}

/* (curriculum-sales-kit) THE SAME ADDRESS, OPENED IN THE BUILDER. `&edit=1` asks js/tour-player.js bootFromUrl to hand the
   tour to js/tour-builder.js openBuilder({ load }) — the path «Edit this tour» takes — instead of playing it, so a page can
   give a teacher a draft to start from (curriculum.html: the maps of one curriculum unit as the first steps) with no
   second editor. The builder asks before the draft replaces one the teacher is writing. */
const TOUR_EDIT_PARAM = 'edit';

/** the share link of a written tour, opening at step 1: the query carries the tour, the fragment the first step's
    map (so the page opens on it through the ordinary boot restore, as a declared tour's link does).
    `opts.edit` — open it in the tour builder rather than the classroom mode (TOUR_EDIT_PARAM) */
export function customTourLink(base, t, firstHash, opts) {
  return String(base || './index.html') + tourQuery(CUSTOM_TOUR_ID, 1, t) + (opts && opts.edit ? '&' + TOUR_EDIT_PARAM + '=1' : '') + (firstHash || '');
}

/* ⚠ GENERATED TOUR STEPS — BEGIN (node scripts/showcase-capture.mjs; DO NOT EDIT) */
export const CAPTURED_STEPS = {
  "europe-1918-armistice": {
    "hash": "#v=22.0000,48.5000,3.30,0,0,f&tt=1918-11-11"
  },
  "east-asia-1853": {
    "hash": "#v=125.0000,38.0000,3.40,0,0,f&tt=1853-07-08"
  },
  "east-asia-1861": {
    "hash": "#v=125.0000,38.0000,3.40,0,0,f&tt=1861-01-01"
  },
  "east-asia-1876": {
    "hash": "#v=125.0000,38.0000,3.40,0,0,f&tt=1876-03-01"
  },
  "japan-1868": {
    "hash": "#v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01"
  },
  "japan-1872": {
    "hash": "#v=136.5000,36.0000,5.00,0,0,f&tt=1872-07-01"
  },
  "europe-1991": {
    "hash": "#v=16.0000,52.0000,3.20,0,0,f&tt=1991-07-01"
  },
  "europe-1993": {
    "hash": "#v=38.0000,50.0000,2.60,0,0,f&tt=1993-01-01"
  },
  "plates-pacific": {
    "hash": "#v=-175.0000,8.0000,1.50,0,0,f&l=eco-dl-plates"
  },
  "plates-japan": {
    "hash": "#v=138.0000,36.5000,4.30,0,0,f&l=eco-dl-plates,beta-dl-volc2"
  },
  "plates-iceland": {
    "hash": "#v=-19.0000,64.8000,4.20,0,0,f&l=eco-dl-plates,beta-dl-volc2"
  }
};
/* ⚠ GENERATED TOUR STEPS — END */
