/* ============================================================================
 *  IntMap · #R340 — Atlas research.events grouped unrelated stories into one
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
 *  WHAT THESE TESTS MEASURE. #R334 shipped the event-first pipeline's grouper at
 *  supabase/functions/_shared/news-cluster.js, having reached the same diagnosis
 *  independently — and docs/NEWS-EVENTS.md settles that there is to be exactly
 *  one: «research.events は新パイプラインへ載せ替える。第二のクラスタリング実装
 *  を残さない。» So research.events now calls THAT module through the browser-side
 *  adapter js/news-cluster.js, and everything below runs the shared functions
 *  rather than a copy (#R317: a check that re-implements its subject stops
 *  measuring it the first time the subject moves). The corpus is
 *  tests/fixtures/news-events-prod.json — 400 real headlines with the real
 *  locator's real answers, captured once. Nothing here is invented.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';   /* (#R283) line endings belong to the checkout, not to the file */
import { makeNewsCluster } from '../js/news-cluster.js';

/* THE SHIPPED FUNCTIONS. js/atlas-console.js calls this same factory, and the
   factory's algorithm half comes straight out of the shared #R334 module. */
const {
  EVENT_RULES, groupNewsEvents, newsSubject, isRepresentative,
  DEFAULTS, tokenise, jaccard, geoClass, pairVerdict,
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
/* geo helpers for ⑥ — the shared module reads subject_lng/lat/type */
const C = (lng, lat) => ({ subject_lng: lng, subject_lat: lat, subject_type: 'country' });
const K = (lng, lat) => ({ subject_lng: lng, subject_lat: lat, subject_type: 'city' });

/* ── ① the fixture is real, and still holds the cases the round was about ──── */
test('#R340 ① the production fixture is intact and discriminating', () => {
  assert.ok(Array.isArray(FIX.items) && FIX.items.length >= 300, `fixture holds ${FIX.items && FIX.items.length} articles`);
  assert.ok(isFinite(NOW), 'fixture has no capturedAt instant — "hours ago" would depend on the wall clock');
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
test('#R340 ② Walmart earnings and Walmart Apple Pay are different events', () => {
  const evs = group();
  const earnings = eventWith(evs, /Walmart Beat Earnings/i);
  const applePay = eventWith(evs, /Walmart to let shoppers use Apple Pay/i);
  assert.ok(earnings && applePay, 'the fixture lost the Walmart articles');
  assert.notEqual(earnings, applePay, 'Walmart earnings and Walmart Apple Pay were grouped as one event:\n  ' + titles(earnings).join('\n  '));
  /* …and the split is not achieved by refusing to group anything: the Apple Pay
     reports ARE one event, at the same subject point and inside the same 48 h
     window as the earnings story. Only the wording separates them. */
  assert.ok(applePay.g.length >= 4, `the Apple Pay rollout fragmented into ${applePay.g.length} — over-splitting is not a fix`);
  assert.ok(titles(applePay).every((t) => /apple pay|tap-to-pay/i.test(t)), 'the Apple Pay event absorbed something else:\n  ' + titles(applePay).join('\n  '));
  assert.equal(earnings.g.length, 1, 'the earnings story picked up unrelated Walmart articles:\n  ' + titles(earnings).join('\n  '));
});

/* ── ③ …and the opposite failure is not the fix ────────────────────────────── */
test('#R340 ③ the Swedish school sword attack is ONE event', () => {
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
test('#R340 ④ a country representative point does not fuse its articles', () => {
  const evs = group();
  const us = (x) => { const s = newsSubject(x.it.analysis); return s.kind === 'country' && s.loc[0] === -98 && s.loc[1] === 39.5; };
  const usEvents = evs.filter((e) => e.g.some(us));
  const biggest = usEvents.reduce((a, b) => (b.g.length > a.g.length ? b : a), usEvents[0]);
  assert.ok(biggest, 'the fixture lost the United States stack');
  /* #R76 put 36 of these in one group. The biggest legitimate one in this corpus
     is the TikTok $400M DOJ settlement — nine outlets on one occurrence. */
  assert.ok(biggest.g.length <= 12, 'unrelated United States articles fused into one event of ' + biggest.g.length + ':\n  ' + titles(biggest).join('\n  '));
  /* and every member really does agree with something already in the group */
  const tk = biggest.g.map((x) => tokenise(x.it.title));
  const floor = Math.min.apply(null, Object.keys(DEFAULTS.thr).map((k) => DEFAULTS.thr[k]));
  for (let i = 1; i < tk.length; i++) {
    const best = Math.max(...tk.slice(0, i).map((o) => jaccard(tk[i], o)));
    assert.ok(best >= floor, 'an article joined the group sharing almost nothing with it: ' + titles(biggest)[i]);
  }
  /* the whole corpus: no group is the old mega-cluster in disguise */
  const max = evs[0].g.length;
  assert.ok(max <= 14, `largest event is ${max} articles — #R76's was 36 and that was the bug`);
  assert.ok(evs.length >= FIX.items.length * 0.5, `${FIX.items.length} articles collapsed into only ${evs.length} events`);
});

/* ── ⑤ the relaxation is gone, and no second implementation grew back ──────── */
test('#R340 ⑤ #R76\'s relaxed branch no longer exists, and there is ONE grouper', () => {
  const atlas = read('js/atlas-console.js');
  const evCase = atlas.slice(atlas.indexOf("case 'events': case 'newsEvents': case 'groupNews':"));
  assert.ok(evCase.startsWith("case 'events'"), 'the events case is gone from js/atlas-console.js');
  /* ⚠ (#R382) END AT THE NEXT CASE, not at `case 'module':`. This used to slice all the way to
     `module` because `events` happened to be the case before it; the moment another case was
     added between them (news.category), the slice swallowed it and the size ceiling fired on
     code this check is not about. The subject is the EVENTS case, so the boundary is its own end. */
  const nextCase = evCase.slice(1).search(/\n\s{8}case '/);
  const body = nextCase > 0 ? evCase.slice(0, nextCase + 1) : evCase.slice(0, evCase.indexOf("case 'module':"));
  assert.ok(body.length > 200 && body.length < 12000, 'could not isolate the events case — this check needs rewriting');
  /* ⚠ (#R382) …and in EVENT mode it must not group at all: the server already did, over the whole
     window, and a second grouping is a second implementation running (docs/NEWS-EVENTS.md). */
  assert.match(body, /_evMode/, 'the events case does not branch on the surface mode');
  assert.ok(body.indexOf('_evMode') < body.indexOf('groupNewsEvents('),
    'the mode test must come BEFORE the grouper call, or event mode re-clusters what the server clustered');
  assert.ok(!/s3>=0\.15|d<30&&dh<=24|>=0\.06/.test(body), '#R76\'s relaxed branch is back in js/atlas-console.js');
  assert.ok(!/par\[find\(/.test(body), 'the events case grew its own union-find again');
  assert.match(body, /groupNewsEvents\(/, 'the events case no longer calls the shared grouper');
  assert.match(atlas, /from '\.\/news-cluster\.js'/, 'js/atlas-console.js does not import js/news-cluster.js');

  /* ⚠ AND THE ADAPTER MUST STAY AN ADAPTER. docs/NEWS-EVENTS.md forbids a second
     clustering implementation; the way that rule dies is by someone adding "just
     one threshold" here. The adapter may hold NO numeric threshold and NO
     union-find of its own — both live in the shared module. */
  const adapter = read('js/news-cluster.js');
  assert.match(adapter, /from '\.\.\/supabase\/functions\/_shared\/news-cluster\.js'/,
    'js/news-cluster.js no longer imports the shared #R334 grouper — that is a second implementation');
  const code = adapter.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/par\[find\(|union|jaccard\s*\(\s*[a-z]+\s*,\s*[a-z]+\s*\)\s*[<>]/.test(code),
    'js/news-cluster.js is deciding pairs itself instead of delegating');
  const nums = (code.match(/\b0\.\d+\b/g) || []);
  assert.deepEqual(nums, [], 'js/news-cluster.js grew thresholds of its own: ' + nums.join(', '));

  /* the constants are the shared module's, and they carry the anti-#R76 invariant */
  assert.equal(DEFAULTS.timeWindowH, 48, 'the time window changed without a measurement');
  assert.equal(EVENT_RULES.HOURS, DEFAULTS.timeWindowH, 'the reply quotes a window the code does not use');
  for (const k of ['tight', 'near', 'countrySame', 'countryNear', 'unknown', 'far']) {
    assert.ok(DEFAULTS.thr[k] >= 0.15, `${k} threshold ${DEFAULTS.thr[k]} is below what #R76 already had`);
  }
  /* ⚠⚠ THE ONE THAT MATTERS. #R76 LOWERED the bar for country-level pairs (to
     0.06). It must be RAISED — a distance of zero between two country centroids
     is evidence they share a label, not that they share a place. */
  assert.ok(DEFAULTS.thr.countrySame > DEFAULTS.thr.near,
    `countrySame ${DEFAULTS.thr.countrySame} must be HIGHER than near ${DEFAULTS.thr.near}`);
  assert.ok(DEFAULTS.thr.countrySame > DEFAULTS.thr.tight,
    `countrySame ${DEFAULTS.thr.countrySame} must be HIGHER than tight ${DEFAULTS.thr.tight}`);
});

/* ── ⑥ what "same place" means now, stated as behaviour ────────────────────── */
test('#R340 ⑥ a representative point is classified apart from a real place', () => {
  assert.equal(geoClass(C(-98, 39.5), C(-98, 39.5)).cls, 'countrySame', 'two articles on one country point are not classified as such');
  assert.equal(geoClass(C(-98, 39.5), C(-97, 39.5)).cls, 'countryNear', 'country points 86 km apart lost their country class');
  assert.equal(geoClass(C(-98, 39.5), K(-97, 39.5)).cls, 'countryNear', 'a country point next to a city is still a country point');
  assert.equal(geoClass(K(-98, 39.5), K(-97, 39.5)).cls, 'near', 'two real places 86 km apart are one neighbourhood');
  assert.equal(geoClass(K(-98, 39.5), K(-97.77, 39.5)).cls, 'tight', 'two real places 20 km apart are the tight class');
  assert.equal(geoClass(K(-98, 39.5), K(-95, 39.5)).cls, 'far', '257 km is not one neighbourhood');
  /* the behavioural consequence: identical coordinates, no shared wording, no join */
  const two = [
    { title: 'Childless Americans are feeling uneasy about retirement savings too', pubDate: FIX.items[0].pubDate,
      publisher: 'A', analysis: { subjectLoc: [-98, 39.5], subjectType: 'country', loc: [-98, 39.5], ptype: 'country', mapped: true, name: 'United States' } },
    { title: '40,000 bottles of eye drops across the US recalled over issues with sterility of product', pubDate: FIX.items[0].pubDate,
      publisher: 'B', analysis: { subjectLoc: [-98, 39.5], subjectType: 'country', loc: [-98, 39.5], ptype: 'country', mapped: true, name: 'United States' } },
  ];
  assert.equal(group(two).length, 2, 'two unrelated stories on one country point were called one event');
  /* …and the verdict says WHY, which is what makes a mis-group fixable */
  const v = pairVerdict(
    { title: two[0].title, published_at: '2026-08-23T00:00:00Z', subject_lng: -98, subject_lat: 39.5, subject_type: 'country' },
    { title: two[1].title, published_at: '2026-08-23T01:00:00Z', subject_lng: -98, subject_lat: 39.5, subject_type: 'country' });
  assert.equal(v.same, false);
  assert.equal(v.geo, 'countrySame', 'the pair was not even recognised as the country-stack case');
  assert.ok(Array.isArray(v.reasons) && v.reasons.length, 'the verdict carries no reason');
});

/* ── ⑦ an event is not a function of which pin the map happens to show ─────── */
test('#R340 ⑦ Publisher pin mode does not change the events', () => {
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

/* ── ⑧ the tokeniser lifts real matches and drops false ones ───────────────── */
test('#R340 ⑧ stopwords and stemming lift true matches and sink false ones', () => {
  const t = tokenise('The report says officials will report on the latest update after they have been briefed');
  for (const w of ['the', 'says', 'report', 'will', 'after', 'they', 'have', 'been']) {
    assert.ok(!t.has(w), `stopword "${w}" survived tokenisation`);
  }
  assert.ok(t.has('official'), 'tokenisation dropped a content word (or stopped stemming)');
  /* ⚠ THE POINT IS THE DIRECTION, AND IT GOES BOTH WAYS. Dropping furniture
     shrinks the UNION of the Jaccard as well as the intersection, so removing it
     RAISES the score for two reports of one occurrence and SINKS it for two that
     only share their boilerplate. `naive` below is #R76's tokeniser, kept here as
     a characterisation of what shipped — the BEFORE of the comparison, not a
     second implementation of the AFTER. */
  const naive = (x) => { const str = String(x || ''); let w;
    try { w = str.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((y) => y.length >= 3); }
    catch (_) { w = str.toLowerCase().split(/[^a-z0-9]+/).filter((y) => y.length >= 3); }
    (str.match(/[一-鿿぀-ヿ가-힯]{2,}/g) || []).forEach((q) => {
      for (let i = 0; i < q.length - 1; i++) w.push(q.slice(i, i + 2)); });
    return new Set(w); };
  const both = (x, y) => [jaccard(tokenise(x), tokenise(y)), jaccard(naive(x), naive(y))];
  /* two reports of the Swedish school attack — measured 0.417 → 0.714 */
  const [sameNew, sameOld] = both('One killed in sword attack at Swedish school',
    'One killed, three injured when man attacks Swedish school with sword');
  assert.ok(sameNew > sameOld, `the tokeniser did not help a true match (${sameNew} vs ${sameOld})`);
  assert.ok(sameNew >= DEFAULTS.thr.countrySame, 'two reports of the same attack no longer clear the country-stack bar');
  /* two stories with NOTHING in common but news furniture — measured 0.357 → 0.222.
     0.357 cleared #R76's 0.15 outright, which is the other half of the reported bug. */
  const [junkNew, junkOld] = both('Report says US debt tops $40 trillion after latest update',
    'Report says eye drops recalled after latest update from the FDA');
  assert.ok(junkOld >= 0.15, 'the boilerplate pair no longer characterises what #R76 accepted');
  assert.ok(junkNew < junkOld, `the tokeniser did not sink a false match (${junkNew} vs ${junkOld})`);
  assert.ok(junkNew < DEFAULTS.thr.countrySame, 'two unrelated stories still clear the country-stack bar on furniture alone');
});

/* ── ⑨ deterministic: no clock, no randomness ──────────────────────────────── */
test('#R340 ⑨ the same articles always produce the same events', () => {
  assert.deepEqual(canon(group()), canon(group()), 'grouping is not deterministic');
  assert.deepEqual(canon(group(FIX.items.slice().reverse())), canon(group()),
    'the events depend on the order the feed arrived in');
  /* ⚠ STRIP THE COMMENTS FIRST. The first version of this ran the pattern over the
     whole file and failed on js/news-cluster.js — because the note there explaining
     WHY it must not call Date.now() contains the string "Date.now()". A check that
     reads prose as code is the trap this repository keeps re-setting for itself.
     ⚠ And the subject is the WALL CLOCK, not the Date constructor: the adapter builds
     instants from the caller's "hours ago" against a fixed epoch, which is exactly what
     makes the fixture reproducible. Argless new Date() and Date.now() are the ban. */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['js/news-cluster.js', 'supabase/functions/_shared/news-cluster.js']) {
    const code = strip(read(f));
    assert.ok(!/Math\.random|Date\.now\(\)|new Date\(\s*\)|fetch\(/.test(code), f + ' reached for the wall clock, a die or the network');
  }
});

/* ── ⑩ the results say which half of «map,explanation» actually happened ───── */
test('#R340 ⑩ every research.events return carries meta', () => {
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
  const caps = read('js/atlas-capabilities.js');
  assert.match(caps, /'research\.events',\s*'events',\s*'newsEvents,groupNews'/, 'research.events left the capability table');
  assert.match(caps.slice(caps.indexOf("'research.events'")), /'map,explanation'/, 'research.events no longer declares map,explanation');
  assert.match(body, /produced:\(_evMapped\?\['map','explanation'\]:\['explanation'\]\)/, 'the OK return claims the map regardless of whether the pins drew');
  /* the footnote must quote the rule the code applies, not a remembered one */
  assert.match(body, /EVENT_RULES\.HOURS/, 'the footnote hard-codes the time window');
  assert.match(body, /EVENT_RULES\.SIM_MIN/, 'the footnote hard-codes the similarity bar');
});
