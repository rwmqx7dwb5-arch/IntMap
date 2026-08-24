/* ============================================================================
 *  IntMap · ATLAS — WHAT A TURN LEAVES BEHIND WHEN IT ENDS EARLY  (#R419)
 * ----------------------------------------------------------------------------
 *  「Atlasに経路を聞いたときの挙動がバグっている。その他、おかしいところが多すぎる。」
 *
 *  THE REPORT WAS A WHOLE CONVERSATION, and every line of it is one of the two subjects here:
 *
 *      利用者: ここから大阪駅まで行きたい。
 *      ■ 停止しました
 *      利用者: 公共交通機関
 *      ■ 停止しました
 *      利用者: 電車・公共交通機関
 *      ■ 停止しました
 *      利用者: 電車・公共交通機関
 *      Atlas: 現在地から大阪まで、電車・公共交通機関の経路を検索します。
 *             「公共交通機関でどこへ行きますか？」 [名古屋駅][中部国際空港][栄駅]
 *             「電車・公共交通機関について、どれを表示しますか？」 [現在地周辺の駅・路線][…]
 *             5 件の候補 — タップで地図に表示
 *
 *  The destination is in the first sentence. The reader answered three times and was asked again
 *  each time, and the questions they answered are not on the page — 「停止しました」 is where each
 *  one used to be. Two mechanisms produced that, and they are the two functions below.
 *
 *  ══ ① A STOPPED TURN WAS ERASING WHAT IT HAD ALREADY DRAWN ═══════════════════════════════════
 *  Every cancel path in js/atlas-console.js read `bubble.innerHTML = _cancelledNote()`. When a turn
 *  is superseded — and answering a question SUPERSEDES the turn that asked it, because the answer
 *  is a new message — the bubble is replaced by the single word 「停止しました」. The turn had
 *  already rendered the question; the reader had already answered it; and the replacement threw the
 *  question away, leaving three answers in the transcript standing under nothing.
 *  What is genuinely unfinished when a turn stops is the STAGE INDICATOR, the thinking dots. That
 *  is the part `markCancelled` replaces. Anything the turn actually put on the page stays, and a
 *  bubble that never got past the dots is still replaced whole — which is the only case #R142 wrote
 *  the original line for, and the only case where the two behaviours were ever the same.
 *
 *  ══ ② THE QUESTION WAS NOT IN THE RECORD, SO THE NEXT TURN COULD NOT SEE IT ═══════════════════
 *  js/atlas-console.js's `recordTurn` files one line per turn in `_hist`, and `_hist` is the whole
 *  of what the next turn is told about this one. The line is built from `actLabel`, which read
 *  `a.name || a.place || a.country || … || a.target` — eleven fields, and `question` is not one of
 *  them. A turn that asked 「公共交通機関でどこへ行きますか？」 was recorded as `ask ""`.
 *  From the next turn's point of view, Atlas had never asked anything, and the reader's
 *  「電車・公共交通機関」 was an opening remark. So it asked. Three times.
 *  `askRecords` writes the question as its OWN history line rather than as an entry in a `did:`
 *  list that is cut at 260 characters — a question that can be truncated out of the record is the
 *  same defect with a longer fuse — and it carries THE OPTIONS, because a chip label with no
 *  question attached is not a sentence anybody can answer.
 *
 *  ⚠ NEITHER OF THESE DECIDES ANYTHING FOR ATLAS (CONSTITUTION.md §5). Whether to ask, what to ask
 *  and what to do next are Atlas's; what changed is that the page and the record now say what
 *  happened. The third mechanism of the same report — that a question did not END the turn — is in
 *  js/atlas-agent.js, where the loop is.
 *
 *  ⚠ IT IS ITS OWN FILE BECAUSE js/atlas-console.js HAS A SHRINK-ONLY LINE CEILING
 *  (tests/r318-checks.test.mjs ⑨b, 4,910 — it shipped at 4,909). #R199's rule: the kernel shrinks
 *  by MOVING, and a new subject goes to a new file. This is a new subject.
 *
 *  ⚠ NO NETWORK, NO GLOBALS, AND THE DOM ONLY THROUGH WHAT IS PASSED IN — so
 *  tests/r419-checks.test.mjs drives THIS module, the one the browser runs, with no browser.
 * ==========================================================================*/

export function makeAtlasTurnContinuity() {
  return (function () {

    /* The dispatch types that put a question to the reader — `ask` and its three aliases, exactly as
       js/atlas-capabilities.js declares them for `dialog.ask`. */
    const ASK_TYPES = /^(ask|choose|clarify|options)$/;

    function isAsk(a) { return !!a && ASK_TYPES.test(String((a && a.type) || '')); }

    /* An `ask` may spell its question four ways (the dispatch case accepts all four), and its
       options may be plain strings or {label} objects. Read them the way the case reads them. */
    function questionOf(a) {
      if (!a) return '';
      return String(a.question || a.text || a.say || a.prompt || '').trim();
    }
    function optionsOf(a) {
      if (!a || !Array.isArray(a.options)) return [];
      return a.options.map((o) => String((o && o.label) || o || '').trim()).filter(Boolean);
    }

    /**
     * actionLabel(a) — the short human label for one step, used in the conversation record.
     *
     * ⚠ THE 26-CHARACTER CUT DOES NOT APPLY TO A QUESTION. Every other field here is a NAME — a
     * place, a country, a metric — and 26 characters is a name. A question is a sentence, and half
     * a sentence in the record is a question the next turn still cannot recognise an answer to.
     */
    function actionLabel(a) {
      if (!a || !a.type) return '';
      const ask = isAsk(a);
      const x = (ask ? questionOf(a) : '')
        || a.name || a.place || a.country || a.metric || a.query || a.topic
        || a.mode || a.lang || a.unit || a.from || a.target || '';
      return a.type + (x ? (' "' + String(x).slice(0, ask ? 200 : 26) + '"') : '');
    }

    /**
     * askRecords(acts) -> [string]
     *
     * One conversation line per question this turn put to the reader, each naming the options it
     * offered and saying plainly what the reader's next message IS. Actions that asked nothing
     * produce nothing.
     */
    function askRecords(acts) {
      const out = [];
      (Array.isArray(acts) ? acts : []).forEach((a) => {
        if (!isAsk(a)) return;
        const q = questionOf(a);
        if (!q) return;
        const op = optionsOf(a);
        out.push('Atlas asked the reader: "' + q + '"'
          + (op.length ? (' [options offered: ' + op.join(' | ') + ']') : '')
          + ' — the reader\'s NEXT message is the answer to this.');
      });
      return out;
    }

    /**
     * markCancelled(el, noteHtml) — say that this turn stopped, WITHOUT erasing what it did.
     *
     * `el` is the reply bubble; `noteHtml` is the caller's own neutral 「停止しました」 fragment, so
     * this module carries no translation table of its own (js/atlas-console.js owns that one, and
     * #R142 needs the Stop button and the supersede path to paint the identical thing).
     */
    function markCancelled(el, noteHtml) {
      const note = String(noteHtml || '');
      try {
        if (!el) return;
        /* the thinking dots ARE the unfinished part — replace exactly them */
        const stage = el.querySelector ? el.querySelector('.atl-stage') : null;
        if (stage && stage.parentNode) {
          const box = (typeof document !== 'undefined' && document.createElement)
            ? document.createElement('div') : { className: '', innerHTML: '' };
          box.className = 'atl-cancelled';
          box.innerHTML = note;
          stage.parentNode.replaceChild(box, stage);
          return;
        }
        /* several cancel paths can run over the same bubble — say it once */
        if (el.querySelector && el.querySelector('.atl-cancelled')) return;
        if (!String(el.innerHTML || '').trim()) { el.innerHTML = note; return; }
        el.insertAdjacentHTML('beforeend', '<div class="atl-cancelled" style="margin-top:5px;">' + note + '</div>');
      } catch (_) {
        try { el.innerHTML = note; } catch (__) { /* the bubble is gone; nothing to say it on */ }
      }
    }

    const API = { ASK_TYPES, isAsk, questionOf, optionsOf, actionLabel, askRecords, markCancelled };
    try { window.IntMapAtlasTurnContinuity = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
