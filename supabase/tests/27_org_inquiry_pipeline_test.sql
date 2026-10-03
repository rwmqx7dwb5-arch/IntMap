-- ============================================================================
--  pgTAP · 27 — sales-next: where an organisation's enquiry stands (the pipeline columns).
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    · the four columns exist; a new enquiry starts as a 'lead' with nothing due;
--    · the CHECKs refuse a stage that is not one of the declared words and an over-long next step;
--    · only an admin moves a stage or sets a next step (RLS, unchanged); a non-admin changes nothing;
--      the grant names exactly the pipeline's columns and still not the sender's message.
--  The words themselves are held equal to supabase/functions/_shared/inquiry-shape.js
--  (INQUIRY_PIPELINE) by tests/sales-next-checks.test.mjs.
-- ============================================================================
begin;
select no_plan();

do $imp$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $imp$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;
create function _dml(k text, q text) returns void language plpgsql as $$
declare n int;
begin
  execute q; get diagnostics n = row_count;
  insert into _cap values (k, 'ROWS:' || n);
exception
  when insufficient_privilege then insert into _cap values (k, 'DENIED');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_column('public', 'org_inquiries', 'stage',            'sales-next: org_inquiries.stage exists');
select has_column('public', 'org_inquiries', 'next_step',        'sales-next: org_inquiries.next_step exists');
select has_column('public', 'org_inquiries', 'next_step_on',     'sales-next: org_inquiries.next_step_on exists');
select has_column('public', 'org_inquiries', 'stage_changed_at', 'sales-next: org_inquiries.stage_changed_at exists');
select ok(has_column_privilege('authenticated', 'public.org_inquiries', 'stage',        'UPDATE'), 'sales-next: the authenticated role may name stage in an UPDATE (RLS decides who)');
select ok(has_column_privilege('authenticated', 'public.org_inquiries', 'next_step_on', 'UPDATE'), 'sales-next: …and next_step_on');
select ok(not has_column_privilege('anon', 'public.org_inquiries', 'stage', 'UPDATE'),             'sales-next: anon may not');
select ok(not has_column_privilege('authenticated', 'public.org_inquiries', 'message', 'UPDATE'), 'sales-next: the sender''s message is still nobody else''s to write');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE DEFAULT AND THE CHECKS (service role — the Edge Function's writer)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _dml('svc_ok', $q$insert into public.org_inquiries (audience, purpose, name, email, organization, message, consent)
                       values ('education', 'classroom', 'A Teacher', 'teacher@example.org', 'Example High School', 'We would like to use the tours.', true)$q$);
select _dml('svc_badstage', $q$insert into public.org_inquiries (audience, purpose, name, email, message, consent, stage) values ('other', 'other', 'T', 'x1@example.org', 'x', true, 'won')$q$);
select _dml('svc_longstep', $q$insert into public.org_inquiries (audience, purpose, name, email, message, consent, next_step) values ('other', 'other', 'T', 'x2@example.org', 'x', true, repeat('a', 301))$q$);
reset role;
select is((select v from _cap where k = 'svc_ok'), 'ROWS:1', 'sales-next: the service role still stores an enquiry with only its own columns');
select is((select stage from public.org_inquiries where email = 'teacher@example.org'), 'lead', 'sales-next: a new enquiry starts as a lead');
select ok((select next_step_on is null and next_step is null and stage_changed_at is null from public.org_inquiries where email = 'teacher@example.org'), 'sales-next: …with nothing due');
select ok((select v from _cap where k = 'svc_badstage') like 'ERR:%', 'sales-next: a stage that is not a declared word is refused');
select ok((select v from _cap where k = 'svc_longstep') like 'ERR:%', 'sales-next: a next step over 300 characters is refused');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. WHO MOVES A STAGE
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('user_stage', $q$update public.org_inquiries set stage = 'adopted'$q$);
reset role;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _dml('admin_stage', $q$update public.org_inquiries set stage = 'trial', next_step = 'Ask how the class went', next_step_on = date '2026-10-20', stage_changed_at = now() where email = 'teacher@example.org'$q$);
reset role;

select is((select v from _cap where k = 'user_stage'),  'ROWS:0', 'sales-next: a non-admin reader moves no stage');
select is((select v from _cap where k = 'admin_stage'), 'ROWS:1', 'sales-next: an admin moves the stage and sets the next step');
select is((select stage || '|' || next_step_on::text from public.org_inquiries where email = 'teacher@example.org'), 'trial|2026-10-20', 'sales-next: …and it is stored');

select * from finish();
rollback;
