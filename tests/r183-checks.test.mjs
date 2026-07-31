// (#R183) THE THINGS THAT WERE SILENTLY WRONG, PINNED SO THEY CANNOT GO WRONG SILENTLY AGAIN.
//
// Three defects this round fixed had the same shape: something failed, nothing said so, and the
// UI kept rendering a plausible-looking value. A test that only asserts "the happy path works"
// would have passed on every one of them. So these tests aim at the FAILURE modes:
//   · a weather fetch that returns HTTP 429 with a valid JSON error body
//   · a sunrise calculation that answers for the wrong DAY
//   · a search result whose bounding box is a synthetic stub, or spans the globe
//   · a counter that started counting parts instead of aircraft
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/* ── js/wx-source.js — evaluated against a stub window, the way #R180/#R182 test their modules ── */
function loadWx(fetchImpl) {
  const store = {};
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };
  const fn = new Function('window', 'localStorage', 'fetch', read('js/wx-source.js') + '\nreturn window.IntMapWx;');
  return fn(win, win.localStorage, fetchImpl);
}
const res = (status, body) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
  json: () => Promise.resolve(body)
});

test('R183: an Open-Meteo 429 error body is NOT accepted as data (the whole bug)', async () => {
  // This is the exact response measured from the app's own origin. It is valid JSON, which is why
  // `await r.json()` with no r.ok test handed js/widgets.js an object and the card printed "—".
  const quota = { error: true, reason: 'Daily API request limit exceeded. Please try again tomorrow.' };
  let met = 0;
  const Wx = loadWx((url) => {
    if (url.includes('open-meteo.com')) return res(429, quota);
    met++;
    return res(200, {
      properties: {
        timeseries: [{
          time: '2026-07-30T23:00:00Z',
          data: { instant: { details: { air_temperature: 30.3, wind_speed: 1, ultraviolet_index_clear_sky: 2.9 } } }
        }]
      }
    });
  });
  const j = await Wx.point(35.68, 139.76, { days: 1 });
  assert.ok(j, 'a 429 must fail over, not resolve to a half-filled object');
  assert.equal(j._src, 'MET Norway');
  assert.equal(j.current.temperature_2m, 30.3);
  assert.equal(met, 1);
});

test('R183: a daily-limit 429 trips the breaker until the next UTC midnight, and stops re-asking', async () => {
  let om = 0;
  const Wx = loadWx((url) => {
    if (url.includes('open-meteo.com')) { om++; return res(429, { error: true, reason: 'Daily API request limit exceeded.' }); }
    return res(200, { properties: { timeseries: [{ time: '2026-07-30T23:00:00Z', data: { instant: { details: { air_temperature: 1 } } } }] } });
  });
  await Wx.point(10, 10, { days: 1 });
  const st = Wx.status();
  assert.equal(st.down, true, 'breaker open');
  assert.equal(st.daily, true, 'recognised as the daily quota, not a transient error');
  const n = new Date(st.until);
  assert.equal(n.getUTCHours(), 0, 'reopens at 00:00 UTC — when Open-Meteo\'s counter rolls');
  // …and the second call must not touch Open-Meteo at all. Re-asking a dead daily quota is what
  // keeps it at zero, which is why the breaker exists rather than a plain per-call fallback.
  await Wx.point(20, 20, { days: 1 });
  assert.equal(om, 1, 'Open-Meteo asked once, not once per call');
});

test('R183: a non-daily failure backs off minutes, not a whole day', async () => {
  const Wx = loadWx(() => res(429, { error: true, reason: 'Minutely API request limit exceeded.' }));
  await Wx.point(10, 10, {});
  const st = Wx.status();
  assert.equal(st.daily, false);
  assert.ok(st.until - Date.now() <= 10 * 60000 + 1000, 'a transient limit must not lock the source out all day');
});

test('R183: MET\'s clear-sky UV never lands in the all-sky field', async () => {
  // Open-Meteo's uv_index is all-sky; MET publishes ultraviolet_index_clear_sky, an upper bound
  // that ignores cloud. Writing one into the other would make the number change meaning when the
  // source changed — the card says "clear sky" precisely because these stay apart.
  const Wx = loadWx((url) => url.includes('open-meteo.com')
    ? res(429, { error: true, reason: 'Daily API request limit exceeded.' })
    : res(200, { properties: { timeseries: [{ time: '2026-07-30T23:00:00Z', data: { instant: { details: { air_temperature: 30, ultraviolet_index_clear_sky: 2.9 } } } }] } }));
  const j = await Wx.point(35.68, 139.76, { uv: true });
  assert.equal(j.current.uv_index, null, 'all-sky UV is unknown from MET and must say so');
  assert.equal(j.current.uv_index_clear_sky, 2.9);
  assert.equal(j.daily._partialFirstDay, true, 'MET starts at the current hour → "peak ahead", not "today\'s max"');
});

test('R183: the MET series is bucketed by LOCAL day, not by the UTC date in the stamp', async () => {
  // Measured bug: at 08:00 JST the UTC-date bucket held ONE hour, so the UV "daily max" came back
  // equal to the current reading and the weather card showed H 32 / L 32.
  const mk = (t, temp, uv) => ({ time: t, data: { instant: { details: { air_temperature: temp, ultraviolet_index_clear_sky: uv } } } });
  const Wx = loadWx((url) => url.includes('open-meteo.com')
    ? res(429, { error: true, reason: 'Daily API request limit exceeded.' })
    : res(200, { properties: { timeseries: [
        mk('2026-07-30T23:00:00Z', 28, 0.5),   // 08:00 JST on the 31st
        mk('2026-07-31T03:00:00Z', 37, 8.6),   // 12:00 JST on the 31st — the real peak
        mk('2026-07-31T09:00:00Z', 30, 1.0)    // 18:00 JST on the 31st
      ] } }));
  const j = await Wx.point(35.68, 139.76, { uv: true });
  assert.equal(j.daily.time.length, 1, 'all three samples are the same Tokyo day');
  assert.equal(j.daily.temperature_2m_max[0], 37);
  assert.equal(j.daily.temperature_2m_min[0], 28, 'high and low must not collapse to one value');
  assert.equal(j.daily.uv_index_clear_sky_max[0], 8.6);
});

test('R183: sunrise/sunset answers for the CIVIL day on the caller\'s clock', () => {
  const Wx = loadWx(() => res(200, {}));
  // Ground truth from MET Norway's Sunrise 3.0 API (the authority). Tolerance 6 min: the
  // simplified equation of centre is worth ~3 min, and ~5 near a grazing midnight sun.
  const CASES = [
    { name: 'Tokyo', lat: 35.6895, lng: 139.6917, date: '2026-07-31', tz: 'Asia/Tokyo', rise: '04:48', set: '18:46' },
    { name: 'London', lat: 51.4779, lng: -0.0015, date: '2026-07-31', tz: 'UTC', rise: '04:22', set: '19:49' },
    { name: 'Sydney', lat: -33.8688, lng: 151.2093, date: '2026-07-31', tz: 'Australia/Sydney', rise: '06:48', set: '17:14' }
  ];
  for (const c of CASES) {
    // build a local-noon instant so the civil date is unambiguous in the test runner's own zone
    const [y, m, d] = c.date.split('-').map(Number);
    const s = Wx.sunTimes(c.lat, c.lng, new Date(y, m - 1, d, 12, 0, 0));
    const hhmm = (dt) => dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: c.tz, hour12: false });
    const mins = (t) => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
    const dr = Math.abs(mins(hhmm(s.sunrise)) - mins(c.rise));
    const ds = Math.abs(mins(hhmm(s.sunset)) - mins(c.set));
    assert.ok(dr <= 6, `${c.name} sunrise ${hhmm(s.sunrise)} vs MET ${c.rise}`);
    assert.ok(ds <= 6, `${c.name} sunset ${hhmm(s.sunset)} vs MET ${c.set}`);
    // the DAY is the part that was wrong twice before it was right
    assert.equal(s.sunrise.toLocaleDateString('en-CA', { timeZone: c.tz }), c.date, `${c.name} answered for the wrong day`);
  }
});

test('R183: polar day and polar night are answered, not left blank', () => {
  const Wx = loadWx(() => res(200, {}));
  assert.equal(Wx.sunTimes(78.22, 15.65, new Date(2026, 6, 31, 12)).polar, 'day');
  assert.equal(Wx.sunTimes(78.22, 15.65, new Date(2026, 11, 21, 12)).polar, 'night');
});

/* ── js/search-geocode.js — the framing decision, exercised without a map ─────────────────────── */
function loadSearch() {
  // js/place-framing.js is PURE — no map, no HOST, no renderer — so the whole decision runs here.
  // It lives outside js/search-geocode.js because that factory's body may contain only
  // declarations (tests/r169-checks #4), and publishing a global from it is a statement that runs.
  const win = {};
  new Function('window', read('js/place-framing.js'))(win);
  return win.IntMapPlaceFraming;
}

test('R183: a search result is framed by what it is, never at the old flat zoom 9', () => {
  const S = loadSearch();
  // Every `raw` below is the shape Nominatim's jsonv2 actually returns, taken from live responses.
  const nom = (o) => Object.assign({ lat: '0', lon: '0' }, o);

  // 1. administrative results are indistinguishable by category/type — addresstype decides
  const russia = nom({ category: 'boundary', type: 'administrative', addresstype: 'country', lat: '64.6863136', lon: '97.7453061', boundingbox: ['41.1850968', '82.0586232', '-180.0000000', '180.0000000'] });
  const vatican = nom({ category: 'boundary', type: 'administrative', addresstype: 'country', lat: '41.9034110', lon: '12.4528527', boundingbox: ['41.9002048', '41.9073829', '12.4457878', '12.4583653'] });
  assert.equal(S.framingFor(russia).cls, 'country');
  assert.equal(S.framingFor(vatican).cls, 'country');
  // …but a globe-spanning box is unusable, and its unusability is itself evidence of a huge feature
  const fr = S.framingFor(russia);
  assert.equal(fr.bounds, null, 'a 360°-wide box must not be framed');
  assert.ok(fr.huge && fr.zoom <= 3.2, 'an antimeridian country widens the fallback instead of using it');
  assert.ok(S.framingFor(vatican).bounds, 'a real compact extent IS framed');

  // 2. a NODE gets a synthetic ±0.0001° box — framing it put the Sahara at zoom 16.5
  const sahara = nom({ category: 'natural', type: 'desert', addresstype: 'region', lat: '23', lon: '13', boundingbox: ['22.9999', '23.0001', '12.9999', '13.0001'] });
  const sf = S.framingFor(sahara);
  assert.equal(sf.bounds, null, 'an 11-metre stub box is not a measurement');
  assert.equal(sf.cls, 'desert', 'physical features are classified by category/type, not by addresstype="region"');
  assert.ok(sf.zoom < 6, 'a desert must not be framed like a county');

  // 3. an extent dominated by outlying territory — Tokyo reaches 1,000 km south to Ogasawara
  // The real box runs SOUTH from the city, so the point sits at 98.6% of its height — which is
  // exactly the tell. (These are live Nominatim values; an invented box put the point at 73% and
  // the test passed while claiming to prove something it did not.)
  const tokyo = nom({ category: 'boundary', type: 'administrative', addresstype: 'province', lat: '35.6768601', lon: '139.7638947', boundingbox: ['20.2145811', '35.8984245', '135.8536855', '154.2055410'] });
  const tf = S.framingFor(tokyo);
  assert.equal(tf.bounds, null, 'the point sits nowhere near the centre of that box');
  assert.equal(tf.cls, 'province');

  // 4. …while a compact place keeps its real extent
  const baikal = nom({ category: 'water', type: 'lake', addresstype: 'lake', lat: '53.6167299', lon: '108.1307186', boundingbox: ['51.4563478', '55.7771085', '103.6994241', '109.9637488'] });
  assert.equal(S.framingFor(baikal).cls, 'lake');
  assert.ok(S.framingFor(baikal).bounds, 'a lake whose point is central keeps its footprint');

  // 5. the two categories that were missing entirely and fell to the default
  assert.equal(S.framingFor(nom({ category: 'man_made', type: 'tower' })).cls, 'landmark');
  assert.equal(S.framingFor(nom({ category: 'water', type: 'lake' })).cls, 'lake');

  // 6. a linear feature's box is a bad frame even though it is real
  const amazon = nom({ category: 'waterway', type: 'river', lat: '-2', lon: '-55', boundingbox: ['-4', '0', '-70', '-50'] });
  assert.equal(S.framingFor(amazon).bounds, null, 'a river is framed by class, not by its 20°-wide box');
});

test('R183: every zoom in the table is a real zoom, and nothing is left at the old default of 9', () => {
  const S = loadSearch();
  const T = S.zoomTable();
  for (const [k, v] of Object.entries(T)) {
    assert.ok(typeof v === 'number' && v > 0 && v <= 20, `${k} → ${v}`);
  }
  // the shape of the table is the claim: a continent is further out than a country, which is
  // further out than a city, which is further out than a building.
  assert.ok(T.continent < T.country, 'continent wider than country');
  assert.ok(T.country < T.city, 'country wider than city');
  assert.ok(T.city < T.station, 'city wider than a railway station');
  assert.ok(T.station < T.building, 'station wider than a building');
  assert.ok(S.defaultZoom() > T.country, 'the fallback is town-sized, not country-sized');
});

/* ── js/data-layers.js — the aircraft glyph, read as source ───────────────────────────────────── */
const DL = read('js/data-layers.js');

test('R183: the aircraft icon is declared at devicePixelRatio', () => {
  // The bug was silent: addImage(id, ImageData) with no pixelRatio makes MapLibre treat canvas
  // pixels as CSS pixels, so a 1× bitmap is upscaled on every HiDPI screen. Nothing errors.
  assert.match(DL, /devicePixelRatio/, 'the plane glyph must be rasterised at the screen\'s ratio');
  assert.match(DL, /addImage\([^)]*\{\s*pixelRatio/, 'and DECLARED with it, or MapLibre still scales it');
});

test('R183: the 3-D aircraft body is built from parts at DIFFERENT heights', () => {
  // One plan-view polygon with a uniform thickness reads as a paper cut-out when the map is tilted.
  const m = DL.match(/_P_LEVELS\s*=\s*\{([^}]*)\}/);
  assert.ok(m, '_P_LEVELS must exist');
  const levels = {};
  for (const part of m[1].matchAll(/(\w+)\s*:\s*\[([\d.]+)\s*,\s*([\d.]+)\]/g)) {
    levels[part[1]] = [Number(part[2]), Number(part[3])];
  }
  for (const k of ['fuselage', 'wing', 'stab', 'fin']) assert.ok(levels[k], `${k} level`);
  for (const [k, v] of Object.entries(levels)) assert.ok(v[1] > v[0], `${k} must have height`);
  // the shape of an aeroplane: the fin stands above everything, the wing sits below the spine
  assert.ok(levels.fin[1] > levels.fuselage[1], 'the fin must reach above the fuselage');
  assert.ok(levels.wing[0] < levels.fuselage[1], 'the wing is mounted on the fuselage, not above it');
  assert.ok(levels.wing[1] < levels.stab[0], 'the stabiliser sits above the wing line');
});

test('R183: the detail budget is on aircraft COUNT, not on zoom', () => {
  // Gating on the glyph's on-screen size never fired: `half` is clamped to a 26-px minimum at every
  // zoom, so half/mpp is pinned at 13 below ~z15. Measured: 53 aircraft, 91 features, zero parts.
  assert.match(DL, /DETAIL_MAX_AIRCRAFT/, 'the budget must be a count');
  assert.doesNotMatch(DL, /const\s+DETAIL_PX/, 'the zoom-based gate was the wrong axis and is gone');
  assert.match(DL, /detailed\s*=\s*list\.length\s*<=\s*DETAIL_MAX_AIRCRAFT/);
});

test('R183: the "lifted" counter counts aircraft, not the parts they are made of', () => {
  // #R181's lesson: suspect what a counter counts. One aircraft became four features this round.
  assert.match(DL, /part\s*===\s*'fuselage'/, 'aircraft are counted by their fuselage');
  assert.match(DL, /aircraft:\s*bodies\.length/, 'and reported under their own name');
});

/* ── js/volume3d.js — more than one body ──────────────────────────────────────────────────────── */
const V3D = read('js/volume3d.js');
const TP = read('js/tool-panel.js');

test('R183: the volume tool keeps a STORE of bodies, each with its own layers', () => {
  // The old limitation was not a rendering one — the engine's solid contract is already keyed by
  // layer id — it was that `ring`/`baseM`/`topM` were single variables, so a second body could only
  // destroy the first. Per-object layer ids are what make several bodies drawable at once.
  assert.match(V3D, /let saved=\[\]/, 'a store of saved bodies');
  assert.match(V3D, /const SS=id=>|SL=id=>|SB=id=>/, 'layer ids are derived per object, not constant');
  for (const fn of ['commit', 'selectObj', 'setObjVisible', 'removeObj', 'updateObj', 'pickAt']) {
    assert.ok(V3D.includes('function ' + fn + '('), `${fn} exists`);
  }
  assert.match(V3D, /totalVolumeM3/, 'the running total is part of the contract, not the panel');
});

test('R183: committing keeps the settings and clears only the footprint', () => {
  // Re-entering the altitudes and colour for every body in a series is the friction this feature
  // exists to remove — the same reasoning as #R18 keeping the line-of-sight numbers across sites.
  const body = V3D.slice(V3D.indexOf('function commit('), V3D.indexOf('function find('));
  assert.match(body, /ring=\[\]/, 'the footprint is cleared');
  assert.doesNotMatch(body, /\bbaseM=/, 'the altitude band is NOT reset');
  assert.doesNotMatch(body, /\bcolor=/, 'the colour is NOT reset');
});

test('R183: a hidden body does not swallow a click meant for the one underneath', () => {
  const pick = V3D.slice(V3D.indexOf('function pickAt('), V3D.indexOf('function pickAt(') + 400);
  assert.match(pick, /visible===false/, 'hidden bodies are skipped');
  assert.match(pick, /for\(let i=saved\.length-1;i>=0;i--\)/, 'newest first — the one drawn last is on top');
});

test('R183: each saved body reads the ground under ITS OWN centroid', () => {
  // With 3-D terrain on, the renderer's metres are above the GROUND. Two bodies can sit on opposite
  // sides of a mountain, so one shared offset would put one of them at the wrong altitude — which is
  // exactly the defect this whole tool exists to prevent (see the file header).
  assert.match(V3D, /function objGround\(o\)/);
  assert.match(V3D, /o\.ground=objGround\(o\)/);
});

test('R183: editing a saved body refreshes text in place, never rebuilding the field being typed in', () => {
  // #R171's defect: the panel re-renders on every keystroke, and rebuilding the inputs throws the
  // caret out of the one under the cursor.
  const list = TP.slice(TP.indexOf('const v3dList='), TP.indexOf('sync();', TP.indexOf('const v3dList=')));
  assert.match(list, /const retext=/, 'a text-only refresh exists');
  const applyO = list.slice(list.indexOf('const applyO='), list.indexOf('const applyO=') + 200);
  assert.ok(applyO.includes('retext()'), 'typing refreshes text only');
  assert.ok(!applyO.includes('v3dList()'), 'typing must NOT rebuild the field under the cursor');
});
