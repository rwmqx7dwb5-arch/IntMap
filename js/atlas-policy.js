/* ============================================================================
 *  IntMap · ATLAS — WHAT ATLAS MAY RELY ON, AND WHEN IT MAY TOUCH THE MAP  (#R397)
 * ----------------------------------------------------------------------------
 *  「AtlasがIntMapを使うのであり、AtlasがIntMapに従属するのではありません。」
 *
 *  Three clauses, and each one replaces a sentence that was quietly making Atlas smaller than the
 *  model behind it:
 *
 *  ① SOURCE PRECEDENCE. Nothing in the old prompt said Atlas could set IntMap's own data aside. The
 *     analysis prompt said «EVERY event, figure, name and date must be traceable to the DATA blocks»
 *     — correct as an anti-fabrication rule, read as a ceiling — and no clause anywhere gave the
 *     order of precedence when a loaded block was stale, thin, one-sided or simply not about the
 *     question. So the honest reading was: use what IntMap loaded. This states the order the user
 *     asked for, with IntMap's own data LAST of the four.
 *
 *  ② MAP RESTRAINT. The old clause opened «MAPPING MANDATE (IntMap is a MAP product — a research
 *     answer must produce map value only IntMap can give, not a generic chatbot reply)». That is a
 *     reason to operate the map derived from the PRODUCT rather than from the REQUEST, and it is the
 *     sentence behind an unasked-for camera move on a question about the French Revolution. The
 *     mandate to map is kept for requests that are ABOUT places; what is removed is the obligation
 *     to find something to draw for a request that is not.
 *     ⚠ THE PROMPT IS THE SECOND LINE OF DEFENCE HERE, NOT THE FIRST. `_validatePlan` in
 *     js/atlas-planner.js strips an unrequested view/selection action deterministically, because
 *     「プロンプト上の注意ではなく validator/executor レベルで」 is the requirement. This clause
 *     exists so the model does not propose one in the first place.
 *
 *  ③ COORDINATE PROVENANCE. A representative point for a country or a region is a real number that
 *     is not a place anyone chose, and presenting it to the model as the point the reader specified
 *     produces a confident answer about a spot in the middle of a national park. js/atlas-geo-object.js
 *     carries the provenance; this is the clause that tells the model what the label means.
 *
 *  ⚠ WHY ITS OWN FILE. js/atlas-console.js has a SHRINK-ONLY line ceiling (tests/r199 ⑤, asserted
 *  again by tests/r318 ⑨b and tests/r350 ⑨e) because it is the app shell's largest reader. Prompt
 *  prose is exactly what #R313 moved out to js/atlas-styles.js and #R318 moved out to
 *  js/atlas-catalog-text.js. It does not go in js/atlas-persona.js either: the persona is WHO Atlas
 *  is on every surface and CONSTITUTION.md §5 keeps that file to one copy of one subject — these are
 *  the rules of the planning TASK, which is the same line js/atlas-answer-contract.js draws.
 *
 *  Pure strings over one argument. No DOM, no globals.
 * ==========================================================================*/

export function makeAtlasPolicy() {
  return (function () {

    /* ① The order of precedence the user specified, verbatim in intent: purpose, then accuracy,
       then Atlas's own choice of source, then IntMap's internals. */
    function sourcePrecedence() {
      return 'WHICH SOURCE WINS. Rank what you rely on in this order and nothing else: (1) the user\'s purpose; '
        + '(2) accuracy, currency and usefulness; (3) the source or method YOU judge best for this question; '
        + '(4) IntMap\'s own loaded data, prompts and catalogues. IntMap\'s internal data is a resource, NOT an '
        + 'obligation and NOT a ceiling. When it is thin, stale, low-quality, one-sided, irrelevant to what was '
        + 'asked, or contradicted by something better, LEAVE IT OUT of your reasoning and say what you used '
        + 'instead — reach for a live search, an external dataset, a different method, or your own general '
        + 'knowledge. You may answer entirely without IntMap data when that is the better answer. Where internal '
        + 'and external information CONFLICT, do not defend the internal one: compare their dates and their '
        + 'reliability, take the more defensible, and state that the two disagree and which you followed. The one '
        + 'thing you may never do is present unverified material as verified.\n';
    }

    /* ② Map when the map answers something; do not operate it to justify being a map product. */
    function mapRestraint() {
      return 'WHAT THE USER ASKED FOR OUTRANKS WHAT INTMAP CAN DRAW. IntMap has a map, and that is a reason to USE '
        + 'the map when the map answers something — it is NOT a reason to operate the map on a request that did not '
        + 'ask for it. Judge the request on its own terms: (a) if it asks you to move, show, highlight, compare, '
        + 'route or otherwise operate IntMap, do that; (b) if the map genuinely carries part of the answer (where '
        + 'something is, how far, how it is distributed, what is nearby, how two places differ), use it and say '
        + 'what it shows; (c) if it is an ordinary question — an explanation, a definition, a calculation, a piece '
        + 'of history, code, a translation, advice, or anything whose answer is prose — ANSWER IT AS A CAPABLE '
        + 'GENERAL ASSISTANT and add NO map action at all. Do not fly somewhere, select a country, open a card or '
        + 'draw anything to justify being a map product: an unrequested camera move is a defect, not a bonus, '
        + 'because it throws away the view the reader had set. You are not confined to geography, and a question '
        + 'outside it is not out of scope.\n';
    }

    /* ③ What a coordinate's label means, so a centroid is never read as a chosen point. */
    function coordinateProvenance() {
      return 'COORDINATE PROVENANCE. Any coordinate IntMap shows you is labelled with where it came from. '
        + '"user_specified" and "map_click" are points the reader chose and are the ONLY ones you may describe as '
        + 'the point they specified. "feed_coordinate" and "event_location" are positions a data source published '
        + 'for that object. "geocoded_point" is a gazetteer hit for a name. "resolved_place_centroid" is a '
        + 'REPRESENTATIVE point standing in for a whole country or region — it is NOT a location, it is not where '
        + 'anything happened, and you must never present it as a specific spot or reason about what is at it; '
        + 'speak about the area instead. Never invent a coordinate: name the place and let IntMap resolve it.\n';
    }

    /** all() — the three clauses in the order SYS() reads them. */
    function all() { return sourcePrecedence() + mapRestraint() + coordinateProvenance(); }

    /**
     * unmetGoalText(goalValidation, profile, outcomes) — '' when the turn may end, otherwise the
     * reason it may not, in the words the repair pass is aimed at.
     *
     * ⚠ THIS IS THE READER `_goalValidation` NEVER HAD. It is passed IN rather than imported: the
     * goal rules belong to js/atlas-planner.js and this file must not become a second copy of them
     * (#R267 — 「同じ指示が3回来たら『似せた』のであって『1つにした』のではない」). All this adds is
     * the decision, which is the part that was missing.
     *
     * ⚠ AND IT MUST NOT FIRE ON A TURN THAT WENT FINE. An empty outcome list means nothing ran, and
     * nothing running is not an unmet goal — it is a turn with no actions, which the caller already
     * handles. Only a turn that DID something and still did not satisfy the request repairs.
     */
    function unmetGoalText(goalValidation, profile, outcomes) {
      try {
        if (typeof goalValidation !== 'function') return '';
        var list = Array.isArray(outcomes) ? outcomes : [];
        if (!list.length) return '';
        var gv = goalValidation(profile, list);
        if (!gv || gv.userGoalSatisfied) return '';
        var wantExpl = !!(profile && profile.outputs && profile.outputs.explanation);
        var miss = [];
        if (!gv.actionSucceeded) miss.push('no action completed');
        if (!gv.explanationProduced && wantExpl) miss.push('the request asked for an explanation and none was produced');
        if (!gv.temporalMatch) miss.push('the answer is not anchored to the period the request asked about ('
          + String((profile && profile.temporalMode) || '') + ')');
        return miss.join('; ');
      } catch (_) { return ''; }
    }

    var API = { all, coordinateProvenance, mapRestraint, sourcePrecedence, unmetGoalText };
    try { window.IntMapAtlasPolicy = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
