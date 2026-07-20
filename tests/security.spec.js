// ============================================================================
//  IntMap — SECURITY tests (#R138). Runs in a REAL browser (Chromium) so the
//  assertions prove BROWSER behaviour, not just string shape:
//    • window.IntMapSafe.html() neutralises every payload from the security
//      commission (§6) — when its output is inserted into the live DOM, NO script
//      runs and NO active element (<script>/<img onerror>/<svg onload>) is created.
//    • window.IntMapSafe.url() blocks javascript:/data:text-html/vbscript: and
//      allows only http(s)/mailto/tel (+ raster data:image, never SVG).
//    • The SAME payloads, once neutralised, still DISPLAY correctly — and so do
//      Japanese / German / Russian / Spanish / emoji / Cyrillic / accents / long
//      place names (the commission's i18n requirement).
//    • The pragmatic CSP meta is present (object-src 'none' + base-uri 'self').
//  These map 1:1 to the sinks fixed in this round (community, news, webcam,
//  place-search, profiles, popups) — every one now routes untrusted text through
//  IntMapSafe, so proving IntMapSafe + real DOM parsing covers them all.
// ============================================================================
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';

// The exact hostile inputs listed in the commission (§6) + a quote-breakout case.
const XSS_PAYLOADS = [
  '<script>window.__xss = true</script>',
  '<img src=x onerror="window.__xss = true">',
  '<svg onload="window.__xss = true">',
  '"><img src=x onerror=window.__xss=true>',
  '</style><script>window.__xss=true</script>',
  'x" onmouseover="window.__xss=true',        // attribute-breakout attempt
  "x' onmouseover='window.__xss=true",        // single-quote attribute-breakout
];
const URL_BLOCK = [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'JavaScript:alert(1)',
  'java\tscript:alert(1)',
  '  javascript:alert(1)',
  'vbscript:msgbox(1)',
  'data:image/svg+xml,<svg onload=alert(1)>',
];
const URL_ALLOW = [
  'https://example.com/a?b=1#c',
  'http://example.org/x',
  'mailto:a@b.com',
];
// Must survive intact through html() (display correctness across languages).
const I18N = [
  '日本語のニュース見出し',
  'Zürich Straße Größe',
  'Москва — Санкт-Петербург',
  'España, Peñíscola, ñ',
  '🇯🇵🔥🌏 emoji headline',
  'Kōbe · Ōsaka · Đà Nẵng · İstanbul',
  'A very long place name '.repeat(8).trim(),
];

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // IntMapSafe is defined in the FIRST head script, so it is ready almost immediately;
  // still wait for it explicitly so a regression that removes/moves it fails loudly.
  await page.waitForFunction(() => typeof window.IntMapSafe === 'object' && !!window.IntMapSafe.html, null, { timeout: 45_000 });
});

test.afterAll(async () => { await page?.context()?.close(); });

test('IntMapSafe is defined globally with html() and url()', async () => {
  const shape = await page.evaluate(() => ({
    html: typeof window.IntMapSafe?.html,
    url: typeof window.IntMapSafe?.url,
    esc: typeof window.IntMapSafe?.esc,
  }));
  expect(shape).toEqual({ html: 'function', url: 'function', esc: 'function' });
});

test('escaped payloads never execute and never create an active element (real DOM)', async () => {
  const result = await page.evaluate((payloads) => {
    const out = [];
    for (const p of payloads) {
      window.__xss = false;
      const host = document.createElement('div');
      document.body.appendChild(host);
      // Reproduce the fixed sinks: text context AND double/single-quoted attribute context.
      host.innerHTML =
        '<div>' + window.IntMapSafe.html(p) + '</div>' +
        '<a title="' + window.IntMapSafe.html(p) + '">t</a>' +
        "<span data-x='" + window.IntMapSafe.html(p) + "'>s</span>" +
        '<div style="background:url(\'' + window.IntMapSafe.html(window.IntMapSafe.url(p, { allowData: true })) + '\')">b</div>';
      // Force any lazy <img onerror>/<svg onload> to attempt to run.
      void host.getBoundingClientRect();
      out.push({ p, xss: window.__xss, imgs: host.querySelectorAll('img').length, svgs: host.querySelectorAll('svg').length, scripts: host.querySelectorAll('script').length });
      host.remove();
    }
    // settle a tick so any async onerror would have fired
    return new Promise((r) => setTimeout(() => r(out), 50));
  }, XSS_PAYLOADS);
  for (const r of result) {
    expect(r.xss, `payload executed: ${r.p}`).toBe(false);
    expect(r.imgs, `live <img> created for: ${r.p}`).toBe(0);
    expect(r.svgs, `live <svg> created for: ${r.p}`).toBe(0);
    expect(r.scripts, `live <script> created for: ${r.p}`).toBe(0);
  }
  // A final global check: nothing ever set the canary during the whole pass.
  expect(await page.evaluate(() => window.__xss)).toBe(false);
});

test('IntMapSafe.url() blocks dangerous schemes', async () => {
  const blocked = await page.evaluate((urls) => urls.map((u) => window.IntMapSafe.url(u)), URL_BLOCK);
  for (let i = 0; i < URL_BLOCK.length; i++) {
    expect(blocked[i], `scheme NOT blocked: ${URL_BLOCK[i]}`).toBe('');
  }
  // data:image/svg is blocked even with allowData; raster data:image is allowed.
  const svgBlocked = await page.evaluate(() => window.IntMapSafe.url('data:image/svg+xml;base64,x', { allowData: true }));
  expect(svgBlocked).toBe('');
  const pngOk = await page.evaluate(() => window.IntMapSafe.url('data:image/png;base64,iVBORw0KG', { allowData: true }));
  expect(pngOk).toBe('data:image/png;base64,iVBORw0KG');
});

test('IntMapSafe.url() allows safe schemes unchanged', async () => {
  const allowed = await page.evaluate((urls) => urls.map((u) => window.IntMapSafe.url(u)), URL_ALLOW);
  expect(allowed).toEqual(URL_ALLOW);
});

test('i18n: escaping preserves JP/DE/RU/ES/emoji/accents intact', async () => {
  const rendered = await page.evaluate((samples) => samples.map((s) => {
    const d = document.createElement('div');
    d.innerHTML = window.IntMapSafe.html(s);   // escape then let the browser decode back to text
    return d.textContent;
  }), I18N);
  // Round-trip through escape + DOM text must equal the original (no corruption, no loss).
  expect(rendered).toEqual(I18N);
});

test('a pragmatic CSP is present (object-src none, base-uri self)', async () => {
  const csp = await page.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy" i]');
    return m ? m.getAttribute('content') : null;
  });
  expect(csp, 'CSP meta present').toBeTruthy();
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
});

test('no uncaught exceptions while running the security probes', async () => {
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});
