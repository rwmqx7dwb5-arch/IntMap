/* ══ R707 — THE SHAPE UPSTREAM DID NOT NAME, AND THE LADDER RUNG NOTHING CLIMBS ════════════════
 *
 *  TWO things, both of them «the code and the sentence beside it disagree».
 *
 *  ① js/time-borders.js ships ~6,955 unnamed polygons in the era sheets, and in the deep ones they
 *     cover MORE ground than the named (world_bc123000: 18,345 deg² against 3,210). `_labelFC`
 *     skips them (no name → no symbol) and `_clk` was bound to the two NAME layers only, so a
 *     reader could not reach them at all: everything upstream does say about such a shape — its
 *     `TYPE`, its `BORDERPRECISION` — existed in `typeNote()` with no path to a screen. The only
 *     statement was the layer row's `title` tooltip, which needs a hover and therefore does not
 *     exist on a phone. #R707 binds `imtb-fill`, which has been the click target since #R94k and
 *     whose own comment admitted it had no handler.
 *
 *  ② js/label-scale.js `PLACE.era` has had no caller since #R309 moved both era label layers to
 *     `place('country')`, while the comment above it still described it in the present tense.
 *
 *  ⚠ THESE CHECKS EVALUATE THE MODULES, THEY DO NOT READ THEM (#R505). js/time-borders.js runs in
 *  a vm with the shipped data/hist-eras.js, the REAL js/lang-registry.js (#R621: a hand-written
 *  language stub resolves tuples by a rule of its own and repairs `L(LA(…))`-class bugs on the way
 *  past) and the REAL js/label-scale.js. The renderer stub is a RECORDER: it remembers which layers
 *  were added and which handlers were bound, answers `queryRenderedFeatures` with whatever the test
 *  put under the point, and implements `claimClick`/`clickClaimed` with the identity rule
 *  js/geo-engine.js uses. It has no door the real contract does not have (#R585).
 *
 *  ⚠ WHAT THEY DELIBERATELY DO NOT MEASURE: the spelling of any sentence (#R488). ③ asserts that
 *  en and jp are DIFFERENT and that upstream's own words ride through verbatim — never what the
 *  wording is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the renderer, as a RECORDER ───────────────────────────────────────────────────────────────
   Every method here exists on js/geo-engine.js's contract and does the least that can be called
   doing it. `queryRenderedFeatures` answers [] until a test says otherwise, which is the honest
   default: nothing else is under the point. */
function makeEngine() {
  const layers = new Map(), sources = new Map();
  const onLayerClick = new Map(), mapClick = [], popups = [], wired = new Set();
  let claimed = null;
  const state = { query: () => [] };
  const eng = {
    hasRenderer: () => true,
    ready: () => true,
    layers: {
      hasSource: (id) => sources.has(id),
      addSource: (id, d) => { sources.set(id, d); },
      setSourceData: (id, d) => { if (!sources.has(id)) throw new Error('no such source: ' + id); sources.set(id, d); },
      has: (id) => layers.has(id),
      get: (id) => layers.get(id) || null,
      add: (def) => { layers.set(def.id, { def, layout: Object.assign({}, def.layout) }); },
      setLayout: (id, k, v) => { const l = layers.get(id); if (l) l.layout[k] = v; },
      getLayout: (id, k) => { const l = layers.get(id); return l ? l.layout[k] : undefined; },
      setPaint: () => {}, remove: (id) => layers.delete(id), move: () => {},
    },
    events: {
      /* the real contract records every click-wired layer id here — js/geo-engine.js:1958 */
      onLayer: (type, id, fn) => {
        if (type !== 'click') return;
        wired.add(id);
        onLayerClick.set(id, (onLayerClick.get(id) || []).concat(fn));
      },
      on: (type, fn) => { if (type === 'click') mapClick.push(fn); },
      clickLayers: () => Array.from(wired),
      /* identity, not a timer — js/geo-engine.js:68 */
      claimClick: (e) => { claimed = (e && e.originalEvent) || e || null; },
      clickClaimed: (e) => { const oe = (e && e.originalEvent) || e || null; return !!(oe && claimed === oe); },
    },
    coords: { queryRenderedFeatures: (pt, o) => state.query(pt, o) },
    ui: {
      popup: (o) => ({
        opts: o, html: '', at: null, removed: false,
        setLngLat(ll) { this.at = ll; return this; },
        setHTML(h) { this.html = h; return this; },
        remove() { this.removed = true; },
      }),
      attach: (p) => { popups.push(p); return p; },
    },
    render: { canvas: () => ({ style: {} }) },
  };
  return {
    eng, layers, popups, state, wired,
    /* the layer that is open right now, if any */
    live: () => popups.filter((p) => !p.removed),
    fire: (id, e) => (onLayerClick.get(id) || []).forEach((fn) => fn(e)),
    bound: (id) => (onLayerClick.get(id) || []).length,
    /* a click as MapLibre delivers it: one DOM event shared by every listener */
    click: (features, pt) => ({ features, point: pt || { x: 100, y: 100 }, lngLat: { lng: 10, lat: 20 }, originalEvent: {} }),
  };
}

function loadModule(lang = 'en') {
  const noop = () => {};
  const E = makeEngine();
  const win = {
    addEventListener: noop, setTimeout: (f) => { try { f(); } catch (_) {} return 0; }, clearTimeout: noop, setInterval: () => 0,
    IntMapModules: {}, IntMapGeoEngine: E.eng, IntMapTime: { on: noop },
    _applyBorders: noop,
    /* the other two bundles are honestly absent: a <script> tag in this context fails, which is the
       real degraded path (#R518) and the reason the snapshot tier is the one that answers. */
    document: {
      getElementById: () => null,
      createElement: () => { const el = {}; queueMicrotask(() => { try { el.onerror && el.onerror(); } catch (_) {} }); return el; },
      head: { appendChild: noop },
      documentElement: { setAttribute: noop },
    },
    navigator: { language: 'en' },
  };
  win.window = win;
  const ctx = vm.createContext(win);
  /* the REAL language registry, over the REAL generated language list */
  vm.runInContext(rd('js/locales/_langs.js'), ctx);
  vm.runInContext(rd('js/lang-registry.js'), ctx);
  vm.runInContext(rd('js/label-scale.js'), ctx);
  vm.runInContext(rd('js/hist-scale.js'), ctx);
  vm.runInContext(rd('data/hist-eras.js'), ctx);
  vm.runInContext(rd('js/time-borders.js'), ctx);
  const HOST = { lang, canDraw: () => true, isMobile: () => false };
  return { mod: ctx.window.IntMapModules.timeBorders(HOST), bundle: ctx.window.__HISTERAS, win: ctx.window, E, HOST };
}

/* a sheet the record itself says has unnamed shapes */
const deepestBlankSheet = (bundle) =>
  bundle.snaps.filter((s) => (s.blank || []).length).sort((a, b) => a.y - b.y)[0];

const strip = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('① a shape upstream did not name is described by its absence, never given a name', () => {
  const { mod } = loadModule();
  const n = mod.blankNote({ properties: { NAME: '' } });
  assert.ok(n && n.title && n.title.length > 10, 'the heading is a statement, not an empty string');
  assert.ok(Array.isArray(n.lines) && n.lines.length >= 1,
    'and «upstream states nothing» is SAID rather than left as a blank card (#R699)');
  /* the one thing this branch exists to prevent */
  for (const s of [n.title].concat(n.lines)) {
    assert.ok(!/unnamed polygon|unknown region|shape \d/i.test(s), 'no manufactured designation: ' + s);
  }
  assert.deepEqual(mod.blankNote({ properties: {} }), mod.blankNote(null),
    'an absent feature and a propertyless one say the same thing — there is no third state');
});

test('② the body is upstream\'s own words, and a field upstream does not state produces no line', () => {
  const { mod } = loadModule();
  const bare = mod.blankNote({ properties: {} }).lines;
  assert.equal(bare.length, 1, 'nothing stated → exactly the «nothing stated» line, no empty rows');

  /* both spellings, for the reason `coverage()` reads both: the bundle folds them to upper case,
     the remote aourednik fallback hands them over as upstream wrote them. */
  for (const [K, k] of [['TYPE', 'type'], ['SUBJECTO', 'subjecto'], ['PARTOF', 'partof']]) {
    for (const spelling of [K, k]) {
      const lines = mod.blankNote({ properties: { [spelling]: 'Kingdom of Saba' } }).lines;
      assert.equal(lines.length, 1, `${spelling}: one field stated → one line`);
      assert.ok(lines[0].includes('Kingdom of Saba'), `${spelling}: upstream's words appear verbatim`);
      assert.ok(lines[0].length > 'Kingdom of Saba'.length,
        `${spelling}: and they are marked as upstream's, not printed as a name of IntMap's`);
    }
  }
  /* whitespace is not a statement */
  assert.equal(mod.blankNote({ properties: { TYPE: '  ', SUBJECTO: '\t', PARTOF: '' } }).lines.length, 1);

  /* everything at once, and the boundary-precision classification rides in through `typeNote` */
  const all = mod.blankNote({ properties: { TYPE: 'culture', SUBJECTO: 'Rome', PARTOF: 'Gaul', BORDERPRECISION: 1 } }).lines;
  assert.equal(all.length, 3, 'three statements → three lines');
  const joined = all.join(' | ');
  for (const v of ['culture', 'Rome', 'Gaul']) assert.ok(joined.includes(v), v + ' is reported');
  assert.ok(joined.toLowerCase().includes('approximate'),
    'and BORDERPRECISION=1 reaches the card through typeNote, which already owns that vocabulary');
});

test('③ the new text is authored in en and jp, and the seven frozen languages fall back rather than break', () => {
  const f = { properties: { TYPE: 'culture', SUBJECTO: 'Rome', PARTOF: 'Gaul' } };
  const en = loadModule('en').mod.blankNote(f), jp = loadModule('jp').mod.blankNote(f);
  assert.notEqual(en.title, jp.title, 'the heading is written in both authored languages');
  for (let i = 0; i < en.lines.length; i++) {
    assert.notEqual(en.lines[i], jp.lines[i], 'line ' + i + ' is written in both authored languages');
    for (const v of ['culture', 'Rome', 'Gaul']) {
      if (en.lines[i].includes(v)) assert.ok(jp.lines[i].includes(v), 'upstream\'s word survives translation');
    }
  }
  /* CONSTITUTION §7 / scripts/lang-policy.mjs: the other seven are FROZEN, not deleted — a reader
     of one gets English for text authored after the amendment, and never an empty card. */
  for (const lang of ['de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']) {
    const n = loadModule(lang).mod.blankNote(f);
    assert.ok(n.title && n.title.length > 10, lang + ': the heading resolves to something');
    assert.equal(n.lines.length, 3, lang + ': every stated field still produces its line');
  }
  /* and the nine-language text this file already shipped is untouched by the narrowing */
  const nine = new Set(['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']
    .map((l) => loadModule(l).mod.typeNote({ properties: { TYPE: 'culture' } })));
  assert.equal(nine.size, 9, 'typeNote keeps all nine — the amendment froze authoring, it deleted nothing');
});

test('④ imtb-fill is click-wired, and an unnamed shape answers with what upstream says', async () => {
  const { mod, bundle, E } = loadModule();
  const snap = deepestBlankSheet(bundle);
  await mod._go(snap.y);
  assert.ok(E.layers.has('imtb-fill'), 'the click target exists');
  assert.equal(E.bound('imtb-fill'), 1,
    '…and it has a click handler — #R94k built the target and left it unbound for thirteen rounds');

  const fc = mod.currentFC();
  const blank = fc.features.filter((f) => !String((f.properties || {}).NAME || (f.properties || {}).name || '').trim());
  assert.ok(blank.length > 0, `${snap.key}: the record itself leaves shapes unnamed`);

  const ev = E.click([blank[0]]);
  E.fire('imtb-fill', ev);
  await Promise.resolve(); await Promise.resolve();
  const open = E.live();
  assert.equal(open.length, 1, 'a click on an unnamed shape opens exactly one card');
  const said = strip(open[0].html);
  const want = mod.blankNote(blank[0]);
  assert.ok(said.includes(want.title), 'the card states that upstream gave this shape no name');
  for (const l of want.lines) assert.ok(said.includes(l), 'and carries upstream\'s own words: ' + l);
  assert.ok(E.eng.events.clickClaimed(ev), 'the tap is claimed, so no second owner opens over it');

  /* the card must not outlive the collection it describes */
  mod._clear();
  assert.equal(E.live().length, 0, 'returning to Now retracts it — see also `_pushLbl`');
});

test('⑤ a NAMED shape is untouched: the fill opens nothing, and a claimed tap is left alone', async () => {
  const { mod, bundle, E } = loadModule();
  const snap = deepestBlankSheet(bundle);
  await mod._go(snap.y);
  const fc = mod.currentFC();
  const named = fc.features.find((f) => String((f.properties || {}).NAME || '').trim());
  const blank = fc.features.find((f) => !String((f.properties || {}).NAME || '').trim());
  assert.ok(named && blank);

  /* #R122: clicking bare land inside a past country must NOT register as a country click */
  E.fire('imtb-fill', E.click([named]));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(E.live().length, 0, 'a named polygon opens nothing from the fill — the name label owns it');

  /* the era NAME layers are bound first and claim the DOM event; the fill must step aside even when
     an unnamed shape is under the same point (a label sits inside its own polygon). */
  const ev = E.click([blank]);
  E.eng.events.claimClick(ev);
  E.fire('imtb-fill', ev);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(E.live().length, 0, 'an already-claimed tap opens no second card');
});

test('⑥ the fill covers the globe, so it yields to every other owner of the tap', async () => {
  const { mod, bundle, E } = loadModule();
  const snap = deepestBlankSheet(bundle);
  await mod._go(snap.y);
  const blank = mod.currentFC().features.find((f) => !String((f.properties || {}).NAME || '').trim());

  /* another module wires a layer for clicks — exactly as js/map-ui.js, js/war-layer.js and the
     world packs do. The engine's own registry is what this must be asked from; no list of ids. */
  E.eng.layers.add({ id: 'some-other-clickable-layer', type: 'circle' });
  E.eng.events.onLayer('click', 'some-other-clickable-layer', () => {});
  E.state.query = (_pt, o) => ((o.layers || []).includes('some-other-clickable-layer') ? [{ id: 1 }] : []);
  E.fire('imtb-fill', E.click([blank]));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(E.live().length, 0, 'something else is under the point, so the era fill does not open');

  /* a layer that is switched OFF is not an owner */
  E.eng.layers.setLayout('some-other-clickable-layer', 'visibility', 'none');
  E.fire('imtb-fill', E.click([blank]));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(E.live().length, 1, 'a hidden layer cannot swallow the tap');

  /* …and the MAP-level owners (aircraft, satellites, the seismic pickers) appear in no registry at
     all: they say so by claiming, and the fill asks one microtask later (#R210). */
  E.live().forEach((p) => p.remove());
  E.state.query = () => [];
  const ev = E.click([blank]);
  E.fire('imtb-fill', ev);
  E.eng.events.claimClick(ev);        /* the map-level listener runs in the same synchronous dispatch */
  await Promise.resolve(); await Promise.resolve();
  assert.equal(E.live().length, 0, 'a claim made after the layer handler ran is still heard');
});

test('⑦ every rung of the label ladder is climbed by something — a key with no caller is dead', () => {
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
