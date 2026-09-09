-- ============================================================================
--  R566 — WHO Disease Outbreak News の「症例数・死亡数」だけを置く表
-- ----------------------------------------------------------------------------
--  WHO の OData は病原体・国・発生日・公表日を**構造化した項目**として持っており、それらは
--  scripts/build-who-don.mjs が data/who-don.json.gz に焼く（DB は 1 行も要らない）。
--  **持っていない唯一の項目が症例数と死亡数**で、`Overview` の英語の散文の中にしかない
--  （2026-09-09 実測: `Summary` は 82% が空・`Overview` は 100% 存在・平均 2,817 字）。
--
--  ⚠⚠⚠ **その数を正規表現で拾ってはならない。** 同じ段落に「26 provinces」「54 to 60 health
--    zones」「104 contacts」「1314 patients have recovered」が同じ形の整数として並んでいる。
--    どれが累計症例数かは**判断**であり、判断は判断できるものに訊く
--    （.agents/rules/no-ad-hoc-hardcoding.md §2）。⇒ supabase/functions/who-don が AI に訊き、
--    supabase/functions/_shared/who-don-extract.js が**根拠の無い答えを拒む**。
--    この表はその「拒まれなかった答え」だけを置く。
--
--  ⚠⚠ **「分からない」と「0 件」は別の事実である**（#R543）。だから cases / deaths は
--    **null 可**で、既定値を持たない:
--      · 行が無い          … まだ読んでいない
--      · 行があり cases=null … 読んだが WHO が累計を書いていない（あるいは答えが検証を通らなかった）
--      · 行があり cases=0    … WHO が 0 と書いた
--    3 つを取り違えると、誰も測っていない棒がグラフに立つ。
--
--  ⚠ 既存の表は 1 行も触らない。破壊的な操作は無い。
-- ============================================================================

create table if not exists public.who_don_extracts (
  -- WHO の DON slug。data/who-don.json.gz の `u` と同じ鍵で、`DonId` ではない
  -- （1996 年の項目は DonId が空で、実際にページを返すのは UrlName のほう）。
  url_name          text primary key,
  don_id            text,
  -- ⚠ null 可。既定値を書かないのが仕様である（上の注記）。
  cases             bigint,
  deaths            bigint,
  as_of             date,
  scope             text,
  confidence        real,
  model             text,
  provider          text,
  -- 抽出の規約（プロンプトと検証）が変わったら上げる。古い規約で入った行を後から見分けられる。
  algorithm_version int  not null default 1,
  -- ⚠ 抽出に**実際に使った散文**のハッシュ。WHO が報告を書き直したときだけ再抽出し、
  --   書き直していないものに二度払わない。読めなかった文書もこの鍵で記録されるので、
  --   同じ文書に対する無限の再試行が起きない。
  source_hash       text not null,
  attempts          int  not null default 1,
  extracted_at      timestamptz not null default now()
);

-- ⚠ 制約は「両方あるときだけ」効く。死者数だけが書かれている報告は実在するので、
--   それを拒むと WHO が述べた事実を捨てることになる。
--   （null との比較は null を返し、check 制約は null を通す。それがここで欲しい挙動。）
do $$
begin
  alter table public.who_don_extracts
    add constraint who_don_extracts_cases_nonneg_chk check (cases  is null or cases  >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.who_don_extracts
    add constraint who_don_extracts_deaths_nonneg_chk check (deaths is null or deaths >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.who_don_extracts
    add constraint who_don_extracts_deaths_le_cases_chk
    check (cases is null or deaths is null or deaths <= cases);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.who_don_extracts
    add constraint who_don_extracts_scope_chk
    check (scope is null or scope in ('country', 'global', 'multi'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.who_don_extracts
    add constraint who_don_extracts_confidence_chk
    check (confidence is null or (confidence >= 0 and confidence <= 1));
exception when duplicate_object then null;
end $$;

-- 「最近何を抽出したか」を運用が引く索引（監視と、費用の内訳の確認）。
create index if not exists who_don_extracts_extracted_at_idx
  on public.who_don_extracts (extracted_at desc);

comment on table public.who_don_extracts is
  'WHO Disease Outbreak News の散文から抽出した累計症例数・死亡数。WHO が構造化して持たない唯一の項目で、他の 5 項目は data/who-don.json.gz にある。#R566';
comment on column public.who_don_extracts.url_name is
  'WHO の DON slug（UrlName）。data/who-don.json.gz の events[].u と同じ鍵。#R566';
comment on column public.who_don_extracts.cases is
  '報告が述べる累計症例数。⚠ null は「WHO が累計を書いていない / 検証を通る答えが得られなかった」であって 0 件ではない。#R566';
comment on column public.who_don_extracts.deaths is
  '報告が述べる累計死亡数。⚠ null は 0 ではない（cases と同じ）。#R566';
comment on column public.who_don_extracts.as_of is
  'その累計が「いつ時点」であるかとして報告自身が述べている日付。公表日で代用しない。#R566';
comment on column public.who_don_extracts.scope is
  'その数が覆う範囲: country / multi / global。判別できなければ null。#R566';
comment on column public.who_don_extracts.confidence is
  'モデル自身が申告した 0..1 の確度。⚠ 正しさの証明ではなく、低い値の行を後から選り分けるための計器。#R566';
comment on column public.who_don_extracts.source_hash is
  '抽出に使った散文（切り詰めた後の、実際にモデルへ送った文字列）の SHA-256。これが変わったときだけ再抽出する。#R566';
comment on column public.who_don_extracts.attempts is
  'この DON に対して抽出を試みた回数。source_hash が同じ限り再試行しないので、増えるのは WHO が報告を書き直したときだけ。#R566';

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS — 読むのは誰でも、書くのは service_role だけ
-- ----------------------------------------------------------------------------
--  この表は WHO の公開報告からの抽出であって利用者のデータではないので、地図と同じく
--  未ログインの読者にも読めなければならない（ログインを要求すれば公開レイヤーが壊れる）。
--  書き込みは who-don Edge Function の service_role だけ。anon / authenticated には
--  insert / update / delete の権限を一切与えない。
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.who_don_extracts enable row level security;

drop policy if exists who_don_extracts_select_all on public.who_don_extracts;
create policy who_don_extracts_select_all on public.who_don_extracts
  for select to anon, authenticated using (true);

revoke all on public.who_don_extracts from anon, authenticated;
grant select on public.who_don_extracts to anon, authenticated;
grant select, insert, update, delete on public.who_don_extracts to service_role;
