# Watched places — design notes (and the retired Area Monitors)

`Architecture.md` §18.1 is the current specification of **Watched places** (`js/place-watch.js`,
`supabase/functions/_shared/place-watch.js`, `public.place_watches`). This page holds the reasoning
behind it, the design rule it shares with the rest of IntMap, and the part that is **designed but not
approved** (Web Push). It keeps its old file name because migrations and code that cannot be edited
point here.

## The retired Area Monitors

Watched places was built where the **Area Monitors** used to be. That feature saved an area per account,
re-checked it on the server every ten minutes (pg_cron → an Edge Function), stored each run with its
evidence and an AI-written report, and had five tables of its own. Its entry points (the tab, the
workspace window, the widget card and Atlas's `monitor` action) were withdrawn first; **then all of it
was removed outright** (2026-10-04, approved by the user):
- removed: the page module and the `monitor-run` Edge Function;
- removed: the five tables (`area_monitors` and four `monitor_*` tables) and their ten functions;
- removed: the cron job and its vault secret — `supabase/migrations/20261004150000_retire_area_monitors.sql`
  drops what the database held.
Nothing of it runs any more. The original design is kept only in the migrations that created it
(`20260721090000_area_monitors.sql` and its hardening) and in git history.

## The design rule — code decides "changed?", a model never does

The Area Monitors' one lasting lesson, and the rule Watched places and the Atlas notebook follow:

- **Whether something is new or changed is decided by code**, from the records' own keys and numbers.
  A model is never asked whether something happened. (The Area Monitors used a model only to *explain*
  a change the code had already detected, and validated every evidence id it cited; Watched places asks
  no model at all — the digest is the records themselves, each with its source and link.)
- **A source that could not be read is never "no change".** It is reported as unavailable, with the
  reason, and what was already seen is kept so the next successful read does not call old items new.
- **"New" is decided against what was already seen, not against one previous snapshot**, so an item
  that reappears, or one pushed past a fetch cap by newer arrivals, is never mistaken for a change.

`js/atlas-notebook-store.js` (`diffResults`) and `supabase/functions/_shared/place-watch.js` cite this rule.

## Watched places — the product built where the Area Monitors' entry points were

`Architecture.md` §18.1 is the current specification; this section is the reasoning and the part
that is **designed but not approved**.

### Why the entry points were withdrawn, and what answers each reason

The withdrawal was one line in a thirteen-item request (「Monitorsを一旦撤去」) and gave no reason
of its own. What the record shows the feature cost, and did not deliver, up to that day:

| What the record shows | Where | How Watched places answers it |
|---|---|---|
| A whole sidebar tab and a workspace window — in the round whose first request was 「携帯がまだ劇的に遅い」 | the withdrawal round; the window threw on every desktop start for a round because it had no default rect | No tab, no window. It lives in what the reader already has: a saved place, the account sheet, Atlas. The module is fetched only after sign-in, never on a signed-out reader's boot |
| The create form offered «sources»; only news existed | the runner's collector table had one entry | Four kinds on day one — earthquakes, weather warnings, volcano alert levels, news — each read from a feed the map already draws |
| A server run on a cron with a shared secret, and an AI call per detected change: a cost that grows with readers, for a sentence the code already had | the runner's per-run caps and per-plan monitor cap | No server run, no cron, no secret, no AI. The page decides (`supabase/functions/_shared/place-watch.js`), and the digest is the records themselves with their sources |
| Saving never worked from the page until a later round: the client insert omitted `user_id`, and the feature had only ever been exercised as the service role | the «Could not save the monitor» report | One row per saved place through ordinary RLS doors; `user_id` is the database's (a trigger); pgTAP `26_place_watches_test.sql` runs every door **as the reader**, including the ones that must be refused |
| A run log, evidence and report tables to keep and prune | the five tables (now dropped) | Nothing to keep but the settings and what the reader has seen (`place_watches.seen_keys`) |

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
