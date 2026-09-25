# Monitoring IntMap

Two independent layers:

1. **Uptime (external / black-box)** — is the live site up? Runs in GitHub Actions, no
   third-party account required.
2. **Errors (in-browser / white-box)** — what broke in a real user's browser? IntMap's **own**
   error record (no external account): uncaught exceptions are sent to the `client-errors` Edge
   Function and kept, one row per distinct defect, for the **Errors** tab of `admin.html`. A
   ring buffer in the page keeps the last errors for the Bug Report tool as well.

## 1. Uptime monitoring

`.github/workflows/uptime.yml` runs every 6 hours (and on demand):

- `curl`s the production URL (`vars.PROD_URL` or the default GitHub Pages URL).
- Passes only if: HTTP **200**, the HTML contains the app shell (`id="map"`), and it is
  **not** a GitHub Pages 404 page.
- On failure it opens **one** deduplicated issue labelled `status:prod-down`.
- On the next success it comments “recovered” and **auto-closes** the issue.

### What it watches

- Production URL responds.
- HTTP status is healthy.
- The real app shell is served (not a blank page or a Pages error page).

### Notifications

- A GitHub **Issue** is created on outage (and you get GitHub's normal issue email /
  notification). The Actions run itself also fails, which shows in the Actions list.
- **Deduplication:** while an outage issue is open, further failing checks do **not** create
  new issues or comments — one issue per incident.
- **Auto-close:** the first passing check after recovery closes the issue automatically.

### Why GitHub Actions (not UptimeRobot / Better Stack)

- Zero new account, zero new vendor, free within Actions minutes (unlimited for public
  repos), and the alert lands where the code lives (GitHub Issues).
- A hosted monitor (UptimeRobot free / Better Stack free) is a fine **addition** if you want
  1-minute granularity or SMS — point it at the same URL. It is not required and is not set
  up here to avoid an unnecessary dependency.

### Optional: deeper browser-level uptime

The post-deploy job already opens the site in a real browser after every deploy. To also do
this on a schedule, run `playwright.prod.config.js` from a scheduled workflow — kept **out**
of the 6-hourly probe on purpose so the monitor stays cheap and cannot flood minutes.

## 1b. The aviation feed (#R341)

`supabase/functions/aviation-feed` is the ONE thing that reads an air-traffic provider on behalf of
every reader, so it is the one aviation thing worth watching. It reports its own state, in a channel
that returns no user data and no credentials:

```bash
curl -s 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/aviation-feed?meta=1'
```

| Field | What a bad value means |
|---|---|
| `provider` | which adapter answered. Silently falling back to `adsblol` when `AVIATION_PROVIDER=opensky` means `OPENSKY_AGREEMENT` or the credentials are missing |
| `world.aircraft` | how many aircraft the shared snapshot holds. **0 for a sustained period is the alarm** |
| `world.ageMs` | how old that snapshot is. Growing without bound means the sweeper (below) has stopped |
| `world.coveragePct` | how much of the tile lattice has ever been probed. ⚠ **Low is not a fault** — it is the honest state of a provider with no global endpoint (see [`AVIATION-DATA-SOURCES.md`](AVIATION-DATA-SOURCES.md) §1.1) |
| `upstream.rateLimited` | how many times the provider said stop. Rising steadily means the cadence is too fast for its budget |
| `upstream.saveFail` | the snapshot could not be written. The layer still serves, but every isolate starts cold again |
| `storage.hasServiceKey` / `hasAviationKey` | **presence only, never values.** Both false means the snapshot cannot persist at all |
| `backoffMs` | time left on a provider back-off |

**The sweeper** is `.github/workflows/aviation-sweep.yml`, every 5 minutes. It is the only caller
that pays for a lattice slice, and its "Report coverage" step prints the meta channel — so its run
log is a time series of the table above. A run that warns `aviation-feed refresh returned <code>`
is the provider or the function refusing; a long gap in the runs is the snapshot going stale while
readers are still served (correctly, with `x-intmap-age-ms` telling them how old it is).

⚠ **A REGION GOING TO ZERO IS NOT "NO AIRCRAFT THERE."** Separate provider failure, receiver
coverage, the tile lattice not having reached that sky yet, and a client-side filter before
concluding anything — that distinction is the whole reason `coveragePct` and the age headers exist.

## 1c. The CORS relay ladder (#R769)

> ⚠⚠ **(own-fetch-relay) THE PUBLIC LADDER THIS SECTION DESCRIBES NO LONGER EXISTS, AND THE PROBE WATCHES OUR
> OWN RELAYS INSTEAD.** `js/proxy-fetch.js` offers only this project's Edge Functions. Asked the old
> question (`https://example.com/`, which no relay of ours admits) the probe found no rung and called
> that `dead`, so the `ladder` job would have opened its issue every six hours. It now asks each of
> our relays for one real target: fetch-relay's rules and its article rule carry a `probe` URL in
> `_shared/fetch-relay-policy.js`, the specialised relays have one each in the script, and the relay
> each target goes to is asked of the page's own router. Verdicts: `ok`, `degraded` (an upstream's bad
> hour — no issue), `dead` (no relay of ours carried anything — exit 1, the issue opens), `none`
> (nothing routable — a code fact, exit 0, no issue; `tests/own-fetch-relay-checks` ⑤ fails
> first), `error` (the probe broke — exit 2, no issue). `node scripts/probe-relay-ladder.mjs --list`
> prints the targets and their relays without touching the network.
> Measured 2026-09-25 before fetch-relay was deployed: `RESULT degraded 4/10` — news-relay,
> quotes-relay, cable-geo, sv-cov carried theirs; fetch-relay answered 404 (not deployed) and
> gdelt-relay 502 (`upstream_unavailable`, GDELT's own 429).
> The rest of this section is kept as the record of why the public ladder was removed.

`js/proxy-fetch.js` is how every reader gets a document from a host that sends no ACAO header —
news feeds, article pages, share prices, GDELT. When our own Edge relay is cold or does not cover
the URL, it falls down a ladder of **public CORS relays**. That ladder is the second black-box
dependency worth watching, and until #R769 nobody was watching it.

```bash
node scripts/probe-relay-ladder.mjs                 # the ladder, as this build builds it
node scripts/probe-relay-ladder.mjs --json          # …and the same run as JSON
node scripts/probe-relay-ladder.mjs --target https://example.com/ --needle 'Example Domain'
```

The scheduled reader is the **`ladder` job in `.github/workflows/uptime.yml`** (same 6-hourly
schedule, and on demand). Its run log is the time series.

### Why the probe does not contain the list of relays

It **discovers** the rungs by evaluating `js/proxy-fetch.js`: `globalThis.fetch` is replaced with a
stub that records the URL it is handed and then rejects, `fetchViaProxy` is called once, and because
every rung fails the call walks the ladder to the bottom — so what comes back is the ordered list of
URLs *this build actually requests*. Then the stub is removed and those exact URLs are fetched for
real.

Copying the four endpoints into the probe would make a second list that goes stale exactly the way
the first one did (#R488 — a check that pins spelling keeps a dead rule green), and reading them out
of the source with a regexp cannot work either: the rungs are *functions*, one takes the URL raw
while the others encode it, and the order matters (#R505 — a check that reads source cannot see
evaluation).

The probe introduces itself with the production site's `Origin`, because **the origin is part of the
request** (#R216): with no `Origin` header corsfix answers `invalid_origin` (400), and with the
deployed one it answers `domain_not_registered` (403) — same relay, different fact, and only the
second is what a reader gets.

### Measured 2026-09-17 — all four rungs down at once

Against `https://example.com/`, a target whose availability is not in question, from
`Origin: https://rwmqx7dwb5-arch.github.io`:

| # | Relay | Status | Time | Body |
|---|---|---|---|---|
| 1 | `api.allorigins.win/raw` | **520 / 522** | 13.0–19.8 s | the upstream's own 5xx page |
| 2 | `corsproxy.io` | **401** | 0.04–0.11 s | `{"error":"A valid API key is required…"}` — the free tier ended |
| 3 | `proxy.corsfix.com` | **403** | 0.29–0.51 s | `{"corsfix_error":"domain_not_registered"}` — the domain must be registered with them |
| 4 | `api.codetabs.com/v1/proxy` | **522** | 19.4–19.8 s | Cloudflare, origin down |

`RESULT dead 0/4`. This is a photograph of 2026-09-17, **not a permanent fact** — the whole point of
the job is that the next photograph is taken automatically. The relay list itself had not been
re-measured since #R212/#R214/#R216, which is how it could stop being a ladder without anyone
noticing.

### ⚠ One dead rung is not an alarm

A ladder exists *because* rungs break: a free relay going down, rate-limiting an egress, or moving
behind an API key is the ordinary weather this list was built to survive. Paging a human for that
would teach everyone to ignore the page.

- at least one rung answers → `RESULT ok|degraded n/4`, script **exit 0**, nothing is reported;
- none answers → `RESULT dead 0/4`, script **exit 1** — the ladder has stopped being a ladder, and
  every caller can now only spend its full 20 s budget and return `null`.

**What the scheduled job does with that** is the same thing `probe` does with an outage: it opens
**one** deduplicated issue labelled `status:relay-ladder-down` (a label of its own — a dead relay is
not the production site being down), containing the `RESULT` line, each rung's status and the date
it was measured. As soon as any rung answers again it comments and **auto-closes** the issue.

⚠ **The run itself stays green, on purpose:** two of the four rungs are down for *permanent* reasons
(a paid API key, a domain registration), so failing the run would make this workflow red every six
hours for ever — and a permanently red alarm is an alarm nobody reads, which is noise added rather
than an instrument added. ⚠ The **script's** exit code is unchanged: run by hand it still exits 1 on
a dead ladder, because one caller's reporting choice must not bend what the tool means.

The probe's verdict is not "HTTP 200": a relay's own error envelope arrives with a status and a body
too (#R446 measured what it costs to treat one as the document). A rung is alive only when the
**target's** content came back through it.

⚠ The numbers above live **here and nowhere else**. Do not copy them into `AGENTS.md`,
`Architecture.md` or a source comment — a measurement written in two places is a measurement that
will disagree with itself.

## 1d. The production Atlas, evaluated nightly

`.github/workflows/atlas-eval.yml` (05:41 UTC, and on demand) asks the production Atlas the questions
earlier evaluation rounds recorded, judges each turn by the criteria those rounds used, and compares
the night with the previous report (`scripts/atlas-eval.mjs`; what it measures, the regression rule
and the one-time secret setup are in [`docs/TESTING.md`](TESTING.md) 「Atlas evaluation」).

- **The reader** is ONE issue titled **「Atlas evaluation (nightly) is red」**, rewritten with the latest
  report whenever a night is `regressed` (a fact got worse, or a recorded defect is back) or
  `unmeasured` (nothing could be measured — no session, a spent token, a page that did not boot), and
  closed by the next clean night. Never a comment a night — the same shape as `scripts/deep-alarm.mjs`.
- **A missing secret fails the run** and the issue says which one. This workflow is never dormant-and-green.
- The full report (JSON, Markdown, a screenshot per question) is the run's `atlas-eval-report` artifact
  (30 days), and it is also the next night's reference.
- ⚠ It costs real model calls every night, on the evaluation account's allowance.

## 2. Error monitoring

### Why it is our own record, not Sentry (client-error-log)

Error monitoring used to be a Sentry loader in `index.html`, dormant until a DSN was configured.
**No DSN was ever configured**, so for its whole life the loader returned on its first line: nothing
any reader's browser threw was recorded anywhere, and the only production signal was the six-hourly
probe above, which asks whether the page is *served*, not whether it *works*. The loader, its CSP
host (`browser.sentry-cdn.com`) and its setup instructions are gone. What replaced it needs no
account with anyone: the errors go to our own Supabase project.

### The path

```
window 'error' / 'unhandledrejection'
  → js/client-error-report.js          scrub, fingerprint, once per defect per page load, ≤ 10 per load,
                                        production origin only, navigator.sendBeacon (fetch keepalive fallback)
  → supabase/functions/client-errors   POST only, Origin allow-list, 64 KiB body, ≤ 10 reports per body,
                                        scrub AGAIN, fingerprint computed HERE, two shared token buckets
  → public.record_client_error         insert a new defect or add one to its count (row ceiling 10,000)
  → public.client_errors               one row per fingerprint: count, first_seen, last_seen,
                                        latest release / page path / browser, message, stack
  → admin.html → Errors                read-only table, newest first, stack behind a disclosure
```

- **One definition of a report, used on both sides:**
  `supabase/functions/_shared/client-error-shape.js`. The browser imports it to scrub *before*
  sending; the function imports the same file to scrub *again before storing* — a server that trusts
  a client's scrubbing stores whatever anyone POSTs. There is no copy to drift.
- **Fingerprint** = SHA-256 (first 32 hex digits) of the kind, the message with every number
  collapsed to `0`, and the top stack frame (file name + line:column). The same defect on the same
  build lands on one row however often it fires; a new build's bundle names give it a new row, which
  is how "first seen on this release" becomes readable.
- **Local previews never send** (the reporter is on only at `https://rwmqx7dwb5-arch.github.io`), so
  development and the test suite write nothing. The function still accepts `127.0.0.1` /
  `localhost` origins, so it can be exercised by hand against a local page.
- **No per-reader switch.** IntMap has no telemetry-consent setting to follow — the only switch of
  that kind, `window.INTMAP_ANALYTICS`, governs third-party analytics (off). What is sent carries no
  identity, and the privacy policy (§1, §6) states exactly what it is.

### What is recorded

The error **message** and **stack** (every web address cut to its path — no query, no fragment;
e-mail addresses, credential-shaped tokens, long quoted strings and long digit runs masked; cut to
500 / 4,000 characters), the **page path**, the **build** (`INTMAP_BUILD`), the **browser's name and
major version** (derived on the server from the User-Agent; the string itself is not kept), whether
it was an `error` or a `rejection`, and **how many times, first and last seen**.

### What is never recorded

- **No IP address.** The table has no column for one. The per-caller rate-limit bucket is keyed by an
  HMAC of the address under the service key, never the address.
- **No account, user id, session, cookie or token.**
- **No query string or fragment** — stripped from the page path and from every URL in the message
  and stack, on both sides of the wire.
- **Nothing typed** — Atlas input, search terms and form fields are never read; words that can slip
  into an exception message (e-mail addresses, long quoted strings) are masked.

`supabase/tests/10_client_errors_test.sql` measures the "no column for it" half over the catalogue,
so a later migration that adds such a column turns CI red.

### Retention

**30 days after a defect was last seen.** `public.purge_client_errors(30)` runs daily at 03:17 UTC
as the pg_cron job `client-errors-purge`, which the migration schedules itself (idempotently, and
only where pg_cron exists — it does in production). A defect that is still occurring keeps its row.

### Reading it

`admin.html` → **Errors** (admins only; the table grants an admin `SELECT` and nothing else).
Newest first; `Count` is every occurrence since first seen; release / page / browser are from the
latest occurrence; the stack is behind **Stack**.

### Always on in the page (no network)

`index.html` also keeps the **last ~25 runtime errors** in `window.__imErrors`
(`error` + `unhandledrejection`). The Bug Report tool attaches them automatically. This is
independent of the record above and sends nothing by itself.

### Bounds on the endpoint

`client-errors` takes writes from signed-out browsers, so it is bounded four ways (the numbers and
why each is where it is are in the function's own header, the canonical place):
the body ceiling and report count; the `Origin` allow-list (keeps other sites' pages out; not what
bounds a scripted caller); two shared token buckets in `public.relay_rate_buckets` — per caller
(30/hour) and project-wide (5,000/day, raised on purpose via `CLIENT_ERRORS_GLOBAL_PER_DAY`), both
**fail closed**; and a 10,000-row ceiling enforced inside `record_client_error`.

## Error classification (§8.5)

Not every failure is a product bug. `shapeReport()` in `_shared/client-error-shape.js` drops the
classes below before anything is sent or stored (the same list the Sentry filter used, moved there);
the uptime probe and `prod-smoke` apply the same idea:

| Class | Example | Treated as |
|-------|---------|-----------|
| IntMap code exception | `TypeError` in a handler | **Real** — recorded |
| External API transient | GDELT 503, Overpass 504 | Not a product bug — filtered |
| Rate limit | Open-Meteo 429 | Not a product bug — filtered |
| Network / offline | `Failed to fetch`, `ERR_*` | Not a product bug — filtered |
| User cancel / abort | `AbortError` | Filtered |
| Missing data / fallback | resolver "not found", handled fallback | Filtered |
| Blocked resource (tests) | `Could not load image` (hermetic block) | Filtered |
| Cross-origin / no information | `Script error.`, a non-Error rejection | Filtered |
| Browser extension | top frame in `chrome-extension://` etc. | Filtered |

## False positives

- **Uptime**: a single failed 6-hourly probe opens an issue; if the next probe passes it
  auto-closes. GitHub Pages propagation right after a deploy can cause one transient miss —
  the issue self-resolves. If you see flapping, widen the probe or lower the cadence.
- **Errors**: browser-extension noise (`ResizeObserver loop`, extension-injected scripts) and
  the transient classes above are filtered. If real crashes are being hidden, tighten the
  `BENIGN` list in `supabase/functions/_shared/client-error-shape.js` (one list, both sides).

## When something fires — order of checks

1. Is the **uptime issue** open, or is this an error spike in **admin.html → Errors**? (outage vs. bug)
2. Did it start right after a deploy? Compare `INTMAP_BUILD` / `build-info.json` `sha` with
   the last deploy.
3. Is it IntMap's code or an upstream provider? (check the stack / classification)
4. If it is a bad deploy → **roll back** ([`docs/INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md)).
5. Reproduce locally, fix, re-release ([`docs/INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md) §5–7 — there is no staging gate; CI green is the release).
