/* ============================================================================
 *  IntMap · #R248 source checks
 * ----------------------------------------------------------------------------
 *  ① the fourteenth translation shape — a language→POSITION map written as a ternary chain — is
 *     forbidden by SYNTAX, and the instrument that forbids it is shown to fire on the code it was
 *     written for (#R228: a check that has never failed is not a check);
 *  ② the far seismic raster covers the FIELD, not the planet, and the fine image's box is snapped
 *     onto THAT grid — the property that makes the two rasters tile (#R245);
 *  ③ the Objects panel closes on a map click and its band is the short one.
 *
 *  ⚠ Every assertion below reads the source with COMMENTS STRIPPED where it matches on text —
 *  [[intmap-recurring-lessons]] E has caught eight rounds writing a check that trips on its own
 *  explanation of the defect.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments off, strings kept — the only safe way to grep this repository's own source */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const CODES = new Set(['en', 'jp', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']);
function indexChains(src) {
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); }
  const intish = (x) => x && x.type === 'Literal' && typeof x.value === 'number' && Number.isInteger(x.value);
  const langTest = (x) => x && x.type === 'BinaryExpression' && (x.operator === '===' || x.operator === '==')
    && [x.left, x.right].some((s) => s.type === 'Literal' && typeof s.value === 'string' && CODES.has(s.value));
  const out = [];
  walk.simple(ast, {
    ConditionalExpression(n) {
      if (!langTest(n.test) || !intish(n.consequent)) return;
      const a = n.alternate;
      if (!(a && a.type === 'ConditionalExpression' && langTest(a.test) && intish(a.consequent))) return;
      out.push(n.loc.start.line);
    },
  });
  return out;
}

test('#R248 ① no reader turns a language into an array position with a ternary chain', () => {
  const bad = [];
  (function walkDir(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { walkDir(join(dir, e.name), rel + e.name + '/'); continue; }
      if (!e.name.endsWith('.js')) continue;
      const p = rel + e.name;
      if (/locales\//.test(p)) continue;
      const lines = indexChains(readFileSync(join(dir, e.name), 'utf8'));
      if (lines.length) bad.push(`${p}:${[...new Set(lines)].join(',')}`);
    }
  })(JS, 'js/');
  assert.deepEqual(bad, [], 'a language→index ternary chain never reaches the registry, so every '
    + 'language past its last arm reads English with NO inline-table fallback — use pick().arr(tuple)');
});

test('#R248 ① …and that test FIRES on the shape it was written for (#R228)', () => {
  /* A check that has never failed is not a check (#R180 / #R200 / #R228). This is the exact reader
     js/drone-nav.js held four copies of before this round, and three innocent neighbours that must
     NOT be reported — a single language ternary with numeric arms is an offset, not a table. */
  const defect = "const specLabel=(f)=>f.lbl[HOST.lang==='jp'?1:HOST.lang==='de'?2:HOST.lang==='ru'?3:HOST.lang==='es'?4:0];";
  assert.ok(indexChains(defect).length > 0, 'the fourteenth-shape detector must fire on the shape');
  assert.equal(indexChains("const pad=(lang==='jp'?2:0);").length, 0, 'one ternary is an offset, not a language table');
  assert.equal(indexChains("const w=lang==='jp'?'A':'B';").length, 0, 'string arms are the two-branch audit\'s subject');
  /* ⚠ ONE hit, not two: the detector reports the OUTERMOST node of a chain (the inner ternary's own
     alternate is the integer `0`, not another ternary), so a chain is one finding however long it
     is. And it fires on any expression compared against a language code — the variable's name is
     not part of the test, deliberately: `HOST.lang`, `L()`, `lang` and `cur` are all the same
     defect, and a name list is the maintenance surface this family of instruments exists to remove. */
  assert.equal(indexChains("const n=cols==='jp'?1:rows==='de'?2:0;").length, 1,
    'a chain is ONE finding, and the name being compared is not part of the test');
});

test('#R248 ① the pair codemod refuses to file a matcher as UI, and refuses a non-translation slot', () => {
  const s = code(read('scripts/i18n-pair-codemod.mjs'));
  assert.match(s, /parent\.elements\[0\] === n/, 'element 0 of a coordinate-bearing row is a match-term list, not a tuple');
  assert.match(s, /LETTER\.test/, 'a slot with no letter of any alphabet (🇺🇸, #6b6b6b) is not a translation');
  assert.match(s, /if \(JA\.test\(el\[0\]\.value\) \|\| !isProse\(el\[0\]\.value\)\) return;/,
    'the tuple has to start at slot 0 in the registry\'s own order, or LA() would relabel the slots');
});

test('#R248 ① every LA( reference resolves to a binding IN SCOPE, not merely earlier in the file', () => {
  /* ⚠ THE ONE DEFECT THIS ROUND SHIPPED TO THE BROWSER AND NO NODE CHECK SAW. The codemod picked the
     nearest pickArgs binding BY POSITION; js/layer-packs.js has four sibling IIFEs and the fourth got
     a name from a sibling, so `ReferenceError: LA is not defined` killed the religion/language pack
     at module evaluation while all 1,180 checks stayed green ([[intmap-recurring-lessons]] L). This
     is that check, written once so it covers every file rather than the one that broke. */
  const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'Program']);
  const bad = [];
  (function walkDir(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { walkDir(join(dir, e.name), rel + e.name + '/'); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = readFileSync(join(dir, e.name), 'utf8');
      let ast;
      try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
      catch { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); } catch { continue; } }
      const scopes = new Map();
      const declare = (node, name, anc, from) => {
        for (let i = anc.length - from; i >= 0; i--) {
          if (FN.has(anc[i].type)) { if (!scopes.has(anc[i])) scopes.set(anc[i], new Set()); scopes.get(anc[i]).add(name); return; }
        }
      };
      walk.ancestor(ast, {
        VariableDeclarator(n, _s, anc) { if (n.id.type === 'Identifier') declare(n, n.id.name, anc, 1); },
        FunctionDeclaration(n, _s, anc) { if (n.id) declare(n, n.id.name, anc, 2); },
      });
      walk.ancestor(ast, {
        CallExpression(n, _s, anc) {
          const c = n.callee;
          const name = c.type === 'Identifier' ? c.name
            : (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' ? c.object.name : null);
          if (name !== 'LA') return;
          for (let i = anc.length - 1; i >= 0; i--) {
            const a = anc[i];
            if (!FN.has(a.type)) continue;
            if (a.params && a.params.some((p) => p.type === 'Identifier' && p.name === name)) return;
            const s = scopes.get(a);
            if (s && s.has(name)) return;
          }
          bad.push(`${rel}${e.name}:${n.loc.start.line}`);
        },
      });
    }
  })(JS, 'js/');
  assert.deepEqual(bad, [], 'an LA() whose binding lives in a SIBLING scope throws at module '
    + 'evaluation and takes the whole file down — declare one at the top of the scope that uses it');
});

test('#R248 ② the far raster is sized to the field, and the fine box snaps onto THAT grid', () => {
  const s = code(read('js/seismic.js'));
  /* ⚠ (#R249) UPDATED, AND WHY. This asserted `farWindow(C0,rKm)` — the signature, not the
     property. #R249 hands the function a THIRD argument (the fine field's cell) because #R248's
     window fixed the far raster's EXTENT and left a 2.24× step at the seam, which is the number the
     reader was actually reporting. The property #R248 was protecting — the window is the FIELD's,
     never the planet's — is unchanged and still asserted below; only the arity moved.
     ⚠ The cell EXPRESSION also moved (it is now `min(budget, wanted)` then bounded by a cell count,
     then the 4·NF guard), so the assertion is on the guard that #R248 owns rather than on the whole
     line. tests/r249-checks ① pins the new half. */
  assert.match(s, /function farWindow\(C0,\s*rKm,\s*wantCellKm\)/, 'the far raster has a window');
  /* square in Mercator = square on the ground; both sides capped so a wrapped field cannot ask for
     a canvas that cannot exist */
  assert.match(s, /Math\.max\(cell,\s*sx\/\(4\*NF\),\s*sy\/\(4\*NF\)\)/,
    'the cell is square and neither side may exceed 4·FAR_N');
  /* the cap's true longitude reach, not the linear approximation that under-reads it */
  assert.match(s, /Math\.asin\(s\)\/D/, 'max Δλ of a spherical cap is asin(sin ρ / cos φ₀)');
  /* #R191's two failures stay avoided */
  assert.match(s, /if\(!full&&\(C0\[0\]-dLng<-180\|\|C0\[0\]\+dLng>180\)\) full=true;/,
    'a window that would cross ±180 keeps the whole world in x');
  /* the snap reads the window, never 360/FAR_N */
  assert.match(s, /const _fdx=farWin\.dx, _fy0=farWin\.y0, _fdy=farWin\.dy/, 'the box snaps onto the window grid');
  assert.doesNotMatch(s, /_fdx=360\/_fN/, 'the old whole-world snap must be gone or the two rasters stop tiling');
  /* the far loop may only wrap when the window IS the world */
  assert.match(s, /const i=wrap\?\(\(\(s%NX\)\+NX\)%NX\):s;/, 'a sub-window clamps its band, it does not wind it round');
  /* an empty annulus is not encoded */
  assert.match(s, /if\(!painted\)\{ _revoke\(fldFar&&fldFar\.url\); fldFar=null; paintFar\(\); return; \}/,
    'a fully transparent PNG is pure cost');
  /* the snap is reported as a NUMBER so a regression is measurable, not a matter of looking */
  assert.match(s, /snapCols:.*snapRows:/, 'the snap is reported in stats');
});

test('#R248 ③ the Objects panel closes on a map click, with a listener whose life is the panel\'s', () => {
  const s = code(read('js/map-tools.js'));
  assert.match(s, /function _bindMapClose\(\)/, 'the map-click closer exists');
  assert.match(s, /GE\(\)\.events\.off\('click',_mapCloser\); GE\(\)\.events\.on\('click',_mapCloser\);/,
    'bind exactly once — an off before every on is what stops a second listener accumulating');
  assert.match(s, /function open\(\)\{[^}]*_bindMapClose\(\);/, 'bound when the panel opens');
  assert.match(s, /function close\(\)\{[^}]*_unbindMapClose\(\);/,
    'and removed when it closes — a listener that outlives what it guards fires for every later map click (#R245)');
});

test('#R248 ③ the Objects panel band is the short one, and it is sized where CSS cannot lose', () => {
  const s = read('js/map-tools.js');
  assert.match(s, /class="iol-head" style="[^"]*padding:4px 11px/, 'the band’s own padding is 4 px');
  assert.doesNotMatch(code(s), /class="iol-head" style="[^"]*padding:9px 12px/, 'the 9 px band is gone');
  assert.match(s, /#iol-panel \.iol-head button\{line-height:1;padding:0;\}/,
    'the ✕ and 全消去 must stop setting the band’s height');
});
