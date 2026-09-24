#!/usr/bin/env node
/*
 * IntMap · typecheck — `npm run check:types`  (typecheck-gate)
 *
 *  Runs `tsc --noEmit -p tsconfig.json` with the TypeScript pinned in devDependencies, and exits
 *  with its status. What is checked and why: tsconfig.json, types/geo-engine.d.ts and
 *  docs/TESTING.md «the renderer contract, typed».
 *
 *  WHY A FILE AND NOT `tsc …` IN package.json. scripts/ci-gates.mjs reads each gate's own script to
 *  discover whether it needs the build, and refuses a gate that does not point at scripts/*.mjs —
 *  a bare `tsc` would be a gate that discovery cannot see into. This file is that pointer, plus the
 *  one message a bare `tsc` cannot give: «typescript is not installed» is an `npm install` away,
 *  not a regression (the worktrees share the master copy's node_modules through a junction, so a
 *  tree can declare the dependency before the shared directory has it).
 *
 *      node scripts/typecheck.mjs        the gate
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let tsc;
try { tsc = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc'); }
catch {
  console.error('✗ check:types — typescript is not installed (it is a devDependency). Run `npm install` (or `npm ci`) and retry.');
  process.exit(1);
}

const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', join(ROOT, 'tsconfig.json')], { cwd: ROOT, stdio: 'inherit' });
if (r.status === 0) console.log('✓ check:types — every file under // @ts-check satisfies the declared contracts (types/)');
process.exit(r.status == null ? 1 : r.status);
