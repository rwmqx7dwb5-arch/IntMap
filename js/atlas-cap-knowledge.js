/* ============================================================================
 *  IntMap · Atlas capabilities — the `knowledge.*` namespace   (js/atlas-cap-knowledge.js)   (atlas-knowledge)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place (the shape is js/atlas-caps.js's).
 *
 *  CONSOLIDATED KNOWLEDGE, FROM ATLAS'S SIDE (the third memory: js/atlas-knowledge-store.js has the rules).
 *    knowledge.remember  keep claims an investigation established — each with its basis, place, period and
 *                        world-object refs; the CODE refuses a `verified` claim with no checkable source
 *    knowledge.recall    load what a new question needs — by words, place, world ref, date — a few at a time,
 *                        each labelled verified / inferred / contested / stale with its source
 *    knowledge.forget    drop one
 *    knowledge.setting   the reader's switch (off until they turn it on; this device only)
 *  ⚠ Nothing here is written for Atlas and nothing is read into a turn for it (CONSTITUTION.md §5): Atlas
 *  decides what is worth keeping and when to look. What is recalled is handed back as DATA with its status —
 *  a past answer is never presented as a fact, and a claim whose period has ended says so.
 * ==========================================================================*/
import { str, int, list, obj, bool } from './atlas-caps.js';
import { knowledgeOn, setKnowledgeOn, setKnowledgeSync, knowledgeSyncOn, knowledgeStore, knowledgeSync, useKnowledgeHost, syncKnowledge } from './atlas-knowledge.js';
import { claimFromInput, recall, withinBudget, standing } from './atlas-knowledge-store.js';
import { resolveRefKeys } from './atlas-knowledge-identity.js';
import { worldObjects } from './atlas-world-objects.js';   /* (world-objects) the session index: the one place a ref is turned into an object */
import { makeWorldGraphStore } from './world-graph-store.js';   /* (world-graph) the persistent graph, for objects this session has not surfaced */

const W = worldObjects;
const G = makeWorldGraphStore({ worldObjects: W });
/* the two lookups every identity question goes through (the same pair research.delegate's fact resolver uses) */
const lookups = (K) => ({ find: (q) => W.find(q), findPersisted: async (q) => { const g = await G.findPersisted(K.HOST.DB, q); return g && g.ok ? g.object : null; } });
/* what a sync adds to an answer: said once, in the reader's words, and never a reason to refuse the call */
const syncNote = (K, r) => (!r || r.reason === 'sync-off') ? '' : (r.ok ? K.note(K.esc(K.L('Synced to your account', 'アカウントへ同期しました') + ' · ' + (r.pushed || 0) + '↑ ' + (r.pulled || 0) + '↓' + (r.removed ? ' · ' + r.removed + ' ' + K.L('removed (deleted on another device)', '件を削除（別の端末で削除）') : '')))
  : K.warn(K.esc(K.L('Could not sync to your account', 'アカウントへ同期できませんでした') + ': ' + (r.reason === 'signed-out' ? K.L('not signed in', 'ログインしていません') : (r.message || r.reason || '')))));

const off = (K) => K.R(false, K.warn(K.esc(K.L('Kept knowledge is off. It is stored only on this device and only once the reader turns it on — ask them, then use the knowledge setting.', '蓄積知識はオフです。この端末にだけ、読者が有効にしたときだけ保存します。読者に確認してから knowledge の設定で有効にしてください。'))), { meta: { code: 'KNOWLEDGE_OFF' } });
const day = (ms) => { try { return new Date(ms).toISOString().slice(0, 10); } catch (_) { return ''; } };
const kindText = (L, k) => (k === 'verified' ? L('verified', '確認済み') : k === 'contested' ? L('contested', '矛盾あり') : k === 'stale' ? L('stale', '古い情報') : L('inferred', '推論'));

export default [
  {
    row: ['knowledge.remember',         'knowledgeRemember', 'rememberKnowledge,keepKnowledge,saveFact',                    'research','none',    'knowledge',              'explanation',         'persist', 'none',   '',         ''],
    ui: { none: '2026-11-20' },   /* no reader-facing control yet: the switch is Atlas-only in this slice (docs/architecture/05-ai.md) */
    doc: [
      { in: 'knowledge', at: 10, text: '{"type":"knowledgeRemember","claims":[{"statement":str,"kind":"verified"|"inferred","evidence"?:[{"id"?:"e3","url"?:str,"title"?:str,"publisher"?:str,"date"?:str} | {"origin":"app_data"|"calculation","dataset":str}],"basis"?:str,"place"?:{"name":str,"lng":num,"lat":num},"validFrom"?:"YYYY[-MM-DD]","validTo"?:"YYYY[-MM-DD]","recheckAfterDays"?:num,"refs"?:["type:id",…],"topic"?:str,"contradicts"?:[id,…],"supersedes"?:[id,…]},…]} = KEEP WHAT AN INVESTIGATION ESTABLISHED (知識として残す) — only when the reader has turned kept knowledge on (the knowledge setting); otherwise it answers KNOWLEDGE_OFF. Keep a claim, not an answer: one statement, with what it rests on. "verified" REQUIRES a source that can be checked again — a url (pass the evidence record\'s url and title; the evidence id alone means nothing in a later session) or a named IntMap dataset / calculation — and is REFUSED without one; a reasoned conclusion is "inferred" and must give its "basis". Never keep an unsourced past answer as verified. Tie it to where and when it holds (place, validFrom/validTo — «as of» a period, not forever; and recheckAfterDays when the thing can change and should be looked at again after that many days — leave it out when you have no reason for a number) and to the world objects it is about (refs from observed.worldObjects, e.g. "facility:wd-Q104518607"): IntMap asks the world graph which identifiers each ref has and keeps them with the claim, so a later question that names the same object by its Wikidata id still finds it, and it says which refs the graph did not know. When a newer finding replaces an older kept claim pass its id in "supersedes" (the old one becomes stale); when two kept claims disagree pass "contradicts" (both become contested and are shown side by side — IntMap does not pick a winner). Returns each claim\'s id and whether it was kept, merged into an identical one, or refused and why. ' },
    ],
    schema: () => ({ type: 'object', properties: { claims: list(obj(), 1, 20) }, required: ['claims'] }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      if (!knowledgeOn()) return off(K);
      useKnowledgeHost(() => K.HOST);
      const S = knowledgeStore(), now = Date.now();
      const have = new Set((await S.list()).map((c) => c.id));
      const items = Array.isArray(a.claims) ? a.claims : (a.statement ? [a] : []);
      if (!items.length) return R(false, warn(esc(L('Pass the claims to keep.', '残す主張を指定してください。'))), { meta: { code: 'needs_input' } });
      const kept = [], refused = [];
      /* the world graph is asked once for every ref named in the batch; a ref it cannot place is reported, not refused (it may simply not be in the graph yet) */
      const allRefs = []; items.forEach((it) => (Array.isArray(it && it.refs) ? it.refs : []).forEach((r) => allRefs.push(String(r).trim())));
      const ident = await resolveRefKeys(allRefs, lookups(K));
      for (const it of items) {
        const r = claimFromInput(it, now, have, { refKeys: ident.keys });
        if (r.error) { refused.push({ statement: String((it && it.statement) || '').slice(0, 80), code: r.error.code, why: r.error.why }); continue; }
        const out = await S.remember(r.claim, now); have.add(out.claim.id);
        kept.push({ id: out.claim.id, kind: out.claim.kind, merged: out.merged, statement: out.claim.statement.slice(0, 120), marked: out.marked, refStatus: Object.fromEntries((out.claim.refs || []).map((x) => [x, ident.status[x] || 'unresolved'])) });
      }
      const unknownRefs = Array.from(new Set(kept.flatMap((k) => Object.keys(k.refStatus).filter((x) => k.refStatus[x] !== 'resolved'))));
      const sync = (kept.length && knowledgeSyncOn()) ? await syncKnowledge().catch((e) => ({ ok: false, reason: 'failed', message: String((e && e.message) || e) })) : null;
      let h = '';
      if (kept.length) h += '<div style="font-weight:600;margin:2px 0;">' + esc(L('Kept as knowledge', '知識として保存')) + ' · ' + kept.length + '</div><ul style="margin:2px 0 4px 18px;padding:0;font-size:12px;line-height:1.55;">'
        + kept.map((k) => '<li><b>' + esc(k.id) + '</b> · ' + esc(kindText(L, k.kind) + (k.merged ? ' · ' + L('merged into an identical claim', '同一の主張に統合') : '')) + ' — ' + esc(k.statement) + (k.marked.length ? note(esc(L('marked', '更新') + ': ' + k.marked.join(', '))) : '') + '</li>').join('') + '</ul>';
      if (unknownRefs.length) h += note(esc(L('The world graph did not place: ', 'ワールドグラフが特定できなかった ref: ') + unknownRefs.join(', ') + ' — ' + L('kept under the ref as written; a later question reaches it by that ref only', '書かれた ref のまま保存しました。あとの質問はその ref でしか届きません')));
      if (refused.length) h += refused.map((x) => warn(esc(L('Not kept', '保存しませんでした') + ' — ' + x.statement + ': ' + x.why))).join('');
      h += syncNote(K, sync);
      return R(kept.length > 0, h, { meta: { code: kept.length ? (refused.length ? 'PARTIAL' : 'OK') : refused[0].code, knowledge: { kept: kept.length, refused: refused.length, ids: kept.map((k) => k.id), refusals: refused.map((x) => x.code), unplacedRefs: unknownRefs, synced: sync ? sync.ok : undefined } } });
    },
  },
  {
    row: ['knowledge.recall',           'knowledgeRecall',   'recallKnowledge,whatDoIKnow,priorKnowledge',                  'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    ui: { none: '2026-11-20' },   /* no reader-facing control yet: the switch is Atlas-only in this slice (docs/architecture/05-ai.md) */
    doc: [
      { in: 'knowledge', at: 20, text: '{"type":"knowledgeRecall","query"?:str,"near"?:{"lng":num,"lat":num,"km"?:num},"refs"?:["type:id",…],"at"?:"YYYY[-MM-DD]","context"?:bool,"due"?:bool,"kinds"?:["verified"|"inferred"|"contested"|"stale"],"includeStale"?:bool,"limit"?:int} = WHAT IS ALREADY KNOWN (蓄積知識を読み込む) — claims kept from earlier investigations, matched to THIS question by its words, a place and radius, a world-object ref, or a date the claim\'s period must contain. Use it at the START of a question that touches ground the reader has covered before, then spend the turn on what is new. Loads only a few (limit, default 8, within a size budget) and says how many more matched. Each claim carries its STATUS and what it rests on: verified (a source — shown), inferred (the earlier reasoning — shown, NOT a fact), contested (a conflicting claim exists, shown with it), stale (superseded — left out unless asked); a claim whose stated period has ended says so. "refs" match the same OBJECT, not only the same spelling: a claim kept under facility:wd-Q1 is found by a question that names it wikidata:Q1 (matchedVia:"same-object"). "context":true takes the refs of the world objects this session has already surfaced, so a question about what is on the map starts from what is known about those objects. "due":true lists only claims that need looking at again (their recheckAfterDays has passed, their period has ended, or a re-check found the source changed). Each claim carries "standing": ageDays, periodEnded, recheckDue, sourceChanged, neverChecked — age and expiry are shown, never silently applied. Treat what comes back as a lead to re-check against live sources when the question is about now (knowledgeRecheck records the outcome), never as today\'s answer. Answers KNOWLEDGE_OFF when the reader has not turned kept knowledge on. ' },
    ],
    schema: () => ({ type: 'object', properties: { query: str(), near: obj(), refs: list(str()), at: str(), context: bool(), due: bool(), kinds: list(str()), includeStale: bool(), limit: int(1, 50) } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note;
      if (!knowledgeOn()) return off(K);
      const S = knowledgeStore(), now = Date.now();
      const all = await S.list();
      useKnowledgeHost(() => K.HOST);
      /* the refs a question starts from: the ones it names, and (context) the world objects this session has already surfaced */
      const asked = (Array.isArray(a.refs) ? a.refs : []).concat(a.ref ? [a.ref] : []).map(String);
      const ctxRefs = a.context === true ? W.all().map((o) => o.ref).filter(Boolean).slice(0, 40) : [];
      const ident = (asked.length || ctxRefs.length) ? await resolveRefKeys(asked.concat(ctxRefs), lookups(K)) : { keys: {}, status: {} };
      const { claims, omittedStale } = recall(all, { query: a.query, near: a.near, refs: asked.concat(ctxRefs), at: a.at, due: a.due === true, kinds: a.kinds, includeStale: a.includeStale }, now, { keysOf: ident.keys });
      const { shown, cut } = withinBudget(claims, 4000, Math.max(1, Math.min(50, +a.limit || 8)));
      if (!shown.length) return R(true, note(esc(L('Nothing is kept that matches.', '一致する蓄積知識はありません。') + (omittedStale ? ' (' + omittedStale + ' ' + L('stale left out', '件の古い情報は除外') + ')' : ''))), { meta: { code: 'NO_RESULTS', knowledge: { count: 0, total: all.length, omittedStale } } });
      const h = '<div style="font-weight:600;margin:2px 0 5px;">' + esc(L('Kept knowledge', '蓄積知識')) + ' · ' + shown.length + (cut ? ' / ' + claims.length : '') + '</div><ul style="margin:2px 0 4px 18px;padding:0;font-size:12px;line-height:1.55;">'
        + shown.map((c) => {
          const sd = c.standing || {};
          const aging = (sd.recheckDue ? ' · ' + L('re-check due', '再確認の時期') : '') + (sd.sourceChanged ? ' · ' + L('source changed', '出典が変わった') : '') + (c.matchedVia ? ' · ' + L('same object', '同一の対象') : '');
          const when = (c.validFromMs != null || c.validToMs != null) ? ' · ' + (c.validFromMs != null ? day(c.validFromMs) : '…') + ' → ' + (c.validToMs != null ? day(c.validToMs) : '…') + (c.expired ? ' (' + L('period ended', '期間終了') + ')' : '') : '';
          const src = c.sources.length ? c.sources.map((s) => s.url ? s.title + ' ' + s.url : (s.label || s.title)).join(' · ') : (c.basis ? L('basis', '根拠') + ': ' + c.basis : '');
          return '<li><b>' + esc(c.id) + '</b> · ' + esc(kindText(L, c.kind) + ' · ' + L('kept', '保存') + ' ' + day(c.updatedAt) + when + aging) + ' — ' + esc(c.statement)
            + (c.place && c.place.name ? note(esc(c.place.name)) : '') + (src ? note(esc(src)) : '') + (c.refs.length ? note(esc(c.refs.join(', '))) : '') + '</li>';
        }).join('') + '</ul>' + (cut ? note(esc(L('More matched than were loaded:', '読み込んだ以外にも一致:') + ' ' + cut)) : '') + (omittedStale ? note(esc(L('Stale claims left out', '除外した古い情報') + ': ' + omittedStale)) : '');
      const brief = shown.map((c) => ({ id: c.id, kind: c.kind, statement: c.statement, basis: c.basis, sources: c.sources.map((s) => ({ title: s.title, url: s.url, label: s.label, evidenceId: s.evidenceId })), place: c.place, validFrom: c.validFromMs, validTo: c.validToMs, expired: c.expired, standing: c.standing, matchedVia: c.matchedVia, refs: c.refs, contradicts: c.contradicts, supersededBy: c.supersededBy, keptAt: c.updatedAt }));
      return R(true, h, { meta: { code: 'OK', knowledge: { count: shown.length, matched: claims.length, omittedStale, claims: brief } } });
    },
  },
  {
    row: ['knowledge.recheck',          'knowledgeRecheck',  'recheckKnowledge,verifyKnowledge,reverifyKnowledge',          'research','none',    'knowledge',              'explanation',         'persist', 'none',   '',         '', 'external'],
    ui: { none: '2026-11-20' },   /* no reader-facing control: it is how Atlas records that it looked again (docs/architecture/05-ai.md) */
    doc: [
      { in: 'knowledge', at: 25, text: '{"type":"knowledgeRecheck","id":str,"results"?:[{"source":url|datasetLabel,"outcome":"confirmed"|"changed"|"gone"|"unreachable","note"?:str},…]} = LOOK AT A KEPT CLAIM\'S SOURCES AGAIN (出典を再確認) — a claim whose recheckAfterDays has passed, or that knowledgeRecall shows as due. WITHOUT "results" it returns the claim\'s sources, when each was last checked, and — for a named IntMap dataset — IntMap\'s own observation of whether that dataset is present in this session (nothing is fetched for you: reading a web source again is your call, with your own web tools). WITH "results" it records what you saw, per source: "confirmed" (the page still says it — "note" must say what it says now), "changed" (it says something different now — "note" must say what; then keep the new finding with knowledgeRemember and "supersedes" this claim), "gone" (not found), "unreachable" (you could not look: this changes nothing, because failing to look is not finding). Only "confirmed" on every web source renews the claim; "gone" on every source takes "verified" away (nothing is left to check again) and the claim stays as an inference. A source that is not one of this claim\'s is refused by name. ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), results: list(obj()) }, required: ['id'] }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      if (!knowledgeOn()) return off(K);
      useKnowledgeHost(() => K.HOST);
      const S = knowledgeStore(), now = Date.now();
      const id = String(a.id || '').trim();
      const c = await S.get(id);
      if (!c) return R(false, warn(esc(L('No kept claim with that id', 'その id の主張はありません') + ': ' + id)), { meta: { code: 'not_found' } });
      let recorded = null;
      if (Array.isArray(a.results) && a.results.length) {
        recorded = await S.recheck(id, a.results, now);
        const sync = (recorded.applied.length && knowledgeSyncOn()) ? await syncKnowledge().catch(() => null) : null;
        const cur = recorded.claim, sd = standing(cur, now);
        let h = '<div style="font-weight:600;margin:2px 0;">' + esc(L('Re-checked', '再確認')) + ' · ' + esc(id) + '</div><ul style="margin:2px 0 4px 18px;padding:0;font-size:12px;line-height:1.55;">'
          + recorded.applied.map((x) => '<li>' + esc(x.outcome) + ' — ' + esc(x.source) + '</li>').join('') + '</ul>'
          + note(esc(L('Now', '現在') + ': ' + (cur.kind === 'verified' ? L('verified', '確認済み') : cur.kind === 'inferred' ? L('inferred', '推論') : cur.kind) + (sd.sourceChanged ? ' · ' + L('source changed', '出典が変わった') : '') + (cur.verifiedAt ? ' · ' + L('renewed', '更新') + ' ' + day(cur.verifiedAt) : '')))
          + recorded.rejected.map((x) => warn(esc(L('Not recorded', '記録しませんでした') + ' — ' + x.source + ': ' + x.why))).join('') + syncNote(K, sync);
        return R(recorded.applied.length > 0, h, { meta: { code: recorded.applied.length ? (recorded.rejected.length ? 'PARTIAL' : 'OK') : recorded.rejected[0].code, knowledge: { id, applied: recorded.applied, rejected: recorded.rejected.map((x) => x.code), kind: cur.kind, standing: sd } } });
      }
      /* the plan: what there is to look at, and what IntMap itself can observe about its own datasets */
      const reg = (typeof window !== 'undefined' && window.IntMapData && typeof window.IntMapData.get === 'function') ? window.IntMapData : null;
      const sources = c.sources.map((s) => {
        const o = { source: s.url || s.label, title: s.title, origin: s.origin, lastCheck: s.lastCheck };
        if (!s.url) o.observedHere = reg ? (reg.get(s.label) ? 'present-in-this-session' : 'not-in-this-session') : 'unobservable';
        return o;
      });
      const sd = standing(c, now);
      const h = '<div style="font-weight:600;margin:2px 0;">' + esc(L('Sources to look at again', '再確認する出典')) + ' · ' + esc(id) + '</div><ul style="margin:2px 0 4px 18px;padding:0;font-size:12px;line-height:1.55;">'
        + sources.map((s) => '<li>' + esc(s.source) + (s.lastCheck ? note(esc(L('last checked', '前回') + ' ' + day(s.lastCheck.at) + ': ' + s.lastCheck.outcome)) : note(esc(L('never re-checked', '再確認したことはありません')))) + (s.observedHere ? note(esc(s.observedHere)) : '') + '</li>').join('') + '</ul>'
        + note(esc(L('Time since kept', '保存からの日数') + ': ' + (sd.ageDays == null ? '?' : sd.ageDays) + ' ' + L('days', '日') + (sd.recheckAfterDays ? ' · ' + L('re-check after', '再確認の目安') + ' ' + sd.recheckAfterDays + ' ' + L('days', '日') : '') + (sd.recheckDue ? ' · ' + L('due', '時期です') : '')));
      return R(true, h, { meta: { code: 'OK', knowledge: { id, kind: c.kind, standing: sd, sources } } });
    },
  },
  {
    row: ['knowledge.forget',           'knowledgeForget',   'forgetKnowledge,deleteKnowledge',                              'research','none',    'knowledge',              'explanation',         'persist', 'explicit', '',       ''],
    ui: { none: '2026-11-20' },   /* no reader-facing control yet: the switch is Atlas-only in this slice (docs/architecture/05-ai.md) */
    doc: [
      { in: 'knowledge', at: 30, text: '{"type":"knowledgeForget","id":str} = DELETE ONE KEPT CLAIM (知識を消す) by the id knowledgeRecall returned. Nothing else is touched; a claim that pointed at it keeps its own record. ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str() }, required: ['id'] }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      const id = String(a.id || '').trim();
      if (!id) return R(false, warn(esc(L('Name the claim (its id).', '消す主張の id を指定してください。'))), { meta: { code: 'needs_input' } });
      useKnowledgeHost(() => K.HOST);
      const gone = await knowledgeStore().forget(id);
      const sync = (gone && knowledgeSyncOn()) ? await knowledgeSync().forgetRemote(id).catch((e) => ({ ok: false, reason: 'failed', message: String((e && e.message) || e) })) : null;
      if (sync && !sync.ok) return R(true, note('✓ ' + esc(L('Forgotten on this device', 'この端末では削除しました') + ': ' + id)) + K.warn(esc(L('Its copy in your account could not be removed', 'アカウント上のコピーは削除できませんでした') + ': ' + (sync.message || sync.reason))), { meta: { code: 'PARTIAL', knowledge: { accountCopyRemoved: false } } });
      return R(gone, gone ? note('✓ ' + esc(L('Forgotten', '削除しました') + ': ' + id)) : warn(esc(L('No kept claim with that id', 'その id の主張はありません') + ': ' + id)), { meta: { code: gone ? 'OK' : 'not_found' } });
    },
  },
  {
    row: ['knowledge.setting',          'knowledgeSetting',  'knowledgeSwitch,rememberSetting',                                'settings','none',    'knowledge',              'explanation',         'persist', 'explicit', '',       ''],
    ui: { at: ['#setting-atlas-knowledge'] },   /* the Settings row: off / this device / my account (js/atlas-knowledge-prefs.js) */
    doc: [
      { in: 'knowledge', at: 40, text: '{"type":"knowledgeSetting","on"?:bool,"sync"?:bool,"syncNow"?:bool,"deleteAccountCopy"?:bool,"clear"?:bool} = THE READER\'S SWITCH for kept knowledge (蓄積知識の保存): off until they turn it on; on, claims are stored on THIS device only (nothing is sent anywhere). "sync":true is a SECOND switch, the only one that sends anything: it copies the kept claims to the reader\'s IntMap account (owner-only) so every device they sign in on has them — turn it on only when the reader asks for it, and it needs them signed in; "syncNow":true runs one sync, "deleteAccountCopy":true removes the account\'s copy (the device keeps its own). The same choice is the Settings row «Atlas knowledge» (off / this device / my account). No "on" = report the state and how many claims are kept. Turn it on only when the reader asks for it. "clear":true deletes every kept claim on this device. ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), sync: bool(), syncNow: bool(), deleteAccountCopy: bool(), clear: bool() } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      const S = knowledgeStore();
      if (a.clear === true) await S.clear();
      let on = knowledgeOn();
      if (a.on === true || a.on === false) { on = setKnowledgeOn(a.on); if (on !== a.on) return R(false, warn(esc(L('The setting could not be saved in this browser.', 'このブラウザでは設定を保存できませんでした。'))), { meta: { code: 'unobserved' } }); }
      useKnowledgeHost(() => K.HOST);
      const signedIn = !!(K.HOST && K.HOST.user);
      if (a.sync === true && !signedIn) return R(false, warn(esc(L('Syncing to the account needs the reader signed in.', 'アカウントへの同期にはログインが必要です。'))), { meta: { code: 'needs_signin' } });
      if (a.sync === true && !on) return R(false, warn(esc(L('Turn kept knowledge on first (on:true); sync copies what is kept.', '先に蓄積知識をオンにしてください（on:true）。同期は保存したものを写します。'))), { meta: { code: 'KNOWLEDGE_OFF' } });
      if (a.sync === true || a.sync === false) { if (setKnowledgeSync(a.sync) !== a.sync) return R(false, warn(esc(L('The setting could not be saved in this browser.', 'このブラウザでは設定を保存できませんでした。'))), { meta: { code: 'unobserved' } }); }
      let sync = null;
      if (a.deleteAccountCopy === true) { sync = await knowledgeSync().deleteAccountCopy(); if (sync.ok) setKnowledgeSync(false); }
      else if (a.syncNow === true || a.sync === true) sync = await syncKnowledge().catch((e) => ({ ok: false, reason: 'failed', message: String((e && e.message) || e) }));
      const n = await S.count();
      const acct = knowledgeSyncOn();
      return R(!sync || sync.ok !== false, note('✓ ' + esc(L('Kept knowledge', '蓄積知識') + ': ' + (on ? L('on', 'オン') : L('off', 'オフ')) + ' · ' + n + ' ' + L('claims on this device', '件（この端末）') + (acct ? ' · ' + L('also in your account', 'アカウントにも保存') : ''))) + (a.deleteAccountCopy === true && sync && sync.ok ? note(esc(L('The account copy was deleted.', 'アカウント上のコピーを削除しました。'))) : syncNote(K, sync)), { meta: { code: sync && sync.ok === false ? 'PARTIAL' : 'OK', knowledge: { on, sync: acct, count: n, signedIn } } });
    },
  },
];
