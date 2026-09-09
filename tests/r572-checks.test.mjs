/* ============================================================================
 *  R572 · The wave layer draws Windy's picture — checks that need no browser
 * ----------------------------------------------------------------------------
 *  The reader asked for a wave layer 「Windyと画素、RGBレベルで完全に同一なグラフィックに」 and
 *  「アニメーションのグラフィックも同一に」. Most of that claim is about pixels on a GPU and can only
 *  be judged by looking; these are the parts of it that are ARITHMETIC, and arithmetic can be pinned.
 *
 *  ⚠ ①  IS THE POINT OF THIS FILE. It compares our ramp against a CHECKSUM OF WINDY'S OWN 4096-byte
 *  lookup table, read out of the live windy.com bundle (v51.2.1) on 2026-09-09. If it goes red the
 *  first question is 「did Windy change its ramp?」, not 「what did we break?」 — and the answer is
 *  visible by opening windy.com and reading `W.colors.waves` again. Nothing here reaches the network:
 *  the checksum and the seventeen sample entries are what was measured, written down.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the modules are plain IIFEs that publish onto their root, so they run under node unchanged */
await import('file://' + join(ROOT, 'js/waves-palette.js').replace(/\\/g, '/'));
await import('file://' + join(ROOT, 'js/waves-gl.js').replace(/\\/g, '/'));
const PAL = globalThis.IntMapWavePalette;
const GL = globalThis.IntMapWavesGL;

/* FNV-1a/32 over all 4096 bytes of Windy's precomputed gradient, MEASURED 2026-09-09. */
const WINDY_LUT_FNV1A32 = '96000495';

/* seventeen entries spread across the ramp, MEASURED from the same object. Index → r,g,b,a. */
const WINDY_SAMPLES = [
  [0, 160, 186, 192], [1, 157, 185, 192], [42, 50, 158, 186], [85, 48, 99, 142],
  [128, 56, 104, 192], [170, 57, 61, 143], [213, 187, 90, 192], [256, 155, 48, 151],
  [341, 134, 48, 48], [426, 192, 51, 95], [512, 194, 77, 91], [600, 192, 105, 89],
  [700, 192, 139, 129], [800, 192, 174, 170], [900, 181, 174, 182], [1000, 160, 136, 160],
  [1023, 155, 128, 156]
];

test('① the wave ramp is byte-identical to the one Windy draws', () => {
  const lut = PAL.lut();
  assert.equal(lut.length, 1024 * 4, 'the ramp is 1024 RGBA entries, as Windy quantises it');

  let h = 2166136261;
  for (let i = 0; i < lut.length; i++) { h ^= lut[i]; h = Math.imul(h, 16777619) >>> 0; }
  assert.equal(h.toString(16), WINDY_LUT_FNV1A32,
    'our 1024-entry ramp no longer checksums to the one measured from windy.com on 2026-09-09. '
    + 'Either the interpolation changed here, or Windy changed its ramp upstream — open windy.com '
    + 'and read W.colors.waves before assuming it is ours.');

  for (const [i, r, g, b] of WINDY_SAMPLES) {
    assert.deepEqual([lut[i * 4], lut[i * 4 + 1], lut[i * 4 + 2], lut[i * 4 + 3]], [r, g, b, 255],
      'ramp entry ' + i + ' (=' + PAL.valueAt(i).toFixed(4) + ' m) drifted');
  }
});

test('② the ramp is NOT the sRGB-linear one, which is the mistake that looks right', () => {
  /* MEASURED: interpolating the same stops in sRGB agrees to a mean of 1.11/255 — an eyeball cannot
     tell — but reaches 11.52/255 in the middle of the wide intervals. This test fails if somebody
     "simplifies" the YCbCr chroma-preserving blend back into a linear one, which would still look
     plausible and would still pass every screenshot review. */
  const stops = PAL.STOPS;
  const linear = (v) => {
    let i = 1; while (i < stops.length - 1 && v > stops[i][0]) i++;
    const a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]);
    return [1, 2, 3].map((k) => Math.round((a[k] + (b[k] - a[k]) * t) * 256 / 255));
  };
  const at = 3.5;
  const ours = PAL.colourAt(at);
  const lin = linear(at);
  const drift = Math.max(...ours.map((c, k) => Math.abs(c - lin[k])));
  assert.ok(drift >= 5,
    'at ' + at + ' m our colour ' + ours + ' is within ' + drift + '/255 of the sRGB-linear blend '
    + lin + '. It should not be: Windy draws rgb(152,44,103) there and linear says rgb(144,48,100). '
    + 'A ramp that agrees with linear here is not Windy’s ramp.');
});

test('③ heights outside the ramp clamp to the end colours, and the ends go through the round trip', () => {
  const lut = PAL.lut();
  const first = [lut[0], lut[1], lut[2]];
  const last = [lut[1023 * 4], lut[1023 * 4 + 1], lut[1023 * 4 + 2]];
  assert.deepEqual(PAL.colourAt(-3), first, 'below 0 m holds the first entry');
  assert.deepEqual(PAL.colourAt(0), first);
  assert.deepEqual(PAL.colourAt(99), last, 'above 12 m holds the last entry');
  /* ⚠ the end stops are NOT their own literal bytes: rgb(159,185,191) becomes rgb(160,186,192)
     because every entry goes through /255 → YCbCr → RGB → ×256. Returning the literal was
     measured to cost exactly the two end entries. */
  assert.notDeepEqual(first, [PAL.STOPS[0][1], PAL.STOPS[0][2], PAL.STOPS[0][3]],
    'the first entry must be the round-tripped stop, not the literal one');
});

test('④ the particle preset carries Windy’s measured constants', () => {
  const W = GL.PRESET;
  /* the numbers that are visible in the animation. If one of these is "tidied" the motion changes. */
  assert.equal(W.glSpeedPx, 8);
  assert.equal(W.glMinSpeedParam, 0.5);
  assert.equal(W.glMaxSpeedParam, 10);
  assert.equal(W.glParticleWidth, 5.5);
  assert.equal(W.glParticleLengthEx, 1);
  assert.equal(W.glOpacity, 1.6);
  assert.equal(W.glBlending, 0.93);
  assert.equal(W.glCountMul, 1.5);
  assert.equal(W.multiplierConstant, 50);
  assert.equal(W.multiplierPow, 1.3);
  assert.equal(GL.LIFE_FRAMES, 128, '16 cohorts × 8 frames');

  /* the trail decays by a MULTIPLY per frame; Windy's formula puts waves at 0.905 on a desktop.
     ⚠ this is the number that decides how long a swell line lingers — a translucent wash instead
     of a multiply would give a different curve with the same "0.9". */
  const fade = Math.min(0.9 + 0.5 * (W.glBlending - 0.92), 0.98);
  assert.ok(Math.abs(fade - 0.905) < 1e-9, 'trail decay is 0.905/frame, got ' + fade);
});

test('⑤ the alpha envelope rises over 90 of the 128 frames', () => {
  const a = GL.alphaLut();
  assert.equal(a.length, 128);
  assert.ok(a[0] < 0.02, 'a new cohort starts invisible');
  assert.ok(a[89] > 0.98 && a[90] >= 0.999, 'full strength is reached at frame ~90, not earlier');
  assert.ok(a[127] < 0.1, 'and it fades out again by the end of the life');
  /* the rise is a power curve, not a straight line: halfway through the rise it is BELOW half */
  assert.ok(a[45] < 0.5, 'the rise is pow 1.2, so the midpoint sits under 0.5, got ' + a[45]);
});

test('⑥ the shaders keep the two things that make the picture Windy’s', () => {
  const fs = GL.shaders.RASTER_FS;
  /* the Catmull-Rom coefficients — the 5/2 is the signature of the kernel */
  assert.match(fs, /5\.0\*X\.y\*0\.5/, 'the raster keeps the Catmull-Rom −5/2 coefficient');
  assert.match(fs, /-\s*0\.66|0\.66/, 'the coastline keeps the 0.66 alpha threshold');
  /* ⚠ the blue-channel path must NOT clamp into the neighbourhood min/max. Windy suppresses
     overshoot on its red-channel path only, and the ringing it leaves on waves is part of the
     picture. A neighbourhood clamp here would be a quieter, and different, image. */
  assert.ok(!/rMin|neighbourClamp|clamp\(\s*h\s*,/.test(fs),
    'the blue-channel path must not suppress ringing — Windy does not');
});

test('⑦ the renderer is registered everywhere a lazy module has to be registered', () => {
  /* ⚠ a lazy module has more than one ledger, and the ones it is missing from fail silently at
     runtime rather than at build. Count them from the files rather than from memory. */
  const lazy = read('js/lazy-modules.js');
  assert.match(lazy, /waves\s*:\s*'IntMapWaves'/, 'PUBLISHES');
  assert.match(lazy, /case\s*'waves'/, 'fetchModule');
  assert.match(read('src/main.js'), /'waves'/, 'LAZY_FACTORIES');
  assert.match(read('tests/r209.spec.js'), /waves\s*:\s*\[\s*'IntMapWaves'/, 'the spec’s MEMBER table');
});

test('⑧ the wave models are discovered from the registry, never spelled into the layer', () => {
  const models = read('js/wx-models.js');
  assert.match(models, /ecmwf_wam025/);
  assert.match(models, /ncep_gfswave025/);
  assert.match(models, /roles:\s*\['wave'\]/);
  /* ⚠ #R515's standing rule: the layer must ask the registry which models can draw it, not carry a
     list. A spelling of a domain id inside js/waves.js is exactly the case-by-case hardcoding that
     rule forbids — the next wave model added to the registry would be silently dropped. */
  const waves = read('js/waves.js');
  assert.ok(!/ecmwf_wam|gfswave/.test(waves),
    'js/waves.js names a model by its upstream id; it must discover them by role instead');
});
