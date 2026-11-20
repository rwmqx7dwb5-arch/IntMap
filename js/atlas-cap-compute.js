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
import { str, num, list, one } from './atlas-caps.js';

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
      { in: 'spatial-analysis', at: 60, text: '{"type":"python","code":str,"inputs"?:[ID,…],"outputs"?:[NAME,…],"title"?:str,"timeoutSec"?:num,"grants"?:["read"|"state"]} = Python で計算する（回帰・相関・クラスタ分け・統計の集計・自前の解析）/ RUN PYTHON ON THE DATASETS — 「この CSV で回帰して」「相関を計算して」「クラスタに分けて」「Python で集計して」, "fit a regression", "correlation matrix", "run this in Python". Use it when the analysis is NOT one of the GIS ops — a regression, a correlation matrix, a clustering, a time-series decomposition, a custom index, reshaping a table — and only then: an op that exists is checked against what the numbers mean, Python is not. The code runs in Pyodide (CPython 3.14) inside an isolated worker: NO network, NO page, NO storage, no other datasets than the ones you name. `inputs` are dataset ids or titles; inside the code, `rows(i)` is the rows of input i as a list of dicts, `features(i)` its GeoJSON features, `INPUTS[i]` the whole record (a grid carries width, height, grid and bands[k].values); `i` may be the index, the id or the title. Import numpy, pandas, scipy, statsmodels, scikit-learn, shapely … as usual — a package of the Pyodide distribution is loaded on import; nothing can be pip-installed. RETURN BY ASSIGNING the variable `result` (or every name in `outputs`): a GeoJSON FeatureCollection, a list of Features, a list of dicts or a pandas DataFrame becomes a NEW DATASET whose id comes back (coordinates must be [longitude, latitude] degrees or the output is refused); anything else (a number, a dict of coefficients) comes back as a VALUE. NaN/inf become null and are COUNTED (nonFinite). print() output comes back too. FAILURES ARE FACTS: python-exception carries the traceback — fix the code and run a DIFFERENT version; `timeout` (default 60 s, up to 300 with timeoutSec) and `runtime-unavailable` mean the result was NOT OBSERVED, not that the code was wrong — do not resend the same call. The datasets keep the code as their recipe: a saved project restores them, and when an input upstream is recomputed they are re-run. Make or fetch the inputs first with a GIS step, and hand the new id on — to a GIS step, to gisDraw to draw it, or to a chart with "source":"compute.run → <dataset id>". NOTE: A LOOP OF MANY CAPABILITY CALLS IS ONE python RUN, NOT MANY MODEL STEPS (「500 都市それぞれについて…」「全部の国について…」): pass "grants":["read"] (add "state" only when the program itself must draw or change the session) and the code calls the capabilities of IntMap ITSELF, with top-level await — `r = await cap_call("data.gis", {...})` returns {ok, observed, result:{ok,status,text,…}} (a REFUSAL is an answer, not an exception: read r["ok"] and r.get("refused"): not-granted | invalid-arguments | unknown-capability | call-limit | deadline | cancelled); `await cap_call_many([("data.gis", {...}), …], concurrency=4)` runs a list in order, at most `concurrency` at a time; `await cap_list("data")` lists the capabilities, `await cap_describe("data.gis")` gives the argument schema of one (use it before looping — a wrong argument is refused 500 times, each a recorded refusal); `await cap_rows(dataset_id)` / `await cap_dataset(dataset_id)` read a session dataset, including one a call just made (the id is in r["result"]["text"]). The same capability with the same arguments is NOT run twice (the answer comes back with alreadyDone: true) — make it different. The intermediate answers stay in the program; only `result` and a SUMMARY OF EVERY CALL (counts, refusals, which capabilities) come back to you, and the datasets of the run keep the grants and that summary as part of their recipe. Not callable from the program: python itself. Outside content (the text of a web page) read by a call taints the rest of the run: a capability that then asks the reader to confirm answers needs_confirm and the program must hand that back as its result — it can never confirm for the reader. SHAPE: `rows = await cap_rows(CITIES_ID); out = []; for batch in chunks(rows, 25): rs = await cap_call_many([("data.gis", {"op": "nearest", …}) for c in batch]); …; result = out` and then draw the new dataset with gisDraw. ' },
    ],
    schema: () => ({ type: 'object', required: ['code'], properties: { code: str(), inputs: list(str()), outputs: list(str()), title: str(), timeoutSec: num(1, 300), grants: list(one('read', 'state')) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      await window.IntMapLazy.need('gisCore');
      const C = window.IntMapCompute;
      if (!C) return R(false, warn(esc(L('The Python sandbox could not be loaded.', 'Python の実行環境を読み込めませんでした。'))));
      /* (cap-bridge) a run that was GRANTED something gets a port to the capability table; one that was not gets none and
         `cap_call` says so. The grant is the reader-visible fact: it is on the card, in the history and on every output. */
      const grants = Array.isArray(a.grants) ? a.grants.filter((g) => g === 'read' || g === 'state') : [];
      let h = null;
      if (grants.length) {
        if (typeof K.programBridge !== 'function') return R(false, warn(esc(L('The capability bridge is not available here.', '能力ブリッジはここでは使えません。'))));
        const readDataset = (id) => C.readDataset(id);
        h = K.programBridge({ turn: dctx || {}, grants: grants, readDataset: readDataset,
          forbid: (cap) => (cap && cap.id === 'compute.run') ? 'a program does not start another program (one interpreter per run)' : null });
      }
      let r;
      try { r = await C.run(a, { bridge: h }); }
      finally { if (h) { try { h.bridge.cancel('the run ended'); } catch (_) { } try { h.close(); } catch (_) { } } }
      const pre = (label, text, cut) => text ? '<details class="atlas-gis-detail"><summary>' + esc(label) + (cut ? ' (' + esc(L('first ' + cut + ' characters omitted', '先頭 ' + cut + ' 文字を省略')) + ')' : '') + '</summary><pre>' + esc(text) + '</pre></details>' : '';
      /* THE HISTORY OF THE RUN'S CALLS, as text the reader and Atlas both read (the program's own answers stayed in the program) */
      const bsum = r.bridge && r.bridge.summary ? r.bridge.summary : null;
      const bridgeLine = bsum
        ? '<div class="atlas-gis-detail"><b>' + esc(L('Capability calls', '能力の呼び出し')) + '</b> · ' + esc(L('granted ', '許可 ')) + esc((r.bridge.grants || []).join('+'))
          + ' · ' + bsum.executed + ' ' + esc(L('run', '実行')) + (bsum.repeats ? ' · ' + bsum.repeats + ' ' + esc(L('repeats answered, not re-run', '重複は再実行せず回答')) : '')
          + (Object.keys(bsum.refused || {}).length ? ' · ' + esc(L('refused', '拒否')) + ' ' + esc(JSON.stringify(bsum.refused)) : '')
          + (bsum.unobserved ? ' · ' + bsum.unobserved + ' ' + esc(L('not observed', '観測できず')) : '')
          + (Object.keys(bsum.byCapability || {}).length ? ' — ' + esc(Object.keys(bsum.byCapability).map((k) => k + '×' + bsum.byCapability[k]).join(', ')) : '')
          + (r.bridge.logOmitted ? ' · ' + esc(L(r.bridge.logOmitted + ' calls not logged', r.bridge.logOmitted + ' 件は履歴に書かれていません')) : '') + '</div>' : '';
      const streams = bridgeLine + pre('stdout', r.stdout, r.stdoutCut) + pre('stderr', r.stderr, r.stderrCut);
      const meta = { compute: { ok: r.ok, why: r.why || null, observed: r.observed, detail: r.detail || null, datasets: r.datasets || [], values: r.values || {},
        packages: r.packages || [], runtime: r.runtime, python: r.python || null, timings: r.timings || null, elapsedMs: r.elapsedMs, codeSha256: r.codeSha256 || null,
        bridge: r.bridge || null } };
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
      /* THE FACTS FIRST: Atlas reads the card's text through RESULT_TEXT_MAX (js/atlas-toolsurface.js), so
         the dataset ids and the values come before the streams. */
      const parts = (r.datasets || []).map((d) => '<div><b>' + esc(d.name) + '</b> → ' + esc(d.title) + ' · ' + d.count + ' ' + esc(L('rows', '行'))
        + ' · <code>' + esc(d.id) + '</code>' + (d.nonFinite ? ' · ' + esc(L(d.nonFinite + ' non-finite values became null', d.nonFinite + ' 個の非有限値を null にしました')) : '')
        + ' — ' + esc(d.fields.map((f) => f.name + ':' + f.type).join(', ')) + '</div>');
      Object.keys(r.values || {}).forEach((n) => {
        const v = r.values[n];
        let text = ''; try { text = JSON.stringify(v.value); } catch (_) { text = String(v.value); }
        parts.push('<div><b>' + esc(n) + '</b> = <code>' + esc(text.length > 1500 ? text.slice(0, 1500) + ' …' : text) + '</code>'
          + (v.nonFinite ? ' · ' + esc(L(v.nonFinite + ' non-finite values became null', v.nonFinite + ' 個の非有限値を null にしました')) : '') + '</div>');
      });
      if (!parts.length) parts.push('<div>' + esc(L('The code ran and bound no `result`.', 'コードは実行されましたが、`result` は作られませんでした。')) + '</div>');
      const html = '<div class="atlas-gis-result"><b>' + esc(L('Ran Python', 'Python を実行しました')) + '</b> · ' + esc(r.runtime)
        + (r.packages && r.packages.length ? ' · ' + esc(r.packages.join(', ')) : '') + parts.join('') + streams
        + ((r.datasets || []).length ? '<div class="atlas-gis-next">' + esc(L('Use this id as the input of the next step.', 'この id を次の処理の入力に使えます。')) + '</div>' : '') + '</div>';
      return R(true, html, { meta: meta });
    },
  },
];
