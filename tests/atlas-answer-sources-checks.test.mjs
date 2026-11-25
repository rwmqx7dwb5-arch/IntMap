/* ============================================================================
 *  IntMap · atlas-answer-sources — how an answer shows where it came from
 * ----------------------------------------------------------------------------
 *  ① 「(apnews.com)」 in the prose is a source chip; a run of them is one cluster; a link with words stays a link
 *  ② one page cited many times is one source in the list
 *  ③ the background map's credit is NOT a source of the answer: it is never counted, and is listed apart —
 *     while a source a tool actually read still is counted
 *  ④ what Atlas drew is a list of buttons the reader can go to
 *  ⑤ the headings are no longer larger than the sentence they introduce twice over
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeAtlasAnswerSources } from '../js/atlas-answer-sources.js';
import { makeAtlasMarkdown } from '../js/atlas-markdown.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
const core = () => makeAtlasAnswerSources({ lang: () => 'en', esc });
const md = makeAtlasMarkdown({ esc }).renderMarkdown;

test('① a host cited in brackets becomes a chip, not a blue link', () => {
  const html = md('The war goes on ([apnews.com](https://apnews.com/a1)). See [the report](https://example.org/r).');
  const out = core().chipSources(html);
  assert.match(out.html, /<span class="atl-scs"><a class="atl-sc" href="https:\/\/apnews\.com\/a1"/);
  assert.ok(!/\(<span class="atl-scs">/.test(out.html), 'the brackets around the chip are gone');
  assert.match(out.html, /<a href="https:\/\/example\.org\/r" class="atl-a"/, 'a link with words is still a link');
  assert.deepEqual(out.sources.map((s) => s.host), ['apnews.com']);
});

test('① several hosts in one pair of brackets are one cluster: two shown, the rest behind +N', () => {
  const html = md('x ([a.com](https://a.com/1), [b.com](https://b.com/1), [c.com](https://c.com/1), [d.com](https://d.com/1))');
  const out = core().chipSources(html);
  assert.equal((out.html.match(/class="atl-scs"/g) || []).length, 1);
  assert.equal((out.html.match(/class="atl-sc"/g) || []).length, 4);
  assert.equal((out.html.match(/ hidden>/g) || []).length, 2);
  assert.match(out.html, /atl-sc-more[^>]*>\+2</);
  assert.equal(out.sources.length, 4);
});

test('② a page cited twice is one source', () => {
  const out = core().chipSources(md('a ([x.com](https://x.com/p)) b ([x.com](https://x.com/p))'));
  assert.equal(out.sources.length, 1);
});

test('③ map background credits are not counted as sources; a read source is', () => {
  const c = core();
  const items = c.collect([{ ok: true, meta: { provenance: [{ kind: 'number', what: 'Population', source: 'GeoNames', values: [1234567] }] } }],
    { credits: ['Esri World Imagery', 'NASA GIBS', 'OpenStreetMap contributors', 'Vantor'] });
  assert.equal(items.filter((i) => i.kind === 'map').length, 4);
  const h = c.footerHtml(items, { id: 'a', web: [] });
  assert.match(h, /Sources of this answer · 1/);
  assert.ok(!/ · 5/.test(h));
  assert.match(h, /atl-srcs-mapcredit/);
  assert.ok(!/data-kind="map"/.test(h), 'no map credit is a row of the sources list');
  const onlyMap = c.footerHtml(c.collect([], { credits: ['Esri'] }), { id: 'b' });
  assert.match(onlyMap, /Map credits/);
  assert.ok(!/Sources of this answer ·/.test(onlyMap));
});

test('③ pages the prose cited are counted and listed once each', () => {
  const c = core();
  const h = c.footerHtml([], { id: 'c', web: [{ url: 'https://apnews.com/a1', host: 'apnews.com', title: 'War latest', date: '2026-11-25' }] });
  assert.match(h, /Sources of this answer · 1 — apnews\.com/);
  assert.match(h, /data-kind="web"/);
  assert.match(h, /Cite this answer/, 'the citation formats are kept (behind the menu)');
});

test('④ what Atlas drew is offered as buttons that go to it', () => {
  const c = core();
  const arts = c.artifacts([{ ok: true, exec: { shown: { names: ['Eurostar'] } }, drew: [{ kind: 'route', surfaces: ['nlq-route-1'] }, { kind: 'route', surfaces: ['nlq-route-1'] }] }]);
  assert.equal(arts.length, 1);
  const h = c.artifactsHtml(arts);
  assert.match(h, /data-atl-art="0"/);
  assert.match(h, /Eurostar/);
  assert.equal(c.artifactsHtml([]), '');
});

test('⑤ headings are in proportion to the sentence under them', () => {
  const css = readFileSync(new URL('../js/atlas-styles.js', import.meta.url), 'utf8');
  const size = (sel) => Number(new RegExp('\\.' + sel + '\\{font-size:([\\d.]+)em').exec(css)[1]);
  assert.ok(size('atl-h1') <= 1.4 && size('atl-h2') <= 1.25 && size('atl-h3') <= 1.15 && size('atl-hb') <= 1.1);
  assert.match(css, /\.atl-a\{color:inherit;/, 'prose links do not shout in the accent colour');
});

test('⑥ an artifact button never carries a raw capability id; the source card stands above a floating window', () => {
  const c = core();
  const arts = c.artifacts([{ ok: true, drew: [{ kind: 'map.compose', surfaces: ['s1'] }, { kind: 'map.compose', surfaces: ['s2'] }] }]);
  assert.deepEqual(arts.map((a) => a.label), ['Shape 1', 'Shape 2']);
  const src = readFileSync(new URL('../js/atlas-answer-sources.js', import.meta.url), 'utf8');
  assert.match(src, /\.atl-scard\{[^}]*z-index:var\(--z-toast\)/, 'above the front window (2650), as a toast is');
});
