/* ============================================================================
 *  IntMap · #R221 source-level checks (Node only — no browser)
 * ----------------------------------------------------------------------------
 *  Each test pins a defect this round actually hit, so the same mistake fails the build rather than
 *  being rediscovered from a screenshot. Nothing here asserts a value this round happened to
 *  produce (#R203's rule); they assert the RELATIONS that made those values right.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  : readFileSync(join(ROOT, p), 'utf8'));
const JS = join(ROOT, 'js');

/* ── ① ADDING A LANGUAGE MUST NOT MEAN EDITING 2,238 CALL SITES ───────────────────────────────
   The whole point of js/lang-registry.js. If a module re-grows its own five-positional helper, a
   sixth language silently returns `undefined` there — which is what the registry exists to stop. */
test('① no module declares its own five-positional language helper any more', () => {
  const offenders = [];
  for (const f of readdirSync(JS).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(JS, f), 'utf8');
    /* the shape: (en, jp|j|ja, de, ru, es) => … — in a declaration, not in a comment */
    const re = /=\s*\(\s*(?:en|e)\s*,\s*(?:jp|j|ja)\s*,\s*de\s*,\s*ru\s*,\s*es\s*\)\s*=>/g;
    let m;
    while ((m = re.exec(src))) {
      /* ignore anything inside a block comment */
      const before = src.slice(0, m.index);
      const open = before.lastIndexOf('/*'), close = before.lastIndexOf('*/');
      if (open > close) continue;
      offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [], 'these files still hand-roll a 5-argument language helper: ' + offenders.join(', '));
});

test('① the registry is the ONE list, and the first five keep their argument order', () => {
  const src = read('js/lang-registry.js');
  const codes = [...src.matchAll(/\{\s*code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(codes.slice(0, 5), ['en', 'jp', 'de', 'ru', 'es'],
    'the first five languages ARE the argument order of every L(…) call site — append, never reorder');
  /* every registered language must have a locale file, or the table it builds is empty */
  for (const c of codes) {
    assert.ok(existsSync(join(JS, 'locales', `ui.${c}.js`)), `js/locales/ui.${c}.js is missing`);
    assert.ok(read('src/main.js').includes(`js/locales/ui.${c}.js`), `src/main.js does not import ui.${c}.js`);
  }
});

test('① a language table falls back to English PER KEY, not per table', () => {
  const src = read('js/i18n.js');
  assert.ok(/Object\.create/.test(src) || /keyed\(/.test(src),
    'js/i18n.js must chain each table onto English so a missing key is English, not undefined');
  assert.ok(read('js/lang-registry.js').includes('Object.create(base)'),
    'the prototype chain is what makes a late Object.assign on English reach every language');
});

/* ── ② THE INTENSITY FIELD MUST NOT EVICT ITS OWN DEM TILES ───────────────────────────────────
   The concentric-circle report. One field asks for up to 520 tiles (1,600 since #R216) and the
   shared cache holds 140 on a phone, so without a pin the picture throws away what it just
   fetched and every cell falls back to one site class = rings. */
test('② the DEM cache exempts pinned tiles, and the field pins + releases them', () => {
  const ro = read('js/map-readout.js');
  assert.ok(/_demHold/.test(ro), 'map-readout must have a hold set');
  assert.ok(/_demHold\.has\(k\)/.test(ro), 'the trim must skip pinned tiles');
  assert.ok(/function releaseDEMHold/.test(ro), 'a pin with no release is a leak');
  assert.ok(/demTilePoints/.test(ro), 'the warm-up must be able to ask for one point per TILE');

  const se = read('js/seismic.js');
  /* (#R223) …and the same grid, minus the tiles whose whole footprint the bundled land mask says is
     sea — the field never paints the ocean, so it must not wait for it either. */
  assert.ok(/demTilePoints\(W,Ss,E,Nn,z,_keepTile\)/.test(se), 'the field must warm the tile grid, not a fixed lattice');
  assert.ok(/warmDEMTiles\([^)]*,true\)/.test(se) || /warmDEMTiles\(warm,z,_ms,\(f\)=>prog\(6\+34\*\(\+f\|\|0\)\),true\)/.test(se),
    'the field must warm with hold=true');
  assert.ok(/releaseDEMHold/.test(se), 'the field must release the pin');
  /* …and the release must be in the `finally`, or an aborted build pins tiles for ever */
  const fin = se.indexOf('} finally {');
  assert.ok(fin > 0 && se.slice(fin, fin + 200).includes('releaseDEMHold'),
    'releaseDEMHold must be in the finally block — an aborted build must not leave tiles pinned');
});

test('② a failed elevation tile expires instead of poisoning the session', () => {
  const ro = read('js/map-readout.js');
  const i = ro.indexOf('img.onerror');
  assert.ok(i > 0);
  assert.ok(ro.slice(i, i + 260).includes('_demCache.delete(key)'),
    'a null (failed) tile must be cleared later so the next field can ask again');
});

/* ── ③ DAY/NIGHT IS A PROPERTY OF THE SATELLITE BASEMAP ──────────────────────────────────────
   #R220 gated the LAYERS; the Sun-aimed light, the horizon colour and the sky colour were not
   gated, and those are the other three things that darken the globe by the Sun. */
test('③ the sun-aimed light and the sky both stand down on the vector map', () => {
  const ts = read('js/theme-sky.js');
  assert.ok(/_satelliteUp\s*\(\s*\)/.test(ts), 'theme-sky must ask whether the satellite basemap is up');
  assert.ok(/getLayout\('layer-sat','visibility'\)/.test(ts),
    'it must be the SAME question js/night-side.js asks, or the two can disagree');
  const i = ts.indexOf('function _nightSideOff');
  assert.ok(i > 0);
  assert.ok(ts.slice(i, i + 320).includes('!_satelliteUp()'),
    '_nightSideOff must be true when the basemap is not satellite');
});

/* ── ④ THE SKY MODEL'S MIE TERM IS ATTENUATED PER CHANNEL ────────────────────────────────────
   A scalar there injects neutral haze attenuated through green, which is the olive horizon. */
test('④ Mie in-scattering carries a per-channel optical path', async () => {
  const src = read('js/sky-model.js');
  assert.ok(/const sumM = \[0, 0, 0\]/.test(src), 'sumM must be a 3-vector, not a scalar');
  assert.ok(/sumM\[k\] \+= hm \* a/.test(src), 'each channel must use its OWN attenuation');
  assert.ok(!/if \(k === 1\) att1 = a/.test(src), 'the green-channel shortcut must be gone');

  const { skyColour } = await import('../js/sky-model.js');
  /* looking INTO a low Sun must be warm — red above blue. With the scalar bug this was olive. */
  const at = skyColour(2, 0, 0, 3).rgb;
  assert.ok(at[0] > at[2], `a sunset looked at should be warm, got rgb(${at})`);
  /* …and the same Sun looked AWAY from must be darker than looked at */
  const away = skyColour(2, 0, 180, 3).rgb;
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(at) > lum(away), 'the sky toward the Sun must be brighter than the sky away from it');
  /* the #R202 Cesium calibration must survive: the noon sample stays close to [85,112,130] */
  const noon = skyColour(60, 0, 90, 55).rgb;
  assert.ok(Math.abs(noon[0] - 85) < 25 && Math.abs(noon[1] - 112) < 25,
    `#R202's noon calibration moved too far: rgb(${noon})`);
  assert.ok(noon[2] > noon[1] && noon[1] > noon[0], 'a noon sky must be blue-dominant');
});

/* ── ⑤ THE SPACE VIEW ─────────────────────────────────────────────────────────────────────── */
test('⑤ zooming in with a probe selected cannot enter a planet body view', () => {
  const sp = read('js/space.js');
  const i = sp.indexOf('function autoMode()');
  assert.ok(i > 0);
  const body = sp.slice(i, i + 500);
  assert.ok(/craftSel\|\|smallSel/.test(body),
    'autoMode must not cross into body mode while a spacecraft or small body is the selection');
});

test('⑤ the scale switch preserves what the picture is of', () => {
  const sp = read('js/space.js');
  const i = sp.indexOf('function setScale(');
  assert.ok(i > 0);
  const body = sp.slice(i, i + 2200);
  assert.ok(/focusRadius\(\)/.test(body), 'the switch must know the focused body\'s drawn radius');
  assert.ok(/byRadii/.test(body) && /byAu/.test(body), 'both invariants must be present');
  assert.ok(/Math\.exp\(\s*w\s*\*\s*Math\.log\(byRadii\)/.test(body), 'they must be blended in log space');
  /* a probe has no radius, so the AU rule must be the only one that applies to it */
  const fr = sp.indexOf('function focusRadius()');
  assert.ok(fr > 0 && sp.slice(fr, fr + 220).includes('craftSel||smallSel'),
    'a selected point object must report no radius, or the blend frames the wrong thing');
});

test('⑤ the phone body list is a sheet, not an 8,463 px corridor', () => {
  const sp = read('js/space.js');
  assert.ok(/sp-sidebox/.test(sp) && /sp-bodyb/.test(sp) && /sp-sidef/.test(sp),
    'the chip, the sheet and the filter must all exist');
  assert.ok(/function applySideFilter/.test(sp), 'a 106-row list needs a filter');
  const css = read('css/intmap.css');
  assert.ok(/#space-view \.sp-sidebox\{ display:contents; \}/.test(css),
    'the wrapper must be display:contents on a pointer machine so the desktop column is unchanged');
  assert.ok(!/flex-direction:row !important;[\s\S]{0,80}#space-view \.sp-side/.test(css),
    'the old horizontal strip rule must be gone');
});

/* ── ⑥ THE FROSTED GLASS SUPPRESSION IS GONE, AND MUST NOT COME BACK (#R229) ──────────────────────
   This test used to assert that js/glass-motion.js existed, was mobile-only and released on moveend.
   The module took the frosting off every panel while the camera moved. #R221 built it, #R225 widened
   its gate, and #R228 reported it as healthy — and NONE of those rounds asked whether it was wanted:

       「いやガラス抑止なんて余計なものつけてんじゃねーよ」
       「それって品質に影響しますか？」→ yes, it does. Frames during a gesture are frames.
       「外せ　良いわけないだろうが　なぜ確認しなかった　再発防止しろ」

   So the check is inverted. It is not «performance work needs a test», it is that this particular
   thing was never agreed to and is not to be reintroduced quietly. */
test('⑥ the gesture-time glass suppression is gone (#R229) and stays gone', () => {
  assert.ok(!existsSync(join(ROOT, 'js/glass-motion.js')), 'js/glass-motion.js must not exist');
  const css = read('css/intmap.css');
  assert.ok(!/body\.im-moving\s+\.im-glass\s*\{/.test(css),
    'no rule may strip backdrop-filter while the camera moves');
  /* ⚠ the SYNTAX, not the mention — the comments left behind name what they removed, on purpose */
  assert.doesNotMatch(read('js/label-occlusion.js'), /IntMapModules\.glassMotion\s*\(/, 'nothing mounts it');
  assert.doesNotMatch(read('src/main.js'), /import\s+['"][^'"]*glass-motion\.js['"]/, 'nothing imports it');
});

/* ── ⑦ THE FLIGHT SIMULATOR ON A PHONE ───────────────────────────────────────────────────── */
test('⑦ the rotate gate has nothing to confirm and pauses while it is up', () => {
  const fs = read('js/flight-sim.js');
  assert.ok(/#fs-gate/.test(fs), 'the gate must exist');
  const i = fs.indexOf('function _syncRotate()');
  assert.ok(i > 0);
  const body = fs.slice(i, i + 2000);
  assert.ok(/_portrait\(\)/.test(body), 'it must only appear in portrait');
  assert.ok(/paused\s*=\s*true/.test(body) || /_gatePaused\s*=\s*true/.test(body),
    'the aircraft must not fly unseen behind the gate');
  assert.ok(/_gatePaused/.test(body), 'the reader\'s OWN pause must be remembered, not overwritten');
  /* the escape hatch: a phone with rotation locked must not be a dead end */
  assert.ok(/fs-gate-x/.test(fs) && /_gateOff/.test(fs), 'there must be a way to continue upright');
});

test('⑦ the landscape deck does not cross the middle of the screen', () => {
  const fs = read('js/flight-sim.js');
  assert.ok(!/grid-template-columns:repeat\(8,50px\)/.test(fs),
    'an 8-wide row at 50 px is 435 px through the centre of a 844 px screen — that was the report');
  const i = fs.indexOf("@media(hover:none) and (orientation:landscape)");
  assert.ok(i > 0);
  const body = fs.slice(i, i + 2600);
  assert.ok(/grid-template-columns:repeat\(2,54px\)/.test(body), 'the deck must be a 2-column block on the left');
  assert.ok(/fs-acbadge\{left:calc\(186px/.test(body), 'the badge must be clamped and off the centre line');
});

/* ── ⑧ THE OCEAN-CURRENT DATA ────────────────────────────────────────────────────────────── */
test('⑧ the shipped current atlas is the rebuilt one, and says how it was made', () => {
  const doc = JSON.parse(read('data/ocean-currents.json'));
  assert.equal(doc.v, 2, 'v2 is the rebuilt file');
  assert.ok(doc.named.length >= 55, `only ${doc.named.length} named currents`);
  /* ⚠ (#R222) STRICTLY STRONGER THAN THE 20,000 ARROWS THIS REPLACED. The field is the source's own
     0.25° grid in a binary file now, so the number to check is how many cells of it carry flow —
     466,007 at the time of writing, sixteen times what the 1° arrow list held. */
  assert.ok(doc.field && doc.field.cells >= 100000, `only ${doc.field && doc.field.cells} field cells`);
  assert.equal(doc.gridDeg, 0.25, 'the source grid must be kept, not rounded to 1°');
  assert.ok(doc.epochs >= 20, 'a climatology needs many fields, not one season');
  /* the paths must be currents, not stubs: the old file had six-point 300 km fragments */
  const short = doc.named.filter((c) => (c.lengthKm || 0) < 500);
  assert.ok(short.length <= doc.named.length * 0.15,
    'too many stub paths: ' + short.map((c) => c.en + ' ' + c.lengthKm + 'km').join(', '));
  /* ⚠ A SHORT CLOSED PATH IS AN EDDY, A LONG ONE IS A GYRE. #R208's Kuroshio was a ring the tracer
     walked round, and the first rebuild shipped ten more of them (Brazil 741 km, Canary 914 km).
     The build now rejects a closed trace under 1,500 km and re-seeds; a closed trace LONGER than
     that is a real circulation (the Alaska Gyre, the Weddell Gyre) and must survive. */
  for (const c of doc.named) {
    const a = c.path[0], b = c.path[c.path.length - 1];
    const gap = Math.hypot((b[1] - a[1]) * 110.6, (b[0] - a[0]) * 111.3 * Math.cos(a[1] * Math.PI / 180));
    if (gap < 150) assert.ok((c.lengthKm || 0) >= 1500,
      `${c.en} closes after only ${c.lengthKm} km — that is an eddy, not a current`);
  }
});

test('⑧ warm/cold is measured against the sea at the same latitude', () => {
  const doc = JSON.parse(read('data/ocean-currents.json'));
  const by = Object.fromEntries(doc.named.map((c) => [c.en, c]));
  assert.ok(doc.sstEpochs > 0, 'the classification must have had a temperature field to measure');
  /* the four the flow-derived version got wrong, and the two it got right — all textbook */
  for (const n of ['Canary Current', 'California Current', 'Peru (Humboldt) Current', 'Benguela Current']) {
    assert.ok(by[n], n + ' missing');
    assert.equal(by[n].kind, 'cold', `${n} is a cold current (ΔT = ${by[n].sstAnomK} K)`);
    assert.equal(by[n].kindFrom, 'sst', n + ' must be classified from temperature, not from the flow');
  }
  for (const n of ['Gulf Stream', 'Kuroshio', 'Agulhas Current']) {
    assert.equal(by[n].kind, 'warm', `${n} is a warm current (ΔT = ${by[n].sstAnomK} K)`);
  }
});

test('⑧ the layer names its real sources, and the registry agrees', () => {
  const oc = read('js/ocean-currents.js');
  assert.ok(!/NASA\/JPL OSCAR's measured/.test(oc), 'the header must not still claim OSCAR');
  assert.ok(/Ralph & Niiler/.test(oc), 'the Ekman term must be attributed where the reader can see it');
  assert.ok(/OISST/.test(oc), 'the temperature source must be attributed');
  const rd = read('js/reference-data.js');
  assert.ok(/NOAA sea-surface currents, wind stress and temperature/.test(rd),
    'the source registry must carry the new entry');
  assert.ok(!/jplOscar\.html/.test(rd), 'the registry must not still point at the retired dataset');
});

/* ── ⑨ THE SCIENCE PAGE ──────────────────────────────────────────────────────────────────── */
test('⑨ equations are typeset, degrade to their source, and exist in every language', () => {
  const pi = read('js/page-i18n.js');
  assert.ok(/kind === 'tex'/.test(pi), "the ['tex', …] block type must exist");
  assert.ok(/data-tex/.test(pi), 'the LaTeX source must survive on the node so it can degrade to it');
  assert.ok(/throwOnError: false/.test(pi), 'one bad formula must not blank the page');
  assert.ok(/katex\/katex\.min\.js/.test(pi), 'the static page cannot import the bundle — it loads the copy');
  const vc = read('vite.config.js');
  assert.ok(/katexAssets\(\)/.test(vc) && /plugins: \[[^\]]*katexAssets\(\)/.test(vc),
    'katex/dist must be copied into the deploy, or the page has no renderer');

  for (const L of ['en', 'ja', 'de', 'ru', 'es']) {
    const src = read(`js/locales/pages.${L}.js`);
    const n = (src.match(/\['tex',/g) || []).length;
    assert.ok(n >= 20, `pages.${L}.js has only ${n} typeset equations`);
    assert.ok(src.includes("id: 'atmosphere'"), `pages.${L}.js has no atmosphere section`);
  }
});

test('⑨ every LaTeX string in the locale files is balanced', () => {
  for (const L of ['en', 'ja', 'de', 'ru', 'es']) {
    const src = read(`js/locales/pages.${L}.js`);
    for (const m of src.matchAll(/\['tex', '((?:[^'\\]|\\.)*)'\]/g)) {
      const tex = m[1];
      const open = (tex.match(/\\begin\{/g) || []).length, close = (tex.match(/\\end\{/g) || []).length;
      assert.equal(open, close, `unbalanced \\begin/\\end in ${L}: ${tex.slice(0, 60)}`);
      let depth = 0;
      for (let i = 0; i < tex.length; i++) {
        if (tex[i] === '\\') { i++; continue; }
        if (tex[i] === '{') depth++;
        if (tex[i] === '}') depth--;
        assert.ok(depth >= 0, `unbalanced braces in ${L}: ${tex.slice(0, 60)}`);
      }
      assert.equal(depth, 0, `unbalanced braces in ${L}: ${tex.slice(0, 60)}`);
    }
  }
});
