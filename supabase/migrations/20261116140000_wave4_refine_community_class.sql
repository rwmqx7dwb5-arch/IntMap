-- ============================================================================
--  wave4-refine — Community maps and class sets, corrected where review found them wrong
-- ----------------------------------------------------------------------------
--  THE FINDINGS (review of 20261116080000_community_maps.sql and 20261116090000_class_quest.sql):
--    · class_set_submit() checked the answers' SHAPE and then stored them AS SENT: a student's client could keep
--      a tapped point to sixteen decimals (a position to the nanometre, where the board promises "about 100 m") or a
--      year as 1945.0, and nothing bounded how large the array's numbers were before they were parsed.
--    · A student's name was unique by lower(name) only: «Ａｉｋｏ» (full-width), «Aiko» with a zero-width space, or a
--      right-to-left override that reverses what the teacher reads, each passed as a NEW student — so a classmate's
--      name could be taken in a form the teacher cannot tell from the real one.
--    · report_community_map() refused the owner's own collection with 22023, the code every other door uses for
--      «that input is not valid», so the page could only say the wrong sentence.
--    · community_maps() paged by OFFSET with a 10,000-row ceiling: every further «Show more» re-read every row before
--      the page, and past the ceiling it silently served the same page again.
--
--  THIS MIGRATION:
--    1. public.display_name(p_name, p_max) — ONE rule for a name a person types to be shown to others: NFKC
--       (full-width and compatibility forms become what they look like), trimmed, and REFUSED (null) when it holds a
--       control character, a bidirectional control, or an invisible format character — or is not 1..p_max characters
--       after normalising. js/quest-class.js NAME_REFUSED is the same set of code points;
--       tests/wave4-refine-community-checks.test.mjs reads both and holds them equal.
--    2. class_set_submit() REPLACED: the name is display_name(p_name, 24) — what is stored IS the normalised name, so
--       the existing unique index (set_id, lower(name)) now decides «the same student» on what the teacher reads; the
--       answers are bounded in size BEFORE they are read, then REBUILT — a point as [round(lng, 3), round(lat, 3)],
--       a year as an integer, a skip as null — and the rebuilt array is what is inserted. Every other answer it gave
--       is unchanged.
--    3. report_community_map() REPLACED: the owner's own collection is refused with its own code, IMOWN.
--    4. community_maps() REPLACED with KEYSET paging: p_offset is gone, p_after is the `next` cursor the previous
--       page returned (the sort key of its last row). Every page is read from the index position where the last one
--       ended, at the same cost however deep.
--
--  THE NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4):
--    · 4096 bytes — the largest p_answers (pg_column_size) class_set_submit reads. ESTIMATE: the largest hand-in
--      js/quest-class.js encodeAnswer can produce is the longer set (SET_LENGTHS 10, js/quest-engine.js) of points at
--      three decimals, «[[-179.999,-89.999],…]» — measured by supabase/tests/47_wave4_refine_test.sql as well under
--      this bound (that test fails if it is not), so a real hand-in is never refused by it. EXPIRES when SET_LENGTHS
--      grows past what the test's largest hand-in fits in. Canon: this function.
--    · 24 — CLASS_NAME_MAX, js/quest-class.js (unchanged; the table's CHECK holds the same number).
--
--  ⚠ NON-DESTRUCTIVE: one new function, three functions replaced. community_maps(text, text, integer, integer,
--    double precision[]) is DROPPED and created again as community_maps(text, text, integer, text,
--    double precision[]) — the only caller is js/community-maps.js, changed in the same commit. No row changes.
--    BLAST RADIUS: the directory, reporting, and a student's hand-in — supabase/tests/38, 39 and 47 hold them.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. A NAME TO BE SHOWN TO OTHERS — one rule
-- ─────────────────────────────────────────────────────────────────────────────
--  The refused code points (each is invisible, or changes how the text around it is DRAWN, so two names that differ
--  only by them look the same, or one is drawn as something it is not):
--    C0 and C1 controls          U+0001–U+001F, U+007F–U+009F
--    soft hyphen                 U+00AD
--    Arabic letter mark          U+061C
--    Mongolian vowel separator   U+180E
--    zero-width and LRM / RLM    U+200B–U+200F
--    bidi embeddings, overrides  U+202A–U+202E
--    word joiner, invisible operators, bidi isolates   U+2060–U+2069
--    zero-width no-break space   U+FEFF
create or replace function public.display_name(p_name text, p_max integer)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v text := btrim(normalize(coalesce(p_name, ''), NFKC));
begin
  if v ~ '[\u0001-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]' then
    return null;
  end if;
  if char_length(v) < 1 or char_length(v) > coalesce(p_max, 0) then
    return null;
  end if;
  return v;
end;
$$;
comment on function public.display_name(text, integer) is
  '(wave4-refine) A name a person typed to be shown to others, as it is kept: NFKC-normalised and trimmed — or NULL when it holds a control character, a bidirectional control or an invisible format character, or is not 1..p_max characters after normalising. The one rule; js/quest-class.js NAME_REFUSED is the same set of code points.';
revoke execute on function public.display_name(text, integer) from public, anon, authenticated;
grant  execute on function public.display_name(text, integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. A STUDENT'S HAND-IN — the name normalised, the answers bounded and rebuilt
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.class_set_submit(p_code text, p_name text, p_answers jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_set   public.class_sets;
  v_name  text := public.display_name(p_name, 24);
  v_n     integer;
  v_el    jsonb;
  v_lng   numeric;
  v_lat   numeric;
  v_yr    numeric;
  v_ok    boolean;
  v_clean jsonb := '[]'::jsonb;
begin
  select * into v_set from public.class_sets s where s.code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not v_set.open then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  -- the answers: bounded in size before anything in them is read (the header says why 4096), then exactly n,
  -- each null or the shape its kind takes
  if p_answers is null or pg_column_size(p_answers) > 4096
     or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> v_set.n then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for v_el in select e from jsonb_array_elements(p_answers) e loop
    if jsonb_typeof(v_el) = 'null' then
      v_clean := v_clean || jsonb_build_array(null::jsonb);
      continue;
    end if;
    if v_set.kind = 'where' then
      if jsonb_typeof(v_el) <> 'array' or jsonb_array_length(v_el) <> 2
         or jsonb_typeof(v_el -> 0) <> 'number' or jsonb_typeof(v_el -> 1) <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'invalid');
      end if;
      v_lng := (v_el ->> 0)::numeric; v_lat := (v_el ->> 1)::numeric;
      if v_lng < -180 or v_lng > 180 or v_lat < -90 or v_lat > 90 then
        return jsonb_build_object('ok', false, 'error', 'invalid');
      end if;
      -- what is kept is what the board promises: three decimals, about 100 m (js/quest-class.js encodeAnswer)
      v_clean := v_clean || jsonb_build_array(jsonb_build_array(round(v_lng, 3), round(v_lat, 3)));
    else
      if jsonb_typeof(v_el) <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'invalid');
      end if;
      v_yr := (v_el #>> '{}')::numeric;
      if v_yr <> trunc(v_yr) or v_yr < -10000 or v_yr > 10000 then
        return jsonb_build_object('ok', false, 'error', 'invalid');
      end if;
      v_clean := v_clean || jsonb_build_array(to_jsonb(v_yr::integer));
    end if;
  end loop;
  select count(*) into v_n from public.class_set_answers a where a.set_id = v_set.id;
  if v_n >= 400 then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  -- the pace: every well-formed try on this set takes a token (a refused name too — that is what stops a name grab)
  select r.allowed into v_ok from public.relay_take('class-answer', v_set.id::text, 45, 45.0 / 600, 1) r;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  begin
    insert into public.class_set_answers (set_id, name, answers) values (v_set.id, v_name, v_clean);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;
  return jsonb_build_object('ok', true, 'answered', v_n + 1);
end;
$$;
comment on function public.class_set_submit(text, text, jsonb) is
  '(wave4-education, wave4-refine) A student hands in a class set: the name they typed (kept as public.display_name(name, 24) — NFKC-normalised and trimmed; a control, bidirectional or invisible format character is invalid_name) and their raw answers (n of them, at most 4096 bytes; a place question [lng, lat], kept to three decimals; a year question an integer year; a skip null) — the answers are rebuilt and the rebuilt array is stored. → {ok:true, answered} or {ok:false, error: not_found | closed | invalid_name | invalid | full | busy | name_taken}. The first hand-in under a name stands (the same name in another width or case is the same name); every well-formed try takes a token from the set''s relay_take bucket ''class-answer'' (45, refilled 45 every 10 minutes) — «busy» when it is empty. ANON MAY CALL: students have no account; the code their teacher handed them is the door, the set must still be open, the row holds only the name and the answers, and only the teacher whose set it is can read it (RLS).';
revoke execute on function public.class_set_submit(text, text, jsonb) from public;
grant  execute on function public.class_set_submit(text, text, jsonb) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. REPORTING — the owner's own collection has its own answer
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.report_community_map(p_token text, p_reason text, p_note text default null)
returns table (created boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  sh    record;
  v_sub uuid;
begin
  if v_uid is null then
    raise exception 'report_community_map: sign-in required' using errcode = '42501';
  end if;
  select c.user_id, c.collection, c.title into sh from public.collection_shares c
   where c.token = p_token and c.listed_at is not null;
  if not found then
    -- only what is in the directory is reported here; a link-only collection is its owner's own distribution
    raise exception 'report_community_map: that collection is not listed in Community maps' using errcode = 'P0002';
  end if;
  if sh.user_id = v_uid then
    -- its own code: «this is yours» is not «that input is not valid» (22023), and the page says which
    raise exception 'report_community_map: this is your own collection' using errcode = 'IMOWN';
  end if;
  insert into public.community_map_subjects as s (owner, collection) values (sh.user_id, sh.collection)
  on conflict on constraint community_map_subjects_one do update set owner = s.owner
  returning s.id into v_sub;
  insert into public.community_map_reports as r (subject_id, user_id, title, reason, note)
  values (v_sub, v_uid, left(sh.title, 120), p_reason, left(coalesce(p_note, ''), 1000))
  on conflict (subject_id, user_id) do update set title = excluded.title, reason = excluded.reason, note = excluded.note, created_at = now(),
     status = case when r.status = 'dismissed' then 'open' else r.status end
  returning (r.xmax = 0) into created;
  return next;
end;
$$;
comment on function public.report_community_map(text, text, text) is
  '(community-maps, wave4-refine) A signed-in reader reports a collection listed in Community maps: a reason (spam | offensive | personal_info | copyright | misleading | other — the CHECK refuses others, 23514) and a note. The report is on the collection (community_map_subjects), not its share row, so unpublishing does not remove it. One report per collection and account; reporting again updates it (created = false) and reopens a dismissed one. Not one''s own (its own code, IMOWN); only listed collections (P0002). The only way a row enters public.community_map_reports or public.community_map_subjects.';
revoke execute on function public.report_community_map(text, text, text) from public, anon;
grant  execute on function public.report_community_map(text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE DIRECTORY, A PAGE AT A TIME — by keyset
-- ─────────────────────────────────────────────────────────────────────────────
--  THE CURSOR is `v1|<sort>|<reused>|<time in microseconds since the epoch>|<id>` — the sort key of the last row on
--  the page, in the order's own columns (new: listed_at, id · reused: reused_count, listed_at, id · updated:
--  content_updated_at, id; every order ends in id, so it is total and no row is on two pages or none). The time is
--  an integer of microseconds (at most 16 digits — past the year 2200) so it reads back exactly. A cursor that is not one, or was made for another order, is
--  {ok:false, error:'invalid_cursor'} — never quietly the first page.
drop function if exists public.community_maps(text, text, integer, integer, double precision[]);

create or replace function public.community_maps(
  p_query  text    default null,
  p_sort   text    default 'new',
  p_limit  integer default 24,
  p_after  text    default null,
  p_bbox   double precision[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q    text := nullif(btrim(coalesce(p_query, '')), '');
  v_pat  text;
  v_sort text := case when p_sort in ('new', 'reused', 'updated') then p_sort else 'new' end;
  v_lim  integer := least(50, greatest(1, coalesce(p_limit, 24)));
  v_box  double precision[] := case when p_bbox is not null and array_length(p_bbox, 1) = 4 then p_bbox else null end;
  v_ids  uuid[];
  v_cur  text[];
  v_r    integer;
  v_t    timestamptz;
  v_id   uuid;
  v_last record;
  v_next text;
begin
  if v_q is not null then
    -- the reader's words are matched as words: %, _ and \ are escaped, not wildcards
    v_pat := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  if nullif(p_after, '') is not null then
    v_cur := string_to_array(p_after, '|');
    if array_length(v_cur, 1) <> 5 or v_cur[1] <> 'v1' or v_cur[2] <> v_sort
       or v_cur[3] !~ '^[0-9]{1,9}$' or v_cur[4] !~ '^-?[0-9]{1,16}$'
       or v_cur[5] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_cursor');
    end if;
    v_r  := v_cur[3]::integer;
    -- an integer count of microseconds times one microsecond: exact (it is below 2^53, the largest whole number a float8 holds)
    v_t  := 'epoch'::timestamptz + v_cur[4]::bigint * interval '1 microsecond';
    v_id := v_cur[5]::uuid;
  end if;

  -- ONE PAGE PLUS ONE ROW, in an indexed order, from where the last page ended: the scan stops when the page is
  -- full. One branch per order, each ORDER BY exactly its index, each «after» exactly that order.
  if v_sort = 'reused' then
    select array_agg(x.id order by x.ord) into v_ids from (
      select c.id, row_number() over () as ord from (
        select c.id from public.collection_shares c
         cross join lateral public.community_map_contents(c.user_id, c.collection) b
         where c.listed_at is not null and not public.community_map_held(c.user_id, c.collection)
           and (v_id is null or c.reused_count < v_r
                or (c.reused_count = v_r and (c.listed_at < v_t or (c.listed_at = v_t and c.id > v_id))))
           and (v_pat is null or c.title ilike v_pat or c.summary ilike v_pat or c.author_name ilike v_pat)
           and b.n_places + b.n_maps > 0
           and public.community_map_in_box(b.n_places, b.w, b.s, b.e, b.n, b.cam_lng, b.cam_lat, v_box)
         order by c.reused_count desc, c.listed_at desc, c.id
         limit v_lim + 1) c) x;
  elsif v_sort = 'updated' then
    select array_agg(x.id order by x.ord) into v_ids from (
      select c.id, row_number() over () as ord from (
        select c.id from public.collection_shares c
         cross join lateral public.community_map_contents(c.user_id, c.collection) b
         where c.listed_at is not null and not public.community_map_held(c.user_id, c.collection)
           and (v_id is null or c.content_updated_at < v_t or (c.content_updated_at = v_t and c.id > v_id))
           and (v_pat is null or c.title ilike v_pat or c.summary ilike v_pat or c.author_name ilike v_pat)
           and b.n_places + b.n_maps > 0
           and public.community_map_in_box(b.n_places, b.w, b.s, b.e, b.n, b.cam_lng, b.cam_lat, v_box)
         order by c.content_updated_at desc, c.id
         limit v_lim + 1) c) x;
  else
    select array_agg(x.id order by x.ord) into v_ids from (
      select c.id, row_number() over () as ord from (
        select c.id from public.collection_shares c
         cross join lateral public.community_map_contents(c.user_id, c.collection) b
         where c.listed_at is not null and not public.community_map_held(c.user_id, c.collection)
           and (v_id is null or c.listed_at < v_t or (c.listed_at = v_t and c.id > v_id))
           and (v_pat is null or c.title ilike v_pat or c.summary ilike v_pat or c.author_name ilike v_pat)
           and b.n_places + b.n_maps > 0
           and public.community_map_in_box(b.n_places, b.w, b.s, b.e, b.n, b.cam_lng, b.cam_lat, v_box)
         order by c.listed_at desc, c.id
         limit v_lim + 1) c) x;
  end if;

  -- the next page starts after the last row of this one — in this order's own key
  if coalesce(array_length(v_ids, 1), 0) > v_lim then
    select c.reused_count, c.listed_at, c.content_updated_at into v_last from public.collection_shares c where c.id = v_ids[v_lim];
    v_next := 'v1|' || v_sort || '|' || (case when v_sort = 'reused' then v_last.reused_count else 0 end)::text || '|'
      || ((extract(epoch from (case when v_sort = 'updated' then v_last.content_updated_at else v_last.listed_at end)) * 1000000)::bigint)::text
      || '|' || v_ids[v_lim]::text;
  end if;

  return jsonb_build_object('ok', true, 'format', 'intmap-community-maps', 'version', 3,
    'sort', v_sort, 'limit', v_lim,
    'has_more', v_next is not null, 'next', v_next,
    -- the page's cards, shaped only for the rows on the page
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'token', c.token, 'title', c.title, 'summary', c.summary, 'author', c.author_name,
               'listed_at', c.listed_at, 'updated_at', b.changed,
               'places', b.n_places, 'maps', b.n_maps, 'tours', b.n_tours,
               'lng', case when b.n_places > 0 then (b.w + b.e) / 2 else b.cam_lng end,
               'lat', case when b.n_places > 0 then (b.s + b.n) / 2 else b.cam_lat end,
               'bbox', case when b.n_places > 0 then jsonb_build_array(b.w, b.s, b.e, b.n) else null end,
               'reused', c.reused_count, 'derived', public.community_map_derived(c.id),
               'based_on', public.community_map_origin(c.derived_from))
             order by p.ord)
        from unnest(v_ids[1:v_lim]) with ordinality p(id, ord)
        join public.collection_shares c on c.id = p.id
        cross join lateral public.community_map_contents(c.user_id, c.collection) b), '[]'::jsonb));
end;
$$;
comment on function public.community_maps(text, text, integer, text, double precision[]) is
  '(community-maps, wave4-refine) The directory, a page at a time: the collections their owners listed in Community maps and no administrator holds — title, summary, the author name the owner typed for the listing, counts of places / maps / tours, a centre and box on the globe, how many OTHER accounts kept a copy (reused), how many listed collections were built on it (derived), and the listed collection it was built on (based_on — only while that one is listed and not held). Matched by words (p_query, as words), sorted new | reused | updated (each an index), optionally only those touching p_bbox [west, south, east, north]; at most 50 a page. KEYSET PAGING: has_more and `next`, the cursor of the page''s last row; p_after = that cursor reads the page after it, at the same cost however deep ({ok:false,error:invalid_cursor} for a cursor that is not one or was made for another order). No total (the read stops at the page). Never an account or an e-mail; the token is the link the owner published; the cursor carries only the order''s own key (a count, a time, and the share row''s random id, which names no account and opens nothing). ANON MAY CALL: it returns only what owners explicitly listed for everyone to find, and counts that name no person.';
revoke execute on function public.community_maps(text, text, integer, text, double precision[]) from public;
grant  execute on function public.community_maps(text, text, integer, text, double precision[]) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
