// ============================================================================
//  IntMap · atlas-model-call-key.js — whose model call a capability's call is  (atlas-jobs-reliability)
// ----------------------------------------------------------------------------
//  A capability run by a delegated worker (dctx.turnKey = the worker's child key) asks the model under that CHILD key with the reader's turn as its
//  parent, so the journal and the ledger attribute the call, its cost and its wait to the child that made it; a capability run by Atlas itself keeps
//  the reader's turn key. ONE rule for every capability that asks the model: it used to be written inside atlas-cap-research.js (callKey), and
//  web.search / longform — which also ask the model — kept the reader's key whoever called them, so a worker's search was charged to the parent turn.
//    modelCallKey(dctx, K) → { turnId, parentTurnId? }   (spread into askAIJSONEnvelope's options)
// ============================================================================
export function modelCallKey(dctx, K) {
  const key = dctx?.turnKey || K._curTurnKey;
  const split = String(key || '').indexOf('~');
  // The worker executor constructs the child key from its origin. The current page turn can
  // have changed by the time the worker asks for another capability.
  return split > 0 ? { turnId: key, parentTurnId: key.slice(0, split) } : { turnId: key };
}
