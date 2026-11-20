/* ============================================================================
 *  IntMap · EXTERNAL FORECAST DATA, BROUGHT BACK INTO THE GIS — window.IntMapGisForecast
 * ----------------------------------------------------------------------------
 *  research.scenario ran IntMap's own educational simulators. A reader asking 「この流域の河川流量は
 *  これからどうなるか」 needs a model that is not IntMap's: a river-discharge forecast, a weather
 *  forecast. Those exist, they are public, and their numbers belong in the same registry as every
 *  other dataset so that the buffer / zonal / join kernels can consume them.
 *
 *  ⚠⚠⚠ FOUR THINGS THAT LOOK ALIKE ON A MAP AND ARE NOT THE SAME THING — kept in four places
 *      observations     what an instrument measured. THIS FILE FETCHES NONE: neither source below
 *                       publishes measurements (Open-Meteo serves model output and reanalysis, and
 *                       says so). Observations arrive only as REFERENCES to datasets the reader or
 *                       Atlas already holds; they are recorded as references, never copied and never
 *                       relabelled. With none supplied the record says `none-supplied` — an empty
 *                       column is not a measurement of zero.
 *      modelEstimates   what a model computed for a place and a day, with the model's name, the time
 *                       the provider says it was issued, and the URL that was asked.
 *      userConditions   what the READER stated (a threshold, a horizon). Stored verbatim. The only
 *                       thing done with a threshold is a comparison — `exceeds` true/false, or null
 *                       when no threshold was stated. A condition is not fed back into the model: a
 *                       "rain +20 %" multiplier would be this file inventing hydrology.
 *      uncertainty      the spread the PROVIDER states (an ensemble's min/max and quartiles). Where a
 *                       source states none, `basis` says `not-stated` — never a spread computed here
 *                       from one number, which would be a claim nobody made.
 *  ⚠ A MODEL ESTIMATE IS NOT AN OBSERVATION EVEN WHEN IT IS DRAWN ON THE MAP. Every feature carries
 *  `dataClass` ('model-estimate' | 'uncertainty'), and js/gis-forecast.js draw() colours by it, so
 *  the picture says what the table says.
 *
 *  ══ WHAT IS REAL, AND WHAT IS DELIBERATELY NOT HERE ════════════════════════════════════════════
 *  SOURCES below is DATA: two real public HTTP APIs, both measured 2026-11-20 (a request answered
 *  200 with the documented JSON and `Access-Control-Allow-Origin: *`):
 *      open-meteo-flood     https://flood-api.open-meteo.com/v1/flood   GloFAS river discharge
 *      open-meteo-forecast  https://api.open-meteo.com/v1/forecast      numerical weather prediction
 *  Terms read at https://open-meteo.com/en/terms on 2026-11-20: the data are CC BY 4.0 (attribution
 *  required); the FREE API is for NON-COMMERCIAL use (< 10,000 calls/day, 5,000/hour, 600/minute),
 *  commercial use needs a paid plan. Both facts are carried in the record (`terms`) so a reader sees
 *  them. ⚠ NO MODEL IS NAMED THAT THIS FILE DOES NOT ACTUALLY CALL. A population-distribution
 *  forecast has no source here: IntMap's population layer (WorldPop) is a gridded ESTIMATE of the
 *  present and past, and no public forecast API was checked for it — so it is not offered.
 *  ⚠ A SOURCE THAT DID NOT ANSWER IS 「訊けなかった」, NOT 「予測は 0」: failed requests are listed in
 *  `failed`, their points are absent from the datasets, and `complete` is false.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY and window.* is read at CALL time (the same rule as
 *  js/gis-remote.js), so it imports in Node; the fetcher and the registry are injectable (`deps`).
 * ==========================================================================*/

export function makeGisForecast(deps) {
  return (function () {
    const D = deps || {};
    const WIN = () => { try { return (typeof window !== 'undefined' && window) || null; } catch (_) { return null; } };
    const now = () => (typeof D.now === 'function' ? D.now() : Date.now());
    const registry = () => D.data || (WIN() && WIN().IntMapData) || null;

    /* ── the sources: DATA, not branches ───────────────────────────────────────────────────── */
    const TERMS = {
      url: 'https://open-meteo.com/en/terms',
      read: '2026-11-20',
      dataLicence: 'CC BY 4.0',
      freeApi: 'non-commercial use only; fewer than 10,000 calls per day, 5,000 per hour, 600 per minute',
      commercial: 'requires a paid Open-Meteo plan',
    };
    const SOURCES = {
      'open-meteo-flood': {
        id: 'open-meteo-flood',
        title: { en: 'River discharge forecast (GloFAS via Open-Meteo)', jp: '河川流量の予測（Open-Meteo 経由の GloFAS）' },
        url: 'https://flood-api.open-meteo.com/v1/flood',
        model: 'GloFAS v4 (Copernicus Emergency Management Service / ECMWF), ensemble',
        attribution: 'Open-Meteo.com; GloFAS, Copernicus Emergency Management Service',
        terms: TERMS,
        /* the variable the map shows, and the provider-stated ensemble statistics that bound it */
        central: 'river_discharge', unit: 'm³/s',
        spread: { low: 'river_discharge_min', high: 'river_discharge_max', q1: 'river_discharge_p25', q3: 'river_discharge_p75' },
        spreadBasis: 'ensemble-members',
        spreadNote: { en: 'min–max and 25th–75th percentile across the provider\'s ensemble members', jp: '提供元のアンサンブルメンバー間の最小〜最大と 25〜75 パーセンタイル' },
        dailyVars: ['river_discharge', 'river_discharge_min', 'river_discharge_max', 'river_discharge_p25', 'river_discharge_p75'],
        maxDays: 16,
      },
      'open-meteo-forecast': {
        id: 'open-meteo-forecast',
        title: { en: 'Weather forecast (numerical weather prediction via Open-Meteo)', jp: '気象予報（Open-Meteo 経由の数値予報）' },
        url: 'https://api.open-meteo.com/v1/forecast',
        model: 'Open-Meteo best-match deterministic model (a `models` list may pin one)',
        attribution: 'Open-Meteo.com (weather model data from national weather services)',
        terms: TERMS,
        central: 'precipitation_sum', unit: 'mm',
        spread: null,
        spreadBasis: 'not-stated',
        spreadNote: { en: 'a single deterministic run: the provider states no spread here, so none is shown', jp: '決定論的な 1 回の計算で、ここでは提供元が幅を述べていないため示さない' },
        dailyVars: ['precipitation_sum'],
        /* the variable is the caller's to choose among these; each carries its own unit */
        variables: { precipitation_sum: 'mm', temperature_2m_max: '°C', temperature_2m_min: '°C', wind_speed_10m_max: 'km/h', wind_gusts_10m_max: 'km/h' },
        maxDays: 16,
      },
    };

    const MAX_POINTS = 100;      /* one request carries at most this many coordinates (observed: lists of 50 answered; 100 is the ceiling chosen to stay well inside the free per-minute limit) */
    const CHUNK = 50;
    const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
    const fail = (why, detail) => ({ ok: false, why, detail: detail || null });

    function sources() { return Object.keys(SOURCES).map((k) => ({ id: k, title: SOURCES[k].title, url: SOURCES[k].url, model: SOURCES[k].model, terms: SOURCES[k].terms, variables: SOURCES[k].variables ? Object.keys(SOURCES[k].variables) : [SOURCES[k].central] })); }

    /* a regular lattice of cell CENTRES over [w,s,e,n] — the provider snaps each to its own grid, and
       the coordinates it ANSWERS WITH are the ones recorded */
    function lattice(bounds, nx, ny) {
      const [w, s, e, n] = bounds;
      const pts = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([w + (e - w) * (i + 0.5) / nx, s + (n - s) * (j + 0.5) / ny]);
      return pts;
    }
    const validBounds = (b) => Array.isArray(b) && b.length === 4 && b.every((x) => typeof x === 'number' && isFinite(x)) && b[0] < b[2] && b[1] < b[3] && b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90;

    async function defaultFetch(url, signal) {
      const W = WIN();
      try { if (W && W.IntMapWx && W.IntMapWx.isOpenMeteo(url)) return await W.IntMapWx.guardedJSON(url, 600000, { signal }); } catch (e) { if (e && e.name === 'AbortError') throw e; }
      const r = await fetch(url, { signal });
      if (!r.ok) { const err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
      return r.json();
    }

    /* ── fetch ─────────────────────────────────────────────────────────────────────────────────
       args: { source, bounds:[w,s,e,n], nx?, ny?, days?, variable?, models?, conditions?, observations?, signal? } */
    async function fetchForecast(a) {
      a = a || {};
      const S = SOURCES[a.source];
      if (!S) return fail('source-unknown', { source: a.source == null ? null : String(a.source), sources: Object.keys(SOURCES) });
      if (!validBounds(a.bounds)) return fail('bounds-invalid', { needs: '[west,south,east,north] in degrees, west<east, south<north' });
      const nx = Math.max(1, Math.min(10, Math.floor(+a.nx || 4))), ny = Math.max(1, Math.min(10, Math.floor(+a.ny || 4)));
      if (nx * ny > MAX_POINTS) return fail('too-many-points', { asked: nx * ny, max: MAX_POINTS });
      const days = Math.max(1, Math.min(S.maxDays, Math.floor(+a.days || 7)));
      let variable = S.central;
      if (a.variable != null && a.variable !== '') {
        variable = String(a.variable);
        if (!S.variables || !Object.prototype.hasOwnProperty.call(S.variables, variable)) return fail('variable-unknown', { variable, variables: S.variables ? Object.keys(S.variables) : [S.central] });
      }
      const unit = S.variables ? S.variables[variable] : S.unit;
      const dailyVars = S.spread ? S.dailyVars.slice() : [variable];
      const fetcher = (typeof D.fetchJSON === 'function') ? D.fetchJSON : defaultFetch;
      const pts = lattice(a.bounds, nx, ny);
      const rows = [], failed = [], requested = [];
      let issuedMs = null;
      for (let k = 0; k < pts.length; k += CHUNK) {
        const part = pts.slice(k, k + CHUNK);
        const q = 'latitude=' + part.map((p) => p[1].toFixed(4)).join(',') + '&longitude=' + part.map((p) => p[0].toFixed(4)).join(',')
          + '&daily=' + dailyVars.join(',') + '&forecast_days=' + days + '&timezone=GMT'
          + (a.models && S.id === 'open-meteo-forecast' ? '&models=' + encodeURIComponent(String(a.models)) : '');
        const url = S.url + '?' + q;
        requested.push(url);
        let j = null;
        try { j = await fetcher(url, a.signal || null); }
        catch (e) { if (e && e.name === 'AbortError') return fail('aborted'); failed.push({ points: part.length, why: 'fetch-failed', detail: String((e && e.message) || e).slice(0, 160) }); continue; }
        const list = Array.isArray(j) ? j : (j ? [j] : []);
        if (list.length !== part.length) failed.push({ points: part.length, why: 'answer-shape', detail: 'asked ' + part.length + ' locations, got ' + list.length });
        list.forEach((r) => { if (r && r.daily && Array.isArray(r.daily.time) && num(r.latitude) != null && num(r.longitude) != null) rows.push(r); });
        issuedMs = now();
      }
      if (!rows.length) return fail('no-data', { failed, requested });

      const dates = rows[0].daily.time.slice();
      const asNums = (r, name) => (Array.isArray(r.daily[name]) ? r.daily[name].map(num) : null);
      const thr = a.conditions && a.conditions.threshold != null && isFinite(+a.conditions.threshold) ? +a.conditions.threshold : null;
      const est = [], unc = [];
      rows.forEach((r, idx) => {
        const series = asNums(r, S.spread ? S.central : variable);
        if (!series) return;
        const finite = series.filter((v) => v != null);
        if (!finite.length) return;                           /* a point the provider answered with no numbers is absent, not zero */
        let peak = -Infinity, at = 0;
        series.forEach((v, i) => { if (v != null && v > peak) { peak = v; at = i; } });
        const geometry = { type: 'Point', coordinates: [r.longitude, r.latitude] };
        const common = { point: idx + 1, source: S.id, variable, unit, peakDate: r.daily.time[at] };
        const pe = Object.assign({ dataClass: 'model-estimate', value: peak, model: S.model, exceeds: thr == null ? null : peak > thr }, common);
        series.forEach((v, i) => { pe['day' + i] = v; });
        est.push({ type: 'Feature', geometry, properties: pe });
        if (S.spread) {
          const hi = asNums(r, S.spread.high), lo = asNums(r, S.spread.low), q1 = asNums(r, S.spread.q1), q3 = asNums(r, S.spread.q3);
          const hiPeak = hi && hi[at] != null ? hi[at] : null, loPeak = lo && lo[at] != null ? lo[at] : null;
          const pu = Object.assign({ dataClass: 'uncertainty', basis: S.spreadBasis, low: loPeak, high: hiPeak,
            spread: (hiPeak != null && loPeak != null) ? hiPeak - loPeak : null,
            q25: q1 && q1[at] != null ? q1[at] : null, q75: q3 && q3[at] != null ? q3[at] : null,
            exceedsInSomeMember: thr == null ? null : (hiPeak != null ? hiPeak > thr : null) }, common);
          unc.push({ type: 'Feature', geometry, properties: pu });
        }
      });
      if (!est.length) return fail('no-data', { failed, requested, note: 'the provider answered, but no point carried a number' });

      const record = {
        kind: 'forecast-scenario',
        fetchedAt: new Date(issuedMs == null ? now() : issuedMs).toISOString(),
        source: { id: S.id, url: S.url, model: S.model, attribution: S.attribution, requests: requested.length },
        terms: S.terms,
        region: { bounds: a.bounds.slice(), grid: { nx, ny }, days, dates },
        variable, unit,
        /* ① observations — references only; see the head of this file */
        observations: Array.isArray(a.observations) && a.observations.length
          ? { status: 'referenced', datasets: a.observations.map((x) => String(x)) }
          : { status: 'none-supplied', note: 'this source publishes model output, not measurements; nothing here is an observation' },
        /* ② model estimates and ④ uncertainty are filled by register(); counts are stated now */
        modelEstimates: { points: est.length, answeredLocations: rows.length, askedLocations: pts.length, noValue: rows.length - est.length },
        /* ③ what the reader stated, verbatim */
        userConditions: a.conditions && typeof a.conditions === 'object' ? JSON.parse(JSON.stringify(a.conditions)) : null,
        uncertainty: { basis: S.spreadBasis, note: S.spreadNote, points: unc.length },
        /* every request ANSWERED. A location the provider answered with no number (a cell with no river, open sea) is `noValue`: absent from the datasets, counted, and not a failure */
        complete: !failed.length && rows.length === pts.length,
        failed,
      };
      return { ok: true, record, estimates: est, uncertainty: unc, requested };
    }

    /* ── register: each class its OWN dataset, with its own provenance ───────────────────────── */
    function register(res, opts) {
      const reg = registry();
      if (!reg || typeof reg.add !== 'function') return fail('registry-missing');
      if (!res || !res.ok) return fail('nothing-to-register');
      const o = opts || {};
      const S = SOURCES[res.record.source.id];
      const prov = (cls) => ({ kind: 'forecast', dataClass: cls, source: res.record.source, terms: res.record.terms, fetchedAt: res.record.fetchedAt,
        region: res.record.region, variable: res.record.variable, unit: res.record.unit,
        userConditions: res.record.userConditions, sameAnswer: 'not-guaranteed' });
      const stamp = String(o.title || (S.title.en + ' ' + res.record.region.dates[0]));
      const out = { record: res.record, datasets: {} };
      const e = reg.add({ title: '[model estimate] ' + stamp, features: res.estimates, provenance: prov('model-estimate') });
      out.datasets.modelEstimate = e.id;
      if (res.uncertainty.length) {
        const u = reg.add({ title: '[uncertainty] ' + stamp, features: res.uncertainty, provenance: prov('uncertainty') });
        out.datasets.uncertainty = u.id;
      }
      res.record.modelEstimates.dataset = out.datasets.modelEstimate;
      res.record.uncertainty.dataset = out.datasets.uncertainty || null;
      return Object.assign({ ok: true }, out);
    }

    /* ── draw: colour by class, so the picture says what the table says ──────────────────────── */
    async function draw(registered) {
      const W = WIN(), drawn = [];
      const core = D.core || (W && W.IntMapGis && W.IntMapGis) || null;
      const GU = D.upload || (W && W.GeoJSONUpload) || null;
      if (!core || typeof core.draw !== 'function') return fail('map-unavailable');
      for (const id of Object.values((registered && registered.datasets) || {})) {
        const r = core.draw(id, {});
        if (!r || !r.ok) { drawn.push({ id, ok: false, why: (r && r.why) || 'draw-failed' }); continue; }
        if (GU && typeof GU.style === 'function') {
          try { await GU.style(id, { field: 'dataClass', mode: 'categorical' }); } catch (_) { /* the colour is a convenience; the layer is drawn */ }
        }
        drawn.push({ id, ok: true });
      }
      return { ok: drawn.every((d) => d.ok), drawn };
    }

    const API = { sources, fetchForecast, register, draw, lattice, MAX_POINTS };
    try { if (WIN()) WIN().IntMapGisForecast = API; } catch (_) { }
    return API;
  })();
}
