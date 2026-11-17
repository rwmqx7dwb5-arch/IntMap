/* ============================================================================
 *  Countries · Companies — the facts the screens read, evaluated (not read as source)
 *  The rendered behaviour is tests/countries-companies.spec.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setFigure, stampFigure, figure, figureYear, toBase, FIGURE_UNITS } from '../js/country-figures.js';
import { tieEnded } from '../scripts/companies/wd.mjs';

test('a figure answers in its base unit, with the year and source its writer stated', () => {
  const row = { gdpPPP: 6840 };                       // Japan's GDP (PPP), held in $ billions
  stampFigure(row, 'gdpPPP', 2024, 'World Bank');
  const f = figure(row, 'gdpPPP');
  assert.equal(f.v, 6.84e12, 'billions become dollars — the comparison printed «$6.8k» from the held number');
  assert.equal(f.held, 6840);
  assert.equal(f.y, 2024);
  assert.equal(f.src, 'World Bank');
  assert.equal(toBase('gdp', 4213), 4.213e12);
  assert.equal(toBase('pop', 123), 123, 'a field held in its base unit is unchanged');
});

test('a refreshed value replaces the year with its own; an unstated year stays unstated', () => {
  const row = {};
  setFigure(row, 'gdp', 4213, 2023, 'World Bank');
  setFigure(row, 'gdp', 4027, 2024, 'World Bank');
  assert.equal(figureYear(row, 'gdp'), 2024, 'the card prints the year of the value it shows, not the first writer’s');
  row.tfr = 1.2;
  assert.equal(figureYear(row, 'tfr'), null, 'no writer stated a year — nothing is guessed');
  assert.equal(figure({ gdp: null }, 'gdp'), null);
  assert.equal(figure({ gdp: 'x' }, 'gdp'), null);
});

test('every money field the country table holds in billions is declared so', () => {
  /* the three fields every `fmtMoney` reader treats as billions — js/app-body.js fmtMoney */
  for (const k of ['gdp', 'gdpPPP', 'milSpend']) assert.equal(FIGURE_UNITS[k], 'usd_bn', k);
  for (const k of ['gdppc', 'gdppcPPP']) assert.equal(FIGURE_UNITS[k], 'usd', k);
});

test('the bundled country tables state their year and source once', async () => {
  const { IntMapTables } = await import('../js/tables.js').catch(() => ({}));
  if (!IntMapTables) return;   /* the table module needs a browser global in some builds; the spec reads the card instead */
  /* (integrate) one statement per table — js/tables.js STAT_SOURCES, stamped on every value by js/countries-ui.js.
     LIFE and INTERNET are not shipped: the World Bank series replace them, with each value's own year. */
  for (const f of ['gdp', 'hdi', 'dem', 'milSpend']) assert.ok(IntMapTables.STAT_SOURCES[f] && /^\d{4}$/.test(IntMapTables.STAT_SOURCES[f].year), f);
  /* GDP's year is measured: its rows equal the World Bank's 2023 current-US$ series */
  assert.equal(IntMapTables.STAT_SOURCES.gdp.year, '2023');
  assert.equal(IntMapTables.GDP.USA, 27361);
});

/* ── Wikidata: a relation that has ended is not a relation ───────────────── */
const st = (prop, id, end) => ({ rank: 'normal', mainsnak: { property: prop, datavalue: { value: { id } } },
  qualifiers: end ? { P582: [{ datavalue: { value: { time: end } } }] } : {} });
const ent = (claims) => ({ claims });

test('a site whose only tie to the company has an end time is not the company’s', () => {
  /* Sukha Balka (Q4399522) — Evraz (Q1382653) as parent 2007-01-01 … 2017-03-01 */
  const fac = ent({ P749: [st('P749', 'Q1382653', '+2017-03-01T00:00:00Z'), st('P749', 'Q12062892')] });
  assert.equal(tieEnded(fac, 'Q4399522', ent({}), 'Q1382653'), true);
  /* the new parent's tie has no end */
  assert.equal(tieEnded(fac, 'Q4399522', ent({}), 'Q12062892'), false);
});

test('one current statement keeps the tie, whatever ended beside it', () => {
  const fac = ent({ P127: [st('P127', 'QCO', '+2001-01-01T00:00:00Z'), st('P127', 'QCO')] });
  assert.equal(tieEnded(fac, 'QF', ent({}), 'QCO'), false);
  /* the company's own «owner of» counts as a tie too */
  const fac2 = ent({});
  assert.equal(tieEnded(fac2, 'QF', ent({ P1830: [st('P1830', 'QF')] }), 'QCO'), false);
  assert.equal(tieEnded(fac2, 'QF', ent({ P1830: [st('P1830', 'QF', '+2010-01-01T00:00:00Z')] }), 'QCO'), true);
});

test('a site reached through a subsidiary is kept unless every owner and operator it states has ended', () => {
  assert.equal(tieEnded(ent({ P127: [st('P127', 'QSUB')] }), 'QF', ent({}), 'QCO'), false);
  assert.equal(tieEnded(ent({ P127: [st('P127', 'QSUB', '+2015-01-01T00:00:00Z')] }), 'QF', ent({}), 'QCO'), true);
  assert.equal(tieEnded(ent({}), 'QF', ent({}), 'QCO'), false, 'a site that states no owner is not judged ended');
});

test('every shipped facility is in a country of today’s map', () => {
  /* «today's map» is discovered, not listed: the codes of the Natural Earth admin-0 file this site ships, read with the
     builder's own precedence (scripts/companies/geo.mjs countryIndex: ISO_A3, then ISO_A3_EH, then ADM0_A3) */
  const ne = JSON.parse(gunzipSync(readFileSync(new URL('../data/ne-countries/ne_10m_admin_0_countries.json.gz', import.meta.url))).toString('utf8'));
  const today = new Set();
  for (const ft of ne.features) { const p = ft.p || ft.properties || {}; let iso = p.ISO_A3;   /* js/ne-countries.js's packed form keeps the properties under `p` */
    if (!iso || iso === '-99') iso = p.ISO_A3_EH; if (!iso || iso === '-99') iso = p.ADM0_A3; if (iso && iso !== '-99') today.add(iso); }
  assert.ok(today.size > 200);
  const dir = new URL('../data/companies/profiles/', import.meta.url);
  const off = [];
  for (const f of readdirSync(dir)) {
    const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const x of p.facilities || []) if (x.cc && !today.has(x.cc)) off.push(f + ': ' + x.name + ' in ' + x.cc);
    for (const x of p.presence || []) if (x.cc && !today.has(x.cc)) off.push(f + ': presence in ' + x.cc);
  }
  assert.deepEqual(off, [], 'a site placed in a country that is not on today’s map (the atlas shipped «SUN» and «DDR»)');
});

/* ── SEC: the newest annual figure across a field's tags ──────────────────── */
test('a financial field takes the newest annual figure of all its tags, not the first tag that answers', async () => {
  const { newestAnnual } = await import('../scripts/companies/sec.mjs');
  /* NVIDIA: the first revenue tag stopped at FY2022, the next one carries FY2026 */
  const got = newestAnnual([
    { value: 26914e6, currency: 'USD', fiscalYear: 'FY2022', end: '2022-01-30' },
    { value: 215938e6, currency: 'USD', fiscalYear: 'FY2026', end: '2026-01-25' },
    null,
  ]);
  assert.equal(got.fiscalYear, 'FY2026');
  assert.equal(newestAnnual([null, null]), null);
});

test('the weekly refresh rebuilds first the profiles built before that fix whose SEC years disagree', async () => {
  const { plan, secYearsDisagree, SEC_NEWEST_ACROSS_TAGS_SINCE } = await import('../scripts/companies/refresh-plan.mjs');
  const sec = { name: 'SEC EDGAR company facts' };
  const mixed = { sources: [sec], scale: { revenue: { src: 0, fiscalYear: 'FY2022' }, netIncome: { src: 0, fiscalYear: 'FY2026' } } };
  assert.equal(secYearsDisagree(mixed), true);
  assert.equal(secYearsDisagree({ sources: [sec], scale: { revenue: { src: 0, fiscalYear: 'FY2026' } } }), false);
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const profiles = new Map([
    ['a', { generatedAt: '2026-01-01', osmPending: true, secYearsDisagree: false }],
    ['b', { generatedAt: '2026-08-23', osmPending: false, secYearsDisagree: true }],
    ['c', { generatedAt: SEC_NEWEST_ACROSS_TAGS_SINCE, osmPending: false, secYearsDisagree: true }],
  ]);
  const p = plan(rows, profiles, { batch: 3 });
  assert.equal(p.ids[0], 'b', 'built by the old rule and still disagreeing — first');
  assert.equal(p.picked.find((x) => x.id === 'c').why, 'oldest', 'rebuilt since the fix — the rule no longer picks it');
});
