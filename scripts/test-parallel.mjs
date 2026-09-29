/* ============================================================================
 *  IntMap · `npm test` IS TWO INDEPENDENT HALVES, SO IT RUNS THEM AT THE SAME TIME  (#R205)
 * ----------------------------------------------------------------------------
 *  「毎回毎回、テストに時間がかかりすぎ。いい加減にしろ。すべてが長すぎる。明らかにテストが過剰。
 *    ずっと言っているがテスト時間が壊滅的に長いまま変わっていない。大幅に過剰。簡易でいい。」
 *
 *  #R203 split the SUITE (85 min → an 8 min gate) and #R204 turned the gate's membership into a price
 *  (484 s → 173 s). Both worked on the same half of `npm test` — the browser half — while the other
 *  half sat in front of it in a `&&` chain:
 *
 *      node static-checks && node engine-coupling --gate && node test-budget && npm run test:checks
 *          && node run-tests            ← the browser suite does not start until all of that is done
 *
 *  Those two halves share nothing. The first is source-level: it parses the repository with acorn and
 *  runs ~60 `node --test` files that read files off disk. The second builds the site, serves it on
 *  4173 and drives Chromium. Neither reads the other's output, and the browser half spends most of
 *  its wall clock waiting for a browser rather than using the CPU — so running them in sequence pays
 *  for the source half twice: once in CPU and once in wall clock.
 *
 *  Running them together makes `npm test` cost max(a, b) instead of a + b.
 *
 *  ⚠ BOTH STILL RUN, AND EITHER STILL FAILS THE COMMAND. There is no "fail fast" here on purpose: a
 *  static-check failure that killed the browser half would hide a browser regression behind a missing
 *  semicolon, and the whole point of this file is that you learn everything from one run.
 *  ⚠ OUTPUT IS PREFIXED AND BUFFERED PER LINE. Two children writing to one terminal interleave
 *  mid-line otherwise, and a half-written assertion message is worse than a slower run.
 *
 *  ══ (gate-parity-and-shards) THE GATES ARE DISCOVERED, NOT LISTED ════════════════════════════════
 *  This file used to name every gate it ran, one hand-written step each. MEASURED 2026-09-29: 23 of
 *  the 31 `check:*` scripts package.json declares were in that list, and eight were not —
 *  check:histeras, check:histnames, check:histfill, check:bordercoast, check:perf, check:assets,
 *  check:surface, check:types. CI (scripts/ci-gates.mjs) discovers its gates from package.json and ran
 *  all 31, so a push that passed `npm test` could still be red in CI, and AGENTS.md §4's «push 前に CI
 *  と同じ門をローカルで通す» was not something this command could do.
 *  Membership now comes from scripts/gate-universe.mjs — the SAME function CI's planner imports — so
 *  a gate declared tomorrow runs here the same day, with nobody editing this file:
 *    · checks half:  the data check, then every declared gate in package.json's own order (the acorn
 *                    gates are declared first — static, engine, i18n — so a parse error still speaks
 *                    before the gates it would otherwise break), then `npm run test:checks`;
 *    · browser half: the browser suite, then — only after its server has stopped — `npm run build`
 *                    and the gates that read the build (discovered by needsBuild(), today
 *                    check:perf and check:assets). They are not in the checks half because the
 *                    browser half's own server builds dist/ at the same moment (playwright.config.js
 *                    webServer), and two builds writing one dist/ is a race, not a check.
 *  ⚠ A GATE MAY STAY OUT OF `npm test` ONLY WITH A SENTENCE SAYING WHY: the CI_ONLY table below. The
 *  run prints that table every time («CI でだけ走るゲート: …») so the gap is read, not inferred, and
 *  an entry without a reason — or naming a gate that no longer exists — stops the run before it
 *  starts. tests/gate-parity-and-shards-checks.test.mjs holds every declared gate to «runs here, or
 *  has a reason in CI_ONLY».
 *  ⚠ `node scripts/test-parallel.mjs --planned` prints the plan as JSON without running it. Checks that
 *  ask «does npm test run X» ask THAT (tests/helpers/ci-reach.mjs), never this file's text.
 * ==========================================================================*/
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gatesInDeclaredOrder, gateCommand, needsBuild, BUILD } from './gate-universe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const NPM = win ? 'npm.cmd' : 'npm';

/**
 * The declared gates `npm test` deliberately does not run, each with the sentence that says why.
 * EMPTY today: every declared gate runs locally (the build-reading ones at the end of the browser
 * half). An entry here is printed on every run and must be a gate that exists.
 * @type {Readonly<Record<string, string>>}
 */
export const CI_ONLY = Object.freeze({});

/**
 * The plan, computed and not run. `problems` is non-empty when the exclusion table is not a table
 * of reasons — the run refuses to start rather than quietly running less than it says.
 * @param {{ ciOnly?: Record<string, unknown>, declared?: string[], readsBuild?: (g: string) => boolean,
 *           command?: (g: string) => [string, string[]] }} [o]
 */
export function localPlan(o = {}) {
  const ciOnly = o.ciOnly || CI_ONLY;
  const declared = o.declared || gatesInDeclaredOrder();
  const readsBuild = o.readsBuild || ((g) => needsBuild(g));
  const command = o.command || ((g) => gateCommand(g));
  const problems = [];
  for (const [g, why] of Object.entries(ciOnly)) {
    if (!declared.includes(g)) problems.push(`CI_ONLY names ${g}, which package.json does not declare`);
    if (typeof why !== 'string' || !why.trim() || why.trim() === g) problems.push(`CI_ONLY excludes ${g} without a sentence saying why`);
  }
  const local = declared.filter((g) => !Object.prototype.hasOwnProperty.call(ciOnly, g));
  const built = local.filter(readsBuild);
  const step = (g) => { const [cmd, args] = command(g); return { gate: g, cmd, args }; };
  const checks = [
    /* ⚠ (data-outside-git) FIRST, BECAUSE EVERYTHING BELOW READS IT. data/border-detail/ and data/hist-eras.js
       live outside git (data-assets.json); absent, a dozen gates and tests would each fail with an
       ENOENT that names neither the cause nor the fix. This names both, and it also refuses a copy
       that is present but is not the content the manifest names — which nothing below could see. */
    { gate: null, cmd: 'node', args: ['scripts/data-assets.mjs', 'verify'] },
    ...local.filter((g) => !built.includes(g)).map(step),
    { gate: null, cmd: NPM, args: ['run', 'test:checks'] },
  ];
  const browser = [
    { gate: null, cmd: 'node', args: ['scripts/run-tests.mjs'] },
    ...(built.length ? [{ gate: null, cmd: NPM, args: BUILD.split(' ').slice(1) }, ...built.map(step)] : []),
  ];
  return {
    halves: [{ tag: 'checks', steps: checks }, { tag: 'browser', steps: browser }],
    gates: local,
    ciOnly: Object.entries(ciOnly).map(([gate, reason]) => ({ gate, reason })),
    problems,
  };
}

export function ciOnlyLine(plan) {
  return plan.ciOnly.length
    ? 'CI でだけ走るゲート: ' + plan.ciOnly.map((x) => `${x.gate}（${x.reason}）`).join(' / ')
    : 'CI でだけ走るゲート: なし（宣言済みの全ゲートをこの実行が走らせる）';
}

function runStep(cmd, args, tag) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: ROOT, shell: win, env: process.env });
    let buf = { out: '', err: '' };
    const pump = (which, chunk) => {
      buf[which] += chunk;
      const lines = buf[which].split('\n');
      buf[which] = lines.pop();
      for (const l of lines) process.stdout.write(`[${tag}] ${l}\n`);
    };
    p.stdout.on('data', (c) => pump('out', String(c)));
    p.stderr.on('data', (c) => pump('err', String(c)));
    p.on('close', (code) => {
      for (const w of ['out', 'err']) if (buf[w]) process.stdout.write(`[${tag}] ${buf[w]}\n`);
      res(code == null ? 1 : code);           /* (#R191) a null status is a FAILURE, not a clean exit */
    });
    p.on('error', (e) => { process.stdout.write(`[${tag}] ${e.message}\n`); res(1); });
  });
}

async function runHalf(h) {
  const t0 = Date.now();
  for (const { cmd, args } of h.steps) {
    const code = await runStep(cmd, args, h.tag);
    if (code !== 0) return { tag: h.tag, code, secs: Math.round((Date.now() - t0) / 1000) };
  }
  return { tag: h.tag, code: 0, secs: Math.round((Date.now() - t0) / 1000) };
}

async function main() {
  const plan = localPlan();
  if (plan.problems.length) {
    for (const p of plan.problems) console.error('✗ ' + p);
    process.exit(1);
  }
  const HALVES = plan.halves;
  console.log(`── npm test · 宣言済みゲート ${plan.gates.length + plan.ciOnly.length} 個のうち ${plan.gates.length} 個を走らせる ──`);
  console.log(`   ${ciOnlyLine(plan)}\n`);
  const t0 = Date.now();
  const results = await Promise.all(HALVES.map(runHalf));
  const wall = Math.round((Date.now() - t0) / 1000);
  console.log('\n── npm test ──');
  for (const r of results) console.log(`   ${r.tag.padEnd(8)} ${r.code === 0 ? 'ok  ' : 'FAIL'} ${r.secs}s`);
  console.log(`   wall clock ${wall}s (the two halves ran together; in sequence they would be ${results.reduce((a, r) => a + r.secs, 0)}s)`);
  console.log(`   ${ciOnlyLine(plan)}\n`);
  process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
}

if (process.argv.includes('--planned')) {
  /* the plan as data, for the checks that ask «does npm test run X» (tests/helpers/ci-reach.mjs,
     scripts/doc-facts.mjs) — asked of this function, never of this file's text */
  const plan = localPlan();
  console.log(JSON.stringify(plan));
  process.exit(plan.problems.length ? 1 : 0);
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

/* ══ WHY EACH GATE IS HERE — the history, kept verbatim ═══════════════════════════════════════════
   Until gate-parity-and-shards each gate below was a hand-written step and each carried the note
   that explained how it got there. Membership is discovered now (see the header), so the notes no
   longer sit on steps — but what they record is still true and still the reason the gate exists, so
   they are kept here, labelled with the command they used to sit on.
   ⚠ The #R588 note below says doc-facts' `ci-gates` rule «reads THIS FILE for generator paths». It
   does not any more: that rule evaluates `--planned` (scripts/doc-facts.mjs rule 28). */
/* ── scripts/i18n-audit.mjs --gate ─────────────────────────────────────────────────────────────────── */
/* ⚠ (#R239) THE TRANSLATION GATE RUNS HERE, WITH THE OTHER ACORN GATES. 「いつまでたっても
   言語対応の漏れが見つかることは許されない」 — a漏れ is found by a reader only when nothing
   between the edit and the deploy asks. This asks, on every run, for every language, across
   every surface any of them lives on (see the header of scripts/i18n-audit.mjs). It is one
   second of parsing, and it is the difference between a rule and a hope. */
/* ── scripts/doc-facts.mjs --check ─────────────────────────────────────────────────────────────────── */
/* ⚠ THE CROSS-DOCUMENT GATE. Facts written down in more than one place rot in one place
   at a time, and the reader who opens the stale copy is simply misled. This compares the
   facts that are BOTH written down and measurable against the repository, and against each
   other. It also refuses to let Architecture.md become a changelog again. */
/* ── scripts/agent-sync.mjs ────────────────────────────────────────────────────────────────────────── */
/* (#R503) THE AGENT CONTEXT. The standing instructions, the round procedure and the five
   roles are now written once under `.agents/` and RENDERED into each product's own
   location, because Claude Code reads only `.claude/` and Codex reads only `AGENTS.md`
   plus `.codex/`. This re-renders and compares, so an edit to a copy fails here
   instead of quietly becoming a second source — and it measures AGENTS.md against the
   32,768-byte ceiling Codex truncates it at without a word. */
/* ── scripts/atlas-catalog.mjs --check ─────────────────────────────────────────────────────────────── */
/* ⚠ (#R278) THE ATLAS CATALOGUE GATE. 「an action the catalogue does not describe does not
   exist for the planner」 has been the rule since #R115 and nothing enforced it: six working
   capabilities — the road-network isochrone among them — had a dispatch case and no catalogue
   entry, so asking for 「徒歩1時間で行ける範囲」 returned a radius circle and then 「できません」.
   This compares the dispatch with the prompt on every run. See scripts/atlas-catalog.mjs. */
/* ── scripts/atlas-capability-audit.mjs --check ────────────────────────────────────────────────────── */
/* ⚠ (#R318) …AND THE TWENTY QUESTIONS THAT ONE DOES NOT ASK. The gate above asks whether the
   planner has been TOLD about a capability. It cannot ask whether the capability can be run,
   whether anything watched it happen, whether it invented a target it was not given, or
   whether it reported a promise as a result — which is what #R268, #R291, #R302 and #R309
   each turned out to be. See scripts/atlas-capability-audit.mjs. */
/* ── scripts/atlas-repeat.mjs ──────────────────────────────────────────────────────────────────────── */
/* ⚠⚠⚠ (#R768) …AND THE QUESTION BOTH OF THOSE ASK ABOUT THE CAPABILITY RATHER THAN ABOUT WHAT
   IT REPORTED. A capability can be catalogued, runnable, watched, and still hand Atlas a
   sentence that is not true — measured in production: 「アイスランドに飛んで」 in a backgrounded
   tab answered `no_change` seven times (the code for 「your move did not take effect」) because
   the page was not compositing, and the turn died at its step budget re-flying somewhere it had
   already been sent. The same question in front: one call, `ok`. See
   .agents/rules/one-pass-or-a-reason.md — a repeat is a symptom, and this is the cause a gate
   can measure. ⚠ IT DOES NOT COUNT STEPS (rule §3). */
/* ── scripts/companies-audit.mjs --gate ────────────────────────────────────────────────────────────── */
/* ⚠ (#R354) THE COMPANY-ATLAS GATE. Every other check in this list reads SOURCE; this one
   reads the SHIPPED BYTES of data/companies/, because "the builder drops what it cannot
   source" is a claim about code and the file is what the reader sees. It caught two real
   classes of error while the data was being built: money with no currency or no period, and
   a supermarket filed as a power plant because of the solar panels on its roof. */
/* ── scripts/build-wars.mjs --check ────────────────────────────────────────────────────────────────── */
/* ⚠ (#R381) THE WAR-RECORD GATE, AND THE SECOND ONE HERE THAT READS SHIPPED BYTES. #R349 wrote
   scripts/build-wars.mjs with a `--check` mode and never gave it a caller, so for fifteen rounds
   data/wars.json could have said anything the source did not. It re-derives the file and compares
   it byte for byte — and on the way it runs the whole self-audit: every anchor against the bundled
   gazetteer, every gwcode against CShapes ON ITS DATE, every line against the country it claims to
   divide, every one of 235 named cities against the army the record says held it, and every name
   in the gazetteer against something that quotes it. That last one is what #R349 needed: it had
   178 anchors nothing reached, one per theatre it never wrote. */
/* ── scripts/build-hist-cities.mjs --check ─────────────────────────────────────────────────────────── */
/* (#R427) the THIRD gate here that reads shipped bytes: data/hist-cities.json is re-derived
   from scripts/histcities/ and compared byte for byte, and on the way every tile key in the
   record is bound to a POINT — (#R521) the guard radius, derived as half the distance to the
   nearest settlement on Earth answering to the same spelling, so that «Kochi» renames Kochi
   in Kerala and not 高知市. ⚠ The evidence is data/histcities-homonyms.json.gz, not the news
   locator's gazetteer: that one keeps the most populous homonym and drops the others, which
   is the right answer for a locator and deletes exactly what this gate exists to find. */
/* ── scripts/build-hist-borders.mjs --check ────────────────────────────────────────────────────────── */
/* ⚠ (#R518) …and the FOURTH reads shipped bytes without being able to re-derive them. The
   1850-1885 border record is built from ~400 MB of Overpass responses that no machine here can
   hold, so `--check` proves the committed file's INVARIANTS instead — every record inside the
   window, every ring index resolvable, and a world to draw in every single year of it. That
   residual is written down in docs/TESTING.md rather than implied. It is registered HERE (and
   in ci.yml) because a `check:*` script with no caller is what #R381 found had let
   data/wars.json say anything for fifteen rounds. */
/* ── scripts/build-cshapes.mjs --check ─────────────────────────────────────────────────────────────── */
/* ⚠⚠⚠ (#R700) …AND THE RECORD ALL THREE OF THOSE ARE MEASURED AGAINST HAD NO GATE AT ALL.
   data/cshapes.js answers the whole of 1886-2019, the two world-war layers are cut from its
   outlines, and the line ABOVE derives its own floor from it — yet it was the one border
   bundle with no build script and no `--check`, so nothing could say where 5.6 MB came from.
   What opened this round was the second half: the upstream is CC BY-NC-SA 4.0, which makes
   credit a CONDITION of redistribution, and the js/reference-data.js row that named it
   carried no licence at all (#R689's shape — a licence written as prose nobody reads). The
   gate measures that the credit is PAID, alongside the bundle's own invariants. */
/* ── scripts/build-language.mjs --check ────────────────────────────────────────────────────────────── */
/* (#R538) the FOURTH gate here that reads shipped bytes. The language layer had none, and
   the failure it needed one for was silent by construction: names the old hand table did
   not recognise were dropped rather than reported, so the country took the next language
   down and every test stayed green. This one asks whether `top` IS the largest measured
   share, whether a country without one says so, whether every Glottocode resolves, and
   whether every row of the resolution ledger has a reason written next to it. */
/* ── scripts/build-elections.mjs --check ───────────────────────────────────────────────────────────── */
/* ⚠ (#R588) …and the FIFTH, registered here from its first day for the reason the four above
   it were: the American election map's own generator has carried a `--check` since #R243 and
   nothing has ever called it (⚠ its path is deliberately not spelled out here — the `ci-gates`
   rule in scripts/doc-facts.mjs reads THIS FILE for generator paths, so naming it in prose
   would demand a CI step for a gate this round did not wire). It is named by
   NOTHING — not package.json, not ci.yml — so for eighteen rounds nothing verified the data
   the American election map paints. This one is deliberately OFFLINE (the schema, the party
   table, and the district↔result join in both directions, from the committed bytes) so that
   there is no cost that could ever justify unhooking it. */
/* ── scripts/build-hist-kuni.mjs --check ───────────────────────────────────────────────────────────── */
/* ⚠ (#R669) …and the SIXTH, for the one bundle in the repository IntMap DERIVED rather than
   received. data/hist-kuni.js is the fifteen provinces of Japan OpenHistoricalMap does not
   hold, vectorised from a CC0 raster that is 130 MB and is NOT in the repository — so this
   gate proves the shipped bytes (a null relation id on every row, nine-language names, rings
   that close, and NOT ONE unit that data/hist-admin1.js also holds, which is what would draw
   a boundary twice) and re-derives from upstream only on a machine that has the raster. Both
   halves print which one ran. */
/* ── scripts/build-hist-admin1.mjs --check ─────────────────────────────────────────────────────────── */
/* ⚠ (#R680) …and the SEVENTH, for the two bundles that are BIGGER THAN ALL THE OTHERS PUT
   TOGETHER and had no gate whatsoever. 25.4 MB of first- and second-level subdivisions, and
   until this round nothing in `npm test` or in ci.yml read one byte of them. It is offline and
   measured 0.8 s, so there is no cost that could later justify unhooking it — the same reason
   #R588 gave for the elections gate above. What it proves and what it deliberately cannot see
   are in docs/TESTING.md. */
/* ── scripts/hist-fidelity.mjs --check ─────────────────────────────────────────────────────────────── */
/* ⚠⚠⚠ (#R730) …and the one that asks a DIFFERENT QUESTION of the same bytes. Every gate above
   measures FORM — rings close, spans are ordered, a century is not empty — and all of them
   were green while the map drew 48 ritsuryō provinces in 200 BC, 壱岐国 and 安房国 in 1900,
   and the Shanghai concessions from before there was a Shanghai. What no gate asked was
   whether anybody had SAID any of it. scripts/hist-fidelity.mjs asks that (unsourced spans
   must be 0), plus the two measures that keep the answer honest: land two units of one level
   claim at one instant, and the share of each polity's land that carries a subdivision at all
   — which is the reader's own complaint, 「一部だけ」, turned into a number that a round can
   fail. Offline, ~3 s. .agents/rules/historical-verification.md is the rule it enforces. */
/* ── scripts/build-border-detail.mjs --check ───────────────────────────────────────────────────────── */
/* ⚠⚠ (#R716) …and the EIGHTH, for the LARGEST SHIPPED SURFACE IN THE REPOSITORY — but for a
   DIFFERENT reason than the seven above it. data/border-detail/ (its file count and bytes: data-assets.json; the refined
   outlines drawn when the reader zooms in on all three OHM records) was NOT unguarded: since
   #R711 tests/r711-boundary-quality-data-checks.test.mjs has imported check() and run it, so
   `npm test` already read the bytes. What it lacked was a DECLARED gate, and that is not a
   formality — the three rules that hunt for gates nothing calls (`gate-callers`, `gate-lists`,
   `ci-gates`) all take package.json's check:* scripts as their universe, so a generator that
   keeps its own check to itself is invisible to the very rules written to find it; it is named
   in neither instruction table, and no CI step says its name when it fails.
   ⚠ THE WHOLE-BUNDLE RUN MOVED HERE RATHER THAN BEING ADDED: the r711 test keeps the rejection
   cases it was written for, so the 41 s is paid once, not twice. */
/* ── scripts/build-hist-places.mjs --check ─────────────────────────────────────────────────────────── */
/* (#R716) …and the NINTH, for the half of the settlement layer that had no gate at all.
   data/hist-cities.json has been re-derived byte for byte since #R427; data/hist-places.json
   — the places with no modern name to rename — had two tests exercising the builder's SELECTION
   RULE on fixtures and nothing at all comparing the SHIPPED BYTES to the licensed record they
   are supposed to come from. A selection rule proved on a fixture says nothing about the file
   that ships. Offline, 0.14 s. */
/* ── scripts/data-governance.mjs --check ───────────────────────────────────────────────────────────── */
/* ⚠⚠⚠ (#729) …and the TENTH, which is the one the nine above it could not be. Each of them
   reads ONE bundle, and eight of the nine were written because that bundle had no gate. The
   cross-cutting rule they all imply — 「every shipped data bundle names its terms, its
   upstream and its own age」 — was written down ONCE, as prose, in
   scripts/build-cshapes.mjs:372: 「The general rule … is scripts/doc-facts.mjs's
   `bundle-licence`, whose universe is discovered from data/」. MEASURED: `bundle-licen` occurs
   in exactly one tracked file, and that file is the sentence itself. doc-facts.mjs has no
   such rule and never had one, so the general rule existed only as a pointer to an
   implementation nobody wrote — and 34 of the 69 bundles under data/ named no licence at all,
   27 named no upstream, and 22 carried no date. This gate is that rule.
   ⚠ ITS UNIVERSE IS DISCOVERED, from what data/ holds and from which scripts write into it,
   so a bundle added tomorrow is accounted for the same day. What it refuses is SILENCE, never
   age: a bundle older than its declared cadence is a note, and a bundle that declares no
   cadence is a failure (.agents/rules/no-ad-hoc-hardcoding.md §4). */
