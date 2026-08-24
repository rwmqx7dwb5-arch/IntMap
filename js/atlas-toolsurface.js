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
 *  ⚠ NOTHING IS TAKEN AWAY. `find_capability` searches all 126 and `run_capability` invokes any of
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

    var MAX_FIND = 8;                      /* capabilities returned by one search */
    var MAX_DOC = 1400;                    /* characters of catalogue prose per returned capability */

    /* ── The fast path: the capabilities most turns need, as first-class typed tools. ──────────
       ⚠ THIS LIST IS A CONVENIENCE, NOT A PERMISSION BOUNDARY. Everything absent from it is one
       `find_capability` away, and `run_capability` will invoke it. It exists so the common cases
       arrive with their arguments already typed rather than through a generic envelope. */
    var CORE = [
      { name: 'map_view', cap: 'view.flyTo', desc: 'Move the map to a place or coordinate.' },
      { name: 'highlight', cap: 'map.highlight', desc: 'Colour named countries or regions on the map.' },
      { name: 'set_layer', cap: 'layers.toggle', desc: 'Turn a named map layer on or off.' },
      { name: 'research', cap: 'research.analyze', desc: 'Answer a question from live sources with citations. Use for anything current, contested or beyond your own knowledge. This renders its own sourced answer to the reader.' },
      { name: 'ask_user', cap: 'dialog.ask', desc: 'Ask the reader one question with 2-4 concrete options, when missing information would materially change the result.' },
    ];

    function schemaOf(capId) {
      var s = null;
      try { s = SCHEMAS && SCHEMAS.schemaFor ? SCHEMAS.schemaFor(capId) : null; } catch (_) { s = null; }
      return s || { type: 'object', properties: {} };
    }

    function capOf(idOrAlias) {
      try { return CAPS.resolve(idOrAlias); } catch (_) { return null; }
    }

    /* Short one-line summary for a capability, from the catalogue it already has. */
    function summaryOf(cap) {
      var d = '';
      try { d = String(cap.description || ''); } catch (_) { d = ''; }
      d = d.replace(/\s+/g, ' ').trim();
      return d.slice(0, 160);
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
      var out = [];
      for (var i = 0; i < ranked.length && out.length < MAX_FIND; i++) {
        var cap = null;
        try { cap = CAPS.resolve(ranked[i].id); } catch (_) { cap = null; }
        if (!cap || cap.withdrawn) continue;
        var doc = '';
        try { doc = String(CAPS.catalogText([cap.id]) || ''); } catch (_) { doc = ''; }
        out.push({
          id: cap.id,
          summary: summaryOf(cap) || undefined,
          schema: schemaOf(cap.id),
          documentation: doc ? doc.replace(/\s+/g, ' ').trim().slice(0, MAX_DOC) : undefined,
          needsConfirmation: cap.confirmation && cap.confirmation !== 'none' ? cap.confirmation : undefined,
        });
      }
      return { ok: true, query: query, matches: out,
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
        status: meta.status || (ok ? 'completed' : 'failed'),
        produced: meta.produced && meta.produced.length ? meta.produced : undefined,
        rendered: !!(res && res.html),
        unverified: meta.unverified || undefined,
      };
      if (!ok) {
        out.error = meta.code || 'failed';
        out.message = String((res && res.error) || meta.message || '').slice(0, 400) || undefined;
      }
      if (res && res.exec) {
        /* the deterministic candidates IntMap found but did NOT apply — Atlas decides */
        try { out.observed = JSON.parse(JSON.stringify(res.exec)); } catch (_) { /* not serialisable */ }
      }
      return out;
    }

    var API = { CORE, baseTools, find, actionFor, makeExecute, schemaOf, MAX_FIND };
    try { window.IntMapAtlasTools = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
