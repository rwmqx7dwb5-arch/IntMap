// ============================================================================
//  IntMap · _shared/connection-policy.js — may Atlas do THIS through THAT connection?
//  (supabase/migrations/20261121120000_connection_permissions.sql · dev-notes/2026-11-20-connection-permissions.md)
// ----------------------------------------------------------------------------
//  Pure. No fetch, no clock, no database: the page and every Edge Function call the same function on the same
//  `connections` row and get the same answer. Its job is to let Atlas use more services, so:
//    · the question is the NATURE of the operation (read / write / spend / destructive), never the tool name;
//    · a READ is allowed by default and never asks (a reader can still set it to ask or deny);
//    · `ask` is a verdict for the CALLER to put to the reader — this file never prompts and never blocks.
//  Every refusal carries a typed `reason`, so a caller can say why rather than just "no".
//  ⚠ NO TYPE ANNOTATIONS — the static gate parses every committed .js as plain JavaScript.
// ============================================================================

export const OP_CLASSES = ['read', 'write', 'spend', 'destructive'];
export const SENSITIVITIES = ['public', 'personal', 'private'];
export const MODES = ['allow', 'ask', 'deny'];

const RANK = { public: 0, personal: 1, private: 2 };

/* Defaults mirror the table's column defaults (one place each; the pgTAP file compares them). */
export const DEFAULT_POLICY = Object.freeze({
  mode_read: 'allow', mode_write: 'ask', mode_spend: 'ask', mode_destructive: 'ask',
  max_sensitivity: 'personal', allow_retention: true, allow_training: false, daily_spend_cap_micros: null,
});

/** Classify an operation from what it DOES. `facts` = { writes, spends, destroys } booleans from the connector. */
export function classifyOp(facts) {
  const f = facts || {};
  if (f.destroys) return 'destructive';
  if (f.spends) return 'spend';
  if (f.writes) return 'write';
  return 'read';
}

/**
 * decide(connection, op, usage?) → { verdict: 'allow'|'ask'|'deny', reason, opClass }
 *   connection  a `connections` row (missing fields fall back to DEFAULT_POLICY)
 *   op          { class, sensitivity?, costMicros?, retains?, trains? }
 *               sensitivity — how sensitive the data being SENT is (default 'public')
 *               retains/trains — what THIS call's destination will do with it (default: the connection's data_terms)
 *   usage       { spend_today_micros } from conn_usage, only needed for a spend cap
 * Order is the whole policy: status → data conditions (hard) → spend cap (hard) → the class mode.
 * Data conditions are `deny`, not `ask`: they are the reader's standing statement of what may leave, and asking
 * on every call would turn a privacy setting into a nag.
 */
export function decide(connection, op, usage) {
  const c = Object.assign({}, DEFAULT_POLICY, connection || {});
  const o = op || {};
  /* an unclassified call is treated as the cautious case (write), never as a read */
  const opClass = OP_CLASSES.includes(o.class) ? o.class : 'write';
  const out = (verdict, reason) => ({ verdict, reason, opClass });

  if (!connection) return out('deny', 'no_connection');
  if (c.status === 'revoked') return out('deny', 'connection_revoked');
  if (c.status === 'paused') return out('deny', 'connection_paused');

  const sens = SENSITIVITIES.includes(o.sensitivity) ? o.sensitivity : 'public';
  const ceiling = SENSITIVITIES.includes(c.max_sensitivity) ? c.max_sensitivity : 'personal';
  if (RANK[sens] > RANK[ceiling]) return out('deny', 'data_too_sensitive');

  const terms = (c.data_terms && typeof c.data_terms === 'object') ? c.data_terms : {};
  const retains = o.retains != null ? !!o.retains : terms.retains === true;
  const trains = o.trains != null ? !!o.trains : terms.trains === true;
  /* terms only matter for data that is not public: sending a public fact to a service that keeps it harms no one */
  if (sens !== 'public') {
    if (trains && !c.allow_training) return out('deny', 'training_not_allowed');
    if (retains && !c.allow_retention) return out('deny', 'retention_not_allowed');
  }

  if (opClass === 'spend' && c.daily_spend_cap_micros != null) {
    const spent = Number((usage && usage.spend_today_micros) || 0);
    const cost = Math.max(0, Number(o.costMicros) || 0);
    if (spent + cost > Number(c.daily_spend_cap_micros)) return out('deny', 'daily_spend_cap');
  }

  const mode = c['mode_' + opClass];
  if (mode === 'deny') return out('deny', 'class_denied');
  if (mode === 'ask') return out('ask', 'class_needs_approval');
  return out('allow', 'class_allowed');
}

/** The ledger row for one decision/outcome, shaped to public.conn_log's arguments. Never carries content or a URL. */
export function ledgerArgs(connection, op, decision, outcome, extra) {
  const x = extra || {};
  let host = '';
  if (x.url) { try { host = new URL(String(x.url)).host; } catch (e) { host = ''; } }
  else if (x.host) host = String(x.host).replace(/[/?#].*$/, '');
  return {
    p_user: (connection && connection.user_id) || null,
    p_connection: (connection && connection.id) || null,
    p_service: (connection && connection.service) || String(x.service || ''),
    p_op: String((op && op.name) || x.op || '').slice(0, 80),
    p_class: decision && decision.opClass ? decision.opClass : 'write',
    p_decision: decision ? decision.verdict : 'deny',
    p_outcome: outcome,
    p_actor: x.actor || 'atlas',
    p_code: String(x.code || (decision && decision.verdict !== 'allow' ? decision.reason : '')).slice(0, 64),
    p_host: host.slice(0, 255),
    p_cost_micros: Math.max(0, Math.round(Number(x.costMicros) || 0)),
  };
}
