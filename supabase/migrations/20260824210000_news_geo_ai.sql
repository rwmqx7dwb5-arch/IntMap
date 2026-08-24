-- ============================================================================
--  R404 — ニュースの地点解析に AI を戻す（AI が第一手段・決定論エンジンがフォールバック）
-- ----------------------------------------------------------------------------
--  #R29 が「AI 第一手段・辞書フォールバック」を作り、#R40 が**読み出し**を止めた。
--  2026-08-24 に測ると、止まっていたのは読み出しだけではなかった:
--    · `current_news` 1,548 行のうち `analyzed_by='ai'` は **0 件**
--      （原因は `AI_MODEL` の 403。#R351 が特定済み。`refresh-news` には
--        `ai-proxy` が持つ 403 リトライが無く、例外は握り潰されていた）
--    · そして UI が実際に読む経路は `news_events`（`news-ingest`）であり、
--      そちらは**一度も AI を呼んでいなかった**
--  ⇒ 生きている経路のほうに AI を戻す。この migration はそのための列と索引、
--     そして `news-ingest-tick` の cron に `locate` 段を足すところまで。
--
--  ⚠⚠⚠ **何が決めたかを、決めたものが書く。** #R394 の実測:
--    `news_event_articles.assigned_by='embedding'` が 23 本書かれていたのに、
--    埋め込みを持つ記事は 0 行だった——無条件に書いていたからである。
--    ここでは 2 つを**別の列**に分ける:
--      · `subject_located_by` … いま入っている座標を**誰が置いたか**
--      · `subject_ai_at`      … AI が**この記事を見た時刻**（見ただけで場所が
--                                無いと判断した記事も、二度と送らないために要る）
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. news_articles — 地点の出どころ
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.news_articles
  add column if not exists subject_located_by text not null default 'none',
  add column if not exists subject_locator    text,
  add column if not exists subject_ai_at      timestamptz;

do $$
begin
  alter table public.news_articles
    add constraint news_articles_subject_located_by_chk
    check (subject_located_by in ('ai', 'dict', 'none'));
exception
  when duplicate_object then null;
end $$;

comment on column public.news_articles.subject_located_by is
  'いま入っている subject_lng/lat を置いたもの: ai（AI 地点解析）/ dict（決定論エンジン IntMapNewsGeo）/ none（置けなかった）。#R404';
comment on column public.news_articles.subject_locator is
  'AI が答えたときの provider:model。どのモデルの答えかを後から数えられるようにする。#R404';
comment on column public.news_articles.subject_ai_at is
  'AI がこの記事を最後に見た時刻。null＝まだ見ていない。⚠ AI が「場所の無い記事」と判断して省いた場合もここは埋まる（同じ記事に何度も払わないため）。#R404';

-- 既存行の出どころを、実際にそうであるとおりに埋める。
-- ⚠ 既定の 'none' のままの行だけを触る（冪等）。この時点で AI は 1 行も置いていない。
update public.news_articles
   set subject_located_by = 'dict'
 where subject_located_by = 'none'
   and subject_lng is not null
   and subject_lat is not null;

-- `locate` 段が毎 run 引く「まだ AI が見ていない記事」の索引。
create index if not exists news_articles_locate_todo_idx
  on public.news_articles (published_at desc)
  where status = 'active' and subject_ai_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. news_ingest_runs — 段の計測（「0 件」の理由が残らない計器を作らない・#R334）
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.news_ingest_runs
  add column if not exists located_ai         integer not null default 0,
  add column if not exists located_considered integer not null default 0;

comment on column public.news_ingest_runs.located_ai is
  'この run で AI が座標を置いた記事の本数。⚠ 「AI に送った本数」ではない（送って省かれたぶんは notes.locate_omitted）。#R404';
comment on column public.news_ingest_runs.located_considered is
  'この run で AI に送る候補として選んだ記事の本数（上限 LOCATE_CAP）。#R404';
comment on column public.news_ingest_runs.llm_tokens_in is
  'この run の LLM 入力トークン合計（翻訳＋地点解析）。段ごとの内訳は notes。#R404';
comment on column public.news_ingest_runs.llm_tokens_out is
  'この run の LLM 出力トークン合計（翻訳＋地点解析）。段ごとの内訳は notes。#R404';
comment on column public.news_ingest_runs.estimated_cost_usd is
  'この run の推定費用合計（翻訳＋地点解析）。⚠ 推定であって請求ではない。#R404';

-- ─────────────────────────────────────────────────────────────────────────────
--  3. cron — `news-ingest-tick` の段に `locate` を足す
-- ----------------------------------------------------------------------------
--  ⚠⚠ **このリポジトリは public である。cron の command には秘密が入っている**
--     （`x-news-ingest-secret` の値）。だからここでは command を**書き直さず**、
--     すでに入っている文字列の中の段の一覧だけを置換する。秘密は読み出しも
--     書き出しもされない。
--  ⚠ pg_cron が無い環境（ローカルの `supabase db reset` / CI）では何もしない。
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  j       record;
  newcmd  text;
  touched integer := 0;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the news-ingest-tick stage update';
    return;
  end if;

  for j in select jobid, command from cron.job where jobname = 'news-ingest-tick' loop
    newcmd := replace(
      j.command,
      '"stages":["fetch","assign","link","prune"]',
      '"stages":["fetch","locate","assign","link","prune"]'
    );
    if newcmd <> j.command then
      perform cron.alter_job(j.jobid, command := newcmd);
      touched := touched + 1;
    end if;
  end loop;

  if touched = 0 then
    raise notice 'news-ingest-tick: no stage list matched (already updated, or the job is spelled differently) — check cron.job by hand';
  else
    raise notice 'news-ingest-tick: locate stage added to % job(s)', touched;
  end if;
end $$;
