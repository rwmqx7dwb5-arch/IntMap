-- (#R10) Donations / supporters table.
-- Records a logged-in user's donation INTENT when they click the support button, so a future paid
-- plan can recognise early supporters. The actual payment happens on Stripe's hosted page; a Stripe
-- webhook (Edge Function) can later UPDATE the matching row to status='paid' with amount/currency.
--
-- Run this in the Supabase SQL editor.

create table if not exists public.donations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  locale      text,                         -- 'jp' | 'en'
  source      text,                         -- e.g. 'support_button'
  status      text default 'initiated',     -- 'initiated' | 'paid' | 'refunded'
  amount      numeric,                      -- filled by a Stripe webhook if/when paid
  currency    text,                         -- 'jpy' | 'usd' …
  stripe_session_id text,
  created_at  timestamptz default now()
);

alter table public.donations enable row level security;

-- A signed-in user can insert their own intent rows and read their own history.
drop policy if exists donations_insert_own on public.donations;
create policy donations_insert_own on public.donations
  for insert with check (auth.uid() = user_id);

drop policy if exists donations_select_own on public.donations;
create policy donations_select_own on public.donations
  for select using (auth.uid() = user_id);

-- (A service-role Stripe webhook bypasses RLS to UPDATE status/amount after a successful payment.)
create index if not exists donations_user_idx on public.donations(user_id);
