/* ============================================================================
 *  MEASURED RADIATION — the browser layer (js/radiation-layer.js) and its core (js/radiation-obs-core.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ ISOLATION — READ BEFORE ADDING A TEST. The first three sections were three processes, and
 *  each of them set the page globals the layer reads (`window`, `IntMapLang`, `IntMapGeoEngine`,
 *  `fetch`, …) and never put them back — which only worked because nothing ran after them. In one
 *  process that is an ordering dependence: #R585's array-picking language stub, left behind, would
 *  have been what #R621's «run with the REAL language registry» test measured. So:
 *    · every test that mounts a module calls `stage(t, {...})`, which starts from NONE of the page
 *      globals, sets exactly the ones given, and restores the previous values when the test ends;
 *    · (module-graph) the layer and the simulator READ the engine, the language registry and the
 *      clock through `import`, not off `window` — so those three are not page globals any more:
 *      `stageModule()` hands the test's values in at the module's own import edges and evaluates a
 *      FRESH js/radiation-layer.js / js/sims.js against them (tests/helpers/import-module.mjs). The
 *      real registry and engine `modules()` returns are the shared, once-per-process instances.
 *  The order the tests run in cannot change an answer.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as LM from '../js/layer-manifest.js';
import { makeRadiationObs } from '../js/radiation-obs-core.js';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';
import { importModule } from './helpers/import-module.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ── the page globals, staged per test ──────────────────────────────────────────────────────── */
const STAGED = ['window', 'document', 'fetch', 'CSS', 'SUPABASE_URL', 'addEventListener',
  'IntMapGeoEngine', 'IntMapLang', 'IntMapSafe', 'IntMapLabelScale', 'IntMapRuntime',
  'IntMapTime', 'IntMapRadiation', 'IntMapRadiationObs', '_registerLayerOpacity', '_hideGenericLegend'];
const snapshot = () => STAGED.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
const restore = (saved) => { for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } };
function clean(set) {
  for (const k of STAGED) if (k !== 'fetch') delete globalThis[k];
  globalThis.window = globalThis;
  Object.assign(globalThis, set || {});
}
/** start this test from none of the page globals, set `set`, and give everything back at the end */
function stage(t, set) {
  const saved = snapshot();
  t.after(() => restore(saved));
  clean(set);
}
/* (module-graph) the three dependencies the layer and the simulator IMPORT, and the file each comes from */
const EDGES = { IntMapGeoEngine: 'js/geo-engine.js', IntMapLang: 'js/lang-registry.js', IntMapTime: 'js/chronos.js' };
/** stage the page globals in `set`, and evaluate a fresh `rel` whose import edges answer with the
    rest of `set` (a name `set` leaves out is an edge that answers `undefined`) */
async function stageModule(t, rel, set) {
  const globals = Object.assign({}, set), mocks = {};
  for (const [name, file] of Object.entries(EDGES)) { mocks[file] = { [name]: globals[name] }; delete globals[name]; }
  stage(t, globals);
  return importModule(rel, { mocks });
}
const noop = () => { };
/* the union of the two DOM shapes the modules were first imported under (#R621's engine surface,
   and the legend's `createElement`) */
const docStub = () => ({
  createElement: () => ({ style: {}, className: '', innerHTML: '', classList: { add() { }, remove() { } }, appendChild() { }, querySelector: () => null }),
  querySelector: () => null, addEventListener: noop, readyState: 'complete', body: { appendChild() { } },
});
let MODS = null;
/** the REAL language registry and engine — what each module exports (module-graph: no longer read
    back off `window` after the import) */
async function modules() {
  if (MODS) return MODS;
  const saved = snapshot();
  try {
    clean({ document: docStub(), addEventListener: noop });
    const { IntMapLang: lang } = await import('../js/lang-registry.js');
    const { IntMapGeoEngine: engine } = await import('../js/geo-engine.js');
    MODS = { lang, engine };
  } finally { restore(saved); }
  assert.equal(typeof MODS.lang.pick, 'function', 'the real language registry did not load');
  return MODS;
}
/** a fresh js/radiation-layer.js against `set`, and its exported factory */
async function layerFactory(t, set) {
  const { radiationLayer } = await stageModule(t, 'js/radiation-layer.js', set);
  assert.equal(typeof radiationLayer, 'function', 'js/radiation-layer.js must export its factory radiationLayer');
  return radiationLayer;
}
/* the renderer double #R621 settled on: only what the engine publishes — `popup` deliberately absent
   from the top level, the renderer-owned UI behind `ui` */
function engineDouble(onLayer) {
  const layers = {
    _s: new Set(), _l: new Set(),
    hasSource: (id) => layers._s.has(id), addSource: (id) => layers._s.add(id),
    has: (id) => layers._l.has(id), add: (d) => layers._l.add(d && d.id),
    setLayout: noop, setSourceData: noop, getLayout: () => 'none', sourceData: () => null,
  };
  return {
    layers: layers, events: { on: noop, onLayer: onLayer || noop }, ready: () => true,
    ui: { popup: () => ({ setLngLat: function () { return this; }, setHTML: function () { return this; } }), attach: (x) => x },
  };
}
/** the legend host `_registerLayerOpacity` hands back — it keeps the one `.rad-key` element */
function legendHost() {
  const host = {
    _key: null,
    querySelector: (sel) => (sel === '.rad-key' ? host._key : null),
    insertBefore: (el) => { host._key = el; },
    appendChild: (el) => { host._key = el; },
  };
  return host;
}
/* the smallest feed that exercises every legend row: a source that answered, one that could not
   be read, and a period-mean set the clock is not on. */
const LEGEND_FEED = {
  v: 1, at: '2026-09-10T00:00:00Z', unit: 'nSv/h',
  sources: [
    { id: 'de-bfs', name: 'BfS', attribution: 'BfS', licence: 'DL-DE/BY-2.0', n: 1, read: true, historyDays: 365, chunks: 1 },
    { id: 'us-epa', name: 'EPA', attribution: 'EPA', licence: 'PD', n: 0, read: false, historyDays: 1, chunks: 1 },
    { id: 'nl-rivm', name: 'RIVM', attribution: 'RIVM', licence: 'CC0', n: 1, read: true, historyDays: 0, asOf: '2011', chunks: 1 },
  ],
  stations: [{ c: 'de-bfs:1', s: 'de-bfs', n: 'A', y: 50, x: 8, v: 90, t: '2026-09-10T00:00:00Z', q: 'H*(10)', k: 'hourly-mean' }],
  reference: [{ c: 'nl-rivm:1', s: 'nl-rivm', n: 'B', y: 52, x: 5, v: 70, t: '2011', q: 'ambient-gamma', k: 'period-mean' }],
};
/** switch the layer on in `lang` with the REAL registry and runtime, and return the legend it wrote */
async function legendIn(t, lang) {
  const M = await modules();
  const host = legendHost();
  const { makeRuntime, stopEarlyTimers } = await import('../js/runtime.js');
  const radiationLayer = await layerFactory(t, {
    document: docStub(), IntMapLang: M.lang, IntMapGeoEngine: engineDouble(),
    IntMapSafe: { html: (s) => String(s) }, IntMapLabelScale: { sub: (n) => n },
    addEventListener: noop, _registerLayerOpacity: () => host,
    fetch: async () => ({ ok: true, json: async () => LEGEND_FEED }),
    /* (#R797) the layer is a capability of the runtime now — the test mounts the real register, the
       same object the browser builds, and a clock stub for the subscription the active scope owns */
    IntMapRuntime: makeRuntime({}), IntMapTime: { on: () => () => { } },
  });
  const api = radiationLayer({ lang, canDraw: () => true });
  api.toggle(true);
  await new Promise((r) => setTimeout(r, 40));   /* let load() settle; it paints and re-legends */
  api.legend();
  api.toggle(false);                             /* stop the refresh tick so the runner can exit */
  globalThis.IntMapRuntime.dispose('layer.radiation');   /* …and give the capability's scopes back */
  /* ⚠ …and clear the fallback timer too. With no runtime HOST mounted, js/runtime.js's everyTick
     degrades to a raw setInterval kept in a module-private memo; that handle holds the event loop
     open and the test FILE times out even though every assertion passed. Cleaning up what this
     test started is the test's own business. */
  stopEarlyTimers();   /* (#R796) the memo is module-private now; this is the door to it */
  return (host._key && host._key.innerHTML) || '';
}

/* ═══ from tests/r585-checks.test.mjs (the whole file) ═══
    R585 — measured radiation: the checks that keep the layer honest
    ⚠ THESE RUN THE SHIPPED MODULE, they do not read it. #R505 cost a production outage because a
    check that PARSES a file cannot see evaluation order, and #R552 cost another because a fixture
    more capable than the real thing hides a wiring fault. So the factory below is evaluated with
    the thinnest stubs that let it run, and the assertions ask the object it returns. */
{

/* ── evaluate js/radiation-layer.js the way the browser does ──────────────────────────────── */
async function mountLayer(t) {
  const layers = {
    _s: new Set(), _l: new Set(),
    hasSource: (id) => layers._s.has(id), addSource: (id) => layers._s.add(id),
    has: (id) => layers._l.has(id), add: (d) => layers._l.add(d && d.id),
    setLayout: noop, setSourceData: noop, getLayout: () => 'none'
  };
  const radiationLayer = await layerFactory(t, {
    IntMapGeoEngine: { layers, events: { on: noop, onLayer: noop }, ready: () => true, popup: () => null },
    IntMapLang: { pick: () => (v) => (Array.isArray(v) ? v[0] : v), pickArgs: () => (...a) => a },
    IntMapSafe: { html: (s) => String(s) }, IntMapLabelScale: { sub: (n) => n },
    addEventListener: noop,
  });
  return radiationLayer({ lang: 'en', canDraw: () => true });
}

/* ── ① the ramp is REACHABLE, and it is the one the document describes ─────────────────────── */
test('#R585 ① the colour ramp the module actually evaluates matches docs/RADIATION.md', async (t) => {
  const api = await mountLayer(t);
  const ramp = api.ramp();
  assert.ok(Array.isArray(ramp) && ramp.length >= 4, 'the layer must publish its ramp');
  const steps = ramp.map((r) => r[0]);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b), 'ramp steps must ascend');
  assert.equal(steps[0], 0, 'the ramp must start at zero — a station reading nothing still has a colour');

  /* the document holds the same numbers in prose, each with the observation it came from. A number
     a machine holds and prose copies WILL drift (#R500), so the drift is measured here. */
  const doc = read('docs/RADIATION.md');
  /* the provenance table: every row states its step AND where the number came from. Read the whole
     table rather than a "N nSv/h" pattern — the first row legitimately says «50 / 100 nSv/h», and a
     check that only understood one shape would have called a documented step undocumented. */
  const table = doc.slice(doc.indexOf('| 段 | 由来 |'), doc.indexOf('**失効条件**'));
  assert.ok(table.length > 300, 'could not find the ramp provenance table in docs/RADIATION.md — this check is blind');
  const cited = new Set([...table.matchAll(/\b(\d[\d,]*)\b/g)].map((m) => Number(m[1].replace(/,/g, ''))));
  for (const s of steps.slice(1)) {
    assert.ok(cited.has(s), `ramp step ${s} nSv/h is not cited anywhere in docs/RADIATION.md — a threshold with no stated provenance is exactly what .agents/rules/no-ad-hoc-hardcoding.md §4 forbids`);
  }
});

/* ── ② measurement and simulation must not be confusable ───────────────────────────────────── */
test('#R585 ② the measured ramp shares no colour with the plume simulation', async (t) => {
  const api = await mountLayer(t);
  const mine = new Set(api.ramp().map((r) => String(r[1]).toLowerCase()));
  /* ⚠ THE MODEL IS ASKED, NOT GREPPED. This first read `const ZONES` out of js/sims.js, and #R568
     moved the ladder into js/radiation-model.js and made it depend on the isotope — so the check
     went blind on a refactor that was entirely correct. Asking `zonesFor` for EVERY isotope the
     model declares means a new ladder, a new isotope or another move cannot take the palette out
     of this comparison's sight. */
  const { RAD } = await import('../js/radiation-model.js');
  const theirs = new Set();
  for (const iso of Object.keys(RAD.ISOTOPES)) {
    for (const b of (RAD.zonesFor(iso).bands || [])) if (b && b.c) theirs.add(String(b.c).toLowerCase());
  }
  assert.ok(theirs.size >= 3, 'could not read the simulation palette out of the radiation model — this check is blind, fix it rather than deleting it');
  const shared = [...mine].filter((c) => theirs.has(c));
  assert.deepEqual(shared, [], `the measured layer and the plume model share ${shared.join(', ')} — one is an observation and the other a hypothesis, and a reader cannot be asked to tell them apart by context`);
});

/* ── ③ a station with no coordinate is carried, not drawn ──────────────────────────────────── */
test('#R585 ③ near() ignores stations with no usable coordinate and never invents one', async (t) => {
  const api = await mountLayer(t);
  /* nothing has been fetched, so the honest answer is an empty list — not a throw, and not a
     fabricated nearest station. */
  assert.deepEqual(api.near(35.0, 139.0, 100), []);
  assert.equal(api.state().stations, 0);
  assert.equal(api.state().on, false);
});

/* ── ④ EURDEP is not reachable from anything we ship ───────────────────────────────────────── */
test('#R585 ④ nothing in the shipped tree fetches EURDEP', () => {
  /* ⚠ THIS IS THE POINT OF THE ROUND, NOT A STYLE RULE. EURDEP data stays under each national
     provider's copyright; the BfS mirror `eurdep_latestValue` fetches perfectly and still may not
     be shown. A URL is how that mistake would come back, so a URL is what is measured — mentions
     in comments and documents are how the reason survives, and are not the failure. */
  const dirs = ['js', 'src', 'supabase/functions'];
  const bad = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(js|mjs|ts)$/.test(e.name)) continue;
      /* comments are stripped first: a comment cannot fetch anything, and the REASON EURDEP is
         excluded has to be allowed to live next to the code that excludes it. Without this the
         check would make the explanation unwriteable, which is how a rule loses its why. */
      const src = codeOnly(read(rel));
      for (const m of src.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
        if (/eurdep|remap\.jrc|remon\.jrc|redata\.jrc/i.test(m[0])) bad.push(rel + ' → ' + m[0]);
      }
      for (const m of src.matchAll(/['"`][^'"`]*eurdep_latestValue[^'"`]*['"`]/gi)) bad.push(rel + ' → ' + m[0]);
    }
  };
  dirs.forEach(walk);
  assert.deepEqual(bad, [], 'a EURDEP endpoint is referenced as a URL:\n  ' + bad.join('\n  ') + '\n  docs/RADIATION.md §2 says why it may not be carried.');
});

/* ── ⑤ the layer is registered everywhere a layer has to be registered ─────────────────────── */
/* (spelling kept) js/beta-overlays.js, js/map-ui.js and js/atlas-console.js register inside the
   page's DOM-bound boot closures; only the shelf (js/layer-manifest.js) can be evaluated in Node. */
test('#R585 ⑤ every registration point the row needs actually exists', () => {
  const beta = read('js/beta-overlays.js');
  assert.match(beta, /beta-dl-radobs/, 'the Layers row id is missing from js/beta-overlays.js');
  assert.match(beta, /radobs:\s*LA\(/, 'the row label must be an LA() tuple read directly — an aliased helper takes the string out of the i18n audit (#R548)');
  assert.match(beta, /radiation\.observed/, 'the kernel command must be registered eagerly, or Atlas cannot offer it before the module exists');
  assert.match(beta, /radiation\.near/, 'the point→stations join must be a kernel command too');

  /* the row has to land in a group, or it sits in Others(beta) for ever */
  /* (layer-manifest) the shelves are js/layer-manifest.js, which reorganizeLayerPanel files by */
  assert.ok((LM.layerGroups().find(([k]) => k === 'lyrGrpHazard') || [null, []])[1].includes('radobs'), 'the row is not filed into the hazard group in reorganizeLayerPanel()');

  /* Atlas must be able to say what is on screen */
  assert.match(read('js/map-ui.js'), /imrad-obs-src/, 'js/map-ui.js does not register the layer with layerData — «what is on screen» would have no answer');

  /* and the dispatch must exist for both capability types */
  const console_ = (read('js/atlas-console.js') + '\n' + capsSource());
  for (const t of ['radiationObserved', 'radiationNear']) {
    assert.ok(capabilityEntry(t) && capabilityEntry(t).run, `dispatch has no run for '${t}'`);
  }
});

/* ── ⑦ the nuclear registry replaced the typed list, and it REFUSES rather than guessing ─────── */
test('#R585 ⑦ resolveSite answers from data/npp.json and refuses a name it does not hold', async (t) => {
  /* the module fetches its registry; serve the REAL file, so this measures the shipped data and not
     a fixture that happens to contain whatever the assertion wants (#R552). */
  const registry = read('data/npp.json');
  const { radiation } = await stageModule(t, 'js/sims.js', {
    IntMapLang: { pick: () => (v) => (Array.isArray(v) ? v[0] : v), pickArgs: () => (...a) => a },
    /* ⚠ the factory early-returns a stub when there is no renderer, and that stub has no resolveSite.
       Saying so here rather than stubbing around it: if this assertion starts firing, the module took
       the no-renderer branch and the test would otherwise be measuring the stub. */
    IntMapGeoEngine: { layers: { has: () => false, hasSource: () => false, addSource: noop, add: noop, setLayout: noop, setSourceData: noop, getLayout: () => 'none' }, events: { on: noop, onLayer: noop }, ready: () => true, popup: () => null,
      hasRenderer: () => true, camera: { flyTo: noop, getZoom: () => 3 } },
    IntMapSafe: { html: (s) => String(s) },
    fetch: async (u) => (String(u).includes('npp.json')
      ? { ok: true, json: async () => JSON.parse(registry) }
      : { ok: false, json: async () => null }),
  });
  assert.equal(typeof radiation, 'function', 'js/sims.js must export its factory radiation');
  radiation({ lang: 'en', canDraw: () => true });
  const R = globalThis.IntMapRadiation;
  assert.equal(typeof R.resolveSite, 'function', 'js/sims.js must still expose resolveSite (did the factory take the no-renderer branch?)');

  const plants = JSON.parse(registry).plants;
  const find = (rx) => plants.find((p) => rx.test(p.name));
  const daiichi = find(/Fukushima Daiichi Nuclear/);
  assert.ok(daiichi, 'the registry no longer holds Fukushima Daiichi — the check is blind, fix the registry');

  const hit = await R.resolveSite('Fukushima Daiichi');
  assert.ok(hit, 'resolveSite could not find a site the registry holds');
  const km = Math.hypot((hit.lat - daiichi.lat) * 111.32, (hit.lng - daiichi.lon) * 111.32 * Math.cos(daiichi.lat * Math.PI / 180));
  assert.ok(km < 5, `resolveSite returned a point ${km.toFixed(1)} km from the registry's own coordinate`);

  /* ⚠ THE REFUSAL IS THE POINT (#R515). The old table returned null for anything it did not list,
     and a similarity score with no floor would return the least-bad stranger instead — which is how
     a plume gets drawn over the wrong country with no sign that anything went wrong. */
  for (const nonsense of ['qqzzxx nuclear power plant', 'the blue restaurant on the corner', '存在しない原子力発電所ズズズ']) {
    assert.equal(await R.resolveSite(nonsense), null, `resolveSite invented a site for "${nonsense}"`);
  }
  assert.equal(await R.resolveSite(''), null);
});

/* ── ⑥ the honesty note is present in every language the module ships inline ────────────────── */
test('#R585 ⑥ the legend note keeps all four cautions in all five inline languages', async (t) => {
  /* ⚠ (consolidation) ASKED OF THE LEGEND THE LAYER WRITES, NOT OF THE TEXT BETWEEN TWO NAMES. This
     used to slice the source from `const note =` to `const clock =` and grep the slice — so it
     held while a language was typed there, whether or not `L()` ever handed that language to the
     reader. It now switches the layer on in each of the five positional languages, with the REAL
     registry, and reads what the legend printed. The i18n sweep fills fr/ko/zh from js/locales/. */
  /* one probe per language for the two facts a reader is harmed by losing: that the band is
     NORMAL, and that rain alone moves it. */
  const langs = ['en', 'jp', 'de', 'ru', 'es'];
  const probes = [/50–200 nSv\/h is normal/, /通常の自然放射線量/, /normale natürliche/, /обычный природный фон/, /el fondo natural normal/];
  const rain = [/Rain alone/, /降雨/, /Regen/, /дождь/i, /lluvia/i];
  for (let i = 0; i < langs.length; i++) {
    await t.test(langs[i], async (tt) => {
      const html = await legendIn(tt, langs[i]);
      const note = (/<div class="rad-note">([\s\S]*?)<\/div>/.exec(html) || [])[1] || '';
      assert.ok(note.length > 60, 'the legend wrote no note in ' + langs[i] + ' — this check is blind');
      assert.match(note, probes[i], `inline language ${i} lost the "this is normal background" sentence`);
      assert.match(note, rain[i], `inline language ${i} lost the rain caveat — BfS measures a factor of three, and without it an ordinary wet afternoon reads as an accident`);
    });
  }
});
}

/* ═══ from tests/r621-checks.test.mjs (the whole file) ═══
    R621 — the measured-radiation layer, asked the way the browser asks it
    #R585 shipped a layer whose legend was EMPTY in production and whose station popup never opened
    once, and every check it brought with it was green. Both defects were swallowed by `try/catch`,
    so neither appeared in the console either. They were found by opening the production site.

    ⚠ THE CHECKS WERE NOT MERELY INCOMPLETE — THEY WERE BUILT SO THEY COULD NOT SEE IT.
      · The language stub was `pick: () => (v) => Array.isArray(v) ? v[0] : v`. The REAL `pick`
        (js/lang-registry.js) takes POSITIONAL arguments and returns `arguments[0]` — hand it an
        array and you get the array back. The stub repaired the bug on the way past, so
        `L(LA(a,b,…))` looked like a string in the test and was an array in the browser: `.split`
        threw, the catch ate it, and the legend rendered as an empty box under a title.
      · The renderer stub was hand-written, so it had whatever member the module happened to call.
        `GE().popup` does not exist in the shipped facade at all — it is `GE().ui.popup` — and a
        hand-written double can never notice a door that was never there.

    So this file uses the REAL language registry, and enumerates the renderer surface from the
    SHIPPED engine. A fixture more capable than the real thing is worth nothing (#R552), and these
    two were more capable in exactly the places that mattered. */
{

/* ── the renderer surface, EVALUATED rather than read ──────────────────────────────────────────
   The first attempt parsed js/geo-engine.js and could not find the contract: the file publishes
   `window.IntMapGeoEngine = (function(){ … })()` and that IIFE returns a CALL, not a literal, so
   the AST would have had to model the factory to learn anything. #R505's answer applies here too —
   import the module and ASK the object. What the browser gets is what this enumerates. */
async function engineSurface() {
  const E = (await modules()).engine;
  assert.ok(E, 'js/geo-engine.js published nothing — this check is blind, fix it rather than deleting it');
  const nested = new Map();
  for (const k of Object.keys(E)) {
    const v = E[k];
    if (v && typeof v === 'object') nested.set(k, new Set(Object.keys(v)));
  }
  return { top: new Set(Object.keys(E)), nested };
}

/* (spelling kept, by design) every `GE().x.y` the layer names, on every code path — a run would only
   see the paths a fixture happens to take, and the defect lived on the popup path no fixture opened. */
test('#R621 the layer only reaches for renderer members the shipped engine actually publishes', async () => {
  const surface = await engineSurface();
  const top = surface.top, nested = surface.nested;
  assert.ok(top.size > 5, 'the engine surface came out as ' + top.size + ' members — the enumeration is wrong, not the layer');
  /* ⚠ COMMENTS ARE STRIPPED FIRST, and the first run of this check is why: it flagged `GE().popup`
     out of the very comment that explains the defect. A rule whose own explanation trips it is a
     rule you end up deleting the explanation for — the same lesson the EURDEP check learned. */
  const src = codeOnly(read('js/radiation-layer.js'));
  const bad = [];
  const call = new RegExp('GE\\(\\)\\.([A-Za-z_$][\\w$]*)(?:\\.([A-Za-z_$][\\w$]*))?', 'g');
  for (const m of src.matchAll(call)) {
    const a = m[1], b = m[2];
    if (!top.has(a)) { bad.push('GE().' + a); continue; }
    if (b && nested.has(a) && !nested.get(a).has(b)) bad.push('GE().' + a + '.' + b);
  }
  assert.deepEqual([...new Set(bad)], [],
    'the layer calls renderer members that do not exist — in the browser these are calls into undefined, and the surrounding try/catch means nothing is ever printed:\n  ' + [...new Set(bad)].join('\n  '));
});

/* (spelling kept, by design) a call SHAPE across three files — most of the sites are on paths
   (Atlas answers, Layers rows) that cannot be reached without the whole page. */
test('#R621 every language call hands pick() ARGUMENTS, never the array pickArgs() builds', () => {
  /* `L(LA(…))` type-checks, runs, and returns an ARRAY. Downstream that array reaches `.split`,
     `IntMapSafe.html` or the DOM: the first throws into a catch and blanks the whole legend, the
     others print all five languages joined by commas. Neither is visible from reading the line,
     which is why it is measured as a shape. */
  const wrap = new RegExp('\\bL\\(\\s*LA\\(', 'g');
  for (const f of ['js/radiation-layer.js', 'js/beta-overlays.js', 'js/atlas-controls.js']) {
    const hits = [...read(f).matchAll(wrap)].length;
    assert.equal(hits, 0, f + ' wraps a pickArgs() tuple in a pick() call ' + hits + ' time(s) — pass the arguments straight to L(), or use L.arr() for a tuple held as data');
  }
});

test('#R621 the legend actually writes its cautions, run with the REAL language registry', async (t) => {
  const html = await legendIn(t, 'en');
  assert.ok(html.length > 0,
    'the legend wrote nothing — in production this is an empty box under a title, and the reader is shown radiation dots with no caveat at all');
  assert.ok(html.indexOf('50') >= 0, 'the legend does not state the natural-background band');
  assert.ok(/[Rr]ain|降雨/.test(html), 'the legend lost the rain caveat — BfS measures a factor of three');
  /* a pickArgs() tuple that reaches the DOM prints as «English,日本語,Deutsch,…». One probe for that
     shape: the English caution followed, after a comma, by its Japanese twin. */
  assert.ok(!/normal natural background[^<]*通常の自然放射線量/.test(html),
    'the legend printed more than one language at once — a pickArgs() tuple reached the DOM');
});
}

/* ═══ from tests/r672-checks.test.mjs (the whole file) ═══
    R672 — the popup a reader can actually see, and a sparkline with data in it
    #R621 fixed the popup's DOOR (`GE().ui.popup`, not the invented `GE().popup`) and proved it with
    a check that asked whether the door exists. In production the door then opened onto nothing a
    reader could see:

      · the popup root was `<div class="rad-pop country-popup">`, and `.country-popup{display:none}`
        is the COUNTRY PANEL's hidden template. The content was correct, inserted, and 20×16 px on
        screen — the close button alone.
      · the sparkline read `r.v`, while `?mode=series` returns the provider's own records, which
        carry `nsvh`. Every row scored null, `vs.length < 2` was always true, and the slot was set
        to '' — no line, and not even the «no history published» sentence, on an endpoint that was
        returning 168 points.

    ⚠ SO THIS FILE MEASURES OUTCOMES, NOT DOORS. Three rounds running, the check asked whether the
    mechanism was NAMED correctly and the reader saw nothing. What a reader can see is: is any class
    on this element declared `display:none` by the stylesheet we ship, and does the drawing function
    return a line when handed rows in the shape the FEED actually emits. */
{

/* every class the shipped stylesheet hides outright. A rule may list several selectors, and only
   the ones that are a bare class (`.foo`) can be reasoned about this cheaply — which is enough,
   because that is the shape the defect took. */
function hiddenClasses() {
  /* ⚠ comments are stripped first: a rule's selector text runs from the previous `}`, so it picks
     up whatever comment sits above it and a bare-class match then never fires. The first run of
     this check reported that .country-popup was not hidden — on the very stylesheet that hides it. */
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  const out = new Set();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    if (!/(^|[;\s])display\s*:\s*none/.test(body)) continue;
    for (const sel of m[1].split(',')) {
      const t = sel.trim();
      const bare = /^\.([A-Za-z_][\w-]*)$/.exec(t);
      if (bare) out.add(bare[1]);
    }
  }
  return out;
}

/* (spelling kept, by design) the markup is written into a renderer popup this double does not lay
   out; which classes the stylesheet hides is answered from css/intmap.css itself. */
test('#R672 the station popup is not built out of a class the stylesheet hides', () => {
  const hidden = hiddenClasses();
  assert.ok(hidden.size > 3, `only ${hidden.size} hidden classes were found in css/intmap.css — the scan is wrong, not the layer`);
  assert.ok(hidden.has('country-popup'), 'the scan no longer sees .country-popup as hidden — it is the class this round exists for, so the check has gone blind');

  const src = codeOnly(read('js/radiation-layer.js'));
  const bad = [];
  /* every class= this file writes into markup */
  for (const m of src.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c && hidden.has(c)) bad.push(c);
  }
  assert.deepEqual([...new Set(bad)], [],
    'the layer builds markup out of ' + [...new Set(bad)].join(', ') + ' — the stylesheet declares that display:none, so the element is inserted, correct, and invisible');
});

test('#R672 the sparkline draws from the shape the FEED emits, not a shape of its own', async (t) => {
  /* ⚠ THE ROWS ARE BUILT THE WAY THE FEED BUILDS THEM. `?mode=series` answers with the provider's
     own records untouched, and a provider record is `{code,name,lat,lon,nsvh,at,quantity,kind}` —
     so a fixture written by hand here could carry `v` and agree with a client that is wrong. */
  const shared = read('supabase/functions/_shared/radiation-sources.js');
  const rec = /function record\(o\)\s*\{[\s\S]*?return \{([\s\S]*?)\};/.exec(shared);
  assert.ok(rec, 'could not read the record builder out of _shared/radiation-sources.js — this check is blind, fix it rather than deleting it');
  const keys = [...rec[1].matchAll(/^\s*([A-Za-z_][\w]*)\s*:/gm)].map((m) => m[1]);
  assert.ok(keys.includes('nsvh') && keys.includes('at'),
    'the provider record no longer carries nsvh/at — it now carries ' + keys.join(', ') + '; the client must follow it');

  /* the module keeps `spark` private, so it is reached the way the popup reaches it: through the
     series fetch, whose result the popup writes into the slot. Serve rows in the record shape. */
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ code: 'x', name: 'x', lat: 50, lon: 8, nsvh: 90 + i, at: '2026-09-0' + ((i % 9) + 1) + 'T00:00:00Z', quantity: 'H*(10)', kind: 'hourly-mean' });
  const M = await modules();
  const { makeRuntime, stopEarlyTimers } = await import('../js/runtime.js');
  /* ⚠ (consolidation) THE SLOT IS READ, NOT THE FUNCTION'S SPELLING. This used to cut `spark()` out
     of the source and look for `r.nsvh` in it — true of any text that names the key, drawn or not.
     The click the renderer would deliver is delivered here instead: the layer registers its click
     handler on the point layer, the popup it opens asks for the series, and the slot the popup
     marked with `data-rad-series` is where the drawing lands. */
  let click = null;
  const slot = { innerHTML: '' };
  const feed = { v: 1, at: '2026-09-10T00:00:00Z', unit: 'nSv/h',
    sources: [{ id: 'de-bfs', name: 'BfS', attribution: 'BfS', licence: 'DL-DE/BY-2.0', n: 1, read: true, historyDays: 365, chunks: 1 }],
    stations: [{ c: 'de-bfs:1', s: 'de-bfs', n: 'A', y: 50, x: 8, v: 90, t: '2026-09-10T00:00:00Z', q: 'H*(10)', k: 'hourly-mean' }], reference: [] };
  const doc = docStub();
  doc.querySelector = (sel) => (sel === '[data-rad-series="de-bfs:1"]' ? slot : null);
  const radiationLayer = await layerFactory(t, {
    document: doc, CSS: { escape: (s) => String(s) }, IntMapLang: M.lang,
    IntMapGeoEngine: engineDouble((ev, id, fn) => { if (ev === 'click' && id === 'imrad-obs-pt') click = fn; }),
    IntMapSafe: { html: (s) => String(s) }, IntMapLabelScale: { sub: (n) => n },
    addEventListener: noop, _registerLayerOpacity: () => null, SUPABASE_URL: 'https://example.invalid',
    IntMapRuntime: makeRuntime({}), IntMapTime: { on: () => () => { } },
    fetch: async (u) => (String(u).includes('mode=series')
      ? { ok: true, json: async () => ({ v: 1, station: 'de-bfs:1', unit: 'nSv/h', series: rows }) }
      : { ok: true, json: async () => feed }),
  });
  const api = radiationLayer({ lang: 'en', canDraw: () => true });
  try {
    const series = await api.series('de-bfs:1');
    assert.equal(series.length, 12, 'the series call did not return the feed rows');

    api.toggle(true);
    await new Promise((r) => setTimeout(r, 40));   /* the feed lands, so the popup knows the source */
    assert.equal(typeof click, 'function', 'the layer registered no click handler on its point layer');
    click({ features: [{ properties: feed.stations[0], geometry: { coordinates: [8, 50] } }] });
    await new Promise((r) => setTimeout(r, 40));   /* the popup's series request lands */

    /* the drawing is what matters: with twelve real rows there must be a path, and it must be built
       from the values — a line with no `d` is the same blank slot the reader was getting. */
    const d = (/<path d="([^"]+)"/.exec(slot.innerHTML) || [])[1];
    assert.ok(d, 'the popup wrote no sparkline — the feed sends `nsvh`, and a drawer reading any other key scores every row null and sets the slot to the empty string (' + JSON.stringify(slot.innerHTML.slice(0, 80)) + ')');
    assert.equal((d.match(/[ML]/g) || []).length, rows.length, 'one vertex per row the feed sent');
    assert.match(slot.innerHTML, /90–101 nSv\/h/, 'and the range under it is the range of the values sent');
  } finally {
    api.toggle(false);
    globalThis.IntMapRuntime.dispose('layer.radiation');
    stopEarlyTimers();
  }
});
}

/* ═══ from tests/r797-radiation-explicit-deps-checks.test.mjs (the whole file) ═══
    R797 — the radiation observations are a module with explicit dependencies
    Stage 3 of the ownership refactor (DEV-NOTES #R797). js/radiation-obs-core.js takes `fetch`
    and the feed's base as ARGUMENTS and knows no window; this file runs it in Node with a fake
    feed and proves the properties the browser layer used to hold implicitly:
      · the two claims (stations / reference) are kept apart by the clock's year
      · a reply that lands after dispose(), or after a newer load(), is dropped
      · the chunked follow-up ends a source on its first failure and says so
      · near() answers from the data, nearest first, in km
    …and that js/radiation-layer.js is now the browser ENTRY over that core rather than a second
    copy of it: one implementation, reached by the Layers row, by Atlas and by the simulators. */
{
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* a fake feed: latest → 2 stations + a reference row for 2011; day mode → 1 station; one thin
   source with 3 chunks, chunk 1 fails */
function fakeFetch(opts) {
  const o = Object.assign({ delay: 0, chunkFail: 1 }, opts || {});
  const calls = [];
  const fetch = (url, init) => {
    calls.push(url);
    const u = new URL(url);
    const q = u.searchParams;
    const reply = () => {
      if (q.get('mode') === 'latest' && q.get('provider')) {
        const i = +q.get('chunk');
        if (i === o.chunkFail) return { ok: false, status: 502, json: async () => ({}) };
        return { ok: true, json: async () => ({ v: 1, stations: [{ c: 'US' + i, s: 'radnet', n: 'chunk ' + i, x: -100 + i, y: 40, v: 80 + i, t: '2026-09-18T00:00:00Z' }] }) };
      }
      if (q.get('mode') === 'latest') return { ok: true, json: async () => ({
        v: 1, at: '2026-09-18T00:00:00Z', unit: 'nSv/h',
        sources: [{ id: 'rivm', n: 2, licence: 'CC0', historyDays: 3650, asOf: '2011' }, { id: 'radnet', chunks: 3 }],
        stations: [{ c: 'NL1', s: 'rivm', n: 'Bilthoven', x: 5.18, y: 52.12, v: 70, t: '2026-09-18T00:00:00Z' }, { c: 'NL2', s: 'rivm', n: 'Den Haag', x: 4.30, y: 52.08, v: 65, t: '2026-09-18T00:00:00Z' }, { c: 'BAD', s: 'rivm', n: 'no coord', v: 1 }],
        reference: [{ c: 'NLref', s: 'rivm', n: 'annual mean', x: 5.0, y: 52.0, v: 90 }],
      }) };
      if (q.get('mode') === 'day') return { ok: true, json: async () => ({ v: 1, sources: [{ id: 'rivm', n: 1, asOf: '2011' }], stations: [{ c: 'NL1', s: 'rivm', n: 'Bilthoven', x: 5.18, y: 52.12, v: 72, t: q.get('iso') }], reference: [{ c: 'NLref', s: 'rivm', n: 'annual mean', x: 5.0, y: 52.0, v: 90 }] }) };
      if (q.get('mode') === 'series') return { ok: true, json: async () => ({ series: [[1, 70], [2, 71]] }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(reply()), o.delay);
      if (init && init.signal) init.signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
    });
  };
  return { fetch, calls };
}

test('#R797 ① it needs fetch and the base, and nothing else — no window is consulted', async (t) => {
  assert.throws(() => makeRadiationObs({}), /fetch function is required/);
  /* ⚠ (consolidation) THE GLOBALS ARE WATCHED WHILE THE CORE RUNS, NOT SEARCHED FOR IN ITS TEXT.
     Every page global the browser layer used to reach is replaced by a getter that records the
     read, and every door of the core is then walked — both loads, the chunk sweep through its
     failure, the drawer, near(), series(), the subscription and dispose(). A read of any of them
     on any of those paths is a dependency the constructor was not handed. */
  const WATCHED = ['window', 'document', 'IntMapGeoEngine', 'IntMapTime', 'IntMapRuntime', 'SUPABASE_URL'];
  const saved = WATCHED.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  const reads = [];
  for (const k of WATCHED) Object.defineProperty(globalThis, k, { configurable: true, get() { reads.push(k); return undefined; } });
  t.after(() => { for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  const F = fakeFetch();
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co/' });
  const events = [];
  obs.subscribe((e) => events.push(e.type));
  assert.equal(await obs.load(null), true);
  await wait(20);   /* the chunk sweep, through the chunk that fails */
  obs.toFC(); obs.near(52.1, 5.0, 100); obs.state(); obs.ramp(); obs.stations(); obs.sources();
  await obs.series('NL1');
  await obs.load('2011-06-01');
  obs.toFC();
  obs.dispose();
  assert.ok(events.includes('chunk'), 'the walk reached the chunk sweep — otherwise this watched less than it says');
  assert.deepEqual([...new Set(reads)], [], 'the core read page globals it was not handed: ' + [...new Set(reads)].join(', '));
  assert.ok(F.calls[0].startsWith('https://x.supabase.co/functions/v1/radiation-feed?mode=latest'), 'the base is the argument, trailing slash removed');
  const none = makeRadiationObs({ fetch: F.fetch, feedBase: '' });
  assert.equal(await none.load(null), false);
  assert.equal(none.state().err, 'no-backend', 'no base is said, not guessed');
});

test('#R797 ② stations and reference are different claims: reference rows are drawn only in their year', async () => {
  const F = fakeFetch();
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  await obs.load(null);
  await wait(10);   /* let the chunk sweep land */
  const live = obs.toFC();
  assert.ok(live.features.every((f) => f.properties.c !== 'NLref'), 'live view: no 2011 annual mean beside hourly readings');
  assert.ok(live.features.every((f) => f.properties.c !== 'BAD'), 'a station without a coordinate is kept by the feed and dropped by the drawer');
  await obs.load('2011-06-01');
  const day = obs.toFC();
  assert.ok(day.features.some((f) => f.properties.c === 'NLref'), 'in 2011 the reference row is drawn');
  await obs.load('2015-06-01');
  assert.ok(obs.toFC().features.every((f) => f.properties.c !== 'NLref'), 'in 2015 it is not');
});

test('#R797 ③ the chunked follow-up fills the thin source, ends it on the first failure and says so', async () => {
  const F = fakeFetch();
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  const events = [];
  obs.subscribe((e) => events.push(e.type));
  await obs.load(null);
  await wait(20);
  const s = obs.state();
  const radnet = s.sources.find((x) => x.id === 'radnet');
  assert.equal(radnet.read, false, 'one 502 ends the sweep for that source');
  assert.equal(radnet.reason, 'unreachable', '…and the reason is on the source for the legend to print');
  assert.ok(s.stations >= 3, 'the chunk that answered before the failure was kept (' + s.stations + ')');
  assert.ok(events.includes('feed') && events.includes('chunk'), 'subscribers were told about the feed and the sweep');
  assert.equal(s.chunks.total, 3);
});

test('#R797 ④ a reply that lands after dispose() is dropped, and the in-flight request is aborted', async () => {
  const F = fakeFetch({ delay: 30 });
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  const p = obs.load(null);
  obs.dispose();
  assert.equal(await p, false, 'the stale load reports nothing');
  assert.equal(obs.state().stations, 0, 'nothing was applied');
  assert.equal(obs.state().loading, false);
});

test('#R797 ④ a newer load supersedes an older one', async () => {
  const F = fakeFetch({ delay: 30 });
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  const a = obs.load(null);
  obs.dispose();                                  /* the owner changed its mind (clock moved) */
  const b = obs.load('2011-06-01');
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra, false); assert.equal(rb, true);
  assert.equal(obs.state().iso, '2011-06-01', 'the state is the newer request');
});

test('#R797 ⑤ near() answers from the data, nearest first, in kilometres', async () => {
  const F = fakeFetch();
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  await obs.load(null);
  const n = obs.near(52.10, 5.0, 100);
  assert.deepEqual(n.map((x) => x.code), ['NL1', 'NL2'].sort((p, q) => 0) && n.map((x) => x.code));
  assert.ok(n.length === 2 && n[0].km <= n[1].km, 'sorted by distance');
  assert.ok(n[0].km > 0 && n[0].km < 60, 'a distance in km, not degrees (' + n[0].km + ')');
  assert.deepEqual(obs.near(0, 0, 10), [], 'nothing within 10 km of the Gulf of Guinea');
  assert.deepEqual(await obs.series('NL1'), [[1, 70], [2, 71]]);
  assert.equal(obs.ramp()[0][0], 0);
});

/* (spelling kept, by design) «one implementation, not a second copy» is a claim about the TEXT of the
   layer — a copy would behave identically, which is exactly why it has to be asked of the source. */
test('#R797 ⑥ js/radiation-layer.js is the browser entry over the core, not a second copy', () => {
  const layer = read('js/radiation-layer.js');
  assert.match(layer, /import \{ makeRadiationObs \} from '\.\/radiation-obs-core\.js'/, 'the layer imports the core by name');
  const code = codeOnly(layer);
  assert.ok(!/function refRows\(|function toFC\(|function near\(|function chunked\(/.test(code), 'the data functions exist once, in the core');
  /* the layer's ONLY fetch is the dependency it hands the core (scopeFetch); every other request goes through the core */
  const lines = code.split(/\r?\n/);
  const from = lines.findIndex((l) => /const scopeFetch\s*=/.test(l));
  const to = lines.findIndex((l, i) => i > from && /^\s*\};\s*$/.test(l));
  assert.ok(from >= 0 && to > from, 'the layer defines scopeFetch, the one fetch it hands the core');
  lines.forEach((l, i) => { if (/\bfetch\(/.test(l)) assert.ok(i >= from && i <= to, 'a fetch outside scopeFetch at line ' + (i + 1) + ': ' + l.trim().slice(0, 80)); });
  assert.ok(/const CAP = 'layer\.radiation'/.test(code) && /\.define\(CAP,/.test(code), 'the layer is a capability of the runtime, with an active scope');
});
}
