-- ============================================================================
--  ai-usage-ledger-sign — A DAILY ALLOWANCE COUNTER NEVER GOES BELOW ZERO, WHOEVER WRITES IT
-- ----------------------------------------------------------------------------
--  OBSERVED (production, read-only, 2026-10-01 14:04 UTC): public.ai_usage held 25 rows on 24 days
--  with a NEGATIVE count — the smallest −99,999,938, July's sum −110,219,626. 23 rows belong to the
--  one admin account, 2 to two ordinary accounts (−100 on 2026-07-10, −10 on 2026-09-14). The last
--  of them was written 2026-09-17 19:10 UTC; no row since is negative.
--
--  WHERE THEY CAME FROM. Not from any RPC: every writer of `count` in these migrations, and the live
--  bodies in production (read from pg_proc the same day), either adds 1 under the limit or
--  subtracts 1 through greatest(0, …). pg_stat_statements (since 2026-05-31) holds the writer:
--      update public.ai_usage set (count) = (select count from json_populate_record($1::public.ai_usage, $2))
--       where user_id = $3 and usage_date = $4                                         — 49 calls
--  which is the statement Supabase Studio's table editor issues when a cell is edited, next to the
--  grid's own `select * from public.ai_usage order by …` reads. The values themselves have the shape
--  of a typed offset minus the day's uses (−99,999,938 = −10⁸ + 62, −9,999,985 = −10⁷ + 15,
--  −99,872 = −10⁵ + 128): a negative count is an allowance of `limit − count` uses, so writing −10⁸
--  lifted that day's limit.
--
--  WHY NOTHING STOPPED IT. «ai_usage is written only by the SECURITY DEFINER RPCs» (baseline,
--  docs/DATABASE.md guarantee 3) is a statement about GRANTS, and grants bind anon / authenticated.
--  The table owner — the role Studio and the SQL editor run as — is not bound by them, and the table
--  had no constraint on the value. The invariant lived in the writers' arithmetic, so the one writer
--  without that arithmetic could break it.
--
--  WHAT THIS FILE DOES. It puts the invariant on the COLUMN, where every role meets it: a CHECK
--  (count >= 0) on both daily allowance counters, ai_usage and ai_gloss_usage (the same shape, the
--  same refund arithmetic; it held no negative row). The third table with a `count` column,
--  client_errors, already carries check (count >= 1). supabase/tests/16 asserts it over the catalogue
--  — every base table in public with a `count` column has a lower bound — not over these names.
--
--  ⚠ NON-DESTRUCTIVE. The constraint is added NOT VALID, which enforces it on every row inserted or
--  updated from now on and leaves the existing rows as they are; it is then VALIDATED here only for a
--  table that holds no violating row (a fresh database, ai_gloss_usage in production). In production
--  ai_usage stays NOT VALID until its 25 negative rows are dealt with — that is a separate migration
--  (a separate repair migration, held for the owner's decision — dev-notes/2026-10-01-ai-usage-ledger-sign.md) because it rewrites values, and a decision about
--  rewriting is not a constraint's to make.
--  ⚠ WHAT IT CHANGES FOR AN OPERATOR: typing a negative count in the table editor now fails with
--  23514. Giving an account more uses is profiles.plan (PLAN_LIMITS in _shared/ai-ledger.js) or the
--  DEV_USER_IDS override — the two places the ledger already reads.
--  ⚠ NO RPC CAN NOW FAIL ON IT: the increments start from >= 0 and add 1, the refunds go through
--  greatest(0, …), and record_ai_usage never touches count. An UPDATE of one of the existing negative
--  rows would fail (a NOT VALID check still checks the new tuple), but every writer touches only
--  today's row or the row of a turn opened within the last day, and the newest negative row is dated
--  2026-09-17.
-- ============================================================================

do $$
declare
  t text;
  c text;
  bad boolean;
begin
  foreach t in array array['ai_usage', 'ai_gloss_usage'] loop
    c := t || '_count_nonnegative';
    if not exists (select 1 from pg_constraint
                    where conrelid = format('public.%I', t)::regclass and conname = c) then
      execute format('alter table public.%I add constraint %I check (count >= 0) not valid', t, c);
    end if;
    execute format('select exists (select 1 from public.%I where count < 0)', t) into bad;
    if not bad then
      execute format('alter table public.%I validate constraint %I', t, c);
    end if;
  end loop;
end
$$;

comment on constraint ai_usage_count_nonnegative on public.ai_usage is
  'ai-usage-ledger-sign: a day''s allowance counter is never negative, for every role including the table owner (Studio). A negative count was a lifted limit.';
comment on constraint ai_gloss_usage_count_nonnegative on public.ai_gloss_usage is
  'ai-usage-ledger-sign: the gloss lane''s day counter is never negative, for every role including the table owner.';

comment on table public.ai_usage is
  'Daily AI free-use counter (+ that day''s provider cost). The browser roles cannot write it (grants); the RPCs are the only code that does; count >= 0 is a CHECK because the owner role is bound by neither.';
