#!/usr/bin/env node
/* ============================================================================
 *  scripts/connection-ledger.mjs — data/connection-ledger.json   (security-next)
 * ----------------------------------------------------------------------------
 *  WHAT THE PAGE HOLDS ITS OBSERVED CONNECTIONS AGAINST.
 *  scripts/outbound-hosts.json is IntMap's statement of every host its browser code can contact, what
 *  each is sent, and the words of Privacy §4 that say so — and check:datagov holds that statement against
 *  the SOURCE. js/connection-watch.js watches what the page ACTUALLY contacts (the browser's own resource
 *  timing, every WebSocket, the security policy's refusals, and — through sw.js — the requests background
 *  workers make), and js/connections-panel.js shows the reader each host beside its row of the statement,
 *  naming any host the statement does not account for. This script derives the file the page reads from the
 *  ledger, so there is no second list (.agents/rules/no-ad-hoc-hardcoding.md §2-4); check:datagov
 *  (rule outbound-disclosed, scripts/outbound-hosts.mjs checkRepository) fails while the two differ.
 *
 *  Run:
 *    node scripts/connection-ledger.mjs --write     write data/connection-ledger.json
 *    node scripts/connection-ledger.mjs --check     exit 1 when the file is not what the ledger derives
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger, deriveConnectionLedger, CONNECTION_LEDGER } from './outbound-hosts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = CONNECTION_LEDGER;

/* the governance record — check:datagov reads it. The file states facts about IntMap's own code (which hosts
   it contacts and what it sends them), written by this repository; no supplier's data travels in it. */
export const GOVERNANCE = {
  'data/connection-ledger.json': {   /* a literal key: the governance gate reads this declaration statically (scripts/data-governance.mjs) — same path as CONNECTION_LEDGER */
    publisher: 'IntMap (scripts/outbound-hosts.json)',
    url: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/scripts/outbound-hosts.json',
    licence: 'IntMap — Personal & Research Use License (LICENSE)',
    licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/LICENSE',
    attribution: false,
    cadence: 'static',
    cadenceBasis: {
      observed: 'derived from the host ledger, which changes only when the browser code starts or stops contacting a host (check:datagov fails until the ledger says so)',
      expires: 'when the ledger changes — check:datagov then fails until this file is written again',
      canon: 'scripts/outbound-hosts.json',
    },
    builtBy: 'scripts/connection-ledger.mjs',
    schema: 'intmap-connection-ledger/1',
  },
};

export function build(root = ROOT) { return deriveConnectionLedger(readLedger(root)); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const want = JSON.stringify(build()) + '\n';
  const file = path.join(ROOT, OUT);
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, want);
    console.log('wrote ' + OUT + ' (' + want.length + ' bytes)');
  } else {
    let have = '';
    try { have = fs.readFileSync(file, 'utf8'); } catch (_) { /* missing */ }
    if (have !== want) { console.error(OUT + ' is not what scripts/outbound-hosts.json derives — run: node scripts/connection-ledger.mjs --write'); process.exit(1); }
    console.log(OUT + ' matches the ledger');
  }
}
