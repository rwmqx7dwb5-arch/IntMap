/* ============================================================================
 *  news-intelligence — the news pulse, the country brief, outages beside the news, companies in the news,
 *  the ingest badge and the freshness component (docs/NEWS-EVENTS.md §16).
 * ----------------------------------------------------------------------------
 *  Every function asserted here is the SHIPPED one (js/news-intel-core.js, js/freshness.js,
 *  supabase/functions/_shared/news-entities.js), evaluated on the repository's real data: the Natural Earth
 *  10 m outline the page loads and the company atlas's own roster. The coordinates are production's
 *  representative points (news_events, read 2026-10-02). The database half is supabase/tests/18_….
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const core = await import('../js/news-intel-core.js');
const fresh = await import('../js/freshness.js');
const ent = await import('../supabase/functions/_shared/news-entities.js');
const ne = await import('../js/ne-countries.js');

const fine = ne.decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/ne-countries/ne_10m_admin_0_countries.json.gz')))));
const index = core.makeCountryIndex(fine.features);
const roster = JSON.parse(read('data/companies/index.json')).companies;
const matcher = ent.makeEntityMatcher(roster);
const ids = (r) => r.map((x) => x.id).sort();

/* ── which country a point is in ─────────────────────────────────────────────────────────────────── */
test('news-intelligence ① a point is given a country by the outline, never by its place name', () => {
  /* production holds an event named «Georgia» whose point is Atlanta */
  assert.equal(index.keyAt(-84.388, 33.749), 'US');
  assert.equal(index.keyAt(43.4, 42.2), 'GE');
});

test('news-intelligence ② a coastal city just off the 10 m outline is in its country; the sea is not', () => {
  /* measured: these production points lie 0.1–0.4 km off the outline */
  assert.equal(index.keyAt(12.5683, 55.6761), 'DK', 'Copenhagen');
  assert.equal(index.keyAt(-80.1918, 25.7617), 'US', 'Miami');
  assert.equal(index.keyAt(12.3155, 45.4408), 'IT', 'Venice');
  /* …and the points the server gives seas and straits stay at sea */
  assert.equal(index.keyAt(56.25, 26.5667), null, 'Strait of Hormuz (111 events)');
  assert.equal(index.keyAt(34, 43), null, 'Black Sea');
  assert.ok(core.COAST_KM > 0 && core.COAST_KM < 2.2, 'the tolerance stays below the first harbour point that is at sea (2.2 km)');
});

/* ── the count ───────────────────────────────────────────────────────────────────────────────────── */
const UNTIL = Date.parse('2026-10-02T20:00:00Z');
const pulse = core.decodePulse({
  pts: [[12.5683, 55.6761], [139.6917, 35.6895], [56.25, 26.5667]],
  rows: [
    [0, '2026-10-02', 'politics', 4, 1], [0, '2026-10-01', 'business', 2, 0],   /* Denmark, this window */
    [0, '2026-09-30', 'politics', 1, 0],                                        /* Denmark, the window before (W=2) */
    [1, '2026-10-02', 'disasters', 3, 3], [1, '2026-09-29', 'disasters', 9, 2], /* Japan: in the window, and before it */
    [2, '2026-10-02', 'world', 5, 0],                                           /* at sea */
    [-1, '2026-10-01', 'world', 2, 0],                                          /* no place */
    [0, '2026-09-10', 'society', 7, 0],                                         /* only in the 30-day series */
  ],
});

test('news-intelligence ③ the window, the window before, what has no place and what is at sea', () => {
  const A = core.aggregate(pulse, index, { untilMs: UNTIL, windowDays: 2 });
  assert.deepEqual(A.days, ['2026-10-01', '2026-10-02']);
  assert.deepEqual(A.prevDays, ['2026-09-29', '2026-09-30']);
  const dk = A.countries.get('DK'), jp = A.countries.get('JP');
  assert.equal(dk.n, 6); assert.equal(dk.prev, 1); assert.equal(dk.multi, 1);
  assert.deepEqual(dk.cats, { politics: 4, business: 2 });
  assert.equal(jp.n, 3); assert.equal(jp.prev, 9);
  assert.equal(A.notInCountry, 5, 'the strait is counted, as «at sea»');
  assert.equal(A.unplaced, 2, 'the event with no place is counted, not dropped');
  assert.equal(A.total, 6 + 3 + 5 + 2);
  assert.equal(dk.series.reduce((a, b) => a + b, 0), 14, 'the 30-day series carries every day');
  const cat = core.aggregate(pulse, index, { untilMs: UNTIL, windowDays: 2, category: 'disasters' });
  assert.equal(cat.countries.get('JP').n, 3); assert.equal(cat.countries.get('DK'), undefined);
});

test('news-intelligence ④ rising is a difference of counts, not a ratio; the shade is a square root', () => {
  const A = core.aggregate(pulse, index, { untilMs: UNTIL, windowDays: 2 });
  assert.deepEqual(core.rank(A, 'volume').map((c) => c.key), ['DK', 'JP']);
  assert.deepEqual(core.rank(A, 'rising').map((c) => c.key), ['DK'], 'Japan fell (9 → 3) and is not «rising»');
  assert.deepEqual(core.change(3, 0), { kind: 'new', ratio: null });
  assert.equal(core.change(2, 4).kind, 'down');
  const s = core.shade(A, 'volume');
  assert.equal(s.get('DK'), 1); assert.equal(Math.round(s.get('JP') * 1000), Math.round(Math.sqrt(3 / 6) * 1000));
});

/* ── outages beside the news ─────────────────────────────────────────────────────────────────────── */
test('news-intelligence ⑤ an IODA outage event is read from the location the service wrote, and tied to news by country and time only', () => {
  assert.equal(core.outageOf({ location: 'region/1234', start: 1, duration: 1 }), null, 'a region is not a country');
  const o = core.outageOf({ location: 'country/PY', location_name: 'Paraguay', start: 1789497000, duration: 3600, datasource: 'bgp', score: 3 });
  assert.deepEqual([o.cc, o.start, o.end, o.signal], ['PY', 1789497000000, 1789500600000, 'bgp']);
  const ev = [
    { cc: 'PY', at: o.start - 6 * 3600e3, t: 'before' }, { cc: 'PY', at: o.end + 20 * 3600e3, t: 'after' },
    { cc: 'PY', at: o.end + 30 * 3600e3, t: 'too late' }, { cc: 'AR', at: o.start, t: 'other country' },
  ];
  const [l] = core.linkOutages([o], ev);
  assert.deepEqual(l.news.map((x) => x.t), ['before', 'after']);
});

/* ── the ingest badge ────────────────────────────────────────────────────────────────────────────── */
test('news-intelligence ⑥ «could not check», «no update for N h» and «fresh» are three answers, and the rhythm is read, not written', () => {
  assert.equal(core.scheduleMs('*/20 * * * *'), 20 * 60000);
  assert.equal(core.scheduleMs('13 * * * *'), null, 'only the minute-step form is parsed');
  const now = Date.parse('2026-10-02T20:00:00Z');
  assert.equal(core.ingestVerdict(null, { error: 'permission denied' }).state, 'unverified');
  const base = { tick_schedule: '*/20 * * * *', median_gap_s: 1200, checked_at: new Date(now).toISOString() };
  assert.equal(core.ingestVerdict(Object.assign({ last_ok_at: new Date(now - 30 * 60000).toISOString() }, base), { now }).state, 'fresh');
  const stale = core.ingestVerdict(Object.assign({ last_ok_at: new Date(now - 5 * 3600e3).toISOString() }, base), { now });
  assert.equal(stale.state, 'stale'); assert.equal(stale.rhythmFrom, 'schedule');
  /* no schedule readable → the measured gap stands in */
  const gap = core.ingestVerdict({ median_gap_s: 1200, last_ok_at: new Date(now - 30 * 60000).toISOString() }, { now });
  assert.equal(gap.rhythmFrom, 'median-gap'); assert.equal(gap.state, 'fresh');
  const st = core.ingestVerdict(Object.assign({ last_ok_at: new Date(now).toISOString(), stages: {
    embed: { last_error_at: '2026-10-02T19:40:00Z', last_ok_at: '2026-10-01T00:00:00Z' },
    fetch: { last_error_at: '2026-10-02T10:00:00Z', last_ok_at: '2026-10-02T19:40:00Z' },
    translate: { last_skipped_at: '2026-10-02T19:40:00Z' } } }, base), { now });
  assert.deepEqual(st.failing, ['embed'], 'a stage that failed after its last clean run is failing; one that recovered is not');
  assert.deepEqual(st.skipped, ['translate'], 'switched off is not failing');
});

test('news-intelligence ⑦ the freshness component says the four states in four different sentences, in en and jp', () => {
  const now = Date.parse('2026-10-02T20:00:00Z');
  /* the sentence the reader sees: tags removed until none are left (one pass can leave a tag that two
     overlapping ones formed), and any `<` that survives is not markup — it is dropped too */
  const plain = (html) => { let s = String(html), prev; do { prev = s; s = s.replace(/<[^<>]*>/g, ''); } while (s !== prev); return s.replace(/</g, ''); };
  const txt = (o, lang) => plain(fresh.freshChip(Object.assign({ now, lang }, o)));
  for (const lang of ['en', 'jp']) {
    const f = txt({ at: now - 30 * 60000, rhythmMs: 20 * 60000, by: 'X' }, lang);
    const s = txt({ at: now - 5 * 3600e3, rhythmMs: 20 * 60000, by: 'X' }, lang);
    const u = txt({ unverified: true }, lang);
    const k = txt({}, lang);
    assert.equal(new Set([f, s, u, k]).size, 4, lang);
    assert.match(s, lang === 'en' ? /No update for 5 h/ : /5 時間 更新なし/);
    assert.match(u, lang === 'en' ? /not an all-clear/ : /問題が無いという意味ではありません/);
  }
  assert.equal(fresh.judge({ at: now - 50 * 60000, now, rhythmMs: 20 * 60000 }).state, 'fresh', 'two missed runs is noise');
  assert.equal(fresh.judge({ at: now - 60 * 60000, now, rhythmMs: 20 * 60000 }).state, 'stale', 'three is a pattern');
});

/* ── which company a headline names ──────────────────────────────────────────────────────────────── */
test('news-intelligence ⑧ a one-word company name needs a capital that means something', () => {
  /* production headlines, 2026-10-02 */
  assert.deepEqual(ids(matcher.match({ title: 'China’s ‘Mini Stimulus’ Seen Securing GDP Target, Not Much More' }, { category: 'business' })), [], 'Title Case: the capital is no evidence');
  assert.deepEqual(ids(matcher.match({ title: 'Target has been on fire this year. HSBC sees more upside ahead' }, { category: 'business' })), ['hsbc', 'target']);
  assert.deepEqual(ids(matcher.match({ title: 'Labor targets ‘visa hopping’ students', description: 'news podcast “Visa hopping” international students will be targeted' }, { category: 'society' })), [], 'a quotation begins with a capital');
  assert.deepEqual(ids(matcher.match({ title: 'Target cuts its outlook' }, { category: 'world' })), [], 'a capital that starts the sentence, outside business/technology');
  assert.deepEqual(ids(matcher.match({ title: 'Ethiopian Airlines agrees to buy 10 Boeing cargo planes' }, { category: 'world' })), ['boeing']);
});

test('news-intelligence ⑨ the registered name and an exchange ticker are strong evidence; the strongest one is kept', () => {
  const r = matcher.match({ title: 'Apple Inc. (NASDAQ: AAPL) shares rose; Apple said demand was strong' }, { category: 'world' });
  assert.deepEqual(r.map((x) => [x.id, x.kind]), [['apple', 'legal_name']]);
  const t = matcher.match({ title: 'Shares of (NYSE:BA) slid after the report' }, { category: 'world' });
  assert.deepEqual(t.map((x) => [x.id, x.kind]), [['boeing', 'ticker']]);
  assert.deepEqual(ids(matcher.match({ title: 'BA flights were cancelled' }, { category: 'business' })), [], 'a bare ticker is not evidence');
  const e = matcher.match({ title: 'Boeing white-collar workers approve contract offer, averting strike fears' }, { category: 'business' })[0];
  assert.ok(e.evidence.includes('Boeing'), 'the row carries the sentence it rests on');
  assert.deepEqual(ent.MATCH_KINDS, ['legal_name', 'ticker', 'name']);
  /* the table's CHECK holds the same three words */
  assert.match(read('supabase/migrations/20261003160000_news_intelligence.sql'), /matched_by in \('legal_name', 'ticker', 'name'\)/);
});

/* ── the wiring ──────────────────────────────────────────────────────────────────────────────────── */
test('news-intelligence ⑩ the ingest stage, its order, its record and its schedule', () => {
  const src = read('supabase/functions/news-ingest/index.ts');
  assert.match(src, /import \{ makeEntityMatcher \} from "\.\.\/_shared\/news-entities\.js"/);
  const order = JSON.parse(/const ORDER = (\[[^\]]+\])/.exec(src)[1]);
  assert.ok(order.indexOf('entities') > order.indexOf('link'), 'entities runs after link (no company on an event about to be merged)');
  for (const k of ['embed_error', 'embed_skipped', 'entities_error']) assert.ok(src.includes(k + ':'), 'the run record keeps ' + k + ' — news_ingest_health() reads <stage>_error');
  const mig = read('supabase/migrations/20261003160000_news_intelligence.sql');
  const body = /"stages":\[([^\]]+)\]/.exec(mig)[1];
  for (const s of ['embed', 'entities', 'locate']) assert.ok(body.includes('"' + s + '"'), 'news-ingest-tick runs ' + s);
  assert.match(mig, /ANON MAY CALL: \S/);
  assert.doesNotMatch(mig, /'ANON MAY CALL[^']*'\s*;\s*$/m, 'the comment is a sentence, not the bare marker');
});

test('news-intelligence ⑪ IODA is read live and never stored', () => {
  for (const f of readdirSync(join(ROOT, 'supabase/migrations'))) assert.doesNotMatch(read('supabase/migrations/' + f), /ioda/i, f);
  for (const d of readdirSync(join(ROOT, 'supabase/functions'))) {
    let s = ''; try { s = read('supabase/functions/' + d + '/index.ts'); } catch (_) { continue; }
    assert.doesNotMatch(s, /api\.ioda\.inetintel/, d);
  }
  assert.match(read('js/net-health-live.js'), /async function outageEvents/);
});

test('news-intelligence ⑫ one layer, one lazy body, one time declaration, five Atlas doors', async () => {
  const d = (await import('../js/layers/dl-newspulse.js')).default;
  assert.deepEqual([d.id, d.key, d.lazy[0]], ['dl-newspulse', 'newspulse', 'newsIntel']);
  assert.match(read('js/lazy-modules.js'), /newsIntel: \{ publishes: '__imNewsIntel', load: \(\) => import\('\.\/news-intel\.js'\)/);
  const { TIME } = await import('../js/layer-time-decl.js').then((m) => ({ TIME: m.TIME || m.default || m }));
  const decl = TIME['dl-newspulse'] || (TIME.TIME && TIME.TIME['dl-newspulse']);
  assert.ok(decl && decl.kind === 'record' && /clockUntil/.test(decl.follows), 'the pulse follows the clock');
  assert.match(read('js/news-intel.js'), /function clockUntil\(\)/);
  const caps = (await import('../js/atlas-cap-news.js')).default.map((e) => e.row[0]);
  for (const id of ['news.pulse', 'news.brief', 'news.outages', 'news.health', 'news.company']) assert.ok(caps.includes(id), id);
  assert.match(read('js/app-body.js'), /newsPulse\(IM_HOST\)/);
});
