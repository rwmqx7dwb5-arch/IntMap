/* ============================================================================
 *  IntMap · Atlas — WHAT THE SELF-DIAGNOSIS CAN SEE OF ATLAS ITSELF   (atlas-os)      js/atlas-selfcheck.js
 * ----------------------------------------------------------------------------
 *  PRODUCT.md §4 items 17 and 20: IntMap diagnoses itself — and a new feature must reach Atlas without
 *  anyone remembering to wire it. `system.diagnose` checked the news feed, the layers and three public
 *  APIs. It could not see the three things that decide whether ATLAS works at all:
 *    · whether the capability registry the page booted with (js/atlas-capabilities.js, GENERATED ROWS)
 *      is the one the capability modules (js/atlas-cap-*.js, through js/atlas-caps-modules.js) declare —
 *      an entry added without `node scripts/atlas-caps.mjs --write` runs in the dispatch and is invisible
 *      to the planner and the search; `check:capabilities` catches it in CI, and THIS catches it on the page
 *      a reader is actually running (a stale deploy, a half-cached chunk);
 *    · whether the AI relay (supabase/functions/ai-proxy) answers at all;
 *    · whether every IntMapOS command that declares a toolbar button still HAS that button on the page.
 *  ⚠ «Could not observe» is its own answer here, never folded into «down» or «fine»
 *  (.agents/rules/one-pass-or-a-reason.md §5).
 * ==========================================================================*/

/** entries (js/atlas-caps.js capabilityEntries) against the registry the page booted with */
export function registryConsistency(entries, caps) {
  const out = { implementedUnregistered: [], registeredWithoutEntry: [], spellingDrift: [], entries: 0, registered: 0 };
  if (!Array.isArray(entries) || !caps || typeof caps.list !== 'function') return null;
  /* list() answers ids; each is resolved to its descriptor (an object in the list is taken as it is) */
  const reg = caps.list().map((x) => (typeof x === 'string' ? caps.resolve(x) : x)).filter((c) => c && !c.withdrawn);
  out.entries = entries.length; out.registered = reg.length;
  const byId = new Map(reg.map((c) => [c.id, c]));
  const entryIds = new Set();
  entries.forEach((e) => {
    entryIds.add(e.id);
    const c = byId.get(e.id);
    if (!c) { const r = caps.resolve(e.id); if (!(r && r.withdrawn)) out.implementedUnregistered.push(e.id); return; }
    if (String(e.row[1] || '') !== String(c.legacy || '')) out.spellingDrift.push({ id: e.id, entry: e.row[1], registry: c.legacy });
  });
  reg.forEach((c) => { if (!entryIds.has(c.id)) out.registeredWithoutEntry.push(c.id); });
  return out;
}

/** IntMapOS commands that declare a button (`meta.btn`) whose element is not in the document */
export function missingUiEntries(os, doc) {
  if (!os || typeof os.list !== 'function' || typeof os.meta !== 'function' || !doc || typeof doc.getElementById !== 'function') return null;
  const declared = os.list().map((id) => ({ id, meta: os.meta(id) || {} })).filter((c) => c.meta.btn);
  return { declared: declared.length,
    missing: declared.filter((c) => !doc.getElementById(String(c.meta.btn))).map((c) => ({ cmd: c.id, btn: String(c.meta.btn), label: String(c.meta.label || '') })) };
}

/* ══ IS THE AI RELAY THERE ═══════════════════════════════════════════════════════════════════════
   A request with the project's public key and no account. ai-proxy answers it with 401 {error:"auth"}
   BEFORE reading the body or touching the quota (supabase/functions/ai-proxy/index.ts, step 1), so the
   probe costs no AI call and no allowance, and a 401 with that body is the relay saying it is up.
   ⚠ A fetch that throws is NOT «down»: the browser hides the reason (offline, a blocked request, a
   gateway error without CORS headers all look the same from here), so it is reported as unobservable. */
export async function probeAiProxy(fetchFn, base, anonKey, timeoutMs) {
  const url = String(base || '').replace(/\/+$/, '');
  if (!url || typeof fetchFn !== 'function') return { state: 'unobservable', why: 'no-endpoint' };
  const t0 = Date.now();
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const to = ctl ? setTimeout(() => { try { ctl.abort(); } catch (_) { } }, timeoutMs || 8000) : null;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (anonKey) { headers.apikey = anonKey; headers.Authorization = 'Bearer ' + anonKey; }
    const r = await fetchFn(url + '/functions/v1/ai-proxy', { method: 'POST', headers, body: '{}', cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    let body = null; try { body = await r.json(); } catch (_) { body = null; }
    const ms = Date.now() - t0;
    if (r.status === 401 && body && body.error === 'auth') return { state: 'reachable', status: 401, ms };
    return { state: r.status >= 500 ? 'error' : 'answered', status: r.status, ms, error: body && body.error ? String(body.error) : '' };
  } catch (e) {
    return { state: 'unobservable', why: (e && e.name) || 'error', ms: Date.now() - t0 };
  } finally { if (to) clearTimeout(to); }
}
