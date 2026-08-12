/* ============================================================================
 *  #R222 — the round's own invariants, checked at the source and in Node
 * ----------------------------------------------------------------------------
 *  Eight instructions, and the ones that can be checked without a browser are checked here:
 *  the ocean-current field's file format and its level-of-detail contract, the atmosphere model's
 *  new geometry (an eye ABOVE the shell), the two space-view defects, the phone layouts, and the
 *  science page's simulation sections in all five languages.
 *
 *  ⚠ THE ASSERTIONS ARE ABOUT RELATIONS, NOT ABOUT THIS ROUND'S NUMBERS (the #R199/#R203 lesson:
 *  a test that pins the value its own round produced fails the next time anybody improves it). So:
 *  "the frame-edge radius is preserved across a scale switch", not "dist becomes 30.554".
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skyColour, limbViewElev } from '../js/sky-model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① THE FIELD IS A GRID FILE, AND THE JSON NO LONGER CARRIES ARROWS ─────────────────────── */
test('① the ocean-current field ships as a gridded binary the client can stride', () => {
  const doc = JSON.parse(read('data/ocean-currents.json'));
  assert.ok(!('arrows' in doc), 'doc.arrows is gone — the field is a grid file now');
  assert.ok(doc.field && doc.field.file && doc.field.nx && doc.field.ny, 'the JSON describes the field file');
  assert.equal(doc.field.gridDeg, 0.25, 'the field keeps the source grid');
  assert.ok(doc.field.cells > 100000, `${doc.field.cells} cells with flow`);

  const buf = gunzipSync(readFileSync(join(ROOT, doc.field.file)));
  assert.equal(buf.toString('ascii', 0, 4), 'IMOC', 'the magic');
  assert.equal(buf.readUInt8(4), 1, 'format version 1');
  const planes = buf.readUInt8(5), nx = buf.readUInt16LE(6), ny = buf.readUInt16LE(8);
  assert.equal(planes, 1, 'the annual file is one plane');
  assert.equal(nx, doc.field.nx); assert.equal(ny, doc.field.ny);
  assert.equal(buf.length, 16 + planes * nx * ny * 2, 'exactly two bytes a cell, no padding');
  /* the decoded field has to contain a fast western boundary current somewhere */
  const sp = buf.subarray(16, 16 + nx * ny);
  let max = 0; for (let i = 0; i < sp.length; i++) if (sp[i] > max) max = sp[i];
  const SPMAX = buf.readUInt16LE(12) / 1000;
  assert.ok(SPMAX * (max / 255) ** 2 > 0.5, 'the fastest cell is a real boundary current');
});

test('① …and the twelve monthly climatologies are their own file, fetched only on demand', () => {
  const doc = JSON.parse(read('data/ocean-currents.json'));
  assert.ok(doc.months && doc.months.file, 'the months are described');
  const buf = gunzipSync(readFileSync(join(ROOT, doc.months.file)));
  assert.equal(buf.toString('ascii', 0, 4), 'IMOC');
  assert.equal(buf.readUInt8(5), 12, 'twelve planes, one per calendar month');
  const oc = read('js/ocean-currents.js');
  assert.ok(/loadMonths/.test(oc), 'the months file has its own loader');
  const setM = oc.slice(oc.indexOf('function setMonth('), oc.indexOf('function setMonth(') + 400);
  assert.ok(/m>0&&!months/.test(setM.replace(/\s/g, '')) && /loadMonths\(\)/.test(setM),
    'and it is only fetched when a month is actually chosen');
  assert.ok(!/loadMonths\(\)/.test(oc.slice(oc.indexOf('function load('), oc.indexOf('function loadField('))),
    'switching the layer on must not pull the 3 MB seasonal file');
  /* every named current carries its twelve monthly speeds and the along-path projection */
  const withM = doc.named.filter((c) => Array.isArray(c.monthSpeed) && c.monthSpeed.length === 12);
  assert.ok(withM.length > doc.named.length * 0.9, `${withM.length}/${doc.named.length} carry a season`);
  assert.ok(doc.named.every((c) => !c.monthAlong || c.monthAlong.length === 12));
});

/* ── ② COVERAGE: THE NAMED LIST GREW AND EVERY ENTRY IS STILL FIVE LANGUAGES ───────────────── */
test('② the named plate is the enlarged one, in all five languages', () => {
  const doc = JSON.parse(read('data/ocean-currents.json'));
  assert.ok(doc.named.length >= 95, `only ${doc.named.length} named currents`);
  for (const c of doc.named) {
    for (const l of ['en', 'ja', 'de', 'ru', 'es']) assert.ok(c[l] && c[l].length > 1, `${c.en} is missing ${l}`);
    assert.ok(Array.isArray(c.path) && c.path.length >= 4, `${c.en} has no path`);
  }
  /* the marginal-sea and coastal currents this round added must actually have traced */
  for (const en of ['Tsugaru Current', 'East Korea Warm Current', 'Taiwan Warm Current',
    'East African Coastal Current', 'Cape Horn Current', 'Yucatán Current']) {
    assert.ok(doc.named.some((c) => c.en === en), `${en} is missing from the plate`);
  }
});

/* ── ③ THE LEVEL-OF-DETAIL CONTRACT — a pure function, so it runs here ─────────────────────── */
test('③ the field decoder strides the grid so the mark count is bounded at every zoom', async () => {
  const src = read('js/ocean-currents-field.js');
  /* the module is a window IIFE, so it is evaluated with a stand-in window (the #R221 pattern) */
  const win = {};
  new Function('window', src)(win);
  const F = win.IntMapCurrentField;
  assert.ok(F && F.arrows && F.strideFor, 'the decoder publishes its surface');
  const doc = JSON.parse(read('data/ocean-currents.json'));
  const field = F.parse(gunzipSync(readFileSync(join(ROOT, doc.field.file))).buffer);
  const cap = 4200;
  const world = F.arrows(field, 0, { w: -180, e: 180, s: -80, n: 82 }, cap);
  const bay = F.arrows(field, 0, { w: 139, e: 141, s: 34, n: 36 }, cap);
  assert.ok(world.features.length <= cap, `${world.features.length} marks for the world`);
  assert.ok(bay.features.length <= cap, `${bay.features.length} marks for a bay`);
  assert.ok(world.grid > bay.grid, 'a wider view is drawn coarser');
  assert.equal(bay.grid, field.grid, 'a small view reaches the source grid itself');
  /* a strided mark is the vector mean of its block, so no mark may exceed the file's ceiling */
  assert.ok(world.features.every((f) => f.properties.s <= field.spMax + 1e-6));
  assert.ok(world.features.every((f) => f.properties.b >= -180 && f.properties.b <= 180));
});

/* ── ④ THE ATMOSPHERE: AN EYE OUTSIDE THE SHELL, AND THE LIMB IT SEES ─────────────────────── */
test('④ the sky model integrates from outside the atmosphere, and the ground answer is unmoved', () => {
  /* the geometry: a limb ray exists only when the eye is above that shell */
  assert.equal(limbViewElev(1000, 12000), null, 'no limb from inside the shell');
  const ve = limbViewElev(5e6, 12000);
  assert.ok(ve < 0 && ve > -90, 'the limb is below the horizontal');
  assert.ok(limbViewElev(5e6, 6000) < limbViewElev(5e6, 55000), 'a lower tangent looks further down');

  /* the day-side limb is bright and blue-dominant; the night-side limb is not */
  const day = skyColour(60, 5e6, 90, limbViewElev(5e6, 12000)).rgb;
  const night = skyColour(-80, 5e6, 180, limbViewElev(5e6, 12000)).rgb;
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(day) > 100, `the sunlit limb is bright (${day})`);
  assert.ok(day[2] > day[1], `and blue-dominant (${day})`);
  assert.ok(lum(night) < lum(day) * 0.25, `the night limb is far darker (${night})`);
  /* higher up the shell the limb has less air in it, so it is darker */
  assert.ok(lum(skyColour(60, 5e6, 90, limbViewElev(5e6, 60000)).rgb) < lum(day));

  /* ⚠ AND THE GROUND ANSWER IS UNCHANGED — this round widened the geometry, it did not retune the
     model. A camera inside the shell enters the march at t = 0 exactly as before. */
  const noon = skyColour(45, 0, 90, 55).rgb;
  assert.ok(noon[2] > noon[0] && lum(noon) > 60, `a noon sky is bright and blue (${noon})`);
  assert.deepEqual(skyColour(45, 0, 90, 55).rgb, noon, 'and it is deterministic');
});

test('④ …and theme-sky only uses the limb where there IS one, and where the Sun is known', () => {
  const ts = read('js/theme-sky.js');
  assert.ok(/limbViewElev/.test(ts) && /_limbHex/.test(ts), 'the limb path exists');
  const fn = ts.slice(ts.indexOf('function _limbHex'), ts.indexOf('function _horizonColour'));
  assert.ok(/alt>_ATM_TOP_M/.test(fn.replace(/\s/g, '')), 'it refuses below the top of the atmosphere');
  assert.ok(/_sunElevAtCentre\(\)/.test(fn) && /e==null\)\s*return null/.test(fn),
    'and it returns null when the Sun is unknown, so #R221’s day/night gate still decides');
});

/* ── ⑤ THE SPACE VIEW: THE TWO REPORTED DEFECTS ───────────────────────────────────────────── */
test('⑤ the scale switch carries the FRAME EDGE, not the camera distance', () => {
  const sp = read('js/space.js');
  assert.ok(/const HALF_FRAME=Math\.tan\(45\*D2R\/2\)/.test(sp), 'the half-frame tangent is named once');
  const fn = sp.slice(sp.indexOf('function setScale('), sp.indexOf('function setOrbits('));
  assert.ok(/edgeAu=auOfDist\(dist\*HALF_FRAME\)/.test(fn.replace(/\s/g, '')),
    'the invariant is the real-space radius at the edge of the picture');
  assert.ok(/posScale\(edgeAu\)\/HALF_FRAME/.test(fn.replace(/\s/g, '')), 'and it is converted back through it');
  /* the arithmetic itself, reproduced here: a round trip must be exact and the edge must not move */
  const K = 26, P = 0.42, T = Math.tan(45 * Math.PI / 360);
  const toAu = (d, s) => (s === 'real' ? d : Math.pow(d / K, 1 / P));
  const fromAu = (au, s) => (s === 'real' ? au : K * Math.pow(au, P));
  const edge = (d, s) => toAu(d * T, s);
  const model = 182.2685;
  const real = fromAu(edge(model, 'model'), 'real') / T;
  assert.ok(Math.abs(edge(real, 'real') - edge(model, 'model')) < 1e-6, 'the frame edge is preserved');
  const back = fromAu(edge(real, 'real'), 'model') / T;
  assert.ok(Math.abs(back - model) / model < 1e-6, 'and the round trip returns');
});

test('⑤ zooming in on a probe cannot hand the reader back to the Earth map', () => {
  const sp = read('js/space.js');
  const fn = sp.slice(sp.indexOf('function earthIsSubject('), sp.indexOf('function atNearLimit('));
  assert.ok(/!craftSel/.test(fn) && /!smallSel/.test(fn),
    'the Earth is the subject only when nothing else is selected');
  /* and the crossing into body mode keeps #R221’s guard */
  const am = sp.slice(sp.indexOf('function autoMode('), sp.indexOf('function setMode('));
  assert.ok(/craftSel\|\|smallSel/.test(am.replace(/\s/g, '')), '#R221’s body-mode guard is still there');
});

/* ── ⑥ THE PHONE LAYOUTS ──────────────────────────────────────────────────────────────────── */
test('⑥ the space sheet has three stops and is dragged, not switched', () => {
  const sp = read('js/space.js');
  assert.ok(/setPointerCapture/.test(sp), 'a drag that leaves the handle keeps working');
  assert.ok(/pointerdown/.test(sp) && /pointermove/.test(sp) && /pointerup/.test(sp));
  assert.ok(/moved<8/.test(sp.replace(/\s/g, '')), 'a tap still cycles the stops');
  const css = read('css/intmap.css');
  assert.ok(/sp-col\.sp-max/.test(css), 'the third stop exists in the stylesheet');
  assert.ok(/--sp-sheet-h/.test(css), 'and the stops are one custom property');
  assert.ok(/sp-drag/.test(css), 'the transition is suppressed while dragging');
});

test('⑥ the space clock is a three-row sheet with a unit on every step key', () => {
  const sp = read('js/space.js');
  assert.ok(/const STEP_U=/.test(sp), 'the three step units are named once');
  assert.equal((sp.match(/sp-step-l">'\+STEP_U/g) || []).length, 6, 'all six step keys carry their unit');
  const css = read('css/intmap.css');
  assert.ok(/sp-timebox \.sp-when\{[^}]*font-size:16px/.test(css.replace(/\s*\n\s*/g, ' ')) ||
    /sp-when\{[\s\S]{0,200}font-size:16px/.test(css),
    'the field is 16px, so a phone types into it instead of zooming into it');
});

test('⑥ the flight HUD is four zones, and nothing is stretched between two edges', () => {
  const fs = read('js/flight-sim.js');
  assert.ok(/TOP BAND/.test(fs) && /THUMB RAILS/.test(fs), 'the zones are written down');
  /* the badge and the config chips are given a top by this round; both must clear their bottom */
  const zone = fs.slice(fs.indexOf('THE PHONE HUD IS FOUR ZONES'));
  const badge = zone.slice(zone.indexOf('.fs-acbadge{'), zone.indexOf('.fs-acbadge{') + 400);
  assert.ok(/bottom:auto/.test(badge), 'an element with top AND bottom is stretched between them');
  assert.ok(/aria-label="'\+LL\('Exit'/.test(fs), 'the icon-only exit keeps its accessible name');
  /* the landscape rails must not overlap: the deck key sits clear of the pad */
  assert.ok(/fs-deck-t\{right:calc\(158px/.test(zone.replace(/\s*\+'/g, '').replace(/'\s*/g, '')),
    'the deck key is beside the pad, not under it');
});

/* (#R229) This asserted that #R221's suppression ALSO fired on a scroll and on a sheet transition —
   i.e. that the frosting came off in even more situations. The whole mechanism is deleted; it was
   never asked for. See tests/r221-checks ⑥ for the standing check. */
test('⑥ the glass is never un-frosted by the app itself (#R229)', () => {
  assert.ok(!existsSync(join(ROOT, 'js/glass-motion.js')), 'js/glass-motion.js must not exist');
  /* ⚠ a SELECTOR, not the word — the comment that replaced the rule names it deliberately */
  assert.doesNotMatch(read('css/intmap.css'), /body\.im-moving[^{]*\{/, 'and no CSS rule survives for it');
});

/* ── ⑦ THE SCIENCE PAGE, IN FIVE LANGUAGES ────────────────────────────────────────────────── */
const LANGS = ['en', 'ja', 'de', 'ru', 'es'];
const SIM_SECTIONS = ['elevation', 'water', 'seismic', 'tsunami', 'sealevel', 'currents',
  'atmosphere', 'sun', 'sats', 'space', 'flight', 'routing'];

function sectionOf(src, id) {
  const at = src.indexOf(`id: '${id}'`);
  if (at < 0) return '';
  const end = src.indexOf('\n        ]', at);
  return src.slice(at, end < 0 ? src.length : end);
}

test('⑦ every simulation section gained the same detail in every language', () => {
  const counts = {};
  for (const l of LANGS) {
    const src = read(`js/locales/pages.${l}.js`);
    counts[l] = {};
    for (const id of SIM_SECTIONS) {
      const sec = sectionOf(src, id);
      assert.ok(sec, `${l} is missing §${id}`);
      counts[l][id] = { tex: (sec.match(/\['tex'/g) || []).length, h3: (sec.match(/\['h3'/g) || []).length };
    }
  }
  for (const id of SIM_SECTIONS) {
    const ref = counts.en[id];
    for (const l of LANGS) {
      assert.equal(counts[l][id].tex, ref.tex, `${l} §${id} has ${counts[l][id].tex} equations, English has ${ref.tex}`);
      assert.equal(counts[l][id].h3, ref.h3, `${l} §${id} has ${counts[l][id].h3} sub-headings, English has ${ref.h3}`);
    }
  }
  /* the whole point of the round: the simulations are documented in depth */
  const en = read('js/locales/pages.en.js');
  const tex = SIM_SECTIONS.reduce((n, id) => n + (sectionOf(en, id).match(/\['tex'/g) || []).length, 0);
  assert.ok(tex >= 35, `only ${tex} equations across the simulation sections`);
});

test('⑦ the new equations name the schemes they claim to use', () => {
  const en = read('js/locales/pages.en.js');
  const has = (id, re) => assert.ok(re.test(sectionOf(en, id)), `§${id} is missing ${re}`);
  has('tsunami', /Arakawa C/);
  has('tsunami', /CFL/i);
  has('currents', /climatolog/i);
  has('atmosphere', /limb/i);
  has('sats', /SGP4/);
  has('space', /Kepler/);
  has('flight', /Standard Atmosphere/i);
  has('water', /Manning/);
});
