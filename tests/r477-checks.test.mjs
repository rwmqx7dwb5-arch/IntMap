/* ============================================================================
 *  IntMap · R477 — 「Wind gustsでCoastlines & shoresが見えない。」
 * ----------------------------------------------------------------------------
 *  MEASURED on the built app before the fix (base display only, `dl-ec-gust` switched on, flat
 *  projection over Honshū) — the style order was:
 *
 *      21:borders-only-casing  22:coast-only-casing  23:coast-only-line  …
 *      30:im-night-lights-lyr  31:im-night-shade  32:ec-gust-0  33:layer-sat-labels
 *      34:borders-only-line
 *
 *  The gust field is a raster at `raster-opacity` 1, so the coastline was not faint — it was gone.
 *  The national border, which #R289 says the coastline is drawn 「全く同じ手法で」, was nine layers
 *  above the same raster and perfectly visible. `queryRenderedFeatures` returned 15 coastline
 *  features in both states: the geometry was always there, under an opaque sheet.
 *
 *  ══ ⚠⚠⚠ THE ANCHOR IS NOT WHAT DECIDES WHO IS ON TOP ═════════════════════════════════════════
 *  js/coast-line.js and js/app-body.js compute the SAME `before` anchor, in the same words. That
 *  anchor decides where a layer is BORN. What decides where it LIVES is js/label-occlusion.js's
 *  `STACK` — #R19's rule 「地名や国境はどのレイヤーよりも最前部に」, re-asserted on every idle and
 *  every styledata precisely because add-order is transient. `borders-only-line` is in that list.
 *  `coast-only-line` never was. So the two lines were identical in every property a check had ever
 *  looked at — source, colour, width ladder, casing ladder, retry schedule (tests/smoke ㉑ measures
 *  all five against the border's own paint) — and opposite in the only one a reader can see.
 *
 *  ══ ⚠⚠ AND A CASING IS PART OF ITS LINE ══════════════════════════════════════════════════════
 *  Both casings are added with their line as the beforeId so they sit DIRECTLY under it (#R210:
 *  that is what makes the pale line read over a pale basemap). `raise()` moves what is in STACK and
 *  leaves behind what is not, so `borders-only-casing` — in the product since #R210 and never in
 *  the list — was separated from its own line by whatever happened to be added in between: thirteen
 *  layers in the measurement above, the gust raster among them. Listing a line without its casing
 *  does not raise a line, it splits one. ② is the general form of that.
 *
 *  ⚠ NOTHING HERE HAND-WRITES WHICH IDS BELONG TO WHICH ROW. Both sides are parsed — the STACK from
 *  js/label-occlusion.js, the row→ids map from js/data-layers.js's own `BASE` (the layer audit,
 *  #R79) — because a fourth copy of that membership is the shape #R309 spent a round deleting from
 *  the product and #R476 refused to re-introduce into a gate.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/* the label/border stack, in its own order — tests/r198-checks ②b parses it the same way */
function labelStack() {
  const m = /const STACK=\[([^\]]*)\]/.exec(read('js/label-occlusion.js'));
  assert.ok(m, 'js/label-occlusion.js still declares the label STACK as a literal array');
  const ids = m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.ok(ids.length > 10, `the stack should name the whole label family, found ${ids.length}`);
  return ids;
}

/* js/data-layers.js's own answer to 「which layers does this base checkbox drive?」 (#R79's audit).
   ⚠ the block is extracted FIRST and de-commented after: a block comment inside it cannot swallow
   a row, and a `'cb-…':[…]` written inside a comment elsewhere in that 6,000-line file cannot add
   one. */
function baseRows() {
  const blk = /const BASE=\{([\s\S]*?)\n\s*\};/.exec(read('js/data-layers.js'));
  assert.ok(blk, 'js/data-layers.js still declares the base-toggle audit map as a literal');
  const body = blk[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rows = new Map();
  for (const m of body.matchAll(/'(cb-[a-z0-9]+)'\s*:\s*\[([^\]]*)\]/g)) {
    rows.set(m[1], m[2].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean));
  }
  assert.ok(rows.size >= 8, `every base row should be in the audit map, found ${rows.size}`);
  return rows;
}

/* ── ① THE COASTLINE IS IN THE STACK, AND SO IS EVERY LAYER ITS ROW DRIVES ────────────────────── */
/* The two rows are named because they are the SUBJECT — 「国境線と全く同じ手法で」 is a claim about
   these two and no others. What is derived is the part that goes wrong: WHICH ids each of them
   drives. #R289 added `coast-only-line` and `coast-only-casing` to the product and to the audit map
   and not to the stack, and no check compared the three. */
test('R477 ① the coastline and the national border are both in the label stack, in full', () => {
  const stack = labelStack(), rows = baseRows();
  for (const cb of ['cb-borders', 'cb-coast']) {
    const ids = rows.get(cb);
    assert.ok(ids && ids.length, `js/data-layers.js's audit map still knows what ${cb} draws`);
    for (const id of ids) {
      assert.ok(stack.includes(id),
        `${id} (${cb}) must be in js/label-occlusion.js's STACK — a boundary line that is not in it `
        + 'sits wherever it happened to be added, which for the measured gust raster meant nine '
        + 'layers under an opaque sheet');
    }
  }
});

/* ── ② A CASING IS DIRECTLY UNDER ITS OWN LINE ────────────────────────────────────────────────── */
/* Derived from the stack's own spelling, so it holds for any pair added later: `raise()` moves the
   ids in list order, so «immediately before» in the list IS «immediately under» on the map. */
test('R477 ② every casing in the stack sits immediately below the line it is the casing of', () => {
  const stack = labelStack();
  const casings = stack.filter((id) => /-casing$/.test(id));
  assert.ok(casings.length >= 2, `the border and the coast both ship a casing, found ${casings.length}`);
  for (const c of casings) {
    const line = c.replace(/-casing$/, '-line');
    const i = stack.indexOf(c);
    assert.equal(stack[i + 1], line,
      `${c} must be listed immediately before ${line} — the casing is added with the line as its `
      + 'beforeId (#R210) so that it reads as one stroke; raising one without the other splits it');
  }
});

/* ── ③ NO BASE ROW IS SPLIT ACROSS THE BOUNDARY ───────────────────────────────────────────────── */
/* The general form of the defect: one checkbox, one subject, one answer to 「above the data or
   below it?」. Half a row in the stack is a row whose halves drift apart the moment any data layer
   is added — which is exactly what `borders-only-casing` had been doing since #R210. */
test('R477 ③ a base toggle is either wholly in the label stack or wholly out of it', () => {
  const stack = labelStack(), rows = baseRows();
  for (const [cb, ids] of rows) {
    const inside = ids.filter((id) => stack.includes(id));
    assert.ok(inside.length === 0 || inside.length === ids.length,
      `${cb} is split: ${inside.join(', ')} are re-asserted above every data layer and `
      + `${ids.filter((id) => !stack.includes(id)).join(', ')} are not, so the halves of one line `
      + 'drift apart as soon as anything is added between them');
  }
});

/* ── ④ WHERE THEY MEET, THE NATIONAL BORDER WINS ──────────────────────────────────────────────── */
test('R477 ④ the coast pair is listed below the border pair', () => {
  const stack = labelStack(), rows = baseRows();
  const lowest = (cb) => Math.min(...rows.get(cb).map((id) => stack.indexOf(id)));
  assert.ok(lowest('cb-coast') < lowest('cb-borders'),
    'a national border and a shoreline often run along the same metre of geometry; the border is '
    + 'the more specific statement, so it is drawn last');
});

/* ── ⑤ THE MECHANISM THE FIX RELIES ON IS STILL THE ONE THAT RUNS ─────────────────────────────── */
/* ① … ④ are statements about a list. They mean nothing if the list stops being applied, or if the
   test that decides «nothing to do» goes back to the pre-#R25 form that declared the stack in place
   as soon as ANY ONE of its layers was on top. */
test('R477 ⑤ raise() still moves every stack id, and inPlace() still requires all of them above all data', () => {
  const src = read('js/label-occlusion.js');
  assert.match(src, /STACK\.forEach\(id=>\{\s*if\(GE\(\)\.layers\.has\(id\)\)\s*try\{\s*GE\(\)\.layers\.move\(id\)/,
    'raise() moves each stack layer to the top, in list order');
  assert.match(src, /return lowestStack>highestData;/,
    'inPlace() compares the LOWEST stack layer against the HIGHEST data layer (#R25) — anything '
    + 'weaker declares a split stack to be in place and stops re-raising it');
  assert.match(src, /GE\(\)\.events\.on\('idle',sched\);\s*GE\(\)\.events\.on\('styledata',sched\);/,
    'and it is re-asserted on idle AND styledata, which is why the birth anchor does not decide this');
});
