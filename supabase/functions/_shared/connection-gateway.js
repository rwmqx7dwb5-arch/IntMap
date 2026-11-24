// ============================================================================
//  IntMap · _shared/connection-gateway.js — THE interface other sessions call
//  (mcp-auth · browser-operate · server-exec · dev-notes/2026-11-20-connection-permissions.md)
// ----------------------------------------------------------------------------
//  Four verbs, one object:
//
//    const gw = createGateway({ store, vaultKeys });   // store: makeRpcStore(...)
//    const a  = await gw.authorize(userId, 'github', { name: 'tools/call:create_issue', class: 'write', sensitivity: 'personal' });
//        → { verdict: 'allow'|'ask'|'deny', reason, opClass, connection }
//          'ask' = put it to the reader, then record the answer ('ok' if they approved and it ran, 'declined' if not)
//    await gw.record(a, 'ok' | 'failed' | 'declined' | 'refused', { host: 'api.github.com', costMicros: 0, code: '' });
//    const secret = await gw.credential(userId, a.connection);       // service_role stores only
//    await gw.storeCredential(userId, connection, secretString, { expiresAt });
//
//  A caller does NOT decide anything: it classifies the operation by what it does (classifyOp), asks, and obeys.
//  Reads are allowed by default, so the common case — authorize, do, record — has no prompt in it.
//  A denial is recorded by authorize itself, so no caller has to remember to.
//  `record` never throws: a ledger that cannot be written must not fail the work it describes (best-effort, like
//  the delegation journal). It returns false so a caller may note it.
//  ⚠ NO TYPE ANNOTATIONS — the static gate parses every committed .js as plain JavaScript.
// ============================================================================
import { decide, ledgerArgs, classifyOp } from './connection-policy.js';
import { seal, open } from './connection-vault.js';

export { classifyOp };

/** A store over Supabase. `rpc(name, args)` → data; `selectConnection(userId, service)` → row | null.
 *  Edge Functions pass service_role clients. The page may pass its own client for authorize/record; the credential
 *  doors are service_role only and cannot be reached from it. */
export function makeRpcStore(rpc, selectConnection) {
  return {
    connection: (userId, service) => selectConnection(userId, service),
    usage: (userId, connectionId) => rpc('conn_usage', { p_user: userId, p_connection: connectionId }),
    log: (args) => rpc('conn_log', args),
    credentialGet: (userId, connectionId) => rpc('conn_credential_get', { p_user: userId, p_connection: connectionId }),
    credentialPut: (args) => rpc('conn_credential_put', args),
  };
}

export function createGateway(deps) {
  const store = deps.store;
  const vaultKeys = deps.vaultKeys || '';

  async function record(authorization, outcome, extra) {
    try {
      const a = authorization || {};
      const args = ledgerArgs(a.connection || { service: a.service }, a.op, a, outcome, Object.assign({ service: a.service }, extra));
      if (!args.p_user) args.p_user = (a.userId) || null;
      await store.log(args);
      return true;
    } catch (e) { return false; }
  }

  async function authorize(userId, service, op) {
    const connection = await store.connection(userId, service);
    const cls = (op && op.class) || classifyOp(op);
    const o = Object.assign({}, op, { class: cls });
    const usage = (connection && cls === 'spend' && connection.daily_spend_cap_micros != null)
      ? await store.usage(userId, connection.id) : null;
    const d = decide(connection, o, usage);
    const a = Object.assign({}, d, { connection, op: o, service, userId });
    if (d.verdict === 'deny' && connection) await record(a, 'refused', {});
    return a;
  }

  async function credential(userId, connection) {
    if (!connection) throw new Error('no_connection');
    const rows = await store.credentialGet(userId, connection.id);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) throw new Error('credential_expired');
    return open(vaultKeys, connection.id, row.ciphertext);
  }

  async function storeCredential(userId, connection, secret, opts) {
    const s = await seal(vaultKeys, connection.id, secret);
    await store.credentialPut({
      p_user: userId, p_connection: connection.id, p_ciphertext: s.ciphertext, p_key_version: s.keyVersion,
      p_hint: s.hint, p_expires: (opts && opts.expiresAt) || null,
    });
    return { hint: s.hint, keyVersion: s.keyVersion };
  }

  return { authorize, record, credential, storeCredential };
}
