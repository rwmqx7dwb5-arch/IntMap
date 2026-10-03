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

const SIGN_IN = { code: 'SIGN_IN_REQUIRED', category: 'input', retryable: false, userGoalSatisfied: false, produced: [] };
const needs = (code, extra) => ({ meta: Object.assign({ code, category: 'input', retryable: true, userGoalSatisfied: false, produced: [] }, extra || null) });

/* the list the model reads back: every place, its collection, position and note — nothing summarised */
function placeLines(places, esc) {
  return places.map((p) => '<div style="font-size:12px;line-height:1.6;"><b>' + esc(p.name) + '</b>'
    + (p.collection ? ' · ' + esc(p.collection) : '')
    + ' · ' + (+p.lat).toFixed(5) + ', ' + (+p.lng).toFixed(5)
    + (p.note ? ' — ' + esc(p.note) : '') + ' <span style="opacity:.6;">[id ' + esc(p.id) + ']</span></div>').join('');
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
      { in: 'more-features', at: 190, text: '{"type":"myPlaces","collection"?:str,"name"?:str} = READ THE READER\'S SAVED PLACES (マイプレイス / saved places in the account): each name, collection, coordinates, note and id. Use to answer 「保存した場所は？」「京都旅行のリストを教えて」, "what places have I saved?", and before showing, comparing or routing between saved places; ' },
    ],
    schema: () => ({ type: 'object', properties: { collection: str(), name: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to see your saved places.', '保存した場所を見るにはログインしてください。')), { meta: SIGN_IN });
      const M = await import('./my-places.js');
      const r = await M.listPlaces(HOST.DB);
      if (!r.ok) return R(false, warn(esc(M.placeFailureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : null);
      const hit = M.matchPlaces(r.places, { collection: a.collection, name: a.name });
      if (!r.places.length) return R(true, note(esc(T('No saved places yet.', '保存した場所はまだありません。'))));
      if (!hit.length) return R(true, note(esc(T('No saved place matches that. Collections: ', '一致する保存場所はありません。コレクション: ') + (M.groupPlaces(r.places).map((g) => g.collection || T('Unfiled', '未分類')).join(' · ')))));
      return R(true, '<div style="font-weight:600;margin:2px 0 6px;">' + esc(T('My places — ' + hit.length, 'マイプレイス — ' + hit.length + ' 件')) + '</div>' + placeLines(hit, esc));
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
];
