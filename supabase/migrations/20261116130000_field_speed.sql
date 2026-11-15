-- ============================================================================
--  field-speed — how long the map took to become usable for readers, by release, published as shares
-- ----------------------------------------------------------------------------
--  WHAT WAS MISSING. The lab gates measure what a start-up DOWNLOADS (check:perf) and a phone profile
--  on one runner (scripts/frame-profile.mjs); nothing measured what readers actually WAIT, and nothing
--  could say that a release made the map slower for them. The anonymous counter now counts, once per
--  page load, the range the wait fell in and how the launch screen lifted, under the release the page
--  carries (supabase/functions/usage-count/shape.js `ready` / `boot_end` — the declaration, with the
--  bucket edges and why they are where they are). Those rows sit in public.usage_counts, which only an
--  admin may read (20261002120000_usage_counts.sql).
--
--  THIS MIGRATION is the one public reading of them: field_speed(p_days) returns, for each release and
--  device, the SHARE of its page loads in each bucket (and each ending) and a coarse band for how many
--  page loads that is — never a count. Its readers are the nightly bundle builder
--  (scripts/build-service-status.mjs via scripts/field-speed.mjs — the status page «IntMap, now», Atlas
--  `system.speed`, `worktree.mjs status`), so the public statement «on phones, 75% of readers could use
--  release X within 4 s» is computed in one place from the one record.
--
--  ⚠ WHY SHARES AND A BAND, NOT COUNTS. The counts are IntMap's traffic, which the operator decided is an
--  admin's to read (anonymous-usage-counts). A share and a band answer «how fast» without answering «how
--  many»; a release/device with fewer than 100 page loads in the window is not returned at all.
--  THE FLOOR AND THE ROUNDING ARE ONE RULE (.agents/rules/no-ad-hoc-hardcoding.md §4): a share is published as a
--  WHOLE percent, and only for a group of 100 page loads or more. At n ≥ 100 one page load moves a share by at most
--  one point, so every whole percent is reachable from many different n — the row of shares cannot be solved back
--  into its count. Below 100 (or with a decimal place) each load is a step larger than the rounding, and the shares
--  spell n out (MEASURED in review: with one decimal, 30–99 loads give n exactly). Expires if the rounding gets
--  finer — then the floor must rise with it (n ≥ 100 / step).
--  Canon: here (the reader takes the band it is given and states it).
--
--  ⚠ NO NEW STORE, NO NEW PERSONAL DATA. It reads usage_counts and writes nothing; it returns no day, so the
--  answer cannot be differenced day by day into a count either.
-- ============================================================================

create or replace function public.field_speed(p_days integer default 14)
returns table (metric text, release text, device text, bucket text, share integer, loads text)
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select u.metric,
           split_part(u.dimension, '.', 1) as release,
           split_part(u.dimension, '.', 2) as dev,
           split_part(u.dimension, '.', 3) as bucket,
           sum(u.count)::bigint as n
      from public.usage_counts u
     where u.metric in ('ready', 'boot_end')
       and u.dimension ~ '^[0-9]{12}-[0-9a-f]{7,12}\.[md]\.[a-z0-9-]+$'
       and u.day > (now() at time zone 'utc')::date - greatest(1, least(coalesce(p_days, 14), 90))
     group by 1, 2, 3, 4
  ), g as (
    select w.*, sum(w.n) over (partition by w.metric, w.release, w.dev) as total from w
  )
  select g.metric,
         g.release,
         case g.dev when 'm' then 'mobile' else 'desktop' end,
         g.bucket,
         round(100.0 * g.n / g.total)::integer,
         case when g.total >= 10000 then '10000+'
              when g.total >= 3000  then '3000+'
              when g.total >= 1000  then '1000+'
              when g.total >= 300   then '300+'
              else '100+' end
    from g
   where g.total >= 100
   order by g.metric, g.release desc, g.dev, g.bucket;
$$;

comment on function public.field_speed(integer) is
  'field-speed: for each release and device, the share of page loads whose launch screen lifted in each time range (metric ready) and in each way (metric boot_end) over the last p_days (1-90) days, as whole percents with a coarse band for the number of page loads; groups under 100 page loads are withheld (below it the shares would give the count). Reads usage_counts, writes nothing, returns no count and no day. ANON MAY CALL: it is the public reading of reader speed published on the status page, and it returns only whole-percent shares of releases with at least 100 page loads, never a count.';

revoke execute on function public.field_speed(integer) from public;
grant  execute on function public.field_speed(integer) to anon, authenticated, service_role;
