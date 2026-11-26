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
 */
export function makeAtlasSwitch(deps) {
  const dispatch = deps.dispatch, CAPS = deps.CAPS, L = deps.L;
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

  function press(el) {
    const idx = el.classList.contains('atl-ctl-step') ? +el.value : +el.getAttribute('data-i');
    const calls = callsOf(el);
    mark(el, idx);
    if (!calls || !calls.length) { say(el, L('This option has nothing to run.', 'このオプションには実行する内容がありません。')); return Promise.resolve(); }
    for (let i = 0; i < calls.length; i++) { const why = switchCallProblem(calls[i], CAPS, L); if (why) { say(el, why); return Promise.resolve(); } }
    say(el, '');
    el.classList.add('busy');
    chain = chain.then(async () => {
      let failed = '';
      for (let i = 0; i < calls.length && !failed; i++) {
        try {
          const r = await dispatch(Object.assign({}, calls[i]));
          if (r && r.ok === false) failed = (r.meta && r.meta.code) || L('a step did not run', '実行できなかった操作があります');
        } catch (e) { failed = (e && e.message) || L('a step did not run', '実行できなかった操作があります'); }
      }
      el.classList.remove('busy');
      if (failed) say(el, failed);
    });
    return chain;
  }
  return { press };
}
