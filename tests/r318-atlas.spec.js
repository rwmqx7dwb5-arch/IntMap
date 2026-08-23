/* ============================================================================
 *  R318 — the half of the kernel's browser proof that needs Atlas itself
 * ----------------------------------------------------------------------------
 *  These three assertions all require js/atlas-console.js — 719 kB fetched on demand (#R224) — so
 *  they cannot live in tests/r318.spec.js, which stands in the sixty-four-second gate. Same round,
 *  same subject, different tier: this one runs nightly and on demand, the way r226-seismic and
 *  r251-langs do for the same reason.
 *
 *  What is only checkable HERE is the join: the registry knows the descriptors from boot, and Atlas
 *  is what teaches it how to reach the engine. Until that happens a capability is `unavailable` —
 *  a true statement — and afterwards it runs.
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
  await page.waitForFunction(() => !!(window.IntMapGeoEngine && window.IntMapGeoEngine.hasRenderer && window.IntMapGeoEngine.hasRenderer()), null, { timeout: 60_000 });
  /* the module id is the loader's, not a guess: js/lazy-modules.js PUBLISHES window.IntMapConsole */
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });
});

test.afterAll(async () => { try { await page.context().close(); } catch { /* */ } });

test('R318-atlas ①: loading Atlas binds the registry to the engine, and the same kernel is used', async () => {
  const r = await page.evaluate(async () => {
    const C = window.IntMapCapabilities;
    const k = await window.IntMapOS.kernel();
    return {
      ready: C.runtimeReady(),
      docs: C.docsReady(),
      avail: C.resolve('view.flyTo').availability(C.context()),
      /* ⚠ ONE kernel. If Atlas had built its own, the two would have separate operation registries
         and separate conflict locks — two kernels, which is the disagreement this round ends. */
      oneKernel: k === window.IntMapOS.__atlasKernel,
      execIsKernels: window.IntMapAtlasExec === k.exec,
    };
  });
  expect(r.ready, 'the registry never learned how to reach the engine').toBe(true);
  expect(r.docs, 'Atlas loaded and never handed the registry its catalogue').toBe(true);
  expect(r.avail.available).toBe(true);
  expect(r.oneKernel, 'Atlas built a SECOND kernel — installAtlasKernel is no longer idempotent').toBe(true);
  expect(r.execIsKernels).toBe(true);
});

test('R318-atlas ②: the built app sends a relevant catalogue instead of all of it', async () => {
  const r = await page.evaluate(() => {
    const C = window.IntMapCapabilities;
    return { all: C.catalogBytes(null), routing: C.catalogBytes(['routing.route', 'routing.isochrone']), sim: C.catalogBytes(['sim.earthquake']) };
  });
  expect(r.all, 'the full catalogue did not survive the build').toBeGreaterThan(50_000);
  expect(r.routing).toBeGreaterThan(1_000);
  expect(r.routing, 'selection is not actually selecting').toBeLessThan(r.all / 2);
  expect(r.sim).toBeGreaterThan(500);
  expect(r.sim).toBeLessThan(r.routing);
});

test('R318-atlas ③: the button and the command leave the same state', async () => {
  const r = await page.evaluate(async () => {
    const base = () => window.IntMapAtlasState.snapshot({ only: ['camera'] }).camera.base;
    const settle = () => new Promise((res) => setTimeout(res, 400));
    document.getElementById('btn-view-sat').click();           /* the UI path, as a reader clicks it */
    await settle();
    const viaUi = base();
    document.getElementById('btn-view-map').click();
    await settle();
    window.IntMapOS.exec('view.base.sat', { source: 'test' }); /* the kernel path, by name */
    await settle();
    const viaKernel = base();
    document.getElementById('btn-view-map').click();
    await settle();
    return { viaUi, viaKernel, restored: base() };
  });
  expect(r.viaUi).toBe('satellite');
  expect(r.viaKernel, 'the button and the command must reach the same engine work').toBe(r.viaUi);
  expect(r.restored).toBe('map');
});

test('R320 ①: the control catalogue ranks against the request and says what it left out', async () => {
  const r = await page.evaluate(() => {
    /* IntMapOS.catalog() is where the built app publishes it — the console's own function is not
       part of its public surface, and reading it here would test a path nothing else takes. */
    const c = window.IntMapOS.catalog();
    return { has: typeof c.controls === 'string', plain: c.controls || '' };
  });
  expect(r.has, 'IntMapOS.catalog() no longer carries the control list').toBe(true);
  expect(r.plain.length, 'the control catalogue is empty in the built app').toBeGreaterThan(200);
  /* a cap that drops must SAY so — the whole point of #R320 */
  if (r.plain.includes('not listed here')) {
    expect(r.plain).toMatch(/and \d+ more on-screen control/);
  }
});

test('R320 ②: a module that has not loaded is still named to the planner', async () => {
  const r = await page.evaluate(() => {
    const cat = window.IntMapOS.catalog().modules || '';
    return {
      cat: cat.slice(0, 4000),
      hasOnDemand: cat.includes('loads on demand'),
      lazyNames: window.IntMapLazy.names(),
      publishes: window.IntMapLazy.publishes('streetView'),
      streetViewLoaded: !!window.IntMapStreetView,
      streetViewNamed: cat.includes('IntMapStreetView'),
    };
  });
  expect(r.publishes, 'the loader no longer exposes what each lazy module will be called').toBe('IntMapStreetView');
  expect(r.streetViewLoaded, 'if it were already loaded this assertion would prove nothing').toBe(false);
  expect(r.streetViewNamed, 'a subsystem that loads on demand must still be a subsystem the planner knows').toBe(true);
  expect(r.hasOnDemand, 'and it must be marked as not-yet-loaded rather than passed off as present').toBe(true);
});

/* ══ R350 — THE ANSWER CONTRACT, MEASURED IN THE BROWSER ══════════════════════════════════════
   ⚠ THESE LIVE HERE RATHER THAN IN A FILE OF THEIR OWN because the suite's ceiling has no headroom
   (scripts/test-budget.mjs: 86.3 min against a ceiling of 86.3) and the rule is that a round which
   adds test time takes it out somewhere else. This spec already pays for loading Atlas, so the
   marginal cost of asking it four more questions is close to nothing — which is what
   「consolidation instead of accumulation」 means in practice.

   ⚠ AND THEY MEASURE THE BROWSER ON PURPOSE. #R313's addendum: a fix that was perfect in Node did
   not change one word on the page, and the check stayed green forever because it ran in Node. What
   is proved below runs through the REAL mdMini, the REAL linkCards and the REAL stylesheet. */

test('R350 ①: the structured answer renders through the real reply pipeline, and a model URL is not a link', async () => {
  const r = await page.evaluate(() => {
    const A = window.IntMapAtlasAnswer;
    const reg = A.registry({ callId: 'c1', turnId: 't1', retrievedAt: 'now' });
    reg.addClientSources([{ url: 'https://gathered.example.org/a', title: 'gathered article', src: 'Example' }]);
    const env = A.normalize({
      directAnswer: { text: 'Consumption is the largest component of demand.', claimIds: ['c1'] },
      sections: [{ id: 's1', heading: 'Detail', blocks: [{ type: 'paragraph',
        text: 'See https://stats.gov.stats.gov.cn/tjsj/ and [here](https://evil.example/x).', claimIds: ['c1'] }] }],
      claims: [{ id: 'c1', text: 'Consumption is the largest component of demand.', claimType: 'fact',
        importance: 'primary', dimension: 'share', confidence: 'high', evidenceIds: ['e1'] }],
      limitations: [],
    }, { turnId: 't1', callId: 'c1' });
    const html = A.render(env, reg);
    const box = document.createElement('div');
    box.innerHTML = html;
    const hrefs = Array.from(box.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    const audit = A.audit(env, reg, { webUsed: false, temporalMode: 'unspecified' });
    return {
      hrefs,
      text: box.textContent,
      codes: audit.errors.map((e) => e.code),
      cites: box.querySelectorAll('.atl-cite').length,
      webHeading: /Web-verified|Web検証済み/.test(box.textContent),
    };
  });
  expect(r.hrefs.some((h) => /stats\.gov\.stats\.gov\.cn|evil\.example/.test(h || '')),
    'a URL the model wrote became a clickable link in the browser: ' + JSON.stringify(r.hrefs)).toBe(false);
  expect(r.hrefs, 'the card built from the registry is missing').toContain('https://gathered.example.org/a');
  expect(r.text.includes('here'), 'the readable half of the markdown link was thrown away with the URL').toBe(true);
  expect(r.codes, 'the audit did not see the URL in the prose').toContain('url.raw_in_prose');
  expect(r.cites, 'the claim rendered without a citation marker').toBeGreaterThan(0);
  expect(r.webHeading, 'the web-verified heading was printed with no hosted-web citation behind it').toBe(false);
});

test('R350 ②: the answer stylesheet is on the page, not merely in the module', async () => {
  /* ⚠ THE PANEL HAS TO BE BUILT FIRST, AND THAT IS THE POINT. The Atlas stylesheet is injected when
     the panel is CONSTRUCTED, not when the module loads — so the first version of this check asked the
     document before anything had opened one, and went red. It went red CORRECTLY: it was measuring the
     browser rather than the module, which is the entire reason it exists (#R313 追記2). An answer is always
     rendered inside the panel, so by the time the styling matters the panel is always built; the check
     now puts itself in that state instead of assuming it. */
  await page.evaluate(() => window.IntMapConsole.open());
  const css = await page.evaluate(() => Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent || '').join('\n'));
  expect(css.includes('.atl-cite'), 'answerCSS never reached the document — the citation pills have no styling').toBe(true);
  expect(css.includes('.atl-degraded'), 'the degraded banner has no styling').toBe(true);
});

test('R350 ③: a fabricated host cannot enter the registry in the browser either', async () => {
  const r = await page.evaluate(() => {
    const reg = window.IntMapAtlasAnswer.registry({ callId: 'c1', retrievedAt: 'now' });
    const added = reg.addClientSources([{ url: 'https://stats.gov.stats.gov.cn/x', title: 'invented' }]);
    const cross = reg.addProviderCitations([{ url: 'https://real.example.org/a', title: 'A' }], { callId: 'OTHER', webUsed: true });
    return { added: added.length, size: reg.size(), reason: (reg.rejected()[0] || {}).reason, cross: cross.length };
  });
  expect(r.added, 'the invented host was registered').toBe(0);
  expect(r.reason).toBe('doubled_host');
  expect(r.cross, 'a citation belonging to another call was absorbed').toBe(0);
  expect(r.size).toBe(0);
});


test('R318-atlas ④: Atlas loaded without console errors', async () => {
  const errors = (diag.consoleErrors || []).concat(diag.pageErrors || []);
  expect(errors, 'loading the kernel produced console errors:\n' + errors.join('\n')).toEqual([]);
});
