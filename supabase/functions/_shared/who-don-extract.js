// ============================================================================
//  IntMap · _shared/who-don-extract.js — the one field WHO does not hold as a field  (#R570)
// ----------------------------------------------------------------------------
//  scripts/build-who-don.mjs measured what the WHO OData service actually carries: pathogen,
//  country, onset date and publication date are STRUCTURED FIELDS, and they travel with
//  data/who-don.json.gz. Case and death counts are the exception — they exist only inside the
//  `Overview` HTML, as English prose. Measured 2026-09-09 over the 3,195 items:
//
//      Summary   82 % EMPTY
//      Overview  100 % present, mean 2,817 chars, median 1,503
//
//  ⚠⚠⚠ A REGULAR EXPRESSION MUST NOT PICK THE NUMBER, and this is not a style preference —
//  the sentence that carries the cumulative count carries other integers of the same shape:
//
//      «Cumulatively as of 26 August 2026, 5815 confirmed cases have been reported from
//       26 provinces … 54 to 60 health zones … 104 contacts are being followed …
//       1314 patients have recovered … A total of 2788 deaths have been reported»
//
//  Every «number followed by a noun» heuristic that gets 5815 right also gets 1314, 104 or 60
//  wrong somewhere in 3,195 documents, and the failure is silent: the layer would draw a
//  confident bar built from the count of health zones. Picking the right integer out of that
//  paragraph is a JUDGEMENT, so it is asked of something that can judge
//  (.agents/rules/no-ad-hoc-hardcoding.md §2: ask the thing that can decide, and let the code
//  REFUSE what has no grounds rather than decide itself).
//
//  ⇒ THE CODE'S JOB HERE IS REFUSAL. This file holds no pattern for a count. It turns the WHO
//  HTML into prose, states the question, and then VALIDATES the answer — a non-integer, a
//  negative, more deaths than cases, a date that is not a date, or a confidence outside 0..1
//  all come back as «no answer», never as a number the map would draw.
//
//  ⚠ NO TYPE ANNOTATIONS. scripts/static-checks.mjs runs `node --check` over every committed
//  .ts/.js — see the note at the top of _shared/relay-guard.js.
//  ⚠ `_shared/` IS NOT A FUNCTION. Never give it a [functions.*] block in supabase/config.toml.
// ============================================================================

/* ── 1. HTML → prose ─────────────────────────────────────────────────────────────────────────
 *  ⚠ EVERY TAG BECOMES A SPACE, and no tag is named. A list of "block level" tags to break on
 *  is exactly the embedded list §1 of the hardcoding rule forbids, and it is unnecessary:
 *  whitespace is collapsed at the end anyway, so a space per tag both separates
 *  `<td>5815</td><td>cases</td>` and costs nothing inside `<b>5815</b>`. */
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  deg: "°", times: "×", laquo: "«", raquo: "»", shy: "",
};

/** Decode HTML character references in ONE pass.
 *  ⚠ ONE PASS IS THE POINT (#R540): a decode that re-scans its own output turns `&amp;lt;` into
 *  `<`, i.e. it re-assembles a reference the document had deliberately escaped. A single sweep
 *  leaves `&lt;` standing, which is what the document said. */
function decodeEntities(s) {
  return s.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, ref) => {
    if (ref[0] === "#") {
      const cp = ref[1] === "x" || ref[1] === "X"
        ? parseInt(ref.slice(2), 16)
        : parseInt(ref.slice(1), 10);
      /* A code point outside Unicode, or a surrogate half, is not a character — leave the
         reference alone rather than emit a replacement glyph the source never wrote. */
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return whole;
      try { return String.fromCodePoint(cp); } catch (_) { return whole; }
    }
    const named = ENTITIES[ref.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** WHO's `Overview` HTML → one line of prose, safe to hand to a model.
 *  Script/style bodies are dropped whole (they are not prose); comments likewise. */
export function plainText(html) {
  if (typeof html !== "string" || !html) return "";
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ");
  /* an unterminated <script> at the end of a truncated document still must not survive as text */
  s = s.replace(/<(script|style)\b[\s\S]*$/i, " ");
  s = s.replace(/<[^>]*>/g, " ");
  s = decodeEntities(s);
  /* \s does not include U+00A0 in every engine's mood; name it, plus the zero-width joiners that
     WHO's CMS leaves behind when an editor pastes from Word. */
  s = s.replace(/[\u00a0\u2007\u202f]/g, " ").replace(/[\u200b-\u200d\ufeff]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

/* ── 2. the question ─────────────────────────────────────────────────────────────────────────
 *  ⚠ THE PROMPT'S JOB IS TO MAKE «I DO NOT KNOW» CHEAP. A model that is asked for a number will
 *  find one; the paragraph quoted in this file's header contains five plausible ones. So the
 *  instruction spends most of its words on what is NOT the answer, and on the fact that null is
 *  a correct and expected reply. `parseExtract` below then refuses anything that does not match
 *  the declared shape, so a chatty answer costs a row and not a wrong bar on the map. */
export const EXTRACT_PROMPT =
  "You read one WHO Disease Outbreak News report and report ONLY the cumulative counts that the " +
  "text itself states.\n" +
  "\n" +
  "Return, as JSON and nothing else:\n" +
  '{"cases": <integer|null>, "deaths": <integer|null>, "asOf": "YYYY-MM-DD"|null, ' +
  '"scope": "country"|"global"|"multi"|null, "confidence": <number 0..1>}\n' +
  "\n" +
  "RULES\n" +
  "1. NEVER infer, estimate, add up or carry over a number the text does not state. If the text " +
  "does not give a cumulative total, answer null. null is a correct answer and is expected often.\n" +
  "2. `cases` is the CUMULATIVE TOTAL NUMBER OF CASES the report attributes to this outbreak — " +
  "the figure WHO calls cases (confirmed and probable together where it reports a total). Do NOT " +
  "return the confirmed-only subtotal when a total is given, and do NOT add subtotals together " +
  "yourself.\n" +
  "3. `deaths` is the cumulative number of deaths reported for the same outbreak, as stated.\n" +
  "4. NOT CASES, and never to be returned as cases: numbers of provinces, districts, health " +
  "zones, health facilities, contacts traced or followed, people vaccinated, samples tested, " +
  "patients recovered or discharged, beds, staff, doses, or any percentage or rate.\n" +
  "5. `asOf` is the date the text gives for those cumulative figures (\"as of 26 August 2026\"), " +
  "in YYYY-MM-DD. If the text gives no date for them, answer null — do not use the publication " +
  "date instead.\n" +
  "6. `scope` says what the figures cover: \"country\" for a single country, \"multi\" for a " +
  "stated multi-country total, \"global\" for a world total. null if unclear.\n" +
  "7. `confidence` is your own 0..1 estimate that these numbers are the outbreak's cumulative " +
  "case and death totals. Use a low value when the text is ambiguous.\n" +
  "\n" +
  "Reply with the JSON object only. No prose, no explanation, no code fences.";

/* ── 3. the answer, refused unless it survives every check ───────────────────────────────────── */

const SCOPES = ["country", "global", "multi"];
/* WHO's Disease Outbreak News begins in 1996 (measured: the oldest slug is 1996_01_22a-en), so a
   cumulative count dated before that is not a reading of this document. Expires if WHO ever
   back-publishes older reports — the corpus in data/who-don.json.gz is the thing to re-measure. */
const EARLIEST_YEAR = 1996;
/* One day of slack for the model's and the server's disagreement about "today"'s timezone. A
   cumulative figure cannot be as-of the future by more than that. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/** The first complete JSON object in a model's reply, braces balanced and strings respected.
 *  Returns null when there is none — a reply with no object is not an answer. */
function firstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

/** A non-negative integer, or null. ⚠ NOT `isFinite(+v)` (#R543): `+null`, `+''` and `+[]` are
 *  all 0 and all finite, so that test answers "yes, zero" for three different kinds of absence —
 *  and zero cases is a claim about an outbreak, not the absence of one. A string "12" is refused
 *  too: the model was told to return a number, and quietly coercing its output is how a "12-15"
 *  becomes 12. */
function intOrNull(v) {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return { ok: false };
  /* beyond 2^53 an integer is no longer exactly representable, and no outbreak is */
  if (!Number.isSafeInteger(v)) return { ok: false };
  return { ok: true, value: v };
}

/** A real calendar date in YYYY-MM-DD, or null. `2026-02-30` parses in Date and is not a date;
 *  the round trip is what catches it. */
function dateOrNull(v, nowMs) {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false };
  const t = Date.parse(v + "T00:00:00Z");
  if (!Number.isFinite(t)) return { ok: false };
  if (new Date(t).toISOString().slice(0, 10) !== v) return { ok: false };
  if (Number(v.slice(0, 4)) < EARLIEST_YEAR) return { ok: false };
  if (t > nowMs + FUTURE_SLACK_MS) return { ok: false };
  return { ok: true, value: v };
}

/**
 * Validate a model's reply into the row the table will hold.
 *   → { ok: true,  value: { cases, deaths, asOf, scope, confidence } }
 *   → { ok: false, why: '<one word>', value: null }
 *
 * `opts.now` is injectable so the future-date rule is testable without waiting for tomorrow
 * (#R551: measure a budget with the clock you handed in, not the wall's).
 */
export function parseExtract(text, opts) {
  const now = (opts && Number.isFinite(opts.now)) ? opts.now : Date.now();
  const no = (why) => ({ ok: false, why, value: null });

  if (typeof text !== "string" || !text.trim()) return no("empty_reply");
  const raw = firstJsonObject(text);
  if (!raw) return no("no_json");
  let o;
  try { o = JSON.parse(raw); } catch (_) { return no("bad_json"); }
  if (!o || typeof o !== "object" || Array.isArray(o)) return no("not_an_object");

  const cases = intOrNull(o.cases);
  if (!cases.ok) return no("cases_not_an_integer");
  const deaths = intOrNull(o.deaths);
  if (!deaths.ok) return no("deaths_not_an_integer");
  /* ⚠ ONLY WHEN BOTH ARE PRESENT. Deaths without a case total is a real and common shape in these
     reports; refusing it would throw away a fact WHO stated. */
  if (cases.value !== null && deaths.value !== null && deaths.value > cases.value) {
    return no("deaths_exceed_cases");
  }

  const asOf = dateOrNull(o.asOf, now);
  if (!asOf.ok) return no("as_of_not_a_date");

  let scope = null;
  if (o.scope !== null && o.scope !== undefined && o.scope !== "") {
    if (typeof o.scope !== "string" || !SCOPES.includes(o.scope)) return no("scope_not_known");
    scope = o.scope;
  }

  const c = o.confidence;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1) return no("confidence_out_of_range");

  return { ok: true, value: { cases: cases.value, deaths: deaths.value, asOf: asOf.value, scope, confidence: c } };
}

/* ── 4. the key that says "this answer is about THAT prose" ──────────────────────────────────── */

/** SHA-256 of a string, hex. WebCrypto, so the same line runs in Deno (the Edge Function) and in
 *  Node (this file's tests). ⚠ Hash the text that was actually SENT to the model, not the whole
 *  document: a WHO edit past the truncation window cannot change the answer, so it must not
 *  charge for a re-extraction either. */
export async function sourceHash(text) {
  const bytes = new TextEncoder().encode(typeof text === "string" ? text : "");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ⚠ 2,000 CHARACTERS, AND WHY THE FRONT. Measured 2026-09-09 over the 3,195 DON `Overview`
   fields: mean 2,817 chars, median 1,503 — so this window holds the whole document for more than
   half the corpus, and for the rest it holds the part that carries the cumulative sentence, which
   the reports open with ("Cumulatively as of …"). The tail of a DON is public-health advice, WHO
   risk assessment and references: no counts. Expires if WHO changes the house style of these
   reports; re-measure with scripts/build-who-don.mjs's corpus. */
export const DEFAULT_MODEL_CHARS = 2000;

/** The head of the prose, bounded. Never mid-surrogate: slicing a string can split an astral
 *  character in half, and half a character is not text. */
export function truncateForModel(text, maxChars) {
  const s = typeof text === "string" ? text : "";
  const n = Number.isInteger(maxChars) && maxChars > 0 ? maxChars : DEFAULT_MODEL_CHARS;
  if (s.length <= n) return s;
  let end = n;
  const code = s.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;   /* a leading surrogate would be orphaned */
  return s.slice(0, end);
}
