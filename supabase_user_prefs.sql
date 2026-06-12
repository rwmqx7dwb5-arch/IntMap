-- ============================================================
-- IntMap — per-account preference sync (#R20)
-- Run once in the Supabase SQL Editor.
-- One JSONB blob per user: settings, layer favourites, widget
-- board, layer presets. Loaded on sign-in, upserted on change,
-- so a logged-in user keeps their setup across devices.
-- ============================================================

create table if not exists public.user_prefs (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

drop policy if exists "user_prefs_own_select" on public.user_prefs;
create policy "user_prefs_own_select" on public.user_prefs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_prefs_own_insert" on public.user_prefs;
create policy "user_prefs_own_insert" on public.user_prefs
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_prefs_own_update" on public.user_prefs;
create policy "user_prefs_own_update" on public.user_prefs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_prefs_own_delete" on public.user_prefs;
create policy "user_prefs_own_delete" on public.user_prefs
  for delete to authenticated using (auth.uid() = user_id);
