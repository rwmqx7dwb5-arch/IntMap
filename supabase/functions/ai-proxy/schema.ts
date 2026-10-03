// ============================================================================
//  IntMap · ai-proxy · schema — a caller's response schema: its bounds, and OpenAI's strict dialect
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. schemaOk bounds a schema a caller sends (and
//  each protocol-2 tool's parameters, turn.ts); strictJsonSchema / openAiSchemaFormat translate the
//  Gemini-dialect schemas into the json_schema format of the OpenAI path (providers/openai.ts).
// ============================================================================

/* A caller-supplied responseSchema is forwarded to the provider, so it is an input too.
   ⚠ (#R397) THE OLD NOTE HERE SAID «Nothing in js/ passes one today». It does, and it did when that
   was written: js/atlas-console.js sends PLAN_SCHEMA and RESEARCH_MAP_SCHEMA and js/atlas-geo-resolve.js
   sends GEO_RESOLVE_SCHEMA, all through `body.schema` in js/ai-core.js. The sentence was true of the
   Gemini era and stopped being true without being re-read — which is also why nobody noticed that the
   OpenAI path never had a schema parameter at all. These are the bounds on a live field. */
export const MAX_SCHEMA_BYTES = 16 * 1024;
export const MAX_SCHEMA_DEPTH = 12;
export const MAX_SCHEMA_KEYS = 512;
export function schemaOk(v) {
  let json = "";
  try { json = JSON.stringify(v); } catch (_) { return false; }      // cyclic, or not serialisable
  if (!json || json.length > MAX_SCHEMA_BYTES) return false;
  let keys = 0;
  const walk = (n: unknown, depth: number): boolean => {
    if (depth > MAX_SCHEMA_DEPTH) return false;
    if (Array.isArray(n)) return n.every((x) => walk(x, depth + 1));
    if (n && typeof n === "object") {
      for (const k of Object.keys(n as Record<string, unknown>)) {
        if (++keys > MAX_SCHEMA_KEYS) return false;
        if (k === "__proto__" || k === "constructor" || k === "prototype") return false;
        if (!walk((n as Record<string, unknown>)[k], depth + 1)) return false;
      }
    }
    return true;
  };
  return walk(v, 0);
}

/* ══ (#R397) THE SCHEMA REACHED GEMINI AND NEVER REACHED OPENAI ═══════════════════════════════════
   `responseSchema` is resolved above for every JSON task — MAP_REPORT_SCHEMA, ANSWER_SCHEMA, and
   whatever js/ passes (PLAN_SCHEMA, RESEARCH_MAP_SCHEMA, GEO_RESOLVE_SCHEMA) — and then handed to
   `callGemini` at four call sites. `callOpenAI` never had the parameter. On the provider this app
   actually runs (AI_PROVIDER=openai) the model was therefore asked for `{type:"json_object"}` and
   nothing else: a bare "must be JSON", with the field names, the enumerations and the required set
   living only in the prose of the task rules and in the client's post-hoc normaliser.

   That is the shape behind a whole family of reported Atlas failures — a plan that names a field
   the executor does not read, an answer whose `claims[].dimension` is absent so the audit cannot
   compare, a `places` array of bare strings. None of them are model stubbornness; the schema was
   never in the request.

   ⚠ IT IS A LADDER RUNG, NOT A SWITCH. OpenAI's `json_schema` format is stricter than the Gemini
   dialect these schemas are written in, so a rejection must degrade to exactly today's behaviour
   rather than fail the call — see the 400 ladder in callOpenAI(). `strictJsonSchema` is what makes
   the two dialects meet:
     · type names are upper-case in the Gemini REST dialect (`"OBJECT"`) and lower-case in JSON
       Schema (`"object"`);
     · `strict:true` requires EVERY property in `required` and `additionalProperties:false`. Forcing
       a field the schema left optional would change the contract, so an optional field is widened
       to `["string","null"]` instead — the documented way to say "required key, may be absent in
       meaning". Every consumer already coerces: normalizeAnswer() runs `String(v == null ? '' : v)`
       and `Array.isArray(v) ? v : []` over the whole object, so a null lands as '' or [] exactly as
       an omitted key does today.
     · Gemini-only keywords (`nullable`, `propertyOrdering`) and `format` are dropped: they are the
       dialect, not the contract. */
export const OPENAI_TYPE_BY_NAME: Record<string, string> = {
  OBJECT: "object", STRING: "string", NUMBER: "number", INTEGER: "integer",
  BOOLEAN: "boolean", ARRAY: "array", NULL: "null",
};
export function strictJsonSchema(node: unknown, depth = 0): unknown {
  if (depth > MAX_SCHEMA_DEPTH || !node || typeof node !== "object" || Array.isArray(node)) return null;
  const src = node as Record<string, unknown>;
  const rawType = typeof src.type === "string" ? src.type : "";
  const type = OPENAI_TYPE_BY_NAME[rawType.toUpperCase()] || (rawType ? rawType.toLowerCase() : "");
  if (!type) return null;
  const out: Record<string, unknown> = { type };
  if (typeof src.description === "string" && src.description) out.description = src.description;
  if (Array.isArray(src.enum) && src.enum.length) out.enum = src.enum.slice();

  if (type === "array") {
    const items = strictJsonSchema(src.items, depth + 1);
    if (!items) return null;
    out.items = items;
    return out;
  }
  if (type !== "object") return out;

  const props = (src.properties && typeof src.properties === "object") ? src.properties as Record<string, unknown> : null;
  if (!props) return null;
  const required = new Set((Array.isArray(src.required) ? src.required : []).map((k) => String(k)));
  const converted: Record<string, unknown> = {};
  const keys = Object.keys(props);
  if (!keys.length) return null;
  for (const k of keys) {
    const child = strictJsonSchema(props[k], depth + 1) as Record<string, unknown> | null;
    if (!child) return null;
    /* An optional key stays in `required` (strict mode demands it) and gains "null" so the model
       has a way to say "not applicable" — which is what leaving it out meant.
       ⚠ AN ENUM HAS TO BE WIDENED WITH IT. `{type:["string","null"], enum:["a","b"]}` admits null by
       type and forbids it by enum, and a validator that reads both rejects every instance — the
       "impossible schema" that would send this straight down the 400 ladder for no reason. */
    if (!required.has(k) && typeof child.type === "string") {
      child.type = [child.type, "null"];
      if (Array.isArray(child.enum) && child.enum.indexOf(null) < 0) child.enum = child.enum.concat([null]);
    }
    converted[k] = child;
  }
  out.properties = converted;
  out.required = keys;
  out.additionalProperties = false;
  return out;
}
/** The `text.format` value for a caller schema, or null when this schema cannot be expressed strictly. */
export function openAiSchemaFormat(schema: unknown, task: string): Record<string, unknown> | null {
  const converted = strictJsonSchema(schema);
  if (!converted) return null;
  return { type: "json_schema", name: (String(task || "result").replace(/[^A-Za-z0-9_-]/g, "_") || "result"), strict: true, schema: converted };
}
