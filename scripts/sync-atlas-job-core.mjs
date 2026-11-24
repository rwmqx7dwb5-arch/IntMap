/* ============================================================================
 *  IntMap · sync the Atlas job core into the Edge Function bundle  (atlas-durable-jobs)
 * ----------------------------------------------------------------------------
 *  js/atlas-job-core.js is the SINGLE SOURCE OF TRUTH for the contract of a piece of work and the worker's text.
 *  supabase/functions/atlas-jobs runs the same contracts after the tab is closed, and an Edge Function cannot import
 *  a file outside supabase/functions/ — so a byte-identical copy lives at supabase/functions/_shared/atlas-job-core.js
 *  (the mechanism of scripts/sync-atlas-persona.mjs, for the same reason). `--check` is wired into static-checks.
 *
 *      node scripts/sync-atlas-job-core.mjs           # write the mirror
 *      node scripts/sync-atlas-job-core.mjs --check   # exit 1 if out of sync
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = join(ROOT, 'js', 'atlas-job-core.js');
export const DST = join(ROOT, 'supabase', 'functions', '_shared', 'atlas-job-core.js');
const BANNER =
  '/* AUTO-GENERATED MIRROR — DO NOT EDIT.\n' +
  '   Source of truth: js/atlas-job-core.js.  Regenerate with:  node scripts/sync-atlas-job-core.mjs\n' +
  '   (scripts/static-checks.mjs fails the build if this copy drifts.) */\n';
const norm = (s) => s.replace(/\r\n/g, '\n');   /* a Windows checkout hands both files back with CRLF */
export function expected() { return BANNER + readFileSync(SRC, 'utf8'); }
export function inSync() { return existsSync(DST) && norm(readFileSync(DST, 'utf8')) === norm(expected()); }

if (process.argv[1] && process.argv[1].endsWith('sync-atlas-job-core.mjs')) {
  if (process.argv.includes('--check')) {
    if (!inSync()) { console.error('atlas-job-core mirror OUT OF SYNC — run: node scripts/sync-atlas-job-core.mjs'); process.exit(1); }
    console.log('atlas-job-core mirror in sync');
  } else {
    mkdirSync(dirname(DST), { recursive: true });
    writeFileSync(DST, expected());
    console.log('wrote ' + DST.replace(ROOT, '.'));
  }
}
