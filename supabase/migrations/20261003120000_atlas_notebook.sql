-- ============================================================================
--  atlas-os — THE INVESTIGATION NOTEBOOK, ON THE READER'S ACCOUNT
-- ----------------------------------------------------------------------------
--  js/atlas-notebook.js files every finished Atlas turn in the reader's investigation notebook — the
--  question, the answer, the view it ended in, the operations with their exact arguments and the rows
--  its queries found — on the DEVICE (IndexedDB). This table is the copy on the reader's ACCOUNT, so the
--  same notebook is on every device they sign in on. It is written ONLY when the reader turns
--  「アカウントと同期」 on in the notebook's settings (off until they do), and the same settings page
--  deletes every row of theirs (「アカウント上のコピーを削除」).
--
--  THE SHAPE: one row per notebook entry, keyed by (account, the entry id the device minted). The
--  columns a person reads are columns (question, answer, the two times); the rest of the entry — the
--  view, the steps, the query rows, the sources, the reader's note — rides in `payload`, whose layout is
--  js/atlas-notebook-store.js rowFromEntry / entryFromRow (normalised on the way back in, so a row is
--  never trusted to have the right types).
--
--  WHO MAY DO WHAT: the owner, and nobody else — select / insert / update / delete through RLS with
--  `user_id = auth.uid()` on both USING and WITH CHECK, so a row cannot be written under another
--  account either. anon has nothing. service_role keeps its privileges (it bypasses RLS).
--
--  ⚠ TWO BOUNDS, AND WHY THEY ARE NOT LIMITS ON ATLAS (CONSTITUTION.md §5). Nothing here touches a turn:
--  a turn that is not synchronised is still filed on the device and still answered. What is bounded is
--  what ONE account may make this project store, because the table is writable straight through
--  PostgREST with a key every page carries (the shape the 2026-09-30 audit found in feedback /
--  bug_reports, anon-write-guard):
--    · a row is at most 1 MiB of payload. A DECISION, NOT A MEASUREMENT: an entry is the question, the
--      answer text (≤ 64,000 characters), the query rows a query kept (≤ its row limit) and the step
--      arguments, which is an ESTIMATED tens of kilobytes; no production notebook existed to measure when
--      this was written. An entry over it stays on the device and the panel names it — js/atlas-notebook.js
--      reports the upsert's error per entry.
--    · an account holds at most 100 MiB of notebook. Also a decision: on the estimate above, about ten
--      times what a reader filing one 30 kB entry every day for a year would hold. Refused with
--      `notebook-account-full`, reported the same way. Raise either when a reader's real notebook meets
--      it — the refusal says which, and dev-notes/2026-10-03-atlas-os.md records that both are estimates.
--  ⚠ NON-DESTRUCTIVE: a new table, a new trigger function and its trigger; no existing object changes.
-- ============================================================================

create table if not exists public.atlas_notebook_entries (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  id          text        not null check (id ~ '^nb-[a-z0-9-]{4,64}$'),
  created_at  timestamptz not null,
  updated_at  timestamptz not null default now(),
  question    text        not null check (length(question) between 1 and 8000),
  answer      text        not null default '' check (length(answer) <= 64000),
  payload     jsonb       not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 1048576),
  primary key (user_id, id)
);
comment on table public.atlas_notebook_entries is
  'atlas-os: the reader''s Atlas investigation notebook, copied to their account when they turn sync on (js/atlas-notebook.js). Owner-only through RLS. Layout of payload: js/atlas-notebook-store.js rowFromEntry.';
comment on column public.atlas_notebook_entries.payload is
  'The rest of the notebook entry: title, lang, status, view (camera/time/layers), steps (capability + exact arguments), results (query rows), sources, note, followOf, pinned.';

create index if not exists atlas_notebook_entries_user_created_idx on public.atlas_notebook_entries (user_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
--  THE ACCOUNT BOUND — refused by name, per account, before the row is written
--  SECURITY INVOKER on purpose: the rows it sums are the writer's own, which RLS already lets them read,
--  so it needs no privilege the caller lacks (and a definer would have to be re-proved against #R801).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.atlas_notebook_account_bound()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare used bigint;
begin
  select coalesce(sum(octet_length(e.payload::text) + octet_length(e.answer) + octet_length(e.question)), 0)
    into used
    from public.atlas_notebook_entries e
   where e.user_id = new.user_id
     and not (tg_op = 'UPDATE' and e.id = old.id);
  if used + octet_length(new.payload::text) + octet_length(new.answer) + octet_length(new.question) > 104857600 then
    raise exception 'notebook-account-full' using errcode = 'P0001',
      hint = 'This account already holds 100 MiB of Atlas notebook. Delete entries or the account copy, or keep the notebook on the device only.';
  end if;
  return new;
end;
$$;
revoke all on function public.atlas_notebook_account_bound() from public, anon, authenticated;

drop trigger if exists atlas_notebook_account_bound on public.atlas_notebook_entries;
create trigger atlas_notebook_account_bound
  before insert or update on public.atlas_notebook_entries
  for each row execute function public.atlas_notebook_account_bound();

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS + GRANTS — the owner only
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.atlas_notebook_entries enable row level security;

drop policy if exists atlas_notebook_entries_own on public.atlas_notebook_entries;
create policy atlas_notebook_entries_own on public.atlas_notebook_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.atlas_notebook_entries from public, anon, authenticated;
grant select, insert, update, delete on public.atlas_notebook_entries to authenticated;
grant select, insert, update, delete on public.atlas_notebook_entries to service_role;
