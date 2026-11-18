-- ============================================================================
--  admin-origin — ADMIN RIGHTS BELONG TO AN MFA SESSION, NOT TO AN ACCOUNT
--  (docs/SECURITY-ARCHITECTURE.md §3 «AuthZ — admin», §8 item 20, §11.4)
--
--  WHAT WAS WRONG
--    `profiles.is_admin` made every session of an administrator account an admin session.
--    The console (admin.html) and the app shared one origin and one localStorage key, so an XSS
--    anywhere in the app read a session that could do everything the console can. Moving the
--    console to its own origin removes that copy of the session, but an administrator who also
--    signed in to the app would still leave a full-power session in the app's storage.
--
--  THE RULE NOW
--    Admin rights need BOTH the flag AND a session that passed the second factor:
--    `auth.jwt() ->> 'aal' = 'aal2'`. Supabase Auth raises a session to aal2 only after a TOTP
--    challenge (`mfa.challengeAndVerify`), which only the console performs; the app never does.
--    A stolen app session of an administrator — or its refresh token — mints aal1 tokens only,
--    and aal1 is refused here. (The app also signs administrator accounts out, js/auth-ui.js; this
--    migration is what makes that a convenience rather than the barrier.)
--
--  ONE PREDICATE
--    Every admin decision goes through `public.is_admin()`. Before this migration nine objects
--    read the column inline (the news-events policies and RPCs, written when production had only
--    `is_admin(uuid)`), and production's own `profiles_select` policy calls `is_admin(auth.uid())`.
--    Each of those would have kept granting aal1 sessions admin rights. They are rewritten below
--    by DISCOVERY over the catalogue (pg_policies / pg_proc), not by a list of names, so a
--    production-only object of the same shape is rewritten too; the last block REFUSES to finish
--    while any policy still decides admin rights some other way.
--    supabase/tests/50_admin_mfa_session_test.sql proves the rule and the absence.
-- ============================================================================

-- ── 1. the one predicate ───────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
end;
$$;
comment on function public.is_admin() is
  'True when the current JWT user has profiles.is_admin AND the session passed the second factor (aal = aal2) — the only admin predicate; every policy and RPC asks this, never profiles.is_admin directly. SECURITY DEFINER to avoid RLS recursion. ANON MAY CALL: it returns only a boolean about the caller (false for anon), and RLS policies anon evaluates may call it — a policy runs with the caller''s privileges.';

-- ── 2. functions that read the column inline → ask is_admin() ──────────────────────────────────
--  The inline guard was written once and copied verbatim into each RPC, so the stored source
--  carries this exact text; pg_get_functiondef + replace re-creates each with its attributes
--  (SECURITY DEFINER, search_path, volatility) and grants unchanged (CREATE OR REPLACE keeps ACLs).
do $$
declare
  inline constant text := 'exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)';
  f record;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc like '%' || inline || '%'
  loop
    execute replace(pg_get_functiondef(f.oid), inline, 'public.is_admin()');
    raise notice 'admin-origin: % now asks public.is_admin()', f.sig;
  end loop;
end;
$$;

-- ── 3. policies that decide admin rights another way → ask is_admin() ──────────────────────────
--  Two shapes exist: the inline EXISTS over profiles (repository migrations) and is_admin(<uid>)
--  (production's profiles_select). Both are matched on the deparsed expression.
do $$
declare
  pol record;
  q text; c text; stmt text;
  -- how the deparser spells the caller: bare, or wrapped as an init-plan sub-select (repository migrations)
  uid_pat constant text := '(\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\)|auth\.uid\(\))';
  -- how it spells the flag: bare (repository) or compared to true (rows created in the dashboard)
  flag_pat constant text := '(p\.is_admin|\(p\.is_admin\s*=\s*true\))';
  -- the deparser writes the sub-query bare or inside its own pair of parentheses; the two
  -- alternatives keep that pair together, so the rewrite never leaves a parenthesis unmatched
  re_exists constant text :=
    '\(EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(public\.)?profiles\s+p\s+WHERE\s+\(\(p\.id\s*=\s*' || uid_pat || '\)\s+AND\s+' || flag_pat || '\)\)\)'
    || '|EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(public\.)?profiles\s+p\s+WHERE\s+\(\(p\.id\s*=\s*' || uid_pat || '\)\s+AND\s+' || flag_pat || '\)\)';
  -- the third shape production carries: auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.is_admin = true)
  -- (policies written in the dashboard, "Allow admins to delete any post/comment"). Same meaning, same rewrite.
  re_in constant text :=
    '\(' || uid_pat || '\s+IN\s*\(\s*SELECT\s+profiles\.id\s+FROM\s+(public\.)?profiles\s+WHERE\s+\(profiles\.is_admin\s*=\s*true\)\)\)';
  re_uid constant text :=
    '(public\.)?is_admin\(' || uid_pat || '\)';
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ re_exists or coalesce(qual, '') ~ re_in or coalesce(qual, '') ~ re_uid
         or coalesce(with_check, '') ~ re_exists or coalesce(with_check, '') ~ re_in or coalesce(with_check, '') ~ re_uid)
  loop
    q := regexp_replace(regexp_replace(regexp_replace(pol.qual, re_exists, 'public.is_admin()', 'g'), re_in, 'public.is_admin()', 'g'), re_uid, 'public.is_admin()', 'g');
    c := regexp_replace(regexp_replace(regexp_replace(pol.with_check, re_exists, 'public.is_admin()', 'g'), re_in, 'public.is_admin()', 'g'), re_uid, 'public.is_admin()', 'g');
    stmt := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if q is not null then stmt := stmt || ' using (' || q || ')'; end if;
    if c is not null then stmt := stmt || ' with check (' || c || ')'; end if;
    execute stmt;
    raise notice 'admin-origin: policy % on % now asks public.is_admin()', pol.policyname, pol.tablename;
  end loop;
end;
$$;

-- ── 4. refuse to finish while a policy decides admin rights without is_admin() ─────────────────
do $$
declare
  left_over text;
begin
  select string_agg(format('%s on %s', policyname, tablename), ', ')
    into left_over
    from pg_policies
   where schemaname = 'public'
     -- `(select public.is_admin())` deparses as `( SELECT is_admin() AS is_admin)`: the alias is the call's name, not a read of the column
     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '(public\.)?is_admin\(\)(\s+AS\s+is_admin)?', '', 'g') ~ 'is_admin';
  if left_over is not null then
    raise exception 'admin-origin: these policies still decide admin rights without public.is_admin() (aal2): %', left_over;
  end if;
end;
$$;
