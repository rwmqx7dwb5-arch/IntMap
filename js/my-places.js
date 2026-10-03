/* ============================================================================
 *  IntMap · MY PLACES — places that belong to the account, on every device   (my-places)
 * ----------------------------------------------------------------------------
 *  The reader-facing half of supabase/migrations/20261003140000_saved_places.sql. A pin, a search
 *  result or the view in front of the reader becomes a named place with a note and an optional
 *  collection, saved to the ACCOUNT — so it is back on the map after a reload and on any other device.
 *
 *  ONE DOOR IN: every save goes through public.save_place() (the pin popup, this sheet, Atlas's
 *  places.save). The database decides the account (auth.uid()) and the identity of a place (its
 *  position at ~1 m — the session pins' own rule), so saving a saved place answers «already saved» and
 *  never makes a second row. Reading, editing and deleting are the owner's own rows under RLS.
 *  SHOWING places reuses the session pins (HOST.addPin): a saved place on the map IS a pin, with its
 *  name and note in the popup, listed in Objects, measured from, removed like any other — not a second
 *  marker system.
 *
 *  Reached from: the account sheet (js/auth-ui.js), the pin popup (js/app-body.js) and Atlas
 *  (js/atlas-cap-places.js). Loaded on demand. Its look reuses `.acct-*` (css/intmap.css); the rules of
 *  its own are injected when the sheet first opens.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapGeoEngine } from './geo-engine.js';   /* the renderer, through the contract */

const COLS = 'id,name,note,collection,lng,lat,zoom,source,created_at,updated_at';

/* ── pure helpers (tests/platform-backend-checks.test.mjs runs them in Node) ───────────────────── */

/** A name for a place that has none yet: its position, as the pin popup writes it. */
export function placeLabel(lng, lat) {
  const a = Math.abs(+lat).toFixed(4) + '°' + (+lat >= 0 ? 'N' : 'S');
  const b = Math.abs(+lng).toFixed(4) + '°' + (+lng >= 0 ? 'E' : 'W');
  return a + ' ' + b;
}

/** Places grouped by collection, the unfiled group last, each group newest first. */
export function groupPlaces(places) {
  const by = new Map();
  (Array.isArray(places) ? places : []).forEach((p) => {
    const k = String((p && p.collection) || '');
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(p);
  });
  const keys = Array.from(by.keys()).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  return keys.map((k) => ({
    collection: k,
    places: by.get(k).slice().sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || ''))),
  }));
}

/** Which saved places a request names: by id, by name (case- and width-insensitive, whole or part),
 *  by collection — or all of them when nothing is named. Never guesses beyond what was named. */
export function matchPlaces(places, q) {
  const list = Array.isArray(places) ? places : [];
  q = q || {};
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (q.id) return list.filter((p) => String(p.id) === String(q.id));
  let out = list;
  if (q.collection) { const c = norm(q.collection); out = out.filter((p) => norm(p.collection) === c); }
  if (q.name) {
    const n = norm(q.name);
    const exact = out.filter((p) => norm(p.name) === n);
    out = exact.length ? exact : out.filter((p) => norm(p.name).includes(n));
  }
  return out;
}

/* ── the doors ────────────────────────────────────────────────────────────────────────────────── */

function errOf(error) {
  const c = error && error.code;
  if (c === '42501') return 'sign_in';
  if (c === '54000') return 'full';
  if (c === '22023' || c === '23514') return 'invalid';
  return 'failed';
}

/** Save a place. @returns {Promise<{ok, id?, created?, count?, error?}>} */
export async function savePlace(DB, p) {
  if (!DB) return { ok: false, error: 'unavailable' };
  p = p || {};
  const lng = +p.lng, lat = +p.lat;
  if (!isFinite(lng) || !isFinite(lat)) return { ok: false, error: 'invalid' };
  const name = String(p.name || '').trim() || placeLabel(lng, lat);
  try {
    const { data, error } = await DB.rpc('save_place', {
      p_name: name.slice(0, 120), p_lng: lng, p_lat: lat,
      p_note: p.note == null ? null : String(p.note).slice(0, 2000),
      p_collection: p.collection == null ? null : String(p.collection).trim().slice(0, 60),
      p_zoom: p.zoom == null || !isFinite(+p.zoom) ? null : Math.max(0, Math.min(24, +p.zoom)),
      p_source: p.source || null,
    });
    if (error) return { ok: false, error: errOf(error) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.place_id) return { ok: false, error: 'failed' };
    return { ok: true, id: row.place_id, created: !!row.created, count: Number(row.place_count) || 0, name };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** The account's places. @returns {Promise<{ok, places?, error?}>} */
export async function listPlaces(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.from('saved_places').select(COLS).order('created_at', { ascending: false });
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, places: Array.isArray(data) ? data : [] };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Delete places by id. @returns {Promise<{ok, removed?, error?}>} */
export async function removePlaces(DB, ids) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
  if (!list.length) return { ok: true, removed: 0 };
  try {
    const { data, error } = await DB.from('saved_places').delete().in('id', list).select('id');
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, removed: Array.isArray(data) ? data.length : 0 };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Edit a place's words (name / note / collection). @returns {Promise<{ok, error?}>} */
async function updatePlace(DB, id, patch) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const row = {};
  if (patch && patch.name != null) row.name = String(patch.name).trim().slice(0, 120);
  if (patch && patch.note != null) row.note = String(patch.note).slice(0, 2000);
  if (patch && patch.collection != null) row.collection = String(patch.collection).trim().slice(0, 60);
  if (!Object.keys(row).length) return { ok: true };
  try {
    const { error } = await DB.from('saved_places').update(row).eq('id', String(id));
    return error ? { ok: false, error: errOf(error) } : { ok: true };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Put places on the map as pins (the session pin system — popup, Objects list, measure, remove).
 *  Fits the camera to them. @returns {string[]} the pin ids (an already-pinned place returns its pin). */
export function showPlaces(HOST, places, opts) {
  const ids = [];
  const list = Array.isArray(places) ? places : [];
  if (!HOST || typeof HOST.addPin !== 'function' || !list.length) return ids;
  const src = IntMapLang.t(HOST.lang, 'My places', 'マイプレイス');
  list.forEach((p) => {
    try {
      const id = HOST.addPin(+p.lng, +p.lat, {
        title: String(p.name || ''), description: String(p.note || ''),
        source: src + (p.collection ? ' · ' + p.collection : ''), savedPlaceId: String(p.id),
      });
      if (id != null) ids.push(String(id));
    } catch (_) { }
  });
  if (!(opts && opts.fly === false)) {
    try {
      const GE = IntMapGeoEngine;
      if (GE && GE.hasRenderer && GE.hasRenderer()) {
        if (list.length === 1) {
          const p = list[0];
          GE.camera.flyTo({ center: [+p.lng, +p.lat], zoom: p.zoom != null ? +p.zoom : Math.max(GE.camera.getZoom(), 12), duration: 900 });
        } else {
          let w = 180, s = 90, e = -180, n = -90;
          list.forEach((p) => { w = Math.min(w, +p.lng); e = Math.max(e, +p.lng); s = Math.min(s, +p.lat); n = Math.max(n, +p.lat); });
          GE.camera.fitBounds([[w, s], [e, n]], { padding: 70, maxZoom: 13, duration: 900 });
        }
      }
    } catch (_) { }
  }
  return ids;
}

/** The sentence for a failed door, in the reader's language. */
export function placeFailureText(error, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (error === 'sign_in') return T('Sign in to keep places in your account.', '場所をアカウントに保存するにはログインしてください。');
  if (error === 'full') return T('This account already holds the most places it can. Delete some to save more.', 'このアカウントに保存できる場所の上限に達しています。いくつか削除してから保存してください。');
  if (error === 'invalid') return T('That place needs a name and a position on the globe.', '場所には名前と地球上の位置が必要です。');
  if (error === 'unavailable') return T('The account service is not reachable right now.', 'アカウントのサービスに接続できません。');
  return T('Could not reach your places. Please try again.', '場所を取得できませんでした。もう一度お試しください。');
}

/** The pin popup's «Save» (js/app-body.js): the pin's own words become the place's. */
export async function savePinAsPlace(HOST, pin) {
  const lang = HOST && HOST.lang;
  const toast = (s) => { try { HOST.imToast(s); } catch (_) { } };
  if (!HOST || !HOST.user) { toast(placeFailureText('sign_in', lang)); try { HOST && HOST.openAuthModal && HOST.openAuthModal(); } catch (_) { } return { ok: false, error: 'sign_in' }; }
  const meta = (pin && pin.meta) || {};
  const r = await savePlace(HOST.DB, { name: meta.title, note: meta.description || '', lng: pin.lng, lat: pin.lat, source: 'pin' });
  if (!r.ok) { toast(placeFailureText(r.error, lang)); return r; }
  try { pin.meta = Object.assign({}, meta, { title: meta.title || r.name, savedPlaceId: String(r.id) }); } catch (_) { }
  toast(r.created
    ? IntMapLang.t(lang, 'Saved to My places: ' + r.name, 'マイプレイスに保存しました: ' + r.name)
    : IntMapLang.t(lang, 'Already in My places: ' + r.name, 'マイプレイスに保存済みです: ' + r.name));
  return r;
}

/* ── the sheet ────────────────────────────────────────────────────────────────────────────────── */

function el(tag, props, kids) {
  const n = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    if (k === 'text') n.textContent = props[k];
    else if (k === 'cls') n.className = props[k];
    else n.setAttribute(k, props[k]);
  }
  (kids || []).forEach((c) => { if (c) n.appendChild(c); });
  return n;
}

function ensureStyle() {
  if (document.getElementById('mpl-css')) return;
  const st = document.createElement('style'); st.id = 'mpl-css';
  st.textContent = '.mpl-lead{margin:2px 0 14px;font-size:13px;line-height:1.55;color:var(--text-muted);}'
    + '.mpl-add{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 8px;}'
    + '.mpl-add input{width:100%;box-sizing:border-box;padding:9px 11px;border-radius:10px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:13px;}'
    + '.mpl-add input.mpl-name{grid-column:1 / span 2;}'
    + '.mpl-btns{display:flex;gap:8px;margin:0 0 14px;}'
    + '.mpl-btns button{flex:1;}'
    + '.mpl-row{display:flex;align-items:center;gap:8px;padding:8px 0;}'
    + '.mpl-row + .mpl-row{box-shadow:inset 0 0.5px 0 rgba(128,128,128,0.22);}'
    + '.mpl-txt{flex:1;min-width:0;cursor:pointer;border:none;background:transparent;padding:0;text-align:left;font:inherit;color:inherit;}'
    + '.mpl-txt b{display:block;font-size:13.5px;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.mpl-txt span{display:block;font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.mpl-edit{flex:1;min-width:0;box-sizing:border-box;padding:7px 10px;border-radius:9px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:13px;}'
    + '.mpl-ic{flex:0 0 auto;border:none;background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;padding:6px 8px;border-radius:8px;}'
    + '.mpl-ic:hover{background:rgba(128,128,128,0.12);color:var(--text-main);}'
    + '.mpl-ic.mpl-del:hover{background:#ff3b30;color:#fff;}';
  document.head.appendChild(st);
}

/** Open the «My places» sheet. `HOST` is the app host (DB, user, lang, addPin, imToast, openAuthModal). */
export async function openMyPlaces(HOST) {
  const lang = HOST && HOST.lang;
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (!HOST || !HOST.user) { try { HOST && HOST.openAuthModal && HOST.openAuthModal(); } catch (_) { } return; }
  ensureStyle();
  const old = document.getElementById('mpl-modal'); if (old) old.remove();

  const msg = el('p', { cls: 'acct-msg', role: 'status', 'aria-live': 'polite' });
  const list = el('div', { id: 'mpl-list' });
  const name = el('input', { cls: 'mpl-name', id: 'mpl-name', type: 'text', maxlength: '120', 'aria-label': T('Name of the place', '場所の名前'), placeholder: T('Name — e.g. Meeting point', '名前（例: 集合場所）') });
  const coll = el('input', { id: 'mpl-coll', type: 'text', maxlength: '60', 'aria-label': T('Collection', 'コレクション'), placeholder: T('Collection (optional)', 'コレクション（任意）') });
  const note = el('input', { id: 'mpl-note', type: 'text', maxlength: '2000', 'aria-label': T('Note', 'メモ'), placeholder: T('Note (optional)', 'メモ（任意）') });
  const saveView = el('button', { cls: 'acct-btn', id: 'mpl-save-view', text: T('Save the map centre', '地図の中心を保存') });
  saveView.dataset.effect = 'private';   /* writes the reader's own row (save_place) — what Atlas's control press reads (scripts/data-effects.mjs) */
  const showAll = el('button', { cls: 'acct-btn acct-btn-quiet', id: 'mpl-show-all', text: T('Show all on the map', 'すべて地図に表示') });
  /* (watch-places) a saved place can be watched — earthquakes, warnings, volcanoes and news near it (js/place-watch.js) */
  const watchBtn = el('button', { cls: 'acct-btn acct-btn-quiet', id: 'mpl-watch', text: T('Watch places…', '見守る場所…') });
  const close = el('button', { cls: 'acct-close', id: 'mpl-close', text: T('Close', '閉じる') });
  const sheet = el('div', { cls: 'acct-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mpl-h', tabindex: '-1' }, [
    el('h2', { cls: 'acct-h', id: 'mpl-h', text: T('My places', 'マイプレイス') }),
    el('p', { cls: 'mpl-lead', text: T('Places saved to your account — on the map on every device you sign in on. Save one here, from a pin’s popup, or by asking Atlas.', 'アカウントに保存した場所です。ログインしたどの端末でも地図に出せます。ここ・ピンのポップアップ・Atlas への依頼から保存できます。') }),
    el('div', { cls: 'acct-grp-t', text: T('Save a place', '場所を保存') }),
    el('div', { cls: 'acct-card' }, [el('div', { cls: 'mpl-add' }, [name, coll, note]), el('div', { cls: 'mpl-btns' }, [saveView])]),
    msg,
    el('div', { cls: 'mpl-btns' }, [showAll, watchBtn]),
    list, close,
  ]);
  const m = el('div', { id: 'mpl-modal' }, [sheet]);
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:calc(var(--z-toast) + 2001);padding:20px;';
  const shut = () => { try { m.remove(); } catch (_) { } };
  close.onclick = shut;

  let places = [];
  const render = () => {
    list.textContent = '';
    if (!places.length) {
      list.appendChild(el('div', { cls: 'acct-card' }, [el('div', { cls: 'mpl-lead', text: T('No places yet. Save the map centre above, or open a pin and press Save.', 'まだ場所がありません。上で地図の中心を保存するか、ピンを開いて「保存」を押してください。') })]));
      showAll.disabled = true; return;
    }
    showAll.disabled = false;
    groupPlaces(places).forEach((g) => {
      list.appendChild(el('div', { cls: 'acct-grp-t', text: (g.collection || T('Unfiled', '未分類')) + ' · ' + g.places.length }));
      list.appendChild(el('div', { cls: 'acct-card' }, g.places.map((p) => {
        const txt = el('button', { cls: 'mpl-txt', type: 'button', title: T('Show on the map', '地図に表示') }, [
          el('b', { text: p.name }), el('span', { text: p.note || placeLabel(p.lng, p.lat) }),
        ]);
        const show = () => { showPlaces(HOST, [p]); shut(); };
        txt.onclick = show;
        const ren = el('button', { cls: 'mpl-ic', text: T('Rename', '名前変更') });
        ren.dataset.effect = 'private';
        /* the name is edited IN the row — window.prompt is not used in the account sheets (docs/architecture/08-ui.md §8.1.2:
           no styling, no translation, and on a phone it opens under the page's origin rather than IntMap's name) */
        let editing = null;
        ren.onclick = async () => {
          if (!editing) {
            editing = el('input', { cls: 'mpl-edit', type: 'text', maxlength: '120', 'aria-label': T('New name', '新しい名前') });
            editing.value = p.name;
            editing.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ren.click(); } else if (e.key === 'Escape') { e.stopPropagation(); render(); } };
            txt.replaceWith(editing); ren.textContent = T('Save', '保存');
            try { editing.focus(); editing.select(); } catch (_) { }
            return;
          }
          const v = editing.value.trim();
          if (!v || v === p.name) { render(); return; }
          const r = await updatePlace(HOST.DB, p.id, { name: v });
          if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
          p.name = v.slice(0, 120); render();
        };
        const del = el('button', { cls: 'mpl-ic mpl-del', text: T('Delete', '削除') });
        del.dataset.effect = 'destructive';
        /* a delete cannot be undone, so the first press arms it and says so; the second, within a few seconds, deletes */
        let armed = 0;
        del.onclick = async () => {
          if (Date.now() - armed > 4000) { armed = Date.now(); del.textContent = T('Delete?', '削除する？'); setTimeout(() => { if (del.isConnected && Date.now() - armed >= 4000) del.textContent = T('Delete', '削除'); }, 4100); return; }
          const r = await removePlaces(HOST.DB, [p.id]);
          if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
          places = places.filter((x) => x.id !== p.id); render();
          msg.textContent = T('Deleted: ' + p.name, '削除しました: ' + p.name);
        };
        return el('div', { cls: 'mpl-row' }, [txt, ren, del]);
      })));
    });
  };
  const reload = async () => {
    const r = await listPlaces(HOST.DB);
    if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
    places = r.places; render();
  };
  showAll.onclick = () => { showPlaces(HOST, places); shut(); };
  watchBtn.onclick = () => { shut(); import('./place-watch.js').then((M) => M.openWatchDigest(HOST)).catch(() => { }); };
  saveView.onclick = async () => {
    let c = null, z = null;
    try { const GE = IntMapGeoEngine; if (GE && GE.hasRenderer && GE.hasRenderer()) { c = GE.camera.getCenter(); z = GE.camera.getZoom(); } } catch (_) { }
    const lng = c && (Array.isArray(c) ? c[0] : c.lng), lat = c && (Array.isArray(c) ? c[1] : c.lat);
    if (lng == null || lat == null) { msg.textContent = placeFailureText('invalid', lang); return; }
    saveView.disabled = true;
    const r = await savePlace(HOST.DB, { name: name.value, collection: coll.value, note: note.value, lng, lat, zoom: z, source: 'reader' });
    saveView.disabled = false;
    if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
    msg.textContent = r.created ? T('Saved: ' + r.name, '保存しました: ' + r.name) : T('Already saved — updated: ' + r.name, '保存済みの場所を更新しました: ' + r.name);
    name.value = ''; note.value = '';
    await reload();
  };

  try {
    if (window.IntMapDialog) window.IntMapDialog.open(m, { panel: sheet, labelledby: 'mpl-h', backdrop: true, close: shut });
    else document.body.appendChild(m);
  } catch (_) { document.body.appendChild(m); }
  try { sheet.focus(); } catch (_) { }
  list.appendChild(el('p', { cls: 'mpl-lead', text: T('Reading your places…', '場所を読み込み中…') }));
  await reload();
}
