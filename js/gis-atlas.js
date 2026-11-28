/* ============================================================================
 *  js/gis-atlas.js — the GIS layer's own Atlas surface  (window.IntMapGis.atlas)
 * ----------------------------------------------------------------------------
 *  ⚠ WHAT WAS MISSING, AND IT WAS NOT AN OP (#R743). Atlas could READ the datasets a reader had
 *  imported — js/atlas-query.js queries them, spatially — and could not ASK FOR ONE TO BE MADE.
 *  「データを問い合わせる」 and 「そのデータから新しい解析結果を作る」 were two halves with no door
 *  between them, so every analysis Atlas could perform was one somebody had already built as a
 *  feature of the app. docs/GIS-CORE.md §6 said so in as many words.
 *
 *  ⚠ AND THE FIX IS NOT 「Atlas 用の buffer」 AND 「Atlas 用の zonal」. js/gis-ops.js already
 *  DECLARES every op — its inputs, the geometry each slot accepts, the payload each slot needs, the
 *  parameters and their types — and js/gis-panel.js already builds its whole screen out of those
 *  declarations rather than out of a hand-written list. A second hand-written list for the planner
 *  would be the same defect in a new place: an op added to DECL would answer run() and be invisible
 *  to Atlas, exactly as #R732 measured for the panel (`ORDER` had four entries and DECL had nine).
 *  So the catalogue here is DERIVED, the argument vocabulary is DERIVED, and the refusals carry the
 *  vocabulary with them — a planner that guesses wrong is told what exists.
 *
 *  ⚠ THE CHAIN IS THE POINT, NOT THE CALL. An op's output is a registered dataset with an id, and
 *  that id is an input to the next op. So a request like 「施設から 5 km 圏を作り、統合し、その範囲
 *  の人口を集計して地図に出す」 is four of these with the id carried forward, and nothing here has to
 *  know that sentence exists. `run()` therefore answers with the id it made, every time.
 *
 *  ⚠ WHERE THE INPUTS COME FROM. A dataset the reader imported, by id or by title — and a LAYER of
 *  the map, through js/gis-layers.js, because otherwise Atlas could never start a chain at all: a
 *  session that has imported nothing has an empty registry and a map full of data. `layer:<id>`
 *  names one; `sources()` is what exists, asked of the map rather than listed here.
 * ==========================================================================*/

/* ⚠ (#729) 「この数字はどこから来た？どの条件で使えるか？いつのものか？」 — the ONE vocabulary
   (js/data-governance.js). Imported rather than read off `window` because this file and that one are
   in the same lazily-loaded chunk (js/gis-core.js), and because the facets must be the SAME LIST the
   gate and the reader-visible credits use: a second spelling of 「licence」 here is precisely how the
   three worlds that file's header measures came to disagree. */
import { FACETS, account, temporalMismatch } from './data-governance.js';
import { jsonWithin } from './fetch-deadline.js';
import { datasetPlanningDetails } from './gis-catalog-search.js';
/* (safe-output-single-module) the ONE output encoder — js/safe-html.js publishes globalThis.IntMapSafe
   (window.IntMapSafe in the browser) when imported, in Node as in the app, so this file keeps no copy. */
import './safe-html.js';
import { IntMapLang } from './lang-registry.js';

export function makeGisAtlas(core) {
  return (function () {
    const data = core.data, ops = core.ops, layers = core.layers;

    /* ⚠ A REFUSAL CARRIES ITS OWN SENTENCE, AND THE SENTENCE CARRIES THE VOCABULARY. The planner is
       the reader here, and what it needs is not an apology but the set it should have chosen from:
       #R733 measured a turn spending its whole step budget searching for capabilities it had already
       been handed. `detail` is serialised as it stands — the ids, the titles, the declaration — so a
       refusal is one corrected call rather than a search. */
    function fail(why, detail) {
      const d = detail || null;
      return { ok: false, why: why, detail: d, html: refusalHtml(why, d) };
    }

    function refusalHtml(why, d) {
      let s = '<div class="atlas-gis-refused"><b>' + esc(L('Could not run that step', 'その処理は実行できませんでした')) + '</b> — <code>' + esc(why) + '</code>';
      if (d) {
        const lines = [];
        for (const k of Object.keys(d)) {
          const v = d[k];
          if (v == null) continue;
          lines.push(esc(k) + ': ' + esc(typeof v === 'object' ? JSON.stringify(v) : v));
        }
        if (lines.length) s += '<div class="atlas-gis-detail">' + lines.join('<br>') + '</div>';
      }
      return s + '</div>';
    }

    /* ⚠ THE SENTENCE IS WRITTEN HERE, IN THE PROJECT'S OWN LANGUAGES, for the reason js/gis-panel.js
       gives about its own: composing it in the caller would make it one language, and composing it
       per-op would be the hand-written list this file exists to avoid. What varies between ops is
       the op's id and the numbers it measured, and both are data. */
    function L(en, jp) {
      try {
        const M = (typeof window !== 'undefined') ? IntMapLang : null;
        const lang = (typeof window !== 'undefined' && window.IntMapHost && window.IntMapHost.lang) || (M && M.current && M.current()) || 'en';
        if (M && typeof M.t === 'function') return M.t(lang, en, jp);
      } catch (_) { }
      return en;
    }

    const esc = (s) => globalThis.IntMapSafe.html(s);

    /* ⚠ THE STATS ARE PRINTED AS THE RUNNER WROTE THEM, key and all — the same decision
       js/gis-panel.js statsText made and for the same reason: a sentence per statistic would be a
       hand-written per-op list, and it would go stale the first time an op learns to report
       something new. #R743's own `geometryFailed` reaches the planner this way. */
    function statsText(st) {
      if (!st || typeof st !== 'object') return '';
      const bits = [];
      for (const k of Object.keys(st)) {
        const v = st[k];
        if (v == null || v === '' || typeof v === 'object') continue;
        bits.push(k + ': ' + v);
      }
      return bits.join(' · ');
    }

    /* ── what exists, all of it derived ─────────────────────────────────────────────────────── */

    /* ⚠ (#R752) THE ROW USED TO BE SIX FIELDS, AND `fields` WAS THE NAMES ALONE. A planner that is
       handed a column list without TYPES cannot tell which column `zonal` may sum and which one is
       an identifier; without UNITS it reports 「人口 12」 for a grid whose band is people per km²;
       without the TIME DECLARATION it cannot know `timeWindow` will refuse; without BANDS it asks
       for band 0 of a three-band grid because that is the only number it was shown; without the
       GRID it cannot tell 1 km pixels from 30 m ones, so it cannot judge whether an answer means
       anything. The record holds every one of those (docs/GIS-CORE.md §1, §1.4, §1.5) — the row was
       simply not passing them on.
       ⚠ AND THE FIX IS A PROJECTION, NOT A SECOND LIST. `fields` now carries the column records as
       js/gis-datasets.js measured them, so a key added to a column record tomorrow reaches the
       planner the same day. Copying the interesting keys into a hand-written list here is the shape
       [[intmap-two-readers-one-field-list]] measured: two readers of one contract, and the half only
       one of them knows about evaporates. The only thing this function decides is WHICH PARTS OF THE
       RECORD ARE METADATA — never what a part means. */
    function datasetRow(ds) {
      const row = { id: ds.id, title: ds.title, kind: ds.kind || 'vector', count: ds.count, ...datasetPlanningDetails(ds, core.raster, core.geometry) };
      if (ds.geometryType) row.geometryType = ds.geometryType;
      /* 幾何を持つ行の数。`geometryType:null` は「表」「空」「格子」の 3 つを 1 つの答えにするので、
         この欄が無ければ planner は座標を持たない統計表に buffer をかけて空の面を作る。 */
      if (ds.withGeometry != null) row.withGeometry = ds.withGeometry;
      const fields = (ds.fields || []).filter((f) => f && f.name);
      if (fields.length) row.fields = fields;
      /* ⚠ 4326 は値として述べられている（各自の暗黙の前提にしない）。`sourceCrs` が違えば
         「その座標系で届き、取り込みのときに変換した」という別の事実である。 */
      if (ds.crs) row.crs = ds.crs;
      if (ds.sourceCrs && ds.sourceCrs !== ds.crs) row.sourceCrs = ds.sourceCrs;
      /* null は「宣言が無い」であって「時刻が無い」ではない — だから null のときは欄を出さず、
         拒まれた宣言は理由ごと渡す（黙って 「時刻の無いデータ」 に畳まない）。 */
      if (ds.time) row.time = ds.time;
      if (ds.timeRefused) row.timeRefused = ds.timeRefused;
      if (ds.kind === 'raster') {
        row.bands = ds.bands || [];
        row.width = ds.width; row.height = ds.height;
        if (ds.grid) {
          row.grid = ds.grid;
          /* 解像度を度で渡しても planner には大きさが分からない。⚠ 緯度方向だけを km に直す:
             経度方向の km は緯度に依存するので、1 つの数では述べられない（格子の南北端で 2 倍
             違うことがある）。観測: WGS84 の子午線 1 度 ≈ 111.32 km（赤道半径からの近似値で、
             極でも 0.6% しか動かない）。失効条件: 楕円体を変えたとき。正本は js/geodesy.js。 */
          row.pixelKmLat = ds.grid.pixelLat * 111.32;
        }
      }
      /* 「この地物はこのレコードのレシピが出すもの」でない状態は、planner が次の op を積む前に
         知らなければならない（js/gis-ops.js が `input-stale` で断る相手そのもの）。 */
      if (ds.stale) row.stale = ds.stale;
      if (ds.provenance && ds.provenance.kind) row.origin = ds.provenance.kind;
      /* ⚠ (#R756) 「これは世界についての答えか」 が planner に一度も届いていなかった。
         js/gis-layers.js records the acquisition's own verdict in `provenance.coverage` — whether
         what arrived is all of it, a part, or a sample, and WHY — and this row published only
         `origin`. A planner that cannot see the difference builds 「世界で最も◯◯な国」 out of
         whatever the camera happened to be looking at, and says it in a sentence with no caveat.
         ⚠ It is passed as the acquisition measured it, not summarised: `completeness` without
         `reason` turns 「訊けなかった」 and 「一部しか無い」 into one word. */
      /* ⚠⚠ (#R759) AND IT IS A PROJECTION NOW, FOR THE REASON `fields` IS ONE, FOUR LINES UP. This
         block used to copy six named keys out of the coverage record, so #R759 — which put a coverage
         on every DERIVED record too, saying which inputs spoke, which said nothing, and which one the
         verdict came from — would have reached the planner as `completeness` alone, with the entire
         explanation dropped between two readers of one contract ([[intmap-two-readers-one-field-list]]).
         A key js/gis-sources.js or js/gis-ops.js adds tomorrow arrives the same day.
         ⚠ A RECORD WITH NO `completeness` IS STILL PUBLISHED, and that is deliberate: an op whose
         inputs did not all speak has no completeness to state, and `undeclaredInputs` next to nothing
         is precisely the answer — 「この問いは開いたままだ」, which the old guard turned into silence. */
      const cov = ds.provenance && ds.provenance.coverage;
      if (cov && typeof cov === 'object') {
        const c = {};
        for (const k of Object.keys(cov)) if (cov[k] != null) c[k] = cov[k];
        if (Object.keys(c).length) row.coverage = c;
      }
      /* (data-facts) 入力の対象時点が重ならない結合は、planner に届く。js/data-governance.js temporalMismatch の
         結果をそのまま運ぶ（pairs＝重ならない組と差の日数、unstated＝時点を述べていない入力）。要約しない。 */
      const tmm = ds.provenance && ds.provenance.timeMismatch;
      if (tmm && typeof tmm === 'object') row.timeMismatch = tmm;
      /* (spatiotemporal-join) WHEN a derived record holds, and what its join could not vouch for, reach the planner too:
         a result that carries `warnings` (a series on today's borders joined to rows drawn as they were, pairs that never
         coexisted) must be SAID with its answer, and the planner can only say what this row shows it. Passed as recorded. */
      const pv = ds.provenance;
      if (pv && typeof pv === 'object') {
        if (Array.isArray(pv.warnings) && pv.warnings.length) row.warnings = pv.warnings;
        if (pv.timeRule && typeof pv.timeRule === 'object') row.timeRule = pv.timeRule;
        if (pv.geoBasis && typeof pv.geoBasis === 'object') row.geoBasis = pv.geoBasis;
        if (pv.integrity && typeof pv.integrity === 'object') row.integrity = pv.integrity;
      }
      return row;
    }

    /* ══ ⚠⚠⚠ (#R783) 取得する前に分かることが、取得した後に分かることより薄かった ═══════════════
       datasetRow() above publishes what js/gis-datasets.js MEASURED — every column with its type,
       its range, its unit and its author, the verified time declaration, the grid and its bands, the
       acquisition's own coverage verdict. That is the record of an answer that has already been
       fetched. The row for a source that has NOT been fetched from was five fields —
       `{ref, label, geometryType, count, samplable}` — so the planner chose WHAT to acquire with
       strictly less information than it got back afterwards, and the questions that decide whether an
       acquisition is worth making at all had no answer anywhere in the surface:

           何の量か        only the label, and only because a label happens to name it
           どの時期か      nothing. js/map-ui.js state(id).time is a sentence every readable row can
                           write (「直近 24 h」「1889」) and this row dropped it, so a planner could
                           not tell today's ships from an 1889 census before asking for either
           どの範囲を持つか nothing. js/gis-sources.js declarationOf(id) is the supplier's own
                           statement of its extent, and it was read only DURING an acquisition, to
                           judge the answer after the fact
           どの解像度か    nothing — and `toRaster` REFUSES a call with no width/height, so the
                           planner was being asked for a number it had been shown nothing about
           どの条件で検索できるか
                           nothing. `acquire-unknown-field` names the vocabulary only after a wrong
                           call, and `where`/`cursor` are capabilities a supplier declares
                           (js/gis-sources.js supplierOf) that nothing published at all

       ⚠ AND THE FIX IS NOT A SECOND CATALOGUE. Every one of those facts is already stated by a
       supplier — the layer registry (`state`), the supply layer (`list`, `declarationOf`,
       `supplierOf`, `conditionOps`) and the map bridge (`sources`, `canSample`, `acquireFields`).
       describe() is a PROJECTION of those statements, the way datasetRow() is a projection of a
       record; the ids come from the same discovery mapRows() already used, so a source registered
       tomorrow is described the same day and nothing here holds a table of sources
       (.agents/rules/no-ad-hoc-hardcoding.md §2-4).

       ⚠⚠ AND A SLOT NOBODY FILLED IS NAMED, NOT LEFT BLANK. 「宣言が無い」 and 「その問いは当たら
       ない」 are two different answers and an absent key is neither of them — the distinction this
       repository keeps paying for ([[intmap-data-must-not-claim-an-author-it-lacks]],
       js/gis-datasets.js `time:null`). So every slot below appears in exactly one of three places:
       stated (inside its subject), `undeclared` (with WHY the silence), or `notApplicable` (with why
       the question does not apply to this row). A planner reading `undeclared` learns what to ask a
       reader for; a planner reading `notApplicable` learns not to. */

    /* ⚠ THE SLOTS ARE DECLARED, and that is the invariant rather than decoration — the same argument
       js/gis-sources.js REFUSALS and js/gis-datasets.js REFUSALS are written for. A slot this list
       names and describe() accounts for nowhere is a fact that fell out of the surface silently, and
       a slot describe() fills that this list does not name is one no check could ever see. What is
       NOT written here is any VALUE: every one of them is asked of the supplier that states it. */
    /* ⚠⚠⚠ (#729) EVERY FACET, NOT A CHOSEN PAIR. This was written as
       `GOVERNED_SUBJECTS = ['rights','freshness']` and filtered FACETS by it — which is a SECOND LIST
       of a vocabulary that already exists, the exact thing tests/atlas-gis-checks.test.mjs #R759 ① measures this file for and
       the shape #R747's `targets` used to wipe out all five production answers. There is also no
       fact behind the pair: a layer's registration may state where its data came from
       (`origin.*`), what was measured in it (`integrity.*`) and which upstream wins (`precedence.*`)
       just as well as its terms, and account() already answers for all of them — an unstated facet
       comes back in `undeclared` with a reason, which is precisely what a planner needs to know to
       go and ask. So the slots ARE the vocabulary, and a facet added to js/data-governance.js
       tomorrow reaches the planner the same day. */
    const GOVERNANCE_SLOTS = FACETS.slice();
    const PREFETCH_SLOTS = [
      /* 何の量か */
      'quantity.payload', 'quantity.name', 'quantity.geometryType', 'quantity.count',
      'quantity.samplable', 'quantity.sampleCapable', 'quantity.samplePrepared',
      'quantity.sampleAvailable', 'quantity.sampleVisible',
      'quantity.unit', 'quantity.legend', 'quantity.attribution',
      /* どの時期か */
      'period.statedTime', 'period.asOf', 'period.live',
      /* どの範囲を持つか */
      'extent.bounds', 'extent.complete', 'extent.viewBound',
      /* どの解像度か */
      'resolution.declared', 'resolution.chosen',
      /* どの条件で検索できるか */
      'query.accepts', 'query.conditions', 'query.supplier', 'query.needsVisible',
      /* (#R819) 取得する前に分かる能力（申告）。See the block in prefetch() for why the MEASURED pair
         is not taken here. */
      'query.capabilities',
      /* ⚠⚠⚠ (#729) どの条件で使えるか・いつのものか — DERIVED FROM THE VOCABULARY, NOT COPIED.
         Before this round the only thing here about provenance was `quantity.attribution`, and what
         it carried was js/map-ui.js's SENTENCE: a planner asked 「この地図のデータは再配布できるか」
         was handed 「aisstream.io / Digitraffic (Fintraffic, CC BY 4.0) AIS」 and had to parse a
         licence out of prose. The registrations now state those as values, so the slots are the
         FACETS of that record — a facet js/data-governance.js gains tomorrow is published the same
         day, which a list written out here could not be ([[intmap-two-readers-one-field-list]]).
         ⚠ `quantity.attribution` STAYS: the credit LINE a reader is shown is a different fact from
         the terms it was published under, and #R783's readers of it are not wrong.
         ⚠ WHICH SUBJECTS THIS SURFACE TAKES IS THIS ROUND'S DECISION, and it is stated as subjects
         rather than as facet names for that reason: 「誰の仕事か」 and 「形と中身が測られているか」
         are answered about an ACQUIRED record (datasetRow's `origin`, `fields`, `coverage`), while
         terms and age are the two a planner needs BEFORE it acquires anything. */
      ...GOVERNANCE_SLOTS,
    ];
    /* ⚠ THE SUBJECTS ARE THE SLOTS' OWN PREFIXES, NOT A SECOND LIST. Writing them out would be a
       list that can lose a subject the slots gained — the drift tests/atlas-gis-checks.test.mjs #R759 ① measures for the
       acquisition vocabulary, in a new place. Order is first appearance above. */
    const PREFETCH_SUBJECTS = PREFETCH_SLOTS.map((s) => s.slice(0, s.indexOf('.')))
      .filter((s, i, a) => a.indexOf(s) === i);

    /* Read at call time, never captured — the convention every kernel in this layer follows, and the
       reason this module imports in Node with no DOM and describes everything as undeclared there. */
    function SOURCES() { try { return (typeof window !== 'undefined' && window.IntMapGisSources) || null; } catch (_) { return null; } }
    function REGISTRY() { try { return (typeof window !== 'undefined' && window.IntMapLayers) || null; } catch (_) { return null; } }

    /* js/gis-sources.js list() — one walk for the whole catalogue, not one per row: it asks the
       registry and builds a supplier for every id it meets, which is work worth doing once.
       ⚠ THE SILENCE IS NAMED. 「供給層が載っていない」 and 「載っているがこの id を知らない」 reach a
       planner as different reasons, because the first is fixed by loading a module and the second by
       registering a source. */
    function supplyIndex() {
      const S = SOURCES();
      const idx = { map: new Map(), sources: S, why: null };
      if (!S || typeof S.list !== 'function') { idx.why = 'supply-layer-unavailable'; return idx; }
      let rows = [];
      try { rows = S.list() || []; } catch (_) { idx.why = 'supply-layer-refused'; return idx; }
      for (const e of rows) if (e && e.id != null) idx.map.set(String(e.id), e);
      return idx;
    }

    /* The layer registry's own row. ⚠ ASKED, NOT LISTED: `state(id)` is what the registration says
       about itself, so a row added tomorrow answers without this file learning its name. */
    function registryState(id) {
      const R = REGISTRY();
      if (!R || typeof R.state !== 'function') return null;
      try { const s = R.state(id); return (s && typeof s === 'object') ? s : null; } catch (_) { return null; }
    }

    function declarationFor(idx, id) {
      const S = idx.sources;
      if (!S || typeof S.declarationOf !== 'function') return null;
      try { const d = S.declarationOf(id); return (d && typeof d === 'object') ? d : null; } catch (_) { return null; }
    }

    /* ⚠ (#R783) WHAT A SOURCE STATES BEFORE ANYBODY FETCHES FROM IT. `mapRow` is the map bridge's
       row for this id (null when the map does not offer one) and `idx` is one supplyIndex() walk. */
    function prefetch(id, mapRow, idx) {
      const out = {};
      for (const g of PREFETCH_SUBJECTS) out[g] = {};
      out.undeclared = [];
      out.notApplicable = [];
      const put = (slot, value) => { const i = slot.indexOf('.'); out[slot.slice(0, i)][slot.slice(i + 1)] = value; };
      const none = (slot, why) => { out.undeclared.push({ slot: slot, why: why }); };
      const na = (slot, why) => { out.notApplicable.push({ slot: slot, why: why }); };

      const ent = idx.map.get(id) || null;
      /* Why there is nothing from the supply layer about this id — used wherever the silence is that
         layer's rather than a supplier's own. */
      const mute = ent ? null : (idx.why || 'not-in-supply-list');
      const d = declarationFor(idx, id);
      const st = registryState(id);
      /* ⚠ THE NORMALISED DECLARATION TRAVELS WHOLE AS WELL AS IN SLOTS, for the reason `fields` and
         `coverage` do in datasetRow(): a key js/gis-sources.js readDeclaration adds tomorrow reaches
         the planner the same day instead of waiting for someone to widen a list here. */
      if (d) out.declared = d;

      /* ── 何の量か ──────────────────────────────────────────────────────────────────────────── */
      /* features or a numeric field. ⚠ NOT GUESSED FROM `samplable`: js/gis-sources.js list()
         classifies a row by what it can DO (#R763), and a second rule here would be free to disagree
         with the door that actually dispatches. */
      if (ent && ent.kind) put('quantity.payload', String(ent.kind)); else none('quantity.payload', mute);
      const name = (mapRow && mapRow.label != null) ? mapRow.label : (ent && ent.title != null ? ent.title : null);
      if (name != null && String(name) !== '') put('quantity.name', String(name)); else none('quantity.name', mute || 'label-unstated');
      if (!mapRow) {
        /* The supply layer knows rows the map bridge does not offer — a document nobody has switched
           on has no feature count and no geometry to type (#R763 measured exactly that row). */
        na('quantity.geometryType', 'not-offered-by-the-map-bridge');
        na('quantity.count', 'not-offered-by-the-map-bridge');
      } else {
        if (mapRow.geometryType) put('quantity.geometryType', mapRow.geometryType);
        else if (mapRow.count === 0) na('quantity.geometryType', 'no-features-to-type');
        else none('quantity.geometryType', 'geometry-unstated');
        /* ⚠ THE COUNT IS THE WHOLE LAYER'S, not the current view's — js/gis-layers.js sources() says
           so, and a planner that read it as a view count would size every window wrongly. */
        if (typeof mapRow.count === 'number') put('quantity.count', mapRow.count);
        else none('quantity.count', 'count-unstated');
      }
      /* ⚠ THE ONE BOOLEAN THE ROW HAS ALWAYS CARRIED, KEPT. js/gis-layers.js canSample() is the
         CAPABILITY question now (#R783) and js/gis-panel.js and this row are its two callers; a
         reader that learnt `samplable` is not wrong, so it stays and the four facts below are added
         beside it rather than in place of it. */
      put('quantity.samplable', !!(mapRow ? mapRow.samplable : (layers && layers.canSample && layers.canSample(id))));
      /* ⚠⚠⚠ (#R783) AND ONE BOOLEAN WAS STANDING FOR FOUR FACTS. Before this round `samplable` was
         `state(id).on` — a CHECKBOX — so 「その行は値を答えられるか」, 「表示していなくてもデータが
         在るか」, 「いま訊けるか」 and 「表示されているか」 reached the planner as one word. A planner
         reading it as capability skipped every readable field that happened to be switched off; a
         planner reading it as availability asked for a window from a row that cannot answer at all.
         The four are separated AT THEIR CLAIMANTS: js/gis-layers.js samplingOf() measures the row's
         ability (and answers null while nobody has asked it), js/gis-sources.js composes the list
         row's `sampling` and owns `prepared` (its needsVisible judgement), and only `visible` is
         about the checkbox.
         ⚠⚠ AND `capable === null` IS NOT false. 「能力が無い」 and 「まだ訊いていない」 are the two
         answers this project keeps paying for confusing — an unmeasured row is a CANDIDATE
         (js/gis-sources.js `kind:'grid'` means exactly that), and writing false would hide a field
         that reads perfectly well the moment it is asked. So a null travels as a named silence, the
         way every other unstated slot here does. */
      const supply = ent && ent.sampling && typeof ent.sampling === 'object' ? ent.sampling : null;
      let bridge = null;
      if (!supply && layers && typeof layers.samplingOf === 'function') {
        try { const s = layers.samplingOf(id); bridge = (s && typeof s === 'object') ? s : null; } catch (_) { bridge = null; }
      }
      const smp = supply || bridge;
      /* three-valued in, three-valued out */
      const tri = (slot, v, why) => { if (v == null) none(slot, why); else put(slot, !!v); };
      if (!smp) {
        const why = mute || 'sampling-unasked';
        none('quantity.sampleCapable', why); none('quantity.samplePrepared', why);
        none('quantity.sampleAvailable', why); none('quantity.sampleVisible', why);
      } else {
        tri('quantity.sampleCapable', smp.capable, 'sampling-capability-unmeasured');
        /* ⚠ `prepared` AND `available` ARE THE SUPPLY LAYER'S COMPOSITION, not the map bridge's. When
           only the bridge answered, they are not 「false」 — they are questions this claimant does not
           take, and saying so is what stops a second judgement of them growing here. */
        tri('quantity.samplePrepared', smp.prepared, supply ? 'data-presence-unmeasured' : 'prepared-owned-by-the-supply-layer');
        tri('quantity.sampleAvailable', smp.available, supply ? 'sampling-availability-unmeasured' : 'availability-owned-by-the-supply-layer');
        tri('quantity.sampleVisible', smp.visible, 'visibility-unreadable');
      }
      /* ⚠⚠ THE UNIT IS NOT DECLARABLE IN THIS APP TODAY, AND SAYING SO IS THE POINT. A band's unit is
         taken from the `measure()` rows during the read (js/gis-sources.js region → `unitSeen`), so
         it exists only once samples exist; nothing in a registration states it in advance. Naming the
         slot with that reason tells the planner where to look AFTER acquiring (`bands[].unit` on the
         record) instead of leaving it to infer a unit from a label, which is the claim with no author
         this project keeps removing. */
      none('quantity.unit', 'unit-stated-only-by-the-samples');
      if (st && st.legend != null) put('quantity.legend', st.legend);
      else none('quantity.legend', st ? 'legend-undeclared' : 'registry-unavailable');
      if (st && st.source != null && st.source !== '') put('quantity.attribution', String(st.source));
      else none('quantity.attribution', st ? 'attribution-undeclared' : 'registry-unavailable');

      /* ── どの時期か ────────────────────────────────────────────────────────────────────────── */
      /* ⚠ THE SENTENCE AND THE MOMENT ARE TWO FACTS AND BOTH TRAVEL. js/gis-layers.js registerFeatures
         carries `statedTime` verbatim precisely because 「直近 24 h」 is not a timestamp, and
         js/gis-sources.js entry() keeps `asOf` only when the sentence READS as a moment. A row that
         says 「直近 24 h」 therefore has a period to state and no asOf — publishing only the second
         would tell the planner the row has no time at all. */
      if (st && st.time != null && st.time !== '') put('period.statedTime', String(st.time));
      else none('period.statedTime', st ? 'time-unstated' : 'registry-unavailable');
      const asOf = (d && d.asOf != null) ? d.asOf : (ent && ent.asOf != null ? ent.asOf : null);
      if (asOf != null) put('period.asOf', String(asOf)); else none('period.asOf', mute || 'asof-undeclared');
      /* ⚠ THREE-VALUED AT THE SUPPLIER AND THREE-VALUED HERE: null is 「宣言が無い」 and not
         「生きていない」 (js/gis-sources.js entry()). Flattening it to false would state a claim the
         supplier declined to make. */
      const live = (d && d.live != null) ? d.live : (ent && ent.live != null ? ent.live : null);
      if (live != null) put('period.live', !!live); else none('period.live', mute || 'live-undeclared');

      /* ── どの範囲を持つか ─────────────────────────────────────────────────────────────────── */
      /* ⚠ THE DECLARED EXTENT, NEVER THE BOUNDING BOX OF WHAT CAME BACK — js/gis-sources.js entry()
         gives the reason, and it is the whole subject of that file: 「いま画面にあるもの」 read as
         「そのレイヤーの範囲」 is how a viewport measurement becomes a claim about a region. */
      if (!d) {
        const why = mute || 'extent-undeclared';
        none('extent.bounds', why); none('extent.complete', why); none('extent.viewBound', why);
      } else {
        if (d.extent) put('extent.bounds', d.extent); else none('extent.bounds', 'extent-undeclared');
        /* Both are booleans on a normalised declaration, so they are stated as the declaration states
           them. ⚠ `complete:false` is js/gis-sources.js's `completeness-undeclared`, which is why the
           absence of a DECLARATION above is a different silence from a declaration saying false. */
        put('extent.complete', d.complete === true);
        put('extent.viewBound', d.viewBound === true);
      }

      /* ── どの解像度か ─────────────────────────────────────────────────────────────────────── */
      const res = (d && d.resolution != null) ? d.resolution : (ent && ent.resolution != null ? ent.resolution : null);
      if (res != null) put('resolution.declared', res); else none('resolution.declared', mute || 'resolution-undeclared');
      /* ⚠ THE OTHER HALF OF THE ANSWER IS THE CALLER'S, AND THIS FILE ALREADY REFUSES A CALL WITHOUT
         IT (`raster-sample-needs-window` in fromLayer). A grid is burnt at a resolution the planner
         chooses — js/gis-sources.js calls it `grid-is-a-sample` for that reason — so the fields it
         must state are named here, from the same door that enforces them, rather than discovered by
         making the wrong call. A feature copy has no such number: its resolution is its geometry's. */
      if (ent && ent.kind === 'grid') put('resolution.chosen', ['acquire.bounds', 'acquire.width', 'acquire.height']);
      else if (ent) na('resolution.chosen', 'features-are-not-burnt-at-a-resolution');
      else none('resolution.chosen', mute);

      /* ── どの条件で検索できるか ───────────────────────────────────────────────────────────── */
      /* The acquisition vocabulary, asked of js/gis-layers.js — the same call acquireOpts() validates
         against, so what the planner is shown and what the door accepts cannot drift. */
      const kind = (ent && ent.kind === 'grid') ? 'raster' : 'vector';
      if (layers && typeof layers.acquireFields === 'function') {
        let allow = null;
        try { allow = layers.acquireFields(kind); } catch (_) { allow = null; }
        if (Array.isArray(allow)) put('query.accepts', allow); else none('query.accepts', 'acquire-fields-refused');
      } else none('query.accepts', 'acquire-fields-unavailable');
      /* ⚠ `where` IS js/gis-ops.js's VOCABULARY, HANDED ON (js/gis-sources.js conditionOps). null
         there is 「訊けなかった」 and not 「比較は無い」, so it is carried as that. */
      if (idx.sources && typeof idx.sources.conditionOps === 'function') {
        let cond = null;
        try { cond = idx.sources.conditionOps(); } catch (_) { cond = null; }
        if (cond != null) put('query.conditions', cond); else none('query.conditions', 'condition-vocabulary-unavailable');
      } else none('query.conditions', idx.why || 'condition-vocabulary-unavailable');
      /* ⚠ THE CAPABILITIES ARE THE SUPPLIER'S OWN STATEMENT ABOUT ITS OWN CODE, and a request naming
         a condition it did not claim is refused at the door (`where-not-supported`). So a planner
         that cannot see them cannot tell 「絞り込める」 from 「絞り込めない」 until it is refused. */
      if (idx.sources && typeof idx.sources.supplierOf === 'function') {
        let sup = null;
        try { sup = idx.sources.supplierOf(id); } catch (_) { sup = null; }
        if (sup) put('query.supplier', sup); else none('query.supplier', 'no-supplier-registered');
      } else none('query.supplier', idx.why || 'supply-layer-unavailable');
      /* ⚠ THREE-VALUED AGAIN: null means the question cannot be asked without switching the row off
         behind the reader's back (js/gis-sources.js needsVisible), which is not 「表示は要らない」. */
      if (ent && ent.needsVisible != null) put('query.needsVisible', !!ent.needsVisible);
      else none('query.needsVisible', mute || 'visibility-requirement-unmeasured');
      /* ⚠⚠⚠ (#R819) 「この供給元は画面と独立に取れるか・期間を扱えるか・全件の終わりを確認できるか」 は、
         取得したあとに分かっても遅い。A planner choosing between two sources for a measurement was
         being shown the supplier's four fetch booleans (`query.supplier`) and nothing about the three
         questions that decide whether an acquisition can be a measurement at all — so 「表示していない
         行から取れるか」 could only be learnt by asking and seeing what came back.
         ⚠ NOTHING IS ENUMERATED HERE. js/gis-sources.js capabilitiesOf() DERIVES the claim from the
         registration and the declaration that already exist for that id, so a source registered
         tomorrow is described the same day and this file holds no table of capabilities — and the
         object travels whole, the way `declared`, `fields` and `coverage` do, so a capability added
         there arrives here without a list being widened.
         ⚠ EACH VALUE INSIDE IS THREE-VALUED AND STAYS SO: null is 「申告が無い」, never false.
         ⚠ AND IT IS THE CLAIM, NOT THE MEASUREMENT. measureCapabilities/auditCapabilities ASK through
         the doors a caller uses — they cost one or more acquisitions — and a description is what is
         known BEFORE anybody fetches. The measured pair is reached through capabilities() below. */
      if (idx.sources && typeof idx.sources.capabilitiesOf === 'function') {
        let caps = null;
        try { caps = idx.sources.capabilitiesOf(id); } catch (_) { caps = null; }
        if (caps && typeof caps === 'object') put('query.capabilities', caps);
        else none('query.capabilities', mute || 'capabilities-undeclared');
      } else none('query.capabilities', idx.why || 'capabilities-unavailable');

      /* ── どの条件で使えるか・いつのものか ──────────────────────────────────────────────────
         ⚠ THE THREE-WAY SPLIT IS THE KERNEL'S, CARRIED — not decided again here. account() is the
         one place that knows 「宣言が無い」 from 「その問いは当たらない」 for a provenance record
         (a public-domain file owes no credit ROW; a silent one owes an answer), and it names the
         silence when the registration carries no record at all (`record-absent`). Copying its
         verdicts into branches here would be a second opinion about somebody else's terms.
         ⚠ AND THIS IS A PROJECTION OVER THE DECLARED SLOTS, so a facet the vocabulary gains
         arrives without this loop being touched — the argument datasetRow() `fields` is written
         for. ⚠ `freshness.verdict` is the kernel's OWN measurement (`derived:true`) and is stated
         even when nothing was declared: 「測れなかった」 is an answer, and it is not a supplier's
         silence. */
      const govAcct = account((st && st.rights) || null, { now: null });
      for (const facet of GOVERNANCE_SLOTS) {
        const i = facet.indexOf('.'), bag = govAcct[facet.slice(0, i)], key = facet.slice(i + 1);
        if (bag && Object.prototype.hasOwnProperty.call(bag, key)) put(facet, bag[key]);
      }
      for (const u of govAcct.undeclared) if (GOVERNANCE_SLOTS.indexOf(u.facet) >= 0) none(u.facet, u.why);
      for (const u of govAcct.notApplicable) if (GOVERNANCE_SLOTS.indexOf(u.facet) >= 0) na(u.facet, u.why);

      return out;
    }

    /* ⚠ ONE SURFACE, SO THE PANEL, ATLAS AND AN EXTERNAL READER READ THE SAME STATEMENTS. The
       alternative — each reader assembling its own view of the suppliers — is
       [[intmap-two-readers-one-field-list]] with three readers: the half only one of them knows
       about evaporates, and no check can see it go. */
    function describe(ref) {
      const raw = (ref == null) ? '' : String(ref).trim();
      const id = (raw.slice(0, LAYER_PREFIX.length) === LAYER_PREFIX) ? raw.slice(LAYER_PREFIX.length) : raw;
      const idx = supplyIndex();
      for (const row of sourceRows(idx)) {
        if (row.id === id) return Object.assign(rowOf(row), prefetch(id, row.onMap ? row : null, idx));
      }
      return null;
    }

    /* ⚠⚠ WHO EXISTS, AND IT IS THE UNION OF TWO DISCOVERIES — NOT A COURTESY. js/gis-layers.js
       sources() walks the layer registry and the renderer's own style; js/gis-sources.js list()
       reaches, on top of that, the rows the renderer has NEVER DRAWN (a bundled document nobody has
       switched on) and the ids that registered a supplier. Those are precisely the rows an
       acquisition exists for — #R763 measured one being misclassified for not having been drawn — so
       a list that offered only what is already on screen would make 「表示していないレイヤーから
       取得する」 unnameable.
       ⚠ IDENTITY ONLY, AND THAT SEPARATION IS THE COST CONTROL. resolveRef() asks WHO EXISTS on
       every unresolved ref and needs nothing but the ref and the label; prefetch() asks the registry
       and the supply layer once per row. Describing every source to answer 「この名前はどれか」 would
       make a name lookup cost a catalogue. */
    function sourceRows(idx) {
      const out = [];
      const seen = new Set();
      let list = [];
      if (layers && typeof layers.sources === 'function') {
        try { list = layers.sources() || []; } catch (_) { list = []; }
      }
      for (const s of list) {
        if (!s || s.id == null) continue;
        const id = String(s.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          id: id, label: s.label, geometryType: s.geometryType || null, count: s.count, onMap: true,
          /* A numeric layer has no features to copy and IS readable as a grid — the two are different
             doors (toDataset / toRaster) and a planner that cannot tell them apart asks for the wrong
             one. The map is asked; nothing here holds a list of which layers are fields. */
          samplable: !!(layers.canSample && layers.canSample(s.id)),
        });
      }
      for (const id of idx.map.keys()) {
        if (seen.has(id)) continue;
        seen.add(id);
        const ent = idx.map.get(id);
        /* ⚠ `null`, NOT `0`, FOR A ROW THE MAP BRIDGE DOES NOT OFFER — the same distinction
           js/gis-datasets.js draws with `withGeometry`. 「地物 0 件」 と 「件数を誰も数えていない」
           は別の主張で、0 は planner に 「空のレイヤー」 と読まれる。 */
        out.push({
          id: id, label: ent.title == null ? id : String(ent.title), geometryType: null, count: null,
          onMap: false, samplable: !!(layers && layers.canSample && layers.canSample(id)),
        });
      }
      return out;
    }

    /* ⚠ THE FIVE FIELDS THE ROW HAS ALWAYS HAD, UNCHANGED. resolveRef() matches on `ref` and `label`
       and js/atlas-console.js prints neither — removing or renaming one of them would break a caller
       that works, and this round only adds. */
    function rowOf(row) {
      return { ref: LAYER_PREFIX + row.id, label: row.label, geometryType: row.geometryType, count: row.count, samplable: row.samplable };
    }

    /* Identity only — the list resolveRef() and the thin refusals read. */
    function mapRefs() { return sourceRows(supplyIndex()).map(rowOf); }

    /* Identity PLUS what each source states before anybody fetches from it (#R783). */
    function mapRows() {
      const idx = supplyIndex();
      return sourceRows(idx).map((row) => Object.assign(rowOf(row), prefetch(row.id, row.onMap ? row : null, idx)));
    }

    /* ⚠ THE OP LIST IS `ops.ops()`, NOT A COPY OF IT. This is the whole reason this file is small. */
    function catalogue() {
      return {
        ops: ops.ops(),
        datasets: data.list().map(datasetRow),
        layers: mapRows(),
      };
    }

    /* ── resolving one input ────────────────────────────────────────────────────────────────── */

    const LAYER_PREFIX = 'layer:';

    /* Made datasets are remembered for the turn so that resolving the same layer twice does not bake
       the same copy twice — a chain of four ops over one layer would otherwise hold four copies of
       it, and the second one would be a different dataset id from the first for no reason a reader
       could see. */
    function makeCache() { const m = new Map(); m.acquired = []; return m; }
    function createdReceipt(row) {
      const version = data.versionOf?.(row.id);
      return version == null ? [] : [{ id: row.id, version }];
    }
    function noteAcquired(cache, row) {
      if (cache && cache.acquired) cache.acquired.push({ row, receipts: createdReceipt(row) });
    }
    function withCreated(out, cache) {
      const receipts = cache.acquired.flatMap((r) => r.receipts);
      if (receipts.length) out.datasetsCreated = receipts.concat(out.datasetsCreated || []);
      return out;
    }

    /* ══ ⚠⚠⚠ (#R759) 取得の条件が、この扉で全部落ちていた ═══════════════════════════════════════
       fromLayer() called `layers.toDataset(id, {})` — an empty object, on every path. js/gis-sources.js
       states an acquisition contract of eight fields and js/gis-layers.js carries six of them through
       toDataset, so 「この範囲の」「この属性に合うものだけ」「続きを」 were all reachable from the panel
       and unreachable from the planner. The half of the app that can compose a four-step chain could
       not state a window for step one.
       ⚠ THE VOCABULARY IS ASKED FOR, NOT WRITTEN HERE (js/gis-layers.js acquireFields). A copy in this
       file would be the second list [[intmap-two-readers-one-field-list]] measured in production —
       the reader that does not know about a field drops it silently, and a planner reading its own
       correct call back as 「何も指定されなかった」 has no way to see what happened. A field this door
       does not know is REFUSED BY NAME with the set, which is one corrected call instead of a search.
       ⚠ AND THE WINDOW IS NOT DERIVED FROM THE CAMERA, HERE OR ANYWHERE BELOW. That is the whole
       point of the field: 「地図が持っているものを読む」 and 「指定した範囲のものを取得する」 are
       different questions, and the second one has to be answerable while the camera is somewhere
       else. What the acquisition could NOT answer travels back as `coverage` (js/gis-layers.js),
       which is why this file may pass the request on without adjudicating it. */
    function acquireOpts(action, wantsRaster) {
      const kind = wantsRaster ? 'raster' : 'vector';
      const src = (action && action.acquire && typeof action.acquire === 'object') ? action.acquire : null;
      /* ⚠ 「訊けなかった」 を 「その欄は無い」 の代わりにしない。A door that cannot name the vocabulary
         cannot judge a request against it, and answering `acquire-unknown-field` for every key would
         say the map refused a field it was never asked about. */
      if (src && !(layers && typeof layers.acquireFields === 'function')) {
        return fail('acquire-unavailable', { needs: 'IntMapGisLayers.acquireFields' });
      }
      const allow = (layers && typeof layers.acquireFields === 'function') ? layers.acquireFields(kind) : [];
      const opts = {};
      if (src) {
        for (const k of Object.keys(src)) {
          if (src[k] === undefined) continue;
          if (allow.indexOf(k) < 0) return fail('acquire-unknown-field', { field: k, accepts: allow, kind: kind });
          opts[k] = src[k];
        }
      }
      /* `sample` is the spelling #R743 shipped for the raster window, and it names the same three
         fields. It keeps working — a planner that learnt it is not wrong — and a call that states a
         window TWICE and differently is refused rather than resolved by precedence, because which of
         the two the reader meant is not something this file knows. */
      const s = action && action.sample;
      if (wantsRaster && s && typeof s === 'object') {
        for (const k of ['bounds', 'width', 'height']) {
          if (s[k] == null) continue;
          if (opts[k] != null && JSON.stringify(opts[k]) !== JSON.stringify(s[k])) {
            return fail('window-stated-twice', { field: k, acquire: opts[k], sample: s[k] });
          }
          opts[k] = s[k];
        }
      }
      return { ok: true, opts: opts };
    }

    /* ⚠ (#R819) WHICH DOOR OF THE MAP IS ASKED IS ONE RULE, IN ONE PLACE. js/gis-layers.js has two
       — features (toDataset) and a field baked over a window (toRaster) — and the request itself
       says which: `kind` when the caller stated it, and otherwise the presence of a resolution,
       because width and height are meaningless to a feature copy. This was written inside
       acquireOnly() and nowhere else, so a slot declared `'any'` (`profile` / `reach`) handed a
       LAYER could only ever be fetched as features — the grid door was unreachable from Atlas for
       ops that accept both. A second copy of the test would be [[intmap-two-readers-one-field-list]]
       measured again, so the judgement is asked for here by both readers rather than repeated.
       ⚠ A `kind` this door cannot read is refused by name with the set, which is one corrected call
       instead of a silent choice of door. */
    function doorAsked(action) {
      const a = action || {};
      const word = (a.kind == null || a.kind === '') ? null : String(a.kind);
      if (word && word !== 'vector' && word !== 'raster') return fail('bad-param', { param: 'kind', kinds: ['vector', 'raster'] });
      const win = (a.acquire && typeof a.acquire === 'object') ? a.acquire : {};
      return { ok: true, raster: word ? (word === 'raster') : (win.width != null || win.height != null || !!a.sample) };
    }

    async function resolveRef(ref, slot, decl, cache, action, readContext) {
      const raw = (ref == null) ? '' : String(ref).trim();
      if (!raw) return fail('missing-input', { slot: slot });
      if (cache.has(raw)) return { ok: true, id: cache.get(raw) };

      /* 1. an id the registry already holds. */
      const direct = data.get(raw) || (raw.startsWith('dataset:') ? data.get(raw.slice('dataset:'.length)) : null);
      if (direct) { cache.set(raw, direct.id); return { ok: true, id: direct.id }; }

      /* 2. a layer of the map, named as one. */
      /* ⚠ 枠が種別を決めているのは、決めている枠だけである。`'raster'` の枠は格子、それ以外の
         綴りは今日までどおり地物で、`'any'` の枠——同じ問いを格子にも地物にも出せる `profile` /
         `reach` ——だけが**要求そのもの**に訊く（doorAsked、acquireOnly と同じ 1 つの規則）。 */
      const slotKind = Array.isArray(decl.kinds) ? decl.kinds[slot] : null;
      let wantsRaster = (slotKind === 'raster');
      if (slotKind === 'any') {
        const asked = doorAsked(action);
        if (!asked.ok) return asked;
        wantsRaster = asked.raster;
      }
      if (raw.slice(0, LAYER_PREFIX.length) === LAYER_PREFIX) {
        const made = await fromLayer(raw.slice(LAYER_PREFIX.length), wantsRaster, action, cache);
        if (!made.ok) return made;
        cache.set(raw, made.id);
        return made;
      }

      /* 2b. (cog-url-connect) A GRID AT A URL — `url:https://…` (or a bare https:// address). Only a
         GRID slot can take one: a URL names a Cloud Optimized GeoTIFF, which is a field, and a
         feature slot handed one is refused by name instead of being read as something else. The
         window and the resolution are the planner's to state (acquire.bounds/width/height), as for
         any grid (fromLayer), and only the tiles that window needs are fetched. */
      if (/^(url:)?(https?|s3):\/\//i.test(raw)) {
        if (!wantsRaster) return fail('url-needs-a-grid-slot', { slot: slot, ref: raw, why: 'a URL is read as a GeoTIFF, which is a grid' });
        const made = await fromUrl(raw.replace(/^url:/i, ''), action, cache, readContext);
        if (!made.ok) return made;
        cache.set(raw, made.id);
        return made;
      }

      /* 2c. FEATURES AT A URL — `ogc:https://…/collections/<id>` (an OGC API – Features collection).
         The twin of 2b: only a FEATURE slot takes one, and the answer carries the server's own
         statement of whether more follows (js/gis-ogcapi.js). */
      if (/^ogc:https?:\/\//i.test(raw)) {
        if (wantsRaster) return fail('ogc-needs-a-vector-slot', { slot: slot, ref: raw, why: 'an OGC API – Features collection holds features, not a grid' });
        const made = await fromOgc(raw.replace(/^ogc:/i, ''), action, cache);
        if (!made.ok) return made;
        cache.set(raw, made.id);
        return made;
      }

      /* 2d. A STAC CATALOGUE SEARCH — `stac:https://…/search` (the item-search endpoint). The answer is a
         dataset of the ITEMS (footprints, dates, and one `asset:<key>` column per file), so the way to
         the data is a chain: find, then read the `asset:` address of the row you chose with `url:`. */
      if (/^stac:https?:\/\//i.test(raw)) {
        if (wantsRaster) return fail('ogc-needs-a-vector-slot', { slot: slot, ref: raw, why: 'a STAC search answers with items, which are features; read a file it names with url:' });
        const made = await fromOgc(raw.replace(/^stac:/i, ''), action, cache, true);
        if (!made.ok) return made;
        cache.set(raw, made.id);
        return made;
      }

      /* 3. a dataset the reader named by its title. Two datasets may share one — the reader chose
         both names — so an ambiguous title is REFUSED WITH THE IDS rather than resolved by order of
         registration, which is a choice neither the reader nor the planner made. */
      const byTitle = data.list().filter((d) => String(d.title).toLowerCase() === raw.toLowerCase());
      if (byTitle.length === 1) { cache.set(raw, byTitle[0].id); return { ok: true, id: byTitle[0].id }; }
      if (byTitle.length > 1) return fail('ambiguous-input', { slot: slot, ref: raw, ids: byTitle.map((d) => d.id) });

      /* 4. a layer named by its own id or by the label the reader sees. */
      const rows = mapRefs();
      const hits = rows.filter((r) => {
        const id = r.ref.slice(LAYER_PREFIX.length);
        return id.toLowerCase() === raw.toLowerCase() || String(r.label).toLowerCase() === raw.toLowerCase();
      });
      if (hits.length === 1) {
        const made = await fromLayer(hits[0].ref.slice(LAYER_PREFIX.length), wantsRaster, action, cache);
        if (!made.ok) return made;
        cache.set(raw, made.id);
        return made;
      }
      if (hits.length > 1) return fail('ambiguous-input', { slot: slot, ref: raw, refs: hits.map((r) => r.ref) });

      /* ⚠ THE REFUSAL CARRIES WHAT EXISTS. 「そのデータは無い」 with no list leaves the planner
         guessing, and a planner that guesses spends the whole step budget searching (#R733). */
      return fail('input-unresolved', {
        slot: slot, ref: raw,
        datasets: data.list().map((d) => ({ id: d.id, title: d.title })),
        layers: rows.map((r) => ({ ref: r.ref, label: r.label })),
      });
    }

    async function fromLayer(id, wantsRaster, action, cache) {
      if (!layers) return fail('map-unavailable', { needs: 'IntMapGisLayers' });
      const a = acquireOpts(action, wantsRaster);
      if (!a.ok) return a;
      const note = (r) => {
        if (!r.ok) return fail(r.why, r.detail || { id: id });
        /* ⚠ (#R759) WHAT WAS ACQUIRED IS PART OF THE ANSWER, AND SO IS THE CURSOR. js/gis-layers.js
           hands back `next` when the supplier said there is more, and this door threw it away — so
           「続きを」 was expressible (acquire.cursor) and the one value that makes it usable never
           reached the planner. The row goes back too: its `coverage` is how a planner learns that the
           window it named was only partly answered, BEFORE it writes a sentence about the world. */
        const row = datasetRow(r.dataset);
        if (r.next != null) row.next = r.next;
        row.acquiredFrom = LAYER_PREFIX + id;
        noteAcquired(cache, row);
        return { ok: true, id: r.dataset.id };
      };
      /* ⚠ (#R763) THE PLANNER TAKES THE DOOR THAT WAITS. js/gis-layers.js acquireDataset goes through
         js/gis-sources.js acquire(), which is the only road a supplier that FETCHES can travel — and
         fetching is what a layer nobody has switched on has to do. This call site already awaited
         toRaster two lines down, so waiting costs nothing here. ⚠ The panel keeps toDataset: it calls
         from a click handler without an await, and that contract is not this round's to change. */
      if (!wantsRaster) {
        return note(typeof layers.acquireDataset === 'function'
          ? await layers.acquireDataset(id, a.opts)
          : layers.toDataset(id, a.opts));
      }
      /* A field has to be baked over a window at a resolution, and neither of those is something
         this file may invent: a grid chosen here would be a measurement nobody asked for, printed
         with the authority of one. The planner states them, and is told so by name when it has not. */
      if (a.opts.bounds == null || a.opts.width == null || a.opts.height == null) {
        return fail('raster-sample-needs-window', { layer: id, needs: ['acquire.bounds', 'acquire.width', 'acquire.height'], accepts: layers.acquireFields ? layers.acquireFields('raster') : null });
      }
      return note(await layers.toRaster(id, a.opts));
    }

    /* ══ WHAT STAGE EACH THING REACHED (js/gis-pipeline.js) ═══════════════════════════════════════
       One ledger per session, shared by every reader and by the remote door below, so «Atlas: how far did this get»
       has one answer. ⚠ NOTHING HERE DECIDES: the readers' own refusal codes and measured coverage are classified by
       js/gis-pipeline.js, and the content is looked at by its inspectors — this file only carries the records. */
    let _pipe = null;
    async function pipeline() {
      if (_pipe) return _pipe;
      try { _pipe = (await import('./gis-pipeline.js')).makeGisPipeline({}); } catch (_) { _pipe = null; }
      return _pipe;
    }
    /* the short form a dataset row carries: can this be analysed, and if not, where it stopped */
    function stateOf(P, key) { const v = P.verdict(key); return { analysis: v.analysis, blockedAt: v.blockedAt, say: v.say }; }
    const readFailed = (P, key, why, detail) => P.readFailed(key, why, detail);
    const readSucceeded = (P, key, cov, insp, dsId) => P.readSucceeded(key, cov, insp, dsId);

    /* A COG at a URL becomes a registered raster dataset over the window the planner stated. What
       js/gis-cog.js read, at which level, with how many requests, and what it could not answer
       (`coverage`) travel in the record's provenance — the next op and the planner read them there. */
    async function fromUrl(url, action, cache, readContext) {
      const a = acquireOpts(action, true);
      if (!a.ok) return a;
      if (a.opts.bounds == null || a.opts.width == null || a.opts.height == null) {
        return fail('raster-sample-needs-window', { url: url, needs: ['acquire.bounds', 'acquire.width', 'acquire.height'], accepts: layers && layers.acquireFields ? layers.acquireFields('raster') : null });
      }
      let C = null;
      try { C = (await import('./gis-cog.js')).makeGisCog({ warp: core.warp, crs: core.crs }); } catch (_) { C = null; }
      if (!C) return fail('map-unavailable', { needs: 'IntMapGisCog' });
      const P = await pipeline(), key = 'url:' + url;
      const { ledgerKey, observation } = readContext || {};
      const keys = ledgerKey ? [key, ledgerKey] : [key];
      if (P) for (const k of keys) P.record(k, 'discovered', { status: 'ok', say: 'named by the caller' });
      const r = await C.readWindow(url, { bounds: a.opts.bounds, width: a.opts.width, height: a.opts.height, band: a.opts.band, signal: a.opts.signal || null });
      if (!r.ok) { if (P) for (const k of keys) readFailed(P, k, r.why, r.detail); return fail(r.why, r.detail || { url: url }); }
      const ras = r.raster;
      const bn = (a.opts.band && typeof a.opts.band === 'object') ? a.opts.band : {};
      const band = Object.assign({}, ras.bands[0], {
        name: bn.name != null ? bn.name : (r.band.name != null ? r.band.name : url.split('/').pop()),
        unit: a.opts.unit != null ? String(a.opts.unit) : (bn.unit != null ? bn.unit : (r.band.unit != null ? r.band.unit : null)),
      });
      const cells = ras.read(0);
      const inspection = P?.inspectRaster(cells, { nodata: band.nodata });
      const epochs = typeof observation?.datetime === 'string' ? observation.datetime.split('/').map(Date.parse) : [];
      const time = Number.isFinite(epochs[0]) && (epochs.length === 1 || Number.isFinite(epochs[1]))
        ? { kind: 'constant', start: new Date(epochs[0]).toISOString(), end: epochs.length === 2 ? new Date(epochs[1]).toISOString() : undefined }
        : null;
      let ds;
      try {
        ds = data.add({
          kind: 'raster', title: (action && action.title) ? String(action.title) : (url.split('/').pop() || url),
          sourceCrs: 'EPSG:4326', width: ras.width, height: ras.height,
          grid: { west: ras.grid.west, north: ras.grid.north, pixelLng: ras.grid.pixelLng, pixelLat: ras.grid.pixelLat },
          bands: [band], read: () => cells, time,
          provenance: { kind: 'url-raster', url: url, bounds: a.opts.bounds, width: ras.width, height: ras.height, at: Date.now(), source: r.source, coverage: r.coverage, resampled: 'nearest',
            ...(observation ? { observation } : {}), ...(inspection ? { inspection: { ...inspection, ok: inspection.status === 'ok' } } : {}) },
        });
      } catch (e) { return fail('add-failed', { message: e && e.message }); }
      if (P) {
        for (const k of keys) readSucceeded(P, k, r.coverage, inspection, ds.id);
      }
      const row = datasetRow(ds);
      row.acquiredFrom = 'url:' + url;
      row.coverage = r.coverage;
      if (P) row.acquisition = stateOf(P, key);
      noteAcquired(cache, row);
      return { ok: true, id: ds.id, version: data.versionOf?.(ds.id) };
    }

    /* An OGC API – Features collection becomes a registered vector dataset. The window, the count and
       the cursor are the planner's; what the server could not say is `coverage`, and the server's own
       next link is handed back as `next` (a cursor). ⚠ Conditions and columns are refused BY
       NAME — js/gis-ogcapi.js sends neither through here (time goes as `datetime`), and a server that ignored one would hand back a
       complete-looking answer to a different question. */
    async function fromOgc(url, action, cache, search) {
      const a = acquireOpts(action, false);
      if (!a.ok) return a;
      let G = null;
      try { G = (await import('./gis-ogcapi.js')).makeGisOgcApi(); } catch (_) { G = null; }
      if (!G) return fail('map-unavailable', { needs: 'IntMapGisOgcApi' });
      /* what the source can DO is the source's statement (G.supports); the vocabulary stays js/gis-layers.js's */
      for (const k of Object.keys(a.opts)) {
        const ok = search ? G.supportsSearch : G.supports;
        if (ok.indexOf(k) < 0) return fail('ogc-param-not-supported', { param: k, accepts: ok.slice() });
      }
      const P = await pipeline(), key = (search ? 'stac:' : 'ogc:') + url;
      if (P) P.record(key, 'discovered', { status: 'ok', say: 'named by the caller' });
      const r = await G.readItems(url, { bounds: a.opts.bounds, limit: a.opts.limit, cursor: a.opts.cursor, time: a.opts.time, search: !!search, signal: a.opts.signal || null });
      if (!r.ok) { if (P) readFailed(P, key, r.why, r.detail); return fail(r.why, r.detail || { url: url }); }
      let ds;
      try {
        ds = data.add({
          title: (action && action.title) ? String(action.title) : (url.replace(/\/+$/, '').split('/').pop() || url),
          features: r.features, sourceCrs: 'EPSG:4326',
          provenance: { kind: search ? 'stac-search' : 'url-features', url: url, bounds: a.opts.bounds || null, at: Date.now(), coverage: r.coverage },
        });
      } catch (e) { return fail('add-failed', { message: e && e.message }); }
      if (P) readSucceeded(P, key, r.coverage, P.inspectFeatures(r.features, { box: a.opts.bounds || null }), ds.id);
      const row = datasetRow(ds);
      row.acquiredFrom = (search ? 'stac:' : 'ogc:') + url;
      row.coverage = r.coverage;
      if (P) row.acquisition = stateOf(P, key);
      if (r.next != null) row.next = r.next;
      noteAcquired(cache, row);
      return { ok: true, id: ds.id, version: data.versionOf?.(ds.id) };
    }

    /* ── acquiring, which is a step of its own ───────────────────────────────────────────────── */

    /* ⚠ WHICH DOOR OF THE MAP IS ASKED IS STATED, NOT GUESSED FROM THE LAYER — and the statement is
       read by doorAsked() above, which is also what an `'any'` slot asks. ⚠ The map is what knows
       which rows can be sampled at all
       (`samplable` in mapRows), so a wrong choice is refused BY js/gis-layers.js with the layer's own
       vocabulary rather than pre-judged here out of a list of layer ids. */
    async function acquireOnly(action, cache = makeCache()) {
      const a = action || {};
      const given = Array.isArray(a.inputs) ? a.inputs : (a.inputs == null ? [] : [a.inputs]);
      if (!given.length) {
        return fail('missing-input', { needs: 'inputs', layers: mapRefs().map((r) => r.ref), datasets: data.list().map((d) => d.id) });
      }
      const asked = doorAsked(a);
      if (!asked.ok) return asked;
      const wantsRaster = asked.raster;
      const decl = { kinds: given.map(() => (wantsRaster ? 'raster' : 'vector')) };
      const ids = [];
      for (let i = 0; i < given.length; i++) {
        const r = await resolveRef(given[i], i, decl, cache, a);
        if (!r.ok) return r;
        ids.push(r.id);
      }
      /* The rows are the answer. A ref that already named a registered dataset is reported as it
         stands — 「取ってきた」 と 「もう在った」 は別の事実なので、`acquiredFrom` が付くのは前者だけ。 */
      const made = new Map(cache.acquired.map(({ row }) => [row.id, row]));
      const rows = ids.map((id) => made.get(id) || datasetRow(data.get(id)));
      const more = rows.filter((r) => r.next != null);
      return {
        ok: true, acquired: rows, dataset: rows[0], inputs: ids,
        html: '<div class="atlas-gis-result"><b>' + esc(L('Acquired', '取得しました')) + '</b> — '
          + rows.map((r) => esc(r.title) + ' · ' + r.count + ' ' + esc(r.kind === 'raster' ? L('pixels', '画素') : L('rows', '行')) + ' · <code>' + esc(r.id) + '</code>').join('<br>')
          + '<div class="atlas-gis-next">'
          + esc(more.length
            ? L('More remains for that window — ask again with acquire.cursor.', 'その範囲にはまだ続きがあります — acquire.cursor を付けてもう一度。')
            : L('Use this id as the input of the next step.', 'この id を次の処理の入力に使えます。'))
          + '</div></div>',
      };
    }

    /* ── running one step ───────────────────────────────────────────────────────────────────── */

    /* ── (gis-semantic-layer) 「この比較・結合は意味として妥当か」 ───────────────────────────────────
       js/gis-semantics.js answers it from facts the records already carry (time, quantity, the recipe's
       lineage, the governance vocabulary) and from what a supplier DECLARED. ⚠ IT WARNS, IT DOES NOT
       REFUSE: the step still runs and every result is what it was, so no saved recipe replays differently.
       `strict:true` is the caller's own decision to be refused on a caution, made knowingly.
       ⚠ NOT A SECOND CAPABILITY — `semantics:true` on the same data.gis door asks for the description (no
       op) or the check (with an op) WITHOUT running anything. */
    function semanticsOf() { return core.semantics || null; }
    function warningsHtml(ws) {
      if (!ws || !ws.length) return '';
      return '<div class="atlas-gis-semantic"><b>' + esc(L('Check before you rely on this', 'この結果を使う前の確認')) + '</b><br>'
        + ws.map((w) => esc((w.severity === 'caution' ? '! ' : '') + L(w.message.en, w.message.jp))).join('<br>') + '</div>';
    }
    function describeHtml(descs) {
      return '<div class="atlas-gis-semantic"><b>' + esc(L('What the data means', 'データの意味')) + '</b><br>'
        + descs.map((d) => esc(d.title) + ' — ' + esc(L('not stated: ', '未記述: ') + (d.unstated.join(', ') || '-'))).join('<br>') + '</div>';
    }
    function semanticDescribe(ids) {
      const S = semanticsOf();
      if (!S) return fail('semantics-unavailable', null);
      const descs = ids.map((id) => S.describe(id));
      const bad = descs.find((d) => !d.ok);
      if (bad) return fail(bad.why, bad.detail);
      return { ok: true, semantics: descs, inputs: ids, dataset: datasetRow(data.get(ids[0])), html: '<div class="atlas-gis-result">' + describeHtml(descs) + '</div>' };
    }

    /* ══ (atlas-completion-verdict) EVERY ANSWER OF THIS DOOR STATES WHAT IT READ ══════════════════════
       `datasetsRead` is js/gis-ops.js run()'s record when an op ran (it is the one place every op opens its
       inputs). When no op ran, nothing was opened: a success that only resolved, described or checked its
       inputs (`semantics`, an acquisition) read none of them — `[]` — and a refusal is the inputs it had
       resolved, each `ok:false` with the refusal's code. The ids are the cache's own (every resolveRef
       success files its id there), so no second resolution rule is written here. `opens` is the caller saying that its success DID open the contents (a draw paints
       the features, an export serialises them). A registry that does not
       state the shape (readRecord) leaves the field ABSENT: «not observed», never «read nothing». */
    function withReads(out, cache, op, opens) {
      if (!out || typeof out !== 'object' || Array.isArray(out.datasetsRead)) return out;
      if (!data || typeof data.readRecord !== 'function') return out;
      const ids = Array.from(new Set(cache.values()));
      out.datasetsRead = (out.ok && !opens) ? [] : ids.map((id) => data.readRecord(id, op, !!out.ok, out.ok ? null : out.why));
      return out;
    }
    async function run(action) {
      const a = action || {}, cache = makeCache();
      return withCreated(withReads(await runAction(a, cache), cache, (a.op == null) ? '' : String(a.op)), cache);
    }
    async function runAction(action, cache) {
      const a = action || {};
      const op = (a.op == null) ? '' : String(a.op);
      /* ⚠⚠ (#R759) 取得だけを頼めるようになった。A step with inputs and NO op is an acquisition, and
         until this round there was no way to express one: every route into js/gis-layers.js ran
         through an op's input resolution, so 「まずこの範囲のデータを取って、何が来たか見せて」 —
         the first move of any honest analysis, and the one that tells a planner whether the window it
         chose was answered — could only be made by running some op the reader had not asked for.
         ⚠ NOT A SECOND CAPABILITY. It is the same `data.gis` door and the same argument object: what
         changes is that `op` is absent, which is a fact the caller states rather than a mode it
         selects. js/atlas-console.js therefore needed no new line, and js/atlas-capabilities.js no new
         row — a row per shape is the hand-written list this file exists not to grow. */
      if (op === '' && a.semantics === true) {
        const cacheS = cache, idsS = [];
        for (const g of (Array.isArray(a.inputs) ? a.inputs : (a.inputs == null ? [] : [a.inputs]))) { const r = await resolveRef(g, idsS.length, {}, cacheS, a); if (!r.ok) return r; idsS.push(r.id); }
        if (!idsS.length) return fail('input-count', { op: '', needs: 1, got: 0 });
        return semanticDescribe(idsS);
      }
      if (op === '') return acquireOnly(a, cache);
      const decl = ops.op(op);
      /* Refused WITH the vocabulary, for the reason the resolver above gives. */
      if (!decl) return fail('op-unknown', { op: op, ops: ops.ops().map((d) => d.id) });

      const want = decl.inputs;
      const given = Array.isArray(a.inputs) ? a.inputs : (a.inputs == null ? [] : [a.inputs]);
      if (given.length !== want) return fail('input-count', { op: op, needs: want, got: given.length, declaration: decl });

      const ids = [];
      for (let i = 0; i < given.length; i++) {
        const r = await resolveRef(given[i], i, decl, cache, a);
        if (!r.ok) return r;
        ids.push(r.id);
      }

      const step = { op: op, inputs: ids, params: (a.params && typeof a.params === 'object') ? a.params : {} };
      /* (gis-semantic-layer) the check comes BEFORE the run, so a planner asking only for it pays for nothing. */
      const S = semanticsOf();
      const sem = S ? S.check(step) : null;
      const semWarn = (sem && sem.ok) ? sem.warnings : [];
      if (a.semantics === true) {
        return { ok: true, op: op, inputs: ids, dryRun: true, semantic: { warnings: semWarn, caution: sem && sem.ok ? sem.caution : 0, inputs: ids.map((id) => S && S.describe(id)) },
          dataset: datasetRow(data.get(ids[0])), html: '<div class="atlas-gis-result"><b>' + esc(op) + '</b> — ' + esc(L('checked, not run', '確認のみ（実行していません）')) + (semWarn.length ? warningsHtml(semWarn) : '<br>' + esc(L('No semantic warning from what is stated.', '述べられている範囲では意味上の警告はありません。'))) + '</div>' };
      }
      if (a.strict === true && sem && sem.ok && sem.caution > 0) return fail('semantic-mismatch', { op: op, warnings: semWarn.filter((w) => w.severity === 'caution') });
      if (a.title != null && String(a.title).trim() !== '') step.title = String(a.title);
      const res = await ops.run(step, { signal: a.signal || null, onProgress: a.onProgress || null });
      /* ⚠ THE DECLARATION RIDES ON A REFUSED STEP. Every refusal js/gis-ops.js makes about a
         parameter names the parameter; what it cannot know is that its caller is a planner who has
         never seen the op's shape. Handing the shape back is what turns one wrong call into one
         corrected call instead of a search. */
      if (!res.ok) {
        const d = Object.assign({}, res.detail || {}, { declaration: decl });
        return { ok: false, why: res.why, detail: d, declaration: decl, html: refusalHtml(res.why, d), datasetsRead: res.datasetsRead };
      }

      const row = datasetRow(res.dataset);
      const out = { ok: true, op: op, inputs: ids, dataset: row, stats: res.stats || null, datasetsRead: res.datasetsRead, datasetsCreated: createdReceipt(row) };
      if (semWarn.length) out.semantic = { warnings: semWarn, caution: sem.caution };
      /* (#R759) 何をどこから取ったか、そしてまだ続きがあるか。See fromLayer. */
      if (cache.acquired && cache.acquired.length) out.acquired = cache.acquired.map(({ row }) => row);
      const st = statsText(res.stats);
      out.html = '<div class="atlas-gis-result"><b>' + esc(op) + '</b> → ' + esc(row.title)
        + ' · ' + row.count + ' ' + esc(row.kind === 'raster' ? L('pixels', '画素') : L('rows', '行'))
        + ' · <code>' + esc(row.id) + '</code>'
        + (st ? ' — ' + esc(st) : '')
        + '<div class="atlas-gis-next">' + esc(L('Use this id as the input of the next step.', 'この id を次の処理の入力に使えます。')) + '</div>' + warningsHtml(semWarn) + '</div>';

      return out;
    }

    /* ── drawing a dataset, which is a different promise ─────────────────────────────────────── */

    /* ⚠ SEPARATE FROM run() ON PURPOSE, AND THE REASON IS THE VERIFIER (#R736/#R737). A step that
       draws only when it is asked to cannot honestly declare 「地図に書き込む」: the observer would
       measure a map that did not move and call a correct answer `not_rendered` — which this project
       has already shipped once, and spent 21 tool calls and ten minutes of a turn re-trying a map
       that was right the first time. One capability that computes and promises nothing about the
       map, one that draws and promises exactly that. It is also what the panel does: making a
       dataset and 「地図に描く」 are two buttons, not one. */
    async function draw(action) {
      const a = action || {};
      const cache = makeCache();
      const said = (out) => withCreated(withReads(out, cache, 'draw', true), cache);   /* (atlas-completion-verdict) see withReads */
      const r = await resolveRef(a.dataset, 0, {}, cache, a);
      if (!r.ok) return said(r);
      const ds = data.get(r.id);
      /* ⚠ (#R752) THIS CALL USED TO BE `core.draw(r.id)` — NO SECOND ARGUMENT AT ALL. js/gis-core.js
         drawRaster() reads `band` and `spec` and the comment directly above it says 「AND THE BAND IS
         THE CALLER'S TO NAME. A grid with three bands has three pictures in it, and choosing one
         silently would be this project's 「誰も述べていない主張」 in colour」 — and the Atlas door
         was choosing one silently, every time, because it passed nothing. A reader who asked for the
         second band got the first one and was told it had been drawn.
         ⚠ THE FIELDS ARE THE SCHEMA'S. js/atlas-schemas.js declares what `map.drawDataset` accepts;
         a field this reader takes that the schema does not declare is unreachable, and a field the
         schema declares that this reader drops is silently ignored — [[intmap-two-readers-one-field-list]]
         measured both halves of that in production. tests/atlas-gis-checks.test.mjs (#R752) measures the pair. */
      const d = core.draw(r.id, { band: a.band, spec: a.spec || null });
      if (!d.ok) return said(fail(d.why, Object.assign({ id: r.id }, d.detail || {})));
      return said({
        ok: true, drawn: true, dataset: datasetRow(ds), sid: d.sid || null,
        band: (d.band == null) ? null : d.band,
        html: '<div class="atlas-gis-result">' + esc(L('Drawn on the map', '地図に描きました')) + ': '
          + esc(ds.title) + ' · ' + ds.count + ' ' + esc(L('rows', '行')) + '</div>',
      });
    }

    /* ── taking a dataset out of the app as a file ───────────────────────────────────────────── */

    /* ⚠ THE DOOR IS THE PANEL'S DOOR. js/gis-panel.js's 「ファイルに書き出す」 calls
       IntMapGisExport.write(id, {format}) and saves what comes back; Atlas could draw a dataset and
       could not hand it to the reader, so 「この結果を KML で」 had nothing to call. This is the same
       call, and nothing in it is decided here: THE FORMATS ARE THE WRITER'S OWN DECLARATION (a
       refusal that names none answers with every id, `export-format-unknown` the same), and every
       refusal — a polygon asked of GPX, a CRS the file cannot state — travels back by its own code
       and detail. A write that succeeded and could not be saved is said to be exactly that.
       ⚠ THE ANSWER'S SENTENCE IS BUILT FROM `stated`, never from what the format is assumed to do:
       what the file did NOT keep comes first, because a line that opens with 「書き出しました」 and
       mentions the lost rows at the end is read as a success. */
    async function exportDataset(action) {
      const cache = makeCache();
      return withReads(await exportWith(action, cache), cache, 'export', true);
    }
    async function exportWith(action, cache) {
      const a = action || {};
      const r = await resolveRef(a.dataset, 0, {}, cache, a);
      if (!r.ok) return r;
      let X = null;
      try { X = (await import('./gis-export.js')).makeGisExport(); } catch (_) { X = null; }
      if (!X || typeof X.write !== 'function') return fail('map-unavailable', { needs: 'IntMapGisExport' });
      const opts = { format: a.format };
      for (const k of ['band', 'bands', 'dataType']) if (a[k] != null) opts[k] = a[k];
      const res = X.write(r.id, opts);
      if (!res || res.ok === false) return fail((res && res.why) || 'export-serialise-failed', Object.assign({ id: r.id }, (res && res.detail) || {}));
      if (!X.save(res)) return fail('export-not-saved', { id: r.id, filename: res.filename, reason: 'this environment has no way to save a file' });
      const st = res.stated || {};
      const lost = [];
      if (st.rowsWithoutGeometry) lost.push(L('rows with no shape: ', '図形を持たない行: ') + st.rowsWithoutGeometry);
      if (st.geometry === 'wkt' && st.geometryRoundTrip === false) lost.push(L('the shapes are WKT text and read back as attributes only', '図形は WKT のテキストで、読み直すと属性だけになります'));
      if (st.charactersRemoved) lost.push(L('characters XML cannot hold, removed: ', 'XML に書けず取り除いた文字: ') + st.charactersRemoved);
      if (st.cellsNotWritten || st.nonFiniteCells) lost.push(L('values with no notation in this format, left out: ', 'この形式に表記が無く書かなかった値: ') + (st.cellsNotWritten || st.nonFiniteCells));
      if (st.time && st.time.notCarried) lost.push(L('declared time values that are not valid dates in this format (kept as attributes): ', 'この形式の日時として書けず属性のまま残した時刻: ') + st.time.notCarried);
      const kept = [];
      if (st.license != null) kept.push(L('licence carried: ', 'ライセンスを入れました: ') + st.license);
      else kept.push(st.provenanceCarried ? L('the dataset states no licence, so the file claims none', 'ライセンスの記載が無いため、ファイルにも書いていません') : L('this format carries no origin (GeoJSON does)', 'この形式は出典を運びません（GeoJSON は運びます）'));
      const parts = lost.concat(kept);
      return {
        ok: true, exported: true, format: res.format, filename: res.filename, bytes: res.bytes.length, stated: st,
        dataset: datasetRow(data.get(r.id)),
        html: '<div class="atlas-gis-result">' + esc(L('Saved as a file', 'ファイルに書き出しました')) + ': ' + esc(res.filename)
          + ' · ' + esc(res.format) + (parts.length ? '<div class="atlas-gis-detail">' + parts.map(esc).join('<br>') + '</div>' : '') + '</div>',
      };
    }

    /* ⚠ (#R819) 申告と実測を並べる扉。describe() carries the CLAIM — capabilitiesOf(), read off the
       registration, free — and this one MEASURES it through the same doors a caller uses and names
       every place the two disagree. They are separate because they cost differently: an audit
       ACQUIRES, so making a catalogue would make a catalogue fetch from every source on the map.
       ⚠ NOTHING IS JUDGED HERE. js/gis-sources.js auditCapabilities() is the one implementation and
       its refusals (`layer-unknown`, `bad-param`, a supplier's own failure) travel back by name. */
    async function capabilities(ref, opts) {
      const S = SOURCES();
      if (!S || typeof S.auditCapabilities !== 'function') return fail('map-unavailable', { needs: 'IntMapGisSources' });
      const raw = (ref == null) ? '' : String(ref).trim();
      const id = (raw.slice(0, LAYER_PREFIX.length) === LAYER_PREFIX) ? raw.slice(LAYER_PREFIX.length) : raw;
      const r = await S.auditCapabilities(id, opts || {});
      if (!r || r.ok !== true) return fail((r && r.why) || 'map-unavailable', (r && r.detail) || { id: id });
      return r;
    }

    /* ══ (data-supply) DATA THAT IS NOT IN THE APP ═══════════════════════════════════════════════
       catalogue() lists what THIS app holds; js/gis-remote.js asks the catalogues of the world (STAC,
       OGC API – Features) and reads a remote Cloud-Optimised GeoTIFF by HTTP range. ⚠ NOTHING IS
       JUDGED HERE: the module's refusals travel back by name, the datasets it makes are ordinary
       registry records (so `inputs` of the next step), and what it says about completeness is
       js/gis-sources.js coverageOf()'s verdict plus `evidence` — never a second one. */
    let _remote = null;
    async function remote(action) {
      const a = action || {};
      /* ⚠ ONE INSTANCE PER SESSION. It used to be built on every call, which threw away what a call had learnt: a catalogue
         added with `add` was gone by the next `discover`, and the 10-minute collection cache never served anything. The ledger
         (js/gis-pipeline.js) is the same instance the readers write to. */
      const P = await pipeline();
      let M = _remote;
      if (!M) {
        try {
          M = (await import('./gis-remote.js')).makeGisRemote({
            /* the CRS engine and the warp are looked up by the module itself at call time */
            data: data, raster: core.raster, geometry: core.geometry, sources: SOURCES(), pipeline: P,
            /* the readers acquire() uses are the door's own — a grid or features at an address, through resolveRef */
            readGrid: (href, w) => resolveRef('url:' + href, 0, { kinds: ['raster'] }, makeCache(), { acquire: { bounds: w.bounds, width: w.width, height: w.height, band: w.band, signal: w.signal || undefined } }, { ledgerKey: w.ledgerKey, observation: w.observation }),
            readFeatures: (url, w) => resolveRef('ogc:' + url, 0, { kinds: ['vector'] }, makeCache(), { acquire: { bounds: w.bounds, limit: w.limit, time: w.time } }),
          });
        } catch (_) { M = null; }
        _remote = M;
      }
      if (!M) return fail('map-unavailable', { needs: 'IntMapGisRemote' });
      const act = (a.action == null || a.action === '') ? 'discover' : String(a.action);
      /* the actions are the module's own declaration (plus the one this door answers itself) */
      const ACTS = M.actions().concat('sources', 'status', 'facts');
      if (ACTS.indexOf(act) < 0) return fail('bad-param', { param: 'action', actions: ACTS });
      const win = (a.bounds != null) ? a.bounds : a.bbox;
      const give = (r) => (r && r.ok === false) ? fail(r.why, r.detail || null) : r;
      const registered = (receipts) => [...new Map(receipts.map((r) => [r.id, r])).values()];
      /* what the app's OWN sources can supply — every claim and every silence, asked of nobody */
      if (act === 'sources') {
        const S = SOURCES();
        if (!S || typeof S.capabilityTable !== 'function') return fail('map-unavailable', { needs: 'IntMapGisSources' });
        const t = S.capabilityTable();
        const u = t.summary.unstated;
        return Object.assign({}, t, { html: '<div class="atlas-gis-result"><b>' + esc(L('What the sources of this app state they can supply', 'このアプリの供給元が述べている取得能力')) + '</b> — ' + t.summary.total
          + '<div class="atlas-gis-detail">' + esc(L('stated nothing about: ', '何も述べていない項目: ')) + esc('extent ' + u.extent + ' · time ' + u.time + ' · end ' + u.boundedEnd + ' · offscreen ' + u.offscreen) + '</div></div>' });
      }
      /* (data-facts) 分析の前に、同梱データが述べていること——対象時点・範囲・測り方・細かさ・完全性・精度・更新周期——を
         機械可読に渡す。値は data/data-facts.json（各 builder の GOVERNANCE 宣言から scripts/data-governance.mjs が
         生成し、check:datagov が突き合わせる）だけから来る。述べていない欄は `unstated` に挙がり、補わない。
         `ref` に複数（カンマ区切り）を渡すと、対象時点が重ならない組を temporalMismatch が述べる——
         「2020 年の人口と 2025 年の行政区画」のような別の時点の世界の結合を、結合する前に警告できる。 */
      if (act === 'facts') {
        let reg = null;
        try { reg = await jsonWithin('data/data-facts.json', 25000); } catch (_) { reg = null; }
        if (!reg || !reg.subjects) return fail('facts-unavailable', { needs: 'data/data-facts.json' });
        const names = Object.keys(reg.subjects);
        const stem = (s) => String(s).replace(/^data\//, '').replace(/\.(json|js|bin)(\.gz)?$/, '');
        const asked = (a.ref == null || a.ref === '') ? [] : String(a.ref).split(',').map((x) => x.trim()).filter(Boolean);
        if (!asked.length) {
          return { ok: true, subjects: names.map((n) => ({ subject: n, period: reg.subjects[n].describes.period != null, cadence: reg.subjects[n].cadence })), html: '<div class="atlas-gis-result"><b>' + esc(L('Datasets with a declared description', '説明が宣言されているデータ')) + '</b> — ' + names.length + '<br>' + esc(L('pass ref to read one', 'ref を渡すと 1 件ずつ読めます')) + '</div>' };
        }
        const found = [], missing = [];
        for (const q of asked) {
          const hit = names.find((n) => n === q) || names.find((n) => stem(n) === stem(q));
          if (hit) found.push(Object.assign({ subject: hit }, reg.subjects[hit])); else missing.push(q);
        }
        const mm = found.length > 1 ? temporalMismatch(found.map((f) => ({ id: f.subject, period: f.describes.period, asOf: f.asOf }))) : null;
        return { ok: true, facts: found, notDeclared: missing, timeMismatch: mm,
          html: '<div class="atlas-gis-result"><b>' + esc(L('What these datasets state about themselves', 'データ自身が述べていること')) + '</b><br>'
            + found.map((f) => '<code>' + esc(f.subject) + '</code> · ' + esc(Object.keys(f.describes).join(', ') || L('no description stated', '説明の宣言なし')) + ' · ' + esc(L('cadence', '更新周期')) + ' ' + esc(f.cadence == null ? L('not stated', '未申告') : f.cadence + ' (' + (f.cadenceBasis || '?') + ')')).join('<br>')
            + (missing.length ? '<div class="atlas-gis-detail">' + esc(L('not in the registry: ', '台帳に無い: ')) + esc(missing.join(', ')) + '</div>' : '')
            + (mm && mm.pairs.length ? '<div class="atlas-gis-detail">' + esc(L('PERIODS DO NOT OVERLAP: ', '対象時点が重なりません: ')) + esc(mm.pairs.map((p) => p.a + ' / ' + p.b + ' (' + p.gapYears + ' y)').join('; ')) + '</div>' : '') + '</div>' };
      }
      /* what stage each thing reached, for one reference or for all of them (js/gis-pipeline.js) */
      if (act === 'status') {
        if (!P) return fail('map-unavailable', { needs: 'IntMapGisPipeline' });
        const one = a.ref != null && a.ref !== '';
        const v = one ? P.verdict(String(a.ref).replace(/^remote:/, '')) : null;
        const all = one ? null : P.list();
        const line = (x) => '<code>' + esc(x.ref) + '</code> · ' + esc(x.analysis) + (x.blockedAt ? ' · ' + esc(L('stopped at', '止まった段')) + ' ' + esc(x.blockedAt) : '') + ' — ' + esc(x.say);
        return { ok: true, state: v, states: all, summary: P.summary(), catalogHealth: P.catalogHealth(),
          html: '<div class="atlas-gis-result"><b>' + esc(L('How far each dataset got', '各データがどの段まで進んだか')) + '</b><br>' + (one ? line(v) : (all.length ? all.slice(0, 40).map(line).join('<br>') : esc(L('nothing has been discovered or read in this session', 'このセッションではまだ何も発見・取得していません')))) + '</div>' };
      }
      if (act === 'catalogs') {
        const cs = M.catalogs();
        return { ok: true, catalogs: cs, html: '<div class="atlas-gis-result"><b>' + esc(L('Catalogues that are asked', '問い合わせるカタログ')) + '</b><br>'
          + cs.map((c) => esc(c.id) + ' · ' + esc(c.kind) + ' · ' + esc(c.label)).join('<br>') + '</div>' };
      }
      if (act === 'add') {
        const r = give(M.add({ id: a.id, kind: a.kind, url: a.url, label: a.label, operator: a.operator }));
        return r.ok === false ? r : Object.assign({}, r, { html: '<div class="atlas-gis-result">' + esc(L('Catalogue added', 'カタログを追加しました')) + ': <code>' + esc(r.catalog.id) + '</code></div>' });
      }
      if (act === 'discover') {
        const r = give(await M.discover({ q: a.q, bbox: win, time: a.time, catalogs: a.catalogs, kinds: a.kinds, limit: a.limit, signal: a.signal || null }));
        if (r.ok === false) return r;
        const silent = r.catalogs.filter((c) => !c.answered);
        return Object.assign({}, r, { html: '<div class="atlas-gis-result"><b>' + esc(L('Datasets found', '見つかったデータセット')) + '</b> — ' + r.total + '<br>'
          + r.entries.map((e) => '<code>' + esc(e.ref) + '</code> ' + esc(e.title) + ' · ' + esc(e.match.spatial) + '/' + esc(e.match.temporal) + ' · ' + esc(e.rights.license == null ? L('licence not stated', 'ライセンス記載なし') : e.rights.license)).join('<br>')
          + (silent.length ? '<div class="atlas-gis-detail">' + esc(L('NOT ANSWERED (this is not "nothing there"): ', '応答なし（「無かった」ではありません）: ')) + silent.map((c) => c.id + ' (' + c.why + ')').join(', ') + '</div>' : '')
          + '<div class="atlas-gis-next">' + esc(r.note) + '</div></div>' });
      }
      if (act === 'inspect') {
        const r = give(await M.inspect(a.ref, { bbox: win, signal: a.signal || null }));
        return r.ok === false ? r : Object.assign({}, r, { html: '<div class="atlas-gis-result"><b>' + esc(r.collection.title) + '</b> · <code>' + esc(r.ref) + '</code><br>'
          + esc(L('licence', 'ライセンス')) + ': ' + esc(r.collection.rights.license == null ? L('not stated', '記載なし') : r.collection.rights.license)
          + '<br>' + esc(JSON.stringify(r.evidence)) + '<br>' + esc(L('read it with', '読むには')) + ': <code>' + esc([r.refs.features].concat(r.refs.grids).join('</code> <code>')) + '</code></div>' });
      }
      if (act === 'search' || act === 'follow') {
        /* until:"ready" returns the first candidate whose data was read and found usable and leaves the rest of the search running; follow:<handle> (or action follow) returns the finished list */
        const handle = act === 'follow' ? (a.follow != null ? a.follow : a.ref) : a.follow;
        const r = give(handle != null && handle !== '' ? await M.follow(handle) : await M.search({ q: a.q, bbox: win, time: a.time, maxGsd: a.maxGsd, minGsd: a.minGsd, maxCloud: a.maxCloud, licensed: a.licensed, kinds: a.kinds, origins: a.origins, strict: a.strict, catalogs: a.catalogs, limit: a.limit, items: a.items, until: a.until, width: a.width, height: a.height, band: a.band, asset: a.asset, signal: a.signal || null }));
        if (r.ok === false) return r;
        const silent = r.catalogs.filter((c) => !c.answered);
        const earlyHtml = r.early ? '<div class="atlas-gis-detail"><b>' + esc(L('READY NOW (first usable candidate, data read and inspected)', 'すぐ使える候補（データを実際に読んで確認済み）')) + '</b>: <code>' + esc(r.early.ref) + '</code> · ' + esc(r.early.state.analysis) + (r.early.datasets.length ? ' · ' + esc(L('datasets', 'データセット')) + ' <code>' + esc(r.early.datasets.join(', ')) + '</code>' : '') + '<br>' + esc(L('still asking: ', 'まだ問い合わせ中: ')) + esc(r.stillAsking.join(', ') || '-') + ' · ' + esc(L('finished list: search with follow:', '完了後の一覧: follow を指定して search: ')) + '<code>' + esc(r.follow) + '</code></div>' : '';
        const newReceipts = handle == null || handle === '' ? r.early?.datasetsCreated || (r.acquisitionAttempts || []).flatMap((hit) => hit.datasetsCreated) : [];
        return Object.assign({}, r, { datasetsCreated: registered(newReceipts), html: '<div class="atlas-gis-result"><b>' + esc(L('Datasets matching', '条件に合うデータセット')) + '</b> — ' + (r.total == null ? esc(L('(early, list unfinished)', '（先着・一覧は未完了）')) : r.total) + earlyHtml + '<br>'
          + r.entries.map((e) => '<code>' + esc(e.ref) + '</code> ' + esc(e.title) + ' · ' + esc([e.match.spatial, e.match.temporal, e.match.resolution].join('/')) + (e.resolution ? ' · ' + esc(String(e.resolution.min)) + ' m' : '') + ' · ' + esc(e.rights.license == null ? L('licence not stated', 'ライセンス記載なし') : e.rights.license)).join('<br>')
          + (silent.length ? '<div class="atlas-gis-detail">' + esc(L('NOT ANSWERED (this is not "nothing there"): ', '応答なし（「無かった」ではありません）: ')) + esc(silent.map((c) => c.id + ' (' + (c.kind_of_silence || c.why) + ')').join(', ')) + '</div>' : '')
          + '<div class="atlas-gis-next">' + esc(r.note) + '</div></div>' });
      }
      if (act === 'items') {
        const r = give(await M.items(a.ref, { bbox: win, time: a.time, limit: a.limit, maxCloud: a.maxCloud, strict: a.strict, signal: a.signal || null }));
        return r.ok === false ? r : Object.assign({}, r, { html: '<div class="atlas-gis-result"><b>' + esc(a.ref) + '</b> — ' + r.returned + (r.matched != null ? ' / ' + r.matched : '') + (r.continues ? ' (+)' : '') + '<br>'
          + r.items.map((x) => esc(x.id) + ' · ' + esc(String(x.datetime)) + (x.gsd != null ? ' · ' + esc(String(x.gsd)) + ' m' : '') + (x.cloud != null ? ' · cloud ' + esc(String(x.cloud)) + '%' : '')).join('<br>') + '</div>' });
      }
      if (act === 'scenes') {
        const r = give(await M.scenes({ bbox: win, time: a.time, modality: a.modality, maxCloud: a.maxCloud, catalogs: a.catalogs, perModality: a.perModality, limit: a.limit, signal: a.signal || null }));
        if (r.ok === false) return r;
        const silent = r.catalogs.filter((c) => !c.answered);
        const lic = (x) => esc(x.license == null ? L('licence not stated', 'ライセンス記載なし') : x.license);
        const kinds = Object.keys(r.result).map((k) => {
          const m = r.result[k];
          return '<div class="atlas-gis-detail"><b>' + esc(k) + '</b> — ' + m.found + (m.periodApplied ? '' : ' (' + esc(L('period not applied', '期間は適用していません')) + ')') + '<br>'
            + (m.found ? m.scenes.slice(0, 8).map((x) => '<code>' + esc(x.collection) + '</code> ' + esc(x.id) + ' · ' + esc(String(x.datetime)) + (x.cloud != null ? ' · cloud ' + esc(String(x.cloud)) + '%' : '') + (x.gsd != null ? ' · ' + esc(String(x.gsd)) + ' m' : '') + (x.sar ? ' · ' + esc([x.sar.mode, (x.sar.polarizations || []).join('+')].filter(Boolean).join(' ')) : '') + ' · ' + lic(x)).join('<br>')
              : esc(L('NONE: ', '無し: ')) + esc(m.none.say)) + '</div>';
        }).join('');
        return Object.assign({}, r, { html: '<div class="atlas-gis-result"><b>' + esc(L('Satellite, SAR, LiDAR and elevation data found', '見つかった衛星・SAR・LiDAR・標高データ')) + '</b>' + kinds
          + (r.excluded.length ? '<div class="atlas-gis-detail">' + esc(L('NOT OFFERED (non-commercial licence): ', '提供しない（非商用ライセンス）: ')) + esc(r.excluded.map((x) => x.ref + ' (' + x.license + ')').join(', ')) + '</div>' : '')
          + (silent.length ? '<div class="atlas-gis-detail">' + esc(L('NOT ANSWERED (this is not "nothing there"): ', '応答なし（「無かった」ではありません）: ')) + esc(silent.map((c) => c.id + ' (' + c.why + ')').join(', ')) + '</div>' : '')
          + '<div class="atlas-gis-next">' + esc(r.note) + '</div></div>' });
      }
      if (act === 'acquire') {
        const r = give(await M.acquire(a.ref, { bbox: win, time: a.time, width: a.width, height: a.height, limit: a.limit, band: a.band, asset: a.asset, maxCloud: a.maxCloud, maxGsd: a.maxGsd, minGsd: a.minGsd, strict: a.strict, signal: a.signal || null }));
        if (r.ok === false) return r;
        const st = r.state;
        return Object.assign({}, r, { datasetsCreated: r.datasetsCreated || [], html: '<div class="atlas-gis-result"><b>' + esc(r.ref) + '</b> · ' + esc(st.analysis) + (st.blockedAt ? ' · ' + esc(L('stopped at', '止まった段')) + ' ' + esc(st.blockedAt) : '') + '<br>' + esc(st.say)
          + (r.parts.length > 1 ? '<br>' + r.parts.map((x) => esc(x.label) + ': ' + esc(x.state ? x.state.analysis + (x.state.blockedAt ? ' @' + x.state.blockedAt : '') : '—')).join(' · ') : '')
          + (r.datasets.length ? '<br>' + esc(L('datasets', 'データセット')) + ': <code>' + esc(r.datasets.join(', ')) + '</code>' : '') + '</div>' });
      }
      return fail('bad-param', { param: 'action', actions: ACTS });
    }

    /* ══ (overture-maps) THE WORLD'S BUILDINGS, PLACES, ROADS AND BORDERS, READ BY WINDOW ═════════════
       js/gis-overture.js reads Overture Maps' GeoParquet release by the window the planner names — the files
       whose stated extent meets it, the row groups whose statistics meet it, the columns the conditions need —
       and registers the rows as an ordinary dataset (the input of the next step). ⚠ NOTHING IS JUDGED HERE:
       the module's refusals travel back by name, and the three claims a count cannot tell apart (this release
       was read for the window / a row's box meets the window / this is everything that exists) stay separate
       in the answer — the third is always "unproven". A licence is the verbatim set the rows state. */
    async function overture(action) {
      const a = action || {};
      let M = null;
      try { M = (await import('./gis-overture.js')).makeGisOverture({ data: data, sources: SOURCES() }); } catch (_) { M = null; }
      if (!M) return fail('map-unavailable', { needs: 'IntMapGisOverture' });
      const act = (a.action == null || a.action === '') ? 'plan' : String(a.action);
      const ACTS = M.actions();
      if (ACTS.indexOf(act) < 0) return fail('bad-param', { param: 'action', actions: ACTS });
      const win = (a.bounds != null) ? a.bounds : a.bbox;
      const give = (r) => (r && r.ok === false) ? fail(r.why, r.detail || null) : r;
      const ask = { theme: a.theme, type: a.type, bbox: win, where: a.where, columns: a.columns, limit: a.limit, version: a.release, signal: a.signal || null };
      if (act === 'release') {
        const r = give(await M.release({ version: a.release, signal: a.signal || null }));
        return r.ok === false ? r : Object.assign({}, r, { html: '<div class="atlas-gis-result"><b>Overture Maps</b> · ' + esc(r.version) + ' (' + esc(r.asOf) + ')<div class="atlas-gis-detail">'
          + esc(L('releases: ', 'リリース: ')) + esc(r.releases.join(', ')) + '</div></div>' });
      }
      if (act === 'themes') {
        const r = give(await M.themes({ version: a.release, signal: a.signal || null }));
        return r.ok === false ? r : Object.assign({}, r, { html: '<div class="atlas-gis-result"><b>Overture ' + esc(r.release.version) + '</b><br>'
          + r.themes.map((t) => esc(t.theme) + ': ' + esc(t.types.map((x) => x.type).join(', '))).join('<br>') + '</div>' });
      }
      if (act === 'plan') {
        const r = give(await M.plan(ask));
        return r.ok === false ? r : Object.assign({}, r, { html: '<div class="atlas-gis-result"><b>' + esc(r.theme + '/' + r.type) + '</b> · ' + esc(r.release.version) + ' — '
          + r.files.length + ' / ' + r.filesTotal + ' ' + esc(L('files meet the window', 'ファイルが窓に掛かります')) + '</div>' });
      }
      const r0 = (act === 'acquire') ? give(await M.acquire(Object.assign({}, ask, { title: a.title }))) : give(await M.query(ask));
      if (r0.ok === false) return r0;
      const rd = (act === 'acquire') ? r0.result : { count: r0.count, read: r0.read, release: r0.release.version, licences: r0.licences };
      const head = '<div class="atlas-gis-result"><b>Overture ' + esc(rd.release) + '</b> — ' + rd.count + ' ' + esc(L('rows', '行'));
      const tail = '<div class="atlas-gis-detail">' + esc(L('read: ', '読み取り: ')) + esc(rd.read.rowGroups.read + '/' + rd.read.rowGroups.total + ' row groups · ' + Math.round(rd.read.bytes / 1e6) + ' MB · ' + Math.round(rd.read.ms / 100) / 10 + ' s')
        + '<br>' + esc(L('licence stated by the rows: ', '行が述べているライセンス: ')) + esc(rd.licences.length ? rd.licences.join('; ') : L('none stated', '記載なし')) + '</div></div>';
      if (act === 'acquire') return { ok: true, dataset: r0.dataset ? datasetRow(r0.dataset) : { id: r0.id }, datasetsCreated: r0.dataset ? createdReceipt(r0.dataset) : [], id: r0.id, coverage: r0.coverage, result: rd, html: head + ' → <code>' + esc(r0.id) + '</code>' + tail };
      return { ok: true, count: r0.count, read: r0.read, licences: r0.licences, worldCompleteness: r0.worldCompleteness, windowTest: r0.windowTest,
        sample: r0.features.slice(0, 10).map((f) => f.properties), html: head + tail };
    }

    const API = {
      catalogue, run, draw, acquire: acquireOnly,
      /* (data-supply) 世界のカタログの発見・検査（読むのは url: / ogc: / stac: の入力） */
      remote,
      /* (overture-maps) Overture Maps の窓単位の読み取り（release / themes / plan / query / acquire） */
      overture,
      /* the file a reader takes away (js/gis-export.js's formats, not a list kept here) */
      export: exportDataset,
      /* (#R819) 供給元の能力——申告は describe() の `query.capabilities`、実測はこの扉。 */
      capabilities,
      /* (#R783) 取得する前に供給元が述べていること。One surface for the panel, Atlas and an external
         reader; `describe(ref)` is one source, `catalogue().layers` is all of them. */
      describe,
      describeDataset: (id) => { const ds = data.get(id); return ds ? { ...datasetRow(ds), version: data.versionOf?.(id) } : null; },
      /* the vocabularies, published from the file that decides them rather than copied into a check
         (the same argument js/gis-sources.js completenessValues/coverageReasons are written for) */
      prefetchSlots: () => PREFETCH_SLOTS.slice(),
      prefetchSubjects: () => PREFETCH_SUBJECTS.slice(),
      resolve: (ref, slot, decl, action) => resolveRef(ref, slot || 0, decl || {}, makeCache(), action || {}),
    };
    return API;
  })();
}
