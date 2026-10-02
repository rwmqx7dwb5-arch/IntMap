/* ============================================================================
 *  THE SEISMIC SIMULATOR — the source and the ground motion
 * ----------------------------------------------------------------------------
 *  Site term, finite rupture, tectonic regime, the ground-motion chain, directivity and the past-earthquake catalogue.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/seismic.js is ONE factory closure
 *    (IntMapModules.seismic(HOST)) that builds the panel, the field and the fronts against a live
 *    renderer and DOM; its internals are not exported, so what is pinned there is read (comments
 *    stripped). Everything the model exports — js/seismic-site.js, js/seismic-subfault.js,
 *    js/earth-structure.js, js/fault-geometry.js, js/seismic-events.js — is RUN.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';
import { capsSource } from './helpers/atlas-kernel.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r263-checks.test.mjs (the whole file) ═══
    #R263 — the round's own contracts, checked in Node
    A frequency-dependent site term · a finite rupture cut into subfaults · the tectonic regime from
    three shipped global datasets · a 0.05° Vs30 raster · and a validation set made of recordings. */
{
const root = new URL('../', import.meta.url);
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
}

/* ═══ from tests/r189-checks.test.mjs (tests #12, #14 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{
test('R189 seismic: JMA scale as a labelled conversion, MMI honesty intact', () => {
  const src = read('js/seismic.js');
  /* (#R192) 震度 is no longer converted from PGV at all — it is the JMA's own computation, off the
     JMA-filtered acceleration. #R189's own note said the regression was standing in for exactly
     that. See tests/r192-checks. */
  assert.match(src, /function jmaOfA0\(a0\)\{ return 2\*Math\.log10\(Math\.max\(1e-6,a0\)\)\+0\.94; \}/,
    '気象庁「計測震度の算出方法」');
  assert.match(src, /\{ min:6\.5, id:'7',  col:'#B40068' \}/, 'the JMA published colours, 震度7 included');
  assert.match(src, /class="sq-scale[ "']/, 'the scale is switchable on the panel');   /* (#R237) see .sq-spd above */
  /* the honesty strings r176 pinned still hold — MMI is still not shindo, and the JMA view says
     what it is */
  assert.ok(/NOT the JMA shindo scale/.test(src) && /気象庁震度階級ではありません/.test(src), 'MMI disclaimer kept');
  /* (#R192) …and it is no longer a conversion: the panel now says the shindo is the JMA's own
     computation. The claim the test is really about — that the panel STATES what the number is —
     is unchanged. */
  assert.match(src, /震度は換算ではなく気象庁「計測震度の算出方法」そのものです/, 'the JMA view says what it is');
  /* (#R246) the registry's descriptions moved to js/locales/pages.<code>.js `sourceUse`; the credit
     is the same sentence, in the file that now holds the English original. */
  const refs = read('js/locales/pages.en.js');
  assert.ok(refs.includes('Fujimoto & Midorikawa (2005)'), 'credited');
  assert.ok(refs.includes('Wald & Allen (2007)'), 'and the Vs30 proxy too');
});
test('R189 seismic: a free-drawn rupture with slip yields Mw, Rrup and finite-source fronts', () => {
  const src = read('js/seismic.js');
  assert.match(src, /const MU=RHO\*BETA\*BETA, VRUP_KMS=0\.75\*BETA\/1000;/, 'μ=ρβ², Vr=0.75β');
  /* ⚠ (#R224) M₀ = μ·A·D̄ MOVED, IT DID NOT GO. The drawn outline is the fault's surface projection
     now, so the whole chain (dip → width → depth → 3-D area → slip → M₀ → Mw) lives in
     js/fault-geometry.js, where it can be verified against real earthquakes in Node. This file's job
     is to prove seismic.js still hands the ring to it and still reads the moment back. */
  assert.match(src, /const s=faultSolve\(ring,aKm2\)/, 'the ring goes through the fault solver');
  /* ⚠ (consolidation) THE SOLVER IS RUN, NOT READ. js/fault-geometry.js is a plain factory on
     `window`, so it is evaluated and handed a drawn fault with a stated slip and rigidity: M₀ must be
     μ·A·D̄ on the plane's own (down-dip) area, and Mw must come back through Hanks & Kanamori. */
  const w = {}; new Function('window', read('js/fault-geometry.js'))(w);
  for (const [L, Wp, slip, mu] of [[100, 20, 2, 3e10], [450, 120, 12, 4.2e10], [12, 6, 0.4, 3.3075e10]]) {
    const s = w.IntMapFaultGeom.solve({ footprint: { lengthKm: L, widthProjKm: Wp }, override: { slipM: slip }, muPa: mu, depthKm: 15 });
    assert.ok(Math.abs(s.M0 / (mu * s.areaKm2 * 1e6 * slip) - 1) < 1e-12, 'M0 = μ·A·D̄ (L ' + L + ' km: ' + s.M0 + ')');
    assert.ok(Math.abs(s.areaKm2 - s.lengthKm * s.widthKm) < 1e-9, '…on the plane, not on its surface shadow');
    assert.ok(Math.abs(s.mw - (Math.log10(s.M0) - 9.1) / 1.5) < 1e-12, 'Mw back through Hanks & Kanamori');
  }
  assert.match(src, /function faultDistKm\(lng,lat\)\{/, 'Rrup: zero inside, nearest edge outside');
  /* ⚠ (#R235) the CONTRACT, not the parameter name. This used to pin `faultFrontLines(radiusAtDelay)`;
     #R235 changed the callback to take the whole source point (it now carries that point's own depth
     as well as its rupture delay), so a signature match would fail on a change that strengthens
     exactly the property this line is here to protect. What must stay true is that a drawn rupture
     still gets an envelope of DELAYED fronts rather than one circle. */
  assert.match(src, /function faultFrontLines\(\w+\)\{/, 'fronts are the delayed-union envelope');
  assert.match(src, /delay:off\*D\*RE\/VRUP_KMS/, '…each source point delayed by the rupture’s own propagation');
  /* ⚠ (#R238) the CLAIM again, not the spelling. This pinned `fault?faultFrontLines(rad):…`,
     i.e. «a drawn rupture takes the envelope and a point source takes a plain ring». #R238 gave
     the body waves a per-bearing crustal correction, so a point source can no longer be drawn
     from ONE radius either — `ringLines` would repeat the bearing-0 answer all the way round and
     throw the correction away, which is exactly the defect #R235 recorded for the surface waves.
     Both families go through the envelope builder now, so the property this line protects (a
     drawn rupture gets the delayed union, never one circle) is STRONGER, not weaker. */
  /* ⚠ (#R239) `train(rad, …)` builds the leading edge, the trailing edge and the band between them,
     and both come from `faultRing()` — the per-bearing builder `faultFrontLines` is now a front-only
     wrapper around. Same property, one level up. */
  assert.match(src, /train\(rad,ph\.col,ph\.w\)/, '…and it is what a drawn rupture uses');
  assert.doesNotMatch(src, /ringLines\(epi,rad\(null\)\)/, 'no front is drawn from a single bearing-free radius');
  assert.match(src, /DT\.currentGeometry/, 'captured from the SHARED free-draw tool (#R141), not a private one');
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const atlas = read('js/atlas-console.js') + '\n' + capsSource();   /* (atlas-capability-single-source) the prose moved into the entries — read the catalogue the planner is given: the fragments are in the entries, escapes as written */
  assert.ok(atlas.includes('"scale"?:"mmi"|"jma"'), 'the SYS catalogue advertises the scale');
  assert.ok(atlas.includes('"slip"?:m'), '…and the slip');
});
}

/* ═══ from tests/r191-checks.test.mjs (tests #5 of 11) ═══
    R191 — source-level checks for the round's eight reports.
    Node's own test runner; no browser. The things that need a real renderer or
    live pixels are in tests/r191.spec.js. */
{

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readLF(join(ROOT, f))).join('\n')
  : readLF(join(ROOT, p)));

/* ── 5 · seismic: the published models, by name and by coefficient ───────────────────────────── */
test('R191 seismic: the ground-motion chain names its models and uses their numbers', () => {
  const s = read('js/seismic.js');
  /* Worden et al. 2012 GMICE — the ShakeMap PGV relation, replacing Wald et al. 1999 */
  assert.match(s, /\(lg<=0\.53\)\?\(3\.78\+1\.47\*lg\):\(2\.89\+3\.16\*lg\)/, 'Worden 2012, both segments');
  assert.ok(!/3\.47\*Math\.log10\(Math\.max\(1e-6,pgv\)\)\+2\.35/.test(s),
    'and NO copy of Wald 1999 survives — at() carried a third one');
  /* the two class floors are inverted from the same relations, not written out again */
  assert.match(s, /function pgvAtMMI\(I\)/, 'the MMI inverse');
  /* (#R192) the JMA side is no longer a PGV regression at all — see tests/r192-checks. The inverse
     that bounds the painted edge is now the one for the level 計測震度 is defined on. */
  assert.match(s, /function a0AtJMA\(I\)/, 'the JMA inverse, in the quantity the scale is computed from');
  /* (#R232) …of whichever profile reaches furthest, which with rupture directivity is the forward
     lobe rather than the azimuth average — taking the edge from the average would clip the one
     direction the directivity term exists to draw. The scale-picks-its-own-quantity rule is what is
     being pinned, and it stands. */
  /* (#R247) unchanged, and deliberately so: the fade that round added to the lowest class runs
     INWARD from this radius (see fieldPx in js/seismic.js), so the floor the edge is solved for is
     still each scale's own class floor — and the box, the span and the cell are untouched. */
  assert.match(s, /const arr=jmaScale\?prof(?:Edge)?\.a0s:prof(?:Edge)?\.out, floor=jmaScale\?A0_FLOOR_JMA:PGV_FLOOR_MMI;/,
    'and the paint edge walks whichever profile the active scale reads');
  /* ⚠ (#R223) THE NEAR-FIELD SATURATION MOVED FROM A PSEUDO-DEPTH TO THE GEOMETRY, and the
     assertion moved with it. #R191's point was that a POINT source must not report ground motion
     no instrument has recorded, and that a DRAWN rupture must not be given the same term twice;
     both still hold, and the reader's report («点震源のほうが明らかに過小評価») was that the two
     branches disagreed at the same magnitude. A point now stands for the rupture its magnitude
     implies (Wells & Coppersmith 1994), so the finiteness is in the distance metric for both and
     the curves are one curve. The claim here is STRONGER than the one it replaces: there is no
     branch on `fault` inside the ground-motion chain at all. */
  assert.ok(!/heffKm/.test(s), 'the equivalent point-source depth is gone (see #R223 ④)');
  assert.match(s, /RUP_A=\(mw\)=>Math\.pow\(10,-3\.49\+0\.91\*mw\)/, 'Wells & Coppersmith 1994 instead');
  assert.match(s, /function rupCutKm\(\)\{ return fault\?0:impliedRupKm\(mw\); \}/,
    'and a drawn rupture is still never given the finiteness twice');
  /* Atkinson & Boore 1995 path duration — the same paper as the trilinear spreading above it */
  assert.match(s, /const Tp=\(rKm<=10\)\?0:\(rKm<=70\)\?\(0\.16\*\(rKm-10\)\):\(rKm<=130\)\?\(9\.6-0\.03\*\(rKm-70\)\):\(7\.8\+0\.04\*\(rKm-130\)\);/,
    'the four published segments');
  assert.ok(!/0\.05\*rKm/.test(s), 'and the sourceless flat line is gone');
  /* Cartwright & Longuet-Higgins peak factor — needs the fourth moment */
  assert.match(s, /m4\+=a2\*w2\*w2;/, 'the fourth spectral moment is computed');
  assert.match(s, /const xi=Math\.max\(1e-4,Math\.min\(1,m2\/Math\.sqrt\(Math\.max\(1e-60,m0\*m4\)\)\)\);/, 'the irregularity factor');
  assert.ok(!/Math\.sqrt\(2\*lnN\)\+0\.5772/.test(s), 'and the Davenport asymptote is gone');
});
}

/* ═══ from tests/r218-checks.test.mjs (tests #6 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => codeOnly(read(p));

/* ── ③ the seismic profile: the fast index gives the OLD answer ─────────────────────────── */
test('#R218 ③ the closed-form profile index reproduces the binary search it replaced', () => {
  /* the two forms, both built here from the same geometric node table the module builds */
  const n = 140, r0 = 10, r1 = 8000;
  const rr = new Float64Array(n), out = new Float64Array(n);
  for (let i = 0; i < n; i++) { rr[i] = r0 * Math.pow(r1 / r0, i / (n - 1)); out[i] = 1e3 / Math.pow(rr[i], 1.4); }
  const oldWay = (rM) => { const r = Math.max(rr[0], Math.min(rr[n - 1], rM / 1000));
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rr[m] <= r) lo = m; else hi = m; }
    const span = Math.log(rr[hi]) - Math.log(rr[lo]) || 1;
    const f = (Math.log(r) - Math.log(rr[lo])) / span;
    return out[lo] * Math.pow(out[hi] / out[lo], f); };
  const lOut = new Float64Array(n); for (let i = 0; i < n; i++) lOut[i] = Math.log(out[i]);
  const lr0 = Math.log(r0), kIx = (n - 1) / (Math.log(r1) - lr0);
  const newWay = (rM) => { const r = Math.max(rr[0], Math.min(rr[n - 1], rM / 1000));
    const x = Math.max(0, Math.min(n - 1 - 1e-9, (Math.log(r) - lr0) * kIx));
    const lo = Math.min(n - 2, x | 0), f = x - lo;
    return Math.exp(lOut[lo] + f * (lOut[lo + 1] - lOut[lo])); };
  let worst = 0;
  for (let k = 0; k < 20000; k++) { const rM = (5 + k * 0.5) * 1000;
    const a = oldWay(rM), b = newWay(rM);
    worst = Math.max(worst, Math.abs(a - b) / Math.abs(a)); }
  /* ⚠ THE BOUND IS 1e−9 BECAUSE THAT IS WHAT WAS MEASURED, not because it was chosen to pass.
     `a·(b/a)^f` and `exp(log a + f·(log b − log a))` are the same number in exact arithmetic; in
     doubles they differ by a few units in the last place of an exponent, and over 20,000 radii on a
     table with this table's dynamic range the worst relative difference is 6.7e−11. The quantity is
     a peak ground velocity printed to three significant figures. */
  assert.ok(worst < 1e-9, `the new interpolation differs by ${worst}`);
  /* …and the module really does carry the closed form and the shared-index accessor */
  const s = code('js/seismic.js');
  assert.match(s, /both\(rM\)\{/, 'the two-quantity accessor is missing');
  assert.equal(/let lo=0,hi=n-1; while\(hi-lo>1\)/.test(s), false, 'the binary search is still there');
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #5, #6, #7 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ④ the point source IS a finite rupture, and there is ONE distance conversion ──────────────── */
test('R223 ④ a point source stands for the rupture its magnitude implies', () => {
  const s = read('js/seismic.js');
  assert.match(s, /RUP_A=\(mw\)=>Math\.pow\(10,-3\.49\+0\.91\*mw\)/, 'Wells & Coppersmith 1994 rupture area');
  assert.match(s, /function impliedRupKm\(m\)/);
  assert.match(s, /function rupCutKm\(\)\{ return fault\?0:impliedRupKm\(mw\); \}/,
    'a DRAWN rupture already carries its own finiteness — the cut is only for a point');
  /* the pseudo-depth is gone from the chain */
  assert.ok(!/heffKm\(mw\)\*1000/.test(s), 'no equivalent point-source depth is added any more');
  assert.ok(!/function heffKm/.test(s), 'and the function itself is gone rather than left dead');
  /* every reader goes through srcDistM */
  assert.match(s, /function srcDistM\(surfKm,cutKm\)/);
  const raw = (s.match(/Math\.sqrt\(km\*km\+depthKm\*depthKm\)/g) || []).length;
  assert.equal(raw, 0, 'no site may combine the surface distance with the depth by hand');
  const uses = (s.match(/srcDistM\(/g) || []).length;
  assert.ok(uses >= 5, 'buildField, buildFar, mmiRings and at() all take the one conversion (got ' + uses + ')');
});
test('R223 ④ the implied rupture is the size the magnitude says, and the two paths meet', () => {
  /* the relation itself, evaluated here rather than asserted about the text */
  const A = (mw) => Math.pow(10, -3.49 + 0.91 * mw);
  const r = (mw) => Math.sqrt(A(mw) / Math.PI);
  assert.ok(Math.abs(A(7.5) - 2163) < 20, 'M7.5 ruptures ~2,163 km² (got ' + A(7.5).toFixed(0) + ')');
  assert.ok(r(9) > r(7.5) && r(7.5) > r(6), 'a bigger earthquake is a bigger rupture');
  /* at the epicentre the point source is at the focal depth, exactly as a drawn rupture is */
  const srcDist = (surfKm, cut, depth) => Math.sqrt(Math.pow(Math.max(0, surfKm - cut), 2) + depth * depth);
  assert.equal(srcDist(0, r(7.5), 10), 10, 'over the footprint, the distance is the depth');
  assert.equal(srcDist(0, 0, 10), 10, '…and a drawn rupture gives the same answer');
  assert.ok(srcDist(500, r(7.5), 10) > 450, 'far away the finiteness stops mattering');
});

/* ── ⑤ the site term never collapses to one class while a bundled one exists ───────────────────── */
test('R223 ⑤ the bundled Vs30 raster ships and is consulted everywhere the DEM cannot reach', () => {
  assert.ok(existsSync(join(ROOT, 'data/vs30.png')), 'data/vs30.png must ship');
  const man = JSON.parse(read('data/vs30.json'));
  /* ⚠ (#R263) THE GRAIN IS NO LONGER 0.25°, AND PINNING IT WAS THE WRONG ASSERTION ANYWAY.
     #R223 pinned 1440 × 720 because that was the raster it shipped; #R263 rebuilt it at 0.05°
     (7200 × 3600) from the SAME z7 terrarium fetch, which had been averaging 516 samples into every
     output cell. What #R223 was defending is that a bundled raster EXISTS and is finer than the far
     field's own cell, so the site term can never collapse to one class — that is what is asserted
     now, against the far raster's ~28 km cell, and it gets stronger rather than weaker as the
     resolution improves. */
  assert.ok(man.width >= 1440 && man.height === man.width / 2, 'a global equirectangular raster, at least as fine as #R223 shipped');
  assert.ok(360 / man.width <= 0.25, 'never coarser than the 0.25° #R223 established (got ' + (360 / man.width) + '°)');
  assert.equal(man.degrees, 360 / man.width, 'the manifest agrees with itself');
  assert.ok(man.sampleSpacingM <= 2000, 'the slope must be measured at a spacing the proxy supports');
  assert.ok(man.landCellFraction > 0.2 && man.landCellFraction < 0.4, 'about a third of the Earth is land');
  assert.ok(man.meanVs30 > 200 && man.meanVs30 < 800, 'a plausible global mean (got ' + man.meanVs30 + ')');
  const s = read('js/seismic.js');
  const hits = (s.match(/vsm\?vsm\.at\(/g) || []).length;
  assert.ok(hits >= 3, 'the no-DEM cell, the coarse-slope cell and the far field all ask it (got ' + hits + ')');
  assert.match(s, /vsm\.at\(lo,la\)/, 'the far field asks per cell');
  assert.match(read('src/main.js'), /js\/vs30-mask\.js/, 'and the module is loaded');
});
}

/* ═══ from tests/r232-checks.test.mjs (tests #6, #7 of 18) ═══
   R232 source-level regression checks (deterministic, no browser).
   Guards this round's batch:
     ①  a language is ONE FILE — the locale directory is the list, and the generated list follows it
     ②  …and the locales are LAZY: only English is eager, the reader's own is awaited on the boot barrier
     ③  the day/night SHADING replaced the flat night layer, and one owner writes the boolean
     ④  the seismic simulator: past-earthquake presets, rupture directivity, named wavefronts,
         observation points that are major cities which actually shake
     ⑤  Atlas: the place name is printed once, headings do not double-count their spacing, and a
         source card must be about the topic
     ⑥  the phone's layer sheet is the desktop's tile grid, not a second implementation
     ⑦  「戻る」 returns to the tab you came from, the readout stays out of screenshots, and the
         locate button is outlined until it is following you */
{
const ROOT = new URL('../', import.meta.url);
/* ⚠ (#R283) THE CONTENT OF A FILE, NOT THE BYTES THIS CHECKOUT PRODUCED — scripts/eol.mjs. ① also
   runs the generator's own staleness gate, which compared js/locales/_langs.js byte for byte with
   what it renders and therefore called the committed copy stale on every CRLF working copy. */

/* ── ④ the seismic simulator ─────────────────────────────────────────────────────────────────── */
test('R232 seismic: past earthquakes carry published parameters AND the observed outcome', async () => {
  /* ⚠ (consolidation) THE CATALOGUE IS IMPORTED AND ASKED, NOT SPLIT ON `id:`. A row is a full source
     only if the object the simulator loads carries every field with a value — a key typed into the
     file with nothing behind it, or a row the module never exports, reads the same to a text scan. */
  const m = await import('../js/seismic-events.js');
  const byId = new Map(m.QUAKE_EVENTS.map((e) => [e.id, e]));
  for (const id of ['tohoku2011', 'valdivia1960', 'alaska1964', 'sumatra2004', 'kobe1995',
                    'kanto1923', 'turkiye2023', 'wenchuan2008', 'haiti2010']) {
    assert.ok(byId.has(id), `${id} is in the catalogue`);
  }
  /* every row is a full source: mechanism, dimensions, where it nucleated, and where it came from */
  for (const e of m.QUAKE_EVENTS) {
    for (const k of ['lat', 'lng', 'depthKm', 'mw', 'strike', 'dip', 'rake', 'lenKm', 'widKm', 'nucAlong']) {
      assert.ok(typeof e[k] === 'number' && isFinite(e[k]), `${e.id}: a catalogue row is missing ${k}`);
    }
    assert.ok(typeof e.src === 'string' && e.src.length > 20, `${e.id}: a catalogue row is missing src`);
    assert.ok(e.obs && typeof e.obs === 'object' && Object.keys(e.obs).length > 0, `${e.id}: a catalogue row is missing obs`);
  }
  assert.equal(typeof m.ruptureRing, 'function', 'the published rectangle becomes a surface projection');
  /* (spelling kept) js/seismic.js is the panel's closure; which ring it draws first and which fetch it
     drops are statements about its control flow, not values any export returns. */
  const s = read('js/seismic.js');
  assert.match(s, /function applyEvent\(id\)/, 'loading one sets every input');
  assert.match(s, /momentOf\(ev\.mw\)\/\(MU\*A3\)/, 'the slip is derived from the PUBLISHED moment');
  assert.match(s, /function evObsHtml\(ev\)/, '「実測値も併記する」');
});

test('R232 seismic: rupture directivity is kinematic, and the field is not a circle', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const VR_BETA=0\.75;/, 'Vr/β — the rupture runs at 0.75 of the shear speed');
  assert.match(s, /1-VR_BETA\*X\*cosT/, 'Fd = 1 − (Vr/β)·X·cos θ — Ben-Menahem / Somerville');
  assert.match(s, /function rupAxis\(\)/, 'the axis is the rupture, not a corner of its outline');
  assert.match(s, /function fdAt\(lng,lat\)/, 'every receiver has its own Fd');
  /* ⚠⚠ (#R234) THIS ASSERTION WAS INVERTED, AND THAT IS THE POINT OF IT NOW.
     #R232 pinned `const fc=fc0/f;` as the proof that "the apparent corner frequency moves with it" —
     and that division is precisely the defect the reader reported as 「震度計算に大幅な誤差」. It
     slides the whole ω⁻² spectrum, so the high-frequency acceleration plateau (∝ M₀·f_c²) is
     multiplied by 1/Fd² — a factor of 11 at the floor, and the RADIATED ENERGY ∫A²df by a hundred.
     A test that requires the bug is a test that stops the fix (#R229's five «negative» checks), so
     it is reversed rather than deleted: the corner must NOT move, and Fd must live in the apparent
     DURATION that random-vibration theory divides the energy by. See «R234 seismic: directivity is a DURATION» (this file). */
  assert.doesNotMatch(s, /const fc=fc0\/f;/, 'the source spectrum is the same earthquake from every side');
  assert.match(s, /durS:f\/fc0/, '…and Fd is the apparent source duration instead');
  assert.match(s, /profBank/, 'the painted field carries one profile per azimuth');
  assert.match(s, /const profAt=profBank/, '…and a cell reads its own');
});
}

/* ═══ from tests/r234-checks.test.mjs (tests #3, #4, #5 of 13) ═══
    R234 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic rather than text, it is COMPUTED here rather
    than pinned to a number this round happened to produce (#R203/#R229). */
{

/* ── 2 · ⚠⚠ the directivity term no longer creates energy ───────────────────────────────────── */
test('R234 seismic: directivity is a DURATION, and the radiated energy is azimuth-invariant', () => {
  const s = read('js/seismic.js');
  /* the defect: Fd divided into the corner frequencies, which slides the whole spectrum */
  assert.doesNotMatch(s, /const fc=fc0\/f;/, 'the source corner is no longer shifted by Fd');
  assert.doesNotMatch(s, /const fa=Math\.pow\(10,2\.181-0\.496\*mw\)\/f/, 'nor are the two-corner frequencies');
  assert.match(s, /const fc=fc0;/, 'the corner frequency is the source\'s own');
  /* …and Fd survives in the ONE place it belongs: the apparent duration RVT divides by */
  assert.match(s, /durS:f\/fc0/, 'Fd carries the apparent source duration instead');

  /* THE ARITHMETIC, not the text: with the spectrum azimuth-independent, ∫A²df must be identical
     at every azimuth, and the peak must scale as ≈1/√Fd. Both are computed here from the same
     shape the file uses, so this test states the physics rather than quoting this round's numbers. */
  const spec = (fd, f) => {
    const mw = 7.8, M0 = Math.pow(10, 1.5 * mw + 9.1);
    const fa = Math.pow(10, 2.181 - 0.496 * mw), fb = Math.pow(10, 2.41 - 0.408 * mw);
    const eps = Math.min(1, Math.pow(10, 0.605 - 0.255 * mw));
    return M0 * ((1 - eps) / (1 + (f / fa) ** 2) + eps / (1 + (f / fb) ** 2));
  };
  const energy = (fd) => { let m = 0; for (let i = 0; i <= 400; i++) {
    const f = Math.exp(Math.log(0.02) + i * (Math.log(40) - Math.log(0.02)) / 400);
    const A = (2 * Math.PI * f) ** 2 * spec(fd, f); m += A * A * f; } return m; };
  assert.equal(energy(0.3).toFixed(6), energy(1).toFixed(6),
    'the radiated energy is the same toward every azimuth — the #R232 form multiplied it by ~100');

  /* the header has to say what was wrong, because the OLD header argued the opposite and was cited
     as the reason the model was sound (「redistributes energy instead of creating it」) */
  assert.match(s, /the RADIATED ENERGY, ∫A²df, was multiplied by a\s*\n\s*HUNDRED\./,
    'the file records what the measurement showed');
  /* Fd = 1 must still be the old model exactly: durS is 1/fc0 there, as 1/fc used to be */
  assert.match(s, /`durS` is 1\/fc0 at Fd = 1/, 'the no-rupture case is stated to be unchanged');
});

test('R234 seismic: rupAxis is memoised, or the densified rings would cost 147M distances', () => {
  const s = read('js/seismic.js');
  assert.match(s, /if\(_axCache&&_axCache\.ring===fault\.ring&&_axCache\.epi===epi\) return _axCache\.ax;/,
    'the O(n²) axis search runs once per (ring, epicentre), not once per cell');
  assert.match(s, /function _rupAxisCompute\(\)\{/, 'the search itself is a separate function');
});

/* ── 3 · the published rupture is a geodesic outline, not four flat corners ─────────────────── */
test('R234 rupture rings: great-circle vertices, sampled in proportion to the fault', async () => {
  const m = await import('../js/seismic-events.js');
  const D = Math.PI / 180, RE = 6371.0088;
  const gc = (a, b) => { const dl = (b[0] - a[0]) * D, la1 = a[1] * D, la2 = b[1] * D;
    return RE * Math.acos(Math.max(-1, Math.min(1, Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dl)))); };

  const byId = Object.fromEntries(m.QUAKE_EVENTS.map((e) => [e.id, e]));
  /* a 1,300 km rupture cannot be drawn with four points; a 50 km one does not need more */
  assert.ok(m.ruptureRing(byId.sumatra2004).length >= 40, 'Sumatra–Andaman is densified');
  assert.equal(m.ruptureRing(byId.haiti2010).length, 4, 'Haiti is still a quadrilateral');

  /* every ring still measures the PUBLISHED dimensions — this moves the shape, it does not resize it */
  for (const ev of m.QUAKE_EVENTS) {
    const r = m.ruptureRing(ev);
    let longest = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) longest = Math.max(longest, gc(r[i], r[j]));
    const diag = Math.hypot(ev.lenKm, ev.widKm * Math.cos(ev.dip * D));
    assert.ok(Math.abs(longest / diag - 1) < 0.02,
      ev.id + ': the drawn diagonal is the published one (' + longest.toFixed(0) + ' vs ' + diag.toFixed(0) + ' km)');
    for (const p of r) {
      assert.ok(p[0] >= -180 && p[0] <= 180, ev.id + ': longitude is normalised');
      assert.ok(p[1] >= -90 && p[1] <= 90, ev.id + ': latitude is on the Earth');
    }
  }
  /* the flat local-equirectangular patch is gone */
  const src = read('js/seismic-events.js');
  assert.doesNotMatch(src, /const kmPerLng = 111\.32 \* cosLat/, 'no flat km grid stretched over 1,300 km');
  assert.match(src, /Math\.asin\(Math\.max\(-1, Math\.min\(1, sla\)\)\)/, 'the spherical direct formula is used');
});
}

/* ═══ from tests/r235-checks.test.mjs (tests #6 of 9) ═══
    R235 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic it is COMPUTED here rather than pinned to a
    number this round happened to produce (#R203/#R229).

   (layer-manifest) the lists are views of js/layer-manifest.js */
{
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234 — SEVEN rounds of a check hitting its own explanation). Strip the
   comments and match the SYNTAX. */

/* ── 6 · the published rupture outline, and its fallback ────────────────────────────────────── */
test('R235 rupture: the outline is fetched from the published finite-fault model', async () => {
  const ev = code(read('js/seismic-events.js'));
  assert.match(ev, /export function fetchRuptureRing\(ev, fetchImpl\)/, 'there is a fetcher');
  assert.match(ev, /download\/rupture\.json/, 'it reads ShakeMap’s rupture.json');
  /* every catalogue row that has a published model carries its id */
  const ids = (read('js/seismic-events.js').match(/usgs: '/g) || []).length;
  assert.ok(ids >= 8, 'the catalogue carries the USGS event ids (' + ids + ')');

  const { fetchRuptureRing } = await import('../js/seismic-events.js');
  /* a MultiPolygon with a small decoy ring and the real one, closed, with depth ordinates */
  const big = [[0, 0, 5], [1, 0, 5], [1.5, 0.5, 25], [1, 1, 25], [0, 1, 25], [0, 0, 5]];
  const small = [[10, 10, 2], [10.1, 10, 2], [10.1, 10.1, 2], [10, 10, 2]];
  const fake = (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(
    /^https:\/\/earthquake\.usgs\.gov\/fdsnws/.test(url)
      ? { properties: { products: { shakemap: [{ contents: { 'download/rupture.json': { url: 'https://x/rupture.json' } } }] } } }
      : { metadata: { reference: 'Someone et al. (2011)' },
          features: [{ geometry: { type: 'MultiPolygon', coordinates: [[small], [big]] } }] }) });
  const got = await fetchRuptureRing({ usgs: 'testevent1' }, fake);
  assert.ok(got, 'a well-formed model produces a ring');
  assert.equal(got.segments, 2, 'it reports how many segments the published model had');
  /* ⚠ (#R244) the published ring is now DENSIFIED along its great circles — one vertex per ~50 km,
     the same rule #R234 gave the fallback rectangle, because a 500 km edge is not straight on a
     sphere and every cell of the intensity field measures its distance to these vertices. So the
     count is no longer the vertex count of the file; what this pins is what it always meant — the
     LARGEST ring was taken, its closing repeat was dropped, and no original vertex moved. */
  assert.ok(got.ring.length >= 5, 'the largest ring is used (' + got.ring.length + ' points after densifying)');
  assert.ok(got.ring.some((p) => p[0] === 1 && p[1] === 0), 'an original vertex survives untouched');
  assert.ok(!got.ring.some((p) => p[0] === 10), 'and the small decoy ring is not the one that was taken');
  assert.notDeepEqual(got.ring[got.ring.length - 1], got.ring[0], 'the closing repeat is dropped');
  assert.deepEqual(got.ring[0], [0, 0], 'coordinates are (lng, lat) — the depth ordinate is not a coordinate');
  assert.equal(got.zTopKm, 5, 'the top of the plane comes off the polygon');
  assert.equal(got.zBotKm, 25, 'and so does the bottom');
  assert.match(got.ref, /Someone/, 'the reference travels with it, for the attribution line');

  /* ⚠ THE FALLBACK IS THE WHOLE SAFETY PROPERTY: nothing may throw out to the caller */
  const dead = () => Promise.reject(new Error('offline'));
  assert.equal(await fetchRuptureRing({ usgs: 'testevent2' }, dead), null, 'a failed fetch is null, not a throw');
  assert.equal(await fetchRuptureRing({ id: 'kobe1995' }, dead), null, 'an event with no published model is null');

  const s = code(read('js/seismic.js'));
  assert.match(s, /if\(!pub\|\|evId!==want\|\|!opened\) return;/,
    'a fetch that lands after the reader changed events is dropped');
  assert.match(s, /const ring=ruptureRing\(ev\);/, 'the rectangle is still drawn first, so the panel is never empty');
});
}

/* ═══ from tests/r236-checks.test.mjs (tests #13 of 14) ═══
    R236 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).

    ⚠⚠ AND THE FIRST GROUP DRIVES THE REAL SCHEDULER RATHER THAN GREPPING FOR IT.
    #R235's own lesson was that `_pathDeg`'s unit test passed while the caller threw
    its result away — «関数を検査しても配線は検査されない». The runtime is an
    ES module with one export, so the honest check is to RUN it: stub the four
    globals it touches, pump the frame clock by hand, and count. */
{

test('R236 seismic: the 2024 Noto Peninsula earthquake is in the catalogue, from the USGS sheet', async () => {
  /* ⚠ (consolidation) the row the simulator LOADS is asked — js/seismic-events.js exports it */
  const ev = (await import('../js/seismic-events.js')).QUAKE_EVENTS.find((e) => e.id === 'noto2024');
  assert.ok(ev && ev.usgs, 'the event is present with a ShakeMap id to fetch its published outline from');
  assert.equal(ev.usgs, 'us6000m0xl', 'the id is the one on the sheet the reader supplied');
  /* every number on the row is the sheet's: M7.5 · N37.49 E137.27 · 10.0 km · 2024-01-01 07:10:09 UTC */
  assert.equal(ev.when, '2024-01-01T07:10:09Z');
  assert.deepEqual([ev.lat, ev.lng, ev.depthKm, ev.mw], [37.49, 137.27, 10, 7.5]);
  assert.ok(Array.isArray(ev.name) && ev.name.length >= 5 && ev.name.includes('2024年 能登半島地震'),
    'named in five languages');
  /* (spelling kept) «a CALL since #R251» is a claim about the source SHAPE scripts/i18n-report.mjs
     parses — the evaluated value is the same array whichever way it was written. */
  const s = read('js/seismic-events.js');
  const row = s.slice(s.indexOf("id: 'noto2024'"), s.indexOf("id: 'noto2024'") + 1800);
  assert.match(row, /name: LA\([^)]*'2024年 能登半島地震'/,
    'named in five languages — a CALL since #R251, so scripts/i18n-report.mjs can see the ten names');
  assert.ok(ev.obs && typeof ev.obs === 'object', 'and it carries what was observed at the time');
  assert.match([].concat(ev.obs.intensity).join(' '), /JMA 7 \(Shika, Ishikawa\)/, 'including the peak intensity');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #15 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => codeOnly(read(p));

/* ⑮ the published finite-fault outline is sampled like the rectangle it replaced */
test('r244 ⑮ the published rupture ring is densified along great circles', async () => {
  /* (spelling kept) «nested in its one caller» is the tests/r175 ③ rule about where a declaration
     sits in the source — no call can observe it. */
  const src = code('js/seismic-events.js');
  assert.ok(/const densifyRing = \(ring, maxKm\) =>/.test(src), 'nested in its one caller — tests/r175 ③');
  /* ⚠ (consolidation) THE FETCHED OUTLINE IS FETCHED, NOT SPELLED. `fetchRuptureRing` takes its
     fetch as an argument, so it is handed a ShakeMap event and a FOUR-corner rupture.json with
     ~300 km edges — the shape measured on Tohoku — and what comes back must be walked along its
     great circles at <= 50 km, with every published corner still there. */
  const { fetchRuptureRing } = await import('../js/seismic-events.js');
  const corners = [[141, 36], [144, 36.5], [143.2, 39.2], [140.3, 38.8]];
  const RUP = 'https://example.invalid/rupture.json';
  const fake = async (u) => ({ ok: true, json: async () => (String(u) === RUP
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [corners.concat([corners[0]]).map((c) => [c[0], c[1], 20])] } }] }
    : { properties: { products: { shakemap: [{ contents: { 'download/rupture.json': { url: RUP } } }] } } }) });
  const got = await fetchRuptureRing({ usgs: 'test-densify-' + Date.now() }, fake);
  assert.ok(got && Array.isArray(got.ring), 'the fetched outline came back');
  const D = Math.PI / 180, RE = 6371.0088;
  const gc = (a, b) => { const h = Math.sin((b[1] - a[1]) * D / 2) ** 2 + Math.cos(a[1] * D) * Math.cos(b[1] * D) * Math.sin((b[0] - a[0]) * D / 2) ** 2; return 2 * RE * Math.asin(Math.min(1, Math.sqrt(h))); };
  assert.ok(got.ring.length > 4 * 5, 'the fetched outline goes through it — ' + got.ring.length + ' points for four ~300 km edges');
  for (let i = 0; i < got.ring.length; i++) {
    const d = gc(got.ring[i], got.ring[(i + 1) % got.ring.length]);
    assert.ok(d <= 50.5, 'an edge of ' + d.toFixed(1) + ' km survived — the outline was not walked at 50 km');
  }
  for (const c of corners) assert.ok(got.ring.some((p) => Math.abs(p[0] - c[0]) < 1e-9 && Math.abs(p[1] - c[1]) < 1e-9), 'the published corner ' + c + ' moved');
});
}
