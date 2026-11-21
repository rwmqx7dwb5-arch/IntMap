/* ============================================================================
 *  IntMap · Atlas — THE KNOWLEDGE LAYER ON THE READER'S ACCOUNT   (atlas-knowledge)            js/atlas-knowledge-sync.js
 * ----------------------------------------------------------------------------
 *  The claims live on the device (js/atlas-knowledge-store.js). When the reader chooses «my account» in Settings, the
 *  same claims are copied to `atlas_knowledge_claims` (supabase/migrations/20261122090000_atlas_knowledge.sql, owner-only
 *  through RLS) so every device they sign in on has them. The copy mirrors the notebook's (js/atlas-notebook.js
 *  syncNow): one row per claim keyed by (account, claim id), the whole claim in `payload`.
 *
 *  THE MERGE, AND WHY IT HAS NO TOMBSTONES. A claim is the newer of its two copies (updatedAt). A claim DELETED on
 *  another device is noticed by absence: a local claim that was synced once (`syncedAt` set) and is no longer on the
 *  account was removed from it, so it is removed here too; a claim never synced is new and is pushed. The one case this
 *  cannot tell is a row removed by hand in the database while this device was offline, and that reads as the same
 *  thing (removed), which is the honest reading. Nothing is deleted unless the account read FINISHED: a read that
 *  failed half-way ends the sync with the device untouched.
 *
 *  Pure apart from the `db` it is handed (the page's supabase client, or a fake in the node checks): no DOM, no clock
 *  of its own (`now` is passed).
 * ==========================================================================*/

const TABLE = 'atlas_knowledge_claims';
const PAGE = 500, BATCH = 50;

function rowFromClaim(userId, c) {
  const payload = JSON.parse(JSON.stringify(c)); delete payload.syncedAt;
  return {
    user_id: userId, id: c.id,
    created_at: new Date(c.at || c.updatedAt || Date.now()).toISOString(),
    updated_at: new Date(c.updatedAt || c.at || Date.now()).toISOString(),
    statement: String(c.statement || '').slice(0, 1000), payload,
  };
}
export function claimFromRow(r, now) {
  if (!r || !r.id || !r.payload || typeof r.payload !== 'object') return null;
  return Object.assign({}, r.payload, { id: String(r.id), updatedAt: Date.parse(r.updated_at) || r.payload.updatedAt || 0, at: Date.parse(r.created_at) || r.payload.at || 0, syncedAt: +now || Date.now() });
}

export function makeKnowledgeSync(deps) {
  const store = deps.store, account = deps.account;
  const mk = (ok, rest) => Object.assign({ ok }, rest || {});

  async function readRemote(db, user) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(TABLE).select('id,created_at,updated_at,payload').eq('user_id', user.id).order('id').range(from, from + PAGE - 1);
      if (error) throw new Error(error.message || 'read failed');
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  async function syncNow(now) {
    const { db, user } = account();
    if (!db || !user) return mk(false, { reason: 'signed-out' });
    let remote;
    try { remote = await readRemote(db, user); } catch (err) { return mk(false, { reason: 'read-failed', message: String((err && err.message) || err) }); }
    const byId = new Map(remote.map((r) => [r.id, r]));
    const local = await store.list();
    let pulled = 0, removed = 0, pushed = 0;
    /* removed elsewhere: synced once, no longer on the account */
    for (const c of local) if (c.syncedAt && !byId.has(c.id)) { if (await store.forget(c.id)) removed++; }
    /* newer on the account: adopt */
    for (const r of remote) { const c = claimFromRow(r, now); if (c && await store.adopt(c)) pulled++; }
    /* newer here, or never sent: push */
    const after = await store.list();
    const stale = after.filter((c) => !c.syncedAt || (byId.has(c.id) && c.updatedAt > (Date.parse(byId.get(c.id).updated_at) || 0)));
    const failed = [];
    for (let i = 0; i < stale.length; i += BATCH) {
      const part = stale.slice(i, i + BATCH);
      const { error } = await db.from(TABLE).upsert(part.map((c) => rowFromClaim(user.id, c)), { onConflict: 'user_id,id' });
      if (error) { failed.push({ ids: part.map((c) => c.id), message: error.message || 'write failed' }); continue; }
      await store.markSynced(part.map((c) => c.id), +now || Date.now()); pushed += part.length;
    }
    return mk(failed.length === 0, { pulled, pushed, removed, failed: failed.length ? failed : undefined, reason: failed.length ? 'write-failed' : undefined });
  }

  /** the claim was forgotten on this device: take its copy off the account too (a failure is reported; the local forget stands) */
  async function forgetRemote(id) {
    const { db, user } = account(); if (!db || !user) return mk(false, { reason: 'signed-out' });
    const { error } = await db.from(TABLE).delete().eq('user_id', user.id).eq('id', String(id));
    return error ? mk(false, { reason: 'delete-failed', message: error.message }) : mk(true);
  }
  /** every row of this reader's on the account; the device keeps its own claims (and forgets that they were synced) */
  async function deleteAccountCopy() {
    const { db, user } = account(); if (!db || !user) return mk(false, { reason: 'signed-out' });
    const { error } = await db.from(TABLE).delete().eq('user_id', user.id);
    if (error) return mk(false, { reason: 'delete-failed', message: error.message });
    await store.markSynced((await store.list()).filter((c) => c.syncedAt).map((c) => c.id), 0);
    return mk(true);
  }
  return { syncNow, forgetRemote, deleteAccountCopy };
}
