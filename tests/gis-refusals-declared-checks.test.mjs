/* ============================================================================
 *  gis-refusals-declared — every refusal js/gis-datasets.js answers with is a DECLARED code
 * ----------------------------------------------------------------------------
 *  REFUSALS is what the reader-sentence gate reads as this module's set (#R738, #R819). The time
 *  declaration path answered {time:null, refused} through a private no() that never consulted it,
 *  so a code that path returned but the list forgot was a code no sentence was checked for
 *  (measured: removing 'time-constant-reversed' from REFUSALS failed nothing). The checks below
 *  EVALUATE the module with a code removed from the declaration and require the path that returns
 *  that code to refuse loudly. See dev-notes/2026-09-29-gis-refusals-declared.md.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../js/gis-datasets.js', import.meta.url), 'utf8');

/* the module with one code struck from REFUSALS, evaluated from memory (the file has no imports) */
async function withoutCode(code) {
  const needle = `'${code}'`;
  const at = SRC.indexOf('const REFUSALS');
  assert.ok(at > 0, 'js/gis-datasets.js declares REFUSALS');
  const end = SRC.indexOf('];', at);
  const decl = SRC.slice(at, end);
  assert.ok(decl.includes(needle), `${code} is declared in REFUSALS`);
  const mutated = SRC.slice(0, at) + decl.replace(new RegExp(`${needle},?\\s*`), '') + SRC.slice(end);
  const mod = await import('data:text/javascript;base64,' + Buffer.from(mutated).toString('base64'));
  return mod.makeGisDatasets();
}
const pt = (x, y, p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: p || {} });

const CASES = [
  ['time-constant-reversed', { kind: 'constant', start: '2026-09-17', end: '2020-01-01' }],
  ['time-constant-empty', { kind: 'constant' }],
  ['time-kind-unknown', { kind: 'sometimes' }],
  ['time-field-not-named', { kind: 'instant' }],
  ['time-declaration-not-an-object', 'yesterday'],
];

for (const [code, time] of CASES) {
  test(`the time path returns '${code}' only while it is declared`, async () => {
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const rec = makeGisDatasets().add({ id: 'ok-' + code, title: code, features: [pt(0, 0, {})], time });
    assert.equal(rec.timeRefused && rec.timeRefused.why, code, 'the fixture reaches the refusal it names');
    const D = await withoutCode(code);
    assert.throws(() => D.add({ id: 'x-' + code, title: code, features: [pt(0, 0, {})], time }),
      /undeclared refusal code/, `${code} was returned although REFUSALS no longer declares it`);
  });
}
