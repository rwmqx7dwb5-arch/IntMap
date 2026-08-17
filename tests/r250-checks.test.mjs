/* ============================================================================
 *  IntMap · #R250 source checks
 * ----------------------------------------------------------------------------
 *  ① ONE PICTURE, ONE **GRAIN** — the seismic far raster may not be built finer than the inputs
 *     it draws. Its land test and its site term are answered at its own cell, from the same two
 *     sources the fine field uses, and which answer each one gave is PRINTED.
 *  ② js/coast-mask.js answers an oblong grid, because the far raster's is nx × ny — and the
 *     square `N` spelling the fine field uses still means what it meant.
 *  ③ the far raster's DEM read is bounded and fails OPEN — a tile that does not arrive leaves the
 *     cell exactly as it is drawn today (the bundled 0.25° term), never blank and never `ampRef`
 *     for the whole annulus.
 *  ④ no instrument in the i18n family may truncate its own list silently (#R185's rule, which
 *     scripts/i18n-pair-audit.mjs was itself breaking at 400 of 696).
 *  ⑤ the OPEN GAP ratchet — the twelfth shape may only ever go down.
 *
 *  ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
 *  [[intmap-recurring-lessons]] E has caught nine rounds writing a check that trips on its own
 *  explanation of the defect.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const json = (f, ...a) => JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'scripts', f), '--json', ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

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

  /* the site term reads the DEM first, through the SAME table the fine field applies */
  assert.match(s, /g=ampOf\(vs30FromSlope\(Math\.hypot\(ex-e0,ey-e0\)\/dsFarM\)\)\/ampRef/,
    'the far site term no longer comes from the DEM slope — it is back to the 0.25° raster alone');
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
  assert.match(s, /finally \{ try\{ HOST\.releaseDEMHold\(\); \}catch\(_\)\{\}/,
    'the DEM pin is no longer released — #R221\'s eviction defect returns');
});

/* ── ④ NO INSTRUMENT TRUNCATES ITS OWN LIST SILENTLY ────────────────────────────────────────── */
test('#R250 ④ the pair audit reports every hit, and the strings themselves', () => {
  const a = read('scripts/i18n-pair-audit.mjs');
  assert.ok(!/hits:\s*hits\.slice\(/.test(code(a)),
    'the pair audit is truncating its own --json list again — 696 hits came back as 400 and the '
    + 'difference was invisible (#R185: no silent caps)');

  const j = json('i18n-pair-audit.mjs');
  assert.equal(j.hits.length, j.total,
    `--json returned ${j.hits.length} of ${j.total} hits — the list a round works through may not be capped`);

  /* …and the strings must be usable, not cut at 110 characters for the terminal */
  for (const h of j.hits.slice(0, 50)) {
    assert.equal(typeof h.en, 'string', 'a hit carries no untruncated English string');
    assert.equal(typeof h.ja, 'string', 'a hit carries no untruncated Japanese string');
  }
  /* ⚠⚠⚠ (#R251) THE INVARIANT, NOT A LONG STRING THAT HAPPENS TO EXIST. This used to require one of
     the HITS to be longer than the 110-character terminal truncation — true while there were 696 of
     them, and false the moment a round converts the long ones. #R251 took the gap to 275 and the
     longest string in the whole report, hits and exemptions together, is now 54 characters: a test
     that only passes while the defect it guards is LARGE stops guarding it exactly when the work
     succeeds, and would then have to be deleted by whoever finally closed the gap.
     What is actually being defended is that `en` and `ja` are the raw strings and only `text` — the
     terminal field — is cut. That is a property of the code, so it is asserted on the code: the
     slice is applied to the display field alone, and the two data fields are assigned unsliced. */
  const rec = code(a).slice(code(a).indexOf('const rec = {'), code(a).indexOf('hits.push(rec)'));
  assert.match(rec, /\ben,\s*ja,/, '`en` / `ja` must be assigned the raw strings');
  assert.ok(!/\b(en|ja):[^,]*\.slice\(/.test(rec), 'neither data field may be truncated');
  assert.match(rec, /text:\s*\(JSON\.stringify\(en\)[\s\S]*?\.slice\(0, 110\)/,
    'only the terminal field is cut, and it is cut where the reader can see why');
});

/* ── ⑤ THE OPEN GAP ONLY EVER GOES DOWN ─────────────────────────────────────────────────────── */
test('#R250 ⑤ the twelfth shape\'s ratchet', () => {
  const j = json('i18n-pair-audit.mjs');
  /* #R246 2,262 → #R247 2,255 → #R248 2,031 → #R249 696 → #R250 see DEV-NOTES. */
  assert.ok(j.total <= 696, `the open gap grew to ${j.total} — write the new tuple as pickArgs() instead`);
  assert.ok(Array.isArray(j.exemptFiles) && j.exemptFiles.length > 0, 'the exemption is not reported per file');
});
