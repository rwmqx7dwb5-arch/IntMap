/* ============================================================================
 *  THE SEISMIC SIMULATOR — the panel
 * ----------------------------------------------------------------------------
 *  Controls, the transport, the intensity chips, the site table and what the panel says.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The panel is markup and handlers built inside
 *    js/seismic.js's factory closure against the page DOM; a Node test cannot open it, so these read
 *    the source (comments stripped). What the panel SHOWS on screen is measured by the Playwright
 *    specs.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs, { readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #11 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{

/* ── 7 · seismic: the overhaul ───────────────────────────────────────────────────────────────── */
test('R189 seismic: real-time playback with a visible, settable rate', () => {
  const src = read('js/seismic.js');
  assert.match(src, /let speed=1; const SPEEDS=\[1,2,5,10,30,60,120,300\];/, '×1 default, a real choice list');
  assert.match(src, /tSec=\(tSec\+\(now-last\)\/1000\*speed\)%MAXT;/, 'wall-clock seconds × rate — not 10 s per 90 ms');
  /* (#R237) the control gained a styling class in the same attribute — `class="sq-spd sq-sel"` —
     so the claim is «the control is there», not «the attribute is spelled with a closing quote here». */
  assert.match(src, /class="sq-spd[ "']/, 'the rate is on the panel');
  assert.match(src, /setSpeed\(v\)\{/, 'and callable');
});
}

/* ═══ from tests/r191-checks.test.mjs (tests #8 of 11) ═══
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

test('R191 seismic: Japanese defaults to the JMA scale, and a chosen scale latches', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const scaleForLang=\(\)=>\(HOST\.lang==='jp'\)\?'jma':'mmi';/, 'the language picks the default');
  assert.match(s, /let scale=scaleForLang\(\);/, 'at construction');
  assert.match(s, /function pickScale\(v\)\{[^}]*scaleSet=true; return true; \}/, 'and a choice latches');
  assert.match(s, /window\.addEventListener\('intmap-lang',\(\)=>\{ if\(!scaleSet\)\{ const want=scaleForLang\(\);/,
    'a later language change moves the DEFAULT only');
  for (const call of [/sc\.onchange=e=>\{ pickScale\(/, /if\(o\.scale==='mmi'\|\|o\.scale==='jma'\) pickScale\(o\.scale\)/, /setScale\(v\)\{ if\(pickScale\(v\)\)/])
    assert.match(s, call, 'every entry point latches through pickScale');
});
}

/* ═══ from tests/r218-checks.test.mjs (tests #24 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '');
test('#R218 ⑧ both seismic click modes turn off when pressed again, and an unarmed map is not claimed', () => {
  const s = code('js/seismic.js');
  assert.match(s, /if\(clickMode==='epi'\) setClickMode\('none'\)/, 'the epicentre segment has no off state');
  assert.match(s, /setClickMode\(clickMode==='station'\?'none':'station'\)/, 'the place segment has no off state');
  /* (#R236) the slice ends at the epicentre branch, whose spelling changed when the containment
     test went in front of it — take it to `setEpi(...)` either way.
     (#R240) …and it changed again: placing the FIRST epicentre moves the panel to a different step
     of its flow, so that branch now redraws the panel as well as the field. The claim this test
     makes — the armed test comes before the claim — is untouched; only where the slice ends moved. */
  const oc = /function onClick\(e\)\{[\s\S]*?setEpi\((?:\[e\.lngLat\.lng,e\.lngLat\.lat\]|p)\); refresh\(\);/.exec(s)[0];
  assert.ok(oc.indexOf("clickMode==='none'") < oc.indexOf('claimClick'),
    'the panel claims the tap before deciding whether it wants it');
});
}

/* ═══ from tests/r226-checks.test.mjs (tests #4 of 5) ═══
    #R226 — the round's own contracts, checked in Node
    100 % means 100 % · a 1.0 km cell · one bilinear, prepared per row ·
    the limb was lilac because the march was coarse · progress is written when it changes. */
{
const root = new URL('../', import.meta.url);

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
}

/* ═══ from tests/r232-checks.test.mjs (tests #9 of 18) ═══
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

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK. #R231 hit this five times and #R208/#R229
   before it: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax,
   never prose. */
const noJs = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('R232 seismic + tsunami: the method folds away, the warning does not', () => {
  /* ⚠ (#R245) the SENTENCE is the reader's, not this test's — 「これは文言を整えて」 reworded the
     seismic panel's line, and a test that pins prose it does not own turns an editorial change into a
     failure. What this test is about is WHERE the line is (above the fold), so each file names its own
     opening words and the position check is unchanged. */
  const OPENER = { 'js/seismic.js': 'An educational model. In a real emergency,',
                   'js/tsunami.js': 'Educational model — in a real emergency follow the official authorities.' };
  for (const f of ['js/seismic.js', 'js/tsunami.js']) {
    const s = read(f);
    assert.match(s, /<details class="(?:sq|tsu)-meth"/, `${f} folds its method + sources`);
    assert.match(s, /Method & sources/, `${f} names the fold`);
    assert.ok(s.includes(OPENER[f]), `${f} keeps the safety line OUTSIDE the fold`);
    /* the safety line must not be inside the <details> */
    /* ⚠ against the METHOD fold specifically — the seismic panel has an earlier <details> of its
       own (the fault-geometry overrides), and matching the first one made this pass for the wrong reason. */
    const i = s.indexOf(OPENER[f]);
    const j = s.search(/<details class="(?:sq|tsu)-meth"/);
    assert.ok(i > 0 && j > 0 && i < j, `${f}: the warning is above the fold, not in it`);
  }
  assert.doesNotMatch(noJs(read('js/seismic.js')), /🌐 '\+L\('Seismic waves'/, 'the globe emoji is gone');
});
}

/* ═══ from tests/r234-checks.test.mjs (tests #6, #7, #8, #9, #10 of 13) ═══
    R234 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic rather than text, it is COMPUTED here rather
    than pinned to a number this round happened to produce (#R203/#R229). */
{

/* ── 4 · the panel: the glyphs, the banner, the two-state run button, the intensity chip ────── */
test('R234 seismic panel: no ✏ / 🌎 / ◎ / ◇, and no idle sentence', () => {
  /* ⚠ COMMENTS STRIPPED FIRST. This project's most repeated self-inflicted failure is a check
     matching the prose that describes it (#R208, #R215, #R231, #R232 — 'コメントを剥いで構文で照合').
     The note beside the button necessarily QUOTES the instruction that removed the glyph. */
  const s = read('js/seismic.js').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const g of ['✏', '🌎']) assert.ok(!s.includes(g), 'the ' + g + ' is gone from the panel');
  assert.doesNotMatch(s, /"sq-cm-epi" style="'\+SEG\(clickMode==='epi'\)\+'">◎ /, 'the ◎ is off the button');
  assert.doesNotMatch(s, /"sq-cm-sta" style="'\+SEG\(clickMode==='station'\)\+'">◇ /, 'the ◇ is off the button');
  assert.ok(!s.includes('◎ で震源を配置、◇ で地点を追加します。'), 'the idle sentence is deleted, not reworded');
});

test('R234 seismic panel: one banner shape for all three modes, and the run button has two states', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const BANNER=\(txt\)=>/, 'there is exactly one banner');
  /* ══ ⚠⚠ (#R238) ALL THREE MODES STILL GET AN INSTRUCTION — EACH INSIDE ITS OWN STEP ══════════════
     #R234's shape was one banner under a row of three buttons, and this pinned the ternary CHAIN that
     chose between them. #R238 made the three controls a numbered step list, because a segmented track
     says 「pick one of these」 and these are a sequence with state; the instruction moved INSIDE the
     armed step, directly under the button that armed it. Keeping the old chain as well printed the
     epicentre instruction TWICE (visible in that build's screenshot), so it was deleted rather than
     hidden. What this test is FOR — every armed mode says what to do, in one shape, in the reader's
     language — is unchanged, and is asserted against the step list instead of against the chain. */
  assert.match(s, /_fDrawing\?BANNER\(/, 'the drawing mode gets the instruction the item asks for');
  assert.match(s, /clickMode==='epi'\?BANNER\(/, 'the epicentre mode gets one too');
  assert.match(s, /clickMode==='station'\?BANNER\(/, 'and so does the observation-point mode');
  assert.match(s, /地図上で震源域を囲ってください。/, '…and it says what to do');
  assert.match(s, /クリックで開始し、続けてクリックして囲み、最初の点をもう一度クリックすると終了です。/,
    '…including how the stroke starts and ends');
  /* …and exactly one banner per step, so no instruction is printed twice */
  assert.equal((s.match(/[^=]BANNER\(/g) || []).length, 3, 'one banner per step, with no shared copy below them');
  /* one predicate decides BOTH the colour and the wording */
  assert.match(s, /function _needsRun\(\)\{ return !fld\|\|fldStale; \}/, 'one predicate for "there is something to compute"');
  /* (#R237) the two states are a CLASS now, not a cssText — same predicate, same two states. */
  assert.match(s, /function _runBtnClass\(\)\{[^}]*_needsRun\(\)\?' sq-btn-accent':''/s,
    'the accent fill is that predicate');
  assert.match(s, /function _runBtnLabel\(\)\{ return '▶ '\+\(_needsRun\(\)/, 'and so is the wording');
  assert.doesNotMatch(s, /"sq-run" style="'\+BTN\+'width:100%;background:var\(--primary-color\);color:#fff;border:none;font-weight:700;">▶ /,
    'the fill is no longer unconditional');
  /* it has to be repainted where staleness changes, or the colour is a lie */
  assert.match(s, /function markStale\(\)\{ fldStale=true; if\(opened\)\{ report\(\); _paintRunBtn\(\); \} \}/,
    'a change repaints the button');
  assert.match(s, /report\(\); _paintRunBtn\(\); \} \} \}/, 'and so does the build finishing');
});

/* ⚠⚠ REVERSED BY #R235, NOT DELETED — the same move #R234 §6b had to make on two of #R232's checks.
   This test used to REQUIRE `background:'+_onDark(col)+';color:#fff` and `font-weight:800`, which is
   the state the next instruction forbade: 「四角背景で、太字禁止、かつそれぞれの震度色（そのままの色）
   背景と白文字に。」 The parenthetical 「そのままの色」 is the operative word — #R234 had DARKENED the
   swatch so white could sit on it, and that made the chip legible and the wrong colour.
   What survives unchanged is the CLAIM the old test was really making: the label must be readable on
   every class of both scales. The variable is now the ink, not the background (see `_chipInk`). */
test('R234→R235 seismic panel: the intensity chip names its scale, and its label reads on every class', () => {
  const s = read('js/seismic.js');
  assert.match(s, /txt='JMA '\+c\.id;/, 'the JMA cell says JMA 6+');
  assert.match(s, /txt='MMI '\+ROMAN\[/, 'the MMI cell says MMI X');
  /* the background is the class colour ITSELF, square-cornered and not bold */
  assert.match(s, /border-radius:0;background:'\+col\s*\n?\s*\+';color:'\+_chipInk\(col\)/,
    'the raw class colour is the background and the ink is what adapts');
  assert.match(s, /\+';font-size:'\+FS_H\+';font-weight:400;/, 'the chip is not bold');
  assert.doesNotMatch(s, /function _onDark\(/, 'the darkener is gone — the colour is used as published');
  /* run _chipInk over every class of both scales: whichever ink it picks must clear 3:1 */
  const chipInk = (hex) => { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return { L, ink: L > 0.30 ? '#000' : '#fff' }; };
  const JMA = ['#F2F2FF', '#00AAFF', '#0041FF', '#FAE696', '#FFE600', '#FF9900', '#FF2800', '#A50021', '#B40068'];
  /* the MMI ramp's own anchors (js/seismic.js mmiRGB) — the far ends are the hard cases */
  const MMI = ['#FFFFFF', '#BFCCFF', '#A0E6FF', '#80FFA0', '#FFFF00', '#FFC800', '#FF9100', '#FF0000', '#C80000', '#800000'];
  let black = 0, white = 0;
  for (const hex of JMA.concat(MMI)) {
    const { L, ink } = chipInk(hex);
    const contrast = ink === '#fff' ? 1.05 / (L + 0.05) : (L + 0.05) / 0.05;
    assert.ok(contrast >= 3, hex + ': the chosen ink (' + ink + ') clears 3:1 (got ' + contrast.toFixed(2) + ')');
    if (ink === '#000') black++; else white++;
  }
  /* ⚠ both inks have to actually occur, or the rule is a constant wearing a function's clothes */
  assert.ok(black > 0 && white > 0, 'the rule picks black on the light classes and white on the dark ones');
});

test('R234 seismic panel: the three model assumptions moved behind 詳細設定', () => {
  const s = read('js/seismic.js');
  assert.match(s, /function _modelAdvHTML\(\)\{/, 'there is a model-assumptions disclosure');
  const adv = s.slice(s.indexOf('function _modelAdvHTML(){'), s.indexOf('function _faultAdvHTML(){'));
  for (const cls of ['sq-sd', 'sq-site', 'sq-q0', 'sq-qe']) {
    assert.ok(adv.includes(cls), cls + ' is inside the disclosure');
    /* (#R237) the control gained a styling class in the SAME attribute (`class="sq-q0 sq-num"`), so
       counting `class="sq-q0"` counts zero. The claim is «exactly one of these controls exists». */
    assert.equal(s.split(new RegExp('class="' + cls + '[ "]')).length - 1, 1, cls + ' exists exactly once');
  }
  /* (#R242) 「Advanced設定はひとつにまとめろ」 — the two folds are one <details> now, so the open state
     is one flag. The contract this line states — it survives a re-render — is unchanged. */
  assert.match(s, /_advOpen=d\.open/, 'and it stays open across a re-render');
});

test('R234 seismic panel: one type scale, and grey only on the window chrome', () => {
  const s = read('js/seismic.js');
  for (const px of ['9.5px', '10px', '10.5px', '11px', '11.5px']) {
    assert.ok(!s.includes('font-size:' + px), 'font-size:' + px + ' is gone — see FS / FS_S / FS_H');
  }
  /* --text-muted survives ONLY where grey is the meaning: the ✕ / — chrome and 「無感」 */
  /* ⚠ (#R237) THE CLAIM IS «GREY ONLY ON THE CHROME», WHICH IS A CEILING, NOT AN EXACT COUNT. The
     iOS restyle moved declarations out of inline strings into the panel's sheet, so an exact 2 is a
     count of a spelling. What must stay true is that grey never lands on content. */
  /* ⚠ (#R239) THE CEILING IS 3 NOW, AND THE THIRD SITE IS NAMED. The on-map step HUD's second line
     is an instruction — «tap each corner, then press Done» — which is chrome in exactly the sense
     this rule protects: it is not a measurement, an intensity or a place name. The claim is still
     «grey never lands on content», and the number still catches a fourth site. The three are: the
     ✕/— window glyphs, 「無感」, and `#sq-hud .sqh-s`. */
  /* ⚠ (#R242) THE CEILING IS 10, AND THE SEVEN NEW SITES ARE NAMED — the rule is «grey never lands
     on CONTENT», and every one of these is a LABEL for something that is not grey: `.sq-obs th` and
     `.sq-obs-w th` (the row names of the observed-values table), `.sq-advh` twice (the two
     sub-headings inside the one 詳細設定), `.sq-pl-times` (the total duration, beside an elapsed time
     that is not grey), `.sq-pl-spdl` (the speed caption) and `.sq-ev-x` (the ✕ that unloads an
     earthquake — chrome in exactly the #R239 sense). An eleventh site still fails this. */
  /* ⚠ (#R243) THE CEILING IS 11, AND THE NEW SITE IS `.sq-pl-cap` — the line above the transport that
     names what it plays (「波の伝播」). It is the same category as `.sq-pl-spdl` one line below it: a
     CAPTION for a control, not a measurement, an intensity or a place name. The rule is unchanged and
     still catches a twelfth site. */
  const muted = s.split('color:var(--text-muted)').length - 1;
  assert.ok(muted <= 11, 'grey is left on the window-chrome glyphs and nowhere else (found ' + muted + ')');
  assert.ok(s.includes("#sq-hud .sqh-s{display:block;font-size:'+FS_S+';color:var(--text-muted)"),
    'the third is the HUD instruction line');
  const t = read('js/tsunami.js');
  for (const px of ['9.5px', '10px', '10.5px', '11px', '11.5px']) {
    assert.ok(!t.includes('font-size:' + px), 'the tsunami panel shares the scale (' + px + ')');
  }
  assert.equal(t.split('color:var(--text-muted)').length - 1, 2, 'and the same rule about grey');
});
}

/* ═══ from tests/r235-checks.test.mjs (tests #1, #2 of 9) ═══
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
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── 1 · 「無感」 was three different answers wearing one label ──────────────────────────────── */
test('R235 seismic table: "not felt" is the ground, not the model running out of range', () => {
  const s = code(read('js/seismic.js'));
  /* the cell must NOT gate on `calibrated` any more — that is the defect itself */
  assert.doesNotMatch(s, /if\(!a\.calibrated\) return none;/,
    'the intensity cell no longer blanks on `calibrated`');
  assert.match(s, /if\(!\(a\.pgv>=PGV_FELT\)\) return plain\(notFelt\);/,
    '「無感」 is printed only when the ground is not moving');
  assert.match(s, /if\(!a\.inRange\) return plain\(noAnswer\);/,
    'past the calibrated range the table says so instead of saying "not felt"');
  /* `calibrated` still exists and still goes false above MMI 9.5 — the point is that the CELL
     no longer asks it. If that ever stops being true this test is meaningless, so assert it. */
  assert.match(s, /calibrated:\(inRange&&pgv>=PGV_FELT&&mmi<=9\.5\)/,
    'calibrated still carries the MMI ceiling (which is why the cell must not use it)');

  /* the arithmetic, so the defect is demonstrated rather than described: an M9-class PGV at the
     epicentre converts to MMI above the GMICE ceiling, i.e. `calibrated` false while shaking hard */
  const mmiOf = (pgv) => { const lg = Math.log10(Math.max(1e-6, pgv));
    return Math.max(1, Math.min(12, (lg <= 0.53) ? (3.78 + 1.47 * lg) : (2.89 + 3.16 * lg))); };
  const pgv = 435;                       /* cm/s — measured in-browser near an M9.5 epicentre */
  const mmi = mmiOf(pgv);
  assert.ok(mmi > 9.5, 'the worst-hit ground is above the GMICE ceiling (MMI ' + mmi.toFixed(2) + ')');
  const oldWouldSayNotFelt = !(true && pgv >= 0.062 && mmi <= 9.5);
  assert.ok(oldWouldSayNotFelt, 'and the old test would therefore have printed 「無感」 for it');
});

/* ── 2 · the chip: raw colour, square, not bold, ink chosen for contrast ────────────────────── */
test('R235 seismic table: the chip is the published colour, square and unbolded', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /border-radius:0;background:'\+col/, '四角背景 — no corner radius, and the class colour itself');
  assert.match(s, /font-weight:400;line-height/, '太字禁止');
  assert.match(s, /function _chipInk\(hex\)\{/, 'the ink is a function of the swatch');
  assert.doesNotMatch(s, /_onDark/, '#R234’s darkener is gone — 「そのままの色」');
});
}

/* ═══ from tests/r236-checks.test.mjs (tests #8, #12, #14 of 14) ═══
    R236 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).

    ⚠⚠ AND THE FIRST GROUP DRIVES THE REAL SCHEDULER RATHER THAN GREPPING FOR IT.
    #R235's own lesson was that `_pathDeg`'s unit test passed while the caller threw
    its result away — «関数を検査しても配線は検査されない». The runtime is an
    ES module with one export, so the honest check is to RUN it: stub the four
    globals it touches, pump the frame clock by hand, and count. */
{
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234/#R235 — EIGHT rounds of a check hitting its own explanation).
   Strip the comments and match the SYNTAX. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── 4 · the rupture area comes first, and the hypocentre goes on it ─────────────────────────── */
test('R236 seismic: draw / hypocentre / place sit in ONE row, rupture area first', () => {
  const s = code(read('js/seismic.js'));
  /* (#R237) the row is now a segmented TRACK (`.sq-segwrap`) inside a card block — the same three
     controls in the same order, with the accent pill the iOS restyle gave them. The claim is the
     ORDER, which is what 「やっぱり、震源域を先に」 asked for. */
  /* ══ ⚠ (#R238) THE ORDER IS THE CLAIM, AND IT SURVIVED THE STEP LIST ═════════════════════════════
     #R238 replaced the one flex row with a numbered STEP LIST (a segmented track says 「pick one of
     these」; these are a sequence with state). The three controls, their class names and — the thing
     this test exists for — their ORDER are untouched, so the assertion follows them out of the row
     and into the list rather than pinning a `<div>` that no longer exists. */
  const card = s.slice(s.indexOf("const step=(n,cls,title,value,btn,body)"), s.indexOf("CARD 3"));
  assert.ok(card.length > 200, 'the three controls share one card');
  const order = [...card.matchAll(/class="(sq-fdraw|sq-cm-epi|sq-cm-sta)[ "']/g)].map((m) => m[1]);
  assert.deepEqual(order, ['sq-fdraw', 'sq-cm-epi', 'sq-cm-sta'],
    '「やっぱり、震源域を先に」 — the steps read in the order the work is done');
  /* …and they are numbered 1, 2, 3 in that same order */
  assert.deepEqual([...card.matchAll(/return step\('(\d)'|\+step\('(\d)'/g)].map((m) => m[1] || m[2]), ['1', '2', '3'],
    'the numbers on the badges match the order of the work');
});

/* ── 5 · one picker, two sources ─────────────────────────────────────────────────────────────── */
test('R236 seismic: past and recent earthquakes are ONE control, switch above the shared list', () => {
  const s = code(read('js/seismic.js'));
  /* ⚠ (#R237) THE CLAIM IS «BOTH SIDES EXIST», NOT «THE ATTRIBUTE IS SPELLED THIS WAY». These read
     `class="sq-src-past"` exactly, and #R237's iOS restyle put the segment class in the same
     attribute — `class="sq-src-past '+SEGC(…)+'"` — which is the same control with a second class on
     it. The test failed on the QUOTE MARK. Pinning a spelling is #R203's defect (「値のピン留め」):
     it costs a round every time the markup is touched and it never once caught a real fault. */
  assert.match(s, /class="sq-src-past[ "']/, 'the switch has a past side');
  assert.match(s, /class="sq-src-recent[ "']/, '…and a recent side');
  /* the list is a single <select>, filled from whichever source is showing */
  assert.match(s, /evSrc==='recent'\s*\?\s*\('<option value=""/, 'one list, two fillings');
  assert.match(s, /QUAKE_EVENTS\.map\(e=>'<option/, 'the catalogue fills it on the past side');
  assert.match(s, /_realFeats\.map\(\(f,i\)=>'<option/, 'the USGS feed fills it on the recent side');
  /* ⚠ the old pair is gone, and gone rather than merely unused: an unguarded
     `querySelector('.sq-real').onclick` throws inside render() and takes the whole panel down. */
  assert.doesNotMatch(s, /class="sq-real"/, 'the separate recent button is gone');
  assert.doesNotMatch(s, /class="sq-real-sel"/, 'and so is its separate list');
  assert.doesNotMatch(s, /querySelector\('\.sq-real'\)\.onclick/, 'nothing still binds to the removed button');
  /* the query runs once, and the list says so while it is running */
  assert.match(s, /if\(_realBusy\) return;/, 'pressing the switch repeatedly does not re-query');
  assert.match(s, /Loading the recent earthquakes…/, 'the list reports the fetch instead of looking empty');
});

test('R236 seismic: with a rupture drawn, a hypocentre outside it is refused', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /if\(fault&&fault\.ring&&fault\.ring\.length>=3&&!_inRing\(p,fault\.ring\)\)\{\s*_epiOutside=1;/,
    'the click is rejected rather than moving the nucleation point off the plane');
  assert.match(s, /function _inRing\(pt,ring\)\{/, 'and there is a containment test to reject it with');

  /* the arithmetic, run rather than described — a concave ring so the test is not just a bbox */
  const src = read('js/seismic.js');
  const body = src.slice(src.indexOf('function _inRing'));
  const fn = new Function('return ' + body.slice(0, body.indexOf('\n    }') + 6))();
  const c = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4]];   /* a C shape */
  assert.equal(fn([0.5, 2], c), true, 'inside the spine of the C');
  assert.equal(fn([3, 2], c), false, 'inside the bounding box but in the C\'s mouth');
  assert.equal(fn([2, 0.5], c), true, 'inside the lower arm');
  assert.equal(fn([5, 2], c), false, 'outside altogether');
});
}

/* ═══ from tests/r237-checks.test.mjs (tests #5, #6 of 8) ═══
    R237 — the air over the disc, the front's resolution, the panel's shape, and the shape of
    string the positional audit cannot see.
    ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
    is a comment with a runner attached. */
{
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap #R235 hit eight
   times and #R236 hit once more. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── 4 · the intensity chip is one size ─────────────────────────────────────────────────────────
   「各地の表内のJMA 7やMMI IVなどの背景の四角は、震度階級ごとに大きさをそろえるように。」 */
test('R237 seismic: every intensity chip is the same box, whatever is written in it', () => {
  const s = code(read('js/seismic.js'));
  /* ⚠ (#R241) the slice ends at `const seats=` — the row builder moved out from under `iCell` when
     the width became a per-render measurement, and letting the slice run into it would put the
     numeral badge's own `min-width:15px` inside the box this test is about. */
  const cell = s.slice(s.indexOf('const iCell='), s.indexOf('const seats=nearby()'));
  /* ══ ⚠ (#R238) THE CLAIM IS UNCHANGED; THE SPELLING MOVED, AND THAT IS THE POINT ═════════════════
     This asserted `min-width:62px` — the number #R237 read off one browser at one text size — and
     `min-width` yields to a wider label, so the column went ragged again wherever the resolved font
     or the text zoom differed and the report came back. #R238 measures the widest label either scale
     can print, at run time, and sets `width`. The ASSERTION here is the same one it always was —
     every chip is one box, and a shorter label is centred in it rather than shrinking it — written
     against the mechanism instead of against the constant, per #R203. The measurement itself is
     checked by «R238 chips» (this file). */
  /* ══ ⚠ (#R240) …AND THE SPELLING MOVED AGAIN, FOR THE SAME REASON AND WITH THE SAME CLAIM ════════
     「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」 The maximum is
     now taken over the labels of the SCALE BEING PRINTED rather than over both scales at once, so a
     震度 table is no longer padded out to the width of 「MMI VIII」. Every chip in a column is still
     exactly one box — which is what this test has always asserted — and `_chipW(jp)` is where that
     one box comes from. */
  /* ══ ⚠ (#R241) …AND ONCE MORE, STILL THE SAME CLAIM ══════════════════════════════════════════
     「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」 The maximum is now taken over the
     labels THIS RENDER prints, which cannot be known while the first row is being built — so the
     width is resolved once for the table and handed to the cell as `cw`. What this test asserts is
     unchanged: ONE width for the whole column, and it comes from the run-time measurement rather
     than from a constant. Both halves are checked, so `cw` cannot quietly become a literal. */
  assert.match(cell, /width:'\+cw\+'px/, 'the box has one width for every class of the scale in use');
  assert.match(code(read('js/seismic.js')), /const CW=_chipW\(jp,/, '…and that width is the measurement');
  assert.doesNotMatch(cell, /min-width:\d+px/, 'and it is not a min-width a longer label can push past');
  assert.match(cell, /text-align:center/, '…and a shorter label is centred in it');
  assert.match(cell, /box-sizing:border-box/, 'so the padding is inside the width, not added to it');
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
}

/* ═══ from tests/r238-checks.test.mjs (tests #10, #11, #12 of 16) ═══
    R238 — the air that was still missing, the front that could only be a circle, the panel that
    read as three alternatives, and the floating things that now have somewhere to go.
    ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
    is a comment with a runner attached. Where a check pins a RELATION rather than a value, it says
    so — #R237's chip constant is exactly what happens when a measurement of one browser is written
    into the source as if it were a fact about all of them. */
{
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap that has now been
   hit nine times across #R208…#R237. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

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
  /* (#R240) the measurement is now per SCALE — `_chipW(jp)` — because a 震度 column was being padded
     out to the width of 「MMI VIII」. The claim this test makes is unchanged: the width is measured
     at run time against the labels that can actually appear, and cached against the font. */
  /* (#R241) the cell is handed the width the whole table resolved (`cw`), because the maximum is
     now over the labels this render prints — see tests/r241 ⑤. Both ends are asserted here so the
     width cannot become a literal again by either route. */
  assert.match(s, /width:'\+cw\+'px/, 'the chip takes its width from the measurement');
  assert.match(s, /const CW=_chipW\(jp,/, 'and the table resolves it once, from _chipW');
  assert.match(s, /function\s+_chipW\s*\(jma,labels\)/, 'and the measurement exists, per scale');
  const i = s.indexOf('function _chipW');
  const body = s.slice(i, i + 1600);
  /* ⚠ DERIVED, NOT TYPED: a list of labels here would go stale the moment a class is added */
  assert.match(body, /JMA_CLASSES\.forEach/, 'the JMA labels come from the class table');
  assert.match(body, /ROMAN\[i\]/, 'and the MMI labels from the numeral table');
  assert.match(body, /_cwCache&&_cwCache\[key\]!=null/, 'the answer is cached against the font it measured');
  assert.match(body, /const\s+key=\(jma\?'jma\|':'mmi\|'\)/, '…and the cache key names which scale it is for');
});
}

/* ═══ from tests/r240-checks.test.mjs (tests #4, #5 of 9) ═══
    IntMap · R240 source-level checks
    Every assertion below is written against the MECHANISM that was wrong, not against a value this
    round happened to pick (#R203's rule). Each one fails on the tree as it stood before this round. */
{
const R = read;
/* comments out, so a claim in prose can never satisfy a check about code (#R166) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ③ THE PANEL FLOW ══════════════════════════════════════════════════════════════════════════ */
test('R240 ③ the simulator opens with nothing armed, and the verb is pinned below the scroller', () => {
  const s = code(R('js/seismic.js'));
  assert.match(s, /let clickMode='none';/, 'nothing is armed by the declaration');
  assert.match(s, /if\(!epi&&clickMode==='none'\)\{ setClickMode\('epi'\); \}/,
    '…and the one case with only one possible gesture still arms it');
  assert.match(s, /function _flowFoot\(\)/, 'the footer exists');
  assert.match(s, /function _flowStep\(\)/, 'and it reads one state machine');
  /* ⚠ ONE compute button, MOVED not copied — two would be two sources of truth */
  assert.equal((s.match(/_runBtnClass\(\)/g) || []).length, 2,
    'the run button is built in exactly one place (its class helper, and the footer that uses it)');
  assert.match(s, /class="sq-foot"/, 'the footer is a real element');
  assert.match(s, /\+_flowFoot\(\);/, 'and it is appended OUTSIDE the scrolling body');
  const body = s.indexOf('class="sq-body"');
  assert.ok(body > 0 && s.indexOf('+_flowFoot();') > body, 'after the body, not inside it');
  /* ⚠ (#R252) THE PROPERTY, NOT THE CONSTANT. What this line guards is «the panel is bounded by the
     viewport, so the pinned footer is always on screen». #R252 moved the default box clear of the coord
     readout and the sidebar handle, so the subtrahend became a computed `cut` (`_defBox()` — desktop 148,
     phone 96, and a `left` measured off the handle; see tests/r252-checks ⑧). A test that pinned the old
     literal would have forbidden that move while asserting nothing extra about the footer. */
  assert.match(s, /panel\.style\.maxHeight='calc\(100dvh - '\+d\.cut\+'px\)'/,
    'the panel is bounded by the screen so the footer fits');
  assert.match(s, /return \{ left, top:\d+, cut:\d+ \};/, '…and that bound is a real number, not a missing key');
});

test('R240 ③ the intensity chip is one width PER SCALE', () => {
  const s = code(R('js/seismic.js'));
  /* (#R241) the scale is still the first argument; the second is the set of labels this render
     actually prints, which is what took the box from «as wide as MMI VIII» to «as wide as this
     table» — 「左右に大きすぎに見えただけ」. tests/r241 ⑤ pins that half. */
  assert.match(s, /function _chipW\(jma,labels\)/, 'the measurement takes the scale');
  assert.match(s, /const CW=_chipW\(jp,/, 'and the table passes the one it is printing');
  const fn = s.slice(s.indexOf('function _chipW'), s.indexOf('function _chipW') + 1400);
  assert.match(fn, /if\(jma\)\{ try\{ JMA_CLASSES/, 'JMA measures JMA labels');
  assert.match(fn, /else \{ try\{ for\(let i=1;i<=12;i\+\+\) list\.push\('MMI '/, 'and MMI measures MMI labels');
});
}

/* ═══ from tests/r241-checks.test.mjs (tests #9, #10 of 11) ═══
    R241 — six reports, and the one that has now been sent five times
    ① 「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において
       対応が完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかる
       ことは許されない。」
    ② 「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
       → 「いや破壊速度 Vr ≤ 波速 Vだから同心円でオッケーですってどんな理屈やねんアホ」
    ③ 「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
    ④ 「MapLibreで大気にもやがかかりすぎ。地図をちゃんと見せろ。それに、ある程度までズームしたら
       いきなりもやが消えるものさらに不自然。」＋「衛生写真ではあっても、標準マップでは大気はなし」
    ⑤ 「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」
       → 「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」
    ⑥ 「地震シミュレータの地点表が左右方向にスクロールできなくなっている。」

    ⚠ Every assertion here is written against a MECHANISM, and comments are stripped before the
    source is matched (`code()`), because this file quotes the instructions it is testing —
    [[intmap-recurring-lessons]] E, eight rounds running. */
{
const R = read;
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ⑤⑥ THE TABLE ══════════════════════════════════════════════════════════════════════════════ */

test('R241 ⑤ the chip is as wide as the labels THIS table prints, and no wider', () => {
  const s = code(R('js/seismic.js'));
  assert.match(s, /function _chipW\(jma,labels\)/, 'the measurement takes the set as well as the scale');
  assert.match(s, /const set=\(labels&&labels\.length\)\?labels\.slice\(\)\.sort\(\):null;/,
    'the set decides the maximum');
  assert.match(s, /const key=\(jma\?'jma\|':'mmi\|'\)\+fs\+'\|'\+fam\+'\|'\+\(set\?set\.join\('\|'\):'\*'\);/,
    '…and the cache is keyed by it, or a second table gets the first one’s width');
  /* the width is resolved ONCE for the table, before any row is written */
  assert.match(s, /const CW=_chipW\(jp, seats\.map\(x=>iTxt\(x\.a\)\)\.filter\(Boolean\)\.map\(k=>k\.txt\)\);/,
    'one width per render, from the labels the rows will print');
  assert.match(s, /width:'\+cw\+'px/, 'and every chip is that width');
  /* the padding came down with it — 「テキストがとっている幅の割に」 */
  assert.match(s, /padding:3px 4px;/, 'the box hugs its text more closely than 6 px a side');
  /* ⚠ the fallback is still DERIVED from the class tables, so a new class needs no edit here */
  const fn = s.slice(s.indexOf('function _chipW'), s.indexOf('function _chipW') + 1400);
  assert.match(fn, /JMA_CLASSES\.forEach/, 'the JMA labels come from the class table');
  assert.match(fn, /ROMAN\[i\]/, 'and the MMI ones from the numeral table');
});

test('R241 ⑥ the places table scrolls sideways inside its own card', () => {
  const s = code(R('js/seismic.js'));
  /* ⚠ THE CARD CLIPS. `.sq-card{overflow:hidden}` (#R237) is what gives the grouped inset list its
     rounded corners, and it swallowed the overflow before `.sq-body` could scroll it — measured at
     a 260 px panel: the table wants 316 px, the box offers 224, and the whole intensity column sat
     beyond the card edge with nothing to scroll. */
  assert.match(R('js/seismic.js'), /'\.sq-card\{[^']*overflow:hidden;\}'/, 'the card still clips (it is the shape)');
  assert.match(s, /<div class="sq-tbl" style="[^"]*overflow-x:auto/, 'so the table has its own scroller');
  assert.match(s, /overscroll-behavior-x:contain/, 'and a flick in it does not drag the sheet away');
  /* auto layout takes the larger of the two: full width when the columns fit, natural width when
     they do not. `max-content` was measured first and parks the table short of a wide panel. */
  /* ⚠ (#R242) THE SCROLLER IS THE FALLBACK, NOT THE ANSWER. The report came back — 「各地の表が横
     スクロールできない」 — after this scroller shipped, and a reader looking at a table whose last
     column is sliced does not want to learn a gesture. The table is made to FIT (measured: 312 px of
     card, 312 px of table), so the width lives in `.sq-sites` and the place name is the one elastic
     column. The scroller above stays for a 260 px docked column. */
  assert.match(s, /'\.sq-sites\{border-collapse:collapse;width:100%/, 'the table is width:100%, not max-content');
  assert.match(s, /'\.sq-st-nm\{[^']*max-width:0/, 'and the place name is the only column that gives way');
  /* …and the numeric columns cannot wrap, or the overflow hides itself by breaking the reading */
  const rows = s.slice(s.indexOf('const rows=seats.map'), s.indexOf('const rows=seats.map') + 1400);
  assert.equal((rows.match(/white-space:nowrap/g) || []).length, 5,
    'every NUMERIC cell is nowrap (#R242: the place name wraps instead of being cut)');
});
}

/* ═══ from tests/r242-checks.test.mjs (tests #6, #7, #8, #9, #10, #11, #12 of 20) ═══
    IntMap · #R242 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, eight rounds running). */
{
/* strip block and line comments — a test must match CODE, never a note quoting the instruction */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ④ the quake panel: one Advanced fold, no tick track ──────────────────────────────────────── */
test('R242 ④ there is exactly one 詳細設定 and the ✓ track is gone', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/function _advHTML\(/.test(c), 'the merged Advanced fold must exist');
  assert.equal((c.match(/<details class="sq-adv-box"/g) || []).length, 1, 'one <details> for the advanced settings');
  assert.ok(!/sq-fadv-box|sq-madv-box/.test(c), 'the two old folds must be gone, not hidden');
  assert.ok(!/class="sq-track"/.test(c) && !/sq-fkdot/.test(c), 'the footer tick track was asked to be removed');
  assert.ok(/class="sq-foot"/.test(c) && /sq-fhint/.test(c), '…but the hint and the primary button stay');
});

test('R242 ④ the site table fits: one elastic column, the unit in the header', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/\.sq-st-nm\{[^']*width:100%;max-width:0/.test(c.replace(/'\s*\+\s*'/g, '')),
    'the place column is the only elastic one — that is what keeps the intensity chip on screen');
  assert.ok(!/\+' km<\/td>'/.test(c), 'Δ prints a bare number; the unit is in the column head');
});

test('R242 ④ the intensity legend paints the class number itself', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/class="sq-lgc"[^]*?background:'\+k\.col/.test(c), 'the legend chip carries the class colour as its own background');
  assert.ok(/function _onCol\(/.test(c), 'and the ink is chosen from that colour, not fixed');
});

test('R242 ④ the observed-values block is a table', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/<table class="sq-obs">/.test(c), 'what was observed is name/value rows, not a paragraph');
});

test('R242 ④ a loaded earthquake can be unloaded, and the feed clears it', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/function clearEvent\(/.test(c), 'clearEvent must exist');
  assert.ok(/if\(v===''\)\{\s*clearEvent\(\);/.test(c), 'the empty option in the list clears the selection');
  assert.ok(/class="sq-ev-x"/.test(c), 'and there is a visible ✕ while something is loaded');
  const ar = c.indexOf('function applyReal(');
  assert.ok(/evNow=null/.test(c.slice(ar, ar + 200)),
    'loading from the USGS feed must clear the curated event, or its 実測値 table stays on screen');
});

test('R242 ④ the observation cities are drawn on the map', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/kind:'city'/.test(c) && /'seis-city'/.test(c) && /'seis-city-n'/.test(c),
    'obsCities() feeds the table AND the map — a named city with nothing on the map is the report');
});

test('R242 ④ the transport is a player and the tsunami hand-off is the loud thing in the card', () => {
  const c = code(read('js/seismic.js'));
  /* ⚠ (#R245) 「再生ボタンは音楽プレーヤー風ではなく…」 — the three-button transport cluster is gone and
     the rate rides the panel's own `.sq-segwrap`, so the classes moved. What this line has always
     been about survives and is what is checked: ONE play/pause with a real glyph, a real scrubber,
     and a segmented rate rather than a dropdown. */
  assert.ok(/class="sq-player/.test(c) && /SVG_PLAY/.test(c) && /sq-seg sq-spdc/.test(c),
    'one play/pause, a real scrubber and a segmented rate');
  assert.ok(!/class="sq-play sq-btn"/.test(c), 'the old 36 px text button must be gone');
  /* ⚠ (#R244) 「Open the tsunami simulatorにはマークを使うな。」 — the glyph in its translucent disc is
     gone (tests/r244 ④ pins that it stays gone). What THIS line has always been about survives: the
     button is still the only FILLED element in the result card, which is the 「もっと目立たせろ」 of
     #R242, and it now says what it does in words alone. */
  assert.ok(/class="sq-tsu"/.test(c) && /linear-gradient\(135deg,#0a84ff/.test(c),
    'the tsunami button is the only filled element in the result card');
  assert.ok(!/sq-tsu-ic/.test(c), 'and it carries no mark');
});
}

/* ═══ from tests/r243-checks.test.mjs (tests #7, #8, #9, #10 of 17) ═══
    IntMap · #R243 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, nine rounds running). */
{
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ⑤ the earthquake panel ───────────────────────────────────────────────────────────────────── */
test('R243 ⑤ a loaded earthquake hides the source and parameter cards, keeping the intensity scale', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/\+\(evNow\?''\:\(''/.test(c),
    'cards 2 and 3 must be wrapped in `evNow ? "" : (…)` — a published earthquake is not a form');
  const scaleCard = c.indexOf("+(evNow?('<div><div class=\"sq-cap\">'");
  assert.ok(scaleCard > 0, 'the intensity-scale card must be drawn when an event IS loaded (the one exception the reader named)');
  assert.ok(/sq-scale sq-sel/.test(c.slice(scaleCard, scaleCard + 700)), 'and it must be the same `.sq-scale` control, not a copy');
});

test('R243 ⑤ the result card no longer restates the source or the solver telemetry', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(!/f<sub>c<\/sub>/.test(c) && !/fld\.stats\.ms\+' ms'/.test(c),
    'the M / depth / M₀ / f_c line and the z-level / cell-count / milliseconds line are both out');
  assert.ok(/The parameters changed — press ▶ to recompute/.test(c),
    'the one INSTRUCTION in that block stays — the reader has to act on it');
});

test('R243 ⑤ the progress bar appears under the button that starts it', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/function _progHTML\(/.test(c), 'one builder for the bar');
  /* ⚠ (#R244) 「計算進捗ボタンが二つあるから下部のものだけにしろ。」 — two bars moving for one solve is
     what the reader saw, and the one that answers 「押したものは動いているか」 is the one under the
     pinned button. The card-4 copy is deleted, so this is declared once and used once. What the
     round-243 report was actually about — the bar being where the button is — is unchanged and is
     the line below it. */
  assert.equal((c.match(/_progHTML\(/g) || []).length, 2, 'declared once, used once — in the pinned footer');
  assert.ok(/panel\.querySelectorAll\('\.sq-prog'\)/.test(c),
    '_setProg must write EVERY .sq-prog — two readouts of one state cannot be allowed to disagree');
  assert.ok(!/Done — press ▶ above to watch the waves/.test(c), '「完了しました」 line is gone');
});

test('R243 ⑤ the transport is a labelled cluster and the tsunami button carries no emoji', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/sq-pl-cap/.test(c) && /sq-pl-jump/.test(c), 'the caption and the two jump buttons');
  assert.ok(/tl\.dispatchEvent\(new Event\('input'/.test(c), 'the jumps must go through the scrubber, not move time themselves');
  const tsu = c.slice(c.indexOf('sq-tsu-ic'), c.indexOf('sq-tsu-ic') + 600);
  assert.ok(!/🌊/.test(tsu), '「Open the tsunami simulatorには絵文字を使うな」');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #1, #2, #3, #4, #14 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ① THE SEISMIC PANEL DRAWS DIFFERENT CARDS IN DIFFERENT STATES, SO NO WIRING MAY ASSUME ONE ═══
   #R243 stopped rendering cards ② and ③ for a loaded earthquake and left `panel.querySelector('.sq-fdraw').onclick = …`
   in the wiring block. With one loaded that threw `Cannot set properties of null`, which aborted the
   rest of the wiring (measured: `.sq-play`, `.sq-t`, `.sq-scale`, `.sq-op` had NO handler) AND threw
   out of `applyEvent()` before it could fetch the published finite-fault outline — so the map kept
   the offline rectangle. That is 「過去の地震の震源域などの精度が落ちている」. It is the second time
   this exact shape has shipped (#R236, `.sq-real`), so the check is on the SHAPE. */
test('r244 ① no unguarded querySelector assignment in js/seismic.js', () => {
  const src = read('js/seismic.js');
  const ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true });
  const bad = [];
  walk.simple(ast, {
    AssignmentExpression(n) {
      const l = n.left;
      if (l.type !== 'MemberExpression' || l.computed) return;
      const o = l.object;
      if (!(o.type === 'CallExpression' && o.callee.type === 'MemberExpression'
        && !o.callee.computed && o.callee.property.name === 'querySelector')) return;
      bad.push(`${n.loc.start.line}: ${src.slice(n.start, n.start + 70).split('\n')[0]}`);
    },
  });
  assert.deepEqual(bad, [], 'a control this panel only renders in SOME states must be looked up into a variable and guarded');
});

/* ② …and the same for reading a property off one. `panel.querySelector('.sq-tv').textContent = …`
   inside the playback loop is the same crash one frame later. */
test('r244 ② the seismic transport tolerates a panel without the transport', () => {
  const src = code('js/seismic.js');
  assert.ok(!/querySelector\('\.sq-tv'\)\.textContent\s*=/.test(src), '.sq-tv must be guarded');
  assert.ok(/const tl=panel\.querySelector\('\.sq-t'\); if\(tl\)/.test(src), '.sq-t must be guarded');
});

/* ══ ③ ONE PROGRESS READOUT ═══════════════════════════════════════════════════════════════════════
   「計算進捗ボタンが二つあるから下部のものだけにしろ。」 #R243 built a second `.sq-prog` in card 4
   AND kept the one in the pinned footer. `_progHTML` is called exactly once now, from `_flowFoot`. */
test('r244 ③ the seismic panel builds exactly one progress bar, in the footer', () => {
  const src = code('js/seismic.js');
  const calls = src.match(/_progHTML\(/g) || [];
  assert.equal(calls.length, 2, 'one declaration + one call site');   /* the `function _progHTML(` + one use */
  assert.ok(/sq-foot-prog[^]{0,80}_progHTML\('sq-prog-foot'\)/.test(src), 'the one call is the footer’s');
});

/* ④ 「Open the tsunami simulatorにはマークを使うな。」 */
test('r244 ④ the tsunami button carries no glyph', () => {
  const src = code('js/seismic.js');
  assert.ok(!/sq-tsu-ic/.test(src), 'the icon disc and its class are gone');
});

/* ⑭ 「詳細設定」の左の▲・▶が微妙にUIに隠れている — the fold carries the card's own inset now. */
test('r244 ⑭ the 詳細設定 fold is inset like every other row in its card', () => {
  const src = code('js/seismic.js');
  assert.ok(/'\.sq-adv-box\{padding:0 11px 7px;/.test(src), 'the fold is inset by the row padding');
  assert.ok(/'\.sq-adv-box \.sq-row\{padding-left:0;padding-right:0;\}'/.test(src), '…and its rows do not indent twice');
});
}

/* ═══ from tests/r245-checks.test.mjs (tests #1, #2, #3 of 10) ═══
    IntMap · #R245 — source-level checks
    Seven instructions. Each test below is written against the ROOT CAUSE that was measured, not
    against the symptom, so it fails on the shipped code that produced the report.

    ⚠ Every test strips comments before matching (`code()`), because this file's own subject matter
    quotes the strings it forbids — [[intmap-recurring-lessons]] E, eight rounds running. */
{
/* comments out, string literals kept — the same helper every round since #R208 */
const code = (p) => {
  const src = read(p);
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = (e < 0 ? src.length : e + 2); continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = (e < 0 ? src.length : e); continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
};

/* ── ① the pinned footer is PINNED: it is a sibling of .sq-body, not a child ────────────────────
   「ポップアップ時に震度分布を計算が下部スティックになっていない。」 Card 1 opened three boxes and
   closed two, so the parser nested cards 2…6 inside card 1 and `_flowFoot()` landed INSIDE the
   scroller. Measured on the shipped build: panel 80…706, `.sq-foot` 1510…1580.
   ⚠ This counts the tags rather than matching a literal, so any future card that forgets a closer
   fails here too — the defect was an imbalance, so the test is about balance. */
test('r245 ① the seismic panel closes every box it opens, so the footer stays out of the scroller', () => {
  const src = code('js/seismic.js');
  const i = src.indexOf("panel.innerHTML='<div class=\"sq-head\"");
  assert.ok(i > 0, 'render() builds the panel here');
  const j = src.indexOf('+_flowFoot();', i);
  assert.ok(j > i, 'and finishes with the pinned footer');
  const body = src.slice(i, j);
  /* only the literal markup in this template — every `<div` and `</div>` inside a quoted string */
  const opens = (body.match(/<div\b/g) || []).length;
  const closes = (body.match(/<\/div>/g) || []).length;
  assert.equal(opens, closes,
    `the panel markup opens ${opens} <div> and closes ${closes} — an imbalance nests the footer inside .sq-body`);
});

/* ── ② the transport is not a media player ───────────────────────────────────────────────────────
   「再生ボタンは音楽プレーヤー風ではなく、もっとシンプルな洗練されたUIにしろ。」 Three rounds restyled
   the same ⏮ ▶ ⏭ cluster; what goes is the ARRANGEMENT. Every class and handler stays. */
test('r245 ② the seismic transport keeps its mechanism and loses the media-player idiom', () => {
  const src = code('js/seismic.js');
  for (const cls of ['sq-play', 'sq-t', 'sq-tv', 'sq-pl-jump', 'sq-spdc', 'sq-spd'])
    assert.ok(src.includes(cls), `${cls} is still there — this is a re-dress, not a second mechanism`);
  assert.ok(!/sq-pl-top/.test(src), 'the centred ⏮ ▶ ⏭ cluster is gone');
  assert.ok(!/SVG_START|SVG_END/.test(src.slice(src.indexOf('sq-player'))),
    'the two jumps are words, not transport glyphs');
  assert.ok(/'\.sq-play\{[^']*width:32px/.test(src), 'a 32 px control, not a 46 px accent disc');
  assert.ok(/sq-segwrap sq-pl-chips/.test(src), "the rate rides the panel's own segmented control");
});

/* ── ③ the notice was reworded, and the inline tables were re-keyed with it ─────────────────────
   ⚠ #R235's rule: the English string IS the key fr/ko/zh/zh-Hans are stored under, so a reworded
   sentence silently drops four languages unless they move in the same change. */
test('r245 ③ the reworded safety notice reaches every language', () => {
  const EN = 'An educational model. In a real emergency, follow the instructions of the official authorities. It does not predict whether damage will occur. Keep your everyday preparations ready.';
  assert.ok(read('js/seismic.js').includes(EN), 'the seismic panel carries the new wording');
  for (const c of ['fr', 'ko', 'zh', 'zh-hans']) {
    const s = read(`js/locales/ui.${c}.js`);
    assert.ok(s.includes(JSON.stringify(EN)) || s.includes(EN),
      `ui.${c}.js is keyed by the new sentence`);
  }
});
}

/* ═══ from tests/r264-checks.test.mjs (tests #6 of 7) ═══
    #R264 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ⑥ a chosen earthquake brings its own hypocentre ────────────────────────────────────────────
   「過去・最近の地震から選んだ場合、Place the hypocenterピルは表示しないように。」 `open()` arms the map
   when there is no epicentre; loading an event is the OTHER way of doing that one thing, and neither
   loader disarmed — so the pill went on asking for a hypocentre the catalogue had already published,
   and the next tap on the map moved it. Disarmed in the loaders, because the HUD is a readout. */
test('R264 ⑥: loading a past or recent earthquake disarms the map', () => {
  const s = read('js/seismic.js');
  const applyEvent = s.slice(s.indexOf('function applyEvent(id)'), s.indexOf('function evObsHtml'));
  assert.match(applyEvent, /if\(clickMode==='epi'\) clickMode='none';/,
    'the catalogue loader disarms');
  const applyReal = s.slice(s.indexOf('function applyReal(f)'), s.indexOf('function _defBox'));
  assert.match(applyReal, /if\(clickMode==='epi'\) clickMode='none';/,
    'and so does the USGS-feed loader');
  assert.match(applyReal, /try\{ _hud\(\); \}catch\(_\)\{\}/,
    'refresh() does not render(), so applyReal asks the HUD directly — as close() already does');
  /* the HUD stays a readout of clickMode: no second opinion about what is armed */
  assert.match(s, /const on=opened&&\(_fDrawing\|\|clickMode==='epi'\|\|clickMode==='station'\);/,
    'the pill still reads clickMode and nothing else');
  /* …and unloading puts it back (#R242's inverse rule) */
  const clearEvent = s.slice(s.indexOf('function clearEvent()'), s.indexOf('function applyEvent(id)'));
  assert.match(clearEvent, /setClickMode\('epi'\)/, 'unloading re-arms');
});
}
