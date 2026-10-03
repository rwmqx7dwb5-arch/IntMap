/* ============================================================================
 *  IntMap · the 2011 answer-check for the plume model — data/radiation-hindcast.json
 * ----------------------------------------------------------------------------
 *    node scripts/build-radiation-hindcast.mjs            fetch the survey, run the model, write the bundle
 *    node scripts/build-radiation-hindcast.mjs --offline  reuse the survey already in the bundle (re-run the model only)
 *
 *  WHAT IS COMPARED
 *   obs    the measured Cs-137 ground deposition around Fukushima Daiichi: the mean of the aerial
 *          radiation monitoring of the Japanese government (MEXT / NRA) in each 0.05° cell, as compiled
 *          and published by IRSN — Dumont Le Brazidec & Saunier (2022), Zenodo 10.5281/zenodo.7016491,
 *          CC BY 4.0, 1,740 cells, 1.72 million aerial measurements. The file is fetched from Zenodo
 *          and its md5 (the one Zenodo publishes) is checked before anything is written.
 *   model  js/radiation-model.js as shipped — the `fukushima` preset (UNSCEAR 2020/21 source term,
 *          release height and duration), fixed 2011 ERA5 wind (scripts/radiation-hindcast-fetch-wind.mjs),
 *          3 seeds x the source term's published range (6 / 10 / 20 PBq) = 9 members.
 *   Nothing is fitted to the survey. The conditions are in scripts/radiation-hindcast-config.mjs and
 *   are the preset's; the one thing the model cannot do that the accident did is vary its release rate
 *   in time, which docs/RADIATION-MODEL.md §10 says out loud.
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAD, H, C, loadFixture, buildField, ensembleOnCells, areaKm2, decayToObs } from './radiation-hindcast-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'radiation-hindcast.json');

/* ⚠ (#729) 出自は値である。npm run check:datagov がこの宣言と束の実体・js/reference-data.js の DATA_SOURCES を突き合わせる。
   書くのは上流が述べていることだけ（基準日を上流は述べていないので、下で asOfNote が「推定」と言う）。 */
export const GOVERNANCE = {
  'data/radiation-hindcast.json': {
    publisher: 'Japanese government (MEXT, later NRA) aerial radiation monitoring; compiled by IRSN (France)',
    url: 'https://doi.org/10.5281/zenodo.7016491',
    licence: 'CC-BY-4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Dumont Le Brazidec & Saunier (2022), IRSN — Zenodo doi:10.5281/zenodo.7016491, CC BY 4.0; underlying measurements: MEXT / Nuclear Regulation Authority, Japan. Wind: ERA5 (Hersbach et al. 2020, Copernicus Climate Change Service) via Open-Meteo, CC BY 4.0.',
    /* the DATA_SOURCES row (js/reference-data.js) that pays the attribution — matched by exact name */
    paidBy: 'Fukushima Cs-137 deposition survey (MEXT/NRA via IRSN, CC BY 4.0)',
    /* a historical event: the survey is not republished on a schedule */
    cadence: 'static',
    builtBy: 'scripts/build-radiation-hindcast.mjs',
  },
};
const G = GOVERNANCE['data/radiation-hindcast.json'];
const ZENODO = 'https://zenodo.org/api/records/7016491';
/* Zenodo refuses a request that does not identify itself (403 observed 2026-10-03 for the default fetch agent) */
const HDR = { headers: { accept: 'application/json', 'user-agent': 'IntMap-build/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)' } };
const offline = process.argv.includes('--offline');

let obs, survey;
if (offline) {
  const b = JSON.parse(readFileSync(OUT, 'utf8')); obs = b.obs.cells; survey = b.survey;
} else {
  const rec = await (await fetch(ZENODO, HDR)).json();
  const f = rec.files.find((x) => x.key === '137Cs_deposit_per_cell_dataset.txt');
  const buf = Buffer.from(await (await fetch(f.links.self, HDR)).arrayBuffer());
  const md5 = createHash('md5').update(buf).digest('hex');
  if ('md5:' + md5 !== f.checksum) throw new Error('md5 mismatch: ' + md5 + ' vs ' + f.checksum);
  const rows = buf.toString('utf8').trim().split(/\r?\n/).slice(1).map((l) => l.trim().split(/\s+/));
  /* columns: id, n measurements, min, max, mean, [sd — empty for a 1-measurement cell], lng, lat */
  obs = rows.map((r) => [+r[r.length - 2], +r[r.length - 1], Math.round(+r[4]), +r[1]]);
  survey = {
    file: f.key, bytes: buf.length, md5, zenodoDoi: rec.doi, publicationDate: rec.metadata.publication_date,
    cells: obs.length, measurements: obs.reduce((a, o) => a + o[3], 0),
  };
}
const obsRes = C.obsRes;
const ar = areaKm2(obs, obsRes);
const obsBq = obs.map((o) => o[2]);
survey.totalTBq = +(obs.reduce((a, o, i) => a + o[2] * ar[i] * 1e6, 0) / 1e12).toFixed(1);
survey.minBqM2 = Math.min(...obsBq); survey.maxBqM2 = Math.max(...obsBq);

const F = buildField(loadFixture());
const t0 = Date.now();
const E = ensembleOnCells(F, obs, obsRes, C.seeds);
const metrics = H.compare(obsBq, E, ar, C.fmsBq);
const modelTBq = E.p50.reduce((a, v, i) => a + v * ar[i] * 1e6, 0) / 1e12;
metrics.massRatioP50 = modelTBq / survey.totalTBq;
const r3 = (x) => +(+x).toPrecision(4);
for (const k of Object.keys(metrics)) if (typeof metrics[k] === 'number') metrics[k] = r3(metrics[k]);
for (const k of Object.keys(metrics.fms)) metrics.fms[k] = r3(metrics.fms[k]);

const st = RAD.sourceTerm(C.source_term, C.isotope);
const out = {
  v: 1,
  title: 'Fukushima Daiichi 2011 — measured Cs-137 ground deposition against the plume model',
  /* governance facets, in the vocabulary js/data-governance.js reads (check:datagov) */
  publisher: G.publisher,
  url: G.url,
  src: 'Dumont Le Brazidec J., Saunier O. (2022) Statistics on caesium 137 deposition around the Fukushima-Daiichi plant after the 2011 accident. Zenodo. doi:10.5281/zenodo.7016491 — aerial monitoring results of MEXT/NRA, cell means compiled by IRSN',
  licence: G.licence,
  licenceUrl: G.licenceUrl,
  attribution: G.attribution,
  paidBy: G.paidBy,
  retrievedAt: new Date().toISOString().slice(0, 10),
  generatedAt: new Date().toISOString(),
  builtBy: G.builtBy,
  /* what the data is ABOUT: the deposit on the ground, decay-compensated to this date by the MEXT/NRA maps this compilation cites */
  asOf: C.obsAsOf,
  asOfNote: 'The IRSN file does not state its reference date. The paper that uses it (Dumont Le Brazidec et al. 2023, GMD 16:1039) cites MEXT/NRA, "Results of the Fifth Airborne Monitoring Survey and Airborne Monitoring Survey Outside 80 km", 28 Sep 2012, whose Cs-137 maps are decay-compensated to 2012-06-28. That is the date used; at Cs-137\'s 30.08-year half-life a different compensation date within 2011-2012 moves the values by under 4%.',
  cadence: G.cadence,
  survey,
  /* the model's conditions — one place, scripts/radiation-hindcast-config.mjs */
  conditions: {
    source: C.source, startISO: C.startISO, hours: C.hours, isotope: C.isotope, preset: C.source_term,
    releaseBqCentral: st.bq, releaseBqRange: [st.lo, st.hi], emitHours: st.emitHours, releaseHeightM: st.rise,
    particles: C.particles, seeds: C.seeds, members: E.members, depRes: C.depRes, obsRes,
    wind: 'ERA5 reanalysis via Open-Meteo archive, 10 m and 100 m, nests = RAD.innerPlan / RAD.outerPlan',
    decayToObsDate: r3(decayToObs()),
  },
  metrics,
  floorBqM2: H.FLOOR_BQ_M2,
  /* cells: [lng, lat, measured Bq/m2, number of aerial measurements] */
  obs: { fields: ['lng', 'lat', 'bq_m2', 'n'], cells: obs },
  /* cells in the same order: [p10, p50, p90] of the model, Bq/m2, three significant figures */
  model: { fields: ['p10', 'p50', 'p90'], cells: Array.from(E.p50.keys()).map((i) => [E.p10[i], E.p50[i], E.p90[i]].map((x) => +x.toPrecision(3))) },
};
writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, (Date.now() - t0) / 1000 + ' s');
console.log(JSON.stringify(metrics, null, 1));
console.log('survey', JSON.stringify(survey), 'model TBq in survey cells', modelTBq.toFixed(0));
