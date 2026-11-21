-- ============================================================================
--  atlas-knowledge — ATLAS'S KEPT KNOWLEDGE, ON THE READER'S ACCOUNT
-- ----------------------------------------------------------------------------
--  js/atlas-knowledge-store.js keeps the claims an investigation established (each with the source it rests on, the
--  place / period / world object it is about, and how far it may be trusted) on the DEVICE (IndexedDB), and only after
--  the reader turns kept knowledge on. This table is the copy on the reader's ACCOUNT, so the same claims are on every
--  device they sign in on. It is written ONLY when the reader chooses «my account» in Settings (the row «Atlas
--  knowledge», js/atlas-knowledge-prefs.js — a SECOND choice after «this device»), and the same row, or Atlas's
--  `knowledge.setting`, deletes every row of theirs.
--
--  THE SHAPE mirrors the notebook's (20261003170000_atlas_notebook.sql): one row per claim, keyed by (account, the claim
--  id the device minted). The statement is a column a person reads; the rest of the claim — sources with their re-check
--  history, place, period, refs and the world-graph keys they had, relations — rides in `payload`, whose layout is
--  js/atlas-knowledge-sync.js rowFromClaim / claimFromRow (normalised on the way back in, so a row is never trusted to
--  have the right types).
--
--  WHO MAY DO WHAT: the owner, and nobody else — select / insert / update / delete through RLS with
--  `user_id = auth.uid()` on both USING and WITH CHECK. anon has nothing. service_role keeps its privileges.
--
--  ⚠ TWO BOUNDS, AND WHY THEY ARE NOT LIMITS ON ATLAS (CONSTITUTION.md §5): a turn that is not synchronised is still
--  answered and its claims are still kept on the device. What is bounded is what ONE account may make this project store,
--  because the table is writable straight through PostgREST with a key every page carries:
--    · a row is at most 64 KiB of payload. A DECISION, NOT A MEASUREMENT: a claim is one statement (≤ 1,000 characters),
--      a basis (≤ 600), up to 12 refs with their keys, a few sources and their last checks — an ESTIMATED few kilobytes;
--      no production table existed to measure when this was written. A claim over it stays on the device and the sync names it.
--    · an account holds at most 20 MiB of kept knowledge. Also a decision: on that estimate, several thousand claims.
--      Refused with `knowledge-account-full`, reported the same way. Raise either when a reader's real knowledge meets it.
--  ⚠ NON-DESTRUCTIVE: a new table, a new trigger function and its trigger, one catalogue row; no existing object changes.
-- ============================================================================

create table if not exists public.atlas_knowledge_claims (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  id          text        not null check (id ~ '^kn-[a-z0-9-]{4,64}$'),
  created_at  timestamptz not null,
  updated_at  timestamptz not null default now(),
  statement   text        not null check (length(statement) between 1 and 1000),
  payload     jsonb       not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  primary key (user_id, id)
);
comment on table public.atlas_knowledge_claims is
  'atlas-knowledge: the claims Atlas kept from the reader''s investigations, copied to their account when they choose «my account» in Settings (js/atlas-knowledge-sync.js). Owner-only through RLS. Layout of payload: js/atlas-knowledge-store.js claimFromInput.';
comment on column public.atlas_knowledge_claims.payload is
  'The rest of the claim: kind (verified / inferred / stale / contested), basis, sources (url, title, last re-check), place, validFromMs / validToMs, recheckAfterMs, refs and refKeys (the world-graph keys they had), contradicts / supersedes.';

create index if not exists atlas_knowledge_claims_user_updated_idx on public.atlas_knowledge_claims (user_id, updated_at);

-- ─────────────────────────────────────────────────────────────────────────────
--  THE ACCOUNT BOUND — refused by name, per account, before the row is written
--  SECURITY INVOKER on purpose (the same reason as atlas_notebook_account_bound): the rows it sums are the writer's own,
--  which RLS already lets them read, so it needs no privilege the caller lacks.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.atlas_knowledge_account_bound()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare used bigint;
begin
  select coalesce(sum(octet_length(e.payload::text) + octet_length(e.statement)), 0)
    into used
    from public.atlas_knowledge_claims e
   where e.user_id = new.user_id
     and not (tg_op = 'UPDATE' and e.id = old.id);
  if used + octet_length(new.payload::text) + octet_length(new.statement) > 20971520 then
    raise exception 'knowledge-account-full' using errcode = 'P0001',
      hint = 'This account already holds 20 MiB of Atlas knowledge. Forget claims or delete the account copy, or keep knowledge on the device only.';
  end if;
  return new;
end;
$$;
revoke all on function public.atlas_knowledge_account_bound() from public, anon, authenticated;

drop trigger if exists atlas_knowledge_account_bound on public.atlas_knowledge_claims;
create trigger atlas_knowledge_account_bound
  before insert or update on public.atlas_knowledge_claims
  for each row execute function public.atlas_knowledge_account_bound();

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS + GRANTS — the owner only
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.atlas_knowledge_claims enable row level security;

drop policy if exists atlas_knowledge_claims_own on public.atlas_knowledge_claims;
create policy atlas_knowledge_claims_own on public.atlas_knowledge_claims
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.atlas_knowledge_claims from public, anon, authenticated;
grant select, insert, update, delete on public.atlas_knowledge_claims to authenticated;
grant select, insert, update, delete on public.atlas_knowledge_claims to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  ITS SENTENCE IN THE ACCOUNT'S DATA CATALOGUE (20261003130000_account_data_center.sql).
--  user_id references auth.users, so public._owned_by_user_cols() discovers the table: the export and the account purge
--  reach it with no list naming it. The catalogue says what the rows are.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('atlas_knowledge_claims', 'you',
   'Atlas knowledge', 'Atlas の知識',
   'The claims Atlas kept from your investigations — each statement with the source it rests on, where and when it holds, and when its source was last re-checked — copied here only after you choose «my account» in Settings, so they are on every device you sign in on.',
   'Atlas があなたの調査から残した主張。根拠となる出典・成り立つ場所と時期・出典を最後に再確認した日つき。設定で「アカウントにも保存」を選んだときだけここへ写し、ログインしたどの端末でも使えるようにします。',
   'Kept until you forget the claim, delete the account copy, or delete your account.',
   '主張を削除するか、アカウント上のコピーまたはアカウントを削除するまで保持します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
