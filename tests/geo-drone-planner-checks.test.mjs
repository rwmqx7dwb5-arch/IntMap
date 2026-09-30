/* ============================================================================
 *  THE DRONE PLANNER — js/drone-nav.js
 * ----------------------------------------------------------------------------
 *  The route planner for a drone: real terrain, AMSL vs AGL, every limit computed with a reason, the
 *  seams for hazards and wind, sanitised input, Atlas reach, and no camera or gesture of its own.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { appShell } from './app-source.mjs';
import { isolate } from './helpers/geo-shared.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R174 · the drone planner   (was tests/r174-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// R174 source-level checks (node --test). These pin the ROOT CAUSES the round fixed, so a later
// refactor cannot quietly reintroduce any of them, plus the shape of the new drone planner.
//
//   1. the flight simulator draws no sky of its own, and its camera is the FromTo one that can look up
//   2. the eye-anchored tilt solves at the APPLIED zoom, not the proposed one (zoom must still zoom)
//   3. the aircraft track survives a double-click zoom
//   4. the solid body's altitude is scaled per projection variant (metres vs mercator units)
//   5. the 3-D volume has a "drawing complete" button and no Solid choice anywhere
//   6. the drone planner exists, is catalogued for Atlas, and speaks five languages
describe('§ #R174 · the drone planner', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const root = new URL('../', import.meta.url);

  /* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
     live in js/locales/ui.<code>.js, one file per language (see js/lang-registry.js). Asking this
     reader for js/i18n.js therefore hands back the whole table, which is what these assertions mean. */
  const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
    .concat(readdirSync(new URL('../js/locales/', import.meta.url))
      .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
  const R = (p) => (String(p).endsWith('js/i18n.js')
    ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
    : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
  /* comments are prose here — every one of these files documents its own traps at length, and a naive
     substring search would happily match the explanation of a bug instead of the code that fixes it */
  const stripComments = s => codeOnly(s);

  /* ─── 6. the drone planner ─────────────────────────────────────────────────────────────────── */

  test('#R174 the drone planner is wired into the app', () => {
    /* 綴りのまま: 主張が app shell／バンドルの import グラフという静的な構造で、実行しても観測できない。 */
    const idx = appShell(root);
    assert.match(idx, /import '\.\.\/js\/drone-nav\.js';/, 'the file is loaded by the Vite entry (#R175)');
    assert.match(idx, /window\.IntMapModules\.droneNav\((IM_HOST)\)/, 'and instantiated');
    /* (#R176) 「DronesはMeasureに置くな。どこにも置くな。」 — the launcher was removed from the Measure menu
       AND from the mobile tools sheet. The planner itself is untouched: the assertions above (loaded,
       instantiated) and the Atlas ones below are what keep the feature alive. */
    assert.doesNotMatch(idx, /id="btn-tool-drone"/, 'the Measure menu does NOT offer it');
    assert.doesNotMatch(idx, /data-proxy="btn-tool-drone"/, 'and neither does the mobile tools sheet');
  });

  /* ── the planner, EVALUATED ─────────────────────────────────────────────────────────────────────
     ⚠ Until the regrouping, every check below read js/drone-nav.js as text and matched the spelling of
     the line that did the thing (`s.agl=s.amsl-s.ground`, `Math.pow((m0+pay)/m0,1.5)`, `kind:'battery'`).
     A spelling is kept by a refactor that breaks the arithmetic and broken by one that keeps it. The
     planner's MODEL needs no DOM: the ground comes from HOST.demElevBilinear, storage from localStorage
     and the map from window.IntMapGeoEngine — so all three are handed in here and the SHIPPED factory
     is run. The panel (open/render) builds DOM and is not asked; where a claim is about the panel, the
     check says so and still reads the source. */
  function planner(o = {}) {
    const store = new Map(Object.entries(o.stored || {}));
    const ls = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    const log = [];                       /* warm / sample / camera writes, in the order they happened */
    const camera = new Proxy({}, {
      get: (t, k) => {
        if (k === 'getCenter') return () => ({ lng: 138.7, lat: 35.3 });
        if (k === 'getZoom') return () => 12;
        if (k === 'getPitch' || k === 'getBearing') return () => 0;
        return () => { log.push('camera.' + String(k)); };
      },
    });
    const layers = new Proxy({}, {
      get: (t, k) => ((k === 'has' || k === 'hasSource' || k === 'isVisible') ? () => false : () => true),
    });
    const handlers = [];
    const w = {
      IntMapModules: {},
      IntMapLang: {
        pick: () => { const f = (...a) => a[0]; f.arr = (a) => (Array.isArray(a) ? a[0] : String(a == null ? '' : a)); return f; },
        pickArgs: () => (...a) => a,
      },
      addEventListener() {},
      IntMapGeoEngine: {
        canDraw: () => true, camera, layers,
        events: { on: (ev, fn) => { handlers.push([ev, fn]); }, once() {}, off() {} },
        render: { canvas: () => ({ style: {} }) },
        coords: { worldSize: () => 512 * 4096, terrainElevation: () => null },
        raw: () => { log.push('raw'); return null; },
      },
    };
    const ground = o.ground || (() => 100);
    const HOST = {
      lang: 'en', terrain3D: false, isMobile: () => false, makeDraggable() {},
      _demZoomForSpan: () => 12,
      warmDEMTiles: async (pts, z) => { log.push('warm:' + pts.length + '@' + z); },
      demElevBilinear: (lng, lat) => { log.push('sample'); return ground(lng, lat); },
      demElevAt: () => null,
    };
    // eslint-disable-next-line no-new-func
    new Function('window', 'localStorage', R('js/drone-nav.js'))(w, ls);
    const api = w.IntMapModules.droneNav(HOST);
    return { api, w, store, log, handlers };
  }
  /* a point `m` metres east of 138.70°E on 35.30°N — the routes below are built in metres, so every
     expected number is arithmetic rather than a recording */
  const M_PER_DEG_LNG = (Math.PI / 180) * 6371008.8 * Math.cos(35.3 * Math.PI / 180);
  const east = (m) => 138.70 + m / M_PER_DEG_LNG;
  const route = (wps, spec) => ({ id: 'r', name: 'test', spec: spec || {}, presetId: 'custom', wp: wps.map((p) => Object.assign({ lat: 35.30, hold: 0 }, p)) });
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

  test('#R174 the planner reads REAL terrain and keeps AMSL and AGL apart', async () => {
    /* ground rises 10 m per 100 m eastward, from 100 m AMSL */
    const P = planner({ ground: (lng) => 100 + (lng - 138.70) * M_PER_DEG_LNG * 0.1 });
    assert.equal(P.api.setRoute(route([
      { lng: east(0), alt: 50, ref: 'agl' },          /* 50 m above ground 100 → 150 AMSL */
      { lng: east(1000), alt: 300, ref: 'amsl' },     /* 300 AMSL above ground 200 → 100 AGL */
    ])), true);
    const res = await P.api.compute();
    /* it warms the DEM tiles it is about to read, ONCE, before reading any of them — and it samples the
       shared keyless DEM (HOST.demElevBilinear) for every point: no invented elevation */
    const firstSample = P.log.indexOf('sample');
    assert.ok(P.log[0].startsWith('warm:') && firstSample > 0, 'the tiles are warmed before a single read: ' + P.log.slice(0, 3).join(', '));
    assert.equal(P.log.filter((x) => x.startsWith('warm:')).length, 1, 'one warm for the whole computation');
    assert.equal(P.log[0], 'warm:' + res.samples.length + '@12', 'every sample point is warmed');
    near(res.wpGround[0], 100, 1e-6, 'ground under wp0'); near(res.wpGround[1], 200, 1e-6, 'ground under wp1');
    /* ONE conversion from a waypoint's own reference to AMSL, and back */
    near(res.wpAmsl[0], 150, 1e-6, 'an AGL waypoint is its altitude plus the ground under IT');
    near(res.wpAmsl[1], 300, 1e-9, 'an AMSL waypoint is its altitude');
    near(res.wpAgl[0], 50, 1e-9, 'wp0 AGL'); near(res.wpAgl[1], 100, 1e-6, 'wp1 AGL is AMSL minus its own ground');
    /* AGL is always AMSL minus the ground under that point — at every sample, not only the ends */
    for (const s of res.samples) near(s.agl, s.amsl - s.ground, 1e-9, 'sample AGL');
    const mid = res.samples[Math.floor(res.samples.length / 2)];
    near(mid.ground, 100 + (mid.lng - 138.70) * M_PER_DEG_LNG * 0.1, 1e-6, 'the ground is read under each sample');
    /* nothing the ANSWER depends on is random: the same route computes to the same numbers */
    const again = await P.api.compute();
    const strip = (r) => JSON.stringify({ s: r.samples, l: r.legs, e: r.energyWh, t: r.timeS, v: r.violations });
    assert.equal(strip(again), strip(res), 'two computations of one route differ');
    /* every waypoint carries the reference it was typed in — a display-only setting would be the bug */
    P.api.setTypedRef('amsl');
    P.api.addWaypoint(east(2000), 35.30, 400);
    P.api.setTypedRef('agl');
    assert.deepEqual(P.api.route().wp.map((p) => p.ref), ['agl', 'amsl', 'amsl'], 'the reference is stored per waypoint');
  });

  test('#R174 every limit in the brief is actually computed, and each has a specific reason', async () => {
    const P = planner();                                      /* flat ground at 100 m AMSL */
    /* every limit is an editable aircraft field, and what is set is what the model reads */
    const patch = { cruiseSpeed: 12, maxSpeed: 18, maxAgl: 120, minAgl: 20, rangeKm: 1, batteryWh: 1, massKg: 1, payloadKg: 0.5, climbRate: 2, descentRate: 3 };
    P.api.newRoute();
    const spec = P.api.setSpec(patch);
    for (const k of Object.keys(patch)) assert.equal(spec[k], patch[k], `${k} is an editable aircraft limit`);
    /* a route that breaks each limit once: too close to the ground, above the ceiling, into the ground,
       longer than the range and more than the battery */
    const r = route([
      { lng: east(0), alt: 5, ref: 'agl' },
      { lng: east(1500), alt: 300, ref: 'agl' },
      { lng: east(3000), alt: 50, ref: 'amsl' },
    ], patch);
    P.api.setRoute(r);
    const res = await P.api.compute();
    const kinds = new Set(res.violations.map((v) => v.kind));
    for (const k of ['terrain-collision', 'min-clearance', 'max-altitude', 'range', 'battery']) {
      assert.ok(kinds.has(k), `${k} is reported as its own finding (got ${[...kinds].join(', ')})`);
      const v = res.violations.find((x) => x.kind === k);
      assert.ok(typeof v.text === 'string' && /\d/.test(v.text), `${k} names the numbers that failed: ${v.text}`);
      assert.ok(isFinite(v.fromKm) && isFinite(v.toKm), `${k} says where`);
    }
    assert.equal(res.ok, false);
    /* payload scales power by momentum theory, not a fudge: (m0+pay)/m0 to the 1.5 */
    const m = P.api._math;
    near(m.powerW({ cruisePowerW: 100, massKg: 1, payloadKg: 0.2 }), 100 * Math.pow(1.2, 1.5), 1e-9, 'powerW');
    /* climbing is charged as real work against gravity: m·g·Δh over a rotor's η≈0.5, in Wh */
    near(m.climbWh({ massKg: 1, payloadKg: 0.5 }, 100), 1.5 * 9.80665 * 100 / 0.5 / 3600, 1e-12, 'climbWh');
    assert.equal(m.climbWh({ massKg: 1, payloadKg: 0 }, -100), 0, 'descending gives nothing back');
    /* a leg takes the longer of flying it and climbing it */
    const Q = planner();
    Q.api.setRoute(route([{ lng: east(0), alt: 10, ref: 'agl' }, { lng: east(100), alt: 310, ref: 'agl' }], { cruiseSpeed: 15, climbRate: 5 }));
    const steep = await Q.api.compute();
    near(steep.legs[0].timeS, 300 / 5, 1e-6, 'a 300 m climb at 5 m/s over 100 m takes the climb’s time');
    assert.equal(steep.legs[0].climbLimited, true);
    Q.api.setRoute(route([{ lng: east(0), alt: 50, ref: 'agl' }, { lng: east(3000), alt: 50, ref: 'agl' }], { cruiseSpeed: 15, climbRate: 5 }));
    const flat = await Q.api.compute();
    near(flat.legs[0].timeS, flat.legs[0].distM / 15, 1e-9, 'a level leg takes its distance at cruise speed');
  });

  test('#R174 the planner can be edited, recomputed, saved and deleted', async () => {
    const P = planner();
    P.api.newRoute();
    assert.equal(P.api.addWaypoint(east(0), 35.30, 60, 'agl'), 1);
    assert.equal(P.api.addWaypoint(east(500), 35.30, 70, 'agl'), 2);
    assert.equal(P.api.addWaypoint(east(900), 35.30, 80, 'agl'), 3);
    assert.equal(P.api.setWaypoint(1, { alt: 90 }), true);
    assert.equal(P.api.moveWaypoint(0, 1), true);
    assert.deepEqual(P.api.route().wp.map((p) => p.alt), [90, 60, 80], 'set and move edit the route');
    assert.equal(P.api.removeWaypoint(2), true);
    const first = await P.api.compute();
    assert.equal(first.legs.length, 1, 'the recomputation sees the edited route');
    /* follow the terrain lifts what is too low, and computes again */
    const P2 = planner({ ground: (lng) => (Math.abs(lng - east(500)) < 0.001 ? 400 : 100) });
    P2.api.setRoute(route([{ lng: east(0), alt: 50, ref: 'agl' }, { lng: east(1000), alt: 50, ref: 'agl' }], { minAgl: 10 }));
    const lifted = await P2.api.followTerrain();
    assert.ok(lifted.minClearance >= 10 - 1e-6, 'followTerrain leaves the whole route above the floor: ' + lifted.minClearance);
    /* saved, persisted, re-opened, deleted — through localStorage, not a variable */
    const id = P.api.route().id;
    assert.equal(P.api.save(), true);
    const persisted = JSON.parse(P.store.get('intmap_drone_routes'));
    assert.equal(persisted.length, 1, 'routes persist');
    const P3 = planner({ stored: { intmap_drone_routes: P.store.get('intmap_drone_routes') } });
    assert.deepEqual(P3.api.routes().map((r) => r.id), [id], 'a new page reads the saved route back');
    assert.equal(P3.api.load(id), true);
    assert.equal(P3.api.route().wp.length, 2);
    assert.equal(P3.api.remove(id), true);
    assert.deepEqual(JSON.parse(P3.store.get('intmap_drone_routes')), [], 'and deleting it deletes it from storage');
    assert.equal(P3.api.clearRoute(), true);
  });

  test('#R174 the future-integration list has a seam, and it is one seam', async () => {
    const P = planner();
    /* weather / NFZ / wires / traffic all attach here — and the sources are actually consulted by compute() */
    assert.equal(P.api.registerHazardSource('nfz', (ctx) => [{ kind: 'no-fly', i: 2, severity: 'error', text: 'inside a zone at ' + ctx.samples.length }]), true);
    P.api.setRoute(route([{ lng: east(0), alt: 50, ref: 'agl' }, { lng: east(3000), alt: 50, ref: 'agl' }], { cruiseSpeed: 10 }));
    const withZone = await P.api.compute();
    const found = withZone.violations.find((v) => v.source === 'nfz');
    assert.ok(found && found.kind === 'no-fly' && found.severity === 'error', 'a registered hazard source reaches the findings');
    assert.equal(withZone.ok, false);
    P.api.unregisterHazardSource('nfz');
    assert.equal((await P.api.compute()).violations.some((v) => v.source === 'nfz'), false, 'and leaves when unregistered');
    /* and wind, which changes the arithmetic, attaches here: a tailwind raises ground speed, a headwind lowers it */
    const calm = (await P.api.compute()).legs[0];
    near(calm.groundSpeed, 10, 1e-9, 'no field, no wind');
    P.api.registerWindField(() => ({ u: 4, v: 0 }));                  /* 4 m/s from the west: this leg flies east */
    const tail = (await P.api.compute()).legs[0];
    near(tail.groundSpeed, 14, 1e-6, 'a wind field really does change ground speed');
    assert.ok(tail.timeS < calm.timeS, 'and therefore time');
    P.api.registerWindField(() => ({ u: -4, v: 0 }));
    near((await P.api.compute()).legs[0].groundSpeed, 6, 1e-6, 'a headwind slows it');
  });
  test('#R174 the drone planner is operable from Atlas AND catalogued (#R115)', () => {
    /* 綴りのまま: 対象が js/atlas-console.js の dispatch と SYS カタログの文面で、Atlas は DOM とモデル呼び出しの上でしか組み立たない。 */
    /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
       The question below is unchanged; the read follows the answer to where it lives now. */
    const atlas = (R('js/atlas-console.js') + '\n' + capsSource()) + '\n' + R('js/atlas-catalog-text.js');
    assert.ok(capabilityEntry('drone'), 'Atlas implements it');
    assert.ok(atlas.includes('{"type":"drone"'), 'and advertises it in the SYS catalogue');
    assert.match(atlas, /"name":"measure"\|"radius"\|"draw"\|"volume"\|"drone"/, 'the tool switch lists it too');
    /* (#R176) …and with no button left to click, the `tool` switch calls the planner directly. */
    assert.match(atlas, /if\(\/drone\|ドローン\|无人机\|무인기\/\.test\(n\)\)\{[^}]*window\.IntMapDrone&&window\.IntMapDrone\.toggle\(\)/, 'with a branch behind the name');
  });

  test('#R174 the new UI strings exist in every registered language', () => {
    /* 綴りのまま: 主張が L()／t() に渡す言語別の引数（翻訳の在否と長さ）そのもので、ソースの引数の並びが対象。 */
    /* ⚠ (#R223) EVERY REGISTERED LANGUAGE, not the number five — a sixth (zh) landed and these
       assertions were about coverage, never about the count. `LANGS` is the one list (js/lang-registry.js). */
    const NL = (R('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"[a-z-]+"/g) || []).length;   /* (#R232) the GENERATED language list — the registry's rows stopped being the list when a language became one file */
    const i18n = R('js/i18n.js'), d = R('js/drone-nav.js'), tp = R('js/tool-panel.js');
    /* ⚠ (#R450) THE `droneBtn:` SAMPLE IS GONE, AND ITS SUBJECT WENT FIRST. #R176 removed the
       launcher button — this file says so ten lines up, «with no button left to click» — and the key
       it labelled has been unreachable ever since: nine rows of translation for a string no shipped
       file names. #R450 deleted them and this line, which counted them, is what noticed.
       ⚠ The CLAIM it sampled is not dropped, it moved and got wider: «every registered language
       declares every keyed string» is measured repo-wide by scripts/i18n-keyed-audit.mjs against
       EVERY declaration site (the locale files plus the six `Object.assign(i18n.<code>,…)` modules),
       and scripts/i18n-audit.mjs --gate fails on it — which one hand-picked key never could. What is
       left here is this feature's own strings, in the shape it actually uses now: five positional
       arguments at each L(…) below. Do not re-add a single-key count; that is the shape that rotted. */
    assert.ok(NL >= 9, 'the generated language list is still being read (got ' + NL + ')');
    /* L(en, jp, de, ru, es) — walk to the matching close paren, because the English text contains brackets */
    const callAt = (src, needle) => {
      const i = src.indexOf(needle); assert.ok(i > 0, `${needle} is missing`);
      let depth = 0; for (let j = i; j < src.length; j++) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') { depth--; if (!depth) return src.slice(i, j + 1); } }
      throw new Error('unbalanced call at ' + needle);
    };
    const five = call => assert.equal(call.split(/','|', '/).length >= 5, true, 'five language arguments: ' + call.slice(0, 60));
    five(callAt(d, "L('Drone navigation'"));
    five(callAt(d, "L('Follow terrain'"));
    five(callAt(d, "L('Conditions not met'"));
    five(callAt(tp, "_L('Finish drawing'"));
    five(callAt(tp, "_L('Resume drawing'"));
  });

  test('#R174 every route that enters the planner is sanitised at the door (#R174 SEC)', async () => {
    /* the three ways in that never touch the panel's own number fields — each is USED with hostile
       input and what comes out is measured (this used to match the spelling of the three call sites) */
    const hostile = {
      id: 'x'.repeat(200), name: '<img src=x onerror=alert(1)>'.repeat(5), presetId: 'not-a-preset',
      spec: { cruiseSpeed: '<script>', maxAgl: 1e9, climbRate: -5, batteryWh: 'NaN' },
      wp: [{ lng: '138.7', lat: 35.3, alt: '"><b>', ref: 'sideways', hold: 1e9 }, { lng: 'nope', lat: 1 }, null],
    };
    const check = (r, where) => {
      assert.equal(r.wp.length, 1, where + ': a waypoint with no position is dropped');
      assert.deepEqual(r.wp[0], { lng: 138.7, lat: 35.3, alt: 0, ref: 'agl', hold: 3600 }, where + ': every waypoint field is a number or a known word');
      assert.equal(typeof r.spec.cruiseSpeed, 'number', where);
      assert.equal(r.spec.cruiseSpeed, 15, where + ': a limit that is not a number takes the default');
      assert.equal(r.spec.maxAgl, 12000, where + ': a limit outside its range is clamped');
      assert.equal(r.spec.climbRate, 0.1, where);
      assert.ok(r.name.length <= 60 && r.id.length <= 64, where + ': strings are bounded');
      assert.equal(r.presetId, 'custom', where);
    };
    /* ⑴ setRoute() */
    const P = planner();
    assert.equal(P.api.setRoute(hostile), true);
    check(P.api.route(), 'setRoute()');
    /* ⑵ setSpec() */
    const spec = P.api.setSpec({ cruiseSpeed: '1e400', massKg: -1, reservePct: 'x' });
    assert.ok(Object.values(spec).every((v) => typeof v === 'number' && isFinite(v)), 'setSpec(): every limit is a finite number');
    assert.equal(spec.massKg, 0.05, 'setSpec(): clamped to the field minimum');
    /* ⑶ localStorage */
    const Q = planner({ stored: { intmap_drone_routes: JSON.stringify([hostile, 'junk', null, 7]) } });
    assert.equal(Q.api.routes().length, 1, 'localStorage: what is not a route is not loaded');
    assert.equal(Q.api.load(Q.api.routes()[0].id), true);
    check(Q.api.route(), 'localStorage');
    const junk = planner({ stored: { intmap_drone_routes: '{not json' } });
    assert.deepEqual(junk.api.routes(), [], 'a corrupt store is an empty one, not an exception');
    /* 綴りのまま: the SINK is the panel's markup (render() builds DOM strings), which Node cannot build.
       …and the sink escapes anyway — CodeQL found it there, and one of the two being right is not a design */
    const d = stripComments(R('js/drone-nav.js'));
    assert.match(d, /value="\$\{esc\(route\.spec\[f\.k\]\)\}"/, 'the spec field escapes at the sink');
    assert.match(d, /value="\$\{esc\(Math\.round\(_fin\(w\.alt,0\)\)\)\}"/, 'and so does the waypoint altitude');
  });

  test('#R174 the planner owns no camera and hijacks no gesture', async () => {
    /* EVALUATED for everything the model does: the whole non-panel surface is driven against a map
       whose camera records every write and whose raw handle records being reached for */
    const P = planner({ ground: (lng) => 100 + 300 * Math.exp(-Math.pow(((lng - 138.70) * M_PER_DEG_LNG - 500) / 120, 2)) });
    P.api.setRoute(route([{ lng: east(0), alt: 30, ref: 'agl' }, { lng: east(1000), alt: 30, ref: 'agl' }]));
    await P.api.compute();
    await P.api.followTerrain();
    P.api.save(); P.api.addWaypoint(east(1500), 35.30, 40); await P.api.compute(); P.api.setAddMode(false);
    P.api.registerWindField(() => ({ u: 1, v: 1 })); await P.api.compute(); P.api.eraseMap();
    assert.deepEqual(P.log.filter((x) => x.startsWith('camera.') || x === 'raw'), [],
      'it never takes the map’s input or writes the whole camera');
    /* the only map events it listens to are a click and the two that ask it to redraw — no drag, no pan */
    assert.deepEqual(P.handlers.map(([ev]) => ev).sort(), ['click', 'terrain', 'zoomend']);
    /* its one click handler does nothing unless its own add mode is armed (and its panel is open) */
    const [, onClick] = P.handlers.find(([ev]) => ev === 'click');
    const before = P.api.route().wp.length;
    let prevented = 0;
    const click = { lngLat: { lng: east(2000), lat: 35.3 }, preventDefault: () => { prevented++; } };
    onClick(click);
    P.api.setAddMode(true);
    onClick(click);                                          /* armed, but the panel is not open */
    assert.equal(P.api.route().wp.length, before, 'a map click added a waypoint it was not asked for');
    assert.equal(prevented, 0, 'and the click was not taken from the map');
    /* 綴りのまま: the PANEL paths (open/render and their buttons) build DOM and are not driven here, so
       for them the source is still asked. */
    const d = stripComments(R('js/drone-nav.js'));
    assert.doesNotMatch(d, /setDragPan|dragPan|jumpTo\(/, 'no path in the file takes the map’s input or writes the whole camera');
  });

  ISOLATED.built();
});
