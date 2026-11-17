/* ============================================================================
 *  A travelled year: every value on the country table carries the year (and source) of the record it came from
 * ----------------------------------------------------------------------------
 *  Measured on production (build d37d1a3, 2026-11-18): with Chronos at 2010, France's HDI became 0.880 (from 0.910)
 *  but the card still read «(2022 · UNDP)». js/time-countries.js replaced values by assignment and stamped only some of
 *  them — HDI not at all. It now writes every value with js/country-figures.js setFigure: the World Bank's through
 *  applyLatest (the writer of the latest values), Maddison's and UNDP's with their citations and the year of the row
 *  read; a country with no value for the year is cleared together with its stamp.
 *  This runs the module itself (the clock, Maddison and the network stubbed) and reads every field of every row.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from './helpers/import-module.mjs';
import { clockStub } from './helpers/clock-stub.mjs';
import { setFigure, figure } from '../js/country-figures.js';
import { IntMapTables } from '../js/tables.js';

/* UNDP's series as data/hdi-series.json holds it: a column per year, the last year carried forward */
const HDI = { years: [2000, 2010, 2022], hdi: { USA: [0.88, 0.91, 0.93], JPN: [0.86, 0.89, 0.92] } };
const FIELDS = ['gdp', 'gdppc', 'pop', 'density', 'lifeExp', 'internet', 'milSpend', 'tfr', 'hdi'];

async function boot() {
  const countryStats = {
    USA: { code: 'USA', gdp: 27000, gdppc: 81000, pop: 335e6, area: 9834000, density: 34, lifeExp: 79, tfr: 1.6, internet: 92, milSpend: 916, hdi: 0.93 },
    JPN: { code: 'JPN', gdp: 4200, gdppc: 33800, pop: 124e6, area: 377975, density: 328, lifeExp: 84, tfr: 1.3, internet: 83, milSpend: 50, hdi: 0.92 },
  };
  /* the present, stamped as the app stamps it */
  for (const s of Object.values(countryStats)) {
    for (const k of ['gdp', 'gdppc', 'pop', 'lifeExp', 'internet', 'milSpend', 'tfr']) setFigure(s, k, s[k], 2024, { source: 'World Bank World Development Indicators', publisher: 'World Bank' });
    setFigure(s, 'hdi', s.hdi, 2022, IntMapTables.STAT_SOURCES.hdi);
  }
  const subs = [];
  const win = {
    IntMapTime: clockStub({ on: (f) => subs.push(f), when: () => new Date(Date.UTC(2010, 6, 1)), year: () => 2010, isLive: () => false, min: 1850 }),
    /* Maddison reaches 2010 for the USA only */
    IntMapMaddison: { ready: () => true, load: () => Promise.resolve({}), minYear: 1850, maxYear: 2018,
      has: (c, y) => c === 'USA' && y >= 1850 && y <= 2018,
      gdppc: (c, y) => (c === 'USA' && y === 2010 ? 49000 : null), popN: (c, y) => (c === 'USA' && y === 2010 ? 309e6 : null),
      gdpBil: (c, y) => (c === 'USA' && y === 2010 ? 15100 : null) },
    /* the HDI series answers; the World Bank does not (offline) — so its fields have no value for the year */
    fetch: (u) => (/hdi-series/.test(String(u)) ? Promise.resolve({ ok: true, json: () => Promise.resolve(HDI) }) : Promise.reject(new Error('offline'))),
    document: { baseURI: 'https://example.invalid/' },
    dispatchEvent: () => true,
  };
  const prev = [globalThis.window, globalThis.fetch, globalThis.document];
  globalThis.window = win; globalThis.fetch = win.fetch; globalThis.document = win.document;
  const { makeTimeCountries } = await importModule('js/time-countries.js', { mocks: { 'js/chronos.js': { IntMapTime: win.IntMapTime } } });
  makeTimeCountries({ countryDataLoaded: true }, { countryStats, loadCountryData: () => Promise.resolve(), renderStats: () => {}, searchVal: () => '' });
  return { countryStats, subs, api: win.IntMapTimeCountries,
    restoreGlobals: () => { [globalThis.window, globalThis.fetch, globalThis.document] = prev; } };
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await settle(50); } return true; };

test('travelled to 2010 and to 2025: each value carries the year of its record; back at Now, the present stamps return', async () => {
  const { countryStats, subs, api, restoreGlobals } = await boot();
  try {
    const before = {};
    for (const iso of Object.keys(countryStats)) before[iso] = Object.fromEntries(FIELDS.map((k) => [k, figure(countryStats[iso], k)]));

    await api.hdiLoad();
    subs[0]({ year: 2010, isLive: false, when: new Date(Date.UTC(2010, 6, 1)) });
    assert.ok(await until(() => api.year() === 2010), 'the overlay ran');
    await settle(300);
    const usa = countryStats.USA, jpn = countryStats.JPN;
    /* THE INVARIANT, field by field: a value has a year exactly when it has a value, and no present stamp survives a changed value */
    for (const [iso, s] of Object.entries(countryStats)) for (const k of FIELDS) {
      const f = figure(s, k);
      if (f) {
        assert.ok(f.y != null && f.y <= 2010, `${iso}.${k} = ${f.v}: a value in 2010 states a year up to 2010, not ${f.y}`);
        const was = before[iso][k];
        if (was && was.v !== f.v) assert.notEqual(f.y, was.y, `${iso}.${k} changed (${was.v} → ${f.v}) but kept the present year ${was.y}`);
      }
    }
    /* the reported case and its kin */
    assert.deepEqual([usa.hdi, figure(usa, 'hdi').y, figure(usa, 'hdi').publisher], [0.91, 2010, 'UNDP'], 'HDI: the 2010 column, its year, UNDP');
    assert.deepEqual([figure(usa, 'gdp').y, figure(usa, 'gdp').publisher], [2010, 'Maddison Project'], 'GDP from Maddison, with its year');
    assert.equal(figure(usa, 'density').y, 2010, 'density carries its population\'s year');
    assert.equal(figure(jpn, 'gdp'), null, 'no record for Japan in 2010 here: no value, and no year without one');
    assert.equal(figure(jpn, 'lifeExp'), null, 'the World Bank did not answer: the present value is not shown under 2010');

    /* past UNDP's last column the series carries 2022 forward — the year printed is 2022, the column read */
    subs[0]({ year: 2025, isLive: false, when: new Date(Date.UTC(2025, 6, 1)) });
    assert.ok(await until(() => api.year() === 2025), 'the second overlay ran');
    await settle(300);
    assert.deepEqual([usa.hdi, figure(usa, 'hdi').y], [0.93, 2022], 'HDI carried forward states the year of its column');

    /* back to Now: every stamp is the one set aside */
    subs[0]({ year: 2026, isLive: true });
    assert.ok(await until(() => api.year() === null), 'the return to Now ran');
    for (const iso of Object.keys(countryStats)) for (const k of FIELDS) {
      assert.deepEqual(figure(countryStats[iso], k), before[iso][k], `${iso}.${k} back at Now`);
    }
  } finally { restoreGlobals(); }
});
