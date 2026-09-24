/* ============================================================================
 *  IntMap · a filename another session is about to create too   (#R674, then: no numbers at all)
 * ----------------------------------------------------------------------------
 *  A round's own regression file used to be named for the round and nothing else —
 *  tests/r<N>-checks.test.mjs — and a round number is NOT a name. Every parallel session took
 *  «the next free number» from the same scan (max+1 over DEV-NOTES, branches, worktrees, tests),
 *  so the scan handed the SAME number to every session that ran it before the others pushed.
 *
 *  MEASURED in #R671: two sessions both created tests/r568-checks.test.mjs, git raised an
 *  add/add conflict, the landing automation swallowed it (a pipe took $? from `tail`, #R420
 *  again) and committed the markers. The file then failed to parse — SyntaxError — and every
 *  test in it stopped running. That round was renumbered SEVEN times (R560→…→R671); a second
 *  session in the same window was renumbered four. The same shape ate a memory file twice.
 *
 *  #R674 answered with «number + subject». The number still moved on every renumbering, still
 *  had to be re-taken right before every push, and was still what DEV-NOTES, the build stamp, the
 *  preview port and the landing scripts keyed on. So the number is gone as a name altogether
 *  (利用者承認済み: 「ラウンド番号を名前として使うのをやめる」):
 *
 *      tests/<slug>-checks.test.mjs     tests/<slug>.spec.js
 *
 *  where <slug> is the one `node scripts/worktree.mjs new <slug>` was given — the same slug that
 *  names the branch (feat/<slug>) and the worktree (wt-<slug>). A slug is chosen from the WORK, so
 *  two sessions only share one if they are doing the same thing, and `new` refuses a slug that a
 *  branch, a worktree or a test file already holds. After the PR exists its NUMBER (#N, which the
 *  squash merge writes into the subject) is the identifier nobody else can hold.
 *
 *  ⚠ THE EXISTING r<N>… FILES ARE HISTORY AND STAY WHERE THEY ARE. They are held by two numbers,
 *    not by a list of 631 spellings (a list would have to be EDITED to admit the next one, which is
 *    exactly what this exists to stop — .agents/rules/no-ad-hoc-hardcoding.md §1):
 *      · LEGACY_NUMBERED_COUNT     — how many exist. It only goes DOWN; adding one raises it.
 *      · LEGACY_NUMBERED_MAX_ROUND — the highest number among them. Any number above it was
 *        written after this rule landed.
 *    Either alone is evadable — add one AND rename a legacy one and the count holds; reuse some
 *    unused low number and the maximum holds — together they are not.
 *
 *  MEASURED 2026-09-25 on the tree that carries this rule: 631 names under tests/ are
 *  r<N> (bare and subject-bearing alike), the highest being r808. ⚠ A BRANCH OPENED BEFORE THIS
 *  LANDED MAY STILL ADD ONE (r809-…); rebased onto this it goes red here and the fix is to rename
 *  it to its slug — not to raise these numbers. They move DOWN when a round renames legacy files,
 *  and the third clause below says so rather than going quiet.
 *
 *  正本 (the rule itself, memory files included): .agents/skills/intmap-round/SKILL.md §4
 *  What this measures: docs/TESTING.md, Static checks.
 * ==========================================================================*/

export const LEGACY_NUMBERED_COUNT = 631;
export const LEGACY_NUMBERED_MAX_ROUND = 808;

/* A test artefact under tests/: whatever the name says, then the runner's suffix.
   `.test.mjs` is what the node runner discovers by name; `.spec.js` is Playwright's. */
const ARTEFACT = /^(.*?)(\.test\.mjs|\.spec\.js)$/;
const NUMBERED = /^r(\d+)(?:-(.*))?$/;

/* A slug: lower-case words joined by «-», starting with a LETTER. `r12-x` starts with a letter
   too, which is why the numbered shape is refused separately rather than by this pattern. */
export const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const isNumberedSlug = (slug) => /^r\d+(?:-|$)/.test(String(slug));

/* ⚠ still exported under its old name: it answers «is this a per-round artefact, and for which
   number» — only the legacy files have one. */
export function roundArtefact(basename) {
  const a = ARTEFACT.exec(basename);
  if (!a) return null;
  const n = NUMBERED.exec(a[1]);
  if (!n) return null;
  const subject = (n[2] || '').split('-').filter((w) => w && w !== 'checks');
  return { round: Number(n[1]), suffix: a[2], subject, bare: subject.length === 0 };
}

/* `basenames` — the file names directly under tests/ (the caller owns the walk, so this stays a
   pure function of the names and the test can hand it a tree that does not exist on disk). */
export function roundNameProblems(basenames) {
  const problems = [];
  let numbered = 0;
  for (const name of basenames) {
    const a = roundArtefact(name);
    if (!a) continue;
    numbered++;
    if (a.round > LEGACY_NUMBERED_MAX_ROUND) {
      const subject = a.subject.length ? a.subject.join('-') : '<slug>';
      problems.push(`tests/${name} is named for a round number. Numbers are not names any more — parallel`
        + ' sessions were handed the same one routinely (#R671: seven renumberings and an add/add conflict'
        + ' that committed merge markers into a file of regressions). Name it for its subject:'
        + ` tests/${subject}${a.suffix === '.spec.js' ? '.spec.js' : '-checks.test.mjs'}`
        + ' — .agents/skills/intmap-round/SKILL.md §4');
    }
  }
  if (numbered > LEGACY_NUMBERED_COUNT) {
    problems.push(`${numbered} files under tests/ are named r<N>…; the recorded legacy snapshot is`
      + ` ${LEGACY_NUMBERED_COUNT} and only goes down. Name the new one for its subject`
      + ' (<slug>-checks.test.mjs / <slug>.spec.js) — .agents/skills/intmap-round/SKILL.md §4');
  } else if (numbered < LEGACY_NUMBERED_COUNT) {
    problems.push(`only ${numbered} round-numbered files remain under tests/ but LEGACY_NUMBERED_COUNT`
      + ` in scripts/round-names.mjs still says ${LEGACY_NUMBERED_COUNT}. Lower it to ${numbered}:`
      + ' a ratchet nobody tightens stops asserting anything');
  }
  return problems;
}

/* The names a piece of work's own files must carry, given its slug.
   ⚠ THE PRODUCER AND THE JUDGE SHARE ONE DEFINITION. `scripts/worktree.mjs new` prints these, and
   roundNameProblems() above judges what ends up on disk — if those were two spellings of the same
   convention, the tool could hand out a name its own gate rejects, which is #R536's shape.
   tests/r674-round-naming-checks.test.mjs feeds one to the other. */
export const artefactNames = (slug) => ({
  checks: `tests/${slug}-checks.test.mjs`,
  spec: `tests/${slug}.spec.js`,
});

/** Why a slug cannot be used (null = it can). `taken` answers «does something already hold it». */
export function slugProblem(slug, taken = () => null) {
  if (!slug || !SLUG.test(slug)) return 'slug は小文字の英字で始まり、小文字・数字・ハイフンだけ（例: dem-tile-budget）';
  if (isNumberedSlug(slug)) return `«${slug}» は番号で始まっている——番号は名前にしない（主題で名づける）`;
  return taken(slug);
}
