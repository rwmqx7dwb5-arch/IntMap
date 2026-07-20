# IntMap — Security Architecture & Threat Model (#R138)

Authoritative description of IntMap's attack surface, trust boundaries, authentication /
authorization model, the public-vs-secret distinction, and the residual risks + manual
production settings. Companion to [`SECURITY.md`](../SECURITY.md) (reporting) and
[`SECURITY-TESTING.md`](SECURITY-TESTING.md) (how to run the checks). Keep this current when
the data flow, an Edge Function, or the auth model changes.

---

## 1. What we protect (assets)

| Asset | Where | Protected by |
|---|---|---|
| User account identity / session (JWT) | Supabase Auth; JWT in browser `localStorage` | Supabase Auth; **correct output-encoding** so XSS can't steal the token |
| Per-user private data (`favorites`, `user_prefs`, `donations`/`feedback`/`bug_reports` PII, `ai_usage`) | Postgres | **RLS** + column grants + SECURITY DEFINER RPCs |
| Admin capability (`profiles.is_admin`) | Postgres | RLS (`is_admin()`), no self-escalation (column grant) |
| Provider API keys (AI, etc.) | Edge Function env (server only) | Never sent to the browser; never logged |
| AI spend / quota | `ai_usage` + `ai-proxy` | JWT-gated proxy + atomic RPC; refresh-news fail-closed secret |
| Integrity of what every visitor sees | `index.html` render paths | **XSS output-encoding** (`window.IntMapSafe`) + CSP |

**Adversaries considered:** an anonymous internet user; a *logged-in* user attacking other
users or the platform (the most important one — they hold a valid JWT and can write their own
rows via the Supabase REST API, bypassing the UI); and an attacker who can edit **third-party
data IntMap renders** (OpenStreetMap nodes, a news headline that reaches Google News RSS, a
Nominatim place name). All three are assumed hostile.

---

## 2. Trust boundaries & data flow

```mermaid
flowchart LR
  subgraph Browser["Browser (UNTRUSTED code path — anyone can run it)"]
    UI["index.html / admin.html<br/>all app JS is INLINE"]
  end
  subgraph Untrusted["UNTRUSTED DATA SOURCES"]
    OSM["OSM / Overpass / Nominatim<br/>(world-editable)"]
    RSS["Google News RSS"]
    APIs["60+ read-only data/tile APIs"]
    AIout["AI model output<br/>(prompt-injectable)"]
    HASH["URL hash / share link"]
  end
  subgraph Supabase["Supabase (TRUST BOUNDARY = server)"]
    Auth["Auth (JWT)"]
    PG[("Postgres + RLS")]
    AIP["Edge fn: ai-proxy<br/>(verify_jwt, quota)"]
    RN["Edge fn: refresh-news<br/>(no-verify-jwt, SECRET)"]
  end
  Providers["AI providers<br/>(server-held key)"]

  UI -- "JWT (anon key + user token)" --> Auth
  UI -- "RLS-scoped reads/writes (anon key)" --> PG
  UI -- "JWT" --> AIP
  AIP -- "server key" --> Providers
  AIP -- "service_role: quota RPC" --> PG
  cron["pg_cron"] -- "x-refresh-secret header" --> RN
  RN -- "server key" --> Providers
  RN -- "service_role: write news" --> PG
  Untrusted -. "HOSTILE bytes rendered by UI" .-> UI
```

**The security rules that follow from this diagram:**
1. **Everything crossing into `UI` from `Untrusted` is hostile** and must be output-encoded
   before it touches the DOM (§4). The browser JS is not a trust boundary — an attacker can
   read and replay any request the page makes.
2. **Authorization lives on the server** (RLS, RPC EXECUTE grants, Edge-Function auth), never
   in the client UI. The admin console's client-side gate is UX only; the real boundary is
   RLS (proven by pgTAP).
3. **Secrets live only server-side** (Edge-Function env). The browser holds only the
   *publishable* anon key + the user's own JWT.

---

## 3. Authentication & authorization

- **AuthN:** Supabase Auth (email + Google/Apple OAuth). The session JWT is stored by the
  Supabase JS client in `localStorage` (its default; Supabase JS cannot use an httpOnly
  cookie). Consequence: **an XSS = token theft**, which is exactly why §4 is the priority.
- **AuthZ — data:** Postgres **Row Level Security** on all 15 tables + column-level UPDATE
  grants so a user can only touch their own rows and **cannot** set `is_admin`/`is_pro`/
  `plan`/`email` on their profile (no privilege escalation). See
  [`DATABASE.md`](DATABASE.md) / [`RLS-TESTING.md`](RLS-TESTING.md); enforced baseline in
  `supabase/migrations/20260718090000_baseline.sql`; attack cases in `supabase/tests/*_test.sql`.
- **AuthZ — AI quota:** `ai_usage` is writable **only** by the SECURITY DEFINER RPCs
  `increment_ai_usage` / `refund_ai_usage`, whose EXECUTE is granted to `service_role` only.
  A user cannot inflate/deflate their own quota.
- **AuthZ — admin:** `profiles.is_admin`, checked by the `is_admin()` SECURITY DEFINER
  function (with `search_path=''`) inside the admin-only RLS policies. `admin.html`'s login
  gate is convenience; a non-admin who loads it still gets **zero** rows from RLS.

---

## 4. Frontend XSS defense (the primary control)

Because the app is a single inline no-build file and holds the session token in
`localStorage`, **correct output-encoding at every sink is the primary XSS defense** (CSP is
secondary — see §6). All untrusted text now routes through one canonical, dependency-free,
globally-defined helper, `window.IntMapSafe` (defined in the first `<head>` script):

- `IntMapSafe.html(s)` — escapes `& < > " '`; safe in HTML **text** and single/double-quoted
  **attribute** contexts.
- `IntMapSafe.url(s, {allowData})` — allows **only** `http(s)` / `mailto` / `tel` (+ raster
  `data:image`, never SVG); `javascript:` / `data:text/html` / `vbscript:` / tab-obfuscated
  schemes → `''`. For a URL in `href`/`src`/`style`, wrap as `html(url(s))` (scheme-check
  then quote-escape).

**Sinks hardened this round** (all were confirmed reachable from attacker-controlled data):

| Surface | Field(s) | Trigger |
|---|---|---|
| Community feed | `community_posts.img` → `<img src>` | auto-fires on feed render (most severe) |
| Community map pin | `title` / `body` tooltip | hover a malicious pin |
| Profile card | another user's `avatar_url` → `background:url()` | view attacker's profile |
| News | RSS `title` / `publisher` / `name` (6 sinks: card, translate re-render, 2 tooltips, mobile popup) | render / hover / tap |
| News links | article `link` → `window.open` | http(s)-only guard |
| Live-camera popup | OSM-editable `url` → iframe/video/img/`href` | open a malicious webcam |
| Place search card | Nominatim `display_name` / `type` / `country` | search → click a result |
| Earthquake / POI | USGS `place`, POI `url` | defense-in-depth |

The **Atlas AI reply** pipeline was audited and found **already safe** (it escapes before
markdown formatting and forces `https?:` on links) — unchanged. Bundled first-party GeoJSON
popups (ecoregions, volcanoes) are trusted-source and out of scope. **URL hash / share
restore, GeoJSON file import, and error rendering were audited and are safe** (hash values are
consumed as numbers/dates/layer-ids, imported properties only feed MapLibre paint layers,
error messages are escaped).

Regression guards: `tests/security.spec.js` proves the payloads stay inert in a real browser;
CodeQL runs the JS XSS queries.

---

## 5. Edge Functions & `service_role` usage

| Function | `verify_jwt` | Auth | Uses `service_role` for | Provider key |
|---|---|---|---|---|
| `ai-proxy` | **true** | Supabase JWT (login required) → 401 | plan lookup + `increment/refund_ai_usage` RPC | server env only, never logged |
| `refresh-news` | false (by design) | **fail-closed shared secret** (`x-refresh-secret` header, constant-time) | write `current_news`, read `geo_pins` | server env only |

- **`ai-proxy`** verifies the user, resolves plan → daily limit, **atomically** consumes one
  use, calls the provider with the server-held key, refunds on failure, and caps input
  (`MAX_PROMPT=24000`, `MAX_IMAGES=4`). Errors are typed; **prompt / key / JWT are never
  logged** (metadata only). CORS is `*` but that is safe: every request needs a valid user
  JWT that a cross-origin site cannot obtain.
- **`refresh-news`** (#R138) is **fail-closed**: `REFRESH_SECRET` **must** be set or every
  request is refused (503) — it never runs publicly. The secret is read **only** from the
  `x-refresh-secret` header (never a URL query, so it can't reach access logs) and compared in
  **constant time**. Only `POST` triggers a run. This closes the previous fail-open design
  where an unset secret let anyone trigger paid AI + `service_role` DB writes. `service_role`
  bypasses RLS, so it is confined to these two server functions and never reaches the browser.

---

## 6. Browser security — CSP & the GitHub Pages limits

IntMap is served by **GitHub Pages**, which **cannot set custom HTTP response headers**, and
its app JS is **entirely inline** with no build step and fetches from **60+ external hosts**.
So a nonce/hash `script-src` or a `connect-src` allowlist is impossible without a build the
project forbids, and would break the app. The chosen posture:

- **In-page CSP (`<meta http-equiv>`), tested to not break the app** — `object-src 'none'`
  (no plugin XSS), `base-uri 'self'` (no `<base>` hijack), `frame-src 'self' https: blob:`
  (blocks a `javascript:`/`data:` iframe), `worker-src 'self' blob:`, and a `script-src`
  allowlist (self + the known CDNs + `'unsafe-inline'`/`'unsafe-eval'`, which are unavoidable
  for an inline no-build app) that still blocks an injected `<script src=evil-host>`.
  `connect-src`/`img-src`/`style-src` are intentionally left unrestricted so the data/tile
  APIs keep working. `<meta name="referrer" content="strict-origin-when-cross-origin">`.
- **Because `'unsafe-inline'` is unavoidable, output-encoding (§4) — not CSP — is the primary
  XSS defense.** The CSP is defense-in-depth.
- **Header-only controls GitHub Pages cannot provide** — `X-Frame-Options` / CSP
  `frame-ancestors` (clickjacking), HSTS, `Permissions-Policy`, a header-form CSP. Documented
  here as a residual limitation. Mitigations: IntMap performs no sensitive state-changing
  action by click alone that clickjacking would meaningfully abuse; all `target="_blank"`
  links carry `rel="noopener"` and every `window.open` passes `noopener` (no reverse
  tabnabbing); GitHub Pages is HTTPS-only in practice. If the site is ever moved behind a host
  that can set headers (e.g. Cloudflare), add `frame-ancestors 'self'` / `X-Frame-Options:
  SAMEORIGIN` / HSTS there.

---

## 7. External data & privacy

IntMap calls **60+ public, read-only** third-party APIs (map/satellite tiles, elevation/
weather, routing, statistics, news, geocoding, market data, live cameras, AI providers). The
**full, user-facing list with exactly what is sent** is in the in-app Privacy Policy
(`index.html`, "第三者 / Third parties"). Security-relevant notes:

- Some camera-list endpoints are fetched via **public CORS relays** (`corsproxy.io`,
  `allorigins.win`, `codetabs.com`) — the relay sees the request; no personal data is sent.
- **No PII in URL query strings**; error monitoring (Sentry, dormant) strips PII / tokens /
  query strings and only reports IntMap's own exceptions.
- Analytics: Google Analytics (gtag) + Microsoft Clarity load as third-party scripts
  (allowlisted in the CSP).

---

## 8. Residual risks (accepted / tracked)

1. **`'unsafe-inline'`/`'unsafe-eval'` in `script-src`** — unavoidable for an inline no-build
   app; mitigated by output-encoding (§4). Eliminable only by a build step (out of scope).
2. **JWT in `localStorage`** — Supabase JS default; mitigated by the XSS fixes. An httpOnly
   cookie would need a different auth transport.
3. **Header-only browser controls** not settable on GitHub Pages (§6).
4. **Public CORS relays** for some camera lists (§7) — third-party sees the request.
5. **AI content-sharing**: when the active provider is OpenAI, submitted text/outputs may be
   used by OpenAI to improve its models (disclosed in-app); users are told not to submit
   sensitive data.
6. **The unwired in-app article reader** (`openArticleInSidebar`, no caller) uses a
   `sandbox="allow-scripts allow-same-origin"` iframe; `escForReader` now quote-escapes so its
   attribute sinks are safe, but if it is ever re-wired, drop `allow-same-origin`.

---

## 9. Manual production settings (operator — cannot be set from code)

These are **not** applied by this PR. Apply them in the GitHub / Supabase dashboards. **Never
put a real secret value in the repo, a PR, or a log.**

### GitHub (repo → Settings)
- **Code security**: enable **Secret scanning** + **Push protection**; enable **Private
  vulnerability reporting**; confirm **Dependabot alerts** (config already in
  `.github/dependabot.yml`); **CodeQL** runs from `security.yml` (free for this public repo).
- **Branch protection / ruleset on `main`**: require PRs; require status checks **CI** (static
  + browser) and **Database checks** (and optionally **Security / CodeQL**) to pass; no direct
  pushes; keep **Actions default permissions = read** (workflows already set least privilege).

### Supabase (project `vpekfwdpurzejrrmacac`)
- **`refresh-news` — REQUIRED (this PR makes it fail-closed):**
  1. `supabase secrets set REFRESH_SECRET=<a long random value>` (do not paste the value
     anywhere in the repo).
  2. Update the pg_cron job to send the **header** `x-refresh-secret: <REFRESH_SECRET>` when it
     POSTs the function (header only — never `?secret=` in the URL). Example net.http_post
     call shape (secret injected from a secure setting, not literal):
     `select net.http_post(url:='https://<ref>.functions.supabase.co/refresh-news',
      headers:=jsonb_build_object('Content-Type','application/json','x-refresh-secret', current_setting('app.refresh_secret')));`
  3. Redeploy: `supabase functions deploy refresh-news --no-verify-jwt` (maintainer, gated).
     Until the secret is set + cron updated, news refresh is intentionally **off** (fail-safe).
- **Auth → URL Configuration**: confirm the production **Site URL** and **Redirect URLs** are
  the real production origins only (no wildcard, no stray localhost) to prevent open-redirect
  on OAuth.
- **Postgres version**: confirm `supabase/config.toml` `db.major_version` matches production
  (for faithful `db diff`).
- **Migrations**: apply `20260720120000_security_hardening.sql` via the gated flow in
  [`MIGRATIONS.md`](MIGRATIONS.md) (it is `NOT VALID` — safe against a pre-existing bad row;
  `VALIDATE CONSTRAINT` after confirming clean).
- **Backups**: register the backup secrets so `db-backup.yml` can run (see
  [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md)).

---

## 10. Reporting
See [`SECURITY.md`](../SECURITY.md).
