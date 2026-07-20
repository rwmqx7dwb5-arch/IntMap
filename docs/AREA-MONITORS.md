# Area Monitors (#R141)

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
- **Browser** — `tests/monitors.spec.js` (Playwright, hermetic): tab present, login gating,
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
