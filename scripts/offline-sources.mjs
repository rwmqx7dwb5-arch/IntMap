#!/usr/bin/env node
/* ============================================================================
 *  scripts/offline-sources.mjs — data/offline-sources.json   (keyboard-and-offline)
 * ----------------------------------------------------------------------------
 *  WHICH FILES MAY BE SAVED FOR A READER TO USE WITH NO NETWORK, AND ON WHOSE WORD.
 *  The offline maps (js/offline-maps.js) save a region of the map to the reader's device. Whether
 *  a supplier's files may be copied that way is a fact about the supplier's TERMS, and the repository
 *  already keeps one row per host the browser talks to (scripts/outbound-hosts.json, the ledger
 *  check:datagov holds against the code). The statement lives on that row — `offline: { allowed,
 *  kind, pathPrefix, basis, why, whyJp }` — and nowhere else; this script derives the file the page
 *  reads from those rows, so there is no second list (.agents/rules/no-ad-hoc-hardcoding.md §2-4).
 *
 *  ⚠ SILENCE IS NOT PERMISSION. A host whose row says nothing is absent from the file, and the page
 *  never saves from a host it was not told it may. ⚠ BOTH ANSWERS ARE KEPT: a row that says "no" is
 *  in the file with its reason, because the reader is shown why a source is not saved
 *  (OpenFreeMap's terms forbid collecting its data in automated ways — a region download is that).
 *  The files IntMap serves itself (data/, assets/) need no row: they are the site's own, and saving
 *  them for the person they were served to extends nothing.
 *
 *  Run:
 *    node scripts/offline-sources.mjs --write     write data/offline-sources.json
 *    node scripts/offline-sources.mjs --check     exit 1 when the file is not what the ledger derives
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger, deriveOfflineSources, OFFLINE_SOURCES } from './outbound-hosts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = OFFLINE_SOURCES;

/* (#729) the governance record — check:datagov reads it. The bundle states a fact about third parties'
   terms, written by this repository; no supplier's data travels in it. */
export const GOVERNANCE = {
  'data/offline-sources.json': {   /* a literal key: the governance gate reads this declaration statically (scripts/data-governance.mjs), it cannot evaluate [OUT] — same path as OFFLINE_SOURCES */
    publisher: 'IntMap (scripts/outbound-hosts.json)',
    url: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/scripts/outbound-hosts.json',
    licence: 'IntMap — Personal & Research Use License (LICENSE)',
    licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/LICENSE',
    attribution: false,
    cadence: 'static',
    cadenceBasis: {
      observed: 'derived from the `offline` statements of the host ledger, which change only when someone reads a supplier\'s terms and writes what they say',
      expires: 'if a supplier changes its terms — then the row it states is out of date, not this derivation',
      canon: 'the `offline` field of each row in scripts/outbound-hosts.json',
    },
    builtBy: 'scripts/offline-sources.mjs',
    schema: 'intmap-offline-sources/1',
  },
};

export function build(root = ROOT) { return deriveOfflineSources(readLedger(root)); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const want = JSON.stringify(build(), null, 2) + '\n';
  const file = path.join(ROOT, OUT);
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, want);
    console.log('wrote ' + OUT);
  } else {
    let have = '';
    try { have = fs.readFileSync(file, 'utf8'); } catch (_) { /* missing */ }
    if (have !== want) { console.error(OUT + ' is not what scripts/outbound-hosts.json derives — run: node scripts/offline-sources.mjs --write'); process.exit(1); }
    console.log(OUT + ' matches the ledger');
  }
}
