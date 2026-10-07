/* ============================================================================
 *  history-year-pages — «World map in 1914»: one entry page per chosen year (scripts/year-pages.mjs)
 * ----------------------------------------------------------------------------
 *  ① the years are the rule, re-derived here from the records: every sheet year, every polity-kind event year up to the
 *    last border year, and the turning points — each of which is a change at or above the cut and never a seam; every
 *    kind the index holds is classified; the six years the brief names have a page
 *  ② what the pages STATE about those six years, held as regressions of the historical check (dev-notes): names the map
 *    must draw there and names it must not (an empire before it began or after it ended)
 *  ③ the change rule: an outline borrowed from the nearest sheet is never counted as a change between two years
 *  ④ the events are the index's records dated to the year (never a span that began earlier), each with its source
 *  ⑤ the page: the picture exists and is drawn, the map link opens the world on 1 July of that year, the structured data
 *    is a Map with the year as its temporal coverage, hreflang is reciprocal, links resolve, nothing executes
 *  ⑥ the sitemap lists every page in both languages and the index joins it; the build runs the plugin; the counter
 *    counts a year page as the `history` entry it already discloses; the words key for key
 *  ⑦ the picture: a ring across 180° is drawn on both sides, a ring under a pixel is not drawn
 *  ⑧ a year page and the world page of the same year answer different searches: titles, h1 and descriptions never
 *    coincide (the world page's are read from its generator, never copied), and each links the other saying what it is
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const P = await import('../scripts/year-pages.mjs');
const H = await import('../scripts/history-pages.mjs');
const { decode } = await import('../js/map-state.js');
const { yearOf } = await import('../js/time-index.js');
const LANGS = H.LANGS;
const SIX = [-199, 1000, 1648, 1815, 1914, 1945];   /* 200 BC, AD 1000, 1648, 1815, 1914, 1945 — the years the brief names */
const M = await P.model({ years: SIX });
const out = P.outputs(M);
const byYear = new Map(M.pages.map((p) => [p.y, p]));
const page = (y, L) => out[P.yearPath(y, L) + 'index.html'];
const idx = JSON.parse(read('data/on-this-day.json'));
const readBundle = (rel) => { const t = read(rel); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };

test('① the chosen years are the three rules applied to the records', () => {
  const C = M.choice, B = M.bands;
  const years = new Set(C.years);
  for (const y of readBundle('data/hist-eras.js').snaps.map((s) => s.y).filter((y) => y <= B.csTo)) assert.ok(years.has(y), 'sheet year ' + y + ' has no page');
  for (const e of idx.events) {
    assert.ok(e.kind in P.EVENT_KINDS, 'kind ' + e.kind + ' is not classified');
    const y = yearOf(e);
    if (P.EVENT_KINDS[e.kind] && y <= B.csTo) assert.ok(years.has(y), e.name.en + ' (' + y + ') has no page');
  }
  const seamYears = new Set(C.turn.seams.map((s) => s.y));
  assert.ok(C.turn.seams.some((s) => s.y === B.csFrom), 'the year CShapes begins is a seam');
  assert.ok(C.turn.seams.some((s) => s.y === B.ohmFrom), 'the year OpenHistoricalMap begins is a seam');
  let turns = 0;
  for (const y of C.years) {
    const w = C.why.get(y);
    assert.ok(w.sheet || w.turn || w.event, y + ' has a page and no reason');
    if (!w.turn) continue;
    turns++;
    assert.ok(w.turn >= C.turn.cut, y + ' is a turning point below the cut');
    assert.ok(!seamYears.has(y), y + ' is a seam counted as a change');
  }
  assert.ok(turns >= Math.ceil(C.turn.changes * P.TURN_SHARE), 'the top share has at least its share of years (ties at the cut are all kept)');
  /* the size the brief set — a policy, measured, not a regex guard */
  assert.ok(C.years.length >= 40 && C.years.length <= 120, C.years.length + ' years');
  for (const y of SIX) assert.ok(years.has(y), y + ' has no page');
  /* no year past the border records: the map draws today's borders there, which is not a historical map */
  assert.ok(Math.max(...C.years) <= B.csTo);
});

const has = (y, en) => byYear.get(y).names.some((n) => n.en === en);
test('② what the six pages state: the names the map draws there, and the anachronisms it must not', () => {
  for (const en of ['German Empire', 'Austria-Hungary', 'Ottoman Empire', 'Russian Empire', 'Republic of China']) assert.ok(has(1914, en), '1914 lacks ' + en);
  for (const en of ['Soviet Union', 'Kingdom of Yugoslavia']) assert.ok(!has(1914, en), '1914 draws ' + en);
  for (const en of ['Soviet Union', 'Turkey', 'Iceland']) assert.ok(has(1945, en), '1945 lacks ' + en);
  for (const en of ['German Empire', 'Austria-Hungary', 'Ottoman Empire', 'Russian Empire']) assert.ok(!has(1945, en), '1945 draws ' + en);
  assert.ok(has(1815, 'Austrian Empire') && has(1815, 'Russian Empire') && has(1815, 'Sweden–Norway'));
  assert.ok(!has(1815, 'Holy Roman Empire'), '1815 draws the Holy Roman Empire, dissolved 1806');
  assert.ok(has(1648, 'Dutch Republic') && has(1648, 'Tsardom of Russia') && has(1648, 'Southern Ming') && has(1648, 'Qing Dynasty'));
  assert.ok(!has(1648, 'Russian Empire'), '1648 draws the Russian Empire, proclaimed 1721');
  assert.ok(has(-199, 'Roman Republic') && has(-199, 'Han Dynasty') && has(-199, 'Seleucid Empire') && has(-199, 'Ptolemaic Kingdom'));
  assert.ok(!has(-199, 'Roman Empire'), '200 BC draws the Roman Empire');
  assert.ok(has(1000, 'Holy Roman Empire') && has(1000, 'Northern Song') && has(1000, 'Byzantine Empire') && has(1000, 'Fatimid Caliphate'));
  assert.ok(!has(1000, 'Ottoman Empire') && !has(1000, 'Mongol Empire'));
  /* the page says «the map draws», never «existed» */
  for (const y of SIX) for (const L of LANGS) assert.ok(!/\bexisted\b/.test(page(y, L)), y + ' ' + L.key);
});

test('③ an outline borrowed from the nearest sheet is not a change between two years', () => {
  for (const p of M.pages) {
    if (!p.prev) continue;
    const sheetOk = p.isSheet && p.prev.isSheet;
    for (const n of [...p.added, ...p.removed]) assert.ok(sheetOk || [...n.recs].some((k) => k !== 'sheet'), p.y + ': ' + n.en + ' is counted from a borrowed sheet');
  }
  /* 1648 is not a sheet year: the change from AD 1000 is counted over the dated records only */
  const p = byYear.get(1648);
  assert.ok(!p.isSheet && p.added.length > 0 && p.added.every((n) => [...n.recs].some((k) => k !== 'sheet')));
});

test('④ the events are the records dated to the year, with their sources', () => {
  for (const p of M.pages) for (const ev of p.events) assert.equal(yearOf(ev), p.y, p.y + ' lists ' + ev.d);
  const w = byYear.get(1648).events.find((e) => e.src === 'wikidata' && /Westphalia/.test(e.name.en));
  assert.ok(w && w.d === '1648-10-24', 'the Peace of Westphalia, as Wikidata dates it');
  for (const L of LANGS) assert.ok(page(1648, L).includes('href="https://www.wikidata.org/wiki/' + w.q + '"'), 'its item is cited');
  /* 1945 does not list an operation that began in 1939 */
  assert.ok(!byYear.get(1945).events.some((e) => String(e.d).startsWith('1939')));
  assert.ok(byYear.get(1914).events.some((e) => e.src === 'wars' && e.d === '1914-06-28'));
});

test('⑤ the page: picture, map link, structured data, hreflang, links, nothing executes', () => {
  for (const p of M.pages) {
    const svg = out[P.mapPath(p.y)];
    assert.ok(svg && svg.startsWith('<svg') && /viewBox="0 0 \d+ \d+"/.test(svg), p.y + ' picture');
    assert.ok(p.picture.drawn > 0, p.y + ' draws nothing');
    for (const L of LANGS) {
      const html = page(p.y, L);
      assert.ok(html.includes('src="' + H.upFrom(P.yearPath(p.y, L)) + P.mapPath(p.y) + '"'), p.y + ' ' + L.key + ' shows its picture');
      const link = /href="(?:\.\.\/)*index\.html(#[^"]+)" data-year-map=/.exec(html);
      assert.ok(link, p.y + ' has a map link');
      const st = decode(link[1].replace(/&amp;/g, '&'));
      assert.equal(st.time.at, H.isoDay(p.y), p.y + ' opens on 1 July of its year');
      assert.deepEqual(st.view, H.regionView(H.REGIONS.find((r) => r.id === 'world')), 'on the world');
      const lds = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));
      const map = lds[0].mainEntity;
      assert.equal(map['@type'], 'Map');
      assert.equal(map.temporalCoverage, P.isoYear(p.y));
      assert.ok(map.image.endsWith(P.mapPath(p.y)));
      for (const l of LANGS) assert.ok(html.includes(`<link rel="alternate" hreflang="${l.tag}" href="__INTMAP_SITE_URL__${P.yearPath(p.y, l)}">`), p.y + ' ' + L.key + ' → ' + l.tag);
      assert.ok(html.includes(`<link rel="canonical" href="__INTMAP_SITE_URL__${P.yearPath(p.y, L)}">`));
    }
  }
  assert.equal(P.isoYear(-199), '-0199');
  assert.equal(P.isoYear(1914), '1914');
  const tracked = (p) => existsSync(join(ROOT, p));
  const generated = /^(ja\/)?(history|on-this-day|countries)\//;
  for (const [rel, html] of Object.entries(out)) {
    if (!rel.endsWith('.html')) continue;
    assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), rel + ' runs a script');
    const dir = posix.dirname(rel) + '/';
    for (const m of html.matchAll(/(?:href|src)="([^"#?]+)/g)) {
      const u = m[1].replace(/&amp;/g, '&');
      if (/^(https?:|__INTMAP_SITE_URL__)/.test(u)) continue;
      const p = posix.normalize(posix.join(dir, u));
      assert.ok(out[p] || out[p + 'index.html'] || tracked(p) || generated.test(p), rel + ' links to ' + u + ' which nothing writes');
    }
  }
  /* each year links the history page that lists the same names, where the history pages have one */
  assert.ok(page(1914, LANGS[0]).includes('data-history-run="1914"'));
  assert.ok(!page(1648, LANGS[0]).includes('data-history-run='), '1648 is between two sheets: the history pages have no page for it');
});

test('⑥ sitemap, index, build, counter, words', async () => {
  const sm = out[P.YEAR_SITEMAP];
  const locs = [...sm.matchAll(/<loc>__INTMAP_SITE_URL__([^<]*)<\/loc>/g)].map((m) => m[1]);
  const pages = Object.keys(out).filter((r) => r.endsWith('index.html')).map((r) => r.slice(0, -'index.html'.length));
  assert.deepEqual(locs.slice().sort(), pages.slice().sort());
  assert.ok(H.sitemapIndex().includes('__INTMAP_SITE_URL__' + P.YEAR_SITEMAP), 'the sitemap index joins the year sitemap');
  assert.ok(P.YEAR_HUB.startsWith(H.HUB), 'the year pages live under the history pages\' hub');
  assert.match(read('vite.config.js'), /historyPagesPlugin\(\), [^\]]*yearPagesPlugin\(\)/, 'the plugin runs after the history pages it links');
  const S = await import('../supabase/functions/usage-count/shape.js');
  const { SITE_HOST, SITE_URL } = await import('../supabase/functions/_shared/site-origin.js');
  for (const L of LANGS) {
    assert.equal(S.sitePageOf(SITE_URL + P.yearPath(1914, L), SITE_HOST), 'history', L.key + ' year page is the history entry');
    assert.equal(S.sitePageOf(SITE_URL + P.hubPath(L), SITE_HOST), 'history', L.key + ' year hub is the history entry');
  }
  assert.equal(S.sitePageOf(SITE_URL + P.mapPath(1914), SITE_HOST), null, 'a picture is not a door');
  /* the history hub links the year hub */
  const HM = { regions: H.REGIONS, pages: [], byRegion: new Map(), bands: M.bands, image: M.image };
  const HO = H.outputs(HM);
  for (const L of LANGS) assert.ok(HO[H.hubPath(L) + 'index.html'].includes(L.dir + P.YEAR_HUB + '"'), L.key + ' history hub links the year hub');
  const { TEXT } = await import('../scripts/year-pages-text.mjs');
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, p + k + '.') : [p + k + (Array.isArray(v) ? '[' + v.length + ']' : '')])).sort();
  assert.deepEqual(keys(TEXT.jp), keys(TEXT.en));
  /* the hub groups by century, and AD 1000 is the 10th century */
  assert.deepEqual(P.eraOf(1000), { k: 'c', n: 10 });
  assert.deepEqual(P.eraOf(-199), { k: 'cbc', n: 2 });
  assert.deepEqual(P.eraOf(-1999), { k: 'mbc', n: 2 });
});

test('⑦ the picture: across 180° on both sides, under a pixel not drawn', async () => {
  const W = await import('../scripts/lib/world-svg.mjs');
  /* a box from 170°E to 170°W (Chukotka's shape of problem), written as a ring that jumps the antimeridian */
  const across = { type: 'Polygon', coordinates: [[[170, 60], [-170, 60], [-170, 70], [170, 70], [170, 60]]] };
  const d = W.geometryPath(across);
  assert.equal((d.match(/M/g) || []).length, 2, 'one copy each side of 180°');
  const xs = [...d.matchAll(/M(-?\d+) /g)].map((m) => +m[1] / 10);
  assert.ok(xs.some((x) => x > W.WIDTH * 0.85) && xs.some((x) => x < W.WIDTH * 0.15), 'drawn at both edges: ' + xs);
  assert.equal(W.geometryPath({ type: 'Polygon', coordinates: [[[10, 10], [10.01, 10], [10.01, 10.01], [10, 10]]] }), '', 'under a pixel');
  const pic = W.draw({ land: [], features: [{ geometry: across, name: 'x' }], title: 't' });
  assert.equal(pic.drawn, 1);
  assert.ok(pic.svg.includes('clip-path="url(#w)"'));
});

test('⑧ a year page and the world page of the same year: different titles, h1 and descriptions; each links the other', async () => {
  const HM = await H.collect({ regions: ['world'], years: SIX });
  const HO = H.outputs(HM);
  const head = (html) => ({ title: /<title>([^<]*)<\/title>/.exec(html)[1], h1: /<h1>([^<]*)<\/h1>/.exec(html)[1], desc: /<meta name="description" content="([^"]*)"/.exec(html)[1] });
  const allYearTitles = new Set();
  for (const p of M.pages) for (const L of LANGS) allYearTitles.add(head(page(p.y, L)).title);
  let compared = 0;
  for (const run of HM.byRegion.get('world')) for (const L of LANGS) {
    const wh = HO[H.pagePath(run, L) + 'index.html'];
    const w = head(wh);
    assert.ok(!allYearTitles.has(w.title), 'the world page ' + H.pagePath(run, L) + ' has a year page\'s title: ' + w.title);
    for (const y of run.years) {
      if (!byYear.has(y)) continue;
      const yh = page(y, L), Y = head(yh);
      assert.notEqual(Y.title, w.title); assert.notEqual(Y.h1, w.h1); assert.notEqual(Y.desc, w.desc);
      assert.ok(wh.includes('data-year-page="' + H.slugOf(y) + '"'), H.pagePath(run, L) + ' does not link the year page ' + y);
      assert.ok(yh.includes('data-history-run="' + H.slugOf(run.first) + '"'), y + ' does not link the world page');
      compared++;
    }
  }
  assert.ok(compared >= 10, 'compared ' + compared);
  /* titles are unique among the year pages themselves */
  assert.equal(allYearTitles.size, M.pages.length * LANGS.length);
});
