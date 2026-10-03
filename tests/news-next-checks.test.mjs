/* ============================================================================
 *  news-story — a news STORY: the events whose headlines name the same words, on a timeline and the map
 *  (docs/NEWS-EVENTS.md §17, docs/architecture/04-news.md §4.7).
 * ----------------------------------------------------------------------------
 *  Every function asserted here is the SHIPPED one (js/news-story-core.js), evaluated on production data:
 *  tests/fixtures/news-story-prod.json holds what public.news_story_terms and public.news_story return for seven
 *  real headlines — production's 18,786 active news_events (anon read, 2026-10-03) run through the shipped migration
 *  supabase/migrations/20261003184700_news_story.sql in PGlite (the method is in dev-notes/2026-10-03-news-next.md).
 *  The countries are the Natural Earth 10 m outline the page loads. The database half is supabase/tests/24_….
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const core = await import('../js/news-story-core.js');
const intel = await import('../js/news-intel-core.js');
const ne = await import('../js/ne-countries.js');
const fine = ne.decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/ne-countries/ne_10m_admin_0_countries.json.gz')))));
const index = intel.makeCountryIndex(fine.features);

const FX = JSON.parse(read('tests/fixtures/news-story-prod.json'));
const seed = (start) => { const s = FX.seeds.find((x) => x.title.startsWith(start)); assert.ok(s, 'fixture has ' + start); return s; };
const sug = (s) => core.suggest(core.decodeTerms(s.stats));
/* a word's NAME verdict as the reader is shown it — the chip suggest() returns for it */
const isName = (s, t) => { const c = sug(s).chips.find((x) => x.t === t); assert.ok(c, 'a chip for ' + t); return c.name; };

test('news-story ① a NAME is what sentence-case headlines capitalise mid-sentence — measured, not listed', () => {
  const afd = seed('Far-right AfD');
  assert.equal(isName(afd, 'afd'), true, 'AfD 30/30');
  assert.equal(isName(afd, 'german'), true, 'German 40/40');
  assert.equal(isName(afd, 'state'), false, '«state» is capitalised only in «State Department» (34/140)');
  assert.equal(isName(afd, 'election'), false);
  assert.equal(isName(afd, 'far'), false, 'the first word of «Far-right AfD…» is not counted');
});

test('news-story ② the suggested thread, on production headlines', () => {
  assert.deepEqual(sug(seed('UN warns El Nino')).pick.terms, ['nino'], 'a rare name is a thread by itself (19 events) — not «could + nino» (5)');
  assert.deepEqual(sug(seed('Tens of thousands in Spain protest Ceuta')).pick.terms, ['ceuta']);
  assert.deepEqual(sug(seed('Rescuers search for about 130 missing')).pick.terms.slice().sort(), ['ferry', 'indonesia'], 'a broad name (indonesia) is narrowed by the word it keeps company with');
  assert.deepEqual(sug(seed('Malaysia declares emergency in Sarawak')).pick.terms.slice().sort(), ['haze', 'indonesia']);
  const afd = sug(seed('Far-right AfD'));
  assert.ok(afd.pick.terms.length === 2 && afd.pick.n >= core.STORY.MIN_EVENTS, 'AfD (56 events) is narrowed by a second word');
  assert.ok(afd.choices.some((c) => c.terms.join(',') === 'afd,victory'), 'the other threads are offered — afd + victory among them');
  /* «no thread» is an answer, not a guess: a headline whose names nobody else used */
  assert.equal(sug(seed('US confirms for first time')).pick, null);
  assert.equal(sug(seed('Next overturns equal pay')).pick, null);
  assert.ok(sug(seed('Next overturns equal pay')).chips.length > 0, '…and the reader is still given the words to choose from');
});

test('news-story ③ every event of a thread names every word — the rows the server returned for the pick', () => {
  const words = (t) => new Set(String(t).toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u));
  for (const s of FX.seeds) {
    const g = sug(s);
    if (!g.pick) { assert.equal(s.rows.length, 0); continue; }
    assert.equal(s.rows.length, g.pick.n, s.title + ': the pair count the server gave is the rows it returns');
    for (const r of s.rows) for (const t of g.pick.terms) assert.ok(words(r.representative_title).has(t), r.representative_title + ' names ' + t);
  }
});

test('news-story ④ the story read as a thread: days with no news are zeros, the spread only grows', () => {
  const s = seed('Far-right AfD');
  const S = core.buildStory(s.rows, { keyAt: index.keyAt, limit: core.STORY.LIMIT });
  assert.equal(S.events.length, s.rows.length);
  assert.equal(S.cut, false);
  for (let i = 1; i < S.events.length; i++) assert.ok(S.events[i].at >= S.events[i - 1].at, 'in the order first reported');
  const span = Math.round((Date.parse(S.days[S.days.length - 1].day) - Date.parse(S.days[0].day)) / 86400000) + 1;
  assert.equal(S.days.length, span, 'every UTC day from the first to the last');
  assert.equal(S.days.reduce((n, d) => n + d.events.length, 0), S.events.length, 'each event on exactly one day');
  assert.ok(S.days.some((d) => d.events.length === 0), 'a quiet day is a 0, not a gap');
  for (let i = 1; i < S.spread.length; i++) {
    for (const k of ['places', 'countries', 'farthestKm']) assert.ok(S.spread[i][k] >= S.spread[i - 1][k], k + ' is cumulative');
  }
  assert.equal(S.countries[0].key, 'DE', 'the story starts in Germany');
  assert.equal(S.spread[S.spread.length - 1].places, S.places.length);
  assert.equal(S.peak.day, '2026-09-07', 'the day after the vote');
});

test('news-story ⑤ each newly reached place is joined to the NEAREST place reported before it (and nothing else)', () => {
  for (const s of FX.seeds.filter((x) => x.rows.length)) {
    const S = core.buildStory(s.rows, { keyAt: index.keyAt });
    for (const e of S.edges) {
      const to = S.places.find((P) => P.p[0] === e.to[0] && P.p[1] === e.to[1]);
      const earlier = S.places.filter((P) => P.firstAt < to.firstAt || (P.firstAt === to.firstAt && S.places.indexOf(P) < S.places.indexOf(to)));
      const best = Math.min(...earlier.map((P) => intel.km(P.p, to.p)));
      assert.ok(Math.abs(e.km - best) < 1e-6, s.title + ': ' + e.toName + ' joined to its nearest earlier place');
    }
    assert.ok(S.edges.length <= Math.max(0, S.places.length - 1), 'at most one line per newly reached place');
  }
});

test('news-story ⑥ the playhead: what day i shows is everything up to day i', () => {
  const S = core.buildStory(seed('UN warns El Nino').rows, { keyAt: index.keyAt });
  let seen = 0;
  for (let i = 0; i < S.days.length; i++) {
    const F = core.frameAt(S, i);
    seen += S.days[i].events.length;
    assert.equal(F.past.length + F.now.length, seen);
    assert.equal(F.now.length, S.days[i].events.length);
    assert.ok(F.edges.every((x) => x.day <= F.day));
  }
  assert.equal(core.frameAt(S, 999).index, S.days.length - 1, 'clamped to the last day');
});

test('news-story ⑦ what has no place is counted, not dropped', () => {
  const rows = seed('Tens of thousands in Spain protest Ceuta').rows.slice(0, 4).map((r, i) => (i === 1 ? Object.assign({}, r, { rep_lng: null, rep_lat: null }) : r));
  rows.push(Object.assign({}, rows[0], { public_id: 'sea-1', rep_lng: 56.25, rep_lat: 26.5667 }));   /* the Strait of Hormuz point */
  const S = core.buildStory(rows, { keyAt: index.keyAt });
  assert.equal(S.events.length, 5);
  assert.equal(S.unplaced, 1);
  assert.equal(S.atSea, 1);
  assert.equal(core.buildStory(rows, { keyAt: index.keyAt, limit: 5 }).cut, true, 'the server returned as many rows as asked for: the story says it may be cut');
});

test('news-story ⑧ the address names the same thread, and nothing the server could not have written', () => {
  assert.equal(core.storyQuery(['afd', 'victory']), '?story=afd,victory');
  assert.deepEqual(core.storyFromSearch('?story=afd,victory'), ['afd', 'victory']);
  assert.deepEqual(core.storyFromSearch('?x=1&story=AfD,%20Victory,afd'), ['afd', 'victory'], 'lower-cased, trimmed, once each');
  assert.deepEqual(core.storyFromSearch('?story=tromsø'), ['tromsø']);
  assert.equal(core.storyFromSearch('?story=%3Cscript%3E,ab'), null, 'markup and 2-letter words are not words the server writes');
  assert.equal(core.storyFromSearch('?tour=x'), null);
  assert.equal(core.storyFromSearch('?story=a,b,c,d,e,f,g,h'.replace(/[a-h]/g, (c) => c.repeat(3))).length, core.STORY.MAX_TERMS);
});

/* ── the wiring: one rule in SQL, one number sent, every door reaches the same body ───────────────── */
const SQL = read('supabase/migrations/20261003184700_news_story.sql');
test('news-story ⑨ the server: one word-cutting rule, the index on that same expression, invoker rights, read grants', () => {
  assert.match(SQL, /create index if not exists idx_news_events_title_terms\s+on public\.news_events using gin \(public\.news_title_terms\(representative_title\)\)\s+where status = 'active' and merged_into is null/);
  assert.match(SQL, /public\.news_title_terms\(e\.representative_title\) @> p_terms/, 'news_story matches on the indexed expression');
  assert.match(SQL, /e\.status = 'active' and e\.merged_into is null/, '…under the index\'s own predicate');
  for (const f of ['news_story(text[], timestamptz, timestamptz)', 'news_story_terms(text, timestamptz, timestamptz, real)']) {
    assert.match(SQL, new RegExp('grant execute on function public\\.' + f.replace(/[()[\]]/g, '\\$&') + ' to anon, authenticated, service_role'));
  }
  assert.equal((SQL.match(/security definer/gi) || []).length, 0, 'nothing here runs with the owner\'s rights');
  assert.equal((SQL.match(/regexp_split_to_table\(lower\(/g) || []).length, 1, 'the word-cutting rule is written once');
  const body = read('js/news-story.js');
  assert.match(body, /p_max_share: STORY\.MAX_SHARE/, 'the share cap is the core\'s number, sent — not a second copy in SQL');
  assert.doesNotMatch(body, /\.split\(\/\[\^\\p\{L\}/, 'the browser does not cut headlines into words');
});

test('news-story ⑩ every door: the event reader, ?story=, the command, Atlas — one lazy body', async () => {
  const { LAZY_REGISTRY } = await import('../js/lazy-modules.js');
  assert.equal(LAZY_REGISTRY.newsStory.publishes, '__imNewsStory');
  const facade = read('js/news-pulse.js');
  assert.match(facade, /IntMapLazy\.need\('newsStory'\)/);
  assert.match(facade, /\[\?&\]story=/);
  assert.match(facade, /register\('newsstory\.open'/);
  assert.match(read('js/news-events.js'), /window\.IntMapNewsIntel\.story\(\{ text: ev\.title, from: ev\.publicId \}\)/, 'the reader asks with the outlets\' own headline');
  assert.match(read('js/atlas-capabilities.js'), /\["news\.story","newsStory",[^\]]*"newsStory","external"\]/, 'Atlas row (lazy newsStory, carries headlines)');
  assert.match(read('js/news-story.js'), /window\.__imNewsStory = API/);
});
