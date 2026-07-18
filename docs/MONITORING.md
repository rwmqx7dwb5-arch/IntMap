# Monitoring IntMap

Two independent layers:

1. **Uptime (external / black-box)** — is the live site up? Runs in GitHub Actions, no
   third-party account required.
2. **Errors (in-browser / white-box)** — what broke in a real user's browser? A built-in
   ring buffer always; optional forwarding to **Sentry** when you enable it.

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

## 2. Error monitoring

### Always on (no setup)

`index.html` keeps the **last ~25 runtime errors** in `window.__imErrors`
(`error` + `unhandledrejection`). The Bug Report tool attaches them automatically, so a
silent failure is never invisible. This needs nothing and sends nothing anywhere.

### Optional: forward to Sentry

Dormant until you configure a DSN. When enabled, IntMap loads the Sentry browser SDK and
forwards **only its own uncaught exceptions**, with strict privacy scrubbing.

#### Why Sentry

- Purpose-built JS error monitoring with grouping, release tracking, and alerting.
- Free tier (~5k errors/month) is ample for this project.
- Works without source maps (you still get message + stack + release).
- The **DSN is publishable** (safe in client code) — distinct from the Sentry *auth token*
  used for uploading source maps, which is a secret and is **not** used here.
- IntMap already carries Google Analytics + Microsoft Clarity for usage analytics; those are
  not error monitors, so Sentry is complementary, not redundant.

#### Setup (about 5 minutes)

1. Create a free account at <https://sentry.io/> → **Create project** → platform
   **Browser JavaScript**. Copy the **DSN** (looks like
   `https://<publicKey>@o<org>.ingest.sentry.io/<projectId>`).
2. Enable it by adding **one line before** the app's scripts in `index.html` `<head>`,
   or a meta tag anywhere in `<head>`:

   ```html
   <script>window.INTMAP_SENTRY_DSN='https://<publicKey>@o<org>.ingest.sentry.io/<projectId>';</script>
   <!-- or -->
   <meta name="intmap-sentry-dsn" content="https://<publicKey>@o<org>.ingest.sentry.io/<projectId>">
   ```

   The DSN is **not a secret** — it is safe to commit. (If you prefer not to commit it, set
   it from a tiny untracked snippet; it must be present in the served HTML to take effect.)
3. Deploy. Trigger a test error from the browser console to confirm it arrives:

   ```js
   setTimeout(() => { throw new Error('IntMap Sentry test'); }, 0);
   ```

That's it. If the DSN is absent or the SDK CDN is unreachable, IntMap runs exactly as
before — the integration fails **open**.

### What is captured

Uncaught exceptions and unhandled rejections, plus: build/release (`INTMAP_BUILD`), the URL
**path** (no query string), coarse browser info, and the stack trace.

### What is NEVER sent (privacy — §8.4)

Enforced by `beforeSend` / `beforeBreadcrumb` in `index.html`:

- No Atlas input text, no news/search terms (console + UI-input breadcrumbs are dropped).
- No email, access tokens, Supabase session, API keys, or cookies.
- No `localStorage` contents.
- No precise geolocation (the geolocation context is deleted).
- No query strings or URL fragments (stripped from every event and breadcrumb URL).
- `sendDefaultPii: false`, and the `user` object is deleted from every event.

## Error classification (§8.5)

Not every failure is a product bug. The Sentry `beforeSend` filter drops the classes below
so they do not appear as crashes; the uptime probe and `prod-smoke` apply the same idea:

| Class | Example | Treated as |
|-------|---------|-----------|
| IntMap code exception | `TypeError` in a handler | **Real** — reported |
| External API transient | GDELT 503, Overpass 504 | Not a product bug — filtered |
| Rate limit | Open-Meteo 429 | Not a product bug — filtered |
| Network / offline | `Failed to fetch`, `ERR_*` | Not a product bug — filtered |
| User cancel / abort | `AbortError` | Filtered |
| Missing data / fallback | resolver "not found", handled fallback | Filtered |
| Blocked resource (tests) | `Could not load image` (hermetic block) | Filtered |

## False positives

- **Uptime**: a single failed 6-hourly probe opens an issue; if the next probe passes it
  auto-closes. GitHub Pages propagation right after a deploy can cause one transient miss —
  the issue self-resolves. If you see flapping, widen the probe or lower the cadence.
- **Errors**: browser-extension noise (`ResizeObserver loop`, extension-injected scripts) and
  the transient classes above are filtered. If real crashes are being hidden, tighten the
  `BENIGN` list in `index.html`.

## When something fires — order of checks

1. Is the **uptime issue** open, or is this a Sentry error spike? (outage vs. bug)
2. Did it start right after a deploy? Compare `INTMAP_BUILD` / `build-info.json` `sha` with
   the last deploy.
3. Is it IntMap's code or an upstream provider? (check the stack / classification)
4. If it is a bad deploy → **roll back** ([`docs/INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md)).
5. Reproduce on staging, fix, re-release.
