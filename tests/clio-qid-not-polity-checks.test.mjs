/* ============================================================================
 *  (clio-qid-not-polity) a Cliopatria QID must be an item about the world before it can be the polity drawn.
 *  Measured 2026-10-05: «Gothia» (207–383) shipped Q422253, a Wikimedia disambiguation page — it has no
 *  lifespan and its label is the row's name, so the label test of scripts/build-hist-clio.mjs `verifiedQid`
 *  passed it; 24 name/QID pairs on 103 shipped rows were Wikimedia-internal items. The defect stated here is
 *  the CLASS of item (anything Wikidata files below its Wikimedia-internal root), not the one name.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifiedQid, WIKIMEDIA_INTERNAL } from '../scripts/build-hist-clio.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rec = JSON.parse(readFileSync(join(ROOT, 'scripts', 'histclio', 'wikidata.json'), 'utf8'));
const load = (rel, g) => { const w = {}; new Function('window', readFileSync(join(ROOT, rel), 'utf8'))(w); return w[g]; };

test('① a Wikimedia-internal item is refused by both identity tests — the label test and the lifespan test', () => {
  const facts = {
    Q1: { l: 'Gothia', c: ['Q4167410'], i: 1 },                 /* label equals the row's name, no lifespan */
    Q2: { l: 'Somewhere', s: [200], e: [400], c: ['Q13406463'], i: 1 }, /* a lifespan that overlaps */
    Q3: { l: 'Gothia' },                                          /* the same item without the class verdict */
  };
  assert.equal(verifiedQid('Q1', 'Gothia', [207, 383], facts), false, 'a disambiguation page passed the label test');
  assert.equal(verifiedQid('Q2', 'Somewhere', [207, 383], facts), false, 'a list article passed the lifespan test');
  assert.equal(verifiedQid('Q3', 'Gothia', [207, 383], facts), true, 'the label test itself must still work');
});

test('② the committed facts were fetched with the class question, against Wikidata\'s own root', () => {
  assert.equal(rec.internal, WIKIMEDIA_INTERNAL, 'scripts/histclio/wikidata.json does not say it asked the class question');
  const all = Object.values(rec.facts);
  assert.ok(all.some((f) => Array.isArray(f.c) && f.c.length), 'no item carries its P31 — the class question was not asked');
  /* every refused item carries the classes the refusal was read from */
  for (const [q, f] of Object.entries(rec.facts)) if (f.i) assert.ok(Array.isArray(f.c) && f.c.length, q + ' is refused with no P31 to read the verdict from');
});

test('③ no shipped Cliopatria row carries a Wikimedia-internal QID, and the names table does not translate by one', () => {
  const d = load('data/hist-clio.js', '__HISTCLIO');
  const bad = [...new Set(d.feats.filter((f) => f[1] && rec.facts[f[1]] && rec.facts[f[1]].i).map((f) => f[0].en + ' ' + f[1]))];
  assert.deepEqual(bad, [], 'shipped rows bound to a Wikimedia-internal item');
  /* the names table may hold such a QID only when ANOTHER record states it — never because Cliopatria did */
  const names = JSON.parse(readFileSync(join(ROOT, 'data', 'histnames.json'), 'utf8')).byQid;
  const clioQ = new Set(d.feats.map((f) => f[1]).filter(Boolean));
  const internal = Object.keys(rec.facts).filter((q) => rec.facts[q].i);
  const others = new Set([...load('data/hist-borders.js', '__HISTB').feats, ...load('data/hist-borders-late.js', '__HISTBLATE').feats].map((f) => f[1]).filter(Boolean));
  assert.deepEqual(internal.filter((q) => names[q] && !others.has(q) && !clioQ.has(q)), [], 'data/histnames.json still translates by a QID only the refused Cliopatria rows named');
});
