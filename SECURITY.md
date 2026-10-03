# Security Policy — IntMap

> **Verified 2026-08-20 against `acc55b1`.** Every claim below was re-checked against the tree and
> against the live project on that date; the findings that could not be closed are listed as
> residual risks in [`docs/SECURITY-ARCHITECTURE.md §8`](docs/SECURITY-ARCHITECTURE.md).

IntMap is a static, client-side world-map web app — since #R175 a **Vite build** (`npm run
build` → `dist/`, which is what GitHub Pages publishes), not the repo tree — backed by
Supabase (Auth, Postgres + RLS, **twenty-two** Edge Functions) and many public read-only data APIs.
This document is the entry point for **reporting a vulnerability** and for the two facts
people most often get wrong about this project.

日本語: 脆弱性の報告方法と「公開前提の値」についてのまとめです。詳細な脅威モデルは
[`docs/SECURITY-ARCHITECTURE.md`](docs/SECURITY-ARCHITECTURE.md) を参照してください。

---

## Reporting a vulnerability

**Please report privately — do not open a public issue for a security bug.**

1. **The security page's form**: [`security.html`][site:security.html]
   (日本語: `ja/security.html`) → *Report a security problem*, which opens the contact form with
   **«A security problem (private report)»** chosen. The report is stored in `public.org_inquiries`, which
   only IntMap's administrators can read (RLS), and is answered by e-mail.
2. ⚠ **GitHub's Private Vulnerability Reporting is not enabled on this repository** (measured
   2026-10-03: `GET /repos/rwmqx7dwb5-arch/IntMap/private-vulnerability-reporting` → `{"enabled":false}`).
   Turning it on is a repository-setting change awaiting the owner's approval; until then the form above
   is the private channel. If neither works for you, open a **minimal** public issue that says only
   *"security report — please provide a contact"* with **no exploit details**.

You can also see, in the running app, every site your page has contacted and what IntMap says each is
sent: **Settings ▸ Privacy ▸ This page's connections** (`js/connections-panel.js`). A host there that the
statement does not name is worth reporting.

Please include: affected URL/file, a description, reproduction steps, and impact. Do **not**
include third-party personal data or run destructive/mass tests against production.

We aim to acknowledge within a few days and to fix P0/P1 issues promptly. Coordinated
disclosure is appreciated.

### In scope
- Stored/DOM XSS in the app or admin console.
- Auth / RLS / Edge-Function authorization bypass (reading or writing another user's data,
  privilege escalation, AI-quota or plan tampering, unauthenticated abuse of a protected
  Edge Function).
- Secret exposure (a **real** secret — see "not a vulnerability" below).
- SSRF / injection reachable from untrusted input.

### Not a vulnerability (please don't report these)
- **The Supabase publishable / anon key** (`sb_publishable_…`) in `src/vendor.js` (and therefore
  in the published bundle) and in `admin.html`.
  It is **designed to be public**; security is enforced by Row Level Security, column grants,
  the SECURITY DEFINER RPCs, and the Edge-Function auth — not by hiding this key. See the
  architecture doc. (A `service_role`/secret key committed anywhere **is** a vulnerability.)
- Rate-limiting / cost of the **public** read-only data APIs IntMap calls (they are third-party).
- Missing HTTP response headers that **GitHub Pages cannot set** (e.g. `X-Frame-Options`,
  HSTS, `Permissions-Policy`, a header-form CSP). These are documented limitations with the
  compensating in-page controls listed in `docs/SECURITY-ARCHITECTURE.md §CSP`. MEASURED on
  production 2026-08-20, `GET` of the production page returns
  `Strict-Transport-Security: max-age=31556952` and `Access-Control-Allow-Origin: *` from
  GitHub's edge and **no** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` or CSP header — the in-page `<meta>` policy is the whole of it.

---

## Supported versions
IntMap ships continuously from `main` (there is no release train). Security fixes land on
`main` and deploy from there. Only the current `main` is supported.

---

## How security is verified
Every PR runs, in CI:
- `npm run check:static` — syntax, committed-secret scan, SQL-PII guard, workflow least-
  privilege, and **action SHA-pinning**. The pinning rule is an **error**, and it covers
  `actions/*` and `github/*` too: it used to exempt them, which is where every remote action
  in this repo lives, so it had nothing to check.
- `node --test tests/security-logic.test.mjs` — the Edge-Function, service-worker, admin-console
  and CSP invariants, plus real unit tests of the constant-time compare and of the admin
  console's data-literal parser (the one that replaced `eval`).
- `tests/security.spec.js` (Playwright) — XSS payloads are neutralised in a **real browser**
  and i18n text still renders.
- `.github/workflows/security.yml` — **CodeQL** (JavaScript/TypeScript) SAST.
- `.github/workflows/db.yml` — **pgTAP** RLS / privilege / constraint tests against a
  throwaway Postgres (`supabase/tests/*_test.sql`).

Run locally: `npm test` (adds the browser suite). See
[`docs/TESTING.md`](docs/TESTING.md).

[site:security.html]: https://rwmqx7dwb5-arch.github.io/IntMap/security.html
