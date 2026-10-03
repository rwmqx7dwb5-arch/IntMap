// ============================================================================
//  IntMap · the shape of a map correction — «this is wrong, here»   (community-next)
// ----------------------------------------------------------------------------
//  A reader who sees something wrong ON THE MAP — a name, a border, a date a historical unit is drawn
//  for, a layer's value, a thing in the wrong place or missing — had two doors before this file, and
//  neither knew where: the feedback form (a star rating and free text) and the bug reporter (the app's
//  diagnostics). A report about the map arrived as a sentence with no point, no year, no layer and no
//  way back to the reader. A correction is a report ABOUT A PLACE AND A MOMENT OF THE MAP:
//    · the point (lng, lat) and the map state it was seen in (the share-link fragment MapState writes —
//      js/map-state.js encode — so the operator opens exactly what the reader saw, layers and year included)
//    · the year of the clock when the clock is not live (a historical map — the claim to be checked
//      against history, .agents/rules/historical-verification.md)
//    · the layer the reader says is wrong, the kind of error, their words and, optionally, a source
//  and it comes BACK: the sender is handed a receipt (a random token only their device holds — no
//  account, no e-mail needed) and the operator's answer is read with it (public.map_correction_status).
//
//  ONE DECLARATION, FOUR READERS:
//    · supabase/functions/reader-reports/index.ts — `checkCorrection` validates a { kind:'correction' }
//      body before the row is written as the service role (the anon-write-guard path: no INSERT policy);
//    · js/map-corrections.js — the in-app card builds its choices from CORRECTION and checks a draft with
//      the SAME `checkCorrection` before sending (so «would be refused» is said before the network);
//    · scripts/org-pages.mjs + js/admin-corrections.js — the public log and the operator's console;
//    · supabase/migrations/20261003184500_map_corrections.sql — the table's CHECKs are the database's
//      outer bound on the same words and lengths. tests/community-next-checks.test.mjs holds them equal.
//
//  ⚠ THE RECEIPT IS A BEARER SECRET, AND THE DATABASE NEVER STORES IT. reader-reports draws 32 random
//  bytes, stores sha256(receipt) (hex) and answers the receipt once; the status function hashes what it
//  is given the same way (Postgres's own sha256 over the UTF-8 bytes). A leaked table therefore names no
//  receipt, and a receipt reads only its own row's answer.
//  Plain JS without a Deno or DOM dependency: Node (tests, the page generator), Deno and the browser
//  import it as is (WebCrypto is global in all three).
// ============================================================================

export const CORRECTION = Object.freeze({
  /* WHAT IS WRONG — one word each, the stored value (append, never rename: a stored row keeps its word).
     `date` is «drawn for years it did not exist / missing for years it did» — the historical claim. */
  kinds: Object.freeze(['name', 'boundary', 'date', 'value', 'position', 'missing', 'other']),
  /* WHERE THE OPERATOR HAS GOT TO. `new` and `confirmed` are open; the rest are answers.
     `spam` is never shown to the sender as such (READER_STATUS below). */
  statuses: Object.freeze(['new', 'confirmed', 'fixed', 'not_an_error', 'duplicate', 'cannot_fix', 'spam']),
  open: Object.freeze(['new', 'confirmed']),
  /* the answers that may be PUBLISHED in the public log (with a reply the operator wrote) */
  publishable: Object.freeze(['confirmed', 'fixed', 'not_an_error', 'cannot_fix']),
});

/* What the SENDER is shown for each stored status — `spam` reads as `closed` (a sender is not told their
   report was judged spam; the operator's console still says so). Canonical: this table; the status
   function in the migration applies the same mapping (the test holds the two equal). */
export const READER_STATUS = Object.freeze({
  new: 'new', confirmed: 'confirmed', fixed: 'fixed', not_an_error: 'not_an_error',
  duplicate: 'duplicate', cannot_fix: 'cannot_fix', spam: 'closed',
});

/* THE CEILINGS. Canonical: the CHECK constraints of public.map_corrections — restated so that an
   over-long field is answered 400 before the database is asked (.agents/rules/no-ad-hoc-hardcoding.md §4):
   · message 3000 — a correction names one thing; the bug report's 10,000 is for logs. ESTIMATE; expires
     the first time the operator sees a report cut short (the card counts down to it).
   · mapLink 2000 — the share fragment MapState.encode writes. Measured on 2026-10-03: a view with 40
     layer ids, a historical clock, a comparison window and a simulator's packed state is ~900 characters;
     2000 is that with headroom and is still a URL every browser opens. Expires if MapState grows a field.
   · layerId 80 / layerLabel 120 / placeLabel 200 — the longest registration id in js/ is under 40, the
     longest panel label under 80, an OSM name chain (place-dossier) under 160 for the places tried.
   · evidence 600 — a citation URL (a Wikipedia permalink with oldid, a DOI resolver, an archive.org URL).
   · mapTime 40 — the clock's ISO form (js/chronos.js iso(): a signed year, month, day and time).
   · country 8 — an ISO 3166-1 alpha-3 or Natural Earth's own code (both ≤ 3; 8 leaves «-99»-style codes room). */
export const CORRECTION_LIMITS = Object.freeze({
  message: 3000, mapLink: 2000, layerId: 80, layerLabel: 120, placeLabel: 200, evidence: 600, mapTime: 40,
  country: 8, lang: 16, reply: 2000, adminNote: 2000, fixedRef: 400,
});
/* The clock's range (js/chronos.js reaches back to the deep past; the hist layers to 3000 BC and earlier). The
   database's CHECK is the same pair. A year outside it is a malformed body, not a historical report. */
export const YEAR_RANGE = Object.freeze({ min: -10000, max: 3000 });
/* How many receipts one status read may carry — a device that has sent more than this many reports asks in
   pages. ESTIMATE: nobody sends a hundred corrections from one browser without the operator noticing. */
export const MAX_RECEIPTS_PER_READ = 100;

const LAYER_ID = /^[A-Za-z0-9_.:-]+$/;
const COUNTRY = /^[A-Z0-9-]{2,8}$/;

function text(v, max) {
  if (v == null) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, value: null };
  const t = v.trim();
  if (t.length > max) return { ok: false, value: null };
  return { ok: true, value: t || null };
}
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * checkCorrection(body) → { ok:true, row } | { ok:false, field }
 * The one rule both the card and the function apply. `row` holds exactly the table's columns a sender
 * may state; `user_id`, `receipt_hash`, `status` and everything after are decided elsewhere.
 * `field` names what was refused, so the card can point at it (the function answers 400 either way).
 */
export function checkCorrection(body) {
  const L = CORRECTION_LIMITS;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' };
  if (!CORRECTION.kinds.includes(body.what)) return { ok: false, field: 'what' };
  const lng = body.lng, lat = body.lat;
  if (!finite(lng) || lng < -180 || lng > 180) return { ok: false, field: 'lng' };
  if (!finite(lat) || lat < -90 || lat > 90) return { ok: false, field: 'lat' };
  let zoom = null;
  if (body.zoom != null) { if (!finite(body.zoom) || body.zoom < 0 || body.zoom > 24) return { ok: false, field: 'zoom' }; zoom = Math.round(body.zoom * 100) / 100; }
  let year = null;
  if (body.year != null) { if (!Number.isInteger(body.year) || body.year < YEAR_RANGE.min || body.year > YEAR_RANGE.max) return { ok: false, field: 'year' }; year = body.year; }
  const f = {
    message: text(body.message, L.message), mapLink: text(body.mapLink, L.mapLink), mapTime: text(body.mapTime, L.mapTime),
    layerId: text(body.layerId, L.layerId), layerLabel: text(body.layerLabel, L.layerLabel), placeLabel: text(body.placeLabel, L.placeLabel),
    evidence: text(body.evidence, L.evidence), country: text(body.country, L.country), lang: text(body.lang, L.lang),
  };
  for (const k in f) if (!f[k].ok) return { ok: false, field: k };
  if (!f.message.value) return { ok: false, field: 'message' };
  /* the map state is the share fragment and nothing else — the operator opens it on the site's own map */
  if (f.mapLink.value && !/^#v=-?\d/.test(f.mapLink.value)) return { ok: false, field: 'mapLink' };
  if (f.evidence.value && !/^https?:\/\/[^\s]+$/i.test(f.evidence.value)) return { ok: false, field: 'evidence' };
  if (f.layerId.value && !LAYER_ID.test(f.layerId.value)) return { ok: false, field: 'layerId' };
  if (f.country.value && !COUNTRY.test(f.country.value)) return { ok: false, field: 'country' };
  return {
    ok: true,
    row: {
      kind: body.what, lng: Math.round(lng * 1e6) / 1e6, lat: Math.round(lat * 1e6) / 1e6, zoom, year,
      map_time: f.mapTime.value, map_link: f.mapLink.value, layer_id: f.layerId.value, layer_label: f.layerLabel.value,
      place_label: f.placeLabel.value, country: f.country.value, message: f.message.value, evidence_url: f.evidence.value,
      lang: f.lang.value,
    },
  };
}

/* ── the receipt ───────────────────────────────────────────────────────────────────────────────── */
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** a new receipt: 32 random bytes, base64url (43 characters) */
export function newReceipt() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b64url(b);
}
/** a receipt the way the database stores and looks it up: sha256 over its UTF-8 bytes, lowercase hex.
    The migration's status function computes encode(sha256(convert_to(receipt, 'UTF8')), 'hex') — the same. */
export async function receiptHash(receipt) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(receipt)));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const RECEIPT_RE = /^[A-Za-z0-9_-]{43}$/;
