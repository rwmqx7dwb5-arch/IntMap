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
export const C = HINDCAST;

export function loadFixture() { return JSON.parse(gunzipSync(readFileSync(join(ROOT, 'tests', 'fixtures', 'radiation-hindcast-era5.json.gz'))).toString()); }
export function loadBundle() { return JSON.parse(readFileSync(join(ROOT, 'data', 'radiation-hindcast.json'), 'utf8')); }

export function buildField(fx) {
  const times = fx.inner[0].hourly.time;
  const s0 = RAD.resolveStart(times, C.startISO);
  const need = C.hours + 2;
  const inner = RAD.buildNest(fx.inPlan, fx.inner, fx.levels, s0, need);
  const outer = RAD.buildNest(fx.outPlan, fx.outer, fx.levels, s0, need);
  return { inner, outer, outerOK: true, startHour: 0, levels: fx.levels, cx: C.source.lng, cy: C.source.lat, half: outer.half };
}

/* one seeded solve, exactly the options js/sims.js passes for the `fukushima` preset */
export function solve(F, seed, particles) {
  const st = RAD.sourceTerm(C.source_term, C.isotope);
  return RAD.simulate(F, { lng: C.source.lng, lat: C.source.lat }, {
    bq: st.bq, hours: C.hours, emitHours: st.emitHours, halfLifeHours: RAD.ISOTOPES[C.isotope].hl, startHour: 0,
    depRes: C.depRes, isotope: C.isotope, releaseHeight: st.rise, dtSec: C.dtSec, particles: particles || C.particles, seed,
  }, null);
}

/* seeds x the published source-term range (a linear scaling — RAD.ensemble says why) -> p10/p50/p90 per observation cell */
export function ensembleOnCells(F, obs, obsRes, seeds, particles) {
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
