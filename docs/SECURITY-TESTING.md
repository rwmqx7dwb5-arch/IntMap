# IntMap — Security Testing (#R138)

How to run the security checks, what each one proves, and how to add a case. Companion to
[`SECURITY-ARCHITECTURE.md`](SECURITY-ARCHITECTURE.md) (threat model) and
[`RLS-TESTING.md`](RLS-TESTING.md) (the DB harness in depth).

---

## Run everything

```bash
npm ci
npm test          # = static-checks  →  security-logic (node --test)  →  Playwright (browser)
```

The DB / RLS tests need Postgres and run in CI (`.github/workflows/db.yml`); locally they need
Docker + the Supabase CLI (`supabase db start && supabase db reset --local && supabase test db`).

## Run one layer

| Command | What it proves | Runtime |
|---|---|---|
| `npm run check:static` | no committed secrets, no SQL PII, workflows least-privilege, **third-party actions SHA-pinned**, valid JSON/YAML/JS/TS | Node only |
| `npm run test:security` (`node --test tests/security-logic.mjs`) | refresh-news is fail-closed / header-only / constant-time; ai-proxy needs a JWT + caps input + never logs secrets | Node only |
| `npx playwright test tests/security.spec.js` | XSS payloads stay **inert in a real browser**; `IntMapSafe.url` blocks bad schemes; i18n renders; CSP present | Chromium |
| `supabase test db` (or `db.yml` in CI) | RLS + privilege + the `feedback.rating` CHECK (pgTAP) | Postgres |
| CodeQL (`.github/workflows/security.yml`) | SAST for JS/TS (XSS, injection) → Security tab | CI |

---

## What each test file is

- **`scripts/static-checks.mjs`** — fast, dependency-light gate. Secret patterns (incl. a
  `service_role` JWT and provider keys), SQL-PII guard, destructive-migration detector,
  workflow permissions + **`action-pinning`** (third-party `uses:` must be a full 40-hex SHA;
  `actions/*` and `github/*` are GitHub-owned and may use tags), asset existence.
- **`tests/security-logic.mjs`** (`node:test`) — unit-tests the constant-time compare, then
  **reads the Edge-Function sources** and asserts their invariants so a future edit cannot
  silently reintroduce a fail-open guard, a URL-query secret, an unauthenticated ai-proxy, or
  an uncapped prompt/image. (No Deno runtime needed — this is the CI-friendly substitute.)
- **`tests/security.spec.js`** (Playwright) — loads the app, feeds the commission's exact XSS
  payloads through `IntMapSafe` **into the live DOM**, and asserts no script runs and no active
  `<img onerror>`/`<svg onload>`/`<script>` is created, in text **and** attribute contexts;
  checks scheme-blocking and i18n round-trip; checks the CSP meta.
- **`supabase/tests/03_security_test.sql`** (pgTAP) — the `feedback.rating` CHECK rejects the
  out-of-range DoS payload, `profiles_public` exposes no PII, public-read tables aren't
  anon-writable, `ai_usage` is RPC-only. (00/01/02 cover structure / the RLS matrix / the RPCs.)

---

## Adding a case

- **New XSS sink?** Route the untrusted value through `IntMapSafe.html()` (text/attr) or
  `IntMapSafe.html(IntMapSafe.url(v,{allowData}))` (href/src/style). Add its payload/context to
  `XSS_PAYLOADS` in `tests/security.spec.js` if it exercises a new context.
- **New Edge-Function auth rule?** Add an assertion to `tests/security-logic.mjs` (unit or a
  source regression guard).
- **New RLS / constraint?** Add to `supabase/tests/03_security_test.sql` using the existing
  pgTAP helpers (`throws_ok`/`lives_ok`/`ok`/`has_*_privilege`) — see 02 for the impersonation
  pattern (`set local role` + `request.jwt.claims`). Don't rewrite 00/01/02; add cases.

---

## The commission payload set (kept in sync with `tests/security.spec.js`)

```
<script>window.__xss = true</script>
<img src=x onerror="window.__xss = true">
<svg onload="window.__xss = true">
"><img src=x onerror=window.__xss=true>
</style><script>window.__xss=true</script>
x" onmouseover="window.__xss=true          (attribute breakout)
x' onmouseover='window.__xss=true          (single-quote breakout)
javascript:alert(1) · data:text/html,… · vbscript:… · java\tscript:…   (url() must return '')
```
Each must render as inert text; and 日本語 / Zürich / Москва / España / emoji / accents /
long place names must survive `html()` unchanged.
