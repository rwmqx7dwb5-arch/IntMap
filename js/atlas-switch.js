/* ============================================================================
 *  IntMap · THE PRESS OF A SWITCH THE ANSWER INVENTED          (js/atlas-switch.js)
 * ----------------------------------------------------------------------------
 *  (atlas-ui-parts) A `tabs` / `steps` control (js/atlas-cap-ui.js controlRows) binds each option to capability calls.
 *  This is the reader's half: pressing an option runs ITS calls through the Atlas dispatch, one after another, with no
 *  model round-trip and no chat bubble — it is the map answering a hand, not a new turn.
 *
 *  ⚠ THE MARKUP IS NOT TRUSTED. The calls ride in a data attribute of the reply, which may be restored from a saved
 *  conversation, so every call is checked AGAIN here with the same function that checked it when it was drawn
 *  (js/atlas-ui-spec.js switchCallProblem): a registered capability, reversible within the session, no confirmation, plain
 *  data. A call that fails the check is not run, and the control says so beside itself.
 *
 *  ⚠ IT DECIDES NOTHING. Which states exist and what each one does is the answer's (Atlas's) — this file has no word of any
 *  subject. One export (tests/layer-boot-graph-checks.test.mjs #R175 ③).
 * ==========================================================================*/
import { switchCallProblem } from './atlas-ui-spec.js';

/**
 * makeAtlasSwitch({ dispatch, CAPS, L }) -> { press(el) }
 *   el: the pressed `.atl-ctl-tab` button or `.atl-ctl-step` range input. Resolves once the option's calls have run.
 *   deps.execute(call) -> the kernel's result ({status, code}) — when given, a press runs each call through it, so whether the option took effect is what the
 *   capability's own observer saw after the press (the same verdict an Atlas turn gets), not what the case returned. deps.dispatch is the fallback.
 */
/* the kernel statuses that say the call did not do what it was asked (js/atlas-results.js). 'unobserved' and 'partial' are not here: an
   unobserved call ran and could not be looked at, which is not a failure (.agents/rules/one-pass-or-a-reason.md §5). */
const NOT_DONE = new Set(['failed', 'cancelled', 'superseded', 'needs_input', 'running', 'refused']);
export function makeAtlasSwitch(deps) {
  const dispatch = deps.dispatch, execute = deps.execute, CAPS = deps.CAPS, L = deps.L;
  let chain = Promise.resolve();   /* presses run in the order they were made: a fast second press must not interleave with the first one's calls */

  function callsOf(el) {
    let raw = '';
    if (el.classList.contains('atl-ctl-step')) raw = el.getAttribute('data-c' + (+el.value)) || '';
    else raw = el.getAttribute('data-calls') || '';
    try { const v = JSON.parse(decodeURIComponent(raw)); return Array.isArray(v) ? v : null; } catch (_) { return null; }
  }
  function mark(el, idx) {
    const root = el.closest('.atl-ctl-row'); if (!root) return;
    root.querySelectorAll('.atl-ctl-tab').forEach((b) => { const on = (+b.getAttribute('data-i') === idx); b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    root.querySelectorAll('.atl-ctl-stops span').forEach((s, j) => s.classList.toggle('on', j === idx));
  }
  function say(el, text) {
    const root = el.closest('.atl-ctl-row'); if (!root) return;
    let n = root.querySelector('.atl-ctl-why');
    if (!text) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('div'); n.className = 'atl-ctl-why'; root.appendChild(n); }
    n.textContent = text;
  }

  /* ⚠ A SELECTION IS A CLAIM ABOUT THE MAP, SO IT IS MADE ONLY AFTER THE MAP HAS CHANGED. It used to be marked first, then the calls ran: with the time
     change succeeding and the layer change failing the row read 「歴史」 while the map showed 500 CE on today's layers (measured). Now the row keeps what the map
     last confirmed (`data-confirmed`); the pressed option is marked when ALL its calls ran; if one did not, the calls of the confirmed option are run
     again to bring the map back (every call here is reversible within the session — switchCallProblem), and the row says so. If even that fails the row
     marks NOTHING and says the map is in an unknown state, so the reader never trusts a tab that is not what they see. */
  function confirmedOf(el) {
    const root = el.closest('.atl-ctl-row'); if (!root) return null;
    const v = root.getAttribute('data-confirmed');
    if (v === '') return null;                                  /* explicitly unknown after a failed rollback */
    if (v != null) return +v;
    const on = root.querySelector('.atl-ctl-tab.on'); return on ? +on.getAttribute('data-i') : null;   /* first press: the option drawn as selected is what the map was built for */
  }
  function setConfirmed(el, idx) { const root = el.closest('.atl-ctl-row'); if (root) root.setAttribute('data-confirmed', idx == null ? '' : String(idx)); }
  function unmark(el) {
    const root = el.closest('.atl-ctl-row'); if (!root) return;
    root.querySelectorAll('.atl-ctl-tab').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
    root.querySelectorAll('.atl-ctl-stops span').forEach((x) => x.classList.remove('on'));
  }
  function optionEl(el, idx) {
    const root = el.closest('.atl-ctl-row'); if (!root) return null;
    return root.querySelector('.atl-ctl-tab[data-i="' + idx + '"]');
  }
  function callsOfIndex(el, idx) {
    const root = el.closest('.atl-ctl-row'); if (!root) return null;
    const tab = optionEl(el, idx);
    if (tab) return callsOf(tab);
    const step = root.querySelector('.atl-ctl-step'); if (step) return callsOf({ classList: { contains: () => true }, getAttribute: (k) => step.getAttribute(k.replace(/^data-cd+$/, 'data-c' + idx)), value: idx });
    return null;
  }
  async function runAll(calls) {
    let failed = '';
    for (let i = 0; i < calls.length && !failed; i++) {
      try {
        if (execute) {
          const r = await execute(Object.assign({}, calls[i]));
          if (!r || NOT_DONE.has(String(r.status || ''))) failed = (r && r.code) || L('a step did not run', '実行できなかった操作があります');
        } else {
          const r = await dispatch(Object.assign({}, calls[i]));
          if (r && r.ok === false) failed = (r.meta && r.meta.code) || L('a step did not run', '実行できなかった操作があります');
        }
      } catch (e) { failed = (e && e.message) || L('a step did not run', '実行できなかった操作があります'); }
    }
    return failed;
  }

  /* ⚠ (atlas-controls-receipts) THE STATE TO GO BACK TO IS READ WHEN THIS PRESS'S TURN COMES, NOT WHEN IT WAS QUEUED. Presses run one after another
     (`chain`), so a second press made while the first was still running used to read 「confirmed」 before the first had confirmed anything: with
     0 → 1 → 2 pressed quickly and 2 failing, the rollback went to 0 while `data-confirmed` said 1 (measured: row 0, map 0, record 1). The previous
     press's outcome is only known inside the chain, so that is where it is read; and a successful rollback re-confirms the state it put back, so the
     row, the record and the map are the same value. */
  function press(el) {
    const idx = el.classList.contains('atl-ctl-step') ? +el.value : +el.getAttribute('data-i');
    const calls = callsOf(el);
    const shown = confirmedOf(el);
    if (!calls || !calls.length) { say(el, L('This option has nothing to run.', 'このオプションには実行する内容がありません。')); if (shown != null) mark(el, shown); return Promise.resolve(); }
    for (let i = 0; i < calls.length; i++) { const why = switchCallProblem(calls[i], CAPS, L); if (why) { say(el, why); if (shown != null) mark(el, shown); return Promise.resolve(); } }
    say(el, '');
    el.classList.add('busy');
    chain = chain.then(async () => {
      const before = confirmedOf(el);   /* the last state the map CONFIRMED, after every earlier press has settled */
      const failed = await runAll(calls);
      el.classList.remove('busy');
      if (!failed) { setConfirmed(el, idx); mark(el, idx); return; }
      /* part of this option may have run: put the map back to the last confirmed option before saying anything is selected */
      const back = before != null ? callsOfIndex(el, before) : null;
      if (back && back.length && before !== idx) {
        const again = await runAll(back);
        if (!again) { setConfirmed(el, before); mark(el, before); say(el, L('Could not switch (' + failed + '); the map is back on the previous option.', '切り替えに失敗しました（' + failed + '）。地図は前の選択に戻しました。')); return; }
      }
      setConfirmed(el, null); unmark(el);
      say(el, L('Could not switch (' + failed + '); the map may be showing a mix of two options — pick one again.', '切り替えに失敗しました（' + failed + '）。地図が 2 つの選択の途中の状態かもしれません。もう一度選んでください。'));
    });
    return chain;
  }
  return { press };
}
