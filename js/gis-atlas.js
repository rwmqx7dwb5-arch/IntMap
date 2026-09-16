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
        const M = (typeof window !== 'undefined') ? window.IntMapLang : null;
        const lang = (typeof window !== 'undefined' && window.IntMapHost && window.IntMapHost.lang) || (M && M.current && M.current()) || 'en';
        if (M && typeof M.t === 'function') return M.t(lang, en, jp);
      } catch (_) { }
      return en;
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

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

    function datasetRow(ds) {
      const row = { id: ds.id, title: ds.title, kind: ds.kind || 'vector', count: ds.count };
      if (ds.geometryType) row.geometryType = ds.geometryType;
      const fields = (ds.fields || []).map((f) => f && f.name).filter(Boolean);
      if (fields.length) row.fields = fields;
      return row;
    }

    function mapRows() {
      if (!layers || typeof layers.sources !== 'function') return [];
      let list = [];
      try { list = layers.sources() || []; } catch (_) { list = []; }
      return list.map((s) => ({
        ref: 'layer:' + s.id, label: s.label, geometryType: s.geometryType || null, count: s.count,
        /* A numeric layer has no features to copy and IS readable as a grid — the two are different
           doors (toDataset / toRaster) and a planner that cannot tell them apart asks for the wrong
           one. The map is asked; nothing here holds a list of which layers are fields. */
        samplable: !!(layers.canSample && layers.canSample(s.id)),
      }));
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
    function makeCache() { return new Map(); }

    async function resolveRef(ref, slot, decl, cache, action) {
      const raw = (ref == null) ? '' : String(ref).trim();
      if (!raw) return fail('missing-input', { slot: slot });
      if (cache.has(raw)) return { ok: true, id: cache.get(raw) };

      /* 1. an id the registry already holds. */
      const direct = data.get(raw);
      if (direct) { cache.set(raw, direct.id); return { ok: true, id: direct.id }; }

      /* 2. a layer of the map, named as one. */
      const wantsRaster = Array.isArray(decl.kinds) && decl.kinds[slot] === 'raster';
      if (raw.slice(0, LAYER_PREFIX.length) === LAYER_PREFIX) {
        const made = await fromLayer(raw.slice(LAYER_PREFIX.length), wantsRaster, action);
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
      const rows = mapRows();
      const hits = rows.filter((r) => {
        const id = r.ref.slice(LAYER_PREFIX.length);
        return id.toLowerCase() === raw.toLowerCase() || String(r.label).toLowerCase() === raw.toLowerCase();
      });
      if (hits.length === 1) {
        const made = await fromLayer(hits[0].ref.slice(LAYER_PREFIX.length), wantsRaster, action);
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

    async function fromLayer(id, wantsRaster, action) {
      if (!layers) return fail('map-unavailable', { needs: 'IntMapGisLayers' });
      if (!wantsRaster) {
        const r = layers.toDataset(id, {});
        return r.ok ? { ok: true, id: r.dataset.id } : fail(r.why, r.detail || { id: id });
      }
      /* A field has to be baked over a window at a resolution, and neither of those is something
         this file may invent: a grid chosen here would be a measurement nobody asked for, printed
         with the authority of one. The planner states them, and is told so by name when it has not. */
      const s = action && action.sample;
      if (!s || s.bounds == null || s.width == null || s.height == null) {
        return fail('raster-sample-needs-window', { layer: id, needs: ['sample.bounds', 'sample.width', 'sample.height'] });
      }
      const r = await layers.toRaster(id, { bounds: s.bounds, width: s.width, height: s.height });
      return r.ok ? { ok: true, id: r.dataset.id } : fail(r.why, r.detail || { id: id });
    }

    /* ── running one step ───────────────────────────────────────────────────────────────────── */

    async function run(action) {
      const a = action || {};
      const op = (a.op == null) ? '' : String(a.op);
      const decl = ops.op(op);
      /* Refused WITH the vocabulary, for the reason the resolver above gives. */
      if (!decl) return fail('op-unknown', { op: op, ops: ops.ops().map((d) => d.id) });

      const want = decl.inputs;
      const given = Array.isArray(a.inputs) ? a.inputs : (a.inputs == null ? [] : [a.inputs]);
      if (given.length !== want) return fail('input-count', { op: op, needs: want, got: given.length, declaration: decl });

      const cache = makeCache();
      const ids = [];
      for (let i = 0; i < given.length; i++) {
        const r = await resolveRef(given[i], i, decl, cache, a);
        if (!r.ok) return r;
        ids.push(r.id);
      }

      const step = { op: op, inputs: ids, params: (a.params && typeof a.params === 'object') ? a.params : {} };
      if (a.title != null && String(a.title).trim() !== '') step.title = String(a.title);
      const res = await ops.run(step, { signal: a.signal || null, onProgress: a.onProgress || null });
      /* ⚠ THE DECLARATION RIDES ON A REFUSED STEP. Every refusal js/gis-ops.js makes about a
         parameter names the parameter; what it cannot know is that its caller is a planner who has
         never seen the op's shape. Handing the shape back is what turns one wrong call into one
         corrected call instead of a search. */
      if (!res.ok) {
        const d = Object.assign({}, res.detail || {}, { declaration: decl });
        return { ok: false, why: res.why, detail: d, declaration: decl, html: refusalHtml(res.why, d) };
      }

      const row = datasetRow(res.dataset);
      const out = { ok: true, op: op, inputs: ids, dataset: row, stats: res.stats || null };
      const st = statsText(res.stats);
      out.html = '<div class="atlas-gis-result"><b>' + esc(op) + '</b> → ' + esc(row.title)
        + ' · ' + row.count + ' ' + esc(row.kind === 'raster' ? L('pixels', '画素') : L('rows', '行'))
        + ' · <code>' + esc(row.id) + '</code>'
        + (st ? ' — ' + esc(st) : '')
        + '<div class="atlas-gis-next">' + esc(L('Use this id as the input of the next step.', 'この id を次の処理の入力に使えます。')) + '</div></div>';

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
      const r = await resolveRef(a.dataset, 0, {}, cache, a);
      if (!r.ok) return r;
      const ds = data.get(r.id);
      const d = core.draw(r.id);
      if (!d.ok) return fail(d.why, Object.assign({ id: r.id }, d.detail || {}));
      return {
        ok: true, drawn: true, dataset: datasetRow(ds), sid: d.sid || null,
        html: '<div class="atlas-gis-result">' + esc(L('Drawn on the map', '地図に描きました')) + ': '
          + esc(ds.title) + ' · ' + ds.count + ' ' + esc(L('rows', '行')) + '</div>',
      };
    }

    const API = { catalogue, run, draw, resolve: (ref, slot, decl, action) => resolveRef(ref, slot || 0, decl || {}, makeCache(), action || {}) };
    return API;
  })();
}
