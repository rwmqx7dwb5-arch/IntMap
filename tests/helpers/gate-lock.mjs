/* ============================================================================
 *  tests/helpers/gate-lock.mjs — one writer at a time for the working tree
 * ----------------------------------------------------------------------------
 *  Four files prove that a gate actually FAILS when a fact is wrong, and they do it the only way
 *  that proves anything: make the fact wrong on disk, run the gate, put it back. `node --test` runs
 *  test FILES in parallel, so without this they overlap — one file's probe is present while another
 *  is asserting the tree is clean, and the failure looks like a defect in whichever one lost the
 *  race. (#R280 found it that way: tests/r274 ③ passed alone and failed in the suite.)
 *
 *  A directory is the lock, because `mkdir` is atomic on every filesystem this runs on: it either
 *  creates it or fails. The holder writes its pid inside, and a waiter reclaims the lock only when
 *  that process is genuinely gone.
 *
 *      await withTreeLock(() => { …mutate, run the gate, restore… });
 *
 *  ⚠ EVERYTHING THAT MUTATES A TRACKED FILE MUST GO THROUGH THIS — a second writer that does not
 *  take the lock makes the lock useless without making it look broken.
 *
 *  ⚠⚠ TAKE IT PER MUTATION, NOT PER TEST. Holds are serialised across every file in the suite, so
 *    a hold that spans a whole test blocks three other files for its whole length. #R403 measured
 *    82 s for one test and 264 s for one file that way.
 *
 *  ── two things this got wrong before #R403, both measured under `npm test` ──────────────────
 *
 *  ⚠⚠⚠ LIVENESS IS THE PID, NOT THE CLOCK. This used to reclaim any lock whose mtime was older
 *    than a timeout. Under load a legitimate holder easily exceeds any such timeout — measured,
 *    `tests/r399 ①` held it for 208 s — and the waiter then deletes a LIVE holder's lock and starts
 *    writing the same files. That is precisely the two-writers-at-once the lock exists to prevent,
 *    and it surfaces as «the restore left the tree failing» in whichever file is unlucky, which
 *    reads exactly like a real regression. A heartbeat cannot fix it either: the callbacks run the
 *    gates through `execFileSync`, so the event loop is blocked for the whole hold and no timer
 *    would fire. Asking the operating system whether the holder still exists has neither problem.
 *
 *  ⚠⚠⚠ ON WINDOWS THE RACE RETURNS EPERM, NOT EEXIST. A `mkdir` issued while another process is
 *    removing that same directory hits it in a pending-delete state and fails with EPERM. The old
 *    code rethrew anything that was not EEXIST, so that ordinary race killed the test outright —
 *    measured as seven tests dying in milliseconds with `EPERM … mkdir`. It stayed hidden while
 *    holds were few and long; it appeared as soon as they became many and short. A failure to take
 *    the lock is a failure to take the lock, whatever errno the platform picks for it.
 * ==========================================================================*/
import { mkdirSync, rmSync, statSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ⚠⚠⚠ THE LOCK IS PER CHECKOUT, AND IT MUST NOT LIVE UNDER `node_modules`.
   It used to, on the reasonable-sounding grounds that `node_modules` is gitignored. But
   `scripts/worktree.mjs` gives every worktree its `node_modules` as a JUNCTION to the master
   copy's — so that path resolved to ONE directory shared by every checkout on the machine, and
   this repository runs many sessions at once by design (`CLAUDE.md` §6).
   The consequence was not merely that unrelated suites queued behind each other. A waiter in
   another worktree, running whatever version of this file its branch has, would decide a lock held
   for longer than its own staleness timeout was dead and DELETE IT — while it was held, by a live
   process, in a different checkout. The holder never learns; the next acquirer in the holder's own
   worktree then walks straight in, and two processes mutate that tree at once. MEASURED (#R403):
   suites in three other worktrees were running concurrently, and the resulting corruption appeared
   as `Architecture.md` carrying another test's probe while this file's tests held the lock — which
   reads exactly like a regression in whichever test happens to look.
   ⚠ Deriving the path from the checkout is the same answer `tests/helpers/session-seed.js` gives
   for the dev-server port, and for the same reason: what is private to a checkout must be NAMED
   by that checkout. */
const LOCK = join(tmpdir(), 'intmap-tree-lock-' + createHash('sha1').update(ROOT).digest('hex').slice(0, 12));
const OWNER = join(LOCK, 'pid');

/* Only for a lock whose owner never got as far as writing its pid — a window of microseconds.
   A lock with a live owner is NEVER reclaimed, however long it has been held. */
const UNCLAIMED_MS = 30_000;

/* The deadline is a BACKSTOP against a wedged suite, not a performance budget: it decides only how
   long a waiter tries before calling the suite broken, so it must exceed the total time every other
   holder can legitimately want. Under `npm test` that is minutes — 200-odd test files compete for
   CPU and a gate run that costs ~6 s alone costs multiples of that. */
const TIMEOUT_MS = 900_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }              // it exists and we may signal it
  catch (e) { return e.code === 'EPERM'; }                 // exists, but owned by someone else
};

/* true when the lock is held by a process that is gone, or was never claimed at all */
function abandoned() {
  try {
    if (!existsSync(LOCK)) return false;
    if (existsSync(OWNER)) return !alive(Number(readFileSync(OWNER, 'utf8').trim()));
    return Date.now() - statSync(LOCK).mtimeMs > UNCLAIMED_MS;
  } catch { return false; }                                // it changed under us — just re-loop
}

/* ⚠ REENTRANT, because the alternative is worse in both directions. A helper that mutates one fact
   wants the lock so it is safe on its own; a test that performs six such mutations wants ONE hold,
   not six — every release is a chance to be overtaken, and the suite's cost is dominated by how
   many times the lock changes hands rather than by how long any one holder keeps it. Without
   reentrancy the caller has to know whether its caller already took it, which is the bookkeeping
   this whole file exists to remove. Tests inside one file run sequentially, so a plain depth
   counter is the whole of it. */
let depth = 0;

export async function withTreeLock(fn, { timeoutMs = TIMEOUT_MS } = {}) {
  if (depth > 0) { depth++; try { return await fn(); } finally { depth--; } }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let got = false;
    try { mkdirSync(LOCK); got = true; }
    catch (e) {
      /* EEXIST: someone holds it. EPERM/EACCES: on Windows, someone is removing it right now, or
         the directory is otherwise momentarily untouchable. All three mean «not mine yet», and the
         answer to all three is to look at who holds it and wait. */
      if (e.code !== 'EEXIST' && e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
    }
    if (got) {
      /* ⚠ A LOCK WE CANNOT CLAIM MUST BE GIVEN BACK, NOT HELD. If this write fails and we carry on
         anyway, we are holding a lock with no owner recorded — and `abandoned()` reclaims exactly
         that after UNCLAIMED_MS, handing the tree to a second writer while we are still mutating it.
         Treating the write as best-effort turns a loud, momentary failure into the silent corruption
         this file exists to prevent. Release and try again instead. */
      try { writeFileSync(OWNER, String(process.pid)); }
      catch {
        try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* it will age out */ }
        await sleep(25);
        continue;
      }
      break;
    }
    if (abandoned()) { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* someone beat us to it */ } continue; }
    if (Date.now() > deadline) throw new Error('gate-lock: waited ' + timeoutMs + 'ms for the tree lock');
    await sleep(25);
  }
  depth = 1;
  try { return await fn(); }
  finally {
    depth = 0;
    try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* already gone */ }
  }
}
