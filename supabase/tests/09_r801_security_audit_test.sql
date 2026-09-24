-- ============================================================================
--  pgTAP · 09 — #R801 security audit: the turn ledger cannot be refunded after
--  it answered, refunds are atomic, privileges that bypass RLS are gone from
--  every table, SECURITY DEFINER functions pin their search_path, a report
--  cannot be filed as somebody else, and an author edits content, not provenance.
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
create function _run(k text, q text) returns void language plpgsql as $$
begin execute q; insert into _cap values (k,'OK');
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. A TURN THAT ANSWERED KEEPS ITS CHARGE. User C (33…) starts at 0 uses.
--     charge → settle → refund: the count stays, the row stays.
--     charge → refund → refund: one decrement, not two.
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('c1', 'select used::text || ''/'' || charged::text from public.consume_ai_turn(''33333333-3333-3333-3333-333333333333'',10,''turn-S'',6,900)');  -- 1/true
select _sel('s1', 'select public.settle_ai_turn(''33333333-3333-3333-3333-333333333333'',''turn-S'')::text');                                              -- true
select _run('r1', 'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''turn-S'')');
select _sel('n1', 'select count::text from public.ai_usage where user_id=''33333333-3333-3333-3333-333333333333'' and usage_date=current_date');            -- 1 (kept)
select _sel('c2', 'select used::text || ''/'' || charged::text from public.consume_ai_turn(''33333333-3333-3333-3333-333333333333'',10,''turn-S'',6,900)');  -- 1/false (still the same paid turn)
select _sel('c3', 'select used::text || ''/'' || charged::text from public.consume_ai_turn(''33333333-3333-3333-3333-333333333333'',10,''turn-F'',6,900)');  -- 2/true
select _run('r2', 'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''turn-F'')');
select _run('r3', 'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''turn-F'')');
select _sel('n2', 'select count::text from public.ai_usage where user_id=''33333333-3333-3333-3333-333333333333'' and usage_date=current_date');            -- 1 (one refund, not two)
select _sel('s0', 'select public.settle_ai_turn(''33333333-3333-3333-3333-333333333333'','''')::text');                                                    -- false (no turn)
reset role;
-- the row is read as its OWNER (ai_turns_select_own): service_role holds no table grant on the ledger,
-- only the RPCs do, and that is the point of the ledger.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('row1','select (succeeded::text) from public.ai_turns where user_id=''33333333-3333-3333-3333-333333333333'' and turn_key=''turn-S''');     -- true (row kept)
reset role;

select is((select v from _cap where k='c1'),   '1/true',  'R801: the first call of the turn pays');
select is((select v from _cap where k='s1'),   'true',    'R801: settle_ai_turn marks the turn as answered');
select is((select v from _cap where k='n1'),   '1',       'R801: a refund after the answer does NOT give the use back');
select is((select v from _cap where k='row1'), 'true',    'R801: ...and the turn row survives, marked succeeded');
select is((select v from _cap where k='c2'),   '1/false', 'R801: a continuation of the settled turn is still free (no second charge)');
select is((select v from _cap where k='c3'),   '2/true',  'R801: a new turn pays');
select is((select v from _cap where k='n2'),   '1',       'R801: two refunds of one unanswered turn decrement once (DELETE ... RETURNING is atomic)');
select is((select v from _cap where k='s0'),   'false',   'R801: settling an empty turn key is a no-op');

-- settle is service_role only
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('a_settle', 'select public.settle_ai_turn(''11111111-1111-1111-1111-111111111111'',''x'')::text');
reset role;
select is((select v from _cap where k='a_settle'), 'DENIED', 'R801: authenticated cannot call settle_ai_turn');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. NO TABLE IN public GRANTS TRUNCATE / REFERENCES / TRIGGER TO anon OR authenticated.
--     Measured over the catalogue, not over a list of names, so the next table is covered too.
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p')
       and c.relname <> '_cap'   -- this file's own scratch table, created AFTER the migrations ran (so the platform's default privileges apply to it, which is the very thing item 3 measures the migrations against)
       and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
         or has_table_privilege('anon', c.oid, 'REFERENCES') or has_table_privilege('authenticated', c.oid, 'REFERENCES')
         or has_table_privilege('anon', c.oid, 'TRIGGER') or has_table_privilege('authenticated', c.oid, 'TRIGGER'))),
  0, 'R801: no public table grants TRUNCATE/REFERENCES/TRIGGER to anon or authenticated');
select ok(not has_table_privilege('authenticated','public.ai_turns','insert'),                 'R801: authenticated cannot INSERT ai_turns');
select ok(not has_table_privilege('authenticated','public.ai_gloss_usage','update'),           'R801: authenticated cannot UPDATE ai_gloss_usage');
select ok(not has_table_privilege('authenticated','public.news_event_admin_actions','delete'), 'R801: authenticated cannot DELETE news_event_admin_actions');
select ok(has_table_privilege('authenticated','public.ai_turns','select'),                     'R801: the owner-scoped SELECT on ai_turns survives the revoke');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. EVERY SECURITY DEFINER FUNCTION IN public PINS ITS search_path, AND NONE PINS public.
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (p.proconfig is null
            or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')
            or exists (select 1 from unnest(p.proconfig) cfg
                        where cfg like 'search_path=%' and cfg ~ '(^|=|,\s*)public(\s*,|$)'))),
  0, 'R801: every SECURITY DEFINER function pins a search_path that does not include public');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. A REPORT IS ANONYMOUS OR THE CALLER'S OWN. anon naming user A is refused;
--     A naming B is refused; A naming A and anon naming nobody are accepted.
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _run('anon_as_a',  'insert into public.feedback (user_id, comment) values (''11111111-1111-1111-1111-111111111111'', ''x'')');
select _run('anon_none',  'insert into public.feedback (comment) values (''x'')');
select _run('anon_bug_a', 'insert into public.bug_reports (user_id, description) values (''11111111-1111-1111-1111-111111111111'', ''x'')');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('a_as_b', 'insert into public.feedback (user_id, comment) values (''22222222-2222-2222-2222-222222222222'', ''x'')');
select _run('a_as_a', 'insert into public.feedback (user_id, comment) values (''11111111-1111-1111-1111-111111111111'', ''x'')');
reset role;
-- an RLS refusal is SQLSTATE 42501, which the helper spells DENIED
select is((select v from _cap where k='anon_as_a'),  'DENIED', 'R801: anon cannot file feedback as user A');
select is((select v from _cap where k='anon_bug_a'), 'DENIED', 'R801: anon cannot file a bug report as user A');
select is((select v from _cap where k='anon_none'),  'OK',        'R801: anonymous feedback still works');
select is((select v from _cap where k='a_as_b'),     'DENIED',    'R801: A cannot file feedback as B');
select is((select v from _cap where k='a_as_a'),     'OK',        'R801: A files feedback as A');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. AN AUTHOR MAY EDIT THE BODY OF THEIR POST, NOT ITS PROVENANCE.
-- ─────────────────────────────────────────────────────────────────────────────
select ok(has_column_privilege('authenticated','public.community_posts','body','update'),            'R801: an author may update body');
select ok(has_column_privilege('authenticated','public.community_posts','edited_at','update'),       'R801: an author may stamp edited_at');
select ok(not has_column_privilege('authenticated','public.community_posts','created_at','update'),  'R801: created_at is not editable');
select ok(not has_column_privilege('authenticated','public.community_posts','author_name','update'), 'R801: author_name is not editable');
select ok(not has_column_privilege('authenticated','public.community_posts','user_id','update'),     'R801: user_id is not editable');
select ok(has_column_privilege('authenticated','public.community_comments','body','update'),         'R801: a commenter may update body');
select ok(not has_column_privilege('authenticated','public.community_comments','created_at','update'),'R801: a comment''s created_at is not editable');

select * from finish();
rollback;
