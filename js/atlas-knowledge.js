/* ============================================================================
 *  IntMap · Atlas — THE KNOWLEDGE LAYER, PAGE SIDE   (atlas-knowledge)                  js/atlas-knowledge.js
 * ----------------------------------------------------------------------------
 *  The data and its rules are js/atlas-knowledge-store.js. This is the things that need a page: the one device store
 *  (IndexedDB in the app, memory in a test) and the copy on the reader's account.
 *
 *  ⚠ OFF UNTIL THE READER TURNS IT ON (js/atlas-knowledge-prefs.js, and the Settings row that flips it). Kept knowledge
 *  is read back into later answers, so it is a thing the reader decides to have. While the switch is off,
 *  knowledge.remember and knowledge.recall refuse by name (KNOWLEDGE_OFF); nothing is written and nothing is read.
 *  ON, it is on this DEVICE only. A second switch — «my account» — copies the claims to the reader's IntMap account
 *  (supabase/migrations/20261125000000_atlas_knowledge.sql) so every device they sign in on has them; that second
 *  switch is the only thing that sends anything anywhere, and the Settings row says so.
 * ==========================================================================*/
import { makeKnowledgeStore, memoryBackend, idbBackend } from './atlas-knowledge-store.js';
import { makeKnowledgeSync } from './atlas-knowledge-sync.js';
import { readKnowledgePrefs, writeKnowledgePrefs } from './atlas-knowledge-prefs.js';

export const knowledgeOn = () => readKnowledgePrefs().on;
export const knowledgeSyncOn = () => readKnowledgePrefs().sync;
/** → the state AFTER the write, read back (a refused write — storage blocked — reports as still off) */
export function setKnowledgeOn(on) { return writeKnowledgePrefs({ on: !!on, sync: !!on && readKnowledgePrefs().sync }).on; }
export function setKnowledgeSync(sync) { return writeKnowledgePrefs({ on: readKnowledgePrefs().on, sync: !!sync }).sync; }

let _store = null;
export function knowledgeStore() {
  if (_store) return _store;
  let backend = null;
  try { if (typeof indexedDB !== 'undefined' && indexedDB) backend = idbBackend(indexedDB, 'intmap-atlas-knowledge'); } catch (_) { backend = null; }
  _store = makeKnowledgeStore(backend || memoryBackend());
  return _store;
}

/* the account's copy. `host()` is the page's own state (HOST.DB / HOST.user — the way js/atlas-notebook.js reaches them). */
let _host = () => (typeof window !== 'undefined' && typeof window.IntMapKnowledgeHost === 'function' ? window.IntMapKnowledgeHost() : null);   /* js/app-body.js hands the page's own state over */
export function useKnowledgeHost(fn) { if (typeof fn === 'function') _host = fn; }
let _sync = null;
export function knowledgeSync() { return _sync || (_sync = makeKnowledgeSync({ store: knowledgeStore(), account: () => { const H = _host(); return { db: H && H.DB, user: H && H.user }; } })); }
/** run one sync when the reader turned it on and is signed in → the sync's result ({ ok, ... }), or { ok:false, reason } */
export async function syncKnowledge() {
  if (!knowledgeOn() || !knowledgeSyncOn()) return { ok: false, reason: 'sync-off' };
  return knowledgeSync().syncNow(Date.now());
}
