/* ============================================================================
 *  teachers-and-entrances — every page reaches every other, derived from the generators' own lists
 * ----------------------------------------------------------------------------
 *  ① THE TEACHER PAGE says how to make a tour of one's own, and says only what js/tour-builder.js does:
 *     the labels it quotes are the builder's own words in the language of the page.
 *  ② EVERY LANDING AND ORGANISATION PAGE LINKS TO EVERY OTHER, plus the history hub: the expected set is
 *     computed here from PAGES (landing), ORG_NAV (org-pages-text) and HUB (history-pages) — the same lists
 *     the generators read — so a page added to any of them must be linked, and nobody lists it by hand.
 *  ③ THE ABOUT PAGE reaches the history hub in each language; robots.txt names the index of both sitemaps,
 *     and that index lists the landing sitemap and the history one.
 *  ④ THE APP'S SETTINGS open the organisation pages and the support page, and the strings exist in en + jp.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputs as landingOutputs, PAGES as LANDING_PAGES } from '../scripts/landing.mjs';
import { outputs as orgOutputs, PAGES as ORG_PAGES } from '../scripts/org-pages.mjs';
import { ORG_NAV } from '../scripts/org-pages-text.mjs';
import { HUB, SITEMAP, SITEMAP_INDEX } from '../scripts/history-pages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const L = landingOutputs(), O = orgOutputs();
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
const LANGS = [{ dir: '', hub: './' + HUB }, { dir: 'ja/', hub: '../ja/' + HUB }];

test('① the teacher page has the build section and quotes the builder\'s own labels', () => {
  for (const [dir, lang] of [['', 'en'], ['ja/', 'jp']]) {
    const html = L[dir + 'teachers.html'];
    assert.match(html, /id="build"/, dir + 'teachers.html has no #build section');
    assert.ok(hrefs(html).includes('#build'), 'the hero has no way to the build section');
    // the labels the page quotes are the ones the builder shows
    const builder = src('js/tour-builder.js'), player = src('js/tour-player.js');
    const label = lang === 'en' ? ['Add this map as a step', 'Make your own tour', 'Edit this tour'] : ['いまの地図をステップに追加', '自分のツアーを作る', 'このツアーを編集'];
    for (const w of label) assert.ok(builder.includes(w) || player.includes(w), 'no such label in the app: ' + w);
    for (const w of label) assert.ok(html.includes(w), dir + 'teachers.html does not mention «' + w + '»');
  }
});

test('② every landing and organisation page links to every other page and the history hub', () => {
  const pages = [...LANDING_PAGES, ...ORG_PAGES];
  assert.equal(ORG_NAV.map((r) => r[0]).join(), ORG_PAGES.join(), 'org-pages PAGES is not ORG_NAV');
  for (const lang of LANGS) {
    for (const p of pages) {
      const html = (L[lang.dir + p + '.html'] || O[lang.dir + p + '.html']);
      assert.ok(html, 'page not generated: ' + lang.dir + p);
      const got = new Set(hrefs(html));
      for (const q of pages) if (q !== p) assert.ok(got.has('./' + q + '.html'), lang.dir + p + '.html does not link to ' + q + '.html');
      assert.ok(got.has(lang.hub), lang.dir + p + '.html does not link to the history hub ' + lang.hub);
    }
  }
});

test('③ about reaches the history hub; robots names the sitemap index; the index lists both sitemaps', () => {
  for (const lang of LANGS) assert.ok(hrefs(L[lang.dir + 'about.html']).includes(lang.hub), lang.dir + 'about.html has no history entrance in its body');
  const about = L['about.html'];
  assert.match(about, /id="uses"[\s\S]*?history\//, 'the about page\'s "uses" section has no history tile');
  assert.match(L['robots.txt'], new RegExp('\nSitemap: .*' + SITEMAP_INDEX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\n'));
  const idx = src('scripts/history-pages.mjs');
  assert.ok(idx.includes("'sitemap.xml'") && idx.includes(SITEMAP), 'the index no longer lists both sitemaps');
  assert.match(L['robots.txt'], /not read there/, 'the note that robots.txt is not read on a sub-path is gone — re-check the fact before removing it');
});

test('④ the app\'s settings open the organisation pages and support, with en + jp strings', () => {
  const idx = src('index.html');
  for (const [page, key] of [['for-newsrooms', 'viewForNewsrooms'], ['for-schools', 'viewForSchools'], ['for-research', 'viewForResearch'], ['support', 'viewSupportPage']]) {
    assert.ok(ORG_PAGES.includes(page), page + ' is not an organisation page');
    assert.match(idx, new RegExp('href="\\./' + page + '\\.html"[^>]*data-i18n="' + key + '"'), 'settings has no link to ' + page);
    for (const lang of ['en', 'jp']) assert.match(src('js/locales/ui.' + lang + '.js'), new RegExp('[ ,{]' + key + ':"'), 'ui.' + lang + '.js has no ' + key);
  }
  assert.match(idx, /data-i18n="lblOrgPages"/);
  assert.match(src('js/org-page.js'), /intmap_lp_lang/, 'the org pages\' language choice is gone');
});
