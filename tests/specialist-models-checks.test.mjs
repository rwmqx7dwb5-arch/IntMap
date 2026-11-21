/* js/specialist-models.js — 外部の専門モデル（GloFAS 洪水・CAMS 大気質）の入力準備・実行・限界の述べ方。
   ネットは getJSON に注入するので網に触れず走る。実 API での測定は dev-notes/2026-11-20-specialist-models.md。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, discover, analyseFlood, runFlood, floodUrl, floodProbePoints, analyseAir, runAir, aqiBand, RUNNERS } from '../js/specialist-models.js';
import caps from '../js/atlas-cap-model.js';

const days = (start, n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10)).slice(start);
/* 60 past days at `base`, today = 2026-11-30 index 29 in a 46-day series (30 past + 16 future), forecast = `fc` */
function floodJson(lat, lng, base, fc, spread = 0.2) {
  const time = Array.from({ length: 46 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10));   /* 11-01 … 12-16 */
  const q = time.map((_, i) => (i < 29 ? base : fc[Math.min(i - 29, fc.length - 1)]));
  const col = (f) => q.map((v, i) => (v == null ? null : i < 29 ? v : v * f));
  return { latitude: lat, longitude: lng, daily: { time, river_discharge: q, river_discharge_mean: q, river_discharge_median: q, river_discharge_max: col(1 + spread), river_discharge_min: col(1 - spread), river_discharge_p25: col(1 - spread / 2), river_discharge_p75: col(1 + spread / 2) } };
}
const TODAY = '2026-11-30';

test('flood: the peak is graded against the river\'s own past, with the ensemble spread and whether it agrees', () => {
  const r = analyseFlood(floodJson(35.2, 136.9, 10, [10, 12, 40, 20]), { lat: 35.17, lng: 136.9 }, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.peak, 40); assert.equal(r.peakDate, '2026-12-02'); assert.equal(r.daysToPeak, 2);
  assert.equal(r.baselineMedian, 10); assert.equal(r.ratio, 4); assert.equal(r.grade, 'high');
  assert.equal(r.ensemble.max, 48); assert.equal(r.ensemble.min, 32);
  assert.equal(r.gradeAgreement, true, '3.2x–4.8x are both "high"');
  const wide = analyseFlood(floodJson(35.2, 136.9, 10, [10, 20, 20]), { lat: 35.2, lng: 136.9 }, TODAY);
  const w2 = analyseFlood(floodJson(35.2, 136.9, 10, [10, 20, 20], 0.9), { lat: 35.2, lng: 136.9 }, TODAY);
  assert.equal(wide.gradeAgreement, true);
  assert.equal(w2.gradeAgreement, false, 'min 0.2x is normal, max 3.8x is high: the members disagree and the answer must say so');
  assert.deepEqual(w2.gradeRange, ['normal', 'high']);
});

test('flood: a point that is not on a resolved river is refused, not graded; a short past is refused', () => {
  const dry = analyseFlood(floodJson(24, 12, 0, [0, 0]), { lat: 24, lng: 12 }, TODAY);
  assert.equal(dry.ok, false); assert.equal(dry.code, 'NOT_A_RIVER');
  const noPast = analyseFlood(floodJson(1, 1, 10, [10]), { lat: 1, lng: 1 }, '2026-11-05');
  assert.equal(noPast.ok, false); assert.equal(noPast.code, 'NO_BASELINE');
  assert.equal(analyseFlood(null, { lat: 0, lng: 0 }, TODAY).code, 'NO_DATA');
});

test('flood input preparation: 9 cells around the point in ONE request, the main stem (most water) is the one run', async () => {
  const pts = floodProbePoints(50.94, 6.96);
  assert.equal(pts.length, 9);
  const u = new URL(floodUrl(50.94, 6.96));
  assert.equal(u.searchParams.get('latitude').split(',').length, 9);
  assert.equal(u.searchParams.get('longitude').split(',').length, 9);
  const seen = [];
  const io = { now: new Date('2026-11-30T10:00:00Z'), getJSON: async (url) => { seen.push(url); return pts.map((p, i) => floodJson(p[0], p[1], i === 4 ? 700 : i === 2 ? 700 : 1 + i, [700, 2500])); } };
  const r = await runFlood({ lat: 50.94, lng: 6.96 }, io);
  assert.equal(seen.length, 1, 'one request, not nine');
  assert.equal(r.ok, true); assert.equal(r.probed, 9); assert.equal(r.baselineMedian, 700); assert.equal(r.peak, 2500);
  assert.equal(r.grade, 'high');
  const down = await runFlood({ lat: 1, lng: 1 }, { now: new Date(), getJSON: async () => null });
  assert.equal(down.ok, false); assert.equal(down.code, 'UPSTREAM_UNREAD', 'an unanswered service is not "no flood"');
});

function airJson(vals, nulls) {
  const time = Array.from({ length: 72 }, (_, i) => new Date(Date.UTC(2026, 10, 30, i)).toISOString().slice(0, 16));
  const mk = (v) => time.map((_, i) => (nulls ? null : v + (i === 30 ? v : 0)));
  return { hourly: { time, us_aqi: mk(vals.aqi), pm2_5: mk(vals.pm25), pm10: mk(vals.pm10), nitrogen_dioxide: mk(vals.no2), sulphur_dioxide: mk(3), ozone: mk(vals.o3) } };
}

test('air: band by EPA breakpoints, the pollutant furthest above WHO guidance, and no invented spread outside Europe', () => {
  assert.equal(aqiBand(50)[0], 'Good'); assert.equal(aqiBand(51)[0], 'Moderate'); assert.equal(aqiBand(301)[0], 'Hazardous');
  const r = analyseAir(airJson({ aqi: 100, pm25: 40, pm10: 60, no2: 10, o3: 50 }), airJson({}, true), '2026-11-30T00:00');
  assert.equal(r.ok, true); assert.equal(r.domainUsed, 'cams_global');
  assert.equal(r.aqiMax, 200); assert.equal(r.band[0], 'Unhealthy'); assert.equal(r.leadPollutant, 'pm2_5');
  assert.equal(r.spread, null, 'the Europe domain returned only nulls: no second model, so no spread');
});

test('air: where both CAMS domains answer, their disagreement is the reported spread and the finer domain leads', () => {
  const r = analyseAir(airJson({ aqi: 35, pm25: 10, pm10: 20, no2: 20, o3: 40 }), airJson({ aqi: 30, pm25: 8, pm10: 18, no2: 22, o3: 30 }), '2026-11-30T00:00');
  assert.equal(r.domainUsed, 'cams_europe');
  assert.equal(r.spread.globalAqiMax, 70); assert.equal(r.spread.europeAqiMax, 60); assert.equal(r.spread.aqiMaxDiff, 10);
  assert.equal(r.spread.sameBand, true);
  const split = analyseAir(airJson({ aqi: 35, pm25: 10, pm10: 20, no2: 20, o3: 40 }), airJson({ aqi: 20, pm25: 8, pm10: 18, no2: 22, o3: 30 }), '2026-11-30T00:00');
  assert.equal(split.spread.sameBand, false, '70 is Moderate, 40 is Good: the answer must say the bands differ');
  assert.equal(analyseAir(null, null, '2026-11-30T00:00').code, 'NO_DATA');
  assert.equal(analyseAir(null, null, 'x').ok, false);
});

test('air runner: asks both domains, and an unanswered service is not "clean air"', async () => {
  const urls = [];
  const r = await runAir({ lat: 48.85, lng: 2.35 }, { now: new Date('2026-11-30T05:30:00Z'), getJSON: async (u) => { urls.push(u); return u.includes('cams_europe') ? airJson({ aqi: 30, pm25: 9, pm10: 15, no2: 12, o3: 30 }) : airJson({ aqi: 35, pm25: 10, pm10: 20, no2: 20, o3: 40 }); } });
  assert.equal(urls.length, 2); assert.ok(urls.some((u) => u.includes('domains=cams_global')) && urls.some((u) => u.includes('domains=cams_europe')));
  assert.equal(r.ok, true); assert.equal(r.europeAnswered, true);
  const none = await runAir({ lat: 1, lng: 1 }, { now: new Date(), getJSON: async () => null });
  assert.equal(none.code, 'UPSTREAM_UNREAD');
});

test('discovery: integrated models are found by the question, the unrunnable ones come back WITH their reason', () => {
  assert.equal(discover({ text: 'will the river flood this week' })[0].id, 'flood.glofas');
  assert.equal(discover({ text: '洪水の予測' })[0].id, 'flood.glofas');
  assert.equal(discover({ text: 'PM2.5 smog forecast' })[0].id, 'air.cams');
  const heat = discover({ domain: 'heat' })[0];
  assert.equal(heat.status, 'not-integrated'); assert.ok(heat.why[0].length > 40 && heat.why[1].length > 20);
  for (const m of MODELS) {
    if (m.status === 'integrated') { assert.equal(typeof RUNNERS[m.run], 'function', m.id + ' names a runner that exists'); assert.ok(m.limits[0].length && m.limits[1].length === m.limits[0].length && m.uncertainty && m.coverage); }
    else assert.ok(m.why && m.why[0] && m.why[1], m.id + ' says why it cannot run');
  }
});

test('the doors: every integrated model is runnable through model.run and the schema offers exactly the integrated ids', () => {
  const run = caps.find((c) => c.row[0] === 'model.run'), disc = caps.find((c) => c.row[0] === 'model.discover');
  assert.ok(run && disc);
  const ids = run.schema().properties.model.enum;
  assert.deepEqual([...ids].sort(), MODELS.filter((m) => m.status === 'integrated').map((m) => m.id).sort());
});
