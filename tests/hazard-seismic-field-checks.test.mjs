/* ============================================================================
 *  THE SEISMIC SIMULATOR — the painted intensity field
 * ----------------------------------------------------------------------------
 *  The fine field and the far raster: grid, land / sea, the DEM snapshot, the site raster, colour and alpha.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The painted field (buildField, buildFar, fieldPx)
 *    lives inside js/seismic.js's factory closure and paints into a canvas the renderer owns; none of
 *    it is exported, so those tests read the source, comments stripped. js/coast-mask.js and the DEM
 *    store are asked where they can be.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #13 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{
test('R189 seismic: the intensity is a terrain-aware painted field, not contour circles', () => {
  const src = read('js/seismic.js');
  assert.match(src, /async function buildField\(\)\{/, 'the field is built from the DEM');
  assert.match(src, /VS30_BINS=\[\[1e-4,180\],\[2\.2e-3,240\],\[6\.3e-3,300\],\[0\.018,360\],\[0\.05,490\],\[0\.10,620\],\[0\.138,760\]\];/,
    'Wald & Allen 2007 active-tectonic slope table');
  /* ⚠ (#R218) the two quantities now come out of ONE index lookup (prof.both) instead of two. The
     profile, the interpolation and the per-cell multiply are unchanged; only the binary SEARCH for
     the node was replaced by the closed form the geometric table already implies.
     #R218 ③ (tests/hazard-seismic-source-checks) runs the old and the new interpolation against each other. */
  /* (#R232) one index for both quantities still — but the profile is now chosen by azimuth, because
     rupture directivity makes the source term a function of direction as well as distance. */
  assert.match(src, /const b2=(?:prof|profAt\(lo,la\))\.both\(rM\);/, 'one RVT profile, one index for both quantities');
  /* ⚠ (#R263) THE PROPERTY IS «THE CELL'S SITE TERM SCALES BOTH QUANTITIES», NOT «ONE MULTIPLY».
     #R189 wrote this as a literal because the site term was a single scalar and one multiply was
     literally all it took. #R263 added the FREQUENCY-DEPENDENT half of the same site term, so a cell
     now applies the scalar `g` and then a shape correction `kk` — two multiplies for two halves of
     one term. What #R189 was defending (both PGV and a₀ scale with this cell's own ground, off one
     index into one profile) is unchanged, so the assertion states that instead. */
  assert.match(src, /let pgv=b2\[0\]\*g, a0=b2\[1\]\*g;/, 'the cell\'s scalar site term scales both quantities');
  assert.match(src, /if\(bank\)\{ const kk=bank\.at\(/, '…and the frequency-shape half is applied to the same pair');
  assert.match(src, /pgv\*=kk\[0\]; a0\*=kk\[1\];/, 'PGV takes the PGV correction and a₀ takes the a₀ one');
  /* ⚠ (#R212) SEA cells are still not painted — but a cell below zero is no longer assumed to be
     sea. 「海抜0m以下の土地は震源分布の対象外にされるのを辞めろ」: the Jordan Rift, a quarter of the
     Netherlands, the Caspian Depression and Death Valley are dry land below zero and were dropped
     out of the map entirely. The land mask decides, bounded at −440 m (below which nothing on Earth
     is dry), and the sign of the elevation only decides where the mask has nothing to say. */
  /* ⚠ (#R215) THE CLAIM, NOT THE LINE. This used to pin the exact `landMask&&landMask.isLand(...)`
     text, which is #R203's trap: the claim survived while the literal did not. The land answer now
     comes from `landAt()` — js/coast-mask.js rasterised into THIS field's own grid, with the 19.5 km
     bundled mask behind it — because deciding a 1.5 km cell's coast with a 19.5 km majority raster
     is the 「大きなタイルでごまかすな」 the report was about. What must stay true is the RULE. */
  assert.match(src, /if\(!\(landAt\(k,lo,la\)===true&&e0>-440\)\)\{ sea\+\+; vs\[k\]=-1; continue; \}/,
    'a sub-zero cell is sea unless the land answer says it is land, and only down to −440 m');
  assert.match(src, /LYR_IMG='seis-mmi-fill'/, 'rendered as a raster fill');
  assert.ok(!/id:'seis-mmi',/.test(src), 'the dashed contour layer is gone');
  assert.ok(!/'seis-mmi-lbl'/.test(src), 'and its labels with it');
  /* (#R190) the fallback is declared — and now names the real cause, which is resolution, not outage */
  assert.match(src, /この範囲では地形が粗く一様地盤で表示/, 'an unusable site term is declared, not hidden');
});
}

/* ═══ from tests/r191-checks.test.mjs (tests #6, #7 of 11) ═══
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

test('R191 seismic: the field is painted to the end of the lowest class', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const MMI_CALIB_KM=1000;/, 'where the law is calibrated — unchanged');
  assert.match(s, /const MMI_TERRAIN_KM=1500;/, 'how far the terrain-driven fine field goes');
  assert.match(s, /const MMI_MAX_KM=8000;/, 'and where the lowest class finally ends');
  /* (#R247) …against the SURFACE edge — see the note in tests/r190-checks. */
  assert.match(s, /const rFine=Math\.min\(rEdgeSurf,MMI_TERRAIN_KM\);/, 'the fine box is bounded by the terrain');
  /* (#R232) it takes the azimuth-indexed profile PICKER now, not a single profile — see the
     directivity note in js/seismic.js. Its own pass is what is being pinned. */
  assert.match(s, /async function buildFar\(prof(?:At)?,box,rFine,rEdge,seq,win\)/, 'the annulus has its own pass');
  /* ⚠ (#R248) UPDATED, AND THE FACT IT PINNED HAS CHANGED ON PURPOSE. This used to require
     `coords:[[-180,85],[180,85],[180,-85],[-180,-85]]` — a WHOLE-WORLD raster, which #R191 chose so
     that no box could wrap the antimeridian or degenerate at a pole. The cost was that the cell is
     the planet divided by the budget whatever the field's size: measured at 22.4 km beside a fine
     field of 1.17 km, i.e. 「解像度が劇的に悪くなる」 at exactly r = 1,500 km. #R248 sizes the raster
     to the field instead and keeps #R191's two failures away by MEASURING for them — a cap that
     contains a pole or crosses ±180 still gets the whole 360° in x. What is pinned now is that the
     placement is the WINDOW's own edges, so the image can never be placed anywhere else. */
  assert.match(s, /coords:\[\[win\.W,win\.Nn\],\[win\.E,win\.Nn\],\[win\.E,win\.Ss\],\[win\.W,win\.Ss\]\]/,
    'the image is placed at the window it was computed on, and the window keeps the whole world in x when the cap wraps or holds a pole');
  assert.match(s, /if\(!full&&\(C0\[0\]-dLng<-180\|\|C0\[0\]\+dLng>180\)\) full=true;/,
    'the antimeridian case is decided by measurement, not by hoping');
  /* (#R192) …and the land test is no longer a DEM read at all — a mask that half-arrives is what
     painted the ocean. It is the bundled raster, and a missing one means no annulus rather than a
     painted sea. See tests/r192-checks. */
  /* ⚠ (#R250) THE RULE IS «NO SEA», NOT «THIS SPELLING». The far raster's land test used to be
     `land.isLand(lo,la)!==true` — the bundled 19.6 km majority — which was the finer of the two
     while this raster's cell was 28–52 km. #R248/#R249 took the cell to 1.17 km and left the test
     at 19.6 km, so the coastline past 1,500 km became a 19.6 km staircase (measured: 2.03 % of the
     cells over a 600 km patch answer differently). It now asks js/coast-mask.js at THIS grid and
     falls back to exactly the old call, so the assertion pins the INTENT and both branches. */
  assert.match(s, /if\(!landAtFar\(kIdx,lo,la\)\)\{ seaSkipped\+\+; continue; \}/,
    'and it does not paint the sea, because the fine field does not either');
  assert.match(s, /const landAtFar=\(k,lo,la\)=>\(coastFar\?\(coastFar\[k\]===1\):\(land\.isLand\(lo,la\)===true\)\)/,
    'the land answer must still fall back to the bundled mask when no country outline has arrived');
  assert.ok(/the far field is not drawn rather than painted over the sea/.test(s),
    'and with no mask at all it draws nothing — it never falls back to painting everything');
});

test('R191 seismic: the intensity field reads a FROZEN DEM, so it cannot come out striped', () => {
  const s = read('js/seismic.js');
  const build = s.slice(s.indexOf('async function buildField'), s.indexOf('function ensure()'));
  /* (#R216) the binding became `let`: #R216 re-warms ONCE when more than a third of the tiles missed
     the deadline and replaces the snapshot before the loop starts, because a field built from mostly
     missing DEM is painted with one site class — i.e. as concentric circles, which is what that round
     was asked to remove. The invariant this test exists for is unchanged: the LOOP reads one frozen
     snapshot, so a row's answer cannot depend on when it was computed. */
  /* (#R223) …and the same call now carries the land filter, so `want`/`missing` describe the set
     that was actually asked for rather than counting the open ocean as a failure. */
  assert.match(build, /(?:const|let) snap=\(typeof demSnapshot==='function'\)\?demSnapshot\(W,Ss,E,Nn,z,_keepTile\):null;/,
    'one snapshot for the whole picture');
  /* ⚠ (#R226) THE INVARIANT IS «THE LOOP READS THE SNAPSHOT», NOT «IT CALLS at()». #R226 made the
     read row-coherent — one sampler prepared per latitude instead of `at()` per sample, because the
     four transcendentals inside `_ll2tile` and the Map key are all latitude and the latitude is
     constant along a row. `at()` is now that same sampler (js/map-readout.js), so the frozen-DEM
     property this test exists for is untouched; what changed is how often the row half is evaluated. */
  assert.match(build, /const _rowAt=\(snap&&snap\.rowSampler\)/, 'and the loop reads it — by row');
  assert.match(build, /const _hereAt=_rowAt\(la\), _northAt=_rowAt\(/, 'both of the row\'s latitudes, prepared once');
  assert.ok(!/demElevAt\(/.test(build),
    'and no demElevAt in the loop: it REQUESTS, which is what evicted the tiles the field was reading');
  assert.ok(!/demElevBilinear\(lo\+dLngS,la,z\)/.test(build), 'the slope samples come from the snapshot too');
  const ro = read('js/map-readout.js');
  assert.match(ro, /function demSnapshot\(w,s,e,n,z,keep\)/, 'the snapshot holds decoded buffers');
  /* (#R221) demTilePoints joined the export list between demSnapshot and demZoomForMap — the field
     now warms the TILE GRID rather than a fixed lattice of positions. */
  /* (#R265) `demVoidStats` joined the list between them — how much of the published elevation data
     was a hole, so a void tile is reportable instead of silent. The property is that the snapshot is
     exported at all, not what its neighbours are.
     ⚠ (#R671) …and this line USED TO SPELL OUT THE NEIGHBOURS, one comment under the sentence that
     says they are not the property. It went red when the store gained demLeaseOpen/demStoreStats —
     a correct addition reported as a defect. It now asks the question the comment asks. */
  const exported = (Array.from(ro.matchAll(/return \{([^{}]*)\};/g)).map(m => m[1])
    .find(b => /\bdemElevAt\b/.test(b)) || '').split(',').map(s2 => s2.trim().replace(/:.*$/, ''));
  for (const name of ['demElevBilinear', 'demSnapshot', 'demTilePoints', 'demVoidStats', 'demZoomForMap'])
    assert.ok(exported.includes(name), name + ' must be exported by js/map-readout.js');
  assert.match(read('js/app-body.js'), /get demSnapshot\(\)\{ return demSnapshot; \}/, 'through the host contract');
});
}

/* ═══ from tests/r202-checks.test.mjs (tests #16 of 17) ═══
    R202 — the sky is computed, the source is integrated, and the far plane reaches the horizon
    Twelve instructions, and the ones with physics or arithmetic behind them are checked by RUNNING
    that arithmetic rather than by asserting on the text that contains it:

      ① js/sky-model.js is pure — no DOM, no renderer — so the scattering integral runs here.
      ② src/tsunami-worker.js loads into a Node vm (the harness tests/r197-checks.test.mjs built), so
         the cell-averaged source is compared against the centre sample it replaces.

    The rest are seam checks of the kind this suite has used since #R162: a capability that is
    declared must be implemented, a contract method that is called must exist, and a value that two
    files have to agree on is derived from one of them rather than written down twice. */
{
const rd = read;

test('R202 ③i the seismic mesh got finer, and the sky model is not wired twice', () => {
  /* ⚠ (#R203) A RELATION, NOT A VALUE. This pinned 448 exactly, so the very next round that made the
     mesh finer — the direction the instruction always points — broke a test whose own subject is
     "it got finer". What #R202 established is the FLOOR; #R203 raised the mesh to 640/288. */
  /* ⚠ (#R204) …AND A RELATION ABOUT THE GRID, NOT ABOUT THE LINE THAT DECLARES IT. #R203 fixed the
     VALUE and left the regex pinning one exact source line, so #R204 — which replaced the fixed grid
     with a cell size and a floor/ceiling — broke it again for the same reason. What both rounds mean
     by "finer" is the FLOOR: the coarsest grid this code can ever choose. */
  const seisN = /const CELL_KM=[\d.]+, N_MIN=\(_mob\?(\d+):(\d+)\), N_MAX=\(_mob\?(\d+):(\d+)\);/.exec(rd('js/seismic.js'));
  assert.ok(seisN, 'the intensity field still declares its grid floor and ceiling');
  assert.ok(Number(seisN[2]) >= 448, `the desktop intensity field floor is ${seisN[2]}, coarser than #R202's 448`);
  assert.ok(Number(seisN[1]) >= 192, `the mobile intensity field floor is ${seisN[1]}, coarser than #R202's 192`);
  const th = rd('js/theme-sky.js');
  /* (#R222) the import list grew by `limbViewElev` — the assertion is that the model is imported BY
     NAME (not re-implemented, not reached through a global), which a wider list satisfies. */
  assert.match(th, /import \{ skyColour[^}]*\} from '\.\/sky-model\.js'/, 'theme-sky imports the model by name');
  assert.match(th, /'sky-color':sc/, 'and sky-color comes from it');
  assert.doesNotMatch(th, /'sky-color':_SKY_SPACE/, 'the constant deep-space sky is gone');
});
}

/* ═══ from tests/r218-checks.test.mjs (tests #7, #8 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => codeOnly(read(p));
test('#R218 ③ …the distance is factored over the grid, and only when there is no rupture to measure to', () => {
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
test('#R218 ③ …the picture leaves the canvas as a blob, and every replaced one is revoked', () => {
  const s = code('js/seismic.js');
  assert.match(s, /function pngURL\(cv\)/, 'the blob encoder is missing');
  assert.match(s, /URL\.createObjectURL/, 'the object URL is not created');
  assert.match(s, /URL\.revokeObjectURL/, 'an object URL is created and never revoked');
  assert.equal((s.match(/_revoke\(/g) || []).length >= 5, true, 'not every path that drops a field revokes it');
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #9 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ⑦ the coastline rasteriser culls by bounding box, exactly ─────────────────────────────────── */
test('R223 ⑦ rasterize() skips rings whose box misses the window', () => {
  const s = read('js/coast-mask.js');
  assert.match(s, /function boxes\(g\)/);
  assert.match(s, /__imRingBox/);
  assert.match(s, /if\(BB\[ri\*4\]\+off>lngE\|\|BB\[ri\*4\+1\]\+off<lngW\|\|BB\[ri\*4\+2\]>latN\|\|BB\[ri\*4\+3\]<latS\) continue;/);
  /* the cull is EXACT: a ring outside the window can contain no pixel of it */
  const inside = (bw, be, bs, bn, w, e, s2, n) => !(bw > e || be < w || bs > n || bn < s2);
  assert.equal(inside(0, 1, 0, 1, 10, 11, 10, 11), false, 'a far ring is dropped');
  assert.equal(inside(-180, 180, -90, 90, 10, 11, 10, 11), true, 'a ring that encloses the window is kept');
});
}

/* ═══ from tests/r226-checks.test.mjs (tests #1, #2 of 5) ═══
    #R226 — the round's own contracts, checked in Node
    100 % means 100 % · a 1.0 km cell · one bilinear, prepared per row ·
    the limb was lilac because the march was coarse · progress is written when it changes. */
{

/* ── ① 100 % OPACITY IS 100 % ─────────────────────────────────────────────────────────────────────
   「MMI震度分布の不透明度100%は全然100%ではない。」 Two transparencies multiplied into one picture:
   `raster-opacity`, which the slider sets, and an alpha of 235/255 baked into every painted pixel.
   The top of the slider therefore drew 0.922 and no setting could reach 1. */
test('R226 ① the intensity raster carries exactly one transparency', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const FIELD_ALPHA=255;/, 'the painted pixel is opaque');
  /* ⚠ (#R247) THE ALPHA IS A RESULT NOW, AND STILL ONLY EVER THIS CONSTANT OR A RAMP DOWN FROM IT.
     #R226's defect was a SECOND transparency baked under the slider (235/255 in every pixel), and
     what stopped it was that one named constant is the only thing either writer puts in the alpha
     channel. That is still exactly true — it just moved into `fieldPx`, the one function both
     rasters now get their colour AND their alpha from, because the field's outermost half-class
     fades instead of ending in a cliff. Two writers reading one function is stronger than two
     writers repeating one constant, so this asserts BOTH. */
  const uses = s.match(/FIELD_ALPHA/g) || [];
  assert.ok(uses.length >= 3, 'the constant is declared and used');
  assert.ok(!/px\[o\+3\]=\d+;/.test(s), 'no literal alpha survives anywhere in the two writers');
  assert.match(s, /out\[3\]=\(I>=lo\+FADE_I\) \? FIELD_ALPHA/,
    'full opacity above the fade band is the constant itself');
  assert.equal((s.match(/const (?:c|rgb)=fieldPx\(I,_(?:fine|far)RGB\)/g) || []).length, 2,
    'and BOTH rasters — the fine field and the far annulus — get it from the one function');
  /* the slider is still the one owner of the transparency */
  assert.match(s, /setPaint\(LYR_IMG,'raster-opacity',fldOpacity\)/);
  assert.match(s, /setPaint\(LYR_FAR,'raster-opacity',fldOpacity\)/);
});

/* ── ② THE CELL, AND THE CEILING ──────────────────────────────────────────────────────────────────
   「MMI震度分布の…解像度を上げて。」 Both quantities move, because either one alone decides nothing:
   a wide field is bound by N_MAX and a narrow one by CELL_KM (#R204). The phone is deliberately left
   where it was — the same round is answering 「モバイル版がまだ劇的に遅い」. */
test('R226 ② the desktop field is finer and the phone is untouched', () => {
  const s = read('js/seismic.js');
  const m = s.match(/const CELL_KM=([\d.]+), N_MIN=\(_mob\?(\d+):(\d+)\), N_MAX=\(_mob\?(\d+):(\d+)\);/);
  assert.ok(m, 'the grid rule is one line and states the floor and the ceiling');
  const mob = s.match(/const CELL_KM_MOB=([\d.]+);/);
  assert.ok(mob, 'and the phone\'s cell is named beside it');
  const [, cellDesk, nMinMob, nMinDesk, nMaxMob, nMaxDesk] = m;
  const cellMob = mob[1];
  /* the phone must actually USE its own constant — a named value nothing reads is worse than none */
  assert.match(s, /Math\.round\(spanKm0\/\(_mob\?CELL_KM_MOB:CELL_KM\)\)/, 'and the grid is derived from whichever applies');
  assert.equal(+cellDesk, 1.0, 'a 1.0 km cell on the desktop');
  assert.equal(+nMaxDesk, 2560, 'and a 2,560 ceiling, so a wide field gets it too');
  assert.equal(+cellMob, 1.5, 'the phone keeps #R204/#R205\'s cell');
  assert.equal(+nMaxMob, 640, 'and #R205\'s ceiling');
  assert.equal(+nMinMob, 288); assert.equal(+nMinDesk, 640);
  /* #R205's Int16 site array is what pays for the ceiling — it must not have grown back */
  assert.match(s, /const vs=new Int16Array\(N\*N\)/, 'the retained site term is still 2 bytes a cell');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #5 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => codeOnly(read(p));

/* ══ ⑤ THE FAR FIELD MEASURES THE DISTANCE THE FINE FIELD MEASURES ════════════════════════════════
   「震源の外側に数千キロ規模の四角形の線がありそこで震度分布が断絶している。」 `buildFar` passed
   `srcDistM` the great-circle range to the rupture's CENTROID while `buildField` passes Rrup, so at
   the seam between the two images the same place was ~250 km further away on one side than the other
   (Tōhoku). The seam is the fine image's lat/lng box — the 四角形. */
test('r244 ⑤ buildFar subtracts the rupture’s reach before srcDistM', () => {
  const src = code('js/seismic.js');
  assert.ok(/function rupReach\(/.test(src), 'the bearing-indexed reach table exists');
  assert.ok(/const reach=rupReach\(C0\)/.test(src), 'buildFar builds it');
  assert.ok(/km=Math\.max\(0,kmC-reach\[/.test(src), 'and the painted distance is Rrup, not the centroid range');
});
}

/* ═══ from tests/r245-checks.test.mjs (tests #4 of 10) ═══
    IntMap · #R245 — source-level checks
    Seven instructions. Each test below is written against the ROOT CAUSE that was measured, not
    against the symptom, so it fails on the shipped code that produced the report.

    ⚠ Every test strips comments before matching (`code()`), because this file's own subject matter
    quotes the strings it forbids — [[intmap-recurring-lessons]] E, eight rounds running. */
{
/* comments out, string literals kept — the same helper every round since #R208 */
const code = (p) => codeOnly(read(p));

/* ── ④ the far field and the fine image tile exactly ────────────────────────────────────────────
   「震源の外側に数千キロ規模の四角形の線がありそこで震度分布が断絶している。」 The line was the far
   raster's ALPHA being interpolated towards its transparent cells along the fine image's box. Two
   things fix it and both have to be present: the box is snapped onto the far raster's own cell grid
   (so no cell is drawn twice or dropped) and the far layer stops interpolating. */
test('r245 ④ the intensity field has one boundary, on the grid, with no fade across it', () => {
  const src = code('js/seismic.js');
  assert.ok(/const FAR_N=\(\)=>/.test(src), 'the far grid size is declared once, for both functions');
  assert.ok(/snapLngFar/.test(src) && /snapLatFar/.test(src), 'the fine box is snapped to that grid');
  assert.ok(/const W=snapLngFar\(/.test(src) && /const Nn=snapLatFar\(/.test(src), '…and the snap is what W/E/Nn/Ss are');
  assert.ok(/'raster-resampling':'nearest'/.test(src), 'the far layer does not interpolate towards its transparent cells');
  /* and the seam must stay a partition: no margin, no overlap.
     ⚠ (#R247) THE INNER LIMIT IS GONE, AND THAT MAKES THE PARTITION *MORE* EXACT, NOT LESS. #R245's
     point is that every far cell must be wholly inside the box (skipped) or wholly outside it
     (painted). A SECOND inner test — `km<=rFine` — could not agree with the box, because the box is
     the BOUNDING BOX of the disc of radius rFine and not the disc: along its east and west flanks
     the box edge is nearer than rFine, so those cells were outside the box AND inside rFine and
     neither raster drew them (measured on the geometry alone: 192 cells at 60 N, 2,734 at 70 N).
     The box test below is now the whole of ownership, which is what «a partition» means. */
  assert.ok(/if\(km>rEdge\) continue;/.test(src), 'the only radial limit is the outer one');
  assert.ok(!/km<=rFine/.test(src), 'the inner radius no longer competes with the box');
  assert.ok(/if\(lo>=box\.W&&lo<=box\.E&&la>=box\.Ss&&la<=box\.Nn\) continue;/.test(src),
    'and the box test is the box, not the box plus or minus a margin');
});
}

/* ═══ from tests/r247-checks.test.mjs (tests #3, #4, #5 of 9) ═══
    R247 — the five things this round changed, stated as contracts
    ① the SDF atlas speaks the server `top` convention (the news band's real defect)
    ② the far intensity raster's edge is a SURFACE distance, and the box is the only ownership test
    ③ the field ends in a fade, through ONE function both rasters call
    ④ the aircraft ramp is the original stops at 1.25×, still stated once
    ⑤ the thirteenth translation shape — a helper ternary with ARRAY arms — is measured and gone */
{
/* ⚠ comments are stripped before matching — this file's own prose quotes the instruction, and a
   negative check that reads its own comment is [[intmap-recurring-lessons]] E, eight rounds running. */

/* ── ② THE FAR RASTER'S LIMITS ────────────────────────────────────────────────────────────────
   `rEdge` comes off the profile's own radius grid, which is the distance `srcDistM()` PRODUCES;
   `buildFar` compares it with a SURFACE distance. The gap is the implied rupture radius, so it grows
   with magnitude (5 km at M6, 140 at M9.1, 213 at M9.5) and is zero whenever a rupture is drawn —
   which is why only a point source ever showed it. */
test('r247 ② the far field stops at a SURFACE radius, converted through srcDistM once', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /const rEdgeSurf=Math\.min\(MMI_MAX_KM,_cutEdge\+Math\.sqrt\(Math\.max\(0,rEdge\*rEdge-depthKm\*depthKm\)\)\)/,
    'the inverse of srcDistM, stated once');
  /* (#R248) …and buildFar is now also given the WINDOW it rasterises into — the same object the
     fine image's box was snapped onto, passed rather than recomputed so the seam stays exact. */
  assert.match(s, /await buildFar\(profAt,\{W,E,Ss,Nn\},rFine,rEdgeSurf,seq,farWin\)/, 'and it is what buildFar is given');
  assert.match(s, /const rFine=Math\.min\(rEdgeSurf,MMI_TERRAIN_KM\)/, 'the fine box is bounded by the same surface radius');
});

/* ⚠ …AND OWNERSHIP IS THE BOX, ONLY THE BOX. #R218's band solve also carved out a disc of radius
   rFine on the argument that the fine image owns it. It does not: the fine image is that disc's
   BOUNDING BOX, and along its east and west flanks the box edge is NEARER than rFine, so a cell
   there was dropped by both rasters. Measured on the geometry alone: 0 such cells at 45 N, 21 at
   50 N, 192 at 60 N, 2,734 at 70 N. */
test('r247 ② the far raster has no inner radius — the box test is the whole of ownership', () => {
  const s = code(read('js/seismic.js'));
  assert.doesNotMatch(s, /innerI/, 'the inner-radius column skip is gone');
  assert.doesNotMatch(s, /cosFine/, '…and so is the circle it was solved from');
  assert.match(s, /if\(km>rEdge\) continue;/, 'the only radial test left is the outer one');
  assert.match(s, /if\(lo>=box\.W&&lo<=box\.E&&la>=box\.Ss&&la<=box\.Nn\) continue;/,
    'and the fine image owns exactly its box');
});

/* ── ③ THE FADE ───────────────────────────────────────────────────────────────────────────────
   「いやJMA震度のほうだわ。直線状の崖」 — the lowest class was an ALPHA boundary: 震度1 at full
   opacity on one side and nothing on the other, so its isoline was drawn as a cliff. It is a ramp
   now, half a class wide, and BOTH rasters get their colour and their alpha from one function. */
test('r247 ③ one function writes the colour AND the alpha, for both rasters', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /function fieldPx\(I,out\)/, 'the shared painter exists');
  assert.match(s, /const rgb=fieldPx\(I,_farRGB\); if\(!rgb\) continue;/, 'the far annulus calls it');
  assert.match(s, /const c=fieldPx\(I,_fineRGB\); if\(!c\) continue;/, 'the fine field calls it');
  /* neither raster may write FIELD_ALPHA straight into the image any more — that IS the cliff */
  assert.doesNotMatch(s, /px\[o\+3\]=FIELD_ALPHA/, 'no raster writes the alpha itself');
  assert.match(s, /const FADE_I=0\.5;/, 'the fade is half a class of the active scale');
  /* …and the edge radius is solved for the FADE floor, or the fade is clipped at the radius it
     exists to soften — the cliff, one ramp later. */
  /* ⚠ AND THE RAMP RUNS INWARD, so nothing about the field's EXTENT moves. The obvious shape — carry
     the field half a class further out and vanish there — coarsens the CELL, because `rEdge` is what
     the fine image's box is built from and the 2,560 ceiling divides that box. Measured on
     tests/r226-seismic's own M6.4: outward cost span 2,700 → 2,892 km and cell 1.05 → 1.13 km,
     against a 1.0 km target three rounds (#R202 / #R203 / #R204) were spent reaching. */
  assert.match(s, /floor=jmaScale\?A0_FLOOR_JMA:PGV_FLOOR_MMI/, 'rEdge is still solved for the CLASS floor');
  assert.match(s, /if\(!\(I>=lo\)\) return null;/, 'and nothing is painted below it');
});
}

/* ═══ from tests/r250-checks.test.mjs (tests #1, #2, #3 of 5) ═══
    IntMap · #R250 source checks
    ① ONE PICTURE, ONE **GRAIN** — the seismic far raster may not be built finer than the inputs
       it draws. Its land test and its site term are answered at its own cell, from the same two
       sources the fine field uses, and which answer each one gave is PRINTED.
    ② js/coast-mask.js answers an oblong grid, because the far raster's is nx × ny — and the
       square `N` spelling the fine field uses still means what it meant.
    ③ the far raster's DEM read is bounded and fails OPEN — a tile that does not arrive leaves the
       cell exactly as it is drawn today (the bundled 0.25° term), never blank and never `ampRef`
       for the whole annulus.
    ④ no instrument in the i18n family may truncate its own list silently (#R185's rule, which
       scripts/i18n-pair-audit.mjs was itself breaking at 400 of 696).
    ⑤ the OPEN GAP ratchet — the twelfth shape may only ever go down.

    ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
    [[intmap-recurring-lessons]] E has caught nine rounds writing a check that trips on its own
    explanation of the defect. */
{

/* ── ① THE FAR RASTER'S INPUTS ARE AT THE FAR RASTER'S CELL ─────────────────────────────────── */
test('#R250 ① the far seismic raster answers land and site at its OWN cell, not at 19.6 / 28 km', () => {
  const s = code(read('js/seismic.js'));

  /* the land test goes through the same module the fine field uses, rasterised onto THIS grid */
  assert.match(s, /IntMapCoastMask/,
    'buildFar no longer reaches js/coast-mask.js — its coastline is back to the 19.6 km bundled raster');
  assert.match(s, /coastFar\s*=\s*CM\.rasterize\(\{west:W0,y0:yT,dx:dxF,dy:dyF,nx:NX,ny:NY\}\)/,
    'the coast raster is not built on the FAR grid (west/y0/dx/dy/nx/ny must be the far window\'s own)');

  /* …and the bundled mask is still the fallback, so a session with no outline draws today's picture */
  assert.match(s, /const landAtFar=\(k,lo,la\)=>\(coastFar\?\(coastFar\[k\]===1\):\(land\.isLand\(lo,la\)===true\)\)/,
    'the far land test lost its bundled fallback — a session without country geometry must still draw');

  /* the site term reads the DEM first, through the SAME table the fine field applies.
     ⚠ (#R263) THIS ASSERTION IS THE PROPERTY NOW, NOT THE LINE. It used to match the whole
     expression `g=ampOf(vs30FromSlope(...))/ampRef` as one string, and #R263 split that line in two
     to keep the Vs30 it computed (`vsHere`) for the frequency-dependent half of the site term. The
     PROPERTY #R250 was defending — the far raster derives its site term from the DEM slope through
     the same table, not from the bundled raster alone — is untouched, so the assertion is rewritten
     to state it rather than deleted. (This is the fourth round in a row in which a previous round's
     literal-text assertion made a legitimate change look like a regression.) */
  assert.match(s, /vs30FromSlope\(Math\.hypot\(ex-e0,ey-e0\)\/dsFarM\)/,
    'the far site term no longer comes from the DEM slope — it is back to the bundled raster alone');
  assert.match(s, /g=ampOf\(vFar\)\/ampRef/,
    'the far DEM-derived Vs30 no longer feeds ampOf against the reference');
  /* …with the bundled raster as the PER-CELL fallback, which is what makes this additive */
  assert.match(s, /if\(!gotSite&&vsm\)/,
    'the bundled 0.25° site term is no longer the per-cell fallback — a missing tile would change the picture');

  /* ⚠ THE FINE FIELD IS NOT TOUCHED (#R247's rule: know what the edge decides before moving it) */
  assert.match(s, /const rFine=Math\.min\(rEdgeSurf,MMI_TERRAIN_KM\)/,
    'rFine moved — the fine field\'s extent, span and cell must not change for this fix');
  assert.match(s, /const CELL_KM=1\.0, N_MIN=/,
    'the fine grid rule moved — the fine cell must not be coarsened to fix the far raster');

  /* the three numbers are reported TOGETHER, which is the whole reason this defect survived two
     rounds: `cellKm` said 1.17 while the coastline said 19.6 and the ground said 28 */
  for (const k of ['siteSource', 'siteSpacingM', 'demSiteCells', 'bulkSiteCells']) {
    assert.ok(s.includes(k + ':'), `state().far no longer reports ${k} — the grain must be printed, not assumed`);
  }
});

/* ── ② THE COAST MASK ANSWERS AN OBLONG GRID ────────────────────────────────────────────────── */
test('#R250 ② js/coast-mask.js answers nx × ny, and `N` still means a square', () => {
  const c = code(read('js/coast-mask.js'));
  assert.match(c, /function dims\(o\)/, 'the grid dimensions are no longer derived in one place');
  assert.match(c, /const nx=\(o\.nx\|0\)\|\|N, ny=\(o\.ny\|0\)\|\|N/,
    'nx/ny no longer default to N — the fine field passes only N and must keep working');
  /* the readback must not allocate one ImageData over the whole ~10 M cell far grid */
  assert.match(c, /getImageData\(0,j0,nx,h\)/,
    'the readback is not striped — a 10 M cell grid would hold a 40 MB intermediate beside the caller\'s own');
  /* the square spelling is still exercised by the fine field */
  const s = code(read('js/seismic.js'));
  assert.match(s, /CM\.rasterize\(\{west:W,y0,dx,dy,N\}\)/,
    'the fine field stopped passing the square N form — this is the call that must not regress');
});

/* ── ③ THE FAR DEM READ IS BOUNDED, AND FAILS OPEN ──────────────────────────────────────────── */
test('#R250 ③ the far raster\'s tile budget is its own, and a missing tile changes nothing', () => {
  const s = code(read('js/seismic.js'));

  /* its own budget, well under the fine field's 1,600 — a pinned tile is 256 kB (#R223) and the
     fine field is holding its set at the same moment */
  assert.match(s, /const TILE_BUDGET_FAR=_mobF\?128:512/,
    'the far raster\'s tile budget is gone or has been raised — 「ブラウザが落ちる」 is in #R223\'s report');
  assert.ok(/TILE_BUDGET_FAR/.test(s) && !/TILE_BUDGET_FAR=_mobF\?\d{4,}/.test(s),
    'the far tile budget must stay bounded');

  /* it must not fetch tiles the fine image already owns, or that are past the painted radius */
  assert.match(s, /if\(lo-hLo>=box\.W&&lo\+hLo<=box\.E&&la-hLa>=box\.Ss&&la\+hLa<=box\.Nn\) return false/,
    'the far DEM read no longer skips tiles inside the fine image\'s box — it would refetch the whole window');

  /* #R190's rule survives: a slope measured finer than the data is not a slope */
  assert.match(s, /const slopeUsableFar=demSpacingFarM<=2000/,
    'the far site term dropped #R190\'s 2 km rule — a flattened gradient biases toward the softest bin');

  /* the pin is released — buildFar runs inside buildField's try, whose finally releases it */
  /* ⚠ (#R671) the release now names the lease THIS build opened, so it takes an argument. That the
     release happens in the finally is the claim; which lease it names is asserted by
     #R671 ⑩ (tests/hazard-dem-tile-store-checks), which parses js/seismic.js rather than spelling it. */
  assert.match(s, /finally \{ try\{ HOST\.releaseDEMHold\([^)]*\); \}catch\(_\)\{\}/,
    'the DEM pin is no longer released — #R221\'s eviction defect returns');
});
}
