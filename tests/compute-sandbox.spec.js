/* ============================================================================
 *  compute-sandbox — Atlas's Python, run for real in the shipped page
 * ----------------------------------------------------------------------------
 *  tests/compute-sandbox-checks.test.mjs holds the contract in Node. What only a browser can say:
 *  that Pyodide boots from the pinned, hash-checked files under the page's own CSP; that a CSV goes
 *  in and a regression comes back as a dataset through the capability's real door; that the code
 *  cannot reach the origin's storage, the network or a code generator from inside Python; and that
 *  the result survives save → reopen.
 *  ⚠ THIS NEEDS THE NETWORK — cdn.jsdelivr.net, which tests/helpers/network.js already lets through
 *  as a boot CDN. A runner that cannot reach it is told so and the test is SKIPPED with that reason
 *  (the convention of tests/r184-drone.spec.js): a sandbox that could not start is
 *  `runtime-unavailable`, an unobserved outcome, and a red build would be a claim about IntMap made
 *  from a fact about the runner.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test('compute.run: a CSV is regressed in Python, comes back as a dataset, cannot reach the origin, and survives save → reopen', async ({ app }) => {
  test.setTimeout(240_000);
  const page = app.page;
  const cspErrors = [];
  const watch = (m) => { if (/Content Security Policy|Refused to/.test(m.text())) cspErrors.push(m.text().slice(0, 200)); };
  page.on('console', watch);
  page.on('worker', (w) => w.on('console', watch));

  const reach = await page.evaluate(async () => {
    await window.IntMapLazy.need('gisCore');
    const base = window.IntMapCompute.runtime().base;
    try { const r = await fetch(base + 'pyodide.js', { method: 'GET', cache: 'no-store' }); return { ok: r.ok, status: r.status }; }
    catch (e) { return { ok: false, err: String(e && e.message) }; }
  });
  test.skip(!reach.ok, 'the pinned Pyodide distribution is unreachable from this runner: ' + JSON.stringify(reach));

  const r = await page.evaluate(async () => {
    const D = window.IntMapData;
    const rows = [];
    for (let i = 0; i < 120; i++) rows.push({ type: 'Feature', geometry: null, properties: { x: i, y: 3 * i + 7 + ((i % 5) - 2) / 10 } });
    D.add({ id: 'compute-spec-csv', title: 'compute spec csv', features: rows, provenance: { kind: 'import', file: 'compute-spec.csv' } });
    const out = {};
    /* ONE run, so the file pays for one interpreter boot (measured: a boot is 3–10 s and this file is
       charged against the whole suite's ceiling). The regression goes through the capability's real door;
       the same code then asks every door from inside Python — each must answer closed. */
    const ver = window.IntMapCompute.runtime().version;
    const code = [
      'import numpy as np, js, pyodide',
      'R=rows(0)',
      'x=np.array([r["x"] for r in R],float)',
      'y=np.array([r["y"] for r in R],float)',
      'b,a=np.polyfit(x,y,1)',
      'print("slope", round(b,4))',
      'result=[{"x":float(xi),"resid":float(yi-(a+b*xi))} for xi,yi in zip(x,y)]',
      'coef={"slope":b,"intercept":a}',
      'doors={}',
      'def t(n, f):', '    try:', '        f(); doors[n]="OPEN"', '    except Exception:', '        doors[n]="closed"',
      't("indexedDB", lambda: js.indexedDB.open("x"))', 't("caches", lambda: js.caches.keys())', 't("xhr", lambda: js.XMLHttpRequest.new())',
      't("websocket", lambda: js.WebSocket.new("wss://example.com"))', 't("worker", lambda: js.Worker.new("data:,"))',
      't("opfs", lambda: js.navigator.storage.getDirectory())', 't("locks", lambda: js.navigator.locks.request)',
      't("eval", lambda: js.eval("1"))', 't("Function", lambda: js.Function("return 1")())', 't("ctor", lambda: js.Object.constructor("return 1")())',
      't("run_js", lambda: pyodide.code.run_js("1"))', 't("loadPyodide", lambda: js.loadPyodide({"indexURL": "https://example.com/"}))',
      'async def f(u):', '    try:', '        await js.fetch(u); return "OPEN"', '    except Exception:', '        return "closed"',
      'doors["fetchOther"]=await f("https://example.com/")', 'doors["fetchSelf"]=await f(str(js.location.origin)+"/index.html")',
      'doors["fetchUnderPin"]=await f("https://cdn.jsdelivr.net/pyodide/v' + ver + '/full/leak")'].join('\n');
    const ex = await window.IntMapOS.execute('compute.run', { code, inputs: ['compute-spec-csv'], outputs: ['result', 'coef', 'doors'], title: 'spec OLS' });
    const m = (ex && ex.meta && ex.meta.compute) || {};
    out.run = { ok: m.ok, why: m.why, detail: m.detail, status: ex && ex.status, datasets: m.datasets, slope: m.values && m.values.coef && m.values.coef.value.slope, packages: m.packages, timings: m.timings };
    out.doors = (m.values && m.values.doors) ? m.values.doors.value : null;
    const id = m.datasets && m.datasets[0] && m.datasets[0].id;
    const rec = id && D.get(id);
    out.rec = rec ? { count: rec.count, kind: rec.provenance.kind, inputs: rec.provenance.inputs, runtime: rec.provenance.runtime, editable: D.editable(id).why } : null;

    const sv = await window.IntMapOS.execute('data.gisProject', { action: 'save', name: 'compute-spec' });
    const pid = sv.meta && sv.meta.gisProject && sv.meta.gisProject.id;
    D.clear();
    const op = await window.IntMapOS.execute('data.gisProject', { action: 'open', id: pid });
    const back = id && D.get(id);
    out.reopen = { saved: !!pid, opened: !!(op.meta && op.meta.gisProject && op.meta.gisProject.ok), count: back ? back.count : null, kind: back ? back.provenance.kind : null, codeKept: back ? /np\.polyfit/.test(back.provenance.code) : false };
    await window.IntMapOS.execute('data.gisProject', { action: 'remove', id: pid });
    return out;
  });

  expect(r.run.ok, JSON.stringify(r.run)).toBe(true);
  expect(r.run.status).toBe('completed');
  expect(r.run.packages).toContain('numpy');
  expect(Math.abs(r.run.slope - 3)).toBeLessThan(0.01);
  expect(r.rec).toEqual({ count: 120, kind: 'compute', inputs: ['compute-spec-csv'], runtime: expect.stringMatching(/^pyodide@/), editable: 'edit-would-contradict-recipe' });
  expect(r.doors, 'the door probe did not come back').toBeTruthy();
  for (const [door, state] of Object.entries(r.doors)) expect(state, door).toBe('closed');
  expect(Object.keys(r.doors).length).toBeGreaterThanOrEqual(15);
  expect(r.reopen).toEqual({ saved: true, opened: true, count: 120, kind: 'compute', codeKept: true });
  expect(cspErrors, 'the run raised a CSP violation').toEqual([]);
});


/* ── the capability bridge (Programmatic Tool Calling), run for real ─────────────────────────────────────────
   tests/ptc-python-bridge-checks.test.mjs holds the wiring in Node. What only a browser can say: that `await cap_call(...)` inside the
   isolated Pyodide worker reaches the capability table through the transferred port, that a loop of calls costs no model step, that a
   refusal arrives as an answer (not an exception), that the history is on the result and the output's recipe, and that the bridge did
   not open a door the sandbox had closed.
   OPT-IN: the whole-suite time ceiling (scripts/test-budget.mjs) has no room for a second Pyodide boot and the ceiling is not raised, so
   it runs only when asked for:  INTMAP_RUN_PTC_BROWSER=1 npx playwright test tests/compute-sandbox.spec.js -g "capability calls"
   (a skipped test costs nothing; the Node wiring checks run every time). */
test('capability calls: compute.run with grants — Python calls capabilities in a loop, refusals are answers, and the history is kept', async ({ app }) => {
  test.skip(!process.env.INTMAP_RUN_PTC_BROWSER, 'opt-in (the suite time ceiling has no room for another Pyodide boot): INTMAP_RUN_PTC_BROWSER=1');
  test.setTimeout(240_000);
  const page = app.page;
  const reach = await page.evaluate(async () => {
    await window.IntMapLazy.need('gisCore');
    const base = window.IntMapCompute.runtime().base;
    try { const r = await fetch(base + 'pyodide.js', { method: 'GET', cache: 'no-store' }); return { ok: r.ok, status: r.status }; }
    catch (e) { return { ok: false, err: String(e && e.message) }; }
  });
  test.skip(!reach.ok, 'the pinned Pyodide distribution is unreachable from this runner: ' + JSON.stringify(reach));

  const r = await page.evaluate(async () => {
    /* the dispatch the kernel runs capabilities through is installed by the Atlas console, a lazy chunk: a call made before it has loaded is `unavailable` (atlas-kernel-not-loaded) — not a Python fault */
    await window.IntMapLazy.need('atlasConsole');
    const D = window.IntMapData;
    D.add({ id: 'ptc-spec-csv', title: 'ptc spec csv', features: [1, 2, 3, 4].map((n) => ({ type: 'Feature', geometry: null, properties: { n } })), provenance: { kind: 'import', file: 'ptc.csv' } });
    const code = [
      'cat = await cap_list("data.")',
      'd = await cap_describe("data.value")',
      'names = ["Japan", "France", "Brazil"]',
      'rs = await cap_call_many([("data.value", {"country": c, "metric": "pop"}) for c in names], concurrency=2)',
      'again = await cap_call("data.value", {"country": "Japan", "metric": "pop"})',
      'denied = await cap_call("map.drawDataset", {})',
      'nested = await cap_call("compute.run", {"code": "result = 1"})',
      'rows_ = await cap_rows("ptc-spec-csv")',
      'result = {"listed": "data.value" in [c["id"] for c in cat], "schema": d.get("schema") is not None, "ok": [x["ok"] for x in rs],',
      '          "text": [x["result"].get("text", "")[:60] for x in rs], "again": again.get("alreadyDone"), "denied": denied.get("refused"),',
      '          "nested": nested.get("refused"), "rows": len(rows_)}'].join('\n');
    const ex = await window.IntMapOS.execute('compute.run', { code, grants: ['read'], title: 'ptc spec' });
    const m = (ex && ex.meta && ex.meta.compute) || {};
    const noGrant = await window.IntMapOS.execute('compute.run', { code: 'result = await cap_call("data.value", {"country": "Japan"})' });
    const ng = (noGrant && noGrant.meta && noGrant.meta.compute) || {};
    return { ok: m.ok, why: m.why, detail: m.detail, value: m.values && m.values.result && m.values.result.value, bridge: m.bridge, noGrant: { ok: ng.ok, why: ng.why, detail: JSON.stringify(ng.detail || '').slice(-400) } };
  });

  expect(r.ok, JSON.stringify(r)).toBe(true);
  expect(r.value.listed).toBe(true);
  expect(r.value.schema).toBe(true);
  expect(r.value.ok).toEqual([true, true, true]);
  expect(r.value.again, 'the same call is answered, not re-run').toBe(true);
  expect(r.value.denied, 'a state-class capability is refused to a read-only run').toBe('not-granted');
  expect(r.value.nested, 'a program does not start a program').toBe('not-granted');
  expect(r.value.rows).toBe(4);
  expect(r.bridge.grants).toEqual(['read']);
  expect(r.bridge.summary.executed, 'three distinct calls ran').toBe(3);
  expect(r.bridge.summary.repeats).toBe(1);
  expect(r.bridge.summary.refused['not-granted']).toBe(2);
  expect(r.bridge.calls.length).toBeGreaterThanOrEqual(6);
  expect(r.noGrant.ok, 'a run that was granted nothing has no bridge').toBe(false);
  expect(r.noGrant.why).toBe('python-exception');
  expect(r.noGrant.detail).toContain('no capability bridge');
});
