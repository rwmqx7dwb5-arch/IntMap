#!/usr/bin/env node
/* ============================================================================
 *  IntMap · a short-lived Postgres URL from the Supabase access token — no stored DB password
 * ----------------------------------------------------------------------------
 *  db-backup.yml used to need SUPABASE_DB_URL, a connection string with the database password in it.
 *  The Supabase CLI already reaches the database with the access token alone (it asks the Management
 *  API for a temporary login role: «Initialising login role...»), so the backup does the same:
 *
 *    POST /v1/projects/{ref}/cli/login-role        → { role, password, ttl_seconds }   (short-lived)
 *    GET  /v1/projects/{ref}/config/database/pooler → the session-mode pooler host/port/db
 *
 *  The URL is written to the file named by DB_URL_FILE (mode 600, the runner's temp disk). It never
 *  reaches the log, the step environment or $GITHUB_ENV, so there is nothing to mask; scripts/backup-db.sh
 *  reads the file. PG_DUMP_ROLE=postgres goes to $GITHUB_ENV: the login role is a door, and pg_dump
 *  switches to the role that can read auth/storage (as the CLI does).
 * ==========================================================================*/
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseRefFrom, normalizeAccessToken } from './release-state.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => { console.log(`::error::${msg}`); process.exit(1); };

const URL_FILE = process.env.DB_URL_FILE;
if (!URL_FILE) fail('DB_URL_FILE is not set');
const token = normalizeAccessToken(process.env.SUPABASE_ACCESS_TOKEN);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set');
const ref = supabaseRefFrom(readFileSync(join(ROOT, 'src/vendor.js'), 'utf8'));
if (!ref) fail('could not derive the project ref from src/vendor.js');

const api = async (method, path, body) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`);
  return JSON.parse(text);
};

try {
  /* read_only:true cannot read the auth schema (measured: «permission denied for schema auth»); the role
     lives 300 s and only pg_dump uses it, which reads */
  const login = await api('POST', '/cli/login-role', { read_only: false });
  if (!login.role || !login.password) throw new Error('login-role answered without a role/password');
  const pools = await api('GET', '/config/database/pooler');
  const list = Array.isArray(pools) ? pools : [pools];
  const p = list.find((x) => x && x.pool_mode === 'session') || list[0];
  if (!p || !p.db_host) throw new Error('the pooler config names no host');
  const port = p.pool_mode === 'session' ? (p.db_port || 5432) : 5432;
  const user = encodeURIComponent(`${login.role}.${ref}`);
  writeFileSync(URL_FILE, `postgresql://${user}:${encodeURIComponent(login.password)}@${p.db_host}:${port}/${p.db_name || 'postgres'}`, { mode: 0o600 });
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, 'PG_DUMP_ROLE=postgres\n');
  console.log(`database login: short-lived role via the access token (host ${p.db_host}:${port}, ttl ${login.ttl_seconds ?? '?'} s)`);
} catch (e) {
  fail(`could not obtain a database login from the access token: ${e.message}`);
}
