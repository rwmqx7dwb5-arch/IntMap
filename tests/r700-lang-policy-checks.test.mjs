/* ============================================================================
 *  IntMap · R700 — THE LANGUAGE AMENDMENT, AND THE DELETION IT IS NOT   (#R700)
 * ----------------------------------------------------------------------------
 *  CONSTITUTION.md §7 narrowed AUTHORING to en+jp on 2026-09-11. The dangerous reading of that
 *  amendment is «the gate may stop asking the other seven anything», which would let 421 keyed
 *  rows, 463 page strings and 6,000-7,336 call-site strings PER LANGUAGE rot out one deletion at a
 *  time with nothing red. These checks pin the distinction.
 *
 *  ⚠ WHAT THEY DO NOT DO IS READ scripts/i18n-audit.mjs FOR WORDS. That gate costs 28.7 s
 *  (MEASURED, thirteen child instruments) so it cannot run here, and grepping its source for
 *  «floor» would be #R488 exactly — a check that pins a spelling and stays green the day the rule
 *  stops being called (#R505: source-reading cannot see evaluation). The rule is a pure function in
 *  scripts/i18n-floor.mjs; the gate calls it and so does ③ below, on synthetic pairs.
 *
 *  ⚠ AND EVERY ONE OF THESE WAS BROKEN ON PURPOSE BEFORE IT WAS COMMITTED. The mutations that made
 *  each go red are named in DEV-NOTES.md #R700 §7 — «it rang» is not the claim, «it rang on THESE
 *  breakages» is.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appLangs, authoredLangs, carriedLangs, attestedLangs, harvestLangs } from '../scripts/lang-policy.mjs';
import { shipLangs } from '../scripts/histnames/langs.mjs';
import { floorProblems, coverageOf, SURFACES } from '../scripts/i18n-floor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① the policy is ONE place, and the restore really is one edit ──────────────────────────────
   #R695 wrote the amendment into scripts/histnames/langs.mjs because the name table was all it
   governed. #R700 extended it to the UI, and a policy two gates read may not be written twice
   ([[intmap-recurring-lessons]] G). This asserts both halves: one module types the codes, and the
   old module still answers — so every existing caller keeps working through the same answer. */
test('① the narrowed set is typed in exactly one module, and every lane reads that one', () => {
  const all = appLangs(ROOT), authored = authoredLangs(ROOT), carried = carriedLangs(ROOT);
  assert.ok(all.length > authored.length, 'the amendment narrows something');
  assert.deepEqual([...authored, ...carried].sort(), [...all].sort(),
    'authored ∪ carried must be exactly the app’s languages — a language in neither is a language nothing measures');
  assert.equal(authored.filter((l) => carried.includes(l)).length, 0, 'no language is both authored and carried');
  /* the historical-name lane's name for the same set — one policy, two readers */
  assert.deepEqual(shipLangs(ROOT), authored, 'scripts/histnames/langs.mjs must answer from the same policy');
  /* a source's own label is never narrowed: that half is what CONSTITUTION.md §7 protects */
  assert.deepEqual(attestedLangs(ROOT), all, 'a label a SOURCE wrote is carried in every language it exists in');
  assert.deepEqual(harvestLangs(ROOT), all, 'the harvest asks for all of them whatever ships — the cache is not the policy');
  /* ⚠ AND NOBODY ELSE MAY TYPE THE SET. A second literal list is a second policy that drifts. */
  const second = rd('scripts/histnames/langs.mjs');
  assert.ok(!/\[\s*'en'\s*,\s*'jp'\s*\]/.test(second) && !/\[\s*"en"\s*,\s*"jp"\s*\]/.test(second),
    'scripts/histnames/langs.mjs must READ the policy, not restate it');
});

/* ── ② the restore switch is real, and it is one edit ───────────────────────────────────────────
   「いつでもワン指示で多言語体制に戻せるようにはしておくこと」 is a REQUIREMENT, so it is measured
   rather than promised: the module's source must hold exactly one literal list of codes, and
   widening it must widen what every lane answers. Evaluated, not read — the module is re-imported
   with the list replaced, so this fails if some lane hard-codes the narrow set downstream. */
test('② widening the one literal list widens every lane — the restore is one edit', async () => {
  const src = rd('scripts/lang-policy.mjs');
  const lists = src.match(/^const NARROWED = \[[^\]]*\];$/m);
  assert.ok(lists, 'scripts/lang-policy.mjs must hold the narrowed set as one named literal');
  const all = appLangs(ROOT);
  const widened = src.replace(/^const NARROWED = \[[^\]]*\];$/m,
    `const NARROWED = ${JSON.stringify(all)};`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(
    widened.replace("join(dirname(fileURLToPath(import.meta.url)), '..')", JSON.stringify(join(ROOT, 'scripts'))),
  ).toString('base64')}`);
  assert.deepEqual(mod.authoredLangs(ROOT).sort(), [...all].sort(),
    'flipping the one list must restore every language to AUTHORED');
  assert.deepEqual(mod.carriedLangs(ROOT), [],
    'and must leave nothing merely carried — that is what «戻す» means');
});

/* ── ③ the floor: the amendment passes, the deletion does not ───────────────────────────────────
   THE WHOLE POINT, and the reason this file exists. Three synthetic pairs, one per direction. */
test('③ a new en+jp-only string passes; a deleted row and a silent gain do not', () => {
  const carried = ['fr'];
  const base = { fr: { keyed: 421, inline: 6000, pages: 463 } };
  /* the amendment: a new string raises `want` for everybody and `have` for nobody — the floor
     compares HAVE against the floor, so fr is untouched and green. */
  assert.deepEqual(floorProblems({ carried, have: base, floor: base }), [],
    'a new English-only string lowers no count, so the floor must not fire — this IS the amendment');
  /* §0-3: one Korean row deleted is one row a reader had and no longer has */
  const lost = { fr: { keyed: 421, inline: 5999, pages: 463 } };
  const lostSaid = floorProblems({ carried, have: lost, floor: base });
  assert.equal(lostSaid.length, 1, 'exactly the surface that lost rows is named');
  assert.match(lostSaid[0], /lost 1 row/, 'and it says what was lost');
  /* #R194: a floor with headroom it no longer needs asserts nothing */
  const gained = { fr: { keyed: 421, inline: 6001, pages: 463 } };
  assert.match(floorProblems({ carried, have: gained, floor: base })[0] || '', /gained 1 row/,
    'the floor must fail UPWARD too, or translating more quietly widens the gap it is meant to close');
  /* a language that vanishes from the measurement entirely is not «no problem» */
  assert.equal(floorProblems({ carried, have: {}, floor: base }).length, 1);
  assert.equal(floorProblems({ carried, have: base, floor: {} }).length, 1);
  /* a surface that disappears is a deletion the per-surface loop must still see */
  assert.match(floorProblems({ carried, have: { fr: { keyed: 421, pages: 463 } }, floor: base })[0],
    /no longer has the inline/, 'a whole surface going missing reads as a loss, not as silence');
});

/* ── ④ the shipped floor is the shipped measurement's shape ─────────────────────────────────────
   A floor file that has drifted out of shape — a language missing, a surface missing — would make
   ③'s rule vacuous for exactly the row it forgot. This does not re-measure (28.7 s); it asserts
   that the committed floor covers every carried language and names only real surfaces. */
test('④ tests/i18n-coverage-floor.json covers every carried language and nothing else', () => {
  const floor = JSON.parse(rd('tests/i18n-coverage-floor.json')).langs;
  const carried = carriedLangs(ROOT);
  assert.deepEqual(Object.keys(floor).sort(), [...carried].sort(),
    'every carried language has a floor, and no authored language has one');
  const known = new Set(SURFACES.map(([k]) => k));
  for (const [code, row] of Object.entries(floor)) {
    const keys = Object.keys(row);
    assert.ok(keys.length, `«${code}» has a floor with no surface in it — it holds nothing down`);
    for (const k of keys) assert.ok(known.has(k), `«${code}» floors an unknown surface «${k}»`);
    for (const v of Object.values(row)) assert.ok(Number.isInteger(v) && v > 0, `«${code}» floors a non-count`);
  }
  /* coverageOf is the one translator between the audit's rows and this file — pin its shape */
  assert.deepEqual(coverageOf({ keyed: [4, 5], pages: [1, 2], inline: null, positional: null }),
    { keyed: 4, pages: 1 }, 'a surface a language does not have must drop out rather than read 0');
});

/* ── ⑤ the standing instructions say what the code does ─────────────────────────────────────────
   #R628: a §N that names nothing, and a check that guards the empty address. Both documents are
   asserted to POINT at the one policy rather than to restate the set, because a restated set is
   the thing that drifts (#R500). */
test('⑤ AGENTS.md §3-5 and CONSTITUTION.md §7 point at the one policy', () => {
  const agents = rd('AGENTS.md'), consti = rd('CONSTITUTION.md');
  assert.match(consti, /^## 7\. 言語/m, 'CONSTITUTION.md §7 must exist — AGENTS.md §3-5 sends the reader there');
  assert.match(agents, /CONSTITUTION\.md` §7/, 'AGENTS.md §3-5 must name the section that holds the policy');
  for (const [name, text] of [['AGENTS.md', agents], ['CONSTITUTION.md', consti]]) {
    assert.match(text, /scripts\/lang-policy\.mjs/, `${name} must name the machine's one place`);
    /* ⚠ the old §3-5 listed all nine codes in prose. #R500's finding is that a prose copy of a
       machine-held quantity always drifts; the roster now lives in js/locales/_langs.js alone. */
    assert.ok(!/de \/ en \/ es \/ fr \/ jp \/ ko \/ ru \/ zh \/ zh-hans/.test(text),
      `${name} writes the nine-code roster out in prose again — the roster is js/locales/_langs.js`);
  }
});
