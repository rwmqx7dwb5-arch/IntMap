/* ============================================================================
 *  IntMap · Atlas — the facts a tool's panel shows, as text on the tool's RESULT
 * ----------------------------------------------------------------------------
 *  What the reader can see, Atlas can read. A capability that opens a card or draws a route hands
 *  the reader numbers — the sub-satellite point, the next pass, the temperature, the itinerary —
 *  and used to hand Atlas only «ok». Asked for those numbers, Atlas could not find them in what it
 *  was given and called the same tool again (measured on production, 2026-09-15: routing.route seven
 *  times in one turn). These builders put the same numbers, in the reader's language, on the result
 *  itself. They compute nothing: the satellite module, the weather source and the router already
 *  did; this only writes down what they said.
 *
 *  Pure ES module: no DOM, no window. `L` is the caller's positional picker (en, jp, de, ru, es).
 * ==========================================================================*/

/** Who is looking: the place the reader named, else the point they pinned, else the map centre — and its label. */
export async function resolveObserver(a, deps) {
  const L = deps.L; const obsName = String(a.place || a.observer || a.over || a.from || '').trim(); let obsPt = null, obsLabel = '';
  if (obsName) { try { const gp = await deps.geocode(obsName); if (gp && isFinite(+gp.lng) && isFinite(+gp.lat)) { obsPt = { lng: +gp.lng, lat: +gp.lat }; obsLabel = String(gp.name || obsName); } } catch (_) { /* unresolved → the pin or the centre below */ } }
  const hp = deps.herePoint; if (!obsPt && hp && isFinite(+hp.lng)) { obsPt = { lng: +hp.lng, lat: +hp.lat }; obsLabel = String(hp.name || L('the chosen point', '指定地点', 'dem gewählten Punkt', 'выбранной точки', 'el punto elegido')); }
  if (!obsLabel) obsLabel = L('the map center', '地図中心', 'der Kartenmitte', 'центра карты', 'el centro del mapa');
  return { obsPt, obsLabel };
}

/** One satellite, as the live layer knows it right now, plus the next pass over the observer. */
export function satelliteFacts(A, found, obsPt, obsLabel, L) {
  const at = '（' + obsLabel + '）';
  const la = A.lookFrom(A.observer(obsPt || undefined), found);
  /* the next passes, not only the next one: a reader who asks 「次に東京の上空を通るのは」 usually wants the
     first pass worth watching, and a 5° graze is not it. Up to PASSES_LISTED within PASSES_HORIZON_H, each
     with its rise time, maximum elevation and duration; the module computes them one after the other
     (js/satellites-live.js nextPass, searched from the end of the previous pass). */
  const PASSES_LISTED = 3, PASSES_HORIZON_H = 48;
  const passes = []; let pass = null;
  try {
    let from = new Date(); const end = Date.now() + PASSES_HORIZON_H * 3600000;
    for (let i = 0; i < PASSES_LISTED && from.getTime() < end; i++) {
      const p = A.nextPass(found.id, from, Math.max(1, Math.ceil((end - from.getTime()) / 3600000)), obsPt || undefined);
      if (!p || p.none) { if (!passes.length) pass = p; break; }
      passes.push(p); if (!pass) pass = p;
      from = new Date((p.setMs || p.maxMs || from.getTime()) + 60000);
    }
  } catch (_) { pass = null; }
  const fmtT = (ms) => { try { return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return new Date(ms).toISOString(); } };
  let passTxt = '';
  if (pass && pass.none) passTxt = L('no pass', '通過なし', 'kein Überflug', 'нет пролёта', 'sin pase') + at + ' ' + L('in the next 24 h', '（今後24時間）', 'in den nächsten 24 h', 'в ближайшие 24 ч', 'en las próximas 24 h');
  else if (pass && pass.inProgress) passTxt = L('pass', '通過', 'Überflug', 'пролёт', 'pase') + at + ' ' + L('in progress now', '現在通過中', 'läuft gerade', 'идёт сейчас', 'en curso ahora');
  else if (pass && isFinite(pass.riseMs)) passTxt = L('next pass', '次の通過', 'nächster Überflug', 'следующий пролёт', 'próximo pase') + at + ' ' + fmtT(pass.riseMs);
  const passDetail = (p) => (isFinite(p.maxEl) ? (', ' + L('max elevation', '最大仰角', 'max. Elevation', 'макс. угол места', 'elevación máx.') + ' ' + p.maxEl.toFixed(0) + '° (' + fmtT(p.maxMs) + ')') : '')
    + (p.durationS ? (', ' + Math.round(p.durationS / 60) + ' min') : '')
    + (isFinite(p.maxEl) && p.maxEl < 10 ? (' — ' + L('a low pass, unlikely to be visible', '低い通過のため肉眼では見えにくい', 'tiefer Überflug, kaum sichtbar', 'низкий пролёт, вряд ли виден', 'pase bajo, poco visible')) : '');
  if (pass && !pass.none) passTxt += passDetail(pass);
  passes.slice(1).forEach((p, i) => { passTxt += ' · ' + L('later pass', 'その後の通過', 'späterer Überflug', 'следующий пролёт', 'pase posterior') + ' ' + (p.inProgress ? '' : fmtT(p.riseMs)) + passDetail(p); });
  if (passes.length) passTxt += ' (' + L('passes within 48 h', '48時間以内の通過', 'Überflüge in 48 h', 'пролёты за 48 ч', 'pases en 48 h') + ': ' + passes.length + (passes.length >= PASSES_LISTED ? '+' : '') + ')';
  /* the observer's name sits in parentheses after each label, so every language reads the same way */
  return ' — ' + L('now above', '直下点', 'jetzt über', 'сейчас над', 'ahora sobre') + ' ' + found.lat.toFixed(2) + '°, ' + found.lng.toFixed(2) + '°'
    + ' · ' + L('altitude', '高度', 'Höhe', 'высота', 'altitud') + ' ' + Math.round(found.altKm).toLocaleString() + ' km'
    + (found.velKmS ? (' · ' + found.velKmS.toFixed(2) + ' km/s') : '')
    + (found.periodMin ? (' · ' + L('period', '周期', 'Umlaufzeit', 'период', 'periodo') + ' ' + found.periodMin.toFixed(1) + ' min') : '')
    + (la ? (' · ' + (obsPt ? (L('elevation seen from', '仰角', 'Elevation ab', 'угол места от', 'elevación desde') + at) : L('elevation from the map center', '地図中心からの仰角', 'Elevation ab Kartenmitte', 'угол места от центра карты', 'elevación desde el centro')) + ' ' + la.elDeg.toFixed(1) + '°') : '')
    + (found.sunlit == null ? '' : (' · ' + (found.sunlit ? L('sunlit', '太陽光下', 'beleuchtet', 'освещён', 'iluminado') : L('in eclipse', '影の中', 'im Schatten', 'в тени', 'en eclipse'))))
    + (passTxt ? (' · ' + passTxt) : '');
}

/** The weather card's numbers: current conditions and the daily rows, from the same response the card drew. */
export function weatherFacts(j, describe, L) {
  if (!j || !j.current) return '';
  const c = j.current; const d = (code) => (typeof describe === 'function') ? describe(code) : String(code);
  const n = (v, u) => (v == null || !isFinite(+v)) ? '—' : (Math.round(+v * 10) / 10 + u);
  let facts = ' — ' + L('now', '現在', 'jetzt', 'сейчас', 'ahora') + ': ' + d(c.weather_code) + ', ' + n(c.temperature_2m, '°C') + ' (' + L('feels like', '体感', 'gefühlt', 'ощущается', 'sensación') + ' ' + n(c.apparent_temperature, '°C') + '), '
    + L('humidity', '湿度', 'Luftfeuchte', 'влажность', 'humedad') + ' ' + n(c.relative_humidity_2m, '%') + ', ' + L('wind', '風', 'Wind', 'ветер', 'viento') + ' ' + n(c.wind_speed_10m, ' km/h') + (c.wind_gusts_10m != null ? (' (' + L('gusts', '突風', 'Böen', 'порывы', 'rachas') + ' ' + n(c.wind_gusts_10m, ' km/h') + ')') : '')
    + ', ' + L('precipitation', '降水', 'Niederschlag', 'осадки', 'precipitación') + ' ' + n(c.precipitation, ' mm') + (c.time ? (' · ' + L('valid at', '有効時刻', 'gültig', 'на', 'válido a las') + ' ' + String(c.time)) : '');
  const D = j.daily || {}; const days = D.time || []; const rows = [];
  for (let i = 0; i < Math.min(days.length, 5); i++) rows.push(days[i] + ': ' + d(D.weather_code && D.weather_code[i]) + ' ' + n(D.temperature_2m_max && D.temperature_2m_max[i], '°C') + '/' + n(D.temperature_2m_min && D.temperature_2m_min[i], '°C')
    + (D.precipitation_probability_max && D.precipitation_probability_max[i] != null ? (' · ' + L('rain chance', '降水確率', 'Regenwahrsch.', 'вероятн. осадков', 'prob. lluvia') + ' ' + Math.round(D.precipitation_probability_max[i]) + '%') : '')
    + (D.precipitation_sum && D.precipitation_sum[i] != null ? (' · ' + n(D.precipitation_sum[i], ' mm')) : ''));
  if (rows.length) facts += ' · ' + L('forecast', '予報', 'Vorhersage', 'прогноз', 'pronóstico') + ': ' + rows.join('; ');
  return facts;
}

/** The journey the router returned — every alternative with its legs — as numbers and names. */
export function routeFacts(r) {
  try {
    if (!r || !r.ok) return null; const S = (x, n) => String(x == null ? '' : x).slice(0, n || 80);
    const leg = (l) => ({ mode: S(l.mode, 20), line: S(l.route, 60) || undefined, headsign: S(l.headsign, 60) || undefined, from: S(l.from, 60) || undefined, to: S(l.to, 60) || undefined, dep: S(l.dep, 32) || undefined, arr: S(l.arr, 32) || undefined, durationS: isFinite(+l.duration) ? Math.round(+l.duration) : undefined, walk: l.walk ? true : undefined, estimated: l.est ? true : undefined });
    const alt = (x) => ({ durationS: isFinite(+x.duration) ? Math.round(+x.duration) : undefined, distanceM: isFinite(+x.distance) ? Math.round(+x.distance) : undefined, transfers: isFinite(+x.transfers) ? +x.transfers : undefined, start: S(x.startTime, 32) || undefined, end: S(x.endTime, 32) || undefined, legs: Array.isArray(x.legs) ? x.legs.slice(0, 12).map(leg) : undefined, roads: Array.isArray(x.roads) ? x.roads.slice(0, 8).map((v) => S(v, 40)) : undefined });
    const alts = (r.alternatives && r.alternatives.length) ? r.alternatives.slice(0, 6).map(alt) : [alt(r)];
    return { mode: S(r.mode || r.profile, 20), provider: S(r.provider, 30) || undefined, timetableBased: r.realtime ? false : (r.jrEstimate || r.railEstimate) ? undefined : true, estimated: (r.jrEstimate || r.railEstimate) ? true : undefined, selected: isFinite(+r.sel) ? +r.sel : 0, alternatives: alts };
  } catch (_) { return null; }
}
