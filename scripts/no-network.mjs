/*
 * IntMap · no-network — a preload that makes every outbound connection of this node process throw.
 *
 *     node --import ./scripts/no-network.mjs scripts/build-hist-admin-recon.mjs --check
 *     NODE_OPTIONS=--import=<file URL of this file> npm run check:histrecon     (children inherit it)
 *
 *  WHY. A gate proves the COMMITTED bytes. One that reaches a third party on the way turns that party's
 *  outage into a red merge gate on an unrelated change. MEASURED 2026-10-06: PR #1022 (an infra change)
 *  went red on Gates 2/3 and Regression 3/3 (run 37406113749) only because `check:histrecon` read the
 *  RISTAT 1897 districts from dataverse.nl, which answered 504 — main's next run was green. The live
 *  read belongs to the builder (and to an upstream check), never to `--check`.
 *
 *  WHAT IT FORBIDS. `fetch`, and any `net.Socket#connect` to a host that is not loopback — http, https,
 *  tls and undici all end there. Loopback and local pipes stay open (tests serve the site on 127.0.0.1).
 *  The error names what was asked for, so the failure says which read must move to a committed file.
 *  Each refusal is also appended to $INTMAP_NO_NETWORK_LOG when set, so a caller can assert «none at
 *  all» even where the code under test swallows the error.
 */
import net from 'node:net';
import fs from 'node:fs';

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\])$/i;

function refuse(what) {
  const msg = 'no-network: ' + what + ' — a gate reads committed data, not a live upstream (scripts/no-network.mjs)';
  if (process.env.INTMAP_NO_NETWORK_LOG) { try { fs.appendFileSync(process.env.INTMAP_NO_NETWORK_LOG, msg + '\n'); } catch { /* the throw below still reports it */ } }
  return new Error(msg);
}

globalThis.fetch = async (input) => { throw refuse('fetch ' + (input && input.url ? input.url : String(input))); };

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const a = Array.isArray(args[0]) ? args[0][0] : args[0];
  const opts = a && typeof a === 'object' ? a : null;
  if (opts && opts.path) return connect.apply(this, args);                 // a local pipe / unix socket
  if (!opts && typeof a === 'string' && Number.isNaN(Number(a))) return connect.apply(this, args); // connect(path)
  const host = opts ? (opts.host || opts.hostname || 'localhost') : (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (LOOPBACK.test(String(host))) return connect.apply(this, args);
  throw refuse('connect ' + host + ':' + (opts ? opts.port : a));
};
