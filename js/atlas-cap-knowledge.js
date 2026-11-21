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
import { knowledgeOn, setKnowledgeOn, knowledgeStore } from './atlas-knowledge.js';
import { claimFromInput, recall, withinBudget } from './atlas-knowledge-store.js';

const off = (K) => K.R(false, K.warn(K.esc(K.L('Kept knowledge is off. It is stored only on this device and only once the reader turns it on — ask them, then use the knowledge setting.', '蓄積知識はオフです。この端末にだけ、読者が有効にしたときだけ保存します。読者に確認してから knowledge の設定で有効にしてください。'))), { meta: { code: 'KNOWLEDGE_OFF' } });
const day = (ms) => { try { return new Date(ms).toISOString().slice(0, 10); } catch (_) { return ''; } };
const kindText = (L, k) => (k === 'verified' ? L('verified', '確認済み') : k === 'contested' ? L('contested', '矛盾あり') : k === 'stale' ? L('stale', '古い情報') : L('inferred', '推論'));

export default [
  {
    row: ['knowledge.remember',         'knowledgeRemember', 'rememberKnowledge,keepKnowledge,saveFact',                    'research','none',    'knowledge',              'explanation',         'persist', 'none',   '',         ''],
    ui: { none: '2026-11-20' },   /* no reader-facing control yet: the switch is Atlas-only in this slice (docs/architecture/05-ai.md) */
    doc: [
      { in: 'knowledge', at: 10, text: '{"type":"knowledgeRemember","claims":[{"statement":str,"kind":"verified"|"inferred","evidence"?:[{"id"?:"e3","url"?:str,"title"?:str,"publisher"?:str,"date"?:str} | {"origin":"app_data"|"calculation","dataset":str}],"basis"?:str,"place"?:{"name":str,"lng":num,"lat":num},"validFrom"?:"YYYY[-MM-DD]","validTo"?:"YYYY[-MM-DD]","refs"?:["type:id",…],"topic"?:str,"contradicts"?:[id,…],"supersedes"?:[id,…]},…]} = KEEP WHAT AN INVESTIGATION ESTABLISHED (知識として残す) — only when the reader has turned kept knowledge on (the knowledge setting); otherwise it answers KNOWLEDGE_OFF. Keep a claim, not an answer: one statement, with what it rests on. "verified" REQUIRES a source that can be checked again — a url (pass the evidence record\'s url and title; the evidence id alone means nothing in a later session) or a named IntMap dataset / calculation — and is REFUSED without one; a reasoned conclusion is "inferred" and must give its "basis". Never keep an unsourced past answer as verified. Tie it to where and when it holds (place, validFrom/validTo — «as of» a period, not forever) and to the world objects it is about (refs from observed.worldObjects, e.g. "facility:wd-Q104518607"). When a newer finding replaces an older kept claim pass its id in "supersedes" (the old one becomes stale); when two kept claims disagree pass "contradicts" (both become contested and are shown side by side — IntMap does not pick a winner). Returns each claim\'s id and whether it was kept, merged into an identical one, or refused and why. ' },
    ],
    schema: () => ({ type: 'object', properties: { claims: list(obj(), 1, 20) }, required: ['claims'] }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      if (!knowledgeOn()) return off(K);
      const S = knowledgeStore(), now = Date.now();
      const have = new Set((await S.list()).map((c) => c.id));
      const items = Array.isArray(a.claims) ? a.claims : (a.statement ? [a] : []);
      if (!items.length) return R(false, warn(esc(L('Pass the claims to keep.', '残す主張を指定してください。'))), { meta: { code: 'needs_input' } });
      const kept = [], refused = [];
      for (const it of items) {
        const r = claimFromInput(it, now, have);
        if (r.error) { refused.push({ statement: String((it && it.statement) || '').slice(0, 80), code: r.error.code, why: r.error.why }); continue; }
        const out = await S.remember(r.claim, now); have.add(out.claim.id);
        kept.push({ id: out.claim.id, kind: out.claim.kind, merged: out.merged, statement: out.claim.statement.slice(0, 120), marked: out.marked });
      }
      let h = '';
      if (kept.length) h += '<div style="font-weight:600;margin:2px 0;">' + esc(L('Kept as knowledge', '知識として保存')) + ' · ' + kept.length + '</div><ul style="margin:2px 0 4px 18px;padding:0;font-size:12px;line-height:1.55;">'
        + kept.map((k) => '<li><b>' + esc(k.id) + '</b> · ' + esc(kindText(L, k.kind) + (k.merged ? ' · ' + L('merged into an identical claim', '同一の主張に統合') : '')) + ' — ' + esc(k.statement) + (k.marked.length ? note(esc(L('marked', '更新') + ': ' + k.marked.join(', '))) : '') + '</li>').join('') + '</ul>';
      if (refused.length) h += refused.map((x) => warn(esc(L('Not kept', '保存しませんでした') + ' — ' + x.statement + ': ' + x.why))).join('');
      return R(kept.length > 0, h, { meta: { code: kept.length ? (refused.length ? 'PARTIAL' : 'OK') : refused[0].code, knowledge: { kept: kept.length, refused: refused.length, ids: kept.map((k) => k.id), refusals: refused.map((x) => x.code) } } });
    },
  },
  {
    row: ['knowledge.recall',           'knowledgeRecall',   'recallKnowledge,whatDoIKnow,priorKnowledge',                  'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    ui: { none: '2026-11-20' },   /* no reader-facing control yet: the switch is Atlas-only in this slice (docs/architecture/05-ai.md) */
    doc: [
      { in: 'knowledge', at: 20, text: '{"type":"knowledgeRecall","query"?:str,"near"?:{"lng":num,"lat":num,"km"?:num},"refs"?:["type:id",…],"at"?:"YYYY[-MM-DD]","kinds"?:["verified"|"inferred"|"contested"|"stale"],"includeStale"?:bool,"limit"?:int} = WHAT IS ALREADY KNOWN (蓄積知識を読み込む) — claims kept from earlier investigations, matched to THIS question by its words, a place and radius, a world-object ref, or a date the claim\'s period must contain. Use it at the START of a question that touches ground the reader has covered before, then spend the turn on what is new. Loads only a few (limit, default 8, within a size budget) and says how many more matched. Each claim carries its STATUS and what it rests on: verified (a source — shown), inferred (the earlier reasoning — shown, NOT a fact), contested (a conflicting claim exists, shown with it), stale (superseded — left out unless asked); a claim whose stated period has ended says so. Treat what comes back as a lead to re-check against live sources when the question is about now, never as today\'s answer. Answers KNOWLEDGE_OFF when the reader has not turned kept knowledge on. ' },
    ],
    schema: () => ({ type: 'object', properties: { query: str(), near: obj(), refs: list(str()), at: str(), kinds: list(str()), includeStale: bool(), limit: int(1, 50) } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note;
      if (!knowledgeOn()) return off(K);
      const S = knowledgeStore(), now = Date.now();
      const all = await S.list();
      const { claims, omittedStale } = recall(all, { query: a.query, near: a.near, refs: a.refs, ref: a.ref, at: a.at, kinds: a.kinds, includeStale: a.includeStale }, now);
      const { shown, cut } = withinBudget(claims, 4000, Math.max(1, Math.min(50, +a.limit || 8)));
      if (!shown.length) return R(true, note(esc(L('Nothing is kept that matches.', '一致する蓄積知識はありません。') + (omittedStale ? ' (' + omittedStale + ' ' + L('stale left out', '件の古い情報は除外') + ')' : ''))), { meta: { code: 'NO_RESULTS', knowledge: { count: 0, total: all.length, omittedStale } } });
      const h = '<div style="font-weight:600;margin:2px 0 5px;">' + esc(L('Kept knowledge', '蓄積知識')) + ' · ' + shown.length + (cut ? ' / ' + claims.length : '') + '</div><ul style="margin:2px 0 4px 18px;padding:0;font-size:12px;line-height:1.55;">'
        + shown.map((c) => {
          const when = (c.validFromMs != null || c.validToMs != null) ? ' · ' + (c.validFromMs != null ? day(c.validFromMs) : '…') + ' → ' + (c.validToMs != null ? day(c.validToMs) : '…') + (c.expired ? ' (' + L('period ended', '期間終了') + ')' : '') : '';
          const src = c.sources.length ? c.sources.map((s) => s.url ? s.title + ' ' + s.url : (s.label || s.title)).join(' · ') : (c.basis ? L('basis', '根拠') + ': ' + c.basis : '');
          return '<li><b>' + esc(c.id) + '</b> · ' + esc(kindText(L, c.kind) + ' · ' + L('kept', '保存') + ' ' + day(c.updatedAt) + when) + ' — ' + esc(c.statement)
            + (c.place && c.place.name ? note(esc(c.place.name)) : '') + (src ? note(esc(src)) : '') + (c.refs.length ? note(esc(c.refs.join(', '))) : '') + '</li>';
        }).join('') + '</ul>' + (cut ? note(esc(L('More matched than were loaded:', '読み込んだ以外にも一致:') + ' ' + cut)) : '') + (omittedStale ? note(esc(L('Stale claims left out', '除外した古い情報') + ': ' + omittedStale)) : '');
      const brief = shown.map((c) => ({ id: c.id, kind: c.kind, statement: c.statement, basis: c.basis, sources: c.sources.map((s) => ({ title: s.title, url: s.url, label: s.label, evidenceId: s.evidenceId })), place: c.place, validFrom: c.validFromMs, validTo: c.validToMs, expired: c.expired, refs: c.refs, contradicts: c.contradicts, supersededBy: c.supersededBy, keptAt: c.updatedAt }));
      return R(true, h, { meta: { code: 'OK', knowledge: { count: shown.length, matched: claims.length, omittedStale, claims: brief } } });
    },
  },
  {
    row: ['knowledge.forget',           'knowledgeForget',   'forgetKnowledge,deleteKnowledge',                              'research','none',    'knowledge',              'explanation',         'persist', 'explicit', '',       ''],
    ui: { none: '2026-11-20' },   /* no reader-facing control yet: the switch is Atlas-only in this slice (docs/architecture/05-ai.md) */
    doc: [
      { in: 'knowledge', at: 30, text: '{"type":"knowledgeForget","id"?:str,"all"?:bool} = DELETE KEPT CLAIMS (知識を消す): one by the id knowledgeRecall returned, or every kept claim with all:true. Nothing else is touched; a claim that pointed at it keeps its own record. ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), all: bool() }, anyOf: [{ required: ['id'] }, { required: ['all'] }] }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      if (a.all === true) { const n = await knowledgeStore().count(); await knowledgeStore().clear(); return R(true, note('✓ ' + esc(L('Forgotten', '削除しました') + ': ' + n)), { meta: { code: 'OK', knowledge: { forgotten: n } } }); }
      const id = String(a.id || '').trim();
      if (!id) return R(false, warn(esc(L('Name the claim (its id).', '消す主張の id を指定してください。'))), { meta: { code: 'needs_input' } });
      const gone = await knowledgeStore().forget(id);
      return R(gone, gone ? note('✓ ' + esc(L('Forgotten', '削除しました') + ': ' + id)) : warn(esc(L('No kept claim with that id', 'その id の主張はありません') + ': ' + id)), { meta: { code: gone ? 'OK' : 'not_found' } });
    },
  },
  {
    row: ['knowledge.setting',          'knowledgeSetting',  'knowledgeSwitch,rememberSetting',                                'settings','none',    'knowledge',              'explanation',         'persist', 'none',   '',       ''],
    ui: { none: '2026-11-20' },   /* no reader-facing control yet: the switch is Atlas-only in this slice (docs/architecture/05-ai.md) */
    doc: [
      { in: 'knowledge', at: 40, text: '{"type":"knowledgeSetting","on"?:bool} = THE READER\'S SWITCH for kept knowledge (蓄積知識の保存): off until they turn it on; on, claims are stored on THIS device only (nothing is sent anywhere). No "on" = report the state and how many claims are kept. Turn it on only when the reader asks for it. "clear":true deletes every kept claim. ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool() } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      const S = knowledgeStore();
      let on = knowledgeOn();
      if (a.on === true || a.on === false) { on = setKnowledgeOn(a.on); if (on !== a.on) return R(false, warn(esc(L('The setting could not be saved in this browser.', 'このブラウザでは設定を保存できませんでした。'))), { meta: { code: 'unobserved' } }); }
      const n = await S.count();
      return R(true, note('✓ ' + esc(L('Kept knowledge', '蓄積知識') + ': ' + (on ? L('on', 'オン') : L('off', 'オフ')) + ' · ' + n + ' ' + L('claims on this device', '件（この端末）'))), { meta: { code: 'OK', knowledge: { on, count: n } } });
    },
  },
];
