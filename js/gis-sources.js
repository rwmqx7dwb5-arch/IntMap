/* ============================================================================
 *  IntMap · WHAT THE ANSWER WAS TAKEN FROM — window.IntMapGisSources   (#R749)
 * ----------------------------------------------------------------------------
 *  js/gis-layers.js opened the door from 「地図に出ているもの」 to 「分析できるもの」. What it could
 *  not say is the thing that decides whether the analysis means anything:
 *
 *      ⚠⚠⚠ ASKING FOR THE WORLD IS NOT THE SAME AS HAVING BEEN GIVEN THE WORLD.
 *
 *  The bridge asks a layer for [[-180,-90],[180,90]] because the layer contract has one door and no
 *  word for 「everything」 — and then hands back whatever came, with nothing attached that says what
 *  it was. But what comes back is what the RENDERER is holding: a source a module refreshed for the
 *  current view, a list the upstream capped, a field that is only loaded while its layer is on. So
 *  「この範囲の平均は」 came out as a number with the authority of a measurement over a region, when
 *  it was a measurement over 「いま画面に載っていたもの」 — and neither the reader nor Atlas could
 *  tell the two apart, because nothing in the dataset distinguished them.
 *
 *  This is the shape this repository keeps recording: 被覆を件数で報告すると「一部だけ」が原理的に
 *  見えない ([[intmap-coverage-counted-is-not-coverage-seen]]), and 「記録が答えなかった」 and
 *  「そこには無かった」 must not arrive as one sentence. So this file adds one value to every
 *  acquisition — `coverage` — and it is the only thing here that is new. Everything else is a
 *  delegation: the features come from js/gis-layers.js's read(), the grid arithmetic from
 *  js/gis-raster.js, the box predicate from js/map-ui.js. Nothing is judged twice.
 *
 *  ══ ⚠⚠⚠ `all` IS A CLAIM, AND A CLAIM NEEDS A CLAIMANT ═══════════════════════════════════════
 *  `completeness:'all'` says 「求めた窓のうち、供給元が持っているものは全部ここに在る」. NOTHING
 *  REACHABLE FROM HERE CAN ESTABLISH THAT BY ITSELF: a renderer source holding 400 aircraft is
 *  indistinguishable, from the outside, from a world-wide list and from a fetch for the current
 *  viewport. Guessing would be 「知らない」を「全部だ」の代わりにする — the defect
 *  .agents/rules/historical-verification.md §3 is about, in a new place.
 *  ⇒ SO `all` IS ONLY REACHED WHEN THE SUPPLIER ITSELF SAYS SO, through `declare()`, and the
 *  declaration is CHECKED against the window that was asked for. With no declaration the answer is
 *  `partial` and the reason says which kind of silence it was.
 *  ⚠ (#R756) AND THE 「NOBODY DECLARES」 THAT USED TO BE WRITTEN HERE IS OVER. The layer registry
 *  publishes each row's own statement (js/map-ui.js `holds` → `IntMapLayers.declarationOf`), so a
 *  built-in layer that holds a whole shipped file says so and reaches `all`; the rows that fetch the
 *  camera's rectangle say THAT, and read `supplier-view-bound` instead of a silence. A row that says
 *  nothing still reads `partial` / `extent-undeclared`, which remains the true state of most of them.
 *
 *  ⚠ AND ONE THING IS MEASURED RATHER THAN DECLARED. When the caller asked for everything and no
 *  declaration exists, this file compares what the supplier hands over for the WORLD against what it
 *  hands over for the CURRENT CAMERA. If the two are the same size, every feature the supplier holds
 *  is on screen — which is what a view-bound supplier looks like, and is also what a genuinely small
 *  dataset under a wide camera looks like. So the verdict is not 「view-bound」 but
 *  `indistinguishable-from-view`: a measurement reported as what it is, which is the whole subject of
 *  this file. It is taken only when it can discriminate (the camera is strictly inside the window that
 *  was asked about) and only when `all` was otherwise at stake, so it costs one extra pass and never
 *  runs in a loop.
 *  ⚠ (#R752) AND 「at stake」 NOW INCLUDES A DECLARATION THAT CLAIMS COMPLETENESS. A declaration is a
 *  claimant, not a proof: when the supplier says it holds everything and the measurement cannot tell
 *  that apart from a holding refreshed for this camera, the answer is
 *  `declaration-unconfirmed-by-view` rather than `all`. ⚠ A supplier that also declared `live:false`
 *  is exempt, and the exemption is its own statement too — a holding that is never refreshed cannot
 *  be a holding refreshed for the view, so there is nothing left for the camera to confuse it with.
 *
 *  ══ ⚠⚠⚠ AND UNTIL #R752 THE SUPPLIER COULD NOT ANSWER AT ALL ═════════════════════════════════
 *  Every acquisition below delegated to js/gis-layers.js's read(), and read() hands back THE ARRAY
 *  THE RENDERER IS HOLDING. That is one answer to one question — 「いま描かれているものを渡せ」 — and
 *  it was the only question this file could ask: `read(id, {bounds})` has one parameter, so
 *  「この属性に合うものだけ」 had nowhere to go, 「続きを」 had nowhere to go, and a supplier that could
 *  have answered from its own store (an API with a WHERE clause, a paged upstream, a file on disk)
 *  had no way to be asked. The caller's `limit` cut the FRONT of what the renderer happened to hold.
 *
 *  ⇒ supply(id, impl) IS THAT DOOR. A supplier registers the fetch ITSELF, and the question it is
 *  asked is the whole question:
 *
 *      fetch({bbox, time, where, fields, limit, cursor, signal, onProgress})
 *        → {ok, features[], coverage?, next?}
 *
 *  ⚠ THE DELEGATION IS NOT REPLACED. The renderer path is the one road most layers in this app
 *  travel; removing it would be removing the feature. A supplier is consulted when one exists, and
 *  when none does the answer comes from where it always came from, with the coverage it always had.
 *  ⚠ (#R756) AND ONE EXISTS NOW: js/gis-layers.js builds an implementation out of a layer's own
 *  declaration (supplierFor), so the two gates below stopped being a wall in front of every id.
 *
 *  ⚠ `next` ABSENT IS NOT 「もう無い」. `coverage.continues` is three-valued — true when the supplier
 *  handed over a cursor, false when it said `next:null` (an explicit 「これで終わり」), and NULL when it
 *  said nothing, which is `continuation-unstated` and is not an `all`. Reading an absent field as
 *  exhaustion is the same defect as reading an absent declaration as `all`.
 *
 *  ⚠ `where` IS js/gis-ops.js's VOCABULARY, ASKED FOR RATHER THAN COPIED. The conditions are the
 *  `{field, op, value}` rows its `filter` op declares, and the operator names are validated against
 *  the list that op publishes — a second spelling here would be a second language for one idea.
 *  ⚠ AND A SUPPLIER THAT CANNOT EXECUTE THEM IS REFUSED, NOT QUIETLY IGNORED (`where-not-supported`).
 *  Handing back every feature in the window after being asked for 「M6 以上」 would be an answer to a
 *  question nobody asked, with real data — and this file cannot filter them itself without writing
 *  js/gis-ops.js's comparison rules a second time, which is the drift that rule forbids.
 *
 *  ══ REFUSALS ARE CODES, AND THE VOCABULARY IS THE APP'S ═══════════════════════════════════════
 *  Every code returned here is one js/gis-panel.js already has nine languages for, except
 *  `layer-not-visible` — which is the one fact this layer adds (「消えている供給元に訊いたので何も
 *  返らなかった」 as opposed to 「訊けたが 0 件だった」), and which js/gis-layers.js translates into the
 *  app's existing `layer-not-sampling` at the door a reader actually reaches.
 *  ⚠ (#R752) AND THE CODES THIS FILE ITSELF RETURNS ARE DECLARED, not discovered by reading the call
 *  sites: `refusalCodes()` is the list, `refuse()` is the only door, and a code that door returns
 *  which the list does not name marks itself `undeclared:true` rather than passing unseen. The supply
 *  contract's refusals (`where-not-supported`, `cursor-not-supported`, `supplier-is-async`,
 *  `supplier-failed`, `supplier-answer-invalid`) are reachable ONLY through a request that named
 *  `where` or `cursor`, or through a registered implementation.
 *  ⚠ (#R756) IMPLEMENTATIONS EXIST NOW, AND NO SHIPPED CONTROL NAMES `where` OR `cursor` STILL. So
 *  what a reader can meet through the panel is unchanged (`bad-param`, `layer-not-visible` — both
 *  already spoken in nine languages), and `where-not-supported` / `cursor-not-supported` remain
 *  reachable only from a caller that asked for one. ⚠ WIRING A CONTROL FOR EITHER MEANS GIVING THEM
 *  NINE LANGUAGES IN js/gis-panel.js FIRST — the sentence is what a reader is owed, not the code.
 *
 *  ══ ⚠⚠⚠ (#R819) AND A PARAMETER IS NOT A CAPABILITY ══════════════════════════════════════════
 *  The contract above says a request MAY name a window, a time, conditions, columns, a count and a
 *  position. Whether the party at the other end can honour any of it was decided in one place
 *  (`where` is refused when nobody claims it) and nowhere else. Two doors close that gap, and the
 *  argument for both is written at 「引数が在る」 と 「その条件で取れる」 は別の主張である below:
 *    · plan() / acquirePlanned() — WHERE EACH CONDITION RUNS. A supplier that serves the window but
 *      cannot filter is not the end of the road; the conditions run in a later stage over what it
 *      served. ⚠ ONLY IF THE EARLIER STAGE WAS EXHAUSTIVE — a filter over a capped page answers
 *      「取れた分だけ」, so the planned road pages by the supplier's own cursor, divides the window
 *      when the cap has no cursor, and REFUSES (`plan-unsatisfiable`) when neither reaches the end.
 *      ⚠ The filter itself is js/gis-ops.js's and is not written here: a staged answer comes back
 *      as `kind:'staged'` with the pending conditions named, never as `kind:'features'`.
 *    · capabilitiesOf() / measureCapabilities() / auditCapabilities() — the registration's CLAIM,
 *      the same doors' MEASUREMENT, and every place the two disagree. Nothing is listed: an id has
 *      capabilities by being registered.
 *  ⚠ AND EVERY ANSWER NOW SAYS WHICH ROAD ANSWERED (`coverage.answeredBy`). The delegated road is
 *  not removed and not deprecated — it is the road most rows travel — but a caller that says
 *  `analysis:true` is refused a population the camera decides (`renderer-view-dependent`), which is
 *  judged from coverage.reason and not from a list of ids.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③) and window.* is read at CALL time, so this
 *  module imports in Node with no DOM and refuses by name instead of throwing.
 * ==========================================================================*/

export function makeGisSources() {
  return (function () {

    /* Read at call time — never captured. */
    function LAYERS() { try { return (typeof window !== 'undefined' && window.IntMapGisLayers) || null; } catch (_) { return null; } }
    function REG() { try { return (typeof window !== 'undefined' && window.IntMapLayers) || null; } catch (_) { return null; } }
    function RASTER() { try { return (typeof window !== 'undefined' && window.IntMapGisRaster) || null; } catch (_) { return null; } }
    function DATA() { try { return (typeof window !== 'undefined' && window.IntMapData) || null; } catch (_) { return null; } }
    function GE() { try { return (typeof window !== 'undefined' && window.IntMapGeoEngine) || null; } catch (_) { return null; } }

    /* 「everything」, in the only vocabulary the layer contract has (js/gis-layers.js says why). */
    const WHOLE_WORLD = { w: -180, s: -90, e: 180, n: 90 };

    /* ⚠ THE CODES THIS FILE PRODUCES, DECLARED IN ONE PLACE. A refusal spelt only at its call site is
       a refusal no reader can be given a sentence for — the same argument REASONS above is written
       for. Codes that arrive from BELOW (js/gis-layers.js's read(), js/gis-raster.js's `cancelled`)
       pass through untouched and are not this file's to declare. */
    /* ⚠ (#R763) WHERE THE 「このレイヤーは答えるか」 PROBE LOOKS. Fractions of the requested window,
       not coordinates: a window is anywhere on Earth and a fixed point would be a place. The centre
       is first because it was the only one before this round and is the cheapest hit for a field
       that answers everywhere; the rest exist because the centre of a window over Japan is ocean,
       and one arbitrary pixel deciding for the whole request is the shape this project keeps
       recording — 「1 点で全体を断じる」. Five is not a measurement of anything; it is the smallest
       set that puts a point in each quadrant as well as the middle, and it costs five calls once.
       ⚠⚠⚠ (#R774) AND WHAT THESE POSITIONS ARE FOR IS NOT 「ここに値があるか」. They are where the
       registry is ASKED; what the probe reads is whether it answered with a row at all. The number
       of points therefore no longer decides which windows are servable — that is what made adding
       points look like a fix, and a sixth point would only move the corner it gets wrong. */
    const PROBE_POINTS = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];

    const REFUSALS = [
      'bad-param',                 /* a parameter this file cannot use, named */
      'map-unavailable',           /* the kernel it has to ask is not mounted */
      'layer-unknown',             /* nothing registered, drew or supplied this id */
      'layer-not-visible',         /* 「訊けなかった」 — see the header */
      'layer-values-not-numeric',  /* the field answered, but not with numbers */
      /* ⚠ (#R763) 「取得に失敗した」 — the row was asked and threw, which is neither 「値が無い」 nor
         「文字列だった」. Those three used to arrive as one code, so a reader was told their data was
         text when the upstream had actually fallen over. */
      'layer-sample-failed',       /* the layer was asked and could not answer */
      'layer-values-all-missing',  /* it answered everywhere, with no value anywhere (a real NoData window) */
      'band-not-selectable',       /* a band was named to a supplier that has one value per position */
      'where-not-supported',       /* attribute conditions with nobody able to execute them */
      'cursor-not-supported',      /* a page was asked for from a supplier that cannot resume */
      'supplier-is-async',         /* the synchronous door was used on a supplier that awaits */
      'supplier-failed',           /* the registered implementation threw */
      'supplier-answer-invalid',   /* it answered in a shape the contract does not have */
      /* ── (#R819) the two a PLANNED acquisition can produce ────────────────────────────────────
         ⚠ NEITHER IS REACHABLE FROM ANY SHIPPED CONTROL, exactly as `where-not-supported` is not:
         they answer a request that named `plan`/`acquirePlanned` or `analysis:true`, and nothing in
         js/gis-panel.js names either. ⚠ WIRING A CONTROL FOR THEM MEANS GIVING THEM SENTENCES IN
         js/gis-panel.js FIRST — the header says why, and that has not changed. */
      'plan-unsatisfiable',        /* the split cannot answer the question that was asked, and says why */
      'renderer-view-dependent',   /* an analysis asked for, answerable only out of what is on screen */
    ];

    function refuse(why, detail) {
      const out = { ok: false, why: why };
      if (detail !== undefined) out.detail = detail;
      /* 一覧は宣言であって写真ではない: a code returned here that REFUSALS does not name is a defect,
         and it says so about itself rather than slipping past as an ordinary answer. */
      if (REFUSALS.indexOf(why) < 0) out.undeclared = true;
      return out;
    }

    const isNum = (v) => typeof v === 'number' && isFinite(v);
    const isPosInt = (v) => isNum(v) && Number.isInteger(v) && v > 0;

    function asBox(b) {
      if (!b) return null;
      try {
        if (typeof b.getWest === 'function') return { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() };
        if (Array.isArray(b) && b.length === 2 && Array.isArray(b[0])) return { w: +b[0][0], s: +b[0][1], e: +b[1][0], n: +b[1][1] };
        if (Array.isArray(b) && b.length === 4 && b.every(isNum)) return { w: +b[0], s: +b[1], e: +b[2], n: +b[3] };
        if (b.w != null && b.e != null) return { w: +b.w, s: +b.s, e: +b.e, n: +b.n };
      } catch (_) { }
      return null;
    }
    const finiteBox = (x) => !!x && [x.w, x.s, x.e, x.n].every(isNum);
    const copyBox = (x) => ({ w: x.w, s: x.s, e: x.e, n: x.n });
    /* Containment, in the plane the boxes are written in. Used for ONE thing: does a declared extent
       cover the window that was asked for. A declaration that crosses the seam is written as two
       boxes by its author, because this file will not guess which side of ±180 they meant. */
    const contains = (outer, inner) => outer.w <= inner.w && outer.s <= inner.s && outer.e >= inner.e && outer.n >= inner.n;
    const intersectBox = (a, b) => ({ w: Math.max(a.w, b.w), s: Math.max(a.s, b.s), e: Math.min(a.e, b.e), n: Math.min(a.n, b.n) });

    /* ── the vocabulary of an answer's coverage ───────────────────────────────────────────────── */

    /* ⚠ THREE WORDS, AND THE THIRD IS NOT A WEAKER SECOND. `partial` means 「求めた窓の一部しか
       答えていない（かもしれない）」 — something was, or may have been, left out of the window.
       `sample` means 「窓は全部答えたが、答えは元のものそのものではない」 — a field read at a
       resolution the caller chose, or a list cut at a count the caller chose. The two need different
       things from a reader: a partial answer is made whole by asking again differently; a sample is
       made finer by asking again with different numbers, and is never made whole. */
    const COMPLETENESS = ['all', 'partial', 'sample'];

    /* Why the answer is not `all`. ⚠ EVERY ONE OF THESE IS A THING THAT WAS OBSERVED OR DECLARED,
       never a default: an answer with no reason is an `all`. */
    const REASONS = [
      'extent-undeclared',            /* nobody said what the supplier holds — the state of the app today */
      'completeness-undeclared',      /* it said WHERE it is, not that it holds all of what is there */
      'extent-narrower-than-request', /* the supplier declared an extent, and it does not cover the window */
      'supplier-view-bound',          /* the supplier declared that it keeps only what the camera needs */
      'indistinguishable-from-view',  /* measured: everything it holds is inside the current camera */
      'limit-truncated',              /* the caller's own limit cut the answer */
      'time-not-established',         /* a time was asked for and nothing establishes that this is it */
      'grid-is-a-sample',             /* a field burnt at the caller's resolution is a sample by construction */
      /* ── (#R752) the three a supplier's own answer can produce ─────────────────────────────── */
      'supplier-page-incomplete',     /* it handed over a cursor: it said itself that more remains */
      'continuation-unstated',        /* it said nothing about continuation, so 「これで全部」 is nobody's */
      'declaration-unconfirmed-by-view', /* measured: a `complete` claim this camera cannot distinguish */
      /* ── (#R763) the one that is not about acquisition at all ──────────────────────────────────
         Every reason above answers 「求めたもののうち、どこまでが返ったか」. This one answers
         「返ったもののうち、どこまでが計算できたか」 — js/gis-ops.js counts the rows a run could not
         compute (`geometryFailed`) and the output record now says so. It lives in THIS list because
         the vocabulary of 「なぜ all ではないのか」 is one vocabulary; a second list in js/gis-ops.js
         would be the shape both files spend their headers refusing. */
      'op-rows-not-computed',         /* the run itself lost rows: computed out of its inputs, not all of them */
      /* ── (#R819) the one that is about a condition nobody has executed YET ─────────────────────
         An acquisition that covered the whole window is still not an answer to 「M6 以上を」 while
         the attribute conditions are sitting in a later stage. `all` would be a claim about the
         QUESTION, made by the half of the plan that only answered the window. */
      'where-pending-post-stage',     /* the window is whole; the conditions have not run yet */
    ];

    /* ── declarations: the only route to `all` ────────────────────────────────────────────────── */

    /* A module that KNOWS what it holds says so here. ⚠ THIS IS NOT A TABLE OF SOURCES KEPT IN THIS
       FILE. Nothing is written down: the map is empty until a supplier fills its own row, and a
       supplier this file has never heard of declares exactly as well as one it has.
       {extent:{w,s,e,n}|null, viewBound:bool, live:bool, asOf:string|null, resolution:any,
        complete:bool} — `complete` is 「宣言した extent の中では全部持っている」. Without it an
       extent narrows the reason but never reaches `all`, because 「どこまでを覆うか」 and
       「その中を漏れなく持っているか」 are two statements. */
    const declared = new Map();

    /* ONE READING OF A DECLARATION, wherever the declaration came from. Returns the record, or null
       when the statement cannot be read — the two callers below want different things said about
       that (declare() names the offending parameter, the registry route stays silent), and a second
       normaliser is how the two routes end up disagreeing about what `complete` means. */
    function readDeclaration(decl) {
      if (!decl || typeof decl !== 'object') return null;
      let extent = null;
      if (decl.extent != null) {
        extent = asBox(decl.extent);
        if (!finiteBox(extent)) return null;
        extent = copyBox(extent);
      }
      return {
        extent: extent,
        complete: decl.complete === true,
        viewBound: decl.viewBound === true,
        live: (decl.live == null) ? null : (decl.live === true),
        asOf: (decl.asOf == null || decl.asOf === '') ? null : String(decl.asOf),
        resolution: (decl.resolution === undefined) ? null : decl.resolution,
      };
    }

    function declare(id, decl) {
      const key = String(id == null ? '' : id);
      if (!key) return refuse('bad-param', { param: 'id', value: id });
      if (decl === null) { declared.delete(key); return { ok: true, id: key, declaration: null }; }
      if (!decl || typeof decl !== 'object') return refuse('bad-param', { param: 'declaration', value: decl });
      const d = readDeclaration(decl);
      if (!d) return refuse('bad-param', { param: 'declaration.extent', value: decl.extent });
      declared.set(key, d);
      return { ok: true, id: key, declaration: d };
    }

    /* ⚠⚠⚠ (#R756) THE SECOND CLAIMANT, AND UNTIL THIS ROUND IT HAD NO ROAD HERE. declare()'s only
       caller in the shipped app is the upload path, so a built-in layer could not reach `all` no
       matter what it held: the registry assembled six fields for a READER (js/map-ui.js state()) and
       a claim about what a source CONTAINS is not one of them. The layer registry now publishes the
       row's own statement (`IntMapLayers.declarationOf`), and it arrives here through the same
       normaliser an explicit declare() goes through.
       ⚠ NOTHING IS LISTED HERE. Which ids have a declaration is decided by the registrations
       themselves; this asks the registry and believes whatever it says, exactly as it believes an
       upload. ⚠ AN EXPLICIT declare() WINS, because it is about THIS id as the caller found it —
       js/map-ui.js's upload declares a renderer source it has just filled, and a registry row with
       the same id would be a different statement about a holding that has been replaced. */
    function declarationOf(id) {
      const key = String(id);
      const own = declared.get(key);
      if (own) return own;
      const R = REG();
      let stated = null;
      try { stated = (R && typeof R.declarationOf === 'function') ? R.declarationOf(key) : null; } catch (_) { stated = null; }
      return readDeclaration(stated);
    }

    /* ── supply(): the supplier answers the question itself ───────────────────────────────────── */

    /* ⚠ declare() SAYS WHAT A SUPPLIER HOLDS; supply() IS THE SUPPLIER DOING THE HOLDING. The two are
       independent: an implementation that never declares still reads `partial` (it answered, it did
       not say what it has), and a declaration without an implementation still goes through the
       renderer. ⚠ THIS IS NOT A TABLE EITHER — the map is empty until a supplier fills its own row.

       impl = fetch function, or
              {fetch?, region?, sync?, where?, cursor?, fields?, limit?}

       `fetch(req) → {ok, features[], coverage?, next?}` answers for FEATURES and `region(req) →
       {ok, cells, nodata?, band?, coverage?}` answers for a FIELD over a whole window at once.
       The four booleans are CAPABILITIES, and they are the supplier's statement about its own code —
       the only claimant there is for 「この条件を実行できるか」. What they are NOT is optional detail:
       a supplier that does not claim `where` is never handed one (it is refused at the door instead),
       because a condition handed to something that ignores it comes back as a complete-looking answer
       to a different question.
       `sync:true` means fetch answers without a promise, which is the only way the SYNCHRONOUS door
       below can use it at all — js/gis-panel.js and js/gis-atlas.js call features() from a click
       handler without an await (see features()'s note), and calling an async fetch from there would
       fire the request and throw the answer away. */
    const supplied = new Map();

    function supply(id, impl) {
      const key = String(id == null ? '' : id);
      if (!key) return refuse('bad-param', { param: 'id', value: id });
      if (impl === null) { supplied.delete(key); return { ok: true, id: key, supply: null }; }
      const src = (typeof impl === 'function') ? { fetch: impl } : impl;
      if (!src || typeof src !== 'object') return refuse('bad-param', { param: 'implementation', value: impl });
      const fetchFn = (typeof src.fetch === 'function') ? src.fetch : null;
      const regionFn = (typeof src.region === 'function') ? src.region : null;
      if (!fetchFn && !regionFn) return refuse('bad-param', { param: 'implementation', value: 'neither fetch nor region' });
      const rec = {
        fetch: fetchFn, region: regionFn,
        sync: src.sync === true,
        can: { where: src.where === true, cursor: src.cursor === true, fields: src.fields === true, limit: src.limit === true },
      };
      supplied.set(key, rec);
      return { ok: true, id: key, supply: described(rec) };
    }

    function described(rec) {
      return { fetch: !!rec.fetch, region: !!rec.region, sync: rec.sync, can: Object.assign({}, rec.can) };
    }
    /* ⚠⚠⚠ (#R756) supply() HAD NO CALLER, AND TWO GATES IN prepare() TURNED THAT INTO A WALL. With
       `supplied` empty, every request naming `where` came back `where-not-supported` and every
       request naming `cursor` came back `cursor-not-supported` — not sometimes, not for the rows
       that cannot filter, but for every id in the app, because nothing could be asked. The contract
       existed and the door was nailed shut.
       ⇒ THE REGISTRY IS ASKED FOR ONE. js/gis-layers.js builds an implementation out of a layer's
       OWN registration (what it declares about its holdings, and whether it hands features over at
       all) and answers `supplierFor(id)` with it — so an id becomes suppliable by being registered
       that way, not by being added to a list here. ⚠ A row that cannot answer for itself gets no
       supplier and travels the delegated road exactly as before. */
    function adopt(key) {
      const L = LAYERS();
      if (!L || typeof L.supplierFor !== 'function') return;
      let impl = null;
      try { impl = L.supplierFor(key); } catch (_) { impl = null; }
      if (impl) supply(key, impl);
    }
    /* the record itself, for this file; supplierOf() below hands callers a copy of what it CAN do.
       ⚠ THE ONE ACCESSOR, so adoption happens wherever a supplier is looked for and nowhere else. */
    function sup(id) {
      const key = String(id);
      if (!supplied.has(key)) adopt(key);
      return supplied.get(key) || null;
    }
    function supplierOf(id) { const r = sup(id); return r ? described(r) : null; }

    /* ── where: one vocabulary, and it is js/gis-ops.js's ─────────────────────────────────────── */

    function OPS() { try { return (typeof window !== 'undefined' && window.IntMapGisOps) || null; } catch (_) { return null; } }

    /* The comparisons the app HAS, asked for rather than restated. js/gis-ops.js declares them on the
       `filter` op's `where` parameter, which is where a panel reads them from too. */
    function conditionOps() {
      const O = OPS();
      try {
        const decl = (O && typeof O.op === 'function') ? O.op('filter') : null;
        const p = (decl && Array.isArray(decl.params)) ? decl.params.find((x) => x && x.name === 'where') : null;
        return (p && Array.isArray(p.ops)) ? p.ops.slice() : null;
      } catch (_) { return null; }
    }

    /* {ok:true, where} or a refusal. ⚠ WHEN THE OPS KERNEL IS NOT MOUNTED THE NAMES ARE NOT CHECKED
       rather than checked against a copy kept here: refusing a condition this file has no opinion
       about would be inventing an opinion, and writing the nine operators down would be the second
       vocabulary the header forbids. The shape is still checked, because that part is this file's. */
    function readWhere(where) {
      if (where == null) return { ok: true, where: null };
      if (!Array.isArray(where) || !where.length) return refuse('bad-param', { param: 'where', value: where });
      const vocab = conditionOps();
      const out = [];
      for (let i = 0; i < where.length; i++) {
        const c = where[i];
        if (!c || typeof c !== 'object' || c.field == null || String(c.field) === '' || c.op == null) {
          return refuse('bad-param', { param: 'where[' + i + ']', value: c });
        }
        const op = String(c.op);
        if (vocab && vocab.indexOf(op) < 0) return refuse('bad-param', { param: 'where[' + i + '].op', value: op, ops: vocab });
        out.push({ field: String(c.field), op: op, value: c.value });
      }
      return { ok: true, where: out };
    }

    /* ── what the registry says about one row ─────────────────────────────────────────────────── */

    function stateOf(id) {
      const R = REG();
      try { return (R && R.state) ? R.state(String(id)) : null; } catch (_) { return null; }
    }

    /* The layer's own sentence about WHEN it is, and the moment ONLY when it actually reads as one.
       js/gis-layers.js states the rule and the registry that owns it (IntMapData.momentOf); this is
       the same call, not a second reading of the same string. */
    function statedTime(id) {
      const s = stateOf(id);
      const t = s && s.time;
      return (t == null || t === '') ? null : String(t);
    }
    function momentOf(sentence) {
      const D = DATA();
      try { return (sentence && D && D.momentOf) ? D.momentOf(sentence) : null; } catch (_) { return null; }
    }

    /* ── list(): discovered, never written ────────────────────────────────────────────────────── */

    /* ⚠ THE POPULATION IS js/gis-layers.js's sources() PLUS THE REGISTRY ROWS IT DID NOT OFFER.
       The first is already a count-up rather than a list (it asks the layer registry and the
       renderer's own style); the second is every other row the registry knows, and those are the
       rows that answer 「その地点の値は」 instead of handing features over — the FIELDS. A row that
       answers neither is still listed as a field candidate, because `IntMapLayers` has exactly one
       door for that question and no way to ask in advance whether it is answered; what it actually
       has is MEASURED at acquisition and refused by name (`layer-values-not-numeric`).
       ⇒ So `kind:'grid'` here means 「場として訊ける候補」, not 「値を持つ」. */
    function list() {
      const out = [];
      const seen = new Set();
      /* ⚠ (#R752) A THIRD POPULATION, AND IT IS COUNTED THE SAME WAY: the ids that registered an
         implementation. It goes FIRST because a supplier that answers for itself is the answer for
         that id whatever the renderer is also holding, and because an id nothing draws would
         otherwise be unreachable — acquire() refuses what list() does not contain. */
      for (const id of supplied.keys()) {
        const rec = sup(id);
        const st = stateOf(id);
        seen.add(id);
        out.push(entry(id, (st && st.label != null) ? String(st.label) : id, rec.fetch ? 'features' : 'grid', null));
      }
      const L = LAYERS();
      let featureRows = [];
      try { featureRows = (L && typeof L.sources === 'function') ? (L.sources() || []) : []; } catch (_) { featureRows = []; }
      for (const s of featureRows) {
        if (!s || s.id == null) continue;
        const id = String(s.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(entry(id, s.label == null ? id : String(s.label), 'features', s));
      }
      const R = REG();
      let ids = [];
      try { ids = (R && typeof R.list === 'function') ? R.list().map(String) : []; } catch (_) { ids = []; }
      for (const id of ids) {
        if (seen.has(id)) continue;
        const st = stateOf(id);
        if (!st) continue;                       /* state() did not answer: not a readable row */
        /* ⚠⚠⚠ (#R763) WHICH KIND A ROW IS WAS DECIDED BY WHETHER IT HAD BEEN DRAWN. The loop above
           takes its ids from the RENDERER's sources, so a row holding a document nobody has switched
           on never appeared there and fell through to here as a `grid` — and acquire(), dispatching
           on that, sent a request for its FEATURES to region(), which refused it for having no width.
           The row was readable; the classification was a statement about the camera.
           ⇒ ASK WHAT IT CAN DO. A row with a supplier that hands features over is a features row,
           drawn or not; sup() builds one out of the registration (js/gis-layers.js supplierFor), so
           this is the row answering about itself rather than a list kept here. */
        const rec = sup(id);
        out.push(entry(id, st.label == null ? id : String(st.label), (rec && rec.fetch) ? 'features' : 'grid', null));
      }
      return out;
    }

    /* ⚠⚠⚠ (#R783) FOUR FACTS THAT USED TO ARRIVE AS ONE BOOLEAN. js/gis-layers.js canSample() was
       `state(id).on`, and js/gis-atlas.js publishes it to the planner as `samplable` — so 「その
       レイヤーは値を訊けるか」 was answered by a checkbox. The four are separated at their claimants:
       js/gis-layers.js measures the row's ABILITY (and says null while nobody has asked), this file
       owns 「表示していなくてもデータが在るか」 (needsVisible, already computed above), and only
       `visible` is about the reader's checkbox.
       ⚠ A REGISTERED region() IMPLEMENTATION IS THE CAPABILITY ITSELF, synchronously: a supplier that
       answers for a whole window does not go through the registry's per-point door at all. */
    function samplingOf(id, needs) {
      const rec = sup(id);
      const L = LAYERS();
      let said = null;
      try { said = (L && typeof L.samplingOf === 'function') ? L.samplingOf(id) : null; } catch (_) { said = null; }
      const st = stateOf(id);
      const visible = !!(st && st.on);
      const capable = (rec && rec.region) ? true : (said ? said.capable : null);
      /* 「訊けなくても在る」 と 「表示が要る」 と 「わからない」: needsVisible is three-valued already,
         and flattening its null into false here would be this file undoing its own distinction. */
      const prepared = (needs === true) ? false : ((needs === false) ? true : null);
      return {
        capable: capable,
        prepared: prepared,
        /* いま訊けるか — the door has to be there, the row must not be known to be mute, and the data
           has to be either prepared or on screen. null stays null: an unmeasured row is a candidate. */
        available: (capable === false) ? false : (((rec && rec.region) || (said && said.door)) ? (prepared !== false || visible) : false),
        visible: visible,
      };
    }

    function entry(id, title, kind, featureRow) {
      const d = declarationOf(id);
      const st = stateOf(id);
      const stated = statedTime(id);
      const needs = needsVisible(id, kind, st, featureRow, d);
      return {
        id: id,
        title: title,
        kind: kind,
        /* (#R783) 能力・準備・可用・表示 — four values, because one of them used to stand for all */
        sampling: samplingOf(id, needs),
        /* ⚠ null IS 「宣言が無い」, NOT 「生きていない」 — the same distinction js/gis-raster.js draws
           for `nodata`. Nothing reachable from here can watch a source refresh itself. */
        live: d ? d.live : null,
        needsVisible: needs,
        /* The extent its supplier DECLARED, or null. ⚠ NOT the bounding box of what came back: that
           is a statement about today's contents, and reading it as an extent is exactly how 「いま
           画面にあるもの」 becomes 「そのレイヤーの範囲」. What was actually served is in
           coverage.served, per acquisition, where it belongs. */
        bounds: d && d.extent ? copyBox(d.extent) : null,
        resolution: d ? d.resolution : null,
        asOf: (d && d.asOf) || (momentOf(stated) ? stated : null),
      };
    }

    /* ⚠ THREE ANSWERS, AND THE THIRD IS null. A field is loaded by the layer that draws it when that
       layer is switched on (docs/GIS-CORE.md §5.1 records the measurement: sampling one that is off
       answers null for every pixel), so a grid candidate needs its layer visible unless its supplier
       declared otherwise. A feature row that is OFF and still handed features over has just proved it
       does not (false). A row that is ON cannot be asked the question at all without switching it off
       behind the reader's back — so it is null, and region() MEASURES it at the moment it matters. */
    function needsVisible(id, kind, st, featureRow, d) {
      if (d && d.viewBound === true) return true;
      /* ⚠ (#R752) false BECAUSE AN IMPLEMENTATION EXISTS, not because of what it is called. A
         registered fetch answers out of its supplier's own store; the renderer is not in the path, so
         switching the layer off removes the drawing and not the data. */
      if (sup(id)) return false;
      const on = !!(st && st.on);
      if (kind === 'grid') return d && d.extent ? null : true;
      if (on) return null;
      return !(featureRow && typeof featureRow.count === 'number' && featureRow.count > 0);
    }

    function entryFor(id) {
      const key = String(id == null ? '' : id);
      const all = list();
      for (const e of all) if (e.id === key) return e;
      return null;
    }

    /* ── coverage: the one value this file adds ───────────────────────────────────────────────── */

    /* ⚠ ORDERED, AND THE ORDER IS THE ARGUMENT. The first rule that holds decides, because each one
       is a stronger statement about the answer than the ones below it: a truncated list is a sample
       whatever else is true of its supplier; a field burnt at a chosen resolution is a sample even if
       its supplier declared the whole world; a supplier that keeps only the view cannot be complete
       over a window larger than the view. `all` is what is left when nothing was left out — never a
       default, and never reachable without a declaration (see the header). */
    function coverageOf(m) {
      const requested = {
        bbox: m.requestedBox ? copyBox(m.requestedBox) : null,
        time: m.requestedTime == null ? null : m.requestedTime,
        limit: isPosInt(m.limit) ? m.limit : null,
        fields: Array.isArray(m.fields) ? m.fields.slice() : null,
        /* the conditions the answer was narrowed by, carried so 「この平均は何の平均か」 has an
           answer in the record and not only in the call that is already over */
        where: Array.isArray(m.where) ? m.where.map((c) => ({ field: c.field, op: c.op, value: c.value })) : null,
        cursor: m.cursor === undefined ? null : m.cursor,
      };
      const base = {
        requested: requested,
        served: m.servedBox ? copyBox(m.servedBox) : null,
        count: (typeof m.count === 'number') ? m.count : null,
        asOf: m.asOf == null ? null : m.asOf,
        resolution: m.resolution === undefined ? null : m.resolution,
        /* ⚠ THREE-VALUED, AND null IS THE POINT (#R752): true 「まだ続きがある」, false 「これで終わり
           だと供給元が述べた」, null 「供給元は何も述べていない」. A reader that treats the absence of a
           cursor as exhaustion is making the claim the supplier declined to make. */
        continues: (m.continues === undefined) ? null : m.continues,
        /* ⚠ (#R783) WHO EXECUTED THE ATTRIBUTE CONDITIONS, SAID BY WHOEVER DID IT — null when none
           were asked for. This used to read `'supplier'` from the REQUEST alone ("conditions were
           named, and a supplier that cannot execute them is refused at the door, therefore the
           supplier executed them"), and the middle step was false: js/gis-layers.js's loader road
           declared `where:true` and applied nothing, so the record said `filteredBy:'supplier'` over
           an unfiltered answer. A declaration is a claimant, not a proof — the same argument `all`
           is built on, one field along. So the executor states it, and its statement is carried;
           silence from a supplier that was handed conditions is still reported as 'supplier'
           (the door refused every other kind), which is the one thing here that is inferred. */
        filteredBy: (Array.isArray(m.where) && m.where.length) ? (m.filteredBy || 'supplier') : null,
        /* ⚠⚠⚠ (#R819) WHICH ROAD ANSWERED, IN THE RECORD, ALWAYS. The two roads are not two
           implementations of one thing: a supplier answers out of its own store, and the delegated
           road answers out of what the RENDERER is holding — a population a reader changes by
           panning. That distinction was computed on every acquisition (`m.supplied`) and then
           thrown away, so 「この平均は何の平均か」 could not be answered even in principle by a
           record that had the fact in its hands. It is the same argument `coverage` itself is
           written for, one field along. ⚠ IT IS NOT A VERDICT: a renderer answer over a row that
           declared a complete, non-live holding is as good as any, and coverage.reason is where
           that is judged (see VIEW_DEPENDENT below, which is the judgement). */
        answeredBy: (m.supplied === true) ? 'supplier' : 'renderer',
      };
      const say = (completeness, reason, extra) => {
        const out = Object.assign({ completeness: completeness, reason: reason }, base);
        if (extra) Object.assign(out, extra);
        return out;
      };
      const d = m.declaration || null;

      /* ⚠ THE WINDOW A CALLER DID NOT NARROW IS THE WORLD, and it is measured as the world here: a
         supplier declaring one country, asked for 「everything」, has not answered everything. */
      const reqBox = m.requestedBox || WHOLE_WORLD;

      if (m.truncated) return say('sample', 'limit-truncated', { available: m.available == null ? null : m.available });
      if (m.kind === 'grid') return say('sample', 'grid-is-a-sample');
      /* ⚠ (#R752) THE SUPPLIER SAID IT ITSELF, IN ONE OF TWO WAYS. A cursor handed back is 「この窓には
         まだ続きがある」; so is an `available` larger than what actually arrived, when no limit of the
         caller's cut it. Both come from the one party that can know, and they outrank every
         declaration below: a supplier may hold the whole world and still have given one page of it.
         ⚠ THE SECOND IS THE CLAIM CHECKED AGAINST THE ANSWER — the count it stated next to the count
         it handed over — which is why a `complete:true` on that same answer does not survive it. */
      if (m.continues === true || m.shortOfStated) return say('partial', 'supplier-page-incomplete', { available: m.available == null ? null : m.available });
      if (d && d.viewBound) return say('partial', 'supplier-view-bound');
      if (d && d.extent && !contains(d.extent, reqBox)) return say('partial', 'extent-narrower-than-request');
      /* The same fact with a different claimant: the answer's OWN statement of what it served. */
      if (m.servedStated && m.servedBox && !contains(m.servedBox, reqBox)) return say('partial', 'extent-narrower-than-request');
      /* ⚠ COMPLETENESS HAS TWO CLAIMANTS AND BOTH ARE THE SUPPLIER: what it declared once about its
         holdings, and what THIS answer says about itself. Neither is inferred from anything here. */
      const complete = (m.answerComplete === true) || !!(d && d.complete);
      if (!complete) return say('partial', !d ? (m.viewEvidence ? 'indistinguishable-from-view' : 'extent-undeclared') : 'completeness-undeclared');
      /* ⚠ (#R752) A DECLARATION IS NOT BELIEVED WITHOUT BEING LOOKED AT. When a `complete` claim is
         what stands between this answer and `all`, and the supplier hands over no more for the whole
         window than it does for a camera strictly inside it, the claim is not contradicted — but it
         also cannot be told apart from a holding that is refreshed for the view, which is the one
         thing `all` must not be confused with. ⚠ A supplier that declared `live:false` is exempt and
         the exemption is its own statement: a static holding is not refreshed for a camera. */
      if (m.viewEvidence && m.answerComplete !== true) return say('partial', 'declaration-unconfirmed-by-view');
      /* ⚠ A TIME THAT WAS ASKED FOR AND NOT ESTABLISHED IS NOT AN `all`. Handing back today's ships
         for a question about 1889 with `completeness:'all'` would be a claim nobody made — the
         defect .agents/rules/historical-verification.md §2-3 names. */
      if (m.requestedTime != null && !m.timeEstablished) return say('partial', 'time-not-established');
      /* ⚠ AND 「続きは無い」 IS A STATEMENT SOMEBODY HAS TO MAKE. A supplier that answered a page and
         said nothing about continuation has left the question open; reading its silence as the end of
         the list is exactly the absent-field-as-answer shape this file exists to stop. */
      if (m.supplied && m.continues == null && m.answerComplete !== true) return say('partial', 'continuation-unstated');
      return say('all', null);
    }

    /* ── measured: is everything this supplier holds already on screen? ───────────────────────── */

    function cameraBox() {
      const E = GE();
      try {
        const b = E && E.camera && E.camera.getBounds ? E.camera.getBounds() : null;
        const box = asBox(b);
        return finiteBox(box) ? box : null;
      } catch (_) { return null; }
    }

    /* Returns true when the supplier hands over no more for the WORLD than it does for the camera —
       see the header for why that is reported as `indistinguishable-from-view` and not as a verdict.
       ⚠ TAKEN ONLY WHEN IT CAN DISCRIMINATE: against a camera that already sees the world every
       supplier passes this test trivially, and a trivially-passed test is a measurement of nothing. */
    function viewEvidence(id, servedCount, win) {
      const cam = cameraBox();
      if (!cam) return false;
      /* ⚠ (#R752) THE COMPARISON IS AGAINST THE WINDOW THAT WAS ASKED FOR, not against the world.
         A camera that already covers the window can hold everything the supplier has for a reason
         that has nothing to do with the supplier, and a test every supplier passes measures nothing.
         (For the world window this is the same test as before: a camera narrower than 360×180.) */
      const w = win || WHOLE_WORLD;
      if (!(cam.w > w.w || cam.s > w.s || cam.e < w.e || cam.n < w.n)) return false;
      const L = LAYERS();
      if (!L || typeof L.read !== 'function') return false;
      let inView;
      try { inView = L.read(id, { bounds: [[cam.w, cam.s], [cam.e, cam.n]] }); } catch (_) { return false; }
      if (!inView || !inView.ok || !Array.isArray(inView.features)) return false;
      return inView.features.length >= servedCount;
    }

    /* ── features(): the synchronous door ─────────────────────────────────────────────────────── */

    /* ⚠ SYNCHRONOUS ON PURPOSE. js/gis-layers.js's toDataset() is called from a click handler in
       js/gis-panel.js and from js/gis-atlas.js without an await, and it has been synchronous since
       #R732; making it async to fit a uniform door would change a shipped contract for the sake of
       symmetry. acquire() below is the async door, and it dispatches to this one. */
    function features(id, req) {
      const o = req || {};
      const key = String(id == null ? '' : id);
      const prep = prepare(key, o);
      if (!prep.ok) return prep;
      const rec = sup(key);
      if (rec && rec.fetch) {
        /* ⚠ THE ASYNC SUPPLIER IS REFUSED RATHER THAN CALLED AND ABANDONED. Starting a fetch whose
           promise this door cannot wait for would send the request, spend the quota and throw the
           answer away — and then return something else as if it were the answer. */
        if (!rec.sync) return refuse('supplier-is-async', { id: key, use: 'acquire' });
        let ans;
        try { ans = askSupplier(rec, prep, o); } catch (e) { return refuse('supplier-failed', { id: key, message: e && e.message }); }
        if (ans && typeof ans.then === 'function') return refuse('supplier-answer-invalid', { id: key, expected: 'synchronous' });
        return analysed(key, o, fromSupplier(key, rec, prep, o, ans));
      }
      return analysed(key, o, delegated(key, prep, o));
    }

    /* ⚠ (#R752) THE ASYNC TWIN, AND IT IS NOT A COPY. Everything either door does other than waiting
       is in prepare() / askSupplier() / fromSupplier() / delegated(), because two spellings of
       「求めたもののどれだけが返ったのか」 would drift and the drift would be invisible: both answers
       look like a coverage. */
    async function fetchFeatures(key, o) {
      const prep = prepare(key, o);
      if (!prep.ok) return prep;
      const rec = sup(key);
      if (rec && rec.fetch) {
        let ans;
        try { ans = await askSupplier(rec, prep, o); } catch (e) { return refuse('supplier-failed', { id: key, message: e && e.message }); }
        return analysed(key, o, fromSupplier(key, rec, prep, o, ans));
      }
      return analysed(key, o, delegated(key, prep, o));
    }

    /* What both doors have to establish before anybody is asked anything. ⚠ THE TWO CAPABILITY GATES
       ARE HERE AND NOT AT THE CALL SITES: a `where` or a `cursor` that nothing can execute is refused
       BEFORE a fetch happens, so no supplier is ever handed a condition it will silently drop. */
    function prepare(key, o) {
      const rec = sup(key);
      const L = LAYERS();
      if (!(rec && rec.fetch) && (!L || typeof L.read !== 'function')) return refuse('map-unavailable', { needs: 'IntMapGisLayers' });

      let requestedBox = null;
      if (o.bbox != null) {
        requestedBox = asBox(o.bbox);
        /* A bounds that cannot be read is not 「no bounds」 — treating it as 「everything」 answers a
           different question, silently and with real data (js/gis-layers.js says the same). */
        if (!finiteBox(requestedBox)) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      }
      const w = readWhere(o.where);
      if (!w.ok) return w;
      if (w.where && !(rec && rec.fetch && rec.can.where)) return refuse('where-not-supported', { id: key, needs: 'supply().where' });
      const cursor = (o.cursor === undefined || o.cursor === null) ? null : o.cursor;
      if (cursor != null && !(rec && rec.fetch && rec.can.cursor)) return refuse('cursor-not-supported', { id: key, needs: 'supply().cursor' });

      return {
        ok: true,
        requestedBox: requestedBox,
        win: requestedBox || WHOLE_WORLD,
        where: w.where,
        limit: isPosInt(o.limit) ? o.limit : null,
        cursor: cursor,
      };
    }

    /* The whole question, in the supplier's own vocabulary. ⚠ `limit` IS PASSED ONLY TO A SUPPLIER
       THAT CLAIMS IT. One that does not gets no limit and is cut here afterwards — which is the same
       answer as before this round, and a truthful `available` besides. */
    function askSupplier(rec, prep, o) {
      return rec.fetch({
        bbox: prep.requestedBox ? copyBox(prep.requestedBox) : null,
        time: o.time == null ? null : o.time,
        where: prep.where,
        fields: (Array.isArray(o.fields) && o.fields.length) ? o.fields.map(String) : null,
        limit: rec.can.limit ? prep.limit : null,
        cursor: prep.cursor,
        signal: (o.ctx && o.ctx.signal) || o.signal || null,
        onProgress: (o.ctx && o.ctx.onProgress) || o.onProgress || null,
      });
    }

    /* ⚠ THE SUPPLIER STATES OBSERVATIONS; THIS FILE STILL DECIDES THE VERDICT. What is taken from its
       `coverage` is what only it can know — the box it served, how many were there, when it is, and
       whether THIS answer holds the whole window — and every one of those is then run through the
       same coverageOf() the delegated path uses. A supplier cannot write `completeness:'all'` into an
       answer; it can only state facts that reach it. */
    function fromSupplier(key, rec, prep, o, ans) {
      if (!ans || typeof ans !== 'object') return refuse('supplier-answer-invalid', { id: key, got: (ans === null ? 'null' : typeof ans) });
      if (ans.ok !== true) {
        /* Its own refusal, in its own words, passed through — a supplier that says `rate-limited`
           has told the reader more than any code this file could substitute. */
        if (ans.ok === false && ans.why) return ans;
        return refuse('supplier-answer-invalid', { id: key, got: 'not-ok' });
      }
      if (!Array.isArray(ans.features)) return refuse('supplier-answer-invalid', { id: key, expected: 'features' });

      const stated = (ans.coverage && typeof ans.coverage === 'object') ? ans.coverage : null;
      /* 「続きがある」 only when it was SAID. An absent `next` is silence; `next:null` is the supplier
         stating there is no more, and the two are told apart by the property being there at all. */
      const said = Object.prototype.hasOwnProperty.call(ans, 'next');
      const nextCursor = (said && ans.next != null) ? ans.next : null;
      const continues = said ? (nextCursor != null) : null;

      let out = ans.features;
      const arrived = out.length;
      let available = (stated && typeof stated.available === 'number') ? stated.available : null;
      let truncated = false;
      if (prep.limit != null) {
        if (rec.can.limit) {
          /* it applied the limit: what was cut is what it says was there, or the cursor it handed back */
          truncated = (continues === true) || (available != null && available > arrived);
        } else if (arrived > prep.limit) {
          out = out.slice(0, prep.limit);
          truncated = true;
          if (available == null) available = arrived;
        }
      }
      if (available == null && !truncated) available = arrived;
      if (!rec.can.fields && Array.isArray(o.fields) && o.fields.length) out = project(out, o.fields);

      let servedBox = null;
      if (stated && stated.served != null) {
        const b = asBox(stated.served);
        if (finiteBox(b)) servedBox = copyBox(b);
      }

      const d = declarationOf(key);
      const layerStated = statedTime(key);
      const moment = momentOf(layerStated);
      const supTime = (stated && stated.time != null && stated.time !== '') ? String(stated.time) : null;
      const coverage = coverageOf({
        kind: 'features',
        requestedBox: prep.requestedBox, servedBox: servedBox || servedBoxOf(prep.win, d), servedStated: !!servedBox,
        requestedTime: o.time == null ? null : o.time,
        /* the supplier answering FOR that time establishes it; so does the layer's own sentence when
           it reads as a moment — the same two-claimant rule completeness has */
        timeEstablished: o.time != null && ((supTime != null && supTime === String(o.time)) || (moment != null && layerStated === String(o.time))),
        limit: prep.limit, fields: Array.isArray(o.fields) ? o.fields : null,
        where: prep.where, cursor: prep.cursor,
        /* what the supplier said about having executed them (#R783) */
        filteredBy: (stated && stated.filteredBy != null) ? String(stated.filteredBy) : null,
        count: out.length, available: available, truncated: truncated,
        /* 「窓に在ったと供給元が述べた件数」 > 「実際に渡ってきた件数」, with no limit of the caller's
           to explain it: the answer is a part of the window, whatever else the answer claims. */
        shortOfStated: (available != null && available > out.length && !truncated),
        asOf: (stated && stated.asOf != null) ? String(stated.asOf) : (supTime || (moment ? layerStated : null)),
        resolution: (stated && stated.resolution !== undefined) ? stated.resolution : 'none',
        declaration: d,
        answerComplete: !!(stated && stated.complete === true),
        supplied: true, continues: continues,
        /* the camera measurement is about what the RENDERER holds; a supplier that never touches it
           cannot be measured that way, and pretending otherwise would be a number about nothing */
        viewEvidence: false,
      });
      return { ok: true, kind: 'features', features: out, coverage: coverage, next: nextCursor };
    }

    /* The road every layer in this app actually travels: js/gis-layers.js's read(). Unchanged. */
    function delegated(key, prep, o) {
      const L = LAYERS();
      const requestedBox = prep.requestedBox, win = prep.win;
      const r = L.read(key, requestedBox ? { bounds: [[win.w, win.s], [win.e, win.n]] } : {});
      if (!r.ok) {
        /* ⚠ 「訊けなかった」 と 「0 件だった」 を同じ答えにしない. A supplier whose layer is switched
           off has not answered 「そこには何も無い」 — it has not been asked, because the module that
           loads its contents does so when the layer comes on. */
        if (r.why === 'no-features' && isOff(key)) return refuse('layer-not-visible', { id: key, from: (r.detail && r.detail.from) || null });
        return r;
      }

      let out = r.features;
      const available = out.length;
      let truncated = false;
      const limit = prep.limit;
      if (limit != null && out.length > limit) { out = out.slice(0, limit); truncated = true; }
      if (Array.isArray(o.fields) && o.fields.length) out = project(out, o.fields);

      const stated = statedTime(key);
      const moment = momentOf(stated);
      const d = declarationOf(key);
      /* ⚠ (#R752) THE MEASUREMENT IS ALSO TAKEN WHEN A DECLARATION CLAIMS COMPLETENESS — that is the
         case where `all` is actually at stake. `live:false` is the supplier saying its holding is not
         refreshed for a camera, and that statement is what makes the measurement unnecessary. */
      const claimAtStake = !!(d && d.complete && !d.viewBound && d.live !== false);
      const coverage = coverageOf({
        kind: 'features',
        requestedBox: requestedBox, servedBox: servedBoxOf(win, d),
        requestedTime: o.time == null ? null : o.time,
        timeEstablished: o.time != null && moment != null && String(o.time) === stated,
        limit: limit, fields: Array.isArray(o.fields) ? o.fields : null,
        where: null, cursor: null, supplied: false, continues: undefined, answerComplete: false,
        count: out.length, available: available, truncated: truncated,
        asOf: moment ? stated : null,
        /* SIMPLIFICATION, and there is none: read() hands geometry over whole (js/gis-layers.js §
           WHAT IS READ IS WHAT IS THERE), so the honest value is 'none' rather than null — null here
           would read as 「測れなかった」, which is a different statement. */
        resolution: 'none',
        declaration: d,
        viewEvidence: (!d || claimAtStake) ? viewEvidence(key, available, win) : false,
      });
      return { ok: true, kind: 'features', features: out, coverage: coverage };
    }

    function servedBoxOf(win, d) {
      if (d && d.extent) return intersectBox(win, d.extent);
      return win;
    }

    function isOff(id) { const s = stateOf(id); return !!(s && s.on === false); }

    /* (#R783) the capability store is js/gis-layers.js's — one place, and this is the party that
       asked. A kernel that is not mounted swallows the observation rather than throwing. */
    function noteSampling(id, answered) {
      const L = LAYERS();
      try { if (L && typeof L.noteSampling === 'function') L.noteSampling(id, answered); } catch (_) { }
    }

    /* A copy carrying only the properties the caller named. ⚠ A NEW OBJECT, not an edit: the feature
       objects belong to the renderer's source, and writing on them would change what the map draws.
       ⚠ A NAMED FIELD THAT THE FEATURE DOES NOT HAVE IS ABSENT, not null — a null would be a value
       the source never wrote, and js/gis-datasets.js reads an absent property as 「無い」. */
    function project(fs, fields) {
      const want = fields.map(String);
      return fs.map((f) => {
        const p = (f && f.properties) || {};
        const kept = {};
        for (const k of want) if (Object.prototype.hasOwnProperty.call(p, k)) kept[k] = p[k];
        return { type: 'Feature', properties: kept, geometry: (f && f.geometry) || null };
      });
    }

    /* ── region(): a field read as a region, not a pixel at a time ────────────────────────────── */

    /* ⚠ (#R749) THE OLD PATH ASKED `sampleAt` ONCE PER PIXEL AND REQUIRED THE LAYER TO BE ON.
       Both were stated as facts about the world and only one of them is: the contract really does
       have one position per call (so this door still makes one call per pixel — see
       js/gis-raster.js's fromSamplerAsync note on why a bulk parameter here would be an export with
       no caller), but 「消えているレイヤーは値を持たない」 was an ASSUMPTION applied to every row.
       Some fields answer while their layer is off — a cached sampler, a field another module keeps
       loaded — and refusing them was refusing data that was there.
       ⇒ SO IT IS MEASURED: when the layer is off, the registry is probed, and the read proceeds as
       soon as it ANSWERS — `layer-not-visible` is kept for the row that answers nothing at all,
       「訊けなかった」 said as itself rather than returned as a grid of holes.
       ⚠⚠⚠ (#R774) AND 「ANSWERS」 MEANS A ROW CAME BACK, NOT A VALUE AT THE PROBED POINT. Reading a
       missing value as 「訊けなかった」 made the visibility of a layer change the answer to a question
       about DATA: a window whose only value sat in a corner was served with the layer on and refused
       with it off. The two are separated at the door they were merged at (js/map-ui.js sampleAt). */
    async function region(id, box, opts) {
      const o = opts || {};
      const key = String(id == null ? '' : id);
      const R = REG(), RS = RASTER();
      const rec = sup(key);
      const bulk = (rec && rec.region) ? rec : null;
      if (!RS || typeof RS.fromSamplerAsync !== 'function') return refuse('map-unavailable', { needs: 'IntMapGisRaster' });
      if (!bulk) {
        if (!R || typeof R.sampleAt !== 'function') return refuse('map-unavailable', { needs: 'sampleAt' });
        if (!entryFor(key)) return refuse('layer-unknown', { id: key });
      }

      const win = (box == null) ? copyBox(WHOLE_WORLD) : asBox(box);
      if (!finiteBox(win)) return refuse('bad-param', { param: 'bounds', value: box });
      if (!isPosInt(o.width)) return refuse('bad-param', { param: 'width', value: o.width });
      if (!isPosInt(o.height)) return refuse('bad-param', { param: 'height', value: o.height });
      if (!(win.e > win.w) || !(win.n > win.s)) return refuse('bad-param', { param: 'bounds', value: [win.w, win.s, win.e, win.n] });
      const wh = readWhere(o.where);
      if (!wh.ok) return wh;
      if (wh.where && !(bulk && rec.can.where)) return refuse('where-not-supported', { id: key, needs: 'supply().where' });

      /* ⚠ (#R752) ONE CALL INSTEAD OF width×height. The per-pixel walk below is what the registry's
         contract offers (one position, one answer) and it stays, because it is the only road for a
         supplier that registered nothing. A supplier that CAN answer for a whole window — a tile
         server, a decoded GeoTIFF, an upstream with a bbox parameter — says so with supply({region}),
         and then asking it a quarter of a million times would be a cost this file chose for it. */
      if (bulk) return fromSupplierRegion(key, bulk, win, box, o, wh.where);

      /* ⚠ (#R763) A BAND THIS ROAD CANNOT SELECT IS REFUSED BY NAME, NOT QUIETLY SERVED AS BAND 0.
         The registry's contract is one value at one position (js/map-ui.js sampleAt) — there is no
         second band to choose — so a caller naming one is asking a question this supplier cannot
         answer, and answering a DIFFERENT question with a complete-looking grid is the shape this
         layer refuses everywhere else. A supplier that CAN answer per band takes the bulk road above. */
      const bandAsk = (o.band && typeof o.band === 'object') ? o.band : {};
      if (bandAsk.index != null && Number(bandAsk.index) !== 0) {
        return refuse('band-not-selectable', { id: key, band: bandAsk.index, has: 1 });
      }

      const D = DATA();
      const asNum = (D && D.asNumber) ? D.asNumber : ((v) => (isNum(v) ? v : null));
      /* One position, through the registry's own door, with the answer for THIS row picked out of
         what it returns for all of them. */
      let textSeen = null, unitSeen = null;
      /* ⚠⚠⚠ (#R763) THE NUMBER IS ASKED FOR, AND THE SENTENCE IS ONLY THE FALLBACK. Every numeric
         layer on this map answered `value` as text with its unit written into it (「12.3°C」), and
         js/gis-datasets.js asNumber refuses that — correctly, because 「12 km」 is not twelve of
         anything this file knows. So the read below asked the one question that could not succeed.
         The registry now carries `number` and `unit` beside the sentence for any row that MEASURED
         (js/map-ui.js sampleAt), and this reads that first. ⚠ asNumber STAYS as the second road: a
         row that only composes text may still be composing a bare number, and dropping that would
         refuse data that is there. ⚠ AND NOTHING IS PARSED OUT OF THE SENTENCE — a unit stripped off
         a string is a unit nobody stated. */
      /* ⚠⚠⚠ (#R774) 「行が返ったか」 IS A SEPARATE FACT FROM 「値が在ったか」, AND THE PROBE BELOW
         NEEDS THE FIRST. It is written by every call and read only by the probe, which checks it
         immediately after the call it belongs to — so it is that call's answer and not a tally. */
      let sawRow = false, anyRow = false;
      async function sampleOne(lng, lat) {
        let got;
        /* ⚠ A THROWN REGISTRY IS NOT A HOLE IN THE FIELD. This returned null, which js/gis-raster.js
           counts as `empty` — so its `failed` counter, which exists precisely to keep 「取得に失敗した」
           apart from 「そこには値が無い」, was structurally always 0. Re-thrown, it is counted. */
        try { got = await R.sampleAt(lng, lat, [key]); } catch (e) { sawRow = false; throw e; }
        const hit = Array.isArray(got) ? got.find((x) => x && String(x.id) === key) : null;
        sawRow = !!hit;
        if (hit) anyRow = true;
        if (!hit) return null;
        /* The row said it was asked and could not answer — a failure, not an absence. */
        if (hit.failed === true) throw new Error('layer-sample-failed');
        if (typeof hit.number === 'number' && isNum(hit.number)) {
          if (unitSeen == null && hit.unit != null && hit.unit !== '') unitSeen = String(hit.unit);
          return hit.number;
        }
        const v = asNum(hit.value);
        if (v == null && textSeen == null && hit.value != null && hit.value !== '') textSeen = String(hit.value);
        return v;
      }

      if (isOff(key)) {
        /* ⚠⚠⚠ (#R774) THE PROBE ASKS WHETHER THE SUPPLIER ANSWERS, NOT WHETHER THESE COORDINATES
           HAVE VALUES. Until this round it required a NUMBER at one of five fractions of the window,
           so a field holding a single populated pixel in a corner was refused `layer-not-visible`
           with the layer off and read normally with it on — THE SAME QUESTION ANSWERED DIFFERENTLY
           BY THE STATE OF A CHECKBOX. Widening the probe would only move that corner
           (.agents/rules/no-ad-hoc-hardcoding.md): five points or fifty, it is still one predicate
           standing in for another ([[intmap-proxy-predicate-freezes-the-wrong-diagnosis]]).
           ⇒ WHAT IS MEASURED IS WHETHER A ROW COMES BACK. js/map-ui.js's sampleAt returns a row for
           every registration it actually asked, with a value only when there was one, so 「訊けた」
           and 「そこに値があった」 are now two different observations and this reads the first.
           A row — with or without a value — ends the probe and the whole window is read; the window
           then answers for itself, and a genuinely empty one is refused `layer-values-all-missing`,
           which is a different fact with its own sentence in js/gis-panel.js.
           ⚠ ALL FIVE THROWING IS STILL `layer-sample-failed`: 「訊いて落ちた」 is neither. */
        let answered = false, threw = 0;
        for (const f of PROBE_POINTS) {
          try { await sampleOne(win.w + (win.e - win.w) * f[0], win.s + (win.n - win.s) * f[1]); } catch (_) { threw++; continue; }
          if (sawRow) { answered = true; break; }
        }
        /* ⚠ (#R783) THE OBSERVATION IS KEPT, NOT DISCARDED AT THE END OF THE CALL. 「この行は訊いたら
           行を返すか」 is the capability js/gis-layers.js canSample() used to answer out of the
           checkbox; it cannot be measured synchronously (this door is async because sampleAt is), so
           the party that DID ask hands its answer back. ⚠ Only when the probe is conclusive: all five
           throwing is 「訊いて落ちた」, which is not 「能力が無い」. */
        if (answered || threw !== PROBE_POINTS.length) noteSampling(key, answered);
        if (!answered) return refuse(threw === PROBE_POINTS.length ? 'layer-sample-failed' : 'layer-not-visible', { id: key, probes: PROBE_POINTS.length });
      }

      const st = stateOf(key);
      const bandSpec = (o.band && typeof o.band === 'object') ? o.band : {};
      const baked = await RS.fromSamplerAsync({
        bounds: [win.w, win.s, win.e, win.n],
        width: o.width, height: o.height,
        band: {
          name: bandSpec.name != null ? bandSpec.name : ((st && st.label) || key),
          unit: bandSpec.unit == null ? null : bandSpec.unit,
          nodata: bandSpec.nodata,
        },
        sample: sampleOne,
        signal: o.signal || null,
        onProgress: o.onProgress || null,
      });
      if (!baked.ok) return baked;
      /* (#R783) the whole window was asked: whether a row ever came back is now known for certain,
         whatever the values were — see the probe above for who reads it. */
      noteSampling(key, anyRow);
      /* ⚠ A GRID WITH NO NUMBERS IN IT IS NOT A GRID, and what the layer DID answer with is the
         sentence the reader needs: a field answering 「12 °C」 has values, it just does not have them
         as numbers, and that is a different thing to fix. */
      /* ⚠⚠ (#R763) THE UNIT IS THE LAYER'S OWN STATEMENT, CARRIED — NOT MEASURED AND NOT INVENTED.
         The caller's declaration wins where it made one (it describes the record it asked for);
         otherwise the band takes the unit the registration stated alongside its numbers. Without it
         the grid arrives unitless and js/gis-ops.js fieldStatements has nothing to carry, which is
         how 「人口 12」 gets reported for a band of people per km². */
      if (bandSpec.unit == null && unitSeen != null && baked.raster && baked.raster.bands && baked.raster.bands[0]) {
        baked.raster.bands[0].unit = unitSeen;
      }
      /* ⚠⚠⚠ (#R763) THREE ANSWERS THAT USED TO BE ONE CODE. 「文字列だった」, 「全部欠損だった」 and
         「全部失敗した」 are different things to fix, and the reader was told the first about all
         three — js/gis-panel.js prints a sentence saying the layer answers with text rather than
         numbers, which is simply false for a window of open ocean. The counts come from
         js/gis-raster.js, which has kept them apart all along and had nobody asking.
         ⚠ A WINDOW OF REAL NoData IS STILL REFUSED (an empty grid is not a grid to compute on) but
         it is refused as what it is, so a caller widens the window instead of hunting a defect. */
      if (!baked.filled) {
        const seen = (baked.textSeen != null) ? baked.textSeen : textSeen;
        if (seen != null) return refuse('layer-values-not-numeric', { id: key, sample: seen });
        if (baked.failed > 0) return refuse('layer-sample-failed', { id: key, failed: baked.failed, empty: baked.empty });
        /* ⚠⚠⚠ (#R774) AND 「誰も答えなかった」 IS NOT 「どこにも値が無かった」, WITH THE LAYER ON
           EITHER. The probe above only runs for a switched-off row, so a row with no sampler at all
           used to be `layer-not-visible` while it was off and `layer-values-all-missing` while it
           was on — the same silence named twice, by the state of a checkbox. The whole read knows
           which it was: not one position handed back a row. */
        if (!anyRow) return refuse('layer-not-visible', { id: key, asked: baked.empty });
        return refuse('layer-values-all-missing', { id: key, empty: baked.empty });
      }

      const stated = statedTime(key);
      const moment = momentOf(stated);
      const g = baked.raster.grid;
      const coverage = coverageOf({
        kind: 'grid',
        requestedBox: (box == null) ? null : copyBox(win), servedBox: win,
        requestedTime: o.time == null ? null : o.time,
        timeEstablished: o.time != null && moment != null && String(o.time) === stated,
        count: baked.filled,
        asOf: moment ? stated : null,
        resolution: { pixelLng: g.pixelLng, pixelLat: g.pixelLat, width: baked.raster.width, height: baked.raster.height },
        declaration: declarationOf(key),
      });
      return { ok: true, kind: 'grid', grid: baked.raster, filled: baked.filled, empty: baked.empty, failed: baked.failed, coverage: coverage };
    }

    /* ── region(), answered by the supplier in one block ──────────────────────────────────────── */

    /* {ok, cells, nodata?, band?, coverage?} — `cells` is width×height values in the order the grid
       is written in, first row NORTH, one row after another. ⚠ NO PIXEL GEOMETRY IS COMPUTED HERE.
       js/gis-raster.js owns 「その窓・その解像度はどう格子になるか」 (samplerGrid), so the grid and its
       buffer are built by its own door and this function only fills the buffer it was handed — a
       second copy of that arithmetic is how a block ends up half a pixel off its own window.
       ⚠ THE WALK fromSampler DOES HERE ANSWERS NOTHING (the sampler returns null and every cell is
       overwritten below). It is the price of not owning the grid, it touches no I/O, and it is paid
       once per region instead of once per pixel against the upstream. */
    async function fromSupplierRegion(key, rec, win, box, o, where) {
      let ans;
      try {
        ans = await rec.region({
          bbox: copyBox(win), width: o.width, height: o.height,
          band: (o.band && typeof o.band === 'object') ? o.band : null,
          time: o.time == null ? null : o.time,
          where: where,
          signal: o.signal || null,
          onProgress: o.onProgress || null,
        });
      } catch (e) { return refuse('supplier-failed', { id: key, message: e && e.message }); }
      if (!ans || typeof ans !== 'object') return refuse('supplier-answer-invalid', { id: key, got: (ans === null ? 'null' : typeof ans) });
      if (ans.ok !== true) {
        if (ans.ok === false && ans.why) return ans;
        return refuse('supplier-answer-invalid', { id: key, got: 'not-ok' });
      }
      const cells = ans.cells;
      const n = o.width * o.height;
      const len = (cells && typeof cells.length === 'number') ? cells.length : null;
      /* ⚠ A BLOCK OF THE WRONG SIZE IS NOT A SMALLER ANSWER. Which pixels it was would be a guess,
         and a guess written into a grid is a map of somewhere else. */
      if (len !== n) return refuse('supplier-answer-invalid', { id: key, expected: 'cells', cells: n, got: len });

      const st = stateOf(key);
      const bandSpec = (o.band && typeof o.band === 'object') ? o.band : {};
      const supBand = (ans.band && typeof ans.band === 'object') ? ans.band : {};
      const baked = RASTER().fromSampler({
        bounds: [win.w, win.s, win.e, win.n], width: o.width, height: o.height,
        band: {
          name: (bandSpec.name != null) ? bandSpec.name : ((supBand.name != null) ? supBand.name : ((st && st.label) || key)),
          unit: (bandSpec.unit != null) ? bandSpec.unit : ((supBand.unit == null) ? null : supBand.unit),
          /* the caller's declaration, then the supplier's; `nodata` is a statement about what the
             numbers MEAN, so it is never invented when neither of them made one */
          nodata: (bandSpec.nodata !== undefined) ? bandSpec.nodata : ((supBand.nodata !== undefined) ? supBand.nodata : ans.nodata),
        },
        sample: () => null,
      });
      if (!baked.ok) return baked;

      const data = baked.raster.read(0);
      const nodata = baked.raster.bands[0].nodata;
      /* 「このセルは欠損か」 is asked of js/gis-raster.js's published rule — the one that knows that
         ±Infinity is not a measurement and that 0 is one. */
      const miss = RASTER().missing;
      let filled = 0, empty = 0;
      for (let i = 0; i < n; i++) {
        const v = cells[i];
        const num = (typeof v === 'number') ? v : ((v == null || v === '') ? NaN : Number(v));
        if (isNum(num) && !miss(num, nodata)) { data[i] = num; filled++; }
        else { data[i] = NaN; empty++; }
      }
      if (!filled) return refuse('layer-values-not-numeric', { id: key, from: 'supplier', sample: null });

      const stated = (ans.coverage && typeof ans.coverage === 'object') ? ans.coverage : null;
      const layerStated = statedTime(key);
      const moment = momentOf(layerStated);
      const supTime = (stated && stated.time != null && stated.time !== '') ? String(stated.time) : null;
      const g = baked.raster.grid;
      let servedBox = null;
      if (stated && stated.served != null) { const b = asBox(stated.served); if (finiteBox(b)) servedBox = copyBox(b); }
      const coverage = coverageOf({
        kind: 'grid',
        requestedBox: (box == null) ? null : copyBox(win), servedBox: servedBox || win, servedStated: !!servedBox,
        requestedTime: o.time == null ? null : o.time,
        timeEstablished: o.time != null && ((supTime != null && supTime === String(o.time)) || (moment != null && layerStated === String(o.time))),
        where: where, cursor: null, supplied: true, continues: undefined,
        count: filled,
        asOf: (stated && stated.asOf != null) ? String(stated.asOf) : (supTime || (moment ? layerStated : null)),
        resolution: { pixelLng: g.pixelLng, pixelLat: g.pixelLat, width: baked.raster.width, height: baked.raster.height },
        declaration: declarationOf(key),
        answerComplete: !!(stated && stated.complete === true),
      });
      return { ok: true, kind: 'grid', grid: baked.raster, filled: filled, empty: empty, failed: 0, coverage: coverage };
    }

    /* ══ ⚠⚠⚠ (#R819) 「引数が在る」 と 「その条件で取れる」 は別の主張である ═══════════════════════
       Everything above is a contract: a request may name a window, a time, attribute conditions,
       columns, a count, a position. What the contract cannot say is whether the party at the other
       end can HONOUR any of it — and until this round the two were told apart in exactly one place
       (`where` is refused when nobody claims it) and nowhere else. The gap has two halves:

       ① A SUPPLIER THAT CANNOT FILTER IS NOT A SUPPLIER THAT CANNOT ANSWER. Refusing
          `where-not-supported` is right and stays right (a condition handed to something that drops
          it comes back as a complete-looking answer to a different question), but it is not the end
          of the road: a supplier that CAN serve the window can serve the window, and the conditions
          can run in a later stage over what it served. What was missing is the thing that says
          WHERE EACH CONDITION RUNS — plan() below — and the fact that this is only an answer when
          the earlier stage was EXHAUSTIVE. ⚠⚠⚠ 上流に件数制限があって全件取得できないなら、それは
          「条件を満たした検索」ではない: filtering a capped page is 「取れた分だけ」 wearing the
          clothes of an answer, and this file exists to stop precisely that. So the planned road
          pages by the supplier's own cursor, splits the window when the cap has no cursor, and when
          neither can reach the whole window it REFUSES (`plan-unsatisfiable`) instead of handing
          back a plausible number.
       ⚠ THE FILTER ITSELF IS NOT WRITTEN HERE. js/gis-ops.js's `filter` owns the comparison rules
          (this file already asks it for the operator vocabulary, and a second spelling of 「>= とは
          何か」 is the drift .agents/rules/no-ad-hoc-hardcoding.md forbids). What is written here is
          the PLAN — which conditions run upstream, which run after, over what input — and the
          acquisition that makes the later stage meaningful. The staged answer therefore comes back
          as `kind:'staged'` and never as `kind:'features'`: a reader that does not run the pending
          stage must not be able to mistake it for the answer.

       ② CAPABILITIES ARE MEASURED, NOT COLLECTED. supply()'s four booleans are the supplier's own
          statement, and a statement is a claimant rather than a proof — the argument `all` is built
          on, and the one #R783 measured a lie against (`where:true` over an unfiltered answer). So
          capabilitiesOf() DERIVES what the registration claims (nothing is listed here; an id has
          capabilities by being registered, not by being named) and measureCapabilities() ASKS,
          through the same doors a caller uses. auditCapabilities() puts the two side by side and
          names every place they disagree — which is what a check can fail on. */

    /* ⚠ THE NAMES, IN ONE PLACE, because three parties ask about them (the plan above, the
       measurement below, and any caller deciding whether a question can be answered at all).
       Each is a QUESTION about acquisition, and each is three-valued: true / false / null, where
       null is 「まだ測っていない・測れなかった」 and is never flattened into false. */
    const CAPABILITIES = [
      'offscreen',   /* 表示しなくても取得できるか */
      'window',      /* 利用者が指定した区域で取得できるか（求めた窓の外を返さないか） */
      'time',        /* 指定期間を扱えるか */
      'conditions',  /* 属性条件を上流で実行できるか */
      'boundedEnd',  /* 全件取得の終わりを確認できるか */
      'stableId',    /* 同じ地物を安定した ID で追えるか */
    ];

    /* ⚠ THE REASONS THAT MEAN 「母集団が画面に依存している（かもしれない）」. This is a judgement about
       THIS FILE'S OWN vocabulary, not a list of ids or of layers — every reason here is one the
       renderer road can produce, and each says the holding was, or may have been, assembled for the
       camera. A renderer answer with no reason (a row that declared a complete, non-live holding
       covering the window) is not in it, because there is nothing camera-shaped left about it. */
    const VIEW_DEPENDENT = [
      'supplier-view-bound',              /* it said so itself */
      'indistinguishable-from-view',      /* measured: everything it holds is on screen */
      'declaration-unconfirmed-by-view',  /* a completeness claim this camera cannot tell apart */
      'extent-undeclared',                /* nobody said what it holds, so 「画面の中身」 is not excluded */
    ];

    /* ⚠ 由来 (#R819): 窓の分割は四分木なので、深さ d はたかだか 4+16+…+4^d 回の上流問い合わせになる。
       64 は「深さ 3 まで」（4+16+64 = 84 を切る側）。⚠⚠ これは上限ではなく、呼び出し元が
       `maxRequests` を述べるまでの既定である（CONSTITUTION §5 / one-pass-or-a-reason §3）——
       使い切ったときに黙って切るのではなく `plan-unsatisfiable` として述べるので、予算は答えを
       縮めるのではなく「答えられなかった」を生む。失効条件: 呼び出し元が数を述べたらこの値は
       使われない。正本はこの 1 行。 */
    const DEFAULT_REQUEST_BUDGET = 64;

    /* GeoJSON's own identity member, and nothing else. A property that happens to be spelt `id` is
       a column; reading one as the feature's identity would be this file deciding which column
       names identity, which is the upstream's statement to make and not this one's. */
    function identityOf(f) { return (f && f.id != null) ? String(f.id) : null; }

    function quadrants(b) {
      const mx = (b.w + b.e) / 2, my = (b.s + b.n) / 2;
      return [
        { w: b.w, s: b.s, e: mx, n: my }, { w: mx, s: b.s, e: b.e, n: my },
        { w: b.w, s: my, e: mx, n: b.n }, { w: mx, s: my, e: b.e, n: b.n },
      ];
    }
    /* A window that can no longer be halved is not a window a split can help. ⚠ MEASURED AGAINST
       THE DOUBLE'S OWN PRECISION rather than against a chosen epsilon: the midpoint landing on an
       edge means the two halves are not two windows. */
    const splittable = (b) => (b.e - b.w) > 0 && (b.n - b.s) > 0 && (b.w + b.e) / 2 > b.w && (b.s + b.n) / 2 > b.s;

    /* ── plan(): where each condition runs, said before anything is fetched ───────────────────── */

    function plan(id, req) {
      const o = req || {};
      const key = String(id == null ? '' : id);
      const ent = entryFor(key);
      if (!ent) {
        if (!LAYERS() && !REG()) return refuse('map-unavailable', { needs: 'IntMapGisLayers' });
        return refuse('layer-unknown', { id: key });
      }
      const w = readWhere(o.where);
      if (!w.ok) return w;
      const asked = w.where || [];
      const rec = sup(key);
      const road = (rec && (rec.fetch || rec.region)) ? 'supplier' : 'renderer';
      /* ⚠ THE SPLIT IS THE SUPPLIER'S CLAIM, READ ONCE. A road that cannot execute conditions puts
         every one of them in the later stage; it does not execute some of them badly. */
      const canWhere = !!(rec && rec.fetch && rec.can.where);
      const upstream = canWhere ? asked.slice() : [];
      const post = canWhere ? [] : asked.slice();

      const requestedBox = (o.bbox == null) ? null : asBox(o.bbox);
      if (o.bbox != null && !finiteBox(requestedBox)) return refuse('bad-param', { param: 'bbox', value: o.bbox });

      const stages = [{
        at: road, does: 'fetch',
        bbox: requestedBox ? copyBox(requestedBox) : null,
        time: o.time == null ? null : o.time,
        where: upstream,
        fields: (Array.isArray(o.fields) && o.fields.length) ? o.fields.map(String) : null,
        limit: (rec && rec.can.limit && isPosInt(o.limit)) ? o.limit : null,
        cursor: (o.cursor === undefined || o.cursor === null) ? null : o.cursor,
      }];
      if (post.length) {
        stages.push({
          at: 'post', does: 'filter', where: post, input: 0,
          /* ⚠ NAMED, NOT IMPLEMENTED. The executor is the app's one filter; this says whose it is so
             the caller wires the same kernel a recipe replays through. */
          by: 'IntMapGisOps.run({op:"filter", params:{where}})',
        });
      }

      /* ⚠⚠⚠ WHEN THE PLAN CANNOT BE AN ANSWER, AND IT IS DECIDED HERE — BEFORE ANY DATA EXISTS TO
         BE PERSUASIVE. Cutting a list to N and THEN filtering answers 「上位 N 件のうち条件に合うもの」,
         which is not what was asked; resuming from a position in an unfiltered list and then
         filtering makes a page that is nobody's page. Both are 「取れた分だけ」 with extra steps. */
      let why = null;
      if (post.length && ent.kind !== 'features') why = 'grid-has-no-post-stage';
      else if (post.length && isPosInt(o.limit)) why = 'limit-precedes-filter';
      else if (post.length && o.cursor != null) why = 'cursor-precedes-filter';

      return {
        ok: true, id: key, kind: ent.kind, road: road,
        stages: stages,
        where: { asked: asked, upstream: upstream, post: post },
        /* 後段が在るなら、前段は窓を漏らさず取り切っていなければならない */
        exhaustive: post.length > 0 || o.exhaustive === true,
        satisfiable: !why,
        why: why,
      };
    }

    /* ── acquirePlanned(): the plan, executed, with what actually happened in the record ──────── */

    /* ⚠ THE UNION'S COVERAGE IS ITS WEAKEST PART. Sub-windows are acquired independently and a
       reader is given ONE answer, so a verdict composed by taking the best of them would be a
       claim about the parts that are not there. `sample` outranks `partial` for the same reason it
       does in coverageOf: it is a different kind of incompleteness, not a milder one. */
    function mergeCoverage(parts, m) {
      const worst = parts.find((c) => c.completeness === 'sample') || parts.find((c) => c.completeness !== 'all') || null;
      const continues = parts.every((c) => c.continues === false) ? false
        : (parts.some((c) => c.continues === true) ? true : null);
      const first = parts[0] || {};
      return Object.assign({}, first, {
        completeness: worst ? worst.completeness : 'all',
        reason: worst ? worst.reason : null,
        served: m.servedBox ? copyBox(m.servedBox) : (first.served || null),
        count: m.count,
        available: parts.reduce((a, c) => (typeof c.available === 'number' && a != null ? a + c.available : null), 0),
        continues: continues,
      });
    }

    /* The whole window, taken to the end — by the supplier's own continuation when it has one, and
       by dividing the window when the cap has no cursor. ⚠ EVERY REPEAT HERE FOLLOWS AN OBSERVED
       FACT (.agents/rules/one-pass-or-a-reason.md §5): a cursor the supplier handed over, or a
       count it stated that is larger than the rows it gave. Nothing is retried because it "might"
       have failed, each repeat asks a DIFFERENT question (the next page, a smaller window), and the
       number of requests is in the record. */
    async function exhaust(key, o, budget) {
      const rec = sup(key);
      const first = prepare(key, o);
      if (!first.ok) return first;
      const root = first.win;
      const seen = new Map();
      const windows = [], parts = [];
      let requests = 0, duplicates = 0, idless = 0;
      let done = true, why = null;

      const take = (fs) => {
        for (const f of fs) {
          const key2 = identityOf(f);
          if (key2 == null) idless++;
          /* ⚠ WITHOUT AN IDENTITY MEMBER THE ONLY HONEST KEY IS THE FEATURE ITSELF. Two windows
             overlap on their shared edge, so a boundary feature really does arrive twice; dropping
             by structure keeps the count right, and `dedupBy` says which rule was used so a reader
             is never told 「同じ地物」 was decided by something it did not agree to. */
          const k = (key2 != null) ? ('#' + key2) : ('~' + JSON.stringify([f && f.geometry, f && f.properties]));
          if (seen.has(k)) { duplicates++; continue; }
          seen.set(k, f);
        }
      };

      const ask = async (box, cursor) => {
        requests++;
        const sub = Object.assign({}, o, { bbox: [box.w, box.s, box.e, box.n], cursor: cursor || null, limit: null, fields: null });
        return fetchFeatures(key, sub);
      };

      const queue = [{ box: copyBox(root), depth: 0 }];
      while (queue.length) {
        if (requests >= budget) { done = false; why = 'request-budget-spent'; break; }
        const node = queue.shift();
        let r = await ask(node.box, null);
        if (!r.ok) return r;
        take(r.features);
        parts.push(r.coverage);
        let cov = r.coverage, pages = 1;
        /* ⚠ THE TWO NUMBERS THAT DECIDE WHETHER THIS WINDOW IS FINISHED, AND THEY ARE BOTH THE
           SUPPLIER'S. `took` is what it actually handed over for this window across every page;
           `stated` is what it said was there. A page that is short of the whole window is not a
           window that is short of itself — reading one page's `supplier-page-incomplete` as the
           verdict for the window would divide a window that paging had already finished. */
        let took = cov.count || 0;
        let stated = (typeof cov.available === 'number') ? cov.available : null;
        /* ⑴ the supplier's own continuation, when it both stated one and can resume from it */
        while (cov.continues === true && r.next != null) {
          if (!(rec && rec.can.cursor)) { done = false; why = 'continuation-without-cursor'; break; }
          if (requests >= budget) { done = false; why = 'request-budget-spent'; break; }
          r = await ask(node.box, r.next);
          if (!r.ok) return r;
          take(r.features); parts.push(r.coverage); cov = r.coverage; pages++;
          took += cov.count || 0;
          if (typeof cov.available === 'number' && (stated == null || cov.available > stated)) stated = cov.available;
        }
        /* 「上流が持っていると述べた件数に、渡ってきた件数が届いていない」——続きも渡されないなら、
           この窓はこの上流には大きすぎる。それが分割の唯一の理由である。 */
        const capped = (stated != null && took < stated) || (cov.continues === true && r.next != null);
        windows.push({ bbox: copyBox(node.box), depth: node.depth, pages: pages, count: took, stated: stated, complete: !capped, reason: cov.reason });
        if (!capped) {
          /* ⚠ 「続きについて何も述べていない」 は 「これで終わり」 ではない. A window whose end nobody
             stated cannot be split into windows whose ends nobody states either — dividing it would
             manufacture confidence out of arithmetic. */
          if (cov.continues == null && cov.completeness !== 'all') { done = false; why = why || 'continuation-unstated'; }
          continue;
        }
        if (!splittable(node.box)) { done = false; why = why || 'window-indivisible'; continue; }
        for (const q of quadrants(node.box)) queue.push({ box: q, depth: node.depth + 1 });
      }
      if (queue.length && !why) { done = false; why = 'request-budget-spent'; }

      const features = Array.from(seen.values());
      return {
        ok: true, features: features, parts: parts,
        run: {
          windows: windows, requests: requests, duplicates: duplicates,
          dedupBy: idless ? (idless === (features.length + duplicates) ? 'structure' : 'mixed') : 'id',
          idless: idless, complete: done, why: why,
        },
        root: root,
      };
    }

    async function acquirePlanned(id, req) {
      const o = req || {};
      const key = String(id == null ? '' : id);
      const p = plan(key, o);
      if (!p.ok) return p;
      /* ⚠ A PLAN THAT CANNOT ANSWER IS REFUSED BEFORE IT IS RUN, and the grid road keeps the refusal
         it has always had — `where-not-supported` means the same thing today as yesterday. */
      if (!p.satisfiable) {
        if (p.why === 'grid-has-no-post-stage') return refuse('where-not-supported', { id: key, needs: 'supply().where' });
        return refuse('plan-unsatisfiable', { id: key, why: p.why, plan: p });
      }
      const budget = isPosInt(o.maxRequests) ? o.maxRequests : DEFAULT_REQUEST_BUDGET;
      const upstreamReq = Object.assign({}, o, { where: p.where.upstream.length ? p.where.upstream : null });
      delete upstreamReq.analysis;      /* judged once, below, on the assembled answer */

      if (p.kind !== 'features') {
        const g = await acquire(key, upstreamReq);
        if (!g.ok) return g;
        return Object.assign({}, g, { plan: Object.assign({}, p, { run: { windows: [], requests: 1, duplicates: 0, dedupBy: null, idless: 0, complete: true, why: null } }) });
      }

      if (!p.exhaustive) {
        const one = await fetchFeatures(key, upstreamReq);
        if (!one.ok) return one;
        /* ⚠ THE RECORD SAYS WHERE THE CONDITIONS RAN EVEN WHEN THEY ALL RAN UPSTREAM. A plan whose
           `pending` is empty is a statement, not an absence — a reader comparing two answers must
           not have to tell 「後段は無い」 from 「計画を通っていない」 by the field being missing. */
        const cov1 = Object.assign({}, one.coverage, {
          wherePlan: { upstream: p.where.upstream, pending: [], executedBy: p.where.upstream.map(() => p.road) },
        });
        const out1 = Object.assign({}, one, {
          coverage: cov1,
          plan: Object.assign({}, p, { run: { windows: [{ bbox: cov1.requested.bbox, depth: 0, pages: 1, count: cov1.count, stated: (typeof cov1.available === 'number') ? cov1.available : null, complete: cov1.completeness === 'all', reason: cov1.reason }], requests: 1, duplicates: 0, dedupBy: null, idless: 0, complete: cov1.completeness === 'all', why: null } }),
        });
        return analysed(key, o, out1);
      }

      const got = await exhaust(key, upstreamReq, budget);
      if (!got.ok) return got;
      /* ⚠⚠⚠ THE WHOLE POINT, AND IT IS A REFUSAL. A later filter over a window that was not taken
         to the end answers 「取れた分のうち条件に合うもの」. That is a real number over real data and
         it is not the answer to the question, so it is not returned as one. */
      if (!got.run.complete && p.where.post.length) {
        return refuse('plan-unsatisfiable', { id: key, why: got.run.why, plan: Object.assign({}, p, { run: got.run }) });
      }
      let features = got.features;
      if (Array.isArray(o.fields) && o.fields.length) features = project(features, o.fields);

      const coverage = mergeCoverage(got.parts, { servedBox: got.root, count: features.length });
      /* the record states the WHOLE question — both halves of the plan — and who has executed which */
      coverage.requested = Object.assign({}, coverage.requested, {
        bbox: (o.bbox == null) ? null : copyBox(got.root),
        where: p.where.asked.length ? p.where.asked.map((c) => ({ field: c.field, op: c.op, value: c.value })) : null,
        limit: isPosInt(o.limit) ? o.limit : null,
        fields: Array.isArray(o.fields) ? o.fields.slice() : null,
      });
      coverage.filteredBy = p.where.upstream.length ? (coverage.filteredBy || 'supplier') : null;
      coverage.wherePlan = { upstream: p.where.upstream, pending: p.where.post, executedBy: p.where.upstream.length ? p.where.upstream.map(() => p.road) : [] };
      if (p.where.post.length && coverage.completeness === 'all') {
        coverage.completeness = 'partial';
        coverage.reason = 'where-pending-post-stage';
      }
      const out = {
        ok: true,
        /* ⚠ NOT `features`. A reader that stops here has the window, not the answer. */
        kind: p.where.post.length ? 'staged' : 'features',
        features: features, coverage: coverage, next: null,
        plan: Object.assign({}, p, { run: got.run }),
      };
      return analysed(key, o, out);
    }

    /* ── analysis: the camera is not allowed to be the population, when it was said so ─────────── */

    /* ⚠ THE FALLBACK IS NOT REMOVED — it is the road most rows in this app travel and removing it
       would be removing the feature. What `analysis:true` does is refuse to let it be the STANDARD
       road for a question whose answer is a measurement: an answer assembled out of what the
       renderer holds, over a row nothing says is complete, changes when a reader pans. A caller
       that did not ask for this gets exactly what it always got, with `coverage.answeredBy` now
       saying which road answered either way. */
    function analysed(key, o, res) {
      if (!o || o.analysis !== true) return res;
      if (!res || res.ok !== true || !res.coverage) return res;
      const c = res.coverage;
      if (c.answeredBy !== 'renderer') return res;
      if (VIEW_DEPENDENT.indexOf(c.reason) < 0) return res;
      return refuse('renderer-view-dependent', { id: key, reason: c.reason, coverage: c });
    }

    /* ── capabilities: claimed (derived) and measured (asked) ─────────────────────────────────── */

    /* ⚠ NOTHING IS LISTED. Every value is read off the registration and the declaration that already
       exist for that id, so a source registered tomorrow answers by being registered. */
    function capabilitiesOf(id) {
      const key = String(id == null ? '' : id);
      const ent = entryFor(key);
      if (!ent) return null;
      const rec = sup(key);
      const d = declarationOf(key);
      const road = (rec && (rec.fetch || rec.region)) ? 'supplier' : 'renderer';
      return {
        id: key, kind: ent.kind, road: road,
        claimed: {
          /* already three-valued above, and flattening it here would undo that distinction */
          offscreen: (ent.needsVisible === true) ? false : ((ent.needsVisible === false) ? true : null),
          /* both roads are HANDED the window (supply()'s fetch takes a bbox; read() takes bounds).
             Whether it is honoured is not a thing a registration can say — it is measured. */
          window: true,
          /* ⚠ false, NOT null, FOR THE DELEGATED ROAD: read() has one parameter and it is `bounds`,
             so a time handed to it narrows nothing. A supplier is asked and says nothing in advance. */
          time: (road === 'supplier') ? null : false,
          conditions: !!(rec && rec.fetch && rec.can.where),
          /* 「終わりを確認できるか」: a view-bound holding has no end of its own to confirm; a row that
             declared it holds everything within an extent is claiming there is one. */
          boundedEnd: (d && d.viewBound === true) ? false : ((d && d.complete === true) ? true : null),
          /* nothing declares identity anywhere in this app — so the claim is silence, and silence
             is null rather than false */
          stableId: null,
        },
      };
    }

    /* ⚠ MEASURED THROUGH THE SAME DOORS A CALLER USES, so what is reported is what a caller would
       actually get. Every observation says what it observed; a question that could not discriminate
       answers null and says why, because 「測れなかった」 と 「できない」 is the distinction this whole
       file is written around. */
    async function measureCapabilities(id, opts) {
      const o = opts || {};
      const key = String(id == null ? '' : id);
      const base = capabilitiesOf(key);
      if (!base) {
        if (!LAYERS() && !REG()) return refuse('map-unavailable', { needs: 'IntMapGisLayers' });
        return refuse('layer-unknown', { id: key });
      }
      const win = (o.bbox == null) ? copyBox(WHOLE_WORLD) : asBox(o.bbox);
      if (!finiteBox(win)) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      const notes = [];
      const m = { offscreen: null, window: null, time: null, conditions: null, boundedEnd: null, stableId: null };
      if (base.kind !== 'features') {
        notes.push({ capability: null, saw: 'kind-is-grid' });
        return { ok: true, id: key, road: base.road, claimed: base.claimed, measured: m, notes: notes };
      }

      const whole = await fetchFeatures(key, { bbox: [win.w, win.s, win.e, win.n], time: o.time == null ? null : o.time });
      /* ⚠ 訊けなかったことを「能力が無い」と述べない: a refusal is handed back as itself. */
      if (!whole.ok) return whole;
      const cov = whole.coverage;

      /* ① 表示しなくても取得できるか */
      if (cov.answeredBy === 'supplier') { m.offscreen = true; notes.push({ capability: 'offscreen', saw: 'answered-by-supplier' }); }
      else if (isOff(key) && whole.features.length > 0) { m.offscreen = true; notes.push({ capability: 'offscreen', saw: 'renderer-answered-while-off' }); }
      else notes.push({ capability: 'offscreen', saw: 'layer-is-on' });

      /* ② 求めた窓の外を返さないか — asked of the app's ONE box predicate (js/map-ui.js narrow),
         not of a second containment rule written here. */
      const R = REG();
      const quarter = quadrants(win)[0];
      if (!R || typeof R.narrow !== 'function') notes.push({ capability: 'window', saw: 'narrow-unavailable' });
      else {
        const part = await fetchFeatures(key, { bbox: [quarter.w, quarter.s, quarter.e, quarter.n], time: o.time == null ? null : o.time });
        if (!part.ok) notes.push({ capability: 'window', saw: part.why });
        else if (!part.features.length) notes.push({ capability: 'window', saw: 'nothing-in-probe-window' });
        else {
          let inside = null;
          try { inside = R.narrow(part.features, [[quarter.w, quarter.s], [quarter.e, quarter.n]]); } catch (_) { inside = null; }
          if (!Array.isArray(inside)) notes.push({ capability: 'window', saw: 'narrow-declined' });
          else {
            m.window = inside.length === part.features.length;
            notes.push({ capability: 'window', saw: 'returned', got: part.features.length, inside: inside.length });
          }
        }
      }

      /* ③ 指定期間を扱えるか — the acquisition's own verdict, not a second reading of it */
      if (o.time == null) notes.push({ capability: 'time', saw: 'no-time-asked' });
      else { m.time = cov.reason !== 'time-not-established'; notes.push({ capability: 'time', saw: cov.reason }); }

      /* ④ 全件取得の終わりを確認できるか */
      if (cov.continues === false) { m.boundedEnd = true; notes.push({ capability: 'boundedEnd', saw: 'stated-end' }); }
      else if (cov.continues === null) { m.boundedEnd = false; notes.push({ capability: 'boundedEnd', saw: 'continuation-unstated' }); }
      else notes.push({ capability: 'boundedEnd', saw: 'more-remains' });

      /* ⑤ 同じ地物を安定した ID で追えるか */
      const ids = whole.features.map(identityOf);
      if (!ids.length) notes.push({ capability: 'stableId', saw: 'no-features' });
      else if (ids.some((x) => x == null)) { m.stableId = false; notes.push({ capability: 'stableId', saw: 'no-id-member', without: ids.filter((x) => x == null).length }); }
      else {
        const again = await fetchFeatures(key, { bbox: [win.w, win.s, win.e, win.n], time: o.time == null ? null : o.time });
        if (!again.ok) notes.push({ capability: 'stableId', saw: again.why });
        else {
          const a = ids.slice().sort(), b = again.features.map(identityOf).map(String).sort();
          m.stableId = a.length === b.length && a.every((x, i) => x === b[i]);
          notes.push({ capability: 'stableId', saw: m.stableId ? 'same-ids-twice' : 'ids-moved', first: a.length, second: b.length });
        }
      }

      /* ⑥ 属性条件を上流で実行できるか. ⚠ THE CONDITION IS THE CALLER'S, because a condition this
         file invented would be a claim about what the data contains. What is measured is what a
         supplier's answer must satisfy WHATEVER the condition means: the filtered rows are a subset
         of the unfiltered ones, and 「narrowed nothing」 is reported as indistinguishable rather than
         as a pass — every row may genuinely match. */
      const probe = readWhere(o.where);
      if (!probe.ok) return probe;
      if (!probe.where) notes.push({ capability: 'conditions', saw: 'no-condition-asked' });
      else {
        const filtered = await fetchFeatures(key, { bbox: [win.w, win.s, win.e, win.n], time: o.time == null ? null : o.time, where: probe.where });
        if (!filtered.ok) { m.conditions = false; notes.push({ capability: 'conditions', saw: filtered.why }); }
        else {
          const before = whole.features.length, after = filtered.features.length;
          let subset = true;
          if (m.stableId === true) {
            const have = new Set(ids.map(String));
            subset = filtered.features.every((f) => { const k = identityOf(f); return k != null && have.has(k); });
          }
          if (!subset || after > before) { m.conditions = false; notes.push({ capability: 'conditions', saw: 'not-a-subset', before: before, after: after }); }
          else if (after < before) { m.conditions = true; notes.push({ capability: 'conditions', saw: 'narrowed', before: before, after: after }); }
          else notes.push({ capability: 'conditions', saw: 'indistinguishable', before: before, after: after });
        }
      }

      return { ok: true, id: key, road: base.road, claimed: base.claimed, measured: m, notes: notes };
    }

    /* ⚠⚠⚠ THE TWO SIDE BY SIDE, AND EVERY DISAGREEMENT NAMED. A declaration is a claimant, so the
       thing a check can fail on is not 「申告が在るか」 but 「申告と実体が一致するか」 — #R783 measured
       a `where:true` over an answer nothing had filtered, and nothing anywhere could report it.
       ⚠ null NEVER CONFLICTS WITH ANYTHING: an unmeasured question is not a disagreement. */
    async function auditCapabilities(id, opts) {
      const r = await measureCapabilities(id, opts);
      if (!r.ok) return r;
      const conflicts = [];
      for (const cap of CAPABILITIES) {
        const claimed = r.claimed[cap], measured = r.measured[cap];
        if (claimed == null || measured == null || claimed === measured) continue;
        conflicts.push({
          capability: cap, claimed: claimed, measured: measured,
          /* 「言ったのにできない」 と 「できるのに言っていない」 は別の直し方をする */
          kind: (claimed === true) ? 'claimed-not-observed' : 'observed-not-claimed',
        });
      }
      return Object.assign({}, r, { conflicts: conflicts, agrees: conflicts.length === 0 });
    }

    /* ── acquire(): one door, dispatching on what the supplier is ─────────────────────────────── */

    /* ⚠ IT DECIDES NOTHING THE TWO DOORS ABOVE DO NOT. This exists so a caller that does not know
       whether a source hands over features or answers as a field can still ask — which is the
       position js/gis-atlas.js's planner is in — and so the `coverage` contract has ONE shape
       whichever kind answered. */
    async function acquire(id, req) {
      const o = req || {};
      const key = String(id == null ? '' : id);
      const ent = entryFor(key);
      if (!ent) {
        /* Say which of the two silences this is: no map at all, or a map that does not know this id. */
        if (!LAYERS() && !REG()) return refuse('map-unavailable', { needs: 'IntMapGisLayers' });
        return refuse('layer-unknown', { id: key });
      }
      /* ⚠ (#R752) THE ASYNC DOOR, so a registered implementation is reachable at all: features() can
         only serve a supplier that answers without a promise, and most of them will not. */
      if (ent.kind === 'features') return fetchFeatures(key, o);
      const box = (o.bbox == null) ? null : o.bbox;
      return region(key, box, {
        width: o.width, height: o.height, band: o.band, time: o.time, where: o.where,
        signal: (o.ctx && o.ctx.signal) || o.signal || null,
        onProgress: (o.ctx && o.ctx.onProgress) || o.onProgress || null,
      });
    }

    const API = {
      list, acquire, features, region, declare, declarationOf,
      /* (#R752) the supply contract: register an implementation, or ask what one can do */
      supply, supplierOf,
      /* (#R819) 取得の実行計画: どの条件が上流で効き、どれが後段で効くか。plan() は何も取らずに
         述べ、acquirePlanned() はそれを実行して「実際に何回・どの窓を訊いたか」を結果に残す。
         ⚠ 後段のフィルタは走らせない（js/gis-ops.js の filter が正本）——`kind:'staged'` は
         「窓は取れた。条件はまだ実行されていない」であって答えではない。 */
      plan, acquirePlanned,
      /* (#R819) 能力: 登録から導いた申告と、同じ扉を通した実測と、その食い違い */
      capabilitiesOf, measureCapabilities, auditCapabilities,
      capabilityNames: () => CAPABILITIES.slice(),
      /* the reasons that mean 「母集団が画面に依存している（かもしれない）」 — read from here by the
         caller that asked for an analysis, so there is one judgement and not two */
      viewDependentReasons: () => VIEW_DEPENDENT.slice(),
      /* the vocabularies, so a UI or a check reads them from the file that decides them rather than
         keeping a second copy (docs/GIS-CORE.md §2.1) */
      completenessValues: () => COMPLETENESS.slice(),
      coverageReasons: () => REASONS.slice(),
      /* the codes this file itself returns — one list, and refuse() is the only door that can use it */
      refusalCodes: () => REFUSALS.slice(),
      /* ⚠ NOT A LIST KEPT HERE: js/gis-ops.js's filter declares the comparisons and this hands them
         on, so a caller building a `where` reads the app's one vocabulary. null when that kernel is
         not mounted — 「訊けなかった」, which is not 「比較は無い」. */
      conditionOps: conditionOps,
    };
    try { window.IntMapGisSources = API; } catch (_) { }
    return API;
  })();
}
