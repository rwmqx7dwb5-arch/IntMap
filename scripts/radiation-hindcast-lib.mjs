/* Node-side half of the hindcast: build the 2011 wind field from the fixture, run the seeded ensemble, compare.
   Shared by scripts/build-radiation-hindcast.mjs (writes the shipped results) and the gate (re-runs them). */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HINDCAST } from './radiation-hindcast-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const { RAD } = await import(pathToFileURL(join(ROOT, 'js', 'radiation-model.js')).href);
export const H = await import(pathToFileURL(join(ROOT, 'js', 'radiation-hindcast.js')).href);
/* the two exports the checks and the builder read by name (so js/radiation-hindcast.js exports nothing no file reaches) */
export const { FLOOR_BQ_M2, ratioBand } = await import(pathToFileURL(join(ROOT, 'js', 'radiation-hindcast.js')).href);
export const C = HINDCAST;

export function loadFixture() { return JSON.parse(gunzipSync(readFileSync(join(ROOT, 'tests', 'fixtures', 'radiation-hindcast-era5.json.gz'))).toString()); }
export function loadBundle() { return JSON.parse(readFileSync(join(ROOT, 'data', 'radiation-hindcast.json'), 'utf8')); }

/* `regional`: include the regional nest (RAD.midPlan) when the fixture has one. The preset rung runs WITHOUT it,
   because the live simulator does not fetch it — the answer-check must test the field a reader's run gets. */
export function buildField(fx, regional) {
  const times = fx.inner[0].hourly.time;
  const s0 = RAD.resolveStart(times, C.startISO);
  const need = C.hours + 2;
  const inner = RAD.buildNest(fx.inPlan, fx.inner, fx.levels, s0, need);
  const outer = RAD.buildNest(fx.outPlan, fx.outer, fx.levels, s0, need);
  /* the regional nest (RAD.midPlan) — only for the ladder rungs that state it; the live simulator does not fetch it (docs/RADIATION-MODEL.md §10b) */
  const mid = regional && fx.mid ? RAD.buildNest(fx.midPlan, fx.mid, fx.levels, s0, need) : null;
  return { inner, mid, outer, outerOK: true, startHour: 0, levels: fx.levels, cx: C.source.lng, cy: C.source.lat, half: outer.half };
}

/* one seeded solve, exactly the options js/sims.js passes for the `fukushima` preset */
export function solve(F, seed, particles) {
  const st = RAD.sourceTerm(C.source_term, C.isotope);
  return RAD.simulate(F, { lng: C.source.lng, lat: C.source.lat }, {
    bq: st.bq, hours: C.hours, emitHours: st.emitHours, halfLifeHours: RAD.ISOTOPES[C.isotope].hl, startHour: 0,
    depRes: C.depRes, isotope: C.isotope, releaseHeight: st.rise, dtSec: C.dtSec, particles: particles || C.particles, seed,
  }, null);
}

/* The accident's release as simulate() segments: hours since the run's start (the shutdown), Bq per interval. */
export function loadRelease() { return JSON.parse(readFileSync(join(ROOT, C.releaseFile), 'utf8')); }
export function releaseSegments(rel) {
  const t0 = Date.parse(C.startISO), at = rel.fields;
  const iS = at.indexOf('startUTC'), iE = at.indexOf('endUTC'), iR = at.indexOf('bqPerHour'), iB = at.indexOf('zBotM'), iT = at.indexOf('zTopM');
  return rel.segments.map((g) => {
    const a = (Date.parse(g[iS]) - t0) / 3600e3, b = (Date.parse(g[iE]) - t0) / 3600e3;
    return { t0: a, t1: b, bq: g[iR] * (b - a), zBot: g[iB], zTop: g[iT] };
  });
}

/* one rung of the ladder (C.variants): the same seeds, the same particles, one stated change each */
function solveVariant(F, v, seed, particles, segs) {
  return RAD.simulate(F, { lng: C.source.lng, lat: C.source.lat }, {
    release: segs, hours: C.hours, halfLifeHours: RAD.ISOTOPES[C.isotope].hl, startHour: 0,
    depRes: C.depRes, isotope: C.isotope, dtSec: C.dtSec, particles: particles || C.particles, seed,
    ...(v.depositableFraction ? { depositableFraction: v.depositableFraction } : {}),
  }, null);
}
export function ensembleVariant(fx, v, obs, obsRes, seeds, particles) {
  const F = buildField(fx, v.regional);
  const rel = loadRelease(), segs = releaseSegments(rel);
  const st = RAD.sourceTerm(C.source_term, C.isotope);
  const tableBq = segs.reduce((a, g) => a + g.bq, 0);
  /* UNSCEAR's range for the total, as a scale on the table's shape; the centre is the table's own amount */
  const scales = [st.lo / tableBq, 1, st.hi / tableBq].map((s) => s * decayToObs());
  const members = [];
  let released = null;
  for (const sd of seeds) {
    const r = solveVariant(F, v, sd, particles, segs);
    if (released == null) released = { inWindowBq: r.releaseBq, outsideBq: r.releaseOutsideBq, segments: r.releaseSegments };
    const g = H.regrid(r, obs, obsRes);
    for (const s of scales) members.push(g.map((x) => x * s));
  }
  return { ...H.percentiles(members), members: members.length, scales, tableBq, released };
}

/* seeds x the published source-term range (a linear scaling — RAD.ensemble says why) -> p10/p50/p90 per observation cell */
export function ensembleOnCells(F, obs, obsRes, seeds, particles) {
  if (F && F.mid) throw new Error('the preset rung runs on the two-nest field the live simulator fetches');
  const st = RAD.sourceTerm(C.source_term, C.isotope);
  /* the survey's values are decay-compensated to C.obsAsOf; the model's deposit is as of the end of its window, and Cs-137 keeps decaying on the ground */
  const scales = [st.lo / st.bq, 1, st.hi / st.bq].map((s) => s * decayToObs());
  const members = [];
  for (const sd of seeds) {
    const r = solve(F, sd, particles);
    const g = H.regrid(r, obs, obsRes);
    for (const s of scales) members.push(g.map((x) => x * s));
  }
  return { ...H.percentiles(members), members: members.length, scales };
}

export function areaKm2(obs, obsRes) { return obs.map((o) => obsRes * 111.32 * Math.cos(o[1] * Math.PI / 180) * obsRes * 111.32); }

/* Cs-137 radioactive decay from the end of the model window to the survey's reference date. Physical decay only —
   weathering moves caesium within the soil and off the field, which the model does not do and the survey sees. */
export function decayToObs() {
  const days = (Date.parse(C.obsAsOf + 'T00:00:00Z') - (Date.parse(C.startISO) + C.hours * 3600e3)) / 86400e3;
  return Math.pow(0.5, days * 24 / RAD.ISOTOPES[C.isotope].hl);
}
