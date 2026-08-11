/* ============================================================================
 *  #R218 — source-level checks (Node only; no browser, no network)
 * ----------------------------------------------------------------------------
 *  The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
 *  it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
 *  ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
 *  cannot be run without a renderer.
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '');

/* ── ① the streamline integrator, RUN against a field whose answer is known ─────────────── */
test('① a solid-body rotation field integrates to a circle, to better than 1 %', () => {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/streamline.js'), ctx, { filename: 'streamline.js' });
  const S = ctx.window.IntMapStreamline;
  assert.ok(S && S.sampler && S.trace && S.spacingIndex, 'js/streamline.js publishes nothing');

  const NX = 41, NY = 41, W = -20, So = -20, dx = 1, dy = 1;
  const u = new Float64Array(NX * NY), v = new Float64Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const lo = W + i * dx, la = So + j * dy;
    const x = lo * S.KM_PER_DEG_LNG * S.cosLat(la), y = la * S.KM_PER_DEG_LAT;
    u[j * NX + i] = -y / 500; v[j * NX + i] = x / 500;          /* rotation about (0,0) */
  }
  const sample = S.sampler({ W, S: So, dx, dy, NX, NY, u, v });
  const seed = [0, 10];
  const r = S.trace(sample, seed, { sign: 1, hKm: 20, maxSteps: 400, vMin: 0.001,
    bounds: { W: -20, E: 20, S: -20, N: 20 } });
  assert.equal(r.pts.length, 401, 'the trace stopped early in a field with no boundary');
  const r0 = S.kmBetween(0, 0, seed[0], seed[1]);
  let worst = 0;
  for (const p of r.pts) worst = Math.max(worst, Math.abs(S.kmBetween(0, 0, p[0], p[1]) - r0) / r0);
  assert.ok(worst < 0.01, `a circle came back with ${(worst * 100).toFixed(2)} % radius error`);
});
test('① …a hole in the field is interpolated from the corners that HAVE a value, and nothing else', () => {
  const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/streamline.js'), ctx, { filename: 'streamline.js' });
  const S = ctx.window.IntMapStreamline;
  const g = { W: 0, S: 0, dx: 1, dy: 1, NX: 2, NY: 2,
    u: [1, 1, 1, NaN], v: [0, 0, 0, NaN], t: [10, 10, 10, NaN] };
  const s = S.sampler(g);
  assert.ok(s(0.1, 0.1), 'a cell with three good corners has no answer');
  assert.equal(s(0.1, 0.1).u, 1, 'the renormalised weights changed a value every corner agreed on');
  const dead = S.sampler({ W: 0, S: 0, dx: 1, dy: 1, NX: 2, NY: 2, u: [NaN, NaN, NaN, NaN], v: [NaN, NaN, NaN, NaN] });
  assert.equal(dead(0.5, 0.5), null, 'a cell with NO data returned a number');
});
test('① …and the evenly-spaced rule actually rejects a nearby seed', () => {
  const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/streamline.js'), ctx, { filename: 'streamline.js' });
  const S = ctx.window.IntMapStreamline;
  const idx = S.spacingIndex(100);
  idx.add(0, 0);
  assert.equal(idx.tooClose(0, 0.4), true, '44 km away was not rejected at d_sep = 100 km');
  assert.equal(idx.tooClose(0, 1.9), false, '210 km away was rejected at d_sep = 100 km');
});

/* ── ② the ear clipper: the guard that used to expire, on rings big enough to expire it ──── */
test('② triangulate() covers the whole ring at every size — the guard no longer runs out', () => {
  const src = read('js/solid3d.js');
  const ringArea = /function ringArea\(p\)\{[^\n]*\r?\n/.exec(src)[0];
  const fn = /function triangulate\(p\)\{[\s\S]*?\r?\n  \}/.exec(src)[0];
  const tri = new Function(ringArea + '\n' + fn + '\nreturn triangulate;')();
  for (const n of [64, 276, 300, 400, 800]) {
    const ring = [];
    for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI, r = 0.3 + 0.06 * Math.sin(5 * t);
      ring.push([0.5 + r * Math.cos(t), 0.5 + r * Math.sin(t)]); }
    const out = tri(ring);
    assert.equal(out.length / 3, n - 2, `a ${n}-vertex cap came back with a hole (${out.length / 3} of ${n - 2} triangles)`);
  }
});
test('② …and the bound is taken ONCE, from the original length', () => {
  const s = code('js/solid3d.js');
  assert.match(s, /const guardMax=idx\.length\*idx\.length\+256;/, 'the guard is not hoisted');
  assert.equal(/guard\+\+<idx\.length\*idx\.length\+256/.test(s), false,
    'the loop bound is still re-evaluated against the shrinking ring');
});

/* ── ③ the seismic profile: the fast index gives the OLD answer ─────────────────────────── */
test('③ the closed-form profile index reproduces the binary search it replaced', () => {
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
test('③ …the distance is factored over the grid, and only when there is no rupture to measure to', () => {
  const s = code('js/seismic.js');
  assert.match(s, /const _fastD=!fault&&!!epi;/, 'the factored distance is not gated on the rupture');
  assert.match(s, /rowA\[j\]\+rowB\[j\]\*colC\[i\]/, 'the haversine is not factored over the grid');
  /* the factorisation must be the same expression — h = sin²(Δφ/2) + cosφ₁cosφ₂ sin²(Δλ/2) */
  const A = 35.7, B = 139.7;                                   /* an epicentre */
  const D = Math.PI / 180, RE = 6371.0088;
  const hav = (a, b) => { const dla = (b[1] - a[1]) * D / 2, dlo = (b[0] - a[0]) * D / 2;
    const h = Math.sin(dla) ** 2 + Math.cos(a[1] * D) * Math.cos(b[1] * D) * Math.sin(dlo) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * RE; };
  let worst = 0;
  for (let j = 0; j < 40; j++) {
    const la = B - 20 + j; const sA = Math.sin((la - A) * D / 2);
    const rowAj = sA * sA, rowBj = Math.cos(A * D) * Math.cos(la * D);
    for (let i = 0; i < 40; i++) {
      const lo = B - 20 + i, sC = Math.sin((lo - B) * D / 2), colCi = sC * sC;
      const fast = 2 * Math.asin(Math.min(1, Math.sqrt(rowAj + rowBj * colCi))) * RE;
      worst = Math.max(worst, Math.abs(fast - hav([B, A], [lo, la])));
    }
  }
  assert.ok(worst < 1e-9, `the factored distance differs by ${worst} km`);
});
test('③ …the picture leaves the canvas as a blob, and every replaced one is revoked', () => {
  const s = code('js/seismic.js');
  assert.match(s, /function pngURL\(cv\)/, 'the blob encoder is missing');
  assert.match(s, /URL\.createObjectURL/, 'the object URL is not created');
  assert.match(s, /URL\.revokeObjectURL/, 'an object URL is created and never revoked');
  assert.equal((s.match(/_revoke\(/g) || []).length >= 5, true, 'not every path that drops a field revokes it');
});

/* ── ④ the sky: ozone is present, published, and only changes what it should ────────────── */
test('④ ozone is in the optical depth of BOTH rays, and absorbs only', async () => {
  const s = code('js/sky-model.js');
  assert.match(s, /const BO = \[0\.650e-6, 1\.881e-6, 0\.085e-6\];/, 'the published Chappuis extinction is not there');
  assert.match(s, /ozone = \(h\) => Math\.max\(0, 1 - Math\.abs\(h - 25000\) \/ 15000\)/, 'the tent profile is not there');
  assert.match(s, /BO\[k\] \* \(odO \+ odOs\)/, 'ozone is not applied to both the view ray and the sun ray');
  /* …and it must not appear in any phase function: ozone scatters nothing */
  assert.equal(/pR[\s\S]{0,200}BO|BO[\s\S]{0,80}(pR|pM)/.test(s), false, 'ozone entered a phase function');
});
test('④ …and it makes twilight bluer without moving the noon calibration', async () => {
  const src = read('js/sky-model.js');
  const load = async (code2) => (await import('data:text/javascript;base64,' + Buffer.from(code2, 'utf8').toString('base64'))).skyColour;
  const withO = await load(src);
  const noO = await load(src.replace('const BO = [0.650e-6, 1.881e-6, 0.085e-6];', 'const BO = [0,0,0];'));
  const br = (c) => c[2] / Math.max(1, c[0]);
  /* twilight: measurably bluer */
  const a = br(noO(-4, 0, 90, 20).rgb), b = br(withO(-4, 0, 90, 20).rgb);
  assert.ok(b > a * 1.08, `ozone moved the blue/red ratio at −4° only from ${a.toFixed(3)} to ${b.toFixed(3)}`);
  /* noon: #R202's Cesium calibration must not move — the far end of the gradient stays put */
  const n0 = noO(75, 30, 90).rgb, n1 = withO(75, 30, 90).rgb;
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(n0[k] - n1[k]) <= 3,
    `ozone moved the noon sky by ${Math.abs(n0[k] - n1[k])} counts on channel ${k}`);
});

/* ── ⑤ the reading pages: one file per language, and every language complete ─────────────── */
test('⑤ each language is exactly one file, and js/page-i18n.js lists them all', () => {
  const rt = read('js/page-i18n.js');
  const codes = [...rt.matchAll(/\{ code: '([a-z]{2})'/g)].map((m) => m[1]);
  assert.deepEqual(codes, ['en', 'ja', 'de', 'ru', 'es'], 'the LANGS table is not the five languages');
  const files = readdirSync(join(ROOT, 'js', 'locales')).filter((f) => /^pages\.[a-z]{2}\.js$/.test(f)).sort();
  assert.deepEqual(files, codes.map((c) => 'pages.' + c + '.js').sort(), 'a listed language has no file, or a file is not listed');
  /* adding a language must not mean editing the build list: the DIRECTORY is what ships */
  assert.match(read('vite.config.js'), /'js\/locales',/, 'js/locales is not copied to dist as a directory');
});
test('⑤ …the two pages carry no prose of their own any more', () => {
  for (const p of ['sources.html', 'science.html']) {
    const h = read(p);
    assert.equal(/data-l="(ja|en)"/.test(h), false, `${p} still carries the two-language span pairs`);
    assert.equal(/<style/.test(h), false, `${p} still has a stylesheet of its own`);
    assert.match(h, /css\/pages\.css/, `${p} does not use the shared stylesheet`);
    assert.match(h, /js\/page-i18n\.js/, `${p} does not load the language machine`);
  }
  /* the registry is still generated from ONE list, not transcribed (#R212's invariant) */
  const sl = read('js/sources-list.js');
  assert.match(sl, /window\.IntMapRefData && window\.IntMapRefData\.dataSources/);
  assert.equal(/dataSources\s*=\s*\[/.test(sl), false, 'the page carries its own copy of the list');
});
test('⑤ …and every registry entry has a description in all five languages', async () => {
  const ctx = { console };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['js/reference-data.js', 'js/locales/pages.de.js', 'js/locales/pages.ru.js', 'js/locales/pages.es.js'])
    vm.runInContext(read(f), ctx, { filename: f });
  const list = ctx.window.IntMapRefData.dataSources;
  assert.ok(list.length > 80, 'the registry shrank');
  for (const s of list) {
    assert.ok(s.use && s.use.en && s.use.jp, `${s.n} is missing its en/jp description`);
    for (const c of ['de', 'ru', 'es']) {
      const doc = ctx.window.IntMapPageI18N._d[c];
      assert.ok(doc.sourceUse && doc.sourceUse[s.n], `${s.n} has no ${c} description`);
    }
  }
  /* …and nothing translated that is no longer in the registry */
  const names = new Set(list.map((s) => s.n));
  for (const c of ['de', 'ru', 'es'])
    for (const k of Object.keys(ctx.window.IntMapPageI18N._d[c].sourceUse))
      assert.ok(names.has(k), `${c} describes "${k}", which is not in the registry`);
});
test('⑤ …and the app fetches those descriptions only when it needs them', () => {
  const s = code('js/app-body.js');
  assert.match(s, /\['de','ru','es'\]\.includes\(currentLang\)&&!_pgDoc\(currentLang\)/,
    'the Sources dialog does not lazily load the translated descriptions');
  assert.equal(/import .*locales\/pages/.test(read('src/main.js')), false,
    'a locale file is in the eager bundle — the five-language registry must cost a phone nothing at start-up');
});

/* ── ⑥ space: the Moon's orbit, the moons that were inside their planet, six switches ────── */
test('⑥ the orbit pass walks the list the BODIES are drawn from, so the Moon is in it', () => {
  const s = code('js/space.js');
  assert.match(s, /for\(const id of BODIES\)\{\s*\r?\n\s*if\(id==='sun'\) continue;/,
    'the orbit loop still walks the ephemeris planet list, where the Moon is not');
  assert.match(s, /const o=\(id==='moon'\)\?moonOrbitBuf\(jd\):orbitBuf\(id,jd\)/, "the Moon's own orbit buffer is gone");
  /* the reason it was dead code: ephemeris ORDER is the nine planets */
  assert.equal(/'moon'/.test(/const ORDER=\[[^\]]*\]/.exec(read('js/ephemeris.js'))[0]), false,
    'ephemeris now lists the Moon — the special case above may no longer be needed');
});
test('⑥ …a satellite is pushed clear of its primary at model scale, and not at true scale', () => {
  const s = code('js/space.js');
  assert.match(s, /const clearKm=\(scale==='real'\)\?0:radScale\(b\.rKm\)\*1\.18;/, 'the clearance is missing');
  assert.match(s, /d=clearKm\+moonSep/, 'the clearance is not added to the separation');
  assert.equal(/Math\.max\(moonSep/.test(s), false, 'a clamp would pile the inner moons at one distance');
  /* the arithmetic the defect rests on: Metis is INSIDE Jupiter under the old law */
  const POS_P = 0.42, RAD_K = 0.12, MOON_K = 0.42, REF = 384400;
  const radScale = (km) => RAD_K * Math.pow(km / 6378.137, 1 / 3);
  const moonSep = (km) => MOON_K * Math.pow(km / REF, POS_P);
  assert.ok(moonSep(128000) < radScale(71492), 'the premise of the fix no longer holds — recheck the note');
  assert.ok(radScale(71492) * 1.18 + moonSep(128000) > radScale(71492), 'the fix does not clear the planet');
});
test('⑥ …all six display switches default ON and their data is asked for when the view opens', () => {
  const s = code('js/space.js');
  assert.match(s, /let showOrbits=true, showNames=true, showMoons=true;/);
  assert.match(s, /let showCraft=true, showSmall=true, showDeep=true;/, 'the three populations still default off');
  assert.match(s, /\[\['craft',showCraft\],\['small',showSmall\],\['deep',showDeep\]\]\.forEach\(\(\[k,on\]\)=>\{ if\(!on\) return;/,
    'the populations default on but nothing fetches them when the view opens');
});
test('⑥ …the sources panel opens upward so its button does not move, and the return gauge is above the sky', () => {
  const s = code('js/space.js');
  assert.match(s, /flex-direction:column-reverse/, 'the sources panel still pushes its own button up the screen');
  const z = /gauge\.style\.cssText='position:fixed;bottom:96px;transform:translateX\(-50%\);z-index:(\d+);/.exec(s);
  assert.ok(z, 'the approach gauge lost its style');
  const view = /root\.style\.cssText='position:fixed;inset:0;z-index:(\d+);/.exec(s);
  assert.ok(view, 'the space view lost its style');
  assert.ok(+z[1] > +view[1], `the gauge (z ${z[1]}) is still behind the space view (z ${view[1]}) on the way back`);
});

/* ── ⑦ the ocean-current layer is a field now, and still fabricates nothing ─────────────── */
test('⑦ the currents are the bundled, measured dataset (#R219 replaced the live streamlines)', () => {
  /* ══ ⚠ (#R219) INTENDED REPLACEMENT — THE LAYER IS NOW A BUNDLED DATASET ═══════════════════════
     「海流レイヤー、思ってたのと違う。ちゃんと**もとからデータが固定された**レイヤーとして地図上に
      描画してください。作り直せ。」（確認済：「同梱の固定データで常時描画」）
     #R216/#R218's invariant — «this file ships no current of its own, every number is fetched live»
     — was the right answer to the question those rounds were asked, and it is the OPPOSITE of the
     one this round was asked. The provenance rule is unchanged and is what these assertions now
     check ONE LEVEL OUT: the paths are still traced through a measured velocity field (NASA/JPL
     OSCAR), warm/cold is still derived rather than asserted, and nothing is a drawing — the tracing
     simply happens in scripts/build-ocean-currents.mjs instead of in the browser, and the answer
     ships as data/ocean-currents.json. See tests/r219-checks ④ and DEV-NOTES #R219 §3. */
  const s = read('js/ocean-currents.js');
  assert.match(s, /data\/ocean-currents\.json/, 'the layer must read the bundled dataset');
  assert.equal(/marine-api\.open-meteo/.test(s), false, 'a fixed dataset does not fetch a field per viewport');
  assert.equal(/wd:Q129558/.test(s), false, 'the names ship with the data now, in five languages');
  /* the provenance moved to the build script and to the file; both must still carry it */
  const b = read('scripts/build-ocean-currents.mjs');
  assert.match(b, /jplOscar/, 'the paths must still be traced through the measured OSCAR field');
  assert.match(b, /poleward/i, 'warm/cold must still be DERIVED from the flow, not asserted');
  const doc = JSON.parse(read('data/ocean-currents.json'));
  assert.match(String(doc.source || ''), /OSCAR/, 'the dataset must name its source');
  assert.ok(doc.named.length >= 20 && doc.named.every((c) => Array.isArray(c.path) && c.path.length >= 5),
    'every named current carries a traced path');
  /* the image is still registered on the object that has addImage (#R216 ③).
     ⚠ against the COMMENT-STRIPPED source: the file explains the trap in prose, and a scan of the
     prose is not a scan of the program. */
  const c = code('js/ocean-currents.js');
  assert.equal(/layers\.addImage/.test(c), false, 'addImage is on scene, not layers');
  assert.match(c, /GE\(\)\.scene\.addImage\(name,/);   /* (#R220) two glyphs, one helper */
});
test('⑦ …and the marine model + Wikidata are still both declared', () => {
  const r = read('js/reference-data.js');
  assert.match(r, /Open-Meteo Marine/);
  assert.match(r, /ocean-current velocity and direction/);
  assert.match(r, /ocean currents with their published coordinates/);
});

/* ── ⑧ the smaller wirings: trade, tides, crops, seismic click mode, flight sim, rivers ─── */
test('⑧ the trade direction segment re-lights when it is pressed', () => {
  const s = code('js/world-packs.js');
  assert.match(s, /\.wp-x'\)\.onclick=\(\)=>\{ dir='X'; render\(\); load\(iso,true\); \}/);
  assert.match(s, /\.wp-m'\)\.onclick=\(\)=>\{ dir='M'; render\(\); load\(iso,true\); \}/);
});
test('⑧ the tide shading is painted from the scan, before anything is tapped', () => {
  const s = code('js/world-packs.js');
  assert.match(s, /function paintFloodFromStations\(\)/);
  assert.match(s, /drawStations\(\); paintFloodFromStations\(\);/, 'the scan does not shade');
  assert.match(s, /const at=\(typeof level==='function'\)\?level:\(\)=>level;/, 'paintFlood still takes only one level');
});
test('⑧ the crop raster is fetched per quadtree cell and kept', () => {
  const s = code('js/world-packs.js');
  assert.match(s, /function _cellBox\(W,E,S,N\)/, 'the request is still the raw viewport');
  assert.match(s, /const hit=_cacheGet\(key\);/, 'nothing is cached');
  assert.match(s, /_cachePut\(key,\{ url:out\.url, coords, meta \}\);/);
  assert.match(s, /const lngOf=\(x\)=>x\/HALF\*180;/, 'the image corners are not taken from the requested box');
});
test('⑧ both seismic click modes turn off when pressed again, and an unarmed map is not claimed', () => {
  const s = code('js/seismic.js');
  assert.match(s, /if\(clickMode==='epi'\) setClickMode\('none'\)/, 'the epicentre segment has no off state');
  assert.match(s, /setClickMode\(clickMode==='station'\?'none':'station'\)/, 'the place segment has no off state');
  const oc = /function onClick\(e\)\{[\s\S]*?setEpi\(\[e\.lngLat\.lng,e\.lngLat\.lat\]\); refresh\(\); \}/.exec(s)[0];
  assert.ok(oc.indexOf("clickMode==='none'") < oc.indexOf('claimClick'),
    'the panel claims the tap before deciding whether it wants it');
});
test('⑧ the flight sim starts without asking, and its phone deck drops the duplicate instruments', () => {
  const s = code('js/flight-sim.js');
  assert.equal(/fs-rot-x/.test(s), false, 'the blocking "turn your phone" screen is still there');
  assert.match(s, /#fs-rotate\{position:fixed;left:50%/, 'the rotate hint is not a chip');
  assert.match(s, /#fs-hud \.fs-sixpack,#fs-hud \.fs-pfd,#fs-hud \.fs-boost,#fs-hud \.fs-hint\{display:none !important;\}/,
    'the phone still draws four readouts of the same four numbers');
  /* the lock is still attempted — the hint replaced the GATE, not the landscape request */
  assert.match(s, /o\.lock\('landscape'\)/);
});
test('⑧ the river course is asked about the river, not about the pixel', () => {
  const rc = code('js/river-course.js');
  assert.match(rc, /async function course\(clickedProps,lngLat,opts\)/, 'course() takes no context');
  assert.match(rc, /opts\.names&&opts\.names\.size/, 'the whole closure name set is not used');
  assert.match(rc, /function _minKmToAny\(geo,pts\)/, 'a candidate is still measured against the click alone');
  assert.match(rc, /_overpass\(names,lng,lat,bbox\)/, 'the Overpass box is still drawn round the click');
  const mu = code('js/map-ui.js');
  assert.match(mu, /RC\.course\(props,lngLat,\{ names:allNames, nameList:allList, anchors, bbox:_riverBbox\(tile\) \}\)/,
    'map-ui does not hand the closure over');
});
test('⑧ …and the name closure itself is the same for every segment of one river', () => {
  const ctx = { console, fetch: async () => ({ ok: false }) };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/river-course.js'), ctx, { filename: 'river-course.js' });
  const RC = ctx.window.IntMapRiverCourse;
  const segs = [
    { properties: { name: 'Donau', 'name:en': 'Danube', class: 'river' } },
    { properties: { name: 'Duna', 'name:en': 'Danube', class: 'river' } },
    { properties: { name: 'Duna', class: 'river' } },
    { properties: { 'name:en': 'Danube', class: 'river' } },
    { properties: { name: 'Donau', class: 'ditch' } },
    { properties: { name: 'Rhein', 'name:en': 'Rhine', class: 'river' } },
  ];
  let first = null;
  for (const i of [0, 1, 2, 3]) {
    const picked = RC.sameRiver(segs[i].properties, segs, { limit: 100 });
    const names = new Set();
    picked.forEach((f) => RC.nameSet(f.properties).forEach((n) => names.add(n)));
    const key = [...names].sort().join('|');
    if (first == null) first = key; else assert.equal(key, first, `segment ${i} asks a different question`);
    assert.equal(picked.length, 4, `segment ${i} matched ${picked.length} of the 4 river ways`);
  }
});

/* ── ⑨ the split gate learned about the standalone pages ────────────────────────────────── */
test('⑨ a module reached only by a page <script src> counts as reachable, and only that way', () => {
  const s = read('scripts/static-checks.mjs');
  assert.match(s, /for \(const page of \['sources\.html', 'science\.html', 'admin\.html'\]\)/,
    'the reachability scan does not read the standalone pages');
  /* ⚠ read the check WITHOUT its comments: the two file names appear in the note that explains why
     the scan reads the pages, and that note is the thing this test is here to protect (#R216). */
  assert.equal(/page-i18n|sources-list/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')), false,
    'the two modules are exempted by name instead of being found in the page that loads them');
});
