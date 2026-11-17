/* ============================================================================
 *  The short name a card prints beside a figure's year, and the full citation an answer cites
 * ----------------------------------------------------------------------------
 *  Measured on production (2026-11-18): the country card printed
 *  «GDP (2023 · World Bank (NY.GDP.MKTP.CD, current US$) — the 2023 values, bundled)» — the whole citation
 *  squeezed beside a label. A citation now carries `publisher` (the short name) beside `source` (the full line);
 *  js/country-figures.js keeps both, the card prints the first, an answer's source list the second.
 *  (The stamp's line breaks are measured in the rendered DOM: tests/companies-name-width.spec.js.)
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { setFigure, stampFigure, figure } from '../js/country-figures.js';
import { wbCitation } from '../js/wb-indicators.js';

test('a citation keeps its full source and gives its publisher; a bare name is both', () => {
  const row = {};
  setFigure(row, 'gdp', 4213, 2023, { source: 'World Bank (NY.GDP.MKTP.CD, current US$) — the 2023 values, bundled', publisher: 'World Bank' });
  assert.equal(figure(row, 'gdp').publisher, 'World Bank');
  assert.match(figure(row, 'gdp').src, /NY\.GDP\.MKTP\.CD/, 'the full citation is still there for an answer');
  stampFigure(row, 'gdp', 2024, 'Maddison Project');
  assert.equal(figure(row, 'gdp').publisher, 'Maddison Project');
  assert.equal(figure(row, 'gdp').src, 'Maddison Project');
  stampFigure(row, 'gdp', 2024, null);
  assert.equal(figure(row, 'gdp').publisher, null, 'no source stated, none printed');
});

test('every citation a writer stamps names its publisher, shorter than the citation', async () => {
  const wb = wbCitation('NY.GDP.MKTP.CD');
  assert.equal(wb.publisher, 'World Bank');
  const { IntMapTables } = await import('../js/tables.js').catch(() => ({}));
  if (!IntMapTables) return;   /* the table module needs a browser global in some builds; the spec reads the card instead */
  for (const [k, c] of Object.entries(IntMapTables.STAT_SOURCES)) {
    assert.ok(c.publisher, k + ' names its publisher');
    assert.ok(c.publisher.length < c.source.length || c.publisher === c.source, k + ': the publisher is the short name');
    assert.ok(c.source.toLowerCase().includes(c.publisher.split(/\s*\/\s*/)[0].toLowerCase()), k + ': the publisher is the one the citation names');
  }
});
