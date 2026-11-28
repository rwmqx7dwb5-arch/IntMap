// One fresh Browser Run connection for a public render. An operated session is
// never attached, and only classification results leave this module.
import { browseUrlAllowed, geographicKind, LIMITS } from "./web-browse.js";
import { cdpClient } from "./web-session.js";

const MAX_HOSTS = 80;
const MAX_REQUESTS = 500;
const WAIT_MS = 12000;
// Eight 512-KiB JSON bodies fit within a 4-MiB per-target DevTools buffer.
// Larger, evicted, or unfinished responses remain unverified leads.
const JSON_PROBES = 8;
const JSON_BYTES = 512 * 1024;
const JSON_MIME = /^application\/(?:json|[a-z0-9.-]+\+json)(?:\s*;|$)/i;
const WEB_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CREDENTIAL_NAME = /(?:auth|token|signature|secret|password|credential|session|api.?key|^sig$|^key$|^x-amz-|^x-goog-)/i;
const PRIVATE_HEADER = /^(?:cookie2?|authorization|proxy-authorization)$|(?:api.?key|auth.?token|secret)/i;
const OMIT_KINDS = new Set(["image", "png", "jpg", "jpeg", "webp", "avif", "gif", "svg", "txt", "json", "download"]);
// Geographic protocol parameters whose values are needed to replay the observed
// URL. Unknown query fields may carry opaque credentials and are never returned.
const PUBLIC_QUERY = /^(?:service|version|request|f|format|outputformat|bbox|bboxsr|crs|srs(?:name)?|layers?|typenames?|styles?|width|height|tilematrix(?:set)?|tilerow|tilecol|limit|offset|resultoffset|resultrecordcount|startindex|count|returngeometry|outsr|insr|geometrytype|outfields|transparent|datetime)$/i;

function anonymousUrl(raw) {
  const url = browseUrlAllowed(raw);
  if (!url || [...url.searchParams.keys()].some((key) => CREDENTIAL_NAME.test(key))) return null;
  return url;
}

function hasCredentials(headers) {
  return Object.keys(headers || {}).some((name) => PRIVATE_HEADER.test(name));
}

function structuredGeographicJson(body, base64Encoded) {
  if (typeof body !== "string" || body.length > Math.ceil(JSON_BYTES * 4 / 3) + 4) return null;
  let j;
  const bytes = base64Encoded ? Uint8Array.from(atob(body), c => c.charCodeAt(0)) : new TextEncoder().encode(body);
  if (bytes.length > JSON_BYTES) return null;
  try { j = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { return null; }
  const isFeature = f => f?.type === "Feature" && Object.hasOwn(f, "geometry");
  if (isFeature(j) || (j?.type === "FeatureCollection" && Array.isArray(j.features) && j.features.every(isFeature))) return "geojson";
  if (j?.type === "Topology" && Array.isArray(j.arcs) && j.objects && typeof j.objects === "object") return "topojson";
  return false;
}

export async function observeRender(target, options, { cfg, resolvesPublic, openNetworkSocket, signal, limits }) {
  if (!anonymousUrl(target.href)) return { code: "not_allowed" };
  const endpoint = "wss://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cfg.accountId) + "/browser-run/devtools/browser?keep_alive=10000";
  const cdp = cdpClient(await openNetworkSocket(endpoint, { authorization: "Bearer " + cfg.token }, signal));
  const close = () => cdp.close();
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) close();
  const hosts = new Map([[target.hostname, Promise.resolve(true)]]);
  function publicHost(hostname) {
    if (!hosts.has(hostname) && hosts.size < MAX_HOSTS) hosts.set(hostname, resolvesPublic(hostname, { signal }).catch(() => false));
    return hosts.get(hostname);
  }

  const requests = new Map(), wire = new Map(), replies = new Map(), guarded = new Set();
  const finished = new Set();
  let limited = false, documentStatus = 0;
  let root, mainFrame;
  // Observe the request before it is sent, then require a successful HTTP
  // response for the same URL and request ID. Redirect hops are judged anew.
  cdp.on("Fetch.requestPaused", async ({ request = {}, requestId, networkId, resourceType }, sid) => {
    if (!guarded.has(sid)) return;
    const url = anonymousUrl(request.url);
    const allow = !signal.aborted && WEB_METHODS.has(request.method) && !hasCredentials(request.headers) &&
      resourceType !== "Media" && resourceType !== "Font" && url && await publicHost(url.hostname);
    const id = sid + ":" + networkId;
    if (networkId) {
      requests.delete(id);
      if (allow && request.method === "GET") {
        if (requests.size < MAX_REQUESTS) requests.set(id, url.href);
        else limited = true;
      }
    }
    await cdp.send(allow ? "Fetch.continueRequest" : "Fetch.failRequest", allow ? { requestId } : { requestId, errorReason: "BlockedByClient" }, sid).catch(() => {});
  });
  cdp.on("Fetch.authRequired", ({ requestId }, sid) => {
    if (guarded.has(sid)) cdp.send("Fetch.continueWithAuth", { requestId, authChallengeResponse: { response: "CancelAuth" } }, sid).catch(() => {});
  });
  cdp.on("Network.requestWillBeSentExtraInfo", ({ requestId, headers }, sid) => {
    if (!guarded.has(sid)) return;
    const id = sid + ":" + requestId;
    if (wire.size >= MAX_REQUESTS && !wire.has(id)) { limited = true; return; }
    // CDP may report the actual outgoing headers after the response event. On
    // redirects, any credential-bearing hop disqualifies that request ID.
    wire.set(id, wire.get(id) === false ? false : !hasCredentials(headers));
  });
  cdp.on("Network.responseReceived", ({ requestId, response, type, frameId }, sid) => {
    if (sid === root && type === "Document" && frameId === mainFrame) documentStatus = response.status;
    const id = sid + ":" + requestId;
    const requested = requests.get(id);
    requests.delete(id);
    if (!requested || response.status < 200 || response.status >= 300 || response.fromServiceWorker || hasCredentials(response.requestHeaders)) return;
    const url = anonymousUrl(response.url);
    if (!url || requested !== url.href || [...url.searchParams.keys()].some((key) => !PUBLIC_QUERY.test(key))) return;
    const kind = geographicKind(url, response.mimeType);
    const genericJson = (type === "XHR" || type === "Fetch") && (!kind || kind === "json") && JSON_MIME.test(response.mimeType);
    if ((!genericJson && (!kind || OMIT_KINDS.has(kind))) || /^(?:text\/html|application\/xhtml)/i.test(response.mimeType)) return;
    // Other protobuf resources such as map glyphs share the file extension.
    if (kind === "pbf" && !/(?:\.osm|\/\d+\/\d+\/\d+)\.pbf$/i.test(url.pathname)) return;
    if (replies.size === MAX_REQUESTS) { limited = true; return; }
    replies.set(id, { href: url.href, kind, requestId, sid, genericJson });
  });
  cdp.on("Network.loadingFailed", ({ requestId }, sid) => requests.delete(sid + ":" + requestId));
  cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }, sid) => {
    const id = sid + ":" + requestId;
    requests.delete(id);
    if (replies.get(id)?.genericJson && encodedDataLength <= JSON_BYTES) finished.add(id);
  });

  async function guard(sid) {
    guarded.add(sid);
    const send = (method, params) => cdp.send(method, params, sid);
    await send("Network.enable", { maxResourceBufferSize: JSON_BYTES, maxTotalBufferSize: JSON_BYTES * JSON_PROBES });
    await send("Network.setBypassServiceWorker", { bypass: true });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }], handleAuthRequests: true });
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  }
  cdp.on("Target.attachedToTarget", ({ sessionId, waitingForDebugger }, parent) => {
    if (!guarded.has(parent)) return;
    // Cross-process iframe and worker targets start suspended. A target that
    // cannot be guarded stays suspended until the one-use browser is closed.
    guard(sessionId).then(() => waitingForDebugger && cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId)).catch(() => { limited = true; });
  });

  async function capture() {
    const targets = (await cdp.send("Target.getTargets")).targetInfos;
    const tab = targets.find(({ type, url }) => type === "page" && url === "about:blank") || await cdp.send("Target.createTarget", { url: "about:blank" });
    root = (await cdp.send("Target.attachToTarget", { targetId: tab.targetId, flatten: true })).sessionId;
    const send = (method, params) => cdp.send(method, params, root);
    await guard(root);
    await send("Page.enable");
    await send("Page.setLifecycleEventsEnabled", { enabled: true });
    mainFrame = (await send("Page.getFrameTree")).frameTree.frame.id;
    await send("Emulation.setDeviceMetricsOverride", { ...options.viewport, deviceScaleFactor: 1, mobile: options.mobile });

    const lifecycle = new Map();
    let completed;
    const wanted = options.waitUntil === "load" ? "load" : "networkIdle";
    cdp.on("Page.lifecycleEvent", ({ frameId, loaderId, name }, sid) => {
      if (sid !== root || frameId !== mainFrame || (name !== "load" && name !== wanted)) return;
      const seen = lifecycle.get(loaderId) || new Set();
      seen.add(name);
      lifecycle.set(loaderId, seen);
      completed?.();
    });
    const nav = await send("Page.navigate", { url: target.href });
    if (nav.errorText || !nav.loaderId) return { code: "render_failed" };
    await new Promise((resolve) => {
      const timer = setTimeout(() => { limited = true; resolve(); }, WAIT_MS);
      completed = () => {
        const seen = lifecycle.get(nav.loaderId);
        if (seen?.has("load") && seen.has(wanted)) { clearTimeout(timer); resolve(); }
      };
      completed();
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    const url = anonymousUrl((await send("Page.getFrameTree")).frameTree.frame.url);
    if (!url || !(await publicHost(url.hostname))) return { code: "not_allowed" };
    const result = await send("Runtime.evaluate", {
      expression: `document.documentElement.outerHTML.slice(0,${limits.htmlBytes + 1})`, returnByValue: true,
    });
    if (typeof result.result?.value !== "string" || !documentStatus) return { code: "render_failed" };

    let shotB64;
    if (options.screenshot) {
      const shot = { format: "jpeg", quality: limits.jpegQuality };
      try {
        if (options.fullPage) {
          const { cssContentSize: { width, height } } = await send("Page.getLayoutMetrics");
          // Limit the capture before encoding as well as the returned bytes.
          if (width * height <= 16000000) Object.assign(shot, { captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
        }
        if (!options.fullPage || shot.clip) shotB64 = (await send("Page.captureScreenshot", shot)).data;
      } catch (_) { /* a screenshot is optional */ }
    }
    const assets = new Map(), generic = new Map();
    for (const [id, asset] of replies) {
      if (!wire.get(id) || assets.has(asset.href)) continue;
      if (asset.genericJson) {
        if (!generic.has(asset.href) || finished.has(id)) generic.set(asset.href, { id, asset });
        continue;
      }
      if (assets.size === LIMITS.files) { limited = true; break; }
      assets.set(asset.href, { href: asset.href, kind: asset.kind, via: "network-response" });
    }
    const pending = [...generic.values()].filter(({ asset }) => !assets.has(asset.href));
    const probes = pending.filter(({ id }) => finished.has(id)).slice(0, JSON_PROBES);
    let unverifiedJson = pending.length - probes.length;
    const confirmed = await Promise.all(probes.map(async ({ asset }) => {
      try {
        const body = await cdp.send("Network.getResponseBody", { requestId: asset.requestId }, asset.sid, 1500);
        return { href: asset.href, kind: structuredGeographicJson(body.body, body.base64Encoded) };
      } catch (_) { return { kind: null }; }
    }));
    for (const { href, kind } of confirmed) {
      if (kind === null || (kind && assets.size === LIMITS.files)) unverifiedJson++;
      else if (kind) assets.set(href, { href, kind, via: "network-response" });
    }
    return { html: result.result.value, shotB64, url: url.href, status: documentStatus, assets: [...assets.values()],
      coverage: limited || unverifiedJson ? "partial" : "observed", unverifiedJson };
  }

  try { return await capture(); }
  finally {
    signal.removeEventListener("abort", close);
    if (!signal.aborted) await cdp.send("Browser.close", {}, undefined, 1000).catch(() => {});
    close();
  }
}
