// R156 runtime regression tests — the Atlas unified vision / math-rendering / geo-determination overhaul.
// These exercise the REAL in-page pipeline (via window.IntMapAtlasDebug), not just source strings:
//   #1 boot: KaTeX loaded, no page errors
//   #2 unified renderer: a matrix renders as REAL KaTeX (0 errors), display math scrolls, code block has an escaped
//      body + Copy button, GFM table renders
//   #3 content-class spine + geo gate: math/document/code/photo → NOT mappable; geographic + unclassified → mappable
//   #4 EXACT-rational deterministic verification (the "VP=U" completion criterion) — passes where floats would fail,
//      fails a wrong identity, and drives the honest self-check note
//   #5 the sample-image behaviour, hermetically: a math answer renders KaTeX + a "verified" note AND is non-mappable
//      (Problem/Thus/Let U never become places), while a geographic answer stays mappable
//   #6 send/stop button = accent when active/busy, previous white/black when idle
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

/* ⚠ (#R224) `katex` IS NOT A BOOT GLOBAL ANY MORE — 258 kB + its stylesheet, on every session, for a
   feature most sessions never reach. It is keyed to its first use (`window.IntMapVendor.katex()`), so
   this spec asks for it in beforeAll below rather than waiting for a boot that no longer fetches it. */
const CRITICAL = ['IntMapConsole', 'IntMapAtlasDebug'];
test.describe.configure({ mode: 'serial' });

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);   // allows unpkg + jsDelivr (KaTeX) through, blocks everything else
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction((g) => g.every((k) => typeof window[k] !== 'undefined'), CRITICAL, { timeout: 45_000 });
  await page.evaluate(() => window.IntMapVendor.katex());
  await page.waitForFunction(() => !!(window.katex && window.katex.renderToString), null, { timeout: 45_000 });
  await page.waitForTimeout(500);
  // (#R170) #2 asserts on COMPUTED styles from the Atlas reply stylesheet, which Atlas injects when its
  // panel is first built (ensure() → ensureStyle()). Until #R170 the desktop booted straight into
  // workspace mode, where the Atlas window is constructed at boot, so the stylesheet happened to be
  // present without anyone opening Atlas. Desktop now defaults to normal mode, so open Atlas the way a
  // user does and wait for the stylesheet — that is the precondition this test always needed, rather
  // than an incidental side effect of the old default. (Verified in a browser: opening the tab injects
  // the CSS and a reply rendered in the tab feed computes overflow-x:auto exactly as before.)
  await page.evaluate(() => { try { window.IntMapOS.exec('tab.atlas', { source: 'test' }); } catch (_) { } });
  await page.waitForFunction(() => [...document.styleSheets].some(sh => {
    try { return [...sh.cssRules].some(r => r.selectorText === '.atl-math-b'); } catch (_) { return false; }
  }), null, { timeout: 20_000 });
});
test.afterAll(async () => { await page?.context()?.close(); });

test('#1 boot: KaTeX loaded, unified renderer present, no page errors', async () => {
  /* ⚠ (#R224) KATEX IS NO LONGER FETCHED AT BOOT — 258 kB + its stylesheet on every session for a
     feature most sessions never reach. It is keyed to its first use (`window.IntMapVendor.katex()`,
     src/vendor.js), and js/atlas-reply.js asks for it when a reply actually carries LaTeX. So this
     spec asks the same way; what it is defending — «KaTeX renders, and nothing threw» — is unchanged. */
  const r = await page.evaluate(() => ({
    katex: typeof window.katex,
    render: !!(window.katex && window.katex.renderToString),
    debug: typeof window.IntMapAtlasDebug,
    md: typeof (window.IntMapAtlasDebug && window.IntMapAtlasDebug.mdMini),
  }));
  expect(r.katex).toBe('object');
  expect(r.render).toBe(true);
  expect(r.md).toBe('function');
  expect(diag.pageErrors, diag.pageErrors.join('\n')).toEqual([]);
});

test('#2 unified renderer: matrix→KaTeX, code block, table', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    const host = document.createElement('div'); host.id = 'r156-render'; document.body.appendChild(host);
    host.innerHTML = D.mdMini(
      '## Section\n\nDisplay: $$P=\\begin{pmatrix}\\frac12 & 2\\\\ \\frac1{22} & -\\frac{5}{22}\\end{pmatrix}$$\n\ninline \\(V^{-1}U\\) and `x=1`.\n\n```js\nconst a = 1 < 2 && "x";\n```\n\n| A | B |\n|---|--:|\n| 1 | 2 |'
    );
    return {
      katexEls: host.querySelectorAll('.katex').length,
      katexErrors: host.querySelectorAll('.katex-error').length,
      hasFracLine: host.querySelectorAll('.katex .frac-line').length > 0,
      mathScroll: (() => { const m = host.querySelector('.atl-math-b'); return m ? getComputedStyle(m).overflowX : null; })(),
      codeCopy: !!host.querySelector('.atl-codecopy'),
      /* (#R494) the code is token-coloured now, so `1 < 2` is no longer one contiguous run of text.
         The claim is unchanged and stated exactly: the ONLY markup inside <code> is our own spans. */
      codeEscaped: (() => { const h = host.querySelector('.atl-codeblock code')?.innerHTML || '';
        return h.includes('&lt;') && !/<(?!\/?span[ >])/.test(h); })(),
      codeNotExecuted: !host.querySelector('.atl-codeblock code b, .atl-codeblock code i'),
      inlineCode: !!host.querySelector('.atl-code-i'),
      table: !!host.querySelector('.atl-md-table th'),
      tableScroll: (() => { const t = host.querySelector('.atl-tablewrap'); return t ? getComputedStyle(t).overflowX : null; })(),
      /* (#R494) the heading is a real <h2> styled by CSS, not a <div> carrying an inline font-size */
      heading: (() => { const h = host.querySelector('h2.atl-h2'); if (!h) return false;
        return parseFloat(getComputedStyle(h).fontSize) > parseFloat(getComputedStyle(host).fontSize) * 1.4; })(),
    };
  });
  expect(r.katexEls).toBeGreaterThan(0);
  expect(r.katexErrors).toBe(0);
  expect(r.hasFracLine).toBe(true);
  expect(r.mathScroll).toBe('auto');
  expect(r.codeCopy).toBe(true);
  expect(r.codeEscaped).toBe(true);
  expect(r.codeNotExecuted).toBe(true);
  expect(r.inlineCode).toBe(true);
  expect(r.table).toBe(true);
  expect(r.tableScroll).toBe('auto');
  expect(r.heading).toBe(true);
});

test('#3 content-class spine + geo gate', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    return {
      cls: { math: D.contentClass('math'), doc: D.contentClass('Document/Table'), code: D.contentClass('code snippet'), geo: D.contentClass('geographic'), photo: D.contentClass('photo'), lang: D.contentClass('grammar') },
      map: { math: D.shouldMap('math'), doc: D.shouldMap('document'), code: D.shouldMap('code'), photo: D.shouldMap('photo'), lang: D.shouldMap('language'), geo: D.shouldMap('geographic'), empty: D.shouldMap('') },
    };
  });
  // classification
  expect(r.cls.math).toBe('math');
  expect(r.cls.doc).toBe('document');
  expect(r.cls.code).toBe('code');
  expect(r.cls.geo).toBe('geographic');
  expect(r.cls.photo).toBe('photo');
  expect(r.cls.lang).toBe('language');
  // gate — ONLY geographic (and unclassified, so plain-text geo answers don't regress) maps
  expect(r.map.math).toBe(false);
  expect(r.map.doc).toBe(false);
  expect(r.map.code).toBe(false);
  expect(r.map.photo).toBe(false);
  expect(r.map.lang).toBe(false);
  expect(r.map.geo).toBe(true);
  expect(r.map.empty).toBe(true);
});

test('#4 exact-rational deterministic verification (VP=U class of check)', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    // (1/3 + 1/3 + 1/3) = 1 EXACTLY — floats give 0.9999… ≠ 1; the exact-rational verifier must accept it.
    const exact = D.verifyChecks([{ type: 'matmul', label: 'sum of thirds', a: [['1/3', '1/3', '1/3']], b: [[1], [1], [1]], expect: [[1]] }]);
    // a genuinely correct product with mixed fractions
    const pass = D.verifyChecks([{ type: 'matmul', label: 'V·P=U', a: [['1/2', '1/2'], [1, 0]], b: [[2, 0], [0, 2]], expect: [[1, 1], [2, 0]] }]);
    // a WRONG identity must fail
    const fail = D.verifyChecks([{ type: 'matmul', label: 'bad', a: [[2, 0], [0, 3]], b: [[1, 1], [1, 1]], expect: [[2, 2], [3, 4]] }]);
    // the note reflects pass vs fail honestly
    const okNote = D.checksNote(pass), badNote = D.checksNote(fail);
    return { exact, pass, fail, okNote, badNote };
  });
  expect(r.exact).toMatchObject({ ran: 1, passed: 1 });
  expect(r.exact.failed.length).toBe(0);
  expect(r.pass).toMatchObject({ ran: 1, passed: 1 });
  expect(r.fail).toMatchObject({ ran: 1, passed: 0 });
  expect(r.fail.failed.length).toBe(1);
  expect(r.okNote).toContain('atl-check ok');
  expect(r.badNote).toContain('atl-check bad');
});

test('#5 sample-image behaviour (hermetic): math answer renders math + verified note AND is non-mappable', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    // Simulate the model's vision output for the linear-algebra sheet (the "sample image").
    const answerMd = [
      '## Solution',
      'The transition matrix is \\(P = V^{-1}U\\):',
      '$$P=\\begin{pmatrix}\\tfrac12 & 2 & \\tfrac12\\\\ \\tfrac1{22} & \\tfrac1{11} & \\tfrac{7}{22}\\end{pmatrix}$$',
      'Thus, by Problem 3, Let U and V be as given.',   // words that MUST NOT become map places
    ].join('\n\n');
    const contentClass = D.contentClass('math');
    const checks = D.verifyChecks([{ type: 'matmul', label: 'V·P = U', a: [[1, 0], [0, 1]], b: [['1/2', 2], ['1/22', '1/11']], expect: [['1/2', 2], ['1/22', '1/11']] }]);
    const host = document.createElement('div'); document.body.appendChild(host);
    host.innerHTML = D.mdMini(answerMd) + D.checksNote(checks);
    return {
      mappable: D.shouldMap(contentClass),   // MUST be false → _pinReplyPlaces is never called for this answer
      katexEls: host.querySelectorAll('.katex').length,
      verified: !!host.querySelector('.atl-check.ok'),
      // the answer text obviously contains capitalised "Problem"/"Thus"/"Let U and V" — none may be geocoded because
      // the class gate blocks extraction entirely; there is no mapping note in a math reply.
      noMapNote: !/place.*mapped|未配置|ambiguous|couldn/i.test(host.textContent),
    };
  });
  expect(r.mappable).toBe(false);
  expect(r.katexEls).toBeGreaterThan(0);
  expect(r.verified).toBe(true);
  expect(r.noMapNote).toBe(true);

  // a GEOGRAPHIC answer is still mappable (no regression)
  const geo = await page.evaluate(() => window.IntMapAtlasDebug.shouldMap('geographic'));
  expect(geo).toBe(true);
});

test('#6 send/stop button accent (idle keeps white/black)', async () => {
  const r = await page.evaluate(() => {
    try { window.IntMapConsole?.open?.(); } catch { /* ignore */ }
    const go = document.querySelector('#atlas-panel .atl-go');
    if (!go) return { err: 'no button' };
    const read = (cls) => { go.className = cls; go.style.transition = 'none'; void go.offsetWidth; const c = getComputedStyle(go).backgroundColor; go.style.transition = ''; return c; };
    // resolve the accent to an rgb string, theme-independently (the accent differs light vs dark)
    const probe = document.createElement('div'); probe.style.background = 'var(--primary-color)'; document.body.appendChild(probe);
    const accent = getComputedStyle(probe).backgroundColor; probe.remove();
    const res = { idle: read('atl-go idle'), active: read('atl-go'), busy: read('atl-go busy'), accent };
    go.className = 'atl-go idle';
    return res;
  });
  expect(r.err).toBeUndefined();
  expect(r.idle).toBe('rgb(255, 255, 255)');   // empty input → previous white/black look
  expect(r.active).not.toBe('rgb(255, 255, 255)');   // has text → NOT white
  expect(r.active).toBe(r.accent);              // has text → the accent colour
  expect(r.busy).toBe(r.accent);                // Stop → the accent colour
});
