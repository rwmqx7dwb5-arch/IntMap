/* ============================================================================
 *  IntMap · sync the Atlas persona into the Edge Function bundle  (#R285)
 * ----------------------------------------------------------------------------
 *  js/atlas-persona.js is the SINGLE SOURCE OF TRUTH for who Atlas is. The
 *  monitor-run and refresh-news Edge Functions speak as Atlas too, and an Edge
 *  Function cannot import a file outside supabase/functions/ — so a
 *  byte-identical copy lives at supabase/functions/_shared/atlas-persona.js.
 *  This script writes that copy and `--check` verifies it is in sync (wired
 *  into scripts/static-checks.mjs, so CI fails loudly if someone edits one and
 *  not the other).
 *
 *  Exactly the mechanism scripts/sync-newsgeo.mjs has used since #R161, for
 *  exactly the same reason: the alternative is two persona texts that agree
 *  today and disagree in four rounds' time, with nothing to notice.
 *
 *      node scripts/sync-atlas-persona.mjs           # write the mirror
 *      node scripts/sync-atlas-persona.mjs --check   # exit 1 if out of sync
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = join(ROOT, 'js', 'atlas-persona.js');
export const DST = join(ROOT, 'supabase', 'functions', '_shared', 'atlas-persona.js');

const BANNER =
  '/* AUTO-GENERATED MIRROR — DO NOT EDIT.\n' +
  '   Source of truth: js/atlas-persona.js.  Regenerate with:  node scripts/sync-atlas-persona.mjs\n' +
  '   (scripts/static-checks.mjs fails the build if this copy drifts.) */\n';

/* (#R162, inherited) Compare LINE-ENDING-AGNOSTICALLY: on a Windows checkout (core.autocrlf=true)
   git hands both files back with CRLF while BANNER above is written with \n, so a byte-perfect
   mirror still looked "drifted" locally. Only \r\n is normalised, never real content. */
const norm = (s) => s.replace(/\r\n/g, '\n');
export function expected() { return BANNER + readFileSync(SRC, 'utf8'); }
export function inSync() { return existsSync(DST) && norm(readFileSync(DST, 'utf8')) === norm(expected()); }

if (process.argv[1] && process.argv[1].endsWith('sync-atlas-persona.mjs')) {
  if (process.argv.includes('--check')) {
    if (!inSync()) { console.error('atlas-persona mirror OUT OF SYNC — run: node scripts/sync-atlas-persona.mjs'); process.exit(1); }
    console.log('atlas-persona mirror in sync');
  } else {
    mkdirSync(dirname(DST), { recursive: true });
    writeFileSync(DST, expected());
    console.log('wrote ' + DST.replace(ROOT, '.'));
  }
}
