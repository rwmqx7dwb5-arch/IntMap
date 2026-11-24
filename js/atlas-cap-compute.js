/* ============================================================================
 *  IntMap · Atlas capabilities — the `compute.*` namespace   (js/atlas-cap-compute.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, num, list } from './atlas-caps.js';

export default [
  /* ⚠⚠ (compute-sandbox) THE ONE ROW THAT RUNS CODE NOBODY IN THIS REPOSITORY WROTE. Its dispatch spelling is
     'python', not 'compute': `compute` is already the name of a GIS op (js/gis-expr.js expressions, inside
     {"type":"gis"}), and two meanings of one word in one catalogue block is a wrong call waiting to
     happen. The registry is still closed — this is one row, and what it runs is Python inside the Worker js/compute-sandbox.js
     builds, never on the page's thread (the sandbox's header says what is closed and how it is checked).
     The columns, each for a reason:
       writes 'gis.dataset'  every output that is a table or GeoJSON becomes a NEW dataset in the session's
                             registry, so two runs — or a run and a GIS step — serialise on that key.
       risk 'session'        nothing outside this tab changes: the datasets live in memory until the reader
                             saves a project, and removing one undoes it. The only network is the pinned
                             Pyodide distribution, by exact file and hash.
       confirm 'none'        the repository's own rule (tests/atlas-capabilities-checks R801 ②) is that a row which only reads or only
                             changes what the reader can undo never asks: a button in front of code the reader cannot judge
                             is a blind approval, worse than none. What guards this row is the sandbox, not a press — the code
                             cannot reach the origin, a network, a storage area or the page (js/compute-sandbox.js).
       ingests ''            the result is IntMap's own observation of what the code returned; inputs are
                             datasets already in the session, exactly as `data.gis` reads them.
       observer 'none'       nothing on the map moves. A run that could not be SEEN to finish (timeout, the
                             interpreter never started, the thread died) states meta.unobserved, which the
                             observer turns into 「観測できなかった」 rather than 「失敗した」. */
  {
    row: ['compute.run',                'python',         'runPython,pythonRun,computePython',                            'data',    'none',    'gis.dataset',            'explanation',         'session', 'none', '',         'gisCore'],
    ui: { none: '2026-11-19' },
    doc: [
      { in: 'spatial-analysis', at: 60, text: '{"type":"python","code":str,"inputs"?:[ID,…],"outputs"?:[NAME,…],"title"?:str,"timeoutSec"?:num} = Python で計算する（回帰・相関・クラスタ分け・統計の集計・自前の解析）/ RUN PYTHON ON THE DATASETS — 「この CSV で回帰して」「相関を計算して」「クラスタに分けて」「Python で集計して」, "fit a regression", "correlation matrix", "run this in Python". Use it when the analysis is NOT one of the GIS ops — a regression, a correlation matrix, a clustering, a time-series decomposition, a custom index, reshaping a table — and only then: an op that exists is checked against what the numbers mean, Python is not. The code runs in Pyodide (CPython 3.14) inside an isolated worker: NO network, NO page, NO storage, no other datasets than the ones you name. `inputs` are dataset ids or titles; inside the code, `rows(i)` is the rows of input i as a list of dicts, `features(i)` its GeoJSON features, `INPUTS[i]` the whole record (a grid carries width, height, grid and bands[k].values); `i` may be the index, the id or the title. Import numpy, pandas, scipy, statsmodels, scikit-learn, shapely … as usual — a package of the Pyodide distribution is loaded on import; nothing can be pip-installed. RETURN BY ASSIGNING the variable `result` (or every name in `outputs`): a GeoJSON FeatureCollection, a list of Features, a list of dicts or a pandas DataFrame becomes a NEW DATASET whose id comes back (coordinates must be [longitude, latitude] degrees or the output is refused); anything else (a number, a dict of coefficients) comes back as a VALUE. NaN/inf become null and are COUNTED (nonFinite). print() output comes back too. FAILURES ARE FACTS: python-exception carries the traceback — fix the code and run a DIFFERENT version; `timeout` (default 60 s, up to 300 with timeoutSec) and `runtime-unavailable` mean the result was NOT OBSERVED, not that the code was wrong — do not resend the same call. The datasets keep the code as their recipe: a saved project restores them, and when an input upstream is recomputed they are re-run. Make or fetch the inputs first with a GIS step, and hand the new id on — to a GIS step, to gisDraw to draw it, or to a chart with "source":"compute.run → <dataset id>". ' },
    ],
    schema: () => ({ type: 'object', required: ['code'], properties: { code: str(), inputs: list(str()), outputs: list(str()), title: str(), timeoutSec: num(1, 300) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      await window.IntMapLazy.need('gisCore');
      const C = window.IntMapCompute;
      if (!C) return R(false, warn(esc(L('The Python sandbox could not be loaded.', 'Python の実行環境を読み込めませんでした。'))));
      const r = await C.run(a);
      const pre = (label, text, cut) => text ? '<details class="atlas-gis-detail"><summary>' + esc(label) + (cut ? ' (' + esc(L('first ' + cut + ' characters omitted', '先頭 ' + cut + ' 文字を省略')) + ')' : '') + '</summary><pre>' + esc(text) + '</pre></details>' : '';
      const streams = pre('stdout', r.stdout, r.stdoutCut) + pre('stderr', r.stderr, r.stderrCut);
      const meta = { compute: { ok: r.ok, why: r.why || null, observed: r.observed, detail: r.detail || null, datasets: r.datasets || [], values: r.values || {},
        packages: r.packages || [], runtime: r.runtime, python: r.python || null, timings: r.timings || null, elapsedMs: r.elapsedMs, codeSha256: r.codeSha256 || null, reused: r.reused === true } };
      if (!r.ok) {
        const detail = r.detail == null ? '' : (typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail));
        const head = r.observed === false
          ? L('The result could not be observed', '結果を観測できませんでした')
          : L('The Python run did not produce a result', 'Python の実行は結果を返しませんでした');
        const html = '<div class="atlas-gis-refused"><b>' + esc(head) + '</b> — <code>' + esc(r.why) + '</code>'
          + (detail ? '<div class="atlas-gis-detail"><pre>' + esc(detail.slice(-4000)) + '</pre></div>' : '') + streams + '</div>';
        /* (one-pass-or-a-reason §5) a run nobody could see finish is 「観測できなかった」 — the observer reads this */
        if (r.observed === false) meta.unobserved = r.why;
        meta.code = r.why;
        return R(false, html, { meta: meta });
      }
      /* TWO READERS, TWO STRUCTURES (atlas-reader-record). The card is what the READER is shown: what was made, how big, what it
         holds. The record is what the NEXT CALL needs and the reader does not — the dataset ids, the interpreter, the packages, what to do
         with the ids — as plain text in `meta.record`, which js/atlas-toolsurface.js hands to the model before the card's text. */
      const ds = r.datasets || [];
      const pk = r.packages && r.packages.length ? r.packages.join(', ') : '';
      const rec = [L('Python run on ' + r.runtime + (pk ? ' with ' + pk : '') + '.', r.runtime + (pk ? '（' + pk + '）' : '') + ' で Python を実行しました。')]
        .concat(ds.map((d) => L('Dataset "' + d.name + '" has id ' + d.id + '.', 'データセット「' + d.name + '」の id は ' + d.id + ' です。')));
      if (ds.length) rec.push(L('Use these ids as the inputs of the next step.', 'これらの id を次の処理の入力に使えます。'));
      meta.record = rec.join(' ');
      const parts = ds.map((d) => '<div><b>' + esc(d.title) + '</b> · ' + d.count + ' ' + esc(L('rows', '行'))
        + (d.nonFinite ? ' · ' + esc(L(d.nonFinite + ' non-finite values became null', d.nonFinite + ' 個の非有限値を null にしました')) : '')
        + ' — ' + esc(d.fields.map((f) => f.name + ':' + f.type).join(', ')) + '</div>');
      Object.keys(r.values || {}).forEach((n) => {
        const v = r.values[n];
        let text = ''; try { text = JSON.stringify(v.value); } catch (_) { text = String(v.value); }
        parts.push('<div><b>' + esc(n) + '</b> = <code>' + esc(text.length > 1500 ? text.slice(0, 1500) + ' …' : text) + '</code>'
          + (v.nonFinite ? ' · ' + esc(L(v.nonFinite + ' non-finite values became null', v.nonFinite + ' 個の非有限値を null にしました')) : '') + '</div>');
      });
      if (!parts.length) parts.push('<div>' + esc(L('The code ran and bound no `result`.', 'コードは実行されましたが、`result` は作られませんでした。')) + '</div>');
      const html = '<div class="atlas-gis-result"><b>' + esc(r.reused ? L('Same code on the same data — answered from the earlier run (nothing was recomputed)', '同じコードと同じデータのため、前回の結果を返しました（再計算していません）') : L('Calculation finished', '計算が完了しました')) + '</b>' + parts.join('') + streams + '</div>';
      return R(true, html, { meta: meta });
    },
  },
];
