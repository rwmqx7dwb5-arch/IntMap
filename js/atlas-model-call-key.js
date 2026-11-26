// ============================================================================
//  IntMap · atlas-model-call-key.js — whose model call a capability's call is  (atlas-jobs-reliability)
// ----------------------------------------------------------------------------
//  A capability run by a delegated worker (dctx.turnKey = the worker's child key) asks the model under that CHILD key with the reader's turn as its
//  parent, so the journal and the ledger attribute the call, its cost and its wait to the child that made it; a capability run by Atlas itself keeps
//  the reader's turn key. ONE rule for every capability that asks the model: it used to be written inside atlas-cap-research.js (callKey), and
//  web.search / longform — which also ask the model — kept the reader's key whoever called them, so a worker's search was charged to the parent turn.
//    modelCallKey(dctx, K) → { turnId, parentTurnId? }   (spread into askAIJSONEnvelope's options)
// ============================================================================
export const modelCallKey = (dctx, K) => (dctx && dctx.turnKey ? { turnId: dctx.turnKey, parentTurnId: K._curTurnKey } : { turnId: K._curTurnKey });
