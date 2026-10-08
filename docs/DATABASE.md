# Database (Supabase)

IntMap's data lives in a single Supabase Postgres project (`public` schema). This is the
map of what's there, why, and how it's protected. The authoritative definition is the
version-controlled migration in [`supabase/migrations/`](../supabase/migrations); this page
is the human explanation.

> **Reconstruction note.** The project had no migrations — the schema lived only in the
> live database. The baseline migration was rebuilt from the application + Edge Function
> code. To confirm it matches production and bring prod under migration control, run the
> read-only reconcile in [`MIGRATIONS.md`](MIGRATIONS.md#why-db-push-is-guarded--the-history-is-not-reconciled).

## At a glance

- **One schema:** `public`. **Every table has Row Level Security (RLS) enabled.**
- **Three client roles:** `anon` (logged-out), `authenticated` (logged-in), `service_role`
  (Edge Functions — bypasses RLS). Admins are `authenticated` users whose `profiles.is_admin`
  is true.
- **Auth:** Supabase Auth (Google OAuth + email). Each auth user gets a `profiles` row via a
  trigger.
- **Storage:** three **public** buckets, all written by service_role only and read by everyone:
  `aviation` (the live-aircraft snapshot, #R341), `gdelt` (the GDELT cache, #R424) and `ais` (the
  live-ship snapshot, #R510). Avatars are stored inline (data URL in `profiles.avatar_url`). The
  buckets hold derived public data, so there is nothing to back up.
  **Read by URL, never listed:** every reader GETs `/storage/v1/object/public/<bucket>/<object>`,
  which Storage serves without consulting RLS, so the buckets carry **no SELECT policy** — such a
  policy would add only the listing endpoint (anyone with the publishable key enumerating every
  object name). `supabase/tests/12_db_provenance_hardening_test.sql` asserts it for every
  `public = true` bucket.

## Tables

### Account / identity
| Table | Purpose | Read | Write |
|---|---|---|---|
| `profiles` | One row per user. Public columns (`display_name`, `bio`, `avatar_url`) + private (`email`, `is_admin`, `is_pro`, `plan`, `login_count`). | Owner + admin (full row). Public columns for everyone via `profiles_public` (next row). | Owner may update only `display_name`/`bio`/`avatar_url`/`login_count` (column-level grant → **no self-escalation**). |
| `profiles_public` | The public author card: `id`, `display_name`, `bio`, `avatar_url` — and physically nothing else. Kept in step with `profiles` by the `profiles_public_sync` trigger. **A table, not a view** (#R507): as a view it had no `security_invoker`, so it read `profiles` with the owner's rights and bypassed that table's RLS, and any column added to it would have inherited that bypass. | Everyone (`SELECT USING (true)` — this data is public by declaration). | **Nobody.** No role holds a write grant; the trigger is the only writer. |
| `ai_usage` | Daily AI free-use counter (`user_id`, `usage_date`, `count`) — and, since ai-one-ledger, what that day's provider calls COST: `input_tokens` (full-price input, cache reads/writes excluded), `cached_read_tokens`, `cache_write_tokens`, `output_tokens` (reasoning included), `provider_calls`, `unmetered_calls` (answers that reported no usage). The cost columns never change `count`; a developer account, which consumes no use, gets a row with `count` 0 and its costs. | Owner reads own rows. | **RPCs only** (`increment_ai_usage` / `refund_ai_usage` for `count`; `record_ai_usage` for the cost columns; service_role). Users cannot write it. `count >= 0` is a CHECK, so not even the table owner can (guarantee 3). |
| `ai_gloss_usage` | Daily counter for the Atlas **term-gloss** lane (`user_id`, `usage_date`, `count`). Separate from `ai_usage` so looking a word up inside an answer never spends one of the reader's questions — and so spending the questions never stops the lookups. | Owner reads own rows. | **RPCs only** (`consume_ai_gloss` / `refund_ai_gloss`, service_role). |
| `ai_turns` | One row per (account, AI **turn**) — `(user_id, turn_key)`, `calls`, `charged`, `succeeded`, `started_at`, `settled_at`, and the same six cost columns as `ai_usage` (the turn's own cost while the row lives — it is swept after a day and deleted on refund, which is why `ai_usage` holds the durable total). The first call of a turn charges `ai_usage`; the rest are free up to a server-set ceiling. `succeeded` is set the moment any call of the turn returns a provider answer, and a succeeded turn is never refunded — the audited «answer, then send a bad request under the same turn» sequence used to hand the charge back. | Owner reads own rows. | **RPCs only** (`consume_ai_turn` / `settle_ai_turn` / `refund_ai_turn` / `sweep_ai_turns` / `record_ai_usage`, service_role). |
| `ai_turn_answers` *(atlas-stream-replay)* | The answer of **one keyed Atlas request**, held so that a page whose stream broke before `done` **receives it again instead of computing it again** — `(user_id, turn_key, replay_key)`, `state` (`running` → `done` / `failed`), `attempts`, `status`, `body` (the `{status, body}` ai-proxy returned; only for `done` — a failure is held as a fact and never replayed), `lease_until` (the running request's heartbeat: renewed every SSE heartbeat, two heartbeats long, so a run whose isolate died is `abandoned`), `expires_at` (the turn key's lifetime, `TURN_TTL_S`). Expired rows are never returned, are deleted by the account's next claim and are swept every 15 minutes (pg_cron `ai-turn-answers-sweep` → `sweep_ai_turn_answers`). | Owner reads own rows. | **RPCs only** (`claim_ai_answer` / `peek_ai_answer` / `beat_ai_answer` / `finish_ai_answer` / `sweep_ai_turn_answers`, service_role). |
| `atlas_notebook_entries` *(atlas-os)* | The reader's **Atlas investigation notebook** on their account — one row per entry, `(user_id, id)` with the device-minted id `nb-…`; `question`, `answer`, `created_at`, `updated_at`, and `payload` (title, lang, status, the view the answer ended in, the operations with their exact arguments, the query rows, the sources, the reader's note, `followOf`, `pinned` — layout `js/atlas-notebook-store.js` `rowFromEntry`). Written **only when the reader turns 「アカウントと同期」 on** (off by default); the device copy is IndexedDB. Bounds, refused by name: `payload` ≤ 1 MiB per row (CHECK), ≤ 100 MiB per account (`atlas_notebook_account_bound` trigger → `notebook-account-full`) — both are estimates, not measurements (`dev-notes/2026-10-03-atlas-os.md`). Cascades with the account. | Owner. | Owner (RLS `user_id = auth.uid()` on USING and WITH CHECK). |
| `relay_rate_buckets` | Token buckets shared by every isolate of a relay — `(scope, key)`, `tokens`, `at`. `routing-relay` keeps one per caller address and two project-wide ones (per minute, per day), so the spend ceiling on the paid Mapbox upstream survives restarts and is the same across isolates. | Nobody (no policy; RLS on). | **RPCs only** (`relay_take` / `sweep_relay_rate_buckets`, service_role). |
| `user_prefs` | Per-user synced settings blob (`data` jsonb). | Owner. | Owner. |
| `saved_places` *(my-places)* | An account's **saved places** — `name` (1-120), `note` (≤2000), `collection` (≤60), `lng`/`lat` (CHECK on the globe), `zoom`, `source` (`reader`/`pin`/`search`/`atlas`), `created_at`/`updated_at` (the database's: no client grant on `created_at`, a trigger stamps `updated_at`). **One row per position per account**: `lng5`/`lat5` are generated `round(…, 5)` (~1 m — the session pins' identity) under `unique (user_id, lng5, lat5)`. | Owner. | **INSERT only through `save_place()`** (no INSERT grant); the owner UPDATEs `name`/`note`/`collection`/`lng`/`lat`/`zoom` (column grant — not `user_id`, not `created_at`) and DELETEs own rows. |
| `place_watches` *(watch-places)* | **Watched places** — one row per saved place (`place_id` PK → `saved_places`, cascade): `radius_km` (≤1000, default 300), a threshold per kind — `quake_min_mag` (≥2.5, default 4.5), `alert_min_level` (1–4, default 2), `volcano_min_rank` (1–4, default 2), `news_min_sources` (1–50, default 2); **NULL = that kind is not watched** — `enabled`, and what the reader has seen (`seen_at`, `seen_keys` ≤ 2,000). The numbers are `supabase/functions/_shared/place-watch.js`'s (held together by `tests/watch-places-checks.test.mjs`). | Owner. | The owner INSERTs (only for a place they own — RLS) and UPDATEs the settings and seen columns (column grants — not `user_id`, not `created_at`, not `place_id`) and DELETEs own rows. `tg_place_watches_own` (SECURITY DEFINER) sets `user_id` to the place's owner and refuses a caller who is not it (42501). |
| `quest_daily_results` *(watch-account-product)* | **Today's quest** — one row per (`user_id`, `day`, `kind`) (the primary key): `scores` smallint[] (exactly 5, each 0–1000 — `DAILY_N` and `QUEST_MAX` of `js/quest-engine.js`), `kind` (`where`/`when`), `day` (≥ 2026-10-08, the first day of the day's sets; a trigger refuses a day after tomorrow in UTC), `created_at` (the trigger's). The first finish of a day's set; there is no UPDATE grant, so a second insert of the same day and kind is refused by the key (23505, the page says «already recorded»). | Owner. | Owner INSERT of `day`, `kind`, `scores` only (`user_id` is `auth.uid()`, pinned by trigger `tg_quest_daily_results_own`). No UPDATE, no DELETE (account deletion removes them). |
| `saved_views` *(collection-workspace)* | An account's **saved maps** — `name` (1-120), `note` (≤2000), `collection` (≤60), `state` (the share link's fragment without `#`, as `js/map-state.js` writes it; CHECK it begins with `v=` and is ≤32,768 characters), `created_at`/`updated_at` (the database's). **One row per document per account** *(map-document-unify)*: `kind` (`view` | `map` | `tour` | `brief` — a name for the Library and Atlas, nothing branches on it), `steps` (NULL for one map with no words of its own — every row saved before documents — else `[{state, title, say, ask}]`, at most `saved_view_steps_limit()` steps and 1 MiB; `state` is the first step that names a map), `doc_md5` generated `md5(state ‖ steps)` with UNIQUE `(user_id, doc_md5)` — equal to `state_md5` (generated `md5(state)`) on every row whose `steps` is NULL, so «the same map is one row» is unchanged and a tour that starts on a saved map is a second row. | Owner (RLS `user_id = auth.uid()`). | **No INSERT grant** — `save_view()` only. Owner: UPDATE of `name`/`note`/`collection` (column grant; the map itself is not rewritten in place), DELETE. |
| `collection_shares` *(collection-workspace)* | The collections an account chose to **publish read-only** — `collection` (NULL = everything, `''` = unfiled), `title` (1-120), `token` (32 hex of `gen_random_uuid()`, UNIQUE — the link's whole access control), `created_at`/`updated_at`. UNIQUE NULLS NOT DISTINCT `(user_id, collection)`: one share per collection. | Owner. **The public reads a share only through `shared_collection(token)`** — anon holds no privilege on the table (tokens are not listable). | **No INSERT grant** — `publish_collection()` only. Owner: UPDATE of `title` (column grant), DELETE (= unpublish: the link answers `not_found` at once). |
| `favorites` | Saved (★) article links. | Owner. | Owner. |

### Community
| Table | Purpose | Read | Write |
|---|---|---|---|
| `community_posts` | User map posts. | Everyone. | Author inserts own — INSERT is a **column grant** (`user_id, author_name, title, body, img, lat, lng, category`), and `author_name` / `created_at` are **written by the database** (`tg_community_stamp_provenance`), never taken from the request; author **or admin** edits/deletes the content columns. |
| `community_comments` | Threaded comments. | Everyone. | Author inserts own — column grant (`post_id, user_id, author_name, body, parent_id`), provenance stamped the same way; author **or admin** edits/deletes. |
| `community_votes` | Upvotes (post,user). | Everyone (counts). | Owner insert/delete. |
| `community_comment_votes` | Upvotes (comment,user). | Everyone. | Owner insert/delete. |
| `community_reports` | Post flags. | **Admin only.** | Owner inserts own. |

### Feedback / ops (PII — admin-read)
| Table | Purpose | Read | Write |
|---|---|---|---|
| `donations` | Donation intent (**PII: email**). | **Admin only.** | Owner inserts own. |
| `feedback` | 5-star + free text (**PII: email + text**). | **Admin only.** | **Nobody directly** *(anon-write-guard)* — only service_role, i.e. the `reader-reports` Edge Function, which any reader (signed in or not) sends to; it takes a token from two shared `relay_take` buckets first and sets `user_id` / `email` from the verified session, never from the body. |
| `bug_reports` | Bug reports (**PII: email + diagnostics**). | **Admin only.** | **Nobody directly** — the same `reader-reports` path as `feedback`. |
| `client_errors` *(client-error-log)* | Uncaught exceptions / unhandled rejections from readers' browsers, **one row per distinct defect** (`fingerprint`, 32 hex = SHA-256 of kind + message with numbers collapsed + top frame, computed by the Edge Function) with `count`, `first_seen`, `last_seen` and the latest `release` / `path` / `browser` (name + major version). **No PII by construction** — there is no column for an IP, a user, a session, a query string or a raw User-Agent, and message/stack are scrubbed before storage (`supabase/functions/_shared/client-error-shape.js`). Purged 30 days after `last_seen` (pg_cron `client-errors-purge` → `purge_client_errors`). | **Admin only** (`SELECT` policy on `is_admin()`; admins cannot edit it). | **Nobody directly** — only `record_client_error` (service_role, the `client-errors` Edge Function). |
| `usage_counts` *(anonymous-usage-counts)* | Anonymous aggregate usage counters: **(UTC day, metric, dimension) → count** and nothing else. What a metric and a dimension may be is declared once in `supabase/functions/usage-count/shape.js` (page view, entry by link/embed/landing page, referring host name, utm tags, language bucket, device class, layer switched on, feature used, number of Atlas questions, kind of Atlas answer); the CHECK constraints are the database's own outer bound on the same shape. **No PII by construction** — there is no column for an IP, a user, a session, a User-Agent or a time finer than the day. Purged after 400 days (pg_cron `usage-counts-purge` → `purge_usage_counts`). | **Admin only** (`SELECT` policy on `is_admin()`; admins cannot edit it; totals through `usage_counts_summary`). | **Nobody directly** — only `record_usage_counts` (service_role, the `usage-count` Edge Function). |
| `org_inquiries` *(sales-channels)* | Enquiries from organisations — newsrooms, schools, research groups, NGOs — and supporters asking to be named, sent from `contact.html` (**PII: name, reply e-mail, free text**, optional organisation / role / website / country). `audience` and `purpose` are the words of `supabase/functions/_shared/inquiry-shape.js`; `consent` must be true. `status` new → replied / closed / spam, with an admin-only `admin_note`. | **Admin only.** | **Nobody directly** — the `reader-reports` Edge Function (kind `inquiry`) as service_role, behind the same shared buckets as `feedback`; the reply address is the one typed, `user_id` the verified session's. Admins may change only `status`, `admin_note`, `handled_at`, *(sales-next)* the pipeline's `stage` (lead → talking → trial → adopted / declined, the words of `INQUIRY_PIPELINE`), `next_step` (≤300), `next_step_on`, `stage_changed_at`, and delete. Spam purged after 30 days, every row after 730 (`purge_org_inquiries`, pg_cron `org-inquiries-purge`). |
| `map_corrections` *(community-next)* | A reader's report that something on the map is wrong at a point: `kind` (the words of `supabase/functions/_shared/correction-shape.js`), `lng`/`lat`/`zoom`, the map state as the share fragment (`map_link`, `#v=…`), the clock's `year` on a historical map, the layer named, the reader's `message` and optional `evidence_url`, `receipt_hash` (sha256 of the receipt only the sender's device holds — **no e-mail column**). The operator's `status` (new / confirmed → fixed / not_an_error / duplicate / cannot_fix / spam), `reply` (shown to the sender; public when `published`), `fixed_ref`, `admin_note`, `duplicate_of`; `resolved_at` is set by trigger. | **Admin only** (the table). The sender reads their own row's answer through `map_correction_status(receipts[])` (anon) or `my_map_corrections()` (account); everyone reads published rows through `public_map_corrections()` and the counts through `map_corrections_summary()`. | **Nobody directly** — `reader-reports` (kind `correction`) as service_role behind the shared buckets; `user_id` from the verified session. Admins may change only the answer columns and `place_label`, and delete. Publishing needs a reply and an answer (CHECK). Spam purged after 30 days, unpublished answers 730 days after the answer (`purge_map_corrections`, pg_cron `map-corrections-purge`). |
| `supporters` *(sales-channels)* | The supporters named on `support.html`: display name, the month of the gift (first of the month), an optional line (≤140), when consent was given, `listed`. **No amount, no payment data, no e-mail.** A row exists because the supporter asked (an `org_inquiries` row with purpose `supporter_listing`) and an admin matched the gift in the Stripe dashboard by hand. | **Everyone** reads `listed` rows (anon: name, month and line only). Admins read all. | **Admin only.** |

### Public reference data
| Table | Purpose | Read | Write |
|---|---|---|---|
| `geo_pins` | News-geolocation gazetteer. | Everyone. | Admin (+ service_role). |
| `dashboard_cards` | Curated strategic-location cards. | Everyone. | Admin (+ service_role). |
| `current_news` | Server-refreshed, pre-geolocated news. | Everyone. | **service_role only** (`refresh-news`). |
| `account_data_catalog` *(account-data-center)* | **One sentence per account-owned table**: `tbl`, `written_by` (`you` = the reader typed or chose it / `intmap` = recorded about the reader's use), `label_*`, `purpose_*`, `retention_*` in `en` and `jp`. It explains; it never filters — an owned table with no row is still counted and exported, and `23_account_data_center_test.sql` fails until the row is written. | Everyone (it holds no one's data — it is the privacy inventory). | **Migrations only** (no role holds a write grant). |
| `who_don_extracts` *(#R650)* | The case and death counts read out of each WHO Disease Outbreak News item — the one field WHO does not publish as data. `cases`/`deaths` are **nullable on purpose**: NULL means «WHO states no cumulative total», which is not zero. `source_hash` is the hash of the prose the model was actually given, so a rewritten item re-extracts and an unchanged one is never paid for twice. | Everyone. | **service_role only** (`who-don`). |

### News events (#R334)

The Event side of the news pipeline — see [`NEWS-EVENTS.md`](NEWS-EVENTS.md) for why each column
exists. `current_news` above is untouched and still serves article mode.

| Table | Purpose | Read | Write |
|---|---|---|---|
| `news_sources` | The one publisher registry. `source_family` is the unit of *independent* source counting — three Sinclair stations are one family, so "7 outlets reported it" cannot be manufactured by syndication. | Everyone. | **service_role only.** |
| `news_source_feeds` | One row per feed of a source (a section RSS carries its own `category`), plus per-feed freshness and failure so "we could not fetch" is never drawn as "nothing happened". | Everyone. | **service_role only.** |
| `news_articles` | One normalized article. Identity is `url_fingerprint` (the same story arrives under a Google News redirect and under the publisher's own link); `title_fingerprint` catches syndication. **(#R404)** The subject location carries its own provenance: `subject_located_by` says *what placed it* (`ai` / `dict` / `none`), `subject_ai_at` says *when the AI last looked at this article* (null = never — and it is set even when the AI decided the story has no place, so the same article is never paid for twice), and `subject_locator` names the answering `provider:model`. | Everyone — the policy returns `status = 'active'` only, so a withdrawn article disappears from clients. | **service_role only.** |
| `news_events` | One event: representative headline / place / times, article + independent-source counts, category, confidences, and *(#R351)* `category_evidence` — which tier decided the category and on what (the feed's vote / the publisher's own tags / the terms that matched). A merged event **keeps its row** (`status='merged'` + `merged_into`) so saved and shared ids still resolve. | Everyone. | **service_role only.** |
| `news_event_articles` | Event ↔ article, with the relation (`same_event` / `update` / `related_context`). A **partial** unique index on `article_id` allows only one primary event per article while leaving `related_context` unlimited. | Everyone. | **service_role only.** |
| `news_cluster_decisions` | Why an article landed where it did: candidates, scores, deterministic evidence, the raw model response, tokens and cost. | **Admin only.** | **service_role only.** |
| `news_event_i18n` | Server-generated translation of an event (`ja` today). Persisted, so it is readable logged out and costs no user AI quota. *(#R351)* `source_title_fp` is the hash of the headline that was translated, so a cached translation is reused until the headline itself changes — `updated_at` would move on every added article and re-bill the same sentence. | Everyone. | **service_role only.** |
| `saved_news_events` | ★ on an **Event** (`favorites` keeps holding ★ on an article link). | Owner. | Owner. |
| `news_ingest_runs` *(#R351)* | One row per `news-ingest` run: feeds reached, items fetched, articles new/seen, the **reject breakdown**, events created/updated, evictions, translations, **articles the AI placed (`located_ai`) and considered (`located_considered`) (#R404)**, tokens, an indicative cost, and per-stage timings. ⚠ the three LLM columns are the run's **total** (translation + geolocation); the per-stage split is in `notes`. Per-feed freshness is not copied here — `news_source_feeds` holds it. | **Admin only.** | **service_role only.** |
| `news_event_entities` *(news-intelligence)* | Which company (an id of `data/companies/index.json`) a news event names, one row per (event, company): `matched_by` (`legal_name` / `ticker` / `name`), `evidence` (the sentence the match rests on), the article it came from (nulled when the article is pruned). Written by `news-ingest`'s `entities` stage. `news_articles.companies_scanned_at` marks the articles already compared. | **Everyone (anon + authenticated).** | **service_role only.** |
| `news_event_admin_actions` *(#R386)* | One row per operator (or machine) Merge / Split / Reassign / metadata override, with the **material needed to reverse it** in `before`. ⚠ `before` holds only what the action changed — restoring a whole-table snapshot would roll back every article ingested since. ⚠ No FK from `actor` / `reverted_by` to `auth.users`: this is an audit record, not an owned row (same reason as `news_events.reviewed_by`). | **Admin only.** | **service_role only** — operators write it through the RPCs below. |

## Operator RPCs — News Events *(#R386)*

The News Events tab in `admin.html` never UPDATEs these tables. One operator action touches four
of them (`news_event_articles`, `news_events.merged_into`, the counts, and the audit row), so each
is a single `SECURITY DEFINER` function that either does all of it or none of it.

| Function | What it does |
|---|---|
| `news_event_merge(source, target, note)` | Human merge. Checks admin, then calls the one below. |
| `news_event_merge_into(source, target, actor, note)` | The mechanism. `actor = null` means the machine (`link` stage), which is also why it does **not** set `manual_lock` — a pipeline that freezes what it just merged can never update it again. |
| `news_event_reassign(article_ids, target, note)` | Moves articles. `target = null` creates a new event, i.e. **split is reassign with a new destination** — one implementation, not two. |
| `news_event_update_meta(event, title, category, lng, lat, place, clear_location, lock, note)` | Overrides, **and sets the override flags** — writing the value alone lets the next ingest quietly put it back. `clear_location` exists because `null` means "leave it", so there would otherwise be no way to remove a location. |
| `news_event_undo(action)` | Reverses one `news_event_admin_actions` row, once. |
| `news_event_recount(event)` | Article count and **independent source count by `source_family`**. |
| `news_embedding_candidates(article_ids, k, min_sim)` | Nearest neighbours that already belong to an event. Proposes candidates; decides nothing. |
| `news_event_link_candidates(k, min_sim, limit)` | Event pairs whose members are semantically close. Proposes candidates; decides nothing. |
| `news_articles_set_embeddings(jsonb)` | Bulk write-back of embeddings (three columns of existing rows). |

### Atlas capability vectors (atlas-semantic-search)
| Table | Purpose | Read | Write |
|---|---|---|---|
| `atlas_capability_vectors` | One embedding per Atlas capability's documentation — `(catalog_hash, model, capability_id)`, `embedding vector(1536)`, `created_at`. `catalog_hash` is the SHA-256 of the whole catalogue, **recomputed by the `atlas-embed` Edge Function from the text it embeds**, so a changed catalogue is a new key and no caller can file text under a key that is not its hash. The QUERY side is never stored. | **service_role only** (no policy). | **service_role only**, through the functions below. |

| Function | What it does |
|---|---|
| `atlas_capability_catalog_size(catalog, model)` | How many capabilities are stored under the key. 0 = unknown — the function then asks the page for the catalogue instead of embedding a query it cannot compare. |
| `atlas_capability_similarity(catalog, model, query)` | Cosine similarity (`1 - (embedding <=> query)`) of one query vector to **every** capability of that catalogue — not a top-k: the page judges what stands out from the whole distribution. |
| `atlas_capability_seed(catalog, model, jsonb)` | Stores a whole catalogue in one statement (a malformed vector raises and nothing is written); idempotent; sweeps OTHER catalogues older than 30 days in the same transaction. |

⚠⚠⚠ **None of them calls `public.is_admin()`.** The repository baseline declares a zero-argument
`is_admin()`, but **production has only `is_admin(uid uuid)`** (measured 2026-08-24 — the baseline
was written after production and, as `MIGRATIONS.md` says, was never recorded there). Each function
checks `exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)`
itself; `grant execute` means "may call", never "may do".

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
- `saved_places.user_id` → **`auth.users(id)`** (cascade) — so account deletion, the account inventory
  and the account export all reach it with no list naming it (they walk the same `_owned_by_user_cols()`).
- `place_watches.place_id` → **`saved_places(id)`** (cascade: deleting a place deletes its watch) and
  `place_watches.user_id` → **`auth.users(id)`** (cascade) — discovered by `_owned_by_user_cols()` like the rest.
- `quest_daily_results.user_id` → **`auth.users(id)`** (cascade) — discovered by `_owned_by_user_cols()`: the export and account deletion reach it.
- `saved_views.user_id` and `collection_shares.user_id` → **`auth.users(id)`** (cascade) — the same: deleting the
  account removes the maps and every link it published, and the export carries both.

## Functions & triggers

| Object | Kind | Notes |
|---|---|---|
| `public.news_pulse(timestamptz, timestamptz)` *(news-intelligence)* | SECURITY INVOKER, `search_path=public`, STABLE | News events counted by (representative point, first-reported UTC day, category) as ONE jsonb `{pts, rows, oldest, newest}`; span ≤ 62 days. EXECUTE = anon, authenticated, service_role (the `news_events` RLS decides). Called as GET. |
| `public.news_events_at(jsonb, timestamptz, timestamptz)` *(news-intelligence)* | SECURITY INVOKER, STABLE, `setof news_events` | The active events on up to 2,000 given representative points, first reported in the span — rows of `news_events`, so PostgREST embeds their articles as usual. |
| `public.news_title_terms(text)` *(news-story)* | IMMUTABLE, STRICT, `search_path=''` | A headline's words: lower case, runs of letters and digits, 3–40 characters, once each, sorted — the ONE word-cutting rule of a news story. Indexed: `idx_news_events_title_terms` (GIN on this expression, active and unmerged events). |
| `public.news_story(text[], timestamptz, timestamptz)` *(news-story)* | SECURITY INVOKER, STABLE, `setof news_events` | The active events whose headline holds EVERY one of 1–6 words, first reported in the span (≤ 62 days) — rows of `news_events`. No words / more than six / a longer span → no rows. |
| `public.news_story_terms(text, timestamptz, timestamptz, real)` *(news-story)* | SECURITY INVOKER, STABLE | For each word of a text: how many events of the span name it, and how often sentence-case headlines capitalise it mid-sentence (`news_title_is_sentence_case`); the co-occurrence of each pair under the share cap — ONE jsonb of counts, no headline. Called as GET. pgTAP 24. |
| `public.news_ingest_health()` *(news-intelligence)* | SECURITY DEFINER, `search_path=''` | Per-stage last run / success / failure / skip of `news-ingest`, the median gap between runs and the tick schedule — **no run text, model or cost**. Its comment states why anon may call it (pgTAP 11, 18). |
| `public.is_admin()` | SECURITY DEFINER, `search_path=''` | Returns whether the JWT user is an admin. Used by admin-only policies without recursing into `profiles` RLS. |
| `public.handle_new_user()` + `on_auth_user_created` trigger on `auth.users` | SECURITY DEFINER | Creates the `profiles` row on signup (copies id/email/display_name). |
| `public.increment_ai_usage(uuid, integer)` | SECURITY DEFINER, `search_path=''` | Atomically consumes one AI use if under the limit. Returns `(used, allowed)`. EXECUTE = service_role only. |
| `public.refund_ai_usage(uuid)` | SECURITY DEFINER, `search_path=''` | Refunds one use after a failed provider call. EXECUTE = service_role only. |
| `public.consume_ai_gloss(uuid, integer)` | SECURITY DEFINER, `search_path=''` | Atomically consumes one **term-gloss** lookup if under that lane's own limit. Returns `(used, allowed)`. EXECUTE = service_role only. |
| `public.refund_ai_gloss(uuid)` | SECURITY DEFINER, `search_path=''` | Refunds one lookup after a failed provider call. EXECUTE = service_role only. |
| `public.consume_ai_turn(uuid, integer, text, integer, integer)` | SECURITY DEFINER, `search_path=''` | The turn-aware front door to the quota. Charges once per turn key; later calls of the same key are free until `p_max_calls`, and the key expires after `p_ttl_seconds`. Returns `(used, allowed, charged, calls, reason)`. EXECUTE = service_role only. |
| `public.settle_ai_turn(uuid, text)` | SECURITY DEFINER, `search_path=''` | Marks the turn as having produced an answer (`succeeded`). Idempotent; an empty key is a no-op. EXECUTE = service_role only. |
| `public.refund_ai_turn(uuid, text)` | SECURITY DEFINER, `search_path=''` | Releases the charge **and** the turn together, so a retry after a provider failure is not treated as a free continuation — **unless the turn has succeeded**, in which case it releases nothing. One `DELETE … RETURNING`, so two concurrent refunds decrement once; the use goes back to the day the turn was charged on (`usage_date`), not to today. EXECUTE = service_role only. |
| `public.relay_take(text, text, integer, numeric, integer)` | SECURITY DEFINER, `search_path=''` | Atomic token-bucket take on `relay_rate_buckets` (row lock, refill by `clock_timestamp()`); returns `(allowed, remaining)`. Capacity and refill are arguments, so the caller owns the numbers. EXECUTE = service_role only. |
| `public.sweep_relay_rate_buckets(integer)` | SECURITY DEFINER, `search_path=''` | Deletes buckets idle longer than the argument (default two days). EXECUTE = service_role only. |
| `public.record_client_error(text, text, text, text, text, text, text, integer)` | SECURITY DEFINER, `search_path=''` | *(client-error-log)* Inserts a new defect or adds one to a known fingerprint's `count` (one `insert … on conflict do update`, so concurrent reports add up). Refuses a NEW fingerprint once the table holds `p_max_rows` rows (a known one still counts). Returns `inserted` / `counted` / `full`. EXECUTE = service_role only. |
| `public.purge_client_errors(integer)` | SECURITY DEFINER, `search_path=''` | *(client-error-log)* Deletes defects last seen more than the argument's days ago (default 30 — the retention the privacy policy states). Scheduled daily as pg_cron job `client-errors-purge` (the migration schedules it idempotently when pg_cron exists). EXECUTE = service_role only. |
| `public.record_usage_counts(jsonb)` | SECURITY DEFINER, `search_path=''` | *(anonymous-usage-counts)* Adds one request's rows — `[{m, d, n, cap}]`, already validated by the `usage-count` function against `shape.js` — to **today's (server UTC)** counters, one `insert … on conflict do update` per row inside one transaction. A NEW dimension is refused once its metric already holds `cap` dimensions that day (a known one still counts). Returns how many rows were counted. EXECUTE = service_role only. |
| `public.purge_usage_counts(integer)` | SECURITY DEFINER, `search_path=''` | *(anonymous-usage-counts)* Deletes days older than the argument (default 400 — the retention the privacy policy states). Scheduled daily as pg_cron job `usage-counts-purge`. EXECUTE = service_role only. |
| `public.map_correction_status(text[])` / `public.my_map_corrections()` / `public.public_map_corrections(integer)` / `public.map_corrections_summary()` | SECURITY DEFINER, `search_path=''` | *(community-next)* The answer to the corrections whose receipts are given (≤100, matched by sha256; spam reads as closed) — anon may call; the signed-in caller's own corrections — authenticated only; the published log (no sender, text or receipt) and its counts — anon may call (each comment says why). |
| `public.purge_map_corrections(integer, integer)` | SECURITY DEFINER, `search_path=''` | *(community-next)* Deletes corrections marked spam after the first argument's days (default 30) and answered, unpublished ones the second's days (default 730) after the answer. EXECUTE = service_role only (pg_cron). |
| `public.purge_org_inquiries(integer, integer)` | SECURITY DEFINER, `search_path=''` | *(sales-channels)* Deletes enquiries marked spam after the first argument's days (default 30) and every enquiry after the second's (default 730) — the retention the contact page and the privacy text state. EXECUTE = service_role only (pg_cron). |
| `public.usage_counts_summary(integer)` | **SECURITY INVOKER**, `search_path=''` | *(anonymous-usage-counts)* Each (metric, dimension)'s total over the last N days (1-400), for the admin console's **Usage** and **Growth** tabs (Growth also asks it for twice the period, to show the period before). Invoker on purpose: the admin-only SELECT policy is what decides who sees a row, so a non-admin gets none. EXECUTE = authenticated (not anon). |
| `public.account_data_inventory()` *(account-data-center)* | SECURITY DEFINER, `search_path=''`, STABLE | For the **signed-in caller** (`auth.uid()` — there is no argument, so no other account can be named): one row per table `_owned_by_user_cols()` discovers — the walk `delete_account_data` uses — with the account's row count there and the catalogue's sentence (`described = false` when there is none; the table is still listed). Definer because several owned tables are admin-read under RLS (`feedback`, `bug_reports`, `donations`, `community_reports`) and those rows are the reader's own. Raises 42501 signed out. EXECUTE = authenticated, service_role (not anon). |
| `public.export_account_data()` *(account-data-center)* | SECURITY DEFINER, `search_path=''` | Every row the caller's account owns, every column (`to_jsonb`), across the same discovered tables, plus `account` (what `auth.users` / `auth.identities` hold: email, created / confirmed / last sign-in, providers, the sign-in provider's profile) and each table's catalogue sentence — one JSON document (`format: intmap-account-export`, `version: 1`). Fenced per account by `relay_take('account-export', uid, 6, 6/3600)`: a refusal returns `{ok:false, error:'rate_limited'}` and reads nothing. EXECUTE = authenticated, service_role (not anon). |
| `public.save_place(text, double precision, double precision, text, text, real, text)` *(my-places)* | SECURITY DEFINER, `search_path=''` | **The only way into `saved_places`.** The account is `auth.uid()`; the same position (~1 m) is the same place — a second save updates the fields it was given and returns `created = false`; a NULL argument keeps what the place has. A new place past `saved_places_limit()` raises 54000. `ON CONFLICT` makes two simultaneous saves of one place one row. Returns `(place_id, created, place_count)`. EXECUTE = authenticated, service_role. |
| `public.saved_places_limit()` *(my-places)* | SQL, IMMUTABLE | 10,000 — a fence against a runaway loop, not a quota (the migration states the estimate and when it expires). The one copy of the number. EXECUTE = authenticated, service_role. |
| `public.tg_saved_places_touch()` + `saved_places_touch` *(my-places)* | INVOKER, `search_path=''` | BEFORE UPDATE on `saved_places`: `updated_at := now()`. |
| `public.save_view(text, text, text, text)` *(collection-workspace)* | SECURITY DEFINER, `search_path=''` | **The only way into `saved_views`.** The account is `auth.uid()`; the same fragment (a leading `#` is dropped) is the same map — a second save updates the fields it was given and returns `created = false`; a fragment with no camera (`v=`) is refused (22023); `saved_views_limit()` refuses a new map with 54000. EXECUTE = authenticated, service_role. |
| `public.save_view(text, text, text, text, text, jsonb)` *(map-document-unify)* | SECURITY DEFINER, `search_path=''` | The same door for a **whole map document**: `p_kind` and `p_steps` have **no defaults** (the four-argument call stays unambiguous, and that function hands its arguments here with both NULL). The steps are kept as exactly `{state, title, say, ask}` (strings; each fragment without `#`, `''` or a map link ≤ 32,768); the row's `state` must be the first step's map; the identity is `doc_md5`; `saved_view_steps_limit()` refuses with 54000; a wrong kind, a non-list, an empty list or a non-string word with 22023. EXECUTE = authenticated, service_role. |
| `public.saved_view_steps_limit()` *(map-document-unify)* | SQL, IMMUTABLE | 200 — the most steps one saved document holds (with the 1 MiB CHECK on `steps`): a fence against a runaway loop and a row-size bound, not a quota. `js/map-doc.js` `STEPS_MAX` is held equal to it by tests/map-document-unify-checks. EXECUTE = authenticated, service_role. |
| `public.saved_views_limit()` *(collection-workspace)* | SQL, IMMUTABLE | 2,000 — a fence against a runaway loop, not a quota (the migration states the estimate and when it expires). EXECUTE = authenticated, service_role. |
| `public.publish_collection(text, text)` *(collection-workspace)* | SECURITY DEFINER, `search_path=''` | **The only way into `collection_shares`.** Publishes one collection of the caller (NULL = everything) and returns its token with the place / map counts; publishing a published collection returns the **same** token (`created = false`); an empty collection is refused (22023). EXECUTE = authenticated, service_role. |
| `public.shared_collection(text)` *(collection-workspace, map-document-unify)* | SECURITY DEFINER, `search_path=''`, STABLE | Each map carries its `kind` and `steps` (a visitor plays a published tour). **The public read** — anon may call it (its comment carries `ANON MAY CALL:` — `11_definer_execute_test.sql`). For a published token: `{ok, format:'intmap-collection', version, title, collection, published_at, updated_at, places:[{name,note,collection,lng,lat,zoom}], …}` and the saved maps as `{name,note,collection,state}` entries — what the collection holds **now**, built from named keys (no row id, no account, no e-mail). Anything else: `{ok:false, error:'not_found'}`. |
| `public.copy_shared_collection(text, text)` *(collection-workspace, map-document-unify)* | SECURITY DEFINER, `search_path=''` | Copies each document with its `kind` and `steps`; «already held» is the same `doc_md5`. A signed-in reader keeps a published collection in **their own** account, filed under the second argument (default: its title): new positions / maps are inserted (`source = 'shared'`), ones already held are left and counted (`places_had` / `views_had`) — copying twice equals copying once. Enforces both fences on what is new (54000). EXECUTE = authenticated, service_role. |
| `public.sweep_ai_turns()` | SECURITY DEFINER, `search_path=''` | Deletes turn rows older than a day. The ledger is a scratch pad, not a history. EXECUTE = service_role only. |
| `public.claim_ai_answer(uuid, text, text, integer, integer)` | SECURITY DEFINER, `search_path=''` | *(atlas-stream-replay)* Decides whether the request with this replay key runs: `claimed` (run it — `attempts` is this run's number, `after_state` is `failed` / `abandoned` when it runs again after an observed failure or a dead run), `done` (the stored answer — do not run), `running` (another request holds it and is beating — wait). One row lock decides, so two retries cannot both run it. Deletes the account's expired rows first. EXECUTE = service_role only. |
| `public.peek_ai_answer(uuid, text, text)` | SECURITY DEFINER, `search_path=''` | *(atlas-stream-replay)* What a retry finds, without claiming: `done` (with the body) / `failed` / `running` / `abandoned`; no row when nothing was registered or it expired. ai-proxy asks it **before** `consume_ai_turn`, so a stored answer is returned without spending a call. EXECUTE = service_role only. |
| `public.beat_ai_answer(uuid, text, text, integer, integer)` / `finish_ai_answer(uuid, text, text, integer, boolean, integer, jsonb)` | SECURITY DEFINER, `search_path=''` | *(atlas-stream-replay)* Renew the lease / write the result — only for the attempt that holds the claim, so a superseded run changes nothing. A failure stores its status and no body. EXECUTE = service_role only. |
| `public.atlas_notebook_account_bound()` (trigger) | **SECURITY INVOKER**, `search_path=''` | *(atlas-os)* BEFORE INSERT OR UPDATE on `atlas_notebook_entries`: refuses a row that would take one account past 100 MiB of notebook (`notebook-account-full`, P0001). It sums only the writer's own rows, which RLS already shows them, so it needs no privilege the caller lacks. |
| `public.sweep_ai_turn_answers()` | SECURITY DEFINER, `search_path=''` | *(atlas-stream-replay)* Deletes every expired held answer. Scheduled every 15 minutes as pg_cron job `ai-turn-answers-sweep` (scheduled idempotently when pg_cron exists). EXECUTE = service_role only. |
| `public.record_ai_usage(uuid, text, integer, integer, bigint, bigint, bigint, bigint)` | SECURITY DEFINER, `search_path=''` | *(ai-one-ledger)* Adds one request's provider usage — normalised by `supabase/functions/_shared/ai-usage.js` — to today's `ai_usage` row (inserting it with `count` 0 if absent) and, when the turn key names a live `ai_turns` row, to that row. Negative/null inputs read as 0; zero calls write nothing; never touches `count`. Called by `ai-proxy` through `_shared/ai-ledger.js`. EXECUTE = service_role only. |
| `public.operating_stats()` *(supporter-funnel)* | SECURITY DEFINER, `search_path=''`, STABLE | This month's (UTC) project-wide totals from `ai_usage`'s cost columns — `provider_calls`, `unmetered_calls`, input tokens (full-price + cache read + cache write), `cached_tokens`, `output_tokens` — plus `metered_since` (the first day any cost was recorded) and `as_of`. **Aggregates only**: no user id, no per-account or per-day row. `count` is deliberately not summed (it is net of refunds and negative on some days, so it is not a number of answers). EXECUTE = anon, authenticated, service_role — the comment states why (`ANON MAY CALL`): the support panel shows it to every reader. The page calls it with GET, which PostgREST runs read-only. |
| `public.tg_community_stamp_provenance()` + `trg_community_posts_provenance` / `trg_community_comments_provenance` | SECURITY DEFINER, `search_path=''` | BEFORE INSERT on `community_posts` / `community_comments`: for any caller that is not service_role or a no-JWT session, `author_name` := the author's `profiles_public.display_name` (no name → the `User-` + first five alphanumerics of the id handle the client shows), `created_at` := `now()`, `edited_at` := null. What the request said about them is never read (grant-independent, like `tg_profiles_guard_privcols`). |

Every SECURITY DEFINER function pins a `search_path` that does not contain `public` and
schema-qualifies its objects, so a caller cannot hijack it via their own search path. All but
six pin the empty string; the six embedding functions (`news_embedding_candidates`,
`news_articles_set_embeddings`, `news_event_link_candidates`, and the three `atlas_capability_*`
functions) pin `extensions` alone, because
pgvector's `<=>` operator lives there and operators are resolved through the search path.
`supabase/tests/09_r801_security_audit_test.sql` measures this over `pg_proc`, not over a list, and
`12_db_provenance_hardening_test.sql` states the property itself: every entry is the empty string,
`pg_temp` (last only), or a schema that is not `public` and in which neither `anon` nor `authenticated`
holds CREATE. ⚠ **Read the catalogue, not the CREATE statement:** the news-event RPCs still say
`set search_path = public` in `20260824090000` / `20260824190000`, and run with `''` because
`20260918090000` re-pinned them with `ALTER FUNCTION` inside a DO block.

A SECURITY DEFINER function runs with its owner's rights, so **who may call it is its whole access
control** — and PostgreSQL gives EXECUTE to PUBLIC on creation while Supabase's default privileges give
it to `anon`. `grant … to authenticated` does not revoke those: measured 2026-09-26, `anon` could
execute two area-monitor functions (since removed with that feature) in production although their migrations
granted `authenticated` only (`20260926090000` revoked them). The rule, asserted over the catalogue by
`supabase/tests/11_definer_execute_test.sql`: **`anon` may execute a callable SECURITY DEFINER function in
`public` only when an RLS policy that applies to `anon` calls it** (a policy runs with the caller's
privileges) **or its own COMMENT says why in words — `ANON MAY CALL: <reason>`** (`is_admin()`: it
returns only a boolean about the caller; the baseline chose that grant, and the sentence now lives
where the catalogue can read it). Trigger and event-trigger functions cannot be called as RPCs and are
not counted.

Three privileges never go through RLS — `TRUNCATE`, `REFERENCES`, `TRIGGER` — and Supabase's
default privileges hand them to `anon`/`authenticated` on every new table. They are revoked from
**every** table in `public` (a loop over the catalogue, so the next table is covered), and the
same pgTAP file asserts zero grants.

## RLS model (the three security guarantees)

1. **PII is not world-readable.** `profiles` SELECT is owner-or-admin; the public
   `profiles_public` table holds only `id/display_name/bio/avatar_url` and is not a view
   over `profiles`, so there is no owner-rights read of it to inherit (#R507). `feedback`,
   `bug_reports`, `donations`, `community_reports`, `ai_usage`, `ai_turns`, `ai_gloss_usage` are never readable by anon or
   by other users.
2. **No privilege escalation.** A user can update only the four safe profile columns (column
   grant), so they cannot set their own `is_admin`/`is_pro`/`plan`. Admin is granted only via
   SQL (below) or `service_role`.
3. **AI quota is tamper-proof.** `ai_usage` — and the separate `ai_gloss_usage` lane — is written only by the SECURITY DEFINER RPCs, and
   those RPCs are executable only by `service_role`. ⚠ Grants bind the browser roles, **not the table
   owner** — the role Studio's table editor and the SQL editor run as. Production held 25 `ai_usage` rows
   with a negative `count` (min −99,999,938, written by cell edits; a negative count is `limit − count`
   uses, so it lifted that day's limit). So the value itself is a column CHECK,
   `ai_usage_count_nonnegative` / `ai_gloss_usage_count_nonnegative` (`count >= 0`), which every role
   meets; `17_ai_counters_never_negative_test.sql` asserts that every `count` column in `public` has a
   lower bound. To give an account more uses, set `profiles.plan` (or `DEV_USER_IDS`) — not `count`.
4. *(retired)* **Server-owned run-state** was the guarantee of the area-monitor tables, which were
   removed with that feature (`20261004150000_retire_area_monitors.sql`). The number is kept so that
   «guarantee 5» below still names the same thing.
5. **Community provenance is the server's.** An author writes the content of a post or comment; the
   name it appears under and the time it was posted are written by `tg_community_stamp_provenance`
   (INSERT) and are not in the UPDATE grant (#R801). A REST call that names `created_at` / `edited_at`
   / `id` is refused by the column grant; a forged `author_name` is overwritten.
6. **(anon-write-guard) `anon` inserts into nothing.** The last two tables it could write, `feedback` and
   `bug_reports`, lost their INSERT policy and grant (`20260930090000_anon_write_guard.sql`); a reader's
   report goes through the `reader-reports` Edge Function, which counts it against shared buckets.
   `14_anon_write_guard_test.sql` states this over the catalogue (every table in `public`), not over names.

Guarantees 1–3 are proven by the pgTAP tests (guarantee 5 is
`12_db_provenance_hardening_test.sql`, which simulates the prod default grant) — see [`DATABASE.md`](DATABASE.md#rls--permission-testing).

## Admin privileges

An admin is a `profiles` row with `is_admin = true`. There is no self-service path to it. To
grant it (Supabase Dashboard → SQL Editor, which runs as a privileged role):

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

`admin.html` then lets that account read feedback/bug reports and the client error record
(read-only), moderate community posts, and edit `geo_pins`/`dashboard_cards`.

## Auth relationship

- Providers: **Google OAuth** + email/password (Supabase Auth).
- The client uses the **anon/publishable key** (public by design — RLS protects every table).
  The `service_role` key is a **secret**, used only inside Edge Functions.
- Redirect URLs, OAuth client id/secret, JWT settings, and email templates live in the
  Supabase **dashboard**, not in migrations.

## Data classification (drives backup + retention)

- **A — critical, irreplaceable:** `profiles`, `ai_usage`, `ai_gloss_usage`, `user_prefs`, `favorites`, `saved_places`, `place_watches`,
  `saved_views`, `collection_shares`, `quest_daily_results`,
  `donations`, `feedback`, `bug_reports`, all `community_*`. User-generated / account data.
  ⚠ **`news_events`, `news_event_articles`, `news_cluster_decisions` and `saved_news_events`
  belong here too.** Re-fetching the feeds returns the articles; it does not return which articles
  an operator merged or split, why the clusterer chose what it chose, or what a reader saved.
- **B — regenerable:** `client_errors` (a 30-day operational record; losing it loses a history, and
  the next occurrence of a live defect recreates its row), `current_news` and `news_articles` (both re-fetched from the feeds),
  `news_event_i18n` (re-translatable, at the cost of translating again), `news_sources` /
  `news_source_feeds` (curated, but reproduced by the Source Registry seed migration), `account_data_catalog`
  (written by its migrations and nothing else), and
  largely `geo_pins` / `dashboard_cards` (curated, but reproducible from `admin.html` seeds).
- **C — must NOT be stored here:** service_role key, DB password, access tokens, raw JWTs,
  or any plaintext production dump. See [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md).

## Not reproducible via migrations (dashboard-only)

`supabase db pull` and this baseline capture schema, RLS, functions, triggers, grants. They do
**not** capture: OAuth provider config + secrets, auth redirect URLs, email templates, project
API keys, or the **vault secrets** the cron jobs send (`refresh_news_secret`,
`news_ingest_secret`). (The three Storage buckets ARE created by migrations, and so are the
`pg_cron` jobs — `20260925090000_cron_jobs_as_code.sql`, less the retired area monitors' job that
`20261004150000_retire_area_monitors.sql` unschedules; a job whose vault secret is absent posts
nothing.) Record those changes in [`MIGRATIONS.md`](MIGRATIONS.md) manually.

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

- **`00_structure_test.sql`** — every table exists, RLS is enabled on all **45**, key
  PKs/FKs exist, and `profiles_public` does not leak `email`/`is_admin` (and is not a view).
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
- **`07_r507_profiles_public_test.sql`** *(#R507)* — `profiles_public` is a table (relkind `r`)
  with RLS on and exactly one `SELECT USING (true)` policy; no role holds INSERT/UPDATE/DELETE/
  **TRUNCATE**; the sync function is SECURITY DEFINER with a pinned `search_path` and no client
  EXECUTE; and the sync actually syncs — backfill, rename, a `login_count` bump that must *not*
  disturb the card, a new signup, and an account deletion that takes the card with it. ⚠ The
  older files assert the **projection** (four columns, no `email`); every one of those assertions
  was also true of the SECURITY DEFINER view, which is why this file asserts the **mechanism**.
- **`11_definer_execute_test.sql`** *(multi-aspect-audit)* — no callable SECURITY DEFINER function in
  `public` is executable by `anon` unless an `anon`-facing RLS policy calls it (stated on `pg_proc` ×
  `pg_policies`, not on names), and the two RPCs that had inherited `anon` no longer do.
- **`12_db_provenance_hardening_test.sql`** *(db-provenance-hardening)* — ① every SECURITY DEFINER
  function in `public` pins a search_path with no schema a caller could create in (over `pg_proc` ×
  `pg_namespace` × `has_schema_privilege`); ② no `public = true` bucket has a SELECT policy anon or
  authenticated could list it through; ③ a post or comment signed as someone else, or dated in the
  future, is published under the author's card name at `now()` — through the real grant **and** under a
  simulated production blanket grant, with the no-name fallback and the service_role boundary;
  ④ the INSERT grant is exactly the columns the client sends.
- **`10_client_errors_test.sql`** *(client-error-log)* — the error record: RLS on; anon and a non-admin
  reader can neither read nor write it and cannot call `record_client_error`; an admin reads every
  row and cannot update one; the table has no column that could hold an IP, a user, a session, a
  query or a raw User-Agent (measured over `information_schema`, so a later column turns it red);
  a repeated fingerprint **adds to `count`** instead of adding a row; a full table refuses a new
  defect and still counts a known one; the purge removes exactly what was last seen 31 days ago.
- **`15_ai_turn_answers_test.sql`** *(atlas-stream-replay)* — the held answers: RLS on; claim → a duplicate
  is told `running` → finish → a retry's peek and a second claim return the **stored** answer; a failure
  is held with no body and the next claim runs it as attempt 2 after `failed`; a run past its lease is
  `abandoned` and claimed again; a superseded attempt can neither write nor renew; an expired answer is
  never returned and is swept; the owner reads only their own rows; no client role may call the RPCs,
  insert or update.
- **`22_atlas_notebook_test.sql`** *(atlas-os)* — the notebook on the account: RLS on, anon has nothing; the owner
  inserts, reads, updates and deletes their own entries and **cannot insert under another account** (WITH CHECK →
  DENIED); another account reads none and changes none; a payload over 1 MiB, a malformed id and an empty question
  are refused (23514); the 101st MiB of one account is refused as `notebook-account-full` and the refused batch
  writes nothing; `delete_account_data` removes the notebook through the foreign key.
- **`16_usage_counts_test.sql`** *(anonymous-usage-counts)* — the usage counters: RLS on; anon and a non-admin
  reader can neither read nor write them nor call `record_usage_counts` / the purge (anon not even the summary);
  an admin reads every row and cannot update one; the column set is exactly `(day, metric, dimension, count)`;
  a repeated row **adds to `count`**; at the per-metric daily ceiling a new dimension is refused and a known one
  still counts; a dimension the CHECK refuses rolls the whole request back; the purge removes exactly the day
  older than 400 days.
- **`28_map_corrections_test.sql`** *(community-next)* — map corrections: RLS on, no INSERT policy, no INSERT/SELECT
  for anon, nobody may rewrite the reader's message, the receipt hash or `resolved_at`; service_role inserts and the CHECKs
  refuse an unknown kind, a hash that is not 64 hex, a map link that is not the share fragment, a non-http(s) source, a
  latitude out of range and publishing an unanswered report; a non-admin reads, changes and deletes nothing but reads
  their own rows through `my_map_corrections`; an admin answers and publishes (not without a reply) and `resolved_at`
  follows the status; a receipt reads its own answer (spam as «closed», without the text), a stored hash is not a
  receipt; the public log holds only the published answer and the counts exclude spam; the purge keeps open, recent and
  published rows.
- **`18_org_inquiries_test.sql`** *(sales-channels)* — enquiries and supporters: RLS on both; `org_inquiries` has no
  INSERT policy and anon / authenticated hold no INSERT; anon cannot read it and a non-admin reader sees, changes and
  deletes nothing; service_role inserts, and the CHECKs refuse an enquiry without consent, with an unknown audience,
  an address without `@` or a non-http(s) website; an admin triages (status / note / handled_at) but cannot rewrite
  the message; everyone reads only the **listed** supporters (anon not `consented_at`), only an admin writes one,
  and `since_month` must be the first of a month; the purge removes spam past 30 days and rows past 730 and keeps the rest.
- **`27_org_inquiry_pipeline_test.sql`** *(sales-next)* — the pipeline columns of `org_inquiries`: they exist; a new
  enquiry starts as a `lead` with nothing due; the CHECKs refuse a stage that is not a declared word and a next step over
  300 characters; a non-admin moves no stage, an admin moves one and sets the next step; the grant names the pipeline's
  columns and still not the sender's message.
- **`14_anon_write_guard_test.sql`** *(anon-write-guard)* — ① a census over `pg_class` × `pg_policies`: no
  table in `public` accepts a direct INSERT from `anon` (an INSERT privilege on any column **and** either
  RLS off or an INSERT/ALL policy for `anon`/PUBLIC); ② `feedback` / `bug_reports` have no INSERT policy and
  no INSERT privilege for `anon` or `authenticated`, and a direct insert by either — even a signed-in reader
  naming itself — is DENIED; admin read/delete are unchanged; ③ service_role (the `reader-reports` path)
  still writes both, and the #R155 length ceiling still stands in front of it.
- **`23_account_data_center_test.sql`** *(account-data-center / my-places)* — ① the catalogue is complete in
  both directions over `_owned_by_user_cols()` (an owned table with no sentence turns it red); ② anon can read the
  catalogue and nothing else (no inventory, no export, no places, no save); the inventory and the export are the
  caller's alone, carry the admin-read rows that are the reader's own (`feedback`), and contain nothing of another
  account; ③ **what B can download is exactly what deletion removes** — the same tables, and the same per-table
  counts as `delete_account_data`'s report, in one transaction; ④ the seventh export in a row is refused by the
  fence; ⑤ `save_place()` is the only door in, the same position is one place (`created=false`), a re-save keeps
  what it was not given, a name and a position on the globe are required, the owner edits and deletes and cannot
  hand a place to another account or restamp `created_at`, another account sees and changes nothing, a full
  account is refused a new place (54000) and may still update one it holds.
- **`25_news_story_test.sql`** *(news-story)* — the headline's words are cut once (lower case, 3+ letters and digits,
  the possessive «s» is not a word, «Tromsø» is one); `news_story` returns the active events holding EVERY word inside the
  span and nothing for no words, more than six or a span over 62 days; `news_story_terms` counts df, the mid-sentence
  capitals of sentence-case headlines only and the pair counts, and returns no headline; both are SECURITY INVOKER.
- **`24_collection_workspace_test.sql`** *(collection-workspace)* — ① `save_view()` is the only way into `saved_views`;
  the same map with or without its `#` is one row (`created=false`); a fragment with no view and an empty name are
  refused; the owner edits a note but cannot rewrite the map, hand it to another account or touch another's; the fence
  refuses a new map (54000) and still lets a full account rename one; ② `publish_collection()` is the only way into
  `collection_shares`, publishing again returns the **same** token, «everything» is its own share, an empty collection is
  refused; the owner may retitle (only) and unpublish, another account sees and deletes nothing; ③ anon reads a
  published collection through `shared_collection()` — only that collection's places and maps, with no account id, row
  id or e-mail — and nothing for a malformed, never-published or unpublished token; anon has no privilege on either
  table and cannot save, publish or copy; ④ `copy_shared_collection()` adds what the reader does not hold, counts what
  they do, files it under the title with `source='shared'`, adds nothing the second time and leaves the owner's rows
  unchanged; ⑤ unpublishing kills the link and publishing again mints a new one; ⑥ the export and account deletion
  reach both tables (and with deletion every published link goes).

- **`29_map_documents_test.sql`** *(map-document-unify)* — ① `kind`, `steps`, `doc_md5` exist, one row per
  (account, document), the one-row-per-fragment constraint is gone; ② a map through the four-argument `save_view()` is the
  row it always was (steps NULL, identity = its fragment, twice = once) and a fragment with `mm=` is kind `map`; ③ a tour
  through the six-argument door keeps exactly `{state,title,say,ask}` per step, twice = once, a second tour on the same
  first map is a second row, and a mismatched first map, an unknown kind, a non-list, an empty list, a non-string word, a
  step that is not a map link and too many steps are refused by name; ④ `kind` and `steps` are not updatable in place and
  another account sees none; ⑤ anon reads a published tour's kind and steps (no account id, no `doc_md5`), a copy keeps
  them and a second copy adds nothing.

- **`17_ai_counters_never_negative_test.sql`** *(ai-usage-ledger-sign)* — ① over the catalogue: every base
  table in `public` with a `count` column carries a `CHECK (count >= n)`; ② the table owner (the role Studio
  runs as) cannot write a negative `count` into `ai_usage` or `ai_gloss_usage` — by UPDATE, by INSERT, or
  by the table editor's own `json_populate_record` statement (23514); ③ a refund at 0 stays 0 without an
  error; ④ a refund never gives back more than was charged: two refunds of one turn decrement once, a
  settled turn refunds nothing, a turn charged yesterday is refunded to yesterday's row.

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
