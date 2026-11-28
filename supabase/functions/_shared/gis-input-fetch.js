// ============================================================================
//  IntMap · _shared/gis-input-fetch.js — read a GeoJSON file a durable job was pointed at, by the same rule gis-fetch applies
// ----------------------------------------------------------------------------
//  A server twin of the GIS (data.gis, atlas-server-caps.js) takes its inputs as inline GeoJSON or as the https address of a
//  GeoJSON file. The address is read under gis-fetch's PRINCIPLE (gis-fetch-policy.js relayableUrl), not a list of hosts: https on the
//  default port, no credentials, a name that resolves ONLY to public addresses (every redirect hop asked again), the body bounded in
//  bytes and never a web page. Nothing is forwarded but the URL. It reads DATA; it never executes or follows what the data says.
//
//    fetchGeoJson(url, { signal }) → { ok:true, json } | { ok:false, code, text }
//
//  WHOLE_MAX_BYTES is the bound gis-fetch itself uses for an answer fetched whole — one number, owned there.
//  ⚠ NO TYPE ANNOTATIONS.
// ============================================================================
import { fetchGuarded, publicHostname, resolvesPublic, RelayError } from "./relay-guard.js";
import { relayableUrl, WHOLE_MAX_BYTES, TIMEOUT_MS } from "./gis-fetch-policy.js";

export async function fetchGeoJson(raw, opts) {
  const o = opts || {};
  const t = relayableUrl(raw, publicHostname);
  if (!t.ok) return { ok: false, code: t.why, text: "That address cannot be read: " + t.why + "." };
  const clock = AbortSignal.timeout(TIMEOUT_MS);
  const budget = o.signal && typeof AbortSignal.any === "function" ? AbortSignal.any([o.signal, clock]) : clock;
  if (!(await resolvesPublic(t.url.hostname, { signal: budget }))) return { ok: false, code: "host_not_public", text: "That host does not resolve to a public address." };
  try {
    const r = await fetchGuarded(t.url.toString(), {
      maxBytes: WHOLE_MAX_BYTES, timeoutMs: TIMEOUT_MS, signal: o.signal, headers: { Accept: "application/geo+json, application/json" },
      allowRedirect: async (next) => { const s = relayableUrl(next.toString(), publicHostname); return s.ok && await resolvesPublic(s.url.hostname, { signal: budget }); },
    });
    if (!r.ok) return { ok: false, category: r.status === 429 || r.status >= 500 ? "transient" : undefined, code: "upstream_" + r.status, text: "The host answered " + r.status + "." };
    if (/text\/html/i.test(r.contentType)) return { ok: false, code: "upstream_is_a_page", text: "That address is a web page, not a data file." };
    let json;
    try { json = JSON.parse(r.text()); } catch (_) { return { ok: false, code: "not_json", text: "That address did not return JSON." }; }
    return { ok: true, json };
  } catch (e) {
    const code = e instanceof RelayError ? e.code : "upstream_unreachable";
    return { ok: false, code, category: code === "upstream_timeout" || code === "upstream_unreachable" ? "transient" : undefined, text: "The file could not be read (" + code + ")." };
  }
}
