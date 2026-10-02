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
 *    · DRAWING — every operation's start and end is shown ON THE MAP as well (the HUD below), so a
 *      reader watching the map sees what is being drawn while it is drawn.
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

import { makePlanView, ATLAS_PLAN_CSS } from './atlas-plan.js';   /* (atlas-plan-on-map) Atlas's plan, its observed states and the way back to what each step drew — in this HUD's column */

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
  /* (atlas-plan-on-map) the plan stands in the HUD's column, above the operations — the one place on the
     map that was measured to be free (below). It outlives the turn: when the turn ends and a plan is
     showing, the HUD RESTS (the live word and the chips go, the plan stays) instead of fading away. */
  let planShown = false;
  const PLANV = deps.plan ? makePlanView(deps.plan, { L, GE: deps.GE, objects: deps.objects,
    slot: () => { const h = hudEl(); return h ? h.querySelector('.atl-hud-plan') : null; },
    changed: (on) => { planShown = !!on; try { if (hud && (hud.classList.contains('rest') || hud.classList.contains('off'))) restOrFade(hud); } catch (_) { } } }) : null;

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
      draftShown: false, painted: false, hudOps: Object.create(null), ended: false };
    turns.set(ai, st);
    history.push(st.lat);
    if (history.length > 20) history.shift();
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
            if (h) { mark(st, 'firstVisible'); mark(st, 'firstThought'); if (PROG) PROG.detail(ai, h); hudWord(st, h); }
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
            hudWord(st, L('Searching the web', 'Web を検索中', 'Durchsuche das Web', 'Ищу в интернете', 'Buscando en la web'));
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
    hudEnd(st, how);
  }
  /* the answer is on screen — a moment, not an end (the bubble may still be composing) */
  function answered(ai) { const st = stateOf(ai); if (st) mark(st, 'answer'); }

  /* ══ THE MAP HUD — what is being done, where it is being done ══════════════════════════════════
     The trace is in the sidebar; the drawing is on the map, and a reader watching one is not reading
     the other. So the same lifecycle is shown on the map: the live word, and one chip per operation
     that runs while it runs and is ticked (or crossed) when the executor says it ended. Rows come only
     from the executor's events — a preview never puts a chip here. */
  let hud = null, hudFade = null;
  function hudEl() {
    if (hud && hud.isConnected) return hud;
    try {
      const host = document.getElementById('map');
      const parent = host && host.parentElement;
      if (!parent) return null;
      hud = document.createElement('div');
      hud.className = 'atl-hud';
      hud.setAttribute('role', 'status');
      hud.setAttribute('aria-live', 'polite');
      hud.innerHTML = '<div class="atl-hud-head"><span class="atl-hud-dot"></span><span class="atl-hud-name">Atlas</span><span class="atl-hud-word"></span></div><div class="atl-hud-ops"></div><div class="atl-hud-plan"></div>';
      parent.appendChild(hud);
      return hud;
    } catch (_) { return null; }
  }
  function hudBegin(st) {
    const h = hudEl(); if (!h) return;
    try { clearTimeout(hudFade); } catch (_) { }
    try {
      h.querySelector('.atl-hud-ops').innerHTML = '';
      h.classList.remove('done', 'off', 'rest');
      h.classList.add('on');
      h.querySelector('.atl-hud-word').textContent = L('Thinking', '考え中', 'Denke nach', 'Думаю', 'Pensando');
    } catch (_) { }
    st.hud = h;
  }
  function hudWord(st, w) {
    try { if (st && st.hud && !st.ended) st.hud.querySelector('.atl-hud-word').textContent = String(w || '').slice(0, 90); } catch (_) { }
  }
  function hudEnd(st, how) {
    const h = st && st.hud; if (!h) return;
    try {
      h.classList.add('done');
      h.querySelector('.atl-hud-word').textContent = how === 'answered'
        ? L('Answered', '回答しました', 'Beantwortet', 'Ответ готов', 'Respondido')
        : (how === 'error' ? L('Could not answer', '回答できませんでした', 'Keine Antwort möglich', 'Не удалось ответить', 'No se pudo responder')
          : L('Stopped', '停止しました', 'Angehalten', 'Остановлено', 'Detenido'));
      h.querySelectorAll('.atl-hud-op.run').forEach((o) => { o.classList.remove('run'); o.classList.add('skip'); });
      clearTimeout(hudFade);
      hudFade = setTimeout(() => restOrFade(h), 2600);
    } catch (_) { }
  }
  /* after a turn: a plan on show keeps the HUD at rest (the plan alone); otherwise it fades as before */
  function restOrFade(h) {
    try {
      if (!h.classList.contains('done')) return;
      if (planShown) { h.classList.remove('off'); h.classList.add('on', 'rest'); }
      else { h.classList.remove('on', 'rest'); h.classList.add('off'); }
    } catch (_) { }
  }
  const HUD_STATE = { completed: 'ok', partial: 'warn', unobserved: 'warn', failed: 'fail', cancelled: 'skip', superseded: 'skip' };
  /* watch(EXEC) — ONE subscription, routed to the live reply (the js/atlas-progress.js watch rule). */
  let subscribed = false;
  function watch(EXEC) {
    if (subscribed || !EXEC || typeof EXEC.on !== 'function') return;
    subscribed = true;
    EXEC.on((ev) => {
      try {
        if (!ev || !ev.operationId || !current) return;
        const st = stateOf(current); if (!st || st.ended || !st.hud) return;
        const ops = st.hud.querySelector('.atl-hud-ops');
        let chip = st.hudOps[ev.operationId];
        if (!chip) {
          if (ev.phase !== 'started') return;      /* a chip is opened by the operation starting, nothing earlier */
          mark(st, 'firstOp');
          const word = (PROG && PROG.wordFor) ? PROG.wordFor(ev.capabilityId) : String(ev.capabilityId || '');
          chip = document.createElement('div');
          chip.className = 'atl-hud-op run';
          chip.innerHTML = '<span class="atl-hud-mark"></span><span class="atl-hud-w"></span>';
          chip.querySelector('.atl-hud-w').textContent = word;
          ops.appendChild(chip);
          while (ops.children.length > 4) ops.removeChild(ops.firstChild);
          st.hudOps[ev.operationId] = chip;
          hudWord(st, word);
        }
        const s = HUD_STATE[ev.phase];
        if (s) {
          chip.className = 'atl-hud-op ' + s;
          const produced = Array.isArray(ev.produced) ? ev.produced : [];
          if (s === 'ok' && (produced.indexOf('map') >= 0 || produced.indexOf('chart') >= 0)) mark(st, 'firstDraw');
        }
      } catch (_) { }
    });
  }

  return { begin, hooks, stepDone, end, answered, watch, draftHtml,
    latency: () => history.map((r) => Object.assign({}, r)),
    plan: PLANV };
}

/* ⚠ CSS IN QUOTED STRINGS ONLY (CONSTITUTION §2 — a back-tick here would blank the site).
   Concatenated into the panel's sheet by js/atlas-styles.js. The HUD sits outside #atlas-panel (it is
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
     engine switches and every floating legend (a screenshot of the first build showed only its spinner).
     The bottom centre of the map is the one band no control occupies on a desktop — the readout is
     bottom-left, Chronos bottom-right — and the head sits lowest, with the operations stacked above it.
     On a phone the Atlas sheet covers the bottom, so there it stands under the top bar instead. */
  + '.atl-hud{position:absolute;left:50%;bottom:calc(58px + var(--safe-bottom));transform:translate(-50%,8px);z-index:var(--z-map-overlay);pointer-events:none;'
  + 'display:flex;flex-direction:column-reverse;align-items:center;gap:5px;max-width:min(560px,calc(100% - 32px));opacity:0;'
  + 'transition:opacity .22s ease,transform .22s ease;font:500 12px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;}'
  + '.atl-hud.on{opacity:1;transform:translate(-50%,0);}'
  + '.atl-hud.off{opacity:0;}'
  + '.atl-hud-head,.atl-hud-op{display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;max-width:100%;'
  + 'background:var(--sidebar-bg,rgba(28,28,30,0.85));color:var(--text-main,#fff);border:1px solid rgba(127,127,127,0.22);'
  + 'backdrop-filter:blur(18px) saturate(1.6);-webkit-backdrop-filter:blur(18px) saturate(1.6);box-shadow:0 6px 22px rgba(0,0,0,0.18);}'
  + '.atl-hud-name{font-weight:700;}'
  + '.atl-hud-word{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted,rgba(255,255,255,0.75));}'
  + '.atl-hud-dot{width:8px;height:8px;border-radius:50%;background:#0a84ff;flex:0 0 8px;animation:atl-hud-pulse 1.2s ease-in-out infinite;}'
  + '.atl-hud.done .atl-hud-dot{animation:none;background:#30d158;}'
  + '@keyframes atl-hud-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.7);}}'
  + '.atl-hud-ops{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;}'
  + '.atl-hud-op{padding:4px 10px;font-size:11.5px;}'
  + '.atl-hud-w{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
  + '.atl-hud-mark{flex:0 0 10px;width:10px;height:10px;display:inline-block;border-radius:50%;}'
  + '.atl-hud-op.run .atl-hud-mark{border:1.6px solid currentColor;border-top-color:transparent;animation:atl-trace-spin .7s linear infinite;}'
  + '.atl-hud-op.ok .atl-hud-mark{background:#30d158;}'
  + '.atl-hud-op.warn .atl-hud-mark{background:#ff9f0a;}'
  + '.atl-hud-op.fail .atl-hud-mark,.atl-hud-op.skip .atl-hud-mark{background:#ff453a;}'
  + '@keyframes atl-trace-spin{to{transform:rotate(360deg);}}'
  + '@media (prefers-reduced-motion:reduce){.atl-hud,.atl-hud.on{transition:none;transform:translate(-50%,0);}'
  + '.atl-hud-dot,.atl-hud-op.run .atl-hud-mark,#atlas-panel .atl-caret{animation:none;}}'
  + ATLAS_PLAN_CSS;
/* On a phone the Atlas sheet covers the bottom of the map, so the HUD stands under the top bar. Placed
   inside the panel sheet's phone block by js/atlas-styles.js — the boundary is IntMapDevice.COMPACT. */
export const ATLAS_LIVE_CSS_MOBILE =
  '.atl-hud{bottom:auto;top:calc(64px + var(--safe-top));flex-direction:column;transform:translate(-50%,-8px);}'
  /* (atlas-plan-on-map) measured at 390 px: the round controls stand in two columns at the left and right
     edges (about 76 px each), so the plan takes the band between them rather than sliding under either */
  + '.atl-plan{width:min(300px,calc(100vw - 156px));}';
