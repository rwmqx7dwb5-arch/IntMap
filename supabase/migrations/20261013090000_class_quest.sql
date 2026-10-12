-- ============================================================================
--  wave4-education — CLASS RESULTS: a teacher sees how the whole class answered a learn quest
-- ----------------------------------------------------------------------------
--  THE PRODUCT. A challenge link (`?quest=<kind>.<seed>.<n>`, js/quest-engine.js) already gives every student
--  the same questions — but each student's answers stayed on their own device, so the teacher learned nothing
--  from the set: not who took part, not which question the class got wrong, not where the class thought
--  Lagos was. A CLASS SET is that same challenge link with a class code (`&class=<code>`): a signed-in teacher
--  makes one, the students open it with no account, type the name the teacher asks for, and their answers
--  reach the teacher's board (js/quest-class-board.js) — each student's total, each question's mean, the
--  hardest question, and the class's taps drawn on the map around the true place.
--
--  WHAT IS STORED AND WHAT IS NOT.
--    · class_sets — one row per set the teacher made: the quest (kind, seed, n — exactly what the link already
--      holds), an optional title, whether it still takes answers, its code. Owned through user_id.
--    · class_set_answers — one row per student per set: the NAME THE STUDENT TYPED (nothing checks it is a
--      real name; the board says to use a first name or a number) and the RAW ANSWERS — for a place question
--      the tapped point to three decimals (about 100 m), for a year question the year, null for a skip.
--      No account, no e-mail, no device, no address, no score.
--  ⚠ NO SCORE IS STORED, ON PURPOSE. The questions are a function of (kind, seed, n) and the data, and the score
--    is a function of the question and the answer (js/quest-engine.js makeQuestEngine().score) — so the board
--    re-makes the questions and scores the answers with the ONE scoring rule the student's panel used. A
--    stored score would be a second, unverifiable copy that a student could send as anything.
--
--  THE CODE IS THE DOOR. A student is anon: the two RPCs below (class_set_open / class_set_submit) are the only
--  way in, and they take the 8-character code — 32 symbols without 0/O/1/I, 40 random bits from
--  gen_random_uuid()'s random bytes — and answer only about that set. Nobody can read class_set_answers but
--  the teacher whose set it is (RLS through the parent row).
--  ⚠ THE FIRST HAND-IN UNDER A NAME STANDS (.agents/rules/one-pass-or-a-reason.md): the same name again on
--    the same set is «name_taken», never a silent overwrite — a student who played again knew the answers.
--
--  THE NUMBERS AND WHERE THEY COME FROM (.agents/rules/no-ad-hoc-hardcoding.md §4):
--    · kind in ('where','when') and n in (5,10) — js/quest-engine.js QUEST_KIND_IDS and SET_LENGTHS are
--      canonical; tests/wave4-education-checks.test.mjs holds this file to them.
--    · CLASS_NAME_MAX 24 characters — js/quest-class.js is canonical (the same check holds the two together).
--      A choice of display: a first name and an initial, or a class number, fits one row of the board.
--    · 400 answers per set — an ESTIMATE, not a measurement: a whole school year group (a Japanese 学年 of up
--      to ten classes of 40) on one set. Expires the day a teacher is measured to be refused below that.
--      It bounds what one code can be made to store; it is not a fairness rule.
--    · 45 hand-ins per set at once, refilled 45 every 10 minutes (relay_take bucket 'class-answer', keyed by the
--      set — the repository's one shared bucket, 20260918100000_r801_relay_rate_limit.sql) — an ESTIMATE: a class of
--      40 handing in in the same minute, with room for a few retyped names. Every valid try takes a token, a refused
--      name included, so a stranger who has the link fills the set (or takes classmates' names) at most 45 at a time
--      and 270 an hour, not 400 in a second; the teacher's board closes the set and clears every hand-in in one act
--      (js/quest-class.js clearClassAnswers). Expires the day a class is measured to be refused below that.
--    · 50 sets per teacher per day (relay_take bucket 'class-set', refilled 50 a day) — an ESTIMATE: six
--      lessons a day, several sets a lesson, with room to spare. A fence against a loop, not a quota.
--    · 365 days — a set and every answer under it are deleted a year after the set was made (pg_cron
--      'class-sets-purge'): a school year with a margin. Children's names do not outlive the year they
--      were typed for. The Privacy Policy (js/legal-text.js §6) states the same number.
--
--  Owned via user_id → auth.users, so account deletion and the account export reach class_sets with no
--  edit anywhere (20261003130000_account_data_center.sql); class_set_answers goes with its set (cascade).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SETS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.class_sets (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  code        text        not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  kind        text        not null check (kind in ('where', 'when')),
  seed        text        not null check (seed ~ '^[A-Za-z0-9_-]{1,40}$'),
  n           smallint    not null check (n in (5, 10)),
  title       text        check (title is null or char_length(title) between 1 and 80),
  open        boolean     not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists class_sets_user_idx on public.class_sets (user_id, created_at desc);
create index if not exists class_sets_created_idx on public.class_sets (created_at);

comment on table public.class_sets is
  '(wave4-education) A class set: a learn quest (kind, seed, n — the challenge link''s own three) that a signed-in teacher made so the students'' answers reach them. code is the 8-character door the students'' link carries. Owner-only under RLS; owned via user_id, so account deletion and the export cover it. Deleted with its answers 365 days after it was made (purge_class_sets).';

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE ANSWERS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.class_set_answers (
  id          bigint      generated always as identity primary key,
  set_id      uuid        not null references public.class_sets(id) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 24 and name = btrim(name)),
  answers     jsonb       not null check (jsonb_typeof(answers) = 'array'),
  created_at  timestamptz not null default now()
);
create unique index if not exists class_set_answers_name_uq on public.class_set_answers (set_id, lower(name));

comment on table public.class_set_answers is
  '(wave4-education) One student''s hand-in on a class set: the name they typed and their raw answers (a place question: [lng, lat] to 3 decimals; a year question: the year; a skip: null) — no account, no score (the board scores with js/quest-engine.js). Written only by class_set_submit(); read and deleted only by the set''s owner. The first hand-in under a name stands.';

-- ─────────────────────────────────────────────────────────────────────────────
--  3. RLS + grants. ⚠ TRUNCATE ignores RLS — revoke everything, give back exactly what the policies are for.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.class_sets enable row level security;
alter table public.class_set_answers enable row level security;

revoke all on table public.class_sets from public, anon, authenticated, service_role;
grant select, delete on table public.class_sets to authenticated;
grant insert (kind, seed, n, title) on table public.class_sets to authenticated;
grant update (open, title) on table public.class_sets to authenticated;
grant select, insert, update, delete on table public.class_sets to service_role;

revoke all on table public.class_set_answers from public, anon, authenticated, service_role;
grant select, delete on table public.class_set_answers to authenticated;
grant select, insert, update, delete on table public.class_set_answers to service_role;

drop policy if exists class_sets_owner_select on public.class_sets;
create policy class_sets_owner_select on public.class_sets
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists class_sets_owner_insert on public.class_sets;
create policy class_sets_owner_insert on public.class_sets
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists class_sets_owner_update on public.class_sets;
create policy class_sets_owner_update on public.class_sets
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists class_sets_owner_delete on public.class_sets;
create policy class_sets_owner_delete on public.class_sets
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists class_set_answers_owner_select on public.class_set_answers;
create policy class_set_answers_owner_select on public.class_set_answers
  for select to authenticated
  using (exists (select 1 from public.class_sets s where s.id = set_id and s.user_id = (select auth.uid())));
drop policy if exists class_set_answers_owner_delete on public.class_set_answers;
create policy class_set_answers_owner_delete on public.class_set_answers
  for delete to authenticated
  using (exists (select 1 from public.class_sets s where s.id = set_id and s.user_id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE OWNER, THE CODE AND THE TIME ARE THE DATABASE'S. On insert, user_id is the caller for every caller
--     that is not the service role, the code is drawn here, created_at is now(), and a teacher who has made
--     50 sets in the last day is refused (the 'class-set' bucket — see the header).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._class_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 32 symbols: 256 is a multiple of 32, so a byte mod 32 is uniform
  v_abc   constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  v_out   text := '';
  -- bytes 6 and 8 carry the uuid's version and variant bits; the other fourteen are random
  v_at    int[] := array[0, 1, 2, 3, 4, 5, 9, 10];
  i       int;
begin
  foreach i in array v_at loop
    v_out := v_out || substr(v_abc, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_out;
end;
$$;
revoke execute on function public._class_code() from public, anon, authenticated;

create or replace function public.tg_class_sets_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_try     int := 0;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'class_sets: sign in to make a class set' using errcode = '42501';
    end if;
    new.user_id := auth.uid();
    select r.allowed into v_allowed from public.relay_take('class-set', auth.uid()::text, 50, 50.0 / 86400, 1) r;
    if not coalesce(v_allowed, false) then
      raise exception 'class_sets: too many class sets today' using errcode = '54000';
    end if;
  end if;
  loop
    new.code := public._class_code();
    exit when not exists (select 1 from public.class_sets s where s.code = new.code);
    v_try := v_try + 1;
    if v_try > 8 then raise exception 'class_sets: no free code' using errcode = '23505'; end if;
  end loop;
  new.open := true;
  new.created_at := now();
  return new;
end;
$$;
revoke execute on function public.tg_class_sets_own() from public, anon, authenticated;

drop trigger if exists class_sets_own on public.class_sets;
create trigger class_sets_own before insert on public.class_sets
  for each row execute function public.tg_class_sets_own();

-- ─────────────────────────────────────────────────────────────────────────────
--  5. THE STUDENT'S TWO DOORS — anon, by code
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.class_set_open(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set public.class_sets;
  v_n   integer;
begin
  select * into v_set from public.class_sets s where s.code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select count(*) into v_n from public.class_set_answers a where a.set_id = v_set.id;
  return jsonb_build_object('ok', true, 'code', v_set.code, 'kind', v_set.kind, 'seed', v_set.seed, 'n', v_set.n,
    'title', v_set.title, 'open', v_set.open, 'answered', v_n);
end;
$$;
comment on function public.class_set_open(text) is
  '(wave4-education) What a student''s class link opens: the set''s quest (kind, seed, n), its title, whether it still takes answers and how many have handed in — never the teacher, never a student''s name or answer. {ok:false,error:not_found} for a code that is not a set. ANON MAY CALL: students have no account; the 40-bit code their teacher handed them is the door, and the answer is only what the link itself already says plus the title the teacher gave the set.';
revoke execute on function public.class_set_open(text) from public;
grant  execute on function public.class_set_open(text) to anon, authenticated, service_role;

create or replace function public.class_set_submit(p_code text, p_name text, p_answers jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_set  public.class_sets;
  v_name text := btrim(coalesce(p_name, ''));
  v_n    integer;
  v_el   jsonb;
  v_lng  numeric;
  v_lat  numeric;
  v_yr   numeric;
  v_ok   boolean;
begin
  select * into v_set from public.class_sets s where s.code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not v_set.open then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  -- the answers: exactly n, each null or the shape its kind takes
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> v_set.n then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for v_el in select e from jsonb_array_elements(p_answers) e loop
    continue when jsonb_typeof(v_el) = 'null';
    if v_set.kind = 'where' then
      if jsonb_typeof(v_el) <> 'array' or jsonb_array_length(v_el) <> 2
         or jsonb_typeof(v_el -> 0) <> 'number' or jsonb_typeof(v_el -> 1) <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'invalid');
      end if;
      v_lng := (v_el ->> 0)::numeric; v_lat := (v_el ->> 1)::numeric;
      if v_lng < -180 or v_lng > 180 or v_lat < -90 or v_lat > 90 then
        return jsonb_build_object('ok', false, 'error', 'invalid');
      end if;
    else
      if jsonb_typeof(v_el) <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'invalid');
      end if;
      v_yr := (v_el #>> '{}')::numeric;
      if v_yr <> trunc(v_yr) or v_yr < -10000 or v_yr > 10000 then
        return jsonb_build_object('ok', false, 'error', 'invalid');
      end if;
    end if;
  end loop;
  select count(*) into v_n from public.class_set_answers a where a.set_id = v_set.id;
  if v_n >= 400 then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  -- the pace: every well-formed try on this set takes a token (a refused name too — that is what stops a name grab)
  select r.allowed into v_ok from public.relay_take('class-answer', v_set.id::text, 45, 45.0 / 600, 1) r;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  begin
    insert into public.class_set_answers (set_id, name, answers) values (v_set.id, v_name, p_answers);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;
  return jsonb_build_object('ok', true, 'answered', v_n + 1);
end;
$$;
comment on function public.class_set_submit(text, text, jsonb) is
  '(wave4-education) A student hands in a class set: the name they typed (1–24 characters) and their raw answers (n of them; a place question [lng, lat], a year question an integer year, a skip null). → {ok:true, answered} or {ok:false, error: not_found | closed | invalid_name | invalid | full | busy | name_taken}. The first hand-in under a name stands; every well-formed try takes a token from the set''s relay_take bucket ''class-answer'' (45, refilled 45 every 10 minutes) — «busy» when it is empty. ANON MAY CALL: students have no account; the code their teacher handed them is the door, the set must still be open, the row holds only the name and the answers, and only the teacher whose set it is can read it (RLS).';
revoke execute on function public.class_set_submit(text, text, jsonb) from public;
grant  execute on function public.class_set_submit(text, text, jsonb) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. A YEAR, THEN GONE — purge_class_sets(days) deletes the sets made more than `days` ago (default 365) and,
--     by cascade, every answer handed in under them. Scheduled daily (pg_cron 'class-sets-purge').
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_class_sets(p_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.class_sets s where s.created_at < now() - make_interval(days => greatest(1, coalesce(p_days, 365)));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.purge_class_sets(integer) from public, anon, authenticated;
grant  execute on function public.purge_class_sets(integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the class-sets-purge schedule';
    return;
  end if;
  perform cron.schedule('class-sets-purge', '37 3 * * *', 'select public.purge_class_sets(365)');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  7. ITS SENTENCE IN THE ACCOUNT'S DATA CATALOGUE (20261003130000_account_data_center.sql).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('class_sets', 'you',
   'Class sets', 'クラスのセット',
   'The learn-quest sets you made for a class (which quest, its seed and number of questions, the title you gave it, whether it still takes answers, its code) — so the answers your students hand in reach you. The names and answers your students handed in are kept with each set and shown only to you.',
   'クラス用に作った学ぶクエストのセット（クエストの種類・seed・問題数・付けた題・まだ答えを受け付けるか・コード）。生徒が提出した答えをあなたに届けるためのものです。生徒が提出した名前と答えは各セットと一緒に保存し、あなたにだけ表示します。',
   'Deleted, with every answer handed in under it, 365 days after the set was made — or sooner when you delete the set or your account.',
   'セットを作ってから 365 日後に、提出された答えとともに削除します。セットかアカウントを削除した場合はその時点で削除します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;

notify pgrst, 'reload schema';
