/* ============================================================================
 *  weekly-earth — «This week on Earth» (今週の地球): the archive, its builder, its pages, its feeds
 * ----------------------------------------------------------------------------
 *  ① the ISO week is ISO 8601's (week 53, the year boundary) and a slug round-trips
 *  ② the builder refuses an answer that is not what was asked for (a truncated USGS answer, an EONET body without
 *     events, a 503 that never recovers) — and a refused run writes nothing (build() throws before any write)
 *  ③ the builder's judgements: the magnitude floor, the week boundary, the wildfire floor COUNTED, a polygon not placed
 *  ④ the archive accumulates: a settled week is never rewritten, a provisional one is, a first run fills ARCHIVE_DEPTH
 *  ⑤ the committed archive is one the reader understands: consecutive ISO weeks, newest first
 *  ⑥ the pages: one per week per language, the hub, two Atom feeds that are well-formed and complete, the sitemap
 *     the index lists — and every «open on the map» link decodes to the item's place, day and pin
 *  ⑦ the drafts: tags the counter keeps, a page the counter counts as an entry, X's limit
 *  ⑧ the words: both languages carry the same keys
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_HOST, SITE_URL } from '../supabase/functions/_shared/site-origin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const WE = await import('../js/weekly-earth.js');
const B = await import('../scripts/build-weekly-earth.mjs');
const IDX = JSON.parse(read(WE.INDEX_PATH));

/* a USGS feature / an EONET event of the shapes the upstreams answer with (the fields the builder reads) */
const quake = (id, mag, iso, lng = 140, lat = 35) => ({ type: 'Feature', id, properties: { mag, time: Date.parse(iso), place: 'somewhere ' + id, magType: 'mww', type: 'earthquake' }, geometry: { type: 'Point', coordinates: [lng, lat, 10] } });
const usgs = (features, count = features.length) => ({ type: 'FeatureCollection', metadata: { count }, features });
const obs = (iso, type = 'Point', coordinates = [10, 20], mag = null, unit = null) => ({ date: iso, type, coordinates, magnitudeValue: mag, magnitudeUnit: unit });
const ev = (id, cat, geometry) => ({ id, title: 'Event ' + id, categories: [{ id: cat, title: cat }], sources: [{ id: 'SRC', url: 'https://example.org/' + id }], geometry });
const W40 = WE.weekFromSlug('2026-W40');

/* ── ① ───────────────────────────────────────────────────────────────────────────────────── */
test('① the ISO week: Monday 00:00 UTC, numbered by its Thursday, slug round-trips', () => {
  assert.deepEqual(WE.weekOf('2026-10-04T23:59:59Z'), { slug: '2026-W40', from: '2026-09-28', to: '2026-10-05' });
  assert.equal(WE.weekOf('2026-10-05T00:00:00Z').slug, '2026-W41', 'Monday 00:00 UTC starts the next week');
  assert.equal(WE.weekOf('2021-01-03').slug, '2020-W53', 'the first days of 2021 belong to week 53 of 2020');
  assert.equal(WE.weekOf('2024-12-30').slug, '2025-W01', 'a December Monday can start week 1 of the next year');
  assert.equal(WE.weekFromSlug('2021-W53'), null, '2021 has no week 53');
  assert.equal(WE.weekFromSlug('2026-W1'), null);
  for (const w of IDX.weeks) assert.deepEqual(WE.weekFromSlug(w.w), { slug: w.w, from: w.from, to: w.to });
  assert.equal(WE.lastEndedWeek(new Date('2026-10-04T12:00:00Z')).slug, '2026-W39');
});

/* ── ② ───────────────────────────────────────────────────────────────────────────────────── */
test('② an answer that is not what was asked for is refused, and a refused run writes nothing', async () => {
  assert.equal(B.validateUsgs(usgs([quake('a', 6, '2026-09-29')])), true);
  assert.match(String(B.validateUsgs(usgs([quake('a', 6, '2026-09-29')], 2))), /truncated/);
  assert.match(String(B.validateUsgs({ type: 'Feature' })), /FeatureCollection/);
  assert.match(String(B.validateUsgs(usgs([{ id: 'x', properties: {}, geometry: { coordinates: [1, 2, 3] } }]))), /lacks/);
  assert.equal(B.validateEonet({ events: [ev('e', 'volcanoes', [obs('2026-09-29T00:00:00Z')])] }), true);
  assert.match(String(B.validateEonet({ title: 'EONET' })), /no events/);
  assert.match(String(B.validateEonet({ events: [ev('e', 'volcanoes', [obs('not a date')])] })), /no date/);
  /* a 503 that does not recover: build() rejects (the CLI writes only after build() resolves) */
  const down = async () => new Response('Service Unavailable', { status: 503 });
  await assert.rejects(B.build(null, new Date('2026-10-04T12:00:00Z'), { fetchImpl: down, depth: 2, backoffMs: 1, log: () => {} }), /dead/);
  /* a 200 whose body is the wrong thing is refused too */
  const wrong = async (u) => new Response(JSON.stringify(String(u).includes('usgs') ? usgs([quake('a', 6, '2026-09-22')], 9) : { events: [] }), { status: 200 });
  await assert.rejects(B.build(null, new Date('2026-10-04T12:00:00Z'), { fetchImpl: wrong, depth: 2, backoffMs: 1, log: () => {} }), /truncated/);
});

/* ── ③ ───────────────────────────────────────────────────────────────────────────────────── */
test('③ the week holds what the floors say, counts the small wildfires, and places only points', () => {
  const q = [quake('in', 6.1, '2026-09-28T00:00:00Z'), quake('small', 5.4, '2026-09-30T00:00:00Z'), quake('next', 7, '2026-10-05T00:00:00Z'), quake('big', 7.2, '2026-10-04T23:00:00Z')];
  const e = [
    ev('fireBig', 'wildfires', [obs('2026-09-29T00:00:00Z', 'Point', [1, 2], 12000, 'hectare')]),
    ev('fireSmall', 'wildfires', [obs('2026-09-29T00:00:00Z', 'Point', [1, 2], 5000, 'hectare')]),
    ev('fireAcres', 'wildfires', [obs('2026-09-29T00:00:00Z', 'Point', [1, 2], 30000, 'acres')]),   /* 12,140 ha */
    ev('fireUnstated', 'wildfires', [obs('2026-09-29T00:00:00Z', 'Point', [1, 2])]),
    ev('flood', 'floods', [obs('2026-09-30T00:00:00Z', 'Polygon', [[[17.7, 97.7], [17.8, 97.7], [17.8, 97.8], [17.7, 97.7]]])]),
    ev('storm', 'severeStorms', [obs('2026-09-20T00:00:00Z', 'Point', [0, 0], 50, 'kts'), obs('2026-09-29T00:00:00Z', 'Point', [5, 6], 80, 'kts'), obs('2026-10-01T00:00:00Z', 'Point', [7, 8], 60, 'kts')]),
    ev('old', 'volcanoes', [obs('2026-09-01T00:00:00Z')]),
  ];
  const w = B.weekRecord(W40, q, e, '2026-10-12');
  assert.deepEqual(w.quakes.map((x) => x.id), ['big', 'in'], 'M ≥ 5.5, inside [Monday, next Monday), largest first');
  assert.deepEqual(w.events.map((x) => x.id).sort(), ['fireAcres', 'fireBig', 'fireUnstated', 'flood', 'storm'].sort());
  assert.deepEqual(w.fewer, { wildfires: 1 }, 'the small fire is counted, not silently dropped');
  assert.equal(w.events.find((x) => x.id === 'flood').at, null, 'a polygon of unstated axis order is not placed');
  const storm = w.events.find((x) => x.id === 'storm');
  assert.deepEqual(storm.at, [7, 8], 'the latest position inside the week');
  assert.equal(storm.mag, 80, 'the strongest stated value inside the week, not before it');
  assert.equal(storm.d0, '2026-09-29T00:00:00Z');
  assert.equal(w.provisional, false, 'fetched 7 days after the week ended: settled');
  assert.equal(B.weekRecord(W40, q, e, '2026-10-06').provisional, true);
  assert.deepEqual(B.problems({ v: 1, rule: { minMagnitude: B.MIN_MAGNITUDE }, weeks: [w] }), []);
});

/* ── ④ ───────────────────────────────────────────────────────────────────────────────────── */
test('④ the archive accumulates: settled weeks are kept as they were, provisional weeks are asked again', () => {
  const now = new Date('2026-10-14T12:00:00Z');   /* inside 2026-W42: W41 has ended */
  assert.equal(B.weeksToFetch(null, now).length, B.ARCHIVE_DEPTH, 'a first run fills the declared depth');
  const settled = { w: '2026-W39', from: '2026-09-21', to: '2026-09-28', fetched: '2026-10-05', provisional: false, quakes: [], events: [], fewer: {} };
  const prov = { w: '2026-W40', from: '2026-09-28', to: '2026-10-05', fetched: '2026-10-06', provisional: true, quakes: [], events: [], fewer: {} };
  const prev = { v: 1, categories: { floods: 'Floods' }, weeks: [prov, settled] };
  assert.deepEqual(B.weeksToFetch(prev, now).map((w) => w.slug), ['2026-W40', '2026-W41'], 'the new week, and the provisional one again');
  const fresh = [Object.assign({}, prov, { fetched: '2026-10-14', provisional: false, quakes: [{ id: 'late', m: 6, t: '2026-09-30T00:00:00Z', at: [0, 0, 0] }] }),
    { w: '2026-W41', from: '2026-10-05', to: '2026-10-12', fetched: '2026-10-14', provisional: true, quakes: [], events: [], fewer: {} },
    Object.assign({}, settled, { quakes: [{ id: 'rewrite', m: 9, t: '2026-09-22T00:00:00Z', at: [0, 0, 0] }] })];
  const m = B.merge(prev, fresh, { floods: 'Floods' });
  assert.deepEqual(m.weeks.map((w) => w.w), ['2026-W41', '2026-W40', '2026-W39'], 'newest first, nothing dropped');
  assert.deepEqual(m.weeks[2], settled, 'a settled week is never rewritten');
  assert.equal(m.weeks[1].quakes[0].id, 'late', 'a provisional week takes the later answer');
  assert.deepEqual(B.problems(m), []);
});

/* ── ⑤ ───────────────────────────────────────────────────────────────────────────────────── */
test('⑤ the committed archive: valid, consecutive ISO weeks newest first, real upstream records', () => {
  assert.deepEqual(B.problems(IDX), []);
  for (let i = 1; i < IDX.weeks.length; i++) assert.equal(IDX.weeks[i].to, IDX.weeks[i - 1].from, IDX.weeks[i].w + ' is followed by ' + IDX.weeks[i - 1].w);
  assert.ok(IDX.weeks.length >= B.ARCHIVE_DEPTH, 'the archive holds at least the depth the first run filled');
  assert.deepEqual(IDX.rule, { minMagnitude: B.MIN_MAGNITUDE, wildfireMinHectares: B.WILDFIRE_MIN_HA, settleDays: B.SETTLE_DAYS, week: IDX.rule.week });
  for (const w of IDX.weeks) for (const q of w.quakes) assert.match(q.id, /^[a-z]{2}[a-z0-9]+$/, 'a USGS event id: ' + q.id);
  for (const w of IDX.weeks) for (const e of w.events) { assert.match(e.id, /^EONET_\d+$/); assert.ok(IDX.categories[e.cat], 'EONET titled the category ' + e.cat); }
  /* the provenance is a value the governance gate reads, and its credit row is real */
  const row = /\{n:'NASA EONET — Earth Observatory Natural Event Tracker',u:'([^']+)'/.exec(read('js/reference-data.js'));
  assert.ok(row, 'js/reference-data.js credits EONET under the name the GOVERNANCE paidBy states');
  assert.equal(B.GOVERNANCE[WE.INDEX_PATH].paidBy, 'NASA EONET — Earth Observatory Natural Event Tracker');
});

/* ── ⑥ ───────────────────────────────────────────────────────────────────────────────────── */
const P = await import('../scripts/weekly-earth-pages.mjs');
const { LANGS, sitemapIndex } = await import('../scripts/history-pages.mjs');
const MS = await import('../js/map-state.js');
const MM = await import('../js/my-map-doc.js');
const M = P.model(IDX);
const OUT = P.outputs(M);

test('⑥ a page per week per language, the hub, two complete Atom feeds, a sitemap the index lists', () => {
  for (const L of LANGS) {
    for (const w of IDX.weeks) assert.ok(OUT[P.weekPath(w, L) + 'index.html'], 'no page for ' + L.dir + w.w);
    assert.ok(OUT[P.hubPath(L) + 'index.html']);
    const feed = OUT[P.feedPath(L)];
    assert.ok(feed.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
    assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom" xml:lang="[a-z]+">/);
    const entries = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    assert.equal(entries.length, IDX.weeks.length, 'one entry per week');
    const ids = entries.map((e) => /<id>([^<]+)<\/id>/.exec(e)[1]);
    assert.equal(new Set(ids).size, ids.length, 'entry ids are unique');
    for (const e of entries) for (const tag of ['id', 'title', 'updated', 'summary']) assert.match(e, new RegExp('<' + tag + '[ >]'), 'an entry lacks <' + tag + '> (RFC 4287 §4.1.2)');
    for (const e of entries) assert.match(/<updated>([^<]+)<\/updated>/.exec(e)[1], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    /* well-formed: no raw ampersand or angle bracket survived the escaping inside text content */
    assert.doesNotMatch(feed, /&(?!amp;|lt;|gt;|quot;|#)/);
    const page = OUT[P.hubPath(L) + 'index.html'];
    assert.match(page, /<link rel="alternate" type="application\/atom\+xml"/, 'the hub announces its feed');
  }
  const sm = OUT[P.WEEKLY_SITEMAP];
  assert.equal((sm.match(/<url>/g) || []).length, (IDX.weeks.length + 1) * LANGS.length);
  assert.ok(sitemapIndex().includes(P.WEEKLY_SITEMAP), 'sitemap-index.xml lists the weekly sitemap');
});

test('⑥ every «open on the map» link opens the item\'s place and day, with the item as a pin', () => {
  const week = IDX.weeks.find((w) => w.quakes.length && w.events.some((e) => e.at)) || IDX.weeks[0];
  for (const L of LANGS) {
    for (const it of WE.itemsOf(week)) {
      const href = WE.linkFor(it, week, IDX, L.key);
      const st = MS.decode(href.slice(href.indexOf('#')));
      const D = WE.describe(it, IDX, L.key);
      assert.equal(st.time.at, String(D.when).slice(0, 10), 'the day of ' + it.id);
      if (!it.at) { assert.equal(st.mymap, null, it.id + ' is not placed and carries no pin'); continue; }
      assert.ok(Math.abs(st.view.lng - it.at[0]) < 1e-3 && Math.abs(st.view.lat - it.at[1]) < 1e-3, 'the camera on ' + it.id);
      const r = MM.fromLinkValue(st.mymap);
      assert.ok(r.ok && r.dropped === 0 && r.doc.features.length === 1, 'the pin of ' + it.id + ' reads back');
      assert.deepEqual(r.doc.features[0].coords[0].map((v) => +v.toFixed(4)), [it.at[0], it.at[1]]);
      assert.equal(r.doc.features[0].name, MS.captionText(D.title, MS.TITLE_MAX));
    }
    /* the whole week: every placed item, one pin each */
    const ws = MS.decode(WE.weekLink(week, IDX, L.key).replace(/^index\.html/, ''));
    const r = MM.fromLinkValue(ws.mymap);
    assert.equal(r.doc.features.length, WE.itemsOf(week).filter((it) => it.at).length);
    /* and the page writes exactly those links */
    const html = OUT[P.weekPath(week, L) + 'index.html'];
    for (const it of WE.itemsOf(week)) assert.ok(html.includes(WE.linkFor(it, week, IDX, L.key).replace(/&/g, '&amp;')), 'the page links ' + it.id);
  }
});

/* ── ⑦ ───────────────────────────────────────────────────────────────────────────────────── */
test('⑦ the drafts: counted tags, a page the counter counts, X within its limit', async () => {
  const shape = await import('../supabase/functions/usage-count/shape.js');
  const drafts = P.draftsFor(M, IDX.weeks[0], SITE_URL);
  assert.equal(drafts.length, LANGS.length * 3);
  for (const d of drafts) {
    const u = new URL(d.link);
    assert.equal(shape.campaignOf(u.search).length, 3, 'the counter keeps the tags of ' + d.channel);
    assert.equal(shape.sitePageOf(u.origin + u.pathname, SITE_HOST), 'weekly', 'the counter counts ' + u.pathname + ' as an entry');
    if (d.channel === 'x') assert.ok((await import('../scripts/on-this-day-pages.mjs')).xWeight(d.text) <= 280, d.text);
  }
  assert.equal(shape.sitePageOf(SITE_URL + P.feedPath(LANGS[0]), SITE_HOST), null, 'the feed is not an entry page');
  /* nothing is sent: the generator has no network call */
  assert.doesNotMatch(read('scripts/weekly-earth-pages.mjs'), /\bfetch\s*\(|https?\.request|sendBeacon/);
});

/* ── ⑧ ───────────────────────────────────────────────────────────────────────────────────── */
test('⑧ the words: en and jp carry the same keys, and the headline is a count', async () => {
  const { TEXT } = await import('../scripts/weekly-earth-text.mjs');
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, p + k + '.') : [p + k + (Array.isArray(v) ? '[' + v.length + ']' : '')])).sort();
  assert.deepEqual(keys(TEXT.jp), keys(TEXT.en));
  for (const w of IDX.weeks) {
    const h = WE.headline(w);
    if (w.quakes.length) assert.equal(h.m, Math.max(...w.quakes.map((q) => q.m)), w.w + ': the largest earthquake');
  }
  assert.equal(WE.weekWords(W40, 'en'), '28 September – 4 October 2026');
  assert.equal(WE.weekWords(W40, 'jp'), '2026年9月28日〜10月4日');
});
