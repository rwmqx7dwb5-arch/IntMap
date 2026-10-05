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
      assert.ok(px <= at(BEFORE_CITY, zz) + 1e-9, `tier ${t} at z${zz} is ${px}, above the pre-#R198 city ${at(BEFORE_CITY, zz)}`);
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
