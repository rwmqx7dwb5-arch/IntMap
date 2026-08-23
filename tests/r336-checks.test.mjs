/* ============================================================================
 *  IntMap · #R336 — Atlas research.events grouped unrelated stories into one
 *                   "event", and nothing in tests/ had ever looked at it.
 * ----------------------------------------------------------------------------
 *  THE STATE BEFORE THIS ROUND. `research.events` («最近の出来事をまとめて» /
 *  "summarize recent events") shipped in #R76 and ran for 254 rounds with ZERO
 *  tests: no file in tests/ named research.events, newsEvents or groupNews. The
 *  grouping lived inline inside a 58-line `case` in js/atlas-console.js, where
 *  nothing outside the browser could call it — so «it works» was an opinion.
 *
 *  WHAT IT WAS DOING, MEASURED. 1,641 production headlines (Supabase
 *  current_news) run through the shipped locator js/newsgeo.js: 1,005 place at
 *  all, and 499 of those resolve to a COUNTRY — 92 of them stacked on the one
 *  point [-98, 39.5] "United States". #R76's rule was Jaccard ≥0.15, RELAXED to
 *  ≥0.06 when d<30 km && Δt≤24 h. Between two country-level subjects d is
 *  EXACTLY 0, so the relaxed branch is true by construction and 6% is the only
 *  gate left. On 600 of those articles: 283 events, largest 36, and 60% of all
 *  joins came through the relaxed branch. That largest "event" held the Iran
 *  economic war, a 40,000-bottle eye-drops recall, a laptop fire on an American
 *  Airlines flight, US debt passing $40tn and childless Americans' retirement
 *  worries.
 *
 *  WHAT THESE TESTS ARE. The grouping is js/news-cluster.js now — a module, so
 *  the assertions below run THE SHIPPED FUNCTION rather than a copy of it
 *  (#R317: a check that re-implements its subject stops measuring it the first
 *  time the subject moves). The corpus is tests/fixtures/news-events-prod.json:
 *  400 real headlines with the real locator's real answers, captured once.
 *  Nothing here is invented, and ⑤ pins the old constants out of the source so
 *  the relaxation cannot come back by hand.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';   /* (#R283) line endings belong to the checkout, not to the file */
import { makeNewsCluster } from '../js/news-cluster.js';

/* THE SHIPPED FUNCTIONS, not a copy of them — js/atlas-console.js calls the same factory.
   ⚠ It is a factory because tests/r175 ③ forbids unexported top-level declarations in js/
   and fails exports no js/ module imports; see the note at the top of the module. */
const {
  EVENT_RULES, groupNewsEvents, newsTokens, newsSimilarity, newsSubject, isRepresentative, sameArea
} = makeNewsCluster();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const FIX = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/news-events-prod.json'), 'utf8'));
const NOW = Date.parse(FIX.capturedAt);

/* The fixture keeps real pubDates and a fixed capture instant, so "hours ago" is
   a pure function of the fixture — the same shape js/atlas-console.js's _agoH has. */
const agoH = (d) => { const t = Date.parse(d); return isFinite(t) ? Math.max(0, Math.round((NOW - t) / 3600000)) : null; };
const group = (items) => groupNewsEvents(items || FIX.items, { agoH, fallbackH: 96 });
const titles = (ev) => ev.g.map((x) => x.it.title);
const eventWith = (evs, re) => evs.find((e) => titles(e).some((t) => re.test(t)));
/* An order-free identity for a whole grouping. ⚠ JSON, not join('|') — real
   headlines contain '|' ("…in Bali | World News"), and a separator that occurs
   inside the values makes two different groupings compare equal (or, as it did
   here first, one grouping compare unequal to itself). */
const canon = (evs) => evs.map((e) => JSON.stringify(titles(e).slice().sort())).sort();

/* ── ① the fixture is real, and still holds the cases the round was about ──── */
test('#R336 ① the production fixture is intact and discriminating', () => {
  assert.ok(Array.isArray(FIX.items) && FIX.items.length >= 300, `fixture holds ${FIX.items && FIX.items.length} articles`);
  assert.ok(isFinite(NOW), 'fixture has no capturedAt instant — "hours ago" would depend on the wall clock');
  /* every article carries a real subject the shipped locator produced */
  for (const it of FIX.items) {
    assert.ok(it.title && it.pubDate, 'fixture article without a title/pubDate');
    assert.ok(newsSubject(it.analysis), `fixture article has no resolvable subject: ${it.title}`);
  }
  const kinds = {};
  FIX.items.forEach((it) => { const k = newsSubject(it.analysis).kind; kinds[k] = (kinds[k] || 0) + 1; });
  /* ⚠ THE WHOLE DEFECT LIVES IN THIS NUMBER. If country-level subjects ever stop
     dominating the feed the fixture stops probing the thing it was built for. */
  assert.ok(kinds.country >= 100, `only ${kinds.country} country-level subjects — the fixture no longer reproduces the failing shape`);
  const stacked = FIX.items.filter((it) => { const s = newsSubject(it.analysis); return s.kind === 'country' && s.loc[0] === -98 && s.loc[1] === 39.5; });
  assert.ok(stacked.length >= 20, `only ${stacked.length} articles stacked on the United States representative point`);
});

/* ── ② the reported case: one docking point, four different occurrences ────── */
test('#R336 ② Walmart earnings and Walmart Apple Pay are different events', () => {
  const evs = group();
  const earnings = eventWith(evs, /Walmart Beat Earnings/i);
  const applePay = eventWith(evs, /Walmart to let shoppers use Apple Pay/i);
  assert.ok(earnings && applePay, 'the fixture lost the Walmart articles');
  assert.notEqual(earnings, applePay, 'Walmart earnings and Walmart Apple Pay were grouped as one event:\n  ' + titles(earnings).join('\n  '));
  /* …and the split is not achieved by refusing to group anything: the four
     Apple Pay reports ARE one event, which is the same subject point and the
     same 48 h window as the earnings story. Only the wording separates them. */
  assert.ok(applePay.g.length >= 3, `the Apple Pay rollout fragmented into ${applePay.g.length} — over-splitting is not a fix`);
  assert.ok(titles(applePay).every((t) => /apple pay|tap-to-pay/i.test(t)), 'the Apple Pay event absorbed something else:\n  ' + titles(applePay).join('\n  '));
  assert.equal(earnings.g.length, 1, 'the earnings story picked up unrelated Walmart articles:\n  ' + titles(earnings).join('\n  '));
});

/* ── ③ …and the opposite failure is not the fix ────────────────────────────── */
test('#R336 ③ the Swedish school sword attack is ONE event', () => {
  const evs = group();
  const swordEvents = evs.filter((e) => titles(e).some((t) => /sword/i.test(t)));
  const reports = FIX.items.filter((it) => /sword/i.test(it.title));
  assert.ok(reports.length >= 8, `fixture holds only ${reports.length} sword-attack reports`);
  assert.equal(swordEvents.length, 1, 'one occurrence was split across ' + swordEvents.length + ' events:\n'
    + swordEvents.map((e) => '  [' + e.g.length + '] ' + titles(e)[0]).join('\n'));
  assert.equal(swordEvents[0].g.length, reports.length, 'the event dropped reports of the same attack');
  /* every one of those subjects is the SWEDEN representative point — a country
     stack that SHOULD group, because the headlines genuinely agree. */
  assert.ok(swordEvents[0].g.every((x) => isRepresentative(x.subj)), 'the sword reports are not the country-level case this asserts');
});

/* ── ④ unrelated stories filed under one country stay unrelated ────────────── */
test('#R336 ④ a country representative point does not fuse its articles', () => {
  const evs = group();
  const us = (x) => { const s = newsSubject(x.it.analysis); return s.kind === 'country' && s.loc[0] === -98 && s.loc[1] === 39.5; };
  const usEvents = evs.filter((e) => e.g.some(us));
  const biggest = usEvents.reduce((a, b) => (b.g.length > a.g.length ? b : a), usEvents[0]);
  assert.ok(biggest, 'the fixture lost the United States stack');
  /* #R76 put 36 of these in one group. A real US-wide event is a handful of
     outlets on one story; anything past ~8 is the docking point talking. */
  assert.ok(biggest.g.length <= 8, 'unrelated United States articles fused into one event of ' + biggest.g.length + ':\n  ' + titles(biggest).join('\n  '));
  /* and the members of the biggest one really do share their subject matter */
  const tk = biggest.g.map((x) => newsTokens(x.it.title));
  for (let i = 1; i < tk.length; i++) {
    const best = Math.max(...tk.slice(0, i).map((o) => newsSimilarity(tk[i], o)));
    assert.ok(best >= EVENT_RULES.SIM, 'an article joined the group without matching anything in it: ' + titles(biggest)[i]);
  }
  /* the whole corpus: no group is the old mega-cluster in disguise */
  const max = evs[0].g.length;
  assert.ok(max <= 12, `largest event is ${max} articles — #R76's was 36 and that was the bug`);
  assert.ok(evs.length >= FIX.items.length * 0.6, `${FIX.items.length} articles collapsed into only ${evs.length} events`);
});

/* ── ⑤ the relaxation is gone from the shipped source, not just from the rules ─ */
test('#R336 ⑤ the 0.06 relaxed branch no longer exists', () => {
  const atlas = read('js/atlas-console.js');
  const evCase = atlas.slice(atlas.indexOf("case 'events': case 'newsEvents': case 'groupNews':"));
  assert.ok(evCase.startsWith("case 'events'"), 'the events case is gone from js/atlas-console.js');
  const body = evCase.slice(0, evCase.indexOf("case 'module':"));
  assert.ok(body.length > 200 && body.length < 12000, 'could not isolate the events case — this check needs rewriting');
  assert.ok(!/s3>=0\.15|d<30&&dh<=24|>=0\.06/.test(body), '#R76\'s relaxed branch is back in js/atlas-console.js');
  /* ⚠ and it must not have been re-implemented beside the module either */
  assert.ok(!/par\[find\(/.test(body), 'the events case grew its own union-find again — there is one grouper, js/news-cluster.js');
  assert.match(body, /groupNewsEvents\(/, 'the events case no longer calls the shared grouper');
  assert.match(atlas, /from '\.\/news-cluster\.js'/, 'js/atlas-console.js does not import js/news-cluster.js');
  /* the constants the measurements chose */
  assert.equal(EVENT_RULES.HOURS, 48, 'the time window changed without a measurement');
  assert.ok(EVENT_RULES.SIM >= 0.25 && EVENT_RULES.SIM <= 0.35, `SIM is ${EVENT_RULES.SIM}; 0.15 over-fused and 0.45 over-split`);
  assert.equal(EVENT_RULES.KM, 150, 'the neighbourhood for two precise places changed without a measurement');
  assert.ok(EVENT_RULES.SAME_KM <= 5, 'a representative point must be the SAME point, not a neighbourhood');
});

/* ── ⑥ what "same place" means now, stated as behaviour ────────────────────── */
test('#R336 ⑥ distance between representative points buys nothing', () => {
  const country = { loc: [-98, 39.5], kind: 'country', precise: false };
  const region = { loc: [-98, 39.5], kind: 'region', precise: false };
  const cityA = { loc: [-98, 39.5], kind: 'city', precise: true };
  const cityB = { loc: [-97.0, 39.5], kind: 'city', precise: true };   /* ~86 km east */
  const cityFar = { loc: [-95.0, 39.5], kind: 'city', precise: true };  /* ~257 km east */
  assert.ok(isRepresentative(country) && isRepresentative(region), 'country/region points are not marked representative');
  assert.ok(!isRepresentative(cityA), 'a city is not a precise point');
  assert.ok(sameArea(country, country), 'the same country point is not the same area as itself');
  assert.ok(!sameArea(country, { loc: [-97.0, 39.5], kind: 'country', precise: false }),
    'two country representative points 86 km apart were called the same place');
  assert.ok(!sameArea(country, cityB), 'a country point 86 km from a city was called the same place');
  assert.ok(sameArea(cityA, cityB), 'two real places 86 km apart are one neighbourhood');
  assert.ok(!sameArea(cityA, cityFar), '257 km is not one neighbourhood');
  /* the behavioural consequence: identical coordinates, no shared wording, no join */
  const two = [
    { title: 'Childless Americans are feeling uneasy about retirement savings too', pubDate: FIX.items[0].pubDate,
      publisher: 'A', analysis: { subjectLoc: [-98, 39.5], subjectType: 'country', loc: [-98, 39.5], ptype: 'country', mapped: true, name: 'United States' } },
    { title: '40,000 bottles of eye drops across the US recalled over issues with sterility of product', pubDate: FIX.items[0].pubDate,
      publisher: 'B', analysis: { subjectLoc: [-98, 39.5], subjectType: 'country', loc: [-98, 39.5], ptype: 'country', mapped: true, name: 'United States' } }
  ];
  assert.equal(group(two).length, 2, 'two unrelated stories on one country point were called one event');
});

/* ── ⑦ an event is not a function of which pin the map happens to show ─────── */
test('#R336 ⑦ Publisher pin mode does not change the events', () => {
  /* js/app-body.js applyPinMode(), publisher branch, applied to the real data:
     analysis.loc becomes the outlet's HQ and ptype becomes 'city'. Under the old
     code that made every article from one newsroom «the same place». */
  const asPublisher = FIX.items.map((it) => {
    const a = it.analysis;
    if (!a.pubLoc) return it;
    return Object.assign({}, it, { analysis: Object.assign({}, a, { loc: a.pubLoc, name: a.pubName, mapped: 'publisher', ptype: 'city' }) });
  });
  const moved = asPublisher.filter((it, i) => it !== FIX.items[i]).length;
  assert.ok(moved >= 100, `only ${moved} articles have a resolvable publisher HQ — this check is not exercising the mode`);
  assert.deepEqual(canon(group(asPublisher)), canon(group()), 'the events changed when the map switched to Publisher pins');
});

/* ── ⑧ stopwords: fewer tokens, and a BETTER answer ────────────────────────── */
test('#R336 ⑧ stopwords lift real matches and drop false ones', () => {
  const t = newsTokens('The report says officials will report on the latest update after they have been briefed');
  for (const w of ['the', 'says', 'report', 'will', 'after', 'they', 'have', 'been', 'latest', 'update']) {
    assert.ok(!t.has(w), `stopword "${w}" survived tokenisation`);
  }
  assert.ok(t.has('officials') && t.has('briefed'), 'tokenisation dropped content words');
  /* Japanese: a bigram made only of hiragana is grammar; anything with a kanji or
     a katakana character in it carries identity and stays. ⚠ 'のロ' is MIXED —
     the rule is about the characters, not about whether a particle is involved. */
  const j = newsTokens('政府はきょう、ロシア軍の新しい対策をまとめました');
  for (const glue of ['きょ', 'ょう', 'まと', 'とめ', 'めま', 'した', 'しい']) {
    assert.ok(!j.has(glue), `hiragana glue "${glue}" survived tokenisation`);
  }
  for (const word of ['政府', 'ロシ', '対策', 'ア軍']) {
    assert.ok(j.has(word), `tokenisation dropped the content bigram "${word}"`);
  }
  /* ⚠ THE POINT IS THE DIRECTION, AND IT GOES BOTH WAYS. Dropping furniture
     shrinks the UNION of the Jaccard as well as the intersection, so removing it
     RAISES the score for two reports of one occurrence and SINKS it for two that
     only share their boilerplate. `naive` below is #R76's tokeniser, kept here as
     a characterisation of what shipped — it is the BEFORE of the comparison, not
     a second implementation of the AFTER. */
  const naive = (x) => { const str = String(x || ''); let w;
    try { w = str.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((y) => y.length >= 3); }
    catch (_) { w = str.toLowerCase().split(/[^a-z0-9]+/).filter((y) => y.length >= 3); }
    (str.match(/[一-鿿぀-ヿ가-힯]{2,}/g) || []).forEach((q) => {
      for (let i = 0; i < q.length - 1; i++) w.push(q.slice(i, i + 2)); });
    return new Set(w); };
  const both = (x, y) => [newsSimilarity(newsTokens(x), newsTokens(y)), newsSimilarity(naive(x), naive(y))];
  /* two reports of the Swedish school attack — measured 0.417 → 0.500 */
  const [sameNew, sameOld] = both('One killed in sword attack at Swedish school',
    'One killed, three injured when man attacks Swedish school with sword');
  assert.ok(sameNew > sameOld, `stopwords did not help a true match (${sameNew} vs ${sameOld})`);
  assert.ok(sameNew >= EVENT_RULES.SIM, 'two reports of the same attack no longer clear the bar');
  /* two stories with NOTHING in common but news furniture — measured 0.357 → 0.000.
     0.357 cleared #R76's 0.15 outright, which is the other half of the reported bug. */
  const [junkNew, junkOld] = both('Report says US debt tops $40 trillion after latest update',
    'Report says eye drops recalled after latest update from the FDA');
  assert.ok(junkOld >= 0.15, 'the boilerplate pair no longer characterises what #R76 accepted');
  assert.equal(junkNew, 0, `two unrelated stories still share ${junkNew} — only furniture connects them`);
});

/* ── ⑨ deterministic: no clock, no randomness ──────────────────────────────── */
test('#R336 ⑨ the same articles always produce the same events', () => {
  assert.deepEqual(canon(group()), canon(group()), 'grouping is not deterministic');
  assert.deepEqual(canon(group(FIX.items.slice().reverse())), canon(group()),
    'the events depend on the order the feed arrived in');
  const src = read('js/news-cluster.js');
  assert.ok(!/Math\.random|Date\.now|new Date\(\)|fetch\(/.test(src), 'js/news-cluster.js reached for a clock, a die or the network');
});

/* ── ⑩ the results say which half of «map,explanation» actually happened ───── */
test('#R336 ⑩ every research.events return carries meta', () => {
  const atlas = read('js/atlas-console.js');
  const evCase = atlas.slice(atlas.indexOf("case 'events': case 'newsEvents': case 'groupNews':"));
  const body = evCase.slice(0, evCase.indexOf("case 'module':"));
  const returns = body.match(/return R\(/g) || [];
  assert.ok(returns.length >= 3, `only ${returns.length} returns found in the events case — this check needs rewriting`);
  const withMeta = body.match(/return R\([^;]*?\{meta:\{/g) || [];
  assert.equal(withMeta.length, returns.length,
    `${returns.length - withMeta.length} of ${returns.length} research.events returns still carry no meta`);
  for (const code of ['PLACE_NOT_FOUND', 'NO_ARTICLES', "code:'OK'"]) {
    assert.ok(body.includes(code), `the events case never reports ${code}`);
  }
  /* the capability declares what it produces; the return must be able to say
     it produced less (the pins can fail to draw while the text still lands) */
  const caps = read('js/atlas-capabilities.js');
  assert.match(caps, /'research\.events',\s*'events',\s*'newsEvents,groupNews'/, 'research.events left the capability table');
  assert.match(caps.slice(caps.indexOf("'research.events'")), /'map,explanation'/, 'research.events no longer declares map,explanation');
  assert.match(body, /produced:\(_evMapped\?\['map','explanation'\]:\['explanation'\]\)/, 'the OK return claims the map regardless of whether the pins drew');
});
