/* ============================================================================
 *  IntMap · weather point reads fail over honestly (js/wx-source.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r183-checks (weather).
 * ==========================================================================*/
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
import { loadWxSource } from './helpers/load-wx-source.mjs';

/* ── js/wx-source.js — evaluated against a stub window, the way #R180/#R182 test their modules ──
   (fetch-deadline-layer) through tests/helpers/load-wx-source.mjs, because the file now imports the
   clock its reads run under; the stub fetch still reaches every read it makes. */
const loadWx = (fetchImpl) => loadWxSource(fetchImpl);
// Match the HOST, not a substring: `url.includes('open-meteo.com')` also matches
// https://evil.example/?x=open-meteo.com, which is the defect CodeQL flags as
// js/incomplete-url-substring-sanitization — and the same shape was in wx-source.js's own
// breaker, where the answer decides whether a source is locked out for the rest of the day.
const isOM = (u) => { const h = new URL(u).hostname.toLowerCase();
  return h === 'open-meteo.com' || h.endsWith('.open-meteo.com'); };
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
    if (isOM(url)) return res(429, quota);
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
    if (isOM(url)) { om++; return res(429, { error: true, reason: 'Daily API request limit exceeded.' }); }
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
  const Wx = loadWx((url) => isOM(url)
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
  const Wx = loadWx((url) => isOM(url)
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

