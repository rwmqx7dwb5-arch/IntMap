-- ============================================================================
--  map-document-unify — A SAVED MAP IS A MAP DOCUMENT: one map, a reader's own map, a tour, an Atlas answer
-- ----------------------------------------------------------------------------
--  THE PRODUCT. A reader kept maps four ways and only one of them reached the account: a saved map
--  (`saved_views`, 20261003211500_collection_workspace.sql) was ONE share-link fragment. A tour a teacher
--  wrote lived in one browser's localStorage and in its own link; the tour Atlas assembled lived in one tab;
--  a reader's own drawn map (`mm=`) lived in one browser; an Atlas answer lived in the notebook. None of them
--  could be kept on every device, filed in a collection or handed to a class through a published collection.
--  js/map-doc.js is the one shape they all are — an ordered list of map states, each with its words — and this
--  migration lets `saved_views` hold it:
--    · `kind`  — what the reader called it: 'view' (a map), 'map' (a reader's own drawn map), 'tour', 'brief'
--                (an Atlas answer). Read by the Library and Atlas to name a row; nothing branches on it here.
--    · `steps` — NULL for a document that is one map with no words of its own (every row saved before this
--                migration is that, and stays byte-for-byte as it was); otherwise the whole list,
--                [{state, title, say, ask}, …] — `state` a share-link fragment without '#' ('' for a step the
--                author has not given a map yet). The row's `state` is the list's first map, so a build that
--                does not know `steps` still opens the row as the map it starts on.
--  ONE DOCUMENT, ONE ROW. The identity was the fragment (`state_md5`); a tour that starts on the same map as
--  another tour, or as a saved map, is a different document. The identity becomes `doc_md5`, the fragment
--  followed by the steps — and for a row whose `steps` is NULL that is md5(state), exactly `state_md5`, so every
--  existing row keeps its identity and «the same map saved twice is one row» means what it meant.
--  THE DOORS ARE THE SAME DOORS: save_view() (now also with a kind and steps), shared_collection() (now with
--  each map's kind and steps — a visitor plays a tour from a published collection), copy_shared_collection()
--  (copies them). RLS, grants and the fences are unchanged; `kind` and `steps` are not updatable in place
--  (the owner re-saves), as `state` never was.
--  ⚠ NO DATA IS CHANGED OR LOST: three columns added (`kind` with the default every existing row already is, `steps`
--    NULL, `doc_md5` generated); one unique constraint REPLACED by one that is identical on every existing row
--    (doc_md5 = state_md5 where steps is NULL — added before the old one is dropped, so it cannot fail on the rows
--    there are); functions replaced with the same signatures, plus one new overload. No row is updated or deleted.
--    By docs/MIGRATIONS.md's list it still takes «extra care» (a UNIQUE added to a populated table, functions
--    replaced). BLAST RADIUS: saving, publishing and copying saved maps (save_view / shared_collection /
--    copy_shared_collection) — detected by supabase/tests/24 and 29 and by the Library failing to save.
--    RECOVERY: roll forward — re-create the 20261003211500 bodies of the three functions; the added columns and
--    the constraint are harmless to them (a row with steps is then saved and copied by its fragment alone).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE FENCE ON A DOCUMENT'S STEPS
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠ A FENCE AGAINST A RUNAWAY LOOP AND A ROW-SIZE BOUND, NOT A QUOTA. Observation: none — no document with steps
-- existed when this was written. 200 steps is an estimate: the classroom tours IntMap ships have 3-4 steps, and a
-- teacher's whole term of lessons strung into one tour is ~50; four times that. Each step's `state` is held to the
-- same 32,768 characters as a row's, and the whole list to 1 MiB — the notebook's own per-entry ceiling
-- (20261003170000_atlas_notebook.sql), so an Atlas answer kept as a document fits in the same room it had there.
-- js/map-doc.js STEPS_MAX and js/tours.js TOUR_INFLATED_MAX are read from / stated against these two numbers
-- (tests/map-document-unify-checks.test.mjs holds them equal). Expires the day a reader who is not looping meets
-- either: save_view raises 54000 and js/my-places.js names the refusal.
create or replace function public.saved_view_steps_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 200 $$;
comment on function public.saved_view_steps_limit() is
  '(map-document-unify) The most steps one saved document (a tour, an Atlas briefing) may hold — a fence against a runaway loop and a row-size bound, not a quota. The CHECK on saved_views.steps and save_view() enforce it.';
revoke execute on function public.saved_view_steps_limit() from public, anon;
grant  execute on function public.saved_view_steps_limit() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.saved_views add column if not exists kind text not null default 'view';
alter table public.saved_views drop constraint if exists saved_views_kind_check;
alter table public.saved_views add constraint saved_views_kind_check check (kind in ('view', 'map', 'tour', 'brief'));

alter table public.saved_views add column if not exists steps jsonb;
alter table public.saved_views drop constraint if exists saved_views_steps_check;
alter table public.saved_views add constraint saved_views_steps_check check (
  steps is null or (
    jsonb_typeof(steps) = 'array'
    and jsonb_array_length(steps) between 1 and public.saved_view_steps_limit()
    and octet_length(steps::text) <= 1048576));

-- the document's identity: the fragment, then the steps. For steps IS NULL this is md5(state) = state_md5.
alter table public.saved_views add column if not exists doc_md5 text generated always as (md5(state || coalesce(steps::text, ''))) stored;

comment on column public.saved_views.kind is
  '(map-document-unify) What the reader called it: view (a map), map (a reader''s own drawn map, carried in the fragment''s mm=), tour, brief (an Atlas answer). A name for the Library and Atlas; nothing branches on it in the database.';
comment on column public.saved_views.steps is
  '(map-document-unify) NULL for one map with no words of its own; otherwise the document''s steps, [{state, title, say, ask}] — state a share-link fragment without # ('''' for a step with no map yet). The row''s state is the first step that names a map. At most saved_view_steps_limit() steps and 1 MiB.';
comment on column public.saved_views.doc_md5 is
  '(map-document-unify) The document''s identity: md5 of the fragment followed by the steps — equal to state_md5 for every row whose steps is NULL. One row per document per account.';

-- ONE DOCUMENT, ONE ROW — the new identity is added first, and only then the old one is dropped (it is
-- identical on every existing row, so adding it cannot fail on the rows there are). The old constraint is found
-- by what it IS (unique on exactly user_id and state_md5), not by the name PostgreSQL happened to give it.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.saved_views'::regclass and conname = 'saved_views_one_per_document') then
    alter table public.saved_views add constraint saved_views_one_per_document unique (user_id, doc_md5);
  end if;
end $$;
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.saved_views'::regclass and con.contype = 'u'
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k)
           = array['state_md5', 'user_id']
  loop
    execute format('alter table public.saved_views drop constraint %I', c.conname);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. save_view() — the one door in, now for a whole document
-- ─────────────────────────────────────────────────────────────────────────────
-- The new overload takes the kind and the steps. ⚠ NEITHER HAS A DEFAULT: a call with the four arguments of
-- 20261003211500 resolves to the four-argument function alone (a default here would make that call ambiguous),
-- and that function hands its arguments to this one.
create or replace function public.save_view(
  p_name       text,
  p_state      text,
  p_note       text,
  p_collection text,
  p_kind       text,
  p_steps      jsonb
)
returns table (view_id uuid, created boolean, view_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_state text := regexp_replace(coalesce(p_state, ''), '^#', '');
  v_steps jsonb := null;
  v_first text;
  v_kind  text;
  v_md5   text;
  v_id    uuid;
  v_n     integer;
begin
  if v_uid is null then
    raise exception 'save_view: sign-in required' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'save_view: a map needs a name' using errcode = '22023';
  end if;
  if v_state !~ '^v=' then
    raise exception 'save_view: that is not a map link (it names no view)' using errcode = '22023';
  end if;
  if p_kind is not null and p_kind not in ('view', 'map', 'tour', 'brief') then
    raise exception 'save_view: % is not a kind of document', p_kind using errcode = '22023';
  end if;

  if p_steps is not null then
    if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
      raise exception 'save_view: steps must be a list of at least one step' using errcode = '22023';
    end if;
    if jsonb_array_length(p_steps) > public.saved_view_steps_limit() then
      raise exception 'save_view: a document holds at most % steps (the saved_view_steps_limit fence)', public.saved_view_steps_limit()
        using errcode = '54000';
    end if;
    if exists (select 1 from jsonb_array_elements(p_steps) e
                where jsonb_typeof(e) <> 'object'
                   or coalesce(jsonb_typeof(e -> 'state'), 'string') <> 'string'
                   or coalesce(jsonb_typeof(e -> 'title'), 'string') <> 'string'
                   or coalesce(jsonb_typeof(e -> 'say'),   'string') <> 'string'
                   or coalesce(jsonb_typeof(e -> 'ask'),   'string') <> 'string') then
      raise exception 'save_view: a step is {state, title, say, ask}, each a string' using errcode = '22023';
    end if;
    -- the steps as they are kept: exactly the four fields, each fragment without its '#'. Nothing else a caller
    -- puts in a step is stored (and so nothing else is published by shared_collection).
    select jsonb_agg(jsonb_build_object(
             'state', regexp_replace(coalesce(e ->> 'state', ''), '^#', ''),
             'title', coalesce(e ->> 'title', ''),
             'say',   coalesce(e ->> 'say', ''),
             'ask',   coalesce(e ->> 'ask', '')) order by o)
      into v_steps
      from jsonb_array_elements(p_steps) with ordinality as t(e, o);
    if exists (select 1 from jsonb_array_elements(v_steps) e
                where (e ->> 'state') <> '' and ((e ->> 'state') !~ '^v=' or char_length(e ->> 'state') > 32768)) then
      raise exception 'save_view: a step''s map is not a map link' using errcode = '22023';
    end if;
    select e ->> 'state' into v_first
      from jsonb_array_elements(v_steps) with ordinality as t(e, o)
     where (e ->> 'state') <> '' order by o limit 1;
    if v_first is distinct from v_state then
      raise exception 'save_view: the document''s map must be its first step''s map' using errcode = '22023';
    end if;
  end if;

  v_kind := coalesce(p_kind,
                     case when v_steps is not null and jsonb_array_length(v_steps) > 1 then 'tour'
                          when v_state ~ '(^|&)mm=' then 'map'
                          else 'view' end);
  v_md5 := md5(v_state || coalesce(v_steps::text, ''));

  update public.saved_views s
     set name       = v_name,
         note       = coalesce(p_note, s.note),
         collection = coalesce(btrim(p_collection), s.collection),
         kind       = coalesce(p_kind, s.kind)
   where s.user_id = v_uid
     and s.doc_md5 = v_md5
  returning s.id into v_id;

  if v_id is not null then
    created := false;
  else
    select count(*) into v_n from public.saved_views s where s.user_id = v_uid;
    if v_n >= public.saved_views_limit() then
      raise exception 'save_view: this account already holds % maps (the saved_views_limit fence)', v_n
        using errcode = '54000';
    end if;
    -- ⚠ ON CONFLICT: two tabs saving the same document at the same instant are one row, not a unique-violation error.
    insert into public.saved_views as s (user_id, name, note, collection, state, kind, steps)
    values (v_uid, v_name, coalesce(p_note, ''), coalesce(btrim(p_collection), ''), v_state, v_kind, v_steps)
    on conflict (user_id, doc_md5) do update
       set name = excluded.name,
           note = case when p_note is null then s.note else excluded.note end,
           collection = case when p_collection is null then s.collection else excluded.collection end,
           kind = case when p_kind is null then s.kind else excluded.kind end
    returning s.id, (s.xmax = 0) into v_id, created;
  end if;

  view_id    := v_id;
  view_count := (select count(*) from public.saved_views s where s.user_id = v_uid);
  return next;
end;
$$;
comment on function public.save_view(text, text, text, text, text, jsonb) is
  '(map-document-unify) Saves a map document for the signed-in caller (auth.uid(), never an argument): a map (p_steps NULL) or a tour / Atlas answer / reader''s map with its steps [{state,title,say,ask}]. p_state is the first step''s map. One row per document (doc_md5): saving a saved document updates the fields given and returns created = false. Enforces saved_views_limit() and saved_view_steps_limit() (54000). With save_view(text,text,text,text), the only way a row enters public.saved_views.';
revoke execute on function public.save_view(text, text, text, text, text, jsonb) from public, anon;
grant  execute on function public.save_view(text, text, text, text, text, jsonb) to authenticated, service_role;

-- the four-argument door of 20261003211500, unchanged in what it takes and answers: one map, no steps
create or replace function public.save_view(
  p_name       text,
  p_state      text,
  p_note       text default null,
  p_collection text default null
)
returns table (view_id uuid, created boolean, view_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'save_view: sign-in required' using errcode = '42501';
  end if;
  return query select * from public.save_view(p_name, p_state, p_note, p_collection, null::text, null::jsonb);
end;
$$;
comment on function public.save_view(text, text, text, text) is
  '(collection-workspace, map-document-unify) Saves the map (a share-link fragment) for the signed-in caller (auth.uid(), never an argument) — a document of one map: it hands its arguments to save_view(text,text,text,text,text,jsonb) with no kind and no steps. One row per map: saving a saved map updates the fields given and returns created = false. Enforces saved_views_limit() (54000).';
revoke execute on function public.save_view(text, text, text, text) from public, anon;
grant  execute on function public.save_view(text, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE PUBLIC READ — each map now says its kind and carries its steps
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.shared_collection(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sh record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select c.user_id, c.collection, c.title, c.created_at into sh
    from public.collection_shares c where c.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object(
    'ok',           true,
    'format',       'intmap-collection',
    'version',      1,
    'title',        sh.title,
    'collection',   sh.collection,
    'published_at', sh.created_at,
    'places', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'note', s.note, 'collection', s.collection,
                                          'lng', s.lng, 'lat', s.lat, 'zoom', s.zoom) order by s.created_at, s.id)
        from public.saved_places s
       where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)), '[]'::jsonb),
    'views', coalesce((
      select jsonb_agg(jsonb_build_object('name', v.name, 'note', v.note, 'collection', v.collection,
                                          'state', v.state, 'kind', v.kind, 'steps', v.steps) order by v.created_at, v.id)
        from public.saved_views v
       where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)), '[]'::jsonb),
    'updated_at', greatest(
      (select max(s.updated_at) from public.saved_places s where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)),
      (select max(v.updated_at) from public.saved_views  v where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)))
  );
end;
$$;
comment on function public.shared_collection(text) is
  '(collection-workspace, map-document-unify) The public read of a published collection: its title and, as they are now, its places (name, note, collection, position, zoom) and maps (name, note, collection, share-link fragment, kind, and the steps of a tour or Atlas answer). Never an id, an account or an e-mail. {ok:false,error:not_found} for a token that is not published. ANON MAY CALL: a published collection is public by the owner''s explicit act (publish_collection), the 122-bit token is the access control, and the function returns only what the owner filed in that collection.';
revoke execute on function public.shared_collection(text) from public;
grant  execute on function public.shared_collection(text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. COPYING — a copied document keeps its kind and steps; «already held» is the same document
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.copy_shared_collection(p_token text, p_into text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  sh     record;
  v_into text;
  v_np   integer; v_nv integer;
  v_ap   integer; v_av integer;
  v_hp   integer; v_hv integer;
begin
  if v_uid is null then
    raise exception 'copy_shared_collection: sign-in required' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select c.user_id, c.collection, c.title into sh from public.collection_shares c where c.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_into := left(btrim(coalesce(nullif(btrim(coalesce(p_into, '')), ''), sh.title)), 60);

  -- the fences, counted on what would be NEW (a position / a document the reader does not hold yet)
  select count(*) into v_np from public.saved_places s
   where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)
     and not exists (select 1 from public.saved_places m where m.user_id = v_uid and m.lng5 = s.lng5 and m.lat5 = s.lat5);
  select count(*) into v_nv from public.saved_views v
   where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)
     and not exists (select 1 from public.saved_views m where m.user_id = v_uid and m.doc_md5 = v.doc_md5);
  if (select count(*) from public.saved_places m where m.user_id = v_uid) + v_np > public.saved_places_limit() then
    raise exception 'copy_shared_collection: this account would hold more than % places (the saved_places_limit fence)', public.saved_places_limit()
      using errcode = '54000';
  end if;
  if (select count(*) from public.saved_views m where m.user_id = v_uid) + v_nv > public.saved_views_limit() then
    raise exception 'copy_shared_collection: this account would hold more than % maps (the saved_views_limit fence)', public.saved_views_limit()
      using errcode = '54000';
  end if;

  insert into public.saved_places (user_id, name, note, collection, lng, lat, zoom, source)
  select v_uid, s.name, s.note, v_into, s.lng, s.lat, s.zoom, 'shared'
    from public.saved_places s
   where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection)
  on conflict (user_id, lng5, lat5) do nothing;
  get diagnostics v_ap = row_count;

  insert into public.saved_views (user_id, name, note, collection, state, kind, steps)
  select v_uid, v.name, v.note, v_into, v.state, v.kind, v.steps
    from public.saved_views v
   where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection)
  on conflict (user_id, doc_md5) do nothing;
  get diagnostics v_av = row_count;

  select count(*) into v_hp from public.saved_places s where s.user_id = sh.user_id and (sh.collection is null or s.collection = sh.collection);
  select count(*) into v_hv from public.saved_views  v where v.user_id = sh.user_id and (sh.collection is null or v.collection = sh.collection);

  return jsonb_build_object('ok', true, 'collection', v_into,
    'places_added', v_ap, 'places_had', v_hp - v_ap,
    'views_added',  v_av, 'views_had',  v_hv - v_av);
end;
$$;
comment on function public.copy_shared_collection(text, text) is
  '(collection-workspace, map-document-unify) Copies a published collection into the signed-in caller''s own places and maps (tours and Atlas answers with their steps), filed under p_into (default: the collection''s title). What the caller already holds (same position / same document) is left as it is and counted as had — copying twice equals copying once. Enforces saved_places_limit() and saved_views_limit() on what is new (54000).';
revoke execute on function public.copy_shared_collection(text, text) from public, anon;
grant  execute on function public.copy_shared_collection(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. THE SENTENCE IN THE ACCOUNT'S DATA CATALOGUE says what a saved map can now be
-- ─────────────────────────────────────────────────────────────────────────────
update public.account_data_catalog set
  purpose_en = 'The maps you saved (the layers, the date, the base map, the view and the caption, as a share link holds them) — and the tours, your own drawn maps and the Atlas answers you saved as maps, with their steps (each step''s map and its words) — with their name, note and collection, kept so they open on every device you sign in on.',
  purpose_jp = '保存した地図（共有リンクと同じ形で、レイヤー・日付・背景地図・視点・題を持つもの）と、地図として保存したツアー・自分で描いた地図・Atlas の回答（各ステップの地図と文）、およびその名前・メモ・コレクション。ログインしたどの端末でも開けるよう保存します。'
where tbl = 'saved_views';
