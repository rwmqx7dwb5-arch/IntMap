/* ============================================================================
 *  news-story — a news STORY: the events whose headlines name the same words, on a timeline and the map
 *  (docs/NEWS-EVENTS.md §17, docs/architecture/04-news.md §4.7).
 * ----------------------------------------------------------------------------
 *  Every function asserted here is the SHIPPED one (js/news-story-core.js), evaluated on production data:
 *  tests/fixtures/news-story-prod.json holds what public.news_story_terms and public.news_story return for seven
 *  real headlines — production's 18,786 active news_events (anon read, 2026-10-03) run through the shipped migration
 *  supabase/migrations/20261003211600_news_story.sql in PGlite (the method is in dev-notes/2026-10-03-news-next.md).
 *  The countries are the Natural Earth 10 m outline the page loads. The database half is supabase/tests/25_news_story_test.sql.
 *  2026-10-04: the bodies were replaced by supabase/migrations/20261004090000_news_story_one_scan.sql (one read of the
 *  headline-word index instead of three table passes per word — production answered 57014 for two words); the
 *  fixture's answers are what the new bodies return on the same rows, unchanged. ⑪–⑭ hold the structure and the reason.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { codeOnly } from '../scripts/code-only.mjs';

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
/* the SHIPPED body of a function is the one the LAST migration that (re)defines it wrote — discovered, not named */
const MIGS = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const lastDef = (fn) => {
  const head = new RegExp('create or replace function public\\.' + fn + '\\(');
  const f = MIGS.filter((m) => head.test(read('supabase/migrations/' + m))).pop();
  assert.ok(f, 'a migration defines ' + fn);
  const src = codeOnly(read('supabase/migrations/' + f), { lang: 'sql' });   /* the SQL, its comments blanked */
  const body = src.slice(src.search(head)).match(/as \$\$([\s\S]*?)\$\$;/);
  return { file: f, body: body[1] };
};
const SQL = read('supabase/migrations/20261003211600_news_story.sql');
test('news-story ⑨ the server: one word-cutting rule, the index on that same expression, invoker rights, read grants', () => {
  assert.match(SQL, /create index if not exists idx_news_events_title_terms\s+on public\.news_events using gin \(public\.news_title_terms\(representative_title\)\)\s+where status = 'active' and merged_into is null/);
  const story = lastDef('news_story').body;
  assert.match(story, /public\.news_title_terms\(e\.representative_title\) @> p_terms/, 'news_story matches on the indexed expression');
  assert.match(story, /e\.status = 'active' and e\.merged_into is null/, '…under the index\'s own predicate');
  for (const f of ['news_story(text[], timestamptz, timestamptz)', 'news_story_terms(text, timestamptz, timestamptz, real)']) {
    assert.match(SQL, new RegExp('grant execute on function public\\.' + f.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + ' to anon, authenticated, service_role'));
  }
  for (const m of new Set([lastDef('news_story').file, lastDef('news_story_terms').file, '20261003211600_news_story.sql'])) {
    assert.equal((read('supabase/migrations/' + m).match(/security definer/gi) || []).length, 0, m + ': nothing here runs with the owner\'s rights');
  }
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

/* ── 2026-10-04: one read of the index, not three table passes per word (20261004090000_news_story_one_scan.sql) ──── */
/* the CTEs of a body, by name → their text (the body is one WITH; each `name as [materialized] ( … )` is balanced) */
function ctes(body) {
  const out = new Map();
  const re = /(\w+) as (materialized )?\(/g;
  let m;
  while ((m = re.exec(body))) {
    let d = 1, i = re.lastIndex;
    for (; i < body.length && d; i++) { if (body[i] === '(') d++; else if (body[i] === ')') d--; }
    out.set(m[1], { text: body.slice(re.lastIndex, i - 1), fenced: !!m[2], end: i });
    re.lastIndex = i;
  }
  return out;
}
test('news-story ⑪ the counts come from ONE read of the headline-word index — the work does not grow with the number of words', () => {
  const T = lastDef('news_story_terms');
  assert.notEqual(T.file, '20261003211600_news_story.sql', 'the per-word body (production: 57014 at two words) is no longer the shipped one');
  assert.doesNotMatch(T.body, /news_story\(/, 'news_story_terms never calls news_story — the old body called it twice per word and once per pair');
  assert.equal((T.body.match(/from public\.news_events\b/g) || []).length, 2, 'the table is read twice whatever the text: the span\'s total (n) and the one index read');
  const C = ctes(T.body);
  const idx = [...C.entries()].filter(([, c]) => /public\.news_title_terms\(e\.representative_title\)/.test(c.text));
  assert.equal(idx.length, 1, 'one CTE reads the index');
  const [name, one] = idx[0];
  assert.ok(one.fenced, name + ' is MATERIALIZED — the planner cannot merge the span into it');
  assert.match(one.text, /&& \(select ts from q\)/, name + ' asks for ANY of the text\'s words at once (&&)');
  assert.doesNotMatch(one.text, /first_published_at\s*[<>]/, name + ' carries no time condition — with one, the generic plan walks the time index and cuts every headline (production: 18,420 rows removed by filter, 633.9 ms)');
  /* every count is a GROUP BY over the rows that one read produced — no subquery per word against the table */
  for (const k of ['df', 'caps', 'pr']) assert.match(C.get(k).text, /group by/, k + ' is one GROUP BY over the set');
});
test('news-story ⑫ news_story reads the index behind a fence; the span is applied to what it returned', () => {
  const S = lastDef('news_story');
  const C = ctes(S.body);
  const hit = [...C.values()].find((c) => /@> p_terms/.test(c.text));
  assert.ok(hit && hit.fenced, 'the word match is in a MATERIALIZED CTE');
  assert.doesNotMatch(hit.text, /first_published_at/, '…with no time condition inside it');
  assert.match(S.body.slice(hit.end), /first_published_at >= p_since and \w+\.first_published_at < p_until/, 'the span is applied to what the fence returned');
});
test('news-story ⑬ the measured reason: the anon time limit, before and after, on production', () => {
  const M = FX.measured;
  assert.ok(M && M.method && M.anonStatementTimeoutMs > 0, 'the fixture records how it was measured');
  assert.equal(M.before.prod.newsStoryTermsTwoWords, '57014', 'before: two words were cancelled by the anon statement timeout');
  assert.ok(M.before.prod.newsStoryTermsOneWordMs > M.anonStatementTimeoutMs / 3, 'before: one word already used over a third of the limit');
  for (const [t, ms] of Object.entries(M.after.prod.newsStoryTermsMs)) {
    assert.ok(ms < M.anonStatementTimeoutMs / 3, 'after: «' + t + '» answers in ' + ms + ' ms — under a third of the anon limit (headroom for a cold cache)');
  }
  for (const [t, ms] of Object.entries(M.after.prod.newsStoryMs)) assert.ok(ms < M.before.prod.newsStoryOneWordMs / 10, 'after: news_story ' + t + ' ' + ms + ' ms');
});
test('news-story ⑭ a failed read says WHY — a timeout is not «unreachable», and neither is «no story»', () => {
  const f = core.failureOf;
  assert.deepEqual(f({ code: '57014', message: 'canceling statement due to statement timeout' }), { kind: 'timeout', code: '57014' }, 'production\'s 2026-10-04 answer');
  assert.equal(f({ code: '42501' }).kind, 'denied');
  assert.equal(f({ code: 'PGRST301' }).kind, 'denied');
  assert.equal(f({ code: 'PGRST202' }).kind, 'missing', 'the function is not deployed (production before the migration: 404)');
  assert.equal(f({ code: '42883' }).kind, 'missing');
  assert.equal(f({ code: 'PGRST002' }).kind, 'unavailable');
  assert.equal(f({ code: '08006' }).kind, 'unavailable');
  assert.deepEqual(f({ code: '', message: 'TypeError: Failed to fetch' }), { kind: 'unreachable', code: null }, 'supabase-js\'s code-less fetch failure');
  assert.equal(f(new TypeError('Load failed')).kind, 'unreachable');
  assert.equal(f(new Error('no database client')).kind, 'unreachable');
  assert.deepEqual(f(new Error('x is not a function')), { kind: 'failed', code: null }, 'a code-less error that is not a fetch exception is not called unreachable');
  assert.deepEqual(f({ code: '22P02' }), { kind: 'failed', code: '22P02' });
  /* the card words each kind, keeps «does not mean there is no story», and hands Atlas the kind */
  const body = read('js/news-story.js');
  assert.match(body, /failureOf\(e\)/, 'the card records the failure\'s kind');
  for (const k of ['timeout', 'denied', 'missing', 'unavailable', 'unreachable']) assert.match(body, new RegExp("f\\.kind === '" + k + "'"), 'the card words ' + k);
  assert.match(body, /errorKind: st\.fail \? st\.fail\.kind : null/, 'Atlas is handed the kind too');
  assert.doesNotMatch(body, /if \(st\.err\) return msg\(L\(/, 'not one sentence for every failure');
});
