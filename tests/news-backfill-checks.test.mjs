// news-event-history · backfill — the parser behind the past-events record (docs/NEWS-EVENTS.md §19.6).
// Runs the SHIPPED module (supabase/functions/_shared/news-backfill.js) on wikitext in the shape the live pages have.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BACKFILL, plainText, externalLinks, parseDay, dayRows, pagesFromQuery, stableHash } from '../supabase/functions/_shared/news-backfill.js';

const DAY = `{{Current events|year=2019|month=03|day=31|content=
'''Armed conflicts and attacks'''
*[[Syrian civil war]]
**Two fighters are killed in [[Idlib]]. [https://example.org/a (Reuters)] [https://example.org/b (''AP'')]
'''International relations'''
*[[Cross-Strait relations]]
**Taiwan condemns China after two [[People's Liberation Army Air Force|PLAAF]] jets pass the line on the [[Taiwan Strait]]. [https://example.org/c (BBC)]
**An unsourced sentence that nobody cited at all, so it is not kept.
*A lone sentence with no running story at all, sourced once here. [https://example.org/d (Kyodo)]
}}`;

test('plainText: markup goes, the sentence stays', () => {
  assert.equal(plainText("[[People's Liberation Army Air Force|PLAAF]] jets [https://x.org (Y)] ''pass''<ref>n</ref>."), 'PLAAF jets pass.');
});

test('externalLinks: url and publisher name', () => {
  assert.deepEqual(externalLinks('x [https://example.org/a (Reuters)] y [https://b.example/z]'),
    [{ url: 'https://example.org/a', name: 'Reuters' }, { url: 'https://b.example/z', name: 'b.example' }]);
});

test('parseDay: only sourced sentences, filed under the running story the heading names', () => {
  const it = parseDay(DAY);
  assert.equal(it.length, 3);
  assert.equal(it[0].topic, 'Syrian civil war');
  assert.equal(it[1].topic, 'Cross-Strait relations');
  assert.equal(it[1].section, 'international relations');
  assert.equal(it[2].topic, null);
  assert.ok(!it.some((x) => /unsourced/.test(x.text)));
});

test('dayRows: stable id, day-grain time, the thread is the editors\' story, sources keep every publisher', () => {
  const a = dayRows(2019, 3, 31, DAY, null), b = dayRows(2019, 3, 31, DAY, null);
  assert.deepEqual(a.map((r) => r.event_public_id), b.map((r) => r.event_public_id));
  const t = a.find((r) => /Taiwan condemns/.test(r.title));
  assert.equal(t.thread_key, 'wp:Cross-Strait relations');
  assert.equal(t.occurred_at, '2019-03-31T12:00:00Z');
  assert.equal(t.sources[0].name, BACKFILL.sourceName);
  assert.equal(t.sources[0].url, 'https://en.wikipedia.org/wiki/Portal:Current_events/2019_March_31');
  assert.equal(a[0].source_count, 2);
  assert.equal(a[0].sources.length, 3);
  assert.equal(a[2].thread_key, 'ev:' + a[2].event_public_id);
  assert.equal(a[0].lat, null, 'no place is invented');
  assert.notEqual(stableHash('a'), stableHash('b'));
});

test('pagesFromQuery: reads a MediaWiki reply and skips missing pages', () => {
  const m = pagesFromQuery({ query: { pages: [{ title: 'Portal:Current events/2019 March 31', revisions: [{ slots: { main: { content: 'x' } } }] }, { title: 'N', missing: true }] } });
  assert.deepEqual([...m.keys()], ['Portal:Current_events/2019_March_31']);
});

test('the stage is idempotent by construction: its cursor is read from the rows, not stored', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/news-ingest/index.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('async function stageBackfill'), src.indexOf('async function stagePrune'));
  assert.match(body, /like\("event_public_id", "wce:%"\)/);
  assert.match(body, /NEWS_BACKFILL_FLOOR/);
  assert.doesNotMatch(body, /\.delete\(/, 'backfill adds; it never deletes');
});
