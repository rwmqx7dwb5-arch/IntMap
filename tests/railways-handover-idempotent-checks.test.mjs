/* railways-handover-idempotent — asking the railway layer for the state it is already in changes nothing.
 *
 * Measured in production (b778dd6): railways on → Tokyo z5 → jumpTo z9. The detail line was drawn and,
 * 20–25 s later, the world line was still on top of it. In 45 s the map went idle 0 times and
 * 'rail-det-src' reported 2,666 tile `sourcedata` events without ever finishing. The chain:
 *   ① js/layer-packs.js's basemap-swap self-heal called IntMapRailways.toggle(true) on EVERY
 *     `styledata` (14 in 15 s) — and MapLibre fires `styledata` after any change to the style, not
 *     only after a basemap swap;
 *   ② toggle(true) handed the whole world file (111,660 lines) to the renderer again;
 *   ③ and re-sent the detail cells, which cancelled the handover still waiting for them;
 *   ④ so the source never finished, `idle` never came, and the world line never came off.
 * .agents/rules/one-pass-or-a-reason.md §2-3: the operation was not idempotent.
 *
 * Both halves are EVALUATED — the real js/railways.js and the real js/layer-packs.js betaPack2 factory,
 * each over a fake renderer — not read as text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { importModule } from './helpers/import-module.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/* a renderer that, like the real ones, does not make data drawable in `setSourceData`; the test says
   when the map goes idle. `swap()` is a basemap swap: every source and layer leaves with the style. */
function makeEngine() {
  const vis = new Map(), handlers = new Map(), sources = new Map(), layers = new Set();
  const sends = new Map();
  const fire = (name, e) => { for (const f of [...(handlers.get(name) || [])]) f(e); };
  const ge = {
    ready: () => true,
    hasRenderer: () => true,
    layers: {
      hasSource: (id) => sources.has(id),
      addSource: (id, d) => sources.set(id, d.data),
      setSourceData: (id, d) => { sources.set(id, d); sends.set(id, (sends.get(id) || 0) + 1); },
      has: (id) => layers.has(id),
      add: (def) => { layers.add(def.id); vis.set(def.id, !!(def.layout && def.layout.visibility === 'visible')); },
      remove: (id) => { layers.delete(id); }, removeSource: (id) => { sources.delete(id); },
      setVisible: (id, v) => { vis.set(id, !!v); },
      setLayout: (id, k, v) => { if (k === 'visibility') vis.set(id, v === 'visible'); },
      setPaint() { }, setFilter() { },
    },
    camera: { getZoom: () => 11, getBounds: () => ({ south: 35.1, west: 135.1, north: 35.4, east: 135.4 }), getCenter: () => ({ lng: 135, lat: 35 }) },
    events: {
      on: (n, f) => { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
      off: (n, f) => { const s = handlers.get(n); if (s) s.delete(f); },
      once: (n, f) => { const w = (e) => { ge.events.off(n, w); f(e); }; ge.events.on(n, w); },
      onLayer() { },
    },
    render: { canvas: () => ({ style: {} }) },
    ui: { popup: () => ({}), attach() { } },
  };
  return {
    ge, vis, layers, sends: (id) => sends.get(id) || 0,
    listeners: (n) => (handlers.get(n) || new Set()).size,
    fire,
    idle: () => fire('idle', {}),
    swap: () => { layers.clear(); sources.clear(); vis.clear(); },
  };
}

/* (module-graph) the renderer and the language registry are imports now: the fake engine is handed at
   the geo-engine.js import edge of each module under test (see `mocksFor`), the registry is the real one */
const mocksFor = (eng) => ({ 'js/geo-engine.js': { IntMapGeoEngine: eng.ge } });
function baseWindow() {
  globalThis.window = globalThis.window || {};
  Object.assign(globalThis.window, {
    IntMapSafe: { html: (v) => v, url: (v) => v },
    IntMapLabelScale: { sub: (v) => v },
    addEventListener() { },
  });
}

async function railways() {
  const { RailSchema } = await import(pathToFileURL(join(ROOT, 'js/rail-schema.js')).href);
  const keys = ['k', 'g'];
  const wire = (lines) => gzipSync(Buffer.from(JSON.stringify(RailSchema.encodeLines(lines, keys, 1e5))));
  const WORLD = wire([{ props: { k: 'rail', g: 1435 }, pts: [[135.0, 35.0], [135.5, 35.5]] }]);
  const CELL = wire([{ props: { k: 'rail', g: 1435 }, pts: [[135.2, 35.2], [135.3, 35.3]] }]);
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('world.json.gz')) return new Response(WORLD);
    if (u.endsWith('/index.json')) return new Response(JSON.stringify({ cell: 5, cells: { '35_135': 1 } }));
    if (u.endsWith('st-index.json')) return new Response(JSON.stringify({ cell: 5, cells: {} }));
    if (u.includes('/c/')) return new Response(CELL);
    return new Response('', { status: 404 });
  };
  const eng = makeEngine();
  baseWindow();
  const { railways: factory } = await importModule('js/railways.js', { mocks: mocksFor(eng) });
  const R = factory({ lang: 'en', canDraw: () => true });
  return { R, eng };
}

async function until(cond, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) { await tick(); if (cond()) return; }
  assert.fail('never reached within 5000 ms: ' + what);
}

test('railways-handover-idempotent ① toggle(true) again and again re-sends nothing and the handover completes', async () => {
  const { R, eng } = await railways();
  R.toggle(true);
  await until(() => eng.sends('rail-det-src') === 1, 'the detail cells were never handed over');
  assert.equal(eng.sends('rail-src'), 1, 'the world file goes over once');
  assert.equal(eng.vis.get('rail-ln'), true, 'the world line stays until the detail can draw');
  assert.ok(eng.listeners('idle') > 0, 'a handover is waiting for the detail');

  /* the self-heal as it was measured: once per `styledata`, while the handover waits */
  for (let i = 0; i < 15; i++) { R.toggle(true); await tick(5); }
  assert.equal(eng.sends('rail-src'), 1, 'toggle(true) on a layer already on handed the world file over again');
  assert.equal(eng.sends('rail-det-src'), 1, 'toggle(true) on a layer already on re-sent the detail (and cancelled its handover)');
  assert.ok(eng.listeners('idle') > 0, 'the waiting handover was cancelled by a call that changed nothing');

  eng.idle();
  assert.equal(eng.vis.get('rail-ln'), false, 'the renderer finished; the world line should have come off');
  assert.equal(eng.vis.get('rail-det-ln'), true);

  /* and once handed over, the same call leaves it handed over */
  for (let i = 0; i < 5; i++) { R.toggle(true); await tick(5); }
  assert.equal(eng.vis.get('rail-ln'), false, 'toggle(true) put the world line back over the detail');
  assert.equal(eng.sends('rail-src') + eng.sends('rail-det-src'), 2, 'toggle(true) re-sent data after the handover');
});

test('railways-handover-idempotent ② a basemap swap still rebuilds the layer and hands over again', async () => {
  const { R, eng } = await railways();
  R.toggle(true);
  await until(() => eng.sends('rail-det-src') === 1, 'the detail cells were never handed over');
  eng.idle();
  assert.equal(eng.vis.get('rail-ln'), false);

  eng.swap();   /* the style took every source and layer with it */
  R.toggle(true);
  await until(() => eng.sends('rail-det-src') === 2, 'the detail was not re-sent to the new source');
  assert.ok(eng.layers.has('rail-ln') && eng.layers.has('rail-det-ln'), 'the layers were not rebuilt');
  assert.equal(eng.vis.get('rail-ln'), true, 'the new source has not drawn the detail yet — the world line must be up');
  eng.idle();
  assert.equal(eng.vis.get('rail-ln'), false, 'the handover on the new style did not complete');

  /* OFF → ON starts from the world line and hands over again */
  R.toggle(false);
  R.toggle(true);
  await until(() => eng.sends('rail-det-src') === 3, 'OFF→ON did not hand the detail over again');
  assert.equal(eng.vis.get('rail-ln'), true);
  eng.idle();
  assert.equal(eng.vis.get('rail-ln'), false);
});

/* ── ③ every basemap-swap self-heal in js/layer-packs.js rebuilds a row only when the style lost it ──
   THE PACKS ARE NOT LISTED HERE. Every factory js/layer-packs.js exports (module-graph) is built over
   a fake renderer and a fake Layers panel; every `styledata` subscriber they register is found by
   its subscription; every row checkbox they put in the panel is switched on. Then, per subscriber:
   a storm of `styledata` with the rows' layers on the map must fetch nothing, send nothing and add
   nothing — and a swap (the style loses every source and layer) must rebuild exactly once. */

/* the smallest DOM the packs' panel rows use */
function makeDom() {
  const byId = new Map();
  class El {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.parent = null; this.listeners = {}; this.style = {};
      this._id = ''; this.className = ''; this.attrs = {}; this.textContent = ''; this.checked = false; this.value = '';
      this.classList = { toggle() { }, add() { }, remove() { }, contains: () => false };
    }
    set id(v) { this._id = v; byId.set(v, this); }
    get id() { return this._id; }
    set innerHTML(h) {
      this._html = h;
      for (const m of String(h).matchAll(/<(input|span|div|button|select|label)\b[^>]*?\bid="([^"]+)"/g)) { const e = new El(m[1]); e.id = m[2]; this.appendChild(e); }
    }
    get innerHTML() { return this._html || ''; }
    appendChild(c) { c.parent = this; this.children.push(c); return c; }
    insertBefore(c) { return this.appendChild(c); }
    append(...cs) { cs.forEach((c) => typeof c === 'object' && this.appendChild(c)); }
    remove() { }
    all() { const out = []; const w = (e) => { for (const c of e.children) { out.push(c); w(c); } }; w(this); return out; }
    querySelector(sel) { return this.all().find((e) => (sel === 'input' ? e.tagName === 'input' : sel[0] === '#' ? e.id === sel.slice(1) : false)) || null; }
    querySelectorAll() { return []; }
    addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); }
    removeEventListener() { }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    closest() { return this.parent || this; }
  }
  const dropdown = new El('div'); dropdown.id = 'layer-dropdown';
  const document = {
    readyState: 'complete', baseURI: 'http://127.0.0.1/', head: new El('head'), body: new El('body'),
    getElementById: (id) => byId.get(id) || null,
    createElement: (t) => new El(t), createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() { }, removeEventListener() { },
  };
  return { document, dropdown };
}

test('railways-handover-idempotent ③ every basemap-swap self-heal fires only when the style lost its row', async () => {
  const eng = makeEngine();
  baseWindow();
  const count = { fetch: 0, send: 0, add: 0, addSource: 0, rail: 0, dc: 0 };
  const L = eng.ge.layers;
  const add0 = L.add, addSource0 = L.addSource, send0 = L.setSourceData;
  L.add = (def) => { count.add++; return add0(def); };
  L.addSource = (id, d) => { count.addSource++; return addSource0(id, d); };
  L.setSourceData = (id, d) => { count.send++; return send0(id, d); };
  Object.assign(eng.ge, { scene: { addProtocol() { } } });
  globalThis.fetch = async () => { count.fetch++; return new Response('', { status: 404 }); };

  const { document, dropdown } = makeDom();
  globalThis.document = document;
  Object.assign(window, {
    IntMapLazy: { need: () => Promise.resolve() },
    IntMapRailways: { toggle: () => { count.rail++; }, drop() { }, axis: () => 'gauge', key: () => [], axes: () => [] },
    IntMapDataCenters: { toggle: () => { count.dc++; }, key: () => [] },
    IntMapMemBudget: { deviceIsPhone: () => false },
  });

  /* the subscribers are found by subscription */
  const found = [];
  const on0 = eng.ge.events.on;
  eng.ge.events.on = (n, f) => { if (n === 'styledata') found.push(f); return on0(n, f); };

  /* the factories are the functions js/layer-packs.js exports — read off its namespace, not listed —
     evaluated with the fake engine at its geo-engine.js import edge (module-graph) */
  const NS = await importModule('js/layer-packs.js', { mocks: mocksFor(eng) });
  const packs = Object.keys(NS).filter((k) => typeof NS[k] === 'function');
  const HOST = {
    lang: 'en', proj: 'globe', countryGeo: null, canDraw: () => true, imToast() { }, satToast() { },
    isMobile: () => false, t: (...a) => a[0], loadCountryData: () => Promise.resolve(null), countryStats: () => null,
  };
  for (const p of packs) NS[p](HOST);
  assert.ok(packs.length > 0 && found.length > 0, 'js/layer-packs.js registered no pack or no styledata subscriber');
  /* a subscriber that goes through healWhenLost says which rows it heals; the behaviour below is
     measured on every subscriber either way, and the missing receipt is reported after it */
  const ruled = found.filter((f) => typeof f.rows === 'function');

  /* every row the packs put in the panel is switched on (the time-zone and GIBS rows are built late) */
  await tick(1200);
  const rows = dropdown.all().filter((e) => e.tagName === 'input' && e.listeners.change);
  const flip = (checked) => { for (const cb of rows) { cb.checked = checked; for (const f of cb.listeners.change) { try { f({ target: cb }); } catch (_) { } } } };
  flip(true);
  await tick(300);

  try {
    /* every subscriber has a row on — otherwise this check would be looking at nothing */
    for (const f of ruled) assert.ok(f.rows().some((r) => r.on), 'a self-heal has no row switched on: ' + JSON.stringify(f.rows().map((r) => r.key)));

    /* the rows are drawn: whatever a failed fetch left undrawn is put on the map, as a drawn row would be */
    for (const f of ruled) for (const r of f.rows()) if (r.on) for (const id of r.ids) if (!L.has(id)) add0({ id, layout: { visibility: 'visible' } });
    await tick(200);
    const snap = { ...count };
    const heals0 = found.map((f) => f.heals);
    for (let i = 0; i < 14; i++) eng.fire('styledata', {});
    await tick(250);
    assert.deepEqual(count, snap, 'styledata with every row\'s layers on the map fetched, sent or rebuilt something');
    assert.equal(ruled.length, found.length, (found.length - ruled.length) + ' of ' + found.length + ' styledata subscribers in js/layer-packs.js do not go through the one self-heal rule (healWhenLost)');
    assert.deepEqual(found.map((f) => f.heals), heals0, 'a self-heal ran while its rows\' layers were on the map');

    /* a basemap swap: the style takes every source and layer with it — each self-heal runs once */
    eng.swap();
    for (let i = 0; i < 5; i++) eng.fire('styledata', {});
    await tick(250);
    assert.deepEqual(found.map((f, i) => f.heals - heals0[i]), found.map(() => 1), 'after a swap each self-heal should rebuild exactly once');
    assert.equal(count.rail, snap.rail + 1, 'the railway row was not rebuilt after the swap');
  } finally {
    flip(false);   /* the aurora feed and the spin hold timers */
  }
});
