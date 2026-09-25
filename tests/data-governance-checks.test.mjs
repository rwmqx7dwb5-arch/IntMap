/* IntMap · #729 — 「この数字はどこから来た？」 の語彙が守っていること
 *
 * ⚠ EVERY CASE BELOW RESTATES THE DEFECT, NOT THE ANSWER THAT WAS REACHED. memory
 * intmap-restate-the-defect-not-the-fix: #R520 wrote 「1国1点」 where the defect was 「1国につき何十個も
 * 出る」, and that sentence then guarded the OPPOSITE defect for 187 rounds (French Algeria, 410,285 km²,
 * shipped nameless). So each test names what was measured before the vocabulary existed.
 *
 * ⚠ AND ONE OF THEM MEASURES A FILE RATHER THAN A FUNCTION (①). The defect was not that a synonym table
 * was wrong — js/gis-export.js's INTEROP was correct and complete for what it read. The defect was that
 * it was UNREACHABLE, so the 43 scripts that write into data/ and the reader-visible credits each invented their own
 * spellings. A test of behaviour cannot see that; only a test of where the table lives can.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SPELLINGS, FACETS, SUBJECTS, REASONS, FRESHNESS,
  statedValue, read, freshness, attribution, account, measureQuality,
} from '../js/data-governance.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
/* Comments are where this repository explains its defects, and three of them QUOTE a licence
   identifier in order to describe the bug. A rule about what the CODE holds must not read them —
   memory intmap-prose-carriers-are-not-only-markdown is the same distinction from the other side. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ① THE SPELLING TABLE HAD ONE READER BECAUSE IT HAD ONE HOME.
   MEASURED before this round: `INTEROP` was a `const` inside js/gis-export.js's factory closure, so
   nothing outside that file could ask whether `licence` and `license` are one fact — and nothing
   outside it did. The gate, the 43 writers and js/reference-data.js each answered for themselves. */
test('① the synonym table has exactly one home, and js/gis-export.js reads it rather than holding it', () => {
  const exp = codeOnly(src('js/gis-export.js'));
  /* The defect is a SECOND table, not the word INTEROP: a rule about the identifier would pass the
     day somebody renamed it. What may not exist twice is a synonym list containing both spellings. */
  assert.ok(!/\[\s*'licence'\s*,\s*'license'\s*\]/.test(exp),
    'js/gis-export.js holds its own licence/license synonym list again — the vocabulary is js/data-governance.js SPELLINGS');
  assert.ok(/from '\.\/data-governance\.js'/.test(exp),
    'js/gis-export.js no longer reads the shared vocabulary at all');
  /* …and the one home actually says it. ⚠ THE ASSERTION IS 「BOTH SPELLINGS ARE ONE FACT」, NOT THE
     EXACT CONTENTS OF THE LIST. It was written as a deepEqual against `['licence','license']` and
     that failed the very next correct change — adding this registry's own `lic`, which is what
     js/reference-data.js's reader-visible rows and scripts/build-elections.mjs's packs write. A
     frozen list is a ceiling wearing a policy's clothes ([[intmap-ceiling-guards-are-not-policies]]);
     what must hold is that one group answers for every spelling of the word. */
  for (const spelling of ['licence', 'license']) {
    assert.ok(SPELLINGS.licence.includes(spelling), `«${spelling}» is not read as the licence`);
  }
  assert.equal(read({ license: 'X' }).licence, 'X');
  assert.equal(read({ licence: 'X' }).licence, 'X');
});

/* ② THE VOCABULARY HOLDS NO VALUES.
   The failure it is written against is the photograph (memory intmap-discovered-list-is-a-photograph):
   a table of sources kept HERE would be stale on the day it was typed, and the 54-vs-53 shipping
   defect is what that costs. Licence identifiers appear in this file only inside comments that quote
   the bug, which is why this reads the code and not the prose. */
test('② the vocabulary holds no licence values and no table of sources', () => {
  const code = codeOnly(src('js/data-governance.js'));
  for (const needle of ['CC0', 'CC BY', 'ODbL', 'OGL', 'Public domain', 'public domain']) {
    assert.ok(!code.includes(needle), `js/data-governance.js names a licence «${needle}» in code — it must ask whoever states it`);
  }
  /* No publisher names either: a source this file knows by name is a source it can be wrong about. */
  for (const needle of ['OpenStreetMap', 'NASA', 'Open-Meteo', 'Wikidata', 'Pleiades']) {
    assert.ok(!code.includes(needle), `js/data-governance.js names an upstream «${needle}» in code`);
  }
});

/* ③ SILENCE MUST NOT BECOME A CLAIM.
   MEASURED elsewhere in this repository (memory intmap-data-must-not-claim-an-author-it-lacks): nine
   language columns were filled with copies of the English spelling and 67,622 rows then asserted an
   author nobody had. An empty licence field is the same shape in one field. */
test('③ an empty or blank statement is not a statement', () => {
  assert.equal(statedValue({ licence: '' }, 'licence'), null);
  assert.equal(statedValue({ licence: '   ' }, 'licence'), null);
  assert.equal(statedValue({ licence: null }, 'licence'), null);
  assert.equal(statedValue({ attribution: [] }, 'attribution'), null);
  assert.equal(statedValue({}, 'licence'), null);
  assert.equal(statedValue(null, 'licence'), null);
  /* …and a real one is returned unchanged, including `false`, which IS a statement about credit. */
  assert.equal(statedValue({ licence: 'X' }, 'licence'), 'X');
  assert.equal(read({ attribution: false }).creditRequired, false);
});

/* ④ 「確認できなかった」 IS NOT 「失敗した」 — AND IT IS NOT 「古い」 EITHER.
   MEASURED in #R736/#R768 (memory intmap-atlas-failed-because-intmap-said-so): a mechanism that
   returned the same word for 「measured a failure」 and 「could not measure」 burned 21 turns retrying a
   map that had been correct the whole time. Freshness is the same fork: `stale` is an observation
   against a declared cadence, `unknown` is the absence of the instrument, and they are fixed
   differently — by refetching, and by somebody declaring a cadence. */
test('④ unknown is not a weaker stale, and the two carry different reasons', () => {
  const past = freshness({ generatedAt: '2026-09-15T00:00:00Z', cadence: 'P1D' }, '2026-09-18T00:00:00Z');
  const noCadence = freshness({ generatedAt: '2026-09-15T00:00:00Z' }, '2026-09-18T00:00:00Z');
  assert.equal(past.verdict, 'stale');
  assert.equal(noCadence.verdict, 'unknown');
  assert.notEqual(past.reason, noCadence.reason, 'the two silences answer with the same reason');
  /* ⚠ AND THE UNKNOWN ONE STILL REPORTS THE AGE IT COULD MEASURE. Withholding it would turn
     「周期が無い」 into 「何も分からない」, which is a second collapse of the same kind. */
  assert.equal(noCadence.ageDays, 3);
  /* A bundle with no date at all cannot be aged, and says so with null rather than 0. */
  assert.equal(freshness({}, '2026-09-18').ageDays, null);
  /* 「更新されない」 is a freshness ANSWER. A derived bundle whose inputs are fixed is as current as it
     will ever be; calling it `unknown` sends a reader after a refresh that does not exist. */
  const fixed = freshness({ generatedAt: '2020-01-01', cadence: 'static' }, '2030-01-01');
  assert.equal(fixed.verdict, 'fresh');
  assert.equal(fixed.reason, 'static-by-construction');
  /* Every verdict and every reason is in the declared vocabulary — a code invented at the call site
     is a word no reader can be given a sentence for. */
  for (const f of [past, noCadence, fixed, freshness({}, '2026-09-18')]) {
    assert.ok(FRESHNESS.includes(f.verdict), `undeclared verdict ${f.verdict}`);
    assert.ok(f.reason == null || REASONS.includes(f.reason) || f.reason === 'older-than-declared-cadence',
      `undeclared reason ${f.reason}`);
  }
});

/* ⑤ MONTHS AND YEARS ARE CALENDAR DATES, NOT LENGTHS.
   MEASURED in #R602 (memory intmap-r602-lessons): Date's two-digit-year rule was stepped on in four
   places. A cadence of P1Y implemented as 365 days calls a bundle stale on the 366th day of a leap
   year — a verdict produced by the arithmetic rather than by the supplier. */
test('⑤ a yearly cadence is a year on the calendar, and a bare year is that year in UTC', () => {
  /* 2028 is a leap year: 2027-03-01 + P1Y is 2028-03-01, which is 366 days later. */
  assert.equal(freshness({ generatedAt: '2027-03-01', cadence: 'P1Y' }, '2028-02-29').verdict !== 'stale', true);
  assert.equal(freshness({ generatedAt: '2027-03-01', cadence: 'P1Y' }, '2028-03-02').verdict, 'stale');
  /* A bare year is that year, read as UTC — not the reader's local midnight. */
  assert.equal(freshness({ generatedAt: '2017', cadence: 'static' }, '2017-01-01T00:00:00Z').ageDays, 0);
  /* A string that is not a date is 「述べていない」, never NaN wearing a Date's clothes. */
  const junk = freshness({ generatedAt: 'sometime last year', cadence: 'P1D' }, '2026-09-18');
  assert.equal(junk.verdict, 'unknown');
  assert.equal(junk.ageDays, null);
  /* A cadence nobody can read is a DIFFERENT silence from one nobody wrote. */
  assert.equal(freshness({ generatedAt: '2026-09-15', cadence: 'weekly-ish' }, '2026-09-18').reason,
    'upstream-states-no-cadence');
  assert.equal(freshness({ generatedAt: '2026-09-15' }, '2026-09-18').reason, 'facet-undeclared');
});

/* ⑥ A FILE IS ONLY AS REDISTRIBUTABLE AS ITS LEAST PERMISSIVE PART.
   data/hist-cities.json ships three upstreams in one bundle. One licence for the file is a claim no
   upstream made — and the specific failure already paid for was the other direction: a CC BY 3.0
   upstream shipped with zero attribution because the bundle's own terms were read as the whole story
   (memory intmap-licence-must-be-a-value). */
test('⑥ any upstream requiring credit makes the bundle require it; any silence leaves the question open', () => {
  const mixed = read({ rights: [
    { publisher: 'A', licence: 'CC0 1.0', attribution: false },
    { publisher: 'B', licence: 'CC BY 3.0', attribution: true },
  ] });
  assert.equal(mixed.creditRequired, true);
  assert.equal(mixed.upstreams.length, 2);
  /* ⚠ SILENCE IS NOT 「不要」. One upstream that says nothing leaves the answer null, never false —
     the rule js/gis-sources.js §3.1 states for coverage (沈黙は all ではない). */
  const partly = read({ rights: [{ publisher: 'A', attribution: false }, { publisher: 'B' }] });
  assert.equal(partly.creditRequired, null);
  const allClear = read({ rights: [{ publisher: 'A', attribution: false }, { publisher: 'B', attribution: false }] });
  assert.equal(allClear.creditRequired, false);
  /* Two licences cannot be summarised into one, so the bundle names none and the list is the answer. */
  assert.equal(mixed.licence, null);
  assert.equal(read({ rights: [{ licence: 'CC0 1.0' }] }).licence, 'CC0 1.0');
});

/* ⑦ THE DISPLAY STRING IS DERIVED FROM THE VALUES, AND NEVER INVENTED.
   MEASURED before this round: js/map-ui.js held
   `source:()=>'aisstream.io / Digitraffic (Fintraffic, CC BY 4.0) AIS'` — a licence obligation legible
   to a human and to nothing else. The direction matters: #R763 fixed the same shape for quantities
   (a registration states the value, the sentence comes from it), and parsing the sentence back apart
   would recover neither the unit nor the digits the rounding threw away. */
test('⑦ attribution derives a line from what is stated, and states nothing else', () => {
  assert.equal(attribution({ publisher: 'P', licence: 'L' }), 'P · L');
  /* An absent publisher shortens the line. It does not produce 「出典不明」 or a default licence. */
  assert.equal(attribution({ licence: 'L' }), 'L');
  assert.equal(attribution({ publisher: 'P' }), 'P');
  assert.equal(attribution({}), null);
  assert.equal(attribution({ licence: '' }), null);
  /* A credit line the upstream WROTE outranks our name for the publisher — it is the sentence they
     asked to be shown, and 「表示する文」 and 「誰の仕事か」 are two different facts wearing one word. */
  assert.equal(attribution({ publisher: 'P', credit: 'Data © P and contributors', licence: 'L' }),
    'Data © P and contributors · L');
  assert.equal(attribution({ rights: [{ publisher: 'A', licence: 'X' }, { publisher: 'B', licence: 'Y' }] }),
    'A · X / B · Y');
});

/* ⑧ EVERY FACET LANDS IN EXACTLY ONE OF THREE PLACES, AND AN ABSENT KEY IS NONE OF THEM.
   This is js/gis-atlas.js prefetch()'s invariant, and the reason it exists is that 「宣言が無い」 and
   「その問いは当たらない」 send a planner in opposite directions: one is fixed by asking a reader, the
   other by not asking. A key that is simply missing teaches neither. */
test('⑧ the facets are accounted for — stated, undeclared with a why, or not applicable with a why', () => {
  for (const [label, rec, opts] of [
    ['an empty record', {}, { hasBuilder: false }],
    ['a full record', {
      publisher: 'P', url: 'u', licence: 'L', licenceUrl: 'lu', attribution: true, paidBy: 'row',
      retrievedAt: '2026-09-01', generatedAt: '2026-09-01', asOf: '2020', cadence: 'P1Y',
      builtBy: 'scripts/x.mjs', schema: 'scripts/lib/y.mjs',
      quality: { rows: 1, missing: {}, outOfRange: {}, duplicates: 0 },
      priority: { rank: 1, over: ['other'] },
    }, {}],
    ['a public-domain record', { licence: 'L', attribution: false }, {}],
    ['a multi-upstream record', { rights: [{ licence: 'X' }, { licence: 'Y' }] }, {}],
  ]) {
    const a = account(rec, { ...opts, now: '2026-09-18' });
    const seen = new Map();
    for (const f of FACETS) {
      const [sub, key] = [f.slice(0, f.indexOf('.')), f.slice(f.indexOf('.') + 1)];
      const stated = Object.prototype.hasOwnProperty.call(a[sub] || {}, key);
      const und = a.undeclared.some((x) => x.facet === f);
      const na = a.notApplicable.some((x) => x.facet === f);
      const n = [stated, und, na].filter(Boolean).length;
      assert.equal(n, 1, `${label}: facet ${f} appears in ${n} places, not exactly 1`);
      seen.set(f, stated ? 'stated' : (und ? 'undeclared' : 'notApplicable'));
    }
    /* Every silence carries a reason from the declared vocabulary. */
    for (const x of [...a.undeclared, ...a.notApplicable]) {
      assert.ok(REASONS.includes(x.why), `${label}: facet ${x.facet} is silent for an undeclared reason «${x.why}»`);
      assert.ok(FACETS.includes(x.facet), `${label}: accounted for a facet nobody declared: ${x.facet}`);
    }
    /* ⚠ THE VERDICT IS ALWAYS STATED, INCLUDING `unknown`: it is this module's own measurement, not
       a supplier's silence, so it carries derived:true the way #R759 gave a derived coverage. */
    assert.equal(seen.get('freshness.verdict'), 'stated', `${label}: the freshness verdict went silent`);
    assert.equal(a.freshness.verdict.derived, true);
  }
  /* The row that pays a credit is owed only where the terms impose it — asking a public-domain
     bundle for one would fail it against somebody else's licence. */
  const pd = account({ licence: 'L', attribution: false }, {});
  assert.deepEqual(pd.notApplicable.find((x) => x.facet === 'rights.paidBy').why, 'licence-imposes-no-credit');
  /* Precedence does not apply to a bundle with one upstream, and DOES become a question with two. */
  assert.ok(account({ licence: 'L' }, {}).notApplicable.some((x) => x.facet === 'precedence.rank'));
  assert.ok(account({ rights: [{ licence: 'X' }, { licence: 'Y' }] }, {}).undeclared.some((x) => x.facet === 'precedence.rank'));
  /* SUBJECTS is derived from FACETS: a hand-written list here could lose a subject the facets gained. */
  assert.deepEqual(SUBJECTS, [...new Set(FACETS.map((f) => f.slice(0, f.indexOf('.'))))]);
});

/* ⑨ THE QUALITY PASS MEASURES. IT DOES NOT JUDGE.
   The refusal this is written against is the threshold with no author (.agents/rules/
   no-ad-hoc-hardcoding.md §4): a range invented here, for 69 bundles whose upstreams IntMap has not
   read, deletes correct data the first time it is wrong. So a field with no declared range is never
   out of range, and a value that is not a number is a TYPE problem reported under its own name —
   folding it into 「範囲外」 reports the wrong defect and sends the fix to the wrong place. */
test('⑨ quality counts what was declared, and never invents a range or an identity', () => {
  const q = measureQuality(
    [{ n: 'a', v: 5 }, { n: 'a', v: 500 }, { n: '', v: 'text' }, { n: 'a', v: 5 }],
    { fields: { n: {}, v: { min: 0, max: 100 } }, key: ['n', 'v'] },
  );
  assert.equal(q.rows, 4);
  assert.equal(q.missing.n, 1, 'a blank string is a missing value');
  /* ⚠ THE FIELD WITH NO DECLARED RANGE HAS NO out-of-range COUNT AT ALL — 「範囲を述べていない」 is
     not 「0〜1」, and an entry of 0 would read as 「測って、全部範囲内だった」. */
  assert.ok(!Object.prototype.hasOwnProperty.call(q.outOfRange, 'n'));
  assert.equal(q.outOfRange.v, 1, '500 is outside the declared 0..100');
  assert.equal(q.notNumeric.v, 1, "'text' is a type problem, not an out-of-range value");
  assert.equal(q.duplicates, 1);
  /* ⚠ AN UNDECLARED IDENTITY IS NOT A GUESSED ONE. Without a key the answer is 「測っていない」 —
     absent, so a reader cannot mistake it for 「重複ゼロ」. A detector that invents its own identity
     deletes 東京都 or 東京市 (js/world-packs.js dedupeSameShape is about SHAPES, not places). */
  assert.ok(!Object.prototype.hasOwnProperty.call(measureQuality([{ a: 1 }, { a: 1 }], { fields: { a: {} } }), 'duplicates'));
  /* The key distinguishes 1 from '1' and does not collapse two rows because one holds a separator. */
  assert.equal(measureQuality([{ a: 1 }, { a: '1' }], { key: ['a'] }).duplicates, 0);
  assert.equal(measureQuality([{ a: 'x', b: 'y' }, { a: 'x y', b: '' }], { key: ['a', 'b'] }).duplicates, 0);
  /* Nothing at all is measurable from nothing, and that is 0 rows rather than a throw. */
  assert.equal(measureQuality(null, {}).rows, 0);
});

/* ⑩ THE MODULE IS READABLE WHERE THERE IS NO DOCUMENT.
   The whole point of one vocabulary is that the gate and the app read the SAME one. A vocabulary that
   touches `window` at module scope is a vocabulary only the browser can have, and
   scripts/data-governance.mjs would then need a second copy — the shape
   [[intmap-two-readers-one-field-list]] measures. This test runs in Node with no DOM, so the import
   at the top of this file is half the proof; the other half is that building one does not throw. */
test('⑩ the vocabulary imports and builds with no window, and the mount is registered', async () => {
  const mod = await import('../js/data-governance.js');
  assert.equal(typeof globalThis.window, 'undefined', 'this test is not measuring what it claims to');
  const api = mod.makeDataGovernance();
  for (const k of ['spellings', 'facets', 'subjects', 'reasons', 'freshnessWords',
    'statedValue', 'read', 'freshness', 'attribution', 'account', 'measureQuality']) {
    assert.equal(typeof api[k], 'function', `the mounted door is missing ${k}`);
  }
  /* The assembly must actually mount it — a kernel nothing constructs is a kernel the app does not
     have, and js/gis-core.js's reachability loop is what proves the globals resolve. */
  const core = codeOnly(src('js/gis-core.js'));
  assert.ok(/makeDataGovernance\(\)/.test(core), 'js/gis-core.js does not build the governance kernel');
  assert.ok(/'IntMapDataGovernance'/.test(core), 'js/gis-core.js does not check that the kernel is reachable');
});

/* ⑪ THE GATE IS DECLARED, AND DECLARED IN EVERY PLACE THAT TAKES ATTENDANCE.
   MEASURED in #R716: three separate rules hunt for gates nothing calls, and all three take
   package.json's `check:*` as their universe — so a checker that keeps itself to itself is invisible
   to the very rules written to find it (memory intmap-gate-universe-is-declared-gates). The
   cross-cutting data rule spent one round as a COMMENT pointing at an implementation nobody wrote;
   this case exists so that cannot be true of it a second time. */
test('⑪ check:datagov is a declared gate with a caller and a row in both instruction tables', () => {
  const pkg = JSON.parse(src('package.json'));
  assert.equal(typeof pkg.scripts['check:datagov'], 'string', 'check:datagov is not a declared gate');
  assert.ok(/data-governance\.mjs/.test(pkg.scripts['check:datagov']));
  assert.ok(/scripts\/data-governance\.mjs/.test(src('scripts/test-parallel.mjs')),
    '`npm test` does not run the gate');
  assert.ok(/check:datagov/.test(src('.agents/rules/execution-strategy.md')),
    'the gate is in no instruction table, so no session is told to run it');
  assert.ok(/check:datagov/.test(src('.agents/roles/intmap-verifier.md')),
    'the verifier role does not know the gate exists');
  /* ⚠ AND THE COMMENT THAT PROMISED THE RULE MUST NO LONGER POINT SOMEWHERE EMPTY. Measured before
     this round: `bundle-licen` occurred in exactly one tracked file — the sentence claiming the rule
     lived in scripts/doc-facts.mjs — and doc-facts.mjs had no such rule. */
  const cshapes = src('scripts/build-cshapes.mjs');
  if (/bundle-licen/.test(cshapes)) {
    assert.ok(/data-governance/.test(cshapes),
      'scripts/build-cshapes.mjs still names a general rule without naming where it is implemented');
  }
  /* The canon has a row in the document index, or nothing tells a reader it exists. */
  assert.ok(/DATA-GOVERNANCE\.md/.test(src('docs/README.md')), 'docs/README.md does not index the canon');
});

/* ⑬ THE NAMING RULE AND THE TIER RULE HAVE TO BE ABLE TO AGREE.
   scripts/tiers.mjs carried the exception 「a change's own spec stands in the gate whatever it
   costs」, and it found that spec with `^r(d+)$` — a name consisting of a number alone. #R674 made
   `tests/r<N>-<主題>.spec.js` the REQUIRED form and check:static's `round-name` rule REFUSED the bare
   one, so the convention every change had to follow produced a name the exception could not see.
   MEASURED when this was found (#729): 83 specs carried the old bare name, 30 the mandated one, and
   currentRoundSpec() answered `r668`. With CORE_MAX_S at 1 s that put every change's own regression
   spec in `deep` — the tier memory intmap-deep-tier-rots-unwatched records as running nightly and on
   nothing else ([[intmap-policy-must-be-executable-by-its-gate]]).
   ⚠ MAIN FIXED THE SAME DEFECT ONE LEVEL DEEPER while #729 was open: the change's own specs are now
   read from the DIFF (`changedSpecs()`), not from any name, and names no longer carry a number at all
   (this file's own spec is `tests/data-governance.spec.js`). So what is asserted is the agreement,
   not a pattern: a spec named the way the naming rule now requires — a subject, no number — is
   recognised as this change's own when the diff says so, stands in core, and is not taken away from
   the nightly by being touched. */
test('⑬ the tier logic recognises the spec name the naming rule mandates', async () => {
  const tiers = await import('../scripts/tiers.mjs');
  assert.equal(typeof tiers.currentRoundSpec, 'undefined', 'a name-derived «current round spec» is back in scripts/tiers.mjs');
  const mine = 'data-governance';
  assert.ok(readdirSync(join(ROOT, 'tests')).includes(mine + '.spec.js'), "this change's own spec is not on disk — this case measured nothing");
  const env = { IM_CHANGED_SPECS: 'tests/' + mine + '.spec.js' };
  assert.deepEqual(tiers.changedSpecs(env), [mine], 'the tier logic does not recognise a spec named by its subject alone');
  assert.ok(tiers.coreNames(env).includes(mine), mine + ' was touched and is not in the core tier, which is what runs in front of the PR');
  assert.ok(tiers.inTier('tests/' + mine + '.spec.js', 'core', env), mine + ' is not selected for the core run');
  /* …and being touched does not take it out of the nightly: deep is the complement of the FIXED gate. */
  assert.equal(tiers.isDeep(mine), !tiers.fixedCoreNames().includes(mine));
});

/* ⑫ A DECLARATION IS A MAP FROM OUTPUT PATH TO RECORD, AND THE GATE HAS TO OPEN IT.
   MEASURED while this round was being assembled: the gate pushed the whole
   `{ 'data/x.json': {…} }` object in as the record, so js/data-governance.js read() looked for
   `licence` at the TOP level of a map and found nothing. Thirty-two builders had declared their
   terms and the gate still reported ONE record making credit a condition of redistribution — it was
   green, and the rule it exists to enforce was reading an empty object. Opening the map took the
   count to fifteen, fourteen of them paid by a real DATA_SOURCES row.
   ⚠ THIS CASE MEASURES THE GATE'S OUTPUT AGAINST THE TREE, not against a number somebody typed: the
   floor is how many `attribution: true` statements the declarations actually contain, so it moves
   with the repository and cannot be satisfied by a gate that has stopped looking. */
test('⑫ the gate reads a declaration at the record level, not at the map level', () => {
  const dir = join(ROOT, 'scripts');
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.mjs')) files.push(p);
    }
  };
  walk(dir);
  /* Count the declarations that say credit is a CONDITION, from the source the gate reads. */
  let owed = 0;
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    const i = t.indexOf('export const GOVERNANCE');
    if (i < 0) continue;
    owed += (t.slice(i).match(/attribution:\s*true/g) || []).length;
  }
  assert.ok(owed > 1, `the tree holds ${owed} declared attribution conditions — this case cannot measure anything`);
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'data-governance.mjs'), '--check'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /credit is a CONDITION\s+(\d+)/.exec(out);
  assert.ok(m, 'the gate no longer reports how many records make credit a condition');
  assert.ok(Number(m[1]) >= owed,
    `the gate sees ${m[1]} credit conditions but the declarations state at least ${owed} — it is reading the map, not the records`);
});
