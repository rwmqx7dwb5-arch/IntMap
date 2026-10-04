/* ============================================================================
 *  country-pages — one entry page per country, opening the map on it (scripts/country-pages.mjs)
 * ----------------------------------------------------------------------------
 *  ① every code of the universe the public API serves (Natural Earth admin-0) has a page in both languages, and the
 *    hub lists every one of them in that language's own order — a missing page would need a reason, and there is none
 *  ② every map link is read back by the map's own decoder, and the view it opens CONTAINS the country's frame
 *    (js/country-extent.js homeExtent) in the frame the links are fitted for — including the countries whose frame
 *    crosses 180° (Russia, Fiji) and the population link carries a layer a link may carry
 *  ③ the licence: a section is shown only for an offered dataset, every value shown that requires credit has its
 *    credit on the same page, and a dataset that is withheld (here: not served) disappears from every page
 *  ④ the events: each one listed is inside the outline by point-in-polygon (never by name); 1945-08-06 is Japan's
 *  ⑤ the sitemap lists every page in both languages and the index joins it; every page carries reciprocal hreflang
 *  ⑥ every relative link resolves to something written or tracked; nothing executes; words key for key
 *  ⑦ the build writes them; the counter counts them as an entry; the API's country list links them
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const P = await import('../scripts/country-pages.mjs');
const { LANGS } = await import('../scripts/history-pages.mjs');
const { countryUniverse } = await import('../scripts/public-api.mjs');
const { decode } = await import('../js/map-state.js');
const { layerFor } = await import('../js/layer-manifest.js');
const M = P.model();
const out = P.outputs(M);
const byCode = new Map(M.countries.map((c) => [c.code, c]));
const page = (code, L) => out[P.countryPath(code, L) + 'index.html'];

test('① a page for every country of the universe, in both languages; the hub lists them in each language\'s order', () => {
  const U = countryUniverse();
  assert.equal(M.countries.length, U.size, 'the pages and the universe disagree in number');
  for (const code of U.keys()) for (const L of LANGS) assert.ok(page(code, L), code + ' has no ' + L.key + ' page');
  for (const L of LANGS) {
    const hub = out[P.hubPath(L) + 'index.html'];
    const listed = [...hub.matchAll(/href="[^"]*countries\/([a-z]{3})\/"/g)].map((m) => m[1].toUpperCase());
    assert.deepEqual(listed, P.ordered(M, L).map((c) => c.code), L.key + ' hub order');
    assert.equal(new Set(listed).size, U.size, L.key + ' hub lists every country once');
  }
  /* ja is ordered by Japanese names, not by the English ones */
  const ja = P.ordered(M, LANGS.find((l) => l.key === 'jp')).map((c) => c.code);
  const en = P.ordered(M, LANGS[0]).map((c) => c.code);
  assert.notDeepEqual(ja, en);
});

/* the frame the links are fitted for — js/on-this-day.js FRAME and TILE, read from the file that owns them */
const FT = /const FRAME = \{ width: (\d+), height: (\d+) \}, TILE = (\d+);/.exec(read('js/on-this-day.js'));
const FRAME = { w: +FT[1], h: +FT[2], tile: +FT[3] };
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
function contains(view, [w, s, e, n]) {
  const scale = FRAME.tile * Math.pow(2, view.zoom);
  const halfLon = FRAME.w * 360 / scale / 2, halfY = FRAME.h * 2 * Math.PI / scale / 2;
  /* the view's centre in the box's unwrapped longitudes (e may run past 180 for a frame across the antimeridian) */
  let c = view.lng; while (c < (w + e) / 2 - 180) c += 360; while (c > (w + e) / 2 + 180) c -= 360;
  const eps = 1e-4, cy = mercY(view.lat);
  return c - halfLon <= w + eps && c + halfLon >= e - eps && cy - halfY <= mercY(s) + 1e-6 && cy + halfY >= mercY(n) - 1e-6;
}

test('② every map link decodes, and its view contains the country\'s frame — across 180° too', () => {
  const pop = layerFor('dl-popgrid');
  assert.ok(pop && pop.share, 'the population layer is a layer a link may carry');
  for (const c of M.countries) {
    const html = page(c.code, LANGS[0]);
    const links = [...html.matchAll(/href="(?:\.\.\/)*index\.html(#[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    assert.equal(links.length, 2, c.code + ': the map and the population map');
    for (const h of links) {
      const st = decode(h);
      assert.ok(st.view && isFinite(st.view.zoom), c.code + ' decodes');
      assert.ok(contains(st.view, c.ext), c.code + ': the view ' + JSON.stringify(st.view) + ' does not contain ' + JSON.stringify(c.ext));
    }
    assert.deepEqual(decode(links[1]).layers, ['dl-popgrid']);
    if (c.code !== 'ATA') assert.ok(c.ext[2] - c.ext[0] < 360, c.code + ' framed as the whole planet');
  }
  /* the frames that cross the antimeridian are written as one interval past 180, not as «-180 to 180» */
  for (const code of ['RUS', 'FJI']) {
    const c = byCode.get(code);
    assert.ok(c.ext[2] > 180 && c.ext[0] < 180, code + ' frame ' + JSON.stringify(c.ext));
    assert.ok(c.ext[2] - c.ext[0] < 180, code + ' is not framed as a band around the world');
  }
  assert.ok(byCode.get('FJI').view.zoom > 5, 'Fiji opens close enough to see it');
});

test('③ the licence: only offered datasets, credit beside every value that needs it, and a withheld dataset vanishes', () => {
  const offered = new Set(M.api.catalog.datasets.map((d) => d.id));
  const withheld = M.api.catalog.withheld.map((w) => w.id);
  for (const c of M.countries) for (const L of LANGS) {
    const html = page(c.code, L);
    const shown = [...html.matchAll(/data-dataset="([^"]+)"/g)].map((m) => m[1]);
    for (const id of shown) assert.ok(offered.has(id), c.code + ' shows ' + id + ', which is not offered');
    for (const id of withheld) assert.ok(!shown.includes(id), c.code + ' shows withheld ' + id);
    for (const id of shown) {
      const d = M.byId.get(id);
      if (!d.terms.credit) continue;
      const credit = new RegExp('data-credit-for="' + id + '">[^<]*');
      const m = credit.exec(html);
      assert.ok(m, c.code + ' ' + L.key + ': ' + id + ' requires credit and the page gives none');
      for (const line of d.credit) assert.ok(m[0].includes(line.replace(/&/g, '&amp;')), c.code + ': ' + id + ' credit «' + line + '» missing');
    }
    const facts = /data-country-facts="([^"]+)"/.exec(html);
    if (facts) {
      assert.ok(offered.has(facts[1]));
      assert.ok(html.includes('data-credit-for="' + facts[1] + '"'), c.code + ': the facts are shown without their credit');
    }
  }
  /* Japan shows the card's four facts, under the card's labels */
  const jp = page('JPN', LANGS.find((l) => l.key === 'jp'));
  for (const label of ['首都', '面積', '通貨', '言語']) assert.ok(jp.includes('<th>' + label + '</th>'), label);
  assert.ok(jp.includes('377,930 km²'));
  /* withhold the facts' dataset (the build would, were its file not served): the facts and its tile leave every page */
  const M2 = P.model({ served: (rel) => rel !== 'data/country-facts.json' && existsSync(join(ROOT, rel)) });
  assert.ok(M2.api.catalog.withheld.some((w) => w.id === 'country-facts'));
  const out2 = P.outputs(M2);
  for (const [rel, html] of Object.entries(out2)) {
    if (!rel.endsWith('.html')) continue;
    assert.ok(!html.includes('data-country-facts='), rel + ' still shows the facts');
    assert.ok(!html.includes('data-dataset="country-facts"'), rel + ' still lists the withheld dataset');
  }
});

test('④ events are placed by point in polygon, never by name', async () => {
  const { gunzipSync } = await import('node:zlib');
  const NE = await import('../js/ne-countries.js');
  const fc = NE.decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, NE.neCountriesPath('10m')))).toString('utf8')));
  const U = countryUniverse();
  let n = 0;
  for (const c of M.countries) {
    const g = fc.features[U.get(c.code).feature].geometry;
    for (const { ev } of c.events) { n++; assert.ok(P.pointIn(g, ev.at), c.code + ' lists ' + ev.d + ' whose point is outside its outline'); }
  }
  assert.ok(n > 0);
  const jpn = byCode.get('JPN').events.map((x) => x.ev.d);
  assert.ok(jpn.includes('1945-08-06'), 'Hiroshima is inside Japan\'s outline');
  assert.ok(!byCode.get('USA').events.some((x) => x.ev.d === '1945-08-06'), 'and not inside the United States\'');
  /* one point, one country: outlines do not overlap, so no event is listed twice */
  const seen = new Map();
  for (const c of M.countries) for (const { ev } of c.events) {
    const k = ev.d + '|' + ev.at.join(',') + '|' + ev.name.en;
    assert.ok(!seen.has(k), k + ' listed by ' + seen.get(k) + ' and ' + c.code);
    seen.set(k, c.code);
  }
  /* a page never says the country existed then: the history section speaks of the region and its frame */
  for (const c of M.countries) for (const L of LANGS) assert.ok(!/data-region="world"/.test(page(c.code, L)), 'the whole-world frame says nothing about where ' + c.code + ' is');
});

test('⑤ the sitemap lists every page in both languages, the index joins it, and hreflang is reciprocal', () => {
  const sm = out[P.COUNTRY_SITEMAP];
  const locs = [...sm.matchAll(/<loc>__INTMAP_SITE_URL__([^<]*)<\/loc>/g)].map((m) => m[1]);
  const pages = Object.keys(out).filter((r) => r.endsWith('index.html')).map((r) => r.slice(0, -'index.html'.length));
  assert.deepEqual(locs.slice().sort(), pages.slice().sort());
  assert.match(read('scripts/history-pages.mjs'), /\[LANDING_SITEMAP, [^\]]*\bCOUNTRY_SITEMAP\b[^\]]*\]\.map\(/, 'the sitemap index does not list the country sitemap');
  for (const c of M.countries) for (const L of LANGS) {
    const html = page(c.code, L);
    for (const l of LANGS) assert.ok(html.includes(`<link rel="alternate" hreflang="${l.tag}" href="__INTMAP_SITE_URL__${P.countryPath(c.code, l)}">`), c.code + ' ' + L.key + ' → ' + l.tag);
    assert.ok(html.includes(`<link rel="canonical" href="__INTMAP_SITE_URL__${P.countryPath(c.code, L)}">`));
  }
});

test('⑥ links resolve, nothing executes, the words exist key for key', async () => {
  const tracked = (p) => existsSync(join(ROOT, p));
  const generated = /^(ja\/)?(history|on-this-day)\/|^api\/v1\//;
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
  /* the day pages linked are days the calendar writes */
  const OTD = await import('../scripts/on-this-day-pages.mjs');
  const days = new Set(OTD.model().days);
  for (const c of M.countries) for (const { md } of c.events) assert.ok(days.has(md), md);
  const { TEXT } = await import('../scripts/country-pages-text.mjs');
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, p + k + '.') : [p + k + (Array.isArray(v) ? '[' + v.length + ']' : '')])).sort();
  assert.deepEqual(keys(TEXT.jp), keys(TEXT.en));
});

test('⑦ the build writes them; the counter counts them as an entry; the API lists each page', async () => {
  assert.match(read('vite.config.js'), /publicApiPlugin\(\), [^\]]*countryPagesPlugin\(\)/, 'the plugin runs after the public API it links to');
  const S = await import('../supabase/functions/usage-count/shape.js');
  assert.ok(S.METRICS.entry.dim.values.includes('countries'));
  assert.equal(S.METRICS.entry.maxDims, S.METRICS.entry.dim.values.length, 'a closed metric\'s cap is its size');
  for (const L of LANGS) {
    assert.equal(S.SITE_PAGES.countries.test('/IntMap/' + P.countryPath('JPN', L)), true);
    assert.equal(S.SITE_PAGES.countries.test('/IntMap/' + P.hubPath(L)), true);
  }
  assert.equal(S.SITE_PAGES.countries.test('/IntMap/api/v1/countries/JPN.json'), false);
  const row = M.api.countries.countries.find((c) => c.code === 'JPN');
  assert.ok(row.page.en.endsWith(P.countryPath('JPN', LANGS[0])) && row.page.ja.endsWith(P.countryPath('JPN', LANGS[1])));
});
