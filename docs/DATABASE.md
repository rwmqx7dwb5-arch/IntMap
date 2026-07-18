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

## Relationships

- `profiles.id`, `ai_usage.user_id`, `user_prefs.user_id`, `favorites.user_id`,
  `donations.user_id`, `feedback.user_id`, `bug_reports.user_id`, and every `community_*`
  `user_id` reference **`auth.users(id)`** (cascade on user delete; `donations`/`feedback`/
  `bug_reports` set null so a report survives account deletion).
- `community_comments.post_id`, `community_votes.post_id`, `community_reports.post_id` →
  `community_posts(id)`. `community_comments.parent_id` self-references (threads).
  `community_comment_votes.comment_id` → `community_comments(id)`.

## Functions & triggers

| Object | Kind | Notes |
|---|---|---|
| `public.is_admin()` | SECURITY DEFINER, `search_path=''` | Returns whether the JWT user is an admin. Used by admin-only policies without recursing into `profiles` RLS. |
| `public.handle_new_user()` + `on_auth_user_created` trigger on `auth.users` | SECURITY DEFINER | Creates the `profiles` row on signup (copies id/email/display_name). |
| `public.increment_ai_usage(uuid, integer)` | SECURITY DEFINER, `search_path=''` | Atomically consumes one AI use if under the limit. Returns `(used, allowed)`. EXECUTE = service_role only. |
| `public.refund_ai_usage(uuid)` | SECURITY DEFINER, `search_path=''` | Refunds one use after a failed provider call. EXECUTE = service_role only. |

Every SECURITY DEFINER function pins an empty `search_path` and schema-qualifies its objects,
so a caller cannot hijack it via their own search path.

## RLS model (the three security guarantees)

1. **PII is not world-readable.** `profiles` SELECT is owner-or-admin; the public
   `profiles_public` view exposes only `id/display_name/bio/avatar_url`. `feedback`,
   `bug_reports`, `donations`, `community_reports`, `ai_usage` are never readable by anon or
   by other users.
2. **No privilege escalation.** A user can update only the four safe profile columns (column
   grant), so they cannot set their own `is_admin`/`is_pro`/`plan`. Admin is granted only via
   SQL (below) or `service_role`.
3. **AI quota is tamper-proof.** `ai_usage` is written only by the SECURITY DEFINER RPCs, and
   those RPCs are executable only by `service_role`.

All three are proven by the pgTAP tests — see [`RLS-TESTING.md`](RLS-TESTING.md).

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
- **B — regenerable:** `current_news` (re-fetched every ~20 min by `refresh-news`), and
  largely `geo_pins` / `dashboard_cards` (curated, but reproducible from `admin.html` seeds).
- **C — must NOT be stored here:** service_role key, DB password, access tokens, raw JWTs,
  or any plaintext production dump. See [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md).

## Not reproducible via migrations (dashboard-only)

`supabase db pull` and this baseline capture schema, RLS, functions, triggers, grants. They do
**not** capture: OAuth provider config + secrets, auth redirect URLs, email templates, project
API keys, the `pg_cron` schedule that triggers `refresh-news`, or Storage bucket settings (none
today). Record those changes in [`MIGRATIONS.md`](MIGRATIONS.md) manually.
