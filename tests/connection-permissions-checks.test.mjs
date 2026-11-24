/* ============================================================================
 *  connection-permissions — the shared policy / vault / gateway under every connected service
 *  supabase/migrations/20261121120000_connection_permissions.sql · supabase/functions/_shared/connection-*.js
 *  ① reads never ask by default; write/spend/destructive ask; the reader can move any of them
 *  ② data conditions and the spend cap are hard denials with a typed reason
 *  ③ the vault: round trip, bound to its connection, rotation, no key = refusal (never plaintext)
 *  ④ the gateway: a denial is recorded by authorize, record never throws, the secret never reaches the ledger
 *  ⑤ the migration: owner RLS, credential table closed to browser roles, revoke deletes the secret
 *  (The SQL itself runs in supabase/tests/52_connection_permissions_test.sql.)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, classifyOp, ledgerArgs, DEFAULT_POLICY } from '../supabase/functions/_shared/connection-policy.js';
import { seal, open, parseVaultKeys } from '../supabase/functions/_shared/connection-vault.js';
import { createGateway } from '../supabase/functions/_shared/connection-gateway.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261121120000_connection_permissions.sql'), 'utf8');
const conn = (o) => Object.assign({ id: 'c1', user_id: 'u1', service: 'github', status: 'active' }, o);
const KEY = (n) => Buffer.alloc(32, n).toString('base64');

test('① defaults: a read is allowed without asking; write, spend and destructive ask', () => {
  assert.equal(decide(conn(), { class: 'read' }).verdict, 'allow');
  for (const c of ['write', 'spend', 'destructive']) assert.equal(decide(conn(), { class: c }).verdict, 'ask', c);
  assert.equal(decide(conn({ mode_write: 'allow' }), { class: 'write' }).verdict, 'allow');
  assert.equal(decide(conn({ mode_read: 'deny' }), { class: 'read' }).reason, 'class_denied');
  assert.equal(decide(conn(), { class: 'unknown' }).opClass, 'write', 'an unclassified call is cautious, never a read');
  assert.equal(classifyOp({}), 'read');
  assert.equal(classifyOp({ writes: true, destroys: true }), 'destructive');
  assert.equal(decide(null, { class: 'read' }).reason, 'no_connection');
  assert.equal(decide(conn({ status: 'revoked' }), { class: 'read' }).reason, 'connection_revoked');
  assert.equal(decide(conn({ status: 'paused' }), { class: 'read' }).reason, 'connection_paused');
});

test('② data conditions and the spend cap are hard denials with a typed reason', () => {
  assert.equal(decide(conn(), { class: 'read', sensitivity: 'private' }).reason, 'data_too_sensitive');
  assert.equal(decide(conn({ max_sensitivity: 'private' }), { class: 'read', sensitivity: 'private' }).verdict, 'allow');
  const kept = conn({ data_terms: { retains: true, trains: true } });
  assert.equal(decide(kept, { class: 'read', sensitivity: 'personal' }).reason, 'training_not_allowed');
  assert.equal(decide(conn({ data_terms: { retains: true }, allow_retention: false }), { class: 'read', sensitivity: 'personal' }).reason, 'retention_not_allowed');
  assert.equal(decide(kept, { class: 'read' }).verdict, 'allow', 'public data to a service that keeps it harms no one');
  assert.equal(decide(conn({ daily_spend_cap_micros: 1000, mode_spend: 'allow' }), { class: 'spend', costMicros: 600 }, { spend_today_micros: 500 }).reason, 'daily_spend_cap');
  assert.equal(decide(conn({ daily_spend_cap_micros: 1000, mode_spend: 'allow' }), { class: 'spend', costMicros: 400 }, { spend_today_micros: 500 }).verdict, 'allow');
  assert.equal(DEFAULT_POLICY.mode_read, 'allow');
});

test('③ vault: round trip; bound to the connection; rotation; no key means refusal', async () => {
  const keys = `2:${KEY(2)},1:${KEY(1)}`;
  assert.equal(parseVaultKeys(`3:${Buffer.alloc(8).toString('base64')}`).length, 0, 'a short key is no key');
  const s = await seal(keys, 'c1', 'ghp_supersecretvalue1234');
  assert.equal(s.keyVersion, 2);
  assert.equal(s.hint, '1234');
  assert.ok(!s.ciphertext.includes('supersecret'));
  assert.equal(await open(keys, 'c1', s.ciphertext), 'ghp_supersecretvalue1234');
  await assert.rejects(open(keys, 'c2', s.ciphertext), /vault_open_failed/, 'copied onto another connection');
  assert.equal(await open(`2:${KEY(2)}`, 'c1', s.ciphertext), 'ghp_supersecretvalue1234', 'older keys can be dropped once nothing uses them');
  await assert.rejects(open(`1:${KEY(1)}`, 'c1', s.ciphertext), /vault_key_missing/);
  await assert.rejects(seal('', 'c1', 'x'), /vault_not_configured/);
  await assert.rejects(open(keys, 'c1', 'plaintext'), /vault_bad_ciphertext/);
});

function fakeStore(connection) {
  const log = []; const creds = new Map();
  return {
    log, creds,
    connection: async () => connection,
    usage: async () => ({ spend_today_micros: 0 }),
    logFn: null,
    async logRow(a) { log.push(a); },
    credentialGet: async (u, id) => (creds.has(id) ? [creds.get(id)] : []),
    credentialPut: async (a) => { creds.set(a.p_connection, { ciphertext: a.p_ciphertext, expires_at: a.p_expires }); },
  };
}

test('④ gateway: denial recorded by authorize; record never throws; secret stays out of the ledger', async () => {
  const st = fakeStore(conn({ mode_destructive: 'deny' }));
  st.log = []; const rows = st.log; st.logRow = null;
  const store = { ...st, log: async (a) => { rows.push(a); } };
  const gw = createGateway({ store, vaultKeys: `1:${KEY(7)}` });
  const a = await gw.authorize('u1', 'github', { name: 'tools/call:delete_repo', class: 'destructive' });
  assert.equal(a.verdict, 'deny');
  assert.equal(rows.length, 1, 'the refusal was recorded without the caller doing anything');
  assert.equal(rows[0].p_outcome, 'refused');
  assert.equal(rows[0].p_code, 'class_denied');
  const r = await gw.authorize('u1', 'github', { name: 'tools/call:search', class: 'read' });
  assert.equal(r.verdict, 'allow');
  assert.equal(await gw.record(r, 'ok', { url: 'https://api.github.com/search?q=secret-token-in-url', costMicros: 5 }), true);
  const last = rows[rows.length - 1];
  assert.equal(last.p_host, 'api.github.com');
  assert.ok(!JSON.stringify(last).includes('secret-token'), 'host only, never the URL');
  assert.equal(last.p_cost_micros, 5);
  const broken = createGateway({ store: { ...store, log: async () => { throw new Error('db down'); } } });
  assert.equal(await broken.record(r, 'ok', {}), false, 'a failed ledger write does not fail the work');
  await gw.storeCredential('u1', a.connection, 'ghp_supersecretvalue1234');
  assert.equal(await gw.credential('u1', a.connection), 'ghp_supersecretvalue1234');
  assert.ok(!JSON.stringify(rows).includes('supersecret'));
  const none = ledgerArgs(null, { name: 'x' }, { verdict: 'deny', reason: 'no_connection', opClass: 'read' }, 'refused', { service: 'foo' });
  assert.equal(none.p_connection, null);
});

test('⑤ migration: owner RLS, credentials closed to browser roles, revoke deletes the secret, doors scoped', () => {
  for (const t of ['connections', 'connection_credentials', 'connection_ledger'])
    assert.match(SQL, new RegExp(`alter table public\\.${t}\\s+enable row level security`), t + ' RLS');
  assert.match(SQL, /revoke all on public\.connections, public\.connection_credentials, public\.connection_ledger from public, anon, authenticated/);
  assert.doesNotMatch(SQL, /grant [^;]*connection_credentials[^;]* to authenticated/, 'no browser grant on credentials');
  assert.match(SQL, /delete from public\.connection_credentials cc where cc\.connection_id = new\.id/);
  for (const f of ['conn_credential_put', 'conn_credential_get', 'conn_credential_delete'])
    assert.match(SQL, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`), f);
  assert.doesNotMatch(SQL, /grant execute on function public\.conn_credential_\w+\([^)]*\) to [^;]*authenticated/);
  assert.match(SQL, /purge_connection_ledger/);
  assert.doesNotMatch(SQL, /grant (update|delete)[^;]*connection_ledger[^;]*authenticated/, 'the ledger is append-only for readers');
  /* the defaults in JS and SQL are one set */
  assert.match(SQL, /mode_read\s+text not null default 'allow'/);
  assert.match(SQL, /mode_write\s+text not null default 'ask'/);
});
