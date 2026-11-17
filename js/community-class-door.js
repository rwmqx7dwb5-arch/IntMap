/* IntMap · community-class-door — the browser's one way to the three server-only doors (security-review-nov):
   the Community maps directory (community_maps) and a student's class link (class_set_open, class_set_submit).
   The database grants those three to service_role only (supabase/migrations/20261117120000_security_review_nov.sql);
   the community-class Edge Function takes a per-caller token before it calls them. ⚠ THERE IS NO FALLBACK to the
   PostgREST RPC: the direct path is closed on purpose, and a client that tried it would only learn that.
   → { data, error } in the shape supabase-js gives a database call, so the callers read one shape:
     · the function's JSON on 2xx, and on a refusal that carries {ok:false,error} (a class 429 is {ok:false,error:'busy'});
     · error.code 'not_deployed' when the function is not there (404), 'unavailable' otherwise. */
export async function communityClassCall(DB, op, args) {
  const fx = DB && DB.functions;
  if (!fx || typeof fx.invoke !== 'function') return { data: null, error: { code: 'unavailable' } };
  try {
    const { data, error } = await fx.invoke('community-class', { body: { op, args: args || {} } });
    if (!error) return { data, error: null };
    const res = error.context;
    let body = null;
    try { body = res && typeof res.json === 'function' ? await res.json() : null; } catch (_) { body = null; }
    if (body && body.ok === false && typeof body.error === 'string') return { data: body, error: null };
    return { data: null, error: { code: res && res.status === 404 ? 'not_deployed' : 'unavailable' } };
  } catch (_) { return { data: null, error: { code: 'unavailable' } }; }
}
