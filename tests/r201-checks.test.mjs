/* ============================================================================
 *  IntMap · #R201 — a terminator with as many levels as it has pixels, a region label that
 *                   answers, a zoom that keeps going, and a suite that boots once
 * ----------------------------------------------------------------------------
 *  Four subjects, each pinned by the PROPERTY that was missing rather than by the line that fixes it:
 *
 *    ① 「夜と昼の部分の変遷が階段状で不自然」/「夜の部分は完全に夜間光レイヤーと同じ画像に」
 *       Five nested fills can produce five levels. The night side is now ONE canvas whose alpha is
 *       computed per pixel, and whose RGB is the GIBS product with nothing done to it.
 *    ② 「クリック可能ではない！ほかの地名ラベルと違う挙動にするな！」 #R198 left `ofm-admin1` out of
 *       js/map-ui.js's label lists on purpose and wrote that down. It is in ALL of them now — and
 *       "all of them" is checked by DERIVING the lists from the file, not by naming them here.
 *    ③ 「ボタンで押す形式ではなく…ズームアウトし続ければそのまま宇宙まで」 No button; an integral.
 *    ④ 「毎回毎回、テストに時間がかかりすぎ」 Eight specs booted the app TWICE per test to choose a
 *       renderer. One boot now — and no spec may go back to two without this test noticing.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const NIGHT = read('js/night-side.js');
const MAPUI = read('js/map-ui.js');
const SPACE = read('js/space.js');

/* ══ ① THE NIGHT SIDE IS A GRADIENT, AND THE NIGHT IS THE PRODUCT ══════════════════════════════ */

test('r201 ①a the five-ring staircase is gone from js/night-side.js', () => {
  for (const dead of ['NIGHT_PROFILE', 'RING_ALPHA', 'SHADE_MAX', '_composite', 'ringFC', 'ringLat'])
    assert.ok(!NIGHT.includes(dead), `${dead} belongs to the mechanism #R201 replaced`);
  /* the whole band is now stated once, as the elevation at which night begins */
  const m = NIGHT.match(/const TWILIGHT_END\s*=\s*(-?\d+(?:\.\d+)?)\s*;/);
  assert.ok(m, 'TWILIGHT_END is a single named constant');
  assert.equal(Number(m[1]), -18, 'astronomical twilight, which is the definition of night');
  /* …and it is the ONLY place the band appears: nightness and the draw loop both derive from it */
  const uses = NIGHT.match(/TWILIGHT_END/g) || [];
  assert.ok(uses.length >= 3, `the constant is used, not shadowed by literals (${uses.length})`);
  assert.ok(!/\/\s*12\b/.test(NIGHT.replace(/\/\*[\s\S]*?\*\//g, '')), 'no leftover /12 twilight literal');
});

test('r201 ①b the drawn pixel is the GIBS pixel — no threshold, no gain, no bias', () => {
  const body = NIGHT.slice(NIGHT.indexOf('function drawLights'), NIGHT.indexOf('function zoomNow'));
  /* the three colour writes take the source byte and nothing else */
  const writes = body.match(/o\[k(?:\+\d)?\]\s*=\s*L\.d\[j2(?:\+\d)?\];/g) || [];
  assert.equal(writes.length, 3, 'R, G and B are copied straight out of the mosaic');
  /* #R196's version multiplied and biased them, and skipped anything under 2 % — all gone */
  assert.ok(!/L\.d\[j2[^\]]*\]\s*\*/.test(body), 'no brightness gain on the product');
  assert.ok(!/lum\s*<=?/.test(body), 'no luminance threshold hiding the unlit half of the night');
  /* and the alpha is the nightness, at full strength when it is fully night */
  assert.ok(/o\[k\+3\]\s*=\s*n>=1\?255:/.test(body), 'full night is a fully opaque image');
});

test('r201 ①c the zoom expression is outermost, and the cap rides on the stop output', () => {
  /* #R196's trap: MapLibre REJECTS a nested zoom expression and addLayer swallows the rejection */
  assert.ok(/const capOpacity=\(\)=>\['interpolate',\['linear'\],\['zoom'\]\]/.test(NIGHT),
    'the cap opacity starts with the zoom interpolate');
  assert.ok(/\['\*',\['get','a'\],v\]/.test(NIGHT), 'the per-wedge value is a STOP OUTPUT');
  assert.ok(!/\['\*',[^\n]*\['interpolate',\['linear'\],\['zoom'\]\]/.test(NIGHT),
    'nothing wraps a zoom expression');
  /* the ramp's last stop is a literal zero — what tests/r201.spec.js reads off the live style */
  const ramp = NIGHT.match(/const RAMP_STOPS=(\[[^;]+\]);/);
  assert.ok(ramp, 'RAMP_STOPS is one table');
  const stops = JSON.parse(ramp[1]);
  assert.equal(stops[stops.length - 1][1], 0, 'the effect is gone before a continent fills the view');
  assert.equal(stops[0][1], 1, 'and it is at full strength at the widest zoom');
  for (let i = 1; i < stops.length; i++) {
    assert.ok(stops[i][0] > stops[i - 1][0], 'the stops climb in zoom');
    assert.ok(stops[i][1] <= stops[i - 1][1], 'and the effect only ever weakens as you zoom IN');
  }
  /* 「引いたときの黒さをよりきつくして」: the app opens at z1.7, and #R196's ramp was already 0.86
     there — the widest view never saw the full effect. Derived from the table, not restated. */
  const at = (z) => { for (let i = 1; i < stops.length; i++) if (z <= stops[i][0]) {
    const [z0, v0] = stops[i - 1], [z1, v1] = stops[i]; return v0 + (v1 - v0) * (z - z0) / (z1 - z0); } return 0; };
  assert.ok(at(1.7) > 0.95, `the opening zoom gets the full effect (${at(1.7).toFixed(3)})`);
});

test('r201 ①d the polygon layer is the polar cap and nothing else', () => {
  const cap = NIGHT.match(/const CAP_LAT=([\d.]+),\s*CAP_WEDGES=(\d+);/);
  assert.ok(cap, 'the cap states its own latitude and resolution');
  const capLat = Number(cap[1]);
  /* it has to meet the image quad, which stops at Mercator's limit — a gap there is a bright ring
     around the pole at exactly the zoom this effect exists for */
  const lim = Number((NIGHT.match(/const LIM=([\d.]+);/) || [])[1]);
  assert.ok(capLat < lim, `the cap overlaps the image (${capLat} < ${lim})`);
  assert.ok(lim - capLat < 0.2, 'and does not overlap it by more than a hairline');
  assert.ok(Number(cap[2]) >= 12, 'enough wedges that the cap follows the terminator across longitude');
});

/* ══ ② THE ADMIN-1 LABEL IS A PLACE LABEL EVERYWHERE js/map-ui.js DECIDES WHAT ONE IS ══════════ */

test('r201 ②a ofm-admin1 is wired for click, cursor, exact hit and padded tap', () => {
  const fn = MAPUI.slice(MAPUI.indexOf('const PLACE_LBL='), MAPUI.indexOf('function tryWire'));
  /* the four lists are DERIVED from the file: two named arrays and the two uses of the wider one */
  const place = JSON.parse((fn.match(/const PLACE_LBL=(\[[^\]]+\]);/) || [])[1].replace(/'/g, '"'));
  assert.ok(place.includes('ofm-admin1'), 'a prefecture name is a place name');
  assert.deepEqual(place, ['ofm-country', 'ofm-admin1', 'ofm-city', 'ofm-other'],
    'and it sits between the country and the city, the way the label stack does');
  assert.ok(/const ALL_LBL=PLACE_LBL\.concat\(/.test(fn), 'the wider list is BUILT from the narrower one');
  /* the per-layer click handler exists and is the ordinary (non-country) one */
  assert.ok(/onLayer\('click','ofm-admin1',onLabel\(false\)\)/.test(fn),
    'clicking it does what clicking a city does');
  /* both queries — the exact glyph hit and the padded tap — use the SAME derived list, so neither
     can drift from the other again */
  assert.equal((fn.match(/ALL_LBL\.filter\(id=>GE\(\)\.layers\.get\(id\)\)/g) || []).length, 1);
  assert.equal((fn.match(/ALL_LBL\.forEach/g) || []).length, 1, 'the cursor list is the same list');
  /* the padded-tap fallback must NOT treat it as a water/terrain label (those lose the area tools) */
  const geo = fn.match(/const geoLbl=\/\^\(([^)]*)\)/);
  assert.ok(geo && !geo[1].includes('admin1'), 'a region HAS an area, so Isolate/Move stay');
});

test('r201 ②b the note that said the opposite is gone from js/place-labels.js', () => {
  const PL = read('js/place-labels.js');
  assert.ok(!/deliberately NOT in the label-click/.test(PL),
    'a comment that documents the defect as a decision is worse than no comment');
  assert.ok(/#R201/.test(PL), 'and the reversal is recorded where the layer is declared');
});

/* ══ ③ THE WAY INTO SPACE IS THE ZOOM ═════════════════════════════════════════════════════════ */

test('r201 ③a there is no button left anywhere', () => {
  for (const dead of ['space-btn', 'ensureButton', 'syncButton', 'buttonVisible'])
    assert.ok(!SPACE.includes(dead), `${dead} is the mechanism this round replaced`);
  /* ⚠ CODE, NOT PROSE. The specs that used to drive the button now carry a note saying so, and a
     grep over the raw text finds the note. Comments are stripped first — a check that cannot tell
     an assertion from a sentence about one would have to be satisfied by deleting the sentence. */
  const specs = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.js'));
  for (const f of specs) {
    if (f === 'r201.spec.js') continue;             /* r201 ③ asserts the button's ABSENCE */
    const code = read('tests/' + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/#space-btn|buttonVisible/.test(code), `tests/${f} still drives the removed button`);
  }
});

test('r201 ③b the integral is sustained, decays, and only counts at the floor', () => {
  const trig = Number((SPACE.match(/const OVER_TRIGGER=([\d.]+)/) || [])[1]);
  const decay = Number((SPACE.match(/OVER_DECAY=(\d+)/) || [])[1]);
  assert.ok(trig >= 1, `one flick past the floor is not a launch (${trig} zoom levels)`);
  assert.ok(decay >= 400 && decay <= 3000, `and stopping puts it back (${decay} ms)`);
  /* the guard that makes the whole thing free at every other zoom */
  assert.ok(/function pushOut\(dz\)\{[\s\S]*?if\(!atFloor\(\)\)/.test(SPACE),
    'a zoom-out the camera CAN spend is not an attempt to leave');
  /* nothing here may fight the renderer for the gesture */
  const mount = SPACE.slice(SPACE.indexOf('function mount()'), SPACE.indexOf('return {\n      open:openView'));
  const listeners = mount.match(/addEventListener\('(\w+)',[\s\S]*?\{passive:true\}\)/g) || [];
  assert.ok(listeners.length >= 4, `every map listener is passive (${listeners.length})`);
  assert.ok(!/preventDefault/.test(mount), 'and none of them cancels anything');
  /* the way back is the same integral mirrored */
  assert.ok(/function pushIn\(dz\)\{/.test(SPACE) && /atNearLimit\(\)/.test(SPACE),
    'a zoom-in the space camera cannot spend returns the map');
  assert.ok(/leaveToMap/.test(SPACE) && /enterFromZoom/.test(SPACE), 'both crossings are named');
  /* and both crossings fade rather than cut */
  assert.ok(/fadeRoot\(0,1,/.test(SPACE) && /fadeRoot\(1,0,/.test(SPACE), 'in and out are both fades');
});

/* ══ ④ THE SUITE BOOTS ONCE PER TEST, NOT TWICE ═══════════════════════════════════════════════ */

test('r201 ④a no spec chooses its renderer with a second page load', () => {
  const specs = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.js'));
  const offenders = [];
  for (const f of specs) {
    const s = read('tests/' + f);
    if (!/intmap_engine/.test(s)) continue;
    /* the only legitimate reason to write the key from the page is a test ABOUT switching engines,
       and those write it and reload deliberately — they never do it as a BOOT step, i.e. never
       within a few lines of a goto that precedes it */
    for (const m of s.matchAll(/page\.goto\([^)]*\);\s*\n\s*await page\.evaluate\([^\n]*intmap_engine/g))
      offenders.push(f + ': ' + m[0].slice(0, 60).replace(/\s+/g, ' '));
  }
  assert.deepEqual(offenders, [], 'boot the engine with tests/helpers/engine.js instead');
  /* ⚠ AND THE HELPER STILL HANDLES THE CASE THE SECOND LOAD WAS REALLY FOR. tests/r182-cesium ①a/①b
     boot BOTH engines inside one test on one page, because the test IS the comparison. The seed only
     writes the key when nothing has (which is what keeps "switch back to MapLibre" honest), so an
     already-booted page has to be switched the old way — write and reload. CI found this: two tests,
     90 s timeout, three attempts each. */
  const ENG = read('tests/helpers/engine.js');
  assert.match(ENG, /const live = await page\.evaluate\(/, 'the helper asks what is already running');
  assert.match(ENG, /if \(live\) \{[\s\S]{0,400}?page\.reload\(/, 'and switches an already-booted page by reloading');
  assert.match(ENG, /\} else \{[\s\S]{0,200}?seedEngine\(page, engine\);[\s\S]{0,120}?page\.goto\(/,
    'while a fresh page still gets exactly one load');
});

test('r201 ④b the seed the suite boots with lives in exactly one place', () => {
  const CFG = read('playwright.config.js');
  assert.ok(/from '\.\/tests\/helpers\/session-seed\.js'/.test(CFG), 'the config imports the seed');
  assert.ok(!/intmap_session2['"]?\s*,\s*value/.test(CFG), 'and does not also spell it out');
  const SEED = read('tests/helpers/session-seed.js');
  const defv = Number((SEED.match(/"defv":(\d+)/) || [])[1]);
  const gen = Number((read('js/app-body.js').match(/defv\s*[:=]\s*(\d+)/) || [])[1]);
  assert.ok(Number.isFinite(defv), 'the seed carries a generation stamp');
  if (Number.isFinite(gen)) assert.equal(defv, gen, '#R189: an unstamped session gets healed back on');
  /* every spec that opens its OWN context must carry it, or it silently boots the slow way */
  const specs = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.js'));
  for (const f of specs) {
    const s = read('tests/' + f);
    if (f === 'prod-smoke.spec.js') continue;     /* runs against the DEPLOYED site, a different origin */
    if (!/browser\.newContext\(/.test(s)) continue;
    assert.ok(/seededStorageState/.test(s), `tests/${f} opens a context without the session seed`);
  }
});

/* ══ ⑤ THE MOBILE SESSION DOES NOT SPEND ITS CONNECTION ON WHAT NOTHING IS SHOWING ════════════ */

test('r201 ⑤ the two multi-megabyte prefetches take the phone into account', () => {
  const TB = read('js/time-borders.js');
  assert.ok(/if\(HOST\.isMobile&&HOST\.isMobile\(\)\) return;/.test(TB),
    'the 5.5 MB CShapes bundle is not prefetched on a phone (the time machine still loads it)');
  const CU = read('js/countries-ui.js');
  assert.ok(/if\(HOST\.isMobile&&HOST\.isMobile\(\)\) slow=true;/.test(CU),
    'the 4.3 MB 10 m geometry takes the Data-Saver schedule on a phone — deferred, never dropped');
  /* deferred, NOT skipped: the upgrade still runs, so nothing about the areas or the outline is lost */
  assert.ok(/if\(slow\) setTimeout\(run,15000\)/.test(CU), 'and it still runs');
});

/* ══ ⑥ THE BUILD STAMPS NAME THIS ROUND ═══════════════════════════════════════════════════════ */

test('r201 ⑥ the build stamps name THIS round', () => {
  /* #R174: both stamps sat at R171 through two rounds, so a reload could not be told apart from a
     stale cache. The exact pin lives in the current round's file and becomes the negative form in
     the next one (see tests/r200-checks ⑧). */
  const idx = read('index.html');
  assert.match(idx, /window\.__imBuild='R201';/);
  assert.match(idx, /window\.INTMAP_BUILD='2026-08-07-R201';/);
});
