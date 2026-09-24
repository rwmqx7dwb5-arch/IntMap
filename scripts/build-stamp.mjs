/* ============================================================================
 *  IntMap · THE BUILD STAMP IS WRITTEN BY THE BUILD, NOT BY A PERSON
 * ----------------------------------------------------------------------------
 *  index.html carries two stamps, `window.INTMAP_BUILD` and `window.__imBuild`, and the anti-stale
 *  guard (#R16) compares the one a device last saw with the one it is being served: an OLDER stamp
 *  means a stale cached copy, so the caches are purged and the page reloads once.
 *
 *  Until 2026-09-25 both were typed by hand every round — `'2026-09-25-R808'` and `'R808'` — and
 *  the guard compared the ROUND NUMBER. The record says what a hand-bumped stamp does:
 *    · left at R171 through #R172 and #R173 — for three rounds a device serving a stale copy
 *      looked current to the guard (caught by the production smoke test, #R174);
 *    · #R756 forgot it again and shipped; production verification found it, not a gate;
 *    · twenty-four tests existed only to pin the two literals to «the newest round in DEV-NOTES»,
 *      and every round had to edit them — the one step a round could forget and still go green
 *      locally until the pin fired.
 *  And with round numbers gone as names, there is no number to type.
 *
 *  So the stamp is DERIVED from the commit being built:
 *
 *      <committer time of HEAD, UTC, to the second>Z-<short sha>     e.g. 2026-09-25T04:51:07Z-f669ff9
 *
 *  ⚠ WHY THE COMMIT TIME AND NOT THE CLOCK. The guard needs an order that only moves forward as the
 *    SITE moves forward. main advances by squash merges, and each one's committer time is the
 *    moment it landed, so the order of stamps is the order of main. The wall clock of the machine
 *    doing the build is not: re-running an old deploy would stamp OLD code as NEWEST, and every
 *    device that loaded it would then call the real newest build stale.
 *  ⚠ WHY THE SHA TOO. Two builds of the same second are not distinguishable by time; the sha says
 *    WHICH code a bug report came from (js/feedback.js sends the stamp), which a number never did.
 *  ⚠ WITHOUT GIT (a tarball) the stamp says so — `…Z-nogit`, from the build clock — rather than
 *    inventing a sha.
 *
 *  The source index.html holds only the token below; `transformIndexHtml` fills it in both
 *  `vite build` and `vite` (dev), so a page that was never built says it was never built.
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';

export const STAMP_TOKEN = '__INTMAP_BUILD_STAMP__';

/* The one parser of the stamp's time, shared with the tests. index.html repeats it in ES5 (it runs
   before any module) and tests/process-without-round-numbers-checks.test.mjs evaluates that copy
   against this one. */
export const STAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)-([0-9a-f]{7,40}|nogit)$/;
export const stampTime = (s) => { const m = STAMP_RE.exec(String(s || '')); return m ? Date.parse(m[1]) : NaN; };

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The stamp for the checkout at `cwd` (the commit it is on). */
export function buildStamp(cwd = process.cwd()) {
  try {
    const [ct, sha] = execFileSync('git', ['log', '-1', '--format=%ct %h'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(' ');
    if (/^\d+$/.test(ct) && /^[0-9a-f]{7,40}$/.test(sha)) return `${iso(Number(ct) * 1000)}-${sha}`;
  } catch { /* not a checkout — say so below */ }
  return `${iso(Date.now())}-nogit`;
}

/** Vite plugin: replace the token in index.html with this build's stamp. Fails the build if the
 *  token is not there — a page with a hand-typed stamp is the thing this replaces. */
export function buildStampPlugin(root = process.cwd()) {
  let stamp = null;
  return {
    name: 'intmap-build-stamp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!html.includes(STAMP_TOKEN)) {
          /* only the app's own page carries the stamp; admin.html and the shells are copied verbatim */
          if (/(^|[\\/])index\.html$/.test(String(ctx && ctx.filename || ''))) {
            throw new Error(`index.html no longer carries ${STAMP_TOKEN} — the build stamp is generated (scripts/build-stamp.mjs), not typed`);
          }
          return html;
        }
        stamp = stamp || buildStamp(root);
        return html.split(STAMP_TOKEN).join(stamp);
      },
    },
  };
}
