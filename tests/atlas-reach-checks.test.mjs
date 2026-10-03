/* ============================================================================
 *  atlas-reach — can a request's own words find the capability it needs?   (node --test)
 * ----------------------------------------------------------------------------
 *  The nightly reach instrument (scripts/atlas-eval/reach.mjs on the ops-next branch) measured, 2026-10-03, that the
 *  answer key's own questions reach 34 of the 157 capabilities their correct answers use through find_capability's
 *  lexical search, and only 2 of 74 questions whole. Held here, by running the search the way find_capability does
 *  (js/atlas-toolsurface.js `find`: { want: 3, min: 1 }):
 *    ① a request's PHRASES are evidence: «what is the population of Japan» reaches data.value, whose entry writes
 *      «what is the population of X» — the single words were each in too many blocks to count;
 *    ② a phrase every block writes is worth nothing, by the same df rule as a word, and a greeting still reaches nothing;
 *    ③ the reach over the whole answer key does not fall below what was measured when the phrases arrived
 *      (2026-10-03: 37 of 157 capabilities, 4 of 74 questions whole — raise these when it rises).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { productModules } = await import(pathToFileURL(join(ROOT, 'scripts/atlas-eval/replay.mjs')).href);
const P = await productModules((p) => import(pathToFileURL(join(ROOT, p)).href));
/* the registry as the browser binds it — the catalogue the lexical search reads */
const CAPS = P.makeAtlasCapabilities({});
CAPS.bindRuntime({ docs: P.makeAtlasCatalogText({}, {}), schemas: P.makeAtlasSchemas() });
const FIND = { want: 3, min: 1 };
const ids = (q) => CAPS.search(q, FIND).ranked.map((r) => r.id);

test('① a request\'s phrases are evidence about the entry that writes them', () => {
  const r = ids('what is the population of Japan');
  assert.ok(r.indexOf('data.value') >= 0 && r.indexOf('data.value') < 3, 'data.value, whose entry writes «what is the population of X», is among the first three: ' + r.join(', '));
  assert.equal(ids('measure distance between two places')[0], 'map.measure');
  assert.equal(ids('Draw a line from New York JFK airport to London Heathrow')[0], 'map.drawLine');
});

test('② a phrase is worth what its df says; a greeting still reaches nothing', () => {
  for (const q of ['on the map', 'of the', 'to the']) assert.deepEqual(ids(q), [], q + ' is written in every block and names nothing');
  assert.deepEqual(ids('ありがとう'), []);
  assert.deepEqual(ids('thank you'), []);
});

test('③ the answer key\'s questions reach at least what they reached when the phrases arrived', () => {
  const key = JSON.parse(readFileSync(join(ROOT, 'scripts/atlas-eval/answer-key.json'), 'utf8'));
  let pairs = 0, reached = 0, whole = 0;
  for (const q of key.questions) {
    const want = Array.isArray(q.capabilities) ? q.capabilities.filter((c) => typeof c === 'string' && c) : [];
    if (!want.length || !q.text) continue;
    const got = new Set(ids(q.text));
    pairs += want.length;
    const hit = want.filter((c) => got.has(c)).length;
    reached += hit; if (hit === want.length) whole++;
  }
  assert.ok(reached >= 37, 'capabilities reached by the questions\' own words: ' + reached + ' of ' + pairs + ' (measured 37 on 2026-10-03)');
  assert.ok(whole >= 4, 'questions reaching every capability they need: ' + whole + ' (measured 4 on 2026-10-03)');
});
