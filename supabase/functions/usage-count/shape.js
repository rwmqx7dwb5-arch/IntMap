// ============================================================================
//  IntMap · usage-count/shape.js — WHAT AN ANONYMOUS USAGE COUNT IS, on both sides of the wire  (anonymous-usage-counts)
// ----------------------------------------------------------------------------
//  WHY: the operator decided (2026-10-01) to measure what marketing reaches — how many times the map
//  is opened, where readers arrive from, and which features they use — with IntMap's OWN aggregate
//  counters only: no cookie, no third-party analytics, no IP, no person. This file is the ONE
//  declaration of what may be counted. Everything else is derived from it:
//    · js/usage-counts.js (the browser) imports it to decide what it records and how it sends it;
//    · supabase/functions/usage-count/index.ts imports it to decide what it ACCEPTS — a metric that
//      is not declared here, or a dimension its rule refuses, is dropped on the server whatever the
//      browser sent (the server does not trust the client's declaration);
//    · the admin console reads the metric names it shows from the table, which only ever holds
//      rows this file accepted.
//  It is plain ESM with no dependency, so Vite bundles it into the page and the Deno function imports
//  the same bytes — one file, two readers, no mirror (the shape _shared/client-error-shape.js has).
//
//  ⚠ WHAT A ROW IS: (day, metric, dimension) → count. The DAY is the server's UTC date (the browser
//  never sends a time); there is no session id, no user id (not even for a signed-in reader), no IP,
//  no User-Agent string and no question text anywhere in the request this file shapes, and the table
//  has no column that could hold one (supabase/migrations/20261001090000_usage_counts.sql).
//
//  ⚠ NO TYPE ANNOTATIONS — the repo's static gate parses every committed .ts/.js as plain JavaScript,
//  and the browser loads this file as it is.
// ============================================================================

/* A dimension is one of three shapes. Each answers the normalised value, or null (= not counted).
   ⚠ An OPEN dimension (a host name, a campaign tag, a layer id) cannot be an allow-list of values —
   nobody can list tomorrow's referrers — so it is bounded twice instead: a narrow character set and
   length here (nothing that can carry an e-mail address, a space or a query), and a per-day ceiling
   on how many DISTINCT values one metric may hold (`maxDims` below, enforced inside
   record_usage_counts). A scripted caller can therefore add at most `maxDims` rows per metric per day. */
const closed = (values) => {
  const rule = (d) => (values.indexOf(d) >= 0 ? d : null);
  rule.values = Object.freeze(values.slice());     // a closed rule can say what it accepts (the tests read it)
  return rule;
};

/* A campaign tag: lower-cased, 1-40 of [a-z0-9._-]. Anything else — including '@', '/', '%', a space,
   a non-Latin letter — is not stored at all (a tag that cannot be stored safely is not "repaired"). */
const TOKEN = /^[a-z0-9][a-z0-9._-]{0,39}$/;
function token(d) {
  const s = String(d == null ? '' : d).trim().toLowerCase();
  return TOKEN.test(s) ? s : null;
}

/* A referring host name: lower-cased, at most 64 characters, at least two labels, letters/digits/
   hyphens only, and not an address literal or a private/local name. `direct` (no referrer) and
   `other` (a referrer that is not a public host name) are the two words the client may send instead. */
/* no look-behind: this file is in the page's eager bundle, and a look-behind LITERAL is a parse error
   (the whole module fails to load) on Safari before 16.4 */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PRIVATE_SUFFIX = /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp|test|example|invalid|onion)$/;
export function hostOk(h) {
  const s = String(h == null ? '' : h).trim().toLowerCase().replace(/\.$/, '');
  if (!s || s.length > 64) return null;
  const labels = s.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((l) => HOST_LABEL.test(l))) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null;      // an IPv4 literal
  if (PRIVATE_SUFFIX.test(s)) return null;
  return s;
}
function referrer(d) {
  if (d === 'direct' || d === 'other') return d;
  return hostOk(d);
}

/* A layer id — the checkbox id js/layer-manifest.js derives from js/layers/<id>.js
   (`cb-borders`, `dl-wind`, `beta-dl-bldg3d`, `dl-milSpend` …): 2-48 of [A-Za-z0-9_-]. The BROWSER
   only sends ids the manifest holds (isLayer); the server cannot import the manifest (it is outside
   the function's bundle), so it holds the shape and the per-day ceiling. */
const LAYER_ID = /^[a-z][A-Za-z0-9_-]{1,47}$/;
function layerId(d) {
  const s = String(d == null ? '' : d);
  return LAYER_ID.test(s) ? s : null;
}

/* ══ THE DECLARATION ═══════════════════════════════════════════════════════════════════════════
   metric → { dim(d) → value|null, max, maxDims }   — and, in the comment at the end of each row, what
   the count means (the privacy policy, js/legal-text.js §1, says the same in words)
     dim      the dimension's rule (above). '' is the only dimension of a metric that has none.
     max      the most ONE request may add to one row. The browser counts these at most once per page
              load (every metric but `atlas`), so a larger number in a request is not something an
              honest client sends; the server clamps to it.
     maxDims  how many distinct dimensions one metric may hold on one day (the database refuses a
              NEW dimension past it and still counts a known one). A closed metric's is its size.
     ⚠ the meaning is a COMMENT, not a field: nothing reads it at run time, and this file is in the page's
       eager bundle (check:perf), so a sentence per metric would be bytes every reader downloads for nobody.
   THE NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4):
     · layer maxDims 400 — js/layer-manifest.js held 174 layers on 2026-10-01; 400 leaves room for the
       catalogue to more than double before a real layer is refused. Expires when LAYERS.length
       approaches it (tests/anonymous-usage-counts-checks.test.mjs measures the ratio and fails at 75%).
     · ref maxDims 200, utm_* maxDims 100 — ESTIMATES: no record yet of how many distinct referrers or
       campaigns a day brings, which is the record this builds. Expires when the admin console shows a
       metric at its ceiling.
     · atlas max 100 — a page load that asks Atlas more than 100 questions before it is hidden is far
       past any observed session; the daily AI allowance (ai_usage) ends such a session sooner.
       Expires if that allowance is raised past it. atlas_mode shares it: one answer per question, so
       its count per page load can never pass the questions' (growth-loop). */
export const METRICS = Object.freeze({
  view:         { dim: closed(['']),                                          max: 1,   maxDims: 1 },   // the map was opened (one per page load)
  entry:        { dim: closed(['link', 'embed', 'showcase', 'about', 'teachers', 'news-map', 'embed-map', 'developers', 'history', 'on-this-day', 'countries']), max: 1, maxDims: 11 },   // opened from a link that carries a map view (a shared or saved link), embedded in another page (?embed=1), or reached from one of IntMap's own pages a visitor lands on first (an example's share page s/, the about page, the teacher page, the two pages by use news-map and embed-map, the developer page, the historical-map entry pages history/, the «on this day» pages on-this-day/ and the country pages countries/ — SITE_PAGES below)
  ref:          { dim: referrer,                                              max: 1,   maxDims: 200 },   // the host name of the page the reader came from (direct = none)
  utm_source:   { dim: token,                                                 max: 1,   maxDims: 100 },   // the utm_source tag of the address
  utm_medium:   { dim: token,                                                 max: 1,   maxDims: 100 },   // the utm_medium tag of the address
  utm_campaign: { dim: token,                                                 max: 1,   maxDims: 100 },   // the utm_campaign tag of the address
  lang:         { dim: closed(['en', 'jp', 'other']),                         max: 1,   maxDims: 3 },   // the app language (English, Japanese, any other)
  device:       { dim: closed(['mobile', 'desktop']),                         max: 1,   maxDims: 2 },   // a touch device or a pointer device
  layer:        { dim: layerId,                                               max: 1,   maxDims: 400 },   // page loads in which the reader switched this layer on
  feature:      { dim: closed(['compare', 'timelapse', 'share', 'donate', 'install']), max: 1, maxDims: 5 },   // page loads in which the feature was used
  atlas:        { dim: closed(['']),                                          max: 100, maxDims: 1 },   // questions asked to Atlas (the count only — never the question)
  atlas_mode:   { dim: closed(['text', 'map', 'chart', 'mixed']),             max: 100, maxDims: 4 },   // Atlas answers by the kind Atlas declared for them (js/atlas-agent.js ANSWER_MODES) — counted when a turn ends with an answer; never the question or the answer
});

/** acceptRow(metric, dimension, n) → { m, d, n, cap } | null — the ONE validator both sides use. */
export function acceptRow(metric, dimension, n) {
  const m = String(metric == null ? '' : metric);
  if (!Object.prototype.hasOwnProperty.call(METRICS, m)) return null;
  const spec = METRICS[m];
  const d = spec.dim(dimension == null ? '' : dimension);
  if (d == null) return null;
  const k = Math.floor(Number(n));
  if (!Number.isFinite(k) || k < 1) return null;
  return { m, d, n: Math.min(k, spec.max), cap: spec.maxDims };
}

/* How many rows one request may carry. The browser splits a larger batch; the server refuses more.
   Derived: the closed metrics are at most 1+5+3+2+5+1+4 = 21 rows, a page load records one ref and
   three tags, and a reader who switches on more than ~40 distinct layers before the page is hidden
   simply sends two requests. Expires with the declaration above. */
export const MAX_ROWS_PER_REQUEST = 64;

/* The wire format: {"c":[[metric, dimension, n], …]} as text/plain (a CORS-safelisted type, so the
   beacon needs no preflight). ONLY these three positions are ever read on the server: any other key
   or position a caller adds is never looked at, so it cannot reach the database. */
export function encode(rows) {
  return JSON.stringify({ c: rows.map((r) => [r.m, r.d, r.n]) });
}

/** parse(text) → { rows } | { error } — the server's reading of one request. */
export function parse(text) {
  let body = null;
  try { body = JSON.parse(String(text)); } catch (_) { body = null; }
  if (!body || typeof body !== 'object' || !Array.isArray(body.c)) return { error: 'invalid_request' };
  if (body.c.length < 1 || body.c.length > MAX_ROWS_PER_REQUEST) return { error: 'invalid_request' };
  const merged = new Map();
  for (const t of body.c) {
    if (!Array.isArray(t)) continue;
    const r = acceptRow(t[0], t[1], t[2]);
    if (!r) continue;                                   // undeclared / refused: dropped, never stored
    const key = r.m + '\u0000' + r.d;
    const prev = merged.get(key);
    /* a row repeated inside one request is still clamped to the metric's per-request max */
    if (prev) prev.n = Math.min(prev.n + r.n, METRICS[r.m].max);
    else merged.set(key, r);
  }
  return { rows: Array.from(merged.values()) };
}

/* ── the browser's readings, pure so Node can evaluate them ─────────────────────────────────── */

/** the app language as the counter's three buckets */
export function langBucket(code) {
  const c = String(code == null ? '' : code).toLowerCase();
  if (c === 'en' || c.indexOf('en-') === 0) return 'en';
  if (c === 'jp' || c === 'ja' || c.indexOf('ja-') === 0) return 'jp';
  return 'other';
}

/** the referring host, or 'direct' (none) / 'other' (not a public host name). Same-site → null
    (navigating between IntMap's own pages is not an arrival). */
export function referrerOf(referrer, selfHost) {
  const r = String(referrer == null ? '' : referrer).trim();
  if (!r) return 'direct';
  let host = '';
  try { host = new URL(r).hostname; } catch (_) { return 'other'; }
  if (selfHost && host.toLowerCase() === String(selfHost).toLowerCase()) return null;
  return hostOk(host) || 'other';
}

/** the three utm tags present in a query string, each passed through the token rule */
export function campaignOf(search) {
  const out = [];
  let q = null;
  try { q = new URLSearchParams(String(search == null ? '' : search)); } catch (_) { return out; }
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = q.get(k);
    if (v == null) continue;
    const t = token(v);
    if (t) out.push({ m: k, d: t });
  }
  return out;
}

/* ══ IntMap's OWN PAGES A VISITOR LANDS ON FIRST (growth-loop) ═════════════════════════════════════
   scripts/landing.mjs generates them — about.html, teachers.html, news-map.html, embed-map.html and developers.html (its PAGES), and one share page per
   example under s/ (its shareDir), each also under ja/ — and every one of them sends the visitor on to the
   map by a plain link or, for a share page, at once (meta refresh + location.replace). They are static
   pages that do not run this counter, so the ARRIVAL they produce is the only place they can be seen:
   the map's referrer is then the landing page's own address — same-origin, so the browser sends it whole
   (path and query; Referrer-Policy strict-origin-when-cross-origin, the default those pages keep).
   This file cannot import landing.mjs (it is bundled into the page and the Deno function, landing.mjs reads
   the disk), so the page kinds are declared here as the closed `entry` values they become, and
   tests/growth-loop-checks.test.mjs holds them equal to landing.mjs's PAGES and shareDir. */
export const SITE_PAGES = Object.freeze({ showcase: /(?:^|\/)s\/[^/]+\.html$/, about: /(?:^|\/)about\.html$/, teachers: /(?:^|\/)teachers\.html$/,
  'news-map': /(?:^|\/)news-map\.html$/, 'embed-map': /(?:^|\/)embed-map\.html$/,
  /* (developer-embed) */ developers: /(?:^|\/)developers\.html$/,
  /* (marketing-next) the pages the build generates into dist/ — the historical maps by region and year (scripts/history-pages.mjs)
     and «on this day» (scripts/on-this-day-pages.mjs), each a directory with an index, in English and under ja/ */
  history: /(?:^|\/)history\/(?:[^/]+\/){0,2}(?:index\.html)?$/, 'on-this-day': /(?:^|\/)on-this-day\/(?:\d{2}-\d{2}\/)?(?:index\.html)?$/,
  /* (country-pages) one page per country (scripts/country-pages.mjs) — its lower-case three-letter code a directory — and the list */
  countries: /(?:^|\/)countries\/(?:[a-z]{3}\/)?(?:index\.html)?$/ });

/** the kind of IntMap page the visitor came from ('showcase' or a PAGES name of landing.mjs), or null — only for a
    referrer on IntMap's own host (`selfHost`); any other referrer is `referrerOf`'s. */
export function sitePageOf(referrer, selfHost) {
  if (!selfHost) return null;
  let u = null;
  try { u = new URL(String(referrer == null ? '' : referrer)); } catch (_) { return null; }
  if (u.hostname.toLowerCase() !== String(selfHost).toLowerCase()) return null;
  for (const k of Object.keys(SITE_PAGES)) if (SITE_PAGES[k].test(u.pathname)) return k;
  return null;
}

/** how the page was entered: 'embed' when ?embed=1; on a fresh navigation (not a reload or back/forward,
    which keep the first referrer and hash), the IntMap page it came from (`fromPage`, sitePageOf) — the
    more specific answer, since a share page's link carries a map view too — else 'link' when the address's
    hash carries a map view (js/map-ui.js IntMapBookmark writes `v=` there); else null. */
export function entryOf(search, hash, navType, fromPage) {
  let q = null;
  try { q = new URLSearchParams(String(search == null ? '' : search)); } catch (_) { q = null; }
  if (q && q.get('embed') === '1') return 'embed';
  if (navType != null && navType !== 'navigate') return null;
  if (fromPage && Object.prototype.hasOwnProperty.call(SITE_PAGES, fromPage)) return fromPage;
  if (/[#&]v=/.test(String(hash == null ? '' : hash))) return 'link';
  return null;
}
