-- ============================================================================
--  security-next — a security report is an enquiry the database accepts
-- ----------------------------------------------------------------------------
--  THE GAP (2026-10-03): SECURITY.md told a reporter to use GitHub's private vulnerability reporting,
--  and that is NOT ENABLED on the repository (MEASURED: GET /repos/rwmqx7dwb5-arch/IntMap/
--  private-vulnerability-reporting → {"enabled":false}). Its fallback was «open a minimal public issue»
--  — the one place a vulnerability must not be described. IntMap already has a private inbox: the
--  contact form (contact.html → reader-reports → public.org_inquiries), which only administrators read
--  (RLS, 20261003150000_org_inquiries.sql). This adds the one word that lets a report travel through it.
--
--  The vocabulary is declared once, in supabase/functions/_shared/inquiry-shape.js INQUIRY.purposes; this
--  CHECK is the database's outer bound on the same words, and tests/sales-channels-checks.test.mjs holds
--  the LAST migration that states the list equal to the declaration and to the generated form.
--
--  ⚠ NON-DESTRUCTIVE. The CHECK is widened by one word; every row it accepted before it still accepts.
--  Re-running is a no-op (drop … if exists, then the same add).
--  ⚠ ORDER OF DEPLOYMENT: apply this BEFORE deploying the reader-reports function that accepts
--  «security»; deployed first, a security report is answered 503 «unavailable» (the insert fails) and the
--  form tells the sender it was not sent — nothing is silently lost.
-- ============================================================================

alter table public.org_inquiries drop constraint if exists org_inquiries_purpose_check;
alter table public.org_inquiries add constraint org_inquiries_purpose_check
  check (purpose in ('embed', 'classroom', 'data', 'licence', 'partnership', 'supporter_listing', 'security', 'other'));
