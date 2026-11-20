// ============================================================================
//  IntMap · _shared/connection-vault.js — seal and open a connection's secret
//  (supabase/migrations/20261120130000_connection_permissions.sql · connection_credentials)
// ----------------------------------------------------------------------------
//  AES-256-GCM through WebCrypto (Deno and Node 20 both have it). The key is NOT in the database and NOT in the
//  repository: it is the Edge Function secret CONNECTION_VAULT_KEYS, "<version>:<base64 of 32 bytes>" entries
//  separated by commas, newest first. Sealing uses the first; opening finds the entry that sealed it, so a key can
//  be rotated without losing what it already sealed.
//  The connection id is bound in as additional authenticated data: a ciphertext copied onto another connection's
//  row does not open.  Format: "v1.<keyVersion>.<base64 iv>.<base64 ciphertext>".
//  ⚠ NO TYPE ANNOTATIONS — the static gate parses every committed .js as plain JavaScript.
// ============================================================================

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

/** Parse the secret. Returns [{ version, bytes }]; entries that are not 32 bytes are rejected (a short key is no key). */
export function parseVaultKeys(raw) {
  const out = [];
  for (const part of String(raw || '').split(',')) {
    const m = /^\s*(\d{1,6}):([A-Za-z0-9+/=]+)\s*$/.exec(part);
    if (!m) continue;
    let bytes;
    try { bytes = unb64(m[2]); } catch (e) { continue; }
    if (bytes.length === 32) out.push({ version: Number(m[1]), bytes });
  }
  return out;
}

const importKey = (bytes) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** seal(keysRaw, connectionId, secret) → { ciphertext, keyVersion, hint }. Throws 'vault_not_configured' with no usable key. */
export async function seal(keysRaw, connectionId, secret) {
  const keys = parseVaultKeys(keysRaw);
  if (!keys.length) throw new Error('vault_not_configured');
  const k = keys[0];
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const s = String(secret);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(String(connectionId)) }, await importKey(k.bytes), enc.encode(s)));
  return { ciphertext: 'v1.' + k.version + '.' + b64(iv) + '.' + b64(ct), keyVersion: k.version, hint: s.length >= 12 ? s.slice(-4) : '' };
}

/** open(keysRaw, connectionId, ciphertext) → the secret. Throws 'vault_bad_ciphertext' | 'vault_key_missing' | 'vault_open_failed'. */
export async function open(keysRaw, connectionId, ciphertext) {
  const m = /^v1\.(\d+)\.([^.]+)\.([^.]+)$/.exec(String(ciphertext || ''));
  if (!m) throw new Error('vault_bad_ciphertext');
  const key = parseVaultKeys(keysRaw).find((k) => k.version === Number(m[1]));
  if (!key) throw new Error('vault_key_missing');
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(m[2]), additionalData: enc.encode(String(connectionId)) }, await importKey(key.bytes), unb64(m[3]));
    return dec.decode(pt);
  } catch (e) { throw new Error('vault_open_failed'); }
}
