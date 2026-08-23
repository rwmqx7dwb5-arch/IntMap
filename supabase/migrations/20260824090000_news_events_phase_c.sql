-- ═══════════════════════════════════════════════════════════════════════════════
--  News Events — Phase C: embedding の ANN index・運用者の修正経路・監査証跡
--  docs/NEWS-EVENTS.md §5.2 / §11 / §12
-- -----------------------------------------------------------------------------
--  #R334 が表を敷き、#R351 が本番でパイプラインを回した。この migration が足すのは
--  Phase C の 2 つ:
--
--    ① **embedding の第 2 段**（§5.2）。決定論のトークン一致は「Walmart 決算」と
--       「Walmart が Apple Pay 対応」を分けられるが、**言い換えを拾えない**。
--       #R351 の実測では、カナダ・米国の関税が 1 日で 5 つの Event に分かれた
--       （交渉決裂 / 50% 発動 / dollar-for-dollar / 報復開始 / 経済への影響）。
--
--    ② **運用者の Merge / Split / Reassign**（§11）。#R334 と #R351 は
--       「使う相手が無いうちに書き込み privilege を配ると、誰も試していない権限が
--       本番に居座る」を理由に、書き込みを service_role だけに絞ってきた。
--       ⇒ **UI と同じ変更で**足す、と書いてあるとおりにここで足す。
--
--  ⚠ **ANN index はデータが入ってから作る**（#R334 が空の表に張らなかった理由）。
--    2026-08-24 の実測: `news_articles` は active 1,154 行・`news_events` 892 行。
--    ivfflat ではなく **hnsw** を使う——ivfflat の list 数は行数から決めるもので、
--    1,154 行では list=1（＝全走査）にしかならず、行が増えると張り直しが要る。
--    hnsw はデータ量に対して単調で、張り直しの運用を最初から作らずに済む。
--
--  ⚠⚠⚠ **`public.is_admin()` を呼ばない。** リポジトリの baseline はその名前の
--    **引数なし**の関数を宣言しているが、**本番に在るのは `public.is_admin(uid uuid)`
--    だけである**（2026-08-24 実測。baseline は本番より後に書かれた再構成で、
--    `docs/MIGRATIONS.md` が言うとおり本番には記録されていない）。#R334 の migration が
--    本番に通ったのは、`news_cluster_decisions_admin` / `news_ingest_runs_admin` の
--    どちらも `is_admin` を呼ばずに述語をインラインで書いていたからである。
--    ⇒ ここも同じ形にする。**どちらの形の本番でも同じ意味になる**述語だけを使う。
--    ⚠ ここで引数なしの版を「足して直す」ことはしない——共有の security primitive を
--      この作業のついでに増やす変更であり、範囲外である（`CLAUDE.md` §3.2）。
--
--  ⚠ **merge / split を「表を直接 UPDATE する」形で運用者に渡さない。** 1 回の操作が
--    `news_event_articles` の付け替え・`merged_into` の設定・件数の再計算・監査の
--    書き出しの 4 つに分かれるので、途中で失敗すると **どの表も嘘をつく**。
--    ⇒ SECURITY DEFINER の関数 1 本にして、権限は「admin であること」だけで見る。
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
--  1. ANN index — 言い換えを拾う第 2 段のための索引
-- ─────────────────────────────────────────────────────────────────────────────
--  ⚠ 距離演算子は **cosine**（`vector_cosine_ops`）。`text-embedding-3-small` は
--    正規化済みなので内積でも順序は同じだが、閾値を「類似度 0..1」で語れるほうが
--    運用者にも評価スクリプトにも読める。
create index if not exists idx_news_articles_embedding
  on public.news_articles using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ─────────────────────────────────────────────────────────────────────────────
--  2. 候補生成の第 2 段 — 「この記事に意味が近く、すでに Event に属している記事」
-- ----------------------------------------------------------------------------
--  ⚠ **これは候補を出すだけで、統合を決めない。** 決めるのは `news-cluster.js` の
--    `pairVerdict` で、地理と時間の門はそのまま通す。#R76 が 43 件の塊を作ったのは
--    「近い」を緩めたからであって、候補が多かったからではない。
--
--  1 回の往復で新着ぶんをまとめて返す（新着 1 本ごとに RPC を撃つと、定常状態の
--  4 本はともかく、冷えた起動の 780 本で 780 往復になる）。
--
--  ⚠⚠⚠ **Event 単位に畳んで返してはならない。** 最初はそう書いた——Event ごとに
--    「最も近いメンバー」1 本だけを返す形である。それだと `assignArticle` の
--    **推移の検算が構造的に満たせなくなる**: 新着が載れる条件は「メンバーの
--    `transitivity`（34%）以上と一致すること」なので、10 人の Event に対して
--    類似度を持つメンバーが 1 人しかいなければ share は必ず 1/10 = 10% で、
--    embedding が正しく言い換えを見つけたときほど落ちる。
--    ⇒ **近傍そのものを返す。** どの Event に属するかは呼び出し側が畳む。
create or replace function public.news_embedding_candidates(
  p_article_ids bigint[],
  p_k           integer default 32,
  p_min_sim     real    default 0.70
)
returns table (article_id bigint, neighbour_id bigint, event_id bigint, similarity real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with src as (
    select a.id, a.embedding
      from public.news_articles a
     where a.id = any(p_article_ids)
       and a.embedding is not null
  )
  select s.id                                      as article_id,
         n.id                                      as neighbour_id,
         l.event_id                                as event_id,
         (1 - (n.embedding <=> s.embedding))::real as similarity
    from src s
    join lateral (
      select a2.id, a2.embedding
        from public.news_articles a2
       where a2.embedding is not null
         and a2.status = 'active'
         and a2.id <> s.id
       order by a2.embedding <=> s.embedding
       limit greatest(p_k, 8)
    ) n on true
    join public.news_event_articles l
      on l.article_id = n.id
     and l.relation in ('same_event','update')
   where (1 - (n.embedding <=> s.embedding)) >= p_min_sim
   order by s.id, similarity desc
$$;

revoke all on function public.news_embedding_candidates(bigint[], integer, real) from public, anon, authenticated;
grant execute on function public.news_embedding_candidates(bigint[], integer, real) to service_role;

comment on function public.news_embedding_candidates(bigint[], integer, real) is
  'Phase C 第2段の候補生成。意味が近く、すでに Event に属している記事の近傍を返す。統合の判定はしない（docs/NEWS-EVENTS.md §5.2）。';

-- ─────────────────────────────────────────────────────────────────────────────
--  2a. embedding の書き戻し
-- ----------------------------------------------------------------------------
--  ⚠ 1 行ずつ UPDATE すると 1 回の run で数百往復になる。PostgREST の upsert は
--    「insert できる行」を要求するので、**既存行の 3 列だけを更新する**この形にする。
--  ⚠ 渡すのは `[{id, e:'[0.1,...]', m:'model', v:1}]`。`e` は pgvector のテキスト表現で、
--    型変換に失敗した行はその場で例外になる——**壊れたベクトルを黙って入れない。**
create or replace function public.news_articles_set_embeddings(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_n integer;
begin
  with x as (select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) as e)
  update public.news_articles a
     set embedding         = (x.e ->> 'e')::extensions.vector,
         embedding_model   = x.e ->> 'm',
         embedding_version = coalesce((x.e ->> 'v')::smallint, 1)
    from x
   where a.id = (x.e ->> 'id')::bigint;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.news_articles_set_embeddings(jsonb) from public, anon, authenticated;
grant execute on function public.news_articles_set_embeddings(jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  2b. すでに分かれてしまった Event どうしの候補
-- ----------------------------------------------------------------------------
--  ⚠⚠⚠ **新着に候補を足すだけでは、すでに分かれた塊は永久に分かれたままである。**
--    #R351 の recall の代表例——カナダ・米国の関税が 1 日で 5 つの Event に分かれた
--    （交渉決裂 / 50% 発動 / dollar-for-dollar / 報復開始 / 経済への影響）——は
--    **どれも既存の Event** なので、`assign` の候補生成をいくら賢くしても届かない。
--    ⇒ Event 対を候補として出す口を別に持つ。**判定はやはりここではしない**
--      （`link` 段が `pairVerdict` を塊どうしに当てる。docs/NEWS-EVENTS.md §5.3）。
create or replace function public.news_event_link_candidates(
  p_k       integer default 8,
  p_min_sim real    default 0.80,
  p_limit   integer default 400
)
returns table (event_a bigint, event_b bigint, similarity real, article_a bigint, article_b bigint)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with mem as (
    select l.event_id, a.id, a.embedding
      from public.news_event_articles l
      join public.news_articles a on a.id = l.article_id
      join public.news_events e   on e.id = l.event_id
     where l.relation in ('same_event','update')
       and a.status = 'active'
       and a.embedding is not null
       and e.status = 'active'
       and e.merged_into is null
       -- ⚠ 運用者が確定させた Event を機械が動かさない（#R351 の manual_lock と同じ扱い）。
       and not e.manual_lock
  ),
  nn as (
    select m.event_id                                as ea,
           n.event_id                                as eb,
           (1 - (n.embedding <=> m.embedding))::real as sim,
           m.id                                      as aa,
           n.id                                      as ab
      from mem m
      join lateral (
        select m2.event_id, m2.id, m2.embedding
          from mem m2
         where m2.event_id <> m.event_id
         order by m2.embedding <=> m.embedding
         limit greatest(p_k, 4)
      ) n on true
     where (1 - (n.embedding <=> m.embedding)) >= p_min_sim
  ),
  pairs as (
    -- 向きを固定して同じ対を 1 行にする（A→B と B→A は同じ候補である）。
    select least(ea, eb) as event_a, greatest(ea, eb) as event_b,
           sim, aa, ab,
           row_number() over (partition by least(ea, eb), greatest(ea, eb) order by sim desc) as rn
      from nn
  )
  select event_a, event_b, sim as similarity, aa as article_a, ab as article_b
    from pairs
   where rn = 1
   order by sim desc
   limit greatest(p_limit, 1)
$$;

revoke all on function public.news_event_link_candidates(integer, real, integer) from public, anon, authenticated;
grant execute on function public.news_event_link_candidates(integer, real, integer) to service_role;

comment on function public.news_event_link_candidates(integer, real, integer) is
  'Phase C: 意味が近いのに別々になっている Event 対を候補として返す。統合の判定はしない（docs/NEWS-EVENTS.md §5.3）。';

-- ─────────────────────────────────────────────────────────────────────────────
--  3. 監査証跡 — 運用者が何をしたか、そして元に戻せるか
-- ----------------------------------------------------------------------------
--  ⚠ `news_cluster_decisions` は**機械**が何を根拠に決めたかで、後から書き換えて
--    よい記録ではない（#R334）。この表は**人**が何をしたかで、別のものである。
--  ⚠ `before` は「元に戻すのに要るもの」だけを持つ。表全体の写しを取ると、
--    undo が「あのときの世界」を復元してしまい、その後の取り込みを巻き戻す。
create table if not exists public.news_event_admin_actions (
  id            bigint      generated by default as identity primary key,
  action        text        not null
                  check (action in ('merge','split','reassign','update_meta','undo')),
  actor         uuid,
  event_id      bigint,
  target_id     bigint,
  article_ids   bigint[]    not null default '{}',
  before        jsonb       not null default '{}'::jsonb,
  after         jsonb       not null default '{}'::jsonb,
  note          text,
  reverted_at   timestamptz,
  reverted_by   uuid,
  created_at    timestamptz not null default now()
);

-- ⚠ `actor` / `reverted_by` に auth.users への FK を張らない。#R334 の
--   `news_events.reviewed_by` と同じ理由——`public.delete_account_data()` は
--   auth.users への単一列 FK を「行の所有者」として発見して**その行を削除する**ので、
--   運用者がアカウントを消したときに監査証跡まで消える。監査は所有ではない。

create index if not exists idx_news_event_admin_actions_at
  on public.news_event_admin_actions (created_at desc);
create index if not exists idx_news_event_admin_actions_event
  on public.news_event_admin_actions (event_id);

alter table public.news_event_admin_actions enable row level security;

drop policy if exists news_event_admin_actions_admin on public.news_event_admin_actions;
create policy news_event_admin_actions_admin on public.news_event_admin_actions
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

grant select on public.news_event_admin_actions to authenticated;
grant select, insert, update, delete on public.news_event_admin_actions to service_role;
grant usage, select on sequence public.news_event_admin_actions_id_seq to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. 件数の再計算 — 「何本の記事が」「いくつの独立媒体が」
-- ----------------------------------------------------------------------------
--  ⚠ 独立媒体は **`source_family` 単位**で数える（docs/NEWS-EVENTS.md §3）。
--    Sinclair 3 局・Hearst 4 局が同一タイトルを配信していた実測がある——
--    媒体名で数えると 1 つの出来事が「7 媒体が報じた」に化ける。
create or replace function public.news_event_recount(p_event bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_articles int;
  v_families int;
  v_first    timestamptz;
  v_last     timestamptz;
begin
  select count(*),
         count(distinct coalesce(s.source_family, a.source_id)),
         min(a.published_at),
         max(a.published_at)
    into v_articles, v_families, v_first, v_last
    from public.news_event_articles l
    join public.news_articles a on a.id = l.article_id
    left join public.news_sources s on s.id = a.source_id
   where l.event_id = p_event
     and l.relation in ('same_event','update')
     and a.status = 'active';

  update public.news_events e
     set article_count            = coalesce(v_articles, 0),
         independent_source_count = coalesce(v_families, 0),
         first_published_at       = coalesce(v_first, e.first_published_at),
         last_article_at          = coalesce(v_last, e.last_article_at),
         updated_at               = now()
   where e.id = p_event;
end;
$$;

revoke all on function public.news_event_recount(bigint) from public, anon, authenticated;
grant execute on function public.news_event_recount(bigint) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. Merge — 2 つの Event を 1 つにする
-- ----------------------------------------------------------------------------
--  ⚠ **統合された側の行を消さない。** `merged_into` を立てて `status='merged'` に
--    するだけにする。保存済みの ★・共有 URL・Atlas の参照・ブラウザの履歴が
--    古い ID から辿れる必要がある（docs/NEWS-EVENTS.md §4）。
--  ⚠ 統合先が自分自身・すでに merged・存在しない、のいずれでも失敗させる。
--    「静かに何もしない」は運用者にとって「効いた」と区別がつかない。
--  ⚠ 機械（`link` 段）も同じ操作をする。**2 本の実装を持たない**——中身はここ 1 本で、
--    人が呼ぶ `news_event_merge` は「admin であること」を確かめてからこれを呼ぶ。
--    `p_actor` が null の行が機械の操作である（`news_event_admin_actions.actor`）。
create or replace function public.news_event_merge_into(
  p_source bigint,
  p_target bigint,
  p_actor  uuid,
  p_note   text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := p_actor;
  v_moved bigint[];
  v_chain bigint[];
  v_src   public.news_events%rowtype;
  v_tgt   public.news_events%rowtype;
  v_id    bigint;
begin
  if p_source = p_target then raise exception 'cannot merge an event into itself'; end if;

  select * into v_src from public.news_events where id = p_source for update;
  if not found then raise exception 'source event % not found', p_source; end if;
  select * into v_tgt from public.news_events where id = p_target for update;
  if not found then raise exception 'target event % not found', p_target; end if;
  if v_tgt.merged_into is not null then raise exception 'target event % is itself merged into %', p_target, v_tgt.merged_into; end if;

  -- 移す前に、行き先に同じ記事がいれば元の行を落とす（1 記事 1 primary の部分 unique）。
  delete from public.news_event_articles d
   where d.event_id = p_source
     and d.relation in ('same_event','update')
     and exists (select 1 from public.news_event_articles t
                  where t.event_id = p_target and t.article_id = d.article_id
                    and t.relation in ('same_event','update'));

  -- ⚠ **消したあとに**数える。undo が戻すのは「実際に動いた記事」だけで、
  --   もともと行き先に居た記事まで source へ引き剥がしてはならない。
  select coalesce(array_agg(l.article_id), '{}')
    into v_moved
    from public.news_event_articles l
   where l.event_id = p_source
     and l.relation in ('same_event','update');

  update public.news_event_articles
     set event_id        = p_target,
         manual_override = (v_actor is not null),
         assigned_by     = case when v_actor is not null then 'human' else 'embedding' end
   where event_id = p_source
     and relation in ('same_event','update');

  update public.news_events
     set merged_into = p_target, status = 'merged',
         reviewed_at = case when v_actor is not null then now() else reviewed_at end,
         reviewed_by = coalesce(v_actor, reviewed_by),
         updated_at  = now()
   where id = p_source;

  -- 統合された側を指していた古い merge も行き先へ付け替える（連鎖を 1 段に保つ）。
  -- ⚠ **どれを付け替えたかを控える。** 控えないと undo は「行き先を指している全部」を
  --   source へ戻すことになり、この操作より前から行き先に merge されていたものまで巻き込む。
  with rechained as (
    update public.news_events set merged_into = p_target, updated_at = now()
     where merged_into = p_source and id <> p_target
     returning id
  )
  select coalesce(array_agg(id), '{}') into v_chain from rechained;

  -- ⚠ **`manual_lock` を立てるのは人が merge したときだけ。** 機械（`link` 段）が
  --   立てると、その Event は以後どの取り込みでも代表・分類・地点を更新できなくなる
  --   ——自分で自分を凍らせるパイプラインになる。
  update public.news_events
     set manual_lock = manual_lock or (v_actor is not null),
         reviewed_at = case when v_actor is not null then now() else reviewed_at end,
         reviewed_by = coalesce(v_actor, reviewed_by),
         materially_updated_at = now(), updated_at = now()
   where id = p_target;

  perform public.news_event_recount(p_target);

  insert into public.news_event_admin_actions (action, actor, event_id, target_id, article_ids, before, after, note)
  values ('merge', v_actor, p_source, p_target, v_moved,
          jsonb_build_object('source_status', v_src.status, 'source_merged_into', v_src.merged_into,
                             'target_manual_lock', v_tgt.manual_lock,
                             'rechained', to_jsonb(v_chain)),
          jsonb_build_object('source_status', 'merged', 'source_merged_into', p_target), p_note)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.news_event_merge_into(bigint, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.news_event_merge_into(bigint, bigint, uuid, text) to service_role;

--  人が呼ぶ口。門は「admin であること」だけで、機構は上と同じ 1 本。
create or replace function public.news_event_merge(
  p_source bigint,
  p_target bigint,
  p_note   text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin) then raise exception 'not authorised'; end if;
  return public.news_event_merge_into(p_source, p_target, auth.uid(), p_note);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. Split / Reassign — 記事を別の Event へ移す
-- ----------------------------------------------------------------------------
--  Split は「行き先が新しい Event」の Reassign である。同じ本体を共有し、
--  行き先を作るかどうかだけが違う——2 本の実装を持たない。
create or replace function public.news_event_reassign(
  p_article_ids bigint[],
  p_target      bigint,          -- null なら新しい Event を作る（＝ split）
  p_note        text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_before jsonb;
  v_target bigint := p_target;
  v_seed   public.news_articles%rowtype;
  v_srcs   bigint[];
  v_e      bigint;
  v_id     bigint;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin) then raise exception 'not authorised'; end if;
  if p_article_ids is null or array_length(p_article_ids, 1) is null then
    raise exception 'no articles given';
  end if;

  -- 元の所属を先に記録する（undo が要るのはこれだけ）。
  select coalesce(jsonb_agg(jsonb_build_object('article_id', l.article_id, 'event_id', l.event_id)), '[]'::jsonb),
         coalesce(array_agg(distinct l.event_id), '{}')
    into v_before, v_srcs
    from public.news_event_articles l
   where l.article_id = any(p_article_ids)
     and l.relation in ('same_event','update');

  if v_target is null then
    select * into v_seed from public.news_articles where id = p_article_ids[1];
    if not found then raise exception 'article % not found', p_article_ids[1]; end if;
    -- ⚠ `public_id` は共有 URL と Atlas の参照が生き残る外向きの ID なので、
    --   **URL に出して安全な字**しか使わない（base64 の `/` と `+` は使わない）。
    --   Edge Function の makePublicId() と同じ「'e' ＋ 不透明な英数字」の形。
    insert into public.news_events (
      public_id, representative_title, representative_article_id,
      primary_category,
      rep_lng, rep_lat, rep_place_name_en,
      first_published_at, last_article_at, materially_updated_at,
      manual_lock, reviewed_at, reviewed_by
    ) values (
      'e' || replace(gen_random_uuid()::text, '-', ''),
      v_seed.title, v_seed.id,
      -- 種の記事のフィードが持っていた分類を引き継ぐ。⚠ 引き継がないと split で
      -- 生まれた Event は既定の 'world' になり、`manual_lock` のせいで
      -- `news-ingest` も直せない——運用者が分けた瞬間に分類が失われる。
      -- ⚠ `provider_category` は `news_source_feeds.category` から来るので今は同じ 8 値だが、
      --   `news_articles` 側に CHECK は無い。集合で確かめてから使う——ここで
      --   CHECK 違反を出すと、運用者の split そのものが失敗する。
      case when v_seed.provider_category in ('world','politics','business','technology',
                                             'science_health','climate_weather','disasters','society')
           then v_seed.provider_category else 'world' end,
      v_seed.subject_lng, v_seed.subject_lat, v_seed.subject_name_en,
      v_seed.published_at, v_seed.published_at, now(),
      true, now(), v_actor
    ) returning id into v_target;
  else
    perform 1 from public.news_events where id = v_target and merged_into is null;
    if not found then raise exception 'target event % not found (or merged)', v_target; end if;
  end if;

  delete from public.news_event_articles
   where article_id = any(p_article_ids)
     and relation in ('same_event','update');

  insert into public.news_event_articles (event_id, article_id, relation, assigned_by, manual_override, decision_reason)
  select v_target, a.id, 'same_event', 'human', true, coalesce(p_note, 'operator reassign')
    from public.news_articles a
   where a.id = any(p_article_ids);

  update public.news_events
     set manual_lock = true, reviewed_at = now(), reviewed_by = v_actor,
         materially_updated_at = now(), updated_at = now()
   where id = v_target;

  perform public.news_event_recount(v_target);
  foreach v_e in array coalesce(v_srcs, '{}') loop
    if v_e is not null and v_e <> v_target then perform public.news_event_recount(v_e); end if;
  end loop;

  insert into public.news_event_admin_actions (action, actor, event_id, target_id, article_ids, before, after, note)
  values (case when p_target is null then 'split' else 'reassign' end,
          v_actor, coalesce(v_srcs[1], v_target), v_target, p_article_ids,
          jsonb_build_object('links', v_before),
          jsonb_build_object('event_id', v_target), p_note)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  7. 代表・分類・地点の上書き
-- ----------------------------------------------------------------------------
--  ⚠ 上書きは **override フラグを立てる**ことで効く。`news-ingest` は
--    `manual_lock` / `category_override` / `location_override` をすでに尊重して
--    いる（#R351）——ここで値だけ書いて旗を立てないと、次の run が黙って戻す。
--  ⚠ null は「変えない」であって「消す」ではない。運用者が地点を**外したい**ときは
--    p_clear_location を立てる（null を渡すのと区別できないと、地点を消す手段が無い）。
create or replace function public.news_event_update_meta(
  p_event          bigint,
  p_title          text    default null,
  p_category       text    default null,
  p_lng            double precision default null,
  p_lat            double precision default null,
  p_place          text    default null,
  p_clear_location boolean default false,
  p_lock           boolean default null,
  p_note           text    default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old   public.news_events%rowtype;
  v_id    bigint;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin) then raise exception 'not authorised'; end if;
  select * into v_old from public.news_events where id = p_event for update;
  if not found then raise exception 'event % not found', p_event; end if;

  update public.news_events e
     set representative_title = coalesce(nullif(btrim(p_title), ''), e.representative_title),
         primary_category     = coalesce(p_category, e.primary_category),
         category_override    = e.category_override or (p_category is not null),
         rep_lng              = case when p_clear_location then null else coalesce(p_lng, e.rep_lng) end,
         rep_lat              = case when p_clear_location then null else coalesce(p_lat, e.rep_lat) end,
         rep_place_name_en    = case when p_clear_location then null else coalesce(nullif(btrim(p_place), ''), e.rep_place_name_en) end,
         location_override    = e.location_override or p_clear_location or (p_lng is not null and p_lat is not null),
         manual_lock          = coalesce(p_lock, e.manual_lock),
         reviewed_at          = now(),
         reviewed_by          = v_actor,
         updated_at           = now()
   where e.id = p_event;

  insert into public.news_event_admin_actions (action, actor, event_id, target_id, before, after, note)
  values ('update_meta', v_actor, p_event, p_event,
          jsonb_build_object('representative_title', v_old.representative_title,
                             'primary_category', v_old.primary_category,
                             'category_override', v_old.category_override,
                             'rep_lng', v_old.rep_lng, 'rep_lat', v_old.rep_lat,
                             'rep_place_name_en', v_old.rep_place_name_en,
                             'location_override', v_old.location_override,
                             'manual_lock', v_old.manual_lock),
          jsonb_build_object('representative_title', coalesce(nullif(btrim(p_title), ''), v_old.representative_title),
                             'primary_category', coalesce(p_category, v_old.primary_category)),
          p_note)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  8. Undo — 直前の操作を元に戻す
-- ----------------------------------------------------------------------------
--  ⚠ 戻すのは **その操作が変えたものだけ**。表全体の写しを復元すると、その後の
--    取り込みで増えた記事まで巻き戻る。
--  ⚠ すでに戻した操作をもう一度戻さない（`reverted_at` を見る）。
create or replace function public.news_event_undo(p_action bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_a     public.news_event_admin_actions%rowtype;
  v_link  jsonb;
  v_touch bigint[];
  v_e     bigint;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin) then raise exception 'not authorised'; end if;
  select * into v_a from public.news_event_admin_actions where id = p_action for update;
  if not found then raise exception 'action % not found', p_action; end if;
  if v_a.reverted_at is not null then raise exception 'action % was already reverted', p_action; end if;
  if v_a.action = 'undo' then raise exception 'an undo cannot itself be undone'; end if;

  if v_a.action = 'merge' then
    update public.news_event_articles
       set event_id = v_a.event_id
     where article_id = any(v_a.article_ids)
       and event_id = v_a.target_id
       and relation in ('same_event','update');
    update public.news_events
       set merged_into = (v_a.before ->> 'source_merged_into')::bigint,
           status      = coalesce(v_a.before ->> 'source_status', 'active'),
           updated_at  = now()
     where id = v_a.event_id;
    -- ⚠ 付け替えたと**控えたもの**だけを戻す（この操作より前から行き先を指していた
    --   merge は、この undo とは関係が無い）。
    update public.news_events set merged_into = v_a.event_id, updated_at = now()
     where id = any(coalesce(array(select jsonb_array_elements_text(v_a.before -> 'rechained')::bigint), '{}'));
    perform public.news_event_recount(v_a.event_id);
    perform public.news_event_recount(v_a.target_id);

  elsif v_a.action in ('split','reassign') then
    delete from public.news_event_articles
     where article_id = any(v_a.article_ids)
       and relation in ('same_event','update');
    v_touch := array[v_a.target_id];
    for v_link in select * from jsonb_array_elements(coalesce(v_a.before -> 'links', '[]'::jsonb)) loop
      insert into public.news_event_articles (event_id, article_id, relation, assigned_by, manual_override, decision_reason)
      values ((v_link ->> 'event_id')::bigint, (v_link ->> 'article_id')::bigint, 'same_event', 'human', true, 'undo')
      on conflict do nothing;
      v_touch := v_touch || (v_link ->> 'event_id')::bigint;
    end loop;
    foreach v_e in array v_touch loop
      if v_e is not null then perform public.news_event_recount(v_e); end if;
    end loop;

  elsif v_a.action = 'update_meta' then
    update public.news_events
       set representative_title = coalesce(v_a.before ->> 'representative_title', representative_title),
           primary_category     = coalesce(v_a.before ->> 'primary_category', primary_category),
           category_override    = coalesce((v_a.before ->> 'category_override')::boolean, category_override),
           rep_lng              = (v_a.before ->> 'rep_lng')::double precision,
           rep_lat              = (v_a.before ->> 'rep_lat')::double precision,
           rep_place_name_en    = v_a.before ->> 'rep_place_name_en',
           location_override    = coalesce((v_a.before ->> 'location_override')::boolean, location_override),
           manual_lock          = coalesce((v_a.before ->> 'manual_lock')::boolean, manual_lock),
           updated_at           = now()
     where id = v_a.event_id;
  end if;

  update public.news_event_admin_actions
     set reverted_at = now(), reverted_by = v_actor
   where id = p_action;

  insert into public.news_event_admin_actions (action, actor, event_id, target_id, article_ids, before, note)
  values ('undo', v_actor, v_a.event_id, v_a.target_id, v_a.article_ids,
          jsonb_build_object('reverted_action', p_action, 'reverted_kind', v_a.action), 'undo of #' || p_action);
  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  9. 実行権限 — 運用者だけ
-- ----------------------------------------------------------------------------
--  ⚠ 関数の中で `public.is_admin()` を必ず見ている。SECURITY DEFINER は RLS を
--    迂回するので、grant だけを門にしてはならない（grant は「呼べる」であって
--    「やってよい」ではない）。
revoke all on function public.news_event_merge(bigint, bigint, text)        from public, anon;
revoke all on function public.news_event_reassign(bigint[], bigint, text)   from public, anon;
revoke all on function public.news_event_update_meta(bigint, text, text, double precision, double precision, text, boolean, boolean, text) from public, anon;
revoke all on function public.news_event_undo(bigint)                       from public, anon;

grant execute on function public.news_event_merge(bigint, bigint, text)      to authenticated, service_role;
grant execute on function public.news_event_reassign(bigint[], bigint, text) to authenticated, service_role;
grant execute on function public.news_event_update_meta(bigint, text, text, double precision, double precision, text, boolean, boolean, text) to authenticated, service_role;
grant execute on function public.news_event_undo(bigint)                     to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  10. 判定の監査を運用者が読めるようにする（読みだけ）
-- ----------------------------------------------------------------------------
--  ⚠ `news_articles` と `news_cluster_decisions` は **admin にも書かせない**
--    （docs/NEWS-EVENTS.md §4）。上流が何と言ったかと、機械が何を根拠に判定したかは、
--    後から書き換えてよい種類の記録ではない。運用者が直すのは「どの記事がどの Event に
--    属するか」であって、記事そのものではない。⇒ 上の関数はどちらの表も UPDATE しない。
comment on table public.news_event_admin_actions is
  '運用者の Merge / Split / Reassign / 上書きの監査証跡と undo の材料（docs/NEWS-EVENTS.md §11）。';
