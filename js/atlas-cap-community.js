/* ============================================================================
 *  IntMap · Atlas capabilities — the `community.*` namespace   (js/atlas-cap-community.js)
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
 *  (community-maps) COMMUNITY MAPS — the collections readers listed for everyone, through the SAME doors the sheet uses
 *  (js/community-maps.js): the directory (anyone), opening one on the map (its link's own card, js/shared-collection.js),
 *  and, for the reader's own published collections, listing, unlisting and how far each has travelled.
 *  ⚠ A LISTING NEEDS A NAME THE READER CHOSE TO SHOW. Atlas never takes the account's e-mail or profile name for it: with
 *  none given (and none from an earlier listing) the call asks. ⚠ Listing makes a collection findable by anyone — risk
 *  `external`, and Atlas does not list a collection the reader did not name (no «everything» by default).
 *  Reporting a collection is the reader's own word to the administrators: it stays a button on the collection's card.
 * ==========================================================================*/
import { str, num, one, bool, noArgs } from './atlas-caps.js';
import { IntMapLang } from './lang-registry.js';
import { resolveCollection } from './atlas-cap-places.js';   /* which collection a request names — the one rule */

const SIGN_IN = { code: 'SIGN_IN_REQUIRED', category: 'input', retryable: false, userGoalSatisfied: false, produced: [] };
const needs = (code, extra) => ({ meta: Object.assign({ code, category: 'input', retryable: true, userGoalSatisfied: false, produced: [] }, extra || null) });
const _norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/* the lines the model reads back: every field the directory returned, nothing summarised */
function entryLines(items, C, esc, lang) {
  const T = IntMapLang.pick(() => lang);
  return items.map((e) => '<div style="font-size:12px;line-height:1.6;margin-bottom:4px;"><b>' + esc(e.title) + '</b> · ' + esc(T('by ', '作成: ') + e.author)
    + ' · ' + esc(C.contentsText(e, lang))
    + (C.reachText(e.reused, e.derived, lang) ? ' · ' + esc(C.reachText(e.reused, e.derived, lang)) : '')
    + (e.lat != null && e.lng != null ? ' · ' + esc((+e.lat).toFixed(3) + ', ' + (+e.lng).toFixed(3)) : '')
    + (e.basedOn ? ' · ' + esc(T('built on «' + e.basedOn.title + '» by ' + e.basedOn.author, '元: 「' + e.basedOn.title + '」（' + e.basedOn.author + '）')) : '')
    + (e.summary ? '<br><span style="opacity:.8;">' + esc(e.summary) + '</span>' : '')
    + ' <span style="opacity:.6;">[token ' + esc(e.token) + ']</span></div>').join('');
}

export default [
  {
    row: ['community.browse',           'communityMaps',  'browseCommunityMaps,findCommunityMaps,publicMaps,othersMaps,sharedMapsDirectory', 'community', 'none', 'panel.community', 'explanation', 'session', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 680, text: '{"type":"communityMaps","query"?:str,"sort"?:"new"|"reused"|"updated","area"?:bool,"limit"?:num,"show"?:bool} = COMMUNITY MAPS / みんなの地図 — the directory of collections (places, saved maps, tours, Atlas answers) that READERS made and chose to list for everyone. Returns each one\'s title, the name it is listed under, its summary, what it holds, where on the globe it is, how many other readers kept a copy and how many listed collections were built on it, the collection it was built on, and its token (for communityMapOpen). "query" matches titles, summaries and names; "sort" new | reused (most kept) | updated; "area":true only those about the area the map is showing now; "show":true also opens the Community maps sheet with the same search for the reader. Use for 「みんなの地図を見せて」「他の人が作った京都の地図はある？」「授業で使える地図を探して」「この辺りの誰かの地図は？」, "find maps other people made about Rome", "what community maps are popular?"; quote only what it returns; ' },
    ],
    schema: () => ({ type: 'object', properties: { query: str(), sort: one('new', 'reused', 'updated'), area: bool(), limit: num(1, 50), show: bool() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = IntMapLang.pick(() => lang);
      const C = await import('./community-maps.js');
      const bbox = a.area ? C.viewBbox() : null;
      if (a.area && !bbox) return R(false, warn(esc(T('The map is showing the whole globe — zoom in to an area first, or search by words.', '地図が地球全体を表示しています。範囲を拡大するか、言葉で検索してください。'))), needs('NEEDS_INPUT'));
      const r = await C.browse(HOST.DB, { query: a.query, sort: a.sort, limit: a.limit ? Math.round(+a.limit) : 20, bbox });
      if (!r.ok) return R(false, warn(esc(C.failureText(r.error, lang))));
      if (a.show) { try { C.openCommunityMaps(HOST, { query: a.query, sort: a.sort, area: !!a.area }); } catch (_) { } }
      const head = T('Community maps: ' + r.total + ' collection(s)' + (a.query ? ' matching «' + a.query + '»' : '') + (a.area ? ' about this area' : ''),
        'みんなの地図: ' + r.total + ' 件' + (a.query ? '（「' + a.query + '」に一致）' : '') + (a.area ? '（この範囲）' : ''));
      if (!r.items.length) return R(true, note(esc(head + T(' — nothing listed matches.', ' — 一致する掲載はありません。'))), { meta: { code: 'OK', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'] } });
      return R(true, note(esc(head)) + entryLines(r.items, C, esc, lang));
    },
  },
  {
    row: ['community.open',             'communityMapOpen', 'openCommunityMap,openListedCollection,showCommunityMap', 'community', 'panel', 'map.object,camera', 'panel', 'session', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 690, text: '{"type":"communityMapOpen","token"?:str,"title"?:str} = OPEN ONE COMMUNITY MAP ON THE MAP — the collection\'s places as pins (framed) and its card (title, the name it is listed under, summary, its maps and tours to open, «Add to My places», what it was built on), exactly as its link opens it. Give its "token" from communityMaps, or its "title" (when several listed collections match, nothing is opened and they are listed). Use after communityMaps, for 「その地図を開いて」「『関西の遠足』を見せて」, "open the Kansai field trip map"; ' },
    ],
    schema: () => ({ type: 'object', properties: { token: str(), title: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = IntMapLang.pick(() => lang);
      const C = await import('./community-maps.js');
      let token = String(a.token || '').trim().toLowerCase();
      if (!/^[0-9a-f]{32}$/.test(token)) {
        if (!a.title) return R(false, warn(T('Which community map? Give its title or its token from communityMaps.', 'どの地図ですか？ 題か、communityMaps の token を指定してください。')), needs('NEEDS_INPUT'));
        const r = await C.browse(HOST.DB, { query: a.title, limit: 50 });
        if (!r.ok) return R(false, warn(esc(C.failureText(r.error, lang))));
        const exact = r.items.filter((e) => _norm(e.title) === _norm(a.title));
        const hit = exact.length ? exact : r.items;
        if (!hit.length) return R(false, warn(esc(T('No listed collection is called «' + a.title + '».', '「' + a.title + '」という掲載はありません。'))), needs('NOT_FOUND', { semanticTarget: String(a.title) }));
        if (hit.length > 1) return R(false, warn(esc(T('Several listed collections match — which one?', '複数の掲載が一致します。どれですか？'))) + entryLines(hit, C, esc, lang), needs('AMBIGUOUS'));
        token = hit[0].token;
      }
      const o = await C.openEntry(HOST, token);
      if (!o || !o.ok) return R(false, warn(esc(C.failureText(o && o.error === 'not_found' ? 'not_listed' : (o && o.error) || 'failed', lang))), needs('NOT_FOUND', { semanticTarget: String(a.title || token) }));
      return R(true, note(esc(T('Opened: «' + o.title + '»', '開きました: 「' + o.title + '」') + (o.listing ? T(' by ' + o.listing.author, '（' + o.listing.author + '）') : ''))),
        { objectIds: o.pins || [], meta: { code: 'OK', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['panel'] } });
    },
  },
  {
    row: ['community.list',             'listCommunityMap', 'listInCommunityMaps,shareWithEveryone,makeMapPublic', 'community', 'none', 'account.places', 'explanation', 'external', 'explicit', '', ''],
    doc: [
      { in: 'more-features', at: 700, text: '{"type":"listCommunityMap","collection"?:str,"all"?:"everything"|"unfiled","author":str,"summary"?:str} = LIST ONE OF THE READER\'S COLLECTIONS IN COMMUNITY MAPS (みんなの地図に掲載) so ANYONE can find it — publishing it as a read-only link first if it is not published. It is shown under "author", a name THE READER CHOOSES to show (never their e-mail or account name — if they have not said one, ASK), with "summary". Name the collection (it must exist) or "all"; with neither, ASK. A collection the reader filled from someone else\'s listed one names that one as the collection it was built on. Listing a listed collection updates its name/summary and says it was already listed. THE RESULT CARRIES THE LINK. Use for 「京都旅行をみんなの地図に載せて」「この地図を他の先生にも使ってもらえるように公開して」, "list my Field trip collection for everyone"; ' },
    ],
    schema: () => ({ type: 'object', properties: { collection: str(), all: one('everything', 'unfiled'), author: str(), summary: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = IntMapLang.pick(() => lang);
      if (!HOST.user) return R(false, warn(T('Sign in to list a collection.', 'コレクションを掲載するにはログインしてください。')), { meta: SIGN_IN });
      const M = await import('./my-places.js');
      const c = await resolveCollection(a, M, HOST);
      if (!c.ok && c.code === 'NEEDS_INPUT') return R(false, warn(T('Which collection should I list in Community maps?', 'どのコレクションを、みんなの地図に掲載しますか？')), needs('NEEDS_INPUT'));
      if (!c.ok && c.code === 'NOT_FOUND') return R(false, warn(esc(T('There is no collection by that name. Collections: ', 'その名前のコレクションはありません。コレクション: ') + c.names.map((n) => n || T('Unfiled', '未分類')).join(' · '))), needs('NOT_FOUND', { semanticTarget: String(a.collection || '') }));
      if (!c.ok) return R(false, warn(esc(M.placeFailureText(c.error, lang))));
      const C = await import('./community-maps.js');
      const S = await import('./shared-collection.js');
      /* the name: the one given, else the one this collection is already listed under — never one Atlas makes up */
      let author = a.author ? C.authorOk(a.author) : '';
      if (a.author && !author) return R(false, warn(esc(C.failureText('too_long', lang))), needs('INVALID'));
      if (!author) {
        const rs = await S.listShares(HOST.DB);
        const mine = rs.ok ? rs.shares.find((s) => (s.collection == null ? null : String(s.collection)) === (c.collection == null ? null : String(c.collection))) : null;
        if (!(mine && mine.author_name)) return R(false, warn(T('What name should it be shown under in Community maps? (Not your e-mail — e.g. «Ms Tanaka, Grade 8».)', 'みんなの地図にどの名前で表示しますか？（メールアドレスではない名前。例:「田中（中2社会）」）')), needs('NEEDS_INPUT', { semanticTarget: 'author' }));
      }
      const r = await C.listMap(HOST.DB, { collection: c.collection, author: author || null, summary: a.summary == null ? null : a.summary });
      if (!r.ok) return R(false, warn(esc(C.failureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : needs(String(r.error || 'failed').toUpperCase()));
      const url = S.shareUrl(r.token);
      return R(true, note(esc((r.listed ? T('Listed in Community maps — anyone can find it now. Link: ', 'みんなの地図に掲載しました。誰でも見つけられます。リンク: ') : T('Already listed in Community maps — updated. Link: ', 'みんなの地図に掲載済みでした（更新しました）。リンク: ')) + url
        + (r.derivedFrom ? T(' · Built on «' + r.derivedFrom + '».', ' · 元にした地図: 「' + r.derivedFrom + '」') : ''))),
        { meta: { code: r.listed ? 'OK' : 'ALREADY_LISTED', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'], link: url } });
    },
  },
  {
    row: ['community.unlist',           'unlistCommunityMap', 'takeOutOfCommunityMaps,stopListing', 'community', 'none', 'account.places', 'explanation', 'persist', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 710, text: '{"type":"unlistCommunityMap","collection"?:str,"all"?:"everything"|"unfiled"} = TAKE ONE OF THE READER\'S COLLECTIONS OUT OF COMMUNITY MAPS — nobody finds it there any more; its read-only link keeps working (to stop the link too, use unpublishCollection). Name the collection or "all". Use for 「みんなの地図から外して」「掲載をやめて」, "unlist my Field trip collection"; ' },
    ],
    schema: () => ({ type: 'object', properties: { collection: str(), all: one('everything', 'unfiled') } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = IntMapLang.pick(() => lang);
      if (!HOST.user) return R(false, warn(T('Sign in to manage your listed collections.', '掲載したコレクションを管理するにはログインしてください。')), { meta: SIGN_IN });
      if (!a.collection && !a.all) return R(false, warn(T('Which collection should I take out of Community maps?', 'どのコレクションを、みんなの地図から外しますか？')), needs('NEEDS_INPUT'));
      const M = await import('./my-places.js');
      const c = await resolveCollection(a, M, HOST);
      if (!c.ok && c.code === 'NOT_FOUND') return R(false, warn(esc(T('There is no collection by that name.', 'その名前のコレクションはありません。'))), needs('NOT_FOUND', { semanticTarget: String(a.collection || '') }));
      if (!c.ok) return R(false, warn(esc(M.placeFailureText(c.error || 'failed', lang))));
      const C = await import('./community-maps.js');
      const r = await C.unlistMap(HOST.DB, c.collection);
      if (!r.ok) return R(false, warn(esc(C.failureText(r.error, lang))));
      /* not listed is the state that was asked for: «already done», not a failure (.agents/rules/one-pass-or-a-reason.md) */
      if (!r.was) return R(true, note(esc(T('That collection is not in Community maps — nothing to take out.', 'そのコレクションは、みんなの地図に掲載されていません。'))), { meta: { code: 'ALREADY_UNLISTED', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['explanation'] } });
      return R(true, note(esc(T('Taken out of Community maps. Its link still works.', 'みんなの地図から外しました。リンクは引き続き使えます。'))));
    },
  },
  {
    row: ['community.mine',             'myCommunityMaps', 'myListedMaps,myPublishedReach,howFarMyMapsTravelled', 'community', 'none', '', 'explanation', 'read', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 715, text: '{"type":"myCommunityMaps"} = THE READER\'S PUBLISHED COLLECTIONS AND HOW FAR EACH HAS TRAVELLED — for every collection they published: its title and link, whether it is listed in Community maps (and under which name) or was taken out by IntMap\'s administrators (and why), how many other readers kept a copy and how many listed collections were built on it (counts only — never who). Use for 「私の地図は使われてる？」「公開した地図の反応は？」「何人が保存した？」, "has anyone used my maps?"; ' },
    ],
    schema: () => (noArgs('myCommunityMaps')),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = IntMapLang.pick(() => lang);
      if (!HOST.user) return R(false, warn(T('Sign in to see your published collections.', '公開したコレクションを見るにはログインしてください。')), { meta: SIGN_IN });
      const S = await import('./shared-collection.js');
      const C = await import('./community-maps.js');
      const [rs, rr] = await Promise.all([S.listShares(HOST.DB), C.reach(HOST.DB)]);
      if (!rs.ok) return R(false, warn(esc(S.shareFailureText(rs.error, lang))), rs.error === 'sign_in' ? { meta: SIGN_IN } : null);
      if (!rs.shares.length) return R(true, note(esc(T('You have not published a collection yet.', '公開したコレクションはまだありません。'))));
      const by = rr.ok ? rr.byShare : {};
      return R(true, '<div style="font-weight:600;margin:2px 0 6px;">' + esc(T('Your published collections — ' + rs.shares.length, '公開したコレクション — ' + rs.shares.length + ' 件')) + '</div>'
        + rs.shares.map((s) => { const x = by[String(s.id)] || { reused: 0, derived: 0 };
          const state = s.hidden_at ? T('taken out of Community maps by the administrators: ' + (s.hidden_reason || ''), '管理者によって、みんなの地図から外されました: ' + (s.hidden_reason || ''))
            : s.listed_at ? T('listed in Community maps as «' + (s.author_name || '') + '»', 'みんなの地図に「' + (s.author_name || '') + '」として掲載中') : T('link only (not listed)', 'リンクのみ（未掲載）');
          return '<div style="font-size:12px;line-height:1.6;margin-bottom:4px;"><b>' + esc(s.title) + '</b> · ' + esc(state)
            + ' · ' + esc(C.reachText(x.reused, x.derived, lang) || T('nobody has kept a copy yet', 'まだ誰も保存していません')) + ' — ' + esc(s.url) + '</div>'; }).join(''));
    },
  },
];
