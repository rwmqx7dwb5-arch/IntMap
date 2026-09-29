#!/usr/bin/env node
/* ============================================================================
 *  IntMap · a short-lived Postgres URL from the Supabase access token — no stored DB password
 * ----------------------------------------------------------------------------
 *  db-backup.yml used to need SUPABASE_DB_URL, a connection string with the database password in it.
 *  The Supabase CLI already reaches the database with the access token alone (it asks the Management
 *  API for a temporary login role: «Initialising login role...»), so the backup does the same:
 *
 *    POST /v1/projects/{ref}/cli/login-role   → { role, password, ttl_seconds }   (short-lived)
 *    GET  /v1/projects/{ref}/config/database/pooler → the session-mode pooler host/port/db
 *
 *  and writes `DB_URL=postgresql://<role>.<ref>:<password>@<host>:<port>/<db>` to $GITHUB_ENV, after
 *  masking the password and the URL. Nothing is printed in the clear.
 * ==========================================================================*/
import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseRefFrom, normalizeAccessToken } from './release-state.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (line) => (process.env.GITHUB_ENV ? appendFileSync(process.env.GITHUB_ENV, line + '\n') : console.log('(no GITHUB_ENV) would set DB_URL'));
const mask = (v) => console.log(`::add-mask::${v}`);

const token = normalizeAccessToken(process.env.SUPABASE_ACCESS_TOKEN);
if (!token) { console.log('::error::SUPABASE_ACCESS_TOKEN is not set'); process.exit(1); }
const ref = supabaseRefFrom(readFileSync(join(ROOT, 'src/vendor.js'), 'utf8'));
if (!ref) { console.log('::error::could not derive the project ref from src/vendor.js'); process.exit(1); }

const api = async (method, path, body) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
};

try {
  const login = await api('POST', '/cli/login-role', { read_only: true });
  if (!login.role || !login.password) throw new Error('login-role answered without a role/password');
  mask(login.password);
  const pools = await api('GET', '/config/database/pooler');
  const list = Array.isArray(pools) ? pools : [pools];
  const p = list.find((x) => x && x.pool_mode === 'session') || list[0];
  if (!p || !p.db_host) throw new Error('the pooler config names no host');
  const port = p.pool_mode === 'session' ? (p.db_port || 5432) : 5432;
  const url = `postgresql://${encodeURIComponent(`${login.role}.${ref}`)}:${encodeURIComponent(login.password)}@${p.db_host}:${port}/${p.db_name || 'postgres'}`;
  mask(url);
  out(`DB_URL=${url}`);
  console.log(`DB_URL: short-lived read-only login role via the access token (host ${p.db_host}:${port}, ttl ${login.ttl_seconds ?? '?'} s)`);
} catch (e) {
  console.log(`::error::could not obtain a database login from the access token: ${e.message}`);
  process.exit(1);
}
