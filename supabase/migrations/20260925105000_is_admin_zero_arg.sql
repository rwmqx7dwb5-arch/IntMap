-- ============================================================================
--  public.is_admin() — the zero-argument form, on EVERY database (idempotent)
-- ----------------------------------------------------------------------------
--  MEASURED 2026-09-25: applying 20260925110000_client_errors.sql to production
--  failed with `42883: function public.is_admin() does not exist`. Production was
--  never built from the baseline: it has `is_admin(uid uuid)` (LANGUAGE sql,
--  search_path = public), while the baseline — and so every CI database — defines
--  `is_admin()`. 20260722100000_security_r155.sql recorded the split and worked
--  around it by referencing neither; the next migration that needed an admin-only
--  policy hit it head on.
--
--  The fix is structural, not a per-migration workaround: this file gives every
--  database the SAME zero-argument function, with the baseline's body. On CI it
--  replaces the baseline's definition with an identical one; on production it adds
--  the function the migrations assume. `is_admin(uuid)` is left in place (policies
--  on production still call it) — nothing is dropped.
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
end;
$$;
comment on function public.is_admin() is 'True when the current JWT user has profiles.is_admin. SECURITY DEFINER to avoid RLS recursion; used by admin-only policies. Defined here as well as in the baseline because production predates the baseline (20260925105000).';
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
