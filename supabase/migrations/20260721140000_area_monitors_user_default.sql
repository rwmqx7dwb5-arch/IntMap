-- ============================================================================
--  IntMap — AREA MONITORS: user_id default (#R150)
-- ----------------------------------------------------------------------------
--  WHY
--    area_monitors.user_id is `not null` and the INSERT RLS policy is
--    `with check (user_id = auth.uid())`, but the logged-in client insert path
--    omitted user_id entirely — so every "Create monitor" from the UI violated
--    the NOT NULL constraint / RLS and returned "Could not save the monitor".
--    (The feature had only ever been exercised via the service_role runner,
--    which sets user_id explicitly; the client path was never actually run.)
--
--    The client fix (index.html) now sets user_id from the session like every
--    other user-owned insert. THIS migration adds a DB-side default of
--    auth.uid() as belt-and-suspenders: any authenticated insert that omits
--    user_id is populated with the caller's id, which also satisfies the RLS
--    WITH CHECK. The service_role runner passes user_id explicitly, so an
--    explicit value always overrides the default — no behavior change there.
--
--  IDEMPOTENT & NON-DESTRUCTIVE
--    Only ALTER COLUMN ... SET DEFAULT. No data change, no DROP, safe to re-run.
-- ============================================================================

begin;

alter table public.area_monitors
  alter column user_id set default auth.uid();

comment on column public.area_monitors.user_id is
  '(#R150) Owner. Defaults to auth.uid() so an authenticated client insert that omits it is still populated correctly (and satisfies the insert RLS WITH CHECK). service_role sets it explicitly.';

commit;
