/* ══ (atlas-orchestration-efficiency) A CAPABILITY'S READING IS STARTED BEFORE ITS TURN TO WRITE ════════════
   A capability that fetches from outside and then writes the map (model.run: Open-Meteo, then a pin and the camera) is one
   operation to the executor, which holds its conflict keys from the first request to the last write. Eight of them in one reply
   therefore ran their eight network round trips one after another (measured on the real turn loop: eight calls, at most one
   running at a time).
   The writing has to keep its order — nothing here touches that. The READING does not: it needs no key. A capability that can
   say what it will read from its arguments alone registers that here, and the turn loop starts every such reading of a reply
   the moment the reply is parsed (js/atlas-agent.js `prefetch`); when the capability's own turn comes, `take` hands it the
   reading that is already under way (or finished) instead of starting one.
   · A prefetch never writes, never prompts, and a failure is the capability's own: it is kept as a rejected promise that `take`
     returns, and the capability reports it the way it would have reported its own failed read.
   · No count, no refusal: a call with no registered reading is untouched. A reading nobody takes expires (TTL) and is dropped.
   · The key is the capability id and its arguments (stable JSON), so the SAME call twice shares one reading.            */
const readers = new Map();   /* capability id → (args, K) → Promise — registered by the module that owns the capability */
const pending = new Map();   /* key → { p, at } */
/* observation: a reply's calls are taken within one turn step (seconds); a reading older than two minutes belongs to no step still waiting.
   Expires with: a capability whose reading legitimately outlives a turn step. */
const TTL_MS = 120000;

const keyOf = (id, args) => { try { return id + '\u0000' + JSON.stringify(args || {}, Object.keys(args || {}).sort()); } catch (_) { return ''; } };
function sweep(now) { pending.forEach((v, k) => { if (now - v.at > TTL_MS) pending.delete(k); }); }

export function registerPrefetch(capabilityId, reader) {
  if (capabilityId && typeof reader === 'function') readers.set(String(capabilityId), reader);
}
export function hasPrefetch(capabilityId) { return readers.has(String(capabilityId)); }

/* startPrefetch(id, args, K) → true when a reading was started (or is already under way) for this exact call */
export function startPrefetch(capabilityId, args, K) {
  const r = readers.get(String(capabilityId));
  const k = keyOf(capabilityId, args);
  if (!r || !k) return false;
  const now = Date.now();
  sweep(now);
  if (pending.has(k)) return true;
  let p;
  try { p = Promise.resolve(r(args || {}, K)); } catch (e) { p = Promise.reject(e); }
  p.catch(() => { /* kept for takePrefetch(); an untaken failure is not an unhandled one */ });
  pending.set(k, { p, at: now });
  return true;
}
/* takePrefetch(id, args) → the reading's promise (and forget it), or null when none was started */
export function takePrefetch(capabilityId, args) {
  const k = keyOf(capabilityId, args);
  const v = k ? pending.get(k) : null;
  if (!v) return null;
  pending.delete(k);
  return v.p;
}
