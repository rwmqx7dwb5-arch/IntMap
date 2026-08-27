/* ============================================================================
 *  IntMap · ATLAS — THE PLACES A TURN RESOLVED, AS DATA  (#R489)
 * ----------------------------------------------------------------------------
 *  「回答時点で各場所を型付きデータとして保存し、そのまま再利用すること。」
 *
 *  ══ THE MEASUREMENT ══════════════════════════════════════════════════════════════════════════
 *  A turn answered a question about drone interceptions and named fourteen Russian oblasts in its
 *  prose. The reader said 「マッピングして」. What crossed the turn boundary was NOTHING: the only
 *  record one turn leaves for the next is js/atlas-turn-continuity.js's `actionLabel`, which is the
 *  action type plus TWENTY-SIX CHARACTERS of one argument. So the next turn re-extracted the same
 *  fourteen names OUT OF ITS OWN PROSE, as Japanese strings with no country and no kind, and went
 *  round this loop for each of them:
 *
 *      「ベルゴロド州」 → highlight → no boundary → translate to English → retry → fly to Russia
 *          → look the oblast up on the web → retry → 「実在しない」
 *
 *  Every step of that had already been done. The turn that WROTE the prose knew the country was
 *  Russia, knew each name was a first-level administrative unit, and in most cases already had a
 *  coordinate for it. It knew, and then it threw the knowledge away and printed a sentence instead.
 *
 *  ⚠ THE STRING IS THE DEFECT, not the geocoder. A place that has been resolved once is a FACT
 *  about this conversation — kind, country, canonical name, a stable identifier, where it is, and
 *  what role it played in the answer. This file is where that fact lives, and it lives for the
 *  whole conversation rather than for one action.
 *
 *  ══ WHAT IT DOES NOT DO ══════════════════════════════════════════════════════════════════════
 *  ⚠ IT DECIDES NOTHING FOR ATLAS (CONSTITUTION.md §5). It does not choose what to map, refuse a
 *  name, cap anything, or geocode. It REMEMBERS what was already resolved and hands it back — so
 *  Atlas spends its authority on the question instead of on the same fourteen lookups twice.
 *
 *  ⚠ NO DOM, NO NETWORK, NO GLOBALS — the `window` publish is in a try/catch — so
 *  tests/r489-checks.test.mjs drives THIS module, the one the browser runs, with no browser. That
 *  is the js/atlas-turn-continuity.js and js/atlas-turn-results.js pattern, and it is also why the
 *  subject is its own file: js/atlas-console.js has a shrink-only line ceiling (tests/r318 ⓑ).
 * ==========================================================================*/

export function makeAtlasGeoLedger(deps) {
  return (function () {
    deps = deps || {};

    /* The vocabulary js/atlas-geo-resolve.js ALREADY asks the model for in its verification prompt
       ("country|admin1|admin2|city|water|region|river|basin|mountain|island|unknown"), plus `point`
       for a bare coordinate. ⚠ IT IS A VOCABULARY, NOT A GATE: a kind outside it is kept verbatim,
       because js/atlas-geo-object.js — which owns the shape of a place record — keeps `kind` as a
       free string, and a ledger that quietly rewrote 'airport' to 'unknown' would be a second,
       disagreeing opinion about the same field. */
    const KINDS = ['country', 'admin1', 'admin2', 'city', 'water', 'region',
      'river', 'basin', 'mountain', 'island', 'point', 'unknown'];

    /* ⚠ THE SHAPE OF A PLACE IS js/atlas-geo-object.js's, NOT THIS FILE'S (#R397). When the console
       hands its `geoObject` in, every record goes through it first — so the coordinate keeps the
       PROVENANCE class that decides whether it may ever be described to the model as the point the
       reader meant, and a centroid stored here can still never be promoted to a location. Without
       it (the node checks, a bare caller) the fields are read straight off the input. */
    const shape = (typeof deps.geoObject === 'function') ? deps.geoObject : null;

    /* js/atlas-console.js's `_lnorm`, handed in rather than copied (js/atlas-turn-results.js does
       the same): one spelling of "the same words" for the whole console. */
    const norm = (typeof deps.norm === 'function')
      ? deps.norm
      : (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

    const MAX = Math.max(24, Math.min(600, +deps.max || 240));

    let entities = [];                       /* newest last — insertion order IS the reading order */
    let byId = Object.create(null);
    let byAlias = Object.create(null);        /* normalised alias → stableId */
    let turn = 0;
    let windowRange = null;                   /* the conversation's fixed time window, if one was set */

    function str(v, n) { const s = String(v == null ? '' : v).trim(); return n ? s.slice(0, n) : s; }
    function num(v) { const x = +v; return isFinite(x) ? x : null; }

    /* A country code is written a dozen ways in the wild. Keep what the caller declared and never
       guess the other form from it — the ledger reports what it was told. */
    function codeOf(v) {
      const s = str(v).toUpperCase().replace(/[^A-Z]/g, '');
      return (s.length === 2 || s.length === 3) ? s : '';
    }

    /* stableId: what the caller declared, else something reproducible from what it DID declare.
       ⚠ It must not contain the spelling the reader used, or the same oblast asked for in Japanese
       and in English would be two entities. Canonical name + kind + country is the identity. */
    function idOf(e) {
      const given = str(e.stableId || e.id, 80);
      if (given) return given;
      const base = norm(e.canonicalName || e.name);
      if (!base) return '';
      return [str(e.kind) || 'unknown', codeOf(e.countryCode) || '??', base].join(':');
    }

    function aliasesOf(e) {
      const out = [];
      const push = (v) => { const k = norm(v); if (k && out.indexOf(k) < 0) out.push(k); };
      push(e.name); push(e.canonicalName); push(e.nativeName);
      (Array.isArray(e.aliases) ? e.aliases : []).forEach(push);
      const sid = str(e.stableId || e.id);
      if (sid) push(sid);
      return out;
    }

    /* ══ THE TIME WINDOW ═══════════════════════════════════════════════════════════════════════
       「時間窓を検索前に固定していない」 — the same report's other half. One research pass covered
       the night of the 25th, the next covered the 26th–27th, and the two answers disagreed about
       which strikes existed. A window is a property of the QUESTION, so it is fixed once and handed
       to every later step of the same question rather than re-derived from each search's results.
       ⚠ Atlas sets it; this file only keeps it. */
    function whenOf(w) {
      if (!w) return null;
      const s = str(w.start || w.from || w[0]), e = str(w.end || w.to || w[1]);
      if (!s && !e) return null;
      return { start: s, end: e, label: str(w.label, 80) };
    }

    /**
     * record(e) -> entity | null
     *
     * File one resolved place. Recording the same place twice MERGES — a later turn that learns the
     * coordinate of a name an earlier turn only knew the kind of must not create a second entity,
     * because then `resolve()` has two answers and the next turn is back to guessing.
     */
    function record(e) {
      if (!e) return null;
      /* one shape for a place (#R397) — the coordinate arrives with its provenance already judged */
      const g = shape ? shape(e) : e;
      const kind = str(g.kind || e.kind) || 'unknown';
      const name = str(e.name || e.canonicalName || g.name, 120);
      const canonical = str(e.canonicalName || e.name || g.name, 120);
      if (!name && !canonical) return null;
      const draft = {
        kind,
        name,
        canonicalName: canonical,
        nativeName: str(e.nativeName, 120),
        aliases: [],
        countryCode: codeOf(e.countryCode),
        countryName: str(e.countryName || g.country, 80),
        parent: str(e.parent, 120),                  /* the admin unit ABOVE this one, when known */
        stableId: '',
        lng: num(g.lng != null ? g.lng : e.lng), lat: num(g.lat != null ? g.lat : e.lat),
        provenance: str(g.provenance || e.provenance, 40),   /* js/atlas-geo-object.js's class — never widened here */
        confidence: str(g.confidence || e.confidence, 10),
        summary: str(g.summary || e.summary, 400),
        bbox: (Array.isArray(e.bbox) && e.bbox.length === 4 && e.bbox.every((v) => isFinite(+v)))
          ? e.bbox.map(Number) : null,
        role: str(e.role, 60),                       /* what this place WAS in the answer */
        when: whenOf(e.when),
        source: str(e.source, 40),                   /* admin1-index | nominatim | model | evidence | … */
        turn,
      };
      /* ⚠ THE DECLARED ID IS READ OFF `e`, NOT OFF THE MERGE. `draft.stableId` is '' at this point,
         and `Object.assign({}, e, draft)` lets that empty string win — which threw away every
         identifier the ADM1 index had just supplied (RU-BEL became `admin1:RU:belgorod`) and put
         the ledger back to keying on a NAME, the exact defect this file exists to end. */
      draft.stableId = idOf({ stableId: e.stableId || e.id, kind: draft.kind,
        canonicalName: draft.canonicalName, name: draft.name, countryCode: draft.countryCode });
      if (!draft.stableId) return null;
      draft.aliases = aliasesOf(Object.assign({}, e, draft));

      const prev = byId[draft.stableId];
      const merged = prev ? merge(prev, draft) : draft;
      if (!prev) { entities.push(merged); byId[merged.stableId] = merged; }
      merged.aliases.forEach((a) => { if (!byAlias[a]) byAlias[a] = merged.stableId; });
      if (entities.length > MAX) {
        const drop = entities.splice(0, entities.length - MAX);
        drop.forEach((d) => {
          delete byId[d.stableId];
          d.aliases.forEach((a) => { if (byAlias[a] === d.stableId) delete byAlias[a]; });
        });
      }
      return merged;
    }

    /* A later sighting fills gaps and refreshes the turn; it never blanks a field that was known.
       ⚠ `role` and `when` DO overwrite when the new one is non-empty: the role a place plays is a
       property of the current question, not of the place. */
    function merge(prev, next) {
      ['kind', 'name', 'canonicalName', 'nativeName', 'countryCode', 'countryName', 'parent',
        'source', 'provenance', 'confidence', 'summary']
        .forEach((k) => { if (!prev[k] || prev[k] === 'unknown') { if (next[k]) prev[k] = next[k]; } });
      if (prev.lng == null && next.lng != null) { prev.lng = next.lng; prev.lat = next.lat; }
      if (!prev.bbox && next.bbox) prev.bbox = next.bbox;
      if (next.role) prev.role = next.role;
      if (next.when) prev.when = next.when;
      next.aliases.forEach((a) => { if (prev.aliases.indexOf(a) < 0) prev.aliases.push(a); });
      prev.turn = next.turn;
      return prev;
    }

    function recordMany(list, shared) {
      return (Array.isArray(list) ? list : [])
        .map((e) => record(shared ? Object.assign({}, shared, e) : e))
        .filter(Boolean);
    }

    /**
     * resolve(name, opts) -> entity | null
     *
     * The lookup the geocoders try FIRST. `opts.kind` / `opts.countryCode` narrow it, so 「モスクワ」
     * asked for as an admin1 does not come back as the city a previous turn pinned.
     */
    function resolve(name, opts) {
      const k = norm(name);
      if (!k) return null;
      const o = opts || {};
      const wantKind = str(o.kind);
      const wantCC = codeOf(o.countryCode);
      const direct = byId[str(name)] || byId[byAlias[k]];
      const fits = (e) => !!e && (!wantKind || e.kind === wantKind)
        && (!wantCC || !e.countryCode || e.countryCode === wantCC);
      if (fits(direct)) return direct;
      /* an alias shared by two entities points at the FIRST one recorded, so a narrowed search
         still has somewhere to go: walk the list and take the newest match that fits. */
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        if (e.aliases.indexOf(k) >= 0 && fits(e)) return e;
      }
      return null;
    }

    /** Everything, or everything a role/kind/turn selects. Newest last, as recorded. */
    function all(sel) {
      const s = sel || {};
      const wantKind = str(s.kind), wantRole = str(s.role), wantCC = codeOf(s.countryCode);
      const sinceTurn = (s.since == null) ? null : +s.since;
      return entities.filter((e) => (!wantKind || e.kind === wantKind)
        && (!wantRole || e.role === wantRole)
        && (!wantCC || e.countryCode === wantCC)
        && (sinceTurn == null || e.turn >= sinceTurn));
    }

    /** mappable(sel) — the ones something can actually be drawn at, or drawn for. */
    function mappable(sel) {
      return all(sel).filter((e) => (e.lng != null && e.lat != null) || !!e.bbox
        || e.kind === 'country' || e.kind === 'admin1');
    }

    function setWindow(w) { const x = whenOf(w); if (x) windowRange = x; return windowRange; }
    function getWindow() { return windowRange; }

    /** beginTurn() — the reader said something new. Nothing is forgotten; the counter moves. */
    function beginTurn(n) { turn = (n == null) ? (turn + 1) : (+n || 0); return turn; }

    /**
     * contextLines(sel) -> [string]
     *
     * What the next turn is TOLD it already knows. One line per entity, carrying the identifier it
     * should hand to a tool instead of re-typing a name — so the model has something to pass that
     * is not a string it just read back out of its own prose.
     */
    function contextLines(sel) {
      const list = all(sel);
      const out = [];
      if (list.length) {
        out.push('[RESOLVED PLACES — this conversation has ALREADY resolved these. Pass the id as '
          + '`stableId` (or the canonical name together with its country) instead of re-extracting a '
          + 'name from prose, and do NOT geocode them again.]');
        list.forEach((e) => {
          const bits = [e.stableId, e.kind, '"' + (e.canonicalName || e.name) + '"'];
          if (e.countryCode) bits.push('(' + e.countryCode + ')');
          if (e.parent) bits.push('in ' + e.parent);
          if (e.lng != null) bits.push(e.lat.toFixed(3) + ',' + e.lng.toFixed(3));
          if (e.role) bits.push('role: ' + e.role);
          out.push('  ' + bits.join('  '));
        });
      }
      if (windowRange) {
        out.push('[TIME WINDOW fixed for this question: '
          + [windowRange.start, windowRange.end].filter(Boolean).join(' … ')
          + (windowRange.label ? (' — ' + windowRange.label) : '')
          + '. Every search and every item must stay inside it.]');
      }
      return out;
    }

    /** clear() — a new conversation, not a new turn. */
    function clear() {
      entities = []; byId = Object.create(null); byAlias = Object.create(null);
      turn = 0; windowRange = null;
    }

    const API = { KINDS, record, recordMany, resolve, all, mappable, contextLines,
      setWindow, getWindow, beginTurn, clear, size: () => entities.length };
    try { window.IntMapAtlasGeoLedger = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
