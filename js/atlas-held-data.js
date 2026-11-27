/* ============================================================================
 *  IntMap · js/atlas-held-data.js — WHAT THE MAP ALREADY HELD, AND WHAT THE TURN DID WITH IT   (atlas-autonomy)
 * ----------------------------------------------------------------------------
 *  Measured on production (dev-notes/2026-11-26-atlas-gis-first-arrival.md §3.2): a reader who had an elevation raster registered asked a question
 *  whose answer is a claim about elevation («why does the vegetation differ across this ridge?»). Atlas moved the camera, looked, searched the web
 *  and answered in prose — 50 s, 3 steps, and the registered elevation was never read. Nothing was WRONG in what it did; what was missing is that
 *  nothing made «you are holding data that bears on this and have not looked at it» visible at the moment the turn was judged complete.
 *
 *  This is that fact, and only the fact: the datasets that existed BEFORE the turn began, and for each whether an operation of the turn read it.
 *  It is handed to the goal verifier (js/atlas-goal-verify.js `observe`) beside the record of operations, the way the evidence graph's lines are.
 *  The verifier reads it with the request and decides — from the request, not from any word in this file — whether leaving the data untouched left
 *  a part of the request unmet; Atlas then does the work or answers that it does not need it. Nothing here reads the question, names a subject or a
 *  data kind, and nothing here decides (CONSTITUTION.md §5): it counts what the page's own registry says is there.
 *  PURE: the registry and the turn's results are handed in.
 *
 *  ⚠⚠ (atlas-completion-verdict) «NAMED» USED TO BE A SUBSTRING. The turn's results were JSON-stringified, cut at 400 000 characters and searched
 *  for each id — measured by an external audit: holding `ds-1` and `ds-10` and reading only `ds-10` marked `ds-1` used; a read that FAILED and
 *  printed the id in its error was «used»; a real read behind a long earlier result was «unused». Each is an observer's lie
 *  (.agents/rules/one-pass-or-a-reason.md §2 ①). What is read now is the record the operation itself states, `datasetsRead`
 *  ([{id, version, op, ok, why?}] — the shape js/gis-datasets.js readRecord builds; js/gis-ops.js run(), js/gis-atlas.js and js/compute-sandbox.js
 *  put it on their results and js/atlas-toolsurface.js carries it under `details`). Ids are compared whole, never searched for.
 *  A result that carries no record is «not observed»: its operation may have read anything. So a dataset is called untouched only when every
 *  operation of the turn stated what it read, or when the registry says none of the dataset's doors was opened since the turn began
 *  (lastOpened — the one negative it can prove). Otherwise it is neither read nor unread, and the line says exactly that.
 * ==========================================================================*/

/* the most datasets listed: a line per dataset is a fact the verifier reads, and it reads them all — this only keeps a page that holds hundreds
   from becoming the whole prompt. Observation: a reader's page holds a handful; the registry's own list is capped the same way in js/atlas-state.js. Expires: never a policy. */
const LISTED = 12;

const one = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/* the record a result states, wherever the carrier put it: on the result itself, or under `details` (js/atlas-toolsurface.js hands every plain
   `meta` entry over there). null when it states none — «not observed», which is not «read nothing» (`[]`). */
function readsOf(r) {
  if (!r || typeof r !== 'object') return null;
  if (Array.isArray(r.datasetsRead)) return r.datasetsRead;
  if (r.details && Array.isArray(r.details.datasetsRead)) return r.details.datasetsRead;
  return null;
}

/**
 * heldReads(datasets, results, since, opened) → { held: [{ ds, state, ops, failures }], compared: [{ op, ids }], unobserved }
 *   state  'read'       an operation of the turn that completed took it as an input
 *          'failed'     operations of the turn tried to take it as an input and none completed
 *          'untouched'  provably not read by the turn
 *          'unobserved' no record says, and a result that states nothing may have read it
 *   compared   one operation (one result, one op) that read two or more held datasets as its inputs — a fact about the call, not a judgement of what
 *              ought to be compared
 *   unobserved the number of results of the turn that state no record
 *   opened(id) the registry's lastOpened (a time, or null for «never»), or absent when the registry does not say
 */
function heldReads(datasets, results, since, opened) {
  const list = (Array.isArray(datasets) ? datasets : []).filter((r) => r && r.id != null && (+r.createdAt || 0) < since);
  const ids = new Set(list.map((r) => String(r.id)));
  const by = new Map();   /* id → { ops:[op], failures:[{op, why}] } */
  const compared = [];
  let unobserved = 0;
  for (const res of Array.isArray(results) ? results : []) {
    const rs = readsOf(res);
    if (!rs) { unobserved++; continue; }
    const together = new Map();   /* op → Set(id): the held inputs this one operation read */
    for (const x of rs) {
      if (!x || x.id == null) continue;
      const id = String(x.id);
      if (!ids.has(id)) continue;
      const op = one(x.op, 60) || '?';
      const e = by.get(id) || { ops: [], failures: [] };
      if (x.ok === true) {
        if (e.ops.indexOf(op) < 0) e.ops.push(op);
        const t = together.get(op) || new Set(); t.add(id); together.set(op, t);
      } else e.failures.push({ op, why: one(x.why, 80) });
      by.set(id, e);
    }
    together.forEach((t, op) => { if (t.size >= 2) compared.push({ op, ids: Array.from(t) }); });
  }
  const held = list.map((ds) => {
    const e = by.get(String(ds.id));
    if (e && e.ops.length) return { ds, state: 'read', ops: e.ops, failures: e.failures };
    if (e && e.failures.length) return { ds, state: 'failed', ops: [], failures: e.failures };
    let neverOpened = false;
    if (typeof opened === 'function') {
      let at; try { at = opened(ds.id); } catch (_) { at = undefined; }
      neverOpened = at === null || (typeof at === 'number' && at < since);
    }
    return { ds, state: (neverOpened || !unobserved) ? 'untouched' : 'unobserved', ops: [], failures: [] };
  });
  return { held, compared, unobserved };
}

/** the line one dataset is described by — what the registry holds of it, nothing inferred */
function describeHeld(r) {
  const fields = (Array.isArray(r.fields) ? r.fields : []).map((f) => f && f.name ? f.name + (f.unit ? ' (' + f.unit + ')' : '') : '').filter(Boolean).slice(0, 8);
  const what = [r.kind || r.type || '', r.count != null ? r.count + ' rows' : '', fields.length ? 'fields: ' + fields.join(', ') : ''].filter(Boolean).join('; ');
  return one(r.title || r.id, 80) + ' [' + one(r.id, 60) + ']' + (what ? ' — ' + one(what, 220) : '');
}

const listed = (items, fmt) => items.slice(0, LISTED).map(fmt).join(' | ') + (items.length > LISTED ? ' | … and ' + (items.length - LISTED) + ' more' : '');

/**
 * makeHeldObserver(since, scope) → (ctx) → string[] — the lines the goal verifier shows beside the record: the data the map held before the turn,
 * each as read / tried and failed / provably untouched / not observable, and which held datasets one operation read together. Empty when the page
 * holds nothing that predates the turn. A registry that cannot be read is «not observed»: no line.
 */
export function makeHeldObserver(since, scope) {
  return (ctx) => {
    try {
      const g = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
      const data = g.IntMapData;
      if (!data || typeof data.list !== 'function') return [];
      const opened = typeof data.lastOpened === 'function' ? (id) => data.lastOpened(id) : null;
      const v = heldReads(data.list(), ctx && ctx.results, since, opened);
      const of = (state) => v.held.filter((h) => h.state === state);
      const read = of('read'), failed = of('failed'), left = of('untouched'), unseen = of('unobserved');
      const out = [];
      if (read.length) out.push('Data the map already held before this turn that an operation of this turn READ as an input, and that operation completed (' + read.length + '): '
        + listed(read, (h) => describeHeld(h.ds) + ' — read by ' + h.ops.join(', ') + (h.failures.length ? ' (and ' + h.failures.length + ' failed attempt(s))' : '')));
      if (failed.length) out.push('Data the map already held before this turn that an operation of this turn TRIED to take as an input and FAILED — it was not read (' + failed.length + '): '
        + listed(failed, (h) => describeHeld(h.ds) + ' — ' + h.failures.map((x) => x.op + (x.why ? ': ' + x.why : '')).join('; ')));
      if (v.compared.length) out.push('Held data that ONE operation of this turn read together, as inputs of the same call (' + v.compared.length + '): '
        + listed(v.compared, (c) => c.op + '(' + c.ids.map((id) => one(id, 60)).join(', ') + ')'));
      if (left.length) out.push('Data the map already held before this turn and that no operation of this turn took as an input (' + left.length + '): '
        + listed(left, (h) => describeHeld(h.ds)));
      if (unseen.length) out.push('Data the map already held before this turn whose use by this turn could NOT BE OBSERVED — ' + v.unobserved
        + ' operation(s) of this turn do not state which datasets they read, so it is neither read nor unread (' + unseen.length + '): '
        + listed(unseen, (h) => describeHeld(h.ds)));
      return out;
    } catch (_) { return []; }
  };
}
