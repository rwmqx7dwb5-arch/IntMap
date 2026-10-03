/* ============================================================================
 *  shell-widgets-checks — the widget board — platform, definitions, layout, Smart Stack
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r296-checks.test.mjs
 *  tests/r186-checks.test.mjs
 *  tests/r292-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';
import { readSpec, specFiles } from '../scripts/architecture-spec.mjs';
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R296 · from r296-checks.test.mjs ═══════════════════════ */
/* (#R296 — the round's own account of why these checks exist heads its other half, in tests/shell-weather-packs-routing-checks.test.mjs) */
{
/* comments out, so an assertion about code cannot be satisfied by prose about code */

/* ═══ ① THE BOARD TILES ITSELF ═══════════════════════════════════════════════════════════════
   「自動でウィジェットを敷き詰めてくれない。」 MEASURED on the default board at 2 columns: an S card
   (1 col) followed by four M cards (2 cols) left a 171×131 px hole in row 1, because `grid-auto-flow`
   is deliberately not `dense` (#R292: dense reorders VISUALLY without moving anything in the DOM,
   which breaks keyboard reordering and every screen reader).
   `packOrder` does the dense placement IN THE DOM instead, so reading order and visual order stay
   the same thing. This runs the real function out of js/widget-layout.js. */
function layout() {
  const src = read('js/widget-layout.js');
  const i = src.indexOf('function packOrder(');
  assert.ok(i > 0, 'packOrder must exist');
  const j = src.indexOf('\n  }', i);
  const body = src.slice(i, j + 4);
  const WC = { SPAN: { s: { cols: 1, rows: 1 }, m: { cols: 2, rows: 1 }, l: { cols: 2, rows: 2 } } };
  // eslint-disable-next-line no-new-func
  return new Function('WC', body + '\n return packOrder;')(WC);
}

/* the picture the packed order produces: true where a cell is covered */
function occupancy(order, cols) {
  const SPAN = { s: [1, 1], m: [2, 1], l: [2, 2] };
  const grid = [];
  const busy = (r, c) => !!(grid[r] && grid[r][c]);
  const fits = (r, c, w, h) => {
    if (c + w > cols) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (busy(y, x)) return false;
    return true;
  };
  let r = 0, c = 0;
  for (const it of order) {
    const [w, h0] = SPAN[it.s] || SPAN.m;
    const ww = Math.min(cols, w);
    let guard = 0;
    while (!fits(r, c, ww, h0) && guard++ < 10000) { c++; if (c >= cols) { c = 0; r++; } }
    for (let y = r; y < r + h0; y++) { grid[y] = grid[y] || []; for (let x = c; x < c + ww; x++) grid[y][x] = it.i; }
    c += ww; if (c >= cols) { c = 0; r++; }
  }
  return grid;
}
const holes = (grid, cols) => {
  let n = 0;
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < cols; c++) if (!(grid[r] && grid[r][c])) n++;
  return n;
};

test('R296 ① the widget board tiles without holes, and never pushes a card back', () => {
  const packOrder = layout();
  /* the measured default board: one S in front of four Ms */
  const board = [{ i: 'a', s: 's' }, { i: 'b', s: 'm' }, { i: 'c', s: 'm' }, { i: 'd', s: 'm' }, { i: 'e', s: 'm' }];
  const before = holes(occupancy(board, 2), 2);
  assert.ok(before > 0, 'the unpacked default board really does leave a hole (this is the report)');

  const packed = packOrder(board, 2);
  assert.equal(packed.length, board.length, 'packing loses nothing');
  assert.deepEqual([...packed].map((x) => x.i).sort(), ['a', 'b', 'c', 'd', 'e'], 'and invents nothing');

  /* ⚠ a card is only ever pulled FORWARD, into a hole that would stay empty. `a` may not move back. */
  assert.equal(packed[0].i, 'a', 'the first card stays first');

  /* several shapes, several column counts — the invariant is «no interior hole» */
  const shapes = [
    [{ i: '1', s: 's' }, { i: '2', s: 'm' }, { i: '3', s: 's' }, { i: '4', s: 'm' }],
    [{ i: '1', s: 'l' }, { i: '2', s: 's' }, { i: '3', s: 'm' }, { i: '4', s: 's' }, { i: '5', s: 's' }],
    [{ i: '1', s: 'm' }, { i: '2', s: 's' }, { i: '3', s: 'l' }, { i: '4', s: 's' }, { i: '5', s: 's' }, { i: '6', s: 'm' }],
  ];
  /* ⚠⚠ THE INVARIANT IS NOT «no holes» — IT IS «no hole a later card could have filled». MEASURED
     while writing this: [m s l s s m] at 2 columns still ends with one empty cell, because by the
     time the cursor reaches it the only card left is 2 wide. That is arithmetic, not a defect, and a
     test that demanded zero would have been satisfiable only by REORDERING PAST what fits — i.e. by
     pushing a card backwards, which is the one thing this packer must never do. So the property
     asserted is the defining one for dense placement: every empty cell is empty because nothing that
     came after it fits there. */
  const fillableHoles = (order, cols) => {
    const SPAN = { s: [1, 1], m: [2, 1], l: [2, 2] };
    const g = occupancy(order, cols);
    const placedAt = new Map();
    for (let r = 0; r < g.length; r++) for (let c = 0; c < cols; c++) {
      const id = g[r] && g[r][c];
      if (id && !placedAt.has(id)) placedAt.set(id, r * cols + c);
    }
    let bad = 0;
    for (let r = 0; r < g.length - 1; r++) for (let c = 0; c < cols; c++) {
      if (g[r] && g[r][c]) continue;
      const cell = r * cols + c;
      for (const it of order) {
        const at = placedAt.get(it.i);
        if (at == null || at <= cell) continue;             /* only cards placed LATER could have filled it */
        const [w] = SPAN[it.s] || SPAN.m;
        if (Math.min(cols, w) === 1) { bad++; break; }       /* …and a 1-wide card always fits a 1-wide hole */
      }
    }
    return bad;
  };
  for (const cols of [2, 3, 4]) {
    for (const sh of shapes) {
      assert.equal(fillableHoles(packOrder(sh, cols), cols), 0,
        `cols=${cols} shape=${sh.map((x) => x.s).join('')} left a hole a later card could have filled`);
      /* and the reader's order is never made WORSE than it was */
      assert.ok(fillableHoles(packOrder(sh, cols), cols) <= fillableHoles(sh, cols),
        'packing never adds a fillable hole');
    }
  }

  /* idempotent — which is what lets it run on every render without the order drifting */
  const once = packOrder(shapes[2], 3), twice = packOrder(once, 3);
  assert.deepEqual(twice.map((x) => x.i), once.map((x) => x.i), 'packing a packed board changes nothing');

  /* and the DOM gets that order, so reading order is visual order (§18) */
  const lay = read('js/widget-layout.js');
  assert.match(lay, /packOrder\(items, cols\)\.forEach/, 'render() appends in the packed order');
  assert.doesNotMatch(code(lay), /grid-auto-flow:\s*dense/, 'and never by moving the picture only');
});

/* ═══ ② THE BOARD CAN BE SCROLLED ════════════════════════════════════════════════════════════
   「ウィジェット画面をスクロールできない。」 MEASURED by walking every ancestor of #widget-board and
   reading `overflow-y`: board `visible`, #sidebar `visible`, .operation-room `hidden`, body `hidden`.
   Nothing scrolled. The sidebar's scrolling region is `.content-area`, and `ensureBoard()` mounts the
   board as a SIBLING of one — so anything past the viewport was clipped and unreachable. */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R296 ② the widget board is the sidebar’s scrolling region', () => {
  const css = read('css/intmap.css');
  const rule = /\.sidebar > \.wgt-board\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'the board must declare its own scrolling when it is the sidebar’s pane');
  assert.match(rule[1], /overflow-y:auto/, 'it scrolls');
  assert.match(rule[1], /min-height:0/, 'and can actually shrink inside a column flexbox');
  assert.match(rule[1], /flex:1 1 auto/, 'and takes the space the pane has');
  assert.match(rule[1], /overscroll-behavior:contain/, 'without chaining to the page behind it');

  /* ⚠ SCOPED. The same element is mounted in a Workspace pane and inside the phone sheet, and both
     of those scroll themselves — a second scroller inside them is #R34's nested-scroll trap. */
  const bare = /(^|\n)\.wgt-board\{([^}]*)\}/.exec(css);
  assert.ok(bare, 'the unscoped rule still exists');
  assert.doesNotMatch(bare[2], /overflow-y:auto/, 'and does NOT scroll everywhere the board is mounted');
});
}

/* ═══════════════════════ #R186 · from r186-checks.test.mjs ═══════════════════════ */
/* (#R186 — the round's own account of why these checks exist heads its other half, in tests/shell-sky-space-checks.test.mjs) */
{
/* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  : fs.readFileSync(path.join(ROOT, p), 'utf8'));

/* spelling kept: browser script (js/widgets.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R186 widgets: no ambient shadow around a widget card', () => {
  const src = read('js/widgets.js');
  for (const rule of src.split('+').filter(s => /\.wgt-card/.test(s) && /box-shadow/.test(s))) {
    const bs = /box-shadow:([^;}]*)/.exec(rule);
    if (!bs) continue;
    /* an `inset` shadow is the glass edge INSIDE the card; anything else is the halo that was asked
       to go away. Split on commas OUTSIDE the rgba() parentheses — a naive split cuts the colour up. */
    const parts = bs[1].replace(/rgba?\([^)]*\)/g, (c) => c.replace(/,/g, '\u0001'));
    for (const raw of parts.split(',')) {
      const part = raw.replace(/\u0001/g, ',').trim();
      if (!part) continue;
      assert.match(part, /inset/, `outer shadow still on a widget card: ${part}`);
    }
  }
});
}

/* ═══════════════════════ #R292 · from r292-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R292 source and logic checks — the widget platform
 * ----------------------------------------------------------------------------
 *  The board was rebuilt from one file into a platform. What a source-level check can hold is
 *  here; what needs a real browser is appended to tests/smoke.spec.js, which already pays for a
 *  boot (#R207 — the assertions are free, the boot was the whole price).
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs (#R283). Line endings belong to the CHECKOUT, not
 *  to the file, so a check that spelt a line break literally would be red here and green in CI.
 *
 *  ⚠ THE REGISTRY AND THE SMART STACK ARE RUN, NOT GREPPED. Both are plain IIFEs that publish
 *  themselves on `window`, so a small stub is enough to EXECUTE them — which is the difference
 *  between «the ladder is written down» and «the ladder returns these numbers».
 * ==========================================================================*/
{
const read = (p) => readLF(join(ROOT, p));
/* ⚠ A CHECK THAT READS ITS OWN EXPLANATION FAILS ON ITSELF. Every one of these files documents the
   defect it replaces, and «the three-dot placeholder» is quoted in that prose — so a search for a
   forbidden spelling must look at CODE. `code()` strips block and line comments (and the strings
   that would confuse them) before the search. This is the fifteenth time this project has been bitten
   by a check hitting its own comment; doing it in one helper is the answer that keeps working. */
const code = (p) => codeOnly(read(p));

const PLATFORM = [
  'js/widget-core.js', 'js/widget-store.js', 'js/widget-scheduler.js', 'js/widget-render.js',
  'js/widget-smart.js', 'js/widget-defs-time.js', 'js/widget-defs-data.js', 'js/widget-defs-markets.js', 'js/widget-defs-map.js',
  'js/widget-layout.js', 'js/widget-gallery.js', 'js/widgets.js',
];

/* ── ① THE MODULES EXIST, ARE REACHABLE, AND ARE LOADED IN DEPENDENCY ORDER ─────────────────── */
/* spelling kept: browser script (src/main.js, js/widgets.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ①: every widget module is reachable, in dependency order', () => {
  /* ⚠ THE ORDER LIVES IN THE PLATFORM, NOT IN THE ENTRY. js/widgets.js imports its own siblings, so
     src/main.js keeps the single line it had before the board was split — which is also what keeps
     tests/r168 #8's app-shell ceiling (a number that only ever goes DOWN) intact. */
  assert.match(read('src/main.js'), /import '\.\.\/js\/widgets\.js';/, 'the entry reaches the platform');
  const join = read('js/widgets.js');
  const order = PLATFORM.slice(0, -1).map((p) => join.indexOf("import './" + p.replace('js/', '') + "'"));
  PLATFORM.slice(0, -1).forEach((p, i) => assert.ok(order[i] > 0, p + ' is not imported by js/widgets.js'));
  /* ⚠ EACH MODULE RESOLVES THE ONES ABOVE IT AT IMPORT TIME (`var WC = window.IntMapWidgetCore;`),
     so this order is load-bearing in exactly the way js/geo-engine.js's is. */
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], PLATFORM[i] + ' must be imported after ' + PLATFORM[i - 1]);
  }
});

/* ── ② THE CSS LEFT THE JAVASCRIPT ──────────────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R292 ②: the board builds no stylesheet, and the stylesheet has the board', () => {
  const css = read('css/intmap.css');
  for (const f of PLATFORM) {
    const src = read(f);
    assert.ok(!/document\.createElement\(\s*['"]style['"]\s*\)/.test(src), f + ' still creates a <style> element');
    assert.ok(!/\.wgt-[a-z-]+\{/.test(src), f + ' still carries CSS rule text');
  }
  /* the rules the board cannot draw without */
  for (const rule of ['.wgt-grid{', '.wgt-card,.wgt-stack{', '.wgt-sheet{', '.wgt-menu{']) {
    assert.ok(css.includes(rule), 'css/intmap.css is missing ' + rule);
  }
  /* ⚠ THE TOKENS §16 ASKS FOR, BY NAME. A token that is renamed silently takes its colour with it. */
  for (const tok of ['--widget-surface:', '--widget-surface-elevated:', '--widget-border:',
    '--widget-text-primary:', '--widget-text-secondary:', '--widget-accent:', '--widget-warning:',
    '--widget-danger:', '--widget-success:', '--widget-focus:', '--widget-chart-grid:',
    '--widget-skeleton:', '--widget-radius-s:', '--widget-radius-m:', '--widget-radius-l:',
    '--widget-gap-s:', '--widget-gap-m:', '--widget-gap-l:']) {
    assert.ok(css.includes(tok), 'css/intmap.css does not define ' + tok);
  }
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R292 ②b: reduced motion, reduced transparency and forced colours are all answered', () => {
  const css = read('css/intmap.css');
  const wgt = css.slice(css.indexOf('#R292 · THE WIDGET BOARD'));
  assert.ok(wgt.length > 4000, 'the widget section is present');
  for (const q of ['@media(prefers-reduced-motion:reduce)', '@media(prefers-reduced-transparency:reduce)',
    '@media(forced-colors:active)', '@media(pointer:coarse)']) {
    assert.ok(wgt.includes(q), 'the widget stylesheet does not answer ' + q);
  }
  /* ⚠ THE JIGGLE MUST STOP, NOT SLOW DOWN (§18). The rule has to name `animation:none`. */
  const rm = wgt.slice(wgt.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.ok(/\.wgt-card\.editing[^{]*\{[^}]*animation:none/.test(rm.slice(0, 700)),
    'prefers-reduced-motion must stop the edit-mode jiggle outright');
  /* ⚠ AND NO AMBIENT DROP SHADOW ON A RESTING CARD (§23.24). The only box-shadow the card rule may
     carry is the INSET glass edge. */
  const cardRule = wgt.slice(wgt.indexOf('.wgt-card,.wgt-stack{'), wgt.indexOf('.wgt-card.wgt-s{'));
  const shadows = cardRule.match(/box-shadow:[^;]+;/g) || [];
  assert.equal(shadows.length, 1, 'the resting card has exactly one box-shadow declaration');
  assert.ok(shadows[0].includes('inset'), 'the resting card\'s only shadow is the inset glass edge, not an ambient one');
});

/* ── ③ NO EXTERNAL STRING REACHES innerHTML ─────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-core.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ③: the platform has no innerHTML path at all', () => {
  for (const f of PLATFORM) {
    const src = read(f);
    assert.ok(!/\.innerHTML\s*=/.test(src), f + ' assigns innerHTML — every element is built with WC.el()');
    assert.ok(!/insertAdjacentHTML|outerHTML\s*=|document\.write/.test(src), f + ' writes markup from a string');
  }
  /* the toolkit's own promise: text goes through textContent, attributes through setAttribute */
  const core = read('js/widget-core.js');
  assert.ok(core.includes('n.textContent = String(v)'), 'WC.el sets text through textContent');
  assert.ok(core.includes('n.setAttribute(k'), 'WC.el sets attributes through setAttribute');
  /* ⚠ A URL FROM A FEED IS CHECKED BY SCHEME, NOT BY SUBSTRING (§21). */
  assert.ok(/protocol === 'http:' \|\| p\.protocol === 'https:'/.test(core), 'WC.safeUrl allows only http/https');
});

/* ── ④ THE PUNCTUATION STATES ARE GONE ──────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-core.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ④: no card falls back to "···" or to a bare em dash', () => {
  const DOTS = String.fromCharCode(0xb7, 0xb7, 0xb7);
  for (const f of PLATFORM) {
    assert.ok(!code(f).includes(DOTS), f + ' still uses the three-dot loading placeholder');
  }
  /* ⚠ THE EM DASH SURVIVES ONLY AS «THIS FIELD HAS NO VALUE» INSIDE A LABELLED FACT ROW — never as
     a whole card's answer. The state model has twelve named states and every one of them renders a
     sentence (js/widget-core.js WC.stateBody). */
  const core = read('js/widget-core.js');
  for (const s of ['idle', 'loading', 'ready', 'refreshing', 'stale', 'offline', 'permission-required',
    'permission-denied', 'empty', 'rate-limited', 'temporary-error', 'permanent-error']) {
    assert.ok(core.includes("'" + s + "'"), 'the state model is missing ' + s);
  }
  for (const s of ['permission-required', 'permission-denied', 'empty', 'rate-limited', 'temporary-error', 'permanent-error', 'offline']) {
    assert.ok(new RegExp("case '" + s + "'").test(core), 'WC.stateBody has no renderer for ' + s);
  }
  /* a failure keeps the last good value: the states that do are named in ONE predicate */
  assert.ok(/keepsValue = function \(s\) \{ return s === 'refreshing' \|\| s === 'stale' \|\| s === 'offline' \|\| WC\.isError\(s\)/.test(core),
    'the "keep the last successful value" rule is one predicate, not a rule per renderer');
});

/* ── ⑤ NO INVENTED TIME SERIES ──────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-render.js, js/widget-defs-time.js, js/widget-defs-data.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑤: a trend line refuses to be drawn from fewer than three real points', () => {
  const r = read('js/widget-render.js');
  assert.ok(/if \(pts\.length < 3\) return null;/.test(r), 'R.series must refuse a sparkline it was not given data for');
  /* and no definition fabricates one */
  for (const f of ['js/widget-defs-time.js', 'js/widget-defs-data.js', 'js/widget-defs-markets.js', 'js/widget-defs-map.js']) {
    const src = read(f);
    assert.ok(!/Math\.random\(\)\s*\*/.test(src.replace(/roll: Math\.random\(\)/g, '')),
      f + ' generates a number with Math.random() — a chart must come from the source');
  }
});

/* ── ⑥ EVERY LEGACY WIDGET STILL EXISTS ─────────────────────────────────────────────────────── */
const LEGACY_39 = ['clock', 'aclock', 'weather', 'fx', 'crypto', 'cryptocap', 'fng', 'gold', 'silver',
  'quake', 'otd', 'featured', 'country', 'countdown', 'sun', 'moon', 'aqi', 'iss', 'worldclock',
  'yearprog', 'wikifeat', 'pop', 'uv', 'kp', 'hn', 'holiday', 'launch', 'btc', 'dayprog', 'season',
  'weeknum', 'unixclock', 'mapcenter', 'fullmoon', 'mapweather', 'daylength', 'mapscale', 'calendar', 'newmoon'];

/* spelling kept: browser script (js/widget-core.js, js/widget-store.js, js/widget-scheduler.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑥: all thirty-nine previous widgets have a definition to migrate into', () => {
  const src = PLATFORM.map(read).join('\n');
  const declared = new Set();
  for (const m of src.matchAll(/legacyIds:\s*\[([^\]]*)\]/g)) {
    for (const id of m[1].split(',')) {
      const t = id.trim().replace(/^['"]|['"]$/g, '');
      if (t) declared.add(t);
    }
  }
  /* the three that are declared through a factory argument rather than inline */
  for (const m of src.matchAll(/legacyIds:\s*\[?\s*o\.legacyIds/g)) void m;
  for (const m of src.matchAll(/legacyIds:\s*\[\s*legacy\s*\]/g)) void m;
  for (const m of src.matchAll(/legacyIds:\s*\['([a-z]+)'\]\s*,\s*$/gm)) declared.add(m[1]);
  /* the families built by a helper name their legacy ids at the call site */
  for (const m of src.matchAll(/legacyIds:\s*\['([a-z]+)'\]/g)) declared.add(m[1]);
  for (const m of src.matchAll(/key:\s*'[a-z-]+',\s*legacyIds:\s*\['([a-z]+)'\]/g)) declared.add(m[1]);
  for (const m of src.matchAll(/metalDef\('[a-z]+',\s*'[A-Z]+',\s*'([a-z]+)'/g)) declared.add(m[1]);
  const missing = LEGACY_39.filter((t) => !declared.has(t));
  assert.deepEqual(missing, [], 'these legacy widget types have no definition to migrate into:\n' + missing.join('\n'));
  assert.equal(new Set(LEGACY_39).size, 39, 'the legacy list is the thirty-nine that existed');
});

/* ── ⑦ THE SIZES SHOW DIFFERENT INFORMATION, NOT DIFFERENT CSS ──────────────────────────────── */
/* spelling kept: browser script (js/widget-defs-time.js, js/widget-defs-data.js, js/widget-defs-markets.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑦: every family with three sizes has three DIFFERENT renderer bodies', () => {
  /* ⚠ THE POINT OF §6, AS A MECHANICAL TEST. A definition that supports s/m/l and hands the same
     function to all three would be a CSS-only difference wearing three names — so the bodies are
     compared as text, per definition, in the file that declares them. */
  const files = ['js/widget-defs-time.js', 'js/widget-defs-data.js', 'js/widget-defs-markets.js', 'js/widget-defs-map.js'];
  let checked = 0;
  for (const f of files) {
    const src = read(f);
    /* each `renderers: { … }` block, sliced by brace depth */
    for (const m of src.matchAll(/renderers:\s*\{/g)) {
      let i = m.index + m[0].length - 1, depth = 0;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (!depth) break; }
      }
      const block = src.slice(m.index, i + 1);
      const cut = (k) => {
        const at = block.indexOf('\n      ' + k + ': ');
        return at < 0 ? null : block.slice(at, block.indexOf('\n      ', at + 8));
      };
      const s = cut('s'), mm = cut('m'), l = cut('l');
      if (!s || !mm) continue;
      checked++;
      assert.notEqual(s.replace(/\s+/g, ''), mm.replace(/\s+/g, ''), 'a definition in ' + f + ' has identical S and M renderers');
      if (l) assert.notEqual(mm.replace(/\s+/g, ''), l.replace(/\s+/g, ''), 'a definition in ' + f + ' has identical M and L renderers');
    }
  }
  assert.ok(checked >= 15, 'the sweep found the renderer blocks (' + checked + ')');
});

/* ── ⑧ THE ATLAS BRIEFING CANNOT SPEND AN AI REQUEST ────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-defs-map.js, js/atlas-console.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑧: the Atlas briefing card has no loader, no interval and no AI call', () => {
  const src = read('js/widget-defs-map.js');
  const at = src.indexOf("id: 'intmap.atlas-brief'");
  assert.ok(at > 0, 'the Atlas briefing definition exists');
  const block = src.slice(at, src.indexOf("function plain(md)", at));
  assert.ok(/refreshPolicy: \{ kind: 'manual' \}/.test(block), 'the briefing card is `manual` — the scheduler cannot drive it');
  assert.ok(!/loader:/.test(block), 'the briefing card must have no loader');
  assert.ok(!/askAI|ai-proxy|IntMapConsole|dispatch\(/.test(block), 'the briefing card must not reach the AI');
  /* the handover is written by Atlas, on a brief the reader asked for */
  const console_ = (read('js/atlas-console.js') + '\n' + capsSource());
  assert.ok(console_.includes('window.IntMapWidgetBriefStore'), 'js/atlas-console.js hands a requested brief to the board');
  assert.ok(/IntMapWidgetBriefStore\.remember/.test(console_), 'the handover calls remember(), it does not ask for anything');
});

/* ── ⑨ THE MOBILE PICKER IS GONE ────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-gallery.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑨: the invisible <select> over the add tile no longer exists', () => {
  for (const f of PLATFORM) {
    const src = read(f);
    assert.ok(!/wgt-add-sel/.test(src), f + ' still references the transparent mobile <select>');
    assert.ok(!/opacity:0;font-size:16px;border:0/.test(src), f + ' still builds an invisible overlay control');
  }
  const g = read('js/widget-gallery.js');
  for (const need of ['wgt-search', 'wgt-cats', 'wgt-sizes', 'wgt-preview', 'wgt-gadd']) {
    assert.ok(g.includes(need), 'the gallery is missing ' + need);
  }
  /* ⚠ THE PREVIEW MUST NOT BE ABLE TO CAUSE A LOCATION PROMPT (§8.7). It is given a context whose
     location state is forced to `prompt`, so `WC.resolvePoint` can never return a device fix. */
  assert.ok(/c\.location = \{ state: 'prompt'/.test(g), 'the preview context must not carry a device location');
  assert.ok(/requestLocation: noop/.test(g), 'the preview api must not be able to request a location');
});

/* ── ⑩ THE SCHEDULER'S PROMISES ─────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-scheduler.js, js/widget-layout.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑩: one request per key, abortable, backed off, visibility-gated', () => {
  const s = read('js/widget-scheduler.js');
  assert.ok(/if \(g\.inflight\) return g\.inflight;/.test(s), 'a second caller shares the in-flight promise');
  assert.ok(/new AbortController\(\)/.test(s), 'requests are abortable');
  assert.ok(/g\.abort\.abort\(\)/.test(s), 'a group with no members left aborts its request');
  assert.ok(/IntersectionObserver/.test(s), 'visibility is observed, not assumed');
  assert.ok(/Math\.pow\(2, Math\.min\(6, g\.fails - 1\)\)/.test(s), 'failures back off exponentially');
  assert.ok(/0\.75 \+ Math\.random\(\) \* 0\.5/.test(s), 'the backoff is jittered so readers do not stampede a source');
  assert.ok(/rateLimited/.test(s) && /permanent/.test(s), 'a 429 and a 410 are different failures');
  assert.ok(/MAX_CONCURRENT = \d/.test(s), 'concurrency is capped');
  /* ⚠ RENDERING AND FETCHING ARE DIFFERENT ACTS — the defect this platform replaces. */
  const lay = read('js/widget-layout.js');
  assert.ok(!/function render\(\)[\s\S]{0,4000}refreshAll\(\)/.test(lay), 'render() must not end by refetching the board');
});

/* ── ⑪ THE STORE: MIGRATION, VALIDATION, THE LEGACY CONTRACT ────────────────────────────────── */
/* spelling kept: browser script (js/widget-store.js, js/widgets.js, js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑪: v3 is read and never deleted, and the legacy API keeps its shape', () => {
  const st = read('js/widget-store.js');
  assert.ok(!/removeItem\(\s*KEY3/.test(st) && !/removeItem\(['"]intmap_widgets3/.test(st),
    'the previous format is the backup generation — it is never removed');
  assert.ok(/toLegacy/.test(st) && /applyLegacy/.test(st), 'the legacy round-trip exists');
  const w = read('js/widgets.js');
  assert.ok(/_active: function \(\)/.test(w) && /_setActive: function \(/.test(w),
    'window.IntMapWidgets2 keeps _active/_setActive');
  assert.ok(/sync: sync/.test(w) && /render: render/.test(w), 'window.IntMapWidgets2 keeps sync/render');
  /* ⚠⚠ (#R296) THE ACCOUNT SYNC CALLS IT — AND IT HAS TO ASK THE MODULE FOR THE BOARD TOO.
     「消したはずのウィジェットが勝手に復元して出現するのを辞めろ」, MEASURED: the down-trip existed and the
     UP-trip read `intmap_widgets3` — the v3 key #R292 left as a migration SOURCE and never writes
     again. So the account held the pre-migration board for ever and fed it back on every sign-in.
     This file's own header says the sync 「round-trips a board through the last two」; asserting only
     half of that is what let the other half be a different key entirely. */
  const body = read('js/app-body.js');
  assert.ok(/IntMapWidgets2\._setActive\(d\.widgets/.test(body), 'the preference sync still restores a board');
  assert.ok(/W\._active\(\)/.test(body), '…and reads it back through the module, not a storage key');
  assert.ok(/W\._payload\(\)/.test(body), '…with the v4 record beside it, so sizes and stacks survive');
  assert.equal(/d\.widgets=JSON\.parse\(localStorage\.getItem\('intmap_widgets3'\)\|\|'\[\]'\)/.test(body), false,
    'and never straight off the legacy key');
});

/* ── ⑫ THE SMART STACK IS RUN, AND IT IS DETERMINISTIC ──────────────────────────────────────── */
function loadSmart() {
  /* a stub registry: enough for js/widget-smart.js, which only ever asks for a definition and a
     translated word. Executing the real file is the point — a grep would not catch a swapped rung. */
  const defs = {
    'hazard.earthquake': { id: 'hazard.earthquake', nm: () => 'Quake' },
    'intmap.route': { id: 'intmap.route', nm: () => 'Route' },
    'intmap.monitors': { id: 'intmap.monitors', nm: () => 'Monitors' },
    'world.country': { id: 'world.country', nm: () => 'Country' },
    'weather.here': { id: 'weather.here', nm: () => 'Weather' },
    'map.centre': { id: 'map.centre', nm: () => 'Centre' },
    'moon.phase': { id: 'moon.phase', nm: () => 'Moon' },
    'markets.fx': { id: 'markets.fx', nm: () => 'FX' },
    'knowledge.hacker-news': { id: 'knowledge.hacker-news', nm: () => 'HN' },
  };
  const win = {
    IntMapWidgetCore: { get: (id) => defs[id] || null, L: (en) => en },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  const ctx = vm.createContext({ window: win, localStorage: win.localStorage, Date, Math, JSON, String, Object, Array, console });
  ctx.window.window = ctx.window;
  vm.runInContext(readFileSync(join(ROOT, 'js/widget-smart.js'), 'utf8'), ctx);
  return ctx.window.IntMapWidgetSmart;
}
const member = (i, d) => ({ i, d, s: 'm', c: {}, at: 1 });

test('R292 ⑫: the Smart Stack ladder returns the order §14 asks for', () => {
  const S = loadSmart();
  const stack = {
    i: 'st1', k: 'stack', mode: 'smart', s: 'm', ix: 0, pin: null, off: [], auto: true,
    m: [member('a', 'markets.fx'), member('b', 'weather.here'), member('c', 'world.country'),
      member('d', 'intmap.route'), member('e', 'hazard.earthquake')],
  };
  const ctx = {
    alerts: { worst: 4 }, route: { active: true }, monitors: [{ id: 1 }],
    selection: { country: 'JP' }, location: { state: 'granted' }, map: { lng: 0, lat: 0, zoom: 3 },
    chronos: { isLive: true }, layers: { on: [], all: [], count: 0 },
  };
  const order = S.rank(stack, ctx).map((r) => r.m.d);
  assert.deepEqual(order.slice(0, 4), ['hazard.earthquake', 'intmap.route', 'world.country', 'weather.here'],
    'a severe warning outranks a running route, which outranks a selection, which outranks the reader\'s location');
  /* ⚠ DETERMINISTIC: the same context twice gives the same answer, which is what makes «not a
     shuffle with a nice name» a testable claim rather than a promise. */
  assert.deepEqual(S.rank(stack, ctx).map((r) => r.score), S.rank(stack, ctx).map((r) => r.score));

  /* a pin beats everything */
  const pinned = Object.assign({}, stack, { pin: 'a' });
  assert.equal(S.rank(pinned, ctx)[0].m.i, 'a', 'a pinned card is first whatever else is happening');
  /* a hidden member is not ranked at all */
  const hidden = Object.assign({}, stack, { off: ['e'] });
  assert.ok(!S.rank(hidden, ctx).some((r) => r.m.i === 'e'), 'a card the reader hid is not offered');
  /* every choice can explain itself */
  assert.ok(S.rank(stack, ctx).every((r) => r.reason && r.reason.length > 3), 'every rung gives a reason');
});

test('R292 ⑫b: an ordinary score wobble cannot move the front card, an emergency can', () => {
  const S = loadSmart();
  const quiet = { alerts: { worst: 0 }, route: { active: false }, monitors: [], selection: {}, location: { state: 'prompt' }, map: null, chronos: { isLive: true }, layers: { on: [] } };
  const stack = { i: 'st2', k: 'stack', mode: 'smart', s: 'm', ix: 0, pin: null, off: [], auto: true,
    m: [member('a', 'markets.fx'), member('b', 'hazard.earthquake')] };
  S._reset();
  /* the incumbent is index 0 (`markets.fx`); with nothing happening the challenger is not 150 better */
  const held = S.order(stack, quiet);
  assert.equal(held[0].i, 'a', 'a small difference leaves the reader\'s card where it is');
  /* ⚠ AND AN EMERGENCY IS EXACTLY WHAT THE MARGIN IS NOT ALLOWED TO HOLD BACK. */
  const severe = Object.assign({}, quiet, { alerts: { worst: 4 } });
  const moved = S.order(stack, severe);
  assert.equal(moved[0].i, 'b', 'a severe warning comes to the front at once');
  assert.ok(S._consts.URGENT <= 900 && S._consts.MARGIN > 0 && S._consts.SETTLE > 0, 'the two numbers exist and are numbers');
});

/* ── ⑬ THE READ-ONLY ACCESSORS THE NEW CARDS DEPEND ON ──────────────────────────────────────── */
/* spelling kept: browser script (js/world-packs.js, js/routing.js, js/widget-core.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑬: the IntMap-specific cards read the subsystems that own the data', () => {
  /* ⚠ ONE NORMALISATION, NOT TWO (§15.A). The alert query is a READ of the same `feats` the map
     paints — if it ever became its own pipeline the card and the map would drift apart. */
  const wp = read('js/world-packs.js');
  assert.ok(/STATE\.alertsQuery\s*=/.test(wp), 'the alerts pack publishes a query');
  const q = wp.slice(wp.indexOf('STATE.alertsQuery'), wp.indexOf('STATE.alertsQuery') + 1800);
  assert.ok(/feats\.forEach/.test(q), 'the query reads `feats` rather than re-normalising anything');
  assert.ok(q.replace(/\s+/g, '').includes('if(!(p.norm>0))return;'), 'a unit with nothing in force is not an alert');
  assert.ok(!/fetch\(/.test(q), 'the query fetches nothing');

  const rt = read('js/routing.js');
  assert.ok(/function summary\(\)/.test(rt), 'the router publishes a summary');
  const s = rt.slice(rt.indexOf('function summary()'), rt.indexOf('function summary()') + 1400);
  assert.ok(/_routeCoords\(\)/.test(s), 'the summary is derived from the alternative the reader is looking at');
  assert.ok(!/fetch\(/.test(s), 'the summary fetches nothing');
  assert.ok(s.replace(/\s+/g, '').includes('return{active:false}'), 'no route is an empty state, not an error');

  /* ⚠ AND THE LAYER CARD READS THE REGISTRY, NOT A DOM WALK FOR TRUTH (§15.E). */
  const core = read('js/widget-core.js');
  assert.ok(/window\.IntMapDefaultLayers/.test(core), 'the layer list comes from the app\'s own registry');
  assert.ok(/cb\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/.test(core),
    'a layer is toggled through the app\'s own control, so every listener still runs');
});

/* ── ⑭ THE DOCUMENTS DESCRIBE WHAT SHIPPED ──────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-core.js, js/widget-store.js, js/widget-scheduler.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑭: the file ledger and the architecture spec know about the platform', () => {
  const files = read('docs/FILES.md');
  for (const f of PLATFORM) {
    const base = f.replace('js/', '');
    assert.ok(files.includes(base), 'docs/FILES.md does not describe ' + f);
  }
  const arch = readSpec(ROOT);   /* the spec: the map and its chapters (architecture-split) */
  assert.ok(/IntMapWidgetCore/.test(arch), 'Architecture.md does not mention the widget registry');
  assert.ok(/intmap_widgets4/.test(arch), 'Architecture.md does not name the storage key');
  /* ⚠ Architecture.md IS A CURRENT-STATE SPEC. `npm run check:docs` enforces "no round numbers"
     separately; this only asserts the subject is present. */
});

/* ── ⑮ EVERY DEFINITION IS COMPLETE ─────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-defs-time.js, js/widget-defs-data.js, js/widget-defs-map.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑮: every definition declares a name, a description, keywords, sizes and a category', () => {
  const src = ['js/widget-defs-time.js', 'js/widget-defs-data.js', 'js/widget-defs-map.js'].map(read).join('\n');
  const ids = [...src.matchAll(/id: '([a-z-]+\.[a-z-]+)'/g)].map((m) => m[1]);
  /* ⚠ FOUR FAMILIES ARE BUILT BY A HELPER (`id: 'progress.' + o.key`), so a sweep for a literal id
     undercounts the registry by exactly those. Their variants are named at the call sites. */
  const built = [...src.matchAll(/id: '([a-z-]+)\.' \+ (?:o\.key|key)/g)].map((m) => m[1]);
  /* ⚠ NO LINE BREAK IN THIS ANCHOR (#R283). A pattern that spells one is red on a CRLF checkout
     and green on an LF one, for a reason that is not its subject. `\s` covers both. */
  const variants = [...src.matchAll(/\s+key: '([a-z-]+)',\s/g)].map((m) => m[1])
    .concat([...src.matchAll(/metalDef\('([a-z]+)'/g)].map((m) => m[1]));
  assert.ok(built.length >= 3, 'the family helpers are found (' + built.length + ')');
  assert.ok(variants.length >= 10, 'their variants are named at the call sites (' + variants.length + ')');
  assert.ok(ids.length + variants.length >= 40,
    'the registry declares at least forty definitions (' + (ids.length + variants.length) + ')');
  assert.equal(new Set(ids).size, ids.length, 'no definition id is declared twice');
  /* every id is family.variant, and the family half is one of the declared families */
  for (const id of ids) assert.ok(/^[a-z-]+\.[a-z-]+$/.test(id), id + ' is not family.variant');
  /* the nine categories §8 asks for are the ones the registry offers */
  const core = read('js/widget-core.js');
  for (const c of ['suggested', 'map-place', 'weather-env', 'hazard-live', 'time-cal', 'world', 'knowledge', 'markets', 'space']) {
    assert.ok(core.includes("id: '" + c + "'"), 'the category ' + c + ' is missing');
  }
});

/* ── ⑯ THE ICONS ARE OURS ───────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-core.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑯: the icon set is drawn here, on one grid, and adds no external dependency', () => {
  const core = read('js/widget-core.js');
  const block = core.slice(core.indexOf('var PATHS = {'), core.indexOf('WC.icon = function'));
  const names = [...block.matchAll(/^\s{4}([a-zA-Z0-9]+):\s*'/gm)].map((m) => m[1]);
  assert.ok(names.length >= 25, 'the icon set has at least twenty-five glyphs (' + names.length + ')');
  assert.ok(/svg\.setAttribute\('viewBox', '0 0 24 24'\)/.test(core), 'every icon is on the same 24-unit grid');
  assert.ok(/svg\.setAttribute\('stroke', 'currentColor'\)/.test(core), 'every icon inherits its colour');
  assert.ok(/svg\.setAttribute\('aria-hidden', 'true'\)/.test(core), 'a decorative icon is hidden from a screen reader');
  for (const f of PLATFORM) {
    assert.ok(!/cdn|unpkg|jsdelivr|fontawesome|material-icons/i.test(read(f)), f + ' pulls an icon set from outside');
  }
});

/* ── ⑰ SMALL TYPE AND SMALL TARGETS ─────────────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R292 ⑰: nothing on the board is set below 12px', () => {
  const css = read('css/intmap.css');
  /* the board's section: from its banner to the next module banner (a line opening with `/* =====`), not to the end of the
     file — measured (wave2-train): news-next appended the story view's CSS (.nst-*) after the navigation UI, and an
     open-ended slice counted its 11 px captions as the board's. Everything the board owns is still inside. */
  const at = css.indexOf('#R292 · THE WIDGET BOARD'), next = css.indexOf('/* =====', at);
  const wgt = css.slice(at, next < 0 ? undefined : next);
  const sizes = [...wgt.matchAll(/font-size:\s*([0-9.]+)px/g)].map((m) => parseFloat(m[1]));
  assert.ok(sizes.length > 30, 'the sweep found the font sizes (' + sizes.length + ')');
  const tooSmall = sizes.filter((v) => v < 12);
  assert.deepEqual(tooSmall, [], 'these font sizes are under 12px: ' + tooSmall.join(', '));
  /* ⚠ THE 10.5px CAPTION THE PREVIOUS BOARD USED EVERYWHERE IS THE THING THIS REPLACES. */
  assert.ok(!wgt.includes('font-size:10.5px'), 'the old 10.5px caption size is gone');
  /* and the touch rule reaches 44 px without inflating the painted control */
  assert.ok(/width:max\(100%,44px\); height:max\(100%,44px\)/.test(wgt), 'the coarse-pointer hit area reaches 44 px');
});

/* ── ⑱ THE DEFAULT BOARD IS THE DOCUMENTED ONE ─────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-store.js, js/widget-defs-time.js, js/widget-defs-data.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑱: the default board is five cards, and its defaults cannot be read before they exist', () => {
  const st = read('js/widget-store.js');
  const m = st.match(/var DEFAULT_BOARD = \[([^\]]+)\]/);
  assert.ok(m, 'the default board is declared in one place');
  const ids = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.equal(ids.length, 5, 'the default board is the documented five cards');
  assert.deepEqual(ids, ['time.digital', 'markets.fx', 'map.featured-layer', 'world.country', 'knowledge.on-this-day']);
  /* ⚠⚠ THE DEFECT THIS PLATFORM WAS BUILT AROUND. The previous seed read a `const` declared 196
     lines lower in the same closure, threw a temporal-dead-zone ReferenceError on its SECOND
     iteration, and a `catch(_){}` swallowed the throw together with the two statements after it —
     so the board seeded ONE card and saved nothing, on every load, for ever. A default that is
     produced by a FUNCTION when the card is created cannot depend on where it was written. */
  assert.ok(/def\.defaultConfig \? def\.defaultConfig\(WC\.context\(\)\) : \{\}/.test(st),
    'a default config is produced by the definition at creation time, not read from a hoisted table');
  for (const f of ['js/widget-defs-time.js', 'js/widget-defs-data.js', 'js/widget-defs-markets.js', 'js/widget-defs-map.js']) {
    const src = read(f);
    /* every DEF_ table must be declared BEFORE the first defaultConfig that reads it */
    for (const t of ['DEF_FX', 'DEF_CC']) {
      const decl = src.indexOf('var ' + t + ' =');
      if (decl < 0) continue;
      const firstUse = src.indexOf(t + '[');
      assert.ok(firstUse > decl, f + ': ' + t + ' is read at line-order position ' + firstUse + ' but declared at ' + decl);
    }
  }
});

/* ── ⑲ THE TICKER IS SHARED ─────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widget-core.js, js/widget-defs-time.js, js/widget-defs-data.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ⑲: there is one ticker for the board, and it stops when nothing needs it', () => {
  const core = read('js/widget-core.js');
  /* ⚠ (#R408) the board's one ticker is now an entry on js/runtime.js's one wheel — the register
     that had existed since #R234 with zero callers. The claim is unchanged (ONE 1 Hz timer for the
     whole board, and it stops when nothing subscribes); only the spelling that carries it moved. */
  assert.ok(/tickT = everyTick\('widget-core:tick', 1000, tickRun\)/.test(core), 'one 1 Hz timer for the whole board');
  assert.ok(/if \(!tickSubs\.length && tickT\) \{ stopTick\(tickT\); tickT = null; \}/.test(core),
    'the ticker stops when its last subscriber leaves');
  assert.ok(/s\.every === 'second' \|\| minuteEdge/.test(core),
    'a card that shows no seconds is called once a minute, not sixty times');
  /* ⚠ AND NO DEFINITION MAY OPEN ITS OWN INTERVAL. */
  for (const f of ['js/widget-defs-time.js', 'js/widget-defs-data.js', 'js/widget-defs-markets.js', 'js/widget-defs-map.js', 'js/widget-layout.js']) {
    assert.ok(!/setInterval\(/.test(read(f)), f + ' opens its own interval — the board has one ticker');
  }
});

/* ── ⑳ WE DO NOT CLAIM TO BE A NATIVE WIDGET ────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R292 ⑳: nothing calls these cards an iOS home-screen widget', () => {
  const all = PLATFORM.concat(['css/intmap.css', 'PRODUCT.md', ...specFiles(ROOT)]);   /* the spec: the map and its chapters (architecture-split) */
  for (const f of all) {
    const src = read(f);
    /* the phrases that would be a claim about the operating system rather than about this page */
    for (const bad of ['home screen widget', 'home-screen widget', 'ホーム画面ウィジェット', 'lock screen widget', 'WidgetKit extension']) {
      const at = src.toLowerCase().indexOf(bad.toLowerCase());
      if (at < 0) continue;
      /* a sentence that says we are NOT one is the opposite of a claim, and is allowed */
      const around = src.slice(Math.max(0, at - 200), at + 200);
      assert.ok(/not|cannot|ではない|できません|never|future|将来/i.test(around),
        f + ' claims to be an ' + bad + ' without saying it is not one');
    }
  }
});

/* ── ㉑ THE HOST DOES NOT GROW BACK ─────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/widgets.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ㉑: js/widgets.js is a join, not a program', () => {
  const w = read('js/widgets.js');
  /* ⚠ THE IMPORT BLOCK IS NOT PROGRAM. js/widgets.js declares the platform's own load order (see ①),
     which is seventeen lines of import and comment; what this ceiling is about is whether the FILE
     went back to being a program, so the imports are discounted and the rest must stay tiny. */
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok(!/fetch\(/.test(w), 'the join fetches nothing');
  assert.ok(!/createElement/.test(w), 'the join builds no DOM');
  /* and the platform files are each small enough to be read in one sitting */
  const big = [];
  for (const f of PLATFORM) {
    const n = read(f).split('\n').length;
    if (n > 1200) big.push(f + ' (' + n + ')');
  }
  assert.deepEqual(big, [], 'these platform modules are over 1,200 lines: ' + big.join(', '));
});

/* ── ㉒ THE PLATFORM PUBLISHES ITSELF THE WAY EVERY OTHER MODULE DOES ────────────────────────── */
/* spelling kept: browser script (js/widget-core.js, js/widget-store.js, js/widget-scheduler.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R292 ㉒: each module is one IIFE on window, with no top-level declaration', () => {
  for (const f of PLATFORM) {
    const src = read(f);
    const body = src.replace(/^[\s\S]*?\*\//, '');   /* drop the leading banner comment */
    assert.ok(/window\.IntMap(Widget[A-Za-z]*|Modules)/.test(body), f + ' does not publish itself on window');
    /* the r175 ③ rule, restated locally so a failure names this round's file */
    const top = body.split('\n').filter((l) => /^(const|let|var|function|class)\s/.test(l));
    assert.deepEqual(top, [], f + ' has a top-level declaration: ' + top.join(' | '));
  }
});

/* ── ㉓ THE TESTS THIS ROUND ADDED COST NOTHING IN BROWSER TIME ──────────────────────────────── */
/* spelling kept: the claim is about the text of tests/smoke.spec.js itself. */
test('R292 ㉓: this round added no new Playwright spec file', () => {
  const specs = readdirSync(join(ROOT, 'tests')).filter((f) => /^r292.*\.spec\.js$/.test(f));
  assert.deepEqual(specs, [], 'the browser assertions were appended to tests/smoke.spec.js, which already pays for a boot');
  /* …and they really were appended */
  const smoke = read('tests/smoke.spec.js');
  assert.ok(/#R292/.test(smoke), 'tests/smoke.spec.js carries this round\'s browser assertions');
});
}
