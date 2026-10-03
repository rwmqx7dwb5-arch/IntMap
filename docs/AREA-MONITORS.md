# Area Monitors (#R141)

> ⚠ **WITHDRAWN, NOT DELETED — this feature currently has no user-facing entry point.**
> There is no Monitors tab, no workspace window and no Atlas route: the Atlas dispatch case
> exists only to answer `FEATURE_WITHDRAWN`. Everything below is still deployed and still runs —
> the module (`js/monitors.js`), `window.IntMapMonitors`, the `monitor-run` Edge Function, the
> five tables and the cron — because 一旦撤去 means it has to be able to come back. Read this
> page as "how it works and what to re-attach", not as "what a user can do today".
>
> **What a reader CAN do today is the product that replaced these entry points — Watched places**
> (`js/place-watch.js`, `Architecture.md` §18.1). It is designed against the reasons recorded
> below in §«Watched places», and it does not use anything on this page except the lesson.

Saved, server-side **area watches** that re-check a user-selected region on a schedule
(even when the page is closed) and produce an **evidence-backed change report only when a
real change is detected**. News is the first data source; the collector layer is generic so
earthquakes/weather/fires/etc. can be added without schema churn.

This page is the **architecture + operations** reference. See `DEV-NOTES.md` → R141 (initial)
and **R144** (audit hardening) for the change logs, and the inline `(#R141)`/`(#R144)` comments.

> **R144 hardening (audit fixes).** In production, Supabase's schema-wide default privileges
> grant every role full table access (RLS is the real protection), so R141's *column-level*
> UPDATE grant was a no-op in prod. R144 closes that and five other findings:
> a **BEFORE UPDATE trigger** (`tg_monitors_guard_state`) that freezes the run-state columns and
> server-owns `next_run_at` regardless of grants; a **long-lived `monitor_seen_items` ledger** so
> "past 30 days" really means 30 days; an **atomic `monitor_claim_one`** so two "Run now" clicks
> can't both run; **grounded reports** (headline/summary/gaps built from the authoritative diff,
> not AI free text); **every DB write error-checked** with atomic finalize RPCs; **deterministic**
> news ordering; and **`monitor_limit_self()`** so a user can't probe another user's plan.

## Design principle — code decides "changed?", the AI only explains

The pipeline is deliberately ordered so the AI is never asked whether something changed:

```
collect (per source) → normalize + dedup → snapshot → load baseline
  → MECHANICAL diff (new / gone / continuing, counts, clusters, publisher diversity)
  → change score (0..1)  → decideAI()
  → (only on a meaningful change) call the AI with the evidence + the diff
  → VALIDATE every evidence id the AI cited against THIS run's evidence
  → persist run + evidence + (maybe) report
```

- A **source-fetch failure is never "no change"** — it is `source_unavailable` (all sources
  down) or `partial` (some down, data kept).
- The AI is called **only** when there is a real, code-detected change above the monitor's
  sensitivity threshold; first runs establish a baseline (`insufficient_baseline`).
- Every factual claim in a report must cite evidence ids (`ev_1`…) that exist in that run's
  `monitor_evidence`. Claims citing a nonexistent id are dropped; a report with no grounded
  claim is rejected and recorded as `ai_failed` (snapshot + diff + evidence are still kept).
- **(#R144) The whole report is grounded, not just the claims.** The AI writes *only* the
  per-claim text (each cited to real evidence) and a bounded severity. `headline`, `summary`,
  and `unchanged` are **built in code** (`buildReport`) from the authoritative machine-computed
  diff numbers; `data_gaps` come only from sources that actually failed; `limitations` are fixed
  general caveats. There is no path for a fabricated headline, summary, or count to reach the UI.
- **(#R144) "new" is decided by the long-lived ledger, not a single snapshot.** An item counts
  as new only if its `dedup_key` is not already in `monitor_seen_items` within the lookback
  window (the comparison window for `baseline_window`, the news window for `previous_run`). This
  is cap-proof and deterministic: a re-appearing item, or one pushed past the fetch cap by newer
  arrivals, is never mistaken for a change. `gone` never scores and never calls the AI, so a
  cap-displaced item cannot manufacture a report.

## Data model

Migrations: `20260721090000_area_monitors.sql` (R141) + `20260721120000_area_monitors_hardening.sql` (R144).

| table | who writes | RLS |
|---|---|---|
| `area_monitors` | the owner (create/edit/delete) + the runner | owner-only; UPDATE is a **column grant** that excludes the run-state columns **and `next_run_at`**, backed by the `tg_monitors_guard_state` trigger (below) so the restriction holds even under Supabase's default full grants |
| `monitor_runs` | **service_role only** | owner **read-only** — run results cannot be forged |
| `monitor_evidence` | **service_role only** | owner **read-only** |
| `monitor_reports` | **service_role only** | owner **read-only**; `read` flips via the `monitor_mark_read` RPC (body stays client-immutable) |
| `monitor_seen_items` *(#R144)* | **service_role only** | owner **read-only**; the long-lived per-item ledger (one row per `dedup_key`) powering the "past N days" baseline + cap-proof novelty. Cascades on monitor/user delete |

- PKs are random UUIDs (never guessable sequential ids).
- `monitor_limit(user)` is the **per-plan cap** (free = 5, pro/plus = 25, admin/unlimited =
  200) enforced by a BEFORE INSERT trigger — the billing connection point. **(#R144)** its
  EXECUTE is now revoked from users (so a user cannot pass an arbitrary UUID to infer someone
  else's plan/admin state); the UI reads its own cap via **`monitor_limit_self()`**.
- `monitor_claim_due(limit, stale_minutes)` claims due monitors with `FOR UPDATE SKIP LOCKED`
  so two concurrent cron ticks never process the same monitor (service_role only).

### (#R144) Run-state guard, atomic claim & finalize (all service_role / trigger-owned)

- **`tg_monitors_guard_state`** — BEFORE UPDATE on `area_monitors`. For any caller that is not
  the service_role runner (or a trusted direct DB session), it pins `running_since`, `last_run_at`,
  `run_count`, `last_status`, `last_change_severity`, `last_report_id` to their OLD values and
  **server-recomputes `next_run_at`** (only on an enable or interval change, and never earlier than
  `last_run + interval`). This is grant-independent protection: a user can never hand-pick their
  execution time or forge run metadata, even though prod grants them full table UPDATE.
- **`monitor_claim_one(monitor, user, cooldown_s, stale_min)`** — the atomic manual claim: a single
  `UPDATE … WHERE (owner ∧ enabled ∧ lock-free-or-stale ∧ cooldown-elapsed) RETURNING`. Two
  concurrent "Run now" requests can never both succeed, and it can't race the cron claim (same row
  lock). Returns `{claimed, reason, monitor}` with an honest reason (`already_running`/`cooldown`/
  `disabled`/`not_found`).
- **`monitor_finalize` / `monitor_commit_report`** — finalize a run + (optionally) insert its report
  + update the monitor meta in **one transaction**. A partial DB failure rolls the whole thing back,
  so there is never a `report_generated=true` without a report, and the lock is always released.

## Edge Function (`supabase/functions/monitor-run/`)

Deployed `--no-verify-jwt`; it does its own auth for **two modes**:

1. **Cron** — `x-monitor-secret: <MONITOR_SECRET>` header (constant-time compare, **fail-closed**:
   with the secret unset every request is refused). Claims up to 5 due monitors per tick.
2. **User "Run now"** — the UI POSTs the user's JWT + `{ "monitorId": "…" }`; the function
   verifies ownership and a 30 s manual cooldown, then runs just that one.

The pure comparison logic lives in `logic.mjs` (runtime-agnostic ESM) and is imported by both
the Deno function and the Node test (`tests/monitor-logic.test.mjs`) — the code under test is
the code that runs.

**(#R144) The manual path now claims via `monitor_claim_one`** (atomic; ownership + enabled +
lock + cooldown in one statement) instead of a check-then-act sequence. News collection is
**deterministically ordered** (`order by pub_date desc, id asc` before the cap). Every DB write
is **error-checked**: a scaffold-insert failure aborts (lock released, no processing); an
evidence-write failure records a retryable failure and never reports success; the report path
commits atomically via `monitor_commit_report`, so a report-write failure leaves
`report_generated=false` with snapshot+diff kept.

### Run status taxonomy

`success` · `success_no_change` · `partial` · `source_unavailable` · `ai_failed` ·
`timed_out` · `invalid_geometry` · `quota_exceeded` · `disabled` · `internal_error`.
Internal run-outcome codes for partial-persistence failures (surfaced honestly, retried next
run): `scaffold_failed` · `evidence_failed` · `report_failed` (each stored as `internal_error`
with an `error_category`).

## Deploy / operate

```bash
# 1. Deploy the function
supabase functions deploy monitor-run --no-verify-jwt --project-ref vpekfwdpurzejrrmacac

# 2. Set the shared secret (REQUIRED — the function is fail-closed without it).
#    The AI provider key is shared with ai-proxy and is already set.
supabase secrets set MONITOR_SECRET="$(openssl rand -hex 24)" --project-ref vpekfwdpurzejrrmacac
#    Optional kill-switch → mechanical-only, no AI reports:
#    supabase secrets set MONITOR_AI=off --project-ref vpekfwdpurzejrrmacac

# 3. Apply the migrations to production via the Management API (no DB password needed).
#    NOTE: the baseline (20260718090000) is an unrecorded gap in the remote history
#    (it was applied via `migration repair` originally), so `db push` refuses. Apply
#    a NEW migration file directly, then record it — the R144 flow:
supabase db query --file supabase/migrations/20260721120000_area_monitors_hardening.sql --linked
supabase migration repair --status applied 20260721120000 --linked
#    (Validate first without committing by swapping the file's final `commit;` for `rollback;`
#     and running the same `db query --file` — a clean run proves it applies against live prod.)
```

Rollback: the migration is additive/idempotent; to remove it, drop the new objects
(`monitor_seen_items`, `trg_monitors_guard`, `tg_monitors_guard_state`, `monitor_claim_one`,
`monitor_finalize`, `monitor_commit_report`, `monitor_limit_self`) and restore the prior grant
(`grant update (…, next_run_at) on public.area_monitors to authenticated`). Prefer a forward fix.

### 4. Schedule the runner with pg_cron (same pattern as refresh-news)

Run this **once** in the Supabase SQL editor (pg_cron + pg_net are already enabled for
refresh-news). Replace `<MONITOR_SECRET>` with the value you set above. The secret travels in
a **header**, never in the URL:

```sql
select cron.schedule(
  'monitor-run-tick',
  '*/10 * * * *',                       -- every 10 minutes; each monitor's own interval (≥30 min) gates it
  $$
  select net.http_post(
    url     := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/monitor-run',
    headers := jsonb_build_object('Content-Type','application/json','x-monitor-secret','<MONITOR_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
```

To change the cadence later: `select cron.unschedule('monitor-run-tick');` then re-schedule.
A monitor only runs when `next_run_at <= now()`, so the 10-minute tick is just the granularity;
per-monitor frequency is set by `interval_minutes` (minimum 30).

## Cost control

- AI is skipped entirely when there is no meaningful change (most runs).
- Only **new** items are sent to the AI (deduped across the monitor's history).
- Per-run caps: ≤ 60 evidence rows stored, ≤ 40 new items sent to the AI, 110 s wall-clock
  budget per tick (unprocessed claims are released for the next tick), 55 s AI timeout.
- Per-user monitor cap (`monitor_limit`), 30-minute minimum interval, 30 s manual cooldown.
- Retention: newest 100 runs per monitor; evidence kept only for the newest 12 runs; **(#R144)**
  the `monitor_seen_items` ledger is kept for **45 days** (`RETAIN_SEEN_DAYS`) — this is the
  hard bound on the comparison window. The UI offers **"past 30 days"** (`MAX_SEEN_WINDOW_DAYS`),
  which is ≤ retention, so a 30-day comparison always has 30 days of history to reference. Do not
  offer a UI window longer than `RETAIN_SEEN_DAYS`.

## Data sources / privacy

- The news collector reads the existing server-refreshed `current_news` table (Google News
  RSS, already documented) and filters it to the monitor's geometry — **no new external data
  source** is introduced. Evidence stores the article's public link, title, publisher, subject
  location and observed time.
- A monitor stores the user's selected **geometry** (a circle center+radius, a drawn polygon,
  or a resolved region — simplified to ≤ 80 points/ring) and is visible only to its owner (RLS).
- The runner never fetches arbitrary user-supplied URLs (no SSRF surface); stored `source_url`
  values are scheme-validated (http/https only) and rendered through `IntMapSafe.url`.

## Tests

- **DB / RLS** — `supabase/tests/04_monitors_test.sql` (pgTAP): cross-user isolation, no
  forging of runs/evidence/reports, plan-limit enforcement, service-role claim. **(#R144)** it
  now **simulates the prod default grant** (`grant update … to authenticated`) and proves the
  guard **trigger** freezes run-state/`next_run_at` (value-unchanged, not merely DENIED);
  `monitor_claim_one` atomicity (single success, cooldown, disabled, stale-reclaim, owner-only,
  no cron/manual conflict); `monitor_limit_self` vs. the revoked `monitor_limit(uuid)`;
  `monitor_seen_items` RLS. Runs in CI (`db.yml`).
- **Logic** — `tests/monitor-logic.test.mjs` (Node): point-in-circle/polygon, dedup, diff,
  clustering, change score, decideAI, **(#R144)** `validateClaims` (fabricated-id rejection),
  `buildReport` (headline/summary/gaps from authoritative numbers only), `partitionByNovelty`
  (cap-proof + order-independent), `classifyDisappeared`. Runs in CI (`ci.yml`).
- **Browser** — `tests/monitors.spec.js` (Playwright, hermetic). ⚠ Its tab assertions are
  **inverted**: they prove the module, its API and its feed element are all still present *and*
  that **no route lands on the tab** (see the banner at the top of this file). Also: login gating,
  honest Atlas routing, geometry accessor, a report rendering **XSS-inert**, and **(#R144)** a
  **Workspace regression** test (the Monitors ws-window has a default rect → no clampRect throw).
  The tag-stripping regexes were replaced with an inert `DOMParser` (clears CodeQL
  `js/incomplete-multi-character-sanitization`). Runs in CI.

## Production verification (#R144)

Verified end-to-end on prod with a synthetic monitor (Europe), then cascade-deleted:
run #1 established the baseline (`success_no_change`, AI skipped `insufficient_baseline`, 60
ledger rows, **no report**); forcing novelty produced run #2 (`success`, AI used, report
generated, score 0.8) whose headline/summary were code-built from the authoritative numbers and
whose **29 evidence references across 9 claims were all real** (`bad_refs = 0`). A rolled-back
probe as the owner confirmed run-state/`next_run_at` UPDATE = **DENIED**, `monitor_limit(uuid)` =
**DENIED** / `monitor_limit_self()` = 5, and `monitor_claim_one` = `true:claimed` then
`false:already_running`. Deleting the synthetic user cascaded all rows back to zero.

## Watched places — the product built where the Area Monitors' entry points were

`Architecture.md` §18.1 is the current specification; this section is the reasoning and the part
that is **designed but not approved**.

### Why the entry points were withdrawn, and what answers each reason

The withdrawal was one line in a thirteen-item request (「Monitorsを一旦撤去」) and gave no reason
of its own. What the record shows the feature cost, and did not deliver, up to that day:

| What the record shows | Where | How Watched places answers it |
|---|---|---|
| A whole sidebar tab and a workspace window — in the round whose first request was 「携帯がまだ劇的に遅い」 | the withdrawal round; the window threw on every desktop start for a round because it had no default rect | No tab, no window. It lives in what the reader already has: a saved place, the account sheet, Atlas. The module is fetched only after sign-in, never on a signed-out reader's boot |
| The create form offered «sources»; only news existed | `COLLECTORS = { news }` | Four kinds on day one — earthquakes, weather warnings, volcano alert levels, news — each read from a feed the map already draws |
| A server run on a cron with a shared secret, and an AI call per detected change: a cost that grows with readers, for a sentence the code already had | §«Cost control» above | No server run, no cron, no secret, no AI. The page decides (`supabase/functions/_shared/place-watch.js`), and the digest is the records themselves with their sources |
| Saving never worked from the page until a later round: the client insert omitted `user_id`, and the feature had only ever been exercised as the service role | the «Could not save the monitor» report | One row per saved place through ordinary RLS doors; `user_id` is the database's (a trigger); pgTAP `26_place_watches_test.sql` runs every door **as the reader**, including the ones that must be refused |
| A run log, evidence and report tables to keep and prune | §«Data model» above | Nothing to keep but the settings and what the reader has seen (`place_watches.seen_keys`) |

### What the page cannot do: tell a reader whose IntMap is closed (Web Push — **awaiting approval**)

The page checks while IntMap is open. Telling a reader on a closed tab or a locked phone needs a
server to evaluate and a push service to deliver. Nothing below is implemented; each line is a
change that needs the operator's approval (an external service's configuration, a secret, and a
server run that costs per reader — `AGENTS.md` §5).

1. **Keys.** A VAPID key pair: the public key in the page, the private key as a Supabase secret
   (`WEB_PUSH_VAPID_PRIVATE`). Generating and storing a secret is a production configuration change.
2. **Subscriptions.** A `push_subscriptions` table (endpoint, p256dh, auth, user_id → auth.users,
   created_at), owner-only RLS, one row per device; a sentence in `account_data_catalog`; the
   privacy policy names the push service of the reader's browser (Apple / Google / Mozilla) as a
   recipient of the notification's text. The page asks for permission only when the reader presses
   «Notify me when IntMap is closed» — never on load.
3. **The evaluator.** A server run (an Edge Function on the existing pg_cron, every 10 minutes) that
   reads `place_watches`, reads USGS / `news_events` / the volcano relay, and runs **the same
   `_shared/place-watch.js`** — so the server and the page cannot disagree about what is new. It
   writes nothing but `seen_keys` of what it announced, and it calls **no model**.
   ⚠ Warnings are the one kind the server cannot read the same way: the page reads the warnings
   layer's own normalised records, which are assembled in the browser from per-agency feeds
   (`js/world-packs.js`). A server evaluator would need that normalisation moved to `_shared/`
   first; until then a push says nothing about warnings, and says so.
4. **The send.** Web Push with the VAPID signature from the evaluator; a 404/410 from the push
   service deletes that subscription row.
5. **Cost.** Per tick: one USGS read, one `news_events` query, one volcano relay read for all
   readers together, plus one push per new record. No AI. The function's invocations are the
   billable part (Supabase plan), which is why this is listed as an approval and not done.

