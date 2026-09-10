/* ============================================================================
 *  IntMap · tests/helpers/wx-ecmwf-page.mjs — a COLD page around js/wx-ecmwf.js  (#R664)
 * ----------------------------------------------------------------------------
 *  #R664 found a defect no check could see from the source: `load()` took its supersession ticket
 *  IN THE CALL while it made its join LATER, in the `ready()` continuation, so a second call for
 *  the SAME read superseded the read it was about to join and both callers were answered null
 *  (production: the first switch-on of the first weather layer of a page failed, three times out
 *  of three). Every check that guarded that rule had pinned a SPELLING — `var mine = ++seq`,
 *  `if (seq === mine)` — and a spelling can only prove that an implementation is still the one it
 *  was written against (#R488, #R505). So six files (r276, r287, r288, r299, r310, r627) stopped
 *  reading the source and started EVALUATING the shipped module against a page.
 *
 *  ⚠⚠⚠ AND ALL SIX CARRIED THE SAME PAGE, WORD FOR WORD. That is the shape
 *  `.agents/rules/no-ad-hoc-hardcoding.md` §2-3 forbids: one judgement, six copies, so the next
 *  round that has to teach the fixture something teaches it to whichever copy it happened to open.
 *  There is one page here, and it is the one that reproduced the failure — a leaner variant would
 *  be a second, more forgiving idea of the same browser, and a fixture more capable than the thing
 *  that ships proves nothing about the thing that ships (#R552).
 *
 *  ⚠ WHAT IS STUBBED: the browser and the Open-Meteo SDK, and nothing else. The rule under test is
 *  always the one that ships. The latencies are the shape production has, compressed: the SDK is
 *  the slow one and the metadata is the fast one, which is what makes `ready()` a window at all.
 *
 *  ⚠ THIS FILE LIVES UNDER tests/helpers/ AND NOT IN A TEST FILE ON PURPOSE: importing one test
 *  file from another registers its cases too, so `node --test tests/r310-checks.test.mjs` would
 *  quietly run somebody else's suite.
 * ==========================================================================*/
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `await wxDelay(ms)` — real time, and therefore NEVER the thing an arrangement is built out of */
export const wxDelay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══ ⚠⚠⚠ WAITING ON THE CLOCK IS NOT WAITING FOR THE THING ══════════════════════════════════════
   The first version of this page set its arrangements up with `await wxDelay(160)` and then
   asserted the fact the wait was there to bring about (`calls.ensureData === 1`). MEASURED on this
   machine: with `sdkMs: 80` that fact becomes true at **109 / 111 / 125 ms**, so the whole of the
   margin was 35–50 ms — and it is not the 80 ms of the SDK, because there is a macrotask hop
   between `ready()` resolving and the read reaching the data. DETERMINISTIC REPRODUCTION: stall the
   event loop for 130 ms starting 60 ms after `load()` and the assertion is reached with
   `ensureData` still 0, three times out of three — when an 80 ms and a 160 ms timer come due in the
   same turn, the 0 ms timer the 80 ms one's continuation posts is queued BEHIND the 160 ms one. It
   was seen for real on a `npm test` run with 23 node processes on 22 logical CPUs.

   So nothing here waits for a duration in order to establish a precondition. It waits for the
   precondition, with a ceiling, and says what it was waiting for when the ceiling is reached —
   ⚠ a wait without a ceiling turns a real defect into a hang, which is unreadable. */
const UNTIL_MS = 8000;

/**
 * `await until(() => calls.ensureData === 1, 'the read to reach the data')`
 * ⚠ the condition is evaluated BEFORE the first wait, so a fact that is already true costs nothing
 * and can never be missed. `opt.observe` is called only on failure, to print what WAS true.
 */
export async function until(cond, what, opt) {
  opt = opt || {};
  const limit = opt.timeoutMs == null ? UNTIL_MS : opt.timeoutMs;
  const t0 = Date.now();
  for (;;) {
    const v = cond();
    if (v) return v;
    if (Date.now() - t0 >= limit) {
      let seen = '';
      if (opt.observe) { try { seen = ' — observed: ' + JSON.stringify(opt.observe()); } catch (e) { seen = ' — observed: <' + e.message + '>'; } }
      throw new Error('waited ' + (Date.now() - t0) + ' ms for ' + what + ' and it never happened' + seen);
    }
    await wxDelay(2);
  }
}

/**
 * drain the microtask queue.
 * The other half of the same idea: once the SDK and the axis are in hand, `ready()` resolves
 * through microtasks alone, so 「the call has got as far as it can get」 is a number of PROMISE
 * turns and not a number of milliseconds — which is why a stalled event loop cannot disturb it.
 * Used where the thing that must have happened (a join, a promotion between lanes) leaves no mark
 * the page can see; where it leaves one (`calls`, `rec.states`), `until` is used instead.
 */
export async function settled(turns) {
  const n = turns == null ? 24 : turns;
  for (let i = 0; i < n; i++) await Promise.resolve();
}

/** a shipped module, imported as a NEW instance (`bust` is what makes it new) */
export const importShipped = (rel, bust) =>
  import(pathToFileURL(join(ROOT, rel)).href + '?wxpage=' + bust);

/** the page around the module: a browser and an SDK, and nothing else stubbed */
export function makeWxPage(opt) {
  opt = opt || {};
  const SDK_MS = opt.sdkMs == null ? 200 : opt.sdkMs;
  const META_MS = opt.metaMs == null ? 40 : opt.metaMs;
  const READ_MS = opt.readMs == null ? 120 : opt.readMs;
  const calls = { ensureData: 0, sdkScript: 0 };
  const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

  const NX = 8, NY = 5;
  const GRID = { nx: NX, ny: NY, lonMin: -180, latMin: -90, dx: 45, dy: 36 };
  const sdk = {
    DATA_RELEVANT_PARAMS: ['variable'],
    defaultOmProtocolSettings: { fileReaderConfig: {}, colorScales: {} },
    COLOR_SCALES_WITH_ALIASES: {},
    domainOptions: [{ value: 'ecmwf_wam025', grid: GRID }, { value: 'ecmwf_ifs', grid: GRID }],
    getColorScale: () => null,
    omProtocol: () => ({}),
    updateCurrentBounds: () => { },
    WeatherMapLayerFileReader: function () {
      this.config = {}; this.cache = { clear() { } };
      this.setToOmFile = (u) => wait(5, u);
      this.readVariable = () => wait(READ_MS, null);
      this.prefetchVariable = () => wait(2, null);
      this.dispose = () => { };
    },
    /* ⚠ `rec.states` is how a case knows a read HAS TAKEN ITS TICKET AND JOINED THE QUEUE without
       having reached the data yet: the module asks for the state on the line after it takes the
       ticket and before it queues the job, so this is the only observable moment between the two.
       An arrangement that needs a read to be queued-but-not-running waits on this, not on a clock. */
    getOrCreateState: (map, key, dataOptions, file) => {
      rec.states.push(key);
      let s = map.get(key);
      if (!s) { s = { key, dataOptions, file, ranges: [[0, NY], [0, NX]] }; map.set(key, s); }
      return s;
    },
    /* plausible wave heights, because js/waves.js renders these and a metre is a metre */
    ensureData: () => { calls.ensureData++; return wait(READ_MS).then(() => ({ values: Float32Array.from({ length: NX * NY }, (_, k) => 1 + (k % 7) * 0.5) })); },
    GridFactory: { create: () => ({ getInterpolatedValue: () => NaN }) }
  };
  let inst = null;
  sdk.getProtocolInstance = () => (inst || (inst = { stateByKey: new Map(), omFileReader: new sdk.WeatherMapLayerFileReader() }));

  const hour = (n) => new Date(Date.now() + n * 3600000).toISOString().slice(0, 13) + ':00';
  const META = {
    reference_time: hour(-3), last_modified_time: hour(-2), completed: true,
    valid_times: [hour(-1), hour(0), hour(1), hour(2)],
    variables: ['wave_height', 'wave_period', 'temperature_2m']
  };

  const clockSubs = [];
  const mapEvents = Object.create(null);
  const layers = new Set();
  const rec = { adds: [], moves: [], states: [] };
  const style = { layers: [{ id: 'im-night-shade' }, { id: 'country-fill' }, { id: 'layer-sat-labels' }, { id: 'ofm-city' }] };
  const win = {
    OMWeatherMapLayer: null,
    devicePixelRatio: 1,
    IntMapWx: { guardedJSON: () => wait(META_MS, JSON.parse(JSON.stringify(META))) },
    IntMapTime: {
      on(f) { clockSubs.push(f); return () => { }; },
      broadcastLive() { clockSubs.forEach((f) => f({ when: new Date(), isLive: true, source: 'test' })); }
    },
    IntMapGeoEngine: {
      hasRenderer: () => true,
      id: () => 'maplibre',
      scene: { addProtocol: () => true, getStyle: () => ({ layers: style.layers.slice() }) },
      camera: { getBounds: () => null },
      layers: {
        has: (id) => layers.has(id) || style.layers.some((l) => l.id === id),
        add(layer, before) { rec.adds.push({ id: layer.id, before }); layers.add(layer.id); },
        move(id, before) { rec.moves.push({ id, before }); },
        remove(id) { layers.delete(id); }
      },
      events: { on: (name, fn) => { (mapEvents[name] || (mapEvents[name] = [])).push(fn); } },
      render: { triggerRepaint() { } }
    },
    IntMapLang: { pick: () => (en) => en, pickArgs: () => () => '' },
    addEventListener() { }, removeEventListener() { },
    dispatchEvent() { return true; },
    CustomEvent: class { constructor(t, d) { this.type = t; Object.assign(this, d); } },
    setTimeout, clearTimeout
  };
  win.window = win;
  const el = () => ({
    style: {}, className: '', id: '', children: [], _html: '',
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, remove() { },
    classList: { toggle() { }, add() { }, remove() { } },
    addEventListener() { }, removeEventListener() { },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; }
  });
  const doc = {
    head: {
      appendChild(node) {
        calls.sdkScript++;
        setTimeout(() => { win.OMWeatherMapLayer = sdk; node.onload && node.onload(); }, SDK_MS);
      }
    },
    body: el(),
    createElement: el,
    getElementById: () => null,
    querySelector: () => null
  };
  return {
    win, doc, sdk, calls, rec, layers, GRID,
    fireMap(name) { (mapEvents[name] || []).forEach((f) => f({})); },
    fetch: () => wait(2, { arrayBuffer: () => wait(1, new ArrayBuffer(1)) })
  };
}

/* Each case gets its OWN page, so 「cold」 means cold: the SDK, the protocol registration, the
   metadata, the frame list and the ticket counter are all per import of the module. */
let bust = 0;

/**
 * a cold js/wx-ecmwf.js on a cold page.
 * `{ page, calls, ENG, load }` — `load(rel)` brings a further shipped module (js/waves.js and its
 * two dependencies publish onto `window` AT IMPORT, and a module is imported once per process, so
 * they have to be re-evaluated against THIS page or they would be running against the last one's).
 */
export async function coldWxModel(opt) {
  const page = makeWxPage(opt);
  globalThis.window = page.win;
  globalThis.document = page.doc;
  globalThis.fetch = page.fetch;
  bust++;
  const mine = bust;
  const load = (rel) => importShipped(rel, mine);
  await load('js/wx-models.js');
  await load('js/wx-ecmwf.js');
  return { page, calls: page.calls, ENG: page.win.IntMapWxEngine, load };
}
