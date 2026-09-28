/* ============================================================================
 *  nightly-state-leaks — what the nightly run 36348262163 measured, kept measured
 * ----------------------------------------------------------------------------
 *  Two red tests on that run were not the product regressing; they were the harness:
 *    · a panel one test opened was still over the map when the next test on the worker clicked
 *      it (tests/r322 ② → tests/r388-detail ①, and the right Layers sidebar under tests/r170's
 *      3-D volume clicks). tests/helpers/app.js now finds whatever is over the map by hit-testing
 *      and closes it through its own «×» — ① below keeps the one fact that relies on true.
 *  …and one was the product, seen by a test:
 *    · js/railways.js hid the world line in the same tick as it handed the detail cells to the
 *      renderer, which parses them in a worker — a moment with no railway on the map at all.
 *      ② evaluates the module against a renderer that says when it can draw, and asserts the
 *      defect itself: there is no frame with neither line.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── ① the close control the reset presses is the app's only close control ─────────────────── */
test('nightly-state-leaks ① every glyph-only close control in the app is the «×» the reset presses', () => {
  const helper = readFileSync(join(ROOT, 'tests/helpers/app.js'), 'utf8');
  const m = /const CLOSE_GLYPH = ('(?:[^'\\]|\\.)*');/.exec(helper);
  assert.ok(m, 'tests/helpers/app.js no longer declares CLOSE_GLYPH');
  const glyph = JSON.parse('"' + m[1].slice(1, -1) + '"');

  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name)) files.push(p);
    }
  })(join(ROOT, 'js'));
  files.push(join(ROOT, 'index.html'));

  /* a control whose WHOLE label is one or two non-word characters: `<button …>×</button>`, or a
     `textContent`/`innerText` assignment of the same. Other glyph-only controls (▶, ‹, −, ★ …)
     are counted too, and only the cross-shaped ones are held to the rule. */
  const re = /<button\b[^>]*>\s*([^<\s\w]{1,2}|&times;|&#215;|&#xd7;)\s*<\/button>|(?:textContent|innerText)\s*=\s*(['"`])([^'"`\s\w]{1,2})\2/g;
  /* ⚠ THE GUARD'S OWN LIST: the cross-shaped characters a close control could be drawn with instead.
     If one of them appears as a whole label, the reset's CLOSE_GLYPH no longer finds every panel. */
  const CROSSES = new Set(['✕', '✖', '✗', '✘', '⨯', '╳', '❌', '❎', '\u{1F5D9}', '\u{1F5F4}', '\u{1F7A9}', '&times;', '&#215;', '&#xd7;']);
  let uses = 0; const others = [];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (let x; (x = re.exec(s));) {
      const g = x[1] || x[3];
      if (g === glyph) uses++;
      else if (CROSSES.has(g)) others.push(f.slice(ROOT.length + 1) + ': ' + g);
    }
  }
  assert.ok(uses > 0, 'no control in the app is labelled «' + glyph + '» — CLOSE_GLYPH describes nothing');
  assert.deepEqual(others, [], 'a close control uses a cross that is not CLOSE_GLYPH, so the reset cannot close it');
});

/* ── ② the railway handover has no frame without a line ──────────────────────────────────────
   A renderer that behaves the way the two real ones do in the one respect that matters here:
   `setSourceData` does NOT make the data drawable; the test decides when a tile lands, when the
   map goes idle, and — for the engine with no tiles — reports the GeoJSON loaded synchronously.
   `frame()` is called only between macrotasks, because that is when a real renderer can draw. */
function makeEngine({ syncLoaded = false } = {}) {
  const vis = new Map(), handlers = new Map(), sources = new Map(), layers = new Set();
  const cam = { zoom: 11, bounds: { south: 35.1, west: 135.1, north: 35.4, east: 135.4 } };
  let detDrawn = false, worldSeen = false;
  const blanks = [];
  const fire = (name, e) => { for (const f of [...(handlers.get(name) || [])]) f(e); };
  const ge = {
    ready: () => true,
    layers: {
      hasSource: (id) => sources.has(id),
      addSource: (id, d) => sources.set(id, d.data),
      setSourceData: (id, d) => {
        sources.set(id, d);
        if (id === 'rail-det-src') {
          detDrawn = false;
          if (syncLoaded) { detDrawn = true; fire('sourcedata', { sourceId: id, isSourceLoaded: true, dataType: 'source' }); }
        }
      },
      has: (id) => layers.has(id),
      add: (def) => { layers.add(def.id); vis.set(def.id, def.layout && def.layout.visibility === 'visible'); },
      remove: (id) => { layers.delete(id); }, removeSource: (id) => { sources.delete(id); },
      setVisible: (id, v) => { vis.set(id, !!v); },
      setPaint() { }, setFilter() { },
    },
    camera: { getZoom: () => cam.zoom, getBounds: () => cam.bounds },
    events: {
      on: (n, f) => { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
      off: (n, f) => { const s = handlers.get(n); if (s) s.delete(f); },
      once: (n, f) => { const w = (e) => { ge.events.off(n, w); f(e); }; ge.events.on(n, w); },
      onLayer() { },
    },
    render: { canvas: () => ({ style: {} }) },
  };
  return {
    ge, cam, blanks, vis,
    listeners: (n) => (handlers.get(n) || new Set()).size,
    /* the renderer's own reports */
    announce: () => fire('sourcedata', { sourceId: 'rail-det-src', isSourceLoaded: true, dataType: 'source', sourceDataType: 'content' }),
    tileLanded: () => { detDrawn = true; fire('sourcedata', { sourceId: 'rail-det-src', isSourceLoaded: true, dataType: 'source', tile: {} }); },
    idle: () => { detDrawn = true; fire('idle', {}); },
    detData: () => sources.get('rail-det-src'),
    frame() {
      const world = !!vis.get('rail-ln'), det = !!vis.get('rail-det-ln') && detDrawn;
      if (world) worldSeen = true;
      if (worldSeen && !world && !det) blanks.push({ world, detVisible: !!vis.get('rail-det-ln'), detDrawn });
    },
  };
}

async function railwaysOn(opts) {
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
  const eng = makeEngine(opts);
  const say = Object.assign((...a) => a[0], { arr: (a) => a[0] });
  globalThis.window = globalThis.window || {};
  Object.assign(globalThis.window, {
    IntMapGeoEngine: eng.ge,
    IntMapLang: { pick: () => say, pickArgs: () => (...a) => a[0] },
    IntMapSafe: { html: (v) => v, url: (v) => v },
    IntMapLabelScale: { sub: (v) => v },
  });
  await import(pathToFileURL(join(ROOT, 'js/railways.js')).href);
  const R = window.IntMapModules.railways({ lang: 'en', canDraw: () => true });
  R.toggle(true);
  return { R, eng };
}

/* between macrotasks, as a renderer would, until the condition holds (bounded, and says so).
   ⚠ BOUNDED BY TIME, NOT BY A COUNT OF TURNS. The cells arrive through fetch → DecompressionStream,
   which runs off the event loop; 400 setImmediate turns is a few milliseconds on one machine and not
   enough on another. Measured 2026-09-28: green in one worktree, red in CI and in a second worktree
   whose only difference was which test ran before it — the verdict was the runner's speed. */
const FRAMES_MS = 5000;   /* a wall-clock bound far above the gunzip of two tiny fixtures; a real hang still fails */
async function frames(eng, cond, what) {
  const t0 = Date.now();
  let turns = 0;
  while (Date.now() - t0 < FRAMES_MS) {
    await new Promise((r) => setTimeout(r, 0));
    eng.frame(); turns++;
    if (cond()) return;
  }
  assert.fail(`never reached within ${FRAMES_MS} ms (${turns} frames): ${what}`);
}

test('nightly-state-leaks ② the world line stays until the detail can draw — an announcement is not a drawing', async () => {
  const { R, eng } = await railwaysOn();
  await frames(eng, () => !!(eng.detData() && eng.detData().features.length), 'the detail cells were handed over');
  await frames(eng, () => true, 'one more frame');
  assert.equal(eng.vis.get('rail-det-ln'), true, 'the detail line is switched on with its data');
  assert.equal(eng.vis.get('rail-ln'), true, 'the world line must still be up: the renderer has not drawn the detail yet');
  /* ⚠ #R297/#R298: a source asked for no tile yet reports itself loaded. Not a reason to hand over. */
  eng.announce(); eng.frame();
  assert.equal(eng.vis.get('rail-ln'), true, 'a content announcement is not a tile — the world line came off too early');
  eng.tileLanded(); eng.frame();
  assert.equal(eng.vis.get('rail-ln'), false, 'the detail tile landed; the world line should hand over');
  assert.deepEqual(eng.blanks, [], 'there was a frame with no railway on the map');
  assert.equal(eng.listeners('sourcedata') + eng.listeners('idle'), 0, 'the handover left listeners behind');
  R.toggle(false);
});

test('nightly-state-leaks ② …the map going idle also answers, and a zoom-out cancels a handover still waiting', async () => {
  const { R, eng } = await railwaysOn();
  await frames(eng, () => !!(eng.detData() && eng.detData().features.length), 'the detail cells were handed over');
  eng.idle(); eng.frame();
  assert.equal(eng.vis.get('rail-ln'), false, 'idle means nothing is left to load, the detail included');

  /* zoom out below the threshold, then back in: the new handover is pending when we zoom out again */
  eng.cam.zoom = 4; R.refresh(); eng.frame();
  assert.equal(eng.vis.get('rail-ln'), true, 'below the detail threshold the world line is the answer');
  eng.cam.zoom = 11; R.refresh();
  await frames(eng, () => eng.listeners('idle') > 0, 'a new handover is waiting');
  eng.cam.zoom = 4; R.refresh(); eng.frame();
  eng.tileLanded(); eng.idle(); eng.frame();
  assert.equal(eng.vis.get('rail-ln'), true, 'a late answer took the world line off a view with no detail on it');
  assert.deepEqual(eng.blanks, [], 'there was a frame with no railway on the map');
  R.toggle(false);
});

test('nightly-state-leaks ② …and an engine whose GeoJSON has no tiles hands over as soon as it says loaded', async () => {
  const { R, eng } = await railwaysOn({ syncLoaded: true });
  await frames(eng, () => !!(eng.detData() && eng.detData().features.length), 'the detail cells were handed over');
  await frames(eng, () => true, 'one more frame');
  assert.equal(eng.vis.get('rail-ln'), false, 'the engine said the detail is loaded and it has no tiles to wait for');
  assert.deepEqual(eng.blanks, [], 'there was a frame with no railway on the map');
  R.toggle(false);
});
