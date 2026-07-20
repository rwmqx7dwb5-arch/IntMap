# Area Monitors (#R141)

Saved, server-side **area watches** that re-check a user-selected region on a schedule
(even when the page is closed) and produce an **evidence-backed change report only when a
real change is detected**. News is the first data source; the collector layer is generic so
earthquakes/weather/fires/etc. can be added without schema churn.

This page is the **architecture + operations** reference. See `DEV-NOTES.md` → R141 for the
change log, and the inline `(#R141)` comments in the code.

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

## Data model (`supabase/migrations/20260721090000_area_monitors.sql`)

| table | who writes | RLS |
|---|---|---|
| `area_monitors` | the owner (create/edit/delete) + the runner | owner-only; UPDATE is a **column grant** that excludes the run-state columns (`running_since`, `last_*`, `run_count`) so a user cannot forge run metadata or touch the lock |
| `monitor_runs` | **service_role only** | owner **read-only** — run results cannot be forged |
| `monitor_evidence` | **service_role only** | owner **read-only** |
| `monitor_reports` | **service_role only** | owner **read-only**; `read` flips via the `monitor_mark_read` RPC (body stays client-immutable) |

- PKs are random UUIDs (never guessable sequential ids).
- `monitor_limit(user)` is the **per-plan cap** (free = 5, pro/plus = 25, admin/unlimited =
  200) enforced by a BEFORE INSERT trigger — this is the billing connection point.
- `monitor_claim_due(limit, stale_minutes)` claims due monitors with `FOR UPDATE SKIP LOCKED`
  so two concurrent cron ticks never process the same monitor (service_role only).

## Edge Function (`supabase/functions/monitor-run/`)

Deployed `--no-verify-jwt`; it does its own auth for **two modes**:

1. **Cron** — `x-monitor-secret: <MONITOR_SECRET>` header (constant-time compare, **fail-closed**:
   with the secret unset every request is refused). Claims up to 5 due monitors per tick.
2. **User "Run now"** — the UI POSTs the user's JWT + `{ "monitorId": "…" }`; the function
   verifies ownership and a 30 s manual cooldown, then runs just that one.

The pure comparison logic lives in `logic.mjs` (runtime-agnostic ESM) and is imported by both
the Deno function and the Node test (`tests/monitor-logic.test.mjs`) — the code under test is
the code that runs.

### Run status taxonomy

`success` · `success_no_change` · `partial` · `source_unavailable` · `ai_failed` ·
`timed_out` · `invalid_geometry` · `quota_exceeded` · `disabled` · `internal_error`.

## Deploy / operate

```bash
# 1. Deploy the function
supabase functions deploy monitor-run --no-verify-jwt --project-ref vpekfwdpurzejrrmacac

# 2. Set the shared secret (REQUIRED — the function is fail-closed without it).
#    The AI provider key is shared with ai-proxy and is already set.
supabase secrets set MONITOR_SECRET="$(openssl rand -hex 24)" --project-ref vpekfwdpurzejrrmacac
#    Optional kill-switch → mechanical-only, no AI reports:
#    supabase secrets set MONITOR_AI=off --project-ref vpekfwdpurzejrrmacac

# 3. Apply the migration to production (gated — needs the DB password; see docs/MIGRATIONS.md)
supabase db push
```

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
- Retention: newest 100 runs per monitor; evidence kept only for the newest 12 runs.

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
  forging of runs/evidence/reports, no tampering with the run lock, plan-limit enforcement,
  service-role claim. Runs in CI (`db.yml`).
- **Logic** — `tests/monitor-logic.test.mjs` (Node): point-in-circle/polygon, dedup, diff,
  clustering, change score, first-run vs no-change vs real-change decisions, evidence-id
  validation. Runs in CI (`ci.yml`).
- **Browser** — `tests/monitors.spec.js` (Playwright, hermetic): tab present, login gating,
  honest Atlas routing, geometry accessor, and a report rendering **XSS-inert**. Runs in CI.
