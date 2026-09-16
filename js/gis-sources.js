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
       set that puts a point in each quadrant as well as the middle, and it costs five calls once. */
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

    function entry(id, title, kind, featureRow) {
      const d = declarationOf(id);
      const st = stateOf(id);
      const stated = statedTime(id);
      return {
        id: id,
        title: title,
        kind: kind,
        /* ⚠ null IS 「宣言が無い」, NOT 「生きていない」 — the same distinction js/gis-raster.js draws
           for `nodata`. Nothing reachable from here can watch a source refresh itself. */
        live: d ? d.live : null,
        needsVisible: needsVisible(id, kind, st, featureRow, d),
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
        /* who executed the attribute conditions — null when none were asked for. Nothing here ever
           reads 'post-fetch': a supplier that cannot filter is refused at the door instead. */
        filteredBy: Array.isArray(m.where) && m.where.length ? 'supplier' : null,
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
        return fromSupplier(key, rec, prep, o, ans);
      }
      return delegated(key, prep, o);
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
        return fromSupplier(key, rec, prep, o, ans);
      }
      return delegated(key, prep, o);
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
       ⇒ SO IT IS MEASURED: when the layer is off, one probe is taken; a number means the field
       answers and the read proceeds, anything else means it does not and the refusal is
       `layer-not-visible` — 「訊けなかった」 said as itself rather than returned as a grid of holes. */
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
      async function sampleOne(lng, lat) {
        let got;
        /* ⚠ A THROWN REGISTRY IS NOT A HOLE IN THE FIELD. This returned null, which js/gis-raster.js
           counts as `empty` — so its `failed` counter, which exists precisely to keep 「取得に失敗した」
           apart from 「そこには値が無い」, was structurally always 0. Re-thrown, it is counted. */
        try { got = await R.sampleAt(lng, lat, [key]); } catch (e) { throw e; }
        const hit = Array.isArray(got) ? got.find((x) => x && String(x.id) === key) : null;
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
        /* ⚠ (#R763) ONE PIXEL DECIDING FOR THE WHOLE WINDOW IS A SAMPLE, NOT A TEST OF THE SUPPLIER.
           The centre of a window over Japan is ocean, and a field with no ocean values answered
           「このレイヤーは見えていない」 for a request it could have served everywhere else. So the
           probe walks a few positions and the row is refused only when NONE of them answers — 「訊け
           なかった」 stays a statement about the supplier rather than about one arbitrary coordinate. */
        let answered = false, threw = 0;
        for (const f of PROBE_POINTS) {
          let p = null;
          try { p = await sampleOne(win.w + (win.e - win.w) * f[0], win.s + (win.n - win.s) * f[1]); } catch (_) { threw++; continue; }
          if (isNum(p)) { answered = true; break; }
        }
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
