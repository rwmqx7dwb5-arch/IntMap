/* ============================================================================
 *  IntMap · R240 source-level checks
 * ----------------------------------------------------------------------------
 *  Every assertion below is written against the MECHANISM that was wrong, not against a value this
 *  round happened to pick (#R203's rule). Each one fails on the tree as it stood before this round.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* comments out, so a claim in prose can never satisfy a check about code (#R166) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ① THE ATMOSPHERE — «off» must not mean «no sun» ═══════════════════════════════════════════
   maplibre's globe atmosphere takes u_sun_pos from style.light and from nowhere else, so handing
   the light back to maplibre's default («anchor:viewport, position:[1.15,210,30]») switches the air
   off with the terminator. Measured, same camera, only the light changed:
       Congo    71,112,77  →  35,62,13
       Atlantic 44,105,134 →   2,51,72
   and on the vector basemap `_nightSideOff()` is ALWAYS true, so that globe never had air at all. */
test('R240 ① with the day/night side off the Sun is aimed at the camera, never un-aimed', () => {
  const t = R('js/theme-sky.js');
  const aim = t.slice(t.indexOf('function _aimSun()'), t.indexOf('function _aimSun()') + 900);
  assert.ok(aim, '_aimSun was not found');
  assert.match(aim, /_nightSideOff\(\)/, 'the switch is still what decides (#R214/#R215)');
  assert.doesNotMatch(code(aim), /setSunDirection\(null\)/,
    'null is maplibre’s own light, in the wrong frame — it takes the atmosphere with it');
  assert.match(code(aim), /camera\.getCenter\(\)/, 'off aims at the sub-camera point');
  assert.match(code(aim), /setSunDirection\(\{lng:c\.lng,lat:c\.lat\}\)/, 'so no terminator is on screen');
  /* …and a pan must re-aim it, or the terminator walks back into view */
  /* (#R241) the slice is longer because the follow gained the limb's zoom re-push above this block
     — the assertion is the same one. */
  const foll = t.slice(t.indexOf('function _skyFollowCamera()'), t.indexOf('function _skyFollowCamera()') + 4200);
  assert.match(code(foll), /_nightSideOff\(\)/, 'the follow knows about the un-aimed case');
  assert.match(code(foll), /_aimSun\._at/, 'and re-aims when the centre has moved');
});

/* ══ ⚠⚠⚠ (#R241) THE BLEND-RAMP TEST THAT STOOD HERE WAS OVERTURNED BY THE READER ════════════════
   It pinned #R240's answer to 「ある程度までズームインすると途端に見えなくなってしまう」: hold the
   ramp FLAT to z11 and keep 0.55 satellite / 0.80 dark map / 0.15 light map. The next round's report
   was the same complaint, sharper — 「ある程度までズームしたらいきなりもやが消えるものさらに不自然」
   — with 「大気にもやがかかりすぎ。地図をちゃんと見せろ」 and 「衛生写真ではあっても、標準マップでは
   大気はなし」 beside it. Measured with real screenshots (x/r241-atm-sat-z11.png vs -z12.png): the
   z11 frame is milk over the Sahara and z12 is raw imagery, ONE zoom apart, because maplibre 5.24's
   `case 'globe'` interpolates vertical-perspective→mercator across z11→z12 and multiplies
   `atmosphere-blend` by that transition. Holding the ramp up made the step BIGGER, not smaller.
   ⚠ THE ASSERTIONS ARE NOT DELETED, THEY MOVED AND REVERSED — tests/r241-checks ④ pins the new
   contract (map basemap: no air at all, both owners; satellite: one curve, zero BY z11). A test
   whose subject a reader has overruled has to say so where it used to stand, or the next round
   reads its absence as an oversight. */

/* ══ ② THE WAVEFRONTS — a drawn rupture reaches the picture from t = 0 ═════════════════════════
   Measured on the shipped build with a 500 km rupture: band and ringBack were 0 until t = 400 s,
   because T_last does not exist anywhere until the last piece of the fault has broken. */
test('R240 ② while the fault is still tearing, the band is bounded by the broken fault', () => {
  const s = code(R('js/seismic.js'));
  assert.match(s, /let brokeRing=null;/, 'the broken outline is kept for the band as well as the fill');
  assert.match(s, /brokeRing=brokePts\.concat\(\[brokePts\[0\]\]\);/, '…in continuous longitudes');
  const train = s.slice(s.indexOf('const train=(rad,col,w)=>'), s.indexOf('const train=(rad,col,w)=>') + 1400);
  assert.match(train, /const back=faultRing\(rad,'back'\)/, 'the trailing edge is still tried first');
  assert.match(train, /else if\(brokeRing&&brokeRing\.length>3\)/, 'and the source bounds it when there is none yet');
  assert.match(train, /coordinates:\[front\.ring,brokeRing\.slice\(\)\.reverse\(\)\]/, 'the hole is the broken fault');
});

test('R240 ② the front carries the rupture’s directivity, and only when there is a rupture', () => {
  const s = code(R('js/seismic.js'));
  assert.match(s, /function emitFrontArcs\(feats,r,col,w\)/, 'the front is emitted arc by arc');
  const fn = s.slice(s.indexOf('function emitFrontArcs'), s.indexOf('function emitFrontArcs') + 1400);
  assert.match(fn, /fdAt\(/, 'each arc asks the SAME directivity the field is painted from');
  assert.match(fn, /1\/Math\.sqrt\(/, 'peak goes as 1/√Fd (Ben-Menahem’s apparent duration)');
  assert.match(fn, /kind:'ring'/, 'they are still ring features');
  const train = s.slice(s.indexOf('const train=(rad,col,w)=>'), s.indexOf('const train=(rad,col,w)=>') + 1600);
  assert.match(train, /if\(!\(hasRupture&&emitFrontArcs\(feats,front,col,w\)\)\) emit\(front\.windows/,
    'with no rupture drawn the ring is one feature, exactly as before');
  assert.match(s, /'line-opacity':\['coalesce',\['get','o'\],0\.92\]/, 'a whole ring keeps the old constant');
});

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

/* ══ ④ THE DOCK ════════════════════════════════════════════════════════════════════════════════ */
test('R240 ④ a docked panel expands, arrives open, and runs edge to edge on a phone', () => {
  const css = R('css/intmap.css');
  assert.match(css, /\.im-docked \[class\$="-scroll"\]/, 'every inner scroller, not two named ones');
  assert.match(css, /\.im-docked \[class\$="-body"\]/);
  assert.match(css, /#docked-feed\{ margin-left:-16px; margin-right:-16px;/, 'the feed cancels the sheet padding');
  /* ⚠ (#R241) THE RAIL IS BACK, AND IT IS THE HALF OF THIS TEST THE READER OVERRULED.
     「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
     Cancelling the sheet's 16 px inset (the line above) is what stopped the rail being drawn over a
     legend; deleting the rail as well was a second change with no report behind it. What this test
     keeps asserting is the part that was asked for — the feed runs edge to edge — and tests/r241 ③
     pins the rail's return. */
  assert.match(css, /#docked-feed::-webkit-scrollbar\{ width:10px/, 'and the column still has a rail');
  assert.match(css, /--sheet-h:86dvh/, 'the sheet is shorter, and its height has one owner');
  assert.match(css, /height:var\(--sheet-h\)/);
  assert.match(css, /translateY\(var\(--sheet-ty,calc\(var\(--sheet-h\) - 196px\)\)\)/, 'the default detent follows it');

  const dl = code(R('js/data-layers.js'));
  assert.match(dl, /const inDock=\(window\.imDockPanels==='on'\)/, 'the phone auto-collapse knows about the dock');
  assert.match(dl, /window\._legendExpand=function\(el\)/, 'and the dock can open one');
  assert.match(dl, /!el\.classList\.contains\('im-docked'\) && !el\.classList\.contains\('legend-collapsed'\)/,
    'tapping the map does not collapse the sidebar column');
  assert.match(R('js/data-layers.js'), /\.koppen-legend:not\(\.im-docked\)\{ width:min\(66vw,252px\)/,
    'the run-time phone width applies over the map only');
  const wm = code(R('js/window-manager.js'));
  assert.match(wm, /window\._legendExpand&&window\._legendExpand\(el\)/, 'docking opens a collapsed legend');
});

/* ══ ⑤ THE SIXTH TRANSLATION SURFACE ═══════════════════════════════════════════════════════════
   The five instruments #R239 bound together all measure «how much of the table does this language
   have». None can see a string that was never given a key at all — 49 of those were shipping. */
test('R240 ⑤ every user-visible attribute carries a translation key, and the gate says so', () => {
  const out = JSON.parse(execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'i18n-attr-audit.mjs'), '--json'], { encoding: 'utf8' }));
  assert.equal(out.total, 0,
    'unkeyed title/aria-label/placeholder/alt: ' + [...new Set(out.findings.map((f) => f.text))].join(' · '));
  /* the surface is part of the ONE gate, not a sixth free-standing percentage */
  const g = R('scripts/i18n-audit.mjs');
  assert.match(g, /run\('i18n-attr-audit\.mjs'\)/, 'the one gate spawns it');
  assert.match(g, /if \(attrs\.total\) problems\.push/, 'and fails on it');
  /* aria-label had no mechanism at all before this round */
  assert.match(code(R('js/app-body.js')), /\[data-i18n-aria\]/, 'aria-label can be translated');
  assert.match(code(R('js/app-body.js')), /\[data-i18n-alt\]/, 'and so can alt');
});

test('R240 ⑤ a country is named in the reader’s language, from CLDR rather than a table', () => {
  const cu = code(R('js/countries-ui.js'));
  assert.match(cu, /window\._imCldrRegion=function\(a2,lang\)/, 'the mechanism exists');
  assert.match(cu, /new Intl\.DisplayNames\(\[tag\],\{type:'region',fallback:'none'\}\)/, 'and it is CLDR');
  assert.match(cu, /a2:a2\|\|'',/, 'the alpha-2 it needs is kept on the record');
  const ab = code(R('js/app-body.js'));
  assert.match(ab, /window\._imCldrRegion\(s\.a2,currentLang\)/, 'cName asks it');
  assert.match(ab, /currentLang==='jp'&&s&&s\.nameJp/, "…and Japanese keeps the app's own editorial name");
  /* ⚠ the COUNTRY mechanism may not live in the shell — tests/r168 #8 budgets it and the ceiling
     only falls — so app-body asks `window._imCldrRegion` rather than building a DisplayNames.
     ⚠ (#R246) The one DisplayNames the shell does hold is for LANGUAGE names, and it REPLACED a
     table (eleven `{en:'English',jp:'英語'}` objects), so the shell got smaller, not bigger. It is
     named here so that a THIRD one cannot arrive without somebody deciding to edit this line. */
  assert.equal((ab.match(/Intl\.DisplayNames/g) || []).length, 1, 'the shell holds one CLDR lookup');
  assert.match(ab, /_nlDN\[tag\]=new Intl\.DisplayNames\(\[tag\],\{type:'language'\}\)/,
    '…and it is the news-language names, which used to be a table');
});

/* ══ ⑥ THE BUILD STAMPS ════════════════════════════════════════════════════════════════════════ */
test('R240 ⑥ both build stamps name this round', () => {
  const h = R('index.html');
  const a = /__imBuild='R(\d+)'/.exec(h), b = /INTMAP_BUILD='\d{4}-\d{2}-\d{2}-R(\d+)'/.exec(h);
  assert.ok(a && b, 'both stamps must be present');
  assert.equal(a[1], b[1], 'and name the same round');
  assert.ok(+a[1] >= 240, `the stamps name R${a[1]}`);
});
