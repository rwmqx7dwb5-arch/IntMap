/* ============================================================================
 *  atlas-observer-undo — 「描けた」と「観測できなかった」と「失敗した」を分け、ターンを 1 つの仕組みで戻す
 * ----------------------------------------------------------------------------
 *  THE DEFECTS, AS MEASURED (dev-notes/2026-09-25-atlas-observer-undo.md):
 *    ① The verdict 「is it on the map」 was answered by every observer for itself, from source ids
 *       typed into js/atlas-capabilities.js. A surface nobody typed moved no count, so a correct
 *       draw was reported `not_rendered` and Atlas drew it again — #R736 (21 steps, 10m29s), #R742
 *       (52 of 207 operations), #R740 (five redraws of one reach), R802 (the markers).
 *    ② A verdict given while the renderer could not be asked at all (no style yet) was the same
 *       word as a failed draw — .agents/rules/one-pass-or-a-reason.md §5 forbids exactly that.
 *    ③ 0 of 145 capabilities could take back what they put on the map.
 *  ⚠ THESE TESTS EVALUATE (#R505): the SHIPPED facade (js/geo-engine.js makeFacade), the SHIPPED
 *  registry (makeAtlasCapabilities) and the SHIPPED ledger (makeAtlasState), over stub adapters and
 *  stub subsystems — nothing here reads the source for a spelling.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import('../js/geo-engine.js');
const ENGINE = window.IntMapGeoEngine;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasState } = await import('../js/atlas-state.js');
const CAPS = makeAtlasCapabilities({ lang: 'en' });

/* An adapter holding exactly `world` — sources (id → features), which of them a visible layer reads,
   the camera, and whether its style is parsed. Every member is one BOTH real adapters implement. */
function adapter(world) {
  return {
    raw: () => (world.renderer === false ? null : {}),
    canDraw: () => world.ready !== false,
    hasSource: (id) => id in world.sources,
    sourceData: (id) => ((id in world.sources) ? { type: 'FeatureCollection', features: world.sources[id] } : null),
    getStyle: () => ({ layers: Object.keys(world.sources).map((id) => ({ id: id + '-lyr', source: id })) }),
    isVisible: (lid) => !(world.hidden || []).includes(lid.replace(/-lyr$/, '')),
    getCenter: () => ({ lng: world.cam.lng, lat: world.cam.lat }), getZoom: () => world.cam.zoom,
    getBearing: () => world.cam.bearing, getPitch: () => world.cam.pitch,
    jumpTo: (o) => { world.cam = { lng: o.center[0], lat: o.center[1], zoom: o.zoom, bearing: o.bearing, pitch: o.pitch }; },
    getBounds: () => null
  };
}
const feats = (n) => Array.from({ length: n }, (_, i) => ({ type: 'Feature', properties: { i }, geometry: { type: 'Point', coordinates: [i, i] } }));
function world(sources, extra) { return Object.assign({ sources, cam: { lng: 139.7, lat: 35.7, zoom: 5, bearing: 0, pitch: 0 } }, extra || {}); }
/* the facade the app publishes, bound to that adapter, with the claims the painters make */
function facade(w, claims) {
  const f = ENGINE.makeFacade(adapter(w));
  (claims || []).forEach(([id, owner, clear]) => f.render.claim(id, owner, clear ? { clear } : undefined));
  return f;
}
function withEngine(f, fn) {
  const had = window.IntMapGeoEngine;
  window.IntMapGeoEngine = f;
  try { return fn(); } finally { window.IntMapGeoEngine = had; }
}

/* ══ ① THE QUESTION IS THE RENDERER'S, AND IT HAS THREE ANSWERS ═══════════════════════════════════ */

test('① render.drawn answers drawn / gone per claimed surface, discovered from the claims', () => {
  const w = world({ 'a-src': feats(2), 'b-src': [], 'c-src': feats(1) }, { hidden: ['c-src'] });
  const f = facade(w, [['a-src', 'map.fly'], ['b-src', 'map.fly'], ['c-src', 'map.elevation'], ['gone-src', 'map.elevation']]);
  const all = f.render.drawn({});
  assert.equal(all.observable, true);
  assert.deepEqual(all.drawn, ['a-src']);
  assert.equal(all.surfaces['a-src'].features, 2);
  assert.equal(all.surfaces['b-src'].state, 'empty');
  assert.equal(all.surfaces['c-src'].state, 'hidden', 'features under a hidden layer are not drawn');
  assert.equal(all.surfaces['gone-src'].state, 'absent');
  assert.deepEqual(f.render.drawn({ owners: ['map.elevation'] }).drawn, [], 'asked by effect key, only that key\'s surfaces answer');
  assert.deepEqual(Object.keys(f.render.drawn({ owners: ['map.fly'] }).surfaces).sort(), ['a-src', 'b-src']);
});

test('② a renderer that cannot be asked says so — `unknown`, never `gone`', () => {
  const w = world({ 'a-src': [] }, { ready: false });
  const r = facade(w, [['a-src', 'map.fly']]).render.drawn({});
  assert.equal(r.observable, false);
  assert.equal(r.surfaces['a-src'].state, 'unknown');
  assert.deepEqual(r.gone, [], '「could not look」 is not evidence that nothing is there');
});

/* ══ ② THE VERDICTS ASK IT ════════════════════════════════════════════════════════════════════════ */

test('③ a surface that was drawn is not reported as not drawn — a redraw of the same flight path', () => {
  /* sim.flyAnimate writes camera + map.fly; the fly path is claimed under map.fly. Drawing the same
     path twice moves no count — the #R747 shape — and used to end `not_rendered`. */
  const cap = CAPS.resolve('sim.flyAnimate');
  const f = facade(world({ 'nlq-fly-src': feats(2) }), [['nlq-fly-src', ['map.fly', 'map.ballistic']]]);
  const v = withEngine(f, () => { const b = cap.observe(); return cap.verify({}, {}, b, cap.observe(), { ok: true, html: '' }); });
  assert.equal(v.status, 'completed', `a redrawn path was called ${v.status}/${v.code}`);
  assert.equal(v.code, 'already_there');
  /* …and the refusal is kept: nothing moved and nothing of its kind is on the map */
  const g = facade(world({ 'nlq-fly-src': [] }), [['nlq-fly-src', ['map.fly', 'map.ballistic']]]);
  const n = withEngine(g, () => { const b = cap.observe(); return cap.verify({}, {}, b, cap.observe(), { ok: true, html: '' }); });
  assert.equal(n.code, 'not_rendered');
});

test('④ a reach and a power map are read through the renderer by the key their rows write', () => {
  const iso = CAPS.resolve('routing.isochrone');
  const f = facade(world({ 'im-iso-src': feats(3) }), [['im-iso-src', 'map.isochrone']]);
  const v = withEngine(f, () => { const b = iso.observe(); return iso.verify({}, { place: 'x' }, b, iso.observe(), { ok: true, html: '' }); });
  assert.equal(v.status, 'completed');
  assert.equal(v.observed.isochrone.features, 3);
  const hist = CAPS.resolve('research.historicalMap');
  const g = facade(world({ 'nlq-fac-src': feats(4) }), [['nlq-fac-src', 'map.factions']]);
  const h = withEngine(g, () => { const b = hist.observe(); return hist.verify({}, {}, b, hist.observe(), { ok: true, html: '' }); });
  assert.equal(h.status, 'completed');
});

test('⑤ what cannot be observed is not reported as a failure — for every map-writing capability', () => {
  const shaded = CAPS.resolve('map.choropleth');
  const asleep = facade(world({}, { ready: false }));
  const v = withEngine(asleep, () => { const b = shaded.observe(); return shaded.verify({}, {}, b, shaded.observe(), { ok: true, html: '' }); });
  assert.equal(v.status, 'partial');
  assert.equal(v.code, 'not_rendering', `an unobservable renderer was reported ${v.code}`);
  assert.equal(v.observed.observable, false);
  /* the same nothing, with a renderer that COULD look, is still a refusal */
  const awake = facade(world({}));
  const n = withEngine(awake, () => { const b = shaded.observe(); return shaded.verify({}, {}, b, shaded.observe(), { ok: true, html: '' }); });
  assert.equal(n.code, 'not_rendered');
  /* and a completion is never touched by the rule */
  const ok = withEngine(asleep, () => shaded.verify({}, {}, null, null, { ok: true, html: '' }));
  assert.equal(ok.status, 'completed');
  /* ⚠ ALL of them: every row that writes the map or the camera passes through the same rule */
  const rows = CAPS.all().filter((c) => (c.effects.writes || []).some((k) => /^(map|camera)\b/.test(k)));
  /* the filter's guard, not a policy: the rows this file's own tests exercise must be in it */
  for (const id of ['map.choropleth', 'sim.flyAnimate', 'routing.isochrone', 'view.flyTo']) assert.ok(rows.some((c) => c.id === id), `${id} fell out of the population`);
  for (const c of rows) {
    const r = withEngine(asleep, () => c.verify({}, {}, { same: 1 }, { same: 1 }, { ok: true, html: '' }));
    const out = (r && typeof r.then === 'function') ? null : r;
    if (!out || out.status !== 'partial') continue;
    assert.notEqual(out.code, 'not_rendered', `${c.id} called an unobservable map not_rendered`);
    assert.notEqual(out.code, 'no_change', `${c.id} called an unobservable map no_change`);
  }
});

/* ══ ③ THE UNDO ═════════════════════════════════════════════════════════════════════════════════ */

function stage() {
  const w = world({ 'nlq-fly-src': [] });
  const f = facade(w, [['nlq-fly-src', ['map.fly', 'map.ballistic'], () => { w.sources['nlq-fly-src'] = []; }]]);
  let objs = [{ id: 'pin1', kind: 'pin', name: 'Pin 1' }];
  const clock = { live: true, t: null };
  window.IntMapObjects = { list: () => objs.slice(), remove: (id) => { const n = objs.length; objs = objs.filter((o) => o.id !== id); return objs.length < n; } };
  window.IntMapTime = { isLive: () => clock.live, get: () => (clock.live ? null : new Date(clock.t)),
    set: (d) => { clock.live = false; clock.t = +d; }, setNow: () => { clock.live = true; clock.t = null; } };
  const S = makeAtlasState({});
  S.registerDefaultProviders({ GE: () => f });
  window.IntMapAtlasState = S;
  return { w, f, S, clock, objs: () => objs, addObj: (o) => { objs = objs.concat([o]); }, dropObj: (id) => { objs = objs.filter((o) => o.id !== id); } };
}

test('⑥ the changes one Atlas turn made — camera, clock, objects, drawings — go back with ONE operation', async () => {
  const s = stage();
  s.S.beginTurn(1, 'fly a missile from A to B, set the year to 1962, pin the launch site');
  /* what the turn does, through the same doors the capabilities use */
  s.w.cam = { lng: 10, lat: 50, zoom: 3, bearing: 20, pitch: 30 };
  window.IntMapTime.set(new Date('1962-10-16T00:00:00Z'));
  s.addObj({ id: 'pin2', kind: 'pin', name: 'Launch site' });
  s.w.sources['nlq-fly-src'] = feats(5);
  s.S.beginTurn(2, 'undo that');
  const u = await s.S.undo(2);
  assert.equal(u.ok, true);
  assert.equal(u.turnId, 1, 'the turn taken back is the one that changed the map');
  assert.deepEqual(u.unresolved, [], `sections that did not come back: ${u.unresolved}`);
  assert.deepEqual([s.w.cam.lng, s.w.cam.lat, s.w.cam.zoom, s.w.cam.bearing, s.w.cam.pitch], [139.7, 35.7, 5, 0, 0]);
  assert.equal(s.clock.live, true, 'the clock is back to live');
  assert.deepEqual(s.objs().map((o) => o.id), ['pin1'], 'the pin the turn added is gone, the reader\'s own pin stays');
  assert.equal(s.w.sources['nlq-fly-src'].length, 0, 'the drawn path is taken off by its claimant');
  /* ⚠ the SAME call again in the same turn is 「already done」, not a second rewind (one-pass §4) */
  const again = await s.S.undo(2);
  assert.equal(again.already, true);
  /* and the capability's verdict reads the map again rather than believing the dispatch */
  const cap = CAPS.resolve('map.undo');
  const v = cap.verify({}, {}, null, null, { ok: true, html: '', exec: { turnId: u.turnId, restored: u.restored, unresolved: u.unresolved } });
  assert.equal(v.status, 'completed');
  const dup = cap.verify({}, {}, null, null, { ok: true, html: '', exec: { already: true, turnId: 1 } });
  assert.equal(dup.code, 'already_there');
});

test('⑦ what cannot be put back is named, never claimed — an object the turn DELETED', async () => {
  const s = stage();
  s.S.beginTurn(1, 'delete my pin and move the map');
  s.dropObj('pin1');
  s.w.cam = { lng: 0, lat: 0, zoom: 2, bearing: 0, pitch: 0 };
  s.S.beginTurn(2, 'undo');
  const u = await s.S.undo(2);
  assert.equal(u.ok, true);
  assert.deepEqual(u.unresolved, ['objects'], 'a deleted object cannot be recreated from an id, and the undo must say so');
  assert.equal(s.w.cam.lng, 139.7, 'the rest still comes back');
  const v = CAPS.resolve('map.undo').verify({}, {}, null, null, { ok: true, html: '', exec: { turnId: 1 } });
  assert.equal(v.status, 'partial');
  assert.deepEqual(v.unresolved, ['objects']);
});

test('⑧ a turn that changed nothing is skipped, an undo is not itself undone, and nothing left is a refusal', async () => {
  const s = stage();
  s.S.beginTurn(1, 'zoom to Europe');
  s.w.cam = { lng: 10, lat: 50, zoom: 4, bearing: 0, pitch: 0 };
  s.S.beginTurn(2, 'what is the capital of France?');   /* answers in words, changes no section */
  s.S.beginTurn(3, 'undo');
  const u = await s.S.undo(3);
  assert.equal(u.turnId, 1, 'the question-only turn is not the one taken back');
  s.S.beginTurn(4, 'undo again');
  const v = await s.S.undo(4);
  assert.equal(v.ok, false, 'turn 3 was an undo and turn 1 is already undone — there is nothing further back');
  assert.equal(v.code, 'nothing_to_undo');
});

test('⑨ hasUndo is derived from the table: every declared effect is one the undo puts back WHOLE', () => {
  const J = CAPS.toJSON();
  const byId = Object.fromEntries(J.capabilities.map((c) => [c.id, c]));
  const U = CAPS.resolve('map.undo');
  assert.ok(U, 'map.undo is registered');
  assert.equal(U.observerKind, 'undo');
  const exact = new Set(CAPS.undoExact());
  for (const k of exact) assert.ok(U.effects.writes.includes(k), k + ' is declared restored but map.undo does not touch it');
  for (const c of J.capabilities) {
    if (c.id === 'map.undo' || c.withdrawn) continue;
    const inside = c.effects.writes.length > 0 && c.effects.writes.every((k) => exact.has(k));
    assert.equal(c.hasUndo, inside, c.id + ': hasUndo ' + c.hasUndo + ' but its effects ' + c.effects.writes + ' are ' + (inside ? '' : 'not ') + 'all restored whole');
  }
  assert.equal(byId['view.flyTo'].hasUndo, true);
  assert.equal(byId['map.clearAll'].hasUndo, false, 'a clear of everything cannot be recreated, and does not claim it can');
  assert.equal(typeof CAPS.resolve('map.highlight').undo, 'function');
});

/* ══ THE ORIGINAL DEFECT OF THE FIRST DRAFT: hasUndo:true WHILE THE UNDO COULD NOT PUT IT BACK ══════
   The first version of this work derived hasUndo from 「map.undo touches the effect」, so a forecast-model
   switch (map.layer), a pin deletion (map.object) and the 3-D volume (map.object) all read reversible —
   and the undo left them as they were without a word, because no snapshot held them. */

test('⑩ hasUndo:true means every effect is put back — each restored effect has a restorer that declares it whole', () => {
  /* the restorers this file can build are evaluated; the two js/atlas-console.js registers (it owns
     the layer panel and Atlas's own drawings, and needs the browser) are found where they are registered */
  const s = stage();
  const covers = s.S.restorerCovers();
  const declared = new Set(Object.values(covers).flat());
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const m of src.matchAll(/registerRestorer\('([\w.]+)',\s*\{\s*covers:\s*\[([^\]]*)\]/g)) {
      for (const k of m[2].matchAll(/'([\w.]+)'/g)) declared.add(k[1]);
    }
  }
  for (const k of CAPS.undoExact()) assert.ok(declared.has(k), k + ' is declared restored whole, and no restorer declares it');
  /* …and the ones this file can run really do come back */
  s.S.beginTurn(1, 'fly and set the year');
  s.w.cam = { lng: 1, lat: 2, zoom: 3, bearing: 4, pitch: 5 };
  window.IntMapTime.set(new Date('1900-01-01T00:00:00Z'));
  s.S.beginTurn(2, 'undo');
  return s.S.undo(2).then((u) => {
    assert.deepEqual(u.unresolved, []);
    assert.equal(s.w.cam.lng, 139.7);
    assert.equal(s.clock.live, true);
  });
});

test('⑪ what the undo could not put back is NAMED — from the turn ledger when no snapshot holds it', async () => {
  const s = stage();
  s.S.beginTurn(1, 'switch the temperature layer to ICON and zoom in');
  s.S.recordOperation(1, { capabilityId: 'data.wxModel', status: 'completed', args: { layer: 'temp', model: 'icon' } });
  s.w.cam = { lng: 5, lat: 45, zoom: 6, bearing: 0, pitch: 0 };
  s.S.recordOperation(1, { capabilityId: 'view.flyTo', status: 'completed', args: { lng: 5, lat: 45 } });
  s.S.recordOperation(1, { capabilityId: 'map.pin', status: 'completed', args: { place: 'x' } });
  s.addObj({ id: 'pin9', kind: 'pin', name: 'x' });
  s.S.recordOperation(1, { capabilityId: 'view.locate', status: 'failed', args: {} });   /* did nothing */
  s.S.beginTurn(2, 'undo');
  const u = await s.S.undo(2);
  assert.ok(u.unresolved.includes('data.wxModel'), 'the model switch was not put back, and the undo did not say so');
  assert.ok(!u.unresolved.includes('view.flyTo'), 'the camera came back — it is not unresolved');
  assert.ok(!u.unresolved.includes('map.pin'), 'the added pin was taken off — an addition it removed is not a failure');
  assert.ok(!u.unresolved.includes('view.locate'), 'an operation that failed changed nothing');
  assert.equal(s.w.cam.lng, 139.7);
  const v = CAPS.resolve('map.undo').verify({}, {}, null, null, { ok: true, html: '', exec: { turnId: 1 } });
  assert.equal(v.status, 'partial');
  assert.ok(v.unresolved.includes('data.wxModel'));
  /* a turn that changed ONLY what no snapshot holds is still the turn taken back — and named, not 「nothing to undo」 */
  const t = stage();
  t.S.beginTurn(1, 'use the ICON model');
  t.S.recordOperation(1, { capabilityId: 'data.wxModel', status: 'completed', args: {} });
  t.S.beginTurn(2, 'undo');
  const w = await t.S.undo(2);
  assert.equal(w.ok, true);
  assert.deepEqual(w.unresolved, ['data.wxModel']);
});
