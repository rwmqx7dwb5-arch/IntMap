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

/* Files whose raw-handle count has reached zero. Adding a name here is a promise
   that it stays there; the gate enforces it. */
export const DECOUPLED = new Set([]);

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
  const hits = [];
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
  const visit = node => {
    if (!node || typeof node.type !== 'string') return;
    const isFn = FN.has(node.type);
    if (isFn) fnDepth++;
    const shadows = fnDepth >= 2 && (isFn || node.type === 'BlockStatement') && declaresMap(node);
    if (shadows) shadowDepth++;
    if (node.type === 'MemberExpression' && isRawObject(node.object)) {
      if (node.computed && node.property.type !== 'Literal') record(node, '[computed]');
      else record(node, node.property.type === 'Identifier' ? node.property.name : String(node.property.value));
    }
    for (const k in node) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && visit(c));
      else if (v && typeof v.type === 'string') visit(v);
    }
    if (shadows) shadowDepth--;
    if (isFn) fnDepth--;
  };
  visit(ast);
  return { file: path.relative(ROOT, file).replace(/\\/g, '/'), hits };
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

  console.log(`IntMap renderer-coupling — ${results.length} files in js/`);
  console.log(`  raw renderer references: ${total}   files still coupled: ${withHits.length}   distinct APIs: ${apis.size}`);
  console.log(`  decoupled so far: ${DECOUPLED.size} file(s)\n`);
  withHits.forEach(r => console.log(`  ${String(r.hits.length).padStart(5)}  ${r.file}`));
  console.log('\n  API histogram:');
  console.log('  ' + [...apis.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));

  if (parseErrors.length) {
    parseErrors.forEach(r => console.error(`  PARSE ERROR ${r.file}: ${r.error}`));
    process.exit(1);
  }
  if (!gate) return;

  const regressed = withHits.filter(r => DECOUPLED.has(path.basename(r.file)));
  if (regressed.length) {
    console.error('\n✗ these files were decoupled and have grown raw renderer references again:');
    regressed.forEach(r => {
      console.error(`  ${r.file}`);
      r.hits.slice(0, 12).forEach(h => console.error(`      line ${h.line}: .${h.prop}`));
    });
    process.exit(1);
  }
  const missing = [...DECOUPLED].filter(n => !results.some(r => path.basename(r.file) === n));
  if (missing.length) {
    console.error(`\n✗ DECOUPLED names no file: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('\n✓ renderer-coupling gate PASSED');
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/')) || process.argv[1].endsWith('engine-coupling.mjs')) main();
