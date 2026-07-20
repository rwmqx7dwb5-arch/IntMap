-- ============================================================================
--  IntMap — SEED (LOCAL / CI ONLY).  100% SYNTHETIC data.
-- ----------------------------------------------------------------------------
--  Loaded automatically by `supabase db reset`. It exists so the RLS/pgTAP tests
--  have deterministic subjects (user A, user B, an admin) and representative rows
--  in every table. It is NEVER run against production.
--
--  PRIVACY: no real email address, no real auth UUID, no production data. All
--  emails use the reserved `.test` TLD; all UUIDs are obvious placeholders. Do not
--  paste real values here — static-checks.mjs scans this file for secrets/PII.
-- ============================================================================

-- ── Fixed synthetic identities (referenced by the tests) ─────────────────────
--   User A : 11111111-1111-1111-1111-111111111111  (a@intmap.test)
--   User B : 22222222-2222-2222-2222-222222222222  (b@intmap.test)
--   Admin  : 33333333-3333-3333-3333-333333333333  (admin@intmap.test)

-- 1) Auth users. Inserting here fires the on_auth_user_created trigger, which
--    creates the matching public.profiles rows (mirrors real signup).
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'a@intmap.test', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Test User A"}',
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'b@intmap.test', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Test User B"}',
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'admin@intmap.test', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Test Admin"}',
   '', '', '', '')
on conflict (id) do nothing;

-- 2) Profiles — the trigger created bare rows; enrich them + flag the admin.
update public.profiles set display_name = 'Test User A', bio = 'Synthetic user A.', is_pro = false, plan = 'free'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Test User B', bio = 'Synthetic user B.'
  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'Test Admin', is_admin = true, plan = 'unlimited'
  where id = '33333333-3333-3333-3333-333333333333';

-- 3) user_prefs — A has synced settings.
insert into public.user_prefs (user_id, data) values
  ('11111111-1111-1111-1111-111111111111', '{"settings":{"theme":"dark"},"tempUnit":"C"}'::jsonb)
on conflict (user_id) do nothing;

-- 4) favorites — A and B each saved an article (used by cross-user isolation tests).
insert into public.favorites (user_id, article_link, article_title) values
  ('11111111-1111-1111-1111-111111111111', 'https://example.test/article-a', 'Synthetic article A'),
  ('22222222-2222-2222-2222-222222222222', 'https://example.test/article-b', 'Synthetic article B')
on conflict (user_id, article_link) do nothing;

-- 5) ai_usage — A has consumed 5 uses today, B has consumed 2 (isolation + RPC tests).
insert into public.ai_usage (user_id, usage_date, count) values
  ('11111111-1111-1111-1111-111111111111', current_date, 5),
  ('22222222-2222-2222-2222-222222222222', current_date, 2)
on conflict (user_id, usage_date) do nothing;

-- 6) community — A posts, B posts, B comments on A's post, B upvotes A's post.
insert into public.community_posts (id, user_id, author_name, title, body, lat, lng, category) values
  (1, '11111111-1111-1111-1111-111111111111', 'Test User A', 'Post by A', 'Body A', 35.68, 139.69, 'general'),
  (2, '22222222-2222-2222-2222-222222222222', 'Test User B', 'Post by B', 'Body B', 48.85, 2.35, 'general')
on conflict (id) do nothing;

insert into public.community_comments (id, post_id, user_id, author_name, body) values
  (1, 1, '22222222-2222-2222-2222-222222222222', 'Test User B', 'Comment by B on A''s post')
on conflict (id) do nothing;

-- Inserting explicit identity ids above does NOT advance the sequence, so a later
-- auto-insert would reuse id=1 and hit a unique violation. Advance the sequences.
select setval(pg_get_serial_sequence('public.community_posts','id'),    (select coalesce(max(id),1) from public.community_posts));
select setval(pg_get_serial_sequence('public.community_comments','id'), (select coalesce(max(id),1) from public.community_comments));

insert into public.community_votes (post_id, user_id) values
  (1, '22222222-2222-2222-2222-222222222222')
on conflict (post_id, user_id) do nothing;

insert into public.community_comment_votes (comment_id, user_id) values
  (1, '11111111-1111-1111-1111-111111111111')
on conflict (comment_id, user_id) do nothing;

-- B reports A's post (admin-read only).
insert into public.community_reports (post_id, user_id) values
  (1, '22222222-2222-2222-2222-222222222222')
on conflict (post_id, user_id) do nothing;

-- 7) Admin-read PII tables — synthetic feedback / bug report / donation.
insert into public.feedback (user_id, email, rating, comment, lang, page) values
  ('11111111-1111-1111-1111-111111111111', 'a@intmap.test', 5, '[General] Synthetic feedback', 'en', '/'),
  (null, 'anon@intmap.test', 3, '[Bug] Synthetic anon feedback', 'en', '/');
insert into public.bug_reports (user_id, email, category, description, diagnostics, lang, page) values
  ('22222222-2222-2222-2222-222222222222', 'b@intmap.test', 'map', 'Synthetic bug report',
   '{"build":"test","errors":[]}'::jsonb, 'en', '/');
insert into public.donations (user_id, email, locale, source, status) values
  ('11111111-1111-1111-1111-111111111111', 'a@intmap.test', 'en', 'support_button', 'initiated');

-- 8) Public reference data — a couple of gazetteer pins, a card, some news.
insert into public.geo_pins (type, terms, name_en, name_jp, lng, lat, sort_order) values
  ('city', array['Tokyo','東京'], 'Tokyo', '東京', 139.69, 35.68, 1),
  ('city', array['Paris'],       'Paris', 'パリ', 2.35, 48.85, 2)
on conflict do nothing;

insert into public.dashboard_cards (slug, cat, type, lng, lat, title_en, title_jp, body_en, body_jp, sort_order) values
  ('seed-tokyo', 'geo', 'geo', 139.69, 35.68, 'Tokyo', '東京', 'Synthetic card.', '合成カード。', 1)
on conflict do nothing;

insert into public.current_news
  (lang, topic, title, publisher, link, pub_date, subject_lng, subject_lat, subject_name_en, subject_name_jp, mapped, analyzed_by)
values
  ('en', 'world', 'Synthetic headline EN', 'Test Wire', 'https://example.test/news-en-1', now(), 139.69, 35.68, 'Tokyo', '東京', true, 'dict'),
  ('jp', 'world', '合成見出し JP',        'Test Wire', 'https://example.test/news-jp-1', now(), 2.35, 48.85, 'Paris', 'パリ', true, 'dict')
on conflict (lang, link) do nothing;

-- 9) AREA MONITORS (#R141) — A owns a monitor with a run + evidence + report; B owns
--    one monitor. Used by the cross-user isolation tests (04_monitors_test.sql) to
--    prove A cannot read/forge B's monitor, run, evidence or report and vice versa.
insert into public.area_monitors
  (id, user_id, name, geometry, geometry_kind, center_lng, center_lat, radius_km, bbox, area_label, sources, next_run_at)
values
  ('10000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111',
   'Tokyo watch (A)', '{"type":"Polygon","coordinates":[[[139,35],[140,35],[140,36],[139,36],[139,35]]]}'::jsonb,
   'circle', 139.69, 35.68, 60, '[139,35,140,36]'::jsonb, '60 km around Tokyo', array['news'], now() + interval '1 hour'),
  ('20000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222',
   'Paris watch (B)', '{"type":"Polygon","coordinates":[[[2,48],[3,48],[3,49],[2,49],[2,48]]]}'::jsonb,
   'circle', 2.35, 48.85, 60, '[2,48,3,49]'::jsonb, '60 km around Paris', array['news'], now() + interval '1 hour')
on conflict (id) do nothing;

insert into public.monitor_runs
  (id, monitor_id, user_id, started_at, finished_at, status, trigger, sources_attempted, sources_ok,
   snapshot, diff, change_score, report_generated, ai_used, evidence_count)
values
  ('10000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1',
   '11111111-1111-1111-1111-111111111111', now(), now(), 'success', 'initial',
   array['news'], array['news'], '{"news":{"count":2}}'::jsonb, '{"news":{"new":2}}'::jsonb, 0.5, true, true, 2)
on conflict (id) do nothing;

insert into public.monitor_evidence
  (run_id, monitor_id, user_id, ev_key, source_type, source_name, source_url, title, observed_at, lng, lat, payload, dedup_key, change_kind)
values
  ('10000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1',
   '11111111-1111-1111-1111-111111111111', 'ev_1', 'news', 'Test Wire', 'https://example.test/news-en-1',
   'Synthetic headline EN', now(), 139.69, 35.68, '{"topic":"world"}'::jsonb, 'news:example.test/news-en-1', 'new'),
  ('10000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1',
   '11111111-1111-1111-1111-111111111111', 'ev_2', 'news', 'Test Wire', 'https://example.test/news-en-2',
   'Second synthetic headline', now(), 139.70, 35.69, '{"topic":"world"}'::jsonb, 'news:example.test/news-en-2', 'new')
on conflict (run_id, ev_key) do nothing;

insert into public.monitor_reports
  (id, monitor_id, run_id, user_id, severity, headline, summary, changes, unchanged, data_gaps, limitations, metrics)
values
  ('10000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'medium',
   'Two new reports around Tokyo', 'Two new articles were detected in the monitored area.',
   '[{"claim":"Two new reports were detected.","evidence_ids":["ev_1","ev_2"]}]'::jsonb,
   '["No second independent cluster confirmed."]'::jsonb, '[]'::jsonb,
   '["Locations reflect the reported subject of each article."]'::jsonb,
   '{"articles":{"prev":0,"cur":2,"delta":2}}'::jsonb)
on conflict (id) do nothing;

-- Link the monitor's denormalized latest-report pointers (as the runner would).
update public.area_monitors
   set last_report_id = '10000000-0000-0000-0000-0000000000a3', last_status = 'success',
       last_change_severity = 'medium', last_run_at = now(), run_count = 1
 where id = '10000000-0000-0000-0000-0000000000a1';
update public.monitor_runs
   set report_id = '10000000-0000-0000-0000-0000000000a3'
 where id = '10000000-0000-0000-0000-0000000000a2';
