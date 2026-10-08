/* ============================================================================
 *  sales-schools — the two tours for the compulsory history course, held to the records and the unit map
 * ----------------------------------------------------------------------------
 *  The tours `opening-of-japan` (歴史総合 Ｂ（2）) and `cold-war-end` (歴史総合 Ｄ（3）) are ordinary declared tours,
 *  so tests/classroom-tours-checks.test.mjs already holds their links and asks the record for every name a step's
 *  `drawn` lists. What is asserted HERE is what those generic checks cannot see:
 *    ① the turning points the sentences rely on are EDGES of the record, on the right side of each step — a step
 *      moved a day across an edge fails (the convention of 1860 in OpenHistoricalMap; reunification, the split of
 *      Czechoslovakia and the fifteen successor states of the Soviet Union in CShapes 2.0);
 *    ② the unit map answers the units these tours were made for (they were «not covered yet»), each with a quoted
 *      basis, and the page shows the tour's own link;
 *    ③ every step's words exist in English and Japanese (CONSTITUTION.md §7).
 *  dev-notes/2026-10-08-sales-schools.md has the measurements and what was left out.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tourById, tourSteps, tourLink } from '../js/tours.js';
import { MODEL } from '../scripts/curriculum-kit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const bundle = (rel) => { const t = rd(rel); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };
const nm = (v) => (typeof v === 'string' ? v : (v && v.en) || '');
const ymd = (at) => at.split('-').map(Number);
const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
/** the names a record holds in force on `at` (the same reading as scripts/landing.mjs recordNamesFor) */
const namesOn = (b, at) => { const d = ymd(at); return b.feats.filter((f) => cmp([f[2], f[3], f[4]], d) <= 0 && cmp(d, [f[5], f[6], f[7]]) < 0).map((f) => nm(f[0])); };
/** the rows of one polity in force on `at` */
const rowsOn = (b, name, at) => { const d = ymd(at); return b.feats.filter((f) => nm(f[0]) === name && cmp([f[2], f[3], f[4]], d) <= 0 && cmp(d, [f[5], f[6], f[7]]) < 0); };

const OPEN = tourById('opening-of-japan');
const COLD = tourById('cold-war-end');
const stepAt = (tour, id) => tour.steps.find((s) => s.id === id).at;

test('① the turning points the sentences rely on are edges of the record, on the right side of each step', () => {
  assert.ok(OPEN && COLD, 'both tours are declared');
  const ohm = bundle('data/hist-borders.js');
  /* Qing's outline changes on the day of the Convention of Peking with Russia (1860-11-14): one row before, another after */
  const before = rowsOn(ohm, 'Qing', '1860-11-13'), after = rowsOn(ohm, 'Qing', '1860-11-14');
  assert.equal(before.length, 1); assert.equal(after.length, 1);
  assert.notEqual(before[0], after[0], 'the record starts a new Qing row on 1860-11-14');
  assert.ok(cmp(ymd(stepAt(OPEN, 'east-asia-1853')), [1858, 5, 28]) < 0, 'the 1853 step is before Aigun (1858-05-28)');
  assert.ok(cmp(ymd(stepAt(OPEN, 'east-asia-1861')), [1860, 11, 14]) >= 0, 'the 1861 step is after the Convention of Peking');
  /* the shogunate ends on 1868-01-03 in the record: the 1876 step names the Empire, the earlier steps the shogunate */
  assert.ok(namesOn(ohm, stepAt(OPEN, 'east-asia-1861')).includes('Tokugawa Shogunate'));
  assert.ok(!namesOn(ohm, stepAt(OPEN, 'east-asia-1876')).includes('Tokugawa Shogunate'), 'no shogunate in 1876');

  const cs = bundle('data/cshapes.js');
  const on1985 = namesOn(cs, '1985-07-01'), on1991 = namesOn(cs, stepAt(COLD, 'europe-1991')), on1993 = namesOn(cs, stepAt(COLD, 'europe-1993'));
  assert.ok(on1985.includes('German Democratic Republic'), 'two German states in 1985');
  assert.ok(!on1991.includes('German Democratic Republic'), 'one German state on the 1991 step (the GDR ends 1990-10-02)');
  assert.ok(namesOn(cs, '1990-10-01').includes('German Democratic Republic'), 'negative: two days before reunification still has it (the row ends 1990-10-02, exclusive)');
  assert.ok(on1991.includes('Czechoslovakia') && on1991.includes('Russia (Soviet Union)') && on1991.includes('Yugoslavia'));
  /* «the day Czechoslovakia divided» — the record's own edge */
  assert.ok(namesOn(cs, '1992-12-30').includes('Czechoslovakia') && !on1993.includes('Czechoslovakia'));
  assert.ok(on1993.includes('Czech Republic') && on1993.includes('Slovakia'));
  /* «Russia and fourteen other states»: the successors in force on the step, none of them on the 1991 step */
  const successors = ['Estonia', 'Latvia', 'Lithuania', 'Belarus (Byelorussia)', 'Ukraine', 'Moldova', 'Georgia', 'Armenia',
    'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyz Republic', 'Tajikistan'];
  assert.equal(successors.length, 14);
  for (const s of successors) { assert.ok(on1993.includes(s), s + ' on 1993-01-01'); assert.ok(!on1991.includes(s), s + ' not yet on the 1991 step'); }
  const step = COLD.steps.find((s) => s.id === 'europe-1993');
  for (const s of successors) assert.ok(step.drawn.labels.includes(s), 'the step declares ' + s);
  /* the Baltic states were independent between the wars (the question points at the 1920 map) */
  for (const s of ['Estonia', 'Latvia', 'Lithuania']) assert.ok(namesOn(cs, '1920-07-01').includes(s), s + ' in 1920');
});

test('② the unit map answers the units these tours were made for, with a quoted basis and the tour\'s own link', () => {
  const units = MODEL.frameworks.flatMap((f) => f.subjects.flatMap((s) => s.units));
  const want = { 'rekishi-b2': 'opening-of-japan', 'sekaishi-d2': 'opening-of-japan', 'uk-his-world': 'opening-of-japan',
    'rekishi-d3': 'cold-war-end', 'sekaishi-e1': 'cold-war-end', 'uk-his-1901': 'cold-war-end' };
  for (const [key, id] of Object.entries(want)) {
    const u = units.find((x) => x.key === key);
    assert.ok(u, key + ' exists');
    assert.ok(u.covered, key + ' is covered');
    assert.ok(u.tours.some((t) => t.id === id), key + ' offers ' + id);
    assert.ok(typeof u.basis === 'string' && u.basis.length > 3, key + ' quotes the phrase it answers');
  }
  assert.deepEqual(MODEL.problems, []);
  const sogo = MODEL.frameworks.flatMap((f) => f.subjects).find((s) => s.id === 'rekishi-sogo');
  assert.ok(sogo.units.filter((u) => u.covered).length >= 5, 'the compulsory course has at least five covered units');
  for (const page of ['curriculum.html', 'ja/curriculum.html']) {
    const html = rd(page);
    for (const id of ['opening-of-japan', 'cold-war-end']) {
      const q = tourLink(id, 1).replace(/^\.\/index\.html/, '').replace(/&/g, '&amp;');
      assert.ok(html.includes(q), page + ' links ' + id + ' at its first step');
    }
  }
});

test('③ every step of the two tours speaks English and Japanese', () => {
  for (const tour of [OPEN, COLD]) {
    assert.equal(tourSteps(tour).length, tour.steps.length, tour.id + ': every step resolves');
    /* LA(en, jp) is the [en, jp] tuple (js/lang-registry.js pickArgs) */
    const both = (v) => Array.isArray(v) && v[0] && v[1] && /[぀-ヿ一-鿿]/.test(v[1]) && !/[぀-ヿ]/.test(v[0]);
    assert.ok(both(tour.title) && both(tour.blurb), tour.id + ' has en and jp');
    for (const s of tour.steps) {
      for (const k of ['say', 'ask']) assert.ok(both(s[k]), tour.id + '/' + (s.id || s.example) + ' ' + k);
      if (!s.example) assert.ok(both(s.title), tour.id + '/' + s.id + ' title');
    }
  }
});
