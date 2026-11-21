/* ============================================================================
 *  IntMap · HANDS-FREE VOICE: ONE SPOKEN COMMAND AFTER ANOTHER   (atlas-multimodal)
 * ----------------------------------------------------------------------------
 *  「音声で地図を連続して操作できるように」
 *
 *  Dictation (the mic button, #R154) fills the box once and stops; the reader reads it and presses
 *  Send. That is right for a long question and wrong for driving a map — 「東京へ」「ズームイン」
 *  「地震を重ねて」 is three commands and three round trips to the keyboard. This is the loop that
 *  keeps listening, and sends each finished utterance as its own message.
 *
 *  WHAT IT DECIDES, AND WHAT IT LEAVES TO ATLAS. It does not interpret anything: no phrase list,
 *  no command words, nothing that maps a sentence to an action. A finished utterance is a message,
 *  exactly as if typed — Atlas decides what it means. The loop owns only the three facts of
 *  listening: that the recogniser ends by itself after silence and must be started again, that a
 *  denied microphone must stop it for good (restarting a refusal is an infinite loop), and that an
 *  utterance spoken while Atlas is still working is HELD and sent when the turn ends rather than
 *  cancelling that turn (a new message supersedes a running one — js/atlas-console.js, #R73 — which
 *  is the right thing for typing and the wrong thing for a second command spoken a moment later).
 *
 *  NO GLOBALS, NO DOM. Everything arrives in `deps`, so tests/atlas-multimodal-checks.test.mjs
 *  drives it with a fake recogniser; the app hands it the real one.
 * ==========================================================================*/

/* Observation 2026-11-20 (Chromium, webkitSpeechRecognition): a session ends on its own after a few seconds of
   silence (`end` with no error) and after ~60 s of continuous use; both are normal, so `end` while the loop is on means
   "start again". EXPIRES WHEN: the engine's behaviour changes — the restart is only ever skipped for the reasons below. */
export const VOICE = { restartMs: 250, giveUpAfter: 5, giveUpWindowMs: 10000, fatal: ['not-allowed', 'service-not-allowed', 'language-not-supported'] };

/**
 * makeVoiceLoop(deps) -> {start, stop, isOn, idle, held}
 * deps: { SR, locale():str, send(text), busy():bool, onState(state, why?), onInterim?(text), now?():ms, timer?(fn, ms) }
 * state: 'listening' | 'off' ; why (when off): '' (asked to stop) | the fatal error code | 'unstable'
 */
export function makeVoiceLoop(deps) {
  const now = deps.now || Date.now, timer = deps.timer || function (f, ms) { return setTimeout(f, ms); };
  let rec = null, on = false, held = [], starts = [];

  function emit(state, why) { try { deps.onState && deps.onState(state, why || ''); } catch (_) { /* a broken indicator must not stop listening */ } }
  function flush() {
    if (!held.length || deps.busy()) return;
    const text = held.join(' ').trim(); held = [];
    if (text) { try { deps.send(text); } catch (_) { /* the host refused; nothing else to do with it */ } }
  }
  function finish(why) { on = false; rec = null; held = []; emit('off', why); }

  function begin() {
    if (!on) return;
    /* too many starts in a short window = the engine keeps ending at once (no network, no mic): stop and say so,
       rather than spin and flicker the indicator forever */
    const t = now(); starts = starts.filter(function (x) { return t - x < VOICE.giveUpWindowMs; });
    if (starts.length >= VOICE.giveUpAfter) { finish('unstable'); return; }
    starts.push(t);
    let r;
    try { r = new deps.SR(); } catch (_) { finish('unavailable'); return; }
    r.lang = (deps.locale && deps.locale()) || 'en-US';
    r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = function (ev) {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i], txt = String((res[0] && res[0].transcript) || '');
        if (res.isFinal) { const u = txt.trim(); if (u) { held.push(u); flush(); } } else interim += txt;
      }
      try { deps.onInterim && deps.onInterim(interim); } catch (_) { /* cosmetic */ }
    };
    r.onerror = function (ev) {
      const e = String((ev && ev.error) || '');
      if (VOICE.fatal.indexOf(e) >= 0) finish(e);       /* a refusal is not retried */
      /* 'no-speech' / 'aborted' / 'network' etc: `end` follows and restarts, bounded by the window above */
    };
    r.onend = function () {
      if (rec !== r) return;
      if (!on) { rec = null; return; }
      timer(begin, VOICE.restartMs);
    };
    rec = r;
    try { r.start(); } catch (_) { finish('unavailable'); return; }
    emit('listening');
  }

  return {
    start: function () { if (on) return; on = true; starts = []; held = []; begin(); },
    stop: function () { if (!on) return; const r = rec; on = false; held = []; emit('off', ''); try { r && r.stop(); } catch (_) { /* already ended */ } rec = null; },
    isOn: function () { return on; },
    /** the host calls this when a turn ends: whatever was said meanwhile goes now */
    idle: function () { flush(); },
    held: function () { return held.length; },
  };
}

/**
 * mountVoiceLoop(btn, deps) -> the loop. Binds a button as the on/off switch and shows the state on it (pressed + the same
 * pulsing red the dictation mic uses). deps: makeVoiceLoop's, plus `say(why)` — told why it turned itself off (so a refused
 * microphone is explained, not silent). Returns null, and hides the button, when the browser has no recogniser.
 */
export function mountVoiceLoop(btn, deps) {
  if (!btn) return null;
  if (!deps.SR) { btn.style.display = 'none'; return null; }
  const loop = makeVoiceLoop({
    SR: deps.SR, locale: deps.locale, send: deps.send, busy: deps.busy, onInterim: deps.onInterim, now: deps.now, timer: deps.timer,
    onState: function (state, why) {
      const live = state === 'listening';
      btn.classList.toggle('rec', live); btn.setAttribute('aria-pressed', live ? 'true' : 'false');
      if (!live && why && deps.say) deps.say(why);
    },
  });
  btn.onclick = function () { if (loop.isOn()) loop.stop(); else loop.start(); };
  return loop;
}
