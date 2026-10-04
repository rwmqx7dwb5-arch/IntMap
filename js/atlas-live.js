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
 *    · WHEN THE TRACE CANNOT BE SEEN — one small pill on the map (the HUD below) says what the trace's
 *      head says. Only then: while the trace is on screen the map carries nothing (atlas-progress-one).
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
import { everyTick } from './runtime.js';   /* (atlas-progress-one) the one timer wheel — whether the trace can be seen is looked at, not assumed */

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
    const st = { t0: now(), lat: { streamed: false, steps: 0 }, reader: null, call: 0, thought: '', narr: null,
      draftShown: false, painted: false, seenOps: Object.create(null), ended: false };
    turns.set(ai, st);
    history.push(st.lat);
    if (history.length > 20) history.shift();
    lastAi = ai;
    try { if (PLANV) PLANV.render(); } catch (_) { }   /* a plan from an earlier turn moves into this turn's trace */
    hudBegin(st);
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
    return '<div class="atl-draft' + (live ? ' live' : '') + (ai.__atlDraftStopped ? ' stopped' : '') + '">' + md(d) + (live ? CARET : '') + '</div>';
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
        el.innerHTML = md(ai.__atlDraft) + (st.ended ? '' : CARET);
        el.classList.toggle('live', !st.ended);
      } catch (_) { }
    });
  }
  /* the place the next word will appear — a span after the rendered markdown, not a pseudo-element on
     its last child (which may be a list or a line break, and would put the caret somewhere else) */
  const CARET = '<span class="atl-caret" aria-hidden="true"></span>';
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
    if (ai.__atlDraft) setDraft(ai, '');
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
            setDraft(ai, r.text);
          } else if (name === 'call') {
            mark(st, 'firstCall');
            const nm = String((data && data.name) || '');
            if (nm) st.callNames.push(nm);
            /* a call in the same reply makes whatever it wrote a note, not the answer */
            if (ai.__atlDraft) { narrate(ai, st, ai.__atlDraft); setDraft(ai, ''); }
            if (PROG) PROG.detail(ai, L('Next: ', '次: ', 'Als Nächstes: ', 'Далее: ', 'Siguiente: ') + st.callNames.map(wordForTool).join(', '));
          } else if (name === 'search') {
            if (PROG) PROG.detail(ai, L('Searching the web', 'Web を検索中', 'Durchsuche das Web', 'Ищу в интернете', 'Buscando en la web'));
          } else if (name === 'reset') {
            /* the provider is being asked again: what was shown came from an attempt that will not answer */
            st.reader = makeDraftReader(); st.thought = ''; st.callNames = [];
            if (st.narr) { st.narr = null; }
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
    return n;
  }
  function narrate(ai, st, text) {
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
    st.narr = null;
  }

  /* end(ai, how) — 'answered' | 'cancelled' | 'error' | 'superseded'. */
  function end(ai, how) {
    const st = stateOf(ai); if (!st || st.ended) return;
    st.ended = true;
    mark(st, 'end');
    st.lat.how = String(how || '');
    if (current === ai) current = null;
    if (how === 'cancelled' || how === 'superseded') {
      /* what was written stays, said to be unfinished — the answer it was going to be never arrived */
      if (ai.__atlDraft) { ai.__atlDraftStopped = true; try { const el = ai.querySelector('.atl-draft'); if (el) { el.classList.remove('live'); el.classList.add('stopped'); const c = el.querySelector('.atl-caret'); if (c) c.remove(); } } catch (_) { } }
    } else {
      ai.__atlDraft = '';
      try { const el = ai.querySelector('.atl-draft'); if (el) el.remove(); } catch (_) { }
    }
    try { if (PROG && PROG.outcome) PROG.outcome(ai, how); } catch (_) { }   /* the trace's head says how the turn ended */
    hudEnd(st, how);
  }
  /* the answer is on screen — a moment, not an end (the bubble may still be composing) */
  function answered(ai) { const st = stateOf(ai); if (st) mark(st, 'answer'); }

  /* ══ THE MAP PILL — ONLY WHEN THE TRACE CANNOT BE SEEN (atlas-progress-one) ═══════════════════════
     ⚠⚠⚠ THERE WERE FOUR. For one turn the reader was shown the trace in the sidebar (its head saying
     「Researching」), a pill on the map saying 「Atlas · Researching」, a row of operation chips above it
     saying 「Researching」 again, and the plan as a card of its own — 「この表示、煩雑過ぎない？」. Each
     was added on its own (atlas-live-stream put the HUD on the map so a reader watching the map saw
     the drawing; atlas-plan-on-map put the plan in its column) and nobody decided how they related.
     So: the trace is the one place, the plan is inside it, and the map carries nothing WHILE THE TRACE
     CAN BE SEEN. When it cannot (the sidebar closed, the phone's sheet lowered, the workspace window
     minimised, the trace scrolled away), one pill says what the trace's head says, and pressing it
     opens Atlas.
     ⚠ 「CAN BE SEEN」 IS LOOKED AT, NOT INFERRED FROM A MODE OR A WIDTH. display, visibility and
     opacity pass for an element a panel is lying on ([[intmap-visible-is-not-unoccluded]]), and the
     sidebar, the sheet and the workspace each hide it in a different way. So the trace is seen when part
     of it is inside the viewport, nothing above it is transparent, and the point the reader would look
     at answers to the trace itself (elementsFromPoint, with the pill — which may stand over it —
     looked through). Asked on the runtime's wheel while a turn runs and for the moment after it ends.
     ⚠ THE WORD IS THE TRACE'S. js/atlas-progress.js liveWord() is what its head shows; this pill keeps
     no word of its own, so the two cannot disagree and 「Researching」 is written in one place. */
  let hud = null, stopSeen = null;
  const pill = { ai: null, live: false, endedAt: 0, how: '' };
  const SEEN_TICK_MS = 400;     /* how often 「can the trace be seen」 is asked while it matters — under half a second between closing the sidebar and the pill */
  const END_SHOW_MS = 2600;     /* the ending word stays this long, then the pill goes (the HUD's fade, kept) */
  function hudEl() {
    if (hud && hud.isConnected) return hud;
    try {
      const host = document.getElementById('map');
      const parent = host && host.parentElement;
      if (!parent) return null;
      hud = document.createElement('button');
      hud.type = 'button';
      hud.className = 'atl-hud';
      hud.setAttribute('aria-live', 'polite');
      hud.innerHTML = '<span class="atl-hud-dot"></span><span class="atl-hud-name">Atlas</span><span class="atl-hud-word"></span><span class="atl-hud-step"></span>';
      hud.addEventListener('click', openTrace);
      parent.appendChild(hud);
      return hud;
    } catch (_) { return null; }
  }
  /* pressing the pill opens Atlas through the doors that already exist: the sheet's own detent on a phone
     (js/mobile-ui.js __setDetent), then the console's open() — which uncollapses the sidebar and restores
     a minimised workspace window — and finally the trace is brought into its scroller's view */
  function openTrace() {
    try { const b = document.body.classList, setDetent = window.__setDetent; if (typeof setDetent === 'function' && (b.contains('sheet-min') || b.contains('sheet-hidden'))) setDetent('half'); } catch (_) { }
    try { if (typeof deps.openPanel === 'function') deps.openPanel(); } catch (_) { }
    setTimeout(() => { try { const el = PROG && PROG.traceEl ? PROG.traceEl(pill.ai) : null; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); } catch (_) { } tick(); }, 120);
  }
  /* traceSeen(el) — can the reader see this trace right now? */
  function traceSeen(el) {
    try {
      if (!el || !el.isConnected) return false;
      const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      const r = el.getBoundingClientRect();
      const x0 = Math.max(0, r.left), x1 = Math.min(vw, r.right), y0 = Math.max(0, r.top), y1 = Math.min(vh, r.bottom);
      if (!(x1 - x0 >= 2 && y1 - y0 >= 2)) return false;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
      }
      const pts = [[(x0 + x1) / 2, (y0 + y1) / 2]];
      const head = el.querySelector('.atl-trace-head');
      if (head) { const h = head.getBoundingClientRect(); pts.unshift([(h.left + h.right) / 2, (h.top + h.bottom) / 2]); }
      return pts.some((p) => {
        if (!(p[0] >= 0 && p[1] >= 0 && p[0] < vw && p[1] < vh)) return false;
        const hits = document.elementsFromPoint(p[0], p[1]) || [];
        const top = hits.find((h) => !(hud && (h === hud || hud.contains(h))));
        return !!top && el.contains(top);
      });
    } catch (_) {
      /* could not look: nothing is put on the map — the trace is still where it always is */
      return true;
    }
  }
  function paintPill(h) {
    try {
      const word = (PROG && PROG.liveWord) ? PROG.liveWord(pill.ai) : '';
      h.querySelector('.atl-hud-word').textContent = String(word || '').slice(0, 90);
      let step = '';
      const snap = (pill.live && deps.plan && typeof deps.plan.snapshot === 'function') ? deps.plan.snapshot() : null;
      if (snap && snap.live && snap.thisTurn && snap.steps.length) {
        step = L('Step {i}/{n}', '手順 {i}/{n}').split('{i}').join(String(snap.current)).split('{n}').join(String(snap.steps.length));
      }
      h.querySelector('.atl-hud-step').textContent = step;
      h.setAttribute('aria-label', 'Atlas · ' + word + (step ? ' · ' + step : '') + ' — ' + L('Open Atlas', 'Atlas を開く'));
    } catch (_) { }
  }
  function tick() {
    const h = hudEl(); if (!h) return;
    const ending = !pill.live;
    if (ending && Date.now() - pill.endedAt >= END_SHOW_MS) { setPill(h, false); stopTicking(); return; }
    const seen = traceSeen(PROG && PROG.traceEl ? PROG.traceEl(pill.ai) : null);
    if (seen) { setPill(h, false); return; }
    paintPill(h);
    h.classList.toggle('done', ending);
    setPill(h, true);
  }
  function setPill(h, on) {
    try {
      if (on) { h.classList.remove('off'); h.classList.add('on'); h.tabIndex = 0; }
      else if (h.classList.contains('on')) { h.classList.remove('on'); h.classList.add('off'); h.tabIndex = -1; }
    } catch (_) { }
  }
  function stopTicking() { try { if (stopSeen) { stopSeen(); stopSeen = null; } } catch (_) { } }
  function hudBegin(st) {
    pill.ai = lastAi; pill.live = true; pill.endedAt = 0; pill.how = '';
    try { stopSeen = everyTick('atl-hud-seen', SEEN_TICK_MS, tick); } catch (_) { stopSeen = null; }
    try { tick(); } catch (_) { }
    st.hud = true;
  }
  function hudEnd(st, how) {
    if (!st || !st.hud || pill.ai !== lastAi) return;
    pill.live = false; pill.endedAt = Date.now(); pill.how = String(how || '');
    try { tick(); } catch (_) { }
  }
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

  return { begin, hooks, stepDone, end, answered, watch, draftHtml,
    latency: () => history.map((r) => Object.assign({}, r)),
    plan: PLANV };
}

/* ⚠ CSS IN QUOTED STRINGS ONLY (CONSTITUTION §2 — a back-tick here would blank the site).
   Concatenated into the panel's sheet by js/atlas-styles.js. The pill sits outside #atlas-panel (it is
   on the map), so its rules are not scoped to the panel. */
export const ATLAS_LIVE_CSS =
  '#atlas-panel .atl-draft{margin-bottom:6px;}'
  + '#atlas-panel .atl-caret{display:inline-block;width:.5em;height:1em;margin-left:2px;vertical-align:-0.12em;'
  + 'border-radius:2px;background:currentColor;opacity:.45;animation:atl-caret 1s steps(2,start) infinite;}'
  + '@keyframes atl-caret{to{visibility:hidden;}}'
  + '#atlas-panel .atl-draft.stopped{opacity:.72;border-left:2px dashed var(--glass-border,rgba(128,128,128,0.35));padding-left:8px;}'
  + '#atlas-panel .atl-trace-row.say{align-items:flex-start;}'
  + '#atlas-panel .atl-trace-row.say .atl-trace-det{white-space:normal;overflow:visible;opacity:.9;font-style:italic;}'
  /* ⚠ WHERE IT STANDS WAS MEASURED, NOT CHOSEN: at the top of the map it sat under the search bar, the
     engine switches and every floating legend. The bottom centre of the map is the one band no control
     occupies on a desktop — the readout is bottom-left, Chronos bottom-right. On a phone the sheet covers
     the bottom, so there it stands under the top bar instead (ATLAS_LIVE_CSS_MOBILE). */
  + '.atl-hud{position:absolute;left:50%;bottom:calc(58px + var(--safe-bottom));transform:translate(-50%,8px);z-index:var(--z-map-overlay);pointer-events:none;'
  + 'display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;max-width:min(420px,calc(100% - 32px));opacity:0;margin:0;cursor:pointer;'
  + 'background:var(--sidebar-bg,rgba(28,28,30,0.85));color:var(--text-main,#fff);border:1px solid rgba(127,127,127,0.22);'
  + 'backdrop-filter:blur(18px) saturate(1.6);-webkit-backdrop-filter:blur(18px) saturate(1.6);box-shadow:0 6px 22px rgba(0,0,0,0.18);'
  + 'transition:opacity .22s ease,transform .22s ease;font:500 12px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;}'
  + '.atl-hud.on{opacity:1;transform:translate(-50%,0);pointer-events:auto;}'
  + '.atl-hud.off{opacity:0;}'
  + '.atl-hud:not(.on){visibility:hidden;transition:opacity .22s ease,transform .22s ease,visibility 0s linear .22s;}'
  + '.atl-hud-name{font-weight:700;}'
  + '.atl-hud-word{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted,rgba(255,255,255,0.75));}'
  + '.atl-hud-step{flex:0 0 auto;font-variant-numeric:tabular-nums;color:var(--text-muted,rgba(255,255,255,0.75));}'
  + '.atl-hud-step:empty{display:none;}'
  + '.atl-hud-step::before{content:"\\00b7";margin-right:7px;}'
  + '.atl-hud-dot{width:8px;height:8px;border-radius:50%;background:#0a84ff;flex:0 0 8px;animation:atl-hud-pulse 1.2s ease-in-out infinite;}'
  + '.atl-hud.done .atl-hud-dot{animation:none;background:#30d158;}'
  + '@keyframes atl-hud-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.7);}}'
  + '@media (prefers-reduced-motion:reduce){.atl-hud,.atl-hud.on{transition:none;transform:translate(-50%,0);}'
  + '.atl-hud-dot,#atlas-panel .atl-caret{animation:none;}}';
/* On a phone the Atlas sheet covers the bottom of the map, so the pill stands under the top bar. Placed
   inside the panel sheet's phone block by js/atlas-styles.js — the boundary is IntMapDevice.COMPACT. */
export const ATLAS_LIVE_CSS_MOBILE =
  '.atl-hud{bottom:auto;top:calc(64px + var(--safe-top));transform:translate(-50%,-8px);}';
