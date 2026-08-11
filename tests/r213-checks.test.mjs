/* ============================================================================
 *  IntMap · #R213 source-level invariants and re-run arithmetic
 * ----------------------------------------------------------------------------
 *  No new browser spec (#R207's measurement: the assertions are free, the BOOT is the whole price).
 *  Everything here runs in Node in about a second.
 *
 *  ⚠ AND IT PINS CLAIMS, NOT SHAPES. Where a number appears below it is because the number IS the
 *  claim — Voyager 1 really is ~171 AU from the Sun in 2026, Halley's perihelion really is 0.575 AU,
 *  M31 really is ~770 kpc — and where the claim is a relation the test derives both sides. The one
 *  thing this file must never do is re-state a literal from the code as if it were evidence.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

/* one loaded copy of js/space-bodies.js against a stub window — the same way tests/r208 loads a
   browser module that publishes on `window` and allocates nothing until asked */
let SB = null;
function bodies() {
  if (SB) return SB;
  const w = {};
  new Function('window', 'document', 'fetch', read('js/space-bodies.js'))(
    w, { baseURI: 'https://example.test/' }, () => Promise.reject(new Error('no network in this test')));
  SB = w.IntMapSpaceBodies;
  assert.ok(SB && typeof SB.load === 'function', 'js/space-bodies.js published its module');
  return SB;
}
const D2R = Math.PI / 180;
const rot = (b) => bodies()._kepler.rotator(b.i, b.om, b.w);
const at = (b, jd) => bodies()._kepler.smallPos(Object.assign({}, b, { _rot: rot(b) }), jd);
const r3 = (p) => Math.hypot(p[0], p[1], p[2]);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
   ① THE SPACECRAFT TRAJECTORIES ARE THE REAL ONES
   Hermite interpolation of the bundled Horizons samples, checked against where these spacecraft
   actually are. Voyager 1's distance is the single best-known number in this file — it is on NASA's
   own front page — so it is the one that would catch a frame error, a unit error or an interpolation
   that silently returns the wrong sample.                                                          */
test('R213 ①: the bundled trajectories put each spacecraft where it really is', () => {
  const sc = json('data/spacecraft.json');
  const H = bodies()._kepler.hermite;
  assert.equal(sc.v, 1);
  assert.ok(/Horizons/i.test(sc.source), 'the file names JPL Horizons');
  assert.ok(sc.craft.length >= 15, `the fleet is ${sc.craft.length} — at least the 15 that were asked for`);

  const JD_2026_08_10 = 2461262.5;
  const dist = (key) => { const c = sc.craft.find(x => x.key === key); assert.ok(c, key + ' is in the file'); return r3(H(c.s, JD_2026_08_10).p); };

  /* NASA publishes Voyager 1 at ~171 AU and Voyager 2 at ~143 AU in mid-2026; New Horizons is past
     65 AU. A 3 % window is far tighter than any plausible frame/unit mistake and far looser than the
     ephemeris itself. */
  assert.ok(Math.abs(dist('voyager1') - 171.4) < 5, `Voyager 1 at ${dist('voyager1').toFixed(1)} AU`);
  assert.ok(Math.abs(dist('voyager2') - 143.6) < 5, `Voyager 2 at ${dist('voyager2').toFixed(1)} AU`);
  assert.ok(dist('voyager1') > dist('voyager2'), 'Voyager 1 is the more distant of the two');
  assert.ok(Math.abs(dist('newhorizons') - 65.3) < 3, `New Horizons at ${dist('newhorizons').toFixed(1)} AU`);
  /* JWST orbits Sun–Earth L2, so its heliocentric distance is 1 AU plus 1.5 million km = 1.01 AU */
  assert.ok(dist('jwst') > 1.005 && dist('jwst') < 1.03, `JWST at ${dist('jwst').toFixed(3)} AU (L2 is 1 AU + 0.01 AU)`);
  /* Parker Solar Probe's orbit reaches inside 0.06 AU — nothing else in the file gets near that */
  const parker = sc.craft.find(c => c.key === 'parker');
  const rmin = Math.min(...parker.s.map(s => r3([s[1], s[2], s[3]])));
  assert.ok(rmin < 0.08, `Parker's perihelion sample is ${rmin.toFixed(4)} AU — inside Mercury's orbit`);

  /* ⚠ the honesty fields: a trajectory is not telemetry, and the file has to say which craft are
     still being talked to. Two of them are not. */
  const lost = sc.craft.filter(c => c.contact !== 'active').map(c => c.key);
  assert.ok(lost.includes('pioneer10') && lost.includes('pioneer11'),
    'Pioneer 10/11 are marked as no longer in contact — their position is propagated, not tracked');
  assert.ok(/not telemetry/i.test(sc.warn), 'the manifest states that a trajectory is not telemetry');
});

/* ② HERMITE, NOT A CHORD.
   The property that justifies the sampling interval: between two samples the interpolant must match
   the velocity at both ends, so it beats a straight line by a wide margin on a curved arc. Measured
   against the file's own samples — take three consecutive ones, interpolate the middle from the two
   outer, and compare with the sample that is actually there.                                       */
test('R213 ②: the interpolation reproduces a withheld sample better than a chord does', () => {
  const sc = json('data/spacecraft.json');
  const H = bodies()._kepler.hermite;
  /* ⚠ THE TEST INTERPOLATES OVER TWICE THE SHIPPED STEP, so what it measures is an UPPER BOUND on
     the real error, not the real error: it hides the middle sample and rebuilds it from its two
     neighbours. A cubic Hermite's error goes as h⁴, so the shipped step is about sixteen times
     better than the figures printed below. */
  const measure = (key) => {
    const c = sc.craft.find(x => x.key === key);
    let worse = 0, n = 0, sumH = 0, sumC = 0;
    for (let i = 4; i + 2 < c.s.length; i += 37) {
      const A = c.s[i], M = c.s[i + 1], B = c.s[i + 2];
      const hp = H([A, B], M[0]).p;
      const f = (M[0] - A[0]) / (B[0] - A[0]);
      const cp = [0, 1, 2].map(k => A[1 + k] + (B[1 + k] - A[1 + k]) * f);
      const eH = r3([hp[0] - M[1], hp[1] - M[2], hp[2] - M[3]]);
      const eC = r3([cp[0] - M[1], cp[1] - M[2], cp[2] - M[3]]);
      sumH += eH; sumC += eC; n++; if (eH > eC) worse++;
    }
    return { n, worse, h: sumH / n, c: sumC / n };
  };
  /* Voyager 1 — a nearly straight trajectory at a 90-day step. This is where the mechanism shows:
     matching the velocity at both ends turns a coarse sample into an essentially exact one. */
  const v = measure('voyager1');
  assert.equal(v.worse, 0, 'never worse than a chord on Voyager 1');
  assert.ok(v.h * 20 < v.c, `Voyager 1: Hermite ${v.h.toExponential(2)} AU vs chord ${v.c.toExponential(2)} AU`);
  /* 2×10⁻⁶ AU is 300 km at 171 AU, i.e. 1.8 parts per million of the distance being drawn — and the
     file itself is only stored to 10⁻⁷ AU, so most of what is left is the rounding, not the method. */
  assert.ok(v.h < 1e-5, `and in absolute terms ${(v.h * 149597870.7).toFixed(0)} km over a 180-day span`);
  /* Parker Solar Probe — the hardest case in the file, whipping round the Sun at 190 km/s. The gain
     is smaller because the arc is genuinely curved, and it is still a clear gain. */
  const p = measure('parker');
  assert.equal(p.worse, 0, 'never worse than a chord on Parker either');
  assert.ok(p.h * 2 < p.c, `Parker: Hermite ${p.h.toExponential(2)} AU vs chord ${p.c.toExponential(2)} AU (over 6 days; the shipped step is 3)`);
});

/* ③ KEPLER, ON ALL THREE BRANCHES.
   e<1, e≈1 and e>1 are three different curves. The check is the one property that is true of every
   orbit and cannot be produced by an accident: at the time of perihelion the body is at exactly the
   perihelion distance the catalogue states.                                                         */
test('R213 ③: every orbit passes through its own published perihelion at its own published time', () => {
  const sb = json('data/small-bodies.json');
  const find = (id) => { const b = sb.bodies.find(x => x.id === id); assert.ok(b, id + ' is in the file'); return b; };

  const checks = [
    ['1P', 'elliptic (Halley)'],
    ['1', 'elliptic (Ceres)'],
    ['2017 U1', "hyperbolic ('Oumuamua, e = 1.20)"],
    ['2019 Q4', 'hyperbolic (Borisov, e = 3.36)'],
    ['2023 A3', 'near-parabolic (Tsuchinshan-ATLAS, e = 1.0001)'],
  ];
  for (const [id, what] of checks) {
    const b = find(id);
    assert.ok(isFinite(b.tp), what + ' has a time of perihelion');
    const r = r3(at(b, b.tp));
    assert.ok(Math.abs(r - b.q) / b.q < 0.002, `${what}: r(tp) = ${r.toFixed(5)} AU against q = ${b.q} AU`);
  }
  /* …and a closed orbit really closes: half a period after perihelion, Halley is at aphelion */
  const H = find('1P');
  const aph = r3(at(H, H.tp + H.per / 2));
  assert.ok(Math.abs(aph - H.a * (1 + H.e)) / aph < 0.01, `Halley's aphelion ${aph.toFixed(2)} AU = a(1+e)`);
  /* …and an unbound one never comes back */
  const O = find('2017 U1');
  assert.ok(r3(at(O, O.tp + 3000)) > 40, "'Oumuamua is 40+ AU away 3,000 days after perihelion");
  assert.ok(r3(at(O, O.tp + 6000)) > r3(at(O, O.tp + 3000)), 'and still receding');

  /* the populations the panel offers must all be present */
  const kinds = {}; for (const b of sb.bodies) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
  for (const k of ['asteroid', 'comet', 'tno', 'hyperbolic']) assert.ok(kinds[k] > 0, `there are ${k}s (${kinds[k]})`);
  assert.ok(kinds.comet > 400, `every numbered comet is here (${kinds.comet})`);
  /* ⚠ the selection has to be stated, because "the biggest asteroids" is a claim about a cut */
  assert.match(sb.selection, /150 km/, 'the size cut behind the asteroid set is recorded');
  assert.match(sb.warn, /osculating/i, 'the manifest states what an osculating element set is not');
});

/* ④ THE DEEP SKY HAS MEASURED DISTANCES, AND SAYS SO WHERE IT DOES NOT.
   This is what lets the camera leave the solar system at all (#R208 recorded the honest reason it
   could not), so the distances are checked against values anybody can look up.                     */
test('R213 ④: deep-sky objects carry published distances, and nulls stay null', () => {
  const ds = json('data/deep-sky.json');
  const get = (alias) => ds.objects.find(o => o.alias.includes(alias) || o.main === alias);
  const kpc = (o) => o.pc / 1000;

  const m31 = get('M  31'); assert.ok(m31, 'M31 is in the file');
  assert.ok(Math.abs(kpc(m31) - 780) < 120, `Andromeda at ${kpc(m31).toFixed(0)} kpc (published ≈ 780)`);
  const lmc = get('NAME LMC'); assert.ok(Math.abs(kpc(lmc) - 50) < 12, `the LMC at ${kpc(lmc).toFixed(1)} kpc (≈ 50)`);
  const m87 = get('M  87'); assert.ok(m87.pc / 1e6 > 12 && m87.pc / 1e6 < 22, `M87 at ${(m87.pc / 1e6).toFixed(1)} Mpc (≈ 16.5)`);
  const m42 = get('M  42'); assert.ok(m42.pc > 300 && m42.pc < 600, `the Orion Nebula at ${m42.pc.toFixed(0)} pc (≈ 410)`);

  /* ⚠ CLASSIFICATION IS PREFIX-SHAPED AND THE FIRST BUILD GOT IT WRONG. SIMBAD's `GlC` (globular
     cluster) and `GiC` (galaxy in a cluster) both begin with G, so a galaxy test anchored at ^G
     swallowed every globular and filed M13 as a galaxy. */
  const m13 = get('M  13');
  assert.equal(m13.cls, 'globular', 'M13 is a globular cluster, not a galaxy');
  assert.equal(get('M  57').cls, 'planetary', 'M57 is a planetary nebula');

  /* nothing is given an invented distance */
  const noDist = ds.objects.filter(o => o.pc == null);
  assert.ok(noDist.length > 0, 'some objects genuinely have no published distance');
  assert.equal(ds.withDistance + noDist.length, ds.count, 'the manifest counts both groups');
  assert.ok(ds.objects.every(o => o.pc == null || o.pc > 0), 'a distance is either published or absent — never zero');
  assert.match(ds.method, /median/i, 'the distance is stated to be a median of published measurements');
  assert.ok(ds.objects.filter(o => o.dn > 1).length > 50, 'most distances are a median over several measurements');
});

/* ⑤ THE CAMERA'S REACH IS A PROPERTY OF THE DATA.
   #R208 stopped at 48 pc and wrote down why: past the catalogue there was nothing to draw. The
   ceiling may only move because there is now something out there — so it is derived, not typed.    */
test('R213 ⑤: the zoom-out ceiling is derived from the furthest measured object', () => {
  const space = read('js/space.js');
  /* ⚠ (#R215) THE CLAIM, WIDENED BY A MEASUREMENT. This used to require `if(!showDeep) return
     REACH_AU;` — i.e. with the deep-sky population off, the ceiling is the #R208 constant. Measured
     on the built site, that constant put the ceiling at 22,645 scene units while `starFarEdge` was
     80,729: the STAR catalogue is drawn at its parallax distances in every frame, so the camera was
     penned three and a half times inside the furthest thing on screen and 「太陽系のさらに外の宇宙も
     見れるように」 was still not true. The rule #R208 stated — stop at the furthest thing this scene
     actually draws, never further — is unchanged; what changed is that the stars now count. */
  const reach = space.slice(space.indexOf('function reachAu()'), space.indexOf('function distCeil()'));
  assert.match(reach, /let far=REACH_AU;/, 'the #R208 constant is still the floor of the reach');
  assert.match(reach, /starMaxPc\s*\*\s*AU_PER_PC/, 'and the star catalogue, which is always drawn, raises it');
  assert.match(reach, /B\?B\.deepFarAu\(\):0/, 'and with the deep-sky population on, the reach comes from that data');
  assert.match(space, /function distCeil\(\)\{ return mode==='body'\?60:posScale\(reachAu\(\)\); \}/,
    'the ceiling goes through posScale like everything else — a raw AU limit means a different thing in each scale');

  const ds = json('data/deep-sky.json');
  const far = Math.max(...ds.objects.filter(o => o.pc > 0).map(o => o.pc)) * 206264.806;
  assert.ok(far > 1e7, `the furthest measured object is ${(far / 206264.806 / 1e6).toFixed(1)} Mpc — beyond #R208's 10⁷ AU`);
});

/* ⑥ THE THREE POPULATIONS FETCH NOTHING UNTIL THEY ARE ASKED FOR, AND REPORT THEIR OWN STATE.      */
test('R213 ⑥: the space populations are opt-in and carry loading/ok/error', () => {
  const B = bodies();
  for (const k of ['craft', 'small', 'deep']) {
    assert.equal(B.state(k), 'idle', k + ' has not been fetched');
    assert.equal(B.ready(k), false, k + ' is not ready');
  }
  /* nothing is drawn from an unloaded population — the #R212 rule that "not yet" is not "none" */
  assert.deepEqual(B.craftAt(2461262.5), []);
  assert.deepEqual(B.smallAt(2461262.5, {}), []);
  assert.deepEqual(B.deepSky(), []);
  assert.equal(B.deepFarAu(), 0);

  const space = read('js/space.js');
  /* ⚠ (#R218) INTENDED REPLACEMENT: 「宇宙を探索の表示6つは全部デフォルトでは選択状態に。」 #R213
     defaulted these three OFF on cost grounds and said so; the instruction settles the trade the
     other way. The rest of this test — the per-switch loading/ok/error state — is what makes that
     safe, and it is unchanged. tests/r218-checks ⑥ also checks the loads are actually started. */
  assert.match(space, /let showCraft=true, showSmall=true, showDeep=true;/, 'all three default on');
  assert.match(space, /function popState\(k\)\{/, 'the button can report the fetch state');
  assert.match(space, /litOn\(b,on&&st==='ok'\)/, 'a switch that is on but still fetching does not look like a switch that is on and empty');
});

/* ⑦ THE SETTINGS SOURCES BUTTON GOES TO THE SOURCES PAGE.
   「設定の出典ボタンを押しても、直接新たに作った出典ページに行かなかった。」                            */
test('R213 ⑦: Settings → Data & attribution is the sources page, and the in-app list survives', () => {
  const html = read('index.html');
  const grp = /<div class="setting-group"><label data-i18n="lblDataSources">[\s\S]*?<\/div>/.exec(html);
  assert.ok(grp, 'the Data & attribution group exists');
  assert.match(grp[0], /<a id="link-sources" href="\.\/sources\.html"/, 'the primary control in that group is the page');
  /* (#R215) …and the group offers ONE control. 「アプリ内で簡易一覧を見る←ふざけんじゃねえよ」 — a
     "quick list" beside the real page is a worse copy of the same answer with a choice attached.
     The dialog itself is not deleted (js/app-body.js publishes `window.imOpenSources`); what is gone
     is the second entry in Settings. */
  assert.doesNotMatch(grp[0], /id="btn-data-sources"/, 'the group does not offer a lesser copy beside the page');
  assert.match(read('js/app-body.js'), /window\.imOpenSources\s*=/, 'the in-app dialog is kept reachable rather than deleted');
  /* the duplicate group #R212 left two rows below is gone, so there is one answer to "data sources" */
  assert.doesNotMatch(html, /data-i18n="lblSourcesPage"/, 'the second, duplicate settings group is gone');
  assert.equal((html.match(/href="\.\/sources\.html"/g) || []).length, 2,
    'sources.html is linked from the settings group and from inside the dialog, and nowhere else');
});

/* ⑧ THE INDUSTRY WEB INVENTS NOTHING — ESPECIALLY NOT A CURRENCY.
   The defect this pins was measured on the built site: the panel ranked «Hyundai Mobis $36.02T»
   above «Toyota $28.40T» because Wikidata holds those revenues in WON and YEN and the panel printed
   both behind a dollar sign. A unit error is a fabricated number.                                   */
test('R213 ⑧: revenue carries its own currency, and the ranking says what it converted with', () => {
  const iw = read('js/industry-web.js');
  /* the value node is the only place the unit lives — wdt:/ps: give a bare amount */
  assert.match(iw, /\?c p:\$\{prop\} \?st \. \?st psv:\$\{prop\} \?vn \./, 'a money statement comes through its value node, which is what carries the unit');
  assert.match(iw, /\['rev', 'P2139'\], \['cap', 'P2226'\], \['emp', 'P1128'\]/, 'and revenue / market cap / employees each get their own query');
  assert.match(iw, /wikibase:quantityUnit \?u/, 'the unit is read');
  assert.match(iw, /\?u wdt:P498 \?iso/, 'and resolved to an ISO 4217 code');
  /* ⚠ one property per request — the UNION of the three timed the endpoint out at 65 s (measured) */
  assert.match(iw, /65\.6 s → server timeout/, 'the measurement that forced one-property queries is recorded');
  assert.match(iw, /moneyErr\.push\(kind\)/, 'a refused money query is recorded rather than shown as «no figure»');
  assert.match(iw, /function usdOf\(amount, iso\)/, 'conversion is one function');
  assert.match(iw, /if \(!iso\) return null;/, 'no currency stated → no conversion, rather than an assumed dollar');
  assert.match(iw, /if \(!fx \|\| !fx\.rates\[iso\]\) return null;/, 'no published rate → not converted and not ranked');
  assert.match(iw, /frankfurter/, 'the rates come from the ECB reference series');
  /* the paint ranks on the converted figure and the panel prints the published one */
  assert.match(iw, /rev: n\.revUsd \|\| 0/, 'the circle area is the comparable figure');
  assert.match(iw, /curShort\(n\.rev, n\.revIso\)/, 'the list prints the published figure in its own currency');

  /* every edge is a Wikidata statement — no inferred relationships anywhere */
  assert.match(iw, /wdt:P749\|wdt:P127/, 'edges are parent-organisation / owned-by statements');
  assert.match(iw, /if \(!p\) \{ outside\+\+; continue; \}/, 'an edge whose other end is not on the map is counted, not drawn at an invented place');
  /* the great circle, for the same reason #R212 §6 gave for the 3-D solids */
  assert.match(iw, /function greatCircle\(a, b, n\)/, 'an ownership line follows the great circle, not a screen-space segment');
  /* one window: legend + picker + selection, and closing it unchecks the row */
  /* (#R215) …and that one window is now the app's own generic legend rather than a box of this
     module's own — so the binding to the row is still asserted, without pinning the call's shape. */
  assert.match(iw, /makePanel\('iw-panel'[\s\S]{0,400}'wp-dl-industry'/, 'the panel is bound to its layer row');
  assert.match(iw, /legendId:\s*'wpindustry'/, 'and it renders into the standard legend, not beside it');
  assert.doesNotMatch(iw, /new maplibregl\.Popup|GE\(\)\.ui\.popup/, 'there is no second, separate popup');
  /* it borrows the layer-family toolkit instead of carrying a second copy */
  assert.match(iw, /window\.IntMapWorld && window\.IntMapWorld\._ui/, 'the panel/row toolkit is handed over by js/world-packs.js');
  assert.match(read('js/world-packs.js'), /const _ui=\{ makePanel, uncheckRow, ensureHead, row, esc, usdShort, usdExact, nowYear, onYear, whenDrawable, setVis, L \};/,
    'and world-packs publishes exactly that toolkit');
  /* the module is imported after world-packs, which is what makes the line above true at boot */
  const main = read('src/main.js');
  assert.ok(main.indexOf("js/world-packs.js") < main.indexOf("js/industry-web.js"), 'world-packs is imported first');
  assert.match(read('js/app-body.js'), /window\.IntMapModules\.industryWeb\(IM_HOST\);/, 'and the factory is instantiated');
});

/* ⑨ THE ATMOSPHERE BAND IS THE MODEL'S HUE AT #R196'S MEASURED BRIGHTNESS.
   The claim is a relation, so it is derived from both sides rather than pinned to a hex: above +6°
   the band must be byte-identical to what #R196 measured, and through twilight it must become
   WARMER than the old ramp — which is the physical effect that was missing.                        */
test('R213 ⑨: the horizon band keeps the measured daylight colour and gains a real twilight', async () => {
  const sky = read('js/theme-sky.js');
  assert.match(sky, /const _HZ_VIEW_ELEV=0\.6;/, 'the band is sampled just above the horizon');
  assert.match(sky, /skyColour\(e,_eyeAltM\(\),_relAzimuth\(\),_HZ_VIEW_ELEV\)/, 'from the same integral the far end uses');
  assert.match(sky, /const w=Math\.max\(0,Math\.min\(1,\(6-e\)\/12\)\);\s*if\(w<=0\) return rampHex;/,
    'and above +6° it returns #R196’s measured ramp unchanged');

  /* re-run the arithmetic: the same weighting the file uses, against the same model */
  const { skyColour } = await import(new URL('../js/sky-model.js', import.meta.url));
  const NIGHT = [0x0a, 0x15, 0x26], DAY = [0xc2, 0xcc, 0xd1];
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const band = (e) => {
    const t0 = Math.max(0, Math.min(1, (e + 6) / 12)), t = t0 * t0 * (3 - 2 * t0);
    const ramp = [0, 1, 2].map(i => Math.round(NIGHT[i] + (DAY[i] - NIGHT[i]) * t));
    const w = Math.max(0, Math.min(1, (6 - e) / 12));
    if (w <= 0) return ramp;
    const m = skyColour(e, 0, 90, 0.6).rgb, lm = lum(m);
    if (!(lm > 1)) return ramp;
    const k = lum(ramp) / lm;
    return [0, 1, 2].map(i => Math.max(NIGHT[i], Math.min(255, Math.round(ramp[i] + (Math.min(255, m[i] * k) - ramp[i]) * w))));
  };
  assert.deepEqual(band(45), DAY, 'a high Sun is exactly the colour #R196 measured');
  assert.deepEqual(band(6), DAY, 'and so is the moment the weighting starts');
  const set = band(0), old0 = (() => { const t0 = 0.5, t = t0 * t0 * (3 - 2 * t0); return [0, 1, 2].map(i => Math.round(NIGHT[i] + (DAY[i] - NIGHT[i]) * t)); })();
  assert.ok(set[0] > set[2], `at sunset the band is red-dominant (${set}), which the old grey ramp never was (${old0})`);
  assert.ok(set[0] > old0[0] && set[2] < old0[2], 'redder and less blue than the ramp it replaces');
  assert.ok(lum(band(-20)) <= lum([0x0a, 0x15, 0x26]) + 1, 'deep night floors at the night colour rather than going black');

  /* the band THICKNESS is now geometric, and still 0.55 at the height #R196 measured it at */
  assert.match(sky, /'sky-horizon-blend':_horizonBlend\(\)/);
  assert.match(sky, /if\(!\(h>0\)\) return 0\.55;/, 'at ground level it is unchanged');
});

/* ⑩ EVERY NEW SOURCE IS IN THE ONE REGISTRY BOTH THE DIALOG AND THE PAGE READ (instruction 4).     */
test('R213 ⑩: the four new data sources are registered with their attribution and their limits', () => {
  const w = {}; new Function('window', read('js/reference-data.js'))(w);
  const list = w.IntMapRefData.dataSources;
  const has = (re) => list.find(s => re.test(s.n));
  const horizons = has(/Horizons/i), sbdb = has(/Small-Body/i), simbad = has(/SIMBAD/i);
  assert.ok(horizons && sbdb && simbad, 'Horizons, SBDB and SIMBAD are all registered');
  for (const s of [horizons, sbdb, simbad]) {
    assert.ok(s.u && /^https:\/\//.test(s.u), s.n + ' links to its source');
    for (const lang of ['en', 'jp']) assert.ok((s.use[lang] || '').length > 200, s.n + ' explains itself in ' + lang);
  }
  /* the two limits that would otherwise be assumed away */
  assert.match(horizons.use.en, /not telemetry/i, 'the trajectory/telemetry distinction is written down');
  assert.match(sbdb.use.en, /not good enough to point a telescope/i, 'so is the accuracy of a two-body propagation');
  assert.match(simbad.use.en, /without depth/i, 'and so is what happens to an object with no published distance');
});
