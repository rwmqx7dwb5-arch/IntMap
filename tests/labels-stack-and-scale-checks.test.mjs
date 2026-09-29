/* ============================================================================
 *  IntMap · map labels — the size ladder (js/label-scale.js) and the stack that keeps names and
 *  boundary lines above every data layer (js/label-occlusion.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r198-checks.test.mjs ①–② (the ladder; the admin-1 layer), all of
 *  tests/r477-checks.test.mjs (the coastline was nine layers under an opaque raster) and
 *  tests/r707-chronos-unnamed-checks.test.mjs ⑦ (a ladder rung nothing climbs). #R198 ③ — the world
 *  gazetteer — is tests/gazetteer-world-checks.test.mjs.
 *
 *  ⚠ THE STACK IS EVALUATED, NOT PARSED. Both #R198 ②b and #R477 used to read `const STACK=[…]` with
 *  a regular expression. Here js/label-occlusion.js's own makeLabelOcclusion() is run against a
 *  recording renderer and raise() is asked to fix a split stack: the order it MOVES the layers in is
 *  the stack, as the app applies it. Original headers follow.
 * ==========================================================================*/
/* ============================================================================
 *  IntMap · #R198 checks — the label ladder, the admin-1 layer, the world gazetteer
 * ----------------------------------------------------------------------------
 *  Three claims this round makes that a regex over the source cannot check, so all three are
 *  checked by RUNNING something (#R197's lesson):
 *    ① every non-place label is smaller than the place-label reference AT EVERY ZOOM — derived from
 *       js/label-scale.js's own tables, not from a copy of them here;
 *    ② the admin-1 layer is wired everywhere a place-label layer has to be wired;
 *    ③ 3,482 new gazetteer rows do not cost the deterministic locator a single labelled headline —
 *       measured by registering them into js/newsgeo.js and re-scoring the same corpus.
 * ==========================================================================*/
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
import { readFileSync, readdirSync } from 'node:fs';
import path, { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parse } from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const rd = read;
/* js/label-scale.js publishes window.IntMapLabelScale and touches nothing else (the same shape
   js/place-framing.js has since #R183), which is what lets it be exercised without a browser. */
function loadScale() {
  const win = { addEventListener() {} };
  new Function('window', read('js/label-scale.js'))(win);
  return win.IntMapLabelScale;
}

/* js/label-occlusion.js's makeLabelOcclusion(), RUN in a sandbox against a renderer that records
   what it is told to move. `style` is the layer order the renderer reports, bottom first; `has`
   answers which ids exist (default: every id, so raise() moves the WHOLE stack). */
function occlusion(style, has = () => true) {
  const src = read('js/label-occlusion.js');
  const owner = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }).body
    .find((n) => n.type === 'ExportNamedDeclaration' && n.declaration?.id?.name === 'makeLabelOcclusion');
  assert.ok(owner, 'js/label-occlusion.js still exports makeLabelOcclusion');
  let order = style.slice();
  const moves = [], on = {}, timers = [];
  const eng = {
    hasRenderer: () => true,
    scene: { getStyle: () => ({ layers: order.map((id) => ({ id })) }) },
    layers: { has: (id) => has(id), move: (id) => { moves.push(id); order = order.filter((x) => x !== id).concat(id); } },
    events: { on: (type, fn) => { (on[type] ||= []).push(fn); } },
    camera: { setHorizonReach() {} },
  };
  const win = { IntMapModules: {} };
  const ctx = vm.createContext({ window: win, GE: () => eng, HOST: {}, everyTick: () => {},
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {} });
  vm.runInContext(src.slice(owner.declaration.start, owner.declaration.end), ctx);
  vm.runInContext('makeLabelOcclusion(HOST, { GE, isMobile: () => false })', ctx);
  return { raise: win._raiseLabelLayers, moves, on, order: () => order, flush: () => { while (timers.length) timers.shift()(); } };
}

/* the label/border stack, in the order raise() applies it — asked by splitting it: one known member
   (ofm-city, #R198's own subject) is put UNDER a data layer, which is the state raise() exists to fix */
function labelStack() {
  const o = occlusion(['ofm-city', 'some-data-raster']);
  o.raise();
  const ids = o.moves.filter((id) => id !== 'some-data-raster');
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
/* ══════════════════════════ #R198 · the ladder and the admin-1 layer ══════════════════════════ */
/* ═══ ① THE LADDER ════════════════════════════════════════════════════════════════════════════ */

test('R198 ①a: REF really is the pointwise maximum of the place classes', () => {
  const LS = loadScale();
  for (let z = 0; z <= 22; z += 0.1) {
    const zz = Math.round(z * 10) / 10, ref = LS.refAt(zz);
    for (const kind of Object.keys(LS.PLACE)) {
      assert.ok(LS.placeAt(kind, zz) <= ref + 1e-9,
        `place('${kind}') is ${LS.placeAt(kind, zz)} at z${zz}, above the REF ladder's ${ref} — ` +
        'raise REF or lower the class, but the cap for every non-place label is derived from REF');
    }
  }
});

test('R198 ①b: every non-place label is strictly smaller than the place reference, at every zoom', () => {
  const LS = loadScale();
  /* w > 1 must be clamped: sub() exists to make this inequality unbreakable by its callers. */
  for (const w of [0.5, 0.78, 0.82, 0.86, 0.9, 0.92, 0.95, 1, 1.5, 99]) {
    for (let z = 0; z <= 22; z += 0.1) {
      const zz = Math.round(z * 10) / 10;
      assert.ok(LS.subAt(zz, w) < LS.refAt(zz),
        `sub(${w}) is ${LS.subAt(zz, w)} at z${zz}, not below the place reference ${LS.refAt(zz)}`);
    }
  }
});

test('R198 ①c: every place class is SMALLER than it was before this round', () => {
  const LS = loadScale();
  /* the pre-#R198 curves, read off the layers they were written on (js/place-labels.js, js/time-borders.js) */
  const BEFORE = { country: [[1, 10], [4, 15]], city: [[4, 11], [10, 15]],
                   other: [[8, 10], [13, 13]], era: [[1, 9.5], [4, 13]] };
  const at = (s, z) => {
    if (z <= s[0][0]) return s[0][1];
    if (z >= s[s.length - 1][0]) return s[s.length - 1][1];
    for (let i = 1; i < s.length; i++) { const [a, b] = s[i - 1], [c, d] = s[i]; if (z <= c) return b + (d - b) * ((z - a) / (c - a)); }
    return s[s.length - 1][1];
  };
  /* ⚠ (#R210) `country` is EXEMPT, by a later instruction that reverses this one for that class
     alone: 「国名ラベルを大きくして差を出して視認性を高めて」. It is listed here rather than deleted
     from BEFORE so the exemption is visible — every other class still has to be below #R198. */
  const EXEMPT = new Set(['country']);
  for (const kind of Object.keys(BEFORE)) {
    if (EXEMPT.has(kind)) continue;
    for (let z = 0; z <= 22; z += 0.1) {
      const zz = Math.round(z * 10) / 10;
      assert.ok(LS.placeAt(kind, zz) <= at(BEFORE[kind], zz) + 1e-9,
        `place('${kind}') at z${zz} is ${LS.placeAt(kind, zz)}, not below its pre-#R198 ${at(BEFORE[kind], zz)} — ` +
        'the request was 「全体的にラベルのテキストサイズを下げた」');
    }
  }
  /* …and the loudest one: an ocean name was 19.3 px where a city was 15. */
  assert.ok(LS.subAt(9, 1) < 12, `the largest non-place label is ${LS.subAt(9, 1)} px at z9, was 19.3`);
  /* (#R210) the exemption must not leak: raising the country class must leave every NON-place label
     exactly where #R198 left it. SUB is derived from SUB_REF, not from REF, and this is that claim. */
  for (let z = 0; z <= 22; z += 0.5) {
    assert.ok(LS.subAt(z, 1) <= 11.4 + 1e-9,
      `a non-place label reached ${LS.subAt(z, 1)} px at z${z} — enlarging the country class must not drag SUB up`);
  }
  assert.ok(LS.placeAt('country', 4) > LS.placeAt('city', 4) + 3,
    'the country/city gap the round was asked to open actually opened');
});

test('R198 ①d: the expressions keep zoom OUTERMOST (#R73 — MapLibre drops the layer silently)', () => {
  const LS = loadScale();
  const outermostOk = (e) => Array.isArray(e) && e[0] === 'interpolate' &&
    JSON.stringify(e.slice(3)).indexOf('"zoom"') < 0;
  for (const kind of Object.keys(LS.PLACE)) assert.ok(outermostOk(LS.place(kind)), `place('${kind}')`);
  assert.ok(outermostOk(LS.sub(0.9)), 'sub()');
  const sc = LS.subCase(['==', ['get', 'big'], 1], 1, 0.86);
  assert.ok(outermostOk(sc), 'subCase()');
  assert.equal(sc[4][0], 'case', 'subCase puts the case in the stop OUTPUT, where it is legal');
});

test('R198 ①e: js/label-scale.js is the only source of a map text size', () => {
  /* spelling kept — «the only source of a map text size» is a statement about every file's source; the sizes themselves are evaluated in ①a–①d */
  const files = ['place-labels', 'app-body', 'data-layers', 'atlas-console', 'layer-packs',
    'community-board', 'dash-extended', 'cameras', 'drone-ops', 'beta-overlays', 'map-extras',
    'news-ui', 'satellites-live', 'terrain-water', 'time-borders', 'tsunami', 'weather'];
  for (const f of files) {
    const src = read(`js/${f}.js`);
    const lit = [...src.matchAll(/'text-size'\s*:\s*[0-9[]/g)];
    for (const m of lit) {
      assert.fail(`js/${f}.js still declares a literal text-size at index ${m.index} — ` +
        'every map label size comes from window.IntMapLabelScale (#R198)');
    }
    assert.ok(!/'text-size'/.test(src) || /IntMapLabelScale/.test(src),
      `js/${f}.js sets a text-size without going through IntMapLabelScale`);
  }
});

/* ═══ ② THE ADMIN-1 LAYER ═════════════════════════════════════════════════════════════════════ */

test('R198 ②a: ofm-admin1 is built from the classes that actually carry the units named in the ask', () => {
  /* spelling kept — the layer definition sits in js/place-labels.js's map-host code, which needs a renderer; its source classes and sort key are read */
  const src = read('js/place-labels.js');
  assert.ok(/id:'ofm-admin1'/.test(src), 'the layer exists');
  assert.ok(/\['state','province'\]/.test(src),
    'both OpenMapTiles classes — Japanese prefectures are `province`, US states are `state`');
  assert.ok(/LS\.place\('admin1'\)/.test(src), 'its size comes from the place ladder, not a literal');
  assert.ok(/'symbol-sort-key':\['coalesce',\['get','rank'\]/.test(src),
    'the collision test is resolved by rank, so a crowded view keeps the bigger unit');
});

test('R198 ②b: it is wired into every list a place-label layer belongs to', () => {
  /* spelling kept — the stack half is evaluated (labelStack); the audit map and the place-labels lists live in map-host closures that cannot run in Node */
  assert.ok(/'cb-names':\[[^\]]*'ofm-admin1'/.test(read('js/data-layers.js')),
    'the layer-audit map for the Place-names switch (#R79) must know it, or a checked-but-blank ' +
    'state would never be healed');
  /* (#R200) the "names and borders above every data layer" self-heal is js/label-occlusion.js now —
     it left js/app-body.js with the rest of that subject. Asked of that file directly — by running it. */
  const ids = labelStack();
  assert.ok(ids.length, 'the label STACK still exists');
  assert.ok(ids.includes('ofm-admin1'), 'ofm-admin1 is in the label stack');
  assert.ok(ids.indexOf('ofm-admin1') < ids.indexOf('ofm-city'),
    'below ofm-city → a city name wins the collision against the region containing it');
  assert.ok(ids.indexOf('ofm-admin1') > ids.indexOf('ofm-peak'), 'above the peaks');
  const pl = read('js/place-labels.js');
  assert.ok(/\['ofm-country','ofm-admin1','ofm-city','ofm-other'\]/.test(pl),
    'applyLabelLang localises and shows/hides it with the other place names');
  /* ⚠ (#R530) THIS USED TO PIN THE SPELLING `id==='ofm-country'||id==='ofm-admin1'`, AND THE
     SPELLING IS GONE WHILE THE GUARANTEE IS NOT. The two tiers now ask DIFFERENT time machines —
     the country names hide on IntMapTimeBorders, the province names on IntMapTimeAdmin1 — because
     the country side returns to modern borders above CShapes' last year while the subdivision
     record runs to today, so one flag printed today's prefecture name beside the era's for every
     year in between. A check that fixes the characters cannot survive a change that keeps the rule
     ([[intmap-r488-lessons]]), so this asks the rule: the decision must still name ofm-admin1, and
     what switches it off must still be a travelling test. */
  const decide = pl.split('\n').find((l) => l.includes("id==='ofm-admin1'") && l.includes('_showThis'));
  assert.ok(decide, 'the per-layer visibility decision still names ofm-admin1');
  assert.ok(/id==='ofm-country'\s*&&\s*\w+/.test(decide), 'the country tier hides on a travelling flag');
  assert.ok(/id==='ofm-admin1'\s*&&\s*\w+/.test(decide), 'the province tier hides on a travelling flag');
  assert.ok(/IntMapTimeBorders[\s\S]{0,80}active\(\)/.test(pl), "…and the country tier's flag is the country time machine");
  assert.ok(/IntMapTimeAdmin1[\s\S]{0,80}active\(\)/.test(pl), "…and the province tier's flag is the admin-1 one (#R530)");
});
/* ══════════════════════════ #R477 · the coastline belongs to the stack ══════════════════════════ */

/* ── ① THE COASTLINE IS IN THE STACK, AND SO IS EVERY LAYER ITS ROW DRIVES ────────────────────── */
/* The two rows are named because they are the SUBJECT — 「国境線と全く同じ手法で」 is a claim about
   these two and no others. What is derived is the part that goes wrong: WHICH ids each of them
   drives. #R289 added `coast-only-line` and `coast-only-casing` to the product and to the audit map
   and not to the stack, and no check compared the three. */
test('R477 ① the coastline and the national border are both in the label stack, in full', () => {
  /* spelling kept — the stack is evaluated; the base-row map (js/data-layers.js BASE) sits inside a 6,000-line map-host closure and is parsed (baseRows) */
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
  /* RUN, not read (the registered source-label readers join the stack at runtime — hence evaluating). */
  const stack = labelStack();
  const [lo, hi] = [stack[0], stack[stack.length - 1]];

  /* raise(): a stack split by a data layer is moved to the top, every member present, in list order */
  const split = occlusion([lo, 'some-data-raster', hi], (id) => [lo, hi, 'some-data-raster'].includes(id));
  split.raise();
  assert.deepEqual(split.moves, [lo, hi], 'raise() moves each stack layer to the top, in list order');
  assert.deepEqual(split.order().slice(-2), [lo, hi], '…so that every label sits above the data layer');

  /* inPlace(): ONE label on top is not «in place» while another is still under the data (#R25) */
  const oneOnTop = occlusion([lo, 'some-data-raster', hi], (id) => [lo, hi, 'some-data-raster'].includes(id));
  const whole = occlusion(['some-data-raster', lo, hi], (id) => [lo, hi, 'some-data-raster'].includes(id));
  oneOnTop.raise(); whole.raise();
  assert.ok(oneOnTop.moves.length > 0 && whole.moves.length === 0,
    'inPlace() compares the LOWEST stack layer against the HIGHEST data layer (#R25) — anything '
    + 'weaker declares a split stack to be in place and stops re-raising it');

  /* re-asserted on BOTH events — the handler is scheduled, then raises */
  for (const ev of ['idle', 'styledata']) {
    const o = occlusion([lo, 'some-data-raster', hi], (id) => [lo, hi, 'some-data-raster'].includes(id));
    assert.ok((o.on[ev] || []).length > 0,
      'and it is re-asserted on idle AND styledata, which is why the birth anchor does not decide this');
    o.on[ev].forEach((fn) => fn()); o.flush();
    assert.deepEqual(o.moves, [lo, hi], `a '${ev}' event re-raises the split stack`);
  }
});
/* ══════════════════════════ #R707 ⑦ · every rung is climbed ══════════════════════════ */
/* (from #R707's header) ② js/label-scale.js `PLACE.era` has had no caller since #R309 moved both era
   label layers to `place('country')`, while the comment above it still described it in the present tense. */
test('#R707 ⑦ every rung of the label ladder is climbed by something — a key with no caller is dead', () => {
  /* spelling kept — the rungs are evaluated out of the module; «something calls it» is a fact about the source of every js/ file */
  /* the keys are EVALUATED out of the module, never re-typed here: a rung added tomorrow is in this
     check on the day it is added, which is the whole point (#R680 — a hand-written universe cannot
     report what was never put in it). */
  const ctx = vm.createContext({});
  ctx.window = ctx;
  vm.runInContext(rd('js/label-scale.js'), ctx);
  const keys = Object.keys(ctx.window.IntMapLabelScale.PLACE);
  assert.ok(keys.length >= 4, 'the ladder has rungs');

  const src = readdirSync(join(ROOT, 'js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => rd(join('js', f)))
    .join('\n');
  const dead = keys.filter((k) => !(src.includes(`place('${k}')`) || src.includes(`place("${k}")`) ||
                                   src.includes(`placeAt('${k}'`) || src.includes(`placeAt("${k}"`)));
  /* ⚠⚠⚠ A CEILING THAT ONLY MOVES DOWN, NOT A WAIVER LIST — and not a zero, because a zero
     here would require DELETING a shipped key and CONSTITUTION.md §0-3 does not let this round do
     that on its own judgement.
       観測   1, measured 2026-09-12 over js/label-scale.js: `era`. #R198 created the key and
              js/time-borders.js called it for the renamed-polity label; #R309 («昔の国名ラベルの
              見た目や挙動も今の国名ラベルと完全に同じに») moved both era label layers to
              place('country') and left the key behind. Its own comment still describes the caller
              in the present tense, which is the part #R707 corrected.
       失効   the moment the key is removed with the user's approval — then this goes to 0 and
              stays there. It can only ever move DOWN, like NAMELESS_MAX and scripts/test-budget.mjs:
              a SECOND dead rung is a new defect and fails here on the day it appears.
       正本   this line. Nothing else states a dead-rung budget. */
  const DEAD_MAX = 1;
  assert.ok(dead.length <= DEAD_MAX,
    dead.length + ' PLACE key(s) with no caller anywhere in js/, over the ceiling of ' + DEAD_MAX +
    ' — each is a curve the map cannot reach, and the comment beside it describes a caller that no ' +
    'longer exists: ' + dead.join(', '));
  assert.ok(dead.length === DEAD_MAX,
    'the dead-rung ceiling is ' + DEAD_MAX + ' but ' + dead.length + ' are dead — lower it in this ' +
    'file, or the budget keeps headroom it no longer needs and stops asserting anything (#R194)');
});
