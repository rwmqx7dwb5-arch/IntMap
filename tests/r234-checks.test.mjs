/* ============================================================================
 *  R234 — the contracts this round established, checked against the source.
 *
 *  ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
 *  (#R228's rule: a check that stays green when you undo the fix is not a check).
 *  Where the claim is arithmetic rather than text, it is COMPUTED here rather
 *  than pinned to a number this round happened to produce (#R203/#R229).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── 1 · the runtime is ONE frame, ONE camera subscription, ONE timer ───────────────────────── */
test('R234 runtime: one camera subscription drives every follower, reads before writes', () => {
  const s = read('js/runtime.js');
  /* the single subscription — the whole point is that it is made once, here */
  assert.match(s, /\['move', 'zoom', 'rotate', 'pitch', 'resize'\]\.forEach/,
    'the runtime subscribes to the camera exactly once, for everybody');
  /* reads all run before writes, so one follower's style write cannot invalidate the next's measure */
  assert.match(s, /_run\(READ, false\);\s*\n\s*_run\(WRITE, false\);/,
    'the frame runs the READ phase before the WRITE phase');
  /* one task throwing must not cost the others their frame */
  assert.match(s, /try \{ e\.fn\(\); \} catch \(err\) \{ _oops\(k, err\); \}/,
    'a throwing task is reported and the frame continues');
  /* the timer wheel is one timeout, and a hidden document does not tick */
  assert.match(s, /const now = Date\.now\(\), hidden = _hidden\(\);/, 'the wheel knows whether the document is hidden');
  assert.match(s, /if \(hidden && !t\.hidden\) \{ t\.next = now \+ t\.ms; /,
    'a hidden document defers the entry instead of running it');
  /* the lifecycle the instruction asks for, all four verbs */
  for (const verb of ['load', 'activate', 'suspend', 'dispose']) {
    assert.ok(new RegExp('function ' + verb + '\\(').test(s), 'the capability lifecycle has ' + verb + '()');
  }
  /* suspend must raise the flag BEFORE running the capability's own suspend */
  assert.match(s, /SUSPENDED\.add\(name\);\s*\n\s*if \(c\.state === 'active'\)/,
    'suspend() marks the capability before calling into it');
});

test('R234 runtime: the eight private per-camera rAFs are gone from the followers', () => {
  /* Each of these files coalesced its own camera work with its own requestAnimationFrame. The
     claim is not "they got faster" — it is that they now share ONE frame. */
  const wired = {
    'js/app-body.js': /RT\(\)\.onCamera\('shell\.crosshair'/,
    'js/view-controls.js': /R\.onCamera\('viewctl\.altitude'/,
    'js/tool-panel.js': /R\.onCamera\('toolpanel\.ctxmenu'/,
    'js/map-tools.js': /R\.onCamera\('arc3d\.draw'/,
    'js/search-geocode.js': /R\.frame\('search\.card'/,
    'js/tile-warm.js': /R\.onCamera\('tilewarm\.prefetch'/,
    'js/theme-sky.js': /R\.onCamera\('themesky\.follow'/,
  };
  for (const [f, re] of Object.entries(wired)) assert.match(read(f), re, f + ' goes through the runtime');
  /* ⚠ the arc layer subscribed to move AND zoom AND rotate AND pitch with no coalescing at all —
     up to four full redraws inside one frame of a pinch-rotate. That shape must not come back. */
  const mt = read('js/map-tools.js');
  assert.doesNotMatch(mt, /GE\(\)\.events\.on\('move',rd\); GE\(\)\.events\.on\('zoom',rd\); GE\(\)\.events\.on\('rotate',rd\); GE\(\)\.events\.on\('pitch',rd\); window\.addEventListener/,
    'the four uncoalesced arc subscriptions are not the primary path any more');
  /* the runtime is built before anything can register with it */
  const ab = read('js/app-body.js');
  assert.ok(ab.indexOf('makeRuntime(IM_HOST);') > 0, 'the runtime is instantiated in the shell');
  assert.ok(ab.indexOf('makeRuntime(IM_HOST);') < ab.indexOf("RT().onCamera('shell.crosshair'"),
    '…and it is built before the first registration');
});

/* ── 2 · ⚠⚠ the directivity term no longer creates energy ───────────────────────────────────── */
test('R234 seismic: directivity is a DURATION, and the radiated energy is azimuth-invariant', () => {
  const s = read('js/seismic.js');
  /* the defect: Fd divided into the corner frequencies, which slides the whole spectrum */
  assert.doesNotMatch(s, /const fc=fc0\/f;/, 'the source corner is no longer shifted by Fd');
  assert.doesNotMatch(s, /const fa=Math\.pow\(10,2\.181-0\.496\*mw\)\/f/, 'nor are the two-corner frequencies');
  assert.match(s, /const fc=fc0;/, 'the corner frequency is the source\'s own');
  /* …and Fd survives in the ONE place it belongs: the apparent duration RVT divides by */
  assert.match(s, /durS:f\/fc0/, 'Fd carries the apparent source duration instead');

  /* THE ARITHMETIC, not the text: with the spectrum azimuth-independent, ∫A²df must be identical
     at every azimuth, and the peak must scale as ≈1/√Fd. Both are computed here from the same
     shape the file uses, so this test states the physics rather than quoting this round's numbers. */
  const spec = (fd, f) => {
    const mw = 7.8, M0 = Math.pow(10, 1.5 * mw + 9.1);
    const fa = Math.pow(10, 2.181 - 0.496 * mw), fb = Math.pow(10, 2.41 - 0.408 * mw);
    const eps = Math.min(1, Math.pow(10, 0.605 - 0.255 * mw));
    return M0 * ((1 - eps) / (1 + (f / fa) ** 2) + eps / (1 + (f / fb) ** 2));
  };
  const energy = (fd) => { let m = 0; for (let i = 0; i <= 400; i++) {
    const f = Math.exp(Math.log(0.02) + i * (Math.log(40) - Math.log(0.02)) / 400);
    const A = (2 * Math.PI * f) ** 2 * spec(fd, f); m += A * A * f; } return m; };
  assert.equal(energy(0.3).toFixed(6), energy(1).toFixed(6),
    'the radiated energy is the same toward every azimuth — the #R232 form multiplied it by ~100');

  /* the header has to say what was wrong, because the OLD header argued the opposite and was cited
     as the reason the model was sound (「redistributes energy instead of creating it」) */
  assert.match(s, /the RADIATED ENERGY, ∫A²df, was multiplied by a\s*\n\s*HUNDRED\./,
    'the file records what the measurement showed');
  /* Fd = 1 must still be the old model exactly: durS is 1/fc0 there, as 1/fc used to be */
  assert.match(s, /`durS` is 1\/fc0 at Fd = 1/, 'the no-rupture case is stated to be unchanged');
});

test('R234 seismic: rupAxis is memoised, or the densified rings would cost 147M distances', () => {
  const s = read('js/seismic.js');
  assert.match(s, /if\(_axCache&&_axCache\.ring===fault\.ring&&_axCache\.epi===epi\) return _axCache\.ax;/,
    'the O(n²) axis search runs once per (ring, epicentre), not once per cell');
  assert.match(s, /function _rupAxisCompute\(\)\{/, 'the search itself is a separate function');
});

/* ── 3 · the published rupture is a geodesic outline, not four flat corners ─────────────────── */
test('R234 rupture rings: great-circle vertices, sampled in proportion to the fault', async () => {
  const m = await import('../js/seismic-events.js');
  const D = Math.PI / 180, RE = 6371.0088;
  const gc = (a, b) => { const dl = (b[0] - a[0]) * D, la1 = a[1] * D, la2 = b[1] * D;
    return RE * Math.acos(Math.max(-1, Math.min(1, Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dl)))); };

  const byId = Object.fromEntries(m.QUAKE_EVENTS.map((e) => [e.id, e]));
  /* a 1,300 km rupture cannot be drawn with four points; a 50 km one does not need more */
  assert.ok(m.ruptureRing(byId.sumatra2004).length >= 40, 'Sumatra–Andaman is densified');
  assert.equal(m.ruptureRing(byId.haiti2010).length, 4, 'Haiti is still a quadrilateral');

  /* every ring still measures the PUBLISHED dimensions — this moves the shape, it does not resize it */
  for (const ev of m.QUAKE_EVENTS) {
    const r = m.ruptureRing(ev);
    let longest = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) longest = Math.max(longest, gc(r[i], r[j]));
    const diag = Math.hypot(ev.lenKm, ev.widKm * Math.cos(ev.dip * D));
    assert.ok(Math.abs(longest / diag - 1) < 0.02,
      ev.id + ': the drawn diagonal is the published one (' + longest.toFixed(0) + ' vs ' + diag.toFixed(0) + ' km)');
    for (const p of r) {
      assert.ok(p[0] >= -180 && p[0] <= 180, ev.id + ': longitude is normalised');
      assert.ok(p[1] >= -90 && p[1] <= 90, ev.id + ': latitude is on the Earth');
    }
  }
  /* the flat local-equirectangular patch is gone */
  const src = read('js/seismic-events.js');
  assert.doesNotMatch(src, /const kmPerLng = 111\.32 \* cosLat/, 'no flat km grid stretched over 1,300 km');
  assert.match(src, /Math\.asin\(Math\.max\(-1, Math\.min\(1, sla\)\)\)/, 'the spherical direct formula is used');
});

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
  /* all three modes speak through it — drawing, epicentre, observation point */
  assert.match(s, /_fDrawing\s*\n\s*\? BANNER\(/, 'the drawing mode gets the instruction the item asks for');
  assert.match(s, /地図上で震源域を囲ってください。/, '…and it says what to do');
  assert.match(s, /クリックで開始し、続けてクリックして囲み、最初の点をもう一度クリックすると終了です。/,
    '…including how the stroke starts and ends');
  /* (#R236) a comment sits between the test and the banner now (the epicentre mode says a different
     thing once a rupture is drawn), so the claim is «this mode reaches BANNER», not the line break. */
  assert.match(s, /: clickMode==='epi'\s*\n(?:\s*\/\*[\s\S]*?\*\/\s*\n)?\s*\? BANNER\(/, 'the epicentre mode gets one too');
  assert.match(s, /: clickMode==='station'\s*\n\s*\? BANNER\(/, 'and so does the observation-point mode');
  /* one predicate decides BOTH the colour and the wording */
  assert.match(s, /function _needsRun\(\)\{ return !fld\|\|fldStale; \}/, 'one predicate for "there is something to compute"');
  assert.match(s, /function _runBtnStyle\(\)\{[^}]*_needsRun\(\)\?'background:var\(--primary-color\)/s,
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
    assert.equal(s.split('class="' + cls + '"').length - 1, 1, cls + ' exists exactly once');
  }
  assert.match(s, /_madvOpen=d\.open/, 'and it stays open across a re-render');
});

test('R234 seismic panel: one type scale, and grey only on the window chrome', () => {
  const s = read('js/seismic.js');
  for (const px of ['9.5px', '10px', '10.5px', '11px', '11.5px']) {
    assert.ok(!s.includes('font-size:' + px), 'font-size:' + px + ' is gone — see FS / FS_S / FS_H');
  }
  /* --text-muted survives ONLY where grey is the meaning: the ✕ / — chrome and 「無感」 */
  const muted = s.split('color:var(--text-muted)').length - 1;
  assert.equal(muted, 2, 'grey is left on the two window-chrome glyphs and nowhere else');
  const t = read('js/tsunami.js');
  for (const px of ['9.5px', '10px', '10.5px', '11px', '11.5px']) {
    assert.ok(!t.includes('font-size:' + px), 'the tsunami panel shares the scale (' + px + ')');
  }
  assert.equal(t.split('color:var(--text-muted)').length - 1, 2, 'and the same rule about grey');
});

/* ── 5 · the wave names follow the view ─────────────────────────────────────────────────────── */
test('R234 seismic: the front labels are placed toward the map centre, not at a fixed 45°', () => {
  const s = read('js/seismic.js');
  assert.doesNotMatch(s, /const p=destAng\(epi,45,/, 'the fixed bearing is gone');
  /* ⚠ (#R235) the CONTRACT, not the expression. The bearing is now hoisted into `vb` so the RADIUS
     can be read at the same bearing the label is placed at — with a laterally varying surface-wave
     path those became two different numbers, and a name taken from bearing 0 floats off its ring.
     What this line protects is unchanged: the placement follows the map centre. */
  assert.match(s, /const vb=_viewBearing\(\); const r=rad\(vb\);/, 'the label reads the radius at the bearing it will sit on');
  assert.match(s, /const p=destAng\(epi,vb,/, 'the label sits on the arc that is in view');
  assert.match(s, /function _viewBearing\(\)\{[^}]*const b=bearingTo\(epi,\[c\.lng,c\.lat\]\);/s,
    '…which is the bearing from the epicentre to the camera centre');
  assert.match(s, /GE\(\)\.events\.on\('moveend',\(\)=>\{ try\{ if\(opened&&epi\) drawFronts\(\); \}catch\(_\)\{\} \}\);/,
    'and it follows a pan — on moveend, never per frame');
});

/* ── 6 · the atmosphere hands over while the camera is still moving ─────────────────────────── */
test('R234 atmosphere: the limb handover is asked every frame, not only at the settle', () => {
  const s = read('js/theme-sky.js');
  assert.match(s, /function _wireSkyFollow\(\)\{/, 'the follow is wired to the camera');
  assert.match(s, /R\.onCamera\('themesky\.follow',_skyFollowCamera,\{phase:'read'\}\)/,
    'through the runtime, in the read phase');
  assert.match(s, /_wireSkyFollow\(\);\s+\/\* \(#R234\)/, 'and it is armed when the sky is applied');
  /* ⚠ the ramps are a MEASURED decision from #R187 / #R205 and this round did not touch them */
  assert.match(s, /\['interpolate',\['linear'\],\['zoom'\],0,0\.55,4,0\.48,7,0\.32,10,0\.14,13,0\.035,15,0\]/,
    'the satellite ramp is unchanged');
  assert.match(s, /\['interpolate',\['linear'\],\['zoom'\],0,0\.80,4,0\.70,7,0\.46,10,0\.20,13,0\.05,15,0\]/,
    'the dark map ramp is unchanged');
});

/* ── 7 · the hillshade's depth has one home, and the phone keeps its 13 ─────────────────────── */
test('R234 hillshade: one rule for DEM depth, raised only where something capped itself lower', () => {
  /* ⚠ the rule left the core — three files stream this bucket, so it is a module, not a closure
     variable inside the shell (and js/app-body.js has a hard line ceiling: tests/r200 ⑤). */
  const dem = read('js/dem-source.js');
  assert.match(dem, /function maxZoom\(\) \{ return isPhoneGPU\(\) \? 13 : 15; \}/, 'one place decides the DEM depth');
  assert.match(dem, /window\.IntMapDem = API; window\.__imDemMaxZoom = maxZoom;/, 'and it is published for the other callers');
  assert.equal(dem.match(/terrarium\/\{z\}\/\{x\}\/\{y\}\.png/g).length, 5, 'the five host aliases came with it (#R7)');
  const ab = read('js/app-body.js');
  assert.match(ab, /^import \{ makeDemSource \} from '\.\/dem-source\.js';$/m, 'the shell imports it');
  assert.match(ab, /addSource\('terrain-dem',_IM_DEM\.spec\(\)\)/, 'the main map reads it');
  assert.ok(!/'https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium/.test(ab),
    'and the shell no longer carries a second copy of the host list');
  /* the two that had capped themselves below the main map */
  assert.match(read('js/compare.js'), /maxzoom:\(window\.__imDemMaxZoom\?window\.__imDemMaxZoom\(\):13\)/,
    'the comparison map asks instead of pinning 13');
  assert.match(read('js/cesium-engine.js'), /maxzoom:Math\.min\(15,this\._dem\.maxzoom\(\)\)/,
    'the Cesium hillshade is no longer clamped a level below the DEM it is given');
  /* ⚠ the phone is UNCHANGED — this round's first instruction is that it must get faster */
  assert.ok(!/_imPhoneGPU\(\)\?1[45]:/.test(ab), 'no phone-side DEM depth was raised');
});
