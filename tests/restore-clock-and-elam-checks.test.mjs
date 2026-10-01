/* ══ restore-clock-and-elam — A START BOUND IS ASKED AGAINST HISTORY, NOT ONLY AGAINST WIKIDATA ══════════
 *
 *  Observed 2026-10-02 (landing-showcase): the 3000 BCE map drew Elam's shape with no name. Measured with
 *  `node scripts/hist-fidelity.mjs --year -3000 --in 40,20,65,40`: the shape was on sheet −2999, and the
 *  name was withheld by data/hist-era-spans.json — «Elam» → Q128904 with Wikidata's start, 2700 BCE (the
 *  Old Elamite period), while history dates Elamite civilization from the Proto-Elamite period, c. 3200 BCE.
 *  The row's own sentence said so, and every gate was green: the gate asked only whether Wikidata states
 *  the year. Two more rows had the same shape (Golden Horde 1243 against «1242-43»; Xiongnu's bound was
 *  later than its sentence's 318 BCE but withholds only sheets that precede it).
 *
 *  ⚠ EVALUATED, NOT READ (#R505): the page's own `eraShown` (scripts/histeras/time-borders.mjs) answers
 *  what the reader sees, and the gate is run against ledgers that carry the defect.
 *  The other half of this work — the share-link restore owning the clock over a war row — is browser
 *  behaviour and is asserted in tests/restored-layer-before-style.spec.js ⑥.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraContext, eraSpanProblems, historyNames } from '../scripts/hist-fidelity.mjs';

const ctx = await eraContext();
const sheet = (y) => ctx.er.snaps.find((s) => s.y === y);
const fcOf = (s) => ({ type: 'FeatureCollection', features: s.feats.map((f) => ({ type: 'Feature',
  properties: { NAME: f[0].en }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } })) });
const named = (fc, nm) => fc.features.some((f) => f.properties.NAME === nm);
const withLedger = (edit) => { const ledger = structuredClone(ctx.ledger); edit(ledger); return eraSpanProblems({ ...ctx, ledger }); };
const kinds = (ps) => ps.map((p) => p[0]);

test('① the 3000 BCE map names Elam again, and the shape was never the problem', () => {
  const s = sheet(-2999);
  assert.ok(s && s.feats.some((f) => f[0].en === 'Elam'), 'the −2999 sheet carries Elam');
  for (const y of [-3000, -2999, -2800]) assert.ok(named(ctx.api.eraShown(fcOf(s), y), 'Elam'), 'Elam is named at ' + y);
  assert.ok(!ctx.ledger.rows.some((r) => r.name === 'Elam'), 'no row acts on Elam');
  const ref = ctx.ledger.refuted.find((r) => r.name === 'Elam' && r.side === 'start');
  assert.ok(ref && ref.why === 'date-disputed' && /3200 BCE/.test(ref.note), 'the start is refuted, with the historical year');
});

test('② the shipped ledger passes, and every start row states the year history places it from', () => {
  assert.deepEqual(eraSpanProblems(ctx), []);
  const starts = ctx.ledger.rows.filter((r) => r.s != null);
  assert.ok(starts.length > 0);
  for (const r of starts) assert.ok(Number.isInteger(r.hs), r.name + ' states hs');
});

test('③ the gate goes red on the defect as it shipped: Wikidata\'s 2700 BCE against history\'s 3200 BCE', () => {
  const ps = withLedger((l) => {
    l.refuted = l.refuted.filter((r) => !(r.name === 'Elam' && r.side === 'start'));
    l.rows.push({ name: 'Elam', q: 'Q128904', s: -2699, hs: -3199,
      history: 'Elamite civilization is dated from the Proto-Elamite period, c. 3200 BCE; the Old Elamite period begins c. 2700 BCE.' });
  });
  const hit = ps.filter((p) => p[0] === 'era-span-withholds-history');
  assert.equal(hit.length, 1, JSON.stringify(ps));
  assert.match(hit[0][1], /Elam/);
  assert.match(hit[0][1], /-3199\.\.-2700/, 'it names the years withheld that history says Elam existed');
});

test('④ a start row with no historical year, or one its sentence does not state, is red', () => {
  const x = (r) => r.name === 'Mughal Empire';
  assert.ok(kinds(withLedger((l) => { delete l.rows.find(x).hs; })).includes('era-span-row-no-history-start'));
  assert.ok(kinds(withLedger((l) => { l.rows.find(x).hs = 1525; })).includes('era-span-row-history-start-unsaid'));
  /* a bound EARLIER than history withholds nothing history claims — that is not this finding */
  assert.ok(!kinds(withLedger((l) => { l.rows.find(x).hs = 1526; })).includes('era-span-withholds-history'));
});

test('⑤ the sentence is read as it is written: BCE, ranges, and a CE year not mistaken for a BCE one', () => {
  assert.equal(historyNames('c. 3200 BCE', -3199), true);
  assert.equal(historyNames('established Nanyue in 207-204 BCE', -206), true);
  assert.equal(historyNames('first appear in the record in 318 BCE', 318), false, '318 BCE is not 318');
  assert.equal(historyNames('Batu established it, 1242-43.', 1242), true);
  assert.equal(historyNames('in 1243', 1242), false);
  assert.equal(historyNames('c. 2700 BCE', -3199), false);
});
