/* ============================================================================
 *  spacetime-positioning — IntMap names itself a space-time atlas, everywhere, from one place
 * ----------------------------------------------------------------------------
 *  ① the brand's words carry the new parts (category, tagline, trust) in both languages, with one shape
 *  ② every surface a stranger reads says what scripts/brand-text.mjs says — read from the files as shipped:
 *    the landing pages' eyebrow / headline / line of trust, the press room's copy blocks, README's opening,
 *    index.html's head, the manifest, the app's own document strings
 *  ③ the hero's clock: its frames are DERIVED (every shown example with a date and no layer, in date order),
 *    exactly the hero example is visible, every frame opens its own captured link, the controls start hidden
 *  ④ the clock's script, EVALUATED against a stand-in document: the slider and the year buttons show one frame
 *    and its caption; it is on the about pages only and admitted by the pages' own CSP hash
 *  ⑤ the three ways in open what their sentences say: «now» is the app's own encoding of the present with
 *    layers a link can carry, «past» is a captured example, «atlas» is the app
 *  ⑥ the new page words type no number (they are filled from the files that own them)
 *  ⑦ the product documents state the positioning (PRODUCT.md §1, DECISIONS.md)
 *  Nothing here copies a spelling of the brand: every expectation is read from the brand's own module.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const { BRAND } = await import('../scripts/brand-text.mjs');
const brand = await import('../scripts/brand.mjs');
const L = await import('../scripts/landing.mjs');
const { TEXT } = await import('../scripts/landing-text.mjs');
const { SHOWCASE, CAPTURED } = await import('../js/showcase.js');
const { sharedIds } = await import('../js/layer-manifest.js');
const MS = await import('../js/map-state.js');
const CSP = await import('../scripts/csp.mjs');
const { HUB: HISTORY_HUB } = await import('../scripts/history-pages.mjs');

const F = brand.brandFacts();
const W = { en: brand.words('en', F), jp: brand.words('jp', F) };
const PAGES = [['about.html', 'en'], ['ja/about.html', 'jp']];
const PRESS = [['press.html', 'en'], ['ja/press.html', 'jp']];

test('① the brand carries a category, a tagline and a line of trust, in both languages, with one shape', () => {
  const shape = (o) => (typeof o === 'string' ? 's' : Array.isArray(o) ? o.map(shape) : Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])));
  assert.deepEqual(shape(BRAND.jp), shape(BRAND.en), 'en and jp declare different keys or list lengths');
  for (const lang of ['en', 'jp']) for (const k of ['category', 'tagline', 'trust']) {
    assert.ok(String(BRAND[lang][k] || '').trim(), lang + ' has no ' + k);
  }
});

test('② every surface a stranger reads says what the brand says', async () => {
  for (const [rel, lang] of PAGES) {
    const html = read(rel);
    assert.ok(html.includes('<p class="lp-eyebrow">' + esc(W[lang].category) + '</p>'), rel + ' does not name the category');
    assert.ok(html.includes('<h1>' + esc(W[lang].tagline) + '</h1>'), rel + ' headline is not the tagline');
    assert.ok(html.includes('<p class="lp-trust">' + esc(W[lang].trust) + '</p>'), rel + ' does not carry the line of trust');
    assert.equal((html.match(/<h1>/g) || []).length, 1, rel + ' has one headline');
  }
  for (const [rel, lang] of PRESS) {
    const html = read(rel);
    for (const id of ['category', 'tagline', 'trust']) {
      assert.ok(html.includes('id="og-copy-' + id + '" class="og-copy-text">' + esc(W[lang][id]) + '</p>'), rel + ' does not offer the brand\'s ' + id + ' to copy');
    }
  }
  const readme = read('README.md');
  const block = readme.slice(readme.indexOf(brand.README_BEGIN), readme.indexOf(brand.README_END));
  for (const s of [W.en.tagline, W.en.positioning.is, W.en.trust]) assert.ok(block.includes(s), 'README.md\'s opening lacks «' + s.slice(0, 50) + '…»');
  const idx = read('index.html');
  assert.ok(idx.includes('<title>' + esc(W.en.title) + '</title>'), 'index.html title');
  assert.ok(idx.includes('<meta name="description" content="' + esc(W.en.description) + '">'), 'index.html description');
  assert.equal(JSON.parse(read('manifest.webmanifest')).description, W.en.description, 'manifest description');
  for (const [file, lang] of [['js/locales/ui.en.js', 'en'], ['js/locales/ui.jp.js', 'jp']]) {
    const t = read(file);
    assert.equal(/docTitle:"([^"]*)"/.exec(t)[1], W[lang].title, file + ' docTitle');
    assert.equal(/docDesc:"([^"]*)"/.exec(t)[1], W[lang].description, file + ' docDesc');
  }
  /* and the files on disk are what the generators would write now */
  const out = await brand.outputs(F);
  for (const [rel, body] of Object.entries(out)) assert.equal(read(rel), body.replace(/\r\n/g, '\n'), rel + ' — run node scripts/brand.mjs --write');
  const lo = L.outputs();
  for (const [rel] of PAGES) assert.equal(read(rel), lo[rel], rel + ' — run node scripts/landing.mjs --write');
});

/* the hero figure of a generated page, cut out */
const figure = (html) => html.slice(html.indexOf('<figure class="st-scrub"'), html.indexOf('</figure>') + '</figure>'.length);

test('③ the hero\'s clock: derived frames, one visible, each its own captured link, controls hidden until the script', () => {
  const dateKey = (at) => { const m = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(at); return +m[1] * 10000 + +m[2] * 100 + +m[3]; };
  const want = SHOWCASE.filter((s) => s.at != null && !s.layers.length).sort((a, b) => dateKey(a.at) - dateKey(b.at)).map((s) => s.id);
  assert.deepEqual(L.stripExamples().map((s) => s.id), want, 'the strip is not every dated border-only example in date order');
  assert.ok(want.length >= 2, 'a clock needs two dates');
  for (const [rel, lang] of PAGES) {
    const fig = figure(read(rel));
    const frames = [...fig.matchAll(/<a class="st-frame" href="([^"]+)" data-st-frame data-showcase-link="([^"]+)"( hidden)?>/g)];
    assert.deepEqual(frames.map((m) => m[2]), want, rel + ' frames');
    const shown = frames.filter((m) => !m[3]);
    assert.equal(shown.length, 1, rel + ' shows exactly one frame');
    for (const m of frames) assert.ok(m[1].endsWith('index.html' + esc(CAPTURED[m[2]].hash)), rel + ': ' + m[2] + ' does not open its captured link');
    const caps = [...fig.matchAll(/<p class="st-cap" data-st-cap( hidden)?>/g)];
    assert.equal(caps.length, frames.length, rel + ' has a caption per frame');
    assert.equal(caps.findIndex((m) => !m[1]), frames.findIndex((m) => !m[3]), rel + ': the visible caption is the visible frame\'s');
    assert.match(fig, /<div class="st-ctl" data-st-ctl hidden>/, rel + ': the controls must start hidden (they work only with the script)');
    const range = /<input class="st-range" type="range" min="0" max="(\d+)" step="1" value="(\d+)"/.exec(fig);
    assert.ok(range, rel + ' has the slider');
    assert.equal(+range[1], frames.length - 1, rel + ' slider range');
    assert.equal(+range[2], frames.findIndex((m) => !m[3]), rel + ' slider starts on the visible frame');
    const ticks = [...fig.matchAll(/<button type="button" class="st-tick" data-st-go[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    assert.deepEqual(ticks, L.stripExamples().map((s) => esc(L.yearLabel(s.at, lang))), rel + ' year buttons');
  }
});

/* a stand-in document just large enough for STRIP_SCRIPT: elements with `hidden`, attributes and listeners */
function standIn(n, at) {
  const el = (extra = {}) => ({ hidden: false, attrs: {}, on: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, f) { this.on[t] = f; }, textContent: '', ...extra });
  const frames = Array.from({ length: n }, (_, i) => el({ hidden: i !== at }));
  const caps = Array.from({ length: n }, (_, i) => el({ hidden: i !== at }));
  const go = Array.from({ length: n }, (_, i) => el({ textContent: 'Y' + i }));
  const range = el({ value: String(at) }), ctl = el({ hidden: true });
  const st = { querySelector: (q) => (q === '[data-st-range]' ? range : q === '[data-st-ctl]' ? ctl : null),
    querySelectorAll: (q) => (q === '[data-st-frame]' ? frames : q === '[data-st-cap]' ? caps : q === '[data-st-go]' ? go : []) };
  const document = { querySelectorAll: (q) => (q === '[data-st]' ? [st] : []) };
  return { document, frames, caps, go, range, ctl };
}

test('④ the clock\'s script works when evaluated, lives only on the about pages, and is admitted by their CSP', () => {
  const D = standIn(5, 3);
  new Function('document', L.STRIP_SCRIPT)(D.document);
  assert.equal(D.ctl.hidden, false, 'the script shows the controls');
  D.range.value = '1'; D.range.on.input();
  assert.deepEqual(D.frames.map((f) => f.hidden), [true, false, true, true, true], 'the slider shows its frame and hides the rest');
  assert.deepEqual(D.caps.map((f) => f.hidden), [true, false, true, true, true], 'and its caption');
  assert.equal(D.go[1].attrs['aria-current'], 'true');
  assert.equal(D.range.attrs['aria-valuetext'], 'Y1', 'the slider says which year it is on');
  D.go[4].on.click();
  assert.deepEqual(D.frames.map((f) => f.hidden), [true, true, true, true, false], 'a year button shows its frame');
  assert.equal(D.range.value, '4', 'and moves the slider with it');
  assert.equal(D.go[1].attrs['aria-current'], undefined, 'the previous year is no longer current');
  /* a page with no clock: nothing happens, nothing throws */
  new Function('document', L.STRIP_SCRIPT)({ querySelectorAll: () => [] });
  const out = L.outputs();
  for (const [rel, body] of Object.entries(out)) {
    if (!rel.endsWith('.html')) continue;
    const has = CSP.inlineScripts(body).some((x) => x.text === L.STRIP_SCRIPT);
    assert.equal(has, PAGES.some(([p]) => p === rel), rel + (has ? ' carries the clock script but has no clock' : ' has no clock script'));
    if (has) assert.ok(body.includes(CSP.scriptHash(L.STRIP_SCRIPT)), rel + ': the clock script is not admitted by the page\'s own CSP');
  }
});

test('⑤ the three ways in open what their sentences say', () => {
  assert.deepEqual(L.entranceProblems(), []);
  const shared = new Set(sharedIds());
  const nowHash = L.nowLink().slice('index.html'.length);
  const st = MS.decode(nowHash);
  assert.equal(st.time, null, 'the «now» link carries no date, so the map opens on the present');
  assert.deepEqual(st.layers, L.ENTRANCES.now.layers, 'the «now» link carries the declared layers');
  for (const id of st.layers) assert.ok(shared.has(id), id + ' is not a layer a link can carry');
  assert.equal(MS.encode(st), nowHash, 'the «now» link is the app\'s own encoding (it survives a decode and re-encode)');
  const past = SHOWCASE.find((s) => s.id === L.ENTRANCES.past.example);
  assert.ok(past && CAPTURED[past.id] && CAPTURED[past.id].hash, 'the «past» entrance is a shown, captured example');
  for (const [rel, lang] of PAGES) {
    const html = read(rel), up = rel.startsWith('ja/') ? '../' : './', dir = rel.startsWith('ja/') ? 'ja/' : '';
    const tile = (k) => (new RegExp('<div class="lp-tile lp-way" data-entrance="' + k + '">([\\s\\S]*?)</div>').exec(html) || [])[1] || '';
    const E = TEXT[lang].about.entrances;
    assert.ok(tile('now').includes('href="' + esc(up + L.nowLink()) + '"'), rel + ': the «now» button');
    assert.ok(tile('now').includes(esc(E.now.p)), rel + ': the «now» sentence');
    assert.ok(tile('past').includes('href="' + esc(up + 'index.html' + CAPTURED[past.id].hash) + '" data-showcase-link="' + past.id + '"'), rel + ': the «past» button');
    assert.ok(tile('past').includes('<p class="lp-way-ex">' + esc(past.title[lang === 'jp' ? 1 : 0]) + '</p>'), rel + ': the «past» tile names the example its button opens');
    assert.ok(tile('past').includes('href="' + up + dir + HISTORY_HUB + '"'), rel + ': the «past» tile reaches the history pages');
    assert.ok(tile('atlas').includes('href="' + up + 'index.html"'), rel + ': the «atlas» button opens the app');
    for (const k of ['now', 'past', 'atlas']) assert.match(tile(k), /<svg class="im-icon"/, rel + ': the ' + k + ' tile\'s mark is a line icon');
  }
});

test('⑥ the new page words type no number', () => {
  for (const lang of ['en', 'jp']) {
    const A = TEXT[lang].about;
    const strings = [];
    const walk = (v, where) => { if (typeof v === 'string') strings.push([where, v]); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where + '.' + k); };
    walk({ hero: A.hero, scrub: A.scrub, entrances: A.entrances }, lang + '.about');
    for (const [where, s] of strings) assert.ok(!/\d/.test(s.replace(/\{[^{}]*\}/g, '')), where + ' types a number: «' + s.slice(0, 80) + '»');
    assert.equal(A.hero.h1, undefined, lang + ': the headline is the brand\'s tagline, not a copy kept here');
  }
});

test('⑦ the product documents state the positioning', () => {
  const product = read('PRODUCT.md');
  const s1 = product.slice(product.indexOf('## 1. 何であるか'), product.indexOf('## 2. '));
  assert.ok(s1.includes(BRAND.jp.category) && s1.toLowerCase().includes(BRAND.en.category.toLowerCase()), 'PRODUCT.md §1 does not name the category');
  assert.ok(s1.includes('scripts/brand-text.mjs'), 'PRODUCT.md §1 does not name the wording\'s source');
  const decisions = read('DECISIONS.md');
  assert.ok(decisions.split('\n').some((l) => l.startsWith('## ') && l.includes(BRAND.jp.category)), 'DECISIONS.md has no entry for the positioning');
});
