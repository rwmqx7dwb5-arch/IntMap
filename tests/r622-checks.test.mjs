/* ============================================================================
 *  R622 · The wave layer's first switch-on, and where it sits in the stack
 * ----------------------------------------------------------------------------
 *  Two defects that PRODUCTION found and 3,440 green tests did not. Both were reproduced on the
 *  built page before a line of js/waves.js was changed, and both are measured here rather than
 *  spelled: nothing below asserts a string, a layer id or a call order that the module merely
 *  happens to have today.
 *
 *  ── ⚠⚠⚠ (A) THE FIRST TOGGLE AFTER A PAGE LOAD ALWAYS FAILED ────────────────────────────────
 *  MEASURED on the built page (patched `E.load`, twice out of two, and twice in production):
 *
 *      6007 ms  load(wave_height) called      6007 ms  load(wave_period) called
 *      6010 ms  load(wave_height) → NULL      ← 3 ms, and NOT ONE REQUEST WAS SENT
 *      8363 ms  load(wave_period) → frame
 *
 *  js/wx-ecmwf.js's `load()` SUPERSEDES, and its ticket counts reads OF A MODEL rather than reads
 *  of a variable (`var mine = ++seq` … `if (!ahead && seq !== mine) return frames.filter(…)[0] ||
 *  null`). Two reads issued in one tick therefore cancel the FIRST of them, and on a cold layer
 *  there is no earlier frame of that variable to fall back on — so the height answered null having
 *  asked for nothing, `fail()` fired, and the row put itself back. The SECOND click worked because
 *  the period frame was then in hand and `load` returns a covering frame BEFORE taking a ticket.
 *  ⚠ THE ENGINE HERE IMPLEMENTS THAT RULE, NOT A FRIENDLIER ONE. A stub that always answers with
 *  data cannot fail this test, which is the shape #R552 named: a fixture more capable than the
 *  thing that ships proves nothing about the thing that ships.
 *
 *  ── ⚠⚠⚠ (C) THE PARTICLES WERE ANIMATED AT A SPEED WINDY DOES NOT USE ──────────────────────
 *  The reader asked for 「全部 Windy と同じ挙動に」. This file's ⑦ and ⑧ pin the one part of that
 *  which is arithmetic: WHAT the particle speed is made of. Windy's own decoder answers it —
 *      W.utils.wave2obj = ([e,t,n]) => ({ period: hypot(e,t), dir: …(e,t,10), size: n })
 *  read out of the live bundle on 2026-09-10 — so the R,G vector their particle shader is steered by
 *  carries the WAVE PERIOD IN SECONDS as its magnitude, and `glMaxSpeedParam = 10` means ten seconds.
 *  MEASURED the same day, against their own `W.interpolator.getLatLonInterpolator()` sampled every
 *  0.25° over the open North Atlantic (25–60N, 55–15W; 22,690 points) and against our own
 *  `wave_period` on the same box (22,617 nodes of ecmwf_wam025):
 *      quantile      p5     p25    p50    p75    p95     mean
 *      Windy       6.21    6.84   7.40   7.91   8.69     7.37   s
 *      ours        6.30    6.90   7.35   7.80   8.70     7.38   s
 *  — the same distribution to about 1%, which is what says the units are seconds. Under the phase
 *  speed gT/2π this file shipped until #R577 our numbers would have been 1.56× theirs, and under the
 *  group speed gT/4π it shipped until #R622, 0.78×.
 *
 *  ── ⚠⚠⚠ (B) THE COLOUR FIELD DISAPPEARED UNDER AN OCEAN RASTER ──────────────────────────────
 *  MEASURED on the built page, sea surface temperature on and then the waves: `state()` answered
 *  `painted:true` for a layer with nothing of it on the screen, and the style's order said why —
 *  `… im-night-shade, im-waves, lyr-sst, coast-only-casing …`. The pixel at the centre of the view
 *  went 71,178,54 (SST's green) with both on and 84,84,175 (the wave ramp) with SST off.
 *  After the fix, both switch-on orders end `… lyr-sst, im-waves, layer-sat-labels …` and the
 *  centre pixel is the wave ramp's.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the smallest browser js/waves.js can run in ──────────────────────────────────────────────
   Deliberately POORER than a real one: it answers `null` to every query, holds no layout and
   paints nothing. Everything the tests below judge is arithmetic or call order inside the shipped
   module, so a richer DOM would only hide which of the two is doing the work. */
function makeElement(tag) {
  return {
    tagName: tag, style: {}, className: '', id: '', children: [], _html: '',
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    classList: { toggle() { }, add() { }, remove() { } },
    addEventListener() { }, removeEventListener() { },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; }
  };
}

/* THE MEASURED STYLE. Read out of the built page on 2026-09-10 with `map.style._order`, trimmed to
   the band this round is about. ⚠ `im-waves` is NOT in it and that is the fact the fix leans on:
   MapLibre cannot serialise a custom layer, so `getStyle()` never lists one — which is what makes
   「re-take my place whenever the order changed」 idempotent instead of a feedback loop. */
const MEASURED_STYLE = [
  { id: 'im-night-lights-lyr', type: 'raster' },
  { id: 'im-night-shade', type: 'fill' },
  { id: 'country-fill', type: 'fill' },
  { id: 'country-line', type: 'line' },
  { id: 'layer-sat-labels', type: 'raster' },
  { id: 'coast-only-casing', type: 'line' },
  { id: 'coast-only-line', type: 'line' },
  { id: 'borders-only-line', type: 'line' },
  { id: 'ofm-city', type: 'symbol' },
  { id: 'ofm-country', type: 'symbol' },
  { id: 'tool-poly', type: 'fill' }
];
/* the ocean raster the reader had switched on first, where the app actually puts it */
const OCEAN_RASTER = { id: 'lyr-sst', type: 'raster' };

/* ── the app's own «under the labels» answer, EVALUATED rather than re-typed ──────────────────
   js/data-layers.js is the whole layer panel and cannot be imported here, but the one expression
   this round shares with it can be: the published `window.IntMapBelowLabels` is lifted out of the
   shipped source and run against the style below. #R505's rule — a check that READS source cannot
   tell whether it evaluates; this one evaluates it, so renaming the anchors in that file moves this
   test's expectation with them instead of leaving it asserting a spelling. */
function belowLabelsFromSource(geFn) {
  const src = read('js/data-layers.js');
  const at = src.indexOf('window.IntMapBelowLabels');
  assert.ok(at > 0, 'js/data-layers.js no longer publishes the shared label anchor');
  const eq = src.indexOf('=', at);
  /* ⚠ the statement spans lines and the file's line ending is not this file's (#R548), so the end
     is found by SCANNING to the first `;` at depth zero rather than by looking for a `;\n`. */
  let end = -1, depth = 0, quote = null;
  for (let i = eq + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) { end = i; break; }
  }
  assert.ok(end > 0, 'could not find the end of the IntMapBelowLabels statement');
  const expr = src.slice(eq + 1, end).trim().replace(/^\(\)\s*=>/, '');
  /* `beforeId` is that file's own fallback (the drawing-tools layer); it is not in this style */
  const fn = new Function('GE', 'beforeId', 'return (' + expr + ');');
  return () => fn(geFn, undefined);
}

/* ── the engine, with js/wx-ecmwf.js's supersession rule and nothing else ─────────────────────── */
function makeModel(log, opts) {
  opts = opts || {};
  let seq = 0;
  const frames = Object.create(null);
  const GRID = { nx: 8, ny: 4, lonMin: -180, latMin: -90, dx: 45, dy: 45 };
  const N = GRID.nx * GRID.ny;
  return {
    DOMAIN: 'ecmwf_wam025',
    ready: () => Promise.resolve(true),
    on() { return this; }, off() { return this; },
    validTime: () => '2026-09-09T21:00Z',
    referenceTime: () => '2026-09-09T12:00:00Z',
    fmt: () => '21:00',
    before: () => 'country-fill',           /* what `before()` answers in the measured style */
    sampler: () => null,                    /* → `orient` falls back to the grid's declaration */
    metaSync: () => ({}), meta: () => Promise.resolve({}),
    sdk: () => ({ domainOptions: [{ value: 'ecmwf_wam025', grid: GRID }] }),
    load(variable) {
      /* a frame that covers the request is answered BEFORE a ticket is taken — `frameCovering` */
      if (frames[variable]) { log.push({ ev: 'hit', variable }); return Promise.resolve(frames[variable]); }
      const mine = ++seq;
      log.push({ ev: 'start', variable });
      return new Promise((r) => setTimeout(r, opts.ms == null ? 8 : opts.ms)).then(() => {
        log.push({ ev: 'settle', variable });
        if (opts.throwOn === variable) throw new Error('upstream said no');
        if (opts.nullOn === variable) return null;
        /* ⚠ THE RULE: a stale ticket answers with a frame of its own variable, or null */
        if (seq !== mine) return frames[variable] || null;
        const f = { data: { values: new Float32Array(N).fill(1.5), directions: new Float32Array(N) } };
        frames[variable] = f;
        return f;
      });
    }
  };
}

function mount(opts) {
  opts = opts || {};
  const log = [];
  const toasts = [];
  const warns = [];
  const style = { layers: (opts.style || MEASURED_STYLE).map((l) => Object.assign({}, l)) };
  const custom = new Set();
  const events = Object.create(null);
  const rec = { adds: [], moves: [], removes: [] };
  const model = makeModel(log, opts);

  const win = globalThis.window;
  win.IntMapLang = { pick: () => (en) => en, pickArgs: () => () => '' };
  win.IntMapWxModels = {
    all: () => [{ id: 'ecmwf_wam025', nameKey: 'ECMWF WAM', km: 28, map: true, roles: ['wave'] }],
    get: (id) => (id === 'ecmwf_wam025' ? { id, nameKey: 'ECMWF WAM', km: 28, roles: ['wave'] } : null),
    availability: () => ({ ok: true }),
    provenance: (o) => ({ modelId: o.modelId, modelName: 'ECMWF WAM', nativeResolutionKm: 28, validTime: o.validTime, runTime: o.referenceTime })
  };
  win.IntMapWxEngine = { model: () => model, peek: () => model };
  win.IntMapGeoEngine = {
    hasRenderer: () => true,
    id: () => 'maplibre',
    scene: { getStyle: () => ({ layers: style.layers.slice() }) },   /* custom layers are absent — see above */
    layers: {
      has: (id) => custom.has(id) || style.layers.some((l) => l.id === id),
      get: (id) => style.layers.find((l) => l.id === id) || (custom.has(id) ? { id } : null),
      add(layer, before) { rec.adds.push({ id: layer.id, before }); custom.add(layer.id); },
      move(id, before) { rec.moves.push({ id, before }); },
      remove(id) { rec.removes.push(id); custom.delete(id); }
    },
    events: { on: (name, fn) => { (events[name] || (events[name] = [])).push(fn); } },
    render: { triggerRepaint() { } }
  };
  win.IntMapBelowLabels = belowLabelsFromSource(() => win.IntMapGeoEngine);
  const HOST = { lang: 'en', unitMode: 'metric', satToast: (m) => toasts.push(m), t: () => 'close' };
  const api = win.IntMapModules.waves(HOST);
  return {
    api, log, toasts, warns, rec, style, custom, model,
    fire(name) { (events[name] || []).forEach((f) => f({})); },
    captureWarnings() {
      const prev = console.warn;
      console.warn = (...a) => warns.push(a.join(' '));
      return () => { console.warn = prev; };
    }
  };
}

/* the module publishes onto `window` at import time, so the browser has to exist first */
globalThis.window = globalThis.window || globalThis;
globalThis.window.devicePixelRatio = 1;
globalThis.window.addEventListener = () => { };
globalThis.document = { createElement: makeElement, getElementById: () => null, body: makeElement('body'), querySelector: () => null };
await import('file://' + join(ROOT, 'js/waves.js').replace(/\\/g, '/'));

const settle = (ms) => new Promise((r) => setTimeout(r, ms == null ? 120 : ms));

test('① the forecast variables are read one after another, never in the same tick', async () => {
  const env = mount();
  await env.api.toggle(true);
  await settle();

  const starts = env.log.filter((e) => e.ev === 'start' || e.ev === 'settle');
  /* every read must have SETTLED before the next one STARTS. Measured from the engine's own log,
     so it is a property of js/waves.js rather than of a spelled call order. */
  let open = null;
  for (const e of starts) {
    if (e.ev === 'start') {
      assert.equal(open, null,
        'js/waves.js started a read of ' + e.variable + ' while ' + open + ' was still in flight. '
        + 'js/wx-ecmwf.js supersedes per MODEL, so the older of two overlapping reads answers null '
        + 'on a cold layer — see (A) at the top of this file.');
      open = e.variable;
    } else { open = null; }
  }
  const variables = env.api._variables();
  assert.ok(variables.length >= 2, 'the layer reads more than one variable, or this proves nothing');
  assert.equal(env.log.filter((e) => e.ev === 'start').length, variables.length,
    'every variable the layer names was actually asked for');
});

test('② a cold first switch-on paints, against an engine that supersedes per model', async () => {
  const env = mount();
  const on = await env.api.toggle(true);
  await settle();
  assert.equal(on, true);
  assert.deepEqual(env.toasts, [],
    'the first switch-on after a page load showed the failure toast — this is the production defect');
  const st = env.api.state();
  assert.equal(st.painted, true, 'nothing was added to the map');
  assert.equal(st.failure, null, 'a painted layer must not be carrying a failure');
  assert.ok(st.displayed && st.displayed.modelId === 'ecmwf_wam025');
});

test('③ a read that produced no picture says WHY, somewhere the toast cannot swallow', async () => {
  for (const [opts, why] of [[{ nullOn: 'wave_height' }, 'no_field'], [{ throwOn: 'wave_height' }, 'exception']]) {
    const env = mount(opts);
    const restore = env.captureWarnings();
    await env.api.toggle(true);
    await settle();
    restore();
    const st = env.api.state();
    assert.ok(st.failure, 'the layer failed and kept no reason at all');
    assert.equal(st.failure.why, why, 'the endings must be told apart, not merged into one sentence');
    assert.equal(env.toasts.length, 1, 'the reader is still told, once');
    assert.ok(env.warns.length >= 1, 'nothing reached the console — which is why (A) took a patched load() to find');
    assert.ok(env.warns.join(' ').indexOf(why) >= 0, 'the console line does not carry the reason');
  }
  /* the thrown case must carry the upstream's own words, not just a category */
  const env = mount({ throwOn: 'wave_height' });
  const restore = env.captureWarnings();
  await env.api.toggle(true);
  await settle();
  restore();
  assert.ok(env.api.state().failure.detail.indexOf('upstream said no') >= 0,
    'the exception was caught and its message thrown away — `.catch(() => fail())` is the defect');
});

test('④ the sea state is placed above the ocean rasters and under the label stack', async () => {
  /* the reader switched an ocean raster on first — where the app actually puts it (#R622, measured) */
  const style = MEASURED_STYLE.slice();
  style.splice(style.findIndex((l) => l.id === 'layer-sat-labels'), 0, OCEAN_RASTER);
  const env = mount({ style });
  await env.api.toggle(true);
  await settle();

  assert.equal(env.rec.adds.length, 1, 'the layer is added exactly once');
  const anchor = env.rec.adds[0].before;
  const ids = env.style.layers.map((l) => l.id);
  const at = ids.indexOf(anchor);
  assert.ok(at >= 0, 'the layer was anchored at «' + anchor + '», which is not in the style');
  /* ⚠ MEASURED, NOT SPELLED: the position is judged against the style, so an app that renames or
     reorders its label stack changes the expected answer with it. */
  assert.ok(at > ids.indexOf(OCEAN_RASTER.id),
    'the sea state sits UNDER ' + OCEAN_RASTER.id + ' — an opaque ocean raster paints over all of it, '
    + 'which is exactly what production reported while state() answered painted:true');
  const labels = ['coast-only-casing', 'borders-only-line', 'ofm-city', 'ofm-country'];
  for (const l of labels) {
    assert.ok(at <= ids.indexOf(l),
      'the sea state was placed above ' + l + ' — the place names and the borders stay in front of '
      + 'every data layer (#R25)');
  }
});

test('⑤ …and it takes its place back when somebody else changes the stack', async () => {
  const env = mount();
  await env.api.toggle(true);
  await settle();
  assert.equal(env.rec.moves.length, 0, 'nothing to re-place yet');

  /* a raster switched on AFTER this layer is inserted above it (js/label-occlusion.js sinks it to
     just under the labels, which is where this layer is) */
  env.style.layers.splice(env.style.layers.findIndex((l) => l.id === 'layer-sat-labels'), 0, OCEAN_RASTER);
  env.fire('styledata');
  await settle(200);
  assert.equal(env.rec.moves.length, 1, 'the sea state stayed under the raster that was added over it');
  const ids = env.style.layers.map((l) => l.id);
  assert.ok(ids.indexOf(env.rec.moves[0].before) > ids.indexOf(OCEAN_RASTER.id),
    'it moved, but not above the raster');

  /* ⚠ AND IT MUST NOT MOVE FOREVER. The signature it compares is the style's own layer order, which
     a custom layer is not part of — so our own move cannot trigger another one. */
  env.fire('styledata');
  await settle(200);
  env.fire('styledata');
  await settle(200);
  assert.equal(env.rec.moves.length, 1, 'the re-placement fed itself: styledata → move → styledata → …');
});

test('⑥ «under the labels» is one answer, not a fourth copy of a list', () => {
  const dl = read('js/data-layers.js');
  const LIST = /\['layer-sat-labels','borders-only-line','ofm-country','ofm-city','ofm-other'\]/g;
  assert.equal((dl.match(LIST) || []).length, 1,
    'js/data-layers.js writes the label-anchor list more than once. It is published as '
    + 'window.IntMapBelowLabels() precisely so the next caller does not add a copy — #R515.');
  assert.match(dl, /window\.IntMapBelowLabels\s*=/, 'the one answer is published');
  const waves = read('js/waves.js');
  assert.match(waves, /IntMapBelowLabels/, 'js/waves.js must ASK for the anchor, not carry its own list');
  assert.ok(!LIST.test(waves), 'js/waves.js carries a copy of the label-anchor list');
});


/* ── ⑦⑧ the speed law. The module is a plain IIFE, so it can be imported and CALLED here ────── */
await import('file://' + join(ROOT, 'js/waves-gl.js').replace(/\\/g, '/'));
const GL = globalThis.IntMapWavesGL;

test('⑦ the particle speed is the wave period in seconds, not a wave velocity', () => {
  const W = GL.PRESET;
  const sp = GL.speedParam;
  assert.equal(typeof sp, 'function', 'js/waves-gl.js no longer publishes the speed law');

  /* the ceiling is TEN SECONDS, and it is `glMaxSpeedParam` — read from the preset, not retyped */
  assert.equal(sp(W.glMaxSpeedParam), 1, 'a period of glMaxSpeedParam seconds must be full speed');
  assert.equal(sp(W.glMaxSpeedParam * 2), 1, 'and anything longer clamps there');
  /* linear in between: glSpeedCurvePowParam = 1 in Windy's `waves` preset */
  for (const T of [2, 3.5, 5, 7.25, 9]) {
    assert.ok(Math.abs(sp(T) - T / W.glMaxSpeedParam) < 1e-12,
      'T = ' + T + ' s should normalise to T/' + W.glMaxSpeedParam + ', got ' + sp(T));
  }
  /* the floor is `glMinSpeedParam` seconds, expressed in the same units */
  assert.equal(sp(0.1), W.glMinSpeedParam / W.glMaxSpeedParam, 'below glMinSpeedParam it holds');
  /* and a node with no period is not a slow node: the shader's own floor decides what happens */
  for (const bad of [NaN, Infinity, -3, 0, undefined, null]) assert.equal(sp(bad), 0);

  /* ⚠ THE TWO LAWS THIS FILE HAS ALREADY WORN, NAMED SO THEY CANNOT COME BACK BY ACCIDENT. Both are
     dispersion relations in deep water and both were wrong, because the ceiling is not denominated
     in m/s — see the header of js/waves-gl.js. A regression to either is a visible change of speed
     (0.78× or 1.56×) and this is the line that says so. */
  const g = 9.80665;
  for (const [name, law] of [['phase gT/2π', (T) => g * T / (2 * Math.PI)],
                             ['group gT/4π', (T) => g * T / (4 * Math.PI)]]) {
    const T = 4;                                   /* below the ceiling under every candidate */
    const asVelocity = Math.min(W.glMaxSpeedParam, Math.max(W.glMinSpeedParam, law(T))) / W.glMaxSpeedParam;
    assert.ok(Math.abs(sp(T) - asVelocity) > 0.05,
      'the speed law has drifted back to the ' + name + ' velocity: at T = ' + T + ' s it answers '
      + sp(T) + ', which is that law and not the period Windy animates');
  }
});

test('⑧ …and the packed field is that law, in the shipped module, not a second copy of it', async () => {
  /* ⚠ #R552's shape: a fixture that re-implements the thing under test proves nothing about the
     thing that ships. `setData` cannot be read back without a GPU — it packs into a texture — so the
     WIRING is read out of the module's own syntax tree instead of its spelling: whatever expression
     lands in the alpha byte must be a CALL to the published speed law, with the period as argument. */
  const acorn = await import('acorn');
  const src = read('js/waves-gl.js');
  const ast = acorn.parse(src, { ecmaVersion: 2020 });
  let found = null;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.computed) {
      /* buf[i * 4 + 3] = … — the alpha byte of the packed data texture */
      const k = src.slice(n.left.property.start, n.left.property.end).replace(/\s+/g, '');
      if (/^i\*4\+3$/.test(k)) found = n;
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') walk(n[k]);
  })(ast);
  assert.ok(found, 'nothing in js/waves-gl.js assigns to the alpha byte of the packed field any more');
  const rhs = src.slice(found.right.start, found.right.end);
  assert.match(rhs, /speedParam\s*\(/,
    'the alpha byte is packed by an expression that does not call the published speed law: «' + rhs
    + '». A second arithmetic here is how the phase and the group velocities each survived a round.');
  assert.ok(!/9\.80665|Math\.PI\s*\*\s*4|4\s*\*\s*Math\.PI/.test(rhs),
    'the alpha byte is packed with gravity in it: «' + rhs + '»');
});

test('⑨ off the desktop, half as many particles — through the answer the app already publishes', () => {
  /* ⚠ EVALUATED. `window._imPhoneClass` is js/app-body.js's published device answer (#R232/#R498);
     this asks the shipped `particleCount` what it does when that answer changes, rather than reading
     the file for a media query. */
  const r = GL.create({});
  const before = globalThis.window._imPhoneClass;
  try {
    globalThis.window._imPhoneClass = undefined;
    const desktop = r.particleCount(1200, 800, 3);
    globalThis.window._imPhoneClass = () => true;
    const phone = r.particleCount(1200, 800, 3);
    assert.ok(desktop > 1, 'the desktop count collapsed to the floor; this proves nothing');
    assert.ok(Math.abs(phone / desktop - 0.5) < 0.02,
      'a phone must be drawn half the particles (Windy halves `getAmount` off the desktop): '
      + phone + ' against ' + desktop);
    globalThis.window._imPhoneClass = () => { throw new Error('no'); };
    assert.equal(r.particleCount(1200, 800, 3), desktop,
      'a device answer that throws must leave the desktop numbers standing, not kill the layer');
  } finally { globalThis.window._imPhoneClass = before; }
});
