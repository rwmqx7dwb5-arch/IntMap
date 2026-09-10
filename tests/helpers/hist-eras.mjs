/* ============================================================================
 *  IntMap · data/hist-eras.js, EVALUATED — the era snapshot record
 * ----------------------------------------------------------------------------
 *  The shipped bundle is a single `window.__HISTERAS = {…}` assignment (the same
 *  shape data/cshapes.js and data/hist-borders.js use), so a check that wants to
 *  know what the map can actually answer with runs it rather than parsing it.
 *  ⚠ ONE READER, because #R679 is the third round in which several checks each
 *  held their own regex over the same file and each broke separately.
 * ==========================================================================*/
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalWithWindow } from './hist-scale.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let cached = null;

/** `window.__HISTERAS` from data/hist-eras.js. */
export function eraBundle() {
  if (cached) return cached;
  const D = evalWithWindow(join(ROOT, 'data', 'hist-eras.js')).__HISTERAS;
  if (!D || !Array.isArray(D.snaps) || !Array.isArray(D.rings)) {
    throw new Error('data/hist-eras.js published no __HISTERAS with snaps and rings');
  }
  cached = D;
  return D;
}
