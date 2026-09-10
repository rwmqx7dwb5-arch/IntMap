/* ============================================================================
 *  IntMap · a filename another session is about to create too   (#R674)
 * ----------------------------------------------------------------------------
 *  A round's own regression file used to be named for the round and nothing else —
 *  tests/r<N>-checks.test.mjs — and a round number is NOT a name. Every parallel session takes
 *  «the next free number» from the same scan (scripts/worktree.mjs `nextRound`) and takes it
 *  again whenever origin/main moves, so two sessions routinely hold the same one.
 *
 *  MEASURED in #R671: two sessions both created tests/r568-checks.test.mjs, git raised an
 *  add/add conflict, the landing automation swallowed it (a pipe took $? from `tail`, #R420
 *  again) and committed the markers. The file then failed to parse — SyntaxError — and every
 *  test in it stopped running. That round was renumbered SEVEN times (R560→…→R671); a second
 *  session in the same window was renumbered four. Collision is the steady state, not the
 *  accident. The same shape ate a memory file twice (#R565, #R671): renaming
 *  intmap-r<N>-lessons.md on every renumbering landed on another session's file.
 *
 *  ⚠ THE FIX IS THE NAME, NOT THE MERGE. Nothing in one checkout can prove the other branch
 *    picked a different number — the other branch is not here. What CAN be proved is that the
 *    name carries what the number does not: its SUBJECT. Two sessions do not collide on
 *    r674-round-naming vs r671-dem-store, whatever numbers they end up holding.
 *
 *  ⚠ THE LEGACY FILES ARE HELD BY TWO NUMBERS, NOT BY A LIST OF SPELLINGS. A list of the 418
 *    names already in the old form would have to be EDITED to admit the 417th, and that edit is
 *    exactly what this exists to stop (.agents/rules/no-ad-hoc-hardcoding.md §1). Instead:
 *      · LEGACY_BARE_COUNT     — how many exist. It only goes DOWN; adding one raises it.
 *      · LEGACY_BARE_MAX_ROUND — the highest round among them. Round numbers are handed out
 *        monotonically, so ANY bare name above it was written after this rule landed.
 *    Either alone is evadable — add a bare name AND rename a legacy one and the count holds;
 *    reuse some unused low number and the round holds — together they are not.
 *
 *  MEASURED 2026-09-10 on the tree that carries this rule: 418 bare names, highest round 673,
 *  with the 36 subject-bearing files running up to r674. ⚠ BOTH NUMBERS MOVED WHILE THIS ROUND
 *  WAS OPEN — main merged a round that added one more bare name. That is the expiry clause doing
 *  its work, not an edit to dodge the gate: the file predates this rule and is not this round to
 *  rename. They expire again the moment a round legitimately renames legacy files; the third
 *  clause below says so rather than going quiet.
 *
 *  正本 (the rule itself, memory files included): .agents/skills/intmap-round/SKILL.md §4
 *  What this measures: docs/TESTING.md, Static checks.
 * ==========================================================================*/

export const LEGACY_BARE_COUNT = 418;
export const LEGACY_BARE_MAX_ROUND = 673;

/* A per-round artefact under tests/: r<N> then whatever the name says, then the runner's suffix.
   `.test.mjs` is what the node runner discovers by name; `.spec.js` is Playwright's. */
const ROUND_ARTEFACT = /^r(\d+)(?:-(.*))?(\.test\.mjs|\.spec\.js)$/;

/* The SUBJECT is whatever the name says besides the round and the generic category word, so
   r<N>-checks.test.mjs and r<N>.spec.js are bare while r<N>-hover-checks.test.mjs,
   r<N>-model.test.mjs and r<N>-cesium.spec.js are not. This asks the NAME, never a list. */
export function roundArtefact(basename) {
  const m = ROUND_ARTEFACT.exec(basename);
  if (!m) return null;
  const subject = (m[2] || '').split('-').filter((w) => w && w !== 'checks');
  return { round: Number(m[1]), suffix: m[3], subject, bare: subject.length === 0 };
}

/* `basenames` — the file names directly under tests/ (the caller owns the walk, so this stays a
   pure function of the names and the test can hand it a tree that does not exist on disk). */
export function roundNameProblems(basenames) {
  const problems = [];
  let bare = 0;
  for (const name of basenames) {
    const a = roundArtefact(name);
    if (!a || !a.bare) continue;
    bare++;
    if (a.round > LEGACY_BARE_MAX_ROUND) {
      problems.push(`tests/${name} is named for its round and nothing else. Parallel sessions take`
        + ' the same free round number routinely (#R671: seven renumberings in one round, and an'
        + ' add/add conflict that committed merge markers into a file of regressions), so give it'
        + ` a subject: r${a.round}-<subject>${a.suffix}`
        + ' — .agents/skills/intmap-round/SKILL.md §4');
    }
  }
  if (bare > LEGACY_BARE_COUNT) {
    problems.push(`${bare} files under tests/ are named for their round and nothing else; the`
      + ` recorded legacy snapshot is ${LEGACY_BARE_COUNT} and only goes down. Name the new one`
      + ' r<N>-<subject> — .agents/skills/intmap-round/SKILL.md §4');
  } else if (bare < LEGACY_BARE_COUNT) {
    problems.push(`only ${bare} round-number-only files remain under tests/ but LEGACY_BARE_COUNT`
      + ` in scripts/round-names.mjs still says ${LEGACY_BARE_COUNT}. Lower it to ${bare}:`
      + ' a ratchet nobody tightens stops asserting anything');
  }
  return problems;
}

/* The names a round's own files must carry, given the number it just took and its slug.
   ⚠ THE PRODUCER AND THE JUDGE SHARE ONE DEFINITION. `scripts/worktree.mjs new` prints these when
   it hands out the round number, and roundNameProblems() above judges what ends up on disk — if
   those were two spellings of the same convention, the tool could hand out a name its own gate
   rejects, which is #R536's shape. tests/r674-round-naming-checks.test.mjs feeds one to the other. */
export const roundArtefactNames = (round, slug) => ({
  checks: `tests/r${round}-${slug}-checks.test.mjs`,
  spec: `tests/r${round}-${slug}.spec.js`,
});
