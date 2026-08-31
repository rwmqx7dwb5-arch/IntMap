-- ============================================================================
--  R507 · public.profiles_public: SECURITY DEFINER view → real table + sync trigger
--
--  WHAT THE SUPABASE SECURITY ADVISOR REPORTED (level ERROR / "CRITICAL",
--  lint 0010_security_definer_view, prod-observed 2026-08-31):
--    `public.profiles_public` is a view owned by `postgres` with no
--    `security_invoker` option, so it reads `public.profiles` with the VIEW
--    OWNER's rights and bypasses that table's row-level security entirely.
--    docs/SECURITY-ARCHITECTURE.md §8 item 7 recorded this as intended-but-risky:
--    the projection is only (id, display_name, bio, avatar_url), so nothing leaks
--    TODAY — but "a future column added to the view would inherit the bypass",
--    and nothing in the schema stops that column from being `email`.
--
--  WHY NOT `alter view … set (security_invoker = on)` (the advisor's own remedy)
--    A SECURITY INVOKER view is evaluated with the CALLER's privileges and the
--    base table's RLS. `public.profiles` has exactly one SELECT policy —
--    profiles_select: USING (auth.uid() = id OR is_admin(auth.uid())) — so an
--    invoker view would return the caller's OWN row and nothing else, and `anon`
--    (which holds no privilege at all on profiles, #R155) would get a permission
--    error. Community author cards would stop rendering for everyone.
--    Making it work would mean adding a `USING (true)` SELECT policy to profiles
--    and relying on COLUMN-level grants to keep email/is_admin/is_pro/plan hidden.
--    That is exactly the barrier #R155 proved untrustworthy: Supabase's default
--    privileges in `public` hand `anon`/`authenticated` ALL on tables, which is
--    how the blanket UPDATE that allowed self-promotion to admin appeared without
--    anyone writing a `grant`. Trading an RLS barrier for a grant barrier here
--    would put every user's e-mail one default-privilege reset away from public.
--
--  WHAT THIS MIGRATION DOES INSTEAD — make the separation STRUCTURAL
--    `profiles_public` becomes a REAL TABLE that physically contains only the four
--    public columns, kept in step with `profiles` by an AFTER trigger. There is no
--    RLS bypass left to inherit, because there is no view: a column added to
--    `profiles` tomorrow simply is not in this table. RLS is on, the only policy is
--    SELECT USING (true) — which is the honest statement of what this data is —
--    and no role holds a write grant, so the trigger is the only writer.
--    The relation name, the four column names and their types are unchanged, so
--    js/community-board.js (`from('profiles_public').select('display_name,bio,
--    avatar_url')`) and every existing pgTAP assertion keep working untouched.
--
--  ⚠ The sync function is SECURITY DEFINER because the caller (`authenticated`
--    updating its own display_name) must NOT be able to write profiles_public
--    directly. Its EXECUTE privilege is revoked from public/anon/authenticated:
--    PostgreSQL checks EXECUTE on a trigger function at CREATE TRIGGER time, not
--    when the trigger fires (verified against production inside a rolled-back
--    transaction), so the sync still runs while no client can call it.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. DROP THE VIEW. `drop view if exists` raises "is not a view" once the table
--     exists, so the swap is guarded by relkind and the migration stays re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles_public' and c.relkind = 'v'
  ) then
    execute 'drop view public.profiles_public';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE TABLE — the same four columns the view projected, and only those.
--     ON DELETE CASCADE from profiles means an account deletion (delete-account
--     Edge Function → auth.users → profiles) takes the public card with it.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles_public (
  id           uuid primary key references public.profiles(id) on delete cascade,
  display_name text,
  bio          text,
  avatar_url   text
);
comment on table public.profiles_public is
  '(#R134/#R155/#R507) Public-safe projection of profiles (id, display_name, bio, avatar_url), kept in step by the profiles_public_sync trigger. A TABLE rather than a view since #R507: a view without security_invoker read profiles with the owner rights and bypassed its RLS, so any column added to it would have inherited that bypass. Used for community author cards.';

alter table public.profiles_public enable row level security;

-- The point of this table is that it is world-readable; say so as a policy rather
-- than as an RLS bypass hidden in a view definition.
drop policy if exists profiles_public_select on public.profiles_public;
create policy profiles_public_select on public.profiles_public for select using (true);

-- Least privilege, #R155 style: strip the default-privilege ALL, re-grant SELECT
-- only. No role can write this table; the trigger is the only writer.
revoke all on public.profiles_public from anon, authenticated;
grant select on public.profiles_public to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. THE SYNC TRIGGER. UPDATE is column-scoped so a login_count bump or an
--     is_pro change does not rewrite a row that did not change.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_profiles_public()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    delete from public.profiles_public where id = old.id;
    return old;
  end if;
  insert into public.profiles_public (id, display_name, bio, avatar_url)
  values (new.id, new.display_name, new.bio, new.avatar_url)
  on conflict (id) do update
    set display_name = excluded.display_name,
        bio          = excluded.bio,
        avatar_url   = excluded.avatar_url;
  return new;
end;
$fn$;
comment on function public.sync_profiles_public() is
  '(#R507) Keeps public.profiles_public in step with the four public columns of public.profiles. SECURITY DEFINER so the trigger can write a table no client may write; EXECUTE revoked from anon/authenticated because a trigger function needs no EXECUTE privilege at fire time.';

revoke all on function public.sync_profiles_public() from public, anon, authenticated;

drop trigger if exists profiles_public_sync on public.profiles;
create trigger profiles_public_sync
  after insert or update of display_name, bio, avatar_url or delete on public.profiles
  for each row execute function public.sync_profiles_public();

-- ─────────────────────────────────────────────────────────────────────────────
--  4. BACKFILL — every profile that already exists gets its public card.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.profiles_public (id, display_name, bio, avatar_url)
select id, display_name, bio, avatar_url from public.profiles
on conflict (id) do update
  set display_name = excluded.display_name,
      bio          = excluded.bio,
      avatar_url   = excluded.avatar_url;

commit;

-- PostgREST caches the schema; without this the relation stays a view to the API
-- until the next restart. Outside the transaction so the reload sees the new shape.
notify pgrst, 'reload schema';
