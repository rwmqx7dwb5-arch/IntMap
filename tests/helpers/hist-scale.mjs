/* ============================================================================
 *  IntMap · js/hist-scale.js, EVALUATED — for every check that needs the clock's floor
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ WHY THIS FILE EXISTS: THE SAME CHECK BROKE THE SAME WAY TWICE.
 *  #R604 lowered the clock's floor from 1850 to 1. `tests/r380-checks.test.mjs`
 *  read that floor with `/const YMIN\s*=\s*(\d{4})\s*;/.exec(...)[1]`, the regex
 *  stopped matching, `.exec()` returned null, and the file threw AT IMPORT — so
 *  every sweep in it, including the one that polices exactly this kind of drift,
 *  silently stopped running on the round it was written for. #R604 fixed the
 *  regex (`\d{1,4}`).
 *  #R679 moved the floor below year 0 and into js/hist-scale.js, and the SAME
 *  line threw again, for the third variation of the same reason. Two other files
 *  (r349, r518) held their own copies of that regex and broke with it.
 *
 *  ⚠ THE DEFECT IS NOT THE REGEX. It is that a check READS SOURCE to learn a
 *  value (#R505): source-reading cannot see what a program computes, it breaks
 *  when the value moves, and it breaks SILENTLY when it breaks at import. So the
 *  floor is obtained the way the app obtains it — by evaluating its owner — and
 *  every check reads it from here. When the floor moves again, nothing in tests/
 *  has to be edited, and if the owner stops publishing one, every reader fails
 *  LOUDLY instead of one file going quiet.
 *
 *  ⚠ NO DOM, NO MAP, NO CLOCK, NO LANGUAGE — that is js/hist-scale.js's own
 *  stated invariant, and it is the property that makes this two lines instead of
 *  a browser.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ⚠ runInThisContext, NOT vm.createContext. A fresh context is a fresh REALM, so
   everything the module builds carries that realm's prototypes — and
   node:assert/strict compares prototypes, which makes `assert.deepEqual(x, [])`
   fail on two empty arrays with "same structure but not reference-equal".
   Measured here. These modules assign to `window` and touch nothing else, so
   lending them one for the length of the call is the whole sandbox they need. */
function evalWithWindow(file) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const prev = globalThis.window;
  globalThis.window = {};
  try {
    vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });
    return globalThis.window;
  } finally {
    if (had) globalThis.window = prev; else delete globalThis.window;
  }
}

/** js/hist-scale.js's public object, evaluated. */
export function histScale() {
  const HS = evalWithWindow(join(ROOT, 'js', 'hist-scale.js')).IntMapHistScale;
  if (!HS || typeof HS.utcAt !== 'function') throw new Error('js/hist-scale.js published no IntMapHistScale');
  return HS;
}

/** The clock's floor, as an astronomical year (negative = before the common era). */
export function clockFloor() {
  const v = histScale().FLOOR;
  if (!Number.isFinite(v)) throw new Error('js/hist-scale.js publishes no numeric FLOOR');
  return Math.round(v);
}

export { evalWithWindow };
