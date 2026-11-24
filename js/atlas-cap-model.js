/* ============================================================================
 *  IntMap · Atlas capabilities — the `model.*` namespace   (js/atlas-cap-model.js)
 * ----------------------------------------------------------------------------
 *  Specialist models that already exist outside IntMap — found by Atlas, fed from a place, run, and answered with
 *  their assumptions, where they apply and how uncertain they are. The engine, the registry and the two integrated
 *  models (GloFAS flood, CAMS air quality) are in js/specialist-models.js; this file is the doors and the binding.
 *    model.find — which specialist model fits this question, and which are NOT runnable yet (with the reason)
 *    model.run      — run one: place → input → model → pin on the map + result with limits and spread
 *  ⚠ Table format / generation: js/atlas-cap-data.js header (`node scripts/atlas-caps.mjs --write`).
 * ==========================================================================*/
import { str, num, int, one } from './atlas-caps.js';
import { IntMapLang } from './lang-registry.js';
import { MODELS, discover, RUNNERS } from './specialist-models.js';

const T = IntMapLang.pickArgs();
const nm = (m, L) => L(m.name[0], m.name[1]);
const GRADE = { normal: T('within its recent range', '直近の水準の範囲内'), elevated: T('elevated against its recent range', '直近の水準より高い'), high: T('well above its recent range', '直近の水準を大きく上回る') };

export default [
  {
    row: ['model.find', 'modelDiscover', 'findModel,specialistModels,whichModel,listModels', 'data', 'none', '', 'explanation', 'read', 'none', '', '', ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'spatial-analysis', at: 56, text: 'FIND A SPECIALIST MODEL (専門モデルを探す): {"type":"modelDiscover","text"?:str,"domain"?:"flood"|"air"|"heat"|"power"|"agriculture"|"earthquake"} = lists the specialist models IntMap knows for a question — what each ANSWERS, what INPUT it needs, where it applies, its LIMITS, how its uncertainty is shown — and whether Atlas can RUN it now ("integrated") or not and WHY NOT ("not-integrated"). Integrated today: flood.glofas (GloFAS river-discharge forecast) and air.cams (CAMS air-quality forecast); run them with "modelRun". Use for 「洪水の予報モデルは」「この地域の大気汚染を予報できる？」「都市の熱を計算するモデルは」, "is there a model for X". A domain listed as not-integrated is SAID to be unavailable with its reason — never answer it with a made-up number. For earthquake shaking, tsunami, ash, radiation, wildfire smoke and pandemic spread use the sim capabilities (those run in IntMap itself). ' },
    ],
    schema: () => ({ type: 'object', properties: { text: str(), domain: one('flood', 'air', 'heat', 'power', 'agriculture', 'earthquake') } }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      const hits = discover({ text: a.text, domain: a.domain });
      if (!hits.length) return R(false, warn(esc(L('No specialist model in the registry matches that. IntMap\'s own simulators (sim.*) and data layers may still answer it.', 'その主題に合う専門モデルは登録にありません。IntMap 自身のシミュレーター（sim.*）やデータレイヤーが答えられるかもしれません。'))), { meta: { code: 'NO_MATCH', category: 'data', retryable: false, produced: [], userGoalSatisfied: false } });
      let h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Specialist models', '専門モデル')) + '</div><table style="width:100%;font-size:12px;border-collapse:collapse;">';
      for (const m of hits) {
        const ok = m.status === 'integrated';
        h += '<tr style="border-top:1px solid var(--border,#3333);vertical-align:top"><td style="padding:3px 4px;white-space:nowrap"><b>' + esc(m.id) + '</b><br>' + esc(ok ? L('runnable', '実行できる') : L('not runnable', '未接続')) + '</td><td style="padding:3px 4px;">' + esc(nm(m, L));
        if (ok) h += '<br>' + esc(L(m.answers[0], m.answers[1])) + '<br><span style="color:var(--text-muted)">' + esc(L('Needs: ', '入力: ') + m.needs.join('; ') + ' · ' + L('Applies to: ', '適用範囲: ') + m.coverage + ' · ' + L('Uncertainty: ', '不確実性: ') + m.uncertainty) + '<br>' + esc(L('Does not say: ', '言わないこと: ') + (L(m.limits[0], m.limits[1])).join(' / ')) + '<br>' + esc(m.provider) + '</span>';
        else h += '<br><span style="color:#ff9f0a">' + esc(L(m.why[0], m.why[1])) + '</span>';
        h += '</td></tr>';
      }
      h += '</table>';
      return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, produced: ['explanation'], userGoalSatisfied: true, models: hits.map((m) => ({ id: m.id, status: m.status })) } });
    },
  },
  {
    /* column 7 'session': it drops one pin that clear-pins removes; it asks only Open-Meteo (coordinates leave the page, as the weather card's do) and changes no setting. */
    row: ['model.run', 'modelRun', 'runModel,specialistModel,floodForecast,riverForecast,airQualityForecast', 'data', 'none', 'map.object', 'explanation', 'session', 'none', 'place?', '', 'external'],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'spatial-analysis', at: 57, text: 'RUN A SPECIALIST MODEL (専門モデルを実行): {"type":"modelRun","model":"flood.glofas"|"air.cams","place"?:str,"lat"?:num,"lng"?:num} = prepares the model\'s input from the place, RUNS the external model and answers with its assumptions, where it applies and its uncertainty, and pins the place on the map. flood.glofas = GloFAS river-discharge forecast for the next 16 days: IntMap probes the 3×3 grid cells around the point (a point often snaps to a tributary) and runs the one carrying the most water; the answer gives the forecast peak and its date against that river\'s own past 60 days, the ensemble min/p25/median/p75/max at the peak, and whether the ensemble members agree on the grade; it says when the point is not on a river the model resolves. air.cams = CAMS forecast for the next 72 h: US AQI and its band, the pollutant furthest above WHO 2021 guidance, and — inside Europe — the gap between the 0.4° global and 0.1° Europe domains as the model spread (outside Europe it says no spread is available). Use for 「名古屋の川は今週増水しそう？」「デリーの空気は明日どう？」, "will the Rhine at Cologne flood", "air quality forecast for Beijing". NOTE: flood.glofas reports DISCHARGE (m³/s) relative to the river\'s recent norm — NOT a flood extent, depth, damage or return period — and ignores levees, dams and drainage; air.cams is a grid-cell average that understates roadside and near-source air. SAY SO in the answer. Unknown model → use "modelDiscover" first. ' },
    ],
    schema: () => ({ type: 'object', properties: { model: one('flood.glofas', 'air.cams'), place: str(), lat: num(-90, 90), lng: num(-180, 180) }, required: ['model'] }),
    async run(a, dctx, K) {
      const R = K.R, warn = K.warn, L = K.L, esc = K.esc, geocode = K.geocode, GE = K.GE, addPin = K.addPin;
      const fail = (msg, code, cat) => R(false, warn(esc(msg)), { meta: { code, category: cat || 'input', retryable: false, produced: [], userGoalSatisfied: false } });
      const m = MODELS.find((x) => x.id === a.model);
      if (!m) return fail(L('Unknown model «' + a.model + '». Known: ' + MODELS.map((x) => x.id).join(', ') + '. Use modelDiscover.', '「' + a.model + '」というモデルはありません。登録: ' + MODELS.map((x) => x.id).join('、') + '。modelDiscover で探してください。'), 'INVALID_INPUT');
      if (m.status !== 'integrated') return fail(L(m.name[0] + ' is not runnable: ' + m.why[0], m.name[1] + ' はまだ実行できません: ' + m.why[1]), 'NOT_INTEGRATED', 'data');
      const ref = (a.lat != null && a.lng != null) ? { lat: +a.lat, lng: +a.lng, name: String(a.place || '') } : (a.place ? await geocode(a.place) : null);
      if (!ref) return fail(L('Where? Give a place name or a latitude and longitude.', 'どこの予測ですか？場所の名前か緯度経度を指定してください。'), 'NEEDS_INPUT');
      /* K._fetchJSON already sends an Open-Meteo URL through the one guarded client (js/atlas-deadlines.js → js/wx-source.js: shared breaker, cache, the turn's deadline) — a second way to read the host would bypass it */
      const io = { now: new Date(), getJSON: async (u) => { try { return await K._fetchJSON(u); } catch (_) { return null; } } };
      const r = await RUNNERS[m.run](ref, io);
      const where = ref.name || a.place || (ref.lat.toFixed(3) + ', ' + ref.lng.toFixed(3));
      if (!r.ok) {
        const why = r.code === 'UPSTREAM_UNREAD' ? L(r.why, 'サービスが応答せず、何も言えません（「問題なし」ではありません）。')
          : r.code === 'NOT_A_RIVER' ? L(r.why, '最寄りの河川セルの流量がほぼ 0（中央値 ' + r.baseline + ' m³/s）で、この地点は 5 km 格子のモデルが解く川の上にありません。洪水については何も言えません。')
            : L(r.why, '結果を出せませんでした: ' + r.code);
        return R(false, warn(esc(where + ' — ' + why)), { meta: { code: r.code, category: 'data', retryable: r.code === 'UPSTREAM_UNREAD', produced: [], userGoalSatisfied: false } });
      }
      let h = '', title = '', desc = '', conf = '';
      const lim = '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(L('Does not say: ', '言わないこと: ') + L(m.limits[0], m.limits[1]).join(' / ') + ' · ' + m.provider) + '</div>';
      if (m.id === 'flood.glofas') {
        const gr = r.grade, e = r.ensemble, agree = r.gradeAgreement;
        title = L('River forecast', '河川流量予報') + ': ' + where; conf = agree ? 'model' : 'low';
        desc = L('Peak ' + r.peak + ' m³/s on ' + r.peakDate + ' (' + r.ratio + '× its 60-day median) — ' + GRADE[gr][0], '予報ピーク ' + r.peak + ' m³/s（' + r.peakDate + '・60 日中央値の ' + r.ratio + ' 倍）— ' + GRADE[gr][1]);
        h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(title) + '</div>'
          + '<div>' + esc(L('Forecast peak ', '予報ピーク ') + r.peak + ' m³/s · ' + r.peakDate + (r.daysToPeak ? L(' (in ' + r.daysToPeak + ' d)', '（' + r.daysToPeak + ' 日後）') : L(' (today)', '（今日）')) + ' · ' + L('this river\'s own 60-day median ', 'この川の直近 60 日の中央値 ') + r.baselineMedian + ' m³/s → ' + r.ratio + '× → ') + '<b>' + esc(L(GRADE[gr][0], GRADE[gr][1])) + '</b></div>'
          + '<div style="font-size:12px;">' + esc(L('Ensemble at the peak (m³/s): ', 'ピーク日のアンサンブル（m³/s）: ') + [['min', e.min], ['p25', e.p25], ['median', e.median], ['p75', e.p75], ['max', e.max]].map((x) => x[0] + ' ' + (x[1] == null ? '—' : Math.round(x[1] * 10) / 10)).join(' · ')) + '</div>'
          + '<div style="font-size:12px;' + (agree === false ? 'color:#ff9f0a' : '') + '">' + esc(agree == null ? L('No ensemble spread was returned.', 'アンサンブルの幅は返りませんでした。')
            : agree ? L('Uncertainty: the ensemble members agree on the grade (' + r.ratioRange[0] + '× to ' + r.ratioRange[1] + '×).', '不確実性: アンサンブルの全員が同じ等級（' + r.ratioRange[0] + '〜' + r.ratioRange[1] + ' 倍）。')
              : L('Uncertainty: the members DISAGREE — from "' + GRADE[r.gradeRange[0]][0] + '" (' + r.ratioRange[0] + '×) to "' + GRADE[r.gradeRange[1]][0] + '" (' + r.ratioRange[1] + '×). Treat the grade as unsettled.', '不確実性: アンサンブルが割れています — 「' + GRADE[r.gradeRange[0]][1] + '」（' + r.ratioRange[0] + ' 倍）から「' + GRADE[r.gradeRange[1]][1] + '」（' + r.ratioRange[1] + ' 倍）まで。等級は定まっていないものとして扱ってください。')) + '</div>'
          + '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('Input: IntMap probed ' + r.probed + ' grid cells around the point (a point often snaps to a tributary) and ran the one with the most water: ' + r.cell.lat.toFixed(3) + ', ' + r.cell.lng.toFixed(3) + ', ' + r.snapKm + ' km from the point; the 5 km model does not resolve small streams or urban drainage.', '入力: 地点の周りの ' + r.probed + ' セルを調べ（地点は支流に寄せられがち）、最も水量の多い ' + r.cell.lat.toFixed(3) + ', ' + r.cell.lng.toFixed(3) + '（地点から ' + r.snapKm + ' km）で実行しました。5 km 格子のモデルは小河川・都市排水を解きません。')) + '</div>' + lim;
      } else {
        const b = r.band, sp = r.spread, nextH = r.hours;
        title = L('Air-quality forecast', '大気質予報') + ': ' + where; conf = sp ? (sp.sameBand ? 'model' : 'low') : 'model';
        desc = 'US AQI ' + r.aqiMax + ' (' + L(b[0], b[1]) + ') ' + L('peak within ' + nextH + ' h', nextH + ' 時間内のピーク') + (r.leadPollutant ? ' · ' + r.leadPollutant + ' ' + r.leadRatioToWHO + '× WHO' : '');
        const rows = Object.keys(r.pollutants).map((k) => '<tr><td style="padding:1px 6px 1px 0">' + esc(k) + '</td><td style="padding:1px 6px">' + r.pollutants[k].max + '</td><td style="padding:1px 6px">' + r.pollutants[k].mean + '</td></tr>').join('');
        h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(title) + '</div>'
          + '<div>' + esc(L('Peak US AQI ', '最大 US AQI ') + r.aqiMax + ' (' + r.aqiMaxAt.replace('T', ' ') + ' UTC) · ' + L('mean ', '平均 ') + r.aqiMean + ' → ') + '<b>' + esc(L(b[0], b[1])) + '</b>' + (r.leadPollutant ? esc(' · ' + L('furthest above WHO 2021 guidance: ', 'WHO 2021 指針を最も超える物質: ') + r.leadPollutant + ' (' + r.leadRatioToWHO + '×)') : '') + '</div>'
          + '<table style="font-size:12px;border-collapse:collapse;"><tr style="color:var(--text-muted)"><td></td><td style="padding:1px 6px">max µg/m³</td><td style="padding:1px 6px">mean</td></tr>' + rows + '</table>'
          + '<div style="font-size:12px;' + (sp && !sp.sameBand ? 'color:#ff9f0a' : '') + '">' + esc(sp ? L('Uncertainty: the 0.4° global and 0.1° Europe domains differ by ' + sp.aqiMaxDiff + ' AQI points at the peak (' + sp.globalAqiMax + ' vs ' + sp.europeAqiMax + ')' + (sp.pm25MeanDiff != null ? ' and ' + sp.pm25MeanDiff + ' µg/m³ in mean PM2.5' : '') + (sp.sameBand ? ', in the same band.' : ', and fall in DIFFERENT bands.'), '不確実性: 0.4° の全球域と 0.1° の欧州域でピークの AQI が ' + sp.aqiMaxDiff + ' 違い（' + sp.globalAqiMax + ' 対 ' + sp.europeAqiMax + '）' + (sp.pm25MeanDiff != null ? '、PM2.5 平均で ' + sp.pm25MeanDiff + ' µg/m³ 違い' : '') + (sp.sameBand ? '、同じ区分です。' : '、区分が分かれます。'))
            : L('Uncertainty: no model spread is available here (only the global 0.4° domain covers this point), so no range is given — this is not a claim that the value is exact.', '不確実性: この地点を覆うのは全球 0.4° の領域だけで、モデル間の幅は得られません。幅を示せないのであって、値が正確という意味ではありません。')) + '</div>'
          + '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('US AQI bands: EPA. Pollutant ratios: WHO 2021 guideline levels (PM2.5 15, PM10 45, NO₂ 25, SO₂ 40, O₃ 100 µg/m³). Domain used for the headline: ' + r.domainUsed + '.', 'US AQI の区分は EPA、物質の比は WHO 2021 の指針値（PM2.5 15・PM10 45・NO₂ 25・SO₂ 40・O₃ 100 µg/m³）。見出しの値の領域: ' + r.domainUsed + '。')) + '</div>' + lim;
      }
      try { addPin(ref.lng, ref.lat, { title, description: desc, source: m.provider + " — " + m.ref, when: new Date().toISOString().slice(0, 10), confidence: conf }); } catch (_) { /* the answer does not depend on the pin */ }
      try { GE().camera.flyTo({ center: [ref.lng, ref.lat], zoom: Math.max(GE().camera.getZoom(), 8) }); } catch (_) { /* nor on the camera */ }
      return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, semanticTarget: where, produced: ['explanation'], userGoalSatisfied: true, specialistModel: { id: m.id, grade: r.grade || null, aqiMax: r.aqiMax || null, spread: r.spread || (r.ratioRange ? { ratioRange: r.ratioRange, agree: r.gradeAgreement } : null) } } });
    },
  },
];
