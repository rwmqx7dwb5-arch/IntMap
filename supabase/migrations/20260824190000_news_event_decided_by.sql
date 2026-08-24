-- ═══════════════════════════════════════════════════════════════════════════════
--  News Events — 機械が「何で決めたか」を、実際に決めたもので記録する
--  docs/NEWS-EVENTS.md §4 / §5.5
-- -----------------------------------------------------------------------------
--  ⚠⚠⚠ **実測 (2026-08-24・本番): 埋め込みを持つ記事は 0 行。それなのに
--    `news_event_articles.assigned_by = 'embedding'` の辺が 23 本あった。**
--
--    出どころは `news_event_merge_into`（#R386 が入れた `link` 段の機構）の 1 行:
--
--        assigned_by = case when v_actor is not null then 'human' else 'embedding' end
--
--    機械が merge したら無条件に 'embedding' と書いていた。ところが `link` 段の候補は
--    **語の共有**（`eventPairCandidates`）からも出る——というより、この鍵では埋め込みが
--    使えないので**語からしか出ていない**（`text-embedding-3-small` は 403
--    `model_not_found`）。⇒ 23 本すべてが、走っていない機構の名前を名乗っていた。
--
--    #R334 がこの列に 'deterministic' / 'embedding' / 'llm' / 'human' の 4 値を置いたのは
--    **後から「どの段が何件を運んだか」を数えられるようにする**ためである。走っていない
--    機構の名前が入っていると、その列は情報を持たないどころか**嘘を持つ**。
--
--  ⇒ ① 何で決めたかを**引数で渡させる**（既定は 'deterministic'）。呼び出し側が
--       知っているのだから、関数が推測してはならない。
--    ② **証明できる嘘だけを直す**——`assigned_by='embedding'` かつ記事が埋め込みを
--       持たない辺を 'deterministic' へ。
--
--  ⚠ ②は「機械の判定を書き換える」ように見えるが、そうではない。**判定そのもの
--    （どの記事がどの Event に属するか）は 1 行も変えていない。** 直すのは「何が決めたか」
--    の名札で、しかも **その機構の入力が存在しないことがデータから証明できる場合だけ**
--    である。名札を正しくしないと、`docs/NEWS-EVENTS.md` §13 の「どの段が何件を運んだか」
--    が測れない。
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
--  1. 何で決めたかを引数で受け取る
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.news_event_merge_into(
  p_source     bigint,
  p_target     bigint,
  p_actor      uuid,
  p_note       text default null,
  p_decided_by text default 'deterministic'
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
  v_by    text;
  v_id    bigint;
begin
  if p_source = p_target then raise exception 'cannot merge an event into itself'; end if;

  -- ⚠ 呼び出し側が嘘をつけないように、値そのものも確かめる。列の CHECK と同じ集合。
  if p_decided_by is null or p_decided_by not in ('deterministic','embedding','llm') then
    raise exception 'p_decided_by must be deterministic | embedding | llm, got %', p_decided_by;
  end if;
  v_by := case when v_actor is not null then 'human' else p_decided_by end;

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

  -- ⚠ **消したあとに**数える。undo が戻すのは「実際に動いた記事」だけである。
  select coalesce(array_agg(l.article_id), '{}')
    into v_moved
    from public.news_event_articles l
   where l.event_id = p_source
     and l.relation in ('same_event','update');

  update public.news_event_articles
     set event_id        = p_target,
         manual_override = (v_actor is not null),
         assigned_by     = v_by
   where event_id = p_source
     and relation in ('same_event','update');

  update public.news_events
     set merged_into = p_target, status = 'merged',
         reviewed_at = case when v_actor is not null then now() else reviewed_at end,
         reviewed_by = coalesce(v_actor, reviewed_by),
         updated_at  = now()
   where id = p_source;

  with rechained as (
    update public.news_events set merged_into = p_target, updated_at = now()
     where merged_into = p_source and id <> p_target
     returning id
  )
  select coalesce(array_agg(id), '{}') into v_chain from rechained;

  -- ⚠ `manual_lock` を立てるのは人が merge したときだけ（機械が立てると自分で自分を凍らせる）。
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
          jsonb_build_object('source_status', 'merged', 'source_merged_into', p_target,
                             'decided_by', v_by), p_note)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.news_event_merge_into(bigint, bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.news_event_merge_into(bigint, bigint, uuid, text, text) to service_role;

-- ⚠ 4 引数の古い形は落とす。残すと、**新しい既定を知らない呼び出し側が古いほうに解決して
--   しまう**（PostgreSQL は引数の数で選ぶ）——直したはずの経路が黙って残る形である。
drop function if exists public.news_event_merge_into(bigint, bigint, uuid, text);

-- 人が呼ぶ口は 'human' になるので `p_decided_by` を渡す必要が無い（既定のままで良い）。
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
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin) then
    raise exception 'not authorised';
  end if;
  return public.news_event_merge_into(p_source, p_target, auth.uid(), p_note);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. 証明できる嘘だけを直す
-- ----------------------------------------------------------------------------
--  ⚠ **判定は 1 行も変えない。** どの記事がどの Event に属するかはそのままで、
--    「何が決めたか」の名札だけを直す。しかも **`embedding` を名乗っているのに
--    その記事が埋め込みを 1 つも持たない**——入力が存在しないことがデータから
--    証明できる辺だけを対象にする。埋め込みが本当に在る辺には触れない。
update public.news_event_articles l
   set assigned_by = 'deterministic'
  from public.news_articles a
 where a.id = l.article_id
   and l.assigned_by = 'embedding'
   and a.embedding is null;

comment on function public.news_event_merge_into(bigint, bigint, uuid, text, text) is
  'Event を 1 つにまとめる機構。人が呼ぶ口は news_event_merge。p_actor が null なら機械で、そのとき assigned_by は p_decided_by が言うとおりになる（走っていない機構の名前を書かない）。';

-- ─────────────────────────────────────────────────────────────────────────────
--  3. すでに表に入ってしまった索引ページを、記事の一覧から外す
-- ----------------------------------------------------------------------------
--  ⚠⚠⚠ **#R351 の「記事ではないもの」の門は 3 本の綴りしか見ていなかった。** 実測
--    (2026-08-24・本番 active 1,377 本): 通信社の**索引ページが 43 本**混ざっていた
--    ——Reuters の «(IBX.N) | Stock Price & Latest News» が 33 本、AP の
--    «Weather, Hurricanes and Storms | Latest News & Updates» のような話題ページが 10 本。
--    8 つの Event を汚しており、#1221 は 3 本とも NBA の索引ページだった。
--    そして NPR の «Up First» 型（«<出来事A>. And, <出来事B>») が 1 本、イラン制裁の塊に。
--  ⇒ 取り込みの門は `_shared/news-ingest.js` で直した（実測で The Guardian の署名記事
--    «… | Dave Schilling» 4 本は落ちない）。ここは**すでに入っている行**の始末である。
--
--  ⚠ **消さない。** `status='removed'` は #R334 がこの列に置いた既存の状態で、RLS の
--    select も `assign` 段も active しか見ない。上流が何を配信したかの記録は残る。
--  ⚠ 判定はコードと**同じ 2 つの綴り**である。ここで別の規則を書くと、次に片方だけ
--    直った日に静かにずれる。
update public.news_articles
   set status = 'removed'
 where status = 'active'
   and (title ~* '\|[^|]*\y(latest|breaking|stock price|scores|stats|live updates)\y'
     or title ~ '\.\s+And,\s');

--  外した記事が居た Event を数え直す（件数と独立媒体数は active な記事だけを数える）。
do $$
declare r record;
begin
  for r in
    select distinct l.event_id
      from public.news_event_articles l
      join public.news_articles a on a.id = l.article_id
     where a.status = 'removed'
       and l.relation in ('same_event','update')
  loop
    perform public.news_event_recount(r.event_id);
  end loop;
end $$;

--  ⚠ **記事が 1 本も残らなかった Event は、もう出来事ではない。** 代表見出しが索引ページの
--    ままの空の Event を一覧に出さない。⚠ 消さずに `archived` にする——merge の行き先や
--    ★保存の参照が古い ID から辿れる必要がある（docs/NEWS-EVENTS.md §8）。
update public.news_events e
   set status = 'archived', updated_at = now()
 where e.status = 'active'
   and e.merged_into is null
   and e.article_count = 0;
