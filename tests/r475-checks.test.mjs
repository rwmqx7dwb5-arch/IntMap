/* ============================================================================
 *  #R475 — a registry size that was typed, in a tier that never stood in front of a push
 * ----------------------------------------------------------------------------
 *  tests/r318-atlas.spec.js R406 ① pinned `window.IntMapCapabilities.all().length` to a literal.
 *  MEASURED, by building js/atlas-capabilities.js at each commit that touched it:
 *
 *      fa924f6  #R413                       126   — the day #R406 typed the number
 *      616e549  #R439  + layers.isobars     127   — RED, on every nightly, for eleven days
 *      30d1a7c  #R469  − sim.slopeAspect    126   — GREEN again, and nobody touched the test
 *
 *  Both moves were correct product work, neither round opened the spec, and the second REPAIRED
 *  the alarm by accident. A verdict that flips red and back on rounds that never looked at it is
 *  not measuring what its name says. What R406 ① is for is the JOIN — that the registry the source
 *  declares is the registry the built bundle answers with — so it asks that instead, against
 *  tests/helpers/atlas-registry.mjs: the IDS, not the size, because a swapped id has the same
 *  length. (#R433 wrote the rule this obeys: the answer to a stale constant is never a bigger
 *  constant. CONSTITUTION.md §5.)
 *
 *  ⚠ THE SWEEP IS WIDER THAN THE ONE LINE (#R429). A check aimed at the file that failed is why
 *  this survived: #R433 fixed R406 ② in this very file, three assertions below ①, and left ① as it
 *  was. ② here reads EVERY test that touches the registry and refuses an EQUALITY between its size
 *  and an integer literal, wherever it is written.
 *
 *  ⚠ A FLOOR IS NOT THIS DEFECT. `assert.ok(all.length >= 126)` in tests/r406-checks ④ says «the
 *  registry must not shrink» — a deliberate ratchet that adding a capability cannot break. The
 *  trap is the EQUALITY, which nothing can satisfy for long. ② draws the line exactly there.
 *
 *  ⚠ THE FIXTURES ARE ASSEMBLED, NOT WRITTEN (#R345, one turn further). ② proves it can fire by
 *  feeding the scanner the line as it shipped — and a check that spells its own trap is a check
 *  that condemns itself, which is what the first draft of this file did. `codeOnly` strips
 *  comments, not string literals, so the fixtures are built from pieces and never appear whole.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { declaredCapabilityIds } from './helpers/atlas-registry.mjs';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

/* ══ THE SCANNER ══════════════════════════════════════════════════════════════════════════════
   The idiom has two halves and they are not adjacent — in the shipped line they were six lines
   apart, so a proximity grep would have found nothing. It is read the way it is written: first,
   which names carry a registry size (`caps: C.all().length`) or the list itself (`const all =
   CAPS.all()`); then, whether any of those — or the expression inline — is put on one side of an
   EQUALITY with an integer literal. Bounds are deliberately not in the pattern set. */
const SIZE_OR_LIST = /(?:\b(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*[:=]\s*[A-Za-z_$][\w$]*\.all\(\)(\.length)?(?![\w$])/g;
const EQ = (expr) => new RegExp(
  String.raw`expect\(\s*(?:[\w$]+\.)?${expr}\s*(?:,[^()]*)?\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\d+\s*\)`
  + String.raw`|assert\s*\.\s*(?:equal|strictEqual|deepEqual|deepStrictEqual)\s*\(\s*(?:[\w$]+\.)?${expr}\s*,\s*\d+\s*\)`
  + String.raw`|(?:[\w$]+\.)?${expr}\s*===?\s*\d+`, 'g');
const INLINE = String.raw`[A-Za-z_$][\w$]*\.all\(\)\.length`;

/** Every place `src` pins a `.all()` registry size to an integer literal, as readable strings. */
export function pinnedRegistrySizes(src) {
  const code = codeOnly(src);
  const exprs = [INLINE];
  for (const m of code.matchAll(SIZE_OR_LIST)) exprs.push(m[2] ? m[1] : m[1] + String.raw`\.length`);
  const hits = new Set();
  for (const e of exprs) for (const m of code.matchAll(EQ(e))) hits.add(m[0].replace(/\s+/g, ' '));
  return [...hits];
}

/* the registry's own spellings — a test that never names it is not in this sweep's business */
const TOUCHES_REGISTRY = /IntMapCapabilities|makeAtlasCapabilities|atlas-registry|atlas-capabilities/;

/* ── ① the built app's registry claim is DERIVED, and the derivation is faithful ──────────── */
test('R475 ①: R406 ① compares the built registry against the declared one, not against a number', () => {
  const spec = codeOnly(R('tests/r318-atlas.spec.js'));
  assert.match(spec, /declaredCapabilityIds\(\)/,
    'tests/r318-atlas.spec.js stopped deriving the registry it compares against');
  assert.deepEqual(pinnedRegistrySizes(R('tests/r318-atlas.spec.js')), [],
    'the typed registry size is back in the spec #R475 derived');

  /* the helper is the registry ASKED, not a second hand-written list — #R318's whole point */
  const ids = declaredCapabilityIds();
  assert.ok(ids.length > 0, 'the helper reports an empty registry');
  assert.deepEqual(ids, makeAtlasCapabilities({}).all().map((c) => c.id).sort(),
    'tests/helpers/atlas-registry.mjs no longer reports what js/atlas-capabilities.js declares');
  assert.doesNotMatch(codeOnly(R('tests/helpers/atlas-registry.mjs')), /['"][a-z]+\.[A-Za-z]+['"]/,
    'the helper started spelling capability ids of its own — that is the second list again');
});

/* ── ② the sweep is every test that names the registry, and it can be made to fire ────────── */
test('R475 ②: no test pins the capability registry to an integer, and this check catches one', () => {
  const N = '126', L = '.leng' + 'th';   /* assembled, so this file is not its own offender */
  const twoHalves = 'const r = { caps: C.all()' + L + ' };\nexpect(r.caps).toBe(' + N + ');';
  const inline = 'expect(C.all()' + L + ').toBe(' + N + ');';
  const nodeSide = 'const all = CAPS.all();\nassert.equal(all' + L + ', ' + N + ');';
  const floor = 'const all = CAPS.all();\nassert.ok(all' + L + ' >= ' + N + ', "the registry shrank");';

  assert.equal(pinnedRegistrySizes(twoHalves).length, 1, 'the scanner cannot see the line this round removed');
  assert.equal(pinnedRegistrySizes(inline).length, 1, 'the scanner cannot see the pin written inline');
  assert.equal(pinnedRegistrySizes(nodeSide).length, 1, 'the scanner cannot see the node spelling of the same pin');
  assert.deepEqual(pinnedRegistrySizes(floor), [],
    'the sweep is condemning ratchets — tests/r406-checks ④ is a floor, not a pin');

  const offenders = [];
  for (const f of readdirSync(join(ROOT, 'tests')).filter((n) => /\.(spec\.js|test\.mjs)$/.test(n))) {
    const src = R(join('tests', f));
    if (!TOUCHES_REGISTRY.test(src)) continue;
    const hits = pinnedRegistrySizes(src);
    if (hits.length) offenders.push(`${f}: ${hits.join(' · ')}`);
  }
  assert.deepEqual(offenders, [],
    'a capability-registry size is pinned to an integer literal again — derive it from js/atlas-capabilities.js (#R433)');
});
