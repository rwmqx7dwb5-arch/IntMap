/* ============================================================================
 *  R345 — the ninth time a check answered «yes» to its own explanatory note
 * ----------------------------------------------------------------------------
 *  tests/helpers/fn-cors.js (#R333) reads each Edge Function's CORS contract out of the repository
 *  with two regular expressions, and refuses to guess when either matches twice (#R323). It did not
 *  strip comments first.
 *
 *  MEASURED IN #R339: supabase/functions/aviation-feed/index.ts made exactly ONE call,
 *  corsFor("x-intmap-channel"), and named corsFor() once more in the comment explaining why the
 *  function extends the shared builder locally. The comment matched the no-argument branch of the
 *  pattern, `onlyMatch` called the contract ambiguous, and FIVE tests in tests/r333-checks.test.mjs
 *  went red on a file whose contract was never in doubt. #R339 reworded its own comment and moved
 *  on — which fixes that file and leaves the parser waiting for the next one.
 *
 *  ⚠ THE SECOND GHOST IS QUIETER AND WORSE. The literal table is tried BEFORE corsFor(), so a
 *  table left behind in a comment — the shape every migration to the shared builder leaves — used
 *  to outrank the live call underneath it. Nothing throws: the function is simply reported with
 *  the wrong header set, and the extra header the live call contributes disappears.
 *
 *  The repository had already solved this once: scripts/atlas-capability-audit.mjs (#R318) counted
 *  eight occurrences and wrote a stripper inline. So the stripper moved to scripts/code-only.mjs,
 *  both readers import it, and ⑩ below fails if a third copy is ever written.
 *
 *  Every check here is proved in BOTH directions — the fixture with the defect present asserts the
 *  new answer, and a fixture with a GENUINE second contract asserts the refusal still happens. A
 *  green gate nobody has seen go red is not evidence (#R318).
 * ==========================================================================*/
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import {
  repoCorsContract, corsForAllowHeaders, declaredAllowHeaders, sharedCorsBase,
  frontendCustomHeaders,
} from './helpers/fn-cors.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = sharedCorsBase(ROOT);

/* ── a throw-away checkout with the same SHAPE as supabase/functions/ ─────────────────────────
   ⚠ os.tmpdir() through mkdtemp, never a fixed path: a shared scratch name is how #R329 wrote one
   session's index rows into another session's file. */
const TMP = mkdtempSync(join(tmpdir(), 'intmap-r345-'));
after(() => rmSync(TMP, { recursive: true, force: true }));

let seq = 0;
/** Build a one-function fixture root and hand back its path. `fns` is name → index.ts source. */
function fixtureRoot(fns, extra = {}) {
  const root = join(TMP, 'fx' + (++seq));
  const shared = join(root, 'supabase/functions/_shared');
  mkdirSync(shared, { recursive: true });
  /* the REAL builder, so the base set under test is the one production answers with */
  writeFileSync(join(shared, 'relay-guard.js'),
    readLF(join(ROOT, 'supabase/functions/_shared/relay-guard.js')));
  for (const [name, src] of Object.entries(fns)) {
    mkdirSync(join(root, 'supabase/functions', name), { recursive: true });
    writeFileSync(join(root, 'supabase/functions', name, 'index.ts'), src);
  }
  for (const [rel, src] of Object.entries(extra)) {
    mkdirSync(join(root, rel.slice(0, rel.lastIndexOf('/'))), { recursive: true });
    writeFileSync(join(root, rel), src);
  }
  return root;
}

/* The file #R339 measured, restored to the shape that broke the parser. */
const AVIATION = [
  '// aviation-feed extends the shared builder locally rather than declaring a table of its own:',
  '// corsFor() by itself allows nothing this endpoint needs beyond the base four, so the channel',
  '// header is passed in as the extra argument below.',
  'import { corsFor } from "../_shared/relay-guard.js";',
  '',
  'const CORS = corsFor("x-intmap-channel");',
  '',
  'Deno.serve((req) => new Response("{}", { headers: { ...CORS, "content-type": "application/json" } }));',
  '',
].join('\n');

test('1. the reported failure, reproduced: the builder named in a comment is not a second contract', () => {
  /* the fixture really does carry the defect — plain substring count, no pattern to drift */
  assert.equal(AVIATION.split('corsFor(').length - 1, 2,
    'the source must name corsFor( twice for this to be the measured case');

  const contract = repoCorsContract(fixtureRoot({ 'aviation-feed': AVIATION }));
  const got = contract.get('aviation-feed');
  assert.equal(got.via, 'corsFor', 'the ONE call is the contract; the sentence above it is not');
  assert.ok(got.headers.has('x-intmap-channel'), 'and its extra header survives');
  for (const h of BASE) assert.ok(got.headers.has(h), `the base header ${h} is still there`);
  assert.equal(got.headers.size, BASE.size + 1, 'base + the one extra, nothing invented');
});

test('2. …and the refusal still happens when a function genuinely calls the builder twice', () => {
  /* ⚠ The point of ① is NOT that ambiguity became allowed. Two real calls are still two answers. */
  const twice = AVIATION.replace('const CORS = corsFor("x-intmap-channel");',
    'const CORS = corsFor("x-intmap-channel");\nconst ALT = corsFor("range");');
  assert.throws(() => repoCorsContract(fixtureRoot({ 'aviation-feed': twice })), /ambiguous/,
    'a file with two contracts must refuse, not pick one');
  /* the same statement at the level of the exported function, with no file system in the way */
  assert.throws(() => corsForAllowHeaders('const A=corsFor();\nconst B=corsFor("range");', BASE, 'two'),
    /ambiguous/);
  assert.equal(corsForAllowHeaders('// corsFor() is described here and called nowhere\n', BASE, 'prose'),
    null, 'a mention with no call is no contract at all');
});

test('3. a table left behind in a comment does not outrank the live call underneath it', () => {
  /* This is the QUIET half: nothing throws, the function is simply reported with the wrong set. */
  const migrated = [
    '// The table used to be written out here, before the four relays were given one builder:',
    '//   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",',
    '// Keeping it in prose is how a reader learns what changed.',
    'import { corsFor } from "../_shared/relay-guard.js";',
    'const CORS = corsFor("x-intmap-channel");',
    '',
  ].join('\n');
  const got = repoCorsContract(fixtureRoot({ 'cable-geo': migrated })).get('cable-geo');
  assert.equal(got.via, 'corsFor', 'the commented-out table is not a declaration');
  assert.ok(got.headers.has('x-intmap-channel'),
    'reading the ghost would have silently dropped the header the live call adds');
});

test('4. the header-allow-list scan refuses two REAL tables, and reads a live one past a dead one', () => {
  assert.throws(() => declaredAllowHeaders(
    '"Access-Control-Allow-Headers": "a"\n"Access-Control-Allow-Headers": "b"', 'two'),
  /ambiguous/, 'two literal tables are still ambiguous');
  const one = declaredAllowHeaders([
    '/* was: "Access-Control-Allow-Headers": "authorization, apikey" */',
    'const CORS = { "Access-Control-Allow-Headers": "authorization, apikey, x-intmap-turn" };',
  ].join('\n'), 'one');
  assert.deepEqual([...one].sort(), ['apikey', 'authorization', 'x-intmap-turn'],
    'the live table is read, the commented one is not counted beside it');
  assert.equal(declaredAllowHeaders('// "Access-Control-Allow-Headers": "a"\n', 'prose'), null,
    'a table that exists only in prose is no table');
});

test('5. index.ts vs the file beside it is decided by the file system, so no comment can move it', () => {
  const withGhostSibling = [
    '// The Gemini variant beside this file, index.gemini-backup.ts, still declares',
    '// "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" —',
    '// it is not deployed, and this comment is the only place the two are mentioned together.',
    'import { corsFor } from "../_shared/relay-guard.js";',
    'const CORS = corsFor("x-intmap-turn");',
    '',
  ].join('\n');
  const root = fixtureRoot({ 'ai-proxy': withGhostSibling }, {
    'supabase/functions/ai-proxy/index.gemini-backup.ts':
      'const CORS = { "Access-Control-Allow-Headers": "authorization, apikey" };\n',
  });
  const got = repoCorsContract(root).get('ai-proxy');
  assert.equal(got.via, 'corsFor', 'the sibling file is never read — index.ts only');
  assert.ok(got.headers.has('x-intmap-turn'), 'and the live call still supplies the extra header');
});

test('6. a header the front end no longer sends is not counted as sent', () => {
  const root = fixtureRoot({}, {
    'js/live.js': "const h = {}; h['x-intmap-turn'] = String(id);\n",
    'js/dead.js': [
      "// h['x-intmap-ghost'] = v;   removed when the turn id took over",
      "/* the object form went too:  { 'x-intmap-legacy': v } */",
      "export const send = (h) => h;",
    ].join('\n'),
  });
  const front = frontendCustomHeaders(root);
  assert.deepEqual([...front.keys()].sort(), ['x-intmap-turn'],
    'only the assignment that runs counts');
  assert.deepEqual(front.get('x-intmap-turn'), ['js/live.js'], 'and it names the file that sends it');
  /* the other direction: uncomment either line and it IS a send again */
  const alive = fixtureRoot({}, { 'js/live.js': "h['x-intmap-ghost'] = v;\n" });
  assert.deepEqual([...frontendCustomHeaders(alive).keys()], ['x-intmap-ghost'],
    'a real assignment is still found — the stripper removed comments, not the check');
});

/* the two-line regex pair scripts/atlas-capability-audit.mjs carried inline until #R345 */
const LEGACY = (src) => String(src)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split(/\r?\n/).map((l) => l.replace(/(^|[^:\\'"`])\/\/.*$/, '$1')).join('\n');

test('7. the stripper removes comments and leaves string literals exactly as they were', () => {
  const keep = [
    ['a url mid-string', 'const u = "see https://x.y/z for why";'],
    ['a slash pair in prose inside a string', "const s = 'not // a comment';"],
    ['a block-comment opener in a string', 'const s = "starts with /* and ends with it";'],
    ['a regex whose class holds both characters', 'const re = /[/*]+/g;'],
    ['a template with a substitution', 'const t = `a ${x} // b`;'],
    ['an opener and a closer in two strings',
      'const a = "opens /*"; const CORS = corsFor("x"); const b = "closes */";'],
    ['a class opener and a closer in a string',
      'const re = /[/*]/; const CORS = corsFor("x"); const end = "*/";'],
  ];
  for (const [what, src] of keep) {
    assert.equal(codeOnly(src), src, `${what}: string content is code, not commentary`);
  }

  assert.equal(codeOnly('a = 1; // corsFor()\nb = 2;'), 'a = 1; \nb = 2;', 'a line comment goes');
  assert.equal(codeOnly('a/* corsFor() */b'), 'a  b', 'a block comment goes');
  /* line structure survives: a three-line block comment leaves its line breaks behind, so nothing
     that was on two lines is spliced onto one — the inline version collapsed it to one space. */
  assert.equal(codeOnly('a\n/* one\ntwo\nthree */\nb').split('\n').length, 5,
    'five lines in, five lines out');
});

test('8. …and the heuristic it replaced is shown wrong, on the record, not assumed', () => {
  /* ⚠ MEASURED, not asserted in bulk: the pair defends a `//` that sits directly behind a quote or
     a colon, so "https://…" was already safe and an UNCLOSED /* was already ignored. What it never
     defended is a quote or a character class that spells an opener whose CLOSER turns up later in
     the file — and there the damage is not a stray character, it is a deleted call. */
  const wrong = [
    ["const s = 'not // a comment';", "const s = 'not "],
    ['const t = `a ${x} // b`;', 'const t = `a ${x} '],
  ];
  for (const [src, mangled] of wrong) {
    assert.equal(LEGACY(src), mangled, 'the replaced heuristic really did truncate this');
    assert.equal(codeOnly(src), src, 'and the shared one does not');
  }

  const swallowed = [
    'const a = "opens /*"; const CORS = corsFor("x-intmap-channel"); const b = "closes */";',
    'const re = /[/*]/; const CORS = corsFor("x-intmap-channel"); const end = "*/";',
  ];
  for (const src of swallowed) {
    assert.ok(!LEGACY(src).includes('corsFor'), 'the replaced heuristic deleted the whole call');
    assert.equal(corsForAllowHeaders(LEGACY(src), BASE, 'legacy'), null,
      'so the contract would have been reported as unreadable — via:"unknown"');
    const got = corsForAllowHeaders(src, BASE, 'shared');
    assert.ok(got && got.has('x-intmap-channel'), 'read through the shared stripper it is right there');
  }
});

test('9. the eight shipped functions still read the same after the stripper runs', () => {
  /* ⚠ A stripper that ate production code would be invisible in the fixtures above and loud here. */
  const contract = repoCorsContract(ROOT);
  assert.ok(contract.size >= 8, `expected the documented 8+ functions, saw ${contract.size}`);
  for (const [name, v] of contract) {
    assert.notEqual(v.via, 'unknown', `${name}: its contract must still be readable`);
    assert.ok(v.headers.has('content-type'), `${name}: content-type survived the strip`);
    assert.ok(v.headers.has('authorization'), `${name}: authorization survived the strip`);
  }
  assert.ok(contract.get('ai-proxy').headers.has('x-intmap-turn'),
    'the header whose absence took Atlas down is still read out of the live table');
  assert.ok(contract.get('sv-cov').headers.has('range'), 'and corsFor("range") still contributes');
});

test('10. there is ONE stripper, and both readers import it', () => {
  /* ⚠ (#R318) counted eight occurrences of this defect before writing the first stripper; the
     ninth arrived because the fix lived inside one file. A second copy is how a tenth arrives. */
  const mod = readLF(new URL('../scripts/code-only.mjs', import.meta.url));
  assert.match(mod, /export function codeOnly/, 'the shared module still exports it');
  for (const rel of ['tests/helpers/fn-cors.js', 'scripts/atlas-capability-audit.mjs']) {
    const src = readLF(join(ROOT, rel));
    assert.match(src, /import \{ codeOnly \}/, `${rel} imports the shared stripper`);
    assert.doesNotMatch(codeOnly(src), /(const|let|function)\s+codeOnly\s*[=(]/,
      `${rel} must not define a stripper of its own`);
  }
  /* and fn-cors reads code, not prose, everywhere it reads source at all */
  const helper = codeOnly(readLF(join(ROOT, 'tests/helpers/fn-cors.js')));
  assert.doesNotMatch(helper, /String\(src\)\.matchAll/, 'onlyMatch no longer scans the raw file');
  assert.match(helper, /codeOnly\(src\)\.matchAll/, '…it scans the code');
  assert.match(helper, /codeOnly\(readLF\([\s\S]*?\)\)\.matchAll\(FRONT_RE\)/,
    'and so does the front-end header scan');
});
