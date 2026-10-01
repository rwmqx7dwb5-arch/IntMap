/* ══ hist-era-span-fidelity — A SHEET'S NAME IS ASKED AT THE READER'S YEAR ═══════════════════════
 *
 *  Production, 2026-10-01 (048e4ce): Chronos at 1600 drew «Songhai» (the Songhai Empire fell at
 *  Tondibi, 1591) and «Watassid Morocco» (the Wattasids ended in 1554). Measured on the shipped
 *  bundle: upstream's world_1600 itself carries both, and `nearest()` also answers 1566-1625 with
 *  that sheet, so «Dutch Republic» (1581) was drawn in 1570 by the gap alone. Every gate was green:
 *  the sheet is well formed and states no span per feature.
 *
 *  ⚠ THESE CHECKS EVALUATE, THEY DO NOT READ (#R505). js/time-borders.js runs in the node harness
 *  (scripts/histeras/time-borders.mjs) with a fetch that serves this checkout, so `go()` opens the
 *  shipped bundle and data/hist-era-spans.json exactly as the page does, and every reader of the
 *  result — `currentFC` (Atlas, Compare, the narrator, the click card), `coverage`, `note`,
 *  `blankNote` — is asked what it now says. No sentence is matched by its spelling (#R488).
 *
 *  ⚠ AND THE GATE ITSELF IS EXERCISED: check:histfidelity must go red when a finding loses its
 *  verdict or a row states a date Wikidata does not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraContext, eraSpanProblems, repoFetch } from '../scripts/hist-fidelity.mjs';
import { candidates, judged, identityOf } from '../scripts/histeras/spans.mjs';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';

const ctx = await eraContext();
const sheet = (y) => ctx.er.snaps.find((s) => s.y === y);
const fcOf = (s) => ({ type: 'FeatureCollection', features: s.feats.map((f) => ({ type: 'Feature',
  properties: { NAME: f[0].en }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } })) });
const named = (fc, nm) => fc.features.some((f) => f.properties.NAME === nm);
const withheld = (fc, nm) => fc.features.some((f) => f.properties._wName === nm && f.properties.NAME === '');

test('① the defect is in the record itself: world_1600 states «Songhai» and «Watassid Morocco» for its own year', () => {
  const s = sheet(1600);
  assert.ok(s, 'the bundle has a 1600 sheet');
  for (const nm of ['Songhai', 'Watassid Morocco']) assert.ok(s.feats.some((f) => f[0].en === nm), nm + ' is on world_1600');
  /* …and the gap stretches the sheet: the page's own nearest() draws world_1600 from 1566 */
  assert.equal(ctx.api._nearest(1570, ctx.er.snaps.map((x) => x.y)), 1600);
});

test('② the page withholds the NAME past the polity\'s end, keeps it inside, and keeps the SHAPE', () => {
  const fc = fcOf(sheet(1600));
  const at1600 = ctx.api.eraShown(fc, 1600);
  assert.equal(at1600.features.length, fc.features.length, 'no shape is dropped');
  for (const nm of ['Songhai', 'Watassid Morocco']) {
    assert.ok(!named(at1600, nm), nm + ' is not named at 1600');
    assert.ok(withheld(at1600, nm), nm + ' is carried as a withheld name, not deleted');
  }
  /* inside the span the same sheet still names it — the rule is a span, not a blacklist */
  assert.ok(named(ctx.api.eraShown(fc, 1590), 'Songhai'), 'Songhai is still named at 1590 (it fell in 1591)');
  assert.ok(named(ctx.api.eraShown(fc, 1591), 'Songhai'), 'the bound year is inside the span');
  /* the stretch: a start bound, asked of the reader's year */
  assert.ok(!named(ctx.api.eraShown(fc, 1570), 'Dutch Republic'), 'Dutch Republic is not named at 1570');
  assert.ok(named(ctx.api.eraShown(fc, 1600), 'Dutch Republic'), 'Dutch Republic is named at 1600');
  /* the cached sheet is not mutated: the record stays what upstream stated */
  assert.ok(named(fc, 'Songhai'));
});

test('③ through go(): every reader of the drawn collection, and the card, say the same thing', async () => {
  for (const lang of ['en', 'jp']) {
    const { api } = await timeBorders({ lang, fetch: repoFetch });
    await api._go(new Date(1600, 6, 1));
    const fc = api.currentFC();
    assert.ok(fc && fc.features.length, lang + ': the 1600 sheet is drawn');
    for (const nm of ['Songhai', 'Watassid Morocco']) {
      assert.ok(!named(fc, nm), lang + ': currentFC (Atlas, Compare, the narrator) does not name ' + nm);
      assert.equal(api.featureAt(nm, null), null, lang + ': featureAt finds no feature called ' + nm);
    }
    const cov = api.coverage();
    const w = cov.withheld.map((x) => x.name);
    assert.ok(w.includes('Songhai') && w.includes('Watassid Morocco'), lang + ': coverage counts the withheld names');
    /* a withheld name is NOT «a shape upstream left unnamed» — the two counts are disjoint */
    const blankCount = fc.features.filter((f) => !f.properties.NAME && !f.properties._wName).length;
    assert.equal(cov.blank, blankCount, lang + ': blank excludes withheld names');
    assert.ok(api.note().includes('Songhai'), lang + ': the layer row names what it withholds');
    const f = fc.features.find((x) => x.properties._wName === 'Songhai');
    const card = api.blankNote(f), plain = api.blankNote({ properties: { NAME: '' } });
    assert.ok(card.title.includes('Songhai'), lang + ': the card says which name upstream gave');
    assert.notEqual(card.title, plain.title, lang + ': the card does not claim upstream gave no name');
    assert.ok(card.lines.join(' ').includes('Q202687'), lang + ': the card names the identity it was judged under');
  }
});

test('④ the gate is green on the shipped record, and every finding has a verdict', () => {
  assert.deepEqual(eraSpanProblems(ctx), []);
  assert.ok(ctx.found.length > 0, 'the finder found something to judge');
  for (const c of ctx.found) assert.ok(judged(c, ctx.ledger), c.name + ' ' + c.side + ' is judged');
  /* the reported pair is bound by a reviewed row, because the matcher never binds them */
  for (const nm of ['Songhai', 'Watassid Morocco']) assert.equal(identityOf(nm, ctx.ledger, ctx.histnames).from, 'reviewed');
});

test('⑤ the gate goes red: a finding without a verdict, a row with a date Wikidata does not state', () => {
  const ledger = structuredClone(ctx.ledger);
  ledger.refuted = ledger.refuted.filter((r) => !(r.name === 'Shan states'));
  const found = candidates({ bundle: ctx.er, ledger, histnames: ctx.histnames, ranges: ctx.ranges });
  const p1 = eraSpanProblems({ ...ctx, ledger, found }).map((x) => x[0]);
  assert.ok(p1.includes('era-span-unjudged'), 'removing a verdict leaves an unjudged finding');

  const l2 = structuredClone(ctx.ledger);
  l2.rows.find((r) => r.name === 'Songhai').e = 1600;
  const p2 = eraSpanProblems({ ...ctx, ledger: l2, found: candidates({ bundle: ctx.er, ledger: l2, histnames: ctx.histnames, ranges: ctx.ranges }) }).map((x) => x[0]);
  assert.ok(p2.includes('era-span-row-unstated'), 'a bound Wikidata does not state is refused');

  const l3 = structuredClone(ctx.ledger);
  l3.rows.find((r) => r.name === 'Songhai').history = '';
  const p3 = eraSpanProblems({ ...ctx, ledger: l3 }).map((x) => x[0]);
  assert.ok(p3.includes('era-span-row-unreviewed'), 'a Wikidata date with no historical check is refused');
});
