/* ============================================================================
 *  Every figure a writer puts in the country table carries its publisher, on every path
 * ----------------------------------------------------------------------------
 *  Measured on production (build 1be2049, 2026-11-18): HDI printed «(2022 · UNDP)», but GDP, GDP per capita,
 *  population, life expectancy, internet use and military spending printed
 *  «(2025 · World Bank World Development Indicators (NY.GDP.MKTP.CD))». Two writers rebuilt the stamp from SOME of its
 *  fields: js/wb-indicators.js applyLatest copied { source, licence, url } out of the citation (the publisher was not
 *  among them), and js/time-countries.js set the present aside as [year, source] for the return to Now. Both now pass
 *  the stamp whole. These checks run the writers themselves — every World Bank series that fills a table field, and
 *  the set-aside-and-restore round trip — and ask what a reader gets back.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { setFigure, stampFigure, stampOf, figure } from '../js/country-figures.js';
import { WB_INDICATORS, applyLatest, wbCitation } from '../js/wb-indicators.js';

test('every World Bank series that fills a country field stamps the publisher, beside the full citation', () => {
  const series = WB_INDICATORS.filter((I) => I.stat);
  assert.ok(series.length >= 6, 'the catalogue names the series that fill the table');   /* gdp, gdppc, pop, milSpend, lifeExp, internet … */
  for (const I of series) {
    const table = { FRA: {} };
    applyLatest(table, I.stat, { FRA: { v: 42, y: 2025 } });
    const f = figure(table.FRA, I.stat);
    assert.ok(f, I.stat + ' written');
    assert.equal(f.publisher, wbCitation(I.code).publisher, I.stat + ': the publisher, not the citation');
    assert.equal(f.src, wbCitation(I.code).source, I.stat + ': the full citation stays for an answer');
    assert.equal(f.code, I.code, I.stat + ': the series code rides along');
    assert.equal(f.y, 2025);
  }
});

test('a stamp set aside and put back is the same stamp — year, publisher, citation', () => {
  const now = {};
  setFigure(now, 'gdp', 4213, 2023, { ...wbCitation('NY.GDP.MKTP.CD'), code: 'NY.GDP.MKTP.CD' });
  const before = figure(now, 'gdp');
  const kept = stampOf(now, 'gdp');
  stampFigure(now, 'gdp', 1913, 'Maddison Project');   /* the travel overwrites it */
  assert.equal(figure(now, 'gdp').publisher, 'Maddison Project');
  stampFigure(now, 'gdp', kept.y, kept.src);           /* the return to Now (js/time-countries.js restore) */
  assert.deepEqual(figure(now, 'gdp'), before);
  /* a plain name survives the same way, and a value never stamped has nothing to restore */
  setFigure(now, 'pop', 68e6, 2024, 'Natural Earth');
  const p = stampOf(now, 'pop'); stampFigure(now, 'pop', 1900, null); stampFigure(now, 'pop', p.y, p.src);
  assert.equal(figure(now, 'pop').publisher, 'Natural Earth');
  assert.equal(figure(now, 'pop').y, 2024);
  assert.equal(stampOf(now, 'hdi'), null);
});
