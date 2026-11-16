-- ============================================================================
--  pgTAP · 47 — wave4-refine: what a student hands in is what is kept, under one name rule
--  (supabase/migrations/20261116140000_wave4_refine_community_class.sql)
--    ① public.display_name(): NFKC, trimmed; a control, bidirectional or invisible format character is refused;
--      the ceiling is counted after normalising; not callable by a client.
--    ② class_set_submit(): the name kept is the normalised one, so the same name in another width is the same
--      student (name_taken) and a name hidden behind an invisible or bidi character is invalid_name.
--    ③ the answers are bounded before they are read, then REBUILT: a point to three decimals, a year an integer —
--      and the largest hand-in a real set can produce fits the bound (the header's estimate, measured here).
--  The directory's keyset pages and the owner's own report (IMOWN) are in supabase/tests/38.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;
create function _sel(k text, q text) returns void language plpgsql as $$
declare c text; begin execute q into c; insert into _cap values (k, coalesce(c,'<null>'));
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;
create function _tok(k text) returns text language sql stable as $$ select v from _cap where _cap.k = $1 $$;
grant execute on function _tok(text) to anon, authenticated, service_role;

-- ① ─────────────────────────────────────────────────────────────────────────
select is(public.display_name('  Ａｉｋｏ  ', 24), 'Aiko', 'full-width letters are the letters they look like, trimmed');
select is(public.display_name('Ai' || chr(8203) || 'ko', 24), null, 'a zero-width space is refused');
select is(public.display_name(chr(8238) || 'okiA', 24), null, 'a right-to-left override is refused');
select is(public.display_name('Aiko' || chr(8297), 24), null, 'a bidi isolate is refused');
select is(public.display_name('Ai' || chr(7) || 'ko', 24), null, 'a control character is refused');
select is(public.display_name('Ai' || chr(133) || 'ko', 24), null, 'a C1 control is refused');
select is(public.display_name('   ', 24), null, 'nothing is not a name');
select is(public.display_name(repeat('x', 25), 24), null, 'the ceiling holds');
select is(public.display_name('田中 花子', 24), '田中 花子', 'an ordinary name is kept as typed');
select ok(not has_function_privilege('anon', 'public.display_name(text, integer)', 'execute'), 'anon cannot call the rule directly');
select ok(not has_function_privilege('authenticated', 'public.display_name(text, integer)', 'execute'), 'nor can a signed-in reader');

-- the largest hand-in a real set can produce (SET_LENGTHS 10 places at three decimals) fits the bound the function reads
select ok(pg_column_size((select jsonb_agg(jsonb_build_array(-179.999, -89.999)) from generate_series(1, 10))) < 4096,
          'the largest real hand-in is under the 4096-byte bound (the migration''s estimate, measured)');

-- ② ③ ──────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into public.class_sets (kind, seed, n) values ('where', 'refine1', 10);
insert into public.class_sets (kind, seed, n) values ('when', 'refine2', 5);
reset role;
create temp table _codes as select kind, code from public.class_sets where seed in ('refine1', 'refine2');
grant select on _codes to anon;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('h_first',  $q$select public.class_set_submit((select code from _codes where kind = 'where'), 'Aiko',
  (select jsonb_agg(jsonb_build_array(139.6917123456, 35.6895123456)) from generate_series(1, 10))) ->> 'ok'$q$);
select _sel('h_wide',   $q$select public.class_set_submit((select code from _codes where kind = 'where'), 'Ａｉｋｏ',
  (select jsonb_agg(null::jsonb) from generate_series(1, 10))) ->> 'error'$q$);
select _sel('h_zw',     $q$select public.class_set_submit((select code from _codes where kind = 'where'), 'Ai' || chr(8203) || 'ko',
  (select jsonb_agg(null::jsonb) from generate_series(1, 10))) ->> 'error'$q$);
select _sel('h_rlo',    $q$select public.class_set_submit((select code from _codes where kind = 'where'), chr(8238) || 'okiA',
  (select jsonb_agg(null::jsonb) from generate_series(1, 10))) ->> 'error'$q$);
select _sel('h_huge',   $q$select public.class_set_submit((select code from _codes where kind = 'where'), 'Ben',
  (select jsonb_agg(jsonb_build_array(('1.' || repeat('1', 900))::numeric, 1)) from generate_series(1, 10))) ->> 'error'$q$);
select _sel('h_largest', $q$select public.class_set_submit((select code from _codes where kind = 'where'), 'Chen',
  (select jsonb_agg(jsonb_build_array(-179.999, -89.999)) from generate_series(1, 10))) ->> 'ok'$q$);
select _sel('h_year',   $q$select public.class_set_submit((select code from _codes where kind = 'when'), 'Aiko',
  '[1945.0, 1914, null, -44, 2001.000]'::jsonb) ->> 'ok'$q$);
select _sel('h_frac',   $q$select public.class_set_submit((select code from _codes where kind = 'when'), 'Dan',
  '[1945.5, null, null, null, null]'::jsonb) ->> 'error'$q$);
reset role;

select is(_tok('h_first'), 'true',         'a hand-in to six decimals is taken');
select is(_tok('h_wide'),  'name_taken',   'the same name in full-width is the same student — the first hand-in stands');
select is(_tok('h_zw'),    'invalid_name', 'a name with a zero-width space in it is refused');
select is(_tok('h_rlo'),   'invalid_name', 'a name behind a right-to-left override is refused');
select is(_tok('h_huge'),  'invalid',      'answers past the size bound are refused before they are read');
select is(_tok('h_largest'), 'true',       'the largest real hand-in is taken');
select is(_tok('h_year'),  'true',         'whole years written with a decimal point are years');
select is(_tok('h_frac'),  'invalid',      'a fractional year is not one');
select is((select a.answers -> 0 from public.class_set_answers a join public.class_sets s on s.id = a.set_id where s.seed = 'refine1' and a.name = 'Aiko'),
          '[139.692, 35.690]'::jsonb, 'a point is kept to three decimals — what the board promises, not what was sent');
select is((select a.answers from public.class_set_answers a join public.class_sets s on s.id = a.set_id where s.seed = 'refine2' and a.name = 'Aiko'),
          '[1945, 1914, null, -44, 2001]'::jsonb, 'a year is kept as an integer, a skip as null');
select is((select jsonb_typeof(a.answers -> 0) from public.class_set_answers a join public.class_sets s on s.id = a.set_id where s.seed = 'refine2' and a.name = 'Aiko'),
          'number', 'and is a number');
select is((select count(*)::int from public.class_set_answers a join public.class_sets s on s.id = a.set_id where s.seed = 'refine1'), 2,
          'only the two accepted hand-ins were kept');

select * from finish();
rollback;
