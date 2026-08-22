/* ============================================================================
 *  R197 — the space explorer's astronomy, checked against something other than itself
 * ----------------------------------------------------------------------------
 *  「実際の日時と位置がすべて正確。物理要素も忠実に。」 is a claim, and a test that compares
 *  js/ephemeris.js to js/ephemeris.js does not check it. Every assertion below is against an
 *  INDEPENDENT statement of the same fact:
 *
 *    ① the Sun's place in the sky, against the USNO series js/space-sky.js has carried since #R186;
 *    ② each planet's period from Kepler's third law on `a`, against the period implied by that same
 *       row's mean-longitude RATE — two numbers in the JPL table that must agree;
 *    ③ the greatest elongation of Mercury and Venus, against the observed 28.3° and 47.3° limits;
 *    ④ every body's heliocentric distance, against its published perihelion and aphelion;
 *    ⑤ the Moon's distance range and mean synodic month, against the published values;
 *    ⑥ the Earth's IAU prime meridian, against the independent GMST series in js/space-sky.js;
 *    ⑦ the Moon's ORIENTATION, against the fact that it is tidally locked — with the right pole and
 *       the right W₀ the sub-Earth point stays inside the libration envelope, and with anything else
 *       it wanders by tens of degrees. That one test covers α₀, δ₀ and W₀ together.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const E = (() => {
  const ctx = { window: {}, Math, Date, Object, Array, Number, isFinite, console, String };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(rd('js/ephemeris.js'), ctx, { filename: 'ephemeris.js' });
  return ctx.window.IntMapEphemeris;
})();
/* the two independent series lifted out of js/space-sky.js, run in their own context */
const SKY = (() => {
  const src = rd('js/space-sky.js');
  const sun = src.match(/function sunPosition\(ms\)\{[\s\S]*?\n {2}\}/);
  const gm = src.match(/function gmstDeg\(ms\)\{[\s\S]*?\n {2}\}/);
  assert.ok(sun && gm, 'js/space-sky.js still carries sunPosition() and gmstDeg()');
  const ctx = { Math, console }; vm.createContext(ctx);
  vm.runInContext('const D2R=Math.PI/180,R2D=180/Math.PI,J2000=2451545.0;\n'
    + 'function julianDay(ms){return ms/86400000+2440587.5;}\n' + sun[0] + '\n' + gm[0]
    + ';globalThis.sun=sunPosition;globalThis.gmst=gmstDeg;', ctx);
  return ctx;
})();

const jdOf = (iso) => E.julianDay(Date.parse(iso));

test('R197 space ① the Sun agrees with an independent solar series to arcminutes', () => {
  let worst = 0;
  for (const iso of ['2000-01-01T12:00:00Z', '1970-03-21T00:00:00Z', '2011-03-11T05:46:00Z',
    '2026-08-07T00:00:00Z', '2049-12-31T00:00:00Z']) {
    const ms = Date.parse(iso), a = E.sunGeocentric(E.julianDay(ms)), b = SKY.sun(ms);
    const dRA = Math.abs(((a.raDeg - b.ra + 540) % 360) - 180) * Math.cos(a.decDeg * Math.PI / 180);
    const sep = Math.hypot(dRA, a.decDeg - b.dec);
    if (sep > worst) worst = sep;
  }
  /* ⚠ THIS IS A FRAME TEST AS MUCH AS A COEFFICIENT TEST. Before precession was applied to everything
     that leaves the file as an angle on the sky, the same comparison gave 0.43′ at J2000 and 41.5′ at
     2049 — a straight line through the origin, which is a frame, not a bad number. */
  assert.ok(worst * 60 < 2, `worst Sun separation ${(worst * 60).toFixed(2)}′ over 1970–2049`);
});

test('R197 space ② every planet\'s two independent periods agree', () => {
  /* the mean-longitude rates of the same table, in degrees per Julian century */
  const RATE = { mercury: 149472.67486623, venus: 58517.81560260, earth: 35999.37306329,
    mars: 19140.29934243, jupiter: 3034.90371757, saturn: 1222.11494724, uranus: 428.49512595,
    neptune: 218.46515314, pluto: 145.18042903 };
  for (const id of E.bodies()) {
    const fromA = E.periodDays(id), fromL = 360 / (RATE[id] / 36525);
    const rel = Math.abs(fromA / fromL - 1);
    /* the inner planets are fitted tightly; for the giants the mean `a` of a 6,000-year fit and the
       mean-longitude rate differ by the great inequality, which is a tenth of a per cent */
    const tol = (id === 'jupiter' || id === 'saturn' || id === 'uranus' || id === 'neptune' || id === 'pluto') ? 1e-3 : 1e-4;
    assert.ok(rel < tol, `${id}: ${fromA.toFixed(2)} d from a, ${fromL.toFixed(2)} d from the L rate`);
  }
});

test('R197 space ③ Mercury and Venus never leave the Sun by more than they do', () => {
  const lim = { mercury: [26.5, 28.8], venus: [45.5, 47.9] };
  for (const id of ['mercury', 'venus']) {
    let mx = 0;
    for (let jd = jdOf('1900-01-01T00:00:00Z'); jd < jdOf('2150-01-01T00:00:00Z'); jd += 2) {
      const e = E.elongationDeg(id, jd); if (e > mx) mx = e;
    }
    assert.ok(mx > lim[id][0] && mx < lim[id][1], `${id} greatest elongation ${mx.toFixed(2)}°`);
  }
});

test('R197 space ④ every body stays between its published perihelion and aphelion', () => {
  for (const id of E.bodies()) {
    let lo = 1e9, hi = 0;
    for (let jd = jdOf('1900-01-01T00:00:00Z'); jd < jdOf('2150-01-01T00:00:00Z'); jd += 5) {
      const r = E.heliocentric(id, jd).r; if (r < lo) lo = r; if (r > hi) hi = r;
    }
    const [q, Q] = E.range(id);
    /* ⚠ A PER-CENT, NOT A PART PER MILLION, AND FOR A REASON. The published perihelion/aphelion are
       osculating values for the present epoch; these are MEAN elements fitted over six thousand
       years, and for Saturn the two differ by 0.4 % in `a` because Saturn's own `a` oscillates. The
       test is "is this body in its own orbit", which is what would break if a row were mistyped. */
    assert.ok(Math.abs(lo / q - 1) < 0.012, `${id} perihelion ${lo.toFixed(4)} vs published ${q}`);
    assert.ok(Math.abs(hi / Q - 1) < 0.012, `${id} aphelion ${hi.toFixed(4)} vs published ${Q}`);
  }
});

test('R197 space ⑤ the Moon: the right distance and the right month', () => {
  let lo = 1e9, hi = 0;
  for (let jd = jdOf('2020-01-01T00:00:00Z'); jd < jdOf('2030-01-01T00:00:00Z'); jd += 0.25) {
    const d = E.moonGeocentric(jd).distKm; if (d < lo) lo = d; if (d > hi) hi = d;
  }
  assert.ok(lo > 356000 && lo < 357200, `perigee ${lo.toFixed(0)} km (published ~356,400)`);
  assert.ok(hi > 406000 && hi < 407200, `apogee ${hi.toFixed(0)} km (published ~406,700)`);

  /* new moons = the minima of the Sun–Moon elongation. ⚠ THE FIRST DETECTION IS DISCARDED: the scan
     starts wherever it starts, and if the elongation is already rising there the very first sample
     looks like a minimum. Keeping it cost 0.046 d a lunation the first time this was measured. */
  const t0 = jdOf('2020-01-01T00:00:00Z'); const news = [];
  let prev = E.elongationDeg('moon', t0), rising = false;
  for (let jd = t0 + 0.02; jd < t0 + 3650; jd += 0.02) {
    const e = E.elongationDeg('moon', jd);
    if (e > prev && !rising) { news.push(jd); rising = true; }
    if (e < prev) rising = false;
    prev = e;
  }
  news.shift();
  const syn = (news[news.length - 1] - news[0]) / (news.length - 1);
  assert.ok(Math.abs(syn - 29.530589) < 0.002, `mean synodic month ${syn.toFixed(5)} d (published 29.530589)`);
});

test('R197 space ⑥ the Earth\'s IAU prime meridian tracks an independent GMST', () => {
  let worst = 0;
  for (const iso of ['2000-01-01T12:00:00Z', '1975-06-01T00:00:00Z', '2026-08-07T03:00:00Z', '2049-11-11T18:20:00Z']) {
    const ms = Date.parse(iso);
    const w = (E.orientation('earth', E.julianDay(ms)).w + 90) % 360;
    const d = Math.abs(((w - SKY.gmst(ms) + 540) % 360) - 180);
    if (d > worst) worst = d;
  }
  /* ⚠ THEY DO NOT AGREE EXACTLY AND MUST NOT: W is referred to the ICRF and GMST to the equinox of
     date, so the residual is the precession between them — small, and growing linearly. What this
     test catches is a transcription error in W₀ or Ẇ, which would be degrees, not tenths. */
  assert.ok(worst < 1.2, `|W+90 − GMST| reaches ${worst.toFixed(3)}° over 1975–2049`);
});

test('R197 space ⑦ the Moon keeps its near side towards the Earth', () => {
  const R = Math.PI / 180, dt = (A, B) => A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
  function subEarth(jd) {
    const m = E.moonGeocentric(jd);
    const lo = (m.lonDeg - E.precessLonDeg(jd)) * R, la = m.latDeg * R;    /* back into J2000 */
    const toMoon = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    const v = [-toMoon[0], -toMoon[1], -toMoon[2]];
    const b = E.bodyBasis('moon', jd);
    return { lon: Math.atan2(dt(v, b.y), dt(v, b.x)) / R, lat: Math.asin(Math.max(-1, Math.min(1, dt(v, b.z)))) / R };
  }
  let mxLon = 0, mxLat = 0;
  for (let jd = jdOf('1950-01-01T00:00:00Z'); jd < jdOf('2050-01-01T00:00:00Z'); jd += 0.37) {
    const s = subEarth(jd);
    if (Math.abs(s.lon) > mxLon) mxLon = Math.abs(s.lon);
    if (Math.abs(s.lat) > mxLat) mxLat = Math.abs(s.lat);
  }
  /* the observed libration envelope is ±7.9° in longitude and ±6.7° in latitude. A wrong pole or a
     wrong W₀ does not shift this by a degree — it makes the Moon spin relative to the Earth. */
  assert.ok(mxLon > 6 && mxLon < 9, `libration in longitude reaches ${mxLon.toFixed(2)}°`);
  assert.ok(mxLat > 4 && mxLat < 8, `libration in latitude reaches ${mxLat.toFixed(2)}°`);
});

test('R197 space ⑧ the bundled worlds: textures, names and the list of what is modelled', () => {
  const man = JSON.parse(rd('data/planets.json'));
  /* ⚠ (#R203) NINE, NOT TEN, AND THE MISSING ONE IS THE POINT. 「宇宙を探索専用に別の地球を作るな」—
     the Earth was a tenth 463 KB texture that existed for the space explorer alone, while the app
     already ships data/world-basemap.jpg and draws the map's own globe with it. There is one Earth
     picture now and this set is the OTHER worlds. */
  assert.ok(man.textures && Object.keys(man.textures).length >= 9, 'the other worlds still ship a surface each');
  assert.ok(!man.textures.earth, 'and the Earth is not among them — it is the app’s own basemap');
  assert.match(String(man.earthNote || ''), /world-basemap\.jpg/, 'the manifest says where the Earth comes from');
  for (const [id, t] of Object.entries(man.textures)) {
    assert.equal(t.width, 2048, id + ' is 2048 wide');
    assert.equal(t.height, 1024, id + ' is 1024 tall');
    assert.ok(fs.existsSync(path.join(ROOT, 'data', 'planets', id + '.jpg')), id + '.jpg is present');
  }
  const names = JSON.parse(rd('data/planet-names.json'));
  const total = Object.values(names).reduce((a, v) => a + v.length, 0);
  assert.ok(total > 2000, `${total} IAU-approved names ship`);
  for (const [body, list] of Object.entries(names)) {
    for (const f of list.slice(0, 50)) {
      assert.ok(f.lat >= -90 && f.lat <= 90, body + '/' + f.n + ' latitude');
      assert.ok(f.lon >= -180 && f.lon <= 180, body + '/' + f.n + ' longitude');
      assert.ok(typeof f.n === 'string' && f.n.length > 0, body + ' feature has a name');
    }
  }
  /* the two names everyone can check */
  const mars = names.mars.find(f => /Olympus Mons/.test(f.n));
  if (mars) { assert.ok(Math.abs(mars.lat - 18.65) < 1.5, 'Olympus Mons at 18.65°N'); }
  const moon = names.moon.find(f => f.n === 'Oceanus Procellarum');
  assert.ok(moon && moon.d > 2000, 'Oceanus Procellarum is the largest lunar feature');

  /* ⚠ AND THE HONESTY: no satellite other than the Moon is modelled, and the code says so. */
  const sp = rd('js/space.js');
  assert.match(sp, /THE OTHER MOONS ARE NOT HERE, AND THAT IS A DECISION/, 'the omission is stated');
  assert.match(sp, /const NO_TEXTURE=\{ pluto:1 \};/, 'Pluto has no invented surface');
  const eph = rd('js/ephemeris.js');
  assert.match(eph, /WHAT IS DELIBERATELY NOT HERE/, 'and again where the arithmetic lives');
});

test('R197 space ⑨ the button is bound to the zoom floor, not to a guess about it', () => {
  const sp = rd('js/space.js');
  assert.match(sp, /function atFloor\(\)\{ return zoomNow\(\)<=minZoom\(\)\+0\.06; \}/, 'the predicate');
  assert.match(sp, /GE\(\)\.camera\.getMinZoom&&GE\(\)\.camera\.getMinZoom\(\)/, 'asked of the renderer');
  assert.doesNotMatch(sp, /zoomNow\(\)<=0\.0[0-9]/, 'and not compared against a literal zero');
  /* (#R314) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const atlas = rd('js/atlas-console.js') + '\n' + rd('js/atlas-catalog-text.js');
  assert.match(atlas, /case 'space': case 'solarSystem': case 'planet':/, 'Atlas can open it too (#R82)');
  assert.match(atlas, /SPACE EXPLORER \(planets as globes, and the solar system in time\)/,
    'and the SYS catalogue documents it (#R115)');
});
