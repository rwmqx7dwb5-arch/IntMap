/* ============================================================================
 *  IntMap · what the historical border layer puts on screen — its layers and sources, one name per
 *  country, the sentence that says what is drawn, and how a source's precision is shown
 *  (js/time-borders.js, evaluated)
 *  (consolidated from tests/r520, r531 ⑤ (the two layer-wiring checks), r682-hist-eras-note,
 *   r705-chronos-border-precision and r711-label-visibility; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R520 「昔の国名ラベルが1国につき何十個も出る。」 — `imtb-lbl`/`imtb-lbl2` drew their text from the
 *  border POLYGONS, and maplibre-gl places one anchor per outer RING: at 1900-07-01, 151 features and
 *  1,583 outer rings (Japan 30 candidates, Canada 268). #R531 split the stroked outline off onto its own
 *  line source so the record's copy of the coast is not drawn as a border. #R682 — the era layer states
 *  what it is drawing (world_bc123000 draws Homo heidelbergensis, not polities), with the numbers
 *  counted off the drawn collection. #R705 — a source's own border precision survives into the map and
 *  the popup and is shown as a dash, never invented. #R711 — a visible, uncollided name stays eligible
 *  above the old zoom cutoffs.
 *
 *  ⚠ THE MODULE IS EVALUATED, NOT READ (#R505). js/time-borders.js is loaded into a vm context with the
 *  shipped data/hist-eras.js; a recording engine captures the layer specs and source writes the module
 *  makes; #R520's label arithmetic is lifted out and run over a real CShapes snapshot. The stubs are
 *  deliberately inert (#R585: a stub richer than the real thing repairs bugs in passing).
 *  ⚠ The two other bundles are honestly absent in this context: data/cshapes.js and
 *  data/hist-borders.js arrive by <script> tag and every such tag fails here — the real degraded path.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { validateStyleMin, createExpression } from '@maplibre/maplibre-gl-style-spec';
import { transformSync } from 'esbuild';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const TB = rd('js/time-borders.js');
const TBC = codeOnly(TB);

/* the nine positions the app resolves a tuple by, in the order js/time-admin1.js records */
const SLOT = { en: 0, jp: 1, de: 2, ru: 3, es: 4, zh: 5, 'zh-hans': 6, fr: 7, ko: 8 };

/* the module, evaluated, with the era bundle published and the renderer an inert proxy */
function loadModule(lang = 'en') {
  const noop = () => {};
  const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  const win = {
    addEventListener: noop, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0,
    IntMapModules: {}, IntMapGeoEngine: chain, IntMapTime: { on: noop },
    document: {
      getElementById: () => null,
      createElement: () => { const el = {}; queueMicrotask(() => { try { el.onerror && el.onerror(); } catch (_) {} }); return el; },
      head: { appendChild: noop },
    },
    IntMapLang: {
      pickArgs: () => ((...a) => a),
      pick: (get) => ({ arr: (a) => a[SLOT[get()] ?? 0] }),
      htmlTag: (l) => (l === 'zh' ? 'zh-Hant' : l === 'jp' ? 'ja' : l === 'zh-hans' ? 'zh-Hans' : l),
      t: (_l, ...r) => r[0], index: () => ({}),
    },
    /* the era word is the platform's (js/hist-scale.js); this context has Intl, so use the owner */
    IntMapHistScale: null,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(rd('js/hist-scale.js'), ctx);
  vm.runInContext(rd('data/hist-eras.js'), ctx);
  vm.runInContext(rd('js/hist-bundles.js'), ctx);   /* (hist-bundles-off-main) the door the module opens its records through */
  vm.runInContext(TB, ctx);
  const HOST = { lang, canDraw: () => false, isMobile: () => false };
  return { mod: ctx.window.IntMapModules.timeBorders(HOST), bundle: ctx.window.__HISTERAS, HOST, win, ctx };
}

/* the same module with a drawable style: a recording engine captures every layer spec, every source
   spec and every source write, then the deepest era sheet is drawn. `defs`/`sources`/`writes` are
   what the module asked the renderer to hold. */
async function drawnLayers() {
  const { mod, bundle, HOST, win, ctx } = loadModule();
  /* the name layers take their size from the real js/label-scale.js (the page evaluates it before any layer is added) */
  vm.runInContext(rd('js/label-scale.js'), ctx);
  const defs = new Map(), sources = new Map(), writes = [];
  const noop = () => {};
  const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  win.IntMapGeoEngine = new Proxy({ layers: { has: id => defs.has(id), hasSource: id => sources.has(id),
    add: def => defs.set(def.id, def), addSource: (id, def) => sources.set(id, def),
    setSourceData: (id, data) => writes.push([id, data]) } },
    { get: (t, k) => k in t ? t[k] : chain });
  win._applyBorders = noop; HOST.canDraw = () => true;
  await mod._go(bundle.snaps[0].y);
  return { mod, bundle, defs, sources, writes };
}
async function borderLayer() {
  const { defs } = await drawnLayers();
  assert.ok(defs.has('imtb-line'));
  return JSON.parse(JSON.stringify(defs.get('imtb-line')));
}
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ══ #R520 — 一国につき一つ: the era country names were made per RING ═════════════════════════
   ⚠ THE OLD SHAPE PASSED EVERY EXISTING GATE (tests/r309 compared the declared style key by key, and
   tests/r410 read the drawn text) — both true ABOUT A LAYER MAKING FORTY COPIES OF IT. So `_labelFC`
   and its helpers are LIFTED and run over a real CShapes snapshot, beside the per-ring rule the
   renderer used to apply, so the file demonstrates the gap it guards. */
const lift = (name) => {
  try { return liftFunction(TBC, name); }
  catch (e) { assert.fail('js/time-borders.js: ' + e.message); }
};
const NEEDED = ['_ringArea', '_partsOf', '_ringKm2', '_partKm2', '_partMid', '_gcKm',
                '_segD2', '_polyD', '_qPush', '_qPop', '_pole', '_thinRing',
                '_anchor', '_labelFC', '_bbox', '_contains', '_interiorPts'];
const sandbox = { WeakMap, Map, Math, Infinity, String, Array, Number, isFinite, JSON, Object };
vm.createContext(sandbox);
/* ⚠ (#R707) the module's own constants come across with the functions, READ rather than retyped */
const constOf = (name) => {
  let k = -1;
  for (let p = TBC.indexOf(name); p >= 0; p = TBC.indexOf(name, p + 1)) {
    const before = p === 0 ? ' ' : TBC[p - 1];
    if (/[A-Za-z0-9_$]/.test(before)) continue;
    let q = p + name.length;
    while (q < TBC.length && TBC[q] === ' ') q++;
    if (TBC[q] !== '=' || TBC[q + 1] === '=') continue;
    k = q + 1; break;
  }
  if (k < 0) assert.fail('js/time-borders.js: no declaration of ' + name);
  let e = k;
  while (e < TBC.length && TBC[e] !== ',' && TBC[e] !== ';') e++;
  return TBC.slice(k, e).trim();
};
vm.runInContext('var _R_KM=' + constOf('_R_KM') + ', _D2R=' + constOf('_D2R')
  + ', _KM2_PER_DEG2=' + constOf('_KM2_PER_DEG2') + ', _LBL_MIN_KM2=' + constOf('_LBL_MIN_KM2')
  /* ⚠ `_discKm` is an arrow bound to a const, so it comes across as a value like the numbers beside it */
  + ', _discKm=' + constOf('_discKm') + ';', sandbox);
vm.runInContext('var _lblParts = new WeakMap();\n' + NEEDED.map(lift).join('\n') + '\nvar LBL = _labelFC;', sandbox);
const labelFC = sandbox.LBL;

/* the real snapshot: CShapes at 1900-07-01, decoded the way csFC decodes it */
const CS = (() => { const w = {}; new Function('window', rd('data/cshapes.js'))(w); return w.__CSHAPES; })();
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const snapshot = (Y) => {
  const t = ymd(Y, 7, 1), feats = [];
  for (const f of CS.feats) {
    if (ymd(f[2], f[3], f[4]) > t || ymd(f[5], f[6], f[7]) < t) continue;
    const polys = f[8].map((poly) => poly.map((ri) => CS.rings[ri]));
    const geometry = (polys.length === 1) ? { type: 'Polygon', coordinates: polys[0] }
                                          : { type: 'MultiPolygon', coordinates: polys };
    feats.push({ type: 'Feature', geometry, properties: { NAME: f[0], name: f[0], _gw: f[1] } });
  }
  return { type: 'FeatureCollection', features: feats };
};
const FC = snapshot(1900);
const outerRings = (fc) => fc.features.reduce((n, f) =>
  n + (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length), 0);
/* an INDEPENDENT point-in-polygon — deliberately not the module's `_polyD` */
const inRing = (x, y, r) => { let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) hit = !hit;
  } return hit; };
const inGeom = (x, y, g) => {
  const polys = (g.type === 'Polygon') ? [g.coordinates] : g.coordinates;
  for (const p of polys) { if (!inRing(x, y, p[0])) continue;
    let hole = false; for (let k = 1; k < p.length; k++) if (inRing(x, y, p[k])) { hole = true; break; }
    if (!hole) return true; }
  return false; };

test('R520 ①: _labelFC answers a snapshot with no more than one anchor per outer ring', () => {
  const out = labelFC(FC);
  assert.ok(Array.isArray(out.features), '_labelFC did not return a FeatureCollection');
  const names = FC.features.map((f) => String(f.properties.NAME || '').trim()).filter(Boolean);
  const distinct = new Set(names);
  assert.ok(distinct.size > 100, 'the 1900 snapshot decoded to ' + distinct.size + ' countries — the fixture is wrong, not the code');
  /* ⚠⚠⚠ (#R707) THIS USED TO SAY «EXACTLY ONE ANCHOR PER COUNTRY», which also silenced every territory
     a polity holds on another continent (French Algeria 410,285 km², Alaska, Russian America, Danish
     Greenland, Ottoman Tripolitania drawn with no name). The invariant is restated as the DEFECT: an
     anchor per island is forbidden, measured by islands. Which extra territories qualify is measured
     elsewhere (tests/r707-chronos-labelplacement), not restated here (#R536). */
  const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));
  const seen = new Map();
  for (const f of out.features) {
    const nm = String(f.properties.NAME || '');
    assert.equal(f.geometry.type, 'Point', nm + ' is not a Point — the labels would be per-ring again');
    if (!seen.has(nm)) seen.set(nm, []);
    seen.get(nm).push(f.geometry.coordinates);
  }
  /* …and no country lost one */
  for (const nm of distinct) assert.ok(seen.has(nm), nm + ' lost its name label entirely');
  assert.equal(new Set([...seen.keys()]).size, distinct.size, 'a label appeared for a name no polygon carries');
  /* ⚠ the #R520 defect itself: two anchors of one country may never land in the SAME island */
  for (const [nm, pts] of seen) {
    if (pts.length < 2) continue;
    const rings = FC.features.filter((g) => String(g.properties.NAME || '') === nm)
      .flatMap((g) => ringsOf(g.geometry));
    const home = pts.map(([x, y]) => rings.findIndex((r) => inRing(x, y, r)));
    const dup = home.filter((h, k) => h >= 0 && home.indexOf(h) !== k);
    assert.equal(dup.length, 0, nm + ' put two anchors inside the same outer ring — that is the per-island rule again');
  }
  /* ⚠ and the SCALE: MEASURED 1900 — 151 countries, 1,583 outer rings, 154 anchors */
  assert.ok(out.features.length < distinct.size * 1.5,
    out.features.length + ' anchors for ' + distinct.size + ' countries — the rule is multiplying labels');
  assert.ok(out.features.length < outerRings(FC) / 4,
    out.features.length + ' anchors against ' + outerRings(FC) + ' outer rings — this is the per-island rule');
  /* ③ every anchor is really on its own country's land */
  for (const f of out.features) {
    const nm = String(f.properties.NAME || '');
    const src = FC.features.filter((g) => String(g.properties.NAME || '') === nm);
    const [x, y] = f.geometry.coordinates;
    assert.ok(src.some((g) => inGeom(x, y, g.geometry)),
      nm + ' is labelled at ' + x.toFixed(2) + ',' + y.toFixed(2) + ' — a point that is not inside it');
  }
  /* the properties are the ones the two layers filter and read, carried over untouched */
  const jp = out.features.find((f) => f.properties.NAME === 'Japan');
  assert.ok(jp, 'Japan is not labelled at 1900');
  assert.equal(jp.properties._gw, 740, 'the anchor dropped the CShapes code the click resolver reads');
});

/* ⚠⚠⚠ THIS IS NOT TIDINESS. js/geo-command-log.js `_sourceHolds` skips a write whose payload the
   source already holds («an object that was mutated is the same object»), and `tagSame` mutates each
   feature's properties IN PLACE when the late identities land (#R410). Share the reference and the
   push that should correct the label is dropped one layer below — measured at 1916. */
test('R520 ②: a point carries a COPY of the properties, not the polygon’s own object', () => {
  const one = FC.features.find((f) => f.properties.NAME === 'Japan');
  const fc = { type: 'FeatureCollection', features: [one] };
  const pt = labelFC(fc).features[0];
  assert.ok(pt, 'Japan produced no anchor');
  assert.notEqual(pt.properties, one.properties, 'the point shares the polygon’s properties object');
  /* stated as the behaviour: mutate the source the way tagSame does, and the built point must NOT follow */
  const was = one.properties._modName;
  one.properties._modName = 'MUTATED';
  assert.notEqual(pt.properties._modName, 'MUTATED',
    'mutating the polygon changed a point that was already handed to the renderer — the next write will compare equal and be skipped');
  /* …and a REBUILD must pick the new value up, or the labels would never follow the identities at all */
  assert.equal(labelFC(fc).features[0].properties._modName, 'MUTATED', 'a rebuild does not read the current tags');
  if (was === undefined) delete one.properties._modName; else one.properties._modName = was;
});

/* one candidate is one chance, so the one candidate may step aside: «German Empire» vanished at 1916
   the moment the duplicates went, its pole landing on `ofm-city`'s «Frankfurt am Main» */
test('R520 ②: the single label is allowed to move rather than be dropped', async () => {
  /* EVALUATED (was: regexes over `_ERAVAR` and the two layer literals). The layer specs the module
     hands the renderer are captured and their placement is read. */
  const { defs } = await drawnLayers();
  const specs = ['imtb-lbl', 'imtb-lbl2'].map((id) => { assert.ok(defs.has(id), id + ' was never added'); return plain(defs.get(id)); });
  for (const s of specs) {
    const L = s.layout || {};
    assert.ok(Array.isArray(L['text-variable-anchor']) && L['text-variable-anchor'].length > 1,
      s.id + ' has no alternative placements: a country whose anchor is blocked now loses its name outright');
    assert.equal(L['text-justify'], 'auto',
      "text-justify must be 'auto' with variable anchors, or a wrapped name keeps centre justification while sitting beside its anchor");
    assert.ok(L['text-radial-offset'] > 0, 'the alternative placements have no offset, so they are all the same placement');
  }
  /* the variable-anchor block is one declaration shared by both layers */
  const pick = (L) => ({ a: L['text-variable-anchor'], o: L['text-radial-offset'], j: L['text-justify'] });
  assert.deepEqual(pick(specs[0].layout), pick(specs[1].layout), 'the two name layers do not take the shared variable-anchor block');
});

test('R520 ②: the renderer’s own per-ring rule would have made ten times as many', () => {
  /* maplibre-gl, symbol_bucket addFeature: one anchor per OUTER RING — the rule `source:'imtb-src'`
     was handing the labels */
  const perRing = outerRings(FC);
  const perCountry = labelFC(FC).features.length;
  assert.ok(perRing > perCountry * 5,
    'the fixture no longer exhibits the defect (' + perRing + ' rings vs ' + perCountry + ' countries) — this check has stopped measuring anything');
  const rings = (nm) => { const f = FC.features.find((g) => g.properties.NAME === nm);
    return f ? (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length) : 0; };
  assert.ok(rings('Japan') > 10, 'Japan no longer has the archipelago that produced the thicket');
  assert.ok(rings('Korea') > 1, 'Korea no longer has the islands that produced the thicket');
});

test('R520 ③: neither name layer reads the border polygons any more', async () => {
  /* EVALUATED (was: regexes over the layer literals and `addSource('imtb-lbl-src'`). */
  const { defs, sources, writes } = await drawnLayers();
  for (const id of ['imtb-lbl', 'imtb-lbl2']) {
    const d = defs.get(id);
    assert.ok(d && d.type === 'symbol', id + ' is not declared as a symbol layer any more');
    assert.equal(d.source, 'imtb-lbl-src',
      id + " reads '" + d.source + "' — a polygon source gives one label PER RING, which is the whole defect");
  }
  assert.ok(sources.has('imtb-lbl-src'), 'the point source is never created');
  /* it is a point source derived from the polygons, not a second fetch of the same data */
  const pts = writes.filter(([id]) => id === 'imtb-lbl-src').at(-1);
  assert.ok(pts && pts[1].features.length > 0, 'the drawn sheet pushed no label points');
  assert.ok(pts[1].features.every((f) => f.geometry && f.geometry.type === 'Point'), '_labelFC does not emit Point geometry');
});

test('R520 ③: every push of the borders pushes the names with them', async () => {
  /* ⚠ THE FAILURE THIS GUARDS is silent: the borders move to 1914 and the names stay at 1939, because
     they are two sources (three since #R531) and only one of them was written.
     ⚠ SPELLING, ON PURPOSE, FOR «EVERY SITE»: the five writes of `imtb-src` are apply()'s two paths,
     clear(), the late-identity re-tag (#R410) and the styledata rebuild — several are reachable only
     from a live renderer's events. The window is measured from the file (the widest site plus a
     margin), so a fourth companion write cannot silently un-check the other two. */
  const sites = [...TBC.matchAll(/setSourceData\('imtb-src'/g)].map((m) => m.index);
  assert.ok(sites.length >= 5, 'js/time-borders.js writes imtb-src at ' + sites.length + ' sites — fewer than the five this check was written against');
  const WIN = 420;
  for (const [what, re] of [['the names', /_pushLbl\(|setSourceData\('imtb-lbl-src'/], ['the outline', /setSourceData\('imtb-ln-src'/]]) {
    const missed = sites.filter((i) => !re.test(TBC.slice(i, i + WIN)));
    assert.equal(missed.length, 0, missed.length + ' of the ' + sites.length +
      ' imtb-src writes do not push ' + what + ' with them — those will keep showing the previous year: ' +
      missed.map((i) => JSON.stringify(TBC.slice(i, i + 60))).join(' / '));
  }
  /* clear() must empty ALL THREE — EVALUATED (was: two regexes over clear()'s body): a drawn sheet is
     cleared and what the module writes to each source afterwards is read back. */
  const { mod, writes } = await drawnLayers();
  const before = writes.length;
  mod._clear();
  const after = new Map(writes.slice(before).map(([id, d]) => [id, d]));
  for (const id of ['imtb-src', 'imtb-lbl-src', 'imtb-ln-src']) {
    assert.ok(after.has(id), 'returning to Now does not write ' + id + ' — ' + (id === 'imtb-lbl-src'
      ? 'the era names are left on the map' : id === 'imtb-ln-src' ? 'the era border LINE is left on the present map (#R531)' : 'the era polygons are left'));
    assert.equal(after.get(id).features.length, 0, id + ' is not emptied on the return to Now');
  }
});

test('R520 ③: the anchor is cached on the geometry, so a decade of travel pays once', () => {
  /* ⚠ (#R707) THE CACHE IS PER GEOMETRY: `_partsOf` memoizes the geometry's PARTS. The store's
     spelling is read out of the module rather than fixed here (#R488).
     ⚠ SPELLING, ON PURPOSE, FOR THE STORE: that it is consulted is also MEASURED below (the second
     pass over a never-seen geometry may only re-read it). */
  const store = (() => { const p = TBC.indexOf('const _lbl'); if (p < 0) return null; let q = p + 6, out = ''; while (/[A-Za-z0-9_$]/.test(TBC[q])) out += TBC[q++]; return TBC.slice(q).startsWith('=(typeof WeakMap') ? out : null; })();
  assert.ok(store, 'the anchor cache is gone — every year change would re-solve every country');
  const producer = lift('_partsOf');
  assert.ok(producer.includes(store + '.has(geom)') && producer.includes(store + '.set(geom'),
    '_partsOf no longer reads and writes ' + store);
  /* …and it really is cached: Canada (268 rings) deep-cloned into a geometry the cache has never seen */
  const canada = FC.features.find((f) => f.properties.NAME === 'Canada');
  const fresh = { type: 'FeatureCollection', features: [JSON.parse(JSON.stringify(canada))] };
  const t0 = process.hrtime.bigint(); const a1 = labelFC(fresh); const cold = Number(process.hrtime.bigint() - t0);
  const t1 = process.hrtime.bigint(); const a2 = labelFC(fresh); const warm = Number(process.hrtime.bigint() - t1);
  assert.deepEqual(a2.features[0].geometry.coordinates, a1.features[0].geometry.coordinates, 'the cached anchor is not the computed one');
  assert.ok(warm * 8 < cold, 'the second pass over the same geometry cost ' + warm + 'ns against ' + cold + 'ns — nothing was cached');
});

/* ══ #R531 ⑤ — the wiring: the line the reader sees is the line source ══════════════════════════
   「昔の国境は海岸より先まであるのが気持ち悪い。」 A political record's ring is borders welded to the
   polity's own copy of the coastline; data/border-coast.js marks which edges are which, and only the
   border runs are stroked (tests/history-border-coast-checks holds the marks themselves). */
test('#R531 ⑤ imtb-line strokes the line source and imtb-fill still holds the polygons', async () => {
  /* EVALUATED (was: regexes over ensure()'s layer literals) */
  const { defs } = await drawnLayers();
  const line = defs.get('imtb-line'), fill = defs.get('imtb-fill');
  assert.ok(line && fill, 'imtb-line / imtb-fill are not added');
  assert.equal(line.source, 'imtb-ln-src', 'imtb-line is stroking the polygons again — the coastline copy is back');
  assert.equal(fill.source, 'imtb-src', 'imtb-fill must keep the polygons: it is the click target and the label anchors');
});

test('#R531 ⑤ the source that draws carries the credit', async () => {
  /* the attribution used to hang on imtb-src because imtb-src was what drew. It is not any more.
     EVALUATED (was: a slice of ensure()'s text around `addSource('imtb-ln-src'`). */
  const { sources } = await drawnLayers();
  const ln = sources.get('imtb-ln-src');
  assert.ok(ln, 'imtb-ln-src is never added');
  assert.ok(ln.attribution, 'the line the reader sees comes from a source that credits nobody');
  for (const who of ['CShapes', 'OpenHistoricalMap']) assert.ok(ln.attribution.includes(who), who + ' is not credited on the line source');
});

/* ══ #R682 — THE ERA LAYER SAYS WHAT IT IS DRAWING ════════════════════════════════════════════
   「歴史国境レイヤーが『いま何を描いているか』を地図の上で述べるようにしてください。」
   ⚠ THE SENTENCE'S NUMBERS ARE THE DRAWN COLLECTION'S NUMBERS — a check that read the source for a
   literal «141» would be green on the day the sentence and the lines disagreed (#R669).
   ⚠ NOT MEASURED: the spelling of any sentence (#R488), and whether js/map-ui.js paints `opts.sub`
   on screen (a rendering fact, measured in a browser on the built site). */
test('#R682 ① the sentence exists only while the snapshot tier is what is drawn', async () => {
  const { mod } = loadModule();
  assert.equal(mod.note(), '', 'a live clock draws no era snapshot, so there is nothing to state');
  assert.equal(mod.coverage().era, false);
  await mod._go(-122999);
  assert.notEqual(mod.note(), '', 'travelling to a bundled sheet must produce the sentence');
  assert.equal(mod.coverage().era, true);
  mod._clear();
  assert.equal(mod.note(), '', 'returning to Now must retract it — the row may not state a date the map has left');
});

test('#R682 ② the numbers are counted off the collection on the source, not typed', async () => {
  const { mod, bundle } = loadModule();
  /* every bundled sheet, so this cannot pass by being right about one of them */
  for (const snap of bundle.snaps) {
    await mod._go(snap.y);
    const c = mod.coverage();
    assert.equal(c.era, true, `sheet ${snap.key} must be drawn by the snapshot tier`);
    assert.equal(c.year, snap.y, `${snap.key}: the sentence names the sheet that answered`);
    const fc = mod.currentFC();
    assert.equal(c.feats, fc.features.length, `${snap.key}: shape count is the drawn collection's`);
    assert.equal(c.named + c.blank, c.feats, `${snap.key}: every shape is either named or not`);
    assert.equal(c.named, snap.feats.length, `${snap.key}: named count is upstream's own`);
    assert.equal(c.blank, (snap.blank || []).length, `${snap.key}: unnamed count is upstream's own`);
    assert.ok(c.blank > 0, `${snap.key}: upstream leaves shapes unnamed in every sheet it publishes`);
  }
});

test('#R682 ③ the neighbouring sheets are read out of the record, so the gaps are not typed anywhere', async () => {
  const { mod, bundle } = loadModule();
  const ys = bundle.snaps.map((s) => s.y).slice().sort((a, b) => a - b);
  await mod._go(ys[0]);
  let c = mod.coverage();
  assert.equal(c.prev, null, 'the deepest sheet has nothing before it');
  assert.equal(c.next, ys[1], 'and its neighbour is whatever the record publishes next');
  /* ⚠ THE 113,000-YEAR HOLE, DERIVED — a relation between two entries of the shipped record */
  assert.ok(c.next - c.year > 100000, 'and there is nothing at all between the two deepest sheets');
  await mod._go(ys[ys.length - 1]);
  c = mod.coverage();
  assert.equal(c.next, null, 'the newest sheet has nothing after it');
  assert.equal(c.prev, ys[ys.length - 2]);
});

test('#R682 ④ upstream classifies the shapes or it does not, and nothing is invented for the rest', async () => {
  const { mod, bundle } = loadModule();
  let sheetsWithType = 0, classified = 0;
  for (const snap of bundle.snaps) {
    await mod._go(snap.y);
    const c = mod.coverage();
    /* the record's own answer, computed here independently of the module */
    const want = new Map();
    for (const f of snap.feats) { const t = f[1] && f[1].t; if (t) want.set(String(t), (want.get(String(t)) || 0) + 1); }
    assert.deepEqual(new Map(c.types), want, `${snap.key}: the classification tally is upstream's`);
    const n = c.types.reduce((s, e) => s + e[1], 0);
    if (n) { sheetsWithType++; classified += n; }
    assert.ok(n <= c.feats, `${snap.key}: cannot classify more shapes than are drawn`);
  }
  assert.ok(sheetsWithType > 0 && sheetsWithType < bundle.snaps.length,
    'upstream classifies some sheets and not others — both branches of the sentence are reachable');
  assert.ok(classified > 0 && classified < 1000,
    'and it classifies a small minority of what it publishes, which is why the sentence says so');
  /* the deepest sheet classifies nothing at all (`.length`: the array is another realm's) */
  await mod._go(bundle.snaps.map((s) => s.y).sort((a, b) => a - b)[0]);
  assert.equal(mod.coverage().types.length, 0, 'nothing is asserted about Neanderthal or Homo heidelbergensis');
});

test('#R682 ⑤ the sentence is nine different sentences, and every one carries the counted numbers', async () => {
  const langs = Object.keys(SLOT);
  const seen = new Set();
  for (const lang of langs) {
    const { mod } = loadModule(lang);
    await mod._go(-9999);           /* a sheet that has both unnamed shapes and classified ones */
    const c = mod.coverage(), n = mod.note();
    assert.ok(n && n.length > 60, `${lang}: the row carries a sentence`);
    assert.ok(!seen.has(n), `${lang}: a language that repeats another's text is an untranslated slot`);
    seen.add(n);
    assert.ok(n.includes(String(c.feats)), `${lang}: states how many shapes are drawn`);
    assert.ok(n.includes(String(c.blank)), `${lang}: states how many upstream leaves unnamed`);
    for (const [val, count] of c.types) {
      assert.ok(n.includes(val), `${lang}: upstream's own word «${val}» appears verbatim`);
      assert.ok(n.includes(String(count)), `${lang}: with the count it was measured at`);
    }
    /* the era word is the platform's, and it is not the astronomical number (#R679) */
    assert.ok(!n.includes('-9999') && !n.includes('−9999'), `${lang}: no reader is shown «−9999»`);
  }
  assert.equal(seen.size, langs.length);
});

test('#R682 ⑥ the classification of one shape is upstream\'s word, or nothing', () => {
  const { mod } = loadModule();
  assert.equal(mod.typeNote({ properties: { NAME: 'Neanderthal' } }), '',
    'a shape upstream did not classify gets no line rather than a guess');
  assert.equal(mod.typeNote(null), '');
  assert.equal(mod.typeNote({ properties: { TYPE: '   ' } }), '', 'blank text is not a classification');
  for (const spelling of ['TYPE', 'type']) {
    /* upstream writes the same field both ways across its own files (48 / 93) */
    const out = mod.typeNote({ properties: { [spelling]: 'hunter-gatherers' } });
    assert.ok(out.includes('hunter-gatherers'), `the «${spelling}» spelling is read, verbatim`);
    assert.ok(out.length > 'hunter-gatherers'.length, 'and it is marked as upstream\'s word, not a name');
  }
  const nine = new Set(Object.keys(SLOT).map((l) => loadModule(l).mod.typeNote({ properties: { TYPE: 'culture' } })));
  assert.equal(nine.size, 9, 'all nine languages carry their own wording for «upstream says»');
});

test('#R682 ⑦ a day-exact tier answering must not be described as a snapshot', async () => {
  const { mod } = loadModule();
  /* 1900 is inside CShapes' band; its bundle is absent here, so the era tier answers — the point is
     the PREDICATE: the sentence only describes a collection `shownY` identifies as a snapshot */
  await mod._go(1900);
  const c = mod.coverage();
  assert.equal(typeof mod.current(), 'number', 'the aourednik tier keys the year itself');
  assert.equal(c.era, true);
  assert.equal(c.year, 1900);
  /* and the reader's own year travels beside the sheet's, which is how a mid-gap year is honest */
  await mod._go(1907);
  assert.equal(mod.coverage().asked, 1907, 'the year asked for is kept');
  assert.notEqual(mod.coverage().year, 1907, 'while the sheet drawn is the one upstream published');
});

/* ══ #R705 — a source's border precision, from the record to the stroke ══════════════════════ */
test('#R705 shipped era precision survives decoding into map and popup features', async () => {
  const { mod, bundle } = loadModule();
  const snap = bundle.snaps.find(s => s.y < 0 && s.feats.some(f => f[1].bp != null));
  await mod._go(snap.y);
  const fc = mod.currentFC();
  let checked = 0;
  for (const ft of snap.feats) {
    if (ft[1].bp == null) continue;
    const f = fc.features.find(f => f.properties.NAME === ft[0].en);
    assert.ok(f);
    assert.equal(f.properties.BORDERPRECISION, ft[1].bp);
    assert.ok(mod.typeNote(f).includes('approximate'));
    checked++;
  }
  assert.ok(checked > 0);
});
test('#R705 polygon to coast-trimmed lines preserves source properties', () => {
  const win = { __IMBCOAST: { sets: {} } }; win.window = win;
  vm.runInNewContext(rd('js/border-coast.js'), win);
  const properties = { NAME: 'source feature', BORDERPRECISION: 2, TYPE: 'region' };
  const f = { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };
  const lines = win.IntMapBorderCoast.wholeLines({ type: 'FeatureCollection', features: [f] });
  assert.equal(lines.features.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(lines.features[0].properties)), properties);
  assert.notEqual(lines.features[0].properties, properties);
});
test('#R705 precision note uses source semantics and never invents a classification', () => {
  for (const lang of ['en', 'jp']) {
    const { mod } = loadModule(lang);
    const notes = [1, 2, 3].map(bp => mod.typeNote({ properties: { BORDERPRECISION: bp } }));
    assert.equal(new Set(notes).size, 3);
    assert.ok(notes.every(Boolean));
    assert.match(notes[2], lang === 'jp' ? /国際法/ : /international law/);
    assert.equal(mod.typeNote({ properties: { BORDERPRECISION: 99 } }), '');
    assert.equal(mod.typeNote({ properties: {} }), '');
  }
});
test('#R705 unnamed geometry retains its own source precision without gaining a name', async () => {
  const { mod, bundle } = loadModule();
  let checked = 0;
  for (const snap of bundle.snaps.filter(s => s.y < 0)) {
    assert.equal(snap.blankPrecision.length, snap.blank.length);
    await mod._go(snap.y);
    const blank = mod.currentFC().features.filter(f => f.properties.NAME === '');
    assert.equal(blank.length, snap.blank.length);
    for (let i = 0; i < blank.length; i++) {
      assert.equal(blank[i].properties.BORDERPRECISION, snap.blankPrecision[i]);
      assert.equal(blank[i].properties.TYPE, undefined);
      checked++;
    }
  }
  assert.ok(checked > 0);
});
test('#R705 actual border style validates and distinguishes source precision with visible strokes', async () => {
  const layer = await borderLayer();
  const errors = validateStyleMin({ version: 8, sources: { 'imtb-ln-src': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } }, layers: [layer] });
  assert.deepEqual(errors, []);
  /* (maplibre-6-migration) style-spec 26 takes the expression's location in the style as its SECOND argument */
  const expression = createExpression(layer.paint['line-dasharray'], 'layers[0].paint.line-dasharray');
  assert.equal(expression.result, 'success');
  const readDash = bp => expression.value.evaluate({ zoom: 4 }, { properties: bp == null ? {} : { BORDERPRECISION: bp } });
  assert.deepEqual(readDash(1), [2, 2]); assert.deepEqual(readDash(2), [6, 2]);
  assert.deepEqual(readDash(3), [1, 0]); assert.deepEqual(readDash(null), [1, 0]);
  assert.equal(layer.paint['line-opacity'], 0.95);
});
test('#R705 historical theme updates choose a contrasting stroke and leave Now untouched', () => {
  const win = {}; win.window = win;
  vm.runInNewContext(transformSync(rd('js/border-style.js'), { format: 'iife' }).code, win);
  const borderColor = win.IntMapBorderStyle.colorFor;
  vm.runInNewContext(rd('js/historical-basemap.js'), win);
  const paint = [];
  const engine = { layers: { hasSource: () => true, has: () => true, setPaint: (...a) => paint.push(a), setLayout: () => {} }, scene: { getStyle: () => ({ layers: [] }) } };
  win.IntMapHistoricalBasemap.apply(engine, { active: true, sat: false, light: true });
  assert.equal(paint.find(a => a[0] === 'imtb-line')[2], borderColor(true));
  paint.length = 0; win.IntMapHistoricalBasemap.apply(engine, { active: true, sat: false, light: false });
  assert.equal(paint.find(a => a[0] === 'imtb-line')[2], borderColor(false));
  assert.notEqual(borderColor(true), borderColor(false));
  assert.equal(borderColor(true, true), borderColor(false));
  paint.length = 0; win.IntMapHistoricalBasemap.apply(engine, { active: false, sat: false, light: true });
  assert.equal(paint.length, 0);
});
test('#R705 Cesium preserves dash ratios and represents zero gaps with solid material', async () => {
  const win = {}; win.window = win;
  vm.runInNewContext(rd('js/cesium-style.js'), win);
  vm.runInNewContext(rd('js/cesium-layers.js'), win);
  class Color { constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); } }
  class Dash { constructor(opts) { Object.assign(this, opts); } }
  class Source { constructor() { this.entities = { values: [], suspendEvents() {}, resumeEvents() {}, removeAll() { this.values = []; }, add(e) { this.values.push(e); return e; } }; } }
  const C = { Matrix4: class {}, Cartesian4: class {}, Cartesian2: class {}, Color, PolylineDashMaterialProperty: Dash, CustomDataSource: Source, Cartesian3: { fromDegreesArray: a => a }, ArcType: { GEODESIC: 1 } };
  const renderer = win.IntMapCesiumLayers.makeVectorRenderer(C), layer = await borderLayer();
  const feature = bp => ({ type: 'Feature', properties: { BORDERPRECISION: bp }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } });
  const ds = renderer.build(layer, [1, 2, 3].map(feature), { zoom: 4, maxFeatures: 10 });
  const materials = ds.entities.values.map(e => e.polyline.material);
  assert.equal(materials.length, 3);
  assert.ok(materials[0] instanceof Dash); assert.ok(materials[1] instanceof Dash); assert.ok(materials[2] instanceof Color);
  assert.notEqual(materials[0].dashPattern, materials[1].dashPattern);
  assert.equal(materials[1].dashLength / materials[0].dashLength, 2);
});

/* ══ #R711 — a visible, uncollided name remains eligible above the former zoom cutoffs ═══════════
   The shipped label definitions are EXECUTED (the one statement that adds each layer is run against
   a recording engine); placement with real era bundles is measured by r707-chronos-labelplacement. */
function definitions() {
  const result = [];
  const ctx = vm.createContext({ GE: () => ({ layers: { has: () => false, add: x => result.push(x) } }), window: { IntMapLabelScale: { place: () => 12 } }, LS: { place: () => 12 }, FONT: ['Arial'], _ERAFONT: ['Arial'], _ERAVAR: { 'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'] }, A1_TEXT: () => '#fff', A1_RANK: true, before: undefined });
  for (const [file, id] of [['js/time-borders.js', 'imtb-lbl'], ['js/time-borders.js', 'imtb-lbl2'], ['js/place-labels.js', 'ofm-country']]) {
    const line = rd(file).split('\n').find(l => l.includes("has('" + id + "')") && l.includes('layers.add('));
    assert.ok(line, 'definition exists: ' + id); vm.runInContext(line, ctx);
  }
  const modern = rd('js/place-labels.js').match(/if\(!GE\(\)\.layers\.has\('ofm-admin1'\)\)[\s\S]*?\}\);/);
  assert.ok(modern); vm.runInContext(modern[0], ctx);
  const admin = rd('js/time-admin1.js').match(/if \(!GE\(\)\.layers\.has\(cfg.lbl\)\) GE\(\)\.layers\.add\(\{[\s\S]*?\n          \}\);/);
  assert.ok(admin);
  Object.assign(ctx, { FONT: ['Arial'], SIZE: 12, COL: '#fff', DEEP_Z: 6, SORT_PROP: '_sort' });
  for (const deep of [false, true]) { ctx.cfg = { lbl: deep ? 'imta2-lbl' : 'imta-lbl', src: 'test', deep }; vm.runInContext(admin[0], ctx); }
  return result;
}
const labelDefs = definitions();
test('#R711 country and administrative names remain eligible above former zoom cutoffs', () => {
  assert.equal(labelDefs.length, 6);
  for (const l of labelDefs) for (const z of [7, 9, 12, 18, 22]) {
    if (z < (l.minzoom || 0)) continue;
    assert.ok(l.maxzoom === undefined || z < l.maxzoom, `${l.id} disappeared solely at zoom ${z}`);
    assert.notEqual(l.layout['text-allow-overlap'], true, 'normal collision placement retained');
    assert.notEqual(l.layout['text-ignore-placement'], true, 'name must still participate in collision placement');
  }
});
test('#R711 computed administrative label anchors have alternate collision placements', () => {
  for (const l of labelDefs.filter(x => /^imta2?-/.test(x.id))) {
    assert.ok(l.layout['text-variable-anchor'].length > 1);
    assert.equal(l.layout['text-justify'], 'auto');
    assert.equal(l.layout['text-optional'], true);
    assert.ok(l.layout['symbol-sort-key'], 'area priority preserved');
  }
});
