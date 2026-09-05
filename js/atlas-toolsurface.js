/* ============================================================================
 *  IntMap · ATLAS — WHAT ATLAS IS HANDED, INSTEAD OF THE WHOLE CATALOGUE  (#R406)
 * ----------------------------------------------------------------------------
 *  「全Capabilityカタログを毎回SYSへ入れる方式を廃止すること。」
 *
 *  WHAT WAS THERE. js/atlas-catalog-text.js holds 41 prose blocks, 64,250 characters, documenting
 *  126 capabilities. `selectCapabilities()` was supposed to send a relevant slice; measured, it
 *  sent 41,178 characters for 「ありがとう」 and the SAME 41,178 for 「東京の天気は？」, because the
 *  score that decides inclusion was a +10 bonus for `produces:'explanation'` — awarded to 23
 *  capabilities whenever the request profile guessed the reader wanted prose, which it guessed for
 *  almost everything. The selection was not reading the sentence. Two of its four output signals,
 *  `comparison` and `navigation`, match no capability at all and never did.
 *
 *  WHAT IS HERE. A handful of typed tools that cover most turns, plus DISCOVERY for the other
 *  hundred-odd. Atlas asks for what it needs and gets that capability's real schema; nothing is
 *  pushed at it on the chance it might be relevant.
 *
 *  ⚠ NOTHING IS TAKEN AWAY. `find_capability` searches the whole registry and `run_capability` invokes any of
 *  them, so the reachable surface is the whole registry — CONSTITUTION.md §0.3. What shrinks is
 *  what is SENT, not what can be DONE.
 *
 *  ⚠ AND EXECUTION GOES DOWN THE PATH IT ALWAYS DID. A tool call becomes the same legacy action
 *  object the dispatch at js/atlas-console.js:1785 has always taken, so every pin, overlay, panel
 *  and rendering behaviour is the one that shipped. This file changes how an action is CHOSEN and
 *  CHECKED, never what an action does.
 * ==========================================================================*/

export function makeAtlasToolSurface(deps) {
  return (function () {
    deps = deps || {};
    var CAPS = deps.capabilities;          /* js/atlas-capabilities.js */
    var SCHEMAS = deps.schemas;            /* js/atlas-schemas.js */
    var runAction = deps.runAction;        /* (action) -> {ok, html, meta, …}  — the existing dispatch */

    /* ⚠⚠⚠ (#R413) THERE WAS A LIMIT HERE AND IT IS GONE. `MAX_FIND = 8` returned the first eight
       matches; `search()` breaks equal scores with `a.id.localeCompare(b.id)`, so the ALPHABET decided
       which capabilities Atlas was allowed to know about. Measured on 「現在地から大阪駅までの経路」:
       ten capabilities score 16 — identically, because the only signal a Japanese request produces is
       the per-CATEGORY hint row, which awards the same points to every member of the category. Sorted
       by id the first eight are navigation.camera, navigation.start, navigation.status,
       navigation.stop, navigation.voice, routing.drone, routing.isochrone, routing.optimizeStops —
       and `routing.route`, the one capability that answers the request, is NINTH. It was dropped, and
       all five navigation.* that arrived instead reply «plan a route first». Atlas asked the reader to
       type their own address because IntMap had just handed it a toolkit that could not draw a route.
       The fix is not a bigger number. `search()` already scores the whole registry and already returns
       only what MATCHED — Atlas gets that, and decides for itself. */
    /* (#R413) …and the per-capability prose is no longer clipped either. A capability whose
       documentation stops mid-sentence at 1,400 characters is a capability Atlas half-knows. */

    /* ── The fast path: the capabilities most turns need, as first-class typed tools. ──────────
       ⚠ THIS LIST IS A CONVENIENCE, NOT A PERMISSION BOUNDARY. Everything absent from it is one
       `find_capability` away, and `run_capability` will invoke it. It exists so the common cases
       arrive with their arguments already typed rather than through a generic envelope. */
    var CORE = [
      { name: 'map_view', cap: 'view.flyTo', desc: 'Move the map to a place or coordinate.' },
      { name: 'highlight', cap: 'map.highlight', desc: 'Colour named countries or regions on the map.' },
      /* ══ ⚠⚠⚠ (#R511) THE MAP AS ONE ACT OF EXPLANATION, IN CORE. Every entry above operates ONE
         thing — a camera, a colour, a layer. Explaining with a map is several at once: the places,
         numbered; what each one is in the answer; the flows between them; the shaded region; one
         frame over all of it; and the legend the words refer to. Offered as six separate calls it
         was six decisions across six steps, and measured on 「Xを地理的に説明して」 the model made
         none of them — it wrote the paragraph on step 0. This is that act as ONE call, so choosing
         the map costs Atlas one decision. It resolves every place through the ledger first and the
         geocoder second, files what it resolved back with its ROLE, and reports by name what it
         could not place. It never takes a coordinate from the model (js/atlas-map-compose.js). */
      { name: 'compose_map', cap: 'map.compose', desc: 'Draw a whole map explanation in ONE call: `items` are the places in the order to number them (name + country, optional kind / role — what this place IS in your answer — / color / fill:true to shade a country or region); `relations` are links between items (from/to = an item name or its number; type "flow" or "route" draws an arrow, "influence"/"border" dashes, "link" a plain line; optional label); `title` heads the legend. IntMap resolves every name itself (ledger first, then geocoder — never write coordinates), numbers the markers, draws the arcs, frames the camera over everything that landed, shows a legend with the same numbers, and links the names in your final_text to the markers. The result lists what was placed and — by name — what could NOT be; say so in your answer rather than describing an unplaced place as shown. Use it whenever the map carries part of your answer; use highlight / map_view for a single colour or a single move.' },
      { name: 'set_layer', cap: 'layers.toggle', desc: 'Turn a named map layer on or off.' },
      { name: 'research', cap: 'research.analyze', desc: 'Answer a question from live sources with citations. Use for anything current, contested or beyond your own knowledge. This renders its own sourced answer to the reader.' },
      /* ⚠ (#R413) THE EXISTING CAPABILITY, PROMOTED — NOT A NEW ONE. `view.locate` has read the
         device's real position since #R155. What was missing is that Atlas could not FIND it:
         measured, `find_capability('my location')` matched NOTHING and answered «IntMap may not have
         this», in every language, because `norm()` did not split `myLocation` into words. That is
         fixed in js/atlas-capabilities.js; this line is the rest of it, because the reader's own
         position is not a feature to go hunting for — it is a fact about the person asking. */
      { name: 'my_location', cap: 'view.locate', desc: 'Get the reader\'s real position from their device. The result carries their coordinates. Call it yourself whenever the request depends on where the reader is — never ask them to type their own location, and never use the map centre in its place. Afterwards "my location" / "現在地" resolves to it in any place argument.' },
      /* ══ ⚠⚠⚠ (#R493) THE EYES, IN CORE — BECAUSE A CAPABILITY YOU HAVE TO GO LOOKING FOR IS ONE
         YOU NEVER USE ON THE TURN IT MATTERS. Every other entry here is a convenience; this one is
         the difference between Atlas knowing the layer list and Atlas seeing the map. The state
         block tells it precipitation is on; nothing told it the east half is solid red. It is a
         READ (it moves nothing, writes nothing, holds no conflict key), so it composes with
         anything and may be called more than once in a turn — including after Atlas moves the
         camera, to see the result of its own action. */
      { name: 'look_at_map', cap: 'view.inspect', desc: 'LOOK at the map — capture what the reader is seeing right now and read it as an image on your next step. include:"screen" (default) is map + legends, scale, markers, bands and the timebar; include:"map" is the renderer frame alone (cheaper). Use it whenever the request points at something visual ("this", "that band", 「これ」「見えてるもの」) or asks about colour, shape, density, arrangement, overlap, a label\'s text, or whether a layer actually painted — and again after you move the camera or toggle a layer, to see what you just did. Do NOT use it to read coordinates, zoom, layer names or dates: those are given to you exactly, and a picture can only approximate them.' },
      /* ⚠ (#R419) `endsTurn` IS A FACT ABOUT THE MACHINE, NOT A RULE ABOUT ATLAS. The loop stops
         when this tool succeeds (js/atlas-agent.js), because the thing it went to get is the
         reader's reply and the reader has not replied yet. Whether to ask at all, when, and what,
         is still entirely Atlas's — CONSTITUTION.md §5. The sentence is in the description because
         a tool whose result is «the turn is over» has to say so where the caller can read it. */
      { name: 'ask_user', cap: 'dialog.ask', endsTurn: true, desc: 'Ask the reader one question with 2-4 concrete options. Only for what ONLY they can supply — a preference, or a choice between real alternatives you have already found. Never for something you could obtain with another tool. This ENDS the turn: the question is what the reader is shown, and their reply opens the next turn — so do not ask about something you are about to do anyway in this same turn.' },
    ];

    /* (#R419) the capabilities whose success ENDS the turn, derived from CORE so the fact is
       declared once, next to the tool it belongs to. Resolved through the registry (and cached), so
       a CORE entry written with an ALIAS still matches the canonical id the executor reports. */
    var _endsTurn = null;
    function ENDS_TURN(capId) {
      if (!_endsTurn) {
        _endsTurn = {};
        CORE.forEach(function (c) {
          if (!c.endsTurn) return;
          _endsTurn[c.cap] = true;
          var cp = capOf(c.cap);
          if (cp && cp.id) _endsTurn[cp.id] = true;
        });
      }
      return !!_endsTurn[capId];
    }

    function schemaOf(capId) {
      var s = null;
      try { s = SCHEMAS && SCHEMAS.schemaFor ? SCHEMAS.schemaFor(capId) : null; } catch (_) { s = null; }
      return s || { type: 'object', properties: {} };
    }

    function capOf(idOrAlias) {
      try { return CAPS.resolve(idOrAlias); } catch (_) { return null; }
    }

    /* Short one-line summary for a capability, from the catalogue it already has.
       (#R413) the 160-character cut is gone with the others: a capability's own one-line summary is
       written to be one line, so the cut only ever fired on the few that are not — and those are
       precisely the ones that needed the words. */
    function summaryOf(cap) {
      var d = '';
      try { d = String(cap.description || ''); } catch (_) { d = ''; }
      return d.replace(/\s+/g, ' ').trim();
    }

    /* ── The tools that are always present ────────────────────────────────────────────────── */
    function baseTools() {
      var t = {};

      CORE.forEach(function (c) {
        var cap = capOf(c.cap);
        if (!cap) return;                                  /* a renamed capability must not crash the turn */
        t[c.name] = {
          name: c.name, capabilityId: cap.id, legacy: cap.legacy,
          description: c.desc,
          parameters: schemaOf(cap.id),
          endsTurn: c.endsTurn || undefined,   /* (#R419) carried through to the loop */
        };
      });

      t.find_capability = {
        name: 'find_capability',
        description: 'Search everything IntMap can do. Returns matching capabilities with their exact argument schemas. '
          + 'Use this when no tool above fits and you want to know whether IntMap can do something.',
        parameters: {
          type: 'object', required: ['query'],
          properties: { query: { type: 'string', minLength: 2 } },
        },
      };

      t.run_capability = {
        name: 'run_capability',
        description: 'Invoke any IntMap capability by id, with the arguments its schema declares. '
          + 'Get the id and the schema from find_capability first.',
        parameters: {
          type: 'object', required: ['id'],
          properties: {
            id: { type: 'string', minLength: 3 },
            args: { type: 'object', properties: {} },
          },
        },
      };

      return t;
    }

    /* ── find_capability: a few, relevant, with their real schemas ─────────────────────────── */
    function find(query) {
      var r = null;
      try { r = CAPS.search(String(query || ''), { want: 3, min: 1 }); } catch (_) { r = null; }
      var ranked = (r && r.ranked) || [];
      if (!ranked.length) {
        return { ok: true, query: query, matches: [],
          note: 'Nothing matched. IntMap may not have this; answer the reader directly, or search the web.' };
      }
      var out = [], ids = [];
      for (var i = 0; i < ranked.length; i++) {
        var cap = null;
        try { cap = CAPS.resolve(ranked[i].id); } catch (_) { cap = null; }
        if (!cap || cap.withdrawn) continue;
        ids.push(cap.id);
        out.push({
          id: cap.id,
          summary: summaryOf(cap) || undefined,
          schema: schemaOf(cap.id),
          needsConfirmation: cap.confirmation && cap.confirmation !== 'none' ? cap.confirmation : undefined,
        });
      }
      /* ⚠ ONE call for ALL the ids, and that is why the cap could go. js/atlas-catalog-text.js
         documents capabilities in 41 shared BLOCKS, so asking per-capability returned the same block
         once per match: the ten matches on 「現在地から大阪駅までの経路」 came to 60,935 bytes of
         which 19,865 were distinct — and clipping each copy at 1,400 characters was the old way of
         paying for that, at the price of every description ending mid-sentence. `catalogText(ids)`
         already de-duplicates. Measured: 67,600 → 20,200 bytes for the same ten capabilities, with
         nothing truncated. The saving is the repetition, not the content. */
      var doc = '';
      try { doc = String(CAPS.catalogText(ids) || '').trim(); } catch (_) { doc = ''; }
      return { ok: true, query: query, matches: out, documentation: doc || undefined,
        note: out.length ? 'Call run_capability with one of these ids and arguments matching its schema.' : undefined };
    }

    /* ── Turning a validated tool call into the legacy action the dispatch already speaks ───── */
    /* ⚠ `type` IS ASSIGNED LAST, AND THAT ORDER IS THE WHOLE POINT. The dispatch switches on
       `action.type`, so building the action as {type: …, …args} lets a `type` inside the model's
       arguments WIN and route the call into a different case than the tool it named — past the
       schema that was just checked, because it was checked against the tool Atlas asked for.
       Writing `type` after the spread makes the tool's own capability the only thing that decides
       which case runs. (An argument genuinely named `type` — map.object's kind of object, say —
       is declared in js/atlas-schemas.js and reaches the case as the dispatch's own value.) */
    function actionFor(name, args, tools) {
      args = args || {};
      if (name === 'run_capability') {
        var cap = capOf(String(args.id || ''));
        if (!cap) return { error: 'unknown_capability', id: args.id };
        var a1 = Object.assign({}, args.args || {});
        a1.type = cap.legacy || cap.id;
        return { action: a1, cap: cap };
      }
      var t = tools && tools[name];
      if (!t || !t.legacy) return { error: 'unknown_tool', name: name };
      var a2 = Object.assign({}, args);
      a2.type = t.legacy;
      return { action: a2, cap: capOf(t.capabilityId) };
    }

    /**
     * makeExecute(tools) -> async (call) -> mechanical result
     *
     * ⚠ THE SECOND SCHEMA CHECK LIVES HERE AND IT HAS TO. `run_capability`'s own schema can only
     * say that `args` is an object — the shape that matters depends on `id`, which is not known
     * until the call arrives. So the surface re-validates `args` against THAT capability's schema
     * and hands a typed rejection back to Atlas. Without this, `run_capability` would be the hole
     * through which the argument-less `analyze` this round removed walks straight back in.
     */
    function makeExecute(tools, agent) {
      return async function execute(call) {
        var name = String((call && call.name) || '');
        var args = (call && call.arguments) || {};

        if (name === 'find_capability') return find(args.query);

        var built = actionFor(name, args, tools);
        if (built.error === 'unknown_capability') {
          return { ok: false, error: 'unknown_capability',
            message: 'There is no capability with id "' + String(args.id || '') + '". Use find_capability to get a real id.' };
        }
        if (built.error) return { ok: false, error: built.error, message: 'No such tool.' };

        if (name === 'run_capability' && built.cap) {
          var errs = [];
          try { agent.validateAgainst(schemaOf(built.cap.id), args.args || {}, built.cap.id, errs); } catch (_) { /* treated as valid */ }
          if (errs.length) {
            return { ok: false, error: 'invalid_arguments',
              message: 'Arguments for "' + built.cap.id + '" do not match its schema: ' + errs.slice(0, 6).join('; '),
              schema: schemaOf(built.cap.id) };
          }
        }

        if (typeof runAction !== 'function') {
          return { ok: false, error: 'no_executor', message: 'IntMap cannot run actions in this context.' };
        }
        var res = null;
        try { res = await runAction(built.action); } catch (e) {
          return { ok: false, error: 'execution_failed', message: (e && e.message) || 'the action threw' };
        }
        return mechanical(res, built);
      };
    }

    /* The tool RESULT Atlas reads. Mechanical only: what IntMap observed, never an interpretation.
       ⚠ `rendered` IS LOAD-BEARING. A research answer draws itself, with its sources, into the
       reader's bubble; Atlas needs to know that so its closing words frame that answer instead of
       writing a second one underneath it. Stating the fact is not the same as ruling on it. */
    function mechanical(res, built) {
      var meta = (res && res.meta) || {};
      var ok = !!(res && res.ok);
      var out = {
        ok: ok,
        capability: built.cap ? built.cap.id : undefined,
        /* (#R419) a tool result that hides what happened leaves Atlas describing a document that is
           not on the screen. ⚠ (#R472) THE FACT REPORTED CHANGED WITH THE THING IT REPORTED: nothing
           cuts an answer down any more, so there is no 'degraded' status and no `removedClaims`.
           `auditFindings` is what IntMap's answer audit NOTICED about an answer that is rendered in
           full — codes, not a verdict. Atlas reads them and decides. */
        status: meta.status || (ok ? 'completed' : 'failed'),
        auditFindings: (ok && meta.auditFindings && meta.auditFindings.length) ? meta.auditFindings : undefined,
        produced: meta.produced && meta.produced.length ? meta.produced : undefined,
        rendered: !!(res && res.html),
        unverified: meta.unverified || undefined,
        /* ⚠ (#R419) ON THE RESULT AS WELL AS ON THE TOOL, because `run_capability` can reach
           `dialog.ask` by id and that call's tool NAME is `run_capability`. Reading the flag off the
           tool alone would have left the one path that names the capability instead of the tool free
           to ask and keep going — the defect this fixes, arriving through the other door. */
        endsTurn: (ok && built.cap && ENDS_TURN(built.cap.id)) ? true : undefined,
      };
      /* ══ (#R511) DID THIS CALL CHANGE THE MAP? A fact the loop reads the way it reads `endsTurn`:
         a capability whose registry row PRODUCES the map, and whose run the observer marked
         completed (a `partial` — nothing painted — is not a change). js/atlas-agent.js holds a
         "map"/"mixed" `answer_mode` to it; nothing here decides whether the map SHOULD change. */
      if (ok && out.status === 'completed' && Array.isArray(out.produced) && out.produced.indexOf('map') >= 0) out.changedMap = true;
      if (!ok) {
        out.error = meta.code || 'failed';
        /* (#R413) …and not clipped at 400 either. This is the reason a call FAILED, read by the
           thing that has to decide what to do next; half a reason is how a turn picks the wrong
           recovery. CONSTITUTION.md §5. */
        out.message = String((res && res.error) || meta.message || '') || undefined;
      }
      if (res && res.exec) {
        /* the deterministic candidates IntMap found but did NOT apply — Atlas decides */
        try { out.observed = JSON.parse(JSON.stringify(res.exec)); } catch (_) { /* not serialisable */ }
      }
      return out;
    }

    var API = { CORE, baseTools, find, actionFor, makeExecute, schemaOf };
    try { window.IntMapAtlasTools = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
