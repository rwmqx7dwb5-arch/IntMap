// ============================================================================
//  IntMap · _shared/web-render.js — the REAL browser tier behind web-browse, as pure logic  (real-browser-tier)
// ----------------------------------------------------------------------------
//  WHY. _shared/web-browse.js is a light browser: HTTP + HTML, no script, no picture. A page that is empty
//  until a script runs (`needsBrowser`), a page whose meaning is in its LAYOUT (a chart, a map, a dashboard),
//  and a page Atlas must LOOK at, need a real engine. Supabase Edge cannot run Chromium, so the engine is an
//  EXTERNAL browser service reached over HTTPS; this file is the adapter and the policy in front of it.
//
//  THE CONTRACT WITH THE LIGHT TIER. The answer is the same shape web-browse's snapshot already has
//  (`page.text / links / files / forms`, parsed by the SAME parser from the RENDERED DOM), plus `screenshot`.
//  The browsing state is the light tier's state, so `render` → `web.browse click` / `web.fetchFile` compose.
//  Network discovery uses a fresh provider browser and adds matching public
//  responses to those same geographic leads. The client names no provider.
//
//  WHAT THIS TIER NEVER DOES (a fact about the request, not a list of sites):
//   · READ-ONLY. The only thing sent is "load this URL and report". No click, no typing, no form submission,
//     no script of ours injected, no custom header, no cookie, no credential. A page whose purchase button
//     fires on load is the page's own defect — nothing here presses anything, so a send/buy/post cannot be
//     issued through it. (A stateless render API cannot hold a session: visual INTERACTION — click by
//     coordinates, type — is deliberately not offered; that needs a session engine and a human-level
//     confirmation policy first.)
//   · NO CREDENTIALS. A login wall / CAPTCHA / bot check is a `handoff`, exactly as in the light tier.
//   · SSRF. The address is judged HERE (http/https, default port, no userinfo, public host name, and a name
//     that resolves ONLY to public addresses). The fetch itself happens on the provider's network, which is
//     not IntMap's: no IntMap-internal host is reachable from it. The redirects the provider follows are NOT
//     visible to us — that residual is stated, not hidden (dev-notes/2026-11-20-real-browser-tier.md).
//   · PAGE TEXT IS DATA — same notice, same hidden-element drop (the parser is the light tier's).
//   · COST. Every render costs money. The shell (web-render action of the web-browse function) owns a kill
//     switch and a project-wide bucket that fails closed; this file only bounds ONE request.
//   · UNCONFIGURED IS A STATE, NOT A FAILURE TO HIDE. No secret → `render_unconfigured`, said plainly; no
//     request leaves, no money moves.
//
//  ⚠ NO TYPE ANNOTATIONS and no Deno globals (Node runs this under test with a fake provider).
// ============================================================================

import { RelayError } from "./relay-guard.js";
import { browseUrlAllowed, parseHtml, snapshotOf, refTable, handoffOf, cleanState, decodeBody, LIMITS } from "./web-browse.js";
import { observeRender } from "./web-render-network.js";

/* Bounds for ONE render. Each is an ESTIMATE (no live provider was measured — there is no contract yet):
   screenshot JPEG at 1280x800 q70 is typically 80–400 KB; the vision channel carries 3 images per call
   (js/atlas-view-capture.js SENT) so one render must stay small. Expires when the first live render
   measures real sizes/latency. */
export const RENDER_LIMITS = Object.freeze({
  timeoutMs: 40000,            /* provider navigation (≤ 25 s) + its own queueing; the whole exchange */
  gotoTimeoutMs: 25000,
  htmlBytes: 3 * 1024 * 1024,  /* same ceiling as the light tier's page */
  shotBytes: 1.5 * 1024 * 1024,
  viewports: Object.freeze({ desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }),
  jpegQuality: 70,
});

/* Resource types a reader cannot use here and that cost provider time. Media and fonts only: stylesheets and
   images stay (they ARE the layout the screenshot is for). */
export const REJECT_RESOURCE_TYPES = Object.freeze(["media", "font"]);

/* The adapters. One entry per provider; each says how to REQUEST and how to READ the answer. A provider is
   chosen by which secrets exist — the shell passes `cfg`. Adding one is adding an entry here. */
export const PROVIDERS = Object.freeze({
  cloudflare: Object.freeze({
    configured: (cfg) => !!(cfg && cfg.accountId && cfg.token),
    endpoint: (cfg) => "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cfg.accountId) + "/browser-rendering/snapshot",
    /* the request body: a URL and how to look at it — nothing else is ever sent */
    body: (u, o) => ({
      url: u.toString(),
      viewport: o.viewport,
      gotoOptions: { waitUntil: o.waitUntil, timeout: RENDER_LIMITS.gotoTimeoutMs },
      rejectResourceTypes: REJECT_RESOURCE_TYPES,
      screenshotOptions: { type: "jpeg", quality: RENDER_LIMITS.jpegQuality, fullPage: !!o.fullPage },
    }),
    headers: (cfg) => ({ authorization: "Bearer " + cfg.token, "content-type": "application/json" }),
    /* → { html, shotB64 } from the provider's JSON, defensively (the envelope is { success, result:{content,screenshot} }) */
    read: (j) => {
      const r = j && j.result;
      if (!j || j.success === false || !r || typeof r !== "object") return null;
      return { html: typeof r.content === "string" ? r.content : "", shotB64: typeof r.screenshot === "string" ? r.screenshot.replace(/^data:[^,]*,/, "") : "" };
    },
  }),
});

export function chooseProvider(cfg) {
  const kind = String((cfg && cfg.provider) || "cloudflare");
  const p = PROVIDERS[kind];
  return p && p.configured(cfg) ? { kind, p } : null;
}

/* How the caller's words map onto what we ask the provider. Unknown values fall back to the default — the
   request can never carry anything this function does not build. */
export function renderOptions(input) {
  const a = input || {};
  const viewport = RENDER_LIMITS.viewports[a.viewport === "mobile" ? "mobile" : "desktop"];
  return {
    viewport: { width: viewport.width, height: viewport.height },
    mobile: a.viewport === "mobile",
    waitUntil: a.wait === "load" ? "load" : "networkidle2",
    fullPage: a.fullPage === true,
    screenshot: a.screenshot !== false,
    networkAssets: a.networkAssets === true,
    textChars: a.textChars,
  };
}

function bytesOfB64(b64) { return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0); }

/* render(input, deps) → { ok, state, page?, screenshot?, handoff?, code?, say?, viaBrowser:true }
   input : { state?, url?, wait?:'load'|'networkidle', viewport?:'desktop'|'mobile', fullPage?, screenshot?, textChars?, networkAssets? }
           (url omitted → the page the light tier has open)
   deps  : { resolvesPublic(host,{signal}), fetch?, cfg:{provider?,accountId,token} } — the shell supplies the world */
export async function render(input, deps) {
  const a = input || {};
  const state = cleanState(a.state);
  const fail = (code, extra) => ({ ok: false, code, state, viaBrowser: true, ...(extra || {}) });
  const chosen = chooseProvider(deps && deps.cfg);
  if (!chosen) return fail("render_unconfigured", { say: "The real-browser tier has no provider configured, so no page was rendered." });

  const target = browseUrlAllowed(a.url ? String(a.url) : state.url);
  if (!target) return fail("not_allowed");
  const signal = AbortSignal.timeout(RENDER_LIMITS.timeoutMs);
  try {
    if (!(await deps.resolvesPublic(target.hostname, { signal }))) return fail("not_allowed");
    const o = renderOptions(a);
    let got;
    if (o.networkAssets) {
      if (!deps.openNetworkSocket) return fail("render_unreachable");
      try { got = await observeRender(target, o, { ...deps, signal, limits: RENDER_LIMITS }); }
      catch (e) {
        return fail(signal.aborted ? "upstream_timeout" : (e.code || "render_unreachable"));
      }
      if (got.code) return fail(got.code);
    } else {
      let res;
      try {
        res = await (deps.fetch || fetch)(chosen.p.endpoint(deps.cfg), { method: "POST", headers: chosen.p.headers(deps.cfg), body: JSON.stringify(chosen.p.body(target, o)), redirect: "error", signal });
      } catch (_e) { return fail(signal.aborted ? "upstream_timeout" : "render_unreachable"); }
      if (res.status === 401 || res.status === 403) { try { await res.body?.cancel(); } catch (_) { /* headers were enough */ } return fail("render_auth"); }
      if (res.status === 429) { try { await res.body?.cancel(); } catch (_) { /* headers were enough */ } return fail("render_busy"); }
      if (!res.ok) { try { await res.body?.cancel(); } catch (_) { /* headers were enough */ } return fail("render_failed", { status: res.status }); }
      let j = null;
      try { j = await res.json(); } catch (_) { j = null; }
      got = chosen.p.read(j);
      if (!got) return fail("render_failed");
    }

    const htmlBytes = new TextEncoder().encode(got.html);
    if (htmlBytes.length > RENDER_LIMITS.htmlBytes) return fail("upstream_too_large");
    const url = got.url || target.href;
    const page = parseHtml(decodeBody(htmlBytes, "text/html; charset=utf-8"), url);
    const ho = handoffOf(page, got.status || 200, null, url);
    if (!ho && got.assets) {
      const actual = new Set(got.assets.map(({ href }) => href));
      page.assets = [...got.assets, ...page.assets.filter(({ href }) => !actual.has(href))].slice(0, LIMITS.files);
      page.assetObservation = { status: got.coverage, matches: got.assets.length };
    }
    state.url = url; state.page = refTable(page);

    let screenshot;
    if (o.screenshot && got.shotB64) {
      const n = bytesOfB64(got.shotB64);
      if (n <= RENDER_LIMITS.shotBytes) screenshot = { mime: "image/jpeg", b64: got.shotB64, bytes: n, width: o.viewport.width, height: o.viewport.height, fullPage: o.fullPage || undefined };
    }
    const out = { ok: !ho, state, viaBrowser: true, provider: chosen.kind, page: snapshotOf(page, o), screenshot, screenshotOmitted: o.screenshot && !screenshot ? true : undefined,
      /* the light tier's `blank` counts <script> tags the PARSER saw; a rendered DOM keeps its scripts and has already run them — so blank here is just "no text, no links, no forms" after a real engine ran */
      stillBlank: (page.text.length < 40 && !page.links.length && !page.forms.length) || undefined };
    if (ho) { out.code = "handoff"; out.handoff = ho; }
    return out;
  } catch (e) {
    if (e instanceof RelayError) return fail(e.code, { status: e.status });
    return fail("render_unreachable");
  }
}
