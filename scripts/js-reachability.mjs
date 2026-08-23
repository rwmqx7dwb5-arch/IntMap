/* ============================================================================
 *  IntMap · which js/ modules are reachable, derived ONCE  (#R341)
 * ----------------------------------------------------------------------------
 *  Two things ask "is this js/ module dead code, i.e. does this feature silently not exist?" —
 *  scripts/static-checks.mjs (§8, the split-integrity check) and tests/r175-checks.test.mjs (③).
 *  Until this round they each carried their own copy of the answer, and the copies drifted the
 *  moment a new FORM of reachability appeared: #R341 added a worker in src/ that imports js/
 *  modules, taught static-checks about it, and tests/r175 went red on two files that are demonstrably
 *  alive. That is the #R318 shape — two lists of the same fact, and no two of them agreeing.
 *
 *  So the derivation lives here and both read it. Adding a sixth form is one edit, in one place.
 *
 *  THE FIVE FORMS a js/ module can be reached by:
 *    1. src/main.js imports it                        `import '../js/x.js';`
 *    2. a reachable js/ module import()s it           `import('./x.js')`   (lazy-modules.js)
 *    3. a js/ module statically imports it            `import … from './x.js';`
 *    4. a standalone HTML page <script src>es it      sources.html, science.html, admin.html, …
 *    5. a WORKER in src/ imports it                   `import '../js/x.js';` in src/*-worker.js
 *
 *  Form 5 is not in src/main.js's graph — a worker is reached by
 *  `new Worker(new URL('./x.js', import.meta.url))` — but what it imports is every bit as alive as
 *  what the entry imports. Exempting the filenames instead would have made the check answer "no" to
 *  a question it had stopped asking.
 * ==========================================================================*/
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* The standalone documents this repo ships besides index.html. Read rather than allow-listed by
   module name: delete the <script> tag and the module correctly goes back to failing. */
export const STANDALONE_PAGES = ['sources.html', 'science.html', 'admin.html', 'privacy.html', 'terms.html'];

/**
 * @param {string} root  repository root
 * @param {string[]} [jsFiles]  bare filenames in js/ (defaults to every .js there)
 * @returns {{imported:string[], dyn:Set<string>, sib:Set<string>, isReachable:(rel:string)=>boolean}}
 *   Paths are repo-relative with the `js/` prefix, e.g. `js/app-body.js`.
 */
export function jsReachability(root, jsFiles) {
  const files = jsFiles || readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js'));

  /* 1 — the entry's own static imports, in order (r175 also asserts the ORDER, so this is a list) */
  const entryPath = join(root, 'src', 'main.js');
  const entry = existsSync(entryPath) ? readFileSync(entryPath, 'utf8') : '';
  const imported = [...entry.matchAll(/import '\.\.\/(js\/[^']+)';/g)].map((m) => m[1]);

  const dyn = new Set();
  const sib = new Set();

  /* 2 and 3 — from inside js/ */
  for (const f of files) {
    const p = join(root, 'js', f);
    if (!existsSync(p)) continue;
    const t = readFileSync(p, 'utf8');
    for (const m of t.matchAll(/import\(\s*'\.\/([A-Za-z0-9_.-]+\.js)'\s*\)/g)) dyn.add('js/' + m[1]);
    for (const m of t.matchAll(/^\s*import\s[^;]*?from\s*'\.\/([A-Za-z0-9_.-]+\.js)'\s*;/gm)) sib.add('js/' + m[1]);
    for (const m of t.matchAll(/^\s*import\s*'\.\/([A-Za-z0-9_.-]+\.js)'\s*;/gm)) sib.add('js/' + m[1]);
  }

  /* 4 — the standalone pages */
  for (const page of STANDALONE_PAGES) {
    const p = join(root, page);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/<script[^>]*\ssrc=["']\.\/(js\/[A-Za-z0-9_.-]+\.js)["']/g)) {
      sib.add(m[1]);
    }
  }

  /* 5 — workers and other src/ modules the entry does not import */
  const srcDir = join(root, 'src');
  if (existsSync(srcDir)) {
    for (const f of readdirSync(srcDir).filter((x) => x.endsWith('.js'))) {
      const t = readFileSync(join(srcDir, f), 'utf8');
      for (const m of t.matchAll(/^\s*import\s*'\.\.\/(js\/[A-Za-z0-9_.-]+\.js)'\s*;/gm)) sib.add(m[1]);
      for (const m of t.matchAll(/^\s*import\s[^;]*?from\s*'\.\.\/(js\/[A-Za-z0-9_.-]+\.js)'\s*;/gm)) sib.add(m[1]);
      for (const m of t.matchAll(/import\(\s*'\.\.\/(js\/[A-Za-z0-9_.-]+\.js)'\s*\)/g)) dyn.add(m[1]);
    }
  }

  const importedSet = new Set(imported);
  return {
    imported,
    dyn,
    sib,
    isReachable: (rel) => importedSet.has(rel) || dyn.has(rel) || sib.has(rel),
  };
}
