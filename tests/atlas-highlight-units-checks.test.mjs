/* Atlas · highlight groups name a member's KIND and its SHAPE separately (audit 2026-11-21 §9.2).
   A World Cup's England and Scotland are entrants but not ISO 3166-1 countries: the old reader required an
   alpha-3 code per member, so they could not be drawn. The shape is now named by its own notation — an
   ISO 3166-2 unit — and what the member is (a team) rides beside it. Nothing here knows any event. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeHighlightTargets } from '../js/atlas-country-ids.js';

const STORE = { type: 'FeatureCollection', features: [
  { id: 'JPN', properties: { __code: 'JPN', ISO_A2: 'JP', ISO_A3: 'JPN', ISO_N3: '392', NAME: 'Japan' }, geometry: null },
  { id: 'GBR', properties: { __code: 'GBR', ISO_A2: 'GB', ISO_A3: 'GBR', ISO_N3: '826', NAME: 'United Kingdom' }, geometry: null },
  { id: 'FRA', properties: { __code: 'FRA', ISO_A2: 'FR', ISO_A3: 'FRA', ISO_N3: '250', NAME: 'France' }, geometry: null },
] };
const read = (a) => makeHighlightTargets({ geo: () => STORE, resolveCountrySync: () => null }).readGroups(a);

test('a member given by an ISO 3166-2 unit is a unit to draw, with the country it belongs to and what it is', () => {
  const g = read({ groups: [{ label: 'UEFA', targets: [{ name: 'England', kind: 'team', subdivision: 'GB-ENG' }, { name: 'Scotland', subdivision: 'gb-sct' }] }] });
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].codes, []);
  assert.deepEqual(g[0].units.map((u) => [u.id, u.country, u.name, u.kind]), [['GB-ENG', 'GBR', 'England', 'team'], ['GB-SCT', 'GBR', 'Scotland', '']]);
  assert.deepEqual(g[0].members.map((m) => m.geometry), ['subdivision', 'subdivision']);
  assert.deepEqual(g[0].unresolved, [], 'a unit is not an unresolved country');
});

test('a unit id is recognised in any slot the caller put it, and as a bare string', () => {
  const ids = (a) => (read(a) || []).flatMap((x) => x.units.map((u) => u.id));
  assert.deepEqual(ids({ targets: ['GB-WLS'] }), ['GB-WLS']);
  assert.deepEqual(ids({ targets: [{ name: 'Wales', iso3: 'GB-WLS' }] }), ['GB-WLS']);
  assert.deepEqual(ids({ codes: [{ code: 'GB-NIR' }] }), ['GB-NIR']);
});

test('countries and units mix in one group; the kind is carried for either; the shape basis is per member', () => {
  const g = read({ groups: [{ label: 'Group A', targets: [{ name: 'Japan', iso3: 'JPN', kind: 'team' }, { name: 'France', iso3: 'FRA' }, { name: 'England', subdivision: 'GB-ENG', kind: 'team' }] }] });
  assert.deepEqual(g[0].codes, ['JPN', 'FRA']);
  assert.equal(g[0].units.length, 1);
  assert.deepEqual(g[0].members.map((m) => [m.id, m.geometry, m.kind]), [['JPN', 'country', 'team'], ['FRA', 'country', ''], ['GB-ENG', 'subdivision', 'team']]);
});

test('a request made only of units is a request that offered identifiers (it must not fall through as «none»)', () => {
  assert.notEqual(read({ targets: [{ name: 'England', subdivision: 'GB-ENG' }] }), null);
});

test('a country-only request reads exactly as before, and a duplicate unit is read once', () => {
  const g = read({ groups: [{ label: 'x', targets: [{ name: 'Japan', iso3: 'JPN' }, 'GB-ENG', 'GB-ENG'] }] });
  assert.deepEqual(g[0].codes, ['JPN']); assert.equal(g[0].units.length, 1);
});

test('the capability draws units through the one resolver and reports an unresolvable unit instead of dropping it', () => {
  /* read, not run: the paint path is the kernel's highlight case, a closure over the whole page that only a browser builds */
  const cap = readFileSync(new URL('../js/atlas-cap-map.js', import.meta.url), 'utf8');
  assert.match(cap, /K\._hlUnitGeo\(u\)/);
  assert.match(cap, /reason:'no_subdivision_geometry'/);
  const con = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
  assert.match(con, /get _hlUnitGeo\(\)\{ return _hlUnitGeo; \}/);
  assert.match(con, /shapeISO/);
});
