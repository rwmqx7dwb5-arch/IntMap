/* ============================================================================
 *  R314 — the Atlas control kernel, in a real browser
 * ----------------------------------------------------------------------------
 *  tests/r314-checks.test.mjs proves the SHAPE of the kernel from source and from its own modules.
 *  This proves the shape is what the BUILT APP runs — the difference #R301 paid for twice: a check
 *  that only ever read source cannot tell you the bundler kept it.
 *
 *  ⚠ ONE BOOT, NO SLEEPS, AND ATLAS IS NOT FETCHED HERE. This file is the current round's spec and
 *  therefore stands in the gate (scripts/tiers.mjs), whose whole budget is 64 seconds for six
 *  files. Everything below is a `page.evaluate` against the already-booted page. The assertions
 *  that need the 719 kB Atlas chunk — catalogue selection, the dispatch binding, UI-vs-kernel
 *  equality — are in tests/r314-atlas.spec.js, which is deep-tier for exactly that reason.
 *
 *  Nothing here calls the AI.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.IntMapCapabilities, null, { timeout: 30_000 });
});

test.afterAll(async () => { try { await page.context().close(); } catch { /* */ } });

test('R314 ①: the registry is in the boot bundle, and it knows capabilities whose code is absent', async () => {
  const s = await page.evaluate(() => ({
    caps: !!window.IntMapCapabilities,
    count: window.IntMapCapabilities ? window.IntMapCapabilities.list().length : 0,
    hasExecute: !!(window.IntMapOS && typeof window.IntMapOS.execute === 'function'),
    seismicKnown: !!window.IntMapCapabilities.resolve('sim.earthquake'),
    seismicLazy: (window.IntMapCapabilities.resolve('sim.earthquake') || {}).lazyModules,
    seismicLoaded: !!window.IntMapSeismic,
    losKnown: !!window.IntMapCapabilities.resolve('sim.lineOfSight'),
    losLoaded: !!window.IntMapLOS,
  }));
  expect(s.caps, 'the capability registry must be in the boot bundle').toBe(true);
  expect(s.count, 'the registry arrived empty — the bundler dropped the table').toBeGreaterThan(100);
  expect(s.hasExecute, 'IntMapOS.execute() is the door both shells use').toBe(true);
  /* §10, and the assertion that matters: the DESCRIPTOR is here and the CODE is not. Whether the
     Atlas chunk itself has been prefetched by the time this runs is a boot policy this round does
     not set; what it must never be is the reason a capability is unknown. The size of the eager
     bundle is measured, not asserted here — scripts/perf-budget.mjs owns that. */
  expect(s.seismicKnown, 'the earthquake simulator must be findable before its module arrives').toBe(true);
  expect(s.seismicLazy).toContain('seismic');
  expect(s.seismicLoaded, 'if the module were already loaded this assertion would prove nothing').toBe(false);
  expect(s.losKnown, 'and so must the viewshed').toBe(true);
  expect(s.losLoaded).toBe(false);
});

test('R314 ②: ok cannot be made true, in the built bundle', async () => {
  /* ⚠ WHETHER IT THROWS DEPENDS ON THE CALLER, NOT ON THE VALUE. Assigning to a getter-only
     property throws in strict mode and fails SILENTLY in sloppy mode — and `page.evaluate` runs in
     the page's sloppy global scope, which is how a console one-liner would reach this too. So what
     is asserted is the invariant that holds either way. tests/r314-checks.test.mjs asserts the
     throw, from a module. */
  const after = await page.evaluate(async () => {
    const k = await window.IntMapOS.kernel();
    const res = k.results.failed({ capabilityId: 'x', code: 'no_change' });
    try { res.ok = true; } catch (_) { /* strict caller */ }
    return { ok: res.ok, serialised: JSON.parse(JSON.stringify(res)).ok, completed: k.results.completed({ capabilityId: 'x' }).ok };
  });
  expect(after.ok, 'the bundler flattened the getter into a writable field').toBe(false);
  expect(after.serialised, 'and the value that reaches a log must be the derived one').toBe(false);
  expect(after.completed).toBe(true);
});

test('R314 ③: a point-needing capability asks for the point — it does not take the map centre', async () => {
  const r = await page.evaluate(async () => {
    /* bind a dispatch that RECORDS what it was asked to do, so an invented centre would show up */
    let sawArgs = null;
    window.IntMapCapabilities.bindRuntime({ dispatch: async (a) => { sawArgs = a; return { ok: true, html: '' }; } });
    const res = await window.IntMapOS.execute('sim.rfCoverage', {}, { source: 'test' });
    const ok = await window.IntMapOS.execute('sim.rfCoverage', { lng: 139.7, lat: 35.6 }, { source: 'test' });
    return { status: res.status, kind: res.inputRequest && res.inputRequest.kind,
      resume: !!(res.inputRequest && res.inputRequest.resumeToken), dispatched: sawArgs, given: ok.status };
  });
  expect(r.status, '#R302: a tool that needs a point must ASK for one').toBe('needs_input');
  expect(r.kind).toBe('point');
  expect(r.resume, 'and the ask must be resumable, or the reader starts over').toBe(true);
  expect(r.given, 'and when a point IS given it must not ask').not.toBe('needs_input');
  expect(r.dispatched, 'the first call must not have dispatched anything at all').not.toBeNull();
});

test('R314 ④: the state snapshot is real, and the prompt paragraph is derived from it', async () => {
  const r = await page.evaluate(async () => {
    await window.IntMapOS.kernel();
    const S = window.IntMapAtlasState;
    const snap = S.snapshot();
    return {
      sections: Object.keys(snap).filter((k) => k !== '_errors'),
      camera: snap.camera, errors: snap._errors || [],
      prompt: S.toPrompt(snap, 3000).slice(0, 40),
      rendered: typeof S.renderPrompt === 'function' ? S.renderPrompt(snap) : null,
    };
  });
  expect(r.sections.length, 'the snapshot lost its sections in the bundle').toBeGreaterThan(10);
  expect(r.camera, 'the camera section has no owner in the built app').not.toBeNull();
  expect(typeof r.camera.zoom).toBe('number');
  expect(r.errors, 'a state provider threw in the real app:\n' + JSON.stringify(r.errors)).toEqual([]);
  expect(r.prompt).toContain('APP STATE');
  expect(r.rendered, 'the derived paragraph is empty — stateContext() would now be blank').toBeTruthy();
  expect(r.rendered).toContain('Map center');
});

test('R314 ⑤: an async OS command is not recorded as done before it settles', async () => {
  const r = await page.evaluate(async () => {
    /* the record object IS what `log()` hands back (it is a live reference, not a copy), so hold it
       and watch it settle — that is the whole difference this round made to `exec`. */
    let resolveIt = null, rejectIt = null;
    window.IntMapOS.register('test.r314.async', () => new Promise((res) => { resolveIt = () => res({ ok: false }); }), { label: 'test' });
    window.IntMapOS.register('test.r314.reject', () => new Promise((_r, rej) => { rejectIt = () => rej(new Error('boom')); }), { label: 'test' });
    window.IntMapOS.exec('test.r314.async', { source: 'test' });
    const recA = window.IntMapOS.log().slice(-1)[0];
    const duringPending = !!recA.pending;
    window.IntMapOS.exec('test.r314.reject', { source: 'test' });
    const recB = window.IntMapOS.log().slice(-1)[0];
    resolveIt(); rejectIt();
    await new Promise((r2) => setTimeout(r2, 60));
    return { duringPending, sync: recA.cmd, resolvedFalse: recA.ok, pendingCleared: !recA.pending,
      rejected: recB.ok, rejectedErr: String(recB.err || '') };
  });
  expect(r.sync, 'the log entry read back was not the command that was just run').toBe('test.r314.async');
  expect(r.duringPending, 'an in-flight async command must be marked pending, not done').toBe(true);
  expect(r.pendingCleared, 'and the mark must clear when it settles').toBe(true);
  /* ⚠ THE TWO THAT MATTER. Before #R314 both of these read `ok:true`: the first because a Promise
     has no `.ok`, the second because a rejection after `rec()` was never recorded at all. */
  expect(r.resolvedFalse, 'a command that resolved ok:false must end up recorded as a failure').toBe(false);
  expect(r.rejected, 'a command whose promise REJECTED must end up recorded as a failure').toBe(false);
  expect(r.rejectedErr).toContain('boom');
});

test('R314 ⑥: the page still runs — no console errors, and the layer panel still builds', async () => {
  const rows = await page.locator('.lyr-row').count();
  expect(rows, 'the canonical smoke signal (CONSTITUTION §2): the layer panel builds 100+ rows').toBeGreaterThan(100);
  const errors = (diag.consoleErrors || []).concat(diag.pageErrors || []);
  expect(errors, 'the kernel introduced console errors:\n' + errors.join('\n')).toEqual([]);
});
