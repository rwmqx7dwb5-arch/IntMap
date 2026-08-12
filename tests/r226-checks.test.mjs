/* ============================================================================
 *  #R226 — the round's own contracts, checked in Node
 * ----------------------------------------------------------------------------
 *  100 % means 100 % · a 1.0 km cell · one bilinear, prepared per row ·
 *  the limb was lilac because the march was coarse · progress is written when it changes.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── ① 100 % OPACITY IS 100 % ─────────────────────────────────────────────────────────────────────
   「MMI震度分布の不透明度100%は全然100%ではない。」 Two transparencies multiplied into one picture:
   `raster-opacity`, which the slider sets, and an alpha of 235/255 baked into every painted pixel.
   The top of the slider therefore drew 0.922 and no setting could reach 1. */
test('R226 ① the intensity raster carries exactly one transparency', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const FIELD_ALPHA=255;/, 'the painted pixel is opaque');
  const uses = s.match(/px\[o\+3\]=FIELD_ALPHA;/g) || [];
  assert.equal(uses.length, 2, 'and BOTH rasters — the fine field and the far annulus — use the constant');
  assert.ok(!/px\[o\+3\]=\d+;/.test(s), 'no literal alpha survives anywhere in the two writers');
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

/* ── ③ ONE BILINEAR, PREPARED ONCE PER ROW ────────────────────────────────────────────────────────
   「地震と津波の計算速度は品質を下げない範囲で爆速に。」 The speed-up is only allowed if the number
   does not move, and the way to guarantee that is not to sample-test two implementations — it is to
   have one. `at()` IS the row sampler. */
test('R226 ③ the DEM snapshot has a single bilinear, and the field walks it by row', () => {
  const r = read('js/map-readout.js');
  assert.match(r, /at\(lng,lat\)\{ return api\.rowSampler\(lat\)\(lng\); \}/, 'at() delegates — it does not re-implement');
  assert.match(r, /rowSampler\(lat\)\{/, 'and the row sampler is the implementation');
  assert.match(r, /const xx=\(lng\+180\)\/360\*N, xi=Math\.floor\(xx\);/, "…computing _ll2tile's x per sample");
  assert.match(r, /const yy=\(1 - Math\.log\(Math\.tan\(lr\) \+ 1 \/ Math\.cos\(lr\)\) \/ Math\.PI\) \/ 2 \* N;|const yy=\(1-Math\.log\(Math\.tan\(lr\)\+1\/Math\.cos\(lr\)\)\/Math\.PI\)\/2\*N;/,
    "…and its y ONCE per row");
  assert.match(r, /if\(xi!==lastXi\)\{ lastXi=xi; d=tiles\.get\(xi\+'\/'\+yi\)\|\|null; \}/, 'with the tile memoised across the row');
  /* one bilinear in the file, so the two can never drift apart */
  assert.equal((r.match(/\(d\[rA\+ax\]\*tx1\+d\[rA\+bx\]\*tx\)\*ty1/g) || []).length, 1);
  const s = read('js/seismic.js');
  assert.match(s, /const _rowAt=\(snap&&snap\.rowSampler\)/, 'the field asks for a row sampler');
  assert.match(s, /const _hereAt=_rowAt\(la\), _northAt=_rowAt\(Math\.max\(-85,Math\.min\(85,la\+dLatS\)\)\);/,
    'and prepares both of the row\'s latitudes once');
  assert.ok(!/demAt\(/.test(s), 'the per-sample path is gone, not merely bypassed');
});

/* ── ④ PROGRESS IS WRITTEN WHEN IT CHANGES ────────────────────────────────────────────────────────
   A CPU profile of one build charges 61 % of its wall clock to root-level native work with the page
   NOT idle — the frames between the loop's yields. The percentage has at most 59 distinct values and
   was written to the DOM 320 times; the tsunami panel rebuilt itself entirely on every message the
   worker sent, including the ones showing the number already on screen. */
test('R226 ④ neither simulator redraws for a number it has already drawn', () => {
  const s = read('js/seismic.js');
  assert.match(s, /if\(v===fldPct\) return; fldPct=v; if\(opened\) _setProg\(\);/, 'the seismic bar');
  const t = read('js/tsunami.js');
  assert.match(t, /if\(v===pct\) return; pct=v; if\(opened\) render\(\);/, 'and the tsunami panel');
  /* …and the yield itself is not the 4 ms one */
  assert.match(s, /const _yield=\(function\(\)\{/, 'one channel for the module');
  assert.match(s, /ch\.port2\.postMessage\(0\)/, 'a MessageChannel task, not a clamped timer');
  assert.match(s, /return \(\)=>new Promise\(r=>setTimeout\(r,0\)\); \}/, 'with a fallback where it is unavailable');
  assert.ok(!/await new Promise\(r=>setTimeout\(r,0\)\)/.test(s), 'and no raster still waits on the clamped timer');
});

/* ── ⑤ THE LIMB IS BLUE ───────────────────────────────────────────────────────────────────────────
   「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 (confirmed: 宇宙から見た地球の縁.)
   #R224 convergence-tested the GROUND ray and settled the march at 32. The limb ray — 2,200 km of
   air with all of it near the tangent point — was 20 counts short in BLUE at 32, which is the whole
   difference between a pale-blue collar and a pink one. Measured live on the shipped build at
   24,422 km: `horizon-color` = #cebfce, a mauve-grey ring. */
test('R226 ⑤ the sky march resolves the limb, and the limb comes out blue', async () => {
  const src = read('js/sky-model.js');
  const m = src.match(/const N = (\d+), M = (\d+), KWARP = (\d+);/);
  assert.ok(m, 'the march states its counts');
  assert.ok(+m[1] >= 256, `the view march resolves the limb (found N=${m[1]})`);
  const { skyColour, limbViewElev } = await import(new URL('js/sky-model.js', root));
  /* the band `horizon-color` is set from: a 6 km tangent ray seen from orbit, day side */
  for (const alt of [5.286e6, 24.422e6]) {
    const c = skyColour(80, alt, 90, limbViewElev(alt, 6000)).rgb;
    assert.ok(c[2] > c[0] && c[2] > c[1], `the sunlit limb at ${alt / 1e6} Mm is blue-dominant, got ${c.map(Math.round)}`);
    assert.ok(c[2] - c[0] >= 12, `and not merely neutral (B−R = ${(c[2] - c[0]).toFixed(1)})`);
  }
  /* and the far end of the same limb is still the deep blue that fades to space (#R222) */
  const hi = skyColour(80, 24.422e6, 90, limbViewElev(24.422e6, 55000)).rgb;
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(hi) < lum(skyColour(80, 24.422e6, 90, limbViewElev(24.422e6, 6000)).rgb), 'the limb darkens with height');
  /* #R224's ground finding is not walked back: a low-elevation daytime sky is still B>G>R */
  for (const ve of [1, 3, 5, 10]) {
    const c = skyColour(60, 0, 90, ve).rgb;
    assert.ok(c[2] > c[1] && c[1] > c[0], `sun 60°, view ${ve}°: ${c.map(Math.round)} is not B>G>R`);
  }
  /* …and a low Sun is still warm (#R224) */
  const set = skyColour(2, 0, 90, 3).rgb;
  assert.ok(set[0] > set[1] && set[1] > set[2], `sunset horizon ${set.map(Math.round)} should be R>G>B`);
});
