/* ============================================================================
 *  IntMap · Atlas capabilities — the `places.*` namespace   (js/atlas-cap-places.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *
 *  (my-places) The account's saved places — the same doors the account sheet and the pin popup use
 *  (js/my-places.js), so a place Atlas saves is the place the reader sees in Account ▸ My places on
 *  every device. Saving is idempotent in the DATABASE (one row per position, ~1 m): asked twice, the
 *  second call answers «already saved» (.agents/rules/one-pass-or-a-reason.md) — nothing here
 *  remembers what was saved, and nothing here refuses a repeat.
 *  ⚠ A PLACE IS NEVER THE MAP CENTRE BY DEFAULT (CONSTITUTION.md §5): with no place, no position and
 *  no pin named, places.save asks for one.
 * ==========================================================================*/
import { str, num, one } from './atlas-caps.js';
import { IntMapLang } from './lang-registry.js';
import { MapState } from './map-state.js';   /* (collection-workspace) «this map» is the share link's fragment */

const SIGN_IN = { code: 'SIGN_IN_REQUIRED', category: 'input', retryable: false, userGoalSatisfied: false, produced: [] };
const needs = (code, extra) => ({ meta: Object.assign({ code, category: 'input', retryable: true, userGoalSatisfied: false, produced: [] }, extra || null) });

/* the list the model reads back: every place, its collection, position and note — nothing summarised */
function placeLines(places, esc) {
  return places.map((p) => '<div style="font-size:12px;line-height:1.6;"><b>' + esc(p.name) + '</b>'
    + (p.collection ? ' · ' + esc(p.collection) : '')
    + ' · ' + (+p.lat).toFixed(5) + ', ' + (+p.lng).toFixed(5)
    + (p.note ? ' — ' + esc(p.note) : '') + ' <span style="opacity:.6;">[id ' + esc(p.id) + ']</span></div>').join('');
}

/* (collection-workspace) the saved maps and the published links, read back the same way */
function viewLines(views, esc, T) {
  return views.map((v) => '<div style="font-size:12px;line-height:1.6;"><b>' + esc(v.name) + '</b> · ' + esc(T('map', '地図'))
    + (v.collection ? ' · ' + esc(v.collection) : '')
    + (v.note ? ' — ' + esc(v.note) : '') + ' <span style="opacity:.6;">[id ' + esc(v.id) + ']</span></div>').join('');
}
function shareLines(shares, esc, T) {
  return shares.map((s) => '<div style="font-size:12px;line-height:1.6;">' + esc(T('Published', '公開中')) + ': <b>'
    + esc(s.collection == null ? T('everything', 'すべて') : (s.collection || T('Unfiled', '未分類'))) + '</b> «' + esc(s.title) + '» — ' + esc(s.url) + '</div>').join('');
}

/* Which collection a request names, among the ones the account actually has — never a guess:
   `all:"everything"` is everything (null), a name must match an existing collection (width/case-insensitive). */
const _norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
async function resolveCollection(a, M, HOST) {
  if (a.all === 'everything') return { ok: true, collection: null };
  if (a.all === 'unfiled') return { ok: true, collection: '' };
  if (a.collection == null || !String(a.collection).trim()) return { ok: false, code: 'NEEDS_INPUT' };
  const [rp, rv] = await Promise.all([M.listPlaces(HOST.DB), M.listViews(HOST.DB)]);
  if (!rp.ok) return { ok: false, code: 'FAILED', error: rp.error };
  const names = M.groupCollection(rp.places, rv.ok ? rv.views : []).map((g) => g.collection);
  const hit = names.find((n) => _norm(n) === _norm(a.collection));
  return hit != null ? { ok: true, collection: hit } : { ok: false, code: 'NOT_FOUND', names };
}

export default [
  {
    row: ['places.save',                'savePlace',      'saveToMyPlaces,bookmarkPlace,rememberPlace,keepPlace', 'places', 'none', 'account.places', 'explanation', 'persist', 'explicit', 'place?', ''],
    doc: [
      { in: 'more-features', at: 180, text: '{"type":"savePlace","place"?:str,"country"?:str,"lng"?:num,"lat"?:num,"pinId"?:str,"name"?:str,"note"?:str,"collection"?:str} = SAVE A PLACE TO THE READER\'S ACCOUNT — 「マイプレイス」, the reader\'s own saved places, kept across devices (unlike a pin, which lasts only this session). Give the place by name (with its country), by coordinates, or by the id of a pin already on the map; "name" is what it will be called, "note" a line of text, "collection" groups places ("Field trip", 「京都旅行」). Saving the same position again updates it and says it was already saved. Use for 「この場所を保存して」「ブックマークして」「マイプレイスに追加」, "save this place", "remember Kyoto Station for my trip"; ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), country: str(), lng: num(-180, 180), lat: num(-90, 90), pinId: str(), name: str(), note: str(), collection: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST, GLEDGER = K.GLEDGER, geocode = K.geocode, _lnorm = K._lnorm;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to keep places in your account.', '場所をアカウントに保存するにはログインしてください。')), { meta: SIGN_IN });
      let lng = null, lat = null, label = '', pinNote = '';
      if (a.pinId != null && a.pinId !== '') {
        const pin = (HOST.userPins || []).find((p) => String(p.id) === String(a.pinId));
        if (!pin) return R(false, warn(T('No pin on the map has that id', 'そのidのピンは地図上にありません') + ': ' + esc(a.pinId)), needs('NOT_FOUND', { semanticTarget: String(a.pinId) }));
        lng = pin.lng; lat = pin.lat; label = (pin.meta && pin.meta.title) || ''; pinNote = (pin.meta && pin.meta.description) || '';
      } else if (a.lng != null && a.lat != null && isFinite(+a.lng) && isFinite(+a.lat)) {
        lng = +a.lng; lat = +a.lat;
      } else if (a.place) {
        const pp = String(a.place || '').trim(), pc = String(a.country || '').trim();
        const q = (pc && pp && _lnorm(pp).indexOf(_lnorm(pc)) < 0) ? (pp + ', ' + pc) : pp;   /* the country once, as map.pin does */
        const k = GLEDGER.resolve(a.place);
        const ll = (k && k.lng != null) ? { lng: k.lng, lat: k.lat, name: k.canonicalName || k.name } : await geocode(q || a.place);
        if (!ll) return R(false, warn(T('Could not find that place', 'その場所が見つかりません') + ': ' + esc(a.place)), needs('PLACE_NOT_FOUND', { semanticTarget: String(a.place) }));
        lng = ll.lng; lat = ll.lat; label = ll.name || pp;
      } else {
        return R(false, warn(T('Which place should I save? Name it, give coordinates, or point at a pin.', 'どの場所を保存しますか？ 地名・座標・ピンのいずれかを指定してください。')), needs('NEEDS_INPUT'));
      }
      const M = await import('./my-places.js');
      const r = await M.savePlace(HOST.DB, { name: a.name || label || a.place, note: a.note != null ? a.note : (pinNote || null), collection: a.collection, lng, lat, source: 'atlas' });
      if (!r.ok) return R(false, warn(esc(M.placeFailureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : needs(String(r.error || 'failed').toUpperCase()));
      return R(true, note(esc(r.created
        ? T('Saved to My places: ' + r.name + ' (' + r.count + ' saved)', 'マイプレイスに保存しました: ' + r.name + '（計 ' + r.count + ' 件）')
        : T('Already in My places — updated: ' + r.name, 'マイプレイスに保存済みでした（更新）: ' + r.name))), { meta: { code: r.created ? 'OK' : 'ALREADY_SAVED', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'], placeId: String(r.id) } });
    },
  },
  {
    row: ['places.list',                'myPlaces',       'savedPlaces,listPlaces,placeList', 'places', 'none', '', 'explanation', 'read', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 190, text: '{"type":"myPlaces","collection"?:str,"name"?:str} = READ THE READER\'S SAVED PLACES (マイプレイス / saved places in the account): each name, collection, coordinates, note and id — AND the saved maps in the same collections (name, collection, note, id), AND which collections are published as read-only links (with the link). Use to answer 「保存した場所は？」「京都旅行のリストを教えて」, "what places have I saved?", and before showing, comparing or routing between saved places; ' },
    ],
    schema: () => ({ type: 'object', properties: { collection: str(), name: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to see your saved places.', '保存した場所を見るにはログインしてください。')), { meta: SIGN_IN });
      const M = await import('./my-places.js');
      const r = await M.listPlaces(HOST.DB);
      if (!r.ok) return R(false, warn(esc(M.placeFailureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : null);
      /* (collection-workspace) a collection holds maps too, and may be published — read back beside the places */
      const rv = await M.listViews(HOST.DB);
      const views = rv.ok ? rv.views : [];
      let shares = [];
      try { const S = await import('./shared-collection.js'); const rs = await S.listShares(HOST.DB); if (rs.ok) shares = rs.shares; } catch (_) { }
      const hit = M.matchPlaces(r.places, { collection: a.collection, name: a.name });
      const vhit = M.matchPlaces(views, { collection: a.collection, name: a.name });
      if (!r.places.length && !views.length) return R(true, note(esc(T('No saved places or maps yet.', '保存した場所や地図はまだありません。'))));
      if (!hit.length && !vhit.length) return R(true, note(esc(T('No saved place or map matches that. Collections: ', '一致する保存場所・地図はありません。コレクション: ') + (M.groupCollection(r.places, views).map((g) => g.collection || T('Unfiled', '未分類')).join(' · ')))));
      return R(true, '<div style="font-weight:600;margin:2px 0 6px;">' + esc(T('My places — ' + hit.length + ' place(s), ' + vhit.length + ' map(s)', 'マイプレイス — 場所 ' + hit.length + ' 件・地図 ' + vhit.length + ' 件')) + '</div>'
        + placeLines(hit, esc) + viewLines(vhit, esc, T) + shareLines(shares, esc, T));
    },
  },
  {
    row: ['places.show',                'showPlaces',     'showMyPlaces,mapMyPlaces,openSavedPlaces', 'places', 'object', 'map.object', 'object,map', 'session', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 200, text: '{"type":"showPlaces","collection"?:str,"name"?:str,"id"?:str} = PUT THE READER\'S SAVED PLACES ON THE MAP as pins (with their names and notes) and frame them — all of them, one collection, or the place(s) named. Use for 「保存した場所を地図に出して」「京都旅行の場所を表示」, "show my saved places", "show my Field trip places"; ' },
    ],
    schema: () => ({ type: 'object', properties: { collection: str(), name: str(), id: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to show your saved places.', '保存した場所を表示するにはログインしてください。')), { meta: SIGN_IN });
      const M = await import('./my-places.js');
      const r = await M.listPlaces(HOST.DB);
      if (!r.ok) return R(false, warn(esc(M.placeFailureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : null);
      const hit = M.matchPlaces(r.places, { id: a.id, collection: a.collection, name: a.name });
      if (!hit.length) return R(false, warn(esc(r.places.length ? T('No saved place matches that.', '一致する保存場所はありません。') : T('No saved places yet.', '保存した場所はまだありません。'))), needs('NOT_FOUND', { semanticTarget: String(a.name || a.collection || a.id || '') }));
      const ids = M.showPlaces(HOST, hit);
      return R(ids.length > 0, note(esc(T('On the map: ' + hit.length + ' saved place(s)', '地図に表示: 保存場所 ' + hit.length + ' 件'))) + placeLines(hit, esc), { objectIds: ids });
    },
  },
  {
    row: ['places.remove',              'removePlace',    'deletePlace,forgetPlace,unsavePlace', 'places', 'none', 'account.places', 'explanation', 'persist', 'explicit', '', ''],
    doc: [
      { in: 'more-features', at: 210, text: '{"type":"removePlace","id"?:str,"name"?:str,"collection"?:str,"all"?:"collection"} = DELETE SAVED PLACES FROM THE READER\'S ACCOUNT (マイプレイスから削除). Name ONE place by id (from myPlaces) or exact name; to delete a whole collection pass "collection" with "all":"collection". When a name matches several places nothing is deleted and the matches are listed. Use for 「保存した場所を削除」「京都駅をマイプレイスから消して」, "remove Kyoto Station from my places"; ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), name: str(), collection: str(), all: one('collection') } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to manage your saved places.', '保存した場所を管理するにはログインしてください。')), { meta: SIGN_IN });
      if (!a.id && !a.name && !(a.collection && a.all === 'collection')) return R(false, warn(T('Which saved place should I delete?', 'どの保存場所を削除しますか？')), needs('NEEDS_INPUT'));
      const M = await import('./my-places.js');
      const r = await M.listPlaces(HOST.DB);
      if (!r.ok) return R(false, warn(esc(M.placeFailureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : null);
      const hit = M.matchPlaces(r.places, { id: a.id, name: a.name, collection: a.collection });
      if (!hit.length) return R(false, warn(esc(T('No saved place matches that.', '一致する保存場所はありません。'))), needs('NOT_FOUND', { semanticTarget: String(a.name || a.id || a.collection || '') }));
      if (hit.length > 1 && !(a.all === 'collection' && a.collection && !a.name)) {
        return R(false, warn(esc(T('Several saved places match — which one?', '複数の保存場所が一致します。どれですか？'))) + placeLines(hit, esc), needs('AMBIGUOUS'));
      }
      const d = await M.removePlaces(HOST.DB, hit.map((p) => p.id));
      if (!d.ok) return R(false, warn(esc(M.placeFailureText(d.error, lang))));
      return R(true, note(esc(T('Deleted from My places: ', 'マイプレイスから削除しました: ') + hit.map((p) => p.name).join(' · '))));
    },
  },
  /* ══ (collection-workspace) A COLLECTION HOLDS MAPS TOO, AND CAN BE PUBLISHED ═══════════════════════════════════
     The same doors as the «My places» sheet (js/my-places.js saveView / listViews / openView, js/shared-collection.js
     publishCollection / listShares / unpublish), so what Atlas files is what the reader sees on every device.
     Saving the same map twice and publishing a published collection are «already done» in the DATABASE
     (save_view / publish_collection answer created=false) — nothing here remembers or refuses a repeat.
     ⚠ PUBLISHING NAMES ITS COLLECTION: with no collection and no `all`, places.publish asks — it never publishes
     «everything» by default. Its risk is 'external' (whoever has the link reads it) and its confirmation 'explicit'
     (js/atlas-executor.js 4b asks the reader when outside content has been in front of the model this turn). */
  {
    row: ['places.saveView',            'saveMap',        'saveView,saveThisMap,keepThisMap,bookmarkMap', 'places', 'none', 'account.places', 'explanation', 'persist', 'explicit', '', ''],
    doc: [
      { in: 'more-features', at: 220, text: '{"type":"saveMap","name"?:str,"note"?:str,"collection"?:str} = SAVE THE MAP AS IT IS NOW TO THE READER\'S ACCOUNT — the layers that are on, the date on the clock, the base map, the camera and the caption, exactly what a share link holds — under a name, in a collection beside the saved places, so it opens again on any device («保存した地図»). With no name it takes the map\'s caption or the date. Saving the same map again updates it and says it was already saved. Use for 「この地図を保存して」「今の表示を『1914年のヨーロッパ』として保存」「京都旅行に入れておいて」, "save this map", "keep this view as Europe 1914 in my Field trip collection"; ' },
    ],
    schema: () => ({ type: 'object', properties: { name: str(), note: str(), collection: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to keep maps in your account.', '地図をアカウントに保存するにはログインしてください。')), { meta: SIGN_IN });
      const M = await import('./my-places.js');
      let state = '';
      try { const h = MapState.hash(); state = MapState.carries(h) ? h : ''; } catch (_) { state = ''; }
      const r = await M.saveView(HOST.DB, { name: a.name, note: a.note, collection: a.collection, state, lang });
      if (!r.ok) return R(false, warn(esc(M.placeFailureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : needs(String(r.error || 'failed').toUpperCase()));
      return R(true, note(esc(r.created
        ? T('Map saved to My places: ' + r.name + ' (' + r.count + ' saved)', '地図をマイプレイスに保存しました: ' + r.name + '（計 ' + r.count + ' 件）')
        : T('This map was already saved — updated: ' + r.name, 'この地図は保存済みでした（更新）: ' + r.name))), { meta: { code: r.created ? 'OK' : 'ALREADY_SAVED', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'], viewId: String(r.id) } });
    },
  },
  {
    row: ['places.openView',            'openSavedMap',   'openMap,openSavedView,restoreSavedMap,loadSavedMap', 'places', 'time', 'camera,map.layer,time', 'map,time', 'session', 'none', '', ''],   /* observed as notebook.open is: the restore is the share link's own */
    doc: [
      { in: 'more-features', at: 230, text: '{"type":"openSavedMap","name"?:str,"id"?:str,"collection"?:str} = OPEN ONE OF THE READER\'S SAVED MAPS — the whole map comes back as it was saved (layers, date, base map, camera, caption), the way its share link would open it. Name it (exact or part of its name) or give its id from myPlaces; when several match, nothing is opened and they are listed. Use for 「保存した『1914年のヨーロッパ』を開いて」「京都旅行の地図を出して」, "open my saved map Europe 1914"; ' },
    ],
    schema: () => ({ type: 'object', properties: { name: str(), id: str(), collection: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to open your saved maps.', '保存した地図を開くにはログインしてください。')), { meta: SIGN_IN });
      if (!a.id && !a.name && !a.collection) return R(false, warn(T('Which saved map should I open?', 'どの保存した地図を開きますか？')), needs('NEEDS_INPUT'));
      const M = await import('./my-places.js');
      const r = await M.listViews(HOST.DB);
      if (!r.ok) return R(false, warn(esc(M.placeFailureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : null);
      const hit = M.matchPlaces(r.views, { id: a.id, name: a.name, collection: a.collection });
      if (!hit.length) return R(false, warn(esc(r.views.length ? T('No saved map matches that.', '一致する保存した地図はありません。') : T('No saved maps yet.', '保存した地図はまだありません。'))) + viewLines(r.views, esc, T), needs('NOT_FOUND', { semanticTarget: String(a.name || a.id || a.collection || '') }));
      if (hit.length > 1) return R(false, warn(esc(T('Several saved maps match — which one?', '複数の保存した地図が一致します。どれですか？'))) + viewLines(hit, esc, T), needs('AMBIGUOUS'));
      const o = M.openView(hit[0]);
      if (!o.ok) return R(false, warn(esc(M.placeFailureText('no_map', lang))), needs('NO_MAP'));
      return R(true, note(esc(T('Opened the saved map: ' + hit[0].name, '保存した地図を開きました: ' + hit[0].name))), { meta: { code: 'OK', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['map', 'time'] } });
    },
  },
  {
    row: ['places.publish',             'publishCollection', 'sharePlaces,shareCollection,publishPlaces,publishMaps', 'places', 'none', 'account.places', 'explanation', 'external', 'explicit', '', ''],
    doc: [
      { in: 'more-features', at: 240, text: '{"type":"publishCollection","collection"?:str,"all"?:"everything"|"unfiled","title"?:str} = PUBLISH ONE OF THE READER\'S COLLECTIONS AS A READ-ONLY LINK — anyone who opens the link sees that collection as it is now: its places as pins (names, notes, positions) and its saved maps to open, under "title" (default: the collection\'s name); never the reader\'s account or e-mail. Signed-in visitors can copy it into their own My places. Name the collection (it must exist), or pass "all":"everything" for every place and map, "all":"unfiled" for the ones in no collection; with neither, ASK — never publish everything by default. Publishing a published collection returns the SAME link. THE RESULT CARRIES THE LINK — give it to the user verbatim. Use for 「京都旅行を公開して」「このコレクションの共有リンクを作って」「クラスに配れるリンクにして」, "share my Field trip collection", "publish my places as a link"; ' },
    ],
    schema: () => ({ type: 'object', properties: { collection: str(), all: one('everything', 'unfiled'), title: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to publish a collection.', 'コレクションを公開するにはログインしてください。')), { meta: SIGN_IN });
      const M = await import('./my-places.js');
      const S = await import('./shared-collection.js');
      const c = await resolveCollection(a, M, HOST);
      if (!c.ok && c.code === 'NEEDS_INPUT') return R(false, warn(T('Which collection should I publish? Name it, or say «everything».', 'どのコレクションを公開しますか？ 名前か「すべて」を指定してください。')), needs('NEEDS_INPUT'));
      if (!c.ok && c.code === 'NOT_FOUND') return R(false, warn(esc(T('There is no collection by that name. Collections: ', 'その名前のコレクションはありません。コレクション: ') + c.names.map((n) => n || T('Unfiled', '未分類')).join(' · '))), needs('NOT_FOUND', { semanticTarget: String(a.collection || '') }));
      if (!c.ok) return R(false, warn(esc(M.placeFailureText(c.error, lang))));
      const title = a.title || c.collection || (c.collection === '' ? T('Places', '場所') : T('Places and maps', '場所と地図'));
      const r = await S.publishCollection(HOST.DB, c.collection, title);
      if (!r.ok) return R(false, warn(esc(S.shareFailureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : needs(String(r.error || 'failed').toUpperCase()));
      return R(true, note(esc(r.created
        ? T('Published «' + title + '» (' + r.places + ' place(s), ' + r.views + ' map(s)) — read-only link: ', '「' + title + '」を公開しました（場所 ' + r.places + ' 件・地図 ' + r.views + ' 件）。閲覧専用リンク: ')
        : T('«' + title + '» was already published — its link: ', '「' + title + '」は公開済みでした。リンク: ') ) + esc(r.url)),
        { meta: { code: r.created ? 'OK' : 'ALREADY_PUBLISHED', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'], link: r.url } });
    },
  },
  {
    row: ['places.unpublish',           'unpublishCollection', 'stopSharingCollection,unsharePlaces,stopPublishing', 'places', 'none', 'account.places', 'explanation', 'persist', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 250, text: '{"type":"unpublishCollection","collection"?:str,"all"?:"everything"|"unfiled"} = STOP PUBLISHING ONE OF THE READER\'S COLLECTIONS — its read-only link stops working at once (publishing again makes a new link). Name the collection, or "all":"everything" / "all":"unfiled" for those shares. Use for 「京都旅行の公開をやめて」「共有リンクを無効にして」, "stop sharing my Field trip collection"; ' },
    ],
    schema: () => ({ type: 'object', properties: { collection: str(), all: one('everything', 'unfiled') } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to manage your published collections.', '公開したコレクションを管理するにはログインしてください。')), { meta: SIGN_IN });
      if (!a.collection && !a.all) return R(false, warn(T('Which collection should I stop publishing?', 'どのコレクションの公開をやめますか？')), needs('NEEDS_INPUT'));
      const S = await import('./shared-collection.js');
      const rs = await S.listShares(HOST.DB);
      if (!rs.ok) return R(false, warn(esc(S.shareFailureText(rs.error, lang))), rs.error === 'sign_in' ? { meta: SIGN_IN } : null);
      const want = a.all === 'everything' ? null : (a.all === 'unfiled' ? '' : _norm(a.collection));
      const hit = rs.shares.filter((s) => (want === null ? s.collection == null : (s.collection != null && _norm(s.collection) === want)));
      /* not published is the state that was asked for: «already done», not a failure (.agents/rules/one-pass-or-a-reason.md) */
      if (!hit.length) return R(true, note(esc(T('That collection is not published — nothing to stop.', 'そのコレクションは公開されていません（やめるものはありません）。'))) + shareLines(rs.shares, esc, T), { meta: { code: 'ALREADY_UNPUBLISHED', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'] } });
      const d = await S.unpublish(HOST.DB, hit.map((s) => s.id));
      if (!d.ok) return R(false, warn(esc(S.shareFailureText(d.error, lang))));
      return R(true, note(esc(T('No longer published: ', '公開をやめました: ') + hit.map((s) => s.title).join(' · '))));
    },
  },
];
