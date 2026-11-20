/* ============================================================================
 *  IntMap · specialist models — find, feed, run, and state the limits   (js/specialist-models.js)
 * ----------------------------------------------------------------------------
 *  IntMap does not re-implement every domain model. For flood routing, air-quality chemistry,
 *  urban heat, grid planning, crop yield … a specialist model already exists somewhere. What Atlas
 *  needs is a way to (1) FIND the right one for a question, (2) PREPARE its input from a place,
 *  (3) RUN it, and (4) hand back the result WITH its assumptions, where it applies, and a measure
 *  of how uncertain it is. This module is that path. It is pure: the network is injected
 *  (`getJSON(url) -> object|null`), so the same code runs in the page, in Node tests, and on the
 *  fixtures. The Atlas doors are in js/atlas-cap-model.js.
 *
 *  THE REGISTRY (MODELS) is the one list of what can be run. An entry either has a `run` (integrated:
 *  Atlas can execute it now) or says why it has none (`status: 'not-integrated'` + `why`) — the
 *  discovery door answers honestly with both, so Atlas never offers a model it cannot run and never
 *  says "no model exists" for one that exists but is not wired.
 *
 *  Integrated today (2026-11-20, both verified live against the public APIs, see dev-notes/2026-11-20-specialist-models.md):
 *    flood.glofas  — GloFAS river-discharge forecast via the Open-Meteo Flood API (Copernicus
 *                    Emergency Management Service / ECMWF; 0.05° ≈ 5 km grid; ensemble).
 *    air.cams      — CAMS atmospheric-composition forecast via the Open-Meteo Air Quality API
 *                    (Copernicus Atmosphere Monitoring Service / ECMWF; global 0.4° and Europe 0.1°).
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';
const T = IntMapLang.pickArgs();   /* [en, jp] — the shape the audits exempt (a sentence declared once, read by position) */

const FLOOD_URL = 'https://flood-api.open-meteo.com/v1/flood';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const km = (aLat, aLng, bLat, bLng) => {
  const R = 6371, r = Math.PI / 180, dLa = (bLat - aLat) * r, dLo = (bLng - aLng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const med = (xs) => { const s = xs.filter((v) => v != null).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/* ── FLOOD · GloFAS ────────────────────────────────────────────────────────────────────────────
   Input: a coordinate. The API snaps it to the nearest GloFAS river cell and returns that cell's
   coordinates, so the SNAP DISTANCE is part of the result (a point far from any river is snapped
   to a river that is not "here"). The forecast comes with the ensemble's daily mean/median/min/
   max/p25/p75; the spread at the peak is the uncertainty we report.
   ⚠ This API returns discharge in m³/s, NOT a flood extent, a water depth or a return period.
   The grade below is therefore RELATIVE TO THAT CELL'S OWN RECENT PAST (the response's past_days
   window), and the answer says so. The 1.5 / 3 ratios are labels, not hazard thresholds:
   observed 2026-11-20 on 7 river points (Rhine at Cologne, Seine at Paris, Tokyo, Nagoya, Patna, Delhi, New Orleans) the peak/median ratio ran 0.31–3.64, with 3.58 and 3.64 on the two rivers that had rain forecast; they are a rough split of "inside the recent range" from "well outside it" and nothing more; they lapse if
   Open-Meteo starts publishing per-cell return-period thresholds — then use those. */
export const FLOOD_RATIO_ELEVATED = 1.5, FLOOD_RATIO_HIGH = 3;

export const FLOOD_PROBE_STEP = 0.05;   /* the GloFAS grid step in degrees — the API snaps to the nearest river cell, which is often a tributary */
/* INPUT PREPARATION: the 3×3 cells around the point (one request, comma-separated coordinates). The main stem is the
   cell with the largest typical flow, so the run is made on that one and the answer says which cell and how many were probed. */
export function floodProbePoints(lat, lng) {
  const pts = []; for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) pts.push([Math.max(-90, Math.min(90, lat + i * FLOOD_PROBE_STEP)), lng + k * FLOOD_PROBE_STEP]);
  return pts;
}
export function floodUrl(lat, lng, opts) {
  const o = opts || {};
  const vars = ['river_discharge', 'river_discharge_mean', 'river_discharge_median', 'river_discharge_max', 'river_discharge_min', 'river_discharge_p25', 'river_discharge_p75'];
  const pts = o.single ? [[+lat, +lng]] : floodProbePoints(+lat, +lng);
  return FLOOD_URL + '?latitude=' + pts.map((p) => p[0].toFixed(4)).join(',') + '&longitude=' + pts.map((p) => p[1].toFixed(4)).join(',') + '&daily=' + vars.join(',') + '&past_days=' + (o.pastDays || 60) + '&forecast_days=' + (o.forecastDays || 16);
}

/* `j` = the API's JSON, `req` = {lat,lng}, `today` = 'YYYY-MM-DD' (UTC; injected so a test is not a clock test). */
export function analyseFlood(j, req, today) {
  const d = j && j.daily;
  if (!d || !Array.isArray(d.time) || !Array.isArray(d.river_discharge)) return { ok: false, code: 'NO_DATA', why: 'The flood service returned no discharge series.' };
  const t = d.time, q = d.river_discharge.map(num);
  const iNow = t.findIndex((x) => x >= today);
  if (iNow < 0 || iNow >= t.length - 1) return { ok: false, code: 'NO_FORECAST', why: 'The series has no forecast days after today.' };
  const past = q.slice(0, iNow).filter((v) => v != null), fut = q.slice(iNow);
  if (past.length < 14) return { ok: false, code: 'NO_BASELINE', why: 'Fewer than 14 past days — too short to say what is normal for this river.' };
  const base = med(past);
  if (!(base > 0.1)) return { ok: false, code: 'NOT_A_RIVER', snapKm: r2(km(req.lat, req.lng, j.latitude, j.longitude)), baseline: r2(base), why: 'The nearest model cell carries almost no flow (median ' + r2(base) + ' m³/s): the point is not on a river the 5 km model resolves, so nothing can be said about flooding here.' };
  let pk = -1; fut.forEach((v, i) => { if (v != null && (pk < 0 || v > fut[pk])) pk = i; });
  if (pk < 0) return { ok: false, code: 'NO_FORECAST', why: 'No forecast value was finite.' };
  const at = (k) => num(d[k] && d[k][iNow + pk]);
  const peak = fut[pk], ens = { min: at('river_discharge_min'), p25: at('river_discharge_p25'), median: at('river_discharge_median'), p75: at('river_discharge_p75'), max: at('river_discharge_max'), mean: at('river_discharge_mean') };
  const ratio = peak / base;
  const ratioMax = ens.max != null ? ens.max / base : null, ratioMin = ens.min != null ? ens.min / base : null;
  const grade = (v) => (v >= FLOOD_RATIO_HIGH ? 'high' : v >= FLOOD_RATIO_ELEVATED ? 'elevated' : 'normal');
  return {
    ok: true, code: 'OK',
    snapKm: r2(km(req.lat, req.lng, j.latitude, j.longitude)), cell: { lat: j.latitude, lng: j.longitude },
    baselineMedian: r2(base), pastDays: past.length, peak: r2(peak), peakDate: t[iNow + pk], daysToPeak: pk, ratio: r2(ratio), grade: grade(ratio),
    ensemble: ens, ratioRange: [r2(ratioMin), r2(ratioMax)], gradeRange: [ratioMin != null ? grade(ratioMin) : null, ratioMax != null ? grade(ratioMax) : null],
    /* the ensemble disagrees about the grade when its lowest and highest members fall in different bands — the plain-language uncertainty */
    gradeAgreement: ratioMin != null && ratioMax != null ? grade(ratioMin) === grade(ratioMax) : null,
    series: t.slice(iNow).map((x, i) => ({ date: x, q: fut[i] == null ? null : r2(fut[i]) })),
  };
}

/* ── AIR · CAMS ────────────────────────────────────────────────────────────────────────────────
   Two CAMS domains answer the same question: global (0.4°, everywhere) and Europe (0.1°, only inside Europe,
   null elsewhere). Where both answer, their disagreement IS a measured model spread; where only the global
   one does, there is no spread to report and the answer says so (it does not invent one).
   US AQI bands are EPA's published breakpoints (AirNow Technical Assistance Document, 2018); the pollutant
   reference levels are the WHO 2021 24-hour guidelines (PM2.5 15, PM10 45, NO2 25, SO2 40 µg/m³) and the WHO
   peak-season 8-h O3 guideline 100 — used only to say WHICH pollutant is furthest above guidance, never as a health claim. */
export const US_AQI_BANDS = [{ max: 50, label: T('Good', '良い') }, { max: 100, label: T('Moderate', '普通') }, { max: 150, label: T('Unhealthy for sensitive groups', '敏感な人に有害') }, { max: 200, label: T('Unhealthy', '有害') }, { max: 300, label: T('Very unhealthy', '非常に有害') }, { max: Infinity, label: T('Hazardous', '危険') }];
export const WHO_2021 = { pm2_5: 15, pm10: 45, nitrogen_dioxide: 25, sulphur_dioxide: 40, ozone: 100 };
export const AIR_VARS = ['pm2_5', 'pm10', 'nitrogen_dioxide', 'sulphur_dioxide', 'ozone', 'us_aqi'];
export const aqiBand = (v) => { const b = US_AQI_BANDS.find((x) => v <= x.max); return b ? b.label : null; };

export function airUrl(lat, lng, domain, opts) {
  return AIR_URL + '?latitude=' + (+lat).toFixed(4) + '&longitude=' + (+lng).toFixed(4) + '&hourly=' + AIR_VARS.join(',') + '&domains=' + domain + '&forecast_days=' + ((opts && opts.forecastDays) || 3) + '&timezone=UTC';
}

const stat = (xs) => { const v = xs.filter((x) => x != null); if (!v.length) return null; let mx = v[0], ix = xs.indexOf(v[0]); xs.forEach((x, i) => { if (x != null && x > mx) { mx = x; ix = i; } }); return { max: mx, maxIndex: ix, mean: v.reduce((a, b) => a + b, 0) / v.length, n: v.length }; };

function oneDomain(j, nowIso) {
  const h = j && j.hourly; if (!h || !Array.isArray(h.time)) return null;
  const i0 = Math.max(0, h.time.findIndex((x) => x >= nowIso));
  const cut = (k) => (Array.isArray(h[k]) ? h[k].slice(i0).map(num) : []);
  const aqi = stat(cut('us_aqi')); if (!aqi) return null;   /* an all-null series: this domain does not cover the point */
  const poll = {}; for (const k of Object.keys(WHO_2021)) { const s = stat(cut(k)); if (s) poll[k] = { max: r2(s.max), mean: r2(s.mean) }; }
  const times = h.time.slice(i0);
  return { aqiMax: Math.round(aqi.max), aqiMean: Math.round(aqi.mean), aqiMaxAt: times[aqi.maxIndex], hours: aqi.n, pollutants: poll, series: cut('us_aqi') };
}

/* `jg` global, `je` europe (either may be null: not asked / no answer). `nowIso` 'YYYY-MM-DDTHH:00' UTC. */
export function analyseAir(jg, je, nowIso) {
  const g = oneDomain(jg, nowIso), e = oneDomain(je, nowIso);
  if (!g && !e) return { ok: false, code: 'NO_DATA', why: 'Neither CAMS domain returned a usable air-quality forecast for this point.' };
  const main = e || g;   /* the finer domain where it exists */
  let lead = null, leadRatio = -1;
  for (const k of Object.keys(main.pollutants)) { const r = main.pollutants[k].max / WHO_2021[k]; if (r > leadRatio) { leadRatio = r; lead = k; } }
  let spread = null;
  if (g && e) {
    const dAqi = Math.abs(g.aqiMax - e.aqiMax);
    const pm = g.pollutants.pm2_5 && e.pollutants.pm2_5 ? Math.abs(g.pollutants.pm2_5.mean - e.pollutants.pm2_5.mean) : null;
    spread = { aqiMaxDiff: dAqi, pm25MeanDiff: pm == null ? null : r2(pm), globalAqiMax: g.aqiMax, europeAqiMax: e.aqiMax, sameBand: aqiBand(g.aqiMax)[0] === aqiBand(e.aqiMax)[0] };
  }
  return { ok: true, code: 'OK', domainUsed: e ? 'cams_europe' : 'cams_global', domains: { global: g, europe: e }, aqiMax: main.aqiMax, aqiMean: main.aqiMean, aqiMaxAt: main.aqiMaxAt, band: aqiBand(main.aqiMax), leadPollutant: lead, leadRatioToWHO: lead ? r2(leadRatio) : null, pollutants: main.pollutants, spread, hours: main.hours };
}

/* ── THE REGISTRY ──────────────────────────────────────────────────────────────────────────────
   `needs`: what the runner must be given (so Atlas can prepare it). `limits`: what the model does NOT say.
   `ref`: the place a reader can check the model (not an endorsement). Not-integrated rows carry the REASON. */
export const MODELS = [
  {
    id: 'flood.glofas', domain: 'flood', status: 'integrated', run: 'runFlood',
    name: T('GloFAS river-discharge forecast', 'GloFAS 河川流量予報'),
    provider: 'Copernicus Emergency Management Service / ECMWF, served by Open-Meteo Flood API (CC BY 4.0)',
    ref: 'https://open-meteo.com/en/docs/flood-api',
    answers: T('How much water the nearest modelled river will carry over the next 16 days compared with its own recent norm, with the ensemble spread.', '最寄りの河川が今後 16 日間に運ぶ水量を、その川自身の直近の水準と比べて、アンサンブルの幅つきで答える。'),
    needs: ['lat/lng (or a place name) near a river'],
    keywords: 'flood river discharge inundation overflow glofas rainfall runoff 洪水 河川 氾濫 流量 増水 浸水',
    coverage: 'global rivers resolved at 0.05° (~5 km); small streams and urban drainage are not resolved',
    limits: T(['Gives discharge (m³/s), not a flood extent, depth or damage.', 'No local flood defences, dams’ operating rules or drainage are modelled.', 'Grades are relative to the cell\'s own past 60 days, not return-period thresholds.', 'The point is snapped to the nearest river cell; the snap distance is stated.'], ['出力は流量（m³/s）で、浸水範囲・水深・被害ではない。', '堤防・ダムの運用・排水は入っていない。', '等級はその地点の直近 60 日との比で、再現期間の閾値ではない。', '地点は最寄りの河川セルへ寄せられ、その距離を述べる。']),
    uncertainty: 'ensemble (min / p25 / median / p75 / max) at the peak day; whether its members agree on the grade',
  },
  {
    id: 'air.cams', domain: 'air', status: 'integrated', run: 'runAir',
    name: T('CAMS air-quality forecast', 'CAMS 大気質予報'),
    provider: 'Copernicus Atmosphere Monitoring Service / ECMWF, served by Open-Meteo Air Quality API (CC BY 4.0)',
    ref: 'https://open-meteo.com/en/docs/air-quality-api',
    answers: T('PM2.5 / PM10 / NO₂ / SO₂ / O₃ and US AQI hour by hour for the next 72 h, which pollutant is furthest above WHO guidance, and — inside Europe — how far two model resolutions disagree.', '今後 72 時間の PM2.5・PM10・NO₂・SO₂・O₃ と US AQI を時間ごとに、WHO 指針を最も超える物質、欧州内では 2 つの解像度のモデルの食い違いを答える。'),
    needs: ['lat/lng (or a place name)'],
    keywords: 'air quality pollution smog pm2.5 pm10 ozone no2 so2 aqi haze cams 大気 汚染 大気質 微小粒子 オゾン スモッグ',
    coverage: 'global at 0.4° (~40 km); Europe also at 0.1° (~11 km)',
    limits: T(['A grid-cell average: street-level and near-source concentrations are higher than the cell value.', 'Chemistry and emissions are the model\'s (inventories lag by years); a sudden local source is not seen.', 'US AQI is a US index; local national indices differ.', 'It is not a health diagnosis.'], ['格子セルの平均で、道路沿い・発生源近傍の濃度はこれより高い。', '排出インベントリは数年遅れで、突発的な地域の発生源は見えない。', 'US AQI は米国の指数で、各国の指数とは異なる。', '健康診断ではない。']),
    uncertainty: 'where Europe is covered, the difference between the 0.4° global and 0.1° Europe domains; elsewhere none is available and the answer says so',
  },
  { id: 'heat.urban', domain: 'heat', status: 'not-integrated', keywords: 'urban heat island surface temperature heat stress 都市熱 ヒートアイランド 熱中症', name: T('Urban heat island / heat stress model', '都市熱・ヒートアイランドのモデル'), why: T('No keyless open service returns a per-point urban-heat model; the candidates (UrbClim via CDS, Landsat LST) need an account-bound download. Atlas can still read the point forecast with the weather capability, which is not a UHI model.', '鍵なしで地点の都市熱モデルを返す公開サービスが無い（UrbClim は CDS の認証つきダウンロード、Landsat LST は大容量）。天気の予報は読めるが、それはヒートアイランドのモデルではない。') },
  { id: 'grid.power', domain: 'power', status: 'not-integrated', keywords: 'power grid electricity blackout transmission 電力網 停電 送電', name: T('Power-grid flow / outage model', '電力網の潮流・停電モデル'), why: T('Open grid topology exists (OpenStreetMap power=*, Open Infrastructure Map) but not operating states; a flow model would be invented rather than run.', '網の形は公開されている（OSM power=*）が運転状態が無く、潮流の計算は「実行」でなく「作り話」になる。') },
  { id: 'crop.yield', domain: 'agriculture', status: 'not-integrated', keywords: 'crop yield agriculture harvest drought 農業 収量 作物 干ばつ', name: T('Crop-yield model', '農業生産（収量）モデル'), why: T('Yield models need field-level soil, cultivar and management inputs that no open service supplies per point (GEOGLAM / FAO crop monitors publish regional assessments, not a runnable model).', '収量モデルは圃場ごとの土壌・品種・管理の入力を要し、地点ごとに返す公開サービスが無い（GEOGLAM・FAO は地域評価を公表するだけで、実行できるモデルではない）。') },
  { id: 'quake.damage', domain: 'earthquake', status: 'not-integrated', keywords: 'earthquake damage loss shakemap pager 地震 被害 想定', name: T('Earthquake damage estimation', '地震被害想定'), why: T('Earthquake shaking and tsunami already run in IntMap\'s own simulators (use the sim capabilities); USGS PAGER publishes losses per event, not a runnable model for a hypothetical one.', '揺れと津波は IntMap 自身のシミュレーターで実行できる（sim の能力を使う）。USGS PAGER は実際の地震ごとの損失を公表するだけで、仮想の地震を入れて走らせる口は無い。') },
];

/* Rank the registry against a question. Words are matched against the registry's own keyword list, not a hand-written
   table of phrases — adding a model adds its words. Integrated models come first among equal scores. */
export function discover(query, opts) {
  const q = String((query && query.text) || '').toLowerCase(), dom = query && query.domain ? String(query.domain).toLowerCase() : '';
  const words = q.split(/[^\p{L}\p{N}.]+/u).filter((w) => w.length >= 2);
  const rows = MODELS.map((m) => {
    const kw = (m.keywords + ' ' + m.domain + ' ' + m.name[0].toLowerCase() + ' ' + m.name[1]).toLowerCase();
    let s = 0; for (const w of words) if (kw.includes(w)) s += 1;
    for (const k of kw.split(/\s+/)) if (k.length >= 2 && /[^\x00-\x7f]/.test(k) && q.includes(k)) s += 2;   /* a CJK phrase in the question: whole-phrase containment */
    if (dom && m.domain === dom) s += 5;
    return { m, s };
  }).filter((x) => x.s > 0 || (!q && !dom)).sort((a, b) => b.s - a.s || (a.m.status === 'integrated' ? -1 : 1) - (b.m.status === 'integrated' ? -1 : 1));
  return rows.map((x) => x.m);
}

/* ── RUNNERS: place → input → model → result with its limits. `io` = { getJSON, now: Date } ───────────── */
export async function runFlood(ref, io) {
  const now = io.now || new Date(), today = now.toISOString().slice(0, 10);
  const j = await io.getJSON(floodUrl(ref.lat, ref.lng));
  if (!j) return { ok: false, code: 'UPSTREAM_UNREAD', why: 'The flood service did not answer (this is not "no flood risk").' };
  const cells = (Array.isArray(j) ? j : [j]).map((c) => analyseFlood(c, ref, today));
  const good = cells.filter((c) => c.ok);
  /* the main stem = the probed cell with the largest typical flow; none usable → the failure of the cell nearest the point */
  const best = good.length ? good.reduce((a, b) => (b.baselineMedian > a.baselineMedian ? b : a)) : cells.reduce((a, b) => ((a.snapKm == null ? 1e9 : a.snapKm) <= (b.snapKm == null ? 1e9 : b.snapKm) ? a : b));
  return Object.assign({ model: 'flood.glofas', input: { lat: ref.lat, lng: ref.lng }, probed: cells.length, usable: good.length, sources: [floodUrl(ref.lat, ref.lng)] }, best);
}

export async function runAir(ref, io) {
  const now = io.now || new Date(), nowIso = now.toISOString().slice(0, 13) + ':00';
  const [jg, je] = await Promise.all([io.getJSON(airUrl(ref.lat, ref.lng, 'cams_global')), io.getJSON(airUrl(ref.lat, ref.lng, 'cams_europe'))]);
  if (!jg && !je) return { ok: false, code: 'UPSTREAM_UNREAD', why: 'The air-quality service did not answer (this is not "clean air").' };
  const r = analyseAir(jg, je, nowIso);
  return Object.assign({ model: 'air.cams', input: { lat: ref.lat, lng: ref.lng }, europeAsked: true, europeAnswered: !!(r.ok && r.domains.europe), sources: [airUrl(ref.lat, ref.lng, 'cams_global'), airUrl(ref.lat, ref.lng, 'cams_europe')] }, r);
}

export const RUNNERS = { runFlood, runAir };
