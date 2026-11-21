-- ============================================================================
--  IntMap · connection permissions — one place that knows, per service a reader has connected,
--  what Atlas may do there, what it is trusted with, and what it did
--  (dev-notes/2026-11-20-connection-permissions.md · supabase/functions/_shared/connection-*.js)
-- ----------------------------------------------------------------------------
--  MCP, the browser, server-side execution and outside data all give Atlas more services to use. Each adds
--  credentials, places data can rest, and addresses data can be sent to. This is the shared ledger under them.
--  It exists to let Atlas use MORE services, not fewer: a read is allowed by default and never asks; only
--  writes, spending and destruction are ask-by-default, and a reader may set any of the four to allow.
--
--  THREE TABLES, ALL OWNER-ISOLATED BY RLS:
--    connections             what the reader connected and the standing policy for it (owner reads/edits)
--    connection_credentials  the secret for a connection — CIPHERTEXT ONLY, closed to every browser role.
--                            The key that seals it lives in an Edge Function secret, never in this database,
--                            so a dump of the table opens nothing. Revoking a connection deletes its secret.
--    connection_ledger       append-only record of what was done through a connection: no payloads, no URLs
--                            (host only), no secrets. Owner reads; nobody updates; 90-day retention.
--  Decisions (allow / ask / deny) are made in JS from the row (_shared/connection-policy.js), so the browser
--  and the Edge Functions answer identically; the database holds the facts and the record.
-- ============================================================================

create table if not exists public.connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  service       text not null check (service ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  kind          text not null check (kind in ('mcp', 'browser', 'server', 'api', 'data')),
  label         text not null default '' check (char_length(label) <= 80),
  status        text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  -- what Atlas may do here, by the NATURE of the operation (not by the tool's name)
  mode_read        text not null default 'allow' check (mode_read        in ('allow', 'ask', 'deny')),
  mode_write       text not null default 'ask'   check (mode_write       in ('allow', 'ask', 'deny')),
  mode_spend       text not null default 'ask'   check (mode_spend       in ('allow', 'ask', 'deny')),
  mode_destructive text not null default 'ask'   check (mode_destructive in ('allow', 'ask', 'deny')),
  -- what the reader trusts this service with
  max_sensitivity       text    not null default 'personal' check (max_sensitivity in ('public', 'personal', 'private')),
  allow_retention       boolean not null default true,    -- may the service keep what it is sent
  allow_training        boolean not null default false,   -- may the service train on what it is sent
  daily_spend_cap_micros bigint check (daily_spend_cap_micros is null or daily_spend_cap_micros >= 0),
  -- what the SERVICE says about itself (its terms), recorded so the comparison is on the page, not in memory
  data_terms    jsonb not null default '{}'::jsonb check (jsonb_typeof(data_terms) = 'object' and pg_column_size(data_terms) <= 2048),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, service, label)
);
comment on table public.connections is
  '(connection-permissions) A service the reader connected (MCP server, browser profile, server runner, API, data source) and the standing policy for it: allow/ask/deny per operation class, the most sensitive data it may be sent, retention and training consent, a daily spend cap, and the service''s own declared terms. The owner reads and edits their own rows.';

create index if not exists connections_user_idx on public.connections (user_id);

create table if not exists public.connection_credentials (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  ciphertext    text not null check (char_length(ciphertext) between 16 and 16384),
  key_version   integer not null default 1 check (key_version >= 1),
  hint          text not null default '' check (char_length(hint) <= 8),   -- e.g. the last 4 characters, supplied by the sealer
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  rotated_at    timestamptz
);
comment on table public.connection_credentials is
  '(connection-permissions) The secret for a connection, sealed (AES-GCM) by an Edge Function with a key that is NOT in this database. Ciphertext only; closed to every browser role; read and written by service_role through conn_credential_*. Deleted when its connection is revoked.';

create table if not exists public.connection_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  service       text not null check (service ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  op            text not null,                                   -- what was done, in the connector's words ("tools/call:search")
  op_class      text not null check (op_class in ('read', 'write', 'spend', 'destructive')),
  decision      text not null check (decision in ('allow', 'ask', 'deny')),
  outcome       text not null check (outcome in ('ok', 'failed', 'declined', 'refused')),
  actor         text not null default 'atlas' check (actor in ('atlas', 'user', 'system')),
  code          text not null default '',
  host          text not null default '',                        -- the host contacted; never a URL
  cost_micros   bigint not null default 0 check (cost_micros >= 0),
  created_at    timestamptz not null default now()
);
comment on table public.connection_ledger is
  '(connection-permissions) Append-only record of what was done through a connection: operation name and class, the decision taken, the outcome, the host contacted and the cost. It holds no request or response content, no URL and no secret. The owner reads their own rows; written through conn_log; deleted after 90 days.';

create index if not exists connection_ledger_user_idx on public.connection_ledger (user_id, created_at desc);
create index if not exists connection_ledger_conn_idx on public.connection_ledger (connection_id, created_at);
create index if not exists connection_ledger_created_idx on public.connection_ledger (created_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.connections            enable row level security;
alter table public.connection_credentials enable row level security;
alter table public.connection_ledger      enable row level security;

revoke all on public.connections, public.connection_credentials, public.connection_ledger from public, anon, authenticated;
grant all on public.connections, public.connection_credentials, public.connection_ledger to service_role;
grant usage, select on sequence public.connection_ledger_id_seq to service_role;

-- the owner may create, read, edit the policy columns of, and delete their own connections
grant select, delete on public.connections to authenticated;
grant insert (service, kind, label, status, mode_read, mode_write, mode_spend, mode_destructive,
              max_sensitivity, allow_retention, allow_training, daily_spend_cap_micros, data_terms, user_id)
  on public.connections to authenticated;
grant update (label, status, mode_read, mode_write, mode_spend, mode_destructive,
              max_sensitivity, allow_retention, allow_training, daily_spend_cap_micros, data_terms)
  on public.connections to authenticated;

drop policy if exists connections_owner_select on public.connections;
create policy connections_owner_select on public.connections for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists connections_owner_insert on public.connections;
create policy connections_owner_insert on public.connections for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists connections_owner_update on public.connections;
create policy connections_owner_update on public.connections for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists connections_owner_delete on public.connections;
create policy connections_owner_delete on public.connections for delete to authenticated
  using ((select auth.uid()) = user_id);

-- the ledger: owner reads; there is no UPDATE or DELETE policy for anyone but service_role (retention)
grant select on public.connection_ledger to authenticated;
drop policy if exists connection_ledger_owner_select on public.connection_ledger;
create policy connection_ledger_owner_select on public.connection_ledger for select to authenticated
  using ((select auth.uid()) = user_id);
-- credentials: no policy for any browser role (and no grant) — the table is invisible to them

-- ── invariants held by the database ──────────────────────────────────────────
create or replace function public.connections_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.connections c where c.user_id = new.user_id) >= 50 then
      raise exception 'too_many_connections' using errcode = '54000';
    end if;
  else
    new.updated_at := now();
    -- a revoked connection stays revoked: re-connecting is a new row with a new secret
    if old.status = 'revoked' and new.status <> 'revoked' then
      raise exception 'connection_revoked' using errcode = '22023';
    end if;
    -- revoking takes the secret away in the same statement
    if new.status = 'revoked' and old.status <> 'revoked' then
      delete from public.connection_credentials cc where cc.connection_id = new.id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.connections_guard() from public, anon, authenticated;

drop trigger if exists connections_guard_trg on public.connections;
create trigger connections_guard_trg before insert or update on public.connections
  for each row execute function public.connections_guard();

-- ── credential doors: service_role only (the Edge Function that holds the sealing key) ──
create or replace function public.conn_credential_put(
  p_user uuid, p_connection uuid, p_ciphertext text, p_key_version integer, p_hint text, p_expires timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.connections c
                  where c.id = p_connection and c.user_id = p_user and c.status <> 'revoked') then
    raise exception 'no_such_connection' using errcode = '42704';
  end if;
  insert into public.connection_credentials (connection_id, user_id, ciphertext, key_version, hint, expires_at)
  values (p_connection, p_user, p_ciphertext, greatest(1, coalesce(p_key_version, 1)), left(coalesce(p_hint, ''), 8), p_expires)
  on conflict (connection_id) do update set
    ciphertext = excluded.ciphertext, key_version = excluded.key_version, hint = excluded.hint,
    expires_at = excluded.expires_at, rotated_at = now();
  return true;
end $$;

create or replace function public.conn_credential_get(p_user uuid, p_connection uuid)
returns table (ciphertext text, key_version integer, hint text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select cc.ciphertext, cc.key_version, cc.hint, cc.expires_at
    from public.connection_credentials cc
    join public.connections c on c.id = cc.connection_id
   where cc.connection_id = p_connection and cc.user_id = p_user and c.status = 'active';
$$;

create or replace function public.conn_credential_delete(p_user uuid, p_connection uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.connection_credentials cc where cc.connection_id = p_connection and cc.user_id = p_user;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function public.conn_credential_put(uuid, uuid, text, integer, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.conn_credential_get(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.conn_credential_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.conn_credential_put(uuid, uuid, text, integer, text, timestamptz) to service_role;
grant execute on function public.conn_credential_get(uuid, uuid) to service_role;
grant execute on function public.conn_credential_delete(uuid, uuid) to service_role;

-- ── the ledger's one writer ──────────────────────────────────────────────────
--  Signed-in code (the page) logs for itself: p_user must be null or auth.uid(). service_role names the reader.
--  A connection that is not the reader's is refused, so a row can never be attributed to someone else's connection.
create or replace function public.conn_log(
  p_user uuid, p_connection uuid, p_service text, p_op text, p_class text,
  p_decision text, p_outcome text, p_actor text, p_code text, p_host text, p_cost_micros bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_user uuid;
  v_service text := p_service;
begin
  if v_uid is not null and p_user is not null and p_user <> v_uid then
    raise exception 'not_your_ledger' using errcode = '42501';
  end if;
  v_user := coalesce(v_uid, p_user);
  if v_user is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_connection is not null then
    select c.service into v_service from public.connections c where c.id = p_connection and c.user_id = v_user;
    if not found then raise exception 'no_such_connection' using errcode = '42704'; end if;
  end if;
  insert into public.connection_ledger
    (user_id, connection_id, service, op, op_class, decision, outcome, actor, code, host, cost_micros)
  values
    (v_user, p_connection, v_service, left(coalesce(p_op, ''), 80), p_class, p_decision, p_outcome,
     coalesce(nullif(p_actor, ''), 'atlas'), left(coalesce(p_code, ''), 64), left(coalesce(p_host, ''), 255),
     greatest(0, coalesce(p_cost_micros, 0)));
  return true;
end $$;
revoke execute on function public.conn_log(uuid, uuid, text, text, text, text, text, text, text, text, bigint) from public, anon;
grant execute on function public.conn_log(uuid, uuid, text, text, text, text, text, text, text, text, bigint) to authenticated, service_role;

-- ── what a connection has used today (the spend cap is compared in JS against this) ──
create or replace function public.conn_usage(p_user uuid, p_connection uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := coalesce(auth.uid(), p_user); v_out jsonb;
begin
  if auth.uid() is not null and p_user is not null and p_user <> auth.uid() then
    raise exception 'not_your_ledger' using errcode = '42501';
  end if;
  select jsonb_build_object('calls_today', count(*)::int, 'spend_today_micros', coalesce(sum(l.cost_micros), 0))
    into v_out
    from public.connection_ledger l
   where l.user_id = v_user and l.connection_id = p_connection
     and l.outcome = 'ok' and l.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  return v_out;
end $$;
revoke execute on function public.conn_usage(uuid, uuid) from public, anon;
grant execute on function public.conn_usage(uuid, uuid) to authenticated, service_role;

-- ── retention: 90 days. Observation — a ledger is read to explain what happened on a given day; the rows
--    hold no content, so keeping them is cheap. Expires if docs/MONITORING.md wants another window: change here only. ──
create or replace function public.purge_connection_ledger(p_days integer default 90)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.connection_ledger l
   where l.created_at < now() - make_interval(days => greatest(1, coalesce(p_days, 90)));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_connection_ledger(integer) from public, anon, authenticated;
grant execute on function public.purge_connection_ledger(integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the connection-ledger-purge schedule';
    return;
  end if;
  perform cron.schedule('connection-ledger-purge', '37 3 * * *', 'select public.purge_connection_ledger(90)');
end $$;

-- ── the account's data inventory states the new tables ──
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('connections', 'you',
   'Connected services and their rules', '接続したサービスと、その使い方のルール',
   'The services you connected to Atlas and the rules you set for each: what Atlas may do without asking, how sensitive the data it may send can be, whether the service may keep it, and a daily spending limit.',
   'Atlasにつなげたサービスごとのルールです。Atlasが確認なしにしてよいこと、送ってよいデータの機微さ、サービスが保存してよいか、1日の使用上限を持ちます。',
   'Kept until you remove the connection or delete your account.',
   '接続を外すか、アカウントを削除するまで保存されます。'),
  ('connection_credentials', 'intmap',
   'Saved sign-in for a connected service', '接続したサービスの保存済みサインイン情報',
   'The sign-in secret for a service you connected, stored encrypted with a key kept outside the database. Only IntMap''s servers can open it, and it is removed when you disconnect the service.',
   '接続したサービスのサインイン用の秘密情報です。データベースの外に置いた鍵で暗号化して保存します。開けるのはIntMapのサーバーだけで、接続を外すと消えます。',
   'Deleted when you disconnect the service, and when you delete your account.',
   '接続を外したとき、アカウントを削除したときに消えます。'),
  ('connection_ledger', 'intmap',
   'Record of what Atlas did through a connected service', '接続したサービスでAtlasが行ったことの記録',
   'One row per action Atlas took through a connected service: what kind of action, whether it was allowed, the result, the host contacted and the cost. It holds no content, no web address and no secret.',
   '接続したサービスを通じてAtlasが行った操作1つにつき1行。操作の種類、許可されたか、結果、接続先のホスト、費用を持ちます。内容もWebアドレスも秘密情報も持ちません。',
   'Deleted automatically after 90 days, and when you delete your account.',
   '90日後に自動で削除されます。アカウントを削除したときも消えます。')
on conflict (tbl) do update set
  written_by = excluded.written_by, label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
