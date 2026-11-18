/* ============================================================================
 *  IntMap · ONE PLACE, ONE NIGHT — window.IntMapAlmanac
 * ----------------------------------------------------------------------------
 *  What the sky does over one point of the Earth on one night: when the Sun, the Moon and the planets
 *  rise, culminate and set, how dark it gets and for how long, which meteor showers are active and how
 *  high their radiants climb, and which eclipses are coming and whether they can be seen from here.
 *
 *  PURE ARITHMETIC — no DOM, no drawing, no strings for the reader beyond the en/jp NAME of a phase or a
 *  shower. Every position comes from the app's own ephemeris (js/ephemeris.js), every sidereal angle
 *  from js/space-sky.js `gmstDeg`, every phase and eclipse search from js/space-events.js, the solar
 *  eclipse geometry and ΔT from js/space-eclipse-path.js. What is new here is only what none of those
 *  computes: rise/set/transit by search, twilight, the night window, planetary magnitudes, the meteor
 *  shower list and the lunar-eclipse contacts.
 *
 *  ── WHICH "DAY" ─────────────────────────────────────────────────────────────────────────────────
 *  The window is NOON TO NOON, and noon is the Sun's real upper transit at this place, not 12:00 of a
 *  time zone and not mean solar time from the longitude: the window is [the last transit at or before
 *  `when`, the next transit after it). One window therefore holds exactly one evening and one morning —
 *  the night an observer means by "tonight" — and never splits it at midnight. A caller who wants "the
 *  night of date D" passes any instant in the afternoon of D.
 *
 *  ── RISING AND SETTING (Meeus, Astronomical Algorithms, ch. 15) ─────────────────────────────────
 *  An event is the instant the GEOMETRIC altitude of the centre crosses a standard altitude h0:
 *    Sun      h0 = −0°50′  (refraction at the horizon 34′ + the Sun's semidiameter 16′)
 *    Moon     h0 = 0.7275·π − 0°34′   (π = the Moon's horizontal parallax: the parallax lifts the
 *                                     geocentric Moon above where a surface observer sees it, and
 *                                     0.7275 = 1 − 0.2725 folds in its semidiameter)
 *    planets  h0 = −0°34′
 *  An observer above sea level (`elevM`) also sees past the geometric horizon by the dip, 1.76′·√h(m)
 *  (the Nautical Almanac's dip formula, refraction included), which lowers every h0. The National
 *  Astronomical Observatory of Japan's tables are for 0 m, as is this file's default.
 *  Search: altitudes sampled every 5 minutes across the window, every sign change refined by bisection
 *  to under a second. Five minutes is shorter than any rise-to-set interval the Moon or a planet can
 *  have away from the polar grazing case, where a pair of crossings closer than that can be missed — the
 *  body then barely touches the horizon and the miss is minutes of grazing, which this file reports as
 *  no event rather than inventing one.
 *
 *  ⚠ TIME SCALES. The ephemeris is evaluated at TT = UT + ΔT (js/space-eclipse-path.js `jdTT`), the
 *  sidereal angle at UT. js/space-events.js feeds UT straight to the ephemeris, so the instants IT
 *  returns are TT-valued; every one this file takes from it (phases, lunar eclipses) is moved back by ΔT
 *  (≈ 70 s today) before it is returned. That is a real offset, not a rounding.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import './ephemeris.js';
import './space-events.js';
import './space-sky.js';
import { deltaTSeconds, jdTT, localCircumstances } from './space-eclipse-path.js';
import { IntMapSpaceEvents } from './space-events.js';

const EPH = () => window.IntMapEphemeris;
const EVT = () => IntMapSpaceEvents;
const SKY = () => window.IntMapSky;
const D2R = Math.PI / 180, R2D = 180 / Math.PI, DAY = 86400000, HOUR = 3600000, MIN = 60000;
const wrap180 = (d) => ((d + 180) % 360 + 360) % 360 - 180;
const wrap360 = (d) => ((d % 360) + 360) % 360;
const yearOf = (ms) => 1970 + ms / (365.2425 * DAY);
/* a TT-valued Julian day turned into ms by js/ephemeris.js msOfJD → UTC. js/space-events.js computes in TT and hands
   back `jd` in TT but `ms` (and nextPhase) already in UTC — so only a jd goes through here, never an events `ms`. */
const ttMsToUtc = (ms) => (ms == null ? null : ms - deltaTSeconds(yearOf(ms)) * 1000);

/* ── the sky at an instant ─────────────────────────────────────────────────────────────────────── */
function eqOf(id, ms) { return EPH().equatorial(id, jdTT(ms)); }
/** geometric altitude (°) of a direction of date (RA/Dec, degrees) from (lat, lng) at a UTC instant */
function altitudeOf(raDeg, decDeg, ms, lat, lng) {
  const H = (SKY().gmstDeg(ms) + lng - raDeg) * D2R, d = decDeg * D2R, p = lat * D2R;
  return Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H)) * R2D;
}
const hourAngle = (raDeg, ms, lng) => wrap180(SKY().gmstDeg(ms) + lng - raDeg);
function bodyAlt(id, ms, lat, lng) { const q = eqOf(id, ms); return altitudeOf(q.raDeg, q.decDeg, ms, lat, lng); }
/* the Moon's horizontal parallax (°), for its h0 */
function moonParallax(ms) { const g = EPH().geocentric('moon', jdTT(ms)); return Math.asin(6378.14 / (g.distAU * EPH().AU_KM)) * R2D; }

const REFR = 34 / 60;                      /* refraction at the horizon, Meeus ch. 15 */
const dipDeg = (elevM) => (elevM > 0 ? (1.76 / 60) * Math.sqrt(elevM) : 0);
function h0Of(id, ms, elevM) {
  const dip = dipDeg(elevM);
  if (id === 'sun') return -(REFR + 16 / 60) - dip;
  if (id === 'moon') return 0.7275 * moonParallax(ms) - REFR - dip;
  return -REFR - dip;
}

/* ── search ────────────────────────────────────────────────────────────────────────────────────── */
function bisect(f, a, b, tol) {
  let fa = f(a);
  for (let i = 0; i < 80 && b - a > tol; i++) { const m = (a + b) / 2, fm = f(m); if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}
/** every sign change of f in [a,b], as {t, up} (up = from negative to positive) */
function crossings(f, a, b, step) {
  const out = []; let t0 = a, f0 = f(a);
  for (let t = a + step; t <= b + 1e-6; t += step) {
    const t1 = Math.min(t, b), f1 = f(t1);
    if ((f0 < 0) !== (f1 < 0)) out.push({ t: bisect(f, t0, t1, 500), up: f1 >= 0 });
    t0 = t1; f0 = f1;
  }
  return out;
}
function maxOf(f, a, b, step) {
  let best = a, fb = -Infinity;
  for (let t = a; t <= b; t += step) { const v = f(t); if (v > fb) { fb = v; best = t; } }
  /* golden section around the best sample */
  let lo = Math.max(a, best - step), hi = Math.min(b, best + step);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40 && hi - lo > 1000; i++) {
    const c = hi - g * (hi - lo), d = lo + g * (hi - lo);
    if (f(c) > f(d)) hi = d; else lo = c;
  }
  const t = (lo + hi) / 2, v = f(t);
  return v >= fb ? { t, v } : { t: best, v: fb };
}
const STEP = 5 * MIN;

/* upper transits (hour angle crossing 0 from − to +) of a body in [a,b] */
function transits(id, a, b, lng) {
  const f = (t) => hourAngle(eqOf(id, t).raDeg, t, lng);
  /* a wrap of the hour angle from +180 to −180 is a sign change too; keep only the − → + ones near 0 */
  return crossings(f, a, b, STEP).filter((c) => c.up && Math.abs(f(c.t)) < 1);
}
/* rise, set and transit of a body inside a window (the first of each), plus whether it never crossed */
function riseSet(id, from, to, lat, lng, elevM) {
  const f = (t) => bodyAlt(id, t, lat, lng) - h0Of(id, t, elevM);
  const cs = crossings(f, from, to, STEP);
  const rise = cs.find((c) => c.up), set = cs.find((c) => !c.up);
  const tr = transits(id, from, to, lng)[0];
  let always = null;
  if (!cs.length) always = f(from) > 0 ? 'up' : 'down';
  return { rise: rise ? rise.t : null, set: set ? set.t : null, transit: tr ? tr.t : null, always, crossings: cs };
}

/* ── the night window ──────────────────────────────────────────────────────────────────────────── */
function nightWindow(when, lng) {
  const before = transits('sun', when - 26 * HOUR, when, lng), after = transits('sun', when + 1, when + 26 * HOUR, lng);
  const from = before.length ? before[before.length - 1].t : null, to = after.length ? after[0].t : null;
  return { from, to, basis: 'solar upper transit to the next solar upper transit at this longitude' };
}
/* the Sun crossing a fixed altitude: evening (downward) and morning (upward) inside the window */
function sunCrossing(win, lat, lng, alt) {
  const f = (t) => bodyAlt('sun', t, lat, lng) - alt;
  const cs = crossings(f, win.from, win.to, STEP);
  const dusk = cs.find((c) => !c.up), dawn = [...cs].reverse().find((c) => c.up);
  return { dusk: dusk ? dusk.t : null, dawn: dawn ? dawn.t : null, below: !cs.length && f(win.from) < 0, above: !cs.length && f(win.from) >= 0 };
}
/* an interval the Sun spends below `alt`, the evening crossing to the morning one; the whole window when
   it never comes up through that altitude; null when it never gets that low */
function darkBelow(win, lat, lng, alt) {
  const c = sunCrossing(win, lat, lng, alt);
  if (c.below) return { from: win.from, to: win.to, sunBelowDeg: alt };
  if (c.above || c.dusk == null || c.dawn == null || c.dawn <= c.dusk) return null;
  return { from: c.dusk, to: c.dawn, sunBelowDeg: alt };
}

/* ── the Moon ──────────────────────────────────────────────────────────────────────────────────── */
/* the eight phase names. The four principal phases are INSTANTS; a night is called by one of them when
   it is within ±1 day of it, i.e. while the Sun–Moon elongation in longitude is within 12.19° (the mean
   synodic motion, 360°/29.530589 d) of 0/90/180/270°. That ±1 day is a naming convention, stated here
   rather than hidden in a threshold. */
const SYN_DEG_PER_DAY = 360 / 29.530589;
/* the names are held as pickArgs() tuples [en, jp]; the API below still hands out {en, jp} */
const LA = IntMapLang.pickArgs();   /* in Node pickArgs() returns the array it is handed (js/lang-registry.js) */
const PHASES = [
  { at: 0, nm: LA('New Moon', '新月') }, { at: 45, nm: LA('Waxing Crescent', '三日月') },
  { at: 90, nm: LA('First Quarter', '上弦の月') }, { at: 135, nm: LA('Waxing Gibbous', '十三夜月') },
  { at: 180, nm: LA('Full Moon', '満月') }, { at: 225, nm: LA('Waning Gibbous', '寝待月') },
  { at: 270, nm: LA('Last Quarter', '下弦の月') }, { at: 315, nm: LA('Waning Crescent', '有明月') },
];
function phaseName(D) {
  for (const p of PHASES) if (p.at % 90 === 0 && Math.abs(wrap180(D - p.at)) <= SYN_DEG_PER_DAY) return { en: p.nm[0], jp: p.nm[1] };
  const i = D < 90 ? 1 : D < 180 ? 3 : D < 270 ? 5 : 7;
  return { en: PHASES[i].nm[0], jp: PHASES[i].nm[1] };
}
/** illumination, phase angle and the Sun–Moon elongation in longitude at an instant (Meeus ch. 48) */
function moonPhase(ms) {
  const jd = jdTT(ms), m = EPH().geocentric('moon', jd), s = EPH().geocentric('sun', jd);
  const AU = EPH().AU_KM, R = s.distAU * AU, Dm = m.distAU * AU;
  const psi = Math.acos(Math.cos(m.latDeg * D2R) * Math.cos((m.lonDeg - s.lonDeg) * D2R));
  const i = Math.atan2(R * Math.sin(psi), Dm - R * Math.cos(psi));
  return { illumination: (1 + Math.cos(i)) / 2, phaseAngleDeg: i * R2D, elongLonDeg: wrap360(m.lonDeg - s.lonDeg) };
}
function lastNewMoon(when) {
  let t = EVT().nextPhase(when - 32 * DAY, 0);
  for (let k = 0; k < 3 && t != null; k++) {
    const n = EVT().nextPhase(t + DAY, 0);
    if (n == null || n > when) break;
    t = n;
  }
  return t;
}

/* ── planetary magnitudes ──────────────────────────────────────────────────────────────────────────
   The Astronomical Almanac (1984) expressions as given by Meeus, Astronomical Algorithms (2nd ed.)
   ch. 41: V = constant + 5·log10(r·Δ) + a phase polynomial in the phase angle i (degrees), with Saturn's
   rings entering through B (the ring tilt to the Earth) and ΔU (the difference of the Saturnicentric
   longitudes of the Sun and the Earth in the ring plane).
   ⚠ Mallama & Hilton (2018, Astronomy and Computing 25:10) is the newer fit the Astronomical Almanac now
   uses; its constants differ from these by ~0.1 mag for most planets and it adds terms (Mars'
   rotation, Uranus' sub-latitude) this file does not carry. The 1984 set is kept because every
   coefficient of it can be stated here with its source; the 0.1 mag is below what the eye in a
   twilight sky can tell, and the value is labelled `magnitudeSource` so no reader takes it for the
   newer one. */
const MAG = {
  mercury: (i) => -0.42 + 0.0380 * i - 0.000273 * i * i + 0.000002 * i ** 3,
  venus: (i) => -4.40 + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3,
  mars: (i) => -1.52 + 0.016 * i,
  jupiter: (i) => -9.40 + 0.005 * i,
  uranus: () => -7.19,
  neptune: () => -6.87,
};
function planetMagnitude(id, ms) {
  const E = EPH(), jd = jdTT(ms);
  const P = E.heliocentric(id, jd), Ea = E.heliocentric('earth', jd);
  const v = [P.x - Ea.x, P.y - Ea.y, P.z - Ea.z], r = P.r, D = Math.hypot(v[0], v[1], v[2]), R = Ea.r;
  const i = Math.acos(Math.max(-1, Math.min(1, (r * r + D * D - R * R) / (2 * r * D)))) * R2D;
  const base = 5 * Math.log10(r * D);
  if (id === 'saturn') {
    /* B and ΔU from the IAU pole (js/ephemeris.js poleVector, J2000 ecliptic — the frame P and Ea are in) */
    const pole = E.poleVector('saturn', jd);
    const toE = [-v[0] / D, -v[1] / D, -v[2] / D], toS = [-P.x / r, -P.y / r, -P.z / r];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const B = Math.asin(dot(toE, pole));
    const inPlane = (u) => { const k = dot(u, pole); const w = [u[0] - k * pole[0], u[1] - k * pole[1], u[2] - k * pole[2]]; const n = Math.hypot(...w); return w.map((x) => x / n); };
    const dU = Math.acos(Math.max(-1, Math.min(1, dot(inPlane(toE), inPlane(toS))))) * R2D;
    const sB = Math.sin(Math.abs(B));
    return { mag: -8.88 + base + 0.044 * dU - 2.60 * sB + 1.25 * sB * sB, phaseAngleDeg: i, ringTiltDeg: B * R2D };
  }
  return { mag: MAG[id](i) + base, phaseAngleDeg: i };
}
const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

/* ══ METEOR SHOWERS ════════════════════════════════════════════════════════════════════════════════
   SOURCE. International Meteor Organization, "2026 Meteor Shower Calendar", ed. J. Rendtel, IMO INFO(3-25)
   (36th edition): Table 5, "Working List of Visual Meteor Showers" — "correct according to the best
   information available in June 2025" — and Table 6, "Radiant positions during the year". Read from the
   PDF at imo.net (files/meteor-shower/cal2026.pdf) on 2026-11-17; nothing below is from memory.

   WHICH SHOWERS. IMO's working list has no formal "major" class; these are the eleven annual showers
   the request enumerated (QUA LYR ETA SDA PER ORI STA NTA LEO GEM URS), every one of which has its row
   in Table 5. The other 26 rows of the working list (ZHR ≤ 10 or variable) are not carried.

   WHAT IS STORED, AS PUBLISHED:
     · `lambdaMax` — the solar longitude of maximum, J2000.0 (IMO's convention), exactly as printed. The
       DATE of maximum in any year is COMPUTED from it (`peakOf`), never stored.
     · `active` — the activity dates as printed (month-day). The calendar states them as dates for 2026;
       their solar longitudes are computed from 2026 (`ACTIVE_REF_YEAR`). A date is ±0.5 d ≈ ±0.5° of λ☉.
     · `radiant` — α, δ (J2000) at maximum, Table 5; `drift` — Table 6's 5-day positions for the same
       shower, interpolated in λ☉ so a radiant on a night far from the peak is where IMO puts it.
       ⚠ Table 6's printed layout is multi-column and its text extraction lost column alignment in places;
       every drift point kept below continues its neighbours by ≤ 11° and passes through the Table 5
       maximum. One cell was DROPPED as unattributable: the 85 +23 printed on Dec 5 in the column that holds
       the Northern Taurids until Nov 30 and the Antihelion source from Dec 10 (an 11° jump from the
       previous NTA point where every other step is ≤ 5°).
     · `zhr`, `vInf` (km/s), `r` (population index) — Table 5.
     · `parent` with `parentSource` — see ⚠ PARENTS below the table: the calendar names some parents and not
       others, and the field says which.
   EXPIRY. The ZHRs are "based on recent observed returns" and the maxima are "accurate only for 2026"
   (the calendar's own words): λ☉ maxima move by hundredths of a degree a year, so peak DATES computed
   for other years are good to the ±0.5 d IMO itself works at, and the table should be refreshed from
   each year's calendar. */
const IMO_EDITION = 'IMO 2026 Meteor Shower Calendar (Rendtel, IMO INFO(3-25)), Tables 5–6';
const ACTIVE_REF_YEAR = 2026;
const SHOWERS = [
  { code: 'QUA', iau: 10, nm: LA('Quadrantids', 'しぶんぎ座流星群'), active: ['12-28', '01-12'], lambdaMax: 283.15,
    radiant: [230, 49], vInf: 41, r: 2.1, zhr: 80, parent: '2003 EH1',
    drift: [['12-30', 226, 50], ['12-31', 228, 50], ['01-05', 231, 49], ['01-10', 234, 48]] },
  { code: 'LYR', iau: 6, nm: LA('April Lyrids', '4月こと座流星群'), active: ['04-14', '04-30'], lambdaMax: 32.32,
    radiant: [271, 34], vInf: 49, r: 2.1, zhr: 18, parent: 'C/1861 G1 (Thatcher)',
    drift: [['04-15', 263, 34], ['04-20', 269, 34], ['04-25', 274, 34], ['04-30', 279, 34]] },
  { code: 'ETA', iau: 31, nm: LA('η-Aquariids', 'みずがめ座η流星群'), active: ['04-19', '05-28'], lambdaMax: 45.5,
    radiant: [338, -1], vInf: 66, r: 2.4, zhr: 50, parent: '1P/Halley',
    drift: [['04-20', 323, -7], ['04-25', 328, -5], ['04-30', 332, -3], ['05-05', 337, -1], ['05-10', 341, 1],
      ['05-15', 345, 3], ['05-20', 349, 5], ['05-25', 353, 7]] },
  { code: 'SDA', iau: 5, nm: LA('Southern δ-Aquariids', 'みずがめ座δ南流星群'), active: ['07-12', '08-23'], lambdaMax: 128,
    radiant: [340, -16], vInf: 41, r: 2.5, zhr: 25, parent: null,
    drift: [['07-10', 325, -19], ['07-15', 329, -19], ['07-20', 333, -18], ['07-25', 337, -17], ['07-30', 340, -16],
      ['08-05', 345, -14], ['08-10', 349, -13], ['08-15', 352, -12], ['08-20', 356, -11]] },
  { code: 'PER', iau: 7, nm: LA('Perseids', 'ペルセウス座流星群'), active: ['07-17', '08-24'], lambdaMax: 140.0,
    radiant: [48, 58], vInf: 59, r: 2.2, zhr: 100, parent: '109P/Swift–Tuttle',
    drift: [['07-15', 6, 50], ['07-20', 11, 52], ['07-25', 22, 53], ['07-30', 29, 54], ['08-05', 37, 56],
      ['08-10', 45, 57], ['08-15', 51, 58], ['08-20', 57, 58], ['08-25', 63, 58]] },
  { code: 'ORI', iau: 8, nm: LA('Orionids', 'オリオン座流星群'), active: ['10-02', '11-07'], lambdaMax: 208,
    radiant: [95, 16], vInf: 66, r: 2.5, zhr: 20, parent: '1P/Halley',
    drift: [['10-05', 85, 14], ['10-10', 88, 15], ['10-15', 91, 15], ['10-20', 94, 16], ['10-25', 98, 16],
      ['10-30', 101, 16], ['11-05', 105, 17]] },
  { code: 'STA', iau: 2, nm: LA('Southern Taurids', 'おうし座南流星群'), active: ['09-20', '11-20'], lambdaMax: 223,
    radiant: [52, 15], vInf: 27, r: 2.3, zhr: 7, parent: '2P/Encke',
    drift: [['09-20', 18, 5], ['09-25', 21, 6], ['09-30', 25, 7], ['10-05', 28, 8], ['10-10', 32, 9], ['10-15', 36, 11],
      ['10-20', 40, 12], ['10-25', 43, 13], ['10-30', 47, 14], ['11-05', 52, 15], ['11-10', 56, 15], ['11-15', 60, 16],
      ['11-20', 64, 16]] },
  { code: 'NTA', iau: 17, nm: LA('Northern Taurids', 'おうし座北流星群'), active: ['10-20', '12-10'], lambdaMax: 230,
    radiant: [58, 22], vInf: 29, r: 2.3, zhr: 5, parent: '2P/Encke',
    drift: [['10-20', 38, 18], ['10-25', 43, 19], ['10-30', 47, 20], ['11-05', 52, 21], ['11-10', 56, 22],
      ['11-15', 61, 23], ['11-20', 65, 24], ['11-25', 70, 24], ['11-30', 74, 24]] },
  { code: 'LEO', iau: 13, nm: LA('Leonids', 'しし座流星群'), active: ['11-06', '11-30'], lambdaMax: 235.27,
    radiant: [152, 22], vInf: 71, r: 2.5, zhr: 15, parent: '55P/Tempel–Tuttle',
    drift: [['11-10', 147, 24], ['11-15', 150, 23], ['11-20', 153, 21], ['11-25', 156, 20], ['11-30', 159, 19]] },
  { code: 'GEM', iau: 4, nm: LA('Geminids', 'ふたご座流星群'), active: ['12-04', '12-20'], lambdaMax: 262.2,
    radiant: [112, 33], vInf: 35, r: 2.6, zhr: 150, parent: '(3200) Phaethon',
    drift: [['12-05', 103, 33], ['12-10', 108, 33], ['12-15', 113, 33], ['12-20', 118, 32]] },
  { code: 'URS', iau: 15, nm: LA('Ursids', 'こぐま座流星群'), active: ['12-17', '12-26'], lambdaMax: 270.7,
    radiant: [217, 76], vInf: 33, r: 2.8, zhr: 10, parent: '8P/Tuttle',
    drift: [['12-20', 217, 76], ['12-25', 217, 74]] },
];
/* ⚠ PARENTS. Searched in the 2026 calendar's text: it names C/1861 G1 (Thatcher) for the Lyrids, 109P/Swift–Tuttle
   for the Perseids, 2P/Encke for both Taurid branches and 55P/Tempel–Tuttle for the Leonids — those four
   carry parentSource 'IMO 2026 calendar'. It does NOT name the parents of the Quadrantids (2003 EH1), the
   η-Aquariids and Orionids (1P/Halley), the Geminids ((3200) Phaethon) or the Ursids (8P/Tuttle); those are
   the standard associations of Jenniskens (2006, the reference the calendar itself cites), written here
   from general knowledge and NOT re-read from that book for this file — parentSource says exactly that.
   The Southern δ-Aquariids' parent is still argued (96P/Machholz is the usual candidate) and is null. */
const PARENT_IMO = 'IMO 2026 calendar', PARENT_STD = 'standard association (Jenniskens 2006) — not in the IMO 2026 calendar, not re-verified here';
const PARENT_SOURCE = { QUA: PARENT_STD, LYR: PARENT_IMO, ETA: PARENT_STD, SDA: null, PER: PARENT_IMO, ORI: PARENT_STD,
  STA: PARENT_IMO, NTA: PARENT_IMO, LEO: PARENT_IMO, GEM: PARENT_STD, URS: PARENT_STD };

/** the Sun's ecliptic longitude, J2000.0 (IMO's λ☉), at a UTC instant */
function solarLongitudeJ2000(ms) {
  const jd = jdTT(ms);
  return wrap360(EPH().geocentric('sun', jd).lonDeg - EPH().precessLonDeg(jd));
}
const mdMs = (year, md) => { const [m, d] = md.split('-').map(Number); return Date.UTC(year, m - 1, d); };
/* the instant in [Jan 1 of `year`, Jan 1 of year+1) at which λ☉ = target (λ☉ increases ~0.9856°/d) */
function instantOfLongitude(year, target) {
  const a = Date.UTC(year, 0, 1), b = Date.UTC(year + 1, 0, 1);
  const lam0 = solarLongitudeJ2000(a);
  const ahead = (t) => wrap360(solarLongitudeJ2000(t) - lam0);      /* 0 → ~360 monotonic over the year */
  const goal = wrap360(target - lam0);
  if (goal >= ahead(b - 1)) return null;                             /* falls past the year's last instant */
  return bisect((t) => ahead(t) - goal, a, b - 1, 1000);
}
function inArc(lam, a, b) { const span = wrap360(b - a); return wrap360(lam - a) <= span; }
/* the radiant (α, δ J2000) at a solar longitude, from the drift table — linear in λ☉ between points,
   held at the end points outside them, the Table 5 position when no drift is printed */
function radiantAt(sh, lam) {
  const pts = sh.drift.map(([md, a, d]) => [solarLongitudeJ2000(mdMs(ACTIVE_REF_YEAR, md)), a, d]);
  if (!pts.length) return sh.radiant;
  const rel = (l) => wrap180(l - sh.lambdaMax);
  const x = rel(lam), xs = pts.map((p) => rel(p[0]));
  if (x <= xs[0]) return [pts[0][1], pts[0][2]];
  for (let i = 1; i < pts.length; i++) {
    if (x <= xs[i]) {
      const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      const da = wrap180(pts[i][1] - pts[i - 1][1]);
      return [wrap360(pts[i - 1][1] + f * da), pts[i - 1][2] + f * (pts[i][2] - pts[i - 1][2])];
    }
  }
  return [pts[pts.length - 1][1], pts[pts.length - 1][2]];
}
/* J2000 → of date, for an altitude: general precession in longitude, applied as a rotation about the
   ecliptic pole (the same quantity js/ephemeris.js applies to everything it hands out as of-date) */
function radiantOfDate(raDeg, decDeg, ms) {
  const E = EPH(), jd = jdTT(ms);
  const e = E.obliquityDeg(jd) * D2R, a = raDeg * D2R, d = decDeg * D2R;
  const lon = Math.atan2(Math.sin(a) * Math.cos(e) + Math.tan(d) * Math.sin(e), Math.cos(a)) * R2D;
  const lat = Math.asin(Math.sin(d) * Math.cos(e) - Math.cos(d) * Math.sin(e) * Math.sin(a)) * R2D;
  return E.eclToEq(lon + E.precessLonDeg(jd), lat, jd);
}

/**
 * The eleven showers of the list above for one year, with the instant of maximum computed from λ☉.
 * @param {number} year
 * @returns {Array<{code,iau,name:{en,jp},peakMs:number|null,lambdaMax:number,active:{from:string,to:string,
 *   lambdaFrom:number,lambdaTo:number},radiant:{raDeg,decDeg},zhr,vInf,r,parent,source}>}
 */
function meteorShowers(year) {
  return SHOWERS.map((sh) => {
    const lf = solarLongitudeJ2000(mdMs(ACTIVE_REF_YEAR, sh.active[0])), lt = solarLongitudeJ2000(mdMs(ACTIVE_REF_YEAR, sh.active[1]));
    return {
      code: sh.code, iau: sh.iau, name: { en: sh.nm[0], jp: sh.nm[1] },
      peakMs: instantOfLongitude(+year, sh.lambdaMax), lambdaMax: sh.lambdaMax,
      active: { from: sh.active[0], to: sh.active[1], lambdaFrom: lf, lambdaTo: lt },
      radiant: { raDeg: sh.radiant[0], decDeg: sh.radiant[1], equinox: 'J2000' },
      zhr: sh.zhr, vInf: sh.vInf, r: sh.r, parent: sh.parent, parentSource: PARENT_SOURCE[sh.code], source: IMO_EDITION,
    };
  });
}

/* ══ ECLIPSES FROM HERE ═══════════════════════════════════════════════════════════════════════════ */
/* the contacts of a lunar eclipse: the instants the Moon's limb meets the penumbra and the umbra
   (Meeus ch. 54 radii from js/space-events.js shadowRadii). jd/returns are TT-valued like the module's. */
function lunarContacts(jdMax) {
  const EV = EVT();
  const g = (which, sign) => (jd) => { const R = EV.shadowRadii(jd); return EV.shadowSep(jd) - (R[which] + sign * R.moonSemi); };
  const pair = (f) => {
    if (f(jdMax) >= 0) return [null, null];
    let a = jdMax; while (a > jdMax - 0.3 && f(a) < 0) a -= 1 / 96;
    let b = jdMax; while (b < jdMax + 0.3 && f(b) < 0) b += 1 / 96;
    return [bisect((x) => -f(x), a, a + 1 / 96, 1e-6), bisect(f, b - 1 / 96, b, 1e-6)];
  };
  const [p1, p4] = pair(g('penumbra', 1)), [u1, u4] = pair(g('umbra', 1)), [u2, u3] = pair(g('umbra', -1));
  const ms = (jd) => (jd == null ? null : ttMsToUtc(EPH().msOfJD(jd)));
  return { p1: ms(p1), u1: ms(u1), u2: ms(u2), max: ms(jdMax), u3: ms(u3), u4: ms(u4), p4: ms(p4) };
}
function lunarLocal(ev, lat, lng, elevM) {
  const c = lunarContacts(ev.jd);
  const up = (t) => bodyAlt('moon', t, lat, lng) - h0Of('moon', t, elevM);
  const altMax = bodyAlt('moon', c.max, lat, lng);
  /* the stretch that counts as "the eclipse": the umbral phase if there is one, else the penumbral */
  const a = c.u1 != null ? c.u1 : c.p1, b = c.u4 != null ? c.u4 : c.p4;
  let seen = null;
  if (a != null && b != null) {
    for (let t = a; t <= b; t += 2 * MIN) if (up(t) > 0) { seen = t; break; }
    if (seen == null && up(b) > 0) seen = b;
  }
  return {
    type: 'lunar', kind: ev.kind, maxMs: c.max, magnitude: ev.umbraMag, penumbralMagnitude: ev.penMag,
    contacts: c, moonAltAtMaxDeg: altMax,
    aboveHorizonAtMax: up(c.max) > 0,
    visibleDuringEclipse: seen != null,
    visibleHere: up(c.max) > 0 || seen != null,
    /* the phase used for "during": umbral when the eclipse has one */
    visibilityPhase: c.u1 != null ? 'umbral' : 'penumbral',
  };
}
function solarLocal(ev, lat, lng, elevM) {
  const seed = ev.ms;
  const lc = localCircumstances(seed, lat, lng, elevM);
  /* an eclipse the Moon's shadow never brings to this place is still listed — "not from here" is an answer */
  const reaches = lc.c1 != null;
  return {
    type: 'solar', kind: ev.kind, globalMaxMs: seed, maxMs: reaches ? lc.max : seed,
    magnitude: reaches ? lc.magnitude : 0, obscuration: lc.obscuration,
    localKind: lc.kind, contacts: { c1: lc.c1, c2: lc.c2, max: lc.max, c3: lc.c3, c4: lc.c4 },
    sunAltAtMaxDeg: reaches ? lc.sunAltAtMax : null, durationS: lc.durationS,
    /* what is seen with the Sun above the horizon (js/space-eclipse-path.js localCircumstances `visible`) */
    visible: lc.visible,
    visibleHere: !!lc.visible,
  };
}
/**
 * The next eclipses after `from`, as seen from one place.
 * @param {{lat:number,lng:number,from?:number,count?:number,type?:'lunar'|'solar',kind?:string,
 *          visibleOnly?:boolean,elevM?:number,horizonYears?:number}} o
 *   `kind` filters on the GLOBAL kind ('total','partial','penumbral','annular'); `visibleOnly` keeps those
 *   seen from here. The search runs a year at a time up to `horizonYears` (default 30 — a backstop that
 *   ends the scan when a filter cannot be met, not a statement about eclipses).
 * @returns {Array<object>} each with `daysUntil` (from `from` to the local maximum)
 */
function localEclipses(o) {
  o = o || {};
  const lat = +o.lat, lng = +o.lng, from = o.from != null ? +o.from : Date.now(), count = o.count || 1;
  const horizon = o.horizonYears || 30, elevM = +o.elevM || 0;
  const out = [];
  for (let y = 0; y < horizon && out.length < count; y++) {
    const start = from + y * 365.25 * DAY;
    const evs = [];
    if (o.type !== 'solar') for (const e of EVT().eclipses(start, 365.25, false)) evs.push(e);
    if (o.type !== 'lunar') for (const e of EVT().eclipses(start, 365.25, true)) evs.push(e);
    evs.sort((a, b) => a.jd - b.jd);
    for (const e of evs) {
      if (o.kind && e.kind !== o.kind) continue;
      const r = e.solar ? solarLocal(e, lat, lng, elevM) : lunarLocal(e, lat, lng, elevM);
      if (r.maxMs == null || r.maxMs < from) continue;
      if (o.visibleOnly && !r.visibleHere) continue;
      r.daysUntil = (r.maxMs - from) / DAY;
      out.push(r);
      if (out.length >= count) break;
    }
  }
  return out;
}

/* ══ THE ALMANAC ══════════════════════════════════════════════════════════════════════════════════ */
/**
 * @param {{lat:number,lng:number,when:number,elevM?:number}} o   when = UTC ms
 */
function almanac(o) {
  const lat = +o.lat, lng = +o.lng, when = o.when != null ? +o.when : Date.now(), elevM = +o.elevM || 0;
  const win = nightWindow(when, lng);
  if (win.from == null || win.to == null) return { window: win, reason: 'no solar transit found around this instant' };

  /* the Sun */
  const s = riseSet('sun', win.from, win.to, lat, lng, elevM);
  const tw = (alt) => { const c = sunCrossing(win, lat, lng, alt); return { dusk: c.dusk, dawn: c.dawn }; };
  const sun = {
    rise: [...s.crossings].reverse().find((c) => c.up)?.t ?? null,
    set: s.crossings.find((c) => !c.up)?.t ?? null,
    transit: win.from, nextTransit: win.to,
    civil: tw(-6), nautical: tw(-12), astronomical: tw(-18),
    polar: s.always === 'up' ? 'day' : s.always === 'down' ? 'night' : null,
  };
  /* darkness: strictly astronomical for `dark`; the darkest available band for what is observed */
  const dark = darkBelow(win, lat, lng, -18);
  const observing = dark || darkBelow(win, lat, lng, -12) || darkBelow(win, lat, lng, -6)
    || darkBelow(win, lat, lng, h0Of('sun', win.from, elevM));

  /* the Moon */
  const mr = riseSet('moon', win.from, win.to, lat, lng, elevM), ph = moonPhase(when);
  const nm = lastNewMoon(when);
  const moon = {
    rise: mr.rise, set: mr.set, transit: mr.transit, always: mr.always,
    illumination: ph.illumination, phaseAngleDeg: ph.phaseAngleDeg,
    ageDays: nm != null ? (when - nm) / DAY : null,
    phaseName: phaseName(ph.elongLonDeg),
    nextNew: EVT().nextPhase(when, 0), nextFull: EVT().nextPhase(when, 180),
  };

  /* the planets */
  const planets = PLANETS.map((id) => {
    const rs = riseSet(id, win.from, win.to, lat, lng, elevM);
    let best = null;
    if (observing) best = maxOf((t) => bodyAlt(id, t, lat, lng), observing.from, observing.to, 10 * MIN);
    const atT = best ? best.t : when, m = planetMagnitude(id, atT);
    return {
      id, rise: rs.rise, set: rs.set, transit: rs.transit, always: rs.always,
      altAtDarkMaxDeg: best ? best.v : null, bestTimeMs: best ? best.t : null,
      magnitude: m.mag, phaseAngleDeg: m.phaseAngleDeg, magnitudeSource: 'Astronomical Almanac 1984 via Meeus ch. 41',
      elongationDeg: EPH().elongationDeg(id, jdTT(atT)),
      /* "visible" here means: above the horizon (refraction included) while the Sun is at least as low as
         `observing.sunBelowDeg`. Atmospheric extinction and sky brightness are not modelled. */
      visibleTonight: !!best && best.v > h0Of(id, best.t, elevM),
    };
  });

  /* meteor showers active tonight */
  const mid = observing ? (observing.from + observing.to) / 2 : (win.from + win.to) / 2;
  const lam = solarLongitudeJ2000(mid);
  const showers = [];
  for (const sh of SHOWERS) {
    const lf = solarLongitudeJ2000(mdMs(ACTIVE_REF_YEAR, sh.active[0])), lt = solarLongitudeJ2000(mdMs(ACTIVE_REF_YEAR, sh.active[1]));
    if (!inArc(lam, lf, lt)) continue;
    const [ra, de] = radiantAt(sh, lam);
    const span = observing || { from: win.from, to: win.to };
    const radAlt = (t) => { const q = radiantOfDate(ra, de, t); return altitudeOf(q.raDeg, q.decDeg, t, lat, lng); };
    const best = maxOf(radAlt, span.from, span.to, 10 * MIN);
    const moonAlt = maxOf((t) => bodyAlt('moon', t, lat, lng), span.from, span.to, 10 * MIN);
    const mp = moonPhase(best.t);
    showers.push({
      code: sh.code, name: { en: sh.nm[0], jp: sh.nm[1] }, zhr: sh.zhr, vInf: sh.vInf, r: sh.r, parent: sh.parent,
      lambdaSun: lam, daysFromPeak: wrap180(lam - sh.lambdaMax) / 0.9856,
      radiant: { raDeg: ra, decDeg: de, equinox: 'J2000' },
      radiantAltMaxDeg: best.v, radiantBestMs: best.t,
      moon: { illumination: mp.illumination, ageDays: moon.ageDays != null ? (best.t - nm) / DAY : null,
        altAtBestDeg: bodyAlt('moon', best.t, lat, lng), altMaxDeg: moonAlt.v },
      window: observing ? 'observing' : 'whole-window', source: IMO_EDITION,
    });
  }

  /* the next lunar and solar eclipse from here (and whether either falls inside this window) */
  const eclipses = [];
  for (const type of ['lunar', 'solar']) {
    const e = localEclipses({ lat, lng, from: win.from, count: 1, type, elevM })[0];
    if (e) { e.duringWindow = e.maxMs >= win.from && e.maxMs < win.to; eclipses.push(e); }
  }

  return {
    when, lat, lng, elevM,
    window: win, sun, moon, planets,
    dark: dark ? { from: dark.from, to: dark.to } : null,
    darkReason: dark ? null : (sun.polar === 'day' ? 'the Sun does not set' : 'the Sun does not reach −18° tonight'),
    observing,
    showers, eclipses,
    deltaTSeconds: deltaTSeconds(yearOf(when)),
    source: 'js/ephemeris.js + js/space-sky.js gmstDeg + js/space-events.js; rise/set Meeus ch. 15',
  };
}

const api = { almanac, meteorShowers, localEclipses, moonPhase, solarLongitudeJ2000, altitudeOf,
  state: () => ({ showers: SHOWERS.length, showerSource: IMO_EDITION, magnitudes: 'AA 1984 via Meeus ch. 41' }) };
window.IntMapAlmanac = api;
export const IntMapAlmanac = api;
