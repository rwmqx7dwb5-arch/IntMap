/* ============================================================================
 *  R398 — the field's unit and the reader's unit are one declaration apart
 * ----------------------------------------------------------------------------
 *  「海面気圧レイヤーのカーソル読み出しが、自分の凡例と100倍食い違っている。」
 *
 *  MEASURED on the built page before the fix, one point, three instruments describing one picture:
 *
 *      IntMapECMWF.valueNow('pressure_msl', 35, -80)   101,458.75      ← the .om field, in PASCALS
 *      legend('pressure_msl')                          hPa · 940…1060  ← the SDK's own ramp
 *      the corner readout                              「101237 hPa」   ← the first in the second's unit
 *
 *  The readout was the visible half and the least of it. `getColor` — the function the SDK's tile
 *  worker paints every pixel through — returns the ramp's LAST colour for 100,000 Pa, for
 *  101,458.75 Pa and for 102,500 Pa alike, so the sea-level-pressure raster was a uniform red
 *  sheet; and the isobars are contoured at that ramp's breakpoints, so lines were sought at
 *  940…1060 in a field that runs 87,000…108,000 and 「等圧線」 drew nothing at all.
 *
 *  ⚠ THESE CHECKS DO NOT PIN NUMBERS, THEY PIN THE RELATION. Nothing here asserts that pressure is
 *  hPa or that the factor is 100 — a later round may add a second variable, or Open-Meteo may
 *  change what its files hold. What must stay true is that ONE declaration relates the two units
 *  and that every consumer is derived from it:
 *
 *      ① the declaration exists once, and no second file writes the factor down
 *      ② the renderer's ramp is the reader's ramp put through it, and nothing else
 *      ③ `scale()` / `legend()` answer from the READER's ramp
 *      ④ `sampler()` — and therefore valueNow / valueAt — divides by the same factor
 *      ⑤ the arithmetic, executed: ×per exactly, and the light/dark pair survives
 *      ⑥ the readout's NUMBER and the readout's UNIT come from one engine and one variable
 *      ⑦ the isobar label divides by the declaration rather than by a literal
 *      ⑧ an entry names a variable the app actually ships
 *
 *  ⑤ is the one that runs rather than reads: the declaration block is lifted out of
 *  js/wx-ecmwf.js and evaluated against a fake SDK, so the multiplication and the theme handling
 *  are checked as behaviour instead of as a regular expression.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const EC = read('js/wx-ecmwf.js');
const ECC = codeOnly(EC);
const WX = codeOnly(read('js/weather.js'));
const RO = codeOnly(read('js/map-readout.js'));

/* ── the declaration block, lifted out and made runnable ──────────────────────────────────────
   From `var FIELD_UNITS = {` to the end of `inFieldUnits`. It is in the file's SHARED prelude
   (above `function createModel`), which is why it can be sliced at all: it closes over nothing
   but `sdk`. */
function declarationBlock() {
  const from = ECC.indexOf('var FIELD_UNITS = {');
  const to = ECC.indexOf('function createModel(');
  assert.ok(from > 0, 'FIELD_UNITS is declared in js/wx-ecmwf.js');
  assert.ok(to > from, '…in the shared prelude, above the per-model body');
  return ECC.slice(from, to);
}
function evalDeclaration(sdk) {
  const ctx = vm.createContext({ sdk, JSON, String, Object });
  vm.runInContext(declarationBlock() + '\n;({FIELD_UNITS, fieldUnit, fieldPer, inFieldUnits});', ctx);
  return vm.runInContext('({FIELD_UNITS, fieldUnit, fieldPer, inFieldUnits})', ctx);
}
/* ⚠ an object built inside the VM has the VM realm's Array/Object prototypes, so
   `deepStrictEqual` refuses it however identical the contents are. Compared by value. */
const j = (x) => JSON.parse(JSON.stringify(x));

/* the shipped ECMWF layer table, parsed out of js/weather.js — the same source #R356's fixture
   check reads, so the two cannot drift apart */
function shippedLayers() {
  const out = [];
  const re = /\{id:'(ec-[a-z]+)',\s*variable:'([a-z0-9_]+)',\s*type:'([a-z]+)',\s*op:([0-9.]+),\s*kind:'([a-z]+)'/g;
  let m; while ((m = re.exec(WX))) out.push({ id: m[1], variable: m[2], type: m[3], kind: m[5] });
  assert.ok(out.length >= 8, 'the ECMWF layer table parsed');
  return out;
}

/* ── ① ONE DECLARATION, AND NOBODY ELSE WRITES THE FACTOR DOWN ───────────────────────────────── */
test('R398 ① the field↔reader unit relation is declared exactly once', () => {
  assert.equal((ECC.match(/var FIELD_UNITS = \{/g) || []).length, 1,
    'FIELD_UNITS is declared once in js/wx-ecmwf.js');
  const decl = declarationBlock();
  /* every unit STRING in this file belongs to that block — a second `'hPa'` anywhere else would be
     a second answer to 「what unit is this?」, which is how the four copies #R270 warns about start */
  const units = [...ECC.matchAll(/'(hPa|Pa|mbar|millibar)'/g)].map((m) => m.index);
  assert.ok(units.length > 0, 'the block names the two units');
  const from = ECC.indexOf(decl), to = from + decl.length;
  for (const i of units) assert.ok(i >= from && i < to,
    'no unit literal for this quantity lives outside the declaration');
  /* …and no consumer carries the number. js/weather.js reaches for `.per`; js/map-readout.js takes
     the unit off the legend. Neither may spell a conversion of its own. */
  assert.ok(!/pressure[^\n]{0,60}\/\s*100\b/.test(WX), 'js/weather.js writes no Pa→hPa division');
  assert.ok(!/\/\s*100\b/.test(RO.slice(RO.indexOf('function ecmwfReadout'), RO.indexOf('function updateLayerReadout'))),
    'js/map-readout.js writes none either');
});

/* ── ② THE RENDERER'S RAMP IS THE READER'S RAMP PUT THROUGH THE DECLARATION ──────────────────── */
test('R398 ② the two views of one ramp differ only by the declaration', () => {
  const s = ECC.slice(ECC.indexOf('function omSettings()'), ECC.indexOf('function viewBounds()'));
  assert.match(s, /displayScales = scales;/, 'the reader keeps the ramp untouched');
  assert.match(s, /var painted = Object\.assign\(\{\}, scales\);/,
    '…and the renderer starts from that very object');
  assert.match(s, /Object\.keys\(FIELD_UNITS\)\.forEach\(function \(v\) \{ var s = inFieldUnits\(v, scales\); if \(s\) painted\[v\] = s; \}\);/,
    '…and only the declared variables are rewritten, through the one conversion');
  assert.match(s, /colorScales: painted,/, 'the SDK is handed the renderer\'s copy');
  /* the reverse of the same statement: `settings.colorScales` must not be what the reader reads */
  assert.ok(!/displayScales = painted/.test(s), 'the two are never the same object');
});

/* ── ③ scale() / legend() ANSWER FROM THE READER'S RAMP ──────────────────────────────────────── */
test('R398 ③ the key speaks the unit the reader is shown', () => {
  const s = ECC.slice(ECC.indexOf('function scale(variable, dark)'), ECC.indexOf('function rgbaCss('));
  assert.match(s, /sdk\.getColorScale\(variable, !!dark, displayScales\)/,
    'scale() resolves against displayScales, not the renderer\'s copy');
  /* legend() is built on scale(), so its `unit` is the reader's by construction */
  const lg = ECC.slice(ECC.indexOf('function legend(variable, dark)'), ECC.indexOf('function legend(variable, dark)') + 900);
  assert.match(lg, /var s = scale\(variable, dark\);/, 'legend() reads scale()');
  assert.match(ECC, /return \{ unit: s\.unit \|\| '',/, '…and takes its unit from it');
});

/* ── ④ EVERY POINT VALUE LEAVES THROUGH ONE DIVISION ─────────────────────────────────────────── */
test('R398 ④ sampler() converts, so valueNow and valueAt cannot disagree with the key', () => {
  const s = ECC.slice(ECC.indexOf('function sampler(variable, i)'), ECC.indexOf('function valueNow('));
  assert.match(s, /var per = fieldPer\(variable\);/, 'the factor comes from the declaration');
  assert.match(s, /value: function \(lat, lon\) \{ var v = _lin\(g, d\.values, lat, lon\); return per === 1 \? v : v \/ per; \}/,
    'the scalar reading is converted');
  assert.match(s, /if \(per !== 1\) sp \/= per;/, '…and so is the speed the vector reading is built from');
  /* valueNow / valueAt must keep going through sampler rather than reaching for the frame */
  const vn = ECC.slice(ECC.indexOf('function valueNow('), ECC.indexOf('function valueNow(') + 400);
  assert.match(vn, /var s = sampler\(variable, i\);/, 'valueNow is sampler()');
  assert.match(ECC, /function valueAt\(variable, lat, lng, i\) \{\s*var v = valueNow\(/,
    'valueAt is valueNow()');
  assert.ok(!/_lin\(g, d\.values/.test(ECC.slice(ECC.indexOf('function valueNow('))),
    'nothing below sampler() reads the raw array again');
});

/* ── ⑤ THE ARITHMETIC, EXECUTED ──────────────────────────────────────────────────────────────── */
test('R398 ⑤ inFieldUnits multiplies by per exactly, and the light/dark pair survives', () => {
  const LIGHT = [[1, 1, 1, 1], [2, 2, 2, 1], [3, 3, 3, 1]];
  const DARK = [[9, 9, 9, 1], [8, 8, 8, 1], [7, 7, 7, 1]];
  const BP = [940, 1000, 1060];
  let asked = [];
  const sdk = {
    getColorScale(v, dark) {
      asked.push([v, dark]);
      return { type: 'breakpoint', unit: 'hPa', breakpoints: BP.slice(), colors: dark ? DARK : LIGHT };
    }
  };
  const D = evalDeclaration(sdk);
  const variable = Object.keys(D.FIELD_UNITS)[0];
  const per = D.FIELD_UNITS[variable].per;
  const out = D.inFieldUnits(variable, {});

  assert.deepEqual(j(asked.map((a) => a[1])), [false, true], 'BOTH themes are asked for');
  assert.equal(out.unit, D.FIELD_UNITS[variable].field, 'the renderer\'s copy names the FIELD\'s unit');
  assert.deepEqual(j(out.breakpoints), BP.map((b) => b * per), 'breakpoints are the reader\'s × per');
  /* the relation, not the number: dividing back must land on the reader's ramp EXACTLY */
  assert.deepEqual(j(out.breakpoints).map((b) => b / per), BP,
    'and the conversion is exact in both directions — a per that lost a bit would be caught here');
  assert.deepEqual(j(out.colors), { light: LIGHT, dark: DARK },
    'a ramp whose themes differ keeps both halves, so a dark reader is not shown the light colours');

  /* when the two themes agree the pair is pointless, and the flat array is what the SDK expects */
  const flat = evalDeclaration({
    getColorScale: () => ({ type: 'breakpoint', unit: 'hPa', breakpoints: BP.slice(), colors: LIGHT })
  });
  assert.deepEqual(j(flat.inFieldUnits(variable, {}).colors), LIGHT, 'one theme → one array');

  /* an `rgba` ramp has no breakpoints; its ends must travel the same way */
  const rgba = evalDeclaration({
    getColorScale: () => ({ type: 'rgba', unit: 'hPa', min: 940, max: 1060, colors: LIGHT })
  });
  const r = rgba.inFieldUnits(variable, {});
  assert.equal(r.min, 940 * per); assert.equal(r.max, 1060 * per);
  assert.ok(!('breakpoints' in r), 'and it gains no breakpoints it never had');

  /* ⚠ AND NOTHING ELSE IS TOUCHED. A variable with no entry must come back null rather than be
     rescaled by 1 — an accidental rewrite of a ramp that was already right is the failure this
     round is about, in the other direction. */
  assert.equal(D.inFieldUnits('temperature_2m', {}), null, 'an undeclared variable is left alone');
  assert.equal(D.fieldUnit('temperature_2m'), null);
  assert.equal(D.fieldPer('temperature_2m'), 1, 'and its factor is the identity');
  assert.equal(D.fieldPer(variable), per);
});

/* ── ⑥ THE NUMBER AND THE UNIT COME FROM ONE ENGINE AND ONE VARIABLE ─────────────────────────── */
test('R398 ⑥ the readout\'s value and the legend\'s unit go through the same conversion', () => {
  const s = RO.slice(RO.indexOf('function ecmwfReadout'), RO.indexOf('function updateLayerReadout'));
  /* ONE engine handle for both — #R376's rule, and the reason the two can never be in different
     units: `legend()` and `valueNow()` are the same module's two ends of one declaration. */
  assert.match(s, /const EC=ecFor\(cfg\); if\(!EC\) return null;/, 'one engine is resolved');
  assert.match(s, /const v=EC\.valueNow\(cfg\.variable,lat,lng\);/, 'the number comes from it');
  assert.match(s, /const lg=EC\.legend\(cfg\.variable,true\);/, '…and the unit from the same one');
  assert.match(s, /let out, unit=\(lg&&lg\.unit\)\|\|'';/, '…and that unit is what is printed');
  /* the raw branch must not invent a unit of its own */
  assert.match(s, /else \{ out=\(Math\.abs\(v\)>=100\?Math\.round\(v\):\(Math\.round\(v\*10\)\/10\)\)\+\(unit\?\(' '\+unit\):''\); \}/,
    'a `raw` variable prints the module\'s number with the module\'s unit and nothing else');
  /* both halves name the SAME variable — a mismatch here would print one field's number under
     another field's unit, which is the same defect one layer up */
  const pairs = [...s.matchAll(/EC\.(valueNow|legend)\((cfg\.variable)/g)].map((m) => m[2]);
  assert.deepEqual(pairs, ['cfg.variable', 'cfg.variable'], 'one variable, both ends');
});

/* ── ⑦ THE ISOBAR LABEL IS THE CONTOUR LEVEL, DIVIDED BY THE DECLARATION ─────────────────────── */
test('R398 ⑦ the isobar label is built from the declaration, not from a literal', () => {
  assert.match(WX, /let fu=null; try\{ fu=EC\(cfg\)\.fieldUnit&&EC\(cfg\)\.fieldUnit\(cfg\.variable\); \}catch\(_\)\{\}/,
    'the label asks the engine for the factor');
  assert.match(WX, /return fu \? \['to-string',\['round',\['\/',\['to-number',\['get','value'\],0\],fu\.per\]\]\] : \['get','value'\];/,
    '…divides the SDK\'s own contour value by it, and leaves an undeclared variable\'s label alone');
  assert.match(WX, /'text-field':_contourLabel\(cfg\)/, 'and the isobar symbol layer uses it');
  /* the level the SDK contours at is the breakpoint of the ramp it was GIVEN — the renderer's copy —
     so the label and the lines are the same declaration seen from two sides */
  assert.ok(!/'text-field':\['get','value'\]/.test(WX),
    'no contour layer still prints the raw level');
  /* `fieldUnit` is exported for exactly this caller */
  assert.match(ECC, /fieldUnit: fieldUnit,/, 'the engine publishes it');
});

/* ── ⑦b THE THREE THINGS AN ISOBAR NEEDS IN ORDER TO EXIST ───────────────────────────────────────
   The label conversion above is unobservable unless all three hold, and NONE of them did. Each is
   a separate measurement, recorded beside the assertion that keeps it: */
test('R398 ⑦b the isobar tile is asked for contours, and its label can be placed', () => {
  /* ① the SDK draws what the url asks for — a url with neither `arrows` nor `contours` produces a
     tile with no `contours` layer in it at all. MEASURED: 0 features plain, 900 with the flag. */
  assert.match(WX, /const _tileExtra=\(cfg\)=>cfg\.type==='arrows'\?'&arrows=true':cfg\.type==='isobars'\?'&contours=true':'';/,
    'each vector row asks the SDK for the thing it draws');
  assert.match(WX, /const url=omUrl\(cfg,_tileExtra\(cfg\)\);/, 'and the source is built from that');
  assert.ok(!/omUrl\(cfg,cfg\.type==='arrows'\?'&arrows=true':''\)/.test(WX),
    'the isobars are no longer silently sent the bare url');
  /* ② a font the style's glyph endpoint actually serves. Every other symbol layer in this app names
     one; this was the only one that did not. */
  const lbl = WX.slice(WX.indexOf('if(!GE().layers.has(lbl))'), WX.indexOf('} else if(cfg.type===\'arrows\')'));
  assert.match(lbl, /'text-font':\['literal',\['Noto Sans Regular'\]\]/, 'the label names a real font');
  /* ③ point placement. MEASURED on the live contour source: 'line' and 'line-center' place ZERO
     labels on these geometries at any tile_size, 'point' places them. */
  assert.match(lbl, /'symbol-placement':'point'/, 'and a placement MapLibre can honour here');
});

/* ── ⑧ AN ENTRY NAMES A VARIABLE THE APP SHIPS ───────────────────────────────────────────────── */
test('R398 ⑧ every declared variable is one the app actually draws', () => {
  const D = evalDeclaration({ getColorScale: () => null });
  const shipped = new Set(shippedLayers().map((l) => l.variable));
  for (const v of Object.keys(D.FIELD_UNITS)) {
    assert.ok(shipped.has(v),
      `${v} is declared as needing a conversion but no layer reads it — a rule with no subject`);
  }
  /* …and the layers that DO read a declared variable are the ones whose pictures the conversion
     repairs: the raster is painted from it and the isobars are contoured at it */
  const users = shippedLayers().filter((l) => D.FIELD_UNITS[l.variable]);
  assert.ok(users.some((l) => l.type === 'raster'), 'a raster reads it');
  assert.ok(users.some((l) => l.type === 'isobars'), 'and so does a contour layer');
});
