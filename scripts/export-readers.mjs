/* ============================================================================
 *  IntMap · which exports of js/ have a reader, derived ONCE  (#R795)
 * ----------------------------------------------------------------------------
 *  tests/r175-checks ③ used to ask two questions of every js/ module:
 *    (a) "does it have an UNEXPORTED top-level declaration?"  — forbidden
 *    (b) "is every export imported BY NAME from another js/ file?" — else dead
 *
 *  (a) was the Vite migration's tripwire: a classic script's top-level `const` was a window global
 *  that another file could read bare, and a module's is not. Every js/ file has been a module for
 *  six hundred rounds; the hazard the rule guarded is not "a top-level declaration exists" but
 *  "some file reads a bare name that resolves to nothing" — and THAT is what
 *  scripts/check-split-scope.mjs measures directly, with a scope-resolving parser, for every free
 *  identifier of every js/ file. The ban had become a rule about SHAPE (measured cost: gis-core /
 *  gis-runtime importing each other so that each export had "a reader"; `everyTick.pending` as a
 *  function property because a module-scope Map was forbidden; whole assemblers wrapped in one
 *  closure so that they were one binding). So (a) is gone and (b) is kept — but as the property it
 *  always meant: an export nobody reaches is dead code, and a reader is anything in this repository
 *  that reaches it by name, not only a js/ sibling. A test that imports an entry point IS a usage
 *  path: that is exactly what a headless entry (js/gis-runtime.js) is for.
 *
 *  WHAT COUNTS AS REACHING A NAME (all of them, so a rename that leaves a reader behind fails):
 *    1. a static named import         `import { name } from '…'`, `import { a as b }`
 *    2. a namespace import + member   `import * as NS from '…'`  then  `NS.name`
 *    3. a dynamic import + member     `(await import('…')).name`, `import('…').then(m => m.name)`,
 *                                     or any `mod.name` where `mod` was awaited from an import()
 *  Readers are every source file under js/, src/, scripts/ and tests/. A reader inside the SAME
 *  file does not count — an export only its own module uses is an ordinary private function that
 *  was exported by mistake, and that is the thing this check exists to say.
 *
 *      node scripts/export-readers.mjs        prints the dead exports and exits 1 if any
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const DEFAULT_ROOT = join(HERE, '..');
export const READER_DIRS = ['js', 'src', 'scripts', 'tests'];

function listFiles(dir, out) {
  let names = [];
  try { names = readdirSync(dir); } catch (_) { return out; }
  for (const n of names) {
    const p = join(dir, n);
    let st; try { st = statSync(p); } catch (_) { continue; }
    if (st.isDirectory()) { if (n !== 'node_modules') listFiles(p, out); }
    else if (/\.(mjs|js|cjs)$/.test(n)) out.push(p);
  }
  return out;
}

/** The named exports of one js/ module, via the parser (an `export { a, b }` list included). */
export function namedExports(src) {
  const out = [];
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const n of ast.body) {
    if (n.type !== 'ExportNamedDeclaration') continue;
    if (n.declaration) {
      const d = n.declaration;
      if (d.id) out.push(d.id.name);
      else (d.declarations || []).forEach((x) => collect(x.id, out));
    }
    for (const s of n.specifiers || []) out.push(s.exported.name || s.exported.value);
  }
  return out;
}
function collect(p, out) {
  if (!p) return;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach((x) => collect(x.value || x.argument, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach((e) => collect(e, out));
  else if (p.type === 'AssignmentPattern') collect(p.left, out);
  else if (p.type === 'RestElement') collect(p.argument, out);
}

/** Every name a reader file reaches through an import, by the three forms above. */
export function reachedNames(src) {
  const names = new Set();
  /* 1 — static named imports, any relative or bare specifier, either quote */
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const part of m[1].split(',')) {
      const nm = part.trim().split(/\s+as\s+/)[0].trim();
      if (nm) names.add(nm);
    }
  }
  /* 2 — namespace imports: `import * as NS` then `NS.x` */
  const ns = new Set();
  for (const m of src.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from/g)) ns.add(m[1]);
  /* 3 — dynamic imports: the awaited/thenned module object, then `.x` on it */
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+import\s*\(/g)) ns.add(m[1]);
  for (const m of src.matchAll(/import\s*\([^)]*\)\s*\)?\s*\.then\s*\(\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g)) ns.add(m[1]);
  for (const m of src.matchAll(/\(\s*await\s+import\s*\([^)]*\)\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bimport\s*\([^)]*\)\s*\.\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  /* destructured module objects: `const { a, b } = await import(…)` and `.then(({ a }) =>` */
  for (const m of src.matchAll(/\{([^}]*)\}\s*=\s*await\s+import\s*\(/g)) for (const p of m[1].split(',')) { const nm = p.trim().split(/\s*:\s*/)[0].trim(); if (nm) names.add(nm); }
  for (const m of src.matchAll(/\.then\s*\(\s*\(\s*\{([^}]*)\}\s*\)\s*=>/g)) for (const p of m[1].split(',')) { const nm = p.trim().split(/\s*:\s*/)[0].trim(); if (nm) names.add(nm); }
  /* every regex metacharacter, not only `$` — an identifier cannot carry most of them, but a partial
     escape is right until the day it is not (CodeQL js/incomplete-sanitization) */
  const rx = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const v of ns) for (const m of src.matchAll(new RegExp('(?<![\\w$.])' + rx(v) + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)', 'g'))) names.add(m[1]);
  return names;
}

/**
 * @returns {{dead: string[], exportsOf: Map<string,string[]>}}
 *   dead: `js/x.js: name` for every export no other file reaches.
 */
export function deadExports(root) {
  const ROOT = root || DEFAULT_ROOT;
  const jsDir = join(ROOT, 'js');
  const modules = readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
  const exportsOf = new Map();
  for (const f of modules) exportsOf.set(f, namedExports(readFileSync(join(jsDir, f), 'utf8')));

  const readers = [];
  for (const d of READER_DIRS) listFiles(join(ROOT, d), readers);
  /* names reached, per reader file (so a module's own reads do not count for itself) */
  const reachedBy = new Map();
  for (const p of readers) {
    let src; try { src = readFileSync(p, 'utf8'); } catch (_) { continue; }
    const names = reachedNames(src);
    if (names.size) reachedBy.set(relative(ROOT, p).split(sep).join('/'), names);
  }
  const dead = [];
  for (const [f, names] of exportsOf) {
    for (const name of names) {
      let found = false;
      for (const [reader, set] of reachedBy) { if (reader === 'js/' + f) continue; if (set.has(name)) { found = true; break; } }
      if (!found) dead.push(`js/${f}: ${name}`);
    }
  }
  return { dead, exportsOf };
}

if (process.argv[1] && process.argv[1].endsWith('export-readers.mjs')) {
  const { dead, exportsOf } = deadExports();
  let n = 0; for (const v of exportsOf.values()) n += v.length;
  if (!dead.length) { console.log(`export-readers: OK — ${n} named exports across ${exportsOf.size} js/ modules, every one reached by name from another file`); process.exit(0); }
  for (const d of dead) console.error('  · ' + d);
  console.error(`\nexport-readers: ${dead.length} export(s) nothing reaches by name`);
  process.exit(1);
}
