-- ============================================================================
--  pgTAP · 48 — 20261117150000_saved_news_event_snapshot.sql
--
--  WHAT THIS PROVES:
--    · saved_news_events has a jsonb `snapshot` column (what the reader saw when they starred the event);
--    · the column is bounded — an object only, at most 32 KiB — so it cannot become an article store;
--    · the account data page (account_data_catalog) says the row now holds that copy.
--  The client that writes it (js/news-events.js) is checked in Node by tests/news-quality-checks.test.mjs.
-- ============================================================================
begin;
select no_plan();

select has_column('public', 'saved_news_events', 'snapshot', 'saved_news_events.snapshot exists');
select col_type_is('public', 'saved_news_events', 'snapshot', 'jsonb', 'snapshot is jsonb');
select col_is_null('public', 'saved_news_events', 'snapshot', 'snapshot is optional (older stars have none)');

select ok(
  exists (select 1 from pg_constraint
          where conrelid = 'public.saved_news_events'::regclass
            and conname = 'saved_news_events_snapshot_shape'),
  'the snapshot has a shape constraint');

select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.saved_news_events'::regclass and conname = 'saved_news_events_snapshot_shape')
    ~ '32768',
  'the shape constraint bounds the size at 32 KiB');

select ok(
  (select purpose_en from public.account_data_catalog where tbl = 'saved_news_events') ~ 'copy of what the event showed',
  'the data page says what the row keeps (en)');
select ok(
  (select purpose_jp from public.account_data_catalog where tbl = 'saved_news_events') ~ '写し',
  'the data page says what the row keeps (jp)');

select * from finish();
rollback;
