// ============================================================================
//  IntMap — the project's two API keys, read in ONE place (security-audit).
// ----------------------------------------------------------------------------
//  Supabase is retiring the legacy JWT keys (`anon` / `service_role`) by the end of 2026
//  (supabase.com/docs/guides/getting-started/api-keys). The platform injects BOTH generations into
//  every Edge Function:
//    · SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS — the new `sb_secret_…` / `sb_publishable_…`
//      keys, as a JSON object keyed by the key's name ({"default":"sb_secret_…"}). This project has
//      both (measured 2026-10-23: `supabase projects api-keys` lists «default secret» and «default
//      publishable»; `supabase secrets list` lists both variables).
//    · SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY — the legacy JWTs.
//  Until this file, twenty-one functions each read the legacy name themselves (and three Storage
//  writers kept a private list of fallbacks), so disabling the legacy keys in the dashboard would have
//  stopped every function at once. Now every function asks here; the NEW key is preferred and the
//  legacy name is the fallback for a project (or a local stack) that has no new key.
//
//  How a request carries either key is unchanged: `apikey: <key>` + `Authorization: Bearer <key>`.
//  For a new key the API gateway accepts the Bearer only because it equals the apikey — which is
//  exactly what supabase-js itself sends (node_modules/@supabase/supabase-js fetchWithAuth: a new key
//  stays the Bearer unless `omitApiKeyAsBearer`, which only the Functions client sets), and what the
//  browser has sent with the publishable key in production since the key was rotated.
//  `serviceHeaders()` writes that pair, so a caller cannot send one half of it.
//
//  `env` is `(name) => string` — Deno.env.get in a function — so this file stays free of Deno
//  globals and the node tests evaluate it.
// ============================================================================

/* One value out of a SUPABASE_*_KEYS variable: the key named "default", else the first string in the
   object. A bare string that is itself a key of the expected kind is accepted too (a stack that sets
   the variable by hand). Anything else is no key. */
function pick(raw, prefix) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith(prefix)) return s;
  try {
    const o = JSON.parse(s);
    if (typeof o === "string") return o.startsWith(prefix) ? o : "";
    if (o && typeof o === "object") {
      if (typeof o.default === "string" && o.default.startsWith(prefix)) return o.default;
      for (const v of Object.values(o)) if (typeof v === "string" && v.startsWith(prefix)) return v;
    }
  } catch (_) { /* not JSON: no key */ }
  return "";
}

function read(env, name) {
  try { return String((typeof env === "function" ? env(name) : "") || ""); } catch (_) { return ""; }
}

/* The server's key: the new secret key, else the legacy service-role JWT, else "". */
export function secretKey(env) {
  return pick(read(env, "SUPABASE_SECRET_KEYS"), "sb_secret_") || read(env, "SUPABASE_SERVICE_ROLE_KEY");
}

/* The public key a function uses to ask the Auth server who a caller is. */
export function publishableKey(env) {
  return pick(read(env, "SUPABASE_PUBLISHABLE_KEYS"), "sb_publishable_") || read(env, "SUPABASE_ANON_KEY");
}

/* Is this bearer one of the project's PUBLIC keys (either generation)? A signed-out client sends the
   publishable key as its Bearer; it names no account. */
export function isPublicKey(env, token) {
  const t = String(token || "");
  if (!t) return false;
  return t === publishableKey(env) || t === read(env, "SUPABASE_ANON_KEY");
}

/* Which generation `secretKey(env)` resolved to — for a function's own diagnostics. Never the key. */
export function secretKeyKind(env) {
  if (pick(read(env, "SUPABASE_SECRET_KEYS"), "sb_secret_")) return "secret";
  if (read(env, "SUPABASE_SERVICE_ROLE_KEY")) return "legacy";
  return "none";
}

/* The pair every server-side request to this project's REST / Storage / Auth admin carries. */
export function serviceHeaders(key) {
  const k = String(key || "");
  return { apikey: k, authorization: "Bearer " + k };
}

/* Deno's environment, for the functions (a node test passes its own `env`). */
export function denoEnv(name) {
  try { return globalThis.Deno ? (globalThis.Deno.env.get(name) || "") : ""; } catch (_) { return ""; }
}
