/* ============================================================================
 *  R714 — a river is not a polity, and the obvious wider fix deletes countries
 * ----------------------------------------------------------------------------
 *  Found in PRODUCTION, not by a test: at 1500 with the interface in Japanese the polity drawn as
 *  «Aragón» was labelled 「アラゴン川」 — the Aragon RIVER. Nothing was broken. The river carries
 *  the exact English string, Wikidata states a coordinate for it, that coordinate falls INSIDE the
 *  shape the map draws for the name, and a river states no inception date for the clock to
 *  disagree with. Every agreement the scorer asks for is genuinely true — of the river.
 *
 *  ⚠ SO THE FIX BELONGS WHERE «WHAT KIND OF THING IS THIS» IS ALREADY DECIDED, not in the scorer's
 *  agreement tests and not in a list of two names. scripts/histeras/harvest.mjs REJECT_ROOTS names
 *  ROOTS and lets `wdt:P279*` find what is under them (#R695's rule, and the reason a list would be
 *  the edit .agents/rules/no-ad-hoc-hardcoding.md exists to prevent).
 *
 *  ⚠⚠⚠ AND THE ROOT HAD TO BE MEASURED BEFORE IT WAS CHOSEN. The obvious one — landform, or body
 *  of water — is catastrophic: Wikidata classes ISLAND COUNTRIES under it, and on the 858 shipped
 *  rows that closure catches 53, the United Kingdom, Ireland, Iceland, New Zealand, the
 *  Philippines, Cuba and Singapore among them. It would delete a twentieth-century country's name
 *  in eight languages to fix two rivers. `watercourse` catches exactly two, and they are the two
 *  that were wrong.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { score, decide, FLOOR } from '../scripts/histeras/match.mjs';
import { REJECT_ROOTS } from '../scripts/histeras/harvest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = JSON.parse(readFileSync(join(ROOT, 'data/histnames.json'), 'utf8'));

/* the row the map draws: one box around the shape, one century */
const row = { name: 'Aragón', y0: 1400, y1: 1500, boxes: [[-1.5, 41.0, 0.5, 42.5]] };
const YEARS = [1300, 1400, 1500, 1600];
/* a candidate that agrees with the map PERFECTLY on every test the scorer makes */
const perfect = (extra) => ({ qid: 'Q1', exact: true, coord: [-0.7, 42.1], starts: [], ends: [],
  p31: ['Qkind'], geo: true, subject: true, ...extra });

test('R714 ① a perfectly agreeing candidate is still refused when its KIND is not one the map draws', () => {
  /* ⚠ THE POINT IS THAT AGREEMENT IS NOT THE DISPUTED PART. Space agrees, the clock has nothing
     to disagree with, the spelling is exact — and the verdict must still be «not a place». If
     this ever passes on agreement alone, 「アラゴン川」 is back. */
  const agreeing = score(row, perfect(), new Set(), YEARS);
  assert.equal(agreeing.why, null, 'the fixture must agree, or the next assertion proves nothing');
  assert.ok(agreeing.points >= FLOOR);

  const refused = score(row, perfect(), new Set(['Qkind']), YEARS);
  assert.equal(refused.why, 'not-a-place');
  assert.equal(refused.points, null);
});

test('R714 ② the refusal is by KIND, so it reaches the next one nobody has met', () => {
  /* a second, unrelated class under the same root is refused by the same set — there is no list
     of items here, which is what makes the rule reach rivers nobody has looked at yet */
  const other = score(row, perfect({ qid: 'Q2', p31: ['Qother'] }), new Set(['Qkind', 'Qother']), YEARS);
  assert.equal(other.why, 'not-a-place');
  /* and a kind that is NOT under the root is untouched */
  assert.equal(score(row, perfect({ qid: 'Q3', p31: ['Qfine'] }), new Set(['Qkind']), YEARS).why, null);
});

test('R714 ③ removing the refused candidate lets the real one win instead of deadlocking', () => {
  /* measured on the rebuild: dropping the river did not merely delete two rows — «Raška» and
     «Sintashta» had been losing to a no-clear-winner TIE against the river carrying their name,
     and both resolve once it is gone. A refusal that only ever subtracts would have missed that. */
  const river = perfect({ qid: 'Qriver', p31: ['Qwater'] });
  const polity = perfect({ qid: 'Qpolity', p31: ['Qfine'] });
  assert.equal(decide(row, [river, polity], new Set(), YEARS).qid, null, 'two equals must tie');
  assert.equal(decide(row, [river, polity], new Set(['Qwater']), YEARS).qid, 'Qpolity');
});

test('R714 ④ the watercourse root is declared, and the catastrophic ones are NOT', () => {
  /* ⚠ #R520: state the DEFECT, not the answer. The defect a future round could reintroduce is
     reaching for the wider root — so this names the roots that must never appear, and says why. */
  assert.ok(REJECT_ROOTS.includes('Q355304'), 'watercourse is the root that refuses a river');
  for (const wide of ['Q271669', 'Q15324']) {
    assert.equal(REJECT_ROOTS.includes(wide), false,
      wide + ' (landform / body of water) classes ISLAND COUNTRIES — declaring it deletes the '
      + 'United Kingdom, Ireland, Iceland, New Zealand, the Philippines, Cuba and Singapore');
  }
});

test('R714 ⑤ the shipped table still answers for the island countries that root would have taken', () => {
  /* the measurement above, held against the bytes that ship: these rows exist, so nobody has
     quietly widened the root since. They are named because the failure is about THESE rows —
     the 53 the wider closure catches — and a count would not say which ones went. */
  const cs = TABLE.byName.cshapes;
  for (const n of ['United Kingdom', 'Ireland', 'Iceland', 'New Zealand', 'Philippines', 'Cuba', 'Singapore']) {
    assert.ok(cs[n] && Object.keys(cs[n].n).length > 0, n + ' lost its localized name');
  }
});

test('R714 ⑥ no row is left naming the rivers that were wrong', () => {
  assert.equal(TABLE.byName.eras['Aragón'], undefined);
  assert.equal(TABLE.byName.eras['Narva'], undefined);
});
