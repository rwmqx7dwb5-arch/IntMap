/* ============================================================================
 *  look-up-gesture — the repair that lets a real drag LOOK UP past 90° still sits on a method the
 *  INSTALLED MapLibre has, with the contract the repair is written against
 * ----------------------------------------------------------------------------
 *  The eye pivot (js/geo-engine.js, #R179) overrides one internal of MapLibre's Camera: the check that
 *  rewrites a look-up proposal whose stale elevation reads as «underground» to pitch 90. MapLibre
 *  6.13 renamed that internal and changed what it returns, the repair's `typeof … === 'function'`
 *  answered false, and every live look-up drag froze at exactly 90° — measured 2026-10-13, and on
 *  the post-deploy smoke from the 6.13 deploy on. Nothing fast saw it: the browser specs that
 *  perform the drag (tests/r179.spec.js) are deep-tier, so the version bump never ran them.
 *
 *  So this asks the source the build compiles (vite.config.js builds MapLibre from
 *  node_modules/maplibre-gl/src) three things, none of them a copy of a MapLibre name:
 *    ① the method the adapter names exists on the Camera class
 *    ② it answers with a transform, which is the contract the repair's verdict is read in
 *       (`returned === handed in` means «clear»)
 *    ③ applyUpdatedTransform reaches it BEFORE it calls transformCameraUpdate — the ordering the
 *       whole repair is about (the hook only ever sees what the check already did)
 *  and that the adapter's diagnosis reports the same name, so the probes in the browser specs ask
 *  the adapter instead of keeping their own spelling.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const GEO = readFileSync(join(ROOT, 'js/geo-engine.js'), 'utf8');
const ML_DIR = dirname(require.resolve('maplibre-gl/package.json'));
const CAMERA = readFileSync(join(ML_DIR, 'src/ui/camera.ts'), 'utf8').replace(/\r\n/g, '\n');

/* the one name the adapter overrides — read off the adapter, where install, removal and the
   diagnosis all take it from */
const nameDecl = GEO.match(/const _UG_NAME='([A-Za-z_$][\w$]*)'/);
const NAME = nameDecl && nameDecl[1];

/* the Camera class's methods, by its own layout: a member at class indent, its body closed by the
   brace at the same indent. Brace matching rather than a regex over the body, so a method that
   grows does not fall out of the scan. */
function methods(src) {
  const out = new Map();
  const head = /^    (?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\(([^)]*)\)\s*(?::\s*([^{]+?))?\s*\{$/gm;
  let m;
  while ((m = head.exec(src))) {
    if (['if', 'for', 'while', 'switch', 'catch'].includes(m[1])) continue;
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    out.set(m[1], { params: m[2], returns: (m[3] || '').trim(), body: src.slice(m.index + m[0].length, i) });
  }
  return out;
}
const M = methods(CAMERA);

test('the adapter names the renderer method its look-up repair overrides', () => {
  assert.ok(NAME, 'js/geo-engine.js declares _UG_NAME — the name install, removal and eyePivotDiag share');
  assert.ok(M.size > 30, `the method scan found the Camera class (${M.size} members) — if this is small, the layout rule stopped matching`);
  assert.match(GEO, /underGuardName:_UG_NAME/, 'eyePivotDiag reports the name, so browser probes ask the adapter rather than spell it');
});

test('① ② the installed MapLibre has that method, answering with a transform', () => {
  const v = JSON.parse(readFileSync(join(ML_DIR, 'package.json'), 'utf8')).version;
  const own = M.get(NAME);
  assert.ok(own, `maplibre-gl ${v}'s Camera has no ${NAME}() — the look-up repair would not install and a drag past the horizon freezes at 90°`);
  assert.equal(own.returns, 'ITransform',
    `${NAME}() returns ${own.returns || 'nothing declared'} in maplibre-gl ${v}; the repair reads «returned the transform it was handed» as «clear»`);
});

test('③ applyUpdatedTransform reaches it before it asks transformCameraUpdate', () => {
  const apply = M.get('applyUpdatedTransform');
  assert.ok(apply, 'Camera.applyUpdatedTransform exists');
  const hookAt = apply.body.indexOf('this.transformCameraUpdate(');
  assert.ok(hookAt > 0, 'it calls the camera-update hook');
  /* every `this.<method>(` called in the body before the hook, followed through the class */
  const reaches = (body, seen) => {
    for (const c of body.matchAll(/this\.([A-Za-z_$][\w$]*)\(/g)) {
      const k = c[1];
      if (k === NAME) return true;
      if (seen.has(k) || !M.has(k)) continue;
      seen.add(k);
      if (reaches(M.get(k).body, seen)) return true;
    }
    return false;
  };
  assert.ok(reaches(apply.body.slice(0, hookAt), new Set(['applyUpdatedTransform'])),
    `applyUpdatedTransform no longer reaches ${NAME}() ahead of transformCameraUpdate — the order the repair exists for changed; re-measure tests/r179.spec.js`);
});
