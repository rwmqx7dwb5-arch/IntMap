-- ============================================================================
--  wave4-refine — field_speed reads ONE fixed window; the caller no longer chooses it
-- ----------------------------------------------------------------------------
--  20261116130000_field_speed.sql published field_speed(p_days) to anon with the window as an argument
--  (1–90 days). A whole-percent share over 100+ page loads cannot be solved back into its count — but a
--  window the caller chooses can be narrowed to ONE day (p_days = 1), and two windows a day apart
--  (p_days = 2 and 1) differenced into the day before: «how many readers, on which day» is exactly what
--  the shares were made coarse to withhold. So the window is fixed here and is not an argument:
--
--    FIELD_SPEED_DAYS = 14 (the window the one reader, scripts/field-speed.mjs DAYS, always asked for —
--    the status page says «in the last 14 days»). Expires if the status page needs another window; then
--    it changes HERE and in that reader together (tests/wave4-refine-pages-checks.test.mjs holds them equal).
--
--  Everything else — shares as whole percents, the 100-load floor, the bands, no count and no day — is the
--  function 20261116130000 defined, unchanged. The old signature is dropped (not left beside it): a function
--  that still takes p_days would still let a caller narrow the window.
-- ============================================================================

drop function if exists public.field_speed(integer);

create or replace function public.field_speed()
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
       and u.day > (now() at time zone 'utc')::date - 14
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

comment on function public.field_speed() is
  'field-speed: for each release and device, the share of page loads whose launch screen lifted in each time range (metric ready) and in each way (metric boot_end) over the last 14 days — a FIXED window the caller cannot narrow — as whole percents with a coarse band for the number of page loads; groups under 100 page loads are withheld (below it the shares would give the count). Reads usage_counts, writes nothing, returns no count and no day. ANON MAY CALL: it is the public reading of reader speed published on the status page, and it returns only whole-percent shares of releases with at least 100 page loads over a window no caller chooses, never a count.';

revoke execute on function public.field_speed() from public;
grant  execute on function public.field_speed() to anon, authenticated, service_role;
