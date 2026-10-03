/* ============================================================================
 *  landing-showcase — the landing / teacher pages and the example maps, held to what owns them
 * ----------------------------------------------------------------------------
 *  The pages are generated (scripts/landing.mjs) from words (scripts/landing-text.mjs), examples
 *  (js/showcase.js) and facts read from the files that own them. What is asserted here is that each
 *  of those joins still holds, offline:
 *    ① the generated files are what the generator writes, and every captured link says what its
 *      example declares (and nothing more) — and that check really fails when a link drifts;
 *    ② en and jp say the same things: the same keys, nothing empty, every placeholder known;
 *    ③ the facts the pages state are the files' own (the clock's floor IS the first era snapshot);
 *    ④ every asset a page names is copied into dist/ (vite.config.js STATIC_ASSETS), every page and
 *      the sitemap agree, and the Search Console file is still served;
 *    ⑤ the ways in: Settings ▸ About links the page in both languages, and Atlas lists every example.
 *  The browser half — every example opened and asked of the map — is tests/landing-showcase.spec.js.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TEXT } from '../scripts/landing-text.mjs';
import { facts, outputs, showcaseProblems, PAGES, pagePath, recordNamesFor } from '../scripts/landing.mjs';
import { SHOWCASE, CAPTURED, RECORD_ANSWERED } from '../js/showcase.js';
import { STATIC_ASSETS, STATIC_EXCLUDE } from '../vite.config.js';
import { HUB as HISTORY_HUB, SITEMAP_INDEX } from '../scripts/history-pages.mjs';
import { OTD_HUB } from '../scripts/on-this-day-pages.mjs';   /* (marketing-next) the «on this day» calendar, written into dist/ by the build like the history hub */
import { SITE_TOKEN, fillSiteToken, guardedHosts } from '../scripts/site-url.mjs';
import { SITE_URL } from '../supabase/functions/_shared/site-origin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const GENERATED = Object.keys(outputs());
const HTML = GENERATED.filter((p) => p.endsWith('.html'));

test('① the generated pages, sitemap and robots.txt are what scripts/landing.mjs writes, and every captured link matches its example', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/landing.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.deepEqual(showcaseProblems(), []);
});

test('① …and the link check is not vacuous: a drifted date, an undeclared parameter and a missing layer are each caught', () => {
  const s = SHOWCASE.find((x) => x.at != null && x.layers.length) || SHOWCASE.find((x) => x.at != null);
  const base = CAPTURED[s.id].hash;
  const variants = {
    date: base.replace(/tt=[^&]+/, 'tt=1999-01-01'),
    extra: base + '&s=eyJ3ZWF0aGVyRUMiOnsidCI6IjIwMjYifX0',
    layers: s.layers.length ? base.replace(/&l=[^&]+/, '') : base + '&l=dl-climate',
    camera: base.replace(/^#v=[^,]+/, '#v=0.0000'),
  };
  for (const [what, hash] of Object.entries(variants)) {
    const bad = showcaseProblems({ ...CAPTURED, [s.id]: { ...CAPTURED[s.id], hash } });
    assert.ok(bad.some((b) => b.startsWith(s.id + ':')), what + ' drift was not reported: ' + hash);
  }
});

test('② en and jp carry the same text: same keys, nothing empty, no unknown placeholder', () => {
  const shape = (o, p = '') => (typeof o === 'string' ? [p]
    : Array.isArray(o) ? o.flatMap((v, i) => shape(v, p + '[' + i + ']'))
      : Object.keys(o).sort().flatMap((k) => shape(o[k], p + '.' + k)));
  assert.deepEqual(shape(TEXT.jp), shape(TEXT.en));
  const known = new Set(['floorBC', 'snapshots', 'ohmFrom', 'ohmTo', 'csFrom', 'csTo', 'layers']);
  const walk = (o, p) => {
    if (typeof o === 'string') {
      assert.ok(o.trim(), p + ' is empty');
      for (const m of o.matchAll(/\{(\w+)\}/g)) assert.ok(known.has(m[1]), p + ' names an unknown fact {' + m[1] + '}');
      return;
    }
    for (const [k, v] of Object.entries(o)) walk(v, p + '.' + k);
  };
  walk(TEXT, 'TEXT');
  /* the examples: both languages written for every title, sentence and question */
  for (const s of SHOWCASE) for (const f of ['title', 'blurb', 'question']) {
    assert.equal(s[f].length, 2, s.id + '.' + f + ' is an LA(en, jp) tuple');
    assert.ok(s[f][0].trim() && s[f][1].trim(), s.id + '.' + f);
  }
});

test('③ the facts on the page are the app\'s: the clock reaches exactly as far back as the oldest era snapshot', () => {
  const F = facts();
  assert.equal(F.floor, F.firstSnap, 'js/hist-scale.js FLOOR is the first data/hist-eras.js snapshot');
  assert.equal(F.ohmTo + 1, F.csFrom, 'the OpenHistoricalMap band ends where the CShapes band begins');
  assert.ok(F.layers > 100 && F.snapshots > 10);
  const about = rd('about.html');
  assert.ok(about.includes(F.bcYears.toLocaleString('en-US') + ' BC'), 'about.html states the floor it read');
  assert.ok(rd('ja/about.html').includes('紀元前' + F.bcYears.toLocaleString('ja-JP') + '年'));
  /* the site address is the one index.html already publishes, and the donation links are the app's own */
  assert.ok(about.includes('<link rel="canonical" href="' + F.site + 'about.html">'));
  assert.ok(about.includes(F.stripe.en) && rd('ja/about.html').includes(F.stripe.jp));
});

test('④ every asset a generated page names is copied into dist/, and the sitemap names every page', () => {
  const copied = (rel) => {
    const n = normalize(rel).replace(/\\/g, '/');
    if (STATIC_EXCLUDE.some((x) => n === x || n.startsWith(x + '/'))) return false;
    return STATIC_ASSETS.some((a) => n === a || n.startsWith(a + '/')) || /^[^/]+\.png$/.test(n);
  };
  for (const page of HTML) {
    assert.ok(copied(page), page + ' is not in vite.config.js STATIC_ASSETS');
    const html = rd(page);
    const dir = dirname(page) === '.' ? '' : dirname(page) + '/';
    /* the query is the app's to read (a tour's `?tour=…&step=…` — js/tours.js tourLink); the file is what must exist */
    for (const m of html.matchAll(/\s(?:href|src)="([^"#?]+)(?:\?[^"#]*)?(?:#[^"]*)?"/g)) {
      const ref = m[1];
      if (/^(https?:)?\/\//.test(ref) || ref.startsWith('mailto:') || ref.startsWith(SITE_TOKEN)) continue;   /* absolute: the build fills the token (⑥) */
      const rel = normalize(dir + ref).replace(/\\/g, '/');
      /* the historical-map entry pages are written into dist/ by the build (historyPagesPlugin), not into the tree: the hub is the one door */
      if (rel === HISTORY_HUB || rel === 'ja/' + HISTORY_HUB) continue;
      if (rel === OTD_HUB || rel === 'ja/' + OTD_HUB) continue;
      assert.ok(existsSync(join(ROOT, rel)), page + ' names ' + ref + ', which does not exist');
      if (rel !== 'index.html') assert.ok(copied(rel), page + ' names ' + rel + ', which the build does not copy');
    }
  }
  const sitemap = rd('sitemap.xml');
  const site = facts().site;
  for (const page of PAGES) for (const dir of ['', 'ja/']) assert.ok(sitemap.includes('<loc>' + site + dir + page + '.html</loc>'), page);
  /* one share page per example and language, each a complete card: og + twitter, the 1200×630 picture, a self canonical, and the way on to the map */
  for (const s of SHOWCASE) for (const dir of ['', 'ja/']) {
    const rel = dir + 's/' + s.id + '.html';
    assert.ok(sitemap.includes('<loc>' + site + rel + '</loc>'), rel + ' is in the sitemap');
    const h = rd(rel);
    assert.ok(h.includes('<link rel="canonical" href="' + site + rel + '">'), rel + ' canonical');
    assert.ok(h.includes('<meta property="og:image" content="' + site + CAPTURED[s.id].card + '">'), rel + ' og:image');
    assert.ok(h.includes('<meta property="og:image:width" content="1200">') && h.includes('<meta property="og:image:height" content="630">'), rel + ' card size');
    assert.ok(h.includes('<meta name="twitter:card" content="summary_large_image">'), rel + ' twitter card');
    assert.ok(h.includes('<meta property="og:title" content="') && h.includes('<meta property="og:description" content="'), rel + ' og text');
    const hash = CAPTURED[s.id].hash.replace(/&/g, '&amp;');
    assert.ok(h.includes('<meta http-equiv="refresh" content="0; url=') && h.includes('index.html' + hash + '"'), rel + ' refreshes to its map');
  }
  assert.ok(rd('robots.txt').includes('Sitemap: ' + site + SITEMAP_INDEX));   /* the index, which lists sitemap.xml and the history sitemap */
  assert.ok(existsSync(join(ROOT, 'google0266d9db8efbc48c.html')) && STATIC_ASSETS.includes('google0266d9db8efbc48c.html'), 'the Search Console verification file stays');
  for (const s of SHOWCASE) assert.ok(statSync(join(ROOT, CAPTURED[s.id].image)).size > 20000, s.id + ': the picture is a real screenshot');
  void pagePath;
});

test('⑤ the ways in: Settings links the page, its words exist in en and jp, and Atlas is told every example', async () => {
  const idx = rd('index.html');
  assert.match(idx, /<a id="link-about" href="\.\/about\.html"[^>]*data-i18n="viewAboutPage"/);
  for (const loc of ['js/locales/ui.en.js', 'js/locales/ui.jp.js']) {
    const t = rd(loc);
    assert.match(t, /lblAboutIntMap:"[^"]+"/, loc);
    assert.match(t, /viewAboutPage:"[^"]+"/, loc);
  }
  const caps = rd('js/atlas-capabilities.js');
  assert.ok(caps.includes('["panel.about","about"') && caps.includes('["panel.showcase","showcase"'), 'both capabilities are registry rows');
  /* the catalogue is built at run time; evaluate it and read what the planner is shown */
  globalThis.window = globalThis.window || globalThis;
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const text = makeAtlasCatalogText({ lang: 'en' }, {}).text(['panel.showcase']);
  for (const s of SHOWCASE) assert.ok(text.includes(s.id + ' — ' + s.title[0]), 'the planner is not told about ' + s.id);
});

test('⑥ the address: the generated files carry only the token, and the build fills it in every copied page', () => {
  /* the sources: no host spelled (scripts/site-url.mjs's rule), the token wherever an absolute address is needed */
  const hosts = guardedHosts();
  for (const rel of GENERATED) {
    const t = rd(rel);
    for (const h of hosts) assert.ok(!t.toLowerCase().includes(h), rel + ' spells the address ' + h + ' — it must carry the token');
    assert.ok(t.includes(SITE_TOKEN), rel + ' carries no token where an absolute address is needed');
  }
  assert.ok(rd('about.html').includes('<link rel="canonical" href="' + SITE_TOKEN + 'about.html">'));
  /* the build half, run on a copy of what vite.config.js copies: every .html/.xml/.txt comes out absolute */
  const dir = mkdtempSync(join(tmpdir(), 'im-site-token-'));
  try {
    for (const rel of GENERATED) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), rd(rel)); }
    mkdirSync(join(dir, 'data'), { recursive: true }); writeFileSync(join(dir, 'data', 'x.txt'), SITE_TOKEN);   /* a payload directory is not walked */
    const changed = fillSiteToken(dir, SITE_URL).sort();
    assert.deepEqual(changed, [...GENERATED].sort());
    for (const rel of GENERATED) {
      const t = readFileSync(join(dir, rel), 'utf8');
      assert.ok(!t.includes(SITE_TOKEN), rel + ' still holds the token after the build');
    }
    const about = readFileSync(join(dir, 'about.html'), 'utf8');
    assert.ok(about.includes('<link rel="canonical" href="' + SITE_URL + 'about.html">'));
    assert.ok(about.includes('<meta property="og:image" content="' + SITE_URL + CAPTURED['europe-1914'].image + '">'));
    assert.ok(readFileSync(join(dir, 'sitemap.xml'), 'utf8').includes('<loc>' + SITE_URL + 'ja/s/koppen.html</loc>'));
    assert.ok(readFileSync(join(dir, 'robots.txt'), 'utf8').includes('Sitemap: ' + SITE_URL + SITEMAP_INDEX));
    assert.equal(readFileSync(join(dir, 'data', 'x.txt'), 'utf8'), SITE_TOKEN);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('⑦ the examples the record answers for: every name its text claims is in force in the record on its date', () => {
  /* the browser half (tests/landing-showcase.spec.js) opens the rest; together they are every example */
  const offline = SHOWCASE.filter((s) => recordNamesFor(s));
  /* the declaration the browser spec reads is the record's answer (it never reads data/ itself) */
  assert.deepEqual(RECORD_ANSWERED, offline.map((s) => s.id));
  assert.ok(offline.length > 0 && offline.length < SHOWCASE.length, 'the split has both halves: ' + offline.map((s) => s.id));
  for (const s of offline) {
    const { names } = recordNamesFor(s);
    for (const n of s.drawn.labels) assert.ok(names.includes(n), s.id + ': the record holds «' + n + '» on ' + s.at);
  }
  /* …and it is not vacuous: a name the record does not hold on that date takes the example out of this half */
  const s = offline[0];
  assert.equal(recordNamesFor({ ...s, drawn: { labels: [...s.drawn.labels, 'Atlantis'] } }), null);
  assert.equal(recordNamesFor({ ...s, at: '1066-10-14' }), null, 'a year with no sheet of its own is the page’s rule, not this one');
});
