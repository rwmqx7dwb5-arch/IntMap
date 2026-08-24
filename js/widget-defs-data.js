/* ============================================================================
 *  IntMap · WIDGET DEFINITIONS — WEATHER · ENVIRONMENT · HAZARD · WORLD · KNOWLEDGE · SPACE
 * ----------------------------------------------------------------------------
 *  Every definition here has a `loader`, so every one of them is subject to the scheduler: one
 *  request per requestKey, a shared in-flight promise, a TTL, a backoff and an abort.
 *
 *  ══ ⚠ TWO CARDS ASKING THE SAME QUESTION NOW COST ONE REQUEST ══════════════════════════════════
 *  Measured on the previous board, four cards, eight seconds: coingecko/simple/price ×7,
 *  coingecko/global ×7, open-meteo/forecast ×2 for the SAME coordinate. The cause was that the unit
 *  of work was the card. Here `requestKey` is the unit: `markets:crypto` is one string however many
 *  cards want it, and a weather key rounds its coordinate to 2 decimals (~1.1 km) so two cards
 *  pointed at the same place produce the same key rather than two keys that differ in the 14th
 *  decimal of a float.
 *
 *  ══ ⚠ NO INVENTED TIME SERIES (§2.6) ═══════════════════════════════════════════════════════════
 *  Every line drawn from this file is drawn from history the source really returns: the 7-day daily
 *  forecast Open-Meteo already sent with the current conditions, and the 24 planetary-K readings
 *  NOAA publishes in one document. Where a source has no history the card shows the value and says
 *  when it was measured, which is all it actually knows. (The markets family is js/widget-defs-
 *  markets.js and holds itself to the same rule.)
 * ==========================================================================*/
window.IntMapWidgetDefsData = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var R = window.IntMapWidgetRender;
  var el = WC.el;
  var L = WC.L;

  /* ── fetch, with the failure taxonomy §11 asks for ──────────────────────────────────────────
     ⚠ A REJECTION CARRIES ITS KIND. 429 → rateLimited (+ Retry-After when the host sends one);
     404/410 → permanent; everything else is temporary and gets the backoff ladder. Without this
     the scheduler would retry a deleted endpoint for ever and give up on a busy one too soon. */
  /* ⚠ AND A REFUSAL IS REMEMBERED WHERE IT WAS EARNED. The retry ladder in js/widget-scheduler.js
     only ever sees the GROUP, so it can act on a 429 the loader rethrows — but not on one a
     fallback rescued: that group succeeded. `coolUntil` is therefore per-URL and lives beside the
     fetch that learned the number, and `firstOf` below is what honours it. */
  var coolUntil = {};
  function coolingMs(url) {
    var t = coolUntil[url];
    if (!t) return 0;
    var left = t - Date.now();
    if (left <= 0) { delete coolUntil[url]; return 0; }
    return left;
  }
  function getJSON(url, signal, opts) {
    opts = opts || {};
    return fetch(url, { signal: signal, headers: opts.headers || undefined }).then(function (r) {
      if (r.status === 429) {
        var ra = +r.headers.get('retry-after');
        var e = new Error('rate limited'); e.rateLimited = true;
        e.retryAfterMs = isFinite(ra) && ra > 0 ? ra * 1000 : 10 * 60000;
        coolUntil[url] = Date.now() + e.retryAfterMs;
        throw e;
      }
      if (r.status === 404 || r.status === 410) { var p = new Error('gone'); p.permanent = true; throw p; }
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }
  /* ── the first source that answers — and the fact that it was not the first we asked ─────────
     ⚠ A 429 A FALLBACK RESCUED IS STILL A 429. MEASURED in production on a plain load: the FX card
     asked api.fxratesapi.com every 60 s, got `429 · x-ratelimit-remaining: 0`, fell through to
     open.er-api.com, and RESOLVED — so the scheduler recorded a success, cleared `nextRetryAt`,
     and asked again a minute later, for ever. The keyless allowance is 61 calls and the board was
     spending every one of them on itself; the refusal never once reached the ladder that exists
     for exactly this. Two things follow.
       · A URL that answered 429 is NOT ASKED AGAIN until the window it named has passed. Skipping
         costs no request, which is the whole point — this is what stops the self-inflicted limit.
       · The resolution is an ENVELOPE, `{ value, url, limited }`, not a bare value: the caller has
         to know WHICH source answered (a card citing the host we merely tried first is a false
         attribution, #R352) and which ones refused.
     When every candidate has been asked and every one failed, the last error is rethrown exactly
     as before. When every candidate is still inside a window it named, nothing was asked at all —
     that is a rate limit and it says so, which is how the group finally reaches the ladder. */
  function firstOf(urls, signal, pick) {
    var i = 0, limited = [], soonest = 0, asked = 0;
    function next() {
      if (i >= urls.length) {
        if (!asked && limited.length) {
          var re = new Error('rate limited'); re.rateLimited = true;
          re.retryAfterMs = Math.max(1000, soonest);
          throw re;
        }
        throw new Error('no source');
      }
      var u = urls[i++];
      var cool = coolingMs(u);
      if (cool) {
        limited.push(u);
        if (!soonest || cool < soonest) soonest = cool;
        return next();
      }
      asked++;
      return getJSON(u, signal).then(function (j) {
        var v = pick ? pick(j, u) : j;
        if (v == null) throw new Error('no value');
        return { value: v, url: u, limited: limited };
      }).catch(function (e) {
        if (e && (e.name === 'AbortError')) throw e;
        if (e && e.rateLimited) limited.push(u);
        if (i < urls.length) return next();
        throw e;
      });
    }
    return next();
  }
  function round2(v) { return Math.round(v * 100) / 100; }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     WEATHER — one family, two variants, one loader
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  var LOC_CFG = {
    source: { type: 'enum', values: ['auto', 'device', 'map'], default: 'auto',
      label: function () { return L('Location', '地点', 'Standort', 'Местоположение', 'Ubicación'); },
      options: function () { return [
        { value: 'auto', label: L('Automatic', '自動', 'Automatisch', 'Автоматически', 'Automático') },
        { value: 'device', label: L('My location', '現在地', 'Mein Standort', 'Моё местоположение', 'Mi ubicación') },
        { value: 'map', label: L('Map centre', '地図の中心', 'Kartenmitte', 'Центр карты', 'Centro del mapa') },
      ]; } },
  };
  /* WMO weather codes → a phrase, in every language. The code is the source's; the words are ours. */
  function wxWord(c) {
    if (c == null) return '';
    if (c === 0) return L('Clear sky', '快晴', 'Klar', 'Ясно', 'Despejado');
    if (c <= 3) return L('Partly cloudy', '晴れ時々曇り', 'Teils bewölkt', 'Переменная облачность', 'Parcialmente nublado');
    if (c <= 48) return L('Fog', '霧', 'Nebel', 'Туман', 'Niebla');
    if (c <= 57) return L('Drizzle', '霧雨', 'Nieselregen', 'Морось', 'Llovizna');
    if (c <= 67) return L('Rain', '雨', 'Regen', 'Дождь', 'Lluvia');
    if (c <= 77) return L('Snow', '雪', 'Schnee', 'Снег', 'Nieve');
    if (c <= 82) return L('Showers', 'にわか雨', 'Schauer', 'Ливни', 'Chubascos');
    if (c <= 99) return L('Thunderstorm', '雷雨', 'Gewitter', 'Гроза', 'Tormenta');
    return '';
  }
  function wxIcon(c) {
    if (c == null) return 'thermo';
    if (c === 0) return 'sun';
    if (c <= 48) return 'cloud';
    if (c <= 82) return 'cloud';
    return 'activity';
  }
  function temp(v) {
    if (v == null) return '—';
    try { if (window.fmtTemp) return window.fmtTemp(v); } catch (e) {}
    return Math.round(v) + '°C';
  }
  function pointOf(ctx, cfg) { return WC.resolvePoint(ctx, cfg); }
  function wxKey(ctx, cfg) {
    var p = pointOf(ctx, cfg);
    /* ⚠ ROUNDED, ON PURPOSE. Two cards on "my location" and "map centre" over the same town must
       collapse to ONE key; a raw float never would. 2 dp ≈ 1.1 km, which is finer than the model. */
    return p ? ('wx:' + p.lat.toFixed(2) + ',' + p.lng.toFixed(2)) : 'wx:none';
  }
  function wxLoader(ctx, cfg, signal) {
    var p = pointOf(ctx, cfg);
    if (!p) return Promise.reject(Object.assign(new Error('no point'), { permanent: false }));
    return Promise.resolve(window.IntMapWx.point(p.lat, p.lng, { days: 7 })).then(function (j) {
      if (!j || !j.current) throw new Error('no data');
      return { data: { j: j, at: Date.now(), lat: p.lat, lng: p.lng }, source: j._src || 'Open-Meteo' };
    });
  }
  /* the honest reason a weather card has no number — the kernel publishes it (#R276) */
  function wxWhy() {
    try {
      var s = window.IntMapWx && window.IntMapWx.status && window.IntMapWx.status();
      if (s && s.down) {
        return s.daily
          ? L('The weather service hit its daily limit', '気象サービスが1日の上限に達しました', 'Der Wetterdienst hat sein Tageslimit erreicht', 'Метеослужба исчерпала дневной лимит', 'El servicio meteorológico alcanzó su límite diario')
          : L('The weather service is briefly unavailable', '気象サービスが一時的に利用できません', 'Der Wetterdienst ist kurzzeitig nicht erreichbar', 'Метеослужба временно недоступна', 'El servicio meteorológico no está disponible');
      }
    } catch (e) {}
    return null;
  }
  function weatherDef(o) {
    WC.define({
      id: 'weather.' + o.key, family: 'weather', variant: o.key, category: 'weather-env', icon: 'cloud',
      legacyIds: o.legacyIds, multi: true,
      nm: o.nm, desc: o.desc,
      keywords: function () { return [L('weather', '天気', 'Wetter', 'погода', 'tiempo'), L('temperature', '気温', 'Temperatur', 'температура', 'temperatura'), L('forecast', '予報', 'Vorhersage', 'прогноз', 'pronóstico')]; },
      supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
      configSchema: LOC_CFG,
      defaultConfig: function () { return { source: o.key === 'map-centre' ? 'map' : 'auto' }; },
      refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 10 * 60000, staleAfterMs: 30 * 60000, cacheTtlMs: 60 * 60000, relevantEvents: o.key === 'map-centre' ? ['map'] : ['geo'], timeoutMs: 12000 },
      requestKey: wxKey, loader: wxLoader,
      permissionReason: function () { return L('The weather here depends on where “here” is', '天気は地点によって変わります', 'Das Wetter hängt vom Ort ab', 'Погода зависит от места', 'El tiempo depende del lugar'); },
      errorHint: wxWhy,
      renderers: {
        s: function (ctx, cfg, st, api) {
          var p = pointOf(ctx, cfg);
          if (!p) return api.needsLocation();
          var cu = st.data && st.data.j.current;
          if (!cu) return null;
          return el('div', { class: 'wgt-body' }, [
            el('div', { class: 'wgt-row gap' }, [WC.icon(wxIcon(cu.weather_code), { size: 26 }),
              R.value({ value: temp(cu.temperature_2m), caption: p.label })]),
          ]);
        },
        m: function (ctx, cfg, st, api) {
          var p = pointOf(ctx, cfg);
          if (!p) return api.needsLocation();
          var j = st.data && st.data.j;
          if (!j) return null;
          var cu = j.current, d = j.daily || {};
          return el('div', { class: 'wgt-body' }, [
            el('div', { class: 'wgt-row gap' }, [WC.icon(wxIcon(cu.weather_code), { size: 30 }),
              R.value({ value: temp(cu.temperature_2m), caption: wxWord(cu.weather_code) })]),
            R.chips([
              d.temperature_2m_max ? { icon: 'thermo', label: L('Max', '最高', 'Max', 'Макс', 'Máx'), value: temp(d.temperature_2m_max[0]) } : null,
              d.temperature_2m_min ? { icon: 'thermo', label: L('Min', '最低', 'Min', 'Мин', 'Mín'), value: temp(d.temperature_2m_min[0]) } : null,
              cu.wind_speed_10m != null ? { icon: 'wind', label: L('Wind', '風', 'Wind', 'Ветер', 'Viento'), value: Math.round(cu.wind_speed_10m) + ' km/h' } : null,
              (d.precipitation_probability_max && d.precipitation_probability_max[0] != null) ? { icon: 'cloud', label: L('Rain', '降水', 'Regen', 'Осадки', 'Lluvia'), value: d.precipitation_probability_max[0] + '%' } : null,
            ]),
            R.where(p.label),
            R.actions([
              { label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { WC.flyTo({ center: [p.lng, p.lat], zoom: 8 }); } },
              { label: L('Change place', '地点を変更', 'Ort ändern', 'Сменить место', 'Cambiar lugar'), icon: 'gear', run: function () { api.openConfig(); } },
            ]),
            R.source({ source: st.source, at: st.lastSuccessfulAt }),
          ]);
        },
        /* L: a REAL seven-day series — the same request, the `daily` block it already returned */
        l: function (ctx, cfg, st, api) {
          var p = pointOf(ctx, cfg);
          if (!p) return api.needsLocation();
          var j = st.data && st.data.j;
          if (!j) return null;
          var cu = j.current, d = j.daily || {};
          var hi = (d.temperature_2m_max || []).map(function (v) { return { v: v }; });
          var lo = (d.temperature_2m_min || []).map(function (v) { return { v: v }; });
          var days = (d.time || []).map(function (t) { return WC.date(new Date(t), { weekday: 'short' }); });
          return el('div', { class: 'wgt-body' }, [
            el('div', { class: 'wgt-row gap' }, [WC.icon(wxIcon(cu.weather_code), { size: 32 }),
              R.value({ value: temp(cu.temperature_2m), caption: wxWord(cu.weather_code) + ' · ' + p.label })]),
            R.chips([
              cu.apparent_temperature != null ? { icon: 'thermo', label: L('Feels like', '体感', 'Gefühlt', 'Ощущается', 'Sensación'), value: temp(cu.apparent_temperature) } : null,
              cu.relative_humidity_2m != null ? { icon: 'cloud', label: L('Humidity', '湿度', 'Feuchte', 'Влажность', 'Humedad'), value: cu.relative_humidity_2m + '%' } : null,
              cu.wind_speed_10m != null ? { icon: 'wind', label: L('Wind', '風', 'Wind', 'Ветер', 'Viento'), value: Math.round(cu.wind_speed_10m) + ' km/h' } : null,
              cu.pressure_msl != null ? { icon: 'activity', label: L('Pressure', '気圧', 'Druck', 'Давление', 'Presión'), value: Math.round(cu.pressure_msl) + ' hPa' } : null,
            ]),
            hi.length >= 3 ? R.series(hi, { height: 54, min: Math.min.apply(null, lo.map(function (x) { return x.v; })), max: Math.max.apply(null, hi.map(function (x) { return x.v; })),
              axis: [days[0] || '', days[days.length - 1] || ''],
              label: L('Daily high, next 7 days', '今後7日間の最高気温', 'Tageshöchstwerte, nächste 7 Tage', 'Максимумы на 7 дней', 'Máximas de los próximos 7 días') }) : null,
            R.list((d.time || []).slice(0, 5).map(function (t, i) {
              return { icon: wxIcon(d.weather_code && d.weather_code[i]), title: WC.date(new Date(t), { weekday: 'long' }),
                sub: wxWord(d.weather_code && d.weather_code[i]),
                trailing: temp(d.temperature_2m_max && d.temperature_2m_max[i]) + ' / ' + temp(d.temperature_2m_min && d.temperature_2m_min[i]) };
            }), { dense: true }),
            R.actions([
              { label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { WC.flyTo({ center: [p.lng, p.lat], zoom: 8 }); } },
              { label: L('Open the weather layer', '気象レイヤーを開く', 'Wetterebene öffnen', 'Открыть слой погоды', 'Abrir la capa del tiempo'), icon: 'layers', run: function () { api.openLayer('lyrWeather') || api.openLayer('lyrWx'); } },
              { label: L('Refresh', '更新', 'Aktualisieren', 'Обновить', 'Actualizar'), icon: 'refresh', run: function () { api.refresh(true); } },
            ]),
            R.source({ source: st.source, at: st.lastSuccessfulAt }),
          ]);
        },
      },
    });
  }
  weatherDef({
    key: 'here', legacyIds: ['weather'],
    nm: function () { return L('Weather', '天気', 'Wetter', 'Погода', 'Tiempo'); },
    desc: function () { return L('Conditions where you are (asks for location)', '現在地の天気（位置情報の許可が必要）', 'Wetter an Ihrem Standort (fragt nach Freigabe)', 'Погода в вашем месте (запросит доступ)', 'El tiempo en su ubicación (pide permiso)'); },
  });
  weatherDef({
    key: 'map-centre', legacyIds: ['mapweather'],
    nm: function () { return L('Weather at the map centre', '地図中心の天気', 'Wetter in der Kartenmitte', 'Погода в центре карты', 'El tiempo en el centro del mapa'); },
    desc: function () { return L('Follows wherever the map is looking', '地図が見ている場所に追従', 'Folgt dem Kartenausschnitt', 'Следует за центром карты', 'Sigue al centro del mapa'); },
  });

  /* ══ AIR QUALITY · UV — the same host, two questions, one key each ═════════════════════════════ */
  function aqiCat(v) {
    if (v == null) return { level: 0, label: '' };
    if (v <= 50) return { level: 1, label: L('Good', '良い', 'Gut', 'Хорошо', 'Buena') };
    if (v <= 100) return { level: 1, label: L('Moderate', '普通', 'Mäßig', 'Умеренно', 'Moderada') };
    if (v <= 150) return { level: 2, label: L('Unhealthy for sensitive groups', '敏感な人に有害', 'Ungesund für empfindliche Gruppen', 'Вредно для чувствительных групп', 'Dañina para grupos sensibles') };
    if (v <= 200) return { level: 3, label: L('Unhealthy', '有害', 'Ungesund', 'Вредно', 'Dañina') };
    if (v <= 300) return { level: 3, label: L('Very unhealthy', '非常に有害', 'Sehr ungesund', 'Очень вредно', 'Muy dañina') };
    return { level: 4, label: L('Hazardous', '危険', 'Gefährlich', 'Опасно', 'Peligrosa') };
  }
  function uvCat(v) {
    if (v == null) return { level: 0, label: '' };
    if (v < 3) return { level: 1, label: L('Low', '弱い', 'Niedrig', 'Низкий', 'Bajo') };
    if (v < 6) return { level: 1, label: L('Moderate', '中程度', 'Mäßig', 'Умеренный', 'Moderado') };
    if (v < 8) return { level: 2, label: L('High', '強い', 'Hoch', 'Высокий', 'Alto') };
    if (v < 11) return { level: 3, label: L('Very high', '非常に強い', 'Sehr hoch', 'Очень высокий', 'Muy alto') };
    return { level: 4, label: L('Extreme', '極端に強い', 'Extrem', 'Экстремальный', 'Extremo') };
  }

  WC.define({
    id: 'env.aqi', family: 'environment', variant: 'aqi', category: 'weather-env', icon: 'leaf',
    legacyIds: ['aqi'], multi: true,
    nm: function () { return L('Air quality (AQI)', '大気質（AQI）', 'Luftqualität (AQI)', 'Качество воздуха (AQI)', 'Calidad del aire (AQI)'); },
    desc: function () { return L('US AQI and PM2.5 at a point', '地点のUS AQIとPM2.5', 'US-AQI und PM2,5 an einem Ort', 'US AQI и PM2.5 в точке', 'AQI de EE. UU. y PM2,5 en un punto'); },
    keywords: function () { return ['AQI', 'PM2.5', L('air quality', '大気質', 'Luftqualität', 'качество воздуха', 'calidad del aire'), L('pollution', '汚染', 'Verschmutzung', 'загрязнение', 'contaminación')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: LOC_CFG, defaultConfig: function () { return { source: 'auto' }; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 15 * 60000, staleAfterMs: 60 * 60000, cacheTtlMs: 2 * 3600000, relevantEvents: ['map', 'geo'] },
    requestKey: function (ctx, cfg) { var p = pointOf(ctx, cfg); return p ? 'aqi:' + p.lat.toFixed(2) + ',' + p.lng.toFixed(2) : 'aqi:none'; },
    loader: function (ctx, cfg, signal) {
      var p = pointOf(ctx, cfg);
      if (!p) return Promise.reject(new Error('no point'));
      return Promise.resolve(window.IntMapWx.guardedJSON(
        'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + p.lat.toFixed(2) + '&longitude=' + p.lng.toFixed(2) +
        '&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone', 300000)).then(function (j) {
        if (!j || !j.current) throw new Error('no data');
        return { data: j.current, source: 'Open-Meteo' };
      });
    },
    tone: function (st) { return st.data ? 'sev' + aqiCat(st.data.us_aqi).level : null; },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var p = pointOf(ctx, cfg); if (!p) return api.needsLocation();
        var c = st.data; if (!c) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ value: c.us_aqi != null ? Math.round(c.us_aqi) : '—', unit: 'AQI', caption: aqiCat(c.us_aqi).label })]);
      },
      m: function (ctx, cfg, st, api) {
        var p = pointOf(ctx, cfg); if (!p) return api.needsLocation();
        var c = st.data; if (!c) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: c.us_aqi != null ? Math.round(c.us_aqi) : '—', unit: 'AQI', caption: aqiCat(c.us_aqi).label }),
          R.chips([
            c.pm2_5 != null ? { label: 'PM2.5', value: WC.num(c.pm2_5, { maximumFractionDigits: 1 }) + ' µg/m³' } : null,
            c.pm10 != null ? { label: 'PM10', value: WC.num(c.pm10, { maximumFractionDigits: 1 }) + ' µg/m³' } : null,
          ]),
          R.where(p.label),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var p = pointOf(ctx, cfg); if (!p) return api.needsLocation();
        var c = st.data; if (!c) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: c.us_aqi != null ? Math.round(c.us_aqi) : '—', unit: 'AQI', caption: aqiCat(c.us_aqi).label }),
          R.bars([
            { label: 'PM2.5', v: c.pm2_5 || 0, text: WC.num(c.pm2_5, { maximumFractionDigits: 1 }) },
            { label: 'PM10', v: c.pm10 || 0, text: WC.num(c.pm10, { maximumFractionDigits: 1 }) },
            { label: 'NO₂', v: c.nitrogen_dioxide || 0, text: WC.num(c.nitrogen_dioxide, { maximumFractionDigits: 1 }) },
            { label: 'O₃', v: c.ozone || 0, text: WC.num(c.ozone, { maximumFractionDigits: 1 }) },
          ]),
          R.where(p.label),
          R.actions([{ label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { WC.flyTo({ center: [p.lng, p.lat], zoom: 8 }); } }]),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
    },
  });

  WC.define({
    id: 'env.uv', family: 'environment', variant: 'uv', category: 'weather-env', icon: 'sun',
    legacyIds: ['uv'], multi: true,
    nm: function () { return L('UV index', 'UVインデックス', 'UV-Index', 'УФ-индекс', 'Índice UV'); },
    desc: function () { return L('Today’s peak UV, clear-sky', '本日の最大UV（快晴時）', 'Heutiger UV-Höchstwert bei klarem Himmel', 'Пиковый УФ сегодня, при ясном небе', 'UV máximo de hoy, cielo despejado'); },
    keywords: function () { return ['UV', L('sun', '紫外線', 'Sonne', 'солнце', 'sol'), L('index', '指数', 'Index', 'индекс', 'índice')]; },
    supportedSizes: ['s', 'm'], defaultSize: 's',
    configSchema: LOC_CFG, defaultConfig: function () { return { source: 'auto' }; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 30 * 60000, staleAfterMs: 3 * 3600000, cacheTtlMs: 6 * 3600000, relevantEvents: ['map', 'geo'] },
    requestKey: wxKey, loader: wxLoader,
    tone: function (st) { return st.data ? 'sev' + uvCat(peakUV(st.data.j).v).level : null; },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var p = pointOf(ctx, cfg); if (!p) return api.needsLocation();
        if (!st.data) return null;
        var u = peakUV(st.data.j);
        return el('div', { class: 'wgt-body' }, [R.value({ value: u.v == null ? '—' : WC.num(u.v, { maximumFractionDigits: 1 }), unit: 'UV', caption: uvCat(u.v).label })]);
      },
      m: function (ctx, cfg, st, api) {
        var p = pointOf(ctx, cfg); if (!p) return api.needsLocation();
        if (!st.data) return null;
        var u = peakUV(st.data.j), cu = st.data.j.current || {};
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: u.v == null ? '—' : WC.num(u.v, { maximumFractionDigits: 1 }), unit: 'UV', caption: uvCat(u.v).label }),
          R.facts([
            { k: L('Now', '現在', 'Jetzt', 'Сейчас', 'Ahora'), v: cu.uv_index == null ? '—' : WC.num(cu.uv_index, { maximumFractionDigits: 1 }) },
            { k: L('Peak today', '本日の最大', 'Heutiges Maximum', 'Максимум сегодня', 'Máximo de hoy'), v: u.v == null ? '—' : WC.num(u.v, { maximumFractionDigits: 1 }) },
          ], { cols: 2 }),
          R.where(p.label + ' · ' + L('clear sky', '快晴時', 'klarer Himmel', 'ясное небо', 'cielo despejado')),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
    },
  });
  function peakUV(j) {
    var d = j && j.daily;
    if (d && d.uv_index_max && d.uv_index_max[0] != null) return { v: d.uv_index_max[0] };
    var c = j && j.current;
    return { v: c && c.uv_index != null ? c.uv_index : null };
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     EARTHQUAKES
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'hazard.earthquake', family: 'hazard', variant: 'earthquake', category: 'hazard-live', icon: 'wave',
    legacyIds: ['quake'],
    nm: function () { return L('Recent earthquakes', '直近の地震', 'Aktuelle Erdbeben', 'Недавние землетрясения', 'Terremotos recientes'); },
    desc: function () { return L('The last 24 hours, from the USGS feed', '過去24時間（USGS）', 'Die letzten 24 Stunden, USGS-Feed', 'Последние 24 часа, лента USGS', 'Últimas 24 horas, según el USGS'); },
    keywords: function () { return [L('earthquake', '地震', 'Erdbeben', 'землетрясение', 'terremoto'), 'USGS', L('magnitude', 'マグニチュード', 'Magnitude', 'магнитуда', 'magnitud'), L('seismic', '地震活動', 'seismisch', 'сейсмический', 'sísmico')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      minMag: { type: 'number', default: 2.5, min: 1, max: 7, label: function () { return L('Smallest magnitude', '最小マグニチュード', 'Kleinste Magnitude', 'Мин. магнитуда', 'Magnitud mínima'); },
        options: function () { return [{ value: 1, label: 'M1.0+' }, { value: 2.5, label: 'M2.5+' }, { value: 4.5, label: 'M4.5+' }, { value: 6, label: 'M6.0+' }]; } },
      count: { type: 'number', integer: true, default: 3, min: 1, max: 12, label: function () { return L('How many', '表示件数', 'Anzahl', 'Сколько', 'Cuántos'); } },
    },
    defaultConfig: function () { return { minMag: 2.5, count: 3 }; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 5 * 60000, staleAfterMs: 20 * 60000, cacheTtlMs: 60 * 60000 },
    requestKey: function (ctx, cfg) { return 'quake:' + (cfg.minMag >= 4.5 ? '4.5_day' : cfg.minMag >= 2.5 ? '2.5_day' : 'all_day'); },
    loader: function (ctx, cfg, signal) {
      var feed = cfg.minMag >= 4.5 ? '4.5_day' : cfg.minMag >= 2.5 ? '2.5_day' : 'all_day';
      return getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/' + feed + '.geojson', signal).then(function (j) {
        var qs = (j.features || []).filter(function (f) { return f.properties && f.properties.mag != null; })
          .map(function (f) {
            return { mag: f.properties.mag, place: f.properties.place || '', at: f.properties.time,
              depth: f.geometry && f.geometry.coordinates ? f.geometry.coordinates[2] : null,
              lng: f.geometry && f.geometry.coordinates ? f.geometry.coordinates[0] : null,
              lat: f.geometry && f.geometry.coordinates ? f.geometry.coordinates[1] : null,
              url: f.properties.url || null };
          })
          .sort(function (a, b) { return b.mag - a.mag; });
        if (!qs.length) return { empty: true };
        return { data: qs, source: 'USGS' };
      });
    },
    emptyText: function () { return L('No earthquake above this magnitude in the last 24 hours', '過去24時間、この規模以上の地震はありません', 'In 24 Stunden kein Beben über dieser Magnitude', 'За 24 часа не было землетрясений выше этой магнитуды', 'Ningún sismo por encima de esta magnitud en 24 horas'); },
    renderers: {
      s: function (ctx, cfg, st) {
        var q = pickQuakes(st, cfg)[0]; if (!q) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ value: 'M' + WC.num(q.mag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), caption: q.place, sub: el('span', { class: 'wgt-cap', text: WC.ago(q.at) }) })]);
      },
      m: function (ctx, cfg, st, api) {
        var qs = pickQuakes(st, cfg); if (!qs.length) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: 'M' + WC.num(qs[0].mag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), caption: qs[0].place }),
          R.list(qs.slice(1, Math.max(3, cfg.count)).map(function (q) { return quakeRow(q, api); }), { dense: true }),
          R.actions([{ label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { flyQuake(qs[0]); } }]),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var qs = pickQuakes(st, cfg); if (!qs.length) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: 'M' + WC.num(qs[0].mag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), caption: qs[0].place }),
          R.geo(qs.map(function (q) { return { lng: q.lng, lat: q.lat, r: Math.max(2, q.mag), tone: q.mag >= 6 ? 'sev4' : q.mag >= 4.5 ? 'sev3' : 'sev2' }; }),
            { height: 108, label: L('Where these earthquakes were', 'これらの地震の位置', 'Wo diese Beben lagen', 'Где произошли эти землетрясения', 'Dónde ocurrieron estos sismos') }),
          R.list(qs.slice(0, cfg.count).map(function (q) { return quakeRow(q, api, true); }), { dense: true }),
          R.actions([
            { label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { flyQuake(qs[0]); } },
            { label: L('Open the earthquake layer', '地震レイヤーを開く', 'Erdbebenebene öffnen', 'Открыть слой землетрясений', 'Abrir la capa de sismos'), icon: 'layers', run: function () { api.openLayer('lyrQuakes') || api.openLayer('lyrEq'); } },
          ]),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
    },
  });
  function pickQuakes(st, cfg) { return (st.data || []).filter(function (q) { return q.mag >= cfg.minMag; }); }
  function quakeRow(q, api, big) {
    return {
      mark: 'M' + WC.num(q.mag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      tone: q.mag >= 6 ? 'sev4' : q.mag >= 4.5 ? 'sev3' : 'sev2',
      title: q.place,
      sub: big && q.depth != null ? (WC.ago(q.at) + ' · ' + Math.round(q.depth) + ' km ' + L('deep', '深さ', 'tief', 'глубина', 'de profundidad')) : WC.ago(q.at),
      label: 'M' + q.mag + ' ' + q.place,
      onClick: function () { flyQuake(q); },
    };
  }
  function flyQuake(q) { if (q && isFinite(q.lng)) WC.flyTo({ center: [q.lng, q.lat], zoom: 6 }); }

  /* ⚠ THE FIRST-CHOICE COUNTRY IS A TABLE, NOT A TERNARY (#R243) — and it is read INSIDE
     defaultConfig, at the moment a card is created, which is the whole reason that seed can no
     longer throw before the card exists.
     ⚠ NOT PROSE, AND NOT AN EXEMPTION EITHER. These are ISO-3166 alpha-2 CODES — the value a new
     card opens on, never anything a reader sees. The NAME comes from CLDR through WC.countryName(),
     so no translator ever touches this table and no instrument has to be told to ignore it. */
  var DEF_CC = { jp: 'JP', ko: 'KR', zh: 'TW', 'zh-hans': 'CN', de: 'DE', fr: 'FR', es: 'ES', ru: 'RU' };
  function langKey() { try { return window.IntMapLang.normalise(WC.lang()); } catch (e) { return 'en'; } }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     WORLD — country, population, holidays
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  function flagEmoji(cc) {
    try { return String(cc).toUpperCase().replace(/./g, function (c) { return String.fromCodePoint(127397 + c.charCodeAt(0)); }); } catch (e) { return ''; }
  }
  function countryRows() {
    try {
      var cs = WC.host() && WC.host().countryStats;
      return cs ? Object.keys(cs).map(function (k) { return Object.assign({ cc: k }, cs[k]); }) : [];
    } catch (e) { return []; }
  }
  WC.define({
    id: 'world.country', family: 'world', variant: 'random', category: 'world', icon: 'flag',
    legacyIds: ['country'], multi: true,
    nm: function () { return L('Country', '国', 'Land', 'Страна', 'País'); },
    desc: function () { return L('Flag and key facts — random, or the one you selected', '国旗と基礎データ（ランダム／選択中の国）', 'Flagge und Eckdaten – zufällig oder ausgewählt', 'Флаг и ключевые факты — случайно или выбранная', 'Bandera y datos clave: aleatorio o el seleccionado'); },
    keywords: function () { return [L('country', '国', 'Land', 'страна', 'país'), L('flag', '国旗', 'Flagge', 'флаг', 'bandera'), L('population', '人口', 'Bevölkerung', 'население', 'población'), 'GDP']; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      mode: { type: 'enum', values: ['random', 'selected', 'fixed'], default: 'random',
        label: function () { return L('Which country', 'どの国', 'Welches Land', 'Какая страна', 'Qué país'); },
        options: function () { return [
          { value: 'random', label: L('Random each time', '毎回ランダム', 'Jedes Mal zufällig', 'Каждый раз случайно', 'Aleatorio cada vez') },
          { value: 'selected', label: L('Whatever is selected on the map', '地図で選択中の国', 'Was auf der Karte gewählt ist', 'Выбранная на карте', 'El seleccionado en el mapa') },
          { value: 'fixed', label: L('A fixed country', '固定の国', 'Ein festes Land', 'Фиксированная страна', 'Un país fijo') },
        ]; } },
      cc: { type: 'country', default: function () { return DEF_CC[langKey()] || 'US'; }, label: function () { return L('Country', '国', 'Land', 'Страна', 'País'); },
        options: function () { return countryRows().map(function (r) { return { value: r.cc, label: WC.countryName(r.cc, r.name) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }); } },
    },
    defaultConfig: function () { return { mode: 'random', cc: DEF_CC[langKey()] || 'US' }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['selection'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var c = pickCountry(ctx, cfg, st, api); if (!c) return null;
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-row gap' }, [el('span', { class: 'wgt-flag', text: flagEmoji(c.cc), 'aria-hidden': 'true' }),
            R.value({ small: true, value: WC.countryName(c.cc, c.name), caption: c.pop != null ? WC.compact(c.pop) : '' })]),
        ]);
      },
      m: function (ctx, cfg, st, api) {
        var c = pickCountry(ctx, cfg, st, api); if (!c) return null;
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-row gap' }, [el('span', { class: 'wgt-flag', text: flagEmoji(c.cc), 'aria-hidden': 'true' }),
            R.value({ small: true, value: WC.countryName(c.cc, c.name) })]),
          R.facts(countryFacts(c), { cols: 2 }),
          R.actions([
            { label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { api.flyCountry(c.cc); } },
            cfg.mode === 'random' ? { label: L('Another country', '別の国', 'Anderes Land', 'Другая страна', 'Otro país'), icon: 'refresh', run: function () { api.local({ roll: Math.random() }); } } : null,
          ]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var c = pickCountry(ctx, cfg, st, api); if (!c) return null;
        var all = countryRows().filter(function (r) { return r.pop; });
        var rank = all.slice().sort(function (a, b) { return (b.pop || 0) - (a.pop || 0); }).findIndex(function (r) { return r.cc === c.cc; }) + 1;
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-row gap' }, [el('span', { class: 'wgt-flag big', text: flagEmoji(c.cc), 'aria-hidden': 'true' }),
            R.value({ small: true, value: WC.countryName(c.cc, c.name), caption: rank ? (L('rank', '順位', 'Rang', 'место', 'puesto') + ' ' + rank + ' / ' + all.length + ' ' + L('by population', '人口', 'nach Bevölkerung', 'по населению', 'por población')) : '' })]),
          R.facts(countryFacts(c, true), { cols: 2 }),
          R.actions([
            { label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { api.flyCountry(c.cc); } },
            { label: L('Watch this country', 'この国を監視', 'Dieses Land beobachten', 'Следить за страной', 'Vigilar este país'), icon: 'eye', run: function () { api.addCountryWatch(c.cc); } },
            cfg.mode === 'random' ? { label: L('Another country', '別の国', 'Anderes Land', 'Другая страна', 'Otro país'), icon: 'refresh', run: function () { api.local({ roll: Math.random() }); } } : null,
          ]),
        ]);
      },
    },
  });
  function pickCountry(ctx, cfg, st, api) {
    var rows = countryRows();
    if (!rows.length) return null;
    if (cfg.mode === 'fixed') return rows.find(function (r) { return r.cc === cfg.cc; }) || rows[0];
    if (cfg.mode === 'selected' && ctx.selection.country) {
      var sel = rows.find(function (r) { return r.cc === String(ctx.selection.country).toUpperCase(); });
      if (sel) return sel;
    }
    /* ⚠ THE RANDOM PICK IS SEEDED BY THE CARD, NOT BY THE CLOCK. A card that re-rolled on every
       tick would change country under the reader's finger; this only moves when the ⟳ action asks. */
    var seed = (st.local && st.local.roll != null) ? st.local.roll : 0.42;
    void api;
    return rows[Math.floor(seed * rows.length) % rows.length];
  }
  function countryFacts(c, big) {
    var out = [
      { k: L('Population', '人口', 'Bevölkerung', 'Население', 'Población'), v: c.pop != null ? WC.compact(c.pop) : '—' },
      { k: L('Area', '面積', 'Fläche', 'Площадь', 'Superficie'), v: c.area != null ? WC.compact(c.area) + ' km²' : '—' },
      { k: 'GDP', v: c.gdp != null ? '$' + WC.compact(c.gdp) : '—' },
      { k: L('Capital', '首都', 'Hauptstadt', 'Столица', 'Capital'), v: c.capital || '—' },
    ];
    if (big) {
      out.push({ k: L('Density', '人口密度', 'Dichte', 'Плотность', 'Densidad'), v: (c.pop && c.area) ? WC.num(c.pop / c.area, { maximumFractionDigits: 1 }) + ' /km²' : '—' });
      out.push({ k: L('GDP per person', '一人当たりGDP', 'BIP pro Kopf', 'ВВП на человека', 'PIB por persona'), v: (c.gdp && c.pop) ? '$' + WC.num(c.gdp / c.pop, { maximumFractionDigits: 0 }) : '—' });
    }
    return out;
  }

  WC.define({
    id: 'world.population', family: 'world', variant: 'population', category: 'world', icon: 'users',
    legacyIds: ['pop'],
    nm: function () { return L('World population', '世界人口', 'Weltbevölkerung', 'Население мира', 'Población mundial'); },
    desc: function () { return L('A live estimate, from the UN projection', '国連推計に基づくライブ推定', 'Live-Schätzung nach UN-Projektion', 'Оценка в реальном времени по прогнозу ООН', 'Estimación en vivo, según la proyección de la ONU'); },
    keywords: function () { return [L('population', '人口', 'Bevölkerung', 'население', 'población'), 'UN', L('world', '世界', 'Welt', 'мир', 'mundo')]; },
    supportedSizes: ['s', 'm'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'second'; } },
    renderers: {
      s: function (ctx, cfg, st) {
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: WC.num(worldPop(st) / 1e9, { minimumFractionDigits: 4, maximumFractionDigits: 4 }), unit: L('bn', '十億', 'Mrd.', 'млрд', 'mil M') })]);
      },
      m: function (ctx, cfg, st) {
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: WC.num(worldPop(st) / 1e9, { minimumFractionDigits: 6, maximumFractionDigits: 6 }), unit: L('bn', '十億', 'Mrd.', 'млрд', 'mil M'),
            caption: L('live estimate, UN-based', '国連推計ベースのライブ推定', 'Live-Schätzung auf UN-Basis', 'оценка в реальном времени по данным ООН', 'estimación en vivo basada en la ONU') }),
          R.facts([{ k: L('Growth', '増加', 'Wachstum', 'Прирост', 'Crecimiento'), v: '≈ +2.17 ' + L('people per second', '人/秒', 'Menschen pro Sekunde', 'человек в секунду', 'personas por segundo') }]),
          R.source({ source: 'UN WPP 2024' }),
        ]);
      },
    },
  });
  function worldPop(st) {
    var now = (st.now || new Date()).getTime();
    return 8.231e9 + (now - Date.UTC(2025, 6, 1)) / 1000 * 2.17;
  }

  WC.define({
    id: 'world.holiday', family: 'world', variant: 'holiday', category: 'time-cal', icon: 'calendar',
    legacyIds: ['holiday'], multi: true,
    nm: function () { return L('Next public holiday', '次の祝日', 'Nächster Feiertag', 'Ближайший праздник', 'Próximo festivo'); },
    desc: function () { return L('The next public holiday in a country you pick', '選んだ国の次の祝日', 'Der nächste Feiertag in einem Land Ihrer Wahl', 'Ближайший праздник в выбранной стране', 'El próximo festivo en el país que elija'); },
    keywords: function () { return [L('holiday', '祝日', 'Feiertag', 'праздник', 'festivo'), L('public holiday', '祝祭日', 'gesetzlicher Feiertag', 'государственный праздник', 'día festivo')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      cc: { type: 'country', default: function () { return DEF_CC[langKey()] || 'US'; }, label: function () { return L('Country', '国', 'Land', 'Страна', 'País'); },
        options: function () { return countryRows().map(function (r) { return { value: r.cc, label: WC.countryName(r.cc, r.name) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }); } },
    },
    defaultConfig: function () { return { cc: DEF_CC[langKey()] || 'US' }; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 6 * 3600000, staleAfterMs: 24 * 3600000, cacheTtlMs: 3 * 24 * 3600000 },
    title: function (cfg) { return L('Next holiday', '次の祝日', 'Nächster Feiertag', 'Ближайший праздник', 'Próximo festivo') + ' · ' + WC.countryName(cfg.cc, cfg.cc); },
    requestKey: function (ctx, cfg) { return 'holiday:' + cfg.cc; },
    loader: function (ctx, cfg, signal) {
      return getJSON('https://date.nager.at/api/v3/NextPublicHolidays/' + cfg.cc, signal).then(function (j) {
        if (!Array.isArray(j) || !j.length) return { empty: true };
        return { data: j.slice(0, 8), source: 'date.nager.at' };
      });
    },
    emptyText: function (ctx) { void ctx; return L('No upcoming public holidays are published for this country', 'この国の今後の祝日は公開されていません', 'Für dieses Land sind keine Feiertage veröffentlicht', 'Для этой страны праздники не опубликованы', 'No hay festivos publicados para este país'); },
    renderers: {
      s: function (ctx, cfg, st) {
        var h = st.data && st.data[0]; if (!h) return null;
        var d = Math.ceil((new Date(h.date) - Date.now()) / 864e5);
        return el('div', { class: 'wgt-body' }, [R.value({ value: Math.max(0, d), unit: L('d', '日', 'T', 'дн', 'd'), caption: h.localName })]);
      },
      m: function (ctx, cfg, st, api) {
        var h = st.data && st.data[0]; if (!h) return null;
        var d = Math.ceil((new Date(h.date) - Date.now()) / 864e5);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: h.localName, caption: WC.date(new Date(h.date + 'T00:00:00'), { dateStyle: 'full' }) }),
          R.chips([
            { icon: 'calendar', label: L('in', 'あと', 'in', 'через', 'en'), value: Math.max(0, d) + L(' d', '日', ' T', ' дн', ' d') },
            { icon: 'flag', label: WC.countryName(cfg.cc, cfg.cc) },
          ]),
          R.actions([{ label: L('Change country', '国を変更', 'Land ändern', 'Сменить страну', 'Cambiar país'), icon: 'gear', run: function () { api.openConfig(); } }]),
          R.source({ source: st.source }),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        if (!st.data || !st.data.length) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: st.data[0].localName, caption: WC.date(new Date(st.data[0].date + 'T00:00:00'), { dateStyle: 'full' }) }),
          R.list(st.data.slice(1, 6).map(function (h) {
            return { icon: 'calendar', title: h.localName, sub: h.name !== h.localName ? h.name : '',
              trailing: WC.date(new Date(h.date + 'T00:00:00'), { month: 'short', day: 'numeric' }) };
          }), { dense: true }),
          R.actions([{ label: L('Change country', '国を変更', 'Land ändern', 'Сменить страну', 'Cambiar país'), icon: 'gear', run: function () { api.openConfig(); } }]),
          R.source({ source: st.source }),
        ]);
      },
    },
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     KNOWLEDGE — Wikipedia, Hacker News
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  function wikiLangs() {
    var t = 'en';
    try { t = String(window.IntMapLang.htmlTag(WC.lang()) || 'en').toLowerCase().split('-')[0]; } catch (e) {}
    return t === 'en' ? ['en'] : [t, 'en'];
  }
  function wikiFeed(kind, signal) {
    var now = new Date();
    var langs = wikiLangs();
    var i = 0;
    function next() {
      if (i >= langs.length) throw new Error('no feed');
      var wl = langs[i++];
      var url = kind === 'onthisday'
        ? 'https://api.wikimedia.org/feed/v1/wikipedia/' + wl + '/onthisday/events/' + (now.getMonth() + 1) + '/' + now.getDate()
        : 'https://api.wikimedia.org/feed/v1/wikipedia/' + wl + '/featured/' + now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + String(now.getDate()).padStart(2, '0');
      return getJSON(url, signal).catch(function (e) { if (e && e.name === 'AbortError') throw e; if (i < langs.length) return next(); throw e; });
    }
    return next();
  }
  WC.define({
    id: 'knowledge.on-this-day', family: 'knowledge', variant: 'on-this-day', category: 'knowledge', icon: 'book',
    legacyIds: ['otd'],
    nm: function () { return L('On this day', '今日は何の日', 'An diesem Tag', 'В этот день', 'Tal día como hoy'); },
    desc: function () { return L('What happened on today’s date', '今日の日付に起きた出来事', 'Was an diesem Datum geschah', 'Что произошло в этот день', 'Qué ocurrió en esta fecha'); },
    keywords: function () { return [L('history', '歴史', 'Geschichte', 'история', 'historia'), 'Wikipedia', L('anniversary', '記念日', 'Jahrestag', 'годовщина', 'aniversario')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 6 * 3600000, staleAfterMs: 24 * 3600000, cacheTtlMs: 12 * 3600000 },
    requestKey: function () { var n = new Date(); return 'wiki:otd:' + wikiLangs()[0] + ':' + (n.getMonth() + 1) + '-' + n.getDate(); },
    loader: function (ctx, cfg, signal) {
      return wikiFeed('onthisday', signal).then(function (j) {
        var ev = (j && j.events) || [];
        if (!ev.length) return { empty: true };
        return { data: ev.slice(0, 12).map(function (e) {
          var p = (e.pages && e.pages[0]) || {};
          return { year: e.year, text: e.text,
            href: (p.content_urls && p.content_urls.desktop && p.content_urls.desktop.page) || null };
        }), source: 'Wikipedia' };
      });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        var e = pickOtd(st, 0); if (!e) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: String(e.year), caption: e.text })]);
      },
      m: function (ctx, cfg, st, api) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.list(st.data.slice(0, 3).map(function (e) { return { mark: String(e.year), title: e.text, href: e.href || undefined }; })),
          R.actions([{ label: L('Show me another', '別の出来事', 'Etwas anderes zeigen', 'Показать другое', 'Mostrar otro'), icon: 'refresh', run: function () { api.local({ off: ((st.local && st.local.off) || 0) + 3 }); } }]),
          R.source({ source: st.source }),
        ]);
      },
      l: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.list(st.data.slice(0, 8).map(function (e) { return { mark: String(e.year), title: e.text, href: e.href || undefined }; })),
          R.source({ source: st.source }),
        ]);
      },
    },
  });
  function pickOtd(st, i) {
    var d = st.data || [];
    var off = (st.local && st.local.off) || 0;
    return d[(off + i) % Math.max(1, d.length)];
  }

  WC.define({
    id: 'knowledge.wikipedia-featured', family: 'knowledge', variant: 'wikipedia-featured', category: 'knowledge', icon: 'book',
    legacyIds: ['wikifeat'],
    nm: function () { return L('Featured article', '今日の注目記事', 'Artikel des Tages', 'Избранная статья', 'Artículo destacado'); },
    desc: function () { return L('Wikipedia’s article of the day', 'Wikipediaの本日の注目記事', 'Der Wikipedia-Artikel des Tages', 'Статья дня в Википедии', 'El artículo del día de Wikipedia'); },
    keywords: function () { return ['Wikipedia', L('article', '記事', 'Artikel', 'статья', 'artículo'), L('featured', '注目', 'Empfehlung', 'избранное', 'destacado')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 6 * 3600000, staleAfterMs: 24 * 3600000, cacheTtlMs: 12 * 3600000 },
    requestKey: function () { var n = new Date(); return 'wiki:tfa:' + wikiLangs()[0] + ':' + n.toISOString().slice(0, 10); },
    loader: function (ctx, cfg, signal) {
      return wikiFeed('featured', signal).then(function (j) {
        var t = j && j.tfa;
        if (!t) return { empty: true };
        return { data: { title: t.titles && t.titles.normalized ? t.titles.normalized : t.title,
          extract: t.extract || '', href: (t.content_urls && t.content_urls.desktop && t.content_urls.desktop.page) || null }, source: 'Wikipedia' };
      });
    },
    renderers: {
      s: function (ctx, cfg, st) { return st.data ? el('div', { class: 'wgt-body' }, [R.value({ small: true, value: st.data.title })]) : null; },
      m: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.article({ title: st.data.title, excerpt: (st.data.extract || '').slice(0, 160), source: 'Wikipedia', href: st.data.href }),
        ]);
      },
      l: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.article({ title: st.data.title, excerpt: (st.data.extract || '').slice(0, 420), source: 'Wikipedia', href: st.data.href }),
        ]);
      },
    },
  });

  WC.define({
    id: 'knowledge.hacker-news', family: 'knowledge', variant: 'hacker-news', category: 'knowledge', icon: 'news',
    legacyIds: ['hn'],
    nm: function () { return 'Hacker News'; },
    desc: function () { return L('The top stories right now', '現在の上位ストーリー', 'Die aktuellen Top-Beiträge', 'Самые популярные истории', 'Las historias más populares'); },
    keywords: function () { return ['Hacker News', 'HN', L('technology', 'テクノロジー', 'Technik', 'технологии', 'tecnología'), L('news', 'ニュース', 'Nachrichten', 'новости', 'noticias')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: { count: { type: 'number', integer: true, default: 3, min: 1, max: 10, label: function () { return L('How many', '表示件数', 'Anzahl', 'Сколько', 'Cuántos'); } } },
    defaultConfig: function () { return { count: 3 }; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 10 * 60000, staleAfterMs: 60 * 60000, cacheTtlMs: 2 * 3600000 },
    requestKey: function () { return 'hn:top'; },
    loader: function (ctx, cfg, signal) {
      return getJSON('https://hacker-news.firebaseio.com/v0/topstories.json', signal).then(function (ids) {
        return Promise.all((ids || []).slice(0, 10).map(function (id) {
          return getJSON('https://hacker-news.firebaseio.com/v0/item/' + id + '.json', signal).catch(function () { return null; });
        }));
      }).then(function (items) {
        var rows = items.filter(Boolean).map(function (it) {
          return { title: it.title, score: it.score, at: (it.time || 0) * 1000,
            href: WC.safeUrl(it.url) || 'https://news.ycombinator.com/item?id=' + it.id,
            comments: it.descendants || 0 };
        });
        if (!rows.length) return { empty: true };
        return { data: rows, source: 'Hacker News' };
      });
    },
    renderers: {
      s: function (ctx, cfg, st) { return st.data ? el('div', { class: 'wgt-body' }, [R.article({ title: st.data[0].title, source: 'HN', href: st.data[0].href })]) : null; },
      m: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.list(st.data.slice(0, cfg.count).map(function (r) {
            return { icon: 'news', title: r.title, sub: r.score + ' ' + L('points', 'ポイント', 'Punkte', 'очков', 'puntos') + ' · ' + WC.ago(r.at), href: r.href };
          })),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
      l: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.list(st.data.slice(0, Math.max(cfg.count, 6)).map(function (r) {
            return { icon: 'news', title: r.title, sub: r.score + ' ' + L('points', 'ポイント', 'Punkte', 'очков', 'puntos') + ' · ' + r.comments + ' ' + L('comments', 'コメント', 'Kommentare', 'комментариев', 'comentarios') + ' · ' + WC.ago(r.at), href: r.href };
          })),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
    },
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     SPACE
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'space.iss', family: 'space', variant: 'iss', category: 'space', icon: 'satellite',
    legacyIds: ['iss'],
    nm: function () { return L('ISS tracker', '国際宇宙ステーション', 'ISS-Tracker', 'Отслеживание МКС', 'Rastreador de la ISS'); },
    desc: function () { return L('Where the station is right now', '現在のISSの位置', 'Wo sich die Station gerade befindet', 'Где сейчас находится станция', 'Dónde está la estación ahora'); },
    keywords: function () { return ['ISS', L('space station', '宇宙ステーション', 'Raumstation', 'космическая станция', 'estación espacial'), L('orbit', '軌道', 'Orbit', 'орбита', 'órbita')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'interval', minIntervalMs: 30000, staleAfterMs: 3 * 60000, cacheTtlMs: 5 * 60000 },
    requestKey: function () { return 'iss:position'; },
    loader: function (ctx, cfg, signal) {
      return getJSON('https://api.wheretheiss.at/v1/satellites/25544', signal).then(function (j) {
        if (!j || j.latitude == null) throw new Error('no data');
        return { data: { lat: +j.latitude, lng: +j.longitude, alt: +j.altitude, vel: +j.velocity, at: (j.timestamp || 0) * 1000, day: j.visibility === 'daylight' }, source: 'wheretheiss.at' };
      });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: WC.num(st.data.lat, { maximumFractionDigits: 1 }) + '°, ' + WC.num(st.data.lng, { maximumFractionDigits: 1 }) + '°', caption: Math.round(st.data.alt) + ' km' })]);
      },
      m: function (ctx, cfg, st) {
        if (!st.data) return null;
        var d = st.data;
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: WC.num(d.lat, { maximumFractionDigits: 2 }) + '°, ' + WC.num(d.lng, { maximumFractionDigits: 2 }) + '°' }),
          R.facts([
            { k: L('Altitude', '高度', 'Höhe', 'Высота', 'Altitud'), v: Math.round(d.alt) + ' km' },
            { k: L('Speed', '速度', 'Geschwindigkeit', 'Скорость', 'Velocidad'), v: WC.num(Math.round(d.vel)) + ' km/h' },
          ], { cols: 2 }),
          R.actions([{ label: L('Fly there', '地図で見る', 'Dorthin fliegen', 'Перелететь туда', 'Volar allí'), icon: 'pin', run: function () { WC.flyTo({ center: [d.lng, d.lat], zoom: 3 }); } }]),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
      /* L: the locator, with the ground track the samples we ALREADY HAVE describe (§7.I) */
      l: function (ctx, cfg, st) {
        if (!st.data) return null;
        var d = st.data;
        var trail = (st.local && st.local.trail) || [];
        return el('div', { class: 'wgt-body' }, [
          R.geo([{ lng: d.lng, lat: d.lat, r: 4.5, tone: 'accent' }], {
            height: 118, track: trail.length > 1 ? [trail] : [],
            label: L('Current position of the ISS', 'ISSの現在位置', 'Aktuelle Position der ISS', 'Текущее положение МКС', 'Posición actual de la ISS'),
          }),
          R.facts([
            { k: L('Latitude', '緯度', 'Breite', 'Широта', 'Latitud'), v: WC.num(d.lat, { maximumFractionDigits: 3 }) + '°' },
            { k: L('Longitude', '経度', 'Länge', 'Долгота', 'Longitud'), v: WC.num(d.lng, { maximumFractionDigits: 3 }) + '°' },
            { k: L('Altitude', '高度', 'Höhe', 'Высота', 'Altitud'), v: Math.round(d.alt) + ' km' },
            { k: L('Speed', '速度', 'Geschwindigkeit', 'Скорость', 'Velocidad'), v: WC.num(Math.round(d.vel)) + ' km/h' },
          ], { cols: 2 }),
          R.actions([{ label: L('Fly there', '地図で見る', 'Dorthin fliegen', 'Перелететь туда', 'Volar allí'), icon: 'pin', run: function () { WC.flyTo({ center: [d.lng, d.lat], zoom: 3 }); } }]),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
    },
    /* the trail is built from readings this card has actually taken — never interpolated */
    onData: function (st) {
      var t = (st.local && st.local.trail) || [];
      if (st.data && isFinite(st.data.lng)) {
        var last = t[t.length - 1];
        if (!last || Math.abs(last[0] - st.data.lng) > 0.05 || Math.abs(last[1] - st.data.lat) > 0.05) t = t.concat([[st.data.lng, st.data.lat]]);
        if (t.length > 60) t = t.slice(-60);
      }
      return { trail: t };
    },
  });

  WC.define({
    id: 'space.launch', family: 'space', variant: 'launch', category: 'space', icon: 'rocket',
    legacyIds: ['launch'],
    nm: function () { return L('Next rocket launch', '次のロケット打上げ', 'Nächster Raketenstart', 'Ближайший запуск ракеты', 'Próximo lanzamiento'); },
    desc: function () { return L('The next scheduled orbital launch', '次に予定される軌道打上げ', 'Der nächste geplante Orbitalstart', 'Ближайший плановый орбитальный запуск', 'El próximo lanzamiento orbital previsto'); },
    keywords: function () { return [L('launch', '打上げ', 'Start', 'запуск', 'lanzamiento'), L('rocket', 'ロケット', 'Rakete', 'ракета', 'cohete'), 'SpaceX', L('space', '宇宙', 'Weltraum', 'космос', 'espacio')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 30 * 60000, staleAfterMs: 3 * 3600000, cacheTtlMs: 6 * 3600000 },
    requestKey: function () { return 'launch:upcoming'; },
    loader: function (ctx, cfg, signal) {
      return getJSON('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=5&mode=list', signal).then(function (j) {
        var rs = (j && j.results) || [];
        if (!rs.length) return { empty: true };
        return { data: rs.map(function (r) {
          var pad = r.pad || {};
          return { name: r.name, at: r.net ? +new Date(r.net) : null,
            provider: (r.launch_service_provider && r.launch_service_provider.name) || '',
            pad: pad.name || '', place: (pad.location && pad.location.name) || '',
            lat: pad.latitude != null ? +pad.latitude : null, lng: pad.longitude != null ? +pad.longitude : null };
        }), source: 'Launch Library 2' };
      });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        var r = st.data && st.data[0]; if (!r) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: r.at ? WC.ago(r.at).replace(/^-/, '') : '—', caption: r.name })]);
      },
      m: function (ctx, cfg, st) {
        var r = st.data && st.data[0]; if (!r) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: r.name, caption: r.at ? WC.date(new Date(r.at), { dateStyle: 'medium', timeStyle: 'short' }) : '' }),
          R.facts([
            { k: L('Provider', '運用者', 'Betreiber', 'Оператор', 'Operador'), v: r.provider || '—' },
            { k: L('Site', '射場', 'Startplatz', 'Космодром', 'Base'), v: r.place || '—' },
          ], { cols: 2 }),
          R.source({ source: st.source }),
        ]);
      },
      l: function (ctx, cfg, st) {
        if (!st.data) return null;
        var pts = st.data.filter(function (r) { return isFinite(r.lat); }).map(function (r) { return { lng: r.lng, lat: r.lat, tone: 'accent' }; });
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: st.data[0].name, caption: st.data[0].at ? WC.date(new Date(st.data[0].at), { dateStyle: 'medium', timeStyle: 'short' }) : '' }),
          pts.length ? R.geo(pts, { height: 100, label: L('Launch sites', '射場', 'Startplätze', 'Космодромы', 'Bases de lanzamiento') }) : null,
          R.list(st.data.slice(0, 5).map(function (r) {
            return { icon: 'rocket', title: r.name, sub: [r.provider, r.place].filter(Boolean).join(' · '),
              trailing: r.at ? WC.date(new Date(r.at), { month: 'short', day: 'numeric' }) : '',
              onClick: isFinite(r.lat) ? function () { WC.flyTo({ center: [r.lng, r.lat], zoom: 7 }); } : undefined };
          }), { dense: true }),
          R.source({ source: st.source }),
        ]);
      },
    },
  });

  WC.define({
    id: 'space.kp', family: 'space', variant: 'kp', category: 'space', icon: 'radio',
    legacyIds: ['kp'],
    nm: function () { return L('Geomagnetic activity (Kp)', '地磁気活動（Kp指数）', 'Geomagnetische Aktivität (Kp)', 'Геомагнитная активность (Kp)', 'Actividad geomagnética (Kp)'); },
    desc: function () { return L('The planetary K index, and what it means for aurora', '惑星K指数とオーロラの目安', 'Der planetare K-Index und die Polarlicht-Chance', 'Планетарный K-индекс и шансы на сияние', 'El índice K planetario y la probabilidad de auroras'); },
    keywords: function () { return ['Kp', L('aurora', 'オーロラ', 'Polarlicht', 'сияние', 'aurora'), L('geomagnetic', '地磁気', 'geomagnetisch', 'геомагнитный', 'geomagnético'), 'NOAA']; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 15 * 60000, staleAfterMs: 2 * 3600000, cacheTtlMs: 3 * 3600000 },
    requestKey: function () { return 'kp:planetary'; },
    loader: function (ctx, cfg, signal) {
      return getJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', signal).then(function (rows) {
        if (!Array.isArray(rows) || rows.length < 2) throw new Error('no data');
        var body = rows.slice(1).filter(function (r) { return r && r[1] != null; });
        if (!body.length) return { empty: true };
        return { data: body.slice(-24).map(function (r) { return { at: +new Date(String(r[0]).replace(' ', 'T') + 'Z'), kp: +r[1] }; }), source: 'NOAA SWPC' };
      });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        var d = st.data && st.data[st.data.length - 1]; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ value: WC.num(d.kp, { maximumFractionDigits: 1 }), unit: 'Kp', caption: kpWord(d.kp) })]);
      },
      m: function (ctx, cfg, st) {
        var d = st.data && st.data[st.data.length - 1]; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: WC.num(d.kp, { maximumFractionDigits: 1 }), unit: 'Kp', caption: kpWord(d.kp) }),
          R.progress(d.kp / 9 * 100, { label: 'Kp' }),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
      l: function (ctx, cfg, st) {
        if (!st.data || st.data.length < 3) return null;
        var d = st.data[st.data.length - 1];
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: WC.num(d.kp, { maximumFractionDigits: 1 }), unit: 'Kp', caption: kpWord(d.kp) }),
          R.series(st.data.map(function (x) { return { v: x.kp }; }), { height: 56, min: 0, max: 9,
            axis: [WC.date(new Date(st.data[0].at), { hour: '2-digit', minute: '2-digit' }), WC.date(new Date(d.at), { hour: '2-digit', minute: '2-digit' })],
            label: L('Planetary K index, recent readings', '直近の惑星K指数', 'Planetarer K-Index, jüngste Werte', 'Планетарный K-индекс, последние значения', 'Índice K planetario, lecturas recientes') }),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
    },
  });
  function kpWord(v) {
    if (v < 4) return L('Quiet', '静穏', 'Ruhig', 'Спокойно', 'Tranquilo');
    if (v < 5) return L('Unsettled', 'やや活発', 'Unruhig', 'Возмущённое', 'Inestable');
    if (v < 6) return L('Minor storm — aurora possible at high latitudes', '小規模嵐 — 高緯度でオーロラの可能性', 'Kleiner Sturm – Polarlicht in hohen Breiten möglich', 'Слабая буря — сияние в высоких широтах', 'Tormenta menor: auroras posibles en latitudes altas');
    if (v < 8) return L('Strong storm — aurora possible further south', '強い嵐 — より低緯度でもオーロラの可能性', 'Starker Sturm – Polarlicht auch südlicher möglich', 'Сильная буря — сияние южнее', 'Tormenta fuerte: auroras más al sur');
    return L('Severe storm', '甚大な嵐', 'Schwerer Sturm', 'Экстремальная буря', 'Tormenta severa');
  }

  return { getJSON: getJSON, firstOf: firstOf, wxWord: wxWord, aqiCat: aqiCat, uvCat: uvCat,
    flagEmoji: flagEmoji, countryRows: countryRows, DEF_CC: DEF_CC, langKey: langKey, pointOf: pointOf, LOC_CFG: LOC_CFG };
})();
