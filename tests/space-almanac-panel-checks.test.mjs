/* ============================================================================
 *  「今夜の空」パネル (js/sky-almanac.js), the eclipse-path layer (js/layer-pkg-eclipse.js, js/layers/dl-eclipse.js)
 *  and the time scale of js/space-events.js — RUN, never read.
 * ----------------------------------------------------------------------------
 *  What this file holds:
 *    ① the panel's pure parts: the order of its sections, the planets easiest first, the ISS first among the
 *       passes, the Moon's lit face (its area IS the illuminated fraction, and it is on the side of the bright
 *       limb the sky shows — right for a waxing Moon seen from the north, left from the south) and an instant
 *       printed in two clocks;
 *    ② the ±180° cut: real eclipses whose track crosses the antimeridian (2031-11-14, 2033-03-30, 2035-09-02)
 *       come out as pieces that are each a valid ring (closed, no edge crossing another) with every longitude
 *       in [−180, 180] and the band's area kept to rounding;
 *    ③ the dl-eclipse declaration passes the descriptor's own checks and names a package that exists;
 *    ④ js/space-events.js evaluates the ephemeris at TT with the aberrated geocentric Sun (both imported from
 *       js/space-eclipse-path.js): the lunar eclipses of 2025–2026 against NASA's catalogue.
 *  REFERENCE: NASA GSFC Five Millennium Catalog of Lunar Eclipses, LEcat5/LE2001-2100.html (TD of greatest eclipse
 *  and ΔT as printed), read 2026-11-17: 2025-03-14 06:59:56, 2025-09-07 18:12:58, 2026-03-03 11:34:52,
 *  2026-08-28 04:14:04 TD; ΔT 75 s for all four.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { installGlobals } from './helpers/import-module.mjs';
import { descriptorProblems, setProblems, packageFile, packageExport } from '../scripts/lib/layer-descriptor.mjs';
import { SHELVES } from '../js/layers/_shelves.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
/* js/space-sky.js (sidereal time) builds a canvas against a document at import; nothing else of the page is needed */
const document = { createElement: () => ({ style: {}, getContext: () => null, appendChild() {} }), getElementById: () => null,
  addEventListener() {}, readyState: 'complete', body: { appendChild() {} }, head: { appendChild() {} } };
installGlobals({ document });
/* imported as the modules they are (after the browser globals exist), so every export used below is reached by name */
const SA = await import('../js/sky-almanac.js');
const PK = await import('../js/layer-pkg-eclipse.js');
const EP = await import('../js/space-eclipse-path.js');
const { IntMapEclipsePath: P } = EP, deltaTSeconds = EP.deltaTSeconds;
const { IntMapAlmanac: A } = await import('../js/space-almanac.js');
const SE = globalThis.IntMapSpaceEvents, E = globalThis.IntMapEphemeris;

/* ══ ① THE PANEL'S PURE PARTS ════════════════════════════════════════════════════════════════════ */
test('the sections are in the order asked for: Sun, Moon, planets, showers, satellite passes, eclipses', () => {
  assert.deepEqual([...SA.SECTIONS], ['sun', 'moon', 'planets', 'showers', 'satellites', 'eclipses']);
});

test('planets: the seen ones easiest first (magnitude dimmed by the air mass), the rest nearest the Sun first', () => {
  assert.ok(Math.abs(SA.airmass(90) - 1) < 1e-3, 'one air mass at the zenith');
  assert.ok(SA.airmass(0) > 35 && SA.airmass(0) < 40, 'Kasten & Young give ≈ 38 at the horizon: ' + SA.airmass(0));
  const list = [
    { id: 'mercury', visibleTonight: true, altAtDarkMaxDeg: 1, magnitude: -0.3, elongationDeg: 19 },
    { id: 'jupiter', visibleTonight: true, altAtDarkMaxDeg: 60, magnitude: -2.1, elongationDeg: 90 },
    { id: 'saturn', visibleTonight: true, altAtDarkMaxDeg: 50, magnitude: 0.6, elongationDeg: 130 },
    { id: 'venus', visibleTonight: false, altAtDarkMaxDeg: null, magnitude: -3.9, elongationDeg: 8 },
    { id: 'mars', visibleTonight: false, altAtDarkMaxDeg: null, magnitude: 1.2, elongationDeg: 25 },
  ];
  const { seen, hidden } = SA.orderPlanets(list);
  assert.equal(SA.planetEase(list[0]), -0.3 + SA.EXTINCTION_V * SA.airmass(1), 'the magnitude plus k per air mass');
  assert.equal(SA.planetEase(list[3]), null, 'a planet not seen has no ease');
  /* Mercury at 1° is −0.3 + 0.2·X(1°) ≈ 5.1 — dimmer to the eye than Saturn at 50° */
  assert.deepEqual(seen.map((p) => p.id), ['jupiter', 'saturn', 'mercury']);
  assert.deepEqual(hidden.map((p) => p.id), ['venus', 'mars']);
  /* …and the real almanac's list is ordered the same way */
  const a = A.almanac({ lat: 35.6895, lng: 139.6917, when: Date.parse('2026-11-17T06:00:00Z') });
  const ease = SA.orderPlanets(a.planets).seen.map(SA.planetEase);
  assert.ok(ease.length >= 3, 'planets are seen from Tokyo on 2026-11-17');
  for (let i = 1; i < ease.length; i++) assert.ok(ease[i] >= ease[i - 1], 'easiest first');
});

test('passes: the ISS (NORAD 25544) first, then the highest, then the earliest', () => {
  const mk = (id, el, ms) => ({ id, name: String(id), max: { ms, elevDeg: el } });
  assert.equal(SA.ISS_NORAD, '25544');
  const out = SA.orderPasses([mk(48274, 80, 3), mk(20580, 40, 1), mk(25544, 20, 9), mk(43013, 80, 2)]);
  assert.deepEqual(out.map((p) => String(p.id)), ['25544', '43013', '48274', '20580']);
});

test('the Moon\'s lit face: its area is the illuminated fraction, on the bright limb\'s side as the sky shows it', () => {
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const g = SA.moonLitGeometry(k, 270, false, 20);
    assert.ok(Math.abs(SA.litFraction(g) - Math.min(1, k)) < 1e-9, 'area ' + SA.litFraction(g) + ' for k ' + k);
    /* the SVG draws exactly that terminator: an ellipse of semi-axis r·|2k − 1| */
    const svg = SA.moonSvg(k, 270, false, 44);
    const arcs = [...svg.matchAll(/A([\d.]+),([\d.]+) 0 0 ([01])/g)];
    if (k > 0.001) {
      assert.equal(arcs.length, 2, 'the limb and the terminator');
      const r = +arcs[0][1];
      assert.ok(Math.abs(+arcs[1][1] - Math.max(r * Math.abs(2 * k - 1), 1e-6)) < 2e-3, 'terminator semi-axis');
      assert.equal(arcs[1][3], k > 0.5 ? '1' : '0', 'gibbous bulges into the dark side, a crescent into the lit side');
    }
  }
  /* a real waxing Moon: 2026-11-12 (four days after the new Moon of 2026-11-09, USNO). The Sun is west of it, so the
     bright limb faces west — on the RIGHT with north up and east left, on the LEFT for an observer who sees south up */
  const jd = P.jdTT(Date.parse('2026-11-13T09:00:00Z'));
  const chi = SA.brightLimbPA(E.equatorial('sun', jd), E.equatorial('moon', jd));
  assert.ok(chi > 180 && chi < 360, 'the bright limb of a waxing Moon is on the west side (PA ' + chi.toFixed(1) + '°)');
  assert.ok(SA.moonLitGeometry(0.2, chi, false).litDir[0] > 0.5, 'lit on the right from the north');
  assert.ok(SA.moonLitGeometry(0.2, chi, true).litDir[0] < -0.5, 'lit on the left from the south');
  const k = A.moonPhase(Date.parse('2026-11-13T09:00:00Z')).illumination;
  assert.ok(k > 0.1 && k < 0.35, 'and it is a crescent: ' + k);
});

test('an instant in two clocks: the reader\'s, and the place\'s standard time or UTC beside it', () => {
  const ms = Date.UTC(2026, 2, 3, 11, 33, 37);
  assert.equal(SA.zoneOffsetMin(ms, 'Asia/Tokyo'), 540);
  assert.equal(SA.zoneOffsetMin(Date.UTC(2026, 6, 1), 'America/New_York'), -240);
  const tokyo = { locale: 'en-GB', timeZone: 'Asia/Tokyo' };
  assert.deepEqual(SA.formatClock(ms, { ...tokyo, siteOffsetH: 9 }), { main: '20:33', alt: null, altLabel: null }, 'same zone: one clock');
  assert.deepEqual(SA.formatClock(ms, { ...tokyo, siteOffsetH: null }), { main: '20:33', alt: '11:33', altLabel: 'UTC' }, 'the place unknown: UTC');
  assert.deepEqual(SA.formatClock(ms, { ...tokyo, siteOffsetH: -5 }), { main: '20:33', alt: '06:33', altLabel: 'UTC−5' });
  assert.deepEqual(SA.formatClock(ms, { ...tokyo, siteOffsetH: 5.5 }), { main: '20:33', alt: '17:03', altLabel: 'UTC+5:30' });
  assert.deepEqual(SA.formatClock(ms, { locale: 'en-GB', timeZone: 'UTC', siteOffsetH: null }), { main: '11:33', alt: null, altLabel: null }, 'a reader on UTC is not told UTC twice');
  assert.match(SA.formatClock(ms, { ...tokyo, siteOffsetH: null, withDate: true }).main, /03\/03.*20:33|3\/3.*20:33/);
});

test('the stretches above the horizon are found and their edges bisected', () => {
  const day = 86400000, alt = (t) => 30 * Math.sin((2 * Math.PI * t) / day);   /* up from 0 to day/2 */
  const ups = SA.upIntervals(alt, -day / 4, 1.25 * day, 5 * 60000, 0);
  assert.equal(ups.length, 2, 'risen at 0, set at noon, risen again at 24 h and still up at the end');
  assert.ok(Math.abs(ups[0].from - 0) < 2000 && Math.abs(ups[0].to - day / 2) < 2000);
  assert.ok(Math.abs(ups[1].from - day) < 2000 && ups[1].to === 1.25 * day);
  assert.deepEqual(SA.upIntervals(() => -1, 0, day, 60000, 0), []);
  assert.deepEqual(SA.upIntervals(() => 1, 0, day, 60000, 0), [{ from: 0, to: day }]);
});

/* ══ ② THE ±180° CUT ════════════════════════════════════════════════════════════════════════════ */
const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const crosses = (a, b, c, d) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
function ringProblems(ring) {
  const out = [];
  const n = ring.length - 1;
  if (n < 3) out.push('fewer than 3 vertices');
  if (ring[0][0] !== ring[n][0] || ring[0][1] !== ring[n][1]) out.push('not closed');
  for (const p of ring) if (!(p[0] >= -180 && p[0] <= 180) || !(p[1] >= -90 && p[1] <= 90)) out.push('outside the globe: ' + p);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (crosses(ring[i], ring[i + 1], ring[j], ring[j + 1])) out.push('edges ' + i + ' and ' + j + ' cross');
  }
  return out;
}

test('the umbral band of eclipses that cross the antimeridian is cut into valid pieces, its area kept', () => {
  const seeds = { '2031-11-14': Date.UTC(2031, 10, 14, 21), '2033-03-30': Date.UTC(2033, 2, 30, 18), '2035-09-02': Date.UTC(2035, 8, 2, 2) };
  for (const [date, seed] of Object.entries(seeds)) {
    const path = P.solarEclipsePath(seed);
    assert.equal(new Date(path.ms).toISOString().slice(0, 10), date);
    const ring = path.umbra.coordinates[0];
    const xs = ring.map((p) => p[0]);
    assert.ok(Math.min(...xs) < -180 || Math.max(...xs) > 180, date + ': the band really crosses ±180° in the continuous coordinates');
    assert.deepEqual(ringProblems(ring).filter((m) => !/outside/.test(m)), [], date + ': the computed ring is itself simple');
    const pieces = PK.splitRing(ring);
    assert.ok(pieces.length >= 2, date + ': cut into ' + pieces.length);
    for (const r of pieces) assert.deepEqual(ringProblems(r), [], date);
    const total = Math.abs(PK.ringArea2(ring)), sum = pieces.reduce((s, r) => s + Math.abs(PK.ringArea2(r)), 0);
    assert.ok(Math.abs(sum - total) / total < 1e-9, date + ': area ' + sum + ' vs ' + total);
    /* every line of the eclipse is cut too, and no piece jumps across the map */
    const fc = PK.eclipseToFeatures(path, date);
    for (const f of fc.features) {
      const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates
        : f.geometry.type === 'Polygon' ? f.geometry.coordinates : [[f.geometry.coordinates]];
      for (const l of parts) {
        for (const p of l) assert.ok(p[0] >= -180 && p[0] <= 180, date + ' ' + f.properties.role + ': ' + p[0]);
        for (let i = 1; i < l.length; i++) assert.ok(Math.abs(l[i][0] - l[i - 1][0]) < 180, date + ' ' + f.properties.role + ' jumps across the map');
      }
    }
    for (const f of fc.features) assert.ok(['umbra', 'central', 'penumbra', 'greatest'].includes(f.properties.role));
    assert.ok(fc.features.some((f) => f.properties.role === 'umbra') && fc.features.some((f) => f.properties.role === 'central'), date + ': band and central line drawn');
    assert.ok(fc.features.every((f) => f.properties.name === date && f.properties.id === String(Math.round(path.ms))), 'every feature names the eclipse');
  }
});

test('a concave band crossing the meridian twice is cut into its separate pieces, not joined along it', () => {
  /* a U lying on its side across +180: two arms east of the line, the bend west of it */
  const U = [[170, 0], [190, 0], [190, 2], [175, 2], [175, 4], [190, 4], [190, 6], [170, 6], [170, 0]];
  const pieces = PK.splitRing(U);
  assert.equal(pieces.length, 3, 'the bend and two arms');
  for (const r of pieces) assert.deepEqual(ringProblems(r), []);
  const total = Math.abs(PK.ringArea2(U)), sum = pieces.reduce((s, r) => s + Math.abs(PK.ringArea2(r)), 0);
  assert.ok(Math.abs(sum - total) < 1e-9);
  assert.equal(pieces.filter((r) => r.every((p) => p[0] <= -170)).length, 2, 'the two arms are moved west of −180 + 10');
  assert.deepEqual(PK.splitLine([[170, 0], [190, 10]]), [[[170, 0], [180, 5]], [[-180, 5], [-170, 10]]]);
  assert.deepEqual(PK.splitLine([[-170, 0], [-190, 10]]), [[[-170, 0], [-180, 5]], [[180, 5], [170, 10]]]);
});

test('a partial-only eclipse draws only the limits of the partial eclipse and its greatest point', () => {
  const path = P.solarEclipsePath(Date.UTC(2029, 6, 11, 15, 37));
  assert.equal(path.kind, 'partial');
  const roles = new Set(PK.eclipseToFeatures(path, 'x').features.map((f) => f.properties.role));
  assert.ok(!roles.has('umbra') && !roles.has('central'), 'no band and no central line');
  assert.ok(roles.has('penumbra') && roles.has('greatest'));
});

/* ══ ③ THE DECLARATION ═══════════════════════════════════════════════════════════════════════════ */
test('dl-eclipse is a well-formed layer on the orbit shelf, in a position no other layer holds, with a package', async () => {
  const shelves = new Set(SHELVES.map((s) => s.key));
  const dir = join(ROOT, 'js/layers');
  const all = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) all.push((await import(pathToFileURL(join(dir, f)).href)).default);
  const d = all.find((x) => x.id === 'dl-eclipse');
  assert.ok(d, 'js/layers/dl-eclipse.js exists');
  assert.deepEqual(descriptorProblems(d, 'dl-eclipse.js', shelves), []);
  assert.deepEqual(setProblems(all).filter((m) => /dl-eclipse/.test(m)), []);
  assert.equal(d.shelf, 'lyrGrpOrbit');
  assert.equal(packageFile(d.pkg), 'layer-pkg-eclipse.js');
  assert.equal(packageExport(d.pkg), 'eclipsePackage');
  assert.equal(typeof PK.eclipsePackage, 'function', 'js/layer-pkg-eclipse.js exports eclipsePackage');
});

/* ══ ④ js/space-events.js ON THE RIGHT TIME SCALE ════════════════════════════════════════════════ */
test('space-events searches the ephemeris at TT, with the imported ΔT and the aberrated geocentric Sun', () => {
  const ms = Date.UTC(2026, 2, 3, 11, 33);
  assert.equal(SE.jdOf(ms), P.jdTT(ms), 'UTC → TT is js/space-eclipse-path.js jdTT');
  assert.ok(Math.abs(SE.jdOf(ms) - E.julianDay(ms) - deltaTSeconds(2026.17) / 86400) < 1e-6, 'ΔT ≈ 75 s is in it');
  assert.ok(Math.abs(SE.msOf(SE.jdOf(ms)) - ms) < 1, 'and msOf is its inverse');
  /* the Moon's distance from the shadow axis is measured against the Sun js/space-eclipse-path.js sunMoon gives */
  const jd = SE.jdOf(ms), { S, M } = P.sunMoon(ms);
  const ang = Math.acos(-(S[0] * M[0] + S[1] * M[1] + S[2] * M[2]) / (Math.hypot(...S) * Math.hypot(...M))) * 180 / Math.PI;
  assert.ok(Math.abs(SE.shadowSep(jd) - ang) < 1e-9);
});

test('the lunar eclipses of 2025–2026 fall at NASA\'s instants within the ephemeris\' error budget', () => {
  /* The budget is js/space-eclipse-path.js's (measured against JPL Horizons): the Sun's direction from the JPL
     approximate elements is good to 35″, the Moon's to 6″, and the Moon moves ≈ 0.508″/s against the shadow axis,
     so a greatest eclipse can be (35 + 6)/0.508 + 5 (ΔT) ≈ 86 s off. Before the TT/aberration fix 2026-03-03 was
     188 s late — outside it. ⚠ The Sun's own error (the JPL approximate elements) is what is left: 2026-03-03 comes
     out ~68 s late after the fix, so ±30 s cannot be held without a better solar theory in js/ephemeris.js. */
  const TOL_S = (35 + 6) / 0.508 + 5;
  const NASA = { '2025-03-14': '2025-03-14T06:59:56Z', '2025-09-07': '2025-09-07T18:12:58Z', '2026-03-03': '2026-03-03T11:34:52Z', '2026-08-28': '2026-08-28T04:14:04Z' };
  const found = Object.fromEntries(SE.eclipses(Date.UTC(2025, 2, 1), 600, false).map((e) => [new Date(e.ms).toISOString().slice(0, 10), e]));
  const errs = [];
  for (const [date, td] of Object.entries(NASA)) {
    assert.ok(found[date], 'found ' + date);
    const ut = Date.parse(td) - 75000;   /* NASA's own ΔT for these, as printed */
    const err = (found[date].ms - ut) / 1000;
    errs.push(err);
    assert.ok(Math.abs(err) <= TOL_S, date + ': ' + err.toFixed(1) + ' s from NASA (budget ' + TOL_S.toFixed(0) + ' s)');
  }
  /* the corrections remove the systematic lateness: the four errors straddle zero (they were all late, by 82–188 s) */
  assert.ok(errs.some((e) => e < 0) && errs.some((e) => e > 0), 'errors ' + errs.map((e) => e.toFixed(0)).join(', '));
  assert.equal(found['2026-03-03'].kind, 'total');
  assert.ok(Math.abs(found['2026-03-03'].umbraMag - 1.1507) < 0.02, 'umbral magnitude ' + found['2026-03-03'].umbraMag);
});
