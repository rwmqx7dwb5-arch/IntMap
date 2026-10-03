/* ============================================================================
 *  IntMap · the 2011 wind for the Fukushima hindcast — tests/fixtures/radiation-hindcast-era5.json.gz
 * ----------------------------------------------------------------------------
 *  The hindcast (docs/RADIATION-MODEL.md §10) must run the model on the wind that actually blew, and
 *  the gate must run it the same way every time — so the ERA5 reanalysis is fetched ONCE, here, and
 *  kept next to the tests. It is not shipped to readers: they get the results (data/radiation-hindcast.json).
 *
 *    node scripts/radiation-hindcast-fetch-wind.mjs
 *
 *  The nests are the ones the live simulator would ask for — RAD.innerPlan and RAD.outerPlan, with the
 *  same levels (AR_LEVELS = 10 and 100 m, the two ERA5 heights Open-Meteo serves) and the same
 *  variables as js/sims.js `hourlyVars(levels, false)` — so the hindcast tests the model as shipped,
 *  not a model fitted to 2011. The window is 14 days from the reactors' shutdown hour.
 *  Open-Meteo's archive is ERA5 (Hersbach et al. 2020, Copernicus Climate Change Service), CC BY 4.0.
 * ==========================================================================*/
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HINDCAST } from './radiation-hindcast-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { RAD } = await import(pathToFileURL(join(ROOT, 'js', 'radiation-model.js')).href);
const C = HINDCAST;
const levels = C.levels;
const vars = [];
for (const l of levels) vars.push('wind_speed_' + l + 'm', 'wind_direction_' + l + 'm');
vars.push('precipitation', 'temperature_2m');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    /* a REAL refusal (rate limit) is the only reason to wait and ask again */
    if (r.status === 429 || r.status >= 500) { await sleep(20000); continue; }
    throw new Error(r.status + ' ' + (await r.text()).slice(0, 200));
  }
  throw new Error('Open-Meteo kept refusing');
}
async function nest(plan) {
  const p = RAD.planPoints(plan), out = [];
  const CH = 20;
  for (let i = 0; i < p.LA.length; i += CH) {
    const la = p.LA.slice(i, i + CH), lo = p.LO.slice(i, i + CH);
    const u = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + la.join(',') + '&longitude=' + lo.join(',')
      + '&wind_speed_unit=ms&timezone=GMT&start_date=' + C.startDate + '&end_date=' + C.endDate + '&hourly=' + vars.join(',');
    const j = await get(u);
    (Array.isArray(j) ? j : [j]).forEach((x) => out.push({ hourly: x.hourly }));
    await sleep(1500);
  }
  return out;
}
const inPlan = RAD.innerPlan(C.source.lng, C.source.lat);
const outPlan = RAD.outerPlan(C.source.lng, C.source.lat, C.meanSpeedForNest, C.hours);
const inner = await nest(inPlan), outer = await nest(outPlan);
const fixture = {
  about: 'ERA5 via Open-Meteo archive (CC BY 4.0), fetched by scripts/radiation-hindcast-fetch-wind.mjs',
  fetchedAt: new Date().toISOString(), levels, vars, startDate: C.startDate, endDate: C.endDate,
  inPlan, outPlan, inner, outer,
};
const dir = join(ROOT, 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });
const buf = gzipSync(Buffer.from(JSON.stringify(fixture)), { level: 9 });
writeFileSync(join(dir, 'radiation-hindcast-era5.json.gz'), buf);
console.log('inner', inner.length, 'outer', outer.length, 'bytes', buf.length);
