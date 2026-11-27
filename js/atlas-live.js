/* ============================================================================
 *  IntMap · Atlas — READING, DRAWING AND ANSWERING, AS IT HAPPENS   (atlas-live-stream)
 *  window-less module, mounted by js/atlas-console.js
 * ----------------------------------------------------------------------------
 *  ══ WHAT THE READER WAITED FOR, MEASURED ══════════════════════════════════════════════════
 *  A six-operation turn took 57.2 s on production and 13.6 s of it was the operations (#R723). The
 *  rest was model calls, and every one of them was a closed box: ai-proxy asked the provider for one
 *  finished body, and the answer the reader read was a field (`final_text`) inside a strict JSON
 *  object that could not be shown until it had been parsed whole. So the first character the reader
 *  saw was the LAST thing the turn produced.
 *
 *  ai-proxy now streams (supabase/functions/_shared/ai-stream.js), and js/ai-core.js hands each
 *  preview to this file. What it does with them:
 *
 *    · THINKING — the provider's own summary of its reasoning becomes the detail of the live
 *      「考え中」 row (js/atlas-progress.js), as it is written.
 *    · ANSWERING — the reply's JSON is read AS IT ARRIVES (makeDraftReader): its `turn` field is
 *      generated first (FINAL_SCHEMA puts it there — js/atlas-agent.js #R663), so before a single word
 *      of `final_text` is shown it is already known whether the words are the answer or a note on the
 *      way («まず〜を確認します»). The answer goes into the reply bubble as a draft; a note goes into the
 *      trace, where #R663 says it belongs. Text the model wrote outside JSON is shown as written.
 *    · DECIDING — a function call is announced the moment its NAME exists, before its arguments are
 *      complete, as 「next: …」 on the live row — a statement about intent, never a row that says the
 *      operation is running (that row is still opened by the executor's own event).
 *    · THE MAP CARRIES NOTHING — the pill that used to stand on it when the trace was out of sight is gone (2026-11-26).
 *
 *  ⚠⚠⚠ NOTHING HERE DECIDES ANYTHING, AND NOTHING HERE IS AN ANSWER. The draft is replaced by the
 *  answer js/atlas-agent.js returns; a stream that resets (a provider retry) withdraws what it showed;
 *  a stopped turn keeps its draft marked as unfinished; a failed one loses it. No call runs from a
 *  preview and no observer (js/atlas-capabilities.js OBSERVERS) reads one — they judge executed
 *  operations, which reach them exactly as before.
 *
 *  ⚠ THE WAIT IS MEASURED, NOT ASSERTED. Every turn records when the first Atlas-written character
 *  became visible, when the first answer character did, and when the first operation finished drawing
 *  (latency()). window.IntMapAtlasDebug.latency() reads it — the same numbers before and after.
 * ==========================================================================*/

import { makePlanView } from './atlas-plan.js';   /* (atlas-plan-on-map) Atlas's plan, its observed states and the way back to what each step drew — in the work trace since atlas-progress-one */

/* ══ makeDraftReader — the top-level string fields of a JSON object that is still arriving ═════
   feed(delta) → { mode: 'json'|'prose'|'', turn, answerMode, text }
   A small resumable scanner: it tracks depth and string state across deltas, decodes escapes (a
   \uXXXX split across two deltas included), and exposes a top-level string value WHILE it is being
   written. Only depth-1 strings are values; anything nested is skipped. It never throws and never
   guesses: an escape that has not finished arriving is held back until it has. */
export function makeDraftReader() {
  let mode = '';            /* '' until the first non-space character says which */
  let prose = '';
  let depth = 0, inStr = false, isKey = false, esc = false, uni = '';
  let key = '', cur = '', expectValue = false, valueKey = '';
  const fields = Object.create(null);
  /* one decoded character into the current string — and, for a top-level value, into the live field */
  function put(s) { cur += s; if (depth === 1 && !isKey && valueKey) fields[valueKey] = cur; }
  function ch(c) {
    if (inStr) {
      if (esc) {
        if (uni !== '') {                    /* inside \uXXXX */
          uni += c;
          if (uni.length === 5) {            /* 'u' + 4 hex */
            const n = parseInt(uni.slice(1), 16);
            put(isNaN(n) ? '' : String.fromCharCode(n));
            uni = ''; esc = false;
          }
          return;
        }
        if (c === 'u') { uni = 'u'; return; }
        put(({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' })[c] || c);
        esc = false;
        return;
      }
      if (c === '\\') { esc = true; return; }
      if (c === '"') {
        inStr = false;
        if (depth === 1) {
          if (isKey) key = cur;
          else if (valueKey) { fields[valueKey] = cur; valueKey = ''; expectValue = false; }
        }
        cur = '';
        return;
      }
      put(c);   /* the live value */
      return;
    }
    if (c === '"') {
      inStr = true; cur = '';
      isKey = depth === 1 && !expectValue;
      valueKey = (depth === 1 && expectValue) ? key : '';
      return;
    }
    if (c === '{' || c === '[') { depth++; if (depth === 2) expectValue = false; return; }
    if (c === '}' || c === ']') { depth = Math.max(0, depth - 1); return; }
    if (depth === 1 && c === ':') { expectValue = true; return; }
    if (depth === 1 && c === ',') { expectValue = false; return; }
  }
  return {
    feed(delta) {
      const s = String(delta || '');
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (!mode) {
          if (/\s/.test(c)) continue;
          mode = (c === '{') ? 'json' : 'prose';
          /* a fenced block that opens with ``` is still the model writing JSON: skip the fence */
        }
        if (mode === 'prose') { prose += c; continue; }
        ch(c);
      }
      return this.read();
    },
    read() {
      if (mode === 'prose') {
        /* a reply that fenced its JSON is still JSON; the fence is the only prose it has */
        const m = /^\s*```(?:json)?\s*(\{[\s\S]*)$/i.exec(prose);
        if (m) { const r = makeDraftReader(); return Object.assign(r.feed(m[1].replace(/```\s*$/, '')), { fenced: true }); }
        return { mode: 'prose', turn: '', answerMode: '', text: prose };
      }
      return { mode, turn: String(fields.turn || ''), answerMode: String(fields.answer_mode || ''), text: String(fields.final_text || '') };
    },
  };
}

/* The headline of a reasoning summary. Providers write a summary as paragraphs, OpenAI's opening with
   a bold title («**Comparing the two rankings**»); the reader is shown the latest title, or else the
   latest sentence — one line, because it stands in a row of the trace. */
export function thoughtHeadline(text) {
  const s = String(text || '');
  const bolds = s.match(/\*\*([^*\n]{2,120})\*\*/g);
  if (bolds && bolds.length) return bolds[bolds.length - 1].replace(/\*\*/g, '').trim();
  const paras = s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const last = paras.length ? paras[paras.length - 1] : '';
  const sent = last.split(/(?<=[.!?。！？])\s*/).filter((x) => x.trim());
  return (sent.length ? sent[sent.length - 1] : last).replace(/\s+/g, ' ').trim().slice(0, 140);
}

export function makeAtlasLive(HOST, deps) {
  deps = deps || {};
  const L = deps.L || ((en) => en);
  const esc = deps.esc || ((s) => String(s == null ? '' : s));
  const md = deps.md || ((s) => esc(s));
  const PROG = deps.progress || null;
  const now = () => { try { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); } catch (_) { return Date.now(); } };
  const raf = (f) => { try { return requestAnimationFrame(f); } catch (_) { return setTimeout(f, 16); } };
  /* (atlas-progress-one) THE PLAN STANDS IN THE LATEST TURN'S WORK TRACE (js/atlas-progress.js
     `.atl-trace-plan`), not on the map. It outlives the turn there: the trace stays in the conversation,
     and the next turn's trace takes it over (makePlanView moves it — one plan, one place). */
  let lastAi = null;
  const PLANV = deps.plan ? makePlanView(deps.plan, { L, GE: deps.GE, objects: deps.objects,
    slot: () => { try { const el = (PROG && PROG.traceEl && lastAi) ? PROG.traceEl(lastAi) : null; return el ? el.querySelector('.atl-trace-plan') : null; } catch (_) { return null; } },
    mark: (st) => ((PROG && PROG.markEl) ? PROG.markEl(st) : null) }) : null;

  /* ── the per-reply state, keyed by the bubble (one live reply at a time, as js/atlas-progress.js) ── */
  const turns = new WeakMap();
  let current = null;
  const history = [];        /* the last turns' latency records — read by window.IntMapAtlasDebug.latency() */

  function stateOf(ai) { return ai ? turns.get(ai) : null; }

  /* begin(ai) — a reply bubble is about to be worked on. */
  function begin(ai) {
    if (!ai) return null;
    if (current && current !== ai) { try { end(current, 'superseded'); } catch (_) { } }
    current = ai;
    const st = { t0: now(), lat: { streamed: false, steps: 0 }, reader: null, call: 0, thought: '', narr: null, said: [], sayAt: -1,
      draftShown: false, painted: false, candidate: false, seenOps: Object.create(null), ended: false };
    turns.set(ai, st);
    history.push(st.lat);
    if (history.length > 20) history.shift();
    lastAi = ai;
    try { if (PLANV) PLANV.render(); } catch (_) { }   /* a plan from an earlier turn moves into this turn's trace */
    return st;
  }
  function mark(st, k) { if (st && st.lat[k] == null) st.lat[k] = Math.round(now() - st.t0); }

  /* ── the draft in the bubble ─────────────────────────────────────────────────────────────────
     js/atlas-console.js _atlCompose rewrites the bubble whenever a tool files a result; it renders
     `ai.__atlDraft` in the answer's place while there is no answer (draftHtml), so a compose never
     erases what is being written. Between composes this paints the same element directly. */
  function draftHtml(ai) {
    const d = ai && ai.__atlDraft;
    if (!d) return '';
    const st = stateOf(ai);
    const live = !!(st && !st.ended);
    return '<div class="atl-draft' + (live ? ' live' : '') + (ai.__atlDraftStopped ? ' stopped' : '') + '">' + md(d) + '</div>';
  }
  function paintDraft(ai) {
    const st = stateOf(ai); if (!st || st.painted) return;
    st.painted = true;
    raf(() => {
      st.painted = false;
      try {
        let el = ai.querySelector('.atl-draft');
        if (!ai.__atlDraft) { if (el) el.remove(); return; }
        if (!el) { ai.insertAdjacentHTML('afterbegin', draftHtml(ai)); return; }
        el.innerHTML = md(ai.__atlDraft);
        el.classList.toggle('live', !st.ended);
      } catch (_) { }
    });
  }
  function setDraft(ai, text) {
    ai.__atlDraft = String(text || '');
    paintDraft(ai);
  }

  /* ── one model call's previews ───────────────────────────────────────────────────────────────
     hooks(ai) is handed to js/ai-core.js as `stream`; a new one per model call, so the JSON reader
     starts at the beginning of each reply. */
  function hooks(ai) {
    const st = stateOf(ai) || begin(ai);
    st.reader = makeDraftReader();
    st.thought = '';
    st.callNames = [];
    st.lat.steps++;
    /* a draft from an earlier step that did not become the answer is withdrawn when the next step
       starts: it was either a note (already moved to the trace by stepDone) or a final the turn
       handed back to Atlas (js/atlas-agent.js output gate) — in both cases not what will be said */
    /* …but it is KEPT, as a note in the trace, not erased: what the reader watched being written does not vanish (the failure wording of a bounced final
       used to be streamed and then simply cut away, round after round) */
    if (ai.__atlDraft) { narrate(ai, st, ai.__atlDraft); st.narr = null; st.sayAt = -1; setDraft(ai, ''); }
    /* (atlas-completion-verdict) a CANDIDATE the turn handed back (output gate / independent reader) stays where it was written, as a note */
    if (st.candidate) { st.candidate = false; st.narr = null; st.sayAt = -1; }
    return {
      onEvent(name, data) {
        try {
          if (st.ended) return;
          st.lat.streamed = true;
          if (name === 'think') {
            st.thought += String((data && data.d) || '');
            const h = thoughtHeadline(st.thought);
            if (h) { mark(st, 'firstVisible'); mark(st, 'firstThought'); if (PROG) PROG.detail(ai, h); }
          } else if (name === 'text') {
            const r = st.reader.feed((data && data.d) || '');
            if (!r.text) return;
            mark(st, 'firstVisible');
            /* «this reply is a note on the way» — said by Atlas itself, first, before the words */
            if (r.turn === 'continuing' || st.callNames.length) { narrate(ai, st, r.text); return; }
            mark(st, 'firstAnswer');
            /* ⚠⚠ (atlas-completion-verdict) A REPLY THAT WOULD END THE TURN IS A CANDIDATE UNTIL THE TURN ACCEPTS IT. It used to stream into the
               answer's place, and js/atlas-agent.js then held it against what the turn produced and against the independent reader — and handed it
               back when either disagreed. The reader watched an answer (often 「〜できませんでした」) appear in the answer slot and vanish, round after
               round. It is now written where everything said on the way is written (the trace), while the gates can still change it; the answer
               slot receives it once, when the turn ends answered (end() below takes the trace row out — the same words are then the answer). */
            narrate(ai, st, r.text); st.candidate = true;
          } else if (name === 'call') {
            mark(st, 'firstCall');
            const nm = String((data && data.name) || '');
            if (nm) st.callNames.push(nm);
            /* a call in the same reply makes whatever it wrote a note, not the answer */
            if (ai.__atlDraft) { narrate(ai, st, ai.__atlDraft); setDraft(ai, ''); }
            st.candidate = false;   /* …and a candidate whose reply then made a call is a note on the way */
            if (PROG) {
              /* ⚠ ONLY WORDS THAT NAME SOMETHING. A call whose tool has no word of its own (the generic run/find door, whose subject is in
                 arguments that have not streamed yet) is left out rather than written as a placeholder; the row of the operation that
                 follows says what it did, with its subject. The same word twice is one word and a count. */
              const cnt = Object.create(null), order = [];
              st.callNames.forEach((c) => { const w = wordForTool(c); if (!w) return; if (!(w in cnt)) { cnt[w] = 0; order.push(w); } cnt[w]++; });
              const said = order.map((w) => (cnt[w] > 1 ? w + ' ×' + cnt[w] : w)).join(', ');
              if (said) PROG.detail(ai, said, L('Next: ', '次: ', 'Als Nächstes: ', 'Далее: ', 'Siguiente: '));
            }
          } else if (name === 'search') {
            if (PROG) PROG.detail(ai, L('Searching the web', 'Web を検索中', 'Durchsuche das Web', 'Ищу в интернете', 'Buscando en la web'));
          } else if (name === 'reset') {
            /* the provider is being asked again: what was shown came from an attempt that will not answer */
            st.reader = makeDraftReader(); st.thought = ''; st.callNames = [];
            if (st.candidate && st.narr && PROG && PROG.unsay) { try { PROG.unsay(ai, st.narr); } catch (_) { } }
            st.candidate = false;
            if (st.narr) { st.narr = null; }
            if (st.sayAt >= 0) { st.said.splice(st.sayAt, 1); st.sayAt = -1; }   /* that attempt will not answer — its note is not kept either */
            setDraft(ai, '');
            if (PROG) PROG.detail(ai, '');
          }
        } catch (_) { }
      },
    };
  }
  /* the tool name the model used → the reader's word (find_capability, run_capability and promoted
     capabilities go through the same category table js/atlas-progress.js uses) */
  function wordForTool(name) {
    const n = String(name || '');
    /* (atlas-plan-on-map) the loop's own tool: not a capability, so it has no category to be worded by */
    if (deps.plan && deps.plan.TOOL && n === deps.plan.TOOL.name) return L('Planning', '計画を立てる');
    try { if (deps.wordForTool) { const w = deps.wordForTool(n); if (w) return w; } } catch (_) { }
    return '';   /* an unnamed tool has no word — never its raw tool name (find_capability) */
  }
  /* (atlas-interim-kept) every note is also kept, in order, as the words it ended with — the fallback
     for the finished bubble when js/atlas-agent.js returns no `interim` (saidHtml). One entry per row:
     a row that is still streaming rewrites its own entry. */
  function narrate(ai, st, text) {
    const t = String(text || '');
    if (st.sayAt < 0) { st.said.push(t); st.sayAt = st.said.length - 1; } else st.said[st.sayAt] = t;
    if (!PROG) return;
    if (!st.narr) st.narr = PROG.say(ai, '');
    if (st.narr) PROG.sayText(st.narr, text);
  }

  /* stepDone(ai, info) — js/atlas-agent.js chose this step's calls (onStep). Whatever the step wrote is
     a note now, whatever its JSON claimed; the next step starts clean. */
  function stepDone(ai, info) {
    const st = stateOf(ai); if (!st) return;
    const n = (info && Array.isArray(info.calls)) ? info.calls.filter(Boolean).length : 0;
    if (n && ai.__atlDraft) { narrate(ai, st, ai.__atlDraft); setDraft(ai, ''); }
    st.narr = null; st.sayAt = -1; st.candidate = false;
  }

  /* end(ai, how) — 'answered' | 'cancelled' | 'error' | 'superseded'. */
  function end(ai, how) {
    const st = stateOf(ai); if (!st || st.ended) return;
    st.ended = true;
    mark(st, 'end');
    st.lat.how = String(how || '');
    if (current === ai) current = null;
    /* (atlas-completion-verdict) the candidate the turn accepted becomes the answer: its trace row and its entry among the notes go (no word twice) */
    if (st.candidate && how === 'answered') {
      if (st.narr && PROG && PROG.unsay) { try { PROG.unsay(ai, st.narr); } catch (_) { } }
      if (st.sayAt >= 0) st.said.splice(st.sayAt, 1);
      st.narr = null; st.sayAt = -1;
    }
    /* …and a candidate the reader STOPPED stays readable where it was being written for them, marked unfinished (never as an answer): the trace folds
       when the turn ends, and the words the reader stopped would otherwise be out of sight */
    if (st.candidate && (how === 'cancelled' || how === 'superseded') && st.sayAt >= 0 && st.said[st.sayAt]) {
      ai.__atlDraft = st.said[st.sayAt]; ai.__atlDraftStopped = true;
      if (st.narr && PROG && PROG.unsay) { try { PROG.unsay(ai, st.narr); } catch (_) { } }
      st.said.splice(st.sayAt, 1); st.narr = null; st.sayAt = -1;
      try { if (!ai.querySelector('.atl-draft') && ai.insertAdjacentHTML) ai.insertAdjacentHTML('afterbegin', draftHtml(ai)); } catch (_) { }
    }
    st.candidate = false;
    if (how === 'cancelled' || how === 'superseded') {
      /* what was written stays, said to be unfinished — the answer it was going to be never arrived */
      if (ai.__atlDraft) { ai.__atlDraftStopped = true; try { const el = ai.querySelector('.atl-draft'); if (el) { el.classList.remove('live'); el.classList.add('stopped'); } } catch (_) { } }
    } else {
      ai.__atlDraft = '';
      try { const el = ai.querySelector('.atl-draft'); if (el) el.remove(); } catch (_) { }
    }
    try { if (PROG && PROG.outcome) PROG.outcome(ai, how); } catch (_) { }   /* the trace's head says how the turn ended */
  }
  /* said(ai) — the notes this turn wrote on the way, in order (what was narrated; the fallback for js/atlas-agent.js `interim`) */
  function said(ai) { const st = stateOf(ai); return st ? st.said.slice() : []; }
  /* saidHtml(lines, final) — (atlas-interim-kept) what Atlas wrote on the way, kept in the finished
     bubble above its answer as quiet secondary text. The trace collapses when the turn ends, and the
     notes inside it were the only place they stood — so a reader who watched them arrive saw them
     disappear with the answer. A line equal to the answer, or to a line already kept, is not repeated. */
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  function saidHtml(lines, final) {
    const seen = new Set([norm(final)]); let h = '';
    (Array.isArray(lines) ? lines : []).forEach((x) => { const t = norm(x); if (!t || seen.has(t)) return; seen.add(t); h += '<div class="atl-said-line">' + md(String(x).trim()) + '</div>'; });
    return h ? '<div class="atl-said">' + h + '</div>' : '';
  }
  /* the answer is on screen — a moment, not an end (the bubble may still be composing) */
  function answered(ai) { const st = stateOf(ai); if (st) mark(st, 'answer'); }

  /* ══ THE MAP CARRIES NOTHING (2026-11-26) ════════════════════════════════════════════════════
     A pill on the map used to say 「Atlas · 考え中」 whenever the trace was out of sight (sidebar closed, sheet lowered). The reader asked for it gone:
     what Atlas is doing belongs to Atlas's own panel, and a second indicator on the map is the duplication atlas-progress-one removed once already
     (it came back through the one case that rule left open). What it did — open Atlas on press — is the panel's own button. */
  /* watch(EXEC) — ONE subscription, routed to the live reply (the js/atlas-progress.js watch rule). It no
     longer puts anything on the map — the trace has the operation's row — and keeps only what the
     measured wait needs: when the first operation started and when the first drawing landed. */
  const DREW = { completed: 1 };
  let subscribed = false;
  function watch(EXEC) {
    if (subscribed || !EXEC || typeof EXEC.on !== 'function') return;
    subscribed = true;
    EXEC.on((ev) => {
      try {
        if (!ev || !ev.operationId || !current) return;
        const st = stateOf(current); if (!st || st.ended) return;
        if (!st.seenOps[ev.operationId]) {
          if (ev.phase !== 'started') return;      /* an operation is counted from its start, nothing earlier */
          st.seenOps[ev.operationId] = true;
          mark(st, 'firstOp');
        }
        if (DREW[ev.phase]) {
          const produced = Array.isArray(ev.produced) ? ev.produced : [];
          if (produced.indexOf('map') >= 0 || produced.indexOf('chart') >= 0) mark(st, 'firstDraw');
        }
      } catch (_) { }
    });
  }

  return { begin, hooks, stepDone, end, answered, watch, draftHtml, said, saidHtml,
    latency: () => history.map((r) => Object.assign({}, r)),
    plan: PLANV };
}

/* ⚠ CSS IN QUOTED STRINGS ONLY (CONSTITUTION §2 — a back-tick here would blank the site).
   Concatenated into the panel's sheet by js/atlas-styles.js. The pill sits outside #atlas-panel (it is
   on the map), so its rules are not scoped to the panel. */
export const ATLAS_LIVE_CSS =
  '#atlas-panel .atl-draft{margin-bottom:6px;}'
  + '#atlas-panel .atl-said{margin-bottom:8px;color:var(--text-muted);font-size:13px;line-height:1.5;}'
  + '#atlas-panel .atl-said-line+.atl-said-line{margin-top:4px;}'
  + '#atlas-panel .atl-said-line p{margin:0;}'
  /* (atlas-unbounded-execution) the stop line under a reply that ended short, and its «Continue» — a small tinted pill */
  + '#atlas-panel .atl-cut{margin-top:6px;color:var(--text-muted);font-size:11.5px;line-height:1.6;}'
  + '#atlas-panel .atl-cut-go{margin-left:6px;padding:2px 10px;border:0;border-radius:999px;cursor:pointer;'
  + 'background:rgba(10,132,255,0.14);color:#0a84ff;font:600 11.5px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;}'
  + '#atlas-panel .atl-cut-go:hover{background:rgba(10,132,255,0.22);}'
  + '#atlas-panel .atl-cut-go:active{transform:scale(0.97);}'
  + '#atlas-panel .atl-draft.stopped{opacity:.72;border-left:2px dashed var(--glass-border,rgba(128,128,128,0.35));padding-left:8px;}'
  /* (ui-feedback-nov17) WHAT ATLAS WROTE ON THE WAY IS BODY TEXT, NOT A CAPTION: upright, at reading size,
     with room above and below it. Its mark is a speech glyph, not a tick, so it does not wear the green. */
  + '#atlas-panel .atl-trace-row.say{align-items:flex-start;padding:6px 0;}'
  + '#atlas-panel .atl-trace-row.say .atl-trace-mark{color:var(--text-muted);margin-top:4px;}'
  + '#atlas-panel .atl-trace-row.say .atl-trace-det{white-space:normal;overflow:visible;opacity:.92;font-size:14px;line-height:1.55;font-weight:400;}';
