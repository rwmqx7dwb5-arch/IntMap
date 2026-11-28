// ============================================================================
//  IntMap · _shared/web-browse.js — the light browser Atlas drives, as pure logic  (web-browse)
// ----------------------------------------------------------------------------
//  WHAT THIS IS. Atlas had the model provider's web search and IntMap's own fetchers, and nothing that
//  could OPERATE a site: search a municipal open-data portal, narrow by a filter, follow a link to a
//  dataset page, take the CSV. A browser page cannot do it itself (no Access-Control-Allow-Origin on
//  those portals — measured 2026-11-20 on data.go.jp), so the work happens here, server-side, and the
//  Edge Function supabase/functions/web-browse is the thin shell that supplies fetch, DNS and the caps.
//
//  WHAT IT IS NOT. It is not Chromium: no JavaScript runs and there is no screenshot. It reads the page
//  the server sends (HTTP + HTML → a snapshot of the page's STRUCTURE: text, links, forms, file links),
//  follows links, submits GET forms, and downloads a file. That covers server-rendered portals (CKAN,
//  e-Stat's file lists, most municipal sites); it does not cover a page that is empty until a script
//  runs. That case is answered as such — `needsBrowser` — never guessed around. A real browser
//  (Cloudflare Browser Rendering, Browserbase) can be put behind the SAME input and output shapes
//  later; nothing here or in the client names the engine (js/web-browse.js).
//
//  THE BOUNDARIES, each one a fact about the exchange and none a list of sites:
//   · SSRF — http(s) only, the default port only, no credentials in the URL, a public host name, and
//     (the caller's `resolvesPublic`) a name that resolves ONLY to public addresses, asked again for
//     EVERY redirect hop. Cookies go back only to the host that set them.
//   · PAGE TEXT IS DATA — nothing the page says is ever an instruction (the client frames it so, and
//     elements a reader cannot see — hidden, aria-hidden, display:none — are dropped here, because the
//     hidden sentence is the one an injection hides in).
//   · NO CREDENTIALS — a password field is never filled and a form that has one is a hand-over, not a
//     form. A login wall, a CAPTCHA, a bot challenge: the answer is `handoff` and the reader does that
//     step in their own browser. Atlas never holds a secret.
//   · SAFE METHODS ONLY — GET. A form whose method is POST is a hand-over too (it can change something
//     on a third party's server; that decision is the reader's, not a model's).
//   · BOUNDS — one deadline for the whole exchange, a byte ceiling while streaming, a cap on redirects.
//
//  ⚠ NO TYPE ANNOTATIONS and no Deno globals: Node runs this file under test, and the live probe
//  (scripts/web-browse-probe.mjs) drives it with Node's fetch and DNS.
// ============================================================================

import { readCapped, RelayError, publicHostname } from "./relay-guard.js";

export const WEB_BROWSE_FUNCTION = "web-browse";

/* Every bound in one place. Each is an ESTIMATE from the portals measured 2026-11-20 (data.go.jp search
   page 274 KB in 3.2 s; e-Stat file list 195 KB in 2.7 s) with headroom, not a derived number; it expires
   the first time a real portal answers `too_large` / `timeout` for a page a reader could use. */
export const LIMITS = Object.freeze({
  pageBytes: 3 * 1024 * 1024,        /* an HTML page */
  fileBytes: 6 * 1024 * 1024,        /* one downloaded file, base64'd into a JSON answer (≈ 8 MB on the wire) */
  timeoutMs: 25000,                  /* the whole exchange: redirects and body included */
  redirects: 5,                      /* browsers stop at 20; a portal's http→https→www→login-check chain is 3 */
  textChars: 6000,                   /* the page text a snapshot carries by default */
  textCharsMax: 24000,               /* what a caller may ask for */
  links: 50, files: 30, forms: 5, fields: 40, options: 25,
  cookiesPerHost: 20, cookieBytes: 4096,
  previewBytes: 4096,                /* the head of a text file, shown without downloading it whole */
});

/* The formats a data portal hands over that IntMap's file door (js/geo-import.js) can read, and the
   archives that carry them. A LINK is a file candidate when its path ends in one of these, when it
   carries the `download` attribute, or when a segment of its path is the word download (`/download/`, `file-download`). That is a fact about
   the link, not a list of portals. */
export const FILE_EXTENSIONS = Object.freeze(["csv", "tsv", "txt", "json", "geojson", "kml", "kmz", "gpx", "zip", "gpkg", "xlsx", "xls", "tif", "tiff", "shp", "pdf", "svg", "png", "jpg", "jpeg", "webp", "avif", "gif", "pmtiles", "fgb", "parquet", "pbf", "mvt"]);

export function browseUrlAllowed(raw) {
  let u;
  try { u = new URL(String(raw)); } catch (_) { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && !((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80"))) return null;
  if (!publicHostname(u.hostname)) return null;
  if (u.toString().length > 2048) return null;
  u.hash = "";
  return u;
}

/* ── text decoding ───────────────────────────────────────────────────────────────────────────────── */
export function charsetOf(contentType, headBytes) {
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(String(contentType || ""));
  if (m) return m[1].toLowerCase();
  if (headBytes && headBytes.length) {
    let head = "";
    for (let i = 0; i < Math.min(headBytes.length, 2048); i++) head += String.fromCharCode(headBytes[i]);
    const h = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
    if (h) return h[1].toLowerCase();
  }
  return "utf-8";
}
export function decodeBody(bytes, contentType) {
  const label = charsetOf(contentType, bytes);
  try { return new TextDecoder(label).decode(bytes); } catch (_) { return new TextDecoder("utf-8").decode(bytes); }
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", yen: "¥" };
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; } catch (_) { return ""; }
    }
    const v = ENT[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}
const squash = (s) => decodeEntities(s).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠﻿]/g, " ").replace(/\s+/g, " ").trim();

function attrsOf(raw) {
  const a = {};
  const re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const k = m[1].toLowerCase();
    if (!(k in a)) a[k] = decodeEntities(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "");
  }
  return a;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const BLOCK = new Set(["p", "div", "section", "article", "header", "footer", "main", "nav", "aside", "li", "ul", "ol", "table", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "form", "fieldset", "pre", "blockquote", "dl", "dt", "dd", "br", "hr", "tbody", "thead", "caption", "details", "summary"]);
const RAW_DROP = /<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const CAPTCHA_TAG = /<[^>]*(?:g-recaptcha|h-captcha|cf-turnstile|grecaptcha|hcaptcha|data-sitekey|captcha)[^>]*>/i;

/* is this element invisible to a reader? (hidden attribute, aria-hidden, inline display:none / visibility:hidden) */
function invisible(at) {
  if ("hidden" in at) return true;
  if (String(at["aria-hidden"] || "").toLowerCase() === "true") return true;
  return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(String(at.style || ""));
}

/* comments are cut by position, not by one regex pass (a pass can leave a new `<!--` behind it, CodeQL js/incomplete-multi-character-sanitization); an unterminated one runs to the end, as a browser reads it */
function stripComments(s) {
  let out = "", i = 0;
  for (;;) {
    const a = s.indexOf("<!--", i);
    if (a < 0) return out + s.slice(i);
    out += s.slice(i, a) + " ";
    const b = s.indexOf("-->", a + 4);
    if (b < 0) return out;
    i = b + 3;
  }
}

/* A lead says where the publisher pointed. Downloading, reading a service and
   checking geographic content are separate observations. No submitted forms,
   followed scripts or invented endpoint addresses are needed for discovery. */
export function geographicKind(url, mime = "") {
  const type = mime.split(";")[0].trim().toLowerCase();
  const typed = {
    "application/geo+json": "geojson", "application/vnd.google-earth.kml+xml": "kml",
    "application/vnd.mapbox-vector-tile": "vector-tile", "application/pdf": "pdf",
    "image/svg+xml": "svg", "text/csv": "csv",
  }[type];
  const path = url.pathname.toLowerCase();
  const query = new URLSearchParams([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  const service = query.get("service");
  if (["wfs", "wms", "wmts", "wcs", "ogcapi"].includes(service)) return service;
  if (/\/(?:feature|map|image)server(?:\/|$)/.test(path)) return "arcgis-rest";
  if (/\/collections(?:\/|$)/.test(path)) return "ogc-collections";
  if (/\/(?:wfs|wms|wmts|wcs)(?:\/|$)/.test(path)) return /\/(wfs|wms|wmts|wcs)(?:\/|$)/.exec(path)[1];
  const grid = /(?:\{|%7b)(?:tilematrix|tilerow|tilecol|z)(?:\}|%7d)/i;
  if (grid.test(url.href)) return "tile-template";
  if (/(?:\{|%7b)[a-z][a-z0-9_]*(?:\}|%7d)/i.test(url.href)) return "url-template";
  return typeof typed === "string" ? typed : (fileKind({ href: url.href }) || (type.startsWith("image/") ? "image" : ""));
}

/* Scan quoted strings as data. Hex/Unicode escapes are decoded without
   evaluating code. Expressions and unresolved placeholders stay leads. */
function* scriptStrings(script) {
  for (const m of script.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/gs)) {
    const raw = m[1] ?? m[2];
    if (!raw || raw.length > 2040) continue;
    const unescaped = raw.replace(/\\(?:u([0-9a-f]{4})|x([0-9a-f]{2})|(["'/\\]))/gi, (_, u, x, ch) =>
      ch ?? String.fromCharCode(parseInt(u || x, 16)));
    if (/[\\<>"'\u0000-\u001f]/.test(unescaped)) continue;
    const value = decodeEntities(unescaped);
    if (/^(https?:\/\/|\.{0,2}\/)/i.test(value) || /\.[a-z0-9]{2,8}(?:[?#].*)?$/i.test(value)) yield value;
  }
}

/* Tokenize the discovery surface without constructing a filtered HTML string.
   Script and style consume raw text through their own end tag. The scanner
   visits the inert template subtree only to find its closing tag. */
function* assetTags(html) {
  const tags = /<(\/?)([a-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
  let depth = 0, match;
  while ((match = tags.exec(html))) {
    const closing = !!match[1], tag = match[2].toLowerCase();
    if (tag === "template") {
      depth = closing ? Math.max(0, depth - 1) : depth + 1;
      continue;
    }
    if (closing) continue;
    if (tag === "script" || tag === "style") {
      const end = tag === "script" ? /<\/script(?=[\s/>])[^>]*>/gi : /<\/style(?=[\s/>])[^>]*>/gi;
      end.lastIndex = tags.lastIndex;
      const close = end.exec(html);
      const content = html.slice(tags.lastIndex, close?.index ?? html.length);
      tags.lastIndex = close ? end.lastIndex : html.length;
      if (tag === "script" && !depth) yield [tag, attrsOf(match[3]), content];
      continue;
    }
    if (!depth && ["link", "iframe", "img", "object", "embed", "source"].includes(tag)) yield [tag, attrsOf(match[3]), ""];
  }
}

function geographicAssets(html, baseUrl, links, scripts = null) {
  const out = new Map();
  const add = (raw, via, mime, text, advertisedKind) => {
    if (!raw || out.size >= LIMITS.files) return;
    let u;
    try { u = browseUrlAllowed(new URL(raw, baseUrl)); } catch (_) { return; }
    if (!u) return;
    const kind = geographicKind(u, mime) || advertisedKind;
    if (!kind) return;
    const name = squash(text || "").slice(0, 120);
    const seen = out.get(u.href);
    if (seen) {
      if (name && !seen.text) seen.text = name;
      return;
    }
    out.set(u.href, { href: u.href, kind, via, ...(name ? { text: name } : {}) });
  };
  if (!scripts) {
    for (const raw of scriptStrings(html)) add(raw, "script-literal", "", "");
    return [...out.values()];
  }
  for (const l of links) add(l.href, "link", "", l.text, l.file);
  for (const [tag, a, content] of assetTags(stripComments(html))) {
    if (tag === "script") {
      if (a.src && scripts.size < LIMITS.links) {
        try {
          const u = browseUrlAllowed(new URL(a.src, baseUrl));
          if (u) scripts.add(u.href);
        } catch (_) { /* invalid declared source */ }
      }
      for (const literal of scriptStrings(content)) {
        add(literal.replace(/^pmtiles:\/\/(?=https?:\/\/)/i, ""), "inline-config", "", "");
      }
    } else if (tag !== "link" || !/\bicon\b/i.test(a.rel || "")) {
      add(a.href || a.src || a.data, tag, a.type, a.alt || a.title);
    }
  }
  return [...out.values()];
}

/* ── parse: HTML → the page's structure ──────────────────────────────────────────────────────────────
   → { title, text, links:[{text,href,file?}], forms:[{method,action,enctype,fields:[…],buttons:[…],password}],
       captcha, blank } — and nothing in it that a reader of the page could not see. */
export function parseHtml(html, baseUrl) {
  const src = String(html || "");
  const captcha = CAPTCHA_TAG.test(src);
  const titleM = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(src);
  const title = titleM ? squash(titleM[1]).slice(0, 200) : "";
  const doc = stripComments(src).replace(RAW_DROP, " ");
  const bodyOnly = (/<body\b/i.test(doc)) ? doc.slice(doc.search(/<body\b/i)) : doc;

  const lines = [];
  let cur = "";
  const flush = () => { const t = cur.replace(/\s+/g, " ").trim(); if (t) lines.push(t); cur = ""; };
  const links = [];
  const forms = [];
  const labelFor = {};
  let skip = null;            /* { tag, depth } — a subtree a reader cannot see */
  let mute = null;            /* { tag, depth } — nav/footer text is not the page's message (its LINKS still are) */
  let anchor = null, form = null, select = null, option = null, textarea = null, button = null, label = null;
  let scriptsSeen = (src.match(/<script\b/gi) || []).length;

  const baseHref = /<base\b([^>]+)>/i.exec(stripComments(src));
  let base = baseUrl ? new URL(baseUrl) : null;
  if (baseHref) {
    try {
      const u = new URL(attrsOf(baseHref[1]).href || "", base);
      if (browseUrlAllowed(u)) base = u;
    } catch (_) { /* ignore an unreadable base declaration */ }
  }
  const resolve = (h) => { try { return base ? new URL(h, base) : new URL(h); } catch (_) { return null; } };
  const addText = (t) => {
    if (skip) return;
    const s = squash(t);
    if (!s) return;
    if (anchor) anchor.text += (anchor.text ? " " : "") + s;
    if (label) label.text += (label.text ? " " : "") + s;
    if (option) option.label += (option.label ? " " : "") + s;
    if (button) button.text += (button.text ? " " : "") + s;
    if (textarea) textarea.value += t;
    if (!mute) cur += (cur ? " " : "") + s;
  };

  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(bodyOnly))) {
    if (m[4] !== undefined) { addText(m[4]); continue; }
    if (!m[2]) continue;
    const closing = m[1] === "/", tag = m[2].toLowerCase();
    const at = closing ? {} : attrsOf(m[3] || "");
    if (skip) {
      if (tag === skip.tag && !VOID.has(tag)) { if (closing) { if (--skip.depth === 0) skip = null; } else skip.depth++; }
      continue;
    }
    if (!closing && !VOID.has(tag) && invisible(at)) { skip = { tag, depth: 1 }; continue; }
    if (closing) {
      if (mute && tag === mute.tag && --mute.depth === 0) { flush(); mute = null; }
      if (tag === "a" && anchor) {
        const u = anchor.href ? resolve(anchor.href) : null;
        if (u && /^https?:$/.test(u.protocol)) {
          u.hash = "";
          links.push({ text: (anchor.text || anchor.title || "").slice(0, 120), href: u.toString(), download: anchor.download, nav: anchor.nav });
        }
        anchor = null;
      } else if (tag === "label" && label) { if (label.for) labelFor[label.for] = label.text; label = null; }
      else if (tag === "option" && option) { option = null; }
      else if (tag === "select") { select = null; }
      else if (tag === "textarea" && textarea) { textarea = null; }
      else if (tag === "button" && button) { if (form) form.buttons.push(button); button = null; }
      else if (tag === "form") { form = null; }
      else if (tag === "td" || tag === "th") { cur += " | "; }
      if (BLOCK.has(tag)) flush();
      continue;
    }
    /* opening tags */
    if ((tag === "nav" || tag === "footer") && !mute) { flush(); mute = { tag, depth: 1 }; }
    else if (mute && tag === mute.tag) mute.depth++;
    if (BLOCK.has(tag)) flush();
    if (tag === "a") {
      if (at.href && !/^\s*(javascript:|mailto:|tel:|#)/i.test(at.href)) anchor = { href: at.href, text: "", title: squash(at["aria-label"] || at.title || ""), download: "download" in at, nav: !!mute };
    } else if (tag === "img") {
      if (at.alt) addText(at.alt);
    } else if (tag === "label") {
      label = { for: at.for || "", text: "" };
    } else if (tag === "form") {
      if (forms.length < LIMITS.forms + 20) {
        form = { method: String(at.method || "get").toLowerCase(), action: at.action || "", enctype: String(at.enctype || "").toLowerCase(), fields: [], buttons: [], password: false, id: at.id || "", name: at.name || "" };
        forms.push(form);
      }
    } else if (tag === "input" && form) {
      const type = String(at.type || "text").toLowerCase();
      if (type === "password") form.password = true;
      if (type === "submit" || type === "image" || type === "button" || type === "reset") {
        if (type !== "reset" && type !== "button") form.buttons.push({ name: at.name || "", value: at.value || "", text: squash(at.value || at.alt || "") });
      } else if (form.fields.length < LIMITS.fields) {
        form.fields.push({ name: at.name || "", type, value: at.value || "", checked: "checked" in at, id: at.id || "", hint: squash(at["aria-label"] || at.placeholder || at.title || "") });
      }
    } else if (tag === "select" && form) {
      select = { name: at.name || "", type: "select", value: "", options: [], id: at.id || "", hint: squash(at["aria-label"] || at.title || "") };
      if (form.fields.length < LIMITS.fields) form.fields.push(select);
    } else if (tag === "option" && select) {
      if (select.options.length < LIMITS.options) {
        option = { value: at.value, label: "", selected: "selected" in at };
        select.options.push(option);
      }
    } else if (tag === "textarea" && form) {
      textarea = { name: at.name || "", type: "textarea", value: "", id: at.id || "", hint: squash(at["aria-label"] || at.placeholder || at.title || "") };
      if (form.fields.length < LIMITS.fields) form.fields.push(textarea);
    } else if (tag === "button" && form) {
      const t = String(at.type || "submit").toLowerCase();
      button = t === "submit" ? { name: at.name || "", value: at.value || "", text: "" } : null;
    }
  }
  flush();

  /* labels (for= → id), then drop dead weight */
  for (const f of forms) {
    for (const fld of f.fields) {
      fld.label = squash(labelFor[fld.id] || fld.hint || "").slice(0, 80);
      if (fld.type === "select") {
        for (const o of fld.options) { if (o.value === undefined) o.value = o.label; }
        const sel = fld.options.find((o) => o.selected) || fld.options[0];
        fld.value = sel ? sel.value : "";
      }
    }
  }
  const seen = new Set();
  const uniq = links.filter((l) => { const k = l.href + "\u0000" + l.text; if (seen.has(k)) return false; seen.add(k); return true; });
  for (const l of uniq) l.file = fileKind(l);
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  /* a page whose scripts are most of what it is and which says almost nothing is a page that is drawn by
     script — what a reader would see is not in this HTML. Said, never guessed around. */
  const blank = scriptsSeen >= 3 && text.length < 200 && uniq.length < 5 && !forms.length;
  /* a page that says almost nothing and links almost nowhere (the same measure as `blank`, without the script and form conditions):
     only such a page can be a WALL. A footer widget or a header sign-in box on a page whose body was read is not one. */
  const bare = text.length < 200 && uniq.length < 5;
  const scripts = new Set();
  const assets = geographicAssets(src, base?.href, uniq, scripts);
  return { title, text, links: uniq, scripts: [...scripts], assets, forms: forms.filter((f) => f.fields.length || f.buttons.length), captcha, blank, bare };
}

/* "csv" | "…" | "" — the format a link points at, from the link alone */
export function fileKind(link) {
  let p = "";
  try { p = decodeURIComponent(new URL(link.href).pathname).toLowerCase(); } catch (_) { p = ""; }
  const m = /\.([a-z0-9]{2,8})$/.exec(p);
  if (m && FILE_EXTENSIONS.includes(m[1])) return m[1];
  if (link.download || /(^|[\/_-])download([\/_-]|$)/.test(p)) return m ? m[1] : "file";
  return "";
}

/* ── hand-over: what a reader must do themself ─────────────────────────────────────────────────────── */
export function handoffOf(page, status, headers, url) {
  const h = (n) => { try { return String((headers && headers.get && headers.get(n)) || ""); } catch (_) { return ""; } };
  /* a sign-in box or a captcha tag on a page whose body WAS read is not a wall (a header login form, a footer widget): the reader
     (the model) was handed the page, and a hand-over would have thrown away a page that was fine. Only a page with nothing to read is one. */
  if (page && page.bare && page.forms && page.forms.some((f) => f.password)) return { kind: "login", url };
  if (page && page.bare && page.captcha) return { kind: "captcha", url };
  if (h("cf-mitigated") === "challenge" || (page && /^\s*(just a moment|attention required|access denied|ddos protection)/i.test(page.title || ""))) return { kind: "challenge", url };
  if (status === 401) return { kind: "login", url };
  /* 429 is "slower", not a step a person can do: it is an upstream_status, said as such */
  if (status === 403) return { kind: "blocked", url };
  return null;
}

/* ── the snapshot: what the model is handed ──────────────────────────────────────────────────────────
   Refs are positions on THIS page (l1, f1, …); the state carries what they mean, the model carries none of it. */
export function snapshotOf(page, o) {
  const opt = o || {};
  const chars = Math.min(LIMITS.textCharsMax, Math.max(500, Math.floor(+opt.textChars || LIMITS.textChars)));
  const fileLinks = [], plain = [], navLinks = [];
  page.links.forEach((l, i) => { (l.file ? fileLinks : l.nav ? navLinks : plain).push({ ref: "l" + (i + 1), text: l.text, href: l.href.length > 200 ? l.href.slice(0, 200) + "…" : l.href, file: l.file || undefined }); });
  const forms = page.forms.filter((f) => !f.password).slice(0, LIMITS.forms).map((f, i) => ({
    ref: "f" + (i + 1), method: f.method === "post" ? "post" : "get",
    fields: f.fields.filter((x) => x.name && x.type !== "hidden" && x.type !== "submit").map((x) => {
      const o2 = { name: x.name, type: x.type, label: x.label || undefined, value: x.value || undefined };
      if (x.options) o2.options = x.options.map((p) => ({ value: p.value, label: p.label })).slice(0, LIMITS.options);
      return o2;
    }),
    buttons: f.buttons.map((b, j) => ({ ref: "b" + (j + 1), text: b.text || b.value || b.name })).filter((b) => b.text),
  }));
  return {
    title: page.title,
    text: page.text.length > chars ? page.text.slice(0, chars) : page.text,
    textTruncated: page.text.length > chars ? page.text.length : undefined,
    files: fileLinks.slice(0, LIMITS.files),
    ...(page.assets?.length ? { assets: page.assets } : {}),
    ...(page.assetObservation ? { assetObservation: page.assetObservation } : {}),
    ...(page.scripts?.length ? { scripts: page.scripts } : {}),
    links: plain.slice(0, LIMITS.links),
    linksOmitted: Math.max(0, plain.length - LIMITS.links) || undefined,
    navLinks: navLinks.slice(0, 15),
    forms,
  };
}

/* What the state keeps so a ref means something on the next call — bounded, and re-validated on use. */
export function refTable(page) {
  return {
    l: page.links.slice(0, 400).map((l) => ({ h: l.href, f: l.file || "" })),
    f: page.forms.filter((f) => !f.password).slice(0, LIMITS.forms).map((f) => ({
      m: f.method, a: f.action, e: f.enctype,
      p: f.fields.slice(0, LIMITS.fields).map((x) => [x.name, x.type, x.value, x.checked ? 1 : 0, x.label || "", x.options ? x.options.map((q) => [q.value, q.label]) : 0]),
      b: f.buttons.slice(0, 6).map((b) => [b.name, b.value]),
    })),
  };
}

/* ── the cookie jar: host-only, bounded ─────────────────────────────────────────────────────────────── */
export function cleanState(s) {
  const o = (s && typeof s === "object") ? s : {};
  const cookies = {};
  const jar = (o.cookies && typeof o.cookies === "object") ? o.cookies : {};
  for (const host of Object.keys(jar).slice(0, 12)) {
    if (!publicHostname(host)) continue;
    const c = jar[host];
    if (!c || typeof c !== "object") continue;
    const out = {};
    for (const k of Object.keys(c).slice(0, LIMITS.cookiesPerHost)) {
      const v = String(c[k]);
      if (/^[A-Za-z0-9_.\-!#$%&'*+^`|~]{1,64}$/.test(k) && /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]{0,1024}$/.test(v)) out[k] = v;
    }
    cookies[host] = out;
  }
  const page = (o.page && typeof o.page === "object") ? o.page : { l: [], f: [] };
  return { v: 1, url: typeof o.url === "string" ? o.url.slice(0, 2048) : "", cookies, page: { l: Array.isArray(page.l) ? page.l.slice(0, 400) : [], f: Array.isArray(page.f) ? page.f.slice(0, LIMITS.forms) : [] } };
}
function cookieHeader(state, host) {
  const c = state.cookies[host];
  return c ? Object.keys(c).map((k) => k + "=" + c[k]).join("; ") : "";
}
function takeCookies(state, host, headers) {
  let list = [];
  try { list = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : []; } catch (_) { list = []; }
  for (const raw of list) {
    const first = String(raw).split(";")[0];
    const i = first.indexOf("=");
    if (i < 1) continue;
    const k = first.slice(0, i).trim(), v = first.slice(i + 1).trim();
    const jar = state.cookies[host] || (state.cookies[host] = {});
    if (/;\s*max-age\s*=\s*0\b/i.test(raw) || v === "") { delete jar[k]; continue; }
    if (Object.keys(jar).length < LIMITS.cookiesPerHost || k in jar) jar[k] = v.slice(0, LIMITS.cookieBytes);
  }
}

/* ── the one fetch: every hop judged, one deadline ─────────────────────────────────────────────────── */
async function hop(url, state, deps, signal, readBody, maxBytes, revalidate = false) {
  let current = browseUrlAllowed(url);
  if (!current) throw new RelayError("not_allowed", 400);
  for (let n = 0; ; n++) {
    if (!(await deps.resolvesPublic(current.hostname, { signal }))) throw new RelayError(signal.aborted ? "upstream_timeout" : "not_allowed", signal.aborted ? 503 : 400);
    const headers = { "user-agent": deps.userAgent, accept: "text/html,application/xhtml+xml,text/csv,application/json;q=0.9,*/*;q=0.5", "accept-language": "ja,en;q=0.8" };
    if (revalidate) headers["cache-control"] = "no-cache";
    const ck = cookieHeader(state, current.hostname);
    if (ck) headers.cookie = ck;
    let res;
    try { res = await (deps.fetch || fetch)(current.toString(), { method: "GET", headers, redirect: "manual", signal }); }
    catch (_e) { throw new RelayError(signal.aborted ? "upstream_timeout" : "upstream_unreachable", signal.aborted ? 503 : 502); }
    takeCookies(state, current.hostname, res.headers);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      try { await res.body?.cancel(); } catch (_) { /* a 3xx body is nothing to keep */ }
      const loc = res.headers.get("location");
      let next = null;
      try { next = loc ? browseUrlAllowed(new URL(loc, current)) : null; } catch (_) { next = null; }
      if (!next || n >= LIMITS.redirects) throw new RelayError("upstream_redirect", 502);
      current = next;
      continue;
    }
    const type = String(res.headers.get("content-type") || "");
    const textual = /^(text\/html|application\/xhtml)/i.test(type) || (!type && readBody);
    if (!readBody && !textual) {
      /* a file: say what it is, do not pull it */
      try { await res.body?.cancel(); } catch (_) { /* headers were enough */ }
      return { res, url: current, type, bytes: null };
    }
    let bytes;
    try { bytes = await readCapped(res, maxBytes); }
    catch (e) { if (e instanceof RelayError) throw e; throw new RelayError(signal.aborted ? "upstream_timeout" : "upstream_unreachable", signal.aborted ? 503 : 502); }
    return { res, url: current, type, bytes };
  }
}

export function fileNameOf(url, res) {
  const cd = String((res && res.headers && res.headers.get("content-disposition")) || "");
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd);
  let name = "";
  try { if (star) name = decodeURIComponent(star[1]); } catch (_) { name = ""; }
  if (!name) { const q = /filename\s*=\s*"?([^";]+)"?/.exec(cd); if (q) name = q[1]; }
  if (!name) { try { name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || ""); } catch (_) { name = ""; } }
  return String(name || "download").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
}

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ── the engine ──────────────────────────────────────────────────────────────────────────────────────
   browse(input, deps) → { ok, state, page? , file? , handoff?, code? , notes }
   input : { state?, action: 'open'|'click'|'submit'|'read'|'download', url?, ref?, form?, values?, button?, textChars? }
   deps  : { resolvesPublic(host,{signal}), fetch?, userAgent, sha256? }          — the shell supplies the world */
export async function browse(input, deps) {
  const a = input || {};
  const state = cleanState(a.state);
  const signal = AbortSignal.timeout(LIMITS.timeoutMs);
  const fail = (code, extra) => ({ ok: false, code, state, ...(extra || {}) });
  try {
    const action = String(a.action || "open");

    /* ── which URL does this action mean ── */
    let target = null;
    if (action === "open") target = String(a.url || "");
    else if (action === "read") target = state.url;
    else if (action === "click" || action === "download") {
      if (a.url && action === "download") target = String(a.url);
      else {
        const m = /^l(\d+)$/.exec(String(a.ref || ""));
        const l = m ? state.page.l[Number(m[1]) - 1] : null;
        if (!l) return fail("unknown_ref", { say: "That link is not on the current page. Use a ref from the last snapshot (l1, l2 …)." });
        target = l.h;
      }
    } else if (action === "submit") {
      const m = /^f(\d+)$/.exec(String(a.form || a.ref || ""));
      const f = m ? state.page.f[Number(m[1]) - 1] : null;
      if (!f) return fail("unknown_ref", { say: "That form is not on the current page. Use a ref from the last snapshot (f1, f2 …)." });
      if (String(f.m).toLowerCase() === "post") return fail("handoff", { handoff: { kind: "post-form", url: state.url }, say: "This form sends a POST, which can change something on the site. That is for the reader to do, not Atlas." });
      if (/multipart/.test(f.e || "")) return fail("unsupported_form", { say: "A form that uploads a file is not supported." });
      const given = (a.values && typeof a.values === "object") ? a.values : {};
      const fields = f.p.map((p) => ({ name: p[0], type: p[1], value: p[2], checked: !!p[3], label: p[4], options: p[5] || null }));
      const pairs = [];
      const names = new Set(fields.filter((x) => x.name).map((x) => x.name));
      for (const k of Object.keys(given)) {
        const byName = names.has(k) ? k : (fields.find((x) => x.label && x.label === k) || {}).name;
        if (!byName) return fail("unknown_field", { say: "No such field. Fields: " + [...names].join(", ") });
        const fld = fields.find((x) => x.name === byName);
        if (fld.type === "password") return fail("handoff", { handoff: { kind: "login", url: state.url }, say: "Atlas never types a password." });
        if (fld.type === "file") return fail("unsupported_form", { say: "A file field is not supported." });
        let v = String(given[k]);
        if (fld.options) {
          const hit = fld.options.find((o) => o[0] === v) || fld.options.find((o) => o[1] === v);
          if (!hit) return fail("bad_option", { say: "Not an option of " + byName + ". Options: " + fld.options.map((o) => o[0] + "=" + o[1]).slice(0, LIMITS.options).join(" | ") });
          v = hit[0];
        }
        fld.value = v; fld.set = true;
      }
      for (const x of fields) {
        if (!x.name) continue;
        if ((x.type === "checkbox" || x.type === "radio") && !x.set && !x.checked) continue;
        pairs.push([x.name, x.value]);
      }
      const bi = /^b(\d+)$/.exec(String(a.button || ""));
      const b = bi ? f.b[Number(bi[1]) - 1] : f.b[0];
      if (b && b[0]) pairs.push([b[0], b[1]]);
      let u;
      try { u = new URL(f.a || state.url, state.url); } catch (_) { return fail("bad_form"); }
      u.search = "";
      for (const [k, v] of pairs) u.searchParams.append(k, v);
      target = u.toString();
    } else return fail("bad_action");

    if (action === "open" && a.assetContext) {
      const base = browseUrlAllowed(a.assetContext);
      if (!base) return fail("bad_url");
      const r = await hop(target, state, deps, signal, true, LIMITS.pageBytes);
      if (!r.res.ok) return fail("upstream_status", { status: r.res.status });
      if (!/^(?:application|text)\/(?:x-)?(?:java|ecma)script\b/i.test(r.type)
        && !(/\.(?:m?js)$/i.test(r.url.pathname) && /^(?:text\/plain|application\/octet-stream)\b/i.test(r.type))) {
        return fail("not_a_script");
      }
      const assets = geographicAssets(decodeBody(r.bytes, r.type), base.href, []);
      // The published script is itself evidence. Its scan must not replace
      // the record for the document that declared it or its active refs.
      return { ok: true, state, status: r.res.status, scriptUrl: r.url.href,
        page: { title: r.url.pathname.split("/").at(-1), text: "", assets } };
    }

    if (action === "download") {
      const r = await hop(target, state, deps, signal, true, LIMITS.fileBytes, a.revalidate === true);
      if (!r.res.ok) return fail("upstream_status", { status: r.res.status });
      const type = r.type || "application/octet-stream";
      if (/^text\/html/i.test(type)) {
        /* a landing page is not the file: say so and show the page, so the model can look for the real link */
        const page = parseHtml(decodeBody(r.bytes, type), r.url.toString());
        const ho = handoffOf(page, r.res.status, r.res.headers, r.url.toString());
        state.url = r.url.toString(); state.page = refTable(page);
        return { ok: false, code: ho ? "handoff" : "not_a_file", handoff: ho || undefined, state, page: snapshotOf(page, a), say: "That address is a web page, not a file." };
      }
      const sha = deps.sha256 ? await deps.sha256(r.bytes) : undefined;
      return { ok: true, state, file: { name: fileNameOf(r.url.toString(), r.res), type, bytes: r.bytes.length, url: r.url.toString(), sha256: sha, b64: b64(r.bytes) } };
    }

    const r = await hop(target, state, deps, signal, false, LIMITS.pageBytes);
    const finalUrl = r.url.toString();
    if (r.bytes === null) {
      /* the address is a file, not a page: describe it from its headers (nothing was read) */
      if (!r.res.ok) return fail("upstream_status", { status: r.res.status });
      state.url = finalUrl;
      const len = Number(r.res.headers.get("content-length"));
      return { ok: true, state, file: { name: fileNameOf(finalUrl, r.res), type: r.type || "application/octet-stream", bytes: Number.isFinite(len) ? len : undefined, url: finalUrl } };
    }
    const page = parseHtml(decodeBody(r.bytes, r.type), finalUrl);
    const ho = handoffOf(page, r.res.status, r.res.headers, finalUrl);
    state.url = finalUrl; state.page = refTable(page);
    if (ho) return { ok: false, code: "handoff", handoff: ho, state, status: r.res.status, page: snapshotOf(page, a) };
    if (!r.res.ok) return { ok: false, code: "upstream_status", status: r.res.status, state, page: snapshotOf(page, a) };
    return { ok: true, state, status: r.res.status, page: snapshotOf(page, a), needsBrowser: page.blank || undefined, sent: action === "submit" ? { method: "get", host: r.url.hostname } : undefined };
  } catch (e) {
    if (e instanceof RelayError) return fail(e.code, { status: e.status });
    return fail("upstream_unreachable");
  }
}
