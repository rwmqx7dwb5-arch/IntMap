/* ============================================================================
 *  IntMap · Atlas capabilities — the `dialog.*` namespace   (js/atlas-cap-dialog.js)
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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, bool, list, obj } from './atlas-caps.js';

export default [
  {
    row: ['dialog.ask',                 'ask',            'choose,clarify,options',                                      'dialog',  'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    /* a clarification with no question is the defect it exists to prevent */
    /* documented by the ALWAYS-SENT rules text (the PRECISION vs AMBIGUITY paragraph says WHEN to clarify) rather than by a catalogue
       fragment — separating the two would be worse prompt. The value is the literal the audit looks for there. (§14) a FALLBACK: reachable, but not a user-facing feature — kept out of the search's front rank so it cannot crowd out a real capability */
    policy: { ruleDocumented: '{"type":"ask"', fallback: true },
    schema: () => ({ type: 'object', properties: { question: str(), options: list(), allowText: bool(), freeText: bool(), text: str(), say: str(), prompt: str() }, required: ['question'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, esc = K.esc, L = K.L;
      {
          /* (#R84) SELECTION-STYLE clarification ("ユーザーが十分な情報を提示しない場合…選択形式で聞く"):
             a question + clickable option chips + a free-text box. Picking a chip (or typing) sends it back to Atlas. */
          const q=String(a.question||a.text||a.say||a.prompt||'').trim();
          const opts=Array.isArray(a.options)?a.options.map(o=>String((o&&o.label)||o||'').trim()).filter(Boolean).slice(0,6):[];
          const allowText=a.allowText!==false&&a.freeText!==false;
          if(!q&&!opts.length) return R(false, warn('⚠'));
          /* ══ ⚠⚠ (#R313) THE QUESTION STAYS, THE PICKER GOES ════════════════════════════════
             「ユーザーが回答したら、そのUIは消してください。…きいた文章とユーザーの回答自体は
               そのままでいいけど、選択するためのUIはいらないですよねって話」 Nothing removed or
             disabled these after an answer, so a finished clarification kept a live menu in the
             transcript that could be re-clicked for ever — and re-clicking it asked a question that
             had already been answered further down the page. The chips and the free-text box are
             the PICKER; the sentence above them is the RECORD. Only the picker is wrapped, and only
             the picker is removed (see the `.atl-choice-ui` handler further down). */
          let hh='<div style="font-size:12.5px;line-height:1.6;margin-bottom:7px;">'+esc(q||L('Which one?','どれにしますか？','Welche?','Какой вариант?','¿Cuál?'))+'</div>';
          const _wrapOpen='<div class="atl-choice-ui">', _wrapClose='</div>';
          hh+=_wrapOpen;
          if(opts.length){ hh+='<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:'+(allowText?'8px':'2px')+';">'
            +opts.map(o=>'<button class="atl-choice" data-choice="'+esc(encodeURIComponent(o))+'" style="text-align:left;border:1px solid var(--glass-border,rgba(128,128,128,0.32));background:var(--input-bg);color:var(--text-main);border-radius:10px;padding:8px 12px;font-size:12px;cursor:pointer;">'+esc(o)+'</button>').join('')+'</div>'; }
          if(allowText){ hh+='<div class="atl-choice-txt" style="display:flex;gap:6px;"><input type="text" class="atl-choice-in" placeholder="'+esc(L('or type your own answer…','または自由に入力…','oder eigene Antwort…','или введите свой ответ…','o escribe tu respuesta…'))+'" style="flex:1;min-width:0;height:34px;padding:0 12px;border-radius:17px;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);font-size:12px;outline:none;box-sizing:border-box;"><button class="atl-choice-go" title="'+L('Send','送信','Senden','Отправить','Enviar')+'" style="flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:#fff;color:#111;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 1px 4px rgba(0,0,0,0.14);"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg></button></div>'; }   /* (#R149) white bg + BLACK icon + a real up-arrow SVG (was accent bg + plain-text "→") — "白背景黒文字に。plain textの→はやめて" */
          hh+=_wrapClose;
          return R(true, hh); }
    },
  },
  {
    row: ['dialog.answer',              'answer',         '',                                                            'dialog',  'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    doc: [
      { in: 'answer', at: 10, text: (c) => '{"type":"answer","text":str,"contentClass"?:str,"checks"?:object[],"places"?:[{"n":str,"c":str,"k":str}]} — for STABLE, TIMELESS knowledge or conceptual explanation questions ("ギリシャの文化を教えて", "why is the Sahel dry?"), LISTEN to what was actually asked and give the FULL substantive answer HERE, in "text", in ' + c.lang + ' (up to ~250 words). CONTENT CLASS + MATH: set "contentClass" to one of "math"|"document"|"code"|"language"|"geographic"|"photo"|"conceptual" so IntMap renders + maps correctly — IntMap maps ONLY when it is "geographic", so a maths, code, grammar or general-knowledge answer NEVER produces map pins (do NOT list "places" for those). Write EVERY formula in STANDARD LaTeX — inline \\( … \\), display/matrices \\[ … \\] with \\frac, pmatrix, ^ and _ (never bare V^{-1}U) — and for any independently checkable numeric/matrix identity emit "checks":[{"type":"matmul","label":"…","a":<matrix>,"b":<matrix>,"expect":<matrix>}|{"type":"equal","label":"…","left":<num|"a/b">,"right":<…>}] using exact fraction strings; IntMap recomputes them exactly and shows a verified/failed note. SOURCING ROUTING (the user is angry that answers arrive with NO sources): if the answer will make SPECIFIC, CHECKABLE factual claims a reader might want to verify — statistics, dated events, attributions, quotes, "who/when/how many", recent or contested facts — prefer ' },
    ],
    /* (§14) a FALLBACK: reachable, but not a user-facing feature — kept out of the search's front rank so it cannot crowd out a real capability */
    policy: { fallback: true },
    schema: () => ({ type: 'object', properties: { text: str(), contentClass: str(), checks: list(obj()), places: list(obj()) }, required: ['text'] }),
    async run(a, dctx, K) { const mdMini = K.mdMini, _atlContentClass = K._atlContentClass, _atlVerifyChecks = K._atlVerifyChecks, _atlChecksNoteHtml = K._atlChecksNoteHtml, _atlShouldMap = K._atlShouldMap, _pinReplyPlaces = K._pinReplyPlaces, linkCards = K.linkCards, L = K.L, R = K.R;
      { let _ah='<div class="atl-md">'+mdMini(a.text||'')+'</div>';   /* (#R149) if the answer NAMED mappable places, pin them (unless the plan already pinned) so a location-rich reply always delivers map value */
          /* (#R156) shared spine: a text answer may also carry a content class + verifiable checks (e.g. the model solved
             an equation in prose). Verify the checks deterministically, show the honest self-check note, and let the SAME
             class gate mapping below — so a math/code/document text answer never runs place extraction either. */
          const _acls=_atlContentClass(a.contentClass); try{ const _cv=_atlVerifyChecks(a.checks); _ah+=_atlChecksNoteHtml(_cv); }catch(_){}
          /* (#R150) same code-side reconciliation for the planner's direct `answer`: audit the answer text (safety net
             for an omitted places list), merge with existing pins, honest self-audit + source-concentration note. */
          { const _acit=K._curPlanCites.slice();   /* ⚠ (#R350) from the planner call that produced THIS answer. It used to be window._aiLastCitations, read at RENDER time — so a second Atlas turn finishing in between handed this reply the other turn's sources, under the heading 「Web検証済みソース」. */
            try{ if(_atlShouldMap(_acls)) _ah+=await _pinReplyPlaces(a.places||[],{text:String(a.text||''),citations:_acit,contentClass:_acls}); }catch(e){ try{ console.warn('answer map audit',e); }catch(_){} }
            /* (#R153) the planner's direct `answer` used to render ZERO sources even when the model's hosted web search
               returned citations — the dominant "出展が全くない" (no sources at all) driver. Show the web-verified cards
               when they exist (anchored to the reply → no relevance gate). When the answer was from the model's own
               knowledge there simply are no web sources, which is honest — not a bug. */
            try{ const sc=linkCards(_acit.map(c=>({url:c.url,title:(c.title||c.url),src:''}))); if(sc) _ah+='<div class="atl-src-h">'+L('Web-verified sources','Web検証済みソース','Web-verifizierte Quellen','Проверенные в интернете источники','Fuentes verificadas en la web')+'</div>'+sc; }catch(_){} }
          return R(true, _ah); }
    },
  },
];
