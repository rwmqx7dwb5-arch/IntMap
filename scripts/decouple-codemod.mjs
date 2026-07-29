#!/usr/bin/env node
/* ============================================================================
 *  IntMap · RENDERER-DECOUPLING CODEMOD  (#R178)
 * ----------------------------------------------------------------------------
 *  Rewrites raw renderer calls (`map.*`, `maplibregl.*`) into IntMapGeoEngine
 *  contract calls, by PARSING rather than by pattern-matching text: the sources
 *  are full of prose that mentions `map.` inside comments, and of member chains
 *  (`map.getSource(id).setData(x)`) whose meaning depends on what follows.
 *
 *  It only ever rewrites shapes it can prove are 1:1. Anything else is left
 *  alone and REPORTED, so the remainder is a short hand-editing list rather
 *  than a silent behaviour change. Run:
 *
 *      node scripts/decouple-codemod.mjs --list            (what would change)
 *      node scripts/decouple-codemod.mjs --write js/foo.js (do it, one file)
 *      node scripts/decouple-codemod.mjs --write --all
 *
 *  Kept in the repo rather than thrown away because the same table is the
 *  machine-readable statement of "which contract call replaces which renderer
 *  call", which is exactly what a second adapter (Cesium) has to satisfy.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..');

/* ── the table: renderer call → contract call, for the shapes that are 1:1 ─── */
const CALL = {
  // camera
  flyTo: 'camera.flyTo', easeTo: 'camera.easeTo', jumpTo: 'camera.jumpTo', fitBounds: 'camera.fitBounds',
  setPadding: 'camera.setPadding', getPadding: 'camera.getPadding', cameraForBounds: 'camera.forBounds',
  getZoom: 'camera.getZoom', getCenter: 'camera.getCenter', getBearing: 'camera.getBearing',
  getPitch: 'camera.getPitch', getBounds: 'camera.getBounds', setBearing: 'camera.setBearing',
  setPitch: 'camera.setPitch', getRoll: 'camera.getRoll', setRoll: 'camera.setRoll',
  getMaxPitch: 'camera.getMaxPitch', setMaxPitch: 'camera.setMaxPitch', getMinPitch: 'camera.getMinPitch',
  setMinZoom: 'camera.setMinZoom', getMinZoom: 'camera.getMinZoom', setMaxZoom: 'camera.setMaxZoom',
  getMaxZoom: 'camera.getMaxZoom', zoomTo: 'camera.zoomTo', zoomIn: 'camera.zoomIn', zoomOut: 'camera.zoomOut',
  stop: 'camera.stop', setCenter: 'camera.setCenter', panBy: 'camera.panBy', setMaxBounds: 'camera.setMaxBounds',
  setRenderWorldCopies: 'camera.setRenderWorldCopies', getProjection: 'camera.getProjection',
  setCenterClampedToGround: 'camera.setCenterClamped', calculateCameraOptionsFromTo: 'camera.fromTo',
  isEasing: 'camera.isAnimating',
  // layers & sources
  addLayer: 'layers.add', removeLayer: 'layers.remove', addSource: 'layers.addSource',
  removeSource: 'layers.removeSource', setPaintProperty: 'layers.setPaint', setLayoutProperty: 'layers.setLayout',
  getPaintProperty: 'layers.getPaint', getLayoutProperty: 'layers.getLayout', moveLayer: 'layers.move',
  setFilter: 'layers.setFilter', getFilter: 'layers.getFilter', setFeatureState: 'layers.setFeatureState',
  removeFeatureState: 'layers.removeFeatureState', getFeatureState: 'layers.getFeatureState',
  // scene
  getStyle: 'scene.getStyle', setLight: 'scene.setLight', setSky: 'scene.setSky', getSky: 'scene.getSky',
  setTerrain: 'scene.setTerrain', getTerrain: 'scene.getTerrain', addImage: 'scene.addImage',
  hasImage: 'scene.hasImage', removeImage: 'scene.removeImage',
  // render surface
  resize: 'render.resize', triggerRepaint: 'render.triggerRepaint', getCanvas: 'render.canvas',
  getContainer: 'render.container', getCanvasContainer: 'render.canvasContainer', isStyleLoaded: 'ready',
  // coordinates
  project: 'coords.project', unproject: 'coords.unproject', queryRenderedFeatures: 'coords.queryRenderedFeatures',
  queryTerrainElevation: 'coords.terrainElevation', querySourceFeatures: 'coords.querySourceFeatures',
};
/* events: the layer-scoped form takes THREE arguments and is a different contract call */
const EVENTS = { on: ['events.on', 'events.onLayer'], off: ['events.off', 'events.offLayer'], once: ['events.once', 'events.onceLayer'] };
/* the library namespace */
const GLOBAL_NEW = { Popup: 'ui.popup', Marker: 'ui.marker', Map: 'ui.createView', LngLat: 'coords.lngLat' };
const GLOBAL_CALL = { addProtocol: 'scene.addProtocol' };
/* handler objects → one named gesture call */
const GESTURES = new Set(['dragPan', 'dragRotate', 'scrollZoom', 'touchZoomRotate', 'keyboard', 'doubleClickZoom', 'boxZoom', 'touchPitch']);

const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const patNames = (pat, out) => {
  if (!pat) return;
  if (pat.type === 'Identifier') out.add(pat.name);
  else if (pat.type === 'ObjectPattern') pat.properties.forEach(p => patNames(p.value || p.argument, out));
  else if (pat.type === 'ArrayPattern') pat.elements.forEach(e => patNames(e, out));
  else if (pat.type === 'AssignmentPattern') patNames(pat.left, out);
  else if (pat.type === 'RestElement') patNames(pat.argument, out);
};

export function transform(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const edits = [];             // {start, end, text}
  const skipped = [];           // {line, why}
  const parent = new Map();
  (function link(n, p) {
    if (!n || typeof n.type !== 'string') return;
    parent.set(n, p);
    for (const k in n) { if (k === 'loc') continue; const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && link(c, n));
      else if (v && typeof v.type === 'string') link(v, n); }
  })(ast, null);

  /* which `map` is the renderer — same rule as scripts/engine-coupling.mjs */
  const shadowed = new Set();
  (function scopes(n, fnDepth) {
    if (!n || typeof n.type !== 'string') return;
    const isFn = FN.has(n.type);
    const d = fnDepth + (isFn ? 1 : 0);
    let hides = false;
    if (d >= 2 && (isFn || n.type === 'BlockStatement')) {
      const names = new Set();
      if (isFn) { n.params.forEach(p => patNames(p, names)); if (n.id) names.add(n.id.name); }
      const body = n.type === 'BlockStatement' ? n.body : (n.body && n.body.type === 'BlockStatement' ? n.body.body : null);
      if (Array.isArray(body)) body.forEach(st => {
        if (st.type === 'VariableDeclaration') st.declarations.forEach(x => patNames(x.id, names));
        if ((st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id) names.add(st.id.name);
      });
      hides = names.has('map');
    }
    if (hides) shadowed.add(n);
    for (const k in n) { if (k === 'loc') continue; const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && scopes(c, d));
      else if (v && typeof v.type === 'string') scopes(v, d); }
  })(ast, 0);
  const inShadow = node => { let p = node; while (p) { if (shadowed.has(p)) return true; p = parent.get(p); } return false; };
  const isMap = node => node && node.type === 'Identifier' && node.name === 'map' && !inShadow(node);
  const isMlg = node => node && node.type === 'Identifier' && node.name === 'maplibregl';

  const push = (start, end, text) => edits.push({ start, end, text });
  /* a member expression already consumed by a call-shaped rule must not also be reported as
     un-rewritten: the walk visits `map.getLayer` again on its way into `map.getLayer(id)` */
  const handled = new Set();
  const note = (node, why) => { if (!handled.has(node)) skipped.push({ line: node.loc.start.line, why }); };

  const visit = node => {
    if (!node || typeof node.type !== 'string') return;

    /* new maplibregl.X(...) → GE().ui.x(...) */
    if (node.type === 'NewExpression' && node.callee.type === 'MemberExpression' &&
        isMlg(node.callee.object) && node.callee.property.type === 'Identifier' &&
        GLOBAL_NEW[node.callee.property.name]) {
      /* …except the PRIMARY view. `map = new maplibregl.Map(…)` is the bootstrap: the engine is not
         built until that map fires 'load', so routing its own construction through the engine would
         be a circular reference at boot. That one line belongs to the adapter's file, not to a
         contract call. */
      const p = parent.get(node);
      const isPrimary = p && ((p.type === 'AssignmentExpression' && p.left.type === 'Identifier' && p.left.name === 'map') ||
                              (p.type === 'VariableDeclarator' && p.id.type === 'Identifier' && p.id.name === 'map'));
      if (isPrimary) note(node, 'primary map construction — belongs to the adapter');
      else { handled.add(node.callee); push(node.start, node.callee.end, `GE().${GLOBAL_NEW[node.callee.property.name]}`); }
    }
    /* maplibregl.addProtocol(...) */
    else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
             isMlg(node.callee.object) && node.callee.property.type === 'Identifier' &&
             GLOBAL_CALL[node.callee.property.name]) {
      handled.add(node.callee); push(node.callee.start, node.callee.end, `GE().${GLOBAL_CALL[node.callee.property.name]}`);
    }
    /* map.<gesture>.enable() / .disable() → GE().input.set('<gesture>', true|false) */
    else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
             node.callee.object.type === 'MemberExpression' && isMap(node.callee.object.object) &&
             node.callee.object.property.type === 'Identifier' && GESTURES.has(node.callee.object.property.name) &&
             node.callee.property.type === 'Identifier' && /^(enable|disable)$/.test(node.callee.property.name)) {
      const g = node.callee.object.property.name, on = node.callee.property.name === 'enable';
      handled.add(node.callee); handled.add(node.callee.object);
      push(node.start, node.end, `GE().input.set('${g}',${on})`);
    }
    /* map.scrollZoom.setZoomRate(x) / setWheelZoomRate(x) */
    else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
             node.callee.object.type === 'MemberExpression' && isMap(node.callee.object.object) &&
             node.callee.object.property.name === 'scrollZoom' && node.callee.property.type === 'Identifier' &&
             /^set(Wheel)?ZoomRate$/.test(node.callee.property.name)) {
      const wheel = node.callee.property.name === 'setWheelZoomRate';
      handled.add(node.callee); handled.add(node.callee.object);
      const arg = src.slice(node.arguments[0].start, node.arguments[0].end);
      push(node.start, node.end, `GE().input.setZoomRate(${arg}${wheel ? ',true' : ''})`);
    }
    /* map.transform.worldSize → GE().coords.worldSize() */
    else if (node.type === 'MemberExpression' && !node.computed && node.property.name === 'worldSize' &&
             node.object.type === 'MemberExpression' && isMap(node.object.object) && node.object.property.name === 'transform') {
      handled.add(node); handled.add(node.object); push(node.start, node.end, 'GE().coords.worldSize()');
    }
    /* map.getSource(id).setData(x)  /  .updateImage(x) */
    else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
             node.callee.object.type === 'CallExpression' && node.callee.object.callee.type === 'MemberExpression' &&
             isMap(node.callee.object.callee.object) && node.callee.object.callee.property.name === 'getSource' &&
             node.callee.property.type === 'Identifier' && /^(setData|updateImage)$/.test(node.callee.property.name)) {
      const id = src.slice(node.callee.object.arguments[0].start, node.callee.object.arguments[0].end);
      const arg = node.arguments.length ? src.slice(node.arguments[0].start, node.arguments[node.arguments.length - 1].end) : '';
      const fn = node.callee.property.name === 'setData' ? 'layers.setSourceData' : 'layers.updateImage';
      handled.add(node.callee); handled.add(node.callee.object.callee);
      push(node.start, node.end, `GE().${fn}(${id},${arg})`);
    }
    /* map.getLayer(id) / map.getSource(id) — the answer depends on what is done with it */
    else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
             isMap(node.callee.object) && node.callee.property.type === 'Identifier' &&
             /^(getLayer|getSource)$/.test(node.callee.property.name)) {
      const which = node.callee.property.name; handled.add(node.callee);
      /* IS THE VALUE ONLY BEING TESTED? `hasSource` answers a boolean and `getSource` answers an
         object, so the swap is only safe where the object itself is never used. Walking up through
         &&/||/!/parens is the difference between `if (map.getSource(id))` (safe) and
         `const s = map.getSource(id) || fallback()` (very much not). getLayer is safe either way —
         layers.get returns the layer, which is truthy exactly when it exists — so it falls back to
         the object form rather than being skipped. */
      const inTest = n => {
        let cur = n, p = parent.get(cur);
        while (p) {
          if (p.type === 'UnaryExpression' && p.operator === '!') return true;
          if ((p.type === 'IfStatement' || p.type === 'WhileStatement' || p.type === 'DoWhileStatement' ||
               p.type === 'ConditionalExpression') && p.test === cur) return true;
          if (p.type === 'ForStatement' && p.test === cur) return true;
          if (p.type === 'LogicalExpression') { cur = p; p = parent.get(cur); continue; }
          return false;
        }
        return false;
      };
      const boolish = inTest(node);
      if (boolish) push(node.callee.start, node.callee.end, `GE().layers.${which === 'getLayer' ? 'has' : 'hasSource'}`);
      else if (which === 'getLayer') push(node.callee.start, node.callee.end, 'GE().layers.get');
      else note(node, 'map.getSource() kept as a handle — rewrite by hand');
    }
    /* map.on / off / once — two-argument form vs the layer-scoped three-argument one */
    else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
             isMap(node.callee.object) && node.callee.property.type === 'Identifier' && EVENTS[node.callee.property.name]) {
      const [plain, scoped] = EVENTS[node.callee.property.name]; handled.add(node.callee);
      const n = node.arguments.length;
      if (n <= 2) push(node.callee.start, node.callee.end, `GE().${plain}`);
      else if (n === 3) push(node.callee.start, node.callee.end, `GE().${scoped}`);
      else note(node, `map.${node.callee.property.name}() with ${n} arguments`);
    }
    /* everything else in the table */
    else if (node.type === 'MemberExpression' && !node.computed && isMap(node.object) &&
             node.property.type === 'Identifier' && CALL[node.property.name]) {
      handled.add(node); push(node.start, node.end, `GE().${CALL[node.property.name]}`);
    }
    else if (node.type === 'MemberExpression' && isMap(node.object)) {
      const nm = node.computed ? '[computed]' : node.property.name;
      note(node, `map.${nm}`);
    }

    for (const k in node) { if (k === 'loc') continue; const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && visit(c));
      else if (v && typeof v.type === 'string') visit(v); }
  };
  visit(ast);

  /* apply back-to-front so offsets stay valid, dropping edits nested inside a bigger one */
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src, lastStart = Infinity, applied = 0;
  for (const e of edits) {
    if (e.end > lastStart) continue;              // contained in an edit already applied
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start; applied++;
  }
  return { code: out, applied, skipped };
}

/* the module-scope handle every rewritten file needs */
const GE_LINE = "  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */\n";
function ensureGE(code) {
  if (/const\s+GE\s*=\s*\(\)\s*=>\s*window\.IntMapGeoEngine/.test(code)) return code;
  /* insert straight after the module factory's opening line */
  const m = code.match(/window\.IntMapModules\.[A-Za-z0-9_$]+\s*=\s*function\s*\([^)]*\)\s*\{\r?\n/);
  if (m) return code.slice(0, m.index + m[0].length) + GE_LINE + code.slice(m.index + m[0].length);
  return code;
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const all = args.includes('--all');
  const files = all
    ? fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
    : args.filter(a => a.endsWith('.js'));
  if (!files.length) { console.error('usage: decouple-codemod.mjs [--write] <files…> | --all'); process.exit(2); }
  let totalApplied = 0;
  for (const rel of files) {
    const file = path.join(ROOT, rel);
    const src = fs.readFileSync(file, 'utf8');
    let r;
    try { r = transform(src); } catch (e) { console.error(`  PARSE ${rel}: ${e.message}`); continue; }
    if (!r.applied && !r.skipped.length) continue;
    const next = r.applied ? ensureGE(r.code) : r.code;
    console.log(`${rel}: rewrote ${r.applied}, left ${r.skipped.length}`);
    r.skipped.slice(0, 40).forEach(s => console.log(`    line ${s.line}: ${s.why}`));
    if (r.skipped.length > 40) console.log(`    …and ${r.skipped.length - 40} more`);
    totalApplied += r.applied;
    if (write) fs.writeFileSync(file, next);
  }
  console.log(`\n${write ? 'rewrote' : 'would rewrite'} ${totalApplied} call sites`);
}
main();
