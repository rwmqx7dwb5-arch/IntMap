/* ============================================================================
 *  THE SPACE VIEW AND THE NIGHT SKY — js/space.js and js/night-sky.js
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/space.js and js/night-sky.js are full-screen DOM
 *    views; their arithmetic is restated and evaluated where a relation exists, and the rest is read.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r202-checks.test.mjs (tests #12 of 17) ═══
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

test('R202 ③e the space HUD shows both scales and takes any multiplier', () => {
  const s = rd('js/space.js');
  assert.match(s, /class="sp-scale" data-s="real"/, 'true scale is its own segment');
  assert.match(s, /class="sp-scale" data-s="model"/, 'and so is model scale');
  assert.match(s, /function parseRate/, 'the multiplier is parsed from free text');
  assert.match(s, /class="sp-rate"/, 'and there is a field to type it into');
  assert.match(s, /function rateStep/, 'the ladder steps both ways');
  /* ⚠ the defect rateStep replaces: ⏪ read RATES[i+1] exactly as ⏩ did, so nothing could slow down */
  assert.doesNotMatch(s, /sp-back'\)\.onclick=\(\)=>\{ const i=RATES\.indexOf/, 'the old one-way ladder is gone');
  assert.match(s, /sp-live/, 'and Live is a control of its own');
});
}

/* ═══ from tests/r218-checks.test.mjs (tests #15, #16, #17, #18 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => codeOnly(read(p));

/* ── ⑥ space: the Moon's orbit, the moons that were inside their planet, six switches ────── */
test('#R218 ⑥ the orbit pass walks the list the BODIES are drawn from, so the Moon is in it', () => {
  const s = code('js/space.js');
  assert.match(s, /for\(const id of BODIES\)\{\s*\r?\n\s*if\(id==='sun'\) continue;/,
    'the orbit loop still walks the ephemeris planet list, where the Moon is not');
  assert.match(s, /const o=\(id==='moon'\)\?moonOrbitBuf\(jd\):orbitBuf\(id,jd\)/, "the Moon's own orbit buffer is gone");
  /* the reason it was dead code: ephemeris ORDER is the nine planets */
  assert.equal(/'moon'/.test(/const ORDER=\[[^\]]*\]/.exec(read('js/ephemeris.js'))[0]), false,
    'ephemeris now lists the Moon — the special case above may no longer be needed');
});
test('#R218 ⑥ …a satellite is pushed clear of its primary at model scale, and not at true scale', () => {
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
test('#R218 ⑥ …all six display switches default ON and their data is asked for when the view opens', () => {
  const s = code('js/space.js');
  assert.match(s, /let showOrbits=true, showNames=true, showMoons=true;/);
  assert.match(s, /let showCraft=true, showSmall=true, showDeep=true;/, 'the three populations still default off');
  assert.match(s, /\[\['craft',showCraft\],\['small',showSmall\],\['deep',showDeep\]\]\.forEach\(\(\[k,on\]\)=>\{ if\(!on\) return;/,
    'the populations default on but nothing fetches them when the view opens');
});
test('#R218 ⑥ …the sources panel opens upward so its button does not move, and the return gauge is above the sky', () => {
  const s = code('js/space.js');
  assert.match(s, /flex-direction:column-reverse/, 'the sources panel still pushes its own button up the screen');
  const z = /gauge\.style\.cssText='position:fixed;bottom:96px;transform:translateX\(-50%\);z-index:(\d+);/.exec(s);
  assert.ok(z, 'the approach gauge lost its style');
  const view = /root\.style\.cssText='position:fixed;inset:0;z-index:(\d+);/.exec(s);
  assert.ok(view, 'the space view lost its style');
  assert.ok(+z[1] > +view[1], `the gauge (z ${z[1]}) is still behind the space view (z ${view[1]}) on the way back`);
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #12 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ⑨ the phone's space UI: one owner for the sheet height, and a bar that fits ───────────────── */
test('R223 ⑨ the sheet drag writes the property the stylesheet reads', () => {
  const s = read('js/space.js');
  assert.match(s, /col\.style\.setProperty\('--sp-sheet-h',Math\.max\(PEEK/, 'the drag writes the custom property');
  assert.ok(!/col\.style\.maxHeight=Math\.max/.test(s), 'never an inline max-height — !important beats it');
  assert.match(s, /i0=current\(\);/, 'the tap-cycle reads its stop before the classes come off');
  const css = read('css/intmap.css');
  const own = (css.match(/#space-view \.sp-col\{[^}]*max-height[^}]*!important/g) || []).length;
  assert.equal(own, 1, 'exactly one !important owner of .sp-col max-height (got ' + own + ')');
  assert.match(css, /#space-view \.sp-bar\{ display:grid !important;/, 'the phone bar is a declared grid');
  assert.match(css, /\.sp-bar \.sp-timewrap\{ grid-area:1 \/ 3;/, 'the clock has a place instead of scrolling off');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #9 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => codeOnly(read(p));

/* ⑨ 「Stand and look upは視界部分とパネル部分が重ならないように。視界部分のほうを画面の上側に。」
   The two boxes are bands that cannot intersect — and as of #R245 that is a FLEX COLUMN rather than a
   constant split, so they also leave no gap: the panel is `flex:0 0 auto` (its content decides) and
   the lens is `flex:1 1 auto` (everything left). The contract this test is about — lens above, panel
   below, never overlapping — is stronger under flex than it was under `VIEW_VH`. */
test('r244 ⑨ the standing sky view and its panel are disjoint bands', () => {
  const src = code('js/night-sky.js');
  assert.ok(/root\.style\.display = stand \? 'flex' : 'block'/.test(src), 'the standing overlay is a flex column');
  assert.ok(/flex:1 1 auto;min-height:0/.test(src), 'the lens is the elastic band');
  assert.ok(/flex:0 0 auto/.test(src), 'the panel takes only the height its controls need');
  /* the lens comes FIRST in the DOM, so a column puts it at the top */
  assert.ok(src.indexOf("class=\"ns-wrap\"") < src.indexOf("class=\"ns-panel\""), 'the lens is above the panel');
});
}

/* ═══ from tests/r245-checks.test.mjs (tests #7 of 10) ═══
    IntMap · #R245 — source-level checks
    Seven instructions. Each test below is written against the ROOT CAUSE that was measured, not
    against the symptom, so it fails on the shipped code that produced the report.

    ⚠ Every test strips comments before matching (`code()`), because this file's own subject matter
    quotes the strings it forbids — [[intmap-recurring-lessons]] E, eight rounds running. */
{
/* comments out, string literals kept — the same helper every round since #R208 */
const code = (p) => codeOnly(read(p));

/* ── ⑦ the standing sky view tiles the screen ───────────────────────────────────────────────────
   「Stand and look upはパネル部分をもう少しパネルの領域範囲を整理して。」 A constant split (#R244's
   VIEW_VH) cannot be right — the panel's height depends on the language and the font. */
test('r245 ⑦ the standing view is two flex bands and three columns of controls', () => {
  const src = code('js/night-sky.js');
  /* ⚠ the NAME still appears in the note that explains why it went, so the check is on the CODE
     that used it: the lens was `top:0;height:' + VIEW_VH + 'vh` and the panel `top:' + VIEW_VH`. */
  assert.ok(!/\+ VIEW_VH \+/.test(src), 'nothing is positioned by the constant split any more');
  assert.ok(/flex:1 1 auto;min-height:0/.test(src), 'the lens takes what is left');
  assert.ok(/flex:0 0 auto/.test(src), 'the panel takes what its controls need');
  assert.ok(/ns-cols/.test(src) && /grid-template-columns/.test(src), 'the controls are three columns in the band');
});
}

/* ═══ from tests/r255-checks.test.mjs (tests #6 of 13) ═══
    #R255 — source-level checks
    Each test pins the CAUSE this round measured, not the symptom, so the next
    round cannot re-introduce the same shape somewhere else and pass.

   (layer-manifest) which layers exist, and their facts */
{
/* comments carry the reasoning and quote the very strings under test — strip them first */

/* ── ⑥ one night-sky entry, both views ───────────────────────────────────────────────────────── */
test('#R255 ⑥ the two night-sky menu items became one, and the in-panel switch stays', () => {
  const tp = code(read('js/tool-panel.js'));
  assert.equal((tp.match(/IntMapNightSky&&window\.IntMapNightSky\.open/g) || []).length, 1,
    'there is still more than one night-sky entry in the context menu');
  assert.ok(!/mode:'stand'/.test(tp), 'the standing view is still a separate menu item');
  /* nothing was removed: the panel's own dome/stand switch and the API are untouched */
  const ns = code(read('js/night-sky.js'));
  assert.match(ns, /class="ns-mode" data-m="dome"/, 'the dome/stand switch left the panel');
  assert.match(ns, /class="ns-mode" data-m="stand"/, 'the dome/stand switch left the panel');
  assert.match(ns, /setMode, mode: \(\) => mode/, 'IntMapNightSky.setMode is gone — Atlas and the tests drive the view through it');
});
}

/* ═══ from tests/r258-checks.test.mjs (tests #5 of 16) ═══
    #R258 — source-level checks
    Each test below pins ONE defect this round measured, in the form the
    measurement took. They are source assertions (no browser), which is what the
    `tests/r*-checks` family is for: the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ③ Night sky opens standing ─────────────────────────────────────────────────────────────── */
test('R258 ③: the night sky opens in the standing view', () => {
  const s = read('js/night-sky.js');
  assert.match(s, /let mode = 'stand';/, "the default mode is 'stand'");
  assert.ok(s.includes("first-person|firstPerson|ground)$/i.test(asked)) mode = 'stand'"),
    'an explicit request still overrides it, in both directions');
});
}
