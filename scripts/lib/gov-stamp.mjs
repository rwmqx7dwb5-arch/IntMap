/* ============================================================================
 *  IntMap · scripts/lib/gov-stamp.mjs — A BUILDER'S DECLARED PROVENANCE MUST BE WHAT IT JUST MEASURED   (geopolitics-layers)
 * ----------------------------------------------------------------------------
 *  A builder states its bundle's provenance as LITERALS in `export const GOVERNANCE` (check:datagov reads them without running the
 *  builder): the day it read the upstream, the day it wrote, and the counts measured on the rows. This is the one check that the
 *  literals and the bytes agree — the convention scripts/build-hist-urban.mjs states in its compile(): a rebuild on another day,
 *  or one whose counts moved, refuses to write until the declaration is restated. Nothing is adjusted to make them agree.
 * ==========================================================================*/
import { measureQuality } from '../../js/data-governance.js';

/** decl: the GOVERNANCE entry; rows/opts: what measureQuality measures; day: today (YYYY-MM-DD) → decl, or throws */
export function agreeOrRefuse(decl, rows, opts, day) {
  const q = measureQuality(rows, opts);
  const bad = [];
  if (JSON.stringify(q) !== JSON.stringify(decl.quality)) bad.push('quality measured ' + JSON.stringify(q) + ', declared ' + JSON.stringify(decl.quality));
  if (decl.generatedAt !== day) bad.push('generatedAt declared ' + decl.generatedAt + ', written ' + day);
  if (bad.length) throw new Error(decl.builtBy + ': restate GOVERNANCE before writing — ' + bad.join('; '));
  return decl;
}
