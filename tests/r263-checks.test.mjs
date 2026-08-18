/* ============================================================================
 *  #R263 — the round's own contracts, checked in Node
 * ----------------------------------------------------------------------------
 *  A frequency-dependent site term · a finite rupture cut into subfaults · the tectonic regime from
 *  three shipped global datasets · a 0.05° Vs30 raster · and a validation set made of recordings.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const bytes = (p) => statSync(new URL(p, root)).size;
const load = (p) => { const w = {}; new Function('window', read(p))(w); return w; };

/* ── ① THE SITE TERM'S HIGH-FREQUENCY LIMIT IS THE OLD SCALAR, EXACTLY ────────────────────────────
   This is the whole safety argument for #R263's site change: everything it adds happens BELOW the
   frequency whose quarter wavelength is 30 m, and at and above that frequency it must return what
   js/seismic.js returned before, to the last bit — not "close to". If this drifts, every existing
   PGA answer moved and nobody asked for that. */
test('R263 ① A(f→∞) is ampOf(Vs30) to the last bit', () => {
  const SA = load('js/seismic-site.js').IntMapSiteAmp;
  /* a real CRUST1.0 shape: bnds[i]..bnds[i+1] is layer i, vs[i] its velocity */
  const crust = { surfaceKm: 0, bottomKm: [0, 0, 0, -2, -5, -8, -18, -28, -38],
    vsKms: [0, 0, 0.8, 1.6, 2.4, 3.4, 3.7, 3.9, 4.5], rhoGcc: [0, 0, 2.1, 2.3, 2.5, 2.7, 2.8, 2.9, 3.3] };
  for (const vs30 of [150, 180, 240, 300, 360, 500, 760, 1000, 1200, 1500]) {
    const p = SA.buildProfile(vs30, crust);
    const hi = SA.ampSpectrum(p, [200, 400, 1000]);
    for (const a of hi) assert.equal(a, SA.ampScalar(vs30), 'Vs30 ' + vs30 + ': A(f) must equal the scalar above the 30 m corner');
  }
  /* …and js/seismic.js's own ampOf must be the same expression, or the two drift apart */
  const s = read('js/seismic.js');
  assert.match(s, /function ampOf\(vs30\)\{ const rho=1800\+\(Math\.max\(150,Math\.min\(1500,vs30\)\)-180\)\/\(1500-180\)\*\(2600-1800\);/);
  const rho = 1800 + (760 - 180) / (1500 - 180) * (2600 - 1800);
  assert.equal(SA.rhoOfVs30(760), rho, 'the density relation is the one js/seismic.js uses');
});

/* ── ② …AND BELOW IT, A BASIN AMPLIFIES LONG PERIODS MORE THAN ROCK DOES ─────────────────────────
   The first cut of buildProfile paired CRUST1.0's layer intervals with the NEXT layer's velocity,
   which handed the sediments the crystalline crust's Vs — and the symptom was this assertion's
   opposite: 8 km of basin fill amplifying LESS at 0.2 Hz than bare rock. That is the direction the
   whole of item ② is about, so it is asserted rather than eyeballed. */
test('R263 ② a deep basin amplifies 0.2 Hz more than rock, and the profile knows why', () => {
  const SA = load('js/seismic-site.js').IntMapSiteAmp;
  const basin = { surfaceKm: 0, bottomKm: [0, 0, 0, -2, -5, -8, -18, -28, -38],
    vsKms: [0, 0, 0.8, 1.6, 2.4, 3.4, 3.7, 3.9, 4.5], rhoGcc: [0, 0, 2.1, 2.3, 2.5, 2.7, 2.8, 2.9, 3.3] };
  const rock = { surfaceKm: 0.4, bottomKm: [0.4, 0.4, 0.4, 0.4, 0.4, 0.35, -15, -25, -35],
    vsKms: [0, 0, 0, 0, 0.9, 3.5, 3.7, 3.9, 4.5], rhoGcc: [0, 0, 0, 0, 2.2, 2.7, 2.8, 2.9, 3.3] };
  const f = [0.2, 0.5, 1, 2];
  const aB = SA.ampSpectrum(SA.buildProfile(300, basin), f);
  const aR = SA.ampSpectrum(SA.buildProfile(300, rock), f);
  assert.ok(aB[0] > aR[0] * 1.2, 'at 0.2 Hz the basin must amplify clearly more (' + aB[0].toFixed(2) + ' vs ' + aR[0].toFixed(2) + ')');
  assert.ok(aB[3] / aR[3] < aB[0] / aR[0], 'and the advantage must shrink as the frequency rises');
  /* the amplification is monotone non-increasing downward in frequency for a normal profile */
  const p = SA.buildProfile(300, rock);
  const sweep = SA.ampSpectrum(p, [0.1, 0.3, 1, 3, 10, 30]);
  for (let i = 1; i < sweep.length; i++) assert.ok(sweep[i] >= sweep[i - 1] - 1e-12, 'A(f) rises with f on a rock column');
  assert.ok(SA.z1000(SA.buildProfile(300, basin)) > SA.z1000(SA.buildProfile(300, rock)), 'Z1.0 is deeper in the basin');
});

/* ── ③ THE SUBFAULT MODEL CONSERVES MOMENT, EXACTLY ──────────────────────────────────────────────
   「総モーメントを保存した」 is not an approximation request. */
test('R263 ③ subfault moments re-add to M0, and the slip is rough by the published amount', () => {
  const SF = load('js/seismic-subfault.js').IntMapSubfault;
  const cases = [[500, 200, 14, 200, 9.1], [150, 30, 50, 55, 7.5], [40, 15, 85, 233, 6.9], [6, 5, 60, 10, 5.5]];
  for (const [L, W, dip, strike, mw] of cases) {
    const M0 = Math.pow(10, 1.5 * mw + 9.1);
    const r = SF.build({ lengthKm: L, widthKm: W, dipDeg: dip, strikeDeg: strike, M0, zTopKm: 3,
      centroid: [140, 38], hypo: [139.5, 38], hypoDepthKm: 13 });
    assert.ok(r && r.subs.length > 0, 'M' + mw + ' produces subfaults');
    assert.ok(Math.abs(r.M0Sum - M0) / M0 < 1e-12, 'M' + mw + ': moment conserved (rel ' + (Math.abs(r.M0Sum - M0) / M0) + ')');
    /* ⚠ A SUBFAULT MAY SLIP ZERO, and that is the model rather than a bug: the k^-2 field is
       truncated at zero (`max(0, 1 + sigma*field)`), so a strongly negative fluctuation leaves a
       patch that does not break. What must hold is that nothing is NEGATIVE, that the fault mostly
       slips, and that every subfault has a real rupture time. */
    let slipping = 0;
    for (const s of r.subs) {
      assert.ok(s.M0 >= 0 && s.slipM >= 0 && s.tRupS >= 0 && isFinite(s.lng) && isFinite(s.lat),
        'M' + mw + ': no subfault is negative or unplaced');
      if (s.slipM > 0) slipping++;
    }
    assert.ok(slipping / r.subs.length > 0.5, 'M' + mw + ': most of the fault slips ('
      + slipping + '/' + r.subs.length + ')');
    /* Somerville et al. (1999): tau = 2.03e-9 * M0^(1/3), M0 in dyne-cm */
    assert.ok(Math.abs(r.riseS - 2.03e-9 * Math.pow(M0 * 1e7, 1 / 3)) < 1e-9, 'rise time is the published relation');
    /* the rupture starts at the hypocentre: some subfault must break at t≈0 */
    assert.ok(Math.min(...r.subs.map((s) => s.tRupS)) < r.maxRupTimeS * 0.5 + 1e-9, 'the tear starts somewhere');
  }
  /* the roughness is calibrated to Somerville et al.'s 22 % asperity area — check the ENSEMBLE,
     because any single rupture is one draw from the distribution */
  let tot = 0, n = 0;
  for (let k = 0; k < 40; k++) {
    const M0 = Math.pow(10, 1.5 * 7.5 + 9.1);
    const r = SF.build({ lengthKm: 150, widthKm: 30, dipDeg: 50, strikeDeg: 55, M0, zTopKm: 2,
      centroid: [140 + k * 0.01, 38], hypo: [139.5, 38], hypoDepthKm: 12 });
    tot += r.asperityFraction; n++;
  }
  const mean = tot / n;
  assert.ok(Math.abs(mean - SF.ASPERITY_FRAC) < 0.06, 'ensemble asperity area ' + (100 * mean).toFixed(1)
    + ' % against the published ' + (100 * SF.ASPERITY_FRAC) + ' %');
  /* deterministic: the same fault must give the same slip, or the map flickers and this test lies */
  const mk = () => SF.build({ lengthKm: 150, widthKm: 30, dipDeg: 50, strikeDeg: 55,
    M0: 1e20, zTopKm: 2, centroid: [140, 38], hypo: [139.5, 38], hypoDepthKm: 12 });
  assert.deepEqual(mk().subs.map((s) => s.slipM), mk().subs.map((s) => s.slipM), 'the slip field is deterministic');
});

/* ── ④ THE REGIME PARAMETER SETS ARE THE PUBLISHED ONES ──────────────────────────────────────────
   Atkinson & Boore (2006) Table 1, read out of the paper: stress 140 bars, kappa 0.005, Q = 893 f^0.32
   with Q_min 1000, geometric spreading -1.3 / +0.2 / -0.5 with crossovers at 70 and 140 km. If any of
   these is edited to make an earthquake come out right, this test is what notices. */
test('R263 ④ the stable-continental set is Atkinson & Boore (2006), whole', () => {
  const w = {}; new Function('window', 'document', read('js/earth-structure.js'))(w, { baseURI: 'http://x/' });
  const E = w.IntMapEarth;
  const S = E.REGIMES['stable-continental'];
  assert.equal(S.stressDropMPa, 14, '140 bars');
  assert.equal(S.kappaS, 0.005);
  assert.equal(S.q0, 893); assert.equal(S.qEta, 0.32); assert.equal(S.qFloor, 1000);
  assert.deepEqual(S.b, [-1.3, 0.2, -0.5]);
  assert.equal(S.r1, 70); assert.equal(S.r2, 140); assert.equal(S.mohoRefKm, 40);
  const A = E.REGIMES['active-crustal'];
  assert.equal(A.stressDropMPa, 3, 'the active set is what js/seismic.js already used, unchanged');
  assert.equal(A.kappaS, 0.035); assert.equal(A.q0, 180); assert.equal(A.qEta, 0.45);
  assert.deepEqual(A.b, [-1, 0, -0.5]); assert.equal(A.r1, 70); assert.equal(A.r2, 130);
  assert.equal(E.REGIMES.interface.stressDropMPa, 3, 'interface shares the active set');
  assert.equal(E.REGIMES.intraslab.stressDropMPa, 3, '…and so does intraslab: no invented stress drop');

  /* the crossovers follow the Moho and reproduce the published pair at the reference thickness */
  const at35 = E.paramsFor('active-crustal', { mohoKm: 35 }, 10);
  assert.ok(Math.abs(at35.r1 - 70) < 1e-9 && Math.abs(at35.r2 - 130) < 1e-9, 'a 35 km crust gives 70/130 exactly');
  const at70 = E.paramsFor('active-crustal', { mohoKm: 70 }, 10);
  assert.ok(Math.abs(at70.r1 - 140) < 1e-9, 'a 70 km Tibetan crust bends at 140 km, not 70');
  /* a source under the Moho has no crustal wave-guide, so no flat branch */
  const deep = E.paramsFor('intraslab', { mohoKm: 35 }, 120);
  assert.equal(deep.belowMoho, true);
  assert.equal(deep.b[1], deep.b[0], 'the direct-wave branch runs on to the surface-wave branch');
  /* and the spreading is continuous across both crossovers, whatever the exponents are */
  for (const id of ['active-crustal', 'stable-continental']) {
    const p = E.paramsFor(id, { mohoKm: 35 }, 10);
    for (const r of [p.r1, p.r2]) {
      const a = E.spreadOf(p, r - 1e-6), b = E.spreadOf(p, r + 1e-6);
      assert.ok(Math.abs(Math.log(a / b)) < 1e-4, id + ': spreading is continuous at ' + r.toFixed(0) + ' km');
    }
  }
});

/* ── ⑤ THE SHIPPED EARTH MODEL IS THERE, AND ITS MANIFESTS DESCRIBE IT ───────────────────────────*/
test('R263 ⑤ crust1 / slab2 / tectonics / vs30 ship, and say what they are', () => {
  for (const [bin, man] of [['data/crust1.bin.gz', 'data/crust1.json'],
    ['data/slab2.bin.gz', 'data/slab2.json'], ['data/tectonics.bin.gz', 'data/tectonics.json']]) {
    assert.ok(existsSync(new URL(bin, root)), bin + ' ships');
    const m = JSON.parse(read(man));
    assert.equal(m.bytes, bytes(bin), man + ' records the size of the file that shipped');
    assert.ok(String(m.source || '').length > 20, man + ' names its source');
  }
  const slab = JSON.parse(read('data/slab2.json'));
  assert.equal(slab.regions.length, 27, 'all 27 Slab2 subduction zones');
  assert.ok(slab.roundTripWorstDepthKm < 0.5, 'the shipped grid reproduces Slab2 to ' + slab.roundTripWorstDepthKm + ' km');
  /* the row-run layout must stay 4-aligned or the typed-array mounts in js/earth-structure.js throw */
  for (const r of slab.regions) {
    assert.equal(r.offset % 4, 0, r.code + ': region offset is 4-aligned');
    assert.equal(r.bytes % 4, 0, r.code + ': region body is padded to a multiple of 4');
  }
  const crust = JSON.parse(read('data/crust1.json'));
  assert.equal(crust.nlon * crust.nlat, 64800); assert.equal(crust.nlayers, 9);
  const tec = JSON.parse(read('data/tectonics.json'));
  assert.equal(tec.planes.length, 3);
  assert.ok(tec.orogenCells > 10000, 'the PB2002 orogens rasterised');

  /* ⚠ THE Vs30 RASTER AND ITS READER MUST AGREE, and the reader must not hard-code the grid — that
     is exactly how #R263 read a 7200-wide raster as though it were 1440 wide for an afternoon. */
  const v = JSON.parse(read('data/vs30.json'));
  assert.equal(v.width, 7200); assert.equal(v.height, 3600); assert.equal(v.degrees, 0.05);
  assert.equal(v.bytes, bytes('data/vs30.png'));
  assert.ok(v.phone && v.phone.width === 3600, 'a phone-sized copy is described');
  assert.equal(v.phone.bytes, bytes('data/vs30-phone.png'));
  const mask = read('js/vs30-mask.js');
  assert.match(mask, /function loadManifest\(\)/, 'the reader reads the manifest');
  assert.match(mask, /W=m\.width; H=m\.height/, '…and takes its grid from it');
  assert.ok(!/const W=\d+, H=\d+/.test(mask), 'the grid is not a const any more');
});

/* ── ⑥ THE VALIDATION SET IS MADE OF RECORDINGS, NOT OF RECOLLECTIONS ────────────────────────────*/
test('R263 ⑥ the observations are instrumental, and the gaps are recorded', () => {
  const fx = JSON.parse(read('tests/fixtures/seismic-observations.json'));
  assert.match(fx.source, /ShakeMap/, 'the source is named');
  assert.match(fx.licence, /public domain/i, 'and its licence');
  assert.ok(fx.data.length >= 12, fx.data.length + ' events');
  assert.ok(fx.totalStations >= 800, fx.totalStations + ' stations');
  for (const e of fx.data) {
    assert.ok(e.stations.length > 0, e.key + ' has stations (an empty event must be in `excluded`)');
    assert.ok(e.id && e.mw > 0 && isFinite(e.depthKm), e.key + ' carries its own hypocentre');
    for (const s of e.stations) {
      assert.ok(isFinite(s.lng) && isFinite(s.lat), e.key + ': every station has a coordinate');
      assert.ok((s.pgaPctG > 0) || (s.pgvCms > 0), e.key + ': every station recorded something');
    }
  }
  /* the three that cannot be scored must be visible, with the reason */
  const ex = fx.excluded.map((x) => x.key);
  for (const k of ['sumatra2004', 'chile1960', 'alaska1964']) {
    assert.ok(ex.includes(k), k + ' is recorded as unscored rather than silently dropped');
  }
  for (const x of fx.excluded) assert.ok(String(x.reason || '').length > 20, x.key + ' says why');
  /* and the harness that reads it must refuse to be a gate — see its header */
  const h = read('scripts/seismic-validate.mjs');
  assert.match(h, /--baseline/, 'the harness can A/B against the model this round replaced');
  assert.ok(!/process\.exit\(1\)[\s\S]{0,80}(bias|mae|MAE)/.test(h), 'no threshold on the score');
});

/* ── ⑦ THE WIRING — the new terms actually reach the three places that paint ──────────────────────
   Every one of these is a place where a previous round shipped a correct mechanism that never
   reached the reader. The map, the far annulus and the panel's table must all apply the SAME site
   term, or the table and the map disagree by a class (#R191 found the third copy of `mmiOf` doing
   exactly that). */
test('R263 ⑦ the regime and the site shape reach the field, the far raster and the table', () => {
  const s = read('js/seismic.js');
  assert.match(s, /let KAPPA_S=KAPPA;/, 'kappa became a variable the regime can set');
  assert.match(s, /Math\.exp\(-Math\.PI\*KAPPA_S\*f\)/, '…and the path term reads that variable');
  assert.match(s, /const qF=\(regime&&regime\.params&&regime\.params\.qFloor\)\|\|0;/, "Q's published floor is applied");
  assert.match(s, /if\(pr&&E&&E\.spreadOf\) return E\.spreadOf\(pr,rKm\);/, 'the spreading follows the regime');
  assert.match(s, /const regAuto=\{ ds:true, q:true, kappa:true \};/, 'the reader can still override');
  for (const ctl of ['regAuto.ds=false', 'regAuto.q=false']) assert.ok(s.includes(ctl), ctl + ' — a typed value wins for good');
  assert.match(s, /try\{ await refreshRegime\(\); \}catch\(_\)\{\}/, 'the regime is resolved once per build');
  /* the frequency-shape correction, in all three painters */
  assert.match(s, /if\(bank\)\{ const kk=bank\.at\(vs\[k\]>0\?vs\[k\]:_siteVs30/, 'the fine field applies it');
  assert.match(s, /if\(farBank\)\{ const kk=farBank\.at\(vsHere\|\|_farVs30/, 'the far raster applies it');
  assert.match(s, /if\(siteBank\)\{\s*const E=EARTH\(\);/, "and so does the panel's own table");
  assert.match(s, /const farBank=siteBank;/, 'the far raster uses the SAME bank, not a second one');
  /* the label that says which raster answered must not be a written-down constant any more */
  /* the LABEL, not the prose: this file's comments legitimately discuss the 0.25° raster it used to
     read, and a test that cannot tell a string literal from a sentence about history is a test that
     will be deleted the next time somebody writes the sentence. */
  assert.ok(!/'bundled-vs30-0\.25deg'/.test(s), "the stale 'bundled-vs30-0.25deg' literal is gone");
  assert.match(s, /function _vsmLabel\(\)/, '…replaced by asking the module its own grain');
  /* and evaluate() must be the same chain, not a copy of it */
  assert.match(s, /async evaluate\(ev\)\{/, 'the validation entry point exists');
  assert.match(s, /const m=motion\(mw,rM,fdAt\(lo,la\)\);/, '…and it calls motion(), like at() does');
});
