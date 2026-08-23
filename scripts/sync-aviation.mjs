/* ============================================================================
 *  IntMap · sync the aviation engine into the Edge Function bundle  (#R341)
 * ----------------------------------------------------------------------------
 *  js/aviation-codec.js and js/aviation-model.js are the SINGLE SOURCE OF TRUTH for the IMAV/1 wire
 *  format and for what a normalised aircraft record IS. The aviation-feed Edge Function cannot
 *  import a file outside supabase/functions/, so byte-identical copies live in
 *  supabase/functions/_shared/. This script writes them and `--check` verifies they are in sync
 *  (wired into scripts/static-checks.mjs, so CI fails loudly if someone edits one and not the
 *  other).
 *
 *  ⚠ THESE TWO MATTER MORE THAN THE NEWSGEO MIRROR THEY COPY. A drifted newsgeo puts a headline on
 *  the wrong pin. A drifted codec makes the encoder and the decoder disagree about a byte offset,
 *  and every aircraft in the world lands somewhere plausible and wrong; a drifted model makes the
 *  server and the browser disagree about what `military` or `onGround` means, so the filter
 *  disagrees with the colour. tests/r341-checks.test.mjs round-trips the MIRRORED copies against
 *  each other for that reason — this script proves they are the same text, the test proves the
 *  text is a working codec.
 *
 *  ONE script for both files rather than one script per file: the mechanism is identical and a
 *  second copy of it is a second thing to keep in step.
 *
 *      node scripts/sync-aviation.mjs           # write the mirrors
 *      node scripts/sync-aviation.mjs --check   # exit 1 if any is out of sync
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MIRRORS = [
  { name: 'aviation-codec.js' },
  { name: 'aviation-model.js' },
].map((m) => ({
  name: m.name,
  src: join(ROOT, 'js', m.name),
  dst: join(ROOT, 'supabase', 'functions', '_shared', m.name),
}));

const banner = (name) =>
  '/* AUTO-GENERATED MIRROR — DO NOT EDIT.\n' +
  '   Source of truth: js/' + name + '.  Regenerate with:  node scripts/sync-aviation.mjs\n' +
  '   (scripts/static-checks.mjs fails the build if this copy drifts.) */\n';

/* (#R283) Compare LINE-ENDING-AGNOSTICALLY — a Windows checkout hands both files back with CRLF
   while the banner is written with \n, so a byte-perfect mirror still looked "drifted" locally and
   never on Linux CI. Only \r\n is normalised; real content is untouched. */
const norm = (s) => s.replace(/\r\n/g, '\n');

export function expected(m) { return banner(m.name) + readFileSync(m.src, 'utf8'); }
export function inSync() { return MIRRORS.every((m) => existsSync(m.dst) && norm(readFileSync(m.dst, 'utf8')) === norm(expected(m))); }
export function outOfSync() { return MIRRORS.filter((m) => !(existsSync(m.dst) && norm(readFileSync(m.dst, 'utf8')) === norm(expected(m)))).map((m) => m.name); }

if (process.argv[1] && process.argv[1].endsWith('sync-aviation.mjs')) {
  if (process.argv.includes('--check')) {
    const bad = outOfSync();
    if (bad.length) { console.error('aviation mirror OUT OF SYNC: ' + bad.join(', ') + ' — run: node scripts/sync-aviation.mjs'); process.exit(1); }
    console.log('aviation mirrors in sync (' + MIRRORS.length + ')');
  } else {
    for (const m of MIRRORS) {
      mkdirSync(dirname(m.dst), { recursive: true });
      writeFileSync(m.dst, expected(m));
      console.log('wrote ' + m.dst.replace(ROOT, '.'));
    }
  }
}
