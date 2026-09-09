/* ============================================================================
 *  tests/helpers/gate-lock.mjs — one writer at a time for the working tree
 * ----------------------------------------------------------------------------
 *  Several files prove that a gate actually FAILS when a fact is wrong, and they do it the only way
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
 *  ⚠⚠⚠ A HALF-WRITTEN STAMP READS AS A DEAD OWNER — AND «DEAD» IS A LICENCE TO DELETE. The pid
 *    was published with `writeFileSync`, which opens the file with O_TRUNC and then writes: for
 *    the microseconds in between it EXISTS and is EMPTY. A waiter reading it there got `''`,
 *    `Number('')` is 0, 0 is not a live pid — so `abandoned()` reported that the LIVE holder was
 *    gone and the waiter removed its lock and walked in. It is the clock bug above wearing a
 *    different hat: a momentary failure to read the owner was treated as proof there is none.
 *    MEASURED (#R623), eight processes taking the lock in turn with holds that block the event
 *    loop, as the gates do: the old code read `''` on 13 of 480 handovers (2.7%) and produced
 *    24 breaches of mutual exclusion in 320 holds — one bad reclaim cascades, because the robbed
 *    holder still removes «its» lock at the end and hands the same wound to the next waiter.
 *    The fix is not to retry the read: it is that THE STAMP IS NEVER VISIBLE INCOMPLETE. It is
 *    written under a unique name inside the lock and RENAMED into place, and rename is atomic —
 *    so a reader sees the whole stamp or no stamp at all. An unreadable stamp is treated as «not
 *    published yet», never as «dead», so no future way of failing to read one can license a
 *    deletion either. Same harness after the change: 480 holds, 0 breaches.
 *
 *  ⚠⚠⚠ RECLAIMING IS A CLAIM, NOT A DELETION. `abandoned()` judges the lock at one instant and
 *    `rmSync` removes whatever stands at that path at another. Two waiters that both judged the
 *    same dead lock would both delete — and the second one deletes the LIVE lock the first has
 *    just taken. So the reclaim first RENAMES THE STAMP: rename is atomic, exactly one waiter can
 *    move a given file, and no live holder can appear in between because taking the lock needs
 *    `mkdir` and the directory is still standing. Only the waiter holding the stamp removes the
 *    directory; the losers get ENOENT and simply look again.
 *
 *  ⚠⚠⚠ ON WINDOWS THE RACE RETURNS EPERM, NOT EEXIST. A `mkdir` issued while another process is
 *    removing that same directory hits it in a pending-delete state and fails with EPERM. The old
 *    code rethrew anything that was not EEXIST, so that ordinary race killed the test outright —
 *    measured as seven tests dying in milliseconds with `EPERM … mkdir`. It stayed hidden while
 *    holds were few and long; it appeared as soon as they became many and short. A failure to take
 *    the lock is a failure to take the lock, whatever errno the platform picks for it.
 * ==========================================================================*/
import { mkdirSync, rmSync, renameSync, statSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ⚠⚠⚠ THE LOCK IS PER CHECKOUT, AND IT MUST NOT LIVE UNDER `node_modules`.
   It used to, on the reasonable-sounding grounds that `node_modules` is gitignored. But
   `scripts/worktree.mjs` gives every worktree its `node_modules` as a JUNCTION to the master
   copy's — so that path resolved to ONE directory shared by every checkout on the machine, and
   this repository runs many sessions at once by design (`AGENTS.md` §6).
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

/* Where this checkout's lock actually is. Exported so a test can drive the lock's own failure
   modes without RE-DERIVING the path from the rule above — a second copy of that derivation is
   exactly the hand-written duplicate `.agents/rules/no-ad-hoc-hardcoding.md` §1 names, and it
   would keep passing on the day the derivation changes. */
export const lockPaths = () => ({ lock: LOCK, owner: OWNER });

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

/* A stamp names the pid AND the hold, so one hold is distinguishable from the next hold of the
   same process — which is what lets a holder ask whether the lock it took is still the lock it
   has (`lockIntact()` below), rather than merely whether some lock is there. */
const newStamp = () => process.pid + ' ' + randomBytes(8).toString('hex');

/* the pid a stamp names, or 0 when there is no readable stamp.
   ⚠⚠⚠ 0 MEANS «NOT PUBLISHED YET», NEVER «DEAD». Everything above turns on that distinction. */
const stampPid = (text) => {
  const n = Number(String(text).trim().split(/\s+/)[0]);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/* Publish the stamp so that no reader can ever see it half-written: write it under a name nobody
   looks at, then rename it into place. */
function publishStamp(text) {
  const tmp = OWNER + '.writing.' + process.pid + '.' + randomBytes(4).toString('hex');
  writeFileSync(tmp, text);
  renameSync(tmp, OWNER);
}

/* true when the lock is held by a process that is gone, or was never claimed at all */
function abandoned() {
  try {
    if (!existsSync(LOCK)) return false;
    if (existsSync(OWNER)) {
      const pid = stampPid(readFileSync(OWNER, 'utf8'));
      /* ⚠ NOT «dead»: a stamp we cannot read is one we have not read YET. Falling through to the
         clock is right — it is the same state as a lock whose owner has not stamped it. */
      if (!pid) return Date.now() - statSync(LOCK).mtimeMs > UNCLAIMED_MS;
      /* ⚠ NOT «dead»: a stamp we cannot read is one we have not read YET. Falling through to the
         clock is right — it is the same state as a lock whose owner has not stamped it. */
      return !alive(pid);
    }
    return Date.now() - statSync(LOCK).mtimeMs > UNCLAIMED_MS;
  } catch { return false; }                                // it changed under us — just re-loop
}

/* Take the abandoned lock away from its dead owner — see the header. The stamp is the claim, so
   only one waiter can ever be the one that removes the directory. Returns nothing: whether it
   worked is answered by the next `mkdir`, not by us. */
function reclaim() {
  try {
    if (existsSync(OWNER)) renameSync(OWNER, OWNER + '.dead.' + process.pid);
    rmSync(LOCK, { recursive: true, force: true });
  } catch { /* another waiter claimed it first, or it changed under us — look again */ }
}

/* ⚠ REENTRANT, because the alternative is worse in both directions. A helper that mutates one fact
   wants the lock so it is safe on its own; a test that performs six such mutations wants ONE hold,
   not six — every release is a chance to be overtaken, and the suite's cost is dominated by how
   many times the lock changes hands rather than by how long any one holder keeps it. Without
   reentrancy the caller has to know whether its caller already took it, which is the bookkeeping
   this whole file exists to remove. Tests inside one file run sequentially, so a plain depth
   counter is the whole of it. */
let depth = 0;

/* The exact stamp of the hold this process owns, or null when it holds nothing. */
let heldStamp = null;

/* ⚠⚠⚠ WHY A HOLDER NEEDS TO ASK. A test that finds a gate red under the lock has two very
   different failures in front of it — «the gate is wrong» and «somebody else wrote the tree while
   I held the lock» — and until #R623 the only way it tried to tell them apart was to sample
   `git status` after the gate had already finished. That sample cannot see a mutation that was
   made and restored while the gate ran, so it printed «(clean)» for the one case it existed to
   catch and sent the reader after the gate. MEASURED: run 34389623083 cost this round a day that
   way, `tests/r403 ①` reporting `tests/r399 ②`'s deliberate mutation as its own.
   The lock can answer directly. Every writer takes it, so a hold that survived intact means no
   other writer was inside — and a hold that did NOT survive names the breakage outright. */
export function lockIntact() {
  if (heldStamp == null) return { intact: false, held: false, why: 'this process is not holding the tree lock' };
  let now;
  try { now = readFileSync(OWNER, 'utf8'); }
  catch (e) {
    return { intact: false, held: true,
      why: 'the lock we created is gone (' + (e && e.code) + ') — another process removed it while we were inside it' };
  }
  if (now !== heldStamp) {
    return { intact: false, held: true,
      why: 'the lock was taken over while we were inside it — it now stamps «' + now.trim() + '», ours was «' + heldStamp.trim() + '»' };
  }
  return { intact: true, held: true, why: 'held continuously by this process' };
}

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
      const stamp = newStamp();
      try { publishStamp(stamp); heldStamp = stamp; }
      catch {
        try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* it will age out */ }
        await sleep(25);
        continue;
      }
      break;
    }
    if (abandoned()) { reclaim(); continue; }
    if (Date.now() > deadline) throw new Error('gate-lock: waited ' + timeoutMs + 'ms for the tree lock');
    await sleep(25);
  }
  depth = 1;
  try { return await fn(); }
  finally {
    depth = 0;
    heldStamp = null;
    try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* already gone */ }
  }
}
