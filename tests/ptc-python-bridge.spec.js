/* ============================================================================
 *  ptc-python-bridge — real Python (Pyodide) calls IntMap's capabilities itself
 * ----------------------------------------------------------------------------
 *  tests/ptc-python-bridge-checks.test.mjs holds the wiring in Node. What only a browser can say: that `await
 *  cap_call(...)` inside the isolated Pyodide worker reaches the capability table through the transferred port,
 *  that a loop of calls costs no model step, that a refusal arrives as an answer (not an exception), that the
 *  history of the calls is on the result and on the output's recipe, and that the bridge did not open a door the
 *  sandbox had closed. NEEDS THE NETWORK (the pinned Pyodide on cdn.jsdelivr.net): skipped, with the reason, on a
 *  runner that cannot reach it — the convention of tests/compute-sandbox.spec.js.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test('compute.run with grants: Python calls capabilities in a loop, refusals are answers, and the history is kept', async ({ app }) => {
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
    return { ok: m.ok, why: m.why, detail: m.detail, value: m.values && m.values.result && m.values.result.value, bridge: m.bridge, noGrant: { ok: ng.ok, why: ng.why, detail: JSON.stringify(ng.detail || '').slice(0, 300) } };
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
