/* ============================================================================
 *  IntMap · Atlas — WHICH KEYS A WORLD OBJECT ANSWERS TO, FOR THE KNOWLEDGE LAYER   (atlas-knowledge)   js/atlas-knowledge-identity.js
 * ----------------------------------------------------------------------------
 *  A kept claim says which world objects it is about by ref (`facility:wd-Q104518607`). The next question may name
 *  the same object by another spelling of its identity: the Wikidata id, the OSM id, the ref the graph holds today.
 *  This asks the SAME two places every other door asks — the session's object index (js/atlas-world-objects.js) and
 *  the persistent world graph (js/world-graph-store.js findPersisted) — and returns the keys the object has, so
 *  js/atlas-knowledge-store.js can keep them with the claim and match on them later. No alias table: who an object is,
 *  is the graph's to say; an object neither place knows has only its own ref and is reported as `unresolved`
 *  (not as wrong: a ref Atlas read off a page may be right and not yet in the graph).
 *
 *  resolveRefKeys(refs, { find, findPersisted }) -> { keys: { ref: [key...] }, status: { ref: 'resolved'|'unresolved'|'unobserved' } }
 *    find(query)           -> world object | null          the session index
 *    findPersisted(query)  -> Promise<object | null>       the persistent graph
 *    `unobserved` = a lookup THREW (the graph could not be read), which is not the same sentence as «not in the graph».
 *  Pure apart from the two lookups it is handed.
 * ==========================================================================*/

const KEY_RE = /^[a-z_]+:.{1,200}$/i;

/** the keys one world object answers to: its ref, then each external id as `scheme:value` */
export function keysOfObject(o) {
  const out = [];
  if (!o) return out;
  if (o.ref && KEY_RE.test(String(o.ref))) out.push(String(o.ref));
  const ids = o.ids && typeof o.ids === 'object' ? o.ids : {};
  Object.keys(ids).forEach((k) => {
    const v = String(ids[k] == null ? '' : ids[k]).trim(), key = String(k).toLowerCase() + ':' + v;
    if (v && KEY_RE.test(key) && out.indexOf(key) < 0) out.push(key);
  });
  return out;
}

export async function resolveRefKeys(refs, deps) {
  const d = deps || {}, keys = {}, status = {};
  for (const ref of Array.from(new Set((refs || []).map(String).filter(Boolean)))) {
    let hit = null, threw = false;
    try { hit = typeof d.find === 'function' ? d.find(ref) : null; } catch (_) { hit = null; }
    if (!hit && typeof d.findPersisted === 'function') { try { hit = await d.findPersisted(ref); } catch (_) { threw = true; } }
    const ks = keysOfObject(hit);
    if (ks.indexOf(ref) < 0) ks.unshift(ref);
    keys[ref] = ks;
    status[ref] = hit ? 'resolved' : (threw ? 'unobserved' : 'unresolved');
  }
  return { keys, status };
}
