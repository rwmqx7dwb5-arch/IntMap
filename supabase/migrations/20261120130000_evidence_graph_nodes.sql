-- ============================================================================
--  IntMap · evidence graph — the account copy of a reader's lineage (js/evidence-graph-sync.js)
--  (docs/architecture/05-ai.md «Evidence Graph» · dev-notes/2026-11-20-goal-and-evidence.md)
-- ----------------------------------------------------------------------------
--  WHY A TABLE. The lineage graph (js/evidence-graph.js) answers «this source was updated — which of my past
--  results does that touch?». It lived for one page; reloading forgot it. One row per NODE keeps it:
--    source   the system of record (a dataset, a web document …) with every version of it that was read
--    derived  something IntMap or a model made (a GIS op output, a figure in an answer, a notebook note), with
--             its inputs and the version of each it pinned
--  The node id is content-addressed for derived nodes (the same derivation is the same row) and stable for
--  sources (their versions accumulate inside `payload`), so a second device writing the same node is an upsert.
--
--  ACCESS. Owner-only through RLS — the nodes hold what the reader asked and was answered. Written only when the
--  reader has turned notebook sync on (js/atlas-notebook.js calls the sync beside its own); deleted with the
--  notebook's account copy and with the account (ON DELETE CASCADE; public._owned_by_user_cols() finds the table).
-- ============================================================================

create table if not exists public.evidence_graph_nodes (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  id          text        not null check (length(id) between 5 and 700),
  kind        text        not null check (kind in ('source', 'derived')),
  type        text        not null default 'other',
  payload     jsonb       not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 262144),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id),
  check (payload ->> 'id' = id and payload ->> 'kind' = kind)
);
comment on table public.evidence_graph_nodes is
  '(evidence-graph) One lineage node per row — a source (with every version read) or a derived result (inputs with the version each pinned, the calculation, the output fingerprint). Owner-only through RLS. Shape: js/evidence-graph.js.';
comment on column public.evidence_graph_nodes.payload is
  'The node exactly as the page holds it (id, kind, type, label, versions | inputs, calc, output, meta). payload.id and payload.kind must equal the columns.';

create index if not exists evidence_graph_nodes_user_kind_idx on public.evidence_graph_nodes (user_id, kind);

-- the account bound: 50 MiB of lineage per account, refused by name before the row is written.
-- SECURITY INVOKER: it sums only the writer's own rows, which RLS already lets them read.
create or replace function public.evidence_graph_account_bound()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare used bigint;
begin
  select coalesce(sum(octet_length(e.payload::text)), 0) into used
    from public.evidence_graph_nodes e
   where e.user_id = new.user_id
     and not (tg_op = 'UPDATE' and e.id = old.id);
  if used + octet_length(new.payload::text) > 52428800 then
    raise exception 'evidence-graph-account-full' using errcode = 'P0001',
      hint = 'This account already holds 50 MiB of evidence lineage. Delete the notebook account copy, or keep it on the device only.';
  end if;
  return new;
end;
$$;
revoke all on function public.evidence_graph_account_bound() from public, anon, authenticated;

drop trigger if exists evidence_graph_account_bound on public.evidence_graph_nodes;
create trigger evidence_graph_account_bound
  before insert or update on public.evidence_graph_nodes
  for each row execute function public.evidence_graph_account_bound();

alter table public.evidence_graph_nodes enable row level security;
drop policy if exists evidence_graph_nodes_own on public.evidence_graph_nodes;
create policy evidence_graph_nodes_own on public.evidence_graph_nodes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.evidence_graph_nodes from public, anon, authenticated;
grant select, insert, update, delete on public.evidence_graph_nodes to authenticated;
grant select, insert, update, delete on public.evidence_graph_nodes to service_role;

insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('evidence_graph_nodes', 'you',
   'Evidence lineage', '根拠の系譜',
   'Where each figure in your Atlas answers came from — the data and documents it was read from, with the version of each, and the steps between — copied here only after you turn notebook sync on, so a data update can be traced to the results it affects on every device you sign in on.',
   'Atlas の回答の数値がどのデータ・文書（とその版）から、どの手順を経て出たかの記録。ノートの同期をオンにしたときだけここへ写し、データが更新されたとき、影響を受ける結果をどの端末でもたどれるようにします。',
   'Kept until you delete the notebook account copy or your account.',
   'ノートのアカウント上のコピーかアカウントを削除するまで保持します。')
on conflict (tbl) do update set
  written_by = excluded.written_by,
  label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
