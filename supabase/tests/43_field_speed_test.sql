-- ============================================================================
--  pgTAP · 43 — field-speed: the public reading of how long the map took to become usable.
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    · the SURFACE — field_speed is SECURITY DEFINER with a pinned search_path, anon may call it and its
--      comment says why (11_definer_execute_test's rule), and anon still cannot read usage_counts itself;
--    · it publishes SHARES, never counts — the arithmetic of the shares, the band, the 100-load floor, whole percents,
--      and that it reads only the two speed metrics (a page view or a layer count never leaves through it);
--    · the window — a row older than p_days is not read.
--  The declaration (buckets, endings, the release alphabet) and the browser side are evaluated in Node by
--  tests/wave4-ops-checks.test.mjs.
-- ============================================================================
begin;
select no_plan();

do $imp$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $imp$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;

create function _sel(k text, q text) returns void language plpgsql as $$
declare c text;
begin
  execute q into c;
  insert into _cap values (k, coalesce(c, '<null>'));
exception
  when insufficient_privilege then insert into _cap values (k, 'DENIED');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_function('public', 'field_speed', array['integer'], 'field-speed: field_speed exists');
select ok((select prosecdef from pg_proc where oid = 'public.field_speed(integer)'::regprocedure),
          'field-speed: field_speed is SECURITY DEFINER (anon cannot read usage_counts itself)');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.field_speed(integer)'::regprocedure)) e where e like 'search_path=%'),
          'field-speed: field_speed pins search_path');
select ok(has_function_privilege('anon', 'public.field_speed(integer)', 'execute'), 'field-speed: anon may call field_speed');
select ok(obj_description('public.field_speed(integer)'::regprocedure, 'pg_proc') ~ 'ANON MAY CALL: \S',
          'field-speed: its comment states why anon may call it');
/* the columns it returns, read from the catalogue: a RETURNS TABLE column is an argument of mode 't' in pg_proc */
select ok(not exists(select 1 from pg_proc p, unnest(p.proargnames, p.proargmodes::text[]) as a(name, mode)
                      where p.oid = 'public.field_speed(integer)'::regprocedure and a.mode = 't'
                        and a.name in ('n', 'count', 'total', 'day')),
          'field-speed: no returned column is a count or a day');
select is((select format_type(a.typ, null) from pg_proc p, unnest(p.proargnames, p.proargmodes::text[], p.proallargtypes) as a(name, mode, typ)
            where p.oid = 'public.field_speed(integer)'::regprocedure and a.mode = 't' and a.name = 'share'),
          'integer', 'field-speed: a share is a whole percent — a decimal place would give a small group''s count back');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE ARITHMETIC — written as the owner (the table refuses everyone else), read as anon
-- ─────────────────────────────────────────────────────────────────────────────
delete from public.usage_counts where metric in ('ready', 'boot_end');
insert into public.usage_counts (day, metric, dimension, count) values
  -- release A, phones: 40 + 60 = 100 page loads (band 100+)
  ((now() at time zone 'utc')::date,     'ready',    '202610130900-aaaaaaa.m.2s', 40),
  ((now() at time zone 'utc')::date - 1, 'ready',    '202610130900-aaaaaaa.m.4s', 60),
  ((now() at time zone 'utc')::date,     'boot_end', '202610130900-aaaaaaa.m.idle', 97),
  ((now() at time zone 'utc')::date,     'boot_end', '202610130900-aaaaaaa.m.timeout', 3),
  -- release A, desktops: 99 page loads — under the floor, withheld (below 100 the shares would give the count)
  ((now() at time zone 'utc')::date,     'ready',    '202610130900-aaaaaaa.d.1s', 99),
  -- a row older than the window: never read
  ((now() at time zone 'utc')::date - 30, 'ready',   '202610130900-aaaaaaa.m.20s', 500),
  -- a dimension that is not the speed shape: never read
  ((now() at time zone 'utc')::date,     'ready',    'not-a-release', 999),
  -- another metric: never leaves through this function
  ((now() at time zone 'utc')::date,     'view',     '', 12345);

set local role anon;
select _sel('anon_table', 'select count(*)::text from public.usage_counts');
select _sel('rows',   'select count(*)::text from public.field_speed(14)');
select _sel('a_m_2s', 'select share::text || ''|'' || loads from public.field_speed(14) where metric = ''ready'' and release = ''202610130900-aaaaaaa'' and device = ''mobile'' and bucket = ''2s''');
select _sel('a_m_4s', 'select share::text from public.field_speed(14) where metric = ''ready'' and release = ''202610130900-aaaaaaa'' and device = ''mobile'' and bucket = ''4s''');
select _sel('a_m_20', 'select count(*)::text from public.field_speed(14) where bucket = ''20s''');
select _sel('a_d',    'select count(*)::text from public.field_speed(14) where device = ''desktop''');
select _sel('end_to', 'select share::text from public.field_speed(14) where metric = ''boot_end'' and bucket = ''timeout''');
select _sel('other',  'select count(*)::text from public.field_speed(14) where metric not in (''ready'', ''boot_end'') or release !~ ''^[0-9]{12}-''');
select _sel('sum',    'select sum(share)::text from public.field_speed(14) where metric = ''ready''');
select _sel('wide',   'select count(*)::text from public.field_speed(90) where bucket = ''20s''');
reset role;

select ok((select v from _cap where k = 'anon_table') in ('DENIED', '0'), 'field-speed: anon still reads nothing of usage_counts directly');
select is((select v from _cap where k = 'rows'), '4', 'field-speed: four rows — two ready buckets and two endings of the one group over the floor');
select is((select v from _cap where k = 'a_m_2s'), '40|100+', 'field-speed: a share of the group, summed over the days, with the band of its page loads');
select is((select v from _cap where k = 'a_m_4s'), '60', 'field-speed: the other bucket of the same group');
select is((select v from _cap where k = 'a_m_20'), '0', 'field-speed: a row older than the window is not read');
select is((select v from _cap where k = 'a_d'), '0', 'field-speed: a group of 99 page loads is withheld');
select is((select v from _cap where k = 'end_to'), '3', 'field-speed: the endings are shares of their own group');
select is((select v from _cap where k = 'other'), '0', 'field-speed: no other metric and no malformed dimension leaves through it');
select is((select v from _cap where k = 'sum'), '100', 'field-speed: the shares of a group add up to the whole');
select is((select v from _cap where k = 'wide'), '1', 'field-speed: a wider window reads the older row');

select * from finish();
rollback;
