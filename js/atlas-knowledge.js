/* ============================================================================
 *  IntMap · Atlas — THE KNOWLEDGE LAYER, PAGE SIDE   (atlas-knowledge)                  js/atlas-knowledge.js
 * ----------------------------------------------------------------------------
 *  The data and its rules are js/atlas-knowledge-store.js. This is the two things that need a page: the
 *  reader's switch, and the one device store (IndexedDB in the app, memory in a test).
 *
 *  ⚠ OFF UNTIL THE READER TURNS IT ON. Kept knowledge is read back into later answers, so it is a thing the
 *  reader decides to have — the opposite default to the notebook's `keep` (a record of what happened). While
 *  the switch is off, knowledge.remember and knowledge.recall refuse by name (KNOWLEDGE_OFF); nothing is
 *  written and nothing is read. It is on this DEVICE only: there is no account copy in this slice, so
 *  turning the switch on never sends anything anywhere. Expires: when an account copy is added — that copy
 *  needs its own second switch, as the notebook's `sync` does (js/atlas-notebook.js).
 * ==========================================================================*/
import { makeKnowledgeStore, memoryBackend, idbBackend } from './atlas-knowledge-store.js';

const PREF_KEY = 'intmap_atlas_knowledge';

export function knowledgeOn() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}').on === true; } catch (_) { return false; }
}
/** → the state AFTER the write, read back (a refused write — storage blocked — reports as still off) */
export function setKnowledgeOn(on) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ on: !!on })); } catch (_) { }
  return knowledgeOn();
}

let _store = null;
export function knowledgeStore() {
  if (_store) return _store;
  let backend = null;
  try { if (typeof indexedDB !== 'undefined' && indexedDB) backend = idbBackend(indexedDB, 'intmap-atlas-knowledge'); } catch (_) { backend = null; }
  _store = makeKnowledgeStore(backend || memoryBackend());
  return _store;
}
