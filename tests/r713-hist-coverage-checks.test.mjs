/* ============================================================================
 *  R713 — the historical map asked a second store, and asked for both shapes
 * ----------------------------------------------------------------------------
 *  Two defects of the same kind: a question that was only ever put to ONE place.
 *
 *   ① data/hist-cities.json — scripts/histcities/harvest.mjs read `el.center` off every
 *      Overpass element, and `center` is a thing only a WAY or a RELATION has. The only query
 *      asked for `node`. So that branch had never run, and the 1,425 named, dated settlements
 *      OpenHistoricalMap draws as OUTLINES were not in the record.
 *   ② data/histnames.json — the era lane asked Wikidata for an item carrying the cartographer's
 *      English string and, for 1,208 of 3,029 names, got nothing. The refusal was recorded as
 *      `string-only`, which reads like «the evidence was weak» and actually meant «there was no
 *      candidate to weigh». English Wikipedia's redirects are the same kind of statement held in
 *      a different store, and nobody had asked it.
 *
 *  ⚠ NEITHER FIX IS A LOOSER STRING TEST. #R515 is why: the scorer in scripts/histeras/match.mjs
 *  is untouched, and on the pilot it refused 20 of the 46 names the new store found — 13 of them
 *  `elsewhere`, an article about somewhere the map does not draw that name.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArticles, articlesFor } from '../scripts/histeras/harvest.mjs';
import { coordOf, OHM_PLACE_KINDS, OHM_PLACE } from '../scripts/histcities/harvest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

/* ── ① the sweep asks for every shape the receiver can read ───────────────── */

test('R713 ① every element kind the coordinate reader understands is a kind the sweep asks for', () => {
  /* THE DEFECT, STATED AS ITSELF: the reader understood centres and the query asked for nodes,
     so the half of the reader that handles an outline could not be reached by anything.
     ⚠ Measured from BOTH sides rather than by reading either query's spelling (#R488): what a
     kind can yield is decided by EVALUATING `coordOf`, not by matching text. */
  const shapes = {
    node: { type: 'node', lon: 12.5, lat: 41.9 },
    way: { type: 'way', center: { lon: 12.5, lat: 41.9 } },
    relation: { type: 'relation', center: { lon: 12.5, lat: 41.9 } },
  };
  for (const [kind, el] of Object.entries(shapes)) {
    if (!coordOf(el)) continue;              /* the reader cannot use it — nothing to ask for */
    assert.ok(OHM_PLACE_KINDS.includes(kind),
      'coordOf() reads a coordinate off a ' + kind + ', so the OHM sweep must ask for ' + kind + 's');
  }
  /* and the reader really does understand all three — otherwise the loop above proves nothing */
  assert.deepEqual(Object.keys(shapes).filter((k) => coordOf(shapes[k])), ['node', 'way', 'relation']);
});

test('R713 ① an element with neither a coordinate nor a centre is refused, not defaulted', () => {
  assert.equal(coordOf({ type: 'way', tags: { name: 'x' } }), null);
  assert.equal(coordOf({ type: 'node', lon: 1 }), null);        /* half a coordinate is not one */
  assert.equal(coordOf(null), null);
  assert.deepEqual(coordOf({ type: 'node', lon: 0, lat: 0 }), [0, 0]);   /* ⚠ 0 IS a coordinate */
});

test('R713 ① both sweeps ask about the same kind of place, spelled once', () => {
  assert.match(OHM_PLACE, /city/);
  assert.match(OHM_PLACE, /hamlet/);
  const src = readFileSync(join(ROOT, 'scripts/histcities/harvest.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   /* ⚠ #R621: strip comments first */
  const spelled = src.split(OHM_PLACE).length - 1;
  assert.equal(spelled, 1,
    'the place filter is spelled ' + spelled + ' times outside comments; it belongs in OHM_PLACE '
    + 'alone, because a second copy is a second answer (#R536)');
});

/* ── ② the second attestation store ───────────────────────────────────────── */

const page = (title, qid, extra) => ({ title, pageprops: Object.assign({}, qid ? { wikibase_item: qid } : null, extra) });

test('R713 ② a title is followed through normalisation and a redirect CHAIN, not one hop', () => {
  const q = {
    normalized: [{ from: 'etrurians', to: 'Etrurians' }],
    redirects: [{ from: 'Etrurians', to: 'Etruscans' }, { from: 'Etruscans', to: 'Etruscan civilization' }],
    pages: { 1: page('Etruscan civilization', 'Q17161') },
  };
  /* walking one step lands on «Etruscans», which has no page here, and the name would be
     silently unanswered — the quiet direction of getting a chain wrong. */
  assert.deepEqual([...resolveArticles(['etrurians'], q)], [['etrurians', 'Q17161']]);
});

test('R713 ② a redirect cycle terminates instead of hanging the build', () => {
  const q = { redirects: [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }], pages: { 1: page('A', 'Q1') } };
  assert.doesNotThrow(() => resolveArticles(['A'], q));
});

test('R713 ② a disambiguation page is not an article, and a missing page is not one either', () => {
  const q = {
    pages: {
      1: page('Ainu', 'Q226570', { disambiguation: '' }),
      2: { title: 'Nowhere', missing: '' },
      3: page('Meroe', 'Q182878'),
    },
  };
  assert.deepEqual([...resolveArticles(['Ainu', 'Nowhere', 'Meroe'], q)], [['Meroe', 'Q182878']]);
});

test('R713 ② a name the API cannot be asked about is skipped, not mangled into another question', async () => {
  /* `|` divides the batch and `#` starts a fragment: asking either would return an answer about
     a DIFFERENT page and the name would be confidently mislabelled. With nothing askable the
     function makes no request at all — which is what keeps this test offline. */
  assert.equal((await articlesFor(['a|b', 'c#d', 'x'.repeat(300)])).size, 0);
  assert.equal((await articlesFor([])).size, 0);
});

/* ── the shipped table says which store answered ──────────────────────────── */

test('R713 the lane ledger in data/histnames.json counts the rows that are actually there', () => {
  /* ⚠ #R699: a number written INSIDE the check is not a number being checked. Both sides here
     are derived from the shipped document, so the ledger cannot drift away from the table. */
  const t = read('data/histnames.json');
  const rows = Object.values(t.byName).reduce((n, rec) => n + Object.keys(rec).length, 0);
  assert.equal(t.lanes.label + t.lanes.article, rows);
  assert.equal(t.lanes.qid, Object.keys(t.byQid).length);
});

test('R713 the second store is actually consulted for the era names', () => {
  /* THE DEFECT, NOT THE ANSWER (#R520): what was wrong was that one store was asked and its
     silence was recorded as a verdict. «More than zero» is what says the second store is in the
     path at all; the exact count is the build's to report and may move with upstream. */
  const t = read('data/histnames.json');
  assert.ok(t.lanes.article > 0, 'no row is attested by en.wikipedia — the lane is not running');
});
