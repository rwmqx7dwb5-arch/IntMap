/* ============================================================================
 *  IntMap · どの実装が答えを出したのか (#R749 · 台帳を発見される集合にした #R752)
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
 *  So each kernel declares one — KERNEL_VERSION, published as version() — and js/gis-project.js
 *  writes it into every op step it saves.
 *
 *  ⚠ A DECLARED VERSION IS A CLAIM, AND A CLAIM NEEDS A KEEPER. A hand-maintained number drifts the
 *  first time somebody edits a kernel and forgets it, and a drifted one is WORSE than none: it tells
 *  a reader 「同じエンジンです」 about an engine that has changed. So this file records the hash of
 *  each kernel beside the version it was declaring, and tests/r749-gis-raster-pipeline-checks fails
 *  when the code moved and the version did not.
 *
 *  ⚠⚠⚠ AND #R752 FOUND THE KEEPER ITSELF WAS A HAND-WRITTEN LIST — the exact shape
 *  .agents/rules/no-ad-hoc-hardcoding.md forbids: 「手で並べた一覧は、次に足されたものを黙って落とす」.
 *  KERNELS held two entries. It had been wrong since the hour it was written: THE SAME ROUND that
 *  introduced it introduced js/gis-raster.js and js/gis-warp.js, and neither was in it. So the
 *  sampling rule behind every `sample`, `zonal` and resample step could change and this gate stayed
 *  green; js/gis-expr.js could change what `compute` computes; js/gis-index.js is the prefilter
 *  #R743 caught DISCARDING TRUE PAIRS, which is an answer changing.
 *
 *  ⇒ THE MEMBERSHIP IS NOW DISCOVERED, AND EVERY GIS MODULE MUST BE IN EXACTLY ONE OF TWO SETS:
 *    · it declares KERNEL_VERSION → it is recorded here, hash and version, and the gate compares;
 *    · it is named in NOT_A_KERNEL with a STATED REASON → it cannot change a number.
 *  A file in js/gis-*.js that is in neither fails the gate. That is the difference between an
 *  omission and a decision: adding js/gis-something.js tomorrow cannot silently be neither.
 *
 *  ⚠ WHEN THE HASH GATE FAILS THERE ARE EXACTLY TWO HONEST FIXES, and choosing between them is the
 *  whole point of the gate:
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

/* file → the version it declared when this hash was recorded. ⚠ MEMBERSHIP IS NOT DECIDED HERE — it
   is decided by the source declaring KERNEL_VERSION. This map is the ledger of what was recorded,
   and the gate reports a declaring file that is missing from it as an unrecorded kernel. */
export const KERNELS = {
  /* ⚠ (#R752) `ops-1` IS DELIBERATELY NOT RAISED, and the choice is the one this gate exists to
     force. The round added eight ops and moved `sample`'s method list from a copy here to the kernel
     that owns it — but no recipe that ran before produces a different number now: the arithmetic of
     filter, buffer, clip, overlay, relate, aggregate, sample and zonal is untouched, and a saved step
     naming `nearest` still resamples with nearest. New capability is not a changed answer. */
  /* (#R756) ops-1 -> ops-2: `rasterize` burned the whole bounding box of every point, line and
     Multi geometry (a diagonal across a 16x16 lattice lit all 256 cells) and now burns the cells
     the feature actually touches. A project saved before today replays to a DIFFERENT GRID, which
     is the one thing this version exists to announce. */
  'js/gis-ops.js': { version: 'ops-2', sha256: '0c9699533e5cd032dc0ea0d493dbd8ef28d78f9708281d19425e60f98ce5b3a9' },
  /* `geom-1` likewise: validate() and repair() are new doors, and the boolean engine behind union,
     intersection and difference was measured unchanged over 800,000 pairs. */
  'js/gis-geometry.js': { version: 'geom-1', sha256: '675be6ca448ed2a47d3f1baf7a755362b4e69e3a10b5427b6bc8c94cfcfba157' },
  /* The five below are FIRST declarations, not bumps — they are the kernels #R749 built and never
     recorded, plus the two that were older than the record and outside it. There is nothing to
     compare them against in a project saved before today, which is why a load of such a project
     now answers `unknown` for them rather than `same`. */
  /* (#R756) HASH ONLY, VERSION LEFT ALONE -- 'a faster walk over the same arithmetic'. The pixel
     loops of mask/diff/combine/merge/zonal were folded into one paced walk so a long run can be
     cancelled; not one operation changed, and tests/r754-gis-raster-cancel-checks measures a run
     with a never-cancelling ctx against the same run with no ctx at all, pixel for pixel. */
  'js/gis-raster.js': { version: 'raster-1', sha256: 'fbc830d56deea70c6b43f0a4369be1f26e35bfdbf17c5c27ae005da515b6c41c' },
  /* (#R756) Hash only, for the same reason: the output-pixel loop now yields through the same
     paced walk, and the per-row cancel that had been unreachable code since #R749 is reached. */
  'js/gis-warp.js': { version: 'warp-1', sha256: '4c7eef1f06a84a9b691cce2559d7de37ba8fe5577ee2f58864b2e19ca50e78f2' },
  'js/gis-expr.js': { version: 'expr-1', sha256: 'd9cf9ebb9d47924abe53d5ce4a318c29ca8d2db8622a12b98b2f6228a70630ee' },
  'js/gis-index.js': { version: 'index-1', sha256: '580cf1a49be665d6d8ac2ca825d08bc8b32d85e3e30df44ec103cd01810c34cd' },
  /* (#R756) crs-1 -> crs-2: a refusal became an answer. The azimuthal equidistant plane was
     implemented and unreachable (it holds no EPSG code, and `measure` takes its plane as text), so
     `planeSpec()` now reads the spellings out of the PLANES table itself -- 'aeqd:<lon0>,<lat0>'
     and 'mollweide:<lon0>' name planes that were refused yesterday. A saved recipe naming one of
     those replays to a number where it used to replay to a refusal. */
  'js/gis-crs.js': { version: 'crs-2', sha256: '14475b714e3076d06ac52524f38caf5dff635b62b128c501d9f21cecafec72e4' },
};

/* ⚠ THE OTHER HALF, AND IT IS THE HALF THAT MAKES THE FIRST ONE A RULE. A GIS module that is not a
   kernel must say WHY it cannot change a number, here, once. A reason is reviewable; an absence is
   not — and an absence is what let four answer-bearing kernels sit outside the ledger for a whole
   round. ⚠ 「まだ版を付けていない」 is not a reason. If it can change an answer it declares a version. */
export const NOT_A_KERNEL = {
  'js/gis-core.js': 'mounts the modules and draws a dataset on the map; computes nothing',
  'js/gis-panel.js': 'draws the screen out of the declarations; no arithmetic of its own',
  'js/gis-export.js': 'a writer of bytes — it reads no recipe and produces no answer a saved project replays; a re-export is a new file, not a replay',
  'js/gis-project.js': 'stores and replays recipes — it is the READER of these versions',
  'js/gis-atlas.js': 'the Atlas-facing surface; resolves refs and forwards to the ops',
  'js/gis-datasets.js': 'the registry and the column-typing contract, not an answer to a step',
  'js/gis-sources.js': 'where data is acquired FROM; what it served is reported in `coverage`, which travels with the answer rather than in the engine record',
  'js/gis-layers.js': 'the bridge to what the renderer holds; same reason as js/gis-sources.js',
  'js/gis-shapefile.js': 'a reader of bytes — what it decoded is the dataset, and a re-import is a new import, not a replay',
  'js/gis-geopackage.js': 'a reader of bytes; same reason as js/gis-shapefile.js',
  'js/gis-geotiff.js': 'a reader of bytes; same reason as js/gis-shapefile.js',
  'js/gis-worker.js': 'moves work off the main thread; the arithmetic it runs belongs to the kernel that registered it',
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

/* ⚠ (#R752) THE POPULATION, AND IT IS COUNTED RATHER THAN LISTED. `read(rel)` hands back the source
   of one repo-relative path; this walks the GIS modules and sorts each into declaring / not. The
   gate then has three things to check and none of them is 「誰かが思いついた一覧」:
     · a declaring file with no ledger row      → unrecorded
     · a ledger row whose file no longer declares → stale
     · a file in neither set                    → undecided
   ⚠ `files` IS THE CALLER'S, because this module must not know how the repository is walked (it is
   imported by a test that already has the checkout in its hands). */
export function classifyKernels(files, read) {
  const declaring = [], silent = [], undecided = [], unrecorded = [], stale = [];
  for (const rel of files) {
    const version = declaredVersion(read(rel));
    const recorded = Object.prototype.hasOwnProperty.call(KERNELS, rel);
    const excused = Object.prototype.hasOwnProperty.call(NOT_A_KERNEL, rel);
    if (version) {
      declaring.push(rel);
      if (!recorded) unrecorded.push(rel);
      /* ⚠ A file cannot be both. Declaring a version and being excused from having one is two
         statements about the same module, and the gate must not pick one. */
      if (excused) undecided.push(rel);
    } else {
      if (recorded) stale.push(rel);
      else if (excused) silent.push(rel);
      else undecided.push(rel);
    }
  }
  return { declaring, silent, undecided, unrecorded, stale };
}
