-- ============================================================================
--  sales-channels — where an organisation's enquiry is kept, and the supporters who asked to be named
-- ----------------------------------------------------------------------------
--  THE GAP (2026-10-03): IntMap could be embedded (?embed=1, js/embed-mode.js) and taught with
--  (teachers.html), but a newsroom, a school board or a research group that wanted to ask about it had
--  nowhere to write. LICENSE §6 says «to obtain a commercial license, contact the copyright holder» and
--  no contact existed. PRODUCT.md §2.4 designed a public list of supporters and left it unbuilt because
--  its design needed a Stripe webhook (an external-service change that is the operator's to approve).
--
--  THIS MIGRATION is two stores:
--    · public.org_inquiries — one row per enquiry sent from contact.html (and ja/contact.html). PII
--      (a name, an e-mail address, free text). Written ONLY by the reader-reports Edge Function as
--      service_role, behind the shared relay_take buckets — the shape anon-write-guard
--      (20260930090000) gave feedback and bug_reports. ⚠ There is deliberately NO anon INSERT policy:
--      supabase/tests/14_anon_write_guard_test.sql holds every table in public to «no direct INSERT
--      from anon», and a PostgREST insert path is exactly what that audit closed. Read, triaged and
--      deleted only by an admin (admin-inquiries.html).
--    · public.supporters — the names shown on support.html. A row exists only because an admin wrote
--      it, after the supporter asked to be listed (an enquiry with purpose «supporter_listing») and the
--      admin matched the gift in the Stripe dashboard by hand. No webhook, no payment data, no amount:
--      a display name, the month, an optional line, and when consent was given. Everybody may read the
--      rows that are listed; only an admin writes.
--
--  RETENTION (purge_org_inquiries, scheduled daily below) — operator's choices, stated as such
--  (.agents/rules/no-ad-hoc-hardcoding.md §4):
--    · a row the admin marked «spam» is deleted after 30 days. ESTIMATE: long enough to notice and undo
--      a mis-marked enquiry; nothing in it is worth keeping. Expires if the admin console ever reports
--      a spam mark being undone after more than a few days.
--    · every row is deleted 730 days after it arrived. ESTIMATE: an adoption conversation follows a
--      school year or a publishing season, so two years keeps last year's thread when the next one
--      starts. Expires when the operator decides a different period; the privacy text states this one.
--    The canonical numbers are the defaults of purge_org_inquiries; the privacy text quotes them.
--
--  ⚠ NON-DESTRUCTIVE. Two new tables and two new functions; no existing table, column, policy or grant
--  changes. Re-running is a no-op (if not exists / or replace / drop policy if exists).
--  ⚠ ORDER OF DEPLOYMENT: apply this BEFORE deploying the reader-reports function that writes
--  org_inquiries; deployed first, an enquiry is answered 503 «unavailable» (the insert fails) and the
--  contact page tells the sender it was not sent — nothing is silently lost.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. org_inquiries
--     The vocabularies (audience, purpose) are declared once, in supabase/functions/reader-reports
--     /index.ts INQUIRY; these CHECKs are the database's outer bound on the same shape, and
--     tests/sales-channels-checks.test.mjs holds the two equal.
--     The length ceilings are the canonical numbers the function restates (LIMITS.inquiry).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.org_inquiries (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  audience      text        not null check (audience in ('newsroom', 'education', 'research', 'supporter', 'other')),
  purpose       text        not null check (purpose  in ('embed', 'classroom', 'data', 'licence', 'partnership', 'supporter_listing', 'other')),
  name          text        not null check (char_length(name) between 1 and 120),
  email         text        not null check (char_length(email) between 3 and 254 and email like '%_@_%'),
  organization  text                 check (organization is null or char_length(organization) <= 200),
  role          text                 check (role is null or char_length(role) <= 120),
  website       text                 check (website is null or (char_length(website) <= 400 and website ~* '^https?://')),
  country       text                 check (country is null or char_length(country) <= 80),
  message       text        not null check (char_length(message) between 1 and 5000),
  consent       boolean     not null check (consent),
  user_id       uuid                 references auth.users (id) on delete set null,
  lang          text                 check (lang is null or char_length(lang) <= 16),
  page          text                 check (page is null or char_length(page) <= 400),
  status        text        not null default 'new' check (status in ('new', 'replied', 'closed', 'spam')),
  admin_note    text                 check (admin_note is null or char_length(admin_note) <= 2000),
  handled_at    timestamptz
);
create index if not exists org_inquiries_created_idx on public.org_inquiries (created_at desc);
comment on table public.org_inquiries is
  'sales-channels: enquiries from organisations (newsrooms, schools, research groups, NGOs) and supporter-listing requests (PII: name, e-mail, free text). Written only by the reader-reports Edge Function (service role, behind the relay_take buckets; user_id from the verified session when there is one); read, triaged and deleted only by admins; spam purged after 30 days, everything after 730 (purge_org_inquiries).';

alter table public.org_inquiries enable row level security;

-- ⚠ TRUNCATE / REFERENCES / TRIGGER are not subject to RLS, so the grant layer refuses them: revoke
--   everything, then give back exactly what the admin policies need (docs/SECURITY-ARCHITECTURE.md §8).
revoke all on table public.org_inquiries from public, anon, authenticated;
grant select, delete on table public.org_inquiries to authenticated;
grant update (status, admin_note, handled_at) on table public.org_inquiries to authenticated;
grant select, insert, update, delete on table public.org_inquiries to service_role;

drop policy if exists org_inquiries_admin_select on public.org_inquiries;
create policy org_inquiries_admin_select on public.org_inquiries
  for select to authenticated using ((select public.is_admin()));
drop policy if exists org_inquiries_admin_update on public.org_inquiries;
create policy org_inquiries_admin_update on public.org_inquiries
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists org_inquiries_admin_delete on public.org_inquiries;
create policy org_inquiries_admin_delete on public.org_inquiries
  for delete to authenticated using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
--  2. supporters
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supporters (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  display_name  text        not null check (char_length(btrim(display_name)) between 1 and 60),
  since_month   date        not null check (since_month = date_trunc('month', since_month)::date),
  note          text                 check (note is null or char_length(note) <= 140),
  consented_at  timestamptz not null,
  listed        boolean     not null default true
);
create index if not exists supporters_since_idx on public.supporters (since_month);
comment on table public.supporters is
  'sales-channels: the supporters shown on support.html, each one because they asked to be named (an org_inquiries row with purpose supporter_listing) and an admin matched the gift by hand. No amount, no payment data, no e-mail. Everyone may read listed rows; only admins write. Removed on the supporter''s request.';

alter table public.supporters enable row level security;

revoke all on table public.supporters from public, anon, authenticated;
-- anon reads three columns; a signed-in reader (and so an admin) reads the row
grant select (display_name, since_month, note) on table public.supporters to anon;
grant select, insert, update, delete on table public.supporters to authenticated;
grant select, insert, update, delete on table public.supporters to service_role;

drop policy if exists supporters_public_read on public.supporters;
create policy supporters_public_read on public.supporters
  for select to anon, authenticated using (listed);
drop policy if exists supporters_admin_read on public.supporters;
create policy supporters_admin_read on public.supporters
  for select to authenticated using ((select public.is_admin()));
drop policy if exists supporters_admin_insert on public.supporters;
create policy supporters_admin_insert on public.supporters
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists supporters_admin_update on public.supporters;
create policy supporters_admin_update on public.supporters
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists supporters_admin_delete on public.supporters;
create policy supporters_admin_delete on public.supporters
  for delete to authenticated using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
--  3. purge_org_inquiries — the retention the privacy text states. service_role only.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_org_inquiries(p_spam_days integer default 30, p_keep_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.org_inquiries q
   where (q.status = 'spam' and q.created_at < now() - make_interval(days => greatest(1, coalesce(p_spam_days, 30))))
      or q.created_at < now() - make_interval(days => greatest(1, coalesce(p_keep_days, 730)));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.purge_org_inquiries(integer, integer) is
  'sales-channels: deletes enquiries marked spam after p_spam_days (30) and every enquiry after p_keep_days (730). service_role only (pg_cron).';

revoke execute on function public.purge_org_inquiries(integer, integer) from public, anon, authenticated;
grant  execute on function public.purge_org_inquiries(integer, integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE SCHEDULE — daily at 03:37 UTC (ten minutes after usage-counts-purge). Same guard as
--     20261002120000_usage_counts.sql: pg_cron exists in production and may not exist locally / in CI.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the org-inquiries-purge schedule';
    return;
  end if;
  perform cron.schedule('org-inquiries-purge', '37 3 * * *', 'select public.purge_org_inquiries(30, 730)');
end $$;
