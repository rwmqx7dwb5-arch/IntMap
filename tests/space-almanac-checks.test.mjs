/* ============================================================================
 *  The almanac of one place and one night (js/space-almanac.js) and the ground track of a solar eclipse
 *  (js/space-eclipse-path.js), held against PUBLISHED values — never against themselves.
 * ----------------------------------------------------------------------------
 *  Every reference below is a number someone else computed, with where it came from:
 *    · rising and setting: the National Astronomical Observatory of Japan (国立天文台 暦計算室, 「各地の
 *      こよみ」 東京 2026年6月, eco.mtk.nao.ac.jp/koyomi/dni/2026/s1306.html, read 2026-11-17);
 *    · the Moon's phase: the US Naval Observatory API (aa.usno.navy.mil/api/moon/phases/date, read 2026-11-17);
 *    · meteor-shower maxima: the dates printed in Table 5 of the IMO 2026 Meteor Shower Calendar;
 *    · eclipses: NASA GSFC (Espenak) — the Five Millennium Catalog (SEcat5/SE2001-2100.html: TD of
 *      greatest eclipse, ΔT, γ, width, duration), the per-eclipse path pages (SEgoogle/…google.html: the
 *      greatest-eclipse point and the central line / limits as polylines) and the lunar decade table
 *      (LEdecade/LEdecade2021.html). Read 2026-11-17.
 *
 *  TOLERANCES ARE DERIVED, NOT TUNED. Each one is built from the error budget written in the header of
 *  js/space-eclipse-path.js (measured against JPL Horizons): the Sun's direction from the JPL approximate
 *  elements is good to ≤ 35″, the Moon's (truncated ELP-2000/82) to ≤ 6″; at the Moon's distance 1″ is
 *  1.86 km on the ground and, over the Moon's ≈ 0.508″/s motion relative to the Sun, ≈ 2 s of time.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from './helpers/import-module.mjs';

/* js/space-sky.js (Greenwich sidereal time) is a browser module; it needs a document to construct its
   canvas against, and nothing else from the page */
const document = { createElement: () => ({ style: {}, getContext: () => null, appendChild() {} }),
  addEventListener() {}, readyState: 'complete', body: { appendChild() {} } };
const { IntMapAlmanac: A } = await importModule('js/space-almanac.js', { globals: { document } });
const { IntMapEclipsePath: P } = await importModule('js/space-eclipse-path.js', { globals: { document } });

const D2R = Math.PI / 180, MIN = 60000;
/* the budget (js/space-eclipse-path.js header) */
const SUN_ERR_AS = 35, MOON_ERR_AS = 6, KM_PER_AS = 1.86, REL_RATE_AS_PER_S = 0.508;
const POS_TOL_KM = (SUN_ERR_AS + MOON_ERR_AS) * KM_PER_AS;                 /* ≈ 76 km */
const TIME_TOL_S = (SUN_ERR_AS + MOON_ERR_AS) / REL_RATE_AS_PER_S + 5;     /* ≈ 86 s, +5 s for ΔT */

const hav = (a, b) => {
  const dl = (b[1] - a[1]) * D2R, dg = (b[0] - a[0]) * D2R;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dg / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, h)));
};
const inRing = (pt, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/* the latitude where a line crosses a meridian, inside a latitude band (a path can cross it twice) */
const latAt = (line, lng, lo, hi) => {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if ((a[0] - lng) * (b[0] - lng) <= 0 && a[0] !== b[0]) {
      const lat = a[1] + ((b[1] - a[1]) * (lng - a[0])) / (b[0] - a[0]);
      if (lat >= lo && lat <= hi) return lat;
    }
  }
  return null;
};
const jst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16);

/* ── rising and setting ─────────────────────────────────────────────────────────────────────────── */
test('almanac: Tokyo 2026-06-21 sunrise, transit and sunset agree with NAOJ to ±2 min', () => {
  /* NAOJ 「各地のこよみ」 東京 2026-06-21: 日の出 4:25, 南中 11:43, 日の入 19:00 (JST, rounded to the minute).
     NAOJ's Tokyo is 35.6581°N 139.7414°E at 0 m; the point asked for here is the Metropolitan Government
     (35.6895°N 139.6917°E) — 0.05° of longitude is 12 s, inside the tolerance. ±2 min = NAOJ's ±0.5 min
     rounding + the 12 s + a margin for refraction, which no almanac can know better than ±1 min. */
  const lat = 35.6895, lng = 139.6917;
  const morning = A.almanac({ lat, lng, when: Date.parse('2026-06-21T00:00:00+09:00') });   /* night of 06-20 → 06-21 */
  const evening = A.almanac({ lat, lng, when: Date.parse('2026-06-21T15:00:00+09:00') });   /* night of 06-21 → 06-22 */
  const near = (ms, hhmm) => { const [h, m] = hhmm.split(':').map(Number);
    return Math.abs(ms - Date.parse(`2026-06-21T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`)) <= 2 * MIN; };
  assert.ok(near(morning.sun.rise, '04:25'), `sunrise ${jst(morning.sun.rise)} vs NAOJ 04:25`);
  assert.ok(near(evening.sun.transit, '11:43'), `transit ${jst(evening.sun.transit)} vs NAOJ 11:43`);
  assert.ok(near(evening.sun.set, '19:00'), `sunset ${jst(evening.sun.set)} vs NAOJ 19:00`);
  /* the window is noon to noon: the morning call's window ends at the transit the evening call starts at */
  assert.ok(Math.abs(morning.window.to - evening.window.from) < 1000, 'consecutive windows meet at the solar transit');
  assert.ok(morning.sun.civil.dawn < morning.sun.rise && morning.sun.astronomical.dawn < morning.sun.nautical.dawn,
    'twilights precede sunrise in order: astronomical < nautical < civil < rise');
  assert.equal(morning.sun.polar, null);
  assert.ok(morning.dark && morning.dark.from > morning.sun.set && morning.dark.to < morning.sun.rise, 'astronomical night sits inside the night');
});

test('almanac: the midnight Sun and the polar night are reported as such, not as missing events', () => {
  const lat = 78.2232, lng = 15.6267;   /* Longyearbyen */
  const june = A.almanac({ lat, lng, when: Date.parse('2026-06-21T15:00:00Z') });
  assert.equal(june.sun.polar, 'day');
  assert.equal(june.sun.rise, null); assert.equal(june.sun.set, null);
  assert.equal(june.dark, null, 'no astronomical night under the midnight Sun');
  assert.ok(june.darkReason, 'and it says why');
  /* at 78°N on the December solstice the Sun stays below the horizon but climbs to −(23.44 − 11.78) ≈ −11.7°
     at noon: polar night, no civil twilight, and still a separate astronomical night */
  const dec = A.almanac({ lat, lng, when: Date.parse('2026-12-21T15:00:00Z') });
  assert.equal(dec.sun.polar, 'night');
  assert.equal(dec.sun.civil.dusk, null); assert.equal(dec.sun.civil.dawn, null);
  assert.ok(dec.sun.nautical.dusk != null && dec.dark && dec.dark.from > dec.window.from, 'the noon glow at −11.7° is nautical twilight');
  /* at 89°N the Sun is ≈ 22.4° down all day: the whole window is astronomical night */
  const pole = A.almanac({ lat: 89, lng: 0, when: Date.parse('2026-12-21T15:00:00Z') });
  assert.equal(pole.sun.polar, 'night');
  assert.ok(pole.dark && pole.dark.from === pole.window.from && pole.dark.to === pole.window.to, 'the whole window is dark');
});

/* ── the Moon ───────────────────────────────────────────────────────────────────────────────────── */
test('almanac: the full Moon of 2026-11-24 agrees with USNO within the derived tolerance', () => {
  /* USNO: Full Moon 2026-11-24 14:53 UTC (to the minute). Tolerance: (35″ + 6″) / 0.508″/s ≈ 81 s of
     ephemeris error + 30 s of USNO's rounding + 5 s of ΔT ≈ 2 min; asserted at 3 min ("数分以内"). */
  const a = A.almanac({ lat: 35.6895, lng: 139.6917, when: Date.parse('2026-11-20T12:00:00Z') });
  const ref = Date.parse('2026-11-24T14:53:00Z');
  assert.ok(Math.abs(a.moon.nextFull - ref) <= 3 * MIN, `full Moon ${new Date(a.moon.nextFull).toISOString()} vs USNO 14:53`);
  const at = A.moonPhase(a.moon.nextFull);
  assert.ok(at.illumination > 0.995, 'the Moon is fully lit at its full phase');
  const there = A.almanac({ lat: 35.6895, lng: 139.6917, when: a.moon.nextFull });
  assert.equal(there.moon.phaseName.en, 'Full Moon');
  /* USNO: New Moon 2026-11-09 07:02 UTC — the age counts from it */
  assert.ok(Math.abs(there.moon.ageDays - (a.moon.nextFull - Date.parse('2026-11-09T07:02:00Z')) / 86400000) < 3 * MIN / 86400000 * 2,
    'the age is the time since the last new Moon');
});

/* ── meteor showers ─────────────────────────────────────────────────────────────────────────────── */
test('meteor showers: every 2026 maximum computed from λ☉ falls on the date IMO prints for it', () => {
  /* IMO 2026 calendar, Table 5, "Maximum Date". The dates are COMPUTED here from the printed λ☉ — the
     module holds no dates — so this is the λ☉ → date conversion checked against IMO's own. */
  const printed = { QUA: '01-03', LYR: '04-22', ETA: '05-06', SDA: '07-31', PER: '08-13', ORI: '10-21',
    STA: '11-05', NTA: '11-12', LEO: '11-17', GEM: '12-14', URS: '12-22' };
  const list = A.meteorShowers(2026);
  assert.deepEqual(list.map((s) => s.code).sort(), Object.keys(printed).sort());
  for (const s of list) assert.equal(new Date(s.peakMs).toISOString().slice(5, 10), printed[s.code], `${s.code} maximum`);
  const per = list.find((s) => s.code === 'PER'), gem = list.find((s) => s.code === 'GEM');
  assert.ok(per.peakMs >= Date.parse('2026-08-12T00:00:00Z') && per.peakMs < Date.parse('2026-08-14T00:00:00Z'), 'Perseids 12–13 August');
  assert.ok(Math.abs(gem.peakMs - Date.parse('2026-12-14T12:00:00Z')) < 86400000, 'Geminids around 14 December');
  /* a year later the same λ☉ lands ~6 h later (the year is 365.24 d): the date is computed, not repeated */
  const per27 = A.meteorShowers(2027).find((s) => s.code === 'PER');
  const shift = (per27.peakMs - per.peakMs) / 3600e3 - 365 * 24;
  assert.ok(shift > 3 && shift < 9, `the 2027 maximum moves by the fraction of a day the year carries (${shift.toFixed(1)} h)`);
  for (const s of list) assert.match(s.source, /IMO 2026 Meteor Shower Calendar/);
});

test('almanac: on the night of the Perseid maximum the shower is listed with its radiant and the moonlight', () => {
  const a = A.almanac({ lat: 35.6895, lng: 139.6917, when: Date.parse('2026-08-12T15:00:00+09:00') });
  const per = a.showers.find((s) => s.code === 'PER');
  assert.ok(per, 'the Perseids are active');
  /* the radiant (δ ≈ +58°) culminates at 90 − 35.7 + 58 > 90 → it is circumpolar from Tokyo and climbs high
     before dawn; it cannot be below ~22° (its lower culmination) at any hour */
  assert.ok(per.radiantAltMaxDeg > 50, `radiant altitude ${per.radiantAltMaxDeg.toFixed(1)}°`);
  assert.ok(per.moon && per.moon.illumination >= 0 && per.moon.illumination <= 1);
  assert.ok(Math.abs(per.daysFromPeak) < 1.5);
  assert.ok(!a.showers.some((s) => s.code === 'GEM'), 'a December shower is not active in August');
});

/* ── solar eclipses ─────────────────────────────────────────────────────────────────────────────── */
/* NASA SEcat5 (TD, ΔT, γ, width km, duration) and the SEgoogle greatest-eclipse point (lat, lng) */
const NASA = {
  '2024-04-08': { td: '2024-04-08T18:18:29Z', dT: 74, kind: 'total', gamma: 0.3431, widthKm: 198, durS: 4 * 60 + 28, sunAlt: 70, ge: [-104.13800, 25.28651] },
  '2026-08-12': { td: '2026-08-12T17:47:06Z', dT: 75, kind: 'total', gamma: 0.8977, widthKm: 294, durS: 2 * 60 + 18, sunAlt: 26, ge: [-25.22754, 65.22423] },
  '2027-08-02': { td: '2027-08-02T10:07:50Z', dT: 76, kind: 'total', gamma: 0.1421, widthKm: 258, durS: 6 * 60 + 23, sunAlt: 82, ge: [33.18262, 25.50495] },
  '2023-10-14': { td: '2023-10-14T18:00:41Z', dT: 74, kind: 'annular', gamma: 0.3753, widthKm: 187, durS: 5 * 60 + 17, sunAlt: 68, ge: [-83.10211, 11.36924] },
};
const paths = {};
for (const [d, n] of Object.entries(NASA)) paths[d] = P.solarEclipsePath(Date.parse(n.td) - n.dT * 1000 + 37 * MIN);  /* a seed 37 min off: the search finds greatest itself */

test('eclipse path: kind, instant, γ and the greatest point agree with NASA within the ephemeris budget', () => {
  for (const [d, n] of Object.entries(NASA)) {
    const r = paths[d];
    assert.equal(r.kind, n.kind, `${d} kind`);
    const ut = Date.parse(n.td) - n.dT * 1000;
    assert.ok(Math.abs(r.ms - ut) / 1000 <= TIME_TOL_S, `${d} greatest ${new Date(r.ms).toISOString()} vs NASA UT ${new Date(ut).toISOString()}`);
    /* γ is a distance in Earth radii: the position budget over 6378 km */
    assert.ok(Math.abs(r.gamma - n.gamma) <= POS_TOL_KM / 6378, `${d} γ ${r.gamma.toFixed(4)} vs ${n.gamma}`);
    const off = hav([r.greatest.lng, r.greatest.lat], n.ge);
    assert.ok(off <= POS_TOL_KM, `${d} greatest point ${off.toFixed(1)} km from NASA's`);
    assert.match(r.source, /computed from js\/ephemeris\.js/);
  }
});

test('eclipse path: width and duration at greatest agree with NASA to what the geometry allows', () => {
  /* Width and duration come from the cone radii (distances, good to a part in 10⁴) and from the slant of
     the ground under the shadow. A position error Δ (≤ the budget) tilts the ground by Δ/R, and a path
     of width w at solar altitude h stretches by w·cot(h)·Δ/R. Plus NASA's rounding (1 km, 1 s). */
  for (const [d, n] of Object.entries(NASA)) {
    const r = paths[d], frac = (1 / Math.tan(n.sunAlt * D2R)) * (POS_TOL_KM / 6378) + 0.005;
    assert.ok(Math.abs(r.greatest.widthKm - n.widthKm) <= n.widthKm * frac + 0.5, `${d} width ${r.greatest.widthKm.toFixed(1)} vs ${n.widthKm} km`);
    assert.ok(Math.abs(r.greatest.durationS - n.durS) <= n.durS * frac + 0.5, `${d} duration ${r.greatest.durationS.toFixed(1)} vs ${n.durS} s`);
  }
});

test('eclipse path: the central line and the limits run where NASA draws them', () => {
  /* NASA's central line and limits (SEgoogle polylines) interpolated at a meridian, against this
     file's. Away from sunrise/sunset only: near the path's ends the axis grazes the limb and a cross-
     track error δ slides the end along the ground by √(2Rδ) — 400 km for 13 km — for NASA too. */
  const refs = [
    ['2024-04-08', -106.5, 15, 30, { C: 22.783, N: 24.1634, S: 21.4047 }],
    ['2024-04-08', -97.0, 25, 40, { C: 32.0324, N: 33.2432, S: 30.8129 }],
    ['2026-08-12', -4.0, 35, 50, { C: 42.2115, N: 43.9112, S: 40.6659 }],
    ['2027-08-02', 32.5, 20, 32, { C: 25.9536, N: 27.3802, S: 24.5203 }],
    ['2023-10-14', -110, 30, 45, { C: 37.3218, N: 38.4714, S: 36.1836 }],
    ['2023-10-14', -83, 5, 18, { C: 11.2468, N: 12.5895, S: 9.9234 }],
  ];
  const kmPerDegLat = 111.2;
  /* every crossing of the polygon's ring with the meridian, inside the band */
  const crossings = (ring, lng, lo, hi) => { const o = [];
    for (let i = 1; i < ring.length; i++) { const a = ring[i - 1], b = ring[i];
      if ((a[0] - lng) * (b[0] - lng) <= 0 && a[0] !== b[0]) { const l = a[1] + ((b[1] - a[1]) * (lng - a[0])) / (b[0] - a[0]); if (l >= lo && l <= hi) o.push(l); } }
    return o; };
  for (const [d, lng, lo, hi, ref] of refs) {
    const r = paths[d];
    const c = latAt(r.central, lng, lo, hi);
    assert.ok(c != null, `${d}: the central line crosses ${lng}°`);
    /* a difference of latitude along a meridian is ≥ the perpendicular distance between the lines (the path
       crosses the meridian obliquely), so holding it to the position budget is the stricter test */
    assert.ok(Math.abs(c - ref.C) * kmPerDegLat <= POS_TOL_KM, `${d} at ${lng}°: central ${c.toFixed(3)} vs NASA ${ref.C}`);
    const ring = r.umbra.coordinates[0];
    /* NASA's own central point is inside this file's path, and its limits are just outside or on it */
    assert.ok(inRing([lng, ref.C], ring), `${d} NASA's central point at ${lng}° lies inside the computed path`);
    /* the path's extent along the meridian, against NASA's limits there. The common shift cancels in a
       width; what remains is the slant stretch of the width-and-duration test, at the Sun's altitude there,
       plus 1 km for the 60 s chords the polygon is drawn with. */
    const xs = crossings(ring, lng, lo, hi);
    assert.equal(xs.length, 2, `${d} the path crosses ${lng}° once on each side`);
    const mine = (Math.max(...xs) - Math.min(...xs)) * kmPerDegLat, theirs = (ref.N - ref.S) * kmPerDegLat;
    const h = P.localCircumstances(r.ms, ref.C, lng).sunAltAtMax;
    const tol = theirs * ((1 / Math.tan(h * D2R)) * (POS_TOL_KM / 6378) + 0.005) + 1;
    assert.ok(Math.abs(mine - theirs) <= tol, `${d} at ${lng}°: path ${mine.toFixed(1)} km along the meridian vs NASA ${theirs.toFixed(1)} (±${tol.toFixed(1)})`);
  }
});

test('eclipse path: the places the request names are inside the path', () => {
  const places = [
    ['2024-04-08', 'Mazatlán', [-106.4111, 23.2494]], ['2024-04-08', 'Dallas', [-96.7970, 32.7767]],
    ['2026-08-12', 'Burgos', [-3.7038, 42.3439]], ['2027-08-02', 'Luxor', [32.6396, 25.6872]],
  ];
  for (const [d, name, pt] of places) {
    const r = paths[d];
    assert.ok(inRing(pt, r.umbra.coordinates[0]), `${name} lies in the ${d} path`);
    const lc = P.localCircumstances(r.ms, pt[1], pt[0]);
    assert.equal(lc.kind, 'total', `${name} sees totality`);
    assert.ok(lc.c1 < lc.c2 && lc.c2 < lc.max && lc.max < lc.c3 && lc.c3 < lc.c4, `${name} contacts in order`);
    assert.ok(lc.magnitude > 1 && lc.obscuration === 1, `${name} magnitude ${lc.magnitude.toFixed(4)}`);
    assert.ok(lc.visible && lc.sunAltAtMax > 0, `${name} sees it with the Sun up`);
  }
  /* the 2023 eclipse is annular on NASA's central line */
  const lc = P.localCircumstances(paths['2023-10-14'].ms, 37.3218, -110);
  assert.equal(lc.kind, 'annular');
  assert.ok(lc.magnitude < 1 && lc.obscuration < 1 && lc.durationS > 0);
  /* and Tokyo, on the night side during 2026-08-12, is not told it sees anything */
  const tokyo = P.localCircumstances(paths['2026-08-12'].ms, 35.6895, 139.6917);
  assert.equal(tokyo.visible, null);
});

test('ΔT: the polynomial is the one NASA\'s catalogue used', () => {
  for (const n of Object.values(NASA)) {
    const y = new Date(Date.parse(n.td)).getUTCFullYear() + 0.5;
    assert.ok(Math.abs(P.deltaTSeconds(y) - n.dT) <= 1, `ΔT(${y}) ${P.deltaTSeconds(y).toFixed(1)} vs NASA ${n.dT}`);
  }
});

/* ── lunar eclipses from here ───────────────────────────────────────────────────────────────────── */
test('local eclipses: the total lunar eclipse of 2025-09-07 is seen from Tokyo and not from New York', () => {
  /* NASA LEdecade2021: 2025 Sep 07, greatest 18:12:58 TD, total, umbral magnitude 1.362.
     js/space-events.js times carry the same Sun error and, in addition, no solar aberration (20.5″),
     so the tolerance is (35 + 6 + 20.5)″ / 0.508″/s ≈ 2 min, + ΔT. */
  const from = Date.parse('2025-09-01T00:00:00Z');
  const [tk] = A.localEclipses({ lat: 35.6895, lng: 139.6917, from, count: 1, type: 'lunar' });
  assert.equal(tk.kind, 'total');
  const ut = Date.parse('2025-09-07T18:12:58Z') - P.deltaTSeconds(2025.7) * 1000;
  assert.ok(Math.abs(tk.maxMs - ut) <= ((SUN_ERR_AS + MOON_ERR_AS + 20.5) / REL_RATE_AS_PER_S + 5) * 1000, `greatest ${new Date(tk.maxMs).toISOString()}`);
  assert.ok(Math.abs(tk.magnitude - 1.362) < 0.02, `umbral magnitude ${tk.magnitude.toFixed(3)} vs 1.362`);
  assert.ok(tk.visibleHere && tk.aboveHorizonAtMax, 'the Moon is up in Tokyo at 03:12 JST');
  assert.ok(tk.daysUntil > 6 && tk.daysUntil < 7);
  const c = tk.contacts;
  assert.ok(c.p1 < c.u1 && c.u1 < c.u2 && c.u2 < c.max && c.max < c.u3 && c.u3 < c.u4 && c.u4 < c.p4, 'contacts in order');
  /* NASA: totality 01h22m — from the module's own contacts */
  assert.ok(Math.abs((c.u3 - c.u2) / MIN - 82) < 3, `totality ${((c.u3 - c.u2) / MIN).toFixed(1)} min vs 82`);
  const [ny] = A.localEclipses({ lat: 40.7128, lng: -74.006, from, count: 1, type: 'lunar' });
  assert.equal(ny.maxMs, tk.maxMs, 'the same eclipse');
  assert.equal(ny.visibleHere, false, 'at 14:12 EDT the Moon is below New York\'s horizon');
});

test('local eclipses: "how many days until the next total lunar eclipse I can see" has an answer', () => {
  const from = Date.parse('2026-11-17T00:00:00Z');
  const [e] = A.localEclipses({ lat: 35.6895, lng: 139.6917, from, count: 1, type: 'lunar', kind: 'total', visibleOnly: true });
  assert.ok(e, 'one is found');
  assert.equal(e.kind, 'total'); assert.equal(e.visibleHere, true);
  /* NASA LEdecade2021: 2028 Dec 31 total lunar eclipse — the next total after 2026-11-17 (2027 and early
     2028 have only penumbral and partial ones) */
  assert.equal(new Date(e.maxMs).toISOString().slice(0, 10), '2028-12-31');
  assert.ok(Math.abs(e.daysUntil - (e.maxMs - from) / 86400000) < 1e-9);
});
