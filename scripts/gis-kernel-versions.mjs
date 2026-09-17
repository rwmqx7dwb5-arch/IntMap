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
  /* (#R759) ops-2 -> ops-3: A REPLAYED STEP NOW REGISTERS A DIFFERENT RECORD, and every part of the
     difference is a statement the old one was not making. Its `coverage` is inherited from the
     inputs (a derived record used to carry none, so a partial acquisition became invisible one step
     downstream); a grid made from two grids whose epochs differ is stamped with the SPAN rather than
     with the first input's date; and a column that kept its name keeps the unit somebody stated
     about it. ⚠ The arithmetic of every op is untouched — the numbers in the cells are the same
     numbers — but what the record SAYS about them is not, and a reader comparing two loads of one
     project is entitled to know which of the two told them. */
  /* (#R763) ops-3 -> ops-4: A REPLAYED STEP AGAIN REGISTERS A DIFFERENT RECORD, in three places, and
     one of them is a corrected number rather than a new statement. `resample` no longer lets the grid
     it borrowed a LATTICE from vote on the answer's epoch — 2020 年の格子を 2025 年の格子へ合わせた
     記録は 2020 年であって 2020–2025 ではなく、格子を貸した側が時点を述べていなければ、こちらの日付
     はもう消えない。A join that PREFIXES its columns carries the unit onto the new name. And a run that
     could not compute part of itself records that in its own coverage, so a record made out of
     complete inputs no longer calls itself complete after losing rows. ⚠ The arithmetic in the cells
     is untouched; what changed is which of two dates a replayed project shows, which is exactly the
     thing a reader comparing two loads is entitled to be told. */
  /* (#R764) ops-4 -> ops-5: EVERY ZONAL ROW GAINED A COLUMN, and it had to. `zonal` can now be asked
     for a different boundary rule, so two answers over the same zone and the same grid can differ —
     and a column of areas whose rule lives only in a stats line the reader saw once is a number
     nobody can check later. `_boundary` rides on the row itself, which is what gets joined, exported
     and compared months afterwards. ⚠ THE DEFAULT ANSWER DID NOT MOVE: a recipe saved before today
     names no boundary, replays as `center`, and produces the same numbers to the bit. What changed is
     that the record now says which rule produced them. */
  /* ⚠ (#R765) ops-5 IS DELIBERATELY NOT RAISED, and the line this draws is worth stating. The round
     added `provenance.engine` to every op output — the record now says WHICH ENGINE COMPUTED IT,
     stamped as it ran, instead of leaving a later reader to ask the kernels a question about today.
     That is a statement about the COMPUTATION, not about the data: no number moves, no refusal
     changes, no tolerance changes, and nothing a replayed recipe produces differs.
     ⚠ CONTRAST WITH #R763 AND #R764, WHICH DID RAISE IT. Those changed what the record says about
     THE NUMBERS — which of two dates a grid is stamped with, whether a column keeps the unit
     somebody stated, whether an answer computed out of complete inputs still calls itself complete,
     which boundary rule produced an area. A reader comparing two loads would read a different claim
     about their data. Here they read the same claims, plus a note about the machinery. */
  /* (#R774) ops-5 -> ops-6: THREE ANSWERS MOVED, and each of them is what this number exists to
     announce. ⑴ `areaKm2` reads a ring that states a seam crossing undivided (an edge of more than
     180° and less than 360°) on js/gis-geometry.js's unwrapping, so 179°E→179°W × 0°–1° replays as
     24,727 km² where it replayed as 4,426,211 km² — every `_areaKm2` on a buffer, clip, overlay,
     dissolve and zonal row over the antimeridian moves with it. ⚠ The 360° closing edge a full-width
     band writes is untouched, so the polar disk is byte-identical. ⑵ `compute` refuses an expression
     that adds two columns stating different units (`unit-mismatch`) — a step that ran yesterday can
     refuse today. ⑶ `compute`'s output column now CARRIES the unit it derived, and `rasterCalc`'s
     band does too when the reader named none. */
    /* (#R783) ops-6 -> ops-8: FOUR NEW OPS AND TWO ANSWERS THAT MOVED. ops-7 added spatialJoin /
     nearestJoin / timeJoin / convert (a join whose cardinality is REQUIRED, a half-open time
     window, and a conversion that asks js/gis-units.js for the transform instead of writing a
     factor), and made aggregate and zonal read units.aggregation() — a step that ran yesterday can
     REFUSE today when the quantity it declares does not allow that summary, and the stat
     `areaWeightedMean` went from bad-param to a number. ops-8 then added `tolerance`: a recipe that
     states one replays to a REFUSAL (crs-accuracy-outside-tolerance) where ops-7 gave a figure, and
     surface 'ellipsoid' went from bad-param to a number. ⚠ A call that declares neither a quantity
     nor a tolerance is bit-identical, measured over the existing suite. */
  'js/gis-ops.js': { version: 'ops-8', sha256: '9c5b4bb02eb9af5491e60021ca769c263383afe7351b92ff4ec2374477870420' },
  /* `geom-1` likewise: validate() and repair() are new doors, and the boolean engine behind union,
     intersection and difference was measured unchanged over 800,000 pairs. */
    /* (#R783) geom-1 -> geom-2: MultiPolygon validity grew its THIRD stage (parts-overlap /
     part-inside-part / part-duplicates-part), so validate() answers false where it answered true
     — measured on data/ecoregions_2017.geojson: 126 of 635 records really do put the same ground in
     twice, and an independent sweep-line confirmed 568 of 568. repair() resolves between parts and
     states what it could not. ⚠ AND alignTo stopped deciding the depth of what it was handed:
     boolean ops over two shapes written a turn of longitude apart used to come back EMPTY. 15 of
     720 replayed answers move; every union keeps its area to the bit, and the one buffer that
     changed was geometrically impossible before (63,867 km² inside a ceiling of 34,603 km²). */
  'js/gis-geometry.js': { version: 'geom-2', sha256: '5af573fdf0d51e44b090beb1d0573f578dbaf3364bf1100bd2d92b6e18f0b8af' },
  /* The five below are FIRST declarations, not bumps — they are the kernels #R749 built and never
     recorded, plus the two that were older than the record and outside it. There is nothing to
     compare them against in a project saved before today, which is why a load of such a project
     now answers `unknown` for them rather than `same`. */
  /* (#R756) HASH ONLY, VERSION LEFT ALONE -- 'a faster walk over the same arithmetic'. The pixel
     loops of mask/diff/combine/merge/zonal were folded into one paced walk so a long run can be
     cancelled; not one operation changed, and tests/r754-gis-raster-cancel-checks measures a run
     with a never-cancelling ctx against the same run with no ctx at all, pixel for pixel. */
  /* (#R759) HASH ONLY AGAIN, AND THE CHOICE IS THE INTERESTING PART. `diff` now runs its pixel loop
     on the GIS worker when its caller hands over a door — a different THREAD, not a different answer:
     there is one implementation of the per-pixel rule (the job function), both arms call it, and
     tests/r759-gis-worker-checks measures the two outputs byte for byte against an independently
     written fixture over NaN, infinities, declared sentinels and bands that declare none. A saved
     recipe replays to the same grid whether or not this browser has workers, which is exactly the
     condition for leaving the version where it is. */
  /* ⚠ (#R763) raster-1 IS DELIBERATELY NOT RAISED, and this is the distinction the version exists to
     draw. fromSamplerAsync stopped counting a pixel that THREW as `empty` as well as `failed`, so the
     two counters are disjoint and a caller can tell 「答えたが値が無かった」 from 「訊けなかった」
     (js/gis-sources.js region() splits its refusal on exactly that). Not one cell's value moves: the
     grid a saved recipe replays to is byte-for-byte the grid it replayed to yesterday. A changed
     DIAGNOSTIC is not a changed answer. */
  /* (#R764) raster-1 -> raster-2, AND THE CONTRAST WITH #R763 IS THE POINT. That round changed what
     this kernel REPORTED (failed apart from empty) and left the version alone, because no cell moved.
     This one changes what it can COMPUTE: a boundary pixel may now carry a fractional weight, so the
     same grid and the same zone can answer with a different area than raster-1 could produce. The
     default is untouched and a saved recipe replays identically — but 「同じレシピは、実装が違えば
     同じ答えではない」 is exactly the claim this number exists to make, and an engine that gained an
     answer it could not give before has changed.
     ⚠ ALSO: the answer names its rule (`boundary`) and two refusals are new
     (`boundary-rule-unknown`, `fraction-needs-area-rule`). */
  /* (#R774) raster-2 -> raster-3: `diff` and `merge` ask js/gis-units.js whether the two bands
     measure the same quantity before they do any arithmetic. A recipe over two grids that stated
     convertible units replays to a DIFFERENT NUMBER (1000 m − 1 km replayed as 999 and now replays
     as 0, in metres); one over incompatible or unreadable spellings replays to a REFUSAL
     (`unit-mismatch`) where it used to produce a grid. Grids that state no unit, or the same
     spelling, are untouched. */
    /* (#R783) raster-3 -> raster-4: coverOf stopped believing four corners and a centre. A concave
     pixel reported 1 where the spherical closed form says 0.92000389922 — measured +701.66 km²
     (0.44%) over a 4°×4° grid with 40 notches, so every fractional area, area integral, class area
     and area-weighted mean over a notched, bayed or holed zone moves with it. The new short cut
     fires only when no edge of the zone CAN touch the pixel box (all 360° of wrap), and it is
     4.8-17.6× faster than the wrong one. ⚠ Also new, and additive: zonal takes an explicit `total`
     rule and a band may declare its quantity — every existing call answers as it did. */
  'js/gis-raster.js': { version: 'raster-4', sha256: '2e739f94d1d382d5a8c682c101d05ec1c968e264103651a31828904e457d87eb' },
  /* (#R774) A FIRST DECLARATION. js/gis-units.js decides whether two quantities may be combined and
     what the conversion is; every caller above asks it, so a change to the table or to the
     expression walk changes what a replayed recipe answers or refuses. */
    /* (#R783) units-1 -> units-2: the expression walk stopped returning `unit: null` for four
     different facts. abs / round / min / max / coalesce / number dropped the unit of a column that
     stated one; `len/len` could not say it was dimensionless; `len*dist` could not say it did not
     know. Now min/max/if/coalesce/% REFUSE m against km (unit-mismatch) and exact cancellation
     derives `1` — both change what a recipe replays to. The quantity vocabulary (kind / space /
     time / period, and which aggregations are allowed) is new and refuses nothing by itself: an
     undeclared quantity stays undeclared, which is not permission. */
  'js/gis-units.js': { version: 'units-2', sha256: '94bdd3a280b1835fd4c75ac86a33cbd95a53a56fd33c661b1d4d2830a8fc8f82' },
  /* (#R756) Hash only, for the same reason: the output-pixel loop now yields through the same
     paced walk, and the per-row cancel that had been unreachable code since #R749 is reached. */
    /* (#R783) HASH ONLY: the inverse mapping and the areal footprint boxes may now be computed in the
     GIS worker in budget-sized row blocks. One implementation (invAt / boxOf) runs on both threads,
     and tests/r783-worker-budget-checks measures the blocked grid, the unblocked grid and the grid
     of a declined door byte for byte. Not one pixel changes. */
  'js/gis-warp.js': { version: 'warp-1', sha256: 'ac8c5e339e0e05ac433d89d59102ff81cfab16f744cad984ea69f7a1175c7c7e' },
    /* (#R783) HASH ONLY: every function in FUNCS now declares what it does to a unit (keeps /
     dimensionless / no-unit / changes) so js/gis-units.js can ASK instead of guessing. The
     evaluator is untouched — the same expression over the same rows returns the same numbers. */
  'js/gis-expr.js': { version: 'expr-1', sha256: '06597de1ba5addea548b925bf473b20d25419aca12d57f43c0f6a8e347bed996' },
  'js/gis-index.js': { version: 'index-1', sha256: '580cf1a49be665d6d8ac2ca825d08bc8b32d85e3e30df44ec103cd01810c34cd' },
  /* (#R756) crs-1 -> crs-2: a refusal became an answer. The azimuthal equidistant plane was
     implemented and unreachable (it holds no EPSG code, and `measure` takes its plane as text), so
     `planeSpec()` now reads the spellings out of the PLANES table itself -- 'aeqd:<lon0>,<lat0>'
     and 'mollweide:<lon0>' name planes that were refused yesterday. A saved recipe naming one of
     those replays to a number where it used to replay to a refusal. */
    /* (#R783) crs-2 -> crs-3: no path that already produced a number moves (buildUtm.metric was
     factored out and measured bit-identical), but certify() and `tolerance` are new answers — a
     recipe that STATES a tolerance replays to a refusal plus the surfaces that can hold it, where
     crs-2 had no way to state one. The measurement behind it: EPSG:3857 area is +311% at 60°N and
     +10744% at 84°N; the datum term nobody had measured is +0.449% at the equator on this app's own
     sphere; and `exact: true` was a claim about a surface's OWN datum, not about the ground. */
  'js/gis-crs.js': { version: 'crs-3', sha256: 'de3d3e94602c3e3ef56e5ebd80ee96df08b3b9fd90714e392cab6bb16342e469' },
};

/* ⚠ THE OTHER HALF, AND IT IS THE HALF THAT MAKES THE FIRST ONE A RULE. A GIS module that is not a
   kernel must say WHY it cannot change a number, here, once. A reason is reviewable; an absence is
   not — and an absence is what let four answer-bearing kernels sit outside the ledger for a whole
   round. ⚠ 「まだ版を付けていない」 is not a reason. If it can change an answer it declares a version. */
export const NOT_A_KERNEL = {
  'js/gis-core.js': 'mounts the modules and draws a dataset on the map; computes nothing',
  /* (#R783) the assembly, not the arithmetic: it decides what plays the part of the scope and what
     was handed over, mounts through js/gis-core.js, and computes nothing a saved recipe replays. */
  'js/gis-runtime.js': 'decides what plays the part of the scope and what was handed over; mounts through js/gis-core.js and computes nothing itself',
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
