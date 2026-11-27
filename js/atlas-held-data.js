/* ============================================================================
 *  IntMap · js/atlas-held-data.js — WHAT THE MAP ALREADY HELD, AND THE TURN LEFT UNTOUCHED   (atlas-autonomy)
 * ----------------------------------------------------------------------------
 *  Measured on production (dev-notes/2026-11-26-atlas-gis-first-arrival.md §3.2): a reader who had an elevation raster registered asked a question
 *  whose answer is a claim about elevation («why does the vegetation differ across this ridge?»). Atlas moved the camera, looked, searched the web
 *  and answered in prose — 50 s, 3 steps, and the registered elevation was never read. Nothing was WRONG in what it did; what was missing is that
 *  nothing made «you are holding data that bears on this and have not looked at it» visible at the moment the turn was judged complete.
 *
 *  This is that fact, and only the fact: the datasets that existed BEFORE the turn began and that no operation of the turn names. It is handed to
 *  the goal verifier (js/atlas-goal-verify.js `observe`) beside the record of operations, the way the evidence graph's lines are. The verifier
 *  reads it with the request and decides — from the request, not from any word in this file — whether leaving the data untouched left a part of
 *  the request unmet; Atlas then does the work or answers that it does not need it. Nothing here reads the question, names a subject or a data
 *  kind, and nothing here decides (CONSTITUTION.md §5): it counts what the page's own registry says is there.
 *  PURE: the registry and the turn's results are handed in.
 * ==========================================================================*/

/* the most datasets listed: a line per dataset is a fact the verifier reads, and it reads them all — this only keeps a page that holds hundreds
   from becoming the whole prompt. Observation: a reader's page holds a handful; the registry's own list is capped the same way in js/atlas-state.js. Expires: never a policy. */
const LISTED = 12;
/* how much of the turn's results is searched for a dataset id: the ids are short strings that appear in the arguments or the text of an operation
   that used the dataset; a result bigger than this is cut at its start, where arguments and the first rows are. */
const SEARCHED_CHARS = 400000;

const one = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/** heldUntouched(datasets, results, since) → [dataset] — those created before `since` that no result of the turn names by id */
function heldUntouched(datasets, results, since) {
  const list = Array.isArray(datasets) ? datasets : [];
  let blob = '';
  try { blob = JSON.stringify(results == null ? [] : results).slice(0, SEARCHED_CHARS); } catch (_) { blob = ''; }
  return list.filter((r) => r && r.id != null && (+r.createdAt || 0) < since && !blob.includes(String(r.id)));
}

/** the line one dataset is described by — what the registry holds of it, nothing inferred */
function describeHeld(r) {
  const fields = (Array.isArray(r.fields) ? r.fields : []).map((f) => f && f.name ? f.name + (f.unit ? ' (' + f.unit + ')' : '') : '').filter(Boolean).slice(0, 8);
  const what = [r.kind || r.type || '', r.count != null ? r.count + ' rows' : '', fields.length ? 'fields: ' + fields.join(', ') : ''].filter(Boolean).join('; ');
  return one(r.title || r.id, 80) + ' [' + one(r.id, 60) + ']' + (what ? ' — ' + one(what, 220) : '');
}

/**
 * makeHeldObserver(since, scope) → (ctx) → string[] — the lines the goal verifier shows beside the record. Empty when the page holds nothing
 * that predates the turn or the turn touched it all. A registry that cannot be read is «not observed»: no line.
 */
export function makeHeldObserver(since, scope) {
  return (ctx) => {
    try {
      const g = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
      const data = g.IntMapData;
      if (!data || typeof data.list !== 'function') return [];
      const left = heldUntouched(data.list(), ctx && ctx.results, since);
      if (!left.length) return [];
      return ['Data the map already held before this turn and that no operation of this turn took as an input (' + left.length + '): '
        + left.slice(0, LISTED).map(describeHeld).join(' | ') + (left.length > LISTED ? ' | … and ' + (left.length - LISTED) + ' more' : '')];
    } catch (_) { return []; }
  };
}
