/* (city-label-size) 「Google earthみたいに、都市の規模に応じて、地名ラベルの大きさも変わる仕組みにして。」 — a settlement's name is
 * drawn on one of four steps of its class's curve, chosen from the tiles' own rank and capital marks.
 * The ladder is EVALUATED (js/label-scale.js run in a context), and the tier rule is evaluated against features shaped
 * like the ones measured on the live tiles, so neither can drift from what it claims. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const loadScale = () => { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(read('js/label-scale.js'), ctx); return ctx.window.IntMapLabelScale; };

/* the pre-#R198 city curve — tests/labels-stack-and-scale-checks.test.mjs ①c's BEFORE.city */
const BEFORE_CITY = [[4, 11], [10, 15]];
const at = (s, z) => { if (z <= s[0][0]) return s[0][1]; if (z >= s[s.length - 1][0]) return s[s.length - 1][1];
  for (let i = 1; i < s.length; i++) { const [a, b] = s[i - 1], [c, d] = s[i]; if (z <= c) return b + (d - b) * ((z - a) / (c - a)); } return s[s.length - 1][1]; };

test('city-label-size ① every step stays under the place reference and under the pre-#R198 city size; steps strictly decrease', () => {
  const LS = loadScale();
  assert.equal(LS.TIER_K.length, 4);
  for (let i = 1; i < LS.TIER_K.length; i++) assert.ok(LS.TIER_K[i] < LS.TIER_K[i - 1], 'a bigger place is never drawn smaller');
  for (let z = 3; z <= 22; z += 0.1) {
    const zz = Math.round(z * 10) / 10;
    for (let t = 0; t < 4; t++) {
      const px = LS.placeTierAt('city', t, zz);
      assert.ok(px <= LS.refAt(zz) + 1e-9, `tier ${t} at z${zz} is ${px}, above the place reference ${LS.refAt(zz)}`);
      /* the pre-#R198 ceiling binds up to z10; past it the curve grows on purpose (city-label-grow, 2026-11-18) */
      if (zz <= 10) assert.ok(px <= at(BEFORE_CITY, zz) + 1e-9, `tier ${t} at z${zz} is ${px}, above the pre-#R198 city ${at(BEFORE_CITY, zz)}`);
      if (t) assert.ok(px < LS.placeTierAt('city', t - 1, zz), `tier ${t} is not smaller than tier ${t - 1} at z${zz}`);
    }
    /* where the facility names are drawn (js/place-labels.js ofm-poi: minzoom 12, sub(0.86)), the smallest town still out-sizes them */
    if (zz >= 12) assert.ok(LS.placeTierAt('city', 3, zz) > LS.subAt(zz, 0.86), `the smallest city step fell under a POI label at z${zz}`);
  }
});

test('city-label-size ② the expression keeps zoom outermost (#R73) and each stop is a step over the tier', () => {
  const LS = loadScale();
  const e = LS.placeTiered('city', ['get', 'tier']);
  assert.equal(JSON.stringify(e.slice(0, 3)), JSON.stringify(['interpolate', ['linear'], ['zoom']]));
  for (let i = 3; i < e.length; i += 2) {
    const out = e[i + 1];
    assert.equal(out[0], 'step');
    assert.ok(!JSON.stringify(out).includes('"zoom"'), 'zoom must appear only at the top');
  }
  /* the stop outputs are exactly placeTierAt at the stops */
  const z0 = e[3], st = e[4];
  assert.equal(st[2], LS.placeTierAt('city', 0, z0));
  assert.equal(st[st.length - 1], LS.placeTierAt('city', 3, z0));
});

/* a tiny evaluator for the expression operators CITY_TIER uses — enough to run the rule on feature-shaped objects */
function evalExpr(e, p) {
  if (!Array.isArray(e)) return e;
  const [op, ...a] = e; const v = (x) => evalExpr(x, p);
  switch (op) {
    case 'get': return p[a[0]] === undefined ? null : p[a[0]];
    case 'to-number': { const x = v(a[0]); return x == null ? 0 : Number(x); }
    case 'coalesce': { for (const x of a) { const r = v(x); if (r != null) return r; } return null; }
    case 'any': return a.some((x) => v(x));
    case '==': return v(a[0]) === v(a[1]);
    case '<=': return v(a[0]) <= v(a[1]);
    case '+': return a.reduce((s, x) => s + v(x), 0);
    case '*': return a.reduce((s, x) => s * v(x), 1);
    case 'case': { for (let i = 0; i + 1 < a.length; i += 2) if (v(a[i])) return v(a[i + 1]); return v(a[a.length - 1]); }
    default: throw new Error('operator not covered: ' + op);
  }
}

test('city-label-size ③ ofm-city sizes and orders by the tiles\' own rank and capital — measured features land on the right step', () => {
  const src = read('js/place-labels.js');
  const tierSrc = /const CITY_RANK=(\[[^;\n]*\]);[^\n]*\n\s*const CITY_TIER=(\[[\s\S]*?\]);\n/.exec(src);
  assert.ok(tierSrc, 'js/place-labels.js declares CITY_RANK and CITY_TIER');
  const CITY_RANK = JSON.parse(tierSrc[1].replace(/'/g, '"'));
  const CITY_TIER = JSON.parse(tierSrc[2].replace(/'/g, '"').replace(/CITY_RANK/g, JSON.stringify(CITY_RANK)));
  /* rank/capital/class as read off the live OpenFreeMap tiles on 2026-10-05 */
  const tierOf = (p) => evalExpr(CITY_TIER, p);
  assert.equal(tierOf({ class: 'city', rank: 1, capital: 2 }), 0, 'Tokyo');
  assert.equal(tierOf({ class: 'city', rank: 2 }), 0, 'Osaka');
  assert.equal(tierOf({ class: 'city', rank: 3, capital: 2 }), 0, 'Pyongyang — a national capital');
  assert.equal(tierOf({ class: 'city', rank: 3, capital: 4 }), 1, 'Hiroshima');
  assert.equal(tierOf({ class: 'city', rank: 5, capital: 4 }), 2, 'Fukuoka / Kyoto / Nagano');
  assert.equal(tierOf({ class: 'city', rank: 6 }), 2, 'Kobe');
  assert.equal(tierOf({ class: 'city' }), 2, 'a city the source does not rank is an ordinary city');
  assert.equal(tierOf({ class: 'city', rank: 9 }), 3, 'a city the source ranks low');
  assert.equal(tierOf({ class: 'town', rank: 6, capital: 4 }), 3, 'Hagåtña — a town');
  /* and the layer uses it for both the size and the collision order */
  const layer = /GE\(\)\.layers\.add\(\{id:'ofm-city'[^\n]*/.exec(src)[0];
  assert.match(layer, /'text-size':LS\.placeTiered\('city',CITY_TIER\)/);
  assert.match(layer, /'symbol-sort-key':\['\+',\['\*',CITY_TIER,100\],CITY_RANK\]/);
});


/* ══ (city-label-grow / city-label-gate / city-label-dot) 2026-11-18 ═══════════════════════════════════════════ */
test('city-label-grow ① every city step grows with zoom (never shrinks) and keeps growing past z10 up to z17', () => {
  const LS = loadScale();
  for (let t = 0; t < 4; t++) {
    let prev = -1;
    for (let z = 3; z <= 22; z += 0.25) {
      const px = LS.placeTierAt('city', t, z);
      assert.ok(px >= prev - 1e-9, `tier ${t} shrank at z${z}: ${px} < ${prev}`);
      prev = px;
    }
    assert.ok(LS.placeTierAt('city', t, 17) > LS.placeTierAt('city', t, 10) + 3, `tier ${t} must still be growing after z10`);
    assert.equal(LS.placeTierAt('city', t, 22), LS.placeTierAt('city', t, 17), 'flat only past z17');
  }
  const top = LS.placeTierAt('city', 0, 16);
  assert.ok(top >= 19 && top <= 22, `the top tier reads about 20-22 px at z16, got ${top}`);
  /* the low end is unchanged: this request moved nothing at continent and region level */
  assert.equal(LS.placeAt('city', 3), 9.5);
  assert.equal(LS.placeAt('city', 10), 13);
});

test('city-label-gate ② the rank gate is declared in integer stops, never falls with zoom, and opens fully by z7', () => {
  const src = read('js/place-labels.js');
  const m = /const CITY_GATE_STOPS=(\[\[[^;]*\]\]);/.exec(src), o = /const CITY_GATE_OPEN_Z=(\d+);/.exec(src);
  assert.ok(m && o, 'js/place-labels.js declares CITY_GATE_STOPS and CITY_GATE_OPEN_Z');
  const stops = JSON.parse(m[1]), open = +o[1];
  for (const [z] of stops) assert.ok(Number.isInteger(z), 'a filter re-reads [zoom] at integer zooms only');
  for (let i = 1; i < stops.length; i++) {
    assert.ok(stops[i][0] > stops[i - 1][0], 'stops are ordered by zoom');
    assert.ok(stops[i][1] >= stops[i - 1][1], `the gate must not cut MORE at z${stops[i][0]} than at z${stops[i - 1][0]}`);
  }
  assert.ok(stops[stops.length - 1][0] < open && open <= 7, 'fully open from z7 — the regional view is not thinned');
  assert.equal(stops[0][0], 3, 'the gate begins where the layer does (minzoom 3)');
  /* both the name and its dot read the SAME filter, so a dot never outlives its name's gate */
  assert.match(src, /id:'ofm-city',type:'symbol'[^\n]*filter:CITY_FILTER/);
  assert.match(src, /id:'ofm-city-dot',type:'circle'[^\n]*filter:CITY_FILTER/);
});

test('city-label-dot ③ the dot layer shares the name layer source, scales with the name, and the label is padded off it', () => {
  const src = read('js/place-labels.js');
  const dot = /GE\(\)\.layers\.add\(\{id:'ofm-city-dot'[\s\S]*?\}\}\);/.exec(src);
  assert.ok(dot, 'ofm-city-dot is added');
  assert.match(dot[0], /source:'ofm','source-layer':'place'/);
  assert.match(dot[0], /'circle-radius':LS\.placeTiered\('city',CITY_TIER,CITY_DOT_EM\)/);
  assert.match(src, /'text-radial-offset':CITY_LABEL_OFFSET_EM/);
  const em = (n) => +new RegExp(n + '=([0-9.]+)').exec(src)[1];
  assert.ok(em('CITY_LABEL_OFFSET_EM') > em('CITY_DOT_EM') + 0.2, 'the label starts clear of the dot plus its ring stroke');
  assert.match(src, /setLayout\('ofm-city-dot','visibility'/);
  /* the multiplier makes the dot radius grow with zoom the same way the name does */
  const LS = loadScale(), r = LS.placeTiered('city', ['get', 'tier'], 0.27);
  assert.ok(r[r.length - 1][2] > r[4][2], 'the radius at the last stop is bigger than at the first');
});
