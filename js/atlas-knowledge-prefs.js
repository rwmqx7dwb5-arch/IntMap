/* ============================================================================
 *  IntMap · Atlas — THE KNOWLEDGE LAYER'S SWITCHES, AND THEIR SETTINGS ROW   (atlas-knowledge)     js/atlas-knowledge-prefs.js
 * ----------------------------------------------------------------------------
 *  Kept knowledge is read back into later answers, so it is the reader's to turn on: OFF until they do (the opposite
 *  default to the notebook's `keep`, which is a record of what happened). Two switches, one stored value:
 *      on     claims are kept on THIS device (IndexedDB) and read back — nothing leaves the device
 *      sync   the kept claims are also copied to the reader's IntMap account so every device they sign in on has them
 *             (js/atlas-knowledge-sync.js). Only meaningful with `on`, only for a signed-in reader, and a SECOND choice:
 *             turning the first on never sends anything anywhere.
 *  This file holds ONLY that and the Settings row that flips it, so the page can load it at boot without loading the
 *  store, the evidence rules or the sync (each is imported when the row is used). The row is a three-way choice in
 *  Settings — off / this device / my account — and Atlas's `knowledge.setting` flips the same stored value.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';
/* two-language wording as data: the array [en, jp] */
const T = IntMapLang.pickArgs();

export const PREF_KEY = 'intmap_atlas_knowledge';
const SELECT_ID = 'setting-atlas-knowledge';
const NOTE_ID = 'setting-atlas-knowledge-note';

export function readKnowledgePrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return { on: p.on === true, sync: p.on === true && p.sync === true }; } catch (_) { return { on: false, sync: false }; }
}
/** → the state AFTER the write, read back (a refused write — storage blocked — reports as it still is) */
export function writeKnowledgePrefs(next) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ on: !!next.on, sync: !!next.on && !!next.sync })); } catch (_) { }
  return readKnowledgePrefs();
}
export const modeOf = (p) => (p.sync ? 'account' : p.on ? 'device' : 'off');

/* the Settings row. `host` is the page's own state (the signed-in user). Wired once the page's DOM is ready (the call below). */
function wireKnowledgeSettings(doc, host) {
  host = host || (() => (typeof window !== 'undefined' && typeof window.IntMapKnowledgeHost === 'function' ? window.IntMapKnowledgeHost() : null));
  const sel = doc && doc.getElementById ? doc.getElementById(SELECT_ID) : null;
  if (!sel) return null;
  const note = () => doc.getElementById(NOTE_ID);
  const say = (pair) => { const n = note(); if (n) n.textContent = (document.documentElement.lang || '').toLowerCase().startsWith('ja') ? pair[1] : pair[0]; };
  const paint = async () => {
    const p = readKnowledgePrefs(); sel.value = modeOf(p);
    if (!p.on) { say(T('Off. Nothing is kept and nothing is read back.', 'オフです。何も保存せず、何も読み返しません。')); return; }
    let n = null; try { n = await (await import('./atlas-knowledge.js')).knowledgeStore().count(); } catch (_) { }
    say(T((p.sync ? 'Kept on this device and in your account' : 'Kept on this device only') + (n == null ? '' : ' · ' + n + ' claim(s)'), (p.sync ? 'この端末とアカウントに保存' : 'この端末にだけ保存') + (n == null ? '' : ' · ' + n + ' 件')));
  };
  sel.addEventListener('change', async () => {
    const want = sel.value;
    if (want === 'account' && !(host && host() && host().user)) { writeKnowledgePrefs({ on: true, sync: false }); await paint(); say(T('Sign in to keep it in your account — it is kept on this device for now.', 'アカウントに保存するにはログインが必要です。いまはこの端末にだけ保存します。')); return; }
    writeKnowledgePrefs({ on: want !== 'off', sync: want === 'account' });
    await paint();
    if (want === 'account') { try { const m = await import('./atlas-knowledge.js'); await m.syncKnowledge(); await paint(); } catch (_) { } }
  });
  paint();
  return { paint };
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { try { wireKnowledgeSettings(document); } catch (_) { } });
