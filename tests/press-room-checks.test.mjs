/* ============================================================================
 *  press-room — the page a journalist or blogger lands on to write ABOUT IntMap
 * ----------------------------------------------------------------------------
 *  ① the page CARRIES the brand's descriptions — the same strings scripts/brand-text.mjs owns, not a copy of them —
 *    and each has a Copy button whose target exists
 *  ② its numbers are the owners' (layer manifest, clock floor, era snapshots, language registry), in each language
 *  ③ every file offered for download exists and the build copies it; every other relative link resolves (to a file, or to
 *    something the build itself writes: the feed, the updates page, the two hubs)
 *  ④ en / ja are a reciprocal hreflang pair, both in sitemap.xml
 *  ⑤ it is reachable: the navigation of every organisation page, every landing page's footer, and for-newsrooms
 *  ⑥ it names no person and no address: nothing new is written about anyone, the way to ask is the contact page
 *  Never a spec; the page is static HTML (CSP script-src 'self' alone) and its one script is js/org-page.js.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const brand = await mod('scripts/brand.mjs');
const org = await mod('scripts/org-pages.mjs');
const { ORG_NAV } = await mod('scripts/org-pages-text.mjs');
const LANGS = [['en', 'press.html', ''], ['jp', 'ja/press.html', 'ja/']];

test('① the descriptions on the page are the brand\'s, character for character, each with a Copy button that has a target', () => {
  const BF = brand.brandFacts();
  for (const [key, rel] of LANGS) {
    const html = rd(rel), B = brand.words(key, BF);
    for (const [id, text] of [['tagline', B.tagline], ['short', B.pitch.short], ['medium', B.pitch.medium], ['long', B.pitch.long]]) {
      assert.ok(html.includes('id="og-copy-' + id + '" class="og-copy-text">' + esc(text) + '</p>'), rel + ' carries the brand\'s «' + id + '» as written');
    }
    for (const p of B.proof) assert.ok(html.includes(esc(p)), rel + ' carries a proof point of the brand');
    const buttons = [...html.matchAll(/<button[^>]*\bdata-copy="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(buttons.length, 4, rel + ' has a Copy button for each description');
    for (const id of buttons) assert.ok(html.includes('id="' + id + '"'), rel + ': ' + id + ' exists');
    assert.ok(/data-msg-copied="[^"]+"/.test(html) && /data-msg-failed="[^"]+"/.test(html), rel + ' says copied / not copied in its own words');
    assert.ok(!/<script(?![^>]*(?:\bsrc=|application\/ld\+json))/.test(html), rel + ' has no inline script');
  }
  const js = rd('js/org-page.js');
  assert.ok(/function wireCopy\b/.test(js) && js.includes('wireCopy();') && js.includes("'button[data-copy]'"), 'js/org-page.js wires the Copy buttons');
});

test('② the numbers on the page are the owners\' — the layer manifest, the clock floor, the era snapshots, the language registry', async () => {
  const { dataLayers } = await mod('js/layer-manifest.js');
  const FLOOR = +/const FLOOR = (-?\d+);/.exec(rd('js/hist-scale.js'))[1];   /* the module needs a window; landing.mjs reads the same constant from the source */
  const { facts } = await mod('scripts/landing.mjs');
  const F = facts(), BF = brand.brandFacts();
  assert.equal(F.layers, dataLayers().length, 'the page\'s layer count is the manifest\'s');
  assert.equal(F.floor, FLOOR, 'the page\'s clock floor is hist-scale FLOOR');
  assert.equal(BF.langs, (await mod('js/lang-registry.js')).IntMapLang.codes().length, 'the language count is the registry\'s');
  for (const [key, rel, , num] of [['en', 'press.html', '', 'en-US'], ['jp', 'ja/press.html', 'ja/', 'ja-JP']]) {
    const html = rd(rel), W = brand.factWords(BF, key);
    for (const v of [W.floorBC, W.snapshots, W.layers, W.langs]) assert.ok(html.includes('<h3>' + esc(v) + '</h3>'), rel + ' states ' + v);
    assert.equal(W.layers, dataLayers().length.toLocaleString(num));
    assert.equal(W.floorBC, key === 'jp' ? '紀元前' + F.bcYears.toLocaleString(num) + '年' : F.bcYears.toLocaleString(num) + ' BC');
  }
});

test('③ every download exists and is copied by the build; every other link resolves', async () => {
  const { STATIC_ASSETS, STATIC_EXCLUDE } = await mod('vite.config.js');
  const { pagePath: updatesPage, feedPath } = await mod('scripts/whats-new.mjs');
  const { HUB } = await mod('scripts/history-pages.mjs');
  const { OTD_HUB } = await mod('scripts/on-this-day-pages.mjs');
  const shipped = (rel) => !STATIC_EXCLUDE.some((x) => rel === x || rel.startsWith(x + '/'))
    && (STATIC_ASSETS.some((a) => rel === a || rel.startsWith(a + '/')) || /^[^/]+\.png$/.test(rel));
  assert.ok(shipped('press.html'), 'press.html is copied (vite.config.js STATIC_ASSETS)');
  const Ls = [{ key: 'en', dir: '', up: './' }, { key: 'jp', dir: 'ja/', up: '../' }];
  for (const L of Ls) {
    const rel = L.dir + 'press.html', html = rd(rel);
    const buildWritten = new Set([updatesPage(L), feedPath(L), L.dir + HUB, L.dir + OTD_HUB]);
    const downloads = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*\bdownload\b/g)].map((m) => m[1]);
    assert.ok(downloads.length >= 4, rel + ' offers marks and screenshots');
    for (const ref of downloads) {
      const target = normalize(L.dir + ref).replace(/\\/g, '/');
      assert.ok(existsSync(join(ROOT, target)), rel + ' offers ' + ref + ', which does not exist');
      assert.ok(shipped(target), rel + ' offers ' + target + ', which the build does not copy');
    }
    assert.ok(downloads.some((r) => r.endsWith('IntMap.Icon.png')) && downloads.some((r) => /img\/showcase\//.test(r)), rel + ' offers the mark and a screenshot');
    for (const m of html.matchAll(/\s(?:href|src)="([^"#?]+)(?:\?[^"#]*)?(?:#[^"]*)?"/g)) {
      const ref = m[1];
      if (/^(https?:)?\/\//.test(ref) || ref.startsWith('__INTMAP_SITE_URL__') || ref.startsWith('mailto:')) continue;
      const target = normalize(L.dir + ref).replace(/\\/g, '/');
      if (buildWritten.has(target) || target === L.dir + 'index.html' || target === 'index.html') continue;   /* the app itself, built by Vite */
      assert.ok(existsSync(join(ROOT, target)), rel + ' names ' + ref + ', which does not exist');
      if (target.endsWith('.html')) assert.ok(shipped(target) || target.startsWith('ja/'), rel + ' links ' + target + ', which the build does not copy');
      else assert.ok(shipped(target), rel + ' names ' + target + ', which the build does not copy');
    }
    for (const must of [updatesPage(L), feedPath(L), L.dir + HUB, L.dir + OTD_HUB]) assert.ok(html.includes('href="' + L.up + must + '"'), rel + ' links ' + must);
  }
});

test('④ en and ja are a reciprocal hreflang pair, and both are in sitemap.xml', () => {
  const en = rd('press.html'), ja = rd('ja/press.html');
  for (const html of [en, ja]) {
    assert.match(html, /<link rel="alternate" hreflang="en" href="__INTMAP_SITE_URL__press\.html">/);
    assert.match(html, /<link rel="alternate" hreflang="ja" href="__INTMAP_SITE_URL__ja\/press\.html">/);
    assert.match(html, /<link rel="alternate" hreflang="x-default" href="__INTMAP_SITE_URL__press\.html">/);
  }
  assert.match(en, /<html lang="en">/); assert.match(ja, /<html lang="ja">/);
  assert.match(en, /<link rel="canonical" href="__INTMAP_SITE_URL__press\.html">/);
  assert.match(ja, /<link rel="canonical" href="__INTMAP_SITE_URL__ja\/press\.html">/);
  const sitemap = rd('sitemap.xml');
  for (const rel of ['press.html', 'ja/press.html']) assert.ok(sitemap.includes('<loc>__INTMAP_SITE_URL__' + rel + '</loc>'), rel + ' is in sitemap.xml');
  /* the sitemap lists every organisation page, derived from ORG_NAV (they were not listed before) */
  for (const [page] of ORG_NAV) for (const dir of ['', 'ja/']) assert.ok(sitemap.includes('<loc>__INTMAP_SITE_URL__' + dir + page + '.html</loc>'), page + ' is listed');
});

test('⑤ the press room is reachable from the navigation, the footers and for-newsrooms — and leads back', () => {
  assert.ok(ORG_NAV.some(([p]) => p === 'press'), 'ORG_NAV names press');
  assert.deepEqual(org.PAGES, ORG_NAV.map((r) => r[0]), 'the generator writes exactly ORG_NAV');
  for (const dir of ['', 'ja/']) {
    for (const [page] of ORG_NAV) if (page !== 'press') assert.ok(rd(dir + page + '.html').includes('href="./press.html"'), dir + page + ' links the press room');
    for (const page of ['about', 'teachers', 'news-map', 'embed-map', 'developers']) assert.ok(rd(dir + page + '.html').includes('href="./press.html"'), dir + page + ' footer links the press room');
    assert.ok(rd(dir + 'for-newsrooms.html').includes('id="press"'), dir + 'for-newsrooms has its press-room link');
    const html = rd(dir + 'press.html');
    assert.ok(html.includes('href="./for-newsrooms.html"') && html.includes('href="./contact.html"'), dir + 'press leads to for-newsrooms and to contact');
    assert.ok(html.includes('aria-current="page"'), dir + 'press marks itself in the navigation');
  }
});

test('⑥ it writes no address and no person: the way to ask is the contact page', () => {
  for (const rel of ['press.html', 'ja/press.html']) {
    const html = rd(rel);
    assert.ok(!/mailto:|[\w.+-]+@[\w-]+\.[\w.]+/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')), rel + ' contains no e-mail address');
  }
});
