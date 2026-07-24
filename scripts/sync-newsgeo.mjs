/* ============================================================================
 *  IntMap · sync the NewsGeo engine into the Edge Function bundle  (#R161)
 * ----------------------------------------------------------------------------
 *  js/newsgeo.js is the SINGLE SOURCE OF TRUTH. The refresh-news Edge Function
 *  cannot import a file outside supabase/functions/, so a byte-identical copy
 *  lives at supabase/functions/_shared/newsgeo.js. This script writes that copy
 *  and `--check` verifies it is in sync (wired into scripts/static-checks.mjs,
 *  so CI fails loudly if someone edits one and not the other).
 *
 *      node scripts/sync-newsgeo.mjs           # write the mirror
 *      node scripts/sync-newsgeo.mjs --check   # exit 1 if out of sync
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = join(ROOT, 'js', 'newsgeo.js');
export const DST = join(ROOT, 'supabase', 'functions', '_shared', 'newsgeo.js');

const BANNER =
  '/* AUTO-GENERATED MIRROR — DO NOT EDIT.\n' +
  '   Source of truth: js/newsgeo.js.  Regenerate with:  node scripts/sync-newsgeo.mjs\n' +
  '   (scripts/static-checks.mjs fails the build if this copy drifts.) */\n';

/* (#R162) Compare LINE-ENDING-AGNOSTICALLY. On a Windows checkout (core.autocrlf=true) git
   hands both files back with CRLF, while BANNER above is written with \n — so a mirror that
   was byte-perfect in the repo still looked "drifted" and failed `npm test` locally. Linux CI
   never saw it. Drift detection is unaffected: only \r\n is normalised, never real content. */
const norm = (s) => s.replace(/\r\n/g, '\n');
export function expected() { return BANNER + readFileSync(SRC, 'utf8'); }
export function inSync() { return existsSync(DST) && norm(readFileSync(DST, 'utf8')) === norm(expected()); }

if (process.argv[1] && process.argv[1].endsWith('sync-newsgeo.mjs')) {
  if (process.argv.includes('--check')) {
    if (!inSync()) { console.error('newsgeo mirror OUT OF SYNC — run: node scripts/sync-newsgeo.mjs'); process.exit(1); }
    console.log('newsgeo mirror in sync');
  } else {
    mkdirSync(dirname(DST), { recursive: true });
    writeFileSync(DST, expected());
    console.log('wrote ' + DST.replace(ROOT, '.'));
  }
}
