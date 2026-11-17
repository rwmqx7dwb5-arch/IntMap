/* ============================================================================
 *  IntMap · WIDGET DEFINITIONS — SPACE WEATHER AND NEAR-EARTH ASTEROIDS
 * ----------------------------------------------------------------------------
 *  Solar wind · solar flares (GOES X-ray) · NOAA R/S/G scales · SWPC alerts · asteroid close approaches.
 *  (space.iss / space.launch / space.kp stay in js/widget-defs-data.js beside the fetch helpers they share.)
 *
 *  Its own file for the reason js/widget-defs-markets.js is: js/widget-defs-data.js passed the 1,200-line
 *  ceiling tests/shell-widgets-checks.test.mjs holds every platform module to. It reads the helpers that
 *  file publishes (getJSON, utcMs) and hangs the parsers on that same object as `space`, so a test and
 *  Atlas reach them without a new window global.
 * ==========================================================================*/
import { fetchViaProxy } from './proxy-fetch.js';   /* the app's ONE relay ladder — space.neo's upstream sends no CORS header */
(function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var R = window.IntMapWidgetRender;
  var D = window.IntMapWidgetDefsData;
  var el = WC.el;
  var L = WC.L;
  var getJSON = D.getJSON;

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     SPACE WEATHER — services.swpc.noaa.gov (NOAA Space Weather Prediction Center)
     Every upstream below was fetched and read on 2026-11-17: JSON, Access-Control-Allow-Origin: *,
     Cache-Control max-age=60 on the real-time files. The parsers are pure functions on `space`
     (exported at the foot of the file) so tests/space-weather-checks.test.mjs feeds them the shapes
     the upstream really sends. ⚠ THE REAL-TIME SOLAR-WIND FILES HAVE HOLES: a row's `active` flag names
     the spacecraft NOAA treats as primary, and that row can carry null for a quantity (measured: 79 of
     1,425 active wind rows are null) — a null is skipped, never carried forward, so the "now" on the card
     is the newest minute the primary instrument actually measured.
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  var SWPC = 'https://services.swpc.noaa.gov/';
  WC.define({
    id: 'space.solarwind', family: 'space', variant: 'solarwind', category: 'space', icon: 'radio',
    nm: function () { return L('Solar wind', '太陽風', 'Sonnenwind', 'Солнечный ветер', 'Viento solar'); },
    desc: function () { return L('Speed, density and the magnetic field Bz, measured upstream of the Earth', '地球の手前で測る太陽風の速度・密度・磁場Bz', 'Geschwindigkeit, Dichte und Magnetfeld Bz vor der Erde', 'Скорость, плотность и поле Bz перед Землёй', 'Velocidad, densidad y campo Bz medidos antes de la Tierra'); },
    keywords: function () { return [L('solar wind', '太陽風', 'Sonnenwind', 'солнечный ветер', 'viento solar'), 'Bz', 'IMF', L('space weather', '宇宙天気', 'Weltraumwetter', 'космическая погода', 'clima espacial'), 'DSCOVR', 'NOAA']; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    /* the upstream is a 1-minute record, but the two files are ~3 MB and ~1.7 MB uncompressed (a day of three
       spacecraft each) and a wind shock needs ~1 h to cross to the Earth's field, so five minutes is both the
       freshest that costs a sane number of bytes and far inside what a reader can act on */
    refreshPolicy: { kind: 'interval', minIntervalMs: 5 * 60000, staleAfterMs: 20 * 60000, cacheTtlMs: 5 * 60000 },
    requestKey: function () { return 'swpc:solarwind'; },
    loader: function (ctx, cfg, signal) {
      return Promise.all([getJSON(SWPC + 'json/rtsw/rtsw_wind_1m.json', signal), getJSON(SWPC + 'json/rtsw/rtsw_mag_1m.json', signal)]).then(function (r) {
        var d = space.solarWind(r[0], r[1]);
        if (!d) return { empty: true };
        return { data: d, source: 'NOAA SWPC · ' + (d.windSource || 'RTSW') };
      });
    },
    emptyText: function () { return L('No solar-wind reading from the primary spacecraft right now', '主系の探査機から太陽風の観測値が届いていません', 'Derzeit keine Sonnenwind-Messung', 'Сейчас нет данных о солнечном ветре', 'Sin lecturas del viento solar ahora'); },
    tone: function (st) { return st.data && st.data.bz != null && st.data.bz <= -10 ? 'sev3' : (st.data && st.data.bz != null && st.data.bz < 0 ? 'sev1' : null); },
    renderers: {
      s: function (ctx, cfg, st) {
        var d = st.data; if (!d || d.speed == null) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ value: WC.num(Math.round(d.speed)), unit: 'km/s', caption: d.bz == null ? '' : 'Bz ' + WC.num(d.bz, { maximumFractionDigits: 1 }) + ' nT' })]);
      },
      m: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [
          d.speed != null ? R.value({ value: WC.num(Math.round(d.speed)), unit: 'km/s', caption: L('Solar wind speed', '太陽風の速度', 'Sonnenwind-Geschwindigkeit', 'Скорость солнечного ветра', 'Velocidad del viento solar') }) : null,
          R.facts([
            { k: L('Plasma density', '密度', 'Dichte', 'Плотность', 'Densidad'), v: d.density == null ? '—' : WC.num(d.density, { maximumFractionDigits: 1 }) + ' p/cm³' },
            { k: 'Bz', v: d.bz == null ? '—' : WC.num(d.bz, { maximumFractionDigits: 1 }) + ' nT' },
          ], { cols: 2 }),
          bzNote(d.bz),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
      l: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        var ax = function (a) { return a && a.length ? [WC.date(new Date(a[0].at), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC', WC.date(new Date(a[a.length - 1].at), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'] : null; };
        return el('div', { class: 'wgt-body' }, [
          d.speed != null ? R.value({ value: WC.num(Math.round(d.speed)), unit: 'km/s', caption: L('Solar wind speed', '太陽風の速度', 'Sonnenwind-Geschwindigkeit', 'Скорость солнечного ветра', 'Velocidad del viento solar') }) : null,
          R.series(d.speedSeries.map(function (x) { return { v: x.v }; }), { height: 50, axis: ax(d.speedSeries),
            label: L('Solar wind speed, last 6 hours (km/s)', '太陽風の速度、直近6時間（km/s）', 'Sonnenwind-Geschwindigkeit, letzte 6 Stunden (km/s)', 'Скорость солнечного ветра за 6 часов (км/с)', 'Velocidad del viento solar, últimas 6 horas (km/s)') }),
          R.facts([
            { k: L('Plasma density', '密度', 'Dichte', 'Плотность', 'Densidad'), v: d.density == null ? '—' : WC.num(d.density, { maximumFractionDigits: 1 }) + ' p/cm³' },
            { k: L('Plasma temperature', '温度', 'Temperatur', 'Температура', 'Temperatura'), v: d.temperature == null ? '—' : WC.num(Math.round(d.temperature / 1000)) + ' kK' },
            { k: 'Bt', v: d.bt == null ? '—' : WC.num(d.bt, { maximumFractionDigits: 1 }) + ' nT' },
            { k: 'Bz', v: d.bz == null ? '—' : WC.num(d.bz, { maximumFractionDigits: 1 }) + ' nT' },
          ], { cols: 2 }),
          R.series(d.bzSeries.map(function (x) { return { v: x.v }; }), { height: 44, axis: ax(d.bzSeries),
            label: L('Bz (GSM), last 6 hours (nT); below the line is southward', 'Bz（GSM）、直近6時間（nT）：線より下が南向き', 'Bz (GSM), letzte 6 Stunden (nT); unter der Linie = südwärts', 'Bz (GSM) за 6 часов (нТл); ниже линии — южное', 'Bz (GSM), últimas 6 horas (nT); bajo la línea = hacia el sur') }),
          bzNote(d.bz),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
    },
  });
  /* a southward (negative) Bz is the one reading on this card that changes what happens on the ground */
  function bzNote(bz) {
    if (bz == null || bz >= 0) return null;
    return el('div', { class: 'wgt-cap', role: 'note', style: 'font-weight:600' }, [
      L('Southward Bz', 'Bzが南向き', 'Bz südwärts', 'Bz направлено на юг', 'Bz hacia el sur') + ' — ' +
      L('it connects with the Earth\'s field, so the solar wind can drive a geomagnetic storm (stronger and longer when it stays below −10 nT)',
        '地球の磁場とつながり、太陽風が地磁気嵐を起こしうる状態（−10 nT を下回って続くほど強く長引く）',
        'koppelt an das Erdfeld und kann einen geomagnetischen Sturm antreiben',
        'соединяется с полем Земли и может вызвать геомагнитную бурю',
        'se acopla al campo terrestre y puede provocar una tormenta geomagnética'),
    ]);
  }

  WC.define({
    id: 'space.xray', family: 'space', variant: 'xray', category: 'space', icon: 'sun',
    nm: function () { return L('Solar flares (X-ray)', '太陽フレア（X線）', 'Sonnenflares (Röntgen)', 'Солнечные вспышки (рентген)', 'Fulguraciones solares (rayos X)'); },
    desc: function () { return L('The Sun\'s X-ray class now, the biggest flare in 24 h and the flare odds', '現在のX線等級、24時間の最大フレアとフレア発生確率', 'Aktuelle Röntgenklasse, größter Flare in 24 h und Flare-Wahrscheinlichkeit', 'Текущий класс, крупнейшая вспышка за 24 ч и вероятности', 'Clase actual, mayor fulguración en 24 h y probabilidades'); },
    keywords: function () { return [L('flare', 'フレア', 'Flare', 'вспышка', 'fulguración'), 'GOES', L('X-ray', 'X線', 'Röntgen', 'рентген', 'rayos X'), L('solar', '太陽', 'Sonne', 'солнце', 'solar'), 'NOAA']; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    /* GOES X-ray flux is a 1-minute record (a flare rises in minutes); the 24-hour file is ~650 KB, so five
       minutes. The flare probabilities are a once-a-day forecast and ride in the same request. */
    refreshPolicy: { kind: 'interval', minIntervalMs: 5 * 60000, staleAfterMs: 20 * 60000, cacheTtlMs: 5 * 60000 },
    requestKey: function () { return 'swpc:xray'; },
    loader: function (ctx, cfg, signal) {
      var prob = getJSON(SWPC + 'json/solar_probabilities.json', signal).catch(function (e) { if (e && e.name === 'AbortError') throw e; return null; });
      return getJSON(SWPC + 'json/goes/primary/xrays-1-day.json', signal).then(function (rows) {
        return prob.then(function (p) {
          var d = space.xray(rows, p);
          if (!d) return { empty: true };
          return { data: d, source: 'NOAA SWPC · GOES' + (d.satellite ? '-' + d.satellite : '') };
        });
      });
    },
    tone: function (st) { return st.data ? 'sev' + st.data.now.level : null; },
    renderers: {
      s: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ value: st.data.now.text, caption: L('X-ray class now', '現在のX線等級', 'Röntgenklasse jetzt', 'Класс сейчас', 'Clase actual') })]);
      },
      m: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: d.now.text, caption: L('X-ray class now', '現在のX線等級', 'Röntgenklasse jetzt', 'Класс сейчас', 'Clase actual') }),
          R.facts([
            { k: L('Biggest in 24 h', '24時間の最大', 'Größter in 24 h', 'Максимум за 24 ч', 'Máximo en 24 h'), v: d.max.text + ' · ' + WC.date(new Date(d.max.at), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' },
            d.prob ? { k: L('M / X flare chance today', '本日のM/Xフレア確率', 'M/X-Flare heute', 'Вероятность M/X сегодня', 'Prob. M/X hoy'), v: d.prob.m[0] + '% / ' + d.prob.x[0] + '%' } : null,
          ]),
          R.source({ source: st.source, at: d.now.at }),
        ]);
      },
      l: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        var hm = function (t) { return WC.date(new Date(t), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'; };
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: d.now.text, caption: L('X-ray class now', '現在のX線等級', 'Röntgenklasse jetzt', 'Класс сейчас', 'Clase actual') }),
          R.series(d.series.map(function (x) { return { v: x.v }; }), { height: 56, min: space.XRAY_LOG_MIN, max: space.XRAY_LOG_MAX, axis: [hm(d.series[0].at), hm(d.series[d.series.length - 1].at)],
            label: L('GOES X-ray flux, 24 hours, logarithmic axis from A to X (5-minute maxima)', 'GOESのX線フラックス、24時間、A〜Xの対数軸（5分ごとの最大値）', 'GOES-Röntgenfluss, 24 Stunden, logarithmisch von A bis X (5-Minuten-Maxima)', 'Рентгеновский поток GOES за 24 ч, лог. шкала A–X (максимумы за 5 мин)', 'Flujo de rayos X de GOES, 24 horas, escala logarítmica A–X (máximos de 5 min)') }),
          R.facts([
            { k: L('Biggest in 24 h', '24時間の最大', 'Größter in 24 h', 'Максимум за 24 ч', 'Máximo en 24 h'), v: d.max.text + ' · ' + hm(d.max.at) },
          ]),
          d.prob ? R.facts(['C', 'M', 'X'].map(function (c) {
            var a = d.prob[c.toLowerCase()];
            return { k: L('Flare chance, class', 'フレア確率・クラス', 'Flare-Wahrscheinlichkeit, Klasse', 'Вероятность вспышки, класс', 'Probabilidad de fulguración, clase') + ' ' + c + ' (1 / 2 / 3 ' + L('days', '日', 'Tage', 'дн.', 'días') + ')', v: a.join('% / ') + '%' };
          })) : null,
          R.source({ source: st.source, at: d.now.at }),
        ]);
      },
    },
  });

  WC.define({
    id: 'space.scales', family: 'space', variant: 'scales', category: 'space', icon: 'radio',
    nm: function () { return L('NOAA space weather scales', 'NOAA 宇宙天気スケール', 'NOAA-Weltraumwetter-Skalen', 'Шкалы космической погоды NOAA', 'Escalas de clima espacial de NOAA'); },
    desc: function () { return L('Radio blackouts (R), radiation storms (S) and geomagnetic storms (G): now and the next 3 days', '電波障害(R)・放射線嵐(S)・地磁気嵐(G)の現在と今後3日間', 'Funkausfälle (R), Strahlungsstürme (S), geomagnetische Stürme (G): jetzt und 3 Tage', 'Радиоблэкауты (R), радиационные (S) и геомагнитные (G) бури', 'Apagones de radio (R), tormentas de radiación (S) y geomagnéticas (G)'); },
    keywords: function () { return ['NOAA', 'R S G', L('geomagnetic storm', '地磁気嵐', 'geomagnetischer Sturm', 'геомагнитная буря', 'tormenta geomagnética'), L('radio blackout', '電波障害', 'Funkausfall', 'радиоблэкаут', 'apagón de radio'), L('space weather', '宇宙天気', 'Weltraumwetter', 'космическая погода', 'clima espacial')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    /* the scales product is re-issued with each new SWPC observation block (minutes) but its forecast days change
       a few times a day; ten minutes follows the observations without asking for a document that has not moved */
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 10 * 60000, staleAfterMs: 2 * 3600000, cacheTtlMs: 30 * 60000 },
    requestKey: function () { return 'swpc:scales'; },
    loader: function (ctx, cfg, signal) {
      return getJSON(SWPC + 'products/noaa-scales.json', signal).then(function (j) {
        var d = space.scales(j);
        if (!d) return { empty: true };
        return { data: d, source: 'NOAA SWPC' };
      });
    },
    tone: function (st) { return st.data ? 'sev' + Math.min(4, st.data.worst) : null; },
    renderers: {
      s: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [R.chips(['R', 'S', 'G'].map(function (k) { return { label: k, value: d.now[k].scale, tone: null }; }))]);
      },
      m: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [
          R.list(['R', 'S', 'G'].map(function (k) {
            var x = d.now[k];
            return { mark: k + x.scale, tone: 'sev' + Math.min(4, x.scale), title: scaleName(k), sub: x.scale > 0 ? scaleMeaning(k, x.scale) : L('No activity', '活動なし', 'Keine Aktivität', 'Нет активности', 'Sin actividad'), trailing: x.scale > 0 ? scaleLevel(x.scale) : '' };
          }), { dense: true }),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
      l: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [
          R.list(['R', 'S', 'G'].map(function (k) {
            var x = d.now[k];
            return { mark: k + x.scale, tone: 'sev' + Math.min(4, x.scale), title: scaleName(k), sub: x.scale > 0 ? scaleMeaning(k, x.scale) : L('No activity', '活動なし', 'Keine Aktivität', 'Нет активности', 'Sin actividad'), trailing: x.scale > 0 ? scaleLevel(x.scale) : '' };
          }), { dense: true }),
          R.list(d.days.map(function (day) {
            var pct = function (x) { return x == null ? '—' : x + '%'; };
            return { mark: 'G' + (day.G.scale == null ? '–' : day.G.scale), tone: 'sev' + Math.min(4, day.G.scale || 0),
              title: WC.date(new Date(day.at), { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' }),
              sub: 'R1–R2 ' + pct(day.R.minor) + ' · R3+ ' + pct(day.R.major) + ' · S1+ ' + pct(day.S.prob) };
          }), { dense: true }),
          el('div', { class: 'wgt-cap' }, [L('Forecast days (UTC): G is the expected geomagnetic storm level; R and S are the chance of each class occurring.', '予報（UTC）：Gは予想される地磁気嵐の段階、R・Sは各段階が起きる確率。', 'Prognosetage (UTC): G = erwartete Sturmstufe; R und S = Eintrittswahrscheinlichkeit.', 'Прогноз (UTC): G — ожидаемый уровень; R и S — вероятности.', 'Días previstos (UTC): G es el nivel esperado; R y S, la probabilidad.')]),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
    },
  });
  function scaleName(k) {
    return k === 'R' ? L('R · Radio blackout (solar flare)', 'R · 電波障害（太陽フレア）', 'R · Funkausfall (Flare)', 'R · Радиоблэкаут (вспышка)', 'R · Apagón de radio (fulguración)')
      : k === 'S' ? L('S · Radiation storm (protons)', 'S · 放射線嵐（陽子）', 'S · Strahlungssturm (Protonen)', 'S · Радиационная буря (протоны)', 'S · Tormenta de radiación (protones)')
        : L('G · Geomagnetic storm', 'G · 地磁気嵐', 'G · Geomagnetischer Sturm', 'G · Геомагнитная буря', 'G · Tormenta geomagnética');
  }
  function scaleLevel(n) {
    return [null, L('Minor level', '小', 'Gering', 'Слабая', 'Menor'), L('Moderate', '中', 'Mäßig', 'Умеренная', 'Moderada'), L('Strong level', '強', 'Stark', 'Сильная', 'Fuerte'), L('Severe level', '甚大', 'Schwer', 'Тяжёлая', 'Severa'), L('Extreme', '極端', 'Extrem', 'Экстремальная', 'Extrema')][Math.max(1, Math.min(5, n))];
  }
  /* what each step means — NOAA's own scale definitions (swpc.noaa.gov/noaa-scales-explanation), shortened */
  function scaleMeaning(k, n) {
    var i = Math.max(1, Math.min(5, n)) - 1;
    if (k === 'R') return [
      L('Weak HF radio degradation on the sunlit side (flare M1+)', '昼側で短波通信がわずかに劣化（M1以上のフレア）', 'Leichte KW-Störung auf der Tagseite (M1+)', 'Слабые помехи КВ на дневной стороне (M1+)', 'Degradación leve de HF en el lado diurno (M1+)'),
      L('Limited HF blackout on the sunlit side for tens of minutes (M5+)', '昼側で短波通信が数十分途絶（M5以上）', 'Begrenzter KW-Ausfall für Zehner-Minuten (M5+)', 'Ограниченный блэкаут КВ на десятки минут (M5+)', 'Apagón limitado de HF durante decenas de minutos (M5+)'),
      L('Wide-area HF blackout of about an hour on the sunlit side (X1+)', '昼側の広範囲で短波通信が約1時間途絶（X1以上）', 'Großflächiger KW-Ausfall von etwa einer Stunde (X1+)', 'Блэкаут КВ около часа на дневной стороне (X1+)', 'Apagón amplio de HF de cerca de una hora (X1+)'),
      L('HF blackout over most of the sunlit side for 1–2 hours (X10+)', '昼側のほぼ全域で短波通信が1〜2時間途絶（X10以上）', 'KW-Ausfall auf fast der ganzen Tagseite für 1–2 h (X10+)', 'Блэкаут КВ на большей части дневной стороны 1–2 ч (X10+)', 'Apagón de HF en casi todo el lado diurno de 1–2 h (X10+)'),
      L('Complete HF blackout on the whole sunlit side for hours (X20+)', '昼側の全域で短波通信が数時間完全に途絶（X20以上）', 'Vollständiger KW-Ausfall auf der gesamten Tagseite für Stunden (X20+)', 'Полный блэкаут КВ на всей дневной стороне на часы (X20+)', 'Apagón total de HF en todo el lado diurno durante horas (X20+)'),
    ][i];
    if (k === 'S') return [
      L('Minor effects on polar HF radio (protons ≥10 MeV above 10 pfu)', '極域の短波通信にわずかな影響（10 MeV以上の陽子が10 pfu超）', 'Geringe Effekte auf polaren Kurzwellenfunk', 'Слабое влияние на полярную КВ-связь', 'Efectos leves en HF polar'),
      L('Infrequent single-event upsets in satellites (above 100 pfu)', '衛星でまれにシングルイベントアップセット（100 pfu超）', 'Vereinzelte Single-Event-Upsets bei Satelliten', 'Редкие одиночные сбои спутников', 'Fallos de evento único poco frecuentes en satélites'),
      L('Radiation hazard for astronauts outside the station; satellite upsets (above 1,000 pfu)', '船外活動の宇宙飛行士に被ばくの危険、衛星の誤作動（1,000 pfu超）', 'Strahlungsrisiko bei Außenbordeinsätzen; Satellitenstörungen', 'Радиационный риск при выходе в космос; сбои спутников', 'Riesgo de radiación en actividad extravehicular; fallos de satélites'),
      L('Elevated radiation risk to astronauts and high-altitude flights; satellite damage possible (above 10,000 pfu)', '宇宙飛行士・高高度飛行の被ばく増、衛星の損傷もありうる（10,000 pfu超）', 'Erhöhtes Strahlungsrisiko; Satellitenschäden möglich', 'Повышенный радиационный риск; возможны повреждения спутников', 'Mayor riesgo de radiación; posibles daños a satélites'),
      L('Severe radiation hazard in space and on polar flights; satellites may be lost (above 100,000 pfu)', '宇宙空間・極域航空路で深刻な被ばくの危険、衛星を失うことも（100,000 pfu超）', 'Schwere Strahlungsgefahr; Satellitenverlust möglich', 'Тяжёлая радиационная опасность; возможна потеря спутников', 'Grave riesgo de radiación; posible pérdida de satélites'),
    ][i];
    return [
      L('Weak power-grid fluctuations; aurora at high latitudes (Kp 5)', '電力網にわずかな変動、高緯度でオーロラ（Kp 5）', 'Schwache Netzschwankungen; Polarlicht in hohen Breiten (Kp 5)', 'Слабые колебания сетей; сияние в высоких широтах (Kp 5)', 'Fluctuaciones leves en la red; auroras en latitudes altas (Kp 5)'),
      L('Voltage alarms on high-latitude grids; aurora to about 55° geomagnetic latitude (Kp 6)', '高緯度の電力網で電圧警報、オーロラは磁気緯度55°付近まで（Kp 6）', 'Spannungsalarme in Netzen hoher Breiten; Polarlicht bis ~55° (Kp 6)', 'Сигналы напряжения в сетях высоких широт; сияние до ~55° (Kp 6)', 'Alarmas de tensión en redes de latitudes altas; auroras hasta ~55° (Kp 6)'),
      L('Voltage corrections needed; intermittent satellite navigation and HF problems; aurora to about 50° (Kp 7)', '電圧補正が必要、衛星測位と短波が断続的に不調、オーロラは磁気緯度50°付近まで（Kp 7）', 'Spannungskorrekturen nötig; Navigation und KW gestört; Polarlicht bis ~50° (Kp 7)', 'Нужна коррекция напряжения; сбои навигации и КВ; сияние до ~50° (Kp 7)', 'Correcciones de tensión; fallos de navegación y HF; auroras hasta ~50° (Kp 7)'),
      L('Widespread voltage-control problems; GPS and HF degraded for hours; aurora to about 45° (Kp 8–9−)', '広範囲で電圧制御に不具合、GPSと短波が数時間劣化、オーロラは磁気緯度45°付近まで（Kp 8〜9−）', 'Weitreichende Spannungsprobleme; GPS/KW stundenlang gestört; Polarlicht bis ~45°', 'Широкие проблемы с напряжением; GPS и КВ нарушены; сияние до ~45°', 'Problemas generalizados de tensión; GPS y HF degradados; auroras hasta ~45°'),
      L('Grid collapse and transformer damage possible; HF blackout for days; aurora to about 40° (Kp 9)', '電力網の崩壊・変圧器の損傷もありうる、短波は数日途絶、オーロラは磁気緯度40°付近まで（Kp 9）', 'Netzzusammenbruch und Transformatorschäden möglich; Polarlicht bis ~40°', 'Возможны коллапс сетей и повреждение трансформаторов; сияние до ~40°', 'Posible colapso de la red y daños a transformadores; auroras hasta ~40°'),
    ][i];
  }

  WC.define({
    id: 'space.alerts', family: 'space', variant: 'alerts', category: 'space', icon: 'bell',
    nm: function () { return L('Space weather alerts', '宇宙天気の警報', 'Weltraumwetter-Warnungen', 'Предупреждения о космической погоде', 'Alertas de clima espacial'); },
    desc: function () { return L('The latest alerts, watches and warnings from NOAA SWPC', 'NOAA SWPCの最新の警報・注意報・特報', 'Die neuesten Alarme, Watches und Warnungen von NOAA SWPC', 'Последние оповещения NOAA SWPC', 'Los últimos avisos, vigilancias y alertas de NOAA SWPC'); },
    keywords: function () { return ['SWPC', 'NOAA', L('alert', '警報', 'Warnung', 'предупреждение', 'alerta'), L('space weather watch', '注意報', 'Watch', 'наблюдение', 'vigilancia'), L('space weather', '宇宙天気', 'Weltraumwetter', 'космическая погода', 'clima espacial')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    /* alerts are issued by forecasters when an event happens — a handful a day at the busiest — so ten minutes
       is fast enough to be news and slow enough to be polite; the document is ~43 KB */
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 10 * 60000, staleAfterMs: 2 * 3600000, cacheTtlMs: 30 * 60000 },
    requestKey: function () { return 'swpc:alerts'; },
    loader: function (ctx, cfg, signal) {
      return getJSON(SWPC + 'products/alerts.json', signal).then(function (rows) {
        var d = space.alerts(rows);
        if (!d.length) return { empty: true };
        return { data: d, source: 'NOAA SWPC' };
      });
    },
    emptyText: function () { return L('No recent space weather alerts', '最近の宇宙天気の警報はありません', 'Keine aktuellen Warnungen', 'Недавних предупреждений нет', 'Sin alertas recientes'); },
    renderers: {
      s: function (ctx, cfg, st) {
        var a = st.data && st.data[0]; if (!a) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: a.title, caption: WC.ago(a.at) })]);
      },
      m: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [alertList(st.data.slice(0, 3), false), R.source({ source: st.source, at: st.data[0].at })]);
      },
      l: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [alertList(st.data.slice(0, 8), true), R.source({ source: st.source, at: st.data[0].at })]);
      },
    },
  });
  /* each alert is a row (kind mark, headline, when issued); the body opens under it */
  function alertList(rows, withBody) {
    return el('div', { role: 'list' }, rows.map(function (a) {
      var head = R.list([{ mark: R.severityMark(a.level), tone: 'sev' + a.level, title: a.title, sub: a.code, trailing: WC.date(new Date(a.at), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC',
        label: R.severityWord(a.level) + ' — ' + a.title }], { dense: true });
      if (!withBody || !a.body) return head;
      return el('details', { role: 'listitem' }, [
        el('summary', { style: 'list-style:none;cursor:pointer' }, [head]),
        el('div', { class: 'wgt-cap', style: 'white-space:pre-wrap;overflow-wrap:anywhere;margin:2px 0 8px 22px' }, [a.body]),
      ]);
    }));
  }

  WC.define({
    id: 'space.neo', family: 'space', variant: 'neo', category: 'space', icon: 'rocket',
    nm: function () { return L('Asteroid close approaches', '小惑星の接近', 'Asteroiden-Annäherungen', 'Сближения астероидов', 'Acercamientos de asteroides'); },
    desc: function () { return L('Asteroids passing within 0.05 au of the Earth in the next 60 days', '今後60日に地球から0.05 au以内を通る小惑星', 'Asteroiden, die in 60 Tagen näher als 0,05 AE an der Erde vorbeiziehen', 'Астероиды, проходящие ближе 0,05 а.е. в ближайшие 60 дней', 'Asteroides que pasarán a menos de 0,05 ua en 60 días'); },
    keywords: function () { return [L('asteroid', '小惑星', 'Asteroid', 'астероид', 'asteroide'), 'NEO', 'JPL', L('close approach', '接近', 'Annäherung', 'сближение', 'acercamiento'), L('near-Earth object', '地球近傍天体', 'erdnahes Objekt', 'АСЗ', 'objeto cercano')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    /* ssd-api.jpl.nasa.gov sends no Access-Control-Allow-Origin (measured 2026-11-17), so this goes through OUR
       relay (js/proxy-fetch.js → fetch-relay, rule "jpl-ssd-api"). Close-approach predictions are recomputed
       when an orbit is refined — a few new objects a day, existing rows move by seconds — so six hours. */
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 6 * 3600000, staleAfterMs: 24 * 3600000, cacheTtlMs: 12 * 3600000 },
    requestKey: function () { return 'jpl:cad:0.05au:60d'; },
    loader: function (ctx, cfg, signal) {
      var note = {};
      return fetchViaProxy(space.NEO_URL, { as: 'json', signal: signal, note: note }).then(function (text) {
        if (text == null) {
          if (note.reason === 'aborted') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
          if (note.reason === 'no-data') return { empty: true };
          throw new Error('relay ' + (note.reason || 'no answer'));
        }
        var d = space.neo(JSON.parse(text), Date.now());
        if (!d.length) return { empty: true };
        return { data: d, source: 'NASA/JPL SBDB Close Approach Data' };
      });
    },
    emptyText: function () { return L('No asteroid passes within 0.05 au in the next 60 days', '今後60日に0.05 au以内を通る小惑星はありません', 'Keine Annäherung unter 0,05 AE in den nächsten 60 Tagen', 'Сближений ближе 0,05 а.е. в ближайшие 60 дней нет', 'Ningún acercamiento a menos de 0,05 ua en 60 días'); },
    renderers: {
      s: function (ctx, cfg, st) {
        var a = st.data && st.data[0]; if (!a) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ value: WC.num(a.ld, { maximumFractionDigits: a.ld < 10 ? 1 : 0 }), unit: 'LD', caption: a.name })]);
      },
      m: function (ctx, cfg, st) {
        var a = st.data && st.data[0]; if (!a) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: a.name, caption: L('Closest in 60 days', '60日で最接近', 'Nächster in 60 Tagen', 'Ближайший за 60 дней', 'El más cercano en 60 días') }),
          neoFacts(a),
          R.source({ source: st.source }),
        ]);
      },
      l: function (ctx, cfg, st) {
        if (!st.data) return null;
        var a = st.data[0];
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: a.name, caption: L('Closest in 60 days', '60日で最接近', 'Nächster in 60 Tagen', 'Ближайший за 60 дней', 'El más cercano en 60 días') }),
          neoFacts(a),
          R.list(st.data.slice(1, 8).map(function (x) {
            return { icon: 'rocket', title: x.name, sub: WC.date(new Date(x.at), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC · ' + neoSize(x),
              trailing: WC.num(x.ld, { maximumFractionDigits: x.ld < 10 ? 1 : 0 }) + ' LD' };
          }), { dense: true }),
          el('div', { class: 'wgt-cap' }, [L('LD = lunar distance (384,400 km). Sizes marked “est.” are computed from the absolute magnitude H for an albedo of 0.05–0.25 (D = 1329/√p · 10^(−H/5) km, Pravec & Harris 2007).',
            'LD＝月までの距離（384,400 km）。「推定」は絶対等級Hからアルベド0.05〜0.25で換算した範囲（D = 1329/√p · 10^(−H/5) km、Pravec & Harris 2007）。',
            'LD = Mondentfernung (384.400 km). „gesch.“ = aus H für Albedo 0,05–0,25 berechnet.', 'LD — расстояние до Луны (384 400 км). «оц.» — по H при альбедо 0,05–0,25.', 'LD = distancia lunar (384 400 km). «est.» se calcula desde H con albedo 0,05–0,25.')]),
          R.source({ source: st.source }),
        ]);
      },
    },
  });
  function neoSize(a) {
    var f = function (km) { return km < 1 ? Math.round(km * 1000) + ' m' : WC.num(km, { maximumFractionDigits: 1 }) + ' km'; };
    if (a.dMeasuredKm != null) return '≈' + f(a.dMeasuredKm);
    if (a.dMinKm == null) return '—';
    return L('est.', '推定', 'gesch.', 'оц.', 'est.') + ' ' + f(a.dMinKm) + '–' + f(a.dMaxKm);
  }
  function neoFacts(a) {
    return R.facts([
      { k: L('Passes', '最接近', 'Vorbeiflug', 'Сближение', 'Paso'), v: WC.date(new Date(a.at), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' },
      { k: L('Distance', '距離', 'Abstand', 'Расстояние', 'Distancia'), v: WC.num(a.ld, { maximumFractionDigits: 2 }) + ' LD · ' + WC.num(Math.round(a.distKm)) + ' km' },
      { k: L('Speed', '相対速度', 'Geschwindigkeit', 'Скорость', 'Velocidad'), v: WC.num(a.vKmS, { maximumFractionDigits: 1 }) + ' km/s' },
      { k: L('Object size', '大きさ', 'Größe', 'Размер', 'Tamaño'), v: neoSize(a) },
    ], { cols: 2 });
  }

  /* ══ THE SPACE-WEATHER PARSERS — pure functions of an upstream document, tested on the shapes NOAA and JPL send ══ */
  var space = (function () {
    var AU_KM = 149597870.7;          /* IAU 2012 (exact) */
    var LD_KM = 384400;               /* the lunar distance NASA CNEOS quotes as 1 LD */
    /* albedo bounds of the H→diameter conversion: 0.25 (bright, small body) and 0.05 (dark, large body) are the
       two ends NASA/CNEOS prints its H-to-size table over; a measured diameter, when JPL has one, replaces them */
    var ALBEDO_BRIGHT = 0.25, ALBEDO_DARK = 0.05;
    /* GOES long-channel flux axis for the 24 h series: A1.0 is 1e-8 W/m² and X10 is 1e-3, so log10 −8 … −3 */
    var XRAY_LOG_MIN = -8, XRAY_LOG_MAX = -3;
    var SIX_H = 6 * 3600000;
    var NEO_URL = 'https://ssd-api.jpl.nasa.gov/cad.api?dist-max=0.05&date-min=now&date-max=%2B60&fullname=true&diameter=true&sort=dist';

    var utc = D.utcMs;
    function num(v) { return v == null || v === '' ? null : (isFinite(+v) ? +v : null); }

    /* GOES X-ray class from the 0.1–0.8 nm flux (W/m²): A < 1e-7 ≤ B < 1e-6 ≤ C < 1e-5 ≤ M < 1e-4 ≤ X. The number is
       the flux in units of the class's lower bound, truncated (never rounded up into the next class). Below A1.0
       (1e-8) the letter stays A and the number falls under 1. `level` is the NOAA R scale the class implies
       (M1 = R1, M5 = R2, X1 = R3, X10 = R4; below M nothing) folded to the card's 0–4 tone. */
    var CLASSES = [['A', 1e-8], ['B', 1e-7], ['C', 1e-6], ['M', 1e-5], ['X', 1e-4]];
    function xrayClass(flux) {
      flux = +flux;
      if (!(flux > 0)) return null;
      var i = 0;
      for (var k = CLASSES.length - 1; k >= 0; k--) if (flux >= CLASSES[k][1]) { i = k; break; }
      var mag = Math.floor(flux / CLASSES[i][1] * 10 + 1e-6) / 10;
      var letter = CLASSES[i][0];
      var level = letter === 'M' ? (mag >= 5 ? 3 : 2) : letter === 'X' ? (mag >= 10 ? 4 : 3) : letter === 'C' ? 1 : 0;
      return { letter: letter, mag: mag, text: letter + mag.toFixed(1), level: level, flux: flux };
    }

    /* the primary spacecraft's rows (`active`), one quantity at a time — a null in one column never hides the others */
    function series(rows, key) {
      return (Array.isArray(rows) ? rows : []).filter(function (r) { return r && r.active && num(r[key]) != null; })
        .map(function (r) { return { at: utc(r.time_tag), v: +r[key], src: r.source }; })
        .filter(function (x) { return isFinite(x.at); })
        .sort(function (a, b) { return a.at - b.at; });
    }
    function last(a) { return a.length ? a[a.length - 1] : null; }
    function within(a, ms) { var l = last(a); return l ? a.filter(function (x) { return x.at >= l.at - ms; }) : []; }
    function solarWind(wind, mag) {
      var sp = series(wind, 'proton_speed'), de = series(wind, 'proton_density'), te = series(wind, 'proton_temperature');
      var bt = series(mag, 'bt'), bz = series(mag, 'bz_gsm');
      var ls = last(sp), lz = last(bz);
      if (!ls && !lz) return null;
      var ats = [ls, last(de), last(te), last(bt), lz].filter(Boolean).map(function (x) { return x.at; });
      var v = function (a) { var l = last(a); return l ? l.v : null; };
      return { speed: v(sp), density: v(de), temperature: v(te), bt: v(bt), bz: v(bz), at: Math.max.apply(null, ats),
        windSource: ls ? ls.src : null, speedSeries: within(sp, SIX_H), bzSeries: within(bz, SIX_H) };
    }

    function xray(rows, prob) {
      var long = (Array.isArray(rows) ? rows : []).filter(function (r) { return r && r.energy === '0.1-0.8nm' && +r.flux > 0; })
        .map(function (r) { return { at: utc(r.time_tag), flux: +r.flux, sat: r.satellite }; })
        .filter(function (x) { return isFinite(x.at); }).sort(function (a, b) { return a.at - b.at; });
      if (!long.length) return null;
      var now = long[long.length - 1], max = long.reduce(function (a, b) { return b.flux > a.flux ? b : a; });
      /* 1,440 one-minute points → 288 five-minute MAXIMA (a flare lasting minutes must not be averaged away) */
      var ser = [];
      for (var i = 0; i < long.length; i += 5) {
        var b = long.slice(i, i + 5), m = b.reduce(function (a, c) { return c.flux > a.flux ? c : a; });
        ser.push({ at: m.at, v: Math.max(XRAY_LOG_MIN, Math.min(XRAY_LOG_MAX, Math.log10(m.flux))) });
      }
      var p = null, pr = Array.isArray(prob) ? prob.filter(function (r) { return r && r.date; }) : [];
      if (pr.length) {
        var cur = pr.reduce(function (a, b) { return utc(b.date) > utc(a.date) ? b : a; });
        var three = function (c) { return [1, 2, 3].map(function (d) { return num(cur[c + '_class_' + d + '_day']); }); };
        p = { c: three('c'), m: three('m'), x: three('x'), date: utc(cur.date) };
        if ([p.c, p.m, p.x].some(function (a) { return a.some(function (x) { return x == null; }); })) p = null;
      }
      return { now: Object.assign({ at: now.at }, xrayClass(now.flux)), max: Object.assign({ at: max.at }, xrayClass(max.flux)),
        series: ser, prob: p, satellite: now.sat };
    }

    /* noaa-scales.json: key "0" is the latest observation, "1".."3" the next three days ("-1" is yesterday's) */
    function scales(j) {
      if (!j || !j['0']) return null;
      var pick = function (o, k) { var x = o && o[k]; return x && x.Scale != null ? +x.Scale : null; };
      var now = {}, worst = 0;
      ['R', 'S', 'G'].forEach(function (k) { var s = pick(j['0'], k); now[k] = { scale: s == null ? 0 : s }; worst = Math.max(worst, now[k].scale); });
      var days = [1, 2, 3].map(function (i) {
        var o = j[String(i)]; if (!o) return null;
        return { at: Date.parse(o.DateStamp + 'T00:00:00Z'),
          R: { scale: pick(o, 'R'), minor: num(o.R && o.R.MinorProb), major: num(o.R && o.R.MajorProb) },
          S: { scale: pick(o, 'S'), prob: num(o.S && o.S.Prob) },
          G: { scale: pick(o, 'G') } };
      }).filter(Boolean);
      return { now: now, worst: worst, days: days, at: Date.parse(j['0'].DateStamp + 'T' + j['0'].TimeStamp + 'Z') };
    }

    /* alerts.json: { product_id, issue_datetime (UTC), message }. The message is a fixed header (code, serial,
       issue time) then a headline ("ALERT: …", "WATCH: …", "WARNING: …", "SUMMARY: …", "EXTENDED/CONTINUED …",
       "CANCEL …") and a body. The kind is SWPC's own vocabulary (swpc.noaa.gov/products/alerts-watches-and-warnings):
       a SUMMARY reports something that happened, a WATCH says conditions may develop, a WARNING or ALERT says
       they are expected or have been reached. */
    function alerts(rows) {
      return (Array.isArray(rows) ? rows : []).filter(function (r) { return r && r.message; }).map(function (r) {
        var lines = String(r.message).split(/\r?\n/);
        var iss = -1; for (var i = 0; i < lines.length; i++) if (/^Issue Time:/i.test(lines[i])) { iss = i; break; }
        var h = iss + 1; while (h < lines.length && !lines[h].trim()) h++;
        var title = (lines[h] || lines[0] || '').trim();
        var t = title.toUpperCase();
        var level = /^CANCEL/.test(t) ? 0 : /^SUMMARY/.test(t) ? 1 : /^WATCH/.test(t) ? 2 : 3;
        var code = /Message Code:\s*(\S+)/i.exec(r.message);
        return { at: utc(r.issue_datetime), title: title, level: level, code: code ? code[1] : (r.product_id || ''),
          body: lines.slice(h + 1).join('\n').trim() };
      }).filter(function (a) { return isFinite(a.at) && a.title; }).sort(function (a, b) { return b.at - a.at; }).slice(0, 20);
    }

    /* cad.api: { fields:[…], data:[[…]] } with every value a string. Approaches already past (the API's
       date-min=now resolves to the start of the UTC day) are dropped. */
    function neo(j, nowMs) {
      if (!j || !Array.isArray(j.fields) || !Array.isArray(j.data)) throw new Error('unexpected cad.api shape');
      var ix = {}; j.fields.forEach(function (f, i) { ix[f] = i; });
      ['des', 'jd', 'dist', 'v_rel', 'h'].forEach(function (f) { if (ix[f] == null) throw new Error('cad.api lacks ' + f); });
      return j.data.map(function (r) {
        var at = (+r[ix.jd] - 2440587.5) * 86400000, distAU = +r[ix.dist], h = num(r[ix.h]), dm = ix.diameter != null ? num(r[ix.diameter]) : null;
        var name = String(ix.fullname != null && r[ix.fullname] ? r[ix.fullname] : r[ix.des]).trim().replace(/^\((.*)\)$/, '$1');
        var km = function (p) { return 1329 / Math.sqrt(p) * Math.pow(10, -h / 5); };
        return { name: name, at: at, distAU: distAU, distKm: distAU * AU_KM, ld: distAU * AU_KM / LD_KM, vKmS: +r[ix.v_rel], h: h,
          dMeasuredKm: dm, dMinKm: dm != null ? dm : (h != null ? km(ALBEDO_BRIGHT) : null), dMaxKm: dm != null ? dm : (h != null ? km(ALBEDO_DARK) : null) };
      }).filter(function (a) { return isFinite(a.at) && a.at >= nowMs && isFinite(a.distAU); }).sort(function (a, b) { return a.distAU - b.distAU; });
    }

    return { xrayClass: xrayClass, solarWind: solarWind, xray: xray, scales: scales, alerts: alerts, neo: neo,
      NEO_URL: NEO_URL, XRAY_LOG_MIN: XRAY_LOG_MIN, XRAY_LOG_MAX: XRAY_LOG_MAX, AU_KM: AU_KM, LD_KM: LD_KM };
  })();


  D.space = space;
})();
