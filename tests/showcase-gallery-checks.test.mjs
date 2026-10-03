/* ============================================================================
 *  showcase-gallery — the in-app gallery, the second eight examples and the two pages by use, offline
 * ----------------------------------------------------------------------------
 *  ① THE GALLERY IS DERIVED. Every example js/showcase.js shows is in js/showcase-gallery.js galleryItems exactly
 *    once, under its topic's heading, with its thumbnail (the card scaled to 480 × 252, a real file); every tour of
 *    js/tours.js is there with the thumbnail of its first example step. A topic with no heading is refused by
 *    scripts/landing.mjs (proved by handing it one).
 *  ② THE DOORS. The search field's empty state is asked for on the field's focus and on an emptied field (and the
 *    module is fetched then, not at boot — it is imported nowhere statically); Atlas has `panel.gallery` in the
 *    registry and in its entry, and `panel.showcase` opens an example through the gallery's own openShowcase.
 *  ③ THE PAGES BY USE. news-map / embed-map exist in both languages, about links both, both link back, and the
 *    code on embed-map is exactly what js/embed-mode.js writes for the hero example (embedUrl + iframeCode, the
 *    app's own frame title) — not a copy.
 *  The browser half — the strip under the field, the whole gallery, a card that opens its map, a tour card that
 *  starts the classroom mode, on a desktop and on a phone — was run as a spec on 2026-10-03 (2/2 green) and is
 *  not kept as a file of its own: a new spec is charged p75 and put the core tier 0.7 min over its ceiling
 *  (scripts/test-budget.mjs). It belongs inside an existing boot (tests/landing-showcase.spec.js) — see the dev-note.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOWCASE, CAPTURED, TOPICS } from '../js/showcase.js';
import { TOURS } from '../js/tours.js';
import { galleryItems } from '../js/showcase-gallery.js';
import { outputs, showcaseProblems, jpegSize, newsContext } from '../scripts/landing.mjs';
import { embedUrl, iframeCode } from '../js/embed-mode.js';
import { IntMapLang } from '../js/lang-registry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

test('① every shown example and every tour is in the gallery once, under its heading, with a real 480×252 thumbnail', () => {
  const g = galleryItems();
  const ex = g.sections.flatMap((s) => s.items);
  assert.deepEqual(ex.map((x) => x.id).sort(), SHOWCASE.map((s) => s.id).sort(), 'the gallery holds exactly the shown examples');
  for (const sec of g.sections) {
    assert.ok(TOPICS[sec.topic], sec.topic + ' has a heading');
    for (const it of sec.items) assert.equal(SHOWCASE.find((s) => s.id === it.id).topic, sec.topic, it.id + ' is under its own topic');
  }
  assert.deepEqual(g.tours.map((t) => t.id), TOURS.map((t) => t.id), 'every tour is in the gallery, in its declared order');
  for (const it of [...ex, ...g.tours]) {
    assert.ok(existsSync(join(ROOT, it.thumb)), it.thumb + ' exists');
    assert.deepEqual(jpegSize(it.thumb), { width: 480, height: 252 }, it.thumb + ' is 480×252');
  }
  /* a thumbnail no example names is a file nobody downloads */
  const named = new Set(Object.values(CAPTURED).map((c) => c.thumb).filter(Boolean));
  for (const f of readdirSync(join(ROOT, 'img/showcase')).filter((n) => n.endsWith('-thumb.jpg'))) assert.ok(named.has('img/showcase/' + f), f + ' is named by js/showcase.js');
});

test('① a topic without a heading is refused, so an example cannot fall out of the gallery by a spelling', () => {
  const s = SHOWCASE[0], was = s.topic;
  try { s.topic = 'no-such-topic'; assert.ok(showcaseProblems().some((p) => p.startsWith(s.id + ': topic «no-such-topic»'))); }
  finally { s.topic = was; }
  assert.deepEqual(showcaseProblems(), []);
});

test('① sixteen examples are shown, and every subject the gallery has a heading for has one', () => {
  assert.ok(SHOWCASE.length >= 16, 'at least sixteen examples are shown (' + SHOWCASE.length + ')');
  for (const topic of Object.keys(TOPICS)) assert.ok(SHOWCASE.some((s) => s.topic === topic), topic + ' has an example');
});

test('② the doors: the empty field asks for the strip, nothing imports the gallery at boot, and Atlas can open it', () => {
  const sg = rd('js/search-geocode.js');
  assert.match(sg, /addEventListener\('focusin'[\s\S]{0,200}ms-input[\s\S]{0,200}_galleryEmptyState/, 'focusing the empty field asks for the strip');
  assert.match(sg, /if\(!q\)\{ if\(suggest&&res\)\{[^}]*\}?[^\n]*_galleryEmptyState\(inp,res\)/, 'an emptied field on a phone shows the strip instead of closing the list');
  assert.match(sg, /closest\('\[data-im-gallery\]'\)/, 'a data-im-gallery control opens the gallery');
  /* fetched when reached for: no file imports it statically */
  const statics = [];
  for (const dir of ['js', 'src']) for (const n of readdirSync(join(ROOT, dir)).filter((x) => /\.m?js$/.test(x))) {
    if (/^\s*import\s[^;]*['"][./]+(?:js\/)?showcase-gallery\.js['"]/m.test(rd(dir + '/' + n))) statics.push(dir + '/' + n);
  }
  assert.deepEqual(statics, [], 'js/showcase-gallery.js is not on the boot path');
  const reg = rd('js/atlas-capabilities.js');
  assert.match(reg, /\["panel\.gallery","gallery",/, 'the registry has panel.gallery');
  const cap = rd('js/atlas-cap-panel.js');
  assert.match(cap, /row: \['panel\.gallery'/, 'the entry declares it');
  assert.match(cap, /openGallery\(/, 'and opens the gallery');
  assert.match(cap, /\(await import\('\.\/showcase-gallery\.js'\)\)\.openShowcase\(s\.id\)/, 'panel.showcase opens an example the gallery card’s way');
  assert.doesNotMatch(cap, /'panel\.showcase',[^\]]*\bgallery\b/, '«gallery» is the gallery’s spelling, not an alias of showcase');
});

test('③ the pages by use: both languages, linked from about and back, and the embed code is the Embed tab’s own', async () => {
  const out = outputs();
  for (const p of ['news-map.html', 'embed-map.html', 'ja/news-map.html', 'ja/embed-map.html']) assert.ok(out[p], p + ' is generated');
  for (const p of ['about.html', 'ja/about.html']) { assert.match(out[p], /href="\.\/news-map\.html"/); assert.match(out[p], /href="\.\/embed-map\.html"/); }
  assert.match(out['news-map.html'], /href="\.\/embed-map\.html"/, 'news-map links the embed page');
  for (const p of ['news-map.html', 'embed-map.html']) assert.match(out[p], /href="\.\/about\.html"/, p + ' links back to about');
  /* the news page's context maps are the general reader's Earth / people examples */
  for (const s of newsContext()) assert.match(out['news-map.html'], new RegExp('data-showcase="' + s.id + '"'));
  /* the embed code: js/embed-mode.js run on the hero example's captured link, with the app's frame title */
  await import('../js/locales/ui.en.js');
  const hero = CAPTURED['europe-1914'].hash;
  const code = iframeCode(embedUrl('https://intmap.invalid/index.html' + hero), 'medium', IntMapLang._ui.en.embedFrameTitle).split('https://intmap.invalid/').join('__INTMAP_SITE_URL__');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  assert.ok(out['embed-map.html'].includes(esc(code)), 'embed-map shows the code the Embed tab writes');
  assert.match(code, /\?embed=1#v=/, 'the code is the share link with the embed switch');
  /* and the sitemap names them */
  assert.match(out['sitemap.xml'], /news-map\.html/); assert.match(out['sitemap.xml'], /embed-map\.html/);
});
