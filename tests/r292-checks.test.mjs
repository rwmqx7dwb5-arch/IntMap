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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import vm from 'node:vm';
import { readLF } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(join(ROOT, p));
/* ⚠ A CHECK THAT READS ITS OWN EXPLANATION FAILS ON ITSELF. Every one of these files documents the
   defect it replaces, and «the three-dot placeholder» is quoted in that prose — so a search for a
   forbidden spelling must look at CODE. `code()` strips block and line comments (and the strings
   that would confuse them) before the search. This is the fifteenth time this project has been bitten
   by a check hitting its own comment; doing it in one helper is the answer that keeps working. */
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*/g, '$1 ');

const PLATFORM = [
  'js/widget-core.js', 'js/widget-store.js', 'js/widget-scheduler.js', 'js/widget-render.js',
  'js/widget-smart.js', 'js/widget-defs-time.js', 'js/widget-defs-data.js', 'js/widget-defs-markets.js', 'js/widget-defs-map.js',
  'js/widget-layout.js', 'js/widget-gallery.js', 'js/widgets.js',
];

/* ── ① THE MODULES EXIST, ARE REACHABLE, AND ARE LOADED IN DEPENDENCY ORDER ─────────────────── */
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
test('R292 ⑧: the Atlas briefing card has no loader, no interval and no AI call', () => {
  const src = read('js/widget-defs-map.js');
  const at = src.indexOf("id: 'intmap.atlas-brief'");
  assert.ok(at > 0, 'the Atlas briefing definition exists');
  const block = src.slice(at, src.indexOf("function plain(md)", at));
  assert.ok(/refreshPolicy: \{ kind: 'manual' \}/.test(block), 'the briefing card is `manual` — the scheduler cannot drive it');
  assert.ok(!/loader:/.test(block), 'the briefing card must have no loader');
  assert.ok(!/askAI|ai-proxy|IntMapConsole|dispatch\(/.test(block), 'the briefing card must not reach the AI');
  /* the handover is written by Atlas, on a brief the reader asked for */
  const console_ = read('js/atlas-console.js');
  assert.ok(console_.includes('window.IntMapWidgetBriefStore'), 'js/atlas-console.js hands a requested brief to the board');
  assert.ok(/IntMapWidgetBriefStore\.remember/.test(console_), 'the handover calls remember(), it does not ask for anything');
});

/* ── ⑨ THE MOBILE PICKER IS GONE ────────────────────────────────────────────────────────────── */
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
test('R292 ⑭: the file ledger and the architecture spec know about the platform', () => {
  const files = read('docs/FILES.md');
  for (const f of PLATFORM) {
    const base = f.replace('js/', '');
    assert.ok(files.includes(base), 'docs/FILES.md does not describe ' + f);
  }
  const arch = read('Architecture.md');
  assert.ok(/IntMapWidgetCore/.test(arch), 'Architecture.md does not mention the widget registry');
  assert.ok(/intmap_widgets4/.test(arch), 'Architecture.md does not name the storage key');
  /* ⚠ Architecture.md IS A CURRENT-STATE SPEC. `npm run check:docs` enforces "no round numbers"
     separately; this only asserts the subject is present. */
});

/* ── ⑮ EVERY DEFINITION IS COMPLETE ─────────────────────────────────────────────────────────── */
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
test('R292 ⑰: nothing on the board is set below 12px', () => {
  const css = read('css/intmap.css');
  const wgt = css.slice(css.indexOf('#R292 · THE WIDGET BOARD'));
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
test('R292 ⑳: nothing calls these cards an iOS home-screen widget', () => {
  const all = PLATFORM.concat(['css/intmap.css', 'PRODUCT.md', 'Architecture.md']);
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
test('R292 ㉑: js/widgets.js is a join, not a program', () => {
  const w = read('js/widgets.js');
  /* ⚠ THE IMPORT BLOCK IS NOT PROGRAM. js/widgets.js declares the platform's own load order (see ①),
     which is seventeen lines of import and comment; what this ceiling is about is whether the FILE
     went back to being a program, so the imports are discounted and the rest must stay tiny. */
  const lines = w.split(String.fromCharCode(10)).filter((l) => !/^import '[.]\//.test(l)).length;
  assert.ok(lines < 130, 'js/widgets.js is ' + lines + ' lines of body — it was 924, and it is now the join only');
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
test('R292 ㉓: this round added no new Playwright spec file', () => {
  const specs = readdirSync(join(ROOT, 'tests')).filter((f) => /^r292.*\.spec\.js$/.test(f));
  assert.deepEqual(specs, [], 'the browser assertions were appended to tests/smoke.spec.js, which already pays for a boot');
  /* …and they really were appended */
  const smoke = read('tests/smoke.spec.js');
  assert.ok(/#R292/.test(smoke), 'tests/smoke.spec.js carries this round\'s browser assertions');
});
