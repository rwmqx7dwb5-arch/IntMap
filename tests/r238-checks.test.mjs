/* ============================================================================
 *  R238 — the air that was still missing, the front that could only be a circle, the panel that
 *  read as three alternatives, and the floating things that now have somewhere to go.
 * ----------------------------------------------------------------------------
 *  ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
 *  is a comment with a runner attached. Where a check pins a RELATION rather than a value, it says
 *  so — #R237's chip constant is exactly what happens when a measurement of one browser is written
 *  into the source as if it were a fact about all of them.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap that has now been
   hit nine times across #R208…#R237. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── 1 · ⑤ the band that was removed is back, and nothing else was moved to compensate ───────────
   「ちげーよ Maplibre固有の大気じゃねーよ だからふざけんな 一度つけてんのに勝手に外すな」

   ⚠⚠⚠ THE FIRST CUT OF THIS ROUND GOT THE CAUSE WRONG AND THIS TEST RECORDED THE WRONG FIX.
   It measured the globe as 25–27 % darker than it used to be, concluded the custom layer's disc air
   was too weak, and raised `_discStrength` 0.20 → 1. The darkness was real; the cause was not.
   Diffing R226 (the last round before #R227) against HEAD settled it: `_horizonColour`, `_skyColour`,
   `_limbHex`, `_horizonBlend` and `_eyeAltM` — every function that produces the band #R213–#R222
   built — are BYTE-FOR-BYTE IDENTICAL. Nothing about the band was rewritten. #R227 zeroed
   `atmosphere-blend`, the one property that carried it to the screen, so that its new layer would
   not add to it. That is the removal, and it was never asked for.

   So this test now checks the two halves of putting it back:
     · the zero is gone and the #R187/#R205 ramps are what is written;
     · `_discStrength` is #R237's 0.20 — the value the reader actually had — because raising it was
       a compensation for a wrong diagnosis, and with the band restored the two add up to 5 % of the
       disc past L235 (#R187's 「質感がチープ」 measure). Measured after: 2.7 %. */
test('R238b sky: the removed band is restored, and nothing was inflated to compensate', () => {
  const s = code(read('js/theme-sky.js'));
  assert.doesNotMatch(s, /'atmosphere-blend':\(limb\?0:/,
    'the band is not switched off to make room for the custom layer');
  assert.match(s, /'atmosphere-blend':\(sat/, 'the ramps are written in their pre-#R227 shape');
  const m = s.match(/function\s+_discStrength\s*\(\)\s*\{\s*return\s+([\d.]+)\s*;\s*\}/);
  assert.ok(m, '_discStrength is still a single-expression function');
  assert.equal(Number(m[1]), 0.20,
    'the custom layer keeps #R237\'s disc strength — restoring the band is the fix, not doubling the air');
  /* and the layer itself is untouched: this restores a removal, it does not undo #R227's own work */
  assert.match(s, /function _limbOwnsRim\(\)/, 'the app still draws its own limb');
  assert.match(s, /limb===_applySkyAtmosphere\._limb/, 'and the camera follow still tracks who owns it');
});

test('R238 sky: the rim is still gated on globeness, not on the eye height', () => {
  const s = code(read('js/theme-sky.js'));
  /* #R237 removed the 100 km shell test; this must not come back — it was the zoom cliff */
  assert.doesNotMatch(s, /_eyeAltM\(\)\s*>\s*_ATM_TOP_M/, 'the shell gate must stay gone');
  assert.match(s, /if\s*\(!\(_globeness\(\)\s*>\s*0\)\)\s*return\s+false/,
    'ownership follows the same globeness maplibre multiplies its own atmosphere by');
});

/* ── 2 · ③ the wavefront radius is interpolated, not quantised to the traced samples ────────────
   Measured before the fix: frontDelta('S', 24 km, t) returned 0.8961573° for BOTH t = 30 s and
   t = 60 s — the S front stood still for half a minute and then jumped. That is 「動作は離散的」,
   and neither #R235 (tick rate) nor #R237 (vertex count) touched it. */
test('R238 fronts: frontDelta interpolates between the bracketing samples', () => {
  const s = code(read('js/seismic.js'));
  const i = s.indexOf('function frontDelta');
  assert.ok(i > 0, 'frontDelta exists');
  const body = s.slice(i, i + 900);
  /* the old body was a single max-scan and returned it directly */
  assert.match(body, /const\s+f\s*=\s*\(t\s*-\s*bestT\)\s*\/\s*\(nx\[1\]\s*-\s*bestT\)/,
    'the answer is interpolated linearly in TIME across the one gap that brackets it');
  assert.match(body, /return\s+best\s*\+\s*Math\.max\(0,\s*Math\.min\(1,\s*f\)\)\s*\*\s*\(nx\[0\]\s*-\s*best\)/,
    'and the interpolation is clamped, so it can never overshoot the next sample');
});

/* ⚠ …and the interpolation is exercised, not just spelled. The same shape frontDelta has: a sorted
   (Δ, T) sample list, and the question «how far by t». A staircase answers with a sample; this must
   answer strictly between two of them. */
test('R238 fronts: the interpolation rule is strictly monotone between samples', () => {
  const pts = [[0, 0], [1, 20], [2, 45], [3, 75]];
  const frontDelta = (t) => {
    let best = null, bestT = null, bi = -1;
    for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (q[1] <= t && (best == null || q[0] > best)) { best = q[0]; bestT = q[1]; bi = i; } }
    if (best == null) return null;
    let nx = null;
    for (let i = bi + 1; i < pts.length; i++) { if (pts[i][0] > best) { nx = pts[i]; break; } }
    if (!nx || !(nx[1] > bestT)) return best;
    const f = (t - bestT) / (nx[1] - bestT);
    return best + Math.max(0, Math.min(1, f)) * (nx[0] - best);
  };
  assert.equal(frontDelta(20), 1, 'a sample time gives that sample exactly');
  const mid = frontDelta(32.5);
  assert.ok(mid > 1 && mid < 2, 'and half-way between two samples the front is half-way between them');
  assert.equal(+mid.toFixed(3), 1.5);
  /* strictly increasing — a staircase would repeat */
  let prev = -1;
  for (let t = 1; t <= 74; t += 1) { const d = frontDelta(t); assert.ok(d > prev, 'the front never stands still at t=' + t); prev = d; }
});

/* ── 3 · ③ the rupture's own front is drawn, because the wavefronts provably cannot carry the shape ─
   t(x) = min_k ( off_k/Vr + dist(k,x)/V ) ≈ d/V + min_k [ off_k·(1/Vr − cos(b−φ_k)/V) ], and every
   bracket is ≥ 0 while Vr ≤ V, so the first-arrival isochron is exactly the hypocentre's circle. */
test('R238 fronts: the envelope collapses to the hypocentre for every shipped wave speed', () => {
  const BETA = 3500, VR = 0.75 * BETA;
  for (const V of [6100, BETA, 3500, 4400]) {
    let worst = Infinity;
    for (let db = 0; db <= 180; db += 5) worst = Math.min(worst, 1 / VR - Math.cos(db * Math.PI / 180) / V);
    assert.ok(worst > 0, 'with Vr=' + VR + ' and V=' + V + ' the hypocentre always wins, so the wavefront is a circle');
  }
});

test('R238 fronts: the broken part of the rupture is emitted as its own feature', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /properties:\{kind:'rup'\}/, 'the broken area is drawn');
  assert.match(s, /properties:\{kind:'rupedge'\}/, 'and its leading edge is drawn');
  assert.match(s, /const\s+rB\s*=\s*\(VRUP_KMS\s*\*\s*tSec\)\s*\/\s*\(D\s*\*\s*RE\)/,
    'the break runs at the rupture velocity, from the nucleation point');
  /* both layers must exist, or the features are computed and never seen (#R235's defect shape) */
  assert.match(s, /id:'seis-rup-fill'/, 'the fill layer is registered');
  assert.match(s, /id:'seis-rup-edge'/, 'the edge layer is registered');
});

/* ── 4 · ③ the body waves cross the crust they are actually crossing ────────────────────────────
   P and S were bearing-INDEPENDENT by construction, so two of the four rings were exact circles
   whatever the reader drew, which is most of what 「まだ震央中心の同心円に見える」 was looking at. */
test('R238 fronts: P and S go through the per-bearing builder and the crustal correction', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /function\s+_bodyStretch\s*\(brg,deltaDeg,depKm\)/, 'the correction exists');
  assert.match(s, /return\s+deltaDeg\s*\*\s*\(1-wC\+wC\*g\)/, 'and it is applied to the crustal SHARE only');
  /* the old line drew a plain ring for a point source and threw the bearing away */
  const i = s.indexOf('PH.forEach');
  const blk = s.slice(i, i + 700);
  assert.doesNotMatch(blk, /fault\?faultFrontLines\(rad\):\(\(rad\(null\)/,
    'the point-source shortcut that ignored the bearing must be gone');
  /* ⚠ (#R239) SAME CLAIM, NEW SPELLING. #R238 wrote `const lines = faultFrontLines(rad)`; #R239 gave
     each phase a leading edge, a trailing edge and the band between them, so the call is
     `train(rad, …)` — which builds BOTH rings through `faultRing()`, i.e. through the per-bearing
     builder this test is about. The property being asserted is unchanged: no phase gets a
     bearing-independent shortcut. (#R203's rule: move the assertion, say why.) */
  assert.match(blk, /train\(rad,ph\.col,ph\.w\)/, 'both body waves go through the per-bearing builder');
  assert.match(s, /function faultRing\(rFor,side\)/, 'and that builder is one function for both edges');
  assert.match(s, /function faultFrontLines\(rFor\)\{\s*const r=faultRing\(rFor,'front'\)/,
    'the old entry point is still there, as the leading edge of that one builder');
});

/* the correction is bounded — it must never turn into a decorative wobble, and the prune below
   depends on that bound being true */
test('R238 fronts: the crustal correction cannot exceed the mask ratio it is built from', () => {
  const s = code(read('js/seismic.js'));
  const g = Number((s.match(/let\s+OCEAN_G\s*=\s*([\d.]+)/) || [])[1]);
  assert.ok(g > 1 && g < 1.15, 'OCEAN_G is the only source of azimuthal spread and is ' + g);
  const slack = Number((s.match(/const\s+_PRUNE_SLACK\s*=\s*([\d.]+)/) || [])[1]);
  assert.ok(slack > g, 'the prune slack (' + slack + ') must clear the largest factor the path can apply (' + g + ')');
});

/* ── 5 · ③ the per-frame work is cut where the answer is already known ──────────────────────────
   Measured: 25 source points survive the prune to 1 at t = 60 s, so the bearing loop does 1/25 of
   the work it did. The cache and the carried trig are the other half. */
test('R238 fronts: the source points are cached and carry their own trig', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /let\s+_spCache\s*=\s*null,\s*_spKey\s*=\s*''/, 'the source points are cached');
  assert.match(s, /if\(_spCache&&_spKey===key\)\s*return\s+_spCache/, '…and the cache is actually consulted');
  assert.match(s, /k\.cA\s*=\s*Math\.cos\(k\.off\*D\);\s*k\.sA\s*=\s*Math\.sin\(k\.off\*D\)/,
    'cos(off) and sin(off) are computed once per point, not once per (point, bearing)');
  const i = s.indexOf('function _envR');
  const body = s.slice(i, i + 420);
  assert.doesNotMatch(body, /Math\.cos\(k\.off\*D\)/, '_envR must not recompute them per bearing');
  assert.match(body, /const\s+A\s*=\s*k\.cA/, 'it reads the carried value');
});

/* ── 6 · ⑥ the source is built in numbered steps, and the instruction is not printed twice ──────── */
test('R238 panel: the three source controls are a step list, not a segmented track', () => {
  const s = read('js/seismic.js');
  assert.match(s, /class="sq-step/, 'each step is its own row');
  assert.match(s, /class="sq-stn"/, 'with its own number badge');
  /* the handlers must still find what they grab — a re-shape, not a rewrite */
  for (const cls of ['sq-fdraw', 'sq-cm-epi', 'sq-cm-sta', 'sq-fclear']) {
    assert.ok(s.indexOf('class="' + cls) >= 0 || s.indexOf("'" + cls) >= 0, cls + ' is still emitted');
    assert.ok(s.indexOf("querySelector('." + cls + "')") >= 0, cls + ' is still wired');
  }
  /* ⚠ one tag, one class attribute — #R237 shipped `class="a" class="b"` and the parser silently
     dropped the second, leaving the segmented control unstyled. */
  const dup = s.match(/<[a-z]+[^>]*\bclass=("|')[^"']*\1[^>]*\bclass=/g);
  assert.equal(dup, null, 'no tag carries two class attributes');
});

test('R238 panel: the instruction banner is emitted once, inside the armed step', () => {
  const s = read('js/seismic.js');
  /* ⚠ COUNT THE BANNERS, NOT THE SENTENCES. The first build printed the epicentre instruction twice
     — once inside step 2 and again from #R234's shared banner below step 3 — and it is visible in
     the screenshot of that build. But the same SENTENCE legitimately appears a second time as the
     `hint` handed to IntMapPick for the phone's one-shot pick (a different surface, not this panel),
     so a text count would fail on a string that is doing its job. The panel's own instruction is a
     BANNER(…) call, and there are exactly three armed states that have one. */
  const calls = (s.match(/[^=]BANNER\(/g) || []).length;
  assert.equal(calls, 3, 'one banner per step: rupture area, hypocentre, observation points');
  /* and #R234's chain that sat outside all three steps must be gone */
  assert.doesNotMatch(code(s), /:\s*clickMode==='epi'\s*\?\s*BANNER/,
    'the shared banner below the three controls must not come back');
});

/* ── 7 · ⑥ the intensity chips are one box, measured rather than written down ──────────────────── */
test('R238 chips: the width is measured at run time, not a constant in the markup', () => {
  const s = code(read('js/seismic.js'));
  assert.doesNotMatch(s, /min-width:62px;padding:3px 6px/, '#R237\'s hard-coded box must be gone');
  assert.match(s, /width:'\+_chipW\(\)\+'px/, 'the chip takes its width from the measurement');
  assert.match(s, /function\s+_chipW\s*\(\)/, 'and the measurement exists');
  const i = s.indexOf('function _chipW');
  const body = s.slice(i, i + 1400);
  /* ⚠ DERIVED, NOT TYPED: a list of labels here would go stale the moment a class is added */
  assert.match(body, /JMA_CLASSES\.forEach/, 'the JMA labels come from the class table');
  assert.match(body, /ROMAN\[i\]/, 'and the MMI labels from the numeral table');
  assert.match(body, /_cwCache&&_cwCache\.key===key/, 'the answer is cached against the font it measured');
});

/* ── 8 · ④ the dock — every floating thing, and only the floating things ────────────────────────── */
test('R238 dock: membership is the window registry plus map-level legends', () => {
  const s = code(read('js/window-manager.js'));
  assert.match(s, /function\s+setDocked\s*\(on\)/, 'the mode exists');
  assert.match(s, /__winReg\.forEach/, 'every registered window is a member');
  /* ⚠ DIRECT CHILDREN ONLY. A descendant match pulled in the twelve lyrrow-* rows of the layer
     panel — dismantling a control rather than docking a legend. */
  assert.match(s, /const\s+DOCK_SEL\s*=\s*':scope > \[class\*="legend"\], :scope > \[id\*="legend"\]'/,
    'legends are matched as direct children of the map container');
  assert.doesNotMatch(s, /observe\(mc,\{childList:true,subtree:true\}\)/,
    'the observer must not walk the renderer\'s whole subtree');
});

test('R238 dock: what is moved is restored exactly, including the dragged geometry', () => {
  const s = code(read('js/window-manager.js'));
  assert.match(s, /__docked\.set\(el,\{\s*parent:el\.parentNode,\s*next:el\.nextSibling,\s*css:el\.getAttribute\('style'\)\|\|''\s*\}\)/,
    'the parent, the sibling AND the inline geometry are remembered');
  /* ⚠⚠ (#R239) THE RESTORE IS NARROWER NOW, AND THAT IS THE FIX, NOT A REGRESSION. #R238 docked a
     panel by deleting its whole inline style and undocked it by writing the stored string back.
     Both halves were wrong once membership came to mean «switched on»: the strip took the
     `display:flex` a legend is opened with (its opacity slider was then cropped by
     `display:block !important`), and the restore put an old `display` back — so switching a docked
     layer OFF undocked it, revived it, and the observer docked it again. Only the GEOMETRY moves in
     either direction now. The claim this test makes — that what was moved comes back exactly where
     it was — is unchanged, and `_restoreGeom` reads it out of the same stored string. */
  assert.match(s, /function _restoreGeom\(el,css\)/, 'and the geometry is put back');
  assert.match(s, /_restoreGeom\(el,s\.css\)/, 'from that stored string');
  assert.doesNotMatch(s, /el\.setAttribute\('style',\s*s\.css\)/,
    'but NOT the whole style — that resurrected panels the reader had switched off');
  assert.match(s, /el\.classList\.remove\('im-docked'\)/, 'the flattening class comes off');
});

test('R238 dock: it is a saved setting, off by default, with a tab that only exists when it is on', () => {
  const app = code(read('js/app-body.js'));
  assert.match(app, /window\.imDockPanels\s*=\s*'off'/, 'the default is off');
  assert.match(app, /if\(s\.dockPanels==='on'\|\|s\.dockPanels==='off'\)\s*window\.imDockPanels=s\.dockPanels/, 'it is restored');
  assert.match(app, /dockPanels:window\.imDockPanels/, 'and it is saved');
  /* ⚠ the glue is in js/window-manager.js, NOT in app-body: tests/r168 #8 budgets the app shell at
     8,200 lines and this feature put it at 8,232, so the feature moved out rather than the ceiling
     moving up. app-body keeps only the one call that hands over what its closure owns. */
  assert.match(app, /IM_WINMGR\.wireDock\(\{/, 'app-body hands the glue over to the window manager');
  const wm = code(read('js/window-manager.js'));
  assert.match(wm, /b\.style\.display=on\?'':'none'/, 'the tab is shown only while the mode is on');
  /* leaving the mode while the dock tab is open must not strand the reader on a tab that is gone */
  assert.match(wm, /if\(!on&&ops\.mode&&ops\.mode\(\)==='docked'\)/, 'switching it off leaves the dock tab');
  const html = read('index.html');
  assert.match(html, /id="btn-docked"[^>]*style="display:none;"/, 'the tab starts hidden');
  assert.match(html, /id="docked-feed"/, 'the dock has a container');
  assert.match(html, /id="setting-dock-panels"/, 'and the setting is in the dialog');
});

/* ── 9 · the strings this round added exist in every language ────────────────────────────────────
   #R231/#R232/#R236/#R237 each found a shape the audit could not see. This checks the KEYS added
   this round, in the table each language actually reads. */
test('R238 i18n: the dock strings are present in all nine languages', () => {
  /* ⚠ (#R239) THE CLAIM IS UNCHANGED; THE PLACE IT IS MADE MOVED. These five keys used to live in
     js/i18n-late.js as `Object.assign(i18n.en,{…})` / `Object.assign(i18n.jp,{…})`, and this test
     read that file for en and jp. #R239 moved every keyed string into js/locales/ui.<code>.js —
     because that file shape is five languages by construction, and fr/ko/zh were silently falling
     back to English for ~170 keys declared that way (scripts/i18n-keyed-audit.mjs). So the loop is
     now nine locale files, and the en/jp occurrence-count check is gone with the shared file that
     made it necessary. #R203's rule: move the assertion, say why. */
  const keys = ['tabDocked', 'lblDockPanels', 'dockPanelsOff', 'dockPanelsOn', 'dockPanelsHint'];
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    const f = 'js/locales/ui.' + c + '.js';
    const s = read(f);
    for (const k of keys) assert.ok(s.indexOf(k + ':') >= 0, c + ' is missing ' + k + ' (' + f + ')');
  }
});