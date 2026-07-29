#!/usr/bin/env node
/* ============================================================================
 *  IntMap · RENDERER-COUPLING GATE  (#R178)
 * ----------------------------------------------------------------------------
 *  「MapLibre依存脱却作業を完了させて。将来的にはCesiumに移行予定。」
 *
 *  IntMapGeoEngine (#R152 → #R177) is a real adapter seam with a declared
 *  CESIUM_CONTRACT, but the seam only means anything for the files that go
 *  THROUGH it. This counts the ones that do not — every reference to the raw
 *  MapLibre `Map` handle (`map.*`, `window.__imap.*`) and to the `maplibregl`
 *  global — by parsing, not by grepping: a regex over the sources reports 103
 *  "APIs" including `When`, `It`, `The` and `I`, because prose in comments says
 *  things like "…the map. When the style…". The AST says 2,003 real references.
 *
 *  Two modes:
 *    node scripts/engine-coupling.mjs            → the report (never fails)
 *    node scripts/engine-coupling.mjs --gate     → fails if a file that has
 *                                                  been decoupled regressed
 *
 *  The gate is a RATCHET, not a wall: `DECOUPLED` below lists the files that
 *  are done, and CI fails if any of them grows a raw reference again. Files not
 *  yet listed are reported but tolerated, so the migration can land in batches
 *  without turning the build red in between.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..');
const JS_DIR = path.join(ROOT, 'js');

/* THE ONE FILE ALLOWED TO NAME THE RENDERER. Everything else in js/ goes through
   window.IntMapGeoEngine, and the gate fails if that stops being true — the whole
   list is the ratchet, so a new file is decoupled by default rather than by
   remembering to add it here. (#R178 took this from 2,037 references across 31
   files to 0; the exemption is the adapter itself, which of course says
   `new maplibregl.Popup` — that is what an adapter IS.) */
export const ENGINE_FILE = 'geo-engine.js';

/* ── (#R179) THE VALUE-REFERENCE BUDGET — a ratchet that can only tighten ────────────────────
   The member-access count above must stay at 0 and does. The number BELOW it was invisible until
   this round: 327 places outside the adapter that hold or test the renderer without touching a
   property, which no amount of "0 references" makes go away. They are what is left of the job,
   and they are not all the same kind of work:

     · TESTED  (`if(map)`, `typeof maplibregl!=='undefined'`) — mechanical: ask GE().hasRenderer().
     · HELD    (`.addTo(map)`, `setupMaplibre(maplibregl)`, and above all the module contract
                itself, `window.IntMapModules.x(map, HOST)`, which hands every module the raw
                handle whether it wants one or not) — each needs somewhere in the contract to go.

   #R179 closed the ones that BLOCKED a second engine: all three additional views (compare 106,
   playground 8, flight-sim 5 raw calls) now go through ui.createSubView, markers and popups
   attach to a view rather than to a handle, and contour tiles come from scene.demContourSource
   instead of handing maplibre-contour the library by name. The budget is the measurement after
   that, so the number can only come down from here — raising it is a deliberate act with a
   failing build in between. */
export const VALUE_BUDGET = 324;

/* ── (#R179) …AND THE HANDLE UNDER ANOTHER NAME ──────────────────────────────────────────────
   The other hole, and the one that actually mattered: this scan only recognises the renderer as
   `map`, `__imap` or `maplibregl`. An additional view was handed the raw Map by ui.createView and
   then kept as `cmap`, `gmap`, `minimap` — 106, 8 and 5 raw calls, every one of them invisible to
   both counts above. Widening the name list would be guesswork; closing it at the SOURCE is not.
   There is exactly one legitimate reason to hold the renderer's own handle: constructing the
   PRIMARY view, which is the object the engine itself is bound to. Every other view goes through
   ui.createSubView and gets the contract instead. So: createView may be called once, from
   app-body.js, and a second caller fails the build. */
export const PRIMARY_VIEW_FILE = 'app-body.js';

/* The identifiers that ARE the renderer. `map` is how every module receives it
   (window.IntMapModules.x = function(map, HOST){…}); `__imap` is the global the
   app publishes for tooling; `maplibregl` is the library namespace. */
const RAW_OBJECTS = new Set(['map', 'maplibregl']);

/* ── WHICH `map` IS THIS? ────────────────────────────────────────────────────
   Three files hold plain data structures called `map` — `C.map[f.id]` in
   layer-packs, `b.map[cd]` in stats-compare, a local `map` of ticker→series in
   companies — and a name-only scan reports them as renderer coupling. So resolve
   the identifier: a reference counts only when nothing between it and the module
   factory's own `(map, HOST)` parameter re-declares the name. Without this the
   gate would demand "fixes" to code that has never touched a renderer. */
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const collectPatternNames = (pat, out) => {
  if (!pat) return;
  switch (pat.type) {
    case 'Identifier': out.add(pat.name); break;
    case 'ObjectPattern': pat.properties.forEach(p => collectPatternNames(p.value || p.argument, out)); break;
    case 'ArrayPattern': pat.elements.forEach(e => collectPatternNames(e, out)); break;
    case 'AssignmentPattern': collectPatternNames(pat.left, out); break;
    case 'RestElement': collectPatternNames(pat.argument, out); break;
  }
};

export function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (e) {
    return { file: path.relative(ROOT, file).replace(/\\/g, '/'), error: String(e && e.message || e), hits: [] };
  }
  const hits = [], values = [], views = [];
  /* depth 0 = the module factory's parameter, i.e. the renderer itself */
  let shadowDepth = 0;
  const record = (node, prop) => hits.push({ prop, line: node.loc.start.line });

  const isRawObject = node => {
    if (!node) return false;
    if (node.type === 'Identifier') {
      if (node.name === 'maplibregl') return true;
      return node.name === 'map' && shadowDepth === 0;
    }
    if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier' &&
        node.property.name === '__imap') return true;
    return false;
  };

  const declaresMap = node => {
    const names = new Set();
    if (FN.has(node.type)) {
      node.params.forEach(p => collectPatternNames(p, names));
      if (node.id) names.add(node.id.name);
    }
    /* hoisted `var` / function declarations and lexical declarations in a body */
    const body = node.type === 'BlockStatement' ? node.body : (node.body && node.body.type === 'BlockStatement' ? node.body.body : null);
    if (Array.isArray(body)) {
      body.forEach(st => {
        if (st.type === 'VariableDeclaration') st.declarations.forEach(d => collectPatternNames(d.id, names));
        if (st.type === 'FunctionDeclaration' && st.id) names.add(st.id.name);
        if (st.type === 'ClassDeclaration' && st.id) names.add(st.id.name);
      });
    }
    return names.has('map');
  };

  /* HOW the renderer reaches a file, both shapes, and both are at function depth 1:
       window.IntMapModules.x = function(map, HOST){ … }     ← a parameter
       window.addEventListener('DOMContentLoaded', () => { let map; … })   ← app-body.js
     So a `map` bound at depth ≤ 1 IS the renderer; anything deeper is somebody's
     local (companies.js builds a ticker→series object called `map`). */
  let fnDepth = 0;
  const visit = (node, parent, key) => {
    if (!node || typeof node.type !== 'string') return;
    const isFn = FN.has(node.type);
    if (isFn) fnDepth++;
    const shadows = fnDepth >= 2 && (isFn || node.type === 'BlockStatement') && declaresMap(node);
    if (shadows) shadowDepth++;
    if (node.type === 'MemberExpression' && isRawObject(node.object)) {
      if (node.computed && node.property.type !== 'Literal') record(node, '[computed]');
      else record(node, node.property.type === 'Identifier' ? node.property.name : String(node.property.value));
    }
    /* ── (#R179) THE RENDERER AS A VALUE ─────────────────────────────────────────────────────
       The count above is member access, and #R178 shipped it reading 0 while 327 references were
       sitting in plain sight — because they never touch a property. `if(map)`, `typeof
       maplibregl!=='undefined'`, `.addTo(map)`, `setupMaplibre(maplibregl)`, and the module
       contract itself (`window.IntMapModules.x(map, HOST)`) are all the renderer being HELD or
       TESTED, and an engine swap has to answer for every one of them. So they are counted, and
       reported separately: a handle passed to something is a different (harder) problem from an
       existence test, and the two want different fixes.
       Property positions are excluded or `arr.map(...)` swamps the number — measured, 605 of the
       first attempt's 932 "references" were Array.prototype.map. That is #R178's own lesson about
       regexes lying, arrived at from the other direction: an AST lies too if you ask it the wrong
       question. */
    if (isRawObject(node) && node.type === 'Identifier' && parent) {
      const asObject = parent.type === 'MemberExpression' && key === 'object';
      const isProp = parent.type === 'MemberExpression' && key === 'property' && !parent.computed;
      const isKey = parent.type === 'Property' && key === 'key' && !parent.computed;
      const isDecl = (parent.type === 'VariableDeclarator' && key === 'id') ||
                     (FN.has(parent.type) && key === 'params') ||
                     (parent.type === 'AssignmentExpression' && key === 'left');
      if (!asObject && !isProp && !isKey && !isDecl) {
        values.push({ name: node.name, line: node.loc.start.line,
                      kind: parent.type === 'CallExpression' || parent.type === 'NewExpression' ? 'held'
                          : /Binary|Unary|Logical|IfStatement|Conditional/.test(parent.type) ? 'tested'
                          : 'other' });
      }
    }
    /* (#R179) …and every call that ASKS FOR the raw handle — see PRIMARY_VIEW_FILE */
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
        !node.callee.computed && node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'createView') {
      views.push({ line: node.loc.start.line });
    }
    for (const k in node) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && visit(c, node, k));
      else if (v && typeof v.type === 'string') visit(v, node, k);
    }
    if (shadows) shadowDepth--;
    if (isFn) fnDepth--;
  };
  visit(ast, null, null);
  return { file: path.relative(ROOT, file).replace(/\\/g, '/'), hits, values, views };
}

export function scanAll() {
  const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort().map(f => path.join(JS_DIR, f));
  return files.map(scanFile);
}

function main() {
  const gate = process.argv.includes('--gate');
  const results = scanAll();
  const parseErrors = results.filter(r => r.error);
  const withHits = results.filter(r => r.hits.length).sort((a, b) => b.hits.length - a.hits.length);
  const total = results.reduce((n, r) => n + r.hits.length, 0);
  const apis = new Map();
  withHits.forEach(r => r.hits.forEach(h => apis.set(h.prop, (apis.get(h.prop) || 0) + 1)));

  const offenders = withHits.filter(r => path.basename(r.file) !== ENGINE_FILE);
  /* (#R179) the second, larger number — see the block in scanFile */
  const outside = results.filter(r => path.basename(r.file) !== ENGINE_FILE);
  const valueTotal = outside.reduce((n, r) => n + (r.values || []).length, 0);
  const kinds = new Map();
  outside.forEach(r => (r.values || []).forEach(v => kinds.set(v.kind, (kinds.get(v.kind) || 0) + 1)));
  const valueFiles = outside.filter(r => (r.values || []).length)
    .sort((a, b) => b.values.length - a.values.length);
  console.log(`IntMap renderer-coupling — ${results.length} files in js/`);
  console.log(`  raw renderer references: ${total}   distinct APIs: ${apis.size}`);
  console.log(`  files naming the renderer outside js/${ENGINE_FILE}: ${offenders.length}`);
  console.log(`  the renderer held or tested as a VALUE, outside the adapter: ${valueTotal}` +
              (kinds.size ? `  (${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', ')})` : '') +
              `   budget ${VALUE_BUDGET}`);
  if (valueFiles.length) console.log('    ' + valueFiles.slice(0, 10)
    .map(r => `${path.basename(r.file)}:${r.values.length}`).join('  ') +
    (valueFiles.length > 10 ? `  …+${valueFiles.length - 10} files` : ''));
  console.log('');
  withHits.forEach(r => console.log(`  ${String(r.hits.length).padStart(5)}  ${r.file}${path.basename(r.file) === ENGINE_FILE ? '   (the adapter — expected)' : ''}`));
  console.log('\n  API histogram:');
  console.log('  ' + [...apis.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));

  if (parseErrors.length) {
    parseErrors.forEach(r => console.error(`  PARSE ERROR ${r.file}: ${r.error}`));
    process.exit(1);
  }
  if (!gate) return;

  if (offenders.length) {
    console.error(`\n✗ only js/${ENGINE_FILE} may name the renderer; these reach for it directly:`);
    offenders.forEach(r => {
      console.error(`  ${r.file}`);
      r.hits.slice(0, 12).forEach(h => console.error(`      line ${h.line}: .${h.prop}`));
      if (r.hits.length > 12) console.error(`      …and ${r.hits.length - 12} more`);
    });
    console.error('\n  Use the contract instead: const GE=()=>window.IntMapGeoEngine;');
    console.error('  scripts/decouple-codemod.mjs holds the renderer-call → contract-call table.');
    process.exit(1);
  }
  if (!results.some(r => path.basename(r.file) === ENGINE_FILE)) {
    console.error(`\n✗ js/${ENGINE_FILE} is missing — the renderer seam is gone`);
    process.exit(1);
  }
  /* (#R179) who asks for the RAW handle — see PRIMARY_VIEW_FILE */
  const viewCallers = outside.filter(r => (r.views || []).length);
  const strayViews = viewCallers.filter(r => path.basename(r.file) !== PRIMARY_VIEW_FILE);
  const primaryViews = viewCallers.filter(r => path.basename(r.file) === PRIMARY_VIEW_FILE)
    .reduce((n, r) => n + r.views.length, 0);
  if (strayViews.length || primaryViews > 1) {
    console.error(`\n✗ ui.createView() hands back the renderer's OWN handle, and only the primary view` +
                  ` may hold one (js/${PRIMARY_VIEW_FILE}, once).`);
    console.error('  An additional view must use ui.createSubView(), which returns the same contract scoped');
    console.error('  to it — otherwise the handle lives on under a local name and no count above can see it');
    console.error('  (#R179 found 106 such calls in compare.js alone, with the gate reading 0).');
    strayViews.forEach(r => r.views.forEach(v => console.error(`  ${r.file}:${v.line}`)));
    if (primaryViews > 1) console.error(`  js/${PRIMARY_VIEW_FILE} calls it ${primaryViews} times; expected 1`);
    process.exit(1);
  }
  if (valueTotal > VALUE_BUDGET) {
    console.error(`\n✗ the renderer is held or tested as a value in ${valueTotal} places outside the adapter,` +
                  ` and the budget is ${VALUE_BUDGET}.`);
    console.error('  These are the references the member-access count cannot see (#R179). Either route the');
    console.error('  new one through the contract, or lower VALUE_BUDGET in this file deliberately —');
    console.error('  it is a ratchet, so it is only ever meant to go down.');
    valueFiles.slice(0, 8).forEach(r => {
      console.error(`  ${r.file}`);
      r.values.slice(0, 4).forEach(v => console.error(`      line ${v.line}: ${v.name} (${v.kind})`));
      if (r.values.length > 4) console.error(`      …and ${r.values.length - 4} more`);
    });
    process.exit(1);
  }
  console.log('\n✓ renderer-coupling gate PASSED — the renderer is named in one file' +
              `, and held or tested as a value in ${valueTotal} (budget ${VALUE_BUDGET})`);
}

/* run as a script, importable as a module (tests/r178-checks.test.mjs re-uses scanAll) */
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('engine-coupling.mjs')) main();
