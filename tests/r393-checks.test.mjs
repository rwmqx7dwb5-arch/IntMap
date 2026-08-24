/* ============================================================================
 *  #R393 — a row that arrives AFTER the clock has travelled
 * ----------------------------------------------------------------------------
 *  #R380's production verification found the Countries tab at 1860 headed
 *  「1860 · real GDP (2011 int$)」 and reading:
 *
 *      1 🇸🇬 Singapore $501B · 2 Russian Empire $435B · 3 🇭🇰 Hong Kong $382B · 4 British Raj $300B
 *
 *  Singapore's $501B is its figure for TODAY. The mechanism is not the deep-time work at all: the
 *  country table loads in two passes (js/countries-ui.js — the 110 m file at boot, the 10 m file when
 *  the browser goes idle), #R375 made the second pass CREATE the 75 codes the first one does not carry,
 *  and that pass lands 3-15 s after boot — after a travelled year has been overlaid. Above the World
 *  Bank's 1960 floor the second overlay pass happens to repair it; below the floor there is no second
 *  pass, so the row stays present-day for ever. That is the whole of 1850-1959.
 *
 *  ⚠ THIS RUNS THE SHIPPED MODULE. js/time-countries.js is a real ES module, so the test imports it,
 *  hands it a stub window and a two-row table, travels, adds a row the way the upgrade pass does, and
 *  asks what the reader would see. Both halves of the fix are covered by behaviour: `reapply()` brings
 *  the late row into the year, and the INCREMENTAL base is what lets 「Now」 give it back.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeTimeCountries } from '../js/time-countries.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

/* the present-day table the boot pass builds, and the one row the idle pass adds later */
const PRESENT = {
  USA: { code: 'USA', nameEn: 'United States', gdp: 27000, gdppc: 81000, pop: 335e6, area: 9834000, density: 34, lifeExp: 79, tfr: 1.6, internet: 92, milSpend: 916, hdi: 0.93 },
  JPN: { code: 'JPN', nameEn: 'Japan', gdp: 4200, gdppc: 33800, pop: 124e6, area: 377975, density: 328, lifeExp: 84, tfr: 1.3, internet: 83, milSpend: 50, hdi: 0.92 },
};
const LATE_SGP = { code: 'SGP', nameEn: 'Singapore', gdp: 501, gdppc: 84700, pop: 5.9e6, area: 719, density: 8200, lifeExp: 83, tfr: 1.0, internet: 96, milSpend: 13, hdi: 0.95 };

/* Maddison, as far as this test needs it: a 1860 row for the USA, nothing at all for Singapore —
   which is the real shape (Maddison's SGP series does not reach 1860). */
const MAD = {
  ready: () => true, load: () => Promise.resolve({}), minYear: 1850, maxYear: 2018,
  has: (c, y) => (c === 'USA' || c === 'JPN') && y >= 1850,
  gdppc: (c, y) => (c === 'USA' && y === 1860 ? 3007 : null),
  popN: (c, y) => (c === 'USA' && y === 1860 ? 31.4e6 : null),
  gdpBil: (c, y) => (c === 'USA' && y === 1860 ? 94 : null),
};

function boot() {
  const countryStats = {};
  for (const k of Object.keys(PRESENT)) countryStats[k] = { ...PRESENT[k] };
  const subs = [];
  const win = {
    IntMapTime: {
      on: (f) => subs.push(f),
      when: () => new Date(Date.UTC(1860, 6, 1)),
      year: () => 1860, isLive: () => false, min: 1850,
    },
    IntMapMaddison: MAD,
    fetch: () => Promise.reject(new Error('offline')),
    document: { baseURI: 'https://example.invalid/' },
  };
  const prevWin = globalThis.window, prevFetch = globalThis.fetch, prevDoc = globalThis.document;
  globalThis.window = win;
  globalThis.fetch = win.fetch;
  globalThis.document = win.document;
  const HOST = { countryDataLoaded: true };
  const CTX = { countryStats, loadCountryData: () => Promise.resolve(), renderStats: () => {}, searchVal: () => '' };
  makeTimeCountries(HOST, CTX);
  const api = win.IntMapTimeCountries;
  const restoreGlobals = () => { globalThis.window = prevWin; globalThis.fetch = prevFetch; globalThis.document = prevDoc; };
  return { countryStats, subs, api, win, restoreGlobals };
}

const settle = async (ms) => { await new Promise((r) => setTimeout(r, ms)); };

/* ── ① the row that arrives late is brought into the year, and Now gives it back ──────────────── */
test('R393 ①: a country row created after the travel does not keep its present-day figures', async () => {
  const { countryStats, subs, api, restoreGlobals } = boot();
  try {
    assert.equal(subs.length, 1, 'the module no longer subscribes to the clock');
    /* travel to 1860 — below the World Bank floor, so there is exactly ONE overlay pass */
    subs[0]({ year: 1860, isLive: false, when: new Date(Date.UTC(1860, 6, 1)) });
    await settle(700);
    assert.equal(api.year(), 1860, 'the overlay did not run for 1860');
    assert.equal(countryStats.USA.gdp, 94, "the USA's 1860 GDP did not come from Maddison");
    assert.equal(countryStats.JPN.gdp, null, 'a country Maddison cannot answer for should read as no-data, not as today');

    /* …and NOW the idle pass adds Singapore, exactly the way js/countries-ui.js `upgrade` does */
    countryStats.SGP = { ...LATE_SGP };
    assert.equal(api.reapply(), true, 'reapply() refused while the clock was on 1860');
    assert.equal(countryStats.SGP.gdp, null, `Singapore is still carrying $${LATE_SGP.gdp}B — its figure for TODAY — under 1860`);
    assert.equal(countryStats.SGP.pop, null, "Singapore is still carrying today's population under 1860");

    /* …and going back to Now has to give the present day back — which only works if the snapshot
       was taken when the row appeared, not once and for all before it existed */
    api._restore();
    assert.equal(countryStats.SGP.gdp, LATE_SGP.gdp, 'returning to Now lost Singapore’s present-day GDP');
    assert.equal(countryStats.SGP.pop, LATE_SGP.pop, 'returning to Now lost Singapore’s present-day population');
    assert.equal(countryStats.USA.gdp, PRESENT.USA.gdp, 'returning to Now lost the USA’s present-day GDP');
  } finally { restoreGlobals(); }
});

/* ── ② reapply is a no-op while the clock is live — the normal session pays nothing ───────────── */
test('R393 ②: reapply() answers false when the clock is not travelling, and touches nothing', async () => {
  const { countryStats, subs, api, restoreGlobals } = boot();
  try {
    subs[0]({ year: 1860, isLive: false, when: new Date(Date.UTC(1860, 6, 1)) });
    await settle(700);
    api._restore();                       /* back to Now */
    countryStats.SGP = { ...LATE_SGP };
    assert.equal(api.reapply(), false, 'reapply() claimed to have re-overlaid while the clock was live');
    assert.equal(countryStats.SGP.gdp, LATE_SGP.gdp, 'reapply() changed a row while the clock was live');
  } finally { restoreGlobals(); }
});

/* ── ③ the caller that creates the rows is the one that asks ──────────────────────────────────── */
test('R393 ③: the idle upgrade pass asks the time engine to bring its new rows into the year', () => {
  const src = codeOnly(R('js/countries-ui.js'));
  const i = src.indexOf('const upgrade=');
  assert.ok(i > 0, 'the idle upgrade pass is gone or was renamed');
  const body = src.slice(i, src.indexOf('const go=', i));
  assert.ok(/added\+\+/.test(body), 'the upgrade no longer counts the rows it creates');
  assert.ok(/if\(added\)[\s\S]{0,220}IntMapTimeCountries[\s\S]{0,60}reapply\(\)/.test(body),
    'the upgrade creates rows without asking the time engine to bring them into the year on screen');
  /* and the engine really offers it (a call to a method that does not exist is a silent no-op) */
  assert.ok(/return \{ year:\(\)=>curYear[^}]*reapply/.test(codeOnly(R('js/time-countries.js'))),
    'js/time-countries.js no longer exports reapply');
});
