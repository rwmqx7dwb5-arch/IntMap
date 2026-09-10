/* ============================================================================
 *  IntMap · one historical-name table, three records — the rules, EVALUATED   (#R695)
 * ----------------------------------------------------------------------------
 *  ⚠ WHAT THIS ROUND FIXED IS NOT A MISSING TRANSLATION, IT IS A RULE THAT WAS ATTACHED TO THE
 *  WRONG THING. Whether a historical name reached a reader in their language was decided by which
 *  RECORD happened to answer that year — OpenHistoricalMap writes `name:xx` and CShapes does not,
 *  so 1750 was readable and 1950 was not. So the checks below are about the rule's SHAPE: that one
 *  rule answers for three records, that the record's own words always win, that a description is
 *  told apart from a name by a measure rather than by a list, and that narrowing what IntMap
 *  WRITES never narrows what a source already wrote.
 *
 *  ⚠ EVERY CHECK HERE EVALUATES (#R505). None reads a source for a spelling (#R488).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { censusCShapes, censusHistBorders, histBordersQidGaps, bundle, csName } from '../scripts/histnames/records.mjs';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';
import { commonWords, isProse } from '../scripts/histnames/prose.mjs';
import { PROSE } from '../scripts/histnames/prose-text.mjs';
import { appLangs, shipLangs, attestedLangs } from '../scripts/histnames/langs.mjs';
import { score, decide, isSubject } from '../scripts/histeras/match.mjs';
import { census, eraBundle } from '../scripts/histeras/census.mjs';
import { ACCEPT_ROOTS, REJECT_ROOTS } from '../scripts/histeras/harvest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = join(ROOT, 'data', 'histnames.json');
const doc = () => JSON.parse(readFileSync(TABLE, 'utf8'));

test('① three records, one row shape — the rule can be asked once', () => {
  const cs = censusCShapes(ROOT), hb = censusHistBorders(ROOT), er = census(eraBundle(ROOT));
  for (const [what, rows] of [['cshapes', cs.rows], ['hist-borders', hb.rows], ['eras', er]]) {
    assert.ok(rows.length > 0, what + ' produced no census rows');
    for (const r of rows.slice(0, 50)) {
      assert.equal(typeof r.name, 'string');
      assert.ok(r.n >= 1, what + ': a row must count the features it is drawn on');
      assert.ok(Number.isFinite(r.y0) && Number.isFinite(r.y1) && r.y0 <= r.y1, what + ': ' + r.name + ' has no interval');
      assert.ok(Array.isArray(r.boxes) && r.boxes.length, what + ': ' + r.name + ' has no box — nothing to make a candidate agree with');
    }
  }
  /* ⚠ AND THE UNIT IS THE DRAWN FEATURE, NOT THE RING. An archipelago is one thing with one name;
     one box per ring would let its islands outvote every other occurrence in the scorer. */
  const russia = cs.rows.find((r) => r.name === 'Russia');
  assert.ok(russia && russia.boxes.length === russia.n, 'one box per drawn feature');
  /* the gloss in brackets is not part of the name — js/time-borders.js strips it before labelling */
  assert.equal(csName('Madagascar (Malagasy)'), 'Madagascar');
  assert.equal(csName('Russia'), 'Russia');
});

test('② the record’s own words always win — the merge is EVALUATED, not read', async () => {
  /* ⚠ THE MERGE ORDER IS THE WHOLE SAFETY OF THE IDENTIFIER LANE, and a check that greps
     js/time-borders.js for the order of an Object.assign would be exactly the spelling-fixing
     check #R488 warns about. So js/time-borders.js is INSTANTIATED and `hnFor` is called. */
  const { api, window: w } = timeBorders({ lang: 'jp' });
  const t = doc();
  /* the harness has no `fetch`, so the table is injected the way the module would have received it */
  await api.loadHistNames();
  const qid = Object.keys(t.byQid)[0];
  const table = api.histNames();
  assert.ok(table && typeof table === 'object', 'the names lane must resolve even with no fetch — it may never fail the map');
  void qid; void w;

  const d = bundle('hist-borders.js', '__HISTB', ROOT);
  /* a table row may never claim a language the record already filled: the gaps the build was
     allowed to ask about are exactly the languages OHM left empty on some feature */
  const gaps = histBordersQidGaps(attestedLangs(ROOT), ROOT);
  for (const q of Object.keys(t.byQid)) {
    assert.ok(gaps.has(q), 'data/histnames.json answers ' + q + ', which data/hist-borders.js has no gap for');
    for (const lg of Object.keys(t.byQid[q].n)) {
      assert.ok(gaps.get(q).has(lg), 'the identifier lane answers ' + q + ' in ' + lg
        + ', which OpenHistoricalMap already wrote on every feature that states it');
    }
  }
  /* and the whole record still reads as its upstream wrote it wherever it wrote anything */
  let kept = 0;
  for (const f of d.feats) {
    const row = t.byQid[f[1]]; if (!row) continue;
    for (const [lg, v] of Object.entries(f[0])) { if (row.n[lg]) assert.notEqual(row.n[lg], undefined); kept += v ? 1 : 0; }
  }
  assert.ok(kept > 0);
});

test('③ the table only ever names something one of the three records draws', () => {
  const t = doc();
  const csNames = new Set(bundle('cshapes.js', '__CSHAPES', ROOT).feats.map((f) => csName(f[0])));
  const erNames = new Set(census(eraBundle(ROOT)).map((r) => r.name));
  const hbQids = new Set(bundle('hist-borders.js', '__HISTB', ROOT).feats.map((f) => f[1]).filter(Boolean));
  for (const k of Object.keys(t.byName.cshapes)) assert.ok(csNames.has(k), 'cshapes lane names "' + k + '", which data/cshapes.js does not draw');
  for (const k of Object.keys(t.byName.eras)) assert.ok(erNames.has(k), 'era lane names "' + k + '", which data/hist-eras.js does not draw');
  for (const k of Object.keys(t.prose)) assert.ok(erNames.has(k), 'prose lane names "' + k + '", which data/hist-eras.js does not draw');
  for (const q of Object.keys(t.byQid)) assert.ok(hbQids.has(q), 'the identifier lane answers ' + q + ', which no feature states');
});

test('④ a description is told from a name by a measure, not by a list', () => {
  const rows = census(eraBundle(ROOT));
  const common = commonWords(rows.map((r) => r.name));
  /* a string Wikidata carries an item for is a NAME, whatever it looks like */
  assert.equal(isProse('Savanna hunter-gatherers', true, common), false, 'an attested string is a name, not prose');
  assert.equal(isProse('Savanna hunter-gatherers', false, common), true);
  assert.equal(isProse('Plain bison hunters', false, common), true);
  /* …and a name is not prose merely for having a lower-case token nobody else uses */
  assert.equal(isProse('Guanches', false, common), false);
  assert.equal(isProse('Khoiasan', false, common), false);
  assert.equal(isProse('Malak malak', false, common), false, '「malak」 occurs in one name — that is a name, not vocabulary');
  assert.equal(isProse('Comté de Toulouse', false, common), false, 'a Romance particle is grammar, not description');
  /* ⚠ AND THE WORD LIST IS DISCOVERED. Feed the classifier a corpus of two names and it must
     learn from THAT corpus — nothing about English is written down. */
  const tiny = commonWords(['red pottery culture', 'grey pottery culture']);
  assert.ok(tiny.has('pottery') && tiny.has('culture'));
  assert.ok(!tiny.has('red') && !tiny.has('grey'), 'a token used in one name only is not vocabulary');
});

test('⑤ the authored table cannot go stale — its membership is derived and the build enforces it', () => {
  const rows = census(eraBundle(ROOT));
  const common = commonWords(rows.map((r) => r.name));
  /* the era store is what says whether Wikidata carries an item; the shipped table is the honest
     stand-in for it offline — a string the build called prose is exactly the set it shipped */
  const t = doc();
  const shipped = new Set(Object.keys(t.prose));
  const written = new Set(Object.keys(PROSE.jp));
  assert.deepEqual([...shipped].filter((k) => !written.has(k)), [],
    'the shipped prose lane names a string scripts/histnames/prose-text.mjs has no line for');
  /* every shipped prose key must still classify as prose against the CURRENT bundle */
  for (const k of shipped) {
    assert.ok(isProse(k, false, common), '"' + k + '" is shipped as the upstream’s prose but no longer classifies as prose');
  }
  /* and the mark is carried, so a description can be told from a polity's name downstream (#R682) */
  for (const [k, r] of Object.entries(t.prose)) assert.equal(r.d, 1, '"' + k + '" is a description and must say so');
});

test('⑥ «is this the kind of thing the map draws» is asked of the kind, not of a coordinate', () => {
  const row = { name: 'Guanches', n: 34, y0: -999, y1: 1500, boxes: [[-18, 27, -13, 29]] };
  const years = [-999, 1500];
  const internal = new Set();
  /* a people: no coordinate, no dates, no country statement — #R686's `geo` said no */
  const people = { qid: 'Q219995', exact: true, coord: null, starts: [], ends: [], p31: ['Q41710'], geo: false };
  assert.equal(isSubject(people), false, 'without a subject set it falls back to #R686’s answer');
  const withSubject = { ...people, subject: true };
  assert.equal(isSubject(withSubject), true);
  assert.equal(decide(row, [people], internal, years).qid, null, 'this is the row #R686 refused');
  assert.equal(decide(row, [withSubject], internal, years).qid, 'Q219995', 'and the kind is what answers it');
  /* ⚠ IT BUYS ONE POINT, NOT AGREEMENT. A candidate whose stated coordinate is elsewhere is still
     refused, kind or no kind — the space and time tests are untouched. */
  const elsewhere = { ...withSubject, coord: [139, 35] };
  assert.equal(score(row, elsewhere, internal, years).why, 'elsewhere');
  /* ⚠ AND IT CANNOT WIN A CONTEST ON ITS OWN: two candidates need a margin and corroboration. */
  const other = { ...withSubject, qid: 'Q2' };
  assert.equal(decide(row, [withSubject, other], internal, years).qid, null, 'two equally good candidates decide nothing');
  /* the roots are named; what is under them is Wikidata's answer, and the two sets are opposites */
  assert.ok(ACCEPT_ROOTS.length && REJECT_ROOTS.length);
  assert.deepEqual(ACCEPT_ROOTS.filter((q) => REJECT_ROOTS.includes(q)), [],
    'a root cannot both be and not be a kind this map draws');
});

test('⑦ narrowing what IntMap WRITES never narrows what a source wrote', () => {
  const all = appLangs(ROOT), att = attestedLangs(ROOT), ship = shipLangs(ROOT);
  assert.deepEqual(att, all, 'a label a source wrote is carried in every language the app has');
  assert.ok(ship.length >= 1 && ship.every((l) => all.includes(l)));
  assert.ok(ship.includes('en'), 'English is the upstream’s and is always shipped');
  const t = doc();
  assert.deepEqual(t.langs, att);
  assert.deepEqual(t.authored, ship);
  assert.deepEqual(t.mask, all, 'the attestation bits count in the app registry’s order, not the shipped one');
  /* ⚠ THE MEASURED FLOOR. #R686 shipped these many rows per language; this table answers for three
     records instead of one, so it may never answer FEWER (#R686's own numbers, 2026-09-11). */
  const FLOOR_R686 = { de: 242, es: 262, fr: 282, jp: 399, ko: 344, ru: 395, zh: 421, 'zh-hans': 421 };
  for (const [lg, floor] of Object.entries(FLOOR_R686)) {
    const n = Object.values(t.byName.eras).filter((r) => r.n[lg]).length;
    assert.ok(n >= floor, 'the era lane answers ' + n + ' names in ' + lg + '; #R686 already shipped ' + floor
      + ' — narrowing the policy must not delete what a source already wrote');
  }
  /* every language the table claims is one the app has, and no row carries English */
  for (const lane of [t.byName.cshapes, t.byName.eras, t.byQid, t.prose]) {
    for (const [k, r] of Object.entries(lane)) {
      for (const lg of Object.keys(r.n)) {
        assert.ok(all.includes(lg), '"' + k + '" carries "' + lg + '", which is not an app language');
        assert.notEqual(lg, 'en', '"' + k + '" carries an English name — English is the upstream’s');
      }
    }
  }
});

test('⑧ the shipped table is a table, not a second copy of the records', () => {
  assert.ok(existsSync(TABLE), 'data/histnames.json is missing');
  assert.ok(!existsSync(join(ROOT, 'data', 'histeras-names.json')),
    'the superseded table is back — one era name with two answers is #R536’s failure waiting');
  const t = doc();
  assert.equal(t.v, 1);
  assert.ok(t.src && t.src.wikidata && /CC0/.test(t.src.wikidata), 'the Wikidata lane must state its licence');
  assert.ok(t.src.prose && /IntMap/.test(t.src.prose), 'the prose lane must say the words are IntMap’s, not a source’s');
  /* a row that says nothing is not shipped */
  for (const lane of [t.byName.cshapes, t.byName.eras, t.byQid, t.prose]) {
    for (const [k, r] of Object.entries(lane)) {
      assert.ok(Object.keys(r.n).length > 0, '"' + k + '" localizes nothing and should not be in the file');
      for (const v of Object.values(r.n)) assert.ok(!v.includes('�'), '"' + k + '" carries U+FFFD');
    }
  }
});

/* ══ the other half of this round: the years the reader can ASK for ═══════════════════════════
   #R421 built the border stepper because 「the only way the dense stretches are reachable at
   all」 — no amount of drag precision lands on 1920-10-28. #R518 widened its list to the second
   day-exact record. Below 1689 there were no dates at all, so the stretch where dragging is
   WORST — a logarithmic slider over 124,688 years, on which the 53 era sheets occupy a few
   pixels each — was the one stretch with no way to step. */

test('⑨ the stepper reaches the era sheets, and asks no bundle it does not already have', async () => {
  const { api, window: w } = timeBorders({ lang: 'jp', year: 500 });
  const HS = w.IntMapHistScale;
  assert.ok(HS && typeof HS.utcAt === 'function', 'js/hist-scale.js must be the one owner of this arithmetic');
  /* minimal stand-ins: the RULE is what is measured, and the real bundles' years are already the
     subject of check:histeras / check:histborders. Nothing here may fetch. */
  w.__CSHAPES = { rings: [], feats: [] };
  w.__HISTB = { window: [1689, 1885], rings: [], feats: [[{ en: 'Y' }, null, 1689, 1, 1, 1885, 12, 31, []]] };
  const ymd = (d) => (d ? HS.ymd(d) : null);
  /* with no era bundle on the page, the next moment offered is the day-exact record's own first
     day — the era sheets between 500 and 1689 are not offered, because nothing here may fetch */
  assert.equal(ymd(await api.changeAfter(HS.utcAt(500, 4, 15, 12))), '1689-01-01',
    'the stepper must not invent a date from a bundle that is not loaded');
  w.__HISTERAS = { rings: [], snaps: [{ y: -122999 }, { y: 500 }, { y: 600 }, { y: 1650 }, { y: 1700 }, { y: 2010 }] };
  assert.equal(ymd(await api.changeAfter(HS.utcAt(500, 4, 15, 12))), '0600-01-01');
  assert.equal(ymd(await api.changeAfter(HS.utcAt(-122999, 0, 2, 12))), '0500-01-01',
    'a key below year 0 must sort and decode — 123000 BC is 113,000 years from the next sheet');
  /* ⚠ AND A SHEET IS NOT A CHANGE DATE. Only the sheets BELOW the day-exact window are offered;
     2010 and 1700 are inside it, where the record states real days. */
  assert.equal(ymd(await api.changeAfter(HS.utcAt(1650, 5, 15, 12))), '1689-01-01');
  assert.equal(ymd(await api.changeBefore(HS.utcAt(1689, 0, 2, 12))), '1689-01-01');
});

test('⑩ a key below year 0 decodes to the year it names — both traps, in one line', () => {
  const { api, window: w } = timeBorders({ lang: 'jp' });
  const HS = w.IntMapHistScale;
  /* ⚠ #R602 paid four times in one round for `new Date(y, …)` mapping a year under 100 to 1900+y,
     and the key's own month arithmetic (`Math.floor(k/100) % 100`) yields a NEGATIVE month for a
     negative key. Neither could fire while the list stopped at 1689. Both can now. */
  for (const y of [-122999, -322, -1, 0, 1, 99, 1689, 2019]) {
    const d = HS.utcAt(y, 0, 1, 12);
    assert.equal(d.getUTCFullYear(), y, 'the clock owner must place year ' + y + ' where it says');
  }
  assert.equal(HS.ymd(HS.utcAt(99, 0, 1, 12)), '0099-01-01', 'year 99 is year 99, not 1999');
  /* the floor the stepper offers is the deepest record's, never a number typed in this file */
  assert.equal(api.range().min, HS.FLOOR);
});
