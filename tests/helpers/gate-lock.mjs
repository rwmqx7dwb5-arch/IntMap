/* ============================================================================
 *  tests/helpers/gate-lock.mjs — one writer at a time for the working tree
 * ----------------------------------------------------------------------------
 *  Two tests prove that `npm run check:docs` actually FAILS when a fact is wrong, and both do it
 *  the only way that proves anything: make the fact wrong on disk, run the gate, put it back.
 *  `node --test` runs test FILES in parallel, so without this they overlap — one file's probe is
 *  present while the other is asserting the tree is clean, and the failure looks like a defect in
 *  whichever one lost the race. (#R280 found it that way: tests/r274 ③ passed alone and failed in
 *  the suite.)
 *
 *  A directory is the lock, because `mkdir` is atomic on every filesystem this runs on: it either
 *  creates it or throws EEXIST. Held for at most a few hundred milliseconds; a stale one (a killed
 *  process) is broken after STALE_MS so a crash cannot wedge the suite.
 *
 *      await withTreeLock(() => { …mutate, run the gate, restore… });
 *
 *  ⚠ EVERYTHING THAT MUTATES A TRACKED FILE MUST GO THROUGH THIS — a second writer that does not
 *  take the lock makes the lock useless without making it look broken.
 * ==========================================================================*/
import { mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', '.intmap-tree-lock');
const STALE_MS = 120_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withTreeLock(fn, { timeoutMs = 180_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { mkdirSync(LOCK); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs > STALE_MS) { rmSync(LOCK, { recursive: true, force: true }); continue; }
      } catch { /* someone else just removed it — loop */ }
      if (Date.now() > deadline) throw new Error('gate-lock: waited ' + timeoutMs + 'ms for the tree lock');
      await sleep(25);
    }
  }
  try { return await fn(); }
  finally { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* already gone */ } }
}
