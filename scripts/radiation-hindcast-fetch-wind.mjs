/* ============================================================================
 *  IntMap · the 2011 wind for the Fukushima hindcast — tests/fixtures/radiation-hindcast-era5.json.gz
 * ----------------------------------------------------------------------------
 *  The hindcast (docs/RADIATION-MODEL.md §10) must run the model on the wind that actually blew, and
 *  the gate must run it the same way every time — so the ERA5 reanalysis is fetched ONCE, here, and
 *  kept next to the tests. It is not shipped to readers: they get the results (data/radiation-hindcast.json).
 *
 *    node scripts/radiation-hindcast-fetch-wind.mjs            fetch the nests the fixture does not have yet
 *    node scripts/radiation-hindcast-fetch-wind.mjs --refetch  fetch every nest again
 *
 *  A nest already in the fixture is KEPT (the regional nest, RAD.midPlan, was added after the first two
 *  were fixed; re-fetching those would make the recorded answer-check a function of the day it was redone).
 *
 *  The nests are RAD.innerPlan and RAD.outerPlan (the two the live simulator asks for) plus RAD.midPlan (the regional nest only the ladder rungs use), with the
 *  same levels (AR_LEVELS = 10 and 100 m, the two ERA5 heights Open-Meteo serves) and the same
 *  variables as js/sims.js `hourlyVars(levels, false)` — so the hindcast tests the model as shipped,
 *  not a model fitted to 2011. The window is 14 days from the reactors' shutdown hour.
 *  Open-Meteo's archive is ERA5 (Hersbach et al. 2020, Copernicus Climate Change Service), CC BY 4.0.
 * ==========================================================================*/
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
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
const dir = join(ROOT, 'tests', 'fixtures'), FILE = join(dir, 'radiation-hindcast-era5.json.gz');
const prev = !process.argv.includes('--refetch') && existsSync(FILE) ? JSON.parse(gunzipSync(readFileSync(FILE)).toString()) : null;
const same = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);
const plans = {
  in: RAD.innerPlan(C.source.lng, C.source.lat),
  mid: RAD.midPlan(C.source.lng, C.source.lat),
  out: RAD.outerPlan(C.source.lng, C.source.lat, C.meanSpeedForNest, C.hours),
};
const data = { in: 'inner', mid: 'mid', out: 'outer' };
const fixture = {
  about: 'ERA5 via Open-Meteo archive (CC BY 4.0), fetched by scripts/radiation-hindcast-fetch-wind.mjs',
  fetchedAt: (prev && prev.fetchedAt) || new Date().toISOString(), fetchedAtByNest: (prev && prev.fetchedAtByNest) || {},
  levels, vars, startDate: C.startDate, endDate: C.endDate,
};
for (const k of Object.keys(plans)) {
  const key = data[k], planKey = k + 'Plan';
  /* keep a nest only when it was fetched for the SAME plan and the same window */
  const keep = prev && prev[key] && same(prev[planKey], plans[k]) && prev.startDate === C.startDate && prev.endDate === C.endDate;
  fixture[planKey] = plans[k];
  fixture[key] = keep ? prev[key] : await nest(plans[k]);
  if (!keep) fixture.fetchedAtByNest[key] = new Date().toISOString();
  else if (!fixture.fetchedAtByNest[key]) fixture.fetchedAtByNest[key] = fixture.fetchedAt;
  console.log(key, keep ? 'kept' : 'fetched', fixture[key].length, 'points');
}
mkdirSync(dir, { recursive: true });
const buf = gzipSync(Buffer.from(JSON.stringify(fixture)), { level: 9 });
writeFileSync(FILE, buf);
console.log('bytes', buf.length);
