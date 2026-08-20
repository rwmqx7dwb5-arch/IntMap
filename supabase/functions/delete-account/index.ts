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
//    • ⚠ AND "THEN" IS NOW A CONDITION RATHER THAN AN ORDER. See the note above the handler.
//    • No secrets, JWTs, emails or ids are logged.
//
//  Deploy:  supabase functions deploy delete-account --project-ref vpekfwdpurzejrrmacac
//           (verify_jwt can stay ON; we also verify the user explicitly.)
//  Secrets: none beyond the injected SUPABASE_URL / SUPABASE_ANON_KEY /
//           SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import { createClient } from "@supabase/supabase-js";   // pinned in this function's deno.json

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ══ ⚠⚠ SIXTEEN STATEMENTS, SIXTEEN TRANSACTIONS, AND THE AUTH USER WENT EITHER WAY ═══════════════
   What used to be here was a hard-coded array of sixteen table names and this loop:

       for (const table of OWNED_BY_USER_ID) {
         const { error } = await db.from(table).delete().eq("user_id", uid);
         if (error) failed.push(table);       // "table/column may not exist on this instance -> skip"
       }
       const { error: delErr } = await db.auth.admin.deleteUser(uid);   // ← runs regardless

   Every DELETE was its own transaction over PostgREST, a failure was recorded and then ignored, and
   the auth user was removed even when rows had NOT been. That is fail-OPEN in the worst possible
   direction: once auth.users is gone the person cannot sign in to ask again, and the rows that
   survived are exactly the ones nobody can now attribute or purge. It also could not have covered a
   table nobody remembered to add — `monitor_seen_items` was appended by hand in #R155, and the next
   table would have been missed in silence.

   ⚠ AND THE CASCADE IS NOT A SUBSTITUTE. Audited on this schema: donations, feedback and bug_reports
   are `ON DELETE SET NULL`, so deleting auth.users LEAVES the user's own submitted text behind with
   a NULL owner. Removing those rows is precisely what the explicit pass is for.

   It is one RPC now — public.delete_account_data(uuid), added in
   supabase/migrations/20260820120000_delete_account_txn.sql. That function DISCOVERS the owned
   tables from the FK catalog (so a table added later is covered the moment its foreign key exists),
   deletes them in ONE transaction, re-counts, and RAISES if anything survives — which rolls the
   whole thing back. So this file's job is reduced to the only decision that was ever load-bearing:
   the auth user is deleted if, and only if, the data delete reported success. */

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

    // 3) Purge owned rows in ONE transaction. The RPC raises rather than half-succeeding, so an
    //    error here means NOTHING was deleted — and the account is left intact to try again.
    const { data: purge, error: purgeErr } = await db.rpc("delete_account_data", { p_user: uid });
    const row = Array.isArray(purge) ? purge[0] : purge;
    if (purgeErr || !row || row.ok !== true) {
      /* ⚠ FAIL-CLOSED. The auth user is NOT touched. Logged as a category only — a Postgres error
         message names the schema, the constraint and sometimes the row that tripped it. */
      try { console.error("delete-account: data purge failed", String((purgeErr && purgeErr.code) || "no_ok_flag")); } catch (_) { /* */ }
      return json({ error: "delete_failed", message: "Could not delete the account data. Nothing was removed — please try again or contact support." }, 500);
    }

    // 4) Delete the auth user itself. This is the point of no return, and it is now only reached
    //    once every owned row is provably gone.
    const { error: delErr } = await db.auth.admin.deleteUser(uid);
    if (delErr) {
      // Do not leak internals; log a non-sensitive category only.
      try { console.error("delete-account: auth.admin.deleteUser failed", String(delErr.message || "").slice(0, 120)); } catch (_) { /* */ }
      return json({ error: "delete_failed", message: "Could not fully delete the account. Please contact support." }, 500);
    }

    return json({ ok: true, deleted: true, rows: Number(row.rows || 0) });
  } catch (topErr) {
    try { console.error("delete-account UNCAUGHT", String((topErr as Error)?.message || topErr).slice(0, 200)); } catch (_) { /* */ }
    return json({ error: "internal_error", message: "Account deletion hit an unexpected error." }, 500);
  }
});
