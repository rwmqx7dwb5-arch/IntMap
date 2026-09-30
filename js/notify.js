/* ============================================================================
 *  IntMap · js/notify.js — ONE toast, ONE live region  (layer-failure-state)
 * ----------------------------------------------------------------------------
 *  MEASURED (2026-09-30, the tree this was written against): six functions told the reader
 *  something in passing — imToast (105 calls), toast (42), satToast (31), aiToast (22), _toast (9)
 *  and majorToast (2) — and they ended in TWO elements, #ai-toast (js/ai-core.js) and #sat-toast
 *  (js/satellite.js), both `.sat-toast`, i.e. the SAME fixed box at the same spot (css/intmap.css).
 *  Two messages a few hundred ms apart were two boxes drawn on top of each other, each on its own
 *  clock (4,600 ms and 4,400 ms), and NEITHER carried role or aria-live, so a screen reader was told
 *  nothing at all — a layer that could not be drawn was silent to exactly the reader who cannot see
 *  that the map is empty.
 *
 *  THE RULE, ONE OF EACH:
 *    · ONE element, #ai-toast (the id is kept: tests/r510.spec.js and tests/r576.spec.js read the
 *      app's toast by it), class `.sat-toast` — the look and the position every toast already had.
 *    · ONE clock, SHOW_MS = 4,600 ms — the longer of the two that existed, so no message is on screen
 *      for less time than it was before. A new message replaces the one showing and restarts it.
 *    · ONE live region with two voices inside it: a role=status / aria-live=polite span for
 *      everything, and a role=alert / aria-live=assertive span for the few messages a caller marks
 *      `urgent` (turn-by-turn navigation failing mid-route — js/navigation.js). The spans exist from
 *      the first frame, because a live region inserted together with its text is not announced.
 *    · ANNOUNCED ONCE. The same text arriving while it is still on screen extends the clock and is
 *      not written again (a rewrite is a second announcement). `log()` records what was announced
 *      and what was folded into the message already showing, so the claim is measurable.
 *  The six functions are kept and delegate here (the brief: 「関数は消さない」). The one exception to
 *  the LOOK is js/playground.js `majorToast`, which keeps the simulator's own «Breaking» card at the
 *  top of the screen (its HUD sits above the toast layer at calc(var(--z-toast) + 3300)) and
 *  hands its text to this region with `visual:false` so it is announced like everything else.
 * ==========================================================================*/

/* SHOW_MS — observation: js/ai-core.js aiToast 4,600 ms and js/satellite.js satToast 4,400 ms, the two
   clocks this replaces; the longer one, so nothing got shorter. Lapses if a caller needs a message to
   stay (that is a panel, not a toast). Canonical here. */
const SHOW_MS = 4600;
/* FADE_MS — css/intmap.css `.sat-toast { transition: opacity 0.3s … }`: the text is cleared only after the
   box has faded, so the fade never shows an empty box. Canonical there; if that transition changes, this follows. */
const FADE_MS = 300;
/* how many announcements `log()` keeps — a diagnostic ring, not a policy */
const LOG_MAX = 60;

/** makeNotify(doc) — the region over `doc` (a Document). Headless (`doc` null) it records only. */
export function makeNotify(doc) {
  let el = null, polite = null, assertive = null;
  let hideT = null, clearT = null, current = '', currentUrgent = false;
  const log = [];
  const record = (e) => { log.push(e); if (log.length > LOG_MAX) log.shift(); };

  /* the region — created once, never replaced (replacing it would lose the reader's place in it) */
  function region() {
    if (el && el.isConnected) return el;
    if (!doc || !doc.body) return null;
    el = doc.getElementById('ai-toast');
    if (!el) { el = doc.createElement('div'); el.id = 'ai-toast'; doc.body.appendChild(el); }
    el.className = 'sat-toast';
    polite = el.querySelector('.im-toast-polite');
    assertive = el.querySelector('.im-toast-assertive');
    if (!polite) {
      el.textContent = '';
      polite = doc.createElement('span'); polite.className = 'im-toast-polite';
      polite.setAttribute('role', 'status'); polite.setAttribute('aria-live', 'polite'); polite.setAttribute('aria-atomic', 'true');
      assertive = doc.createElement('span'); assertive.className = 'im-toast-assertive';
      assertive.setAttribute('role', 'alert'); assertive.setAttribute('aria-live', 'assertive'); assertive.setAttribute('aria-atomic', 'true');
      el.appendChild(polite); el.appendChild(assertive);
    }
    return el;
  }

  function hide() {
    if (hideT) { clearTimeout(hideT); hideT = null; }
    if (!el) return;
    el.classList.remove('show');
    if (clearT) clearTimeout(clearT);
    clearT = setTimeout(() => {
      clearT = null;
      if (el && el.classList.contains('show')) return;
      current = '';
      try { polite.textContent = ''; assertive.textContent = ''; } catch (_) { /* region gone */ }
    }, FADE_MS);
  }

  /** show(msg, { urgent, visual }) — tell the reader `msg`. Returns true when it was announced,
      false when it was already showing (folded) or empty. */
  function show(msg, opts) {
    const text = String(msg == null ? '' : msg).trim();
    if (!text) return false;
    const o = opts || {};
    const urgent = !!o.urgent, visual = o.visual !== false;
    const t = Date.now();
    const r = region();
    if (text === current && urgent === currentUrgent && r && (r.classList.contains('show') || !visual)) {
      record({ t, text, urgent, folded: true });
      if (visual) { if (hideT) clearTimeout(hideT); hideT = setTimeout(hide, SHOW_MS); }
      return false;
    }
    if (clearT) { clearTimeout(clearT); clearT = null; }
    current = text; currentUrgent = urgent;
    record({ t, text, urgent, folded: false });
    if (!r) return true;
    const speak = urgent ? assertive : polite, quiet = urgent ? polite : assertive;
    quiet.textContent = '';
    speak.textContent = text;
    /* `visual:false` — announced, not drawn: the caller draws its own card. The text still leaves the
       region on the same clock, or the next identical message would be folded into nothing. */
    if (visual) r.classList.add('show');
    if (hideT) clearTimeout(hideT);
    hideT = setTimeout(hide, SHOW_MS);
    return true;
  }

  return {
    show, hide,
    /* what was said — { t, text, urgent, folded } — newest last */
    log: () => log.slice(),
    /* the region itself, for a reader that must find it (tests, the accessibility audit) */
    region: () => region(),
  };
}

/* the app's one instance. Created at import — js/layer-state.js imports this, and js/layer-rows.js imports
   that right after js/i18n.js (src/main.js), so the region is in the document long before the first message. */
export const notify = makeNotify(typeof document !== 'undefined' ? document : null);
try {
  if (typeof document !== 'undefined') {
    if (document.body) notify.region();
    else document.addEventListener('DOMContentLoaded', () => notify.region(), { once: true });
  }
  if (typeof window !== 'undefined') window.IntMapNotify = notify;
} catch (_) { /* headless */ }
