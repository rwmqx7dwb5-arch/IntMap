// R159 behavioural checks in a real browser.
// (1) Atlas reply markdown renders with NO bold and NO horizontal divider.
// (4) Toggling the LEFT sidebar does not visually pan the map (the edge anchor holds a fixed geo-point in place).
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } }); // desktop → sidebar is a flex sibling, anchor path active
  await installHermeticRouting(context);
  // Force CLASSIC (non-workspace) mode: desktop otherwise defaults to ws-mode where the sidebar is a floating
  // window and the classic #sidebar is display:none — there the sidebar never reflows the map. The map-move the
  // anchor fixes only happens in classic mode (ws-mode off), so opt out via the persisted preference.
  await context.addInitScript(() => { try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); } catch { /* ignore */ } });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.IntMapAtlasDebug !== 'undefined' && typeof window.IntMapAtlasDebug.mdMini === 'function' && !!document.getElementById('map'),
    null,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R159 #1 Atlas markdown renders with no bold and no divider line', async () => {
  const out = await page.evaluate(() =>
    window.IntMapAtlasDebug.mdMini('This is **bold** text and a key **term**.\n\n## Section Heading\n\n### Subheading\n\n# Big Title\n\nA closing sentence.'),
  );
  // (1) no bold anywhere in the reply body
  expect(out, 'no inline <b>').not.toContain('<b>');
  expect(out, 'no <strong>').not.toContain('<strong>');
  expect(out, 'no heavy 800 weight').not.toContain('font-weight:800');
  expect(out, 'no heavy 750 weight').not.toContain('font-weight:750');
  // the emphasised words survive as plain text (only the ** markers are stripped)
  expect(out).toContain('bold');
  expect(out).toContain('term');
  // (2) no horizontal divider line (the old "## " top-rule is removed)
  expect(out, 'no divider hairline').not.toContain('border-top');
  // headings still exist, differentiated by SIZE (semibold, not bold)
  expect(out).toContain('font-weight:600');
  expect(out).toContain('Section Heading');
});

test('R159 #4 toggling the LEFT sidebar does not visually move the map', async () => {
  await page.waitForFunction(() => !!(window.__imap && typeof window.__imap.project === 'function'), null, { timeout: 25_000 });
  // classic (non-ws) mode: the left #sidebar is a real flex sibling of #map-container
  const classic = await page.evaluate(() => !document.body.classList.contains('ws-mode') && !!document.getElementById('sidebar') && getComputedStyle(document.getElementById('sidebar')).display !== 'none');
  expect(classic, 'classic-mode flex sidebar present').toBeTruthy();

  // view a region at a normal zoom (as a user would when toggling the sidebar — not the fully-zoomed-out world).
  await page.evaluate(() => window.__imap.jumpTo({ center: [2.3, 48.85], zoom: 6 }));
  await page.waitForTimeout(500);
  // ensure the sidebar is OPEN (desktop default), then measure a fixed geo-point's absolute page position.
  await page.evaluate(() => { const sb = document.getElementById('sidebar'); if (sb && sb.classList.contains('collapsed')) document.getElementById('btn-toggle-sidebar').click(); });
  await page.waitForTimeout(700);

  const before = await page.evaluate(() => {
    const map = window.__imap; const mc = document.getElementById('map-container');
    const r = mc.getBoundingClientRect();
    const g = map.unproject([r.width * 0.72, r.height / 2]); // a point in the always-visible right portion
    const p = map.project(g);
    return { pageX: r.left + p.x, pageY: r.top + p.y, lng: g.lng, lat: g.lat, w: r.width };
  });

  // collapse the sidebar — the flex map-container grows on its LEFT edge
  await page.evaluate(() => document.getElementById('btn-toggle-sidebar').click());
  await page.waitForTimeout(900); // let the anchored resize loop settle

  const after = await page.evaluate((g) => {
    const map = window.__imap; const mc = document.getElementById('map-container');
    const r = mc.getBoundingClientRect();
    const p = map.project({ lng: g.lng, lat: g.lat });
    return { pageX: r.left + p.x, pageY: r.top + p.y, w: r.width };
  }, before);

  // the container genuinely resized (sidebar collapsed) …
  expect(Math.abs(after.w - before.w), `container width changed (${before.w}→${after.w})`).toBeGreaterThan(50);
  // … yet the fixed geo-point stayed at ~the same absolute screen position (anchor). An uncompensated
  // re-centre would shift it by ~sidebarWidth/2 (>120px); the anchor keeps it within a few px.
  expect(Math.abs(after.pageX - before.pageX), `map pan X drift ${Math.round(after.pageX - before.pageX)}px`).toBeLessThan(40);
  expect(Math.abs(after.pageY - before.pageY), `map pan Y drift ${Math.round(after.pageY - before.pageY)}px`).toBeLessThan(40);

  // no exceptions from the animation machinery
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});
