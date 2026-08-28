/* ============================================================================
 *  IntMap · THE CROSS-DATASET QUERY ENGINE — window.IntMapQuery   (#R495)
 * ----------------------------------------------------------------------------
 *  「人口100万人以上で、年間降水量500mm未満、海から200km以上、過去30日でM5以上の地震があった都市は？」
 *
 *  IntMap held every one of those facts and could not put them in one sentence. The answer it gave
 *  was a page about what somebody would have to go and check — 「候補を確定するには…各都市中心部から
 *  震央までの距離を計算し…」 — which is the program describing its own job back to the reader.
 *
 *  ⚠ THE MISSING THING WAS NOT DATA AND NOT A «CITY SEARCH». It was the JOIN. Atlas could rank
 *  countries by one World-Bank metric (`rank`), read every layer at ONE point (`layerData`), sum
 *  population inside ONE shape (`population`) and score countries by several metrics at once
 *  (`scoreMap`) — and there was no action anywhere that could put a CONDITION on one dataset beside
 *  a CONDITION on another and intersect them. Without it every multi-condition question degrades
 *  into an essay, because prose is the only thing left that can hold two datasets at once.
 *
 *  ══ WHAT THIS IS ══════════════════════════════════════════════════════════════════════════════
 *      FROM   one table of real rows          (cities, countries, earthquakes, volcanoes, facilities)
 *      WHERE  numeric / text conditions        on COLUMNS, each of which names its own source
 *      NEAR   within N km of another table     (the spatial join, with its own conditions)
 *      ORDER / LIMIT
 *
 *  It is a REGISTRY, not five hard-wired searches: a table is a row source plus a label, a column is
 *  a way of putting a number beside a row plus the source of that number. 「人口検索機能」「地震検索
 *  機能」を個別に作るのではなく — a new dataset becomes queryable by being registered, and every
 *  condition, join, ordering and honesty rule below applies to it the same day.
 *
 *  ══ THE PLANNER, AND WHY IT IS COST-ORDERED ═══════════════════════════════════════════════════
 *  Columns are not equally expensive. `pop` is in memory; `precipMm` is a raster this session may
 *  already have; `elevM` and `tempC` are network calls that can only be batched a hundred points at
 *  a time. So the conditions are evaluated CHEAPEST FIRST and each one narrows what the next one
 *  has to pay for: 「標高1500m以上、人口50万人以上、年間降水量300mm未満」 costs 934 rows of memory,
 *  then a raster lookup on 934, then a network elevation lookup on the ~60 that are left — not on
 *  147,924. That ordering is the whole reason this can be a real engine instead of a demo.
 *
 *  ══ THREE RULES IT DOES NOT BREAK ═════════════════════════════════════════════════════════════
 *   ① NO SILENT CAP. A network column is capped (`NET_CAP`), a join result is capped, a table has a
 *     row floor — and every one of those is REPORTED in the result and printed under the table.
 *     A truncated answer that looks complete is the failure this round exists to remove.
 *   ② NO COLUMN WITHOUT ITS SOURCE. Every column that appears in a result carries the dataset it
 *     came from, and rows print «—» where the value could not be obtained rather than being dropped
 *     into a silent «did not match».
 *   ③ NO INVENTED VALUE. Nothing here asks a model for a number. Every figure is read from data the
 *     app ships or from an endpoint it already uses and already attributes.
 *
 *  ⚠ IT IS A LAZY MODULE (js/lazy-modules.js, key `atlasQuery`), so neither this file, nor
 *  js/coastline.js, nor the 249 kB coastline is fetched until a query is actually run — inside the
 *  Atlas chunk, which is itself only fetched when Atlas is opened (#R224).
 * ==========================================================================*/

import { makeCoastline } from './coastline.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.atlasQuery = function (HOST) {
  let D = {};
  const L = window.IntMapLang.pick(() => HOST.lang);
  const LA = window.IntMapLang.pickArgs();
  /* the distance-to-the-sea measurement, owned here rather than published as a global: this file is
     its only reader, and both are behind js/lazy-modules.js's `atlasQuery` door */
  const COAST = makeCoastline();

  /* ⚠ THE CAPS ARE NAMED HERE AND REPORTED WHEREVER THEY BITE (rule ①). */
  const SCAN_CAP = 200000;      /* rows a table may put into the planner at all */
  const NET_CAP = 400;          /* rows a per-point NETWORK column may be evaluated for */
  const BATCH = 100;            /* points per Open-Meteo request (its documented maximum) */
  const JOIN_CAP = 20000;       /* rows a join table may return */
  const OUT_CAP = 200;          /* rows a single answer may carry */

  const R_KM = 6371.0088;
  function distKm(aLng, aLat, bLng, bLat) {
    const f = Math.PI / 180;
    const s1 = Math.sin((bLat - aLat) * f / 2), s2 = Math.sin((bLng - aLng) * f / 2);
    const h = s1 * s1 + Math.cos(aLat * f) * Math.cos(bLat * f) * s2 * s2;
    return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const num = (v) => (v == null || v === '' || isNaN(+v)) ? null : +v;
  /* 「5M」「20000」「1e6」 all mean a number of people */
  function human(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).trim().replace(/[, ]/g, '');
    const m = /^(-?[\d.]+)\s*([kmb万億])?$/i.exec(s);
    if (!m) return num(s);
    const n = parseFloat(m[1]); if (!isFinite(n)) return null;
    const u = (m[2] || '').toLowerCase();
    return n * (u === 'k' ? 1e3 : u === 'm' ? 1e6 : u === 'b' ? 1e9 : u === '万' ? 1e4 : u === '億' ? 1e8 : 1);
  }

  /* ══ THE TABLES ══════════════════════════════════════════════════════════════════════════════
     A table answers `rows(scope)` with real records. Each record is normalised to
     {id, name, lng, lat, sub} plus whatever the source carries in `raw`, so a join never has to
     know which table it is joining against. */

  let _iso2to3 = null;
  function iso2to3(a2) {
    if (!a2) return '';
    if (!_iso2to3) {
      _iso2to3 = Object.create(null);
      const cs = D.countryStats ? D.countryStats() : null;
      for (const code in (cs || {})) { const s = cs[code]; if (s && s.a2) _iso2to3[String(s.a2).toUpperCase()] = code; }
    }
    return _iso2to3[String(a2).toUpperCase()] || '';
  }

  async function cityRows() {
    const G = window.IntMapGazetteer;
    if (!G || !G.warm) return { rows: [], note: null };
    const raw = await G.warm();
    const rows = [];
    for (let i = 0; i < raw.length && rows.length < SCAN_CAP; i++) {
      const r = raw[i];
      if (!r || !isFinite(r[2]) || !isFinite(r[3])) continue;
      rows.push({ id: 'c' + i, name: r[4], nameLocal: r[5], lng: +r[2], lat: +r[3], pop: +r[6] || 0, iso2: r[7] || '' });
    }
    /* the phone deliberately holds the head of the same list (js/gazetteer.js MOBILE_CAP) — say so
       rather than letting an answer look like it searched every place on Earth */
    const meta = G.worldMeta ? G.worldMeta() : null;
    const full = meta && meta.count ? meta.count : rows.length;
    return { rows, note: (full > rows.length)
      ? (L('Only part of the place list is loaded in this session — the most populous places first.',
        'このセッションには地名表の一部（人口の多い順）しか読み込まれていません。',
        'In dieser Sitzung ist nur ein Teil der Ortsliste geladen — die bevölkerungsreichsten zuerst.',
        'В этой сессии загружена только часть списка мест — сначала самые населённые.',
        'En esta sesión solo hay parte de la lista de lugares — los más poblados primero.')
        + ' ' + rows.length.toLocaleString() + ' / ' + full.toLocaleString()) : null };
  }

  async function countryRows() {
    if (D.ensureData) await D.ensureData();
    const cs = (D.countryStats ? D.countryStats() : null) || {};
    const rows = [];
    for (const code in cs) {
      const s = cs[code]; if (!s || s.sov === false) continue;
      const b = s.bbox;
      const lng = b ? (b[0] + b[2]) / 2 : null, lat = b ? (b[1] + b[3]) / 2 : null;
      rows.push({ id: code, name: D.countryName ? D.countryName(s) : (s.nameEn || code), lng, lat, iso2: s.a2 || '', iso3: code, stat: s });
    }
    return { rows, note: null };
  }

  /* USGS FDSN — the published catalogue, asked the question it was built to answer. `sinceDays`,
     `minMagnitude` and a bounding box all go INTO the request, so the browser is never filtering a
     feed that was chosen for it. */
  async function quakeRows(scope) {
    const q = scope || {};
    const days = Math.max(0.04, Math.min(3650, +q.sinceDays || 30));
    /* ⚠ THE WINDOW IS `startTime`/`endTime`, NOT `from`/`to`. `from` is the QUERY's own word for
       «which table», and a base-table run hands this function the whole spec — so reading `q.from`
       as a date sent USGS `starttime=earthquakes` and got HTTP 400 back. Measured, first run. */
    const start = q.startTime || q.since || new Date(Date.now() - days * 864e5).toISOString();
    const u = new URL('https://earthquake.usgs.gov/fdsnws/event/1/query');
    u.searchParams.set('format', 'geojson');
    u.searchParams.set('starttime', String(start).slice(0, 23));
    if (q.endTime || q.until) u.searchParams.set('endtime', String(q.endTime || q.until).slice(0, 23));
    if (q.minMagnitude != null) u.searchParams.set('minmagnitude', String(+q.minMagnitude));
    if (q.maxDepthKm != null) u.searchParams.set('maxdepth', String(+q.maxDepthKm));
    if (q.bbox) {
      u.searchParams.set('minlongitude', String(q.bbox[0])); u.searchParams.set('minlatitude', String(q.bbox[1]));
      u.searchParams.set('maxlongitude', String(q.bbox[2])); u.searchParams.set('maxlatitude', String(q.bbox[3]));
    }
    u.searchParams.set('orderby', 'time'); u.searchParams.set('limit', String(JOIN_CAP));
    const j = await (D.fetchJSON ? D.fetchJSON(u.toString()) : fetch(u.toString()).then((r) => r.json()));
    const rows = [];
    for (const f of ((j && j.features) || [])) {
      const c = f.geometry && f.geometry.coordinates; if (!c) continue;
      const p = f.properties || {};
      rows.push({ id: f.id, name: p.place || f.id, lng: +c[0], lat: +c[1],
        mag: num(p.mag), depthKm: num(c[2]), time: p.time ? new Date(p.time).toISOString() : '', url: p.url || '' });
    }
    return { rows, note: null, capped: rows.length >= JOIN_CAP ? JOIN_CAP : null,
      source: 'USGS FDSN event query · ' + String(start).slice(0, 10) + ' →' };
  }

  let _volc = null;
  async function volcanoRows() {
    if (!_volc) {
      const url = (() => { try { return new URL('data/volcanoes_gvp.json', (window.IM_HOST && window.IM_HOST.base) || document.baseURI).toString(); } catch (_) { return 'data/volcanoes_gvp.json'; } })();
      const j = await (D.fetchJSON ? D.fetchJSON(url) : fetch(url).then((r) => r.json()));
      _volc = [];
      /* ⚠⚠ THE KEYS ARE ONE LETTER LONG, AND GUESSING THEM COST A WHOLE TABLE. data/volcanoes_gvp.json
         is written short — `n` name, `c` country, `t` type, `e` elevation (m), `y` the year of the
         last known eruption, `v` the GVP volcano number. This read `p.name` / `p.elev` / `p.type`,
         which exist nowhere in the file, so every row of the `volcanoes` table came back with an
         empty name and a null elevation while the row COUNT looked right (measured on production:
         「coastKm >= 300」 answered 127 volcanoes, all of them nameless).
         ⚠ A missing VALUE is visible; a missing NAME on a row that still counts is not — which is
         why tests/r497-checks asserts the values and not the shape. */
      for (const f of ((j && j.features) || [])) {
        const c = f.geometry && f.geometry.coordinates; if (!c) continue;
        const p = f.properties || {};
        _volc.push({ id: String(p.v != null ? p.v : (p.n || '')), name: p.n || '', lng: +c[0], lat: +c[1],
          iso2: '', country: p.c || '', elevM: num(p.e), kind: p.t || '', lastEruption: p.y != null ? String(p.y) : '' });
      }
    }
    return { rows: _volc, note: null, source: 'Smithsonian Global Volcanism Program (data/volcanoes_gvp.json)' };
  }

  /* OpenStreetMap + Wikidata facilities, through the SAME two functions the `poi` action uses — a
     second implementation would be a second set of selectors to keep in step (#R318's whole point). */
  async function facilityRows(scope) {
    const q = scope || {};
    const kind = String(q.kind || q.what || '').trim();
    if (!kind) return { rows: [], note: null, unavailable: 'facilities-needs-a-kind' };
    if (!D.overpassPOIs) return { rows: [], note: null, unavailable: 'no-facility-source' };
    /* the JOIN's own bounding box, padded by the join radius, is what keeps a global Overpass union
       from being asked for — 「半径100km以内に原発がある」 only needs the plants near the candidates */
    let areaRel = null, iso3 = null;
    let box = q.bbox ? [[q.bbox[0], q.bbox[1]], [q.bbox[2], q.bbox[3]]] : [[-180, -85], [180, 85]];
    if (q.country && D.resolveArea) {
      const a = await D.resolveArea(q.country);
      if (a) { if (a.osmRel) areaRel = a.osmRel; if (a.iso3) iso3 = a.iso3; if (a.box) box = a.box; }
    }
    let list = await D.overpassPOIs(kind, box, false, areaRel);
    if (list === null) list = await D.overpassPOIs(kind, box, true, areaRel);
    if (list === null && areaRel) list = await D.overpassPOIs(kind, box, true, null);
    const wd = D.wikidataPOIs ? await Promise.resolve(D.wikidataPOIs(kind, box, iso3)).catch(() => null) : null;
    const all = (list || []).concat(wd || []);
    const rows = all.map((f, i) => ({ id: 'f' + i, name: f.name || kind, lng: +f.lng, lat: +f.lat, kind: f.kind || kind }));
    return { rows, note: null, capped: (list && list._truncated) ? rows.length : null,
      source: 'OpenStreetMap (ODbL)' + (wd && wd.length ? ' + Wikidata (CC0)' : '') };
  }

  const TABLES = {
    cities: { id: 'cities', label: LA('Cities', '都市', 'Städte', 'Города', 'Ciudades'), rows: cityRows, geo: true,
      source: 'GeoNames cities1000 (CC BY 4.0) — data/gazetteer-world.json.gz' },
    countries: { id: 'countries', label: LA('Countries', '国', 'Länder', 'Страны', 'Países'), rows: countryRows, geo: false,
      source: 'Natural Earth admin-0 + World Bank / UNDP / V-Dem / SIPRI (the Countries tab record)' },
    earthquakes: { id: 'earthquakes', label: LA('Earthquakes', '地震', 'Erdbeben', 'Землетрясения', 'Terremotos'), rows: quakeRows, geo: true, live: true,
      source: 'USGS FDSN event query' },
    volcanoes: { id: 'volcanoes', label: LA('Volcanoes', '火山', 'Vulkane', 'Вулканы', 'Volcanes'), rows: volcanoRows, geo: true,
      source: 'Smithsonian Global Volcanism Program' },
    facilities: { id: 'facilities', label: LA('Facilities', '施設', 'Anlagen', 'Объекты', 'Instalaciones'), rows: facilityRows, geo: true, live: true, needsKind: true,
      source: 'OpenStreetMap (ODbL) + Wikidata (CC0)' },
  };

  /* ══ THE COLUMNS ═════════════════════════════════════════════════════════════════════════════
     `cost` is what orders the plan: 0 = already in the row, 1 = one shared fetch then free,
     2 = a network call per batch of rows. `ensure(rows)` fills `row.v[id]` for every row it can and
     returns what the reader has to be told about the attempt. */

  function col(id, tables, label, unit, cost, ensure, source, kind) {
    return { id, tables, label, unit, cost, ensure, source, kind: kind || 'number' };
  }

  const intrinsic = (id, pick) => (rows) => { for (const r of rows) r.v[id] = pick(r); return {}; };

  async function ensurePrecip(rows) {
    const P = window.IntMapPrecipAnnual;
    if (!P) return { unavailable: 'precip-module-not-loaded' };
    const ok = await P.ready();
    /* `valueAt` needs the VALUE grid, which the layer loads when it is switched on; ask for it
       without switching anything on the reader's map */
    if (P.warmValues) await P.warmValues();
    let got = 0;
    for (const r of rows) { const v = P.valueAt(r.lng, r.lat); r.v.precipMm = (v == null ? null : Math.round(v)); if (v != null) got++; }
    return ok && got ? { source: 'CHELSA V2.1 bio12, 1981–2010 (data/precip-mm.png)' } : { unavailable: 'precip-grid-unavailable' };
  }

  async function ensureCoast(rows, which) {
    const ok = await COAST.ready();
    if (!ok) return { unavailable: 'coastline-unavailable' };
    for (const r of rows) r.v[which] = Math.round(COAST.distanceKm(r.lng, r.lat, { enclosed: which === 'seaKm' }));
    const m = COAST.meta() || {};
    return { source: (m.source || 'Natural Earth 1:10m coastline') + ' · ±' + (m.toleranceKm || 2) + ' km'
      + (which === 'seaKm' && m.enclosedNames && m.enclosedNames.length ? (' · ' + m.enclosedNames.join(', ') + ' included') : '') };
  }

  /* one Open-Meteo request per BATCH points — the endpoint takes comma-separated coordinate lists,
     which is what makes a per-row network column affordable at all */
  async function omBatch(rows, url, read) {
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const part = rows.slice(i, i + BATCH);
      const u = url(part.map((r) => r.lat.toFixed(4)).join(','), part.map((r) => r.lng.toFixed(4)).join(','));
      let j = null;
      try { j = await (D.fetchJSON ? D.fetchJSON(u) : fetch(u).then((r) => r.json())); } catch (_) { j = null; }
      /* ⚠ OPEN-METEO ANSWERS ITS OWN REFUSAL WITH HTTP 200 — {"error":true,"reason":"Daily API request
         limit exceeded"}. MEASURED on the first live run of this file. Reading that as data would fill
         the column with nulls and still print the endpoint as the source, which is rule ② broken from
         the inside: a source line under a column of «—» that nothing actually answered. */
      if (!j || j.error === true) continue;
      const arr = Array.isArray(j) ? j : [j];
      for (let k = 0; k < part.length; k++) { read(part[k], arr.length === 1 && part.length > 1 ? arr[0] : arr[k], k); done++; }
    }
    return done;
  }

  async function ensureElev(rows) {
    const n = await omBatch(rows,
      (la, lo) => 'https://api.open-meteo.com/v1/elevation?latitude=' + la + '&longitude=' + lo,
      (r, j, k) => { const e = j && j.elevation; r.v.elevM = (e && e[k] != null) ? Math.round(+e[k]) : (e && e[0] != null && (!Array.isArray(e) || e.length === 1) ? Math.round(+e[0]) : null); });
    return n ? { source: 'Open-Meteo elevation API (Copernicus DEM GLO-90)' } : { unavailable: 'elevation-endpoint-unreachable' };
  }

  const WX = {
    tempC: ['temperature_2m', LA('Temperature', '気温', 'Temperatur', 'Температура', 'Temperatura'), '°C'],
    windKmh: ['wind_speed_10m', LA('Wind speed', '風速', 'Windgeschwindigkeit', 'Скорость ветра', 'Velocidad del viento'), 'km/h'],
    humidity: ['relative_humidity_2m', LA('Humidity', '湿度', 'Luftfeuchte', 'Влажность', 'Humedad'), '%'],
    rainMm: ['precipitation', LA('Precipitation now', '降水量（現在）', 'Niederschlag jetzt', 'Осадки сейчас', 'Precipitación ahora'), 'mm'],
  };
  async function ensureWx(rows, want) {
    const fields = want.map((w) => WX[w][0]).join(',');
    const n = await omBatch(rows,
      (la, lo) => 'https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo + '&current=' + fields,
      (r, j) => { const c = (j && j.current) || {}; for (const w of want) { const v = c[WX[w][0]]; r.v[w] = (v == null ? null : Math.round(+v * 10) / 10); } });
    return n ? { source: 'Open-Meteo forecast API (ECMWF IFS / DWD ICON / NOAA GFS)' } : { unavailable: 'weather-endpoint-unreachable' };
  }

  /* the country statistics, reached from a row that only knows its ISO 3166-1 alpha-2 */
  async function ensureCountryMetric(rows, key) {
    if (D.ensureData) await D.ensureData();
    const spec = D.metricSpec ? D.metricSpec(key) : null;
    if (!spec) return { unavailable: 'unknown-metric:' + key };
    if (D.fillMetric) { try { await D.fillMetric(spec.key); } catch (_) { } }
    const cs = (D.countryStats ? D.countryStats() : null) || {};
    let got = 0;
    for (const r of rows) {
      const code = r.iso3 || iso2to3(r.iso2);
      const s = code ? cs[code] : null;
      const v = s ? spec.m.get(s) : null;
      r.v['country.' + spec.key] = (v == null || isNaN(v)) ? null : +v;
      if (v != null) got++;
    }
    return got ? { source: D.metricSource ? D.metricSource(spec.key) : 'the Countries statistics record' }
      : { unavailable: 'metric-empty:' + spec.key };
  }

  /* any real World Bank indicator, by its code — the same door `scoreMap` opens */
  async function ensureWB(rows, code) {
    if (!(window.IntMapWB && window.IntMapWB.fetch)) return { unavailable: 'worldbank-unavailable' };
    let m = null; try { m = await window.IntMapWB.fetch(code); } catch (_) { m = null; }
    if (!m) return { unavailable: 'worldbank-indicator-not-found:' + code };
    let got = 0;
    for (const r of rows) {
      const c3 = r.iso3 || iso2to3(r.iso2);
      const e = c3 ? m[c3] : null; const v = e && e.v;
      r.v['wb:' + code] = (v == null || !isFinite(v)) ? null : +v;
      if (v != null) got++;
    }
    return got ? { source: 'World Bank indicator ' + code } : { unavailable: 'worldbank-indicator-empty:' + code };
  }

  const COLUMNS = [
    col('pop', ['cities'], LA('Population', '人口', 'Bevölkerung', 'Население', 'Población'), '', 0, intrinsic('pop', (r) => r.pop), 'GeoNames cities1000'),
    col('name', ['cities', 'countries', 'earthquakes', 'volcanoes', 'facilities'], LA('Name', '名称', 'Name', 'Название', 'Nombre'), '', 0, intrinsic('name', (r) => r.name), '', 'text'),
    col('country', ['cities'], LA('Country', '国', 'Land', 'Страна', 'País'), '', 0, intrinsic('country', (r) => r.iso2), '', 'text'),
    col('lat', ['cities', 'countries', 'earthquakes', 'volcanoes', 'facilities'], LA('Latitude', '緯度', 'Breite', 'Широта', 'Latitud'), '°', 0, intrinsic('lat', (r) => r.lat), ''),
    col('lng', ['cities', 'countries', 'earthquakes', 'volcanoes', 'facilities'], LA('Longitude', '経度', 'Länge', 'Долгота', 'Longitud'), '°', 0, intrinsic('lng', (r) => r.lng), ''),
    col('mag', ['earthquakes'], LA('Earthquake magnitude', 'マグニチュード', 'Erdbebenmagnitude', 'Магнитуда землетрясения', 'Magnitud del terremoto'), '', 0, intrinsic('mag', (r) => r.mag), 'USGS'),
    col('depthKm', ['earthquakes'], LA('Depth', '深さ', 'Tiefe', 'Глубина', 'Profundidad'), 'km', 0, intrinsic('depthKm', (r) => r.depthKm), 'USGS'),
    col('precipMm', ['cities', 'volcanoes', 'facilities'], LA('Annual precipitation', '年降水量', 'Jahresniederschlag', 'Годовые осадки', 'Precipitación anual'), 'mm', 1, (rows) => ensurePrecip(rows), 'CHELSA V2.1'),
    col('coastKm', ['cities', 'volcanoes', 'facilities'], LA('Distance to the ocean', '海（外洋）からの距離', 'Entfernung zum Ozean', 'Расстояние до океана', 'Distancia al océano'), 'km', 1, (rows) => ensureCoast(rows, 'coastKm'), 'Natural Earth 1:10m coastline'),
    col('seaKm', ['cities', 'volcanoes', 'facilities'], LA('Distance to any sea', '海（内海含む）からの距離', 'Entfernung zu einem Meer', 'Расстояние до моря', 'Distancia a cualquier mar'), 'km', 1, (rows) => ensureCoast(rows, 'seaKm'), 'Natural Earth 1:10m coastline'),
    col('elevM', ['cities', 'facilities'], LA('Elevation', '標高', 'Höhe', 'Высота', 'Altitud'), 'm', 2, (rows) => ensureElev(rows), 'Open-Meteo elevation API'),
    col('elevM', ['volcanoes'], LA('Elevation', '標高', 'Höhe', 'Высота', 'Altitud'), 'm', 0, intrinsic('elevM', (r) => r.elevM), 'Smithsonian GVP'),
    /* (#R497) the two facts the GVP row carries that nothing could ask for: which country it is in
       (a NAME here, not an ISO code — the file has no code) and the year of its last known eruption. */
    col('country', ['volcanoes'], LA('Country', '国', 'Land', 'Страна', 'País'), '', 0, intrinsic('country', (r) => r.country), 'Smithsonian GVP', 'text'),
    col('lastEruptionYear', ['volcanoes'], LA('Last known eruption', '最後の噴火', 'Letzter bekannter Ausbruch', 'Последнее известное извержение', 'Última erupción conocida'), '', 0, intrinsic('lastEruptionYear', (r) => (r.lastEruption === '' ? null : +r.lastEruption)), 'Smithsonian GVP'),
  ];
  for (const w in WX) COLUMNS.push(col(w, ['cities', 'facilities', 'volcanoes'], WX[w][1], WX[w][2], 2, (rows) => ensureWx(rows, [w]), 'Open-Meteo forecast API'));

  /* `country.<metric>` and `wb:<CODE>` are open families rather than rows in the table above — the
     first is every metric the Countries record carries, the second is every World Bank indicator
     that exists. Resolved on demand so a new metric needs no edit here. */
  function columnFor(table, id) {
    const key = String(id || '').trim();
    const fixed = COLUMNS.find((c) => c.id === key && c.tables.indexOf(table) >= 0);
    if (fixed) return fixed;
    if (/^wb:/i.test(key)) {
      const code = key.slice(3).trim().toUpperCase();
      return col(key, [table], LA(code, code, code, code, code), '', 2, (rows) => ensureWB(rows, code), 'World Bank ' + code);
    }
    const m = /^(?:country\.)?(.+)$/.exec(key);
    const spec = (m && D.metricSpec) ? D.metricSpec(m[1]) : null;
    if (spec && (table === 'cities' || table === 'countries')) {
      const cid = 'country.' + spec.key;
      return { id: cid, tables: [table], label: spec.m.label, unit: '', cost: 1, kind: 'number',
        ensure: (rows) => ensureCountryMetric(rows, spec.key), source: 'the Countries statistics record',
        fmt: (v) => (D.fmtVal ? D.fmtVal(spec.key, v) : v) };
    }
    return null;
  }

  /* ══ PREDICATES ══════════════════════════════════════════════════════════════════════════════ */
  const OPS = {
    '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b,
    '==': (a, b) => String(a) === String(b), '!=': (a, b) => String(a) !== String(b),
    contains: (a, b) => String(a || '').toLowerCase().indexOf(String(b || '').toLowerCase()) >= 0,
  };
  function normOp(o) {
    const s = String(o || '>=').trim().toLowerCase();
    return ({ gte: '>=', ge: '>=', 'min': '>=', 'atleast': '>=', gt: '>', over: '>', above: '>',
      lte: '<=', le: '<=', max: '<=', 'atmost': '<=', lt: '<', under: '<', below: '<',
      eq: '==', is: '==', ne: '!=', neq: '!=', 'in': 'in', between: 'between', contains: 'contains' })[s] || (OPS[s] ? s : (s === 'in' || s === 'between' ? s : '>='));
  }
  function passes(cond, v, colKind) {
    if (v == null) return false;
    const op = cond._op;
    if (op === 'between') { const lo = human(cond.min != null ? cond.min : cond.from), hi = human(cond.max != null ? cond.max : cond.to); return v >= lo && v <= hi; }
    if (op === 'in') { const set = (cond.values || cond.value || []).map((x) => String(x).toLowerCase()); return set.indexOf(String(v).toLowerCase()) >= 0; }
    const want = colKind === 'text' ? cond.value : human(cond.value);
    if (want == null) return false;
    return OPS[op](colKind === 'text' ? String(v) : +v, want);
  }

  /* ══ THE RUN ═════════════════════════════════════════════════════════════════════════════════ */
  function bboxOf(rows, padKm) {
    let w = 180, s = 90, e = -180, n = -90;
    for (const r of rows) { if (r.lng == null) continue; if (r.lng < w) w = r.lng; if (r.lng > e) e = r.lng; if (r.lat < s) s = r.lat; if (r.lat > n) n = r.lat; }
    if (w > e) return null;
    const dLat = padKm / 110.574;
    const dLng = padKm / (111.32 * Math.max(0.15, Math.cos((s + n) / 2 * Math.PI / 180)));
    return [Math.max(-180, w - dLng), Math.max(-90, s - dLat), Math.min(180, e + dLng), Math.min(90, n + dLat)];
  }

  async function run(spec) {
    const notes = [], sources = [], caps = [], unapplied = [];
    const from = String((spec && (spec.from || spec.table)) || 'cities').trim().toLowerCase();
    const T = TABLES[from];
    if (!T) return { ok: false, error: 'unknown-table', table: from, tables: Object.keys(TABLES) };

    /* ① the base rows */
    const base = await T.rows(spec && spec.scope ? spec.scope : spec);
    if (base.unavailable) return { ok: false, error: base.unavailable, table: from };
    let rows = base.rows.map((r) => Object.assign({ v: Object.create(null), joins: {} }, r));
    const scanned = rows.length;
    if (base.note) notes.push(base.note);
    sources.push({ what: T.label, src: base.source || T.source });
    if (base.capped) caps.push({ what: T.label, cap: base.capped });

    /* ② a country / region scope, applied before anything is measured */
    const inSpec = spec && (spec.in || spec.countries || spec.scopeCountry);
    if (inSpec) {
      const want = Array.isArray(inSpec) ? inSpec
        : (inSpec && typeof inSpec === 'object') ? [].concat(inSpec.countries || inSpec.country || [])
          : [inSpec];
      const codes = new Set(want.map((x) => String(x).trim().toUpperCase()).filter(Boolean));
      if (codes.size) {
        rows = rows.filter((r) => codes.has(String(r.iso2 || '').toUpperCase()) || codes.has(String(r.iso3 || '').toUpperCase()));
        notes.push(L('Restricted to', '対象を限定', 'Beschränkt auf', 'Ограничено', 'Limitado a')
          + ': ' + Array.from(codes).join(', '));
      }
    }

    /* ③ THE PLAN — conditions cheapest first, so an expensive column is only ever asked about the
       rows that survived everything cheaper (the reason this scales past a demo) */
    const conds = [].concat((spec && (spec.where || spec.conditions)) || []).filter(Boolean).map((c) => {
      const cd = Object.assign({}, c);
      cd._col = columnFor(from, cd.col || cd.column || cd.metric || cd.field);
      cd._op = normOp(cd.op || cd.operator);
      return cd;
    });
    const unknown = conds.filter((c) => !c._col).map((c) => String(c.col || c.column || c.metric || c.field || '?'));
    const plan = conds.filter((c) => c._col).sort((a, b) => a._col.cost - b._col.cost);

    for (const c of plan) {
      if (!rows.length) break;
      let target = rows;
      if (c._col.cost >= 2 && rows.length > NET_CAP) {
        target = rows.slice(0, NET_CAP);
        caps.push({ what: c._col.label, cap: NET_CAP, of: rows.length });
      }
      const info = await c._col.ensure(target) || {};
      if (info.unavailable) {
        unapplied.push(colName(c._col));
        notes.push(colName(c._col) + ' — ' + L('unavailable in this session, so its condition was NOT applied',
          'このセッションでは取得できず、この条件は適用していません',
          'in dieser Sitzung nicht verfügbar; die Bedingung wurde NICHT angewendet',
          'недоступно в этой сессии, условие НЕ применено',
          'no disponible en esta sesión; la condición NO se aplicó') + ' (' + info.unavailable + ')');
        continue;
      }
      if (info.source) sources.push({ what: c._col.label, src: info.source });
      const kept = target.filter((r) => passes(c, r.v[c._col.id], c._col.kind));
      rows = kept;
    }
    for (const u of unknown) {
      unapplied.push(u);
      notes.push(tableName(T) + ' · ' + u + ' — ' + L('no such column, so that condition was ignored',
        'という列は無いため、この条件は無視しました',
        'keine solche Spalte — Bedingung ignoriert',
        'нет такого столбца — условие проигнорировано',
        'no existe esa columna — condición ignorada'));
    }

    /* ④ THE SPATIAL JOIN — 「地震から都市まで一定距離以内」 */
    const joins = [].concat((spec && (spec.near || spec.join)) || []).filter(Boolean);
    for (const jn of joins) {
      if (!rows.length) break;
      /* ⚠ A COUNTRY IS NOT A POINT. `countries` rows carry the centre of a bounding box, and
         「この国から100km以内」 measured against that centre is a number about nothing — Russia's
         box centre is in Siberia. A table that is not point-like refuses the join and says why,
         rather than answering with a distance nobody asked for. */
      if (!T.geo) {
        unapplied.push(tableName(T));
        notes.push(tableName(T) + ' — ' + L('rows are not single points, so a distance join cannot be measured against them',
          'の行は1点ではないため、距離による結合は測れません',
          'Zeilen sind keine einzelnen Punkte — eine Entfernungsverknüpfung ist nicht messbar',
          'строки не являются точками — соединение по расстоянию неизмеримо',
          'las filas no son puntos únicos — no se puede medir una unión por distancia'));
        break;
      }
      const jt = TABLES[String(jn.of || jn.table || '').trim().toLowerCase()];
      if (!jt) { unapplied.push(String(jn.of || jn.table || '?')); notes.push(L('Unknown join table', '結合先が不明です',
        'Unbekannte Verknüpfungstabelle', 'Неизвестная таблица соединения', 'Tabla de unión desconocida') + ': ' + String(jn.of || jn.table || '')); continue; }
      const km = Math.max(0.1, +(jn.withinKm != null ? jn.withinKm : (jn.km != null ? jn.km : 100)));
      const scope = Object.assign({}, jn, { bbox: T.geo ? bboxOf(rows, km) : null });
      let jr;
      try { jr = await jt.rows(scope); } catch (e) { jr = { rows: [], unavailable: (e && e.message) || 'join-failed' }; }
      if (jr.unavailable || !jr.rows) {
        unapplied.push(tableName(jt));
        notes.push(tableName(jt) + ' — ' + L('the join could not run, so it was NOT applied',
          'との結合を実行できず、この条件は適用していません',
          'die Verknüpfung lief nicht — NICHT angewendet',
          'соединение не выполнено — НЕ применено',
          'la unión no se ejecutó — NO aplicada') + ' (' + (jr.unavailable || '0') + ')');
        continue;
      }
      sources.push({ what: jt.label, src: jr.source || jt.source });
      if (jr.capped) caps.push({ what: jt.label, cap: jr.capped });
      /* the join table's own conditions, evaluated on its rows before the distance test */
      const jconds = [].concat(jn.where || []).filter(Boolean).map((c) => {
        const cd = Object.assign({}, c); cd._col = columnFor(jt.id, cd.col || cd.column || cd.field); cd._op = normOp(cd.op); return cd;
      }).filter((c) => c._col);
      let jrows = jr.rows.map((r) => Object.assign({ v: Object.create(null) }, r));
      for (const c of jconds) { await c._col.ensure(jrows); jrows = jrows.filter((r) => passes(c, r.v[c._col.id], c._col.kind)); }
      const label = String(jn.as || jt.id);
      const want = jn.require === false ? false : true;
      const out = [];
      for (const r of rows) {
        if (r.lng == null) continue;
        let best = null, bestD = Infinity, n = 0;
        for (const j of jrows) {
          const d = distKm(r.lng, r.lat, j.lng, j.lat);
          if (d <= km) { n++; if (d < bestD) { bestD = d; best = j; } }
        }
        r.joins[label] = { count: n, nearest: best, km: best ? Math.round(bestD * 10) / 10 : null };
        if (want ? n > 0 : n === 0) out.push(r);
      }
      rows = out;
      notes.push(tableName(jt) + ' ' + jrows.length.toLocaleString() + ' · '
        + L('rows tested against every candidate, at a radius of', '件を各候補について判定した半径',
          'Zeilen gegen jeden Kandidaten geprüft, Radius', 'строк проверено для каждого кандидата, радиус',
          'filas comprobadas contra cada candidato, radio') + ' ' + km + ' km');
    }

    /* ⑤ order, limit, and the columns the answer shows */
    const showIds = [].concat((spec && (spec.show || spec.columns)) || []).map(String);
    const shown = [];
    for (const id of showIds) { const c = columnFor(from, id); if (c && !shown.find((x) => x.id === c.id)) shown.push(c); }
    for (const c of plan) if (!shown.find((x) => x.id === c._col.id)) shown.push(c._col);
    if (!shown.length) { const p = columnFor(from, from === 'earthquakes' ? 'mag' : 'pop'); if (p) shown.push(p); }
    /* a shown column that no condition paid for still has to be measured */
    for (const c of shown) {
      if (rows.some((r) => r.v[c.id] === undefined)) {
        const target = (c.cost >= 2 && rows.length > NET_CAP) ? rows.slice(0, NET_CAP) : rows;
        if (c.cost >= 2 && rows.length > NET_CAP) caps.push({ what: c.label, cap: NET_CAP, of: rows.length });
        const info = await c.ensure(target) || {};
        if (info.source && !sources.find((s) => s.src === info.source)) sources.push({ what: c.label, src: info.source });
      }
    }
    const ord = spec && (spec.order || spec.sort);
    if (ord) {
      const oc = columnFor(from, ord.col || ord.column || ord.by || ord);
      const dir = /asc|up|bottom|low/i.test(String((ord && ord.dir) || (ord && ord.order) || 'desc')) ? 1 : -1;
      if (oc) {
        if (rows.some((r) => r.v[oc.id] === undefined)) await oc.ensure(rows.slice(0, oc.cost >= 2 ? NET_CAP : rows.length));
        rows.sort((a, b) => { const x = a.v[oc.id], y = b.v[oc.id]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
        if (!shown.find((x) => x.id === oc.id)) shown.push(oc);
      }
    } else if (from === 'cities') {
      rows.sort((a, b) => (b.pop || 0) - (a.pop || 0));
    }
    const matched = rows.length;
    const lim = Math.max(1, Math.min(OUT_CAP, +(spec && spec.limit) || 50));
    if (rows.length > lim) { caps.push({ what: LA('Rows shown', '表示行数', 'Angezeigte Zeilen', 'Показано строк', 'Filas mostradas'), cap: lim, of: matched }); rows = rows.slice(0, lim); }

    return { ok: true, table: from, tableLabel: T.label, scanned, matched, rows, columns: shown, unapplied,
      joins: joins.map((j) => String(j.as || j.of || '')), notes, sources, caps, spec };
  }

  function colName(c) { try { return L.arr(c.label); } catch (_) { return c.id; } }
  function tableName(t) { try { return L.arr(t.label); } catch (_) { return t.id; } }

  /* what the planner is allowed to name — read by js/atlas-catalog-text.js's query block and by the
     capability audit, so the prompt and the code cannot drift apart */
  function catalogue() {
    const cols = {};
    for (const t in TABLES) cols[t] = COLUMNS.filter((c) => c.tables.indexOf(t) >= 0).map((c) => c.id);
    return { tables: Object.keys(TABLES), columns: cols, ops: Object.keys(OPS).concat(['in', 'between']),
      caps: { scan: SCAN_CAP, net: NET_CAP, join: JOIN_CAP, out: OUT_CAP } };
  }

  /* ══ THE ANSWER ══════════════════════════════════════════════════════════════════════════════
     A table the reader can check, a method block that names every source, and the matching rows on
     the map. ⚠ The METHOD BLOCK IS NOT DECORATION: rule ② is that no column appears without the
     dataset it came from, and rule ① that every cap that bit is printed. A result that hides either
     is the 「一部の推論が事実として記載されている」 failure with a table drawn around it. */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function fmt(c, v) {
    if (v == null) return '—';
    if (c.kind === 'text') return esc(v);
    if (c.fmt) { try { return esc(c.fmt(v)); } catch (_) { } }
    const n = +v;
    const s = Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toLocaleString();
    return esc(s + (c.unit ? (' ' + c.unit) : ''));
  }

  function tableHtml(res) {
    const cols = res.columns.filter((c) => c.id !== 'name');
    const head = '<th style="text-align:left;padding:4px 8px 4px 0;font-weight:600;">#</th>'
      + '<th style="text-align:left;padding:4px 8px 4px 0;font-weight:600;">' + esc(L('Name', '名称', 'Name', 'Название', 'Nombre')) + '</th>'
      + cols.map((c) => '<th style="text-align:right;padding:4px 0 4px 8px;font-weight:600;white-space:nowrap;">' + esc(colName(c)) + '</th>').join('')
      + res.joins.map((j) => '<th style="text-align:right;padding:4px 0 4px 8px;font-weight:600;white-space:nowrap;">' + esc(j) + '</th>').join('');
    const body = res.rows.map((r, i) => '<tr style="border-top:1px solid rgba(128,128,128,0.14);">'
      + '<td style="padding:4px 8px 4px 0;color:var(--text-muted);">' + (i + 1) + '</td>'
      + '<td style="padding:4px 8px 4px 0;">' + esc(r.name || '') + (r.iso2 ? ' <span style="color:var(--text-muted);font-size:10.5px;">' + esc(r.iso2) + '</span>' : '') + '</td>'
      + cols.map((c) => '<td style="padding:4px 0 4px 8px;text-align:right;white-space:nowrap;">' + fmt(c, r.v[c.id]) + '</td>').join('')
      + res.joins.map((j) => { const jj = r.joins[j];
        return '<td style="padding:4px 0 4px 8px;text-align:right;white-space:nowrap;">'
          + (jj && jj.count ? (jj.count + ' · ' + jj.km + ' km') : '—') + '</td>'; }).join('')
      + '</tr>').join('');
    return '<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:12px;width:100%;">'
      + '<thead><tr style="color:var(--text-muted);font-size:10.5px;text-transform:uppercase;letter-spacing:0.03em;">' + head + '</tr></thead>'
      + '<tbody>' + body + '</tbody></table></div>';
  }

  function methodHtml(res) {
    const line = (s) => '<div style="font-size:10.5px;color:var(--text-muted);line-height:1.55;">' + s + '</div>';
    let h = line('<b>' + esc(L('How this was decided', '判定方法', 'Wie das entschieden wurde', 'Как это определено', 'Cómo se decidió')) + '</b> · '
      + esc(tableName(TABLES[res.table]) + ' ' + res.scanned.toLocaleString() + ' · '
        + L('evaluated', '件を評価', 'ausgewertet', 'проверено', 'evaluadas') + ' → ' + res.matched.toLocaleString() + ' · '
        + L('match', '件が該当', 'Treffer', 'совпадений', 'coinciden')));
    const seen = new Set();
    for (const s of res.sources) {
      const what = (typeof s.what === 'string') ? s.what : L.arr(s.what);
      const k = what + '|' + s.src; if (!s.src || seen.has(k)) continue; seen.add(k);
      h += line(esc(what + ' — ' + s.src));
    }
    for (const c of res.caps) {
      h += line('⚠ ' + esc(L.arr(c.what) + ' — ' + L('limited to', '制限', 'begrenzt auf', 'ограничено до', 'limitado a')
        + ' ' + c.cap.toLocaleString() + (c.of ? (' / ' + c.of.toLocaleString()) : '')));
    }
    for (const n of res.notes) h += line(esc(n));
    return '<div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(128,128,128,0.16);">' + h + '</div>';
  }

  /* the dispatch face: run the spec, draw the rows, answer with the table and the method */
  async function answer(a, ui) {
    const U = ui || {};
    const res = await run(a);
    if (!res.ok) {
      return { ok: false, html: '<div style="font-size:11.5px;color:#ff9f0a;margin:3px 0;font-weight:600;">⚠ '
        + esc(L('This query names something IntMap does not have. The tables it does have are',
          'この問い合わせは IntMap に無いものを指しています。使える表は次のとおりです',
          'Diese Abfrage nennt etwas, das IntMap nicht hat. Vorhandene Tabellen',
          'Запрос называет то, чего в IntMap нет. Доступные таблицы',
          'La consulta nombra algo que IntMap no tiene. Las tablas disponibles son')
          + ': ' + (res.tables || Object.keys(TABLES)).join(', ') + ' (' + (res.error || '') + ')') + '</div>' };
    }
    /* the rows go ON THE MAP — a query about places whose answer is only text is half an answer */
    const ids = [];
    const PIN_CAP = 40;   /* every pin costs js/app-body.js an elevation lookup — bounded, and said so */
    if (TABLES[res.table].geo && U.pin !== false) {
      if (res.rows.length > PIN_CAP) res.caps.push({ what: LA('Pins drawn', '地図に打つピン', 'Gesetzte Pins', 'Поставлено меток', 'Pines dibujados'), cap: PIN_CAP, of: res.rows.length });
      for (const r of res.rows.slice(0, PIN_CAP)) {
        if (r.lng == null) continue;
        const bits = res.columns.filter((c) => c.id !== 'name').map((c) => colName(c) + ': ' + String(fmt(c, r.v[c.id])).replace(/&[a-z]+;/g, ' '));
        try { const id = HOST.addPin(r.lng, r.lat, { title: r.name, description: bits.join(' · '), source: 'IntMap · ' + tableName(TABLES[res.table]) }); if (id != null) ids.push(String(id)); } catch (_) { }
      }
      try {
        const bb = bboxOf(res.rows, 0);
        if (bb && window.IntMapGeoEngine && window.IntMapGeoEngine.hasRenderer()) {
          window.IntMapGeoEngine.camera.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 60, maxZoom: 6, duration: 900 });
        }
      } catch (_) { }
    }
    const title = '<div style="font-size:12.5px;font-weight:650;margin:2px 0 5px;">'
      + esc(res.matched.toLocaleString() + ' ' + tableName(TABLES[res.table]))
      + (res.matched > res.rows.length ? ('<span style="font-weight:400;color:var(--text-muted);"> · '
        + esc(L('showing', '表示', 'gezeigt', 'показано', 'mostrando') + ' ' + res.rows.length) + '</span>') : '')
      + '</div>';
    /* ⚠⚠ THE HEADLINE HAS TO CARRY THE HOLE. A table of 69 rows under a question that asked for
       three conditions, when one of them could not be evaluated, reads as 69 answers — and the
       reader has no way to know unless it is said BEFORE the numbers, not under them. */
    const gap = res.unapplied.length ? ('<div style="font-size:11.5px;color:#ff9f0a;margin:3px 0;font-weight:600;">⚠ '
      + esc(L('These conditions could NOT be evaluated in this session and are NOT reflected in the rows below',
        'このセッションでは次の条件を評価できず、下の行には反映されていません',
        'Diese Bedingungen konnten NICHT ausgewertet werden und sind unten NICHT berücksichtigt',
        'Эти условия НЕ удалось проверить, и в строках ниже они НЕ учтены',
        'Estas condiciones NO pudieron evaluarse y NO están reflejadas abajo')
        + ': ' + res.unapplied.join(', ')) + '</div>') : '';
    const none = res.matched ? '' : '<div style="font-size:11.5px;color:var(--text-muted);margin:3px 0;">'
      + esc(L('No row satisfies every condition. Every condition was actually evaluated — see the method below.',
        'すべての条件を満たす行はありませんでした。各条件は実際に評価しています（下の判定方法）。',
        'Keine Zeile erfüllt alle Bedingungen — jede wurde tatsächlich ausgewertet.',
        'Ни одна строка не удовлетворяет всем условиям — каждое было действительно проверено.',
        'Ninguna fila cumple todas las condiciones — cada una fue evaluada.')) + '</div>';
    return { ok: true, html: gap + title + (res.matched ? tableHtml(res) : none) + methodHtml(res), objectIds: ids, result: res };
  }

  const API = { run, answer, catalogue, colName, tableName, distKm, human,
    bind: (deps) => { D = deps || {}; _iso2to3 = null; return API; },
    tables: () => Object.keys(TABLES), columnFor };
  window.IntMapQuery = API;
  return API;
};
