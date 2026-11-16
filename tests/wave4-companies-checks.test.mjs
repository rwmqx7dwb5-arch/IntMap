/* (wave4-companies) COMPANIES BETWEEN COUNTRIES — the company atlas read by country pair.
   ① the pure reading over a hand-made footprint: both directions, shares, the world network, the filters;
   ② the same reading over the SHIPPED footprint + index, against an independent count of the same files;
   ③ the line between two countries is a great circle that stays continuous across the antimeridian;
   ④ the reader reaches it from the footprint card, the kernel (palette title), the lazy registry and Atlas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expand } from '../js/company-footprint.js';
import { between, ties, network, countriesOf, pairLine } from '../js/company-ties.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const groupOf = (ty) => ({ factory: 'factory', headquarters: 'hq', office: 'office', research: 'rnd' }[ty] || 'other');

test('① one country, two directions — whose companies are here, where its companies are', () => {
  const fp = { companies: ['jp1', 'jp2', 'us1', 'de1'], types: ['factory', 'headquarters', 'office', 'research'], statuses: ['operating'],
    f: [[0, 1, 139.7, 35.6, 'JPN', 0, 0, 'JP1 HQ'], [0, 0, -100, 25, 'MEX', 0, 0, 'JP1 Mexico plant'], [0, 0, 100, 13, 'THA', 0, 0, 'JP1 Thai plant'],
      [1, 1, 135.5, 34.7, 'JPN', 0, 0, 'JP2 HQ'], [1, 2, -99, 19, 'MEX', 0, 0, 'JP2 Mexico office'],
      [2, 1, -122, 37, 'USA', 0, 0, 'US1 HQ'], [2, 0, -101, 22, 'MEX', 0, 0, 'US1 Mexico plant'], [2, 3, 139.6, 35.5, 'JPN', 0, 0, 'US1 Tokyo lab'],
      [3, 1, 11.5, 48.1, 'DEU', 0, 0, 'DE1 HQ'], [3, 0, -98, 20, 'MEX', 0, 0, 'DE1 Mexico plant'], [3, 0, 0, 0, '', 0, 0, 'no country']] };
  const home = { jp1: 'JPN', jp2: 'JPN', us1: 'USA', de1: 'DEU' };
  const rows = expand(fp, groupOf, (id) => ({ n: id.toUpperCase(), sec: 'auto', cc: home[id] }));
  assert.equal(rows[0].home, 'JPN', 'expand carries the company\'s own country');
  const all = between(rows, {});
  assert.equal(all.length, 10, 'a site with no country cannot be read as a pair');

  const mx = ties(all, 'mex', 'in');
  assert.equal(mx.sites, 4); assert.equal(mx.domestic.sites, 0); assert.equal(mx.cross.share, 100);
  assert.deepEqual(mx.partners.map((p) => [p.cc, p.nCompanies, p.sites]), [['JPN', 2, 2], ['DEU', 1, 1], ['USA', 1, 1]], 'ranked by companies, then sites, then code');

  const jpOut = ties(all, 'JPN', 'out');
  assert.equal(jpOut.companies, 2); assert.equal(jpOut.sites, 5); assert.equal(jpOut.cross.sites, 3); assert.equal(jpOut.cross.share, 60);
  assert.deepEqual(jpOut.partners.map((p) => p.cc), ['MEX', 'THA']);
  assert.deepEqual(jpOut.partners[0].companies.map((c) => c.id), ['jp1', 'jp2']);

  const jpIn = ties(all, 'JPN', 'in');
  assert.equal(jpIn.domestic.sites, 2); assert.deepEqual(jpIn.partners.map((p) => [p.cc, p.groups]), [['USA', { rnd: 1 }]]);

  const factories = ties(between(rows, { groups: ['factory'] }), 'MEX', 'in');
  assert.equal(factories.sites, 3, 'the kind-of-site filter narrows before the pairs are counted');

  const W = network(all);
  assert.equal(W.cross.sites, 6); assert.equal(W.pairs[0].from + '>' + W.pairs[0].to, 'JPN>MEX'); assert.equal(W.pairs[0].nCompanies, 2);
  assert.ok(W.pairs.every((p) => p.from !== p.to), 'a domestic site is never a pair');
  assert.deepEqual(countriesOf(all).sort(), ['DEU', 'JPN', 'MEX', 'THA', 'USA']);
});

test('② the shipped files: every cross-border site is counted once, from both ends', () => {
  const fp = JSON.parse(read('data/companies/footprint.json')), idx = JSON.parse(read('data/companies/index.json'));
  const byId = new Map(idx.companies.map((c) => [c.id, c]));
  const rows = between(expand(fp, groupOf, (id) => byId.get(id)), {});
  /* an independent count, straight from the two files */
  let cross = 0; const homes = new Set();
  fp.f.forEach((r) => { const h = byId.get(fp.companies[r[0]]).cc; if (r[4] && h && h !== r[4]) { cross++; homes.add(h); } });
  const W = network(rows);
  assert.equal(W.cross.sites, cross);
  assert.ok(cross > 0, 'the company atlas has cross-border sites to read');
  assert.equal(W.pairs.reduce((a, p) => a + p.sites, 0), cross, 'the pairs partition the cross-border sites');
  /* from both ends: summing every country's «out» equals summing every country's «in» equals the network */
  const ccs = countriesOf(rows);
  const outSum = ccs.reduce((a, cc) => a + ties(rows, cc, 'out').cross.sites, 0), inSum = ccs.reduce((a, cc) => a + ties(rows, cc, 'in').cross.sites, 0);
  assert.equal(outSum, cross); assert.equal(inSum, cross);
  assert.ok(homes.size > 1);
});

test('③ a pair line is a great circle, continuous across the antimeridian', () => {
  const l = pairLine([139.7, 35.7], [-122.4, 37.8]);
  assert.ok(l.length > 20, 'densified');
  for (let i = 1; i < l.length; i++) assert.ok(Math.abs(l[i][0] - l[i - 1][0]) < 180, 'no jump the long way round');
  assert.ok(Math.max(...l.map((p) => p[1])) > 45, 'bows north of both ends, as a great circle does');
  assert.equal(pairLine(null, [0, 0]), null, 'a country with no label point is not invented a position');
  assert.equal(pairLine([1, 1], [1, 1]), null);
});

test('④ the reader reaches it: the sites card, the kernel with a palette title, the lazy registry, Atlas', () => {
  assert.match(read('js/company-footprint.js'), /cfp-ties[\s\S]*company\.ties/);
  assert.match(read('js/session-tabs.js'), /\['company\.ties',[\s\S]*?\['Companies between countries','企業でつながる国'\]\]/);
  assert.match(read('js/lazy-modules.js'), /companyTies: \{ publishes: 'IntMapCompanyTies'/);
  assert.match(read('js/atlas-capabilities.js'), /\["data\.companyTies","companyTies"/);
  const ties = read('js/company-ties.js');
  assert.match(ties, /render\.claim\(\[FSRC, LSRC\], 'map\.companyTies'/, 'the drawing is claimed under the effect the capability declares');
  assert.match(read('js/atlas-cap-data.js'), /'data\.companyTies'[^\n]*'paint', 'map\.companyTies'/);
});
