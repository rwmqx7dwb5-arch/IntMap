// ============================================================================
//  IntMap · atlas-embed/core.js — the parts of the semantic capability search that are not I/O
// ----------------------------------------------------------------------------
//  index.ts is the Deno handler (auth, rate limit, database, OpenAI). What lives here is what has to
//  be the SAME on both sides of the wire, or has to be evaluated rather than read:
//
//    · catalogueHash(entries) — the key the capability vectors are cached under. The browser
//      computes it over the documents it sends (js/atlas-capabilities.js, `semanticCatalogue`), and
//      the server RECOMPUTES it over what arrived before it embeds or stores anything. So a stored
//      catalogue is always the hash of exactly the text that was embedded, and a caller cannot file
//      its own text under somebody else's key: a different text is a different hash, which no other
//      reader will ever ask for.
//    · validation of both request shapes, with the bounds written once.
//    · batching the documents for the embeddings endpoint.
//
//  ⚠ THE CANONICAL FORM IS WRITTEN IN TWO LANGUAGES ON PURPOSE, AND A TEST HOLDS THEM TOGETHER.
//  The browser cannot import this file (it is not served), and this file cannot import the browser's
//  (the CLI bundles only what is under supabase/functions). tests/atlas-semantic-search-checks
//  evaluates BOTH on the same entries and requires the same hex — a comparison of behaviour, not of
//  spelling.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs runs `node --check` over it.
// ============================================================================

/* ══ THE BOUNDS (no-ad-hoc-hardcoding §4: observation, expiry, canonical place — this file) ══════
   · MAX_QUERY_CHARS = 1000. A find_capability query is a search phrase, not a document: the longest
     ones recorded in DEV-NOTES #R802's 46-question production log are the model's paraphrases of
     the reader's sentence (the two quoted there are 31 and 35 characters). ESTIMATE, not a
     measured maximum: nobody has recorded the distribution. 1000 is far above every quoted one
     and still bounds what one call can bill. A longer query is REFUSED, not truncated — a truncated query is a
     different query, answered as if it were the one asked. Expires if the tool surface starts
     sending whole requests rather than search phrases.
   · MAX_DOC_CHARS = 6000. text-embedding-3-small accepts 8,191 tokens per input (OpenAI's model
     page, read 2026-09-25); a Japanese character is at most about one token, so 6,000 characters
     cannot overflow in any script the catalogue is written in. The browser cuts each document to
     this length BEFORE hashing, so the cut is part of the key and not a silent loss on one side.
     Expires with the model.
   · MAX_ENTRIES = 400. The registry holds 145 capabilities (144 live). Expires when it approaches
     that — the seed is refused whole rather than partly stored, so the symptom would be loud.
   · BATCH_CHARS = 200000. One embeddings request is limited to 300,000 tokens across its inputs
     (OpenAI API reference, read 2026-09-25); 200,000 characters stays under it at one token per
     character with a third to spare. Expires with that limit. */
export const MAX_QUERY_CHARS = 1000;
export const MAX_DOC_CHARS = 6000;
export const MAX_ENTRIES = 400;
export const BATCH_CHARS = 200000;
export const EMBED_DIM = 1536;          /* the column type in the migration: vector(1536) */
export const MAX_BODY_BYTES = MAX_ENTRIES * MAX_DOC_CHARS * 4 + 65536;   /* a UTF-8 character is at most 4 bytes */

const HEX64 = /^[0-9a-f]{64}$/;
/* a capability id as the registry writes them: `category.name`, camelCase, digits allowed */
const CAP_ID = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

/* The canonical string: entries sorted by id, as [[id, text], …] in JSON. JSON.stringify is the
   same function in Deno, Node and every browser, and sorting by code unit (not localeCompare) is
   the same everywhere. */
export function canonicalCatalogue(entries) {
  const rows = (entries || []).map((e) => [String(e.id), String(e.text)]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(rows);
}

export async function sha256Hex(s) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function catalogueHash(entries) {
  return sha256Hex(canonicalCatalogue(entries));
}

/* The two request shapes. Returns { ok:true, … } or { ok:false, code } — a code the caller may be
   shown, never an echo of what was sent. */
export function parseSearch(body) {
  const b = body || {};
  const catalog = String(b.catalog || "");
  if (!HEX64.test(catalog)) return { ok: false, code: "bad_catalog" };
  const q = typeof b.q === "string" ? b.q.trim() : "";
  if (!q) return { ok: false, code: "empty_query" };
  if (q.length > MAX_QUERY_CHARS) return { ok: false, code: "query_too_long" };
  return { ok: true, catalog, q };
}

export async function parseSeed(body) {
  const b = body || {};
  const catalog = String(b.catalog || "");
  if (!HEX64.test(catalog)) return { ok: false, code: "bad_catalog" };
  const entries = Array.isArray(b.entries) ? b.entries : null;
  if (!entries || !entries.length) return { ok: false, code: "no_entries" };
  if (entries.length > MAX_ENTRIES) return { ok: false, code: "too_many_entries" };
  const seen = new Set();
  for (const e of entries) {
    const id = e && typeof e.id === "string" ? e.id : "";
    const text = e && typeof e.text === "string" ? e.text : null;
    if (!CAP_ID.test(id) || id.length > 64) return { ok: false, code: "bad_id" };
    if (seen.has(id)) return { ok: false, code: "duplicate_id" };
    seen.add(id);
    if (text == null || !text.trim()) return { ok: false, code: "empty_text" };
    if (text.length > MAX_DOC_CHARS) return { ok: false, code: "text_too_long" };
  }
  /* ⚠ THE KEY IS RECOMPUTED, NEVER TRUSTED. See the header. */
  const clean = entries.map((e) => ({ id: e.id, text: e.text }));
  if ((await catalogueHash(clean)) !== catalog) return { ok: false, code: "catalog_mismatch" };
  return { ok: true, catalog, entries: clean };
}

/* Documents split into requests the embeddings endpoint accepts (BATCH_CHARS above). Order is
   preserved so the i-th vector answers the i-th entry. */
export function batches(entries) {
  const out = [];
  let cur = [], size = 0;
  for (const e of entries) {
    const n = e.text.length;
    if (cur.length && size + n > BATCH_CHARS) { out.push(cur); cur = []; size = 0; }
    cur.push(e); size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/* pgvector's text form. A vector of the wrong length is refused here rather than cast and rejected
   by the column — the reason is then ours to state. */
export function vectorLiteral(v) {
  if (!Array.isArray(v) || v.length !== EMBED_DIM) return null;
  for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) return null;
  return "[" + v.join(",") + "]";
}
