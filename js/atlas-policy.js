/* ============================================================================
 *  IntMap · ATLAS — THE CORE INSTRUCTION, AND ALL OF IT  (#R406)
 * ----------------------------------------------------------------------------
 *  「ランタイム指示は大幅に短くすること。」「過去の個別不具合をすべて文章で列挙し直してはならない。」
 *
 *  WHAT THIS FILE USED TO BE. Three clauses of about 2,600 characters — source precedence, map
 *  restraint, coordinate provenance — sitting inside a system prompt that also carried six more
 *  fixed paragraphs in js/atlas-console.js's SYS() and 64,250 characters of action catalogue. Each
 *  paragraph was a real defect, correctly diagnosed, and written down as a sentence. The trouble
 *  with answering a defect that way is that the sentences accumulate and never leave: MAPPING
 *  MANDATE argued with MAP RESTRAINT, CURRENT-FACT GROUNDING forbade answering from memory while
 *  SOURCE PRECEDENCE permitted it, and HONESTY explained at length that `say` must not claim what
 *  the actions did not do — to a model being asked to write `say` BEFORE anything had run.
 *
 *  ⚠ MOST OF THOSE PARAGRAPHS ARE NOT SHORTENED HERE. THEY ARE GONE, BECAUSE THEIR SUBJECT IS.
 *  「say を実行前に書け」 cannot be got wrong by a loop whose final sentence is written after the
 *  results (js/atlas-agent.js). 「実行していない操作を実行したと言う」 is prevented by the tool
 *  results being the only account of what happened. A rule that survives only as a warning about a
 *  shape that no longer exists is prose, not a guard — CONSTITUTION.md §5.
 *
 *  WHAT REMAINS is five short clauses: what Atlas DECIDES; how to handle a sensitive-but-legitimate
 *  request without over-refusing (#R147 — a product property, not a defect note); that the places in
 *  the prose and the places on the map must agree WHEN THE MAP IS USED (#R149's consistency half —
 *  its 「mapped nothing」 half is deliberately gone); what a coordinate label MEANS, which is a
 *  definition rather than a rule; and how a turn ends. 3,232 characters, inside a persistent
 *  prompt that went from 77,277 to 7,483. About a third of that is the #R147 safety layer, which
 *  is OLDER than this round: the first draft cut it, and tests/r147 #10 caught the cut.
 * ==========================================================================*/

export function makeAtlasPolicy() {
  return (function () {

    /* ── ① THE CORE INSTRUCTION ────────────────────────────────────────────────────────────────
       Every sentence here grants a decision rather than removing one. It says what Atlas is, what
       IntMap is to it, and what it must not claim — and stops.
       ⚠ IF A FUTURE ROUND WANTS TO ADD A SENTENCE HERE, that is the signal the round's real defect
       is somewhere a sentence cannot reach. #R309, #R313, #R337 and #R392 each added one to the
       same paragraph about the same report, and the fourth found the subject had been wrong all
       along. Fix the mechanism; leave this alone. */
    /* ⚠ IT DOES NOT SAY WHO ATLAS IS, AND THAT IS NOT AN OVERSIGHT. The identity — the name, the
       standing, the register — has ONE source, js/atlas-persona.js, and SYS() already opens with
       personaPrompt('the general intelligence and operating layer of IntMap, …'). A second «You are
       Atlas, …» here would be a second normative text about the same subject, which CONSTITUTION.md
       §5 forbids and tests/r285 (3b) fails on by name. This paragraph says what Atlas DECIDES. */
    function core() {
      return 'Infer the user\'s actual goal '
        + 'from their words, conversation, attachments, and current map state. Answer directly when tools are '
        + 'unnecessary. IntMap is your toolkit and context, not your knowledge ceiling or a mandatory path. Use '
        + 'IntMap capabilities when they materially help, and use web search or external sources when IntMap is '
        + 'insufficient, stale, or unsuitable. Change the map only when the user asks or when the map materially '
        + 'carries part of the answer. Ask a clarifying question only when missing information would materially '
        + 'change the result; never silently invent it. You may combine tools for multi-step requests. Treat tool '
        + 'results as the truth about execution and never claim success before confirmation. If a tool fails, '
        + 'choose a genuinely relevant alternative or explain the remaining limitation. Distinguish sourced facts, '
        + 'inference, and scenarios. Do not let available tools redefine the user\'s goal. Respond in the user\'s '
        + 'language unless asked otherwise.\n';
    }

    /* ── ② SENSITIVE BUT LEGITIMATE ─────────────────────────────────────────────────────────────
       ⚠ THIS SURVIVED THE ROUND THAT DELETED THE PARAGRAPHS AROUND IT, AND ON PURPOSE. #R147's
       report was a request blocked wholesale because it contained a sensitive-sounding WORD; the
       answer was to judge on four axes instead of on a keyword. That is not a past defect written
       down — it is what IntMap does with a whole class of request, and PRODUCT.md describes it to
       readers. Deleting it would have been a silent behaviour change, which is the one thing this
       round was not allowed to do. Compressed from ~1,900 characters to this, with nothing dropped
       but the worked example. */
    function sensitiveRequests() {
      return 'SCOPE & SAFETY: never judge by keyword. Weigh four axes — PURPOSE: analysis, defence, preparedness, '
        + 'education or journalism vs genuine operational harm; TARGET: a broad area or public installation vs a '
        + 'precise strike point or a named private individual; PRECISION: approximate and public vs real-time or '
        + 'targeting-grade; OUTPUT: an explanation or a map vs step-by-step instructions to cause harm. Do the safe '
        + 'version by default, and full refusal is the LAST resort: when a request is sensitive but has a '
        + 'legitimate reading, TRANSFORM it and EXECUTE — widen a precise point to a broad public zone, keep only '
        + 'already-reported public information, recast "how to attack" as threat assessment, reach or preparedness, '
        + 'state the uncertainty, and actually run the safe map actions. Apply the same test across every sensitive '
        + 'domain — military and weapons, disasters, disease and epidemics, hazardous chemicals, crime and policing '
        + 'statistics, cyber, and critical infrastructure — never a keyword blocklist. Refuse only the specific '
        + 'harmful slice, and even then name the public-information analysis you CAN give instead of dead-ending.\n';
    }

    /* ── ③ IF YOU DRAW IT, IT MUST BE WHAT YOU SAID ─────────────────────────────────────────────
       ⚠ THIS IS THE CONSISTENCY HALF OF #R149's CLAUSE, AND DELIBERATELY NOT THE OTHER HALF.
       The original also said «do not finish a location-rich answer having mapped nothing», which
       makes the appearance of a place NAME a reason to put a pin on the screen — and 「回答内に地点名が
       出るだけでピン配置を要求する規則」 is on this round's removal list by name. 「フランス革命はなぜ
       起きたのか」 names Paris and wants prose. So the trigger is USING the map, not naming a place:
       whether to map at all is `core()`'s sentence and Atlas's decision. What is kept is the part a
       model cannot get right on its own — that a drawn set which disagrees with the written set is
       worse than either, and that a coordinate must never be invented to close the gap. */
    function mapWhatYouName() {
      return 'WHEN YOU DO PUT THINGS ON THE MAP: what you drew and what you wrote must agree — do not describe '
        + 'one set of places and plot a different one, and say which of them could not be placed. Never invent a '
        + 'coordinate to fill a gap: name the place and let IntMap resolve it, or let it report the spot as not '
        + 'placed. Naming a place in prose is NOT by itself a reason to draw anything.\n';
    }

    /* ── ④ WHAT A COORDINATE'S LABEL MEANS ─────────────────────────────────────────────────────
       ⚠ NOT A RULE — A DEFINITION. js/atlas-geo-object.js stamps every coordinate with its
       provenance, and «resolved_place_centroid» is a real number that is not a place anybody chose.
       A model shown 35.0,135.0 with no label will reason about what is AT that spot, and #R340
       measured the result: a confident answer about the middle of a national park. The model
       cannot infer this from the number, so it is told once, briefly. */
    function coordinateProvenance() {
      return 'COORDINATE LABELS: "user_specified" and "map_click" are points the reader chose. "feed_coordinate" '
        + 'and "event_location" come from a data source. "geocoded_point" is a gazetteer hit for a name. '
        + '"resolved_place_centroid" is a REPRESENTATIVE point for a whole country or region — it is not a '
        + 'location, and nothing is at it; speak about the area instead. Never invent a coordinate: name the '
        + 'place and let IntMap resolve it.\n';
    }

    /* ── ⑤ HOW THE TURN WORKS ──────────────────────────────────────────────────────────────────
       Mechanics of the loop, not semantics of the request: how to end a turn, and what the reader
       has already been shown. Without the second sentence Atlas writes an answer underneath an
       answer the research tool already drew. */
    function turnMechanics() {
      return 'HOW THIS TURN ENDS: reply with no tool calls and your text is the final answer. A tool result '
        + 'marked "rendered" has already been shown to the reader with its sources — frame it in a sentence '
        + 'rather than writing it again. Report a failure only when it blocks something the reader asked for; '
        + 'do not list the tools you tried and abandoned.\n';
    }

    /** all() — the whole persistent instruction, in the order SYS() reads it. */
    function all() { return core() + sensitiveRequests() + mapWhatYouName() + coordinateProvenance() + turnMechanics(); }

    var API = { all, core, sensitiveRequests, mapWhatYouName, coordinateProvenance, turnMechanics };
    try { window.IntMapAtlasPolicy = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
