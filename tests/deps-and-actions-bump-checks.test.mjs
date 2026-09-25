/* deps-and-actions-bump — a default import of a package that has no default export.
 *
 * Measured when the dev dependencies were raised: js-yaml 5 and pbf 5 dropped their default export.
 * `import yaml from 'js-yaml'` then fails to LINK (SyntaxError before a single test runs), and
 * `(await import('js-yaml')).default` quietly becomes undefined — scripts/static-checks.mjs read that
 * as «js-yaml is not installed» and turned YAML validation into a warning. Three test files written
 * the same week by other work had the same line, and the CI of the bump went red on one of them.
 *
 * The rule is stated about the FACT, not about two packages: every Node-side file (scripts/, tests/,
 * supabase/functions/ are not Node — excluded) that default-imports a bare package name is checked by
 * actually importing that package in this checkout and asking whether it has a `default`. A package
 * added tomorrow is covered the day it is imported this way.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const tracked = execFileSync('git', ['ls-files', 'scripts', 'tests'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((f) => /\.mjs$/.test(f));

/* `import X from 'pkg'` / `import X, {…} from 'pkg'` and `(await import('pkg')).default` */
const STATIC = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]([^'".\/][^'"]*)['"]/gm;
const DYNAMIC = /import\(\s*['"]([^'".\/][^'"]*)['"]\s*\)\s*\)\s*\.default/g;

function uses() {
  const out = [];
  for (const f of tracked) {
    /* comments are prose about imports, not imports (this file's own header quotes the defect) */
    const src = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(STATIC)) if (!m[2].startsWith('node:')) out.push({ file: f, pkg: m[2] });
    for (const m of src.matchAll(DYNAMIC)) if (!m[1].startsWith('node:')) out.push({ file: f, pkg: m[1] });
  }
  return out;
}

test('deps-and-actions-bump: every default import of a package names a default that exists', async () => {
  const found = uses();
  assert.ok(found.length > 0, 'the scan read the tree (no default imports found at all is itself suspicious)');
  const req = createRequire(join(ROOT, 'package.json'));
  const cache = new Map();
  const bad = [];
  for (const { file, pkg } of found) {
    if (!cache.has(pkg)) {
      let has = null;
      try { req.resolve(pkg); } catch { cache.set(pkg, 'unresolvable'); continue; }
      try { const ns = await import(pkg); has = Object.prototype.hasOwnProperty.call(ns, 'default') && ns.default !== undefined; }
      catch (e) { has = 'import failed: ' + (e && e.message); }
      cache.set(pkg, has);
    }
    const v = cache.get(pkg);
    if (v === false) bad.push(`${file}: default-imports '${pkg}', which has no default export — import * as … or a named import`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});
