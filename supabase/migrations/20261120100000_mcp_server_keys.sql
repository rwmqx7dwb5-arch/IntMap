-- ============================================================================
--  IntMap · MCP server — who may call it, and the one switch that stops everyone
--  (supabase/functions/mcp-server · dev-notes/2026-11-20-mcp-server.md)
-- ----------------------------------------------------------------------------
--  An outside AI (Claude Code, ChatGPT …) reaches IntMap's read-only tools with a Bearer key a reader issued
--  to themselves. Three properties are held HERE, in the database, so no isolate and no deploy can lose them:
--
--    1. THE KEY IS NEVER STORED. Only sha256(key) is; the raw key is returned once, by mcp_issue_key, and
--       cannot be read back. A leaked table does not leak a working key.
--    2. A KEY CAN BE TAKEN AWAY BY ITS OWNER (mcp_revoke_key) and the server stops honouring it on the next call.
--    3. ONE ROW STOPS THE WHOLE SERVER: `update public.mcp_server_state set enabled = false`. No redeploy.
--       (A switch that needs a deploy is not a stop switch.)
--
--  Spend limits are NOT here: per-key and project-wide ceilings are token buckets in public.relay_take
--  (20260918100000_r801_relay_rate_limit.sql), which the function drives with this key's `daily_limit`.
--  ACCESS: the tables are closed to every browser role; the three owner doors are SECURITY DEFINER and keyed on
--  auth.uid(); mcp_authorize is for service_role only (the Edge Function).
-- ============================================================================

create table if not exists public.mcp_api_keys (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 80),
  key_hash    text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  daily_limit integer not null default 500 check (daily_limit between 1 and 5000),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  last_used   timestamptz
);
comment on table public.mcp_api_keys is
  '(mcp-server) A reader''s key for the MCP server. Only sha256(key) is stored. daily_limit is this key''s ceiling in tool calls per day (a token bucket in relay_take). Closed to browser roles; read through mcp_list_keys.';

create table if not exists public.mcp_server_state (
  singleton boolean primary key default true check (singleton),
  enabled   boolean not null default true,
  note      text not null default '',
  changed_at timestamptz not null default now()
);
comment on table public.mcp_server_state is
  '(mcp-server) THE STOP SWITCH: one row. enabled=false makes every MCP call answer 503 server_disabled at once, with no deploy.';
insert into public.mcp_server_state (singleton) values (true) on conflict do nothing;

alter table public.mcp_api_keys    enable row level security;
alter table public.mcp_server_state enable row level security;
revoke all on public.mcp_api_keys, public.mcp_server_state from public, anon, authenticated;
grant all on public.mcp_api_keys, public.mcp_server_state to service_role;

-- issue: returns the raw key ONCE. At most 5 live keys per reader.
create or replace function public.mcp_issue_key(p_label text)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_raw  text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_label is null or char_length(btrim(p_label)) not between 1 and 80 then
    raise exception 'bad_label' using errcode = '22023';
  end if;
  if (select count(*) from public.mcp_api_keys where owner = v_uid and revoked_at is null) >= 5 then
    raise exception 'too_many_keys' using errcode = '54000';
  end if;
  v_raw := 'imk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.mcp_api_keys (owner, label, key_hash)
  values (v_uid, btrim(p_label), encode(sha256(convert_to(v_raw, 'utf8')), 'hex'));
  return v_raw;
end;
$$;

create or replace function public.mcp_revoke_key(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  update public.mcp_api_keys set revoked_at = now()
   where id = p_id and owner = auth.uid() and revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

create or replace function public.mcp_list_keys()
returns table (id uuid, label text, created_at timestamptz, revoked_at timestamptz, last_used timestamptz, daily_limit integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select k.id, k.label, k.created_at, k.revoked_at, k.last_used, k.daily_limit
    from public.mcp_api_keys k where k.owner = auth.uid() order by k.created_at desc;
$$;

-- the Edge Function's one question: «is the server on, and is this key live?»
create or replace function public.mcp_authorize(p_key_hash text)
returns table (ok boolean, reason text, key_id uuid, daily_limit integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_on boolean; v_k public.mcp_api_keys;
begin
  select s.enabled into v_on from public.mcp_server_state s where s.singleton;
  if v_on is distinct from true then return query select false, 'server_disabled', null::uuid, 0; return; end if;
  select * into v_k from public.mcp_api_keys k where k.key_hash = p_key_hash;
  if not found or v_k.revoked_at is not null then return query select false, 'invalid_key', null::uuid, 0; return; end if;
  update public.mcp_api_keys set last_used = now() where id = v_k.id and (last_used is null or last_used < now() - interval '1 minute');
  return query select true, 'ok', v_k.id, v_k.daily_limit;
end;
$$;

revoke all on function public.mcp_issue_key(text), public.mcp_revoke_key(uuid), public.mcp_list_keys(), public.mcp_authorize(text) from public, anon, authenticated;
grant execute on function public.mcp_issue_key(text), public.mcp_revoke_key(uuid), public.mcp_list_keys() to authenticated;
grant execute on function public.mcp_authorize(text) to service_role;
