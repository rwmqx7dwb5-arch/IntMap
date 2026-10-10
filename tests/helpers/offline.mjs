/* tests/helpers/offline.mjs — (unit-tests-offline) THE NODE REGRESSION SUITE DOES NOT REACH ANOTHER HOST.

   scripts/test-checks.mjs (`npm run test:checks`, CI «Regression i/n») preloads this file into every process
   the suite starts — each test file, and every node script a test spawns — through NODE_OPTIONS=--import
   (`offlineEnv()` there). The declared gates already ran this way (scripts/gate-universe.mjs `gateEnv`); the
   suite did not.

   Why: on 2026-10-10 a Regression shard failed after 45.8 s on `geoBoundaries HTTP 504 … after 3 attempts`.
   The test's claim (two dossiers naming different countries do not share a catalogue) needed no network; it
   reached GitHub because it ran the whole CLI, and the CLI fetched catalogues. A claim about IntMap's code that
   turns red when someone else's server is down is not measuring IntMap's code — and nothing said it was
   reaching out until the day the host failed.

   THE REFUSAL IS scripts/no-network.mjs, NOT A COPY OF IT: every non-loopback socket (http, https, tls, the fetch
   built into node) throws `no-network: …`. Two things are added for a test process:
     · fetch to loopback is let through (no-network.mjs refuses every fetch, which a gate never needs; tests
       serve and read their own fixtures on 127.0.0.1 — the socket guard still refuses any other host)
     · a child process that is a network client and not node (so it never loads this file) is refused:
       curl / wget with a URL, and git clone / fetch / pull / push / ls-remote naming a remote URL
       (a clone of a temporary local repository stays allowed — several tests build one)

   ⚠ A FILE THAT MUST TALK TO A HOST SAYS SO, WITH THE REASON, IN ITSELF — a comment line
       network-allowed: <why this claim is about the upstream, not about IntMap>
   The exemption is read from the test file being run and inherited by what it spawns
   (INTMAP_NETWORK_ALLOWED), never from a list kept here: a hand-kept list is the shape
   .agents/rules/no-ad-hoc-hardcoding.md §1 names first. A claim that IS «the upstream answers today» belongs to
   the scheduled upstream jobs, not to a pull request's gate — so a reason is required, not a flag.

   INTMAP_OFFLINE_LOG_DIR=<dir> writes each test file's refusals to <dir>/<file>.log (used to survey the suite). */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const TEST_FILE = /\.test\.mjs$/;
const MARK = /network-allowed:\s*(\S.{9,})/;

/* which test this process belongs to: the file itself, or — for a script a test spawned — the test that spawned it */
const self = process.argv[1] && TEST_FILE.test(process.argv[1]) ? process.argv[1] : null;
if (self) {
  process.env.INTMAP_OFFLINE_TEST = self;
  let reason = null;
  try { const m = MARK.exec(fs.readFileSync(self, 'utf8')); if (m) reason = m[1].trim(); } catch { /* unreadable: not exempt */ }
  if (reason) process.env.INTMAP_NETWORK_ALLOWED = reason; else delete process.env.INTMAP_NETWORK_ALLOWED;
  if (process.env.INTMAP_OFFLINE_LOG_DIR) process.env.INTMAP_NO_NETWORK_LOG = path.join(process.env.INTMAP_OFFLINE_LOG_DIR, path.basename(self) + '.log');
}

if (!process.env.INTMAP_NETWORK_ALLOWED) {
  const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\])$/i;
  const realFetch = globalThis.fetch;
  await import('../../scripts/no-network.mjs');
  const refusingFetch = globalThis.fetch;
  if (typeof realFetch === 'function') {
    globalThis.fetch = function (input, init) {
      let host = null;
      try { const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url); if (/^(https?|wss?):$/.test(u.protocol)) host = u.hostname; } catch { /* not a URL */ }
      /* not a network URL (a relative path some code under test tries, data:, file:): node's own fetch answers it */
      return host == null || LOOPBACK.test(host) ? realFetch.call(this, input, init) : refusingFetch(input, init);
    };
  }

  const refuse = (what) => {
    const msg = 'no-network: ' + what + ' — the node regression suite does not reach other hosts (tests/helpers/offline.mjs)';
    if (process.env.INTMAP_NO_NETWORK_LOG) { try { fs.appendFileSync(process.env.INTMAP_NO_NETWORK_LOG, msg + '\n'); } catch { /* the throw still reports it */ } }
    return new Error(msg);
  };
  const REMOTE = /\b(?:https?|ssh|git):\/\/(?!(?:127\.\d+\.\d+\.\d+|localhost|\[::1\])[:/])|\b[\w.-]+@[\w.-]+:/;
  const netCommand = (line) => {
    if (/(^|[\s/\\"'])(curl|wget)(\.exe)?["']?\s/.test(line) && REMOTE.test(line)) return line;
    if (/(^|[\s/\\"'])git(\.exe)?["']?\s.*\b(clone|fetch|pull|push|ls-remote)\b/.test(line) && REMOTE.test(line)) return line;
    return null;
  };
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
    const real = cp[name];
    cp[name] = function (file, args, ...rest) {
      const hit = typeof file === 'string' && netCommand([file, ...(Array.isArray(args) ? args : [])].join(' ') + ' ');
      if (hit) throw refuse('child_process.' + name + ' ' + hit.trim().slice(0, 200));
      return real.call(this, file, args, ...rest);
    };
  }
  for (const name of ['exec', 'execSync']) {
    const real = cp[name];
    cp[name] = function (command, ...rest) {
      const hit = typeof command === 'string' && netCommand(command + ' ');
      if (hit) throw refuse('child_process.' + name + ' ' + hit.trim().slice(0, 200));
      return real.call(this, command, ...rest);
    };
  }
  syncBuiltinESMExports();
}
