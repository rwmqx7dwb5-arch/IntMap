// ============================================================================
//  IntMap · community-class/shape.js — what the community-class door accepts, and what each call costs
//  (security-review-nov). Pure: no Deno global, so the node tests evaluate it as it ships.
// ============================================================================

/* A class code as public._class_code() makes it (supabase/migrations/20261116090000_class_quest.sql):
   8 symbols from ABCDEFGHJKLMNPQRSTUVWXYZ23456789. js/quest-class.js CLASS_CODE_RE is the browser's copy of
   the same rule; tests/security-review-nov-checks.test.mjs holds the two equal. A string that cannot be a
   code is answered `not_found` WITHOUT asking the database — that says nothing about which codes exist. */
export const CLASS_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

/* THE NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4):
   · MAX_BODY_BYTES = 12 KiB. class_set_submit keeps at most 4096 bytes of answers (class_quest.sql
     `octet_length(p_answers::text) > 4096` → invalid); a name of 24, an 8-symbol code, the op and the
     JSON punctuation add < 200 bytes; tripled for escaping (a place answer is digits, so the real
     ratio is ~1). Expires with the 4096 in class_set_submit.
   · CLASS_PER_CALLER = 300 tries per 10 minutes, refilled continuously. A class hand-in is one open
     and one submit per student (a retry after `busy` is a third); one set takes at most 45 hand-ins per
     10 minutes (its own relay_take 'class-answer' bucket). 300 is six whole classes doing that at once
     behind ONE school address — an ESTIMATE of a school's NAT, not a measurement. What it bounds: a
     guesser at 0.5 codes a second per address, against a 40-bit space. Expires the first time a school
     reports «busy» that its classes' sizes do not explain; then this number goes up.
   · DIRECTORY_READER_PER_MIN = 12. js/community-maps.js reads a page when the panel opens, on each
     search (typed words, debounced by the panel) and on «more» — a reader turning pages by hand does
     not reach 12 a minute. Multiplied by READERS_PER_ADDRESS (_shared/rate-limit.js callerGate). */
export const MAX_BODY_BYTES = 12 * 1024;
export const CLASS_PER_CALLER = 300;
export const CLASS_REFILL_WINDOW_S = 600;
export const DIRECTORY_READER_PER_MIN = 12;

const SORTS = ["new", "reused", "updated"];

/* parseCall(text) → { op, args } | { error }. Only the declared arguments of each RPC pass, each of its
   declared type; anything else in the body is dropped, never forwarded. */
export function parseCall(text) {
  let body;
  try { body = JSON.parse(text); } catch (_) { return { error: "invalid_json" }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid_request" };
  const a = (body.args && typeof body.args === "object" && !Array.isArray(body.args)) ? body.args : {};
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);
  switch (body.op) {
    case "community_maps": {
      const args = {};
      const q = str(a.p_query, 100); if (q) args.p_query = q;
      if (SORTS.includes(a.p_sort)) args.p_sort = a.p_sort;
      if (Number.isFinite(a.p_limit)) args.p_limit = Math.max(1, Math.min(50, Math.round(a.p_limit)));
      const after = str(a.p_after, 200); if (after) args.p_after = after;
      if (Array.isArray(a.p_bbox) && a.p_bbox.length === 4 && a.p_bbox.every(Number.isFinite)) args.p_bbox = a.p_bbox.map(Number);
      return { op: "community_maps", args, cls: false };
    }
    case "class_set_open": {
      const code = String(a.p_code ?? "").trim().toUpperCase();
      return { op: "class_set_open", args: { p_code: code }, cls: true, code };
    }
    case "class_set_submit": {
      const code = String(a.p_code ?? "").trim().toUpperCase();
      return {
        op: "class_set_submit",
        args: { p_code: code, p_name: str(a.p_name, 200) ?? "", p_answers: a.p_answers ?? null },
        cls: true, code,
      };
    }
    default:
      return { error: "unknown_op" };
  }
}
