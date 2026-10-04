/* ============================================================================
 *  marketing-next — «on this day»: one calendar index read off the records the map draws, and every door to it
 * ----------------------------------------------------------------------------
 *  ① data/on-this-day.json is what the records give today (scripts/build-on-this-day.mjs re-derives it with the
 *    map's own code) — a rebuilt record that is not re-indexed fails here
 *  ② it NAMES DAYS AND SAYS WHAT THE RECORD SAYS ON THEM (.agents/rules/historical-verification.md §2-1): 1990-10-03,
 *    1945/1947/1948-08-15, 1971-08-15 — and it states nothing the record does not date (no OpenHistoricalMap day, no
 *    seam, no name the record does not date, every 1 January marked)
 *  ③ the map's name no longer depends on which day of an epoch was asked first (js/time-borders.js _csNameKey)
 *  ④ js/on-this-day.js: calendar arithmetic, the headline rule, the words in both languages, and a link that the
 *    map's own decoder reads back as the event's date, place and war layer
 *  ⑤ the pages: one per day that has events and none for a day without, links that resolve, reciprocal hreflang,
 *    nothing that executes, an exact sitemap joined by the index, words key for key in both languages
 *  ⑥ the card is a real 1200×630 PNG, small enough to unfurl
 *  ⑦ the drafts: tags the counter keeps, a page the counter counts as an entry, X's limit, and nothing is sent
 *  ⑧ Atlas reads the same index and opens the same link (time.onThisDay); the search's empty state asks for the card
 *  ⑨ the build writes the pages and the sitemap index lists them; every footer links the calendar
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const IDX = JSON.parse(read('data/on-this-day.json'));
const OTD = await import('../js/on-this-day.js');
const all = () => Object.values(IDX.days).flat();
const enNames = (l) => (l || []).map((p) => p.en);

test('① data/on-this-day.json is what the records give (the map\'s own code, re-run)', async () => {
  const B = await import('../scripts/build-on-this-day.mjs');
  const fresh = await B.build();
  assert.deepEqual(JSON.parse(JSON.stringify(fresh)), IDX, 'data/on-this-day.json is stale — run node scripts/build-on-this-day.mjs');
});

test('② named days say what the border record says on them, and nothing it does not date', () => {
  const day = (md, d) => IDX.days[md].filter((e) => e.d === d && e.src === 'cshapes');
  /* 1990-10-03: the record stops drawing the GDR and redraws the Federal Republic */
  const de = day('10-03', '1990-10-03')[0];
  assert.ok(de, '1990-10-03 is a border day of CShapes');
  assert.deepEqual(enNames(de.ended), ['East Germany']);
  assert.deepEqual(enNames(de.redrawn), ['West Germany']);
  /* 1945-08-15: Korea under Japan, Taiwan and Karafuto end; the two zones of occupation begin — in Japanese as the map writes them */
  const k45 = day('08-15', '1945-08-15')[0];
  assert.deepEqual(enNames(k45.appeared).sort(), ['Korea (USA)', 'Korea (USSR)']);
  for (const n of ['Korea (Japan)', 'Taiwan (Japan)', 'Karafuto (Japan)']) assert.ok(enNames(k45.ended).includes(n), n + ' ends on 1945-08-15');
  assert.equal(k45.ended.find((p) => p.en === 'Korea (Japan)').jp, '朝鮮（日本）');
  assert.ok(enNames(day('08-15', '1947-08-15')[0].appeared).includes('Pakistan'));
  const k48 = day('08-15', '1948-08-15')[0];
  assert.deepEqual(enNames(k48.appeared), ['South Korea']);
  assert.deepEqual(enNames(k48.ended), ['Korea (USA)']);
  /* 1971-08-15 is Bahrain's day in the record. The name table turns 490 into «Zaire» in 1971 by year only (the
     renaming was 1971-10-27): the record dates no edge of 490 there, so it is not listed */
  const b71 = day('08-15', '1971-08-15')[0];
  assert.deepEqual(enNames(b71.appeared), ['Bahrain']);
  assert.ok(!JSON.stringify(b71).includes('Zaire'), 'a renaming the record does not date is listed on another state\'s day');
  /* nothing from OpenHistoricalMap; nothing on the seam; every 1 January border day marked, and only those */
  const border = all().filter((e) => e.src !== 'wars');
  assert.ok(border.every((e) => e.src === 'cshapes'), 'a border event from a record whose dates are not days');
  assert.ok(border.every((e) => e.d > IDX.span.from + '-01-01'), 'the seam (the first day of CShapes) is listed as an event');
  for (const e of border) assert.equal(!!e.maybeYearOnly, /-01-01$/.test(e.d), e.d + ': the 1 January mark is wrong');
  for (const e of border) for (const p of [...(e.appeared || []), ...(e.ended || []), ...(e.redrawn || [])]) assert.ok(p.gw && p.gw.length, e.d + ' ' + p.en + ' carries no state-system code');
  /* every war event is the war record's own row with its own full date */
  const W = JSON.parse(read('data/wars.json'));
  const rows = new Set(W.wars.flatMap((w) => w.events.map((e) => w.id + '|' + e.d + '|' + e.name.en)));
  for (const e of all().filter((x) => x.src === 'wars')) assert.ok(rows.has(e.war + '|' + e.d + '|' + e.name.en), 'not a row of data/wars.json: ' + e.d + ' ' + e.name.en);
  assert.ok(IDX.skipped.notADayRecord > 0 && IDX.skipped.seam === 1, 'the omissions are counted');
});

test('③ the map\'s name for a state does not depend on which day of an epoch was asked first', async () => {
  const { mapReader } = await import('../scripts/history-pages.mjs');
  const R = await mapReader();
  const nameOf = async (y, m, d) => { const r = await R.labelsAt(new Date(y, m - 1, d, 12)); const i = r.fc.features.findIndex((f) => f.properties._gw === 490); return r.labels.en[i]; };
  /* the record's epoch 1970-10-10 … 1971-08-14 holds the name table's 1 January 1971 (490: «Zaire» by year) */
  assert.equal(await nameOf(1970, 12, 1), 'Democratic Republic of the Congo');
  assert.equal(await nameOf(1971, 7, 1), 'Zaire', 'asked after 1970-12-01 (the same epoch), 1971 kept the name the epoch was built with');
  assert.equal(await nameOf(1970, 12, 2), 'Democratic Republic of the Congo', 'and back again');
});

test('④ the reader: calendar, headline, words, and a link the map reads back', async () => {
  assert.equal(OTD.allDays().length, 366);
  assert.equal(OTD.stepDay('12-31', 1), '01-01'); assert.equal(OTD.stepDay('03-01', -1), '02-29');
  assert.equal(OTD.mdOf('1990-10-03'), '10-03'); assert.equal(OTD.mdOf('2-29'), '02-29'); assert.equal(OTD.mdOf('02-30'), null); assert.equal(OTD.mdOf('x'), null);
  assert.equal(OTD.mdOf(new Date(2026, 9, 3, 12)), '10-03');
  const { decode, TITLE_MAX } = await import('../js/map-state.js');
  const { isLayer } = await import('../js/layer-manifest.js');
  for (const md of Object.keys(IDX.days)) {
    const list = OTD.eventsOn(IDX, md), h = OTD.headline(list);
    if (h) assert.ok(!h.maybeYearOnly, md + ': a 1 January day became the headline');
    if (!h) assert.ok(list.every((e) => e.maybeYearOnly), md + ': a day with a stated event has no headline');
    for (const ev of list) {
      for (const lang of ['en', 'jp']) {
        const D = OTD.describe(ev, IDX, lang);
        assert.ok(D.text && D.year === +ev.d.slice(0, 4), md + ' ' + ev.d + ' ' + lang);
        const st = decode(OTD.linkFor(ev, IDX, lang).slice('index.html'.length));
        assert.equal(st.time.at, ev.d, 'the link opens another date');
        assert.ok(st.title.length > 0 && st.title.length <= TITLE_MAX);
        if (ev.src === 'wars') { assert.deepEqual(st.layers, [OTD.warLayerOf(ev)]); assert.ok(isLayer(st.layers[0]), st.layers[0] + ' is not a layer of the manifest'); }
        const b = OTD.boxOf(ev);
        if (b && ev.src !== 'wars') assert.ok(st.view.lng >= b[0] - 1 && st.view.lng <= b[2] + 1, ev.d + ': the view is not on the event');
      }
    }
  }
  /* the words, in both languages, for one day the reader can check */
  const de = IDX.days['10-03'].find((e) => e.d === '1990-10-03');
  assert.equal(OTD.describe(de, IDX, 'en').text, 'The map stops drawing East Germany; new borders for West Germany');
  assert.equal(OTD.describe(de, IDX, 'jp').text, '東ドイツが地図から消える。西ドイツの国境が変わる');
});

test('⑤ the pages: one per day with events, links resolve, hreflang, nothing executes, an exact sitemap', async () => {
  const P = await import('../scripts/on-this-day-pages.mjs');
  const { LANGS } = await import('../scripts/history-pages.mjs');
  const M = P.model();
  const out = P.outputs(M);
  const withEvents = Object.keys(IDX.days).filter((md) => IDX.days[md].length);
  assert.deepEqual(M.days, withEvents.sort());
  for (const L of LANGS) {
    for (const md of M.all) assert.equal(!!out[P.dayPath(md, L) + 'index.html'], M.days.includes(md), md + ' page presence');
    assert.ok(out[P.hubPath(L) + 'index.html'], 'the calendar');
  }
  const cards = new Set(M.days.map((md) => P.cardPath(md)));
  const tracked = (p) => existsSync(join(ROOT, p));
  for (const [rel, html] of Object.entries(out)) {
    if (!rel.endsWith('.html')) continue;
    assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), rel + ' runs a script');
    const dir = posix.dirname(rel) + '/';
    for (const m of html.matchAll(/(?:href|src)="([^"#?]+)/g)) {
      const u = m[1].replace(/&amp;/g, '&');
      if (/^(https?:|__INTMAP_SITE_URL__)/.test(u)) continue;
      const p = posix.normalize(posix.join(dir, u));
      const ok = out[p] || out[p + 'index.html'] || cards.has(p) || tracked(p) || p.startsWith('history/') || p.startsWith('ja/history/') || p === 'index.html';
      assert.ok(ok, rel + ' links to ' + u + ' which nothing writes');
    }
    const alt = [...html.matchAll(/hreflang="(\w+)" href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(alt.slice(0, 2).sort(), ['en', 'ja'], rel + ' hreflang');
  }
  const sm = out[P.OTD_SITEMAP];
  for (const L of LANGS) for (const md of M.days) assert.ok(sm.includes('__INTMAP_SITE_URL__' + P.dayPath(md, L) + '</loc>'), md);
  assert.equal((sm.match(/<url>/g) || []).length, (M.days.length + 1) * LANGS.length, 'the sitemap lists more or fewer pages than are written');
  /* the words of both languages, key for key */
  const { TEXT } = await import('../scripts/on-this-day-text.mjs');
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, p + k + '.') : [p + k + (Array.isArray(v) ? '[' + v.length + ']' : '')])).sort();
  assert.deepEqual(keys(TEXT.jp), keys(TEXT.en));
});

test('⑥ the card is a real 1200×630 PNG with a palette, small enough to unfurl', async () => {
  const P = await import('../scripts/on-this-day-pages.mjs');
  const { drawCard, CARD } = await import('../scripts/lib/map-card.mjs');
  const buf = await drawCard(P.cardSpec(IDX, '10-03'));
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(buf.readUInt32BE(16), CARD.width); assert.equal(buf.readUInt32BE(20), CARD.height);
  assert.equal(buf[25], 3, 'not written with a palette');
  assert.ok(buf.length < 120 * 1024, 'the card is ' + buf.length + ' B');
});

test('⑦ the drafts: tags the counter keeps, a page the counter counts, X\'s limit — and nothing is sent', async () => {
  const P = await import('../scripts/on-this-day-pages.mjs');
  const shape = await import('../supabase/functions/usage-count/shape.js');
  const M = P.model();
  const site = 'https://example.org/IntMap/';
  for (const md of M.days) {
    for (const d of P.draftsFor(M, md, site)) {
      const u = new URL(d.link);
      assert.equal(shape.campaignOf(u.search).length, 3, d.link);
      assert.equal(shape.sitePageOf(u.origin + u.pathname, u.hostname), 'on-this-day', 'the counter does not count ' + u.pathname + ' as an entry');
      if (d.channel === 'x') assert.ok(P.xWeight(d.text) <= 280, md + ' ' + d.lang + ': ' + P.xWeight(d.text));
    }
  }
  assert.equal(shape.sitePageOf('https://h.example/IntMap/ja/history/europe/1914/', 'h.example'), 'history');
  const src = read('scripts/on-this-day-pages.mjs') + read('scripts/build-on-this-day.mjs') + read('scripts/lib/map-card.mjs');
  assert.ok(!/\bfetch\(|https?\.request|from 'node:https?'/.test(src), 'a generator reaches the network');
});

test('⑧ Atlas reads the same index (time.onThisDay); the search\'s empty state asks for the card', async () => {
  const caps = (await import('../js/atlas-cap-time.js')).default;
  const e = caps.find((c) => c.row[0] === 'time.onThisDay');
  assert.ok(e, 'no time.onThisDay');
  assert.equal(e.row[1], 'onThisDay');
  const sch = e.schema();
  assert.deepEqual(Object.keys(sch.properties).sort(), ['date', 'open', 'show']);
  /* run it, headless: the index served from the repository, Atlas's kernel stubbed to its four writers */
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => { const p = String(u).replace(/^.*?(data\/on-this-day\.json).*$/, '$1'); return new Response(read(p), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    const K = { R: (ok, html, extra) => ({ ok, html, ...(extra || {}) }), L: (en) => en, esc: (s) => String(s), note: (s) => s, warn: (s) => s, HOST: { lang: 'en' } };
    const r = await e.run({ date: '1990-10-03' }, {}, K);
    assert.equal(r.ok, true, r.html);
    assert.equal(r.meta.onThisDay.md, '10-03');
    assert.ok(r.meta.onThisDay.events.some((x) => x.date === '1990-10-03' && /East Germany/.test(x.text)));
    const bad = await e.run({ date: '13-40' }, {}, K);
    assert.equal(bad.ok, false);
  } finally { globalThis.fetch = real; }
  assert.match(read('js/showcase-gallery.js'), /import\('\.\/on-this-day\.js'\)\.then\(\(m\) => m\.fillSlot\(/, 'the empty state no longer asks for the day\'s card');
});

test('⑨ the build writes the pages; the sitemap index lists them; every footer links the calendar', async () => {
  const vite = read('vite.config.js');
  assert.match(vite, /onThisDayPagesPlugin\(\)/);
  const P = await import('../scripts/on-this-day-pages.mjs');
  assert.match(read('scripts/history-pages.mjs'), /\[LANDING_SITEMAP, [^\]]*\bOTD_SITEMAP\b[^\]]*\]\.map\(/, 'the sitemap index does not list the «on this day» sitemap');
  for (const f of ['about.html', 'ja/about.html', 'teachers.html', 'for-schools.html', 'ja/for-schools.html']) {
    assert.ok(read(f).includes(P.OTD_HUB), f + ' has no link to the calendar');
  }
});
