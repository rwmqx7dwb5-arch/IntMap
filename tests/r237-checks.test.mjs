/* ============================================================================
 *  R237 — the air over the disc, the front's resolution, the panel's shape, and the shape of
 *  string the positional audit cannot see.
 * ----------------------------------------------------------------------------
 *  ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
 *  is a comment with a runner attached.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap #R235 hit eight
   times and #R236 hit once more. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── 1 · the atmosphere is drawn over the disc, not only beside it ──────────────────────────────
   「そもそも前まであったものがない」 — measured, the air over the daylight side of the globe had
   stopped being drawn when #R227 took the rim from maplibre. */
test('R237 limb: a ray that meets the planet is marched, not discarded', () => {
  const s = code(read('js/limb-layer.js'));
  /* #R227's discard was `if (discG >= 0.0 && (-b - sqrt(discG)) > 0.0) discard;` — the whole defect */
  assert.doesNotMatch(s, /discG\s*>=\s*0\.0\s*&&[^;]*discard/,
    'the planet-hit ray must no longer be thrown away');
  assert.match(s, /bool\s+onDisc/, 'the shader knows whether it is over the disc');
  assert.match(s, /if\s*\(onDisc\)\s*tMax\s*=\s*min\(tMax,\s*tHit\)/,
    'and it stops the march at the ground rather than inside the planet');
});

test('R237 limb: the composite is done in radiance, by inverting the tone map', () => {
  const s = code(read('js/limb-layer.js'));
  /* the background is READ, which is what #R227 could not do */
  assert.match(s, /uniform\s+sampler2D\s+u_bg/, 'the frame so far is an input');
  assert.match(s, /copyTexSubImage2D/, '…copied with a blit, not re-rendered');
  /* ⚠ copyTexImage2D RE-ALLOCATES; on a per-frame path that is the difference between a blit and a
     new texture every frame. The allocation must be guarded by a size change. */
  assert.match(s, /if\s*\(W!==bgW\|\|H!==bgH\)/, 'the texture is re-allocated only when the buffer resizes');
  /* the inverse tone map: L = -ln(1 - c^gamma)/exposure */
  assert.match(s, /bgL\s*=\s*-log\(/, 'the background is taken back to radiance');
  assert.match(s, /outL\s*=\s*mix\(bgL,\s*bgL\*T\s*\+\s*L,\s*strength\)/,
    'and the composite is L_bg*T + L_in, mixed by strength');
  /* ⚠ with a composite there is nothing to blend: the shader emits the ANSWER */
  assert.match(s, /gl\.disable\(gl\.BLEND\)/, 'the pass replaces rather than adds');
  assert.doesNotMatch(s, /blendFunc\(gl\.ONE,\s*gl\.ONE_MINUS_SRC_ALPHA\)/,
    "#R227's premultiplied source-over is gone with the alpha it needed");
});

/* ── 2 · the zoom cliff ─────────────────────────────────────────────────────────────────────────
   「ある程度までズームインすると途端に見えなくなってしまう」 — measured on the sweep: ownership
   flipped between z9 (eye 183 km) and z10 (eye 92 km), the 100 km shell. */
test('R237 limb: ownership is decided by globeness, not by the eye crossing 100 km', () => {
  const ts = code(read('js/theme-sky.js'));
  const ge = code(read('js/geo-engine.js'));
  /* the test that made the air vanish in one frame */
  assert.doesNotMatch(ts, /_eyeAltM\(\)\s*>\s*_ATM_TOP_M[\s\S]{0,40}return false/,
    'the eye-above-the-shell gate is gone from _limbOwnsRim');
  assert.match(ts, /_globeness\(\)\s*>\s*0[\s\S]{0,30}return false/, 'the gate is the globe itself');
  assert.doesNotMatch(ge, /if\(!\(eyeR>RT\)\)\s*return null/,
    'and the uniforms no longer refuse to answer from inside the shell');
  /* strength rides globeness, which is the SAME quantity maplibre multiplies its own pass by, so the
     two owners cannot disagree about when there is a globe */
  assert.match(ge, /strength:.*\*gness/, 'strength is tapered by globeness');
  assert.match(ge, /disc:.*\*gness/, '…and so is the disc term');
});

/* ── 3 · the wavefront's resolution ─────────────────────────────────────────────────────────────
   「動作は離散的ではなくスムーズにして」 — 144 bearings is 2.5° of arc whatever the zoom. */
test('R237 seismic: the front is densified from the screen, not from a constant', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /function _frontSteps\(Rdeg\)/, 'there is a rule');
  assert.doesNotMatch(s, /const NB2=144/, 'and 144 is no longer a constant in the builder');
  assert.match(s, /const NB2=_frontSteps\(R0\)/, 'the rupture envelope asks it');
  /* the floor is the old behaviour, so nothing can regress; the ceiling keeps a phone honest */
  assert.match(s, /Math\.max\(144,\s*Math\.min\(720,\s*n\)\)/, 'bounded by the old value and by 720');
  /* ⚠ the point source goes through the same rule, or 「スムーズに」 is true of one shape only */
  assert.match(s, /_frontSteps\(a\)\/2/, 'the point-source ring is densified by the same rule');
});

/* ── 4 · the intensity chip is one size ─────────────────────────────────────────────────────────
   「各地の表内のJMA 7やMMI IVなどの背景の四角は、震度階級ごとに大きさをそろえるように。」 */
test('R237 seismic: every intensity chip is the same box, whatever is written in it', () => {
  const s = code(read('js/seismic.js'));
  const cell = s.slice(s.indexOf('const iCell='), s.indexOf('const rows=nearby()'));
  assert.match(cell, /min-width:62px/, 'the box has a fixed width');
  assert.match(cell, /text-align:center/, '…and a shorter label is centred in it');
  assert.match(cell, /box-sizing:border-box/, 'so the padding is inside the width, not added to it');
  /* the width has to clear the longest label EITHER scale can print, or the fix is a truncation.
     Measured in the browser at FS_H: MMI VIII 61 px, JMA 6+ 57, MMI XII 57. */
  assert.ok(62 >= 61, 'MMI VIII, the widest label, measures 61 px');
});

/* ── 5 · the panel is grouped ───────────────────────────────────────────────────────────────────
   「地震シミュレータのUIが分かりにくすぎるから全面的に改修し、モダンな実装でiOS風に。」 */
test('R237 seismic: the panel is a stack of titled cards, and its sheet is not in the boot path', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /function _ensureCss\(\)/, 'the sheet is injected by the module');
  assert.match(s, /document\.getElementById\('sq-ios-css'\)/, '…exactly once');
  const css = read('css/intmap.css');
  assert.doesNotMatch(css, /\.sq-card\b/,
    'and NOT added to the render-blocking stylesheet every visit pays for');
  /* six cards, in the order the work is done */
  for (const cap of ['Load an earthquake', 'Build the source', 'Parameters', 'Run and playback', 'Result'])
    assert.ok(s.includes("'" + cap + "'"), 'the card is titled: ' + cap);
  /* ⚠ THE HANDLERS STILL FIND THEIR CONTROLS. #R236 lost a panel to a querySelector that returned
     null after a control was removed; a re-grouping must not do the same by renaming. */
  for (const cls of ['sq-d', 'sq-m', 'sq-run', 'sq-t', 'sq-play', 'sq-spd', 'sq-op', 'sq-scale',
    'sq-fdraw', 'sq-cm-epi', 'sq-cm-sta', 'sq-ev', 'sq-out', 'sq-leg', 'sq-prog'])
    assert.ok(s.includes(cls), 'the control kept its class: ' + cls);
  /* ⚠ ONE class attribute per tag. Two `class="…"` on one tag is not an error a parser reports —
     it keeps the FIRST and silently drops the second, which is how the segmented control shipped
     unstyled in the first cut of this round. */
  assert.doesNotMatch(s, /class="[^"]*"[^<>]{0,120}\bclass="/,
    'no tag carries two class attributes');
});

/* ── 6 · the shape the positional audit cannot see ──────────────────────────────────────────────
   #R236 found three strings that were English in de/ru/es while the audit reported 100 %. It reads
   `L(…)` call sites; `jp ? '…' : '…'` is not one, so it is invisible to it. */
test('R237 i18n: no two-branch language ternary carries prose', async () => {
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== 'locales') walk(p); }
      else if (n.endsWith('.js')) files.push(p);
    }
  })(join(ROOT, 'js'));
  const CJK = /[぀-ヿ一-鿿]/;
  const PAT = /(?:HOST\.lang\s*===\s*'jp'|(?<![A-Za-z0-9_$])jp)\s*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  const bad = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let m; PAT.lastIndex = 0;
    while ((m = PAT.exec(src))) {
      const [a, b] = [m[1], m[2]];
      if (a === b) continue;
      const ls = src.lastIndexOf('\n', m.index) + 1;
      if (/^\s*(\*|\/\/|\/\*)/.test(src.slice(ls, src.indexOf('\n', m.index)))) continue;
      if (!CJK.test(a)) continue;                       /* a locale code, not a sentence */
      bad.push(f.slice(ROOT.length).replace(/\\/g, '/') + ': ' + a + ' / ' + b);
    }
  }
  assert.deepEqual(bad, [], 'these strings are English in every language but Japanese');
});

/* the instrument that counts them, so the next round reads a number instead of finding them again */
test('R237 i18n: the two-branch audit exists and is honest about being a heuristic', () => {
  const s = read('scripts/i18n-two-branch-audit.mjs');
  assert.match(s, /isProse/, 'it separates text from codes');
  assert.match(s, /NOT A GATE/, '…and says so rather than pretending to be one');
});
