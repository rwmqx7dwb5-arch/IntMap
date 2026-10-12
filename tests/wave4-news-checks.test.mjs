/* ============================================================================
 *  wave4-news — TODAY ON THE MAP: the day's news as one edition (docs/NEWS-EVENTS.md §18, docs/architecture/04-news.md §4.8).
 * ----------------------------------------------------------------------------
 *  Every function asserted here is the SHIPPED one (js/news-edition-core.js), evaluated on production rows:
 *  tests/fixtures/news-edition-prod.json.gz holds what public.news_events returned (anon read, 2026-10-12) for the query
 *  js/news-edition.js sends, for the UTC day 2026-10-05 — 619 events. The countries are the Natural Earth 10 m outline
 *  the page loads. The wiring checks read the files the doors live in.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (p) => codeOnly(read(p));

const core = await import('../js/news-edition-core.js');
const intel = await import('../js/news-intel-core.js');
const ne = await import('../js/ne-countries.js');
const fine = ne.decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/ne-countries/ne_10m_admin_0_countries.json.gz')))));
const index = intel.makeCountryIndex(fine.features);

const FX = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'tests/fixtures/news-edition-prod.json.gz'))));
const SINCE = Date.parse(FX.since), UNTIL = Date.parse(FX.until);
const build = (o) => core.buildEdition(FX.rows, Object.assign({ sinceMs: SINCE, untilMs: UNTIL, keyAt: index.keyAt, limit: core.EDITION.LIMIT }, o || {}));

test('wave4-news ① the window rule and the counts, on a production day', () => {
  const ed = build();
  assert.equal(FX.rows.length, 619);
  assert.equal(ed.counts.events, 619, 'every row the server returned is in the edition (the server was asked with the same rule)');
  assert.equal(ed.counts.new, 561, 'first reported on the day');
  assert.equal(ed.counts.continuing, 58, 'first reported earlier and still reported on the day');
  assert.equal(ed.counts.new + ed.counts.continuing, ed.counts.events);
  assert.equal(ed.counts.multiSource, 144, 'by 2+ independent outlets');
  assert.equal(ed.counts.unplaced, 44, 'counted, not dropped');
  assert.equal(ed.cut, false, '619 < the 1,000-row fence');
  for (const e of ed.events) assert.ok(e.at < UNTIL && e.last >= SINCE, 'a reporting span that overlaps the day: ' + e.id);
  /* a continuing event says from when */
  assert.ok(ed.events.some((e) => !e.isNew && e.at < SINCE), 'continuing events carry their first report');
});

test('wave4-news ② one ranking — outlets, then articles, then the earlier first report', () => {
  const ed = build();
  assert.equal(ed.top.length, core.EDITION.TOP);
  assert.deepEqual(ed.top.map((e) => e.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.match(ed.top[0].title, /plague in Siberia/, 'the most-reported event of 2026-10-05: 12 independent outlets');
  assert.equal(ed.top[0].sources, 12);
  for (let i = 1; i < ed.events.length; i++) assert.ok(core.rank(ed.events[i - 1], ed.events[i]) <= 0, 'ranked at ' + i);
  /* the order does not depend on the order rows arrive in */
  const shuffled = FX.rows.slice().reverse();
  assert.deepEqual(core.buildEdition(shuffled, { sinceMs: SINCE, untilMs: UNTIL }).top.map((e) => e.id), ed.top.map((e) => e.id));
});

test('wave4-news ③ a row outside the window is not in the edition, whatever the server sent', () => {
  const r = (id, first, last, src) => ({ public_id: id, representative_title: id, first_published_at: first, last_article_at: last, independent_source_count: src, article_count: src });
  const ed = core.buildEdition([
    r('before', '2026-10-03T00:00:00Z', '2026-10-04T23:00:00Z', 30),     /* ended before the day */
    r('after', '2026-10-06T00:00:00Z', '2026-10-06T05:00:00Z', 30),      /* began after it */
    r('through', '2026-10-04T10:00:00Z', '2026-10-07T00:00:00Z', 2),     /* reported through it: continuing */
    r('on', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z', 1),
  ], { sinceMs: SINCE, untilMs: UNTIL });
  assert.deepEqual(ed.events.map((e) => [e.id, e.isNew]), [['through', false], ['on', true]]);
});

test('wave4-news ④ new since the last visit is the first report after it, and only when a visit is known', () => {
  const seen = Date.parse('2026-10-05T12:00:00Z');
  const ed = build({ seenMs: seen });
  const want = FX.rows.filter((r) => Date.parse(r.first_published_at) > seen).length;
  assert.equal(ed.counts.sinceSeen, want);
  assert.ok(want > 0 && want < 619);
  assert.equal(ed.counts.sinceSeenTop, ed.top.filter((e) => Date.parse(e.row.first_published_at) > seen).length);
  for (const e of ed.events) assert.equal(e.sinceSeen, e.at > seen);
  const none = build();
  assert.equal(none.counts.sinceSeen, null, 'no last visit: the edition does not claim anything is new since one');
  assert.ok(none.events.every((e) => !e.sinceSeen));
});

test('wave4-news ⑤ the countries come from the outline, not from the place name', () => {
  const ed = build();
  const plague = ed.top[0];
  assert.equal(plague.place, 'Novosibirsk');
  assert.equal(plague.country, index.keyAt(plague.p[0], plague.p[1]));
  assert.equal(plague.country, 'RU');
  assert.ok(ed.countries.length > 50, 'reported from many countries: ' + ed.countries.length);
  for (let i = 1; i < ed.countries.length; i++) assert.ok(ed.countries[i - 1].n >= ed.countries[i].n);
  const placed = ed.events.filter((e) => e.p).length;
  assert.equal(ed.countries.reduce((a, c) => a + c.n, 0) + ed.counts.atSea, placed, 'every placed event is in a country or said to be at sea');
  assert.equal(ed.categories.reduce((a, c) => a + c.n, 0), 619);
});

test('wave4-news ⑥ the windows: rolling to the clock, a UTC day, today so far, no future day', () => {
  const now = Date.parse('2026-10-13T02:30:00Z');
  assert.deepEqual(core.editionWindow({}, now), { kind: 'rolling', day: null, sinceMs: now - 24 * 3600e3, untilMs: now });
  assert.deepEqual(core.editionWindow({ day: '2026-10-05' }, now), { kind: 'day', day: '2026-10-05', sinceMs: SINCE, untilMs: UNTIL });
  assert.equal(core.editionWindow({ day: '2026-10-13' }, now).untilMs, now, 'today, so far');
  assert.equal(core.editionWindow({ day: '2026-10-14' }, now), null, 'a day after the clock is no edition');
  assert.equal(core.editionWindow({ day: '2026-02-30' }, now), null, 'not a day');
  assert.equal(core.isDay('2026-02-29'), false); assert.equal(core.isDay('2028-02-29'), true);
  assert.deepEqual(core.backDays(now, 3), ['2026-10-12', '2026-10-11', '2026-10-10']);
});

test('wave4-news ⑦ the address is read back as written, and a guessed value is not trusted', () => {
  assert.equal(core.editionQuery({ day: '2026-10-05' }), '?edition=2026-10-05');
  assert.equal(core.editionQuery({}), '?edition=latest');
  assert.deepEqual(core.editionFromSearch('?edition=2026-10-05'), { day: '2026-10-05' });
  assert.deepEqual(core.editionFromSearch('?x=1&edition=latest'), { latest: true });
  assert.deepEqual(core.editionFromSearch('?edition'), { latest: true });
  assert.equal(core.editionFromSearch('?edition=2026-13-01'), null);
  assert.equal(core.editionFromSearch('?edition=<script>'), null);
  assert.equal(core.editionFromSearch('?story=a'), null);
});

test('wave4-news ⑧ the last visit: kept in this browser, never moved backwards', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  const s = mem();
  assert.equal(core.readSeen(s), null);
  assert.equal(core.writeSeen(s, 2000), true); assert.equal(core.readSeen(s), 2000);
  assert.equal(core.writeSeen(s, 1000), true); assert.equal(core.readSeen(s), 2000, 'an older clock does not move the mark back');
  assert.equal(core.writeSeen(s, NaN), false);
  s.setItem(core.SEEN_KEY, 'garbage'); assert.equal(core.readSeen(s), null);
  assert.equal(core.readSeen(null), null);
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(core.writeSeen(full, 5), false, 'a full storage says it did not keep the mark');
});

test('wave4-news ⑨ the text copy carries the top in rank order and the link', () => {
  const ed = build();
  const lines = core.digestLines(ed, { heading: 'H', line: (e) => e.title, rule: 'R', link: 'L' });
  assert.equal(lines[0], 'H');
  assert.match(lines[2], /^1\. .*plague/);
  assert.equal(lines.filter((l) => /^\d+\. /.test(l)).length, 10);
  assert.deepEqual(lines.slice(-2), ['R', 'L']);
  assert.deepEqual(core.walkOrder(ed).map((e) => e.n), ed.top.filter((e) => e.p).map((e) => e.n), 'the walk visits the placed top in rank order');
});

test('wave4-news ⑩ the wiring: the server is asked with the same rule and order, and every door reaches the one body', async () => {
  const body = code('js/news-edition.js');
  assert.match(body, /\.lt\('first_published_at'[^)]*untilMs[\s\S]{0,80}\.gte\('last_article_at'[^)]*sinceMs/, 'the window rule, sent to the server');
  assert.match(body, /\.order\('independent_source_count', \{ ascending: false \}\)\.order\('article_count', \{ ascending: false \}\)\.order\('first_published_at', \{ ascending: true \}\)/, 'the rank, sent as the order');
  assert.match(body, /limit\(EDITION\.LIMIT\)/);
  assert.match(body, /clockLive\(\)\)[\s\S]{0,40}writeSeen/, 'only the live clock marks a visit');
  const { LAZY_REGISTRY } = await import('../js/lazy-modules.js');
  assert.equal(LAZY_REGISTRY.newsEdition.publishes, '__imNewsEdition');
  assert.deepEqual(LAZY_REGISTRY.newsEdition.also, ['newsEvents'], 'the event reader the edition opens arrives with it');
  const doors = code('js/news-pulse.js');
  assert.match(doors, /IntMapLazy\.need\('newsEdition'\)/);
  assert.match(doors, /register\('newsedition\.open'/);
  assert.match(doors, /\[\?&\]edition/, 'a ?edition= link opens it');
  const list = code('js/news-events.js');
  assert.match(list, /count: 'exact', head: true/, 'the entry\'s count is the server\'s, not the loaded 200');
  assert.match(list, /readSeen\(/);
  assert.match(list, /IntMapNewsIntel\.edition\(/);
  const cap = read('js/atlas-cap-news.js');
  assert.match(cap, /row: \['news\.edition',\s+'newsEdition'/);
  const at = /in: 'events', at: (\d+), text: 'TODAY ON THE MAP/.exec(cap);
  assert.ok(at && +at[1] >= 400 && +at[1] <= 439, 'the catalogue position of this wave');
  assert.match(read('js/atlas-capabilities.js'), /"news\.edition","newsEdition"/, 'the generated table holds the row');
});

test('wave4-news ⑪ Atlas finds it by the reader\'s words, en and jp', async () => {
  const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const CAPS = makeAtlasCapabilities({});
  CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
  const top = (q) => CAPS.search(q, { want: 3, min: 1 }).ranked.map((r) => r.id);
  for (const q of ['今日のニュース', '今日の世界で何が起きた', 'news digest', 'what happened today', 'today on the map']) assert.equal(top(q)[0], 'news.edition', q + ' → ' + top(q).join(', '));
});

test('wave4-news ⑫ the privacy policy says what this browser keeps, in both languages', () => {
  const t = read('js/legal-text.js');
  assert.match(t, /<b>今日の世界<\/b>を最後に開いた日時/);
  assert.match(t, /<b>Today on the map<\/b> keeps the time you last opened it in your browser/);
});
