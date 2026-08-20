-- ============================================================================
--  IntMap · account deletion becomes ONE TRANSACTION, AND IT KNOWS ITS OWN TABLES
-- ----------------------------------------------------------------------------
--  WHAT WAS WRONG, AND IT WAS WRONG IN THE ONE DIRECTION THAT MATTERS
--
--  supabase/functions/delete-account looped a HARD-CODED list of sixteen tables, issuing one DELETE
--  per table over PostgREST, collected the ones that errored into `failed[]` — and then deleted the
--  auth user anyway, reporting `partial_tables: failed.length` in a 200 response:
--
--      for (const table of OWNED_BY_USER_ID) {
--        const { error } = await db.from(table).delete().eq("user_id", uid);
--        if (error) failed.push(table);        // <- and nothing ever reads this again
--      }
--      const { error: delErr } = await db.auth.admin.deleteUser(uid);
--
--  Three consequences, all of them fail-OPEN:
--    1. Sixteen separate statements are sixteen separate transactions. A failure halfway through
--       leaves the account partly deleted and no way to retry it as a whole.
--    2. The auth user is removed even when rows were NOT. Once auth.users is gone the person cannot
--       sign in to ask again, and the surviving rows are the ones nobody can now attribute or purge.
--    3. The list is a list. `public.monitor_seen_items` had to be added by hand in #R155; a table
--       added next round is silently not deleted, and nothing fails when that happens.
--
--  ⚠ AND THE FK GRAPH DOES NOT COVER IT EITHER. Audited on this schema:
--       ON DELETE CASCADE  profiles, ai_usage, user_prefs, favorites, community_posts,
--                          community_comments, community_votes, community_comment_votes,
--                          community_reports, area_monitors, monitor_runs, monitor_evidence,
--                          monitor_reports, monitor_seen_items
--       ON DELETE SET NULL donations, feedback, bug_reports      <- these SURVIVE the auth delete
--    so "just let the cascade do it" would leave three tables holding the user's own submitted text
--    with a NULL owner. The explicit delete is what removes them, which is why it has to succeed
--    BEFORE the auth user goes and why it must be one unit of work.
--
--  This function is that unit of work. It DISCOVERS the owned tables from the catalog instead of
--  being told, deletes them in one transaction, then RE-COUNTS and raises if anything is left —
--  so a partial delete rolls back to no delete, and the Edge Function keeps the auth user.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  public._owned_by_user_cols() -> (tbl, col)
--  Which columns in `public` identify the OWNER of a row. Two sources, unioned:
--
--    (a) every single-column FOREIGN KEY to auth.users — the declared relationship,
--        whatever the column is called and whatever the delete action is; plus
--        profiles, which is keyed by `id`;
--    (b) every `user_id uuid` column that has NO foreign key at all.
--
--  ⚠ (b) IS NOT BELT-AND-BRACES. IT IS A MEASURED DEFECT. Audited against production on
--  2026-08-20: `public.bug_reports.user_id` HAS NO FOREIGN KEY THERE, although
--  20260718090000_baseline.sql declares it as
--      user_id uuid references auth.users(id) on delete set null
--  So a discovery keyed on foreign keys alone would silently have skipped the one table
--  whose FK had already drifted away — exactly the failure the hard-coded list had, one
--  level down. The migration below re-adds the missing constraint; this clause is what
--  makes the function correct even where a constraint is missing.
--
--  ⚠ IT IS ALSO WHY THE PURGE AND THE VERIFICATION READ THE SAME FUNCTION. When #R268's
--  lesson («two doors, one of them forgotten») applies to a delete, the forgotten door is
--  a table that is emptied but never checked, or checked but never emptied.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._owned_by_user_cols()
returns table (tbl text, col text)
language sql
stable
security definer
set search_path = ''
as $$
  select cl.relname::text, att.attname::text
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class      cl  on cl.oid = con.conrelid
  join pg_catalog.pg_namespace  ns  on ns.oid = cl.relnamespace
  join pg_catalog.pg_class      fcl on fcl.oid = con.confrelid
  join pg_catalog.pg_namespace  fns on fns.oid = fcl.relnamespace
  join pg_catalog.pg_attribute  att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
  where con.contype = 'f'
    and ns.nspname  = 'public'
    and cl.relkind  = 'r'
    and fns.nspname = 'auth'
    and fcl.relname = 'users'
    and array_length(con.conkey, 1) = 1
  union
  select cl.relname::text, att.attname::text
  from pg_catalog.pg_class     cl
  join pg_catalog.pg_namespace ns  on ns.oid = cl.relnamespace
  join pg_catalog.pg_attribute att on att.attrelid = cl.oid
  where ns.nspname = 'public'
    and cl.relkind = 'r'
    and att.attnum > 0
    and not att.attisdropped
    and att.attname = 'user_id'
    and att.atttypid = 'uuid'::regtype;
$$;

comment on function public._owned_by_user_cols() is
  'Every (table, column) in public that identifies the owner of a row: the foreign keys to auth.users, '
  'plus any uuid user_id column whose foreign key is missing. Read by delete_account_data() for both the '
  'delete pass and the verification pass, so the two can never disagree about what "owned" means.';

revoke execute on function public._owned_by_user_cols() from public, anon, authenticated;
grant  execute on function public._owned_by_user_cols() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  public.delete_account_data(uuid) -> jsonb
--  Deletes every row in `public` owned by p_user. Returns a per-table report.
--  Raises (rolling the whole thing back) if anything owned by p_user survives.
--
--  SECURITY DEFINER because it must reach tables whose RLS would otherwise scope it to the caller,
--  and it is called by the Edge Function with the service role. `search_path = ''` so every name it
--  resolves is one this file wrote (the #R155 rule for every definer function in this schema).
--  EXECUTE is revoked from anon/authenticated: this is a service-role entry point, and a logged-in
--  caller who could invoke it with someone else's uuid would be able to erase that account's data.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_account_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owned    record;
  v_rows     bigint;
  v_total    bigint := 0;
  v_report   jsonb  := '{}'::jsonb;
  v_pending  text[] := '{}';
  v_next     text[];
  v_pass     int    := 0;
  v_progress boolean;
  v_left     bigint;
  v_tbl      text;
  v_col      text;
  v_pair     text;
begin
  if p_user is null then
    raise exception 'delete_account_data: p_user is required' using errcode = '22004';
  end if;

  -- ⚠ DISCOVERED, NOT LISTED. Every BASE TABLE in `public` carrying a uuid column that references
  -- auth.users — whatever the column is called, whatever the FK action is — plus the profiles row,
  -- which is keyed by `id` rather than `user_id`. A table added in a later migration is included the
  -- moment its FK exists, which is the property the hard-coded array could not have.
  for v_owned in select * from public._owned_by_user_cols() order by tbl loop
    v_pending := v_pending || (v_owned.tbl || '.' || v_owned.col);
  end loop;

  if array_length(v_pending, 1) is null then
    raise exception 'delete_account_data: no owned tables found — refusing to report success';
  end if;

  -- Passes, because a FUTURE table may reference another with ON DELETE RESTRICT and therefore have
  -- to go first. Today every intra-public FK is CASCADE and one pass clears the list; a pass that
  -- makes no progress while work remains is a real dependency failure and is raised as one.
  while array_length(v_pending, 1) is not null loop
    v_pass := v_pass + 1;
    if v_pass > 8 then
      raise exception 'delete_account_data: could not resolve delete order after % passes (left: %)', v_pass, v_pending;
    end if;
    v_progress := false;
    v_next := '{}';
    foreach v_pair in array v_pending loop
      v_tbl := split_part(v_pair, '.', 1);
      v_col := split_part(v_pair, '.', 2);
      begin
        execute format('delete from public.%I where %I = $1', v_tbl, v_col) using p_user;
        get diagnostics v_rows = row_count;
        v_total    := v_total + v_rows;
        v_report   := v_report || jsonb_build_object(v_tbl, v_rows);
        v_progress := true;
      exception when foreign_key_violation then
        v_next := v_next || v_pair;                 -- a child still holds it; try again next pass
      end;
    end loop;
    if array_length(v_next, 1) is not null and not v_progress then
      raise exception 'delete_account_data: blocked by foreign keys (left: %)', v_next;
    end if;
    v_pending := v_next;
  end loop;

  -- ⚠ RE-COUNT. "The DELETE returned no error" is not "the rows are gone" — a rule, a trigger or a
  -- policy could have swallowed it. This is the check that makes the whole function fail-CLOSED: it
  -- raises inside the transaction, so a partial delete becomes no delete and the caller still has an
  -- account to try again with.
  for v_owned in select * from public._owned_by_user_cols() loop
    execute format('select count(*) from public.%I where %I = $1', v_owned.tbl, v_owned.col)
      into v_left using p_user;
    if v_left > 0 then
      raise exception 'delete_account_data: % rows left in public.%', v_left, v_owned.tbl;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'rows', v_total, 'passes', v_pass, 'tables', v_report);
end;
$$;

comment on function public.delete_account_data(uuid) is
  'Deletes every public row owned by the given auth user in ONE transaction and verifies none remain. '
  'Raises (rolling back) rather than reporting a partial delete. Service-role only; the delete-account '
  'Edge Function calls it and only removes auth.users after it returns ok.';

revoke execute on function public.delete_account_data(uuid) from public, anon, authenticated;
grant  execute on function public.delete_account_data(uuid) to service_role;

-- ============================================================================
--  TWO DRIFTS THIS AUDIT FOUND IN PRODUCTION, BOTH SMALL AND BOTH REAL
--  (read-only audit of project vpekfwdpurzejrrmacac, 2026-08-20)
-- ============================================================================

-- 1. bug_reports.user_id LOST ITS FOREIGN KEY.
--    20260718090000_baseline.sql declares `user_id uuid references auth.users(id) on
--    delete set null`; production has the column and no constraint. Consequences: deleting
--    an auth user leaves bug_reports.user_id pointing at a row that no longer exists (a
--    dangling uuid rather than the declared NULL), and any owner-discovery keyed on foreign
--    keys cannot see the table at all. Re-added exactly as declared — `set null`, not
--    `cascade`, so a bug report survives its reporter's deletion with no owner, which is
--    what the baseline chose and what the explicit purge above then removes.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_class cl on cl.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relname = 'bug_reports' and c.contype = 'f'
      and c.conname = 'bug_reports_user_id_fkey'
  ) then
    -- orphaned ids would make the constraint invalid; clear them first (they are already
    -- meaningless — the user they name is gone)
    update public.bug_reports b set user_id = null
     where b.user_id is not null
       and not exists (select 1 from auth.users u where u.id = b.user_id);
    alter table public.bug_reports
      add constraint bug_reports_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- 2. TRUNCATE ON area_monitors WAS STILL GRANTED TO `authenticated`.
--    ⚠ TRUNCATE IS NOT SUBJECT TO ROW-LEVEL SECURITY. Every policy on this table scopes a
--    caller to their own rows; TRUNCATE ignores all of them and empties the table. Nothing
--    in this project truncates anything, and 20260721120000_area_monitors_hardening.sql
--    already revoked exactly this privilege from `anon` for exactly this reason — the
--    `authenticated` half was simply not written. (It is reachable only by a caller who can
--    issue arbitrary SQL as that role, so this is an over-grant rather than an open door;
--    it costs nothing to close and it is the difference between "denied" and "not offered".)
revoke truncate on public.area_monitors, public.monitor_runs, public.monitor_evidence,
                   public.monitor_reports, public.monitor_seen_items
  from anon, authenticated;
