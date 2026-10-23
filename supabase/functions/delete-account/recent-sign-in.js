// ============================================================================
//  IntMap · delete-account/recent-sign-in.js — «did this person sign in just now?», as a pure function
// ----------------------------------------------------------------------------
//  WHY (security-audit, 2026-10-23 — the user approved «a sign-in within the last ten minutes»):
//  delete-account verified that the caller's access token was valid and erased the account. A valid
//  token is not a person at the keyboard: a session left open on a shared computer, or a token lifted
//  from a tab, could erase an account irrecoverably — the one action in IntMap that cannot be undone.
//  So deletion now also asks WHEN the person last proved who they are, and refuses with
//  `reauth_required` when that was longer ago than REAUTH_WINDOW_S; the account sheet then asks them to
//  sign in again (js/auth-ui.js) and the deletion goes through on the next attempt.
//
//  WHERE «WHEN» COMES FROM — the access token's `amr` claim (Authentication Methods Reference).
//  Supabase Auth writes it as [{ method, timestamp }], `timestamp` in Unix SECONDS
//  (https://supabase.com/docs/guides/auth/jwt-fields, read 2026-10-23). In the Auth server's own source
//  (supabase/auth internal/models/sessions.go CalculateAALAndAMR, read 2026-10-23) each entry's
//  timestamp is the `updated_at` of that method's row in auth.mfa_amr_claims, which is set when the
//  method is USED to sign in (AddClaimToSession) and not when the token is refreshed — so a session
//  refreshed for a week still says when it was signed in. A Google sign-in is the method "oauth" with
//  the same timestamp, a password sign-in "password", a passkey or TOTP their own: one rule for all.
//  The newest timestamp is the last sign-in, whichever method it was.
//  ⚠ FAILS CLOSED: a token with no `amr`, an `amr` without a readable timestamp, a token that is not a
//  JWT, or one whose `sub` is not the account the Auth server just verified — each is «not shown to be
//  recent», and nothing is deleted. Signing in again always produces a fresh claim, so a refusal costs
//  the reader one sign-in, never the ability to delete.
//
//  The payload is read WITHOUT verifying the signature here, and that is sound only because the caller
//  (index.ts) has already had the Auth server accept the SAME token (auth.getUser) and passes the id it
//  returned: a token the Auth server accepted is one it signed, and `sub` must match that id.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs runs `node --check` over it, and
//  tests/security-audit-checks.test.mjs imports it.
// ============================================================================

/* How recent a sign-in must be to delete the account, in seconds. 600 = ten minutes: the value the user
   approved for this check (2026-10-23). Long enough to sign in and walk to the Delete button, short
   enough that a session left open is not one. The canonical place is this file; index.ts imports it. */
export const REAUTH_WINDOW_S = 600;

/* `Authorization: Bearer <token>` → the token, or "" */
export function bearerToken(header) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header || "").trim());
  return m ? m[1] : "";
}

/* the JSON payload of a compact JWT, or null — base64url, UTF-8 */
export function jwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    return (claims && typeof claims === "object" && !Array.isArray(claims)) ? claims : null;
  } catch (_) {
    return null;
  }
}

/* the newest `amr[].timestamp` (seconds), or null when there is none to read */
export function lastSignInAt(claims) {
  const amr = claims && claims.amr;
  if (!Array.isArray(amr)) return null;
  let newest = null;
  for (const entry of amr) {
    const t = entry && typeof entry === "object" ? Number(entry.timestamp) : NaN;
    if (Number.isFinite(t) && t > 0 && (newest === null || t > newest)) newest = t;
  }
  return newest;
}

/* recentSignIn(token, verifiedUid, nowMs) → { ok: true, age } | { ok: false, reason }
     reason · 'unreadable' — not a JWT, or its payload is not an object
            · 'other_account' — its `sub` is not the account the Auth server verified
            · 'no_amr' — no sign-in time in it
            · 'stale' — the last sign-in is older than REAUTH_WINDOW_S */
export function recentSignIn(token, verifiedUid, nowMs) {
  const claims = jwtPayload(token);
  if (!claims) return { ok: false, reason: "unreadable" };
  if (!verifiedUid || String(claims.sub || "") !== String(verifiedUid)) return { ok: false, reason: "other_account" };
  const at = lastSignInAt(claims);
  if (at === null) return { ok: false, reason: "no_amr" };
  const age = Math.floor((Number.isFinite(nowMs) ? nowMs : Date.now()) / 1000) - at;
  return age <= REAUTH_WINDOW_S ? { ok: true, age } : { ok: false, reason: "stale" };
}
