/* ============================================================================
 *  curriculum-sales-kit — the unit map and the school handout hold to their registries and their sources   (node --test)
 * ----------------------------------------------------------------------------
 *  ① THE DATA AGREES WITH THE REGISTRIES (scripts/curriculum-kit.mjs problems() is empty), and the same is asked again of
 *    the PAGES, link by link, with the app's own readers: every map link decodes (js/map-state.js decode) to share-carried
 *    data layers of js/layer-manifest.js and no date — or is exactly an example's captured link; every tour link is
 *    js/tours.js tourLink; every challenge link reads back (questFromSearch) as a kind the engine has, seeded by its unit.
 *  ② EVERY UNIT NAMES ITS SOURCE: each upstream has an https address, the date it was read and the sha256 of the file read,
 *    and both pages print the address under every table that quotes it.
 *  ③ «MAKE A TOUR FOR THIS UNIT» IS THE EXISTING BUILDER'S ARGUMENT: the link reads back (tourFromSearch) as a written tour
 *    with `edit`, its `t` decodes (decodeCustomTour, the player's own) to exactly the unit's maps in order, it fits the
 *    server's measured request limit, and the player hands an `edit` tour to openBuilder({ load }).
 *  ④ TWO PLACES NAME THE SAME HEADINGS: js/showcase.js CURRICULUM (the example cards) and data/curriculum-units.json. Each
 *    CURRICULUM key is a unit or group here with the same words, and every example or tour that declares a heading is
 *    offered by a unit under it.
 *  ⑤ THE PAGES ARE HONEST ABOUT WHAT IS MISSING: a unit with nothing says «not covered yet» and no other unit does; the
 *    counts in the lede are the counts of the data; no stated map carries a date (historical claims are examples/tours).
 *  ⑥ THE HANDOUT says only what other pages own (the price, the schools page's facts, the security page's analytics
 *    sentence chosen by index.html's own switch) and is set up as one A4 page (its print is measured in the spec).
 *  ⑦ THE WAYS IN: the schools page and the teacher page (en, ja) link to the unit map, the schools page to the handout;
 *    the generated pages are declared to the merge driver (.gitattributes) and shipped (vite STATIC_ASSETS).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!globalThis.window) globalThis.window = globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const KIT = await import('../scripts/curriculum-kit.mjs');
const GEN = await import('../scripts/org-pages.mjs');
const LAND = await import('../scripts/landing.mjs');
const { TEXT, ORG_NAV } = await import('../scripts/org-pages-text.mjs');
const { SHOWCASE, CAPTURED, CURRICULUM } = await import('../js/showcase.js');
const tours = await import('../js/tours.js');
const { sharedIds } = await import('../js/layer-manifest.js');
const { decode, canonical } = await import('../js/map-state.js');
const { questFromSearch, QUEST_KIND_IDS } = await import('../js/quest-engine.js');
const { packText } = await import('../js/link-codec.js');

const OUT = GEN.outputs();
const PAGES = { en: OUT['curriculum.html'], jp: OUT['ja/curriculum.html'] };
const HANDOUT = { en: OUT['school-handout.html'], jp: OUT['ja/school-handout.html'] };
const units = () => KIT.MODEL.frameworks.flatMap((f) => f.subjects.flatMap((s) => s.units.map((u) => ({ f, s, u }))));
const unhtml = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/* the <tr> of one unit in a page */
const rowOf = (html, key) => { const m = new RegExp('<tr id="u-' + key + '"[\\s\\S]*?</tr>').exec(html); return m ? m[0] : null; };
const hrefs = (html, attr) => [...html.matchAll(new RegExp('<a [^>]*href="([^"]+)"[^>]*' + attr + '="([^"]*)"', 'g'))].map((m) => ({ href: unhtml(m[1]), val: m[2] }));

test('① the data agrees with the registries, and every link on the pages reads back through the app\'s own readers', () => {
  assert.deepEqual(KIT.problems(), [], 'scripts/curriculum-kit.mjs problems()');
  const shared = new Set(sharedIds());
  for (const [lang, html] of Object.entries(PAGES)) {
    const up = lang === 'en' ? './' : '../';
    for (const { u } of units()) {
      const row = rowOf(html, u.key); assert.ok(row, lang + ': no row for ' + u.key);
      const maps = hrefs(row, 'data-unit-map');
      assert.equal(maps.length, u.maps.length, lang + ' ' + u.key + ': one link per map');
      maps.forEach(({ href, val }, i) => {
        assert.ok(href.startsWith(up + 'index.html#v='), lang + ' ' + u.key + ': a map link opens the app with a state — ' + href);
        const hash = href.slice(href.indexOf('#'));
        if (val !== 'state') { assert.equal(hash, CAPTURED[val].hash, u.key + ': the example ' + val + ' is its captured link'); return; }
        const st = decode(hash);
        assert.ok(st.view, u.key + ': the link names a view');
        assert.equal(st.time, null, u.key + ': a stated map carries no date');
        for (const id of st.layers) assert.ok(shared.has(id), u.key + ': layer ' + id + ' is a share-carried data layer');
        assert.equal(canonical(hash), hash, u.key + ': the link is the codec\'s own writing');
        assert.equal(hash, u.maps[i].hash);
      });
      const tl = hrefs(row, 'data-unit-tour');
      assert.deepEqual(tl.map((x) => x.val), u.tours.map((t) => t.id), u.key + ': the tours offered');
      for (const { href, val } of tl) assert.equal(href, up + tours.tourLink(val, 1).replace(/^\.\//, ''), u.key + ': tour ' + val + ' is js/tours.js tourLink');
      const ql = hrefs(row, 'data-unit-quest');
      assert.equal(ql.length, u.quest ? 1 : 0);
      for (const { href } of ql) {
        const q = questFromSearch(href.slice(href.indexOf('?')));
        assert.ok(q && QUEST_KIND_IDS.includes(q.kind), u.key + ': the challenge link reads back');
        assert.equal(q.seed, u.key, u.key + ': the unit is the seed, so a class shares one set');
        assert.ok(KIT.QUEST_LENGTHS.includes(q.n), u.key + ': a length the quest panel offers');
      }
    }
  }
  /* the data never types a link: maps are examples or intents */
  const raw = JSON.parse(src(KIT.KIT_PATH));
  for (const f of raw.frameworks) for (const s of f.subjects) for (const u of s.units) for (const m of u.maps) {
    assert.ok(!('hash' in m) && !('href' in m) && !('url' in m), u.key + ': a map states an example or an intent, never a link');
  }
});

test('② every unit names its source: address, date read, the file\'s sha256 — printed under every table', () => {
  const ups = KIT.KIT.gov.upstreams;
  assert.ok(ups.length >= 4);
  for (const u of ups) {
    assert.match(u.url, /^https:\/\//, u.id);
    assert.match(u.retrievedAt, /^\d{4}-\d{2}-\d{2}$/, u.id);
    assert.match(u.sha256, /^[0-9a-f]{64}$/, u.id);
    assert.ok(u.licence && u.publisher && u.title, u.id + ': licence, publisher and title');
  }
  /* the bundle's own quality statement (js/data-governance.js reads it) is a measurement, and this is where it is measured */
  const q = KIT.KIT.gov.quality, all = units().map(({ u }) => u), seen = new Set();
  assert.equal(q.rows, all.length, 'gov.quality.rows is the number of units');
  assert.equal(q.missing, all.filter((u) => !u.label || !u.gloss).length, 'gov.quality.missing');
  assert.equal(q.outOfRange, KIT.problems().length, 'gov.quality.outOfRange is the registry disagreements');
  assert.equal(q.duplicates, all.filter((u) => (seen.has(u.key) ? true : (seen.add(u.key), false))).length, 'gov.quality.duplicates');
  const rows = src('js/reference-data.js');
  for (const u of ups) if (u.attribution === true) assert.ok(rows.includes("{n:'" + u.paidBy + "'"), u.id + ': the DATA_SOURCES row that pays its credit exists');
  const used = new Set(units().map(({ s }) => s.source));
  for (const id of used) {
    const u = ups.find((x) => x.id === id);
    for (const [lang, html] of Object.entries(PAGES)) assert.ok(html.includes('href="' + u.url.replace(/&/g, '&amp;') + '"'), lang + ': the page links to ' + id);
  }
  for (const [lang, html] of Object.entries(PAGES)) {
    const tables = (html.match(/class="lp-tablewrap cu-table"/g) || []).length;
    const sources = (html.match(/class="lp-note cu-source"/g) || []).length;
    assert.equal(sources, tables, lang + ': one source line under every table');
  }
});

test('③ «Make a tour for this unit» is a written tour of the unit\'s maps, opened in the existing builder', async () => {
  let made = 0;
  for (const [lang, html] of Object.entries(PAGES)) {
    for (const { u } of units()) {
      const row = rowOf(html, u.key);
      const mk = hrefs(row, 'data-unit-make');
      if (!u.maps.length) { assert.equal(mk.length, 0, u.key + ': nothing to start a tour from'); continue; }
      assert.equal(mk.length, 1, lang + ' ' + u.key + ': one «make» link');
      const href = mk[0].href, q = href.slice(href.indexOf('?'), href.indexOf('#'));
      const r = tours.tourFromSearch(q);
      assert.equal(r.id, tours.CUSTOM_TOUR_ID); assert.equal(r.edit, true, u.key + ': opened in the builder');
      const t = await tours.decodeCustomTour(r.t, canonical);
      assert.ok(t, u.key + ': the player can read the tour');
      assert.deepEqual(t.steps.map((s) => s.hash), u.maps.map((m) => m.hash), u.key + ': the steps are the unit\'s maps, in order');
      assert.equal(href.slice(href.indexOf('#')), u.maps[0].hash, u.key + ': the page opens on the first step');
      made++;
    }
  }
  assert.ok(made > 0);
  const worst = KIT.longestMakeRequest();
  assert.ok(worst.bytes < worst.limit, 'the longest «make» request (' + worst.key + ', ' + worst.bytes + ' B) fits the server\'s ' + worst.limit);
  /* the player hands an `edit` tour to the builder — the «Edit this tour» path, not a second editor */
  const player = src('js/tour-player.js');
  assert.match(player, /q\.edit && q\.id === CUSTOM_TOUR_ID[\s\S]{0,600}openBuilder\(\{ load: builderLoad\(tour\) \}\)/, 'bootFromUrl opens the builder with the tour');
  assert.match(player, /function editInBuilder\(\)[\s\S]{0,200}builderLoad\(playing\)/, '«Edit this tour» uses the same conversion');
  /* the plain letter: a generated link does not depend on the machine's zlib, and every reader takes it */
  assert.match(await packText('{"v":1}', { plain: true }), /^j/);
  assert.equal(tours.tourFromSearch('?tour=custom&t=jx&step=1').edit, undefined, 'a link without edit is played as before');
});

test('④ js/showcase.js CURRICULUM and the unit data name the same headings; every declared example and tour is offered under its heading', () => {
  const all = units();
  const groups = new Map(KIT.MODEL.frameworks.flatMap((f) => f.subjects.flatMap((s) => s.groups.map((g) => [g.key, g]))));
  const letter = (g) => g.label.replace(/[\s\u3000].*$/, '');
  const squash = (s) => s.replace(/[\s\u3000]/g, '');
  const under = (key) => all.filter(({ u }) => u.key === key || u.group === key).map(({ u }) => u);
  for (const [key, c] of Object.entries(CURRICULUM)) {
    const asUnit = all.find(({ u }) => u.key === key), asGroup = groups.get(key);
    assert.ok(asUnit || asGroup, 'CURRICULUM ' + key + ' is a unit or a group of the data');
    const words = asUnit ? letter(groups.get(asUnit.u.group)) + asUnit.u.label : asGroup.label;
    assert.equal(squash(c.item[1]), squash(words), key + ': the same words in both places');
    for (const s of SHOWCASE.filter((x) => (x.curriculum || []).includes(key))) {
      assert.ok(under(key).some((u) => u.maps.some((m) => m.kind === 'example' && m.id === s.id)), 'example ' + s.id + ' declares ' + key + ' and is offered by a unit under it');
    }
    for (const t of tours.TOURS.filter((x) => (x.curriculum || []).includes(key))) {
      assert.ok(under(key).some((u) => u.tours.some((x) => x.id === t.id)), 'tour ' + t.id + ' declares ' + key + ' and is offered by a unit under it');
    }
  }
});

test('⑤ the pages are honest about what is missing, and count what the data holds', () => {
  const c = KIT.MODEL.counts;
  assert.equal(c.units, c.covered + c.open);
  assert.equal(KIT.uncovered().length, c.open);
  for (const [lang, html] of Object.entries(PAGES)) {
    const word = TEXT.curriculum.notCovered[lang === 'en' ? 0 : 1];
    for (const { u } of units()) {
      const row = rowOf(html, u.key);
      assert.equal(row.includes(word), !u.covered, lang + ' ' + u.key + ': «' + word + '» exactly when nothing answers the unit');
      assert.equal(/data-uncovered=""/.test(row), !u.covered);
    }
    const n = (v) => v.toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP');
    for (const v of [c.units, c.covered, c.open]) assert.ok(html.includes(n(v)), lang + ': the count ' + v + ' is printed');
  }
  /* the historical units are answered only by records already checked against the record (examples, tours) */
  for (const { u } of units()) for (const m of u.maps) if (m.kind === 'state') assert.equal(decode(m.hash).time, null, u.key);
});

test('⑥ the handout says what other pages own, chosen as they choose it, and is set up for one A4 sheet', () => {
  const F = GEN.orgFacts();
  for (const [lang, html] of Object.entries(HANDOUT)) {
    const k = lang === 'en' ? 0 : 1;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    assert.ok(html.includes(esc(TEXT.common.price[k])), lang + ': the price is the common sentence');
    assert.ok(html.includes(esc(TEXT.schools.what[1][k])), lang + ': no student accounts, as the schools page says it');
    const analytics = F.security.analytics ? TEXT.security.analyticsOn : TEXT.security.analyticsOff;
    assert.ok(html.includes(esc(analytics[1][k])), lang + ': the analytics sentence the security page would choose');
    assert.ok(html.includes(F.security.stated.toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP')), lang + ': the number of stated hosts');
    assert.match(html, /href="\.\/contact\.html\?for=education&amp;about=classroom"/, lang + ': the enquiry form, preselected');
    assert.match(html, /data-org-page="school-handout"/);
    assert.match(html, /<button[^>]*data-print[^>]*hidden/, lang + ': the print button waits for the script');
  }
  const css = src('css/org-pages.css');
  assert.match(css, /@page handout\{\s*size:A4;/, 'the handout\'s paper is A4');
  assert.match(css, /body\[data-org-page="school-handout"\]\{\s*page:handout;/, 'the handout prints on the named page');
  assert.match(src('js/org-page.js'), /button\[data-print\][\s\S]{0,200}window\.print\(\)/, 'the print button opens the print dialog');
});

test('⑦ the ways in, the merge driver and the build', async () => {
  const L = LAND.outputs();
  for (const dir of ['', 'ja/']) {
    assert.match(OUT[dir + 'for-schools.html'], /href="\.\/curriculum\.html"/, dir + 'for-schools links to the unit map');
    assert.match(OUT[dir + 'for-schools.html'], /href="\.\/school-handout\.html"/, dir + 'for-schools links to the handout');
    assert.match(L[dir + 'teachers.html'], /<section class="lp-sec" id="curriculum">[\s\S]*?href="\.\/curriculum\.html"[\s\S]*?<\/section>/, dir + 'teachers.html: the curriculum section leads to the unit map');
  }
  for (const [page, , opt] of ORG_NAV) if (opt && opt.bar === false) {
    for (const dir of ['', 'ja/']) for (const other of GEN.PAGES) {
      assert.match(OUT[dir + other + '.html'], new RegExp('href="\\./' + page + '\\.html"'), dir + other + '.html reaches ' + page);
    }
  }
  const attrs = src('.gitattributes');
  for (const p of ['/curriculum.html', '/school-handout.html', 'ja/curriculum.html', 'ja/school-handout.html']) {
    assert.match(attrs, new RegExp('^' + p.replace(/[.]/g, '\\.') + '\\s+merge=intmap-generated intmap-merge=regen intmap-regen=scripts/org-pages\\.mjs,--write$', 'm'), p + ' is declared generated');
  }
  const { STATIC_ASSETS } = await import('../vite.config.js');
  for (const p of ['curriculum.html', 'school-handout.html']) assert.ok(STATIC_ASSETS.includes(p), p + ' is shipped');
  assert.ok(STATIC_ASSETS.includes('ja'), 'the ja/ twins travel with their directory');
});
