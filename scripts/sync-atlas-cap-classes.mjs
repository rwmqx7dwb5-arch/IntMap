/* ============================================================================
 *  IntMap · write the capability classes into the Edge Function bundle   (scripts/sync-atlas-cap-classes.mjs)
 * ----------------------------------------------------------------------------
 *  js/atlas-server-class.js derives, from the capability registry, where each capability can run when no page is open.
 *  An Edge Function cannot import js/, so the derived table is written to supabase/functions/_shared/atlas-cap-classes.js.
 *
 *      node scripts/sync-atlas-cap-classes.mjs           # write
 *      node scripts/sync-atlas-cap-classes.mjs --check   # exit 1 if the file is not what the registry derives
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DST = join(ROOT, 'supabase', 'functions', '_shared', 'atlas-cap-classes.js');

export async function render() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const { makeAtlasCapabilities } = await import(pathToFileURL(join(ROOT, 'js', 'atlas-capabilities.js')).href);
  const { serverClass } = await import(pathToFileURL(join(ROOT, 'js', 'atlas-server-class.js')).href);
  const all = makeAtlasCapabilities({}).all().slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const by = { read: [], parkable: [] };
  for (const c of all) { const k = serverClass(c); if (by[k]) by[k].push(c.id); }
  const list = (ids) => '[\n' + ids.map((i) => '  ' + JSON.stringify(i)).join(',\n') + ',\n]';
  return '/* AUTO-GENERATED — DO NOT EDIT. Written by scripts/sync-atlas-cap-classes.mjs from the capability registry (js/atlas-capabilities.js)\n' +
    '   through js/atlas-server-class.js. Where a capability can run when no page is open: `read` may have a server twin; `parkable` is saved by a job\n' +
    '   and applied by the page. Everything else is page-only. NO IMPORTS — a node test runs this as is. */\n' +
    'export const READ_CAPS = Object.freeze(new Set(' + list(by.read) + '));\n' +
    'export const PARKABLE_CAPS = Object.freeze(new Set(' + list(by.parkable) + '));\n' +
    'export function capClass(id) { const k = String(id || \'\'); return PARKABLE_CAPS.has(k) ? \'parkable\' : (READ_CAPS.has(k) ? \'read\' : \'page-only\'); }\n';
}

const main = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (main) {
  const want = await render();
  if (process.argv.includes('--check')) {
    const have = existsSync(DST) ? readFileSync(DST, 'utf8').replace(/\r\n/g, '\n') : '';
    if (have !== want) { console.error('atlas-cap-classes.js is not what the registry derives — run: node scripts/sync-atlas-cap-classes.mjs'); process.exit(1); }
    console.log('atlas-cap-classes.js matches the registry');
  } else { writeFileSync(DST, want); console.log('wrote ' + DST); }
}
