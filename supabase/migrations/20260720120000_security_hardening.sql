-- ============================================================================
--  IntMap — SECURITY HARDENING migration (#R138)
-- ----------------------------------------------------------------------------
--  Additive, idempotent, NON-DESTRUCTIVE. Applied through the same manual, gated
--  flow as the baseline (docs/MIGRATIONS.md) — never auto-applied on merge.
--
--  WHAT & WHY
--    `feedback.rating` is a nullable integer that ANYONE (incl. anon) may insert
--    (policy feedback_insert_any WITH CHECK (true)) and it had NO range constraint.
--    The admin console renders it with String.prototype.repeat(rating); an
--    out-of-range value (e.g. rating = 6, or negative) made repeat() throw a
--    RangeError that aborted the ENTIRE feedback render — a one-row, unauthenticated
--    denial-of-service against the admin Feedback tab. The client render is now
--    clamped (admin.html, #R138); this constraint adds the matching guard at the
--    database so a malformed value can never be stored in the first place.
--
--  NOT VALID: a pre-existing out-of-range row (e.g. one an attacker inserted before
--    this fix) will NOT block the migration; the constraint is enforced on every
--    NEW insert/update immediately. After confirming no bad rows remain you may run
--    `alter table public.feedback validate constraint feedback_rating_range;`.
-- ============================================================================

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_rating_range'
      and conrelid = 'public.feedback'::regclass
  ) then
    alter table public.feedback
      add constraint feedback_rating_range
      check (rating is null or (rating between 1 and 5))
      not valid;
  end if;
end $$;

comment on constraint feedback_rating_range on public.feedback is
  '(#R138) rating must be NULL or 1..5. Guards the admin-render RangeError DoS; enforced on new writes.';

commit;
