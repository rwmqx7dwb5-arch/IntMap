/* ============================================================================
 *  IntMap · build — the Atlas kernel gets each capability WITHOUT its `run`   (startup-weight)
 * ----------------------------------------------------------------------------
 *  js/atlas-caps-modules.js (generated) imports the 25 js/atlas-cap-<namespace>.js files into the Atlas
 *  kernel. Everything the first question needs from them is DATA about each capability — its row,
 *  schema, catalogue text, phrases, policy, chips — while `run`, what it does, is needed only when the
 *  model calls it. This plugin makes the bundle say that, without splitting a single source file:
 *
 *   · in js/atlas-caps-modules.js each `./atlas-cap-x.js` becomes `./atlas-cap-x.js?atlas-cap-meta`;
 *   · that id is the same source with every entry's `run` replaced by a call through the door
 *     (js/atlas-caps.js `makeCapRunDoor`) — the helpers only a `run` read are then dead code and the
 *     bundler drops them, so the copy carries the entries' data and little else;
 *   · the door reaches the modules themselves (with their real `run`) through ONE `import()` of a
 *     virtual module that imports all of them: the chunk `atlas-cap-runs`, which arrives the first time
 *     any capability runs (why one and not one per namespace: the note at capRunsModule).
 *  The namespaces are read off js/atlas-caps-modules.js itself (discovered, not listed here): a 26th
 *  namespace written by `node scripts/atlas-caps.mjs --write` is split with no edit to this file.
 *
 *  ⚠ A COPY AND ITS MODULE ARE TWO INSTANCES, so the build REFUSES a capability module whose top level
 *  could hold state the two would disagree about — a `let`/`var`, or any statement that runs (an
 *  expression, a loop, an assignment to window). Measured when this was written: all 25 have only
 *  imports, `const` / function declarations and the default export. A module that needs state keeps it
 *  in a module it imports (both instances import the same one), which is where it belongs anyway.
 *  ⚠ An entry whose id (row column 0) is not a literal string is refused: the door pairs a copy's entry
 *  with its module's entry by that id.
 *  Applied to `vite build` AND to the dev server, so `npm run dev` runs the same split production ships.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as acorn from 'acorn';

export const META_QUERY = '?atlas-cap-meta';
/* ⚠ NOT `\0`-prefixed: vite.config.js's `maplibre-gl` group claims every `\0` module outside node_modules as a bundler
   helper (and its dependencies with it) — measured: the door and all 25 modules landed in the boot chunks (eager raw
   4.71 → 5.73 MB). These are app modules, so they carry an ordinary name the groups do not match (and resolveId claims
   both before any package lookup). */
const VIRTUAL = 'atlas-cap-door';
const RUNS_ALL = 'atlas-cap-runs';   /* the chunk is named after it */
const slash = (p) => p.split('\\').join('/');
const CAPS_MODULES_RE = /[\\/]js[\\/]atlas-caps-modules\.js$/;
const CAP_FILE_RE = /[\\/]js[\\/](atlas-cap-[a-z0-9-]+\.js)\?atlas-cap-meta$/;

/** namespace ↔ file, read off the generated aggregator's own import lines and its CAPABILITY_MODULES map */
export function capNamespaces(aggregatorSource) {
  const files = Object.create(null), out = Object.create(null);
  for (const m of aggregatorSource.matchAll(/^import\s+(\w+)\s+from\s+'\.\/(atlas-cap-[a-z0-9-]+\.js)';/gm)) files[m[1]] = m[2];
  for (const m of aggregatorSource.matchAll(/^\s*"([a-z0-9-]+)":\s*(\w+),?\s*$/gm)) if (files[m[2]]) out[m[1]] = files[m[2]];
  if (!Object.keys(out).length) throw new Error('atlas-caps-split: js/atlas-caps-modules.js names no capability module — the aggregator changed shape; re-derive capNamespaces');
  return out;   /* { ns: 'atlas-cap-ns.js' } */
}

/** the aggregator, pointed at the copies */
export function capsModulesForKernel(aggregatorSource) {
  let n = 0;
  const out = aggregatorSource.replace(/^(import\s+\w+\s+from\s+'\.\/atlas-cap-[a-z0-9-]+\.js)(';)/gm, (_, a, b) => { n++; return a + META_QUERY + b; });
  if (!n) throw new Error('atlas-caps-split: no capability import was rewritten in js/atlas-caps-modules.js');
  return out;
}

/** a capability module's source with every entry's `run` replaced by a call through the door */
export function capMetaSource(src, ns, file) {
  const where = file || ('the ' + ns + ' module');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const n of ast.body) {
    const ok = n.type === 'ImportDeclaration' || n.type === 'ExportDefaultDeclaration' || n.type === 'FunctionDeclaration'
      || (n.type === 'VariableDeclaration' && n.kind === 'const')
      || (n.type === 'ExportNamedDeclaration' && (!n.declaration || n.declaration.type === 'FunctionDeclaration' || (n.declaration.type === 'VariableDeclaration' && n.declaration.kind === 'const')));
    if (!ok) throw new Error('atlas-caps-split: ' + where + ' has a top-level ' + n.type + (n.kind ? ' (' + n.kind + ')' : '') + ' — the kernel\'s copy and the module would be two instances of it (see scripts/atlas-caps-split.mjs)');
  }
  const def = ast.body.find((n) => n.type === 'ExportDefaultDeclaration');
  if (!def || def.declaration.type !== 'ArrayExpression') throw new Error('atlas-caps-split: ' + where + ' does not export its entries as an array literal');
  const edits = [];
  for (const el of def.declaration.elements) {
    if (!el || el.type !== 'ObjectExpression') throw new Error('atlas-caps-split: ' + where + ' has an entry that is not an object literal');
    const row = el.properties.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === 'row');
    const id = row && row.value.type === 'ArrayExpression' && row.value.elements[0] && row.value.elements[0].type === 'Literal' ? row.value.elements[0].value : null;
    if (typeof id !== 'string' || !id) throw new Error('atlas-caps-split: an entry in ' + where + ' has no literal id in row[0]');
    const run = el.properties.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === 'run');
    if (!run) continue;   /* js/atlas-caps.js refuses an entry with no run; that is its message to give, not this one's */
    edits.push([run.start, run.end, 'run(...__a) { return __capRuns.run(' + JSON.stringify(ns) + ', ' + JSON.stringify(id) + ', __a); }']);
  }
  /* ⚠ A COPY IMPORTS COPIES. Capability modules import from each other (atlas-cap-map takes droneRun from
     atlas-cap-routing, atlas-cap-notebook takes queryEngine from atlas-cap-data …). Left as they are, those
     imports pull the REAL module — run bodies and all — into the kernel: measured, the four imported ones
     (data, sim, routing, places: 296 kB) rode along in a chunk the kernel loads statically, and the first
     opening of Atlas shrank by 12 % instead of by the run code. A copy's sibling is the sibling's copy; the
     real modules import each other unchanged, so a `run` still reaches the real function. */
  for (const n of ast.body) {
    const s = (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) ? n.source : null;
    if (s && /^\.\/atlas-cap-[a-z0-9-]+\.js$/.test(s.value)) edits.push([s.start, s.end, JSON.stringify(s.value + META_QUERY)]);
  }
  let out = src;
  for (const [a, b, s] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + s + out.slice(b);
  return 'import { __capRuns } from ' + JSON.stringify(VIRTUAL) + ';\n' + out;
}

/** the door's loaders. ⚠ ONE chunk for all the namespaces, not one each: measured (vite build, this branch) with one
    literal import() per namespace, the 25 chunks made the bundler stop folding two eager modules into the entry chunk —
    js/chronos.js and js/map-state.js became chunks of their own (eager.requests 9 → 11), because atlas-cap-time and the
    map-document chunks imported them without importing the entry. All 25 behind one import() is one chunk that reads
    the entry like the kernel does, and the boot path is back to 9 requests. */
export function capRunsModule(namespaces, jsDir) {
  const lines = Object.keys(namespaces).map((ns) => '  ' + JSON.stringify(ns) + ': () => all().then((m) => ({ default: m.modules[' + JSON.stringify(ns) + '] })),');
  return ['import { makeCapRunDoor } from ' + JSON.stringify(slash(resolve(jsDir, 'atlas-caps.js'))) + ';',
    'const all = () => import(' + JSON.stringify(RUNS_ALL) + ');',
    'export const __capRuns = makeCapRunDoor({', ...lines, '});', ''].join('\n');
}
/** the one module that imports every namespace with its real `run` */
export function capRunsAllModule(namespaces, jsDir) {
  const ent = Object.entries(namespaces);
  return [...ent.map(([, f], i) => 'import m' + i + ' from ' + JSON.stringify(slash(resolve(jsDir, f))) + ';'),
    'export const modules = {', ...ent.map(([ns], i) => '  ' + JSON.stringify(ns) + ': m' + i + ','), '};', ''].join('\n');
}

/** ⚠ ANY OTHER MODULE THAT IMPORTS A CAPABILITY MODULE GETS THE COPY TOO. Measured: js/atlas-console.js took
    `shareApi` from js/atlas-cap-panel.js (atlas-cited-answers), and that one import put the whole real panel module —
    every `run` — back into the kernel. A named export of the copy is the same code as the module's (only the entries'
    `run` differs, and that still reaches the real function through the door), so serving the copy changes nothing a
    caller can see. Only the capability modules themselves (their sibling imports, unchanged) and `atlas-cap-runs`
    read the real ones. The importer is not listed: every module under js/ and src/ is asked. */
export function importsToCopies(src, capFiles) {
  if (!src.includes('atlas-cap-')) return null;
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }); } catch (_) { return null; }
  const edits = [];
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    const s = (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) ? n.source
      : (n.type === 'ImportExpression' && n.source.type === 'Literal') ? n.source : null;
    if (s && typeof s.value === 'string') {
      const m = /(?:^|\/)(atlas-cap-[a-z0-9-]+\.js)$/.exec(s.value);
      if (m && capFiles.has(m[1])) edits.push([s.start, s.end, JSON.stringify(s.value + META_QUERY)]);
    }
    for (const k in n) { const v = n[k]; if (k !== 'parent' && v && typeof v === 'object') (Array.isArray(v) ? v.forEach(visit) : visit(v)); }
  };
  visit(ast);
  if (!edits.length) return null;
  let out = src;
  for (const [a, b, s] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + s + out.slice(b);
  return out;
}

export function atlasCapsSplit(root) {
  const jsDir = resolve(root, 'js');
  const namespaces = () => capNamespaces(readFileSync(resolve(jsDir, 'atlas-caps-modules.js'), 'utf8'));
  return {
    name: 'intmap-atlas-caps-split',
    enforce: 'pre',
    resolveId(id) { return id === VIRTUAL || id === RUNS_ALL ? id : null; },
    /* the copy is LOADED here (read from the file the query names) rather than transformed after a
       generic load, so no other loader has to understand the query */
    load(id) {
      if (id === VIRTUAL) return capRunsModule(namespaces(), jsDir);
      if (id === RUNS_ALL) return capRunsAllModule(namespaces(), jsDir);
      const m = CAP_FILE_RE.exec(id);
      if (!m) return null;
      const ns = Object.entries(namespaces()).find(([, f]) => f === m[1]);
      if (!ns) throw new Error('atlas-caps-split: ' + m[1] + ' is not a namespace of js/atlas-caps-modules.js');
      return { code: capMetaSource(readFileSync(resolve(jsDir, m[1]), 'utf8'), ns[0], 'js/' + m[1]), map: null };
    },
    transform(code, id) {
      if (CAPS_MODULES_RE.test(id)) return { code: capsModulesForKernel(code), map: null };
      if (id.includes('?') || id.includes('node_modules') || !/\.(m?js)$/.test(id)) return null;
      const p = slash(id);
      if (!/\/(js|src)\//.test(p)) return null;
      const files = new Set(Object.values(namespaces()));
      const base = p.slice(p.lastIndexOf('/') + 1);
      if (files.has(base) && /\/js\//.test(p)) return null;   /* a real capability module keeps its real siblings */
      const out = importsToCopies(code, files);
      return out == null ? null : { code: out, map: null };
    },
  };
}
