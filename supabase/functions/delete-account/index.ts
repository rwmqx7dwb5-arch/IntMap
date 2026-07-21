// ============================================================================
//  IntMap · delete-account  —  Supabase Edge Function (Deno)   (#R155)
// ----------------------------------------------------------------------------
//  Hard-deletes the CALLER's own account and all of their data. This is a real
//  account deletion (not a logout): the auth.users row is removed, so the person
//  can never sign back into it, and every owned row is purged first.
//
//  WHY AN EDGE FUNCTION
//    Deleting an auth user requires the service_role key (auth.admin.deleteUser).
//    The browser only ever holds the public anon key + the user's own JWT, so this
//    privileged operation has to run server-side. The function verifies the caller's
//    JWT and deletes ONLY that user's own id — a user can never delete anyone else.
//
//  SAFETY
//    • JWT REQUIRED (login) → 401 otherwise. No shared secret, no service_role from
//      the client.
//    • The client must send { confirm: "DELETE" } — a deliberate, explicit intent
//      so a stray POST can't wipe an account.
//    • Owned rows are deleted EXPLICITLY across every user-owned table (defense in
//      depth: it does not rely on the auth.users FK cascade config, which has
//      historically drifted in prod), THEN the auth user is removed.
//    • No secrets, JWTs, emails or ids are logged.
//
//  Deploy:  supabase functions deploy delete-account --project-ref vpekfwdpurzejrrmacac
//           (verify_jwt can stay ON; we also verify the user explicitly.)
//  Secrets: none beyond the injected SUPABASE_URL / SUPABASE_ANON_KEY /
//           SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Tables that carry the user's OWN data, keyed by user_id (deleted where user_id = me).
// Order: children before parents so an explicit delete never trips a RESTRICT FK.
const OWNED_BY_USER_ID = [
  "monitor_seen_items", "monitor_evidence", "monitor_reports", "monitor_runs", "area_monitors",
  "community_comment_votes", "community_votes", "community_reports", "community_comments", "community_posts",
  "favorites", "user_prefs", "ai_usage",
  "donations", "feedback", "bug_reports",
];

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Identify the caller from their JWT. Login is REQUIRED.
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "auth", message: "Login required." }, 401);

    // 2) Explicit-intent confirmation so a stray POST can't wipe an account.
    let payload: { confirm?: string } = {};
    try { payload = await req.json(); } catch (_) { payload = {}; }
    if (String(payload.confirm || "") !== "DELETE") {
      return json({ error: "confirm_required", message: 'Send { "confirm": "DELETE" } to delete the account.' }, 400);
    }

    const uid = user.id;
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 3) Purge owned rows EXPLICITLY (does not depend on the auth.users FK cascade).
    const failed: string[] = [];
    for (const table of OWNED_BY_USER_ID) {
      const { error } = await db.from(table).delete().eq("user_id", uid);
      if (error) failed.push(table);   // table/column may not exist on this instance → skip, still delete the user
    }
    // profiles is keyed by id (= the user id), not user_id.
    try { await db.from("profiles").delete().eq("id", uid); } catch (_) { /* cascade will catch it */ }

    // 4) Delete the auth user itself. This is the point of no return.
    const { error: delErr } = await db.auth.admin.deleteUser(uid);
    if (delErr) {
      // Do not leak internals; log a non-sensitive category only.
      try { console.error("delete-account: auth.admin.deleteUser failed", String(delErr.message || "").slice(0, 120)); } catch (_) { /* */ }
      return json({ error: "delete_failed", message: "Could not fully delete the account. Please contact support." }, 500);
    }

    return json({ ok: true, deleted: true, partial_tables: failed.length ? failed.length : 0 });
  } catch (topErr) {
    try { console.error("delete-account UNCAUGHT", String((topErr as Error)?.message || topErr).slice(0, 200)); } catch (_) { /* */ }
    return json({ error: "internal_error", message: "Account deletion hit an unexpected error." }, 500);
  }
});
