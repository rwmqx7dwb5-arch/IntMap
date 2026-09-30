-- ============================================================================
--  anon-write-guard — a reader's feedback and bug reports are written by the reader-reports Edge
--  Function, behind the shared token buckets, and no longer by PostgREST directly
-- ----------------------------------------------------------------------------
--  THE FINDING (audit, 2026-09-30): `feedback` and `bug_reports` accepted INSERT from `anon` and
--  `authenticated` straight through PostgREST (policies feedback_insert_any / bug_reports_insert_any,
--  and the table grant `insert … to anon, authenticated`). #R155's len_guard bounds how LONG one row
--  may be; nothing bounded HOW MANY. The publishable key is in every page, so one loop of
--  `POST /rest/v1/feedback` could write rows for as long as it ran — PII-bearing rows that an admin
--  reads one by one in admin.html.
--
--  THE SHAPE IT NOW HAS is the one client-errors already had (20260925110000_client_errors.sql): the
--  browser POSTs to an Edge Function (supabase/functions/reader-reports), which checks the Origin,
--  reads the body under a ceiling, takes a token from a per-caller bucket and from a project-wide
--  daily bucket (`public.relay_take`, 20260918100000_r801_relay_rate_limit.sql — the shared store
--  every isolate reaches), verifies the caller's account with the Auth server when there is one, and
--  only then writes the row with the service role. The provenance rule #R801 put in the policy
--  («a report is anonymous or the caller's own») is kept, and is now the function's: `user_id` and
--  the account's e-mail come from the verified session, never from the body.
--
--  THIS MIGRATION closes the direct path, at both layers:
--    · the INSERT policies are dropped — with RLS on and no INSERT policy, every insert by
--      anon/authenticated is refused even if a grant comes back;
--    · the INSERT privilege is revoked — the grant layer is what a later default-privilege grant
--      would reopen, so it is closed explicitly as well (docs/SECURITY-ARCHITECTURE.md §8 item 6).
--  Reading and deleting are unchanged (admin-only via RLS). service_role keeps its privileges
--  (it bypasses RLS; that is the function's write path).
--
--  ⚠ NON-DESTRUCTIVE. No row is deleted, rewritten or moved; no column changes. Re-running is a no-op.
--  ⚠ ORDER OF DEPLOYMENT: apply this AFTER the reader-reports function is deployed and the client
--    that posts to it is live. Applied first, the site's feedback form answers «could not send» and
--    the bug reporter keeps the report on the device (its offline fallback) until they are.
-- ============================================================================

drop policy if exists feedback_insert_any    on public.feedback;
drop policy if exists bug_reports_insert_any on public.bug_reports;

revoke insert on table public.feedback    from public, anon, authenticated;
revoke insert on table public.bug_reports from public, anon, authenticated;

comment on table public.feedback is
  'User feedback (PII: email + free text). Written only by the reader-reports Edge Function (service role, behind the relay_take buckets; user_id from the verified session); only admins may read or delete.';
comment on table public.bug_reports is
  'Bug reports (PII: email + diagnostics). Written only by the reader-reports Edge Function (service role, behind the relay_take buckets; user_id from the verified session); only admins may read.';
