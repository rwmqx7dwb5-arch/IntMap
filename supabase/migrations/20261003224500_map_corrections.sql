-- ============================================================================
--  community-next — map corrections: a reader says «this is wrong, here», the operator answers, the answer
--  goes back to the reader, and what was fixed is published
-- ----------------------------------------------------------------------------
--  THE GAP (2026-10-03): a reader who saw a wrong name, border, date, value or position on the map had
--  the feedback form (stars and free text) and the bug reporter (diagnostics) — neither carried the point,
--  the year or the layer, and neither ever answered. A historical map's claim («this unit existed here in
--  this year») is the claim .agents/rules/historical-verification.md says a gate cannot check; readers who
--  know a place are the instrument that can, and there was no way to hear them.
--
--  THIS MIGRATION:
--    · public.map_corrections — one row per correction. Written ONLY by the reader-reports Edge Function
--      as service_role behind the shared relay_take buckets (the anon-write-guard shape; there is NO
--      INSERT policy for anyone — supabase/tests/14 holds every table to that). The vocabulary and the
--      ceilings are declared once in supabase/functions/_shared/correction-shape.js; these CHECKs are the
--      database's outer bound on the same words (tests/community-next-checks.test.mjs holds them equal).
--      Read, triaged and answered only by an admin (admin-corrections.html).
--    · the RECEIPT. The sender's device holds a random token; the row holds sha256(token) as hex. No
--      e-mail address is asked for: the answer is read back with the receipt (map_correction_status), or,
--      for a signed-in sender, by the account (my_map_corrections).
--    · public.map_correction_status(receipts[]) — anon and authenticated: the operator's answer for the
--      rows whose receipt is given, and nothing else. spam reads as «closed».
--    · public.my_map_corrections() — the signed-in caller's own rows (auth.uid(), never an argument).
--    · public.public_map_corrections(limit) / public.map_corrections_summary() — the public log: only
--      rows the operator PUBLISHED, with the reply the operator wrote (never the sender's own words, the
--      sender, or the receipt), and the counts that say how many arrived and how they were answered.
--    · resolved_at is a FACT of the status, set by a trigger (not by the console that happens to write).
--
--  RETENTION (purge_map_corrections, daily) — operator's choices, stated as such (no-ad-hoc-hardcoding §4):
--    · spam is deleted after 30 days (the same reasoning and number as purge_org_inquiries).
--    · an answered correction that was NOT published is deleted 730 days after it was answered — long
--      enough to recognise the same report coming back; ESTIMATE, expires when the operator decides.
--    · an open correction is never purged (it has not been answered yet); a published one is kept as the
--      public record until the sender asks for it to be removed. The privacy text states all three.
--
--  ⚠ NON-DESTRUCTIVE: one new table, six new functions, one trigger, one catalogue row. Re-running is a
--  no-op. ⚠ ORDER OF DEPLOYMENT: apply this BEFORE deploying the reader-reports that writes it — deployed
--  first, a correction is answered 503 and the card says it was not sent (nothing is lost silently).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. map_corrections
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.map_corrections (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  kind          text        not null check (kind in ('name', 'boundary', 'date', 'value', 'position', 'missing', 'other')),
  lng           double precision not null check (lng between -180 and 180),
  lat           double precision not null check (lat between -90 and 90),
  zoom          real                 check (zoom is null or zoom between 0 and 24),
  year          integer              check (year is null or year between -10000 and 3000),
  map_time      text                 check (map_time is null or char_length(map_time) <= 40),
  map_link      text        not null check (char_length(map_link) <= 2000 and map_link ~ '^#v=-?[0-9]'),
  layer_id      text                 check (layer_id is null or (char_length(layer_id) <= 80 and layer_id ~ '^[A-Za-z0-9_.:-]+$')),
  layer_label   text                 check (layer_label is null or char_length(layer_label) <= 120),
  place_label   text                 check (place_label is null or char_length(place_label) <= 200),
  country       text                 check (country is null or country ~ '^[A-Z0-9-]{2,8}$'),
  message       text        not null check (char_length(message) between 1 and 3000),
  evidence_url  text                 check (evidence_url is null or (char_length(evidence_url) <= 600 and evidence_url ~* '^https?://[^[:space:]]+$')),
  lang          text                 check (lang is null or char_length(lang) <= 16),
  user_id       uuid                 references auth.users (id) on delete set null,
  receipt_hash  text        not null unique check (receipt_hash ~ '^[0-9a-f]{64}$'),
  status        text        not null default 'new' check (status in ('new', 'confirmed', 'fixed', 'not_an_error', 'duplicate', 'cannot_fix', 'spam')),
  reply         text                 check (reply is null or char_length(reply) <= 2000),
  admin_note    text                 check (admin_note is null or char_length(admin_note) <= 2000),
  fixed_ref     text                 check (fixed_ref is null or char_length(fixed_ref) <= 400),
  duplicate_of  uuid                 references public.map_corrections (id) on delete set null,
  published     boolean     not null default false,
  resolved_at   timestamptz,
  -- the public log shows the OPERATOR's words: nothing is published without a reply, and only an answer is publishable
  constraint map_corrections_publish_rule check (not published or (reply is not null and status in ('confirmed', 'fixed', 'not_an_error', 'cannot_fix'))),
  constraint map_corrections_not_own_duplicate check (duplicate_of is null or duplicate_of <> id)
);
create index if not exists map_corrections_created_idx on public.map_corrections (created_at desc);
create index if not exists map_corrections_status_idx  on public.map_corrections (status);
create index if not exists map_corrections_user_idx    on public.map_corrections (user_id) where user_id is not null;
comment on table public.map_corrections is
  'community-next: a reader''s report that something on the map is wrong at a point (and, on a historical map, in a year), with the map state it was seen in. Written only by the reader-reports Edge Function (service role, behind relay_take; user_id from the verified session when there is one). The sender reads the answer back with a receipt whose sha256 is receipt_hash. Admins read, answer and publish; published rows feed the public log (public_map_corrections) with the admin''s reply only. Spam purged after 30 days, unpublished answers 730 days after the answer (purge_map_corrections).';

alter table public.map_corrections enable row level security;

-- TRUNCATE / REFERENCES / TRIGGER are not subject to RLS: revoke everything, give back exactly what the admin
-- policies need (docs/SECURITY-ARCHITECTURE.md §8). What the sender wrote is not updatable by anyone; place_label
-- is, so the operator can tidy what the public log will show.
revoke all on table public.map_corrections from public, anon, authenticated;
grant select, delete on table public.map_corrections to authenticated;
grant update (status, reply, admin_note, fixed_ref, duplicate_of, published, place_label) on table public.map_corrections to authenticated;
grant select, insert, update, delete on table public.map_corrections to service_role;

drop policy if exists map_corrections_admin_select on public.map_corrections;
create policy map_corrections_admin_select on public.map_corrections
  for select to authenticated using ((select public.is_admin()));
drop policy if exists map_corrections_admin_update on public.map_corrections;
create policy map_corrections_admin_update on public.map_corrections
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists map_corrections_admin_delete on public.map_corrections;
create policy map_corrections_admin_delete on public.map_corrections
  for delete to authenticated using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
--  2. resolved_at follows the status — an answer has a time; reopening clears it
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.map_corrections_resolved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('new', 'confirmed') then
    new.resolved_at := null;
  elsif tg_op = 'INSERT' or old.status is distinct from new.status or new.resolved_at is null then
    new.resolved_at := coalesce(case when tg_op = 'UPDATE' and old.status = new.status then old.resolved_at end, now());
  end if;
  return new;
end;
$$;
comment on function public.map_corrections_resolved_at() is
  'community-next: keeps map_corrections.resolved_at true to the status — set when the status becomes an answer, cleared when it is reopened.';
drop trigger if exists map_corrections_resolved_at on public.map_corrections;
create trigger map_corrections_resolved_at before insert or update of status on public.map_corrections
  for each row execute function public.map_corrections_resolved_at();

-- ─────────────────────────────────────────────────────────────────────────────
--  3. the sender's answer, by receipt — anon and authenticated
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.map_correction_status(p_receipts text[])
returns table (receipt_hash text, id uuid, created_at timestamptz, kind text, status text, reply text, fixed_ref text,
               resolved_at timestamptz, published boolean, place_label text, layer_label text, lng double precision,
               lat double precision, year integer, map_link text, message text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.receipt_hash, c.id, c.created_at, c.kind,
         case when c.status = 'spam' then 'closed' else c.status end,
         case when c.status = 'spam' then null else c.reply end,
         case when c.status = 'spam' then null else c.fixed_ref end,
         c.resolved_at, c.published, c.place_label, c.layer_label, c.lng, c.lat, c.year, c.map_link, c.message
    from public.map_corrections c
   where c.receipt_hash in (
           select encode(sha256(convert_to(r, 'UTF8')), 'hex')
             from unnest(coalesce(p_receipts, array[]::text[])) with ordinality as u(r, n)
            where n <= 100 and r ~ '^[A-Za-z0-9_-]{43}$')
   order by c.created_at desc;
$$;
comment on function public.map_correction_status(text[]) is
  'community-next: the operator''s answer to the corrections whose receipts are given (at most 100; a receipt is the 43-character token reader-reports handed the sender, matched by its sha256). ANON MAY CALL: a sender who is not signed in reads the answer to their own report with the receipt only their device holds — the receipt is the authorisation, and a row is returned only to the holder of its receipt. spam reads as closed, without the operator''s note.';
revoke execute on function public.map_correction_status(text[]) from public;
grant  execute on function public.map_correction_status(text[]) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. the signed-in sender's own corrections
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.my_map_corrections()
returns table (receipt_hash text, id uuid, created_at timestamptz, kind text, status text, reply text, fixed_ref text,
               resolved_at timestamptz, published boolean, place_label text, layer_label text, lng double precision,
               lat double precision, year integer, map_link text, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'my_map_corrections: nobody is signed in' using errcode = '42501';
  end if;
  return query
    select c.receipt_hash, c.id, c.created_at, c.kind,
           case when c.status = 'spam' then 'closed' else c.status end,
           case when c.status = 'spam' then null else c.reply end,
           case when c.status = 'spam' then null else c.fixed_ref end,
           c.resolved_at, c.published, c.place_label, c.layer_label, c.lng, c.lat, c.year, c.map_link, c.message
      from public.map_corrections c
     where c.user_id = v_uid
     order by c.created_at desc
     limit 500;
end;
$$;
comment on function public.my_map_corrections() is
  'community-next: the signed-in caller''s own map corrections (auth.uid(), never an argument) with the operator''s answer; spam reads as closed. Raises 42501 when nobody is signed in.';
revoke execute on function public.my_map_corrections() from public, anon;
grant  execute on function public.my_map_corrections() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. the public log and its counts — only what the operator published, only the operator's words
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.public_map_corrections(p_limit integer default 100)
returns table (id uuid, reported_on date, resolved_at timestamptz, kind text, status text, layer_label text,
               place_label text, country text, lng double precision, lat double precision, year integer,
               map_link text, reply text, fixed_ref text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, (c.created_at at time zone 'UTC')::date, c.resolved_at, c.kind, c.status, c.layer_label, c.place_label,
         c.country, round(c.lng::numeric, 3)::double precision, round(c.lat::numeric, 3)::double precision, c.year,
         c.map_link, c.reply, c.fixed_ref
    from public.map_corrections c
   where c.published
   order by c.resolved_at desc nulls last, c.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
comment on function public.public_map_corrections(integer) is
  'community-next: the published corrections, newest answer first (at most 500): what was reported, where (to about 100 m), on which layer and year, and the reply the operator wrote. Never the sender, their words, or the receipt. ANON MAY CALL: this is the public log a reader reads on corrections.html; it holds only what an admin chose to publish.';
revoke execute on function public.public_map_corrections(integer) from public;
grant  execute on function public.public_map_corrections(integer) to anon, authenticated, service_role;

create or replace function public.map_corrections_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'received',      count(*) filter (where c.status <> 'spam'),
    'open',          count(*) filter (where c.status in ('new', 'confirmed')),
    'fixed',         count(*) filter (where c.status = 'fixed'),
    'not_an_error',  count(*) filter (where c.status = 'not_an_error'),
    'duplicate',     count(*) filter (where c.status = 'duplicate'),
    'cannot_fix',    count(*) filter (where c.status = 'cannot_fix'),
    'published',     count(*) filter (where c.published),
    'historical',    count(*) filter (where c.status <> 'spam' and c.year is not null),
    'median_days_to_answer', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (r.resolved_at - r.created_at)) / 86400))::numeric, 1)
        from public.map_corrections r
       where r.status not in ('new', 'confirmed', 'spam') and r.resolved_at is not null
         and r.resolved_at > now() - interval '365 days'),
    'since', (min(c.created_at) filter (where c.status <> 'spam') at time zone 'UTC')::date)
  from public.map_corrections c;
$$;
comment on function public.map_corrections_summary() is
  'community-next: the counts behind the public log — how many corrections arrived (spam excluded), how many are open, how each was answered, how many were about a historical year, the median days to an answer over the last 365 days, and the first day one arrived. ANON MAY CALL: aggregate counts only, the transparency figure corrections.html shows; no row, sender or text.';
revoke execute on function public.map_corrections_summary() from public;
grant  execute on function public.map_corrections_summary() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. retention — service_role only (pg_cron)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_map_corrections(p_spam_days integer default 30, p_answered_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.map_corrections c
   where (c.status = 'spam' and c.created_at < now() - make_interval(days => greatest(1, coalesce(p_spam_days, 30))))
      or (c.status in ('fixed', 'not_an_error', 'duplicate', 'cannot_fix') and not c.published
          and c.resolved_at < now() - make_interval(days => greatest(1, coalesce(p_answered_days, 730))));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.purge_map_corrections(integer, integer) is
  'community-next: deletes corrections marked spam after p_spam_days (30) and answered, unpublished corrections p_answered_days (730) after the answer. Open and published corrections are kept. service_role only (pg_cron).';
revoke execute on function public.purge_map_corrections(integer, integer) from public, anon, authenticated;
grant  execute on function public.purge_map_corrections(integer, integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the map-corrections-purge schedule';
    return;
  end if;
  perform cron.schedule('map-corrections-purge', '47 3 * * *', 'select public.purge_map_corrections(30, 730)');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  7. ITS SENTENCE IN THE ACCOUNT'S DATA CATALOGUE (20261003130000_account_data_center.sql).
--     map_corrections.user_id references auth.users, so public._owned_by_user_cols() discovers it: a correction
--     sent while signed in is the account's row, listed, exported and deleted with it.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('map_corrections', 'you',
   'Map corrections you sent', '送った地図の誤り報告',
   'A report you sent while signed in that something on the map was wrong: the point, the map view and year it was seen in, the layer, your description and any source you gave — kept so the operator can check it and answer you.',
   'ログイン中に送った「地図のここが違う」という報告（地点・そのときの地図の表示と年・レイヤー・説明・示した出典）。運営者が確かめて回答するために保存します。',
   'Answered reports that were not published are deleted 730 days after the answer (spam after 30 days); published ones stay in the public log until you ask for removal; all are deleted when you delete your account.',
   '公開しなかった回答済みの報告は回答から730日（迷惑なものは30日）で削除します。公開した訂正は削除のお申し出まで公開記録に残ります。アカウントを削除するとすべて削除します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
