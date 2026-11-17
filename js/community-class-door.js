/* IntMap · community-class-door — the browser's one way to the three server-only doors (security-review-nov):
   the Community maps directory (community_maps) and a student's class link (class_set_open, class_set_submit).
   The database grants those three to service_role only (supabase/migrations/20261117160000_security_review_nov.sql);
   the community-class Edge Function takes a per-caller token before it calls them.
   ⚠ BY fetch, NOT supabase.functions: IntMap does not bundle the SDK's Functions client
   (src/supabase-unbundled-stub.js — tests/deps-runtime-majors-checks ④), so the call is a plain POST to
   <SUPABASE_URL>/functions/v1/community-class, as js/feedback.js reaches reader-reports. No credentials are sent:
   the function verifies no account (students have none).
   ⚠ THERE IS NO FALLBACK to the database's own endpoint: the direct path is closed on purpose.
   → { data, error } in the shape supabase-js gives a database call, so the callers read one shape:
     · the function's JSON on 2xx, and a refusal that carries {ok:false,error} (a class 429 is {ok:false,error:'busy'});
     · error.code 'not_deployed' when the function is not there (404), 'unavailable' otherwise.
   THE DEADLINE (no-ad-hoc-hardcoding §4): the function's limiter call is bounded at 3 s (_shared/rate-limit.js
   RPC_TIMEOUT_MS) and its database call at 8 s (community-class/index.ts), so 15 s covers both plus the round trip;
   a call that has not answered by then is reported as unavailable instead of leaving the panel waiting. Expires with
   those two bounds. */
const DEADLINE_MS = 15000;

export async function communityClassCall(DB, op, args) {
  const base = String((typeof globalThis !== 'undefined' && globalThis.SUPABASE_URL) || '').replace(/\/$/, '');
  if (!DB || !base || typeof fetch !== 'function') return { data: null, error: { code: 'unavailable' } };
  let res;
  try {
    res = await fetch(base + '/functions/v1/community-class', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'omit',
      signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(DEADLINE_MS) : undefined,
      body: JSON.stringify({ op, args: args || {} }),
    });
  } catch (_) { return { data: null, error: { code: 'unavailable' } }; }
  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }
  if (res.ok) return { data: body, error: null };
  if (body && body.ok === false && typeof body.error === 'string') return { data: body, error: null };
  return { data: null, error: { code: res.status === 404 ? 'not_deployed' : 'unavailable' } };
}
