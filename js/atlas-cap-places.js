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
 *
 *  (watch-places) A saved place can be WATCHED — places.watch / places.unwatch / places.watchDigest /
 *  places.watchSeen run the same doors as Account ▸ Watched places (js/place-watch.js). The digest is
 *  the records themselves (kind, measure, distance, time, source, link), handed back whole as
 *  `exec.watchDigest` — Atlas explains them; nothing here asks a model whether something happened.
 *  Watching a watched place again updates it and says so (one row per place, in the database).
 * ==========================================================================*/
import { str, num, one, bool } from './atlas-caps.js';
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

/* (watch-places) which saved places a request names — through the same matcher places.show uses */
async function namedPlaces(a, HOST) {
  const M = await import('./my-places.js');
  const r = await M.listPlaces(HOST.DB);
  if (!r.ok) return { ok: false, error: r.error, M };
  return { ok: true, M, all: r.places, hit: M.matchPlaces(r.places, { id: a.id, name: a.name, collection: a.collection }) };
}
/* a threshold is a number, or "off" to stop watching that kind */
function watchArgs(a) {
  const s = { off: [] };
  [['quake', 'quakeMinMag'], ['warning', 'alertMinLevel'], ['volcano', 'volcanoMinRank'], ['news', 'newsMinSources']].forEach(([k, f]) => {
    if (a[f] === 'off' || a[f] === false) s.off.push(k); else if (a[f] != null && isFinite(+a[f])) s[f] = +a[f];
  });
  if (a.radiusKm != null && isFinite(+a.radiusKm)) s.radiusKm = +a.radiusKm;
  if (a.enabled != null) s.enabled = !!a.enabled;
  return s;
}
const offOrNum = (min, max) => ({ anyOf: [num(min, max), one('off')] });
const NOT_DEPLOYED = (T) => T('Watched places are not available on this server yet.', 'このサーバーではまだ「見守る場所」を利用できません。');
const norm = (x) => String(x || '').normalize('NFKC').toLowerCase().trim();

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
  {
    row: ['places.watch',               'watchPlace',     'monitorPlace,watchArea,alertMeNear,keepAnEyeOn', 'places', 'none', 'account.watches', 'explanation', 'persist', 'explicit', 'place?', ''],
    doc: [
      { in: 'more-features', at: 220, text: '{"type":"watchPlace","id"?:str,"name"?:str,"place"?:str,"country"?:str,"lng"?:num,"lat"?:num,"radiusKm"?:num,"quakeMinMag"?:num|"off","alertMinLevel"?:1-4|"off","volcanoMinRank"?:1-4|"off","newsMinSources"?:num|"off","enabled"?:bool} = WATCH A SAVED PLACE (「見守る場所」): while IntMap is open it checks every 10 minutes for earthquakes (USGS, M≥quakeMinMag within radiusKm), official weather warnings whose area contains the place (alertMinLevel on the agencies\' ladder 1 advisory · 2 warning · 3 danger · 4 emergency; read only while the Weather warnings layer is on), volcano alert levels within radiusKm (volcanoMinRank 2 advisory/yellow · 3 watch/orange · 4 warning/red) and news events reported by ≥newsMinSources independent outlets within radiusKm, and tells the reader what is new. Defaults: 300 km, M4.5, level 2, rank 2, 2 outlets; "off" stops a kind. Name a saved place by id/name (myPlaces), or give a place/coordinates — it is saved to My places first. Watching a watched place again changes only what you pass. Nothing is sent while IntMap is closed. Use for 「自宅の周辺で地震があったら教えて」「この場所を見守って」「警報が出たら知らせて」, "watch my home for earthquakes", "alert me to news near Kyoto"; ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), name: str(), place: str(), country: str(), lng: num(-180, 180), lat: num(-90, 90),
      radiusKm: num(1, 1000), quakeMinMag: offOrNum(2.5, 9.5), alertMinLevel: offOrNum(1, 4), volcanoMinRank: offOrNum(1, 4), newsMinSources: offOrNum(1, 50), enabled: bool() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to watch places.', '場所を見守るにはログインしてください。')), { meta: SIGN_IN });
      let target = null;
      if (a.id || (a.name && !a.place && a.lng == null)) {
        const n = await namedPlaces(a, HOST);
        if (!n.ok) return R(false, warn(esc(n.M.placeFailureText(n.error, lang))), n.error === 'sign_in' ? { meta: SIGN_IN } : null);
        if (n.hit.length > 1) return R(false, warn(esc(T('Several saved places match — which one?', '複数の保存場所が一致します。どれですか？'))) + placeLines(n.hit, esc), needs('AMBIGUOUS'));
        target = n.hit[0] || null;
        if (!target) return R(false, warn(esc(T('No saved place matches that. Give a place or coordinates to save and watch it.', '一致する保存場所はありません。地名か座標を指定すれば、保存して見守ります。'))), needs('NOT_FOUND', { semanticTarget: String(a.name || a.id || '') }));
      }
      if (!target) {
        if (!(a.place || (a.lng != null && a.lat != null))) return R(false, warn(T('Which place should I watch? Name a saved place, or give a place or coordinates.', 'どの場所を見守りますか？ 保存した場所の名前、地名、座標のいずれかを指定してください。')), needs('NEEDS_INPUT'));
        /* not saved yet: save it through places.save — the same door, the same «already saved» — then watch it */
        const saved = await K.dispatch({ type: 'savePlace', place: a.place, country: a.country, lng: a.lng, lat: a.lat, name: a.name || a.place }, dctx);
        const pid = saved && saved.meta && saved.meta.placeId;
        if (!pid) return saved;
        target = { id: pid, name: a.name || a.place || '' };
      }
      const W = await import('./place-watch.js');
      const r = await W.setWatch(HOST.DB, target.id, watchArgs(a));
      if (!r.ok) { const M = await import('./my-places.js'); return R(false, warn(esc(r.error === 'not_deployed' ? NOT_DEPLOYED(T) : M.placeFailureText(r.error, lang))), needs(String(r.error || 'failed').toUpperCase())); }
      try { W.startWatching(HOST); } catch (_) { }
      const c = await W.checkNow(HOST);
      const d = c && c.ok ? W.digestData(W.lastRun()) : null;
      const mine = d && d.places.find((p) => String(p.placeId) === String(target.id));
      const s = mine ? mine.settings : null;
      const line = s ? [T('within ' + Math.round(s.radiusKm) + ' km', '半径 ' + Math.round(s.radiusKm) + ' km'),
        s.quakeMinMag != null ? T('earthquakes M' + s.quakeMinMag + '+', '地震 M' + s.quakeMinMag + ' 以上') : '',
        s.alertMinLevel != null ? T('warnings level ' + s.alertMinLevel + '+', '警報 レベル ' + s.alertMinLevel + ' 以上') : '',
        s.volcanoMinRank != null ? T('volcano rank ' + s.volcanoMinRank + '+', '火山 ' + s.volcanoMinRank + ' 以上') : '',
        s.newsMinSources != null ? T('news from ' + s.newsMinSources + '+ outlets', 'ニュース ' + s.newsMinSources + ' 媒体以上') : ''].filter(Boolean).join(' · ') : '';
      return R(true, note(esc((r.created ? T('Now watching: ', '見守りを始めました: ') : T('Already watched — updated: ', '見守り中でした（更新）: ')) + (mine ? mine.name : target.name)))
        + (line ? '<div style="font-size:12px;opacity:.8;">' + esc(line) + '</div>' : ''),
        { exec: { watchDigest: d && mine ? { at: d.at, places: [mine] } : null }, meta: { code: r.created ? 'OK' : 'ALREADY_WATCHED', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'], placeId: String(target.id) } });
    },
  },
  {
    row: ['places.unwatch',             'unwatchPlace',   'stopWatchingPlace,stopMonitoringPlace', 'places', 'none', 'account.watches', 'explanation', 'persist', 'explicit', '', ''],
    doc: [
      { in: 'more-features', at: 230, text: '{"type":"unwatchPlace","id"?:str,"name"?:str,"collection"?:str,"all"?:"collection"} = STOP WATCHING saved places (the places stay in My places). Name one by id or name; a whole collection with "all":"collection". When a name matches several, nothing changes and the matches are listed. Use for 「見守りをやめて」「京都の通知を止めて」, "stop watching my home"; ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), name: str(), collection: str(), all: one('collection') } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to manage watched places.', '見守る場所を管理するにはログインしてください。')), { meta: SIGN_IN });
      if (!a.id && !a.name && !(a.collection && a.all === 'collection')) return R(false, warn(T('Which watched place should I stop watching?', 'どの場所の見守りをやめますか？')), needs('NEEDS_INPUT'));
      const n = await namedPlaces(a, HOST);
      if (!n.ok) return R(false, warn(esc(n.M.placeFailureText(n.error, lang))), n.error === 'sign_in' ? { meta: SIGN_IN } : null);
      if (!n.hit.length) return R(false, warn(esc(T('No saved place matches that.', '一致する保存場所はありません。'))), needs('NOT_FOUND', { semanticTarget: String(a.name || a.id || a.collection || '') }));
      if (n.hit.length > 1 && !(a.all === 'collection' && a.collection && !a.name)) return R(false, warn(esc(T('Several saved places match — which one?', '複数の保存場所が一致します。どれですか？'))) + placeLines(n.hit, esc), needs('AMBIGUOUS'));
      const W = await import('./place-watch.js');
      const r = await W.unwatch(HOST.DB, n.hit.map((p) => p.id));
      if (!r.ok) return R(false, warn(esc(r.error === 'not_deployed' ? NOT_DEPLOYED(T) : n.M.placeFailureText(r.error, lang))));
      if (!r.removed) return R(true, note(esc(T('Those places were not being watched: ', 'それらの場所は見守っていませんでした: ') + n.hit.map((p) => p.name).join(' · '))), { meta: { code: 'ALREADY_DONE', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'] } });
      return R(true, note(esc(T('Stopped watching: ', '見守りをやめました: ') + n.hit.map((p) => p.name).join(' · '))));
    },
  },
  {
    row: ['places.watchDigest',         'watchDigest',    'watchedPlaces,placeAlerts,whatHappenedNear,watchReport', 'places', 'none', '', 'explanation', 'read', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 240, text: '{"type":"watchDigest","id"?:str,"name"?:str} = READ THE WATCHED PLACES NOW (見守りのダイジェスト): checks the feeds again and returns, per watched place, what is NEW since the reader last looked and what is current — each record with its kind (quake / warning / volcano / news), strength, how far, when, source and link — plus which feeds could not be read and why (a feed that was not read is never "nothing happened"). Use for 「見守りの新着は？」「自宅周辺で新しい出来事はある？」, "anything new near my places?", and before explaining an alert. Does not mark anything as seen; ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), name: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to see your watched places.', '見守る場所を見るにはログインしてください。')), { meta: SIGN_IN });
      const W = await import('./place-watch.js');
      const c = await W.checkNow(HOST);
      if (!c.ok) { const M = await import('./my-places.js'); return R(false, warn(esc(c.error === 'not_deployed' ? NOT_DEPLOYED(T) : M.placeFailureText(c.error, lang)))); }
      const d = W.digestData(W.lastRun());
      if (!d.places.length) return R(true, note(esc(T('No place is watched yet. Save a place, then ask me to watch it.', '見守っている場所はまだありません。場所を保存してから、見守るよう依頼してください。'))), { exec: { watchDigest: d } });
      const places = d.places.filter((p) => (!a.id || String(p.placeId) === String(a.id)) && (!a.name || norm(p.name).includes(norm(a.name))));
      if (!places.length) return R(false, warn(esc(T('No watched place matches that.', '一致する見守り中の場所はありません。'))), needs('NOT_FOUND', { semanticTarget: String(a.name || a.id || '') }));
      const html = places.map((p) => {
        const unread = Object.keys(p.sources).filter((k) => p.sources[k].state === 'unavailable').map((k) => k + ' (' + p.sources[k].reason + ')');
        return '<div style="margin:4px 0 8px;"><b>' + esc(p.name) + '</b> — ' + esc(T(p.fresh.length + ' new · ' + p.current.length + ' current', '新着 ' + p.fresh.length + ' · 現在 ' + p.current.length))
          + p.fresh.map((it) => '<div style="font-size:12px;">• ' + esc(W.itemLine(it, lang)) + (it.source ? ' <span style="opacity:.6;">' + esc(it.source) + '</span>' : '') + '</div>').join('')
          + (unread.length ? '<div style="font-size:11.5px;opacity:.75;">' + esc(T('Not read: ', '未確認: ') + unread.join(' · ')) + '</div>' : '') + '</div>';
      }).join('');
      return R(true, html, { exec: { watchDigest: { at: d.at, places } }, meta: { code: 'OK', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'] } });
    },
  },
  {
    row: ['places.watchSeen',           'markWatchSeen',  'watchMarkRead,clearWatchAlerts', 'places', 'none', 'account.watches', 'explanation', 'persist', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 250, text: '{"type":"markWatchSeen","id"?:str,"name"?:str} = MARK THE NEW RECORDS AT WATCHED PLACES AS SEEN (既読), for every watched place or the one named, on every device of the account. Use for 「既読にして」「見守りの新着を消して」, "mark them as read"; ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), name: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to manage watched places.', '見守る場所を管理するにはログインしてください。')), { meta: SIGN_IN });
      const W = await import('./place-watch.js');
      let ids = null;
      if (a.id || a.name) {
        if (!W.lastRun()) await W.checkNow(HOST);
        const run = W.lastRun();
        ids = (run ? run.results : []).filter((r) => (!a.id || String(r.placeId) === String(a.id)) && (!a.name || norm(r.place.name).includes(norm(a.name)))).map((r) => r.placeId);
        if (!ids.length) return R(false, warn(esc(T('No watched place matches that.', '一致する見守り中の場所はありません。'))), needs('NOT_FOUND', { semanticTarget: String(a.name || a.id || '') }));
      }
      const r = await W.markSeen(HOST, ids);
      if (!r.ok) { const M = await import('./my-places.js'); return R(false, warn(esc(r.error === 'not_deployed' ? NOT_DEPLOYED(T) : M.placeFailureText(r.error, lang)))); }
      return R(true, note(esc(r.cleared ? T('Marked as seen: ' + r.cleared + ' record(s)', '既読にしました: ' + r.cleared + ' 件') : T('Nothing new to mark — already seen.', '新着はありません（既読済み）。'))), { meta: { code: r.cleared ? 'OK' : 'ALREADY_DONE', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'] } });
    },
  },
];
