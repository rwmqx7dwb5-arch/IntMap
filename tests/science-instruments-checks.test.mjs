/* ============================================================================
 *  IntMap · science-instruments — the volcanic-ash what-if, simulator outputs as datasets, the
 *  radiation and pandemic ensembles, the drone door, and the pairing of every simulator with its
 *  method page.
 * ----------------------------------------------------------------------------
 *  Every check here RUNS the code it is about (#R505): the ash model is flown over a synthetic
 *  field, the dataset door is driven against the real registry (js/gis-datasets.js), the radiation
 *  ensemble is computed from real solves, the drone capability is dispatched with a stub planner,
 *  and the method-page pairing is read from the capability entries and the page document — neither
 *  side is a list typed here.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (rel) => pathToFileURL(join(ROOT, rel)).href;
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const { ASH } = await import(url('js/ash-model.js'));
const { RAD } = await import(url('js/radiation-model.js'));

/* a uniform wind of `spd` m/s blowing FROM `dir` on every pressure level, `hours` long */
function ashField({ cx = 130.66, cy = 31.59, spd = 20, dir = 270, hours = 30, shear = 0 } = {}) {
  const time = []; for (let h = 0; h < hours; h++) time.push(new Date(Date.UTC(2026, 9, 3, h)).toISOString().slice(0, 16));
  const body = (plan) => { const pts = ASH.planPoints(plan); return pts.LO.map((lo, i) => {
    const hourly = { time };
    for (const l of ASH.LEVELS) { hourly['wind_speed_' + l + 'hPa'] = new Array(hours).fill(spd + shear * (pts.LA[i] - cy)); hourly['wind_direction_' + l + 'hPa'] = new Array(hours).fill(dir); }
    return { elevation: 0, hourly }; }); };
  const pin = ASH.innerPlan(cx, cy), pout = ASH.outerPlan(cx, cy, spd, 24);
  return { cx, cy, inner: ASH.buildNest(pin, body(pin), 0, hours), outer: ASH.buildNest(pout, body(pout), 0, hours) };
}

/* ══ ① THE SOURCE — Mastin's fit both ways, and the eruption types it is applied to ══════════ */
test('ash ①: the mass eruption rate follows from the height by Mastin et al. (2009) and inverts exactly', () => {
  for (const h of [2, 7, 11, 15, 25]) assert.ok(Math.abs(ASH.heightFromMer(ASH.merFromHeight(h)) - h) < 1e-9, 'H → MER → H at ' + h + ' km');
  /* the published fit: H = 2.00 V^0.241, V in DRE m³/s at 2500 kg/m³ — so 11 km is ~1.2×10³ m³/s */
  const V = ASH.merFromHeight(11) / ASH.RHO_DRE;
  assert.ok(Math.abs(2.0 * Math.pow(V, 0.241) - 11) < 1e-9);
  assert.ok(ASH.merFromHeight(15) > ASH.merFromHeight(11) && ASH.merFromHeight(11) > ASH.merFromHeight(7), 'taller columns need more mass');
});

test('ash ①b: every dominant rock in the shipped GVP catalogue maps to a Mastin composition class', () => {
  /* the vocabulary is DISCOVERED from data/volcanoes_gvp.json — a catalogue revision that adds a rock
     this mapping does not know fails here instead of silently getting no default */
  const rocks = JSON.parse(readFileSync(join(ROOT, 'data/volcanoes_gvp.json'), 'utf8')).rocks;
  assert.ok(rocks.length >= 5);
  for (const r of rocks) assert.ok(ASH.styleForRock(r), 'no class for «' + r + '»');
  assert.equal(ASH.styleForRock('Basalt / Picro-Basalt'), 'M0');
  assert.equal(ASH.styleForRock('Dacite'), 'S0');
  assert.equal(ASH.styleForRock(''), null, 'no rock → no implied type');
  for (const k of Object.keys(ASH.STYLES)) { const s = ASH.STYLES[k]; assert.ok(s.h > 0 && s.hours > 0 && s.m63 > 0 && s.m63 < 1 && s.ex, k); }
});

/* ══ ② THE PARTICLES — settling and the grain-size distribution ══════════════════════════════ */
test('ash ②: Ganser settling reduces to Stokes for fine ash, rises with size, and is faster in thin air', () => {
  const a = ASH.isa(0), d = 10e-6, rho = 2500;
  const stokes = 9.80665 * (rho - a.rho) * d * d / (18 * a.mu);
  const v = ASH.settlingVelocity(d, rho, 0);
  /* non-spherical drag (ψ = 0.7) is larger than a sphere's, so slower than Stokes — but the same order */
  assert.ok(v < stokes && v > stokes / 3, 'v=' + v + ' stokes=' + stokes);
  let last = 0; for (const dd of [10e-6, 63e-6, 250e-6, 1e-3, 4e-3]) { const vv = ASH.settlingVelocity(dd, rho, 0); assert.ok(vv > last); last = vv; }
  assert.ok(ASH.settlingVelocity(1e-3, 1700, 10000) > ASH.settlingVelocity(1e-3, 1700, 0), 'thinner air, faster fall');
});

test('ash ②b: the grain-size distribution puts exactly m63 of the mass finer than 63 µm', () => {
  for (const m63 of [0.02, 0.05, 0.1, 0.4, 0.5]) {
    const t = ASH.tgsd(m63);
    const fine = t.fine.reduce((s, b) => s + b.frac, 0), coarse = t.coarse.reduce((s, b) => s + b.frac, 0);
    assert.ok(Math.abs(fine - m63) < 1e-6, 'fine ' + fine + ' vs ' + m63);
    assert.ok(Math.abs(fine + coarse - 1) < 1e-6);
  }
});

/* ══ ③ THE SOLVE — conservation, transport, reproducibility ════════════════════════════════ */
test('ash ③: the mass budget closes — deposited + airborne + escaped + not placed = erupted', async () => {
  const F = ashField();
  const r = await ASH.solve(F, { lng: F.cx, lat: F.cy, ventM: 1117, hKm: 11, hours: 3, window: 24, m63: 0.4, seed: 7, nCoarse: 3000, nFine: 2000 });
  const sum = r.depositedKg + r.airborneKg + r.escapedKg + r.notPlacedKg;
  assert.ok(Math.abs(sum / r.totalKg - 1) < 1e-6, 'budget ' + sum / r.totalKg);
  assert.ok(r.deposit.length > 0 && r.conc.length >= 23, 'a deposit and an hourly cloud');
  assert.equal(r.distal, 0.05);
});

test('ash ③b: the cloud goes where the wind sends it, at the wind\'s speed', async () => {
  const F = ashField({ spd: 20, dir: 270 });   /* FROM the west */
  const r = await ASH.solve(F, { lng: F.cx, lat: F.cy, ventM: 0, hKm: 11, hours: 1, window: 12, m63: 0.4, seed: 3, nCoarse: 500, nFine: 1500 });
  const last = r.conc[r.conc.length - 1];
  let sx = 0, sy = 0, m = 0; for (const c of last.cells) { const w = c.mg[0] + c.mg[1] + c.mg[2]; sx += (c.ix + 0.5) * r.concCell * w; sy += (c.iy + 0.5) * r.concCell * w; m += w; }
  const lon = sx / m, lat = sy / m;
  const expected = F.cx + 20 * 3600 * (12 - 0.5) / (111320 * Math.cos(F.cy * Math.PI / 180));
  assert.ok(Math.abs(lon - expected) < 1.0, 'cloud centre ' + lon.toFixed(2) + ' vs ' + expected.toFixed(2));
  assert.ok(Math.abs(lat - F.cy) < 0.6, 'no drift across a uniform westerly');
});

test('ash ③c: a seed repeats a run exactly, and a different seed is a different run', async () => {
  const F = ashField();
  const o = { lng: F.cx, lat: F.cy, ventM: 0, hKm: 7, hours: 6, window: 12, m63: 0.05, nCoarse: 1500, nFine: 800 };
  const a = await ASH.solve(F, Object.assign({ seed: 11 }, o)), b = await ASH.solve(F, Object.assign({ seed: 11 }, o)), c = await ASH.solve(F, Object.assign({ seed: 12 }, o));
  assert.deepEqual(a.deposit.map((x) => [x.ix, x.iy, x.mm]), b.deposit.map((x) => [x.ix, x.iy, x.mm]));
  assert.notDeepEqual(a.deposit.map((x) => x.mm), c.deposit.map((x) => x.mm));
});

test('ash ③d: shear in the wind spreads the cloud (the deformation diffusivity is read off the field)', async () => {
  const run = async (shear) => { const F = ashField({ shear }); const r = await ASH.solve(F, { lng: F.cx, lat: F.cy, ventM: 0, hKm: 11, hours: 1, window: 12, m63: 0.4, seed: 5, nCoarse: 200, nFine: 1500 }); return r.conc[r.conc.length - 1].cells.length; };
  assert.ok(await run(4) > await run(0), 'a sheared field spreads the cloud over more cells than a uniform one');
});

/* ══ ④ THE DATASET DOOR — js/sim-datasets.js against the real registry ══════════════════════ */
test('datasets ④: a simulator output is a registry record with a sim provenance, and a re-run replaces it unless something was built from it', async () => {
  const { makeGisDatasets } = await import(url('js/gis-datasets.js'));
  window.IntMapData = makeGisDatasets();
  const { registerSimOutput, simDataset } = await import(url('js/sim-datasets.js'));
  const sq = (x, y) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] });
  const a = await registerSimOutput({ sim: 'radiation', version: 'v', seed: 42, params: { bq: 1 }, features: [{ type: 'Feature', geometry: sq(0, 0), properties: { kbq_m2: 40 } }],
    fieldStatements: { kbq_m2: { unit: 'kBq/m2', unitStated: 'source', unitFrom: 'test' } } });
  assert.ok(a && a.id);
  assert.equal(a.provenance.kind, 'sim'); assert.equal(a.provenance.seed, 42); assert.equal(a.provenance.sim, 'radiation');
  assert.equal(a.fields.find((f) => f.name === 'kbq_m2').unit, 'kBq/m2');
  const b = await registerSimOutput({ sim: 'radiation', version: 'v', seed: 43, params: {}, features: [] });
  assert.ok(!window.IntMapData.has(a.id), 'nothing depended on the first run, so it is replaced');
  assert.equal(simDataset('radiation').id, b.id);
  /* something built FROM b: b stays, marked stale, when the next run arrives */
  window.IntMapData.add({ id: 'ds-child', title: 'child', features: [], provenance: { kind: 'op', op: 'filter', inputs: [b.id], params: {} } });
  const c = await registerSimOutput({ sim: 'radiation', version: 'v', seed: 44, params: {}, features: [] });
  assert.ok(window.IntMapData.has(b.id) && window.IntMapData.stale(b.id), 'an input of a chain is kept and marked stale, not deleted');
  assert.ok(c && simDataset('radiation').id === c.id);
});

/* ══ ⑤ THE RADIATION ENSEMBLE — seeds re-run, the source-term range scales ══════════════════ */
function radField(hours = 30) {
  const cx = 141.03, cy = 37.42, levels = [10, 80, 180], time = [];
  for (let h = 0; h < hours; h++) time.push('2026-09-09T' + String(h % 24).padStart(2, '0') + ':00');
  const body = (plan) => RAD.planPoints(plan).LO.map(() => { const hourly = { time };
    for (const l of levels) { hourly['wind_speed_' + l + 'm'] = new Array(hours).fill(8); hourly['wind_direction_' + l + 'm'] = new Array(hours).fill(270); }
    hourly.precipitation = new Array(hours).fill(0); hourly.temperature_2m = new Array(hours).fill(15); hourly.boundary_layer_height = new Array(hours).fill(800); return { hourly }; });
  const pin = RAD.innerPlan(cx, cy), pout = RAD.outerPlan(cx, cy, 8, 24);
  return { cx, cy, inner: RAD.buildNest(pin, body(pin), levels, 0, hours), outer: RAD.buildNest(pout, body(pout), levels, 0, hours), outerOK: true, half: pout.half };
}
const radRun = (F, seed) => RAD.simulate(F, { lng: F.cx, lat: F.cy }, { isotope: 'cs137', bq: 1.5e16, hours: 18, emitHours: 4, startHour: 0, depRes: 0.03, particles: 1500, dtSec: 600, releaseHeight: 300, seed }, null);

test('radiation ⑤: a seeded solve repeats exactly; an unseeded one still runs as before', () => {
  const F = radField();
  const a = radRun(F, 9), b = radRun(F, 9), c = radRun(F, 10);
  assert.equal(a.seed, 9);
  assert.deepEqual(Array.from(a.bq), Array.from(b.bq));
  assert.notDeepEqual(Array.from(a.bq), Array.from(c.bq));
  const u = radRun(F, undefined); assert.equal(u.seed, null); assert.ok(u.keys.length > 0);
});

test('radiation ⑤b: the ensemble orders p10 ≤ p50 ≤ p90 and the source-term range scales the deposit linearly', () => {
  const F = radField();
  const runs = [radRun(F, 1), radRun(F, 2), radRun(F, 3)];
  const one = RAD.ensemble(runs, [1], 'cs137'), ranged = RAD.ensemble(runs, [0.5, 1, 2], 'cs137');
  assert.equal(one.members, 3); assert.equal(ranged.members, 9);
  for (const c of ranged.cells) assert.ok(c.p10 <= c.p50 + 1e-12 && c.p50 <= c.p90 + 1e-12);
  assert.ok(ranged.peakKBqM2.p90 >= ranged.peakKBqM2.p50 && ranged.peakKBqM2.p50 >= ranged.peakKBqM2.p10);
  /* the scaled members bracket the unscaled ones: the p90 map of the ranged ensemble carries at least as much as the p50 map of the seeds alone */
  assert.ok(ranged.peakKBqM2.p90 >= one.peakKBqM2.p50);
  const s = (o) => o.zoneKm2.p90.reduce((x, y) => x + y, 0); assert.ok(s(ranged) >= s(one) - 1e-9);
});

/* ══ ⑥ THE DRONE DOOR — map.tool {"name":"drone"} is the planner's capability, not a toggle ══ */
test('drone ⑥: map.tool {"name":"drone"} dispatches to routing.drone with its arguments', async () => {
  const entries = (await import(url('js/atlas-cap-map.js'))).default;
  const tool = entries.find((e) => e.row[0] === 'map.tool');
  let opened = 0, toggled = 0;
  window.IntMapDrone = { open() { opened++; }, close() {}, toggle() { toggled++; return true; } };
  window.IntMapLang = window.IntMapLang || undefined;
  const K = { R: (ok, html, extra) => ({ ok, html, extra }), note: (x) => x, warn: (x) => x, esc: (x) => String(x), L: (...a) => a[0],
    clickId: () => false, doControl: () => ({ ok: false }), geocode: async () => null, GE: () => ({}) };
  const r = await tool.run({ name: 'drone' }, {}, K);
  assert.equal(r.ok, true);
  assert.equal(opened, 1, 'the planner was OPENED by its own capability');
  assert.equal(toggled, 0, 'and not toggled by a word match');
  delete window.IntMapDrone;
});

/* ══ ⑦ EVERY SIMULATOR HAS A METHOD PAGE — read from both sides, listed on neither ═══════════ */
test('science ⑦: every sim.* capability names a science.html section that exists in en and jp', async () => {
  const { CAPABILITY_MODULES } = await import(url('js/atlas-caps-modules.js'));
  const { capabilityEntries } = await import(url('js/atlas-caps.js'));
  const entries = capabilityEntries(CAPABILITY_MODULES);
  const docs = {};
  for (const [code, file] of [['en', 'pages.en.js'], ['jp', 'pages.ja.js']]) {
    const w = {}; new Function('window', readFileSync(join(ROOT, 'js/locales', file), 'utf8'))(w);
    docs[code] = new Set(((w.IntMapPageI18N.doc(code === 'jp' ? 'ja' : 'en') || w.IntMapPageI18N.doc(code) || {}).science.sections || []).map((s) => s.id));
  }
  const sims = entries.filter((e) => e.ns === 'sim' && !(e.policy && e.policy.withdrawn));
  assert.ok(sims.length >= 15, 'the sim namespace was found (' + sims.length + ')');
  const missing = [];
  for (const e of sims) {
    if (!e.science) { missing.push(e.id + ' names no section'); continue; }
    for (const code of ['en', 'jp']) if (!docs[code].has(e.science)) missing.push(e.id + ' → #' + e.science + ' is not a section in ' + code);
  }
  assert.deepEqual(missing, []);
  /* the five the instruments brief added, and the ash page this round wrote */
  for (const id of ['ash', 'volcano', 'radiation', 'pandemic', 'weather', 'aviation']) assert.ok(docs.en.has(id) && docs.jp.has(id), id);
});
