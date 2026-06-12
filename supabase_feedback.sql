-- ============================================================
-- IntMap — user feedback (#R20)
-- Run once in the Supabase SQL Editor.
-- Stores the 5-star rating + free-text feedback from the
-- "Feedback" button next to Support. Anyone (incl. anonymous
-- visitors) can INSERT; only admins (profiles.is_admin) can
-- read — view it in admin.html → Feedback.
-- ============================================================

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  lang        text,
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  ua          text,
  page        text
);

alter table public.feedback enable row level security;

-- anyone may submit feedback (anonymous included)
drop policy if exists "feedback_insert_all" on public.feedback;
create policy "feedback_insert_all" on public.feedback
  for insert to anon, authenticated
  with check (rating between 1 and 5);

-- only admins may read
drop policy if exists "feedback_select_admin" on public.feedback;
create policy "feedback_select_admin" on public.feedback
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- only admins may delete
drop policy if exists "feedback_delete_admin" on public.feedback;
create policy "feedback_delete_admin" on public.feedback
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
