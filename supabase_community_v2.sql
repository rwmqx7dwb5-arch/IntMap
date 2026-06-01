-- ============================================================================
--  IntMap · Community v2  —  run ONCE in the Supabase SQL Editor
-- ----------------------------------------------------------------------------
--  Adds the schema the enhanced community UI uses:
--    • community_posts.category          (post category chip / filter / pin colour)
--    • community_posts.edited_at         ("edited" label + edit-own-post)
--    • community_comments.parent_id      (threaded replies)
--    • community_comments.edited_at      (edit-own-comment)
--    • community_comment_votes           (upvote comments)
--    • UPDATE policies so users can edit their own posts & comments
--
--  100% additive + idempotent — safe to run on the existing DB, and the front-end
--  degrades gracefully if you DON'T run it (the new controls just stay hidden).
--  Column types auto-match your existing id type (uuid or bigint).
-- ============================================================================

-- ---- 1) Post columns ------------------------------------------------------
alter table public.community_posts add column if not exists category   text;
alter table public.community_posts add column if not exists edited_at  timestamptz;

-- ---- 2) Comment columns (parent_id type matches community_comments.id) -----
do $$
declare idt text;
begin
  select data_type into idt from information_schema.columns
    where table_schema='public' and table_name='community_comments' and column_name='id';
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='community_comments' and column_name='parent_id') then
    execute format('alter table public.community_comments add column parent_id %s references public.community_comments(id) on delete cascade',
                   case when idt='uuid' then 'uuid' else 'bigint' end);
  end if;
end $$;
alter table public.community_comments add column if not exists edited_at timestamptz;
create index if not exists community_comments_parent_idx on public.community_comments(parent_id);

-- ---- 3) Comment-votes table (comment_id type matches community_comments.id) -
do $$
declare idt text;
begin
  select data_type into idt from information_schema.columns
    where table_schema='public' and table_name='community_comments' and column_name='id';
  if to_regclass('public.community_comment_votes') is null then
    execute format($f$
      create table public.community_comment_votes(
        comment_id %s not null references public.community_comments(id) on delete cascade,
        user_id    uuid not null references auth.users(id) on delete cascade,
        created_at timestamptz not null default now(),
        primary key (comment_id, user_id)
      )$f$, case when idt='uuid' then 'uuid' else 'bigint' end);
  end if;
end $$;

alter table public.community_comment_votes enable row level security;
drop policy if exists "ccv select"     on public.community_comment_votes;
create policy "ccv select"     on public.community_comment_votes for select using (true);
drop policy if exists "ccv insert own" on public.community_comment_votes;
create policy "ccv insert own" on public.community_comment_votes for insert with check (auth.uid() = user_id);
drop policy if exists "ccv delete own" on public.community_comment_votes;
create policy "ccv delete own" on public.community_comment_votes for delete using (auth.uid() = user_id);
grant select, insert, delete on public.community_comment_votes to authenticated;
grant select on public.community_comment_votes to anon;

-- ---- 4) Edit (UPDATE) policies for own posts & comments -------------------
drop policy if exists "community_posts update own" on public.community_posts;
create policy "community_posts update own" on public.community_posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "community_comments update own" on public.community_comments;
create policy "community_comments update own" on public.community_comments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- (Safety net in case the base schema lacked a comment delete policy; additive — OK if redundant.)
drop policy if exists "community_comments delete own v2" on public.community_comments;
create policy "community_comments delete own v2" on public.community_comments
  for delete using (auth.uid() = user_id);

-- ---- 5) Realtime so comment votes reflect live ---------------------------
do $$ begin
  alter publication supabase_realtime add table public.community_comment_votes;
exception when duplicate_object then null; when undefined_object then null; end $$;
