# Database (Supabase)

IntMap's data lives in a single Supabase Postgres project (`public` schema). This is the
map of what's there, why, and how it's protected. The authoritative definition is the
version-controlled migration in [`supabase/migrations/`](../supabase/migrations); this page
is the human explanation.

> **Reconstruction note.** The project had no migrations — the schema lived only in the
> live database. The baseline migration was rebuilt from the application + Edge Function
> code. To confirm it matches production and bring prod under migration control, run the
> read-only reconcile in [`MIGRATIONS.md`](MIGRATIONS.md#making-the-baseline-authoritative).

## At a glance

- **One schema:** `public`. **Every table has Row Level Security (RLS) enabled.**
- **Three client roles:** `anon` (logged-out), `authenticated` (logged-in), `service_role`
  (Edge Functions — bypasses RLS). Admins are `authenticated` users whose `profiles.is_admin`
  is true.
- **Auth:** Supabase Auth (Google OAuth + email). Each auth user gets a `profiles` row via a
  trigger.
- **Storage:** not used. Avatars are stored inline (data URL in `profiles.avatar_url`), so
  there are no Storage buckets to protect or back up.

## Tables

### Account / identity
| Table | Purpose | Read | Write |
|---|---|---|---|
| `profiles` | One row per user. Public columns (`display_name`, `bio`, `avatar_url`) + private (`email`, `is_admin`, `is_pro`, `plan`, `login_count`). | Owner + admin (full row). Public columns for everyone via the `profiles_public` **view**. | Owner may update only `display_name`/`bio`/`avatar_url`/`login_count` (column-level grant → **no self-escalation**). |
| `ai_usage` | Daily AI free-use counter (`user_id`, `usage_date`, `count`). | Owner reads own rows. | **RPCs only** (`increment_ai_usage` / `refund_ai_usage`, service_role). Users cannot write it. |
| `ai_turns` | One row per (account, AI **turn**) — `(user_id, turn_key)`, `calls`, `charged`, `started_at`. The first call of a turn charges `ai_usage`; the rest are free up to a server-set ceiling. | Owner reads own rows. | **RPCs only** (`consume_ai_turn` / `refund_ai_turn` / `sweep_ai_turns`, service_role). |
| `user_prefs` | Per-user synced settings blob (`data` jsonb). | Owner. | Owner. |
| `favorites` | Saved (★) article links. | Owner. | Owner. |

### Community
| Table | Purpose | Read | Write |
|---|---|---|---|
| `community_posts` | User map posts. | Everyone. | Author inserts own; author **or admin** edits/deletes. |
| `community_comments` | Threaded comments. | Everyone. | Author inserts own; author **or admin** edits/deletes. |
| `community_votes` | Upvotes (post,user). | Everyone (counts). | Owner insert/delete. |
| `community_comment_votes` | Upvotes (comment,user). | Everyone. | Owner insert/delete. |
| `community_reports` | Post flags. | **Admin only.** | Owner inserts own. |

### Feedback / ops (PII — admin-read)
| Table | Purpose | Read | Write |
|---|---|---|---|
| `donations` | Donation intent (**PII: email**). | **Admin only.** | Owner inserts own. |
| `feedback` | 5-star + free text (**PII: email + text**). | **Admin only.** | Anyone (incl. anon) inserts. |
| `bug_reports` | Bug reports (**PII: email + diagnostics**). | **Admin only.** | Anyone inserts. |

### Public reference data
| Table | Purpose | Read | Write |
|---|---|---|---|
| `geo_pins` | News-geolocation gazetteer. | Everyone. | Admin (+ service_role). |
| `dashboard_cards` | Curated strategic-location cards. | Everyone. | Admin (+ service_role). |
| `current_news` | Server-refreshed, pre-geolocated news. | Everyone. | **service_role only** (`refresh-news`). |

### Area monitors (#R141 / #R144)
| Table | Purpose | Read | Write |
|---|---|---|---|
| `area_monitors` | A saved area watch (geometry + sources + comparison/sensitivity + schedule + denormalized run-state). | Owner. | Owner insert/delete; UPDATE is a **column grant** (config columns only — **not** `next_run_at` or the run-state columns) reinforced by the `tg_monitors_guard_state` trigger. |
| `monitor_runs` | One execution attempt (status, snapshot, mechanical diff, AI meta). | Owner. | **service_role only** — results cannot be forged. |
| `monitor_evidence` | Structured evidence gathered by a run (`ev_key`, source, url, coords, `dedup_key`). | Owner. | **service_role only.** |
| `monitor_reports` | The report a run generated (severity, headline, summary, grounded `changes`, metrics, change_points). | Owner. | **service_role only**; `read` flips via `monitor_mark_read`. |
| `monitor_seen_items` *(#R144)* | Long-lived per-item ledger (one row per `dedup_key`) → "past N days" baseline + cap-proof novelty. | Owner. | **service_role only.** |

### News events (#R334)

The Event side of the news pipeline — see [`NEWS-EVENTS.md`](NEWS-EVENTS.md) for why each column
exists. `current_news` above is untouched and still serves article mode.

| Table | Purpose | Read | Write |
|---|---|---|---|
| `news_sources` | The one publisher registry. `source_family` is the unit of *independent* source counting — three Sinclair stations are one family, so "7 outlets reported it" cannot be manufactured by syndication. | Everyone. | **service_role only.** |
| `news_source_feeds` | One row per feed of a source (a section RSS carries its own `category`), plus per-feed freshness and failure so "we could not fetch" is never drawn as "nothing happened". | Everyone. | **service_role only.** |
| `news_articles` | One normalized article. Identity is `url_fingerprint` (the same story arrives under a Google News redirect and under the publisher's own link); `title_fingerprint` catches syndication. | Everyone — the policy returns `status = 'active'` only, so a withdrawn article disappears from clients. | **service_role only.** |
| `news_events` | One event: representative headline / place / times, article + independent-source counts, category, confidences. A merged event **keeps its row** (`status='merged'` + `merged_into`) so saved and shared ids still resolve. | Everyone. | **service_role only.** |
| `news_event_articles` | Event ↔ article, with the relation (`same_event` / `update` / `related_context`). A **partial** unique index on `article_id` allows only one primary event per article while leaving `related_context` unlimited. | Everyone. | **service_role only.** |
| `news_cluster_decisions` | Why an article landed where it did: candidates, scores, deterministic evidence, the raw model response, tokens and cost. | **Admin only.** | **service_role only.** |
| `news_event_i18n` | Server-generated translation of an event (`ja` today). Persisted, so it is readable logged out and costs no user AI quota. | Everyone. | **service_role only.** |
| `saved_news_events` | ★ on an **Event** (`favorites` keeps holding ★ on an article link). | Owner. | Owner. |

## Relationships

- `profiles.id`, `ai_usage.user_id`, `user_prefs.user_id`, `favorites.user_id`,
  `donations.user_id`, `feedback.user_id`, `bug_reports.user_id`, and every `community_*`
  `user_id` reference **`auth.users(id)`** (cascade on user delete; `donations`/`feedback`/
  `bug_reports` set null so a report survives account deletion).
- `community_comments.post_id`, `community_votes.post_id`, `community_reports.post_id` →
  `community_posts(id)`. `community_comments.parent_id` self-references (threads).
  `community_comment_votes.comment_id` → `community_comments(id)`.
- `news_source_feeds.source_id` and `news_articles.source_id` → `news_sources(id)` (the article side
  is **restrict**: a source cannot be deleted out from under the articles that cite it).
  `news_event_articles`, `news_event_i18n.event_id` and `saved_news_events.event_id` cascade from
  `news_events(id)`; `news_events.merged_into` self-references (the merge redirect).
  `saved_news_events.user_id` → **`auth.users(id)`** (cascade), which is how `delete_account_data`
  finds it — the purge reads the FK graph, not a list.

## Functions & triggers

| Object | Kind | Notes |
|---|---|---|
| `public.is_admin()` | SECURITY DEFINER, `search_path=''` | Returns whether the JWT user is an admin. Used by admin-only policies without recursing into `profiles` RLS. |
| `public.handle_new_user()` + `on_auth_user_created` trigger on `auth.users` | SECURITY DEFINER | Creates the `profiles` row on signup (copies id/email/display_name). |
| `public.increment_ai_usage(uuid, integer)` | SECURITY DEFINER, `search_path=''` | Atomically consumes one AI use if under the limit. Returns `(used, allowed)`. EXECUTE = service_role only. |
| `public.refund_ai_usage(uuid)` | SECURITY DEFINER, `search_path=''` | Refunds one use after a failed provider call. EXECUTE = service_role only. |
| `public.consume_ai_turn(uuid, integer, text, integer, integer)` | SECURITY DEFINER, `search_path=''` | The turn-aware front door to the quota. Charges once per turn key; later calls of the same key are free until `p_max_calls`, and the key expires after `p_ttl_seconds`. Returns `(used, allowed, charged, calls, reason)`. EXECUTE = service_role only. |
| `public.refund_ai_turn(uuid, text)` | SECURITY DEFINER, `search_path=''` | Releases the charge **and** the turn together, so a retry after a provider failure is not treated as a free continuation. EXECUTE = service_role only. |
| `public.sweep_ai_turns()` | SECURITY DEFINER, `search_path=''` | Deletes turn rows older than a day. The ledger is a scratch pad, not a history. EXECUTE = service_role only. |
| `public.monitor_limit(uuid)` / `monitor_limit_self()` *(#R144)* | SECURITY DEFINER, `search_path=''` | Per-plan monitor cap. `(uuid)` is **service_role-only** (users can't probe another user's plan); the UI reads its own via `monitor_limit_self()`. Enforced by a BEFORE INSERT trigger. |
| `public.monitor_claim_due(int,int)` / `monitor_claim_one(uuid,uuid,int,int)` *(#R144)* | SECURITY DEFINER, `search_path=''` | Atomic claims (cron `FOR UPDATE SKIP LOCKED`; manual `UPDATE…WHERE…RETURNING`). service_role only. |
| `public.monitor_finalize(...)` / `monitor_commit_report(...)` *(#R144)* | SECURITY DEFINER, `search_path=''` | Finalize a run + (optionally) insert its report + update the monitor meta in one transaction. service_role only. |
| `public.tg_monitors_guard_state()` + `trg_monitors_guard` *(#R144)* | SECURITY DEFINER, `search_path=''` | BEFORE UPDATE on `area_monitors`: freezes run-state columns and server-owns `next_run_at` for any non-runner caller (grant-independent). |

Every SECURITY DEFINER function pins an empty `search_path` and schema-qualifies its objects,
so a caller cannot hijack it via their own search path.

## RLS model (the three security guarantees)

1. **PII is not world-readable.** `profiles` SELECT is owner-or-admin; the public
   `profiles_public` view exposes only `id/display_name/bio/avatar_url`. `feedback`,
   `bug_reports`, `donations`, `community_reports`, `ai_usage`, `ai_turns` are never readable by anon or
   by other users.
2. **No privilege escalation.** A user can update only the four safe profile columns (column
   grant), so they cannot set their own `is_admin`/`is_pro`/`plan`. Admin is granted only via
   SQL (below) or `service_role`.
3. **AI quota is tamper-proof.** `ai_usage` is written only by the SECURITY DEFINER RPCs, and
   those RPCs are executable only by `service_role`.
4. **(#R144) Server-owned run-state.** Monitor run results (`monitor_runs`/`_evidence`/`_reports`/
   `_seen_items`) have no write policy → only `service_role` writes them, so they cannot be forged.
   On `area_monitors`, the run-state columns and `next_run_at` are protected by **both** a column
   grant **and** the `tg_monitors_guard_state` trigger — the trigger matters because in production
   Supabase's default privileges grant users full table UPDATE (RLS is the real protection), which
   would otherwise let a user forge run metadata or hand-pick their execution time. `monitor_limit`
   is service-role-only so plans can't be enumerated.

Guarantees 1–3 (and the R144 monitor matrix) are proven by the pgTAP tests
(`04_monitors_test.sql` simulates the prod default grant) — see [`DATABASE.md`](DATABASE.md#rls--permission-testing).

## Admin privileges

An admin is a `profiles` row with `is_admin = true`. There is no self-service path to it. To
grant it (Supabase Dashboard → SQL Editor, which runs as a privileged role):

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

`admin.html` then lets that account read feedback/bug reports, moderate community posts, and
edit `geo_pins`/`dashboard_cards`.

## Auth relationship

- Providers: **Google OAuth** + email/password (Supabase Auth).
- The client uses the **anon/publishable key** (public by design — RLS protects every table).
  The `service_role` key is a **secret**, used only inside Edge Functions.
- Redirect URLs, OAuth client id/secret, JWT settings, and email templates live in the
  Supabase **dashboard**, not in migrations.

## Data classification (drives backup + retention)

- **A — critical, irreplaceable:** `profiles`, `ai_usage`, `user_prefs`, `favorites`,
  `donations`, `feedback`, `bug_reports`, all `community_*`. User-generated / account data.
  ⚠ **`news_events`, `news_event_articles`, `news_cluster_decisions` and `saved_news_events`
  belong here too.** Re-fetching the feeds returns the articles; it does not return which articles
  an operator merged or split, why the clusterer chose what it chose, or what a reader saved.
- **B — regenerable:** `current_news` and `news_articles` (both re-fetched from the feeds),
  `news_event_i18n` (re-translatable, at the cost of translating again), `news_sources` /
  `news_source_feeds` (curated, but reproduced by the Source Registry seed migration), and
  largely `geo_pins` / `dashboard_cards` (curated, but reproducible from `admin.html` seeds).
- **C — must NOT be stored here:** service_role key, DB password, access tokens, raw JWTs,
  or any plaintext production dump. See [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md).

## Not reproducible via migrations (dashboard-only)

`supabase db pull` and this baseline capture schema, RLS, functions, triggers, grants. They do
**not** capture: OAuth provider config + secrets, auth redirect URLs, email templates, project
API keys, the `pg_cron` schedule that triggers `refresh-news`, or Storage bucket settings (none
today). Record those changes in [`MIGRATIONS.md`](MIGRATIONS.md) manually.

---

## RLS & permission testing

How the three guarantees above are *proved* rather than asserted — the pgTAP harness in
[`supabase/tests/`](../supabase/tests), the subjects it impersonates, and what to do when it
fails. Run it with `supabase test db`.
### Subjects (who the tests impersonate)

| Subject | How | Represents |
|---|---|---|
| `anon` | `set local role anon` | A logged-out visitor. |
| user **A** | role `authenticated`, JWT `sub = 111…1` | A normal logged-in user. |
| user **B** | role `authenticated`, JWT `sub = 222…2` | Another user (isolation target). |
| **admin** | role `authenticated`, JWT `sub = 333…3` (is_admin) | A moderator. |
| `service_role` | `set local role service_role` | The Edge Functions (bypasses RLS). |

The synthetic users + data come from [`supabase/seed.sql`](../supabase/seed.sql).

### What is tested (files)

- **`00_structure_test.sql`** — every table exists, RLS is enabled on all **29**, key
  PKs/FKs exist, and `profiles_public` does not leak `email`/`is_admin`.
- **`01_rls_matrix_test.sql`** — the isolation matrix (§7.3): anon can't read PII tables; A
  can't read/update/delete B's rows; A can't self-escalate `is_admin`/`plan`; A can't
  write/inflate `ai_usage`; non-admins can't read feedback/reports; author-or-admin post
  moderation; service_role bypass.
- **`02_functions_test.sql`** — the AI-quota RPC actually enforces the limit and refunds; every
  SECURITY DEFINER function is `security definer` with a pinned `search_path`; the RPC EXECUTE
  and the `profiles` column-UPDATE grants are exactly as intended.
- **`06_news_events_test.sql`** *(#R334)* — the Event tables: anon can read the six public ones and
  neither of the two private ones; no browser role holds INSERT/UPDATE/DELETE on any server-owned
  table; a user reaches only its own `saved_news_events`; and each constraint the migration argues
  for is attacked — the `url_fingerprint` unique, the **partial** one-primary-event index, the two
  merge CHECKs, the four enumerated columns, and the account purge reaching the saved list.

### How the checks work (so a failure is readable)

A blocked **read** returns 0 rows (not an error); a blocked **write** is either `DENIED`
(missing grant or RLS `WITH CHECK` → SQLSTATE 42501) or `ROWS:0` (RLS `USING` filtered every
row). The matrix runs each statement **as the impersonated role** via two `SECURITY INVOKER`
helpers that stash the outcome, then asserts as the superuser:

```
_sel(key, sql)  → the scalar returned, or 'DENIED' / 'ERR:<sqlstate>'
_dml(key, sql)  → 'ROWS:<n>' affected, or 'DENIED' / 'ERR:<sqlstate>'
```

So a failing line reads like: `A CANNOT make itself admin ... got 'ROWS:1'` (expected
`'DENIED'`) — telling you exactly which subject did what it shouldn't.

### Run it locally

Needs Docker running.

```bash
supabase start
supabase db reset                       # apply migrations + seed
# pgTAP is a TEST-only extension (not shipped to prod). Install it on the local DB once:
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "create extension if not exists pgtap with schema extensions;"
supabase test db                        # runs every *_test.sql
```

### Run it in CI

**Actions → "Database checks"** does exactly the above on every PR/push that touches
`supabase/**`, on a throwaway local DB with no secrets. It also runs the drift gate and a
backup→restore roundtrip. It **fails closed**: if the database can't be set up, or any
assertion fails, the job is red — there is no "skipped so it passed" path.

### Reading a CI failure

1. Open the failed **Database checks** job → the **RLS + permission tests (pgTAP)** step.
2. pgTAP prints TAP: look for `not ok N - <description>`. The description names the subject
   and action; the `got '...'` vs expected value tells you whether it was a missing/extra grant
   (`DENIED` vs `ROWS:1`) or an RLS row-visibility problem (`0` vs `1`).
3. Reproduce locally with the block above, fix the policy/grant in the migration, re-run.

### Adding tests for a new table

When a PR adds a table, add its protection tests in the **same PR** (CI reminds you only if you
break an existing guarantee, so be disciplined):

1. Add synthetic rows for it in `seed.sql` (owned by A and by B, so isolation is testable).
2. In `01_rls_matrix_test.sql`, add for the new table: anon read (allowed/denied as designed);
   A reads own (`> 0`); A reads B's (`0`); A updates/deletes B's (`ROWS:0` or `DENIED`); any
   admin-only read (`0` for A, `> 0` for admin).
3. In `00_structure_test.sql`, bump `plan(N)` and add `has_table` + the RLS-enabled `ok(...)`.
4. `supabase db reset && supabase test db` until green, then PR.
