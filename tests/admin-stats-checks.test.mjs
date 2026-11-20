/* ============================================================================
 *  ADMINISTRATIVE-UNIT STATISTICS — js/admin-stats.js against data/admin-stats.json.gz
 * ----------------------------------------------------------------------------
 *  ① the REAL shipped file: Japan's prefectures are there with a dated, methoded population, and the
 *    figure joins to the SHIPPED first-level boundaries by ISO 3166-2 (the thing 「都道府県を人口で色分け」 needs)
 *  ② a year with no statement is REFUSED; a tolerance returns the gap by name; an undated statement
 *    is never given a year (synthetic units, so the rule is measured on cases the file may not hold)
 *  ③ a unit outside its OWN lifespan is refused for that year — the join is never made on the year alone
 *  ④ mixed methods / mixed years in one table are reported, not coloured over
 *  ⑤ every kind named in the module is in the file; the capability is registered
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { makeAdminStats, KIND_LABEL } from '../js/admin-stats.js';
import { makeAtlasAdmin1 } from '../js/atlas-admin1.js';

const gz = (p) => JSON.parse(gunzipSync(readFileSync(new URL('../' + p, import.meta.url))).toString('utf8'));
const REAL = gz('data/admin-stats.json.gz');
const real = makeAdminStats({ data: REAL });
const synth = (units, methods) => makeAdminStats({ data: { units: { 'iso3166-2': units }, methods: methods || { Q1: { en: 'census' }, Q2: { en: 'estimate' } }, source: 's', builtAt: 'x' } });

test('① the real file: every kind the module names is present, and Japan\'s prefectures carry a dated, methoded figure', async () => {
  for (const k of Object.keys(KIND_LABEL)) assert.ok(REAL.units[k] && Object.keys(REAL.units[k]).length > 100, k + ' is thin or missing');
  const t = await real.table({ kind: 'iso3166-2', prefix: 'JP-' });
  assert.ok(t.ok);
  assert.ok(t.rows.length >= 45, 'only ' + t.rows.length + ' Japanese prefectures have a dated figure');
  const tokyo = t.rows.find((r) => r.code === 'JP-13');
  assert.ok(tokyo && tokyo.value > 9e6 && tokyo.value < 2e7, 'Tokyo ' + (tokyo && tokyo.value));
  assert.ok(tokyo.time && /^\d{4}-\d\d-\d\d$/.test(tokyo.time), 'the figure has no date');
  assert.ok(t.rows.every((r) => r.time), 'a row without a date was coloured');
  const y2015 = await real.table({ kind: 'iso3166-2', prefix: 'JP-', year: 2015 });
  assert.ok(y2015.ok && y2015.rows.every((r) => r.year === 2015 && r.exact));
});

test('① the figure joins to the shipped boundaries by ISO 3166-2', async () => {
  const world = gz('data/admin1-world.json.gz');
  const adm = await makeAtlasAdmin1({ load: () => world }).load();
  const b = await real.boundaries(adm, { prefix: 'JP-' });
  assert.ok(b.ok && b.matched >= 45, 'matched ' + b.matched);
  const f = b.fc.features.find((x) => x.properties.code === 'JP-13');
  assert.ok(f && f.geometry && f.properties.population > 9e6 && f.properties.population_date, 'Tokyo feature');
  const us = await real.boundaries(adm, { prefix: 'US-' });
  assert.ok(us.matched >= 50, 'US matched ' + us.matched);
});

test('② no statement for the year is refused; tolerance names the gap; undated is never given a year', async () => {
  const s = synth({ 'XX-1': { q: 'Q9', s: [[null, 111, 'Q1'], ['2010-04-01', 1000, 'Q1'], ['2020-10-01', 1200, 'Q2']] } });
  const none = await s.valueAt('iso3166-2', 'XX-1', { year: 2015 });
  assert.equal(none.why, 'no-statement-for-year');
  assert.equal(none.detail.undated, 1);
  const tol = await s.valueAt('iso3166-2', 'XX-1', { year: 2013, toleranceYears: 5 });
  assert.ok(tol.ok && tol.value === 1000 && tol.exact === false && tol.gapYears === 3);
  const latest = await s.valueAt('iso3166-2', 'XX-1', {});
  assert.equal(latest.value, 1200, 'latest DATED statement');
  const onlyUndated = synth({ 'XX-2': { q: 'Q8', s: [[null, 5, null]] } });
  assert.equal((await onlyUndated.valueAt('iso3166-2', 'XX-2', {})).why, 'no-dated-statement');
});

test('③ a unit outside its own lifespan is refused for that year', async () => {
  const s = synth({
    'XX-3': { q: 'Q3', inc: '2005-01-01', s: [['2010-01-01', 10, 'Q1'], ['1990-01-01', 9, 'Q1']] },
    'XX-4': { q: 'Q4', dis: '1999-12-31', s: [['1990-01-01', 20, 'Q1'], ['2010-01-01', 21, 'Q1']] },
    'XX-5': { q: 'Q5', s: [['1990-01-01', 30, 'Q1']] },
  });
  assert.equal((await s.valueAt('iso3166-2', 'XX-3', { year: 1990, toleranceYears: 0 })).why, 'unit-not-yet-established');
  assert.equal((await s.valueAt('iso3166-2', 'XX-4', { year: 2010 })).why, 'unit-abolished');
  assert.ok((await s.valueAt('iso3166-2', 'XX-4', { year: 1990 })).ok);
  const unstated = s.definitionAt({ s: [] }, 1500);
  assert.ok(unstated.ok && unstated.lifespan === 'unstated', 'no stated lifespan is not "always"');
  assert.equal(s.definitionAt(null, 1990).why, 'unit-unknown');
});

test('④ mixed methods and mixed years in one ranking are reported', async () => {
  const s = synth({
    'XX-1': { q: 'Q1', s: [['2020-10-01', 100, 'Q1']] },
    'XX-2': { q: 'Q2', s: [['2021-07-01', 90, 'Q2']] },
  });
  const t = await s.table({ kind: 'iso3166-2' });
  assert.equal(t.mixedMethods, true);
  assert.equal(t.mixedYears, true);
  assert.deepEqual(t.rows.map((r) => r.code), ['XX-1', 'XX-2']);
  const one = await s.table({ kind: 'iso3166-2', year: 2020 });
  assert.equal(one.rows.length, 1);
  assert.equal(one.refused['no-statement-for-year'], 1, 'the unit with no 2020 figure is counted as absent, not zero');
});

test('⑤ the capability is declared, and the data has a governance record', () => {
  const cap = readFileSync(new URL('../js/atlas-capabilities.js', import.meta.url), 'utf8');
  assert.ok(cap.includes('"geo.regionStat","regionStat"'));
  const gov = readFileSync(new URL('../scripts/build-admin-stats.mjs', import.meta.url), 'utf8');
  assert.ok(/export const GOVERNANCE/.test(gov) && /WIKIDATA/.test(gov));
});
