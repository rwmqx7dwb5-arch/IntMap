/* ============================================================================
 *  IntMap · R476 — 「Coastlines & shoresはデフォルトでオンにして」
 * ----------------------------------------------------------------------------
 *  The coastline row (`cb-coast` → js/coast-line.js) shipped OFF since #R289 and was offered once
 *  by the wind/temperature layers. It now ships ON.
 *
 *  ══ ⚠⚠⚠ «DEFAULT ON» IS TWO EDITS AND ONLY ONE OF THEM HAD A GATE ═══════════════════════════
 *  A row is default-on when BOTH of these are true, and neither implies the other:
 *
 *      index.html            the <input> carries `checked`
 *      js/data-layers.js     the id is in window.IntMapDefaultOn
 *
 *  Half the edit is silent in both directions, which is the whole reason this file exists:
 *
 *    · `checked` WITHOUT the id — the layer paints (js/app-body.js dispatches `change` for boxes
 *      that are already ticked), but IntMapBaseDisplay.matches() compares the live ticks against
 *      defOn(), disagrees, and 400 ms after every single boot demotes 基本表示 from 「デフォルト」
 *      to 「カスタム」 (#R469). Nothing errors. The panel just quietly stops claiming a mode.
 *    · the id WITHOUT `checked` — js/app-body.js's boot dispatcher only fires `change` on boxes it
 *      finds ticked, so the box stays clear and the layer paints nothing: #R34's defect exactly.
 *      Worse, js/session-tabs.js's off-sweep then reads the id as default-on and actively unticks
 *      it on every restore.
 *
 *  tests/r225-checks ⑤ already walked list → markup. NOTHING walked markup → list, so a `checked`
 *  added to index.html alone was invisible to the suite. ① below closes the loop in both
 *  directions, and derives BOTH sides — no hand-written copy of the membership lives in this file,
 *  because a copy is the shape #R309 spent a round deleting from the product.
 *
 *  ══ ⚠ WHAT THIS ROUND DELIBERATELY DID NOT DO ══════════════════════════════════════════════════
 *  It reaches FIRST-TIME readers only. Every saved session predates the change, so `cb-coast` is
 *  absent from it, and js/session-tabs.js:143 reads an absent default-on id as 「the reader
 *  switched it off」 (#R186/#R225) and switches it back off. Healing that is a `defv` generation
 *  bump (#R189/#R190) and was not asked for. ③ therefore pins the off-sweep's rule intact — the
 *  wrong way to widen the reach would be to weaken it, which would make every deliberate opt-out
 *  unkeepable across a reload.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/* the ids window.IntMapDefaultOn names directly (its `.concat(IntMapDefaultLayers)` half is
   thematic — dl-* rows that no markup ships checked, so they are not part of this comparison) */
function declaredDefaultOn(dl) {
  const m = /window\.IntMapDefaultOn=\[([^\]]*)\]/.exec(dl);
  assert.ok(m, 'window.IntMapDefaultOn is declared as a literal array');
  return m[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
}

/* every base-display checkbox the markup ships, and whether it carries `checked` */
function shippedCheckboxes(html) {
  const out = new Map();
  for (const m of html.matchAll(/id="(cb-[a-z0-9]+)"([^>]*)>/g)) out.set(m[1], /\bchecked\b/.test(m[2]));
  return out;
}

/* ── ① THE TICK AND THE LIST AGREE, IN BOTH DIRECTIONS ────────────────────────────────────────── */
test('R476 ① every cb-* that ships checked is in IntMapDefaultOn, and vice versa', () => {
  const declared = declaredDefaultOn(read('js/data-layers.js'));
  const shipped = shippedCheckboxes(read('index.html'));

  assert.ok(shipped.size >= 10, `index.html should ship the base-display rows, found ${shipped.size}`);
  assert.ok(declared.length >= 8, `IntMapDefaultOn should name the base half, found ${declared.length}`);

  /* list → markup: an id in the default-on list that the markup does not tick paints nothing */
  for (const id of declared) {
    assert.ok(shipped.has(id), `IntMapDefaultOn names ${id}, which index.html does not ship at all`);
    assert.equal(shipped.get(id), true,
      `${id} is in IntMapDefaultOn but index.html ships it UNCHECKED — js/app-body.js only dispatches ` +
      `change for ticked boxes (#R34), so the layer would never paint and the restore would untick it`);
  }
  /* markup → list: a tick with no id demotes 基本表示 to 「カスタム」 400 ms after every boot */
  for (const [id, checked] of shipped) {
    if (!checked) continue;
    assert.ok(declared.includes(id),
      `index.html ships ${id} checked but IntMapDefaultOn does not name it — IntMapBaseDisplay.matches() ` +
      `would disagree with the live state and drop 基本表示 to 「カスタム」 on every load (#R469)`);
  }
});

/* ── ② THE COASTLINE IS ON, AND IS STILL A VIEW OF THE MAP RATHER THAN A LAYER ON IT ──────────── */
test('R476 ② cb-coast ships on, on both sides, and stays inside 基本表示', () => {
  const dl = read('js/data-layers.js');
  const html = read('index.html');

  assert.match(html, /<input type="checkbox" id="cb-coast" checked>/, 'the row ships checked');
  assert.ok(declaredDefaultOn(dl).includes('cb-coast'), 'and the id is in window.IntMapDefaultOn');

  /* ⚠ it must NOT start being counted as an overlay. js/data-layers.js's chip counter and
     js/widget-core.js's 「N layers on」 card both skip window.IntMapBasicLayers (#R309/#R233), and
     cb-coast has been a member since #R289 — being default-on must not move it out. */
  assert.match(dl, /window\.IntMapBasicLayerRows=\[[^\]]*'cb-coast'/,
    'cb-coast stays in the 基本表示 membership, so switching it on adds no chip and no FAB accent');
  assert.match(dl, /const skip=new Set\(window\.IntMapBasicLayers\);/,
    'and the chip counter still derives its skip set from that one list');
});

/* ── ③ THE OFF-SWEEP'S RULE IS UNTOUCHED ──────────────────────────────────────────────────────── */
test('R476 ③ an absent default-on id still means the reader switched it off', () => {
  const st = read('js/session-tabs.js');
  assert.match(st, /const defOff=\(window\.IntMapDefaultOn\|\|window\.IntMapDefaultLayers\|\|\[\]\)\.filter\(id=>want\.indexOf\(id\)<0\);/,
    'the restore still switches OFF every default-on id the saved session omits (#R186/#R225) — ' +
    'reaching existing readers is a defv bump (#R189/#R190), never a weakening of this rule');
  /* and the wind/temperature offer survives as the one path back for those sessions */
  assert.match(read('js/coast-line.js'), /if \(!c \|\| c\.__windAuto\) return false;/,
    'window._imCoastAuto is still a spent-once latch, not a coupling (#R85/#R289)');
});

/* ── ④ THE DOCUMENTS DO NOT STILL SAY «OFF» ───────────────────────────────────────────────────── */
test('R476 ④ docs/MAP-LAYERS.md and PRODUCT.md state the new default', () => {
  const ml = read('docs/MAP-LAYERS.md');
  assert.ok(!/既定は OFF/.test(ml.slice(ml.indexOf('cb-coast'), ml.indexOf('cb-coast') + 1400)),
    'docs/MAP-LAYERS.md (the layer spec, per docs/README.md) must not still call the coastline 既定 OFF');
  assert.match(ml, /海岸線[\s\S]{0,1400}?既定は ON/, 'it states the new default where it states the layer');
  const pr = read('PRODUCT.md');
  const at = pr.indexOf('**海岸線・湖岸線**');
  assert.ok(at > 0, 'PRODUCT.md lists the coastline');
  assert.ok(!/1回だけ既定でオンになる/.test(pr.slice(at, at + 400)),
    'PRODUCT.md must not still describe the wind layer as what turns the coastline on');
});
