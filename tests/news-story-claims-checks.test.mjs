/* ============================================================================
 *  news-story-claims — what a news event's reader and its story say is NEW, is the SAME, and FOLLOWS
 * ----------------------------------------------------------------------------
 *  Three defects, each reproduced on the shipped functions before it was fixed (2026-11-17):
 *    A. «What the latest report added» (js/news-brief.js latest) showed a re-run as news: on production
 *       (1,000 active events) 14 of the 187 sections quoted a sentence an earlier article had already printed —
 *       The Japan Times ran «Man arrested in Osaka…» on 15 and 16 November with the same standfirst.
 *    B. Quantities (js/news-claims.js): ① money had no currency, so «£10 billion» and «$10 billion» were the same
 *       figure; ② a death toll counted up over the day (10, later 15) was «where outlets differ».
 *    C. «Follow this story» (js/news-story-core.js suggest / lineage) from «Trump, Xi, Putin to hold historic
 *       meeting in China: White House» suggested «white + house» and listed 45 events, one of them the summit.
 *  Every assertion calls the shipped function. The production rows below were read through the public REST API
 *  (anon) on 2026-11-17: public.news_story_terms for the summit's headline, and public.news_story for «putin» and
 *  for «house + white» over the 60 days to 2026-11-17T12:00Z, each event with its articles' headlines.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { makeNewsClaims } from '../js/news-claims.js';
import { makeNewsBrief } from '../js/news-brief.js';
import { DEFAULTS as CLUSTER } from '../supabase/functions/_shared/news-cluster.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const core = await import('../js/news-story-core.js');
const C = makeNewsClaims();
const B = makeNewsBrief(C);

/* ══ A. a re-run is not what the latest report added ═══════════════════════════════════════════════ */
const m = (o) => ({ id: o.id, title: o.title || 'Headline', description: o.description || '', url: '', sourceId: o.sourceId || 'a',
  sourceName: o.sourceName || o.sourceId || 'a', family: o.family || o.sourceId || 'a', publishedAt: o.publishedAt });

test('A ① the same article printed again a day later adds nothing (production: The Japan Times, 15 and 16 November)', () => {
  const art = { title: 'Man arrested in Osaka for alleged abuse and murder of daughter', sourceId: 'japantimes',
    description: 'According to an expert committee, 50 children died from physical abuse or neglect in Japan in fiscal 2024.' };
  const b = B.build([m({ id: 1, ...art, publishedAt: '2026-11-15T03:35:00+00:00' }), m({ id: 2, ...art, publishedAt: '2026-11-16T02:15:00+00:00' })]);
  assert.equal(b.latest, null, 'a re-run is shown as «what the latest report added»');
});

test('A ② a later report from another outlet that repeats an earlier sentence adds nothing; a new sentence still does', () => {
  const first = m({ id: 1, sourceId: 'dw', title: 'Jordan bans Telegram app over radicalisation claims', publishedAt: '2026-11-16T07:00:00Z',
    description: 'Jordan has imposed a ban on Telegram over a deadly church attack which left seven people dead. Iraq later followed with a partial ban to compel the company to review its content.' });
  /* the same sentence, re-worded only by a word or two — the words of the new sentence are all in the earlier one */
  const echo = m({ id: 2, sourceId: 'aljazeera', title: 'Jordan blocks Telegram', publishedAt: '2026-11-16T10:00:00Z',
    description: 'Jordan has imposed a ban on Telegram over the deadly church attack which left seven people dead.' });
  assert.equal(B.build([first, echo]).latest, null, 'a sentence the earlier article already said is shown as new');
  const more = m({ id: 3, sourceId: 'aljazeera', title: 'Jordan blocks Telegram', publishedAt: '2026-11-16T12:00:00Z',
    description: 'Jordan has imposed a ban on Telegram over the deadly church attack which left seven people dead. Telegram said it would appeal the decision in a Jordanian court next week.' });
  const L = B.build([first, more]).latest;
  assert.ok(L, 'a genuinely new sentence is not shown');
  assert.match(L.text, /appeal the decision/, 'the sentence shown is the new one, not the repeated one');
});

test('A ③ a figure is new only if no earlier report stated the same kind, the same written unit and the same value', () => {
  const base = { sourceId: 'a', publishedAt: '2026-11-16T01:00:00Z', title: 'Government pledges $3 billion for flood recovery' };
  const same = B.build([m({ id: 1, ...base }), m({ id: 2, sourceId: 'b', publishedAt: '2026-11-16T06:00:00Z', title: 'Flood aid: $3 billion pledged by government' })]);
  assert.equal(same.latest, null, 'the same $3 billion is not a new figure, and nothing else is new');
  const other = B.build([m({ id: 1, ...base }), m({ id: 2, sourceId: 'b', publishedAt: '2026-11-16T06:00:00Z', title: 'Britain adds £3 billion to flood aid' })]);
  assert.ok(other.latest && other.latest.figures.some((f) => f.unit === '£' && f.value === 3e9), '£3 billion is a different figure from $3 billion');
});

/* ══ B. quantities: the currency is part of the amount; a toll counted up is an update ═══════════════ */
test('B ① money keeps the currency as written; amounts in different currencies are never the same figure', () => {
  const q = (t) => C.quantities(t).map((x) => [x.kind, x.unit, x.value]);
  assert.deepEqual(q('UK pledges £10 billion'), [['money', '£', 1e10]]);
  assert.deepEqual(q('US$3bn and HK$4 million'), [['money', 'US$', 3e9], ['money', 'HK$', 4e6]]);
  assert.deepEqual(q('a 10 billion dollars fund'), [['money', 'dollar', 1e10]]);
  assert.deepEqual(q('India fines firm 5 billion rupees'), [['money', 'rupee', 5e9]]);
  assert.deepEqual(q('3兆円の予算'), [['money', '円', 3e12]]);
  assert.deepEqual(q('raised 10 billion in new debt'), [], 'an amount with no written unit is not an amount of anything');
  assert.deepEqual(q('200 pounds of gold seized'), [], 'a currency word with no magnitude is not read (pounds weigh too)');
  /* agreement / difference only inside one unit */
  const two = [
    { title: 'UK pledges £10 billion to the fund', description: '', source: 'BBC', family: 'bbc' },
    { title: 'US pledges $10 billion to the fund', description: '', source: 'AP News', family: 'apnews' },
  ];
  assert.equal(C.differences(two).length, 0);
  const brief = B.build(two.map((x, i) => m({ id: i, title: x.title, sourceId: x.family, publishedAt: '2026-11-16T0' + i + ':00:00Z' })));
  assert.equal(brief.agreements.length, 0, '£10bn and $10bn were shown as outlets agreeing');
  assert.equal(brief.figures.length, 2, 'the two amounts are two figures');
  const close = C.differences([
    { title: 'Pledge of £10 billion', description: '', source: 'BBC', family: 'bbc' },
    { title: 'Pledge of $10.2 billion', description: '', source: 'CNBC', family: 'cnbc' },
  ]);
  assert.equal(close.length, 0, 'two currencies are compared as if one');
  /* the written spelling of the SAME unit still meets: «$966 million» vs «nearly $1 billion» (production, #R394) */
  const uber = C.differences([
    { title: 'Dutch regulator fines Uber $966 million', description: '', source: 'Reuters', family: 'reuters' },
    { title: 'Uber fined nearly $1 billion by Dutch regulators', description: '', source: 'AP News', family: 'apnews' },
  ]);
  assert.equal(uber.length, 1);
  assert.equal(uber[0].unit, '$');
});

test('B ② a cumulative toll that rises with time is an update, not a disagreement — and only that', () => {
  const at = (h) => '2026-11-17T' + String(h).padStart(2, '0') + ':00:00Z';
  const rising = [
    { title: 'Quake kills 10 in the north', description: '', source: 'BBC', family: 'bbc', at: at(1) },
    { title: 'Quake death toll rises: kills 15', description: '', source: 'AP News', family: 'apnews', at: at(6) },
  ];
  const r = C.compare(rising);
  assert.equal(r.differences.length, 0, 'a toll counted up over the day is shown as outlets differing');
  assert.equal(r.updates.length, 1);
  assert.deepEqual(r.updates[0].claims.map((c) => [c.value, c.source]), [[10, 'BBC'], [15, 'AP News']], 'in the order they were reported');
  assert.equal(C.differences(rising).length, 0, 'differences() is compare().differences');
  /* the property, not a count: falling with time, two values at one instant, or no time at all is a difference */
  assert.equal(C.compare([{ ...rising[0], title: 'Quake kills 15', at: at(1) }, { ...rising[1], title: 'Quake kills 10', at: at(6) }]).differences.length, 1, 'a later, smaller toll is a disagreement');
  assert.equal(C.compare([{ ...rising[0], at: at(3) }, { ...rising[1], at: at(3) }]).differences.length, 1, 'two values at the same instant are a disagreement');
  assert.equal(C.compare(rising.map(({ at: _, ...x }) => x)).differences.length, 1, 'without times there is nothing to order: as before, a difference');
  assert.equal(C.KIND_INFO.money.cumulative, false);
  const money = C.compare([
    { title: 'Firm fined $966 million', description: '', source: 'Reuters', family: 'reuters', at: at(1) },
    { title: 'Firm fined nearly $1 billion', description: '', source: 'AP News', family: 'apnews', at: at(5) },
  ]);
  assert.equal(money.differences.length, 1, 'an amount is not a running count: rising with time is still a difference');
  /* the reader's brief carries the article times through */
  const b = B.build(rising.map((x, i) => m({ id: i, title: x.title, sourceId: x.family, publishedAt: x.at })));
  assert.equal(b.differences.length, 0);
  assert.equal(b.updates.length, 1);
});

/* ══ C. the story: the centre of the event, and what follows from it ════════════════════════════════ */
const FX = {
  read: "2026-11-17", since: "2026-09-18T12:00:00.000Z", until: "2026-11-17T12:00:00.000Z",
  seed: "emwftj4awc27e1b63de",
  seedTitles: ["Trump, Xi, Putin to hold historic meeting in China: White House","Trump, Xi and Putin plan unprecedented joint meeting on APEC sidelines, White House and Kremlin say","Trump, Putin and Xi plan historic joint meeting in China next week, White House says","Trump, Xi and Putin to hold unprecedented meeting, White House says","Trump-Xi-Putin trilateral meeting at APEC: What to expect","A new 'Yalta'? Trump and Putin push for a meeting that Xi is wary of hosting","Trump, Xi and Putin plan an unprecedented meeting during APEC","What to expect from Trump and Xi's upcoming meeting in China","China confirms Xi-Trump-Putin historic summit. What will be on the agenda?","China confirms first Xi-Trump-Putin summit on Thursday","China says Xi-Putin-Trump meeting has 'groundbreaking significance'"],
  stats: {"n":16891,"terms":[{"t":"historic","df":58,"cap":1,"occ":47},{"t":"white","df":73,"cap":24,"occ":43},{"t":"putin","df":82,"cap":47,"occ":47},{"t":"meeting","df":84,"cap":0,"occ":72},{"t":"hold","df":98,"cap":0,"occ":79},{"t":"house","df":150,"cap":60,"occ":96},{"t":"china","df":439,"cap":204,"occ":204},{"t":"trump","df":994,"cap":476,"occ":476}],"pairs":[["house","white",45],["china","meeting",12],["hold","meeting",9],["meeting","putin",7],["china","putin",6],["china","hold",5],["china","house",4],["historic","putin",3],["hold","putin",3],["china","historic",2],["china","white",2],["historic","hold",2],["historic","house",2],["historic","meeting",2],["historic","white",2],["hold","house",2]]},
  putin: [
    ["emuehn27pdd8c02a9bf","2026-09-23T18:53","Ukraine: Zelensky says Putin 'patient zero' for spreading war"],
    ["emv0wyne60da75c8285","2026-10-14T00:12","Senators Urge Trump to Reverse Diesel Deal With Putin"],
    ["emv85qcbvdad90d4a53","2026-10-15T10:59","Trump's Russia diesel deal may offer Putin more than money — and spell trouble for Ukraine"],
    ["emvb8h1xa8c294cc332","2026-10-16T16:01","Putin told Pope Leo he backs Vatican idea to help civilians in Oleshky, Kremlin says"],
    ["emvb8h1xa32d49b192a","2026-10-16T16:23","Putin says Russia is building non-negotiable 'security zone' in Ukraine along border"],
    ["emvbcrdur30cab0dbb9","2026-10-16T17:37","Putin agrees to cooperate with Pope Leo's plea for aid for Ukrainian town"],
    ["emvc872ct03abac8e2e","2026-10-16T17:40","Pope speaks with Putin, denouncing recent attacks as he shows recovery from lung surgery progressing"],
    ["emvbc1mct11e7c1cc1a","2026-10-16T17:51","Pope speaks to Putin from hospital, voices concern over Ukraine"],
    ["emvb7s2c596a9bc37e6","2026-10-16T19:04","Pope Asks Putin for a Cease-Fire for a Ukrainian City Under Siege"],
    ["emve0hs9pd34b83cee5","2026-10-18T13:49","Zelenskyy says US taking Putin's side would be 'historic mistake' - as Russian oil sites attacked"],
    ["emveictsw1afa9b1965","2026-10-19T00:06","Inside the shadowy world of anti-Putin sabotage from within Russia"],
    ["emveq7w3sf7a0fd5a23","2026-10-19T02:52","Putin reportedly proposes summit with Trump and Xi to discuss Ukraine deal"],
    ["emvezi2a9ee04299985","2026-10-19T06:53","Putin approves Russian government reshuffle after parliamentary election, state media report"],
    ["emvf9iiaf8cd6f39d22","2026-10-19T12:35","Trump says he is open to joining trilateral meeting with Xi, Putin"],
    ["emvfuxqmac572fbf996","2026-10-20T02:13","What China wants from a Trump-Putin summit on Ukraine"],
    ["emvgmt1tj498e3fa80d","2026-10-20T10:21","Kremlin hopes Witkoff can brief Putin soon on latest Ukrainian/European thinking on peace deal"],
    ["emvh5dm53ba3293be2c","2026-10-20T20:29","Is Putin’s Waiting Game Working?"],
    ["emvdzrzdoeb66f793fd","2026-10-20T23:48","Trump envoy Witkoff meets Russia’s Putin for Ukraine war talks"],
    ["emvi8oax536bc12e70e","2026-10-21T14:44","Peter Zalmayev: 'Ukraine was showing all sorts of cards that Trump took away and gave to Putin'"],
    ["emvifth1u467d6a50be","2026-10-21T17:57","‘You are a humanitarian also, sir’: the US feeds Putin with lies as Ukraine’s children take cover and die | Andrew Roth"],
    ["emviior0k0bfdff05be","2026-10-21T18:53","Trump faces fresh questions over ties to 'humanitarian' Putin"],
    ["emviptiz69ad02a2f3a","2026-10-21T21:03","Russia frees retired US schoolteacher in goodwill gesture as Putin meets Witkoff"],
    ["emvisoao9cc2b885560","2026-10-21T23:59","Putin releases hostage to U.S., drawing praise from Trump administration"],
    ["emvj4tucq0bbb5aabdd","2026-10-22T05:54","Ukraine’s Pavlohrad refuses to yield to Putin despite unrelenting bombardment"],
    ["emvjcoigi16b4ba1f4a","2026-10-22T09:32","Putin Nears a Prize: Restoring Ties With the U.S. While Giving Up Nothing"],
    ["emvjnegev84abff7b59","2026-10-22T12:41","Poland detains second suspect in murder of Russian artist who criticised Putin"],
    ["emvk099je5d2f5422cb","2026-10-22T13:35","Putin’s War On Ukraine Puts Oil Giant Rosneft Under Mounting Pressure"],
    ["emvjsegfqc5c7a9daaa","2026-10-22T16:33","Downing Street rejects Witkoff’s description of Putin as a ‘humanitarian’"],
    ["emvkf9hc463ea7c759f","2026-10-22T21:28","Putin says talks must focus on security for Russia, Ukraine and Europe overall"],
    ["emvqk0zw37d445dee7d","2026-10-27T12:54","Norway and Finland leaders hold rare call with Putin"],
    ["emvqw68t7966d23f0f3","2026-10-27T16:06","Two Nordic leaders urge Putin to end Ukraine war in rare direct contact by Europeans"],
    ["emvs06lvi701e777618","2026-10-27T16:23","Kyiv hopes for ‘new momentum’ in peace talks after Finnish and Norwegian leaders’ call with Putin – as it happened"],
    ["emvrpgpgvbea8f129d4","2026-10-28T05:53","Putin woos African leaders as Moscow seeks to expand footprint in Africa"],
    ["emvrvwitr3c74cbcd2a","2026-10-28T08:47","Trump's relationship with Putin comes under fire ahead of the midterms"],
    ["emvs0wgzlbf60bd30df","2026-10-28T10:19","Norway's premier says call with Putin was effort to present European views"],
    ["emvscc0j6e06db339da","2026-10-28T14:55","Putin praises Elon Musk as a ‘genius’ as Russia develops Starlink alternative"],
    ["emvtumsoh66d5321a84","2026-10-28T19:13","Putin: Russia is African continent’s best partner, not ‘colonial’ West"],
    ["emvtc2i3kd29bcf5a71","2026-10-29T04:01","As war strains Kremlin finances, Putin reaches into more pockets in search of new revenue streams"],
    ["emvtkmuom287d9f7be1","2026-10-29T12:55","​Pragmatic or pointless? Europe’s rift over whether to pick up the phone to Putin"],
    ["emvugrsng6ae287435d","2026-10-29T22:09","Putin says Moscow seeks better European ties, conflict will produce no winners"],
    ["emvv77jmw92cefd1456","2026-10-30T16:24","Could US midterms impact the EU? Transatlantic ties hit new low after Trump-Putin diesel deal"],
    ["emvxoigjh3f3b3c9508","2026-11-01T10:04","Putin Breaks Down His Isolation, With a Big Assist From Trump"],
    ["emvyj8hcw940245c99e","2026-11-02T00:29","An assault on Syria's Idlib looms as Putin, Erdogan, and Rouhani meet"],
    ["emw0ryuz30db6dc9b21","2026-11-02T23:35","Ukraine’s Zelenskyy hopes Abu Dhabi talks will open path to Putin meeting"],
    ["emw2i4jg487683e7858","2026-11-04T13:39","‘We are a threat to Putin’: the small Norwegian news outlet with half its staff on Russia’s wanted list"],
    ["emw0yeg5je41d7e09c0","2026-11-05T09:05","Trump says Russia-Ukraine deal is near after meeting Putin’s envoy"],
    ["emw3h4y0w55d64589be","2026-11-05T10:17","Turkey's Erdogan says he wants to discuss ending Russia-Ukraine war with Putin after talks with Zelenskiy"],
    ["emw3kpha55b3a9aa7b5","2026-11-05T11:58","Putin will not be invited to Britain's G20 summit, UK PM Burnham says"],
    ["emw3muqha70f95e0a5a","2026-11-05T12:35","Putin seizes control of Japan Tobacco's Russian assets"],
    ["emw3tzvkl29aea7011c","2026-11-05T18:59","Iran’s security chief meets Putin, delivers message from Khamenei"],
    ["emw4e01ow017394937f","2026-11-06T02:33","Vladimir Putin calls out nations opposing Russia’s return to international sports"],
    ["emw4izzy7352e4725e9","2026-11-06T12:28","A Trump-Putin-Xi Summit? That Might Be Awkward for One of Them."],
    ["emw5d0i2oe1b6a7ca84","2026-11-06T19:00","Midterms give Ukrainians cautious hope for aid, even as Trump talks deals with Putin"],
    ["emw5xq7qu314517c263","2026-11-07T01:52","China confirms discussions are underway on a historic Xi-Trump-Putin meeting"],
    ["emw74lc8t7e27f87cf6","2026-11-07T13:29","Putin expands temporary administration of Japan Tobacco assets in Russia"],
    ["emw8pqyzdc5c1245d92","2026-11-09T02:33","Trump-Xi-Putin trilateral summit moves closer to reality"],
    ["emwahc36pdaf873d8a0","2026-11-10T09:11","The war Putin wanted to keep away is coming home to Russia"],
    ["emwajhg2d4ba61e0af5","2026-11-10T10:04","Why U.S. Business Deals Are Unlikely to Get Putin to Give Any Ground"],
    ["emwd9cxmeb438fce51c","2026-11-12T07:39","Russia's 'hidden mobilization': The 'expendable' lives fueling Putin's war on Ukraine"],
    ["emwda2h31f2fd60283e","2026-11-12T08:00","Xi-Trump-Putin summit evokes 1945 Yalta carve-up"],
    ["emwdwy4e4cc6d0eaf40","2026-11-12T18:20","Putin takes hard line in US talks as Ukraine says Starlink disrupted again"],
    ["emwdzsj7b2829adb416","2026-11-12T18:45","Winter is coming: Putin seeks to 'hammer Ukrainians, their power grid, their water supplies'"],
    ["emwf33dco9235177d35","2026-11-12T22:26","Putin takes hard line in US talks as Ukraine says Starlink disrupted again"],
    ["emweo35cy77b55c1f6c","2026-11-13T07:19","The real winner in Poland’s constitutional battle is Putin"],
    ["emwf33dco95ab363267","2026-11-13T13:15","Germany's Merz asks Trump for 'no surprises' from Putin talks"],
    ["emwf8tvlg763f08eb49","2026-11-13T16:40","Rosenberg: Uncompromising Putin ups demands for peace with Ukraine"],
    ["emwiter7a969082514b","2026-11-13T21:38","Trump to hold summit with Xi, Putin in Shenzhen on Thursday, NY Post reports"],
    ["emwjq9iqfbb7e33b992","2026-11-14T00:00","Putin lets Europe join Ukraine peace talks, Zelenskiy welcomes prospect of European participation"],
    ["emwftj4awc27e1b63de","2026-11-14T00:23","Trump, Xi, Putin to hold historic meeting in China: White House","Trump, Xi and Putin plan unprecedented joint meeting on APEC sidelines, White House and Kremlin say","Trump, Putin and Xi plan historic joint meeting in China next week, White House says","Trump, Xi and Putin to hold unprecedented meeting, White House says","Trump-Xi-Putin trilateral meeting at APEC: What to expect","A new 'Yalta'? Trump and Putin push for a meeting that Xi is wary of hosting","Trump, Xi and Putin plan an unprecedented meeting during APEC","What to expect from Trump and Xi's upcoming meeting in China","China confirms Xi-Trump-Putin historic summit. What will be on the agenda?","China confirms first Xi-Trump-Putin summit on Thursday","China says Xi-Putin-Trump meeting has 'groundbreaking significance'"],
    ["emwgw3z4z419ab00b68","2026-11-14T15:46","Zelenskyy says a new European security framework floated by US could benefit Putin"],
    ["emwhg3z5e1cc352723e","2026-11-15T06:12","Trump-Putin-Xi meeting likely to be short on substance, rich in symbolism"],
    ["emwhgtgyi96f4a79e6c","2026-11-15T06:22","Anthony Albanese welcomes Trump-Xi-Putin summit – even as European leaders express reservations"],
    ["emwf58eu154113473af","2026-11-15T06:31","Beijing faces its Russia dilemma amid talk of Xi-Trump-Putin summit","Beijing faces Russia bind amid talk of Xi-Trump-Putin summit"],
    ["emwiip0k842048ce9b2","2026-11-16T00:13","Russia's mega-rich are already imagining a future after Putin","Russia's mega-rich are already imagining a post-Putin future"],
    ["emwioem2dd91c409a68","2026-11-16T02:41","Seoul to closely monitor N. Korean official's Russia trip before Trump-Xi-Putin summit"],
    ["emwj2ov00a1ef4b58ae","2026-11-16T04:12","Trump Looks to Flex Power at Xi, Putin Summit After Midterm Loss"],
    ["emwizu6wj6d924c2e31","2026-11-16T08:14","(News Focus) N. Korean nuclear issue unlikely to feature prominently at Trump-Xi-Putin summit: experts","(LEAD) (News Focus) N. Korean nuclear issue unlikely to feature prominently at Trump-Xi-Putin summit: experts"],
    ["emwj19swp65df632628","2026-11-16T08:40","Xi, Trump and Putin to discuss ‘world peace’ at trilateral, says China","Xi, Trump and Putin to discuss 'world peace' at Shenzhen summit, China says","China says Xi, Trump, Putin to discuss 'world peace'"],
    ["emwj44sdo53ae639744","2026-11-16T10:00","Trump heads to Asia to meet with Xi and Putin amid Nvidia fallout","Trump’s Asia trip: Deals in Manila and Shenzhen, nuclear summit with Xi and Putin, maybe Kim meeting","US to curb China's access to AI chips as Trump heads to Asia","Trump to kick off Asia trip with Quad talks in Manila ahead of China visit","Trump heads to Asia for historic nuclear talks with China and Russia"],
    ["emwjj4vmf54fdcf6a68","2026-11-16T14:07","Kremlin says Putin-Xi-Trump meeting in China will have major impact on global affairs"],
    ["emwjjunh15e87eebfe8","2026-11-16T15:49","Russia warns UK over G20 presidency after London says Putin won't come to its summit"],
    ["emwkaztcub643858ce2","2026-11-17T04:33","Taiwan, Japan flag incursions by Russian aircraft as Putin set to arrive in China"],
  ],
  whiteHouse: [
    ["emu5z4wzc3b2cb72cbe","2026-09-25T18:36","US judge blocks Trump’s White House ban on CNN, MS NOW, and Politico"],
    ["emuka8yk74b3117bf1a","2026-09-27T15:41","CNN, MS NOW and Politico ask a court to block Trump from enforcing his White House media ban"],
    ["emulm48smadfd824143","2026-09-28T19:39","Trump announcing a new Iowa steel plant that the White House says will be the nation's biggest"],
    ["emv7kao7g4f94353699","2026-10-14T15:15","Judge extends block on Trump White House ban of MS NOW, CNN and Politico"],
    ["emv9b66l929e3bd5079","2026-10-15T08:46","Order to limit Starshield for Ukraine came from White House, sources say"],
    ["emvbnh38f8662e37607","2026-10-16T23:07","Painting Eisenhower Building would diminish historic character of White House complex, report says"],
    ["emv4dzfjw30196ab436","2026-10-17T09:14","White House press secretary Katie Zacharia fired after five days on the job"],
    ["emvh3yf6h5ed9dcfb3f","2026-10-20T19:48","Zelenskyy visits Norway amid Trump White House tensions"],
    ["emvjkjnqb24f0e6ced2","2026-10-24T12:59","Catholic bishops accuse Trump White House of turning prayer into campaign photo op"],
    ["emvpjl6g4b4066db874","2026-10-26T17:36","The arc of Trump: How the president lost the coalition that put him in the White House"],
    ["emvpmg6d776a7a344e6","2026-10-26T18:29","Trump faces private citizens lawsuit over limiting White House media access"],
    ["emvr8bq56f24bef3c55","2026-10-27T22:40","Grand jury declines to indict former White House aide Cassidy Hutchinson, source says"],
    ["emvsjhbmd156c4fc1be","2026-10-28T20:21","CNN, MS Now and Politico Update Lawsuit Against Trump Over White House Access"],
    ["emvtxhdipad365224ab","2026-10-29T15:39","September 2027 trial date set for man charged with attacking White House correspondents’ dinner"],
    ["emvvcxa85db30128baf","2026-10-30T16:30","Air Force One flyover for White House Halloween event causes flight delays"],
    ["emvzto8rtc6e01fd159","2026-11-02T19:51","US senator wants 'full accounting' of Air Force One White House flyover"],
    ["emw2f9p3e7310634297","2026-11-04T20:30","After Republicans routed, Trump devotes first post-midterm event to White House ballroom"],
    ["emw2pzln52b6ae8f902","2026-11-04T22:55","White House panel delays hearing on Fed's Lisa Cook to Dec. 14"],
    ["emw3ikacmc5ca2fe5ed","2026-11-05T19:52","Midterms over, Democrats eye wide-open 2028 White House race"],
    ["emw48zz1a860745ae2e","2026-11-06T00:24","Marco Rubio denies plans to leave post for White House bid"],
    ["emw58pzqr3108bcfeeb","2026-11-06T17:01","White House said Starlink donated its service, but tax dollars are funding it"],
    ["emw7vqpca3aee06771d","2026-11-06T20:31","White House recasts Trump arch as military tribute"],
    ["emw5qkugu4f5d9c0599","2026-11-06T22:35","Susie Wiles exits White House as Trump ousts another woman from key role"],
    ["emw5qkugu119f7fbb2b","2026-11-07T00:00","Secret Service arrests man near White House after he said he heard voices telling him to kill Trump"],
    ["emw5p5h76c62d504cf4","2026-11-07T00:31","Man in custody after being found in vehicle near White House with guns"],
    ["emw4tpvh01ef67c206a","2026-11-07T03:02","Stephen Miller named by Trump as White House chief of staff"],
    ["emw7mg9nwf561aaf2b0","2026-11-08T08:06","Staff at the US center for AI safety are reporting to the White House, raising independence concerns"],
    ["emw99r88nfcf8be615c","2026-11-09T12:18","Joe Biden, in White House memoir, says Trump should carry the weight of Jan. 6 riots 'to his grave'"],
    ["emw9l6qe2e12dec3e27","2026-11-09T18:57","Two security breaches near White House prompt brief lockdown"],
    ["emwb6cgiv0cd645e7f0","2026-11-10T20:28","White House vows to press ahead with tariffs despite midterm backlash over rising prices"],
    ["emwb727btb17c9dba0b","2026-11-10T21:00","White House announces funds for law enforcement programme in several cities"],
    ["emwcdx8qd31b4b4e295","2026-11-11T16:54","White House tells Democrats that investigating Trump administration could be criminal"],
    ["emwcpco9377f7c52eb4","2026-11-11T20:11","White House faces unusual obstacle on confirming Trump judges: other Republicans"],
    ["emwdinbbxf0ed4b12ae","2026-11-12T11:20","Vance, Rubio, Ossoff and Buttigieg lead 2028 White House hopefuls, Reuters/Ipsos poll finds"],
    ["emwdu2sff31a12c876f","2026-11-12T14:23","White House weighs Lutnick's ouster after Nvidia scandal"],
    ["emwe1xtuwfc7a8f9983","2026-11-12T17:58","White House set to extend Jones Act shipping waiver, sources say"],
    ["emwe67z721e1f602156","2026-11-12T23:03","ICE reports record-high immigration arrests and deportations since Trump's return to White House"],
    ["emwfjizjc15ff932f4e","2026-11-12T23:42","White House sends CFTC, SEC role picks to Senate for approval"],
    ["emwf6o5bg961f09764c","2026-11-13T11:06","White House urges Congress to provide $30.1 billion for aviation reform"],
    ["emwff8m1b987a62f59c","2026-11-13T19:56","White House denies Hassett departing Trump administration"],
    ["emwfrdv1r34889ce08f","2026-11-13T20:27","Hassett denies report he's leaving White House: 'Not true'"],
    ["emwftj4awc27e1b63de","2026-11-14T00:23","Trump, Xi, Putin to hold historic meeting in China: White House","Trump, Xi and Putin plan unprecedented joint meeting on APEC sidelines, White House and Kremlin say","Trump, Putin and Xi plan historic joint meeting in China next week, White House says","Trump, Xi and Putin to hold unprecedented meeting, White House says","Trump-Xi-Putin trilateral meeting at APEC: What to expect","A new 'Yalta'? Trump and Putin push for a meeting that Xi is wary of hosting","Trump, Xi and Putin plan an unprecedented meeting during APEC","What to expect from Trump and Xi's upcoming meeting in China","China confirms Xi-Trump-Putin historic summit. What will be on the agenda?","China confirms first Xi-Trump-Putin summit on Thursday","China says Xi-Putin-Trump meeting has 'groundbreaking significance'"],
    ["emwfst4rr5443db1fb7","2026-11-14T00:24","White House demanding Japan triple host-nation support for U.S. troops"],
    ["emwjsesuad77b2700de","2026-11-16T21:25","Bessent Takes Hawkish Turn in White House Debate on China"],
    ["emwjtuarzd4f159beb1","2026-11-16T21:52","Trump’s accounts traded up to $97.5 million in Nvidia as Huang gained White House access"],
  ],
};
const asRows = (list) => list.map(([id, at, title, ...more]) => ({ public_id: id, first_published_at: at + ':00Z', representative_title: title,
  news_event_articles: [title].concat(more).map((t) => ({ news_articles: { title: t } })) }));
const STATS = core.decodeTerms(FX.stats);

test('C ① the words: not a pair of names that misses the event, and the centre of the event first (production)', () => {
  const centre = core.centreOf(FX.seedTitles);
  assert.ok(centre.has('putin') && centre.has('meet') && !centre.has('white') && !centre.has('house'),
    'the centre is what most of the 11 headlines share (putin 10, meeting 9), not «White House» (4)');
  const g = core.suggest(STATS, { centre });
  assert.notDeepEqual(g.pick.terms.slice().sort(), ['house', 'white'], 'the summit is followed through «white + house» again');
  assert.ok(g.pick.central && g.pick.terms.some((t) => centre.has(t === 'meeting' ? 'meet' : t)), 'the pick holds a centre word');
  assert.deepEqual(g.pick.terms.slice().sort(), ['meeting', 'putin']);
  const wh = g.choices.find((c) => c.terms.join(',') === 'house,white');
  assert.ok(wh && wh.kind === 'names' && wh.central === false, '«white + house» is still offered — as a pair of names, off the centre');
  assert.ok(g.choices.slice(0, g.choices.indexOf(wh)).every((c) => c.centre >= wh.centre), 'a choice holding less of the centre came first');
  /* opened from words alone (no event, so no centre): a pair of names still comes after the pairs that say what happened */
  assert.notDeepEqual(core.suggest(STATS).pick.terms.slice().sort(), ['house', 'white']);
});

test('C ② the lineage: of the 82 events naming «putin», the 13 that follow from the announcement are the summit', () => {
  const rows = asRows(FX.putin);
  assert.equal(rows.length, 82);
  const L = core.lineage(rows, { seed: FX.seed, terms: ['putin'] });
  assert.equal(L.applied, true);
  assert.equal(L.naming, 82);
  assert.equal(L.rows.length, 13);
  assert.equal(L.dropped, 69);
  const kept = L.rows.map((r) => r.representative_title);
  for (const t of kept) assert.match(t, /Xi|Putin talks|summit/i, t + ' is not the summit');
  assert.ok(kept.some((t) => /^Kremlin says Putin-Xi-Trump meeting/.test(t)));
  assert.ok(!kept.some((t) => /^Putin lets Europe join Ukraine peace talks/.test(t)), 'the thread walked off into the Ukraine talks');
  assert.ok(!kept.some((t) => /Japan Tobacco/.test(t)));
  /* every step is evidence the card shows: within the window, at least LINK_SHARED words besides the story's */
  const byId = new Map(rows.map((r) => [r.public_id, r]));
  for (const [id, step] of L.links) {
    if (!step.from) { assert.equal(id, FX.seed); continue; }
    const dt = Math.abs(Date.parse(byId.get(id).first_published_at) - Date.parse(byId.get(step.from).first_published_at));
    assert.ok(dt <= core.STORY.LINK_GAP_H * 3600e3, id + ' joined across more than the window');
    assert.ok(step.shared.length >= core.STORY.LINK_SHARED && !step.shared.includes('putin'), id + ' joined by ' + step.shared);
  }
});

test('C ③ the reported case: «white + house» from the summit holds 45 events, and only the summit follows from it', () => {
  const rows = asRows(FX.whiteHouse);
  const L = core.lineage(rows, { seed: FX.seed, terms: ['house', 'white'] });
  assert.equal(L.naming, 45);
  assert.deepEqual(L.rows.map((r) => r.public_id), [FX.seed], 'the CNN ban, the ballroom and the flyover follow from the summit');
});

test('C ④ the lineage does not apply where the words are a thread by themselves, or there is no event to follow from', () => {
  const rows = asRows(FX.putin);
  const narrow = rows.filter((r) => /summit/i.test(r.representative_title)).slice(0, core.STORY.ALONE_MAX);
  assert.equal(core.lineage(narrow, { seed: narrow[0].public_id, terms: ['putin'] }).applied, false, 'at most ALONE_MAX events are a thread by the measured rule');
  const noSeed = core.lineage(rows, { seed: null, terms: ['putin'] });
  assert.equal(noSeed.applied, false);
  assert.equal(noSeed.rows.length, 82, 'a story opened from words, a link or Atlas keeps every event the words hold');
  assert.equal(core.lineage(rows, { seed: 'not-a-row', terms: ['putin'] }).rows.length, 82);
});

test('C ⑤ one number for the reporting window, read from the grouper; the card offers every event at a tap', () => {
  assert.equal(core.STORY.LINK_GAP_H, CLUSTER.timeWindowH);
  assert.equal(core.centreOf(['One headline only']), null, 'one headline has no majority to read');
  const story = read('js/news-story.js');
  assert.match(story, /suggest\(stats, \{ centre: centreOf\(seedTitles\) \}\)/, 'the card does not tell suggest() the centre');
  assert.match(story, /lineage\(rows, \{ seed: st\.seed && st\.seed\.id, terms: st\.terms \}\)/, 'the card does not read the lineage');
  assert.match(story, /data-nst="every"/, 'the events the lineage set aside are out of reach');
  assert.match(story, /news_event_articles\(news_articles\(title\)\)/, 'the rows do not carry their articles\' headlines');
});
