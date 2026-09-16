/* ============================================================================
 *  IntMap · どの実装が答えを出したのか (#R749)
 * ----------------------------------------------------------------------------
 *  js/gis-project.js saves a derived dataset as its RECIPE — op, inputs, params — and replays it on
 *  load, because a recipe replays and a stored answer goes stale the moment its input changes
 *  (docs/GIS-CORE.md §4). That is the right design and it has a consequence that went unstated for
 *  the life of the feature: THE SAME RECIPE IS NOT THE SAME ANSWER ACROSS IMPLEMENTATIONS.
 *
 *  MEASURED: #R743 changed what js/gis-geometry.js's union RETURNS (disjoint parts had been dropped
 *  entirely; overlapping land had been double-counted) and what js/gis-ops.js's distance prefilter
 *  KEEPS (true pairs off the equator were discarded before any distance was measured). A project
 *  saved the week before reopens today with different numbers in it. Nothing in the record said so,
 *  and nothing could: there was no version to record.
 *
 *  So each kernel declares one — js/gis-ops.js and js/gis-geometry.js both hold KERNEL_VERSION and
 *  publish version() — and js/gis-project.js writes it into every op step it saves.
 *
 *  ⚠ A DECLARED VERSION IS A CLAIM, AND A CLAIM NEEDS A KEEPER. A hand-maintained number drifts the
 *  first time somebody edits a kernel and forgets it, and a drifted one is WORSE than none: it tells
 *  a reader 「同じエンジンです」 about an engine that has changed. So this file records the hash of
 *  each kernel beside the version it was declaring, and tests/r749-gis-raster-pipeline-checks fails
 *  when the code moved and the version did not.
 *
 *  ⚠ WHEN THAT GATE FAILS THERE ARE EXACTLY TWO HONEST FIXES, and choosing between them is the whole
 *  point of the gate:
 *    · the edit can change an ANSWER (a different result, a different refusal, a different
 *      tolerance) → raise the version here AND in the kernel, then record the new hash;
 *    · the edit cannot (a comment, a rename, a faster walk over the same arithmetic) → record the
 *      new hash and leave the version alone.
 *  ⚠ THE HASH IS OF LINE-ENDING-NORMALISED TEXT. This repository is checked out with CRLF on
 *  Windows and LF in CI, and a gate whose verdict depends on which machine ran it is the failure
 *  [[intmap-gate-verdict-must-not-depend-on-the-runner]] records — measured there on AGENTS.md,
 *  green in CI and red on the author's machine for 415 bytes of carriage returns. The subject here
 *  is the code, not the bytes on disk.
 *
 *  何を測っているか: docs/TESTING.md ／ 版そのものの意味: docs/GIS-CORE.md §4.
 * ==========================================================================*/

import { createHash } from 'node:crypto';

/* file → the version it declared when this hash was recorded. */
export const KERNELS = {
  'js/gis-ops.js': { version: 'ops-1', sha256: 'd4e2a2a93ecb2cc9b5950f929ebb37cab515f2d2697bea2c39baf023ae959b06' },
  'js/gis-geometry.js': { version: 'geom-1', sha256: '09610b77fd09d892ef9b0173cfe94fef666e170c07860dc4abb946790ad9549c' },
};

/* The hash the gate compares. ⚠ One implementation, called by the recorder and by the check — two
   spellings of 「この版のハッシュ」 would disagree the first time either was touched. */
export function kernelHash(text) {
  return createHash('sha256').update(String(text).split('\r\n').join('\n'), 'utf8').digest('hex');
}

/* The version a kernel's source DECLARES, read out of the source itself rather than imported: the
   check must be able to compare the file on disk against this ledger without evaluating a module
   that reaches for `window`. Returns null when the declaration is absent, which the gate reports as
   a missing declaration rather than as a match. */
export function declaredVersion(text) {
  const m = /const\s+KERNEL_VERSION\s*=\s*'([^']+)'/.exec(String(text));
  return m ? m[1] : null;
}
