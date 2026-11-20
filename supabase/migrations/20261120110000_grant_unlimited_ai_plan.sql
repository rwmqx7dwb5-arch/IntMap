-- ============================================================================
--  AI の日次利用上限の撤廃 — 運営者本人のアカウントを plan = 'unlimited' にする（データ移行・1 回限り）
-- ----------------------------------------------------------------------------
--  日次の上限は profiles.plan で決まる（_shared/plans.js・_shared/ai-ledger.js accountFor）。
--  'unlimited' は aiTurnsPerDay 1,000,000 で、ai-proxy は消費を数えない。
--
--  ⚠ このリポジトリは public。メールアドレスをここへ書かない（ask.ts の開発者上書きの注記と同じ理由）。
--    アカウントは auth.users.email の小文字の SHA-256 で照合する。
--  ⚠ 該当アカウントがまだ無い（その綴りでログインされていない）ときは 0 行更新で終わり、
--    NOTICE を出す。migration を失敗させて本番配備全体を止めることはしない。
--  ⚠ profiles の特権列ガード（tg_profiles_guard_privcols）は JWT の無い DB セッションを信頼するので、
--    migration からの更新は通る。冪等（既に unlimited なら何も変わらない）。
-- ============================================================================
do $$
declare
  v_rows integer;
begin
  update public.profiles p
     set plan = 'unlimited'
    from auth.users u
   where u.id = p.id
     and encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') = '3820fb8c9f07afbea30e6387494afae1490b371645ad18cec41b4002ad9ffdaa'
     and p.plan is distinct from 'unlimited';
  get diagnostics v_rows = row_count;
  raise notice 'grant_unlimited_ai_plan: % profile(s) set to unlimited', v_rows;
end
$$;
