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
  const foll = t.slice(t.indexOf('function _skyFollowCamera()'), t.indexOf('function _skyFollowCamera()') + 1800);
  assert.match(code(foll), /_nightSideOff\(\)/, 'the follow knows about the un-aimed case');
  assert.match(code(foll), /_aimSun\._at/, 'and re-aims when the centre has moved');
});

test('R240 ① the blend ramp keeps its measured z0 strengths and stops tapering in the middle', () => {
  const t = code(R('js/theme-sky.js'));
  const blend = /'atmosphere-blend':\(sat[\s\S]{0,700}?\)\}\);/.exec(t);
  assert.ok(blend, 'the atmosphere-blend expression was not found');
  const ramps = [...blend[0].matchAll(/\['interpolate',\['linear'\],\['zoom'\],([^\]]+)\]/g)]
    .map((m) => m[1].split(',').map(Number));
  assert.equal(ramps.length, 3, 'three ramps: satellite, light map, dark map');
  const stops = (a) => { const o = {}; for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = a[i + 1]; return o; };
  const [sat, light, dark] = ramps.map(stops);
  assert.equal(sat[0], 0.55, "#R187's satellite strength must not move");
  assert.equal(dark[0], 0.80, "the dark basemap's strength must not move");
  assert.ok(light[0] <= 0.16, "#R205's light-map ceiling must hold");
  /* ⚠ THE CLAIM: the air does not thin out while the reader zooms IN on the globe. maplibre already
     multiplies this by globeness (0 by z12), so a second taper before then is what made the air fade
     from z4 onward. Measured before: 43.7 → 23.9 between z4 and z11. */
  for (const [name, r] of [['satellite', sat], ['light', light], ['dark', dark]]) {
    const z = Object.keys(r).map(Number).sort((a, b) => a - b);
    const mid = z.filter((v) => v > 0 && v <= 11);
    assert.ok(mid.length, `${name}: no stop between z0 and z11`);
    const last = mid[mid.length - 1];
    assert.ok(r[last] >= r[0] * 0.7,
      `${name}: the ramp falls to ${r[last]} by z${last}, from ${r[0]} — that is the second taper`);
    assert.equal(r[z[z.length - 1]], 0, `${name}: the tail still reaches zero`);
  }
});

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
  assert.match(s, /max-height:calc\(100dvh - 96px\)/, 'the panel is bounded by the screen so the footer fits');
});

test('R240 ③ the intensity chip is one width PER SCALE', () => {
  const s = code(R('js/seismic.js'));
  assert.match(s, /function _chipW\(jma\)/, 'the measurement takes the scale');
  assert.match(s, /width:'\+_chipW\(jp\)\+'px/, 'and the cell passes the one it is printing');
  const fn = s.slice(s.indexOf('function _chipW'), s.indexOf('function _chipW') + 1400);
  assert.match(fn, /if\(jma\)\{ try\{ JMA_CLASSES/, 'JMA measures JMA labels');
  assert.match(fn, /else \{ try\{ for\(let i=1;i<=12;i\+\+\) labels\.push\('MMI '/, 'and MMI measures MMI labels');
});

/* ══ ④ THE DOCK ════════════════════════════════════════════════════════════════════════════════ */
test('R240 ④ a docked panel expands, arrives open, and runs edge to edge on a phone', () => {
  const css = R('css/intmap.css');
  assert.match(css, /\.im-docked \[class\$="-scroll"\]/, 'every inner scroller, not two named ones');
  assert.match(css, /\.im-docked \[class\$="-body"\]/);
  assert.match(css, /#docked-feed\{ margin-left:-16px; margin-right:-16px;/, 'the feed cancels the sheet padding');
  assert.match(css, /#docked-feed::-webkit-scrollbar\{ width:0/, 'and the rail that sat over the panels is gone');
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
  /* ⚠ the mechanism may NOT live in the shell — tests/r168 #8 budgets it and the ceiling only falls */
  assert.doesNotMatch(ab, /Intl\.DisplayNames/, 'the shell holds no new mechanism');
});

/* ══ ⑥ THE BUILD STAMPS ════════════════════════════════════════════════════════════════════════ */
test('R240 ⑥ both build stamps name this round', () => {
  const h = R('index.html');
  const a = /__imBuild='R(\d+)'/.exec(h), b = /INTMAP_BUILD='\d{4}-\d{2}-\d{2}-R(\d+)'/.exec(h);
  assert.ok(a && b, 'both stamps must be present');
  assert.equal(a[1], b[1], 'and name the same round');
  assert.ok(+a[1] >= 240, `the stamps name R${a[1]}`);
});
