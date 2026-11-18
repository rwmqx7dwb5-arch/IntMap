/* ============================================================================
 *  hist-audit-fixes — three defects a technical audit of Chronos found, EVALUATED rather than read
 * ----------------------------------------------------------------------------
 *    ① a year 0–99 in a time.changes period was read as 1900+year (`Date.UTC(50, …)` is 1950), so «AD 50 → AD 100» was refused
 *    ② an end drawn with today's borders switched the whole polity diff off, so «1914 → now» compared nothing; today's country
 *       polygons are now rows of the same shape a border record has
 *    ③ an Atlas country highlight on a past year whose record holds no shape for the code painted TODAY's polygon
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../js/atlas-reasoning.js';
import { modernPolityRows } from '../js/year-book.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const now = Date.UTC(2026, 10, 19);

test('① a period inside years 0–99 is a period, and ends are ordered by the year as written', () => {
  assert.equal(R.changesPeriod({ from: 50, to: 100 }, -4000, now).ok, true);
  assert.equal(R.changesPeriod({ from: 50, to: 60 }, -4000, now).ok, true);
  assert.equal(R.changesPeriod({ from: 10, to: 99 }, -4000, now).ok, true);
  assert.equal(R.changesPeriod({ from: 99, to: 10 }, -4000, now).code, 'empty-period');
  assert.equal(R.changesPeriod({ from: -50, to: 50 }, -4000, now).ok, true);
  assert.equal(R.changesPeriod({ from: 1900, to: 1950 }, -4000, now).ok, true);
});

test('② today\'s polygons are rows a polity diff can compare, matched by English name', () => {
  const sq = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const fc = { features: [
    { properties: { __code: 'FRA' }, geometry: sq(0, 40, 5, 45) },
    { properties: { __code: 'FRA' }, geometry: sq(10, 40, 11, 41) },   /* a second part of the same country is one row */
    { properties: { __code: 'XXX' }, geometry: sq(0, 0, 1, 1) },       /* no English name → left out, never invented */
    { properties: {}, geometry: sq(0, 0, 1, 1) },                      /* no code → left out */
  ] };
  const names = { FRA: 'France' };
  const rows = modernPolityRows(fc, (c) => names[c] || c, (c) => names[c] || c);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].en, 'France');
  assert.equal(rows[0].parts, 2);
  assert.ok(rows[0].km2 > 0 && rows[0].bbox[2] === 11);
  /* the 1914 record drew a bigger France; the diff sees it, and sees a polity only the record has */
  const past = [{ en: 'France', name: 'France', km2: rows[0].km2 * 2, bbox: [0, 40, 11, 45] }, { en: 'Austria-Hungary', name: 'Austria-Hungary', km2: 600000, bbox: [10, 44, 25, 50] }];
  const d = R.diffPolities(past, rows, null);
  assert.deepEqual(d.gone.map((p) => p.en), ['Austria-Hungary']);
  assert.equal(d.reshaped[0].en, 'France');
  assert.ok(d.reshaped[0].rel < 0);
});

test('② time.changes asks for today\'s rows and says how the modern end is read', () => {
  const cap = fs.readFileSync(path.join(root, 'js', 'atlas-cap-time.js'), 'utf8');
  assert.match(cap, /readYear\(w0, deps, \{[^}]*modernRows: true/);
  assert.match(cap, /readYear\(w1, deps, \{[^}]*modernRows: true/);
  assert.doesNotMatch(cap, /!r0\.borders\.modern && !r1\.borders\.modern/);
  assert.match(cap, /matched to the other end by English name/);
});

test('③ a past-year highlight with no era shape for the code is refused before the modern polygon is consulted', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'atlas-console.js'), 'utf8');
  const i = src.indexOf('function highlight(codes)');
  assert.ok(i > 0);
  const body = src.slice(i, src.indexOf('GE().events.on(\'styledata\'', i));
  const guard = body.indexOf('if(_eraActive()) return;');
  const modern = body.indexOf('if(!valid.has(cs)) return;');
  assert.ok(guard > 0 && modern > guard, 'the era guard must come first');
  assert.ok(body.indexOf('const era=_eraGeomsFor(cs)') < guard, 'the era shape is still tried first');
});
