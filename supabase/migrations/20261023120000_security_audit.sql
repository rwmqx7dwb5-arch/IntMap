-- ============================================================================
--  security-audit — WHO VOTED IS NOBODY ELSE'S BUSINESS; WHAT NOBODY OWNS HAS AN END;
--  WHAT A READER WRITES HAS A SIZE
-- ----------------------------------------------------------------------------
--  Read from production on 2026-10-23 (SELECT only) before writing a line of this file.
--
--  1. A VOTE NAMED ITS VOTER TO EVERYONE. community_votes / community_comment_votes were SELECTable
--     by anon and authenticated over the whole table, under a `USING (true)` policy — the baseline's
--     comm_votes_select_all / comm_cvotes_select_all, and in production two differently-named ones
--     («cvote_select», «ccv select», roles {public}). So the publishable key alone listed which account
--     upvoted which post. The account's own data catalogue (20261003130000_account_data_center.sql)
--     tells the reader the opposite: «Others see only the total.» The client needed the rows only to
--     COUNT them (js/community-board.js loadCommunity embedded everyone's community_votes(user_id)).
--       · The total becomes a column — community_posts.vote_count / community_comments.vote_count —
--         kept by AFTER triggers on the two vote tables (SECURITY DEFINER: the counter writes a row the
--         voter does not own). Backfilled from the rows that exist. No client role may write it: the
--         INSERT and UPDATE grants on both tables are column lists (20260929100000 / 20260918090000)
--         and this file adds nothing to them; supabase/tests/31_security_audit_test.sql asserts it.
--       · Every SELECT (and ALL) policy on the two vote tables is dropped — found in pg_policies, not
--         named, because production's names are not the migrations' — and one replaces them: a
--         signed-in reader sees their OWN votes (what «did I vote?» needs). anon loses SELECT on both.
--         INSERT / DELETE policies, the primary keys (one vote per account) and the grants are unchanged.
--     Production holds 0 votes and 0 posts (measured), so nothing a reader has seen changes.
--
--  2. WHAT NOBODY OWNS HAD NO END.
--       · feedback / bug_reports sent while signed out (user_id IS NULL) may carry an e-mail address,
--         the browser's UA and diagnostics, and were kept forever (production: 3 such feedback rows,
--         the oldest 2026-06-13). Signed-in rows already end with the account (delete_account_data).
--         Operator's choice (no-ad-hoc-hardcoding §4): 730 days — the same horizon purge_map_corrections
--         gives an answered report (20261003224500). Stated in the privacy policy §6 (js/legal-text.js).
--       · cron.job_run_details had 29,381 rows since 2026-06-01. Operator's choice: 14 days — two weeks
--         of history is what diagnosing a failing job needs. The rows older than 2026-09-25 hold the old
--         news-ingest command text with its secret as a literal (20260925090000 moved it to vault); this
--         purge is what removes them from the database (the secret is rotated separately).
--       · public.sweep_relay_rate_buckets() (20260918100000) was defined and never scheduled, so the
--         per-address token buckets of the keyed relays (the key is a caller's address) were never
--         removed. Scheduled hourly with its own default idle horizon.
--     Each runs as a pg_cron job by NAME (idempotent), only where pg_cron exists — 20260925110000's guard.
--
--  3. WHAT A READER WRITES HAS A SIZE. #R155 capped title/body/author_name; five columns a reader
--     writes were still unbounded, and profiles' three are copied into world-readable profiles_public.
--     Each cap is the longest value a shipped writer can produce, measured, with the margin stated.
--     NOT VALID, as #R155: an existing row is not re-checked (production's maxima are inside every cap:
--     avatar_url 25,867, display_name 20, bio 0, no post) — but every new INSERT and UPDATE is.
--       · community_posts.img ≤ 6,000,000 characters. Writer: js/app-body.js compressImage(file, 1100, 0.72)
--         → canvas.toDataURL('image/jpeg'). MEASURED 2026-10-23, headless Chromium (Playwright), the
--         worst case JPEG has — independent uniform noise in every channel of a 1100×1100 canvas:
--         884,955 characters at q 0.72 and 4,744,987 at q 1.0 (no chroma subsampling). The cap takes the
--         q 1.0 figure — no browser's encoder at any quality mapping writes more for that pixel count in
--         practice — plus 25 % for an encoder with less efficient Huffman tables, rounded up.
--         EXPIRES when compressImage's maxDim or output type changes. ⚠ compressImage falls back to the
--         raw file's data: URL when the browser cannot decode the image; such a file larger than the cap
--         is refused (the post is not stored) instead of being stored undrawable.
--       · profiles.avatar_url ≤ 350,000. Writer: js/app-body.js imCropImage → a 256×256 canvas at
--         q 0.85 (js/auth-ui.js stores it). MEASURED the same way: 63,407 at q 0.85, 256,079 at q 1.0;
--         + 25 %, rounded up. EXPIRES when the crop size (256) or output type changes.
--       · profiles.display_name ≤ 255. Writers: the sign-up form (maxlength 40, js/auth-ui.js), an OAuth
--         provider's name (js/auth-ui.js refreshCurrentUser, and handle_new_user — §5, which also clips
--         to 255), and the rows production's old handle_new_user wrote (the e-mail's local part —
--         auth.users.email is varchar(255), so at most 254; NOT VALID leaves them). EXPIRES with
--         auth.users.email's type.
--       · profiles.bio ≤ 280. No shipped writer today (the editor was withdrawn); the last one capped it at
--         maxlength 280 (UTF-16 units, so ≤ 280 characters). EXPIRES when a bio editor returns with
--         another limit — that editor and this cap must then say the same number.
--       · community_posts.category ≤ 120. Writer: an id of js/tables.js COMM_CATEGORIES (the longest
--         today is 8). 120 is the cap #R155 gave the other id-like category column (bug_reports_len_guard),
--         its canonical figure for «a short identifier».
--
--  4. TWO OBJECTS THAT EXIST ONLY IN PRODUCTION (no migration creates them; hardened where they exist).
--       · public.set_updated_at() — a trigger function (geo_pins, dashboard_cards) with a mutable
--         search_path (Supabase advisor: function_search_path_mutable). Its body is
--         `new.updated_at := now(); return new;` (read 2026-10-23) — now() is pg_catalog's, which an
--         empty search_path still resolves.
--       · public.rls_auto_enable() — the event-trigger function behind `ensure_rls`. SECURITY DEFINER,
--         and EXECUTE was granted to PUBLIC, anon and authenticated. An event trigger fires without an
--         EXECUTE check on the session's role, so revoking it changes nothing the trigger does.
--
--  5. A PUBLIC NAME WAS MADE FROM THE E-MAIL ADDRESS (production's handle_new_user; detail in §5 below).
--
--  ⚠ DESTRUCTIVE BY docs/MIGRATIONS.md (DROP POLICY, a bulk UPDATE, scheduled DELETEs). Blast radius:
--    · the vote SELECT policies are dropped and one is re-created in the same transaction; a signed-out
--      reader loses the voter rows (by design), and a page loaded before the client that reads
--      vote_count (js/community-board.js) still embeds them, so its board request fails and it shows an
--      empty board to a signed-out reader until it is reloaded (production: 0 votes, 0 posts);
--    · the backfill UPDATE touches every post / comment whose total differs (production: none);
--    · the first cron-run-history-purge removes the run history before 14 days ago (about 29,000 rows
--      of pg_cron's own log — no reader's data); anonymous-reports-purge removes nothing until a
--      signed-out report is 730 days old (production's oldest: 2026-06-13);
--    · §5 rewrites the display_name of the 51 profiles whose name is their e-mail's local part (to the
--      provider's name, or null) — the old value is that local part, so it is recomputable from
--      profiles.email should it ever be wanted back.
--    Recovery: forward-fix. Re-create the dropped policies from 20260718090000_baseline.sql §6.10/6.11
--    and `grant select … to anon`; `select cron.unschedule('<name>')` stops a job. The deleted cron
--    history is not restorable from this database (it is in the backup taken before the merge).
-- ============================================================================
begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  1a. THE TOTALS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.community_posts    add column if not exists vote_count integer not null default 0;
alter table public.community_comments add column if not exists vote_count integer not null default 0;
comment on column public.community_posts.vote_count is
  'security-audit: how many accounts upvoted this post — kept by trg_community_votes_count. The voters themselves are readable only by each voter (community_votes).';
comment on column public.community_comments.vote_count is
  'security-audit: how many accounts upvoted this comment — kept by trg_community_comment_votes_count. The voters themselves are readable only by each voter (community_comment_votes).';

create or replace function public.tg_community_post_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.community_posts p set vote_count = greatest(p.vote_count - 1, 0) where p.id = old.post_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.community_posts p set vote_count = p.vote_count + 1 where p.id = new.post_id;
  end if;
  return null;
end;
$$;
comment on function public.tg_community_post_vote_count() is
  'security-audit: AFTER INSERT/DELETE/UPDATE OF post_id on community_votes — moves community_posts.vote_count with the vote. SECURITY DEFINER because the voter does not own the post row.';

create or replace function public.tg_community_comment_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.community_comments c set vote_count = greatest(c.vote_count - 1, 0) where c.id = old.comment_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.community_comments c set vote_count = c.vote_count + 1 where c.id = new.comment_id;
  end if;
  return null;
end;
$$;
comment on function public.tg_community_comment_vote_count() is
  'security-audit: AFTER INSERT/DELETE/UPDATE OF comment_id on community_comment_votes — moves community_comments.vote_count with the vote. SECURITY DEFINER because the voter does not own the comment row.';

-- A trigger function is not an RPC; nobody needs EXECUTE on it (20260926090000's rule).
revoke execute on function public.tg_community_post_vote_count()    from public, anon, authenticated;
revoke execute on function public.tg_community_comment_vote_count() from public, anon, authenticated;

-- The triggers first, the backfill second: CREATE TRIGGER locks the vote table against writes until
-- this transaction commits, so no vote can land between the count and the trigger.
drop trigger if exists trg_community_votes_count on public.community_votes;
create trigger trg_community_votes_count
  after insert or delete or update of post_id on public.community_votes
  for each row execute function public.tg_community_post_vote_count();

drop trigger if exists trg_community_comment_votes_count on public.community_comment_votes;
create trigger trg_community_comment_votes_count
  after insert or delete or update of comment_id on public.community_comment_votes
  for each row execute function public.tg_community_comment_vote_count();

update public.community_posts p
   set vote_count = coalesce((select count(*)::integer from public.community_votes v where v.post_id = p.id), 0)
 where p.vote_count is distinct from coalesce((select count(*)::integer from public.community_votes v where v.post_id = p.id), 0);
update public.community_comments c
   set vote_count = coalesce((select count(*)::integer from public.community_comment_votes v where v.comment_id = c.id), 0)
 where c.vote_count is distinct from coalesce((select count(*)::integer from public.community_comment_votes v where v.comment_id = c.id), 0);

-- ─────────────────────────────────────────────────────────────────────────────
--  1b. A VOTE IS READ BY ITS VOTER ONLY
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select pol.tablename, pol.policyname
      from pg_catalog.pg_policies pol
     where pol.schemaname = 'public'
       and pol.tablename in ('community_votes', 'community_comment_votes')
       and pol.cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'dropped the % policy % (a vote is read by its voter only)', r.tablename, r.policyname;
  end loop;
end $$;

create policy comm_votes_select_own on public.community_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy comm_cvotes_select_own on public.community_comment_votes
  for select to authenticated using (user_id = (select auth.uid()));

revoke select on public.community_votes, public.community_comment_votes from public, anon;
-- authenticated keeps SELECT (the policy above scopes it to the caller's rows; DELETE … WHERE needs it).
grant  select on public.community_votes, public.community_comment_votes to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  2a. SIGNED-OUT FEEDBACK AND BUG REPORTS END AFTER 730 DAYS
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_anonymous_reports(p_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz := now() - make_interval(days => greatest(1, coalesce(p_days, 730)));
  n1 integer;
  n2 integer;
begin
  delete from public.feedback f    where f.user_id is null and f.created_at < v_cut;
  get diagnostics n1 = row_count;
  delete from public.bug_reports b where b.user_id is null and b.created_at < v_cut;
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;
comment on function public.purge_anonymous_reports(integer) is
  'security-audit: deletes feedback and bug_reports sent while signed out (user_id IS NULL) p_days (730) after they were received — the retention the privacy policy §6 states. Signed-in rows end with the account (delete_account_data). service_role only (pg_cron).';
revoke execute on function public.purge_anonymous_reports(integer) from public, anon, authenticated;
grant  execute on function public.purge_anonymous_reports(integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  2b. pg_cron's run history ends after 14 days
--      (to_regclass inside the body: where pg_cron is absent the function exists and deletes nothing)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_cron_run_history(p_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer := 0;
begin
  if pg_catalog.to_regclass('cron.job_run_details') is null then
    return 0;
  end if;
  delete from cron.job_run_details d
   where coalesce(d.end_time, d.start_time) < now() - make_interval(days => greatest(1, coalesce(p_days, 14)));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.purge_cron_run_history(integer) is
  'security-audit: deletes pg_cron run history (cron.job_run_details) older than p_days (14). The history held command texts, including the old news-ingest secret literal. service_role only (pg_cron).';
revoke execute on function public.purge_cron_run_history(integer) from public, anon, authenticated;
grant  execute on function public.purge_cron_run_history(integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  2c. THE SCHEDULES — by name, so re-applying replaces rather than adds (20260925090000).
--      Daily ones after the existing 03:17 / 03:27 / 03:37 / 03:47 purges; the hourly sweep on a
--      minute no other job uses.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the anonymous-reports-purge, cron-run-history-purge and relay-rate-buckets-sweep schedules';
    return;
  end if;
  perform cron.schedule('anonymous-reports-purge',  '57 3 * * *', 'select public.purge_anonymous_reports(730)');
  perform cron.schedule('cron-run-history-purge',   '7 4 * * *',  'select public.purge_cron_run_history(14)');
  perform cron.schedule('relay-rate-buckets-sweep', '53 * * * *', 'select public.sweep_relay_rate_buckets()');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. THE SIZES (derivations in the header, §3)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comm_posts_media_len_guard' and conrelid = 'public.community_posts'::regclass) then
    alter table public.community_posts add constraint comm_posts_media_len_guard
      check ( (img      is null or char_length(img)      <= 6000000)
          and (category is null or char_length(category) <= 120) ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_len_guard' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_len_guard
      check ( (display_name is null or char_length(display_name) <= 255)
          and (bio          is null or char_length(bio)          <= 280)
          and (avatar_url   is null or char_length(avatar_url)   <= 350000) ) not valid;
  end if;
end $$;

comment on constraint comm_posts_media_len_guard on public.community_posts is
  'security-audit: img ≤ 6,000,000 (compressImage 1100 px JPEG, worst case measured 4,744,987 + 25 %), category ≤ 120 (an id of COMM_CATEGORIES). Enforced on new writes.';
comment on constraint profiles_len_guard on public.profiles is
  'security-audit: display_name ≤ 255 (bound of auth.users.email, the longest writer), bio ≤ 280 (the last editor''s maxlength), avatar_url ≤ 350,000 (256 px crop JPEG, worst case measured 256,079 + 25 %). Copied to world-readable profiles_public. Enforced on new writes.';

-- ─────────────────────────────────────────────────────────────────────────────
--  4. PRODUCTION-ONLY OBJECTS — hardened where they exist, a no-op elsewhere
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    alter function public.set_updated_at() set search_path = '';
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. A PUBLIC NAME IS NOT MADE FROM AN E-MAIL ADDRESS
-- ─────────────────────────────────────────────────────────────────────────────
--  Production's handle_new_user was not the baseline's (read 2026-10-23): it set
--  display_name := split_part(new.email, '@', 1) and made the FIRST account to sign up an admin. The
--  name is copied to world-readable profiles_public, so 51 of 56 profiles published the local part
--  of their owner's e-mail address. The baseline (20260718090000 §4, #R33) never derives a name from
--  the address — it takes the name the provider gave, or none. That body is re-applied here; the
--  first-account-is-admin branch goes with it (admin is granted only by an operator).
--  The 51 rows whose display_name is EXACTLY their address's local part get the provider's name
--  (49 have one — Google's full_name / name) or none (2). A name the reader changed is not touched,
--  because it no longer equals the local part. Operator's choice, 2026-10-23.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    -- clipped to profiles_len_guard's 255 (§3): a provider's name never makes a sign-up fail
    left(nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )), ''), 255)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

update public.profiles p
   set display_name = left(nullif(btrim(coalesce(
         u.raw_user_meta_data ->> 'display_name',
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name')), ''), 255)
  from auth.users u
 where u.id = p.id
   and p.email is not null
   and p.display_name = split_part(p.email, '@', 1);

commit;
