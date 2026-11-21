/* ============================================================================
 *  IntMap · EVIDENCE GRAPH — the account copy (public.evidence_graph_nodes)
 * ----------------------------------------------------------------------------
 *  The graph (js/evidence-graph.js) lives for one page. A figure's lineage that is gone at reload cannot answer
 *  «this source was updated — which of my past results does that touch?» a week later. This keeps the graph on the
 *  reader's ACCOUNT, one row per node, so every device they sign in on rebuilds the same lineage.
 *
 *  CONSENT IS THE NOTEBOOK'S. The nodes carry what the reader asked and what they were answered (figures, the
 *  documents cited), so they are copied only when the reader has turned notebook sync on — js/atlas-notebook.js
 *  calls `syncEvidenceGraph` beside its own sync and `deleteEvidenceGraph` beside its own deletion. Nothing here
 *  decides to sync by itself.
 *
 *  ⚠ A FAILED PUSH LOSES NOTHING. The graph's `pending()` is acknowledged only for what the server accepted, so a
 *  network error leaves the nodes pending for the next sync. ⚠ A PULL NEVER REPLACES: `merge` adds the versions
 *  and nodes this device lacks, so a device that has been offline keeps what it learned.
 *  The client is injected (`db` is the supabase client the page already holds), so tests drive it with a stub.
 * ==========================================================================*/
import { sharedEvidenceGraph } from './evidence-graph-record.js';

export const EVIDENCE_TABLE = 'evidence_graph_nodes';
const PAGE = 500, CHUNK = 100;

const rowOf = (n, userId) => ({ user_id: userId, id: n.id, kind: n.kind, type: n.type, payload: n, updated_at: new Date().toISOString() });

/**
 * syncEvidenceGraph({graph?, db, user}) → {ok, pulled, pushed, failed, error?}
 *   pull first (so a version another device saw is merged before this device writes the node), then push what is pending.
 */
export async function syncEvidenceGraph(args) {
  const a = args || {};
  const graph = a.graph || sharedEvidenceGraph().graph;
  const db = a.db, user = a.user;
  if (!db || !user || !user.id) return { ok: false, pulled: 0, pushed: 0, failed: 0, error: 'not-signed-in' };
  const out = { ok: true, pulled: 0, pushed: 0, failed: 0 };
  try {
    const nodes = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(EVIDENCE_TABLE).select('id,payload').eq('user_id', user.id).order('id', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw error;
      (data || []).forEach((r) => { if (r && r.payload && typeof r.payload === 'object') nodes.push(r.payload); });
      if (!data || data.length < PAGE) break;
    }
    const m = graph.merge({ graphVersion: 1, nodes });
    if (m.ok) out.pulled = m.added;
    const p = graph.pending();
    let clean = true;
    for (let i = 0; i < p.nodes.length; i += CHUNK) {
      const part = p.nodes.slice(i, i + CHUNK);
      const { error } = await db.from(EVIDENCE_TABLE).upsert(part.map((n) => rowOf(n, user.id)), { onConflict: 'user_id,id' });
      if (error) { out.failed += part.length; out.error = String(error.message || error.code || 'error'); clean = false; } else out.pushed += part.length;
    }
    if (clean) graph.ackPending(p.rev);
    out.ok = clean;
  } catch (err) { out.ok = false; out.error = String((err && err.message) || err); }
  return out;
}

/** deleteEvidenceGraph({db, user}) → boolean — removes the account copy only; the page's graph is untouched */
export async function deleteEvidenceGraph(args) {
  const a = args || {};
  if (!a.db || !a.user || !a.user.id) return false;
  const { error } = await a.db.from(EVIDENCE_TABLE).delete().eq('user_id', a.user.id);
  return !error;
}
