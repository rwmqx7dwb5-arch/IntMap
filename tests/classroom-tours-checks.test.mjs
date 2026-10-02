/* ============================================================================
 *  classroom-tours — the tours (js/tours.js), held to what owns them, offline
 * ----------------------------------------------------------------------------
 *  A tour is a sequence of map states with words for the teacher and a question for the class.
 *  What is asserted here, without a browser:
 *    ① every step resolves to a link the APP made (an example's captured link, or a step captured by
 *      scripts/showcase-capture.mjs), the link says what the step declares and nothing more — and that
 *      check really fails when a link drifts, a capture is missing or a step names a withheld example;
 *    ② the address of a tour (`?tour=<id>&step=<n>` + the step's own link) reads back to the same tour and step;
 *    ③ THE SENTENCES' CLAIMS, ASKED OF THE RECORDS THE MAP DRAWS FROM: the polity names a step relies on are
 *      in force on its date, the first-level units it names are, and where it says the map draws NO
 *      division, no first-level unit is in force there (a claim of absence is a claim) — each with a
 *      negative: the same claim on a wrong date fails;
 *    ④ the teacher pages list every tour, with the link that starts it;
 *    ⑤ the ways in: `?tour=` and the Settings entry load the player (src/main.js), the entry's words exist
 *      in en and jp, Atlas has `panel.tour` and is told every tour;
 *    ⑥ a step that tells the class to switch a layer on names it the way the app labels it;
 *    ⑦ the player: what a link asks for is read from the link, and the classroom mode keeps exactly the
 *      boxes it names (the map, its credits, its legends, the app's notice).
 *  The browser half — a tour opened from its address, stepped with the keyboard and left with Esc — is in
 *  tests/landing-showcase.spec.js (no new spec: the suite's time may only go down, #R205).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOURS, CAPTURED_STEPS, resolveStep, tourById, tourSteps, tourCover, tourQuery, tourLink, tourFromSearch } from '../js/tours.js';
import { SHOWCASE, WITHHELD } from '../js/showcase.js';
import { tourProblems, recordNamesFor } from '../scripts/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

test('① every step is a link the app made, it says what the step declares, and the check is not vacuous', () => {
  assert.deepEqual(tourProblems(), []);
  assert.ok(TOURS.length >= 3, 'three tours at least');
  for (const tour of TOURS) {
    const steps = tourSteps(tour);
    assert.equal(steps.length, tour.steps.length, tour.id + ': every step resolves');
    for (const st of steps) assert.match(String(st.hash), /^#v=/, tour.id + '/' + st.key + ' has the app\'s link');
    assert.ok(tourCover(tour), tour.id + ' has a picture (an example step)');
  }
  const own = TOURS.flatMap((t) => t.steps).find((st) => !st.example && st.at != null);
  const base = CAPTURED_STEPS[own.id].hash;
  for (const [what, hash] of Object.entries({
    date: base.replace(/tt=[^&]+/, 'tt=1999-01-01'),
    extra: base + '&s=eyJ3ZWF0aGVyRUMiOnsidCI6IjIwMjYifX0',
    camera: base.replace(/^#v=[^,]+/, '#v=0.0000'),
    layers: base + '&l=dl-climate',
  })) {
    const bad = tourProblems({ ...CAPTURED_STEPS, [own.id]: { hash } });
    assert.ok(bad.some((b) => b.startsWith(own.id + ':')), what + ' drift was not reported: ' + hash);
  }
  const without = { ...CAPTURED_STEPS }; delete without[own.id];
  assert.ok(tourProblems(without).some((b) => b.includes('not captured')), 'a missing capture is reported');
  assert.ok(tourProblems({ ...CAPTURED_STEPS, 'no-such-step': { hash: '#v=0,0,1,0,0,f' } }).some((b) => b.startsWith('no-such-step:')), 'a stale capture is reported');
  /* a step that names an example nobody may be shown (withheld: it opens differently from its words) is refused */
  if (WITHHELD.length) {
    const t0 = TOURS[0]; const saved = t0.steps[0].example;
    try { t0.steps[0].example = WITHHELD[0].id; assert.ok(tourProblems().some((b) => b.includes('withheld')), 'a withheld example is refused'); }
    finally { t0.steps[0].example = saved; }
  }
  /* an example step IS the example: its link and date are the example's own, not a copy */
  const ex = TOURS.flatMap((t) => t.steps).find((st) => st.example);
  const r = resolveStep(ex), s = SHOWCASE.find((x) => x.id === ex.example);
  assert.equal(r.at, s.at); assert.deepEqual(r.layers, s.layers); assert.ok(r.hash && r.hash.length > 3);
});

test('② a tour\'s address reads back to the same tour and step, and opens on that step\'s own link', () => {
  for (const tour of TOURS) {
    const steps = tourSteps(tour);
    steps.forEach((st, i) => {
      const href = tourLink(tour.id, i + 1);
      assert.equal(href, './index.html' + tourQuery(tour.id, i + 1) + st.hash);
      const u = new URL(href, 'https://example.invalid/IntMap/');
      assert.deepEqual(tourFromSearch(u.search), { id: tour.id, step: i + 1 });
    });
    assert.equal(tourById(tour.id.toUpperCase()), tour, 'ids are case-insensitive');
  }
  assert.equal(tourFromSearch('?embed=1'), null);
  assert.deepEqual(tourFromSearch('?tour=meiji-japan&step=0'), { id: 'meiji-japan', step: 1 });
  assert.equal(tourLink('no-such-tour', 1), null);
});

/* ── the records the map draws its first-level units from, read the way js/time-admin1.js's tiers read them ── */
const bundle = (rel) => { const t = rd(rel); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };
const ADMIN = ['data/hist-admin1.js', 'data/hist-kuni.js', 'data/hist-admin-fill.js'].map((rel) => ({ rel, b: bundle(rel) }));
const ymd = (at) => { const m = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(at); return [+m[1], +m[2], +m[3]]; };
const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
/** the first-level rows in force at `at`: { names, centroid } (centroid = the mean of the outer rings' vertices) */
function adminAt(at) {
  const d = ymd(at); const out = [];
  for (const { b } of ADMIN) for (const f of b.feats) {
    if (!(f[1] <= 4)) continue;                                   /* levels 3–4: the first tier */
    if (!(cmp([f[2], f[3], f[4]], d) <= 0 && cmp(d, [f[5], f[6], f[7]]) < 0)) continue;
    let sx = 0, sy = 0, n = 0;
    for (const poly of f[8]) { const ring = b.rings[poly[0]]; if (!ring) continue; for (const p of ring) { sx += p[0]; sy += p[1]; n++; } }
    const names = [f[0]].concat(f[9] && typeof f[9] === 'object' ? Object.values(f[9]) : []).map(String);
    out.push({ names, centroid: n ? [sx / n, sy / n] : null });
  }
  return out;
}
const inBox = (c, b) => !!c && c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3];

test('③ what the sentences claim is what the records say on that date — names, units, and the absence of units', () => {
  let asked = 0;
  for (const tour of TOURS) for (const step of tour.steps) {
    if (step.example) continue;   /* an example's claims are asked by tests/landing-showcase-checks ⑦ and the spec */
    const who = tour.id + '/' + step.id, d = step.drawn || {};
    if (d.labels && d.labels.length) {
      const r = recordNamesFor(step);
      assert.ok(r, who + ': the polity names are answerable from the record on ' + step.at + ' (no layer, names only, an exact date)');
      for (const n of d.labels) assert.ok(r.names.includes(n), who + ': «' + n + '» is in force on ' + step.at);
      asked++;
    }
    if (d.admin && d.admin.length) {
      const held = adminAt(step.at).flatMap((x) => x.names);
      for (const n of d.admin) assert.ok(held.includes(n), who + ': the unit «' + n + '» is in force on ' + step.at);
      asked++;
    }
    if (d.noAdminIn) {
      const there = adminAt(step.at).filter((x) => inBox(x.centroid, d.noAdminIn)).map((x) => x.names[0]);
      assert.deepEqual(there, [], who + ': the sentence says no division is drawn there on ' + step.at);
      asked++;
    }
  }
  assert.ok(asked >= 3, 'the tours make claims and they were asked');
  /* not vacuous: the same claims on the wrong side of the institutions' dates fail —
     the provinces are gone after 廃藩置県 (1871-08-29), and from 1881 the prefectures fill the box */
  const kuni = TOURS.flatMap((t) => t.steps).find((s) => s.drawn && s.drawn.admin && s.drawn.admin.length);
  const after = adminAt('1872-07-01').flatMap((x) => x.names);
  assert.ok(kuni.drawn.admin.every((n) => !after.includes(n)), 'the provinces are not in force after the domains were abolished');
  const empty = TOURS.flatMap((t) => t.steps).find((s) => s.drawn && s.drawn.noAdminIn);
  assert.ok(adminAt('1900-07-01').some((x) => inBox(x.centroid, empty.drawn.noAdminIn)), 'in 1900 the same box holds prefectures');
  const named = TOURS.flatMap((t) => t.steps).find((s) => !s.example && s.drawn && s.drawn.labels && s.drawn.labels.length);
  assert.equal(recordNamesFor({ ...named, at: '1914-06-27' }), null, 'the states of 1918 are not all there in June 1914');
});

test('④ the teacher pages list every tour, with the link that starts it', () => {
  for (const [page, k] of [['teachers.html', 0], ['ja/teachers.html', 1]]) {
    const html = rd(page);
    assert.ok(html.includes('id="tours"'), page + ' has the tours section');
    const up = page.startsWith('ja/') ? '../' : './';
    for (const tour of TOURS) {
      const href = (up + tourLink(tour.id, 1).replace(/^\.\//, '')).replace(/&/g, '&amp;');
      assert.ok(html.includes('href="' + href + '" data-tour-link="' + tour.id + '"'), page + ' starts ' + tour.id + ' at its first step');
      assert.ok(html.includes(tour.title[k].replace(/&/g, '&amp;')), page + ' names ' + tour.id);
      for (const st of tourSteps(tour)) assert.ok(html.includes('<li>' + st.title[k] + '</li>'), page + ' lists ' + st.key);
    }
  }
});

test('⑤ the ways in: the address and the Settings entry load the player, the entry has its words, Atlas has the tours', async () => {
  const idx = rd('index.html');
  assert.match(idx, /<button type="button" id="btn-tours"[^>]*data-i18n="viewTours"/);
  for (const loc of ['js/locales/ui.en.js', 'js/locales/ui.jp.js']) assert.match(rd(loc), /viewTours:"[^"]+"/, loc);
  const main = rd('src/main.js');
  assert.match(main, /import\('\.\.\/js\/tour-player\.js'\)/, 'the player is a chunk of its own, fetched on demand');
  assert.match(main, /\[\?&\]tour=/, 'a page opened with ?tour= loads it');
  assert.match(main, /#btn-tours/, 'the Settings entry loads it');
  const caps = rd('js/atlas-capabilities.js');
  assert.ok(caps.includes('["panel.tour","tour"'), 'panel.tour is a registry row');
  globalThis.window = globalThis.window || globalThis;
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const text = makeAtlasCatalogText({ lang: 'en' }, {}).text(['panel.tour']);
  for (const tour of TOURS) assert.ok(text.includes(tour.id + ' — ' + tour.title[0]), 'the planner is not told about ' + tour.id);
  assert.ok(/addStep/.test(text), 'the planner is told how to build a tour from the conversation');
});

test('⑥ a step that asks the class to switch a layer on names it as the app labels it', () => {
  const en = rd('js/locales/ui.en.js'), jp = rd('js/locales/ui.jp.js'), rows = rd('js/wb-layers.js');
  let seen = 0;
  for (const st of TOURS.flatMap((t) => t.steps)) for (const [k, root, loc] of [[0, 'Layers', en], [1, 'レイヤー', jp]]) {
    const m = new RegExp(root + ' ▸ ([^▸]+?) ▸ (.+?[)）])').exec(st.ask[k]);
    if (!m) continue;
    seen++;
    assert.ok(new RegExp('lyrGrp\\w+:"' + m[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(loc), 'the shelf «' + m[1] + '» is the app\'s own label');
    assert.ok(rows.includes("'" + m[2].trim() + "'"), 'the layer «' + m[2] + '» is the app\'s own label (js/wb-layers.js)');
  }
  assert.ok(seen >= 2, 'the earthquake step is checked in both languages');
});

test('⑦ the player reads what a link asks for from the link, and the classroom mode keeps exactly what it names', async () => {
  const P = await import('../js/tour-player.js');
  assert.deepEqual(P.wantOf('#v=22.0000,48.5000,3.30,0,0,f&tt=1918-11-11'), { at: '1918-11-11', layers: [] });
  assert.deepEqual(P.wantOf('#v=1,2,3,0,0,f&l=eco-dl-plates,beta-dl-volc2'), { at: null, layers: ['eco-dl-plates', 'beta-dl-volc2'] });
  /* the boxes the keep-list names are the page's own (a renamed box would vanish from the classroom silently) */
  const idx = rd('index.html');
  for (const cls of ['operation-room', 'map-column', 'map-container']) assert.match(idx, new RegExp('class="[^"]*\\b' + cls + '\\b'), cls);
  assert.match(idx, /id="map-credit"/); assert.match(idx, /id="map"/);
  assert.ok(rd('js/notify.js').includes("el.id = 'ai-toast'"), 'the app\'s notice is #ai-toast');
  for (const keep of ['#im-tour', '#ai-toast', '#map-credit', '.data-legend', '.koppen-legend']) assert.ok(P.CLASSROOM_CSS.includes(keep), keep + ' is kept');
  const dl = rd('js/data-layers.js');
  assert.ok(dl.includes('data-legend') && dl.includes('koppen-legend'), 'the legend classes are js/data-layers.js\'s own');
});
