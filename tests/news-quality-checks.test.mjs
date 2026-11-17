/* ============================================================================
 *  news-quality — 出来事を正しくまとめ、正しい場所に置き、後日も辿れる
 * ----------------------------------------------------------------------------
 *  2026-11-17 の利用者の報告を、本番データと実際の関数で確かめる回帰。
 *    ① 誤集約: 「FAA 改修の予算要求」に Megaspeed の調査、「独蘭のサッカー」にルワンダの移民拠点、
 *       「英国と EU の関係改善」にマクロンのマレーシア訪問が入っていた。
 *    ② 誤地点: 007 の起用発表がアマゾン川流域、深センの米中露会談がホワイトハウス。
 *    ③ ★・検索・過去の日付・カテゴリが同じ出来事に着かない／★の出来事が記事の期限で読めなくなる。
 *  fixture: tests/fixtures/news-quality-window.json — 本番 news_articles の新しい 1,000 本（公開 REST・
 *  2026-11-17 取得）の、取り込みが読む列だけ。⚠ 取り込みと同じ手順（buildCandidateIndex → placeArticle）で
 *  最初から再生するので、検査は「対の判定」ではなく「出来事として分かれたか」を見る。
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { normaliseTitle, tokenise, buildIdf, pairVerdict, DEFAULTS } from '../supabase/functions/_shared/news-cluster.js';
import { isTitleCase } from '../supabase/functions/_shared/news-entities.js';
import { buildCandidateIndex, placeArticle, pickEventPlace, INDEX } from '../supabase/functions/_shared/news-ingest.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const WINDOW = JSON.parse(fs.readFileSync(here('./fixtures/news-quality-window.json'), 'utf8')).rows;
const byTitle = (s) => {
  const a = WINDOW.find((r) => r.title.startsWith(s));
  assert.ok(a, 'fixture has «' + s + '»');
  return a;
};

/* 取り込みと同じ順・同じ関数で再生する（本番の placeArticle を通す） */
function replay() {
  const arts = WINDOW.filter((a) => a.published_at)
    .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
  const index = buildCandidateIndex(arts.map((a) => ({ ...a, event_id: null })));
  const store = new Map();
  let nid = 0;
  for (const a of index.arts) placeArticle(a, index, store, () => ++nid);
  const eventOf = new Map();
  for (const [id, e] of store) for (const m of e.members) eventOf.set(m.id, id);
  return { eventOf, store, index };
}
const R = replay();
const together = (x, y) => R.eventOf.get(byTitle(x).id) === R.eventOf.get(byTitle(y).id);

/* ── ① 誤集約 ─────────────────────────────────────────────────────────── */
test('news-quality ① the three reported mis-merges are separate events', () => {
  assert.equal(together('Facing Criticism, Trump Administration Says', 'Trump administration asks for billions to overhaul FAA'), false,
    'FAA budget request and the Megaspeed inquiry share only «Trump administration»');
  assert.equal(together('Macron visits Malaysia', 'UK seeks closer ties with EU'), false,
    'Macron in Malaysia and UK–EU ties share only «seeks closer ties», in different places');
  /* the Rwanda article against every Nations League article, under every place the ingest could have given it */
  const rw = byTitle('Germany, Denmark, Austria, Greece and the Netherlands plan Rwanda migrant hub');
  const I = buildIdf(WINDOW);
  for (const t of ['Germany 5-0 Netherlands', 'Germany thrash Netherlands', 'Germany beat Netherlands 5-0']) {
    const b = byTitle(t);
    for (const place of [{}, { subject_type: 'country', subject_lng: b.subject_lng, subject_lat: b.subject_lat }]) {
      const v = pairVerdict({ ...rw, ...place, _tk: null }, { ...b, _tk: null }, DEFAULTS, I);
      assert.equal(v.same, false, 'Rwanda hub vs «' + t + '» (' + (place.subject_type || 'as ingested') + '): ' + v.reasons.join(' · '));
    }
  }
});

test('news-quality ① …and the same replay keeps the events that ARE one event together', () => {
  assert.ok(together('Robert Pattinson named as new James Bond', 'British actor Robert Pattinson confirmed as new James Bond'));
  assert.ok(together('Germany thrash Netherlands', 'Germany beat Netherlands 5-0'));
  assert.ok(together('Two major Kyiv bridges hit', 'Russian strikes hit two key bridges in Kyiv'));
  /* no event swallowed the window: the biggest stays an ordinary story size (measured 13 before and after) */
  const biggest = Math.max(...[...R.store.values()].map((e) => e.members.length));
  assert.ok(biggest <= 15, 'largest event ' + biggest);
});

test('news-quality ① a title is cut at the publisher only when the publisher is known', () => {
  assert.equal(normaliseTitle('Germany 5-0 Netherlands – UEFA Nations League as it happened'),
    'germany 5-0 netherlands – uefa nations league as it happened',
    'the tail of a headline is the headline, not an outlet');
  assert.equal(normaliseTitle('Boeing Engineers Reject Offer - The Seattle Times', 'The Seattle Times'), 'boeing engineers reject offer');
  assert.ok(tokenise('Germany 5-0 Netherlands – UEFA Nations League as it happened').has('league'));
});

test('news-quality ① the veto says why, and names are read from the window, not from a list', () => {
  const I = buildIdf(WINDOW);
  assert.ok(I.names.has('trump') && I.names.has('france'), 'mid-sentence capitals make names');
  assert.ok(!I.names.has('administration') && !I.names.has('seek'), 'lower-case mid-sentence words are not names');
  const faa = pairVerdict({ ...byTitle('Facing Criticism, Trump Administration Says'), _tk: null },
    { ...byTitle('Trump administration asks for billions to overhaul FAA'), _tk: null }, DEFAULTS, I);
  assert.equal(faa.code, 'inferred_place_common_words');
  const mac = pairVerdict({ ...byTitle('Macron visits Malaysia'), _tk: null }, { ...byTitle('UK seeks closer ties with EU'), _tk: null }, DEFAULTS, I);
  assert.equal(mac.code, 'far_no_shared_name');
  /* the "common word" line is the candidate index's line — one number, read from one place */
  assert.equal(INDEX.maxDfRatio, DEFAULTS.commonDf.ratio);
  assert.equal(INDEX.maxDfAbs, DEFAULTS.commonDf.abs);
  assert.equal(I.commonCap, Math.max(2, Math.min(DEFAULTS.commonDf.abs, Math.ceil(I.n * DEFAULTS.commonDf.ratio))));
});

/* ── ② 誤地点 ─────────────────────────────────────────────────────────── */
function loadGeo() {
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(here('../js/newsgeo.js'), 'utf8'), ctx);
  return ctx.IntMapNewsGeo;
}
const GEO = loadGeo();

test('news-quality ② a feature at the head of a company name is not the place (Amazon MGM Studios)', () => {
  const r = GEO.locate('Robert Pattinson named as new James Bond', {
    desc: 'British actor Robert Pattinson will be the next James Bond, Amazon MGM Studios announced on Monday, taking on the role after Daniel Craig\'s departure from the long-running spy series.',
  });
  assert.ok(!r || r.kind !== 'feature', 'not pinned to the Amazon basin: ' + JSON.stringify(r && r.name));
  /* the rule is scoped to features: a thing named after a CITY is usually in it */
  const p = GEO.locate('The Pittsburgh Steelers are searching for a new identity after a loss');
  assert.ok(p && /Pittsburgh/.test(p.name.en), 'Pittsburgh Steelers still points at Pittsburgh: ' + JSON.stringify(p && p.name));
  /* and a possessive or a catalogue place after the word does not trip it */
  const b = GEO.locate('Cargo ship capsizes off Bulgaria’s Black Sea coast');
  assert.ok(b, 'Bulgaria’s Black Sea still located');
});

test('news-quality ② newsgeo’s Title-Case test is the same rule as news-entities isTitleCase', () => {
  /* newsgeo is a classic script and cannot import the module; this keeps the two from drifting */
  let agree = 0, n = 0;
  for (const r of WINDOW) {
    /* sentenceCase answers the opposite question; a line too short to call is neither */
    const words = (r.title.match(/\S+/g) || []).filter((x) => x.replace(/[^\p{L}]/gu, '').length >= 4);
    if (words.length < 3) continue;
    n++;
    if (GEO._sentenceCase(r.title) === !isTitleCase(r.title)) agree++;
  }
  assert.ok(n > 500 && agree / n >= 0.99, 'agreement ' + agree + '/' + n);
});

test('news-quality ② the event place follows the reports, not the finest single pin', () => {
  const ccOf = (name) => {
    const r = name ? GEO.locate(name) : null;
    return (r && r.iso2) || null;
  };
  const P = (name, kind, n, named = 0) => ({ name, kind, n, conf: 0.5, named, lng: 0, lat: 0 });
  /* 007: UK ×5, the Amazon ×1 */
  assert.equal(pickEventPlace([P('United Kingdom', 'country', 5), P('Amazon', 'feature', 1)], ccOf).name, 'United Kingdom');
  /* Shenzhen meeting: China ×3, Beijing ×1, White House ×1 */
  assert.equal(pickEventPlace([P('China', 'country', 3), P('Beijing', 'city', 1), P('White House', 'seat', 1)], ccOf).name, 'China');
  /* everyone says Kyiv → Kyiv (precision kept where the reports give it) */
  assert.equal(pickEventPlace([P('Kyiv', 'city', 6)], ccOf).name, 'Kyiv');
  /* a city most reports name beats its country */
  assert.equal(pickEventPlace([P('Ukraine', 'country', 2), P('Kyiv', 'city', 4)], ccOf).name, 'Kyiv');
  /* a tie of countries goes to the one the headlines name */
  assert.equal(pickEventPlace([P('United States', 'country', 1), P('Santa Clara', 'city', 2, 0), P('China', 'country', 3, 3)], ccOf).name, 'China');
});

/* ── ③ ★・検索・日付・カテゴリ ─────────────────────────────────────────── */
function fakeDb(tables, log) {
  return {
    from(name) {
      const f = { name, ops: [] };
      const b = {
        select: (c) => { f.ops.push(['select', c]); return b; },
        eq: (k, v) => { f.ops.push(['eq', k, v]); return b; },
        is: (k, v) => { f.ops.push(['is', k, v]); return b; },
        in: (k, v) => { f.ops.push(['in', k, v]); return b; },
        or: (s) => { f.ops.push(['or', s]); return b; },
        lte: (k, v) => { f.ops.push(['lte', k, v]); return b; },
        gte: (k, v) => { f.ops.push(['gte', k, v]); return b; },
        order: () => b, limit: () => b,
        upsert: (row) => { f.ops.push(['upsert', row]); log.push(f); return Promise.resolve({ error: null }); },
        delete: () => b,
        then: (res, rej) => {
          log.push(f);
          let rows = (tables[name] || []).slice();
          for (const [op, k, v] of f.ops) {
            if (op === 'eq') rows = rows.filter((r) => r[k] === v);
            if (op === 'in') rows = rows.filter((r) => v.includes(r[k]));
            if (op === 'is') rows = rows.filter((r) => (r[k] ?? null) === v);
          }
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}
async function eventsModule(host, keep) {
  const store = keep || {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  globalThis.window = globalThis;
  globalThis.addEventListener = globalThis.addEventListener || (() => {});
  globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);
  globalThis.document = globalThis.document || { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };
  window.IntMapSafe = { html: (s) => String(s), url: (s) => String(s) };
  const m = await import('../js/news-events.js');
  return { api: m.newsEvents(host), store };
}
const ROW = (id, pid, title, extra = {}) => Object.assign({
  id, public_id: pid, representative_title: title, representative_article_id: null, primary_category: 'world',
  secondary_categories: [], category_confidence: 1, category_evidence: null, rep_lng: 10, rep_lat: 50, rep_place_name_en: 'Somewhere',
  location_confidence: 0.9, first_published_at: '2026-11-10T00:00:00Z', last_article_at: '2026-11-10T06:00:00Z',
  materially_updated_at: '2026-11-10T06:00:00Z', article_count: 2, independent_source_count: 2, cluster_confidence: 1,
  manual_lock: false, status: 'active', merged_into: null, summary: null, summary_evidence: null, summary_version: null,
  news_event_articles: [],
}, extra);

test('news-quality ③ a starred event keeps what it showed: the snapshot is written and read back when the articles are gone', async () => {
  const art = { id: 1, title: 'Bridge reopens after repairs', description: 'The bridge reopened on Monday after two weeks of repairs, the city said.', canonical_url: 'https://example.org/a', source_id: 7, published_at: '2026-11-10T05:00:00Z', subject_name_en: 'Somewhere', subject_type: 'city' };
  const live = ROW(1, 'ev-live', 'Bridge reopens after repairs', { news_event_articles: [{ relation: 'same_event', news_articles: art }] });
  const log = [];
  const tables = { news_sources: [{ id: 7, name: 'Example Times', source_family: 'example' }], news_events: [live] };
  const host = { lang: 'en', user: null, DB: fakeDb(tables, log), applyPinMode: (a) => { a.loc = a.subjectLoc; a.mapped = !!a.subjectLoc; } };
  const { api, store } = await eventsModule(host);
  assert.equal(await api.load(), true);
  const item = api.loaded()[0];
  assert.equal(await api.toggleStar(item), true);
  const snaps = JSON.parse(store.intmap_saved_event_snaps);
  assert.equal(snaps['ev-live'].sources[0].url, 'https://example.org/a', 'the source URL is kept');
  assert.match(snaps['ev-live'].sources[0].desc, /reopened on Monday/, 'the source text is kept');
  assert.ok(snaps['ev-live'].savedAt && snaps['ev-live'].firstAt, 'times are kept');

  /* 3 days later: the article is gone (72 h) and the event has fallen out of the newest 200 */
  const later = { news_sources: tables.news_sources, news_events: [ROW(2, 'ev-new', 'Something else'), ROW(1, 'ev-live', 'Bridge reopens after repairs')] };
  const db = fakeDb(later, log);
  const from = db.from;
  db.from = (name) => {
    const q = from(name);
    if (name !== 'news_events') return q;
    let byId = false;
    const inn = q.in, then = q.then;
    q.in = (k, v) => { byId = true; return inn(k, v); };
    q.then = (res, rej) => then((r) => res(byId ? r : { data: r.data.filter((x) => x.public_id === 'ev-new'), error: null }), rej);
    return q;
  };
  const { api: api2 } = await eventsModule({ ...host, DB: db }, store);
  assert.equal(await api2.load(), true);
  const saved = api2.loaded().find((x) => x._event.publicId === 'ev-live');
  assert.ok(saved, 'a starred event outside the newest 200 is still in the list');
  assert.ok(saved._event.fromSnapshot, 'it says it is read from the snapshot');
  assert.equal(saved._event.members[0].url, 'https://example.org/a', 'its sources are back');
});

test('news-quality ③ search and a past day ask the events table; nothing found falls back to the article feed', async () => {
  const log = [];
  const tables = { news_sources: [], news_events: [ROW(3, 'ev-a', 'Kyiv bridges hit')] };
  const host = { lang: 'en', user: null, DB: fakeDb(tables, log), applyPinMode: (a) => { a.loc = a.subjectLoc; a.mapped = !!a.subjectLoc; } };
  const { api } = await eventsModule(host);
  assert.equal(await api.load({ query: 'kyiv, (bridges)*' }), true);
  const q = log.find((f) => f.name === 'news_events' && f.ops.some((o) => o[0] === 'or'));
  assert.ok(q, 'the search went to the events table');
  const or = q.ops.find((o) => o[0] === 'or')[1];
  assert.ok(!/[(),]\s*bridges|\*\(|\)\*/.test(or.replace(/^representative_title\.ilike\.\*|,summary\.ilike\.\*/g, '')), 'PostgREST separators are stripped from the words: ' + or);
  log.length = 0;
  assert.equal(await api.load({ day: '2026-11-10' }), true);
  const d = log.find((f) => f.name === 'news_events' && f.ops.some((o) => o[0] === 'lte'));
  assert.ok(d && d.ops.some((o) => o[0] === 'gte' && o[1] === 'last_article_at'), 'a day asks for events reported on that day');
  tables.news_events = [];
  assert.equal(await api.load({ query: 'nothing here' }), false, 'no event → false, so the caller falls back to RSS');
});

test('news-quality ③ the feed asks the events table first for search and dates (no longer skips it)', () => {
  const src = fs.readFileSync(here('../js/news-feed.js'), 'utf8');
  assert.ok(!/NEWS_EVENT_MODE && !HOST\.activeSearchQuery && !HOST\.newsDate/.test(src), 'event mode is not switched off by search or a date');
  assert.match(src, /IntMapNewsEvents\.load\(evOpts\)/);
  assert.match(src, /intmap-news-events-grew/, 'category growth is landed by the feed (the one writer of globalData)');
});
