/* R742 — the identifiers the border store itself declares (Atlas → highlight)

   ⚠⚠⚠ MEASURED ON PRODUCTION 2026-09-15, not reasoned about. Atlas was asked 16 questions against
   https://rwmqx7dwb5-arch.github.io/IntMap/ . Three of the failures were one defect:
     · "Which EU countries use the euro?" — 12 consecutive `highlight:FAIL/failed`, 27 steps, 2m14s.
     · "Which countries border Kazakhstan?" — the reply carried "⚠ … UZ → UZB" beside a correct map.
     · "Which African countries are landlocked?" — DZA BWA BFA BDI CAF TCD SWZ ETH LSO MWI MLI NER RWA
       SSD were ALL reported to the reader as "could not be matched to a boundary in the data IntMap
       holds"; the retry one step later drew every one of them.

   The store was never empty. At the moment of the failure window.countryGeo held 258 features,
   IntMapAtlasDebug.validCodeSet() held 252 codes, and codesGeo(['DEU','FRA','ESP','ITA']) hit all
   four. What failed was the READING. Probed live with IntMapAtlasDebug.hlReadGroups:

       {codes:['DEU','FRA']}          → 2 codes
       {codes:['DE','FR']}            → 0 codes, 2 unresolved
       {targets:['Germany','France']} → 0 codes, 2 unresolved

   …while resolveHl('Germany') returns DEU, resolveHl('ドイツ') returns DEU, and
   resolveHl('Korean Peninsula') returns a real admin_union polygon (bbox 124.21..131.86 /
   33.20..43.01). The resolver that could answer was one function away; the reply to question 12 was
   "⚠ Place not found: Korean Peninsula".

   So these measure two FACTS, not two spellings:
     ① an identifier the store declares is read, in whichever ISO notation it is written;
     ② a request in which nothing was an identifier falls through to the concrete-place resolver —
        which is what this reader's own comment has promised since #R157 while doing the opposite. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHighlightTargets } from '../js/atlas-country-ids.js';

/* The reader moved WHOLE out of js/atlas-console.js in #R742 — the kernel's line budget is
   shrink-only (tests/r318-checks ⑨b) — so these run the shipped function itself rather than a text
   lifted out of a file. */

/* A border store shaped like the one that ships (Natural Earth Admin-0, fetched at runtime from
   nvkelso/natural-earth-vector — see js/countries-ui.js). It declares the alpha-3 IntMap keys on
   (__code) beside ISO_A2 and ISO_N3 for the SAME feature. The FIPS trap below is real data: Natural
   Earth gives Germany `FIPS_10` "GM", and ISO 3166-1 alpha-2 "GM" is Gambia — so a reader that
   indexed every column would resolve "GM" to Germany and be wrong about a country nobody asked
   after. */
const STORE = { type: 'FeatureCollection', features: [
  { id: 'DEU', properties: { __code: 'DEU', ISO_A2: 'DE', ISO_A3: 'DEU', ISO_N3: '276', FIPS_10: 'GM', NAME: 'Germany' }, geometry: null },
  { id: 'FRA', properties: { __code: 'FRA', ISO_A2: 'FR', ISO_A3: 'FRA', ISO_N3: '250', FIPS_10: 'FR', NAME: 'France' }, geometry: null },
  { id: 'GMB', properties: { __code: 'GMB', ISO_A2: 'GM', ISO_A3: 'GMB', ISO_N3: '270', FIPS_10: 'GA', NAME: 'Gambia' }, geometry: null },
  { id: 'UZB', properties: { __code: 'UZB', ISO_A2: 'UZ', ISO_A3: 'UZB', ISO_N3: '860', FIPS_10: 'UZ', NAME: 'Uzbekistan' }, geometry: null },
  /* Natural Earth writes -99 where it states no code; an absence is not an identifier. */
  { id: 'XKX', properties: { __code: 'XKX', ISO_A2: -99, ISO_A3: -99, ISO_N3: -99, NAME: 'Kosovo' }, geometry: null }
] };

/* the shipped reader, with only the two collaborators it names */
function reader(store) {
  const t = makeHighlightTargets({ geo: () => store, resolveCountrySync: () => null });
  return { idIndex: t.idIndex, valid: t.validCodeSet, read: t.readGroups, cols: t.isoAliasColumns };
}

const R = reader(STORE);
const codesOf = (g) => (g || []).flatMap((x) => x.codes);

test('R742 ① an identifier is read in every ISO notation the SAME feature declares', () => {
  assert.deepEqual(codesOf(R.read({ codes: ['DEU', 'FRA'] })), ['DEU', 'FRA'], 'alpha-3 — the notation that already worked');
  assert.deepEqual(codesOf(R.read({ codes: ['DE', 'FR'] })), ['DEU', 'FRA'], 'alpha-2 — measured failing on production');
  assert.deepEqual(codesOf(R.read({ codes: ['276', '250'] })), ['DEU', 'FRA'], 'numeric-3');
  assert.deepEqual(codesOf(R.read({ codes: ['UZ'] })), ['UZB'], 'the exact token the Kazakhstan reply warned about');
  assert.deepEqual(codesOf(R.read({ codes: ['de', 'fr'] })), ['DEU', 'FRA'], 'case is not an identity');
});

test('R742 ② the columns are NAMED, so a FIPS collision cannot answer for ISO', () => {
  assert.deepEqual(codesOf(R.read({ codes: ['GM'] })), ['GMB'],
    '"GM" is Gambia, because only the ISO namespaces are read — Germany\'s FIPS_10 is also "GM"');
  assert.ok(!R.idIndex().map.has('GA'), 'a FIPS-only token is not an identifier this map keys on');
  const cols = R.cols();
  assert.ok(cols.length > 0, 'the list is not empty');
  assert.ok(cols.every((c) => /^ISO_/.test(c)),
    'every column read is an ISO namespace; the moment a WB_/FIPS_/UN_ column is added there the ' +
    'collision this test names becomes reachable again');
});

test('R742 ③ a token two features claim identifies neither', () => {
  const R2 = reader({ type: 'FeatureCollection', features: [
    { id: 'AAA', properties: { __code: 'AAA', ISO_A2: 'ZZ' }, geometry: null },
    { id: 'BBB', properties: { __code: 'BBB', ISO_A2: 'ZZ' }, geometry: null } ] });
  assert.ok(R2.idIndex().ambiguous.has('ZZ'), 'the collision is observed');
  assert.ok(!R2.idIndex().map.has('ZZ'), 'and resolved to neither, rather than to whichever was walked first');
});

test('R742 ④ "not stated" is not an identifier', () => {
  assert.ok(!R.idIndex().map.has('-99'), 'Natural Earth writes -99 where it declares no code');
  assert.equal(R.read({ codes: ['-99'] }), null, 'and a request made only of it read nothing');
});

test('R742 ⑤ a request in which NOTHING was an identifier falls through, as the reader documents', () => {
  /* #R157 wrote that a NAME array "does NOT [count as GPT targets] — those fall through to the legacy
     concrete-place resolver". Returning null IS that fall-through. Before this round the same input
     built a group with zero codes, which ended the request with a claim about the boundary data. */
  assert.equal(R.read({ targets: ['Germany', 'France'] }), null, 'plain names');
  assert.equal(R.read({ targets: ['ドイツ'] }), null, "a name in the reader's own language");
  assert.equal(R.read({ targets: ['Korean Peninsula'] }), null, 'a place that is not a country at all');
  assert.equal(R.read({ groups: [{ label: 'x', targets: ['Germany'] }] }), null, 'the grouped form too');
});

test("R742 ⑥ a WRONG identifier still comes back structured — #R158's contract is untouched", () => {
  const g = R.read({ codes: ['XXX'] });
  assert.ok(Array.isArray(g), 'a bogus alpha-3 does not fall through: it IS an identifier, just not one that resolves');
  assert.deepEqual(g[0].codes, [], 'nothing is drawn for it');
  assert.equal(g[0].unresolved.length, 1, 'and it is reported rather than dropped');
  assert.equal(g[0].unresolved[0].reason, 'iso3_not_in_border_data', 'with the machine reason Terra repairs from');
});

test('R742 ⑦ a MIXED request executes the identifiers and reports the rest', () => {
  const g = R.read({ targets: [{ iso3: 'DE', name: 'Germany' }, { name: 'Atlantis' }] });
  assert.deepEqual(codesOf(g), ['DEU'], 'the identifier is executed as-is');
  assert.equal(g[0].unresolved.length, 1, 'the name is neither drawn nor silently dropped');
  assert.equal(g[0].unresolved[0].name, 'Atlantis');
});

test('R742 ⑧ the reply can state which notation it read, so no spelling is swapped in silence', () => {
  const g = R.read({ codes: ['DE', 'FRA'] });
  assert.deepEqual(g[0].read, [{ as: 'DE', code: 'DEU' }], 'only the token that needed reading is reported');
});

test('R742 ⑨ an unreadable store yields an empty index, never a half-built one', () => {
  for (const bad of [null, {}, { features: null }, { features: [{}] }]) {
    const R2 = reader(bad);
    assert.equal(R2.idIndex().map.size, 0, 'nothing is claimed about a store that could not be read');
    assert.equal(R2.read({ codes: ['DE'] }), null, 'and no token resolves through it');
  }
});

test('R742 ⑩ offering an identifier and getting it wrong is NOT the same as offering none', () => {
  /* ⚠ The first cut of the fall-through asked `!t.iso3` — what RESOLVING produced — so
     {name:'Germany', iso3:'XX'} looked like a request with no identifiers and fell through, taking
     #R158's repair contract with it. tests/r157.spec.js caught it. The caller named the identifier
     slot; it just got the value wrong, and that is precisely the case Terra is supposed to be handed
     back so it can re-issue with the right code. */
  const g = R.read({ targets: [{ name: 'Germany', iso3: 'XX' }, { name: 'France', iso3: '' }] });
  assert.ok(Array.isArray(g), 'a wrong identifier does not fall through to the place resolver');
  assert.deepEqual(g[0].codes, [], 'and nothing is auto-applied from the name');
  assert.equal(g[0].unresolved.length, 2, 'both are returned to Terra');

  assert.equal(R.read({ targets: [{ name: 'Germany' }, { name: 'France' }] }), null,
    'the same objects WITHOUT an identifier slot offered none, so they belong to the place resolver');
  assert.ok(Array.isArray(R.read({ codes: ['XXX'] })), 'a bare code-shaped string is an offer too');
  assert.equal(R.read({ targets: ['Korean Peninsula'] }), null, 'and a plain name still is not');
});
