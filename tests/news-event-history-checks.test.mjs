// news-event-history — the rules behind public.news_event_history (docs/NEWS-EVENTS.md §19).
// Runs the SHIPPED module (supabase/functions/_shared/news-history.js), not a copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyKind, makeWorldMatcher, threadKey, buildArchiveRow, HISTORY, pendingArchive } from '../supabase/functions/_shared/news-history.js';

const NODES = [
  { ref: 'facility:wd-Q12493274', name: 'Tangguh LNG terminal', type: 'facility', ids: { wikidata: 'Q12493274' } },
  { ref: 'facility:wd-Q12472558', name: 'Arun LNG terminal', type: 'facility', ids: { wikidata: 'Q12472558' } },
  { ref: 'company:shell', name: 'Shell plc', type: 'company', ids: { company: 'shell' } },
];

test('kind: the strongest reading of the headline wins, and no match is "other"', () => {
  assert.equal(classifyKind('TSMC breaks ground on new fab in Dresden'), 'construction_start');
  assert.equal(classifyKind('Micron to close Singapore plant, ending production'), 'closure');
  assert.equal(classifyKind('Infineon acquires Marvell unit'), 'acquisition');
  assert.equal(classifyKind('Samsung begins mass production at Vietnam factory'), 'operational');
  assert.equal(classifyKind('Intel plans to build chip plant in Malaysia'), 'plan');
  assert.equal(classifyKind('熊本工場が着工'), 'construction_start');
  assert.equal(classifyKind('台湾の工場を閉鎖'), 'closure');
  assert.equal(classifyKind('Prime minister visits Jakarta'), 'other');
  /* a closure that was once planned is a closure */
  assert.equal(classifyKind('Plans to build the plant scrapped as firm shuts down site'), 'closure');
});

test('world matcher: a name counts only as a whole phrase and never by proximity', () => {
  const m = makeWorldMatcher(NODES);
  assert.deepEqual(m.match('Work resumes at the Tangguh LNG terminal after outage'), ['facility:wd-Q12493274']);
  assert.deepEqual(m.match('Tangguh expansion approved'), []);   /* "Tangguh" alone is one short word: not enough */
  assert.deepEqual(m.match('Arun LNG terminal reopens'), ['facility:wd-Q12472558']);
  assert.deepEqual(m.match('A farun LNG thing'), []);   /* inside another word */
  assert.equal(m.byCompanyId.get('shell'), 'company:shell');
});

test('thread: the facility ties the series; same company elsewhere, or another facility, is another thread', () => {
  const a = threadKey({ publicId: 'e1', worldRefs: ['facility:wd-Q1', 'company:shell'], companyIds: ['shell'], lng: 1, lat: 1 });
  const b = threadKey({ publicId: 'e2', worldRefs: ['facility:wd-Q1'], companyIds: [], lng: 50, lat: 50 });
  assert.equal(a, b, 'plan and opening of the same facility are one series');
  const c = threadKey({ publicId: 'e3', worldRefs: ['facility:wd-Q2'], companyIds: [], lng: 1, lat: 1 });
  assert.notEqual(a, c, 'another facility in the same region is another thread');
  const d = threadKey({ publicId: 'e4', worldRefs: [], companyIds: ['micron'], lng: 103.8, lat: 1.3 });
  const e = threadKey({ publicId: 'e5', worldRefs: [], companyIds: ['micron'], lng: 120.9, lat: 24.8 });
  assert.notEqual(d, e, 'the same company in another region is another thread');
  assert.equal(threadKey({ publicId: 'e6', worldRefs: [], companyIds: [], lng: null, lat: null }), 'ev:e6');
});

test('archive row: kept for 2+ families, a stated tie, or a star; dropped otherwise', () => {
  const m = makeWorldMatcher(NODES);
  const ev = (o) => Object.assign({ id: 1, public_id: 'e1', representative_title: 'Some event', summary: null, primary_category: 'business',
    rep_lng: 1, rep_lat: 2, rep_place_name_en: 'X', first_published_at: '2026-01-01T00:00:00Z', first_seen_at: '2026-01-01T00:10:00Z',
    last_article_at: '2026-01-01T02:00:00Z', independent_source_count: 1 }, o);
  const art = (u, fam) => ({ title: 't', canonical_url: u, published_at: '2026-01-01T00:00:00Z', source_id: fam, source_name: fam, source_family: fam });
  assert.equal(buildArchiveRow(ev({}), [art('https://a/1', 'a')], [], m, false), null, 'a single-source event with no tie is not kept');
  assert.ok(buildArchiveRow(ev({ independent_source_count: HISTORY.minSources }), [art('https://a/1', 'a'), art('https://b/1', 'b')], [], m, false));
  assert.ok(buildArchiveRow(ev({}), [art('https://a/1', 'a')], [], m, true), 'a starred event is kept');
  const tied = buildArchiveRow(ev({ representative_title: 'Tangguh LNG terminal begins operation' }), [art('https://a/1', 'a')], [], m, false);
  assert.deepEqual(tied.world_refs, ['facility:wd-Q12493274']);
  assert.equal(tied.kind, 'operational');
  assert.equal(tied.thread_key, 'ref:facility:wd-Q12493274');
  const byCompany = buildArchiveRow(ev({}), [art('https://a/1', 'a')], ['shell'], m, false);
  assert.deepEqual(byCompany.world_refs, ['company:shell']);
  assert.equal(byCompany.sources.length, 1);
});

test('migration: public read, service-role-only write, no FK to news_events or auth.users, the cap is a function', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261126100000_news_event_history.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant select on public\.news_event_history to anon, authenticated/);
  assert.match(sql, /revoke all on function public\.news_history_upsert\(jsonb\) from public, anon, authenticated/);
  assert.doesNotMatch(sql, /references\s+public\.news_events|references\s+auth\.users/, 'the row must outlive the event and the account');
  assert.match(sql, /news_history_trim/);
  assert.match(sql, /coverage_from/, 'the answer says what the archive covers');
});

test('news-ingest: the archive runs BEFORE any delete and a failed archive stops the prune', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/news-ingest/index.ts', import.meta.url), 'utf8');
  const prune = src.slice(src.indexOf('async function stagePrune'));
  assert.ok(prune.indexOf('stageArchive(db)') > -1 && prune.indexOf('stageArchive(db)') < prune.indexOf('.delete('), 'archive precedes every delete');
  assert.match(prune, /if \(out\.archive\.error\)[\s\S]{0,200}return out/);
});

test('embed: a key with no embedding model falls to Gemini, which is asked what it has', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/news-ingest/index.ts', import.meta.url), 'utf8');
  assert.match(src, /geminiEmbeddingModel/);
  assert.ok(src.includes('embedGemini(key, model, inputs, door, { dim: EMBED_DIM'), 'the 1536 width goes to the shared call (gemini-embed-methods), which sends it as outputDimensionality');
  assert.match(src, /provider === "openai" && \(res\.status === 403/);
});

test('pendingArchive skips current events, takes multi-outlet ones first, and rotates a bounded window over the rest', () => {
  const day = (n) => new Date(Date.UTC(2026, 10, n)).toISOString();
  const ev = (id, n, src) => ({ public_id: id, last_article_at: day(n), independent_source_count: src });
  const wrote = new Map([['cur', Date.parse(day(9))]]);
  const evs = [ev('cur', 8, 3), ev('m1', 6, 3), ev('m2', 7, 2), ev('s1', 1, 1), ev('s2', 2, 1), ev('s3', 3, 1), ev('s4', 4, 1)];
  const a = pendingArchive(evs, wrote, 3, 0);
  assert.deepEqual(a.events.map((e) => e.public_id), ['m2', 'm1', 's4']);   /* the multi-outlet ones, then one window of the rest */
  assert.equal(a.skippedCurrent, 1);
  assert.equal(a.deferred, 3);
  const seen = new Set();
  for (let slot = 0; slot < 4; slot++) for (const e of pendingArchive(evs, wrote, 3, slot).events) seen.add(e.public_id);
  assert.deepEqual([...seen].sort(), ['m1', 'm2', 's1', 's2', 's3', 's4'], 'every pending event is examined within a few runs');
  assert.ok(pendingArchive(evs, wrote, 3, 5).events.length <= 3, 'a run never takes more than the cap');
  assert.deepEqual(pendingArchive([], new Map(), 5, 0), { events: [], skippedCurrent: 0, deferred: 0 });
});
